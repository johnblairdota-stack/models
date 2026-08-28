import * as THREE from 'three';
import { Player } from './player.js';
import { chairCircle } from '../world/props.js';
import { unit4hMaterials } from '../materials/surfaces/robot.js';
import { cloneMeshAvatar } from '../characters/mesh-avatar.js';
import { INTRO_FOV, RING_OUT, TALK_FOV } from '../party/follow.js';
import { attachHeadNameTag, attachNomineeBang, setNomineeBang, setNameTagLabel } from '../characters/chest-nameplate.js';
import { LINK_INK, LINK_CHROME } from '../party/link.js';
import { buildLinkStream } from '../characters/link-stream.js';
import { captionRemoved } from '../core/caption-layer.js';
import {
  sitIdleClip, sitPhase, sitRootXZ, expectedPelvis, rugScaleForSeats, RUG_CATALOG_SPAN,
  SEATED_REACTION_CLIPS,
} from './chair-seats.js';
import { NOM_INK, NOM_CHROME } from '../characters/chest-nameplate.js';
import { SHOWRUNNER } from '../party/vote.js';
import { SWING_DUR } from './sledge.js';

/**
 * 🎬 **THE INTROS — the joined cast walking to their chairs in the ballroom, one at a time.**
 *
 * `docs/slices/task-prime-time-lobby-warm-night.md` §3.5. John, after the D13 playtest:
 *
 *   *"Player intros when the mansion is ready: each joined robot is rigged walking to their
 *   chair; camera pointed at their front; each with a different flair; showing off their colours.
 *   Always start seated in the ballroom. Chairs equally spaced based on how many players joined
 *   (not empty Robot N chairs)."*
 *
 * Every clause of that is a decision this file makes, and the last one is the one that is easy to
 * miss: the chair count is `cast.length`, never 8. `props.js` `chairCircle` defaults to eight
 * because the bible's seated circle is eight; a four-player night with eight chairs has four
 * ghosts in it, and the room reads the empty ones as players who have not joined yet.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 WHY THIS RUNS INSIDE THE FOLLOW SLOT AND NOT SOMEWHERE MORE SENSIBLE
 * ---------------------------------------------------------------------------------------------
 * The mansion only exists in one place — the iframe `views/party-host.js` mounts — and this slice
 * mounts that iframe at LOBBY precisely so the house is standing before anyone presses Start. The
 * intros are the first thing that warm house is good for. Building a second scene to hold them
 * would mean a second bake, which is the defect this whole slice exists to delete.
 *
 * It receives a `cast` over the cue channel (`src/party/follow.js` `CUE_KEYS.intros`), whose
 * closed schema is `FANOUT_KEYS.lobbySeat`'s public subset — a name and two colours. **There is no
 * role here and there cannot be one**; `harness/party-warm.mjs` W3e asserts it on every cue kind.
 */

/** How long the camera holds on one robot, before and after the cast gets big. */
const STEP_SLOW = 2.8;
const STEP_FAST = 2.2;
/** A procession, not a starting pistol: robot `i` sets off this long after robot `i-1`. */
const STAGGER = 0.55;
/** How far outside the circle a robot starts its walk. */
const ENTRY_OUT = 3.4;
/** Close enough to the chair / waypoint to stop walking and start performing. */
const ARRIVE = 0.42;
/**
 * How far in front of its chair a robot stands (toward the centre). Past the seat AABB so
 * collision does not pin them in the cushion, short of the neighbour across the ring.
 */
const STAND_IN = 0.78;
/**
 * Tangent offset of the walk-in, metres. The radial line from outside the ring to the
 * stand-mark goes THROUGH the chair; this is the lane around it. Chair half-width 0.25 +
 * body radius ~0.34 + a hand of air.
 */
const LANE = 0.92;
/**
 * 🎥 **OUTSIDE THE CIRCLE, LOOKING IN.**
 *
 * #39 sat the lens inside the ring at ~2.55 m (a 3/4 of one visor). Live playtest: still
 * too close / inside. John wants the camera FURTHER OUT — chairs readable as a ring,
 * robots smaller in frame. `RING_OUT` is metres beyond the chair radius; the eye is
 * clamped to the ballroom so a short wall cannot swallow it. Restored on `dispose`.
 */
const LOOK_Y = 1.08;
const EYE_Y = 1.92;
/**
 * 🎬 **TALK / DEBRIEF SHOTS — a cameraman walking the outside of the ring.**
 *
 * Eye stays on an outside arc (constant-ish radius = chair r + RING_OUT), lookAt the
 * circle centre, and shot-to-shot motion walks the arc at human speed — never a
 * cartesian lerp through the chairs, never a drone zoom that collapses the ring.
 */
const TALK_SHOTS = [
  { name: 'pair', dur: 8.5, span: 0.62 },
  { name: 'orbit', dur: 14.0, span: 1.45 },
  { name: 'across', dur: 11.0, span: 1.20 },
];

const TALK_CYCLE = TALK_SHOTS.reduce((s, x) => s + x.dur, 0);
/** Metres / second around the ring — a person with a camera, not a drone. */
const CAM_WALK = 1.35;

/** Extra metres past the chairs — always outside, never ringside. */
function ringOut(radius) {
  return Math.max(RING_OUT, radius * 0.85);
}

/** Keep a ringside eye inside the ballroom, just off the skirting. */
function clampInSpace(v, space, pad = 0.85) {
  if (!space) return v;
  v.x = THREE.MathUtils.clamp(v.x, space.x0 + pad, space.x1 - pad);
  v.z = THREE.MathUtils.clamp(v.z, space.z0 + pad, space.z1 - pad);
  return v;
}

/**
 * One debrief plate. Eye and look are written into the caller's vectors so the step
 * loop does not allocate. Always from OUTSIDE the ring — the chairs read as a circle.
 * Look is the circle centre; the eye walks an outside azimuth.
 */
function talkFrame(robots, clock, cx, cz, radius, space, eye, look) {
  const n = Math.max(1, robots.length);
  const wraps = Math.floor(Math.max(0, clock) / TALK_CYCLE);
  let t = Math.max(0, clock) - wraps * TALK_CYCLE;
  let idx = 0;
  for (let i = 0; i < TALK_SHOTS.length; i++) {
    if (t < TALK_SHOTS[i].dur) { idx = i; break; }
    t -= TALK_SHOTS[i].dur;
  }
  const shot = TALK_SHOTS[idx];
  const u = THREE.MathUtils.clamp(t / shot.dur, 0, 1);
  const focus = (wraps * TALK_SHOTS.length + idx) % n;
  const out = ringOut(radius);
  const r = radius + out;
  /*
   * Continuous azimuth: each shot walks `span` radians along the same outside
   * circle, then the next shot picks up. wrap * 2π/n keeps the path rotating
   * around the group instead of looping one arc forever.
   */
  let walked = wraps * 1.15;
  for (let i = 0; i < idx; i++) walked += TALK_SHOTS[i].span;
  walked += shot.span * u;
  const ang = walked + focus * ((Math.PI * 2) / n) * 0.08;
  const bob = Math.sin(clock * 0.21) * 0.07;
  eye.set(cx + Math.sin(ang) * r, EYE_Y + bob, cz + Math.cos(ang) * r);
  look.set(cx, LOOK_Y, cz);
  clampInSpace(eye, space);
  return { index: focus, shot: shot.name, ang, r };
}

/** Walk the camera along the outside arc at human speed; never lerp through the ring. */
function walkCamOnRing(camera, lookLive, eye, look, cx, cz, dt) {
  const haveX = camera.position.x - cx;
  const haveZ = camera.position.z - cz;
  const wantX = eye.x - cx;
  const wantZ = eye.z - cz;
  const rHave = Math.hypot(haveX, haveZ) || Math.hypot(wantX, wantZ) || 1;
  const rWant = Math.hypot(wantX, wantZ) || rHave;
  const aHave = Math.atan2(haveX, haveZ);
  const aWant = Math.atan2(wantX, wantZ);
  let d = aWant - aHave;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const maxAng = (CAM_WALK / Math.max(1.4, rHave)) * dt;
  const a = aHave + Math.sign(d) * Math.min(Math.abs(d), Math.max(maxAng, Math.abs(d) * (1 - Math.exp(-1.8 * dt))));
  const r = THREE.MathUtils.lerp(rHave, rWant, 1 - Math.exp(-2.4 * dt));
  const y = THREE.MathUtils.lerp(camera.position.y, eye.y, 1 - Math.exp(-2.4 * dt));
  camera.position.set(cx + Math.sin(a) * r, y, cz + Math.cos(a) * r);
  lookLive.lerp(look, 1 - Math.exp(-2.4 * dt));
}

/**
 * World AABB of one ornate chair, axis-aligned after yaw. Movement blocker; `_noSight`
 * so a ringside camera is not reeled through the seat it is filming.
 */
function chairCollider(seat) {
  const hw = (seat.boxW ?? 0.50) * 0.5;
  const hd = (seat.boxD ?? 0.55) * 0.5;
  const h = seat.boxH ?? 1.55;
  const c = Math.cos(seat.rotY || 0);
  const s = Math.sin(seat.rotY || 0);
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) {
    const x = seat.x + lx * c - lz * s;
    const z = seat.z + lx * s + lz * c;
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (z < minz) minz = z; if (z > maxz) maxz = z;
  }
  const box = new THREE.Box3(
    new THREE.Vector3(minx, seat.y ?? 0, minz),
    new THREE.Vector3(maxx, (seat.y ?? 0) + h, maxz),
  );
  box._noSight = true;
  return box;
}

