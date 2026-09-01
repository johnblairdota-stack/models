#!/usr/bin/env node
/**
 * target-sight — CAN THE RUNNER SEE, REACH AND BREAK THE THING THEY WERE SENT TO BREAK?
 *
 *   node harness/target-sight.mjs                 # the shipped arm
 *   node harness/target-sight.mjs --seeds 256     # widen the sweep (default 64, ~1.4 s)
 *   node harness/target-sight.mjs --control bury  # the target swallowed whole by a prop's body
 *   node harness/target-sight.mjs --control wall  # the target walled in, no approach inside reach
 *   node harness/target-sight.mjs --control under # the target dropped below the floor
 *   node harness/target-sight.mjs --verbose       # per-seed census
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 * ---------------------------------------------------------------------------------------------
 * `CLAUDE.md`, "Gates are the memory", has carried the same last line for weeks:
 *
 *   > Known unguarded: **smash-target visibility.** Nothing asserts a mission target is visible
 *   > or reachable, so "the painting was behind the furniture" can silently come back. This is
 *   > the last live-found bug class with no regression net.
 *
 * `docs/design/PRIME-TIME-STATE.md` §5 carries the row with **none** in the gate column. This is
 * that net. A player was sent to smash a thing and could not: it was behind the furniture.
 *
 * ---------------------------------------------------------------------------------------------
 * ✅ WHAT IT FOUND, AND WHAT CLOSED IT — 2026-09-01, COUCH PLAN RUNG 6, THIS GATE IS NOW GREEN
 * ---------------------------------------------------------------------------------------------
 * It joined `gates:party` on 2026-09-01. Three things had to be true first, and only one of them
 * was a threshold; the archaeology below is kept because every one of them can come back.
 *
 * **(a) THE PLACER IS TOLD WHERE THE TARGETS HANG, AND IT ASKS `jobs.js` RATHER THAN RE-TYPING IT.**
 * `furn-layout.js` `missionKeepOuts` now yields TWO rects per mission room — the twin paintings'
 * and the wall camera's — each built by `hangKeepOut` from the same pure `twinHang` / `camHang`
 * that `follow-bed.js` builds the real meshes from. The first keep-out (2026-08-28) covered the
 * paintings only and was itself a re-typed copy of a formula that had already moved: it described
 * ONE centred 1.46 m frame and reached ±1.41 m, where the shipped PAIR reaches ±2.33 m. T2 read
 * 11/192 pierced after it, all `cam-wall` through the wall camera, on seeds 5, 21, 22, 25, 29, 46,
 * 48, 49, 60, 61 and 62 — the `{ x: space.x1 - 0.22, z: c.z }` slot, which is `camHang`'s own
 * formula character for character on a gallery deeper than it is wide. It reads 0/192 now, and
 * **T7 is the assertion that the rects are what did it** rather than luck in the seed order.
 * The cost is printed, not hidden: the keep-outs refuse slots, so the modelled occluder set falls
 * from 1241 props to 1103. G2 is the floor under that.
 *
 * **(b) THE DRILL WAS BEING MODELLED AS A SWING, AND IT IS NOT ONE.** Episodes 2+ do not smash the
 * wall camera; `missionTick` fills the mount while `perf.act > 0.5 && nearWallCam()`, and
 * `nearWallCam` is `Math.hypot(dx, dz) < 1.85` — a PLANAR PROXIMITY TEST with no ray, no aim and
 * no pitch in it anywhere. Modelling it with the mission swing ray was not a strict gate, it was a
 * false one: at the fixed −0.06 rad the ray occupies y 1.4245–1.5385 and the camera's body is
 * 1.56–1.88, so the ray could never enter it from anywhere in the house, and **all 64 cam targets
 * read blind on G7/T3/T4 while the shipped job worked fine.** A gate that reports a defect the
 * product does not have is the same failure as one that misses a defect it does have — both are
 * the instrument disagreeing with the game. The drill channel now asks the two questions the drill
 * really asks: can you STAND within `DRILL_REACH` of it, and can you SEE it from there. G5b pins
 * `nearWallCam`'s radius and the `perf.act` gate against `follow-bed.js`'s source text.
 *
 * **(c) 1 OF 64 SEEDS SEALED A MISSION ROOM, AND THAT IS NOW 0.** See T1's note below.
 *
 * The original report, kept because it is the reason every clause is worded the way it is:
 *
 * 64 world seeds, 128 targets, 364 dressed props. **6 of the 19 assertions below were RED, on the
 * shipped arm, and the reds were the bug reproducing rather than a threshold set too tight.**
 * Two independent defects, neither of which this file could fix at the time (`harness/` only).
 *
 * **(1) T2 — ON 24 OF 64 SEEDS (37.5%) A DRESSED PROP'S BODY INTERSECTS THE PAINTING'S BODY.**
 * Not "near it" — through it. Two causes, both one line, both in `src/game/furn-layout.js`:
 *
 *   · **`cam-wall`, 12 seeds** (4, 12, 15, 18, 23, 25, 38, 43, 48, 53, 58, 63).
 *     `candidatesFor`'s `cam-wall` slots are `{ x: space.x0 + 0.22, z: c.z }` and
 *     `{ x: c.x, z: space.z0 + 0.22 }` — which is, character for character, `buildPainting`'s own
 *     placement formula (`follow-bed.js`). The catalog smash-cam and the mission painting are
 *     authored into THE SAME SLOT and neither knows the other exists. `accept`'s 0.45 m clamp is
 *     all that stands between them and it is smaller than the painting's 0.73 m half-width, so it
 *     does not separate them: the camera ends up hung through the canvas.
 *   · **`vitrine`, 12 seeds** (1, 6, 7, 8, 14, 27, 32, 35, 45, 47, 52, 54). A 2.33 m display case
 *     on walls `['n','s']` at inset 0.62 — the same wall the painting hangs on — whose own drawn
 *     half is **0.651 m**, i.e. 3 cm MORE than its inset. The case's body therefore reaches
 *     behind the wall line and swallows anything hung 22 cm off it. `TS` walks
 *     `[0.22, 0.38, 0.50, …]`; when a doorway rejects the first two the third is `t = 0.50`, the
 *     wall's midpoint, which is exactly where `buildPainting` centres the frame. It then covers
 *     1.30 m of the painting's 1.46 m width from the floor up, and **T6 measures what is left:
 *     13% of the frame visible from anywhere inside swinging distance.** That is the playtest
 *     sentence — *the painting was behind the furniture* — as a number.
 *
 *   The finding survives the conservative arm. Recomputed with the UNBOOSTED catalog half-span
 *   (`maxSpan/2`, no `FURN_FIT_BOOST` — the smallest a prop can possibly be drawn), the count is
 *   still 24 of 64. T2 prints both. It survives widening, too: at `--seeds 256` it is
 *   **100 of 256 paintings (39.1%)**, 64 `cam-wall` and 36 `vitrine`.
 *
 *   **The shape of the fix, for whoever owns `furn-layout.js`:** the placer has never been told a
 *   mission target exists. `accept()` already refuses a slot that lands in a keep-out — that is
 *   how `party-warm` W34d keeps furniture out of doorways — so this is one more keep-out rect,
 *   derived from `buildPainting`'s formula, handed to `catalogPlacements` beside `openings`. The
 *   two placers must not both own the same slot; today they do, and neither is aware of it.
 *   ✅ **DONE** — `missionKeepOuts`, and it derives the rects from `jobs.js` rather than a copy.
 *
 * **(2) T1 — 1 OF 64 SEEDS SEALS A MISSION ROOM.** ✅ **CLOSED** by `mansion.js` `tablesPass`,
 * which is this paragraph's own fix landed: `planPasses` asks `generatedTables` instead of the
 * region graph. 0/192 sealed today, and it cost `pickPlanSeed` 0.81 → 1.98 ms per uncached seed.
 * The report as filed: `ws=60`'s chapel (`r5.chapel`, 6.5 × 6.8 m,
 * with the episode-2 table dressed into it) has **zero interior doorways** in the built
 * `PORTALS`/`PANELS` tables. Its only connector is `x.g4`, an EXIT to `outside`. Widened to 256
 * world seeds: **5 sealed mission rooms — 4 chapels (60, 72, 81, 247) and one GALLERY (164)**,
 * about 2% of nights, and the gallery one is the PREMIERE's smash room.
 *
 *   This is not a new bug so much as a measured one. `mansion.js` `pickPlanSeed` rejects a
 *   candidate whose mission room is disconnected — but it asks the question of `buildPlan`'s
 *   REGION graph, and its own header says why that is not enough: *"the unreachability
 *   `genplan.js` measured happens one stage later, when a corridor sliver fails to become a
 *   `SPACES` row, which this check cannot see because that row does not exist yet."* This is that
 *   sentence happening to the mission room. The fix lives in `src/party/mansion.js`: `planPasses`
 *   has to ask `generatedTables` (rows + portals), not `plan.regions` + `plan.edges` — the
 *   tables are pure and cost microseconds, which is the same argument that put the loop there.
 *
 * ⚠️ **AND ONE THING THAT IS NOT A BUG BUT DECIDES THE MODEL — the runner has ONE aim pitch.**
 * `follow-bed.js`'s driven branch calls `runner.update(dt, t, { move, run, aimYaw })` and never
 * passes `aimPitch`; `Player.update` is `this.aimPitch = input.aimPitch ?? this.aimPitch`. So a
 * phone-driven runner spends the whole night at the constructor default **−0.06 rad**. The
 * consequence is that the mission ray (`swingHitObject`, `far` 1.90 m from a 1.5385 m eye) only
 * ever occupies y 1.4245–1.5385 — it can never touch the chapel table's ~0.85 m mesh, and the
 * table's only real death is the FurnProp channel against its 1.25 m collider. G5 asserts that
 * this is still true, because the day a look stick reaches `aimPitch` both target models here
 * change and this file must be told.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ WHAT "VISIBLE OR REACHABLE" MEANS HERE, AND WHY THE LINES ARE WHERE THEY ARE
 * ---------------------------------------------------------------------------------------------
 * Every number below is READ from the shipped code, not chosen, except the grid step. In this
 * game visibility and reach are not two properties — the smash IS a ray with a finite `far`
 * (`follow-bed.js` `swingHitObject`), so "can I hit it" and "is there a clear line to it" are the
 * same question asked of the same segment. So:
 *
 *   **A mission target is SIGHTED when at least one floor cell exists that is all five of:**
 *
 *   1. **STANDABLE.** Inside the mission room's clear rect by the runner's own body radius
 *      (`Player`: `height * 0.20` = 0.34 m at the 1.7 m default `follow-bed` builds with), and
 *      outside every dressed prop's keep-out half inflated by that radius. The prop half is
 *      `furn-layout.js` `walkHalf` — this repo's single existing answer to "how much floor does
 *      this prop take", already locked by `party-warm` W34d/W34j. A second answer here would be
 *      the exact sin that header warns about.
 *   2. **APPROACHABLE.** In the same 4-connected component of standable floor as a landing 0.6–1.6
 *      m inside one of the room's own OPEN portals. *A target visible only from a spot the runner
 *      cannot reach is not visible* — this clause is what makes "enclosed by props with no
 *      approach" a red rather than a shrug, and control `wall` is what proves the clause is live.
 *   3. **IN REACH.** A ray from the runner's eye enters the target's smashable body within the
 *      shipped `far`. Eye = `MOVE.eyeHeight` (0.905) × 1.7 = 1.5385 m.
 *   4. **AIMABLE AT THE ONLY PITCH THE RUNNER HAS.** ⚠️ This is the surprising one and it is
 *      measured, not assumed. `follow-bed.js`'s driven branch calls
 *      `runner.update(dt, t, { move, run, aimYaw })` — **`aimPitch` is never passed**, and
 *      `Player.update` is `this.aimPitch = input.aimPitch ?? this.aimPitch`, so a phone-driven
 *      runner is pinned at the constructor default **−0.06 rad** for the whole night. The swing
 *      ray is therefore not a cone the player can sweep; it is one shallow fan. That single fact
 *      decides both target models below, and G5 asserts it still holds.
 *   5. **UNOCCLUDED.** No prop body is entered by that segment before the target.
 *      ⚠️ Clause 5 is deliberately STRICTER THAN THE SHIPPED HIT TEST. `swingHitObject` is
 *      `raycaster.intersectObject(painting.group, true)` — it tests the painting ALONE, so the
 *      shipped swing happily smashes the painting straight through a display case. Mechanically
 *      that "works". The live defect was not a mechanic that returned false; it was a player who
 *      could not find or see the thing they were sent to break, in front of seven other people.
 *      A gate that only asked "would the ray return true" would have been green on the night the
 *      bug was reported.
 *
 *   **And a sixth clause that is not a judgement call at all: 6. NOT INSIDE A PROP.** The
 *   target's body and a prop's body may not intersect. That is T2, and it needs no threshold at
 *   all — it is the one assertion here with nothing to tune.
 *
 *   T3 is clauses 1–5 as a yes/no. T4 asks for a HEAD-ON cell rather than an oblique one, and T6
 *   asks how much of the target is in front of you once you are there, because the vitrine seeds
 *   pass T3 and T4 on two 8 cm slivers of frame either side of a display case. T3 alone would
 *   have called that fine.
 *
 * THE TWO TARGETS ARE MODELLED DIFFERENTLY BECAUSE THE GAME RESOLVES THEM DIFFERENTLY.
 *
 *   · **The painting (episode 1)** is not a `FurnProp` (`buildPainting`'s own header says so). Its
 *     only death is `swingHitObject(painting.group)`: origin `runner.eye`, direction
 *     `runner.aimDir`, `far = WEAPON_RANGE.sledge + 0.35` = 1.90 m. Body = the 1.46 × 1.86 × 0.09
 *     frame box at `floorY + 1.85`. At pitch −0.06 that ray only ever occupies y 1.4245–1.5385,
 *     which is inside the frame's 0.92–2.78 band at every reach, so the painting's vertical is
 *     never the binding constraint and the test is honestly a plan-view one.
 *   · **The wall camera (episodes 2+)** is not smashed at all — it is DRILLED, and the drill has
 *     no ray. `missionTick` fills `wallCam.mount` while `perf.act > 0.5 && nearWallCam()`, and
 *     `nearWallCam` is `Math.hypot(dx, dz) < 1.85` on the plan, full stop: no aim, no pitch, no
 *     cast, no `far`. So the `drill` channel here is exactly those two questions —
 *     **can you stand within 1.85 m of it, and can you see it from there** — and clause 5 is a
 *     LOOK rather than a swing, free in pitch, because a runner who cannot see the camera cannot
 *     point a drill at it even though the mechanic would happily fill the mount blind. Clause 4
 *     does not apply to this channel and is skipped rather than faked; G5b is what pins that.
 *
 *   · **The chapel table (episodes 2+, RETIRED)** IS a `FurnProp`, and the mission ray cannot touch it:
 *     the fitted GLB is ~0.85 m tall (`targetH` 0.546 × `FURN_FIT_BOOST`) and the mission ray
 *     never descends below 1.4245 m. It dies through the OTHER channel — `missionTick` reads
 *     `table.prop.isShattered`, which `Player._resolveSledgeHit` → `_swingCast` sets by casting
 *     `_swingRay`'s fallback (aimDir with `dir.y -= 0.18`, origin 0.2 m behind the eye,
 *     `WORK_AIM_RANGE` = 1.55 + 0.9 = 2.45 m) against the prop's 1.25 m COLLIDER
 *     (`furnBox(..., max(dim.h, targetH, 1.25), ...)`, the "so a level swing cannot clear a desk"
 *     minimum). Modelled here with `_aimFace` OFF, i.e. the fallback ray only — the wall-face
 *     branch aims LOWER (`_aimHeight` clamps to 1.14 m at this pitch), so ignoring it is the
 *     harder arm, not the softer one. Consequence, and it is real: the table has a MINIMUM
 *     standoff as well as a maximum. You cannot smash it from on top of it.
 *
 * ⚠️ **NO BROWSER, NO THREE, NO DEPENDENCY, NO BAKE.** `.github/workflows/gates.yml` runs the
 * party gates with no `npm install`, and `harness/circle-staging.mjs` and
 * `harness/nametag-legibility.mjs` both argue at length for not booting a night when the thing
 * under test is reachable without one. Placement is reachable without one: `generatedTables` +
 * `catalogPlacements` + `buildPainting`'s formula ARE the pipeline, and every one of them is
 * pure. 64 seeds cost 1.4 s here against minutes per seed under swiftshader. The price is that
 * the painting's own geometry is re-derived rather than read out of a live scene, so **G4 asserts
 * the re-derivation against `follow-bed.js`'s source text** and goes red the day either moves.
 *
 * ⚠️ **THE LIMIT, STATED.** Prop bodies are the catalog's authored `maxSpan`/`targetH` × 1.55,
 * not the GLB's real AABB — `fitCatalogProp` takes `min(sH, sW)` and only one of the two binds,
 * so a modelled prop is never smaller than the real one and may be taller. That biases toward
 * calling a target occluded, which is the wrong direction for a gate, so T1 prints the
 * unboosted-half recount beside the boosted one and the finding has to survive both. Kit dress
 * (`furn-dress.js`) is not modelled because it is OFF on party nights (`kitDressEnabled`), and a
 * generated room carries no pilasters or colonnade (`genplan.js` header) — so on a Prime Time
 * night the catalog placements ARE the occluder set.
 *
 * 🚨 **THE CONTROLS ARE THE POINT.** `party-isolation` reported 20 passed / 0 failed, including
 * all four of its blindness controls, while leaking a secret role to every phone. A gate whose
 * controls stop failing has gone blind. Four here, and C1–C3 each break the target in a different
 * way that a real placer could produce; C4 and C5 are the other direction — they prove the rig
 * can still say YES, and that it does not call a coffee table an occluder.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { generatedTables } from '../src/world/genplan.js';
import { PLAN_OPTS, pickPlanSeed, MISSION_ROOM } from '../src/party/mansion.js';
import { catalogPlacements, drawHalf, missionKeepOuts, walkHalf } from '../src/game/furn-layout.js';
import { FURN_SMASH_ASSETS, FURN_FIT_BOOST } from '../src/game/furn-catalog.js';
import { MOVE, WEAPON_RANGE } from '../src/game/rules.js';
import { MISSION_PAINTING, MISSION_DRILL, missionFor } from '../src/party/mission.js';
import { TWIN, WALL_CAM, twinHang, camHang } from '../src/party/jobs.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return c;
};

const sumOf = (rows, f) => rows.reduce((a, r) => a + f(r), 0);

const argv = process.argv.slice(2);
const argOf = (k, dflt) => {
  const i = argv.indexOf(k);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const SEEDS = Math.max(1, Number(argOf('--seeds', 64)) | 0);
const CONTROL = argOf('--control', null);
const VERBOSE = argv.includes('--verbose');

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, '..', rel), 'utf8');

/* =============================================================================================
 * THE BODY, THE SWING, AND THE GRID — every constant read from the shipped module.
 * ============================================================================================= */

