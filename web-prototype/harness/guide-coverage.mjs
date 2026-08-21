#!/usr/bin/env node
/**
 * 📹 **guide-coverage — THE GUIDE IS NOT AN ORACLE, AND THE ERROR RATE IS A NUMBER.**
 *
 *   node harness/guide-coverage.mjs
 *
 * Showstopper **S3**, and the headless half of `guide-lie`'s **T3** band. `views/game.js` L2559
 * ships `hunterMark.visible = hs.inScene && !!hp` — the Hunter is on the guide's map because it
 * EXISTS. A guide holding that is never wrong, so T3's honest error rate is exactly zero, and a
 * guide who is never honestly wrong is a lie detector rather than a player.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THIS GATE USED TO BE AN INSTRUMENT POINTED AT A MODEL, WHICH IS THE EXACT CRITICISM
 * `hunter-draw`'s OWN HEADER LEVELS AT `party-sim`.
 * ---------------------------------------------------------------------------------------------
 * `honestErrorAt` modelled COVERAGE ONLY. `session.js`'s `sightForGuide()` composes coverage with
 * `darkrun.js`'s blind strip — a wall of height `H` at elevation θ hides `H / tan θ` of floor
 * behind it, 2.55 m at the shipped storey and tilt — and the composition is what ships. So the
 * model's curve read **0% honest error at three cameras** while the shipped code read 16.1%, and
 * this file asserted the model agreed with itself.
 *
 * It was also indexed one camera to the left of the game. Coverage is asked about
 * `camerasLive(lit)` — the establishing camera is live from frame one — and the sweep passed the
 * scoreboard's `lit` straight through. And it stopped at 3, while `WIN_TARGETS` asks for up to 4
 * lights, so the top of the objective was never measured at all.
 *
 * Everything below now runs the SHIPPED composition, over the WHOLE objective range, and C2 arm
 * reconciles it frame by frame against guide flyovers read out of real `createSession` shows. A
 * model may stand in for something that does not exist yet; it may never stand in for something
 * that does.
 *
 * ---------------------------------------------------------------------------------------------
 * WHERE THE BAND COMES FROM, ARITHMETICALLY
 * ---------------------------------------------------------------------------------------------
 * The guide is asked *"is it safe to move"*. They have a definite answer when they can SEE the
 * Hunter and must guess otherwise, and a guess is right about half the time:
 *
 *     honest error ~= (1 - P(seen)) / 2,  P(seen) = coverage x (1 - P(blind strip))
 *
 * T3 wants **15-25%**. C2 measures the curve and C2b asserts the band at every point the game can
 * actually reach past the first light, which is a stronger claim than the old single point.
 */

import {
  coverageFraction, coveredRooms, hunterVisibleToGuide, expectedHonestError, expectedHonestErrorSeen,
  cameraRoster, camerasLive, ROOMS, ROOMS_PER_CAM, T3_BAND,
} from '../src/party/coverage.js';
import { guideSight, blindStrip } from '../src/party/darkrun.js';
import { createRoom } from '../src/party/room.js';
import { createSession, pick, GUIDE_TILT_DEG, STOREY_H, CALL, MOVE_CHOICE } from '../src/party/session.js';
import { WIN_TARGETS } from '../src/party/win.js';
import { PHASE } from '../src/party/phases.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

const SEEDS = 12000;
/** Episodes 1..5 — `phases.js`'s `EPISODE_CAP`, so the wall draw is swept over the range a show uses. */
const EPS = [1, 2, 3, 4, 5];
/** The tallest light any table has to earn. `win.js` owns the number; this file only reads it. */
const OBJECTIVE = Math.max(...Object.values(WIN_TARGETS).map((w) => w.cameraTarget));
/** How far behind a wall the Hunter can be, in `session.js`'s own units: `pick(800,...) / 100`. */
const WALL_SPAN_M = 8;

