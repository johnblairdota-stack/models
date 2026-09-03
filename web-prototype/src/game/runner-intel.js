/**
 * 🚶 **RUNNER INTEL — the runner WALKS THE GUIDE'S PIN. The thumb only steps sideways.**
 *
 * John, sofa 2026-09-01 (~10:20pm Brisbane), unlocking the camera-mount WANDER pass:
 *
 *   1. *"AUTO-WALK the guide's pin, one door at a time. NOT auto-walk to the true camera —
 *      that kills the lie."*
 *   2. *"Runner STICK is a lateral dodge only. Left/right into cover. HOLD to hide behind
 *      furniture. Release resumes pathfinding to the pin. Cannot steer into another room."*
 *   3. *"Hide is deniable only if the TV sometimes shows a reason: a staged RED PASS down the
 *      hall. Clock still runs while hidden."*
 *   4. *"Evil runner sabotages at the JOB after walking like a good person… No sabotage button.
 *      No stop-in-open-hall without cover."*
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 **WHY THIS IS A PURE MODULE AND NOT SIX BLOCKS INSIDE `follow-bed.js`.**
 * ---------------------------------------------------------------------------------------------
 * Rung 3's lesson, and `intel-pad.js` after it: a rule that only exists inside a browser view has
 * only ever been checked by opening tabs. Every decision below — when to replan, how far a dodge
 * may reach, whether a hide is DENIABLE, what the recap is allowed to say about it — is a
 * function here, and `harness/runner-intel.mjs` executes these exact functions. There is no THREE
 * and no DOM in this file on purpose.
 *
 * `follow-bed.js` keeps the things that genuinely need the scene: `room.pathPortals`, the
 * collider, the sledge ray. It passes their ANSWERS in and gets a decision back.
 *
 * ---------------------------------------------------------------------------------------------
 * 🧭 **D4 STILL HOLDS, AND AUTO-WALK IS NOT ITS VIOLATION.**
 * ---------------------------------------------------------------------------------------------
 * `docs/slices/task-runner-intel.md` D4: *"if you can print the runner's whole future at spawn
 * time, you built the wrong thing."* You cannot. There is no pin at spawn; the legs below exist
 * only between one `pathPortals` call and the next, they are thrown away whenever the guide taps
 * a different door (D2 — a pin REPLACES), and the pin is one door deep by construction because
 * `intel-pad.js` `neighbourScope` has nowhere to put a second hop. The runner's future is exactly
 * as long as the guide's last sentence.
 *
 * ⚠️ **AND THE PIN IS NOT THE TARGET.** John's own reason: auto-walking to the true camera
 * *"kills the lie"*. The brain never reads `mission.room`, never resolves the twin faces and has
 * no idea which one is real. It walks to a doorway a human tapped. If nobody pins, nobody moves —
 * that is the guide having a reason to exist, not a stall.
 */

/* =================================================================================================
 * AUTO-WALK
 * ============================================================================================== */

/**
 * The walk's numbers.
 *
 * `arrive` is deliberately larger than `follow-bed.js`'s old `ARRIVE`: a leg here is a DOORWAY
 * CENTRE, and a body that must touch the exact centre of an opening squeezes against the jamb
 * rather than walking through. `stallGain` / `stallSec` are D3's third replan trigger, unchanged.
 * `square` is the smash window from the slice's §6 — stop there and face it, or the hammer fires
 * into the wall beside the painting and the fail reads as "forgot the route".
 */
export const AUTOWALK = Object.freeze({
  arrive: 0.85,
  stallGain: 0.75,
  stallSec: 2.0,
  square: 0.80,
  /** Heading lag. `follow-bed.js:1625-1645`'s constant, kept — a body that snaps reads as a cursor. */
  lag: 5.5,
});

/** D3's four replan triggers, and there are no others. Read by the gate rather than copied. */
export const REPLAN_TRIGGERS = Object.freeze(['pin', 'phase', 'legs', 'stall']);

