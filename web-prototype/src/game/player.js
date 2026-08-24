import * as THREE from 'three';
import { buildUnit4H } from '../characters/unit4h.js';
import { LimbRig, SOCKET_KIND, COLLAPSE_LIMB, collapseLimbHit } from './limbs.js';
import { Gait, detachKick, swingKick, fitSettle, sledgeKick } from './locomotion.js';
import { MOVE, WEAPON_COOLDOWN, WEAPON_DAMAGE, WEAPON_RANGE, PASS_H, STEP_H } from './rules.js';
import { SledgeRig, SLEDGE_POWER, SWING_DUR } from './sledge.js';
// Namespace import, deliberately not `{ playMeleeImpact }` — `audio-3` is landing that export
// in parallel and a missing NAMED import throws at module load, which would take the whole
// game down before either agent's slice was ever exercised. `audioMod.playMeleeImpact?.(...)`
// degrades to a silent no-op until it exists; see task-sledge.md §3.
import * as audioMod from '../audio/audio.js';

/**
 * THE PLAYER — third person, mouse-look, WASD.
 *
 * Two things make this more than a capsule with a mesh on it:
 *
 * 1. THE MOVEMENT MODEL IS CHOSEN BY WHAT IS STILL ATTACHED. `LimbRig.caps.gait` decides
 *    whether `_stepGround` or `_stepSkate` runs, what the top speed is, and whether the
 *    body can turn on the spot at all. Losing a leg is not a debuff multiplier bolted onto
 *    a walk — it changes the integrator: half speed, no run, and the hop-and-list gait in
 *    locomotion.js. Losing both drops you to a crawl at a sixth of walking pace, and the
 *    camera comes down with you.
 *
 * 2. ROCKET SKATES REPLACE THE MODEL OUTRIGHT (Dev Art 1785314396477). On foot, velocity
 *    chases the stick — press nothing and you stop in a third of a second. On skates you
 *    have momentum and grip: thrust goes along the body's facing, the stick steers the
 *    FACING rather than the velocity, and sideways velocity bleeds off slowly, so you
 *    carve, drift and overshoot. Stopping means turning sideways and scrubbing.
 *
 * The body's facing is separate from the aim. On foot the body chases the aim at
 * `MOVE.turnRate`, which is what gives the turn its lag and lets the gait bank into it.
 *
 * USE
 *   const p = new Player({ scene, world, field, height });
 *   p.update(dt, t, { move:{x,y}, run, aimYaw, aimPitch, fire, interact, swing });
 *   camera: `p.eye` and `p.cameraTarget` — or use ThirdPersonCamera below.
 */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
/** ThirdPersonCamera._cueStep's own scratch — see the warning at its use site. */
const _c1 = new THREE.Vector3();
const _c2 = new THREE.Vector3();
/** ...and `_roomOn`'s, for the same reason: `pivot` and `right` alias `_v`/`_v2`. */
const _c3 = new THREE.Vector3();
/** ...and the boom's volume probe (`clearVol`). Four more, same aliasing hazard. */
const _c4 = new THREE.Vector3();
const _c5 = new THREE.Vector3();
const _c6 = new THREE.Vector3();
const _c7 = new THREE.Vector3();

/** Seconds between shots for a weapon, from the shared table. Unknown names get a safe value. */
function cooldownFor(w) {
  const c = WEAPON_COOLDOWN[w];
  return typeof c === 'number' ? c : 0.5;
}

/**
 * How far ahead `_stepWorkAim` looks for the wall the player is working on. The same distance
 * `_resolveSledgeHit` casts (`WEAPON_RANGE.sledge + 0.9`), so the camera cannot frame a panel
 * that is out of the hammer's reach, and cannot miss one that is in it.
 */
const WORK_AIM_RANGE = WEAPON_RANGE.sledge + 0.9;
/**
 * Seconds a melee swing keeps the player counted as WORKING. Longer than the sledge's 0.95 s
 * cooldown by enough that a whole dig is one continuous state and a rhythm of blows cannot
 * make the camera pump, and long enough that stepping aside to LOOK at the hole you just made
 * is still part of the same activity — `critic-slice-3` flagged that graze case as unjudged.
 */
const WORK_HOLD = 3.0;

/* =============================================================================================
 * 🎯 **WHERE THE BLOW LANDS IS A FUNCTION OF PITCH ALONE. THE STANDOFF NO LONGER WRITES TO IT.**
 * =============================================================================================
 *
 * John, 2026-08-10: *"how the need to stand closer or further away sometimes to hit lower or
 * higher is also an odd feeling that takes from the satisfaction."*
 *
 * ⚠️ **IT IS A DEFECT, NOT A DESIGN, AND HERE IS THE ARITHMETIC.** The shipped ray was `aimDir`
 * with a fixed `y -= 0.18` and an origin 0.2 m behind the eye. Both origin and eye lie on the
 * same line, so the pullback cancels and the impact height reduces to one term:
 *
 *     impact y  =  eye.y  +  d · ( tan p − 0.18 · sec p )         d = horizontal standoff
 *
 * The bracket is a SLOPE and `d` multiplies it, so **standoff and pitch both write to one
 * output.** That product is the odd feeling, measured:
 *
 *   · level aim  slope −0.180 — the blow RISES 0.18 m for every metre you step closer
 *   · full down  slope −1.708 — it rises 1.71 m per metre, so a 30 cm shuffle moves the blow
 *     half a metre, and there is exactly ONE standoff (0.87 m) at which full-down aim reaches
 *     the skirting at all: nearer and it cannot get down there, further and the ray passes
 *     under the wall and hits nothing.
 *
 * 🚨 **AND THE `0.18` IS THE SMALLEST TERM IN IT** (`critic-dig-8` said so and is right). Zeroing
 * it takes the level slope from −0.180 to 0.000 — and the full-down slope only from **−1.708 to
 * −1.398**, an 18% dent in the one term that actually hurts (arithmetic, and `aim-reach` R1's
 * BEFORE row is the same number measured: 1.5385 − 1.708·d at full down pitch). The
 * coupling is the perspective projection itself, not the tilt: a ray aimed at a plane always
 * trades height for distance. **The only fix is to stop deriving the height from the ray.**
 *
 * 🚨 **AND ONE CORRECTION TO THE RECORD, BECAUSE IT REVERSES A NAMED FINDING.**
 * `critic-dig-8` §A4 reads `ThirdPersonCamera.look`'s clamp `[-0.95, 0.62]` as *"54.4° up, 35.5°
 * down… asymmetric in the wrong direction for this game"*. **It is the other way round.** In this
 * codebase NEGATIVE pitch is DOWN — `aimDir.y = sin(aimPitch)`, and `ThirdPersonCamera`'s own
 * `MAX_LIFT` block says in as many words that subtracting from `pitch` is *"extra downward
 * pitch"*. So the clamp is **54.4° DOWN against 35.5° up**, which is already the right way round
 * for a game whose reward is at the skirting. **The clamp is not moved, and moving it would only
 * cost the chase camera.** See `_aimHeight` for what the down half now buys instead.
 *
 * ---------------------------------------------------------------------------------------------
 * **WHAT REPLACES IT.** Two steps, and the second is the whole idea:
 *
 *   1. **FIND THE FACE, LEVEL.** `_aimFace` casts a short vertical fan of HORIZONTAL rays along
 *      the aim yaw and keeps the nearest damageable panel. Horizontal, so how low you are aiming
 *      cannot decide WHICH wall you are working on; a fan, so a face you have already opened at
 *      eye height is still found by the material left below it.
 *   2. **TAKE THE HEIGHT FROM PITCH.** `_aimHeight` maps pitch straight onto metres of wall —
 *      `AIM_RATE` metres per radian about a level rest height — clamps it to the floor and to the
 *      hammer's own reach sphere, and the ray is then built to AIM AT THAT POINT.
 *
 * The cast that follows is a real cast at a real point on a real face, so `castRay` still decides
 * what is actually hit and a collider in the way still eats the blow. Nothing downstream —
 * `applyHit`, `AimMark`, `workAim` — knows this changed.
 *
 * 🎯 **WHAT STANDOFF STILL CONTROLS, AND IT IS THE HONEST HALF:** the reach sphere. `AIM_MARGIN`
 * off `WORK_AIM_RANGE` leaves 2.23 m of arm, so the vertical envelope at standoff d is
 * `±√(2.23² − d²)`. **Standing closer buys you MORE WALL, not a different height** — which is the
 * sentence the mechanic should have been teaching all along.
 *
 * ⚠️ **`aimDecoupled = false` restores the shipped two lines byte-for-byte**, and it is not
 * decoration: `harness/scenarios/aim-reach.mjs` runs both arms in one page and the coupled arm is
 * the control that MUST fail the decoupling assertion. If it ever passes, the probe is lying.
 */
/** Metres of wall the impact point slides for one radian of pitch. See `_aimHeight`. */
const AIM_RATE = 2.60;
/** ...and where a dead-level look lands, as metres below the eye. 0.24 puts it at 1.30 m. */
const AIM_DROP = 0.24;
/** The lowest the blow may be aimed, above `world.floorY`. The brush takes the rest. */
const AIM_FLOOR = 0.06;
/** Held back off `WORK_AIM_RANGE` so an in-envelope aim point is always inside the cast. */
const AIM_MARGIN = 0.22;
/**
 * The face probe's sampling heights, as metres about the eye. Nearest hit wins.
 * ⚠️ Four rays, once per frame, on the same path the camera already casts ten from — and
 * `_resolveSledgeHit` only re-runs it on a contact frame, i.e. once per 0.95 s cooldown.
 */
const AIM_FAN = [0.45, 0, -0.70, -1.30];

export class Player {
  constructor(o = {}) {
    this.height = o.height ?? 1.7;
    this.id = o.id ?? 'p1';
    this.world = o.world ?? null;        // { collide(pos, r), floorY } — optional
    this.rng = o.rng ?? (() => 0.5);

    this.unit = o.unit ?? buildUnit4H({ height: this.height, materials: o.materials });
    this.rig = o.rig ?? new LimbRig({ unit: this.unit, field: o.field ?? null, id: this.id, rng: this.rng });
    // `plant: true` — the stance foot holds the ground instead of skidding. See the foot
    // plant block in locomotion.js; it is opt-in because the hunter blends the same class
    // over an authored hunch and never applies `offset`, so the frame it needs is not there.
    this.gait = new Gait(this.unit, { plant: true });

    // THE SLEDGEHAMMER. A second, independent held-prop system alongside `this.rig` — see
    // sledge.js's own header for why it is not routed through `LimbRig.pickUp()`. "sledge and
    // limbs coexist" (John, 2026-08-08): the hammer is equipped/unequipped through `interact()`
    // below and never touches a socket, so the four-socket limb model is untouched by its
    // presence.
    // `ownsProp: false` when the generated character is driving — its swing is a baked clip, so
    // the hammer hangs off a hand BONE instead of being fitted to two IK-solved hands.
    this.sledge = new SledgeRig({
      unit: this.unit, height: this.height, materials: o.materials,
      ownsProp: !(o.avatar),
      // The baked clip's own strike, measured off the head's world path: peak speed at 0.833.
      // See the note on `SledgeRig.contactPhase`.
      contactPhase: o.avatar ? 0.85 : undefined,
    });

    // root = world placement (position + facing). model = the gait's own offsets, so the
    // gait can bob, sway and bank without corrupting the authoritative transform.
    /*
     * ---- THE GENERATED CHARACTER, OPTIONAL AND OFF BY DEFAULT.
     *
     * `o.avatar` is a `createMeshAvatar()` result. When present it becomes the VISIBLE body and
     * the procedural unit keeps its job as the SKELETON — it is still posed every frame, still
     * owns the four sockets, and still solves the sledgehammer's two-handed grip. Only its meshes
     * stop drawing.
     *
     * ⚠️ THE UNIT IS NOT REPLACED, AND THAT IS THE POINT. `LimbRig`, `Gait`, `SledgeRig` and
     * `views/game.js` all reach into `unit.joints`, `unit.parts` and `unit.sockets`; swapping the
     * unit out would mean reimplementing all of that against a skinned mesh in one step. Hiding
     * its meshes changes what is on screen and nothing else, so arm 0 is bit-identical when the
     * avatar is absent.
     */
    this.avatar = o.avatar ?? null;

    this.root = new THREE.Group();
    this.root.name = `player.${this.id}`;
    this.model = new THREE.Group();
    this.model.add(this.unit.root);
    if (this.avatar) {
      this.model.add(this.avatar.root);
      this._hideProceduralBody();
    }
    this.root.add(this.model);
    if (o.scene) o.scene.add(this.root);

    this.pos = this.root.position;
    this.vel = new THREE.Vector3();
    this.facing = 0;          // body yaw, radians
    this.aimYaw = 0;          // where the camera/aim points
    this.aimPitch = -0.06;
    this.radius = this.height * 0.20;
    this.turnRate = 0;        // signed, for the gait's bank
    this.speed = 0;
    this.lateral = 0;
    this.alive = true;
    this.sitLock = false;

    this._prevAim = 0;
    this._fireCd = 0;
    this._interactCd = 0;

    // ---- WHAT YOU ARE WORKING ON — the one fact the camera needs to stop standing in front
    // of the game's only verb. See `_stepWorkAim` below and `ThirdPersonCamera`'s WORK FRAMING
    // block. `workAim` is the panel the NEXT swing would land on (the same ray
    // `_resolveSledgeHit` casts, shared through `_swingRay` so the camera cannot frame one
    // point while the hammer hits another); `workHot` says a melee swing happened recently
    // enough that the player is DIGGING rather than merely standing near a wall.
    this.workAim = null;
    this.workHot = false;
    this._meleeUntil = -1;
    /**
     * 🎯 THE ABLATION SWITCH for the pitch-alone aim — see the block above this class. `false`
     * restores the shipped fixed-tilt ray exactly, and `aim-reach.mjs` runs it as the control
     * that must FAIL. Live play is always `true`.
     */
    this.aimDecoupled = o.aimDecoupled !== false;
    /** Last frame's face probe, for a scenario that needs to see what the ray was aimed at. */
    this.aimFace = null;
    /** ...and the world point it was aimed at. Null on the coupled arm and on a miss. */
    this._aimAt = null;

    // ---- THE DISARM, AS AN EVENT. Losing an arm stows a two-handed hammer (the rule below in
    // `update()`), and until now it did so in complete silence: `critic-slice-3` watched a
    // player throw THIRTY punches at a wall after the hammer left, with a bottom-left label as
    // the only tell. The rule is right and stays; what was missing is that anything said so.
    // A counter as well as a callback, so a scenario can assert it without wiring a listener.
    this.disarms = 0;
    this.onDisarm = o.onDisarm ?? null;

    /**
     * 🦾 **THE COLLAPSE COST — see `hitByCollapse` below and `limbs.js`'s `COLLAPSE_LIMB`.**
     *
     * The shared table is hung on the player so an instrument has one reachable handle for the
     * ablation arm (`engine.player.collapseLimbs.on = false`) and for sweeping a constant
     * without editing the source. `views/game.js` sets `on` from `?limbs=`.
     *
     * ⚠️ **`limbsLost` IS A LIFETIME COUNTER, NOT ROUND STATE, and that is deliberate — it is
     * the same decision as `disarms` directly above.** `resetRound()` restores the BODY (strip
     * to loadout, sweep the field, refit every socket) and this rule adds **no round state of
     * its own**: it is a pure function of the event and the live rig, so there is nothing for a
     * respawn to clear. A counter that a scenario uses to say "did it fire at all across this
     * whole page" must survive the reset it is measuring across, or it cannot be used to prove
     * the reset happened.
     */
    this.collapseLimbs = o.collapseLimbs ?? COLLAPSE_LIMB;
    this.limbsLost = 0;

    /**
     * 🎛️ DIG POWER — a multiplier on what one blow takes out of a wall. John, 2026-08-09:
     * *"I want to abandon a set time for dig while we testing. I want to be able to ramp or
     * lower digging speed in game so I can try different levels."* Driven from a key in
     * `views/game.js`.
     *
     * 🚨 **THIS IS `_add()`'s `power`, NOT THE NUMBER ON THE KEY — AND SINCE 2026-08-10 THEY ARE
     * NOT THE SAME NUMBER.** John: *"the current .5 should be the 1x."* `views/game.js`'s
     * `DIG_POWERS` is his labels and multiplies by `DIG_UNIT` (0.5) on its way here, so the
     * default play rung ×1 arrives as **0.5** and the ×2 rung arrives as 1. **1 is still the
     * value every instrument sends** — they all call `panel.applyHit(point, 1)` and never come
     * through this field at all — so `dig-band`, `dig-free` and `sledge-check` cannot move; what
     * moved is which rung of the on-screen ladder that pacing is labelled as. The full argument,
     * and what each rung does to the brush as well as the deposit, is on `DIG_POWERS`.
     *
     * ⚠️ IT SCALES DAMAGE PER BLOW, NOT THE COOLDOWN. "Digging speed" is two numbers — how
     * hard a blow lands and how often you may land one — and only the first is safe to give a
     * key. The swing's cadence is choreography `critic-swing-2` passed and `sledge-check` gates,
     * and `WEAPON_COOLDOWN.sledge` is the clock `dig-band.mjs` measures John's minute against.
     */
    this.digPower = 1;

    /**
     * 🪜 THE STEP-UP's two fields. `_sill` is the world Y of the sill `room.collide()` stepped
     * over on the last frame (0 if none); `stepLift` is the smoothed MODEL offset that makes it
     * read as a step. See the block in `update()` and `rules.js` `STEP_H`. Neither is input to
     * anything: no query, no ray and no collider reads either of them.
     */
    this._sill = 0;
    this.stepLift = 0;

    // ---- SHOCK. A limb coming off has to be felt by the camera, not only reported by the
    // HUD. `shock` is a 0..1 impulse the third-person camera reads to punch its pitch, roll
    // and boom; the rig is the only thing that knows a socket emptied, so subscribe to it
    // rather than diffing caps once a frame.
    //
    // AND THE BODY REACTS, not only the camera. `Gait.impulse` throws a channel and lets it
    // come home under its own damping, so the same event that shakes the lens also shoves
    // the robot: it is knocked laterally AWAY from the side that emptied, yaws away from
    // it, drops on the hit, and the head whips the other way and catches up late. Losing a
    // leg buckles harder than losing an arm. The surviving arm is thrown out to catch the
    // balance — the one gesture that reads as a body reacting rather than a body being
    // edited. Because the impulse lands before the foot plant runs, a robot with a foot on
    // the ground pivots about that foot instead of sliding sideways.
    this.shock = 0;
    this.shockDir = 0;        // -1 left, +1 right — which side of the body it came off
    this._unsubRig = this.rig.onChange?.((_r, what) => {
      if (!what) return;
      /*
       * The generated body is one skinned mesh, so a limb coming off is not an object to remove —
       * it is a set of vertices weighted to a bone. The avatar collapses that bone; the limb that
       * flies away is still the procedural `LimbItem`, which is a separate object from the moment
       * it detaches and needs nothing from the mesh.
       */
      /*
       * ⚠️ RE-HIDE ON EVERY CHANGE, NOT ONLY ON ONES THAT NAME A SOCKET.
       *
       * This used to be gated on `what.socket`, and the SKATES do not have one — `LimbRig` fires
       * `{ kind: 'skates', on }` with no socket, because skates mount on `shinBoth` rather than
       * occupying a socket at all. `removeSkates()` then calls `hideJointMeshes(..., true)` to put
       * the procedural BOOTS back, since the skates ARE the feet while they are on.
       *
       * So a respawn — which strips the loadout, which takes the skates off — un-hid the old
       * robot's boots underneath the generated body, and nothing put them back. John hit it
       * exactly that way: "after respawning from an escape there are the old robot feet showing.
       * I had skates on at the time I finished."
       *
       * Same root cause as the floating arm: a one-shot hide, versus systems that legitimately
       * turn those meshes back on for their own reasons. The hide has to be re-asserted, not
       * assumed to hold.
       */
      if (this.avatar) {
        if (what.socket) this.avatar.setLimbVisible(what.socket, what.kind !== 'detach');
        /*
         * ⚠️ RE-HIDE THE WHOLE PROCEDURAL BODY ON EVERY SOCKET CHANGE, NOT JUST ON DETACH.
         *
         * A detached limb becomes its own visible object — correct, that is the limb flying
         * across the room. `LimbRig.attach()` then reparents THAT OBJECT back onto the unit, and
         * it arrives still visible, because the constructor's hide pass ran long before it
         * existed as a separate thing. The result is one procedural arm rendering on an otherwise
         * invisible procedural body: John's "an original robot arm floating in front of me after
         * I reattached the limb".
         *
         * Hiding is idempotent and costs a traverse of one character on an event that happens a
         * handful of times a run, so it runs on every change rather than trying to enumerate
         * which ones can introduce a newly-visible mesh.
         */
        this._hideProceduralBody();
      }
      if (what.kind === 'detach') {
        // A voluntary eject is a controlled act: the body acknowledges the load leaving, but
        // the camera does not lurch and the gait is not thrown. Reuses the fit reaction, which
        // is the right shape — a part changing hands rather than being torn away.
        if (what.voluntary) { fitSettle(this.gait, what.socket); return; }
        this.shock = 1;
        this.shockDir = what.socket === 'shoulderL' || what.socket === 'hipL' ? -1 : 1;
        detachKick(this.gait, what.socket);
        return;
      }
      // FITTING A LIMB IS A PHYSICAL EVENT TOO, and it was completely silent — a part
      // teleported onto the body with no acknowledgement, which is why swapping felt like
      // editing a character sheet rather than doing something to yourself. A limb is the
      // heaviest thing this robot handles: the body takes the load, sags on that side, and
      // recovers. Much smaller than `detachKick` and in the OPPOSITE direction — a limb
      // coming off throws you away from the socket, a limb going on pulls you onto it.
      if (what.kind === 'attach' || what.kind === 'gadget' || what.kind === 'swap') {
        fitSettle(this.gait, what.socket);
      }
    }) ?? null;

    // ---- NOISE. What the hunter can hear. Sprinting is loud, standing still is silent, and
    // pulling a trigger is the loudest thing in the room — see `HunterAI._sense`. Without
    // this the hunter's `hearRange` had nothing to scale against and hearing was really just
    // short-range sight.
    this.noise = 0;
    this._noiseSpike = 0;
  }

