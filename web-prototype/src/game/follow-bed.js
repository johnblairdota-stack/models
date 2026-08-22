import * as THREE from 'three';
import { WallField } from '../destruction/wall.js';
import { buildTestRoom } from './room.js';
import { Player } from './player.js';
import { MOVE } from './rules.js';

/**
 * 🎥 **THE FOLLOW BED — the mansion, a runner walking it, and a camera operator following.**
 *
 * `docs/slices/task-d13-tv-follow.md` §3.2. `docs/design/party-loop.md` line 22: *"The TV plays
 * the run like a reality show following the runner (will the hunter take them?)"*, and line 42:
 * *"TV reality-TV follow camera (limited, produced), not god-view."*
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS IS AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------------------------
 * It is `game.play`'s bed, recomposed for a camera with no player behind it. Same house
 * (`buildTestRoom`), same body (`Player`, i.e. unit4h + `Gait`), same collision, same grade.
 *
 * It is **not** `game.play` and it must never become it: no HUD, no sledge, no gadgets, no
 * hunter, no dig, no input. `views/game.js` stays the art/physics bed and is not edited by this
 * slice — see the slice's §2.0 for why nothing was exported from it. What is private in there
 * and genuinely wanted is `makeLightRig` (L4028), and `followRig` below **carries the
 * technique** rather than importing it: importing `game.js` for 140 lines of light positioning
 * would drag `audio.js`, `gadgets/index.js`, `hud.js` and `hunter-ai.js` onto the TV's critical
 * path.
 *
 * 🚨 **THE TV NEVER GETS THE GUIDE'S VIEW.** `party-loop.md`'s "Do not" list, first item. Three
 * things are refused here structurally rather than by convention, and `harness/
 * party-follow-drive.mjs` D5 asserts all three from outside:
 *   · `room.setLid()` is never called. The ceilings stay on.
 *   · every shot's eye is clamped under the space's storey (`EYE_CEIL_MARGIN`).
 *   · there is no hunter, no marker, no plan and no minimap in this file at all.
 */

/** The four the phone pad already sends (`views/party-phone.js`). */
const THROTTLE_DRIVE = {
  STILL: { move: 0.0, run: false },
  CREEP: { move: 0.45, run: false },
  WALK: { move: 1.0, run: false },
  RUN: { move: 1.0, run: true },
};

/** A shot's eye must stay this far under its space's storey. A camera in the ceiling is a god-view. */
const EYE_CEIL_MARGIN = 1.1;

/** Clear width / clear height the route filter demands. See `room.js` L822 — a route through an
 *  opening the body cannot fit is the exact failure `minW` was written to prevent. */
const ROUTE_MIN_W = 0.90;
const ROUTE_MIN_H = 1.90;

const ARRIVE = 0.55;

/**
 * 💡 **THE LIGHT RIG — five lights, REPOSITIONED, NEVER REBUILT, plus the camera light.**
 *
 * Carried from `views/game.js` `makeLightRig` (L4028) and its block at L201-221, which is not
 * decoration: `numPointLights` is part of three.js's program cache key, so a count the renderer
 * has not compiled for recompiles every visible material. `hunter-ai.js` `_setFlare()` records
 * what learning that cost — a clean 1.28 ms capture became *"execution context destroyed"* with a
 * 2.5 s worst frame.
 *
 * Dropped from the original, because a TV has no use for them: `?aim=box`, `?ceil=`, and the
 * `lightsBox` table they select. Kept exactly: the per-space read, the snapped cone shape, the
 * `decay` fallback to the CONSTRUCTOR value rather than to whatever the last room set (three of
 * six spaces write it; skipping an absent entry leaves `service`, `ballroom` and `chapel`
 * running on whichever study the camera last walked out of), and the lerped hemisphere ground.
 */
