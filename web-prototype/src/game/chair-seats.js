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

/**
 * 🪑 **SIT ATTACH — where a robot's root and pelvis belong once they occupy a chair.**
 *
 * `ornateChairGeometry` seat slab is 0.46 m; the cushion sits 0.034 m on top. The Meshy
 * `Chair_Sit_Idle_*` clips drop the hips ~0.18 m and tuck them ~0.16–0.28 m toward the
 * chair back (local −Z). The root parks a sliver inward of the chair origin so that
 * unpinned hip translation lands on the cushion rather than through the splat.
 *
 * THREE-free so `harness/_sit_in_chair.mjs` and `party-warm` can assert the numbers.
 */
export const SEAT_H = 0.46;
export const SEAT_CUSHION = 0.034;
export const SEAT_W = 0.50;
export const SEAT_D = 0.55;
export const SEAT_BOX_H = 1.55;
/** Inward of the chair origin, metres — the walk-in stand-mark stays further in (`STAND_IN`). */
export const SIT_IN = 0.12;
/** Clip hip-back along the outward radial, metres, after the 1.7 m scale. */
export const SIT_HIPS_BACK = 0.16;
/** Pelvis sits this far above the cushion plane — hips bone, not the sit-contact mesh. */
export const SIT_PELVIS_ABOVE = 0.08;

/** Looped seated idles already inside `friendly_all38.glb`. */
export const SIT_IDLE_CLIPS = Object.freeze(['Chair_Sit_Idle_M', 'Chair_Sit_Idle_F']);
/** Sit-down transitions in the same file (and `friendly_seated20.glb`). */
export const SIT_DOWN_CLIPS = Object.freeze([
  'Stand_to_Sit_Transition_M',
  'Step_to_Sit_Transition',
  'Stand_Cheer_and_Sit_Down',
  'Stand_Clap_and_Sit_Down',
  'Stand_Wave_and_Sit_Down',
]);
export const SIT_CLIP_ALLOW = Object.freeze([...SIT_IDLE_CLIPS, ...SIT_DOWN_CLIPS]);

export function sitIdleClip(seatIndex = 0) {
  return SIT_IDLE_CLIPS[(seatIndex | 0) % SIT_IDLE_CLIPS.length];
}

/** Per-seat mixer time so eight clones do not breathe in lockstep. Seconds. */
export function sitPhase(seatIndex = 0) {
  return ((seatIndex | 0) * 1.37) % 8;
}

function radial(chair, cx, cz) {
  const ox = (chair.x ?? 0) - cx, oz = (chair.z ?? 0) - cz;
  const len = Math.hypot(ox, oz) || 1;
  return { ux: ox / len, uz: oz / len, face: Math.atan2(cx - (chair.x ?? 0), cz - (chair.z ?? 0)) };
}

/** Player root XZ once seated (facing the circle centre). */
export function sitRootXZ(chair, cx, cz) {
  const { ux, uz, face } = radial(chair, cx, cz);
  return {
    x: (chair.x ?? 0) - ux * SIT_IN,
    z: (chair.z ?? 0) - uz * SIT_IN,
    y: chair.y ?? 0,
    face,
    ux, uz,
  };
}

/** Cushion top at the chair origin. */
export function seatPoint(chair) {
  return {
    x: chair.x ?? 0,
    y: (chair.y ?? 0) + SEAT_H + SEAT_CUSHION,
    z: chair.z ?? 0,
  };
}

/** Expected pelvis after the sit clip tucks hips toward the backrest. */
export function expectedPelvis(chair, cx, cz) {
  const { ux, uz } = radial(chair, cx, cz);
  const root = sitRootXZ(chair, cx, cz);
  const seat = seatPoint(chair);
  return {
    x: root.x + ux * SIT_HIPS_BACK,
    y: seat.y + SIT_PELVIS_ABOVE,
    z: root.z + uz * SIT_HIPS_BACK,
  };
}

