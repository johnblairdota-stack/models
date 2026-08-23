import * as THREE from 'three';
import {
  CONNECTOR, CONNECTOR_STATES, CONNECTOR_W, CONNECTOR_H, CONNECTOR_CY,
  clearWidth, isExitSite,
} from './connectors.js';
import { generatedTables } from '../world/genplan.js';

/**
 * THE FLOOR PLAN, AS DATA.
 *
 * `room.js` is the builder; this is the table it builds from. Nothing in here imports
 * three.js scene machinery and nothing in here touches the engine — the point is that a
 * later agent can change the shape of the house without reading a line of the builder.
 *
 * MILESTONE STATE: **M3/M4 — the floor plan is COMPLETE.** Six spaces: two hubs (`gallery`
 * north, `ballroom` south) joined by three parallel routes (`study_w`, `service`, `study_e`),
 * plus the `chapel` dead-end spur hanging off the gallery.
 * Three parallel routes give three independent cycles, so "which way round" is a real choice
 * rather than "clockwise or anticlockwise".
 * See `docs/slices/task-mansion.md` §2.
 *
 * 🚨 **2026-08-08 — THE GALLERY END OF THAT PICTURE CHANGED.** John removed every gallery
 * doorway except D1 (`study_w`, the player's spawn room): D2 (`service`) and D3 (`study_e`)
 * are gone with no replacement, D7 (`chapel`, the deliberately-narrow refuge door) is gone too.
 * The three parallel routes still meet at the ballroom end (D4/D5/D6, untouched) and `study_e`
 * and `chapel` each keep one breachable route into the gallery (`p.gal_e`, `p.chapel`); `service`
 * now reaches the gallery only indirectly, through a study or the ballroom. See the note above
 * `PORTALS`, below, for the full account and the mechanic D7 took with it.
 *
 * 🆕 **2026-08-09 — `SPACES` IS NO LONGER AUTHORED. IT IS `roomsFromPlan(HOUSE_PLAN)`**
 * (`localise-1`). Each room is a footprint plus its content in its OWN frame (`ROOMS`), placed
 * by a centre and a quarter turn (`HOUSE_PLAN`). Every emitted row is byte-identical to the row
 * that used to be written by hand — see the long note above `ROOMS`, and the gate,
 * `node harness/_loc1_golden.mjs --check`. The builder's contract is unchanged.
 *
 * CONVENTIONS, and they matter to the builder:
 *
 *  · A space's `x0/x1/z0/z1` are INTERIOR CLEAR extents. Walls sit OUTSIDE them. They are now
 *    DERIVED from a footprint and a placement, not typed in; the values are the same doubles.
 *  · A boundary wall is emitted as a SKIN on the owning space's side. When two spaces abut
 *    across a 0.30 band, each emits a 0.15 skin and the two meet in the middle of the
 *    band. That is not a saving — it is what makes residency safe. If one space owned the
 *    whole slab, hiding that space would punch a hole in the wall its neighbour is looking
 *    at, and the neighbour would render the void behind it. Every space always draws its
 *    own four walls.
 *  · Walls whose normal runs along Z extend WALL_T past the space on each side, so corners
 *    are closed by them; walls whose normal runs along X do not. (Same convention the
 *    pre-mansion hall used.)
 *  · `PORTALS` and `PANELS` name the wall they cut by `{a, b}` space pair — or by
 *    `{a, b}` being the same id, which means an INNER wall of that space (the M1 divider).
 *
 * ⚠️ EVERY ROW IN BOTH TABLES IS NOW A **CONNECTOR** (`src/game/connectors.js`), AND
 * `CONNECTORS` AT THE BOTTOM OF THIS FILE IS THE ONE TABLE THE BUILDER READS.
 *
 * `docs/design/procedural-map.md` §3 and §6.1. A connector is a hole in a wall between two
 * places, with one aperture, one dressing and four states — `open` / `breachable` / `chained` /
 * `exit`. `PORTALS` is the `open` rows and `PANELS` is the rest; they are kept as named exports
 * because the ids in `PANELS` are a **network protocol surface** and half the harness reaches
 * for them, but nothing in the build branches on which array a row came from any more.
 *
 * ⚠️ **THE ORDER OF `PANELS` IS LOAD-BEARING TWICE OVER.** `WallField.add(id)` /
 * `DestructibleWall.syncStage()` key on the id strings, and `run.js`'s `chooseExit()` derives
 * the live site from the POOL ORDER — so appending is safe, and inserting or renumbering
 * re-rolls every seed in every doc. `CONNECTORS` is built by concatenation in exactly this
 * order for that reason, and `conn-1.mjs` asserts the round trip.
 */

/**
 * 🎯 task-plangen-1 — a generated house behind `?plan=gen&planseed=N`. **NOT `?estate=`** — see
 * the slice's trap 1: `estateMode()` (`estate-spike.js`) matches a fixed token list and would
 * silently turn the whole `?estate=port` art port off for a token it does not recognise.
 *
 * ⚠️ **PLACED HERE, NOT BESIDE `SLAB_ARM`/`DOORS_URL` FURTHER DOWN, AND THAT IS A CORRECTION TO
 * THE PLAN, VERIFIED RATHER THAN STYLED.** `task-plangen-1.md`'s Change 1 says to anchor this
 * block immediately after `SLAB_ARM`/`DOORS_URL` (near `PASSAGE_DOORS_ON`), and its Change 2
 * reads `SPACES` off `GEN` — but `SPACES` is declared far ABOVE that point in this file. A `const`
 * is in the temporal dead zone until its own declaration executes, regardless of where in the
 * file it is textually declared relative to other code, so `SPACES = GEN ? ... : ...` at its own
 * declaration line would throw `ReferenceError: Cannot access 'GEN' before initialization` if
 * `GEN` were declared later, as the plan's anchor literally asks. Verified by moving it there and
 * running `npm run build`: build fails. `GEN` has to exist before the first line that reads it,
 * which is `SPACES` — so it is declared before `SPACES` instead, right after the constants this
 * file already opens with.
 */
const PLAN_URL = typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('plan') === 'gen';
const PLAN_SEED = PLAN_URL
  ? (new URLSearchParams(location.search).get('planseed') ?? '0') : null;
/** `?plan<name>=` -> a number, or `d` when absent/unparsable. Guarded for node, same as below. */
function numOr(name, d) {
  if (typeof location === 'undefined') return d;
  const v = new URLSearchParams(location.search).get(name);
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : d;
}
export const GEN = PLAN_URL ? generatedTables(PLAN_SEED, {
  // ⚠️ PASSED THROUGH, NOT TUNED. The three placement dials are John's to turn, per the
  // project's own rule about shipping taste decisions as live toggles with arm 0 unchanged.
  align: numOr('planalign', 0.35), gap: numOr('plangap', 2.2), waste: numOr('planwaste', 0.04),
  /**
   * 🏠 **`?planrooms=` — HOW MANY ROOMS. Default 3, John, 2026-08-12:** *"I think I also want to
   * make them smaller. 3 rooms instead of 6."*
   *
   * ⚠️ **THE DEFAULT IS 3 HERE AND UNCHANGED IN `genspike.mjs`, DELIBERATELY.** The generator is
   * shared with the map designer and with `house-packing.md`'s 512-seed corpus, all of which
   * measured six mandatory rooms; moving the default there would silently re-roll every recorded
   * figure in that document. **The GAME asks for 3; the spike keeps what it measured.**
   * `?planrooms=6` is the old house.
   *
   * ⚠️ **This re-rolls every generated seed** — a different room set means a different plan, so
   * any "seed N looks like…" note from before today is void, and the known bad seeds (3, 5, 7,
   * 12, 14) are no longer the known bad seeds.
   */
  rooms: numOr('planrooms', 3),
}) : null;

export const WALL_T = 0.30;
export const DOOR_H = 2.72;
/**
 * ⚠️ THE PANEL APERTURE NOW LIVES IN `connectors.js` AS `CONNECTOR_W/H/CY` AND THESE THREE ARE
 * ALIASES. It moved because it stopped being "how big a destructible panel is" and became "the
 * one clear width and height that breachable, chained and exit connectors all share, so that
 * from the closed side they are indistinguishable" (`procedural-map.md` §2). Same numbers, so
 * every existing panel is byte-identical; the difference is that there is now one place to
 * change it and one place that has to justify a deviation.
 */
export const PANEL_W = CONNECTOR_W;
export const PANEL_H = CONNECTOR_H;
export const PANEL_CY = CONNECTOR_CY;

// ---------------------------------------------------------------------------
// A room, its own frame, and where the house puts it
// ---------------------------------------------------------------------------

/**
 * 🆕 **EVERY ROOM IS NOW A FOOTPRINT, ITS CONTENT IN ITS OWN FRAME, AND A PLACEMENT**
 * (`localise-1`, 2026-08-09). `SPACES` is no longer authored — it is `roomsFromPlan(HOUSE_PLAN)`
 * — and every row it emits is **byte-identical to the row that used to be written here**: 1192
 * exported leaves, `Object.is`-equal, gated by `node harness/_loc1_golden.mjs --check`.
 *
 * 🚨 **WHY, AND IT IS THE CAMPAIGN'S BIGGEST SINGLE COST RATHER THAN A TIDY-UP.**
 * `docs/design/house-packing.md` §9.1, after `genspike-1` proved the packing works (92.79% of
 * internal boundary diggable over 512 seeds): *"`SPACES` rows are 90% hand-authored dressing in
 * WORLD coordinates … the gallery's key is at `[11.6, 4.05, -30.55]`. Every one of those numbers
 * is only valid where the gallery currently sits."* **A room that hard-codes its own world
 * position cannot be placed anywhere else**, so no generator can exist until this is undone, and
 * the cost is **not in `dig.js` at all**.
 *
 * THE THREE PARTS:
 *   · `ROOMS`       the library, keyed by room TYPE. A footprint (`w` x `d` x `storey`) and all
 *                   of the room's content in a frame whose ORIGIN IS THE ROOM'S CENTRE, at floor
 *                   level, with local +Z along `d`.
 *   · `HOUSE_PLAN`  where the house puts each one: `at` (the centre, in world) and `turns`
 *                   (quarter turns about +Y). Today: the six rooms exactly where they already are.
 *   · `placeRoom`   the transform, and the only place a room-local coordinate becomes a world one.
 *
 * 🎯 **`study_w` AND `study_e` ARE ONE FOOTPRINT USED TWICE AND THAT IS THE PROOF PLACEMENT
 * WORKS** — 11.60 x 15.40 x 4.80, the same `order`, one `ROOMS.study` entry, two slots 15.60 m
 * apart. ⚠️ **Their RIGS are not shared and must not be, and this is measured rather than a
 * preference:** `room.js` `studyOrderFor` resolves the chimney bay and the window bays from each
 * room's own cut list, so the chimney lands at local x +1.95 in one and 0.00 in the other, and
 * `study_e`'s rim light answers D6 while `study_w`'s answers D1 — opposite walls. The library
 * carries the footprint; the slot carries the rig.
 *
 * ⚠️ **LOCAL +X IS NOT WORLD +X, AND NOTHING BELOW MAY ASSUME IT IS.** Every room is `turns: 0`
 * today, so the transform is a pure translation and the emitted doubles are the authored ones —
 * but a generated plan places rooms rotated, and a table that bakes the identity in is this
 * file's own bug one level up.
 *
 * ⚠️ **THE VERTICAL AXIS IS IN THE TRANSFORM ON PURPOSE AND IT IS 0 IN ALL SIX SLOTS.** John:
 * *"I want optionality to make 2 stories later but for now we need it for the ballroom."* The
 * ballroom keeps its full 9.60 m. A second storey is `at[1] = 4.80` on a slot rather than a
 * rewrite, because the library already carries every fixture's height above ITS OWN floor.
 * ⚠️ **It is not WIRED yet and that is deliberate:** `room.js` builds each space from y = 0 up,
 * so a non-zero `at[1]` would move this table's lights and leave the geometry behind. Placing
 * the space root is `room.js`'s change, and `room.js` is not this slice.
 *
 * ⚠️ **WHAT IS DELIBERATELY NOT HERE.** `PORTALS` / `PANELS` are BOUNDARY facts, not room facts
 * — a connector belongs to a pair of rooms, so it localises against the boundary rather than
 * against either room, and §9.3 requires the generator to re-roll them behind `?estate=gen`
 * rather than have them moved now. `ANCHORS`, `SPAWN` and `PATROL_ROUTE` are §9.4's
 * hunter-deferred set; there is also a measured reason not to fold them into the library, in
 * the note above `ANCHORS`.
 */

/**
 * ⚠️ **QUARTER TURNS, WRITTEN DOWN — NOT `Math.cos(turns * Math.PI / 2)`.**
 * `Math.cos(Math.PI / 2)` is `6.123e-17`, and that dirt multiplies into every coordinate of a
 * rotated room: a 13.6 m half-extent picks up 8e-16 m of it, and the emitted double stops being
 * the one anybody authored. A rotation by a whole number of right angles has cosines of exactly
 * 0 and +/-1, so they are a table. `rotYOf()` is for the consumers that genuinely want an angle
 * (`room.js`'s order `base` matrix will).
 */
const QUARTER = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // [cos, sin] at 0 / 90 / 180 / 270 degrees

/** The angle a slot's `turns` stands for. Only for consumers that need a real rotation. */
export function rotYOf(turns) { return (((turns | 0) % 4) + 4) % 4 * (Math.PI / 2); }

/**
 * 🚨 **THE TRANSFORM SNAPS TO THE NANOMETRE, AND THAT IS WHAT MAKES THIS REFACTOR PROVABLE
 * RATHER THAN NEARLY-RIGHT.** `centre + local` is two roundings deep. `-16.30 + 8.75` is not the
 * double `-7.55` — it is one ulp under it — so a naive placement moves a handful of the house's
 * coordinates by 1-2 ulp. That is invisible in a render and fatal to a byte-identity claim,
 * which is the only cheap proof that a no-op really is one. Every number in this file is
 * authored on a centimetre grid, so rounding the SUM to 1e-9 recovers the authored double
 * exactly for every value — measured, not hoped: `harness/_loc1_derive.mjs` prints the round
 * trip for all 41 dressing coordinates and all 24 footprint extents, and
 * `_loc1_golden.mjs --check` gates the whole exported surface.
 * ⚠️ It really does quantise a GENERATED placement to 0.5 nm. That is 1e-8 of the smallest
 * thing in the game, and it is the price of being able to prove this slice changed nothing.
 */
const snap = (v) => Math.round(v * 1e9) / 1e9;

/** A slot's frame: the room centre in world, and the quarter turn as an exact cos/sin pair. */
function frameOf(slot) {
  const [cx, cy = 0, cz] = slot.at;
  const [c, s] = QUARTER[((((slot.turns | 0) % 4) + 4) % 4)];
  return { cx, cy, cz, c, s };
}

/** Room-local point -> world point. three's +Y rotation, so `x' = c*x + s*z`, `z' = -s*x + c*z`. */
function toWorld(f, [x, y, z]) {
  return [snap(f.cx + f.c * x + f.s * z), snap(f.cy + y), snap(f.cz - f.s * x + f.c * z)];
}

/**
 * A light rig, placed. Everything that is not a POSITION is placement-invariant and copied
 * through untouched — colour, intensity, cone angle, penumbra, distance, decay, and `up`, which
 * is not a light at all (see the gallery's note).
 * ⚠️ `at` is a POINT, not a direction, so a spot aims itself correctly under rotation with no
 * extra handling. That is the reason the table stores a target rather than a yaw.
 */
function placeLights(f, L) {
  if (!L) return null;
  const out = {};
  if (L.key) out.key = { ...L.key, pos: toWorld(f, L.key.pos), at: toWorld(f, L.key.at) };
  if (L.warm) out.warm = L.warm.map((w) => ({ ...w, pos: toWorld(f, w.pos) }));
  if (L.cool) out.cool = { ...L.cool, pos: toWorld(f, L.cool.pos) };
  if (L.up !== undefined) out.up = L.up;
  return out;
}

