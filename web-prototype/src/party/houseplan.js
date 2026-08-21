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

/**
 * 🚪 **THE WAYS THROUGH — the four OPEN doorways, and only those.**
 *
 * 🚨 **ONE EXPEDITION IN SIX WAS SENT TO A ROOM NOBODY CAN ENTER.** `session.js` drew the wing
 * uniformly from `ROOMS`, which includes `chapel`, and the chapel has **zero open connectors**:
 * `spaces.js` removed D7 in full on 2026-08-08, leaving one BREACHABLE panel (`p.chapel`) and two
 * exit sites. `room.pathPortals` therefore answers `[]` into it from every space in the house, for
 * the runner and for the Hunter alike, and **the runner has no attack verb anywhere in
 * `views/expedition.js`** — no `player.attack`, no sledge, no `interact`, no ACTION button on the
 * phone. Measured: 40 of 40 chapel runs ended `held` with the robot parked about 4 m short against
 * the gallery wall, on television, for ninety seconds.
 *
 * ⚠️ **THE FIX IS A DERIVATION, NOT A DENY-LIST, AND THAT IS THE WHOLE POINT.** Writing
 * `ROOMS.filter(r => r !== 'chapel')` fixes today's house and reintroduces the bug the first time
 * `genplan.js` emits a plan with a different dead end — and `spaces.js` already builds from
 * `GEN.portals` behind `?plan=gen`. So what is stated is the CONNECTIVITY, and what the mode uses
 * is derived from it by search.
 *
 * ⚠️ AND IT IS STATED HERE RATHER THAN IMPORTED, FOR `HOUSE`'s REASON, WITH `HOUSE`'s DEFENCE.
 * `spaces.js` imports THREE and this module runs in a worker, in bare node and on a phone. So the
 * open doorways are declared and **`wing-draw` W1 pins them to the built house** — every open
 * connector `room.portals()` reports, by id and by the pair of rooms it joins, with a control that
 * would notice a door being added or taken away. A copy nobody checks is a copy that drifts; this
 * copy is checked, exactly as `expedition-wire` E1c checks the footprint.
 *
 * BREACHABLE panels are deliberately absent. A wall the runner cannot open is not a route the
 * runner has, and the Hunter's ability to make one is the Hunter's, not the wing draw's.
 */
export const DOORS = Object.freeze([
  Object.freeze({ id: 'D1', a: 'gallery', b: 'study_w' }),
  Object.freeze({ id: 'D4', a: 'study_w', b: 'ballroom' }),
  Object.freeze({ id: 'D5', a: 'service', b: 'ballroom' }),
  Object.freeze({ id: 'D6', a: 'study_e', b: 'ballroom' }),
]);

/** `spaces.js` SPAWN.player[0] falls here. The runner starts every expedition in this room. */
export const SPAWN_ROOM = 'study_w';

/**
 * Every room an unarmed robot can walk to from `start`, `start` included. Plain BFS over `doors`.
 * Pure, so the wing draw and the gate that checks it can both run it, and so a generated plan is
 * answered by search rather than by a name somebody remembered to add to a list.
 */
export function reachableFrom(start, doors = DOORS) {
  const adj = new Map();
  const link = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
  for (const d of doors) { link(d.a, d.b); link(d.b, d.a); }
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    for (const n of adj.get(queue.shift()) ?? []) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  }
  return HOUSE.map((r) => r.id).filter((id) => seen.has(id));
}

/**
 * 🎯 **THE WINGS A SHOW MAY SEND SOMEBODY TO.** `session.js` draws from this and never from
 * `ROOMS`: an announced objective the runner physically cannot reach is not a hard episode, it is
 * ninety seconds of a robot walking into plaster while the guide talks it through a route that
 * does not exist — and `resolveExpedition` then grades it as a hold the guide earned.
 */
export const WINGS = Object.freeze(reachableFrom(SPAWN_ROOM));
