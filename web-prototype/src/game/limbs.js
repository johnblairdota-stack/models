import * as THREE from 'three';
import {
  SOCKETS, SOCKET_KIND, SOCKET_LIMB, LIMB_SOCKET,
  ARM_GADGETS, LEG_GADGETS, gaitFor, speedScaleFor,
} from './rules.js';
import { buildGadget } from '../gadgets/index.js';

/**
 * ===========================================================================
 * THE LIMB SYSTEM — health, inventory and loadout are the same four slots.
 * ===========================================================================
 *
 * There is no health bar and no backpack. A body is FOUR SOCKETS:
 *
 *     shoulderL   shoulderR   hipL   hipR
 *
 * and each one holds exactly one of three things:
 *
 *     a LIMB     — yours, or scavenged off someone else's corpse
 *     a GADGET   — the nail gun bolts to the elbow; that arm is gone while it is fitted
 *     NOTHING    — you took a hit
 *
 * Everything else falls out of that. Damage empties a socket instead of subtracting a
 * number. The emptied limb is a real object that falls on the floor and can be picked up
 * BY ANYONE, refitted, or swung as a club (Dev Art 1785319916301). Four empty sockets is
 * death, and the part the hunter takes off you is what it grows with.
 *
 * WHY IT IS BUILT THIS WAY
 * `buildUnit4H` was authored so a limb is literally a subtree — `unit.limbs.armL` is the
 * `j.shoulderL` group. So detaching is `removeFromParent()` with the world matrix baked,
 * and attaching is `add()` with the transform cleared. No geometry surgery, no skinning,
 * no second "dropped limb" model that can drift from the worn one. The thing lying on the
 * floor IS the arm that was on the robot one frame earlier.
 *
 * ---------------------------------------------------------------------------
 * API
 * ---------------------------------------------------------------------------
 *   const field = new LimbField(scene, { rng, floorY });   // one per world
 *   const rig   = new LimbRig({ unit, field, id: 'p1' });  // one per character
 *
 *   rig.caps                       -> { arms, legs, hands, freeHands, gait, speedScale,
 *                                       canRun, canClimb, canCarry, skates, downed }
 *   rig.state                      -> { shoulderL: {type,limb,gadget}, ... }  (wire-safe)
 *   rig.occupant(socket)           -> 'limb' | 'gadget' | 'empty'
 *
 *   rig.detach(socket, opts)       -> LimbItem | null    damage: the socket empties and
 *                                                        the limb becomes world debris
 *   rig.attach(socket, item)       -> boolean            refit yours or a scavenged one
 *   rig.fitGadget(socket, name)    -> { ok, displaced }  costs you the arm in that socket
 *   rig.fitSkates() / removeSkates()
 *
 *   rig.pickUp(item)               -> boolean            needs a free hand
 *   rig.dropHeld(impulse)          -> LimbItem | null
 *   rig.held                       -> LimbItem | null    what is in your fist
 *   rig.swing(t)                   -> boolean            club attack; see swingHit()
 *   rig.swingHit()                 -> {at,dir} | null    fires once, mid-swing
 *   rig.weapons()                  -> ['nailgun','limbClub','fist', ...]
 *
 *   rig.poseOverrides(t)           -> partial pose to merge over the gait's pose
 *   rig.update(dt, t)              -> gadget animation + swing timing
 *
 *   field.update(dt)               -> ballistics + settling for every dropped limb
 *   field.nearest(pos, radius)     -> LimbItem | null    what you could pick up
 *   field.items                    -> LimbItem[]
 *
 * Every mutator returns enough to replicate it: a LimbItem carries `id`, `socketKind` and
 * `gadget`, which is all `net/server.mjs` needs to authorise the same action.
 */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _box = new THREE.Box3();

let _uid = 0;
const uid = (p) => `${p}.${(_uid++).toString(36)}`;

// ---------------------------------------------------------------------------
// LimbItem — a limb (or a gadget) as an object in the world
// ---------------------------------------------------------------------------

/**
 * One detached thing. It is the same Object3D that was on the robot; only its parent
 * changed. `restBox` is measured once at construction so ground contact can be resolved
 * against the real silhouette instead of a guessed radius — a leg lying on a floor with a
 * gap under the boot is the single most obvious tell that nothing here is real.
 */
export class LimbItem {
  constructor(o) {
    this.id = o.id ?? uid('limb');
    this.type = o.type ?? 'limb';        // 'limb' | 'gadget'
    this.socketKind = o.socketKind;      // 'arm' | 'leg' — what socket it can fill
    this.gadget = o.gadget ?? null;      // gadget name when type === 'gadget'
    this.root = o.root;
    this.owner = o.owner ?? null;        // who it came off
    this.height = o.height ?? 1.7;

    this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3();
    this.asleep = false;
    this.restTimer = 0;
    this.held = null;                    // LimbRig currently holding it
    this.attachedTo = null;              // LimbRig it is fitted to
    this.age = 0;

    /**
     * GPU RESOURCES THIS ITEM OWNS AND MUST FREE WHEN IT IS THROWN AWAY — a `buildGadget()`
     * or `buildSledgeProp()` result, i.e. anything with a `dispose()` that this item is the
     * only reference to. Null for a limb, which owns nothing: a limb's meshes belong to
     * `unit.limbs[...]` and outlive every item ever made for them.
     *
     * ⚠️ **THIS IS NOT `gadgetObj` AND THE TWO MUST NOT BE MERGED.** They look
     * interchangeable — both hold a built gadget — but they mean opposite things to
     * `LimbRig.attach()`, which branches on `gadgetObj` at exactly one line:
     *
     *   gadgetObj    "a gun came off with this arm; BOLT THIS ONE BACK ON rather than
     *                building a second" — set only by `detach()`, consumed by `attach()`.
     *   ownedBuild   "when this item is destroyed, free this" — an ownership record that
     *                no fitting path reads.
     *
     * Storing a world pickup's gadget in `gadgetObj` to make it disposable would flip
     * `attach()` into its reuse branch and fit the WORLD-tuned object — `backdrop: 'world'`
     * heat wash (see `spawnGadget`), `scale 1.3`, inside a pickup holder — onto the player's
     * body instead of building a body-tuned one, and would start `update()`ing pickups on the
     * floor. `spawnGadget`'s header states the shape it relies on: a world gadget carries the
     * gadget's NAME and no built object. This field keeps that true.
     */
    this.ownedBuild = null;

    // Bounds in the limb's OWN frame. `Box3.setFromObject` reports WORLD space, so using
    // it here put the box wherever the robot happened to be standing and the ground test
    // then buried every dropped limb in the floor. Cancel the root's own world matrix.
    const b = localBox(this.root);
    this.size = b.getSize(new THREE.Vector3());
    this.centreLocal = b.getCenter(new THREE.Vector3());
    this.reach = Math.max(this.size.x, this.size.y, this.size.z);
  }

  get inWorld() { return !this.held && !this.attachedTo; }
  get label() {
    if (this.type === 'gadget') return this.gadget;
    return this.socketKind === 'leg' ? 'leg' : 'arm';
  }
}

// ---------------------------------------------------------------------------
// LimbField — every loose limb in the level
// ---------------------------------------------------------------------------

export class LimbField {
  /**
   * @param {THREE.Object3D} scene  where dropped limbs are parented
   * @param {object} [o] rng (seeded — never Math.random), floorY, gravity, bounds
   */
  constructor(scene, o = {}) {
    this.scene = scene;
    this.rng = o.rng ?? (() => 0.5);
    this.floorY = o.floorY ?? 0;
    this.gravity = o.gravity ?? -11.0;
    this.bounds = o.bounds ?? null;      // {minX,maxX,minZ,maxZ} — keeps limbs in the room
    this.items = [];
    this._onDrop = new Set();
    this._onTake = new Set();
  }

  onDrop(fn) { this._onDrop.add(fn); return () => this._onDrop.delete(fn); }
  onTake(fn) { this._onTake.add(fn); return () => this._onTake.delete(fn); }

  /** Put an item into the world with an impulse. The limb keeps its world transform. */
  drop(item, { impulse = null, spin = null } = {}) {
    item.root.updateWorldMatrix(true, false);
    item.root.matrixWorld.decompose(item.root.position, item.root.quaternion, item.root.scale);
    item.root.removeFromParent();
    this.scene.add(item.root);
    item.held = null;
    item.attachedTo = null;
    item.asleep = false;
    item.restTimer = 0;
    item.age = 0;
    const r = this.rng;
    item.vel.copy(impulse ?? _v.set((r() - 0.5) * 2.2, 2.0 + r() * 1.4, (r() - 0.5) * 2.2));
    item.spin.copy(spin ?? _v2.set((r() - 0.5) * 9, (r() - 0.5) * 9, (r() - 0.5) * 9));
    if (!this.items.includes(item)) this.items.push(item);
    for (const fn of this._onDrop) fn(item);
    return item;
  }