/**
 * ✅ **THE ONE PIECE OF DRESSING THAT DID NOT SURVIVE A QUARTER TURN — FIXED 2026-08-15
 * (`gendress-1`), AND THE FIX IS IN `room.js`, WHERE THIS NOTE ALWAYS SAID IT BELONGED.**
 *
 * The note this replaces said: *"`room.js` reads `sp.columns` as `{ z, xs, w }` — a row of piers
 * at ONE world z. Rotate the room 90 degrees and the row is at one world X, which that shape
 * cannot say… fixing it is a `room.js` change (a general `{ pts }` form…)."* That is exactly what
 * was done — `room.js`'s colonnade block now takes `{ pts: [[x, z], …], w }` as well as the
 * legacy pair — so there is nothing left to throw over. `house-packing.md` §9.4b item 2 is closed.
 *
 * 🚨 **AND THE TURNS-0 RETURN IS THE LEGACY SHAPE, BYTE FOR BYTE, WHICH IS NOT TIDINESS.**
 * `_loc1_golden` compares 1170 exported leaves with `Object.is`, and the shipped ballroom is
 * `turns: 0`. Emitting `{ pts }` for every room would change the shape of an authored row for no
 * gain and cost the one cheap proof that this file's placement is a no-op on `HOUSE_PLAN`. The
 * general form is emitted ONLY where the legacy one genuinely cannot say what is meant.
 */
function placeColumns(f, col) {
  if (!col) return null;
  const pts = col.xs.map((x) => toWorld(f, [x, 0, col.z]));
  if (f.s === 0) return { z: pts[0][2], xs: pts.map((p) => p[0]), w: col.w };
  return { pts: pts.map((p) => [p[0], p[2]]), w: col.w };
}

/**
 * One plan slot -> one `SPACES` row, in the shape `room.js` has always read.
 *
 * ⚠️ **THE ROW GAINS NO FIELDS AND THAT IS A DECISION.** It would be convenient to hang the
 * placement off the row for the next slice, and it would also mean every consumer of `SPACES`
 * sees a shape it has never seen — for no gain today, because nothing downstream can use a
 * placement until `room.js` learns to build a rotated room. The plan is exported instead:
 * `HOUSE_PLAN`, `ROOMS`, `placeRoom` and `roomsFromPlan` are the handles, and the row stays
 * exactly what it was.
 */
export function placeRoom(slot) {
  const def = ROOMS[slot.room];
  if (!def) throw new Error(`[spaces] plan slot "${slot.id}" names unknown room type "${slot.room}"`);
  const f = frameOf(slot);
  const turned = f.s !== 0;                       // 90 or 270: the footprint's axes swap
  const hx = (turned ? def.d : def.w) / 2;
  const hz = (turned ? def.w : def.d) / 2;
  const row = {
    id: slot.id,
    name: slot.name,
    x0: snap(f.cx - hx), x1: snap(f.cx + hx),
    z0: snap(f.cz - hz), z1: snap(f.cz + hz),
    storey: def.storey,
    floor: def.floor,
    wall: def.wall,
  };
  const pilasters = slot.pilasters ?? def.pilasters;
  if (pilasters !== undefined) row.pilasters = pilasters;
  if (def.order !== undefined) row.order = def.order;
  const columns = placeColumns(f, def.columns);
  if (columns) row.columns = columns;
  const lights = placeLights(f, slot.lights ?? def.lights);
  if (lights) row.lights = lights;
  const lightsBox = placeLights(f, slot.lightsBox ?? def.lightsBox);
  if (lightsBox) row.lightsBox = lightsBox;
  return row;
}

/** §9.1's `roomsFromPlan(plan)`. A generator hands it a plan; today `HOUSE_PLAN` is the plan. */
export function roomsFromPlan(plan) { return plan.map(placeRoom); }

// ---------------------------------------------------------------------------
// The room library — each room in its OWN frame, origin at its centre
// ---------------------------------------------------------------------------

/**
 * ⚠️ **READ EVERY COORDINATE BELOW AS ROOM-LOCAL.** Origin at the room's centre, at floor level;
 * +X along `w`, +Z along `d`, +Y up. Where a comment quotes a world coordinate it is describing
 * where the room stands TODAY, under `HOUSE_PLAN`, and it is marked.
 *
 * ⚠️ **DRESSING IS ALLOWED OUTSIDE THE FOOTPRINT AND THREE ROOMS USE IT.** Every `cool` rim
 * light sits on the FAR side of its room's principal opening — that is the whole idea, "the
 * light lives past the space's principal opening, because the opening is where the thing you
 * are afraid of comes through" — so its local z is larger than `d / 2`. A room's frame is not
 * a clip box.
 *
 * 🆕 **`lights` IS CONSUMED BY THE FIXED LIGHT RIG** in `views/game.js` (M2+). The rig never
 * changes light COUNT — adding or removing one is a full-scene shader recompile — so these are
 * positions and colours to LERP toward, never a list to add.
 *
 * 🆕 **`up` IS THE ONE FIELD THAT IS NOT A LIGHT.** It is the shared `fill` HemisphereLight's
 * GROUND colour — the term a DOWN-facing surface receives, and therefore the only lighting a
 * ceiling in this house has ever had. Three rooms set it; the three that do not are RESTORED to
 * the constructor value on entry, exactly as `decay` is, so a room can never inherit its
 * neighbour's ceiling. See `makeLightRig` and `?ceil=`.
 */