  get caps() { return this.rig.caps; }
  get eyeHeight() {
    const g = this.caps.gait;
    if (g === 'crawl') return this.height * 0.30;
    if (g === 'down') return this.height * 0.22;
    return this.height * MOVE.eyeHeight;
  }
  /** World-space eye point — where a weapon trace starts and where the camera looks. */
  get eye() { return _v.copy(this.pos).setY(this.pos.y + this.eyeHeight).clone(); }
  get aimDir() {
    return new THREE.Vector3(
      Math.sin(this.aimYaw) * Math.cos(this.aimPitch),
      Math.sin(this.aimPitch),
      Math.cos(this.aimYaw) * Math.cos(this.aimPitch));
  }

  /**
   * @param {object} input
   *   move   {x,y} normalised stick, y = forward
   *   run    boolean
   *   aimYaw / aimPitch  radians (the camera owns these)
   */
  update(dt, t, input = {}) {
    const caps = this.caps;
    // A TWO-HANDED HAMMER IN A ROBOT WITH ONE ARM IS A REAL STATE, and this is the decision
    // (task-sledge.md §7): the hammer is stowed the instant both arms are no longer present,
    // by whatever means — hit, absorbed, ejected. Checked every frame rather than only on the
    // event that caused it, so it cannot depend on subscription ordering. A two-handed pose on
    // a one-armed rig is never reachable; dropping the tool is the answer.
    //
    // 🚨 AND IT HAS TO SAY SO. The rule is not the bug; the silence was. `critic-slice-3`:
    // "SLEDGEHAMMER -> FIST in a bottom-left label, and thirty punches followed." Fire an
    // event so `views/game.js` can spend the callout slot and the prompt slot on it. Do NOT
    // resolve it by letting a one-armed robot swing a two-handed hammer — task-sledge.md §7
    // rejected that explicitly, and a two-handed pose on a one-armed rig is not reachable.
    //
    // 🔨 **AND `wounded` IS THE HALF THAT DECIDES WHERE THE HAMMER GOES** (John, 2026-08-10:
    // *"the sledge also needs to drop on the floor instead of just floating in front of the
    // player"*). The two ways to arrive here are not the same event and must not have the same
    // answer:
    //   · **a socket is EMPTY** — a collapse or the hunter took the arm. Nothing is holding the
    //     tool, so it hits the floor: `views/game.js`'s `dropSledge()`. `unequip()`'s stow pose
    //     is authored for a body with two arms and is exactly the mid-air prop he is reporting.
    //   · **a socket is FULL of a GADGET** — the player deliberately fitted a nail gun. That is
    //     a tool swap, the hammer goes on the back where the stow pose belongs, and `owned`
    //     stays true so `[E]` draws it again the moment the arm is free. Dropping it here would
    //     make fitting a gadget silently cost you the hammer.
    // `caps.wounds` is the rig's own count of EMPTY sockets, so it separates them exactly.
    if (this.sledge.equipped && caps.arms < 2) {
      this.sledge.unequip();
      this.disarms++;
      this.onDisarm?.({ arms: caps.arms, owned: this.sledge.owned, wounded: caps.wounds > 0, t });
    }
    this.aimYaw = input.aimYaw ?? this.aimYaw;
    this.aimPitch = input.aimPitch ?? this.aimPitch;

    // Stick is always normalised here. `_targetFacing(mv, mlen, caps)` runs after the
    // sitLock branch; declaring these inside the else TDZ'd them once robots sat
    // (`VIEW "party.follow" FAILED` — ReferenceError: mv is not defined).
    const mv = input.move ?? { x: 0, y: 0 };
    let mlen = Math.hypot(mv.x, mv.y);
    if (mlen > 1) { mv.x /= mlen; mv.y /= mlen; mlen = 1; }

    /*
     * 🪑 SIT LOCK — intro twins occupy a chair AABB. `Player.collide` would shove them
     * back to the stand-mark every frame (that is why they used to idle in front of
     * the seat). The expedition runner never sets this; only `intro-bed` does.
     * Skip ground/skate stepping; facing still sees defined mv/mlen (mlen≈0 → aimYaw).
     */
    if (this.sitLock) {
      this.vel.set(0, 0, 0);
      this.speed = 0;
    } else if (caps.gait === 'skate') {
      this._stepSkate(dt, mv, mlen, input);
    } else if (caps.gait === 'down') {
      this.vel.set(0, 0, 0);
      this.speed = 0;
    } else {
      this._stepGround(dt, mv, mlen, input, caps);
    }

    // ---- GRAPPLE PULL. Overrides the stick while it is taut.
    //
    // `rules.js` gives the grapple 26 m — the longest reach in the game — at 18 damage and a
    // 1.4 s cooldown. As a hitscan that is a bad sniper rifle. What it is FOR is escaping:
    // the player cannot outrun the hunter in a straight line, so the answer to "I am cornered"
    // has to be a way to leave that does not depend on speed.
    //
    // Drives VELOCITY rather than teleporting, so the existing collide-and-integrate below
    // still runs: the line pulls you into walls and doorways honestly instead of through them.
    if (this._pull) {
      const to = this._pull.to;
      const dx = to.x - this.pos.x, dz = to.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      this._pull.left -= dt;
      // let go on arrival, on timeout, or the frame the line stops making progress (a wall
      // between you and the anchor) — a pull that grinds against geometry reads as a bug.
      if (d < 0.55 || this._pull.left <= 0 || (this._pull.lastD != null && d > this._pull.lastD - 0.004)) {
        this._pull = null;
      } else {
        this._pull.lastD = d;
        const sp = MOVE.run * 2.1;
        this.vel.set((dx / d) * sp, 0, (dz / d) * sp);
      }
    }

    // ---- collide and integrate
    _v.copy(this.pos).addScaledVector(this.vel, dt);
    if (this.sitLock) {
      // Occupying a chair AABB: zero vel and pin y. Do not world-collide shove
      // and do not copy `_v` onto pos, or the sit park walks back to the stand-mark.
      this.vel.set(0, 0, 0);
      this.pos.y = this.world?.floorY ?? this.pos.y;
    } else {
      if (this.world?.collide) {
        // ⚠️ TWO ARGUMENTS. The third used to be `this.pos`, left over from a signature this
        // function has not had for a long time — and `room.collide` now takes a CLEAR HEIGHT there
        // (`rules.js` PASS_H), so passing a Vector3 would have made every player `[object Object]` tall.
        // 🪜 FOUR ARGUMENTS NOW. The fourth is the STEP-UP (`rules.js` `STEP_H`) and it is the
        // player's own, not the hunter's — see that table for the decision and for why the
        // hunter's BFS stays honest without sharing it.
        const r = this.world.collide(_v, this.radius, PASS_H.robot, STEP_H.robot);
        if (r) _v.copy(r);
        this._sill = this.world.sillTop?.() ?? 0;
      }
      // recover the velocity the collision actually allowed, so sliding along a wall does
      // not keep the full forward speed and the gait does not run on the spot
      if (dt > 0) this.vel.copy(_v).sub(this.pos).multiplyScalar(1 / dt);
      this.pos.copy(_v);
      this.pos.y = this.world?.floorY ?? 0;
    }

    /**
     * 🪜 **THE STEP HAS TO LOOK LIKE A STEP, AND IT IS A MODEL OFFSET ONLY.**
     *
     * `rules.js` `STEP_H` lets the collider ignore a sill up to 0.55 m — but there is no vertical
     * axis in this movement model, so without this the robot walks THROUGH half a metre of
     * standing plaster with its feet on the floor, and "I can walk through walls now" is what a
     * player would file. `Gait.offset` is already a body-space offset the model rides on, so the
     * lift goes there and moves nothing else.
     *
     * 🚨 **`pos.y` IS NOT TOUCHED AND MUST NOT BE.** `views/game.js`'s own reset audit says so in
     * as many words — *"`pos.y` is not tested and must not be: `Player.update` pins it to
     * `floorY` every frame"* — and the eye, the swing ray, `_stepWorkAim`, the camera boom and
     * every collider query hang off it. A cosmetic lift that moved the eye would move the aim,
     * which would move where the hammer lands, which is the one thing this whole slice exists to
     * make predictable.
     *
     * Chased rather than snapped (~14/s, about 0.07 s to settle) so stepping onto and off a sill
     * is a rise and a drop rather than a pop, and it comes home to exactly 0 rather than
     * asymptotically, so a body that is not on a sill is byte-identical to one that never was.
     */
    const wantLift = Math.max(0, (this._sill ?? 0) - this.pos.y);
    this.stepLift += (wantLift - this.stepLift) * (1 - Math.exp(-14 * dt));
    if (this.stepLift < 1e-4) this.stepLift = 0;

    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // ---- facing and the turn rate the gait banks with
    const prev = this.facing;
    this.facing = wrapLerpAngle(this.facing, this._targetFacing(mv, mlen, caps), 1 - Math.exp(-MOVE.turnRate * dt));
    this.turnRate = dt > 0 ? shortestAngle(prev, this.facing) / dt : 0;
    this.root.rotation.y = this.facing;

    // sideways component, for the skate carve
    _v2.set(Math.cos(this.facing), 0, -Math.sin(this.facing));
    this.lateral = this.vel.dot(_v2);

    // ---- animate
    this.rig.update(dt, t);
    // THE SLEDGE'S SWING PHASE ADVANCES BEFORE THE GAIT, AND THAT ORDER IS LOAD-BEARING.
    // `sledge.bodyDrive()` is a HELD body pose (root yaw/pitch/roll + hips/spine/chest/neck),
    // and `Gait` applies it before `_footPlant` so the planted feet see the rotation and
    // compensate for it — see the drive-layer note in locomotion.js. Handing it over after
    // `gait.update()` would apply this frame's body to last frame's feet. It returns a shared
    // frozen no-op object whenever the hammer is not mid-swing, so nothing changes for the
    // club, the walk, or a player who never picks the hammer up.
    this.sledge.update(dt, t);
    this.gait.drive = this.sledge.bodyDrive();
    this.gait.update(dt, {
      speed: this.speed,
      run: !!input.run && caps.canRun,
      gait: caps.gait,
      legs: { L: this.rig.occupant('hipL') === 'limb', R: this.rig.occupant('hipR') === 'limb' },
      arms: { L: this.rig.occupant('shoulderL') === 'limb', R: this.rig.occupant('shoulderR') === 'limb' },
      turn: this.turnRate,
      lateral: this.lateral,
    });
    // THE STRIKE IMPULSE, fired once as the swing passes its contact phase. Driven from the
    // rig's own phase rather than from `swingHit()` so the body reacts even when the swing
    // hits nothing — a miss with a heavy object still hauls you round, and a club that only
    // has weight when it connects is a club that telegraphs its own hit detection.
    const sw = this.rig.swinging ? (this.rig._swingPhase ?? 0) : null;
    if (sw != null && sw >= 0.42 && !this._swingKicked) {
      this._swingKicked = true;
      swingKick(this.gait, this.rig.heldHand ?? 'R', 'strike');
    } else if (sw == null) this._swingKicked = false;

    // ---- THE SLEDGEHAMMER'S CONTACT FRAME. (The phase itself advanced above, before the gait.)
    //
    // `sledge.swingHit()` is the same one-shot-latch shape as `rig.swingHit()` above, so it is
    // polled the same way, from the same place, instead of the game loop needing a second
    // hook. That is deliberate: `views/game.js` (not in this slice's file list) already polls
    // `player.rig.swingHit()` once per frame and calls `weapons.melee('limbClub', ...)` with a
    // literal, hardcoded weapon name — there was no way to plug a second, independently-
    // numbered weapon into that exact call site without editing a file this slice may not
    // touch. Resolving contact here instead needs nothing from outside: `Player.update()` is
    // already called every frame, and `this.world` (the room) is already a constructor arg.
    //
    // It stays HERE, after `gait.update()`, rather than moving up with the phase advance: the
    // strike impulse it fires (`sledgeKick(..., 'strike')`) is a spring kick, and firing it
    // before the gait would let it be stepped in the same frame it is thrown, halving it.
    const sh = this.sledge.swingHit();
    if (sh) this._resolveSledgeHit(sh);

    this.unit.setPose({ ...this.gait.pose, ...this.rig.poseOverrides(), ...this.sledge.poseOverrides() });

    /*
     * The avatar is updated AFTER the unit is posed, and that order is load-bearing: it
     * retargets the procedural arms onto its own, so it has to read a unit that has already
     * solved this frame. Run it before, and the arms are one frame behind the hammer they are
     * supposed to be gripping.
     */
    if (this.avatar) {
      /*
       * MOUNT ON THE FRAME THE HAMMER BECOMES EQUIPPED, not at construction. The player spawns
       * unarmed by design (task-sledge-pickup.md), so there is nothing to mount until the world
       * prop is picked up — and it has to come off again on unequip or a stowed hammer would
       * stay welded to the fist.
       */
      const wantMounted = this.sledge.equipped;
      if (wantMounted !== this.avatar.propMounted) {
        if (wantMounted) this.avatar.mountProp(this.sledge.root);
        else { this.avatar.unmountProp(); this.sledge._mount?.('stow'); }
      }
      /*
       * The swing is the clip now, so it is STARTED on the rising edge of the rig's own swing
       * rather than polled. `SledgeRig` still owns the clock — the phase, `CONTACT_PHASE` and the
       * body kick are unchanged — and `playAttack` retimes the clip to that clock so the picture
       * and the damage stay the same event.
       */
      const swinging = this.sledge.phase > 0;
      if (swinging && !this._wasSwinging) {
        this.avatar.playAttack(SWING_DUR);
        /*
         * ⚠️ THE CONTACT PHASE COMES FROM THE SWING THAT WAS JUST PICKED. The set is varied, and
         * each clip's head arrives at a different point in its own arc — 0.85 for the heavy chop,
         * and whatever the next one measures. Reading it back from the avatar keeps the damage on
         * the hammer no matter which clip came up.
         */
        this.sledge.contactPhase = this.avatar.swing?.contact ?? this.sledge.contactPhase;
      }
      this._wasSwinging = swinging;

      this.avatar.update(dt, { speed: this.speed, runAt: MOVE.run, swinging });
    }
    if (this.sitLock) {
      // Gait offset is a standing walk (bob, lean, foot-plant Z). Applied to the
      // model that holds the Meshy sit clip it shoves one twin into the cushion
      // and leaves the other crouched in front of the chair. Pin it.
      this.model.position.set(0, 0, 0);
      this.model.rotation.set(0, 0, 0);
    } else {
      const off = this.gait.offset;
      // 🪜 `stepLift` is the only term here that is not the gait's — see the block above `speed`.
      this.model.position.set(off.x, off.y + this.stepLift, off.z ?? 0);
      this.model.rotation.set(off.pitch, off.yaw, off.roll);
    }

    this._fireCd = Math.max(0, this._fireCd - dt);
    this._interactCd = Math.max(0, this._interactCd - dt);

    // ---- shock decays fast: it is an impact, not a status effect
    this.shock = Math.max(0, this.shock - dt / 0.55);

    // ---- what the next swing would hit, for the camera. One short ray; see `_stepWorkAim`.
    this._stepWorkAim(t);

    // ---- how much noise this body is making, 0..1.
    //
    // Speed against the RUN top speed, so walking is about half and a crawl is nearly
    // nothing, plus whatever the last trigger pull added. A stationary robot is silent, and
    // that is the point: standing still is now a real move.
    const moveNoise = Math.min(1, this.speed / MOVE.run);
    this._noiseSpike = Math.max(0, this._noiseSpike - dt / 1.25);
    this.noise = Math.max(moveNoise, this._noiseSpike);
  }

