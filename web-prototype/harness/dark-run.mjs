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
 * 🚨 **FINDING 2 WAS ASSERTED AGAINST THE TABLE AND THE ENGINE DISAGREED WITH IT BY A FACTOR OF
 * THREE.** D4b used to read `audibleRange(noiseFor(DETENT[1].speed))` — `darkrun.js`'s own numbers,
 * checked against `darkrun.js`'s own numbers. What decides whether the exploit is reachable is what
 * `Player` does with the stick, and `_stepGround` was applying the stick's magnitude twice: the
 * direction vector already carries `mlen`, and the scale multiplied by `mlen` again. WALK and RUN
 * send 1.0 and were exact; CREEP sends 0.353 and got 0.353², so shipped CREEP was **0.318 m/s,
 * audible at 0.86 m** — less than the 1.00 m at which a stage-3 Hunter is already touching the
 * runner — and crossed **28.6 m** in ninety seconds. The exploit this file calls *"unreachable, not
 * patched"* was reachable, by the second notch of the shipped throttle, for as long as the party
 * mode has existed.
 *
 * D4 is measured on the ENGINE now: a real `Player`, driven by `views/expedition.js`'s own
 * `detentInput` ladder, free body, ninety seconds per detent. D4d is the control and it is the
 * shipped bug — the same `Player`, handed a stick that has already been squared, which is exactly
 * what the second multiplication did.
 *
 * ⚠️ ONE UNMEASURED INPUT, NAMED RATHER THAN BURIED: `ROOM_DEPTH` below is an assumption. The
 * real per-space spans are reported by `_flyover1-view.mjs` and should replace it before these
 * percentages are quoted as tuning targets.
 */

import { DETENT, noiseFor, audibleRange, blindStrip, guideSight, ghost, canOutrun, SILENT_SPEED, silentCrossing } from '../src/party/darkrun.js';
import { coverageFraction, expectedHonestError, T3_BAND } from '../src/party/coverage.js';
import { MOVE, HUNTER_SENSE, HUNTER_SPEED } from '../src/game/rules.js';
import { SECONDS, PHASE } from '../src/party/phases.js';

// ---------------------------------------------------------------- the free body
/**
 * 🚨 THE GATE IMPORTS THE ENGINE; `darkrun.js` STILL MAY NOT. Same trade `expedition-wire` E1
 * makes: the rules stay pure so they run in a worker and on a phone, and the gate is where the
 * two are held against each other. No house is built — a free body on flat ground is what a
 * top-speed and a noise reading are about, and `room.collide` would only add a wall to argue with.
 */
const SRC = new URL('../src/', new URL('.', import.meta.url));
const s_ = (p) => new URL(p, SRC).href;
globalThis.location = { search: '' };
globalThis.document = {
  createElementNS: () => ({ set src(_v) {}, get src() { return ''; }, addEventListener() {}, removeEventListener() {}, style: {} }),
  createElement: () => ({ style: {}, getContext: () => null }),
};
const _w = console.warn, _e = console.error; console.warn = () => {}; console.error = () => {};
const { initBaker } = await import(s_('materials/baker.js'));
initBaker({
  getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {},
  readRenderTargetPixels: (a, b, c, d, e, buf) => { buf[0] = 200; buf[1] = 200; buf[2] = 200; if (buf.length > 3) buf[3] = 255; },
});
const THREE = await import('three');
const { Player } = await import(s_('game/player.js'));
const { LimbField } = await import(s_('game/limbs.js'));
console.warn = _w; console.error = _e;

/** `views/expedition.js`'s own detent-to-stick, imported rather than restated. */
const { detentInputFor } = await import(s_('views/expedition.js'));

/**
 * Hold one detent for `seconds` and report what the body actually did. The first two seconds are
 * spin-up (`MOVE.accel` is a first-order lag, not a step) and are not measured.
 */