function followRig(L) {
  const LERP = 0.35;
  const DECAY0 = { warmA: L.warmA.decay, warmB: L.warmB.decay, cool: L.cool.decay };
  const GROUND0 = L.fill ? L.fill.groundColor.clone() : null;
  const _tmpCol = new THREE.Color();
  const want = {
    key: { pos: new THREE.Vector3(), at: new THREE.Vector3(), i: L.key.intensity },
    warmA: { pos: new THREE.Vector3(), i: L.warmA.intensity },
    warmB: { pos: new THREE.Vector3(), i: L.warmB.intensity },
    cool: { pos: new THREE.Vector3(), i: L.cool.intensity },
    up: GROUND0 ? GROUND0.clone() : null,
  };
  const read = (space) => {
    const s = space?.lights;
    if (!s) return;
    if (want.up) {
      want.up.copy(GROUND0);
      if (s.up != null) want.up.lerp(_tmpCol.setHex(s.up), 1);
    }
    if (s.key) {
      want.key.pos.set(...s.key.pos); want.key.at.set(...s.key.at); want.key.i = s.key.intensity;
      if (s.key.color != null) L.key.color.setHex(s.key.color);
      // Snapped, not lerped: `angle` and `distance` are not interpolated anywhere in three's
      // shadow frustum update, and a lerped cone re-fits the shadow camera every frame.
      if (s.key.angle != null) L.key.angle = s.key.angle;
      if (s.key.penumbra != null) L.key.penumbra = s.key.penumbra;
      if (s.key.dist != null) { L.key.distance = s.key.dist; L.key.shadow.camera.far = s.key.dist + 2; }
      if (s.key.decay != null) L.key.decay = s.key.decay;
    }
    const w = s.warm ?? [];
    for (const [k, d] of [['warmA', w[0]], ['warmB', w[1]]]) {
      if (!d) continue;
      want[k].pos.set(...d.pos); want[k].i = d.intensity;
      if (d.color != null) L[k].color.setHex(d.color);
      if (d.dist != null) L[k].distance = d.dist;
      L[k].decay = d.decay ?? DECAY0[k];
    }
    if (s.cool) {
      want.cool.pos.set(...s.cool.pos); want.cool.i = s.cool.intensity;
      if (s.cool.color != null) L.cool.color.setHex(s.cool.color);
      if (s.cool.dist != null) L.cool.distance = s.cool.dist;
      L.cool.decay = s.cool.decay ?? DECAY0.cool;
    }
  };
  const apply = (a) => {
    L.key.position.lerp(want.key.pos, a);
    L.key.target.position.lerp(want.key.at, a);
    for (const k of ['warmA', 'warmB', 'cool']) L[k].position.lerp(want[k].pos, a);
    if (want.up) L.fill.groundColor.lerp(want.up, a);
  };
  return {
    snapTo(space) { read(space); apply(1); },
    follow(space, dt) { read(space); apply(1 - Math.exp(-dt / (LERP / 3))); },
  };
}

/**
 * 🏃 **THE RUNNER'S ROUTE.**
 *
 * `Player.update`'s `move` is AIM-RELATIVE (`player.js` `_stepGround` L905), so the whole
 * steering problem is one line: put the heading on `aimYaw` and push the stick forward.
 * Collision, sliding, doorway squeeze, the sill step, the foot plant and the arm swing all come
 * from `Player` + `room.collide` for free — which is the entire reason this view is worth
 * building on the bed rather than animating a capsule.
 *
 * ⚠️ **THIS IS A PERFORMANCE, NOT A SIMULATION.** Nothing on the party wire knows where the
 * runner is, because nothing behind the party wire simulates one yet. The slice says so out
 * loud (§7) and so does the PR. Do not let a later reader mistake this for authoritative state.
 */
class RunnerRoute {
  constructor(room, rng) {
    this.room = room;
    this.rng = rng;
    this.legs = [];
    this.target = null;
    this._lastSpaceId = null;
  }