export const ROOMS = {

  // =========================================================================================
  gallery: {
    /** 27.20 x 6.70: long and shallow. The pilasters want to break up the 27 m walls, not the
     *  6.7 m ends, which is what `pilasters: 'both'` means on a room this shape. */
    w: 27.20, d: 6.70, storey: 5.60,
    floor: 'floor', wall: 'wall', pilasters: 'both',
    /**
     * 🆕 **THE ARCHITECTURAL ORDER THIS ROOM IS BUILT TO, UNDER `?estate=port`.**
     *
     * John, 2026-08-08: *"I just want the game to progress from the assets we made for the 3
     * rooms we had in the art."* `src/world/gallery-order.js` is the showcase gallery's order —
     * clerestory, string course, pilaster rhythm, transverse arch, coffered ceiling, portraits
     * — extracted so that `views/room-gallery.js` (score 75) and this room build from the SAME
     * arithmetic instead of one being a hand copy of the other.
     *
     * This room is 27.20 x 6.70 x 5.60; the showcase is 27.0 x 7.20 x 6.40 — the same room to
     * within half a metre of width and 0.8 m of height, with an IDENTICAL 27 m long axis (the
     * axes are swapped, which is one rotY — and `room.js` already builds this order through a
     * `base` matrix for exactly that reason, which is why the gallery is the one room whose
     * ORDER is already rotation-ready).
     *
     * ✅ **ALL THREE ROOMS ARE PORTED NOW.** `study` followed (`estate-2`), and `ballroom`
     * followed that (`estate-3`) — ⚠️ **the "the BALLROOM is not close, porting it is a
     * floor-plan change" note that stood here for three rounds was WRONG, and it was wrong
     * about the wrong thing.** The dimensions were never the problem: the game's ballroom is
     * 27.2 x 15.3 against a 26 x 16 showcase, which is the CLOSEST of the three. Only the
     * STOREY differed, and a storey is one number that nothing in gameplay reads — see the long
     * note on the ballroom's `storey` below.
     *
     * It is a string rather than a boolean because each of the three is a different order.
     */
    order: 'gallery',
    /**
     * 🔦 **RE-AIMED AT THE ARCHITECTURE** (`estate-light-1`, 2026-08-09). Every position below
     * names a piece of `gallery-order.js`'s order that is actually built and whose coordinate
     * was read out of the live plan, not computed in a doc. In this room's own frame:
     * clerestory bays at x ∈ {11.6, 7.9, 4.2, 0.5, −3.2, −6.9, −10.6}, sill 3.33 / head 4.74;
     * sconces at y 2.73 on x ∈ {9.6, 6.7, 3.8, 0.9, −2.0, −4.9, −7.8}, 0.20 m off each long
     * wall (z +3.15 south, −3.15 north); portrait centres at y ≈ 2.0; the transverse arch at
     * x −2.12. The previous entry is kept verbatim as `lightsBox` below.
     *
     * ⚠️ The gallery's centre is world `[0, 0, −27.65]`, so its local x IS its world x today and
     * every x above reads the same in both frames. Its z does NOT: local −2.90 is world −30.55.
     */
    lights: {
      /**
       * 🚨 **THE KEY IS THE COLD DAYLIGHT SHAFT OUT OF A NAMED CLERESTORY BAY, AND THAT IS A
       * CHROMA FIX BEFORE IT IS A COMPOSITION ONE.** `grade.mjs` on the before capture at
       * `gallery.mid` facing east: median L **84.5** against a 30–60 gate and top-decile
       * (r-b)/L **0.265** — a FAIL, with every decile from the toe up sitting at ~1.0, i.e. red
       * at double blue through the whole range. That is `views/game.js`'s own warning ("the
       * frame read as one colour") arriving now that the room's surfaces are warm damask,
       * walnut and parquet: a 0.88 rad (100°) warm cone from one end of a 27 m room is a WASH,
       * and a wash over warm materials is monochrome by construction.
       *
       * `views/room-gallery.js` solved the identical problem and wrote down why: *"what a warm
       * room needs in order not to measure as monochrome is not less warmth, it is a NEAR-
       * NEUTRAL element at the top of its range."* Its own key is `0xdce8ff` at angle 0.30 —
       * cold, narrow, and the brightest thing in the frame. ⚠️ Nothing is imported from the
       * showcase: `game.play` stays code-isolated from `views/room-gallery.js`
       * (`estate-spike-1`), which is why no change here can move `room.gallery`.
       *
       * The origin is the MOUTH of the easternmost clerestory bay on the north wall (local
       * x +11.60, 0.45 m into the room, mid-window at y 4.05) and it rakes west-and-down across
       * the run. At 0.30 rad the pool lands roughly x −4 … +7 over the full width, so the
       * transverse arch at x −2.12 stands at its west edge and throws a real shadow into the
       * west half — one hard event dividing 27 m into two rooms, which is the only thing that
       * has ever made a corridor read as depth.
       */
      key: { pos: [11.60, 4.05, -2.90], at: [1.20, 0.00, 1.45], color: 0xdce8ff, intensity: 265,
        angle: 0.30, penumbra: 0.45, dist: 34, decay: 1.25 },
      /**
       * BOTH WARMS ARE ON SCONCES. They were at mid-room, mid-air (y 3.6–3.9), which is where a
       * light goes when the room is an empty box: there is nothing else to put it on. There are
       * now seven brass sconces a side with hot emissive candles and merged glow decals, and a
       * decal cannot produce a falloff — so the two warms buy the thing the decals cannot, at
       * the two ends the cold key deliberately does not reach.
       *   · x +9.6, south wall — the east end of the vista, which is otherwise past the key's
       *     pool and would die at its own far end.
       *   · x −7.8, north wall — the west half, beyond the arch, where the key is blocked by the
       *     arch itself. Opposite wall from the first on purpose: the two warm pools alternate
       *     across the run rather than stacking down one side.
       * ⚠️ `decay` 1.6, not the constructor's 2 — see `makeLightRig`. A sconce pool that dies
       * 3 m from its own bracket lights the bracket and nothing else in a 27 m room.
       */
      warm: [
        { pos: [9.60, 2.70, 2.35], color: 0xffb271, intensity: 24, dist: 16, decay: 1.6 },
        { pos: [-7.80, 2.70, -2.40], color: 0xffb271, intensity: 22, dist: 16, decay: 1.6 },
      ],
      // ON THE FAR SIDE OF D1, so anything standing in that doorway is rimmed. This is
      // `game.js`'s old `rim` idea generalised: the light lives past the space's principal
      // opening, because the opening is where the thing you are afraid of comes through.
      // ⚠️ Local z +4.45 against a half-depth of 3.35 — it is OUTSIDE this room's footprint, in
      // the study beyond D1, and that is the point. See the header's note about clip boxes.
      cool: { pos: [-8.60, 1.90, 4.45], color: 0xa8ccf4, intensity: 42, dist: 10 },
      /**
       * 🆕 **`up` — THE BOUNCE THAT REACHES A DOWN-FACING SURFACE, i.e. THE ONLY THING THAT HAS
       * EVER LIT THIS ROOM'S CEILING** (`ceiling-1`, 2026-08-09). It is the `fill`
       * HemisphereLight's GROUND colour, driven per space by `makeLightRig`; see that function
       * for the mechanism and for `?ceil=`.
       *
       * 🚨 **WHY THE CEILING IS BLACK, MEASURED RATHER THAN ASSUMED.** three's hemisphere term is
       * `mix(groundColor, skyColor, 0.5 * dot(n, up) + 0.5)`. A ceiling's normal points DOWN, so
       * it receives the GROUND colour and NOTHING ELSE of it — while a wall receives the average
       * of the two and a floor receives pure sky. The shipped ground is `0x3a2a1c` against a
       * `0x6f7d96` sky, i.e. the ceiling has been running on a term **4.3x darker in luminance
       * than the one every wall in the house gets**, on top of an environment map whose lower
       * hemisphere is a near-black box. The key never points up and no practical is within 2 m of
       * the soffit. That is the whole mechanism: the ceiling is not badly lit, it is lit by one
       * deliberately-dark constant and nothing else.
       *
       * ⚠️ **AND THE SAME TERM IS WHY THIS IS AFFORDABLE.** It is a uniform on a light that
       * already exists — no new light, no change to `numPointLights`, no draw call, no per-frame
       * work beyond one colour lerp. The alternative that was NOT taken is a sixth rig light: at
       * `_price-pointlight.mjs`'s +0.112 ms it is affordable, but it buys a pool and this buys
       * the whole soffit of six rooms.
       *
       * ⚠️ **IT IS NOT FREE OF SIDE EFFECTS AND THE SIDE EFFECT IS THE WALLS.** They take half of
       * it. That is why it is per-space and why the gallery's is the smallest of the three:
       * `gallery.mid` facing west already measures median L 62.3, i.e. 2 over the 30–60 gate, so
       * this room has no luminance headroom and takes a lift sized to its ceiling alone. Floors
       * take NONE of it (their normal is +Y, so they see pure sky), which is what makes the term
       * usable at all — the floor is the brightest thing in every one of these frames.
       *
       * 🚨 **`0x3a3f4a` HOLDS THE RED CHANNEL AT THE CONSTRUCTOR VALUE AND ADDS ONLY GREEN AND
       * BLUE, AND THAT IS ARITHMETIC RATHER THAN TASTE.** `0x3a2a1c` is `(58, 42, 28)`; this is
       * `(58, 63, 74)`. So the term the walls take half of gains **no red at all** — it is a pure
       * de-warming lift, in the room whose ceiling band measures a top-decile (r-b)/L of
       * **+0.599**, the second most warm-biased band of the five stations. The gallery's own
       * ceiling light is the clerestory and the clerestory is cold (`key` is `0xdce8ff` for
       * exactly that reason); a warm bounce here would be a third warm multiplier stacked on
       * damask, walnut and parquet, which is the stack `room-gallery.js` had to take apart.
       *
       * ⚠️ **AND IT IS THE SMALLEST OF THE THREE BECAUSE THE FIRST VALUE TRIED WAS TOO BIG AND
       * WAS MEASURED, NOT GUESSED.** At `0x424956` this room read `gallery.mid` west **65.1**
       * whole-frame median against 62.3 — a room already 2 over the 30–60 gate pushed 5 over, for
       * +3.3 on the band. The ceiling gain was real and the price was the WALLS, which take half
       * of this term while the ceiling takes all of it and the floor takes none. At `0x3a3f4a`
       * the wall's hemisphere term moves ~10% instead of ~26%, and the difference in the ceiling
       * is bought back by the decals in `gallery-rig.js`, which cost the walls nothing because
       * they are patches on the soffit.
       */
      up: 0x3a3f4a,
    },
    /** `?aim=box` — the pre-2026-08-09 aim, kept so the re-aim can be re-priced, not argued. */
    lightsBox: {
      key: { pos: [-8.60, 5.00, 2.45], at: [4.00, 0.90, -0.75], color: 0xffdcb4, intensity: 300,
        angle: 0.88, penumbra: 0.68, dist: 40, decay: 1.35 },
      warm: [
        { pos: [2.00, 3.90, -0.95], color: 0xffb271, intensity: 26, dist: 18 },
        { pos: [11.00, 3.60, 0.65], color: 0xffb271, intensity: 22, dist: 16 },
      ],
      cool: { pos: [-8.60, 1.90, 4.45], color: 0xa8ccf4, intensity: 46, dist: 10 },
    },
  },

  // =========================================================================================
  /**
   * 🎯 **ONE FOOTPRINT, USED TWICE — `study_w` AND `study_e` ARE THE SAME 11.60 x 15.40 x 4.80
   * ROOM PLACED 15.60 m APART**, and that is this refactor's cheapest proof that placement
   * works. `genspike-1` checked the two rows were byte-identical before any of this was written.
   *
   * ⚠️ **NO `lights` HERE, AND THAT IS HONEST RATHER THAN AN OMISSION.** Both slots supply their
   * own rig, because the two rooms genuinely are not mirrors — see `HOUSE_PLAN`. A default rig
   * on the type would be a rig that is wrong for both.
   */
  study: {
    w: 11.60, d: 15.40, storey: 4.80,
    floor: 'floor', wall: 'wall',
    /**
     * 🆕 **THE SECOND OF JOHN'S THREE ROOMS, UNDER `?estate=port`** (`estate-2`, 2026-08-09).
     *
     * `src/world/study-order.js` is `views/room-study.js`'s own order — the panelled storey, the
     * stone frieze above it, the chimneypiece and its breast, the window bays, the panelling
     * cornice, the pilasters, the beamed ceiling and the tapestries — extracted so that the
     * showcase (score 65) and this room build from the SAME arithmetic. The showcase's capture is
     * byte-identical across the extraction: 0 of 2,073,600 pixels differing.
     *
     * ⚠️ **THE ORDER IS RESOLVED AGAINST EACH ROOM'S OWN CUT LIST, NOT AUTHORED PER ROOM.** The
     * chimney bay, the window bays, the pilasters and the tapestries are placed in whatever spans
     * this room's connectors leave free (`room.js` `studyOrderFor`), so the two studies are NOT
     * hand-mirrored — and they cannot be, because `study_w` has D1 in its gallery wall and
     * `study_e` has had no door there since D3 was removed. A hand mirror would have put a
     * chimney breast across a doorway in one of them.
     *
     * ⚠️ **AND THE SERVICE WALL GETS NO PANELLING, WHICH IS CORRECT RATHER THAN A GAP.** In free
     * dig mode `DIG_EDGES` makes the whole of that wall either a destructible face or a panel
     * aperture, so `wallRun`'s `clashes()` skips every field on it. Walnut panelling drawn over a
     * lath face you are meant to break through would be a lie about what breaks.
     *
     * 🚨 **THE ORDER IS PARAMETRIC ON THE FOOTPRINT BUT IT IS NOT ROTATABLE, AND THAT IS THE ONE
     * REAL GAP THIS SLICE LEAVES.** `room.js` `studyOrderFor` and `ballroomOrderFor` both carry
     * `base: null` and read `sp.x0/z0` directly, so they follow a room that MOVES and not one
     * that TURNS. `galleryOrderFor` already builds through a `base` matrix and is fine. Giving
     * the other two a `base` is a `room.js` change and `room.js` is not this slice.
     */
    order: 'study',
  },

  // =========================================================================================
  service: {
    // THE PASSAGE. 3.40 m wide against the studies' 11.60 — the short route between the two hubs
    // and the one with no cover in it, which is the trade the player is offered. No pilasters: it
    // is back-of-house, and a 0.34 m pilaster inside a 3.4 m corridor is an obstacle rather than
    // an order.
    w: 3.40, d: 15.40, storey: 4.80,
    floor: 'floor', wall: 'wall', pilasters: 'none',
    /**
     * 🔦 **RE-AIMED** (`ceiling-1`, 2026-08-09) — the room `estate-light-1` did not reach, and
     * measurably the worst-lit and most monochrome space in the house.
     *
     * 🚨 **THE FINDING THAT SENT ME HERE IS `dig-side-1`'S, AND IT LANDED IN A DIFFERENT ROOM
     * FROM THE ONE IT NAMED.** *"The far room's undug dig band measures 70% of the frame under
     * luma 24 against the near room's 49% — a player in the spawn room can barely see the wall
     * they are meant to attack."* Aimed at from the STUDY side that does not reproduce: at
     * `study_w.south@90` the same wall reads median L **97.8** with 7.5% under L 24. Aimed at
     * from THIS side it reproduces exactly: `service.mid@90` median **11.6**, **58.0%** under
     * L 24, 26.8% pure black; `service.south@180` **65.9%** under L 24 with a whole-frame median
     * of **16.8**. The far room is the passage. Every number below is from
     * `harness/_light1_probe.mjs` with three new `service.*` stations.
     *
     * 🚨 **AND IT IS ALSO THE HOUSE'S REMAINING CHROMA FAILURE, WITH TWO STATIONS OVER THE LINE.**
     * `service.mid@270` reads top-decile (r-b)/L **+0.612** and `service.mid@90` **+0.416**,
     * against `grade.mjs`'s 0.20 fail — worse than anything `estate-light-1` cleared in the
     * gallery. One 0xffdcb4 key washing warm plaster, warm parquet and two 0xffb271 points is
     * `room-gallery.js`'s finding verbatim: *"what a warm room needs in order not to measure as
     * monochrome is not less warmth, it is a NEAR-NEUTRAL element at the top of its range."*
     */
    lights: {
      /**
       * Down the length, not across the width. Same reasoning as the gallery: a key aimed across
       * a corridor lights two metres of it and leaves the rest a black tube.
       *
       * 🆕 **TWO CHANGES, AND BOTH ARE ABOUT THE WALLS RATHER THAN THE FLOOR.**
       * · **`0xdfe6f4`, not `0xffdcb4`** — the chapel's value, and the only near-neutral in this
       *   table. This is BACK-OF-HOUSE: a service passage lit cold against a warm house is the
       *   motivated reading as well as the one that clears the chroma gate, and it separates the
       *   passage from the two studies either side of it, which currently read as the same amber
       *   through every doorway.
       * · **`at` y 0.8 -> 1.75** — the target was on the FLOOR, so the cone's brightest part
       *   landed where nobody has to read anything and the destructible field on both side walls
       *   got the skirt of it. At 1.75 the same cone washes the wall at the height a 1.6 m robot
       *   swings at. The floor is still lit; it is 3.4 m wide and the cone is 5.1 m across at the
       *   target.
       */
      key: { pos: [0.00, 4.40, -6.10], at: [0.00, 1.75, 5.30], color: 0xdfe6f4, intensity: 240,
        angle: 0.40, penumbra: 0.80, dist: 30, decay: 1.35 },
      warm: [
        /**
         * ⚠️ **THE ONLY TWO WARM SOURCES IN THE PASSAGE, AND THEY WERE ON THE CONSTRUCTOR'S
         * `decay: 2`, WHICH IN A 15.4 m CORRIDOR IS A PAIR OF FOOTLIGHTS.** At decay 2 a
         * 15-intensity point delivers 0.6 at 5 m, so the 6.8 m between them was lit by the key's
         * penumbra and nothing else — `makeLightRig`'s own note about the studies, in the room
         * where the geometry is most extreme. At 1.55 the same light delivers ~3.5x as much at
         * 5 m for a 13% intensity rise, and the two pools meet in the middle of their own
         * corridor. They stay on the centreline: in 3.4 m of width, off-centre is against a wall.
         * ⚠️ **`0xffc890` at 13, NOT `0xffb271` at 17, AND THAT PAIR WAS MEASURED FIRST.** At the
         * saturated value the reach fix worked and took the chroma with it: `service.mid` facing
         * west read whole-frame median **77.8** (against an 80 "washed out" fail) at top-decile
         * (r-b)/L **+0.333**. Desaturating rather than dimming is `estate-light-1`'s own move on
         * `study_w`'s warm, for the same reason and with the same arithmetic behind it: the
         * corridor's surfaces are already warm, so the fix is the multiplier, not the exposure.
         */
        { pos: [0.00, 3.30, -3.10], color: 0xffc890, intensity: 13, dist: 14, decay: 1.55 },
        { pos: [0.00, 3.30, 3.70], color: 0xffc890, intensity: 13, dist: 14, decay: 1.55 },
      ],
      /**
       * 🚨 **IT WAS PARKED BEHIND A SOLID WALL, AND THIS IS THE SECOND INSTANCE OF EXACTLY THAT
       * BUG.** `estate-light-1` found `study_e`'s rim light aimed at a doorway that had been
       * removed; this is the same one room along and from the same removal. `cool` sat at local
       * z −8.80 (world −25.1) — the far side of the passage's NORTH wall, which used to be D2
       * into the gallery. **D2 was deleted on 2026-08-08** and this file says so at the top:
       * *"`service` now reaches the gallery only indirectly."* So this light spent every frame
       * throwing a blue patch on the back of a wall nobody can see and rimming nothing. The
       * passage's one open door is **D5, in the SOUTH wall at local x 0** (the ballroom), so that
       * is where a rim light goes — and it is also the door a hunter comes through.
       */
      cool: { pos: [0.00, 1.90, 8.90], color: 0xa8ccf4, intensity: 46, dist: 10 },
    },
  },

  // =========================================================================================
  ballroom: {
    // THE CHASE ARENA. 27.2 x 15.3 and a **9.60** storey — the only room in the house you can
    // outrun something in, and the only one that is meant to be exposed. Its 31 m diagonal is
    // broken SOMETIMES by the colonnade, which is what an arena wants: cover you have to use
    // well, not cover that is a guarantee. Do not try to make this room safe.
    w: 27.20, d: 15.30,
    /**
     * 🚨 **9.60, NOT 7.20 — THE ROOM IS DOUBLE HEIGHT, AND IT CHANGES NO GAMEPLAY NUMBER**
     * (`estate-3`, 2026-08-09). It keeps its full 9.60 m through this refactor.
     *
     * Three rounds recorded the showcase ballroom as un-portable on exactly this line:
     * `estate-spike-1` — *"game 27.2 x 15.3 x 7.20 against a showcase two-storey 9.6 m with a
     * musicians' gallery... The showcase ballroom's whole upper window order — the thing that
     * carries its PASS 85 — has nowhere to go"* — and `estate-1` and `estate-2` both repeated it
     * as still open. John asked whether the constraint was real, and it is not:
     *
     *   · **`DIG_H = 2.80`** (`src/game/dig.js`) — the destructible band is a FIXED strip from
     *     the floor, and that file says outright that *"the masonry above 2.80 is ordinary
     *     wall"*. A 9.6 m room digs identically to a 7.2 m one, hole for hole, hp for hp.
     *   · **`PASS_H = { robot: 1.70, hunter: 2.40 }`** (`src/game/rules.js`) — both far below the
     *     band. No ceiling height in this house reaches a gameplay height.
     *   · Every `.storey` reader in `src/game/room.js` is PARAMETRIC: the wall boxes, the
     *     colliders, the ceiling slab, the space AABB (`storey + 0.5`), the hunter's full-storey
     *     breach. Raising the number builds a taller room; nothing branches on it.
     *   · `docs/design/procedural-map.md` settles the future case — rooms are modules whose
     *     CONNECTORS must agree on clear width and height. The connectors match; the rooms need
     *     not, and a double-height ballroom beside 4.8 m rooms is what a grand house IS. That
     *     argument is now structural rather than rhetorical: `storey` is a property of the room
     *     TYPE in the library, so a plan can place this room beside any other.
     *
     * ⚠️ **IT IS NOT COST-FREE AND THE COST IS FILL.** A 9.6 m room puts more wall on screen at
     * every station and the exterior facade at this room's four exit sites grows with it
     * (`exterior.js` `buildYard` takes `home.storey`). Both are measured in the round report.
     */
    storey: 9.60,
    floor: 'floor', wall: 'wall', pilasters: 'both',
    /**
     * 🆕 **THE THIRD OF JOHN'S THREE ROOMS** — `src/world/ballroom-order.js`, shared with
     * `views/room-ballroom.js` (PASS 90, the project high, and byte-identical across the
     * extraction). The mapping is 1:1 with no rotation: window wall on `xmin`, mirror wall and
     * the musicians' gallery on `xmax`, the arched end wall on `zmin` (where D4/D5/D6 already are
     * — the showcase's ONE arch becomes the game's THREE), the near wall on `zmax`.
     * ⚠️ 1:1 with no rotation is exactly why it cannot yet be TURNED — see `study.order`.
     */
    order: 'ballroom',
    /** Six piers across the middle. Emitted into the `mould` GeoBin key, so they cost no draw
     *  call. ⚠️ Local: the row is on the room's centre line (`z: 0`). See `placeColumns` for why
     *  a rotated room cannot emit this shape. */
    columns: { z: 0.00, xs: [-11.00, -6.60, -2.20, 2.20, 6.60, 11.00], w: 0.95 },
    lights: {
      /**
       * 🔦 **RE-AIMED FOR A 9.6 m STOREY, AND THE KEY'S JOB IS UNCHANGED ON PURPOSE**
       * (`estate-3`). From the south, throwing north across the colonnade, so the piers rake
       * shadows down the length of the room — *"that is what makes a 27 m box read as depth
       * instead of area"*.
       *
       * 🚨 **AND IT IS NOT MOVED OUTSIDE THE WINDOW WALL, WHICH IS THE SHOWCASE'S OWN ITEM 3.**
       * That view's header says *"THE WINDOWS DO THE LIGHTING... a row of real holes in the long
       * wall and ONE spot outside: the shadow map turns that into six hard-edged patches of
       * daylight marching down a black-and-white marble chequer"*. It is the right light for a
       * daylit art reference and the wrong one here for two reasons, both structural rather than
       * aesthetic:
       *   · **The key is the game's ONLY shadow caster and the colonnade is this room's
       *     gameplay.** Aiming it through the west wall grazes the pier line instead of crossing
       *     it, which is a chase-arena change wearing an art change's clothes.
       *   · A cone wide enough to cover a 15.3 m wall from outside it needs either a 0.87 rad
       *     half-angle (a shadow frustum with no resolution left) or a station ~20 m outside the
       *     building with `far` past 50 — depth precision this shadow map does not have.
       * So the windows are lit the way the gallery's clerestory and the study's lancets are:
       * EMISSIVE glazing plus merged glow decals, one draw call and no light budget. Priced, not
       * assumed — `src/lighting/ballroom-rig.js`'s header has the argument.
       *
       * `?aim=box` restores the pre-`estate-3` entry below verbatim.
       */
      key: { pos: [-2.00, 8.20, 6.05], at: [1.00, 0.70, -5.35], color: 0xffdcb4, intensity: 360,
        angle: 0.86, penumbra: 0.70, dist: 38, decay: 1.30 },
      warm: [
        /**
         * 🆕 **BOTH WERE AT `y 4.2, local z -3.35`, MIRRORED ABOUT THE CENTRELINE, IN THE NORTH
         * HALF — i.e. two identical lights lighting the same third of the biggest room in the
         * house.** They are now a WARM/COOL SPLIT standing on real architecture: this one is the
         * window wall's own daylight, at the reveal of the northernmost bay, cold; the other is
         * the warm side under the musicians' gallery. That is the split `gallery-rig.js` argues
         * two constant points are worth buying, bought here for nothing because these lights
         * already exist.
         * ⚠️ **`decay` 1.40, not the constructor's 2.** `estate-light-1`'s finding, and this is
         * the room it matters most in: at decay 2 a point delivers its light over 3-4 m, and this
         * room is 27.2 x 15.3 x 9.6. At 1.40 the same intensity reaches ~4x as far.
         */
        { pos: [-11.80, 2.60, -2.25], color: 0x8fb3de, intensity: 44, dist: 22, decay: 1.40 },
        // The warm side, under the musicians' gallery deck (y 5.2) on the east wall, in the south
        // half — so the two sources bracket the colonnade instead of stacking north of it.
        { pos: [10.80, 3.20, 1.85], color: 0xffb271, intensity: 32, dist: 20, decay: 1.34 },
      ],
      // D5, in the north wall at local x 0 — the middle of the three doorways, and the one the
      // service passage brings a hunter through. Unmoved: it was already aimed at something real.
      // Local z −8.75 against a half-depth of 7.65: outside the room, in the passage.
      cool: { pos: [0.00, 1.90, -8.75], color: 0xa8ccf4, intensity: 46, dist: 11 },
      /**
       * 🆕 **`up` — AND THIS IS THE ROOM WHERE `ceiling-1`'s FINDING BITES HARDEST.** three's
       * hemisphere gives a DOWN-facing normal the ground colour and nothing else, so a ceiling
       * has been running on a term 4.3x darker in luminance than the one every wall gets. Here
       * that soffit is **9.6 m up**, further from every practical in the room than any other
       * ceiling in the house, and it is a coved and coffered gilt grid — the single largest
       * continuous area in an upward frame. A room can be double height and have nobody notice if
       * the top half of it is black.
       * ⚠️ Between the gallery's `0x3a3f4a` and the studies' `0x59637a` on purpose: this ceiling
       * is further away than either (so it needs more) but the room's floor is the brightest
       * thing in the frame and `up` lifts walls by half of whatever it lifts the ceiling by.
       * `?ceil=0` is the pre-`ceiling-1` build; `?ceil=1.5` re-prices it upward without an edit.
       */
      up: 0x4a5364,
    },
    /** `?aim=box` — the pre-2026-08-09 aim, for a 7.20 m room. See the notes above. */
    lightsBox: {
      key: { pos: [-2.00, 6.40, 6.05], at: [1.00, 0.70, -5.35], color: 0xffdcb4, intensity: 330,
        angle: 0.80, penumbra: 0.70, dist: 34, decay: 1.35 },
      warm: [
        { pos: [-10.50, 4.20, -3.35], color: 0xffb271, intensity: 26, dist: 18 },
        { pos: [10.50, 4.20, -3.35], color: 0xffb271, intensity: 26, dist: 18 },
      ],
      cool: { pos: [0.00, 1.90, -8.75], color: 0xa8ccf4, intensity: 46, dist: 11 },
    },
  },

  // =========================================================================================
  chapel: {
    // THE SPUR. 🚨 2026-08-08: its one door (D7, 1.20 m — narrower than a grown hunter, §2.3's
    // "refuge that growth takes away") was REMOVED at John's direction (see the note above
    // `PORTALS`). The chapel now has no door at all — the only way in, for a robot OR the hunter
    // at any stage, is the ~4.7 s breach of `p.chapel`, loud and completely readable. That is
    // still a real cost, but it no longer distinguishes a small hunter from a grown one; the
    // width mechanic itself is gone, not relocated.
    w: 6.80, d: 6.50, storey: 4.80,
    floor: 'floor', wall: 'wall', pilasters: 'both',
    lights: {
      key: { pos: [0.00, 4.60, -2.35], at: [0.00, 0.60, 1.35], color: 0xdfe6f4, intensity: 165,
        angle: 0.70, penumbra: 0.60, dist: 20, decay: 1.6 },
      warm: [
        { pos: [-2.20, 2.50, -1.05], color: 0xffb271, intensity: 12, dist: 9 },
        { pos: [2.20, 2.50, 1.15], color: 0xffb271, intensity: 11, dist: 9 },
      ],
      // Past the room's only way in (`p.chapel`, in the zmax wall): local z +3.95 against a
      // half-depth of 3.25.
      cool: { pos: [0.00, 1.90, 3.95], color: 0xa8ccf4, intensity: 44, dist: 10 },
    },
  },
};

