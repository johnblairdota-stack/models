#!/usr/bin/env node
/**
 * party-follow-drive — drive a real sit-down night in Chromium and prove the TV is showing a
 * LIVE MANSION FOLLOW during expedition. Not lobby QR. Not black. Not a still.
 *
 *   node harness/party-follow-drive.mjs
 *   node harness/party-follow-drive.mjs --shots      # writes progress/follow/
 *   node harness/party-follow-drive.mjs --keep       # leave vite and the room server up
 *
 * `docs/slices/task-d13-tv-follow.md` §4.2.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS IS NOT IN `gates:party`
 * ---------------------------------------------------------------------------------------------
 * It needs playwright and a browser, and `.github/workflows/gates.yml` deliberately has no
 * `npm install` step so a gate is never skipped for want of a module. The closed schema on the
 * follow slot is asserted headlessly by `harness/party-follow.mjs`, which IS in the chain. This
 * file asserts the only thing that cannot be asserted without pixels: that there are any.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 A SKIP IS NEVER A PASS
 * ---------------------------------------------------------------------------------------------
 * `harness/scenarios/`'s own header is emphatic and this project has been burned twice: an
 * instrument that returns a confident wrong number has cost real rounds. Every assertion below
 * either measures something or says out loud that it could not. In particular D2/D3 are the two
 * that a lazy version of this file would fake — "a canvas exists" passes on a black canvas, and
 * "the canvas is not black" passes on a rendered postcard.
 *
 * It drives the REAL UI. Casting is tapped and padlocked through the phones' own DOM, not
 * injected as a socket message, because the thing being proved is that a person sitting down can
 * reach this picture.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const SHOTS = argv.includes('--shots');
const KEEP = argv.includes('--keep');
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

// Own ports, deliberately not 5178/5181, so a dev session cannot be collided with or reused.
const WEB = +arg('--port', 5193);
const WS = +arg('--wsPort', 5183);
const CODE = 'drv7';
const SHOTDIR = path.join(ROOT, 'progress', 'follow');

let pass = 0, fail = 0;
const results = [];
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  results.push({ n, ok: !!c, d });
  return c;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

/** Poll a page predicate. Returns the value or null on timeout — never throws. */
async function waitFor(page, fn, { timeout = 15000, every = 250, arg: a } = {}) {
  const t0 = Date.now();
  for (;;) {
    let v = null;
    try { v = await page.evaluate(fn, a); } catch { /* mid-navigation */ }
    if (v) return v;
    if (Date.now() - t0 > timeout) return null;
    await sleep(every);
  }
}

// ---------------------------------------------------------------- servers
const kids = [];
console.log('\nparty-follow-drive — a real night, and what is actually on the TV\n');

if (await portOpen(WS)) console.log(`  reusing the room server on :${WS}`);
else {
  console.log(`  starting the room server on :${WS} …`);
  const p = spawn(process.execPath, [path.join(ROOT, 'net/party/local.mjs'), '--port', String(WS)],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  kids.push(p);
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

/*
 * ⚠️ `--use-angle=swiftshader` IS NOT OPTIONAL, AND THE PROJECT'S DOCUMENTED RECIPE IS MISSING IT.
 *
 * `playtest.mjs` L143 and `.cursor/skills/rrr-playcritique/SKILL.md` both launch with
 * `--use-gl=angle --enable-unsafe-swiftshader`. Measured on a headless box with no GPU, that
 * exact pair yields **no WebGL2 context at all** — ANGLE resolves to the Mesa/llvmpipe backend
 * and `new WebGLRenderer` throws "Error creating WebGL context", which `main.js` turns into the
 * red failure card. Five other arg sets were tried; adding `--use-angle=swiftshader` is what
 * fixes it, and it is the difference between this drive measuring the follow and measuring an
 * error page. Left as a comment here rather than edited into `playtest.mjs`, which is another
 * owner's file and was working on the machine it was written on.
 */
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

/**
 * ⚠️ ONE BROWSER CONTEXT PER SEAT, AND IT IS NOT ISOLATION FOR ITS OWN SAKE.
 *
 * `party-phone.js` keeps the published name in `localStorage['rrr.party.name']`, which is shared
 * across every page in a context — so two phones in one context are the same person, and the
 * second one silently republishes the first one's name. Measured on the first run of this drive:
 * both seats came up as the same nameplate and the TV fell back to "The runner".
 *
 * A context each also lets the name be planted BEFORE navigation, which removes a real race:
 * `connect()` sends `{t:'name'}` on welcome, whereas typing into the lobby field can be wiped by
 * the repaint that any other phone's lobby fanout triggers between `fill` and `click`.
 *
 * Vite's HMR client is stubbed out in every context: the dev server is shared, and any file saved
 * by anything else pushes a full reload that would throw the run away mid-measurement without
 * saying so. `playtest.mjs` L146-184 has the argument and the session it cost.
 */
async function seat(name = null) {
  const c = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await c.route('**/@vite/client', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript', body: HMR_STUB,
  }));
  if (name) await c.addInitScript((n) => localStorage.setItem('rrr.party.name', n), name);
  return c;
}
const ctx = await seat();

