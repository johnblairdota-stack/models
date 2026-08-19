/**
 * 🔦 **THE DARK RUN — the whole mode in one task: a robot in unlit corridors and a voice that
 * can see the house.**
 *
 * `docs/design/rrr-task-deck.md` task 1. Every constant below is the shipped one, read from
 * `src/game/rules.js` rather than restated, so this file cannot drift from the game.
 *
 * ---------------------------------------------------------------------------------------------
 * THE TRADE THAT *IS* THE TASK
 * ---------------------------------------------------------------------------------------------
 * `player.js:633-640` sets `noise = speed / MOVE.run`. A stage-1 Hunter walks 2.05 m/s
 * (`rules.js:127`) against the runner's 5.20 top speed, so **the runner can always outrun it and
 * can never do so quietly.** That is the entire decision, and it is already in the engine.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE GUIDE HAS TWO INDEPENDENT HONEST-ERROR SOURCES, AND ONLY ONE OF THEM WAS MODELLED.
 * ---------------------------------------------------------------------------------------------
 * `coverage.js` gates the hunter mark on live cameras, which was showstopper S3. But the task
 * deck names a SECOND source that is pure geometry and was never in the model: **the blind
 * strip.** A wall of height `H` seen at elevation θ hides `H / tan θ` of floor behind it
 * (`views/game.js:2161-2168`, published live as `blindStrip` at `:2740`). At the shipped 4.80 m
 * storey and the 62° tilt floor that is **2.55 m behind every wall** — which is exactly where a
 * stationary Hunter stands.
 *
 * The two compound: a guide can be looking at a covered room and still not see it. `dark-run` D3
 * measures the combined rate, which is higher than coverage alone and therefore changes the
 * camera curve `guide-coverage` reported.
 *
 * No THREE, no DOM.
 */

import { MOVE, HUNTER_SENSE, HUNTER_SPEED } from '../game/rules.js';

/**
 * 🎚️ THE THROTTLE DETENTS — the runner's dual-use verb under D13.
 *
 * With the first-person view on the TV the runner has no private information, so the throttle is
 * their only lever: choosing RUN while the Hunter is close is loud, on camera, and completely
 * deniable as panic. `rrr-phone-ux.md` draws the noise ring around the stick so picking a speed
 * teaches `HUNTER_SENSE` without a word of tutorial.
 */
export const DETENT = [
  { name: 'STILL',  speed: 0 },
  { name: 'CREEP',  speed: 0.90 },
  { name: 'WALK',   speed: MOVE.walk },
  { name: 'RUN',    speed: MOVE.run },
];

/** `player.js:633-640`, exactly. */
export const noiseFor = (speed) => Math.min(1, speed / MOVE.run);

/**
 * How far away that is audible. Below `hearFloor` the target is inaudible however close it is —
 * `rules.js:265-267`, *"standing still is silence"*.
 */
export const audibleRange = (noise) => (noise < HUNTER_SENSE.hearFloor ? 0 : HUNTER_SENSE.hearRange * noise);

/** The fastest a robot can move and still be inaudible. Below the CREEP detent — see `SILENT_BAND`. */
export const SILENT_SPEED = HUNTER_SENSE.hearFloor * MOVE.run;

/**
 * 🚨 THE DETENTS CLOSE A REAL EXPLOIT BY CONSTRUCTION, AND THIS IS AN ARGUMENT FOR THEM BEYOND
 * ERGONOMICS.
 *
 * A CONTINUOUS stick lets a runner sit just under `hearFloor` and cross `SILENT_SPEED × 90 s`
 * of house in total silence — measured at 14.04 m, which in a generated house is a real corridor
 * and change. Silence would then be a winning strategy and Task Contract **T4** would be
 * violated: *"success should require some noise, so silence is not a strategy."*
 *
 * The detented stick has no notch in that band. STILL is silent and goes nowhere; CREEP is the
 * slowest thing that moves and is already audible at 2.42 m. **The exploit is unreachable, not
 * patched.** `dark-run` D4 asserts both halves — that the band exists on a continuous stick, and
 * that no detent lands in it.
 */
export const silentCrossing = (seconds) => SILENT_SPEED * seconds;

/**
 * The guide's sight, both sources compounded.
 *
 * @param {object} o
 * @param {boolean} o.covered        is the Hunter's room watched by a live camera?
 * @param {number}  o.wallDistance   how far the Hunter is behind the nearest wall, metres
 * @param {number}  o.tiltDeg        the guide's camera elevation
 * @param {number}  [o.storeyH]      shipped storey height
 * @returns {{seen:boolean, why:string}}
 */
export function guideSight({ covered, wallDistance, tiltDeg, storeyH = 4.80 }) {
  if (!covered) return { seen: false, why: 'no live camera on that room' };
  const strip = blindStrip(storeyH, tiltDeg);
  if (wallDistance >= 0 && wallDistance <= strip) {
    return { seen: false, why: `inside the ${strip.toFixed(2)} m blind strip at ${tiltDeg}°` };
  }
  return { seen: true, why: 'covered and in view' };
}

/** `H / tan θ`. `views/game.js:2161-2168`. */
export function blindStrip(storeyH, tiltDeg) {
  const r = (tiltDeg * Math.PI) / 180;
  const tan = Math.tan(r);
  return tan <= 0 ? Infinity : storeyH / tan;
}

/**
 * The decaying last-known ghost. Outside coverage the guide keeps a fading memory and nothing
 * more — which is what lets an honest guide say "he was in the gallery" and be wrong.
 */
export function ghost({ lastSeenAt, now, halfLife = 6 }) {
  if (lastSeenAt == null) return { confidence: 0 };
  const age = now - lastSeenAt;
  return { confidence: Math.pow(0.5, age / halfLife), age };
}

/** Can the runner outrun the Hunter at this stage? The answer must stay yes at every stage. */
export const canOutrun = (stage) => MOVE.run > HUNTER_SPEED[stage];