  /**
   * PUT A GADGET IN THE WORLD, as loot.
   *
   * ⚠️ THIS DID NOT EXIST, AND ITS ABSENCE MADE EVERY GADGET UNREACHABLE. `play-critic-4`
   * grepped `game.js`, `spaces.js` and this file and found **zero world placement of any
   * gadget**: nothing spawns one, nothing drops one, and the player starts with the nailgun.
   * So the nail gun was the only gadget a person could ever hold, and the ball, oil, grapple
   * and skates — with all their distinct verbs — could not be encountered by playing at all.
   * The critic called it the single highest-leverage fix on the board and it was right: every
   * other gadget improvement is invisible until this exists.
   *
   * The item carries the gadget's NAME and no built gadget object, which is exactly the shape
   * `LimbRig.attach()` already handles — it routes to `fitGadget(socket, item.gadget)` and
   * builds the real thing on the player's own body at the moment it goes on. So a world
   * gadget is an ordinary `LimbItem`: it falls, it rests, `nearest()` finds it, `E` fits it,
   * and the hunter can absorb it like anything else.
   */
  spawnGadget(name, pos, { height = 1.7, materials = null, rng = null } = {}) {
    // ⚠️ `backdrop: 'world'` IS LOAD-BEARING — see the HEAT_WASH table in gadgets/index.js.
    // Gadget filters are tuned on the `gadget.*` studio cyc, which sits on the FLAT TOP of the
    // ACES curve; the mansion is a mid-tone, where the same filter is about twice as violent.
    // Measured: the nail gun's heat wash took 21 LDR levels of luminance off the corridor floor
    // beside the player. Anything built for the GAME rather than for a studio view says so here.
    const g = buildGadget(name, { height, materials, backdrop: 'world' });
    const holder = new THREE.Group();
    holder.name = `pickup.${name}`;
    holder.add(g.root);
    g.root.scale.setScalar(1.3);          // match the scale it reads at when fitted
    holder.position.copy(pos);
    const item = new LimbItem({
      id: `world.${name}.${uid('g')}`,
      type: 'gadget',
      // ⚠️ SKATES ARE NOT A LEG-SOCKET ITEM. They mount `shinBoth`, OVER both legs, and go on
      // through `fitSkates()` — they never occupy `hipL/hipR`. Tagging them `'leg'` made them
      // masquerade as a detached leg: `nearest()` offered them for a hip socket and `interact`
      // tried to bolt them into one. Their own kind keeps them out of every limb code path.
      socketKind: name === 'skates' ? 'skates' : 'arm',
      gadget: name,
      root: holder,
      owner: null,
      height,
    });
    // The pickup owns `g` outright — nothing else holds a reference, and `attach()` builds its
    // own on the body rather than reusing this one. So whoever destroys the item frees it; see
    // `ownedBuild`'s note for why this is not `gadgetObj`, which would change what gets fitted.
    item.ownedBuild = g;
    this.scene.add(holder);
    // Settle it where it was placed rather than hurling it: this is loot lying in a room, not
    // a limb that was just torn off. A tiny drop lets the existing rest logic seat it.
    this.drop(item, { impulse: new THREE.Vector3(0, 0.2, 0), spin: new THREE.Vector3(0, 0.6, 0) });
    return item;
  }

  /** Remove from the loose pool — someone picked it up or fitted it. */
  take(item) {
    const i = this.items.indexOf(item);
    if (i >= 0) this.items.splice(i, 1);
    for (const fn of this._onTake) fn(item);
    return item;
  }

  /** Closest loose, settled-or-not item within `radius` of a point. */
  nearest(pos, radius = 1.1, filter = null) {
    let best = null, bestD = radius * radius;
    for (const it of this.items) {
      if (!it.inWorld) continue;
      if (filter && !filter(it)) continue;
      const d = it.root.position.distanceToSquared(pos);
      if (d < bestD) { bestD = d; best = it; }
    }
    return best;
  }

  /**
   * Ballistics. Deliberately not a physics engine: 20 lines of float maths per item, and
   * items sleep permanently once they stop, so a floor covered in limbs costs nothing.
   */
  update(dt, t = 0) {
    for (const it of this.items) {
      // a dropped gadget limb keeps burning / spinning on the floor
      it.gadgetObj?.update?.(dt, t);
      if (!it.inWorld || it.asleep) continue;
      it.age += dt;
      const p = it.root.position;
      it.vel.y += this.gravity * dt;
      p.addScaledVector(it.vel, dt);

      // spin: integrate as an axis-angle nudge so it tumbles without gimbal artefacts
      const sp = it.spin.length();
      if (sp > 1e-4) {
        _q.setFromAxisAngle(_v.copy(it.spin).multiplyScalar(1 / sp), sp * dt);
        it.root.quaternion.premultiply(_q);
      }

      // ground contact against the rotated bounds, not a fudged radius
      const low = this._lowestOffset(it);
      const pen = (this.floorY - (p.y + low));
      if (pen > 0) {
        p.y += pen;
        if (it.vel.y < 0) {
          it.vel.y = -it.vel.y * 0.24;
          it.spin.multiplyScalar(0.42);
        }
        // Coulomb-ish sliding friction while in contact. Without it a limb keeps every
        // bit of its horizontal impulse and skates a metre across the room before it
        // stops, which is how a dropped leg ends up at the wrong robot feet.
        const fr = Math.exp(-7.5 * dt);
        it.vel.x *= fr; it.vel.z *= fr;
        if (Math.abs(it.vel.y) < 0.35 && it.vel.lengthSq() < 0.55) {
          it.restTimer += dt;
          it.vel.multiplyScalar(0.80);
          it.spin.multiplyScalar(0.72);
          // settle: a limb on a floor lies flat. Rotate its long axis into the horizontal.
          this._settle(it, Math.min(1, dt * 9));
          if (it.restTimer > 0.42) {
            it.asleep = true;
            this._settle(it, 1);
            it.root.position.y = this.floorY - this._lowestOffset(it);
          }
        } else it.restTimer = 0;
      }

      if (this.bounds) {
        const b = this.bounds;
        if (p.x < b.minX) { p.x = b.minX; it.vel.x = Math.abs(it.vel.x) * 0.3; }
        if (p.x > b.maxX) { p.x = b.maxX; it.vel.x = -Math.abs(it.vel.x) * 0.3; }
        if (p.z < b.minZ) { p.z = b.minZ; it.vel.z = Math.abs(it.vel.z) * 0.3; }
        if (p.z > b.maxZ) { p.z = b.maxZ; it.vel.z = -Math.abs(it.vel.z) * 0.3; }
      }
    }
  }

  /** Lowest point of the item's bounds relative to its origin, at its current rotation. */
  _lowestOffset(it) {
    const s = it.size, c = it.centreLocal;
    _m.makeRotationFromQuaternion(it.root.quaternion);
    let lo = Infinity;
    for (let i = 0; i < 8; i++) {
      _v.set(
        c.x + (i & 1 ? 0.5 : -0.5) * s.x,
        c.y + (i & 2 ? 0.5 : -0.5) * s.y,
        c.z + (i & 4 ? 0.5 : -0.5) * s.z).applyMatrix4(_m);
      if (_v.y < lo) lo = _v.y;
    }
    return lo;
  }

  /**
   * Lay it down. A limb's long axis is local -Y (that is how the rig is built), so the
   * settled pose is the one that puts local -Y into the floor plane, keeping the yaw it
   * already had. Without this, dropped limbs stand on end like skittles.
   */
  _settle(it, k) {
    _v.set(0, -1, 0).applyQuaternion(it.root.quaternion).normalize();   // current long axis
    _v2.set(_v.x, 0, _v.z);
    if (_v2.lengthSq() < 1e-5) _v2.set(1, 0, 0);
    _v2.normalize();
    _q.setFromUnitVectors(_v, _v2);          // the full correction to flat
    _q2.identity().slerp(_q, k);             // ease toward it; k = 1 snaps flat
    it.root.quaternion.premultiply(_q2);
  }

  dispose() {
    for (const it of this.items) it.root.removeFromParent();
    this.items.length = 0;
  }
}

