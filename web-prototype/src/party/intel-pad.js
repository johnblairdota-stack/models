/**
 * 🧭 **INTEL PAD — Guide E "Neighbours Only" and Runner D "Frame Bezel", as functions.**
 *
 * John picked the two boards on 2026-09-01:
 * `docs/design/refs-runner-intel/canvas/GuidePadE.dc.html` and `RunnerPadD.dc.html`.
 * The lock they answer to is `docs/design/runner-intel.md` — **a job plus local senses**, a
 * bearing PIN and never a polyline, and live `pathPortals` toward the pin is legal.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 WHY THIS IS A MODULE AND NOT TWO TEMPLATE LITERALS INSIDE `party-phone.js`
 * ---------------------------------------------------------------------------------------------
 * Rung 3 spent a whole gate on this lesson. `link-merge` L10–L14 proved the whisper's privacy on
 * the WIRE and every one of those checks was about bytes; both chromes were template literals
 * inside a browser view, so *"the partner pad shows the words and a third pad does not"* had only
 * ever been checked by opening six tabs. `whisperLines` and `pairShape` moved into `link.js` so a
 * node gate could execute the shipped chrome. Same move, same reason: **`harness/intel-pads.mjs`
 * executes exactly what the phone renders**, and a leak has to get past the same function on both
 * machines.
 *
 * ---------------------------------------------------------------------------------------------
 * 🗺️ **GUIDE E — the scope is the design, and it is enforced by CONSTRUCTION, not by a rule.**
 * ---------------------------------------------------------------------------------------------
 * The board's own argument: *"A pin can only ever be one doorway ahead, so the pad cannot hold a
 * route even in principle — there is no second step on it to draw."*
 *
 * That is the D4 defence and it is worth being precise about why it is stronger than a ban.
 * `neighbourScope` returns her rect plus the rects a door joins to it, and **there is no field on
 * the returned object that could hold a second step.** A polyline cannot be smuggled in because
 * the shape has nowhere to put one — not because a reviewer would notice. `padLeaks` is the
 * closed schema that keeps it that way.
 *
 * The cost is real and the board names it: the guide loses the whole-house picture, so she has to
 * keep asking and keep talking. That is either the best thing on the canvas or the most annoying,
 * and it is John's call, already made.
 *
 * ⚠️ **THE SCOPE IS ATTENTION, NOT A SECURITY BOUNDARY, AND CONFLATING THE TWO WOULD BE A BUG.**
 * The plan comes from `worldSeed`, which `entitle.js` carries at audience `all` — every phone in
 * the room could draw the whole house if it wanted to. Fog is about where the guide is looking.
 * The thing that IS a boundary is `flyover`, which is `guide`-audience and gated on a lit camera,
 * and this file does not touch that rule in either direction.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚫 **NO HUNTER. Rung 5 is a door and it is shut.**
 * ---------------------------------------------------------------------------------------------
 * Guide E's board carries a *him · quiet/moving/on top of her* warmth strip, and it is
 * deliberately **not implemented here.** The instruction is *do not build a hunter, do not add
 * hunter fields to pads* — and a warmth strip is a hunter field on a pad, however small. Warmth is
 * the SHAPE Rung 5 must take when that door opens (a state, never a bearing, never a distance);
 * it is not a thing to ship ahead of the hunter it describes.
 *
 * What this file does do is make the fog rule apply to marks as well as rooms — see
 * `guidemap.js`'s `scope` block. Under Guide E a mark outside her lit set is simply not drawn, so
 * *"hunter as warmth not a map"* is satisfied here by the strongest available means: outside her
 * own rooms the hunter has **no position on the pad at all.** That is a removal, not an addition.
 * `padLeaks` refuses the word `hunter` in either pad shape so this cannot quietly reverse.
 *
 * ---------------------------------------------------------------------------------------------
 * 📱 **RUNNER D — the bearing is the EDGE OF THE PHONE, and the shape carries no coordinates.**
 * ---------------------------------------------------------------------------------------------
 * D13 holds: no 3D on this phone, her eyes are the television. So the bearing is not a widget in
 * the middle of the screen competing with the TV for her eyes — it is a glowing segment of the
 * bezel at the pin's angle, which peripheral vision catches while the eyes stay on the show.
 *
 * The invariant that makes this safe is worth stating on its own: **`bezelOf` returns pixels on a
 * phone edge and no world coordinate of any kind.** You cannot reconstruct a map from
 * `{edge:'top', from:236, to:354}`. It is a heading and a distance BAND, which is what a person
 * shouting across a room can convey, and nothing more.
 *
 * ⚠️ **`SCREEN_UP` IS DERIVED FROM `PLAN_YAW`, NOT TYPED OUT.** `follow.js` L145-156 nails a
 * plan-locked rig to one compass bearing so that screen-up is world −Z and screen-right is +X,
 * and says *"the absolute top-down stick is this constant and nothing else"*. If a compass word
 * here were a hand-typed `'north' = -z`, the day that constant moved the pad would point the
 * player the wrong way with a green test beside it. So both pads read the same constant the
 * camera and the stick read, and the arithmetic below is `player.js` `_stepGround`'s own.
 */

