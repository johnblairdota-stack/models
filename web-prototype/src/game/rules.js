/**
 * GAME RULES — the numbers both the client and the authoritative server must agree on.
 *
 * This module deliberately imports NOTHING. `net/server.mjs` runs it in bare node with no
 * three.js and no DOM, and the client runs the identical file, so a rule can never drift
 * between the two. Anything that needs a Vector3 belongs somewhere else.
 */

// ---------------------------------------------------------------------------
// Sockets: a body is four sockets and nothing else. There is no health bar.
// ---------------------------------------------------------------------------
export const SOCKETS = ['shoulderL', 'shoulderR', 'hipL', 'hipR'];
export const SOCKET_KIND = { shoulderL: 'arm', shoulderR: 'arm', hipL: 'leg', hipR: 'leg' };
export const LIMB_IDS = ['armL', 'armR', 'legL', 'legR'];
/** unit4h limb id -> the socket it lives in. */
export const LIMB_SOCKET = { armL: 'shoulderL', armR: 'shoulderR', legL: 'hipL', legR: 'hipR' };
export const SOCKET_LIMB = { shoulderL: 'armL', shoulderR: 'armR', hipL: 'legL', hipR: 'legR' };

/**
 * Gadgets that REPLACE an arm. Fitting one costs you that arm — that is the whole point of
 * the loadout system, so it is enforced in `LimbRig.fitGadget`, not left to the caller.
 */
export const ARM_GADGETS = ['nailgun', 'oil', 'grapple', 'ball'];
/**
 * Rocket skates are the exception and the reason the exception exists is in the geometry:
 * `buildGadget('skates')` returns socket `'shinBoth'` and mounts at ankle height on the
 * robot's own legs. So skates are not a limb replacement, they are fitted OVER both legs —
 * and therefore require both legs to still be attached. Lose a leg while skating and they
 * come off with it. The tradeoff is real either way: skating is fast and cannot stop.
 */
export const LEG_GADGETS = ['skates'];
export const ALL_GADGETS = [...ARM_GADGETS, ...LEG_GADGETS];

// ---------------------------------------------------------------------------
// Damage. The client names the weapon; the server owns the number.
// ---------------------------------------------------------------------------
export const WEAPON_DAMAGE = {
  fist: 14,        // an attached hand
  limbClub: 34,    // swinging your own detached leg — Dev Art 1785319916301
  nailgun: 26,
  oil: 52,         // burns through plaster fast
  ball: 9,         // bouncy balls barely scratch a wall; they are for reaching things
  grapple: 18,
  skates: 40,      // a rocket-skate body slam
  hunterSlam: 46,  // the hunter opens its own routes — see hunter-ai.js
  /**
   * THE SLEDGEHAMMER — `src/game/sledge.js`. A two-handed dig tool, not a fight weapon
   * (`docs/slices/task-sledge.md`: "the hammer is what you dig with, the limb is what you
   * fight with"). Its real wall-clearing channel is `DestructibleWall.applyHit(point, power)`
   * (`wall.js`), called directly at full power (1.0) on every swing — that method is "safe to
   * call on any panel" by its own doc and does its own hp accounting internally, so this
   * number is NOT read on that path. It is recorded here anyway, in the existing shape,
   * because rules.js is the one place client and server may ever agree on a weapon's numbers
   * — for a future body hit (staggering the hunter) or a fielded-less panel that some other
   * caller reaches through the ordinary `panel.damage(dmg)` path. Kept a shade under the club
   * (34) on purpose: the hammer must not be a strict upgrade over the thing the game's
   * identity is built on.
   */
  sledge: 30,
};

/** Range in metres. A club has reach; a nail gun crosses a room. */
export const WEAPON_RANGE = {
  fist: 1.15, limbClub: 1.95, nailgun: 22, oil: 12, ball: 18, grapple: 26, skates: 1.6, hunterSlam: 2.4,
  // Shorter than the club (1.95) — a hammer is a committed downward strike into whatever is
  // right in front of the robot, not a wide swing with reach. Used as the cast distance that
  // finds a wall panel under the animated head at contact — see `Player._resolveSledgeHit`.
  sledge: 1.55,
};

