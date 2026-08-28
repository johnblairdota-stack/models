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
 * hip-back lands ON the cushion, forward of the splat cutouts.
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
 * Inward of the chair origin, metres. Idle_M |hips.z| is 0.24, which parked the
 * back panel in the splat cutouts (John, Casting: Ellie through the two round
 * holes). Larger SIT_IN slides the root toward the circle centre — forward in
 * the seat, off the backrest — without leaving the 0.55 m cushion.
 */
export const SIT_IN = 0.34;
/** Pre-nudge attach that put the back through the splat. Harness fixture: must fail. */
export const SIT_IN_THROUGH_BACK = 0.24;
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

/**
 * 🎬 **SEATED PERFORMANCE — eleven chair clips that already shipped and were never played.**
 *
 * The Reckoning announces a nomination with a red `!` over a head. The circle reads as
 * "something is up" and never as WHAT. `friendly_all38.glb` — the body every seated twin
 * already loads — carries 38 clips, 13 of them seated performances, and `mesh-avatar.js` has
 * kept all 38 in its `byName` map since it was written while building a `clipAction` for
 * exactly one of them (`Chair_Sit_Idle_M`). So a reaction is a `mixer.clipAction()` call, not
 * an asset fetch and not a download the TV has to pay for again.
 *
 * This is an ALLOW-LIST, not a catalogue. `playSeated` refuses a name that is not on it and
 * returns false rather than throwing — same shape as `react-pad`'s closed set of four, and for
 * the same reason: the reaction a phone asks for arrives over the wire, and an unlisted clip
 * must not be able to put an untested pose on air mid-show.
 *
 * Order is the order John listed them. Duplicates would silently double a `clipAction`, so the
 * gate asserts the list is unique and disjoint from `SIT_CLIP_ALLOW` (the seat's RESTING pose
 * is a different question from what it is performing).
 */
export const SEATED_REACTION_CLIPS = Object.freeze([
  'Sit_to_Stand_Transition_M',
  'Sit_to_Stand_Transition_F',
  'Sit_Dodge',
  'Sit_on_Chair_Arms_Crossed',
  'Sit_Shout_Hands_on_Mouth',
  'Sit_Hands_on_Head_Lean_Back',
  'Sit_Finger_Wag_No',
  'Sitting_Answering_Questions',
  'Angry_To_Tantrum_Sit',
  'Sit_Cross_Legged',
  'Sitting_Clap',
]);

/** The whole gate on what may reach `mixer.clipAction`. Never throws; an unknown name is false. */
export function seatedReactionAllowed(name) {
  return SEATED_REACTION_CLIPS.includes(String(name ?? ''));
}

/**
 * ⚠️ **THREE OF THE ELEVEN DO NOT STAY IN THE CHAIR, AND ONE OF THEM IS NOT A SEATED CLIP AT
 * ALL.** Measured off the GLB, world-space, metres (`harness/seated-actions.mjs` A8):
 *
 *   Sit_to_Stand_Transition_M  hips 0.531 → 0.782, ends 0.35 m inward of the seated hips
 *   Sit_to_Stand_Transition_F  hips 0.517 → 0.709, ends standing roughly over the root
 *   Angry_To_Tantrum_Sit       hips 0.701 → 0.110 mid-clip, head 1.375 → 0.700
 *
 * The two transitions are honest stand-ups and are worth having — that is what a nominee
 * getting to their feet looks like — but they END OFF THE CUSHION, so `hold: true` parks a
 * standing robot in front of a chair and `hold: false` snaps them back into the seat with no
 * sit-down. **`Angry_To_Tantrum_Sit` starts STANDING and throws itself on the FLOOR** (0.67 m
 * of vertical hips travel); on a chair it dives through the seat. It is on the allow-list
 * because it is a real clip John listed, not because it can be played in the circle.
 */
export const SEATED_CLIPS_LEAVE_CHAIR = Object.freeze([
  'Sit_to_Stand_Transition_M',
  'Sit_to_Stand_Transition_F',
  'Angry_To_Tantrum_Sit',
]);

/**
 * Armature scale inside `friendly_all38.glb`: Hips.translation tracks are CENTIMETRES, × this
 * is metres. Restated here because the runtime hips fix-up below and the gates both measure
 * the same tracks and must agree on the unit. (`harness/_sit_in_chair.mjs` carries its own
 * copy of the same 0.01 for the sit attach.)
 */
export const ARMATURE_M = 0.01;

