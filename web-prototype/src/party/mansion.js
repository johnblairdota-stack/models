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

import { buildPlan } from '../../harness/genspike.mjs';

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
export const PLAN_OPTS = { rooms: 6, align: 0.35, gap: 2.2, waste: 0.04, doors: 'open' };

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
export function planPasses(plan) {
  const gal = regionsOfType(plan, MISSION_ROOM);
  const ball = regionsOfType(plan, HOME_ROOM);
  if (!gal.length || !ball.length) return false;
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
export function planRegions(seedish) {
  const plan = buildPlan(String(seedish), PLAN_OPTS);
  const HALF = 0.15;                                   // WALL_T / 2, genplan.js `deflate`
  const rooms = [];
  const corridors = [];
  plan.regions.forEach((R) => {
    for (const r of R.rects) {
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
export function spaceLabel(id) {
  const s = String(id ?? '');
  if (!s) return 'somewhere';
  const type = s.includes('.') ? s.split('.')[1] : s;
  if (/^\d+$/.test(type) || s.startsWith('c')) return 'a passage';
  const label = roomLabel(type);
  return label === 'Passage' ? 'a passage' : `the ${label}`;
}