// ---------------------------------------------------------------------------
// The plan — which room goes where
// ---------------------------------------------------------------------------

/**
 * 🚨 **THIS IS THE TABLE A GENERATOR REPLACES, AND IT IS SIX LINES OF PLACEMENT PLUS TWO RIGS.**
 * Everything else about the house now lives in `ROOMS`, in a frame that does not care where the
 * room ends up. `at` is the room's CENTRE in world, `[x, y, z]`; `turns` is quarter turns about
 * +Y. Every slot is `turns: 0` and `y: 0` today, so `SPACES` comes out with the exact doubles
 * that used to be written by hand — that is the whole safety property of this slice, and
 * `harness/_loc1_golden.mjs --check` is what proves it rather than asserts it.
 *
 * MILESTONE STATE: **M3/M4 — the floor plan is COMPLETE.** Six spaces: two hubs (`gallery`
 * north, `ballroom` south) joined by three parallel routes (`study_w`, `service`, `study_e`),
 * plus the `chapel` dead-end spur hanging off the gallery. Three parallel routes give three
 * independent cycles, so "which way round" is a real choice rather than "clockwise or
 * anticlockwise". See `docs/slices/task-mansion.md` §2.
 */
export const HOUSE_PLAN = [
  { id: 'gallery', name: 'THE LONG GALLERY', room: 'gallery', at: [0.00, 0, -27.65], turns: 0 },

  {
    id: 'study_w', name: 'THE WEST STUDY', room: 'study', at: [-7.80, 0, -16.30], turns: 0,
    /**
     * 🔦 **RE-AIMED AT THE ARCHITECTURE** (`estate-light-1`, 2026-08-09). ⚠️ **AND THE TWO
     * STUDIES ARE NOT MIRRORS OF EACH OTHER, SO NEITHER ARE THEIR RIGS — WHICH IS WHY THE RIG IS
     * ON THE SLOT AND THE FOOTPRINT IS IN THE LIBRARY.** `room.js` `studyOrderFor` resolves the
     * chimney bay and the window bays from each room's OWN cut list, and `study_w` has D1 in its
     * gallery wall while `study_e` has had nothing there since D3 was removed — so the chimney
     * lands at local x +1.95 here and 0.00 there, and the two rooms' principal openings are in
     * opposite walls. Every coordinate below was read out of the live `orderPlan`, not mirrored
     * by hand, and then expressed in this room's own frame.
     *
     * `study_w` as built, ROOM-LOCAL (world in brackets — this room's centre is [−7.80, 0,
     * −16.30]): chimneypiece x +1.95 (world −5.85) on the north wall, z −7.54 (world −23.84);
     * two windows in the WEST wall at z −5.22 and +1.55 (world −21.52 / −14.75), sill 1.05 head
     * 3.28; one sconce at (+4.30, 2.10, −7.52) (world −3.5 / −23.82); tapestries on the south
     * wall; panelling cap 3.35; beams occupy y 4.46–4.80.
     *
     * 🚨 **THE MEASURED DEFECT THIS REPLACES: A 6.7:1 LUMINANCE RANGE INSIDE ONE ROOM.**
     * `grade.mjs` on the before captures — `study_w.south` (the SPAWN frame) median L **12.8**
     * with **24.6% of pixels crushed to black**, and `study_w.north` median L **85.6**. Both fail
     * a 30–60 gate, in opposite directions, eleven metres apart. The cause is one 0.86 rad cone
     * parked 7 m from its own target: it blew the north third of the floor and nothing else in
     * the room got anything. ⚠️ It also sat at y 4.5, INSIDE the beam band — a light embedded in
     * the ceiling it is meant to be under.
     */
    lights: {
      /**
       * DOWN THE LENGTH, FROM BEHIND THE PLAYER, ONTO THE CHIMNEYPIECE. The room's principal
       * feature is a 3.0 m chimney breast with a bolection, consoles, an overmantel and a carved
       * cartouche — real geometry that `critic-estate-5` filed as *"very shallow and
       * low-contrast … grey-on-grey"* when it was lit by a hemisphere, because a hemisphere has
       * no direction. This is the direction. At 14 m and 0.22 rad the beam is a 6.3 m ellipse on
       * the north wall, which takes the chimney breast (3.0 m), the sconce at local x +4.30 AND
       * the D1 doorway at local x −0.80 — so the one aimed light in the room lands on the feature
       * and on the way out, which are the two things a player needs to find.
       * ⚠️ Origin y 4.10 and local z +6.60: BELOW the beam band (4.46) and SOUTH of the first
       * beam, so the fixture is not inside the ceiling it is lighting.
       * ⚠️ **THE CONE IS 0.34, AND 0.22 WAS TRIED AND MEASURED FIRST.** At 0.22 the beam took the
       * chimney beautifully and lit 3.7% of the solid angle the old wash did, so the room's two
       * ends read median L 11.3 and 20.9 — consistent, which was the point, and both too dark.
       * 0.34 covers 9.9 m of the 11.6 m chimney wall and the last 6 m of floor before it.
       * ⚠️ The cone's lower edge does not reach the floor until 8.4 m out, which is what keeps
       * this from being the floor wash it replaces: the near half is lit by the two points below,
       * never by the key.
       */
      key: { pos: [1.30, 4.10, 6.60], at: [1.95, 2.20, -7.25], color: 0xfff0e0, intensity: 560,
        angle: 0.34, penumbra: 0.55, dist: 26, decay: 1.5 },
      warm: [
        /**
         * ⚠️ **THE WARM CARRIES THE SOUTH HALF, BECAUSE NOTHING ELSE CAN.** It was tried on the
         * north-wall sconce first, which is the prettiest place for it and the wrong one: a spot
         * hung at the ceiling of the south end cannot light the floor beneath itself, so with
         * both the key and the warm at the chimney end the SPAWN FRAME — the first thing anyone
         * sees — measured median L 11.3 with 26.9% of its pixels crushed to black. This sits in
         * the room's south quarter, at decay 1.34 so it reaches the middle of its own room, and
         * it is the only thing lighting the player at spawn.
         * ⚠️ **AND IT IS DESATURATED, 0xffb271 -> 0xffd0a8, WHICH IS MEASURED RATHER THAN TASTE.**
         * At the saturated value 1.7 m from the capture camera it owned the top luminance decile
         * and the spawn frame read (r-b)/L **0.308** — a chroma FAIL. That is `room-gallery.js`'s
         * own finding in its own words: *"The gallery's chroma is not one big offender, it is a
         * STACK of warm multipliers … Each one has to come down."*
         *
         * 🚨 **A MOVE TOWARD THE SERVICE WALL WAS BUILT, MEASURED AND REVERTED. THE POSITION IS
         * UNCHANGED; ONLY `intensity` 30 -> 34 / `dist` 18 -> 20 / `decay` 1.40 -> 1.34 SURVIVE**
         * (`ceiling-1`, 2026-08-09). `dig-side-1` had measured *"the far room's undug dig band
         * … 70% of the frame under luma 24"* and this light sits at local x −3.20, i.e. 9.0 m
         * from the service wall (this room's EAST wall, local x +5.80) at decay 1.40 — which is
         * `30 / 9^1.4 = 1.4` arriving at the surface the game's central verb points at. Moving it
         * to local x +1.20 would have delivered 3.2x that. It was built, and the SPAWN FRAME
         * (`study_w.south` facing north, the first thing any player sees) fell from median L
         * **25.1 to 21.2** — a 3.9 regression on the exact number `estate-light-1` earned when it
         * took that frame from 12.8 to 25.2 — while the surface the move was for turned out not
         * to need it. **Measured at a station aimed straight at it (`study_w.south@90`): the
         * service wall reads median L 97.8 with 7.5% of the region under L 24.** It is the
         * brightest thing in that frame, not the darkest.
         * ⚠️ **The dark dig band `dig-side-1` measured is in the SERVICE PASSAGE, not in the
         * study** — `service.mid@90` reads median **11.6** with **58.0% under L 24**. The fix is
         * in `ROOMS.service.lights`, and the study end of the same wall did not need touching.
         * That is a whole round's worth of guessing avoided by pointing a camera at the surface
         * before lighting it.
         * ⚠️ **THE SERVICE WALL IS THE ONE WALL IN THIS ROOM WITH NO FIXTURE ON IT AND THAT IS
         * DELIBERATE, SO THE ROOM'S OWN LIGHT IS ALL IT WILL EVER GET.** `estate-2` §3: in free
         * dig mode `DIG_EDGES` makes the whole of it destructible face or panel aperture, so
         * `wallRun`'s `clashes()` skips every field on it — no panelling, no sconce anchor, no
         * tapestry.
         */
        { pos: [-3.20, 2.60, 4.10], color: 0xffd0a8, intensity: 34, dist: 20, decay: 1.34 },
        /**
         * ⚠️ **THE COLD ONE IS IN A WINDOW BAY, WHICH IS WHERE THE COLD IN THIS ROOM COMES
         * FROM.** It was at local (+3.40, 3.4, −5.30) — mid-air, over the middle of the north
         * end, next to the warmest thing in the room. The near window (local z +1.55) is the one
         * that lights the dead middle of the run and it is 3 m ahead of the spawn camera, so it
         * is also the frame's foreground. 1.2 m in from the reveal at mid-window height: the
         * splay, the panelling either side and a pool on the floor, all from one light that
         * already existed.
         */
        { pos: [-4.60, 2.05, 1.55], color: 0x8fb3de, intensity: 44, dist: 18, decay: 1.45 },
      ],
      // The far side of D1 — `study_w`'s principal opening and the way to the gallery. Unmoved.
      // Local z −8.80 against a half-depth of 7.70: outside the room, in the gallery.
      cool: { pos: [-0.80, 1.90, -8.80], color: 0xa8ccf4, intensity: 46, dist: 10 },
      /**
       * 🆕 **`up` — THE CEILING'S ONLY SOURCE.** Full mechanism in the gallery's entry;
       * this is the same term, bigger, and the reason it is bigger is measured.
       *
       * 🚨 **THE TWO SOUTH STUDY STATIONS ARE THE WORST CEILINGS IN THE HOUSE AND ALSO THE ONLY
       * TWO FRAMES WITH LUMINANCE HEADROOM, WHICH IS WHY THIS IS THE ROOM THAT CAN BE FIXED.**
       * `_ceil1_band.mjs` over the top fifth of the shipped frame: `study_w.south` band median L
       * **6.8** with **39.7% of the band crushed to black**, `study_e.south` band median **4.4**
       * with **41.8%** — against whole-frame medians of 25.1 and 23.1, i.e. both rooms are BELOW
       * the 30–60 gate before this term touches them. So the lift that fixes the ceiling moves
       * the frame toward the gate rather than away from it.
       *
       * `0x59637a` is the sky colour at a bit over half value, and the ratio is the point:
       * keeping the ground a dimmed copy of `0x6f7d96` scales a WALL's hemisphere term without
       * rotating its hue, so the walls gain brightness and no chroma. That matters here — the
       * shipped `study_w.south` band measures a top-decile (r-b)/L of **+0.947**, the most
       * warm-biased band at any of the five stations, because the only thing currently reaching
       * that ceiling is hearth spill down one side of it. A cool base under a warm hearth pool is
       * the gradient the reference halls have; a warm base under a warm pool is one colour.
       *
       * ⚠️ **IT IS 1.4x THE GALLERY'S BECAUSE THE HEADROOM IS, AND BOTH WERE MEASURED BEFORE
       * BEING CHOSEN.** At the gallery's own value the two south stations moved the band +2.8 and
       * +5.0 for **+1.1 / +1.2** on the whole frame — a fifth of what the same term costs the
       * gallery, because these frames are dominated by a marble FLOOR and a floor's normal is +Y,
       * so it receives pure sky and not one unit of this. Two rooms sitting at 23.1 and 25.1
       * against a 30–60 gate can spend that; a room at 62.3 cannot.
       */
      up: 0x59637a,
    },
    /** `?aim=box` — the pre-2026-08-09 aim. See the gallery's note. */
    lightsBox: {
      key: { pos: [1.80, 4.50, 3.30], at: [-0.80, 0.70, -3.70], color: 0xffdcb4, intensity: 215,
        angle: 0.86, penumbra: 0.66, dist: 30, decay: 1.5 },
      warm: [
        { pos: [-3.80, 3.50, 3.90], color: 0xffb271, intensity: 18, dist: 13 },
        { pos: [3.40, 3.40, -5.30], color: 0x6f8fbe, intensity: 40, dist: 20 },
      ],
      cool: { pos: [-0.80, 1.90, -8.80], color: 0xa8ccf4, intensity: 46, dist: 10 },
    },
  },

  { id: 'service', name: 'THE SERVICE PASSAGE', room: 'service', at: [0.00, 0, -16.30], turns: 0 },

  {
    id: 'study_e', name: 'THE EAST STUDY', room: 'study', at: [7.80, 0, -16.30], turns: 0,
    /**
     * 🔦 **RE-AIMED** (`estate-light-1`). The same footprint as `study_w` — literally the same
     * `ROOMS.study` entry — and NOT the same numbers. As built here, ROOM-LOCAL (this room's
     * centre is [+7.80, 0, −16.30]): chimneypiece at local x **0.00** (world +7.80, dead centre;
     * D1's absence lets it take the room's middle, where `study_w`'s is pushed 1.95 m off);
     * windows in the EAST wall at local z −5.22 / +1.55; **two** sconces at local x −2.35 and
     * +2.35; a third tapestry on the north wall.
     *
     * 🚨 **AND THE ONE OUTRIGHT BUG IN THE OLD TABLE WAS HERE: `cool` WAS PARKED BEHIND A WALL
     * WITH NO DOOR IN IT.** The entry was a mirror of `study_w`'s, at local (+0.80, 1.9, −8.80) —
     * the far side of the gallery wall. `study_w` has D1 there; **`study_e` has had nothing there
     * since D3 was removed (2026-08-08)**, so that light spent every frame throwing a blue patch
     * on the gallery's south wall, motivated by nothing, and rimmed no doorway at all. `study_e`'s
     * only open door is **D6, in the SOUTH wall**, so that is where the rim light goes. This is
     * the hazard `room.js` `studyOrderFor` was written to avoid for geometry, showing up one file
     * along in the lighting table.
     * 🎯 **AND IT IS THE CLEANEST ARGUMENT IN THIS FILE FOR WHY A RIG IS NOT A ROOM-TYPE FACT.**
     * The bug WAS the mirror. Two rooms with one footprint had one rig copied between them, and
     * the copy pointed at a door that only one of them has.
     */
    lights: {
      key: { pos: [-0.70, 4.10, 6.60], at: [0.00, 2.20, -7.25], color: 0xfff0e0, intensity: 560,
        angle: 0.34, penumbra: 0.55, dist: 26, decay: 1.5 },
      warm: [
        // The south half, in front of this room's west tapestry — same job as `study_w`'s, on the
        // side of the room the bare service wall leaves darkest.
        // 🆕 Nudged 0.8 m toward the service wall (this room's WEST wall, local x −5.80) and
        // given `study_w`'s new reach — see the long note there. This room started better placed
        // (3.8 m off the service wall against `study_w`'s 9.0) which is why the move is 0.8 m.
        { pos: [-2.80, 2.55, 3.70], color: 0xffd0a8, intensity: 34, dist: 20, decay: 1.34 },
        // The near window bay in the east wall. See `study_w`.
        { pos: [4.60, 2.05, 1.55], color: 0x8fb3de, intensity: 44, dist: 18, decay: 1.45 },
      ],
      // ⚠️ D6, NOT the gallery wall. See the note above. Local z +8.75: past the south wall.
      cool: { pos: [0.80, 1.90, 8.75], color: 0xa8ccf4, intensity: 46, dist: 10 },
      /** The same bounce as `study_w` — same order, same beams, same measured defect. */
      up: 0x59637a,
    },
    /** `?aim=box` — the pre-2026-08-09 aim, including the mirrored `cool` behind a solid wall. */
    lightsBox: {
      key: { pos: [-1.80, 4.50, 3.30], at: [0.80, 0.70, -3.70], color: 0xffdcb4, intensity: 215,
        angle: 0.86, penumbra: 0.66, dist: 30, decay: 1.5 },
      warm: [
        { pos: [3.80, 3.50, 3.90], color: 0xffb271, intensity: 18, dist: 13 },
        { pos: [-3.40, 3.40, -5.30], color: 0x6f8fbe, intensity: 40, dist: 20 },
      ],
      cool: { pos: [0.80, 1.90, -8.80], color: 0xa8ccf4, intensity: 46, dist: 10 },
    },
  },

  { id: 'ballroom', name: 'THE BALLROOM', room: 'ballroom', at: [0.00, 0, -0.65], turns: 0 },
  { id: 'chapel', name: 'THE CHAPEL', room: 'chapel', at: [7.60, 0, -34.55], turns: 0 },
];