import { PLAN_YAW } from './follow.js';
import { planRegions, roomLabel, roomLabelsFor } from './mansion.js';
import {
  OBJECTIVE_KINDS, isObjectivePin, objectiveSay, objectiveSpots, pinObjective, unionRect,
} from './objectives.js';

/* =================================================================================================
 * THE COMPASS — one derivation, shared by the guide's map and the runner's bezel.
 * ============================================================================================== */

/**
 * Where screen-up points in the world, as `{x, z}`, read off `PLAN_YAW`.
 *
 * `player.js` `_stepGround` is aim-relative:
 *   `want = ( sin(a)·my − cos(a)·mx , 0 , cos(a)·my + sin(a)·mx )`
 * so a full-up stick (`mx=0, my=1`) is `( sin a , cos a )`. At `a = π` that is `(0, −1)` — north.
 */
export const SCREEN_UP = Object.freeze({ x: Math.sin(PLAN_YAW), z: Math.cos(PLAN_YAW) });
/** …and screen-right, from the same formula with `mx=1, my=0`: `( −cos a , sin a )`. */
export const SCREEN_RIGHT = Object.freeze({ x: -Math.cos(PLAN_YAW), z: Math.sin(PLAN_YAW) });

/** The four door words, in the order the chips are laid out. */
export const COMPASS_4 = Object.freeze(['north', 'east', 'south', 'west']);
/** The eight the runner's backstop line speaks. Screen words, because the pad is screen-space. */
export const COMPASS_8 = Object.freeze([
  'up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left',
]);

/**
 * A world delta, in the screen frame: `+sx` is screen-right, `+sy` is screen-UP.
 *
 * Projected onto `SCREEN_RIGHT` / `SCREEN_UP` rather than assuming which world axis is which, so
 * the whole file follows `PLAN_YAW` wherever it goes.
 */
export function screenDelta(dx, dz) {
  return {
    sx: dx * SCREEN_RIGHT.x + dz * SCREEN_RIGHT.z,
    sy: dx * SCREEN_UP.x + dz * SCREEN_UP.z,
  };
}

/** Clockwise radians from screen-up, in `[0, 2π)`. */
export function bearingRad(dx, dz) {
  const { sx, sy } = screenDelta(dx, dz);
  const a = Math.atan2(sx, sy);
  return a < 0 ? a + Math.PI * 2 : a;
}

/** The compass word for a delta. `n` is 4 (door words) or 8 (the runner's spoken backstop). */
export function compassOf(dx, dz, n = 4) {
  const table = n === 8 ? COMPASS_8 : COMPASS_4;
  const step = (Math.PI * 2) / table.length;
  return table[Math.round(bearingRad(dx, dz) / step) % table.length];
}

