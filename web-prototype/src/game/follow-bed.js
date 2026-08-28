import * as THREE from 'three';
import { WallField } from '../destruction/wall.js';
import { buildTestRoom } from './room.js';
import { generatedTablesFor } from './spaces.js';
import { Player } from './player.js';
import { MOVE, WEAPON_RANGE } from './rules.js';
import { CONTACT_PHASE, SWING_DUR } from './sledge.js';
import {
  CAM_LIFT, CAM_MIN_DIST, CAM_SWING, CHASE_EYE_Y_MAX, CHASE_HEIGHT, CHASE_LOOK_Y,
  CUT_SHOTS, DROP_SECONDS, PERSPECTIVES, PERSPECTIVE_RIG, PLAN_YAW, RISE_SECONDS, SHOT_NAMES,
  BALLROOM_PERSPECTIVE, chaseOrbitOffset, isOverhead, isPlanLocked, lerpRig, liveRunShot, lookYaw,
  perspectiveEye, rigMapness, runPerspective, smootherstep, stepBallroomView, stepLookOrbit,
  stickCamMove, stickMag,
} from '../party/follow.js';
import { bleedCoolPos, bleedKeyAngle, facingPortal } from '../lighting/door-bleed.js';
import { HOME_ROOM, MISSION_ROOM, PLAN_OPTS } from '../party/mansion.js';
import { missionFor } from '../party/mission.js';
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

/**
 * 🏠 The eye height at which the roof comes off, in metres. A storey is 4.8, so 3.2 takes the
 * ceiling away while the camera is still a metre and a half beneath it — the player watches it
 * lift rather than finding it already gone. It is a HEIGHT and not a perspective name so that
 * the rule is symmetric on the way back down without a second threshold, and because the real
 * reason is "the camera is about to rise through it", not "this rig is called top".
 */
const LID_LIFT_H = 3.2;

/* =============================================================================================
 * 🌑 **THE DARK THE HUNTER STANDS IN — and why the runner's lamp alone cannot make it.**
 *
 * John: the expedition is *"where the hunter stalks them from the shadows"* and *"the player
 * can't see the hunter coming."* From nine metres up with the roof off that is a lighting
 * problem, and the shipped numbers were tuned for the opposite goal: the overhead lamp got a
 * 13.5 m reach because the first top-down came back almost black and had to be made judgeable.
 * A 13.5 m pool lights a hunter at 8 m perfectly.
 *
 * 🚨 **AND SHRINKING THE LAMP IS NOT ENOUGH ON ITS OWN.** The per-space rig's key is a
 * `SpotLight(0xffdcb4, 150, 34)` that lights the whole room independently of `camLight`, so
 * whatever the runner's lamp does, the room stays lit. Ducking the key is the change that
 * decides whether any of this works; the pool is what puts the light back where the player is.
 * The hemisphere `fill` is ducked too, more gently, because it is the term that keeps the
 * geometry readable at all and taking it to zero would make the frame unplayable rather than
 * tense.
 *
 * ⚠️ Ducked, never zeroed, and never on the ground rigs: all three scale with `rigMapness`, so
 * at the chase rig they are exactly the shipped values and this cannot regress the show's
 * existing look.
 */
const OVERHEAD_KEY_DUCK = 0.75;    // 150 -> 37.5 at `top`
const OVERHEAD_FILL_DUCK = 0.55;   // 4.60 -> 2.07 at `top`
/**
 * A three.js point light with `decay 2` and a finite `distance` is WINDOWED: past `distance` it
 * contributes exactly zero, so this number is the concealment. The lamp hangs 4.2 m over the
 * runner, so a 6.5 m reach is a lit floor radius of sqrt(6.5² − 4.2²) ≈ 4.96 m and a hunter at
 * 8 m receives nothing from it at all.
 *
 * Intensity has to climb to pay for it: three's windowed falloff at the runner's feet goes from
 * (1 − 4.2/13.5)² = 0.475 to (1 − 4.2/6.5)² = 0.125, so holding the pool as bright means roughly
 * ×3.8. 54 is that, rounded — and it is a starting value settled against the luma probe, not an
 * algebraic result.
 */
const POOL_DIST = 6.5;
/**
 * How high over the runner the lamp hangs. A constant rather than the old `min(4.2, height*0.55)`
 * because the pool is now the light source and its SHAPE matters: lower is a tighter, more
 * directional puddle with a faster edge, which is what makes the dark beyond it read as dark
 * rather than as underexposure. 3.2 m gives a lit floor radius of √(6.5² − 3.2²) ≈ 5.66 m.
 */
const POOL_UP = 3.2;
/**
 * ⚠️ **THIS IS 120 AND NOT 54, AND THE FIRST NUMBER WAS WRONG FOR AN INSTRUCTIVE REASON.**
 *
 * 54 was solved to hold the pool at the brightness the SHIPPED overhead lamp gave — and the
 * shipped lamp was never the light. The room's key spot was, at 150 through a 34 m cone. So
 * ducking the key by three quarters and matching the old lamp produced a frame whose mean luma
 * still passed D2 (14.7 of 255) while the floor around the player was at 5.5: technically lit,
 * unreadable in practice, and lit mostly by a window across the room rather than by anything
 * the runner carries.
 *
 * Solved instead against three's own windowed falloff — `(1/d²)·(1 − (d/D)⁴)²` — for a pool
 * that is unmistakably the source: at d = 3.2, D = 6.5 the attenuation is 0.0865, so 85 puts
 * ~7.4 at the runner's feet against the ~0.78 the shipped overhead delivered — an order of
 * magnitude, which is what it takes for a lamp to BE the light rather than to garnish one.
 *
 * Bench: at 120 the pool clipped (runner patch 168 of 255, max 239, with a bloom bar across the
 * frame). 85 is that backed off below the clip. It is a look number and therefore John's dial,
 * not a derived constant — the derived part is only that it must be ~100×, not ~1×, the value
 * it replaced.
 */
const POOL_I = 85;

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
 * 🎬 **THE OPERATOR — four shots still exist; a live run is chase-only.**
 *
 * Warm / intros / a typed `?shot=` instrument may still cut or pin. Once the expedition is on
 * the air (`liveRunShot('run')`) the lens stays on `chase`: auto-cuts to shoulder / lead /
 * doorway invert a camera-relative stick. The right look stick orbits that chase (yaw/pitch);
 * the left stick walks in its horizontal basis. Between moves the eye still lags the body
 * rather than being welded to it.
 */
// Named in `src/party/follow.js` so `?shot=` can be validated at the door without loading THREE.
// One list, so a shot the bed does not have cannot be advertised on the URL.
const SHOTS = SHOT_NAMES;
/** What the DIRECTOR may cut to. A perspective is held, never cut to — see follow.js. */
const DIRECTOR_SHOTS = CUT_SHOTS;

/**
 * The corrections `_reel` may try, in order of least damage to the picture. `k` scales the
 * distance (clamped at `CAM_MIN_DIST`), `swing` and `lift` are fractions of `CAM_SWING` and
 * `CAM_LIFT`. Swings come in pairs so the lens has no standing preference for one shoulder.
 *
 * 🚨 **THIS LADDER IS SWING-DOMINATED BECAUSE THE FIRST ONE WAS MEASURED AND MOSTLY WASN'T.**
 *
 * The first cut spread its twelve tries evenly across swinging, lifting and pulling in, which
 * looked balanced and was mostly dead weight. `harness/cam-clip-drive.mjs` counts which candidate
 * actually wins, and over a doorway-to-doorway route: swings won 8 times, **lift and pull-in won
 * zero**, and the last-resort fallback fired 72 times.
 *
 * The reason is in `_valid`: it refuses an eye that is out of a space or whose sight is blocked
 * by a wall PANEL. Walls run floor to ceiling, so `CAM_LIFT` can never clear one — it only ever
 * helped against something low, which this query cannot see anyway. And pulling straight back
 * along a blocked ray stays blocked until it is close enough to be the defect we just removed.
 *
 * Swinging is the only correction that changes which side of the obstruction the lens is on, so
 * the ladder is now mostly swings, out to `CAM_SWING` and beyond it in two wider steps. One lift
 * and two pull-ins are kept at the end because they cost nothing to try and do occasionally win
 * on a corner rather than a wall.
 */
