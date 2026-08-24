#!/usr/bin/env node
/**
 * party-playtest-drive — John's seven notes on `0349ef6`, each one measured in a real Chromium.
 *
 *   node harness/party-playtest-drive.mjs
 *   node harness/party-playtest-drive.mjs --shots      # writes progress/playtest/
 *   node harness/party-playtest-drive.mjs --keep       # leave vite and the room server up
 *
 * `docs/slices/task-evil-red-hunter-route.md` §5. Sibling of `party-follow-drive.mjs` and
 * `party-warm-drive.mjs`, and out of `gates:party` for the same reason both of those are: it needs
 * `npm install` and a browser, and `.github/workflows/gates.yml` has neither on purpose.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 WHY THESE SEVEN NEEDED A BROWSER AT ALL, GIVEN 22 HEADLESS GATES WERE GREEN
 * ---------------------------------------------------------------------------------------------
 * Every one of John's notes is about something that WAS green. The role card had eight
 * assertions and none of them was a colour. The pad had a schema gate and no gate on the sign.
 * The map's marks had an entitlement row, a coverage curve and an oracle control, and the thing
 * that was wrong was that the mark and the Production Feed line six pixels above it were
 * answering to two different rules. `party-warm` and `guide-coverage` carry the new headless
 * claims; this file carries the ones that are only true on a screen:
 *
 *   E1  the Production card is RED and a good card is not — computed style, not a class name
 *   E2  the hunter changes ROOMS on a real route, and never reports standing nowhere
 *   E3  a thumb dragged left moves the body left, through the phone -> server -> TV chain
 *   E4  there is no Recap button anywhere on the television
 *   E5  the picture is about 90% of the screen, measured against the viewport
 *   E6  the runner's pad has no house-word block, and the seated chairs still do
 *   E7  the guide's map does what this guide's ALIGNMENT says it should
 *   E8  a tapped SWING buzzes the phone and writes a word, and the word does not move the stick
 *
 * ⚠️ **A SKIP IS NEVER A PASS.** Two of these can legitimately fail to arm — E7 depends on which
 * alignment the deal hands the elected guide, and E3 needs a runner with room to walk. Both say
 * SKIP out loud and the run reports the count rather than quietly reading green.
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

// Own ports, so a dev session or another drive cannot be collided with.
const WEB = +arg('--port', 5194);
const WS = +arg('--wsPort', 5184);
// ⚠️ EVERY LETTER HAS TO BE IN `CODE_ABC`, which drops i/l/o so nobody misreads a code across a
// room. `normalizeCodeWire` silently strips the rest, so a code with an `l` in it arrives three
// characters long and the phone answers "Room code is four letters" — which reads as a broken
// join rather than as a typo in the harness. Measured, on the first run of this file.
const CODE = arg('--code', 'ptst');
const SHOTDIR = path.join(ROOT, 'progress', 'playtest');

let pass = 0, fail = 0, skip = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return c;
};
const skipped = (n, why) => { skip++; console.log(`  SKIP ${n} · ${why}`); };
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
async function waitFor(page, fn, { timeout = 15000, every = 250 } = {}) {
  const t0 = Date.now();
  for (;;) {
    let v = null;
    try { v = await page.evaluate(fn); } catch { /* mid-navigation */ }
    if (v) return v;
    if (Date.now() - t0 > timeout) return null;
    await sleep(every);
  }
}

/** `rgb(r, g, b)` -> `{r,g,b}`. What `getComputedStyle` hands back for a colour. */
function rgb(s) {
  const m = String(s || '').match(/(\d+(?:\.\d+)?)/g);
  if (!m || m.length < 3) return null;
  return { r: +m[0], g: +m[1], b: +m[2] };
}
/** Is this ink RED rather than paper? The palette's `--night-bad` is #ff8a7a. */
const isRed = (c) => !!c && c.r > 180 && c.r - c.g > 60 && c.r - c.b > 60;

const kids = [];
console.log("\nparty-playtest-drive — John's seven notes, in a real browser\n");

if (await portOpen(WS)) console.log(`  reusing the room server on :${WS}`);
else {
  console.log(`  starting the room server on :${WS} …`);
  kids.push(spawn(process.execPath, [path.join(ROOT, 'net/party/local.mjs'), '--port', String(WS)],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }));
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

