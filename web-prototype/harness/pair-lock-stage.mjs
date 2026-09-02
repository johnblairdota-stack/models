#!/usr/bin/env node
/**
 * pair-lock-stage — after the pair locks, the circle PERFORMS a sendoff before the run.
 *
 *   node harness/pair-lock-stage.mjs
 *
 * Must go RED if: t:'episode' pins expedition before HOLD+FADE; sim skips the sendoff;
 * bodies stay at their chairs for the picture (Shot B); sitLock is still on at WALK for
 * the two named seats; sendoffCam is missing or Y climbs (crane) or a CUE_KIND appeared;
 * chase / top / crane ran during Casting; a new SHOW_BEATS entry appeared; reactors gasp;
 * they walk to the door.
 */

import {
  PAIR, PAIR_CLIPS, PAIR_LOCK_MS, PAIR_MARK, pairLockMs, pairKey, pairRows,
  planPairLock, createPairLockStage,
  pairArch, pairMarks, sendoffCam, sendoffU, SENDOFF_CAM,
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
    dropSitLock: (seat) => { log.push({ kind: 'drop', seat }); },
    rest: (seat) => { log.push({ kind: 'rest', seat }); },
  });
  return {
    stage, log,
    plays: () => log.filter((r) => r.kind === 'play'),
    drops: () => log.filter((r) => r.kind === 'drop'),
    rests: () => log.filter((r) => r.kind === 'rest'),
    clear: () => { log.length = 0; },
    run: (secs = 13) => { for (let i = 0; i < Math.round(secs * 60); i++) stage.step(1 / 60); },
  };
}

const IDS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
const LOCK = [{ runner: 'p1', guide: 'p2' }];
const ARCH = { id: 'D5', x: 0, z: -8.45, w: 1.90 };
const PORTALS = [
  { id: 'D4', a: 'study_w', b: 'ballroom', x: -8.60, z: -8.45, w: 1.90 },
  { id: 'D5', a: 'service', b: 'ballroom', x: 0.00, z: -8.45, w: 1.90 },
  { id: 'D6', a: 'study_e', b: 'ballroom', x: 8.60, z: -8.45, w: 1.90 },
];

console.log('\npair-lock-stage · ring-center sendoff before the run\n');

/* ── P0 · the running order John locked ──────────────────────────────────────────────────── */
{
  const beats = planPairLock({ runnerSeat: 0, guideSeat: 1 });
  const runner = beats.find((b) => b.role === 'runner');
  const guide = beats.find((b) => b.role === 'guide');
  const walks = beats.filter((b) => b.role === 'walk');
  const hold = beats.find((b) => b.role === 'hold');
  t('P0a · both rise together at t=0, hold true, Sit_to_Stand_Transition_M',
    runner?.at === PAIR.RISE
    && guide?.at === PAIR.RISE
    && PAIR.RISE === 0
    && runner?.clip === 'Sit_to_Stand_Transition_M'
    && guide?.clip === PAIR_CLIPS.stand
    && runner?.hold === true
    && runner?.seat === 0
    && guide?.seat === 1,
    JSON.stringify({ runner, guide }));
  t('P0b · the 0.40 stagger is dead — no STAND_GUIDE, no SETTLE, no Shot B chorus-line',
    !Object.prototype.hasOwnProperty.call(PAIR, 'STAND_GUIDE')
    && !Object.prototype.hasOwnProperty.call(PAIR, 'STAND_RUNNER')
    && !Object.prototype.hasOwnProperty.call(PAIR, 'SETTLE')
    && PAIR.WALK === 1.65
    && walks.length === 2
    && walks.every((b) => b.at === PAIR.WALK && b.role === 'walk'),
    `WALK=${PAIR.WALK} walks=${walks.length}`);
  t('P0c · HOLD is 12.50 and FADE is 0.25 — finished is HOLD+FADE, PAIR_LOCK_MS is 12750',
    PAIR.HOLD === 12.50 && PAIR.FADE === 0.25
    && PAIR.ARRIVE === 4.00 && PAIR.PAN === 6.00 && PAIR.TURN === 10.00
    && PAIR_LOCK_MS === 12750 && pairLockMs() === 12750
    && Math.round((PAIR.HOLD + PAIR.FADE) * 1000) === 12750
    && hold?.at === PAIR.HOLD
    && Math.max(...beats.map((b) => b.at)) === PAIR.HOLD,
    `HOLD=${PAIR.HOLD} FADE=${PAIR.FADE} ms=${PAIR_LOCK_MS}`);
  t('P0d · reactors: none — a sendoff gasp is the Reckoning leak with no accusation',
    beats.every((b) => b.role !== 'reactor')
    && !beats.some((b) => /gasp|shout|hands_on_mouth|lean_back/i.test(b.clip || '')),
    beats.map((b) => b.role).join(','));
  t('P0e · rise clip is Sit_to_Stand_Transition_M (rise only, then loco) — not a held chair-stand',
    SEATED_CLIPS_LEAVE_CHAIR.includes(PAIR_CLIPS.stand)
    && SEATED_REACTION_CLIPS.includes(PAIR_CLIPS.stand)
    && PAIR_CLIPS.stand === 'Sit_to_Stand_Transition_M');
  t('P0f · the key is runner>guide',
    pairKey({ runner: 'p1', guide: 'p2' }) === 'p1>p2'
    && pairKey({ runner: 'p1', guide: 'p2' }) !== pairKey({ runner: 'p2', guide: 'p1' }));
}