// ---------------------------------------------------------------------------
// THE COLLAPSE COST — a wall that lands on you knocks a limb off
// ---------------------------------------------------------------------------

/**
 * 🦾 **A COLLAPSE DOES NOT HURT YOU. IT TAKES A PART OFF YOU.**
 *
 * John, asked by a critic whether a collapsing wall should be able to damage the player:
 *
 *   > *"I think **generally a collapse shouldn't hurt you**. we could try it as a mechanic but
 *   > **maybe the robots limbs fall off and they just need to put it back on**."*
 *
 * No health, no damage number, no invulnerability window. The cost is **time and capability** —
 * you walk to the part, you press E, and only then does the hammer come back out
 * (`_toggleSledge` gates on `caps.arms === 2`, so losing an arm literally disarms you).
 *
 * 🎯 **AND IT IS THE DIG'S MISSING COST TERM.** `critic-dig-8` on why digging is too easy:
 * *"one verb, one decision, one resource, and **no cost term anywhere**. Three blows feels cheap
 * because it **is** free, and would at twelve. Adding blows is the one change guaranteed not to
 * work."* This is a cost that is paid in the same currency the skill is spent in — position.
 *
 * ---------------------------------------------------------------------------
 * 🎯 **THE RULE, AND EVERY NUMBER IN IT IS MEASURED OFF THE SHIPPED EVENT STREAM RATHER THAN
 * CHOSEN.** (`harness/evidence/_limb1-rule.mjs`, the shipped `DamageField` at 220 blows × both of
 * `debris-collapse` C5's play policies.)
 *
 * **1. ONLY A FULL BITE CAN DO IT, AND THE THRESHOLD SITS IN A MEASURED HOLE.** `sag-1` made
 * collapses smaller and more frequent — the biggest event went 408 → 176 cells and a skilled dig
 * now pays out 25 pieces, not 10 — so a rule tuned to *"a collapse happened"* would fire
 * constantly and be tedious inside a minute. It is scaled to the EVENT'S OWN `area`, and over
 * 440 blows the distribution has **a hole 3.49× wide**:
 *
 * | event kind | what it is | measured, both policies |
 * |---|---|---|
 * | `lonely` | a chip off the crater rim | max **0.036 m²** |
 * | `course` | a course shedding at the skirting | max **0.152 m²** |
 * | `arch` | a bite that **ran out of material** | **0.402 m²** — exactly one in 440 blows |
 * | *(nothing at all in between — the hole)* | | |
 * | `arch` | a **full** bite off a region that has let go | **1.404–1.440 m²** |
 *
 * `area = 0.75` is the **geometric centre of that hole** (√(0.402 × 1.404) = 0.751): 1.9× above
 * the biggest thing it refuses, 1.9× below the smallest thing it admits, and **every value from
 * 0.45 to 1.35 gives the identical answer** — the difference between a measured threshold and a
 * taste is that this one has no sensitivity left to argue about.
 *
 * ⚠️ **THE 0.402 m² RUNT IS REFUSED ON PURPOSE AND IT IS A DECISION, NOT AN ARTEFACT.** It is a
 * bite that hit the end of its region's material, i.e. about a third of a piece of wall — a
 * smaller thing than the body it would be landing on. The line the rule draws is *a full bite*,
 * and drawing it there is what buys the insensitivity above.
 *
 * ⚠️ A `sag` event carries `cells: 0` and is refused outright — *nothing has fallen yet*, which
 * is the whole point of beat 2 and the reason the warning is now worth anything.
 *
 * **2. THE FOOTPRINT IS THE EVENT'S DENSITY, NOT ITS BOUNDING BOX** — the same lesson `sag-1`
 * learned when it replaced one 5.72 × 2.43 m rect that was 27% full with tight per-event boxes.
 * Measured arch densities run **24%–93%**, so a bare `w` would have taken an arm off a body
 * standing under the EMPTY quarter of a 3.16 m box. The effective width is that of a solid
 * rectangle of the same area and height, `min(w, area / h)`, which comes out a consistent
 * **0.68–1.37 m** across every measured bite — a piece of wall the size of a body, not a storey.
 *
 * **3. ARM IF IT CAME DOWN HIGH, LEG IF IT CAME DOWN LOW — and the divider is your own
 * eyeline.** Not a coin flip: the event knows where it was. Measured bite centres land at
 * **1.17–2.29 m** against a 1.54 m eyeline (`MOVE.eyeHeight` × 1.7), i.e. **4 arms and 4 legs
 * out of 8** — a split that actually splits. It also adapts for free: a crawling robot's eyeline
 * drops to 0.51 m, so the same falling piece takes an arm instead of a leg.
 * **Which SIDE is positional too** — the event's offset in the body's own frame.
 *
 * **4. IT IS AVOIDABLE, AND THAT IS THE POINT OF THE WHOLE THING.** `critic-dig-8` on the
 * crazing: *"a promise, not a warning… 1.9 s with nothing the player can do in it."* Beat 2 now
 * outlines the piece that has let go and leaves it hanging until you commit to pulling it — so
 * the window finally has something IN it, and the skill it teaches is one sentence:
 * **undermine, then back off.** The danger zone is the box under the hanging piece: `depth`
 * 0.60 m out from the face, `effW/2 − inset` along it. `WEAPON_RANGE.sledge` is 1.55 m, so
 * **the pull can be taken from 0.60–1.55 m — clear of the fall and still in reach.**
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 **THE CONDITIONS WERE TIGHTENED ON 2026-08-10 (`feel-1`) AND JOHN'S SENTENCE IS THE REASON.**
 * ---------------------------------------------------------------------------------------------
 * > *"initially **the arm comes off way too easy**. I think this mechanic needs **much tighter
 * > conditions** before limbs are lost."*
 *
 * 🚨 **THE `area` THRESHOLD WAS NOT THE LEVER AND MOVING IT WOULD HAVE BEEN A WASTED ROUND** —
 * see note 1: the distribution is bimodal with a 3.49× hole and **every value from 0.45 to 1.35
 * admits the identical set**. What was actually wrong was measured instead (`_limb1-rule` L3/L4,
 * and the new L10), and it is three separate things:
 *
 *   1. 🚨 **THERE WAS NO SAFE PLACE TO STAND AND UNDERCUT FROM.** `WEAPON_RANGE.sledge` is 1.55 m
 *      from the EYE, so reaching the skirting (v ≈ 0.10, i.e. 0.28 m up a 2.80 m face) from an
 *      eye 1.54 m up needs `√(1.55² − 1.26²)` = **0.90 m of standoff or less**. The old 1.05 m
 *      box covered all of it: *every* stance that could cut the undercut was inside the fall.
 *      `depth` is now **0.60 m**, which leaves 0.60–0.90 m to undercut from and 0.60–1.55 m to
 *      pull from. **The player radius is 0.34 m, so the danger zone went from 0.71 m of reachable
 *      standoff to 0.26 m — you now have to be almost touching the wall.**
 *   2. **BEING BESIDE THE PIECE COUNTED AS BEING UNDER IT.** The lateral test was
 *      `effW/2 + radius + 0.10`, i.e. it fired if any part of the body overlapped the rim, which
 *      on a 0.68 m bite is a 1.13 m half-width — 1.7× the piece itself. It is now `effW/2 −
 *      inset`: **the body's CENTRE has to be under the material.** Measured, a **0.60 m**
 *      half-step along the wall now clears all 8 bites and 0.45 m clears 7 (it took 1.20 m).
 *   3. 🚨 **THE BLOW THAT BROKE THE ARCH TOOK A LIMB, AND THAT ONE IS UNAVOIDABLE BY
 *      CONSTRUCTION.** `support.js` emits `sag` and peels the first `bite` **on the same blow**
 *      (`pull = !already || …`), so beat 2's warning and beat 3's payout arrived together and the
 *      player had had no chance to act on the thing that is supposed to be actionable. And the
 *      blow that does it is an undercut blow at the skirting, so by (1) they are standing in the
 *      fall. **`warned` now refuses it**: a limb comes off only for a piece that had ALREADY let
 *      go on an earlier blow — one you were shown, and pulled down on yourself anyway.
 *      `views/game.js` computes it from the blow's own event list (a bite whose box overlaps a
 *      `sag` emitted by the SAME blow is that blow's own break), so the rule stays a pure
 *      function of the event and this file still imports nothing from `src/destruction/`.
 *
 * 📐 **WHAT IT MEASURES (`_limb1-rule` L3/L4/L10, the same 440-blow stream):** dead under a bite,
 * take-rate **8/8 → 6/8 at 0.60 m**, **8/8 → 0/8 at 0.80 m and at 1.00 m**, 0/8 at 1.30 m as
 * before. Over a real 90-blow dig by a body that never moves and refits instantly — the worst
 * case the mechanic can be put in — **6 → 5 limbs at 0.60 m, and 6 → 0 at 0.80 m and beyond**.
 * The danger FOOTPRINT for a median bite goes 1.05 × 1.72 = 1.81 m² to 0.60 × 0.54 = 0.32 m²,
 * and of that only the part outside the body's own radius is reachable: **1.22 m² → 0.14 m², 8.7×
 * smaller.**
 *
 * ⚠️ **STILL NO TIME TERM, NO RNG DRAW AND NO ROUND STATE — a re-take grace was considered and
 * REFUSED.** `destruction.md` §12 named "no re-take grace" as the first thing to revisit, and it
 * is the honest suspect: bites come in a TRAIN (measured — blows 1,2,3,4,5,12 off one region), so
 * refitting and swinging again from the same spot is what produced six losses in ninety blows.
 * A cooldown would have been the first `t` in this rule and the first thing a respawn had to
 * remember to clear — `reset-2` found six leaks of exactly that shape. **The train is broken
 * positionally instead**: one step back ends it, permanently, for every bite in it.
 *
 * **5. IT CAN NEVER TAKE THE SECOND PART.** `wounds > 0` refuses outright. See the soft-lock
 * note on `Player.hitByCollapse`; this is the clause that makes it a proof rather than a hope.
 *
 * ⚠️ **NO TIME TERM, NO RANDOM DRAW.** The rule is a pure function of (the event, the body's
 * pose, the rig's state) — no cooldown, no `rng()`, nothing keyed on `t`. A replay of the same
 * hit list with the same camera reproduces it exactly, and the view's rng stream is unshifted
 * (`views/game.js`'s `onChunk` makes the same choice for its per-plate jitter, and for the same
 * reason).
 */