/**
 * ⚠️ **DERIVED, NOT AUTHORED — AND EVERY ROW IS BYTE-IDENTICAL TO THE ROW THAT USED TO BE
 * WRITTEN HERE.** `room.js` reads exactly the shape it always did; nothing downstream knows this
 * changed. The gate is `node harness/_loc1_golden.mjs --check <golden>`, which compares 1192
 * exported leaves with `Object.is` (not `===`: a placement transform is exactly the kind of code
 * that turns `0` into `-0`, and `===` cannot see it).
 */
/**
 * 🎨 **A GENERATED ROOM WEARS THE AUTHORED ROOM'S DRESSING — `gendress-1`, 2026-08-15.**
 *
 * John's goal for this phase, in his own words: *"a run generates a different mansion each time,
 * built from John's art rooms, and it looks like his art from inside."* Everything else landed —
 * the houses generate, you can walk them, dig them, get out, they are lit, every dig face wears
 * its room's coat — and the rooms themselves were still bare boxes: floor, walls, cornice.
 *
 * 🎯 **THE FACT THAT MAKES THIS A PLACEMENT AND NOT A REDESIGN, AND IT IS MEASURED, NOT
 * ASSUMED.** `genspike.mjs`'s `LIBRARY` is dimension-for-dimension `ROOMS` — its own header says
 * the footprints were copied from this file — so a generated gallery IS the authored gallery,
 * moved and sometimes turned. `_gendress1-fit.mjs` **F1** re-measures that from both sources on
 * every run: over 16 seeds x {3, 6} rooms it reads **0 of 159 rooms** whose clear extents or
 * storey disagree with `ROOMS[type]` under its own `turns`. So the dressing is not being sized to
 * a new room; it is being carried to where the room went.
 *
 * 🚨 **THE FOOTPRINT CHECK IS A REFUSAL, NOT AN ASSERTION, AND IT IS THIS SLICE'S CONTROL.**
 * A room whose clear extents do NOT match the library entry gets **no dressing at all** and says
 * so on `row.genDress` (`dressed: false`, plus the deltas) — never an order sized for a different
 * room. "This room is dressed" and "I could not resolve this room" have to be distinguishable;
 * dressing it anyway would put a 27.2 m gallery order into a 6.7 m rect, which is a
 * result-shaped output instead of an error and is this project's dominant instrument failure.
 * `_gendress1-fit.mjs` **C1** feeds the pass a deliberately mis-sized row and requires the refusal.
 *
 * ⚠️ **`turns` COMES FROM THE GENERATOR, IT IS NOT CHOSEN HERE.** `genplan.js` reports genspike's
 * own `rot` flag, which swapped the room's structural w/d at SELECTION time. **It is not rare:
 * 44% of generated rooms are turned** (49 of 111 over 16 seeds at `planrooms=6`, 19 of 48 at 3).
 * A dressing pass that ignored it would be wrong on nearly half the rooms in the house.
 *
 * ⚠️ **WHAT A GENERATED ROOM STILL DOES NOT GET, AND IT IS NOT A BUG.** `service` and `chapel`
 * have no `order` in `ROOMS` either — John made art for three rooms, and those two are boxes in
 * the authored house too. They take `pilasters` and nothing else, which is exactly what
 * `study_w`'s neighbours get today.
 *
 * ⚠️ **THE FOOTPRINT, THE PORTALS, THE PANELS AND THE LIGHT RIG ARE NOT TOUCHED HERE.** The rows
 * are `genplan.js`'s own, built from genspike's placed+deflated rect (see that file's divergence
 * note) and already carrying `genlight-1`'s fitted rig. This pass ADDS three fields to a room row
 * and mutates nothing else, so `?gendress=0` is the pre-2026-08-15 build exactly.
 */
const GENDRESS_OFF = (typeof location !== 'undefined'
  ? new URLSearchParams(location.search).get('gendress') : null) === '0';

/** Clear extents are exact doubles off a centimetre grid on both sides — this is float dirt only. */
const FIT_TOL = 1e-6;

function dressGenerated(rows) {
  if (GENDRESS_OFF) return rows;
  for (const row of rows) {
    if (!row.roomType) continue;                    // a corridor row: no library entry, by design
    const def = ROOMS[row.roomType];
    const turns = ((((row.turns | 0) % 4) + 4) % 4);
    if (!def) {
      row.genDress = { dressed: false, why: 'no-library-entry', type: row.roomType };
      console.warn(`[spaces] generated room ${row.id} names unknown room type "${row.roomType}" — left undressed`);
      continue;
    }
    const f = frameOf({ at: [(row.x0 + row.x1) / 2, 0, (row.z0 + row.z1) / 2], turns });
    const turned = f.s !== 0;
    const dw = Math.abs((row.x1 - row.x0) - (turned ? def.d : def.w));
    const dd = Math.abs((row.z1 - row.z0) - (turned ? def.w : def.d));
    const dh = Math.abs(row.storey - def.storey);
    if (dw > FIT_TOL || dd > FIT_TOL || dh > FIT_TOL) {
      row.genDress = { dressed: false, why: 'footprint', type: row.roomType, turns,
        dw: +dw.toFixed(6), dd: +dd.toFixed(6), dh: +dh.toFixed(6) };
      console.warn(`[spaces] generated ${row.roomType} ${row.id} is not the library room`
        + ` (dw ${dw.toFixed(3)} dd ${dd.toFixed(3)} dh ${dh.toFixed(3)}) — left undressed`);
      continue;
    }
    if (def.order !== undefined) row.order = def.order;
    if (def.pilasters !== undefined) row.pilasters = def.pilasters;
    const columns = placeColumns(f, def.columns);
    if (columns) row.columns = columns;
    /** DIAGNOSTIC, read by `_gendress1-fit.mjs`. `room.js` ignores anything it does not name. */
    row.genDress = { dressed: true, type: row.roomType, turns,
      order: def.order ?? null, pilasters: row.pilasters ?? null, columns: !!columns };
  }
  return rows;
}

export const SPACES = GEN ? dressGenerated(GEN.spaces) : roomsFromPlan(HOUSE_PLAN);

/**
 * Walls that are NOT space boundaries. The M1 divider was one: it split the hall in two
 * without the two halves being separate spaces, which is exactly what the pre-mansion room
 * was. From M2 there are none — every wall is a boundary, so the AI's BFS can reason about
 * all of them (`pathPortals` skips any portal whose two ends are the same space).
 */
export const INNER_WALLS = [];

// ---------------------------------------------------------------------------
// Portals — the openings the level came with
// ---------------------------------------------------------------------------

/**
 * `axis` is the axis the portal's WIDTH runs along; the portal's normal is the other one.
 * `w` is a CLEAR width. Circulation doors are 1.90 from M2 onward because
 * `HunterAI.radius` reaches 0.66 at stage 3 and `room.collide()` is a circle push-out, so a
 * stage-3 hunter needs more than 1.32 m of clear width — the kit's 1.28 m door cannot pass
 * it. M1 keeps 1.28 because M1 must reproduce the old room exactly.
 *
 * 🚨 **D2, D3 AND D7 WERE REMOVED — John, 2026-08-08, after a dig playthrough: "remove all the
 * 'door' structures in the gallery except the one that leads into the spawn point."** D1 is the
 * ONLY gallery doorway left; it is the player's spawn room (`study_w`) and was explicitly kept.
 * The rows are DELETED, not disabled — `cutsOnWall` stops cutting a hole at their old x/z the
 * moment the row is gone, so the gallery's long walls close there as ordinary uninterrupted
 * panelling. The ids `D2`, `D3`, `D7` are RETIRED and must never be reissued to a new row (a
 * network-protocol id, even an unused one, is cheaper to retire than to risk colliding with an
 * old client's memory of it).
 *
 * ⚠️ **NO REPLACEMENT PANEL WAS ADDED AT ANY OF THE THREE SITES — solid wall, not a breachable
 * one, is the pick.** Two of the three rooms already keep an existing breachable route into the
 * gallery a few metres from where their door stood (`study_e` via `p.gal_e`, `chapel` via
 * `p.chapel`), authored on purpose "at the far end from its door" — adding a second dig target
 * beside the old doorway would only duplicate that route and hand the search one more hole to
 * count, which is exactly what `dig.md` §1 and John's 2026-08-07 note ("the interconnect wasn't
 * obvious") say NOT to make more legible. `service` loses its only direct link to the gallery
 * (it never had a breachable one, only D2), which is not a solvability problem — `service` keeps
 * D5 to the ballroom and `p.svc_w.*`/`p.svc_e.*` into both studies — but it IS a real loss of a
 * route and is called out below and in the room-level comment.
 *
 * — connectivity after the change, verified by BFS over every non-chained connector, all six
 *   spaces, seeds `s0`..`s511` (`node harness/_tmp_solvability_check.mjs`, kept for re-running):
 *     study_w   D1 (kept) + D4 to the ballroom, + p.gal_w
 *     service   D5 to the ballroom — NO route to the gallery any more, direct or dug; the only
 *               path in is via a study or the ballroom
 *     study_e   D6 to the ballroom, + p.gal_e to the gallery (unchanged)
 *   ⚠️ **THE `p.svc_*` ENTRIES THIS LIST USED TO CARRY WENT ON 2026-08-10** (John's "remove all
 *   the blocker doors from the hallway"; see `PASSAGE_DOORS`). `service` now reaches both studies
 *   through the ballroom, or by digging `svc_w` / `svc_e`. `?doors=1` puts the list back.
 *     chapel    ONLY `p.chapel`, a BREACHABLE panel — the chapel is now a room you must DIG into;
 *               see the mechanic-loss note below
 *
 * 🚨 **THE MECHANIC THIS DELETES.** D7 was 1.20 m wide ON PURPOSE — narrower than the 1.32 m a
 * stage-3 `HunterAI` needs to clear an opening (`room.collide()` is a circle push-out; radius
 * 0.30 + stage*0.12 needs strictly more than 2x radius of clear width: 0.84 / 1.08 / **1.32** at
 * stages 1/2/3). Removing it removes the ONLY narrower-than-standard connector in the whole
 * house, so there is no longer anywhere a growing hunter is physically excluded by an opening's
 * width — "the chapel is a refuge that growth takes away" is gone, not relocated. `p.chapel`
 * remains the sole way in for everyone regardless of stage, loud and readable, which is a real
 * mechanic (force alone still costs a ~4.7 s breach) but is not the same one: it no longer
 * DISTINGUISHES a small hunter from a grown one. John's direction wins; this is flagged rather
 * than quietly preserved, per the brief.
 */
const OPEN = CONNECTOR.OPEN;
/**
 * 🎯 **GEN-CONDITIONAL, LIKE `SPACES`.** `task-plangen-1.md` §3 Change 4 shows `PORTALS`' shape
 * (`state: OPEN`, `axis` = the WIDTH axis) but only gives an explicit anchor for `PANELS` below —
 * this one is needed too, for the same reason `SPACES` is: `room.js` imports `PORTALS` as a
 * top-level binding, so it must already carry the generated house's doors when `GEN` is set.
 */
export const PORTALS = GEN ? GEN.portals : [
  // gallery -> the west study only. D2 (-> service) and D3 (-> study_e) were removed in full —
  // see the note above. `study_w` is the player's spawn room, which is why D1 alone survives.
  { id: 'D1', state: OPEN, a: 'gallery', b: 'study_w', axis: 'x', x: -8.60, z: -24.15, w: 1.90, h: DOOR_H },
  // the three routes -> ballroom, unchanged
  { id: 'D4', state: OPEN, a: 'study_w', b: 'ballroom', axis: 'x', x: -8.60, z: -8.45, w: 1.90, h: DOOR_H },
  { id: 'D5', state: OPEN, a: 'service', b: 'ballroom', axis: 'x', x: 0.00, z: -8.45, w: 1.90, h: DOOR_H },
  { id: 'D6', state: OPEN, a: 'study_e', b: 'ballroom', axis: 'x', x: 8.60, z: -8.45, w: 1.90, h: DOOR_H },
  // D7 (gallery -> chapel, the deliberately-narrow 1.20 m mechanic door) was REMOVED in full —
  // see the mechanic-loss note above. `p.chapel` (in PANELS, below) is now the chapel's only way
  // in, for every hunter stage alike.
];

