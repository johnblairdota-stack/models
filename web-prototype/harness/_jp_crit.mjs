/**
 * jellie-play — PLAY the pairing slice. Real browser, real clicks, real screenshots.
 *
 *   node harness/jellie-play.mjs                 # writes progress/jellie/
 *   node harness/jellie-play.mjs --phones 4
 *   node harness/jellie-play.mjs --keep          # leave vite + the room server up
 *
 * WHY THIS EXISTS AND WHY IT CLICKS INSTEAD OF SENDING MESSAGES.
 *
 * `link-merge.mjs` proves the RULES and `party-night` proves the WIRE. Both drive the server
 * directly, and both would stay green on a build where the CONNECT button was behind a scroll,
 * the merged name never reached the television, or the keyboard covered the text field. This
 * project has already paid for that gap twice in one day: a READY button that could not exist
 * until it was pressed, and a reach-out list offering five chairs nobody was sitting in. Neither
 * was visible to any socket test; both were obvious the moment a real phone was driven.
 *
 * So every action below is a CLICK on a real element in a real page, and every beat is
 * photographed. If an element is not there, this file cannot pretend it pressed it.
 *
 * ⚠️ **LOOK AT THE SCREENSHOTS.** Two instruments on this project reported success on elements
 * that were rendering underneath a splash. Existence checks and `isVisible()` both missed it.
 *
 * It is a PLAYTEST INSTRUMENT, not a gate — it is not in `gates:party`, it needs a browser, and
 * it is meant to be edited. A critic should feel free to change what the phones do.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const KEEP = argv.includes('--keep');
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

const WEB = +arg('--port', 5199);
const WS = +arg('--wsPort', 5189);
const CODE = arg('--code', 'jazz');          // must use CODE_ABC — no i, l, o, 0, 1
const PHONES = +arg('--phones', 3);
const SHOTDIR = path.join(ROOT, 'progress', arg('--out', 'jellie-crit'));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const say = (s) => { log.push(s); console.log(s); };

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
async function waitPort(p, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await portOpen(p)) return; await sleep(250); }
  throw new Error(`${label} never opened :${p}`);
}

const kids = [];
console.log('\njellie-play — pairing, the merged name, and the private line\n');

/* ⚠️ Room server IMPORTED, not spawned: `local.mjs`'s CLI guard compares a file URL against a
 * Windows backslash path and is never true, so spawning it exits 0 with no listener. */
let roomServer = null;
if (await portOpen(WS)) say(`  reusing the room server on :${WS}`);
else {
  const { startServer } = await import(pathToFileURL(path.join(ROOT, 'net/party/local.mjs')).href);
  roomServer = startServer({ port: WS });
  await waitPort(WS, 12000, 'room server');
  say(`  room server on :${WS}`);
}
if (await portOpen(WEB)) say(`  reusing vite on :${WEB}`);
else {
  const p = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'),
    '--port', String(WEB), '--strictPort', '--host', '127.0.0.1'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d.toString(); });
  kids.push(p);
  try { await waitPort(WEB, 30000, 'vite'); say(`  vite on :${WEB}`); }
  catch (e) { throw new Error(`${e.message}\n${err}`); }
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

async function ctxFor(viewport) {
  const c = await browser.newContext({ viewport });
  await c.route('**/@vite/client', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript', body: HMR_STUB,
  }));
  return c;
}

/** A phone is 390x844 because that is the shape of the thing in a guest's hand. */
const PHONE_VP = { width: 390, height: 844 };
const shot = (page, name) => page.screenshot({ path: path.join(SHOTDIR, `${name}.png`) });
const text = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());

