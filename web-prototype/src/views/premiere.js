import * as THREE from 'three';
import { estate } from './_studio.js';
import { estateMaterials } from '../world/materials-local.js';
import { GeoBin, STOREY } from '../world/kit.js';
import { ballroomPlan, ballroomOrder } from '../world/ballroom-order.js';
import { chairCircle } from '../world/props.js';
import { ballroomEnv, spotKey, bounceFill } from '../lighting/rig.js';
import { createMeshAvatar } from '../characters/mesh-avatar.js';
import { unit4hMaterials } from '../materials/surfaces/robot.js';

/**
 * 🎬 **PARTY.PREMIERE — eight robots walk in and take a chair.**
 *
 *   ?view=party.premiere              the whole pre-show
 *   ?view=party.premiere&at=14        frozen fourteen seconds in
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------------
 * The show has to start somewhere, and "everyone stares at a lobby screen" is not a start. This is
 * the cold open: the ballroom, eight chairs in a ring, and eight contestants walking in from the
 * corridors to be named one at a time. It is the only moment in the mode where the table sees all
 * eight robots together and learns which body belongs to which name — which is what makes the
 * nameplate rail legible for the rest of the evening.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ THE STAGE IS THE BALLROOM AND FOUR CORRIDORS, DELIBERATELY, AND NOT THE HOUSE.
 * ---------------------------------------------------------------------------------------------
 * `buildTestRoom` builds six spaces, every panel and the whole destruction state machine — none of
 * which the pre-show uses, all of which it would pay for. This builds the one room the pre-show
 * happens in, from **the same `ballroomOrder` the playable ballroom and the showcase both use**,
 * plus a corridor against each wall so the entrances lead somewhere instead of ending in black.
 *
 * The corridors are simple: a floor, two walls and a ceiling, in the room's own stone. They exist
 * so the doorways read as doorways. When the pre-show is wired into the real house they are
 * deleted and the mansion's own rooms are on the other side of those four holes.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THERE IS NO SIT CLIP IN THE CHARACTER SET, SO THE SEATED POSE IS POSED BY HAND.
 * ---------------------------------------------------------------------------------------------
 * `mesh-avatar.js` ships idle, walk, run and the swings. Nothing sits. Its own header already
 * records the same gap for a two-handed idle — *"the real fix is to GENERATE the clip; that is a
 * pipeline job, not a code job"* — and the same is true here.
 *
 * So `sit()` below drives four bones directly, after the mixer has run, and lowers the root to the
 * seat. It is a pose and not an animation: it will not survive a camera at knee height, and the
 * hands do not find the arms of the chair. **A real sit-down clip is the asset this scene wants
 * next**, and until it exists this is honest rather than convincing.
 */

/** The ballroom, as the showcase and the playable room both have it. */
export const R = { x0: -13, x1: 13, z0: -8, z1: 8, h: 9.6 };
/** Eight chairs, radius from `chairCircle`'s own default — walkable for a 1.7 m robot. */
export const RING_RADIUS = 3.4;
/** A doorway a robot fits through, in each of the four walls. */
export const DOOR = { w: 2.6, h: 3.4 };
/** How wide and tall the testing corridors are. */
export const CORRIDOR = { w: 3.2, h: 4.0, len: 13.0 };

export const CAST = ['VIC', 'SAM', 'JO', 'KIT', 'ROO', 'ALI', 'MO', 'BEN'];
/** Metres a second. Slower than the game's walk — this is an entrance, not a commute. */
export const WALK_SPEED = 1.35;
/** Seconds between one contestant being announced and the next. */
export const STAGGER = 1.55;
/** How long a nameplate holds once the robot is through the door. */
export const PLATE_HOLD = 3.2;

/**
 * The move, as data, so `premiere-stage` P3 can hold both ends inside the room box without a
 * browser. Three separate renders were spent discovering a camera parked in a wall; the numbers
 * are four floats and the room is four floats, so the check is arithmetic.
 */
export const CAM_KEYS = Object.freeze({
  a: [11.0, 7.6, 7.6], b: [8.6, 5.4, 6.6],
  aimA: [0, 1.4, 0], aimB: [0, 0.95, 0],
  sweep: [5.6, 1.45, 5.6],
});

