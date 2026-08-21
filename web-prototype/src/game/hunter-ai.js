import * as THREE from 'three';
import { buildHunter, HUNTER_STAGES } from '../characters/hunter.js';
import { Gait } from './locomotion.js';
import { HUNTER_SENSE, HUNTER_SPEED, hunterStageFor, hunterSightGain, WEAPON_DAMAGE, PASS_H } from './rules.js';

/**
 * THE HUNTER — pursue, search, lose track, kill, absorb, GROW.
 *
 * The escalation loop is the game: every part it takes off a player is a part it puts on
 * itself, and three parts in it becomes something bigger. That is why stage transitions
 * cannot be a silent mesh swap — the moment you see it get larger is the moment the round
 * changes character, so `_grow()` is an authored 1.4 second event: the old body convulses,
 * a burst of dust and rubble comes off it, its eye light flares, the new stage unfolds out
 * of a crushed scale, and the absorbed limb is visibly drawn into the shoulder first.
 *
 * STATES
 *   PATROL   sweeping the far hall, unaware, head scanning
 *   ALERT    something registered. It STOPS, turns toward it, and its eye lights. It is not
 *            coming yet — this is the beat the player is meant to notice, and before it
 *            existed the hunter went from unaware to full speed in a single frame.
 *   STALK    committed to the direction but not to you; closes at about half speed
 *   PURSUE   certain; runs it down
 *   SEARCH   lost contact; sweeps outward from the last known point, then gives up
 *   BREACH   the thing it wants is behind a wall it is allowed to break — so it breaks it.
 *            This is the AI driving the destruction system, and it is the reason the level
 *            topology is not fixed: the hunter makes its own doors.
 *   HUNT     it heard WORK in a room it cannot walk into, and it is walking to a specific
 *            chained door of that room. See `_summon`.
 *   BANG     it is at that door, hitting it. John's timer, and it is emergent rather than
 *            counted: the door's own health decides how long. See `_bang`.
 *   ATTACK   in reach; takes a limb
 *   GROW     the transition; it does not move or think while it happens
 *
 * PATROL -> ALERT -> STALK -> PURSUE is driven by ONE number, `awareness` (0..1), and the
 * three thresholds in `HUNTER_SENSE`. Sight fills it fast and close range faster; sound fills
 * it slowly and CANNOT fill it past `soundCeiling`, so a noise brings the hunter into your
 * half of the house and a sighting is what makes it run. That asymmetry is the stealth game.
 *
 * Sight fills it at TWO rates — flat to `alertAt` (noticing), inverse-square in distance above
 * it (confirming) — which is what makes a long sightline worth having. `hunterSightGain` in
 * `rules.js` owns the curve and the argument for it.
 *
 * All three stage rigs are built up front and only one is ever visible. Building a robot
 * mid-round is a 30 ms hitch at the exact moment the player most needs the frame rate.
 */

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

// ---- stagger economy. See `stagger()`.
const STUN_BREAK = 190;      // accrued stun that breaks the attack and shoves it back
const STUN_MAX = 235;        // hard ceiling, so a fast weapon cannot bank stun for later
const STUN_DECAY = 55;       // per second
const BREAK_LOCK = 3.4;      // seconds after a break during which another cannot happen
const BREAK_LOCK_STEP = 1.6; // ...plus this much per consecutive break in the same chain
const BREAK_LOCK_MAX = 9.0;
const RESIST_PER_BREAK = 0.34;
const RESIST_MAX = 0.86;
const RESIST_RECOVER = 0.10; // per second

// ---- the strike clock. See `_attack()`.
//
// ⚠️ THESE ARE THREE SEPARATE NUMBERS BECAUSE THE CODE USED TO HAVE ONE, AND IT WAS A COIN
// FLIP. `_attack`, `_breach` and `stagger` all counted down a single `this._swing`, nothing
// reset it with the round, and `_attack` opened with `this._swing = (this._swing ?? 0) - dt;
// if (this._swing > 0) return;`. So the delay before the FIRST strike of an encounter was
// whatever residue some earlier, unrelated event had left in that field:
//
//   · never attacked yet (a fresh round)  -> `undefined` -> `-dt` -> IT STRUCK ON THE FRAME
//     IT ENTERED ATTACK. No windup, no anticipation pose, no reaction window. That is the
//     critic's "unavoidable kill in 300 ms with zero player displacement", exactly.
//   · struck 0.1 s ago in a previous encounter -> 2.25 s of free time.
//   · slammed a wall on the way in           -> up to 0.85 s.
//   · broke off a stagger                    -> 1.6 s.
//
// Four staged trials from an IDENTICAL 5 m PURSUE start therefore ranged from a clean escape
// to instant dismemberment, and none of the difference was anything the player did or could
// see. The fix is not a bigger number, it is OWNERSHIP: ATTACK now has its own timer, set on
// ENTRY, and `_swing` belongs to BREACH alone.
/** The rear-back before the first strike of an encounter — the player's reaction window. */
const ATTACK_WINDUP = 0.85;
/** Between strikes once it has you. Slow enough that losing a limb is a readable event. */
const ATTACK_CADENCE = 2.35;
/**
 * Out of reach for longer than this and the next strike starts a FRESH windup. Shorter than
 * that and the windup resumes where it left off — without this grace, standing exactly on the
 * reach boundary flickers ATTACK/PURSUE every frame, restarts the windup every frame, and the
 * hunter can never land a hit at all. A stutter-step exploit is not a reaction window.
 */
const ATTACK_REGRIP = 0.45;

// ---- THE COMMIT TELL. See `_commitStep()`.
//
// ⚠️ WHY THIS EXISTS, MEASURED RATHER THAN ARGUED. `harness/scenarios/flee-survival.mjs`
// establishes that running away WORKS: staged 7 m apart in PURSUE, a player who sprints away
// keeps every limb and ends 7.2 m clear, and one who sprints on the REAR-BACK — already inside
// reach at 2.0 m — also keeps every limb. Standing still in the same staging costs three limbs
// in 8.1 s. The encounter is decided by what the player does.
//
// But `harness/scenarios/commit-tell.mjs` then photographed the frame either side of
// `commitAt` and measured the difference at **1.1x the noise floor of the room's own breathing
// lights, over 1.28% of pixels against the floor's 1.79%.** Every channel the game had was a
// CONTINUOUS function of `awareness` — the faceplate emissive, the eye light, the HUD threat
// vignette — so "it is thinking about it" and "it is coming for you" photographed the same.
// There was no moment, so there was nothing to react to, and standing still (which is what
// play-critic-4 did) was the reasonable move.
//
// So the commit is now an EVENT: a one-shot latch, a hard punch on the eye and the eye light,
// and an `onCommit` hook the view hangs the HUD alarm off. Nothing about lethality changes —
// no sense number, no windup, no cadence, no speed.
/** Seconds the commit punch takes to decay. A punch, not a ramp: it must read as an instant. */
const COMMIT_FLASH = 0.55;
/** Extra faceplate drive at the peak of the punch, on top of the normal 0..1 awareness ramp. */
const COMMIT_EYE = 1.7;
/** Extra eye-light intensity at the peak. The light is already in the scene by STALK. */
const COMMIT_FLARE = 17;

// ---- 🚪 THE DOOR WORK — HUNT and BANG. See `_summon()`, `_hunt()` and `_bang()`.
//
// John, 2026-08-10, answering his own question about how the hunter gets into a sealed room:
//   *"the chained doors are a way the hunter can enter the room prior to the player opening the
//   interconnect … the hunter is much stronger and bangs away at the doors to scare the players
//   and eventually break its way in. If the players don't move out of the room this can be the
//   timer."*
//
// ⚠️ **THIS IS NOT A COUNTDOWN AND MUST NEVER BECOME ONE.** The timer is emergent: a creature
// with a position hears a noise, walks the graph, arrives at a specific door and works on it, and
// the wall's own health decides how long that takes. Nothing here counts seconds toward an event.
// The two consequences that fall out of that, and both are the point:
//   · **it can be beaten by moving**, because the hunter is walking to where you WERE, and
//   · **it can be watched**, because every blow is a place in the room, not a number on a HUD.
//
/**
 * Seconds between blows on a door. **This is the whole of the pacing knob** — the damage is
 * `WEAPON_DAMAGE.hunterSlam` and the door's health is `STAGE_DEFS` (255 hp over four stages), so
 * a breachable door takes SIX blows whatever this is. At 2.4 s that is ~14 s of banging from the
 * first hit to the way in, on top of the walk. Deliberately much slower than `_breach`'s 0.85 s:
 * `_breach` is the hunter removing an obstacle mid-chase and wants to be over quickly; this is
 * the thing the player is supposed to sit and listen to.
 */
const BANG_CADENCE = 2.4;
/** The pause after arriving, before the first blow. A beat of silence at the door is the tell. */
const BANG_WINDUP = 0.9;
/**
 * Seconds it will spend trying to REACH a door before giving up and searching normally. Without
 * it a door the steering cannot reach (a route that opened and closed, a body wedged on a pier)
 * is a hunter that walks at a wall for the rest of the round — this file's most expensive
 * documented failure class, and the reason `_tooNarrowPanel` exists at all.
 */
const HUNT_GIVE_UP = 26;
/**
 * A noise has to be at least this loud to make it cross the house for a door. Below it the old
 * behaviour stands: it looks up, it searches locally, it forgets. `spaces.js` `BREACH_NOISE.panel`
 * is 1.25 and a walking robot is 0.49, so this admits WORK — a hammer into a wall — and refuses
 * footsteps, which is `dig.md`'s whole bargain: the act that gets you out is the act that brings
 * it. In `HUNTER_SENSE`'s units, where 1.0 is a gunshot at 14 m.
 */
const SUMMON_LOUDNESS = 0.95;

