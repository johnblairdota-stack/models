/**
 * Shared doorway / portal clearance — one helper for catalog dress and play-feel.
 *
 * Playtest 2026-08-23 (John, after PR #10): a table sat in a gallery opening. Two helpers
 * grew for that same hole — `portal-clearance.js` (PR #13, catalog refuse) and
 * `furn-clearance.js` (PR #14, authored nudge + party-warm W18). They are one AABB now.
 *
 *   · Catalog dress (`furn-layout.js`) REFUSES a slot that overlaps an opening.
 *   · Authored kit dress (`furn-dress.js` `registerGroup`) SLIDES the prop along the wall,
 *     or drops it, so a later slice inherits the rule without restating it.
 *
 * Pure (no THREE, no `spaces.js`) so `party-warm` can assert it. Accepts both authored
 * `{ x, z, w, axis }` rows and live `room.portals()` objects (`centre: { x, z }`).
 *
 * `axis` is the portal WIDTH axis (`spaces.js` / `connectors.js` `connectorAxis`):
 *   `axis === 'x'` → the wall is constant Z; the hole is a span in X
 *   `axis === 'z'` → the wall is constant X; the hole is a span in Z
 * Panels that only carry `rotY` use the same rule as `connectorAxis`.
 *
 * ⚠️ **`axis` IS THE WIDTH AXIS, NOT THE NORMAL.** Reading it the other way round produces
 * a keepout rotated ninety degrees — which still rejects placements, just never the ones
 * that matter, and would have looked like a working rule. W18 pins the orientation.
 */

/**
 * Extra metres beyond half-width so a body does not have to arrive square-on.
 *
 * The catalog helper shipped 0.45 (stage-3 hunter r=0.66 still fits a 1.90 m door).
 * W18 shipped 0.28 and proved that width catches the gallery console. The keepout is
 * the larger of the two so neither path shrinks.
 */
export const CLEARANCE_PAD = 0.45;
export const PORTAL_SIDE_PAD = CLEARANCE_PAD;

/** How far the keep-out reaches into each room, along the opening normal. */
export const CLEARANCE_DEPTH = 1.35;
export const PORTAL_DEPTH = CLEARANCE_DEPTH;

/**
 * A prop whose underside sits at or above this cannot stand in anyone's way.
 *
 * `rules.js` `PASS_H.robot` is 1.70. Chandeliers hang at `liftY: 2.85`, so without
 * this every ballroom would nudge two ceiling fittings sideways off a door they
 * float two clear metres above. W18g / W18h are the two arms.
 */
export const PORTAL_CLEAR_H = 1.90;

/** How far a nudge may travel before the prop is dropped instead. */
export const MAX_NUDGE = 2.6;

/** Keep a nudged prop this far inside its own room. */
export const ROOM_MARGIN = 0.35;

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

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

export function rectsOverlap(a, b) {
  if (!a || !b) return false;
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
}

/** Prop footprint as an AABB. `halfW` / `halfD` are metres from the centre. */
export function propFootprint(x, z, halfW, halfD) {
  return { x0: x - halfW, x1: x + halfW, z0: z - halfD, z1: z + halfD };
}

/**
 * The XZ rectangle a prop's footprint occupies, rotated the way `furn-dress.js`
 * `registerGroup` rotates its hit box: an axis-aligned box around the turned
 * footprint, not the turned box.
 */
export function footprintRect(x, z, w, d, rotY = 0) {
  const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
  const aw = num(w, 1) * c + num(d, 1) * s;
  const ad = num(w, 1) * s + num(d, 1) * c;
  return {
    x0: num(x) - aw / 2, x1: num(x) + aw / 2,
    z0: num(z) - ad / 2, z1: num(z) + ad / 2,
  };
}

/**
 * One doorway's keepout rectangle, or `null` for a portal that cannot be blocked.
 * Same AABB as `openingFootprint`, plus the wall-slide axis a nudge needs.
 */