const pageErrors = [];
const trackErrors = (p, who) => {
  p.on('pageerror', (e) => pageErrors.push(`${who}: ${String(e).split('\n')[0].slice(0, 180)}`));
  p.on('console', (m) => { if (m.type() === 'error') pageErrors.push(`${who} console: ${m.text().split('\n')[0].slice(0, 180)}`); });
};

let exitCode = 1;
try {
  // ------------------------------------------------------------- the TV and two phones
  const tv = await ctx.newPage();
  trackErrors(tv, 'tv');
  await tv.goto(`${base}/?view=party.host&room=${CODE}&wsPort=${WS}`, { waitUntil: 'domcontentloaded' });
  await tv.waitForSelector('.night-code', { timeout: 15000 });
  console.log('  TV is up on the lobby');

  const phones = [];
  for (const who of ['Ellie', 'Hai']) {
    const c = await seat(who);
    const p = await c.newPage();
    trackErrors(p, who);
    await p.goto(`${base}/?view=party.phone&room=${CODE}&wsPort=${WS}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#lock-look', { timeout: 15000 });
    await p.click('#lock-look');
    phones.push({ page: p, name: who });
    console.log(`  ${who} joined and locked a face in`);
  }
  await sleep(800);

  const lobby = await tv.evaluate(() => ({
    lit: document.querySelectorAll('.seat.on').length,
    names: [...document.querySelectorAll('.seat.on .who')].map((e) => e.textContent.trim()),
  }));
  t('D0 · two phones are live on the TV lobby', lobby.lit === 2, `${lobby.lit} lit chairs`);
  t('D0b · and they are seated under their published names',
    lobby.names.sort().join(',') === 'Ellie,Hai', lobby.names.join(','));

  // ------------------------------------------------------------- the night
  await tv.click('#go', { timeout: 15000 });
  console.log('  host started the night');

  /*
   * ---------------------------------------------------------------------------------------
   * #6's DEAL SITS BETWEEN "START THE NIGHT" AND THE BALLOT, SO THIS DRIVE HAS TO GO THROUGH IT.
   * ---------------------------------------------------------------------------------------
   * That is not an obstacle to route around — it is the half of the night this slice must not
   * break. `role-peek` proves the card's own contract in bare node; what only a browser can say
   * is that the deal, the hold, the dismissal and the casting list still compose into one
   * sequence a person can walk, with a mansion camera mounted at the end of it.
   */
  const cardOk = [];
  for (const { page, name } of phones) {
    await page.waitForSelector('#card-done', { state: 'visible', timeout: 20000 });
    const atRest = await page.evaluate(() => {
      const v = document.querySelector('.card-view');
      return !!v && !v.classList.contains('hide') && !v.classList.contains('lit');
    });
    // Hold the bar, then let go. `lit` on is immediate; off waits REBLUR_MS (400 ms).
    const bar = await page.$('#card-hold');
    const box = await bar.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await sleep(250);
    const held = await page.evaluate(() => document.querySelector('.card-view')?.classList.contains('lit') === true);
    await page.mouse.up();
    await sleep(700);
    const reblurred = await page.evaluate(() => document.querySelector('.card-view')?.classList.contains('lit') === false);
    cardOk.push(atRest && held && reblurred);
    await page.click('#card-done', { timeout: 10000 });
    console.log(`  ${name} was dealt a card, read it, and put it down`);
  }
  t('D0c · #6 is intact — the card is dealt at night start, blurred at rest, lit only while held',
    cardOk.length === 2 && cardOk.every(Boolean), cardOk.join(','));

  for (const { page, name } of phones) {
    await page.waitForSelector('[data-pick]', { timeout: 15000 });
    // Sequential casting through the real UI: tap, padlock, tap, padlock. Two locks, one ballot.
    // Driven through the phone's own DOM rather than injected as a socket message, because the
    // thing being proved is that a person sitting down can reach the picture at the end of it.
    for (const step of [0, 1]) {
      const picks = await page.$$('[data-pick]:not([disabled])');
      if (!picks.length) throw new Error(`${name}: no castable names on the ${step ? 'guide' : 'runner'} step`);
      await picks[step === 0 ? 0 : Math.min(1, picks.length - 1)].click({ timeout: 15000 });
      await page.waitForSelector('#lock-pick', { state: 'visible', timeout: 10000 });
      await page.click('#lock-pick', { timeout: 15000 });
      await sleep(250);
    }
    console.log(`  ${name} cast a runner and a guide`);
  }
  await sleep(500);
  await tv.waitForSelector('[data-send-count]', { timeout: 60000 });
  console.log('  TV counting down to auto-send');
  await tv.waitForSelector('.run-frame', { timeout: 20000 });
  console.log('  host auto-sent them in');

  await tv.waitForSelector('.run-frame', { timeout: 10000 });
  t('D1 · the run beat replaces the lobby — no QR, and a run frame exists',
    await tv.evaluate(() => !document.querySelector('.night-qr') && !!document.querySelector('.run-frame')));

  // Polled, not read once: `{t:'show', beat:'expedition'}` reaches the TV BEFORE the state frame
  // carrying the pair, so the first paint of the run frame legitimately has no name in it yet.
  // Reading straight after `waitForSelector` measured "The runner is running" on a TV that said
  // "Ellie is running" 300 ms later.
  const runnerName = await waitFor(tv, () => window.__rrrHost?.runnerName || null, { timeout: 10000, every: 200 });
  const tag = await tv.evaluate(() => document.querySelector('.run-tag')?.textContent?.trim() ?? '');
  t('D1b · the TV names a joined runner, not a leftover Robot N or an em dash',
    ['Ellie', 'Hai'].includes(runnerName) && tag === `${runnerName} is running`,
    `${runnerName} · "${tag}"`);

  // ------------------------------------------------------------- the camera warms
  const camSrc = await waitFor(tv, () => document.querySelector('iframe.run-cam')?.src || null, { timeout: 10000 });
  t('D1c · a follow camera is mounted, pointed at party.follow',
    !!camSrc && camSrc.includes('view=party.follow'), camSrc || 'no iframe');
  t('D1d · and it is a LAYER on <body>, not a child of the repainted subtree',
    await tv.evaluate(() => {
      const f = document.querySelector('iframe.run-cam');
      return !!f && f.closest('.night') === null && f.parentElement?.parentElement === document.body;
    }));

  /*
   * ⚠️ RE-PIN EXPEDITION WHILE THE BAKE RUNS, AND SAY WHY RATHER THAN HIDING IT.
   *
   * `show.js`'s stub clock flips to recap 26 s after the pair locks. On real hardware the mansion
   * is up well inside that. On a software rasteriser it is not — the bake measured 24 s for the
   * follow view ALONE on this box — and the host hides the camera layer off the run beat, which
   * stops its rAF and would leave this loop waiting forever on a page that is no longer ticking.
   *
   * So the drive presses the host's own "Watch the run" button, which is exactly the control a
   * person in the room would use, and `local.mjs` L376 deliberately does not restart the clock
   * for an explicit `expedition`. This is an ENVIRONMENT accommodation, not a product claim: on a
   * machine with a GPU the beat is never reached during the bake, and nothing below is measured
   * any differently for having pressed it.
   */
  console.log('  waiting for the mansion to bake (software rasteriser — this is genuinely slow) …');
  const t0 = Date.now();
  let repins = 0;
  const live = await waitFor(tv, async () => {
    const f = document.querySelector('iframe.run-cam');
    if (f?.contentDocument?.body?.dataset?.rrrFollow === 'live') return true;
    if (document.querySelector('.run-cam-layer')?.hidden) {
      document.querySelector('#to-run')?.click();
      window.__repins = (window.__repins || 0) + 1;
    }
    return false;
  }, { timeout: 420000, every: 1500 });
  repins = await tv.evaluate(() => window.__repins || 0);
  const bakeS = ((Date.now() - t0) / 1000).toFixed(1);
  if (repins) console.log(`  (re-pinned expedition ${repins}x while the bake ran — see the note above)`);
  t('D1e · the follow reported its first rendered frame', !!live, `${bakeS} s to first frame`);
  if (!live) throw new Error('the follow never reported ready — nothing below can be measured');

  // The host cross-fades the slate off the ready signal.
  await sleep(1200);
  t('D1f · the TV cross-faded onto the camera',
    await tv.evaluate(() => document.querySelector('.run-cam-layer')?.classList.contains('live') === true));

  // ------------------------------------------------------------- D4 · it is the mansion
  const inside = await tv.evaluate(() => {
    const w = document.querySelector('iframe.run-cam')?.contentWindow;
    const f = w?.__rrrFollow;
    if (!f) return null;
    const p = w.__rrr?.perf?.() ?? {};
    return {
      space: f.spaceOfCamera(),
      storey: f.storeyOfCamera(),
      camY: +f.cameraY().toFixed(2),
      tris: p.tris ?? 0,
      calls: p.calls ?? 0,
      spaces: f.room.spaces.length,
      shot: f.readout().shot,
      runner: { x: +f.runner.pos.x.toFixed(2), z: +f.runner.pos.z.toFixed(2) },
    };
  });
  t('D4 · the camera is standing IN a real space of the real house',
    !!inside && !!inside.space && inside.spaces >= 4,
    inside ? `space=${inside.space} of ${inside.spaces}` : 'no follow handle');
  // 8k tris / 20 calls, not 50k: `room.setViewpoints` residency switches off every space the
  // camera cannot see, which is the whole reason this runs at all — a single lit room plus the
  // robot measured 14.1k tris over 35 calls. The bar is set under a measurement, not over a guess.
  t('D4b · that is a mansion, not a slate — real geometry is being drawn',
    !!inside && inside.tris > 8000 && inside.calls > 20,
    inside ? `${(inside.tris / 1000).toFixed(1)}k tris, ${inside.calls} calls` : '—');

  /* ============================================================================================
   * D5 · no god-view
   *
   * 🚨 **THIS GATE USED TO PROTECT THE DEFAULT AND CALL IT THE CAPABILITY, AND THAT IS WHY IT
   * HAS BEEN REWRITTEN RATHER THAN RELAXED.**
   *
   * It read: *"the lens stays at head height and the ceilings never come off"*, asserting
   * `maxY < storey - 1.0 && setLid(false) called 0 times`. Both halves were already false of the
   * shipped feature the day perspectives landed — `iso` and `top` put the eye above the storey
   * BY DESIGN and take the roof off to do it — and the gate stayed green only because this drive
   * never presses `P`. It was measuring a camera nobody had asked to move. Worse, it is not in
   * `gates:party`, so the day the expedition started choosing top-down on its own it would have
   * gone red late, in a manual run, long after the change that broke it.
   *
   * The rule it was written to defend is `party-loop.md`'s "Do not" #1 — the TV must not become
   * the guide's map — and that rule is NARROWED here, not repealed. John ratified the narrowing
   * after `CRITIC-LEDGER` round 8 raised it. What still must hold, and is asserted below:
   *
   *   · the roof comes off only over the rooms RESIDENCY admits — never the whole house
   *   · the ground rigs still clamp under the storey, so the exemption is two rigs wide
   *   · the overhead eye is bounded ABOVE too: a camera that keeps climbing is the fly-over
   *     coming back in disguise
   *
   * `setLid` is still wrapped, but it now records the SCOPE of every call rather than counting
   * them, because "how many times" was never the question — "over how much of the house" is.
   * ============================================================================================ */
  const camYs = [];
  const storeys = [];
  const lidCalls = await tv.evaluate(() => {
    const w = document.querySelector('iframe.run-cam')?.contentWindow;
    const room = w?.__rrrFollow?.room;
    if (!room) return -1;
    w.__lidScopes = [];
    const total = (room.lidCensus?.() ?? {}).spaces?.length ?? 0;
    w.__lidSpaceTotal = total;
    const orig = room.setLid?.bind(room);
    if (orig) {
      room.setLid = (on, ids = null) => {
        if (on === false) w.__lidScopes.push(ids == null ? total : (ids.length ?? total));
        return orig(on, ids);
      };
    }
    return 0;
  });

  // ------------------------------------------------------------- D2 / D3 · pixels
  /*
   * ⚠️ `page.screenshot({ clip })`, NOT `locator.screenshot()`.
   *
   * A locator screenshot runs Playwright's actionability wait first, which requires the element's
   * bounding box to be identical across two consecutive `requestAnimationFrame`s. The follow
   * iframe and the host page are the same renderer process, so at software-rasteriser frame
   * times the PARENT page's rAF is starved too — measured: `locator.screenshot` timed out at
   * 60 s on a layer that was rendering perfectly well. A clip rect skips the wait entirely and
   * captures the same pixels.
   */
  /**
   * ⚠️ HOLD THE RUN BEAT ACROSS THE MEASUREMENT, AND CHECK IT BEFORE EVERY GRAB.
   *
   * The stub clock is 26 s from the pair locking (`show.js`), and the bake alone costs ~23 s on a
   * software rasteriser — so the beat flips to recap mid-measurement, the host hides the camera
   * layer, and the clip rect then photographs whatever DOM is behind it. That is the specific way
   * this drive could lie: on the previous run D2 PASSED on two identical screenshots of the recap
   * card (mean 16.2, stdev 20.5 — a perfectly respectable-looking number about the wrong pixels)
   * and only D3 caught it, by noticing they were byte-identical.
   *
   * So every grab asserts the layer is visible and live first, and re-pins expedition through the
   * host's own "Watch the run" button if it is not.
   */
  const holdRun = async () => {
    for (let k = 0; k < 12; k++) {
      const ok = await tv.evaluate(() => {
        const l = document.querySelector('.run-cam-layer');
        return !!l && !l.hidden && l.classList.contains('live');
      });
      if (ok) return true;
      await tv.evaluate(() => { document.querySelector('#to-run')?.click(); window.__repins = (window.__repins || 0) + 1; });
      await sleep(600);
    }
    return false;
  };

  const box = await tv.locator('.run-cam-layer').boundingBox();
  if (!box) throw new Error('the camera layer has no box to photograph');
  const clip = { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) };
  const stat = await makeAnalyser(ctx);
  const grabs = [];
  let held = true;
  for (let i = 0; i < 3; i++) {
    held = (await holdRun()) && held;
    const png = await tv.screenshot({ clip, timeout: 120000 });
    grabs.push({ png, s: await stat(png) });
    const s = await tv.evaluate(() => {
      const w = document.querySelector('iframe.run-cam')?.contentWindow;
      return { y: w?.__rrrFollow?.cameraY() ?? null, st: w?.__rrrFollow?.storeyOfCamera() ?? null };
    });
    if (s.y != null) camYs.push(+s.y.toFixed(2));
    if (s.st != null) storeys.push(s.st);
    // 4 s between grabs. On a GPU the runner covers ~10 m of corridor in that; on this box the
    // simulation runs slow enough that a 1 s gap sat under the grain floor, which would have made
    // D3 report "not moving" about a camera that was. Sized to the instrument, not to taste.
    if (i < 2) await sleep(4000);
  }
  t('D2a · every grab was taken of the live camera, not of the DOM behind it', held);

  const m = grabs.map((g) => g.s);
  t('D2 · the run frame is not black — there is a lit picture in it',
    m.every((s) => s.mean >= 12) && m.every((s) => s.stdev >= 8),
    m.map((s) => `L${s.mean.toFixed(1)}/σ${s.stdev.toFixed(1)}`).join('  '));

  const d1 = diff(m[0].lum, m[1].lum);
  const d2 = diff(m[1].lum, m[2].lum);
  t('D3 · it is LIVE, not a rendered still — consecutive grabs differ',
    d1 > 0.005 && d2 > 0.005,
    `${(d1 * 100).toFixed(1)}% then ${(d2 * 100).toFixed(1)}% of cells moved`);

  const maxY = camYs.length ? Math.max(...camYs) : Infinity;
  const minStorey = storeys.length ? Math.min(...storeys) : 0;
  const lid = await tv.evaluate(() => {
    const w = document.querySelector('iframe.run-cam')?.contentWindow;
    const f = w?.__rrrFollow;
    return {
      scopes: w?.__lidScopes ?? null,
      total: w?.__lidSpaceTotal ?? 0,
      resident: f?.room?.residentIds?.()?.length ?? null,
      shot: f?.cam?.()?.shot ?? null,
      rigHeight: f?.cam?.()?.rigHeight ?? null,
    };
  });
  const widest = (lid.scopes && lid.scopes.length) ? Math.max(...lid.scopes) : 0;
  const overhead = lid.rigHeight != null && lid.rigHeight > minStorey;

  /*
   * The drive never presses `P` and walks a scripted route that stays in the ballroom, so this
   * observes the DEFAULT camera — which is still the chase. The three assertions are written to
   * hold on either arm, so the day the expedition starts craning during this drive they measure
   * the new behaviour rather than going red at it.
   */
  t('D5 · no god-view — the roof comes off only over the runner\'s own rooms, and a ground rig '
    + 'still stays under the storey',
    camYs.length > 0
      && (overhead || maxY < minStorey - 1.0)
      && widest < lid.total
      && (lid.resident == null || widest <= Math.max(lid.resident, 1) + 1),
    `shot ${lid.shot} · cam y max ${maxY} under a ${minStorey} m storey`
      + ` · roof off over at most ${widest} of ${lid.total} spaces`
      + ` (${lid.resident ?? '—'} resident)`);
  t('D5b · and the overhead eye is bounded ABOVE too — a camera that keeps climbing is the '
    + 'fly-over in disguise',
    maxY < 14, `cam y max ${maxY} m`);

  // ------------------------------------------------------------- D6 · no guide map
  const leak = await tv.evaluate(() => {
    const f = document.querySelector('iframe.run-cam');
    const doc = f?.contentDocument;
    const hay = [f?.src || '', doc?.body?.innerHTML || ''].join(' ').toLowerCase();
    return ['flyover', 'minimap', 'hunter', 'marks='].filter((k) => hay.includes(k));
  });
  t('D6 · nothing on the TV or in the slot mentions the flyover, the hunter or a map',
    leak.length === 0, leak.join(',') || 'clean');

  const overlay = await tv.evaluate(() => {
    const doc = document.querySelector('iframe.run-cam')?.contentDocument;
    return {
      rec: !!doc?.querySelector('#fl .dot'),
      who: doc?.querySelector('#fl .who')?.textContent?.trim() ?? '',
      shot: doc?.querySelector('#fl [data-shot]')?.textContent?.trim() ?? '',
    };
  });
  t('D6b · the overlay is broadcast furniture: rec dot, lower-third, shot slug',
    overlay.rec && !!overlay.who && !!overlay.shot,
    `${overlay.who} · ${overlay.shot}`);

  // #6 §2.3: the card is reachable in ANY phase, as a face-down tab. A follow that ate the phone's
  // card tab during the run would have taken away the one thing the table reasons with while it
  // watches — so this is asserted from the phone, during expedition, with the camera live.
  const tabs = [];
  for (const { page } of phones) {
    tabs.push(await page.evaluate(() => {
      const tab = document.querySelector('#card-tab');
      return !!tab && !/producer|contestant|camera op|editor|the static/i.test(tab.textContent || '');
    }));
  }
  t('D6c · #6 is intact — the face-down card tab is still on the phones during the run, naming no role',
    tabs.length === 2 && tabs.every(Boolean), tabs.join(','));

  // ------------------------------------------------------------- errors
  t('D7 · no page error on the TV, the phones, or inside the follow',
    pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ') || 'clean');

  /*
   * ---------------------------------------------------------------------------------------
   * D8 · THE URL THE DOCUMENTATION ADVERTISES, OPENED FOR REAL.
   * ---------------------------------------------------------------------------------------
   * `party-follow.mjs` F9 proves the schema accepts `?still=1&shot=lead`. It cannot prove the
   * PAGE comes up, and the page is what was broken: both instruments were read by the view and
   * missing from the allow-list, so every camera-alone URL in the PR threw at the door and
   * `main.js` painted the red failure card. A hostile review caught that, not a gate — so the
   * proof is a real navigation, and it asserts the pin took rather than merely that nothing
   * exploded.
   */
  const solo = await ctx.newPage();
  trackErrors(solo, 'solo');
  const soloUrl = `${base}/?view=party.follow&runner=p1&name=Hai`
    + '&shell=%236b3a2a&accent=%23f5a14a&seed=1&throttle=CREEP&still=1&shot=lead';
  await solo.goto(soloUrl, { waitUntil: 'domcontentloaded' });
  const soloLive = await waitFor(solo, () => {
    if (document.body.dataset.rrrError || window.__rrrError) return 'error';
    return document.body.dataset.rrrFollow === 'live' ? 'live' : null;
  }, { timeout: 300000, every: 1000 });
  t('D8 · the camera-alone URL the how-to advertises actually opens', soloLive === 'live',
    soloLive === 'error'
      ? await solo.evaluate(() => String(window.__rrrError || document.body.dataset.rrrError).slice(0, 160))
      : String(soloLive));
  if (soloLive === 'live') {
    const pinned = await solo.evaluate(async () => {
      const f = window.__rrrFollow;
      const a = { shot: f.readout().shot, x: f.runner.pos.x, z: f.runner.pos.z };
      await new Promise((r) => setTimeout(r, 2500));
      return { ...a, shot2: f.readout().shot, x2: f.runner.pos.x, z2: f.runner.pos.z };
    });
    t('D8b · ?shot=lead pins the operator, and ?still=1 freezes the runner',
      pinned.shot === 'lead' && pinned.shot2 === 'lead'
        && Math.abs(pinned.x2 - pinned.x) < 0.01 && Math.abs(pinned.z2 - pinned.z) < 0.01,
      `${pinned.shot}/${pinned.shot2} · moved ${Math.hypot(pinned.x2 - pinned.x, pinned.z2 - pinned.z).toFixed(3)} m`);
    if (SHOTS) {
      await mkdir(SHOTDIR, { recursive: true });
      await solo.screenshot({ path: path.join(SHOTDIR, 'camera-alone-lead.png'), timeout: 120000 });
    }
  }

  // ------------------------------------------------------------- evidence
  if (SHOTS) {
    await mkdir(SHOTDIR, { recursive: true });
    await tv.screenshot({ path: path.join(SHOTDIR, 'tv-expedition.png'), timeout: 120000 });
    for (let i = 0; i < grabs.length; i++) {
      await writeFile(path.join(SHOTDIR, `follow-crop-${i + 1}.png`), grabs[i].png);
    }
    for (const { page, name } of phones) {
      await page.screenshot({ path: path.join(SHOTDIR, `phone-${name.toLowerCase()}.png`), timeout: 60000 });
    }
    console.log(`\n  shots -> ${path.relative(ROOT, SHOTDIR)}/`);
  }

  console.log(`\n  readout: shot=${inside?.shot} runner=(${inside?.runner.x}, ${inside?.runner.z}) `
    + `space=${inside?.space} bake=${bakeS}s`);
  exitCode = fail ? 1 : 0;
} catch (e) {
  console.log(`\n  DRIVE ABORTED: ${String(e).split('\n')[0]}`);
  fail++;
} finally {
  console.log(`\nparty-follow-drive: ${pass} passed, ${fail} failed`);
  await browser.close().catch(() => {});
  if (!KEEP) for (const k of kids) k.kill();
}
process.exit(fail ? 1 : (exitCode || 0));

// -------------------------------------------------------------------------------------------

/**
 * A PNG -> luma grid, measured in a throwaway Chromium page.
 *
 * `harness/imglib.mjs`'s rule and the reason for it: Chromium caches `file://` images by URL and
 * every render here writes the same path, so a re-measured file silently returns the PREVIOUS
 * number. Data URLs have no cache key to get wrong. These buffers never touch disk before they
 * are read, which sidesteps it entirely, and the page is reused so three grabs cost one launch.
 */
async function makeAnalyser(ctx) {
  const page = await ctx.newPage();
  await page.goto('about:blank');
  return async (png) => page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    // 160x90 cells. Fine enough that a camera cut or a walking body moves many of them, coarse
    // enough that film grain and the AO dither do not — the noise floor matters here, and
    // `char-locomotion.js` records a whole round lost to arguing a 0.137% pixel diff that sat
    // 34x under the instrument's own floor.
    const W = 160, H = 90;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, W, H);
    const d = g.getImageData(0, 0, W, H).data;
    const lum = new Array(W * H);
    let sum = 0;
    for (let i = 0; i < W * H; i++) {
      const v = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
      lum[i] = v; sum += v;
    }
    const mean = sum / lum.length;
    let vr = 0;
    for (const v of lum) vr += (v - mean) ** 2;
    return { mean, stdev: Math.sqrt(vr / lum.length), lum };
  }, png.toString('base64'));
}

/** Fraction of cells whose luma moved by more than the grain floor. */
function diff(a, b) {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 6) n++;
  return n / a.length;
}