  /** Rooms big enough to walk into and be seen in. Sorted so the pick is seeded, not incidental. */
  _destinations() {
    return this.room.spaces
      .filter((s) => (s.x1 - s.x0) > 3.0 && (s.z1 - s.z0) > 3.0)
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  _pointIn(space) {
    const px = 0.30 + this.rng() * 0.40;      // never the dead centre, never the skirting
    const pz = 0.30 + this.rng() * 0.40;
    return new THREE.Vector3(
      space.x0 + (space.x1 - space.x0) * px, 0,
      space.z0 + (space.z1 - space.z0) * pz);
  }

  /** Re-plan from `from`. Waypoints are the ordered portal centres plus a point in the room. */
  replan(from) {
    const here = this.room.spaceAt(from);
    const pool = this._destinations().filter((s) => s.id !== here?.id && s.id !== this._lastSpaceId);
    const list = pool.length ? pool : this._destinations();
    const dest = list[Math.floor(this.rng() * list.length) % list.length];
    if (!dest) { this.legs = []; return; }
    const goal = this._pointIn(dest);
    const portals = this.room.pathPortals(from, goal, ROUTE_MIN_W, ROUTE_MIN_H);
    this.legs = portals.map((p) => p.centre.clone());
    this.legs.push(goal);
    this._lastSpaceId = here?.id ?? null;
    this.target = dest.id;
  }

  /** The next waypoint, replanning when the route runs out. Never returns null after the first call. */
  next(from) {
    while (this.legs.length && this.legs[0].distanceTo(from) < ARRIVE) this.legs.shift();
    if (!this.legs.length) this.replan(from);
    return this.legs[0] ?? null;
  }
}

/**
 * 🎬 **THE OPERATOR — four shots, a hard cut, and a rule that every cut has to see the runner.**
 *
 * This is the difference between "produced" and "a chase cam", and it is the part a fast
 * implementation skips. All four shots are at human height and pointed at the runner; none of
 * them is ever above the storey. A cut is a CUT — an edit, not a drone move — and between cuts
 * the eye lags the body rather than being welded to it.
 */
const SHOTS = ['chase', 'shoulder', 'lead', 'doorway'];

class FollowOperator {
  constructor(room, rng) {
    this.room = room;
    this.rng = rng;
    this.shot = 'chase';
    this.until = 3.0;                    // the first cut lands early so the show starts moving
    this.eye = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.park = new THREE.Vector3();     // where `doorway` is bolted down
    this._want = new THREE.Vector3();
    this._aim = new THREE.Vector3();
    this._seeded = false;
  }

  /** Seeded, and never the same shot twice running. */
  _pick() {
    const pool = SHOTS.filter((s) => s !== this.shot);
    return pool[Math.floor(this.rng() * pool.length) % pool.length];
  }

  /** Where a given shot wants its eye, in world space. */
  _solve(shot, runner, out) {
    const f = runner.facing;
    const fx = Math.sin(f), fz = Math.cos(f);
    const rx = -Math.cos(f), rz = Math.sin(f);   // the right-hand perpendicular, `player.js` L899
    const p = runner.pos;
    switch (shot) {
      case 'shoulder':
        return out.set(p.x - fx * 1.35 + rx * 0.48, 1.52, p.z - fz * 1.35 + rz * 0.48);
      case 'lead':
        return out.set(p.x + fx * 2.40, 1.55, p.z + fz * 2.40);
      case 'doorway':
        return out.copy(this.park);
      case 'chase':
      default:
        return out.set(p.x - fx * 2.90 + rx * 0.35, 1.62, p.z - fz * 2.90 + rz * 0.35);
    }
  }

  /**
   * Can this shot be taken at all? Three refusals, and every one of them is a picture a viewer
   * would read as a bug: an eye in the void, an eye in the ceiling, an eye behind a wall.
   */
  _valid(eye, runner) {
    const space = this.room.spaceAt(eye);
    if (!space) return false;
    if (eye.y > (space.storey ?? 4.8) - EYE_CEIL_MARGIN) return false;
    this._aim.set(runner.pos.x, 1.35, runner.pos.z);
    if (this.room.blocksSight(eye, this._aim)) return false;
    return true;
  }