const REEL_TRIES = [
  { k: 1, swing: 0.5, lift: 0 },
  { k: 1, swing: -0.5, lift: 0 },
  { k: 1, swing: 1, lift: 0 },
  { k: 1, swing: -1, lift: 0 },
  { k: 1, swing: 1.5, lift: 0 },
  { k: 1, swing: -1.5, lift: 0 },
  { k: 1, swing: 2, lift: 0 },
  { k: 1, swing: -2, lift: 0 },
  { k: 0.8, swing: 1.5, lift: 0 },
  { k: 0.8, swing: -1.5, lift: 0 },
  { k: 0.8, swing: 2.4, lift: 0 },
  { k: 0.8, swing: -2.4, lift: 0 },
  { k: 1, swing: 0, lift: 1 },
  { k: 0.75, swing: 0, lift: 0 },
  { k: 0.55, swing: 0, lift: 0 },
];

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
    /**
     * Chase yaw/pitch of the LENS, not of the body. The look stick integrates into these;
     * release holds. #29 recentered onto `runner.facing` when the (only) stick pushed into
     * the shot — that fights a dedicated look pad, so it is gone.
     */
    this._lockYaw = null;
    this._lockPitch = 0;
    /** Where the steered frame was when a plan-locked rig was chosen. See the slerp in `update`. */
    this._yawFrom = null;
    this._pitchFrom = null;
    /** The live (possibly blended) rig and the crane's eased progress. The bed owns both. */
    this._rig = null;
    this._blend = 0;
    /** How many times the shot has had to be corrected. Read by harness/cam-clip-drive. */
    this.reels = 0;
    /** Which correction won, per REEL_TRIES index; last slot is the fallback. Harness only. */
    this.reelWins = new Array(REEL_TRIES.length + 1).fill(0);
  }

  /** Seeded, and never the same shot twice running. */
  _pick() {
    const pool = DIRECTOR_SHOTS.filter((s) => s !== this.shot);
    return pool[Math.floor(this.rng() * pool.length) % pool.length];
  }

  /**
   * Where a given shot wants its eye, in world space.
   *
   * 🧭 **A PLAN-LOCKED RIG IS NAILED TO `PLAN_YAW`, AND THAT IS THE WHOLE FIX FOR A MAP THAT
   * TURNED.** This line used to read `shot === 'chase' && _lockYaw != null`, so `iso` and `top`
   * fell through to `runner.facing` and the "stable map" swung with the robot's body — the
   * rotating-map problem `orbit: false` was written to prevent, arriving by the other door.
   * `orbit: true` rigs still take the steered yaw, which is what makes `wide` a real chase.
   */
  _solve(shot, runner, out) {
    /*
     * `_lockYaw` is the steered yaw and it is authoritative when it exists — during a crane it
     * is mid-slerp toward `PLAN_YAW`, and reading the destination instead would snap the frame
     * to plan north on the first frame of a move that takes 1.35 s. The `isPlanLocked` fallback
     * is for the UNDRIVEN director path, where `cut()` can land on an overhead rig with no lock
     * at all; without it that path would rotate the map with the body.
     */
    const f = this._lockYaw != null
      ? this._lockYaw
      : (isPlanLocked(shot) ? PLAN_YAW : runner.facing);
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
      case 'wide':
      case 'iso':
      case 'top': {
        /*
         * 🎥 A HELD PERSPECTIVE. The overhead rigs take no pitch — `perspectiveEye` refuses it —
         * because a top-down view you can tilt is a chase camera with extra steps, and tilting
         * it is how a player loses the map they came to the view for.
         *
         * `this._rig` is the LIVE rig, which during a crane is a blend that is in no table. It
         * wins over the name, because for 1.35 s the name is where the camera is going and not
         * where it is.
         */
        const off = perspectiveEye(this._rig ?? shot, f, this._lockYaw != null ? this._lockPitch : 0);
        return out.set(p.x + off.x, off.y, p.z + off.z);
      }
      case 'chase':
      default: {
        /*
         * ⚠️ **THE DROP GOES THROUGH HERE, SO CHASE HAS TO HONOUR THE LIVE RIG TOO.** Coming
         * home the lock is already `chase` on the first frame; solving it from `chaseOrbitOffset`
         * would put the eye at 1.62 m instantly and the 9 m crane would never be seen. The two
         * paths agree at rest — `PERSPECTIVE_RIG.chase` carries the same 2.90 / 1.62 / 0.35 as
         * `CHASE_DIST` / `CHASE_HEIGHT` / `CHASE_LATERAL`, and gate F11g now asserts that,
         * because nothing did and they are two sources of one truth.
         */
        if (this._rig) {
          const off = perspectiveEye(this._rig, f, this._lockYaw != null ? this._lockPitch : 0);
          return out.set(p.x + off.x, off.y, p.z + off.z);
        }
        const off = chaseOrbitOffset(f, this._lockYaw != null ? this._lockPitch : 0);
        return out.set(p.x + off.x, off.y, p.z + off.z);
      }
    }
  }

  /* ===========================================================================================
   * 🕹️ **THE STICK'S FRAME IS WHERE YOU ARE STEERING, NOT WHERE THE CAMERA ENDED UP.**
   *
   * This measured the yaw of the actual lens — `eye → look` — and that is the second half of
   * John's note: *"if the camera clips the wall it pushes into the players robot and the
   * direction of the movement is affected."*
   *
   * Those are not two bugs. Every time the operator corrected the shot around a wall, the eye
   * moved, so this number changed, so FORWARD ROTATED UNDER THE PLAYER'S THUMB — while they were
   * pushing the stick. Worse, `_reel`'s last resort dropped the eye behind `runner.facing`, a
   * different yaw entirely, so a bad corner could swing the controls in one frame. The player is
   * fighting geometry they cannot see and it reads as the controls being broken, which is the one
   * read a controller must never produce.
   *
   * `_lockYaw` is the yaw the player is actually steering: seeded from the body and integrated
   * from the look stick by `stepLookOrbit`, and NOTHING else writes it. So on a live run — which
   * is chase-locked by `liveRunShot` — the frame is now immune to any camera correction, and the
   * operator is free to lift, swing and pull in to find a clear shot without touching the
   * controls. Measuring the lens is kept only for the undriven cameras (warm, intros), where
   * there is no stick and no lock.
   * =========================================================================================== */
  basisYaw() {
    if (this._lockYaw != null) return this._lockYaw;
    return this.lensYaw();
  }

  /** Where the lens actually points. The old `basisYaw`, kept for the undriven cameras and the drive. */
  lensYaw() {
    const dx = this.look.x - this.eye.x;
    const dz = this.look.z - this.eye.z;
    if (dx * dx + dz * dz < 1e-8) return 0;
    return lookYaw(dx, dz);
  }

  /**
   * Can this shot be taken at all? Three refusals, and every one of them is a picture a viewer
   * would read as a bug: an eye in the void, an eye in the ceiling, an eye behind a wall.
   */
  _valid(eye, runner) {
    /*
     * ⚠️ **AN OVERHEAD PERSPECTIVE IS SUPPOSED TO BE OUTSIDE THE ROOM.** Every refusal below is
     * about a lens that has ended up somewhere a viewer would read as a bug — in the void, in the
     * ceiling, behind a wall. For `iso` and `top` the eye is ABOVE the storey on purpose, looking
     * in through a roof the bed has taken off (`room.setLid(false)`), so all three tests would
     * refuse the shot on every frame and the reel would spend the whole run fighting it.
     */
    if (isOverhead(this.shot)) return true;
    const space = this.room.spaceAt(eye);
    if (!space) return false;
    if (eye.y > (space.storey ?? 4.8) - EYE_CEIL_MARGIN) return false;
    this._aim.set(runner.pos.x, 1.35, runner.pos.z);
    if (this.room.blocksSight(eye, this._aim)) return false;
    return true;
  }

  /* ===========================================================================================
   * 🎥 **FIND A CLEAR SHOT WITHOUT CLIMBING INSIDE THE PLAYER.**
   *
   * The old version had one move — pull straight in along the eye→runner ray — and it went as far
   * as 0.20 of the distance, which is 0.58 m from the chest of a robot half a metre wide. John
   * hit it immediately: *"if the camera clips the wall it pushes into the players robot."*
   *
   * Pulling in is now the LAST thing tried rather than the only thing, because it is the most
   * destructive: it changes how big the player is on screen, which is the one framing cue the
   * runner is steering by. In order of least damage:
   *
   *   1. **Swing** around the corner at full distance. Cheapest — the player stays the same size
   *      and the shot just comes from a little further round. Only safe to do since `basisYaw`
   *      stopped taking the controls' frame from where the lens ended up.
   *   2. **Lift** over something low. Furniture, a stair rail, a crate.
   *   3. **Pull in**, and never past `CAM_MIN_DIST`.
   *
   * The last resort places the eye at that floor distance behind the STEERED yaw. It used to use
   * `runner.facing` — a different angle — so the worst corner in the house also snapped the
   * camera to a new frame, on the frame the player most needed it to hold still.
   * =========================================================================================== */
  _reel(eye, runner) {
    this.reels++;
    this._aim.set(runner.pos.x, CHASE_LOOK_Y, runner.pos.z);
    const dx = eye.x - this._aim.x;
    const dz = eye.z - this._aim.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-4) return false;
    const yaw0 = Math.atan2(dx, dz);

    for (const c of REEL_TRIES) {
      const d = Math.max(CAM_MIN_DIST, dist * c.k);
      const yaw = yaw0 + c.swing * CAM_SWING;
      this._want.set(
        this._aim.x + Math.sin(yaw) * d,
        Math.min(CHASE_EYE_Y_MAX, eye.y + c.lift * CAM_LIFT),
        this._aim.z + Math.cos(yaw) * d,
      );
      if (this._valid(this._want, runner)) { eye.copy(this._want); this.reelWins[REEL_TRIES.indexOf(c)]++; return true; }
    }
    this.reelWins[REEL_TRIES.length]++;

    const f = this.basisYaw();
    eye.set(
      this._aim.x - Math.sin(f) * CAM_MIN_DIST,
      CHASE_HEIGHT,
      this._aim.z - Math.cos(f) * CAM_MIN_DIST,
    );
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
      this.look.set(runner.pos.x, 1.30, runner.pos.z);
      this.until = 5.5 + this.rng() * 3.5;
      return;
    }
    this.shot = 'chase';
    this._solve('chase', runner, this._want);
    this._reel(this._want, runner);
    this.eye.copy(this._want);
    this.look.set(runner.pos.x, 1.30, runner.pos.z);
    this.until = 5.5 + this.rng() * 3.5;
  }

  /**
   * @param speed01  the runner's speed as a fraction of `MOVE.run` — the handheld scales with it,
   *                 so the lens is calm on a creep and alive on a sprint.
   * @param [opts.lockShot]  pin the operator (`chase` on a live run). Null keeps the old cuts.
   * @param [opts.lookX]     right-stick yaw, −1..1.
   * @param [opts.lookY]     right-stick pitch, −1..1 (up = look up).
   * @param [opts.followFacing]  scripted fallback: stay behind the body. Driven look holds.
   */
  update(dt, t, runner, camera, lastPortal, speed01, opts = {}) {
    const lock = opts.lockShot && SHOTS.includes(opts.lockShot) ? opts.lockShot : null;
    /* The live rig and how far through the crane we are. Both are the bed's to own — the
     * operator is told where the camera should be, it does not decide when the show changes. */
    this._rig = opts.rig ?? null;
    this._blend = Math.max(0, Math.min(1, Number(opts.blend) || 0));
    if (lock) {
      this.shot = lock;
      this.until = 1e9;
      this._seeded = true;
      /* =======================================================================================
       * 🕹️ **`_lockYaw` IS SET FOR EVERY PERSPECTIVE NOW, NOT NULLED — and this one `else` was
       * costing the game its controls on three rigs out of four.**
       *
       * `basisYaw()` returns `_lockYaw` when it has one and falls through to `lensYaw()` when it
       * does not. Nulling it here meant `wide` / `iso` / `top` took their movement frame from
       * WHERE THE LENS ENDED UP — the exact defect the block above `basisYaw` says was removed,
       * reintroduced the moment a second perspective existed. On `top` it was worse than the
       * original: that yaw is read off a 1.20 m baseline against an eye that is lerping and
       * handheld-swaying, so forward drifted continuously under a resting thumb.
       *
       * Three arms, and every rig now has a real steered yaw:
       *   · **plan-locked** (`iso`, `top`) hold `PLAN_YAW`. The map does not turn, and the stick
       *     becomes absolute — see `PLAN_YAW`'s block in `follow.js` for the arithmetic.
       *   · **orbiting perspectives** (`chase`, `wide`) integrate the look stick exactly as chase
       *     always has. This is also what makes `wide`'s advertised `orbit: true` true: it was
       *     unreachable before, because the pitch it needs was never non-zero.
       *   · **a pinned director shot** (`?shot=lead`) keeps the old null. Those are framed from
       *     the body by `_solve` and have no steered frame of their own.
       * ======================================================================================= */
      if (isPlanLocked(lock)) {
        /*
         * 🧭 The frame swings to plan north ON THE CRANE'S OWN CURVE, not on the first frame.
         * `_yawFrom` is captured once, when the lock becomes plan-locked, so the slerp is a
         * function of the blend rather than an integrator — that makes the boom and the frame
         * provably arrive together, and it is why the stick cannot disagree with the screen
         * part-way up. Shortest arc, so a chase pointing at 3.0 rad turns the near way.
         */
        if (this._lockYaw == null) {
          this._lockYaw = PLAN_YAW;
          this._lockPitch = 0;
          this._yawFrom = PLAN_YAW;
          this._pitchFrom = 0;
        } else {
          if (this._yawFrom == null) { this._yawFrom = this._lockYaw; this._pitchFrom = this._lockPitch; }
          const turn = Math.atan2(
            Math.sin(PLAN_YAW - this._yawFrom),
            Math.cos(PLAN_YAW - this._yawFrom));
          this._lockYaw = this._yawFrom + turn * this._blend;
          this._lockPitch = this._pitchFrom * (1 - this._blend);
        }
      } else if (PERSPECTIVES.includes(lock)) {
        this._yawFrom = null;
        this._pitchFrom = null;
        if (this._lockYaw == null) {
          this._lockYaw = runner.facing;
          this._lockPitch = 0;
          this.look.set(runner.pos.x, CHASE_LOOK_Y, runner.pos.z);
          this._solve(lock, runner, this.eye);
        }
        const orbit = stepLookOrbit(this._lockYaw, this._lockPitch, opts.lookX, opts.lookY, dt);
        this._lockYaw = orbit.yaw;
        this._lockPitch = orbit.pitch;
        // Standalone / undriven schedule: no look stick, so keep the lens behind the body.
        // A driven pad that released look HOLDS — recentering would fight the aim.
        if (opts.followFacing && stickMag(opts.lookX, opts.lookY) <= 0) {
          const turn = Math.atan2(
            Math.sin(runner.facing - this._lockYaw),
            Math.cos(runner.facing - this._lockYaw));
          const k = 1 - Math.exp(-4.2 * dt);
          this._lockYaw += turn * k;
          this._lockPitch += (0 - this._lockPitch) * k;
        }
      } else {
        this._lockYaw = null;
        this._lockPitch = 0;
        this._yawFrom = null;
        this._pitchFrom = null;
      }
    } else {
      this._lockYaw = null;
      this._lockPitch = 0;
      this._yawFrom = null;
      this._pitchFrom = null;
      if (!this._seeded) { this._seeded = true; this.cut(runner, lastPortal); }
      this.until -= dt;
      if (this.until <= 0) this.cut(runner, lastPortal);
    }

    this._solve(this.shot, runner, this._want);
    if (!this._valid(this._want, runner)) this._reel(this._want, runner);

    /*
     * The operator LAGS. A camera welded to a body reads as a drone; a camera that arrives a
     * beat late reads as a person carrying it.
     *
     * 🎬 **AND IT STOPS LAGGING AS THE VIEW BECOMES A MAP.** A 6.5 rate is a person's arm; on a
     * crane it is a boom that arrives soft and mushy at exactly the moment the move needs to
     * feel ARRIVED, and overhead it is a map that slides behind the runner. `mapness` is 0 at
     * the chase rig, so every ground shot keeps the shipped 6.5 unchanged, and 1 at `top`.
     * Handheld becoming mechanical is itself the signal that the show changed cameras.
     */
    const mapness = rigMapness(this._rig ?? PERSPECTIVE_RIG[this.shot]);
    const k = this.shot === 'doorway' ? 1 : 1 - Math.exp(-(6.5 + 26 * mapness) * dt);
    this.eye.lerp(this._want, k);

    /* =========================================================================================
     * 🚨 **THE FLOOR IS ENFORCED HERE, ON THE FINAL EYE — NOT ONLY ON THE TARGET.**
     *
     * `_reel` clamps every candidate to `CAM_MIN_DIST`, and that is not enough, which the drive
     * caught: with a swing-dominated ladder the measured minimum got WORSE than the defect it
     * replaced — 0.42 m against the old 0.58 m — while every single target was a legal 1.15 m or
     * more. The lerp is the culprit. It moves the eye in a STRAIGHT LINE toward the next target,
     * so when a correction swings the lens most of the way around the runner, the chord between
     * the old and new positions passes straight through them. Nothing that only checks targets
     * can see this; it is a property of the path, not of the destination.
     *
     * So the invariant is applied last, to the thing the player actually looks through: push the
     * eye back out along its own bearing whenever smoothing has brought it inside the floor.
     * ========================================================================================= */
    const ex = this.eye.x - runner.pos.x;
    const ez = this.eye.z - runner.pos.z;
    const eDist = Math.hypot(ex, ez);
    // From twelve metres up you cannot be inside the robot, and `top` sits deliberately close in
    // plan. The floor is about the chase lens; applying it overhead would only shove the map.
    if (!isOverhead(this.shot) && eDist > 1e-4 && eDist < CAM_MIN_DIST) {
      const s = CAM_MIN_DIST / eDist;
      this.eye.x = runner.pos.x + ex * s;
      this.eye.z = runner.pos.z + ez * s;
    }

    // Handheld. Two low-frequency sines per axis so it never repeats on a visible period.
    // Handheld fades out as the view becomes a map (`mapness`): nobody is carrying a rig nine
    // metres up, and a drifting, rolling plan reads as a defect rather than as a camera operator.
    const g = (0.35 + speed01 * 0.65) * (1 - mapness);
    const sway = 0.020 * g;
    camera.position.set(
      this.eye.x + (Math.sin(t * 1.31) + Math.sin(t * 2.17) * 0.5) * sway,
      this.eye.y + (Math.sin(t * 1.77) + Math.sin(t * 3.11) * 0.4) * sway * 0.8,
      this.eye.z + (Math.cos(t * 1.09) + Math.cos(t * 2.53) * 0.5) * sway);

    // Frame the chest, not the feet, and lag the look too so a corner is a whip rather than a snap.
    this.look.lerp(this._aim.set(runner.pos.x, CHASE_LOOK_Y, runner.pos.z),
      1 - Math.exp(-(8.0 + 26 * mapness) * dt));
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

function spaceOfType(spaces, type) {
  if (!type) return null;
  return spaces.find((s) => s.roomType === type)
    ?? spaces.find((s) => s.id === type)
    ?? spaces.find((s) => String(s.id).endsWith(`.${type}`))
    ?? null;
}

/**
 * Chapel smash target — prefer the catalog `table-round` FurnProp already dressed
 * into the chapel. If dress missed it, a plain mesh in the chapel centre so the
 * night can still end. That fallback is approximate art; the catalog GLB is the
 * real piece (`rrr_prop_table-round_v1.glb`).
 */
function findTableRound(room, chapel) {
  const props = room.furnProps ?? [];
  const inChapel = chapel
    ? props.find((p) => /table-round/.test(String(p.id)) && p.spaceId === chapel.id)
    : null;
  if (inChapel) return { prop: inChapel, mesh: inChapel.mesh, fallback: false };
  const any = props.find((p) => /table-round/.test(String(p.id)));
  if (any) return { prop: any, mesh: any.mesh, fallback: false };
  return null;
}

function buildFallbackTable(space, floorY) {
  if (!space) return null;
  const group = new THREE.Group();
  group.name = 'mission-table-round';
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.06, 20),
    new THREE.MeshStandardMaterial({ color: 0x6b4a22, roughness: 0.48, metalness: 0.18 }));
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.12, 0.68, 10),
    new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 0.62, metalness: 0.08 }));
  top.position.y = 0.72;
  stem.position.y = 0.34;
  top.castShadow = true; stem.castShadow = true;
  group.add(stem, top);
  group.position.set((space.x0 + space.x1) / 2, floorY, (space.z0 + space.z1) / 2);
  return { group, intact: true };
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
  /*
   * 🌙 `nightOutside` — WHAT IS OUTSIDE THE BALLROOM'S WINDOWS. John, playing this view: *"there
   * is depth outside the windows in the asset but nothing going on outside in the primetime.bat."*
   *
   * ⚠️ **THE PARTY BED ASKS FOR IT AND `views/game.js` DOES NOT, BECAUSE THEY ARE TWO DIFFERENT
   * TIMES OF DAY.** That view mounts `game/exterior.js`, whose sun is *"a low late sun, warm"*;
   * this one is a night show. `room.js` therefore defaults the night exterior OFF and takes it
   * from here. `?ballnight=0` ablates it in one boot — see the flag's note in `game/room.js`.
   */
  const room = await engine.work(buildTestRoom(engine, { wallField, tables, nightOutside: true }));
  scene.add(room.root);
  stage('house');

  const ballroom = ballroomOf(room);
  const gallery = spaceOfType(room.spaces, MISSION_ROOM);
  const chapel = spaceOfType(room.spaces, 'chapel');

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

  /* =============================================================================================
   * 🕯️ **THE BALLROOM'S PRACTICALS — three chandeliers, nine sconces, two candelabra.**
   *
   * John: *"I have asked it a few times to put the assets as we worked on it with much more
   * details and furniture into the Prime Time … it seems it still hasn't done it. The ballroom
   * asset has many more objects… This will be the important room for most of the game so it
   * affords the amazing asset that we worked on."*
   *
   * He was right, and the reason it kept not happening is that there was nothing to find in the
   * ballroom files: **`ballroomFixtures` was already written, already shipping, and mounted in
   * exactly one place — `src/views/game.js`, the SURVIVAL view, behind an `?estate=port` flag.**
   * The party night builds the same house through the same `buildTestRoom` and simply never
   * called it. A census of both scenes put numbers on it: the asset had 23 lights and 873 pieces
   * of chandelier crystal; the ballroom the whole show is set in had six lights and none of it.
   *
   * ⚠️ **THIS IS THE WIRE, NOT A SECOND RECIPE.** Every argument below is the one `game.js`
   * passes, off the same `orderPlan` and the same baked `estate` materials, so the room the party
   * plays in is the room the asset view photographs rather than a near-miss of it. If the
   * fixtures are retuned, they are retuned once.
   *
   * ⚠️ **AND IT IS NON-FATAL.** A night that cannot build a chandelier is still a night; the show
   * must not fail to open because a practical threw.
   * ============================================================================================= */
  try {
    const sp = room.spaces.find((s) => s.order === 'ballroom' && s.orderPlan);
    if (sp) {
      const { ballroomFixtures } = await import('../lighting/ballroom-rig.js');
      /* =======================================================================================
       * 💡 **`points: 3` — AND THIS IS THE ONE ARGUMENT THAT DIFFERS FROM `views/game.js`.**
       *
       * The rig defaults to ZERO point lights and its header defends that at length: the survival
       * game's ballroom already owns direction from a shadow-casting KEY that `spaces.js` aims
       * across the colonnade, so the fixtures there are geometry plus glow decals and the house's
       * light budget never moves.
       *
       * Prime Time's ballroom is a different room with the same walls. It is the HERO SET — the
       * lobby, the intros, the recap, the debrief, the reckoning and the vote all happen in it,
       * which is most of the night — and a census put it at six lights against the asset's
       * twenty-three. It photographed as a brown box.
       *
       * John chose the night reading of the asset: *"Same geometry, same textures, same layout,
       * same fixtures — but the chandeliers and sconces are the light source instead of the sun,
       * and the room reads as a lit venue rather than an abandoned one."* So the fixtures have to
       * actually emit, and `SPEC` is this project's own ordered answer to that — the centre
       * chandelier's core at candle height, the musicians' gallery under its deck, and the window
       * wall's cold half. Three, ordered by how defensible each one is, rather than the asset's
       * seventeen. The daylight spot the asset drives through the windows is deliberately NOT
       * ported: that is option A, and it is a different show.
       * ======================================================================================= */
      const fx = ballroomFixtures({
        plan: sp.orderPlan,
        mats: {
          brass: room.materials?.estate?.brass,
          crystal: room.materials?.estate?.crystal,
        },
        points: 3,
        rng,
      });
      for (const m of fx.meshes) sp.root.add(m);
      for (const l of fx.lights) scene.add(l);
      if (fx.flicker) engine.onUpdate((_dt, t) => fx.flicker(t));
      engine.__ballroomRig = fx.stats;
    }
  } catch (e) {
    console.warn('[follow-bed] ballroom fixtures skipped —', e?.message ?? e);
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

  let table = findTableRound(room, chapel);
  let tableFallback = null;
  if (!table?.mesh && chapel) {
    tableFallback = buildFallbackTable(chapel, room.floorY ?? 0);
    if (tableFallback) {
      scene.add(tableFallback.group);
      table = { prop: null, mesh: tableFallback.group, fallback: true };
    }
  }

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
  /*
   * The two base intensities, captured once so the overhead duck is a pure scaling of the
   * shipped value rather than a second set of numbers that could drift from it.
   *
   * ⚠️ **AND `key` REALLY IS A CONSTANT ALL NIGHT, WHICH IS A PRE-EXISTING BUG THIS SLICE ONLY
   * DECLINES TO INHERIT.** `followRig`'s `read()` fills `want.key.i` from each space's own
   * `lights.key.intensity`, and `apply()` lerps positions and the hemisphere ground colour and
   * NEVER writes `L.key.intensity` — so every room's authored key brightness is dead and the
   * spot sits at its constructed 150 from boot to teardown. Capturing the base here is correct
   * either way; the day the per-room intensity is wired up, `KEY_I0` becomes `want.key.i` and
   * the duck below still means the same thing. Not fixed here: it is a lighting slice, not this
   * one, and quietly turning six rooms' key lights on inside a camera change is how a look
   * regression arrives with nobody's name on it.
   */
  const KEY_I0 = key.intensity;
  const FILL_I0 = fill.intensity;
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
    /** The held perspective: chase / wide / iso / top. The ballroom threshold picks it; `P` pins. */
    perspective: 'chase',
    /**
     * 🚪 What the LOOP last decided, and whether a human has overridden it.
     *
     * Two authorities write `perspective` now and they need a rule rather than a race. The
     * threshold writes it on a crossing; the dev `P` key writes it and raises `pinned`, which
     * mutes the loop until the runner next crosses the ballroom line — at which point the game
     * takes its camera back. That keeps `P` usable as the ceiling-art inspection tool
     * `docs/handoff/ballroom-next.md` documents without letting it strand the show in a
     * perspective the expedition did not ask for.
     */
    loopView: BALLROOM_PERSPECTIVE,
    pinned: false,
    /** What the rig was last applied for, so a CHANGE is what starts a crane. */
    appliedRig: null,
    /* 🎬 The crane between two rigs. `from` is whatever was on screen when the change landed —
     * not the table entry for `appliedRig` — so interrupting a crane half way bends the move
     * from where it actually is rather than snapping back to a rig nobody is looking at. */
    craneFrom: null,
    craneTo: null,
    craneT: 0,
    craneDur: 0,
    /** The rig actually on screen this frame. A blend is a legal rig that is not in the table. */
    liveRig: null,
    lidOff: false,
    /** Which spaces the roof is currently off over, joined. A memo so the walk re-scopes once. */
    lidScope: null,
    stick: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
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
  const mission = {
    phase: painting ? 'seek' : 'none',
    room: gallery?.id ?? null,
    spec: missionFor(1),
  };
  runner.root.visible = mode === 'run';

  const _dir = new THREE.Vector3();
  const _views = [{ pos: engine.camera.position, dir: _dir }];
  /* =============================================================================================
   * 👁️ **THE OVERHEAD VIEWPOINT IS THE RUNNER, NOT THE LENS.**
   *
   * `_views` holds a LIVE REFERENCE to the camera position, which is right for a chase — the
   * lens is where the player is looking from. Overhead it is wrong twice over, and the second
   * one is the expensive one:
   *
   *   · `iso` hangs 5.60 m back in plan, so standing near a wall the camera's XZ lands outside
   *     every space's footprint plus the 0.6 m pad. `spaceAt` returns null, `setViewpoints` falls
   *     back to `_cur`, and residency LATCHES on the last room the lens happened to be over
   *     while the runner walks on into one that then goes dark when its hold expires.
   *   · `dir` is near-vertical from above, so the portal-bleed facing test
   *     (`dx*dir.x + dz*dir.z` against `-0.35 * hypot`) is comparing against a horizontal
   *     component of roughly zero and admits or drops neighbours on noise.
   *
   * ⚠️ **`spaceAt` IGNORES Y** (`room.js` — a pure XZ AABB with a 0.6 m pad), so the height is
   * NOT the problem and an earlier draft of this slice was wrong to say residency collapses
   * because the eye is above the roof. It does not; it drifts sideways. The fix is the same
   * either way: from the moment the camera starts to lift, residency is keyed on the body, whose
   * position and heading are both meaningful at any perspective.
   * ============================================================================================= */
  const _runnerDir = new THREE.Vector3();
  const _runnerViews = [{ pos: runner.pos, dir: _runnerDir }];
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
    /*
     * ⚠️ **THE SAME FLOOR THE RUN CAMERA GOT, FOR THE SAME REASON.** This ladder ran to 0.16 of
     * the distance and then, when nothing on the ray was clear, put the eye ON the target and
     * lifted it 30 cm — which during intros is a lens inside the head of the robot walking in.
     * A gate control written for `FollowOperator._reel` found this second copy; it was the same
     * defect in the camera the room actually stares at for half a minute.
     *
     * Unlike the run camera this one deliberately does NOT swing. These cameras are composed
     * shots with nobody steering them, and the note above is a standing decision: the shot gets
     * tighter, never crooked. So it reels — it just stops at `CAM_MIN_DIST`.
     */
    const dx = eye.x - at.x, dz = eye.z - at.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-4) return eye;
    for (let k = 0.72; k >= 0.16; k -= 0.14) {
      const d = Math.max(CAM_MIN_DIST, dist * k);
      _reel.set(at.x + (dx / dist) * d, eye.y, at.z + (dz / dist) * d);
      if (!room.blocksSight(_reel, at)) { eye.copy(_reel); return eye; }
      if (d <= CAM_MIN_DIST) break;                 // the floor is reached; no point stepping on
    }
    // Nothing on the ray is clear. Hold the floor distance and lift, rather than climb inside it.
    eye.set(at.x + (dx / dist) * CAM_MIN_DIST, eye.y + 0.30, at.z + (dz / dist) * CAM_MIN_DIST);
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

  function swingHitObject(obj) {
    if (!obj) return false;
    _paintRay.set(runner.eye, runner.aimDir);
    _paintRay.near = 0;
    _paintRay.far = PAINTING_REACH;
    return _paintRay.intersectObject(obj, true).length > 0;
  }

  function smashCurrentTarget() {
    const spec = mission.spec ?? missionFor(1);
    if (spec.target === 'painting') {
      if (!painting?.intact) return false;
      if (!swingHitObject(painting.group)) return false;
      painting.intact = false;
      painting.group.visible = false;
      return true;
    }
    const mesh = table?.mesh ?? tableFallback?.group;
    if (!mesh) return false;
    const already = table?.prop?.isShattered || (tableFallback && !tableFallback.intact);
    if (already) return true;
    if (!swingHitObject(mesh) && !table?.prop?.isShattered) return false;
    if (table?.prop && !table.prop.isShattered) {
      table.prop.applyHit?.(runner.eye?.clone?.() ?? runner.pos, 8);
    }
    if (tableFallback) {
      tableFallback.intact = false;
      tableFallback.group.visible = false;
    }
    return true;
  }

  /**
   * Arm the smash for this expedition. Episode 1 is the gallery painting; 2+ is
   * the chapel table. Must reset `done` or the next Send-them-in reports home
   * on the first world tick and the clock yanks recap again.
   */
  function armMission(episode) {
    const spec = missionFor(episode);
    mission.spec = spec;
    if (spec.target === 'painting') {
      mission.phase = painting ? 'seek' : 'none';
      mission.room = gallery?.id ?? spec.room;
      return;
    }
    if (table?.prop?.isShattered) table.prop.reset?.();
    if (tableFallback) {
      tableFallback.intact = true;
      tableFallback.group.visible = true;
    }
    const ready = !!(table?.mesh || tableFallback?.group);
    mission.phase = ready ? 'seek' : 'none';
    mission.room = chapel?.id ?? table?.prop?.spaceId ?? spec.room;
  }

  /**
   * 🖼️ The mission, in three states.
   *
   * `seek` -> the armed target is up. A swing AIMED at it breaks it; a swing at anything else does not.
   * `return` -> the smash is down and the runner is told to go home.
   * `done` -> the runner is inside the ballroom. `src/party/room.js` `setWorld` turns that into
   *           the RECAP phase, and `net/party/local.mjs` `endRunOnMission` turns it into the
   *           recap beat — which is the ONLY thing that ends an episode short of the backstop
   *           clock in `src/party/show.js`. The clock then walks Recap → Debrief → Casting.
   */
  function missionTick(t) {
    if (mission.phase === 'seek') {
      const spec = mission.spec ?? missionFor(1);
      const smashed = spec.target === 'table-round' && table?.prop?.isShattered;
      if (smashed || (perf.contactAt >= 0 && t >= perf.contactAt && smashCurrentTarget())) {
        perf.contactAt = -1;
        mission.phase = 'return';
        mission.room = ballroom?.id ?? null;
      } else if (perf.contactAt >= 0 && t >= perf.contactAt) {
        perf.contactAt = -1;
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
     * 🎥 **CAMERA-RELATIVE, NOT A BODY-HEADING LATCH.** The latch was the right answer while the
     * operator cut to `lead` (screen-left became world-right). The live run is chase-only, so
     * the frame that cannot move under the thumb is the chase lens. `stickCamMove` is the
     * deadzoned stick as real strafe+forward; `aimYaw` is that lens' horizontal yaw; `_stepGround`
     * already walks aim-relative. Push up = into the shot.
     */
    if (perf.driven) {
      const s = perf.stick;
      const move = stickCamMove(s.x, s.y);
      runner.update(dt, t, {
        move,
        run: perf.run,
        aimYaw: operator.basisYaw(),
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

  /* =============================================================================================
   * 🕯️ **TAKING THE ROOF OFF IS NOT ENOUGH — THINGS HANG FROM IT.**
   *
   * `room.setLid(false)` hides ceiling PANELS, which is all the flyover ever needed. The first
   * overhead shots came back with a chandelier swinging through the middle of the frame in `iso`
   * and a lit blob covering a third of the floor in `top`: a chandelier is a prop hung under the
   * ceiling, not part of it, so the lid rule never touched it. John predicted the shape of this
   * before a line was written — *"the roof will probably need to be see through so they work."*
   *
   * ⚠️ **RESTORE ONLY WHAT WE TOOK**, the same conservatism `setLid` uses: `took` is checked
   * rather than assumed, so this can never turn something back on that another system had
   * deliberately hidden.
   */
  const _hangers = [];
  let _hangersFound = false;
  function setHangers(hide) {
    if (!_hangersFound) {
      _hangersFound = true;
      scene.traverse((o) => {
        if (/chandelier|pendant|sconce-hang/i.test(String(o.name || ''))) {
          _hangers.push({ o, took: false });
        }
      });
    }
    for (const e of _hangers) {
      if (hide) { if (e.o.visible) { e.o.visible = false; e.took = true; } }
      else if (e.took) { e.o.visible = true; e.took = false; }
    }
    return _hangers.filter((e) => e.took).length;
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

    /* =========================================================================================
     * 🎥 **THE HELD PERSPECTIVE, AND THE TWO THINGS IT HAS TO CHANGE BESIDES THE CAMERA.**
     *
     * John, asking for the toggles: *"The roof will probably need to be see through so they work.
     * The control and camera may also need to adapt the method for the different perspective
     * positions."* Both correct, and both are handled here rather than in the operator:
     *
     *  · **The roof.** `iso` and `top` look in from above, so the lid comes off — the flyover's
     *    own `room.setLid(false)`, which hides ceiling meshes and touches nothing a body, a ray
     *    or the hunter can feel. Toggled on CHANGE, never per frame.
     *  · **The lens.** Each rig carries its own field of view, because "the rooms scaled
     *    differently" is mostly how much of one you can see at once.
     *
     *  · **The controls.** This block used to claim they needed no special case, *"because the
     *    fix that stopped a wall rotating the stick made the frame `_lockYaw`, which is a real
     *    yaw at every perspective."* 🚨 **That was true of `chase` and of nothing else, and the
     *    claim outlived the code that would have made it true.** `_lockYaw` was NULLED for every
     *    other lock, so `basisYaw()` fell back to the lens on `wide` / `iso` / `top` and the
     *    stick's frame drifted with a swaying eye. It is now set on every perspective — see the
     *    three-arm block in `FollowOperator.update` — and only THEN is the sentence true.
     * ========================================================================================= */
    /* =========================================================================================
     * 📐 **A PINNED POSE OWNS THE CAMERA OUTRIGHT.**
     *
     * `?campose=` exists so the show camera can be stood in the SAME SPOT as
     * `harness/shoot.mjs --cam` puts the asset's, which is the only way to compare the two rooms
     * honestly — see `cleanCampose` in `src/party/follow.js` for why that comparison was missing
     * and what it cost. So it returns BEFORE the operator runs rather than fighting it for the
     * transform: an operator that still lagged, swayed and handheld-jittered a "fixed" pose would
     * give a contact sheet where every pair is a few centimetres and a few degrees apart, and
     * every real difference would be buried in that noise.
     *
     * Developer instrument only. It is never on a host-built slot (`followParams` cannot emit it)
     * and a night nobody typed a URL for never reaches this branch.
     * ========================================================================================= */
    if (opts.campose) {
      const c = opts.campose;
      engine.camera.position.set(c.eye[0], c.eye[1], c.eye[2]);
      engine.camera.up.set(0, 1, 0);
      engine.camera.lookAt(c.at[0], c.at[1], c.at[2]);
      if (c.fov && engine.camera.fov !== c.fov) {
        engine.camera.fov = c.fov;
        engine.camera.updateProjectionMatrix();
      }
      camLight.position.copy(engine.camera.position);
      // `_views` holds a live reference to the camera position but a COPY of the heading — the
      // door bleed reads it, and a stale heading lights the wrong side of every opening.
      engine.camera.getWorldDirection(_dir);
      room.setViewpoints(_views, dt);
      room.update?.(dt);
      return;
    }

    /* =========================================================================================
     * 🎬 **THE CRANE. A PERSPECTIVE CHANGE IS A CAMERA MOVE, NOT A CUT.**
     *
     * What this replaced: `appliedRig` flipped, the FOV snapped 58→52, every ceiling in the
     * house lost `visible` in one frame, and the key light jumped ×10 in intensity and ×3.9 in
     * range — all on the same frame. The only thing that moved was the eye, dragged 7.4 m by the
     * operator's `1-exp(-6.5·dt)` lag, and because a `lerp` is a CHORD that path went straight
     * through the ceiling plane. It read as a glitch, and it got away with the ceiling only
     * because the lid happened to be taken off first in the same frame.
     *
     * Now one eased scalar owns the whole change: the rig itself (`lerpRig`), the lens, the
     * steered yaw, the lid, the handheld, the operator's own lag, and the light. There is no
     * frame during a crane at which the camera is in a state nothing accounts for.
     *
     * ⚠️ **`craneFrom` IS WHAT IS ON SCREEN, NOT THE TABLE ENTRY FOR THE OLD NAME.** Press the
     * key twice quickly and the second crane starts from the half-risen rig the player is
     * actually looking at. Starting from `PERSPECTIVE_RIG[appliedRig]` would snap the boom back
     * down to a rig nobody has seen for half a second and then re-lift it.
     * ========================================================================================= */
    /* 🚪 The threshold decides the camera. See `perf.loopView` for who wins when a human has
     * pressed `P`, and `stepBallroomView` for the hysteresis that stops a doorway strobing it. */
    if (mode === 'run' && ballroom) {
      const loopWant = stepBallroomView(perf.loopView, runner.pos, ballroom);
      if (loopWant !== perf.loopView) {
        perf.loopView = loopWant;
        perf.pinned = false;               // a crossing is the loop taking its camera back
        perf.perspective = loopWant;
      } else if (!perf.pinned) {
        perf.perspective = loopWant;
      }
    }

    const want = runPerspective(mode, opts.pinShot, perf.perspective);
    if (want && want !== perf.appliedRig) {
      perf.craneFrom = perf.liveRig ?? PERSPECTIVE_RIG[perf.appliedRig] ?? PERSPECTIVE_RIG.chase;
      perf.craneTo = PERSPECTIVE_RIG[want] ?? PERSPECTIVE_RIG.chase;
      // Going out is the reveal and gets the time; coming home is a release and must not make
      // the player wait. The first application of a night is instant — there is nothing to
      // crane FROM, and a boom that flew in from the chase rig on the run cue would be a move
      // the show never made.
      perf.craneDur = perf.appliedRig == null ? 0
        : (isOverhead(want) ? RISE_SECONDS : DROP_SECONDS);
      perf.craneT = 0;
      perf.appliedRig = want;
    }

    if (perf.craneT < perf.craneDur) perf.craneT = Math.min(perf.craneDur, perf.craneT + dt);
    const craneS = perf.craneDur > 0 ? perf.craneT / perf.craneDur : 1;
    const craneEase = smootherstep(craneS);
    perf.liveRig = (!perf.craneTo || craneS >= 1)
      ? (perf.craneTo ?? PERSPECTIVE_RIG[want ?? 'chase'] ?? PERSPECTIVE_RIG.chase)
      : lerpRig(perf.craneFrom, perf.craneTo, craneS);

    if (perf.liveRig?.fov && Math.abs(engine.camera.fov - perf.liveRig.fov) > 1e-4) {
      engine.camera.fov = perf.liveRig.fov;
      engine.camera.updateProjectionMatrix();
    }

    /* 🏠 **THE ROOF COMES OFF WHEN THE CAMERA IS ABOUT TO RISE THROUGH IT — a height, not a
     * perspective name.** `LID_LIFT_H` is 3.2 m against a 4.8 m storey, so on the way up the
     * ceiling lifts away while the eye is still comfortably beneath it (the player watches it
     * go) and on the way down it is back before the eye drops under it. Expressing the rule in
     * metres rather than in `isOverhead(want)` also makes it exactly symmetric for free, and it
     * reproduces the old name test precisely on the four table rigs: chase 1.62 and wide 2.85
     * stay under, iso 5.60 and top 9.0 go over. */
    const lidOff = (perf.liveRig?.height ?? 0) >= LID_LIFT_H;
    if (lidOff !== perf.lidOff) {
      room.setLid?.(!lidOff, lidOff ? (room.residentIds?.() ?? null) : null);
      setHangers(lidOff);
      perf.lidOff = lidOff;
      perf.lidScope = lidOff ? ((room.residentIds?.() ?? []).join(',')) : null;
    }

    operator.update(dt, t, runner, engine.camera, perf.lastPortal, speed01, {
      lockShot: want,
      rig: perf.liveRig,
      blend: craneEase,
      lookX: perf.look.x,
      lookY: perf.look.y,
      followFacing: !perf.driven,
    });
    intro?.holdStep?.(dt, t);

    /*
     * 💡 **THE KEY LIGHT FOLLOWS THE LENS ON THE GROUND AND THE RUNNER FROM ABOVE, AND CROSSES
     * BETWEEN THE TWO RATHER THAN JUMPING.**
     *
     * On the chase rigs it rides just under and ahead of the lens, so it throws onto the runner
     * rather than flaring the lens it is attached to. Overhead that recipe fails outright: the
     * lamp is a point light with a 3.5 m reach and `top` puts it NINE metres up, so its light
     * never arrives and the first top-down shot came back almost black. From above it hangs over
     * the runner instead — the standard top-down key.
     *
     * ⚠️ **IT USED TO SWAP IN ONE FRAME**, which on a `P` press was a ×10 jump in intensity and
     * a ×3.9 jump in range — an exposure pop in the middle of what is now a camera move. Both
     * recipes are computed every frame and mixed by `mapness`, so the lamp climbs off the lens
     * and over the runner along the same curve as the boom. At the chase rig `mapness` is 0 and
     * the numbers are the shipped 3.5 / 1.4 exactly.
     */
    const lampMap = rigMapness(perf.liveRig);
    {
      // Where each recipe wants the lamp, then one crossfade over both.
      const overX = runner.pos.x;
      const overY = (runner.pos.y ?? 0) + POOL_UP;
      const overZ = runner.pos.z;
      const groundX = engine.camera.position.x;
      const groundY = engine.camera.position.y - 0.18;
      const groundZ = engine.camera.position.z;
      const mix = (a, b) => a + (b - a) * lampMap;
      camLight.position.set(mix(groundX, overX), mix(groundY, overY), mix(groundZ, overZ));
      camLight.distance = mix(3.5, POOL_DIST);
      camLight.intensity = mix(1.4, POOL_I);
    }

    /* 🌑 The room goes dark around the pool. See `OVERHEAD_KEY_DUCK` — the key spot is the light
     * that actually decides whether a hunter at 8 m is visible, because it does not care where
     * the runner's lamp is. Both are pure scalings of the base value by `mapness`, so the chase
     * rig is untouched and there is no state to get out of step. */
    key.intensity = KEY_I0 * (1 - OVERHEAD_KEY_DUCK * lampMap);
    fill.intensity = FILL_I0 * (1 - OVERHEAD_FILL_DUCK * lampMap);

    engine.camera.getWorldDirection(_dir);
    const space = room.spaceAt(runner.pos) ?? room.spaceAt(engine.camera.position);
    if (space) {
      rig.follow(space, dt, {
        pos: engine.camera.position, dir: _dir,
        portals: room.portals(), spaces: room.spaces,
      });
    }
    // The body owns residency the moment the camera starts to lift. See `_runnerViews`.
    if (lampMap > 0) {
      _runnerDir.set(Math.sin(runner.facing), 0, Math.cos(runner.facing));
      room.setViewpoints(_runnerViews, dt);
    } else {
      room.setViewpoints(_views, dt);
    }

    /* 🏠 **AND THE ROOF COMES OFF ONLY OVER WHAT RESIDENCY JUST ADMITTED.** The scope is applied
     * after `setViewpoints`, so it is this frame's set and not last frame's — the room you are
     * walking into opens as you arrive rather than a beat later. `party-loop.md`'s "Do not" is
     * narrowed, not repealed: the TV may see over the walls of the room the runner is in and the
     * ones a door away, and never the whole house. */
    if (perf.lidOff) {
      const ids = room.residentIds?.() ?? null;
      const key = ids ? ids.join(',') : '';
      if (key !== perf.lidScope) {
        perf.lidScope = key;
        room.setLid?.(false, ids);
      }
    }
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
     * reaches this switch it is one of six known shapes carrying only public fields.
     */
    /** 🟢 Link streams in flight — the intro bed owns them; this is the seam to the drive. */
    streamReport: () => intro?.streamReport?.() ?? [],

    /** 🎥 The lens: distance to the runner, the stick's frame, and how often it has corrected. */
    camReport: () => ({
      dist: +Math.hypot(
        engine.camera.position.x - runner.pos.x,
        engine.camera.position.z - runner.pos.z,
      ).toFixed(3),
      eyeY: +engine.camera.position.y.toFixed(3),
      basisYaw: +operator.basisYaw().toFixed(4),
      /*
       * Where the LENS actually points. This is what `basisYaw` used to return, and the whole
       * fix is that the two are now allowed to disagree: the camera may swing round a corner
       * while the stick's frame holds still. A probe that sees them drift apart is watching the
       * fix work; a probe that sees them locked together is looking at the old build.
       */
      lensYaw: +operator.lensYaw().toFixed(4),
      shot: operator.shot,
      reels: operator.reels,
      reelWins: operator.reelWins.slice(),
      /*
       * 🎬 **THE CRANE, REPORTED — because a moving camera cannot be photographed on a stopwatch.**
       *
       * `perspective-shots` used to cue a perspective, sleep 2.2 s and measure, which was sound
       * while a change was a cut. It is not sound now: the bed is paced by `dt`, `engine.js`
       * clamps `dt` to 0.1 to stop a spiral, and on a software rasteriser at ~3 fps that makes
       * sim time run at roughly a third of wall time. The instrument measured a camera that was
       * still on its way and reported the rig as wrong. So the settle is now OBSERVABLE: a probe
       * waits for `craning` to go false instead of guessing a duration.
       */
      craning: perf.craneT < perf.craneDur,
      craneS: +(perf.craneDur > 0 ? perf.craneT / perf.craneDur : 1).toFixed(4),
      rigHeight: +(perf.liveRig?.height ?? 0).toFixed(3),
      rigDist: +(perf.liveRig?.dist ?? 0).toFixed(3),
      mode,
    }),

    cue(c) {
      if (!c || typeof c !== 'object') return;
      if (c.kind === 'idle') {
        mode = intro ? 'intros' : 'warm';
        runner.root.visible = false;
        intro?.releaseRun?.();
        intro?.setTalk?.(true);
        return;
      }
      if (c.kind === 'noms') {
        intro?.setNominees?.(c.standing || []);
        return;
      }
      if (c.kind === 'pair') {
        intro?.setPairs?.(c.pairs || []);
        return;
      }
      if (c.kind === 'intros') {
        introCast = (c.cast || []).slice(0, 8);
        if (!introCast.length) return;
        const ids = introCast.map((s) => String(s.id)).join('\0');
        const have = intro?.castIds?.()?.join('\0');
        if (intro && have === ids) {
          intro.releaseRun?.();
          intro.setTalk?.(!!c.talk);
        } else {
          intro?.dispose();
          intro = buildIntroBed(engine, {
            room, cast: introCast, materials: botMats, avatar, reelSight: reelToSight,
            talk: !!c.talk,
          });
        }
        intro?.setNominees?.([]);
        mode = 'intros';
        runner.root.visible = false;
        return;
      }
      if (c.kind === 'run') {
        /*
         * ⚠️ THE CIRCLE STAYS. Disposing the intro bed on Send-them-in left an empty
         * ballroom (no chairs, no seated cast) for the whole expedition. The runner's
         * intro twin hides; everyone else keeps their chair. Recap / debrief reuse
         * the same bodies via `setTalk` rather than rebuilding.
         */
        intro?.holdForRun?.(c.runner);
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
        // The pair is sent in from the circle, so the night starts on the ballroom's own camera
        // and any pin from a previous episode's inspection is dropped with it.
        perf.loopView = BALLROOM_PERSPECTIVE;
        perf.pinned = false;
        armMission(c.episode ?? 1);
        return;
      }
      if (c.kind === 'shot' && SHOTS.includes(c.shot)) {
        /*
         * 🎥 **A PERSPECTIVE IS HELD; A SHOT IS CUT TO — AND ONLY ONE OF THOSE IS ALLOWED MID-RUN.**
         *
         * The rule that a live run is chase-only exists because an auto-cut to `shoulder` or
         * `lead` inverts a camera-relative stick and takes the runner's eyes off the frame their
         * thumb is steering. Choosing to PLAY top-down is the opposite of that: it is the player
         * (or John, on the dev key) deciding how the game is viewed, and it holds until they
         * change it again. So a perspective is accepted during a run and a director's shot is not.
         */
        if (PERSPECTIVES.includes(c.shot)) { perf.perspective = c.shot; perf.pinned = true; return; }
        if (liveRunShot(mode, opts.pinShot) === 'chase') return;
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
        perf.look.x = Math.max(-1, Math.min(1, +c.lookX || 0));
        perf.look.y = Math.max(-1, Math.min(1, +c.lookY || 0));
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
      // The camera the show is actually on, so the pad can match it. `appliedRig` and not the
      // live blend: a crane is 1.35 s and this channel is 2 Hz, so reporting the destination
      // means the sheet swaps once, at the start, rather than chattering through the move.
      view: perf.appliedRig ?? BALLROOM_PERSPECTIVE,
    }),
    /** The patrol, for `harness/party-follow-drive.mjs`. Never rendered, never on the wire. */
    hunterTelemetry: () => ({ ...hunter.telemetry(), room: hunter.roomId() }),
  };
}
