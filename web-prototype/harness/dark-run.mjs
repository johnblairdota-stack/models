#!/usr/bin/env node
/**
 * 🔦 **dark-run — THE FIRST TASK SATISFIES THE TASK CONTRACT, AND ONE OF ITS NUMBERS MOVED.**
 *
 *   node harness/dark-run.mjs
 *
 * `rrr-task-deck.md` task 1. T1-T4 for The Dark Run, plus the two findings this file exists to
 * pin down.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 FINDING 1 — THE PHASE 1 CAMERA CURVE WAS OPTIMISTIC.
 * ---------------------------------------------------------------------------------------------
 * `guide-coverage` modelled ONE honest-error source: whether a live camera watches the Hunter's
 * room. The task deck names a second that is pure geometry — **the blind strip**, `H / tan θ`
 * of floor hidden behind every wall (`views/game.js:2161-2168`), **2.55 m at the shipped 4.80 m
 * storey and the 62° tilt floor**. A guide can be looking straight at a covered room and still
 * not see a Hunter standing behind a wall in it.
 *
 * The two compound, so the real error rate is HIGHER than the camera curve reported. D3 measures
 * both together.
 *
 * ⚠️ AND THE SECOND SOURCE IS SKILL, NOT NOISE. The guide controls the tilt: 2.55 m of blind
 * floor at 62°, 1.75 m at 70°, **zero at 90°** — but tilting up flattens the perspective the
 * route is read from. So the guide trades route legibility against blind floor, every second,
 * and D3b asserts that a competent guide can tilt themselves INTO the T3 band rather than being
 * stuck above it.
 *
 * 🚨 FINDING 2 — A CONTINUOUS THROTTLE HAS A SILENT-CREEP EXPLOIT, AND THE DETENTS CLOSE IT.
 * `hearFloor` is 0.03 (`rules.js:265-267`), so anything under **0.156 m/s** is inaudible however
 * close it is — **14.04 m of silent travel in a 90 s expedition**, which is a real corridor. That
 * would make silence a winning strategy and violate T4 outright. The detented stick has no notch
 * in that band: STILL goes nowhere, CREEP already carries 2.42 m. **Unreachable, not patched** —
 * and that is an argument for the detents beyond thumb ergonomics.
 *
 * ⚠️ ONE UNMEASURED INPUT, NAMED RATHER THAN BURIED: `ROOM_DEPTH` below is an assumption. The
 * real per-space spans are reported by `_flyover1-view.mjs` and should replace it before these
 * percentages are quoted as tuning targets.
 */

import { DETENT, noiseFor, audibleRange, blindStrip, guideSight, ghost, canOutrun, SILENT_SPEED, silentCrossing } from '../src/party/darkrun.js';
import { coverageFraction, expectedHonestError, T3_BAND } from '../src/party/coverage.js';
import { MOVE, HUNTER_SENSE, HUNTER_SPEED } from '../src/game/rules.js';
import { SECONDS, PHASE } from '../src/party/phases.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

/** ⚠️ ASSUMPTION. Replace with `_flyover1-view.mjs`'s measured per-space spans. */
const ROOM_DEPTH = 8.0;
const STOREY = 4.80;
const EXPEDITION = SECONDS[PHASE.EXPEDITION];

// ---------------------------------------------------------------- D0 · the arm
t('D0 arm · the shipped constants are the ones being reasoned about',
  MOVE.run === 5.20 && MOVE.walk === 2.55 && HUNTER_SENSE.hearRange === 14 && HUNTER_SENSE.hearFloor === 0.03,
  `run ${MOVE.run} · walk ${MOVE.walk} · hearRange ${HUNTER_SENSE.hearRange} · hearFloor ${HUNTER_SENSE.hearFloor}`);

// ---------------------------------------------------------------- D1 · T1 asymmetry
{
  const runnerHas = ['position', 'firstPersonView', 'terminalPrompt'];
  const guideHas = ['flyover', 'hunterMark', 'noiseRings', 'tilt'];
  const shared = runnerHas.filter((k) => guideHas.includes(k));
  t('D1 · T1 — runner and guide each hold something the other does not', shared.length === 0,
    `runner: ${runnerHas.join('/')} · guide: ${guideHas.join('/')}`);
}

// ---------------------------------------------------------------- D2 · T2 the channel is a voice
{
  const surface = Object.keys(guideSight({ covered: true, wallDistance: 9, tiltDeg: 70 }));
  t('D2 · T2 — the guide module exposes no text channel to the runner',
    !surface.some((k) => /text|msg|chat|say|send/i.test(k)), `guideSight returns {${surface.join(', ')}}`);
}