/** `follow-bed.js` builds `new Player({ scene, world: room, ... })` with no `height`. */
const BODY_H = 1.7;
/** `Player`: `this.radius = this.height * 0.20`. */
const BODY_R = BODY_H * 0.20;
/** `Player.eyeHeight` on a two-legged gait. */
const EYE_Y = BODY_H * MOVE.eyeHeight;
/** `Player` constructor default. The driven branch never writes it. See clause 4. */
const AIM_PITCH = -0.06;
/** `follow-bed.js`: `const PAINTING_REACH = WEAPON_RANGE.sledge + 0.35`. */
const MISSION_REACH = WEAPON_RANGE.sledge + 0.35;
/** `player.js`: `const WORK_AIM_RANGE = WEAPON_RANGE.sledge + 0.9`. */
const WORK_AIM_RANGE = WEAPON_RANGE.sledge + 0.9;
/** `player.js` `_swingRay` fallback: `dir.y -= 0.18`, origin pulled back 0.2 m. */
const SWING_DROP = 0.18;
const SWING_PULLBACK = 0.2;
/** `follow-bed.js` `nearWallCam`: `Math.hypot(dx, dz) < 1.85`. Planar. No ray, no aim. */
const DRILL_REACH = 1.85;
/** `furnprop.js` / `furn-layout.js`: `boxH = max(dim.h, targetH, 1.25)` for a non-thin prop. */
const FURN_MIN_BOX_H = 1.25;
/** The one number this file chooses. 10 cm of floor — a third of a body radius. */
const GRID = 0.10;

