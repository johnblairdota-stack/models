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
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const KEEP = argv.includes('--keep');
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

const WEB = +arg('--port', 5199);
const WS = +arg('--wsPort', 5189);
const CODE = arg('--code', 'jazz');          // must use CODE_ABC — no i, l, o, 0, 1
const PHONES = +arg('--phones', 3);
const SHOTDIR = path.join(ROOT, 'progress', 'jellie');

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
/* =============================================================================================
 * 🚨 **SERVE `dist`, NEVER VITE. THIS FILE HAS MANUFACTURED A FALSE VERDICT TWICE.**
 *
 * On the dev server the phone intermittently dies with `ReferenceError: linkBlock is not defined`
 * — on a line where `linkBlock` IS imported — and the accept silently never lands. A play critic
 * ran this harness exactly as documented, watched CONNECT do nothing twice, and was about to
 * file "the feature is completely broken"; against `dist` the same accept lands in **57ms**.
 * A second critic hit the same phantom. It is the dev-server module garbling this project has
 * been bitten by before, and an instrument that hands a critic a phantom is worse than no
 * instrument.
 *
 * The build is a hard requirement, not a convenience: this refuses to run against a stale or
 * missing `dist` rather than photographing yesterday's code.
 * ============================================================================================= */
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

async function ctxFor(viewport) {
  const c = await browser.newContext({ viewport });
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

  /* =========================================================================================
   * 🚨 **DO NOT `]` PAST CASTING. THE FIRST VERSION OF THIS FILE DID, AND IT LIED.**
   *
   * The seated circle — the robots, the chairs, the name tags — is placed DURING Casting. Skip
   * Casting and you arrive at a Debrief in an EMPTY BALLROOM, so every screenshot this harness
   * took of "the room watching a pair form" was a photograph of an empty room with no tags in
   * it. A play critic caught it and had to build their own control to prove the feature was not
   * missing; a second critic's whole run was affected before anyone noticed. **An instrument
   * that quietly photographs the wrong thing is worse than no instrument** — it manufactures
   * confident, wrong conclusions, and this one nearly cost a working feature.
   *
   * So Casting is PLAYED: put the card down, tap a runner, LOCK, tap a guide, LOCK, on every
   * phone. The `]` key stays for the Expedition, which genuinely cannot end on its own here
   * because nobody is driving the runner.
   * ========================================================================================= */
  const playCasting = async () => {
    for (const ph of phones) { await ph.page.click('#card-done', { timeout: 5000 }).catch(() => {}); await sleep(200); }
    await sleep(1200);
    for (let ballot = 0; ballot < 2; ballot++) {
      for (let i = 0; i < phones.length; i++) {
        const pick = phones[(i + 1 + ballot) % phones.length].name;
        const b = await phones[i].page.$(`button:has-text("${pick}")`);
        if (b) await b.click({ timeout: 2500 }).catch(() => {});
        await sleep(220);
        const lock = await phones[i].page.$('button:has-text("LOCK")');
        if (lock) await lock.click({ timeout: 2500 }).catch(() => {});
        await sleep(220);
      }
      await sleep(900);
    }
    await sleep(2500);
  };
  const beatOf = () => tv.evaluate(() => (document.body.innerText.match(/EPISODE\s+\d+\s*[·.]\s*([A-Z]+)/) || [])[1] || '');

  await playCasting();
  say('  casting played for real — the circle is seated');
  let stuckSince = Date.now(); let last = null;
  for (let i = 0; i < 90; i++) {
    const b = await beatOf();
    if (b !== last) { last = b; stuckSince = Date.now(); }
    if (b === 'DEBRIEF') break;
    // Nobody is driving the runner, so the Expedition never ends on its own. Nudge only there.
    if (Date.now() - stuckSince > 25000) {
      await tv.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true })));
      stuckSince = Date.now();
    }
    await sleep(1500);
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

  /* =========================================================================================
   * ⏱️ **ANSWER FIRST, PHOTOGRAPH SECOND. THE HARNESS WAS SLOWER THAN THE GAME'S OWN TIMEOUT.**
   *
   * This used to click, sleep, screenshot John, screenshot the TELEVISION, screenshot Ellie, and
   * only then look for the Connect button — and it threw "Ellie was never offered a Connect
   * button" on a build where everything worked. A server trace named it exactly: the request had
   * stood for **20.2 seconds** and `LINK_REQUEST_MS` is 20. The reach-out had lapsed, correctly,
   * while this file was writing a 1 MB PNG of a WebGL ballroom under swiftshader.
   *
   * A fourth false verdict from this one harness, and the same shape as the other three: the
   * instrument was measuring itself. So the round trip that has a deadline on it happens FIRST,
   * and the expensive captures happen after, when nothing is racing a clock.
   * ========================================================================================= */
  const elliePage = phones[1].page;
  await shot(johnPage, '03-john-waiting');                 // a phone PNG is small and quick
  const accept = await elliePage.waitForSelector('[data-accept]', { timeout: 8000 }).catch(() => null);
  await shot(elliePage, '05-ellie-asked');
  if (!accept) throw new Error('Ellie was never offered a Connect button');
  say(`  [Ellie] ${(await text(elliePage)).slice(0, 160)}`);

  /*
   * ⚠️ **READ THE TELEVISION, DO NOT PHOTOGRAPH IT — NOT INSIDE THIS WINDOW.** A 1600x900 PNG of
   * a live WebGL ballroom under swiftshader costs seconds, and there are only twenty of them
   * before the reach-out lapses. `innerText` costs nothing and answers the same question. The
   * TV's picture during a pair is photographed at `08-tv-merged`, after the clock stops mattering.
   */
  const tvPending = (await text(tv)).match(/reach\w* out to \w+/i)?.[0];
  say(`  [TV] ${tvPending || 'NO PUBLIC LINE ON THE TV'}`);

  /* ---- 2 · the accept ----------------------------------------------------------------------
   * ⚠️ CLICK BY SELECTOR, NOT THROUGH THE HANDLE TAKEN ABOVE. `paint()` rewrites `root.innerHTML`
   * on every socket message — several times a second — so any handle held across a await is
   * detached by the time it is used ("Element is not attached to the DOM"). Playwright re-finds a
   * selector on each attempt; a handle is a photograph of a node that no longer exists.
   */
  await elliePage.click('[data-accept]', { timeout: 8000 });
  await sleep(2000);

  /* Wait for the pair rather than sampling once: the accept has to round-trip the server and
   * come back as a  fanout, and a fixed sleep turns a slow machine into a false negative. */
  await johnPage.waitForSelector('.pair-name', { timeout: 15000 })
    .catch(async () => { say(); });
  const merged = await johnPage.evaluate(() => document.querySelector('.pair-name')?.textContent?.trim() || null);
  say(`  MERGED NAME: ${merged}`);

  /* =========================================================================================
   * 🟢 THE DATA STREAM — glyphs actually in flight between the two plates, not just a module
   * that exists. Read out of the follow iframe, which is same-origin.
   *
   * ⚠️ Sampled TWICE, a second apart, because the failure this catches is a stream that is built
   * and never stepped: the sprite count would be perfect and nothing would move. Comparing two
   * samples is the control — `lit` breathes as glyphs fade in and out along the line.
   * ========================================================================================= */
  const readStream = () => tv.evaluate(() => {
    const f = document.querySelector('iframe');
    const w = f?.contentWindow;
    return w?.__rrrFollow?.stream?.() ?? null;
  });
  const s1 = await readStream();
  await sleep(1100);
  const s2 = await readStream();
  if (!s1) say('  ⚠️ STREAM: no follow handle — could not measure');
  else if (!s1.length) say('  ⚠️ STREAM: a pair is live and NO stream is flying');
  else {
    say(`  STREAM: ${s1.length} flying · ${s1[0].particles} glyphs · lit ${s1[0].lit} -> ${s2?.[0]?.lit}`
      + ` · age ${s1[0].age?.toFixed?.(1)}s -> ${s2?.[0]?.age?.toFixed?.(1)}s`);
    if (!(s2?.[0]?.age > s1[0].age)) say('  ⚠️ STREAM IS NOT BEING STEPPED — it was built and left frozen');
  }
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

  /* ---- 4b · THE REFUSAL, and the disconnect. -----------------------------------------------
   * A design critic running eight phones found both of these were invisible: a refusal left no
   * trace on the television OR on the refused player's phone, and a partner walking out dropped
   * you back to the pick list with no idea why. They are the two most socially loaded moments
   * the mechanic produces, so the playthrough has to actually perform them.
   */
  if (phones[2]) {
    const ozzPage = phones[2].page;
    // Ozz reaches out to whoever is left, and gets turned down.
    const target = await ozzPage.$('[data-link]:not([disabled])');
    if (target) {
      const who = (await target.innerText()).trim();
      await target.click();
      await sleep(1200);
      const asked = phones.find(async (p) => p.page !== ozzPage);
      // Find the phone that was asked and press NO.
      for (const p of phones) {
        const no = await p.page.$('[data-decline]');
        if (no) {
          await no.click();
          await sleep(1200);
          await shot(tv, '14-tv-refused');
          await shot(ozzPage, '15-ozz-refused');
          const line = (await text(tv)).match(/TURNED \w+ DOWN/i)?.[0];
          say(`  Ozz reached out to ${who} and was refused. [TV] ${line || 'NO REFUSAL LINE ON THE TV'}`);
          say(`  [Ozz's phone] ${(await text(ozzPage)).match(/They said no\.?/i)?.[0] || 'NOT TOLD HE WAS REFUSED'}`);
          break;
        }
      }
    }
  }
  {
    // John walks out on Ellie mid-conversation.
    const bye = await johnPage.$('#unlink');
    if (bye) {
      await bye.click();
      await sleep(1500);
      await shot(elliePage, '16-ellie-dumped');
      await shot(johnPage, '17-john-after-leaving');
      say(`  John disconnected. [Ellie] ${(await text(elliePage)).match(/They disconnected\.?/i)?.[0] || 'NOT TOLD SHE WAS DUMPED'}`);
      const johnOpts = await johnPage.$$('[data-link]:not([disabled])');
      say(`  can John immediately re-pair with someone else? ${johnOpts.length} live options (0 = the hub is closed)`);
    }
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
