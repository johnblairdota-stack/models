#!/usr/bin/env node
/**
 * 📱 **phone-accusation — WHEN THE ROOM NAMES YOU, DOES THE THING IN YOUR HAND SAY SO?**
 *
 *   node harness/phone-accusation.mjs             the shipped arm, then the ablated control
 *   node harness/phone-accusation.mjs --measure   print the three sheets verbatim, assert nothing
 *   node harness/phone-accusation.mjs --keep      leave the servers and the browser up
 *
 * ---------------------------------------------------------------------------------------------
 * 🩸 WHAT IT MEASURES, AND THE NUMBERS IT WAS BUILT AGAINST
 * ---------------------------------------------------------------------------------------------
 * The Reckoning is the beat where the show accuses somebody. On the TELEVISION it is loud: a red
 * name tag on the accused's robot, and a right-hand board reading `Sam · NAMED BY JOHN · 3`.
 * On the PHONE, on the build of 2026-08-28 with two nominations standing, all eight sheets said
 * this and nothing else:
 *
 *   TV `.nom-board`      "1 Sam NAMED BY JOHN 3 · 2 Bo NAMED BY ELLIE 5"   2 seat chips
 *   nominator (John, 1)  "You have nominated. Watch the TV."               0 names · 0 chips
 *   nominee   (Sam, 3)   "Standing: Sam, Bo"                               0 chips
 *   bystander (Alex, 7)  "Standing: Sam, Bo"                               0 chips
 *
 * The nominee's copy and the bystander's copy were byte-identical. Three holes:
 *
 *   1. `Standing: Sam` NAMES NOBODY IN A ROOM WITH TWO SAMS. Duplicate names are a locked rule
 *      and the seat chip is the answer to it — already on every tappable row, the vote list, the
 *      vote receipt and the TV's own board, and missing from the one line that says who is on
 *      the block. Alexandria's sheet offered her `4 Sam` to tap while telling her `Sam` stood.
 *   2. THE PERSON WHO WAS JUST NAMED IS NOT TOLD. She had to read the accusation off someone
 *      else's screen.
 *   3. THE NOMINATOR HAD NO RECEIPT. Every other beat gives one — the Vote's is
 *      `The room recorded · [3] Sam` and `loop-ui-play` S1 gates it — and the Reckoning's
 *      placeholder was driven by the OPTIMISTIC local `state.nominated`, so it could lie. It did:
 *      see the driver note on the dev skip key below.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE PRIVACY LINE, AND WHY THIS GATE DOES NOT WIDEN IT
 * ---------------------------------------------------------------------------------------------
 * Nominations are public and **only `nominator` and `target` are** — `FANOUT_KEYS.nomRow` in
 * `net/party/local.mjs` and `CUE_NOM_KEYS` in `src/party/follow.js` are both exactly that pair.
 * Everything this file asserts is built from those two ids plus `players[].name` and the lobby
 * seat/accent, every one of which is an `all` row in `net/party/entitle.js`. **No field crosses
 * any wire for this that was not already crossing it**, and `party-isolation` (Tier 0) is the
 * gate that says so — run it alongside this one; a red there outranks a green here.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ A GATE WHOSE CONTROLS STOP FAILING HAS GONE BLIND
 * ---------------------------------------------------------------------------------------------
 * `party-isolation` reported 20 passed / 0 failed — including all four of its blindness controls
 * — while leaking the Glitched to every phone. So this file runs TWO ARMS against the SAME live
 * room, seconds apart, on the same standing nominations:
 *
 *   shipped   the real build, as served
 *   ablated   the same page with `[data-standing], .receipt { display:none }` injected — the
 *             fix's entire visible output removed, which is exactly the sheet measured above
 *
 * PA1–PA4 MUST GO RED IN THE ABLATED ARM. If one of them stays green it is reading something
 * other than what it claims to read, and the run fails on that instead. Both arms are judged by
 * the SAME function `A()`, so the control cannot drift away from the claim.
 *
 * **PA0 IS ABLATION-INVARIANT ON PURPOSE, AND IT IS THE VACUITY GUARD.** "Every standing nominee
 * carries a seat chip" is trivially true of a room with no standing nominees, so the ground truth
 * is established from two places the ablation cannot touch — the bystander's TAPPABLE list, which
 * lost exactly the two named seats, and the television — and it stays green in both arms. The
 * control therefore reads: the room still has two nominations, and the phone has simply stopped
 * saying so.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ TWO DRIVER TRAPS, BOTH OF WHICH FAKED A RESULT BEFORE THEY WERE FIXED
 * ---------------------------------------------------------------------------------------------
 * **THE DEV SKIP KEY CANNOT REACH A NOMINATABLE RECKONING.** `]` sends `{t:'show', beat}` and
 * that handler (`net/party/local.mjs` L1342) only calls `setShow` — never `enterReckoningLive`.
 * So the TV says RECKONING, every phone draws the nominate list, every tap is sent, and
 * `room.js` `nominatePlayer` refuses all of them with `not reckoning` because `state.phase` is
 * still whatever the last real transition left. The first run of this file did exactly that,
 * photographed three identical sheets, and would have "confirmed" the finding from an artefact of
 * its own driver. The Reckoning is therefore entered the way a room enters it: a READY majority
 * on the Debrief walks `progressShow` -> `enterReckoningLive`. `]` is used only to reach the
 * Debrief, a beat this file does not measure.
 *
 * (That failed run is also the evidence for hole 3 above: the server refused every nomination
 * and every phone still read "You have nominated. Watch the TV." over an empty ballot box.)
 *
 * **A CLICK THAT THREW IS NOT A NOMINATION.** `paint()` rebuilds `root.innerHTML` on every socket
 * message and the Reckoning clock ticks once a second, so a node is detached about once a second
 * and `locator.click()`'s two-frame stability check fails more often than it succeeds — silently,
 * as a swallowed timeout. A run lost BOTH nominations that way. Matching and clicking inside ONE
 * `evaluate` is atomic against the repaint, and every nomination is then believed only once the
 * SERVER's fanout has taken the target off a THIRD party's pick list.
 *
 * ⚠️ **SERVE `dist`, NEVER VITE.** The dev server garbles modules on this project and has
 * manufactured a false verdict twice. Same rule as `loop-ui-play` and `jellie-play`:
 * `npm run build` first (it runs the GLSL lint a stray backtick would fail), then serve `dist`.
 *
 * Shots and transcript land in `progress/phone-accusation/`.
 *
 * ---------------------------------------------------------------------------------------------
 * 🗓️ RUN LOG — what this file said on the day it was written, both ways round (2026-08-28)
 * ---------------------------------------------------------------------------------------------
 * Same room, same eight names, same two nominations, `John(1)->Sam(3)` and `Ellie(2)->Bo(5)`,
 * confirmed on the television both times: `1 Sam NAMED BY JOHN 3 · 2 Bo NAMED BY ELLIE 5`.
 *
 *   AGAINST THE BUILD THE FINDING WAS FILED AGAINST      13 passed, 6 failed, exit 1
 *     PA0/PA0b/PA0c   ok    7 -> 5 tappable rows, lost ["3 Sam","5 Bo"] · TV chips 2
 *     PA1  FAIL  standing rows on all three phones: []
 *     PA2  FAIL  (no standing rows)
 *     PA3  FAIL  no receipt on the nominator's sheet
 *     PA3b FAIL  no receipt
 *     PA4  FAIL  nothing on the named player's sheet
 *     PA5b FAIL  0 rows
 *   and the sheets themselves, which is the finding in one line — the nominee's copy and the
 *   bystander's copy are the same string:
 *     John(1)  "…Tap who you name Standing: Sam, Bo You have nominated. Watch the TV. READY…"
 *     Sam(3)   "…Tap who you name Standing: Sam, Bo First tap stands. No self-nom. 1 John…"
 *     Alex(7)  "…Tap who you name Standing: Sam, Bo First tap stands. No self-nom. 1 John…"
 *
 *   AGAINST THE SHIPPED BUILD                             19 passed, 0 failed, exit 0
 *     PA1  ok  John:["3+1","5+2"] Sam:["3+1","5+2"] Alexandria:["3+1","5+2"]
 *     PA2  ok  "3 Sam named by 1 John | 5 Bo named by 2 Ellie"
 *     PA3  ok  "THE ROOM RECORDED YOUR NOMINATION 3 Sam …" [chips 3]
 *     PA3b ok  receipt seat 3 · bystander's board 3<-1, 5<-2
 *     PA4  ok  "YOU HAVE BEEN NAMED BY 1 John You are standing. The room votes next." [chips 1]
 *     PA6  ok  doc 390px in 390px · PA6b READY bottom 654/786/786 of 844
 *     PA7  ok  all five go red under the ablation, on the same live sheet, seconds later
 *
 * Run alongside: `party-isolation` 24 passed / 0 failed, `party-warm` 474 passed / 0 failed,
 * and the whole `gates:party` chain green.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const KEEP = argv.includes('--keep');
const MEASURE = argv.includes('--measure');
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

const WEB = +arg('--port', 5197);
const WS = +arg('--wsPort', 5187);
const CODE = arg('--code', 'brav');        // CODE_ABC only — no i, l, o, 0, 1
const SHOTDIR = path.join(ROOT, 'progress', 'phone-accusation');

/*
 * Two Sams ON PURPOSE — duplicate names are a locked product rule and the seat chip is the only
 * thing that tells them apart. Seat 3 is named; seat 4 is not; they share a name.
 */