export class HunterAI {
  constructor(o = {}) {
    this.room = o.room;
    this.scene = o.scene;
    this.rng = o.rng ?? (() => 0.5);
    this.debris = o.debris ?? null;
    this.dust = o.dust ?? null;
    this.weapons = o.weapons ?? null;

    this.stage = o.stage ?? 1;
    this.absorbed = 0;
    this.state = 'PATROL';
    this.target = null;             // { root, rig, height } — a body, as the weapon system sees it
    this.lastKnown = new THREE.Vector3();
    this.contact = 0;               // seconds since it last actually saw the target
    this.searchTimer = 0;
    this.growT = 0;

    // ---- perception
    this.awareness = 0;             // 0..1 — the whole PATROL/ALERT/STALK/PURSUE ladder
    this.sawThisFrame = false;
    this.heardThisFrame = false;
    this.scan = 0;                  // head yaw offset, radians, so its sightlines sweep
    this._scanT = this.rng() * 9;
    this.nearestD = Infinity;       // to any candidate, for the HUD's threat channel

    // ---- stagger economy
    this.stun = 0;
    this.stunResist = 0;
    this._breakLock = 0;
    this._breakChain = 0;

    // ---- the strike clock. `_wind` is ATTACK's and only ATTACK's; `_swing` is BREACH's.
    // `_atkGap` is seconds since the last ATTACK frame, which is how `_attack` tells a new
    // encounter from a continuing one. Infinity, not 0, so the very first one winds up.
    this._wind = null;
    this._swing = 0;
    this._atkGap = Infinity;

    // ---- the commit tell. `_committed` is a LATCH, not a state test: PURSUE is entered and
    // left many times in a chase and the player needs the announcement once, at the top.
    this._committed = false;
    this._commitFlash = 0;

    this.root = new THREE.Group();
    this.root.name = 'hunter';
    this.root.position.copy(o.position ?? new THREE.Vector3());
    this.model = new THREE.Group();
    this.root.add(this.model);
    o.scene?.add(this.root);

    /*
     * ONE RIG PER STAGE, BUILT NOW AND SWAPPED BY VISIBILITY — a growth has to be a cut, not a
     * load, because it happens with the player in the room watching it.
     *
     * 🤖 `o.rigs` IS THE GENERATED HUNTER (`src/characters/mesh-hunter.js`, `?meshhunter=1`).
     * It arrives already built because loading a GLB is async and this constructor is not; the
     * view awaits it and hands it over. Everything below this line is the same either way: the
     * grow transition, the absorb pull and the eye drive all work on `rigs[s].root` and on a
     * material called `hunter.faceplate`, and the generated stages present both.
     *
     * The one real difference is WHO POSES THE BODY. The procedural rig is posed joint by joint
     * by `Gait` plus the authored hunch; the generated one is driven by baked clips and owns its
     * own pose. So a generated stage gets no `Gait` at all — see `_animate`, which branches on
     * exactly that — and `mesh-hunter.js` publishes a `setPose()` that does nothing, so a stray
     * call from anywhere else cannot half-pose a clip-driven body.
     */
    this.meshRigs = !!o.rigs;
    this.rigs = {};
    this.gaits = {};
    for (const s of [1, 2, 3]) {
      const h = o.rigs?.[s] ?? buildHunter({ stage: s });
      h.root.visible = s === this.stage;
      this.model.add(h.root);
      this.rigs[s] = h;
      this.gaits[s] = h.unit ? new Gait(h.unit) : null;
    }

    // the eye flare: one small light, so a transition is an event you see from across the
    // room even when the hunter itself is in shadow
    this.flare = new THREE.PointLight(0xff3a24, 0, 9, 2);
    this.flare.position.y = this.height * 0.86;
    // NOT in the scene by default: a PointLight at zero intensity still costs a full
    // iteration of the lighting loop on every lit fragment in the room.
    this._flareOn = false;

    this.vel = new THREE.Vector3();
    this.facing = o.yaw ?? 0;
    this.speed = 0;
    this.radius = 0.42;
    this.onStage = null;            // (from,to) — the view hangs sound/shake off this
    this.onKill = null;
    /** (fromState, hunter) — fired ONCE the frame it stops considering and starts coming. */
    this.onCommit = null;

    // ---- 🚪 the door work. See `_summon`.
    /**
     * The `NoiseBus` (`src/game/noise.js`), or null. **Polled, not pushed**, because the AI has to
     * be able to ignore what it hears — it is deaf to a noise while it is already committed, and
     * deaf to its own door work always — and a push listener would have to re-implement both.
     */
    this.noise = o.noise ?? null;
    this._noiseSeq = 0;
    /**
     * `'auto'` (shipped): it works on a door only when there is NO open route into the noise room
     * that this body fits through — i.e. the door genuinely is the way in. An AI that stands
     * hammering a door with an open doorway six metres away is the "forgot what it was doing"
     * failure this file keeps naming.
     * `'always'`: it prefers the door whenever one exists. The demo and the gate arm — see
     * `harness/scenarios/bang-door.mjs` and `?bang=always`.
     * `'off'`: ablated. The hunter behaves exactly as it did before this mechanic existed.
     */
    this.bangPolicy = o.bangPolicy ?? 'auto';
    /** The door record from `room.chainedDoorsOf()` it is walking to / working on. */
    this.door = null;
    this.huntTimer = 0;
    this._bangT = 0;
    this._bangIdx = 0;
    /** (door, hunter) — it has chosen a door and started walking. The HUD's "which door" hook. */
    this.onDoor = null;
    /** ({ door, panel, at, index, progress, through, hunter }) — ONE blow. Audio hangs off this. */
    this.onBang = null;
  }

  get rig() { return this.rigs[this.stage]; }
  /** Has it stopped considering and started coming? The HUD's chase channel reads this. */
  get committed() { return this._committed; }
  get height() { return 1.7 * (HUNTER_STAGES[this.stage]?.scale ?? 1); }
  get eye() { return _v.copy(this.root.position).setY(this.root.position.y + this.height * 0.80).clone(); }
  /** The shape the weapon system traces against. */
  get body() { return { root: this.root, rig: null, height: this.height, radius: this.radius, hunter: this }; }

  setTargets(list) { this.candidates = list; }

  /**
   * A NOISE THAT IS NOT A BODY — the decoy verb.
   *
   * Everything the hunter hears today is a candidate: hearing is a property of a thing it can
   * also chase and dismember. So the player has no way to make a sound SOMEWHERE ELSE, which
   * means the entire stealth half of the game — distract, then move — cannot be expressed.
   * `rules.js` already says what the ball is for ("bouncy balls barely scratch a wall; they
   * are for reaching things") at 9 damage, so it was always meant to be this.
   *
   * Deliberately does NOT set `target`. A target is something `_attack` will try to take a
   * limb from, and a thrown ball has no rig — it would either crash or teach the hunter to
   * maul scenery. Investigating a point it cannot find anything at is exactly what a decoy
   * should produce: it commits, it arrives, and you are not there.
   *
   * Ignored while already committed (PURSUE/ATTACK/GROW): once it has seen you, a noise
   * across the room does not un-see you, and a decoy that cancels an active chase would be a
   * get-out-of-jail button rather than a plan.
   *
   * @param {THREE.Vector3} pos   where the sound happened
   * @param {number} strength     0..1, as `Player.noise` — 1.0 is a gunshot
   * @returns {boolean} whether it was heard
   */
  hearNoise(pos, strength = 1) {
    if (this.state === 'PURSUE' || this.state === 'ATTACK' || this.state === 'GROW') return false;
    const S = HUNTER_SENSE;
    const d = this.root.position.distanceTo(pos);
    if (!(strength > S.hearFloor) || d > S.hearRange * strength) return false;
    this.lastKnown.copy(pos);
    // 🚪 LOUD ENOUGH TO BE WORK, AND IN A ROOM IT CANNOT WALK INTO? Then the way in is a door,
    // and going to that door replaces the local sweep below. `_summon` says whether it took it.
    if (strength >= SUMMON_LOUDNESS && this._summon(pos)) {
      this.awareness = Math.min(S.soundCeiling, Math.max(this.awareness, S.alertAt));
      return true;
    }
    this.searchTimer = S.searchFor;
    this.state = 'SEARCH';
    // A sound raises alertness but must never on its own commit — same ceiling real hearing
    // obeys, so "sound gets it looking, only sight sends it running" stays true of decoys too.
    this.awareness = Math.min(S.soundCeiling, Math.max(this.awareness, S.alertAt));
    return true;
  }

  /**
   * 🚪 **WHAT WAS THE LOUDEST RECENT NOISE, AND WHERE — asked once a frame.**
   *
   * ⚠️ **DEAF TO ITS OWN DOOR WORK.** `views/game.js` emits a `door` noise on every blow this
   * thing lands (that is how a player in the next room hears it), and `hearNoise` does NOT refuse
   * during BANG. Without the filter the hunter would hear its own hammer, set `lastKnown` to the
   * door it is standing at, and re-summon itself every 2.4 s. `onBreak`'s own `hunterSlam` guard
   * exists for exactly this reason and got it wrong once already; this is the same trap through
   * the other door.
   */
  _noiseStep() {
    const bus = this.noise;
    if (!bus) return;
    // `sinceSeq` rather than "is this the one I saw last time" — see `NoiseBus.loudest`. Asking
    // the second way means a quieter noise emitted BEHIND a louder one is never delivered, only
    // masked, and the hunter would go deaf to everything under whatever it heard most recently.
    const ev = bus.loudest({ ignoreKind: 'door', sinceSeq: this._noiseSeq });
    if (!ev) return;
    this._noiseSeq = ev.seq;
    _v.set(ev.x, ev.y, ev.z);
    this.hearNoise(_v, ev.heard);
  }

  /**
   * 🚪 **THE DOOR IT COMES TO — chosen once, on the frame it hears you, and never re-rolled.**
   *
   * The mechanic is only a mechanic if the banging comes from ONE identifiable door. So the
   * choice happens here, at the summons, and `_hunt`/`_bang` never reconsider: a hunter that
   * re-picked every frame would drift between two doors of the same room as it walked, and the
   * player would hear a countdown coming from nowhere in particular.
   *
   * ⚠️ **`auto` REFUSES WHEN AN OPEN ROUTE EXISTS, AND ON TODAY'S FLOOR PLAN THAT IS MOST OF THE
   * HOUSE.** Every space except the chapel has an open doorway (D1/D4/D5/D6), so a hunter that
   * hears a dig in a study walks in through the door like a sane creature and never bangs. The
   * chapel is the one room whose only way in is a shut door (`p.chapel`, since D7 was removed), so
   * it is the one room where the shipped rule fires today. That is a FLOOR-PLAN fact, not a
   * tuning one: the mechanic is built for the sealed-room dig loop, and `?bang=always` is how it
   * is seen and gated before that loop exists.
   *
   * Nearest to the HUNTER, not to the noise: it is the one that has to walk there, and a
   * deterministic tie-break on id keeps two equidistant doors from depending on table order.
   */
  _summon(pos) {
    if (this.bangPolicy === 'off' || !this.room?.chainedDoorsOf) return false;
    if (this.state === 'BANG' || this.state === 'HUNT') return false;   // already on a door
    const there = this.room.spaceAt?.(pos);
    if (!there) return false;
    const here = this.room.spaceAt?.(this.root.position);
    if (!here || here.id === there.id) return false;    // it is already in the room with you
    if (this.bangPolicy !== 'always') {
      // Can it simply WALK in? `_waypoint` asks the same two filters, so an accepted route here
      // is a route the steering will actually take.
      const need = this.radius * 2 + 0.12;
      if (this.room.pathPortals(here.id, there.id, need, PASS_H.hunter).length) return false;
    }
    let best = null, bestD = Infinity;
    for (const d of this.room.chainedDoorsOf(there.id)) {
      const dd = Math.hypot(d.centre.x - this.root.position.x, d.centre.z - this.root.position.z);
      if (dd < bestD - 1e-6 || (Math.abs(dd - bestD) <= 1e-6 && best && d.id < best.id)) {
        bestD = dd; best = d;
      }
    }
    if (!best) return false;
    this.door = best;
    this.huntTimer = HUNT_GIVE_UP;
    this.state = 'HUNT';
    this.onDoor?.(best, this);
    return true;
  }

