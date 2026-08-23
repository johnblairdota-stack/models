/**
 * 🪑 **LOCKED SEAT COUNT — joined players, never empty Robot N, never baked into the warm house.**
 *
 * `docs/slices/task-procedural-mansion-layout.md` Change 4. John, 2026-08-23: chairs equally
 * spaced in the ballroom centre, count = joined players. The mansion warms during lobby, so
 * the count is not a property of the bake.
 *
 * Party night already does this in `intro-bed.js` (`cast.length`). This file is the playable
 * path (`views/game.js` Phase A) and the gate: one function, no THREE.
 *
 * `?chairs=N` is the smash / capture instrument. It is a seating lock the developer typed,
 * not a default of eight.
 */

/** Hard cap matches the bible's seated circle and `intro-bed.js` `cast.slice(0, 8)`. */
export const SEAT_MAX = 8;

/**
 * @param {object} o
 * @param {number} [o.players=0]     joined / `run.players.size` after the seating lock
 * @param {string|number|null} [o.chairsQuery]  `?chairs=` when present
 */
export function lockedSeatCount({ players = 0, chairsQuery = null } = {}) {
  if (chairsQuery != null && chairsQuery !== '') {
    const n = Number(chairsQuery);
    if (Number.isFinite(n) && n > 0) return Math.min(SEAT_MAX, Math.max(1, n | 0));
  }
  return Math.min(SEAT_MAX, Math.max(1, players | 0));
}

/**
 * Radius so N chairs stay equally spaced on the arc and inside the room's short axis.
 * Same clamps `intro-bed.js` uses; restated so game.play does not import the intro bed.
 */
export function seatCircleRadius(count, shortAxis = 15.3) {
  const n = Math.max(1, count | 0);
  return Math.max(2.4, Math.min(0.62 * n, shortAxis / 2 - 2.2));
}
