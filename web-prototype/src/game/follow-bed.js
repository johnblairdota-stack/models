import * as THREE from 'three';
import { WallField } from '../destruction/wall.js';
import { buildTestRoom } from './room.js';
import { generatedTablesFor } from './spaces.js';
import { Player } from './player.js';
import { MOVE, WEAPON_RANGE } from './rules.js';
import { CONTACT_PHASE, SWING_DUR } from './sledge.js';
import { SHOT_NAMES, STICK_TURN, stickHeading, stickMag, stickRef } from '../party/follow.js';
import { bleedCoolPos, bleedKeyAngle, facingPortal } from '../lighting/door-bleed.js';
import { HOME_ROOM, MISSION_ROOM, PLAN_OPTS } from '../party/mansion.js';
import { createMeshAvatar } from '../characters/mesh-avatar.js';
import { unit4hMaterials } from '../materials/surfaces/robot.js';
import { buildIntroBed, ballroomOf } from './intro-bed.js';

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
 * It is **not** `game.play` and it must never become it: no HUD, no gadgets, no dig, no keyboard.
 * `views/game.js` stays the art/physics bed and is not edited by this slice — see the slice's
 * §2.0 for why nothing was exported from it. What is private in there and genuinely wanted is
 * `makeLightRig` (L4028), and `followRig` below **carries the technique** rather than importing
 * it: importing `game.js` for 140 lines of light positioning would drag `audio.js`,
 * `gadgets/index.js`, `hud.js` and `hunter-ai.js` onto the TV's critical path.
 *
 * ---------------------------------------------------------------------------------------------
 * 🔥 **WHAT `task-prime-time-lobby-warm-night` CHANGED, AND WHAT IT DELIBERATELY DID NOT**
 * ---------------------------------------------------------------------------------------------
 * The bed now lives for a whole NIGHT instead of an episode, and has three modes rather than one:
 *
 *   `warm`    the house is standing and the camera drifts through the ballroom. This is what is
 *             behind the lobby's QR code while the bake finishes. No performance, no runner.
 *   `intros`  `intro-bed.js` drives — the joined cast walking to their chairs.
 *   `run`     the expedition. The runner is a body with a hammer, driven by a phone.
 *
 * Three of the header's old refusals are now out of date and are corrected rather than left to
 * contradict the code below:
 *
 *   · **"no sledge"** — the runner spawns EQUIPPED. There is no pickup beat in a party night; the
 *     pair is sent in with the hammer, which is what `party-loop.md` line 21's task list assumes.
 *   · **"no hunter"** — there is a hunter TOKEN walking `room.patrolRoute()` room to room through
 *     the house's own doorways (`room.pathPortals`). It has a position and nothing else: no body,
 *     no chase, no take. It exists because §3.8's intel is about a real position or it is
 *     theatre. `HunterAI` is the next slice and this is labelled as a stub.
 *   · **"no input"** — the runner is driven by its owner's thumbs over the cue channel. The
 *     scripted schedule below survives as the FALLBACK, which is the important half: see
 *     `perf.driven`.
 *
 * 🚨 **THE TV STILL NEVER GETS THE GUIDE'S VIEW**, and that has not moved an inch.
 * `party-loop.md`'s "Do not" list, first item. Three things are refused here structurally rather
 * than by convention, and `harness/party-follow-drive.mjs` D5 asserts all three from outside:
 *   · `room.setLid()` is never called. The ceilings stay on.
 *   · every shot's eye is clamped under the space's storey (`EYE_CEIL_MARGIN`).
 *   · there is no marker, no plan and no minimap in this file at all — and the hunter token has
 *     no mesh, so it cannot appear on the shared screen even by accident.
 *
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
  /**
   * 🚪 **`view` RE-HOMES THE COOL RIM ONTO THE DOOR IN FRAME.** The table parks cool past
   * the room's widest door. Standing in that room looking through a different doorway, the
   * adjacent room is resident and unlit — John's "hard to see into adjacent rooms." `?bleed=0`
   * is the control arm (`_bleed1-doorlight.mjs`).
   */
  const bleedOff = typeof location !== 'undefined'
    && new URLSearchParams(location.search).get('bleed') === '0';
  const applyBleed = (space, view) => {
    if (bleedOff || !view?.pos || !view?.dir || !view?.portals || !space?.id) return;
    const hit = facingPortal(view.portals, space.id, view.pos, view.dir);
    if (!hit) return;
    const p = bleedCoolPos(hit, space.id, view.spaces);
    want.cool.pos.set(p.x, p.y, p.z);
    const base = space.lights?.key?.angle;
    if (base != null) L.key.angle = bleedKeyAngle(base, true);
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
    snapTo(space, view) { read(space); applyBleed(space, view); apply(1); },
    follow(space, dt, view) {
      read(space);
      applyBleed(space, view);
      apply(1 - Math.exp(-dt / (LERP / 3)));
    },
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
// Named in `src/party/follow.js` so `?shot=` can be validated at the door without loading THREE.
// One list, so a shot the bed does not have cannot be advertised on the URL.
const SHOTS = SHOT_NAMES;

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
 * 🖼️ **THE PAINTING — the night's first test mission, as one framed plane on a gallery wall.**
 *
 * John: *"First test mission: destroy a painting in the gallery wherever that room spawns."*
 * "Wherever that room spawns" is the load-bearing half — the plan is generated per night, so the
 * painting is placed by finding the gallery's longest wall at build time rather than by a
 * coordinate anybody typed.
 *
 * ⚠️ **IT IS NOT A `FurnProp`, AND THAT IS A STATED SHORTCUT RATHER THAN AN OVERSIGHT.**
 * `destruction/furnprop.js` is the real destructible-object channel and `_resolveSledgeHit` routes
 * to it automatically — but a `FurnProp` wants a GLB in `furn-catalog.js` and a voxel body, and
 * there is no painting asset in the repo. Inventing one is a different slice. So the painting is a
 * plain mesh with a proximity test (`missionTick` below), it breaks in one blow, and the swap to a
 * real `FurnProp` is a local change to this function and its hit test when the asset exists.
 */
function buildPainting(space, floorY) {
  if (!space) return null;
  const w = space.x1 - space.x0, d = space.z1 - space.z0;
  const alongX = w >= d;
  // The long wall, on the side furthest from the room's own centre, at gallery hanging height.
  const cx = (space.x0 + space.x1) / 2, cz = (space.z0 + space.z1) / 2;
  const pos = alongX
    ? new THREE.Vector3(cx, floorY + 1.85, space.z0 + 0.22)
    : new THREE.Vector3(space.x0 + 0.22, floorY + 1.85, cz);
  const rotY = alongX ? 0 : Math.PI / 2;

  const group = new THREE.Group();
  group.name = 'mission-painting';
  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(1.46, 1.86, 0.09),
    new THREE.MeshStandardMaterial({ color: 0x6b4a22, roughness: 0.42, metalness: 0.55 }));
  const canvas = new THREE.Mesh(
    new THREE.PlaneGeometry(1.22, 1.62),
    new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.86, metalness: 0.0 }));
  canvas.position.z = 0.052;
  frame.castShadow = true; frame.receiveShadow = true;
  group.add(frame, canvas);
  group.position.copy(pos);
  group.rotation.y = rotY;
  return { group, pos, intact: true };
}