/**
 * A pin's identity, so "did the pin change" is one string compare and not a deep equal.
 *
 * ⚠️ **`kind` JOINED THE KEY WHEN OBJECTIVE PINS LANDED (2026-09-02), AND IT HAD TO.** Coordinates
 * alone were a complete identity while every pin was a doorway. They stopped being one the moment
 * a pin could name a TARGET: an objective pin's `x`/`z` are a bearing hint the phone computed, the
 * body resolves the NAME instead (`follow-bed.js` `resolveObjective`), and two chips that happened
 * to hint at the same point — or a phone that sent the same hint twice with a different kind —
 * would have read as "no change" and left the runner walking at the previous target with the board
 * showing the new one. The kind is the instruction, so the kind is part of the key.
 */
export function pinKey(pin) {
  if (!pin || !Number.isFinite(Number(pin.x)) || !Number.isFinite(Number(pin.z))) return '';
  return Number(pin.x).toFixed(2) + '|' + Number(pin.z).toFixed(2)
    + '|' + String(pin.roomId ?? '') + '|' + String(pin.kind ?? '');
}

/**
 * Why we must re-ask the house, or `null` to keep walking the legs we have.
 *
 * 🚨 **THE ORDER IS THE PRIORITY AND `pin` IS FIRST.** D2 says a second tap replaces; if `stall`
 * were tested first, a guide who re-pinned while the runner was wedged on a chair would get a
 * replan REPORTED as a stall, and R4 (*no leg survives a pin change*) would be satisfied by
 * accident rather than by rule.
 *
 * @param {{pinKey:string, phase:string, legs:number, since:number, gained:number}} prev
 * @param {{pinKey:string, phase:string, legs:number, since:number, gained:number}} now
 */
export function replanReason(prev, now) {
  if (!prev || !now) return 'pin';
  if (String(prev.pinKey ?? '') !== String(now.pinKey ?? '')) return 'pin';
  if (String(prev.phase ?? '') !== String(now.phase ?? '')) return 'phase';
  if (!(Number(now.legs) > 0)) return 'legs';
  if (Number(now.since) >= AUTOWALK.stallSec && Number(now.gained) < AUTOWALK.stallGain) return 'stall';
  return null;
}

/**
 * The legs, from a LIVE `pathPortals` answer plus the goal.
 *
 * ⚠️ **THE CALLER PASSES THE PORTAL CENTRES IN.** D3 makes `room.pathPortals(from, goal, …)`
 * legal precisely because it re-reads the house as it is now — a breached wall, a chained door, a
 * doorway that opened this second. Caching that answer anywhere would turn a live query into the
 * memorised route D4 forbids, so this takes the answer and returns a fresh array every time.
 */
export function legsFor(portalCentres, goal) {
  const legs = [];
  for (const p of portalCentres ?? []) {
    const c = p?.centre ?? p;
    if (c && Number.isFinite(Number(c.x)) && Number.isFinite(Number(c.z))) {
      const roomId = p?.roomId ?? p?.id ?? (p?.a && p?.b ? `${p.a}>${p.b}` : '');
      legs.push({ x: Number(c.x), z: Number(c.z), roomId: String(roomId ?? '') });
    }
  }
  if (goal && Number.isFinite(Number(goal.x)) && Number.isFinite(Number(goal.z))) {
    legs.push({ x: Number(goal.x), z: Number(goal.z), roomId: String(goal.roomId ?? '') });
  }
  return legs;
}

/**
 * Identity of a walk leg. Same two-decimal shape as `pinKey`, plus `roomId`, so a stall
 * replan can refuse the doorway that just failed without comparing object identity.
 */
export function legKey(leg) {
  if (!leg || !Number.isFinite(Number(leg.x)) || !Number.isFinite(Number(leg.z))) return '';
  return Number(leg.x).toFixed(2) + '|' + Number(leg.z).toFixed(2)
    + '|' + String(leg.roomId ?? '');
}

/**
 * A point beside the snag, not the snag. Perpendicular to the blocked heading so the
 * first new leg cannot be the (x, z, roomId) that just failed.
 */
function sidestepOf(from, blocked, goal, sign = 1) {
  const at = from && Number.isFinite(Number(from.x)) && Number.isFinite(Number(from.z))
    ? from : blocked;
  if (!at || !Number.isFinite(Number(at.x)) || !Number.isFinite(Number(at.z))) return null;
  const tx = Number((goal && Number.isFinite(goal.x) ? goal.x : blocked?.x) ?? at.x) - Number(at.x);
  const tz = Number((goal && Number.isFinite(goal.z) ? goal.z : blocked?.z) ?? at.z) - Number(at.z);
  const len = Math.hypot(tx, tz) || 1;
  const SIDE = 1.15 * (sign < 0 ? -1 : 1);
  return {
    x: Number(at.x) + (-tz / len) * SIDE,
    z: Number(at.z) + (tx / len) * SIDE,
    roomId: String(at.roomId ?? blocked?.roomId ?? ''),
  };
}