const SPEC = new Map(FURN_SMASH_ASSETS.map((a) => [a.id, a]));

/** The prop's drawn half-span on the floor. Boosted, because `fitCatalogProp` draws it boosted. */
function visHalf(spec, { boost = FURN_FIT_BOOST } = {}) {
  const half = (spec?.maxSpan ?? 1.2) * 0.5;
  return spec?.thin ? half : half * boost;
}
/** ...and its drawn height above `liftY`. A rug is a sheet. */
function visHeight(spec) {
  return spec?.thin ? 0.05 : (spec?.targetH ?? 0.4) * FURN_FIT_BOOST;
}
function propBody(p, opts) {
  const spec = SPEC.get(p.catalogId);
  const h = visHalf(spec, opts);
  const y0 = spec?.liftY ?? 0;
  return {
    id: p.catalogId, slotId: p.id, spaceId: p.spaceId,
    x0: p.x - h, x1: p.x + h, z0: p.z - h, z1: p.z + h,
    y0, y1: y0 + visHeight(spec),
    /** The floor keep-out the runner's own capsule has to clear. 0 for anything hung. */
    foot: walkHalf(spec),
  };
}

const boxesOverlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1
  && a.z0 < b.z1 && b.z0 < a.z1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Slab test. Entry parameter of `origin + s·dir` into `B` within `far`, or −1. */
function rayBox(o, dir, far, B) {
  let t0 = 0, t1 = far;
  const lo = [B.x0, B.y0, B.z0], hi = [B.x1, B.y1, B.z1];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dir[i]) < 1e-12) { if (o[i] < lo[i] || o[i] > hi[i]) return -1; continue; }
    let ta = (lo[i] - o[i]) / dir[i], tb = (hi[i] - o[i]) / dir[i];
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  return t0;
}

/* =============================================================================================
 * THE TWO TARGETS, DERIVED FROM THE PIPELINE. G3/G4 assert this against the source.
 * ============================================================================================= */

/**
 * `follow-bed.js` twin hang, in plan. Longest wall, `jobs.js` `twinHang`, frame
 * `BoxGeometry(TWIN.frameW, TWIN.frameH, TWIN.frameD)`.
 */
function paintingTarget(space, face = 'left', floorY = 0) {
  const hang = space ? twinHang(space, face, floorY) : null;
  if (!hang) return null;
  const hw = hang.alongX ? TWIN.frameW / 2 : TWIN.frameD / 2;
  const hd = hang.alongX ? TWIN.frameD / 2 : TWIN.frameW / 2;
  return {
    kind: 'painting', episode: 1, spec: MISSION_PAINTING, space, face,
    x: hang.x, z: hang.z,
    normal: hang.alongX ? [0, 1] : [1, 0],
    lateral: TWIN.frameW / 2,
    body: {
      x0: hang.x - hw, x1: hang.x + hw, z0: hang.z - hd, z1: hang.z + hd,
      y0: hang.y - TWIN.frameH / 2, y1: hang.y + TWIN.frameH / 2,
    },
    channel: 'mission',
  };
}

/** Opposite-wall camera the later nights hold-drill. */
function camTarget(space, floorY = 0) {
  const hang = space ? camHang(space, floorY) : null;
  if (!hang) return null;
  const hw = hang.alongX ? WALL_CAM.w / 2 : WALL_CAM.d / 2;
  const hd = hang.alongX ? WALL_CAM.d / 2 : WALL_CAM.w / 2;
  return {
    kind: 'cam', episode: 2, spec: MISSION_DRILL, space,
    x: hang.x, z: hang.z,
    normal: hang.alongX ? [0, -1] : [-1, 0],
    lateral: WALL_CAM.w / 2,
    body: {
      x0: hang.x - hw, x1: hang.x + hw, z0: hang.z - hd, z1: hang.z + hd,
      y0: hang.y - WALL_CAM.h / 2, y1: hang.y + WALL_CAM.h / 2,
    },
    channel: 'drill',
  };
}