  /** Pull the eye in along the eye->runner ray until it clears. The last resort before a bad cut. */
  _reel(eye, runner) {
    this._aim.set(runner.pos.x, 1.35, runner.pos.z);
    for (let k = 0.75; k >= 0.2; k -= 0.15) {
      this._want.copy(this._aim).lerp(eye, k);
      this._want.y = eye.y;
      if (this._valid(this._want, runner)) { eye.copy(this._want); return true; }
    }
    eye.set(runner.pos.x, 1.55, runner.pos.z).addScaledVector(
      new THREE.Vector3(Math.sin(runner.facing), 0, Math.cos(runner.facing)), -1.2);
    return false;
  }

  cut(runner, lastPortal) {
    const first = this._pick();
    const order = [first, ...SHOTS.filter((s) => s !== first)];
    for (const shot of order) {
      if (shot === 'doorway') {
        if (!lastPortal) continue;
        this.park.set(lastPortal.x, 1.60, lastPortal.z);
      }
      this._solve(shot, runner, this._want);
      if (!this._valid(this._want, runner)) continue;
      this.shot = shot;
      this.eye.copy(this._want);
      this.until = 5.5 + this.rng() * 3.5;
      return;
    }
    this.shot = 'chase';
    this._solve('chase', runner, this._want);
    this._reel(this._want, runner);
    this.eye.copy(this._want);
    this.until = 5.5 + this.rng() * 3.5;
  }