  /** Drop the door and whatever was being done to it. Every exit from HUNT/BANG goes through here. */
  _clearDoor() { this.door = null; this.huntTimer = 0; this._bangT = 0; this._bangIdx = 0; }

  /**
   * 0..1 — **how close this door is to giving way**, read off the wall itself rather than off a
   * blow counter. `WallState` exposes the stage and the health left in it, so this is the real
   * remaining material and it is what the escalating bang is driven by: the sound the player
   * hears IS how far through the thing is, not a proxy for it.
   */
  static doorProgress(p) {
    const st = p?.state;
    if (!st?.defs?.length) return 0;
    const last = st.defs.length - 1;
    if (st.stage >= last) return 1;
    const h = st.defs[st.stage]?.health || 1;
    const within = Math.max(0, Math.min(1, 1 - (st.stageHealth ?? h) / h));
    return Math.max(0, Math.min(1, (st.stage + within) / last));
  }

  /**
   * 🚪 HUNT — walking to the door it chose. Not a chase: it is going to a PLACE.
   *
   * Routed through `_waypoint` off the door's `stand` point, which `room.chainedDoorsOf` puts one
   * standoff OUTSIDE the room on the side the hunter has to work from. Aiming at the panel's own
   * centre instead would aim at a point in the wall band where `spaceAt` returns null, and
   * `_waypoint`'s BFS would be handed a null space and walk it into the wall.
   */
  _hunt(dt) {
    const d = this.door;
    const p = d?.panel;
    if (!p || !p.state.isDamageable() || !p.blocksMovement()) { this._giveUpDoor(); return; }
    this.huntTimer -= dt;
    if (this.huntTimer <= 0) { this._giveUpDoor(); return; }
    const gap = Math.hypot(d.stand.x - this.root.position.x, d.stand.z - this.root.position.z);
    if (gap <= HUNTER_SENSE.reach * 0.9) {
      this.state = 'BANG';
      this._bangT = BANG_WINDUP;
      this._bangIdx = 0;
      return;
    }
    this._steerTo(this._waypoint(d.stand), dt, HUNTER_SPEED[this.stage] * 0.66);
  }

  _giveUpDoor() {
    this._clearDoor();
    this.state = 'SEARCH';
    this.searchTimer = HUNTER_SENSE.searchFor;
  }

  /**
   * 🚪 BANG — it is at the door and it is working on it. **The beat this whole slice exists for.**
   *
   * Every blow goes through the SAME damage entry point `_breach` uses, so the door's health, its
   * stage crossings, its debris, its `onBreak` sound and its network sync are all the ones that
   * already shipped. What is new is only the cadence, the facing, and `onBang` — which is how the
   * view gets an escalating, locatable sound out of it.
   *
   * ⚠️ **THE PUFF IS THE IN-WORLD HALF OF "WHICH DOOR", AND IT COSTS NOTHING.** A HUD line alone
   * makes the mechanic a thing you read. `dust`/`debris` are one `InstancedMesh` per KIND and both
   * kinds are already on screen during a dig, so this adds ZERO draw calls (HANDOFF: *"a draw
   * call's unit is the MESH"*). It is emitted at the panel centre — inside the wall band — so it
   * blooms on BOTH faces and the player in the sealed room sees the door itself jump.
   */
  _bang(dt) {
    const d = this.door;
    const p = d?.panel;
    if (!p || !p.state.isDamageable()) { this._giveUpDoor(); return; }
    this.vel.multiplyScalar(Math.exp(-9 * dt));
    this._faceToward(p.root.position, dt, 4.0);

    this._bangT -= dt;
    if (this._bangT <= 0) {
      this._bangT = BANG_CADENCE;
      const hit = p.hitPoint(this.root.position, this.rng, _v2).clone();
      const dir = p.normal.multiplyScalar(-p.sideOf(this.root.position));
      if (this.weapons) this.weapons.hitWall(p, hit, dir, 'hunterSlam');
      else p.damage(WEAPON_DAMAGE.hunterSlam, { point: hit.toArray() });
      this._bangIdx++;
      const progress = HunterAI.doorProgress(p);
      const through = !p.blocksMovement();
      // ⚠️ `.clone()`, not the module scratch vector: `_breach` above does the same and for the
      // same reason — these systems keep the point they are handed, and a scratch vector that the
      // next frame overwrites would drag a settling dust cloud around the house behind the hunter.
      this.dust?.burst(p.root.position.clone().setY(this.height * 0.5),
        14 + Math.round(progress * 14), { radius: 0.9 + progress * 0.8 });
      if (progress > 0.25) {
        this.debris?.burst('plaster', p.root.position.clone().setY(this.height * 0.45),
          4 + Math.round(progress * 10), { speed: 2.6 + progress * 2.4, spread: 0.7 });
      }
      this.onBang?.({ door: d, panel: p, at: hit, index: this._bangIdx, progress, through, hunter: this });
    }

    if (!p.blocksMovement()) {
      // THROUGH. The door is now a route, and `pathPortals` already knows it — the panel's own
      // stage change cleared the BFS cache. It goes back to hunting normally, from inside.
      this._clearDoor();
      this.state = this.target ? 'PURSUE' : 'SEARCH';
      if (this.state === 'SEARCH') this.searchTimer = HUNTER_SENSE.searchFor;
    }
  }

  /**
   * Put the FIGHT back to its opening state. Perception and the route are the view's to reset
   * (it owns the spawn); these four are the ones that are invisible from outside and were
   * therefore the ones that survived a round boundary and made the next round a different
   * game. A hunter that reset its position but kept a 2.1 s strike timer opened the round
   * unable to hit, and one that kept a stun-resist opened it unstaggerable.
   */
  resetCombat() {
    this._wind = null;
    this._swing = 0;
    this._atkGap = Infinity;
    // ...and the commit latch. A round that opened with it still armed would never announce
    // the first commitment of the new round, which is the one the player most needs.
    this._committed = false;
    this._commitFlash = 0;
    this.stun = 0;
    this.stunResist = 0;
    this._breakLock = 0;
    this._breakChain = 0;
    // 🚪 ...and the door. A round that opened still holding last round's door would walk the
    // hunter across a freshly-reset house to hammer a panel that `resetRound` has already healed.
    this._clearDoor();
    this._noiseSeq = 0;
  }

  /**
   * Compile every stage's shaders NOW, at load, instead of on the frame it grows.
   *
   * `renderer.compile()` walks the scene with `traverseVisible`, and stages 2 and 3 are built
   * hidden — the whole reason they are built up front is that building a robot mid-round is a
   * hitch, and then their PROGRAMS were being compiled mid-round instead. Measured on a
   * capture run: a 2498 ms worst frame, at the exact moment the hunter grows, which is the
   * moment the round changes character and the frame rate matters most.
   *
   * It compiles twice, once with the eye light in the scene and once without, because the
   * point-light count is part of three.js's program cache key: compiling only the unlit
   * variant means the whole scene recompiles the first time the hunter reaches STALK.
   */
  precompileStages(engine) {
    const was = {};
    for (const s of [1, 2, 3]) { was[s] = this.rigs[s].root.visible; this.rigs[s].root.visible = true; }
    const flareWas = this._flareOn;
    if (!flareWas) { this.root.add(this.flare); this._flareOn = true; }
    engine.renderer.compile(engine.scene, engine.camera);
    this.flare.removeFromParent(); this._flareOn = false;
    engine.renderer.compile(engine.scene, engine.camera);
    if (flareWas) { this.root.add(this.flare); this._flareOn = true; }
    for (const s of [1, 2, 3]) this.rigs[s].root.visible = was[s];
  }

  update(dt, t) {
    this._lastDt = dt;
    if (this.state === 'GROW') { this._growStep(dt, t); return; }

    this._scanStep(dt);
    // 🚪 BEFORE `_sense`, so a noise heard this frame can still be overridden by SEEING you on
    // the same frame — `_arbitrate` runs inside `_sense` and outranks any door.
    this._noiseStep();
    const wasState = this.state;
    const tgt = this._sense(dt);
    this._commitStep(dt, wasState);

    // AFTER `_sense`, because `_arbitrate` may have just entered ATTACK on this very frame and
    // the entry frame must read a gap of 0, not of dt. This is the only thing that tells
    // `_attack` whether it is opening an encounter or continuing one. See `_attack`.
    if (this.state !== 'ATTACK') this._atkGap += dt;

    switch (this.state) {
      case 'PATROL': this._patrol(dt, t); break;
      case 'ALERT': this._alert(dt, t); break;
      case 'STALK': this._stalk(dt, t); break;
      case 'PURSUE': this._pursue(dt, t, tgt); break;
      case 'BREACH': this._breach(dt, t); break;
      case 'HUNT': this._hunt(dt); break;
      case 'BANG': this._bang(dt); break;
      case 'SEARCH': this._search(dt, t); break;
      case 'ATTACK': this._attack(dt, t); break;
    }

    this._integrate(dt);
    this._animate(dt, t);
  }

  // ---- senses -------------------------------------------------------------

  /**
   * The head sweeps across the direction of travel. Without this the sight cone points
   * wherever the body happens to be walking, and measurement showed that is almost never at
   * the player: over an entire approach the facing-to-target dot product sat at 0.11–0.16
   * against a 0.498 threshold, so the 60-degree cone rejected every single frame and the
   * hunter's "26 m sight" was decided by whether its patrol curve happened to swing its nose
   * down the hall. A sweep is also the readable version — you can watch it look.
   *
   * It does not scan while pursuing or attacking: at that point it is looking at you.
   */
  _scanStep(dt) {
    const busy = this.state === 'PURSUE' || this.state === 'ATTACK' || this.state === 'BREACH'
      || this.state === 'BANG';
    const want = busy ? 0 : Math.sin(this._scanT * 0.62) * 0.92 + Math.sin(this._scanT * 0.23) * 0.34;
    if (!busy) this._scanT += dt;
    this.scan += (want - this.scan) * (1 - Math.exp(-3.2 * dt));
  }