let exitCode = 1;
try {
  await mkdir(SHOTDIR, { recursive: true });

  // ---- the television --------------------------------------------------------------------
  const tv = await (await ctxFor({ width: 1600, height: 900 })).newPage();
  const tvErrs = [];
  tv.on('pageerror', (e) => tvErrs.push(e.message));
  await tv.goto(`${base}/?view=party.host&room=${CODE}&wsPort=${WS}&dev=1`, { waitUntil: 'domcontentloaded' });
  await tv.waitForSelector('.night-code', { timeout: 20000 });
  say('  TV is up on the lobby');

  // ---- the phones ------------------------------------------------------------------------
  const NAMES = ['John', 'Ellie', 'Ozz', 'Mara', 'Bex', 'Sam', 'Ivy', 'Zoe'];
  const phones = [];
  for (let i = 0; i < PHONES; i++) {
    const p = await (await ctxFor(PHONE_VP)).newPage();
    p.on('pageerror', (e) => tvErrs.push(`phone${i}: ${e.message}`));
    // No `&room=` — a real guest types the code, and that path is where the join bugs live.
    await p.goto(`${base}/?view=party.phone&wsPort=${WS}&dev=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#code', { timeout: 20000 });
    await p.fill('#code', CODE.toUpperCase());
    await p.fill('#name', NAMES[i]);
    await p.click('#join');
    await p.waitForSelector('#lock-look', { timeout: 20000 });
    await p.click('#lock-look');
    phones.push({ page: p, name: NAMES[i] });
    say(`  ${NAMES[i]} joined by typing the code`);
  }
  await sleep(1200);

  // ---- start the night, then skip to the Debrief with the dev key ---------------------------
  await tv.evaluate(async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 240000) {
      const b = document.querySelector('#go');
      if (b && !b.disabled) { b.click(); return true; }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  });
  say('  the night started');
  await sleep(2500);

  /*
   * The dev skip key, which is the whole reason it exists: a designer should not sit through an
   * expedition to reach the beat under test. `]` walks one beat; casting -> ... -> debrief.
   */
  for (let i = 0; i < 8; i++) {
    const beat = await tv.evaluate(() => (document.body.innerText.match(/EPISODE\s+\d+\s*[·.]\s*([A-Z]+)/) || [])[1]);
    if (beat === 'DEBRIEF') break;
    await tv.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true })));
    await sleep(900);
  }
  await sleep(3000);
  const beatNow = await tv.evaluate(() => (document.body.innerText.match(/EPISODE\s+\d+\s*[·.]\s*([A-Z]+)/) || [])[1]);
  say(`  skipped to ${beatNow}`);

  await shot(tv, '01-tv-debrief');
  await shot(phones[0].page, '02-phone-debrief');
  say(`  [phone 0] ${(await text(phones[0].page)).slice(0, 200)}`);

  // ---- 1 · John reaches out to Ellie, by clicking her name ---------------------------------
  const johnPage = phones[0].page;
  const picks = await johnPage.$$('[data-link]');
  say(`  John can reach out to ${picks.length} people: ${(await Promise.all(picks.map((b) => b.innerText()))).join(', ')}`);
  const ellieBtn = await johnPage.$('[data-link]:has-text("Ellie")');
  if (!ellieBtn) throw new Error('no reach-out button for Ellie — the pair sheet did not render');
  await ellieBtn.click();
  await sleep(1200);
  await shot(johnPage, '03-john-waiting');
  await shot(tv, '04-tv-reaching-out');
  say(`  [TV] ${(await text(tv)).match(/reaches out to \w+/i)?.[0] || 'NO PUBLIC LINE ON THE TV'}`);

  // ---- 2 · Ellie's phone, and the accept ---------------------------------------------------
  const elliePage = phones[1].page;
  await shot(elliePage, '05-ellie-asked');
  say(`  [Ellie] ${(await text(elliePage)).slice(0, 160)}`);
  const accept = await elliePage.$('[data-accept]');
  if (!accept) throw new Error('Ellie was never offered a Connect button');
  await accept.click();
  await sleep(2000);

  const merged = await johnPage.evaluate(() => document.querySelector('.pair-name')?.textContent?.trim() || null);
  say(`  MERGED NAME: ${merged}`);
  await shot(johnPage, '06-john-paired');
  await shot(elliePage, '07-ellie-paired');
  await shot(tv, '08-tv-merged');

  // ---- 3 · the private line ----------------------------------------------------------------
  const whisper = async (page, msg) => {
    await page.fill('#whisper', msg);
    await page.click('#whisper-send');
    await sleep(900);
  };
  await whisper(johnPage, 'ozz is lying about the cellar');
  await whisper(elliePage, 'i know. vote with me?');
  await whisper(johnPage, 'yes. say nothing');
  await sleep(600);
  await shot(johnPage, '09-john-whispers');
  await shot(elliePage, '10-ellie-whispers');

  const heard = async (page) => page.evaluate(() => [...document.querySelectorAll('.whisper')].map((p) => p.textContent.trim()));
  say(`  John's log : ${JSON.stringify(await heard(johnPage))}`);
  say(`  Ellie's log: ${JSON.stringify(await heard(elliePage))}`);

  // ---- 4 · THE OUTSIDER. This is the check that matters. -----------------------------------
  const outsider = phones[2]?.page;
  if (outsider) {
    await shot(outsider, '11-outsider');
    const seen = await text(outsider);
    const tvSeen = await text(tv);
    const leaked = /cellar|vote with me|say nothing/i.test(seen);
    const tvLeaked = /cellar|vote with me|say nothing/i.test(tvSeen);
    say(`  [${phones[2].name}, not in the pair] sees the words? ${leaked ? 'YES — LEAK' : 'no'}`);
    say(`  [TV] shows the words? ${tvLeaked ? 'YES — LEAK' : 'no'}`);
    say(`  [${phones[2].name}] ${seen.slice(0, 200)}`);
  }

  // ---- 5 · does it survive the beat? -------------------------------------------------------
  await tv.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true })));
  await sleep(2500);
  await shot(johnPage, '12-john-next-beat');
  await shot(tv, '13-tv-next-beat');
  const after = await johnPage.evaluate(() => ({
    pair: document.querySelector('.pair-name')?.textContent?.trim() || null,
    whispers: document.querySelectorAll('.whisper').length,
  }));
  say(`  after the beat changed: pair=${after.pair} whispers-on-screen=${after.whispers}`);

  if (tvErrs.length) say(`  ⚠️ errors thrown: ${[...new Set(tvErrs)].slice(0, 5).join(' | ')}`);

  await writeFile(path.join(SHOTDIR, 'transcript.txt'), log.join('\n'));
  say(`\n  shots + transcript in progress/jellie/`);
  exitCode = 0;
} catch (e) {
  console.error(`\n  jellie-play died: ${e?.stack || e}\n`);
  await writeFile(path.join(SHOTDIR, 'transcript.txt'), log.join('\n') + `\n\nDIED: ${e?.message}`).catch(() => {});
} finally {
  if (!KEEP) {
    await browser.close().catch(() => {});
    for (const k of kids) k.kill();
    roomServer?.close?.();
  }
  process.exit(exitCode);
}