function aabbOverlapVolume(a, b) {
  const dx = Math.min(a.maxx, b.maxx) - Math.max(a.minx, b.minx);
  const dy = Math.min(a.maxy, b.maxy) - Math.max(a.miny, b.miny);
  const dz = Math.min(a.maxz, b.maxz) - Math.max(a.minz, b.minz);
  if (dx <= 0 || dy <= 0 || dz <= 0) return 0;
  return dx * dy * dz;
}

function chairAabb(chair) {
  const hw = (chair.boxW ?? SEAT_W) * 0.5;
  const hd = (chair.boxD ?? SEAT_D) * 0.5;
  const h = chair.boxH ?? SEAT_BOX_H;
  const y0 = chair.y ?? 0;
  return {
    minx: (chair.x ?? 0) - hw, maxx: (chair.x ?? 0) + hw,
    miny: y0, maxy: y0 + h,
    minz: (chair.z ?? 0) - hd, maxz: (chair.z ?? 0) + hd,
  };
}

/**
 * CI-friendly sit pose check. Horizontal to the seat point, a sane Y band vs the
 * cushion, and a torso AABB that must not bury itself in the chair volume.
 *
 * @returns {{ok:boolean, notes:string[]}}
 */
export function assertSeatedPose({
  seated, seatIndex, pelvis, chair, clip, cx, cz,
  horizTol = 0.22, yLo = -0.06, yHi = 0.34, overlapMax = 0.048,
} = {}) {
  const notes = [];
  if (!seated) notes.push(`seat ${seatIndex}: not marked seated`);
  if (seatIndex == null || !Number.isFinite(seatIndex) || seatIndex < 0) {
    notes.push(`seat ${seatIndex}: missing seat index`);
  }
  const clipName = String(clip || '');
  if (!SIT_CLIP_ALLOW.includes(clipName)) {
    notes.push(`seat ${seatIndex}: clip "${clipName || '(none)'}" is not a seated allow-list name`);
  }
  const seat = seatPoint(chair || {});
  const expect = (cx != null && cz != null && chair)
    ? expectedPelvis(chair, cx, cz)
    : seat;
  const px = pelvis?.x, py = pelvis?.y, pz = pelvis?.z;
  if (![px, py, pz].every(Number.isFinite)) {
    notes.push(`seat ${seatIndex}: pelvis is missing`);
  } else {
    const horiz = Math.hypot(px - seat.x, pz - seat.z);
    if (horiz > horizTol) {
      notes.push(`seat ${seatIndex}: pelvis ${horiz.toFixed(3)} m from seat (max ${horizTol})`);
    }
    const dy = py - seat.y;
    if (dy < yLo || dy > yHi) {
      notes.push(`seat ${seatIndex}: pelvis Y ${py.toFixed(3)} vs cushion ${seat.y.toFixed(3)} (Δ ${dy.toFixed(3)})`);
    }
    const torso = {
      minx: px - 0.14, maxx: px + 0.14,
      miny: py - 0.06, maxy: py + 0.28,
      minz: pz - 0.14, maxz: pz + 0.14,
    };
    const vol = aabbOverlapVolume(torso, chairAabb(chair || {}));
    if (vol > overlapMax) {
      notes.push(`seat ${seatIndex}: torso/chair overlap ${vol.toFixed(4)} m³ (max ${overlapMax})`);
    }
    const drift = Math.hypot(px - expect.x, pz - expect.z);
    if (drift > 0.32) {
      notes.push(`seat ${seatIndex}: pelvis ${drift.toFixed(3)} m from expected sit attach`);
    }
  }
  return { ok: notes.length === 0, notes };
}

/**
 * Ballroom rug diameter so the disc sits just inside the live chair ring — not the
 * catalog's toy `maxSpan: 2.80`. Thin rugs do not grow doorway keep-outs (`walkHalf`
 * caps them); this is the visual span only.
 */
export const RUG_CATALOG_SPAN = 2.80;

export function rugSpanForSeats(radius) {
  const r = Math.max(0, +radius || 0);
  return Math.max(2.4, 2 * Math.max(1.2, r - 0.42));
}

export function rugScaleForSeats(radius, catalogSpan = RUG_CATALOG_SPAN) {
  const span = Math.max(0.4, +catalogSpan || RUG_CATALOG_SPAN);
  return rugSpanForSeats(radius) / span;
}
