import { STAGE_DEFS } from '../destruction/wall.js';
import { seedRand } from './run.js';
import { WALL_T, GEN } from './spaces.js';
import { CELL } from '../destruction/damagefield.js';

/**
 * DIGGING — a shared wall segmented into panels, a depth falloff, and the brick barrier.
 *
 * `docs/design/dig.md`, John 2026-08-04: *"instead beneath the walls there is a secret pathway
 * into the next room... each robot has to destroy the walls 'dig' into the other rooms. They can
 * destroy big chunks initially but it becomes less and less over time and then where the rooms
 * interconnect there is a solid visible barrier that robots can't enter."*
 *
 * ⚠️ **EVERYTHING IN THIS FILE IS BEHIND `?dig=1` AND DEFAULT OFF.** `room.js` is the only
 * importer and it reads the flag once; with the flag off not one row here reaches the build, no
 * barrier geometry is emitted, no brick is baked and `room.panels` is byte-for-byte the shipped
 * list. `mechanics.mjs` 11/11 and `scenarios/escape.mjs` 20/20 are the project's contract and a
 * prototype mode may not put them at risk.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ THE IDS ARE A NETWORK PROTOCOL SURFACE AND THEY ARE **DERIVED FROM `DIG_EDGES`**
 * ---------------------------------------------------------------------------
 * `WallField.add(id)` / `DestructibleWall.syncStage()` key on the id string, exactly as they do
 * for `PANELS`. These ids are generated — `d.<edge>.<index>.<side>` — which is safe only while
 * the generation is a pure function of an AUTHORED table, which it is: `DIG_EDGES` below plus
 * `SEG_W`. **Changing `SEG_W`, a span, or the order of `DIG_EDGES` RENUMBERS EVERY SEGMENT ON
 * THAT EDGE.** Appending a new edge is safe. Nothing else is.
 *
 * ✅ **AND `PANELS` ITSELF IS NOT TOUCHED, WHICH IS WHY NO SEED MOVES.** `run.js`'s `chooseExit()`
 * derives the live exit from `EXIT_SITES` — `PANELS.filter(isExitSite)` — so a table that is
 * neither inserted into `PANELS` nor an exit site cannot re-roll a seed. Every seed quoted in
 * every document still means what it said. That was worth the separate table on its own.
 *
 * ---------------------------------------------------------------------------
 * WHY A SEGMENT BOTTOMS OUT AT `barrier` AND NOT AT `open`
 * ---------------------------------------------------------------------------
 * `dig.md` §5: *"ordinary wall segment -> `barrier`: visible, impassable, undamageable — you dug
 * all the way and this is not the way through. The interconnect -> `open`: the one place the wall
 * bottoms out into a passage."*
 *
 * That is not decoration, it is what makes the mechanic safe:
 *
 *   · `room.js` `breachPortals()` adds a graph edge for any panel with `!blocksMovement()`. If a
 *     dig segment terminated at `open` the BFS would hand the AI a route straight through a wall
 *     that still has a solid brick slab in it, and the hunter would press into masonry for the
 *     rest of the round. That failure does not throw and does not look like a data bug — it
 *     looks like the AI forgot what it was doing, which is this project's most expensive class.
 *   · It is half of the "you cannot meet in the middle" proof. See `DIG_DEFS`.
 */

// ---------------------------------------------------------------------------
// The depth falloff
// ---------------------------------------------------------------------------

/**
 * THE DEPTH FALLOFF — **`STAGE_DEFS` TUNED, NOT A SECOND SYSTEM.**
 *
 * `dig.md` §5, John clarifying: *"I mean that as you get closer to the barrier it takes less and
 * less until you can only see the barrier."* So the falloff is SPATIAL, through the thickness of
 * the wall, and the existing stage table is already the wall's layers going inward — wallpaper,
 * plaster, lath, beam. Only `health` moves here; every flag is copied from `STAGE_DEFS` rather
 * than restated, exactly as `EXIT_DEFS` does, so a change to the wall machine cannot be true of
 * an ordinary panel and false of a dig segment.
 *
 * ⚠️ **WHAT THE PLAYER ACTUALLY READS IS `damage / stageHealth`, AND THAT IS WHY THIS WORKS.**
 * `DestructibleWall._apply()` drives the break mask from `1 - stageHealth / def.health`, so the
 * lip advances by exactly one hit's FRACTION of the current stage. Rising healths therefore make
 * each hit remove visibly less material the deeper you get — the falloff is the feedback and the
 * feedback is the falloff, which is `dig.md` §5's whole claim ("the feedback and the puzzle are
 * the same channel"). No HUD number, per §6a.2.
 *
 *     stage      hp    nail-gun rounds   ONE ROUND REMOVES     seconds at 196 dps
 *     wallpaper   50         2               52.0% of it            0.26
 *     plaster    140         6               18.6%                  0.71
 *     lath       330        13                7.9%                  1.68
 *     beam       850        33                3.1%                  4.33
 *     ------------------------------------------------------------------------
 *     to barrier 1370       53                                      6.99
 *
 * ⚠️ Those seconds are ARITHMETIC (`WEAPON_DAMAGE.nailgun` 26 / `WEAPON_COOLDOWN` 0.13 s = 200
 * dps nominal, 196 measured by `eo2-siege.mjs`). The MEASURED figures are in the report and in
 * `harness/scenarios/dig-feel.mjs`; do not quote this table as a measurement.
 *
 * For scale: an ordinary `BREACHABLE` panel is 255 hp / ~1.3 s and must stay that way (breaching
 * between two rooms is a traversal verb), and the live EXIT is 4900 hp / ~24 s. A dud dig sits
 * between them on purpose — `docs/PLAN.md` Phase 2's whole point is that **an expensive dud
 * finally exists**.
 */
const DIG_HEALTH = [50, 140, 330, 850];

/**
 * ⚠️ **THE TERMINAL STATE, AND IT IS WHY YOU CANNOT MEET IN THE MIDDLE.**
 *
 * `blocksMove: true, damageable: false` — `WallState.applyDamage` early-outs on `!damageable`
 * AND on `isOpen` (`stage >= FINAL_STAGE`, and this stage IS `FINAL_STAGE`), so a segment that
 * has bottomed out is refused twice over, from either side, by two independent tests.
 *
 * `blocksShots: true` for `CHAINED_DEFS`' reason: a shot still STOPS here and still throws chips,
 * which is the difference between "this is solid" and "this gun is broken".
 *
 * `blocksSight: true` is also what is physically there — the brick slab `room.js` emits behind
 * the segment is an ordinary collider, and `room.blocksSight()` tests colliders unconditionally,
 * so the slab would block the line anyway. The flag agrees with the geometry rather than
 * contradicting it.
 *
 * ⚠️ `health` is a large FINITE number, not Infinity, for `CHAINED_DEFS`' reason: `_apply()`
 * computes `1 - stageHealth / def.health` and `Infinity/Infinity` is `NaN`, which would silently
 * feed NaN into the break uniform.
 */
export const BARRIER_STAGE = STAGE_DEFS.length - 1;      // 4, the same FINAL_STAGE as everything

/** The four finish stages, shared by BOTH dig tables. Only the terminal row differs. */
const DIG_FINISH = STAGE_DEFS.slice(0, 4).map((d, i) => ({ ...d, health: DIG_HEALTH[i] }));

export const DIG_DEFS = [
  ...DIG_FINISH,
  {
    stage: BARRIER_STAGE, name: 'barrier', health: 999999,
    blocksMove: true, blocksShots: true, blocksSight: true, climbable: false, damageable: false,
  },
];

/**
 * 🕳️ **THE INTERCONNECT'S TABLE — AND IT IS ALSO THE UNLOCKED HOUSE'S TABLE.**
 *
 * `dig.md` §5's own table has exactly two rows: an ordinary segment terminates at `barrier`, the
 * interconnect at `open`. So the difference between "the one way through" and "every other bay"
 * is **one row of one table**, and John's unlock sentence — *"once the interconnect is accessed
 * by a player the whole robot barrier turns off and players can continue digging into the other
 * rooms"* — is then literally *"every segment becomes an interconnect"*, i.e. one assignment.
 * That is why this is `DIG_OPEN_DEFS` and not `LINK_DEFS`: it is used for both, and the two can
 * never drift apart because there is only one of them.
 *
 * ⚠️ **THE FIRST FOUR ROWS ARE THE SAME OBJECTS, NOT COPIES.** Same healths, same flags, same
 * `blocksSight: false` at beam. So while a segment is still being dug it is **indistinguishable
 * from every other segment by every observable the game has**: the same seconds per stage, the
 * same chunk size, the same sound, the same dressing population (see `exterior.js`). The ONLY
 * thing that differs is what you find at the bottom — which is `procedural-map.md` §2's rule
 * ("a closed connector must give NOTHING away") applied to a wall instead of to a door, and
 * `dig.md` §5's *"at the final stage you see through the studs and learn what you bought"*.
 *
 * ⚠️ **`STAGE_DEFS[4]` REUSED RATHER THAN RESTATED**, for `EXIT_DEFS`' reason: a change to what
 * "open" means in the wall machine cannot be true of a breach and false of an interconnect.
 */
export const DIG_OPEN_DEFS = [...DIG_FINISH, STAGE_DEFS[BARRIER_STAGE]];

/** Total damage from pristine to the terminal row. Exported so a probe cannot re-derive it wrongly. */
export const DIG_TOTAL_HP = DIG_HEALTH.reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------
// The edges
// ---------------------------------------------------------------------------

/**
 * The aperture every segment is authored at. ONE size, on purpose: `wallinstances.js` groups by
 * `width x height x thickness` and builds one `InstancedMesh` PAIR per authored aperture, so a
 * single size means the whole dig table costs **2 meshes**, whether it holds nine segments or
 * ninety. A second size would double that for no gameplay reason.
 *
 * ⚠️ `SEG_T` IS 0.075, NOT `WALL_T`. The 0.30 m band between two rooms is
 * `[a's 0.075 of finish][0.15 of BRICK][b's 0.075 of finish]` — see `barrierSlabs()`. The panel's
 * reveal box runs exactly `thickness` back from its face, so 0.075 lands the back of the reveal
 * flush on the brick and the hole you dig is lined right down to the masonry.
 */