const NAMES = ['John', 'Ellie', 'Sam', 'Sam', 'Bo', 'Mary-Kate 3', 'Alexandria', 'Jo'];
const NOMINATOR = 0;   // John,  seat 1  -> names Sam, seat 3
const ACCUSED = 2;     // Sam,   seat 3
const NOMINATOR2 = 1;  // Ellie, seat 2  -> names Bo, seat 5
const ACCUSED2 = 4;    // Bo,    seat 5
const BYSTANDER = 6;   // Alexandria, seat 7 — named nobody, named by nobody
const SEAT = (i) => String(i + 1);

/** The ablation: the fix's entire visible output, removed. See the header. */
const ABLATE_CSS = '[data-standing], .receipt { display:none !important; }';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const say = (s) => { log.push(s); console.log(s); };
const checks = [];
/** Every claim goes through here, so the summary cannot be hand-written. */
function t(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail });
  say(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`);
}

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
console.log('\nphone-accusation — three phones, one Reckoning, two arms\n');

/* Room server IMPORTED, not spawned: local.mjs's CLI guard compares a file URL against a Windows
 * backslash path and is never true, so spawning it exits 0 with no listener. */
let roomServer = null;
if (await portOpen(WS)) say(`  reusing the room server on :${WS}`);
else {
  const { startServer } = await import(pathToFileURL(path.join(ROOT, 'net/party/local.mjs')).href);
  roomServer = startServer({ port: WS });
  await waitPort(WS, 12000, 'room server');
  say(`  room server on :${WS}`);
}
const DIST = path.join(ROOT, 'dist');
if (!existsSync(path.join(DIST, 'index.html'))) {
  throw new Error('no dist/index.html — run `npm run build` first. This harness never uses vite.');
}
if (await portOpen(WEB)) say(`  reusing a page server on :${WEB}`);
else {
  const p = spawn(process.execPath, [path.join(ROOT, 'harness/serve.mjs'), '--port', String(WEB), '--dir', 'dist'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d.toString(); });
  kids.push(p);
  try { await waitPort(WEB, 20000, 'page server'); say(`  serving dist on :${WEB}`); }
  catch (e) { throw new Error(`${e.message}\n${err}`); }
}

const base = `http://127.0.0.1:${WEB}`;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const PHONE_VP = { width: 390, height: 844 };
const shot = (page, name) => page.screenshot({ path: path.join(SHOTDIR, `${name}.png`) });

/**
 * What one phone's sheet actually SHOWS, read off the LAID-OUT page at 390x844. Everything is
 * filtered through a visibility test, so a `display:none` element counts for nothing — which is
 * what makes the ablated arm a real ablation rather than a rename.
 */
const readSheet = (page) => page.evaluate(() => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const txt = (el) => (el?.innerText || '').replace(/\s+/g, ' ').trim();
  const chips = (el) => [...el.querySelectorAll('.seat-chip')].filter(vis).map(txt);
  const seen = [...document.querySelectorAll('[data-standing]')].filter(vis);
  const rd = document.querySelector('#ready');
  const rr = rd ? rd.getBoundingClientRect() : null;
  const plate = [...document.querySelectorAll('.receipt.coerced')].filter(vis)[0] || null;
  const mine = [...document.querySelectorAll('.receipt:not(.coerced)')].filter(vis)[0] || null;
  return {
    text: txt(document.body),
    /** Rows you can still tap: the pick list, untouched by the ablation. */
    pickRows: [...document.querySelectorAll('[data-nom]')].filter(vis).map(txt),
    /** The standing board: one row per nomination, target chip first, nominator chip second. */
    standing: seen.map((el) => ({ text: txt(el), chips: chips(el), wide: el.scrollWidth > el.clientWidth + 1 })),
    /** The red plate only the named player gets. */
    namedPlate: plate ? { text: txt(plate), chips: chips(plate) } : null,
    /** The green receipt only the nominator gets. */
    myReceipt: mine ? { text: txt(mine), chips: chips(mine) } : null,
    ready: rr ? { top: Math.round(rr.top), bottom: Math.round(rr.bottom), onScreen: rr.top >= 0 && rr.bottom <= window.innerHeight + 1 } : null,
    docW: document.documentElement.scrollWidth,
    vw: window.innerWidth,
    vh: window.innerHeight,
  };
});