/**
 * 👁️ **THE HUNTER TOKEN — a body walking the house through its doorways.**
 *
 * §3.8's intel is *"good players get sporadic/vague information about hunter location"*, and that
 * is only worth building if the location is real. It walks `room.patrolRoute()` — the same table
 * `HunterAI` walks in `game.play` — so the room the guide is told about is a room the hunter is
 * genuinely in.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 **IT WENT THROUGH THE WALLS, AND THAT IS WHY JOHN SAW IT "NOT ACTUALLY MOVING".**
 * ---------------------------------------------------------------------------------------------
 * The first version steered straight at the next patrol stop. Two stops in one room is fine; two
 * stops in different rooms is a diagonal through however much masonry is in the way, and the
 * consequences were all on the guide's phone rather than on the TV, which is why nothing caught
 * it:
 *
 *   · The straight line spends most of a room-to-room leg inside the WALL BAND, where
 *     `room.spaceAt` returns null. `world()` therefore reported `hunter.room: null`,
 *     `coverageRoomOf(null)` is honestly `null`, and the guide's mark went dark — for most of
 *     every transit, on a route that is mostly transit.
 *   · The rooms it did report were whichever rectangle the diagonal happened to clip, in an order
 *     no adjacency explains. `patrol` exists to make the hunter's position LEARNABLE
 *     (`spaces.js` `generatedPatrol`), and a route that teleports across the plan is the exact
 *     failure that header warns about, reintroduced one layer up.
 *
 * So a leg is now expanded through `room.pathPortals` into the ordered doorway centres between
 * here and the stop — the same call, the same `ROUTE_MIN_W`/`ROUTE_MIN_H` filter and the same
 * reasoning as `RunnerRoute.replan` above. The hunter leaves a room by a door, crosses the
 * passage, and arrives; the guide's dot tracks a walk instead of blinking.
 *
 * ⚠️ **THE REPORTED ROOM IS STICKY THROUGH A DOORWAY.** `spaceAt` can still legitimately answer
 * null while the token is standing in an opening, and "nowhere" is a worse answer than "the room
 * it has not left yet" — a mark that vanishes for a step reads as the feed dropping, which is now
 * a thing the guide's map means on purpose (`src/party/mapfeed.js`).
 *
 * 🚨 **IT STILL HAS NO MESH, NO CHASE AND NO TAKE, AND THE ABSENCE OF THE MESH IS STILL
 * LOAD-BEARING.** A hunter the TV could render is a hunter the TV could put on the shared screen,
 * which is the second item on `party-loop.md`'s "Do not" list; `party-follow-drive` D6 greps the
 * slot's whole DOM for the word. The token cannot leak because there is nothing to see. Wiring
 * `HunterAI` in — with a body, a chase and `taken.js` — is still the next slice.
 */
