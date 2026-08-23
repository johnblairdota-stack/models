/**
 * 🏚️ **THE NIGHT'S HOUSE — one plan, derived from the public world seed, chosen by nobody.**
 *
 * `docs/slices/task-prime-time-lobby-warm-night.md` §3.2. John: *"Use the procedural map
 * (`?plan=gen` / genplan) so the layout is always different each night."*
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THE PLAN IS NOT A URL PARAM, AND WHY THAT IS NOT A COMPROMISE
 * ---------------------------------------------------------------------------------------------
 * `plan` is on `src/party/follow.js`'s `FOLLOW_FORBIDDEN` list and `party-follow` F5b asserts it
 * stays there. The entry's own reason: *"`?plan=gen` swaps the floor plan out from under the house
 * the phones are told about."* That reason is about DISAGREEMENT, not about generation — a TV
 * showing one house while the guide's map draws another is the leak.
 *
 * So the resolution is not to relax the rule, it is to remove the choice. The party night is
 * **always** procedural, and the plan is a pure function of `worldSeed`, which
 * `net/party/entitle.js` L47 already gives the `all` audience. The TV derives it, the guide's
 * phone derives it, and neither can be handed a different one because neither is asked.
 *
 * ⚠️ **NO THREE, NO DOM, AND THAT IS LOAD-BEARING.** The guide's map is a PHONE surface.
 * `src/world/genplan.js` imports `game/connectors.js` -> `destruction/wall.js` -> THREE, so a
 * phone that imported it would pull the whole renderer into its chunk. `harness/genspike.mjs`
 * imports **nothing at all** and exports `buildPlan` directly; `genplan.js` itself reaches into
 * `harness/` by relative path for the same reason, so this is a precedent rather than a new sin.
 */

import { buildPlan, roomAtEnvCorner } from '../../harness/genspike.mjs';

/** The two rooms the night's mission needs. Both are `genspike.mjs` `LIBRARY` types. */
export const MISSION_ROOM = 'gallery';
export const HOME_ROOM = 'ballroom';

/**
 * 🚨 **SIX ROOMS, EXPLICITLY, AND THE GAME'S OWN DEFAULT WOULD BREAK THE NIGHT.**
 *
 * `spaces.js` passes `?planrooms=` with a default of **3**, and `genspike.mjs`'s `selectRooms`
 * *subsets* `MANDATORY` below six — a seeded pick of 3 of
 * `['gallery','ballroom','study','study','service','chapel']`. So at the game's default a night
 * can contain no gallery and no ballroom, and this night's mission is "break a painting in the
 * gallery, then return to the ballroom".
 *
 * Six is the smallest count at which `selectRooms` takes the whole mandatory list, so both rooms
 * are guaranteed by construction rather than by a retry loop. `align`/`gap`/`waste` are
 * `buildPlan`'s own defaults, restated so the phone and the TV cannot drift apart if one of them
 * is ever called with a partial object.
 */
export const PLAN_OPTS = {
  rooms: 6, align: 0.35, gap: 2.2, waste: 0.04, doors: 'open',
  /** John 2026-08-23: ballroom is pinned to a plan corner by construction, not by retry luck. */
  homeCorner: true,
};

/** How many seeds `pickPlanSeed` will try before it gives up and takes the first. */
export const PLAN_TRIES = 32;

export function planOptsFor(worldSeed) {
  return { ...PLAN_OPTS, seed: planSeedString(worldSeed) };
}

/** genspike hashes its seed as a STRING, so both sides must stringify the same way. */
export function planSeedString(worldSeed) {
  const n = Number(worldSeed);
  return String(Number.isFinite(n) ? (n | 0) : 0);
}

/** The plan for one candidate. Pure, microseconds, and safe to call in a loop. */
export function planFor(seedish) {
  return buildPlan(String(seedish), PLAN_OPTS);
}

function regionsOfType(plan, type) {
  return plan.regions.filter((R) => R.kind === 'room' && R.type === type);
}

/**
 * Are `a` and `b` in the same connected component of the plan's walkable door graph?
 *
 * Only `canDoor` edges count. `PLAN_OPTS.doors === 'open'` turns every one of them into an OPEN
 * portal in `genplan.js`, so this is the graph the built house will actually have, not an
 * optimistic one.
 */
function connected(plan, ai, bi) {
  const adj = new Map();
  for (const e of plan.edges) {
    if (!e.canDoor) continue;
    if (!adj.has(e.ai)) adj.set(e.ai, []);
    if (!adj.has(e.bi)) adj.set(e.bi, []);
    adj.get(e.ai).push(e.bi);
    adj.get(e.bi).push(e.ai);
  }
  const seen = new Set([ai]);
  const q = [ai];
  while (q.length) {
    const u = q.pop();
    if (u === bi) return true;
    for (const v of adj.get(u) ?? []) if (!seen.has(v)) { seen.add(v); q.push(v); }
  }
  return seen.has(bi);
}

