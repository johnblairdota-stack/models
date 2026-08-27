/**
 * loop-ui-play — drive EIGHT phones through the loop and MEASURE the round-5 UI claims.
 *
 *   node harness/loop-ui-play.mjs                 # writes progress/r5/
 *   node harness/loop-ui-play.mjs --keep          # leave the servers up
 *
 * WHY THIS EXISTS AND WHY IT MEASURES INSTEAD OF ASSERTING ON SOURCE.
 *
 * `party-warm` W35 proves the code says the right words and `link-merge` L100 proves the wire
 * carries the right shape. Neither can see a button that is 28 pixels below the fold, and that is
 * exactly what D12 was: READY, on the beat whose only early exit is READY, off the bottom of an
 * eight-player Reckoning. A source grep would have called that fixed the moment the CSS changed.
 *
 * So every claim below is read off a LAID-OUT PAGE at 390x844 — the shape of the thing in a
 * guest's hand — or off the television at 1600x900, and every one is photographed.
 *
 * ⚠️ **SERVE `dist`, NEVER VITE.** The dev server garbles modules on this project and has
 * manufactured a false "completely broken" verdict twice. Same rule as `jellie-play`.
 *
 * ⚠️ **CASTING IS PLAYED, NOT SKIPPED.** The seated circle is placed DURING Casting; skipping it
 * photographs an empty ballroom with no robots and no name tags in it.
 *
 * A playtest instrument, not a gate: it needs a browser and it is meant to be edited.
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

const WEB = +arg('--port', 5198);
const WS = +arg('--wsPort', 5188);
const CODE = arg('--code', 'zeta');          // CODE_ABC only — no i, l, o, 0, 1
const PHONES = +arg('--phones', 8);
const SHOTDIR = path.join(ROOT, 'progress', 'r5');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const say = (s) => { log.push(s); console.log(s); };
const checks = [];
/** Every claim this file makes goes through here, so the summary cannot be hand-written. */
function claim(name, ok, detail = '') {
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
console.log('\nloop-ui-play — eight phones, the whole loop, measured\n');

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
const text = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
const count = (page, sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);

/** Is this element fully inside the viewport a thumb can reach without scrolling? */
const inView = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  return {
    found: true,
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    vh: window.innerHeight,
    // ⚠️ `.night.phone` is position:fixed with its own overflow, so documentElement.scrollHeight
    // is ALWAYS the viewport height and says nothing about whether the sheet overflows.
    contentH: Math.round((document.querySelector('.night.phone') || document.documentElement).scrollHeight),
    onScreen: r.top >= 0 && r.bottom <= window.innerHeight + 1,
  };
}, sel);