function buildHunterToken(room) {
  const stops = (room.patrolRoute?.() ?? [])
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
  const floorY = room.floorY ?? 0;
  const pos = new THREE.Vector3(stops[0]?.x ?? 0, floorY, stops[0]?.z ?? 0);
  const SPEED = 1.6;                      // slower than a walking robot; it is stalking, not racing
  const ARRIVE_AT = 0.45;

  let stop = 0;
  let legs = [];
  let dwell = 0;
  let lastRoom = room.spaceAt(pos)?.id ?? null;
  let doorways = 0;

  /** Expand the walk to `stops[stop]` into doorway centres plus the stop itself. */
  function plan() {
    const target = stops[stop % stops.length];
    if (!target) { legs = []; return; }
    const goal = new THREE.Vector3(target.x, floorY, target.z);
    // An unreachable stop falls through to the straight line rather than standing still: a
    // hunter frozen in a corner all night is a worse bug than one that clips a corner.
    const portals = room.pathPortals?.(pos, goal, ROUTE_MIN_W, ROUTE_MIN_H) ?? [];
    legs = portals.map((p) => p.centre.clone());
    legs.push(goal);
  }
  plan();

  return {
    pos,
    /** The space it is in, held across a doorway. What `world()` reports and the map is keyed on. */
    roomId: () => lastRoom,
    /** Read by the drive: it has a route, it is walking it, and it is using the doors. */
    telemetry: () => ({ stops: stops.length, stop: stops.length ? stop % stops.length : 0, doorways }),
    step(dt) {
      if (!stops.length) return;
      if (dwell > 0) { dwell -= dt; return; }
      if (!legs.length) plan();
      const wp = legs[0];
      if (!wp) return;
      const dx = wp.x - pos.x, dz = wp.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d < ARRIVE_AT) {
        legs.shift();
        if (legs.length) doorways += 1;         // what was just cleared was a portal centre
        else {
          dwell = Math.max(0.4, Number(stops[stop % stops.length]?.dwell) || 1.5);
          stop += 1;
          plan();
        }
        return;
      }
      pos.x += (dx / d) * SPEED * dt;
      pos.z += (dz / d) * SPEED * dt;
      const here = room.spaceAt(pos)?.id ?? null;
      if (here) lastRoom = here;
    },
  };
}

/**
 * Build the bed. Caller owns `estate()` and `engine.start()`; this owns everything between.
 *
 * @param {object} engine            an `estate()` engine
 * @param {object} opts
 * @param {number} [opts.seed]       the house/performance seed — `frame.worldSeed` on the TV
 * @param {string} [opts.planSeed]   a generated plan seed — `pickPlanSeed(worldSeed).seed`
 * @param {boolean} [opts.warm]      start in `warm` mode: the house standing, nobody in it
 * @param {boolean} [opts.mesh]      fetch the Meshy body for the runner (default true when warm)
 * @param {string} [opts.throttle]   STILL / CREEP / WALK / RUN — the fallback schedule's speed
 * @param {number} [opts.accent]     the runner's accent colour, as a hex number, for the cam light
 * @param {boolean} [opts.still]     freeze the runner — `?still=1`, for a deterministic shot
 * @param {string} [opts.pinShot]    pin one shot — `?shot=lead`, an instrument
 * @param {(stage:string)=>void} [opts.onStage]  warm-progress milestones, for the TV's bar
 */
