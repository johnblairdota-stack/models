import * as THREE from 'three';
import { estate } from './_studio.js';
import { WallField } from '../destruction/wall.js';
import { buildTestRoom } from '../game/room.js';
import { PANELS } from '../game/spaces.js';
import { chairCircle } from '../world/props.js';
import { estateMaterials } from '../world/materials-local.js';
import { createMeshAvatar } from '../characters/mesh-avatar.js';
import { unit4hMaterials } from '../materials/surfaces/robot.js';
import { makeLightRig } from './game.js';

/**
 * 🎬 **PARTY.PREMIERE — eight robots walk into the ballroom and take a chair.**
 *
 *   ?view=party.premiere              the whole cold open
 *   ?view=party.premiere&sitsweep=1   everyone seated at once, for judging the pose
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THIS IS THE HOUSE'S BALLROOM, NOT A COPY OF IT.
 * ---------------------------------------------------------------------------------------------
 * The first version of this scene rebuilt the SHOWCASE ballroom — `room-ballroom.js`'s standalone
 * 26 x 16 room, with its own floor, its own lights and four invented corridors bolted to the
 * outside. It looked right and it was the wrong room: the real one is **27.2 x 15.3**, it has a
 * six-column colonnade across its middle at z -0.65, its three doorways are all on the NORTH wall,
 * and its lighting is a per-space table in `spaces.js` rather than anything this file chooses.
 *
 * So it builds through `buildTestRoom` and stages inside `room.spaces` `ballroom`. The corridors
 * are not built here because **the house already has them** — D4 comes from the west study, D5
 * from the service passage, D6 from the east study, and a robot walking through one is walking
 * through the same doorway the game walks through. Nothing about this scene is a reconstruction,
 * which means nothing about it can disagree with the room the show is played in.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ THE CAST ARE ANIMATED, NOT SIMULATED, AND THAT IS THE POINT OF A COLD OPEN.
 * ---------------------------------------------------------------------------------------------
 * Each robot is a `createMeshAvatar` whose root is moved along a path. There is no `Player`, no
 * `collide`, no noise and no Hunter — an entrance is choreography, and choreography that can get
 * wedged in a doorway is choreography with a bug in it. (`views/expedition.js` records a runner
 * doing exactly that at D4 under real physics; that is a game problem and it is not this one.)
 *
 * 🚨 THERE IS NO SIT CLIP IN THE CHARACTER SET, SO THE SEATED POSE IS POSED BY HAND. `sit()`
 * aims bones rather than setting Euler angles — see its own note. It is a pose and not an
 * animation: it will not survive a camera at knee height and the hands do not find the arms of
 * the chair. **A real sit-down clip is the asset this scene wants next.**
 */

/** Filled from the built room, so nothing here restates a coordinate the level owns. */
export const BALLROOM_ID = 'ballroom';

/**
 * 🏛️ THE RING SITS IN THE SOUTH HALF, CLEAR OF THE COLONNADE.
 * `spaces.js` puts six columns across the ballroom at z -0.65, and a ring on the room's centre
 * seats two robots inside two piers. The south half is 7.65 m deep, so a 3.0 m ring centred at
 * z 3.0 puts its nearest chair 4.26 m from the closest column — clear of a 0.95 m pier plus a
 * seated robot — and leaves 1.0 m to the south wall. `premiere-stage` P1b holds both numbers;
 * the first attempt (3.3 m at z 2.4) went straight through the columns at x ±2.2 and the gate
 * caught it before a single frame was rendered.
 */
export const RING = { cx: 0, cz: 3.0, radius: 3.0 };

export const CAST = ['VIC', 'SAM', 'JO', 'KIT', 'ROO', 'ALI', 'MO', 'BEN'];
/** Metres a second. Slower than the game's walk — this is an entrance, not a commute. */
export const WALK_SPEED = 1.35;
/** Seconds between one contestant being announced and the next. */
export const STAGGER = 1.55;
/** How long a nameplate holds once its robot is through the door. */
export const PLATE_HOLD = 3.2;
/** How far into the room a robot walks before it turns toward its chair. */
export const DOOR_CLEAR = 1.9;

/**
 * The move, as data, so `premiere-stage` P3 can hold both ends inside the room without a browser.
 * Three renders were spent discovering a camera parked in a wall; the room is four floats and so
 * is the camera, so the check is arithmetic.
 */