/**
 * 🚨 THE SHIPPED COMPOSITION, ASSEMBLED FROM THE SHIPPED PARTS AND FROM NOTHING ELSE.
 *
 * This is `session.js`'s `sightForGuide()` with the mansion detached: the same `pick` for the
 * Hunter's room and the wall distance, the same `hunterVisibleToGuide`, the same `guideSight`,
 * the same `GUIDE_TILT_DEG` and `STOREY_H`. Nothing is re-implemented — C2 arm proves that by
 * replaying it against real flyover frames and requiring zero disagreements.
 *
 * @param {number} lit  cameras the crew has EARNED. `camerasLive` adds the establishing one.
 * @param {boolean} gated     false restores `hs.inScene && !!hp` — the shipped oracle. C4.
 * @param {number} tiltDeg    90 collapses the blind strip to nothing. C6.
 */
function sightSweep(lit, { gated = true, tiltDeg = GUIDE_TILT_DEG } = {}) {
  const live = camerasLive(lit);
  let seen = 0, n = 0;
  for (let worldSeed = 1; worldSeed <= SEEDS; worldSeed++) {
    for (const ep of EPS) {
      const hunterRoom = ROOMS[pick(ROOMS.length, worldSeed, 'hunter', ep)];
      const covered = gated ? hunterVisibleToGuide({ worldSeed, unlocked: live, hunterRoom }) : true;
      const wallDistance = pick(800, worldSeed, 'wall', ep) / 100;
      if (guideSight({ covered, wallDistance, tiltDeg, storeyH: STOREY_H }).seen) seen++;
      n++;
    }
  }
  return { live, seen, n, pSeen: seen / n, error: (1 - seen / n) / 2 };
}

/**
 * Drive real shows and read the guide's own flyover out of the frame `session.js` built for them,
 * with the sealed Hunter room beside it. The gate is the Reunion, so it may read both.
 */
function realFlyovers({ seeds = 40 } = {}) {
  const rows = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const worldSeed = seed * 7;
    const s = createSession({ count: 8, castSeed: seed, worldSeed, send: () => {} });
    let now = 0;
    s.start(now);
    for (let i = 0; i < 4000 && s.state.phase !== PHASE.REUNION; i++) {
      const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
      switch (s.state.phase) {
        case PHASE.CASTING:
          for (let k = 0; k < alive.length; k++) {
            s.input(alive[k], { t: 'cast', runner: alive[(k + 1) % alive.length], guide: alive[(k + 2) % alive.length] });
          }
          break;
        case PHASE.EXPEDITION: {
          const g = s.state.pair.guide;
          const f = s.unprojected(s.socketFor(g).id);
          if (f && f.flyover) {
            rows.push({ worldSeed, ep: s.state.episode, lit: s.state.cameras.unlocked, seen: f.flyover.hunter, room: f.flyover.room });
          }
          s.input(g, { t: 'call', call: CALL.CLEAR });
          s.input(s.state.pair.runner, { t: 'move', move: MOVE_CHOICE.GO });
          break;
        }
        case PHASE.RECKONING:
          if (!s.state.nominations.length) s.input(alive[0], { t: 'nominate', target: alive[1] });
          break;
        case PHASE.VOTE:
          for (const id of alive) s.input(id, { t: 'vote', choice: alive[1] });
          break;
        default: break;
      }
      now += 5000;
      s.tick(now);
    }
    // The sealed room, per episode, straight out of the log.
    const placed = new Map(s.log.all().filter((e) => e.type === 'hunter.placed').map((e) => [e.data.episode, e.data.room]));
    for (const r of rows) if (r.worldSeed === worldSeed && r.hunterRoom === undefined) r.hunterRoom = placed.get(r.ep);
  }
  return rows;
}

// ---------------------------------------------------------------- C0 · the arm
{
  const cams = cameraRoster(7);
  const covered = new Set(cams.flatMap((c) => c.rooms));
  t('C0 arm · the roster covers every room across all cameras, and no room twice',
    covered.size === ROOMS.length && cams.flatMap((c) => c.rooms).length === ROOMS.length,
    `${cams.length} cameras x ${cams[0].rooms.length} rooms = ${ROOMS.length}`);
}