/**
 * 🎲 **THE SEED THE NIGHT ACTUALLY USES — the first candidate whose house can be PLAYED.**
 *
 * ⚠️ **THIS LOOP IS NOT DEFENSIVE PROGRAMMING, IT IS A MEASURED DEFECT BEING ROUTED AROUND.**
 * `src/world/genplan.js`'s own header records it: *"5 OF 16 SEEDS (0..15) LEAVE PART OF THE HOUSE
 * UNREACHABLE"*, because `coverFree()` can leave a 0.05-0.10 m corridor sliver as the only contact
 * between two halves of a region, and a sliver that thin cannot become a row. A night whose
 * mission room cannot be walked to is a night that cannot end, in front of eight people.
 *
 * Three checks, all on `buildPlan`'s pure output. **Do not build the house to test it** — the
 * whole point of doing this on the plan is that it costs microseconds instead of the bake this
 * slice exists to schedule earlier.
 *
 * ⚠️ **MEASURED, AND WEAKER THAN IT LOOKS: AT `rooms: 6` THE GUARD NEVER FIRES.** Every world seed
 * 0..23 passes on its first candidate (`harness/party-warm.mjs` W6c prints the worst case). That
 * is not evidence the guard is unnecessary — it is evidence that the two failure modes it covers
 * do not overlap. Room ABSENCE is impossible at six (the mandatory list is taken whole) and
 * plan-level DISCONNECTION is rare; the unreachability `genplan.js` measured happens one stage
 * later, when a corridor sliver fails to become a `SPACES` row, which this check cannot see
 * because that row does not exist yet. So the guard is cheap insurance against a `PLAN_OPTS`
 * change, not a fix for the sliver bug, and `planPasses` is exported so W6d can prove it still
 * rejects a house that genuinely lacks a gallery rather than asserting on a loop that never runs.
 *
 * If all `PLAN_TRIES` candidates fail, take candidate 0 and report it. A playable-but-wrong house
 * beats a throw on the biggest screen in the room; `ok:false` is how the caller can say so.
 */
/** True when the ballroom shares a corner with `plan.env`. */
export function homeIsCorner(plan) {
  return roomAtEnvCorner(plan, HOME_ROOM);
}

export function planPasses(plan) {
  const gal = regionsOfType(plan, MISSION_ROOM);
  const ball = regionsOfType(plan, HOME_ROOM);
  if (!gal.length || !ball.length) return false;
  if (!homeIsCorner(plan)) return false;
  return connected(plan, plan.regions.indexOf(gal[0]), plan.regions.indexOf(ball[0]));
}

export function pickPlanSeed(worldSeed) {
  const base = Number(planSeedString(worldSeed)) | 0;
  for (let i = 0; i < PLAN_TRIES; i++) {
    const seed = String(base + i);
    if (planPasses(buildPlan(seed, PLAN_OPTS))) return { seed, tries: i + 1, ok: true };
  }
  return { seed: String(base), tries: PLAN_TRIES, ok: false };
}

/**
 * The plan as flat rectangles a 2D surface can draw, in the SAME world coordinates the built
 * house uses. `genplan.js` §3's structural->clear conversion is a 0.15 m inset per side; it is
 * applied here so a mark at world (x, z) lands in the room the renderer would put it in.
 *
 * `doors` are the mid-points of the `canDoor` runs — where you can actually get through, which is
 * the one thing a map is for.
 */
/** Structural minimum a corridor rect must clear to become a `SPACES` row. genspike's `W_MIN_S`. */
const W_MIN_S = 1.90;

/** Do two structural rects share a wall line with a non-zero run along it? */
function touching(a, b) {
  const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const overlapZ = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
  const EPS = 1e-6;
  if (Math.abs(a.x1 - b.x0) < EPS || Math.abs(b.x1 - a.x0) < EPS) return overlapZ > EPS;
  if (Math.abs(a.z1 - b.z0) < EPS || Math.abs(b.z1 - a.z0) < EPS) return overlapX > EPS;
  return false;
}