export const SEG_W = 1.14;
/**
 * 🕳️ **THE SEGMENT IS A LOW BAY, NOT A FULL-HEIGHT SLOT — AND THAT ONE NUMBER IS A MECHANIC.**
 *
 * It was `CONNECTOR_H` (2.68), i.e. the same clear height as a door. `dig-1`'s own note called
 * that *"a narrow bay, not the reference's big chunk"*, and John's sentence is not "through the
 * walls", it is *"**beneath** the walls there is a secret pathway into the next room"*.
 *
 * ⚠️ **THERE IS NO VERTICAL AXIS** (`Player.update` ends `this.pos.y = this.world.floorY`
 * unconditionally), so "beneath" cannot be a crawl-down — `dig.md` §5 already settled that. But a
 * gap whose lintel is BELOW THE HUNTER'S SHOULDER is a passage on the floor plane that a robot
 * fits through and the thing hunting it does not, and that is **D7's refuge mechanic expressed as
 * a number in a table** — `connectors.js`'s own words about D7's 1.20 m — reappearing for free.
 *
 * The number: a player robot is **1.70 m** (`Player.height`). A hunter is `1.7 x scale` =
 * **2.295 / 3.23 / 4.42 m** at stages 1/2/3. 1.80 clears the robot by 0.10 m and is under the
 * smallest hunter by 0.50 m. `rules.js` `PASS_H` is where the two numbers live and
 * `room.js` `boxesNear` is where they are enforced; `harness/scenarios/dig-low.mjs` measures a
 * body of each kind driven at a dug segment rather than asserting the arithmetic.
 *
 * ⚠️ **AND IT IS THE WHOLE DIG BAND, NOT A LOW HALF WITH A HIGH HALF ABOVE IT.** The obvious
 * version sub-divides each column into a low slot and a high one — `dig-1`'s note prices it at
 * "one more aperture group". It is worse: the interconnect has to be low (John's sentence), so
 * after one run every player knows the high row is a dud, and 36 extra panels buy nothing but
 * duds nobody will ever dig. Making the WHOLE dig band low says the same thing in half the
 * panels: **the dig network is robot-scale, everywhere, and the hunter must make its own hole.**
 *
 * ⚠️ Consequence, stated rather than hidden: `buildWall` emits a lintel box AND a collider for
 * the 3.00 m of wall above every segment, on both faces of both edges. That is real geometry in
 * the merged `wall` bin — it costs no draw call (same bucket) but it is what makes the exclusion
 * physical rather than a flag, and it is what the hunter has to tear out to cross (see
 * `room.hunterBreach`).
 */
export const SEG_H = 1.80;
export const SEG_CY = SEG_H / 2;       // 0.90 — sill on the floor, lintel at 1.80
export const SEG_T = 0.075;

/** Half the wall band. The brick occupies the middle `WALL_T - 2 * SEG_T` = 0.15 m. */
const HALF_BAND = WALL_T / 2;          // 0.15

/**
 * A SHARED EDGE, AND THE BARRIER IS MODELLED ONCE PER ROW HERE — `dig.md` §5's *"model it once
 * per shared edge, not twice"*.
 *
 * ⚠️ AND IT IS MODELLED AS **GEOMETRY WITH NO STATE AT ALL**, which is the strong form of that
 * rule. There is no barrier `WallState`, no barrier id, no barrier row on the wire and nothing
 * for two clients to disagree about: the brick is a static collider and a static mesh, emitted at
 * build time, that no code path anywhere can remove. Two barriers "kept in agreement" is the
 * desync the brief warns about; zero barrier state cannot desync.
 *
 *   at        the coordinate of the band CENTRE on the wall's normal axis
 *   normal    which axis the wall's normal runs along
 *   a         the space on the GREATER side of `at` · b the space on the lesser side
 *   spans     [lo, hi] runs along the wall, in world coordinates, that get segmented.
 *
 * ⚠️ **THE SPANS DELIBERATELY AVOID THE EXISTING CONNECTORS ON THESE WALLS.** `p.svc_w.n` sat at
 * z -20.00 and `p.svc_w.s` at z -12.20, each 2.08 m wide. Segmenting over them would put a brick
 * slab behind a shipped `BREACHABLE` route and silently delete it — the panel would open onto
 * masonry. So the spans are the three gaps between them, and the two original panels keep
 * working exactly as they do today. A house designed for digging from the start would not have
 * this problem; retrofitting one that was not is what the half-slice is.
 *
 * 🚪 **AND SINCE 2026-08-10 THE THING THEY DODGE IS NOT THERE — THE GAPS ARE INHERITED, NOT
 * REQUIRED.** John had the four `p.svc_*` rows switched off (`spaces.js` `PASSAGE_DOORS`,
 * restorable with `?doors=1`), so `svc_w` and `svc_e` are 15.40 m of uninterrupted wall carrying
 * three spans and 4.16 m of undiggable gap for a reason that no longer exists.
 * ⚠️ **THEY ARE LEFT AS THEY ARE AND THAT IS A DECISION, NOT AN OVERSIGHT.** Merging them is the
 * edit the rule at the top of this file forbids: it RENUMBERS `f.svc_w.*` / `d.svc_w.*`, which is
 * a network protocol surface, and it moves the dig band and the interconnect draw on every seed
 * recorded in `docs/handoff/dig.md`. **Under `?doors=1` the dodge is still load-bearing**, so the
 * table is also the only shape that is correct on both arms. `?slab=1` is what merging them looks
 * like, priced — see `SLAB` below.
 *
 * WHY THESE TWO EDGES. Both flank the SERVICE PASSAGE, and `service.mid` is the worst parked
 * station in the house (`eo2-calls.mjs`) — so the segmentation is measured where the draw-call
 * budget is tightest, with both segmented walls on screen at once, rather than somewhere
 * flattering.
 */
export const DIG_EDGES = [
  {
    id: 'svc_w', normal: 'x', at: -1.85, a: 'service', b: 'study_w',
    spans: [[-24.00, -21.04], [-18.96, -13.24], [-11.16, -8.60]],
  },
  {
    id: 'svc_e', normal: 'x', at: 1.85, a: 'study_e', b: 'service',
    spans: [[-24.00, -21.04], [-18.96, -13.24], [-11.16, -8.60]],
  },

  // =========================================================================================
  // 🏛️ APPENDED 2026-08-09 (`digcover-1`) — THE DIG NOW REACHES THE ROOMS JOHN'S ART IS IN.
  // =========================================================================================
  /**
   * 🚨 **THE GAP THIS CLOSES.** `digband-1` measured the band in the ported house and found the
   * two edges above cover `study_w`, `service` and `study_e` and nothing else: **`gallery` 0
   * diggable faces, `ballroom` 0, `chapel` 0.** Two of those three are the ported estate rooms,
   * and John's reason for porting them was *"I just want the game to progress from the assets we
   * made for the 3 rooms we had in the art."* The dig is the game's only verb and it did not work
   * in the rooms he asked for — he could walk through his art and not dig in it.
   *
   * ⚠️ **APPENDED, NEVER INSERTED, AND THE TWO ROWS ABOVE ARE UNTOUCHED.** The ids are generated
   * `f.<edge>.<span>.<side>` / `d.<edge>.<seg>.<side>` as a pure function of this table plus
   * `SEG_W`, so `svc_w`/`svc_e`'s numbering is unchanged, every recorded seed still means what it
   * said, and `PANELS` is still not touched at all (no row here is an exit site, so
   * `chooseExit()` cannot see them).
   *
   * ---------------------------------------------------------------------------------------
   * 🎯 **WHICH WALLS, AND WHY THOSE — A HOLE HAS TO LEAD SOMEWHERE**
   * ---------------------------------------------------------------------------------------
   *   `gal_svc`     gallery <-> service. **The highest route value in the house: there is no
   *                 other connection at all.** John removed D2 (2026-08-08, "remove all the door
   *                 structures in the gallery except the one that leads into the spawn point")
   *                 and `spaces.js` records the cost in as many words — *"`service` loses its
   *                 only direct link to the gallery... it IS a real loss of a route"*. It also
   *                 records why no breachable PANEL was put back: a panel is one more hole to
   *                 count. A continuous dig face is the opposite of a hole to count — it is
   *                 3.40 m of ordinary wall with the answer somewhere inside it, which is
   *                 exactly what `dig.md` §1 asks for. The route comes back as a dig.
   *   `gal_east`    gallery <-> study_e. The gallery's ONLY long stretch of shared wall (8.96 m
   *                 clear of `p.gal_e`), and the reason the gallery can hold a band at all — see
   *                 the arithmetic below. `p.gal_e` already links these two, so this is a second
   *                 way rather than the only one; it is here for LENGTH.
   *   `gal_chapel`  gallery <-> chapel. The chapel's only shared wall with anything, so it is
   *                 this or the chapel stays barren.
   *   `bal_west` / `bal_east`   ballroom <-> the two studies. The ballroom's only interior walls
   *                 are its zmin end wall against `study_w` / `service` / `study_e`, and the
   *                 service stretch (3.40 m) is entirely consumed by D5. So these two are the
   *                 whole of what the ballroom can ever have.
   *
   * ⚠️ **`gallery <-> study_w` WAS AVAILABLE AND IS DELIBERATELY NOT TAKEN.** Those two rooms
   * already share D1 (an open doorway) and `p.gal_w`. A third route to the same place is not a
   * route, and — see below — it would cost the gallery's own search more than it buys.
   *
   * ---------------------------------------------------------------------------------------
   * 📐 **HOW MUCH WALL — AND THE COUNTER-INTUITIVE PART IS THAT ADDING AN EDGE MAKES A ROOM
   * *FASTER*, NOT SLOWER**
   * ---------------------------------------------------------------------------------------
   * `digband-1`'s model: a probe costs ~6.2 blows everywhere, FIND is `expected duds x 6.2` with
   * `duds = (N - K) / (K + 1)`, and THROUGH is a near-constant ~43 blows. `N` is probe spots
   * (`round(span / 1.5)` per face) and **`K` is winners — and `chooseFreeInterconnect` puts
   * exactly ONE region on EVERY edge.** So an extra edge adds ~1.3 to K and only ~2 to N, and the
   * `K + 1` denominator eats the gain: the way to keep a room slow is FEW edges each carrying
   * LOTS of wall, which is why the gallery gets one 5.72 m face rather than four short ones and
   * why `study_w` does not get a fourth edge it has no use for.
   *
   * That is also the honest reason the gallery lands at the fast end of John's band and the
   * studies at the slow end: **a hub with three ways out is quicker to dig out of than a den with
   * one, and it should be.**
   *
   * ⚠️ **EVERY SPAN LENGTH HERE IS ONE OF THE THREE THIS TABLE ALREADY AUTHORS — 2.56 / 2.96 /
   * 5.72 — AND THAT IS A DRAW-CALL CONSTRAINT, NOT A COINCIDENCE.** `wallinstances.js` groups by
   * `width x height x thickness`, so a free face's aperture group IS its span length; a fourth
   * length would be a fourth group (two more `InstancedMesh`es) and `dig-toggle.mjs` gates the
   * free arm at **+3 groups** with its own note: *"add a fourth edge with the same spans and it
   * stays at three."* Eight new spans therefore cost **zero** new aperture groups and zero new
   * draw calls; they are extra instances in meshes the build already had.
   *
   * ⚠️ **AND EVERY SPAN CLEARS EVERY SHIPPED CONNECTOR ON ITS WALL BY >= 0.20 m**, for the reason
   * the `svc_w`/`svc_e` note gives above: a span over a shipped `BREACHABLE` route would (on
   * `?dig=bays`) put a brick slab behind it and silently delete the route. The clearances are in
   * the per-row comments; they were worked out from `spaces.js`, not guessed.
   *
   * ---------------------------------------------------------------------------------------
   * ⚠️ **WHAT I COULD NOT DODGE: THE PORTED ORDER DRESSES THE SAME 0–2.80 m THE DIG BAND USES**
   * ---------------------------------------------------------------------------------------
   * `gallery-order.js` puts fluted pilasters on both long walls at a 3.022 m pitch (world x
   * +/-1.511, +/-4.533, +/-7.556, +/-10.578, +/-13.60; each 0.50 wide, 0.13 proud) and portraits
   * at a 2.9 m pitch (world x 11.0, 8.1, 5.2, 2.3, -0.6, -3.5, each 0.98–1.33 wide, centred
   * ~2.0 m up). **Portrait pitch minus portrait width leaves 1.7–1.9 m gaps, so NO span of any
   * authored length fits between two portraits.** A gallery dig face therefore always has a
   * painting hanging over part of it. This is reported rather than designed around, and it is
   * pre-existing in kind: the pilaster at x -7.556 already clips D1's jamb on the shipped build.
   * See `docs/handoff/dig.md` for the pictures.
   */
  {
    /**
     * 3.40 m of wall, one 2.56 m span centred on it. The gallery's pilasters at x +/-1.511 span
     * +/-[1.261, 1.761], so the span's two ends run 19 mm BEHIND the piers — the bay between two
     * pilasters is the dig face and the piers cover its edges. Clear of the transverse arch
     * pilaster at x -2.12 (0.45 m) and of the room boundary at x +/-1.70 (0.42 m).
     */
    id: 'gal_svc', normal: 'z', at: -24.15, a: 'service', b: 'gallery',
    spans: [[-1.28, 1.28]],
  },
  {
    /**
     * The gallery's one long run: x 2.00 (the study_e/service corner) to 10.96 (`p.gal_e`'s west
     * jamb) is 8.96 m. A 5.72 and a 2.56 with 0.20 / 0.28 / 0.20 m of ordinary wall at the two
     * ends and between them. **The 5.72 is what keeps the gallery in band** — it is 4 probe spots
     * against a 2.56's 2, and it is 51% likely to be the face carrying the region (the pick is
     * span-length weighted, see `chooseFreeInterconnect`).
     */
    id: 'gal_east', normal: 'z', at: -24.15, a: 'study_e', b: 'gallery',
    spans: [[2.20, 7.92], [8.20, 10.76]],
  },
  {
    /**
     * ⚠️ **THE CHAPEL CANNOT HOLD JOHN'S MINUTE AND THAT IS THE FLOOR PLAN, NOT A KNOB.** It is a
     * 6.80 m spur with exactly one shared wall, and `p.chapel` (x 4.56–6.64) eats 2.08 m of it,
     * leaving 4.36 m — against the ~11 m a study needs for a 60 s band. 2.96 m is the largest
     * authored span that fits, centred with 0.70 m of ordinary wall each side. Measured, not
     * predicted, in `docs/handoff/dig.md`; it comes in under the 45 s floor and the reason is
     * arithmetic. **A fast way out of the deepest dead end in the house is a mercy rather than a
     * defect** — the chapel is the room with two exit sites, one entrance and nowhere to run.
     */
    id: 'gal_chapel', normal: 'z', at: -31.15, a: 'gallery', b: 'chapel',
    spans: [[7.34, 10.30]],
  },
  {
    /**
     * The ballroom's end wall, west half. D4 (x -9.55..-7.65) and `p.bal_w` (-4.64..-2.56) split
     * it into 4.05 m and 3.01 m of clear wall; a 2.96 and a 2.56 centred in them, 0.55 / 0.23 m
     * margins. ⚠️ The dig EDGE `bal_west` is not the shipped connector `p.bal_w` — different
     * things, 5.5 m apart, and the panel ids never collide (`f.bal_west.*` against `p.bal_w`).
     */
    id: 'bal_west', normal: 'z', at: -8.45, a: 'ballroom', b: 'study_w',
    spans: [[-13.06, -10.10], [-7.43, -4.87]],
  },
  {
    /**
     * The east half, split by D6 (x 7.65..9.55) into 5.65 m and 4.05 m. 5.72 does not fit in
     * 5.65 — 70 mm short — so both spans are 2.96, centred, 1.35 / 0.55 m margins.
     *
     * 🚨 **THIS IS THE ROW THAT MAKES `DIG_H` 2.80 REAL: the ballroom is a 9.60 m storey and
     * every space that could be dug before it was 4.80.** `digband-1` called the question moot
     * and was right that it was — the 2.80 band is now **29% of the wall height** instead of
     * 58%. It is NOT changed here: raising `DIG_H` is a fill-rate cost this file already
     * documents as a perf decision, and it is a decision to name rather than a number to bump.
     * The verdict from looking at it is in `docs/handoff/dig.md`.
     */
    id: 'bal_east', normal: 'z', at: -8.45, a: 'ballroom', b: 'study_e',
    spans: [[3.34, 6.30], [10.10, 13.06]],
  },
];