// ---------------------------------------------------------------- C1 · coverage is monotonic
{
  let mono = true;
  const range = [];
  for (let lit = 0; lit <= OBJECTIVE; lit++) range.push(camerasLive(lit));
  for (let s = 0; s < 200; s++) {
    let prev = -1;
    for (const live of range) { const c = coverageFraction(s, live); if (c < prev) mono = false; prev = c; }
  }
  t('C1 · coverage rises with every unlock, never falls — across the whole objective range', mono,
    range.map((live, i) => `${i}lit/${live}cam:${(coverageFraction(7, live) * 100).toFixed(0)}%`).join(' '));
}

// ---------------------------------------------------------------- C2 · the curve, through the code
const CURVE = [];
for (let lit = 0; lit <= OBJECTIVE; lit++) {
  const r = sightSweep(lit);
  CURVE.push({ lit, ...r, coverage: coverageFraction(7, r.live) });
}
const STRIP = blindStrip(STOREY_H, GUIDE_TILT_DEG);
const BLIND = STRIP / WALL_SPAN_M;

{
  for (const r of CURVE) {
    console.log(`       ${r.lit} lit -> ${r.live} live cam${r.live === 1 ? ' ' : 's'} · coverage ${(r.coverage * 100).toFixed(1).padStart(5)}%`
      + ` · sees the Hunter ${(r.pSeen * 100).toFixed(1)}% · honest error ${(r.error * 100).toFixed(1)}%`
      + ` (coverage alone would say ${(expectedHonestError(r.coverage) * 100).toFixed(1)}%)`);
  }
  console.log(`       blind strip ${STRIP.toFixed(2)} m of ${WALL_SPAN_M} m at ${GUIDE_TILT_DEG}° and a ${STOREY_H} m storey — ${(BLIND * 100).toFixed(1)}% of wall draws`);

  const worst = Math.max(...CURVE.map((r) => Math.abs(r.error - expectedHonestErrorSeen(r.coverage, BLIND))));
  t('C2 · the measured curve is the COMPOSED one — coverage times the blind strip, not coverage alone',
    worst < 0.01,
    `worst departure from (1 - c(1-b))/2 is ${(worst * 100).toFixed(2)} points across ${CURVE.length} camera counts`);

  /**
   * ⚠️ C2b IS NOW A BAND AT EVERY REACHABLE POINT RATHER THAN AT ONE. The old file asserted a
   * single mid-game number and said asserting the band everywhere would be asserting that
   * progression does not happen. That was true of the coverage-only model, whose curve ran to
   * zero; with the blind strip in, the curve LANDS in the band at the second light and stays
   * there, which is the property the mode actually needs and a much stronger thing to pin.
   */
  const settled = CURVE.filter((r) => r.lit >= 2);
  t('C2b · from the second light on, the guide sits inside T3\'s 15-25% band and never leaves it',
    settled.length > 0 && settled.every((r) => r.error >= T3_BAND.lo && r.error <= T3_BAND.hi),
    settled.map((r) => `${r.lit}lit ${(r.error * 100).toFixed(1)}%`).join(' · ') + ` in [${T3_BAND.lo * 100}, ${T3_BAND.hi * 100}]`);

  t('C2c · and episode one is deliberately harder than the band — a nearly blind guide',
    CURVE[0].error > T3_BAND.hi,
    `0 lit -> ${(CURVE[0].error * 100).toFixed(1)}%, above ${T3_BAND.hi * 100}% on purpose`);

  t('C2d · the guide never becomes an oracle, even with every camera the objective can buy',
    CURVE[CURVE.length - 1].error > T3_BAND.lo,
    `${OBJECTIVE} lit -> ${(CURVE[CURVE.length - 1].error * 100).toFixed(1)}% · the blind strip is the whole of what stands between here and 0%`);
}