{
  const arch = pairArch({ portals: PORTALS, spaceId: 'ballroom', cx: 0, cz: 0 });
  t('P0g · dress arch is unnamed — pairArch takes the doorway the runner leaves by (nearest, D5)',
    arch.id === 'D5' && arch.named === false && arch.z === -8.45,
    JSON.stringify(arch));
  const marks = pairMarks({ cx: 0, cz: 0, arch: ARCH, floorY: 0 });
  const gap = Math.hypot(marks.runner.x - marks.guide.x, marks.runner.z - marks.guide.z);
  const midX = (marks.runner.x + marks.guide.x) / 2;
  const midZ = (marks.runner.z + marks.guide.z) / 2;
  t('P0h · pairMarks sit GAP/2 either side of ring origin, not at chairs, not at the door',
    Math.abs(gap - PAIR_MARK.GAP) < 1e-9
    && PAIR_MARK.GAP === 0.70
    && Math.abs(midX) < 1e-9 && Math.abs(midZ) < 1e-9
    && Math.hypot(marks.runner.x, marks.runner.z) < 0.40
    && Math.hypot(marks.guide.x, marks.guide.z) < 0.40
    && Math.hypot(marks.runner.x - ARCH.x, marks.runner.z - ARCH.z) > 7
    && marks.runner.y === 0 && marks.guide.y === 0,
    `gap=${gap.toFixed(3)} mid=${midX.toFixed(3)},${midZ.toFixed(3)}`);
  t('P0i · faceCam looks away from the arch; faceArch looks toward it',
    (() => {
      const toArch = Math.atan2(ARCH.x - 0, ARCH.z - 0);
      const dCam = Math.abs(Math.atan2(
        Math.sin(marks.runner.faceCam - (toArch + Math.PI)),
        Math.cos(marks.runner.faceCam - (toArch + Math.PI)),
      ));
      const dArch = Math.abs(Math.atan2(
        Math.sin(marks.runner.faceArch - toArch),
        Math.cos(marks.runner.faceArch - toArch),
      ));
      return dCam < 1e-6 && dArch < 1e-6
        && marks.runner.faceCam === marks.guide.faceCam
        && marks.runner.faceArch === marks.guide.faceArch;
    })());
}

