import * as THREE from 'three';
import { Player } from './player.js';
import { chairCircle } from '../world/props.js';
import { unit4hMaterials } from '../materials/surfaces/robot.js';
import { cloneMeshAvatar } from '../characters/mesh-avatar.js';
import { INTRO_FOV, RING_OUT, TALK_FOV } from '../party/follow.js';
import { attachHeadNameTag } from '../characters/chest-nameplate.js';

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
const WIDE_Y = 2.28;

/**
 * 🎬 **TALK / DEBRIEF SHOTS — changing angles, slow sweeps, never a locked chair cam.**
 *
 * Debrief used to re-fire the intro portrait and hold. John: different angles, sweeping
 * views, other contestants visible. Each shot is a few seconds of move, then the director
 * eases onto the next; the run camera is not touched (`liveRunShot` still locks chase).
 */
const TALK_SHOTS = [
  { name: 'pair', dur: 9.5 },
  { name: 'orbit', dur: 13.0 },
  { name: 'wide', dur: 11.0 },
  { name: 'push', dur: 9.0 },
  { name: 'across', dur: 12.0 },
];

const TALK_CYCLE = TALK_SHOTS.reduce((s, x) => s + x.dur, 0);

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
  const a = robots[focus];
  const b = robots[(focus + 1) % n];
  const far = robots[(focus + Math.max(1, Math.floor(n / 2))) % n];
  const ox = a.ux, oz = a.uz;
  const tx = a.tx, tz = a.tz;
  const out = ringOut(radius);

  if (shot.name === 'pair') {
    const back = radius + out * (0.88 + u * 0.14);
    const side = 1.35 + u * 0.45;
    eye.set(cx + ox * back + tx * side, EYE_Y + Math.sin(u * Math.PI) * 0.08, cz + oz * back + tz * side);
    look.set(
      (a.body.pos.x + b.body.pos.x) * 0.38 + cx * 0.24,
      LOOK_Y,
      (a.body.pos.z + b.body.pos.z) * 0.38 + cz * 0.24,
    );
  } else if (shot.name === 'orbit') {
    const ang = clock * 0.085 + focus * ((Math.PI * 2) / n);
    const r = radius + out;
    eye.set(cx + Math.sin(ang) * r, EYE_Y + Math.sin(clock * 0.19) * 0.10, cz + Math.cos(ang) * r);
    look.set(cx, LOOK_Y - 0.06, cz);
  } else if (shot.name === 'wide') {
    const ang = clock * 0.045;
    const r = radius + out * 1.18;
    eye.set(cx + Math.sin(ang) * r, WIDE_Y, cz + Math.cos(ang) * r);
    look.set(cx, LOOK_Y - 0.10, cz);
  } else if (shot.name === 'push') {
    const dist = THREE.MathUtils.lerp(radius + out * 1.12, radius + out * 0.72, u);
    eye.set(cx + ox * dist + tx * 1.05, EYE_Y + (1 - u) * 0.16, cz + oz * dist + tz * 1.05);
    look.set(
      a.body.pos.x * 0.55 + cx * 0.45,
      LOOK_Y,
      a.body.pos.z * 0.55 + cz * 0.45,
    );
  } else {
    const dist = radius + out * 0.95;
    eye.set(cx + ox * dist + tx * 0.55, EYE_Y, cz + oz * dist + tz * 0.55);
    look.set(
      far.body.pos.x * 0.55 + cx * 0.45,
      LOOK_Y,
      far.body.pos.z * 0.55 + cz * 0.45,
    );
  }
  clampInSpace(eye, space);
  return { index: focus, shot: shot.name };
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
    const tag = attachHeadNameTag(body, seat.name);
    if (tag?.material) ownedMaterials.push(tag.material);

    const tx = -uz, tz = ux;
    const at = new THREE.Vector3(chair.x - ux * STAND_IN, room.floorY ?? 0, chair.z - uz * STAND_IN);
    const face = Math.atan2(cx - chair.x, cz - chair.z);
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
      body.pos.copy(at);
      body.facing = face;
      body.aimYaw = face;
      body.root.visible = true;
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
      seat, body, chair, ux, uz, tx, tz, tag,
      flair: FLAIRS[i % FLAIRS.length],
      /*
       * ⚠️ THE ROBOT STANDS *IN FRONT OF* ITS CHAIR, NOT ON IT. The stand-mark is inward of
       * the seat AABB so collision does not pin them in the cushion. An actual seated gait
       * is still not on this body — they occupy their place without phasing through it.
       */
      at,
      via,
      cleared: !!talk,
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

    // Arrived: turn to face the middle of the circle, then perform (or idle once held).
    const turn = Math.atan2(Math.sin(r.face - body.aimYaw), Math.cos(r.face - body.aimYaw));
    body.aimYaw += turn * (1 - Math.exp(-8.0 * dt));
    const phase = THREE.MathUtils.clamp((clock - r.t0 - 1.1) / Math.max(0.5, step - 1.1), 0, 1);
    const f = (talking || heldRunner != null) ? { yaw: 0, move: 0, pitch: 0 } : r.flair.drive(phase);
    body.update(dt, t, {
      move: { x: 0, y: f.move ?? 0 },
      run: false,
      aimYaw: r.face + (f.yaw ?? 0),
      aimPitch: f.pitch ?? 0,
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
          r.body.root.visible = true;
          if (!r.arrived) {
            r.body.pos.copy(r.at);
            r.body.facing = r.face;
            r.body.aimYaw = r.face;
            r.cleared = true;
            r.arrived = true;
          }
        }
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
        if (!mine && !r.arrived) {
          r.body.pos.copy(r.at);
          r.body.facing = r.face;
          r.body.aimYaw = r.face;
          r.cleared = true;
          r.arrived = true;
        }
      }
    },

    /** Recap / debrief: the runner is back in their chair with the others. */
    releaseRun() {
      heldRunner = null;
      for (const r of robots) {
        r.body.root.visible = true;
        r.body.pos.copy(r.at);
        r.body.facing = r.face;
        r.body.aimYaw = r.face;
        r.cleared = true;
        r.arrived = true;
      }
    },

    /**
     * Bodies only — no camera. The expedition chase owns the lens; the sit circle still
     * idles and billboards so a cut back to recap is not an empty void.
     */
    holdStep(dt, t) {
      clock += dt;
      for (const r of robots) driveOne(r, dt, t);
    },

    step(dt, t) {
      clock += dt;
      for (const r of robots) driveOne(r, dt, t);

      /*
       * 🎥 THE CAMERA STANDS OUTSIDE THE RING looking in. #39 sat inside (faces, not chair
       * backs); the playtest asked for the opposite — chairs as a readable circle, robots
       * smaller. Talk beats sweep; a live walk-in still snaps to the arriving robot.
       */
      const useTalk = talking || done;
      if (useTalk) {
        const shot = fillTalkEye();
        reelSight?.(_eye, _look);
        engine.camera.position.lerp(_eye, 1 - Math.exp(-1.55 * dt));
        _lookLive.lerp(_look, 1 - Math.exp(-2.1 * dt));
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
        if (o.name === 'headName' || o.name === 'chestName') o.userData?.ownedTex?.dispose?.();
      });
      for (const r of robots) r.body.avatar?.dispose?.();
      for (const m of ownedMaterials) m.dispose?.();
      ownedMaterials.length = 0;
    },
  };
}