/** Both nominations, as the TELEVISION is airing them. An independent screen. */
const readTv = (tv) => tv.evaluate(() => {
  const b = document.querySelector('.nom-board');
  return b
    ? { chips: b.querySelectorAll('.seat-chip').length, txt: (b.innerText || '').replace(/\s+/g, ' ').trim() }
    : { chips: 0, txt: '' };
});

let exitCode = 1;
try {
  await mkdir(SHOTDIR, { recursive: true });

  const tv = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const errs = [];
  tv.on('pageerror', (e) => errs.push(`tv: ${e.message}`));
  await tv.goto(`${base}/?view=party.host&room=${CODE}&wsPort=${WS}&dev=1`, { waitUntil: 'domcontentloaded' });
  await tv.waitForSelector('.night-code', { timeout: 30000 });

  const phones = [];
  for (let i = 0; i < NAMES.length; i++) {
    const p = await (await browser.newContext({ viewport: PHONE_VP })).newPage();
    p.on('pageerror', (e) => errs.push(`${NAMES[i]}: ${e.message}`));
    await p.goto(`${base}/?view=party.phone&wsPort=${WS}&dev=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#code', { timeout: 30000 });
    await p.fill('#code', CODE.toUpperCase());
    await p.fill('#name', NAMES[i]);
    await p.click('#join');
    await p.waitForSelector('#lock-look', { timeout: 30000 });
    await p.click('#lock-look');
    phones.push({ page: p, name: NAMES[i], i });
  }
  say(`  ${NAMES.length} phones joined — two of them are called Sam`);
  await sleep(1500);

  await tv.evaluate(async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 300000) {
      const b = document.querySelector('#go');
      if (b && !b.disabled) { b.click(); return true; }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  });
  await sleep(2500);
  const beatOf = () => tv.evaluate(() => (document.body.innerText.match(/EPISODE\s+\d+\s*[·.]\s*([A-Z]+)/) || [])[1] || '');
  say(`  the night started — beat ${await beatOf()}`);

  /* Casting is PLAYED, not skipped: a pair has to lock or the episode never deals. */
  for (const ph of phones) { await ph.page.click('#card-done', { timeout: 6000 }).catch(() => {}); await sleep(120); }
  await sleep(1200);
  for (let ballot = 0; ballot < 2; ballot++) {
    for (let i = 0; i < phones.length; i++) {
      const pick = phones[(i + 1 + ballot) % phones.length].name;
      const b = await phones[i].page.$(`button:has-text("${pick}")`);
      if (b) await b.click({ timeout: 2500 }).catch(() => {});
      await sleep(140);
      const lock = await phones[i].page.$('button:has-text("LOCK")');
      if (lock) await lock.click({ timeout: 2500 }).catch(() => {});
      await sleep(140);
    }
    await sleep(900);
  }
  await sleep(3000);
  say(`  casting played — beat ${await beatOf()}`);

  /* `]` walks as far as the DEBRIEF only. See the header on why it cannot go further. */
  let reached = '';
  let stuck = Date.now();
  let lastBeat = null;
  for (let i = 0; i < 120; i++) {
    reached = await beatOf();
    if (reached !== lastBeat) { lastBeat = reached; stuck = Date.now(); }
    if (reached === 'DEBRIEF') break;
    if (Date.now() - stuck > 20000) {
      await tv.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true })));
      stuck = Date.now();
    }
    await sleep(1200);
  }
  say(`  walked to ${reached}`);

  /*
   * A majority of the living taps READY — the beat's own exit, and the only door into a
   * Reckoning whose PHASE is actually RECKONING. READY is a TOGGLE, so each phone is tapped at
   * most once and the count is read back off the sheet: an earlier version assumed five taps
   * meant five thumbs, landed three, and sat on the Debrief.
   */
  for (const ph of phones) {
    const on = await ph.page.evaluate(() => !!document.querySelector('#ready.on'));
    if (!on) await ph.page.click('#ready', { timeout: 5000 }).catch(() => {});
    await sleep(300);
    const line = await ph.page.evaluate(() => document.querySelector('[data-ready-line]')?.textContent?.trim() || '');
    const m = line.match(/(\d+)\s+of\s+(\d+)/);
    if (m && +m[1] >= +m[2]) break;
  }
  for (let i = 0; i < 30 && (await beatOf()) !== 'RECKONING'; i++) await sleep(1000);
  const beatBefore = await beatOf();
  say(`  a majority tapped READY — beat is now ${beatBefore}`);
  await sleep(1000);

  const before = await readSheet(phones[BYSTANDER].page);
  await shot(phones[BYSTANDER].page, '01-phone-reckoning-before');
  say(`  before any nomination · ${NAMES[BYSTANDER]}'s pick list: ${before.pickRows.length} tappable rows`);

  /* ---- two nominations land, and are believed only once the SERVER has fanned them out ---- */
  const standingOnBystander = () => phones[BYSTANDER].page.evaluate(() =>
    [...document.querySelectorAll('[data-nom]')].map((b) => (b.innerText || '').replace(/\s+/g, ' ').trim()));
  const tapNom = (from, want) => phones[from].page.evaluate((w) => {
    for (const b of document.querySelectorAll('[data-nom]')) {
      if ((b.innerText || '').replace(/\s+/g, ' ').trim() === w) { b.click(); return b.dataset.nom; }
    }
    return null;
  }, want);
  const nom = async (from, whoIdx) => {
    const want = `${SEAT(whoIdx)} ${NAMES[whoIdx]}`;   // pinned on the SEAT so the two Sams cannot swap
    for (let attempt = 0; attempt < 4; attempt++) {
      await tapNom(from, want);
      await sleep(700);
      if (!(await standingOnBystander()).includes(want)) return want;
    }
    return null;
  };
  const l1 = await nom(NOMINATOR, ACCUSED);
  const l2 = await nom(NOMINATOR2, ACCUSED2);
  await sleep(1400);
  say(`  ${NAMES[NOMINATOR]} named "${l1}" · ${NAMES[NOMINATOR2]} named "${l2}"`);

  /*
   * ⚠️ **BOTH READS HAPPEN BEFORE ANY SCREENSHOT, AND THE TELEVISION IS PHOTOGRAPHED LAST.**
   * The Reckoning is `reckoningSeconds(2)` = 75s long and a 1600x900 shot of the live ballroom
   * costs tens of seconds under swiftshader. The first cut photographed the TV between the two
   * arms, the clock walked to the Vote while the shutter was open, and the ablated arm was read
   * off a sheet with no nominate list on it at all — a control that went red for the wrong
   * reason. PA0c is the assertion that catches exactly that, and it is why it exists.
   */
  /* ---- ARM 1 · the shipped build ---------------------------------------------------------- */
  const beatAtRead = await beatOf();
  const tvNoms = await readTv(tv);
  const shipped = {};
  for (const k of [NOMINATOR, ACCUSED, BYSTANDER]) shipped[k] = await readSheet(phones[k].page);
  await shot(phones[NOMINATOR].page, '03-phone-nominator');
  await shot(phones[ACCUSED].page, '04-phone-nominee');
  await shot(phones[BYSTANDER].page, '05-phone-bystander');

  /* ---- ARM 2 · the same room, the same nominations, the fix's output removed --------------- */
  const gags = [];
  for (const k of [NOMINATOR, ACCUSED, BYSTANDER]) gags.push(await phones[k].page.addStyleTag({ content: ABLATE_CSS }));
  await sleep(600);
  const ablated = {};
  for (const k of [NOMINATOR, ACCUSED, BYSTANDER]) ablated[k] = await readSheet(phones[k].page);
  const tvAblated = await readTv(tv);
  const beatAfter = await beatOf();
  await shot(phones[ACCUSED].page, '06-phone-nominee-ABLATED');
  for (const g of gags) await g.evaluate((el) => el.remove()).catch(() => {});
  await shot(tv, '02-tv-reckoning-named');

  /* ---- the sheets, verbatim ---------------------------------------------------------------- */
  const LABEL = {
    [NOMINATOR]: `NOMINATOR ${NAMES[NOMINATOR]}`,
    [ACCUSED]: `NOMINEE ${NAMES[ACCUSED]}`,
    [BYSTANDER]: `BYSTANDER ${NAMES[BYSTANDER]}`,
  };
  say('\n  ---------------- THE THREE SHEETS AT 390x844, SHIPPED ARM ----------------');
  for (const k of [NOMINATOR, ACCUSED, BYSTANDER]) {
    const s = shipped[k];
    say(`\n  == ${LABEL[k]} (seat ${SEAT(k)}) ==`);
    say(`     text     : ${s.text}`);
    say(`     pick rows: ${JSON.stringify(s.pickRows)}`);
    say(`     standing : ${JSON.stringify(s.standing.map((r) => `${r.text} [chips ${r.chips.join('/')}]`))}`);
    say(`     named by : ${s.namedPlate ? `${s.namedPlate.text} [chips ${s.namedPlate.chips.join('/')}]` : '—'}`);
    say(`     receipt  : ${s.myReceipt ? `${s.myReceipt.text} [chips ${s.myReceipt.chips.join('/')}]` : '—'}`);
  }
  say(`\n  TV nominee board: chips=${tvNoms.chips} · ${tvNoms.txt}`);
  say(`  beat: ${beatBefore} -> ${beatAtRead} (shipped read) -> ${beatAfter} (ablated read)`);

  if (MEASURE) {
    await writeFile(path.join(SHOTDIR, 'transcript.txt'), log.join('\n'));
    exitCode = 0;
  } else {
    /* =======================================================================================
     * THE ASSERTIONS. `A(arm)` returns the named booleans for one arm, so the shipped arm and
     * the ablated arm are judged by the SAME code and the control cannot drift from the claim.
     * ======================================================================================= */
    const A = (s) => {
      const rows = s[BYSTANDER].standing;
      const named = new Set([SEAT(ACCUSED), SEAT(ACCUSED2)]);
      const three = [NOMINATOR, ACCUSED, BYSTANDER];
      return {
        /** PA1 — every standing name, on every phone, carries its seat number. */
        seats: three.every((k) =>
          s[k].standing.length === 2
          && s[k].standing.every((r) => r.chips.length >= 1 && named.has(r.chips[0]))
          && new Set(s[k].standing.map((r) => r.chips[0])).size === 2),
        /** PA2 — and says WHO named them, with THEIR seat, on every phone. */
        by: three.every((k) =>
          s[k].standing.length === 2
          && s[k].standing.every((r) => /named by/i.test(r.text) && r.chips.length >= 2)
          && s[k].standing.some((r) => r.chips[0] === SEAT(ACCUSED) && r.chips[1] === SEAT(NOMINATOR) && r.text.includes(NAMES[NOMINATOR]))
          && s[k].standing.some((r) => r.chips[0] === SEAT(ACCUSED2) && r.chips[1] === SEAT(NOMINATOR2) && r.text.includes(NAMES[NOMINATOR2]))),
        /** PA3 — the nominator gets a receipt quoting what the ROOM recorded, with the seat. */
        receipt: !!s[NOMINATOR].myReceipt
          && /room recorded/i.test(s[NOMINATOR].myReceipt.text)
          && s[NOMINATOR].myReceipt.chips[0] === SEAT(ACCUSED)
          && s[NOMINATOR].myReceipt.text.includes(NAMES[ACCUSED]),
        /**
         * PA3b — and it quotes the SERVER, not this phone's optimism. The target on the receipt
         * has to match a row a THIRD party's board received over the fanout. `state.nominated`
         * is set by the thumb and can be true over an empty ballot box; that is what this pins.
         */
        provenance: !!s[NOMINATOR].myReceipt
          && rows.some((r) => r.chips[0] === s[NOMINATOR].myReceipt.chips[0] && r.chips[1] === SEAT(NOMINATOR)),
        /** PA4 — the named player is told she was named, and by whom, with the seat. */
        told: !!s[ACCUSED].namedPlate
          && /named by/i.test(s[ACCUSED].namedPlate.text)
          && s[ACCUSED].namedPlate.chips[0] === SEAT(NOMINATOR)
          && s[ACCUSED].namedPlate.text.includes(NAMES[NOMINATOR]),
      };
    };
    const ship = A(shipped);
    const abl = A(ablated);

    /* ---- PA0 · GROUND TRUTH, and it must survive the ablation ---------------------------- */
    const lost = before.pickRows.filter((r) => !shipped[BYSTANDER].pickRows.includes(r));
    t('PA0 · the room really does have two standing nominations — the bystander\'s TAPPABLE list lost exactly the two named seats',
      before.pickRows.length === 7 && shipped[BYSTANDER].pickRows.length === 5
        && lost.length === 2
        && lost.some((r) => r.startsWith(`${SEAT(ACCUSED)} `)) && lost.some((r) => r.startsWith(`${SEAT(ACCUSED2)} `)),
      `${before.pickRows.length} -> ${shipped[BYSTANDER].pickRows.length} rows · lost ${JSON.stringify(lost)}`);
    t('PA0b · and the television is airing both of them, by name and by nominator',
      tvNoms.chips >= 2
        && new RegExp(`${NAMES[ACCUSED]}[\\s\\S]*NAMED BY ${NAMES[NOMINATOR]}`, 'i').test(tvNoms.txt)
        && new RegExp(`${NAMES[ACCUSED2]}[\\s\\S]*NAMED BY ${NAMES[NOMINATOR2]}`, 'i').test(tvNoms.txt),
      `${tvNoms.chips} chips · ${tvNoms.txt || '(empty board)'}`);
    t('PA0c · both arms were read on the same beat, with the same two nominations still standing',
      beatAtRead === 'RECKONING' && beatAfter === 'RECKONING'
        && ablated[BYSTANDER].pickRows.length === 5 && tvAblated.chips >= 2,
      `${beatAtRead} / ${beatAfter} · ablated pick rows ${ablated[BYSTANDER].pickRows.length} · TV chips ${tvAblated.chips}`);

    /* ---- PA1–PA4 · the shipped arm -------------------------------------------------------- */
    t('PA1 · every standing name on every phone carries its seat number — two Sams, and only one of them is on the block',
      ship.seats,
      [NOMINATOR, ACCUSED, BYSTANDER].map((k) => `${NAMES[k]}:${JSON.stringify(shipped[k].standing.map((r) => r.chips.join('+')))}`).join(' '));
    t('PA2 · and every standing row names WHO named them, with the nominator\'s seat',
      ship.by, shipped[BYSTANDER].standing.map((r) => r.text).join(' | ') || '(no standing rows)');
    t('PA3 · the nominator gets a receipt quoting what the room recorded, with the seat',
      ship.receipt,
      shipped[NOMINATOR].myReceipt
        ? `${shipped[NOMINATOR].myReceipt.text} [chips ${shipped[NOMINATOR].myReceipt.chips.join('/')}]`
        : 'no receipt on the nominator\'s sheet');
    t('PA3b · and the receipt quotes the SERVER\'s row, not this phone\'s optimistic state.nominated',
      ship.provenance,
      shipped[NOMINATOR].myReceipt
        ? `receipt seat ${shipped[NOMINATOR].myReceipt.chips[0]} · bystander's board ${shipped[BYSTANDER].standing.map((r) => r.chips.join('<-')).join(', ')}`
        : 'no receipt');
    t('PA4 · the player who was just named is told so, and told who named her',
      ship.told,
      shipped[ACCUSED].namedPlate
        ? `${shipped[ACCUSED].namedPlate.text} [chips ${shipped[ACCUSED].namedPlate.chips.join('/')}]`
        : 'nothing on the named player\'s sheet');

    /* ---- PA5 · the bystander control — an absence, green in both arms --------------------- */
    t('PA5 control · the phone of somebody nobody named never says she was named',
      !shipped[BYSTANDER].namedPlate && !shipped[BYSTANDER].myReceipt
        && !/you have been named/i.test(shipped[BYSTANDER].text),
      `${NAMES[BYSTANDER]}: plate ${shipped[BYSTANDER].namedPlate ? 'PRESENT' : 'none'} · receipt ${shipped[BYSTANDER].myReceipt ? 'PRESENT' : 'none'}`);
    t('PA5b control · and the board carries the two nominees only — it is not just reprinting the room',
      shipped[BYSTANDER].standing.length === 2
        && !shipped[BYSTANDER].standing.some((r) => r.chips[0] === SEAT(BYSTANDER)),
      `${shipped[BYSTANDER].standing.length} rows · seats ${shipped[BYSTANDER].standing.map((r) => r.chips[0]).join(',')}`);

    /* ---- PA6 · the taller sheet still fits a phone ---------------------------------------- */
    const wide = [NOMINATOR, ACCUSED, BYSTANDER].filter((k) =>
      shipped[k].docW > shipped[k].vw + 1 || shipped[k].standing.some((r) => r.wide));
    t('PA6 · the taller sheet still fits 390px — no horizontal scroll, no row wider than its button',
      wide.length === 0,
      wide.length ? `overflowing: ${wide.map((k) => NAMES[k]).join(', ')}` : `doc ${shipped[ACCUSED].docW}px in ${shipped[ACCUSED].vw}px`);
    t('PA6b · and READY is still on screen under all three sheets — the Reckoning dock still does its work',
      [NOMINATOR, ACCUSED, BYSTANDER].every((k) => shipped[k].ready?.onScreen),
      [NOMINATOR, ACCUSED, BYSTANDER].map((k) => `${NAMES[k]} ${shipped[k].ready ? `${shipped[k].ready.bottom}/${shipped[k].vh}` : 'MISSING'}`).join(' · '));

    /* ---- PA7 · THE ABLATED ARM. Every claim above must go red without the fix's output ---- */
    say('\n  ---- ablated arm · `[data-standing], .receipt { display:none }` on the same three phones ----');
    const WANT_RED = [['PA1', 'seats'], ['PA2', 'by'], ['PA3', 'receipt'], ['PA3b', 'provenance'], ['PA4', 'told']];
    for (const [nm, key] of WANT_RED) {
      t(`PA7 control · ${nm} goes RED when the fix's output is removed from the same live sheet`,
        abl[key] === false, `ablated ${nm} = ${abl[key]}`);
    }
    t('PA7f control · and the ablated sheets are the sheets this finding was filed against — nominee and bystander read alike',
      ablated[ACCUSED].standing.length === 0 && ablated[BYSTANDER].standing.length === 0
        && !ablated[ACCUSED].namedPlate && !ablated[NOMINATOR].myReceipt,
      `nominee standing ${ablated[ACCUSED].standing.length} · plate ${ablated[ACCUSED].namedPlate ? 'PRESENT' : 'none'} · nominator receipt ${ablated[NOMINATOR].myReceipt ? 'PRESENT' : 'none'}`);

    if (errs.length) say(`  ⚠️ errors thrown: ${[...new Set(errs)].slice(0, 6).join(' | ')}`);
    t('PA8 · no page threw', errs.length === 0, errs.length ? `${errs.length} errors` : 'clean');

    const bad = checks.filter((c) => !c.ok);
    say(`\n  phone-accusation: ${checks.length - bad.length} passed, ${bad.length} failed`);
    say('  shots + transcript in progress/phone-accusation/');
    await writeFile(path.join(SHOTDIR, 'transcript.txt'), log.join('\n'));
    exitCode = bad.length ? 1 : 0;
  }
} catch (e) {
  console.error(`\n  phone-accusation died: ${e?.stack || e}\n`);
  await writeFile(path.join(SHOTDIR, 'transcript.txt'), `${log.join('\n')}\n\nDIED: ${e?.message}`).catch(() => {});
} finally {
  if (!KEEP) {
    await browser.close().catch(() => {});
    for (const k of kids) k.kill();
    roomServer?.close?.();
  }
  process.exit(exitCode);
}