// ---------------------------------------------------------------- C2 arm · it is the shipped composition
/**
 * 🚨 THE ARM THAT MAKES C2 A MEASUREMENT RATHER THAN AN OPINION. Every guide flyover from real
 * `createSession` shows is replayed through `sightSweep`'s parts, from the same worldSeed,
 * episode and camera count, against the Hunter room the SEALED log recorded. Zero disagreements
 * or this file is measuring something the game does not do.
 */
{
  const rows = realFlyovers({ seeds: 70 });
  const wrong = rows.filter((r) => {
    const covered = hunterVisibleToGuide({ worldSeed: r.worldSeed, unlocked: camerasLive(r.lit), hunterRoom: r.hunterRoom });
    const wallDistance = pick(800, r.worldSeed, 'wall', r.ep) / 100;
    return guideSight({ covered, wallDistance, tiltDeg: GUIDE_TILT_DEG, storeyH: STOREY_H }).seen !== r.seen;
  });
  const lits = new Set(rows.map((r) => r.lit));
  t('C2 arm · every guide flyover a real show produced is reproduced exactly by the sweep above',
    rows.length > 200 && wrong.length === 0,
    `${rows.length} flyover frames from createSession · ${wrong.length} disagreements · camera counts seen: ${[...lits].sort().join(',')}`);
  const sawBoth = rows.some((r) => r.seen) && rows.some((r) => !r.seen);
  t('C2 arm b · and those frames contain both answers, so the reconciliation is not trivially true',
    sawBoth, `${rows.filter((r) => r.seen).length} saw the Hunter, ${rows.filter((r) => !r.seen).length} did not`);
}

// ---------------------------------------------------------------- C5 · the objective outruns the table
/**
 * 🚨 **A COUNTER INCREMENT AGAINST A CAMERA THAT DOES NOT EXIST — REPORTED, NOT PAPERED OVER.**
 *
 * `ROOMS.length / ROOMS_PER_CAM` is 3, so three cameras exist, and one of them is the establishing
 * camera that is live from frame one. Coverage is therefore TOTAL from the second light, while
 * `WIN_TARGETS` asks for three lights at 4-5 players and four at 6-8. The last one or two lights
 * of the objective move the guide's sight by exactly nothing.
 *
 * ⚠️ NOTHING HAS BEEN CHANGED TO MAKE THIS GO AWAY. `ROOMS_PER_CAM` and `WIN_TARGETS` are a design
 * decision and three documents disagree about the camera table; a gate is not the place to settle
 * it. What a gate can do is state the size of the gap, in numbers, and refuse to let it widen
 * quietly. If the table is later given more cameras, this assertion goes red and whoever changed
 * it writes the new sentence — which is the correct outcome, not a regression.
 */
{
  const cams = cameraRoster(7).length;
  const saturatesAt = CURVE.findIndex((r) => r.coverage >= 1 - 1e-9);
  const flat = CURVE.filter((r) => r.lit > saturatesAt);
  const deadLights = Object.entries(WIN_TARGETS).map(([count, w]) => `${count}p:${w.cameraTarget - saturatesAt}`);
  t('C5 · the camera table saturates before the objective does, and the gap is this wide',
    cams === ROOMS.length / ROOMS_PER_CAM && saturatesAt >= 0 && saturatesAt < OBJECTIVE
      && flat.every((r) => Math.abs(r.error - CURVE[saturatesAt].error) < 1e-9),
    `${cams} cameras exist · coverage is total at ${saturatesAt} lit · the objective asks for ${OBJECTIVE}`
    + ` · lights that buy the guide nothing, by table size: ${deadLights.join(' ')}`);

  /**
   * The control is a camera table that does not exist. That is the one thing a model is allowed
   * to stand in for — and it shows the flatness is a property of THIS table rather than of the
   * measurement: one room per camera gives six cameras and a curve still climbing at the top.
   */
  const denseCovered = (worldSeed, live) => {
    const pool = [...coveredRooms(worldSeed, 99)];
    return new Set(pool.slice(0, Math.min(live, pool.length)));
  };
  const denseCurve = [];
  for (let lit = 0; lit <= OBJECTIVE; lit++) denseCurve.push(denseCovered(7, camerasLive(lit)).size / ROOMS.length);
  t('C5 control · one room per camera would still be climbing at the objective\'s last light — the flatness is the TABLE',
    denseCurve[OBJECTIVE] > denseCurve[OBJECTIVE - 1] && denseCurve[OBJECTIVE] < 1,
    `hypothetical 1-room cameras: ${denseCurve.map((c, i) => `${i}lit ${(c * 100).toFixed(0)}%`).join(' · ')}`);
}