  /**
   * @param speed01  the runner's speed as a fraction of `MOVE.run` — the handheld scales with it,
   *                 so the lens is calm on a creep and alive on a sprint.
   */
  update(dt, t, runner, camera, lastPortal, speed01) {
    if (!this._seeded) { this._seeded = true; this.cut(runner, lastPortal); }
    this.until -= dt;
    if (this.until <= 0) this.cut(runner, lastPortal);

    this._solve(this.shot, runner, this._want);
    if (!this._valid(this._want, runner)) this._reel(this._want, runner);

    // The operator LAGS. A camera welded to a body reads as a drone; a camera that arrives a
    // beat late reads as a person carrying it.
    const k = this.shot === 'doorway' ? 1 : 1 - Math.exp(-6.5 * dt);
    this.eye.lerp(this._want, k);

    // Handheld. Two low-frequency sines per axis so it never repeats on a visible period.
    const g = 0.35 + speed01 * 0.65;
    const sway = 0.020 * g;
    camera.position.set(
      this.eye.x + (Math.sin(t * 1.31) + Math.sin(t * 2.17) * 0.5) * sway,
      this.eye.y + (Math.sin(t * 1.77) + Math.sin(t * 3.11) * 0.4) * sway * 0.8,
      this.eye.z + (Math.cos(t * 1.09) + Math.cos(t * 2.53) * 0.5) * sway);

    // Frame the chest, not the feet, and lag the look too so a corner is a whip rather than a snap.
    this.look.lerp(this._aim.set(runner.pos.x, 1.30, runner.pos.z), 1 - Math.exp(-8.0 * dt));
    camera.up.set(0, 1, 0);
    camera.lookAt(this.look);
    // The breath in the wrist. Applied after `lookAt` so it is a lens rotation, not a target move.
    camera.rotateZ(Math.sin(t * 0.73) * 0.006 * g);
    camera.rotateX(Math.sin(t * 1.41) * 0.005 * g);
  }
}

/**
 * Build the bed. Caller owns `estate()` and `engine.start()`; this owns everything between.
 *
 * @param {object} engine            an `estate()` engine
 * @param {object} opts
 * @param {number} [opts.seed]       the house/performance seed — `frame.worldSeed` on the TV
 * @param {string} [opts.throttle]   STILL / CREEP / WALK / RUN
 * @param {number} [opts.accent]     the runner's accent colour, as a hex number, for the cam light
 * @param {boolean} [opts.still]     freeze the runner — `?still=1`, for a deterministic shot
 * @param {string} [opts.pinShot]    pin one shot — `?shot=lead`, an instrument
 */
export async function buildFollowBed(engine, opts = {}) {
  const scene = engine.scene;
  const rng = engine.rng;

  // ---------------------------------------------------------------- the house
  // No `panels`, no `dig`, no `estate`, no `plan`. The TV shows the house the game ships or it
  // is not the house — and `plan` is on `follow.js`'s forbidden list for exactly that reason.
  const wallField = new WallField({ authority: true });
  const room = await engine.work(buildTestRoom(engine, { wallField }));
  scene.add(room.root);

  const start = room.spawn.player[0];
  engine.camera.position.set(start.x, 1.6, start.z + 3.2);
  engine.camera.lookAt(start.x, 1.2, start.z - 2.0);

  // ---------------------------------------------------------------- the runner
  /*
   * PROCEDURAL `unit4h`, NOT THE GENERATED MESH. `game.play` defaults to `?mesh=1`, which is four
   * GLB fetches; `Player` builds the procedural body itself when `avatar` is absent. The TV must
   * come up without a network round trip it can fail on, and a follow slot that silently fell
   * back to no character at all would be a black frame with a caption — which is the thing this
   * whole slice exists to delete.
   *
   * `field` is omitted deliberately: `LimbRig` takes `field: null`, and nothing here detaches a
   * limb. No sledge is equipped, so `SledgeRig` stays inert.
   */
  const runner = new Player({ scene, world: room, rng, id: 'runner' });
  runner.pos.set(start.x, room.floorY, start.z);
  runner.facing = 0;
  runner.aimYaw = 0;

  const route = new RunnerRoute(room, rng);
  route.replan(runner.pos);
  const operator = new FollowOperator(room, rng);

  // ---------------------------------------------------------------- lighting
  // Same five as `game.play`, same constructor values, and read `followRig`'s header before
  // adding a sixth to this group.
  const key = new THREE.SpotLight(0xffdcb4, 150, 34, 0.88, 0.62, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(engine.quality.shadowMap, engine.quality.shadowMap);
  key.shadow.camera.near = 0.6; key.shadow.camera.far = 34;
  key.shadow.bias = -0.0009; key.shadow.normalBias = 0.03;
  scene.add(key, key.target);

  const warmA = new THREE.PointLight(0xffb271, 18, 13, 2);
  const warmB = new THREE.PointLight(0x6f8fbe, 42, 24, 2);
  const cool = new THREE.PointLight(0xa8ccf4, 46, 10, 2);
  scene.add(warmA, warmB, cool);
  const fill = new THREE.HemisphereLight(0x6f7d96, 0x3a2a1c, 4.60);
  scene.add(fill);

  /**
   * 🎥 **THE CAMERA LIGHT — the one light `game.play` does not have, and the reason this frame
   * is exposed at all.**
   *
   * It is diegetic: a camera crew carries a light, and this is that light. It is tinted toward
   * the runner's own lobby ACCENT, which is how the TV says whose show this is without a floating
   * nameplate (the name lives on the lower-third — slice §6).
   *
   * ⚠️ Deliberately WEAKER than any practical in the house (1.4 against `warmA`'s 18). It is
   * there so a body three metres away in an unlit service corridor is readable, not so the frame
   * is lit by it — if the runner's shell blows out, this is the number that is wrong. It is
   * constructed HERE, before `finalizeScene()`, so the light count is fixed for the life of the
   * view; see `followRig`'s header.
   */
  const camLight = new THREE.PointLight(opts.accent ?? 0xf5a14a, 1.4, 3.5, 2);
  scene.add(camLight);

  const rig = followRig({ key, warmA, warmB, cool, fill });
  rig.snapTo(room.spaceAt(engine.camera.position) ?? room.spaces[0]);

  // The grade is `views/game.js` L285-294, unchanged. Do not invent a TV grade — that block is
  // the result of a measured argument about a frame that read as one colour.
  engine.pipeline.setGrade({
    exposure: 1.85,
    haze: 0.042, hazeColor: [0.062, 0.055, 0.046],
    lift: [0.011, 0.009, 0.007],
    toeCrush: 0.005,
    vignette: 0.24, vignetteRound: 0.92,
    grain: 0.024, contrast: 1.05, saturation: 1.02,
    splitBalance: 0.60,
    shadowTint: [1.05, 0.96, 0.84], highlightTint: [1.015, 1.00, 0.985],
  });

  // ---------------------------------------------------------------- the performance
  const perf = {
    throttle: THROTTLE_DRIVE[opts.throttle] ? opts.throttle : 'WALK',
    hesitateAt: 6 + rng() * 5,
    hesitateFor: 0,
    glance: 0,
    heading: 0,
    lastPortal: null,
  };
  if (opts.pinShot && SHOTS.includes(opts.pinShot)) {
    operator.shot = opts.pinShot;
    operator.cut = () => { operator.until = 1e9; };
  }

  const _dir = new THREE.Vector3();
  const _views = [{ pos: engine.camera.position, dir: _dir }];

  function step(dt, t) {
    let drive = THROTTLE_DRIVE[perf.throttle];

    // A body walking a dark house it is frightened of does not hold a constant speed. Three
    // cheap terms, all seeded, and the hesitation is the one that reads: drop to a creep, look
    // off to one side, then pick the line back up.
    if (perf.hesitateFor > 0) {
      perf.hesitateFor -= dt;
      drive = THROTTLE_DRIVE.CREEP;
    } else {
      perf.hesitateAt -= dt;
      if (perf.hesitateAt <= 0) {
        perf.hesitateFor = 0.8 + rng() * 0.8;
        perf.hesitateAt = 6 + rng() * 5;
        perf.glance = (rng() < 0.5 ? -1 : 1) * (0.35 + rng() * 0.25);
      }
    }
    if (perf.hesitateFor <= 0) perf.glance *= Math.exp(-2.2 * dt);

    const wp = route.next(runner.pos);
    if (wp) {
      const want = Math.atan2(wp.x - runner.pos.x, wp.z - runner.pos.z);
      // Lag the heading rather than snapping it, so a corner is a turn the body banks into.
      const d = Math.atan2(Math.sin(want - perf.heading), Math.cos(want - perf.heading));
      perf.heading += d * (1 - Math.exp(-5.5 * dt));
    }
    const wobble = 1 + Math.sin(t * 0.83) * 0.10 + Math.sin(t * 1.61) * 0.06;
    const stick = opts.still ? 0 : drive.move * wobble;

    runner.update(dt, t, {
      move: { x: 0, y: stick },
      run: !opts.still && drive.run,
      aimYaw: perf.heading + perf.glance,
    });

    // The last doorway the runner came through is where the `doorway` shot parks.
    if (route.legs.length) {
      const head = route.legs[0];
      if (head.distanceTo(runner.pos) < 3.2) perf.lastPortal = head;
    }

    const speed01 = Math.min(1, runner.speed / MOVE.run);
    operator.update(dt, t, runner, engine.camera, perf.lastPortal, speed01);

    // The cam light rides just under and ahead of the lens, so it throws onto the runner rather
    // than flaring the lens it is attached to.
    camLight.position.copy(engine.camera.position);
    camLight.position.y -= 0.18;

    const space = room.spaceAt(runner.pos) ?? room.spaceAt(engine.camera.position);
    if (space) rig.follow(space, dt);

    engine.camera.getWorldDirection(_dir);
    room.setViewpoints(_views, dt);
    room.update?.(dt);
  }

  return {
    room,
    runner,
    /** What the overlay prints, and what the drive asserts on. Never a room name — §3.3.5. */
    readout: () => ({
      shot: operator.shot,
      throttle: perf.hesitateFor > 0 ? 'CREEP' : perf.throttle,
      speed: +runner.speed.toFixed(2),
    }),
    setThrottle(name) { if (THROTTLE_DRIVE[name]) perf.throttle = name; },
    step,
    lights: { key, warmA, warmB, cool, fill, camLight },
  };
}
