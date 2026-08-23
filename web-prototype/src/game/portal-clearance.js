/**
 * Shared doorway / portal clearance — one helper for dress and play-feel.
 *
 * Playtest 2026-08-23 (John, after PR #10): a table sat in a gallery opening. Catalog dress
 * now refuses any `rrr_prop_*` footprint that overlaps a walkable opening.
 *
 * CloudAgent `bc-a515127a` (intro framing / stick / play-feel) had not landed a helper or a
 * branch when this file was written. **This is the one clearance system.** Do not invent a
 * second AABB for the same openings — import these functions.
 *
 * Pure (no THREE, no `spaces.js`) so `party-warm` can assert it. Accepts both authored
 * `{ x, z, w, axis }` rows and live `room.portals()` objects (`centre: { x, z }`).
 *
 * `axis` is the portal WIDTH axis (`spaces.js` / `connectors.js` `connectorAxis`):
 *   `axis === 'x'` → the wall is constant Z; the hole is a span in X
 *   `axis === 'z'` → the wall is constant X; the hole is a span in Z
 * Panels that only carry `rotY` use the same rule as `connectorAxis`.
 */

/** Extra metres beyond half-width so a stage-3 hunter (r=0.66) still fits a 1.90 m door. */
export const CLEARANCE_PAD = 0.45;

/** How far the keep-out volume reaches into each room, along the opening normal. */
export const CLEARANCE_DEPTH = 1.35;

export function openingAxis(opening) {
  if (opening?.axis === 'x' || opening?.axis === 'z') return opening.axis;
  const rotY = opening?.rotY ?? 0;
  return Math.abs(Math.cos(rotY)) > 0.5 ? 'x' : 'z';
}

export function openingCentre(opening) {
  const c = opening?.centre;
  const x = Number.isFinite(c?.x) ? c.x : opening?.x;
  const z = Number.isFinite(c?.z) ? c.z : opening?.z;
  return { x, z };
}

/**
 * Axis-aligned keep-out around an opening. Width follows the doorway; depth goes into
 * both rooms so a table just inside the room still counts as blocking the mouth.
 *
 * @returns {{ x0:number, x1:number, z0:number, z1:number } | null}
 */
export function openingFootprint(opening, {
  pad = CLEARANCE_PAD,
  depth = CLEARANCE_DEPTH,
} = {}) {
  const { x, z } = openingCentre(opening);
  const w = opening?.w ?? 1.90;
  if (!Number.isFinite(x) || !Number.isFinite(z) || !(w > 0)) return null;
  const half = w / 2 + pad;
  const axis = openingAxis(opening);
  if (axis === 'x') {
    return { x0: x - half, x1: x + half, z0: z - depth, z1: z + depth };
  }
  return { x0: x - depth, x1: x + depth, z0: z - half, z1: z + half };
}

function boxesOverlap(a, b) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
}

/** Prop footprint as an AABB. `halfW` / `halfD` are metres from the centre. */
export function propFootprint(x, z, halfW, halfD) {
  return { x0: x - halfW, x1: x + halfW, z0: z - halfD, z1: z + halfD };
}

/**
 * True when the prop AABB overlaps this opening's keep-out.
 * Hanging / zero-footprint props pass `halfW`/`halfD` of 0 and never hit.
 */
export function overlapsOpening(x, z, halfW, halfD, opening, opts) {
  if (!(halfW > 0) && !(halfD > 0)) return false;
  const keep = openingFootprint(opening, opts);
  if (!keep) return false;
  return boxesOverlap(propFootprint(x, z, halfW, halfD), keep);
}

/**
 * @returns {object | null} the first opening the prop overlaps, else null
 */
export function blockedByOpenings(x, z, halfW, halfD, openings = [], opts) {
  for (const opening of openings) {
    if (overlapsOpening(x, z, halfW, halfD, opening, opts)) return opening;
  }
  return null;
}

/**
 * Normalise live room portals / connector rows into the shape `blockedByOpenings` reads.
 * Dedupes by id. Safe on `{ portals() }`, `{ connectors: [] }`, or a raw array.
 */
export function openingsFromRoom(room) {
  const out = [];
  const seen = new Set();
  const push = (raw) => {
    if (!raw) return;
    const { x, z } = openingCentre(raw);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const id = raw.id ?? `${x.toFixed(2)},${z.toFixed(2)}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({
      id,
      a: raw.a, b: raw.b,
      axis: openingAxis(raw),
      x, z,
      w: raw.w ?? 1.90,
      h: raw.h,
    });
  };
  if (Array.isArray(room)) {
    for (const p of room) push(p);
    return out;
  }
  if (typeof room?.portals === 'function') {
    for (const p of room.portals()) push(p);
  } else if (Array.isArray(room?.portals)) {
    for (const p of room.portals) push(p);
  }
  if (Array.isArray(room?.connectors)) {
    for (const c of room.connectors) {
      // Walkable now, or an interior mouth that will be. Skip outside-only exits? No —
      // an exit keep-out stops a sideboard sealing the win wall from the inside.
      push(c);
    }
  }
  for (const s of room?.spaces ?? []) {
    for (const p of s.portals ?? []) push(p);
  }
  return out;
}