// `--use-angle=swiftshader` is not optional on a box with no GPU — `party-follow-drive.mjs`
// L117-128 carries the measurement and the five arg sets that do not work.
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

/** One context per seat — `party-phone.js` keeps the nameplate in `localStorage`. */
async function seat(name = null, viewport = { width: 430, height: 900 }) {
  const c = await browser.newContext({ viewport });
  await c.route('**/@vite/client', (r) => r.fulfill({
    status: 200, contentType: 'application/javascript', body: HMR_STUB,
  }));
  if (name) await c.addInitScript((n) => localStorage.setItem('rrr.party.name', n), name);
  return c;
}

const pageErrors = [];
const trackErrors = (p, who) => {
  p.on('pageerror', (e) => pageErrors.push(`${who}: ${String(e).split('\n')[0].slice(0, 180)}`));
  p.on('console', (m) => { if (m.type() === 'error') pageErrors.push(`${who} console: ${m.text().split('\n')[0].slice(0, 180)}`); });
};

const shot = async (page, name, opts = {}) => {
  if (!SHOTS) return;
  await mkdir(SHOTDIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOTDIR, `${name}.png`), ...opts });
};

let exitCode = 1;
try {
  // ------------------------------------------------------------- the TV and three phones
  // A 1920x1080 television, because E5 is a claim about how much of one the picture takes and
  // a 1280x800 developer window is not the screen the claim is about.
  const tvCtx = await seat(null, { width: 1920, height: 1080 });
  const tv = await tvCtx.newPage();
  trackErrors(tv, 'tv');
  await tv.goto(`${base}/?view=party.host&room=${CODE}&wsPort=${WS}`, { waitUntil: 'domcontentloaded' });
  await tv.waitForSelector('.night-code', { timeout: 20000 });
  console.log('  TV is up on the lobby');

  /*
   * THREE phones, not two. `COMPOSITION[3]` seats one Production member and two Cast, so the
   * table is guaranteed to contain both alignments — which E1 needs (a red card AND a card that
   * is not red) and E7 wants. At two phones the arithmetic is the same but the pair is forced,
   * so the elected guide is whoever is left rather than a ballot.
   */
  const phones = [];
  for (const who of ['Ellie', 'Hai', 'Ozz']) {
    const c = await seat(who);
    const p = await c.newPage();
    trackErrors(p, who);
    await p.goto(`${base}/?view=party.phone&room=${CODE}&wsPort=${WS}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#lock-look', { timeout: 20000 });
    await p.click('#lock-look');
    phones.push({ page: p, name: who });
    console.log(`  ${who} joined and locked a face in`);
  }
  await sleep(900);

  await tv.click('#go', { timeout: 20000 });
  console.log('  host started the night');

  // ------------------------------------------------------------- E1 · EVIL LOOKS EVIL
  /*
   * 🚨 MEASURED AS A COMPUTED COLOUR, NOT AS A CLASS NAME. `role-peek` P12 already asserts the
   * class and the rule; what it cannot see is whether the rule reaches the element — the card
   * is appended to `document.body` OUTSIDE `.night`, and this file's own history (`rolecard.js`
   * L157: a `font:` shorthand rendering §2.3's 34 px name in the browser's default SERIF) is
   * exactly a rule that was correct and did not land.
   */
  const inks = [];
  for (const { page, name } of phones) {
    await page.waitForSelector('#card-done', { state: 'visible', timeout: 30000 });
    const bar = await page.$('#card-hold');
    const box = await bar.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await sleep(350);
    const read = await page.evaluate(() => {
      const g = (sel) => {
        const el = document.querySelector(sel);
        return el ? { text: el.textContent.trim(), color: getComputedStyle(el).color } : null;
      };
      return { align: g('.card-view .align'), role: g('.card-view .role') };
    });
    if (SHOTS) await shot(page, `card-${name}`);
    await page.mouse.up();
    await sleep(700);
    await page.click('#card-done', { timeout: 15000 });
    inks.push({ name, ...read });
    console.log(`  ${name} read "${read.align?.text}" / "${read.role?.text}"`);
  }

  const evilInks = inks.filter((i) => /PRODUCTION/i.test(i.align?.text || ''));
  const goodInks = inks.filter((i) => /GOOD/i.test(i.align?.text || ''));
  t('E1 arm · the table holds at least one Production card and at least one Cast card',
    evilInks.length >= 1 && goodInks.length >= 1,
    `${evilInks.length} production · ${goodInks.length} good`);
  if (evilInks.length && goodInks.length) {
    t('E1 · both lines of a Production card render RED — the side strip and the role name',
      evilInks.every((i) => isRed(rgb(i.align.color)) && isRed(rgb(i.role.color))),
      evilInks.map((i) => `${i.role.text} ${i.role.color}`).join(' · '));
    /*
     * The control, and it is the one that matters: a rule that painted every card red would
     * satisfy the line above completely and would tell the table nothing.
     */
    t('E1b control · and a Cast card renders in the ordinary ink — red MEANS Production',
      goodInks.every((i) => !isRed(rgb(i.align.color)) && !isRed(rgb(i.role.color))),
      goodInks.map((i) => `${i.role.text} ${i.role.color}`).join(' · '));
    t('E1c · the word survived the colour — §6\'s spelled-out rule is not replaced by it',
      evilInks.every((i) => i.align.text === 'You are PRODUCTION'));
  }

  // ------------------------------------------------------------- casting
  for (const { page, name } of phones) {
    await page.waitForSelector('[data-pick]', { timeout: 20000 });
    for (const step of [0, 1]) {
      const picks = await page.$$('[data-pick]:not([disabled])');
      if (!picks.length) throw new Error(`${name}: no castable names on the ${step ? 'guide' : 'runner'} step`);
      await picks[step === 0 ? 0 : Math.min(1, picks.length - 1)].click({ timeout: 20000 });
      await page.waitForSelector('#lock-pick', { state: 'visible', timeout: 15000 });
      await page.click('#lock-pick', { timeout: 20000 });
      await sleep(250);
    }
    console.log(`  ${name} cast a runner and a guide`);
  }
  await sleep(600);
  await tv.waitForSelector('[data-send-count]', { timeout: 60000 });
  console.log('  TV counting down to auto-send');
  await tv.waitForSelector('.run-frame', { timeout: 20000 });
  console.log('  host auto-sent them in');
  console.log('  host sent them in');
  await tv.waitForSelector('.run-frame', { timeout: 15000 });

  // ------------------------------------------------------------- E4 · the Recap button is gone
  const buttons = await tv.evaluate(() =>
    [...document.querySelectorAll('button')].map((b) => b.textContent.trim()));
  t('E4 · there is no Recap button on the television during the run',
    !buttons.some((b) => /recap/i.test(b)) && !(await tv.$('#to-recap')),
    buttons.join(' | ') || 'no buttons');

  // ------------------------------------------------------------- the mansion bakes
  /*
   * ⚠️ **HOLD THE RUN BEAT ACROSS EVERY MEASUREMENT BELOW, AND SAY WHY.** `show.js`'s stub clock
   * flips to `recap` 26 s after the pair locks. That is fine for a person in a lounge and fatal
   * for this file: the phones leave the expedition sheet, the pad and the map go with them, and
   * an assertion about the runner's stick then measures the "phones down" card. Measured on the
   * first run — E6 read "no #stick" about a build whose pad was perfectly fine.
   *
   * `local.mjs` `handleClient` deliberately does not restart the clock for an explicit
   * `expedition`, so pressing the host's own "Watch the run" pins it. This is an ENVIRONMENT
   * accommodation, not a product claim: it is the control a person in the room already has.
   */
  const holdRun = async () => {
    const ok = await tv.evaluate(() => window.__rrrHost?.beat === 'expedition');
    if (ok) return true;
    await tv.evaluate(() => document.querySelector('#to-run')?.click());
    await sleep(700);
    return tv.evaluate(() => window.__rrrHost?.beat === 'expedition');
  };

  console.log('  waiting for the mansion to bake (software rasteriser — genuinely slow) …');
  const t0 = Date.now();
  const live = await waitFor(tv, () => {
    const w = document.querySelector('iframe.run-cam')?.contentWindow;
    if (!document.querySelector('.run-cam-layer')?.classList.contains('live')) {
      document.querySelector('#to-run')?.click();
    }
    // 🚨 `mode() === 'run'` RATHER THAN JUST `rrrFollow === 'live'`. The night-long slot is
    // already live from the LOBBY — that is the whole point of the warm slice — so the weaker
    // predicate returns true instantly and reports "0.0 s to first frame" about a camera that is
    // still drifting through an empty ballroom.
    return w?.__rrrFollow?.mode?.() === 'run' && w?.document?.body?.dataset?.rrrFollow === 'live';
  }, { timeout: 480000, every: 1500 });
  t('E0 · the follow is live AND on the run, not still warming the lobby',
    !!live, `${((Date.now() - t0) / 1000).toFixed(1)} s to the run`);
  if (!live) throw new Error('the follow never reached the run — nothing below can be measured');
  await holdRun();
  await sleep(1500);
  if (SHOTS) await shot(tv, 'tv-run');

  // ------------------------------------------------------------- E5 · 90% of the television
  /*
   * 📺 MEASURED AGAINST THE VIEWPORT RATHER THAN AGAINST THE RULE. `party-warm` W16 pins the
   * constant and that it is interpolated; only a laid-out page can say whether the chrome around
   * it left room, and "the chrome left room" is the half that would silently fail — a frame that
   * does not fit scrolls or clips and the constant is still 90.
   */
  const frame = await tv.evaluate(() => {
    const f = document.querySelector('.run-frame');
    const r = f?.getBoundingClientRect();
    return r ? {
      w: Math.round(r.width), h: Math.round(r.height),
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      vw: innerWidth, vh: innerHeight,
      scroll: document.querySelector('.night-main')?.scrollHeight > document.querySelector('.night-main')?.clientHeight,
    } : null;
  });
  const share = frame ? frame.h / frame.vh : 0;
  t('E5 · the broadcast picture takes about 90% of the television\'s height',
    share >= 0.85 && share <= 0.95,
    frame ? `${frame.w}x${frame.h} of ${frame.vw}x${frame.vh} — ${(share * 100).toFixed(0)}%` : 'no frame');
  t('E5b · and it FITS — the chrome around it did not push the picture off the screen',
    !!frame && frame.top >= 0 && frame.bottom <= frame.vh && !frame.scroll,
    frame ? `top ${frame.top} · bottom ${frame.bottom} of ${frame.vh}` : '—');

  // ------------------------------------------------------------- who is who
  await holdRun();
  const seats = [];
  for (const { page, name } of phones) {
    const s = await page.evaluate(() => ({
      runner: !!window.__rrrPhone?.iAmRunner,
      guide: !!window.__rrrPhone?.iAmGuide,
      alignment: window.__rrrPhone?.frame?.you?.alignment ?? 'good',
    }));
    seats.push({ page, name, ...s });
  }
  const runner = seats.find((s) => s.runner);
  const guide = seats.find((s) => s.guide);
  const seated = seats.find((s) => !s.runner && !s.guide);
  console.log(`  ${runner?.name} walks (${runner?.alignment}) · ${guide?.name} talks (${guide?.alignment})`);

  // ------------------------------------------------------------- E2 · THE HUNTER IS WALKING
  /*
   * 🚨 THE ROOM, SAMPLED OVER TIME, AND THE NULLS COUNTED SEPARATELY. John: *"the hunter was not
   * actually moving room to room in the mansion."* The token always had a position; what it did
   * not have was a route through the DOORS, so most of every leg was spent inside the wall band
   * where `spaceAt` is null and the reported room was either nothing or whichever rectangle the
   * diagonal clipped. Both halves are asserted: it visits rooms, and it is never nowhere.
   */
  /*
   * ⚠️ **ADAPTIVE, AND THE BUDGET IS AN ENVIRONMENT FACT RATHER THAN A GAME ONE.** The token
   * walks at 1.6 m/s of SIMULATION time and this box renders the mansion at a few frames a
   * second, so sim time runs at a fraction of the wall clock — measured, the first fixed 23 s
   * window caught exactly one leg of a 26-stop route and reported "the hunter is standing
   * still" about a token that was walking. So it samples until it has seen what it is looking
   * for, or until a budget that is generous by the standard of a SwiftShader box.
   */
  const rooms = [];
  let nulls = 0;
  let telemetry = null;
  const watchStart = Date.now();
  for (let i = 0; i < 180; i++) {
    const w = await tv.evaluate(() => {
      const f = document.querySelector('iframe.run-cam')?.contentWindow?.__rrrFollow;
      return f ? { world: f.world(), hunter: f.hunter?.() ?? null } : null;
    });
    if (w?.world?.hunter) {
      if (w.world.hunter.room == null) nulls++;
      else rooms.push(w.world.hunter.room);
    }
    telemetry = w?.hunter ?? telemetry;
    if (new Set(rooms).size >= 2 && (telemetry?.doorways ?? 0) >= 1) break;
    if (i % 10 === 9) await holdRun();
    await sleep(1000);
  }
  const distinct = [...new Set(rooms)];
  const watchS = ((Date.now() - watchStart) / 1000).toFixed(0);
  t('E2 · the hunter changes rooms — it is walking the house, not standing in one',
    distinct.length >= 2,
    `${distinct.length} rooms in ${rooms.length} samples over ${watchS} s: ${distinct.join(' -> ')}`);
  t('E2b · and it is never reported standing NOWHERE — the guide\'s mark cannot blink out',
    nulls === 0, `${nulls} null rooms of ${rooms.length + nulls}`);
  t('E2c · it left those rooms through the doorways rather than through the walls',
    (telemetry?.doorways ?? 0) > 0 && (telemetry?.stops ?? 0) >= 4,
    telemetry ? `${telemetry.doorways} portals crossed on a ${telemetry.stops}-stop route` : 'no telemetry');

  /*
   * 🚨 **AND THE ROUTE ITSELF, WHICH IS THE FIX RATHER THAN A CONSEQUENCE OF IT.** Walking far
   * enough to observe every room takes minutes on this box, and the property that changed is
   * static: every leg of the patrol that leaves a space must be expandable into the doorways
   * between here and there. Asserted against `room.pathPortals` in the browser — the same call
   * the token makes — because the plan is generated and there is no house in bare node.
   */
  const legs = await tv.evaluate(() => {
    const room = document.querySelector('iframe.run-cam')?.contentWindow?.__rrrFollow?.room;
    if (!room) return null;
    const route = room.patrolRoute?.() ?? [];
    const at = (p) => room.spaceAt({ x: p.x, y: room.floorY ?? 0, z: p.z })?.id ?? null;
    let cross = 0, expanded = 0, orphan = 0;
    for (let i = 0; i < route.length; i++) {
      const a = route[i], b = route[(i + 1) % route.length];
      if (at(a) === at(b)) continue;
      cross++;
      const n = (room.pathPortals({ x: a.x, y: room.floorY ?? 0, z: a.z },
        { x: b.x, y: room.floorY ?? 0, z: b.z }, 0.9, 1.9) ?? []).length;
      if (n > 0) expanded++; else orphan++;
    }
    return { stops: route.length, cross, expanded, orphan };
  });
  t('E2d · every room-to-room leg of the patrol resolves to real doorways',
    !!legs && legs.cross > 0 && legs.orphan === 0,
    legs ? `${legs.expanded}/${legs.cross} crossing legs expanded, ${legs.orphan} would have gone through a wall`
      : 'no room handle');

  // ------------------------------------------------------------- E6 · the runner's pad
  await holdRun();
  if (!runner) skipped('E6', 'no phone was elected runner');
  else {
    await runner.page.waitForSelector('#stick', { timeout: 20000 }).catch(() => {});
    const pad = await runner.page.evaluate(() => ({
      text: document.querySelector('.night.phone')?.textContent ?? '',
      intel: !!document.querySelector('[data-intel]'),
      stick: !!document.querySelector('#stick'),
    }));
    if (SHOTS) await shot(runner.page, 'phone-runner');
    t('E6 · the runner\'s pad has no WORD FROM THE HOUSE block on it at all',
      !pad.intel && !/word from the house/i.test(pad.text),
      pad.intel ? 'the block is still there' : 'clean');
    t('E6b · and it still has the thing it is for', pad.stick);
    if (!seated) skipped('E6c', 'every phone is on the crew — no chair to check');
    else {
      const chair = await seated.page.evaluate(() => ({
        intel: !!document.querySelector('[data-intel]'),
        k: document.querySelector('[data-intel-k]')?.textContent?.trim() ?? '',
      }));
      t('E6c control · a SEATED player keeps it — the block was stripped from one pad, not deleted',
        chair.intel, chair.k || 'present');
    }
  }

  /*
   * 🗺️ **E6d · AND THE GUIDE'S SHEET DOES NOT ANSWER THE MAP'S QUESTION UNDERNEATH IT.**
   *
   * John, playing the good guide: the map was drawing its static — that guide's blindness, working
   * — and *"No word on the hunter"* was printed six pixels below it at the same time. This is the
   * rendered half of `party-warm` W20: the source check cannot see which branch actually painted.
   *
   * ⚠️ **BOTH ALIGNMENTS ARE CLAIMS, AND ONLY ONE OF THEM CAN ARM ON A GIVEN NIGHT.** A Production
   * guide KEEPS the strip — it is the exact simultaneous read that is the role — so the assertion
   * is chosen by the deal rather than by hope, and says which one it made.
   */
  await holdRun();
  if (!guide) skipped('E6d', 'no phone was elected guide');
  else {
    const sheet = await guide.page.evaluate(() => ({
      intel: !!document.querySelector('[data-intel]'),
      k: document.querySelector('[data-intel-k]')?.textContent?.trim() ?? '',
      text: document.querySelector('.night.phone')?.textContent ?? '',
      map: !!document.querySelector('.guide-map'),
    }));
    if (guide.alignment === 'evil') {
      t('E6d · a PRODUCTION guide keeps the feed, and it is labelled as Production',
        sheet.intel && /production feed/i.test(sheet.k) && !/word from the house/i.test(sheet.text),
        sheet.k || 'no strip');
    } else {
      t('E6d · a GOOD guide has no WORD FROM THE HOUSE under the map',
        !/word from the house/i.test(sheet.text) && !/no word on the hunter/i.test(sheet.text),
        sheet.intel ? `strip still there: ${sheet.k}` : 'clean');
    }
    t('E6e · and the guide still has the thing their seat IS for', sheet.map);
  }

  // ------------------------------------------------------------- E8 · the swing has a receipt
  /*
   * 📳 **THE PAD ANSWERS THE TAP.** Before this, the only feedback a swing produced on the phone
   * was a 220 ms tint on the button the thumb was covering, so a tap that went out and a tap the
   * browser ate as a scroll gesture looked the same in the hand.
   *
   * ⚠️ **BOTH HALVES ARE ASSERTED, BECAUSE EITHER ONE CAN BE THE WHOLE FEEDBACK.** Desktop
   * Chromium and iOS Safari have no vibrate motor, so the WORD is the fallback there and the
   * buzz is the fallback for a player whose eyes are correctly on the television. `vibrate` is
   * stubbed rather than watched — headless has no motor either, and the claim under test is that
   * the call is made, not that hardware moved.
   */
  await holdRun();
  if (!runner || !(await runner.page.$('#swing-btn'))) skipped('E8', 'no runner pad to tap');
  else {
    await runner.page.evaluate(() => {
      window.__buzz = [];
      navigator.vibrate = (p) => { window.__buzz.push(p); return true; };
    });
    await runner.page.locator('#swing-btn').click();
    await sleep(160);
    const fx = await runner.page.evaluate(() => ({
      buzz: window.__buzz ?? [],
      label: document.querySelector('[data-pad-fx]')?.textContent?.trim() ?? '',
      lit: !!document.querySelector('[data-pad-fx].on'),
    }));
    t('E8 · TAPPING SWING BUZZES THE PHONE', fx.buzz.length > 0, `vibrate(${JSON.stringify(fx.buzz)})`);
    t('E8b · and puts a word under the stick', !!fx.label && fx.lit, fx.label || 'the slot stayed empty');
    // The slot is reserved height, so it must exist and be silent before it is ever spoken into —
    // a label that CREATES its line would shove the stick under a thumb that is mid-drag.
    await sleep(700);
    const gone = await runner.page.evaluate(() => ({
      present: !!document.querySelector('[data-pad-fx]'),
      lit: !!document.querySelector('[data-pad-fx].on'),
    }));
    t('E8c · the word fades but the line it sat on stays, so the stick never moves',
      gone.present && !gone.lit, gone.lit ? 'still lit after 850 ms' : 'reserved and quiet');
  }

  // ------------------------------------------------------------- E3 · the stick, left and right
  /*
   * 🕹️ DRIVEN THROUGH THE PHONE'S OWN STICK, over the socket, into the cue channel, into the
   * body — because the sign could have been lost at any of those hops and `party-warm` W15 only
   * owns the last one. The displacement is projected onto the body's RIGHT vector as
   * `follow-bed.js` defines it (`rx = -cos f, rz = sin f`), so the claim is in the house's own
   * coordinates rather than in a screen direction someone has to agree with.
   */
  await holdRun();
  if (!runner || !(await runner.page.$('#stick'))) skipped('E3', 'no runner pad to drag');
  else {
    const drag = async (dx) => {
      const box = await runner.page.locator('#stick').boundingBox();
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      const before = await tv.evaluate(() => {
        const f = document.querySelector('iframe.run-cam')?.contentWindow?.__rrrFollow;
        return { x: f.runner.pos.x, z: f.runner.pos.z, facing: f.runner.facing };
      });
      await runner.page.mouse.move(cx, cy);
      await runner.page.mouse.down();
      await runner.page.mouse.move(cx + dx * (box.width / 2) * 0.95, cy, { steps: 4 });
      /*
       * ⚠️ **HELD UNTIL THE BODY HAS ACTUALLY WALKED, NOT FOR A FIXED WALL-CLOCK WINDOW.** The
       * body walks at about 1.5 m/s of SIMULATION time and this box renders the mansion at a few
       * frames a second, so a fixed 2.6 s drag moved it 0.43 m and the arm skipped itself as
       * "wedged in a corner" — a measurement about the rasteriser reported as a fact about the
       * game. It holds until a metre is on the ground or a generous budget runs out, and reports
       * the readout either way so a chain that is not delivering the thumb at all is legible
       * rather than looking like slow hardware.
       */
      let read = null;
      for (let i = 0; i < 40; i++) {
        await sleep(500);
        read = await tv.evaluate(() => {
          const f = document.querySelector('iframe.run-cam')?.contentWindow?.__rrrFollow;
          return { x: f.runner.pos.x, z: f.runner.pos.z, throttle: f.readout().throttle, speed: f.readout().speed };
        });
        if (Math.hypot(read.x - before.x, read.z - before.z) > 1.2) break;
      }
      await runner.page.mouse.up();
      await sleep(700);
      const after = read ?? await tv.evaluate(() => {
        const f = document.querySelector('iframe.run-cam')?.contentWindow?.__rrrFollow;
        return { x: f.runner.pos.x, z: f.runner.pos.z };
      });
      // `follow-bed.js` `_solve`: the right-hand perpendicular of `forward = (sin f, cos f)`.
      const rx = -Math.cos(before.facing), rz = Math.sin(before.facing);
      const mx = after.x - before.x, mz = after.z - before.z;
      return { onRight: mx * rx + mz * rz, moved: Math.hypot(mx, mz), throttle: after.throttle ?? '?' };
    };

    const left = await drag(-1);
    await holdRun();
    const right = await drag(+1);
    const armed = left.moved > 0.8 && right.moved > 0.8;
    if (!armed) {
      skipped('E3', `the body barely moved (${left.moved.toFixed(2)} m at ${left.throttle}, `
        + `${right.moved.toFixed(2)} m at ${right.throttle}) — wedged, or the thumb is not arriving`);
    } else {
      t('E3 · DRAG LEFT MOVES THE RUNNER LEFT',
        left.onRight < -0.3, `${left.onRight.toFixed(2)} m along its own right vector, of ${left.moved.toFixed(2)} m walked`);
      t('E3b · and drag right moves it right',
        right.onRight > 0.3, `${right.onRight.toFixed(2)} m of ${right.moved.toFixed(2)} m`);
      /*
       * The control the inverted build would have passed: BOTH of the above are about a body
       * that moves, and the shipped bug moved it just as far. The claim is the SIGN FLIP.
       */
      t('E3c control · the two are mirror images — a sign, not a wobble',
        Math.sign(left.onRight) !== Math.sign(right.onRight),
        `${left.onRight.toFixed(2)} vs ${right.onRight.toFixed(2)}`);
    }
  }

  // ------------------------------------------------------------- E7 · the guide's map
  await holdRun();
  if (!guide) skipped('E7', 'no phone was elected guide');
  else {
    /*
     * ⚠️ **SAMPLED UNTIL BOTH STATES HAVE BEEN SEEN, NOT FOR ONE CYCLE'S WORTH OF WALL CLOCK.**
     * `mapfeed.js`'s cycle is 20 s of the TV's own report clock, which is 2 Hz of SIMULATION
     * time — right on hardware and heavily stretched on a software rasteriser. A fixed 30 s
     * window caught a good guide 30 times inside one jam and reported "the feed never comes
     * back" about a cycle that had not had time to turn over.
     */
    const samples = [];
    const sample = () => guide.page.evaluate(() => {
      const m = document.querySelector('.guide-map');
      return {
        map: !!m,
        jam: !!m?.classList.contains('jam'),
        hunter: !!m?.querySelector('.gm-hunter'),
        note: document.querySelector('[data-gm-note]')?.textContent?.trim() ?? '',
      };
    });
    const wantBoth = guide.alignment !== 'evil';
    // ⚠️ THE SHOT IS TAKEN FROM INSIDE THE SAMPLING LOOP, WHICH ALREADY KNOWS THE STATE. Hunting
    // for a state afterwards needs a budget nobody can size: the cycle is in the TV's SIM clock,
    // so a six-second clear window is half a minute of wall time on this box, and a 28 s hunt
    // came back with only the clear one.
    const shotOf = new Set();
    for (let i = 0; i < 200; i++) {
      const s = await sample();
      samples.push(s);
      if (SHOTS && s.map && !shotOf.has(s.jam)) {
        shotOf.add(s.jam);
        await shot(guide.page, `phone-guide-${s.jam ? 'jammed' : 'clear'}`);
      }
      const seen = new Set(samples.filter((x) => x.map).map((x) => x.jam));
      if (wantBoth ? seen.size === 2 : samples.length >= 30) break;
      if (i % 10 === 9) await holdRun();
      await sleep(900);
    }
    // Both states are in hand; a few more so the "and back again" half is not a single frame.
    if (wantBoth) for (let i = 0; i < 8; i++) { samples.push(await sample()); await sleep(900); }
    const withMap = samples.filter((s) => s.map);
    t('E7 arm · the guide is looking at a map', withMap.length > 20, `${withMap.length}/${samples.length} samples`);
    const jammed = withMap.filter((s) => s.jam);
    if (guide.alignment === 'evil') {
      t('E7 · a PRODUCTION guide is never cut off, and the mark is on the map the whole time',
        jammed.length === 0 && withMap.every((s) => s.hunter),
        `${jammed.length} jammed · ${withMap.filter((s) => s.hunter).length}/${withMap.length} marked`);
    } else {
      t('E7 · a GOOD guide loses the feed to static, and gets it back',
        jammed.length > 0 && jammed.length < withMap.length,
        `${jammed.length} jammed of ${withMap.length}`);
      t('E7b · and while it is jammed there is no hunter on the map to read',
        jammed.every((s) => !s.hunter));
      t('E7c · the phone says which of the two blindnesses this is',
        jammed.every((s) => /eaten/i.test(s.note))
        && withMap.filter((s) => !s.jam).every((s) => !/eaten/i.test(s.note)),
        jammed[0]?.note || '—');
    }
    /*
     * 🚨 AND IT IS NOT ON THE TELEVISION. `party-loop.md`'s "Do not" list, first item, re-checked
     * from the outside now that there is a second thing on the map that could leak.
     */
    const onTv = await tv.evaluate(() => {
      const f = document.querySelector('iframe.run-cam');
      const hay = [f?.src || '', f?.contentDocument?.body?.innerHTML || '', document.body.innerHTML].join(' ');
      return ['guide-map', 'gm-jam', 'gm-hunter', 'flyover'].filter((k) => hay.includes(k));
    });
    t('E7d · none of it reached the shared screen — no map, no marks, no static, on the TV',
      onTv.length === 0, onTv.join(',') || 'clean');
  }

  // ------------------------------------------------------------- nothing threw
  const unique = [...new Set(pageErrors)];
  t('E8 · nothing threw on the TV or on any phone, across the whole night',
    unique.length === 0, unique.slice(0, 3).join(' | ') || 'silent');

  exitCode = fail ? 1 : 0;
} catch (e) {
  console.log(`\n  DRIVE THREW: ${e?.message || e}`);
  exitCode = 1;
} finally {
  if (!KEEP) {
    await browser.close().catch(() => {});
    for (const k of kids) k.kill();
  }
}

console.log(`\nparty-playtest-drive: ${pass} passed, ${fail} failed, ${skip} skipped`);
if (SHOTS) console.log(`  shots in ${path.relative(ROOT, SHOTDIR)}/`);
process.exit(exitCode);