/** The four walls a robot can come through, and which way is "into the room" from each. */
export const DOORS = [
  { id: 'window', x: R.x0, z: 0, inward: [1, 0], along: [0, 1] },
  { id: 'mirror', x: R.x1, z: 0, inward: [-1, 0], along: [0, 1] },
  { id: 'end', x: 0, z: R.z0, inward: [0, 1], along: [1, 0] },
  { id: 'near', x: 0, z: R.z1, inward: [0, -1], along: [1, 0] },
];

export default async function view(args = {}) {
  const qs = new URLSearchParams(location.search);
  const engine = await estate({
    cameraPos: [11.0, 7.6, 7.6], target: [0, 1.4, 0], fov: 52, far: 90,
    orbit: false, envIntensity: 1.0,
  });
  const scene = engine.scene;
  scene.environment = ballroomEnv(engine.renderer);
  scene.environmentIntensity = 1.55;
  scene.background = new THREE.Color(0x05070c);

  const mats = await estateMaterials();
  const stone = mats.stone;
  const M = {
    wall: mats.boiserie, gilt: mats.gilt, frieze: mats.giltFrieze, stone,
    ceil: mats.stone, glass: mats.clearGlass, wintrim: mats.stone,
    dark: new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.95, metalness: 0 }),
  };
  const K = { wall: 'wall', mould: 'gilt', cornice: 'gilt', skirt: 'gilt', trim: 'gilt', leaf: 'wall' };

  // ---------------------------------------------------------------- the room
  const bin = new GeoBin();
  /**
   * ⚠️ THE DOORWAYS ARE `cuts`, NOT GEOMETRY THIS FILE SUBTRACTS. `ballroomPlan` takes an opening
   * per wall in WORLD coordinates and `wallRun` cuts it — the same path `room.js` feeds its
   * connectors through. Punching holes here by hand would give four doorways with no reveals, no
   * skirting return and no lintel, which is exactly how a hole reads as a bug.
   */
  const cut = (u) => [{ u, w: DOOR.w, y0: 0, y1: DOOR.h }];
  const PLAN = ballroomPlan({
    ...R, split: STOREY, galleryY: 5.2,
    bays: { window: 8, mirror: 6, end: 8, near: 8 },
    arches: [{ x: 0, w: 5.2, h: 5.2, spring: 2.6, t: 0.30 }],
    cuts: { window: cut(0), mirror: cut(0), near: cut(0) },   // the end wall already has its arch
  });
  ballroomOrder(bin, { plan: PLAN, keys: K, parts: { mirrors: false, balustrade: false } });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0 + 2, R.z1 - R.z0 + 2), mats.marbleChequer);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  {
    const uv = floor.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 3);
  }
  scene.add(floor);

  // ---------------------------------------------------------------- the corridors
  /**
   * A corridor against each wall: floor, back wall, two returns, ceiling. Four boxes, one
   * material, no ornament — they are here so a doorway has somewhere to come from.
   */
  const corridors = new THREE.Group();
  corridors.name = 'test-corridors';
  const slab = (w, h, d, x, y, z, ry = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), stone);
    m.position.set(x, y, z); m.rotation.y = ry;
    m.castShadow = false; m.receiveShadow = true;
    return m;
  };
  for (const d of DOORS) {
    const g = new THREE.Group();
    const out = CORRIDOR.w;                       // how far the corridor reaches outside the wall
    const axisX = Math.abs(d.inward[0]) > 0.5;
    const cx = d.x - d.inward[0] * (out / 2 + 0.35);
    const cz = d.z - d.inward[1] * (out / 2 + 0.35);
    const L = CORRIDOR.len;
    // floor + ceiling
    g.add(slab(axisX ? out : L, 0.12, axisX ? L : out, cx, -0.06, cz));
    g.add(slab(axisX ? out : L, 0.12, axisX ? L : out, cx, CORRIDOR.h, cz));
    // the far wall of the corridor, parallel to the ballroom wall
    const fx = d.x - d.inward[0] * (out + 0.35), fz = d.z - d.inward[1] * (out + 0.35);
    g.add(slab(axisX ? 0.3 : L, CORRIDOR.h, axisX ? L : 0.3, fx, CORRIDOR.h / 2, fz));
    // the two ends, so it is a corridor and not a shelf
    for (const s of [-1, 1]) {
      const ex = cx + d.along[0] * s * (L / 2), ez = cz + d.along[1] * s * (L / 2);
      g.add(slab(axisX ? out : 0.3, CORRIDOR.h, axisX ? 0.3 : out, ex, CORRIDOR.h / 2, ez));
    }
    corridors.add(g);
  }
  scene.add(corridors);

  // ---------------------------------------------------------------- the chairs
  const ring = chairCircle({
    count: 8, radius: RING_RADIUS, cx: 0, cz: 0, y: 0,
    material: mats.walnut ?? mats.boiserie, idPrefix: 'premiere',
  });
  scene.add(ring.mesh);

  // ---------------------------------------------------------------- light
  const key = spotKey({
    position: [0, 8.6, 0], target: [0, 0.9, 0], intensity: 260, distance: 22,
    angle: 0.66, penumbra: 0.5, decay: 1.6, mapSize: 2048, radius: 4,
  });
  scene.add(key, key.target);
  scene.add(bounceFill({ warm: 0.34, cold: 0.20, up: 0.16 }));
  // Two practicals down the long axis, so the corridors are not black rectangles.
  for (const s of [-1, 1]) {
    const p = new THREE.PointLight(0xffb877, 26, 17, 2);
    p.position.set(s * 9.0, 3.1, 0);
    scene.add(p);
  }

  const meshes = bin.build(M, { noCast: ['glass', 'ceil', 'wintrim'] });
  for (const m of meshes) scene.add(m);

  // ---------------------------------------------------------------- the cast
  const robotMats = unit4hMaterials({});
  const cast = [];
  for (let i = 0; i < 8; i++) {
    const seat = ring.seats[i];
    const door = DOORS[i % DOORS.length];
    const lane = i < 4 ? -1 : 1;                    // two per corridor, side by side
    // Start well down the corridor, walk to the doorway, then to a spot just outside the chair.
    const startX = door.x - door.inward[0] * 4.6 + door.along[0] * lane * 1.5;
    const startZ = door.z - door.inward[1] * 4.6 + door.along[1] * lane * 1.5;
    const doorX = door.x + door.inward[0] * 0.5;
    const doorZ = door.z + door.inward[1] * 0.5;
    // Approach the chair from outside the ring so nobody walks across the middle of the circle.
    const outAng = Math.atan2(seat.x, seat.z);
    const apX = Math.sin(outAng) * (RING_RADIUS + 1.35);
    const apZ = Math.cos(outAng) * (RING_RADIUS + 1.35);

    let avatar = null;
    try {
      avatar = await engine.work(createMeshAvatar({ height: 1.7, materials: robotMats }));
    } catch (e) {
      console.error('[premiere] avatar failed', e);
    }
    if (!avatar) continue;
    avatar.root.position.set(startX, 0, startZ);
    scene.add(avatar.root);

    cast.push({
      i, name: CAST[i], avatar, seat,
      path: [{ x: startX, z: startZ }, { x: doorX, z: doorZ }, { x: apX, z: apZ },
        { x: seat.x, z: seat.z }],
      leg: 0, t0: 0.6 + i * STAGGER, seated: false, sitBlend: 0,
      plate: makePlate(CAST[i]),
      entered: false, plateT: 0,
      bones: findSitBones(avatar.root),
    });
    scene.add(cast[cast.length - 1].plate);
  }

  /**
   * 🚨 THE NAMEPLATE IS A CANVAS SPRITE, NOT A DOM OVERLAY, AND THAT IS THE POINT OF THIS SCENE.
   * The rail on the television already carries every name as text. What the pre-show is for is
   * attaching a name to a BODY — so the plate has to be in the room, over the right robot's head,
   * moving with them. A caption at the bottom of the frame teaches nobody which robot is Kit.
   */
  function makePlate(name) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(9,11,16,0.88)';
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#e0b23c'; g.lineWidth = 6;
    g.strokeRect(3, 3, 506, 122);
    g.fillStyle = '#f2f4f8';
    g.font = '600 62px ui-sans-serif, system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.letterSpacing = '10px';
    g.fillText(name, 256, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.scale.set(1.7, 0.42, 1);
    sp.renderOrder = 900;
    sp.material.opacity = 0;
    return sp;
  }

  /** The bones a seated pose needs, plus the feet — a bone's direction is toward its CHILD. */
  function findSitBones(root) {
    const want = {
      hips: 'Hips', upL: 'LeftUpLeg', upR: 'RightUpLeg',
      loL: 'LeftLeg', loR: 'RightLeg', ftL: 'LeftFoot', ftR: 'RightFoot',
    };
    const out = {};
    root.traverse((o) => {
      if (!o.isBone) return;
      for (const [k, n] of Object.entries(want)) if (o.name === n || o.name.endsWith(':' + n)) out[k] = o;
    });
    return out;
  }

  // ---------------------------------------------------------------- the sequence
  let t = 0;
  const _v = new THREE.Vector3();

  /**
   * ⏩ THE SEQUENCE IS A PURE FUNCTION OF `dt`, SO IT CAN BE SEEKED WITHOUT RENDERING.
   *
   * The cold open runs twenty-two seconds, which is thirteen hundred rendered frames — half an
   * hour on a machine with no GPU, per screenshot. Nothing in `step` touches the renderer: it
   * moves positions, blends bone rotations and advances the animation mixer, all of which are
   * arithmetic. So `window.__rrr.premiereSeek(14)` fast-forwards the whole scene in milliseconds
   * and the capture renders exactly one frame of it.
   *
   * ⚠️ SEEK USES THE SAME `step` THE LOOP DOES. A second "fast" path would drift from the real
   * one and every frame captured through it would be a picture of a scene nobody plays.
   */
  function step(dt) {
    t += dt;
    for (const c of cast) {
      const a = c.avatar;
      let speed = 0;

      // The sweep is about the POSE, so put everyone in their chair and skip the walk entirely.
      if (SWEEP && !c.seated) {
        c.seated = true; c.entered = true; c.leg = c.path.length - 1;
        a.root.position.set(c.seat.x, 0, c.seat.z);
        a.root.rotation.y = Math.atan2(-c.seat.x, -c.seat.z);
      }
      if (t >= c.t0 && !c.seated) {
        const target = c.path[c.leg + 1];
        const dx = target.x - a.root.position.x, dz = target.z - a.root.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.14) {
          c.leg++;
          if (c.leg >= c.path.length - 1) c.seated = true;
        } else {
          speed = WALK_SPEED;
          const step = Math.min(d, speed * dt);
          a.root.position.x += (dx / d) * step;
          a.root.position.z += (dz / d) * step;
          // Face the way you are walking; on the last leg, turn to face the middle instead.
          const wantYaw = c.leg >= c.path.length - 2
            ? Math.atan2(-a.root.position.x, -a.root.position.z)
            : Math.atan2(dx, dz);
          a.root.rotation.y = angleLerp(a.root.rotation.y, wantYaw, 1 - Math.exp(-7 * dt));
        }
        // The nameplate lights the moment they are through the door.
        if (!c.entered && c.leg >= 1) { c.entered = true; c.plateT = 0; }
      }

      a.update(dt, { speed, runAt: 3.4 });

      /**
       * ⚠️ THE POSE IS APPLIED AFTER `update`, WHICH IS THE ONLY ORDER THAT WORKS. The mixer
       * writes every bone quaternion inside `update`; a pose set before it is overwritten in the
       * same frame and the robot stands there looking fine in the debugger and wrong on screen.
       */
      if (c.seated) {
        c.sitBlend = Math.min(1, c.sitBlend + dt / 0.75);
        sit(c, c.sitBlend);
        a.root.rotation.y = angleLerp(a.root.rotation.y,
          Math.atan2(-a.root.position.x, -a.root.position.z), 1 - Math.exp(-7 * dt));
      }

      // plate follows the head and fades
      c.plate.position.set(a.root.position.x, SWEEP ? 3.05 : 2.32, a.root.position.z);
      if (c.entered) {
        c.plateT += dt;
        const up = Math.min(1, c.plateT / 0.35);
        const down = Math.max(0, 1 - Math.max(0, c.plateT - PLATE_HOLD) / 0.6);
        c.plate.material.opacity = Math.min(up, down);
      }
    }
  }
  engine.onUpdate(step);

  /**
   * Fold the legs and drop to the seat. See this file's header: a pose, not a clip.
   *
   * 🚨 THE HIPS DROP BY A FRACTION OF THEIR REST HEIGHT, NOT BY METRES. `Hips.position` is in the
   * SKELETON's units, and this rig is imported and scaled — subtracting "0.42" from it, as the
   * first version did, moved the pelvis by four millimetres. The legs folded correctly and the
   * robot stood there with its thighs sticking out, which at chair height behind a chair back
   * reads as simply standing. A ratio cannot be wrong about units.
   *
   * `SIT_DROP` 0.52 puts a 1.7 m robot's pelvis at roughly seat height with the shins vertical.
   */
  const SIT_DROP = 0.52;
  const SWEEP = qs.get('sitsweep') === '1';

  /**
   * 🚨 THE POSE AIMS BONES, IT DOES NOT SET EULER ANGLES ON THEM.
   *
   * The bone names here are mixamo's but the rig is a custom robot, so "which local axis swings a
   * thigh forward" is a question about the asset — and three renders went on guessing at it, each
   * one seven minutes on a software rasteriser. Two of the eight guesses looked plausible from
   * across a ballroom and neither was checkable at that distance.
   *
   * `aimBone` sidesteps the question entirely: a bone's direction is the vector from it to its
   * CHILD, and the rotation that takes one unit vector to another is `setFromUnitVectors`. So the
   * thigh is told to point forward and the shin is told to point down, in WORLD space, and the
   * local axes never come into it. It works on any rig, in any rest pose, with no sweep.
   */
  const _bq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _rq = new THREE.Quaternion();
  const _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _dir = new THREE.Vector3();
  const DOWN = new THREE.Vector3(0, -1, 0);

  /** Rotate `bone` so the line from it to `child` points along `want` (world space). */
  function aimBone(bone, child, want, k) {
    if (!bone || !child || !bone.parent) return;
    bone.updateWorldMatrix(true, false);
    child.updateWorldMatrix(true, false);
    bone.getWorldPosition(_p1);
    child.getWorldPosition(_p2);
    _dir.subVectors(_p2, _p1);
    if (_dir.lengthSq() < 1e-9) return;
    _dir.normalize();
    _rq.setFromUnitVectors(_dir, want);
    bone.getWorldQuaternion(_bq);
    bone.parent.getWorldQuaternion(_pq).invert();
    // local = parentWorld⁻¹ · delta · boneWorld
    bone.quaternion.slerp(_pq.multiply(_rq).multiply(_bq), k);
  }

  const _fwd = new THREE.Vector3(), _thigh = new THREE.Vector3();
  function sit(c, k) {
    const b = c.bones;
    const yaw = c.avatar.root.rotation.y;
    // "+Z forward" is this project's convention — `player.js:1806` uses the same pair.
    _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));
    // A thigh that is dead level reads as a mannequin; drop the knee slightly.
    _thigh.copy(_fwd).setY(-0.18).normalize();

    // Thighs first: aiming a thigh moves its shin, so the shin has to be aimed afterwards.
    aimBone(b.upL, b.loL, _thigh, k);
    aimBone(b.upR, b.loR, _thigh, k);
    aimBone(b.loL, b.ftL, DOWN, k);
    aimBone(b.loR, b.ftR, DOWN, k);

    /**
     * The pelvis drops by a FRACTION of its rest height, never by metres: `Hips.position` is in
     * the skeleton's own units and this rig is imported and scaled. Subtracting "0.42" from it,
     * as the first version did, moved the pelvis four millimetres and left the robot standing
     * with its thighs sticking out — which behind a chair back reads as simply standing.
     */
    if (b.hips) {
      if (b.hips.userData._y0 === undefined) b.hips.userData._y0 = b.hips.position.y;
      b.hips.position.y = b.hips.userData._y0 * (1 - SIT_DROP * k);
    }
  }

  const angleLerp = (a, b, k) => {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
  };

  // ---------------------------------------------------------------- camera
  /**
   * A slow push toward the ring. Fixed, not orbiting: `?at=` has to land on the same frame every
   * time or nothing about this scene can be compared between rounds.
   */
  /**
   * 🚨 BOTH ENDS OF THE MOVE ARE INSIDE THE ROOM. The ballroom is 26 x 16 — x -13..13, z -8..8 —
   * and the first draft pushed in from z 17 to z 11.4, i.e. from outside the near wall to inside
   * the near CORRIDOR. It rendered a perfectly exposed close-up of stone. A camera parked outside
   * the box it is filming is this project's most-repeated framing bug and it costs a full render
   * every time; the box is four numbers, so check against them.
   *
   * Three-quarter rather than head-on: the ring is symmetrical, and a symmetrical camera on a
   * symmetrical subject reads as an elevation drawing.
   */
  const CAM_A = new THREE.Vector3(...CAM_KEYS.a), CAM_B = new THREE.Vector3(...CAM_KEYS.b);
  const AIM_A = new THREE.Vector3(...CAM_KEYS.aimA), AIM_B = new THREE.Vector3(...CAM_KEYS.aimB);
  engine.onUpdate(() => {
    if (SWEEP) {
      // Low and off a corner: the sweep is a question about knees, and knees are invisible from
      // above. Inside the box — see `warnIfOutside`.
      engine.camera.position.set(...CAM_KEYS.sweep);
      engine.camera.lookAt(0, 0.72, 0);
      warnIfOutside();
      return;
    }
    const k = Math.min(1, t / 22);
    const e = 1 - Math.pow(1 - k, 3);
    engine.camera.position.lerpVectors(CAM_A, CAM_B, e);
    _v.lerpVectors(AIM_A, AIM_B, e);
    engine.camera.lookAt(_v);
    warnIfOutside();
  });

  /**
   * 🚨 THE CAMERA-OUTSIDE-THE-ROOM CHECK, BECAUSE I HAVE NOW SHIPPED IT THREE TIMES.
   *
   * The ballroom is x -13..13, z -8..8. A camera at z 11.4, then z 17, then z 8.2 all rendered
   * beautifully exposed close-ups of stone, and each one cost a full software render to discover.
   * Nothing throws when a camera is inside a wall; the frame just looks like a texture test. This
   * says so in the console the first time it happens, which is one line against seven minutes.
   */
  let warned = false;
  function warnIfOutside() {
    if (warned) return;
    const p = engine.camera.position;
    const out = p.x < R.x0 || p.x > R.x1 || p.z < R.z0 || p.z > R.z1 || p.y < 0 || p.y > R.h;
    if (!out) return;
    warned = true;
    console.warn(`[premiere] CAMERA IS OUTSIDE THE BALLROOM at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, `
      + `${p.z.toFixed(1)}). The room is x ${R.x0}..${R.x1}, z ${R.z0}..${R.z1}, y 0..${R.h}. `
      + 'The frame you are about to look at is the inside of a wall.');
  }

  window.__rrr = window.__rrr || {};
  /** Advance the cold open by `secs` of sequence without drawing anything. See `step`. */
  window.__rrr.premiereSeek = (secs) => {
    const h = 1 / 30;
    for (let s = 0; s < secs; s += h) step(h);
    return t;
  };
  window.__rrr.premiere = () => ({
    t, seated: cast.filter((c) => c.seated).length, entered: cast.filter((c) => c.entered).length,
    bones: cast[0] ? Object.keys(cast[0].bones) : [],
    boneNames: cast[0] ? sampleBoneNames(cast[0].avatar.root) : [],
    cast: cast.map((c) => ({ name: c.name, leg: c.leg, seated: c.seated,
      x: +c.avatar.root.position.x.toFixed(2), z: +c.avatar.root.position.z.toFixed(2) })),
  });

  /** Diagnostic only: what the skeleton actually calls its bones. */
  function sampleBoneNames(root) {
    const out = [];
    root.traverse((o) => { if (o.isBone && out.length < 40) out.push(o.name); });
    return out;
  }

  engine.markReady();
  engine.start();
  return engine;
}