// ---------------------------------------------------------------------------
// Destructible panels
// ---------------------------------------------------------------------------

/**
 * `id` is the NETWORK KEY (`WallField.add(id)` / `DestructibleWall.syncStage()`), so these
 * strings are a protocol surface. Never renumber them by index.
 */
const BREACHABLE = CONNECTOR.BREACHABLE;
const EXIT = CONNECTOR.EXIT;
/**
 * ⚠️ **EXPORTED SO A PROBE CAN READ THE AUTHORED TABLE INSTEAD OF KEEPING ITS OWN COPY OF IT** —
 * `dig-toggle.mjs` shipped a hardcoded `['service','study_w','study_e']` and reported three rooms
 * as regressions for having exactly the geometry they were given. `PANELS` is what the game reads;
 * this is what a `?doors=1`/`?slab=1` A/B has to diff against.
 */
export const PANELS_AUTHORED = [
  // Between the passage and the two dens — a breach here is a CHORD across the theta graph,
  // turning a three-cycle map into a five-cycle one. `rotY: PI/2` because these walls run
  // along Z; half the panels in the house do, which is what broke `_breach`'s hardcoded
  // z-axis assumption at M2.
  //
  // ⚠️ `state: BREACHABLE` MEANS CHEAP AND IT HAS TO STAY CHEAP. These run on `STAGE_DEFS` —
  // 255 hp, about 1.3 s — because breaching a wall between two rooms is a TRAVERSAL VERB,
  // "there is a route the level gives you and there are routes you make". The siege belongs to
  // `EXIT` alone. Do not blanket-buff this table.
  //
  // 🚪 **THE FOUR `p.svc_*` ROWS BELOW ARE OFF BY DEFAULT SINCE 2026-08-10 AND THEY ARE STILL
  // HERE ON PURPOSE.** John: *"remove all the blocker doors from the hallway. they were for
  // testing. we can bring them back if we need them for future mechanics."* They are filtered
  // out of `PANELS` by `PASSAGE_DOORS` below, NOT deleted — **restore all four with `?doors=1`**,
  // or make `PASSAGE_DOORS_ON` default true to ship them again. The rows stay in place, in this
  // order, because `PANELS`' ORDER is the input to `chooseExit()`; deleting them and putting
  // them back later would be an INSERT, and an insert re-rolls every seed in every document.
  //
  // 🚪 ⚠️ **`name` IS NEW AND IT IS THE ONLY EDIT TO THESE EIGHT ROWS.** `HunterAI` now works on
  // one of these doors when it hears you, and the mechanic is only a mechanic if the player can
  // tell WHICH door is being hit — a callout reading "A DOOR" is a countdown, not a place. Every
  // exit site has carried a `name` since `escape.md` §10.2; the interior panels never did, so the
  // HUD had nothing to say. **Additive only:** no id, no order, no coordinate moved, so
  // `chooseExit()` sees the identical table and no seed in any document re-rolls.
  { id: 'p.svc_w.n', state: BREACHABLE, name: 'THE NORTH PASSAGE DOOR', a: 'service', b: 'study_w', x: -1.85, z: -20.00, rotY: Math.PI / 2 },
  { id: 'p.svc_w.s', state: BREACHABLE, name: 'THE SOUTH PASSAGE DOOR', a: 'service', b: 'study_w', x: -1.85, z: -12.20, rotY: Math.PI / 2 },
  { id: 'p.svc_e.n', state: BREACHABLE, name: 'THE NORTH PASSAGE DOOR', a: 'service', b: 'study_e', x: 1.85, z: -20.00, rotY: Math.PI / 2 },
  { id: 'p.svc_e.s', state: BREACHABLE, name: 'THE SOUTH PASSAGE DOOR', a: 'service', b: 'study_e', x: 1.85, z: -12.20, rotY: Math.PI / 2 },
  // A second way out of each den into the gallery, at the far end from its door.
  { id: 'p.gal_w', state: BREACHABLE, name: 'THE WEST GALLERY DOOR', a: 'gallery', b: 'study_w', x: -12.00, z: -24.15, rotY: 0 },
  { id: 'p.gal_e', state: BREACHABLE, name: 'THE EAST GALLERY DOOR', a: 'gallery', b: 'study_e', x: 12.00, z: -24.15, rotY: 0 },
  // Short-cuts D4 by about 5 m.
  { id: 'p.bal_w', state: BREACHABLE, name: 'THE BALLROOM DOOR', a: 'study_w', b: 'ballroom', x: -3.60, z: -8.45, rotY: 0 },
  // 🚨 Since D7 was removed (2026-08-08), this is the ONLY way ANYONE enters the spur — a robot
  // or the hunter at any stage. It used to be only-the-hunter's route once grown; now it is
  // everyone's only route, always. See the note above `PORTALS`.
  { id: 'p.chapel', state: BREACHABLE, name: 'THE CHAPEL DOOR', a: 'gallery', b: 'chapel', x: 5.60, z: -31.15, rotY: 0 },

  // -------------------------------------------------------------------------
  // EXIT SITES — the win condition. `docs/design/escape.md` §3 and §10.2.
  //
  // ⚠️ THESE ARE APPENDED, NEVER INSERTED, AND THE IDS ABOVE ARE UNTOUCHED. `id` is the
  // NETWORK KEY (`WallField.add(id)` / `DestructibleWall.syncStage()`); the eight ids above
  // are a shipped protocol surface. Extending the table is safe, reordering it is not.
  //
  // Every one of these is an EXTERIOR wall — `b: 'outside'`, which is not a space, so
  // `room.js` gives ownership to `a` and the wall is cut, built and collided exactly like any
  // other panel. Opening one is the only way out of the house.
  //
  // ONE IS LIVE PER RUN AND THE OTHER THREE ARE CHAINED (§6.2). Which is which is a pure
  // function of the run seed — see `src/game/run.js` `chooseExit()` — so the chained-exit
  // storytelling and the per-run shuffle are the same feature, and two clients on one seed
  // cannot disagree. A chained site is `blocksMove: true, damageable: false` (`CHAINED_DEFS`
  // below): a wall you CANNOT chew. That is the point — the first thing the house teaches is
  // that force alone does not work, which is what makes finding the live one a discovery.
  //
  // ⚠️ FOURTEEN, NOT FOUR. `play-critic-7` played the game and named what four cost:
  // **"the operative tell is ELIMINATION, not EVIDENCE"** — with four fixed sites you find the
  // live one by counting padlocks, and *"nobody will ever say 'I should have seen that',
  // because there is nothing to see and nothing to miss."* The concealment cues are built and
  // measured (`exterior.js`: +20.3 luma on the jamb in both breathing phases, cold against a
  // warm room) — they were simply never the cheapest way to find the answer. Thirteen chained
  // sites, spread over six rooms and eight exterior wall runs, is enough that walking the
  // house to enumerate them costs more than reading one.
  //
  // `escape.md` §6.1 asked for TWELVE TO SIXTEEN and four shipped; that gap was the whole
  // difference. It also asks for authored content rather than generated geometry, and these
  // are authored: every one is placed against a real wall run, threaded between the pilaster
  // pitch (see `clearOfCuts` in `room.js`) and given its own yard in `game/exterior.js`.
  //
  // ⚠️ EVERY SITE NEEDS A `YARDS` ENTRY IN `src/game/exterior.js`. Without one the site builds,
  // collides, opens and escapes correctly and then opens onto **nothing** — `exterior.js`
  // warns and skips it. Adding a row here without adding one there is the one way to break
  // this table silently.
  //
  // ⚠️ TWO OF §3'S FOUR CANDIDATES COULD NOT BE BUILT AS WRITTEN, AND THE REASON IS THE SAME
  // ONE IN BOTH CASES: THIS GAME HAS NO VERTICAL AXIS. `Player.update` ends with
  // `this.pos.y = this.world.floorY` unconditionally, every frame, and `grappleTo()` measures
  // and drives XZ only (`Math.hypot(point.x - pos.x, point.z - pos.z)`). There is no jump, no
  // climb and no fall. So:
  //   · §3.1's chapel WINDOW ("visible from the floor, unreachable... the grapple is already
  //     lying in the chapel") cannot be exited by any input the game has. It is a vestry DOOR
  //     here, at floor level, in the same wall of the same dead-end room.
  //   · §3.3's coal chute / cellar hatch needs a hole in the FLOOR and a way down through it.
  //     Neither exists. Replaced by the gallery's boarded window bay, which is the same
  //     §2 storytelling on a wall the engine can actually cut.
  // `STAGE_DEFS`'s `climbable` flag is in the same boat: `isClimbable()` has exactly one
  // caller in the whole project and it is `harness/test-wall.mjs`. Nothing in play reads it.
  // The beam-stage beat this design leans on is REAL and is used — `blocksMove: true` while
  // `blocksSight`/`blocksShots` are false — but it is the see-through-and-still-stuck half,
  // not the climb-it half.
  //
  // `w` / `h` / `cy` are optional and default to PANEL_W / PANEL_H / PANEL_CY.

  {
    // THE DEAD END. `escape.md` §3.1's chapel site, at floor level (see the note above).
    // The chapel is a spur with NO door at all any more (D7 was removed 2026-08-08 — see the
    // note above `PORTALS`), so escaping here means being cornered on purpose: everyone,
    // hunter included, must breach `p.chapel` first, loudly and readably, which is already
    // implemented and already a mechanic. The grapple is already lying at `chapel.centre`, 3.7 m
    // away.
    // x sits in the chapel's xmin wall band [3.90, 4.20]; the exterior skin's own centre is
    // 4.05. z = -33.00 keeps the room's single xmin pilaster (at cz -34.55) alive —
    // `clearOfCuts` drops any pier within 1.46 m and this clears it by 1.55.
    id: 'x.chapel.vestry', a: 'chapel', b: 'outside', x: 4.05, z: -33.00, rotY: Math.PI / 2,
    state: EXIT, name:'THE VESTRY DOOR', room: 'the chapel',
  },
  {
    // THE SERVANT'S PASSAGE — `escape.md` §3.2, unchanged. A small room, so the noise you make
    // opening it is close; but study_w has three other ways out (D1, D4, p.gal_w), so it is
    // still the site with an answer to what the noise brings. ⚠️ It had FIVE until 2026-08-10,
    // when `p.svc_w.n/s` were switched off (see `PASSAGE_DOORS`); the two it lost both led into
    // the service passage, which D4 → D5 still reaches.
    // x in study_w's xmin band [-13.90, -13.60]. z = -18.00 threads BETWEEN the pilasters at
    // -19.50 and -16.30 (1.50 and 1.70 clear against a 1.46 drop radius), so the bay that does
    // not match its neighbours is flanked by two that do — §6's "concealment is honest" tell.
    id: 'x.study_w.servants', a: 'study_w', b: 'outside', x: -13.75, z: -18.00, rotY: Math.PI / 2,
    state: EXIT, name:'THE SERVANTS PASSAGE', room: 'the west study',
  },
  {
    // THE ORANGERY DOORS — `escape.md` §3.4, unchanged. The biggest room, the longest
    // sightlines and nowhere to hide while you work; the ballroom's key light throws across
    // this wall, so you are lit doing it. The skates spawn at `ballroom.south`, 1.95 m in
    // front of these doors, for the run afterwards.
    // Deliberately WIDE — a pair of garden doors, not another 2.08 m hole. That costs the one
    // pilaster at x = 0 (dropped by `clearOfCuts` at 2.02 m); the piers at +/-3.2 survive.
    id: 'x.ballroom.orangery', a: 'ballroom', b: 'outside', x: 0.00, z: 7.15, rotY: 0,
    w: 3.20, h: 3.40, cy: 1.70,
    state: EXIT, name:'THE ORANGERY DOORS', room: 'the ballroom',
  },
  {
    // THE BOARDED BAY — `escape.md` §2's gallery windows "boarded from the OUTSIDE", promoted
    // to a site because §3.3's coal chute cannot be built (see above). The gallery is 27 m of
    // sightline and the patrol dwells in it twice a lap facing down its full length, so this
    // is the site you can watch coming for you from twenty metres — and the one where it can
    // watch you back.
    // z in the gallery's zmin band [-31.30, -31.00], the same band `p.chapel` occupies (and D7
    // used to, before it was removed 2026-08-08). x = -4.80 threads between the piers at -6.4
    // and -3.2 with 1.60 m clear each side, and is well west of the stretch the chapel abuts
    // (x 4.20..11.00).
    id: 'x.gallery.boards', a: 'gallery', b: 'outside', x: -4.80, z: -31.15, rotY: 0,
    state: EXIT, name:'THE BOARDED BAY', room: 'the long gallery',
  },

  // -------------------------------------------------------------------------
  // POOL EXPANSION — `escape.md` §6.1's twelve-to-sixteen, appended 2026-08-04.
  //
  // ⚠️ APPENDED, NEVER INSERTED. The ten ids below are new; not one line above this comment
  // was touched. `chooseExit()` derives from the POOL ORDER, so a seed now selects a different
  // site than it did yesterday — that is a build change and it is fine (`run.js` says so in as
  // many words). Renumbering an existing id would not be fine, and nothing here does.
  //
  // WHERE THEY CAN GO, worked out from the floor plan rather than guessed. Only these wall
  // runs have nothing on the far side of them:
  //
  //     gallery   xmin (z -31.00..-24.30) · xmax (same) · zmin west of the chapel wing (x < 4.20)
  //     study_w   xmin (z -24.00..-8.60)
  //     study_e   xmax (z -24.00..-8.60)
  //     ballroom  xmin / xmax (z -8.30..7.00) · zmax (x -13.90..13.90)
  //     chapel    zmin (x 3.90..11.30) · xmax (z -37.80..-31.30)
  //     service   NONE — it is landlocked between the two studies and the two hubs.
  //
  // ⚠️ THE COORDINATE ON THE WALL'S OWN AXIS MUST LAND IN THE 0.30 m BAND OR THE HOLE IS NEVER
  // CUT. `room.js` `cutsOnWall` tests `inBand`, and a panel that misses it builds its layers,
  // its collider and its escape box in the middle of a solid wall: it opens, you walk through
  // the aperture, and the wall is still there. The band centres are `x0 - 0.15`, `x1 + 0.15`,
  // `z0 - 0.15`, `z1 + 0.15` and every value below is one of those.
  //
  // ⚠️ AND THE OTHER COORDINATE IS THREADED BETWEEN THE PILASTERS. `clearOfCuts` drops any
  // pier within `w/2 + 0.42` of an opening — 1.46 m for a 2.08 m panel — and the pitch is a
  // fixed 3.2 m off each space's own centre. Sitting a site 1.60 m from two piers keeps BOTH,
  // which is `escape.md` §6's "a bay that does not match its neighbours": the tell only means
  // anything when there are neighbours to not match.

  {
    // The gallery's west end, round the corner from the boarded bay. 1.75 m off the single
    // xmin pier at z = -27.65, so the pier survives.
    id: 'x.gallery.west', a: 'gallery', b: 'outside', x: -13.75, z: -29.40, rotY: Math.PI / 2,
    state: EXIT, name:'THE WEST BAY', room: 'the long gallery',
  },
  {
    // ...and the east end, the same bay mirrored. The gallery is 27 m of sightline with a
    // patrol dwell at each end, so the two ends are genuinely different problems.
    id: 'x.gallery.east', a: 'gallery', b: 'outside', x: 13.75, z: -29.40, rotY: Math.PI / 2,
    state: EXIT, name:'THE EAST BAY', room: 'the long gallery',
  },
  {
    // The north wall again, 6.8 m west of the boarded bay: two identical bays in one wall, one
    // of which leaks. 2.00 m off the pier at x = -9.60, so every pier on that run survives.
    id: 'x.gallery.north_w', a: 'gallery', b: 'outside', x: -11.60, z: -31.15, rotY: 0,
    state: EXIT, name:'THE NORTH BAY', room: 'the long gallery',
  },
  {
    // The west study's other outside wall, at the ballroom end rather than the gallery end —
    // so the two study_w sites are 6.5 m apart and reached from opposite doors. Threads the
    // piers at z = -13.10 and -9.90 with 1.60 m clear each side.
    id: 'x.study_w.scullery', a: 'study_w', b: 'outside', x: -13.75, z: -11.50, rotY: Math.PI / 2,
    state: EXIT, name:'THE SCULLERY DOOR', room: 'the west study',
  },
  {
    // The east study had no way out at all and it is the mirror of study_w — the same room,
    // the same furniture, and until now a guaranteed dead end for the search. That asymmetry
    // was itself a tell.
    id: 'x.study_e.icehouse', a: 'study_e', b: 'outside', x: 13.75, z: -18.00, rotY: Math.PI / 2,
    state: EXIT, name:'THE ICE HOUSE DOOR', room: 'the east study',
  },
  {
    id: 'x.study_e.stair', a: 'study_e', b: 'outside', x: 13.75, z: -11.50, rotY: Math.PI / 2,
    state: EXIT, name:'THE BACK STAIR DOOR', room: 'the east study',
  },
  {
    // The ballroom's flanks. The arena has the longest sightlines in the house and a colonnade
    // down the middle at z = -0.65; these sit 4.8 m north of it, so the piers are between you
    // and the room's north door while you work.
    id: 'x.ballroom.terrace_w', a: 'ballroom', b: 'outside', x: -13.75, z: -5.45, rotY: Math.PI / 2,
    state: EXIT, name:'THE WEST TERRACE DOOR', room: 'the ballroom',
  },
  {
    id: 'x.ballroom.terrace_e', a: 'ballroom', b: 'outside', x: 13.75, z: -5.45, rotY: Math.PI / 2,
    state: EXIT, name:'THE EAST TERRACE DOOR', room: 'the ballroom',
  },
  {
    // The south wall, 8 m west of the orangery doors: the same wall, the same daylight, and
    // only one of the two is real. 1.60 m off the piers at x = -9.6 and -6.4, so both stand.
    id: 'x.ballroom.south_w', a: 'ballroom', b: 'outside', x: -8.00, z: 7.15, rotY: 0,
    state: EXIT, name:'THE GARDEN DOOR', room: 'the ballroom',
  },
  {
    // The chapel's far end. The spur already has one site; a second means the dead end is not
    // automatically a wasted walk, and it is the deepest point in the house from the player
    // spawn — the site that costs the most to reach and the most to be caught at.
    // 2.00 m off the single zmin pier at x = 7.60.
    id: 'x.chapel.crypt', a: 'chapel', b: 'outside', x: 5.60, z: -37.95, rotY: 0,
    state: EXIT, name:'THE CRYPT DOOR', room: 'the chapel',
  },
];