// ---------------------------------------------------------------------------
// 🧱 THE SLAB SPIKE — `?slab=1`. ONE FACE PER WALL PER ROOM, NOT ONE PER SPAN.
// ---------------------------------------------------------------------------

/**
 * 🚨 **A SPIKE, BEHIND A FLAG, DEFAULT OFF. `?slab=0` (the default) IS THE AUTHORED TABLE, THE
 * SAME ARRAY OBJECT, UNTOUCHED.** John, 2026-08-10: *"I want to test if we can make one single
 * wall instead of the current wall tiles, because when we build the procedural map rooms I want
 * each entire wall to be one single destructive wall without any seams… so if we can, for a test,
 * let's make the service passage on the test slice one single piece wall on each side."*
 *
 * ⚠️ **THE FINDING THAT DECIDED THE GEOMETRY, AND IT IS THE FIRST THING A READER NEEDS.** The
 * three authored spans on `svc_w` are not separated by design margins — they were separated by the
 * two shipped `BREACHABLE` connectors, `p.svc_w.n` at z −20.00 and `p.svc_w.s` at z −12.20, each
 * 2.08 m wide. **So there was no contiguous run of this wall longer than 5.72 m that did not
 * contain a door**, and "one slab per wall" on the shipped floor plan was only reachable by
 * swallowing them.
 *
 * 🚪 **THAT HALF OF THE SPIKE IS SPENT: JOHN REMOVED THE DOORS ON 2026-08-10** (*"remove all the
 * blocker doors from the hallway"* — `spaces.js` `PASSAGE_DOORS`, restorable with `?doors=1`). The
 * service passage's two walls are now **15.40 m of genuinely contiguous, aperture-free wall on the
 * DEFAULT arm**, so step 2 below is a no-op the flag inherits and **`?slab=1` is a change to this
 * file and nothing else.** The slab is no longer a workaround for a floor plan it disagreed with;
 * it is one span table against another on the same wall.
 *
 * 🚨 **WHAT IS *NOT* CLOSED, AND CONFLATING THE TWO WOULD BE THE EXPENSIVE MISTAKE.** "This wall
 * has no door in it" is not "a slab can contain a door". `genspike-1`'s packing emits shared walls
 * at a mean of **13.82 m**, p95 34.80, max 85.90 — and doors go in them. **A slab must still be
 * able to CONTAIN an aperture, or the generator must emit one slab per contiguous run.** Nothing
 * in this round taught `freePanels()`/`DamageField` to punch a hole in a face, so the rollout
 * blocker is exactly where `slab-1` left it. What HAS changed is that it is no longer blocking the
 * SPIKE: the spike can now be judged on this wall on its own merits.
 *
 * The slab arm therefore does exactly two things, and both are reverted by dropping the flag:
 *   1. `svc_w` / `svc_e` become ONE span each, the whole wall: z −24.00 … −8.60, **15.40 m**.
 *   2. the four `p.svc_*` rows are out of `PANELS` — which, since 2026-08-10, they already are on
 *      the default arm, so this term is inert unless someone passes `?doors=1` (`spaces.js`
 *      refuses that combination). They are `BREACHABLE`, never `EXIT`, so `EXIT_SITES` is
 *      `Object.is`-identical and `chooseExit()` cannot see the difference — **no recorded seed
 *      moves on either arm.**
 *
 * ⚠️ **BUT THE PANEL IDS DO MOVE ON THIS ARM AND THEY ARE A NETWORK PROTOCOL SURFACE.** The rule
 * at the top of this file — *"changing `SEG_W`, a span, or the order of `DIG_EDGES` RENUMBERS
 * EVERY SEGMENT ON THAT EDGE"* — is exactly what this does, and a slab is worse than a renumber:
 * `f.svc_w.0.a` still exists and now means a **15.40 m** face where it used to mean a 2.96 m one,
 * while `f.svc_w.1.*` and `f.svc_w.2.*` cease to exist. Two clients on different arms would agree
 * on the id and disagree on the wall. **The arm must therefore be part of the session handshake
 * exactly as `house-packing.md` §9.2 requires of a generated plan** — it is the same hazard, and
 * a slab rollout is the moment it stops being hypothetical.
 */
const SLAB_EDGE_IDS = new Set(['svc_w', 'svc_e']);

/**
 * The whole service-passage wall, end to end, on both sides. Authored rather than derived from
 * `min(lo) … max(hi)` so the number is a stated decision and not an accident of the span table:
 * the service passage runs z −24.00 to −8.60 and the slab is all of it.
 */
const SLAB_SPAN = [-24.00, -8.60];

/** Read once, guarded for node — every harness scenario imports this file outside a browser. */
function _urlFlag(name) {
  if (typeof location === 'undefined') return false;
  const v = new URLSearchParams(location.search).get(name);
  return v === '1' || v === 'on' || v === 'true';
}

export const SLAB = _urlFlag('slab');

// ---------------------------------------------------------------------------
// 🚪 THE APERTURE — A SLAB CONTAINS A DOORWAY
// ---------------------------------------------------------------------------

/**
 * 🚪 **THE SLAB HAS A HOLE AND A DOOR SITS IN THE HOLE. THIS TABLE IS THE HOLE.**
 *
 * John, 2026-08-11: *"lets aperture the doorways into the slab and be able to do it in a known
 * location."* Both spikes named the same blocker in the same words — `slab-1`: *"a slab must be
 * able to CONTAIN an aperture, or the generator must emit one slab per contiguous run"*;
 * `doors-1`: *"'this wall has no door in it' is not 'a slab can contain a door'."* `maptool-2`
 * measured what it costs: **63.4% of diggable runs are split by a door.**
 *
 * 🎯 **THE INTERFACE, AND IT IS THE ONE A GENERATOR CALLS.** An edge may carry `doorways`, and a
 * doorway is stated the way a floor plan states one — **an offset ALONG the wall, a clear width
 * and a clear height** — not as a panel, not as a cell range and not as anything the run can
 * move:
 *
 *   at    the doorway's CENTRE, in world coordinates on the axis `spans` is stated in. The same
 *         number `spaces.js` writes in a connector's `x`/`z`, so a generator emitting a boundary
 *         and a doorway emits ONE coordinate and both consumers read it.
 *   w     clear width, metres.
 *   h     clear height above the floor, metres. Above `DIG_H` the dig band simply ends — the
 *         masonry over the band is `room.js`'s lintel and was never part of this field.
 *   sill  height of the sill above the floor, metres. 0 is a doorway; a positive value is a
 *         WINDOW, and it costs nothing because the aperture is a rectangle either way.
 *   id    optional, and it is documentation: the connector that stands in this hole, so a reader
 *         can check the two tables agree without measuring.
 *
 * ⚠️ **THE APERTURE IS GEOMETRY AND GRID. THE DOOR'S STATE IS NOT HERE AND MUST NEVER BE.**
 * Whether the thing in the hole is open, breachable, chained or absent is `spaces.js`'s business
 * and stays exactly where it lives today. A hole in a wall does not know what is standing in it —
 * which is also why `sill` generalises this to a window for free.
 *
 * 🚪 **AND THE TWO ROWS BELOW ARE `p.svc_w.n` / `p.svc_w.s` AND THEIR `svc_e` MIRRORS, TO THE
 * CENTIMETRE.** `spaces.js` puts them at z −20.00 and −12.20, `connectors.js` sizes a
 * `BREACHABLE` at 2.08 × 2.68, and those are the numbers here — so the hole this table punches is
 * the hole those four panels want, and turning them back on drops a door into it rather than
 * beside it. **That is what "a known location" means: stated, not discovered.**
 */