  _sense(dt) {
    const eye = this.eye;
    const S = HUNTER_SENSE;
    let seen = null, seenD = Infinity;
    let heard = null, heardD = Infinity;
    this.nearestD = Infinity;

    for (const c of (this.candidates ?? [])) {
      if (c.rig?.caps?.downed) continue;
      const to = _v2.copy(c.root.position).setY(c.root.position.y + (c.height ?? 1.7) * 0.6).sub(eye);
      const d = to.length();
      if (d < 1e-4) continue;
      if (d < this.nearestD) this.nearestD = d;
      to.multiplyScalar(1 / d);

      // ---- HEARING. Deliberately NOT gated on line of sight. Gating it on LOS is what made
      // a stated 14 m sense behave as short-range sight, and hearing through a wall is the
      // only thing hearing is for. What it hears is what the target is DOING: `noise` is 0
      // standing still, ~0.49 walking, 1.0 sprinting or firing.
      const noise = c.noise ?? 0;
      if (noise > S.hearFloor && d < S.hearRange * noise && d < heardD) { heard = c; heardD = d; }

      // ---- SIGHT
      if (d > S.sightRange) continue;
      const a = this.facing + this.scan;
      const inFov = _v.set(Math.sin(a), 0, Math.cos(a)).dot(to) > S.fovCos;
      if (!inFov && d > S.peripheral) continue;
      if (this.room?.blocksSight(eye, _v3.copy(c.root.position).setY(1.0))) continue;
      if (d < seenD) { seen = c; seenD = d; }
    }

    this.sawThisFrame = !!seen;
    this.heardThisFrame = !!heard && !seen;

    // ---- awareness: the ramp that turns contact into a state
    if (seen) {
      // `hunterSightGain` is two curves in a trench coat: a distance-flat NOTICE rate below
      // `alertAt` and an inverse-square CONFIRM rate above it. See HUNTER_SENSE for why the
      // split exists and what a single rate measured.
      let gain = hunterSightGain(seenD, this.awareness);
      // ⚠️ A TARGET THAT IS BOTH VISIBLE AND LOUD MUST NEVER GAIN LESS THAN ONE THAT IS ONLY
      // LOUD. The two paths below are exclusive — `seen` wins — so once the confirm rate falls
      // under `soundGain` (past about 5.7 m) the visible branch would REPLACE the flat sound
      // ramp with a slower one, and stepping out of cover would make a sprinting robot HARDER
      // to commit to than one behind a wall. Nobody would design that; it would just happen.
      // `heard` is the nearest audible body and is computed independently of `seen` above, so
      // `heard === seen` is exactly "this one is making noise too".
      //
      // BUT THE FLOOR STOPS AT `soundCeiling`, exactly as the sound-only path does. "Sound gets
      // it looking; only sight sends it running" is a stated property of this design — A2's own
      // pass message quotes it — and a floor that ran all the way to `commitAt` would delete it
      // for any target that happened to be visible, which is most of them at the moment it
      // matters. Above the ceiling the last stretch of the ramp is sight's alone, so the range
      // you were seen at is what decides when it commits.
      if (heard === seen && this.awareness < S.soundCeiling) gain = Math.max(gain, S.soundGain);
      this.awareness = Math.min(1, this.awareness + gain * dt);
      this.target = seen;
      this.lastKnown.copy(seen.root.position);
      this.contact = 0;
    } else if (heard) {
      // Sound cannot commit it. It gets a direction and a rough position, not a lock — which
      // is what makes breaking line of sight worth doing even when you cannot be silent.
      this.awareness = Math.min(S.soundCeiling, this.awareness + S.soundGain * dt);
      this.target = heard;
      this.lastKnown.copy(heard.root.position);
      this.contact = 0;
    } else {
      this.awareness = Math.max(0, this.awareness - S.forget * dt);
      this.contact += dt;
    }

    this._arbitrate(dt, seen, seenD);
    return seen;
  }

  /**
   * One number in, one state out. Keeping the ladder in a single place is what stops the old
   * behaviour coming back: `_sense` used to assign `this.state = 'PURSUE'` inline the instant
   * anything passed the gates, which is why there was never an approach to perceive.
   */
  _arbitrate(dt, seen, seenD) {
    const S = HUNTER_SENSE;
    if (this.state === 'GROW' || this.state === 'BREACH') return;

    // 🚪 A DOOR IS AN INTENTION, NOT A TRANCE. HUNT/BANG hold against the awareness ladder — the
    // whole point is that a hunter which heard you keeps coming after the noise stops, and
    // `forget` would drop it out inside two seconds otherwise. But SEEING you outranks any door:
    // if it has line of sight and has confirmed, the door is abandoned mid-swing. Without this
    // pair of lines the mechanic would either evaporate (no hold) or read as a creature staring
    // at a door while the player walks past it (no override).
    if (this.state === 'HUNT' || this.state === 'BANG') {
      if (seen && seenD < S.reach * (this.stage * 0.35 + 0.8)) { this._clearDoor(); this.state = 'ATTACK'; }
      else if (seen && this.awareness >= S.commitAt) { this._clearDoor(); this.state = 'PURSUE'; }
      return;
    }

    // in reach and looking right at you: nothing above this matters
    if (seen && seenD < S.reach * (this.stage * 0.35 + 0.8)) { this.state = 'ATTACK'; return; }

    // HYSTERESIS. A threshold crossed on the way up is not the same threshold on the way down.
    // Measured without it: `ALERT -> SEARCH -> ALERT` across three consecutive frames with
    // awareness sitting exactly on `alertAt` (20.42 s -> 20.47 s in the driven session). ALERT
    // is a visible posture and a lit eye; flickering it reads as the AI being broken.
    const engaged = this.state === 'ALERT' || this.state === 'STALK'
      || this.state === 'PURSUE' || this.state === 'ATTACK';
    const DROP = 0.62;
    const commit = this.state === 'PURSUE' || this.state === 'ATTACK' ? S.commitAt * DROP : S.commitAt;
    const stalk = engaged && this.state !== 'ALERT' ? S.stalkAt * DROP : S.stalkAt;
    const alert = engaged ? S.alertAt * DROP : S.alertAt;

    if (this.awareness >= commit) { if (this.state !== 'PURSUE') this.state = 'PURSUE'; return; }
    if (this.awareness >= stalk) { if (this.state !== 'STALK') this.state = 'STALK'; return; }
    if (this.awareness >= alert) { if (this.state !== 'ALERT') this.state = 'ALERT'; return; }

    // Below ALERT with a target it can no longer find: sweep the last known point, then quit.
    if (this.target && this.contact > S.loseAfter) {
      if (this.state !== 'SEARCH' && this.state !== 'PATROL') { this.state = 'SEARCH'; this.searchTimer = S.searchFor; }
    } else if (this.state === 'ALERT' || this.state === 'STALK' || this.state === 'PURSUE' || this.state === 'ATTACK') {
      this.state = 'SEARCH'; this.searchTimer = S.searchFor;
    }
  }

  /**
   * THE MOMENT IT DECIDES — detected once, announced once.
   *
   * Runs straight after `_sense`, comparing the state the frame opened in with the one
   * `_arbitrate` just chose. Committed means PURSUE or ATTACK: everything below those is a
   * thing that has noticed you, and everything at or above them is a thing that is coming.
   *
   * ⚠️ THE RE-ARM THRESHOLD IS `alertAt`, NOT "STOPPED BEING COMMITTED", AND THE DIFFERENCE IS
   * WHY THIS IS A LATCH AT ALL. `_arbitrate` runs PURSUE on hysteresis — it holds until
   * awareness falls to `commitAt * 0.62` — so a hunter losing and regaining sight through a
   * colonnade crosses that boundary repeatedly inside one chase. Re-arming on "not committed"
   * would fire the alarm every few seconds, which is how a warning becomes wallpaper. Falling
   * all the way back to `alertAt` costs `(0.62 - 0.22) / forget` = 1.43 s of no contact at all,
   * i.e. it genuinely lost you, and the next commitment is genuinely news.
   */
  _commitStep(dt, wasState) {
    const S = HUNTER_SENSE;
    this._commitFlash = Math.max(0, this._commitFlash - dt / COMMIT_FLASH);
    if (this.state === 'GROW') return;
    const committed = this.state === 'PURSUE' || this.state === 'ATTACK';
    if (!committed && this.awareness < S.alertAt) this._committed = false;
    if (committed && !this._committed) {
      this._committed = true;
      this._commitFlash = 1;
      this.onCommit?.(wasState, this);
    }
  }

  /**
   * 0..1 for the HUD. Presence, not position: how much the frame should carry "something is
   * coming". Proximity alone contributes — a hunter that has not noticed you but is one room
   * away is still the reason you are holding your breath — and awareness multiplies it.
   */
  get threat() {
    if (this.state === 'GROW') return 1;
    const prox = Math.max(0, Math.min(1, 1 - (this.nearestD - 2.0) / 12));
    return Math.max(0, Math.min(1, prox * 0.40 + this.awareness * 0.74 * (0.34 + prox * 0.66)));
  }

  // ---- behaviours ---------------------------------------------------------

  /**
   * PATROL — a ROUTE through the whole house, not a figure-of-eight in one room.
   *
   * The old behaviour swept `sin(t * 0.21)` about the spawn point, which is a fact about a
   * one-room level: in a six-space mansion it parks the hunter in the room it started in
   * forever, so five sixths of the map is permanently safe and "unseen" costs nothing.
   *
   * The route is walked IN ORDER and it DWELLS at every stop — velocity damped, `_scanStep`
   * at full amplitude. A thing that stops and looks is the cheapest horror in the game.
   * Legs between non-adjacent spaces route through `_waypoint`'s portal BFS, so it uses
   * doors and the holes the player shot rather than walking at a wall.
   *
   * ⚠️ THE LAP IS ~160 s AND THAT IS CORRECT. Patrol speed is 0.78 m/s over ~106 m plus ~25 s
   * of dwell. It is what buys the opening beat without a scripted grace timer.
   */
  _patrol(dt, t) {
    const route = this.room?.patrolRoute?.();
    if (!route?.length) {   // no table: hold station rather than invent a sweep
      this.vel.multiplyScalar(Math.exp(-4 * dt));
      return;
    }
    if (this.routeIdx == null) this.routeIdx = this._nearestRouteIdx();
    const wp = route[this.routeIdx % route.length];
    const pos = this.root.position;
    const d = Math.hypot(wp.x - pos.x, wp.z - pos.z);

    if (d <= 1.2) {
      // ARRIVED: stop and look. `_scanStep` is already running at full amplitude because
      // PATROL is not one of its `busy` states.
      this.dwellLeft = (this.dwellLeft ?? wp.dwell) - dt;
      this.vel.multiplyScalar(Math.exp(-6 * dt));
      if (this.dwellLeft <= 0) {
        this.routeIdx = (this.routeIdx + 1) % route.length;
        this.dwellLeft = null;
      }
      return;
    }
    this.dwellLeft = null;
    this._steerTo(this._waypoint(_v.set(wp.x, 0, wp.z)), dt, HUNTER_SPEED[this.stage] * 0.38);
  }