export function portalKeepout(portal, { sidePad = PORTAL_SIDE_PAD, depth = PORTAL_DEPTH } = {}) {
  const fp = openingFootprint(portal, { pad: sidePad, depth });
  if (!fp) return null;
  return {
    id: portal.id ?? null,
    a: portal.a ?? null,
    b: portal.b ?? null,
    ...fp,
    slide: openingAxis(portal) === 'x' ? 'x' : 'z',
  };
}

export function portalKeepouts(portals = [], opts = {}) {
  return (portals || []).map((p) => portalKeepout(p, opts)).filter(Boolean);
}

/** The first keepout this footprint stands in, or `null`. */
export function blockedBy(rect, keepouts = []) {
  for (const k of keepouts) if (rectsOverlap(rect, k)) return k;
  return null;
}

/**
 * True when the prop AABB overlaps this opening's keep-out.
 * Hanging / zero-footprint props pass `halfW`/`halfD` of 0 and never hit.
 */
export function overlapsOpening(x, z, halfW, halfD, opening, opts) {
  if (!(halfW > 0) && !(halfD > 0)) return false;
  const keep = openingFootprint(opening, opts);
  if (!keep) return false;
  return rectsOverlap(propFootprint(x, z, halfW, halfD), keep);
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

/**
 * Slide a prop off a doorway, or say it cannot be placed.
 *
 * The move is ALONG THE WALL the door is cut into, not away from it. Pushing a
 * console a metre out into the room clears the keepout and leaves a table marooned
 * in the middle of a gallery; sliding it sideways leaves it against the wall it
 * was authored against.
 *
 * @returns {{x:number, z:number, moved:number}|null}  null when it cannot be placed
 */
export function nudgeClear(place, keepouts = [], bounds = null) {
  let { x, z } = { x: num(place.x), z: num(place.z) };
  const { w = 1, d = 1, rotY = 0 } = place;
  const x0 = num(place.x), z0 = num(place.z);

  for (let pass = 0; pass < 4; pass++) {
    const rect = footprintRect(x, z, w, d, rotY);
    const hit = blockedBy(rect, keepouts);
    if (!hit) return { x, z, moved: Math.hypot(x - x0, z - z0) };

    const alongX = hit.slide === 'x';
    const half = alongX ? (rect.x1 - rect.x0) / 2 : (rect.z1 - rect.z0) / 2;
    const lo = (alongX ? hit.x0 : hit.z0) - half;
    const hi = (alongX ? hit.x1 : hit.z1) + half;
    const at = alongX ? x : z;

    const options = [lo, hi]
      .map((v) => ({ v, cost: Math.abs(v - at) }))
      .filter(({ v }) => {
        if (!bounds) return true;
        const halfOther = alongX ? (rect.x1 - rect.x0) / 2 : (rect.z1 - rect.z0) / 2;
        const min = (alongX ? num(bounds.x0) : num(bounds.z0)) + halfOther + ROOM_MARGIN;
        const max = (alongX ? num(bounds.x1) : num(bounds.z1)) - halfOther - ROOM_MARGIN;
        return v >= min && v <= max;
      })
      .sort((p, q) => p.cost - q.cost);

    if (!options.length) return null;
    if (alongX) x = options[0].v; else z = options[0].v;
    if (Math.hypot(x - x0, z - z0) > MAX_NUDGE) return null;
  }
  return blockedBy(footprintRect(x, z, w, d, rotY), keepouts)
    ? null
    : { x, z, moved: Math.hypot(x - x0, z - z0) };
}

/**
 * The one call a placer makes. Returns the position to use, or `null` to skip.
 *
 * `baseY` is the prop's UNDERSIDE, so a fitting hung above head height is passed
 * straight through — see `PORTAL_CLEAR_H`.
 */
export function clearOfPortals(place, keepouts = [], bounds = null) {
  if (!keepouts?.length) return { x: num(place.x), z: num(place.z), moved: 0 };
  if (num(place.baseY, 0) >= PORTAL_CLEAR_H) return { x: num(place.x), z: num(place.z), moved: 0 };
  return nudgeClear(place, keepouts, bounds);
}
