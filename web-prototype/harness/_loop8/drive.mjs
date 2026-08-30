#!/usr/bin/env node
/**
 * loop8 overnight driver — eight phones, influence matrix, real pads.
 *
 *   LOOP8_SKIP_EXPEDITION=1 node harness/_loop8/drive.mjs
 *
 * Casting is played. Expedition is SKIPPED (John licensed this — the driver
 * still cannot walk the pair). Do not sine-circle the halls. Product smash
 * + DRILL stay; this flag is driver-only and rides the TV `]` under ?dev=1.
 *
 * Evils spend `[data-link]` + `#whisper-send`. A whisper that exists only
 * in talk.json is a sim hole. Noms without a matrix reason are a sim hole.
 *
 * Not a gate. Serve `dist`, never vite.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  emptyMatrix, onPaired, onRecap, onNominated, onVoted, onWhisperSent, onLinked,
  pickNom, pickVote, assertNomReason, dropDead, snapshot, score,
} from './influence.mjs';
import {
  sleep, snap, hostSnap, beatOf, waitBeat, skipBeat, typeJoin, readCard,
  castBallot, tapReady, nom, lynch, reach, acceptLink, whisperThroughPad, recapTaken,
} from './puppet-page.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const envOn = (k, fallback = true) => {
  const v = process.env[k];
  if (v == null || v === '') return fallback;
  return v !== '0' && v !== 'false';
};

const WEB = +arg('--port', process.env.LOOP8_PORT || 5292);
const WS = +arg('--wsPort', process.env.LOOP8_WS || 5392);
const CODE = arg('--code', process.env.LOOP8_CODE || 'loop');
const EPISODES = +arg('--episodes', process.env.LOOP8_EPISODES || 4);
const SKIP_EXP = envOn('LOOP8_SKIP_EXPEDITION', true);
const KEEP = argv.includes('--keep');
const NAMES = ['John', 'Ellie', 'Ozz', 'Mara', 'Bex', 'Sam', 'Ivy', 'Zoe'];
const OUT = path.join(ROOT, 'harness/_loop8/influence.json');

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
let roomServer = null;
const history = [];

function livingSeats(bots) {
  return bots.filter((b) => b.alive !== false);
}

async function refresh(bots) {
  for (const b of bots) {
    const s = await snap(b.page);
    if (!s) continue;
    b.id = s.id || b.id;
    b.alive = s.alive !== false;
    if (s.alignment) b.alignment = s.alignment;
    if (s.role) b.role = s.role;
    if (s.name) b.name = s.name;
  }
}

function byId(bots, id) {
  return bots.find((b) => b.id === id) || null;
}

async function writeInfluence(state, extra) {
  const snapNow = snapshot(state, extra);
  history.push(snapNow);
  await writeFile(OUT, JSON.stringify({
    writtenAt: new Date().toISOString(),
    skipExpedition: SKIP_EXP,
    episodes: history,
    latest: snapNow,
  }, null, 2));
  say(`  wrote ${OUT} · episode ${state.episode} · ${state.moves.length} moves · ${state.holes.length} holes`);
}

console.log('\nloop8 — eight phones, influence, skip expedition\n');

if (!existsSync(path.join(ROOT, 'dist/index.html'))) {
  throw new Error('no dist/index.html — run `npm run build` first. This harness never uses vite.');
}

if (await portOpen(WS)) say(`  reusing room server :${WS}`);
else {
  const { startServer } = await import(pathToFileURL(path.join(ROOT, 'net/party/local.mjs')).href);
  roomServer = startServer({ port: WS });
  await waitPort(WS, 12000, 'room server');
  say(`  room server :${WS}`);
}
if (await portOpen(WEB)) say(`  reusing page server :${WEB}`);
else {
  const p = spawn(process.execPath, [path.join(ROOT, 'harness/serve.mjs'), '--port', String(WEB), '--dir', 'dist'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  kids.push(p);
  await waitPort(WEB, 20000, 'page server');
  say(`  serving dist :${WEB}`);
}

const base = `http://127.0.0.1:${WEB}`;
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

let exitCode = 1;
try {
  const tv = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  await tv.goto(`${base}/?view=party.host&room=${CODE}&wsPort=${WS}&dev=1`, { waitUntil: 'domcontentloaded' });
  await tv.waitForSelector('.night-code', { timeout: 20000 });
  say('  TV up');

  const bots = [];
  for (let i = 0; i < 8; i++) {
    const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await page.goto(`${base}/?view=party.phone&wsPort=${WS}&dev=1`, { waitUntil: 'domcontentloaded' });
    await typeJoin(page, { code: CODE, name: NAMES[i] });
    bots.push({ page, name: NAMES[i], id: null, alive: true, evil: false, role: null, alignment: null });
    say(`  ${NAMES[i]} in`);
    await sleep(250);
  }

  await tv.evaluate(async () => {
    const t0 = Date.now();
    while (Date.now() - t0 < 240000) {
      const b = document.querySelector('#go');
      if (b && !b.disabled) { b.click(); return true; }
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  });
  say('  night started');
  await sleep(2000);

  for (const b of bots) {
    const card = await readCard(b.page);
    b.id = card.id;
    b.evil = !!card.evil;
    b.role = card.role;
    b.alignment = card.evil ? 'evil' : 'good';
    b.mates = card.mates || [];
    say(`  ${b.name} card · ${card.align || '?'} · ${card.role || '?'} · id ${b.id || '?'}`);
  }
  await refresh(bots);

  let state = emptyMatrix(bots.map((b) => ({ id: b.id, alive: b.alive })));
  let lastRunner = null;
  let lastGuide = null;

  for (let ep = 1; ep <= EPISODES; ep++) {
    state.episode = ep;
    state.moves = [];
    say(`\n— episode ${ep} —`);
    await refresh(bots);
    const living = livingSeats(bots);
    if (living.length < 3) { say('  fewer than 3 living — stop'); break; }

    const beat = await beatOf(tv);
    if (beat === 'REUNION') { say('  reunion — stop'); break; }
    if (beat && beat !== 'CASTING') {
      say(`  waiting for casting (now ${beat})`);
      try { await waitBeat(tv, 'CASTING', { ms: 60000 }); }
      catch { say(`  no casting · ${await beatOf(tv)}`); break; }
    }

    const ids = living.map((b) => b.id).filter(Boolean);
    const pickPair = () => {
      const run = ids.find((id) => id !== lastRunner) || ids[0];
      const guide = ids.find((id) => id !== run && id !== lastGuide) || ids.find((id) => id !== run);
      return { run, guide };
    };
    const pairPick = pickPair();
    for (const b of living) {
      await castBallot(b.page, pairPick.run, pairPick.guide);
      await sleep(120);
    }
    say(`  ballots in · want runner ${byId(bots, pairPick.run)?.name} / guide ${byId(bots, pairPick.guide)?.name}`);

    let now = '';
    for (let i = 0; i < 80; i++) {
      now = await beatOf(tv);
      if (now === 'EXPEDITION' || now === 'RECAP') break;
      await sleep(500);
    }
    if (now === 'EXPEDITION') {
      if (SKIP_EXP) {
        say('  expedition — skip (LOOP8_SKIP_EXPEDITION, TV ])');
        await skipBeat(tv);
        await sleep(600);
      } else {
        say('  expedition — waiting (set LOOP8_SKIP_EXPEDITION=1 to clock out)');
      }
    }

    try { await waitBeat(tv, 'RECAP', { ms: 45000 }); }
    catch { say(`  no recap · ${await beatOf(tv)}`); }

    const host = await hostSnap(tv);
    const recap = await recapTaken(tv);
    const runnerId = recap.runner || host?.runner || pairPick.run;
    const guideId = recap.guide || host?.guide || pairPick.guide;
    const taken = (recap.taken || []).length > 0;
    lastRunner = runnerId;
    lastGuide = guideId;
    onPaired(state, runnerId, guideId);
    onRecap(state, runnerId, guideId, taken);
    say(`  recap · runner ${byId(bots, runnerId)?.name || runnerId} · guide ${byId(bots, guideId)?.name || guideId} · ${taken ? 'TAKEN' : 'CAME BACK'}`);

    try { await waitBeat(tv, 'DEBRIEF', { ms: 30000 }); }
    catch { /* recap clock may already have walked */ }
    await sleep(800);

    // Evils spend real ship + whisper pads. Goods do not.
    const evils = living.filter((b) => b.evil);
    const goods = living.filter((b) => !b.evil);
    let ships = 0;
    for (const ev of evils) {
      if (ships >= 2) break;
      const target = goods
        .filter((g) => g.id !== ev.id)
        .sort((a, c) => score(state, ev.id, c.id) - score(state, ev.id, a.id))[0]
        || goods[0];
      if (!target) continue;
      const about = goods.find((g) => g.id !== target.id) || goods[0];
      const reached = await reach(ev.page, target.id);
      if (!reached) {
        state.holes.push({ kind: 'ship-pad-missing', from: ev.id, to: target.id });
        say(`  HOLE ship pad missing · ${ev.name} → ${target.name}`);
        continue;
      }
      await sleep(500);
      const accepted = await acceptLink(target.page);
      if (!accepted) {
        state.holes.push({ kind: 'ship-no-accept', from: ev.id, to: target.id });
        say(`  HOLE ${target.name} had no Connect`);
        continue;
      }
      await sleep(700);
      onLinked(state, ev.id, target.id);
      ships++;
      const line = about
        ? `${about.name} is the play. Watch the chair.`
        : 'Stay close. Do not name it out loud.';
      const sent = await whisperThroughPad(ev.page, line);
      if (!sent) {
        state.holes.push({ kind: 'whisper-pad-missing', from: ev.id, to: target.id, note: 'no #whisper-send — not written to talk.json' });
        say(`  HOLE whisper pad missing after ship · ${ev.name}`);
        continue;
      }
      onWhisperSent(state, ev.id, target.id, about?.id, { accuse: true });
      say(`  ${ev.name} whispered through the pad to ${target.name}${about ? ` about ${about.name}` : ''}`);
      await sleep(400);
    }

    for (const b of living) { await tapReady(b.page); await sleep(80); }

    let after = await beatOf(tv);
    for (let i = 0; i < 40 && after !== 'RECKONING' && after !== 'VOTE' && after !== 'CASTING'; i++) {
      await sleep(500);
      after = await beatOf(tv);
    }

    if (after === 'RECKONING') {
      await sleep(600);
      const livingIds = living.map((b) => b.id);
      for (const b of living) {
        const who = pickNom(state, b.id, livingIds);
        if (!who) continue;
        const tapped = await nom(b.page, who);
        if (!tapped) continue;
        assertNomReason(state, b.id, who);
        onNominated(state, b.id, who);
        say(`  ${b.name} noms ${byId(bots, who)?.name || who} · score ${score(state, b.id, who)}`);
        await sleep(250);
      }
      for (const b of living) { await tapReady(b.page); await sleep(80); }
    }

    after = await beatOf(tv);
    for (let i = 0; i < 40 && after !== 'VOTE' && after !== 'EXECUTION' && after !== 'VERDICT' && after !== 'CASTING'; i++) {
      await sleep(500);
      after = await beatOf(tv);
    }

    if (after === 'VOTE') {
      await sleep(500);
      const nominees = await tv.evaluate(() => {
        const hostNoms = window.__rrrHost;
        const buttons = [...document.querySelectorAll('[data-lynch], .nom-board [data-id]')]
          .map((el) => el.dataset.lynch || el.dataset.id).filter(Boolean);
        return buttons;
      }).catch(() => []);
      for (const b of living) {
        const padNoms = await b.page.evaluate(() =>
          [...document.querySelectorAll('[data-lynch]')].map((el) => el.dataset.lynch).filter((id) => id && id !== 'NO ONE'));
        const pool = padNoms.length ? padNoms : nominees;
        const who = pickVote(state, b.id, pool);
        const tapped = await lynch(b.page, who === 'NO ONE' ? null : who);
        if (tapped && who && who !== 'NO ONE') onVoted(state, b.id, who);
        say(`  ${b.name} votes ${who === 'NO ONE' ? 'NO ONE' : (byId(bots, who)?.name || who)}`);
        await sleep(200);
      }
    }

    for (let i = 0; i < 50; i++) {
      after = await beatOf(tv);
      if (after === 'CASTING' || after === 'REUNION') break;
      if (after === 'EXECUTION' || after === 'VERDICT') {
        /* let the wreck beat play; do not skip product chrome */
      }
      await sleep(600);
    }

    await refresh(bots);
    for (const b of bots) {
      if (b.alive === false && state.scores[b.id]) {
        say(`  ${b.name} is wreckage — drop from matrix`);
        dropDead(state, b.id);
      }
    }
    await writeInfluence(state, {
      runner: runnerId,
      guide: guideId,
      taken,
      skipExpedition: SKIP_EXP,
      evils: evils.map((e) => e.name),
      log: log.slice(),
    });
  }

  exitCode = 0;
  say('\nloop8 done');
} catch (e) {
  console.error(`\n  died: ${e?.stack || e}\n`);
  stateHoleWrite(e);
} finally {
  if (!KEEP) {
    await browser.close().catch(() => {});
    for (const k of kids) k.kill();
    roomServer?.close?.();
  }
  process.exit(exitCode);
}

function stateHoleWrite(err) {
  writeFile(OUT, JSON.stringify({
    died: String(err?.message || err),
    episodes: history,
    log,
  }, null, 2)).catch(() => {});
}