/**
 * Stall replan from HERE. Live `pathPortals` still answers the blocked doorway first —
 * that is a green RI1 and a stuck CAST night. Drop that identity. If the only remaining
 * target is the snag itself (furniture in front of a pin), sidestep then walk the pin.
 *
 * ⚠️ **THIS DOES NOT WALK THE TRUE CAMERA.** The goal is still the guide's pin.
 */
export function unstickLegs(portalCentres, goal, blocked, from) {
  const raw = legsFor(portalCentres, goal);
  const blockedList = Array.isArray(blocked) ? blocked : (blocked ? [blocked] : []);
  const skips = new Set(blockedList.map(legKey).filter(Boolean));
  if (!skips.size) return raw;
  const rest = raw.filter((leg) => !skips.has(legKey(leg)));
  if (rest.length && !skips.has(legKey(rest[0]))) return rest;
  const last = blockedList[blockedList.length - 1];
  const sides = [sidestepOf(from, last, goal, 1), sidestepOf(from, last, goal, -1)]
    .filter((s) => s && legKey(s) && !skips.has(legKey(s)));
  const fallback = rest.length
    ? rest
    : (goal && Number.isFinite(Number(goal.x)) && Number.isFinite(Number(goal.z))
      ? [{ x: Number(goal.x), z: Number(goal.z), roomId: String(goal.roomId ?? '') }]
      : []);
  const used = new Set(sides.map(legKey));
  const tail = fallback.filter((l) => !used.has(legKey(l)));
  if (sides.length) return [...sides, ...tail];
  if (tail.length > 1 && skips.has(legKey(tail[0]))) return tail.slice(1);
  return tail;
}

/**
 * Pin walk / job finish clocks recap. Expedition chrome may only hold for a
 * walking or hidden body, or an in-progress job. A wedged body is a defect.
 * Host `]` is not a product walk — CAST9/CAST10 pinClocksRecap.skip was that skip.
 *
 * ⚠️ **CAST10 (H404/H442): arriving at the pin clocks, even while still `seek`.**
 * 78's function only clocked `return` / `done`. CAST bots pin a door, walk it,
 * never smash or drill, and sat in seek until ~100s then TV `]`. H442's product
 * walk is sendoff → pinned door → recap. A fake `return` in a gate is not that.
 *
 * `return` is the smash or a finished mount. `done` is already home. `arrived`
 * is the body on the pin. Any of those clocks. Hidden still holds. `skip` stays
 * false — do not licensed-skip a 100s sit. `pinPad=false` during the walk is a
 * defect (H443) and is reported, never excused.
 */
export function pinClocksRecap({
  phase, walking = false, hidden = false, arrived = false, pinPad = true,
} = {}) {
  const p = String(phase || '');
  const pad = pinPad !== false;
  if (p === 'done' || p === 'return') return { clock: true, skip: false, pinPad: pad };
  if (hidden) return { clock: false, skip: false, pinPad: pad };
  if (arrived) return { clock: true, skip: false, pinPad: pad };
  if (walking) return { clock: false, skip: false, pinPad: pad };
  return { clock: false, skip: false, pinPad: pad };
}

/**
 * Guide pin pad stays live on the walk. CAST10 H443 photographed `pinPad=false`
 * while the runner was on the pin path — the chips were gone, so she could not
 * re-pin a wedged body. Scope (seed + you-mark) is what `guidePinPad` needs;
 * without it the pad used to be an empty string. This does not invent a TV map.
 *
 * ⚠️ **CAST11 H480: `painted` is the bar, not `hasScope: true`.** 80's
 * `pinPadLive({ hasScope: true }) === true` in a harness is a licensed skip
 * when the painted pad is still false. The phone quotes the DOM `[data-pin-pad]`;
 * a hardcoded true here is not that photograph.
 */