/** The ray a swing actually traces, per channel. Origin, unit direction for one yaw, and `far`. */
function swingRay(eye, yaw, channel) {
  const cp = Math.cos(AIM_PITCH), sp = Math.sin(AIM_PITCH);
  if (channel === 'mission') {
    // `_paintRay.set(runner.eye, runner.aimDir)`, `far = PAINTING_REACH`.
    return { o: eye, d: [Math.sin(yaw) * cp, sp, Math.cos(yaw) * cp], far: MISSION_REACH };
  }
  // `_swingRay`'s fallback: aimDir, then `dir.y -= 0.18`, renormalised, origin 0.2 m behind.
  const v = [Math.sin(yaw) * cp, sp - SWING_DROP, Math.cos(yaw) * cp];
  const L = Math.hypot(v[0], v[1], v[2]);
  const d = [v[0] / L, v[1] / L, v[2] / L];
  const o = [eye[0] - d[0] * SWING_PULLBACK, eye[1] - d[1] * SWING_PULLBACK, eye[2] - d[2] * SWING_PULLBACK];
  return { o, d, far: WORK_AIM_RANGE };
}

/* =============================================================================================
 * THE SURVEY — five clauses, one grid, one flood fill.
 * ============================================================================================= */

const YAWS = 41;

function survey(space, props, target, portals) {
  const B = target.body;
  const bodies = props.map((p) => (p.__body ? p : propBody(p)));

  // ---- clause 6 · does anything intersect it -----------------------------------------------
  const intersects = bodies.filter((b) => boxesOverlap(b, B));

  // ---- clause 1 · standable floor -----------------------------------------------------------
  const gx0 = space.x0 + BODY_R, gx1 = space.x1 - BODY_R;
  const gz0 = space.z0 + BODY_R, gz1 = space.z1 - BODY_R;
  const nx = Math.max(1, Math.floor((gx1 - gx0) / GRID) + 1);
  const nz = Math.max(1, Math.floor((gz1 - gz0) / GRID) + 1);
  const stand = new Uint8Array(nx * nz);
  let standN = 0;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const x = gx0 + i * GRID, z = gz0 + j * GRID;
      let ok = true;
      for (const b of bodies) {
        if (!(b.foot > 0)) continue;                      // hung: you walk under it
        if (Math.abs(x - (b.x0 + b.x1) / 2) < b.foot + BODY_R
          && Math.abs(z - (b.z0 + b.z1) / 2) < b.foot + BODY_R) { ok = false; break; }
      }
      // A solid target is something you stand beside, not inside.
      if (ok && target.channel === 'furn'
        && x > B.x0 - BODY_R && x < B.x1 + BODY_R && z > B.z0 - BODY_R && z < B.z1 + BODY_R) ok = false;
      if (ok) { stand[i * nz + j] = 1; standN++; }
    }
  }

  // ---- clause 2 · approachable from a doorway of this room ----------------------------------
  // A BREACHABLE leaf counts — you smash it and walk through. An EXIT to `outside` does not:
  // outside is not playable floor, so it is a way OUT of the plan, never a way in.
  const seeds = [];
  const cx = (space.x0 + space.x1) / 2, cz = (space.z0 + space.z1) / 2;
  for (const p of portals ?? []) {
    if (p.a !== space.id && p.b !== space.id) continue;
    if (p.a === 'outside' || p.b === 'outside') continue;
    const dx = cx - p.x, dz = cz - p.z, L = Math.hypot(dx, dz) || 1;
    for (const back of [0.6, 0.9, 1.2, 1.6]) {
      const i = Math.round((p.x + (dx / L) * back - gx0) / GRID);
      const j = Math.round((p.z + (dz / L) * back - gz0) / GRID);
      if (i >= 0 && i < nx && j >= 0 && j < nz && stand[i * nz + j]) seeds.push(i * nz + j);
    }
  }
  const walk = new Uint8Array(nx * nz);
  let walkN = 0;
  const q = [];
  for (const s of seeds) if (!walk[s]) { walk[s] = 1; walkN++; q.push(s); }
  while (q.length) {
    const u = q.pop(), i = (u / nz) | 0, j = u % nz;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const a = i + di, b = j + dj;
      if (a < 0 || a >= nx || b < 0 || b >= nz) continue;
      const v = a * nz + b;
      if (walk[v] || !stand[v]) continue;
      walk[v] = 1; walkN++; q.push(v);
    }
  }

  /* ---- clauses 3–5 · in reach, aimable at the fixed pitch, and nothing in between ------------
   *
   * TWO CHANNELS, because the game resolves the two jobs differently and a gate that pretends
   * otherwise reports a defect the product does not have — which is the same failure as missing
   * one. SMASH is a ray at the one pitch the runner has. DRILL is `nearWallCam()` — a planar
   * radius, no aim anywhere in it — plus a LOOK, free in pitch, because a runner who cannot SEE
   * the camera cannot point a drill at it even though the mechanic would fill the mount blind.
   */
  const drill = target.channel === 'drill';
  const eyeAtY = Math.min(B.y1 - 0.02, Math.max(B.y0 + 0.02, (B.y0 + B.y1) / 2));
  let inReach = 0, standReach = 0, occluded = 0, sighted = 0, frontal = 0;
  let nearest = Infinity;
  const blockers = new Map();
  const corners = [[B.x0, B.z0], [B.x0, B.z1], [B.x1, B.z0], [B.x1, B.z1], [(B.x0 + B.x1) / 2, (B.z0 + B.z1) / 2]];
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if (!stand[i * nz + j]) continue;
      const walkable = !!walk[i * nz + j];
      const px = gx0 + i * GRID, pz = gz0 + j * GRID;
      const dxm = Math.max(B.x0 - px, 0, px - B.x1), dzm = Math.max(B.z0 - pz, 0, pz - B.z1);
      if (Math.hypot(dxm, dzm) > WORK_AIM_RANGE) continue;         // cull, generous for both channels
      const eye = [px, EYE_Y, pz];
      let a0 = Infinity, a1 = -Infinity;
      for (const [qx, qz] of corners) {
        const a = Math.atan2(qx - px, qz - pz);
        a0 = Math.min(a0, a); a1 = Math.max(a1, a);
      }
      if (a1 - a0 > Math.PI) { a0 = -Math.PI; a1 = Math.PI; }      // standing inside the span
      let hit = false, clear = false, firstBlocker = null;
      if (drill) {
        // `nearWallCam`, character for character: planar, to the camera's own position, and it is
        // the ONLY thing standing between `perf.act` and the mount filling.
        if (Math.hypot(px - target.x, pz - target.z) < DRILL_REACH) {
          hit = true;
          for (const [qx, qz] of corners) {
            const v = [qx - px, eyeAtY - EYE_Y, qz - pz];
            const L = Math.hypot(v[0], v[1], v[2]);
            if (L < 1e-6) { clear = true; break; }
            const d = [v[0] / L, v[1] / L, v[2] / L];
            let block = null;
            for (const b of bodies) {
              const tB = rayBox(eye, d, L - 1e-4, b);
              if (tB >= 0) { block = b; break; }
            }
            if (!block) { clear = true; break; }
            if (!firstBlocker) firstBlocker = block;
          }
        }
      } else {
        for (let k = 0; k < YAWS; k++) {
          const yaw = a0 + ((a1 - a0) * k) / (YAWS - 1);
          const r = swingRay(eye, yaw, target.channel);
          const tT = rayBox(r.o, r.d, r.far, B);
          if (tT < 0) continue;
          hit = true;
          let block = null;
          for (const b of bodies) {
            const tB = rayBox(r.o, r.d, r.far, b);
            if (tB >= 0 && tB < tT - 1e-6) { block = b; break; }
          }
          if (!block) { clear = true; break; }
          if (!firstBlocker) firstBlocker = block;
        }
      }
      if (hit) standReach++;
      if (hit && walkable) {
        inReach++;
        nearest = Math.min(nearest, Math.hypot(dxm, dzm));
        if (clear) {
          sighted++;
          // Head-on: inside the target's own lateral band, on the face it presents.
          if (target.normal) {
            const along = target.normal[0] ? pz : px;
            const c = target.normal[0] ? (B.z0 + B.z1) / 2 : (B.x0 + B.x1) / 2;
            if (Math.abs(along - c) <= target.lateral) frontal++;
          } else if (Math.hypot(px - target.x, pz - target.z) <= WORK_AIM_RANGE) frontal++;
        } else {
          occluded++;
          if (firstBlocker) blockers.set(firstBlocker.id, (blockers.get(firstBlocker.id) ?? 0) + 1);
        }
      }
    }
  }

  /* ---- how much of the target a runner within swinging distance can actually SEE -----------
   *
   * The cell counts above answer "is there a spot". This answers "and how much of the thing is
   * in front of you when you get there", which is the half of the live report that the cell
   * counts miss: on the vitrine seeds there ARE clear cells, at the two 8 cm slivers of frame
   * the case does not cover, and a player standing in one of them is looking at a display case
   * with a picture frame poking out either side. The samples sit on the face the target presents
   * into the room, at the height the swing ray occupies, and a sample counts as seen when ANY
   * approachable cell inside the channel's own reach has a clear straight line to it.
   */
  const FACE_N = 15;
  const faceY = Math.min(B.y1 - 0.02, Math.max(B.y0 + 0.02, EYE_Y - 0.06));
  const faceQs = [];
  if (target.normal) {
    const alongZ = target.normal[0] === 1;                  // faces +x, so it spans z
    const lo = alongZ ? B.z0 : B.x0, hi = alongZ ? B.z1 : B.x1;
    const at = alongZ ? B.x1 : B.z1;                        // the face it presents into the room
    for (let k = 0; k < FACE_N; k++) {
      const u = lo + ((hi - lo) * (k + 0.5)) / FACE_N;
      faceQs.push(alongZ ? [at, faceY, u] : [u, faceY, at]);
    }
  } else {
    for (let k = 0; k < FACE_N; k++) {                      // a free-standing prop: its whole rim
      const a = (Math.PI * 2 * k) / FACE_N;
      faceQs.push([
        (B.x0 + B.x1) / 2 + Math.sin(a) * (B.x1 - B.x0) / 2,
        faceY,
        (B.z0 + B.z1) / 2 + Math.cos(a) * (B.z1 - B.z0) / 2,
      ]);
    }
  }
  const far = drill ? DRILL_REACH
    : (target.channel === 'mission' ? MISSION_REACH : WORK_AIM_RANGE);
  let faceSeen = 0;
  for (const Q of faceQs) {
    let seen = false;
    for (let i = 0; i < nx && !seen; i++) {
      for (let j = 0; j < nz; j++) {
        if (!walk[i * nz + j]) continue;
        const px = gx0 + i * GRID, pz = gz0 + j * GRID;
        const v = [Q[0] - px, Q[1] - EYE_Y, Q[2] - pz];
        const L = Math.hypot(v[0], v[1], v[2]);
        if (L > far || L < 1e-6) continue;
        const d = [v[0] / L, v[1] / L, v[2] / L];
        let blocked = false;
        for (const b of bodies) {
          const tB = rayBox([px, EYE_Y, pz], d, L - 1e-4, b);
          if (tB >= 0) { blocked = true; break; }
        }
        if (!blocked) { seen = true; break; }
      }
    }
    if (seen) faceSeen++;
  }

  return {
    standN, walkN, doorSeeds: seeds.length, inReach, standReach, occluded, sighted, frontal,
    faceSeen, faceN: FACE_N, faceVis: faceSeen / FACE_N,
    nearest: Number.isFinite(nearest) ? nearest : null,
    intersects: intersects.map((b) => b.id),
    blockers: [...blockers.entries()].sort((a, b) => b[1] - a[1]),
  };
}