/** Seconds between shots. */
export const WEAPON_COOLDOWN = {
  fist: 0.55, limbClub: 0.72, nailgun: 0.13, oil: 1.05, ball: 0.28, grapple: 1.4, skates: 1.2, hunterSlam: 1.5,
  // Slower than the club (0.72) — heavier, more telegraphed, and the number John's own band
  // ("roughly a blow a second") is tuned against directly: this IS the live gate on swing
  // cadence (`Player.attack`'s `_fireCd`), unlike DAMAGE/RANGE above which are recorded for
  // shape-consistency but not yet read on the wall path.
  sledge: 0.95,
};

// ---------------------------------------------------------------------------
// Locomotion. Losing a leg has to be felt, not annotated.
// ---------------------------------------------------------------------------
export const MOVE = {
  walk: 2.55,
  run: 5.20,
  // one leg: a hop-and-drag. No run at all — that is the consequence.
  limpScale: 0.44,
  // no legs: dragging yourself on your hands. Needs at least one arm.
  crawlScale: 0.155,
  // skates carry momentum and cannot turn on the spot
  skateTop: 9.0,
  skateAccel: 6.2,
  skateBrake: 0.55,
  skateGrip: 2.4,       // how hard the skate resists sideways slip (low = drifty)
  accel: 22.0,
  decel: 16.0,
  turnRate: 3.4,        // rad/s the body chases the aim direction on foot
  eyeHeight: 0.905,     // fraction of body height
};

/** Which gait a body is capable of, given what is still attached. */
export function gaitFor({ legs, arms, skates }) {
  if (legs === 0) return arms > 0 ? 'crawl' : 'down';
  if (skates && legs === 2) return 'skate';
  if (legs === 1) return 'limp';
  return 'walk';
}

export function speedScaleFor(gait) {
  switch (gait) {
    case 'walk': return 1;
    case 'limp': return MOVE.limpScale;
    case 'crawl': return MOVE.crawlScale;
    case 'skate': return 1;
    default: return 0;
  }
}

// ---------------------------------------------------------------------------
// Hunter growth. Absorbing parts is the escalation loop.
// ---------------------------------------------------------------------------
export const HUNTER_GROWTH = { toStage2: 3, toStage3: 7 };
export function hunterStageFor(absorbed) {
  return absorbed >= HUNTER_GROWTH.toStage3 ? 3 : absorbed >= HUNTER_GROWTH.toStage2 ? 2 : 1;
}
export const HUNTER_SPEED = [0, 2.05, 2.70, 3.35];   // indexed by stage

/**
 * WHAT THE HUNTER CAN PERCEIVE — and, measured in play, what it could not.
 *
 * A play-critic reported the hunter waking at ~5.3 m against a `sightRange` of 26, and the
 * numbers here were never sourced. Re-measured by driving the real game and recomputing every
 * gate per frame (`harness/scenarios/diag-sense.mjs`), the wake distance is not a constant at
 * all — it was 11.0 m in the measured session — and three separate defects were producing it:
 *
 *  1. THE FOV GATE REJECTED EVERY PRE-WAKE FRAME. Over the whole approach the dot product
 *     between the hunter's facing and the direction to the player measured 0.11–0.16 against
 *     a required 0.498, because PATROL steers a figure-of-eight and `facing` follows velocity
 *     — so a hunter sweeping across the far hall spends its patrol looking at the side walls.
 *     It woke when its own path happened to swing its nose down the hall (dot 0.12 -> 0.99
 *     inside 0.4 s). The wake distance was therefore luck, not range. Fixed by scanning the
 *     head across the direction of travel (`HunterAI._scanStep`) and by a `peripheral`
 *     radius inside which facing does not matter.
 *  2. HEARING WAS NOT HEARING. `_sense` computed `close = d < hearRange * 0.45` — an
 *     undocumented 0.45 that turned a stated 14 m into an effective 6.3 m — and then ran the
 *     SAME `blocksSight` rejection over it, so the "hearing" path could not hear through a
 *     wall, which is the only place hearing is worth having. Hearing is now its own test, is
 *     not gated on line of sight, and scales with how much noise the target is actually
 *     making (`Player.noise`), so standing still is a real move.
 *  3. THERE WAS NO APPROACH. `_sense` set PURSUE the instant any contact passed, so the
 *     hunter went from unaware to full-speed-at-your-throat in one frame with no state in
 *     between, and it dropped straight back to SEARCH after `loseAfter` even at 1.9 m
 *     (measured: LOS was blocked for 2.3 s continuously while it stood 2 m away on the far
 *     side of the divider). Contact now feeds an `awareness` ramp with ALERT and STALK
 *     between unaware and committed.
 */