export const COLLAPSE_LIMB = {
  /** The ablation switch. `?limbs=0`, or flip it live — every instrument runs it as a control. */
  on: true,
  /** m² of ONE event. The measured hole is (0.402, 1.404); this is its geometric centre. */
  area: 0.75,
  /**
   * 🚨 Metres out from the face plane — **1.05 → 0.60 on 2026-08-10**, see condition 1 above.
   * The skirting can only be reached from ≤ 0.90 m, so 1.05 left no legal undercut stance
   * outside the fall. 0.60 leaves 0.30 m of undercut standoff and 0.95 m of pull standoff
   * inside the hammer's 1.55 m reach, against 0.50 m before.
   */
  depth: 0.60,
  /**
   * 🚨 Metres the body's CENTRE must be INSIDE the piece's effective width — **replaces
   * `margin: 0.10`, which was slack on the OUTSIDE and was added to the body radius as well.**
   * Under it, not beside it (condition 2). Clamped at 0 so a piece narrower than 2 × this can
   * still take a limb off someone standing dead under it.
   */
  inset: 0.15,
  /** the piece must still have material above your feet by this much to reach you at all. */
  floor: 0.20,
  /**
   * 🚨 **ONLY A PIECE THAT HAD ALREADY LET GO** (condition 3). `false` restores the old
   * behaviour, and `_limb1-rule` L10 runs it as the control that must fire where this does not.
   */
  warned: true,
};

/**
 * Would this collapse event take a limb off this body, and which one?
 *
 * **Pure.** No THREE, no rig, no side effects — so `harness/evidence/_limb1-rule.mjs` can sweep it
 * headless and `Player.hitByCollapse` can be the only thing that ever acts on the answer.
 *
 * @param {object} ev  ONE entry of `collapse().events[]`, placed in the world by the view:
 *   `{kind, cells, area, w, h, x, y, z, nx, nz, warned}` — `x/y/z` the event's own centre on the
 *   face, `nx/nz` the face's outward normal on the side that was hit, and `warned` false when
 *   this bite came off a region that let go on this SAME blow (see condition 3 above).
 *   ⚠️ **An absent `warned` means "warned"**, so a caller that has not been taught about beat 2
 *   gets the mechanic firing rather than silently disabled — a missing field must fail loud.
 * @param {object} body `{x, y, z, eyeY, radius, facing, wounds}` — `y` is the FLOOR the body
 *   stands on (`Player.update` pins `pos.y` to it every frame), `facing` is `atan2(dx, dz)`.
 * @param {object} [T]  the table, so an instrument can sweep it without editing it.
 * @returns {null|{socket:string, kind:'arm'|'leg', side:'L'|'R', out:number, lat:number,
 *                 effW:number, area:number}}
 */
export function collapseLimbHit(ev, body, T = COLLAPSE_LIMB) {
  if (!ev || !body || !T?.on) return null;
  // BEAT 2 IS NOT A HIT. A `sag` event carries `cells: 0` — the wall has let go and is hanging
  // there, and nothing has come down yet. Standing under it is the warning, not the injury.
  if (ev.kind === 'sag' || !(ev.cells > 0)) return null;
  if (!(ev.area >= T.area)) return null;
  // 🚨 NEVER THE SECOND PART. One empty socket is the most this rule can ever produce.
  if (!(body.wounds === 0)) return null;
  // 🚨 THE WALL WARNS YOU FIRST — condition 3. The blow that BREAKS the arch emits its `sag` and
  // peels its first bite together, and it is an undercut blow, so the player is standing in the
  // fall by necessity and had nothing to act on. That one is free; the next one is not.
  if (T.warned && (ev.warned ?? true) === false) return null;

  const dx = body.x - ev.x, dz = body.z - ev.z;
  // standoff from the face plane, signed: the body has to be on the side the material fell into.
  const out = dx * ev.nx + dz * ev.nz;
  if (!(out > -0.05 && out <= T.depth)) return null;
  // ...and along it. `min(w, area/h)` is the density correction — see note 2 above.
  const effW = Math.min(ev.w, ev.area / Math.max(1e-3, ev.h));
  const lat = dx * ev.nz - dz * ev.nx;
  // 🚨 UNDER IT, NOT BESIDE IT — condition 2. This was `effW/2 + body.radius + margin`, which
  // fired on a body whose SHOULDER clipped the rim; the centre is what has to be under the piece.
  if (Math.abs(lat) > Math.max(0, effW * 0.5 - T.inset)) return null;
  // a course shedding onto the skirting has nothing above your boots to land on you.
  if (!(ev.y + ev.h * 0.5 > body.y + T.floor)) return null;

  const kind = ev.y >= body.eyeY ? 'arm' : 'leg';
  // the body's own right, from `facing = atan2(dx, dz)`: forward is (sin f, 0, cos f) and
  // right is cross(forward, up) = (-cos f, 0, sin f).
  const rx = -Math.cos(body.facing), rz = Math.sin(body.facing);
  const off = (ev.x - body.x) * rx + (ev.z - body.z) * rz;
  // ⚠️ **THE DEAD-CENTRE TIE IS BROKEN EXPLICITLY, AND IT HAD TO BE.** A piece coming down
  // exactly over the body's centre line is equally the left arm's and the right's — but with
  // `facing = π` the trig residue in `sin(π)` (1.22e-16) decided it, so "dead centre" answered
  // LEFT for a reason that is a floating-point artefact and would flip on a different platform's
  // libm. Anything under a micrometre is a tie, and a tie takes the right.
  const side = (Math.abs(off) < 1e-6 ? 0 : off) >= 0 ? 'R' : 'L';
  return {
    socket: kind === 'arm' ? `shoulder${side}` : `hip${side}`,
    kind, side, effW, area: ev.area, out, lat,
  };
}

// ---------------------------------------------------------------------------
// LimbRig — one character's four sockets
// ---------------------------------------------------------------------------