  /** Something loud happened at this body. 0..1, decays over ~1.25 s. */
  makeNoise(v = 1) { this._noiseSpike = Math.max(this._noiseSpike, Math.min(1, v)); }

  /**
   * THE SWING'S OWN RAY — extracted so that exactly ONE definition of "what am I about to hit"
   * exists in this file. `_resolveSledgeHit` casts it at the contact frame to decide what takes
   * damage; `_stepWorkAim` casts it every frame so the camera can frame that same square metre.
   * If these two ever disagreed, the camera would be composing a shot of a wall the hammer is
   * not hitting — which is the same class of bug as `play-critic-7`'s driver firing 340 bursts
   * at a wall it was facing away from, and the reason that driver now self-tests its aim.
   *
   * 🎯 **THE HEIGHT COMES FROM PITCH, NOT FROM THE RAY** — the whole argument is in the block
   * above this class. When a diggable face is in front of you the ray is BUILT to aim at a point
   * whose height `_aimHeight` chose; when there is none (a fist thrown at a bookcase, a swing at
   * open air) it falls back to the shipped ray, which is also what `aimDecoupled = false`
   * restores byte-for-byte: `aimDir` with 0.18 of downward tilt and the origin pulled 0.2 m back
   * behind the eye. See `_resolveSledgeHit`'s header for why it is `aimDir` and not the FK chain.
   */
  _swingRay(out = {}) {
    const eye = this.eye;
    const face = this.aimDecoupled ? this._aimFace(eye) : null;
    this.aimFace = face;
    if (!face) {
      // ⚠️ CLEARED, NOT LEFT. A stale aim point from the frame before would let `_swingCast`'s
      // fallback reach at a face this ray is no longer pointed at — and on the `aimDecoupled =
      // false` arm it would make the control arm quietly behave like the fixed one.
      this._aimAt = null;
      const dir = this.aimDir.clone();
      dir.y -= 0.18; dir.normalize();
      out.dir = dir;
      out.origin = eye.clone().addScaledVector(dir, -0.2);
      return out;
    }
    const y = this._aimHeight(eye, face.d);
    this._aimAt = new THREE.Vector3(face.x, y, face.z);
    const dir = this._aimAt.clone().sub(eye).normalize();
    out.dir = dir;
    // The same 0.2 m pullback the shipped ray used, so the cast's own length budget is unchanged.
    out.origin = eye.clone().addScaledVector(dir, -0.2);
    return out;
  }

  /**
   * 🎯 **WHAT THE NEXT BLOW ACTUALLY RESOLVES TO — ray, panel and point, in one place.**
   *
   * `_stepWorkAim` and `_resolveSledgeHit` both need the same answer and used to cast the same
   * ray separately. They now share this, which is the same reason `_swingRay` exists: two casts
   * of one ray is two chances to disagree.
   *
   * 🚨 **AND IT CARRIES THE FIX FOR A REGRESSION THE FIRST `aim-reach` RUN CAUGHT.** With the aim
   * decoupled you can hold the mark at the skirting, and after a few blows there is a HOLE at the
   * skirting — so the ray goes through it, `castRay(forDamage)` correctly reports the material
   * still standing somewhere else, and `workAim` went **null on 14 of 14 samples**. The camera's
   * work framing therefore never engaged (`work 0`, boom stuck at 2.9 m against its 1.90 m
   * working length) and the measured body-occlusion of the working square metre was **68.6%
   * against 33.2%** on the arm whose framing did engage. The mark vanished at exactly the moment
   * the player was doing the rewarded thing.
   *
   * **The player is still working on that face.** `_aimFace` already knows which face and where
   * on it, so when the cast finds nothing worth hitting, that aim point IS the answer — and
   * `applyHit` at a point inside your own hole is not a no-op, it is how a hole gets WIDER: the
   * 0.52 m brush still bites the rim. `AimMark` already draws exactly this case (`GONE_ALPHA` —
   * *"that part of the blow is free air"*), it just never got the chance to.
   *
   * ⚠️ **GUARDED, SO IT CANNOT REACH THROUGH SOMETHING SOLID.** The fallback is refused whenever
   * the cast stopped at anything NEARER than the aim point — a bookcase, a chained connector, the
   * hunter's own bulk. Only a clear line falls back.
   */
  _swingCast(out = {}) {
    const r = this._swingRay(out);
    const cast = this.world?.castRay?.(r.origin, r.dir, WORK_AIM_RANGE, { forDamage: true }) ?? null;
    // 🪑 Furniture in front of a dig face eats the blow — same reach, closer hit wins.
    // Shattered props have already dropped their collider, so they cannot win the cast.
    const hitFurn = cast?.furn && cast.furn.isDamageable ? cast.furn : null;
    if (hitFurn) {
      r.furn = hitFurn; r.panel = null;
      r.point = cast.point; r.normal = cast.normal;
      r.distance = cast.distance; r.through = false;
      r.partId = cast.partId ?? null;
      return r;
    }
    r.furn = null;
    r.partId = null;
    const hitPanel = cast?.panel ?? null;
    const worth = !!hitPanel && (!!hitPanel.spec?.dig || hitPanel.state?.isDamageable?.() === true);
    if (worth) {
      r.panel = hitPanel; r.point = cast.point; r.normal = cast.normal;
      r.distance = cast.distance; r.through = false;
      return r;
    }
    const face = this.aimFace, at = this._aimAt;
    const aimDist = at ? at.distanceTo(r.origin) : 0;
    const blocked = !!cast && cast.distance < aimDist - 0.05;
    if (face?.panel && at && !blocked) {
      r.panel = face.panel;
      r.point = at.clone();
      // Which way is out of the wall from where the player stands — `AimMark` reads the sign of
      // this against the panel's own normal to decide whether to sink the ring into the crater.
      r.normal = face.panel.normal.clone().multiplyScalar(face.panel.sideOf(this.pos));
      r.distance = aimDist;
      r.through = true;
      return r;
    }
    r.panel = hitPanel; r.point = cast?.point ?? null; r.normal = cast?.normal ?? null;
    r.distance = cast?.distance ?? 0; r.through = false;
    return r;
  }

  /**
   * 🎯 **WHICH FACE, AND HOW FAR — ASKED LEVEL, SO HEIGHT CANNOT ANSWER IT.**
   *
   * A vertical fan of HORIZONTAL rays along the aim yaw; nearest damageable panel wins. Every ray
   * shares the eye's (x, z) and the yaw, so they all meet a given face at the same (x, z) and
   * `hit.distance` on a horizontal ray IS the horizontal standoff — no trigonometry, and nothing
   * to get wrong about which plane a face lies in (`wall.js` `normal` is a Y rotation; there is no
   * `z = 0` assumption anywhere here).
   *
   * ⚠️ **THE FAN IS NOT REDUNDANCY, IT IS THE HOLE YOU JUST DUG.** `castRay(forDamage)` traces
   * `traceBoxes()`, i.e. the material that is STILL THERE — correctly, and the same property that
   * makes a shot go through your own breach. So a single eye-height ray walks straight through a
   * crater and reports the wall of the NEXT room, and the mark would jump a room mid-dig. The
   * lower samples find the material left under the hole; nearest wins, so the face you are stood
   * against always beats anything visible through it.
   *
   * ⚠️ Returns null rather than guessing. A null is what puts `_swingRay` back on the shipped ray.
   */
  _aimFace(eye) {
    if (!this.world?.castRay) return null;
    const fwd = new THREE.Vector3(Math.sin(this.aimYaw), 0, Math.cos(this.aimYaw));
    const from = new THREE.Vector3();
    const floor = (this.world.floorY ?? 0) + 0.05;
    let best = null;
    for (let i = 0; i < AIM_FAN.length; i++) {
      const y = eye.y + AIM_FAN[i];
      if (y < floor) continue;
      from.set(eye.x, y, eye.z);
      const hit = this.world.castRay(from, fwd, WORK_AIM_RANGE, { forDamage: true });
      const panel = hit?.panel ?? null;
      if (!panel) continue;
      if (!(panel.spec?.dig || panel.state?.isDamageable?.() === true)) continue;
      if (best && hit.distance >= best.d) continue;
      // read `hit.point` NOW — `from` is reused by the next iteration and `castRay` builds the
      // point off the origin it was handed.
      best = { d: hit.distance, x: hit.point.x, z: hit.point.z, panel, panelId: panel.id };
    }
    return best;
  }

  /**
   * 🎯 **HOW HIGH THE BLOW LANDS, FROM PITCH AND NOTHING ELSE.**
   *
   *     y  =  eye.y − AIM_DROP + AIM_RATE · aimPitch,  clamped to the floor and the reach sphere
   *
   * At `AIM_RATE = 2.60` the skirting sits at pitch **−0.477 rad**, i.e. **half** of the 0.95 rad
   * down clamp — at EVERY standoff in the envelope, where the shipped ray could only reach it
   * from a 0.87 m standoff and only at the very bottom of the clamp. The remaining half of the
   * down half is a deliberate dead band pinned at the floor: an undercut is the rewarded play
   * (`support.js`), so "all the way down" must be a place you can slam the mouse to and hold, not
   * a value you have to find.
   *
   * ⚠️ **THE ONE PLACE STANDOFF STILL SPEAKS IS THE REACH SPHERE, AND THAT IS THE POINT.**
   * `WORK_AIM_RANGE − AIM_MARGIN` = 2.23 m of arm about the eye, so the envelope at standoff `d`
   * is `±√(2.23² − d²)`: at 1.0 m you can put the blow anywhere from the floor to 3.53 m, at
   * 2.0 m only 0.56 m of wall either side of eye level. Standing closer buys WALL, not HEIGHT.
   * The clamp is silent inside the envelope, which is exactly where a dig happens.
   */
  _aimHeight(eye, d) {
    const reach = Math.max(0.1, WORK_AIM_RANGE - AIM_MARGIN);
    const dy = Math.sqrt(Math.max(0, reach * reach - d * d));
    const lo = Math.max((this.world?.floorY ?? 0) + AIM_FLOOR, eye.y - dy);
    const hi = Math.max(lo, eye.y + dy);
    const want = eye.y - AIM_DROP + AIM_RATE * this.aimPitch;
    return Math.min(hi, Math.max(lo, want));
  }

  /**
   * 🎯 WHAT THE PLAYER IS WORKING ON — the input to the camera's WORK FRAMING.
   *
   * `critic-slice-3`'s headline was that sixty blows in the gallery leave no change a player
   * can see, and the first of its three stacked causes is the one this feeds: the boom points
   * at the player, so **the player's own body covers 45.7–52.6% of the opening it is digging**,
   * on every blow of a sixty-second activity. `ThirdPersonCamera` cannot fix that without
   * knowing WHICH square metre is being read, and it must be the same one the hammer hits —
   * hence the shared `_swingRay`.
   *
   * Two conditions, deliberately separate:
   *   `workAim`  the geometric fact: the next swing lands on a damageable panel within reach.
   *   `workHot`  the intent: a melee swing was thrown inside WORK_HOLD seconds. Without it the
   *              camera would re-frame every time you walked past a wall, which is the same
   *              "camera moves for no reason the player can name" failure that makes third
   *              person unreadable. With it, the framing engages on your first blow, holds
   *              through a whole dig, and follows you when you step aside to look at the hole.
   *
   * ⚠️ GATED ON MELEE, and that is the guard that keeps this out of a firefight. A nail gun at
   * 22 m has no business pulling the lens sideways, and neither does a chained exit you cannot
   * damage (`spec.dig || state.isDamageable()` — `forDamage` traces stop on solid-but-not-
   * damageable geometry too, see `room.castRay`'s own note).
   */
  _stepWorkAim(t) {
    this.workHot = t < this._meleeUntil;
    const g = this.caps.gait;
    const melee = this.sledge.equipped
      || this.rig.activeWeapon === 'fist' || this.rig.activeWeapon === 'limbClub';
    if (!melee || g === 'skate' || g === 'down' || !this.world?.castRay) { this.workAim = null; return; }
    const c = this._swingCast();
    this.workAim = c.panel
      ? { point: c.point, normal: c.normal, distance: c.distance, panel: c.panel,
        dig: !!c.panel.spec?.dig, through: !!c.through }
      : null;
  }

  /**
   * 🎯 **HOW HARD THE NEXT BLOW LANDS, 0..N — the `power` the wall is about to be handed.**
   *
   * Extracted for the same reason `_swingRay` was: there must be exactly ONE definition of what
   * the next blow is, or `AimMark` draws a footprint the hammer does not have. Two paths reach a
   * damage field and they carry different numbers:
   *
   *   the hammer   `_resolveSledgeHit` -> `panel.applyHit(point, SLEDGE_POWER * digPower)`
   *   a fist/club  `weapons.melee` -> `panel.damage(hp, {point})` -> `applyHit(pt, hp/100)`,
   *                clamped to [0.02, 1] by `wall.js`'s own conversion (`POWER_PER_HP`)
   *
   * ⚠️ **THIS IS NOT A SECOND SOURCE OF TRUTH AND MUST NOT BECOME ONE.** Nothing damages anything
   * through it — it only reports. The clamp mirrors `wall.js` `damage()` deliberately, and if
   * that conversion ever moves this has to move with it; there is a gate on the pair
   * (`aim-mark.mjs` A2) precisely because a reporter that drifts from the thing it reports is
   * worse than no reporter.
   */
  nextBlowPower() {
    if (this.sledge.equipped) return SLEDGE_POWER * this.digPower;
    const w = this.rig.activeWeapon;
    const hp = WEAPON_DAMAGE[w];
    if (!hp) return 0;
    return Math.max(0.02, Math.min(1, hp / 100));
  }