/**
 * 🕳️ **HOW MUCH CLEAR HEIGHT A BODY NEEDS TO PASS UNDER SOMETHING.** The vertical twin of
 * `connectors.js`'s `clearWidth()`, and it exists for exactly the same reason D7's 1.20 m does:
 * **a mechanic expressed as a number in a table**, in one place, so nothing between the table and
 * the collision test is allowed to round it, default it or forget it.
 *
 * `docs/design/dig.md` §5: *"a gap at the BASE of the wall is a passage on the floor plane, and
 * the robots are small... which means the interconnect can be too low for the hunter."*
 *
 * ⚠️ **`hunter` IS NOT THE HUNTER'S BODY HEIGHT AND MUST NOT BE "FIXED" INTO ONE.** The body is
 * `1.7 x scale` = 2.295 / 3.23 / 4.42 m, and **every doorway in the house is 2.72 m** — so a
 * literal body height would wall a stage-2 hunter into whatever room it was standing in and the
 * AI would read as broken from the first growth onward. What this number means is *"a hunter
 * needs more room than a robot, and how much more is authored"*. 2.40 sits above `dig.js`'s 1.80
 * segment and below every authored opening in the house (2.68 connector, 2.72 doorway), so:
 *
 *   · **the shipped build cannot notice it** — no collider in a `?dig=0` house has a base
 *     between 1.70 and 2.40, which `dig-low.mjs` asserts rather than assumes;
 *   · a dug segment excludes the hunter at EVERY stage, including stage 1. That is on purpose:
 *     the dig network is robot-scale, so the hunter's way through a wall is its own full-height
 *     hole (`room.hunterBreach`) and not a tunnel you made for it.
 *
 * ⚠️ Stage-varying it — a stage-1 hunter fitting a 1.80 gap and stages 2-3 not — was considered
 * and rejected: it INVERTS D7 (growth would hand the player a refuge instead of taking one away)
 * and makes the late game safer, which is the wrong direction for a horror curve.
 */
export const PASS_H = { robot: 1.70, hunter: 2.40 };