export const SLAB_DOORWAYS = {
  svc_w: [
    { id: 'p.svc_w.n', at: -20.00, w: 2.08, h: 2.68, sill: 0 },
    { id: 'p.svc_w.s', at: -12.20, w: 2.08, h: 2.68, sill: 0 },
  ],
  svc_e: [
    { id: 'p.svc_e.n', at: -20.00, w: 2.08, h: 2.68, sill: 0 },
    { id: 'p.svc_e.s', at: -12.20, w: 2.08, h: 2.68, sill: 0 },
  ],
};

/**
 * 🚪 **`?slab=1&doors=1` — THE FREE A/B, AND IT IS THE SAME WALL TWICE.**
 *
 * `?slab=1` alone is still exactly what `slab-1` measured: one 15.40 m aperture-free face per
 * side. Add `&doors=1` and that same face has to CONTAIN the two doorways `doors-1` removed. One
 * flag apart, one wall, one session — which is the only shape of A/B this project accepts.
 *
 * ⚠️ **`spaces.js` STILL REFUSES TO PUT THE FOUR `p.svc_*` PANELS BACK ON THE SLAB ARM**
 * (`PASSAGE_DOORS_ON = DOORS_URL && !SLAB_ARM`), and that file belongs to `doorlook-1`. So on
 * this arm the doorways are **OPEN doorways — holes with nothing standing in them**, which is
 * precisely what D1/D4/D5/D6 already are and precisely the half this slice owns. Report, not
 * workaround: dropping `&& !SLAB_ARM` is what puts the door object in the hole, and the hole is
 * already the right hole.
 */
export const SLAB_DOORS = SLAB && _urlFlag('doors');

/**
 * The slab arm's table. Built once, from `DIG_EDGES`, so the five `digcover-1` edges and every
 * other row travel through untouched — the spike is two rows wide by construction.
 */
/**
 * ⚠️ **A FUNCTION AS WELL AS A CONSTANT, SO A PROBE DRIVES THE BUILD AND NOT THE URL.** A node
 * harness has no `location`, so `SLAB`/`SLAB_DOORS` are both false there and an instrument that
 * wanted the slab arm would otherwise have to retype the span and the doorway table — which is
 * the "two tables of authored data" failure `dig-toggle.mjs` was fixed for.
 */
export function slabEdges(withDoors = SLAB_DOORS) {
  return DIG_EDGES.map((e) => (
    SLAB_EDGE_IDS.has(e.id)
      ? { ...e, spans: [[...SLAB_SPAN]], doorways: withDoors ? SLAB_DOORWAYS[e.id] : undefined }
      : e
  ));
}

export const SLAB_EDGES = slabEdges();

/**
 * ⚠️ **FACE-LOCAL `u` FOR A POINT ON THE WALL, DERIVED FROM THE SAME `rotY` `digPanels()` AND
 * `freePanels()` DERIVE — NEVER FROM A SECOND RULE OF THUMB.**
 *
 * The two faces of one band run in OPPOSITE directions, and which one is reversed depends on the
 * edge's normal as well as on the side: an `x`-normal edge reverses on `a`, a `z`-normal edge
 * reverses on `b`. Writing that down as a boolean is how a mirrored aperture ends up 15 m from
 * its own door on one face and nothing throws. So this reproduces `wall.js` `uvAt()`'s own
 * `lx = cos·dx − sin·dz` from the panel's own `rotY`, and the parity cannot drift from the panel
 * it is describing.
 */
function faceU(e, lo, hi, side, at) {
  const xAxis = e.normal === 'x';
  const sign = side === 'a' ? 1 : -1;
  const rotY = xAxis ? sign * Math.PI / 2 : (sign > 0 ? 0 : Math.PI);
  const d = at - (lo + hi) / 2;                      // metres along the wall from the face centre
  // an x-normal wall runs along z, so `d` is `dz`; a z-normal wall runs along x, so `d` is `dx`
  const lx = xAxis ? -Math.sin(rotY) * d : Math.cos(rotY) * d;
  return lx / (hi - lo) + 0.5;
}

const _clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 🚪 **THE DOORWAYS OF ONE SPAN, AS FACE-LOCAL RECTANGLES ON ONE SIDE.**
 *
 * `{u0, u1, v0, v1}` in the same 0..1 face coordinates `DamageField.setInterconnect()` and
 * `solidRects()` already speak, so the grid, the collider and the shader all read one convention.
 *
 * ⚠️ **A DOORWAY THAT DOES NOT FIT WHOLLY INSIDE THE SPAN IS NOT EMITTED**, and the module-level
 * check at the foot of this file throws on one rather than letting it be dropped in silence —
 * `spaces.js`'s pattern, for `spaces.js`'s reason.
 *
 * @returns {null|{u0:number,u1:number,v0:number,v1:number}[]} null when there are none, so the
 *   default arm carries no field, no key and no branch.
 */
export function apertureRects(e, lo, hi, side) {
  const list = e.doorways;
  if (!list || !list.length) return null;
  const out = [];
  for (const d of list) {
    const a0 = d.at - d.w / 2, a1 = d.at + d.w / 2;
    if (a0 < lo - 1e-6 || a1 > hi + 1e-6) continue;
    const p = faceU(e, lo, hi, side, a0), q = faceU(e, lo, hi, side, a1);
    out.push({
      u0: _clamp01(Math.min(p, q)), u1: _clamp01(Math.max(p, q)),
      v0: _clamp01((d.sill ?? 0) / DIG_H),
      v1: _clamp01((d.h ?? DIG_H) / DIG_H),
    });
  }
  return out.length ? out : null;
}

// ---------------------------------------------------------------------------
// 🏚️ THE GENERATED HOUSE'S DIG TABLE — `?plan=gen&planseed=N`
// ---------------------------------------------------------------------------

/**
 * 🎯 **ONE SLAB PER WALL PER SIDE, AND EVERY DOORWAY IS A HOLE CUT THROUGH IT.** John's call,
 * 2026-08-11, recorded in `docs/agents-resume-2026-08-11.md`: *"a generated wall is ONE slab per
 * side and every doorway is a HOLE CUT THROUGH IT — no seam at a door… a dig runs past a doorway
 * without meeting a joint."* Not to be re-litigated here; this is the wiring of that decision.
 *
 * `task-plangen-1.md` Change 6 deliberately returned `[]` here — slice 1 got the player walking
 * and left the game's only verb out of the generated house. This is that half.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 **IT IS DERIVED FROM `SPACES`/`PORTALS`, NOT FROM `genspike.mjs`'S OWN `edges`, AND THAT IS
 * DELIBERATE.** HANDOFF's rule: *"an instrument that re-derives the thing it measures will agree
 * with it."* The same applies to a producer. `genspike`'s `boundarySegments()` describes the walls
 * the PLAN has; `room.js` builds the walls the `SPACES` TABLE has, and `genplan.js` drops rects
 * between the two (alcoves, slivers, regions whose only bridge could not become a row). A dig
 * table taken from the plan would name walls that no space owns and miss walls that two spaces
 * really do share — the "it opens and the wall is still there" class, one layer down. So this
 * reads the emitted rows, computes the shared CLEAR run as the overlap of two rows' own clear
 * extents, and can only ever name a wall the build really stands up.
 *
 * The wall band is 0.30 m and each row's clear extent is inset 0.15 m from it, so for two rows
 * `A` (greater side) and `B` (lesser) meeting on an x line: `A.x0 - WALL_T === B.x1`, the band
 * centre is their midpoint, and the run is the overlap of their z extents. `freePanels()` puts the
 * `a` face at `at + WALL_T/2` and the `b` face at `at - WALL_T/2`, which is exactly `A.x0` and
 * `B.x1` — the two inner faces — so `room.js` `cutsOnWall`'s `inBand` test cannot miss either.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚪 **THE DOORWAY COMES OFF THE PORTAL ROW, WHICH IS THE ONE THE PLAYER WALKS THROUGH.**
 * `genplan.js` emits every generated door as an OPEN portal with a world `x`/`z`, a clamped `w`
 * and `DOORWAY_H`. `room.js` `cutsOnWall` cuts the wall for that portal; this table punches the
 * matching hole in the FACE's damage grid and in its own geometry, off the same row. Two
 * mechanisms, one coordinate — which is what `SLAB_DOORWAYS`' header means by *"a known
 * location"*, and why the two cannot drift.
 *
 * A doorway is matched on BOTH the space pair and the geometry: a portal between two other rooms
 * that happens to lie on the same wall LINE is a different hole in a different stretch of wall.
 *
 * ⚠️ **THE HEAD IS 0.08 m AND THAT IS THE WHOLE MARGIN.** `DOORWAY_H` is 2.72 against a 2.80 m
 * `DIG_H`. `apertureRects` CLAMPS `v1` and `d.h` is bounded nowhere, so a doorway taller than its
 * band is accepted and quietly loses its head. This never emits one — but it counts them
 * (`stats.overTall`) rather than clamping, because a silent clamp is the "result-shaped output
 * instead of an error" failure this project keeps paying for. `harness/_ap3-geom.mjs`'s `slabhead`
 * fixture deliberately DOES emit one, which is why the clamp may not be turned into a throw.
 */
export const GEN_SLAB_MAX = 35.00;   // `genspike.mjs` `SLAB_MAX` — a maximum; a slab has no minimum
/**
 * ⚠️ **0.20 m, AND IT IS `genspike.mjs`'S OWN NUMBER RATHER THAN A NEW ONE.** `L_DOOR` is
 * `CONNECTOR_W + 2 * 0.20`, i.e. a door plus a jamb each side, so 0.20 m is the least wall the
 * packer will ever leave beside a door it placed. A generated internal-joint portal is clamped to
 * its run (`genplan.js` `pushPortal`) and CAN eat the whole of one, which would leave a slab that
 * is entirely hole; below this the span is trimmed past the doorway instead, and a run with
 * nothing left is not a dig site at all.
 */
export const GEN_JAMB_MIN = 0.20;
/** `genspike.mjs` `L_DIG` — the shortest run it will call diggable. `freePanels` skips under 1.2 too. */
export const GEN_L_DIG = 1.20;
/**
 * ⚠️ **1 mm, AND IT IS A ROUNDING TOLERANCE RATHER THAN A FUDGE.** `genspike.mjs` rounds a wall
 * run's `clear` to four decimals and `genplan.js` sizes an internal-joint aperture off that
 * rounded number, so a doorway that exactly fills its run can be **3e-5 m** wider than it. Three
 * orders of magnitude below that and four below the 0.01 m `buildWall` itself works to.
 */