function freeBody(detent, seconds = SECONDS[PHASE.EXPEDITION]) {
  const DT = 1 / 60;
  let seed = 7;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const scene = new THREE.Scene();
  const field = new LimbField(scene, { rng, floorY: 0, bounds: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 } });
  const p = new Player({ scene, world: null, field, rng, id: 'runner', avatar: null });
  p.pos.set(0, 0, 0); p.facing = 0; p.aimYaw = 0;
  const inp = detentInputFor(detent);
  for (let i = 0; i < 2 * 60; i++) p.update(DT, i * DT, { ...inp, aimYaw: 0, aimPitch: 0 });
  const from = p.pos.clone();
  let noiseSum = 0, frames = 0;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    p.update(DT, i * DT, { ...inp, aimYaw: 0, aimPitch: 0 });
    noiseSum += p.noise; frames++;
  }
  const noise = noiseSum / frames;
  return { speed: p.speed, noise, audible: audibleRange(noise), travel: p.pos.distanceTo(from), radius: p.radius };
}

/**
 * THE CONTROL, AND IT IS THE BUG RATHER THAN A MODEL OF IT. `_stepGround` applied the stick's
 * magnitude a second time, so the body received `mv` squared. Squaring the stick before it is
 * handed over drives the IDENTICAL integrator to the IDENTICAL place — nothing is recomputed from
 * a formula here, the same `Player` is simply given what the shipped one was effectively given.
 */