/**
 * 🧱 **WHICH CORRIDOR RECTS THE BUILDER WILL ACTUALLY MAKE INTO ROOMS.**
 *
 * `genplan.js` `keepMaskFor` drops a sub-minimum alcove — one narrower than `W_MIN_S` — unless it
 * is load-bearing for the region's connectivity, in which case it is kept as a narrow row. The map
 * has to make the same call or it draws passages the house does not have: measured in a browser,
 * the guide's map showed **13 rects against the built house's 12**, and the extra one was an
 * alcove the builder had infilled. A map that offers a route which is a solid wall is worse than
 * no map, because the guide will call it.
 *
 * ⚠️ **THIS IS AN APPROXIMATION OF `keepMaskFor`, NOT A COPY OF IT, AND IT ERRS TOWARD KEEPING.**
 * The real thing runs a greedy multi-component bridge search; reproducing that here would be the
 * second copy of a subtle algorithm that `genplan.js`'s own header warns drifts the first time
 * anybody edits one. The test used instead — an alcove that touches two or more of its
 * region's other rects is a bridge and is kept — agrees with it on every seed measured, and where
 * it can differ it keeps a rect the builder dropped rather than dropping one the builder kept.
 * That is the safe direction: a map showing one dead-end too many costs a wasted glance; a map
 * missing a real corridor costs the run.
 */
function keptCorridorRects(rects) {
  return rects.filter((r, i) => {
    const minDim = Math.min(r.x1 - r.x0, r.z1 - r.z0);
    if (minDim >= W_MIN_S) return true;                    // a full-width passage, always built
    const contacts = rects.filter((o, j) => j !== i && touching(r, o)).length;
    return contacts >= 2;                                  // a bridge between two halves — kept
  });
}

export function planRegions(seedish) {
  const plan = buildPlan(String(seedish), PLAN_OPTS);
  const HALF = 0.15;                                   // WALL_T / 2, genplan.js `deflate`
  const rooms = [];
  const corridors = [];
  plan.regions.forEach((R) => {
    const src = R.kind === 'room' ? R.rects : keptCorridorRects(R.rects);
    for (const r of src) {
      const rect = {
        id: R.id, type: R.type,
        x0: r.x0 + HALF, x1: r.x1 - HALF, z0: r.z0 + HALF, z1: r.z1 - HALF,
      };
      if (rect.x1 - rect.x0 <= 0 || rect.z1 - rect.z0 <= 0) continue;   // a decomposition sliver
      (R.kind === 'room' ? rooms : corridors).push(rect);
    }
  });
  const doors = [];
  for (const e of plan.edges) {
    if (!e.canDoor) continue;
    const run = e.runs[e.doorRun];
    if (!run) continue;
    doors.push({
      x: run.axis === 'x' ? run.at : (run.lo + run.hi) / 2,
      z: run.axis === 'x' ? (run.lo + run.hi) / 2 : run.at,
      axis: run.axis,
    });
  }
  return { rooms, corridors, doors, env: plan.env };
}

/**
 * What the guide's map calls a room. **The TV never prints any of these** — naming rooms is the
 * guide's whole job (`party-loop.md` line 20), and `party-follow` F8d asserts the broadcast
 * overlay contains none of these words.
 */
export function roomLabel(type) {
  return ({
    gallery: 'Gallery', ballroom: 'Ballroom', study: 'Study',
    service: 'Service', chapel: 'Chapel',
  })[type] ?? 'Passage';
}

/**
 * 🗣️ **TWO ROOMS OF ONE TYPE, TWO NAMES THE GUIDE CAN ACTUALLY CALL.**
 *
 * A playcritique pass photographed the guide's map with the word **STUDY** printed twice, and the
 * guide has exactly one job: say a room name out loud so the runner can walk to it. `PLAN_OPTS`
 * takes the whole `MANDATORY` list, which contains `study` twice, so this is not a rare seed —
 * it is EVERY night. "Go to the study" was an instruction with two answers, and a runner picking
 * the wrong one costs the run.
 *
 * The disambiguator is a COMPASS WORD rather than a number, and that is the point. The runner has
 * no map and no legend, so "Study 2" is a name only one of the two people in the conversation can
 * resolve. A direction is a name both of them can.
 *
 * ⚠️ **KEYED ON REGION ID, DERIVED FROM THE PLAN, SHARED BY BOTH SURFACES.** `guidemap.js` draws
 * these and `intel.js` speaks them through `spaceLabel`; if the two ever computed their own, the
 * guide would be reading a word off the map that the phone's own feed never uses — the same class
 * of disagreement this file exists to forbid, in copy instead of geometry.
 *
 * Corridors are not in here at all. They stay `'a passage'`, for `spaceLabel`'s stated reason.
 */
const COMPASS = {
  x: { 2: ['West', 'East'], 3: ['West', 'Middle', 'East'] },
  z: { 2: ['North', 'South'], 3: ['North', 'Middle', 'South'] },
};

/**
 * `Map<regionId, label>` for one plan's ROOM rects — `planRegions(...).rooms`, as delivered.
 *
 * A region arrives as several rects (the decomposition), so they are unioned back into one box
 * before a centre is taken; naming off a single rect would put "North" on whichever sliver the
 * decomposition happened to emit first.
 */