{
  const a0 = sendoffCam({ cx: 0, cz: 0, floorY: 0, arch: ARCH, u: 0 });
  const a1 = sendoffCam({ cx: 0, cz: 0, floorY: 0, arch: ARCH, u: 1 });
  const d0 = Math.hypot(a0.eye.x, a0.eye.z);
  const lookMid = Math.hypot(a0.look.x, a0.look.z);
  t('P0j · sendoffCam u=0 is opposite the arch, ~4.2 m, eye Y 1.42, look visor 1.16',
    Math.abs(d0 - SENDOFF_CAM.DIST) < 1e-6
    && Math.abs(a0.eye.y - SENDOFF_CAM.EYE_Y) < 1e-9
    && Math.abs(a0.look.y - SENDOFF_CAM.LOOK_Y) < 1e-9
    && lookMid < 1e-6
    && a0.eye.z > 0,
    `d0=${d0.toFixed(3)} eyeY=${a0.eye.y} lookY=${a0.look.y}`);
  t('P0k · sendoffCam Y does not climb — not a crane, not chase, not top',
    a0.eye.y === a1.eye.y
    && a0.eye.y === SENDOFF_CAM.EYE_Y
    && a0.look.y === a1.look.y
    && Math.abs(a1.eye.y - a0.eye.y) < 1e-12);
  const sweep = Math.atan2(a1.eye.x, a1.eye.z) - Math.atan2(a0.eye.x, a0.eye.z);
  let sweepAbs = sweep;
  while (sweepAbs > Math.PI) sweepAbs -= Math.PI * 2;
  while (sweepAbs < -Math.PI) sweepAbs += Math.PI * 2;
  t('P0l · u=1 sweeps ~0.90 rad around the look-at so the arch covers the pair',
    Math.abs(Math.abs(sweepAbs) - SENDOFF_CAM.SWEEP) < 1e-6
    && SENDOFF_CAM.SWEEP === 0.90,
    `sweep=${sweepAbs.toFixed(4)}`);
  t('P0m · sendoffU is 0 before PAN, 1 after TURN, smoothstep between',
    sendoffU(PAIR.PAN) === 0
    && sendoffU(0) === 0
    && sendoffU(PAIR.TURN) === 1
    && sendoffU(PAIR.HOLD) === 1
    && sendoffU((PAIR.PAN + PAIR.TURN) / 2) > 0.4
    && sendoffU((PAIR.PAN + PAIR.TURN) / 2) < 0.6);
}

/* ── P1 · ONCE PER PAIR, NOT ONCE PER FANOUT ─────────────────────────────────────────────── */
{
  const c = circle(IDS);
  c.stage.set(LOCK);
  c.run(13);
  const first = c.plays().length;
  t('P1a · a new pair stages the runner and the guide rise',
    first >= 2 && c.stage.keys().join(',') === 'p1>p2', `${first} beats`);
  t('P1b · finished only after HOLD+FADE — pending-empty at 1.65s is not the sendoff',
    c.stage.finished() === true && c.stage.elapsed() + 1e-9 >= PAIR.HOLD + PAIR.FADE);

  c.clear();
  for (let i = 0; i < 25; i++) { c.stage.set(LOCK); c.run(0.2); }
  t('P1c · 25 more cues of the SAME pair play NOTHING — re-cue is a no-op',
    c.plays().length === 0 && c.drops().length === 0, `${c.plays().length} replays`);
}
{
  const c = circle(IDS);
  c.stage.set(LOCK);
  c.run(0.5);
  t('P1d · at 0.5s both have risen and the sendoff is NOT finished',
    c.plays().filter((p) => p.hold).length >= 2
    && c.stage.finished() === false
    && c.stage.pending() > 0,
    `plays=${c.plays().length} pending=${c.stage.pending()} finished=${c.stage.finished()}`);
}
{
  const c = circle(IDS);
  c.stage.set(LOCK);
  c.run(1.70);
  t('P1e · at WALK sitLock drops on the two named seats and the sendoff is NOT finished',
    c.drops().map((d) => d.seat).sort().join(',') === '0,1'
    && c.stage.finished() === false
    && c.stage.elapsed() + 1e-9 < PAIR.HOLD + PAIR.FADE,
    `drops=${c.drops().length} elapsed=${c.stage.elapsed().toFixed(2)} finished=${c.stage.finished()}`);
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
  t('P2e · the hop did not grow a second timer — pairLockMs() is the one wait',
    (localSrc.match(/setTimeout/g) || []).length >= 1
    && /pairLockMs\(\)/.test(localSrc)
    && !/PAIR_LOCK_MS\s*\+|pairLockMs\(\)\s*\+/.test(codeOf(localSrc).match(/startPairLock[\s\S]{0,500}/)?.[0] || ''));
}

