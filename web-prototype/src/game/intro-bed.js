import * as THREE from 'three';
import { Player } from './player.js';
import { chairCircle } from '../world/props.js';
import { unit4hMaterials } from '../materials/surfaces/robot.js';

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
/** Close enough to the chair to stop walking and start performing. */
const ARRIVE = 0.42;
/** How far in front of its chair a robot stands. See the note on `at` below. */
const STAND_IN = 0.62;

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
 * @param {(eye,at)=>void} [o.reelSight]  `follow-bed.js`'s sight reel — see its use below
 */
export function buildIntroBed(engine, { room, cast, materials, reelSight } = {}) {
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

  const base = materials ?? unit4hMaterials();
  /** Only what this file cloned. `dispose()` destroys these and nothing else — see its header. */
  const ownedMaterials = [];
  const robots = seats.map((seat, i) => {
    const chair = circle.seats[i] ?? { x: cx, z: cz, rotY: 0 };
    // Outward: from the circle's centre through the chair. The chair faces the centre, so the
    // robot standing at it faces the centre too, and the camera watches from inside the ring.
    const ox = chair.x - cx, oz = chair.z - cz;
    const len = Math.hypot(ox, oz) || 1;
    const ux = ox / len, uz = oz / len;

    const body = new Player({
      scene: group,
      world: room,
      rng,
      id: `intro-${seat.id ?? i}`,
      materials: tintedMaterials(base, seat.shell, seat.accent, ownedMaterials),
    });
    const start = new THREE.Vector3(cx + ux * (radius + ENTRY_OUT), room.floorY ?? 0, cz + uz * (radius + ENTRY_OUT));
    // Nudge the entry point back inside the house if the ballroom is not big enough to hold it.
    if (space) {
      start.x = THREE.MathUtils.clamp(start.x, space.x0 + 0.7, space.x1 - 0.7);
      start.z = THREE.MathUtils.clamp(start.z, space.z0 + 0.7, space.z1 - 0.7);
    }
    body.pos.copy(start);
    // Facing the chair it is about to walk to.
    const inward = Math.atan2(chair.x - start.x, chair.z - start.z);
    body.facing = inward;
    body.aimYaw = inward;
    body.root.visible = false;

    return {
      seat, body, chair,
      flair: FLAIRS[i % FLAIRS.length],
      /*
       * ⚠️ THE ROBOT STANDS *IN FRONT OF* ITS CHAIR, NOT ON IT, AND THE FIRST DRIVE PHOTOGRAPHED
       * WHY. Standing at the chair's own coordinate puts the chair between the camera and the
       * robot — the camera watches from inside the ring, the chair faces inward, so the shot was
       * a chair back with a head over it. `STAND_IN` moves the body 0.62 m toward the centre,
       * which reads as someone standing at their place about to sit down. (An actual seated pose
       * is a `Gait` this body does not have — see §9 of the slice.)
       */
      at: new THREE.Vector3(chair.x - ux * STAND_IN, room.floorY ?? 0, chair.z - uz * STAND_IN),
      // Where the camera stands to see this robot's FRONT: inside the ring, on the same bearing.
      eye: new THREE.Vector3(chair.x - ux * (STAND_IN + 2.6), 1.42, chair.z - uz * (STAND_IN + 2.6)),
      face: Math.atan2(cx - chair.x, cz - chair.z),
      arrived: false,
      t0: i * STAGGER,
    };
  });

  const step = n > 5 ? STEP_FAST : STEP_SLOW;
  const total = (n - 1) * STAGGER + n * step + 1.2;

  let clock = 0;
  let done = false;
  const _look = new THREE.Vector3();
  const _eye = new THREE.Vector3();
  engine.camera.position.copy(robots[0]?.eye ?? new THREE.Vector3(cx, 1.42, cz + 3));

  function driveOne(r, dt, t) {
    if (clock < r.t0) return;                       // has not been called in yet
    const body = r.body;
    body.root.visible = true;

    const dx = r.at.x - body.pos.x, dz = r.at.z - body.pos.z;
    const d = Math.hypot(dx, dz);
    if (!r.arrived && d <= ARRIVE) r.arrived = true;

    if (!r.arrived) {
      /*
       * The whole steering problem, in one line, and it is `follow-bed.js`'s line: `Player`'s
       * `move` is AIM-RELATIVE (`player.js` `_stepGround`), so putting the bearing on `aimYaw` and
       * pushing the stick forward buys collision, sliding, the doorway squeeze, the foot plant and
       * the arm swing for free. Do not animate a capsule along a spline.
       */
      const want = Math.atan2(dx, dz);
      const turn = Math.atan2(Math.sin(want - body.aimYaw), Math.cos(want - body.aimYaw));
      body.aimYaw += turn * (1 - Math.exp(-7.0 * dt));
      body.update(dt, t, { move: { x: 0, y: 1 }, run: !!r.flair.arriveRun, aimYaw: body.aimYaw });
      return;
    }

    // Arrived: turn to face the middle of the circle, then perform.
    const turn = Math.atan2(Math.sin(r.face - body.aimYaw), Math.cos(r.face - body.aimYaw));
    body.aimYaw += turn * (1 - Math.exp(-8.0 * dt));
    const phase = THREE.MathUtils.clamp((clock - r.t0 - 1.1) / Math.max(0.5, step - 1.1), 0, 1);
    const f = r.flair.drive(phase);
    body.update(dt, t, {
      move: { x: 0, y: f.move ?? 0 },
      run: false,
      aimYaw: r.face + (f.yaw ?? 0),
      aimPitch: f.pitch ?? 0,
    });
  }

  return {
    /** Which robot the camera is on, and what it is doing — for the lower-third and the drive. */
    focus() {
      const i = Math.min(robots.length - 1, Math.max(0, Math.floor(clock / step)));
      const r = robots[i];
      return r ? { index: i, name: r.seat.name ?? null, shell: r.seat.shell, accent: r.seat.accent, flair: r.flair.name } : null;
    },
    get done() { return done; },
    chairs: circle.seats.length,

    step(dt, t) {
      clock += dt;
      for (const r of robots) driveOne(r, dt, t);

      /*
       * 🎥 THE CAMERA IS POINTED AT THE ARRIVING ROBOT'S FRONT, WHICH IS WHY IT STANDS INSIDE THE
       * RING. The chairs face the centre, so a camera outside the circle would spend the entire
       * beat filming the backs of the heads of people who just chose a colour.
       *
       * It EASES between robots rather than cutting. A cut is the operator's instrument during the
       * run (`follow-bed.js` `FollowOperator`); the intros are a single continuous move around a
       * circle, which is what makes them read as one introduction rather than eight.
       */
      const i = Math.min(robots.length - 1, Math.max(0, Math.floor(clock / step)));
      const r = robots[i];
      if (r) {
        _look.set(r.body.pos.x, 1.15, r.body.pos.z);
        _eye.copy(r.eye);
        /*
         * ⚠️ THE GENERATED BALLROOM HAS A COLONNADE, AND A CHAIR CIRCLE DOES NOT KNOW WHERE THE
         * PILLARS ARE. `dressGenerated` attaches `ROOMS.ballroom`'s `columns` to a generated row,
         * so a camera parked 2.6 m inside the ring on some bearings is looking at a pillar rather
         * than at the robot the whole beat exists to show. Same reel `follow-bed.js` uses for the
         * run camera — the shot tightens rather than going crooked.
         */
        reelSight?.(_eye, _look);
        engine.camera.position.lerp(_eye, 1 - Math.exp(-2.6 * dt));
        engine.camera.up.set(0, 1, 0);
        engine.camera.lookAt(_look);
        // The same breath the run camera has, so the two beats are one production.
        engine.camera.rotateZ(Math.sin(t * 0.73) * 0.004);
      }
      if (!done && clock >= total) done = true;
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
      scene.remove(group);
      group.traverse((o) => {
        if (o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.isLine || o.isPoints) {
          o.geometry?.dispose?.();
        }
      });
      for (const m of ownedMaterials) m.dispose?.();
      ownedMaterials.length = 0;
    },
  };
}