export function pinPadLive({ role, hasScope = false, painted } = {}) {
  if (String(role || '') !== 'guide') return true;
  if (painted !== undefined) return !!painted;
  return !!hasScope;
}

/**
 * Photograph clock of pins the guide tapped. D2 still holds: the PRODUCT pin
 * is one slot and a second tap REPLACES it. This array is the CAST tick log
 * (`pin[]`), not a route — auto-walk still reads the one current pin.
 * CAST11 H480 `pin=[]` all night is the empty clock, not a missing function.
 */
export function clockPin(pins, pin) {
  const list = Array.isArray(pins) ? pins.slice() : [];
  if (!pin || !Number.isFinite(Number(pin.x)) || !Number.isFinite(Number(pin.z))) return list;
  const next = {
    x: Number(pin.x),
    z: Number(pin.z),
    roomId: String(pin.roomId || ''),
    kind: String(pin.kind || pin.pinKind || 'room'),
  };
  const key = pinKey(next);
  if (!key) return list;
  const i = list.findIndex((p) => pinKey(p) === key);
  if (i >= 0) list[i] = next;
  else list.push(next);
  return list;
}

/** Drop every leg already reached. Mutating, because the caller owns the array. */
export function consumeLegs(legs, at, r = AUTOWALK.arrive) {
  if (!Array.isArray(legs) || !at) return legs ?? [];
  while (legs.length && Math.hypot(legs[0].x - at.x, legs[0].z - at.z) < r) legs.shift();
  return legs;
}

/** House yaw convention: forward is `(sin y, cos y)`. The same atan2 the bed already writes. */
export function headingTo(at, leg) {
  if (!at || !leg) return null;
  return Math.atan2(leg.x - at.x, leg.z - at.z);
}

/** Lag a heading toward a want, exponentially. The bed's own constant, moved so a gate can run it. */
export function lagHeading(cur, want, dt) {
  if (want == null) return Number(cur) || 0;
  const c = Number(cur) || 0;
  const d = Math.atan2(Math.sin(want - c), Math.cos(want - c));
  return c + d * (1 - Math.exp(-AUTOWALK.lag * (Number(dt) || 0)));
}

/* =================================================================================================
 * THE THUMB · a lateral dodge, and NOTHING ELSE
 * ============================================================================================== */

/**
 * The dodge's numbers.
 *
 * `reach` is one body-and-a-half of authority. It is small on purpose: John's rule is *"left or
 * right into cover"*, not a second steering wheel, and a lateral big enough to cross a room would
 * let a runner walk the whole house sideways with the forward drive doing the work.
 */
export const DODGE = Object.freeze({
  /** Max lateral thumb authority, as a fraction of the body's full stick. */
  reach: 0.62,
  /** How fast the lateral smooths toward the thumb, per second. */
  rate: 6.0,
  /** Deadzone, matching the pad's own. */
  dead: 0.14,
  /** How far ahead the room test probes, in metres. See `clampToRoom`. */
  probe: 0.95,
});

/**
 * 🚨 **`y` IS THROWN AWAY HERE AND THAT IS THE WHOLE LOCK.**
 *
 * The pad still sends a 2-axis stick — the wire did not need to change and `moveViolations` still
 * validates both — but the forward axis is the AUTO-WALK's, not the thumb's. Dropping it at this
 * one function rather than on the phone is deliberate: the phone is not the authority on what the
 * body does, and a pad written by somebody else six months from now must not be able to restore
 * forward drive by sending a `y` again.
 *
 * @returns {number} the lateral in `[-DODGE.reach, DODGE.reach]`, smoothed toward the thumb.
 */
export function dodgeLateral(stickX, cur, dt) {
  const raw = Math.max(-1, Math.min(1, Number(stickX) || 0));
  const want = Math.abs(raw) < DODGE.dead
    ? 0
    : Math.sign(raw) * DODGE.reach * ((Math.abs(raw) - DODGE.dead) / (1 - DODGE.dead));
  const c = Number(cur) || 0;
  return c + (want - c) * (1 - Math.exp(-DODGE.rate * (Number(dt) || 0)));
}

