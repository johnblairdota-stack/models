#!/usr/bin/env node
/**
 * talk-frames — photograph the TALK BEATS on a real 1920x1080 television.
 *
 *   node harness/talk-frames.mjs                 # writes progress/talk/
 *   node harness/talk-frames.mjs --keep          # leave vite and the room server up
 *
 * WHY THIS FILE EXISTS. Two of John's notes are about pixels that no headless gate can see:
 * the Recap card SCROLLS off a 1080p screen, and the talk overlays are painted straight over the
 * seated robots in the ballroom. Both are claims about where ink lands relative to a rendered
 * frame, so both need a browser, a warmed mansion and a screenshot.
 *
 * It also measures the two facts a redesign has to hold, so the fix can be re-checked rather than
 * re-eyeballed:
 *
 *   R1  the Recap beat fits its frame — `.night-main` does not scroll
 *   R2  the seated robots' band is CLEAR — no overlay ink inside the chair box
 *
 * Sibling of `party-playtest-drive.mjs`; same boot, same swiftshader args, same reason it is out
 * of `gates:party` (it needs `npm install` and a browser).
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const KEEP = argv.includes('--keep');
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

const WEB = +arg('--port', 5196);
const WS = +arg('--wsPort', 5186);
const CODE = arg('--code', 'tkfm');
const SHOTDIR = path.join(ROOT, 'progress', 'talk');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return c;
};

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 700);
});
async function waitPort(p, ms, label) {
  const t0 = Date.now();
  while (!(await portOpen(p))) {
    if (Date.now() - t0 > ms) throw new Error(`${label} never opened :${p}`);
    await sleep(250);
  }
}

const kids = [];
console.log('\ntalk-frames — Recap and the talk overlays, photographed on a 1080p television\n');

/*
 * ⚠️ THE ROOM SERVER IS STARTED IN-PROCESS, NOT SPAWNED. `net/party/local.mjs` guards its CLI
 * block with `import.meta.url === 'file://' + process.argv[1]`, and on Windows argv[1] is a
 * backslash path (`C:\...`) that never equals the forward-slash file URL — so spawning the file
 * exits silently with the port never opening. Importing `startServer` is the same server without
 * depending on how the platform spells a path.
 */
let roomServer = null;
if (await portOpen(WS)) console.log(`  reusing the room server on :${WS}`);
else {
  console.log(`  starting the room server on :${WS} …`);
  const { startServer } = await import(pathToFileURL(path.join(ROOT, 'net/party/local.mjs')).href);
  roomServer = startServer({ port: WS });
  await waitPort(WS, 12000, 'room server');
}
if (await portOpen(WEB)) console.log(`  reusing vite on :${WEB}`);
else {
  console.log(`  starting vite on :${WEB} …`);
  const p = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'),
    '--port', String(WEB), '--strictPort', '--host', '127.0.0.1'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d.toString(); });
  kids.push(p);
  try { await waitPort(WEB, 30000, 'vite'); } catch (e) { throw new Error(`${e.message}\n${err}`); }
}

const base = `http://127.0.0.1:${WEB}`;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const HMR_STUB = `const noop = () => {};
export const createHotContext = () => ({ accept: noop, acceptExports: noop, dispose: noop,
  prune: noop, decline: noop, invalidate: noop, on: noop, off: noop, send: noop, data: {} });
export const updateStyle = (id, c) => { let e = document.querySelector('style[data-vite-dev-id="'+id+'"]');
  if (!e) { e = document.createElement('style'); e.setAttribute('data-vite-dev-id', id); document.head.appendChild(e); }
  e.textContent = c; };
export const removeStyle = (id) => { document.querySelector('style[data-vite-dev-id="'+id+'"]')?.remove(); };
export const injectQuery = (u) => u;
export const ErrorOverlay = class {};`;

async function seat(name = null, viewport = { width: 430, height: 900 }) {
  const c = await browser.newContext({ viewport });
  await c.route('**/@vite/client', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript', body: HMR_STUB,
  }));
  if (name) await c.addInitScript((n) => localStorage.setItem('rrr.party.name', n), name);
  return c;
}

