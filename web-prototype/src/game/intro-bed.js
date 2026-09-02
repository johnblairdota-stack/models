import * as THREE from 'three';
import { Player } from './player.js';
import { chairCircle } from '../world/props.js';
import { unit4hMaterials } from '../materials/surfaces/robot.js';
import { cloneMeshAvatar } from '../characters/mesh-avatar.js';
import { INTRO_FOV, RING_OUT, TALK_FOV, dropDeadMaps } from '../party/follow.js';
import { attachHeadNameTag, attachNomineeBang, setNomineeBang, setNameTagLabel } from '../characters/chest-nameplate.js';
import { LINK_INK, LINK_CHROME } from '../party/link.js';
import { buildLinkStream } from '../characters/link-stream.js';
import { captionRemoved } from '../core/caption-layer.js';
import {
  sitIdleClip, sitPhase, sitRootXZ, expectedPelvis, rugScaleForSeats, RUG_CATALOG_SPAN,
} from './chair-seats.js';
import { NOM_INK, NOM_CHROME } from '../characters/chest-nameplate.js';
import { SHOWRUNNER } from '../party/vote.js';
import { SWING_DUR } from './sledge.js';
import {
  ACCUSE, ACCUSE_CLIPS, EXECUTE,
  createAccusationStage, planExecute,
} from './accusation-stage.js';
import {
  PAIR, createPairLockStage,
} from './pair-lock-stage.js';
import {
  HIT_CONTACT, HIT_SLACK, SHOW_CONTACT_S,
  LAST_LOOK, contactMix, retargetHead, occupies, execCamMode,
  stepLastLook, wreckPose, chairTopple, chairEyeline, seatedAim,
  wreckCam, wreckLook, talkCycleShots, talkShotAt, WRECK_SHOT,
  isFaceScreenName,
} from './execute-hit.js';

export {
  ACCUSE, ACCUSE_CLIPS, EXECUTE,
  createAccusationStage, nomKey, nomRows, planAccusation, planExecute,
  reactorSeats, settleClip, gaspClip, pickAllowed, seatedReactionAllow,
} from './accusation-stage.js';
export {
  PAIR, PAIR_CLIPS, PAIR_LOCK_MS, pairLockMs,
  createPairLockStage, pairKey, pairRows, planPairLock,
} from './pair-lock-stage.js';

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
 * 🎬 **TALK / DEBRIEF SHOTS — a cameraman walking the OUTSIDE of the ring.**
 *
 * #39 had distinct plates that looked AT ROBOTS (pair / orbit / wide / push / across).
 * #42 kept the outside-arc walk (`walkCamOnRing`) but flattened every plate onto the empty
 * rug centre — and `radius*0.85` shoved the eye into the short wall, so after one cycle
 * the picture was the lobby dolly. Restore the five pictures; keep #42's motion rule:
 * eye stays on an outside arc, never a cartesian lerp through the chairs.
 *
 * Look-at is bodies (or a pair), never warmStep's "9m ahead off the centreline."
 */
const WIDE_Y = 2.28;
const TALK_SHOTS = [
  { name: 'pair', dur: 9.5, span: 0.55 },
  { name: 'orbit', dur: 13.0, span: 1.55 },
  { name: 'wide', dur: 11.0, span: 1.85 },
  { name: 'push', dur: 9.0, span: 0.28 },
  { name: 'across', dur: 12.0, span: 0.90 },
];

const TALK_CYCLE = TALK_SHOTS.reduce((s, x) => s + x.dur, 0);
/** Metres / second around the ring — a person with a camera, not a drone. */
const CAM_WALK = 1.35;

/**
 * Extra metres past the chairs. Desired is RING_OUT; an 8-seat ring (~5 m) plus that
 * does not fit the ballroom's short half (~7.7 m), so we shrink the standoff rather
 * than clamp the lens onto the skirting and stare at empty parquet.
 */