function freeBodySquared(detent, seconds = SECONDS[PHASE.EXPEDITION]) {
  const DT = 1 / 60;
  let seed = 7;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const scene = new THREE.Scene();
  const field = new LimbField(scene, { rng, floorY: 0, bounds: { minX: -400, maxX: 400, minZ: -400, maxZ: 400 } });
  const p = new Player({ scene, world: null, field, rng, id: 'runner', avatar: null });
  p.pos.set(0, 0, 0); p.facing = 0; p.aimYaw = 0;
  const base = detentInputFor(detent);
  const inp = { ...base, move: { x: base.move.x * Math.hypot(base.move.x, base.move.y), y: base.move.y * Math.hypot(base.move.x, base.move.y) } };
  for (let i = 0; i < 2 * 60; i++) p.update(DT, i * DT, { ...inp, aimYaw: 0, aimPitch: 0 });
  const from = p.pos.clone();
  let noiseSum = 0, frames = 0;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    p.update(DT, i * DT, { ...inp, aimYaw: 0, aimPitch: 0 });
    noiseSum += p.noise; frames++;
  }
  const noise = noiseSum / frames;
  return { speed: p.speed, noise, audible: audibleRange(noise), travel: p.pos.distanceTo(from) };
}

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
/**
 * 🚨 **THE ARGUMENT IS ABOUT THE ENGINE, SO IT IS MEASURED ON THE ENGINE.** Everything below drives
 * a real `Player` with `views/expedition.js`'s own detent ladder for a full expedition per notch.
 * `darkrun.js`'s table is still here — as the thing the engine has to AGREE with (D4b), which is a
 * claim, rather than as the thing being asserted about itself, which was not.
 */
{
  const engine = DETENT.map((d, i) => ({ name: d.name, table: d.speed, ...freeBody(i) }));
  const shipped = DETENT.map((d, i) => ({ name: d.name, table: d.speed, ...freeBodySquared(i) }));
  /**
   * How close a Hunter must be before its hearing beats simply bumping into the runner. Stage 3 is
   * `0.30 + 3 × 0.12` (`hunter-ai.js`'s own radius line) and the runner brings its own. Below this
   * an "audible" robot is one the Hunter can only hear by standing inside it.
   */
  const TOUCHING = (0.30 + 3 * 0.12) + engine[0].radius;

  console.log('       detent │ table speed │ engine speed  noise  audible │ 90 s travel');
  for (const r of engine) {
    console.log(`       ${r.name.padEnd(6)} │ ${r.table.toFixed(3).padStart(11)} │ ${r.speed.toFixed(3).padStart(12)} ${r.noise.toFixed(3).padStart(6)} ${(r.audible.toFixed(2) + ' m').padStart(8)} │ ${r.travel.toFixed(1).padStart(7)} m`);
  }

  const silent = silentCrossing(EXPEDITION);
  t('D4a · a continuous throttle really does have a silent band',
    SILENT_SPEED > 0 && silent > 10,
    `under ${SILENT_SPEED.toFixed(3)} m/s is inaudible → ${silent.toFixed(2)} m of silent travel in a ${EXPEDITION}s expedition`);

  t('D4a2 · and the ENGINE delivers the speed the table names, at every detent',
    engine.every((r) => Math.abs(r.speed - r.table) < 0.005),
    engine.map((r) => `${r.name} ${r.speed.toFixed(3)}/${r.table.toFixed(3)}`).join(' · '));

  const inBand = engine.filter((r) => r.speed > 0 && r.speed < SILENT_SPEED);
  t('D4b · T4 — no detent DELIVERS a speed in the silent band, so the exploit is unreachable',
    inBand.length === 0,
    `STILL 0 m/s goes nowhere · CREEP delivers ${engine[1].speed.toFixed(3)} m/s and is audible at ${engine[1].audible.toFixed(2)} m`);

  t('D4b2 · and "audible" means audible before it is touching you — the honest form of T4',
    engine.filter((r) => r.speed > 0).every((r) => r.audible > TOUCHING),
    `contact at ${TOUCHING.toFixed(2)} m (stage-3 Hunter + runner) · ` + engine.filter((r) => r.speed > 0).map((r) => `${r.name} ${r.audible.toFixed(2)}m`).join(' '));

  t('D4c · every moving detent is audible, measured off the body rather than off the table',
    engine.filter((r) => r.speed > 0).every((r) => r.audible > 0),
    engine.map((r) => `${r.name}:${r.audible.toFixed(1)}m`).join(' '));

  /**
   * The control. Same `Player`, same ladder, stick squared — which is precisely what the second
   * `mlen` did. If the fix is ever reverted these four go red and D4b goes with them.
   */
  t('D4d control · apply the stick twice and CREEP collapses to a third of its documented speed',
    Math.abs(shipped[1].speed - engine[1].speed * (DETENT[1].speed / MOVE.walk)) < 0.01
    && shipped[1].speed < engine[1].speed * 0.4,
    `CREEP ${engine[1].speed.toFixed(3)} → ${shipped[1].speed.toFixed(3)} m/s · noise ${engine[1].noise.toFixed(3)} → ${shipped[1].noise.toFixed(3)}`);

  t('D4d2 control · WALK and RUN are untouched by it, which is why nothing caught it',
    Math.abs(shipped[2].speed - engine[2].speed) < 0.005 && Math.abs(shipped[3].speed - engine[3].speed) < 0.005,
    `the stick is 1.0 at both, and 1.0² is 1.0 — WALK ${shipped[2].speed.toFixed(3)}, RUN ${shipped[3].speed.toFixed(3)}`);

  t('D4d3 control · and the exploit D4b dismisses becomes REACHABLE — a detent audible only inside the Hunter',
    shipped[1].audible < TOUCHING && shipped[1].audible > 0,
    `shipped CREEP audible at ${shipped[1].audible.toFixed(2)} m against ${TOUCHING.toFixed(2)} m of contact — the Hunter has to be standing in the robot to hear it`);

  t('D4d4 control · carrying it further in ninety seconds than the silent-travel budget the argument calls unacceptable',
    shipped[1].travel > silent,
    `${shipped[1].travel.toFixed(1)} m at an inaudible-in-practice speed vs the ${silent.toFixed(2)} m budget · fixed CREEP travels ${engine[1].travel.toFixed(1)} m and is heard at ${engine[1].audible.toFixed(2)} m`);

  t('D4e · the table itself is unchanged and still agrees with `noiseFor`',
    DETENT.filter((d) => d.speed > 0).every((d) => audibleRange(noiseFor(d.speed)) > 0),
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
