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
 * 🪑 **SIT ATTACH — measured from `friendly_all38.glb` + `ornateChairGeometry`, not guessed.**
 *
 * Armature scale is 0.01, so Hips.translation is centimetres → metres. The bind mesh is
 * already 1.70 m tall, so `createMeshAvatar` does not restale the hips.
 *
 *   Chair_Sit_Idle_M mean Hips  x 0.184  y 0.528  z -0.243
 *   Rest / Alert Hips           x 0.004  y 0.720  z  0.028
 *   Chair_Sit_Idle_F mean Hips  x 0.216  y 0.510  z -0.556
 *
 * F tucks more than twice as far back as M. Alternating M/F was the live shot: one
 * twin through the cushion/splat, the other standing in front. Every seat plays Idle_M.
 *
 * Mixamo local −Z is the character's back. Player yaw faces the circle centre, so −Z
 * points at the splat. Root sits `SIT_IN` inward of the chair origin so the clip's
 * hip-back lands ON the cushion centre.
 *
 * Seat slab centre 0.46 m (box 0.048 → top 0.484). Cushion centre 0.494 m (box 0.028
 * → top 0.508). Sit hips y 0.528 sits ~20 mm above the cushion top.
 *
 * THREE-free so `harness/_sit_in_chair.mjs` and `party-warm` can assert the numbers.
 */
export const SEAT_H = 0.46;
export const SEAT_CUSHION = 0.034;
/** Cushion top = slab centre + cushion lift + half cushion thickness. */
export const SEAT_CUSHION_TOP = SEAT_H + SEAT_CUSHION + 0.014;
export const SEAT_W = 0.50;
export const SEAT_D = 0.55;
export const SEAT_BOX_H = 1.55;
/**
 * Inward of the chair origin, metres. Equals |Idle_M hips.z| so seated hips land on
 * the cushion, not 0.12 m in front (old guess) or through the splat (Idle_F).
 */
export const SIT_IN = 0.24;
/** Clip hip-back along the outward radial, metres — Idle_M |hips.z|. */
export const SIT_HIPS_BACK = 0.24;
/** Idle_M hips.y (0.528) minus cushion centre (0.494). */
export const SIT_PELVIS_ABOVE = 0.034;
/** Idle_F |hips.z| — a pose that uses this with the M attach is the sunk/through-back class. */
export const SIT_F_HIPS_BACK = 0.56;

/** Looped seated idles already inside `friendly_all38.glb`. */
export const SIT_IDLE_CLIPS = Object.freeze(['Chair_Sit_Idle_M', 'Chair_Sit_Idle_F']);
/** The shipped sit. F stays on the allow-list so a GLB check can still see it. */
export const SIT_IDLE_SHIP = 'Chair_Sit_Idle_M';
/** Sit-down transitions in the same file (and `friendly_seated20.glb`). */
export const SIT_DOWN_CLIPS = Object.freeze([
  'Stand_to_Sit_Transition_M',
  'Step_to_Sit_Transition',
  'Stand_Cheer_and_Sit_Down',
  'Stand_Clap_and_Sit_Down',
  'Stand_Wave_and_Sit_Down',
]);
export const SIT_CLIP_ALLOW = Object.freeze([...SIT_IDLE_CLIPS, ...SIT_DOWN_CLIPS]);

export function sitIdleClip(_seatIndex = 0) {
  return SIT_IDLE_SHIP;
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
  horizTol = 0.16, yLo = -0.04, yHi = 0.22, overlapMax = 0.048, driftTol = 0.14,
} = {}) {
  const notes = [];
  if (!seated) notes.push(`seat ${seatIndex}: not marked seated`);
  if (seatIndex == null || !Number.isFinite(seatIndex) || seatIndex < 0) {
    notes.push(`seat ${seatIndex}: missing seat index`);
  }
  const clipName = String(clip || '');
  if (!SIT_CLIP_ALLOW.includes(clipName)) {
    notes.push(`seat ${seatIndex}: clip "${clipName || '(none)'}" is not a seated allow-list name`);
  } else if (clipName === 'Chair_Sit_Idle_F') {
    notes.push(`seat ${seatIndex}: Chair_Sit_Idle_F tucks 0.56 m — shipped sit is Idle_M only`);
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
    if (drift > driftTol) {
      notes.push(`seat ${seatIndex}: pelvis ${drift.toFixed(3)} m from expected sit attach`);
    }
  }
  return { ok: notes.length === 0, notes };
}

/**
 * Ballroom rug diameter: rug radius is 1.40 × the live chair circle radius, so the
 * disc reads under and past the chairs rather than merely touching the ring. Thin
 * rugs do not grow doorway keep-outs (`walkHalf` caps them); this is the visual
 * span only.
 */
export const RUG_CATALOG_SPAN = 2.80;
/** Rug radius / chair-circle radius. Diameter = 2 × 1.40 × r. */
export const RUG_OVER_CHAIR = 1.40;

export function rugSpanForSeats(radius) {
  const r = Math.max(0, +radius || 0);
  return Math.max(2.4, 2 * r * RUG_OVER_CHAIR);
}

export function rugScaleForSeats(radius, catalogSpan = RUG_CATALOG_SPAN) {
  const span = Math.max(0.4, +catalogSpan || RUG_CATALOG_SPAN);
  return rugSpanForSeats(radius) / span;
}