/* =============================================================================================
 * THE SWEEP
 * ============================================================================================= */

/**
 * Every way INTO a room. OPEN portals plus BREACHABLE leaves — you smash a leaf and walk through,
 * so it is a door. `x.g*` EXIT panels name `outside`, which is not playable floor, so they are a
 * way out of the plan and never a way in; `survey` drops them again by the same rule.
 */
function doorsOf(tables) {
  return [
    ...(tables.portals ?? []),
    ...(tables.panels ?? []).filter((p) => p.a !== 'outside' && p.b !== 'outside'),
  ];
}

function nightFor(ws) {
  const picked = pickPlanSeed(ws);
  const tables = generatedTables(picked.seed, PLAN_OPTS);
  const gallery = tables.spaces.find((s) => s.roomType === MISSION_ROOM) ?? null;
  const chapel = tables.spaces.find((s) => s.roomType === 'chapel') ?? null;
  const placements = catalogPlacements(tables.spaces, { portals: tables.portals });
  return { ws, planSeed: picked.seed, tables, gallery, chapel, placements };
}

/** Apply a control mutation to one target + its occluder set. Every one must produce a RED. */
function applyControl(kind, night, target, props) {
  if (!kind) return { target, props };
  const B = target.body;
  if (kind === 'bury') {
    // The target INSIDE a prop's body — T2's defect taken to its end. Expressed as a prop that
    // swallows the target rather than as a teleport, because `fireplace` is the only catalog row
    // wide enough (1.785 x 1.55 = 2.77 m, 2.60 m tall) to contain the 1.46 m frame WHOLE, and a
    // half-swallowed target is honestly still half-visible — which is precisely the shipped
    // vitrine case and is measured, not controlled for, in T2. Same geometry as a teleport; this
    // form leaves the rig no arguable residue to see through.
    return {
      target,
      props: [...props, {
        id: 'ctl.bury', catalogId: 'fireplace', spaceId: target.space?.id,
        x: (B.x0 + B.x1) / 2, z: (B.z0 + B.z1) / 2,
      }],
    };
  }
  if (kind === 'wall') {
    // Four bookcases at 1.1 m, boxing the target in. Nothing can stand within reach of it.
    const cxm = (B.x0 + B.x1) / 2, czm = (B.z0 + B.z1) / 2;
    const pen = [
      { id: 'ctl.n', catalogId: 'bookcase', spaceId: target.space?.id, x: cxm, z: czm - 1.1 },
      { id: 'ctl.s', catalogId: 'bookcase', spaceId: target.space?.id, x: cxm, z: czm + 1.1 },
      { id: 'ctl.w', catalogId: 'bookcase', spaceId: target.space?.id, x: cxm - 1.1, z: czm },
      { id: 'ctl.e', catalogId: 'bookcase', spaceId: target.space?.id, x: cxm + 1.1, z: czm },
    ];
    return { target, props: [...props, ...pen] };
  }
  if (kind === 'under') {
    // Dropped a storey. The swing ray never descends to it from any standing position.
    const dy = -3.0;
    return { target: { ...target, body: { ...B, y0: B.y0 + dy, y1: B.y1 + dy } }, props };
  }
  throw new Error(`unknown control "${kind}"`);
}

console.log(`\ntarget-sight — the smash target, seen and reached${CONTROL ? `  [CONTROL: ${CONTROL}]` : ''}`);