  _targetFacing(mv, mlen, caps) {
    // On skates the body IS the steering; it never snaps to the aim.
    if (caps.gait === 'skate') return this.facing;
    // moving: face where you are going, but bias toward the aim so shooting reads
    if (mlen > 0.05) {
      // Negated with the strafe basis above — the body must face the direction it is actually
      // travelling. Leaving this unflipped would make a strafing robot walk sideways facing
      // the wrong way, which is subtler than inverted controls and would have outlived them.
      const moveYaw = Math.atan2(-mv.x, mv.y) + this.aimYaw;
      return moveYaw;
    }
    return this.aimYaw;
  }

  /** Walking, limping, crawling: velocity chases the stick. */
  _stepGround(dt, mv, mlen, input, caps) {
    const run = !!input.run && caps.canRun;
    const top = (run ? MOVE.run : MOVE.walk) * caps.speedScale;
    // a body carrying a limb in one fist is slower and cannot sprint flat out
    const carry = this.rig.held ? 0.88 : 1;
    // STRAFE SIGN. Forward in this codebase is `(sin yaw, cos yaw)` — see `aimDir` above and
    // unit4h's "+Z forward". The right-hand perpendicular to that is `(-cos yaw, sin yaw)`.
    // This originally used `(+cos yaw, -sin yaw)`, which is the LEFT perpendicular, so A and D
    // were swapped and the game was close to unplayable. Verified against the camera's own
    // matrixWorld rather than by reasoning about handedness: with the camera's right at
    // (+1, 0), driving move.x = +1 moved the player (-1.6, 0) — dot product negative.
    const want = _v2.set(
      Math.sin(this.aimYaw) * mv.y - Math.cos(this.aimYaw) * mv.x, 0,
      Math.cos(this.aimYaw) * mv.y + Math.sin(this.aimYaw) * mv.x)
      .multiplyScalar(top * carry * mlen);
    const rate = mlen > 0.05 ? MOVE.accel : MOVE.decel;
    // limping and crawling accelerate badly — the stagger is part of the punishment
    const k = 1 - Math.exp(-rate * caps.speedScale * dt);
    this.vel.x += (want.x - this.vel.x) * k;
    this.vel.z += (want.z - this.vel.z) * k;
  }

  /**
   * Rocket skates: thrust along the facing, steer the facing, and let the sideways
   * component survive. This is the whole reason skates feel different — you cannot stop,
   * you can only aim your momentum somewhere better.
   */
  _stepSkate(dt, mv, mlen, input) {
    // steering: the stick turns the BODY, and it turns less the faster you are going
    const authority = 1 / (1 + this.speed * 0.16);
    this.facing -= mv.x * 3.1 * authority * dt;

    const fwd = _v2.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    const thrust = Math.max(0, mv.y) * MOVE.skateAccel;
    const brake = Math.max(0, -mv.y) * MOVE.skateBrake;
    this.vel.addScaledVector(fwd, thrust * dt);

    // grip: kill the component across the skates, slowly. Low grip = drift.
    const right = _v.set(Math.cos(this.facing), 0, -Math.sin(this.facing));
    const side = this.vel.dot(right);
    this.vel.addScaledVector(right, -side * Math.min(1, MOVE.skateGrip * dt));

    // drag + brake
    const dragK = Math.exp(-(0.42 + brake * 5.0) * dt);
    this.vel.x *= dragK; this.vel.z *= dragK;

    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > MOVE.skateTop) { const s = MOVE.skateTop / sp; this.vel.x *= s; this.vel.z *= s; }
  }

  // ---- actions ------------------------------------------------------------

  /** Pick up / refit whatever is at your feet. Returns what happened, for the HUD. */
  /**
   * @param {*} field
   * @param {number} [radius]
   * @param {string|null} [target]  socket the HUD cursor is on (Model C). Tried FIRST; the
   *   fixed scan below is the fallback for callers that have no cursor (scenarios, the
   *   capture Director, the net client).
   */
  /**
   * Latch the grapple onto a point and haul yourself to it. Called by the weapon system on a
   * grapple hit; ignored if a pull is already running so the line cannot be spammed into a
   * flight. `maxDist` keeps a miss at the far end of a 26 m trace from becoming a teleport
   * across the whole gallery.
   */
  grappleTo(point, maxDist = 26) {
    if (this._pull) return false;
    const d = Math.hypot(point.x - this.pos.x, point.z - this.pos.z);
    if (d < 1.2 || d > maxDist) return false;
    this._pull = { to: point.clone(), left: Math.min(1.6, d / (MOVE.run * 2.1) + 0.35), lastD: null };
    this.makeNoise(0.6);            // the line and the landing are not quiet
    return true;
  }

  /**
   * 🦾 **A COLLAPSE LANDED ON YOU — TAKE THE PART OFF.** One call per `collapse().events[]`
   * entry, from `views/game.js`'s `onChunk`. The RULE and every number in it is
   * `limbs.js`'s `collapseLimbHit`; this is the consequence.
   *
   * ---------------------------------------------------------------------------
   * 🚨 **IT CANNOT SOFT-LOCK THE PLAYER, AND THAT IS A PROOF RATHER THAN A HOPE.** The clause
   * that does it is `wounds === 0` inside the rule: **a collapse will not touch a body that is
   * already missing something.** So the worst state this rule can ever produce, from any
   * sequence of blows, is *four sockets minus one*, and there are exactly two of them:
   *
   *   · **one arm gone** — `caps.arms 1`, `legs 2`, gait **walk**. Full speed. The hammer stows
   *     (`update()` above, `task-sledge.md` §7) and cannot be redrawn until the arm is back,
   *     which is the cost; walking to the part and fitting it is untouched.
   *   · **one leg gone** — `caps.legs 1`, gait **limp** at `MOVE.limpScale` 0.44. Slower, and
   *     you can still dig while you do it.
   *
   * 🎯 **AND RETRIEVAL NEEDS NO HAND AT ALL.** `interact()`'s refit path is
   * `rig.attach(socket, item)`, which asks only that an arm goes in a shoulder — it does **not**
   * go through `pickUp()` and so never consults `_freeHandSide()`. A body with zero arms can
   * still walk over its own arm and press E. So even the states this rule refuses to create
   * (reachable only through the hunter, which is a different mechanic with its own rules) are
   * recoverable, and the one it CAN create is trivially so.
   *
   * ⚠️ **THE ONE STATE THAT IS NOT RECOVERABLE ON FOOT IS `downed`** — `caps.arms === 0 &&
   * caps.legs === 0`, `gaitFor` returns `'down'` and `speedScaleFor` returns 0, i.e. a body that
   * cannot move to anything. **This rule cannot reach it from any starting state**, because it
   * needs `wounds === 0` (all four sockets full) to fire and then empties exactly one.
   *
   * ---------------------------------------------------------------------------
   * 🎯 **WHERE THE PART LANDS, AND IT IS NOT IN THE RUBBLE.** The debris pile is not a collider
   * — the player walks through it — so a limb in the heap is retrievable but easily *lost* in
   * it, which turns the cost from "time" into "a search". The impulse is therefore thrown
   * **outward along the face normal and slightly to the side the material did NOT come from**,
   * so it clears the fall strip and lands on open floor a step or two behind the player, where
   * turning round finds it. `LimbField.bounds` (the room) keeps it in the room regardless.
   *
   * ⚠️ **BOTH `impulse` AND `spin` ARE PASSED, WHICH IS WHAT KEEPS THIS OFF THE RNG STREAM.**
   * `LimbField.drop()` draws from its seeded `rng` **only** when they are null, so a collapse
   * that takes an arm consumes zero draws and cannot shift the view's stream — the same
   * decision, for the same reason, as the per-plate `jit()` hash in `onChunk`.
   *
   * @param {object} ev  one `collapse().events[]` entry placed in the world — see
   *   `collapseLimbHit`'s jsdoc for the shape.
   * @returns {null|{socket, kind, side, item, effW, area, out, lat}}
   */
  hitByCollapse(ev) {
    const hit = collapseLimbHit(ev, {
      x: this.pos.x, y: this.pos.y, z: this.pos.z,
      eyeY: this.pos.y + this.eyeHeight,
      radius: this.radius,
      facing: this.facing,
      wounds: this.caps.wounds,
    }, this.collapseLimbs);
    if (!hit) return null;

    // along the face, floor plane — the same convention `views/game.js` and `debris.js` use.
    const tx = ev.nz, tz = -ev.nx;
    const away = hit.side === 'R' ? -1 : 1;
    const impulse = new THREE.Vector3(
      ev.nx * 2.30 + tx * away * 0.55, 2.55, ev.nz * 2.30 + tz * away * 0.55);
    // A FIXED TUMBLE, keyed on the side rather than drawn. It only has to look thrown; it must
    // not cost an rng draw. `LimbField._settle` lays it flat within half a second anyway.
    const spin = new THREE.Vector3(3.6 * away, -2.1, 5.4 * away);

    const item = this.rig.detach(hit.socket, { impulse, spin });
    if (!item) return null;             // socket was a gadget mid-swap, or already empty
    this.limbsLost++;
    return { ...hit, item };
  }

  interact(field, radius = 1.25, target = null) {
    if (this._interactCd > 0 || !field) return null;
    this._interactCd = 0.35;
    const item = field.nearest(this.pos, radius);

    // THE SLEDGEHAMMER, FOUND RATHER THAN CONJURED (task-sledge-pickup.md §3.4).
    //
    // It never touches a socket — see `_toggleSledge`'s own header below — so it is
    // intercepted here, before any of the rig logic, exactly like the skates branch just
    // under this one. This REPLACES the previous mechanism, where `E` with nothing in reach
    // equipped the hammer from nowhere (`sledge-1`'s own report on that build: "equip is 'E
    // with nothing in reach' — a mode toggle, not a pickup"). `_toggleSledge` below still
    // exists — a hammer you have already found can be drawn and stowed with the same key —
    // but it can no longer produce one that was never picked up: see its `owned` check.
    if (item?.type === 'sledge') {
      if (this.rig.held) this.rig.dropHeld();          // both hands go to the haft
      this.sledge.owned = true;
      field.take(item);
      item.root.removeFromParent();
      // ...AND FREE THE WORLD PROP, WHICH NOBODY WILL EVER SEE AGAIN. `SledgeRig` built its own
      // hammer in its constructor and `equip()` below mounts THAT one — this item's prop, built
      // by `spawnWorldSledge()`, is now off the scene graph and off the field, so the
      // `resetRound()` sweep that frees the other pickups will never see it. Unparenting frees
      // nothing on the GPU; without this each pickup orphans a `buildSledgeProp()`.
      // ⚠️ `ownedBuild`, never `gadgetObj` — see its jsdoc in `limbs.js`: `attach()` branches on
      // `gadgetObj` and would fit the world-tuned object onto the body.
      item.ownedBuild?.dispose?.(); item.ownedBuild = null;
      // Draws it outright when both arms are free right now — the point of walking over and
      // pressing E is to be carrying it, not to have merely unlocked a menu (the bar in
      // task-sledge-pickup.md §4: "walks to it, picks it up, and hits a wall"). The one edge
      // case — a gadget already fitted, so `caps.arms < 2` — still gives the player the
      // hammer, carried stowed; `_toggleSledge` draws it the moment an arm is free.
      const equipped = this.caps.arms === 2 && this.sledge.equip();
      return { kind: 'sledgePickup', item, equipped };
    }

    // E WITH NOTHING IN REACH DRAWS OR STOWS AN ALREADY-OWNED SLEDGEHAMMER.
    //
    // ⚠️ THIS IS A KNOWN HUD GAP, STATED RATHER THAN HIDDEN. `views/game.js`'s own on-screen
    // prompt (`hud.setPrompt(...)`) is driven purely by `promptFor(player.rig, near)` and only
    // ever shows anything when a `LimbField` item is within reach — there is no advertised
    // control for this. task-sledge.md §6/§7 asks for coexistence with a legible switch, and
    // gives the explicit fallback: "if the HUD cannot express it, report that rather than
    // editing another owner's file" — `src/ui/hud.js` is that other owner's file. This reuses
    // E because it is the one input this slice can reach without a new binding: `Input` (this
    // file) has no free key wired through `views/game.js` to any `Player` method, and that
    // file is equally out of scope. The empty-reach branch of E was a pure no-op before this,
    // so nothing existing changes when an item IS in reach — see the `!item` guard below.
    if (!item) return this._toggleSledge();

    // Skates are the documented exception: `shinBoth`, fitted OVER both legs, never a socket
    // occupant. They need both legs present and they replace the movement model outright.
    if (item.socketKind === 'skates') {
      if (this.rig.skates || this.rig.countLimbs('leg') < 2) return null;
      if (this.rig.fitSkates()) {
        field.take(item); item.root.removeFromParent();
        // Same orphan as the sledge branch above, same one-line fix: `fitSkates()` calls
        // `buildGadget('skates', …)` itself, so the pickup's own prop from `spawnGadget()` is
        // unreachable the moment it leaves the field — past the reach of the `resetRound()` sweep.
        item.ownedBuild?.dispose?.(); item.ownedBuild = null;
        return { kind: 'skates', item };
      }
      return null;
    }

    /**
     * 🎯 **AN EMPTY SOCKET OF THE RIGHT KIND WINS OVER AN OCCUPIED ONE, EVERY TIME — AND THE
     * ORDER OF THE THREE BLOCKS BELOW IS THE WHOLE OF IT.**
     *
     * John, playing with an arm knocked off by falling debris: *"when replacing an arm that fell
     * off from debris I kept replacing the arm with the nail gun and vise versa instead of
     * putting it in the open arm slot."*
     *
     * 🚨 **THE DEFECT WAS THIS FUNCTION'S ORDER, NOT `LimbRig.attach()`.** `attach()` takes an
     * explicit socket and has always done exactly what it was told; the swap block used to run
     * FIRST and consumed the press before the empty scan below could ever be reached. The state
     * that produces the loop is one wound plus one gadget: `shoulderL` empty (debris took the
     * arm), `shoulderR` wearing the nail gun, the arm on the floor, and `views/game.js`'s socket
     * cursor parked on `shoulderR` — an OCCUPIED socket, of the right kind, holding a different
     * CLASS of thing, which is exactly the swap guard's condition. So `E` bolted the arm over
     * the gun, ejected the gun to the floor, and left the empty shoulder empty; `E` on the gun
     * swapped it straight back. **Neither press was a no-op and both were the wrong answer**,
     * which is why it read as the game fighting him rather than as a control not working.
     *
     * 🎯 **THE SWAP DOES NOT GO AWAY — IT MOVES BELOW THE EMPTY SCAN**, i.e. down to exactly the
     * states where it is the only way to wear the item at all (both arms full and you want the
     * nail gun on one of them: the normal way every gadget in the game gets fitted). Fitting
     * into a free socket is strictly better for the player than trading, because they end up
     * wearing BOTH parts, so there is no state where the old order was the answer the player
     * wanted. **They still choose which socket:** hold `E` cycles the cursor (`cycleTarget`,
     * views/game.js), the cursor is honoured first among the empty sockets, and it remains the
     * only socket a swap can ever touch. `docs/design/attachments.md` is unchanged by this — a
     * swap still EJECTS the old part to the floor, recoverable, never consumed.
     *
     * ⚠️ **EVERY CALL IN THE SCAN IS NON-DESTRUCTIVE, AND THAT IS A GUARANTEE FROM `attach()`
     * RATHER THAN AN ASSUMPTION HERE** — its first guard is `c.type !== 'empty'`, before the
     * `fitGadget` route that would otherwise displace an occupant. A full socket or a mismatched
     * kind returns false with nothing moved, so probing in preference order costs nothing.
     */
    const itemClass = item.type === 'gadget' ? 'gadget' : 'limb';

    // 1. THE TARGETED SOCKET, WHEN IT IS EMPTY — the cursor picks WHICH empty one.
    if (target && this.rig.occupant(target) === 'empty' && this.rig.attach(target, item)) {
      return { kind: 'attach', socket: target, item };
    }

    // 2. ANY OTHER EMPTY SOCKET THAT FITS, the part's own side first (`rig.emptyFits`) — you
    //    want your arm back in the open shoulder, not bolted over your gun.
    for (const s of this.rig.emptyFits(item)) {
      if (this.rig.attach(s, item)) return { kind: 'attach', socket: s, item };
    }

    // 3. NOTHING IS FREE, so a swap is the only way to wear it — and only when it CHANGES
    //    something. Trading a healthy limb for another healthy limb is pointless churn that
    //    costs the player a part on the floor and gains nothing, and on screen it is
    //    indistinguishable from the control doing nothing at all. Worth it when the socket
    //    holds a different CLASS of thing than the item — gadget for limb, or limb for gadget.
    const occ = this.rig.occupant(target ?? '');
    if (target && occ !== 'empty' && occ !== itemClass
        && SOCKET_KIND[target] === item.socketKind) {
      const old = this.rig.detach(target, { voluntary: true });   // a swap, not a wound
      if (this.rig.attach(target, item)) return { kind: 'swap', socket: target, item, displaced: old };
      if (old) this.rig.attach(target, old);      // put it back rather than leave them armless
    }

    if (this.rig.pickUp(item)) return { kind: 'pickUp', item };
    return null;
  }

  /**
   * Draw/stow an ALREADY-OWNED sledgehammer. Stowing is always allowed — putting a heavy tool
   * on your back needs no permission. Drawing needs BOTH natural arms: `caps.arms` only counts
   * sockets still holding a `type: 'limb'` occupant, so a fitted gadget (which turns that
   * socket's type to `'gadget'`) already fails this the same way a missing arm does — one
   * check covers both "no arm" and "arm is busy being a nail gun" (task-sledge.md §7's
   * one-armed-rig case). A held limb is dropped first: two hands are needed for the haft and
   * there is no third arm to spare it from.
   *
   * ⚠️ AND IT CANNOT BE CONJURED (task-sledge-pickup.md §3.4/§5). `this.sledge.owned` is set
   * exactly once, in `interact()`'s `item.type === 'sledge'` branch above, the moment the
   * player actually finds the prop lying in the world. Before that this call is a no-op, same
   * as pressing E always was with nothing in reach — a player who has not yet walked to
   * `study_w.north` cannot draw a hammer out of nowhere by tapping E at a blank wall.
   */
  _toggleSledge() {
    if (this.sledge.equipped) { this.sledge.unequip(); return { kind: 'sledgeStow' }; }
    if (!this.sledge.owned) return null;
    if (this.caps.arms < 2) return null;
    if (this.rig.held) this.rig.dropHeld();
    return this.sledge.equip() ? { kind: 'sledgeEquip' } : null;
  }

  /**
   * THE CONTACT FRAME — called once from `update()` when `sledge.swingHit()` fires.
   *
   * Wall damage goes through `panel.applyHit(point, power)` directly (`wall.js`), NOT through
   * `weapons.js`/`WeaponSystem`: `Player` has never held a reference to the weapon system (it
   * is constructed after `Player` in `views/game.js`, a file outside this slice), so this is
   * the one path available without editing that file. `panel.applyHit` is documented in
   * `wall.js` as "safe to call on any panel" — it falls back to the ordinary stage-damage
   * accounting itself when a panel has no destruction field, so this needs no branching for
   * `?dig=1` vs the shipped house. Called defensively throughout: `chunks-1` is landing this
   * file in parallel and it must be possible to run this slice, unmodified, before or after
   * that lands.
   *
   * ⚠️ SCOPE CUT, STATED RATHER THAN HIDDEN: this does not damage bodies. `weapons.js`'s
   * `_traceBodies`/`hitBody` is the only place that logic lives, and reaching it needs the
   * same missing `weapons` reference. Consistent with the doc's own framing — "the hammer is
   * what you dig with, the limb is what you fight with" — so the hammer swinging through the
   * hunter today does nothing rather than something invented for this report. Wiring a real
   * body hit (or a shared `WeaponSystem` reference) is future work for whoever owns
   * `views/game.js`.
   */
  _resolveSledgeHit(hit) {
    // ⚠️ CAST FROM THE EYE ALONG `aimDir`, NOT ALONG THE SWING'S OWN FK CHAIN.
    //
    // The first cut of this traced from `hit.at`/`hit.dir` — the animated head's world
    // position and the vector from the grip to it. Measured (a scripted swing at a wall 1.67 m
    // away, confirmed reachable by an independent scan): that vector came out
    // `(0.075, -0.314, 0.946)`, mostly WORLD +Z with a mild downward tilt, while the body's own
    // `facing` was ~3.165 rad (~180°) — i.e. the swing's own trajectory was pointing roughly
    // the OPPOSITE way from where the pose numbers were authored assuming it would. Getting a
    // two-joint FK chain's exact terminal direction right by hand-tuned Euler angles is exactly
    // the kind of thing this project's own HANDOFF warns never to trust unmeasured.
    //
    // Every other weapon in the game already answers "what is the player aiming at" one way:
    // `this.eye` / `this.aimDir` (see `attack()`'s hitscan return, `weapons.fire`). Riding that
    // same, already-proven instrument means the wall search cannot be wrong for a reason
    // specific to this slice's pose curve — only for a reason every other weapon would share
    // too, which is a much smaller and better-tested surface. `hit.at`/`hit.dir` are kept for
    // whatever cosmetic use wants the literal animated head position later (a debris spawn
    // point, for instance) but no longer drive the collision query.
    // ⚠️ ONE DEFINITION, SHARED WITH THE CAMERA. `_swingRay()` is exactly the two lines that
    // used to be written out here (aimDir, 0.18 of down-tilt, origin 0.2 m behind the eye) —
    // extracted, not changed, so that `_stepWorkAim` frames the same square metre this damages.
    // ⚠️ ONE RESOLUTION, SHARED WITH THE CAMERA AND THE MARK — see `_swingCast`. It carries the
    // through-your-own-hole fallback, so a blow aimed into a breach you made still widens it
    // instead of silently doing nothing.
    const c = this._swingCast();
    // `digPower` is 1 unless John has pressed the testing key — see its field in the constructor.
    // 🪑 Furniture is a third channel (not bodies, not walls) — same power, same kick path.
    const power = SLEDGE_POWER * this.digPower;
    const res = c.furn && c.point
      ? (c.furn.applyHit?.(c.point, power, { partId: c.partId ?? null, normal: c.normal }) ?? null)
      : (c.panel && c.point
        ? (c.panel.applyHit?.(c.point, power) ?? null) : null);
    // Last-contact readout for verification only (`harness/scenarios/sledge-check.mjs` /
    // `furn-sledge.mjs`) — a plain field, not an event, so it costs nothing on the hot path.
    this._lastSledgeHit = {
      hadPanel: !!c.panel, hadFurn: !!c.furn, furnId: c.furn?.id ?? null,
      partId: c.partId ?? res?.partId ?? null,
      through: !!c.through, res,
      origin: c.origin.toArray(), dir: c.dir.toArray(), pos: this.pos.toArray(), facing: this.facing,
    };

    // Scale the reaction to `removed` — "a blow that tears out a chunk should feel different
    // from one that chips a nearly-spent surface" (task-sledge.md §4). `damagefield.js`'s
    // `applyHit` returns a raw sum of per-cell depth increments, not a normalised 0..1 value,
    // and its typical single-hit magnitude was not measured from here — this normalises
    // against a guessed reference (a brush-radius's worth of cells at moderate power) and
    // should be re-tuned once real numbers are visible; see the report for this slice.
    const removedAmt = Number.isFinite(res?.removed) ? res.removed : 0;
    const growth = THREE.MathUtils.clamp(removedAmt / 4, 0, 1);
    let gain = res ? 0.55 + growth * 0.55 : 0.62;   // 0.55..1.10, or a flat whiff/no-panel hit
    if (res?.brokeThrough) gain = 1.35;             // breaking clean through is the biggest beat

    sledgeKick(this.gait, 'strike', gain);
    // small on purpose — "a camera kick (small — this is a hammer, not an explosion)"
    // (task-sledge.md §4). `shock`'s own decay in `update()` (dt/0.55 s) is generic and
    // already applies to this without any change there.
    this.shock = Math.max(this.shock, THREE.MathUtils.clamp(gain * 0.32, 0.18, 0.55));
    this.shockDir = 1;
    // 🚨 PASS THE WHOLE RESULT, NOT JUST THE DEPTH — THE REFUSAL SOUND WAS FIRING ON SUCCESS.
    //
    // `depthAt` reads 1.00 at an indestructible barrier AND at every cell you punch clean
    // through, so depth alone cannot tell "you cannot get through here" from "you just did".
    // `audio-listen-1` drove a real 63-blow dig and counted it: **10 blows on breakable material
    // played the dead barrier clank** — the one sound whose entire job is to say NOT HERE was
    // congratulating the player for getting through. It is the clearest wrong signal in the game.
    //
    // `playMeleeImpact(depth, opts)` resolves truth in the order barrier > brokeThrough >
    // blocked > depth, and falls back to the old depth inference when `opts` is absent, so this
    // is safe ahead of its other half.
    // ⚠️ **THE OTHER HALF IS NOT HERE YET**: `wall.js`'s `applyHit` must also return
    // `barrier: this.field.barrierAt(u, v)`. Until it does, `opts.barrier` is undefined and this
    // still falls through to depth for the barrier case. `wall.js` is owned by another agent.
    // ⚠️ And do NOT "fix" it by trusting `res.blocked`: driven against an all-barrier field,
    // `blocked` was true **zero times in 63 blows**, because the 0.52 m brush always finds a
    // neighbouring cell it can still remove. That wrong answer was authored, measured and
    // discarded — it is documented in `audio.js` so nobody re-derives it.
    if (res) audioMod.playMeleeImpact?.(res.depthAt ?? 0, res);
  }

  /**
   * Swing the held limb, or fire the fitted gadget. Returns the shot for the weapon system.
   *
   * COOLDOWNS COME FROM `rules.js`, NOT FROM HERE. This used to set a flat 0.14 s for every
   * gadget while `WEAPON_COOLDOWN` ranges from 0.13 (nailgun) to 1.4 (grapple) and 1.05
   * (oil). That was harmless only for as long as `src/net/client.js` stayed unwired: the
   * server enforces the real table, so the moment the client goes on the wire an HONEST
   * player firing oil or grapple at the client's own permitted pace has most of their shots
   * rejected as rate-limit violations. A limiter that fires on honest play is a bug in the
   * client, and this was it, pre-loaded. `rules.js` imports nothing and both sides run the
   * identical file precisely so this number cannot drift again.
   *
   * A dead trigger returns a REASON rather than null. `null` made LMB a silent no-op after
   * full dismemberment — the player pressed the game's primary button and nothing at all
   * happened, on screen or in the HUD.
   */
  attack(t) {
    if (this._fireCd > 0) return null;
    // THE HAMMER TAKES PRIORITY WHENEVER IT IS EQUIPPED — both hands are already committed to
    // it (see `_toggleSledge`'s `caps.arms === 2` gate and the drop-held-limb-first rule), so
    // there is nothing for `rig.activeWeapon` to sensibly contend with. When it is not
    // equipped this whole branch is skipped and everything below is byte-for-byte what shipped
    // before this slice — the limb club's cooldown, windup and animation are unchanged, per
    // task-sledge.md §9's regression gate.
    if (this.sledge.equipped) {
      if (!this.sledge.swing(t)) return null;
      // coil against the mass on the way up; the strike half fires from `update` at contact
      sledgeKick(this.gait, 'wind');
      this._fireCd = cooldownFor('sledge');
      this.makeNoise(0.62);          // a heavy tool committing to a swing is not quiet
      this._meleeUntil = t + WORK_HOLD;   // you are WORKING — see `_stepWorkAim`
      return { weapon: 'sledge', pending: true };
    }
    const w = this.rig.activeWeapon;
    if (!w) return { denied: 'NO WEAPON' };
    if (w === 'limbClub') {
      if (!this.rig.swing(t)) return null;
      // coil against the mass on the way up; the strike half fires from `update` at contact
      swingKick(this.gait, this.rig.heldHand ?? 'R', 'wind');
      this._swingKicked = false;
      this._fireCd = cooldownFor('limbClub');
      this.makeNoise(0.55);
      this._meleeUntil = t + WORK_HOLD;
      return { weapon: 'limbClub', pending: true };
    }
    // `fist` is a swung ARM, not a muzzle: it needs the punch animation or the primary button
    // does nothing visible at all when you are down to plain limbs.
    if (w === 'fist') {
      this.rig.punch(t);
      swingKick(this.gait, this.rig._punch?.hand ?? 'R', 'wind');
      // A player who lost the hammer mid-dig and kept swinging is EXACTLY the case
      // `critic-slice-3` photographed — thirty punches at a wall. Punching a wall is working
      // too, so the camera must not abandon the framing the moment the tool changes.
      this._meleeUntil = t + WORK_HOLD;
    }
    this._fireCd = cooldownFor(w);
    this.rig.fireWeapon(w, t);
    // A gunshot is the loudest thing a small robot can do. `fist` is not a gunshot — and
    // neither is a THROWN BALL.
    //
    // ⚠️ This was a blanket `w === 'fist' ? 0.35 : 1`, and it quietly broke the decoy. The
    // ball exists to put a noise somewhere you are NOT; announcing a gunshot at the thrower's
    // own position in the same instant tells the hunter exactly where you are, so the gadget
    // cancelled itself. Caught by `play-critic-4` driving the production input path
    // (`player.attack()`) rather than `weapons.fire()` directly: through the real path the
    // hunter went to ALERT — homing on the throw — instead of SEARCH toward the impact.
    // The arm motion still makes a little sound; the loud part is where it lands.
    this.makeNoise(w === 'fist' ? 0.35 : w === 'ball' ? 0.22 : 1);
    return { weapon: w, at: this.eye, dir: this.aimDir };
  }

  /**
   * Stop the procedural body DRAWING without stopping it working.
   *
   * ⚠️ `unit.root.visible = false` WOULD ALSO HIDE THE SLEDGEHAMMER, because `SledgeRig` mounts
   * the prop on `joints.chest` — inside this subtree. Hiding per-mesh leaves every joint, socket
   * and mounted prop exactly where it was and only stops the shell rendering. `keepVisible`
   * marks the things that must still be seen: the hammer, and anything held in a socket.
   */
  _hideProceduralBody() {
    this.unit.root.traverse((o) => {
      if (o.isMesh || o.isSkinnedMesh) o.visible = false;
    });
    this._reshowHeldProps();
  }

  /** Held props live under the unit, so they get caught by the sweep above and must come back. */
  _reshowHeldProps() {
    const show = (o) => o?.traverse?.((c) => { if (c.isMesh || c.isSkinnedMesh) c.visible = true; });
    show(this.sledge?.root);
    for (const s of Object.keys(this.rig?.sockets ?? {})) {
      const occ = this.rig.sockets[s];
      if (occ?.type === 'gadget') show(occ.item?.root ?? occ.item?.group);
    }
  }

  dispose() {
    this._unsubRig?.();
    this.rig.dispose();
    this.sledge.dispose();
    this.unit.dispose?.();
    this.avatar?.dispose?.();
  }
}