/**
 * 🚪 **THE FOUR SERVICE-PASSAGE DOORS, AND WHY THEY ARE A FLAG RATHER THAN A DELETION.**
 *
 * John, 2026-08-10: *"remove all the blocker doors from the hallway. they were for testing. we can
 * bring them back if we need them for future mechanics."* The hallway is the SERVICE PASSAGE and
 * the four rows are `p.svc_w.n` (z −20.00), `p.svc_w.s` (−12.20) and their `svc_e` mirrors, 2.08 m
 * each — the two shipped `BREACHABLE` connectors per side wall.
 *
 * 🎯 **HOW TO BRING THEM BACK, WHICH IS THE HALF OF THE ASK THAT IS A REQUIREMENT:**
 *   · for one session, in the URL — **`?doors=1`** (also `on` / `true`);
 *   · to ship them again — make `PASSAGE_DOORS_ON` default `true` here. Nothing else moves: the
 *     rows are still in `PANELS_AUTHORED`, in their original order, with their original ids.
 * **Do not "restore" them by re-typing the rows.** Their position in `PANELS_AUTHORED` is a
 * protocol surface twice over — `WallField.add(id)` keys on the id, and `chooseExit()` reads the
 * POOL ORDER — so a re-insert is the one edit that re-rolls every seed quoted in every document.
 *
 * ✅ **AND REMOVING THEM CANNOT MOVE A SEED, WHICH IS THE PROPERTY THAT HAD TO SURVIVE.** All four
 * are `BREACHABLE`, never `EXIT`, so `EXIT_SITES = PANELS.filter(isExitSite)` returns the same 14
 * ids in the same order with them present and absent, and `run.js` `chooseExit()` cannot see the
 * flag. Measured rather than argued, with a control that shrinks the pool by one:
 * `harness/_doors1-pool.mjs` (and `_slab1-cost.mjs` D, independently).
 *
 * ⚠️ **THE COST, STATED: there is now NO connector at all directly between `service` and either
 * study.** The passage keeps D5 to the ballroom, so `service` ↔ `study_w` is D5 → D4 (and ↔
 * `study_e` is D5 → D6) and the house is still fully connected with `?dig=0` — proved by BFS in
 * `_doors1-pool.mjs`, not assumed. What is gone is the DIRECT hop; the direct route now has to be
 * dug, which is what `svc_w` / `svc_e` in `dig.js` `DIG_EDGES` are for.
 *
 * 🧱 **THE SLAB ARM (`?slab=1`) USED TO OWN THIS FILTER AND NOW INHERITS IT.** Its whole floor-plan
 * edit was dropping these same four rows so one 15.40 m face could cover the wall; on the default
 * arm the wall is already clear, so **`?slab=1` is now a `dig.js` change only** and the two arms
 * differ in span TILING and in nothing else. `?doors=1` is refused on the slab arm for the obvious
 * physical reason — a slab cannot contain an aperture yet, which is the open question the spike
 * exists to ask (`dig.js` `SLAB`).
 */
export const PASSAGE_DOORS = new Set(['p.svc_w.n', 'p.svc_w.s', 'p.svc_e.n', 'p.svc_e.s']);

const SLAB_ARM = typeof location !== 'undefined'
  && ['1', 'on', 'true'].includes(new URLSearchParams(location.search).get('slab'));

/** ⚠️ Guarded for node — every harness scenario imports this file outside a browser. */
const DOORS_URL = typeof location !== 'undefined'
  && ['1', 'on', 'true'].includes(new URLSearchParams(location.search).get('doors'));

/** The one switch. Flip this default to `true` to ship the hallway doors again. */
export const PASSAGE_DOORS_ON = DOORS_URL && !SLAB_ARM;

/**
 * 🎯 **`PANELS` in slice 1 carries the EXIT SITES and nothing else, under `GEN`** — every internal
 * connection in a generated house is an OPEN `PORTALS` row (Change 4); there is no generated
 * `BREACHABLE`/`CHAINED` interior panel yet (slice 2's dig work).
 */
export const PANELS = GEN ? GEN.panels : (PASSAGE_DOORS_ON
  ? PANELS_AUTHORED
  : PANELS_AUTHORED.filter((p) => !PASSAGE_DOORS.has(p.id)));

/**
 * ⚠️ **THE ONE TABLE THE BUILDER READS.** `room.js` walks this and nothing else; `PORTALS` and
 * `PANELS` above are the authored halves of it and are kept as exports because the ids are a
 * protocol surface and the harness reaches for them by name.
 *
 * `docs/design/procedural-map.md` §6.1 — this is step 1, "the connector interface... nothing
 * procedural yet; retrofit the EXISTING six-space plan onto it and prove the game still plays
 * identically. **This is the step that de-risks everything after it.**"
 *
 * ⚠️ THE CONCATENATION ORDER IS PART OF THE CONTRACT. `PANELS`' order decides which site a
 * given seed selects (`run.js` `chooseExit`), and `WallField.add(id)` keys on the id strings.
 * Appending to either half is safe; inserting into or renumbering `PANELS` re-rolls every seed
 * quoted in every document. Portals first is arbitrary and stable.
 *
 * WHAT A GENERATOR WILL DO WITH THIS (step 3, deliberately NOT built this round): emit an array
 * of exactly these rows — `{ id, state, a, b, x, z, rotY|axis, w?, h?, cy? }` — having proved
 * §5's four solvability properties over its seed. Nothing downstream needs to change, because
 * nothing downstream reads `PORTALS` or `PANELS` any more.
 */
export const CONNECTORS = [...PORTALS, ...PANELS];

/**
 * The exit-site pool, derived. `run.js`'s `chooseExit()` takes the IDS in this order and its
 * output depends on that order — see its own warning. Nothing else may reorder `PANELS`.
 *
 * ⚠️ ONE SOURCE OF TRUTH. This used to test a separate `exit: true` flag that sat beside the
 * row's real description of itself; a row could carry the flag and not the state, or the state
 * and not the flag, and the two answers would have gone to different consumers. There is one
 * field now and `isExitSite()` is the only reader.
 *
 * 🚨 **AND IT IS A MODULE-LEVEL CONSTANT COMPUTED AT IMPORT, WHICH IS THE NEXT SLICE'S PROBLEM
 * AND DELIBERATELY NOT THIS ONE.** `house-packing.md` §9.3: in a generated house `PANELS` is
 * itself generated, so **the exit pool changes for every seed by construction** and this must
 * become a FUNCTION OF THE PLAN, threaded through `views/game.js` (`:15` imports it, `:113`
 * slices it for `?exits=N`, `:121` builds `SITES` from it, and `run.js`'s `chooseExit(seed,
 * sites)` derives the live exit from the POOL ORDER). Small mechanical change, large blast
 * radius, because the constant is imported directly — and it re-rolls every seed quoted in every
 * document, which is why the generated house has to ship as `?estate=gen` ALONGSIDE
 * `?estate=port` rather than replacing it. `localise-1` left it alone on purpose: this slice
 * changes nothing a player can see, and this is the one line in the file that cannot keep that
 * promise. ⚠️ Note also `src/game/exterior.js`'s `YARDS`, which is keyed by exit-site id and is
 * world-authored per site — a generated pool needs generated yards or every new site opens onto
 * nothing (`exterior.js` warns and skips).
 */
export const EXIT_SITES = PANELS.filter(isExitSite);

/**
 * ⚠️ THE STAGE TABLES AND THE BREACH NOISE MOVED TO `src/game/connectors.js` AND THESE ARE
 * RE-EXPORTS. They are behaviour, not floor plan: `CHAINED_DEFS` is what the CHAINED state IS,
 * `EXIT_DEFS` is what the EXIT state IS, and both belong beside the enum that names them rather
 * than in the table of where the rooms are. Every measurement recorded against them still
 * holds — the arrays are the same arrays, moved, not rewritten. Import them from `connectors.js`
 * in new code; these exist so `views/game.js` and `harness/scenarios/eo2-siege.mjs` keep working.
 */
export { CHAINED_DEFS, EXIT_DEFS, BREACH_NOISE } from './connectors.js';

/**
 * ⚠️ A TABLE THAT CANNOT BE WRONG SILENTLY. Every failure mode below has cost this project a
 * round at least once, and none of them throws on its own:
 *
 *   · a duplicate id      `WallField` keys on it; two rows would share one wall's network state
 *   · a missing space     a connector to nowhere builds, collides and leads into the void
 *   · an unknown state    `defsFor()` would default it to breachable — an exit you can chew in
 *                         1.3 s, which reads as the siege being broken
 *   · a zero clear width  `pathPortals(minW)` would refuse everyone and the AI would look lost
 *
 * Module scope on purpose: it runs in the browser, in node and on the server, once, at import,
 * and it is four loops over twenty-two rows.
 */
{
  const seen = new Set();
  const spaceIds = new Set(SPACES.map((s) => s.id));
  for (const c of CONNECTORS) {
    if (seen.has(c.id)) throw new Error(`[spaces] duplicate connector id "${c.id}"`);
    seen.add(c.id);
    if (!CONNECTOR_STATES.includes(c.state)) throw new Error(`[spaces] connector "${c.id}" has no state`);
    // `b: 'outside'` is legal and is not a space — that is what makes a site an exterior wall.
    if (!spaceIds.has(c.a)) throw new Error(`[spaces] connector "${c.id}" leaves unknown space "${c.a}"`);
    if (c.b !== 'outside' && !spaceIds.has(c.b)) throw new Error(`[spaces] connector "${c.id}" enters unknown space "${c.b}"`);
    if (!(clearWidth(c) > 0.4)) throw new Error(`[spaces] connector "${c.id}" has no usable clear width`);
  }
}

// ---------------------------------------------------------------------------
// Patrol
// ---------------------------------------------------------------------------

/**
 * An ordered loop touching ALL SIX spaces. The hunter walks it and DWELLS at each stop with
 * its head at full scan amplitude — a thing that stops and looks is the cheapest horror in
 * the game, and the route should be mostly made of it.
 *
 * ⚠️ EXPECT A SLOW LAP AND DO NOT "FIX" IT. Patrol speed is `HUNTER_SPEED[1] * 0.38 = 0.78
 * m/s`; the route is ~123 m plus ~28 s of dwell, so ONE LAP IS ABOUT 185 SECONDS. That is
 * correct for a stalker and it is what makes the opening beat work without a grace timer.
 * Scenarios that cannot wait that long should teleport the hunter to an anchor and say so.
 *
 * ⚠️ LEG 0 -> 1 SWEEPS **WEST** ALONG THE BALLROOM'S SOUTH WALL, AND THE OLD ROUTE'S "EAST
 * AND NORTH" WAS THE BUG. It read `ballroom(9.0, 4.2) -> ballroom(11.5, -5.5) ->
 * study_e(8.6, -12.0)`: three stops in a row sitting on x ~ 8.6-11.5, which is the D6 axis.
 *
 * That is fine for the one route it was tuned against — the player walks north up study_w and
 * stops in the middle of the gallery, and first ALERT lands at 41.8 s. It falls apart the
 * moment the player does the obvious thing instead and follows the gallery east into the east
 * study, because the two of them are then walking the same ring in OPPOSITE directions and
 * meet head-on in a 6.7 m-wide corridor. Measured, with real WASD and portal-aware steering:
 *
 *   player enters study_e at the north end   t = 14.8 s
 *   hunter at ballroom (9.8, -5.4), on the D6 axis, walking north into the same corridor
 *   line of sight opens THROUGH D6           t = 17.3 s at 11.3 m
 *   ALERT 17.6 s · STALK 17.9 s · PURSUE 18.3 s · closest approach 0.3 m · ATTACK 21.2 s
 *
 * Eleven metres of straight corridor was 0.9 s of awareness ramp on the single-rate curve
 * this predates (see `HUNTER_SENSE`; the confirm rate is now inverse-square in distance and
 * 11 m costs about 5.7 s), so there was no approach to perceive and nowhere to go: the
 * corridor IS the
 * sightline. The fix is spacing, not blindness. D6's opening spans x 7.65..9.55, so a hunter
 * west of about x = 2.85 anywhere in the ballroom cannot see ANY of study_e through it — the
 * jamb does the work. Leg 0 -> 1 puts the hunter west of that line by t ~ 10 s and keeps it
 * there for the whole time a player walking the natural route is inside the east study.
 *
 * What the player gets instead is the same encounter staged the other way round: they step
 * out of D6 into the ballroom at t ~ 21 s and the hunter is ~19 m away across the largest,
 * best-lit room in the house, in PATROL, walking at 0.78 m/s. Long sightline, open floor,
 * three exits. That is a beat you can answer. Re-measured on both routes after the change —
 * see `harness/scenarios/diag-fair.mjs`, which walks them back to back.
 */