const rows = [];
const t0 = Date.now();
for (let ws = 0; ws < SEEDS; ws++) {
  const night = nightFor(ws);
  for (const built of [
    night.gallery ? paintingTarget(night.gallery, 'left') : null,
    night.gallery ? paintingTarget(night.gallery, 'right') : null,
    night.gallery ? camTarget(night.gallery) : null,
  ]) {
    if (!built) { rows.push({ ws, missing: true }); continue; }
    const space = built.space ?? night.gallery;
    const near = night.placements.filter((p) => p.spaceId === space?.id
      || Math.hypot(p.x - built.x, p.z - built.z) <= 6);
    const props = near.filter((p) => !(built.slot && p.id === built.slot.id));
    const { target, props: ctlProps } = applyControl(CONTROL, night, built, props);
    const m = survey(space, ctlProps, target, doorsOf(night.tables));
    rows.push({
      ws, planSeed: night.planSeed, kind: built.kind, episode: built.episode,
      room: space?.id ?? null, wantRoom: built.spec.room,
      inNamedRoom: space?.roomType === built.spec.room,
      propN: props.length, ...m,
    });
    if (VERBOSE) {
      console.log(`   ws=${ws} ${built.kind} props=${props.length} stand=${m.standN}`
        + ` walk=${m.walkN} reach=${m.inReach} sighted=${m.sighted} frontal=${m.frontal}`
        + ` occluded=${m.occluded} intersect=[${m.intersects.join(',')}]`);
    }
  }
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

const paintings = rows.filter((r) => r.kind === 'painting');
const camsR = rows.filter((r) => r.kind === 'cam');

/* =============================================================================================
 * G · GROUND TRUTH FIRST. "Every target is visible" is trivially TRUE of zero targets.
 *
 * Nothing below T is allowed to run on an empty census, so the census IS an assertion: the
 * counts, the per-seed non-emptiness of every input the sight test consumes, and the source
 * agreement of the two models this file re-derives. A rig that stopped producing targets, or a
 * placer that stopped producing occluders, goes RED here rather than green in T.
 * ============================================================================================= */

console.log(`\n  ground truth · ${SEEDS} world seeds in ${elapsed}s`);

t('G1 · every world seed builds a gallery carrying BOTH twins and the wall cam',
  rows.filter((r) => r.missing).length === 0 && rows.length === SEEDS * 3,
  `${rows.length} targets over ${SEEDS} seeds, ${rows.filter((r) => r.missing).length} missing`);

t('G2 · every mission room is DRESSED — a placer that stopped placing would make T vacuous',
  rows.every((r) => r.propN >= 0) && paintings.every((r) => r.propN > 0)
  && paintings.reduce((a, r) => a + r.propN, 0) >= SEEDS * 3,
  `gallery props ${Math.min(...paintings.map((r) => r.propN))}–${Math.max(...paintings.map((r) => r.propN))}`
  + `, ${paintings.reduce((a, r) => a + r.propN, 0)} total`);

t('G3 · both jobs have a target, in the room their own mission copy names',
  paintings.length === SEEDS * 2 && camsR.length === SEEDS
  && rows.every((r) => r.inNamedRoom)
  && missionFor(1) === MISSION_PAINTING && missionFor(2) === MISSION_DRILL,
  `${paintings.length} twin faces in ${MISSION_PAINTING.room}, ${camsR.length} cams in ${MISSION_DRILL.room}`);

t('G4 · this file\'s hang matches `jobs.js` / follow-bed twins — it re-derives it, so it must be checked',
  /function twinHang/.test(src('src/party/jobs.js'))
  && /function buildTwinPaintings/.test(src('src/game/follow-bed.js'))
  && /function buildOneFace/.test(src('src/game/follow-bed.js'))
  && /TWIN\.frameW/.test(src('src/game/follow-bed.js')));

t('G5 · ...and the swing: eye, body, the fixed pitch, both reaches, and the 1.25 m collider',
  /this\.radius = this\.height \* 0\.20/.test(src('src/game/player.js'))
  && /this\.aimPitch = -0\.06;/.test(src('src/game/player.js'))
  && /aimYaw: operator\.basisYaw\(\),/.test(src('src/game/follow-bed.js'))
  && !/aimPitch:/.test(src('src/game/follow-bed.js'))                       // clause 4, still true
  && /const PAINTING_REACH = WEAPON_RANGE\.sledge \+ 0\.35;/.test(src('src/game/follow-bed.js'))
  && /_paintRay\.far = PAINTING_REACH;/.test(src('src/game/follow-bed.js'))
  && /const WORK_AIM_RANGE = WEAPON_RANGE\.sledge \+ 0\.9;/.test(src('src/game/player.js'))
  && /dir\.y -= 0\.18; dir\.normalize\(\);/.test(src('src/game/player.js'))
  && /Math\.max\(dim\.h, spec\.targetH \?\? 1\.2, 1\.25\)/.test(src('src/game/furn-layout.js'))
  && Math.abs(EYE_Y - 1.5385) < 1e-9 && Math.abs(MISSION_REACH - 1.90) < 1e-9,
  `eye ${EYE_Y.toFixed(4)} m · r ${BODY_R.toFixed(2)} m · pitch ${AIM_PITCH} rad`
  + ` · reach ${MISSION_REACH.toFixed(2)} / ${WORK_AIM_RANGE.toFixed(2)} m`);

t('G5b · ...and the DRILL, which has no ray at all — `nearWallCam` is a planar radius',
  /function nearWallCam\(\)/.test(src('src/game/follow-bed.js'))
  && /Math\.hypot\(dx, dz\) < 1\.85;/.test(src('src/game/follow-bed.js'))
  && /perf\.act > 0\.5 && nearWallCam\(\)/.test(src('src/game/follow-bed.js'))
  // If the mount ever grows an aim test, clause 4 comes back for this channel and this goes red.
  && !/aimD(ir|ist)[^\n]*wallCam/.test(src('src/game/follow-bed.js'))
  && Math.abs(DRILL_REACH - 1.85) < 1e-9,
  `drill reach ${DRILL_REACH.toFixed(2)} m planar · ${camsR.length} cam targets on the drill channel`);

t('G6 · every survey had floor to stand on — a room with no floor would make T vacuous',
  rows.every((r) => r.standN > 0),
  `stand ${Math.min(...rows.map((r) => r.standN))}\u2013${Math.max(...rows.map((r) => r.standN))} cells`
  + ` at ${GRID} m, ${sumOf(rows, (r) => r.standN)} total`);

t('G7 · ...and each channel could reach its target from SOME standable cell, doors and props aside',
  rows.every((r) => r.standReach > 0),
  `${rows.filter((r) => r.standReach === 0).length} of ${rows.length} out of reach from anywhere`
  + ` · worst ${Math.min(...rows.map((r) => r.standReach))} cells`);

/*
 * G8 · the same property `party-warm` W7 asserts rather than trusts: this gate must run in CI with
 * no `npm install`. A TOP-LEVEL `three` anywhere in the static graph would make it die on the
 * runner instead of failing honestly. `furn-layout.js`'s GLTFLoader import is deliberate and
 * DYNAMIC — `dressCatalogFurniture` returns early on `typeof document === 'undefined'` and is
 * never called from here — so the walk below counts static edges only.
 */
{
  const seen = new Set(), bare = new Set();
  const walkImports = (f) => {
    if (seen.has(f)) return;
    seen.add(f);
    let text;
    try { text = readFileSync(f, 'utf8'); } catch { return; }
    for (const m of text.matchAll(/^\s*(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/gm)) {
      const spec = m[1];
      if (!spec.startsWith('.')) { if (!spec.startsWith('node:')) bare.add(spec); continue; }
      walkImports(join(dirname(f), spec));
    }
  };
  walkImports(fileURLToPath(import.meta.url));
  t('G8 · the whole import graph is pure node — no three, no dom, nothing CI must install',
    bare.size === 0 && seen.size > 8,
    `${seen.size} modules, ${bare.size ? [...bare].join(' ') : 'no bare specifiers'}`);
}

/* =============================================================================================
 * T · THE SHIPPED ARM
 * ============================================================================================= */

console.log('\n  the shipped arm');

const pierced = rows.filter((r) => r.intersects.length);
// The conservative recount: unboosted catalog half-spans, i.e. the smallest a prop can be.
let piercedRaw = 0;
for (let ws = 0; ws < SEEDS; ws++) {
  const night = nightFor(ws);
  const built = night.gallery ? paintingTarget(night.gallery, 'left') : null;
  if (!built) continue;
  const near = night.placements.filter((p) => p.spaceId === night.gallery.id);
  if (near.some((p) => boxesOverlap(propBody(p, { boost: 1 }), built.body))) piercedRaw++;
}
const byCause = pierced.reduce((m, r) => {
  for (const id of r.intersects) m[id] = (m[id] ?? 0) + 1;
  return m;
}, {});

const sealed = rows.filter((r) => r.doorSeeds === 0);

t('T1 · the mission room can be WALKED INTO — it has an interior doorway, and floor behind it',
  sealed.length === 0 && rows.every((r) => r.walkN > 0),
  `${sealed.length}/${rows.length} mission rooms sealed`
  + (sealed.length ? ` · ${sealed.map((r) => `ws${r.ws}/${r.kind} ${r.room}`).join(', ')}` : '')
  + ` · door landings ${Math.min(...rows.map((r) => r.doorSeeds))}\u2013${Math.max(...rows.map((r) => r.doorSeeds))}`);

t('T2 · no dressed prop\'s body intersects a mission target\'s body',
  pierced.length === 0,
  `${pierced.length}/${rows.length} targets pierced`
  + ` [${Object.entries(byCause).map(([k, v]) => `${k}\u00d7${v}`).join(' ')}]`
  + ` · unboosted recount ${piercedRaw}/${SEEDS} paintings`
  + (pierced.length ? ` · seeds ${pierced.slice(0, 12).map((r) => r.ws).join(',')}${pierced.length > 12 ? '\u2026' : ''}` : ''));

t('T3 · every target is SIGHTED — standable, walkable-to, in reach, and nothing in between',
  rows.every((r) => r.sighted > 0),
  `worst ${Math.min(...rows.map((r) => r.sighted))} cells`
  + ` · ${rows.filter((r) => r.sighted === 0).length} blind`);

t('T4 · ...and head-on, from inside the target\'s own width — not only from an oblique edge',
  rows.every((r) => r.frontal > 0),
  `worst ${Math.min(...rows.map((r) => r.frontal))} cells`
  + ` · ${rows.filter((r) => r.frontal === 0).length} edge-only`);

// T5 and T6 are about OCCLUSION, so they are measured over the targets a runner can actually get
// in front of. A sealed room has no in-reach cell to divide by and T1/T3 already carry it — but
// the denominator is asserted and printed, so the day this set shrinks it is red, not silent.
const lit = rows.filter((r) => r.inReach > 0);
const worstClear = lit.reduce((w, r) => {
  const f = r.sighted / r.inReach;
  return f < w.f ? { f, r } : w;
}, { f: Infinity, r: null });
const worstFace = lit.reduce((w, r) => (r.faceVis < w.faceVis ? r : w), { faceVis: Infinity });

t('T5 · at least half the places you can swing from can also SEE what you are swinging at',
  lit.length === rows.length && lit.every((r) => r.sighted / r.inReach >= 0.5),
  `worst ${(worstClear.f * 100).toFixed(0)}% of cells on ws=${worstClear.r?.ws} (${worstClear.r?.kind})`
  + `, blockers ${worstClear.r?.blockers.map(([k, v]) => `${k}\u00d7${v}`).join(' ') || 'none'}`
  + ` · measured over ${lit.length}/${rows.length}`);

t('T6 · and at least half of the TARGET is visible from inside swinging distance',
  lit.length === rows.length && lit.every((r) => r.faceVis >= 0.5),
  `worst ${(worstFace.faceVis * 100).toFixed(0)}% of the face on ws=${worstFace.ws} (${worstFace.kind})`
  + ` · ${lit.filter((r) => r.faceVis < 0.5).length} targets under half visible`
  + ` · ${lit.filter((r) => r.faceVis === 0).length} invisible`);

/*
 * T7 · **THE MECHANISM, NOT THE OUTCOME.** T2 reads 0/192, and 0/192 is also what you get from a
 * lucky seed order. This asks the placer's own answer instead: `missionKeepOuts` must yield a rect
 * for EACH mission target in EACH mission room, every rect must actually contain the hang it was
 * built from, and no placement's DRAWN body may enter one. That last clause is `accept`'s own
 * `blockedBy(propFootprint(...), keepOuts)` re-asked from outside, so a keep-out that was computed
 * and then not consulted is red here while T2 stays green.
 */
{
  let rects = 0, rooms = 0, missing = [], holdsHang = true, entered = [];
  for (let ws = 0; ws < SEEDS; ws++) {
    const night = nightFor(ws);
    const keeps = missionKeepOuts(night.tables.spaces);
    const gal = night.gallery;
    if (!gal) continue;
    rooms++;
    rects += keeps.length;
    const forRoom = keeps.filter((k) => k.id.startsWith(`${gal.id}.`));
    for (const want of ['painting', 'wallcam']) {
      if (!forRoom.some((k) => k.id === `${gal.id}.${want}`)) missing.push(`ws${ws}/${want}`);
    }
    // Every rect must contain the thing it exists to protect, both twin faces included.
    for (const hang of [twinHang(gal, 'left'), twinHang(gal, 'right'), camHang(gal)]) {
      if (!hang) continue;
      const k = forRoom.find((r) => hang.x >= r.x0 && hang.x <= r.x1 && hang.z >= r.z0 && hang.z <= r.z1);
      if (!k) holdsHang = false;
    }
    for (const p of night.placements) {
      const spec = SPEC.get(p.catalogId);
      const h = drawHalf(spec);
      if (!(h > 0)) continue;
      const foot = { x0: p.x - h, x1: p.x + h, z0: p.z - h, z1: p.z + h };
      for (const k of keeps) {
        if (foot.x0 < k.x1 && k.x0 < foot.x1 && foot.z0 < k.z1 && k.z0 < foot.z1) {
          entered.push(`ws${ws} ${p.catalogId}→${k.id}`);
        }
      }
    }
  }
  t('T7 · the placer holds BOTH mission targets clear — a rect each, over the real hang, and honoured',
    rooms === SEEDS && rects === SEEDS * 2 && missing.length === 0
    && holdsHang && entered.length === 0,
    `${rects} rects over ${rooms} mission rooms`
    + `${missing.length ? ` · MISSING ${missing.slice(0, 6).join(',')}` : ''}`
    + `${holdsHang ? '' : ' · a rect does not cover its own hang'}`
    + ` · ${entered.length} prop bodies inside a keep-out`
    + (entered.length ? ` [${entered.slice(0, 6).join(', ')}]` : ''));
}

/* =============================================================================================
 * C · THE CONTROLS. Three breakages that must go RED, and two that must stay GREEN.
 *
 * C1–C3 are run through the SAME `survey`, on the SAME real seeds, so they exercise the shipped
 * path rather than a parallel one. If any of them ever reports a sighted cell, this instrument
 * has gone blind and every T above it is worthless.
 * ============================================================================================= */

console.log('\n  controls');

function controlSweep(kind, n = Math.min(SEEDS, 16), mk = (g) => paintingTarget(g, 'left')) {
  const out = [];
  for (let ws = 0; ws < n; ws++) {
    const night = nightFor(ws);
    const built = night.gallery ? mk(night.gallery) : null;
    if (!built) continue;
    const props = night.placements.filter((p) => p.spaceId === night.gallery.id);
    const c = applyControl(kind, night, built, props);
    out.push(survey(night.gallery, c.props, c.target, doorsOf(night.tables)));
  }
  return out;
}

const cBury = controlSweep('bury');
t('C1 control · a target inside a prop\'s body is sighted from NOWHERE, and 0% of it is visible',
  cBury.length > 0 && cBury.every((m) => m.sighted === 0)
  && cBury.every((m) => m.intersects.length > 0) && cBury.every((m) => m.faceVis === 0),
  `${cBury.length} seeds, sighted ${cBury.reduce((a, m) => a + m.sighted, 0)}`
  + `, still standable ${Math.min(...cBury.map((m) => m.standN))}+ cells`);

const cWall = controlSweep('wall');
t('C2 control · a target boxed in by four cases is sighted from NOWHERE, though the room is fine',
  cWall.length > 0 && cWall.every((m) => m.sighted === 0)
  && cWall.every((m) => m.faceVis === 0) && cWall.every((m) => m.walkN > 100),
  `${cWall.length} seeds, sighted ${cWall.reduce((a, m) => a + m.sighted, 0)}`
  + `, floor still walkable ${Math.min(...cWall.map((m) => m.walkN))}+ cells`);

const cUnder = controlSweep('under');
t('C3 control · a target under the floor is never entered by the swing ray',
  cUnder.length > 0 && cUnder.every((m) => m.inReach === 0 && m.sighted === 0),
  `${cUnder.length} seeds, in-reach ${cUnder.reduce((a, m) => a + m.inReach, 0)}`);

/*
 * 🚨 **C6 AND C7 ARE THE PRICE OF THE DRILL CHANNEL.** Sixty-four targets went from RED to green
 * the moment `camTarget` stopped being modelled as a swing, and a change with that shape has to
 * prove it did not simply stop asking. C6 breaks the drill the way a placer really could; C7
 * recomputes the radius independently, so deleting `nearWallCam`'s test would show up as the
 * whole room being in reach rather than as silence.
 */
const cWallCam = controlSweep('wall', Math.min(SEEDS, 16), (g) => camTarget(g));
t('C6 control · the wall camera boxed in by four cases is DRILLED from nowhere, though it is in radius',
  cWallCam.length > 0 && cWallCam.every((m) => m.sighted === 0)
  && cWallCam.every((m) => m.faceVis === 0) && cWallCam.every((m) => m.inReach > 0),
  `${cWallCam.length} seeds, sighted ${cWallCam.reduce((a, m) => a + m.sighted, 0)}`
  + `, still within reach from ${Math.min(...cWallCam.map((m) => m.inReach))}+ cells`
  + ` — the radius says yes and the LOOK says no`);

{
  /*
   * The radius, counted by hand on an empty room, against the same grid `survey` walks. Not a
   * second call to `survey` — the whole point is that this arithmetic is independent of it. An
   * empty 12 x 8 gallery has no occluder, so `inReach` here is EXACTLY the standable cells inside
   * `nearWallCam`. Delete the radius test in `survey` and this number becomes the room.
   */
  const room = { id: 'ctl.drill', roomType: 'gallery', x0: 0, x1: 12, z0: 0, z1: 8 };
  const portals = [{ id: 'p', a: 'ctl.drill', b: 'x', x: 6, z: 8, w: 1.9, axis: 'x' }];
  const cam = camTarget(room);
  const m = survey(room, [], cam, portals);
  const gx0 = room.x0 + BODY_R, gx1 = room.x1 - BODY_R;
  const gz0 = room.z0 + BODY_R, gz1 = room.z1 - BODY_R;
  const nx = Math.floor((gx1 - gx0) / GRID) + 1, nz = Math.floor((gz1 - gz0) / GRID) + 1;
  let want = 0;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      if (Math.hypot(gx0 + i * GRID - cam.x, gz0 + j * GRID - cam.z) < DRILL_REACH) want++;
    }
  }
  t('C7 control · `nearWallCam`\'s 1.85 m is LIVE — counted by hand, it is a disc and not the room',
    m.inReach === want && want > 0 && want < nx * nz / 4 && m.sighted === want,
    `${m.inReach} cells in reach, ${want} counted independently, of ${nx * nz} in a ${
      room.x1 - room.x0} x ${room.z1 - room.z0} m room · all ${m.sighted} of them see it`);
}