/* =================================================================================================
 * THE HOUSE GRAPH — adjacency derived from geometry, never from an authored list.
 * ============================================================================================== */

/**
 * How close a rect edge must sit to a door for the door to be that rect's.
 *
 * `planRegions` deflates every rect by `HALF = WALL_T / 2 = 0.15` while the door's `x`/`z` is the
 * wall CENTRE line, so the true gap is exactly 0.15. The window is wider than that only to absorb
 * float, and it is deliberately far below the thinnest wall so it cannot reach a rect across the
 * room.
 */
const TOUCH = 0.35;

/**
 * The live portal graph, as `{ rects, edges }`.
 *
 * ⚠️ **DERIVED, EVERY TIME, FROM `planRegions`.** `docs/design/procedural-map.md`'s whole argument
 * is that the moment the generator moves a wall a memorised anything is a cheat that fails. There
 * is no cache here and no room-name table; a breached wall or a chained door changes the plan and
 * this changes with it.
 *
 * A door lands between two rects. `planRegions` hands back `{x, z, axis}` with `axis` the wall
 * NORMAL, so `axis === 'x'` is a wall at constant `x` with rooms either side of it in `x`.
 * Decomposition can put more than one rect on a side (a room is a union of rectangles), so every
 * low-side rect is joined to every high-side rect and the pair list is deduped.
 */