/** Restale the ballroom's centre rug to the live chair ring. Shared with `views/game.js`. */
export function scaleBallroomRug(room, space, radius) {
  if (!room?.furnProps || !(radius > 0)) return false;
  const k = rugScaleForSeats(radius, RUG_CATALOG_SPAN);
  const sid = space?.id;
  let n = 0;
  for (const fp of room.furnProps) {
    if (fp.kind !== 'rug') continue;
    if (sid && fp.spaceId && fp.spaceId !== sid) continue;
    const mesh = fp.mesh || fp.root;
    if (!mesh?.scale) continue;
    mesh.scale.set(k, 1, k);
    n++;
  }
  return n > 0;
}

function parkSit(r) {
  r.body.pos.copy(r.sitAt);
  r.body.facing = r.face;
  r.body.aimYaw = r.face;
  r.body.sitLock = true;
  r.cleared = true;
  r.arrived = true;
  r.seated = true;
  r.body.avatar?.playSit?.({
    seatIndex: r.seatIndex, phase: sitPhase(r.seatIndex),
  });
}

/* ═════════════════════════════════════════════════════════════════════════════════════════════
 * 🎭 THE ACCUSATION — the circle PERFORMS a nomination instead of growing an exclamation mark.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * A red `!` over a tag is a label. It tells you a fact you could already read off the TV board,
 * it appears with no motion, and eight seated bodies keep breathing through it as if nothing had
 * happened. The Reckoning is the beat the whole night points at and it currently has no picture.
 *
 * So the accuser STANDS UP, the accused FLINCHES, two or three of the others react, and the
 * accused settles into a held posture. Roughly four seconds, on the bodies that are already on
 * air, using clips already inside the seated GLB — no new geometry, no new bake, no cut.
 *
 * **The accuser's id is what makes this possible with no wire change.** `CUE_NOM_KEYS` is
 * `['nominator', 'target']` and both halves are already public (`follow.js` — the same pair
 * `FANOUT_KEYS.nomRow` fans to every socket), so the bed can point the camera-side performance at
 * a specific chair without asking the server for anything it does not already say out loud.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 **WHY THIS IS A LITTLE STATE MACHINE AND NOT FOUR `setTimeout`s IN `setNominees`.**
 * ---------------------------------------------------------------------------------------------
 * `setNominees` IS CALLED REPEATEDLY WITH THE SAME LIST. `party-host.js` `cueNominees` keys its
 * cue on `beat|targets`, so the identical standing list is re-sent the moment Reckoning becomes
 * Vote; the `noms` fanout underneath it re-sends on every tap by anybody. This is the exact
 * problem `setPairs` below solves for the merged plate, and it is worth reading that header: a
 * repaint per fanout is a leak, and a PERFORMANCE per fanout is eight robots twitching
 * continuously for the length of the Reckoning — the single most likely way this change fails.
 *
 * The answer is the same shape as `setPairs`': **derive, never remember an event.**
 *
 *   · A nomination is identified by `nominator>target`. Staging fires when a key APPEARS, once.
 *   · A key that is still there on the next call is not new, and schedules nothing.
 *   · A key that has GONE cancels its un-fired beats and restores anyone it left posed — and
 *     "who should be posed" is recomputed from the live list every call rather than remembered,
 *     so a withdrawn nomination cannot leave a robot standing for the rest of the night.
 *   · The plate skin is likewise re-derived from the live target set on every call.
 *
 * ---------------------------------------------------------------------------------------------
 * 🪑 **THE SEAT LOCK STAYS ON, INCLUDING FOR THE ROBOT WHO STANDS UP.**
 * ---------------------------------------------------------------------------------------------
 * The tempting move is to drop `body.sitLock` so the stand transition can carry the accuser out
 * of the chair. Do not. `player.js` L451 is explicit about what that costs: without the lock
 * `Player.collide` shoves a body occupying the chair AABB back to the stand-mark EVERY FRAME —
 * *"that is why they used to idle in front of the seat"* — and `player.js` L644 pins
 * `model.position/rotation` under the lock because the standing gait offset applied to a body
 * holding a seated clip *"shoves one twin into the cushion and leaves the other crouched in front
 * of the chair"*. Both of those are John's documented bug, and both come back the moment the lock
 * is released on a robot whose root is inside a solid chair.
 *
 * **And the lock is not in the way, because the clip does the travelling.** `chair-seats.js`
 * `SEATED_CLIPS_LEAVE_CHAIR` measures `Sit_to_Stand_Transition_M` off the GLB: hips 0.531 → 0.782
 * with 0.44 m of end-to-end travel, ending 0.35 m INWARD of the seated hips. Local +Z is inward
 * (the seat faces the circle centre), so under a pinned root the accuser rises and steps out to
 * open floor between their chair and the middle of the ring — a robot on its feet in front of its
 * chair, which is exactly the picture wanted, reached without any body ever asking `room.collide`
 * a question about a chair it is standing inside. That same header calls `hold: true` on this
 * clip *"parks a standing robot in front of a chair"* as a caveat; for the accuser it is the
 * feature.
 *
 * 🔨 **EXECUTION IS THE WALK THAT COMMENT NAMED.** John, room DUSK: the first nominator of
 * the executed player gets up, walks at them, and hits them with the sledge. That is this
 * file's `setExecute`. It does the three things the paragraph above said a walk would need,
 * and only to the swinger, and only for this beat:
 *
 *   1. drop THAT body's chair collider (`chairBoxes[seat]` out of `space.colliders`)
 *   2. copy `pos` onto the stand-mark `at` (`STAND_IN`) WHILE sitLock is still on
 *   3. `playLoco()` so the seated clip is gone, THEN `sitLock = false`
 *
 * Everyone else stays on Idle_M / `SIT_IN`. The hammer is the body's existing `SledgeRig`
 * plus the clone's now-wired `mountProp` / `playAttack` — not a second rig. The Showrunner
 * sentinel has no chair; the camera holds on the accused and nobody is invented.
 *
 * If the walk has not arrived by `EXECUTE.WALK_TIMEOUT` the swinger swings from the
 * stand-mark anyway — a held blow is still a picture, a sit-and-cut is not.
 * ═════════════════════════════════════════════════════════════════════════════════════════════ */

/** Beat times, seconds from the moment a NEW nomination lands. */
export const ACCUSE = Object.freeze({
  STAND: 0.00,
  FLINCH: 0.40,
  GASP: 0.80,
  /** Reactors are staggered so the circle gasps as a ripple, not as a chorus line. */
  GASP_STAGGER: 0.22,
  SETTLE: 2.00,
  /** Cross-fade handed to `playSeated`. One beat must not snap into the next. */
  FADE: 0.25,
});

/**
 * Clip names, all of them already inside `friendly_all38.glb` and all of them on `chair-seats.js`
 * `SEATED_REACTION_CLIPS` — which is the allow-list `playSeated` enforces, and which FILTERS the
 * two-way choices below rather than being trusted blind. A clip that is not there just makes
 * `playSeated` return false and that beat is a no-op — never a throw, never a T-pose.
 *
 * The stand is the M transition, not F: `chair-seats.js` measures M ending 0.35 m inward of the
 * seated hips against F's *"roughly over the root"*, and a robot that stands up without leaving
 * the chair is a robot standing inside its own seat (see the seat-lock note above).
 */
export const ACCUSE_CLIPS = Object.freeze({
  stand: 'Sit_to_Stand_Transition_M',
  flinch: 'Sit_Dodge',
  gasp: Object.freeze(['Sit_Shout_Hands_on_Mouth', 'Sit_Hands_on_Head_Lean_Back']),
  settle: Object.freeze(['Sit_on_Chair_Arms_Crossed', 'Sitting_Answering_Questions']),
});

/** The allow-list, defensively — an empty or absent one must not delete the performance. */
export function seatedReactionAllow() {
  return Array.isArray(SEATED_REACTION_CLIPS) && SEATED_REACTION_CLIPS.length
    ? SEATED_REACTION_CLIPS
    : null;
}

/**
 * Narrow a choice list to what `playSeated` will actually accept. An allow-list that filters
 * EVERYTHING out means it has been re-scoped to a clip family this file does not know about — in
 * that case keep the original list and let `playSeated`'s boolean be the judge, rather than
 * silently deleting the whole performance and leaving the Reckoning with a bare `!` again.
 */
export function pickAllowed(options) {
  const list = Array.isArray(options) && options.length ? options : [];
  const allow = seatedReactionAllow();
  if (!allow) return list;
  const kept = list.filter((c) => allow.includes(c));
  return kept.length ? kept : list;
}