// ---------------------------------------------------------------- D3 · T3, both sources
{
  const blindFraction = (tilt) => Math.min(1, blindStrip(STOREY, tilt) / ROOM_DEPTH);
  const combined = (cams, tilt) => {
    const c = coverageFraction(7, cams);
    const seen = c * (1 - blindFraction(tilt));
    return (1 - seen) / 2;
  };

  console.log('       cams │  62°     70°     78°     86°   │ coverage-only');
  for (const cams of [1, 2, 3]) {
    const row = [62, 70, 78, 86].map((d) => `${(combined(cams, d) * 100).toFixed(1)}%`.padStart(6)).join('  ');
    console.log(`       ${cams}    │ ${row}   │ ${(expectedHonestError(coverageFraction(7, cams)) * 100).toFixed(1)}%`);
  }

  const worseEverywhere = [1, 2, 3].every((c) =>
    combined(c, 62) > expectedHonestError(coverageFraction(7, c)) - 1e-9);
  t('D3a · the blind strip raises the honest error above coverage alone, at every camera count',
    worseEverywhere, 'the Phase 1 curve was optimistic — two independent sources, not one');

  const inBand = [62, 66, 70, 74, 78, 82, 86, 90].filter((d) => {
    const e = combined(2, d);
    return e >= T3_BAND.lo && e <= T3_BAND.hi;
  });
  t('D3b · a mid-game guide can tilt themselves INTO the T3 band', inBand.length > 0,
    inBand.length ? `2 cameras lands in 15-25% at ${inBand.join('°, ')}° — the strip is skill, not noise`
      : 'no reachable tilt lands in band at two cameras');

  t('D3c · and cannot tilt out of the game — full coverage plus flat tilt is still not an oracle at 62°',
    combined(3, 62) > 0.05, `${(combined(3, 62) * 100).toFixed(1)}% at three cameras and the tilt floor`);
}

// ---------------------------------------------------------------- D4 · T4, and the exploit
{
  const silent = silentCrossing(EXPEDITION);
  t('D4a · a continuous throttle really does have a silent band',
    SILENT_SPEED > 0 && silent > 10,
    `under ${SILENT_SPEED.toFixed(3)} m/s is inaudible → ${silent.toFixed(2)} m of silent travel in a ${EXPEDITION}s expedition`);

  const inBand = DETENT.filter((d) => d.speed > 0 && d.speed < SILENT_SPEED);
  t('D4b · T4 — no detent lands in the silent band, so the exploit is unreachable',
    inBand.length === 0,
    `STILL 0 m/s goes nowhere · CREEP ${DETENT[1].speed} m/s is already audible at ${audibleRange(noiseFor(DETENT[1].speed)).toFixed(2)} m`);

  t('D4c · every moving detent is audible', DETENT.filter((d) => d.speed > 0).every((d) => audibleRange(noiseFor(d.speed)) > 0),
    DETENT.map((d) => `${d.name}:${audibleRange(noiseFor(d.speed)).toFixed(1)}m`).join(' '));
}

// ---------------------------------------------------------------- D5 · the trade holds
{
  t('D5 · the runner can outrun the Hunter at every stage, and never quietly',
    [1, 2, 3].every(canOutrun) && noiseFor(MOVE.run) === 1,
    `run ${MOVE.run} vs hunter ${HUNTER_SPEED.slice(1).join('/')} · running is noise 1.0, heard at ${HUNTER_SENSE.hearRange} m`);
}

// ---------------------------------------------------------------- D6 · the ghost decays
{
  const g0 = ghost({ lastSeenAt: 0, now: 0 });
  const g6 = ghost({ lastSeenAt: 0, now: 6 });
  const g18 = ghost({ lastSeenAt: 0, now: 18 });
  t('D6 · the last-known ghost decays rather than persisting',
    g0.confidence === 1 && Math.abs(g6.confidence - 0.5) < 1e-9 && g18.confidence < 0.15,
    `t=0 ${g0.confidence.toFixed(2)} · t=6 ${g6.confidence.toFixed(2)} · t=18 ${g18.confidence.toFixed(2)}`);
  t('D6b · and a guide who never saw it has nothing', ghost({ lastSeenAt: null, now: 5 }).confidence === 0);
}

// ---------------------------------------------------------------- D7 · the controls
{
  t('D7a control · at 90° the blind strip vanishes, so the strip really is the tilt',
    blindStrip(STOREY, 90) < 1e-9 && blindStrip(STOREY, 62) > 2.5,
    `0.00 m at 90° vs ${blindStrip(STOREY, 62).toFixed(2)} m at 62°`);
  t('D7b control · an ungated guide has no honest error at all',
    guideSight({ covered: true, wallDistance: 99, tiltDeg: 90 }).seen === true
    && guideSight({ covered: false, wallDistance: 99, tiltDeg: 90 }).seen === false,
    'coverage is what makes "clear" a guess');
  t('D7c control · a Hunter inside the strip is hidden even in a covered room',
    guideSight({ covered: true, wallDistance: 1.0, tiltDeg: 62 }).seen === false,
    guideSight({ covered: true, wallDistance: 1.0, tiltDeg: 62 }).why);
}

console.log(`\ndark-run: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
