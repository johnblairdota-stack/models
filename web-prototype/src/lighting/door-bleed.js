/**
 * 🚪 **THE LIGHT THAT LIVES PAST THE DOOR YOU ARE LOOKING AT.**
 *
 * Rooms in this house carry their own five-light table (`makeLightRig` / `followRig`). The
 * lights MOVE to the room you are standing in. That is why a doorway looks like a black
 * rectangle: the adjacent room is still resident (`room.setViewpoints` walks portals) but
 * every lamp left with you.
 *
 * Authored and generated tables already park `cool` past ONE door — the widest — which is
 * right when that is the opening in frame and wrong for every other door in the room. This
 * file picks the portal the camera is actually facing and puts the rim on the far side of
 * THAT one. No new light: the existing `cool` is the rim, relocated.
 *
 * ⚠️ NO THREE, NO DOM. `harness/party-warm.mjs` W23 imports this in bare node.
 */

/** Metres past the doorway line, into the other room. `genplan.js` `COOL.past` is 2.0. */
export const BLEED_PAST = 2.2;
/** Height of the rim — matches the authored cool (y 1.90). */
export const BLEED_Y = 1.90;
/**
 * How much to open the key cone when a door is in frame, radians.
 * 0.12 is ~7°. The gallery key is 0.30 and the generated clamp tops out at 0.86
 * (`genplan.js` KEY.angleHi), so this cannot turn a corridor key into a sky fill.
 */
export const BLEED_CONE = 0.12;
/** Must be looking at least this much toward the portal (dot of view dir and to-door). */
export const FACE_MIN = 0.28;
/** Ignore a door further than this; you are not seeing through it. */
export const FACE_MAX = 16;

const hypot = (x, z) => Math.hypot(x, z);

function portalXZ(p) {
  if (!p) return null;
  if (Number.isFinite(p.x) && Number.isFinite(p.z)) return { x: p.x, z: p.z };
  const c = p.centre;
  if (c && Number.isFinite(c.x) && Number.isFinite(c.z)) return { x: c.x, z: c.z };
  return null;
}

function spaceOf(spaces, id) {
  if (!spaces) return null;
  if (typeof spaces.get === 'function') return spaces.get(id) ?? null;
  if (Array.isArray(spaces)) return spaces.find((s) => s.id === id) ?? null;
  return spaces[id] ?? null;
}

/**
 * Unit vector from the doorway into the room that is NOT `fromId`.
 * Prefers the other room's centre; falls back to the portal's stored normal, flipped if needed.
 */
export function intoOther(portal, fromId, spaces) {
  const xz = portalXZ(portal);
  if (!xz) return { x: 0, z: 1 };
  const otherId = portal.a === fromId ? portal.b : portal.a;
  const other = spaceOf(spaces, otherId);
  if (other && Number.isFinite(other.x0)) {
    const mx = (other.x0 + other.x1) / 2;
    const mz = (other.z0 + other.z1) / 2;
    const dx = mx - xz.x, dz = mz - xz.z;
    const len = hypot(dx, dz);
    if (len > 1e-6) return { x: dx / len, z: dz / len };
  }
  let nx = Number(portal.nx ?? portal.normal?.x) || 0;
  let nz = Number(portal.nz ?? portal.normal?.z) || 0;
  const nlen = hypot(nx, nz);
  if (nlen < 1e-6) return { x: 0, z: 1 };
  nx /= nlen; nz /= nlen;
  const here = spaceOf(spaces, fromId);
  if (here && Number.isFinite(here.x0)) {
    const hx = (here.x0 + here.x1) / 2 - xz.x;
    const hz = (here.z0 + here.z1) / 2 - xz.z;
    if (hx * nx + hz * nz > 0) { nx = -nx; nz = -nz; }
  }
  return { x: nx, z: nz };
}

/**
 * The open portal of `spaceId` the eye is most facing, or null.
 *
 * @param {Array} portals   `{a,b,x,z}` or `{a,b,centre}`
 * @param {string} spaceId
 * @param {{x:number,z:number}} eye
 * @param {{x:number,z:number}} dir   camera forward on XZ, need not be unit
 */
export function facingPortal(portals, spaceId, eye, dir, opts = {}) {
  const maxD = opts.maxDist ?? FACE_MAX;
  const minDot = opts.minDot ?? FACE_MIN;
  const dx0 = Number(dir?.x) || 0, dz0 = Number(dir?.z) || 0;
  const dlen = hypot(dx0, dz0);
  if (!(dlen > 1e-6) || !spaceId) return null;
  const ux = dx0 / dlen, uz = dz0 / dlen;
  let best = null, bestScore = minDot;
  for (const p of portals || []) {
    if (!p || p.a === p.b) continue;
    if (p.a !== spaceId && p.b !== spaceId) continue;
    const xz = portalXZ(p);
    if (!xz) continue;
    const dx = xz.x - eye.x, dz = xz.z - eye.z;
    const dist = hypot(dx, dz);
    if (dist > maxD || dist < 0.15) continue;
    const toward = (dx * ux + dz * uz) / dist;
    if (toward < bestScore) continue;
    bestScore = toward;
    best = p;
  }
  return best;
}

/**
 * World position for the cool rim: past the portal, in the other room.
 *
 * @returns {{x:number,y:number,z:number}}
 */
export function bleedCoolPos(portal, fromId, spaces, opts = {}) {
  const xz = portalXZ(portal) ?? { x: 0, z: 0 };
  const n = intoOther(portal, fromId, spaces);
  const past = opts.past ?? BLEED_PAST;
  return {
    x: xz.x + n.x * past,
    y: opts.y ?? BLEED_Y,
    z: xz.z + n.z * past,
  };
}

/** Key cone with the door-facing widen applied, clamped so a corridor cannot become a flood. */
export function bleedKeyAngle(angle, facing) {
  const a = Number(angle);
  if (!Number.isFinite(a) || !facing) return a;
  return Math.min(a + BLEED_CONE, 0.95);
}

/**
 * Is `pos` outside `space`'s clear rect? The claim this whole file makes: the rim sits in
 * the OTHER room, not in the one whose table we just left.
 */
export function isPastSpace(pos, space) {
  if (!pos || !space || !Number.isFinite(space.x0)) return false;
  const pad = 0.05;
  return pos.x < space.x0 - pad || pos.x > space.x1 + pad
    || pos.z < space.z0 - pad || pos.z > space.z1 + pad;
}