export function roomGraph(plan) {
  const rects = [...(plan?.rooms ?? []), ...(plan?.corridors ?? [])];
  const edges = [];
  const seen = new Set();
  for (const dr of plan?.doors ?? []) {
    const along = dr.axis === 'x' ? 'z' : 'x';        // the axis the opening spans
    const lo = [], hi = [];
    for (const r of rects) {
      const a0 = r[`${along}0`], a1 = r[`${along}1`];
      if (dr[along] < a0 - TOUCH || dr[along] > a1 + TOUCH) continue;   // not beside the opening
      const n0 = r[`${dr.axis}0`], n1 = r[`${dr.axis}1`];
      if (Math.abs(n1 - dr[dr.axis]) <= TOUCH) lo.push(r);              // rect ends at the wall
      if (Math.abs(n0 - dr[dr.axis]) <= TOUCH) hi.push(r);              // rect starts at the wall
    }
    for (const a of lo) {
      for (const b of hi) {
        if (a.id === b.id) continue;
        const key = `${a.id}|${b.id}|${dr.x.toFixed(2)}|${dr.z.toFixed(2)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ a: a.id, b: b.id, x: dr.x, z: dr.z, axis: dr.axis });
      }
    }
  }
  return { rects, edges };
}

/** The centre of a region id, averaged over its rects — where "the north room" is, for a word. */
export function centreOf(rects, id) {
  const mine = rects.filter((r) => r.id === id);
  if (!mine.length) return null;
  let x = 0, z = 0;
  for (const r of mine) { x += (r.x0 + r.x1) / 2; z += (r.z0 + r.z1) / 2; }
  return { x: x / mine.length, z: z / mine.length };
}

/** Which region holds this point. `null` off the floor — never a nearest-guess. */
export function regionAt(rects, at) {
  if (!at || !Number.isFinite(Number(at.x)) || !Number.isFinite(Number(at.z))) return null;
  const hit = rects.find((r) => at.x >= r.x0 && at.x <= r.x1 && at.z >= r.z0 && at.z <= r.z1);
  return hit ? hit.id : null;
}

/* =================================================================================================
 * GUIDE E · NEIGHBOURS ONLY
 * ============================================================================================== */

/**
 * Her room, and only the rooms her portals reach RIGHT NOW. Everything else is fog.
 *
 * 🚨 **THE SHAPE IS THE GUARANTEE.** There is no `path`, no `next`, no `then`, no second hop —
 * `lit` is one door deep because it is built from `here`'s own edges and from nothing else, and
 * `gates` are the doors OUT of `here`. Ask this function for a route and there is no field to
 * return one in. That is D4 enforced by construction rather than by a reviewer's memory.
 *
 * @returns {{ hereId:string|null, lit:string[], fog:string[],
 *             gates:Array<{toId:string, toLabel:string, x:number, z:number, dir:string}> }}
 */
export function neighbourScope(plan, at) {
  const { rects, edges } = roomGraph(plan);
  const ids = [...new Set(rects.map((r) => r.id))];
  const hereId = regionAt(rects, at);
  if (!hereId) return { hereId: null, lit: [], fog: ids, gates: [] };

  const home = centreOf(rects, hereId);
  const labels = roomLabelsFor(plan?.rooms ?? []);
  const gates = [];
  for (const e of edges) {
    const toId = e.a === hereId ? e.b : (e.b === hereId ? e.a : null);
    if (!toId) continue;
    const to = centreOf(rects, toId);
    if (!to) continue;
    gates.push({
      toId,
      toLabel: labelFor(labels, rects, toId),
      x: e.x,
      z: e.z,
      // The word is taken from the DOOR, not from the far room's centre: a guide says "take the
      // north door", and a long room whose middle is east of you can still be entered northward.
      dir: compassOf(e.x - home.x, e.z - home.z, 4),
    });
  }
  // One chip per direction. Two doors north is a real house and two NORTH chips is not a control;
  // the nearer one is the one a person standing in the room would mean.
  const best = new Map();
  for (const g of gates) {
    const d = (g.x - home.x) ** 2 + (g.z - home.z) ** 2;
    const cur = best.get(g.dir);
    if (!cur || d < cur.d) best.set(g.dir, { g, d });
  }
  const kept = COMPASS_4.map((dir) => best.get(dir)?.g).filter(Boolean);
  const lit = [hereId, ...new Set(kept.map((g) => g.toId))];
  return { hereId, lit, fog: ids.filter((id) => !lit.includes(id)), gates: kept };
}

function labelFor(labels, rects, id) {
  const named = labels?.get?.(id);
  if (named) return String(named);
  const first = rects.find((r) => r.id === id);
  if (!first) return String(id);
  return first.type === 'corridor' ? 'HALL' : roomLabel(first.type);
}

/* =================================================================================================
 * THE PIN · D2 — one pin, and a second tap REPLACES it
 * ============================================================================================== */

/**
 * The pin's whole schema. D2: *"That produces **one** pin: `{ x, z, roomId, kind }`… A second tap
 * replaces the pin; it does not append to it. There is no pin list, no ordering, no undo stack."*
 */
export const PIN_KEYS = Object.freeze(['x', 'z', 'roomId', 'kind']);
/** Derived, not copied — `objectives.js` owns the four job kinds and `follow.js` derives the same. */
export const PIN_KINDS = Object.freeze(['room', 'edge', ...OBJECTIVE_KINDS]);

/**
 * Pin the door in this direction. Returns a NEW pin or `null`; it never mutates and never takes a
 * previous pin as an argument, because there is nothing for a previous pin to contribute. The
 * caller assigns — `state.pin = pinDoor(scope, dir)` — and assignment is what "replaces" means.
 */
export function pinDoor(scope, dir) {
  const g = (scope?.gates ?? []).find((k) => k.dir === dir);
  if (!g) return null;
  return { x: g.x, z: g.z, roomId: g.toId, kind: 'room' };
}

/** Exactly `PIN_KEYS`, nothing else, or `null`. The shape the wire will one day have to match. */
export function pinShape(pin) {
  if (!pin) return null;
  return { x: Number(pin.x), z: Number(pin.z), roomId: String(pin.roomId ?? ''), kind: String(pin.kind ?? 'room') };
}

/**
 * The board's big line. One sentence, because it exists to be SAID rather than read.
 *
 * ⚠️ **AN OBJECTIVE PIN GETS THE JOB'S SENTENCE, NOT A DOOR'S.** Before the objective chips landed
 * every pin was a doorway, so *"Take that door"* was the honest fallback for a pin whose room was
 * no longer a neighbour. It stopped being honest the moment the guide could pin a painting: she
 * would tap LEFT FACE and the board would tell her to say *"take that door"* about a wall.
 * `objectiveSay` owns those four sentences and this defers to it — it never guesses.
 */
export function sayThis(scope, pin) {
  // In the mission room with nothing pinned, the sentence she needs is about the JOB, not a door.
  // With auto-walk this is the whole screen: nobody is moving until she picks one.
  if (!pin) {
    return (scope?.spots ?? []).length
      ? 'Pin her target. Then say it out loud.'
      : 'Pin a door. Then say it out loud.';
  }
  if (isObjectivePin(pin.kind)) return objectiveSay(pin.kind);
  const g = (scope?.gates ?? []).find((k) => k.toId === pin.roomId);
  return g ? `Take the ${g.dir} door.` : 'Take that door.';
}

/* =================================================================================================
 * RUNNER D · FRAME BEZEL
 * ============================================================================================== */

/** The phone, in CSS px, as the board draws it. */
export const BEZEL = Object.freeze({ w: 390, h: 844, rail: 9, span: 190 });

/**
 * How far away, as a WORD. Three bands and no number.
 *
 * A metre count would be a measurement the guide never gave her — the guide taps a door, and what
 * crosses the room is a shout. Bands are what a shout can carry.
 */
export const RANGE_BANDS = Object.freeze([
  { under: 6.0, word: 'close' },
  { under: 15.0, word: 'a way' },
  { under: Infinity, word: 'far' },
]);

export function rangeWord(dx, dz) {
  const d = Math.hypot(dx, dz);
  return (RANGE_BANDS.find((b) => d < b.under) ?? RANGE_BANDS[RANGE_BANDS.length - 1]).word;
}

/**
 * Where a ray from the middle of the screen at this bearing leaves the phone, as a distance
 * clockwise around the perimeter from the top-left corner.
 */
function perimeterAt(dx, dz, w, h) {
  const { sx, sy } = screenDelta(dx, dz);
  if (!sx && !sy) return null;
  const hw = w / 2, hh = h / 2;
  // Scale the screen-space ray until it touches a side. `sy` is UP, and the perimeter walk is in
  // CSS coordinates where down is positive, so the vertical component flips here and only here.
  const tx = sx === 0 ? Infinity : hw / Math.abs(sx);
  const ty = sy === 0 ? Infinity : hh / Math.abs(sy);
  const t = Math.min(tx, ty);
  const px = hw + sx * t;              // 0..w
  const py = hh - sy * t;              // 0..h, CSS-down
  const E = 1e-6;
  if (py <= E) return px;                                  // top edge, left → right
  if (px >= w - E) return w + py;                          // right edge, top → bottom
  if (py >= h - E) return w + h + (w - px);                // bottom edge, right → left
  return w + h + w + (h - py);                             // left edge, bottom → top
}

/** Split a clockwise perimeter run into per-edge CSS runs. */
function runsOf(from, len, w, h) {
  const P = 2 * (w + h);
  const edges = [
    { name: 'top', at: 0, len: w },
    { name: 'right', at: w, len: h },
    { name: 'bottom', at: w + h, len: w },
    { name: 'left', at: w + h + w, len: h },
  ];
  const out = [];
  let p = ((from % P) + P) % P;
  let left = Math.min(len, P);
  while (left > 1e-6) {
    const e = edges.find((k) => p >= k.at && p < k.at + k.len) ?? edges[0];
    const take = Math.min(left, e.at + e.len - p);
    out.push({ edge: e.name, from: round1(p - e.at), to: round1(p - e.at + take) });
    p = (p + take) % P;
    left -= take;
  }
  return out;
}

const round1 = (v) => Math.round(v * 10) / 10;

/**
 * The bezel, for one frame.
 *
 * 🚨 **THE RETURN VALUE HOLDS NO WORLD COORDINATE.** Pixels on a phone edge, a screen word and a
 * range band. That is the whole reason this is safe to put in a runner's hand: it is a heading,
 * which is what a guide shouting across a couch conveys, and there is nothing in it to draw a
 * route from. `padLeaks('runner', …)` is the closed schema that keeps it that way.
 *
 * ⚠️ **`pin` AND `ready` HAVE NO WIRE YET AND THAT IS STAGE 3, NOT AN OVERSIGHT.**
 * `net/party/entitle.js`'s `MATRIX` has no pin row and no smash-ready row — grep it — and it is
 * deny-by-default, so a field with no row is a hard red (`party-isolation` I1c). The pin belongs
 * to audience `crew` (runner or guide, never `all`; a seated phone must not learn where the target
 * is) and `task-runner-intel.md` §4 budgets that its own review. Until it lands this returns the
 * unpinned state, which is an honest screen and not a broken one: the guide has the pin and the
 * guide SAYS it, which is the locked *"voice is in the room"* rule.
 *
 * @param {{ pin?:object|null, at?:{x:number,z:number}|null, ready?:boolean }} o
 */
export function bezelOf({ pin, at, ready = false } = {}) {
  const { w, h, span } = BEZEL;
  // Smash-ready takes the WHOLE bezel and outranks the bearing. It is a state of the hammer, never
  // a hint about where to walk — the board is explicit — so it deliberately erases the segment
  // rather than drawing beside it.
  if (ready) return { whole: true, runs: [], word: '', range: '', pinned: !!pin };
  if (!pin || !at || !Number.isFinite(Number(at.x)) || !Number.isFinite(Number(at.z))) {
    return { whole: false, runs: [], word: '', range: '', pinned: false };
  }
  const dx = Number(pin.x) - Number(at.x);
  const dz = Number(pin.z) - Number(at.z);
  const p = perimeterAt(dx, dz, w, h);
  if (p == null) return { whole: false, runs: [], word: '', range: '', pinned: true };
  return {
    whole: false,
    runs: runsOf(p - span / 2, span, w, h),
    word: compassOf(dx, dz, 8),
    range: rangeWord(dx, dz),
    pinned: true,
  };
}

/** The one line of words under the bezel — the backstop for a segment caught side-on. */
export function bezelWords(bez) {
  if (!bez) return 'no pin yet';
  if (bez.whole) return 'swing now';
  if (!bez.pinned) return 'no pin yet';
  return `${bez.word} · ${bez.range}`;
}

/* =================================================================================================
 * THE SEAL — deny-by-default, one schema per pad
 * ============================================================================================== */

/**
 * Keys that must never appear in EITHER pad's shape, at any depth.
 *
 * The route words are D4 (*"if you can print the runner's whole future at spawn time, you built
 * the wrong thing"*). `hunter` is on the list because Rung 5 is a door and it is shut — see the
 * header. `pin` is not banned: one pin is the design.
 */
export const PAD_FORBIDDEN = Object.freeze([
  'path', 'route', 'polyline', 'points', 'waypoints', 'waypoint', 'legs', 'steps',
  'trail', 'next', 'then', 'plan', 'hunter', 'marks',
]);

/** The runner's shape, closed. Note there is no `x` and no `z` — see `bezelOf`'s header. */
export const RUNNER_PAD_KEYS = Object.freeze([
  'whole', 'runs', 'word', 'range', 'pinned', 'edge', 'from', 'to', 'words',
]);
/**
 * The guide's shape, closed. She has the map; that is her job. She still gets one pin.
 *
 * `spots` and `label` are the objective chips (2026-09-02). They are two coordinates in the room
 * the runner is standing in, which is a room she can already see the whole of on her map, so they
 * add no reach — and `PAD_FORBIDDEN` still refuses `path` / `next` / `plan`, so two targets in one
 * room cannot be dressed up as a route through the house.
 */
export const GUIDE_PAD_KEYS = Object.freeze([
  'hereId', 'lit', 'fog', 'gates', 'toId', 'toLabel', 'x', 'z', 'dir', 'pin', 'roomId', 'kind', 'say',
  'spots', 'label',
]);

function walkKeys(v, out = [], depth = 0) {
  if (depth > 10 || !v || typeof v !== 'object') return out;
  if (Array.isArray(v)) { for (const x of v) walkKeys(x, out, depth + 1); return out; }
  for (const [k, x] of Object.entries(v)) { out.push(k); walkKeys(x, out, depth + 1); }
  return out;
}

/**
 * Returns the complaints; empty means the shape is safe to put on that pad.
 * Same shape as `link.js` `shapeLeaks` and `night-book.js` `bookLeaks`, for their reason.
 */
export function padLeaks(kind, shape) {
  const allow = kind === 'runner' ? RUNNER_PAD_KEYS : GUIDE_PAD_KEYS;
  const bad = [];
  if (shape == null || typeof shape !== 'object') return ['not a pad shape'];
  for (const k of walkKeys(shape)) {
    if (PAD_FORBIDDEN.includes(k)) bad.push(`forbidden key "${k}"`);
    else if (!allow.includes(k)) bad.push(`unlisted key "${k}"`);
  }
  return bad;
}

/* =================================================================================================
 * ONE CALL PER PAD — what `party-phone.js` actually invokes
 * ============================================================================================== */

/*
 * ⚠️ **BOTH OF THESE RETURN FLAT SHAPES, AND THAT IS SO THE SEAL COVERS THEM.** A wrapper object
 * — `{ scope, pin, say }` — puts the interesting half one level down behind a key like `scope`,
 * and `padLeaks` would then be asserting things about a container rather than about what the pad
 * renders. Flattened, `GUIDE_PAD_KEYS` and `RUNNER_PAD_KEYS` are literally the list of everything
 * the phone can see.
 */

/**
 * Guide E, from the frame. `at` is the `you` mark; without one there is no "her room".
 *
 * 🎯 **THE OBJECTIVE CHIPS APPEAR WHEN THE RUNNER IS STANDING IN THE MISSION ROOM, AND THAT GUARD
 * IS THE WHOLE OF LOCK 5.** John, 2026-09-02: *"Guide E neighbours-only still for doors in the
 * halls. Objective chips appear when the runner is in the mission room."* So the test is
 * `scope.hereId === missionRoom` and nothing else — the same one-room-id-against-one-room-id
 * comparison `mission.js` `seekLine` already makes, for the same reason: it is the cheapest thing
 * that cannot leak, because both ids are already on this phone.
 *
 * ⚠️ **NO WHOLE-HOUSE FLYOVER CAME BACK WITH THEM.** The chips are targets INSIDE her current room.
 * `neighbourScope` is untouched, `lit` is still one door deep, and the day the runner leaves the
 * gallery the chips vanish on their own because `hereId` changed — there is no timer, no memory
 * and nothing to clear.
 *
 * @param {{missionRoom?:string|null, job?:string|null}} job the public mission event's two facts
 */
export function guidePad(seed, at, pin, { missionRoom = null, job = null } = {}) {
  const plan = planRegions(seed);
  const scope = neighbourScope(plan, at);
  const inMission = !!missionRoom && !!scope.hereId && String(scope.hereId) === String(missionRoom);
  const space = inMission ? unionRect([...(plan?.rooms ?? []), ...(plan?.corridors ?? [])], scope.hereId) : null;
  const spots = space ? objectiveSpots(job, space) : [];
  return { ...scope, spots, pin: pinShape(pin), say: sayThis(scope, pin) };
}

/**
 * Tap an objective chip. Same slot, same assignment, same D2 — `party-phone.js` writes
 * `state.pin = pinSpot(scope, kind)` exactly as it writes `pinDoor(scope, dir)`.
 */
export function pinSpot(scope, kind) {
  return pinObjective(scope?.spots ?? [], kind, scope?.hereId ?? '');
}

/** Runner D, from the frame. */
export function runnerPad(at, pin, ready) {
  const bez = bezelOf({ pin, at, ready });
  return { ...bez, words: bezelWords(bez) };
}