// ---------------------------------------------------------------- C3 · the oracle is gone
{
  const tape = {};
  const r = createRoom({ count: 8, castSeed: 4, worldSeed: 7, send: (id, f) => { (tape[id] = tape[id] || []).push(f); } });
  r.start();
  r.playEpisode({ hunterRoom: ROOMS[5] });   // cam1 covers it
  r.playEpisode({ hunterRoom: 'gallery' });  // cam3 does, but only once unlocked
  // ⚠️ THE GUIDE IS WHOEVER THE BALLOT CAST, NOT phone-1. An earlier draft hard-coded the seat
  // and went green only for as long as the pair was picked by seat index; the moment casting
  // became a real ballot it measured an empty set and reported it as blind. Find the flyover.
  const fly = Object.values(tape).flat().filter((f) => f.flyover);
  const seen = fly.filter((f) => f.flyover.hunter).length;
  t('C3 · the guide is sometimes blind and sometimes not, in a real room',
    seen > 0 && seen < fly.length, `${seen} of ${fly.length} flyover frames show the Hunter`);
  t('C3b · a blind frame omits the hunter mark entirely, rather than nulling it',
    fly.filter((f) => !f.flyover.hunter).every((f) => f.flyover.marks.every((m) => m.kind !== 'hunter')),
    'absence, not a placeholder — a null mark is still an answer');
}

// ---------------------------------------------------------------- C4, C6 · the controls
{
  // `hs.inScene && !!hp` is BOTH gates off: no coverage test and no wall between them. The
  // residue is the one draw in 800 that stands the Hunter exactly on the wall line, where
  // `guideSight`'s `<=` still counts as hidden — 0.06%, which is not a mechanic.
  const ungated = sightSweep(OBJECTIVE, { gated: false, tiltDeg: 90 });
  t('C4 control · the shipped ungated flyover turns T3 red', ungated.error < 0.001,
    `hs.inScene && !!hp -> ${(ungated.error * 100).toFixed(2)}% honest error — a guide who is never wrong`);

  /**
   * 🚨 THE CONTROL THIS FILE WAS MISSING, AND IT IS THE ONE THAT WOULD HAVE CAUGHT THE BUG.
   * Collapse the blind strip — tilt the guide's camera to straight down, where `H / tan θ` is
   * zero — and full coverage becomes full sight again. That is the curve the old `honestErrorAt`
   * was drawing, and it says 0% where the shipped composition says 16%.
   */
  const noStrip = CURVE.map((r) => sightSweep(r.lit, { tiltDeg: 90 }));
  const top = noStrip[noStrip.length - 1];
  t('C6 control · take the blind strip away and the guide IS an oracle at full coverage — C2b and C2d go red',
    top.error < 0.01 && top.error < CURVE[CURVE.length - 1].error - 0.10,
    `at 90° the strip is ${blindStrip(STOREY_H, 90).toExponential(1)} m: ${OBJECTIVE} lit -> ${(top.error * 100).toFixed(2)}%`
    + ` against the shipped ${(CURVE[CURVE.length - 1].error * 100).toFixed(1)}%`);
  t('C6 control b · and it reproduces the curve this gate used to assert — coverage alone, to zero',
    noStrip.every((r, i) => Math.abs(r.error - expectedHonestError(CURVE[i].coverage)) < 0.01),
    noStrip.map((r, i) => `${i}lit ${(r.error * 100).toFixed(1)}%`).join(' · ') + ' — the model the old file agreed with');
}

console.log(`\nguide-coverage: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