// The other direction. A rig that says NO to everything is as blind as one that says YES.
{
  const room = { id: 'ctl.gallery', roomType: 'gallery', x0: 0, x1: 12, z0: 0, z1: 8 };
  const portals = [{ id: 'p', a: 'ctl.gallery', b: 'x', x: 6, z: 8, w: 1.9, axis: 'x' }];
  const bare = survey(room, [], paintingTarget(room, 'left'), portals);
  t('C4 control · an undressed gallery sights its whole painting from hundreds of cells',
    bare.sighted > 100 && bare.frontal > 0 && bare.occluded === 0 && bare.faceVis === 1,
    `${bare.sighted} sighted of ${bare.inReach} in reach, ${bare.frontal} head-on,`
    + ` ${(bare.faceVis * 100).toFixed(0)}% of the face visible`);

  const low = survey(room, [
    { id: 'c.ott', catalogId: 'ottoman', spaceId: room.id, x: 6, z: 1.0 },
    { id: 'c.rug', catalogId: 'rug-circle', spaceId: room.id, x: 6, z: 1.6 },
  ], paintingTarget(room, 'left'), portals);
  /*
   * At the SHIPPED inset, in front of a twin face. `candidatesFor` gives the vitrine
   * `max(0.62, halfSpan + 0.18)` = 0.62 and its drawn half is 0.651 — so the case's own body
   * reaches 3 cm BEHIND the wall line and straight through a frame hung 22 cm off it. That
   * arithmetic has not changed and is still the playtest sentence. What changed is that a real
   * placer can no longer CHOOSE that slot: `missionKeepOuts` refuses it, which is what T7 asserts.
   * So it is placed here by hand, at the LEFT face's own x rather than the room's centre — the
   * twins hang at `cx ± TWIN_OFFSET` and a case at the midpoint now sits in the gap BETWEEN them,
   * which is the honest reason this control's old numbers went stale rather than any rig change.
   */
  const face = twinHang(room, 'left');
  const tall = survey(room, [
    { id: 'c.vit', catalogId: 'vitrine', spaceId: room.id, x: face.x, z: room.z0 + 0.62 },
  ], paintingTarget(room, 'left'), portals);
  // ...and the same case at the MIDPOINT, where the pair leaves it a gap. It must NOT read as a
  // burial: a control that goes red for the wrong reason teaches nothing.
  const gap = survey(room, [
    { id: 'c.vit', catalogId: 'vitrine', spaceId: room.id, x: 6, z: room.z0 + 0.62 },
  ], paintingTarget(room, 'left'), portals);
  t('C5 control · a 0.52 m ottoman never occludes an eye-height ray; a vitrine at the shipped inset buries the face it stands at',
    low.occluded === 0 && low.sighted > 0 && low.faceVis === 1
    && tall.intersects.includes('vitrine') && tall.faceVis < 0.2
    && gap.faceVis > tall.faceVis,
    `ottoman+rug ${low.occluded} occluded / ${low.sighted} sighted / ${(low.faceVis * 100).toFixed(0)}% seen`
    + ` · vitrine at the face ${tall.occluded} occluded / ${(tall.faceVis * 100).toFixed(0)}% seen`
    + ` · same case in the twins' gap ${(gap.faceVis * 100).toFixed(0)}% seen`);
}