// ---------------------------------------------------------------------------
// Third-person camera
// ---------------------------------------------------------------------------

/**
 * A spring arm behind the shoulder. Two details do the work: the arm LAGS the body so
 * turning reads as turning rather than as the world rotating, and the boom shortens when
 * the geometry behind the player would clip it — in a mansion full of doorways a rigid
 * boom spends half its life inside a wall.
 *
 * WHEN THE BOOM IS BLOCKED, THE BODY GETS OUT OF THE WAY — THE CAMERA DOES NOT PUSH THROUGH.
 *
 * The shortening used to bottom out at 0.55 m, so any time the player was against a wall —
 * which is every fight — the camera sat inside the back of the robot's own head and the thing
 * attacking you was behind it.
 *
 * The obvious fix, a hard 1.55 m floor, was TRIED AND MEASURED AND IS WORSE, and the evidence
 * is in `progress/playtest/game.play.c-divider-min155.png`: the player's back against the
 * divider forces a 1.55 m boom straight through a 0.30 m wall, and the frame becomes a black
 * slab filling two thirds of the screen with the player a sliver at the edge. Against the far
 * perimeter it puts the camera outside the room entirely and the frame renders BLACK. Tilting
 * the arm up does not rescue it either: these walls are 4.8 m of a 4.8 m storey, so there is
 * nothing to climb over. A floor that large is only safe in a level built with camera
 * clearance, and this one is not.
 *
 * So the boom respects the geometry — it never penetrates — and the occlusion is solved at the
 * other end. As the boom shortens, `TIGHT_AT -> hardMin`:
 *   · the shoulder offset SWINGS OUT, sliding the robot toward the frame edge
 *   · the arm lifts a little and looks down over the head rather than at the back of it
 *   · the look target leads forward, so the centre of frame is what is in front of you
 *   · and below `HIDE_AT` the player model stops drawing entirely
 *
 * That last one is not a cop-out, it is arithmetic. With your back to a wall the boom has the
 * player's own collision radius and nothing else — about 0.35 m in this room — and there is no
 * arrangement of a camera 0.4 m behind a 1.7 m robot in which the robot is not most of the
 * frame. Every third-person game solves this by fading the avatar; this one hides it, with
 * hysteresis so it cannot strobe on the threshold. You lose sight of your own robot for as
 * long as you are jammed into a corner, and you keep sight of the thing that put you there.
 *
 * ---------------------------------------------------------------------------------------
 * ⚠️ THE SHOULDER OFFSET WAS NOT FREE, AND THAT — NOT THE BOOM, NOT THE PITCH — IS WHAT MADE AN
 * ORDINARY NAVIGATION MISTAKE THE LEAST LEGIBLE SCREEN IN THE GAME. (play-critic-5's #1.)
 *
 * `shoulder` defaults to 0.42 m and `views/game.js` passes **0.44**. The player's collision
 * radius is `height * 0.20` = **0.34 m**. The offset is therefore LARGER THAN THE BODY, so any
 * time the robot is pressed against a wall on the shoulder side, the rig's own probe origin is
 * up to 0.10 m INSIDE that wall — and `rayBox`
 * returns the EXIT distance for a ray that starts inside a box, so the cramp probe reported
 * about 0.09 m of clearance while THREE METRES OF OPEN ROOM sat directly behind the player.
 *
 * The response to "cramped" is then to swing the shoulder 1.15x FURTHER OUT, i.e. deeper into
 * the wall that caused the reading. It is positive feedback: the more wrong the probe is, the
 * harder the rig drives into the thing making it wrong.
 *
 * Reproduced (`harness/scenarios/camera-wedge.mjs`, the critic's own "re-aim at the goal every
 * 800 ms" strategy) at the west study's north-east inside corner, x −2.34 / z −23.66, aiming at
 * the gallery's east end: probe origin z = **−24.038**, inside the 0.15 m wall skin that spans
 * −24.15..−24.00. Measured frame: **88% of the view inside 1.20 m, median depth 0.17 m**, boom
 * collapsed to its 0.42 m floor, player model hidden. A macro close-up of plaster with nothing
 * in it to navigate by, produced by walking at a place you can see.
 *
 * FIXED BY ASKING THE SAME QUESTION SIDEWAYS THAT THE BOOM ALREADY ASKS BACKWARDS: one ray along
 * the shoulder axis clamps BOTH the probe offset and the swing to the room that is actually
 * there. When there is space the numbers are bit-identical to before, so nothing about the
 * cramped composition changes except that it can no longer be triggered by a wall it is standing
 * in. **This is not the rejected 1.55 m boom floor** — the boom still never penetrates, and the
 * `camera-wedge` suite asserts that separately so the two cannot be traded for each other.
 *
 * ⚠️ AND THE CRITIC'S OWN SUGGESTED KNOB IS THE WRONG ONE — stated because a later round will
 * otherwise reach for it. It proposed capping `MAX_LIFT`. Measured: at `tight` = 1 and the
 * default pitch, MAX_LIFT raises the camera **0.175 m** and, once `LEAD` has pushed the look
 * target 0.42 m forward, tilts the view axis down by about **5°**. It is not what collapses the
 * frame and capping it would have bought almost nothing. The direction was right and the
 * mechanism was not; the cue it also asked for is real and is below.
 */