/**
 * 🪜 **HOW HIGH A SILL A BODY STEPS OVER RATHER THAN WALKS INTO.** `PASS_H`'s twin at the other
 * end of the same opening, and it lives here for the same reason: a mechanic expressed as a
 * number in a table, in one place, so nothing between the table and the collision test may
 * round it, default it or forget it.
 *
 * John, after playtesting (2026-08-10): *"if the wall has just the bottom intact because we
 * attacked in the middle the wall can't be passed."* That is the whole reason this stopped being
 * a literal `0.3` inside `room.js` `boxesNear`. The dig rewards an UNDERCUT (`support.js`), the
 * third-person boom makes looking down awkward, and the swing ray's own 0.18 of downward tilt
 * means a blow thrown at a LEVEL look still lands at ~1.45 m and bottoms out at ~0.93 m — so the
 * shipped game asks the player to aim at a place the camera fights them for, and charges them a
 * whole passage for missing it.
 *
 * ---------------------------------------------------------------------------
 * 🚨 **THE PLAYER'S NUMBER MOVED AND THE HUNTER'S DID NOT, AND THAT IS A DECISION, NOT AN
 * OVERSIGHT.**
 *
 * `PASS_H`'s own note already settles which way this has to go: *"a dug segment excludes the
 * hunter at EVERY stage, including stage 1. That is on purpose: the dig network is robot-scale,
 * so the hunter's way through a wall is its own full-height hole (`room.hunterBreach`) and not a
 * tunnel you made for it."* A step-up is the same sentence on the vertical axis at the other end
 * — **the player's holes stay player-scale** — so sharing it would be the change that needs
 * defending, not withholding it.
 *
 * ⚠️ **AND THE GRAPH STAYS HONEST BECAUSE OF WHICH BODY READS IT.** `room.pathPortals()` is the
 * hunter's BFS and nothing else's (`hunter-ai.js` is its only caller in `src/`); it sizes a
 * breach with `panel.openChannel()`, which measures the channel from **0.30 m**. That is the
 * hunter's own step, so the graph and `collide(..., PASS_H.hunter, STEP_H.hunter)` are computed
 * at the same number and cannot disagree. The player does no pathfinding at all, so there is no
 * second graph to drift.
 *
 * ⚠️ **IT IS NOT A REFUGE MECHANIC, AND THAT IS CHECKED RATHER THAN ARGUED.** A refuge would need
 * a space the player can reach and the hunter cannot; the house's OPEN connectors already make
 * every space hunter-reachable from every other with no dig involved, so a hole the player can
 * step and the hunter cannot buys a shortcut, never a sanctuary. `harness/scenarios/aim-step.mjs`
 * S5 asserts exactly that over the whole space graph, and fails if the door graph is ever cut.
 *
 * ---------------------------------------------------------------------------
 * 🪜 **WHY 0.55, MEASURED AGAINST THE HOUSE RATHER THAN CHOSEN BY EYE**
 * (`harness/scenarios/_aim1-steppable.mjs`, the live estate, 223 collider boxes):
 *
 *   · **the band (0.30, 1.00] m is EMPTY.** Nothing in the house — not one collider, not one
 *     panel box — has a top in it. The lowest static collider in the estate is **1.05 m** (the
 *     study and ballroom plinths). So raising the player's step to anything under a metre makes
 *     **nothing** in the shipped house walkable that was not already, and the only thing it can
 *     newly admit is a dug wall remnant, which is the point.
 *   · the live census read the exterior's lowest solid at **3.80 m** on `seed=s4`, but only the
 *     LIVE yard registers colliders, so that is one yard and not the set. Read off the source
 *     instead (`exterior.js` `buildYard`), the lowest thing the exterior can ever register is the
 *     **garden basin at 0.70 m**, on `kind === 'garden'` sites. 0.55 keeps **0.15 m** of margin
 *     under it, so the basin stays an obstacle on every yard. ⚠️ **That one is sourced, not
 *     measured** — if the step is ever raised again, walk a garden yard first.
 *   · 0.55 clears `damagefield.js`'s `BRUSH_R` (0.52 m), so a sill no taller than ONE BRUSH
 *     RADIUS is steppable — i.e. *if your mark's bottom edge is on the floor, you are through*,
 *     which is the rule the mark teaches and the only rule a player has to learn.
 *   · standing on a 0.55 m sill a body needs clear height to 0.55 + 1.70 = **2.25 m**, inside
 *     `dig.js`'s 2.80 m band with 0.55 m to spare, so the step can never demand headroom the dig
 *     band does not have.
 *
 * ⚠️ **AND IT CANNOT BE USED TO WALK THROUGH THE CYAN.** `room.js` `boxesNear` refuses to step
 * over any panel box that holds a barrier cell — checked against `field.barrier` over the box's
 * own rect, not by margin — and falls back to the shipped 0.30 for it. John has settled the cyan
 * twice and this does not touch it.
 *
 * ⚠️ **THERE IS NO VERTICAL AXIS IN THE MOVEMENT MODEL** (`Player.update` pins `pos.y` to
 * `floorY`), so "step" here means the collision test ignores the sill, not that a body rises onto
 * anything. Nothing can be climbed ONTO — no ledge, no roof, no debris drift, no way out of the
 * level — because there is nowhere to climb to. `Player._stepLift` raises the MODEL over a sill
 * it is standing in so the pass reads as a step rather than as clipping; it moves no collision.
 */
export const STEP_H = { robot: 0.55, hunter: 0.30 };

