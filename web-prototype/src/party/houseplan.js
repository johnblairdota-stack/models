/**
 * 🗺️ **THE HOUSE, AS SIX RECTANGLES — the guide's map, and nothing else's.**
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 WHY THIS IS DECLARED HERE AND NOT IMPORTED FROM `spaces.js`
 * ---------------------------------------------------------------------------------------------
 * `spaces.js` imports THREE. `coverage.js`, `session.js` and this file must run in a Cloudflare
 * worker, in bare node and on a phone with no bundler — that constraint is the whole reason the
 * party rules are testable at all. So the footprint is STATED here and **pinned to the engine by
 * `expedition-wire` E1**, which can import THREE because a gate is allowed to.
 *
 * The same trade `coverage.js` makes with `ROOMS`, for the same reason, and with the same defence:
 * a copy nobody checks is a copy that drifts, so the copy is checked.
 *
 * ⚠️ THE FOOTPRINT IS NOT A SECRET, BUT IT IS STILL `guide`-AUDIENCE. Anyone could learn the floor
 * plan by playing; what the guide is paid for is knowing where the Hunter is ON it. Sending the
 * outline to every phone would be harmless and would also put a minimap one CSS rule away from
 * the television, which `rrr-broadcast.md` §6.1 forbids in its own words. Deny-by-default means
 * the row says `guide`, so nobody has to remember.
 *
 * No THREE, no DOM.
 */

/** `spaces.js` SPACES, verbatim. Metres, world space, y-up with z running north-south. */
export const HOUSE = Object.freeze([
  { id: 'gallery',  x0: -13.6, x1: 13.6, z0: -31.0, z1: -24.3 },
  { id: 'study_w',  x0: -13.6, x1: -2.0, z0: -24.0, z1: -8.6 },
  { id: 'service',  x0: -1.7,  x1: 1.7,  z0: -24.0, z1: -8.6 },
  { id: 'study_e',  x0: 2.0,   x1: 13.6, z0: -24.0, z1: -8.6 },
  { id: 'ballroom', x0: -13.6, x1: 13.6, z0: -8.3,  z1: 7.0 },
  { id: 'chapel',   x0: 4.2,   x1: 11.0, z0: -37.8, z1: -31.3 },
]);

/** The bounding box every map is drawn inside. Derived, so it cannot disagree with `HOUSE`. */
export const EXTENT = Object.freeze({
  x0: Math.min(...HOUSE.map((r) => r.x0)), x1: Math.max(...HOUSE.map((r) => r.x1)),
  z0: Math.min(...HOUSE.map((r) => r.z0)), z1: Math.max(...HOUSE.map((r) => r.z1)),
});

export const roomAt = (x, z) =>
  HOUSE.find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)?.id ?? null;