/* ── P3 · overlay drops; phones wait; no new SHOW beat; sitLock drops; no follow mode ───── */
{
  const hostSrc = read('src/views/party-host.js');
  const phoneSrc = read('src/views/party-phone.js');
  const followSrc = read('src/party/follow.js');
  const introSrc = read('src/game/intro-bed.js');
  const introCode = codeOf(introSrc);
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
  t('P3d · sitLock drops at WALK for the two named seats (execute pattern) — Shot B comments are gone',
    /dropSitLock/.test(codeOf(stageSrc))
    && /dropSendoffLock/.test(introSrc)
    && /sitLock\s*=\s*false/.test(introCode)
    && /playLoco/.test(introSrc)
    && !/sitLock stays on/.test(stageSrc)
    && !/sitLock stays on/.test(introSrc)
    && /sendoffCam/.test(introSrc)
    && /PAIR\.WALK/.test(introSrc));
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
  t('P3h · they walk to pairMarks / ring origin, not to a door, not to the arch',
    /sendoffMarksOf|pairMarks/.test(introSrc)
    && /steerTo\(body, gx, gz/.test(introCode)
    && !/steerTo\(body,\s*arch/.test(introCode)
    && !/WALK.*door|walk them to the (mansion )?door/i.test(introCode));
  t('P3i · TURN yaws the root — no seated-clip name added for a stand-turn',
    /lerpYaw|aimYaw/.test(introSrc)
    && !/SEATED_REACTION_CLIPS/.test(introSrc)
    && !/Walk_Turn_Left_with_Weapon/.test(codeOf(introSrc)));
  t('P3j · sendoff camera is spec pan, not chase/top/crane during Casting',
    /fillSendoffEye|sendoffCam/.test(introSrc)
    && /pairLock\.keys\(\)\.length/.test(introCode)
    && !/CUE_KINDS/.test(introSrc));
  t('P3k · guide rests at HOLD; runner is holdForRun — not walked to the door, not glued to the mark into the run',
    /guideRested|role === 'guide'/.test(introSrc)
    && /holdForRun/.test(introSrc)
    && /pairLock\.set\(\[\]\)/.test(introSrc));
}

/* ── P4 · live: t:'episode' does not pin expedition before HOLD+FADE ───────────────────── */
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
  await sleep(PAIR.HOLD * 1000 - 200);
  t('P4b · still casting before HOLD+FADE — the sim did not skip',
    room.show === 'casting' && lastShow(tv)?.beat !== 'expedition',
    `show=${room.show} at ~HOLD`);
  await sleep(PAIR.FADE * 1000 + 500);
  t('P4c · expedition pins only after HOLD+FADE',
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
  c.run(13);
  c.clear();
  c.stage.set([]);
  t('P5b · an empty list puts both chairs back on the seated idle',
    c.rests().map((r) => r.seat).sort().join(',') === '0,1');
  t('P5c · pairRows rejects a runner who is also the guide',
    pairRows([{ runner: 'p1', guide: 'p1' }]).length === 0);
}
{
  const c = circle(IDS);
  c.stage.set(LOCK);
  c.run(2.0);
  c.clear();
  c.stage.set([]);
  t('P5d · empty setPairLock still rest()s both after WALK dropped held',
    c.rests().map((r) => r.seat).sort().join(',') === '0,1',
    `rests=${c.rests().map((r) => r.seat).join(',')}`);
}

console.log(`\npair-lock-stage: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