/**
 * *"Cannot steer into another room."*
 *
 * The probe is a point one `DODGE.probe` to the runner's side; `roomIdAt` is the bed's own
 * `room.spaceAt(...)`.id handed in as a function, so this file stays free of THREE.
 *
 * ⚠️ **ONLY THE LATERAL IS CLAMPED.** The forward drive walks through doorways all night; a clamp
 * that refused every room change would pin the runner in the room she started in. So the test is
 * asked about the SIDEWAYS point only, and a doorway straight ahead is unaffected.
 */
export function clampToRoom(lateral, at, yaw, roomIdAt) {
  const l = Number(lateral) || 0;
  if (!l || typeof roomIdAt !== 'function' || !at) return l;
  const here = roomIdAt(at);
  // The body's RIGHT at this yaw. `follow-bed.js` `_solve`: rx = -cos(f), rz = sin(f).
  const rx = -Math.cos(yaw), rz = Math.sin(yaw);
  const s = Math.sign(l) * DODGE.probe;
  const there = roomIdAt({ x: at.x + rx * s, z: at.z + rz * s });
  return there === here ? l : 0;
}

/* =================================================================================================
 * HIDE · armour, and it needs a piece of furniture to be true
 * ============================================================================================== */

export const COVER = Object.freeze({
  /** How close a prop must be to count as cover, in metres. */
  radius: 1.35,
  /** Below this the prop is a rug, not a body to get behind. */
  minHeight: 0.55,
});

/**
 * The nearest thing worth getting behind, or `null`.
 *
 * 🚨 **`null` IS A REFUSAL AND THE CALLER MUST HONOUR IT.** John: *"No stop-in-open-hall without
 * cover."* That one rule is what keeps the evil runner's sabotage surface closed to the four
 * entries in `SABOTAGE` — a body that could simply stand still in a corridor would burn the whole
 * expedition clock with no button and no tell, which is a sabotage the room can neither see nor
 * argue about. Hide is armour; armour needs a wall.
 *
 * @param {Array<{x:number,z:number,h?:number}>} props world points, already flattened by the bed
 */
export function coverNear(props, at) {
  if (!at || !Array.isArray(props)) return null;
  let best = null, bestD = Infinity;
  for (const p of props) {
    if (!p || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.z))) continue;
    if (p.h != null && Number(p.h) < COVER.minHeight) continue;
    const d = Math.hypot(Number(p.x) - at.x, Number(p.z) - at.z);
    if (d < bestD && d <= COVER.radius) { best = p; bestD = d; }
  }
  return best ? { x: Number(best.x), z: Number(best.z), d: bestD } : null;
}

/**
 * 🔴 **THE STAGED RED PASS — a reason to hide, so hiding is deniable.**
 *
 * John: *"Hide is deniable only if the TV sometimes shows a reason: a staged RED PASS down the
 * hall (local sense, not a map, not hunter AI)."*
 *
 * ⚠️ **THIS IS NOT THE HUNTER AND MUST NEVER BECOME HIM.** The standing instruction is that the
 * hunter is a DOOR and the door is shut. So the pass is a CLOCK: a seeded, periodic sweep of red
 * light with no position, no target and no knowledge of anybody. It cannot be read as intel
 * because it carries none — it is stage lighting, in the show's own language, and it is on the
 * TELEVISION where the whole room can see it. That last part is the point: a runner who ducks
 * during a red pass ducked in front of eight witnesses, and one who ducks in the quiet did not.
 *
 * `seed` shifts the phase so two nights on two seeds do not sweep in lockstep.
 *
 * @returns {{on:boolean, k:number}} `k` ramps 0 → 1 → 0 across the pass, for the light's intensity.
 */
export const RED = Object.freeze({ period: 23.0, span: 4.6 });

export function redPassAt(t, seed = 0) {
  const p = RED.period;
  const phase = (((Number(t) || 0) + (Math.abs(Number(seed) || 0) % p)) % p + p) % p;
  if (phase > RED.span) return { on: false, k: 0 };
  const u = phase / RED.span;                       // 0..1 across the sweep
  return { on: true, k: Math.sin(u * Math.PI) };    // in, and back out
}