/*
 * 🚨 **THE SPARE SOCKET NO LONGER WORKS, AND THAT IS A SECURITY FIX, NOT A REGRESSION.**
 *
 * This used to open an anonymous socket and send `{t:'show', beat}`. That branch on the server
 * had no `isTV` guard, so ANY seated phone could drive the whole room's night — an adversarial
 * playtester sent `{t:'show', beat:'vote'}` from an ordinary handset and wiped two live private
 * conversations mid-sentence, repeatably. The guard is now there.
 *
 * So the beat is driven the way a person would: through the TELEVISION, using the `?dev=1` skip
 * key (`party-host.js`). It walks one beat per press and covers the whole night, including the
 * gaps `nextShowBeat` leaves at lobby/casting/expedition. Slower than a socket by a few hundred
 * milliseconds and honest about which surface is allowed to move the show.
 */
function cueVia(tv) {
  const press = () => tv.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true })));
  const beatNow = () => tv.evaluate(() => (document.body.innerText.match(/EPISODE\s+\d+\s*[·.]\s*([A-Z]+)/) || [])[1] || '');
  return {
    /** Walk forward until the named beat is on the rail, or give up after a full lap. */
    beat: async (want) => {
      for (let i = 0; i < 10; i++) {
        if ((await beatNow()).toLowerCase() === want) return true;
        await press();
        await sleep(700);
      }
      return (await beatNow()).toLowerCase() === want;
    },
    close: () => {},
  };
}

