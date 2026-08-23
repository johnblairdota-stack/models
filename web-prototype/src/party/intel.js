/**
 * 🔎 **INTEL — who is told where the bodies are, and how badly.**
 *
 * `docs/slices/task-prime-time-lobby-warm-night.md` §3.8. John's brief, verbatim:
 *
 *   *"Good players get sporadic/vague information about hunter location. Evil can see exactly
 *   where the runner and the hunter are at the same time (so they can steer people into the
 *   hunter)."*
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE COARSENING HAPPENS HERE, ON THE SERVER, BEFORE PROJECTION. NOT ON THE PHONE.
 * ---------------------------------------------------------------------------------------------
 * The tempting shape is to ship both positions to everyone and let a good player's client round
 * them off. That is not a filter, it is a suggestion: the exact number is on the wire, in the
 * devtools network tab, one `JSON.parse` from the table. `net/party/entitle.js`'s whole discipline
 * is that a socket never RECEIVES what it may not know, and this file is what makes the good
 * player's frame honestly not contain it — there is no `at` key on a good read, at all, ever.
 *
 * ⚠️ **NO THREE, NO DOM.** `harness/party-warm.mjs` walks this in bare node, and CI runs the party
 * gates with no `npm install`.
 */

import { spaceLabel } from './mansion.js';

/** How a good player is told the hunter sits relative to the runner. Never a coordinate. */
export const GRADES = ['near', 'somewhere near', 'far from'];

/** Metres. Under `NEAR` reads as "in your pocket"; over `FAR` reads as "another wing". */
const NEAR = 9.0;
const FAR = 20.0;

/**
 * 🎲 **SPORADIC IS A NUMBER, NOT A VIBE.** One read in three is dropped outright. Below that the
 * information is useless and the feature is decoration; above it the hunter stops being scary
 * because the room always knows. It is driven by a caller-supplied roll rather than `Math.random`
 * so a gate can assert the rate over ten thousand ticks.
 */
export const DROP_RATE = 1 / 3;

/** Seconds. A good read is deliberately OLD — this is the maximum staleness the caller may hold. */
export const STALE_MAX = 12;

export function gradeFor(distance) {
  if (!Number.isFinite(distance)) return GRADES[2];
  if (distance < NEAR) return GRADES[0];
  if (distance < FAR) return GRADES[1];
  return GRADES[2];
}

function spotAt(spot) {
  return `${Number(spot.x ?? 0).toFixed(1)},${Number(spot.z ?? 0).toFixed(1)}`;
}

function dist(a, b) {
  if (!a || !b) return NaN;
  const dx = Number(a.x ?? 0) - Number(b.x ?? 0);
  const dz = Number(a.z ?? 0) - Number(b.z ?? 0);
  return Math.hypot(dx, dz);
}

/**
 * What one player is told this tick, or `null` for "told nothing".
 *
 * @param {object}  o
 * @param {string}  o.alignment  the player's own alignment. Only `'evil'` gets the exact read.
 * @param {object}  o.world      the TV's live report: `{ runner:{room,x,z}, hunter:{room,x,z} }`
 * @param {object}  o.stale      a hunter sighting up to `STALE_MAX` old: `{ room, x, z, age }`
 * @param {object}  o.cameras    `{ unlocked, needed }` — a good read is gated on a lit camera
 * @param {number}  o.roll       0..1. Below `DROP_RATE` the good read is dropped this tick.
 *
 * ⚠️ THE RETURNED OBJECT'S KEYS ARE THE `MATRIX` ROWS. Adding a field here without adding its
 * row in `net/party/entitle.js` makes it an unrowed path, which `party-isolation` I1 fails on —
 * which is the intended outcome, not an inconvenience.
 */
export function intelFor({ alignment, world, stale, cameras, roll = 1 } = {}) {
  if (!world) return null;

  /*
   * 🚨 EVIL SEES BOTH, EXACTLY, AT THE SAME TIME, AND THAT IS THE WHOLE POINT OF THE ROLE.
   * Two positions one after the other is trivia; two positions SIMULTANEOUSLY is a steering
   * instrument — it is what lets a Production player say "go left, it's clear" and be lying with
   * precision. Never gate this on cameras: the camera ladder is the GOOD team's information
   * economy, and making evil pay into it would delete the asymmetry this exists to create.
   */
  if (alignment === 'evil') {
    const out = { grade: 'exact', age: 0 };
    if (world.hunter) out.hunter = { room: world.hunter.room ?? null, at: spotAt(world.hunter) };
    if (world.runner) out.runner = { room: world.runner.room ?? null, at: spotAt(world.runner) };
    return out.hunter || out.runner ? out : null;
  }

  // ---- the good read: gated, dropped, stale, and never a coordinate -------------------------
  if (!(Number(cameras?.unlocked) > 0)) return null;
  if (roll < DROP_RATE) return null;
  const seen = stale ?? world.hunter;
  if (!seen?.room) return null;
  return {
    hunter: { room: seen.room },
    grade: gradeFor(dist(seen, world.runner)),
    age: Math.min(STALE_MAX, Math.max(0, Math.round(Number(seen.age ?? 0)))),
  };
}

/**
 * The one line a good player's phone prints. Kept next to the rule that produced it so the copy
 * cannot drift into implying more precision than the data has.
 *
 * `labels` is the night's `mansion.js` `planRoomLabels(...)` map, and it is OPTIONAL. With it,
 * a house holding two studies reads "the North Study" — the same words the guide's map draws.
 * Without it the line still names a room, just not which of the pair, which is the old behaviour
 * rather than a new failure.
 */
export function intelLine(intel, labels) {
  if (!intel) return 'No word on the hunter.';
  if (intel.grade === 'exact') {
    const h = intel.hunter ? `Hunter in ${spaceLabel(intel.hunter.room, labels)}` : 'Hunter —';
    const r = intel.runner ? `Runner in ${spaceLabel(intel.runner.room, labels)}` : 'Runner —';
    return `${h} · ${r}`;
  }
  const when = intel.age > 1 ? `, ${intel.age}s ago` : '';
  return `Something ${intel.grade} them, in ${spaceLabel(intel.hunter?.room, labels)}${when}.`;
}