const HARD_MIN = 0.42;       // metres. The boom's resting floor when there is room for it.
const STANDOFF = 0.30;       // keep the near plane off the surface the boom hit
/**
 * ⚠️ AND WHEN THERE IS NOT ROOM FOR HARD_MIN, HARD_MIN WAS THE THING PUTTING THE CAMERA IN THE
 * WALL. Its old comment read "below this the camera would be inside the wall it hit", and that
 * is exactly backwards: `clearAt` has ALREADY subtracted STANDOFF, so its return value is the
 * boom length at which the camera sits 0.30 m clear of the surface. Clamping that UP to 0.42
 * therefore pushes the camera 0.30 m PAST the surface — the clamp was the penetration.
 *
 * Measured (`camera-wedge.mjs`'s 488-solve survey, before): the gallery's north-west inside
 * corner with the back to the west wall reported **80% of the frame inside 1.20 m and a median
 * depth of 0.14 m** — the camera flush inside the wall skin, which is the "macro-close wall
 * texture" play-critic-5 photographed. Letting the boom go down to the room that is actually
 * there instead gives the frame back; the near plane is 0.06 m and the standoff is 0.30, so
 * there is a 5x margin. The model is already hidden below HIDE_AT, so nothing is drawn inside.
 * Non-zero because `camera.lookAt(target)` is degenerate at zero separation.
 */
const PINCH_MIN = 0.12;
/** As STANDOFF, but for the sideways probe: keep the rig off the surface beside it. */
const SIDE_STANDOFF = 0.15;
const TIGHT_AT = 1.55;       // below this the frame is "cramped" and the body starts moving out
const MAX_LIFT = 0.30;       // radians of extra downward pitch when fully cramped
const SHOULDER_SWING = 1.15; // extra shoulder offset, as a multiple, when fully cramped
const LEAD = 0.42;           // metres the look target leads forward when fully cramped
const LEAD_STANDOFF = 0.20;  // ...and how far short of a wall in front that lead has to stop
const HIDE_AT = 0.95;        // boom length below which the player model stops drawing
const SHOW_AT = 1.18;        // ...and above which it comes back. The gap is the hysteresis.

/* ===========================================================================================
 * 🔨 WORK FRAMING — THE PLAYER'S OWN BODY WAS STANDING IN FRONT OF THE GAME'S ONLY VERB
 * ===========================================================================================
 *
 * `critic-slice-3`: *"sixty blows in the gallery leave no change a player can see"* — and the
 * crater is there; a 2x crop shows the torn white edge curling round the robot's shoulder. The
 * first and largest of the three stacked causes is this camera. `play-critic-7` had already
 * measured it: **the body covers 45.7% of an opening's screen area at 2.6 m, 49.0% at 4.2 m,
 * 52.6% at 6.0 m — it gets WORSE with distance.** That was filed against an exit site and read
 * as a nuisance. The dig is a sixty-second stationary activity aimed down the boom, so it pays
 * that on EVERY BLOW, which makes it the most expensive unfixed thing in the game.
 *
 * ⚠️ THE ARITHMETIC IS WHY THE OBVIOUS KNOBS DO NOT WORK, AND IT IS WORTH CARRYING because a
 * later round will otherwise reach for one of them. Take a horizontal section: camera to body
 * `a`, camera to wall `b`, body half-width `w`, opening half-width `W`. Sliding the whole rig
 * `s` metres sideways separates them on screen by `s·(b−a)/(a·b)`, so the body clears the
 * opening only once
 *
 *     s  ≥  (w·b + W·a) / (b − a)
 *
 * and `b − a` IS THE PLAYER'S STANDOFF FROM THE WALL — about 1.5 m at a real dig, and not
 * something the camera may change. At the shipped 3.1 m boom that needs **~1.95 m** of sideways
 * room, which does not exist in a mansion and would put the lens through a wall. The shoulder
 * offset cannot buy its way out; at 0.44 m it separates them by 2.6°, against a body that
 * subtends 11°.
 *
 * `a` is the term that is actually ours. Shortening the boom shrinks the numerator AND fattens
 * the parallax, so the same fix that is impossible at 3.1 m is cheap at 1.9 m: **~1.31 m** of
 * sideways room, and when you are facing a wall to dig it the free direction is ALONG that wall
 * — which is exactly where the shoulder swings. A corridor is the easy case, not the hard one.
 *
 * So WORK FRAMING is three moves that only make sense together, blended in over ~0.6 s
 * whenever `player.workAim` says the next swing lands on a damageable panel and
 * `player.workHot` says the player has actually been swinging:
 *
 *   · THE BOOM PULLS IN to WORK_DIST, which is what makes the sideways move affordable.
 *   · THE RIG SLIDES ALONG THE WALL by WORK_SWING, on whichever side has the room (picked once,
 *     at engagement, so it can never oscillate), clamped by the same sideways ray the wedge fix
 *     already casts.
 *   · THE LOOK TARGET MOVES ONTO THE IMPACT POINT, so the crater is the centre of the frame
 *     instead of the back of your own head — and, as a consequence worth having on its own,
 *     the HUD's centre dot finally sits on the square metre the next blow lands on.
 *
 * 🚨 WHAT IT DELIBERATELY DOES NOT DO: it does not fade, dither or hide the robot. The
 * two-handed swing is the single best thing in the build (`critic-slice-3`'s own best moment:
 * *"hips, then a long arc, then the arms as the last link"*), and a camera fix that deletes it
 * to see past it is a trade this project should not make. The body goes to the frame edge; it
 * stays on screen, swinging.
 *
 * ⚠️ AND IT SWITCHES OFF WHEN YOU ARE BEING HUNTED. `views/game.js` clears `workAllowed` while
 * `hunter.committed` is latched, because the OTHER job this camera has is reading a chase, and
 * a lens that has quietly slid a metre sideways and re-centred on a wall is the worst possible
 * frame to be handed when something starts coming at you. The melee gate does most of this
 * already (a nail gun never engages it), but "you are being chased" must not depend on which
 * weapon happens to be in your hands.
 *
 * ⚠️ EVERY ONE OF THESE IS A NO-OP AT `work = 0`, BY CONSTRUCTION, not by intention — the
 * offsets add zero, the boom clamp is `Math.min(x, this.distance)`, and the look target is the
 * same object it always was. `tight`, the wedge probe and the unwedge cue never see this
 * channel at all, so the cramped composition and `camera-wedge.mjs`'s ablation table are
 * untouched. `workEnabled = false` restores the shipped camera exactly, and the instrument
 * (`harness/scenarios/_cam1-occlusion.mjs`) A/Bs the two IN ONE PAGE at one crater, because a
 * gallery A/B across two pages is meaningless until `jitter-1`'s determinism bug lands.
 */
const WORK_SWING = 0.85;     // extra metres the rig slides along the wall while working
const WORK_DIST = 1.90;      // ...and the boom length it pulls in to. See the arithmetic above.
const WORK_LOOK = 1.00;      // how much of the look target moves onto the impact point
const WORK_IN = 4.0;         // rate the framing engages at, per second
const WORK_OUT = 5.0;        // ...and releases at. Faster, because releasing is often urgent.
/** The other side must beat the shipped shoulder by this much before the swing changes sides. */
const WORK_SIDE_BIAS = 0.35;

/* ===========================================================================================
 * 🕳️ THE BOOM IS A VOLUME, NOT A LINE — AND A HOLE YOU DUG IS A HOLE THE BOOM FELL THROUGH
 * ===========================================================================================
 *
 * From John's own session, 2026-08-09: four screenshots of one dig, and in two of them **the
 * camera is on the far side of the wall, looking back at the player through the hole they just
 * made.** The boom is passing through the very thing it is meant to be showing you.
 *
 * The mechanism is one word: `clearAt` casts ONE RAY. `room.castRay` traces a damaged panel
 * through `traceBoxes()`, which returns the material that is STILL THERE — correctly, because
 * a shot fired through a hole you dug must go through it. So the instant the excavation is wide
 * enough for a single line to slip through at boom height, the boom's clearance test reports
 * the full 3.1 m of open room beyond, and the camera is placed there. Turn round after digging
 * — which is what you do, to see if anything heard you — and the boom shoots straight through
 * your own breach. A line has no width, so a 0.2 m gap is as good as a doorway to it.
 *
 * 🎯 AND IT IS THE SAME DEFECT AS THE BODY-OCCLUSION ONE, SEEN FROM THE OTHER DISTANCE: both
 * are the rig treating "where can the camera go" as a question about a point. A point can slip
 * through a hole, and a point can hide behind a robot. So the fix is the same shape as the
 * shoulder clamp already in this file: ask the question with the width the answer needs.
 *
 * `clearVol` casts the centre ray plus four parallel rays at BOOM_R around it and takes the
 * shortest. A breach has to be genuinely wide before the camera will pass through it — and
 * BOOM_R is 0.35 m, i.e. 0.70 m of clear width, which is deliberately just under the 0.74 m
 * channel `DamageField.channel()` requires before a BODY may pass. So the boom goes through a
 * breach exactly when the breach has become a doorway, and not one blow before.
 *
 * ⚠️ THE OFFSET ORIGINS ARE THE TRAP, AND THIS FILE HAS ALREADY PAID FOR IT ONCE. `rayBox`
 * returns the EXIT distance for a ray that starts inside a box — the bug that made the shoulder
 * probe read 0.09 m of clearance with three metres of open room behind the player. An offset
 * origin 0.35 m to the side can easily be inside a wall skin, and its exit distance would
 * collapse the boom onto the player's head. So each offset is validated by a short ray to it
 * first, exactly like `sideClamp` does, and an offset that cannot be reached is skipped rather
 * than trusted. Offsets can only ever SHORTEN the boom; the centre ray is never discarded, so
 * the wall-directly-behind case is governed by the same test it always was.
 *
 * ⚠️ IT IS DELIBERATELY NOT APPLIED TO `free`. That probe drives `tight`, which drives the
 * cramped composition, the shoulder swing and the unwedge cue, and `camera-wedge.mjs`'s
 * 488-solve ablation table is calibrated on it. Widening the boom is a placement fix, not a
 * composition change, and mixing the two would make the table uninterpretable. `boomRadius = 0`
 * restores the single-ray behaviour exactly, so the two arms can still be measured against
 * each other.
 */
const BOOM_R = 0.35;

// ---- THE CUE. See `_cueStep`.
/** `tight` at or above this counts as wedged. */
const CUE_TIGHT = 0.92;
/** ...and it has to stay there this long before the game says anything. */
const CUE_AFTER = 1.5;
/** Clear for this long before the cue can fire again — a latch, not a state test. */
const CUE_REARM = 1.2;
/** Yaws sampled around the player when deciding which way is out. */
const CUE_SAMPLES = 10;

export class ThirdPersonCamera {
  constructor(camera, o = {}) {
    this.camera = camera;
    this.distance = o.distance ?? 3.0;
    this.height = o.height ?? 1.42;
    this.shoulder = o.shoulder ?? 0.42;
    this.yaw = o.yaw ?? 0;
    this.pitch = o.pitch ?? -0.13;
    this.sensitivity = o.sensitivity ?? 0.0026;
    this.world = o.world ?? null;
    /** Below this the frame counts as cramped and the body is moved out of the way. */
    this.tightAt = o.tightAt ?? TIGHT_AT;
    /** The boom's resting floor when the geometry allows it. See HARD_MIN / PINCH_MIN. */
    this.hardMin = o.hardMin ?? HARD_MIN;
    /** ...and the floor when it does not. Set to `hardMin` to restore the pre-fix behaviour. */
    this.pinchMin = o.pinchMin ?? PINCH_MIN;
    /** How wide the boom is when it asks what is behind it. 0 restores the single-ray test. */
    this.boomRadius = o.boomRadius ?? BOOM_R;
    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._first = true;
    this._tight = 0;         // smoothed 0..1, so a doorway is not a snap
    this._shakeT = 0;
    this.lastDistance = this.distance;
    /**
     * Off switches, for the instruments that have to prove each half of the fix is load-bearing.
     * `harness/scenarios/camera-wedge.mjs` runs the same 488-solve survey four times, toggling
     * these, and prints the ablation — which is how the shipped combination was chosen rather
     * than argued for. Two of the four candidate changes were rejected by that table.
     */
    this.sideClamp = o.sideClamp !== false;
    this.leadClamp = o.leadClamp !== false;
    this.cueEnabled = o.cueEnabled !== false;
    /**
     * WORK FRAMING — see the block comment above the constants. `workEnabled` is the ablation
     * switch (false restores the shipped camera exactly); `workAllowed` is the per-frame gate
     * `views/game.js` clears while the hunter is committed.
     */
    this.workEnabled = o.workEnabled !== false;
    this.workAllowed = true;
    this.workSwing = o.workSwing ?? WORK_SWING;
    this.workDist = o.workDist ?? WORK_DIST;
    this._work = 0;
    this._workSide = 1;
    this._workPoint = new THREE.Vector3();
    this._hasWorkPoint = false;
    /** Fired once per wedge with `{ side: -1 | +1, first }`. Wired to the HUD in views/game.js. */
    this.onWedge = o.onWedge ?? null;
    this._wedgeT = 0;
    this._clearT = CUE_REARM;
    this._cueArmed = true;
    this.cueFired = 0;       // this session, total. Read by harness/scenarios/camera-wedge.mjs.
    this.unwedgeCue = false; // is a cue live right now
    /** Last frame's internals, for the diagnostics that had to be added from outside twice. */
    this.dbg = { free: 0, sideRoom: 0, tight: 0, dist: 0, work: 0, workSide: 1, off: 0 };
  }