/**
 * 🚨 **WHO GASPS IS A FUNCTION OF SEAT NUMBERS AND NOTHING ELSE — THIS IS A LEAK SURFACE.**
 *
 * Anything the circle does differently for different players is something the room can farm. If
 * the two robots who react were picked from a role list, from the deal, from the vote table, or
 * from any `rng` the server seeded with a secret, then "watch who gasps" becomes a free read on
 * hidden information, delivered on the biggest screen in the house, every single Reckoning.
 *
 * So the picks are derived from the ACCUSED'S and ACCUSER'S SEAT INDICES, which are printed on
 * the name tags and visible to everybody in the room. Same two chairs accused, same two chairs
 * react, every episode, for every player, regardless of who anyone is. The stride of 3 is only
 * there so the reactors are spread around the ring instead of being the accused's neighbours;
 * the sweep after it tops up when the stride collides (seat counts divisible by 3).
 */
export function reactorSeats(seatCount, accusedSeat, nominatorSeat) {
  const n = Math.max(0, seatCount | 0);
  if (!n) return [];
  const skip = new Set();
  if (Number.isFinite(accusedSeat)) skip.add(accusedSeat | 0);
  if (Number.isFinite(nominatorSeat)) skip.add(nominatorSeat | 0);
  const want = Math.min(3, Math.max(0, n - skip.size));
  const out = [];
  const start = (Number.isFinite(accusedSeat) ? accusedSeat | 0 : 0)
    + (Number.isFinite(nominatorSeat) ? nominatorSeat | 0 : 0) + 3;
  for (let i = 0; i < n && out.length < want; i++) {
    const s = (((start + i * 3) % n) + n) % n;
    if (skip.has(s) || out.includes(s)) continue;
    out.push(s);
  }
  for (let s = 0; s < n && out.length < want; s++) {
    if (skip.has(s) || out.includes(s)) continue;
    out.push(s);
  }
  return out;
}

/**
 * The accused's held posture. **Seat index only** — same reason as `reactorSeats`, and this one
 * is the sharper edge of the two: arms-crossed vs answering-questions reads as defiant vs
 * cooperative, so if the choice tracked a role the room would be handed a tell with a MEANING
 * attached rather than merely a pattern. Seat 3 is arms-crossed whoever is sitting in it.
 */
export function settleClip(accusedSeat, options) {
  const list = pickAllowed(options || ACCUSE_CLIPS.settle);
  if (!list.length) return null;
  const i = Number.isFinite(accusedSeat) ? accusedSeat | 0 : 0;
  return list[((i % list.length) + list.length) % list.length];
}

/** Reactor clip, likewise off the reacting seat's own index. */
export function gaspClip(seatIndex, options) {
  const list = pickAllowed(options || ACCUSE_CLIPS.gasp);
  if (!list.length) return null;
  const i = Number.isFinite(seatIndex) ? seatIndex | 0 : 0;
  return list[((i % list.length) + list.length) % list.length];
}

/**
 * One nomination as DATA: `[{ at, seat, clip, hold, role }]`, sorted by time. Pure and
 * THREE-free so `harness/accusation-stage.mjs` can assert the whole running order without a
 * browser — same discipline as `chair-seats.js`.
 */
export function planAccusation({ nominatorSeat = null, accusedSeat = null, seatCount = 0 } = {}) {
  const beats = [];
  const hasNom = Number.isFinite(nominatorSeat);
  const hasAcc = Number.isFinite(accusedSeat);
  if (hasNom) {
    beats.push({
      at: ACCUSE.STAND, seat: nominatorSeat | 0, clip: ACCUSE_CLIPS.stand, hold: true, role: 'nominator',
    });
  }
  if (hasAcc) {
    beats.push({
      at: ACCUSE.FLINCH, seat: accusedSeat | 0, clip: ACCUSE_CLIPS.flinch, hold: false, role: 'accused',
    });
    const seats = reactorSeats(seatCount, accusedSeat, nominatorSeat);
    seats.forEach((s, i) => {
      const clip = gaspClip(s);
      if (!clip) return;
      beats.push({
        at: ACCUSE.GASP + i * ACCUSE.GASP_STAGGER, seat: s, clip, hold: false, role: 'reactor',
      });
    });
    const held = settleClip(accusedSeat);
    if (held) {
      beats.push({ at: ACCUSE.SETTLE, seat: accusedSeat | 0, clip: held, hold: true, role: 'accused' });
    }
  }
  beats.sort((a, b) => a.at - b.at);
  return beats;
}

/**
 * 🔨 **WHO ACTS ON EXECUTION.** Pure, THREE-free, public ids only. The RULE is already
 * `vote.js` `executioner()` — first nominator of the executed player, or `SHOWRUNNER` if
 * that nominator was taken. This is the staging plan the TV plays: walk if there is a
 * body, hold on the accused if there is not. Empty ids are off.
 */
export const EXECUTE = Object.freeze({
  /** Sit_to_Stand_Transition_M is ~6.2 s authored; fit it into this so the walk starts. */
  RISE_DUR: 1.65,
  /** Metres from the accused's sit-root to stop and swing. Inside `WEAPON_RANGE.sledge`. */
  STRIKE: 1.15,
  /** If the inner-ring walk has not arrived, swing from the stand-mark anyway. */
  WALK_TIMEOUT: 8.0,
  FACE: 0.28,
});

export function planExecute({ executionerId = '', targetId = '' } = {}) {
  const executioner = String(executionerId || '');
  const target = String(targetId || '');
  const showrunner = executioner === SHOWRUNNER;
  const actor = (!executioner || showrunner) ? null : executioner;
  return {
    actor,
    target: target || null,
    walk: !!(actor && target && actor !== target),
    showrunner,
  };
}

/** `nominator>target`, the identity of one accusation. A second accuser is a second beat. */
export function nomKey(row) {
  const target = String(row?.target ?? row ?? '');
  const nominator = row?.nominator == null ? '' : String(row.nominator);
  return `${nominator}>${target}`;
}

/** Normalize a `standing` row off the wire. Tolerates a bare id, as `setNominees` always has. */
export function nomRows(standing) {
  const out = [];
  const seen = new Set();
  for (const n of standing || []) {
    if (n == null) continue;
    const target = String((typeof n === 'object' ? n.target : n) ?? '').trim();
    if (!target) continue;
    const nominator = (typeof n === 'object' && n.nominator != null) ? String(n.nominator) : null;
    const key = nomKey({ nominator, target });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, nominator, target });
  }
  return out;
}

/**
 * 🎭 The staging machine. Pure — no THREE, no avatars, no clock of its own. The bed hands it
 * three hooks and drives it a frame at a time; the harness hands it recorders.
 *
 * @param {object} o
 * @param {(id:string)=>number|null} o.seatOf   public id -> chair index, null if not in the circle
 * @param {number} o.seatCount
 * @param {(seat:number, clip:string, hold:boolean)=>boolean} o.play  true iff the clip took
 * @param {(seat:number)=>void} o.rest          put this chair back on the plain seated idle
 * @param {(targets:Set<string>)=>void} o.mark  the live accused set, for the plate skin
 */
export function createAccusationStage({ seatOf, seatCount = 0, play, rest, mark } = {}) {
  /** key -> row. The live standing list, as of the last `set`. Never an event log. */
  const staged = new Map();
  /** seat -> { clip, key }. Only HELD poses; one-shots end on their own and need no restore. */
  const held = new Map();
  /** Un-fired beats. Each carries its key so a withdrawn nomination can cancel its own. */
  let cues = [];

  const seatFor = (id) => {
    if (id == null) return null;
    const s = seatOf?.(id);
    return Number.isFinite(s) && s >= 0 ? (s | 0) : null;
  };

  function fire(c) {
    const ok = play?.(c.seat, c.clip, c.hold) === true;
    // A hold is only remembered if it actually took. Recording a pose the body never adopted
    // would make `reapply` re-issue a clip that does not exist, forever.
    if (ok && c.hold) held.set(c.seat, { clip: c.clip, key: c.key });
  }

  return {
    /** The live standing list. Idempotent: only APPEARING keys stage. */
    set(standing) {
      const rows = nomRows(standing);
      const next = new Map(rows.map((r) => [r.key, r]));

      // ── gone: cancel un-fired beats so a withdrawal mid-stagger does not gasp anyway
      for (const key of [...staged.keys()]) {
        if (next.has(key)) continue;
        staged.delete(key);
        cues = cues.filter((c) => c.key !== key);
      }

      // ── new: schedule ONCE, on appearance
      for (const [key, row] of next) {
        if (staged.has(key)) continue;
        staged.set(key, row);
        const accusedSeat = seatFor(row.target);
        const nominatorSeat = seatFor(row.nominator);
        if (accusedSeat == null && nominatorSeat == null) continue;
        for (const b of planAccusation({ accusedSeat, nominatorSeat, seatCount })) {
          cues.push({ left: b.at, key, seat: b.seat, clip: b.clip, hold: b.hold, role: b.role });
        }
      }

      /*
       * ── restore, DERIVED. Who should be posed is recomputed from the live list; nobody's
       * history is consulted. This is `setPairs`' rule — the seat is the source of truth — and
       * it is what makes "the nomination was withdrawn" put the robot back down without any
       * withdrawal event ever being delivered.
       */
      const liveSeats = new Set();
      for (const row of staged.values()) {
        const a = seatFor(row.target); if (a != null) liveSeats.add(a);
        const b = seatFor(row.nominator); if (b != null) liveSeats.add(b);
      }
      for (const seat of [...held.keys()]) {
        if (liveSeats.has(seat)) continue;
        held.delete(seat);
        rest?.(seat);
      }

      mark?.(new Set([...staged.values()].map((r) => r.target)));
      return rows.length;
    },

    /** Drive the stagger. Returns how many beats fired this frame — the harness reads it. */
    step(dt) {
      if (!cues.length) return 0;
      const keep = [];
      const due = [];
      for (const c of cues) {
        c.left -= (dt || 0);
        if (c.left > 0) keep.push(c);
        else due.push(c);
      }
      cues = keep;
      due.sort((a, b) => a.left - b.left);
      for (const c of due) fire(c);
      return due.length;
    },

    /**
     * Re-issue the HELD poses only, with no delay and no one-shots.
     *
     * `parkSit` sweeps the whole circle back onto the seated idle from `setTalk`, `holdForRun`
     * and `releaseRun` — so a beat change while a nomination is live (Reckoning -> Vote is
     * exactly that) silently sat the accuser back down. Replaying the whole staging there would
     * re-gasp the circle on every beat, which is the twitch this file is trying to avoid, so
     * only the terminal poses come back. The bed's `play` hook skips a body already holding the
     * clip, so this is a no-op in the common case.
     */
    reapply() {
      let n = 0;
      for (const [seat, row] of held) {
        if (play?.(seat, row.clip, true) === true) n++;
      }
      return n;
    },

    /** Harness windows. */
    pending: () => cues.length,
    keys: () => [...staged.keys()],
    performing: () => [...held.entries()].map(([seat, row]) => ({ seat, clip: row.clip })),
  };
}