function ringOut(radius, space) {
  const want = RING_OUT;
  if (!space) return want;
  const short = Math.min(space.x1 - space.x0, space.z1 - space.z0) / 2;
  const maxOut = Math.max(1.15, short - 0.90 - radius);
  return Math.min(want, maxOut);
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
 * Look is robots (a pair, a body, the opposite visor), never the empty rug centre.
 */
function talkFrame(robots, clock, cx, cz, radius, space, eye, look, floorY = 0) {
  const wreckedBots = robots.filter((r) => r.wrecked);
  const livingBots = robots.filter((r) => !r.wrecked);
  const pool = livingBots.length ? livingBots : robots;
  const shots = talkCycleShots(TALK_SHOTS, wreckedBots.length > 0);
  const n = Math.max(1, pool.length);
  const cycle = shots.reduce((s, x) => s + x.dur, 0);
  const wraps = Math.floor(Math.max(0, clock) / cycle);
  const shot = talkShotAt(clock, shots);
  const shotI = Math.max(0, shots.findIndex((s) => s === shot));
  let t = Math.max(0, clock) - wraps * cycle;
  for (let i = 0; i < shotI; i++) t -= shots[i].dur;
  const u = THREE.MathUtils.clamp(t / Math.max(0.01, shot.dur), 0, 1);
  const focus = (wraps * shots.length + shotI) % n;
  const a = pool[focus];
  const b = pool[(focus + 1) % n] || a;
  const far = pool[(focus + Math.max(1, Math.floor(n / 2))) % n] || a;
  const out = ringOut(radius, space);
  const r = radius + out;
  /*
   * Continuous azimuth: each shot walks `span` radians along the same outside
   * circle, then the next shot picks up. wrap keeps the path rotating around
   * the group instead of looping one arc forever.
   */
  let walked = wraps * 1.15;
  for (let i = 0; i < shotI; i++) walked += shots[i].span;
  walked += shot.span * u;
  const ang = walked + focus * ((Math.PI * 2) / n) * 0.08;
  const bob = Math.sin(clock * 0.21) * 0.07;
  const posOf = (bot) => bot?.body?.pos || { x: cx, z: cz };
  const ax = posOf(a).x, az = posOf(a).z;
  const bx = posOf(b).x, bz = posOf(b).z;
  const fx = posOf(far).x, fz = posOf(far).z;

  if (shot.name === 'pair') {
    /* Two-shot on neighbours: eye opposite them on the outside arc so we see faces. */
    const mx = (ax + bx) * 0.5, mz = (az + bz) * 0.5;
    const pang = Math.atan2(mx - cx, mz - cz) + Math.PI;
    eye.set(cx + Math.sin(pang) * r, EYE_Y + Math.sin(u * Math.PI) * 0.06, cz + Math.cos(pang) * r);
    look.set(mx * 0.88 + cx * 0.12, 1.18, mz * 0.88 + cz * 0.12);
  } else if (shot.name === 'orbit') {
    eye.set(cx + Math.sin(ang) * r, EYE_Y + bob, cz + Math.cos(ang) * r);
    look.set(
      ax * 0.22 + bx * 0.22 + fx * 0.16 + cx * 0.40,
      1.16,
      az * 0.22 + bz * 0.22 + fz * 0.16 + cz * 0.40,
    );
  } else if (shot.name === 'wide') {
    /* Higher, and a longer walk along the outside arc — still looking at the seated ring. */
    eye.set(cx + Math.sin(ang) * r, WIDE_Y + Math.sin(clock * 0.15) * 0.05, cz + Math.cos(ang) * r);
    look.set(
      ax * 0.28 + bx * 0.24 + fx * 0.18 + cx * 0.30,
      1.12,
      az * 0.28 + bz * 0.24 + fz * 0.18 + cz * 0.30,
    );
  } else if (shot.name === 'push') {
    const pang = Math.atan2(ax - cx, az - cz);
    const pushR = THREE.MathUtils.lerp(r, radius + 1.25, u);
    eye.set(cx + Math.sin(pang) * pushR, EYE_Y - u * 0.08, cz + Math.cos(pang) * pushR);
    look.set(ax, 1.16, az);
  } else if (shot.name === WRECK_SHOT.name && wreckedBots.length) {
    /*
     * Same low look B used on the hit. After setExecute('','') the phase is off
     * and last-look C is gone — this plate is how Recap / Debrief / later
     * Casting / Reunion still find the floor body and the toppled chair.
     */
    const w = wreckedBots[wraps % wreckedBots.length];
    const cam = wreckLook({
      sitAt: w.sitAt, seat: w.chair, face: w.face, cx, cz, floorY,
    });
    eye.set(cam.eye.x, cam.eye.y, cam.eye.z);
    look.set(cam.look.x, cam.look.y, cam.look.z);
    clampInSpace(eye, space);
    return { index: robots.indexOf(w), shot: shot.name, ang, r };
  } else {
    /* Across: look at the robot opposite. Their face, because they look inward. */
    const pang = Math.atan2(ax - cx, az - cz);
    eye.set(cx + Math.sin(pang) * r, EYE_Y + bob * 0.4, cz + Math.cos(pang) * r);
    look.set(fx * 0.78 + ax * 0.22, 1.18, fz * 0.78 + az * 0.22);
  }
  clampInSpace(eye, space);
  return { index: robots.indexOf(a), shot: shot.name, ang, r };
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
  // Dead stay wreckage. Episode-2 casting used to sit Ada back in chair 7.
  if (r.wrecked) return;
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

/* Accusation / execution planning lives in accusation-stage.js so gates:party can
 * import the machine without THREE. The bed still owns the picture. */

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
export function buildIntroBed(engine, { room, cast, materials, avatar, reelSight, talk, wrecked } = {}) {
  const wreckWant = new Set((wrecked || []).map((id) => String(id)).filter(Boolean));
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
    const deadAtSpawn = wreckWant.has(String(seat.id));
    if (talk && !deadAtSpawn) {
      body.pos.copy(sitAt);
      body.facing = face;
      body.aimYaw = face;
      body.sitLock = true;
      body.root.visible = true;
      body.avatar?.playSit?.({ seatIndex: i, phase: sitPhase(i) });
    } else if (deadAtSpawn) {
      body.pos.copy(sitAt);
      body.facing = face;
      body.aimYaw = face;
      body.sitLock = true;
      body.root.visible = true;
    } else {
      body.pos.copy(start);
      const inward = Math.atan2(via.x - start.x, via.z - start.z);
      body.facing = inward;
      body.aimYaw = inward;
      body.root.visible = false;
    }

    const out = ringOut(radius, space);
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
      cleared: !!(talk && !deadAtSpawn),
      seated: !!(talk && !deadAtSpawn),
      eye,
      face,
      arrived: !!(talk && !deadAtSpawn),
      t0: (talk || deadAtSpawn) ? 0 : i * STAGGER,
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
  engine.camera.position.copy(robots[0]?.eye ?? new THREE.Vector3(cx, EYE_Y, cz + radius + ringOut(radius, space)));
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

    if (r.wrecked) {
      stepWreck(r, dt, t);
      return;
    }

    if (exec.phase !== 'off' && exec.swinger === r) {
      driveExecute(r, dt, t);
      if (exec.phase === 'swing' || exec.phase === 'hold') {
        retargetSledge();
        const sledge = r.body.sledge;
        const clockPhase = (exec.t - exec.swingAt) / Math.max(0.01, SWING_DUR);
        const phase = (sledge?.phase ?? 0) > 0 ? sledge.phase : clockPhase;
        const contact = sledge?.contactPhase ?? HIT_CONTACT;
        if (!exec.hit && phase >= contact) beginHit(t);
      }
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
    return talkFrame(robots, clock, cx, cz, radius, space, _eye, _look, room.floorY ?? 0);
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
    const out = ringOut(radius, space);
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
    chairDropped: false,
    showrunner: false,
    hit: false,
    hitAt: 0,
    lastLook: LAST_LOOK.OFF,
    looseChairs: [],
    sledgeLocal: null,
    smashed: false,
  };
  const _headW = new THREE.Vector3();
  const _aimW = new THREE.Vector3();
  const _deltaW = new THREE.Vector3();
  const _tmpW = new THREE.Vector3();
  const _hideM = new THREE.Matrix4();
  const _seatM = new THREE.Matrix4();

  function robotById(id) {
    if (!id || id === SHOWRUNNER) return null;
    return robots.find((r) => String(r.seat.id) === String(id)) || null;
  }

  function dropChair(i) {
    dropCollider(i);
    exec.chairDropped = true;
  }

  function restoreChair(i) {
    restoreCollider(i);
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
    const out = ringOut(radius, space);
    _eye.set(
      cx + ux * (radius + out) + tx * 1.15,
      EYE_Y,
      cz + uz * (radius + out) + tz * 1.15,
    );
    clampInSpace(_eye, space);
  }

  /**
   * B — one unbroken ride: crane off the talk arc, walk-up inside the ring,
   * time-dip + whip a few degrees off impact, settle wide-low on limp body
   * one way and loose chair the other. A (Showrunner) stays on fillExecuteEye.
   */
  function fillExecuteB() {
    const a = exec.swinger;
    const b = exec.victim;
    const floorY = room.floorY ?? 0;
    if (exec.hit && b) {
      const chair = exec.looseChairs.find((c) => c.index === b.seatIndex)?.mesh
        || exec.looseChairs[exec.looseChairs.length - 1]?.mesh;
      const cam = wreckCam({
        body: { x: b.body.pos.x, z: b.body.pos.z },
        chair: {
          x: chair ? chair.position.x : (b.chair?.x ?? b.body.pos.x),
          z: chair ? chair.position.z : (b.chair?.z ?? b.body.pos.z),
        },
        cx, cz, floorY,
      });
      _look.set(cam.look.x, cam.look.y, cam.look.z);
      _eye.set(cam.eye.x, cam.eye.y, cam.eye.z);
      clampInSpace(_eye, space);
      return;
    }
    if ((exec.phase === 'swing' || exec.phase === 'hold') && a && b) {
      const px = a.body.pos.x, pz = a.body.pos.z;
      const qx = b.body.pos.x, qz = b.body.pos.z;
      _look.set((px + qx) * 0.5, 1.05, (pz + qz) * 0.5);
      const dx = qx - px, dz = qz - pz;
      const d = Math.hypot(dx, dz) || 1;
      const fx = dx / d, fz = dz / d;
      const tx = -fz, tz = fx;
      const swingU = Math.min(1, Math.max(0, (exec.t - exec.swingAt) / Math.max(0.12, SWING_DUR)));
      const dip = 0.55 * (1 - swingU);
      const whip = exec.hit ? 0.22 : 0.08;
      _eye.set(
        (px + qx) * 0.5 + tx * 2.05 + fx * whip,
        0.92 + dip,
        (pz + qz) * 0.5 + tz * 2.05 + fz * whip,
      );
      clampInSpace(_eye, space);
      return;
    }
    if (a && b) {
      const px = a.body.pos.x, pz = a.body.pos.z;
      const qx = b.body.pos.x, qz = b.body.pos.z;
      _look.set((px + qx) * 0.5, LOOK_Y - 0.15, (pz + qz) * 0.5);
      const dx = qx - px, dz = qz - pz;
      const d = Math.hypot(dx, dz) || 1;
      const fx = dx / d, fz = dz / d;
      const tx = -fz, tz = fx;
      _eye.set(
        (px + qx) * 0.5 + tx * 2.40 - fx * 0.35,
        EYE_Y - 0.25,
        (pz + qz) * 0.5 + tz * 2.40 - fz * 0.35,
      );
      clampInSpace(_eye, space);
      return;
    }
    fillExecuteEye();
  }

  function whipCam(dt) {
    const k = exec.hit ? (1 - Math.exp(-7.2 * dt)) : (1 - Math.exp(-3.1 * dt));
    engine.camera.position.lerp(_eye, k);
    _lookLive.lerp(_look, k);
  }

  function boneWorld(root, name, out) {
    if (!root) return null;
    let found = null;
    root.traverse?.((o) => { if (o.isBone && o.name === name) found = o; });
    if (!found) return null;
    root.updateWorldMatrix(true, true);
    found.getWorldPosition(out);
    return out;
  }

  function victimAim(v) {
    if (!v) return null;
    if (boneWorld(v.body?.root, 'Head', _aimW) || boneWorld(v.body?.root, 'Neck', _aimW)) {
      return _aimW;
    }
    const aim = seatedAim({ sitAt: v.sitAt, chair: v.chair, cx, cz });
    _aimW.set(aim.x, aim.y, aim.z);
    return _aimW;
  }

  function hideChairInstance(i) {
    if (!circle.mesh || i == null) return;
    _hideM.makeScale(0, 0, 0);
    circle.mesh.setMatrixAt(i, _hideM);
    circle.mesh.instanceMatrix.needsUpdate = true;
  }

  function showChairInstance(i) {
    if (!circle.mesh || i == null) return;
    const seat = circle.seats[i];
    if (!seat) return;
    _seatM.makeRotationY(seat.rotY || 0);
    _seatM.setPosition(seat.x, seat.y ?? 0, seat.z);
    circle.mesh.setMatrixAt(i, _seatM);
    circle.mesh.instanceMatrix.needsUpdate = true;
  }

  function dropCollider(i) {
    const box = chairBoxes[i];
    if (!box || !space?.colliders) return;
    const idx = space.colliders.indexOf(box);
    if (idx >= 0) space.colliders.splice(idx, 1);
  }

  function restoreCollider(i) {
    const box = chairBoxes[i];
    if (!box || !space?.colliders) return;
    if (!space.colliders.includes(box)) space.colliders.push(box);
  }

  function breakChairOut(i) {
    if (i == null || !circle.mesh) return;
    if (exec.looseChairs.some((c) => c.index === i)) return;
    const seat = circle.seats[i];
    if (!seat) return;
    hideChairInstance(i);
    dropCollider(i);
    const mat = circle.mesh.material?.clone?.() ?? circle.mesh.material;
    if (mat && mat !== circle.mesh.material) ownedMaterials.push(mat);
    const mesh = new THREE.Mesh(circle.mesh.geometry, mat);
    mesh.name = `exec-chair-${i}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(seat.x, seat.y ?? 0, seat.z);
    mesh.rotation.set(0, seat.rotY || 0, 0);
    group.add(mesh);
    exec.looseChairs.push({ mesh, index: i, t: 0, seat });
  }

  function stepLooseChair(dt) {
    for (const ch of exec.looseChairs) {
      ch.t += dt;
      const pose = chairTopple({ seat: ch.seat, u: ch.t / 0.62, cx, cz });
      ch.mesh.position.set(pose.x, pose.y, pose.z);
      ch.mesh.rotation.set(pose.rotX, pose.rotY, pose.rotZ);
    }
  }

  function smashLook(r) {
    if (!r?.body?.root || r.smashed) return;
    r.smashed = true;
    exec.smashed = true;
    /*
     * 📺 HEAT · NO BODY TINT. Same shell/albedo as a living sit. Death is the
     * face only: visor/screen crashed, face lamp off (emissive = 0). No
     * grayscale, no dim multiply, no missing shoulder. dropDeadMaps stays —
     * that is a disposed-texture guard, not a look. Gate: H15.
     */
    r.body.root.traverse((o) => {
      if (o.isLight && isFaceScreenName(o.name)) {
        o.intensity = 0;
        o.visible = false;
      }
      if (!o.isMesh && !o.isSkinnedMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const face = isFaceScreenName(o.name)
        || mats.some((m) => isFaceScreenName(m?.name));
      const next = mats.map((m) => {
        if (!m) return m;
        if (face) {
          const mine = m.userData._faceCrashed ? m : m.clone();
          mine.userData._faceCrashed = true;
          if (mine.emissive) mine.emissive.setRGB(0, 0, 0);
          if ('emissiveIntensity' in mine) mine.emissiveIntensity = 0;
          dropDeadMaps(mine);
          return mine;
        }
        dropDeadMaps(m);
        return m;
      });
      o.material = Array.isArray(o.material) ? next : next[0];
    });
  }

  function restoreSmash(r) {
    if (!r?.body?.root || !r.smashed) return;
    r.smashed = false;
    r.body.avatar?.setLimbVisible?.('shoulderL', true);
    r.body.root.traverse((o) => {
      if (!o.isMesh && !o.isSkinnedMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        const pre = m?.userData?._preSmash;
        if (!pre) continue;
        if (pre.color && m.color) m.color.copy(pre.color);
        if (pre.emissive && m.emissive) m.emissive.copy(pre.emissive);
        if ('roughness' in m && pre.roughness != null) m.roughness = pre.roughness;
        if ('metalness' in m && pre.metalness != null) m.metalness = pre.metalness;
        if ('emissiveIntensity' in m && pre.emissiveIntensity != null) {
          m.emissiveIntensity = pre.emissiveIntensity;
        }
        delete m.userData._preSmash;
      }
    });
    r.body.root.rotation.x = 0;
    r.body.root.rotation.z = 0;
  }

  function applySmashBones(r, u) {
    const k = Math.min(1, Math.max(0, u));
    r.body?.root?.traverse?.((o) => {
      if (!o.isBone) return;
      if (o.name === 'Head') {
        o.rotation.x += 0.42 * k;
        o.rotation.z += 0.55 * k;
      } else if (o.name === 'RightUpLeg') {
        o.rotation.z -= 0.62 * k;
      } else if (o.name === 'LeftUpLeg') {
        o.rotation.x += 0.28 * k;
      }
    });
  }

  function retargetSledge() {
    const sledge = exec.swinger?.body?.sledge;
    const v = exec.victim;
    if (!sledge?.head || !sledge.root || !v || exec.hit) return;
    const root = sledge.root;
    const gripped = exec.swinger.body.avatar?.setGrip?.();
    if (!gripped) {
      if (!exec.sledgeLocal && root.parent) {
        exec.sledgeLocal = { pos: root.position.clone(), quat: root.quaternion.clone() };
      }
      if (exec.sledgeLocal) {
        root.position.copy(exec.sledgeLocal.pos);
        root.quaternion.copy(exec.sledgeLocal.quat);
      }
    }
    root.updateWorldMatrix(true, true);
    sledge.head.updateWorldMatrix(true, false);
    _headW.setFromMatrixPosition(sledge.head.matrixWorld);
    const aim = victimAim(v);
    if (!aim) return;
    const clockPhase = (exec.t - exec.swingAt) / Math.max(0.01, SWING_DUR);
    const phase = sledge.phase > 0 ? sledge.phase : clockPhase;
    const mix = contactMix(phase, sledge.contactPhase ?? HIT_CONTACT);
    const want = retargetHead(_headW, aim, mix);
    _deltaW.set(want.x - _headW.x, want.y - _headW.y, want.z - _headW.z);
    if (_deltaW.lengthSq() < 1e-8 || !root.parent) return;
    _tmpW.setFromMatrixPosition(root.matrixWorld).add(_deltaW);
    root.parent.worldToLocal(_tmpW);
    root.position.copy(_tmpW);
    root.updateWorldMatrix(true, true);
    sledge.head.updateWorldMatrix(true, false);
  }

  function beginHit(t) {
    if (exec.hit || !exec.victim) return;
    exec.hit = true;
    exec.hitAt = exec.t;
    exec.lastLook = stepLastLook(exec.lastLook, { armed: true, dead: true });
    applyWreck([exec.victim.seat.id], { live: true });
    void t;
  }

  /**
   * Standing set dressing. Public-dead ids stay limp + broken chair after the
   * execute plate, across dispose/rebuild. Skip the live execute target so the
   * walk-up still has a seated accused until contact.
   */
  function applyWreck(ids, { live = false } = {}) {
    const liveTarget = (!live && exec.phase !== 'off' && exec.victim)
      ? String(exec.victim.seat.id) : null;
    for (const raw of ids || []) {
      const id = String(raw || '');
      if (!id || id === liveTarget) continue;
      const r = robotById(id);
      if (!r) continue;
      if (!r.wrecked) {
        r.wrecked = true;
        r.seated = false;
        r.arrived = true;
        r.cleared = true;
        r.body.sitLock = true;
        /*
         * 📺 HEAT · FREEZE. A looping loco clip on a pitched root is the
         * elbow-up prone John watched. holdDead stops the mixer on bind; smash
         * bones land once. Gate: execute-hit H14.
         */
        r.body.avatar?.holdDead?.();
        smashLook(r);
        breakChairOut(r.seatIndex);
        applySmashBones(r, 1);
        r.smashBones = true;
        setNomineeBang(r.bang, false);
        if (r.tag) r.tag.visible = false;
      }
      r.wreckAge = Math.max(r.wreckAge || 0, 0.72);
      for (const ch of exec.looseChairs) {
        if (ch.index === r.seatIndex) ch.t = Math.max(ch.t, 0.62);
      }
    }
  }

  function stepWreck(r, dt, t) {
    r.wreckAge = (r.wreckAge || 0) + dt;
    const u = r.wreckAge / 0.72;
    const limp = wreckPose({
      sitAt: r.sitAt, face: r.face, u, cx, cz, floorY: room.floorY ?? 0,
    });
    const body = r.body;
    body.sitLock = true;
    body.pos.set(limp.x, limp.y, limp.z);
    body.facing = limp.facing;
    body.aimYaw = limp.facing;
    /*
     * Do not body.update — that re-enables gait + mixer idle on the corpse.
     * Root pose is kinematic; the mixer stays frozen from holdDead.
     */
    if (!body.avatar?.dead) body.avatar?.holdDead?.();
    body.root.rotation.y = limp.facing;
    body.root.rotation.x = limp.pitch;
    body.root.rotation.z = limp.roll;
    hideChairInstance(r.seatIndex);
    void t;
  }

  function lastLookPose() {
    const v = exec.victim;
    if (!v) return null;
    const eye = chairEyeline({ chair: v.chair, cx, cz });
    let at = { x: cx, y: 1.35, z: cz };
    const head = exec.swinger?.body?.sledge?.head;
    if (head) {
      head.updateWorldMatrix(true, false);
      _tmpW.setFromMatrixPosition(head.matrixWorld);
      at = { x: _tmpW.x, y: _tmpW.y, z: _tmpW.z };
    } else if (exec.swinger) {
      at = { x: exec.swinger.body.pos.x, y: 1.45, z: exec.swinger.body.pos.z };
    }
    return {
      eye, at, fov: 46,
      name: String(v.seat.name || 'THEM'),
    };
  }

  function contactSnapshot() {
    const sledge = exec.swinger?.body?.sledge;
    const v = exec.victim;
    if (!sledge?.head || !v) {
      return { head: null, aim: null, ok: false, slack: HIT_SLACK };
    }
    sledge.head.updateWorldMatrix(true, false);
    _headW.setFromMatrixPosition(sledge.head.matrixWorld);
    const aim = victimAim(v);
    const head = { x: _headW.x, y: _headW.y, z: _headW.z };
    const torso = aim ? { x: aim.x, y: aim.y, z: aim.z } : null;
    return {
      head, aim: torso, slack: HIT_SLACK,
      ok: !!(torso && occupies(head, torso, HIT_SLACK)),
    };
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
    exec.sledgeLocal = null;
  }

  function stepExecute(dt, t) {
    if (exec.phase === 'off') return;
    exec.t += dt;
    if (exec.phase === 'rise' && exec.t >= EXECUTE.RISE_DUR) beginWalk();
    if (exec.phase === 'walk') {
      const waited = exec.t - EXECUTE.RISE_DUR;
      if (exec.walked && waited >= EXECUTE.FACE) beginSwing(t);
      else if (waited >= EXECUTE.WALK_TIMEOUT) beginSwing(t);
    }
    if (exec.phase === 'swing' && exec.t >= exec.swingAt + SWING_DUR + 0.12) {
      exec.phase = 'hold';
    }
    if (exec.showrunner && !exec.hit && exec.victim && exec.t >= EXECUTE.RISE_DUR + SHOW_CONTACT_S) {
      beginHit(t);
    }
  }

  function afterBodies(dt) {
    stepLooseChair(dt);
  }

  function clearExecute() {
    /*
     * ⚠️ THE WRECK STAYS. Episode-2 casting used to send an empty execute cue, which
     * parkSit'd Ada back into chair 7 with her nameplate up. Dead stay limp/smashed;
     * the toppled chair stays a separate object. Alignment still hidden until Reunion.
     */
    if (exec.swinger && !exec.swinger.wrecked) {
      exec.swinger.body.avatar?.unmountProp?.();
      exec.swinger.body.sledge?.forget?.();
      restoreChair(exec.swinger.seatIndex);
      parkSit(exec.swinger);
    }
    if (exec.victim) setNomineeBang(exec.victim.bang, false);
    exec.key = '';
    exec.phase = 'off';
    exec.t = 0;
    exec.swinger = null;
    exec.victim = null;
    exec.strike = null;
    exec.walked = false;
    exec.swung = false;
    exec.swingAt = 0;
    exec.showrunner = false;
    exec.hit = false;
    exec.hitAt = 0;
    exec.lastLook = LAST_LOOK.OFF;
    exec.sledgeLocal = null;
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
      if (r && !r.wrecked) parkSit(r);
    },
    mark: (targets) => { nominatedIds = targets; repaintTags(); },
  });

  /*
   * 🎭 The pair-lock sendoff. Same machine shape as the accusation: keyed `runner>guide`,
   * sitLock stays on, the clip does the travelling. Reactors: none. Driven after 3·2·1,
   * before expedition. See `pair-lock-stage.js`.
   */
  const pairLock = createPairLockStage({
    seatCount: robots.length,
    seatOf: (id) => {
      const i = robots.findIndex((r) => String(r.seat.id) === String(id));
      return i >= 0 ? i : null;
    },
    play: (seatIndex, clip, hold) => {
      const av = robots[seatIndex]?.body?.avatar;
      if (typeof av?.playSeated !== 'function') return false;
      if (hold && av.clip === clip) return true;
      return av.playSeated(clip, { hold: !!hold, fade: PAIR.FADE }) === true;
    },
    rest: (seatIndex) => {
      const r = robots[seatIndex];
      if (r && !r.wrecked) parkSit(r);
    },
  });

  if (wreckWant.size) applyWreck([...wreckWant]);

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
          if (r.wrecked) continue;
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
        pairLock.reapply();
      }
    },

    /**
     * Expedition: the runner's intro twin hides and walks the house as `follow-bed`'s Player.
     * Everyone else stays in their chair. Chairs stay in the world.
     */
    holdForRun(runnerId) {
      pairLock.set([]);
      heldRunner = runnerId ?? null;
      for (const r of robots) {
        const mine = heldRunner != null && String(r.seat.id) === String(heldRunner);
        r.body.root.visible = !mine;
        if (!mine && !(exec.phase !== 'off' && exec.swinger === r) && !r.wrecked) parkSit(r);
      }
    },

    /** Recap / debrief: the runner is back in their chair with the others. */
    releaseRun() {
      heldRunner = null;
      for (const r of robots) {
        r.body.root.visible = true;
        if (exec.phase !== 'off' && exec.swinger === r) continue;
        if (r.wrecked) continue;
        parkSit(r);
      }
      // Same reason as `setTalk`: this sweep re-idles the circle, and a live accusation has to
      // survive it. Nominations are normally empty by here, in which case this does nothing.
      stage.reapply();
      pairLock.reapply();
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
     * 🎭 **Casting after lock: the circle PERFORMS the sendoff.** Runner stands at 0,
     * guide at 0.40, both hold `Sit_to_Stand_Transition_M`. Keyed `runner>guide` — a
     * re-cue of the same pair is a no-op. Empty clears. Seat lock stays on.
     *
     * Also reached from `setPairs` when the host sends a nameless `{a,b}` pair during
     * sendoff (the whisper `pair` cue carries a merged name; a nameless pair is this).
     */
    setPairLock(runnerId, guideId) {
      const runner = String(runnerId || '');
      const guide = String(guideId || '');
      if (!runner || !guide) { pairLock.set([]); return pairLock.keys().length; }
      return pairLock.set([{ runner, guide }]);
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
      exec.hit = false;
      exec.hitAt = 0;
      exec.sledgeLocal = null;
      exec.smashed = false;
      exec.lastLook = exec.victim ? LAST_LOOK.LIVE : LAST_LOOK.OFF;
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
      const nameless = [];
      for (const p of pairs || []) {
        if (!p?.a || !p?.b) continue;
        if (!p?.name) { nameless.push(p); continue; }
        pairNameById.set(String(p.a), p.name);
        pairNameById.set(String(p.b), p.name);
      }
      repaintTags();
      /*
       * A nameless pair is the locked runner+guide, not a whisper merge. Debrief pairs
       * carry a merged name and must not stand anyone. Empty clears a leftover sendoff.
       */
      if (nameless.length === 1) pairLock.set([{ runner: nameless[0].a, guide: nameless[0].b }]);
      else if (!(pairs || []).length) pairLock.set([]);
      /*
       * 🟢 …and the data crossing the room between them. The merged plate is a change to
       * something the room has already read and stopped looking at; the stream is a new thing
       * moving in the middle of the picture, which is what actually gets noticed.
       */
      const tagOf = (id) => robots.find((r) => String(r.seat.id) === id)?.tag || null;
      stream.sync((pairs || []).filter((p) => p?.name), tagOf);
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

    pairLockReport: () => ({
      keys: pairLock.keys(),
      pending: pairLock.pending(),
      performing: pairLock.performing(),
      finished: pairLock.finished(),
    }),

    /**
     * Public-dead ids become standing wreckage. Safe after the plate
     * (`exec.phase === 'off'`); skips the live accused so the walk-up still sits.
     */
    applyWreck: (ids) => applyWreck(ids),

    /** Harness hook: who is walking, whether they have swung, which phase. */
    executionReport: () => {
      const snap = contactSnapshot();
      const limp = wreckPose({
        sitAt: exec.victim?.sitAt, face: exec.victim?.face ?? 0,
        u: exec.hit ? (exec.t - exec.hitAt) / 0.72 : 0, cx, cz, floorY: room.floorY ?? 0,
      });
      return {
        phase: exec.phase,
        key: exec.key,
        walked: exec.walked,
        swung: exec.swung,
        showrunner: exec.showrunner,
        actor: exec.swinger ? String(exec.swinger.seat.id) : null,
        target: exec.victim ? String(exec.victim.seat.id) : null,
        sitLock: exec.swinger ? !!exec.swinger.body.sitLock : null,
        seated: exec.swinger ? !!exec.swinger.seated : null,
        hit: exec.hit,
        wrecked: !!exec.victim?.wrecked,
        limp: !!(exec.hit && exec.victim && !exec.victim.seated),
        damaged: !!(exec.smashed || exec.victim?.smashed),
        wreckedIds: robots.filter((r) => r.wrecked).map((r) => String(r.seat.id)),
        chairLoose: exec.looseChairs.length > 0,
        chairToppled: exec.looseChairs.some((c) => c.t > 0.15),
        wreckHeld: robots.some((r) => r.wrecked) && exec.phase === 'off',
        wreckTalk: (() => {
          const w = robots.find((r) => r.wrecked);
          if (!w) return null;
          const cam = wreckLook({
            sitAt: w.sitAt, seat: w.chair, face: w.face, cx, cz, floorY: room.floorY ?? 0,
          });
          return { lookY: cam.look.y, eyeY: cam.eye.y, shot: WRECK_SHOT.name };
        })(),
        lastLook: exec.lastLook,
        cam: execCamMode({ showrunner: exec.showrunner }),
        contact: snap,
        wreck: exec.hit ? { x: limp.x, y: limp.y, z: limp.z, roll: limp.roll } : null,
      };
    },

    /**
     * C — the accused's chair eyeline while they live. Hard-cut one frame, then gone.
     * The follow view scissors this into a small popup; it is never the main picture.
     */
    lastLook() {
      const pose = lastLookPose();
      return {
        state: exec.lastLook,
        name: pose?.name ?? null,
        fov: pose?.fov ?? 46,
        eye: pose?.eye ?? null,
        at: pose?.at ?? null,
        label: 'THEIR EYES',
      };
    },

    consumeLastLookCut() {
      exec.lastLook = stepLastLook(exec.lastLook, { consumeCut: true });
      return exec.lastLook;
    },

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
      pairLock.step(dt);
      stepExecute(dt, t);
      for (const r of robots) driveOne(r, dt, t);
      afterBodies(dt);
      stream.step(dt, engine.camera);
    },

    step(dt, t) {
      clock += dt;
      stage.step(dt);
      pairLock.step(dt);
      stepExecute(dt, t);
      for (const r of robots) driveOne(r, dt, t);
      afterBodies(dt);
      stream.step(dt, engine.camera);

      /*
       * 🎥 Talk still walks the outside arc. Execution is a different picture:
       * B rides the walk-up inside the ring and whips to the wreck; Showrunner
       * degrades to A (fillExecuteEye, outside hold). Never a lid.
       */
      const useTalk = talking || done;
      if (exec.phase !== 'off') {
        const cam = execCamMode({ showrunner: exec.showrunner });
        if (cam === 'A') fillExecuteEye();
        else fillExecuteB();
        reelSight?.(_eye, _look);
        if (cam === 'A') {
          walkCamOnRing(engine.camera, _lookLive, _eye, _look, cx, cz, dt);
        } else {
          whipCam(dt);
        }
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
