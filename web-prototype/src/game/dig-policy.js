/**
 * DIG BARRIER POLICY — cyan on the map envelope only.
 *
 * John, 2026-08-23, locked:
 *   5. All walls are destructible.
 *   6. Walls on the **edge of the map** keep the cyan barrier so players cannot leave.
 *   7. Walls **between rooms** have **no cyan** — dig through and reach any room.
 *
 * ⚠️ **THIS FILE IS THREE-FREE.** `party-warm` and the night gates cannot import `dig.js`
 * (it pulls `spaces.js` → THREE). The arithmetic that decides "is this leftover envelope?"
 * and "does this edge keep G=1?" lives here so a bare-node gate can see it.
 *
 * Live cyan is the DamageField **G channel**, not the map-designer's short-nodig colour
 * (`genspike` `L_DIG` < 1.20 m). Do not treat those as the same mark.
 */

/** G-channel fill: 1 = impassable cyan, 0 = open-through once the white is gone. */
export function barrierFillForEdge(edge) {
  return edge?.envelope ? 1 : 0;
}

export function isEnvelopeEdge(edge) {
  return !!edge?.envelope;
}

export function isOutsideId(id) {
  return !id || id === 'outside';
}

/**
 * Occupied intervals subtracted from `[lo, hi]`. A room side minus the runs it shares
 * with a neighbour is the envelope leftover — the stretch that faces the void.
 *
 * @param {number} lo
 * @param {number} hi
 * @param {number[][]} occupied  `[lo, hi]` pairs, any order, may overlap
 * @param {number} [minLen=0]
 * @returns {number[][]}
 */
export function leftoverRuns(lo, hi, occupied, minLen = 0) {
  if (!(hi > lo)) return [];
  let runs = [[lo, hi]];
  for (const pair of occupied ?? []) {
    if (!pair) continue;
    const a = Math.min(pair[0], pair[1]), b = Math.max(pair[0], pair[1]);
    const next = [];
    for (const [x0, x1] of runs) {
      const c0 = Math.max(x0, a), c1 = Math.min(x1, b);
      if (c1 <= c0 + 1e-9) { next.push([x0, x1]); continue; }
      if (c0 > x0 + 1e-9) next.push([x0, c0]);
      if (c1 < x1 - 1e-9) next.push([c1, x1]);
    }
    runs = next;
  }
  return runs.filter(([a, b]) => b - a >= minLen - 1e-9);
}