export const GEN_CUT_TOL = 1e-3;

/**
 * Every generated connector that `room.js` `cutsOnWall` will cut into THIS wall line, in the shape
 * `SLAB_DOORWAYS` uses. Sorted along the wall.
 *
 * ⚠️ **PORTALS ONLY, AND THAT IS AIRTIGHT RATHER THAN LAZY.** `PANELS` under `GEN` carries exit
 * sites and nothing else (`genplan.js`), every one of them on the ENVELOPE with `b: 'outside'` —
 * and an interior dig edge has a space on both sides by construction, so it can never share a wall
 * line with one. If a future slice puts an interior row in `PANELS`, this has to widen with it.
 */
function genCutsOn(gen, normal, at, aId, bId) {
  const out = [];
  /**
   * ⚠️ **BOTH LISTS, BECAUSE A DOORWAY IS A HOLE IN THIS WALL WHATEVER KIND OF ROW DESCRIBES IT.**
   * An OPEN doorway is a `portals` row; a SHUT one is a `panels` row carrying a door leaf
   * (`genplan.js`, 2026-08-12). Reading only `portals` was correct while every generated door was
   * open, and became a slab spanning straight across an aperture the moment they were not — the
   * one shape `buildWall`'s single sorted walk cannot represent, which `_ap3-geom` refuses out
   * loud. The `!(c.w > 0)` guard below is what keeps the EXIT rows out: they carry no `w`/`h`.
   */
  for (const c of [...(gen.portals ?? []), ...(gen.panels ?? [])]) {
    // ⚠️ NOT `(a,b) === (aId,bId)`: `cutsOnWall` cuts a connector into a space's wall on the id
    // pair alone, so a door between THIS pair on a DIFFERENT stretch of the same line is still a
    // cut in this wall and still has to be reckoned with. See `straddle` below for why that is
    // not hypothetical.
    if (!(c.a === aId || c.b === aId || c.a === bId || c.b === bId)) continue;
    if (Math.abs((normal === 'x' ? c.x : c.z) - at) > 1e-6) continue;
    if (!(c.w > 0) || !(c.h > 0)) continue;
    out.push({ id: c.id, at: normal === 'x' ? c.z : c.x, w: c.w, h: c.h, sill: 0 });
  }
  return out.sort((p, q) => p.at - q.at);
}

/**
 * Split one run so no piece exceeds `GEN_SLAB_MAX`, **cutting only where there is no doorway** —
 * a seam through an aperture is the one shape `buildWall`'s single sorted walk cannot represent.
 * Never fires on any measured seed; it is a tripwire for a generator that grows, and the gate
 * reports it either way.
 */
function genSplitSpans(s0, s1, doors) {
  const out = [[s0, s1]];
  for (let guard = 0; guard < 16; guard++) {
    const i = out.findIndex(([a, b]) => b - a > GEN_SLAB_MAX + 1e-6);
    if (i < 0) break;
    const [a, b] = out[i];
    const gaps = [];
    let cur = a;
    for (const d of doors) {
      if (d.at <= a || d.at >= b) continue;
      gaps.push([cur, d.at - d.w / 2]);
      cur = d.at + d.w / 2;
    }
    gaps.push([cur, b]);
    const mid = (a + b) / 2;
    let best = null;
    for (const [g0, g1] of gaps) {
      if (g1 - g0 < 1e-6) continue;
      const p = Math.min(Math.max(mid, g0), g1);
      if (best === null || Math.abs(p - mid) < Math.abs(best - mid)) best = p;
    }
    if (best === null || best <= a + 1e-6 || best >= b - 1e-6) break;   // no legal seam — leave it
    out.splice(i, 1, [a, best], [best, b]);
  }
  return out;
}

/**
 * @returns {{edges:object[], stats:object}} the table plus what it had to refuse, so a gate can
 *   tell "this house has no diggable wall" from "I could not find one".
 */
function generatedDigEdges(gen) {
  const stats = {
    runs: 0, edges: 0, doorways: 0, tooShort: 0, trimmed: 0, straddle: 0, clamped: 0,
    capSplit: 0, overCap: 0, thinPier: 0, overTall: 0, longest: 0,
  };
  if (!gen) return { edges: [], stats };
  const rows = gen.spaces ?? [];
  const cand = [];
  for (const A of rows) {
    for (const B of rows) {
      if (A === B) continue;
      // `A` is always the row on the GREATER side of the band, which is the side `freePanels`
      // calls `a`. The two tests are mutually exclusive for any two disjoint rectangles.
      if (Math.abs((A.x0 - WALL_T) - B.x1) < 1e-6) {
        const lo = Math.max(A.z0, B.z0), hi = Math.min(A.z1, B.z1);
        if (hi - lo > 1e-6) cand.push({ normal: 'x', at: (A.x0 + B.x1) / 2, a: A.id, b: B.id, lo, hi });
      }
      if (Math.abs((A.z0 - WALL_T) - B.z1) < 1e-6) {
        const lo = Math.max(A.x0, B.x0), hi = Math.min(A.x1, B.x1);
        if (hi - lo > 1e-6) cand.push({ normal: 'z', at: (A.z0 + B.z1) / 2, a: A.id, b: B.id, lo, hi });
      }
    }
  }
  // ⚠️ **THE ORDER IS THE IDS, AND THE IDS ARE A NETWORK PROTOCOL SURFACE** (see this file's
  // header). Sorted by geometry rather than by `SPACES` row order so the table is a function of
  // the WALL, in the spirit of `genspike.mjs`'s `edgeKey`. The full content-hashed handshake is
  // out of scope for this slice — `agents-resume-2026-08-11.md` §7 defers it by name — and
  // nothing multiplayer reads a generated house yet.
  cand.sort((p, q) => (p.normal < q.normal ? -1 : p.normal > q.normal ? 1 : 0)
    || (p.at - q.at) || (p.lo - q.lo) || (p.a < q.a ? -1 : p.a > q.a ? 1 : 0));

  const edges = [];
  for (const c of cand) {
    stats.runs++;
    const cuts = genCutsOn(gen, c.normal, c.at, c.a, c.b);
    let s0 = c.lo, s1 = c.hi;

    /**
     * 🚨 **PASS 1 — A CUT THAT CROSSES AN END OF THIS RUN IS A HARD BOUNDARY FOR THE SLAB, AND
     * IT IS NOT HYPOTHETICAL: 3 OF 25 GENERATED PORTALS ON SEED 0 DO IT.**
     *
     * `genplan.js` places a door on `genspike`'s REGION-level `doorRun`, but it emits one `SPACES`
     * row per corridor RECT — so a run that `wallRuns` merged across two of a region's rects can
     * carry a 1.90 m aperture centred where those two rects meet. Measured on seed 0: `D.g16`
     * (`r6.chapel` ↔ `c0.1`) hangs **0.434 m past `c0.1`'s own end**, into `c0.2`, which is not a
     * party to that connector and therefore keeps its wall solid behind part of the opening.
     * **That is a pre-existing `?plan=gen` defect and it is NOT this table's to fix** — it is John's
     * own *"green open door clipping on the corner of the rooms and into the hallway"*, one level
     * below where `maptool-2` fixed it. Reported as `stats.straddle`.
     *
     * What this table owes it is not to make it worse. `buildWall`'s single sorted walk can
     * represent a cut wholly INSIDE another and a cut wholly OUTSIDE it, and nothing in between:
     * a slab overlapping a doorway it cannot contain raises `[room] buildWall: overlapping cuts
     * that do not nest` and stacks a second lintel. So the slab stops at the doorway's edge, EXACTLY
     * — `right > left + 1e-6` is false for two cuts that merely touch, which is the one place the
     * walk is well defined.
     *
     * ⚠️ **AND THE `clamped` HALF IS A ROUNDING ARTEFACT, NOT A STRADDLE.** `genspike.mjs`'s
     * `wallRuns` stores `clear` as `+(struct - WALL_T).toFixed(4)`, and `genplan.js` clamps an
     * internal-joint aperture to that rounded number — so a doorway that fills its run exactly can
     * come out **3e-5 m wider than the wall it is in**. Chopping a whole span on 30 microns would
     * be the instrument fitting the noise, so anything inside `GEN_CUT_TOL` is clamped instead; the
     * jamb pass below then correctly finds no wall left and emits no dig face at all.
     */
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const d of cuts) {
        const a0 = d.at - d.w / 2, a1 = d.at + d.w / 2;
        if (a1 <= s0 + GEN_CUT_TOL || a0 >= s1 - GEN_CUT_TOL) continue;          // disjoint
        if (a0 >= s0 - GEN_CUT_TOL && a1 <= s1 + GEN_CUT_TOL) continue;          // contained
        if (a0 < s0 + GEN_CUT_TOL) { s0 = Math.max(s0, a1); } else { s1 = Math.min(s1, a0); }
        stats.straddle++; moved = true;
      }
      if (!moved) break;
    }
    if (s1 - s0 < GEN_L_DIG) { stats.tooShort++; continue; }

    // PASS 2 — what is left inside the run becomes an aperture, clamped to it (see above)
    const ds = [];
    for (const d of cuts) {
      const a0 = d.at - d.w / 2, a1 = d.at + d.w / 2;
      if (a1 <= s0 + GEN_CUT_TOL || a0 >= s1 - GEN_CUT_TOL) continue;
      const q0 = Math.max(a0, s0), q1 = Math.min(a1, s1);
      if (q0 !== a0 || q1 !== a1) stats.clamped++;
      ds.push({ ...d, at: (q0 + q1) / 2, w: q1 - q0 });
    }
    // trim past a doorway that leaves no jamb at an END of the run — see `GEN_JAMB_MIN`
    while (ds.length && (ds[0].at - ds[0].w / 2) - s0 < GEN_JAMB_MIN) {
      s0 = ds[0].at + ds[0].w / 2; ds.shift(); stats.trimmed++;
    }
    while (ds.length && s1 - (ds[ds.length - 1].at + ds[ds.length - 1].w / 2) < GEN_JAMB_MIN) {
      s1 = ds[ds.length - 1].at - ds[ds.length - 1].w / 2; ds.pop(); stats.trimmed++;
    }
    if (s1 - s0 < GEN_L_DIG) { stats.tooShort++; continue; }
    for (let k = 1; k < ds.length; k++) {
      if ((ds[k].at - ds[k].w / 2) - (ds[k - 1].at + ds[k - 1].w / 2) < GEN_JAMB_MIN) stats.thinPier++;
    }
    for (const d of ds) { stats.doorways++; if (d.h > DIG_H + 1e-6) stats.overTall++; }
    const spans = genSplitSpans(s0, s1, ds);
    if (spans.length > 1) stats.capSplit++;
    for (const [a, b] of spans) {
      if (b - a > stats.longest) stats.longest = b - a;
      if (b - a > GEN_SLAB_MAX + 1e-6) stats.overCap++;
    }
    edges.push({
      id: `g${edges.length}`, normal: c.normal, at: c.at, a: c.a, b: c.b,
      spans, doorways: ds.length ? ds : undefined,
    });
  }
  stats.edges = edges.length;
  return { edges, stats };
}