/**
 * 🎨 **PER-ROBOT COLOUR BY CLONING A BAKED MATERIAL, NOT BY BAKING A NEW ONE.**
 *
 * `unit4hMaterials()` bakes procedural textures on the GPU. Eight of those, on a TV, is exactly
 * the multi-second hitch this slice was written to remove — so the bake happens ONCE and each
 * robot gets `.clone()`s of the two materials that carry its identity, with `.color` set.
 *
 * three.js multiplies `map * color` in the standard material, so the cloned shell keeps every
 * panel line, scribe and chamfer `robot.js` baked into it and simply wears the player's colour.
 * A clone shares its parent's textures, so the whole set costs a handful of uniforms.
 *
 * `shell` is the helmet and body; `mint` is the signature cap, which is what `look.js`'s accent
 * means on the 2D face — so a robot's wedge colour on the phone and its cap colour on the TV are
 * the same decision, which is what makes "that one is mine" legible from a sofa.
 */
function tintedMaterials(base, shellHex, accentHex, owned) {
  const shell = base.shell?.clone?.() ?? base.shell;
  const mint = base.mint?.clone?.() ?? base.mint;
  if (shell?.color && shellHex) shell.color.set(shellHex);
  if (mint?.color && accentHex) mint.color.set(accentHex);
  // Only the two CLONES are ours to destroy later. Everything else in the returned set is a
  // reference the runner is also rendering with — see `dispose()`.
  if (shell !== base.shell) owned?.push(shell);
  if (mint !== base.mint) owned?.push(mint);
  return { ...base, shell, mint };
}

/**
 * 💃 **THE FLAIRS — five, and picked by SEAT rather than at random.**
 *
 * Seat 3 does the same thing every night, so a regular can own theirs. A random pick would make
 * the beat noisier and give nobody anything to recognise.
 *
 * Each returns the same shape `Player.update` already takes, so none of these is a new animation
 * system: they are the stick and the aim, which is all the body has ever been driven by. `phase`
 * runs 0..1 across the hold.
 */
const FLAIRS = [
  {
    name: 'wave',
    drive: (p) => ({ yaw: Math.sin(p * Math.PI * 4) * 0.50, move: 0, run: false }),
  },
  {
    name: 'spin',
    drive: (p) => ({ yaw: Math.min(1, p * 1.8) * Math.PI * 2, move: 0, run: false }),
  },
  {
    name: 'bow',
    drive: (p) => ({ yaw: 0, pitch: -0.35 * Math.sin(Math.min(1, p * 1.6) * Math.PI), move: 0, run: false }),
  },
  {
    // Two hard steps on the spot. The stick reverses so the body never actually leaves the chair.
    name: 'stomp',
    drive: (p) => ({ yaw: 0, move: Math.sin(p * Math.PI * 6) * 0.55, run: false }),
  },
  {
    // The only flair that changes the WALK as well as the pose — see `arriveRun` below.
    name: 'strut',
    drive: (p) => ({ yaw: Math.sin(p * Math.PI * 2) * 0.22, move: 0, run: false }),
    arriveRun: true,
  },
];

function areaOf(s) {
  return (s.x1 - s.x0) * (s.z1 - s.z0);
}

/**
 * 🕺 The ballroom, or the biggest room there is.
 *
 * `src/party/mansion.js` guarantees a generated party plan contains a ballroom, so the fallback is
 * for the developer who opens `?view=party.follow` against the authored house or an odd seed. It
 * falls back to AREA rather than to `spaces[0]` because the intros need floor, and the first row
 * of a generated plan is whatever the packer placed first.
 */
export function ballroomOf(room) {
  return room.spaces.find((s) => s.roomType === 'ballroom')
    ?? room.spaces.find((s) => s.id === 'ballroom')
    ?? room.spaces.slice().sort((a, b) => areaOf(b) - areaOf(a))[0]
    ?? null;
}

/**
 * Build the intro sequence. The caller owns the room and the camera; this owns everything between
 * the cue landing and `done` going true.
 *
 * @param {object} engine       an `estate()` engine — used for `scene`, `camera` and `rng`
 * @param {object} o
 * @param {object} o.room       the built mansion
 * @param {Array}  o.cast       `[{ id, seat, name, shell, accent }]` — the JOINED phones, in order
 * @param {object} [o.materials] a shared `unit4hMaterials()` set, so nothing is baked twice
 * @param {object} [o.avatar]    the runner's already-loaded Meshy body, cloned per seat
 * @param {(eye,at)=>void} [o.reelSight]  `follow-bed.js`'s sight reel — see its use below
 */