let exitCode = 1;
try {
  await mkdir(SHOTDIR, { recursive: true });

  const tvCtx = await seat(null, { width: 1920, height: 1080 });
  const tv = await tvCtx.newPage();
  await tv.goto(`${base}/?view=party.host&room=${CODE}&wsPort=${WS}&dev=1`, { waitUntil: 'domcontentloaded' });
  await tv.waitForSelector('.night-code', { timeout: 20000 });
  console.log('  TV is up on the lobby');

  // Five phones — the seated circle is the thing being photographed, so fill some chairs.
  for (const who of ['John', 'Ellie', 'Ozz', 'Mara', 'Bex']) {
    const c = await seat(who);
    const p = await c.newPage();
    await p.goto(`${base}/?view=party.phone&room=${CODE}&wsPort=${WS}`, { waitUntil: 'domcontentloaded' });
    // The pad opens on the join card unless a name is already stored; fill it either way.
    await p.waitForSelector('#join, #lock-look', { timeout: 20000 });
    if (await p.$('#join')) {
      await p.fill('#name', who);
      await p.click('#join');
    }
    await p.waitForSelector('#lock-look', { timeout: 20000 });
    await p.click('#lock-look');
    console.log(`  ${who} took a chair`);
  }
  await sleep(1200);

  // paint() rebuilds root.innerHTML on every socket message, so a Playwright click races the
  // repaint and reports the button detached. Dispatch it in-page, ONCE — every press re-sends
  // start+casting, and a retry loop starts the night several times over.
  await tv.evaluate(() => document.querySelector('#go')?.click());
  await sleep(1500);
  console.log('  host started the night');
  await sleep(2500);

  const cue = cueVia(tv);

  /** The ballroom bakes; a beat photographed before it is warm is a picture of a black box. */
  async function settle(ms = 7000) { await sleep(ms); }

  const measured = {};
  for (const beat of ['recap', 'debrief', 'reckoning', 'vote', 'execution']) {
    await cue.beat(beat);
    await sleep(900);
    await settle(beat === 'recap' ? 5000 : (beat === 'debrief' ? 26000 : 9000));
    await tv.screenshot({ path: path.join(SHOTDIR, `tv-${beat}.png`) });

    measured[beat] = await tv.evaluate(() => {
      const main = document.querySelector('.night-main');
      // The picture. `.talk-picture` is the shipped talk layout's well; `.talk-frame` is the
      // 16:9 plate inside it; `.intro-frame` is the casting/recap fallback.
      const frame = document.querySelector('.talk-frame, .intro-frame');
      const box = (el) => (el ? (({ x, y, width, height }) => ({ x, y, width, height }))(el.getBoundingClientRect()) : null);
      /*
       * Every leaf of CHROME — the top band, the side rail and the bottom band. The shipped fix
       * reserves those bands AROUND the picture rather than painting over it, so the claim to
       * test is that none of their ink lands on the picture's rect. Scanning the whole `.night`
       * (minus the masthead and the rail, which are above the stage by construction) catches an
       * absolutely-positioned leftover as well as a flex one.
       */
      const ink = [];
      const chrome = document.querySelectorAll(
        '.talk-chrome-top *, .talk-chrome-bot *, .talk-side *, .talk-overlay *');
      for (const el of chrome) {
        if (el.children.length) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        if (!el.textContent.trim() && !el.querySelector?.('svg') && el.tagName !== 'svg') continue;
        ink.push({ tag: el.className || el.tagName, ...box(el) });
      }
      return {
        scrollH: main?.scrollHeight ?? 0,
        clientH: main?.clientHeight ?? 0,
        scrolls: !!main && main.scrollHeight > main.clientHeight + 2,
        frame: box(frame),
        picture: box(document.querySelector('.talk-picture')),
        ink,
        vh: window.innerHeight,
        vw: window.innerWidth,
      };
    });
    const hook = await tv.evaluate(() => window.__rrrHost || null);
    const m = measured[beat];
    console.log(`  ${beat.padEnd(10)} main ${m.scrollH}/${m.clientH}${m.scrolls ? '  ← SCROLLS' : ''}`
      + `  frame ${m.frame ? `${Math.round(m.frame.width)}x${Math.round(m.frame.height)} @ ${Math.round(m.frame.x)},${Math.round(m.frame.y)}` : 'none'}`
      + `  ink ${m.ink.length}  sit=${hook?.sitCued} follow=${hook?.followMode}/${hook?.followLive}`);
  }


  console.log('');
  t('R1 · the Recap beat fits its frame with no scroll', !measured.recap.scrolls,
    `${measured.recap.scrollH}px of content in ${measured.recap.clientH}px`);

  /*
   * R1b — RECAP AT ITS FULL FACT COUNT. A fresh room's recap carries three facts because the
   * server has published no `end` yet, and three fit even in the old single-column layout. The
   * card that SCROLLED off John's television was the four-fact one: OUTCOME arrives on any real
   * run and pushed the stack past the viewport. So the grid is stressed here rather than trusted
   * — a clone of a fact card is appended and the beat is re-measured. Nothing is left behind.
   */
  await cue.beat('recap');
  await sleep(2500);
  const stressed = await tv.evaluate(() => {
    const wrap = document.querySelector('.recap');
    const main = document.querySelector('.night-main');
    if (!wrap || !main) return null;
    const before = wrap.children.length;
    const clone = wrap.firstElementChild?.cloneNode(true);
    if (!clone) return null;
    clone.setAttribute('data-stress', '1');
    clone.querySelector('.k') && (clone.querySelector('.k').textContent = 'Outcome');
    clone.querySelector('.v') && (clone.querySelector('.v').textContent = 'SMASHED');
    wrap.appendChild(clone);
    // Force layout, then read.
    const out = {
      facts: before + 1,
      scrollH: main.scrollHeight,
      clientH: main.clientHeight,
      scrolls: main.scrollHeight > main.clientHeight + 2,
    };
    clone.remove();
    return out;
  });
  if (!stressed) t('R1b · Recap at four facts', false, 'no .recap on screen');
  else {
    t('R1b · Recap still fits with the OUTCOME card a real run adds', !stressed.scrolls,
      `${stressed.facts} facts · ${stressed.scrollH}px in ${stressed.clientH}px`);
    measured.recapStressed = stressed;
  }

  /*
   * R2 — THE CHAIR BAND. The seated circle (`chair-seats.js`) sits in the middle of the ballroom
   * shot, so the middle of the shot is not available to chrome. Measured as a fraction of the
   * PICTURE rather than in pixels, so the claim survives a different television: chairs occupy
   * roughly the middle 46% of its height and the middle 76% of its width. Ink there is ink on a
   * face, and ink that merely touches the picture's edge is ink the frame will clip.
   */
  const CHAIR = { x0: 0.12, x1: 0.88, y0: 0.30, y1: 0.76 };
  for (const beat of ['debrief', 'reckoning', 'vote', 'execution']) {
    const m = measured[beat];
    const f = m.frame;
    if (!f) { t(`R2 ${beat} · chair band`, false, 'no picture on screen'); continue; }
    const bx0 = f.x + f.width * CHAIR.x0, bx1 = f.x + f.width * CHAIR.x1;
    const by0 = f.y + f.height * CHAIR.y0, by1 = f.y + f.height * CHAIR.y1;
    const hits = (x0, x1, y0, y1) => m.ink.filter((i) =>
      i.x < x1 && i.x + i.width > x0 && i.y < y1 && i.y + i.height > y0);
    const onChairs = hits(bx0, bx1, by0, by1);
    t(`R2 ${beat} · the seated robots' band is clear of chrome`, onChairs.length === 0,
      onChairs.length ? onChairs.slice(0, 4).map((o) => String(o.tag).split(' ')[0]).join(', ') : 'clear');

    /*
     * R3 — NOTHING IS CLIPPED BY THE PICTURE'S EDGE. This is the defect the first capture found:
     * chrome pinned to the full-width stage while the picture is a centred 16:9 frame, so the
     * frame's own edge cut the words in half ("Recko…", "CAME BA…"). Reserved bands must sit
     * wholly OUTSIDE the picture; an overlay must sit wholly inside it. Straddling the boundary
     * is the failure either way.
     */
    const straddling = m.ink.filter((i) => {
      const insideX = i.x >= f.x - 1 && i.x + i.width <= f.x + f.width + 1;
      const insideY = i.y >= f.y - 1 && i.y + i.height <= f.y + f.height + 1;
      const outside = i.x + i.width <= f.x + 1 || i.x >= f.x + f.width - 1
        || i.y + i.height <= f.y + 1 || i.y >= f.y + f.height - 1;
      return !outside && !(insideX && insideY);
    });
    t(`R3 ${beat} · no chrome straddles the picture's edge`, straddling.length === 0,
      straddling.length ? straddling.slice(0, 4).map((o) => String(o.tag).split(' ')[0]).join(', ') : 'clear');

    // R4 — the ballroom is still the picture. Reserved bands must not squeeze it to a letterbox.
    const share = (f.width * f.height) / (m.vw * m.vh);
    t(`R4 ${beat} · the ballroom still owns the screen`, share >= 0.34,
      `${Math.round(share * 100)}% of the television`);
  }

  // R5 — the talk beats fit the television too, not only Recap.
  for (const beat of ['debrief', 'reckoning', 'vote', 'execution']) {
    t(`R5 ${beat} · fits with no scroll`, !measured[beat].scrolls,
      `${measured[beat].scrollH}px of content in ${measured[beat].clientH}px`);
  }

  cue.close();

  await writeFile(path.join(SHOTDIR, 'measured.json'), JSON.stringify(measured, null, 2));
  console.log(`\n  shots + measured.json in progress/talk/\n  ${pass} ok · ${fail} fail\n`);
  exitCode = fail ? 1 : 0;
} catch (e) {
  console.error('\n  ' + String(e.message || e) + '\n');
} finally {
  if (!KEEP) {
    await browser.close().catch(() => {});
    for (const k of kids) k.kill();
    await roomServer?.close?.();
  } else {
    console.log('  --keep: vite and the room server are still up');
  }
}
process.exit(exitCode);