/**
 * ⚠️ **LAZY AND MEMOISED, AND THE LAZINESS IS LOAD-BEARING.** `DIG_H` is declared far below this
 * point and a `const` is in its temporal dead zone until then, so computing the table at this
 * line would throw `ReferenceError` at import — the same trap `spaces.js` records for `GEN`
 * itself. The first caller is this file's own foot-of-file validator, which runs after everything
 * is declared. Memoised because every consumer takes `digEdges()` as a DEFAULT ARGUMENT and two
 * different array objects would give the build and the interconnect picker two different tables.
 */
let _genTable = null;
export function genDigTable() {
  if (!_genTable) _genTable = generatedDigEdges(GEN);
  return _genTable;
}

/**
 * ⚠️ **THE ONE SWITCH, AND EVERY CONSUMER'S DEFAULT ARGUMENT GOES THROUGH IT.** `room.js` calls
 * `freePanels()` and `chooseFreeInterconnect(seed)` with no table, `views/game.js` calls
 * `interconnectIds(seed)`, and `harness/scenarios/*` import `DIG_EDGES` directly. Routing every
 * default through one function is what stops the build and the interconnect picker disagreeing
 * about which arm they are on — the failure `room.js`'s own `?dig=` note calls "a toggle that
 * reverts less than it claims", found three times in two days.
 *
 * ✅ With the flag off this returns **the same array object** `DIG_EDGES` always was.
 */
export function digEdges() {
  return GEN ? genDigTable().edges : (SLAB ? SLAB_EDGES : DIG_EDGES);
}

/** What a probe asserts the build on, rather than on the URL it typed. */
export function slabArm() { return SLAB; }

/**
 * Where the segments land on one span. Pure arithmetic, centred in the span, so a span that does
 * not divide evenly leaves an equal margin of ordinary wall at each end rather than a ragged one.
 */
function segmentCentres(lo, hi) {
  const n = Math.floor((hi - lo) / SEG_W);
  if (n < 1) return [];
  const pad = ((hi - lo) - n * SEG_W) / 2;
  return Array.from({ length: n }, (_, i) => lo + pad + SEG_W * (i + 0.5));
}

/**
 * TWO PANELS PER SEGMENT — ONE PER ROOM — AND THAT IS THE TWO-SIDEDNESS.
 *
 * `dig.md` §5: *"you always dig inward from your own side and stop at the boundary. Depth is
 * per-side; the barrier is the shared floor of both sides. Exposing it from room A tells you
 * nothing about how far anyone has dug from room B."*
 *
 * So each side gets its own `WallState`, its own id and its own depth, and the shared thing
 * between them is the brick — which has no state. A player in `a` and a player in `b` can dig the
 * same segment for as long as they like and never connect, because there is no reachable stage on
 * either side that stops blocking movement and there is a solid slab between them regardless.
 *
 * ⚠️ THE PANEL'S NORMAL POINTS INTO ITS OWN ROOM. `wallStageMaterials` are `FrontSide` (see
 * `breakmask.js`, which sets it explicitly) and the layer planes are built in the XY plane facing
 * local +Z, so a stack facing the wrong way is invisible from the room that owns it and the
 * segment reads as a hole. `rotY` is derived here, never authored, for the reason `views/game.js`
 * gives about `outSign`: a mirrored sign does not throw, it just renders nothing.
 */
export function digPanels(edges = digEdges()) {
  const out = [];
  for (const e of edges) {
    const xAxis = e.normal === 'x';
    let i = 0;
    for (const [lo, hi] of e.spans) {
      for (const u of segmentCentres(lo, hi)) {
        for (const side of ['a', 'b']) {
          const sign = side === 'a' ? 1 : -1;             // `a` sits on the greater side of `at`
          const n = e.at + sign * HALF_BAND;              // that room's inner wall face
          out.push({
            id: `d.${e.id}.${i}.${side}`,
            dig: true, edge: e.id, seg: i, side,
            state: 'breachable',
            a: side === 'a' ? e.a : e.b,
            b: side === 'a' ? e.b : e.a,
            x: xAxis ? n : u,
            z: xAxis ? u : n,
            // normal must point INTO the owning room: +axis for `a`, -axis for `b`
            rotY: xAxis ? sign * Math.PI / 2 : (sign > 0 ? 0 : Math.PI),
            w: SEG_W, h: SEG_H, cy: SEG_CY, t: SEG_T,
          });
        }
        i++;
      }
    }
  }
  return out;
}

/**
 * THE BRICK, as boxes, in world space — the thing you cannot get through.
 *
 * ⚠️ **EMITTED AS EACH ROOM'S OWN SKIN, FOR `spaces.js`'S OWN REASON.** The floor plan's rule is
 * that *"each space always draws its own four walls"* — a boundary owned wholly by one space
 * punches a hole in the wall its neighbour is looking at the moment residency hides the owner.
 * The barrier is a boundary, so it obeys the same rule: room `a` emits the 0.075 m of brick on
 * its side of the centre plane and room `b` emits the 0.075 m on its side. They ABUT, they do not
 * overlap, so there is no z-fighting, and neither is a copy of the other's state because neither
 * has any state.
 *
 * `dig.md` §6a.1: *"wallpaper -> plaster -> lath -> beam -> BRICK, and the brick is the thing you
 * cannot get through... the same masonry wall is the barrier from both rooms."*
 * `refs/lath/lath-tower-of-london.jpg` and `refs/lath/demo-selective-12.jpg` already photograph
 * exactly this construction.
 *
 * @returns {{space:string, edge:string, w:number,h:number,d:number, x:number,y:number,z:number}[]}
 */