export async function buildFollowBed(engine, opts = {}) {
  const scene = engine.scene;
  const rng = engine.rng;
  const stage = opts.onStage ?? (() => {});

  // ---------------------------------------------------------------- the house
  /*
   * 🏚️ **PROCEDURAL, ALWAYS, AND CHOSEN BY NOBODY.** John: *"Use the procedural map so the layout
   * is always different each night."* `plan` stays on `follow.js`'s forbidden list — a TV that
   * could be handed a different plan from the one the phones are told about is the leak that entry
   * exists for — so the plan is not a URL param, it is a pure function of the public `worldSeed`
   * (`src/party/mansion.js`), handed in through `buildTestRoom`'s `o.tables`.
   *
   * With no `planSeed` this falls through to the authored house, which is what `?view=party.follow`
   * on its own still gives a developer.
   */
  const tables = opts.planSeed != null
    ? generatedTablesFor(opts.planSeed, PLAN_OPTS)
    : null;
  const wallField = new WallField({ authority: true });
  const room = await engine.work(buildTestRoom(engine, { wallField, tables }));
  scene.add(room.root);
  stage('house');

  const ballroom = ballroomOf(room);
  const gallery = room.spaces.find((s) => s.roomType === MISSION_ROOM)
    ?? room.spaces.find((s) => s.id === MISSION_ROOM) ?? null;

  /*
   * ⚠️ THE NIGHT STARTS IN THE BALLROOM, NOT AT THE PLAN'S SPAWN. John: *"Always start seated in
   * the ballroom."* `spawn.player[0]` is wherever the generator's packer put the first study, which
   * is the right answer for `game.play` and the wrong one for a show whose first beat is eight
   * robots in a circle. Falls back to the plan's spawn when there is no ballroom to stand in.
   */
  const start = ballroom
    ? new THREE.Vector3((ballroom.x0 + ballroom.x1) / 2, room.floorY ?? 0, (ballroom.z0 + ballroom.z1) / 2)
    : room.spawn.player[0];
  engine.camera.position.set(start.x, 1.6, start.z + 3.2);
  engine.camera.lookAt(start.x, 1.2, start.z - 2.0);

  // ---------------------------------------------------------------- the runner
  /*
   * 🤖 **THE MESHY BODY, AND THE REASON THIS FILE USED TO REFUSE IT NO LONGER HOLDS.**
   *
   * The old note here read: *"The TV must come up without a network round trip it can fail on, and
   * a follow slot that silently fell back to no character at all would be a black frame with a
   * caption."* That was correct when the slot was created at "Send them in" — a 9.0 MB fetch
   * starting at the moment the room stops looking at anything else is exactly the defect John
   * reported. This slice moves the whole build into the LOBBY, behind a progress bar, so the fetch
   * is paid during dead air that already existed.
   *
   * The refusal survives as the `.catch`: a failed or slow fetch falls back to the procedural
   * `unit4h` body and the night runs anyway. What is no longer true is that the fetch must not be
   * attempted at all.
   *
   * `friendly_all38.glb` — `mesh-avatar.js` `PLAYER_BODY`, 38 clips, the newest Meshy humanoid in
   * the repo (shipped 2026-08-19). `?player=` still overrides it for an A/B.
   */
  const botMats = unit4hMaterials();
  const wantMesh = opts.mesh ?? true;
  const avatar = wantMesh
    ? await engine.work(createMeshAvatar({ materials: botMats }).catch((e) => {
      console.warn('[follow-bed] the Meshy body did not load; falling back to unit4h —', e?.message ?? e);
      return null;
    }))
    : null;
  /*
   * Loose + catalog smashables through the one placer (`dressLooseFurniture`) — not chairs.
   * Default dress is the 24 `rrr_prop_*` catalog ids; GeoBin kit is `?kitdress=1` only.
   * Chairs wait for the intros cue so the count is the joined cast (`intro-bed.js`).
   * Missing catalog GLBs skip (`__furnLayout.missing`). Doorway keep-out is
   * `portal-clearance.js` (shared with any play-feel work).
   */
  try {
    const { dressLooseFurniture } = await import('./furn-dress.js');
    engine.__furnDress = await dressLooseFurniture(room, {});
    engine.__furnLayout = engine.__furnDress?.catalog ?? { placed: 0, missing: [], props: [] };
  } catch (e) {
    console.warn('[follow-bed] furniture dress skipped —', e?.message ?? e);
  }
  stage('dress');

  /*
   * `field` is omitted deliberately: `LimbRig` takes `field: null`, and nothing here detaches a
   * limb.
   */
  const runner = new Player({ scene, world: room, rng, id: 'runner', materials: botMats, avatar });
  runner.pos.set(start.x, room.floorY, start.z);
  runner.facing = 0;
  runner.aimYaw = 0;

  /*
   * 🔨 **THE RUNNER SPAWNS EQUIPPED, AND THAT IS A RULE RATHER THAN A CONVENIENCE.** John: *"Runner
   * spawns equipped with the sledge."* There is no pickup beat in a party night — `game.play`'s
   * world sledge and `Player.interact` exist for the survival slice, and staging a hunt for a
   * hammer in front of eight people waiting for a show would be the wrong first thirty seconds.
   *
   * `owned` before `equip()`: `_toggleSledge` refuses to draw a hammer the body does not own, and
   * `equip()` itself needs `caps.arms === 2`, which a fresh body has.
   */
  runner.sledge.owned = true;
  runner.sledge.equip();

  const route = new RunnerRoute(room, rng);
  route.replan(runner.pos);
  const operator = new FollowOperator(room, rng);
  const hunter = buildHunterToken(room);

  const painting = buildPainting(gallery, room.floorY ?? 0);
  if (painting) scene.add(painting.group);

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
    /**
     * 🕹️ **FALSE UNTIL THE FIRST `move` CUE, AND THE SCRIPTED SCHEDULE ABOVE IS WHAT RUNS UNTIL
     * THEN. THAT FALLBACK IS NOT DEAD CODE.**
     *
     * `RunnerRoute` and the hesitation terms were D13's whole runner and are easy to mistake for
     * something this slice replaced. Three things still need them:
     *   · `?view=party.follow` opened standalone, which is how this view is developed.
     *   · `?still=1`, which has to stay deterministic for a screenshot.
     *   · `harness/party-follow-drive.mjs` **D3** — *consecutive grabs differ* — which would go
     *     red on a camera pointed at a robot whose owner has not picked their phone up yet.
     * Once a phone drives, the schedule never runs again that night.
     */
    driven: false,
    stick: { x: 0, y: 0 },
    /** The heading this push is measured from. `src/party/follow.js` `stickRef`. */
    stickRef: null,
    run: false,
    /** Set when a swing lands; read once by `missionTick`. `sledge.swingHit` is consumed by Player. */
    contactAt: -1,
  };
  if (opts.pinShot && SHOTS.includes(opts.pinShot)) {
    operator.shot = opts.pinShot;
    operator.cut = () => { operator.until = 1e9; };
  }

  // ---------------------------------------------------------------- the night's modes
  /** `warm` · `intros` · `run`. See the header. */
  let mode = opts.warm ? 'warm' : 'run';
  let intro = null;
  let introCast = null;
  let runnerName = null;
  const mission = { phase: painting ? 'seek' : 'none', room: gallery?.id ?? null };
  runner.root.visible = mode === 'run';

  const _dir = new THREE.Vector3();
  const _views = [{ pos: engine.camera.position, dir: _dir }];
  const _warmEye = new THREE.Vector3();
  const _warmAt = new THREE.Vector3();
  const _reel = new THREE.Vector3();

  /**
   * 👁️ **PULL AN EYE IN UNTIL IT CAN SEE WHAT IT IS POINTED AT.**
   *
   * `FollowOperator._reel` does this for the run camera and the warm and intro cameras need it
   * for the same reason. PR A removed the generated ballroom colonnade; the reel stays because
   * a piano, a wall, or any other occluder still has to tighten the shot rather than go crooked.
   *
   * Reeling in along the eye->target ray rather than sliding sideways keeps the composition: the
   * shot gets tighter, never crooked.
   */
  function reelToSight(eye, at) {
    if (!room.blocksSight(eye, at)) return eye;
    for (let k = 0.72; k >= 0.16; k -= 0.14) {
      _reel.copy(at).lerp(eye, k);
      _reel.y = eye.y;
      if (!room.blocksSight(_reel, at)) { eye.copy(_reel); return eye; }
    }
    // Nothing on the ray is clear — sit just off the target rather than inside a wall.
    eye.copy(at);
    eye.y += 0.30;
    return eye;
  }

  /**
   * 🔥 The warm camera — a slow arc of the ballroom, and nothing else moving.
   *
   * This is the picture behind the lobby's QR code while the bake finishes, so it has two jobs and
   * they pull in opposite directions: it has to be alive enough to prove the mansion is really
   * loading, and dull enough that the room reads the join code rather than the wallpaper. An arc
   * at 0.09 rad/s takes 70 s to go round, which is slower than anyone consciously notices and fast
   * enough that two glances a minute apart are different pictures.
   */
  /*
   * 🔥 THE WARM SHOT IS A DOLLY DOWN THE ROOM, **NOT AN ORBIT OF ITS CENTRE**, AND THAT IS A
   * MEASURED CORRECTION RATHER THAN A PREFERENCE.
   *
   * The orbit was built first and the drive photographed the problem: `dressGenerated` attaches
   * `ROOMS.ballroom`'s COLONNADE to a generated row, so a camera circling the room and looking at
   * its centre spends a good part of every revolution with a pillar filling the middle third of
   * frame. `room.blocksSight` does not save it — that query answers a question about wall panels,
   * and a column is neither a panel nor a space boundary, so the reel below cannot see one.
   *
   * A dolly along the LONG axis, offset to one side of the centre line, points down the room
   * instead of across it. The colonnade then runs past the lens as parallax — which is what a
   * colonnade is for — rather than standing in front of it, and the shot picks up the windows and
   * the mezzanine, which are the best thing in the room to have behind a join code.
   */
  const warmBox = (() => {
    const s = ballroom;
    if (!s) return null;
    const alongX = (s.x1 - s.x0) >= (s.z1 - s.z0);
    const long = alongX ? [s.x0, s.x1] : [s.z0, s.z1];
    const cross = alongX ? (s.z0 + s.z1) / 2 : (s.x0 + s.x1) / 2;
    const crossHalf = (alongX ? (s.z1 - s.z0) : (s.x1 - s.x0)) / 2;
    return { alongX, long, cross, off: Math.min(3.4, crossHalf * 0.52) };
  })();

  function warmStep(dt, t) {
    if (!warmBox) {
      _warmEye.set(start.x, 1.62, start.z + 4.5);
      _warmAt.set(start.x, 1.30, start.z);
    } else {
      const { alongX, long, cross, off } = warmBox;
      // A 44 s round trip, eased at the ends so the reverse is a settle rather than a bounce.
      const u = 0.5 - Math.cos(t * (Math.PI * 2 / 44)) * 0.5;
      const a = long[0] + 2.6 + u * Math.max(0.5, (long[1] - long[0]) - 5.2);
      const ahead = a + (Math.sin(t * (Math.PI * 2 / 44)) >= 0 ? 9.0 : -9.0);
      const y = 1.66 + Math.sin(t * 0.19) * 0.09;
      if (alongX) {
        _warmEye.set(a, y, cross + off);
        _warmAt.set(ahead, 1.34, cross - off * 0.35);
      } else {
        _warmEye.set(cross + off, y, a);
        _warmAt.set(cross - off * 0.35, 1.34, ahead);
      }
    }
    reelToSight(_warmEye, _warmAt);
    engine.camera.position.lerp(_warmEye, 1 - Math.exp(-2.0 * dt));
    engine.camera.up.set(0, 1, 0);
    engine.camera.lookAt(_warmAt);
    engine.camera.rotateZ(Math.sin(t * 0.61) * 0.005);
  }

  /**
   * 🔨 **DID THAT SWING HIT THE PAINTING? A RAY DOWN THE RUNNER'S OWN AIM, NOT A RADIUS.**
   *
   * This replaces `Math.hypot(runner.pos - painting.pos) <= 1.9`, and the radius is the bug rather
   * than a tuning miss. The gallery is DRESSED (`furn-dress.js` puts consoles, urns and portraits
   * on its walls, and the catalog placer adds more), so "a swing landed and the body is
   * within 1.9 m of the painting" is satisfied by smashing a crate that happens to be standing
   * near the same wall — while facing the other way. John's note is the symptom of exactly this
   * class of end: *"I didn't go anywhere or do much. I just hit a box."*
   *
   * ⚠️ **IT IS THE SAME RAY EVERY OTHER WEAPON RESOLVES ON.** `player.js` `_resolveSledgeHit` casts
   * `eye` along `aimDir` for the wall, and `attack()` returns that same pair for the hitscan — so
   * the painting is now hit by the thing the player is aiming at rather than by the thing they are
   * standing beside. The reach is `WEAPON_RANGE.sledge` plus one margin for the frame's own 9 cm of
   * depth, so a blow that would not have reached a wall panel does not reach the canvas either.
   *
   * ⚠️ Still not a `FurnProp` — see `buildPainting`'s header. That swap is a local change to this
   * function once a painting asset exists; what has changed is that the test is now a HIT.
   */
  const _paintRay = new THREE.Raycaster();
  const PAINTING_REACH = WEAPON_RANGE.sledge + 0.35;

  function swingHitPainting() {
    if (!painting?.intact) return false;
    _paintRay.set(runner.eye, runner.aimDir);
    _paintRay.near = 0;
    _paintRay.far = PAINTING_REACH;
    return _paintRay.intersectObject(painting.group, true).length > 0;
  }

  /**
   * 🖼️ The mission, in three states.
   *
   * `seek` -> the painting is up. A swing AIMED at it breaks it; a swing at anything else does not.
   * `return` -> the painting is down and the runner is told to go home.
   * `done` -> the runner is inside the ballroom. `src/party/room.js` `setWorld` turns that into
   *           the DEBRIEF phase, and `net/party/local.mjs` `endRunOnMission` turns it into the
   *           recap beat — which is the ONLY thing that ends an episode short of the backstop
   *           clock in `src/party/show.js`.
   */
  function missionTick(t) {
    if (mission.phase === 'seek' && painting?.intact && perf.contactAt >= 0 && t >= perf.contactAt) {
      perf.contactAt = -1;
      if (swingHitPainting()) {
        painting.intact = false;
        painting.group.visible = false;
        mission.phase = 'return';
        mission.room = ballroom?.id ?? null;
      }
    }
    if (mission.phase === 'return' && ballroom) {
      const inside = runner.pos.x > ballroom.x0 && runner.pos.x < ballroom.x1
        && runner.pos.z > ballroom.z0 && runner.pos.z < ballroom.z1;
      if (inside) mission.phase = 'done';
    }
  }

  function step(dt, t) {
    if (mode === 'warm') {
      warmStep(dt, t);
      hunter.step(dt);
      engine.camera.getWorldDirection(_dir);
      room.setViewpoints(_views, dt);
      room.update?.(dt);
      return;
    }
    if (mode === 'intros') {
      intro?.step(dt, t);
      hunter.step(dt);
      const space = room.spaceAt(engine.camera.position);
      if (space) {
        engine.camera.getWorldDirection(_dir);
        rig.follow(space, dt, {
          pos: engine.camera.position, dir: _dir,
          portals: room.portals(), spaces: room.spaces,
        });
      }
      const who = intro?.focus();
      if (who?.pos) {
        camLight.intensity = 4.6;
        camLight.distance = 6.2;
        if (who.accent) {
          const hex = parseInt(String(who.accent).slice(1), 16);
          if (Number.isFinite(hex)) camLight.color.setHex(hex);
        }
        camLight.position.set(who.pos.x, (who.pos.y ?? 0) + 1.55, who.pos.z);
      } else {
        camLight.position.copy(engine.camera.position);
        camLight.position.y -= 0.18;
      }
      engine.camera.getWorldDirection(_dir);
      room.setViewpoints(_views, dt);
      room.update?.(dt);
      return;
    }

    /*
     * 🕹️ **THE PHONE IS THE BODY.** John: *"replace STILL/CREEP/WALK/RUN with full movement
     * control and freedom."*
     *
     * This is one branch and about six lines, and that is the whole point of building the follow
     * on `Player` rather than animating a capsule: `Player.update`'s `move` is AIM-RELATIVE
     * (`player.js` `_stepGround`), so a thumb stick IS the input the body already takes. Collision,
     * sliding, the doorway squeeze, the sill step, the foot plant and the arm swing all come free,
     * and there is no second movement model to keep in sync with the first.
     *
     * ⚠️ The heading integrates the stick's own bearing rather than being set from it, so pushing
     * the stick left turns the runner rather than making it moonwalk sideways down a corridor.
     * `move.x` is kept as the strafe it already is, so a player who wants to sidestep a doorway
     * can, which is the "freedom" half of the brief.
     *
     * 🧭 **TWO THINGS WERE WRONG WITH THE OLD ONE LINE AND ONLY THE FIRST IS THE ONE JOHN NAMED.**
     * The bearing had lost `player.js` L887's minus sign, so left was right; and it was measured
     * from the LIVE heading, which makes the target run away from the body and turns a held thumb
     * into a 14 rad/s spin. `stickHeading` and `stickRef` in `src/party/follow.js` carry both
     * arguments and the measurements; they are exported so a bare-node gate can hold them down,
     * because a wrong sign and a runaway frame both still produce a runner that moves.
     */
    if (perf.driven) {
      const s = perf.stick;
      const mag = stickMag(s.x, s.y);
      perf.stickRef = stickRef(perf.stickRef, s.x, s.y, perf.heading);
      if (mag > 0 && perf.stickRef != null) {
        const want = perf.stickRef + stickHeading(s.x, s.y);
        const turn = Math.atan2(Math.sin(want - perf.heading), Math.cos(want - perf.heading));
        perf.heading += turn * (1 - Math.exp(-STICK_TURN * dt));
      }
      runner.update(dt, t, {
        move: { x: 0, y: mag },
        run: perf.run,
        aimYaw: perf.heading,
      });
      missionTick(t);
      afterBody(dt, t);
      return;
    }

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

    missionTick(t);
    afterBody(dt, t);
  }

  /** Everything the camera and the house do after the body has moved, on either drive. */
  function afterBody(dt, t) {
    // The last doorway the runner came through is where the `doorway` shot parks.
    if (route.legs.length) {
      const head = route.legs[0];
      if (head.distanceTo(runner.pos) < 3.2) perf.lastPortal = head;
    }

    hunter.step(dt);

    const speed01 = Math.min(1, runner.speed / MOVE.run);
    operator.update(dt, t, runner, engine.camera, perf.lastPortal, speed01);

    // The cam light rides just under and ahead of the lens, so it throws onto the runner rather
    // than flaring the lens it is attached to.
    camLight.position.copy(engine.camera.position);
    camLight.position.y -= 0.18;

    engine.camera.getWorldDirection(_dir);
    const space = room.spaceAt(runner.pos) ?? room.spaceAt(engine.camera.position);
    if (space) {
      rig.follow(space, dt, {
        pos: engine.camera.position, dir: _dir,
        portals: room.portals(), spaces: room.spaces,
      });
    }
    room.setViewpoints(_views, dt);
    room.update?.(dt);
  }

  /** The id of the space a world point is in, or null. What the intel and the map are keyed on. */
  function roomIdAt(v) {
    return room.spaceAt(v)?.id ?? null;
  }

  return {
    room,
    runner,
    /** What the overlay prints, and what the drive asserts on. Never a room name — §3.3.5. */
    readout: () => ({
      shot: mode === 'run' ? operator.shot : mode,
      throttle: perf.driven
        ? (perf.run ? 'RUN' : (stickMag(perf.stick.x, perf.stick.y) > 0 ? 'WALK' : 'STILL'))
        : (perf.hesitateFor > 0 ? 'CREEP' : perf.throttle),
      speed: +runner.speed.toFixed(2),
    }),
    setThrottle(name) { if (THROTTLE_DRIVE[name]) perf.throttle = name; },
    step,
    lights: { key, warmA, warmB, cool, fill, camLight },

    // ------------------------------------------------------------ the night
    get mode() { return mode; },
    /** Who the lower-third is naming, once a `run` cue has said. */
    get runnerName() { return runnerName; },
    /** True once the intro sequence has played itself out. */
    introsDone: () => !!intro?.done,

    /**
     * 🔁 **THE CUE CHANNEL'S LANDING POINT.** `src/party/follow.js` `cueViolations` has already
     * refused anything with a role, an alignment or the guide's map in it — by the time a cue
     * reaches this switch it is one of five known shapes carrying only public fields.
     */
    cue(c) {
      if (!c || typeof c !== 'object') return;
      if (c.kind === 'idle') {
        mode = 'warm';
        runner.root.visible = false;
        return;
      }
      if (c.kind === 'intros') {
        introCast = (c.cast || []).slice(0, 8);
        if (!introCast.length) return;
        intro?.dispose();
        intro = buildIntroBed(engine, {
          room, cast: introCast, materials: botMats, avatar, reelSight: reelToSight,
        });
        mode = 'intros';
        runner.root.visible = false;
        return;
      }
      if (c.kind === 'run') {
        /*
         * ⚠️ THE INTRO BODIES ARE TORN DOWN HERE AND NOT BEFORE. Disposing them when the intros
         * merely FINISH would leave the ballroom empty for however long the room spends on
         * ballots, which is the beat the seated circle exists to fill.
         */
        intro?.dispose();
        intro = null;
        mode = 'run';
        runnerName = c.name ?? null;
        runner.root.visible = true;
        camLight.intensity = 1.4;
        camLight.distance = 3.5;
        if (c.accent) {
          const hex = parseInt(String(c.accent).slice(1), 16);
          if (Number.isFinite(hex)) camLight.color.setHex(hex);
        }
        // Put the runner back on its feet in the ballroom — the pair is sent in from the circle.
        runner.pos.set(start.x, room.floorY ?? 0, start.z);
        runner.vel.set(0, 0, 0);
        return;
      }
      if (c.kind === 'shot' && SHOTS.includes(c.shot)) {
        operator.shot = c.shot;
        operator.until = 5.5;
        return;
      }
      if (c.kind === 'move') {
        /*
         * The first stick that arrives retires the scripted schedule for the rest of the night.
         * See `perf.driven` — the schedule is the fallback, not the dead predecessor.
         */
        perf.driven = true;
        perf.stick.x = Math.max(-1, Math.min(1, +c.x || 0));
        perf.stick.y = Math.max(-1, Math.min(1, +c.y || 0));
        perf.run = !!c.run;
        if (c.swing) {
          const res = runner.attack(engine.elapsed ?? 0);
          /*
           * ⚠️ THE CONTACT IS SCHEDULED, NOT SAMPLED. `Player.update` consumes
           * `sledge.swingHit()` itself — it is a one-shot latch — so a second reader here would
           * always see null. `attack()` returning `{ pending: true }` plus the clip's own two
           * published constants is the honest way to know when the head arrives.
           */
          if (res?.pending) perf.contactAt = (engine.elapsed ?? 0) + SWING_DUR * CONTACT_PHASE;
        }
      }
    },

    /**
     * 🌍 What the TV reports back to the server, twice a second. Rooms and coordinates only —
     * `worldViolations` refuses anything else at the door, and `src/party/room.js` decides who is
     * told what. See `src/party/intel.js`.
     */
    world: () => ({
      runner: { room: roomIdAt(runner.pos), x: +runner.pos.x.toFixed(2), z: +runner.pos.z.toFixed(2) },
      // `roomId()` is the sticky read — see `buildHunterToken`. The coordinate is still the live
      // one, so the guide's mark and the Production Feed's room name describe the same body.
      hunter: {
        room: roomIdAt(hunter.pos) ?? hunter.roomId(),
        x: +hunter.pos.x.toFixed(2), z: +hunter.pos.z.toFixed(2),
      },
      mission: { phase: mission.phase, room: mission.room },
    }),
    /** The patrol, for `harness/party-follow-drive.mjs`. Never rendered, never on the wire. */
    hunterTelemetry: () => ({ ...hunter.telemetry(), room: hunter.roomId() }),
  };
}