  /**
   * Leaving SEARCH resumes at the NEAREST route stop, not at index 0 — otherwise every lost
   * contact teleports the hunter's intentions back to the ballroom and it walks the whole
   * house to get back to where it already is.
   */
  _nearestRouteIdx() {
    const route = this.room?.patrolRoute?.() ?? [];
    let best = 0, bestD = Infinity;
    const p = this.root.position;
    for (let i = 0; i < route.length; i++) {
      const d = (route[i].x - p.x) ** 2 + (route[i].z - p.z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /**
   * ALERT — the tell. It stops dead, turns its head and then its body toward whatever
   * registered, and its eye comes up (see `_integrate`). It does NOT close. This state exists
   * entirely so the player gets a second or two of "it knows" before "it is coming", and it
   * is the cheapest horror beat in the game: a thing across a dark room that stops moving.
   */
  _alert(dt, t) {
    this.vel.multiplyScalar(Math.exp(-7 * dt));
    this._faceToward(this.lastKnown, dt, 4.5);
  }

  /** STALK — committed to the direction, not yet to you. Half speed, still scanning. */
  _stalk(dt, t) {
    const narrow = this._tooNarrowPanel(this.lastKnown);
    if (narrow) { this.breachTarget = narrow; this.state = 'BREACH'; return; }
    const panel = this._blockingPanel(this.lastKnown);
    if (panel) { this.breachTarget = panel; this.state = 'BREACH'; return; }
    this._steerTo(this._waypoint(this.lastKnown), dt, HUNTER_SPEED[this.stage] * 0.50);
  }

  /** Turn on the spot toward a point. `_integrate` only drives facing off velocity. */
  _faceToward(p, dt, rate) {
    const want = Math.atan2(p.x - this.root.position.x, p.z - this.root.position.z);
    let d = want - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * (1 - Math.exp(-rate * dt));
  }

  /**
   * THE DOOR IT NO LONGER FITS THROUGH — and the panel it makes instead.
   *
   * `radius = 0.30 + stage * 0.12` and `room.collide()` is a circle push-out, so the centre
   * needs more than twice the radius of clear width: 0.84 / 1.08 / 1.32 at stages 1/2/3.
   * D7 is 1.20 m ON PURPOSE (§2.3) — the chapel is a refuge that GROWTH takes away.
   *
   * ⚠️ BUT THE MECHANIC ONLY EXISTS IF THE AI KNOWS. Without this, `pathPortals` hands a
   * stage-3 hunter a route through D7, `_waypoint` lines it up square in front of the opening,
   * `collide()` refuses to let it through, and it presses into the jamb for the rest of the
   * round three metres from the player. Measured: in a 20 s chase it neither entered the chapel
   * nor touched `p.chapel`. That is not a narrow door reading as a constraint — it is an AI
   * that looks like it forgot what it was doing, which is strictly worse than no mechanic.
   *
   * So: ask for a route it actually FITS through. If there is none but an ordinary route
   * exists, the wall between is the way in, and breaching it is loud, slow and completely
   * readable — which is the beat the plan wanted from growth in the first place.
   */
  _tooNarrowPanel(goal) {
    if (!this.room?.pathPortals) return null;
    const here = this.room.spaceAt?.(this.root.position);
    const there = this.room.spaceAt?.(goal);
    if (!here || !there || here.id === there.id) return null;
    const need = this.radius * 2 + 0.12;
    // 🕳️ AND A CLEAR HEIGHT, for the reason `room.pathPortals` states: `dig.js`'s segment is
    // 1.14 m wide — WIDER than a stage-2 body needs — and 1.80 m tall, which no stage of this
    // thing gets under. Filtering on width alone would route it at a hole it bounces off.
    if (this.room.pathPortals(here.id, there.id, need, PASS_H.hunter).length) return null;
    const any = this.room.pathPortals(here.id, there.id);
    if (!any.length) return null;                                             // truly unreachable
    const tight = any.find((p) => p.w < need || (p.h ?? 99) < PASS_H.hunter) ?? any[0];
    /**
     * ⚠️ **`canOpen()` — AND WITHOUT IT `docs/design/dig.md` DELETES THIS MECHANIC.**
     *
     * The question this line asks is "which wall between here and there is the way in", and it
     * used to take the first panel joining those two rooms that is damageable and solid. A dig
     * segment is both — for about a thousand hit points — and then bottoms out at `barrier` and
     * is neither. So an unguarded hunter would slam a segment for seven seconds, be told it is
     * no longer damageable, come back round, pick the segment NEXT to it, and do that nine
     * times while the player watched. It would not throw, and it reads exactly like the failure
     * the comment above this method describes: an AI that forgot what it was doing.
     *
     * `WallState.canOpen()` asks the TABLE, not the current stage: is there any stage here that
     * stops blocking movement? `STAGE_DEFS`, `EXIT_DEFS` and `CHAINED_DEFS` all end at `open`,
     * so this is `true` for every panel in the default build and the guard changes nothing with
     * `?dig=0`. That is asserted, not assumed — `dig-toggle.mjs` counts it on both arms.
     */
    return (this.room.panels ?? []).find((q) => q.state.isDamageable() && q.blocksMovement()
      && this._canBreak(q)
      && ((q.spec?.a === tight.a && q.spec?.b === tight.b)
        || (q.spec?.a === tight.b && q.spec?.b === tight.a))) ?? null;
  }

  /**
   * 🕳️ **CAN THIS THING EVER GET THROUGH THAT WALL?** — and it is two questions, not one.
   *
   * `canOpen()` asks the panel's own TABLE, which is right for everything the game shipped and
   * wrong for a dig segment: a segment terminates at `barrier` and answers `false`, which is
   * exactly what `dig-1` needed so the hunter would not chew a wall it could never open. But
   * `dig.md` §2 is explicit that *"the barrier is a ROBOT barrier and the hunter is not a robot
   * in that sense — it crosses, it comes through the wall"*, so the second question is whether
   * the ROOM will let it cross, and the room owns that (`room.hunterBreach` is what actually
   * takes the masonry and the lintel out). Asking the room rather than deciding here keeps the
   * AI ignorant of the shape of the house, which is this file's own standing rule.
   *
   * ⚠️ `room.digCanHunterCross` is false on every `?dig=0` build and on any panel that is not a
   * segment, so this is `canOpen()` and nothing else in the shipped game.
   */
  _canBreak(q) {
    return q.state.canOpen() || !!this.room?.digCanHunterCross?.(q);
  }

  _pursue(dt, t) {
    const goal = this.target ? this.target.root.position : this.lastKnown;
    // Too big for the only door on the route? Then the wall is the door.
    const narrow = this._tooNarrowPanel(goal);
    if (narrow) { this.breachTarget = narrow; this.state = 'BREACH'; return; }
    // Is something breakable directly in the way? Then break it — routing through a
    // mansion is not "find the door" for this thing.
    const panel = this._blockingPanel(goal);
    if (panel) { this.breachTarget = panel; this.state = 'BREACH'; return; }
    // Otherwise route through whatever ways exist right now, INCLUDING the holes the
    // player made. A breach the player shot open is a door the hunter will use.
    this._steerTo(this._waypoint(goal), dt, HUNTER_SPEED[this.stage]);
  }

  /**
   * If the target is on the other side of the divider, aim at the nearest opening rather
   * than at the target — a straight line into a solid wall makes an AI slide along it
   * forever, which is exactly what it looks like: a thing that cannot find the door.
   */
  _waypoint(goal) {
    if (!this.room?.pathPortals) return goal;
    const here = this.room.spaceAt?.(this.root.position);
    const there = this.room.spaceAt?.(goal);
    // Same room, or either body standing in a doorway and therefore in no room: walk at it.
    if (!here || !there || here.id === there.id) return goal;

    // BFS over whatever is OPEN right now — doors and the holes the player shot. A breach is
    // a door to the AI, which is the whole point of the destructible panels being topology.
    // The result is cached in `room.js` and invalidated when any panel changes stage.
    // ASK FOR A ROUTE THIS BODY FITS THROUGH. `collide()` is a circle push-out, so the centre
    // needs more than twice the radius of clear width; a route through an opening narrower than
    // that is a route into a jamb. Falls back to the unfiltered path so a hunter that fits
    // nowhere still walks at the wall it is about to break rather than standing still.
    // 🕳️ WIDTH **AND** HEIGHT — the same pair `_tooNarrowPanel` asks for, and for the same
    // reason: a route through a 1.80 m dig hole is a route into a lintel.
    const need = this.radius * 2 + 0.12;
    const path = this.room.pathPortals(here.id, there.id, need, PASS_H.hunter).length
      ? this.room.pathPortals(here.id, there.id, need, PASS_H.hunter)
      : this.room.pathPortals(here.id, there.id);
    if (!path.length) return goal;
    const portal = path[0];

    // TWO BEATS, AND THIS TECHNIQUE IS CARRIED FROM THE ONE-ROOM VERSION DELIBERATELY.
    // Aiming at a point on your own side of a wall is a waypoint you have already reached, and
    // an AI that does that slides along the wall forever looking like a thing that cannot find
    // the door. So: first line up square in front of the opening on THIS side, and only once
    // you are within `LINED` of the portal's axis, aim at a point past it on the far side.
    //
    // Generalised to the portal's own axis: `axis` is the axis the portal's WIDTH runs along,
    // so its NORMAL is the other one. The old code hardcoded width-along-X / normal-along-Z,
    // which is one of the four walls in the mansion.
    const wp = (this._wp ??= new THREE.Vector3());
    const alongX = portal.axis === 'x';
    const c = portal.centre;
    const pos = this.root.position;
    // signed distance from the portal plane, along the normal
    const off = alongX ? pos.z - c.z : pos.x - c.x;
    const side = Math.sign(off) || 1;
    // how far off the opening's centre line we are, along the width
    const drift = alongX ? Math.abs(pos.x - c.x) : Math.abs(pos.z - c.z);

    const LINED = 0.55, PAST = 1.15, APPROACH = 1.15;
    if (drift < LINED) {
      // square on: commit through, to a point on the FAR side
      return alongX ? wp.set(c.x, 0, c.z - side * PAST) : wp.set(c.x - side * PAST, 0, c.z);
    }
    // not lined up yet: stand off the opening on our own side and slide across to it
    const stand = Math.max(APPROACH, Math.min(Math.abs(off), 2.2));
    return alongX ? wp.set(c.x, 0, c.z + side * stand) : wp.set(c.x + side * stand, 0, c.z);
  }

  /**
   * Is there a wall between here and what it wants, and is that wall one it is allowed to
   * break? Only the FIRST thing on the line counts — if a solid wall is nearer than the
   * panel, breaking the panel would not help and it should walk round instead.
   */
  _blockingPanel(goal) {
    if (!this.room) return null;
    const from = _v2.copy(this.root.position).setY(this.height * 0.42);
    const dir = _v.copy(goal).setY(this.height * 0.42).sub(from);
    const dist = dir.length();
    if (dist < 0.3) return null;
    dir.multiplyScalar(1 / dist);
    const hit = this.room.castRay(from, dir, dist, { forDamage: true });
    // ⚠️ `_canBreak()` — CAN THIS PANEL EVER BECOME A DOOR **FOR THIS BODY**? See its own note.
    // `canOpen()` for every table that shipped, plus the dig segments the room will let the
    // hunter cross, so this is unchanged unless `?dig=1` put a barrier-backed segment here.
    if (hit?.panel && hit.panel.blocksMovement() && hit.panel.state.isDamageable()
      && this._canBreak(hit.panel)) return hit.panel;
    return null;
  }

  _breach(dt, t) {
    const p = this.breachTarget;
    /**
     * 🕳️ **THE LAST HIT ON A DIG WALL IS NOT A HIT, IT IS THE CROSSING.**
     *
     * A segment that has bottomed out at `barrier` is `damageable: false`, so without this the
     * hunter would chew the finish off a wall, arrive at the masonry, be told it is no longer
     * damageable and walk away — which is the "an AI that forgot what it was doing" failure this
     * file keeps naming, arriving at the one moment the design most wants the beat.
     * `room.hunterBreach` is what takes the brick and the lintel out; this is where it is asked.
     * On a `?dig=0` build `digCanHunterCross` is false and this line cannot fire.
     */
    if (p?.state && !p.state.isDamageable() && this.room?.digCanHunterCross?.(p)
      && p.blocksMovement() && this.room.hunterBreach(p)) {
      this.debris?.burst('plaster', p.root.position.clone(), 26, { speed: 5.2, spread: 1.2 });
      this.dust?.burst(p.root.position.clone(), 34, { radius: 2.0 });
      this.breachTarget = null;
      this.state = this.target ? 'PURSUE' : 'SEARCH';
      return;
    }
    if (!p || !p.state.isDamageable()) { this.state = this.target ? 'PURSUE' : 'SEARCH'; return; }
    const at = _v.set(p.root.position.x, this.height * 0.45, p.root.position.z);
    const d = at.distanceTo(this.root.position);
    if (d > HUNTER_SENSE.reach * 1.2) { this._steerTo(at, dt, HUNTER_SPEED[this.stage] * 0.9); return; }
    this.vel.multiplyScalar(Math.exp(-8 * dt));
    this._swing = (this._swing ?? 0) - dt;
    if (this._swing <= 0) {
      this._swing = 0.85;
      // THE PANEL'S OWN FRAME, NOT THE WORLD'S. Both of these lines used to assume every
      // panel lay on the z = 0 plane — the slam direction was `(0, 0, hunterZ > 0 ? -1 : 1)`
      // and the impact point pinned z to 0. That was true of the single divider and is false
      // of half the mansion's panels, whose walls run along Z. Against one of those the old
      // code slammed ALONG the wall and aimed at a point tens of metres away, so the panel
      // simply never broke and the hunter stood there swinging forever.
      const hit = p.hitPoint(this.root.position, this.rng, _v2);
      // into the face, from whichever side the hunter is standing on
      const dir = p.normal.multiplyScalar(-p.sideOf(this.root.position));
      if (this.weapons) this.weapons.hitWall(p, hit, dir, 'hunterSlam');
      else p.damage(WEAPON_DAMAGE.hunterSlam, { point: hit.toArray() });
    }
    if (!p.blocksMovement()) { this.breachTarget = null; this.state = this.target ? 'PURSUE' : 'SEARCH'; }
  }

  _search(dt, t) {
    this.searchTimer -= dt;
    // sweep outward from the last known point in a widening spiral
    const r = 1.2 + (HUNTER_SENSE.searchFor - this.searchTimer) * 0.55;
    const a = t * 1.35;
    _v.set(this.lastKnown.x + Math.cos(a) * r, 0, this.lastKnown.z + Math.sin(a) * r);
    // ⚠️ CLAMP THE SPIRAL TO THE ROOM IT IS SEARCHING. The spiral reaches
    // `1.2 + 9.0 * 0.55 = 6.15 m`, which is wider than the service passage and wider than
    // half of every other space here — so an unclamped sweep aims at points inside solid wall
    // for most of nine seconds, and `_steerTo` then presses the hunter into that wall while
    // `collide()` pushes it back. That reads as a broken AI, not as a search. Clamping the
    // TARGET (not the body) keeps the sweep shape and keeps every point of it reachable.
    const sp = this.room?.spaceAt?.(this.root.position);
    if (sp) {
      _v.x = Math.min(sp.x1 - 1.0, Math.max(sp.x0 + 1.0, _v.x));
      _v.z = Math.min(sp.z1 - 1.0, Math.max(sp.z0 + 1.0, _v.z));
    }
    this._steerTo(_v, dt, HUNTER_SPEED[this.stage] * 0.62);
    if (this.searchTimer <= 0) {
      this.state = 'PATROL'; this.target = null;
      // resume the route where the search left it standing, not at the top
      this.routeIdx = this._nearestRouteIdx(); this.dwellLeft = null;
    }
  }

  /**
   * ATTACK — rear back, then take a limb. The rearing back IS the mechanic.
   *
   * A kill has to be something the player watched coming and failed to answer, not something
   * that had already happened by the time the frame was drawn. So entering reach starts a
   * WINDUP, not a strike: `ATTACK_WINDUP` seconds during which `_animate` sweeps the arm from
   * fully reared to fully swung, the hunter is stationary (`vel` is damped hard here), and
   * nothing has been taken yet. Step outside reach before it lands and it lands on nothing —
   * `_arbitrate` drops the state, and after `ATTACK_REGRIP` the next one starts over.
   *
   * That is the whole difference between "why did I die" and "I was too slow": the outcome now
   * varies with how fast the player reacts, and with nothing else. See the constants above for
   * what it used to vary with instead.
   */
  _attack(dt, t) {
    this.vel.multiplyScalar(Math.exp(-10 * dt));

    // OPENING an encounter, or continuing one? A fresh windup every time would be exploitable
    // by stutter-stepping across the reach boundary; inheriting one is what caused the coin
    // flip. `_atkGap` is the only input to that decision and it is measured, not remembered.
    if (this._wind == null || this._atkGap > ATTACK_REGRIP) this._wind = ATTACK_WINDUP;
    this._atkGap = 0;

    this._wind -= dt;
    if (this._wind > 0) return;
    this._wind = ATTACK_CADENCE;
    const c = this.target;
    if (!c?.rig) return;
    // it takes a LIMB, not hit points
    const dir = _v.copy(c.root.position).sub(this.root.position).setY(0).normalize();
    const socket = ['armL', 'armR', 'legL', 'legR']
      .map((k) => ({ armL: 'shoulderL', armR: 'shoulderR', legL: 'hipL', legR: 'hipR' }[k]))
      .find((s) => c.rig.occupant(s) !== 'empty');
    if (!socket) return;
    const item = c.rig.detach(socket, {
      impulse: dir.clone().multiplyScalar(2.6).setY(2.9),
      spin: new THREE.Vector3((this.rng() - 0.5) * 9, (this.rng() - 0.5) * 9, (this.rng() - 0.5) * 9),
    });
    this.onKill?.(c, socket, item);
    this.absorb(item);
  }

  /**
   * Take a hit. It does not have hit points and it does not die: damage buys distance.
   * Enough of it in a short window breaks its attack, shoves it back and drops it into
   * SEARCH, which is the only way out of a corner the player actually has.
   *
   * BUT NOT FOREVER, AND THIS IS THE WHOLE FIGHT. The original line was `this.stun += dmg`
   * with no cap and no cooldown on the break. The nailgun does 26 at a 0.13 s cadence — 200
   * damage per second against a 55/s decay — so stun sawtoothed 0 -> 190 -> 0 about once a
   * second, the hunter's attack was interrupted every time, and a player holding the left
   * mouse button was measured surviving 27 s at point-blank range against a 9 s baseline for
   * not shooting at all. The game had exactly two states, unloseable and unwinnable, and this
   * line was the unloseable one.
   *
   * The fix is diminishing returns rather than a cap, because a cap alone would only slow the
   * sawtooth down. Three things now compound:
   *   · `stunResist` rises 0.34 per break and scales down BOTH the stun gained and the
   *     knockback of every subsequent hit, recovering at 0.10/s once you stop
   *   · `_breakLock` makes another break impossible for 3.4 s, plus 1.6 s per consecutive
   *     break in the same chain, up to 9 s
   *   · `stun` is hard-capped at STUN_MAX so a fast weapon cannot bank it during the lock
   * So the first burst still buys the escape it always did, the second buys less, and the
   * fourth buys nothing at all. Shooting is how you make a gap. It is not how you win.
   */
  stagger(dmg, dir, point) {
    if (this.state === 'GROW') return;
    this._setFlare(true);
    // being shot is not subtle: whatever it was doing, it now knows where you are
    this.awareness = 1;
    this.contact = 0;
    // 🚪 ...INCLUDING WORKING ON A DOOR. `_arbitrate`'s HUNT/BANG branch only yields to SIGHT, so
    // without this a hunter shot in the back keeps calmly hammering. Shooting it is the player's
    // answer to the door timer and it has to land.
    if (this.state === 'HUNT' || this.state === 'BANG') { this._clearDoor(); this.state = 'STALK'; }

    const soft = 1 - this.stunResist;
    this.stun = Math.min(STUN_MAX, (this.stun ?? 0) + dmg * soft);
    this.flare.intensity = Math.min(14, (this.flare.intensity ?? 0) + dmg * 0.16 * soft);
    // the shove is resisted too — otherwise a nail gun is a tractor beam that outruns the
    // hunter's own walk speed
    const push = (dmg / (26 * this.stage)) * soft;
    this.vel.addScaledVector(_v.set(dir.x, 0, dir.z).normalize(), push);

    if (this.stun >= STUN_BREAK && this._breakLock <= 0) {
      this.stun = 0;
      // Both clocks, because a break is the end of whatever it was mid-way through. Dropping
      // `_wind` (rather than parking a number in it) is what guarantees the strike after a
      // break is telegraphed like any other first strike — the player bought a fresh windup,
      // not an invisible head start for the hunter.
      this._swing = 0.85;
      this._wind = null;
      this._atkGap = Infinity;
      this.vel.addScaledVector(_v, 3.6 * Math.max(0.35, soft));
      this.lastKnown.copy(this.root.position).addScaledVector(_v, -3);
      this.state = 'SEARCH';
      this.searchTimer = 3.2;
      this._breakChain++;
      this._breakLock = Math.min(BREAK_LOCK_MAX, BREAK_LOCK + BREAK_LOCK_STEP * (this._breakChain - 1));
      this.stunResist = Math.min(RESIST_MAX, this.stunResist + RESIST_PER_BREAK);
      this.onStagger?.(this._breakChain, this.stunResist, this);
    }
  }

  // ---- absorption and growth ---------------------------------------------

  /**
   * Take a part onto itself. The limb is reparented to the hunter and drawn into the
   * shoulder over `_pull`, then vanishes into the body — the audience has to SEE the part
   * become part of it, or the growth that follows has no cause.
   */
  absorb(item) {
    this.absorbed++;
    if (item) {
      item.root.removeFromParent();
      this.model.add(item.root);
      item.held = this;
      item.attachedTo = this;
      this._pull = { item, t: 0, from: item.root.position.clone() };
    }
    const want = hunterStageFor(this.absorbed);
    if (want !== this.stage) this._grow(want);
    return { absorbed: this.absorbed, stage: this.stage };
  }

  _grow(to) {
    this.growFrom = this.stage;
    this.growTo = to;
    this.state = 'GROW';
    this._setFlare(true);
    this.growT = 0;
    this.vel.set(0, 0, 0);
  }

  _growStep(dt, t) {
    this.growT += dt;
    const T = this.growT, DUR = 1.40;
    const p = Math.min(1, T / DUR);
    const from = this.rigs[this.growFrom], to = this.rigs[this.growTo];

    if (p < 0.46) {
      // convulsion: the old body crushes down and shakes before it splits
      const k = p / 0.46;
      const shake = Math.sin(T * 46) * 0.05 * k;
      from.root.visible = true; to.root.visible = false;
      from.root.scale.setScalar(1 - k * 0.22);
      from.root.rotation.z = shake;
      from.root.position.y = -k * 0.18 * this.height;
      this.flare.intensity = k * 26;
      if (p > 0.42 && !this._burst) {
        this._burst = true;
        this.debris?.burst('timber', this.root.position.clone().setY(this.height * 0.4), 24, { speed: 4.0, spread: 1.0 });
        this.dust?.burst(this.root.position.clone().setY(this.height * 0.35), 22, { radius: 1.1 });
      }
    } else {
      // and the next stage unfolds out of it, overshooting before it settles
      const k = (p - 0.46) / 0.54;
      from.root.visible = false;
      from.root.scale.setScalar(1); from.root.rotation.z = 0; from.root.position.y = 0;
      to.root.visible = true;
      const s = 0.55 + (1 - 0.55) * ease(k) + Math.sin(k * Math.PI) * 0.12;
      to.root.scale.setScalar(s);
      to.root.position.y = -(1 - ease(k)) * 0.22 * this.height;
      this.flare.intensity = 26 * (1 - k) * (1 - k);
    }

    if (this._pull) this._pullStep(dt);

    if (p >= 1) {
      const was = this.stage;
      this.stage = this.growTo;
      for (const s of [1, 2, 3]) this.rigs[s].root.visible = s === this.stage;
      this.rigs[this.stage].root.scale.setScalar(1);
      this.rigs[this.stage].root.position.y = 0;
      this.flare.intensity = 0;
      this.flare.position.y = this.height * 0.86;
      this.radius = 0.30 + this.stage * 0.12;
      this._burst = false;
      this.state = this.target ? 'PURSUE' : 'PATROL';
      this.onStage?.(was, this.stage, this);
    }
  }

  _pullStep(dt) {
    const pl = this._pull;
    pl.t += dt;
    const k = Math.min(1, pl.t / 0.8);
    const to = _v.set(0, this.height * 0.78, 0);
    pl.item.root.position.lerpVectors(pl.from, to, ease(k));
    pl.item.root.scale.setScalar(1 - k * 0.85);
    pl.item.root.rotateY(dt * 9);
    if (k >= 1) { pl.item.root.removeFromParent(); this._pull = null; }
  }

  // ---- motion -------------------------------------------------------------

  _steerTo(goal, dt, speed) {
    // ⚠️ SNAPSHOT THE GOAL FIRST. `_v` is a module-level scratch vector and several callers
    // legitimately pass it as `goal` (`_search`'s spiral point, `_patrol`'s route stop, and
    // `_waypoint` when it returns its argument unchanged). The line below then does
    // `_v.copy(goal)` — aliasing — and by the time the wall-avoidance branch read `goal.x` it
    // was reading the NORMALISED DIRECTION instead of the goal, so the tangent was chosen by
    // a coin flip and the hunter slid the wrong way round every obstacle. It never threw and
    // it only fires when a solid wall is within 1.4 m, which is exactly when steering matters.
    const gx = goal.x, gz = goal.z;
    const to = _v.copy(goal).setY(0).sub(_v2.copy(this.root.position).setY(0));
    const d = to.length();
    if (d < 0.05) return;
    to.multiplyScalar(1 / d);

    // wall avoidance: if the straight line is blocked by something SOLID, slide along it
    if (this.room) {
      const probe = _v2.copy(this.root.position).setY(this.height * 0.4);
      const hit = this.room.castRay(probe, to, this.radius + 1.4);
      if (hit && !hit.panel) {
        // tangent, chosen toward the goal
        const tan = new THREE.Vector3(-to.z, 0, to.x);
        const side = tan.dot(_v2.set(gx - this.root.position.x, 0, gz - this.root.position.z)) >= 0 ? 1 : -1;
        to.addScaledVector(tan, side * 1.35).normalize();
      }
    }
    // ---- FIRE IS AN OBSTACLE. This is what makes oil AREA DENIAL rather than damage.
    //
    // A burning pool that merely hurts is a scratch: the hunter walked through it, took a
    // tick, and its own knockback shoved it clear — so the player gained nothing they could
    // plan around. Denial only exists if the AI would RATHER GO ROUND, which means steering
    // has to know pools are there. Now a doorway with a pool across it is a real decision for
    // the hunter, which is the whole point of the gadget.
    //
    // A repulsion rather than a hard block, deliberately: a wall it cannot pass would let the
    // player fence it out of the level with one shot. It leans away, and if the only route to
    // you runs through the fire it will still come — and burn for it.
    const fires = this.weapons?.fires;
    if (fires?.length) {
      for (const f of fires) {
        // Vector from the hunter TO the fire, and how far along the current heading it lies.
        const ax = f.pos.x - this.root.position.x, az = f.pos.z - this.root.position.z;
        const fd = Math.hypot(ax, az);
        const reach = f.r + this.radius + 1.1;         // lean before it is standing in it
        if (fd > reach + 3.0 || fd < 1e-3) continue;
        const ahead = (ax / fd) * to.x + (az / fd) * to.z;   // 1 = dead ahead

        // ⚠️ A RADIAL PUSH ALONE CANNOT STEER AROUND ANYTHING, and head-on is the common case.
        // With a pool dropped exactly between the hunter and its goal, "away from the fire"
        // points straight back down the path: it slows the hunter and moves it sideways not
        // at all. Measured — the first version produced 0.000 m of lateral deviation in
        // precisely the situation the gadget exists for. So the fire also contributes a
        // TANGENT, chosen toward the goal, exactly as the wall avoidance above does.
        if (ahead > 0.2 && fd < reach + 3.0) {
          const tx = -(az / fd), tz = (ax / fd);       // perpendicular to the fire direction
          const side = (tx * (gx - this.root.position.x) + tz * (gz - this.root.position.z)) >= 0 ? 1 : -1;
          const near = 1 - Math.min(1, (fd - reach) / 3.0);   // strongest when closest
          to.x += tx * side * 1.5 * ahead * near;
          to.z += tz * side * 1.5 * ahead * near;
        }
        // and a straight repulsion once it is genuinely close
        if (fd < reach) {
          const push = (1 - fd / reach) * 1.6;
          to.x -= (ax / fd) * push;
          to.z -= (az / fd) * push;
        }
      }
      const l = Math.hypot(to.x, to.z) || 1;
      to.x /= l; to.z /= l;
    }

    const want = to.multiplyScalar(speed);
    const k = 1 - Math.exp(-7 * dt);
    this.vel.x += (want.x - this.vel.x) * k;
    this.vel.z += (want.z - this.vel.z) * k;
  }

  _integrate(dt) {
    _v.copy(this.root.position).addScaledVector(this.vel, dt);
    // 🕳️ `PASS_H.hunter`, NOT THE DEFAULT. This is the line that makes `dig.js`'s 1.80 m
    // segment a wall to this body and a passage to a robot — see `rules.js` PASS_H for why the
    // number is authored rather than read off `this.height` (every doorway in the house is 2.72).
    if (this.room?.collide) _v.copy(this.room.collide(_v, this.radius, PASS_H.hunter));
    if (dt > 0) this.vel.copy(_v).sub(this.root.position).multiplyScalar(1 / dt);
    this.root.position.copy(_v);
    this.root.position.y = this.room?.floorY ?? 0;
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.speed > 0.06) {
      const want = Math.atan2(this.vel.x, this.vel.z);
      let d = want - this.facing;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.facing += d * (1 - Math.exp(-6 * dt));
    }
    this.root.rotation.y = this.facing;

    // ---- the stagger economy relaxes
    this.stun = Math.max(0, (this.stun ?? 0) - dt * STUN_DECAY);
    this._breakLock = Math.max(0, this._breakLock - dt);
    this.stunResist = Math.max(0, this.stunResist - dt * RESIST_RECOVER);
    // the chain only ends once the lock has fully expired AND stun has bled off, so pausing
    // for half a second does not reset the diminishing returns
    if (this._breakLock <= 0 && this.stun <= 0) this._breakChain = 0;

    if (this.state !== 'GROW') {
      // THE EYE IS THE IN-WORLD TELL. A HUD channel alone would make "something is coming"
      // a thing you read rather than a thing you see.
      //
      // It is carried by the EYE MATERIAL, not by the light, and that split is a measured
      // decision. An A/B on the same frame with the light forced off and on
      // (`harness/scenarios/perf-flare.mjs`) cost +1.59 ms GPU on a 4.80 ms base — a third,
      // for one light, with no change in draw calls, exactly as this file's own comment
      // warned. (Those absolute numbers are software-rendered and are NOT comparable to the
      // 1.39 ms budget; the ratio is the finding.) Emissive costs nothing: the faceplate is
      // already drawn, already emissive, and the bloom pass is already running.
      //
      // So the material ramp starts at ALERT — the moment the player needs to see — and the
      // PointLight, which is what actually throws red onto the walls around it, waits until
      // STALK, when the thing is genuinely coming. That bounds how much of a round pays for
      // the extra light without giving up the tell.
      //
      // ...AND ON TOP OF THE RAMP, ONE PUNCH. The ramp above is monotonic in `awareness` and
      // therefore has no instant in it; measured either side of `commitAt` it moved the frame
      // 1.1x the room's own lighting noise (`harness/scenarios/commit-tell.mjs`). The punch is
      // what turns "brighter than it was a second ago" into "that just happened": both the
      // faceplate and the eye light are driven well past their ramp ceiling for COMMIT_FLASH
      // seconds. It costs no light, no material and no draw call — the flare is already in the
      // scene by STALK and the faceplate is already emissive.
      const S = HUNTER_SENSE;
      const punch = this._commitFlash * this._commitFlash;   // squared: a spike, not a slope
      const k = Math.max(0, (this.awareness - S.alertAt) / (1 - S.alertAt));
      this._setEyeDrive(this.awareness >= S.alertAt || punch > 0 ? k + punch * COMMIT_EYE : 0);
      const floor = (this.awareness >= S.stalkAt
        ? 1.1 + (this.awareness - S.stalkAt) / (1 - S.stalkAt) * 4.2 : 0)
        + punch * COMMIT_FLARE;
      this.flare.intensity = Math.max(floor, this.flare.intensity - dt * 26);
      if (this.flare.intensity <= 0.01) this._setFlare(false); else this._setFlare(true);
    }
  }

  /**
   * Drive the current stage's faceplate emissive, 0..1 over the authored base.
   *
   * The material is found by name once per stage and cached. `faceOverride()` in hunter.js
   * builds a fresh faceplate per stage, so this cannot bleed into the player's face — the
   * player's is a different instance from a different cache key.
   */
  _setEyeDrive(k) {
    let m = (this._eyeMat ??= {})[this.stage];
    if (m === undefined) {
      m = null;
      this.rig.root.traverse((o) => {
        const mm = o.material;
        if (!mm || m) return;
        for (const x of Array.isArray(mm) ? mm : [mm]) {
          if (x?.name === 'hunter.faceplate') { m = x; break; }
        }
      });
      this._eyeMat[this.stage] = m;
      if (m) this._eyeBase ??= {}, this._eyeBase[this.stage] = m.emissiveIntensity;
    }
    if (!m) return;
    const base = this._eyeBase?.[this.stage] ?? 2.9;
    // a slow throb on top, so an alerted hunter is alive rather than switched on
    const throb = k > 0 ? 1 + Math.sin(this._scanT * 3.1) * 0.10 * k : 1;
    m.emissiveIntensity = base * (1 + k * 1.9) * throb;
  }

  _animate(dt, t) {
    const rig = this.rig;
    const g = this.gaits[this.stage];
    const def = HUNTER_STAGES[this.stage];

    /*
     * 🤖 THE GENERATED BODY DRIVES ITSELF, AND EVERYTHING BELOW IS SKIPPED.
     *
     * This is the same ruling `mesh-avatar.js` records for the player, where a split — clips for
     * the legs, procedural arms retargeted on top — was built, played and rejected by John ("the
     * arms are not right ... I think we need to abandon the old skellington"). Two solutions
     * writing one skeleton disagree about where the shoulder is, and the seam does not sand out.
     *
     * So the AI hands over STATE and nothing else: how fast it is moving, and whether it is
     * mid-strike or mid-growth. The hunch, the scan, the rear-and-swing telegraph and the ALERT
     * posture below are all authored joint angles for a rig this body does not have; their
     * equivalents live in the clip set (`Alert` is the listening pose, `Attack` is the strike,
     * `Arise` is the growth) and in the generated geometry, which is where the stoop belongs.
     *
     * ⚠️ WHAT IS LOST HERE IS REAL AND IS NAMED IN THE HANDOFF: the scan. On the procedural body
     * the player can WATCH IT LOOK, because `_scanStep`'s sense-cone offset is put through the
     * neck and head. A baked clip cannot know where the hunter is looking. That is the first
     * thing to fix on this path and it needs a clip, not code.
     */
    if (this.meshRigs) {
      const striking = this.state === 'ATTACK' || this.state === 'BREACH' || this.state === 'BANG';
      if (striking && !this._meshSwing) {
        this._meshSwing = true;
        rig.playAttack?.(0.45);
      } else if (!striking) {
        this._meshSwing = false;
      }
      rig.update?.(dt, {
        speed: this.speed,
        runAt: 2.4,                    // the same threshold the procedural path calls a run
        growing: this.state === 'GROW',
      });
      if (this._pull) this._pullStep(dt);
      return;
    }
    g.update(dt, { speed: this.speed / (def.scale), gait: 'walk', run: this.speed > 2.4 });
    // The gait is a DELTA on the hunter's authored hunch, not a replacement for it — the
    // hunch is the silhouette the whole design rests on and a walk cycle must not iron it
    // flat. 0.62 leaves the posture readable while the legs still carry the body.
    const base = hunterBasePose(def);
    const pose = {};
    for (const k of new Set([...Object.keys(base), ...Object.keys(g.pose)])) {
      const b = base[k] ?? [0, 0, 0], a = g.pose[k] ?? [0, 0, 0];
      pose[k] = [b[0] + a[0] * 0.62, b[1] + a[1] * 0.62, b[2] + a[2] * 0.62];
    }
    // AN ATTACKING HUNTER REARS AND SWINGS — and this is the picture of the windup, so the
    // timer it reads has to be the one that actually gates the strike. It read `_swing`
    // against a fixed 0.85 for both states; ATTACK now counts `_wind`, and on the entry frame
    // that used to be `undefined` (`?? 1` -> s = 0, a fully-reared arm) on the exact frame the
    // limb came off. The telegraph drew the anticipation AFTER the hit it was anticipating.
    // 🚪 BANG rides the same arm, off its own clock. A door blow the player can HEAR but not see
    // an arm raised for would read as the wall breaking itself.
    if (this.state === 'ATTACK' || this.state === 'BREACH' || this.state === 'BANG') {
      const atk = this.state === 'ATTACK';
      const bang = this.state === 'BANG';
      const period = atk ? ATTACK_WINDUP : bang ? BANG_CADENCE : 0.85;
      const left = atk ? (this._wind ?? ATTACK_WINDUP) : bang ? (this._bangT ?? BANG_CADENCE) : (this._swing ?? 0.85);
      const s = Math.max(0, 1 - left / period);
      pose.shoulderR = [2.0 - s * 3.2, 0, 0.3];
      pose.elbowR = [-1.2 + s * 1.0, 0, 0];
      pose.spine = [(base.spine?.[0] ?? 0) - 0.2 + s * 0.4, 0, 0];
    }

    // THE SCAN HAS TO BE VISIBLE. `_scanStep` swings the sense cone across the direction of
    // travel; putting the same offset through the neck and head means the player can watch
    // it look, which is the difference between an AI that searches and an AI that seems to.
    // Split across two joints so the whole head does not swivel like a turret.
    const sc = this.scan;
    pose.neck = [pose.neck?.[0] ?? 0, (pose.neck?.[1] ?? 0) + sc * 0.58, pose.neck?.[2] ?? 0];
    pose.head = [pose.head?.[0] ?? 0, (pose.head?.[1] ?? 0) + sc * 0.42, pose.head?.[2] ?? 0];

    // ALERT is a posture, not just a stop: it comes up out of the hunch and holds still.
    if (this.state === 'ALERT') {
      const k = 0.55;
      for (const j of ['spine', 'chest', 'neck']) {
        const p = pose[j] ?? [0, 0, 0];
        pose[j] = [p[0] * (1 - k * 0.6), p[1], p[2]];
      }
    }
    rig.setPose(pose);
    if (this._pull) this._pullStep(dt);
  }

  /**
   * Scene membership for the eye light — with a LINGER, and the linger is the whole point.
   *
   * Adding or removing a light changes `numPointLights`, which is part of three.js's program
   * cache key, so every toggle is a SHADER RECOMPILE of every material in the scene. The
   * original code toggled only on a stagger or a growth, which is rare. Driving it from
   * awareness made it toggle whenever the hunter crossed the STALK threshold — many times a
   * round — and a 28 s capture run went from a clean 1.28 ms GPU to killing the renderer
   * outright ("execution context destroyed"), with a 2.5 s worst frame recorded on the way.
   *
   * So it goes in immediately when it is wanted and comes out only after `LINGER` seconds of
   * being unwanted. A round pays a handful of recompiles instead of hundreds, and the light
   * still leaves the scene when the hunter is genuinely done with you.
   */
  _setFlare(on) {
    if (on) {
      this._flareOff = 0;
      if (!this._flareOn) { this._flareOn = true; this.root.add(this.flare); }
      return;
    }
    if (!this._flareOn) return;
    this._flareOff = (this._flareOff ?? 0) + (this._lastDt ?? 0.016);
    if (this._flareOff < 2.5) return;
    this._flareOn = false;
    this.flare.removeFromParent();
  }

  dispose() { for (const s of [1, 2, 3]) this.rigs[s].dispose(); }
}

/** The authored posture from hunter.js, reconstructed so the gait can be added to it. */
export function hunterBasePose(def) {
  const h = def.hunch;
  return {
    spine: [h * 0.85, 0, 0], chest: [h * 0.70, 0, 0], neck: [-h * 1.15, 0, 0], head: [-h * 0.35, 0, 0],
    shoulderL: [h * 1.15, 0, -(0.15 + h * 0.14)], shoulderR: [h * 1.15, 0, (0.15 + h * 0.14)],
    elbowL: [0.26 + h * 0.42, 0, -0.06], elbowR: [0.26 + h * 0.42, 0, 0.06],
    hipL: [-h * 0.35, 0, 0.10], hipR: [-h * 0.35, 0, -0.10],
    kneeL: [h * 0.65, 0, 0], kneeR: [h * 0.65, 0, 0],
    ankleL: [-h * 0.30, 0, 0], ankleR: [-h * 0.30, 0, 0],
  };
}

function ease(k) { return k * k * (3 - 2 * k); }