/**
 * ⚠️ **TEN OF THE ELEVEN ARE AUTHORED ON A DIFFERENT CHAIR.** Opening-frame Hips, metres,
 * against `Chair_Sit_Idle_M` (0.188, 0.535, −0.248):
 *
 *   Sitting_Answering_Questions  (−0.135, 0.545, −0.253)   Δz 0.005  ← the only one that agrees
 *   Sit_on_Chair_Arms_Crossed    ( 0.005, 0.523,  0.078)   Δz 0.326
 *   Sit_Finger_Wag_No            ( 0.004, 0.497,  0.091)   Δz 0.339  Δy 0.038
 *   Sitting_Clap                 ( 0.006, 0.458,  0.092)   Δz 0.340  Δy 0.077
 *   Sit_Cross_Legged             ( 0.022, 0.455,  0.095)   Δz 0.343  Δy 0.080
 *   Sit_to_Stand_Transition_M    (−0.008, 0.531, −0.607)   Δz −0.359
 *
 * Local +Z is INWARD (the seated robot faces the circle centre), so a clip whose hips sit
 * 0.09 m forward of the root puts the pelvis 0.43 m inward of the chair origin — 0.15 m past
 * the front edge of a 0.55 m cushion — while dropping it up to 8 cm INTO the seat. Played raw
 * these are the sunk / slid-off-the-front class the sit attach was tuned to kill.
 *
 * The fix is ONE CONSTANT OFFSET PER CLIP, not a per-frame pin: re-anchor the clip's opening
 * frame onto Idle_M's and every child bone follows, so the performance's own movement (the
 * lean-back, the tantrum, the stand-up) survives intact. A per-frame pin would flatten it.
 *
 * Both arguments must be in the SAME unit; the runtime passes raw track values (centimetres),
 * the gate passes metres. X is not corrected — `cloneMeshAvatar` already pins hips.x to bind
 * so both twins sit on the cushion centre line.
 */
export const SEATED_ANCHOR_TOL = 0.05;

export function seatedAnchorDelta(idleHips, clipHips) {
  const d = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? a - b : 0);
  return { x: 0, y: d(idleHips?.y, clipHips?.y), z: d(idleHips?.z, clipHips?.z) };
}

/**
 * Does a reaction close its own loop? `hold: true` has to either LOOP the clip or CLAMP its
 * last frame, and guessing wrong is visible from the sofa: a clip that ends 100° away from
 * where it started SNAPS once a cycle. Measured as the largest first-vs-last keyframe angle
 * over every rotation track in the clip, plus how far the hips travel end-to-end:
 *
 *   0.0°  Sitting_Answering_Questions   0.1°  Sitting_Clap / Sit_Shout_Hands_on_Mouth
 *   0.8°  Sit_Finger_Wag_No             1.0°  Sit_Cross_Legged      1.3°  Angry_To_Tantrum_Sit
 *   6.6°  Sit_Dodge                     9.0°  Sit_Hands_on_Head_Lean_Back      ← these loop
 *   83.8° Sit_to_Stand_Transition_M (+0.44 m)   91.4° Sit_to_Stand_Transition_F (+0.33 m)
 *   106.8° Sit_on_Chair_Arms_Crossed (RightHand)                     ← these must clamp
 *
 * The thresholds sit in the empty gap between 9.0° and 83.8°, so a re-imported clip has to
 * move a long way before it changes class silently.
 */
export const SEATED_LOOP_DEG = 12;
export const SEATED_LOOP_DRIFT = 0.03;

export function seatedClipLoops({ endQuatDeg = 0, endDrift = 0 } = {}) {
  return Math.abs(+endQuatDeg || 0) <= SEATED_LOOP_DEG
    && Math.abs(+endDrift || 0) <= SEATED_LOOP_DRIFT;
}

/**
 * Where a clip's Hips land in the room, given the seated root. The seated robot faces the
 * circle centre and Mixamo local −Z is its back, so a hips track z of −0.24 is 0.24 m OUTWARD
 * along the chair's radial — which is exactly what `SIT_HIPS_BACK` and `expectedPelvis`
 * encode for Idle_M. This is the same arithmetic for any clip, so the gate can ask
 * `assertSeatedPose` the pelvis question about a reaction instead of trusting it.
 *
 * @param {{x:number,y:number,z:number}} hips  clip-space hips, METRES
 */
export function seatedPelvisFromHips(chair, cx, cz, hips) {
  const { ux, uz } = radial(chair, cx, cz);
  const root = sitRootXZ(chair, cx, cz);
  const back = -(hips?.z ?? 0);
  return {
    x: root.x + ux * back,
    y: (chair?.y ?? 0) + (hips?.y ?? 0),
    z: root.z + uz * back,
  };
}

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
  allowReactions = false,
} = {}) {
  const notes = [];
  if (!seated) notes.push(`seat ${seatIndex}: not marked seated`);
  if (seatIndex == null || !Number.isFinite(seatIndex) || seatIndex < 0) {
    notes.push(`seat ${seatIndex}: missing seat index`);
  }
  const clipName = String(clip || '');
  /*
   * `allowReactions` defaults FALSE so every existing caller keeps asking the original
   * question — "is this seat's resting pose one of the sanctioned sit clips?" — which is what
   * catches Idle_F's 0.56 m tuck. A seat that is mid-performance is legitimately holding a
   * `SEATED_REACTION_CLIPS` name instead, and only `harness/seated-actions.mjs` opts in to
   * that. Widening the default would blunt the sunk / through-back gate it was built for.
   */
  const allowed = allowReactions
    ? [...SIT_CLIP_ALLOW, ...SEATED_REACTION_CLIPS]
    : SIT_CLIP_ALLOW;
  if (!allowed.includes(clipName)) {
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
    if (cx != null && cz != null && chair) {
      const { ux, uz } = radial(chair, cx, cz);
      const alongOut = (px - (chair.x ?? 0)) * ux + (pz - (chair.z ?? 0)) * uz;
      if (alongOut > -0.05) {
        notes.push(
          `seat ${seatIndex}: pelvis ${alongOut.toFixed(3)} m toward backrest (need 0.05 m toward centre)`,
        );
      }
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