export class LimbRig {
  /**
   * @param {object} o
   * @param {ReturnType<import('../characters/unit4h.js').buildUnit4H>} o.unit
   * @param {LimbField} o.field
   * @param {string} [o.id]
   */
  constructor(o) {
    this.unit = o.unit;
    this.field = o.field ?? null;
    this.id = o.id ?? uid('rig');
    this.height = o.unit.height;
    this.rng = o.rng ?? (() => 0.5);
    this._onChange = new Set();

    /** @type {Record<string,{type:'limb'|'gadget'|'empty', item:LimbItem|null}>} */
    this.sockets = {};
    for (const s of SOCKETS) {
      const limbId = SOCKET_LIMB[s];
      const root = o.unit.limbs[limbId];
      const item = new LimbItem({
        id: `${this.id}.${limbId}`, type: 'limb', socketKind: SOCKET_KIND[s],
        root, owner: this.id, height: this.height,
      });
      item.attachedTo = this;
      this.sockets[s] = { type: 'limb', item };
    }

    this.held = null;         // LimbItem in a fist
    this.heldHand = null;     // 'L' | 'R'
    this.skates = null;       // the fitted skates gadget, if any
    this.gadgetsFitted = {};  // socket -> gadget object from buildGadget

    this._swing = null;
    this._swingFired = null;
    this._caps = null;
  }

  onChange(fn) { this._onChange.add(fn); return () => this._onChange.delete(fn); }
  _changed(what) { this._caps = null; for (const fn of this._onChange) fn(this, what); }

  // ---- queries ------------------------------------------------------------

  occupant(socket) { return this.sockets[socket]?.type ?? 'empty'; }

  /**
   * 🎯 **EVERY EMPTY SOCKET THIS ITEM COULD GO IN, BEST FIRST — the answer to "where does a
   * part you found on the floor belong", asked of the rig instead of guessed by each caller.**
   *
   * John, playing with an arm knocked off by falling debris: *"when replacing an arm that fell
   * off from debris I kept replacing the arm with the nail gun and vise versa instead of putting
   * it in the open arm slot."* He had an EMPTY shoulder and a nail gun in the other one, and `E`
   * kept choosing the nail gun's socket — so the refit was a swap, the gun landed on the floor,
   * picking the gun back up swapped the arm out again, and the loop had no exit.
   *
   * **The rule, stated in one place: an empty socket of the right kind beats an occupied one,
   * every time.** A swap is only ever worth a press when there is nowhere free to put the thing;
   * in every other state fitting into a free socket is strictly better, because the player ends
   * up wearing BOTH parts instead of trading one for the other. `Player.interact()` is the
   * consequence and its header carries the trace.
   *
   * ⚠️ **THE SIDE PREFERENCE IS READ OFF THE PART, NOT INFERRED FROM ITS `id`.** `unit4h.js`
   * stamps every limb subtree with `userData.limb = { id, socket, kind }` at build time, so a
   * right arm still knows it is a right arm after it has been torn off, thrown across a room and
   * scavenged by somebody else — and a scavenged limb's `LimbItem.id` names the rig it came off,
   * not a socket, so parsing the id would answer for the wrong body. A gadget's root is a stub
   * group (`_armStub`) or a `pickup.<name>` holder and carries no such stamp, so gadgets take
   * the fixed order: they have no side and inventing one for them would be a lie.
   *
   * `SOCKETS` order is the tiebreak, so this is deterministic and consumes no rng draw.
   *
   * @param {LimbItem|null} item
   * @returns {string[]} empty sockets that would accept it, the part's own home socket first
   */
  emptyFits(item) {
    if (!item) return [];
    const fits = SOCKETS.filter((s) => this.sockets[s]?.type === 'empty'
      && SOCKET_KIND[s] === item.socketKind);
    const home = item.root?.userData?.limb?.socket ?? null;
    return (home && fits.includes(home)) ? [home, ...fits.filter((s) => s !== home)] : fits;
  }

  /** Wire-safe snapshot. Matches what `net/server.mjs` stores per player. */
  get state() {
    const out = {};
    for (const s of SOCKETS) {
      const c = this.sockets[s];
      out[s] = {
        type: c.type,
        gadget: c.type === 'gadget' ? c.item?.gadget ?? null : null,
        from: c.item?.owner ?? null,
      };
    }
    out.held = this.held ? this.held.label : null;
    out.skates = !!this.skates;
    return out;
  }

  countLimbs(kind) {
    let n = 0;
    for (const s of SOCKETS) if (SOCKET_KIND[s] === kind && this.sockets[s].type === 'limb') n++;
    return n;
  }

  /**
   * The consequences, in one place. Everything downstream — the gait, what you can carry,
   * what you can fire, whether you are still alive — reads this and nothing else.
   */
  get caps() {
    if (this._caps) return this._caps;
    const arms = this.countLimbs('arm');
    const legs = this.countLimbs('leg');
    const armGadgets = SOCKETS.filter((s) => SOCKET_KIND[s] === 'arm' && this.sockets[s].type === 'gadget');
    const hands = arms;
    const gait = gaitFor({ legs, arms, skates: !!this.skates });
    this._caps = {
      arms, legs, hands,
      freeHands: hands - (this.held ? 1 : 0),
      armGadgets: armGadgets.map((s) => this.sockets[s].item.gadget),
      gait,
      speedScale: speedScaleFor(gait),
      canRun: gait === 'walk',
      canClimb: legs >= 1 && arms >= 1,
      canCarry: hands - (this.held ? 1 : 0) > 0,
      skates: !!this.skates,
      downed: arms === 0 && legs === 0,
      // an empty socket is a wound; four of them is a corpse
      wounds: SOCKETS.filter((s) => this.sockets[s].type === 'empty').length,
    };
    return this._caps;
  }

  /**
   * Everything this body could attack with right now, best first.
   *
   * `held` is qualified by whether there is still a hand on the end of the arm holding it.
   * `detach()` now drops a held item when its own hand comes off, so this is a backstop —
   * but it is the query the HUD and the trigger both read, and it lied for thirty rounds, so
   * it states the invariant rather than assuming it.
   */
  /**
   * @param {string|null} [prefer]  socket the HUD cursor is on. Its gadget goes FIRST.
   *
   * ⚠️ WITHOUT `prefer` YOU CAN CARRY TWO GADGETS AND ONLY EVER FIRE ONE. `activeWeapon` is
   * `weapons()[0]`, and this list was in fixed SOCKET order — so once the world contained
   * gadgets to pick up (they did not exist at all until `spawnGadget`), a player who fitted a
   * ball alongside the starting nail gun kept firing the nail gun and had no control that
   * could change it. Found the moment world pickups landed: the ball fitted correctly, the
   * socket read `gadget`, and the trigger still said `nailgun`.
   *
   * Model C already has exactly one cursor for this — the rosette's targeted socket — so it
   * decides what FIRES as well as what you fit. One selection, one meaning, no weapon-swap
   * key to teach.
   */
  weapons(prefer = null) {
    const out = [];
    if (this.held && this.countLimbs('arm') > 0) out.push('limbClub');
    const pc = prefer ? this.sockets[prefer] : null;
    if (pc?.type === 'gadget' && pc.item?.gadget) out.push(pc.item.gadget);
    for (const s of SOCKETS) {
      if (s === prefer) continue;
      const c = this.sockets[s];
      if (c.type === 'gadget' && c.item.gadget) out.push(c.item.gadget);
    }
    if (this.caps.hands - (this.held ? 1 : 0) > 0) out.push('fist');
    return out;
  }

  /**
   * What a trigger pull actually uses. Honours `preferSocket` — set by the view from the
   * rosette's targeted socket — so aiming the cursor at an arm also selects its gadget.
   */
  get activeWeapon() { return this.weapons(this.preferSocket ?? null)[0] ?? null; }

  // ---- mutators -----------------------------------------------------------