export function buildIntroBed(engine, { room, cast, materials, avatar, reelSight, talk } = {}) {
  const scene = engine.scene;
  const rng = engine.rng;
  const space = ballroomOf(room);
  const seats = (cast || []).slice(0, 8);
  const n = Math.max(1, seats.length);

  const cx = space ? (space.x0 + space.x1) / 2 : 0;
  const cz = space ? (space.z0 + space.z1) / 2 : 0;

  /*
   * ⚠️ THE RADIUS IS A FUNCTION OF THE CAST, AND IT IS CLAMPED AT BOTH ENDS.
   *
   * Two robots on an eight-robot circle are shouting at each other across a ballroom; eight on a
   * two-robot circle are inside each other. 0.62 m of circumference-ish per robot keeps the
   * spacing constant as the cast grows, which is what "equally spaced based on how many players
   * joined" actually asks for — equal ARC, not merely equal angles.
   *
   * The upper clamp is the room: a generated ballroom is 27.2 x 15.3 clear, so 5.4 m of radius
   * plus a chair still leaves a walkable metre at the short wall. It is taken from the space's own
   * SHORT axis rather than from that constant, so an odd room cannot put a chair in a wall.
   */
  const room_short = space ? Math.min(space.x1 - space.x0, space.z1 - space.z0) : 12;
  const radius = Math.max(2.4, Math.min(0.62 * n, room_short / 2 - 2.2));

  /**
   * 🪑 **THE CHAIR MATERIAL IS RESOLVED, THEN GUARANTEED, AND THE GUARANTEE IS NOT DEFENSIVE
   * PADDING — THE FIRST DRAFT CRASHED THE RENDERER OVER IT.**
   *
   * The obvious line was `room.materials?.gilt ?? room.materials?.brass ?? … ?? null`, copied from
   * `views/room-ballroom.js`, which builds its own kit. The playable mansion's bundle is
   * `floor / wall / ceiling / mould / skirt / reveal / brick / estate` — **there is no `gilt`** —
   * so the `?? null` won every time and `new THREE.InstancedMesh(geo, null, n)` went into the
   * scene. three.js then read `material.visible` on it in `projectObject` and threw once per
   * frame, in both the colour and the depth-only pass, for the entire intro sequence.
   *
   * It presented as *"Cannot read properties of null (reading 'visible')"* deep inside the
   * renderer with no mention of a chair anywhere in the stack, which is the whole reason the
   * fallback is a real material rather than a nullish chain: an absent material must be a plain
   * chair, never an absent chair and never a dead frame.
   *
   * `mould` is the gilded trim of this house's own kit, so the chairs belong to the room they are
   * in rather than to a palette this file invented.
   */
  const chairMat = room.materials?.mould ?? room.materials?.estate ?? room.materials?.wall
    ?? new THREE.MeshStandardMaterial({ color: 0x6b4a22, roughness: 0.38, metalness: 0.62 });
  const circle = chairCircle({
    count: n, radius, cx, cz, y: room.floorY ?? 0,
    material: chairMat, rng, name: 'intro-chairs',
  });
  const group = new THREE.Group();
  group.name = 'intro';
  if (circle.mesh) group.add(circle.mesh);
  scene.add(group);

  /*
   * 🧶 THE RUG MATCHES 1.40 × THE LIVE CHAIR RADIUS, not the catalog's 2.80 m toy
   * disc and not a disc that merely kisses the ring. Thin rugs do not grow doorway
   * keep-outs (`walkHalf` caps them); we only restale the already-placed centre mesh.
   */
  scaleBallroomRug(room, space, radius);

  /*
   * 🪑 CHAIRS ARE SOLID. The InstancedMesh is a picture; without these boxes `Player.collide`
   * walks straight through the seat. `_noSight` keeps a ringside camera from reeling in
   * through the chair it is filming. Dropped on `dispose`.
   */
  const chairBoxes = [];
  if (space?.colliders) {
    for (const seat of circle.seats) {
      const box = chairCollider(seat);
      space.colliders.push(box);
      chairBoxes.push(box);
    }
  }

  const base = materials ?? unit4hMaterials();
  /** Only what this file cloned. `dispose()` destroys these and nothing else — see its header. */
  const ownedMaterials = [];
  const robots = seats.map((seat, i) => {
    const chair = circle.seats[i] ?? { x: cx, z: cz, rotY: 0 };
    // Outward: from the circle's centre through the chair. The chair faces the centre.
    const ox = chair.x - cx, oz = chair.z - cz;
    const len = Math.hypot(ox, oz) || 1;
    const ux = ox / len, uz = oz / len;

    /*
     * 🤖 **MESHY WHEN WE HAVE ONE, UNIT4H WHEN WE DO NOT.** The runner's body is fetched during
     * the lobby bake (`follow-bed.js`). Cloning it here is what makes the intros the same robot
     * the expedition is about to follow, instead of the old procedural stand-in. A failed or
     * skipped fetch falls through to unit4h so a chair is never empty.
     */
    const twin = avatar ? cloneMeshAvatar(avatar, { shell: seat.shell, accent: seat.accent }) : null;
    const body = new Player({
      scene: group,
      world: room,
      rng,
      id: `intro-${seat.id ?? i}`,
      materials: tintedMaterials(base, seat.shell, seat.accent, ownedMaterials),
      avatar: twin,
    });
    // 🔢 Seat + accent for the tag's seat tab — both already on the intros cue and validated
    // there (`CUE_CAST_KEYS`), so this is the circle reading what it was handed.
    const tag = attachHeadNameTag(body, seat.name, { seat: seat.seat, accent: seat.accent });
    if (tag?.material) ownedMaterials.push(tag.material);
    const bang = attachNomineeBang(body, tag);
    if (bang?.material) ownedMaterials.push(bang.material);

    const tx = -uz, tz = ux;
    const at = new THREE.Vector3(chair.x - ux * STAND_IN, room.floorY ?? 0, chair.z - uz * STAND_IN);
    const sit = sitRootXZ(chair, cx, cz);
    const sitAt = new THREE.Vector3(sit.x, room.floorY ?? 0, sit.z);
    const face = sit.face;
    /*
     * Walk-in lane: start outside AND to the side, then a via beside the chair, then the
     * stand-mark in front. A radial walk from `ENTRY_OUT` through the chair was the clip.
     */
    const via = new THREE.Vector3(chair.x + tx * LANE + ux * 0.35, room.floorY ?? 0, chair.z + tz * LANE + uz * 0.35);
    const start = new THREE.Vector3(
      cx + ux * (radius + ENTRY_OUT) + tx * LANE,
      room.floorY ?? 0,
      cz + uz * (radius + ENTRY_OUT) + tz * LANE,
    );
    if (space) {
      start.x = THREE.MathUtils.clamp(start.x, space.x0 + 0.7, space.x1 - 0.7);
      start.z = THREE.MathUtils.clamp(start.z, space.z0 + 0.7, space.z1 - 0.7);
      via.x = THREE.MathUtils.clamp(via.x, space.x0 + 0.7, space.x1 - 0.7);
      via.z = THREE.MathUtils.clamp(via.z, space.z0 + 0.7, space.z1 - 0.7);
    }
    /*
     * Talk beats skip the walk-in: the circle is already the picture. Casting intros still
     * process in from outside so the colour-and-flair beat has a beginning.
     */
    if (talk) {
      body.pos.copy(sitAt);
      body.facing = face;
      body.aimYaw = face;
      body.sitLock = true;
      body.root.visible = true;
      body.avatar?.playSit?.({ seatIndex: i, phase: sitPhase(i) });
    } else {
      body.pos.copy(start);
      const inward = Math.atan2(via.x - start.x, via.z - start.z);
      body.facing = inward;
      body.aimYaw = inward;
      body.root.visible = false;
    }

    const out = ringOut(radius);
    const eye = new THREE.Vector3(cx + ux * (radius + out) + tx * 1.15, EYE_Y, cz + uz * (radius + out) + tz * 1.15);
    clampInSpace(eye, space);

    return {
      seat, body, chair, ux, uz, tx, tz, tag, bang,
      flair: FLAIRS[i % FLAIRS.length],
      seatIndex: i,
      /*
       * Walk target is still IN FRONT of the chair so collision does not pin them
       * in the cushion. Once arrived they sitLock and occupy `sitAt` — hips on the
       * seat, facing centre, seated clip playing.
       */
      at,
      sitAt,
      via,
      cleared: !!talk,
      seated: !!talk,
      eye,
      face,
      arrived: !!talk,
      t0: talk ? 0 : i * STAGGER,
    };
  });

  const step = n > 5 ? STEP_FAST : STEP_SLOW;
  const total = (n - 1) * STAGGER + n * step + 1.2;

  let clock = 0;
  let done = false;
  let talking = !!talk;
  let heldRunner = null;
  let focusI = -1;
  const _look = new THREE.Vector3();
  const _eye = new THREE.Vector3();
  const fov0 = engine.camera.fov;
  engine.camera.fov = talking ? TALK_FOV : INTRO_FOV;
  engine.camera.updateProjectionMatrix();
  engine.camera.position.copy(robots[0]?.eye ?? new THREE.Vector3(cx, EYE_Y, cz + radius + ringOut(radius)));
  const _lookLive = new THREE.Vector3(cx, LOOK_Y, cz);

  function steerTo(body, x, z, dt, run) {
    const dx = x - body.pos.x, dz = z - body.pos.z;
    const want = Math.atan2(dx, dz);
    const turn = Math.atan2(Math.sin(want - body.aimYaw), Math.cos(want - body.aimYaw));
    body.aimYaw += turn * (1 - Math.exp(-7.0 * dt));
    body.update(dt, tNow, { move: { x: 0, y: 1 }, run: !!run, aimYaw: body.aimYaw });
  }

  let tNow = 0;
  function driveOne(r, dt, t) {
    tNow = t;
    if (clock < r.t0) return;
    const body = r.body;
    if (heldRunner != null && String(r.seat.id) === String(heldRunner)) {
      body.root.visible = false;
      return;
    }
    body.root.visible = true;

    if (exec.phase !== 'off' && exec.swinger === r) {
      driveExecute(r, dt, t);
      return;
    }

    const goal = r.cleared ? r.at : r.via;
    const dx = goal.x - body.pos.x, dz = goal.z - body.pos.z;
    const d = Math.hypot(dx, dz);
    if (!r.cleared && d <= ARRIVE) r.cleared = true;
    if (r.cleared && !r.arrived) {
      const dAt = Math.hypot(r.at.x - body.pos.x, r.at.z - body.pos.z);
      if (dAt <= ARRIVE) r.arrived = true;
    }

    if (!r.arrived) {
      /*
       * The whole steering problem, in one line, and it is `follow-bed.js`'s line: `Player`'s
       * `move` is AIM-RELATIVE (`player.js` `_stepGround`), so putting the bearing on `aimYaw` and
       * pushing the stick forward buys collision, sliding, the doorway squeeze, the foot plant and
       * the arm swing for free. Do not animate a capsule along a spline. The via is the lane
       * AROUND the chair; `room.collide` is what makes the chair a real obstacle if they clip it.
       */
      const gx = r.cleared ? r.at.x : r.via.x;
      const gz = r.cleared ? r.at.z : r.via.z;
      steerTo(body, gx, gz, dt, r.flair.arriveRun);
      return;
    }

    // Arrived at the stand-mark: lock into the seat, play sit, stay seated.
    if (!r.seated) {
      body.sitLock = true;
      body.pos.copy(r.sitAt);
      body.facing = r.face;
      body.aimYaw = r.face;
      r.seated = true;
      body.avatar?.playSit?.({
        seatIndex: r.seatIndex, phase: sitPhase(r.seatIndex),
      });
    }
    body.sitLock = true;
    body.pos.copy(r.sitAt);
    const turn = Math.atan2(Math.sin(r.face - body.aimYaw), Math.cos(r.face - body.aimYaw));
    body.aimYaw += turn * (1 - Math.exp(-8.0 * dt));
    body.facing = r.face;
    body.update(dt, t, {
      move: { x: 0, y: 0 },
      run: false,
      aimYaw: r.face,
      aimPitch: 0,
    });
  }

  function fillTalkEye() {
    return talkFrame(robots, clock, cx, cz, radius, space, _eye, _look);
  }

  function fillIntroEye(r, hold) {
    const other = robots.find((o) => o !== r && o.body.root.visible);
    if (other) {
      _look.set(
        r.body.pos.x * 0.55 + other.body.pos.x * 0.25 + cx * 0.20,
        LOOK_Y,
        r.body.pos.z * 0.55 + other.body.pos.z * 0.25 + cz * 0.20,
      );
    } else {
      _look.set(
        r.body.pos.x * 0.65 + cx * 0.35,
        LOOK_Y,
        r.body.pos.z * 0.65 + cz * 0.35,
      );
    }
    const out = ringOut(radius);
    const sway = Math.sin(hold * 0.55) * 0.35;
    _eye.set(
      cx + r.ux * (radius + out) + r.tx * (1.05 + sway),
      EYE_Y + Math.sin(hold * 0.41) * 0.08,
      cz + r.uz * (radius + out) + r.tz * (1.05 + sway),
    );
    clampInSpace(_eye, space);
  }

  /*
   * 🔨 Execution staging. See `planExecute` / the seat-lock header: the swinger's chair
   * collider drops, they leave the sit clip at the stand-mark, then they walk the inner
   * ring. Idempotent on the same public pair — paint re-sends the cue every snapshot.
   */
  const exec = {
    key: '',
    phase: 'off',
    t: 0,
    swinger: null,
    victim: null,
    strike: null,
    walked: false,
    swung: false,
    swingAt: 0,
    victimSettled: false,
    chairDropped: false,
    showrunner: false,
  };

  function robotById(id) {
    if (!id || id === SHOWRUNNER) return null;
    return robots.find((r) => String(r.seat.id) === String(id)) || null;
  }

  function dropChair(i) {
    const box = chairBoxes[i];
    if (!box || !space?.colliders) return;
    const idx = space.colliders.indexOf(box);
    if (idx >= 0) space.colliders.splice(idx, 1);
    exec.chairDropped = true;
  }

  function restoreChair(i) {
    const box = chairBoxes[i];
    if (!box || !space?.colliders) return;
    if (!space.colliders.includes(box)) space.colliders.push(box);
    exec.chairDropped = false;
  }

  function strikeMark(swinger, victim) {
    const tx = victim.sitAt.x, tz = victim.sitAt.z;
    const sx = swinger.at.x, sz = swinger.at.z;
    const dx = tx - sx, dz = tz - sz;
    const d = Math.hypot(dx, dz) || 1;
    if (d <= EXECUTE.STRIKE + ARRIVE) return swinger.at.clone();
    const k = 1 - EXECUTE.STRIKE / d;
    return new THREE.Vector3(sx + dx * k, swinger.at.y, sz + dz * k);
  }

  function fillExecuteEye() {
    const a = exec.swinger;
    const b = exec.victim;
    const px = a ? a.body.pos.x : (b?.body.pos.x ?? cx);
    const pz = a ? a.body.pos.z : (b?.body.pos.z ?? cz);
    const qx = b ? b.body.pos.x : px;
    const qz = b ? b.body.pos.z : pz;
    _look.set((px + qx) * 0.5, LOOK_Y + 0.12, (pz + qz) * 0.5);
    const lx = _look.x - cx, lz = _look.z - cz;
    const llen = Math.hypot(lx, lz) || 1;
    const ux = lx / llen, uz = lz / llen;
    const tx = -uz, tz = ux;
    const out = ringOut(radius);
    _eye.set(
      cx + ux * (radius + out) + tx * 1.15,
      EYE_Y,
      cz + uz * (radius + out) + tz * 1.15,
    );
    clampInSpace(_eye, space);
  }

  function driveExecute(r, dt, t) {
    const body = r.body;
    if (exec.phase === 'rise') {
      body.sitLock = true;
      body.pos.copy(r.sitAt);
      body.facing = r.face;
      body.aimYaw = r.face;
      body.update(dt, t, { move: { x: 0, y: 0 }, run: false, aimYaw: r.face, aimPitch: 0 });
      return;
    }
    const faceVictim = () => {
      if (!exec.victim) return r.face;
      return Math.atan2(
        exec.victim.body.pos.x - body.pos.x,
        exec.victim.body.pos.z - body.pos.z,
      );
    };
    if (exec.phase === 'walk') {
      const gx = exec.strike?.x ?? r.at.x;
      const gz = exec.strike?.z ?? r.at.z;
      const d = Math.hypot(gx - body.pos.x, gz - body.pos.z);
      if (d <= ARRIVE) {
        exec.walked = true;
        const want = faceVictim();
        const turn = Math.atan2(Math.sin(want - body.aimYaw), Math.cos(want - body.aimYaw));
        body.aimYaw += turn * (1 - Math.exp(-8.0 * dt));
        body.facing = body.aimYaw;
        body.update(dt, t, { move: { x: 0, y: 0 }, run: false, aimYaw: body.aimYaw, aimPitch: 0 });
        return;
      }
      steerTo(body, gx, gz, dt, false);
      return;
    }
    if (exec.phase === 'swing' || exec.phase === 'hold') {
      const want = faceVictim();
      const turn = Math.atan2(Math.sin(want - body.aimYaw), Math.cos(want - body.aimYaw));
      body.aimYaw += turn * (1 - Math.exp(-8.0 * dt));
      body.facing = body.aimYaw;
      body.update(dt, t, { move: { x: 0, y: 0 }, run: false, aimYaw: body.aimYaw, aimPitch: 0 });
    }
  }

  function beginWalk() {
    const r = exec.swinger;
    if (!r) {
      exec.phase = 'hold';
      return;
    }
    r.body.pos.copy(r.at);
    r.body.sitLock = true;
    r.body.avatar?.playLoco?.();
    r.body.sitLock = false;
    r.seated = false;
    r.arrived = true;
    r.cleared = true;
    dropChair(r.seatIndex);
    if (!exec.strike) exec.strike = r.at.clone();
    exec.phase = 'walk';
  }

  function beginSwing(t) {
    exec.phase = 'swing';
    exec.swingAt = exec.t;
    exec.swung = true;
    const body = exec.swinger?.body;
    if (!body?.sledge) return;
    body.sledge.owned = true;
    body.sledge.equip();
    body.sledge.swing(t);
  }

  function stepExecute(dt, t) {
    if (exec.phase === 'off') return;
    exec.t += dt;
    if (exec.victim && exec.t >= ACCUSE.SETTLE && !exec.victimSettled) {
      exec.victimSettled = true;
      const held = settleClip(exec.victim.seatIndex);
      if (held) exec.victim.body.avatar?.playSeated?.(held, { hold: true, fade: ACCUSE.FADE });
    }
    if (exec.phase === 'rise' && exec.t >= EXECUTE.RISE_DUR) beginWalk();
    if (exec.phase === 'walk') {
      const waited = exec.t - EXECUTE.RISE_DUR;
      if (exec.walked && waited >= EXECUTE.FACE) beginSwing(t);
      else if (waited >= EXECUTE.WALK_TIMEOUT) beginSwing(t);
    }
    if (exec.phase === 'swing' && exec.t >= exec.swingAt + SWING_DUR + 0.12) {
      exec.phase = 'hold';
    }
  }

  function clearExecute() {
    if (exec.swinger) {
      exec.swinger.body.avatar?.unmountProp?.();
      exec.swinger.body.sledge?.forget?.();
      restoreChair(exec.swinger.seatIndex);
      parkSit(exec.swinger);
    }
    if (exec.victim && exec.victim !== exec.swinger) {
      setNomineeBang(exec.victim.bang, false);
      parkSit(exec.victim);
    }
    exec.key = '';
    exec.phase = 'off';
    exec.t = 0;
    exec.swinger = null;
    exec.victim = null;
    exec.strike = null;
    exec.walked = false;
    exec.swung = false;
    exec.swingAt = 0;
    exec.victimSettled = false;
    exec.showrunner = false;
  }

  /*
   * 🟢 The link stream hangs off the SCENE, not off either robot, because it is strung between
   * two of them and belongs to neither. It reads both plates' world positions every frame, so it
   * follows the tags through the sit-down, the camera sweep and any wandering, for free.
   */
  const stream = buildLinkStream(group);

  /*
   * 🏷️ **ONE PAINTER FOR THE PLATES, BECAUSE TWO CUES NOW WRITE THEM.**
   *
   * `setPairs` (the `pair` cue, on every tap) and `setNominees` (the `noms` cue, on every beat)
   * both want to skin the same sprite. Left as two independent loops the later cue simply undoes
   * the earlier one, and WHICH cue is later is a race between two fanouts — the accused's plate
   * would flicker back to plain on the next whisper. So both write their half of the state here
   * and repaint through one function with an explicit precedence.
   *
   * **The merged pair name WINS over the accusation skin, deliberately.** A merged plate is ONE
   * name over TWO robots (see `setPairs`); painting it in the accused's colours would accuse the
   * other half of the pair too, in front of the room, which is worse than a missing colour. The
   * red `!` still sits over the nominee either way, so a paired nominee is never unmarked.
   */
  /** id -> merged pair name, from the `pair` cue. */
  const pairNameById = new Map();
  /** Live accused ids, from the `noms` cue. Re-derived on every call, never accumulated. */
  let nominatedIds = new Set();
  /*
   * The accused plate skin. `chest-nameplate.js` measured it apart from both the show blue and
   * the pair green (ΔE 78 / 88), so the three states of a plate are never confusable. Frozen
   * once because `setNameTagLabel`'s idempotence key reads `skin.ink`, so a fresh object per
   * call is fine but a fresh INK would repaint every frame.
   */
  const NOM_SKIN = (NOM_INK && NOM_CHROME) ? Object.freeze({ ink: NOM_INK, chrome: NOM_CHROME }) : null;

  function repaintTags() {
    for (const r of robots) {
      const id = String(r.seat.id);
      const merged = pairNameById.get(id);
      // A merged pair has no single seat, so it gets no tab — a seat number on a shared plate
      // would name the wrong half of it half the time.
      if (merged) { setNameTagLabel(r.tag, merged, { ink: LINK_INK, chrome: LINK_CHROME }, null); continue; }
      const tab = { seat: r.seat.seat, accent: r.seat.accent };
      const skin = (NOM_SKIN && nominatedIds.has(id)) ? NOM_SKIN : null;
      setNameTagLabel(r.tag, r.seat.name, skin, tab);
    }
  }

  /*
   * 🎭 The accusation stage. See the machine's header above for why it is keyed and derived
   * rather than fired from `setNominees` directly.
   */
  const stage = createAccusationStage({
    seatCount: robots.length,
    seatOf: (id) => {
      const i = robots.findIndex((r) => String(r.seat.id) === String(id));
      return i >= 0 ? i : null;
    },
    play: (seatIndex, clip, hold) => {
      const av = robots[seatIndex]?.body?.avatar;
      // 🛡️ `playSeated` lands on the same avatar object as `playSit`, from a parallel branch.
      // Until it does — and forever on a unit4h fallback body, which has no Meshy clip set at
      // all, and on any seat whose Meshy fetch failed — this returns false and the beat is
      // skipped. That degrade is exactly today's behaviour: the red `!` and nothing else.
      if (typeof av?.playSeated !== 'function') return false;
      /*
       * Already holding this pose: `reapply` re-issues held poses after a `parkSit` sweep, and
       * restarting a clip the body is already in is a visible pop. `avatar.clip` is the getter
       * `playSit` already drives, so this costs nothing when it is honest and is merely
       * ineffective (a pop on beat change, never on a fanout) if the new pose does not set it.
       */
      if (hold && av.clip === clip) return true;
      return av.playSeated(clip, { hold: !!hold, fade: ACCUSE.FADE }) === true;
    },
    rest: (seatIndex) => {
      const r = robots[seatIndex];
      if (r) parkSit(r);
    },
    mark: (targets) => { nominatedIds = targets; repaintTags(); },
  });

  return {
    /** Which robot the camera is on, and what it is doing — for the lower-third and the drive. */
    focus() {
      const i = (talking || done)
        ? Math.min(robots.length - 1, Math.max(0, focusI < 0 ? 0 : focusI))
        : Math.min(robots.length - 1, Math.max(0, Math.floor(clock / step)));
      const r = robots[i];
      return r ? {
        index: i, name: r.seat.name ?? null, shell: r.seat.shell, accent: r.seat.accent,
        flair: r.flair.name, pos: r.body.pos, meshy: !!r.body.avatar,
      } : null;
    },
    get done() { return done; },
    get talking() { return talking; },
    chairs: circle.seats.length,
    /** True when at least one intro body is wearing a Meshy clone. */
    get meshy() { return robots.some((r) => !!r.body.avatar); },
    /** Public ids currently sitting in this circle — so a later cue can reuse it. */
    castIds: () => robots.map((r) => String(r.seat.id)),

    /**
     * Flip to the sweeping outside-ring director without tearing the chairs down.
     * Casting walk-in becomes Recap / Debrief language on the same bodies.
     */
    setTalk(on) {
      talking = !!on;
      engine.camera.fov = talking ? TALK_FOV : INTRO_FOV;
      engine.camera.updateProjectionMatrix();
      if (talking) {
        for (const r of robots) {
          if (heldRunner != null && String(r.seat.id) === String(heldRunner)) continue;
          if (exec.phase !== 'off' && exec.swinger === r) continue;
          r.body.root.visible = true;
          parkSit(r);
        }
        /*
         * ⚠️ `parkSit` above puts EVERY chair back on the seated idle, and Reckoning -> Vote is
         * a beat change with the same nominations still standing — so without this the accuser
         * silently sat back down halfway through their own accusation. Only the HELD poses come
         * back (never the one-shots), so the circle does not re-gasp on every beat.
         */
        stage.reapply();
      }
    },

    /**
     * Expedition: the runner's intro twin hides and walks the house as `follow-bed`'s Player.
     * Everyone else stays in their chair. Chairs stay in the world.
     */
    holdForRun(runnerId) {
      heldRunner = runnerId ?? null;
      for (const r of robots) {
        const mine = heldRunner != null && String(r.seat.id) === String(heldRunner);
        r.body.root.visible = !mine;
        if (!mine && !(exec.phase !== 'off' && exec.swinger === r)) parkSit(r);
      }
    },

    /** Recap / debrief: the runner is back in their chair with the others. */
    releaseRun() {
      heldRunner = null;
      for (const r of robots) {
        r.body.root.visible = true;
        if (exec.phase !== 'off' && exec.swinger === r) continue;
        parkSit(r);
      }
      // Same reason as `setTalk`: this sweep re-idles the circle, and a live accusation has to
      // survive it. Nominations are normally empty by here, in which case this does nothing.
      stage.reapply();
    },

    /**
     * 🎭 **Reckoning / Vote: the circle PERFORMS the accusation.** The accuser stands, the
     * accused flinches then settles into a held posture, two or three others react, and the
     * accused's plate takes the `NOM_INK` skin. See the machine's header above `ACCUSE` for the
     * running order, for why it is keyed rather than fired, and for why the seat lock stays on.
     *
     * The red "!" stays for now — it is a separate call whether the staging replaces it. Casting
     * must still pass empty: a leftover bang from a prior episode is a stray !, and a leftover
     * POSE is a robot standing up for the whole of the next night.
     *
     * ⚠️ **CALLED REPEATEDLY WITH THE SAME LIST — see the header.** `setNomineeBang` is already
     * a cheap flag write; `stage.set` is what has to be idempotent, and it is, by keying on
     * `nominator>target` and staging only keys that APPEAR.
     *
     * `standing` is FANOUT noms rows (`nominator`, `target`) — both public (`CUE_NOM_KEYS`), and
     * the nominator being on the wire already is the whole reason this needs no wire change.
     * Empty clears: bangs off, poses restored, plates back to their own skin.
     */
    setNominees(standing) {
      const ids = new Set((standing || []).map((n) => String(n?.target ?? n)));
      for (const r of robots) setNomineeBang(r.bang, ids.has(String(r.seat.id)));
      stage.set(standing);
    },

    /**
     * 🔨 **Execution: the nominator walks and swings.** Public ids from `lynchResult`.
     * Empty / missing clears: the swinger sits, the chair collider returns, the
     * sledge is forgotten so the next beat is not a robot with a hammer in its lap.
     *
     * ⚠️ **CALLED REPEATEDLY WITH THE SAME PAIR** — keyed, like `setNominees`.
     * `SHOWRUNNER` has no body: the accused is the picture and the camera holds.
     */
    setExecute(executionerId, targetId) {
      const eid = String(executionerId || '');
      const tid = String(targetId || '');
      const key = `${eid}>${tid}`;
      if (!eid || !tid) {
        if (exec.phase !== 'off') clearExecute();
        return planExecute({ executionerId: eid, targetId: tid });
      }
      if (key === exec.key) return planExecute({ executionerId: eid, targetId: tid });
      if (exec.phase !== 'off') clearExecute();
      const plan = planExecute({ executionerId: eid, targetId: tid });
      exec.key = key;
      exec.swinger = robotById(eid);
      exec.victim = robotById(tid);
      exec.showrunner = plan.showrunner;
      exec.phase = 'rise';
      exec.t = 0;
      exec.walked = false;
      exec.swung = false;
      exec.swingAt = 0;
      exec.victimSettled = false;
      exec.strike = (exec.swinger && exec.victim)
        ? strikeMark(exec.swinger, exec.victim)
        : (exec.swinger ? exec.swinger.at.clone() : null);
      if (exec.swinger) {
        exec.swinger.body.avatar?.playSeated?.(ACCUSE_CLIPS.stand, {
          hold: true, fade: ACCUSE.FADE, fit: EXECUTE.RISE_DUR,
        });
      }
      if (exec.victim) {
        setNomineeBang(exec.victim.bang, true);
        exec.victim.body.avatar?.playSeated?.(ACCUSE_CLIPS.flinch, {
          hold: false, fade: ACCUSE.FADE,
        });
      }
      return plan;
    },

    /**
     * 🍮 TWO ROBOTS, ONE NAME. John's design: *"their names are merged together... and the tag
     * changes colour."* Both halves of a pair wear the SAME plate — JELLIE over both heads, in
     * the pair green instead of the show blue.
     *
     * ⚠️ **IDEMPOTENT, BECAUSE THIS IS CALLED ON EVERY CUE.** `setNameTagLabel` returns early
     * when the label and skin already match, so a cue that repeats — and it repeats on every
     * links fanout, which is every tap — repaints no canvases and allocates no textures.
     *
     * ⚠️ **AND IT MUST RESTORE.** A robot that leaves a pair goes back to its own name; the
     * seat's name is the source of truth and is re-read here rather than remembered, so a name
     * changed mid-night does not come back stale.
     *
     * ⚠️ **THE ACTUAL PAINTING MOVED TO `repaintTags`.** It is no longer the only cue that skins
     * a plate — the Reckoning's accusation skin writes the same sprites — and two loops each
     * restoring "the plain plate" simply undo each other in whichever order the two fanouts
     * happen to arrive. This one now writes its half of the state and repaints through the one
     * painter, which owns the precedence.
     */
    setPairs(pairs) {
      pairNameById.clear();
      for (const p of pairs || []) {
        if (!p?.name) continue;
        pairNameById.set(String(p.a), p.name);
        pairNameById.set(String(p.b), p.name);
      }
      repaintTags();
      /*
       * 🟢 …and the data crossing the room between them. The merged plate is a change to
       * something the room has already read and stopped looking at; the stream is a new thing
       * moving in the middle of the picture, which is what actually gets noticed.
       */
      const tagOf = (id) => robots.find((r) => String(r.seat.id) === id)?.tag || null;
      stream.sync(pairs || [], tagOf);
    },

    /** Harness hook: how many streams are flying, and how lit they are. */
    streamReport: () => stream.report(),

    /**
     * Harness hook: what the accusation stage believes. `keys` is the live nominations, `pending`
     * the un-fired beats, `performing` the chairs currently holding a pose, `skinned` the plates
     * wearing the accused ink. A drive probe reads this to prove the circle is performing rather
     * than merely flagged — and that nothing is still performing once the list empties.
     */
    accusationReport: () => ({
      keys: stage.keys(),
      pending: stage.pending(),
      performing: stage.performing(),
      skinned: [...nominatedIds],
    }),

    /** Harness hook: who is walking, whether they have swung, which phase. */
    executionReport: () => ({
      phase: exec.phase,
      key: exec.key,
      walked: exec.walked,
      swung: exec.swung,
      showrunner: exec.showrunner,
      actor: exec.swinger ? String(exec.swinger.seat.id) : null,
      target: exec.victim ? String(exec.victim.seat.id) : null,
      sitLock: exec.swinger ? !!exec.swinger.body.sitLock : null,
      seated: exec.swinger ? !!exec.swinger.seated : null,
    }),

    /** Harness snapshot — logical sit flags, pelvis, clip names. */
    sitReport() {
      return robots.map((r) => {
        const pelvis = expectedPelvis(r.chair, cx, cz);
        const hips = (() => {
          let found = null;
          r.body.root?.traverse?.((o) => { if (o.isBone && o.name === 'Hips') found = o; });
          return found;
        })();
        if (hips) {
          r.body.root.updateWorldMatrix(true, true);
          hips.updateWorldMatrix(true, false);
          const w = new THREE.Vector3();
          hips.getWorldPosition(w);
          pelvis.x = w.x; pelvis.y = w.y; pelvis.z = w.z;
        } else {
          pelvis.x = r.body.pos.x;
          pelvis.z = r.body.pos.z;
        }
        return {
          id: String(r.seat.id),
          seated: !!r.seated,
          seatIndex: r.seatIndex,
          clip: r.body.avatar?.clip ?? sitIdleClip(r.seatIndex),
          pelvis,
          chair: { x: r.chair.x, y: r.chair.y ?? 0, z: r.chair.z, boxW: r.chair.boxW, boxD: r.chair.boxD, boxH: r.chair.boxH },
        };
      });
    },

    /**
     * Bodies only — no camera. The expedition chase owns the lens; the sit circle still
     * idles and billboards so a cut back to recap is not an empty void.
     */
    holdStep(dt, t) {
      clock += dt;
      // The accusation's stagger runs on the frame clock like everything else here. A
      // `setTimeout` would keep firing into a disposed bed and would drift against a hidden tab.
      stage.step(dt);
      stepExecute(dt, t);
      for (const r of robots) driveOne(r, dt, t);
      stream.step(dt, engine.camera);
    },

    step(dt, t) {
      clock += dt;
      stage.step(dt);
      stepExecute(dt, t);
      for (const r of robots) driveOne(r, dt, t);
      stream.step(dt, engine.camera);

      /*
       * 🎥 THE CAMERA STANDS OUTSIDE THE RING looking in. #39 sat inside (faces, not chair
       * backs); the playtest asked for the opposite — chairs as a readable circle, robots
       * smaller. Talk beats sweep; a live walk-in still snaps to the arriving robot.
       * Execution cranes onto the pair from the same outside arc — never a cut, never a lid.
       */
      const useTalk = talking || done;
      if (exec.phase !== 'off') {
        fillExecuteEye();
        reelSight?.(_eye, _look);
        walkCamOnRing(engine.camera, _lookLive, _eye, _look, cx, cz, dt);
        engine.camera.up.set(0, 1, 0);
        engine.camera.lookAt(_lookLive);
        engine.camera.rotateZ(Math.sin(t * 0.47) * 0.008);
        if (exec.swinger) focusI = exec.swinger.seatIndex;
        else if (exec.victim) focusI = exec.victim.seatIndex;
      } else if (useTalk) {
        const shot = fillTalkEye();
        reelSight?.(_eye, _look);
        walkCamOnRing(engine.camera, _lookLive, _eye, _look, cx, cz, dt);
        engine.camera.up.set(0, 1, 0);
        engine.camera.lookAt(_lookLive);
        engine.camera.rotateZ(Math.sin(t * 0.47) * 0.008);
        if (shot) focusI = shot.index;
      } else {
        const i = Math.min(robots.length - 1, Math.max(0, Math.floor(clock / step)));
        const r = robots[i];
        if (r) {
          const hold = Math.max(0, clock - i * step);
          fillIntroEye(r, hold);
          reelSight?.(_eye, _look);
          if (i !== focusI) {
            engine.camera.position.copy(_eye);
            _lookLive.copy(_look);
            focusI = i;
          } else {
            engine.camera.position.lerp(_eye, 1 - Math.exp(-3.4 * dt));
            _lookLive.lerp(_look, 1 - Math.exp(-3.4 * dt));
          }
          engine.camera.up.set(0, 1, 0);
          engine.camera.lookAt(_lookLive);
          engine.camera.rotateZ(Math.sin(t * 0.73) * 0.004);
        }
        if (!done && clock >= total) done = true;
      }
    },

    /**
     * 🚨 **TEARDOWN DISPOSES GEOMETRY AND THE CLONES THIS FILE MADE. IT MUST NOT CALL
     * `Player.dispose()`, AND THAT IS THE BUG THAT REACHED JOHN'S PLAYTEST.**
     *
     * `Player.dispose()` -> `unit.dispose()` -> `unit4h.js` L3670:
     *
     *     for (const m of Object.values(mats)) m.dispose?.();
     *
     * — **every material in the set it was handed.** The intro robots are handed
     * `{ ...botMats, shell: clone, mint: clone }`, so `chrome`, `face`, `brand` and `gap` in that
     * object are the SHARED originals: the ones the runner's own body, the runner's Meshy avatar
     * kit and the sledge prop are all still rendering with. Tearing down three intro robots
     * disposed the runner's materials three times, one cue before the runner appeared — so the
     * crash landed on the EXPEDITION beat with `main.js` L25's window `error` handler painting
     * `VIEW "party.follow" FAILED` over the show, on the biggest screen in the room.
     *
     * ⚠️ It did **not** reproduce on SwiftShader, which is why the first drive came back clean and
     * a playtest found it instead. Disposing a live material frees its `WebGLProgram` and whether
     * the next frame rebuilds it or throws is a driver-level detail. `harness/party-warm-drive.mjs`
     * W3f now asserts the invariant directly — no material still reachable from the scene may have
     * been disposed — rather than hoping a given GPU turns it into an exception.
     *
     * Sharing one baked material set across eight robots is still right (see `tintedMaterials`);
     * what was wrong was letting a borrower run the destructor.
     */
    dispose() {
      // Before the traversal below: the stream owns its own sprites and its own caption count,
      // and a group walk that disposed them would leave that counter high forever.
      stream.dispose();
      engine.camera.fov = fov0;
      engine.camera.updateProjectionMatrix();
      if (space?.colliders) {
        for (const box of chairBoxes) {
          const i = space.colliders.indexOf(box);
          if (i >= 0) space.colliders.splice(i, 1);
        }
      }
      chairBoxes.length = 0;
      scene.remove(group);
      group.traverse((o) => {
        if (o.userData?.sharedGeo) return;
        if (o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.isLine || o.isPoints) {
          o.geometry?.dispose?.();
        }
        if (o.name === 'headName' || o.name === 'chestName' || o.name === 'nomBang') {
          o.userData?.ownedTex?.dispose?.();
          // Balance `captionAdded()` — the pipeline skips its overlay pass at zero, and a
          // count that only ever goes up would make every later scene pay for a pass that
          // draws nothing. `chestName` is the deprecated lockup and never joined the layer.
          if (o.name !== 'chestName') captionRemoved();
        }
      });
      for (const r of robots) r.body.avatar?.dispose?.();
      for (const m of ownedMaterials) m.dispose?.();
      ownedMaterials.length = 0;
    },
  };
}