export function barrierSlabs(edges = digEdges()) {
  const out = [];
  const half = (WALL_T - 2 * SEG_T) / 2;                  // 0.075 — one room's half of the brick
  for (const e of edges) {
    const xAxis = e.normal === 'x';
    let i = 0;
    for (const [lo, hi] of e.spans) {
      for (const u of segmentCentres(lo, hi)) {
        for (const side of ['a', 'b']) {
          const sign = side === 'a' ? 1 : -1;
          const c = e.at + sign * (half / 2);             // centre of that room's half-slab
          out.push({
            space: side === 'a' ? e.a : e.b, edge: e.id, side, seg: i,
            /**
             * ⚠️ **THE SLAB IS KEYED TO THE SEGMENT IN FRONT OF IT, AND THAT IS WHY THIS IS ONE
             * BOX PER SEGMENT RATHER THAN ONE PER SPAN.** `dig-1` merged a whole span into one
             * box to keep `boxesNear`'s per-frame loop short, which was right when nothing could
             * ever remove one. Two things now can — the run's interconnect (no brick behind it,
             * ever) and the hunter's crossing (it takes the brick and the lintel with it) — and
             * a per-span box cannot be holed. 12 boxes become 36; see `room.js` for what that
             * costs in `boxesNear` and what it buys.
             *
             * The panel id is derived here rather than re-derived by the consumer, for the same
             * reason `digPanels` derives `rotY`: two places computing `d.<edge>.<i>.<side>` is
             * two places for it to be computed differently, and the failure is silent (a barrier
             * that never lifts, or one that lifts in front of the wrong bay).
             */
            panel: `d.${e.id}.${i}.${side}`,
            w: xAxis ? half : SEG_W,
            h: SEG_H,
            d: xAxis ? SEG_W : half,
            x: xAxis ? c : u,
            y: SEG_H / 2,
            z: xAxis ? u : c,
          });
        }
        i++;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The interconnect
// ---------------------------------------------------------------------------

/** How many segments an edge carries. Pure arithmetic on the authored table. */
export function segmentCount(edge) {
  return edge.spans.reduce((n, [lo, hi]) => n + segmentCentres(lo, hi).length, 0);
}

/**
 * 🕳️ **THE ONE WAY THROUGH — one hidden interconnect per shared edge, seeded.**
 *
 * `dig.md` §1: *"it generates procedurally in a different spot each time as the only connection
 * point."* Until this existed **every dig was a dud**, so `dig-1`'s measured falloff was honest as
 * a FEEL and vacuous as a SEARCH HEURISTIC — there was nothing to search for. This is the
 * function that closes that, and it is four lines because the hard parts were already built.
 *
 * ⚠️ **DERIVED FROM THE RUN SEED, NOT BAKED INTO THE BUILD, AND THAT IS DELIBERATE.**
 * `views/game.js` already says it in as many words about the live exit: *"which site is live is a
 * PER-RUN fact and the builder runs before a run exists"*. Baking the interconnect into
 * `digPanels()` would mean the room build needed the seed, which would make the arm-off/arm-on
 * comparison `dig-toggle.mjs` makes a comparison of two different seeds. So the geometry is
 * seed-independent — every segment is built identically, with brick behind it — and
 * `room.setDigPlan()` is what makes one of them the way through, exactly as `applyExitPlan()`
 * makes one padlocked door the exit.
 *
 * ⚠️ **AND THE SALT IS PER EDGE, NOT PER RUN.** `seedRand(seed, 'dig.link|svc_w')` and
 * `...|svc_e'` are independent draws, so the two edges do not move together and knowing one
 * tells you nothing about the other. `run.js` `seedRand` is stateless and order-independent, so
 * the server and every client derive the same answer with no message.
 */
export function chooseInterconnect(seed, edges = digEdges()) {
  const out = new Map();
  for (const e of edges) {
    const n = segmentCount(e);
    if (n < 1) continue;
    out.set(e.id, Math.min(n - 1, Math.floor(seedRand(seed, `dig.link|${e.id}`) * n)));
  }
  return out;
}

/** The panel ids — BOTH sides — of this run's interconnects. The set `room.setDigPlan` takes. */
export function interconnectIds(seed, edges = digEdges()) {
  const out = [];
  for (const [edgeId, i] of chooseInterconnect(seed, edges)) {
    out.push(`d.${edgeId}.${i}.a`, `d.${edgeId}.${i}.b`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 🕳️ FREE-FORM: THE WALL IS CONTINUOUS AND THE ANSWER IS INSIDE IT
// ---------------------------------------------------------------------------

/**
 * 🚨 **THE MODE. `?dig=1` (or `?dig=free`) IS NOW FREE-FORM; `?dig=bays` IS THE OLD SEGMENTED
 * BUILD, KEPT SO EVERY MEASUREMENT TAKEN AGAINST IT STAYS COMPARABLE.**
 *
 * John played the segmented build and rejected it in one sentence: *"I don't really want to use
 * the dud bay. I wanted a whole new system where white chucks fall off when hit with the
 * hammer."*
 *
 * ⚠️ **AND `dig.md` §1 PREDICTED THE FAILURE IN ADVANCE.** The mechanic was justified on the
 * grounds that *"with a handful of fixed candidates you find the way through by counting
 * padlocks. Here there is nothing to count — the wall is continuous and the answer is inside
 * it."* **Nine bays per wall is nine candidates.** Segmentation moved the counting from padlocks
 * to panels and kept the defect it was written to remove.
 *
 * So the question stops being *"which of nine panels?"* and becomes *"where in this wall?"*, and
 * the only channel that answers it is how fast the wall is giving way — `dig.md` §5's mechanic,
 * and the one a numeric meter would destroy (John, same day: *"no numeric destruction meter"*).
 *
 * ⚠️ **`bays` MUST REVERT EVERY PIECE OF STATE THE MODE IMPLIES.** HANDOFF's `?cam=r10` finding
 * is that a toggle reverting less than it claims contaminates every comparison made with it, and
 * three incomplete reverts were found in two days. The complete list, and there is nothing else:
 *   1. `digPanels()` returns SPANS, not segments — one face per span per room
 *   2. those faces carry `free: true`, which is what puts a `DamageField` on them (`wall.js`)
 *   3. `barrierSlabs()` returns NOTHING in free mode — the barrier is the field's G channel, not
 *      masonry, so there is no brick to bake, no collider to drop and no `brickOf` entry
 *   4. `DIG_FREE_DEFS` rather than `DIG_DEFS` / `DIG_OPEN_DEFS`
 *   5. `demoteOpen` is false — a free face is never a constant picture (`wall.js` `spent`)
 * Every one of them is derived from this one function, which is why it is a function.
 */
export function digMode(raw) {
  if (raw === 'bays') return 'bays';
  if (raw === 'free' || raw === '1' || raw === true) return 'free';
  return 'off';
}

/**
 * 🕳️ **THE DESTRUCTIBLE BAND — sill on the floor, lintel at 2.80 m.**
 *
 * ⚠️ **THIS KNOWINGLY DROPS THE "TOO LOW FOR THE HUNTER" REFUGE, AND IT IS A RECORDED TRADE, NOT
 * AN OVERSIGHT.** `SEG_H` was 1.80 precisely so a 2.40 m hunter could not get under the lintel
 * (`rules.js` `PASS_H`), which bought D7's refuge mechanic for free. John, 2026-08-07: holes open
 * wherever the hammer lands, at any height. 2.80 clears `PASS_H.hunter` by 0.40 m, so a hole a
 * player digs is a hole the hunter can follow them through — and the horror of that is the point.
 *
 * ⚠️ **WHY 2.80 AND NOT THE FULL 4.80 m STOREY**, stated because it is the one number here that
 * is a perf decision rather than a design one: four coplanar layer planes over a 5.7 m x 4.8 m
 * wall is 27.5 m² of alpha-tested fill each, and `walls-perf.md` records the GPU budget at
 * 1.33–1.60 ms against 1.39 — the headroom is real but thin. 2.80 m is above every height a
 * 1.70 m robot can swing a hammer at and above every height the hunter needs, so nothing in play
 * can tell the difference, and it is 42% less fill. The masonry above 2.80 is ordinary wall.
 */
export const DIG_H = 2.80;
export const DIG_CY = DIG_H / 2;
/**
 * 🧱 **ONE ROOM'S HALF OF THE WALL BAND — 0.075 → 0.15, AND IT IS THE GEOMETRY BEHIND JOHN'S
 * "IT FELT LIKE A 2D MESH TAKING OFF LAYERS".**
 *
 * This number is the render depth of a dig face: `wall.js` builds the reveal box to it, spreads
 * the four layer planes across it (`DAMAGE_DEPTH_F`) and stands the barrier at the back of it.
 * At 0.075 the whole visible cross-section of a wall you spend a minute chopping through was
 * **three inches**, of which the layer stack used 52 mm — so the hole had no depth to show and
 * the cut edge had nothing to be thick against.
 *
 * ⚠️ **IT WAS ALREADY THE COLLIDER'S NUMBER, WHICH IS WHY THIS IS A CORRECTION AND NOT A
 * RETUNE.** `freePanels()` sets `bandT: WALL_T / 2` = 0.15 because a body must not be able to
 * slip into the cavity through a hole one side has dug; `wall.js` `_recomputeBox` already takes
 * `max(thickness, bandThickness * 2)`, so the broad-phase box, the narrow-phase boxes and the
 * BFS all read 0.15 today and are **arithmetically unchanged by this line**. What moves is only
 * what you can see. And it is now physically honest: the two rooms' faces are 0.15 + 0.15 and
 * meet exactly in the middle of the 0.30 m band, where in `?dig=bays` the brick used to be.
 *
 * ⚠️ `?dig=bays` is unaffected — `digPanels()` uses `SEG_T`, not this.
 */
export const DIG_T = 0.15;

/**
 * ⚠️ **A FREE FACE'S STAGE TABLE, AND IT IS A SUMMARY RATHER THAN THE TRUTH.**
 *
 * Passability on a free face is `DamageField.channel()` and nothing else — `wall.js`
 * `blocksMovement` asks the grid, not this table. What this table is still for: the FX wiring,
 * the noise a dig makes, `debrisKind`, and `syncStage` on the wire. So it is `STAGE_DEFS` with
 * the healths flattened (nothing consumes them on a free face) and a terminal row that CAN open,
 * because `WallState.canOpen()` is what `hunter-ai.js` uses to decide a wall is worth slamming
 * and a wall you can dig through is exactly that.
 *
 * ⚠️ `blocksSight` at the beam row stays FALSE, carried from `STAGE_DEFS`, for the reason that
 * file gives — but on a free face `wall.js` overrides all three queries anyway, so this is the
 * value a probe that reads the table sees and never the value the game acts on.
 */
export const DIG_FREE_DEFS = STAGE_DEFS.map((d, i) => ({ ...d, health: [40, 70, 55, 90, 0][i] }));

/**
 * 🕳️ **ONE CONTINUOUS FACE PER SPAN PER ROOM.** This is the whole difference from `digPanels()`:
 * where that emitted `floor(span / 1.14)` bays, this emits ONE, and the destruction inside it is
 * positional. The spans themselves are unchanged and are still the three gaps between the
 * shipped `p.svc_w.*` / `p.svc_e.*` connectors — see `DIG_EDGES` for why they dodge them.
 *
 * ⚠️ **THE IDS ARE A NETWORK PROTOCOL SURFACE AND THESE ARE NEW ONES: `f.<edge>.<span>.<side>`.**
 * They do not collide with `d.<edge>.<seg>.<side>` and they are derived from the same authored
 * table, so the same rule applies: appending an edge is safe, reordering `DIG_EDGES` or moving a
 * span renumbers everything on it.
 *
 * ⚠️ **AND `PANELS` IS STILL NOT TOUCHED, SO NO SEED MOVES.** `run.js` `chooseExit()` derives the
 * live exit from `PANELS.filter(isExitSite)`; a table that is neither inserted into `PANELS` nor
 * an exit site cannot re-roll a seed. Every seed quoted in every document still means what it
 * said — the property `dig-1` bought and the one thing this rewrite must not spend.
 */
export function freePanels(edges = digEdges()) {
  const out = [];
  for (const e of edges) {
    const xAxis = e.normal === 'x';
    let i = 0;
    for (const [lo, hi] of e.spans) {
      const w = hi - lo;
      const u = (lo + hi) / 2;
      // a span too short to dig a body through is not a dig site; skip it rather than build a
      // face nobody can ever use, which would read as a wall that refuses to break
      if (w >= 1.2) {
        for (const side of ['a', 'b']) {
          const sign = side === 'a' ? 1 : -1;
          const n = e.at + sign * (WALL_T / 2);
          /**
           * 🚪 **THE HOLES THIS FACE CONTAINS.** `undefined` on every edge that carries no
           * `doorways`, which is every edge on the default arm — so the object below is
           * key-for-key what it has always been and nothing downstream grows a branch.
           */
          const apertures = apertureRects(e, lo, hi, side) ?? undefined;
          out.push({
            id: `f.${e.id}.${i}.${side}`,
            dig: true, free: true, edge: e.id, seg: i, side,
            state: 'breachable',
            a: side === 'a' ? e.a : e.b,
            b: side === 'a' ? e.b : e.a,
            x: xAxis ? n : u,
            z: xAxis ? u : n,
            rotY: xAxis ? sign * Math.PI / 2 : (sign > 0 ? 0 : Math.PI),
            w, h: DIG_H, cy: DIG_CY, t: DIG_T,
            /** the collider fills this room's half of the 0.30 m band — see `wall.js`. */
            bandT: WALL_T / 2,
            /**
             * 🚪 ⚠️ **THE APERTURES RIDE IN ON `cell` AND THAT IS A WORKAROUND WITH AN OWNER, NOT
             * A DESIGN.** `room.js` builds the panel with `damage: def.free ? { cell: def.cell }
             * : null` — one hand-picked field — so `def.cell` is the only channel from this table
             * to the `DamageField`, and `room.js` belongs to `doorlook-1` this session.
             * `wall.js` unpacks both shapes and documents the honest one (`damage.apertures`);
             * **when `room.js` is free, widen its literal and delete this packing.** With no
             * apertures this is the bare number it has always been, so the default arm never
             * takes the branch.
             */
            cell: apertures ? { cell: CELL, apertures } : CELL,
            apertures,
          });
        }
      }
      i++;
    }
  }
  return out;
}

/**
 * 🕳️ **THIS RUN'S INTERCONNECT — one region per shared edge, seeded, and a BLOB rather than a
 * bay index.**
 *
 * `dig.md` §1: *"it generates procedurally in a different spot each time as the only connection
 * point."* The segmented build satisfied that with an integer, which is exactly the counting the
 * design was trying to abolish. Here the answer is a position along a continuous wall plus a
 * shape, so there is no enumeration to do — you find it by digging and by reading how the wall
 * gives way.
 *
 * ⚠️ **THE SALT IS PER EDGE, NOT PER RUN**, carried over from `chooseInterconnect`: the two edges
 * are independent draws, so knowing one tells you nothing about the other, and `seedRand` is
 * stateless so every client derives the same answer with no message.
 *
 * ⚠️ **THE REGION IS SIZED, NOT SEEDED.** `IC_W` is what makes John's band reachable — it is the
 * probability that a probe lands on the answer, and therefore the number of duds, and therefore
 * the seconds. A seed that could double it would make the median meaningless.
 *
 * @returns {Map<string, {panel:string, u:number, v:number, ru:number, rv:number, salt:number}>}
 *   keyed by edge id. `u`/`v` are face-local 0..1 on the named panel's `a` side.
 */
export const IC_W = 1.55;      // metres across, on the wall

/**
 * ⚠️ **2.60 m TALL, AND THE FIRST VERSION'S 1.95 WAS A MEASURED FAILURE, NOT A STYLE CHOICE.**
 *
 * A body needs 0.68 m of clear width from the step height (0.30 m) to 1.70 m. The region is an
 * ellipse, and an ellipse is NARROW NEAR ITS TOP: at 1.95 m tall the passage was 1.26 m wide at
 * knee height and had pinched to **0.49 m at 1.70 m** — under a body. Driven in-game, 247 hammer
 * blows opened a 0.573 m channel and then stopped improving, because there was nothing left to
 * remove: every remaining cell at head height had masonry behind it. That failure does not throw
 * and does not look like a data bug — it looks like the interconnect not working.
 *
 * At 2.60 m centred on the band the waist covers the whole body: **1.51 m of passage at 1.70 m
 * and 0.83 m at 0.30 m**, both comfortably over 0.68, with the pinch where it belongs — at the
 * floor and at the lintel, where nothing walks.
 */
export const IC_H = 2.60;

/**
 * 🚪 **THE ANSWER CAN NEVER BE INSIDE A DOORWAY — ONE SEEDED DRAW, MAPPED ONTO WHAT IS LEFT.**
 *
 * The interconnect is the one region of a face with nothing behind it. Rasterising it over an
 * aperture would put the way through inside a hole that is already a way through: the search
 * would be over before it started, on a face the player can see across from the next room, and
 * `dig-band`'s FIND clock — *"the search IS the game"* — would read 0 s for a reason no probe
 * asks about. So the legal centres are `[ru, 1-ru]` with each aperture GROWN BY THE BLOB'S OWN
 * HALF-WIDTH removed, and the draw is mapped onto the concatenation of what survives.
 *
 * ⚠️ **ONE `seedRand` DRAW, AND WITH NO APERTURES THE EXPRESSION IS LITERALLY THE ONE THIS
 * FUNCTION HAS ALWAYS USED.** Inverse-CDF over a single interval `[ru, ru + span]` is
 * `ru + t * span` to the bit, and the number of draws is unchanged, so the salt and every other
 * edge's answer are untouched. **No recorded seed moves on the default arm** — the property
 * `dig-1` bought and every document since has spent.
 *
 * ⚠️ If a face has no legal centre left the draw falls back to the unconstrained placement rather
 * than to no interconnect at all: a wall with no way through is a softlock, and a way through
 * that overlaps a doorway is merely a bad seed. `_ap2-rule.mjs` A6 asserts the fallback is
 * unreachable on the shipped table (a 15.40 m face against two 2.08 m doorways leaves 7.9 m).
 */
export function placeInterconnectU(t, ru, apertures) {
  const span = Math.max(0, 1 - 2 * ru);
  if (!apertures || !apertures.length) return ru + t * span;
  let free = [[ru, ru + span]];
  for (const a of apertures) {
    const b0 = a.u0 - ru, b1 = a.u1 + ru;
    const next = [];
    for (const [x0, x1] of free) {
      if (b1 <= x0 || b0 >= x1) { next.push([x0, x1]); continue; }
      if (b0 > x0) next.push([x0, b0]);
      if (b1 < x1) next.push([b1, x1]);
    }
    free = next;
  }
  const total = free.reduce((n, [x0, x1]) => n + (x1 - x0), 0);
  if (total <= 1e-9) return ru + t * span;
  let pick = t * total;
  for (const [x0, x1] of free) {
    const L = x1 - x0;
    if (pick < L) return x0 + pick;
    pick -= L;
  }
  return free[free.length - 1][1];
}

export function chooseFreeInterconnect(seed, edges = digEdges()) {
  const out = new Map();

  /**
   * 🕳️ **ONE PER ROOM, NOT ONE PER EDGE — John, 2026-08-12, after playing a generated house.**
   *
   *   *"the interconnect should be the main way out of each room. each room having an
   *   interconnect that removes the cyan barrier for the walls of that room."*
   *
   * 🚨 **THE OLD RULE MADE THE SEARCH VANISH THE MOMENT THE GENERATOR ARRIVED, AND THE NUMBER SAYS
   * SO.** One region per EDGE was written against the authored house's 7 edges; `genslab-1`
   * measured a generated house at **17-36 edges with EVERY aperture-free face carrying one**
   * (12/12 to 28/28 per seed). A room with five edges had five soft spots and you fell over one.
   * Per room it has exactly one. **`dig.md`'s "adding an edge makes a room FASTER to dig out of"
   * is retired by this line** — that was the per-edge rule's own consequence, and it scaled with a
   * generator in a way the authored table could never show.
   *
   * ⚠️ **THE ROOM THAT UNLOCKS IS THE SIDE YOU DUG FROM, NOT THE SIDE THIS PICKED.** The region is
   * placed on a side-`a` face and `room.js` mirrors it to the twin, so the blob is one spot in one
   * wall reachable from both rooms; `unlockBarrier` then reads `ownerSpace` off whichever face the
   * player actually broke. **You unlock the room you are standing in**, which is the only reading
   * that makes "the walls of that room" mean anything to the person holding the hammer.
   *
   * ⚠️ **EVERY SEED'S INTERCONNECT MOVES.** This is a different function of the same seed — the
   * salt is keyed on the ROOM now, not the edge. Any recorded "seed sN opens at …" is void, and
   * that is the price of the feature, not a regression to chase.
   */
  const byRoom = new Map();
  for (const e of edges) {
    for (const r of [e.a, e.b]) {
      if (!r) continue;
      if (!byRoom.has(r)) byRoom.set(r, []);
      byRoom.get(r).push(e);
    }
  }

  // sorted so the table is a pure function of the seed and not of edge-array order, which
  // `?plan=gen` derives from geometry and could reorder under a scoring tweak.
  const rooms = [...byRoom.keys()].sort();
  const used = new Set();
  for (const room of rooms) {
    const all = byRoom.get(room).flatMap((e) => freePanels([e])).filter((p) => p.side === 'a');
    if (!all.length) continue;
    // prefer a wall no other room has already claimed, so two rooms do not share one soft spot;
    // fall back to the full set rather than leaving a room with no way out at all.
    const faces = all.filter((f) => !used.has(f.id)).length ? all.filter((f) => !used.has(f.id)) : all;
    // weight the choice by span length, so a long wall is proportionally more likely to hold
    // the answer than a short one — otherwise the 2.56 m span is as good a guess as the 5.72 m
    // one and the search collapses to "try the short walls first".
    const total = faces.reduce((n, f) => n + f.w, 0);
    let pick = seedRand(seed, `dig.free|room|${room}`) * total;
    let face = faces[faces.length - 1];
    for (const f of faces) { if (pick < f.w) { face = f; break; } pick -= f.w; }
    used.add(face.id);
    const ru = (IC_W / 2) / face.w;
    const rv = (IC_H / 2) / DIG_H;
    // keep the blob wholly inside the face, and its bottom on the floor so the hole you break
    // through is one you can actually walk into
    const u = placeInterconnectU(seedRand(seed, `dig.free.u|room|${room}`), ru, face.apertures);
    out.set(room, {
      // centred on the band: the ellipse's waist is then over the body, and its two pinches are
      // at the floor and at the lintel where nothing has to pass. See `IC_H`.
      panel: face.id, u, v: 0.5, ru, rv, room,
      salt: seedRand(seed, `dig.free.s|room|${room}`) * 10,
    });
  }
  return out;
}

/**
 * ⚠️ A TABLE THAT CANNOT BE WRONG SILENTLY — `spaces.js`'s pattern, and every failure below has
 * a precedent in this repo. Module scope, once, at import: it is two loops over 36 rows.
 *
 *   a duplicate id     `WallField` keys on it; two segments would share one wall's network state
 *   an off-band x/z    `room.js` `cutsOnWall` would never cut the hole, the panel would build
 *                      inside solid wall, and it would OPEN with the wall still standing
 *   a mis-signed rotY  the layer stack faces away from its own room and renders nothing
 */
{
  const seen = new Set();
  /**
   * ⚠️ **`digEdges()`, NOT `DIG_EDGES` — AND THAT WAS A LATENT CRASH.** This lookup read the
   * AUTHORED array while the loop above it walked whatever arm is live. `?slab=1` survived it only
   * because a slab edge keeps its authored id; a generated edge (`g0`, `g1`, …) has no row there
   * at all, so `e` came back `undefined` and the next line threw a `TypeError` **at module scope**,
   * which `main.js` paints as "VIEW … FAILED" over the whole game. Unreachable until this slice
   * only because `digEdges()` returned `[]` under `GEN`.
   */
  const table = digEdges();
  for (const p of digPanels()) {
    if (seen.has(p.id)) throw new Error(`[dig] duplicate segment id "${p.id}"`);
    seen.add(p.id);
    const e = table.find((d) => d.id === p.edge);
    const n = e.normal === 'x' ? p.x : p.z;
    if (Math.abs(Math.abs(n - e.at) - HALF_BAND) > 1e-9) {
      throw new Error(`[dig] segment "${p.id}" is not on the wall band of edge ${e.id}`);
    }
    const nx = Math.sin(p.rotY), nz = Math.cos(p.rotY);
    const into = e.normal === 'x' ? nx : nz;
    const want = p.side === 'a' ? 1 : -1;
    if (Math.abs(into - want) > 1e-9) {
      throw new Error(`[dig] segment "${p.id}" faces away from the room that owns it`);
    }
  }
}

/**
 * 🚪 ⚠️ **AND THE SAME FOR THE DOORWAYS — A TABLE THAT CANNOT BE WRONG SILENTLY.**
 *
 * Every failure below has already happened to a table in this repo, and none of them throws on
 * its own:
 *
 *   a doorway off its span   `apertureRects` drops it, the slab has no hole, and the door stands
 *                            in solid wall — `room.js`'s own "it opens and the wall is still
 *                            there" defect, one layer down
 *   two doorways overlapping the geometry builder in `wallinstances.js` splits on u-edges and
 *                            assumes at most one aperture per strip
 *   a doorway wider than the region the interconnect needs to dodge — a face whose legal
 *                            placements have been eaten to nothing falls back to overlapping one
 *   the two sides disagreeing  a hole on `a` and solid wall on `b` is `_pf1-diag2`'s pair
 *                            invariant broken at build time instead of at run time
 *
 * Module scope, once, at import: it is two loops over at most a handful of rows, and it runs on
 * whichever arm this session is on — so the check follows the flag rather than the default.
 */
{
  for (const e of digEdges()) {
    if (!e.doorways?.length) continue;
    for (const d of e.doorways) {
      if (!(d.w > 0) || !(d.h > 0)) throw new Error(`[dig] doorway on "${e.id}" has no size`);
      const a0 = d.at - d.w / 2, a1 = d.at + d.w / 2;
      const on = e.spans.some(([lo, hi]) => a0 >= lo - 1e-6 && a1 <= hi + 1e-6);
      if (!on) {
        throw new Error(`[dig] doorway ${d.id ?? d.at} on edge "${e.id}" `
          + `(${a0.toFixed(2)}..${a1.toFixed(2)}) is not wholly inside any span of that edge`);
      }
    }
    for (const [lo, hi] of e.spans) {
      const rects = apertureRects(e, lo, hi, 'a');
      if (!rects) continue;
      const sorted = [...rects].sort((p, q) => p.u0 - q.u0);
      for (let k = 1; k < sorted.length; k++) {
        if (sorted[k].u0 < sorted[k - 1].u1 - 1e-9) {
          throw new Error(`[dig] two doorways overlap on edge "${e.id}"`);
        }
      }
      // the pair invariant, at build time: `b`'s rects must be `a`'s mirrored, exactly
      const mirror = apertureRects(e, lo, hi, 'b').map((r) => r).sort((p, q) => p.u0 - q.u0);
      for (let k = 0; k < sorted.length; k++) {
        const m = mirror[mirror.length - 1 - k];
        if (Math.abs((1 - m.u1) - sorted[k].u0) > 1e-9
          || Math.abs((1 - m.u0) - sorted[k].u1) > 1e-9) {
          throw new Error(`[dig] doorway ${k} on edge "${e.id}" is not mirrored between its faces`);
        }
      }
    }
  }
}