  /**
   * DAMAGE. A hit does not subtract; it empties a socket. The occupant becomes a world
   * object with the impulse of whatever took it off.
   *
   * @returns {LimbItem|null} the thing that came off, now loose in the world
   */
  /**
   * @param {object} [opts]
   * @param {boolean} [opts.voluntary]  YOU took it off; nothing took it from you.
   *
   * ⚠️ The distinction is not cosmetic. Everything downstream — the HUD's red wound overlay,
   * the rosette punch, the "TORN OFF" callout, the camera shock, the body kick — subscribes
   * to `kind: 'detach'` and could not tell the two apart, so calmly unbolting your own nail
   * gun produced the identical trauma response as the hunter ripping your arm off.
   * `play-critic-4`: "voluntary eject and getting hit share identical HUD language/styling".
   * A game that screams the same way at a choice and at a catastrophe is teaching the player
   * to ignore the scream.
   */
  detach(socket, { impulse = null, spin = null, keepInHand = false, voluntary = false } = {}) {
    const c = this.sockets[socket];
    if (!c || c.type === 'empty') return null;
    const item = c.item;

    if (c.type === 'gadget') {
      // the gadget goes with the arm it was bolted to — a loose gadget limb is scavengeable
      const g = this.gadgetsFitted[socket];
      if (g) { item.gadgetObj = g; delete this.gadgetsFitted[socket]; }
    }

    // losing a leg rips the skates off with it — they are bolted to both ankles
    if (SOCKET_KIND[socket] === 'leg' && this.skates) this.removeSkates();

    // LOSING THE HAND LOSES WHAT IT WAS HOLDING.
    //
    // A held item is parented to `unit.joints.wrist{L|R}`, which lives inside the arm's own
    // subtree — so tearing that arm off used to carry the club away as an invisible passenger
    // of the dropped arm while `this.held` stayed set. That is where the HUD's lie came from:
    // after both arms were gone `caps.arms` read 0, `caps.hands` read 0, and `held` and
    // `activeWeapon` still said `limbClub`, so the readout claimed a weapon the body had no
    // way to use. Drop it here, into the world, where the player can go and pick it up again.
    if (this.held && SOCKET_KIND[socket] === 'arm'
      && this.heldHand === (socket === 'shoulderL' ? 'L' : 'R')) {
      this.dropHeld(impulse ? impulse.clone().multiplyScalar(0.65) : null);
    }

    // Lift the subtree out by hand rather than via unit.detach(limbId): once a scavenged
    // limb is fitted, unit.limbs still names the ORIGINAL group, so the id lookup would
    // detach the wrong thing. The socket's current occupant is the only truth.
    item.root.updateWorldMatrix(true, false);
    item.root.matrixWorld.decompose(item.root.position, item.root.quaternion, item.root.scale);
    item.root.removeFromParent();
    if (item.root.userData.limb) item.root.userData.limb.detached = true;

    // CRITICAL: unhook the joint map from the limb that just left.
    //
    // `unit.setPose()` walks `unit.joints` and writes a rotation into every entry,
    // defaulting to the rest pose. A detached limb's group is still in that map, so every
    // pose call was reaching out into the world and snapping the dropped limb bolt upright
    // again — legs stood on the floor like skittles and a limb held as a club had its grip
    // erased once a frame. Point the names at throwaway groups instead; `attach()` rebinds
    // them to whatever ends up in the socket next.
    detachJointNames(this.unit, socket);

    c.type = 'empty';
    c.item = null;
    item.attachedTo = null;

    if (keepInHand) {
      item.held = this;
    } else if (this.field) {
      this.field.drop(item, { impulse, spin });
    }
    this._changed({ kind: 'detach', socket, item, voluntary });
    return item;
  }

  /**
   * Refit a limb. Yours, or one you found on the floor — the rig does not care whose it
   * was, only that an arm goes in a shoulder and a leg goes in a hip. A right arm fitted
   * to a left shoulder is allowed and looks wrong on purpose.
   */
  attach(socket, item) {
    const c = this.sockets[socket];
    if (!c || c.type !== 'empty' || !item) return false;
    if (item.socketKind !== SOCKET_KIND[socket]) return false;

    // A gadget arm that fell on the floor still has its gun bolted to it — refitting it
    // must reuse that object, not build a second one and leak the first.
    if (item.type === 'gadget') {
      /**
       * 🐞 **A WORLD PICKUP IS CONSUMED WHEN IT GOES ON, AND UNTIL 2026-08-15 IT WAS NOT.**
       *
       * A gadget lying in a room carries the gadget's NAME and no built object (`spawnGadget`'s
       * header states that shape), so the real one is built on THIS body by `fitGadget` — and
       * the line below used to `return` its `ok` directly, one line above the `field.take()`
       * that every other acquisition path performs. Measured on the live game
       * (`_refit1-fitsettle-why.mjs`): loose **8 → 9**, the prop **still in the field and still
       * parented**, `nearest()` offering it again, and a second press past the 0.35 s
       * `Player._interactCd` leaving the player wearing **`nailgun,nailgun` from one pickup**.
       * It minted items out of nothing.
       *
       * ⚠️ **`ownedBuild` IS DISPOSED HERE AND THAT IS NOT AN OPTIMISATION.** `resetRound()`'s
       * sweep frees `ownedBuild` for everything still in `limbField.items`, so an item taken OUT
       * of the field is past the reach of the only thing that would have freed it. This is the
       * same three lines, for the same reason, that `Player.interact()`'s sledge and skates
       * branches already carry — and it is safe for exactly the reason stated there: nothing
       * reuses the world prop, because `fitGadget` built the body's own.
       *
       * ⚠️ **THE `!ok` PATH LEAVES THE ITEM ALONE.** `fitGadget` refuses an unknown gadget name
       * or a non-arm socket, and a pickup that was refused must still be lying where it was.
       */
      if (!item.gadgetObj) {
        if (!this.fitGadget(socket, item.gadget).ok) return false;
        if (this.field) this.field.take(item);
        item.root.removeFromParent();
        item.ownedBuild?.dispose?.(); item.ownedBuild = null;
        return true;
      }
      if (this.field) this.field.take(item);
      item.root.removeFromParent();
      this.unit.attach(socket, item.root);
      rebindLimbJoints(this.unit, socket, item.root);
      this.gadgetsFitted[socket] = item.gadgetObj;
      item.held = null;
      item.attachedTo = this;
      if (this.held === item) { this.held = null; this.heldHand = null; }
      c.type = 'gadget';
      c.item = item;
      this._changed({ kind: 'gadget', socket, gadget: item.gadget, displaced: null });
      return true;
    }

    if (this.field) this.field.take(item);
    item.root.removeFromParent();
    // heights can differ between bodies; normalise so a scavenged limb reads as fitted
    const k = this.height / (item.height || this.height);
    item.root.scale.setScalar(k);
    this.unit.attach(socket, item.root);
    item.root.scale.setScalar(k);   // unit.attach clears scale — reapply after
    item.held = null;
    item.attachedTo = this;
    if (this.held === item) { this.held = null; this.heldHand = null; }

    rebindLimbJoints(this.unit, socket, item.root);
    this._showLimbVisual(socket, true);
    c.type = 'limb';
    c.item = item;
    this._changed({ kind: 'attach', socket, item });
    return true;
  }

  /**
   * PUT THE BODY'S OWN PART BACK IN AN EMPTY SOCKET. The round reset's undo — and the only
   * one that works, because the obvious one does not.
   *
   * ⚠️ `detach()` SETS `sockets[s].item = null`. Anything trying to restore a lost limb by
   * reading `rig.sockets[s].item` back out is reading null and silently doing nothing, and
   * that is exactly what `game.js`'s `resetRound()` did for its whole life — a documented,
   * commented, believed-in reclaim block that could never fire once. It went unnoticed
   * because the failure is silent and R-restart is a real page reload, so the one path anyone
   * ever tested rebuilt the rig from scratch and looked correct.
   *
   * What survives a detach is the Object3D itself: `unit.limbs[limbId]` still points at the
   * group, whoever has since reparented it. So the reclaim is to take that group back, undo
   * what `detach` (and, if the hunter ate it, `absorb` + `_pullStep`) did to its transform,
   * and hand it to `attach()` as a fresh item — the same path a scavenged limb takes.
   *
   * @returns {boolean} false if the socket is occupied or the body never had that part
   */
  refit(socket) {
    const c = this.sockets[socket];
    if (!c || c.type !== 'empty') return false;
    const limbId = SOCKET_LIMB[socket];
    const root = this.unit.limbs[limbId];
    if (!root) return false;
    // `absorb()` parents it into the hunter and `_pullStep` shrinks it to 0.15 on its way in,
    // so a part reclaimed from a kill arrives detached, tiny and spun. Normalise all of it:
    // `attach()` sets scale from the height ratio and assumes it is starting from identity.
    root.removeFromParent();
    root.position.set(0, 0, 0);
    root.quaternion.identity();
    root.scale.setScalar(1);
    root.visible = true;
    if (root.userData.limb) root.userData.limb.detached = false;
    const item = new LimbItem({
      id: `${this.id}.${limbId}`, type: 'limb', socketKind: SOCKET_KIND[socket],
      root, owner: this.id, height: this.height,
    });
    return this.attach(socket, item);
  }