export const CAM_KEYS = Object.freeze({
  a: [12.6, 6.6, 6.6], b: [9.4, 4.0, 6.2],
  aimA: [0, 1.4, 3.0], aimB: [0, 0.9, 3.0],
  // Low, south-east, and on the ring's own side of the colonnade — a sweep shot through six
  // columns is a sweep shot of six columns.
  sweep: [7.5, 1.5, 6.6],
});

export default async function view(args = {}) {
  const qs = new URLSearchParams(location.search);
  const SWEEP = qs.get('sitsweep') === '1';
  const engine = await estate({
    cameraPos: CAM_KEYS.a, target: CAM_KEYS.aimA, fov: 52, far: 90,
    orbit: false, envIntensity: 3.20,
  });
  const scene = engine.scene;
  const rng = engine.rng;

  // ---------------------------------------------------------------- the house
  const wallField = new WallField({ authority: true });
  const room = await engine.work(buildTestRoom(engine, { wallField, panels: PANELS }));
  scene.add(room.root);
  const ball = room.spaces.find((s) => s.id === BALLROOM_ID);
  if (!ball) throw new Error('[premiere] the built room has no ballroom');

  /**
   * 💡 THE BALLROOM'S OWN LIGHTS. `spaces.js` carries a per-space table — key, two practicals, a
   * cool rim and the hemisphere ground colour — and `makeLightRig` positions the one rig from it.
   * `game.js` owns that function and it is exported rather than copied: a second rig would make
   * the pre-show a visibly different room from the one the game is played in.
   */
  const key = new THREE.SpotLight(0xffdcb4, 150, 34, 0.88, 0.62, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(engine.quality.shadowMap, engine.quality.shadowMap);
  key.shadow.camera.near = 0.6; key.shadow.camera.far = 40;
  key.shadow.bias = -0.0009; key.shadow.normalBias = 0.03;
  const warmA = new THREE.PointLight(0xffb271, 18, 13, 2);
  const warmB = new THREE.PointLight(0x6f8fbe, 42, 24, 2);
  const cool = new THREE.PointLight(0xa8ccf4, 46, 10, 2);
  const fill = new THREE.HemisphereLight(0x6f7d96, 0x3a2a1c, 4.60);
  scene.add(key, key.target, warmA, warmB, cool, fill);
  makeLightRig({ key, warmA, warmB, cool, fill }).snapTo(ball);

  /**
   * 🎥 THE SHOW LIGHT — the one light in this scene that is NOT the house's, and it is diegetic.
   *
   * `spaces.js` lights the ballroom as a horror level, which is correct and is what the game
   * plays in: the first render of this scene was a beautiful, almost unreadable room with eight
   * robots lost in it. But a reality show rigs a key over the circle before it shoots the circle,
   * and the audience is meant to be able to tell eight contestants apart. So the pre-show brings
   * its own lamp, aimed at the ring and nothing else — which is why everything outside the ring
   * stays as dark as the game intends.
   */
  const showKey = new THREE.SpotLight(0xffe3bd, 620, 20, 0.72, 0.62, 1.5);
  showKey.position.set(RING.cx, 7.6, RING.cz);
  showKey.target.position.set(RING.cx, 0.6, RING.cz);
  showKey.castShadow = true;
  showKey.shadow.mapSize.set(1024, 1024);
  showKey.shadow.camera.near = 0.6; showKey.shadow.camera.far = 20;
  showKey.shadow.bias = -0.0011; showKey.shadow.normalBias = 0.026;
  scene.add(showKey, showKey.target);
  // A soft ring of bounce so the far side of every robot is not a silhouette.
  const showFill = new THREE.PointLight(0xbcd2ef, 26, 14, 2);
  showFill.position.set(RING.cx, 2.6, RING.cz);
  scene.add(showFill);

  // ---------------------------------------------------------------- the chairs
  const mats = await estateMaterials();
  const ring = chairCircle({
    count: 8, radius: RING.radius, cx: RING.cx, cz: RING.cz, y: 0,
    material: mats.walnut ?? mats.boiserie, idPrefix: 'premiere', rng: () => 0.5,
  });
  ring.mesh.castShadow = true; ring.mesh.receiveShadow = true;
  scene.add(ring.mesh);

  /**
   * 🚪 THE ENTRANCES ARE THE HOUSE'S OWN DOORWAYS, READ OFF THE BUILT ROOM.
   * All three sit on the north wall at z -8.45: D4 from the west study, D5 from the service
   * passage, D6 from the east study. Reading them from `room.portals()` rather than restating the
   * numbers means a level change moves the entrances instead of breaking them.
   */
  const doors = room.portals()
    .filter((p) => (p.a === BALLROOM_ID || p.b === BALLROOM_ID) && p.centre)
    .map((p) => ({ id: p.id, x: p.centre.x, z: p.centre.z, from: p.a === BALLROOM_ID ? p.b : p.a }))
    .sort((a, b) => a.x - b.x);
  if (!doors.length) throw new Error('[premiere] the ballroom has no open doorway to walk through');

  // ---------------------------------------------------------------- the cast
  const robotMats = unit4hMaterials({});
  const cast = [];
  for (let i = 0; i < CAST.length; i++) {
    const seat = ring.seats[i];
    const door = doors[i % doors.length];
    const lane = (Math.floor(i / doors.length) % 2) ? 0.62 : -0.62;
    // Into the room along +z: every ballroom doorway is on the north wall.
    const inZ = ball.z0 > door.z ? 1 : -1;
    const start = { x: door.x + lane, z: door.z - inZ * 3.4 };
    const through = { x: door.x, z: door.z + inZ * DOOR_CLEAR };
    // Come at the chair from outside the ring, so nobody crosses the middle of the circle.
    const ang = Math.atan2(seat.x - RING.cx, seat.z - RING.cz);
    const approach = { x: RING.cx + Math.sin(ang) * (RING.radius + 1.5),
      z: RING.cz + Math.cos(ang) * (RING.radius + 1.5) };

    let avatar = null;
    try {
      avatar = await engine.work(createMeshAvatar({ height: 1.7, materials: robotMats }));
    } catch (e) { console.error('[premiere] avatar failed', e); }
    if (!avatar) continue;
    avatar.root.position.set(start.x, 0, start.z);
    scene.add(avatar.root);

    const c = {
      i, name: CAST[i], avatar, seat, door: door.id,
      path: [start, through, approach, { x: seat.x, z: seat.z }],
      leg: 0, t0: 0.6 + i * STAGGER, seated: false, sitBlend: 0,
      entered: false, plateT: 0, plate: makePlate(CAST[i]),
      bones: findSitBones(avatar.root),
    };
    cast.push(c);
    scene.add(c.plate);
  }

  /**
   * 🚨 THE NAMEPLATE IS IN THE ROOM, NOT ON THE FRAME, AND THAT IS THE POINT OF THIS SCENE.
   * The rail on the television already carries every name as text. What the cold open is for is
   * attaching a name to a BODY — so the plate rides over the right robot's head and moves with
   * them. A caption at the bottom of the screen teaches nobody which robot is Kit.
   */
  function makePlate(name) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(9,11,16,0.9)'; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#e0b23c'; g.lineWidth = 7; g.strokeRect(4, 4, 504, 120);
    g.fillStyle = '#f2f4f8';
    g.font = '600 66px ui-sans-serif, system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.letterSpacing = '12px';
    g.fillText(name, 256, 70);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sp.scale.set(1.95, 0.49, 1);
    sp.renderOrder = 900;
    sp.material.opacity = 0;
    return sp;
  }

  /** The bones a seated pose needs, plus the feet — a bone's direction is toward its CHILD. */
  function findSitBones(root) {
    const want = { hips: 'Hips', upL: 'LeftUpLeg', upR: 'RightUpLeg',
      loL: 'LeftLeg', loR: 'RightLeg', ftL: 'LeftFoot', ftR: 'RightFoot' };
    const out = {};
    root.traverse((o) => {
      if (!o.isBone) return;
      for (const [k, n] of Object.entries(want)) if (o.name === n || o.name.endsWith(':' + n)) out[k] = o;
    });
    return out;
  }

  // ---------------------------------------------------------------- the seated pose
  const SIT_DROP = 0.52;
  const _bq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _rq = new THREE.Quaternion();
  const _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3(), _dir = new THREE.Vector3();
  const DOWN = new THREE.Vector3(0, -1, 0);

  /**
   * Rotate `bone` so the line from it to `child` points along `want`, in world space.
   *
   * 🚨 IT AIMS BONES RATHER THAN SETTING EULER ANGLES ON THEM. The bone names are mixamo's but
   * the rig is a custom robot, so "which local axis swings a thigh forward" is a question about
   * the asset — three renders went on guessing it, and two of eight guesses looked plausible from
   * across a ballroom while neither was checkable at that distance. A bone's direction is the
   * vector to its child, and `setFromUnitVectors` gives the rotation between two vectors, so the
   * local axes never come into it. Works on any rig, in any rest pose.
   */
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
    bone.quaternion.slerp(_pq.multiply(_rq).multiply(_bq), k);
  }

  const _fwd = new THREE.Vector3(), _thigh = new THREE.Vector3();
  function sit(c, k) {
    const b = c.bones;
    const yaw = c.avatar.root.rotation.y;
    _fwd.set(Math.sin(yaw), 0, Math.cos(yaw));          // "+Z forward", as `player.js:900` has it
    _thigh.copy(_fwd).setY(-0.18).normalize();          // a dead-level thigh reads as a mannequin
    aimBone(c.bones.upL, b.loL, _thigh, k);             // thighs first: aiming one moves its shin
    aimBone(b.upR, b.loR, _thigh, k);
    aimBone(b.loL, b.ftL, DOWN, k);
    aimBone(b.loR, b.ftR, DOWN, k);
    /**
     * The pelvis drops by a FRACTION of its rest height, never by metres: `Hips.position` is in
     * the skeleton's own units and this rig is imported and scaled. Subtracting "0.42" from it
     * moved the pelvis four millimetres and left the robot standing with its thighs out — which
     * behind a chair back reads as simply standing.
     */
    if (b.hips) {
      if (b.hips.userData._y0 === undefined) b.hips.userData._y0 = b.hips.position.y;
      b.hips.position.y = b.hips.userData._y0 * (1 - SIT_DROP * k);
    }
  }

  // ---------------------------------------------------------------- the sequence
  let t = 0;
  const _camDir = new THREE.Vector3(), _aim = new THREE.Vector3();

  /**
   * ⏩ THE SEQUENCE IS A PURE FUNCTION OF `dt`, SO IT CAN BE SEEKED WITHOUT RENDERING.
   * The cold open runs about half a minute, which is seventeen hundred rendered frames and half
   * an hour per screenshot on a machine with no GPU. Nothing in `step` touches the renderer, so
   * `window.__rrr.premiereSeek(20)` fast-forwards in milliseconds and the capture renders one
   * frame of it. Seek calls the SAME `step` the loop does — a second fast path would drift, and
   * every frame captured through it would be a picture of a scene nobody plays.
   */
  function step(dt) {
    t += dt;
    for (const c of cast) {
      const a = c.avatar;
      let speed = 0;

      // The sweep is about the POSE, so put everyone in a chair and skip the walk entirely.
      if (SWEEP && !c.seated) {
        c.seated = true; c.entered = true; c.leg = c.path.length - 1;
        a.root.position.set(c.seat.x, 0, c.seat.z);
        a.root.rotation.y = Math.atan2(RING.cx - c.seat.x, RING.cz - c.seat.z);
      }

      if (t >= c.t0 && !c.seated) {
        const target = c.path[c.leg + 1];
        const dx = target.x - a.root.position.x, dz = target.z - a.root.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.16) {
          c.leg++;
          if (c.leg >= c.path.length - 1) c.seated = true;
        } else {
          speed = WALK_SPEED;
          const stepLen = Math.min(d, speed * dt);
          a.root.position.x += (dx / d) * stepLen;
          a.root.position.z += (dz / d) * stepLen;
          const wantYaw = c.leg >= c.path.length - 2
            ? Math.atan2(RING.cx - a.root.position.x, RING.cz - a.root.position.z)
            : Math.atan2(dx, dz);
          a.root.rotation.y = angleLerp(a.root.rotation.y, wantYaw, 1 - Math.exp(-7 * dt));
        }
        if (!c.entered && c.leg >= 1) { c.entered = true; c.plateT = 0; }
      }

      a.update(dt, { speed, runAt: 3.4 });

      /**
       * ⚠️ THE POSE IS APPLIED AFTER `update`, WHICH IS THE ONLY ORDER THAT WORKS. The mixer
       * writes every bone quaternion inside `update`; a pose set before it is overwritten in the
       * same frame, and the robot stands there looking correct in the debugger.
       */
      if (c.seated) {
        c.sitBlend = Math.min(1, c.sitBlend + dt / 0.75);
        sit(c, c.sitBlend);
        a.root.rotation.y = angleLerp(a.root.rotation.y,
          Math.atan2(RING.cx - a.root.position.x, RING.cz - a.root.position.z), 1 - Math.exp(-7 * dt));
      }

      c.plate.position.set(a.root.position.x, SWEEP ? 2.95 : 2.34, a.root.position.z);
      if (c.entered) {
        c.plateT += dt;
        const up = Math.min(1, c.plateT / 0.35);
        const down = Math.max(0, 1 - Math.max(0, c.plateT - PLATE_HOLD) / 0.6);
        c.plate.material.opacity = Math.min(up, down);
      }
    }
  }
  engine.onUpdate(step);

  const angleLerp = (a, b, k) => {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
  };

  // ---------------------------------------------------------------- camera
  const CAM_A = new THREE.Vector3(...CAM_KEYS.a), CAM_B = new THREE.Vector3(...CAM_KEYS.b);
  const AIM_A = new THREE.Vector3(...CAM_KEYS.aimA), AIM_B = new THREE.Vector3(...CAM_KEYS.aimB);
  engine.onUpdate(() => {
    if (SWEEP) {
      engine.camera.position.set(...CAM_KEYS.sweep);
      engine.camera.lookAt(RING.cx, 0.72, RING.cz);
    } else {
      const k = Math.min(1, t / 24);
      const e = 1 - Math.pow(1 - k, 3);
      engine.camera.position.lerpVectors(CAM_A, CAM_B, e);
      _aim.lerpVectors(AIM_A, AIM_B, e);
      engine.camera.lookAt(_aim);
    }
    warnIfOutside();
    /**
     * 🚨 RESIDENCY FOLLOWS THE CAMERA EVERY FRAME, OR THE ROOM IS EMPTY. `room.setViewpoint` walks
     * portals from where the camera stands and keeps only what can be seen. `views/expedition.js`
     * called it once at startup and the television cut to a perfectly composed frame of nothing.
     */
    engine.camera.getWorldDirection(_camDir);
    room.setViewpoint(engine.camera.position, _camDir, 1 / 60);
  });

  /**
   * 🚨 THE CAMERA-OUTSIDE-THE-ROOM CHECK, BECAUSE I HAVE NOW SHIPPED IT THREE TIMES.
   * Cameras at z 17, z 11.4 and z 8.2 against a wall at z 8 each rendered a beautifully exposed
   * close-up of stone, and each cost a full software render to discover. Nothing throws when a
   * camera is inside a wall. The bounds come from the BUILT room, so they cannot be stale.
   */
  let warned = false;
  function warnIfOutside() {
    if (warned) return;
    const p = engine.camera.position;
    if (p.x > ball.x0 && p.x < ball.x1 && p.z > ball.z0 && p.z < ball.z1 && p.y > 0 && p.y < ball.storey) return;
    warned = true;
    console.warn(`[premiere] CAMERA IS OUTSIDE THE BALLROOM at (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, `
      + `${p.z.toFixed(1)}). The room is x ${ball.x0}..${ball.x1}, z ${ball.z0}..${ball.z1}. `
      + 'The frame you are about to look at is the inside of a wall.');
  }

  window.__rrr = window.__rrr || {};
  window.__rrr.premiereSeek = (secs) => { const h = 1 / 30; for (let s = 0; s < secs; s += h) step(h); return t; };
  window.__rrr.premiere = () => ({
    t, room: { x0: ball.x0, x1: ball.x1, z0: ball.z0, z1: ball.z1 },
    doors: doors.map((d) => `${d.id}(${d.from})`),
    entered: cast.filter((c) => c.entered).length, seated: cast.filter((c) => c.seated).length,
    cast: cast.map((c) => ({ name: c.name, door: c.door, leg: c.leg, seated: c.seated,
      x: +c.avatar.root.position.x.toFixed(2), z: +c.avatar.root.position.z.toFixed(2) })),
  });

  {
    const d = new THREE.Vector3();
    engine.camera.getWorldDirection(d);
    room.setViewpoint(engine.camera.position, d, 1);
  }
  engine.markReady();
  engine.start();
  return engine;
}