/**
 * 🚨 A GENERATED HOUSE NEEDS A GENERATED ROUTE, AND UNTIL NOW IT WALKED THE AUTHORED ONE.
 *
 * `HunterAI._patrol` reads `wp.x`, `wp.z` and `wp.dwell` and never reads `wp.space`, so under
 * `?plan=gen` the hunter did not fall back to standing still — he walked the FIXED house's
 * coordinates through a building that is not there. `views/game.js` already says so in capitals
 * beside the sense overlay: *"the route is not absent either, it is FOREIGN — which is a
 * different and worse thing"*, and it counts how many stops land inside the real envelope. This
 * makes that count 100% by construction.
 *
 * THE ROUTE, and it is deliberately dull: every space gets TWO stops at opposite ends of its own
 * long axis, inset from the walls, and the spaces are visited nearest-neighbour from the hunter's
 * own spawn. Two stops per room rather than one because a single centre stop makes the hunter
 * pirouette on the spot — the authored route's value is that he walks the LENGTH of a room and
 * therefore sweeps its sightline, which is the thing the player has to time.
 *
 * ⚠️ INSET IS 22% OF THE ROOM, NOT A FIXED METRE. The generator makes rooms from 4 m to 20 m
 * across; a fixed 2 m inset puts both stops of a small room on top of each other, which reads as
 * a hunter stuck in a corner. A fraction keeps the sweep proportional to the room.
 *
 * ⚠️ NOT SORTED BY ID. Room ids come out of the generator in creation order, which has nothing to
 * do with adjacency, and a route that teleports between opposite ends of the house makes the
 * hunter's position unlearnable — the one thing patrol exists to make learnable.
 */
function generatedPatrol(spaces) {
  const MIN_AREA = 6;             // skip cupboards; a stop inside one is a hunter facing a wall
  const rooms = spaces.filter((s) => (s.x1 - s.x0) * (s.z1 - s.z0) >= MIN_AREA);
  if (!rooms.length) return [];

  const stopsFor = (s) => {
    const w = s.x1 - s.x0, d = s.z1 - s.z0;
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    // Walk the LONG axis: that is the sightline worth sweeping.
    const along = w >= d
      ? [[s.x0 + w * 0.22, cz], [s.x1 - w * 0.22, cz]]
      : [[cx, s.z0 + d * 0.22], [cx, s.z1 - d * 0.22]];
    return along.map(([x, z]) => ({ space: s.id, x: snap(x), z: snap(z), dwell: 2.5 }));
  };

  // Nearest-neighbour from the hunter's spawn, so the lap is a walk and not a teleport.
  const start = GEN?.spawn?.hunter ?? [0, 0];
  const left = [...rooms];
  const order = [];
  let at = { x: start[0], z: start[1] };
  while (left.length) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < left.length; i++) {
      const s = left[i];
      const dx = (s.x0 + s.x1) / 2 - at.x, dz = (s.z0 + s.z1) / 2 - at.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bd) { bd = d2; bi = i; }
    }
    const s = left.splice(bi, 1)[0];
    order.push(s);
    at = { x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2 };
  }

  const route = [];
  for (const s of order) {
    const two = stopsFor(s);
    // Enter at whichever end is nearer to where the last stop left him.
    const last = route[route.length - 1];
    if (last) {
      const d0 = (two[0].x - last.x) ** 2 + (two[0].z - last.z) ** 2;
      const d1 = (two[1].x - last.x) ** 2 + (two[1].z - last.z) ** 2;
      if (d1 < d0) two.reverse();
    }
    route.push(...two);
  }
  return route;
}

/**
 * CONTROL THAT MUST FAIL — `?patrol=authored` forces the FIXED house's route into a generated
 * one, which is precisely the bug above. `harness/_gen1_integration.mjs` runs it and requires the
 * "every stop inside the house" assertion to fail; an assertion that cannot be made to fail is
 * not evidence that anything was fixed.
 */
const PATROL_AUTHORED_CONTROL = typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('patrol') === 'authored';

export const PATROL_ROUTE = (GEN && !PATROL_AUTHORED_CONTROL) ? generatedPatrol(SPACES) : [
  { space: 'ballroom', x: 9.0, z: 4.2, dwell: 2.0 },     // spawn, south-east corner
  { space: 'ballroom', x: -4.2, z: 5.2, dwell: 3.0 },    // WEST along the south wall — off the D6 axis by t~10s
  { space: 'study_e', x: 8.6, z: -12.0, dwell: 2.5 },
  { space: 'study_e', x: 4.0, z: -21.0, dwell: 2.0 },
  { space: 'gallery', x: 11.0, z: -27.6, dwell: 3.0 },   // faces west, down the full 27 m
  { space: 'chapel', x: 7.6, z: -34.5, dwell: 2.5 },     // the spur is patrolled: hiding there is a gamble
  { space: 'gallery', x: 0.0, z: -27.6, dwell: 2.0 },
  { space: 'gallery', x: -11.0, z: -27.6, dwell: 3.0 },  // faces east, down the full 27 m
  { space: 'study_w', x: -8.6, z: -21.0, dwell: 2.0 },
  { space: 'study_w', x: -4.0, z: -12.0, dwell: 2.5 },
  { space: 'service', x: 0.0, z: -16.0, dwell: 2.0 },
  { space: 'ballroom', x: 0.0, z: -4.0, dwell: 1.5 },    // -> back to 0
];

// ---------------------------------------------------------------------------
// Spawns
// ---------------------------------------------------------------------------

/**
 * `facing` is `atan2(dx, dz)`, so 0 points toward +Z and PI points toward -Z. The player
 * spawns at the study's SOUTH end facing north, up the room and toward D1.
 *
 * THE OPENING BEAT IS DELIVERED BY THESE THREE NUMBERS AND BY `PATROL_ROUTE`, NOT BY A GRACE
 * TIMER (§6.2). A scripted immunity is cheap, exploitable and invisible to the player. The
 * arithmetic instead: straight-line player-to-hunter is 23.7 m with TWO walls between, walking
 * noise is ~0.49 so `hearRange 14 x 0.49 = 6.9 m` and even a sprint (1.0 -> 14 m) is inaudible
 * at spawn — and `PATROL_ROUTE[0..1]` walks the hunter WEST along the ballroom's far south
 * wall, which keeps it off the D6 sightline into the east study for the whole first lap a
 * player can walk. See the route table's own note: "east and north" was the version that
 * ambushed anyone who followed the gallery, and the numbers are there.
 */
/**
 * 🎯 **UNDER `GEN`, THE THREE PAIRS ARE THE GENERATED PLAN'S OWN** (`genplan.js`
 * `generatedTables().spawn`) — the spawn room's rect centre (twice, matching the authored
 * table's two-entry shape), a different room's centre for the hunter, and the same spawn centre
 * again for the capture director. task-plangen-1 §3 Change 5: "without this the player spawns
 * outside the generated envelope and the first thing John sees is not the house."
 */
export const SPAWN = GEN ? GEN.spawn : {
  player: [[-8.60, -11.60], [-6.20, -11.60]],
  hunter: [9.00, 4.20],
  /**
   * The capture director only: the gallery's west end, looking east down the room.
   *
   * ⚠️ NOT -12.00, which is what the plan's §6.1 specifies. The camera is a THIRD-PERSON boom
   * 3.1 m behind the player, and the gallery's west wall is at -13.60 — so standing at -12.00
   * and looking east puts the boom 1.6 m from a wall it then collapses against, and half the
   * "read of the space" frame is a close-up of plaster. Measured by looking at the capture.
   * -8.80 leaves 1.7 m of clearance behind the boom and still gives a 22.4 m recession east.
   */
  capture: [-8.80, -27.60],
};

// ---------------------------------------------------------------------------
// Anchors — named points, so scenarios stop hardcoding coordinates
// ---------------------------------------------------------------------------

/**
 * WHY THIS EXISTS. `feel-b`, `feel-c` and `look-tells` each hardcoded a pair of XZ
 * coordinates chosen for the pre-mansion hall. Those coordinates do not throw when the map
 * changes — they place bodies inside walls, produce plausible numbers and report PASS on a
 * measurement of nothing, which is the exact instrument-failure class this project keeps
 * hitting. Every scenario now asks for a named ROLE and the table answers with wherever
 * that role lives in the current floor plan.
 *
 * 🚨 **AND HERE IS THE MEASURED REASON THIS TABLE IS NOT PART OF THE ROOM LIBRARY**
 * (`localise-1`, 2026-08-09). `study_w` and `study_e` are ONE footprint used twice — the same
 * `ROOMS.study` entry, 11.60 x 15.40 — so a per-TYPE station table ought to give them the same
 * local points. It does not. `study_w.south` is world x −8.60 and `study_e.south` is +8.60,
 * which in each room's own frame is **local x −0.80 and +0.80**: mirrored, not equal. The reason
 * is that these stations are not room facts at all — they stand on the D1/D4 axis and the D6
 * axis respectively, i.e. they are derived from CONNECTORS. So a generated house cannot get its
 * station anchors from the room library; it has to derive them from the plan's connector
 * positions, the same way `room.js` `studyOrderFor` already derives the chimney bay. Filed
 * rather than fixed: `house-packing.md` §9.4 defers this set with the hunter.
 *
 * The ROLE anchors are the contract the scenarios depend on:
 *   hide.player / hide.hunter    line of sight BLOCKED between them, about 12 m apart
 *   los.player  / los.hunter     line of sight CLEAR through an opening, 14 m or more
 *   duel.player / duel.hunter    same space, clear between them, for A/B fight beats
 *   tell.player / tell.hunter    same, but with 3 m of clear floor BEHIND the player so the
 *                                camera boom is not clipped — `look-tells` judges pictures of
 *                                the faceplate and a boom jammed against a wall renders wall.
 * The PLACE anchors name rooms and are what a future scenario should reach for.
 */
export const ANCHORS = {
  // ---- roles
  //
  // `hide.*` MUST KEEP THE WALL BETWEEN THEM AT EVERY DISTANCE THE SCENARIO USES, not just at
  // the anchors themselves. `feel-b` places the hunter `d` metres along the hide.player ->
  // hide.hunter direction, with d = 8, 10 and 12, so the pair has to run straight at a solid
  // stretch of the gallery/study_w wall and the player has to stand nearer to it than the
  // smallest d. Here the line is due north at x = -4.0, which is solid: D1 spans
  // x -9.55..-7.65 and `p.gal_w` spans x -13.04..-10.96, and -4.0 is in neither.
  'hide.player': [-4.00, -18.00],   // study_w, 6.15 m south of the wall
  'hide.hunter': [-4.00, -30.00],   // gallery, 12 m due north, wall between

  // Straight down D1's axis, so the sightline is clear THROUGH the opening and nowhere else.
  'los.player': [-8.60, -11.00],    // study_w
  'los.hunter': [-8.60, -27.00],    // gallery, 16.0 m away, clear through D1

  // Same room, clear between them, 12 m apart — the A/B fight beats want no wall at all.
  'duel.player': [-8.00, -10.50],
  'duel.hunter': [-8.00, -22.50],

  // As duel, but with 5 m of clear floor BEHIND the player: `look-tells` judges pictures of
  // the faceplate and a camera boom jammed against a wall renders wall.
  'tell.player': [-8.00, -14.00],
  'tell.hunter': [-8.00, -16.30],

  // THE OPPOSITE CONTRACT TO `tell.player`, and it needs one now. `feel-a`'s camera test is
  // about the player's BACK against a wall, and it produced that by holding S for 3.2 s from
  // the spawn — which worked in a 15.6 m box and does not work in a house, because D4 is
  // directly behind the spawn and the robot simply walks through it into the ballroom and
  // keeps going. It does not throw: it measures an unobstructed boom in an open room and
  // reports a camera failure that is really a map change. `wall.back` faces north with SOLID
  // wall 2.0 m behind (x = -11.00 is between D4 at -8.60 and the west wall, and clear of
  // `p.bal_w` at -3.60), so walking S presses into it, and **S+A** corners it
  // against the south-west angle of the study.
  //
  // ⚠️ S+A, NOT S+D, AND THIS LINE SAID S+D UNTIL IT WAS MEASURED. `Player` resolves the
  // strafe as `x = sin(aimYaw)*mv.y - cos(aimYaw)*mv.x`; at the spawn's `aimYaw = PI` that is
  // `x = +mv.x`, so D goes EAST — along the south wall and out through D4, whose opening spans
  // x -9.55..-7.65. `feel-a`'s corner test did exactly that for a milestone: it walked out of
  // the room it was meant to be cornered in, and reported the resulting off-screen hunter as a
  // camera regression.
  'wall.back': [-11.00, -10.60],

  // ---- places. Every one now names a REAL room: the M2 note that `service`, `ballroom` and
  // `chapel` resolved to the nearest legal point of a space that existed yet is retired.
  'study_w.south': [-8.60, -11.60],
  'study_w.north': [-8.60, -21.00],
  'study_e.south': [8.60, -11.60],
  'study_e.north': [8.60, -21.00],
  'gallery.west': [-12.00, -27.60],
  'gallery.mid': [0.00, -27.60],
  'gallery.east': [12.00, -27.60],
  'service.mid': [0.00, -16.00],
  'service.north': [0.00, -21.50],
  'service.south': [0.00, -11.00],
  'ballroom.centre': [0.00, -0.65],
  'ballroom.north': [0.00, -6.20],
  'ballroom.south': [0.00, 5.20],
  'ballroom.east': [11.00, -3.00],
  'chapel.centre': [7.60, -34.50],
};

// ---------------------------------------------------------------------------
// Tiny helpers — data queries only
// ---------------------------------------------------------------------------

/**
 * 🏚️ **A GENERATED FLOOR PLAN, DRESSED, FOR A CALLER WITH NO URL — `buildTestRoom`'s `o.tables`.**
 *
 * `docs/slices/task-prime-time-lobby-warm-night.md` §3.3. Everything above is computed ONCE at
 * import time from `location.search`, which is right for `views/game.js` and impossible for the
 * party night: its mansion renders inside a follow slot whose URL schema forbids `plan` on
 * purpose, and its plan comes from the public `worldSeed` instead (`src/party/mansion.js`).
 *
 * ⚠️ **IT LIVES HERE BECAUSE `dressGenerated` AND `generatedPatrol` DO.** Both are private to this
 * file, and both have to run for a generated row to be a room rather than a box: `dressGenerated`
 * is what attaches `ROOMS[roomType]`'s order, pilasters and columns — *"a run generates a
 * different mansion each time, built from John's art rooms, and it looks like his art from
 * inside"* — and `generatedPatrol` is what gives the house a hunter route. Exporting the two
 * privates instead would put the obligation to call both on every caller, and the first one to
 * forget gets an undressed mansion that still renders.
 *
 * The four tables are exactly the five `buildTestRoom` reads, so nothing here can be half-applied.
 */
export function generatedTablesFor(seed, opts = {}) {
  const gen = generatedTables(String(seed), opts);
  const spaces = dressGenerated(gen.spaces);
  return {
    spaces,
    portals: gen.portals,
    panels: gen.panels,
    spawn: gen.spawn,
    patrol: generatedPatrol(spaces),
  };
}

export function spaceById(id) { return SPACES.find((s) => s.id === id) ?? null; }

/** AABB test against the clear extents, expanded by `pad`. Null in a doorway is normal. */
export function spaceAtXZ(x, z, pad = 0.6) {
  for (const s of SPACES) {
    if (x >= s.x0 - pad && x <= s.x1 + pad && z >= s.z0 - pad && z <= s.z1 + pad) return s;
  }
  return null;
}

export function anchorVec(name) {
  const a = ANCHORS[name];
  if (!a) return null;
  return new THREE.Vector3(a[0], 0, a[1]);
}

/** Does another space abut `s` across the wall on `side`? Decides skin thickness. */
export function abuts(s, side) {
  for (const t of SPACES) {
    if (t === s) continue;
    if (side === 'zmin' && Math.abs(t.z1 + WALL_T - s.z0) < 1e-6 && overlaps(t.x0, t.x1, s.x0, s.x1)) return true;
    if (side === 'zmax' && Math.abs(t.z0 - WALL_T - s.z1) < 1e-6 && overlaps(t.x0, t.x1, s.x0, s.x1)) return true;
    if (side === 'xmin' && Math.abs(t.x1 + WALL_T - s.x0) < 1e-6 && overlaps(t.z0, t.z1, s.z0, s.z1)) return true;
    if (side === 'xmax' && Math.abs(t.x0 - WALL_T - s.x1) < 1e-6 && overlaps(t.z0, t.z1, s.z0, s.z1)) return true;
  }
  return false;
}

function overlaps(a0, a1, b0, b1) { return Math.min(a1, b1) - Math.max(a0, b0) > 1e-6; }
