#!/usr/bin/env node
/**
 * pair-lock-stage — after the pair locks, the circle PERFORMS a sendoff before the run.
 *
 *   node harness/pair-lock-stage.mjs
 *
 * Must go RED if: t:'episode' pins expedition before SETTLE+FADE; sim skips the sendoff;
 * casting overlay still covers onStage during the stands; a new SHOW_BEATS entry appeared;
 * sitLock was dropped; a follow mode added; reactors gasp on sendoff.
 */

import {
  PAIR, PAIR_CLIPS, PAIR_LOCK_MS, pairLockMs, pairKey, pairRows,
  planPairLock, createPairLockStage,
} from '../src/game/pair-lock-stage.js';
import { SEATED_REACTION_CLIPS, SEATED_CLIPS_LEAVE_CHAIR } from '../src/game/chair-seats.js';
import { SHOW_BEATS } from '../src/party/show.js';
import { CUE_KINDS, CUE_KEYS } from '../src/party/follow.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(ROOT, '..', rel), 'utf8');
const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

function circle(ids) {
  const log = [];
  const stage = createPairLockStage({
    seatCount: ids.length,
    seatOf: (id) => {
      const i = ids.indexOf(String(id));
      return i >= 0 ? i : null;
    },
    play: (seat, clip, hold) => {
      log.push({ kind: 'play', seat, clip, hold: !!hold });
      return true;
    },
    rest: (seat) => { log.push({ kind: 'rest', seat }); },
  });
  return {
    stage, log,
    plays: () => log.filter((r) => r.kind === 'play'),
    rests: () => log.filter((r) => r.kind === 'rest'),
    clear: () => { log.length = 0; },
    run: (secs = 2.5) => { for (let i = 0; i < Math.round(secs * 60); i++) stage.step(1 / 60); },
  };
}

const IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const LOCK = [{ runner: 'p1', guide: 'p2' }];

console.log('\npair-lock-stage · sendoff before the run\n');

/* ── P0 · the running order John locked ──────────────────────────────────────────────────── */
{
  const beats = planPairLock({ runnerSeat: 0, guideSeat: 1 });
  const runner = beats.find((b) => b.role === 'runner');
  const guide = beats.find((b) => b.role === 'guide');
  t('P0a · the runner stands at t=0, hold true, Sit_to_Stand_Transition_M',
    runner?.at === PAIR.STAND_RUNNER
    && runner?.clip === 'Sit_to_Stand_Transition_M'
    && runner?.hold === true
    && runner?.seat === 0,
    JSON.stringify(runner));
  t('P0b · the guide stands at t=0.40 so it is a scene, not a chorus line',
    guide?.at === PAIR.STAND_GUIDE
    && guide?.clip === PAIR_CLIPS.stand
    && guide?.hold === true
    && guide?.seat === 1
    && PAIR.STAND_GUIDE === 0.40,
    JSON.stringify(guide));
  t('P0c · SETTLE is 2.00 and FADE is 0.25 — finished is last beat + FADE',
    PAIR.SETTLE === 2.00 && PAIR.FADE === 0.25
    && PAIR_LOCK_MS === 2250 && pairLockMs() === 2250
    && Math.max(...beats.map((b) => b.at)) === PAIR.SETTLE,
    `SETTLE=${PAIR.SETTLE} FADE=${PAIR.FADE} ms=${PAIR_LOCK_MS}`);
  t('P0d · reactors: none — a sendoff gasp is the Reckoning leak with no accusation',
    beats.every((b) => b.role !== 'reactor')
    && !beats.some((b) => /gasp|shout|hands_on_mouth|lean_back/i.test(b.clip)),
    beats.map((b) => b.role).join(','));
  t('P0e · the clip leaves the chair under a pinned root — sitLock stays on',
    SEATED_CLIPS_LEAVE_CHAIR.includes(PAIR_CLIPS.stand)
    && SEATED_REACTION_CLIPS.includes(PAIR_CLIPS.stand));
  t('P0f · the key is runner>guide',
    pairKey({ runner: 'p1', guide: 'p2' }) === 'p1>p2'
    && pairKey({ runner: 'p1', guide: 'p2' }) !== pairKey({ runner: 'p2', guide: 'p1' }));
}