/**
 * The hide machine, one tick.
 *
 * Held state is `{hiding, heldS, quietS, redS, longestS}` and every field is a DURATION, never a
 * verdict — the verdict is `holdTell`'s job and it is deliberately downstream, because a machine
 * that decided "this was suspicious" inside the tick would be authoring the accusation the room
 * is supposed to make.
 *
 * ⚠️ **THE CLOCK STILL RUNS WHILE HIDDEN.** Nothing here pauses anything: the show's clock lives
 * in `src/party/show.js` and this file cannot reach it. Stated out loud because the obvious
 * "improvement" — freezing the expedition timer while the runner is behind a chair — hands an
 * evil runner a cost-free stall, which is exactly the sabotage lock 4 closes.
 */
export function hideTick(held, { want, cover, red, dt } = {}) {
  const s = held ?? { hiding: false, heldS: 0, quietS: 0, redS: 0, longestS: 0 };
  const step = Math.max(0, Number(dt) || 0);
  const can = !!want && !!cover;
  if (!can) return { ...s, hiding: false, heldS: 0, longestS: Math.max(s.longestS, s.heldS) };
  const heldS = s.heldS + step;
  return {
    hiding: true,
    heldS,
    quietS: s.quietS + (red ? 0 : step),
    redS: s.redS + (red ? step : 0),
    longestS: Math.max(s.longestS, heldS),
  };
}

/* =================================================================================================
 * THE TELL — what the room is allowed to be told about a hold
 * ============================================================================================== */

/**
 * How long a quiet hold has to be before the recap mentions it at all, in seconds. Short enough
 * that a deliberate stall is caught; long enough that walking into a doorframe and pausing for
 * breath is not an accusation.
 */
export const TELL = Object.freeze({ quietFloor: 4.0, longFloor: 9.0 });

/**
 * 🚨 **NO NAMES, EVER — and this is not politeness, it is the rule `FAIL_CHROME` already obeys.**
 *
 * `jobs.js`: *"Fail chrome names no person."* John, tonight: *"Recap does not name whose thumb."*
 * The runner's seat is public (`pair.runner` is audience `all`), so a line saying *"the runner
 * hid"* would be an accusation the SHOW made rather than one a player made — and the whole night
 * is built on the room arguing about what it saw. So the sentence describes the PICTURE: the
 * camera lost somebody, the hall was clear, it lasted this long. Who chose it, and why, is the
 * argument.
 *
 * Returns `''` when there is nothing worth saying — an empty string, not a placeholder, so the
 * caller drops the row entirely rather than printing a shrug.
 */
export function holdTell({ quietS = 0, redS = 0, longestS = 0 } = {}) {
  const q = Math.max(0, Number(quietS) || 0);
  const r = Math.max(0, Number(redS) || 0);
  const L = Math.max(0, Number(longestS) || 0);
  if (L >= TELL.longFloor && q >= TELL.quietFloor) return 'The camera lost her a long time, and the hall was clear.';
  if (q >= TELL.quietFloor) return 'She went to ground where it was quiet.';
  if (r >= TELL.quietFloor) return 'She went to ground when the hall went red.';
  return '';
}

/** Words a hold line may never contain. Executed by the gate, not trusted to a reader. */
export const TELL_FORBIDDEN = Object.freeze([
  'runner', 'guide', 'thumb', 'sabotage', 'evil', 'traitor', 'hid on purpose',
]);

/* =================================================================================================
 * THE SABOTAGE SURFACE — a closed list, so "no sabotage button" is checkable
 * ============================================================================================== */

/**
 * Lock 4, as data.
 *
 * Every one of these is an ORDINARY CONTROL USED AT THE WRONG MOMENT. There is no fifth entry and
 * there is no verb: `harness/runner-intel.mjs` asserts that nothing in `net/party/` and nothing on
 * either pad carries a sabotage verb, and this list is what it checks the design against. A new
 * way to sabotage is a decision, not a refactor — it goes to John and it comes back here.
 */
export const SABOTAGE = Object.freeze([
  { id: 'wrong-face', via: 'aim', at: 'job', what: 'smash the other identical painting' },
  { id: 'drill-through-hold', via: 'act', at: 'job', what: 'ignore HOLD so the mount fails and stays dark' },
  { id: 'drop-drill', via: 'act', at: 'job', what: 'let go early so the mount never fills' },
  { id: 'clock-talk', via: 'voice', at: 'walk', what: 'ask which door until the clock is gone' },
]);