export const HUNTER_SENSE = {
  sightRange: 26,
  fovCos: Math.cos(1.05),   // ~60 deg half-angle, about the scanning head direction
  /** Inside this, it does not have to be looking at you. An arm's length is not stealth. */
  peripheral: 3.6,
  /** Metres at FULL noise. A walking robot makes ~0.49, so it is heard at about 7 m. */
  hearRange: 14,
  /** Below this the target is inaudible however close it is. Standing still is silence. */
  hearFloor: 0.03,
  loseAfter: 2.2,           // seconds of no contact before it drops to SEARCH
  searchFor: 9.0,           // seconds of searching before it gives up
  reach: 2.05,

  // ---- awareness ramp. This is the "something is coming" phase, in seconds.
  //
  // TWO RATES, NOT ONE — and the split is the whole point. Measured on the single-rate curve
  // it replaced (`harness/scenarios/diag-fair.mjs`, `DIAG=sweep`, hunter pinned and head-locked
  // in the gallery, player silent):
  //
  //     d      t ALERT   t PURSUE   ALERT->PURSUE
  //     4 m     0.17 s     0.74 s       0.58 s
  //    24 m     0.47 s     2.05 s       1.58 s
  //
  // Six times the distance bought the player 1.0 s. The gallery is 27 m long and A3's whole
  // reason for existing is a 24 m first glimpse, so the level's most expensive piece of
  // geometry was worth one extra second — that is what "distance does not matter" looks like
  // as a number.
  //
  // The naive fix — scale the whole ramp by distance — makes the game WORSE, and it is worth
  // writing down why so nobody re-tries it. The player's warning is not the ramp, it is the
  // gap between the TELL and the COMMITMENT. Slow the whole ramp and the tell slides late
  // with everything else: at 24 m the hunter would stand there for five seconds before its
  // eye ever came up, and a warning you cannot see is not a warning. So:
  //
  //   NOTICE (awareness below `alertAt`) — "is something there?". A lit robot moving in a
  //     dark room is about as noticeable at 20 m as at 5 m, so this keeps the original linear
  //     ramp UNCHANGED, and the tell therefore fires at exactly the same moment it always did
  //     at every range. Every measured first-ALERT number in HANDOFF survives by construction.
  //
  //   CONFIRM (`alertAt` -> `commitAt`) — "where exactly, and can I reach it?". That is an
  //     apparent-size problem and it falls off as 1/d², clamped inside `confirmNearD` (a robot
  //     three metres away already fills the view; closer adds nothing) and floored at
  //     `confirmFar` so a patient hunter still eventually commits from across the house
  //     rather than going inert at range.
  //
  /** NOTICE, per second, at max range and at zero range. Unchanged — see above. */
  noticeFar: 0.40,
  noticeNear: 1.55,
  /**
   * CONFIRM, per second: `confirmFar + confirmNear * (confirmNearD / max(d, confirmNearD))²`.
   * At or inside `confirmNearD` this is 1.39/s and ALERT->PURSUE is 0.56 s — the 0.58 s the
   * old curve gave at knife range, so close quarters is untouched. At 24 m it is 0.061/s.
   */
  confirmNear: 1.35,
  confirmNearD: 3.0,
  confirmFar: 0.04,
  /** Sound gets it looking; only sight sends it running. Capped below the commit threshold. */
  soundGain: 0.42,
  soundCeiling: 0.86,
  /** Per second, with no contact at all. ~3.6 s from committed to bored. */
  forget: 0.28,
  alertAt: 0.22,            // stops, turns, eye lights: the tell
  stalkAt: 0.55,            // starts closing, slowly
  commitAt: 1.00,           // full speed
};

/**
 * Awareness gained per second by SEEING a target `d` metres away, given how sure the hunter
 * already is. Lives here rather than in `hunter-ai.js` for the reason at the top of this file:
 * `net/server.mjs` has to agree with the client about what the hunter can perceive, and a
 * curve that existed in only one of them would drift.
 *
 * NOT a lookup — call it every frame. The rate changes as the hunter closes AND as it becomes
 * surer, and both halves of that are deliberate.
 */
export function hunterSightGain(d, awareness) {
  const S = HUNTER_SENSE;
  if (awareness < S.alertAt) {
    const k = 1 - Math.min(1, d / S.sightRange);
    return S.noticeFar + (S.noticeNear - S.noticeFar) * k;
  }
  // Inverse-square, written as one multiply so there is no exponent knob to be tempted by.
  const r = S.confirmNearD / Math.max(d, S.confirmNearD);
  return S.confirmFar + S.confirmNear * r * r;
}