/* =============================================================================================
 * THE READING
 * ============================================================================================= */

const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
console.log(`\n  reading · ${rows.length} targets over ${SEEDS} world seeds`
  + ` (${paintings.length} twin faces, ${camsR.length} wall cams)`);
console.log(`  reading · ${sum((r) => r.propN)} dressed props modelled as occluders`
  + `, ${sum((r) => r.standN)} standable floor cells at ${GRID} m`);
console.log(`  reading · sighted cells per target: `
  + `${Math.min(...rows.map((r) => r.sighted))}–${Math.max(...rows.map((r) => r.sighted))}`
  + ` (median ${rows.map((r) => r.sighted).sort((a, b) => a - b)[rows.length >> 1]})`);
console.log(`  reading · targets pierced by a prop: ${pierced.length}`
  + ` — ${Object.entries(byCause).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
if (pierced.length) {
  console.log(`  reading · pierced seeds: ${pierced.map((r) => `${r.ws}/${r.kind[0]}`).join(' ')}`);
}
{
  const occl = rows.filter((r) => r.occluded > 0);
  console.log(`  reading · targets with any occluded swing position: ${occl.length}`
    + ` · worst clear fraction ${(worstClear.f * 100).toFixed(0)}%`
    + ` · commonest blocker ${[...rows.flatMap((r) => r.blockers)
      .reduce((m, [k, v]) => m.set(k, (m.get(k) ?? 0) + v), new Map())]
      .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
}
console.log(`  reading · target face visible from swinging distance: `
  + `${Math.round(Math.min(...rows.map((r) => r.faceVis)) * 100)}%\u2013`
  + `${Math.round(Math.max(...rows.map((r) => r.faceVis)) * 100)}%`
  + ` (median ${Math.round(rows.map((r) => r.faceVis).sort((a, b) => a - b)[rows.length >> 1] * 100)}%)`);
console.log(`  reading · nearest legal stand-off: `
  + `${Math.min(...rows.filter((r) => r.nearest != null).map((r) => r.nearest)).toFixed(2)} m`);
console.log(`\n  ${pass} ok · ${fail} fail\n`);
process.exit(fail ? 1 : 0);