let exitCode = 1;
try {
  await mkdir(SHOTDIR, { recursive: true });

  const tv = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  const errs = [];
  tv.on('pageerror', (e) => errs.push(`tv: ${e.message}`));
  await tv.goto(`${base}/?view=party.host&room=${CODE}&wsPort=${WS}&dev=1`, { waitUntil: 'domcontentloaded' });
  await tv.waitForSelector('.night-code', { timeout: 20000 });
  say('  TV is up on the lobby');

  // Two players share a name ON PURPOSE. D6/S1 is only visible when they do.
  const NAMES = ['John', 'Ellie', 'Sam', 'Sam', 'Bo', 'Mary-Kate 3', 'Alexandria', 'Jo'];
  const phones = [];
  for (let i = 0; i < PHONES; i++) {
    const p = await (await browser.newContext({ viewport: PHONE_VP })).newPage();
    p.on('pageerror', (e) => errs.push(`${NAMES[i]}: ${e.message}`));
    await p.goto(`${base}/?view=party.phone&wsPort=${WS}&dev=1`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#code', { timeout: 20000 });
    await p.fill('#code', CODE.toUpperCase());
    await p.fill('#name', NAMES[i]);
    await p.click('#join');
    await p.waitForSelector('#lock-look', { timeout: 20000 });
    await p.click('#lock-look');
    phones.push({ page: p, name: NAMES[i] });
  }
  say(`  ${PHONES} phones joined by typing the code — two of them are called Sam`);
  await sleep(1500);

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

  const beatOf = () => tv.evaluate(() => (document.body.innerText.match(/EPISODE\s+\d+\s*[·.]\s*([A-Z]+)/) || [])[1] || '');
  const clocks = () => count(tv, '[data-show-clock]');

  /* ---- S11 · CASTING, while every phone is head-down on a role card --------------------- */
  await sleep(1500);
  await shot(tv, '01-tv-casting-cards');
  const lamps = await count(tv, '.cast-lamp');
  const castTxt = await text(tv);
  claim('S11 · the casting TV draws the room instead of an empty ballroom',
    lamps === PHONES && /Read your card/i.test(castTxt)
      && (/of 8 have sent a ballot/i.test(castTxt) || /mansion|rooms|warming/i.test(castTxt)),
    `${lamps} lamps · foot: ${(castTxt.match(/(of 8 have sent a ballot|[a-z ]*mansion[a-z ·%\d]*|dressing the rooms[ ·%\d]*)/i) || ['?'])[0].trim()}`);
  claim('D8 · never two clocks on the casting screen', (await clocks()) <= 1, `${await clocks()} clock elements`);

  // Casting is PLAYED — the circle is seated here or every later shot is of an empty room.
  for (const ph of phones) { await ph.page.click('#card-done', { timeout: 5000 }).catch(() => {}); await sleep(150); }
  await sleep(1200);
  const litAfterCards = await count(tv, '.cast-lamp.on');

  /*
   * ⚠️ **SAMPLE THE WHOLE BEAT, NOT ONE MOMENT IN IT.** Casting has THREE screens, not one: the
   * role-card window (the board), the intros walking in (a full-bleed picture, deliberately
   * nothing else — that camera is the best thirty seconds in the show and nothing gets stacked
   * under it), and the ballot window (the board again, in the lower chrome). A single sample
   * during the intros reads zero lamps and says nothing about whether the counter works.
   *
   * This poller is also what caught the first cut of the fix: on that build the board rendered
   * ONLY before the intros, so `maxLit` stayed at 0 for the entire beat — a counter that was
   * structurally unable to move, on a screenshot that looked perfect.
   */
  let maxLit = 0; let sawBoardAfterCards = false; let sampled = 0;
  const warmSeen = []; let warmMoved = false;
  const poll = setInterval(async () => {
    try {
      const n = await tv.evaluate(() => ({
        lamps: document.querySelectorAll('.cast-lamp').length,
        lit: document.querySelectorAll('.cast-lamp.on').length,
        warm: document.querySelector('.cast-warm [data-warm-text]')?.textContent?.trim() || '',
      }));
      sampled++;
      if (n.lamps) sawBoardAfterCards = true;
      if (n.lit > maxLit) maxLit = n.lit;
      if (n.warm && warmSeen[warmSeen.length - 1] !== n.warm) {
        warmSeen.push(n.warm);
        if (warmSeen.length > 1) warmMoved = true;
      }
    } catch { /* the page is mid-repaint; the next sample gets it */ }
  }, 400);

  for (let ballot = 0; ballot < 2; ballot++) {
    for (let i = 0; i < phones.length; i++) {
      const pick = phones[(i + 1 + ballot) % phones.length].name;
      const b = await phones[i].page.$(`button:has-text("${pick}")`);
      if (b) await b.click({ timeout: 2500 }).catch(() => {});
      await sleep(160);
      const lock = await phones[i].page.$('button:has-text("LOCK")');
      if (lock) await lock.click({ timeout: 2500 }).catch(() => {});
      await sleep(160);
    }
    if (ballot === 0) { await sleep(1200); await shot(tv, '02-tv-casting-intros'); }
    await sleep(900);
  }
  await sleep(3500);
  clearInterval(poll);
  await shot(tv, '02b-tv-casting-ballots');
  /*
   * ⚠️ **THE FOOT OF THE BOARD HAS TO BE A NUMBER THAT CAN MOVE IN THAT WINDOW.** The first cut
   * printed "0 of 8 have sent a ballot" while the mansion was still compiling — intros cannot
   * fire until the bake is ready and no ballot can land until after the intros, so the counter
   * was pinned at zero by construction on a screenshot that looked perfect. This poller is what
   * caught it. The bake bar is what the room is genuinely waiting for, so that is what it shows.
   */
  claim('S11 control · the blank window shows something that MOVES, not a counter pinned at zero',
    sawBoardAfterCards && litAfterCards === 0 && (maxLit > 0 || warmMoved),
    `${sampled} samples · lamps lit 0 -> ${maxLit} · bake bar ${warmSeen.join(' -> ') || 'never seen'}`);
  say('  casting played for real — the circle is seated');

  /* ---- run through the expedition to the Recap ------------------------------------------ */
  let stuckSince = Date.now(); let last = null; let sawRecap = false;
  for (let i = 0; i < 90; i++) {
    const b = await beatOf();
    if (b !== last) { last = b; stuckSince = Date.now(); }
    if (b === 'RECAP' && !sawRecap) {
      sawRecap = true;
      await sleep(600);
      await shot(tv, '03-tv-recap');
      /*
       * ⚠️ READ THE FACTS BLOCK, NOT THE PAGE. The first cut matched /TIME/ against the whole
       * body and passed on the word inside "PRIME TIME" in the masthead — a green tick for a
       * fact that was not on the screen at all.
       */
      const facts = await count(tv, '.recap.talk-facts .fact');
      const factTxt = await tv.evaluate(() => document.querySelector('.recap.talk-facts')?.innerText.replace(/\s+/g, ' ').trim() || '');
      const minis = await count(tv, '.recap-mini');
      const c = await clocks();
      claim('D11/S6 · the Recap states the facts of the expedition',
        facts >= 3 && /(LIT|STAYED DARK)/.test(factTxt) && /CAME BACK|TAKEN/.test(factTxt)
          && /Alarms/i.test(factTxt),
        `${facts} facts · ${factTxt}`);
      claim('D11/S6 control · and it does not also print them as 13px chips in the top chrome',
        minis === 0, `${minis} recap-mini strips`);
      claim('D8 · never two clocks on the recap screen', c <= 1, `${c} clock elements`);
    }
    if (b === 'DEBRIEF') break;
    if (Date.now() - stuckSince > 25000) {
      await tv.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', bubbles: true })));
      stuckSince = Date.now();
    }
    await sleep(1200);
  }
  claim('D11/S6 · the recap beat was actually reached and photographed', sawRecap);
  await sleep(2500);

  /* ---- D12/S8 · the DEBRIEF sheet, eight players, READY ---------------------------------- */
  await shot(tv, '04-tv-debrief');
  await shot(phones[0].page, '05-phone-debrief');
  const rdD = await inView(phones[0].page, '#ready');
  claim('D12 · READY is on screen during an eight-player Debrief',
    rdD.found && rdD.onScreen,
    rdD.found ? `bottom ${rdD.bottom} of ${rdD.vh}, content ${rdD.contentH}px` : 'no #ready');
  claim('S8 · and it sits in the bottom of the sheet, where the thumb already is',
    rdD.found && rdD.top > rdD.vh * 0.5, rdD.found ? `top ${rdD.top} of ${rdD.vh}` : '');
  claim('D8 · never two clocks on the debrief screen', (await clocks()) <= 1, `${await clocks()} clock elements`);

  // A majority taps READY — the beat's own early exit, driven the way a room drives it.
  for (let i = 0; i < 5; i++) {
    await phones[i].page.click('#ready', { timeout: 4000 }).catch(() => {});
    await sleep(300);
  }
  await sleep(2500);
  say(`  five of eight tapped READY — beat is now ${await beatOf()}`);

  /* ---- D12 · the RECKONING sheet, the one that was 1052px in an 844px window ------------- */
  for (let i = 0; i < 40 && (await beatOf()) !== 'RECKONING'; i++) await sleep(1000);
  await sleep(1500);
  await shot(tv, '06-tv-reckoning');
  await shot(phones[0].page, '07-phone-reckoning');
  const rdR = await inView(phones[0].page, '#ready');
  const chips = await count(phones[0].page, '.pick-list .seat-chip');
  const phoneClocks = await count(phones[0].page, '[data-show-clock]');
  claim('D8 · never two clocks on the PHONE either — the strip and the 64px sheet clock',
    phoneClocks <= 1, `${phoneClocks} clock elements on the sheet`);
  claim('D12 · READY is on screen during an eight-player RECKONING — the sheet that was 1052px',
    rdR.found && rdR.onScreen,
    rdR.found ? `bottom ${rdR.bottom} of ${rdR.vh}, content ${rdR.contentH}px` : 'no #ready');
  claim('D12 control · the sheet is still taller than the window — the dock is doing the work',
    rdR.found && rdR.contentH > rdR.vh, rdR.found ? `${rdR.contentH}px content in ${rdR.vh}px` : '');
  claim('D6/S1 · every name you can tap carries its seat number',
    chips >= 6, `${chips} seat chips on the pick list`);
  claim('D8 · never two clocks on the reckoning screen', (await clocks()) <= 1, `${await clocks()} clock elements`);

  // Two nominations, one of them a Sam, so the TV has to tell the Sams apart.
  const nom = async (i, who) => {
    const b = await phones[i].page.$(`[data-nom]:has-text("${who}")`);
    if (b) { await b.click({ timeout: 3000 }).catch(() => {}); await sleep(600); return true; }
    return false;
  };
  await nom(0, 'Sam');
  await nom(1, 'Bo');
  await sleep(2000);
  await shot(tv, '08-tv-reckoning-named');
  const tvChips = await count(tv, '.nom-board .seat-chip');
  claim('D6/S1 · the aired nominee board says WHICH Sam',
    tvChips >= 1, `${tvChips} seat chips on the TV nominee board`);

  /* ---- D7/S3 · the VOTE, and the ballot box filling up ---------------------------------- */
  for (let i = 0; i < 60 && (await beatOf()) !== 'VOTE'; i++) await sleep(1000);
  await sleep(1500);
  const beatAtVote = await beatOf();
  await shot(tv, '09-tv-vote-open');
  const tallyOpen = await tv.evaluate(() => {
    const b = document.querySelector('.tally-board');
    return b ? { in: b.querySelector('.tally-in')?.textContent?.trim(), txt: b.innerText.replace(/\s+/g, ' ').trim() } : null;
  });
  claim('D7/S3 · the Vote shows how full the ballot box is, and what it takes to carry',
    !!tallyOpen && /of 8/.test(tallyOpen.txt) && /needs \d/.test(tallyOpen.txt),
    tallyOpen ? tallyOpen.txt : `no .tally-board (beat was ${beatAtVote})`);
  claim('D8 · never two clocks on the vote screen', (await clocks()) <= 1, `${await clocks()} clock elements`);

  // Everyone who still has a ballot casts one, and the count has to move.
  // ⚠️ THE RECEIPT IS CAPTURED THE MOMENT THE FIRST BALLOT LANDS. Waiting until the end
  // photographs the Execution: the eighth ballot closes the Vote and the sheet has moved on.
  const before = tallyOpen?.in;
  let cast = 0;
  let receipt = null;
  let receiptShot = null;
  let peak = null;
  for (const ph of phones) {
    const b = await ph.page.$('[data-lynch]');
    if (!b) continue;
    await b.click({ timeout: 3000 }).catch(() => {});
    cast++;
    await sleep(600);
    /*
     * ⚠️ SAMPLE THE BOARD AS THE BALLOTS LAND. The eighth ballot closes the Vote, and the board
     * is DESIGNED to stand down the moment the result exists — reading it after the loop
     * photographs an empty rail and calls the feature broken.
     */
    const now = await tv.evaluate(() => {
      const b2 = document.querySelector('.tally-board');
      return b2 ? { in: b2.querySelector('.tally-in')?.textContent?.trim(), full: b2.classList.contains('full'), txt: b2.innerText.replace(/\s+/g, ' ').trim() } : null;
    });
    if (now && Number(now.in) >= Number(peak?.in || -1)) peak = now;
    if (!receipt) {
      receipt = await ph.page.evaluate(() => {
        const r = document.querySelector('.receipt');
        return r ? { txt: r.innerText.replace(/\s+/g, ' ').trim(), chip: !!r.querySelector('.seat-chip') } : null;
      });
      if (receipt) { receiptShot = ph; await shot(ph.page, '11-phone-vote-receipt'); }
    }
    await sleep(200);
  }
  await sleep(2000);
  const tallyAfter = peak;
  await shot(tv, '10-tv-vote-filling');
  claim('D7/S3 · and the count actually moves as ballots land',
    !!tallyAfter && Number(tallyAfter.in) > Number(before || 0),
    `${before} -> ${tallyAfter?.in} after ${cast} taps`);
  claim('D7/S3 control · the aired board still names nobody and tallies nothing',
    !!tallyAfter && !/John|Ellie|Sam|Bo|Mary|Alexandria|\bJo\b/.test(tallyAfter.txt),
    tallyAfter ? tallyAfter.txt : '');

  /* ---- the receipt, caught on the first phone that voted ---------------------------------- */
  claim('S1 · the ballot receipt quotes what the room recorded, with the seat',
    !!receipt && /The room recorded/i.test(receipt.txt),
    receipt
      ? `${receiptShot?.name}: ${receipt.txt}${receipt.chip ? ' [+seat chip]' : ' [no chip — NO ONE has no seat]'}`
      : `no receipt on any of ${cast} phones that voted`);

  await shot(phones[0].page, '12-phone-after-vote');
  if (errs.length) say(`  ⚠️ errors thrown: ${[...new Set(errs)].slice(0, 6).join(' | ')}`);
  claim('no page threw', errs.length === 0, errs.length ? `${errs.length} errors` : 'clean');

  const bad = checks.filter((c) => !c.ok);
  say(`\n  loop-ui-play: ${checks.length - bad.length} passed, ${bad.length} failed`);
  say(`  shots + transcript in progress/r5/`);
  await writeFile(path.join(SHOTDIR, 'transcript.txt'), log.join('\n'));
  exitCode = bad.length ? 1 : 0;
} catch (e) {
  console.error(`\n  loop-ui-play died: ${e?.stack || e}\n`);
  await writeFile(path.join(SHOTDIR, 'transcript.txt'), `${log.join('\n')}\n\nDIED: ${e?.message}`).catch(() => {});
} finally {
  if (!KEEP) {
    await browser.close().catch(() => {});
    for (const k of kids) k.kill();
    roomServer?.close?.();
  }
  process.exit(exitCode);
}