  /**
   * Fit a gadget limb. It goes in a SOCKET, so it costs you whatever was there — the arm
   * pops off and falls on the floor exactly as if you had been hit.
   *
   * @returns {{ok:boolean, displaced:LimbItem|null, gadget:object|null}}
   */
  fitGadget(socket, name, opts = {}) {
    if (!ARM_GADGETS.includes(name)) return { ok: false, displaced: null, gadget: null };
    if (SOCKET_KIND[socket] !== 'arm') return { ok: false, displaced: null, gadget: null };
    const c = this.sockets[socket];
    if (!c) return { ok: false, displaced: null, gadget: null };

    let displaced = null;
    if (c.type !== 'empty') displaced = this.detach(socket, opts.dropDisplaced === false ? { keepInHand: true } : {});

    const g = buildGadget(name, { height: this.height, materials: this.unit.materials, backdrop: 'world' });
    const side = socket.endsWith('L') ? 'L' : 'R';
    // the gadget bolts to the elbow and the forearm + hand are gone with it
    const elbow = this.unit.joints[`elbow${side}`] ?? this.unit.joints[`shoulder${side}`];
    // the socket is empty, so the whole arm subtree left with the limb: re-hang a stub
    const stub = this._armStub(side);
    this.unit.attach(socket, stub.root);
    rebindLimbJoints(this.unit, socket, stub.root);
    stub.mount.add(g.root);
    g.root.scale.setScalar(1.3);       // reference gadgets read chunkier than the forearm

    const item = new LimbItem({
      id: `${this.id}.${socket}.${name}`, type: 'gadget', socketKind: 'arm',
      gadget: name, root: stub.root, owner: this.id, height: this.height,
    });
    item.attachedTo = this;
    c.type = 'gadget';
    c.item = item;
    this.gadgetsFitted[socket] = g;
    this._changed({ kind: 'gadget', socket, gadget: name, displaced });
    return { ok: true, displaced, gadget: g };
  }

  /**
   * ROCKET SKATES. Not a socket occupant — `buildGadget('skates')` reports socket
   * `'shinBoth'` and mounts at ankle height on the robot's own legs, so it needs both
   * legs present. Fitting them changes the movement model outright (see player.js):
   * you carry momentum, you carve, and you cannot stop on the spot.
   */
  fitSkates() {
    if (this.skates) return false;
    if (this.countLimbs('leg') !== 2) return false;
    const g = buildGadget('skates', { height: this.height, materials: this.unit.materials, backdrop: 'world' });
    this.unit.root.add(g.root);
    this.skates = g;
    // the boots come off; the skates ARE the feet now
    for (const side of ['L', 'R']) hideJointMeshes(this.unit.joints[`ankle${side}`], false, true);
    this._changed({ kind: 'skates', on: true });
    return true;
  }

  removeSkates() {
    if (!this.skates) return false;
    this.skates.root.removeFromParent();
    this.skates.dispose?.();
    this.skates = null;
    for (const side of ['L', 'R']) hideJointMeshes(this.unit.joints[`ankle${side}`], true, true);
    this._changed({ kind: 'skates', on: false });
    return true;
  }

  // ---- carrying and clubbing ---------------------------------------------

  /**
   * Pick a loose limb up into a free fist. This is the whole inventory: you can hold one
   * thing, and holding it costs you the use of that hand.
   */
  pickUp(item) {
    if (!item || this.held) return false;
    const hand = this._freeHandSide();
    if (!hand) return false;
    if (this.field) this.field.take(item);
    item.root.removeFromParent();
    item.vel.set(0, 0, 0); item.spin.set(0, 0, 0); item.asleep = true;

    const wrist = this.unit.joints[`wrist${hand}`];
    if (!wrist) return false;
    wrist.add(item.root);
    // grip: the fist closes near the limb's own root, so the heavy end (a boot, a hand)
    // is out at the far end of the swing. That is the Dev Art read exactly.
    const H = this.height;
    item.root.position.set(0, -H * 0.052, H * 0.012);
    item.root.quaternion.setFromEuler(new THREE.Euler(-1.42, 0, 0.18));
    item.root.scale.setScalar(this.height / (item.height || this.height));
    item.held = this;
    item.attachedTo = null;
    this.held = item;
    this.heldHand = hand;
    this._changed({ kind: 'pickUp', item });
    return true;
  }

  dropHeld(impulse = null) {
    const item = this.held;
    if (!item) return null;
    this.held = null;
    this.heldHand = null;
    this._swing = null;
    if (this.field) this.field.drop(item, { impulse });
    this._changed({ kind: 'drop', item });
    return item;
  }

  /** Start a club swing. Returns false if there is nothing in your fist. */
  swing(t) {
    if (!this.held || this._swing) return false;
    this._swing = { t0: t, dur: 0.62, hand: this.heldHand };
    this._swingFired = false;
    return true;
  }

  /**
   * PUNCH — the attack you have when you have nothing but your own arms.
   *
   * There was no animation for this at all: `poseOverrides` only ever posed a HELD club, so
   * attacking with plain limbs changed nothing on screen and the primary button read as
   * broken. Reported from a real playthrough as "there is no attack animation for when you
   * have only normal limbs attached". `fist` is a real entry in `WEAPON_DAMAGE` (14) with its
   * own 0.55 s cooldown, so it was always meant to be a move.
   *
   * Alternates hands so repeated punches read as a combination rather than a twitch, and only
   * uses a side that still has a limb on it.
   */
  punch(t) {
    if (this._punch) return false;
    const sides = ['R', 'L'].filter((s) => this.sockets[`shoulder${s}`].type === 'limb');
    if (!sides.length) return false;
    const hand = sides.includes(this._lastPunch === 'R' ? 'L' : 'R')
      ? (this._lastPunch === 'R' ? 'L' : 'R') : sides[0];
    this._lastPunch = hand;
    this._punch = { t0: t, dur: 0.34, hand };
    return true;
  }

  get punching() { return !!this._punch; }

  get swinging() { return !!this._swing; }

  /**
   * Fires exactly once, at the moment of impact in the swing. Returns the world point and
   * direction of the club head so the weapon system can trace from it.
   */
  swingHit() {
    const s = this._swing;
    if (!s || this._swingFired) return null;
    const p = (this._swingPhase ?? 0);
    if (p < 0.42) return null;
    this._swingFired = true;
    const head = this.held?.root;
    if (!head) return null;
    head.updateWorldMatrix(true, false);
    const at = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
    const dir = new THREE.Vector3(0, -1, 0)
      .applyQuaternion(head.getWorldQuaternion(_q)).normalize();
    at.addScaledVector(dir, this.held.size.y * 0.5);
    return { at, dir, weapon: 'limbClub' };
  }

  // ---- per-frame ----------------------------------------------------------

  update(dt, t) {
    for (const g of Object.values(this.gadgetsFitted)) g.update?.(dt, t);
    this.skates?.update?.(dt, t);
    if (this._swing) {
      const p = (t - this._swing.t0) / this._swing.dur;
      this._swingPhase = p;
      if (p >= 1) { this._swing = null; this._swingPhase = 0; }
    }
    if (this._punch) {
      const p = (t - this._punch.t0) / this._punch.dur;
      this._punchPhase = p;
      if (p >= 1) { this._punch = null; this._punchPhase = 0; }
    }
  }

  fireGadget(socket, t) { this.gadgetsFitted[socket]?.fire?.(t); }
  fireWeapon(name, t) {
    for (const [s, g] of Object.entries(this.gadgetsFitted)) {
      if (this.sockets[s].item?.gadget === name) g.fire?.(t);
    }
  }