export function roomLabelsFor(rooms) {
  const boxes = new Map();
  for (const r of rooms ?? []) {
    const b = boxes.get(r.id)
      ?? { id: r.id, type: r.type, x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    b.x0 = Math.min(b.x0, r.x0); b.x1 = Math.max(b.x1, r.x1);
    b.z0 = Math.min(b.z0, r.z0); b.z1 = Math.max(b.z1, r.z1);
    boxes.set(r.id, b);
  }
  const byType = new Map();
  for (const b of boxes.values()) {
    b.cx = (b.x0 + b.x1) / 2;
    b.cz = (b.z0 + b.z1) / 2;
    if (!byType.has(b.type)) byType.set(b.type, []);
    byType.get(b.type).push(b);
  }

  const out = new Map();
  for (const group of byType.values()) {
    const base = roomLabel(group[0].type);
    if (group.length < 2) { out.set(group[0].id, base); continue; }
    /*
     * The axis the rooms are actually separated along, not a fixed one. Seed 1 stacks its two
     * studies in z and seed 2 puts them side by side in x; calling both pairs "North/South" would
     * be a name that is wrong on half the nights, which is worse than a name that is repeated.
     */
    const spread = (k) => Math.max(...group.map((g) => g[k])) - Math.min(...group.map((g) => g[k]));
    const axis = spread('cx') >= spread('cz') ? 'cx' : 'cz';
    const words = COMPASS[axis === 'cx' ? 'x' : 'z'][group.length];
    const sorted = [...group].sort((a, b) => (a[axis] - b[axis])
      || String(a.id).localeCompare(String(b.id)));
    // Past three of a type there is no compass word left that stays honest, so the fallback is a
    // number. It is still unique and still speakable, which is the property that matters.
    sorted.forEach((g, i) => out.set(g.id, words ? `${words[i]} ${base}` : `${base} ${i + 1}`));
  }
  return out;
}

/** Last-seed cache — `patchLive` asks for these at 2 Hz and `planRegions` rebuilds the plan. */
let labelCache = { seed: null, labels: null };

/** The same map, from a seed, for callers that hold a seed rather than a built plan. */
export function planRoomLabels(seedish) {
  const key = String(seedish ?? '');
  if (labelCache.seed !== key) {
    labelCache = { seed: key, labels: roomLabelsFor(planRegions(key).rooms) };
  }
  return labelCache.labels;
}

/**
 * 🗣️ **A SPACE ID AS SOMETHING A PERSON CAN SAY OUT LOUD.**
 *
 * `genplan.js` ids rooms `r1.gallery` and corridor rects `c0.3`, which is right for a table and
 * wrong for the one screen whose entire job is a human reading a room name to the room. The first
 * browser pass caught it: the runner's intel line read *"Something somewhere near them, c0.3."*
 *
 * Corridors deliberately stay vague. There are up to nine of them in a generated house and they
 * have no distinguishing feature to name, so "a passage" is not a cop-out — it is the true
 * precision of the information, and pretending otherwise would have the guide calling a number
 * nobody else can see.
 */
/**
 * 📹 **A GENERATED SPACE ID AS A `coverage.js` ROOM NAME, OR `null`.**
 *
 * `coverage.js`'s `ROOMS` is a flat list of six bare names and `hunterVisibleToGuide` asks
 * `coveredRooms(...).has(hunterRoom)`. A generated id (`r2.study`, `c0.3`) is never in that set,
 * so handing one straight in makes the guide permanently blind — the failure is silent, because
 * "no camera has the hunter" is a legitimate answer the map already knows how to draw.
 *
 * A corridor returns `null` on purpose rather than being mapped to something. There is no camera
 * in a passage, so a hunter crossing one is genuinely off the roster, and inventing coverage there
 * would hand the guide sight the camera ladder has not paid for.
 */
export function coverageRoomOf(id) {
  const s = String(id ?? '');
  if (!s || s.startsWith('c')) return null;
  const type = s.includes('.') ? s.split('.')[1] : s;
  return /^\d+$/.test(type) ? null : type;
}

export function spaceLabel(id, labels) {
  const s = String(id ?? '');
  if (!s) return 'somewhere';
  const type = s.includes('.') ? s.split('.')[1] : s;
  if (/^\d+$/.test(type) || s.startsWith('c')) return 'a passage';
  // `labels` is optional on purpose: a caller that does not hold the seed yet still gets a
  // pronounceable name, just not a distinguishing one. Printing an id instead is never better.
  const label = labels?.get?.(s) ?? roomLabel(type);
  return label === 'Passage' ? 'a passage' : `the ${label}`;
}