/* ── P1 · ONCE PER PAIR, NOT ONCE PER FANOUT ─────────────────────────────────────────────── */
{
  const c = circle(IDS);
  c.stage.set(LOCK);
  c.run(2.5);
  const first = c.plays().length;
  t('P1a · a new pair stages the runner, the guide, and the settle hold',
    first >= 2 && c.stage.keys().join(',') === 'p1>p2', `${first} beats`);
  t('P1b · finished only after SETTLE+FADE — pending-empty at 0.40s is not the sendoff',
    c.stage.finished() === true && c.stage.elapsed() + 1e-9 >= PAIR.SETTLE + PAIR.FADE);

  c.clear();
  for (let i = 0; i < 25; i++) { c.stage.set(LOCK); c.run(0.2); }
  t('P1c · 25 more cues of the SAME pair play NOTHING — re-cue is a no-op',
    c.plays().length === 0, `${c.plays().length} replays`);
}
{
  const c = circle(IDS);
  c.stage.set(LOCK);
  c.run(0.5);
  t('P1d · at 0.5s both have stood and the sendoff is NOT finished',
    c.plays().filter((p) => p.hold).length >= 2
    && c.stage.finished() === false
    && c.stage.pending() > 0,
    `plays=${c.plays().length} pending=${c.stage.pending()} finished=${c.stage.finished()}`);
}

/* ── P2 · live hop waits; sim does not skip ──────────────────────────────────────────────── */
{
  const localSrc = read('net/party/local.mjs');
  const localCode = codeOf(localSrc);
  t('P2a · local.mjs waits PAIR_LOCK_MS / pairLockMs before setShow expedition',
    /pairLockMs|PAIR_LOCK_MS/.test(localSrc)
    && /startPairLock|pairLocking/.test(localSrc)
    && /setShow\(room, 'expedition'\)/.test(localSrc),
    'the wait lives next to the hop that used to pin expedition immediately');
  t('P2b · there is no skip seam for the sendoff — readyCountdownNow is not the model',
    !/pairLockNow|skipPairLock|skipSendoff|sendoffNow/.test(localCode)
    && !/PAIR_LOCK_MS\s*=\s*0/.test(localCode)
    && !/pairLockMs\(\)\s*\*\s*0/.test(localSrc));
  t('P2c · CASTING_BACKSTOP during the scene finishes the scene — it does not pin the run',
    /pairLocking/.test(localSrc)
    && /castingBackstop/.test(localSrc));
  t('P2d · playEpisode still locks the pair before the wait — empty never invents one',
    /playEpisode/.test(localSrc) && /validCastBallots/.test(localSrc));
}