  /**
   * Pose contributions the limb state owns, merged OVER the gait's pose by the caller.
   * A club swing is an arm animation, not a gait, so it lives here; so does the carried
   * limb's rest pose, which has to hold the club clear of the body while you walk.
   */
  poseOverrides() {
    const out = {};
    // PUNCH first, so a club swing (which owns the same joints) always wins if both are live.
    if (this._punch) {
      const h = this._punch.hand;
      const p = Math.min(1, Math.max(0, this._punchPhase ?? 0));
      // fast out, slower back: a jab is not symmetrical. Peak extension at p = 0.38.
      const e = p < 0.38 ? (p / 0.38) ** 0.6 : 1 - ((p - 0.38) / 0.62) ** 1.35;
      const s = h === 'L' ? 1 : -1;
      // shoulder drives forward (negative x throws the arm ahead), elbow snaps straight
      out[`shoulder${h}`] = [-1.42 * e, 0.30 * s * (1 - e * 0.6), -0.18 * s * (1 - e)];
      out[`elbow${h}`] = [-1.30 + e * 1.24, 0, 0];
      // the body goes with it — shoulders rotate into the punch, hips brace the other way
      out.chest = [0.05 * e, -0.34 * s * e, 0];
      out.spine = [0.04 * e, -0.18 * s * e, 0];
      out.hips = [0, 0.12 * s * e, 0];
      // the other arm pulls back as the counterweight
      const other = h === 'L' ? 'R' : 'L';
      if (this.sockets[`shoulder${other}`].type === 'limb') {
        out[`shoulder${other}`] = [0.62 * e, 0, 0];
        out[`elbow${other}`] = [-0.70 - e * 0.55, 0, 0];
      }
      return out;
    }
    if (this.held) {
      const h = this.heldHand;
      const p = this._swing ? this._swingPhase : null;
      if (p == null) {
        // CARRIED, AND IT HAS TO LOOK HEAVY. This was a shouldered arm pose and nothing else,
        // so the club rode the body weightlessly — a severed limb is the heaviest thing this
        // robot will ever hold and the body should say so. The carrying shoulder drops and
        // rolls forward under the load, the spine and hips counter-list AWAY to keep the
        // centre of mass over the feet (which is what a person actually does with a heavy
        // object in one hand), and the free shoulder lifts a little as the counterweight.
        const s = h === 'L' ? 1 : -1;
        out[`shoulder${h}`] = [0.34, 0.24 * s, -0.30 * s];
        out[`elbow${h}`] = [-1.55, 0, 0];
        out.spine = [0.05, 0, 0.085 * s];        // list away from the weight
        out.hips = [0, 0, 0.05 * s];
        out.chest = [0.04, -0.06 * s, 0.05 * s]; // shoulder line tips toward the load
        const free = h === 'L' ? 'shoulderR' : 'shoulderL';
        out[free] = [-0.12, 0, -0.16 * s];       // free arm out as a counterweight
      } else {
        // wind up hard, snap through, follow through past the target and recover
        const w = swingCurve(p);
        // POSITIVE shoulder.x swings the arm BACK, so the wind-up is the large value and
        // the strike drives it down and forward through the target.
        out[`shoulder${h}`] = [2.15 - w * 2.95, (h === 'L' ? 0.34 : -0.34) * (1 - w * 0.8), (h === 'L' ? -0.42 : 0.42) * (1 - w)];
        out[`elbow${h}`] = [-1.60 + w * 1.28, 0, 0];
        // the whole body turns into it — a swing from the shoulder alone has no weight
        out.spine = [0.06 * w, (h === 'L' ? 0.42 : -0.42) * (w - 0.35), 0];
        out.chest = [0.05 * w, (h === 'L' ? 0.30 : -0.30) * (w - 0.35), 0];
      }
    }
    return out;
  }

  // ---- internals ----------------------------------------------------------

  _freeHandSide() {
    if (this.held) return null;
    for (const side of ['R', 'L']) {
      const s = side === 'L' ? 'shoulderL' : 'shoulderR';
      if (this.sockets[s].type === 'limb') return side;
    }
    return null;
  }

  _showLimbVisual(socket, on) {
    const side = socket.endsWith('L') ? 'L' : 'R';
    if (SOCKET_KIND[socket] === 'arm') {
      hideJointMeshes(this.unit.joints[`elbow${side}`], on, false);
      hideJointMeshes(this.unit.joints[`wrist${side}`], on, true);
    }
  }

  /**
   * A gadget arm still needs an upper arm and a shoulder cap to bolt to — otherwise
   * fitting a nail gun leaves a floating gun where the shoulder used to be. This clones
   * the shoulder end of the opposite arm when the socket is empty.
   */
  _armStub(side) {
    const other = side === 'L' ? 'R' : 'L';
    const src = this.unit.limbs[`arm${other}`] ?? this.unit.limbs[`arm${side}`];
    const root = new THREE.Group();
    root.name = `j.shoulder${side}.stub`;
    if (src) {
      for (const c of src.children) {
        if (c.isMesh) { const m = c.clone(); m.scale.x *= -1; flipMeshWinding(m); root.add(m); }
      }
    }
    const mount = new THREE.Group();
    mount.name = `j.elbow${side}.stub`;
    // the elbow sits one upper-arm length down the limb
    mount.position.y = -this.height * 0.145;
    root.add(mount);
    return { root, mount };
  }

  dispose() {
    for (const g of Object.values(this.gadgetsFitted)) g.dispose?.();
    this.skates?.dispose?.();
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Ease that reads as a swing: slow wind-up, violent middle, long follow-through. */
function swingCurve(p) {
  const x = Math.min(1, Math.max(0, p));
  if (x < 0.34) return (x / 0.34) ** 2 * 0.12;               // cock back
  if (x < 0.55) { const k = (x - 0.34) / 0.21; return 0.12 + k * k * (3 - 2 * k) * 0.95; }  // snap
  const k = (x - 0.55) / 0.45;
  return 1.07 - k * k * (3 - 2 * k) * 1.07;                   // follow through and recover
}

/**
 * Rebind the unit's joint map onto a newly attached subtree.
 *
 * `unit.joints.elbowL` points at the group that was on the body at build time. Fit
 * someone else's arm and posing would still drive the old, now-detached one — the new arm
 * would hang dead. Walk the attached subtree instead and remap by depth.
 */
export function rebindLimbJoints(unit, socket, group) {
  // ⚠️ EVERY CALLER RELIES ON THE `refreshPoseSkip()` AT THE END OF THIS FUNCTION.
  // `unit.attach()` rebuilds the pose-skip set, but it runs BEFORE this does, i.e. while
  // `joints.shoulderR` still points at the old parentless group. Without the refresh below
  // the refitted limb stays on the skip list and `setPose` never poses it again — the limb
  // is back on the body, correctly parented, and frozen in its rest pose forever.
  const side = socket.endsWith('L') ? 'L' : 'R';
  const kind = SOCKET_KIND[socket];
  const chain = [];
  (function walk(o) {
    for (const c of o.children) {
      if (c.isGroup && (c.name.startsWith('j.') || c.name.startsWith('socket.'))) { chain.push(c); walk(c); }
    }
  })(group);
  if (kind === 'arm') {
    unit.joints[`shoulder${side}`] = group;
    if (chain[0]) unit.joints[`elbow${side}`] = chain[0];
    if (chain[1]) unit.joints[`wrist${side}`] = chain[1];
  } else {
    unit.joints[`hip${side}`] = group;
    if (chain[0]) unit.joints[`knee${side}`] = chain[0];
    if (chain[1]) unit.joints[`ankle${side}`] = chain[1];
  }
  // The map has moved; the skip set was computed against the old one. See the note above.
  unit.refreshPoseSkip?.();
}

/**
 * Show/hide the geometry belonging to a joint.
 *
 * `buildUnit4H` collapses ~395 meshes into a handful by merging each joint's direct mesh
 * children, so `unit.parts.forearmL` is an orphan after construction and toggling its
 * `.visible` does nothing at all. The merged mesh living under `j.elbowL` is the real
 * forearm. Anything that wants to hide a limb segment has to go through the joint.
 */
export function hideJointMeshes(joint, visible, deep) {
  if (!joint) return;
  for (const c of joint.children) {
    if (c.isMesh) c.visible = visible;
    else if (deep && c.isGroup) hideJointMeshes(c, visible, true);
  }
}

/** Point a socket's joint names at empty groups, so posing cannot reach a detached limb. */
export function detachJointNames(unit, socket) {
  const side = socket.endsWith('L') ? 'L' : 'R';
  const names = SOCKET_KIND[socket] === 'arm'
    ? [`shoulder${side}`, `elbow${side}`, `wrist${side}`]
    : [`hip${side}`, `knee${side}`, `ankle${side}`];
  for (const n of names) unit.joints[n] = new THREE.Group();
}

/**
 * Bounding box of a subtree expressed in that subtree's OWN root frame — i.e. what the
 * object looks like independently of where it currently is in the world.
 */
export function localBox(root) {
  const out = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m = new THREE.Matrix4();
  const tmp = new THREE.Box3();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry || o.visible === false) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    m.multiplyMatrices(inv, o.matrixWorld);
    tmp.copy(o.geometry.boundingBox).applyMatrix4(m);
    out.union(tmp);
  });
  if (out.isEmpty()) out.set(new THREE.Vector3(-0.05, -0.4, -0.05), new THREE.Vector3(0.05, 0, 0.05));
  return out;
}

function flipMeshWinding(m) {
  const g = m.geometry = m.geometry.clone();
  const idx = g.index;
  if (!idx) return;
  const a = idx.array;
  for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 2]; a[i + 2] = t; }
  idx.needsUpdate = true;
}

export { SOCKETS, SOCKET_KIND, LIMB_SOCKET, SOCKET_LIMB, ARM_GADGETS, LEG_GADGETS };