  look(dx, dy) {
    this.yaw -= dx * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * this.sensitivity, -0.95, 0.62);
  }

  update(dt, player) {
    const dirAt = (pitch) => new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      -Math.cos(this.yaw) * Math.cos(pitch));

    const right = _v2.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).clone();
    const pivot = _v.copy(player.pos);
    pivot.y += player.eyeHeight * 0.94;

    /** Clear boom length from `from` along `pitch`, before something solid is in the way. */
    const clearAt = (from, pitch) => {
      if (!this.world?.castRay) return this.distance;
      const hit = this.world.castRay(from, dirAt(pitch), this.distance + STANDOFF);
      return hit && hit.distance < this.distance + STANDOFF
        ? Math.max(0, hit.distance - STANDOFF) : this.distance;
    };

    /**
     * 🕳️ As `clearAt`, but asking with the width the answer needs — see the BOOM_R block above.
     * This is the test that places the camera; a hole narrower than `2 * boomRadius` is no
     * longer a route the boom will take.
     */
    const clearVol = (from, pitch) => {
      const base = clearAt(from, pitch);
      const r = this.boomRadius;
      if (!(r > 0) || !this.world?.castRay) return base;
      const d = dirAt(pitch);
      const max = this.distance + STANDOFF;
      // Two perpendiculars to the boom. The pitch clamp keeps `d` well away from vertical, so
      // the horizontal one is never degenerate.
      _c4.set(-d.z, 0, d.x).normalize();
      _c5.crossVectors(d, _c4).normalize();
      let best = base;
      for (const [p, s] of [[_c4, 1], [_c4, -1], [_c5, 1], [_c5, -1]]) {
        _c6.copy(p).multiplyScalar(s);
        // ⚠️ Is that offset origin even reachable? See the `rayBox` warning above: an origin
        // inside a wall skin reports its EXIT distance and would collapse the boom.
        const side = this.world.castRay(from, _c6, r + 0.02);
        if (side && side.distance < r + 0.02) continue;
        _c7.copy(from).addScaledVector(_c6, r);
        const hit = this.world.castRay(_c7, d, max);
        if (hit && hit.distance < max) best = Math.min(best, Math.max(0, hit.distance - STANDOFF));
      }
      return best;
    };

    // ---- HOW MUCH ROOM IS THERE ON THE SHOULDER SIDE AT ALL? See the header: this one ray is
    // the whole fix for the wedge. `shoulder` (0.42) exceeds the player's collision radius
    // (0.34), so without it the rig can stand inside a wall, misread a room as a corner, and
    // then swing itself further into the wall it misread.
    //
    // ⚠️ `maxOff` now also covers the work swing, and that is a NO-OP at `work = 0` rather than
    // a widening: `sideRoom` is only ever used as an upper clamp, so probing further can only
    // RAISE a ceiling that the un-worked offset (≤ 0.946 m) never reaches anyway. `_cueStep`
    // reads it through `Math.min(this.shoulder, …)`, which is 0.44 either way.
    const maxOff = this.shoulder * (1 + SHOULDER_SWING) + (this.workEnabled ? this.workSwing : 0);
    let sideRoom = maxOff;
    if (this.sideClamp && this.world?.castRay) {
      const sideHit = this.world.castRay(pivot, right, maxOff + SIDE_STANDOFF);
      if (sideHit && sideHit.distance < maxOff + SIDE_STANDOFF) {
        sideRoom = Math.max(0, sideHit.distance - SIDE_STANDOFF);
      }
    }

    // ---- 🔨 WORK FRAMING — engage/release. See the block comment above the constants.
    //
    // The side is latched at ENGAGEMENT and never re-picked while engaged. That is not
    // caution for its own sake: `tight` is already a smoothed value sitting on a threshold and
    // this project has twice had to learn (the unwedge cue, `HunterAI._commitStep`) that a
    // continuously re-evaluated preference becomes an oscillation. A camera that changes
    // shoulders mid-dig would be worse than the defect it is fixing.
    const aim = (this.workEnabled && this.workAllowed !== false && player.workHot)
      ? (player.workAim ?? null) : null;
    const wantWork = aim ? 1 : 0;
    if (aim) { this._workPoint.copy(aim.point); this._hasWorkPoint = true; }
    if (wantWork && this._work < 0.02) this._workSide = this._pickWorkSide(pivot, right);
    this._work += (wantWork - this._work) * (this._first ? 1 : 1 - Math.exp(-(wantWork ? WORK_IN : WORK_OUT) * dt));
    if (this._work < 0.002) { this._work = 0; this._hasWorkPoint = false; }
    const work = this._work;

    // ---- how cramped are we? Probe from the un-swung pivot so the answer does not depend on
    // the swing it is about to drive.
    const probeFrom = pivot.clone().addScaledVector(right, Math.min(this.shoulder, sideRoom));
    const free = clearAt(probeFrom, this.pitch);
    const wantTight = THREE.MathUtils.clamp(
      (this.tightAt - free) / (this.tightAt - this.hardMin), 0, 1);
    this._tight += (wantTight - this._tight) * (this._first ? 1 : 1 - Math.exp(-7 * dt));
    const tight = this._tight;

    // ---- the body moves out of the way, not the camera into the wall
    //
    // The offset is SIGNED now, because the work swing may go the other way, and it is clamped
    // against whichever side it actually points at. At `work = 0` the request is never negative
    // and this reduces to the shipped `Math.min(request, sideRoom)` exactly.
    const off = this._clampOff(pivot, right, sideRoom,
      this.shoulder * (1 + tight * SHOULDER_SWING) + work * this.workSwing * this._workSide);
    const target = pivot.clone().addScaledVector(right, off);
    const pitch = THREE.MathUtils.clamp(this.pitch - tight * MAX_LIFT, -1.25, 0.62);
    const dir = dirAt(pitch);
    // Re-probe from the swung target at the final pitch: the swing itself changes what the
    // boom can see past, and a corner is not the same shape from 0.44 m over as from 1.14 m.
    // The floor is `hardMin` while there is room for it and `pinchMin` when there is not —
    // clamping up to `hardMin` against a nearer wall is what used to drive the lens into it.
    // ⚠️ The work channel enters as a CEILING on the boom, never as a floor — the rejected
    // 1.55 m minimum this header spends four paragraphs on is still rejected, and a wall behind
    // the player still collapses the boom exactly as it did.
    const clear = clearVol(target, pitch);
    const maxDist = this.distance + (this.workDist - this.distance) * work;
    const dist = THREE.MathUtils.clamp(clear, Math.min(this.hardMin, this.pinchMin), maxDist);
    this.lastDistance = dist;

    // ---- and the look leads forward, so the centre of the frame is what is IN FRONT of you
    // rather than the back of your own head. Only when cramped; an open frame keeps the
    // original composition exactly.
    if (tight > 0.001) {
      const fwd = _v2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      // ⚠️ AND THE LEAD IS NOT FREE EITHER — SAME BUG CLASS AS THE SHOULDER OFFSET, FOUND WHILE
      // FIXING IT. The frame is cramped precisely when there is something close by, and the
      // thing the player is most often close to is what they walked into, which is IN FRONT.
      // An unclamped 0.42 m lead therefore puts the LOOK TARGET inside the wall the player is
      // facing — and since the camera is placed relative to that target, it drags the lens
      // forward into it too. Ask the same question forwards that the boom asks backwards.
      let lead = tight * LEAD;
      if (this.leadClamp && this.world?.castRay) {
        const fh = this.world.castRay(target, fwd, lead + LEAD_STANDOFF);
        if (fh && fh.distance < lead + LEAD_STANDOFF) lead = Math.max(0, fh.distance - LEAD_STANDOFF);
      }
      target.addScaledVector(fwd, lead);
      target.y += tight * 0.10;
    }

    // ---- 🔨 AND THE CENTRE OF THE FRAME BECOMES THE WORK, not the back of your own head.
    //
    // This is the half of the work framing that the sideways slide would be pointless without:
    // sliding the rig moves the body off the crater, and re-aiming puts the crater where the
    // player is already looking. The camera POSITION is still placed off `target` — the boom
    // still never penetrates and the clearance probes above still govern it — only the look
    // axis moves. `_workPoint` is held through the release so the frame eases off the wall
    // instead of cutting back to the head the instant the last blow's hold expires.
    const lookAt = target.clone();
    if (work > 0.001 && this._hasWorkPoint) lookAt.lerp(this._workPoint, work * WORK_LOOK);

    // ---- and below HIDE_AT the body stops drawing. Hysteresis, or a boom hovering on the
    // threshold flickers the player's own robot on and off once a frame.
    if (player.model) {
      if (this._hidden === undefined) this._hidden = false;
      if (!this._hidden && dist < HIDE_AT) this._hidden = true;
      else if (this._hidden && dist > SHOW_AT) this._hidden = false;
      player.model.visible = !this._hidden;
    }
    this.modelHidden = !!this._hidden;

    const want = target.clone().addScaledVector(dir, dist);
    want.y = Math.max(want.y, (this.world?.floorY ?? 0) + 0.30);

    // SHOCK. A limb coming off punches the arm — the camera is the last channel that can
    // carry an impact, and a hit the camera does not react to did not happen.
    const shock = player.shock ?? 0;
    if (shock > 0) {
      this._shakeT += dt;
      const a = shock * shock;
      const s = this._shakeT * 47;
      want.x += Math.sin(s * 1.13) * 0.16 * a;
      want.y += Math.sin(s * 0.87 + 1.7) * 0.13 * a;
      want.z += Math.cos(s * 1.31) * 0.16 * a;
      // and it gives ground: the arm is shoved back, so the frame widens as you are hurt.
      // ⚠️ ONLY INTO GROUND THAT IS THERE. Unclamped this shoves the lens 0.30 m backwards
      // regardless of what is behind it, so being wounded with your back to a wall put the
      // camera inside that wall for the second the wound overlay was up — the worst possible
      // moment to lose the picture, and invisible to anything that photographs a healthy frame.
      want.addScaledVector(dir, Math.min(0.30 * a, Math.max(0, clear - dist)));
    } else this._shakeT = 0;

    const k = this._first ? 1 : 1 - Math.exp(-11 * dt);
    const kLook = this._first ? 1 : 1 - Math.exp(-16 * dt);
    this._first = false;
    this._pos.lerp(want, k);
    this._look.lerp(lookAt, kLook);
    this.camera.position.copy(this._pos);
    this.camera.lookAt(this._look);
    // roll, off the same impulse. Applied after lookAt or it is overwritten.
    if (shock > 0) this.camera.rotateZ(Math.sin(this._shakeT * 24) * 0.075 * shock * shock * (player.shockDir || 1));

    this.dbg.free = free; this.dbg.sideRoom = sideRoom; this.dbg.tight = tight; this.dbg.dist = dist;
    this.dbg.work = work; this.dbg.workSide = this._workSide; this.dbg.off = off;
    this._cueStep(dt, pivot);
  }

  /**
   * Signed lateral offset, clamped against whichever side it points at.
   *
   * The positive side reuses `sideRoom`, already probed in `update()` for the wedge fix — one
   * ray, not two, on the path that every frame takes. The negative side is probed only when the
   * work swing has actually chosen it, so a player who never picks up a hammer never pays for it.
   */
  _clampOff(pivot, right, sideRoom, want) {
    if (want >= 0) return Math.min(want, sideRoom);
    if (!this.sideClamp || !this.world?.castRay) return want;
    return -Math.min(-want, this._roomOn(pivot, right, -1, -want));
  }

  /** Metres of clear space from `pivot` along `sign * right`, up to `want`. */
  _roomOn(pivot, right, sign, want) {
    // ⚠️ DEDICATED SCRATCH, same reason as `_cueStep`'s: `pivot` in `update()` IS the
    // module-level `_v`, and `right` is a clone of `_v2`, so a shared temporary here would
    // quietly corrupt the caller's own variables.
    _c3.copy(right).multiplyScalar(sign);
    const hit = this.world.castRay(pivot, _c3, want + SIDE_STANDOFF);
    return hit && hit.distance < want + SIDE_STANDOFF ? Math.max(0, hit.distance - SIDE_STANDOFF) : want;
  }

  /**
   * WHICH WAY THE BODY GOES WHEN THE WORK FRAMING ENGAGES. Called once per engagement.
   *
   * Biased to the shipped shoulder, because a camera that keeps its habits is easier to read
   * than one that is locally optimal — the other side has to be decisively roomier
   * (WORK_SIDE_BIAS) before the composition flips. This is what makes the fix survive a corner:
   * in the one geometry where sliding right is impossible, sliding left usually is not.
   */
  _pickWorkSide(pivot, right) {
    if (!this.sideClamp || !this.world?.castRay) return 1;
    const want = this.shoulder * (1 + SHOULDER_SWING) + this.workSwing;
    const r = this._roomOn(pivot, right, 1, want);
    const l = this._roomOn(pivot, right, -1, want);
    return l > r + WORK_SIDE_BIAS ? -1 : 1;
  }

  /**
   * WHICH WAY IS OUT — the second half of play-critic-5's #1, and the half the geometry cannot
   * fix on its own.
   *
   * Even with the shoulder clamp, a player can genuinely wedge themselves: a doorway reveal, the
   * angle between two walls, a colonnade pier. The critic measured the part that makes that
   * expensive rather than merely awkward — **re-aiming at your goal does not free you.** Both of
   * its runs pointed at where they wanted to go, which is the first thing anybody does, and both
   * stayed stuck; only a substantial turn AWAY restored the frame. A player with no cue has to
   * find that by flailing, and flailing next to something that is hunting them is the worst
   * moment in the game to be learning camera behaviour.
   *
   * So: hold `tight` at or above CUE_TIGHT for CUE_AFTER seconds and the game says which way,
   * once. Three properties this deliberately has:
   *
   *  · IT IS A LATCH, NOT A STATE TEST, and that is not fussiness — it is the same lesson
   *    `HunterAI._commitStep` had to learn. `tight` is a smoothed continuous value sitting on a
   *    threshold; driven off "is wedged" the cue would re-fire every few frames and be wallpaper
   *    inside one round. It re-arms only after CUE_REARM seconds genuinely clear.
   *  · THE DIRECTION IS MEASURED, NOT GUESSED. Ten yaws are swept around the player and the
   *    NEAREST one whose boom is clear decides the sign, so the cue points at the shortest way
   *    out rather than at some fixed "turn right". Ten raycasts, once per wedge — free.
   *  · IT TEACHES ONCE AND HELPS FOREVER. `first` is passed to the callback so the HUD can spend
   *    a text line the first time and only the quiet screen-edge nudge afterwards. A line that
   *    explains the camera is worth saying once and is noise the fifth time.
   */
  _cueStep(dt, pivot) {
    if (!this.cueEnabled) { this.unwedgeCue = false; return; }
    const wedged = this._tight >= CUE_TIGHT;
    if (wedged) { this._wedgeT += dt; this._clearT = 0; } else { this._wedgeT = 0; this._clearT += dt; }
    if (!this._cueArmed && this._clearT >= CUE_REARM) this._cueArmed = true;
    this.unwedgeCue = wedged && this._wedgeT >= CUE_AFTER;
    if (!this._cueArmed || !this.unwedgeCue || !this.world?.castRay) return;

    // Sweep outward in both directions and stop at the NEAREST yaw whose boom would be clear, so
    // the cue points at the shortest way out rather than at the widest gap in the room.
    //
    // ⚠️ SIGN, MEASURED NOT ASSUMED. `look()` does `yaw -= dx`, so a mouse push to the RIGHT
    // DECREASES yaw; and `d(forward)/d(yaw)` is `(cos yaw, 0, −sin yaw)`, which is the same
    // vector this file calls `right` and which is in fact SCREEN-LEFT (screen-right is
    // `forward × up` = `−right`). So a positive yaw step turns the view LEFT. Getting this
    // backwards would produce a cue that reliably points into the wall.
    let turn = 'left', best = -1;
    for (let i = 1; i <= CUE_SAMPLES && best < this.tightAt; i++) {
      const a = (i / CUE_SAMPLES) * Math.PI;
      for (const s of [1, -1]) {
        const y = this.yaw + a * s;
        const off = Math.min(this.shoulder, this.dbg.sideRoom);
        // ⚠️ DEDICATED SCRATCH. `pivot` in `update()` IS the module-level `_v`, so reusing `_v`
        // here would quietly overwrite the caller's own variable — the class of bug that is
        // invisible until something downstream reads it.
        _c1.copy(pivot);
        _c1.x += Math.cos(y) * off;
        _c1.z -= Math.sin(y) * off;
        const cp = Math.cos(this.pitch);
        _c2.set(-Math.sin(y) * cp, -Math.sin(this.pitch), -Math.cos(y) * cp);
        const hit = this.world.castRay(_c1, _c2, this.distance + STANDOFF);
        const room = hit && hit.distance < this.distance + STANDOFF
          ? Math.max(0, hit.distance - STANDOFF) : this.distance;
        if (room > best) { best = room; turn = s > 0 ? 'left' : 'right'; }
        if (room >= this.tightAt) break;
      }
    }
    this._cueArmed = false;
    const first = this.cueFired === 0;
    this.cueFired++;
    this.onWedge?.({ turn, first, clearance: +best.toFixed(2) });
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

// ---- TABLET INPUT (task-tablet-input.md): Space attacks, arrow keys look. Both are additive
// routes to actions the mouse already drives — see the `Input` constructor and `takeMouse()`.
/**
 * rad of camera turn per unit of accumulated `mouse.dx`/`dy` — MUST match `ThirdPersonCamera`'s
 * own default `sensitivity` (0.0026), because the arrow-key look path below is deliberately built
 * to convert an angular rate into the same `dx`/`dy` units the mouse path already produces, so it
 * rides `cam.look()` unmodified and inherits its pitch clamp for free rather than duplicating it.
 * `Input` has no reference to the `ThirdPersonCamera` instance (nothing wires one in), so this is
 * a matched literal rather than a shared import — `views/game.js` never overrides `sensitivity`.
 */
const ARROW_LOOK_SENSITIVITY = 0.0026;
/** rad/s the arrow keys turn the view — picked to be usable without a mouse, not twitchy. */
const ARROW_YAW_RATE = 1.4;
/** rad/s for pitch — slower than yaw: the pitch clamp is only ~1.57 rad end to end. */
const ARROW_PITCH_RATE = 0.9;

/** Keyboard + pointer-lock mouse. Inert in capture mode, where views script the input. */
export class Input {
  constructor(dom, o = {}) {
    this.keys = new Set();
    // ⚠️ ONE-SHOT KEYS NEED THEIR OWN LATCH, AND THIS IS WHY.
    //
    // `keys` is a HELD-key set: `keyup` removes from it. `move`/`run` poll it every frame
    // while the key is down, so they are unaffected. But `consume()` — which drives E
    // (interact) and Q (drop) — could only ever see a key that was STILL HELD at the instant
    // a frame happened to run. A press is therefore registered only if a frame lands between
    // keydown and keyup, which is a race the player always loses when the frame rate dips.
    //
    // Reported from a real playthrough as "E and Q seem to crash the game", and reproduced:
    // an item 0.1 m away with the HUD reading "[E] FIT ARM", E pressed, nothing happens, no
    // error thrown. `player.interact()` called DIRECTLY on the same frame returns `pickUp`
    // and works perfectly — so the logic was never broken, the keypress simply never arrived.
    // The same session reported very long load times, and that is the same bug: while the
    // 30–60 s shader compile has the frame rate on the floor, an 80 ms keypress falls
    // entirely between two frames and is dropped silently.
    //
    // `once` latches on keydown and is cleared ONLY by `consume()`, so a press cannot be lost
    // no matter how long the frame takes. Guarded on `e.repeat` so holding a key is one
    // action, not an auto-repeat stream.
    this.once = new Set();
    // for the arrow-key look integration in `takeMouse()` — real elapsed time since the last
    // call, because nothing calls `Input.update(dt)`; `takeMouse()` is the only per-frame hook
    // this class gets, from `_liveInput` in `views/game.js`.
    this._lastMouseTakeMs = null;
    this.mouse = { dx: 0, dy: 0, rdown: false };
    // ---- SPACE IS THE KEYBOARD ATTACK, AND IT RIDES THE MOUSE-BUTTON PATH RATHER THAN A NEW
    // ONE (task-tablet-input.md §3.1: "wire it to the same path a left-click takes").
    // `_liveInput` does `if (input.mouse.down) player.attack(t)` — a LEVEL test, polled every
    // frame, exactly like a held mouse button or a held touch tap already is. Folding Space into
    // `mouse.down` itself, via a getter/setter, means Space swings through the literal same
    // branch a left-click takes, with no change needed at that call site — it cannot tell the
    // difference — and it is never gated on pointer lock, because `mouse.down` never was: only
    // `mousemove`'s look delta checks `pointerLockElement`.
    //
    // Two conditions OR together, and BOTH are needed:
    //   `keys.has('Space')` — true for exactly as long as the key is physically down. This is
    //     what gives hold-to-repeat: `_liveInput` calls `player.attack(t)` every frame this is
    //     true, and `attack()` itself is the only throttle (`this._fireCd`, from
    //     `WEAPON_COOLDOWN`) — so the swing rate tracks the weapon's cooldown, never the OS's
    //     key-repeat timing, which is what a ~60 s dig needs.
    //   `once.has('Space')` — the LATCH `_onKey` below already sets on keydown and that a
    //     starved frame cannot lose (see its own comment: this is the exact E/Q race, for a
    //     different key). Read here rather than through `consume()`, because `consume()` also
    //     deletes from `keys` — calling it on every frame Space is held would cut a real hold
    //     short the instant one frame happened to observe it. Consumed by hand, on read, so it
    //     still cannot re-report the same edge twice.
    // Without the `once` half this would be a `keys.has()` LEVEL TEST, and a tap fast enough
    // that keydown AND keyup both land inside one skipped frame — the starved-frame race `once`
    // exists for — would never once show `keys.has('Space') === true` to `_liveInput`, so the
    // swing would silently not happen. That is John's original bug, reproduced on a new key.
    let _rawMouseDown = false;
    Object.defineProperty(this.mouse, 'down', {
      enumerable: true,
      configurable: true,
      get: () => {
        if (this.once.has('Space')) { this.once.delete('Space'); return true; }
        return _rawMouseDown || this.keys.has('Space');
      },
      set: (v) => { _rawMouseDown = v; },
    });
    /* =======================================================================================
     * 🖱️ FOCUS AND POINTER LOCK — AND THE SECOND SYMPTOM IS WORSE THAN THE FIRST
     * =======================================================================================
     *
     * John, 2026-08-09: *"I am having problems with the point lock for the game when I alt tab.
     * can we pause it when the game it tabbed. Also sometimes I think the point or something
     * else is limiting my mouse movement on my computer."*
     *
     * The second sentence is the serious one. Pointer lock was acquired on a canvas click and
     * **nothing in this file ever released it**, so when the window lost focus the lock survived
     * the focus change and the OS cursor stayed captured by a page that was no longer in front.
     * A prototype that eats the desktop cursor is worse than a prototype with a bad camera.
     *
     * Three states, and they are not the same event:
     *   · ALT-TAB / clicking another monitor  -> `blur` only. The tab is still "visible" to the
     *     Page Visibility API and rAF keeps running, so `visibilitychange` never fires.
     *   · MINIMISE / switching browser tab    -> `visibilitychange`, and Chrome also stops rAF.
     *   · Esc                                 -> `pointerlockchange` alone; focus never moves.
     * Hence all three listeners. Any one of them on its own leaves a real case unhandled.
     *
     * ⚠️ KEYS HELD AT THE MOMENT FOCUS LEAVES NEVER GET THEIR `keyup`. Without clearing `keys`,
     * alt-tabbing mid-sprint leaves W latched and the robot runs into a wall for as long as you
     * are away. `once` is deliberately NOT cleared: it is the one-shot latch that exists because
     * an 80 ms keypress can fall entirely between two frames (see its own note above), and
     * throwing it away here would re-introduce that bug with a focus change as the trigger.
     *
     * ⚠️ AND EVERY POINTER-LOCK CALL IS DEFENDED. `requestPointerLock()` returns a PROMISE and
     * `main.js` turns any unhandled rejection into the full-screen "VIEW … FAILED" page — a
     * refused lock does not degrade, it hard-fails to a stack trace. Two real cases caused it:
     * an embedded frame, and iPadOS Safari, which has no Pointer Lock at all. `exitPointerLock`
     * is treated the same way, and the whole thing is inside a try/catch, because a browser
     * without the API must lose mouselook and nothing else — the arrow-key look path in
     * `takeMouse()` still works with no lock at all.
     */
    /** Does the page have focus? `views/game.js` pauses the simulation on this. */
    this.focused = true;
    /** Is the pointer currently locked to the canvas. */
    this.hasLock = false;
    /** Has it EVER been locked this session — what separates "lost it" from "never had it". */
    this.hadLock = false;
    /** One-shot: the lock went away. Consumed by `views/game.js` to spend a callout. */
    this.lockLost = false;

    this.enabled = o.enabled !== false;
    if (!this.enabled) return;
    this._onKey = (e, down) => {
      const k = e.code;
      if (down) { this.keys.add(k); if (!e.repeat) this.once.add(k); } else this.keys.delete(k);
      // ArrowLeft/Right/Up/Down added for the keyboard look path below — without this the page
      // scrolls under the canvas on every look input, which on a tablet reads as the control
      // being broken rather than merely un-prevented (task-tablet-input.md's own trap #2).
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyE', 'KeyQ', 'ShiftLeft',
        'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(k)) e.preventDefault();
    };
    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));
    // ⚠️ `requestPointerLock()` RETURNS A PROMISE, AND A REJECTED ONE KILLED THE WHOLE GAME.
    // `main.js:26` is `addEventListener('unhandledrejection', (e) => fail(e.reason))`, which
    // paints the "VIEW ... FAILED" screen over everything. So any browser that REFUSES the lock
    // did not degrade — it hard-failed to a black screen with a stack trace. Reproduced exactly:
    // "The root document of this element is not valid for pointer lock." Two real cases, neither
    // exotic: an embedded/cross-origin frame, and **iPadOS Safari, which has no Pointer Lock at
    // all**. On a tablet the game was unplayable in a way that looked like a crash, not a
    // limitation.
    this.lockDenied = false;
    const tryLock = () => {
      try {
        const r = dom.requestPointerLock?.();
        if (r && typeof r.catch === 'function') r.catch(() => { this.lockDenied = true; });
      } catch { this.lockDenied = true; }
    };
    dom.addEventListener('click', tryLock);
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement !== dom) return;
      this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
    });

    // DRAG-TO-LOOK, used only when the pointer is NOT locked. With a working lock this branch
    // never runs, so desktop behaviour is untouched. A tap (under DRAG_SLOP total travel) is an
    // attack; anything further is a look gesture and must NOT also fire the weapon, or every
    // attempt to turn round shoots the wall. `preventDefault` on a non-mouse pointer is what
    // suppresses the compatibility mouse events, so touch does not fire `mousedown` as well.
    const DRAG_SLOP = 6;
    let drag = null;
    dom.style.touchAction = 'none';   // or the browser pans/zooms the page instead of aiming
    dom.addEventListener('pointerdown', (e) => {
      if (document.pointerLockElement === dom) return;
      if (e.pointerType !== 'mouse') e.preventDefault();
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, travel: 0 };
      dom.setPointerCapture?.(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      drag.travel += Math.abs(dx) + Math.abs(dy);
      this.mouse.dx += dx; this.mouse.dy += dy;
    });
    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const tap = drag.travel < DRAG_SLOP;
      drag = null;
      if (tap && e.pointerType !== 'mouse') {
        // Held state, not an edge — the game polls `mouse.down`, so a tap has to last a frame
        // or two to be seen at all.
        this.mouse.down = true;
        setTimeout(() => { this.mouse.down = false; }, 120);
      }
    };
    dom.addEventListener('pointerup', endDrag);
    dom.addEventListener('pointercancel', endDrag);
    window.addEventListener('mousedown', (e) => { if (e.button === 0) this.mouse.down = true; if (e.button === 2) this.mouse.rdown = true; });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; if (e.button === 2) this.mouse.rdown = false; });
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---- 🖱️ focus, pointer lock and letting go. See the block above the `enabled` flag.
    /** Give the OS cursor back. Safe to call when there is no lock, and on browsers with no API. */
    this.releaseLock = () => {
      try {
        if (typeof document !== 'undefined' && document.pointerLockElement) {
          const r = document.exitPointerLock?.();
          if (r && typeof r.catch === 'function') r.catch(() => {});
        }
      } catch { /* no Pointer Lock API — there is nothing to release */ }
    };
    const focusLost = () => {
      this.focused = false;
      this.releaseLock();
      this.clearInput(false);                  // ...`false` keeps `once`; see the block above
      drag = null;
    };
    this._clearDrag = () => { drag = null; };
    window.addEventListener('blur', focusLost);
    window.addEventListener('focus', () => { this.focused = true; });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') focusLost();
      else if (document.hasFocus?.() !== false) this.focused = true;
    });
    document.addEventListener('pointerlockchange', () => {
      const now = document.pointerLockElement === dom;
      // 🚨 LOSING THE LOCK DROPS EVERY HELD KEY. John: *"movement input continue permanently
      // after an escape."* A HELD-key set is only ever emptied by `keyup`, and the moment the
      // player stops being in the pointer-locked session — Esc, a modal, alt-tab, a win screen
      // — the keyup for whatever they were holding can land somewhere that is not listening,
      // and the robot walks into a wall forever. Nothing is being played at this instant, so
      // the latches go too: a Space queued a second before a win screen must not fire a swing
      // when the player clicks back in.
      if (!now && this.hasLock) { this.lockLost = true; this.clearInput(true); }
      // A lock that succeeds clears a previous denial: Chrome refuses a re-lock for a short
      // cooldown after an exit, and a sticky `lockDenied` from one refused attempt would
      // permanently mislabel a browser that can in fact lock.
      if (now) { this.hadLock = true; this.lockDenied = false; }
      this.hasLock = now;
    });
  }

  /**
   * 🚨 **LET GO OF EVERYTHING.** The fix for *"movement input continue permanently after an
   * escape"* — and the general answer to a HELD-key set whose only eraser is a `keyup` that
   * may never come.
   *
   * @param {boolean} latches also clear the one-shot `once` latch.
   *
   * ⚠️ **`latches` IS NOT A CONVENIENCE FLAG.** `once` exists because an 80 ms keypress can
   * fall entirely between two frames when the frame rate collapses — John's "E and Q seem to
   * crash the game", and the defect `mechanics.mjs`'s starved-frame check was written for and
   * validated against. Clearing it at the wrong moment reintroduces that bug with a new
   * trigger. The rule: clear latches on a TRANSITION the player caused and knows about (a round
   * reset, losing pointer lock, a modal), never on a mere loss of window focus — alt-tabbing
   * mid-press must not eat the press, and the keys will be re-read on the way back anyway.
   */
  clearInput(latches = true) {
    this.keys.clear();
    if (latches) this.once.clear();
    this.mouse.down = false; this.mouse.rdown = false;
    this.mouse.dx = 0; this.mouse.dy = 0;    // a stale delta would snap the view on resume
    this._clearDrag?.();
  }

  /**
   * Ask for the pointer back. **Only ever call this from inside a real user gesture** — a
   * browser refuses a programmatic re-lock, and Chrome additionally enforces a short cooldown
   * after an exit, so an automatic retry fails silently and leaves the player with no mouselook
   * and no explanation. The one legitimate caller is the click on a retry button.
   *
   * ⚠️ Defended, like `tryLock`: `requestPointerLock()` returns a PROMISE and `main.js` turns an
   * unhandled rejection into the full-screen "VIEW … FAILED" page.
   */
  requestLock(dom) {
    try {
      const r = dom?.requestPointerLock?.();
      if (r && typeof r.catch === 'function') r.catch(() => { this.lockDenied = true; });
    } catch { this.lockDenied = true; }
  }

  /**
   * THE MOUSE IS FREE AND THE PLAYER NEEDS TO KNOW WHY — but only if they ever had it.
   *
   * ⚠️ Deliberately `hadLock && !hasLock` rather than just `!hasLock`. Headless Chromium is
   * routinely refused pointer lock (`playtest.mjs` reports that as a SKIP, not a failure), so a
   * bare `!hasLock` would paint this line across every scenario screenshot the project takes
   * and teach everyone to ignore it. This fires for the case it was written for: a player who
   * had mouselook, alt-tabbed or pressed Esc, and now has a cursor and no idea what happened.
   */
  get lockPrompt() {
    return this.enabled && this.hadLock && !this.hasLock
      ? 'MOUSE RELEASED — CLICK TO LOOK  ·  ARROW KEYS ALSO LOOK' : '';
  }

  /**
   * Read and clear the mouse delta. ALSO folds in the arrow-key look rate, so the one caller
   * (`_liveInput`) that feeds this straight into `cam.look(dx, dy)` gets ArrowLeft/Right/Up/Down
   * for free, on the exact same code path a mouse drag or a touch drag already uses — inheriting
   * `cam.look`'s pitch clamp (`[-0.95, 0.62]`, the same one the mouse path is clamped to) rather
   * than re-deriving it here (task-tablet-input.md §3.2).
   *
   * This is the only per-frame hook this class has, so the arrow-key rate is integrated against
   * WALL-CLOCK time between calls rather than a frame count — it holds steady regardless of the
   * render frame rate, same reasoning as `mechanics.mjs`'s starved-frame check.
   */
  takeMouse() {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const dt = this._lastMouseTakeMs != null ? Math.min(0.25, (now - this._lastMouseTakeMs) / 1000) : 0;
    this._lastMouseTakeMs = now;
    if (dt > 0) {
      const yawKey = (this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('ArrowLeft') ? 1 : 0);
      const pitchKey = (this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('ArrowUp') ? 1 : 0);
      // Sign matched to the mouse, not invented: `cam.look` does `yaw -= dx*sens`, and mouse-right
      // (dx>0) turns the view right — see that method's own comment — so ArrowRight also needs a
      // positive dx. Likewise `pitch -= dy*sens` with mouse-down (dy>0) looking down, so ArrowDown
      // needs a positive dy and ArrowUp a negative one.
      if (yawKey) this.mouse.dx += (yawKey * ARROW_YAW_RATE * dt) / ARROW_LOOK_SENSITIVITY;
      if (pitchKey) this.mouse.dy += (pitchKey * ARROW_PITCH_RATE * dt) / ARROW_LOOK_SENSITIVITY;
    }
    const m = { dx: this.mouse.dx, dy: this.mouse.dy }; this.mouse.dx = 0; this.mouse.dy = 0; return m;
  }

  get move() {
    const k = this.keys;
    return {
      x: (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0),
      y: (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0),
    };
  }
  get run() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
  pressed(code) { return this.keys.has(code); }
  /**
   * One-shot read of a key press. Reads the `once` LATCH, not the held-key set, so a press
   * survives until it is actually read even if the frame rate has collapsed — see the note in
   * the constructor. Still clears `keys` too, so a key held down cannot re-trigger by polling.
   */
  consume(code) {
    const had = this.once.has(code) || this.keys.has(code);
    this.once.delete(code);
    this.keys.delete(code);
    return had;
  }
}

// ---------------------------------------------------------------------------

function shortestAngle(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function wrapLerpAngle(a, b, k) { return a + shortestAngle(a, b) * k; }
export { shortestAngle };