/* ── P3 · overlay drops; phones wait; no new SHOW beat; sitLock stays; no follow mode ───── */
{
  const hostSrc = read('src/views/party-host.js');
  const phoneSrc = read('src/views/party-phone.js');
  const followSrc = read('src/party/follow.js');
  const introSrc = read('src/game/intro-bed.js');
  const stageSrc = read('src/game/pair-lock-stage.js');
  const showSrc = read('src/party/show.js');

  t('P3a · SHOW_BEATS did not grow a sendoff — accusation has none either',
    !SHOW_BEATS.includes('sendoff')
    && SHOW_BEATS.filter((b) => b === 'expedition').length === 1);
  t('P3b · after 3·2·1 the casting overlay does not cover onStage during the stands',
    /onSendoff/.test(hostSrc)
    && /onCast =[\s\S]{0,180}!onSendoff/.test(hostSrc)
    && /on-cast/.test(hostSrc),
    'on-cast is off while sendoff is the picture');
  t('P3c · phones stay on the Locked sheet — no expedition pad, no 3D, no map',
    (() => {
      const lock = phoneSrc.indexOf("} else if (beat === 'casting' && (pair.runner || recap.runner))");
      const sheet = phoneSrc.indexOf("} else if (beat === 'expedition')");
      return lock >= 0 && sheet > lock && /Locked\./.test(phoneSrc) && /Watch the TV\./.test(phoneSrc);
    })());
  t('P3d · sitLock is not dropped for the sendoff stands',
    !/sitLock\s*=\s*false/.test(codeOf(stageSrc))
    && /sitLock stays on/.test(stageSrc)
    && /sitLock stays on/.test(introSrc)
    && /PAIR\.FADE/.test(introSrc));
  t('P3e · no new follow mode — chase/top/crane/iso stay the locked produced follow',
    CUE_KINDS.includes('run')
    && Array.isArray(CUE_KEYS.run)
    && !/sendoff/.test(followSrc)
    && !CUE_KINDS.includes('sendoff')
    && !CUE_KINDS.includes('pairlock'));
  t('P3f · sendThemIn does not paint expedition over the stands, and does not leave ui.locked into the run',
    /function sendThemIn/.test(hostSrc)
    && !/function sendThemIn\(\) \{[\s\S]*?claimBeat\('expedition'\)/.test(hostSrc)
    && /ui\.sendoff/.test(hostSrc));
  t('P3g · the show.js header no longer says expedition is immediate so the TV is never waiting on a click',
    !/Expedition is immediate so the TV is never waiting on a click/.test(showSrc));
}

/* ── P4 · live: t:'episode' does not pin expedition before SETTLE+FADE ───────────────────── */
{
  const { startServer } = await import('../net/party/local.mjs');
  const PORT = 5377;
  const srv = startServer({ port: PORT, count: 8, castSeed: 3, worldSeed: 3, code: 'pl' });
  const open = (url) => new Promise((resolve) => {
    const msgs = [];
    const ws = new WebSocket(url);
    const box = {
      ws, msgs,
      send: (m) => { try { ws.send(JSON.stringify(m)); } catch { /* closed */ } },
      close: () => ws.close(),
      welcome: null,
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      msgs.push(m);
      if (m.t === 'welcome') { box.welcome = m; resolve(box); }
    };
    setTimeout(() => resolve(box), 1500);
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await sleep(80);
  const base = `ws://localhost:${PORT}/?room=pl`;
  const tv = await open(`${base}&host=1`);
  const a = await open(base);
  const b = await open(base);
  await sleep(80);
  tv.send({ t: 'start' });
  tv.send({ t: 'casting' });
  await sleep(80);
  a.send({ t: 'ballot', runner: b.welcome.playerId, guide: a.welcome.playerId });
  b.send({ t: 'ballot', runner: b.welcome.playerId, guide: a.welcome.playerId });
  await sleep(80);
  tv.send({ t: 'episode', opts: {} });
  await sleep(80);
  const room = srv.rooms.get('pl');
  const lastShow = (box) => [...box.msgs].reverse().find((m) => m.t === 'show');
  t('P4a · after t:\'episode\' the pair is locked and the SHOW is still casting',
    room.game.state.pair?.runner != null && room.game.state.pair?.guide != null
    && room.show === 'casting'
    && lastShow(tv)?.beat !== 'expedition'
    && lastShow(a)?.beat !== 'expedition',
    JSON.stringify({ show: room.show, pair: room.game.state.pair, tv: lastShow(tv)?.beat }));
  tv.send({ t: 'episode', opts: {} });
  await sleep(80);
  t('P4d · a second t:\'episode\' during the wait is a no-op — it does not skip and does not double-play',
    room.show === 'casting' && room.pairLocking === true
    && lastShow(tv)?.beat !== 'expedition',
    JSON.stringify({ show: room.show, locking: room.pairLocking, tv: lastShow(tv)?.beat }));
  await sleep(PAIR.SETTLE * 1000 - 200);
  t('P4b · still casting before SETTLE+FADE — the sim did not skip',
    room.show === 'casting' && lastShow(tv)?.beat !== 'expedition',
    `show=${room.show} at ~SETTLE`);
  await sleep(PAIR.FADE * 1000 + 500);
  t('P4c · expedition pins only after SETTLE+FADE',
    room.show === 'expedition'
    && lastShow(tv)?.beat === 'expedition'
    && lastShow(a)?.beat === 'expedition'
    && lastShow(b)?.beat === 'expedition',
    `show=${room.show} tv=${lastShow(tv)?.beat}`);
  for (const c of [tv, a, b]) c.close();
  srv.close();
}

/* ── P5 · junk / restore ─────────────────────────────────────────────────────────────────── */
{
  const c = circle(IDS);
  t('P5a · junk rows are dropped, not thrown on',
    (() => { c.stage.set([null, {}, { runner: '' }, { runner: 'p1' }]); return true; })()
    && c.stage.keys().length === 0);
  c.stage.set(LOCK);
  c.run(2.5);
  c.clear();
  c.stage.set([]);
  t('P5b · an empty list puts both chairs back on the seated idle',
    c.rests().map((r) => r.seat).sort().join(',') === '0,1');
  t('P5c · pairRows rejects a runner who is also the guide',
    pairRows([{ runner: 'p1', guide: 'p1' }]).length === 0);
}

console.log(`\npair-lock-stage: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
