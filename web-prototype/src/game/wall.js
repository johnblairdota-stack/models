import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WallState, FINAL_STAGE } from '../destruction/wall.js';
import { wallStageMaterials, estateSkinMat, plasterMat } from '../materials/surfaces/wallstages.js';
import {
  applyBreakMask, applyStageBreaks, getBreak, barrierMaterial, BARRIER_SHOW_AT,
} from '../materials/breakmask.js';
import { STAGE_DEBRIS } from '../destruction/debris.js';
import { DamageField, OPEN_AT } from '../destruction/damagefield.js';

/**
 * 🧊 **`?chew=0` FREEZES A SCALAR FACE BETWEEN STAGES AGAIN — the ablation for `genexit-1`'s
 * fix, and the only kind of A/B this project accepts.**
 *
 * The argument, the measurement and the +0-draw-call arithmetic are at the call site, inside
 * `applyHit`'s scalar arm. `setChew()` is the in-place handle so an instrument can flip the arm
 * in ONE page rather than across two processes (`harness/still.mjs`'s whole reason for existing:
 * the same build gave 0 of 15 identical parked frames over two page loads).
 *
 * Read once and guarded for node — `harness/evidence/_ap3-build.mjs` imports this file outside a browser.
 * Default ON in both, because unlike the coat this changes no geometry and no headless golden:
 * it writes a uniform on a panel that has already been hit, and nothing headless hits one.
 */
let CHEW = typeof location === 'undefined'
  ? true
  : new URLSearchParams(location.search).get('chew') !== '0';
export function chewArm() { return CHEW; }
export function setChew(on) { CHEW = !!on; return CHEW; }

/**
 * A DESTRUCTIBLE WALL PANEL, in the world, wired to gameplay.
 *
 * `src/destruction/wall.js` is the authoritative state machine and knows nothing about
 * three.js. `src/views/wall-stage.js` shows one panel in a studio. This is the piece that
 * was missing: the thing that a weapon can actually hit, that blocks you until it does not,
 * and that opens a route through the level when it goes.
 *
 * COLLISION follows the state machine's own queries rather than a second copy of the rules:
 *   blocksMovement()     -> the panel's box is solid
 *   blocksProjectile()   -> a shot stops here (false at the beam stage: you can shoot
 *                           BETWEEN the studs, which is why the beam stage is interesting)
 *   blocksLineOfSight()  -> the hunter can see you through it
 * At the open stage all three are false and the box stops being registered at all, so the
 * hole is a hole for movement, for bullets, for sight and for the AI's routing at once.
 *
 * The four nested layer planes and the break-mask handling are the same technique as the
 * stage views: every layer stays visible and carries a break amount, so a breached layer
 * frames the hole with its torn edge instead of vanishing.
 */

export const BREAK_CFG = [
  { lipWidth: 0.05, jag: 0.075, jagScale: [150, 150] },   // 0 wallpaper — soft tear
  { lipWidth: 0.07, jag: 0.130, jagScale: [110, 110] },   // 1 plaster — coarse crumble
  { lipWidth: 0.055, jag: 0.090, jagScale: [200, 30] },   // 2 lath — splinters along x
  { lipWidth: 0.05, jag: 0.085, jagScale: [55, 150] },    // 3 framing — splinters along y
];

export const DEPTHS = [0.000, -0.014, -0.030, -0.052];

/**
 * 🧱 **THE WALL HAD NO THICKNESS BECAUSE THE FOUR LAYERS SPANNED 52 mm OF A 300 mm WALL.**
 *
 * `DEPTHS` above is the scalar stack and it is not touched: every shipped panel, `wall.sheet`
 * (PASS 78) and `wallinstances.js`'s pristine and spent copies keep it exactly.
 *
 * But John's verdict on the free-form dig — *"it felt like a 2d mesh taking off layers"* — is
 * literally true of the geometry: 0 / −14 / −30 / −52 mm, four planes inside two inches, on a
 * face 5.72 m wide. Dig through the paper and the plaster behind it is **fourteen millimetres**
 * away, which at any viewing distance is the same pixel. There is nothing for a cut edge to be
 * thick *against*.
 *
 * So a damage-armed face spreads its stack over its whole share of the wall band, as FRACTIONS
 * of `thickness` (`dig.js` `DIG_T`, now the full half-band) rather than as millimetres, so the
 * two are impossible to get out of step:
 *
 *   0.00  the room's own ornate surface        ← what the hammer meets
 *   0.09  white shell, outer third             ← "white chunks fall off"
 *   0.38  white shell, middle third
 *   0.68  white shell, inner third
 *   0.97  the back of the shell, and where the cyan structure stands
 *
 * At `DIG_T` 0.15 m that is 0 / −14 / −57 / −102 mm with the barrier at −146 mm — a real wall
 * section, and the nested silhouettes now separate by centimetres rather than by millimetres,
 * which is the whole of the parallax a grazing view reads as thickness.
 *
 * 🔴 **ROUND 5: THREE OF THE FOUR SLICES ARE NOW ONE MATERIAL, AND THAT IS JOHN'S NOTE.**
 * *"The white layer is also much less thick than I imagined in my art."* Round 3 gave the white
 * 46% of the band and round 4 darkened its cut face; neither produced a slab, because **46% of
 * the band was the whole of the white and the other 44% was TEAL** — bands 2 and 3 were teal
 * layer planes with their own lip, cut face, arris and mottle, i.e. **a destructible cyan that
 * erodes exactly like the shell**. `refs/dig/dig-iso-annotated.webp` labels the wall twice, in
 * words: *"DESTRUCTIBLE WHITE PANELING"* and *"INDESTRUCTIBLE CYAN STRUCTURE"*. **Two materials,
 * not four.** So the shell owns 0.09 → 0.97 — **131 mm of the 146 mm face, 90% of the wall** —
 * in three nested sub-slabs of ~44 mm each, and the ONLY cyan in the picture is the barrier
 * plane, which is not a layer and never breaks. The white/teal boundary stops being a three-step
 * fade across 62 mm of teal-tinted layers and becomes one hard material break.
 *
 * ⚠️ The three shell slices are near-equal rather than 69/36/25, so each nested step is the
 * same size and the stack reads as one slab seen in section instead of one thick plate with two
 * shims behind it.
 *
 * 🔴 **ROUND 2 MOVED THE TWO MIDDLE NUMBERS, AND IT IS A COMPOSITION FIX, NOT A TUNING ONE.**
 * The first spread was even-ish (0 / 0.15 / 0.39 / 0.70), which gave the ornate skin and the
 * white body 15% and 24% of the wall — so in a crater whose wall falls from intact to
 * bottomed-out over half a metre, the WHITE RING WAS ABOUT 6 cm WIDE and every band after it
 * arrived at once. Round 1's captures show exactly that: a crisp outer edge and then one dark
 * interior. `dig-barrier-stages.webp` is a **white shell over a teal core**, and a shell is the
 * thick part. Plaster now owns 0.10 → 0.56, i.e. **46% of the wall band and a 69 mm slab**,
 * which is both the reference's proportion and enough in-plane width for the white to be a ring
 * you can see rather than a line at the edge.
 *
 * ⚠️ **THIS CANNOT MOVE THE DIG BAND.** Blows-to-through is a property of `depth`, `OPEN_AT`
 * and the brush (`damagefield.js`), and none of them reads this table — it decides only which
 * layer you are LOOKING at, at a given depth. Re-measured anyway rather than argued.
 *
 * ⚠️ **THE OCCLUSION RULE SURVIVES THIS UNCHANGED, AND THE REASON IS WORTH KEEPING.** It needs
 * the planes to be parallel, of equal extent, all `FrontSide`, and the camera on the front side
 * — under a perspective projection a parallel plane of equal extent at greater depth projects
 * strictly inside the nearer one's quad **at any depth**. Nothing here depends on the gap being
 * small; `walls-perf.md`'s measured saving is untouched.
 */
/**
 * 🔴 **ROUND 7: THE SKIN GOES 13.5 mm -> 30 mm, AND THE THREE SHELL SLICES STAY EQUAL.**
 *
 * Round 6's own third cause: *"the skin is only 13.5 mm, so there is almost no section for that
 * outer boundary to be hard against."* 13.5 mm of a 150 mm face is 2-3 px at any station this
 * scenario can stand at, and it is also the z GAP between the ornate contour and the white one —
 * so the parallax that is supposed to separate them at a graze was a couple of pixels too.
 *
 * `[0.00, 0.20, 0.46, 0.72]` with the back at 0.97 gives 30 / 39 / 39 / 37.5 mm: the skin is
 * doubled and a bit, and the shell's three sub-slabs stay near-equal (round 6's requirement, so
 * the stack reads as one slab in section rather than as a plate with two shims). The shell is
 * 115 mm of the 146 mm face — 79%, against 90% before — and it is still by a long way the thick
 * part of the sandwich, which is John's note.
 *
 * ⚠️ **THIS STILL CANNOT MOVE THE DIG BAND** — re-checked, not argued: blows-to-through is a
 * property of `depth`, `OPEN_AT` and the brush and none of them reads this table. `dig-free.mjs`
 * gates it at 15/15 and was re-run.
 */
export const DAMAGE_DEPTH_F = [0.00, 0.20, 0.46, 0.72];
/** Where the innermost layer's material ends, as a fraction of `thickness`. */
export const DAMAGE_BACK_F = 0.97;

/**
 * 🕳️ **THE DEPTH BANDS — how a continuous 0..1 dig depth drives four nested layers.**
 *
 * In the stage system `applyStageBreaks` handed each layer its own `uBreak`. Here each layer
 * owns a SLICE of the depth axis and reads its threshold per texel out of the damage field
 * (`breakmask.js` `DAMAGE_THRESHOLD`). The slices OVERLAP on purpose: at any depth two adjacent
 * layers are both part-broken, so their torn edges stack and you read plaster edge, then lath
 * edge, then framing — the same layered read, driven positionally.
 *
 * ⚠️ The widths are not equal. Wallpaper is a skin and goes almost at once; the framing is the
 * last third of the wall and is what you are still chewing when the falloff has made every blow
 * feel small. That IS `dig.md` §5's falloff expressed as geometry rather than as a health table,
 * and it is why deleting `DIG_HEALTH` costs nothing.
 *
 * 🔴 **ROUND 6: THIS TABLE WAS THE ATOLL. IT IS NOW ONE TEAR.**
 *
 * Five rounds were spent on WHAT the rings are made of — teal, then flat teal, then unmottled
 * teal, then white — and two independent blind readers still called round 5 *"an aerial photo of
 * a coral atoll"*, the same convergent wrong answer round 3 got. `critic-dig-4`: *"round 5 changed
 * what the rings are made of, but not HOW THE BREAK IS SHAPED, and the shape is what drives the
 * misread… stop touching materials and touch the boundary curve itself."*
 *
 * **The boundary curve is this table, and `damagefield.js` `_smooth()` says so in its own words:**
 * *"because the four layers take their thresholds at four different depths, a depth ramp spread
 * over 40 cm separates their silhouettes into concentric rings."* That was written as a feature.
 * It is the defect. Measured against the real field, on the crater `chunk-thick.mjs` actually
 * digs (`_smooth`'s B channel, sampled bilinearly as the shader samples it):
 *
 *   | contour | round 5 radius | round 6 radius |
 *   |---|---|---|
 *   | ornate skin tears  | 1.134 m | 1.126 m |
 *   | shell outer tears  | 0.890 m | 1.009 m |
 *   | shell middle tears | 0.600 m | 0.970 m |
 *   | shell inner tears  | 0.472 m | 0.931 m |
 *
 * Round 5's four contours are at 1.13 / 0.89 / 0.60 / 0.47 — **four evenly-spaced concentric
 * curves across 66 cm of crater wall**, which is a contour map however it is coloured. Round 6's
 * three shell contours are within **8 cm of each other**, so the white shell tears through in ONE
 * step and what is left is a single ragged boundary with the shell's 8 cm chamfer on it.
 *
 * 🎯 **AND THE SAME EDIT IS WHAT FLOODS THE CYAN.** The cyan is whatever the shell is not, so
 * moving the shell's tear from depth 0.84 out to depth 0.235 takes the fill from **42% of the
 * breach's diameter to 83%** — `critic-dig-4`'s *"it should fill nearly the whole breach and meet
 * the white at one hard boundary, not sit recessed at the bottom of a funnel of rings."* The white
 * stops being a funnel and becomes a **20 cm rim**, which is what the reference has.
 *
 * ⚠️ **THE TEETH WERE ALWAYS THERE AND WERE BEING HIDDEN BY EACH OTHER.** Each boundary's ragged
 * span (where the layer is part-torn, i.e. where the order field decides) is 20-24 cm in all four
 * rows, then and now — `_rrrOrder`'s band-passed residual against the depth gradient. Four such
 * boundaries nested 20 cm apart read as parallel offsets of one curve, which is a topographic map;
 * one boundary with a 23 cm ragged span reads as broken-plaster teeth. **Nothing about the
 * raggedness changed. Only the number of curves did.**
 *
 * ⚠️ **THIS STILL CANNOT MOVE THE DIG BAND** — the clause below is unchanged and was re-checked:
 * blows-to-through is a property of `depth`, `OPEN_AT` and the brush, and none of them reads this
 * table. `dig-free.mjs`'s probe and breakthrough counts both test `localDepth >= 0.999`.
 *
 * 🚨 **AND THE FIRST BUILD OF ROUND 6 PROVED COLLAPSING THE DEPTHS IS ONLY HALF OF IT.** With the
 * three shell contours 8 cm apart the cyan flooded correctly (42% -> 83% of the breach) and the
 * crop got WORSE in the other direction: it read as **a mirror in a moulded frame**. Two causes,
 * both of them "the boundary is still more than one curve":
 *
 *   1. **Three contours 8 cm apart are still three lines.** Nested at 20 cm they read as a
 *      contour map; nested at 8 cm they read as a beading. The number that has to be one is the
 *      number of CURVES, not the distance between them. So the three shell rows are now the
 *      **same band**, and the constructor gives them the same jag, the same jag scale and the
 *      same lip width, which makes their silhouettes bit-identical. Head-on they are one edge;
 *      at a graze the 43 mm z spacing separates them by parallax and THAT is the section —
 *      `critic-dig-4`'s *"thickness comes from AO and foreshortening, not from more layers."*
 *   2. **The skin tore on a DIFFERENT NOISE FIELD from the shell** (`estateSkinMat` supplies the
 *      wallpaper stage's break order; the shell uses the plaster's), so the two curves wandered
 *      independently and had to be kept far enough apart that they never crossed — which is what
 *      forced the narrow bands, and narrow bands are what made the outline a smooth oval. **All
 *      four layers now threshold the SAME field**, so the skin's contour and the shell's are two
 *      level sets of one function: strictly nested, incapable of crossing, and free to be as
 *      ragged as we like. The white rim narrows and widens along the tear and never vanishes.
 *
 * 🎯 **THAT IS WHAT PAYS FOR THE TEETH.** Freed from the no-crossing constraint the bands go wide
 * again — the skin's ragged span 20 -> 39 cm, the shell's 23 -> 49 cm — and tooth depth is
 * (the order field's spread) x (the ragged span), so the teeth roughly double. The oval was never
 * the noise being too smooth; it was the band being too narrow for the noise to move the boundary
 * through.
 */
/**
 * 🎯 **ROUND 11: 58% OF EVERY CELL'S LIFE WAS INVISIBLE, AND THE MEASURED FIGURE IN REAL PLAY IS
 * WORSE THAN THE ARITHMETIC ONE. THE INNERMOST LAYER NOW OWNS THE DEEP HALF OF THE AXIS.**
 *
 * `digparity-1` filed the formal gap: every band above saturated at a smoothed depth of **0.420**
 * while `passable()` needs raw **0.999**, so raw 0.42 -> 1.0 rendered identically — about 60% of
 * the THROUGH clock. It flagged that as a WORST-CASE AIMING MODEL rather than a prediction.
 * **It is not a worst case. Driven, three seeds, with the most flattering plausible aim there is**
 * (`dig-band.mjs`'s own phase-2 rule — every blow at the LEAST-DUG cell in the window a body
 * needs, so the player never swings at a hole they already made), over 144 blows of real THROUGH
 * work and 18 of probing:
 *
 *   | measured on the shipped bands | THROUGH | a probe |
 *   |---|---|---|
 *   | blows where NOTHING within 25 cm of the impact moves as much as 2% of a tear | **62.5%** | 66.7% |
 *   | blows delivering < 10% of a fresh blow's visible work anywhere in the 52 cm brush | **57.6%** | 44.4% |
 *   | blows landing on a texel whose band is ALREADY fully torn | **72.9%** | 66.7% |
 *
 * 🚨 **AND IT LANDS ON JOHN'S OWN CONSTRAINT.** He refused a numeric destruction meter, so the
 * wall itself is the only progress indicator the game has — and it stopped indicating over halfway
 * through. `harness/scenarios/_visible1-gap.mjs` records the drive; `harness/evidence/_visible1-analyse.mjs`
 * prices any candidate band against it offline.
 *
 * ---------------------------------------------------------------------------
 * 🚨 **WHY THE FIX HAD TO BE MATERIAL SURVIVING LONGER, AND NOT ANYTHING ELSE**
 * ---------------------------------------------------------------------------
 * Past a smoothed depth of 0.42 all four layer planes have discarded at that texel, so the ONLY
 * surface left on screen there is `barrierMaterial`'s plane — the cyan, or the wall band's dark
 * interior at an interconnect. **John has settled twice that the cyan must never appear to take
 * damage**, and round 5 deleted three separate modulations of it to earn that. So there is no
 * surface in the last 58% that is allowed to change, and no amount of shading, glow, decal or
 * per-blow evidence can be painted anywhere. **Progress can only read if there is still
 * destructible material at the point of impact** — which means the shell has to survive the
 * front's tear. That is this table.
 *
 * ⚠️ **BANDS 0, 1 AND 2 ARE UNTOUCHED, AND THAT IS WHAT PROTECTS EVERY SCORED RESULT.** The
 * crater's OUTLINE — round 6's one ragged tear, `critic-dig-5`'s closed raggedness, the skin's
 * contour and the 43 mm parallax section between layers 1 and 2 — is a function of bands 0-2 and
 * is bit-identical. What changes is what is INSIDE the crater: a flat, frozen fill becomes the
 * back of the shell being eaten away.
 *
 * 🎯 **[0.420, 1.000] PICKS UP EXACTLY WHERE THE FRONT LEAVES OFF, AND THAT IS THE WHOLE RULE.**
 * Between them the two curves cover the entire depth axis with no gap and no overlap. Because
 * every layer thresholds the SAME break-order field (see the constructor), at a texel with order
 * `o` the front tears at B = 0.05 + 0.37o and the back at B = 0.42 + 0.58o — **strictly nested,
 * provably incapable of crossing at any o**, which is round 6's own guarantee doing exactly the
 * job it was built for. So the inner contour is always inside the outer one and the white rim is
 * never eaten from behind.
 *
 * 📐 **SWEPT, NOT CHOSEN** (`harness/evidence/_visible1-analyse.mjs`, eleven candidate bands priced against
 * the same recorded drive — the bands are a purely visual mapping, so one drive answers for all
 * of them). THROUGH, over 144 blows:
 *
 *   | band 3 | blows dead at the impact point | blind in the brush | cyan fill at the end |
 *   |---|---|---|---|
 *   | [0.05, 0.42] (shipped) | **62.5%** | 57.6% | 96.4% |
 *   | [0.42, 1.00] **taken** | **4.2%** | **18.1%** | **88.2%** |
 *   | [0.36, 1.00] | 4.2% | 19.4% | 89.1% |
 *   | [0.30, 0.85] | 17.4% | 34.0% | 90.9% |
 *   | [0.15, 0.70] | 36.1% | 44.4% | 93.5% |
 *   | [0.05, 0.60] | 46.5% | 50.7% | 95.0% |
 *
 * **The trade is real and it is small.** Deeper bands buy the whole defect back and cost the
 * cyan's diameter at the END of a dig — `critic-dig-4`'s *"it should fill nearly the whole
 * breach"*, which round 6 delivered. Every candidate pays it; [0.42, 1.00] pays **8 points of
 * fill for 58 points of dead blows**, and it is the cheapest point on the curve per point of
 * defect removed. It costs so little because by the time a channel is open the crater's interior
 * has been excavated to raw depth ~0.9 over most of its area anyway — the inner plate is GONE at
 * the end, it is only present while you are working.
 *
 * ⚠️ **THE PROBE'S VISUAL TELL NOW ARRIVES LATER, AND THAT IS THE MODEL GETTING MORE HONEST, NOT
 * A RETUNE.** With the shell tearing at 0.42 a player could read "cyan = dud" after two or three
 * blows, while `dig-band`'s FIND clock prices a probe at the six blows it takes to reach raw
 * 0.999. The inner plate now hides the answer until roughly the same moment the instrument
 * assumes. **No measured number moves**: the band is `depth`, `OPEN_AT` and the brush, and none
 * of them reads this table.
 */
export const DAMAGE_BANDS = [
  // 0 ORNATE SKIN — tears at r 1.13 on the reference crater, ragged over 39 cm
  [0.005, 0.155],
  // 1-2 THE FRONT OF THE WHITE SHELL, AS ONE CURVE. Identical bands on purpose: same band +
  // same field + same jag = bit-identical silhouettes, so the shell's outline is one tear
  // head-on and a 43 mm-per-step parallax section at a graze. Contour r 0.93, ragged over 49 cm.
  [0.050, 0.420],
  [0.050, 0.420],
  // 3 THE BACK OF THE SHELL — THE DEEP HALF. See the header: it picks up the axis exactly where
  // the front finishes, so every blow past the front's tear still takes material away at the
  // point of impact and the cyan is revealed progressively instead of all at once.
  [0.420, 1.000],
];

/**
 * 🎨 **PER-BAND ALBEDO — round 2's headline, and the thing round 1 was missing.**
 *
 * `critic-dig-1` cropped a hole out of context and could not identify it as a hole in a wall:
 * *"it's being asked to imply depth through blur alone, which can't work without per-layer
 * albedo. The real fix is giving each depth band a distinct colour."* Round 1 built real
 * thickness, a ray-marched cut face and gradient normals — correct groundwork with **nothing to
 * reveal**, because all four bands were shaded with the same mid grey (`breakmask.js` shipped one
 * `uCutColor` and one `uLipColor` for every layer, and `BREAK_CFG` never overrode either). So a
 * hole came out as one continuous hue: the wall's own colour, lightened.
 *
 * John's art solves thickness as a COLOUR problem. `dig-gallery-sledge-crew.webp`: a crisp jagged
 * **white** plaster rim directly against a **saturated flat teal** fill. `dig-barrier-stages.webp`
 * shows why — the wall is a literal sandwich, white shell over teal structural core. Three
 * materials that look nothing like one another, not one surface getting lighter with depth:
 *
 *   band 0  ORNATE     the estate's own boiserie, untinted — it IS the room's wall
 *   band 1  WHITE      the paneling body. "White chunks fall off when hit with the hammer."
 *   band 2  WHITE      the same shell, deeper — less of the room reaches it
 *   band 3  WHITE      the back of the shell, and the last thing before the cyan
 *
 * 🔴 **ROUND 5: THERE IS NO TEAL IN THIS TABLE ANY MORE, AND THAT IS THE POINT.** Bands 2 and 3
 * were teal LAYER PLANES — teal with a lip, a cut face, an arris, a mottle and a break
 * silhouette, i.e. **cyan that visibly erodes**. John, after playing round 4: *"the cyan barrier
 * is supposed to feel indestructible and instead it seems to visually take damage just like the
 * white layer."* It was: 44% of the wall band was destructible cyan. The only cyan left in the
 * whole system is `barrierMaterial`'s plane, which has no break state at all.
 *
 * ⚠️ **BAND 0 IS DELIBERATELY NOT TINTED, AND ITS RIM IS.** Tinting the ornate skin would undo
 * `estateSkinMat` and put a dig-face-only material back on the wall, which is the tell John asked
 * to have removed. What carries the reference's loudest cue instead is band 0's LIP and CUT
 * COLOUR: break the painted skin and the white body under it is what you see at the rim, which is
 * exactly the *"crisp jagged white plaster rim"* — one ring, at the outermost edge, against dark
 * ornate wall on one side and the cavity on the other.
 *
 * ⚠️ **THIS TABLE IS REACHABLE ONLY FROM A DAMAGE-ARMED FACE.** It is applied beside
 * `BREAK_CFG` in the `this.field` arm of the constructor, so `wall.sheet` PASS 78, `wall.*`,
 * `mat.*`, the four studio stage views and `wallinstances.js`'s shared copies never see it and
 * every default in `breakmask.js` stays inert (`bandTint` 0 leaves the baked albedo alone).
 *
 * ⚠️ **AND IT COSTS NO BAKE.** Re-colouring through the material options would key a new bake
 * per layer — three more 1024/2048 render-to-textures inside a loading screen that `boot-1` has
 * already measured at 1,054 shader-program compiles. This is four uniforms on programs that
 * already exist.
 */
/**
 * 🚨 **ROUND 4, DEFECT 2: THE CUT FACE WAS ALWAYS THERE. THE SILHOUETTE WAS SHREDDING IT.**
 *
 * `critic-dig-3` found no slab edge in any of the three grazing frames and told the next round
 * to fix the thing rather than quote the number again. **The thing was not the march.** Painting
 * band 1's `uCutColor` magenta live in the page and re-shooting the station puts the cut face on
 * screen immediately — it renders, at the right place, at the geometrically correct 69 mm — but
 * it arrives as **a comb of magenta slivers a few pixels wide**, not as a band.
 *
 * The cause is `BREAK_CFG`'s `jagScale`, and it is a scale mismatch rather than a bug:
 *
 *   `jagScale` is in cells across the FACE UV, so band 1's [110, 110] is a 5.2 cm feature on a
 *   5.72 m face — and `_rrrOrder`'s own octaves sit at 0.85 and 0.30 of it, i.e. 6 cm and 17 cm.
 *   **The slab is 69 mm thick.** So the break edge wanders in and out by more than the wall's own
 *   thickness over less than its own thickness of travel, and the section that should be a
 *   continuous 20 px ribbon along the rim is interdigitated into fingers narrower than they are
 *   long. Measured on the delivered image: median section run **5 px** at 1.1 m.
 *
 * ⚠️ **AND IT IS HALF OF DEFECT 1 AS WELL.** A boundary that is fractal at 5 cm, between a pale
 * field and a teal one, is a COASTLINE — it is the specific edge quality that made three of four
 * blind readers say *"lagoon"*. Every hole in `refs/_sheets/dig.png` breaks in big angular
 * chunks 20-50 cm across with crumble ON them, which is what a plaster slab does: it snaps in
 * plates and crumbles at the arris, it does not erode into filigree.
 *
 * So a damage-armed face runs its jag at a scale COARSER than the slab is thick — 17 cm chunks
 * with 6 cm crumble on band 1, rather than 5 cm chunks with 2 cm crumble — and the scale is
 * ANISOTROPIC IN UV to be ISOTROPIC IN METRES (the face is 5.72 x 2.80, so y gets 0.49 of x;
 * the old square values were quietly 2:1 finer vertically than horizontally).
 *
 * ⚠️ **`BREAK_CFG` ITSELF IS NOT TOUCHED, WHICH IS WHY THIS IS SAFE.** These override it by
 * being spread AFTER it, inside the `this.field` arm only, so `wall.sheet` PASS 78, the four
 * studio stage views and `wallinstances.js`'s shared copies keep the 5 cm fringe they were
 * scored with. Bands 2 and 3 lose the LATH and FRAMING anisotropy ([200, 30] and [55, 150])
 * for the same reason round 3 took their bakes away: there is no lath in this wall to splinter
 * along, and a stripe-shaped tear in the cyan is the corrugation arriving through a third door.
 */
/**
 * 💡 **ROUND 6 ADDS ONE FIELD TO EVERY ROW: `glow`** — `breakmask.js` `uGlow`, the cyan bounce
 * the breach throws onto the white around it. `critic-dig-4` tabulated the reference's edge in
 * three rows and this is the one we scored nothing on: *"a soft cyan-tinted glow bleeding onto
 * the adjacent white — ours: none."*
 *
 * The skin's is about half the shell's: the boiserie is further from the slab and it is the
 * estate's own material, so it takes a hint of the light rather than a wash of it. All four are
 * a small fraction of `barrierMaterial`'s own emissive, which is what a bounce is.
 */
export const DIG_BAND_LOOK = [
  {
    // 0 ORNATE — the room's own boiserie. Untinted; the white body shows at the break.
    bandTint: 0,
    /**
     * 🔴 **ROUND 6: THE SKIN TEARS WITH THE SHELL'S NUMBERS, NOT ITS OWN, AND THAT IS THE
     * NO-CROSSING GUARANTEE.** With jag 0.085 at [44, 22] against the shell's 0.115 at [34, 17]
     * — and, worse, against a different break-order TEXTURE — the boiserie's contour and the
     * white's were two independent random curves. They crossed, so the white rim vanished
     * wherever the skin's tear happened to run inside the shell's, and the only defence was to
     * hold their bands far apart, which is what forced the narrow bands that made the outline an
     * oval. Identical jag, identical scale, identical field: the two contours are level sets of
     * ONE function and cannot cross, at any band width.
     */
    jag: 0.135, jagScale: [34, 17], lipWidth: 0.062,
    lipColor: [0.855, 0.845, 0.815],
    cutColor: [0.880, 0.870, 0.840],
    cutDark: 0.22,
    glow: [0.0020, 0.0290, 0.0375],
  },
  {
    // 1 WHITE PANELING. The debris already agrees: `debris.js` paints a plaster chunk
    // 0xece7dc over 0x9c9184, so the chunks that fly are white while the hole they came out
    // of was brown — visible side by side in round 1's own `thick-3-hole-headon`. Same family
    // now, which is what makes a falling piece read as the piece that left.
    //
    // 🔴 **ROUND 3, RANK 3: THE SHELL READ AS FLAT TORN PAPER AND THE CUT COLOUR IS WHY.**
    // `critic-dig-2`: *"the reference shows real cross-sectional depth at the break edge; ours
    // has crack linework painted flat with zero implied thickness."* The cut face was 0.900
    // against a band of 0.940 with `cutDark` 0.24 — a 4% value step, i.e. the 69 mm slab that
    // `DAMAGE_DEPTH_F` genuinely gives this layer was being SHADED as if it were paper. It is
    // the one band where the section has to be visible, because it is the thick part of the
    // sandwich and it is what the white rim is a rim OF. A darker, slightly cooler cut plus a
    // harder depth falloff turns the marched face into a legible grey section band.
    // ⚠️ The rim itself is UNCHANGED (`lipColor` 0.950): the reference's loudest cue is a crisp
    // jagged WHITE edge, and the section has to be darker than that edge, not instead of it.
    // ⚠️ TINT 0.90 -> 0.95 AND DETAIL 0.86 -> 0.74, and it is a legibility fix rather than a
    // taste one: at 0.90 a tenth of `plasterMat`'s albedo survived, and the loudest thing in it
    // is `uPaperRemnant` — brown 0.430/0.335/0.255 patches of stuck-on wallpaper. Against a
    // near-white band those read as dirty tan blotches all over the shell, which is not the
    // reference's clean white plaster and muddies the one hard material break in the picture.
    // The trowel work, the crazing and the hairline cracks all survive at 0.74 detail.
    bandTint: 0.95,
    // 🔴 ROUND 4, a carried correction: `critic-dig-3` measured the residual dark vertical line
    // in the top of the shell and traced it to this layer's own crack linework rather than to
    // batten geometry — *"a minor decal/crack artefact, and it is yours"*. It is the bake's
    // darkest strokes surviving the tint: at base 0.58 a black crack lands 40% below the
    // surrounding shell. Lifting the floor and shortening the swing keeps the trowel work and
    // the crazing and takes about a third out of the deepest stroke.
    bandBase: 0.68, bandDetail: 0.60,
    // see the header: 17 cm chunks with 6 cm crumble, so the 69 mm section has straight runs to
    // be visible along instead of being combed into slivers
    // ⚠️ ROUND 6: these three numbers are IDENTICAL on bands 1, 2 and 3 and must stay that way —
    // together with the shared band and the shared break field they are what makes the three
    // shell silhouettes bit-identical, which is the whole of "one tear, not three rings".
    jag: 0.135, jagScale: [34, 17], lipWidth: 0.062,
    /**
     * 🔴 **ROUND 6, THE SECOND LOOK: THE SECTION WAS A SAWTOOTH, AND A SAWTOOTH IS A BEACH.**
     *
     * With the three shell silhouettes made identical, the section stopped being three rings in
     * plan and became three bands separated only by PARALLAX at a grazing angle — 43 mm of z per
     * step, about 13 cm on screen at 18 degrees. That is the section this round wanted. But the
     * VALUES still restarted at every plane: each layer's cut face ramped from its own face
     * value down through `cutDark`, then the next layer's face came back UP to near-white. Three
     * light-to-dark ramps in a row is a terraced shore, and cropped with no context the delivered
     * frame read as **a lagoon with a salt flat around it** — the same wrong answer, arrived at
     * through a different door.
     *
     * ⚠️ **SO THE THREE ROWS ARE NOW ONE MONOTONE RAMP INTO THE WALL.** Each layer's cut face
     * ends where the next layer's face begins, so the whole 132 mm of shell reads as ONE
     * cross-section getting darker with depth, from a bright face (0.94) to near-black (0.12) at
     * the very back — which is the last thing before the cyan and is therefore the **dark contact
     * line the reference has and we had none of**. `critic-dig-4` asked for the white's thickness
     * to come from AO; this is that AO, and it is the only place in the picture the shell is
     * allowed to be dark.
     *
     * ⚠️ **IT IS NOT A CONTACT SHADOW ON THE CYAN.** John, after round 4: the cyan *"seems to
     * visually take damage."* Nothing here touches `barrierMaterial` — the darkening is the white
     * shell's own cut face shading itself, on this side of the material break, and the cyan is
     * still one constant value over every pixel at every stage of every dig.
     *
     * The numbers are solved, not dialled: the shader renders a cut face at
     * `(0.1*band + 0.9*cutColor) * (1 - cutDark*(0.30 + 0.70*_cut))`, so `cutColor` and `cutDark`
     * per layer are the pair that makes layer N's END value equal layer N+1's START value.
     * Chain: 0.62 -> 0.45 -> 0.28 -> 0.12.
     */
    bandColor: [0.940, 0.932, 0.912],
    bandEmissive: [0.090, 0.088, 0.084],
    lipColor: [0.950, 0.944, 0.925],
    cutColor: [0.666, 0.652, 0.628],
    cutDark: 0.350,
    // see DIG_BAND_LOOK's header: the breach's bounce, strongest on the shell that frames it
    glow: [0.0040, 0.0560, 0.0720],
  },
  /**
   * 🔴 **ROUND 5: BANDS 2 AND 3 ARE THE SHELL, NOT THE CORE. THEY ARE WHITE.**
   *
   * Rounds 3 and 4 both worked on making these two teal layers read as *one flat teal slab*, and
   * the work was good and aimed at the wrong object. **A layer plane is destructible by
   * definition** — it carries a break silhouette, a lip, an arris and a marched cut face, all of
   * which advance as the player digs — so any teal drawn on one is teal that visibly comes apart
   * under the hammer. That is exactly what John reported after playing round 4, and no amount of
   * flatness fixes it, because the defect is not the surface's texture: it is that the surface
   * has a break state at all.
   *
   * ⚠️ **AND IT IS THE SAME FIX AS THE SHELL'S THICKNESS**, which is why one edit closes two of
   * John's three notes. With bands 2 and 3 teal, the white owned 0.09 → 0.38 of the wall and the
   * teal owned 0.38 → 0.97; the white shell was 29% of the face and the cyan-coloured material
   * was 59% of it. Handing 2 and 3 to the shell makes the white **131 mm of a 146 mm face**, in
   * three nested slabs whose torn edges stack into a section you can see at a grazing angle.
   *
   * ⚠️ **THE THREE ARE ALMOST THE SAME COLOUR AND THAT IS THE POINT.** They are three depths of
   * one material; `DAMAGE_BANDS` nests their silhouettes and the small value step between them
   * is what reads as depth. A cavity is unlit, so the step is the room's light failing to reach
   * further in — not a different material.
   *
   * ⚠️ **`slabMottle` IS 0 ON EVERY BAND NOW.** It was added in round 4 to stop a flat bright
   * teal field reading as water. There is no flat teal field on a layer plane any more, and on
   * white it would be dirt on fresh-broken plaster. The barrier's twin (`uBMottle`) is gone for
   * the harder reason — see `breakmask.js`.
   */
  {
    // 2 WHITE SHELL, middle. The same plaster bake and the same plaster break field as band 1
    // (see the constructor), one value step deeper into the cavity.
    bandTint: 0.95,
    bandBase: 0.64, bandDetail: 0.60,
    // ⚠️ IDENTICAL to band 1 — see there. Not "in step with"; the same.
    jag: 0.135, jagScale: [34, 17], lipWidth: 0.062,
    /**
     * 🔴 **ROUND 6: THIS PLANE IS NO LONGER A SECOND WHITE FACE. IT IS THE MIDDLE OF ONE
     * CROSS-SECTION** — see band 1's note on the sawtooth. Its silhouette is bit-identical to
     * band 1's, so it is NEVER seen head-on; the only thing that ever shows of it is the sliver
     * parallax opens at a grazing angle, and that sliver has to continue band 1's cut face
     * rather than restart it at near-white. 0.450 IS where band 1's cut ended.
     */
    bandColor: [0.450, 0.444, 0.432],
    bandEmissive: [0.034, 0.033, 0.031],
    lipColor: [0.470, 0.464, 0.452],
    /**
     * ⚠️ **THE INNER STEPS ARE STEPS, NOT TRENCHES, AND THAT IS WHAT KEEPS THE STACK READING AS
     * ONE SLAB.** `uRimDark` defaults to 0.58 — the undercut that gives a broken SHEET its
     * thickness, and exactly right on band 0/1, which are the outer edge of the wall against the
     * room. Applied at full strength to two more nested rings it draws three dark concentric
     * bands in a crater, which reads as a contour map rather than as a section. Bands 2 and 3
     * are interior faces of the same 131 mm slab, lit by less of the room the deeper they are,
     * so they step DOWN IN VALUE and are not separately trenched.
     */
    rimDark: 0.34,
    // ⚠️ `rimDark` and `cutDark` do two different jobs and only one of them was the contour-map
    // problem. `rimDark` is the TRENCH under the overhanging sliver; three of those in a crater
    // is a topographic map. `cutDark` is the SECTION'S OWN VALUE, and it has to stay a clear
    // step below the face it belongs to or the slab has no visible cross-section — measured:
    // softening both together took `sectionWidth()`'s median band 14 px -> 3 px in one run.
    cutColor: [0.477, 0.468, 0.452],
    cutDark: 0.465,
    glow: [0.0044, 0.0610, 0.0785],
  },
  {
    // 3 WHITE SHELL, inner — the back of the slab. This is the material the cyan is directly
    // behind, so its cut face is the hard white edge the reference puts against the teal fill.
    bandTint: 0.95,
    bandBase: 0.60, bandDetail: 0.60,
    // ⚠️ IDENTICAL to bands 1 and 2 — see band 1.
    jag: 0.135, jagScale: [34, 17], lipWidth: 0.062,
    /**
     * 🔴 **ROUND 6: THE BACK OF THE SHELL IS THE DARK CONTACT LINE.** It is the last material
     * before the cyan and it is 132 mm inside a cavity, so almost none of the room reaches it.
     * Its cut face ends at 0.12 — near black — and that dark edge directly against the flat
     * saturated fill is the cue `critic-dig-4` tabulated as present in the reference and absent
     * in ours. Without it the white runs straight into the cyan with nothing between them, which
     * is exactly how a shoreline meets water.
     *
     * 🚨 **ROUND 11: THAT IS STILL TRUE OF THE CUT FACE AND IS NOW FALSE OF THE BAND COLOUR, AND
     * THE REASON IS A PREMISE THIS ROW WROTE DOWN AND ROUND 11 FALSIFIED.** Round 6's own note:
     * *"its silhouette is bit-identical to band 1's, so it is NEVER seen head-on; the only thing
     * that ever shows of it is the sliver parallax opens at a grazing angle."* With the deep band
     * (see `DAMAGE_BANDS`) this plane is the **FLOOR OF THE CRATER for most of a dig** — the
     * largest single surface in the frame at every station between the front's tear and the
     * breakthrough. 0.280 was chosen for a sliver; head-on it photographed as a flat mid-grey
     * ring between the white rim and the fill, i.e. THREE concentric values, which is the contour
     * map round 6 spent itself deleting.
     *
     * 🎯 **SO THE INNER FACE JOINS THE SHELL AND THE RING GOES.** At 0.780 against band 1's 0.940
     * the two white faces read as ONE material with the front's tear as a value step in it rather
     * than as a boundary between two materials — so what the player sees is a single white field
     * with a hole in it, and **the width of the surviving white IS the remaining thickness of the
     * wall.** That is the progress read this round exists for, and it is the reference's own
     * stack: `dig-barrier-stages.webp` shows white facing, then teal core.
     *
     * ⚠️ **THE CUT FACE AND THE CONTACT LINE ARE NOT TOUCHED.** `cutColor` 0.286 / `cutDark` 0.672
     * still end this slab at 0.094, so round 6's monotone section ramp (0.62 -> 0.45 -> 0.28 ->
     * 0.12) and the dark line directly against the cyan are exactly as they were. The step at the
     * arris between a 0.78 face and a 0.23 cut is larger than it was, which is what the edge of a
     * slab lying 105 mm inside an unlit cavity actually looks like.
     *
     * ⚠️ **AND THE EMISSIVE HAS TO COME WITH IT** — see `breakmask.js` `uBandEmissive`: a cavity
     * is unlit, so an albedo lift alone comes back as the same grey. It stays a step under band
     * 1's 0.090 because this plane is 105 mm further in.
     */
    bandColor: [0.780, 0.772, 0.752],
    bandEmissive: [0.062, 0.061, 0.058],
    lipColor: [0.800, 0.792, 0.772],
    // see band 2's note on rimDark vs cutDark
    rimDark: 0.26,
    cutColor: [0.286, 0.281, 0.272],
    cutDark: 0.672,
    // the innermost slab is the one directly against the cyan, so it takes the most bounce
    glow: [0.0048, 0.0670, 0.0860],
  },
];

/**
 * 🧱 **THE SECTION'S MINIMUM WIDTH ON SCREEN — `[pixels, max raise as a multiple of `uCutSoft`]`.**
 * `breakmask.js` `uSecFloor` carries the arithmetic and both of the ways it can be got wrong.
 *
 * Exported and swept live rather than typed: it is a UNIFORM on a shader that emits identical
 * GLSL at every value, so `harness/scenarios/_th1-section.mjs` prices every candidate on ONE
 * crater from ONE camera in ONE frozen page — `dig.md`'s own reusable trick, the same one
 * `visible-1` used on `DAMAGE_BANDS`. `[0, 0]` is the pre-round-12 build, live, in the page.
 *
 * 📐 **SWEPT, NOT CHOSEN.** One gallery dud at 44 blows, the breach's own projected rect, five
 * arms and a same-config control in one held page — **floor |Δmean| 0.000 px, |Δfill| 0.000 pp**:
 *
 *   | `[px, cap]` | section width, median / mean px | cyan fill | the cyan core band |
 *   |---|---|---|---|
 *   | `[0, 0]` shipped | **1 / 2.85** | 28.19% | 1.35% |
 *   | `[4, 4]` | 1 / 2.58 | 28.19% | 1.43% |
 *   | `[5, 6]` | 1 / 2.87 | 28.15% | 1.53% |
 *   | **`[6, 10]` taken** | **2 / 3.19** | **28.14%** | **1.67%** |
 *   | `[8, 20]` | 2 / 3.43 | 27.72% | 2.11% |
 *
 * 🎯 **`[8, 20]` MEASURES BEST AND IS REJECTED ON THE PICTURE**, which is the only place the
 * difference lives: at 6x it starts throwing DETACHED dark-teal blotches out into the fill,
 * because a bigger cap lets a plate wall's spike keep material well inside the crater. `[6, 10]`
 * is the largest arm whose section is continuous along the edge and absent from the middle.
 * ⚠️ **AND THE FILL IS FREE AT THIS ARM — 28.19% -> 28.14%, inside a 0.000 floor at 2 dp.**
 * `[8, 20]` is where it starts to cost (−0.47 pp), so the trade `visible-1` had to make is not
 * being made again here.
 */
export const SEC_FLOOR = [6.0, 10.0];

/**
 * Which debris a blow at this depth throws. Biased hard toward PLASTER, because John's sentence
 * is *"white chucks fall off when hit with the hammer"* and `refs/_sheets/dig.png` is white
 * rubble; the stage system's `STAGE_DEBRIS` spends its first two entries on paper, which would
 * make the first third of every dig read as torn wallpaper.
 *
 * 🔴 **ROUND 3: NO PAPER, NO LATH, NO TIMBER — AND IT IS THE SAME CORRECTION AS THE CYAN'S.**
 * `critic-dig-2`'s minor defect was two shapes breaking an otherwise-good rubble language up
 * close: *"a twisted ribbon, a flat wood-chip shard."* Those are `paperChunk` (a curled two-layer
 * scrap of DAMASK WALLPAPER, a material the dig face has not worn since its skin became the
 * estate's own boiserie) and `lathChunk` (a 300 x 20 x 45 mm splinter). Both were describing a
 * wall section the free-form dig no longer has: with bands 2 and 3 drawn as one flat teal slab,
 * there is no lath and no framing in this wall to splinter off it.
 *
 * ⚠️ **`STAGE_DEBRIS` AND THE KINDS THEMSELVES ARE UNTOUCHED.** A shipped BREACHABLE panel in a
 * `?dig=0` house still throws paper, lath and timber through `panel.debrisKind` — that wall
 * really is papered lath and plaster. This is the free-form dig's table only.
 *
 * 🔴 **ROUND 4: NO TEAL DEBRIS EITHER, AND THIS ONE IS A CANON FIX RATHER THAN A LOOK FIX.**
 * `critic-dig-3` asked *"whether a teal debris kind should exist at all when the reference never
 * shows one"*. It should not, and the art says so in words: `refs/dig/dig-iso-annotated.webp`
 * labels the white **"DESTRUCTIBLE WHITE PANELING"** and the cyan **"INDESTRUCTIBLE CYAN
 * STRUCTURE"**, three times in one image. A chip of the structure lying on the floor is a claim
 * that you broke the thing the whole mechanic exists because you cannot break — and in
 * `thick-9`/`thick-11` it photographed as a scatter of dark green wedges through the white
 * rubble, the one material in the pile that has no business being there.
 *
 * 🔴 **ROUND 5: `DEBRIS_KINDS.core` IS DELETED, NOT MERELY UNREFERENCED.** Round 4 stopped
 * calling for it and left it in "in case a hunter breach ever wants to shed structure". It
 * cannot: the canon this table is derived from is that the structure does not come apart, so a
 * chip of it is a claim no future slice is allowed to make either. Keeping a teal debris kind
 * alive was keeping the fastest fake-tell in the piece one line of code away.
 *
 * ⚠️ The threshold moves 0.56 → 0.38 with `DAMAGE_DEPTH_F[2]`. Both sides of it are white; it
 * only decides whether the wall pays out chalky LUMPS (the skin and the front of the shell) or
 * PLATES (the shell's body, which is where a slab comes off in section).
 */
/** Hermite ramp, the GLSL one. Used by the debris spawn call to order slab size against depth. */
function _smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function debrisKindForDepth(d) {
  if (d < 0.38) return 'plaster';   // the ornate skin and the front of the shell: chalky lumps
  return 'slab';                    // the body of the shell comes away in plates
}

/**
 * The reveal box, as geometry. EXPORTED so `wallinstances.js` can author the identical
 * geometry for its instanced copy — if the two ever diverge, the instanced pristine panel
 * stops being a pixel-for-pixel substitute for the per-panel one and the ablation that
 * proves it stops meaning anything.
 */
export function revealGeometry(width, height, thickness, apertures = null) {
  const parts = [];
  const rim = ([w, h, x, y]) => {
    const g = new THREE.BoxGeometry(Math.max(w, 0.03), Math.max(h, 0.03), thickness);
    g.translate(x, y, -thickness / 2);
    parts.push(g);
  };
  for (const r of [
    [0.03, height, -width / 2, 0], [0.03, height, width / 2, 0],
    [width, 0.03, 0, -height / 2], [width, 0.03, 0, height / 2],
  ]) rim(r);
  /**
   * 🚪 **A DOORWAY IS LINED TOO — jambs and a head, the same 0.03 m return the outer rim gets.**
   *
   * Optional and absent on every caller that does not pass it, so the shipped geometry is
   * byte-identical. It costs no draw call: this is merged into the ONE `InstancedMesh` (or the
   * one panel mesh) the reveal already is, and `walls-perf.md`'s finding is that detail inside a
   * merged bin is free. ⚠️ **The sill is deliberately not emitted at `v0 <= 0`** — a doorway on
   * the floor has no threshold to line, and a box there would stand 3 cm proud of the floor in
   * the one place a body walks.
   */
  for (const a of apertures ?? []) {
    const x0 = (a.u0 - 0.5) * width, x1 = (a.u1 - 0.5) * width;
    const y0 = (a.v0 - 0.5) * height, y1 = (a.v1 - 0.5) * height;
    const w = x1 - x0, h = y1 - y0;
    if (w <= 1e-4 || h <= 1e-4) continue;
    rim([0.03, h, x0, (y0 + y1) / 2]);
    rim([0.03, h, x1, (y0 + y1) / 2]);
    if (a.v1 < 1 - 1e-6) rim([w, 0.03, (x0 + x1) / 2, y1]);
    if (a.v0 > 1e-6) rim([w, 0.03, (x0 + x1) / 2, y0]);
  }
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

/**
 * 🚪 **A FACE PLANE WITH ITS DOORWAYS CUT OUT — what a PRISTINE slab has to be.**
 *
 * A damaged face discards its apertures for free (the grid says `depth = 1` and every layer
 * threshold is past), but a pristine one is drawn by `wallinstances.js` out of a shared
 * `PlaneGeometry` with the break pinned at 0 and **no damage texture at all**, so the hole has to
 * be in the geometry or the doorway is a solid wall until somebody swings at it.
 *
 * ⚠️ **THE UVs ARE REWRITTEN TO THE WHOLE FACE, NOT LEFT AS EACH SUB-PLANE'S OWN 0..1.** Every
 * material this plane can wear samples its albedo, normal and break-order maps through `uv`, so
 * sub-planes carrying their own 0..1 would tile the wall's material once per piece — a seam at
 * every doorway, in a slice whose entire point is *"one single destructive wall without any
 * seams"*.
 *
 * ⚠️ Returns the plain `PlaneGeometry` when there is nothing to cut, so the default arm is the
 * same object graph it always was.
 */
export function facePlaneGeometry(width, height, apertures = null) {
  if (!apertures?.length) return new THREE.PlaneGeometry(width, height, 1, 1);
  const xs = [0, 1];
  for (const a of apertures) { xs.push(a.u0, a.u1); }
  xs.sort((p, q) => p - q);
  const parts = [];
  const quad = (u0, u1, v0, v1) => {
    const w = (u1 - u0) * width, h = (v1 - v0) * height;
    if (w <= 1e-5 || h <= 1e-5) return;
    const g = new THREE.PlaneGeometry(w, h, 1, 1);
    g.translate((u0 + u1) / 2 * width - width / 2, (v0 + v1) / 2 * height - height / 2, 0);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, pos.getX(i) / width + 0.5, pos.getY(i) / height + 0.5);
    }
    parts.push(g);
  };
  for (let k = 0; k + 1 < xs.length; k++) {
    const u0 = xs[k], u1 = xs[k + 1];
    if (u1 - u0 <= 1e-9) continue;
    const mid = (u0 + u1) / 2;
    const hit = apertures.find((a) => mid > a.u0 && mid < a.u1);
    if (!hit) { quad(u0, u1, 0, 1); continue; }
    quad(u0, u1, 0, hit.v0);
    quad(u0, u1, hit.v1, 1);
  }
  if (!parts.length) parts.push(new THREE.PlaneGeometry(width, height, 1, 1));
  const merged = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  return merged;
}

const _UP = new THREE.Vector3(0, 1, 0);

/**
 * `solidBoxes()` is called from `room.js`'s per-frame collision loop, so the ordinary-panel path
 * must not allocate an array on every call. One shared single-element array, refilled — the
 * caller reads it and drops it inside the same loop iteration, exactly as `room.js` already does
 * with its own `_boxes` scratch list.
 */
const _NONE = [];
const _ONE_BUF = [null];
function _ONE(b) { _ONE_BUF[0] = b; return _ONE_BUF; }

// ---------------------------------------------------------------------------
// 🎨 THE COAT — "FROM INSIDE THE ROOM THE DESTRUCTIVE WALL *IS* THE ROOM ASSET"
// ---------------------------------------------------------------------------
/**
 * John, on the whole feature: *"from the inside of the room the destructive wall IS the room
 * asset — only when they damage it can they see its white underneath."*
 *
 * 🚨 **THAT WAS TRUE IN 2 OF 6 ROOMS AND IT IS MEASURED, NOT ASSERTED.** `estateSkinMat()` builds
 * ONE hardcoded `boiserieMat({paint:[0.300,0.258,0.212], grime:0.9})`, which is `room.js:3159`'s
 * `mats.wall` — i.e. the SERVICE passage's and the CHAPEL's wall and nobody else's. Since
 * `?estate=port` landed, the gallery's wall is `ws.paper`, the ballroom's is a different
 * `est-bois` and both studies' are `walnut`. `coatbake-1` read it off the built scene:
 * **20 of 28 damage-armed faces wore a coat that is not their room's wall.**
 *
 * 📉 **THE PRICE OF FIXING IT, MEASURED (`harness/scenarios/_coat1-programs.mjs`, seed s4, five
 * runs, every delta identical):**
 *
 *   | shape                                             | programs | bakes | VRAM |
 *   |---------------------------------------------------|----------|-------|------|
 *   | one class, per-room TEXTURES (A1, 4/4 room bakes)  | **+0**   | **+0**| **0.00 MB** |
 *   | `estateSkinMat(roomOpts)` (A3)                     | **+0**   | +0    | 0.00 MB |
 *   | each room's own MAKER function (A2)                | **+1**   | +0    | 0.00 MB |
 *
 * 🎯 **AND THE SURPRISE IS WHICH ONE COSTS.** `walnutPanel` is a completely different surface
 * shader from `boiserieMat` and costs **nothing**, because a surface shader runs at BAKE time and
 * never at draw time — `baker().standard()` wires every bake into the same five texture slots, so
 * a room's skin is a UNIFORM. What splits a program is the material CLASS, and exactly one room
 * differs: `wallpaperMat` returns a `MeshStandardMaterial` while `boiserieMat` (clearcoat 0.25)
 * and `walnutPanel` (0.55) both return `MeshPhysicalMaterial`.
 *
 * ⚠️ **`getParameters` sets `clearcoat: material.clearcoat > 0`, so the boundary is clearcoat
 * PRESENCE and not its value** — 0.02 and 0.55 are one program, 0.00 is another (arm A4 +0,
 * control C7 +1). That is the whole reason arm 1 exists.
 *
 * 🚫 **DO NOT REACH FOR A CACHE KEY IN HERE.** `patchForScreenAO` ASSIGNS
 * `customProgramCacheKey = () => 'rrr-ssao-v1'` over every standard material and `pinProgramKey`
 * composes onto it, so all 28 coats already share `rrr-wall|dig|rrr-ssao-v1`. Measured both ways:
 * a unique key is +1 (C1), and an IDENTICAL key with a different class is still +1 (C3) — because
 * `shaderID` is hashed three fields ahead of the custom key. A key can neither separate these nor
 * merge them, and a per-panel key is `progkey-1`'s 1077-program defect by another name. If a coat
 * ever needs to emit different SOURCE, the discriminator goes in `material.defines` (C2: +1).
 */
export const COAT_ARMS = [
  { id: 0, tag: 'SHIPPED', name: 'one boiserie coat on every face — unchanged' },
  { id: 1, tag: 'PER-ROOM', name: 'the room\'s own skin · gallery joins the family (clearcoat 0.02)' },
  { id: 2, tag: 'PER-ROOM+', name: 'the room\'s own skin · gallery matches its paper exactly' },
];

/**
 * ⚠️ **ARM 0 IS THE SHIPPED BUILD AND IT IS UNCHANGED BY CONSTRUCTION, NOT BY INSPECTION.**
 * `recoat()` early-outs when the requested arm is the one already applied, and every panel is
 * constructed at arm 0 — so on the default arm this whole block executes `if (0 === 0) return`
 * once per damage-armed face and touches nothing. `_coat1-programs.mjs` measures it.
 *
 * Read once and guarded for node: `harness/evidence/_ap3-build.mjs` builds the whole mansion headless and
 * imports this file outside a browser.
 */
/**
 * 🎨 **ARM 1 IS THE DEFAULT SINCE 2026-08-12 — John's call, and it also closes a defect he
 * reported as a separate bug.**
 *
 *   *"The asset for the skin just looks like the ornate wallpaper and it disappears from the whole
 *   slab when I shoot it with the nail gun. The skin is supposed to look like the assets from the
 *   rooms we created."*
 *
 * Both halves of that sentence are arm 0. **The wallpaper** is `wall.pristine.face`, the single
 * damask stage every untouched dig face was drawn from — `pristine-1` measured **0 of 28** faces
 * wearing their own room's skin on arm 0, and 28 of 28 on arms 1/2. **The disappearing** is the
 * same fact seen from the other side: on arm 0 the first hit demotes the face out of the instanced
 * set and swaps damask for `estateSkinMat()`, so the whole slab changes surface in one frame.
 * `mortar-1` measured that swap directly — **44 222 px>16 on `?coat=0` against 29 on `?coat=1`**,
 * because `coat-1` + `pristine-1` made the pristine and damaged surfaces the SAME material. On
 * arm 1 there is nothing to pop.
 *
 * ⚠️ **Price, measured: +6 shader programs (231 → 237) and +5 draw calls (423 → 428 of 625).**
 * 🚨 **DO NOT QUOTE THIS AS "+0 PROGRAMS" — that conflates two agents' numbers and I did it once
 * already.** `coat-1` measured **+0** for the DAMAGED coat, and that stands; `pristine-1` measured
 * **+6** for the INSTANCED PRISTINE faces, because an instanced pristine face is now
 * `MeshPhysicalMaterial` where the damask was `MeshStandardMaterial` and `parameters.instancing`
 * can never share across that boundary. Defaulting to arm 1 turns BOTH on, so the bill is the sum:
 * ~0.6 s of cold boot by arithmetic off `_coat1-programs`' own histogram. `?coat=0` is still the
 * shipped-look arm byte-for-byte and
 * `[C]` still cycles all three, because which of 1 and 2 the gallery should use is a look question
 * nobody has put a picture in front of him for yet.
 *
 * Read once and guarded for node: `harness/evidence/_ap3-build.mjs` builds the whole mansion headless and
 * imports this file outside a browser. **Node keeps arm 0** so every headless golden — 15740
 * leaves — stays comparable with what it recorded.
 */
const COAT_DEFAULT_ARM = 1;
function _coatUrlArm() {
  if (typeof location === 'undefined') return 0;
  const raw = new URLSearchParams(location.search).get('coat');
  const n = Number(raw ?? COAT_DEFAULT_ARM) | 0;
  return (n >= 0 && n < COAT_ARMS.length) ? n : COAT_DEFAULT_ARM;
}
let COAT_ARM = _coatUrlArm();

/** The arm every damage-armed face will adopt the next time it is asked. */
export function coatArm() { return COAT_ARM; }

/**
 * Cycle the coat arm and re-coat every panel handed in. Returns `{arm, name, changed, programs}`
 * so the caller can put the arm AND its price on screen — a look question is decided by John's
 * eye, and he must never be guessing which arm he is looking at.
 *
 * ⚠️ **ARM 2 COMPILES A PROGRAM FAMILY THE PAGE HAS NEVER SEEN, THE FIRST TIME IT IS SELECTED.**
 * That is the +1 (≈+6 at boot, once the four warmed point-light counts are paid) and it is a
 * one-off hitch on the key press. It is REPORTED rather than hidden, because the hitch is the
 * measurement.
 */
export function setCoatArm(n, panels = [], renderer = null) {
  COAT_ARM = ((n % COAT_ARMS.length) + COAT_ARMS.length) % COAT_ARMS.length;
  let changed = 0;
  for (const p of panels) if (p?.recoat?.()) changed++;
  return {
    arm: COAT_ARM,
    tag: COAT_ARMS[COAT_ARM].tag,
    name: COAT_ARMS[COAT_ARM].name,
    changed,
    programs: renderer?.info?.programs?.length ?? -1,
  };
}

/**
 * The room's own wall material, asked of the BUILT SCENE rather than re-derived from `room.js`'s
 * tables. `GeoBin.build` names the merged bucket `kit:wall` and `baker.standard` puts the baked
 * texture set on `material.userData.bake`, so this is the room's skin by construction.
 *
 * 🚨 **WHY THE PARENT AND NOT `ownerSpace`.** `room.js` sets `p.ownerSpace = owner` and then
 * `owner.root.add(p.root)` on the NEXT line, so by the time three dispatches `added` on this
 * panel's root its parent IS the owner space's root — and `buildSpace()` has already run for
 * every space (it is a whole loop earlier). Using the parent means **this needs no change in
 * `room.js` at all**. ⚠️ The explicit form is one line in `room.js`'s panel constructor —
 * `coat: mats.wall`, exactly parallel to the `revealMaterial: mats.reveal` already there — and it
 * should replace this the next time somebody owns that file.
 */
const _ROOM_WALL = new WeakMap();
function roomWallMaterialOf(spaceRoot) {
  if (!spaceRoot) return null;
  if (_ROOM_WALL.has(spaceRoot)) return _ROOM_WALL.get(spaceRoot);
  let out = null;
  spaceRoot.traverse((o) => {
    if (out || !o.isMesh || o.name !== 'kit:wall') return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (m?.userData?.bake) out = m;
  });
  _ROOM_WALL.set(spaceRoot, out);
  return out;
}

/**
 * A coat wearing `wallMat`'s baked skin. **A NEW MATERIAL INSTANCE SHARING CACHED TEXTURES** —
 * `baker.standard()` returns a fresh material over cache-hit textures, so this is +0 bakes and
 * +0 MB (`_coat1-programs.mjs` B1: 4/4 cache hits, key round-trips exact).
 *
 * 🚨 **NEVER HAND THE ROOM'S `kit:wall` INSTANCE STRAIGHT TO A PANEL.** `applyBreakMask` mutates
 * the material it is given — `defines`, `onBeforeCompile`, its uniform block — and `pinProgramKey`
 * redefines a property on it. Break-patching the shared room bucket would put a hole in the whole
 * room's wall. Hence a new instance, which `wall.js` needs anyway: line ~860, *"the break uniform
 * lives on the material, so panels must not share instances or one hole appears in all of them."*
 *
 * ⚠️ **NO `rrrBreakField` IS SET AND THAT IS DELIBERATE.** On a damage-armed face the break order
 * comes from `mats[1]` (the plaster) for ALL FOUR layers — see the `breakField:` line below — so
 * a coat's own field is never read. Handing it a wall bake's ORM alpha would be actively wrong:
 * `baker.js` defaults `Surf.breakOrder` to 1.0, i.e. "never breaks".
 */
function coatFromWall(wallMat, arm) {
  const t = wallMat?.userData?.bake;
  if (!t) return null;
  const slots = {
    map: t.map, normalMap: t.normalMap, aoMap: t.orm,
    roughnessMap: t.orm, metalnessMap: t.orm,
    roughness: wallMat.roughness ?? 1.0,
    metalness: wallMat.metalness ?? 1.0,
    envMapIntensity: wallMat.envMapIntensity ?? 1.0,
  };
  const wallCC = ('clearcoat' in wallMat) ? (wallMat.clearcoat ?? 0) : 0;
  let m;
  if (wallCC > 0) {
    // service, chapel, ballroom (boiserie 0.25) and both studies (walnut 0.55) — the room's own
    // wax, and the same program the shipped coat already uses.
    m = new THREE.MeshPhysicalMaterial({
      ...slots, clearcoat: wallCC, clearcoatRoughness: wallMat.clearcoatRoughness ?? 0.35,
    });
  } else if (arm === 1) {
    // the gallery. A token wax buys a seat in the one program family (A4 +0); at 0.00 it would be
    // its own family (C7 +1). 0.9 roughness so the wax is a sheen and not a varnish.
    m = new THREE.MeshPhysicalMaterial({ ...slots, clearcoat: 0.02, clearcoatRoughness: 0.9 });
  } else {
    // arm 2 — the gallery's paper to the bit, and the +1 program family that costs.
    m = new THREE.MeshStandardMaterial(slots);
  }
  if (wallMat.color) m.color.copy(wallMat.color);
  if (wallMat.normalScale && m.normalScale) m.normalScale.copy(wallMat.normalScale);
  if (wallMat.aoMapIntensity !== undefined) m.aoMapIntensity = wallMat.aoMapIntensity;
  m.name = wallMat.name;
  m.userData.bake = t;
  return m;
}

/**
 * 🧱 **A FRESH MATERIAL WEARING THIS FACE'S COAT — FOR WHOEVER HAS TO DRAW THE FACE, INCLUDING
 * THE ONE THAT DRAWS IT WHILE IT IS STILL PRISTINE.** `null` on arm 0, on a scalar panel, or when
 * the room cannot be resolved; the caller then falls back to whatever it already had.
 *
 * 🚨 **THIS IS THE ONLY EDIT `pristine-1` MADE TO THIS FILE'S LOGIC AND IT IS A FACTORING, NOT A
 * CHANGE.** The expression is `recoat()`'s own, lifted verbatim so that `wallinstances.js` cannot
 * build a *nearly* identical coat and drift from the one the panel wears. `coatbake-1` measured
 * that **0 of 28 free faces draw their own layer 0** — every untouched dig face in the house is
 * drawn by the shared instanced `wall.pristine.face`, so the coat had never reached the screen
 * before a blow landed. Fixing that means the instancer needs exactly this material, and asking
 * for it here is the difference between one definition and two.
 *
 * ⚠️ **IT RETURNS A NEW INSTANCE EVERY CALL, DELIBERATELY.** `applyBreakMask` mutates what it is
 * given and `pinProgramKey` redefines a property on it, so a shared coat instance would put one
 * face's break state on another's — `wall.js`'s founding constraint, line ~1028. New instance,
 * cached textures: `_coat1-programs.mjs` B1 measured that at +0 bakes and 0.00 MB.
 */
export function panelCoatMaterial(p) {
  if (!p?.field) return null;
  const arm = coatArm();
  if (arm === 0) return null;
  const wallMat = roomWallMaterialOf(p.root?.parent);
  return (wallMat && coatFromWall(wallMat, arm)) || null;
}

export class DestructibleWall {
  /**
   * @param {object} o
   * @param {string} o.id
   * @param {import('../destruction/wall.js').WallField} [o.field] authoritative owner
   * @param {number[]} o.position   centre of the aperture, world
   * @param {number} [o.rotY]       0 = facing +Z
   * @param {number} o.width @param {number} o.height
   * @param {number} [o.thickness]
   */
  constructor(o) {
    this.id = o.id;
    this.width = o.width ?? 2.08;
    this.height = o.height ?? 2.68;
    this.thickness = o.thickness ?? 0.30;
    this.rotY = o.rotY ?? 0;

    /**
     * ⚠️ `o.defs` IS OPTIONAL AND OMITTING IT IS THE SHIPPED PATH. `WallState` already defaults
     * to `STAGE_DEFS`, and `views/game.js` `applyExitPlan()` still assigns `st.defs` after the
     * fact for the exit sites — that has to stay, because which site is live is a PER-RUN fact
     * and the builder runs before a run exists. This argument is for the opposite case: a table
     * that is a property of the FLOOR PLAN rather than of the run, which is what
     * `docs/design/dig.md`'s `DIG_DEFS` is. Passing `undefined` is byte-identical to before.
     */
    this.state = o.field
      ? o.field.add(this.id, { stage: o.stage ?? 0, defs: o.defs })
      : new WallState({ id: this.id, authority: true, stage: o.stage ?? 0, defs: o.defs });

    this.root = new THREE.Group();
    this.root.name = `wall.${this.id}`;
    this.root.position.set(...o.position);
    this.root.rotation.y = this.rotY;

    /**
     * 🕳️ **FREE-FORM POSITIONAL DESTRUCTION — `o.damage`, and its presence is the whole switch.**
     *
     * With it, this face carries a `DamageField` (`src/destruction/damagefield.js`): a CPU depth
     * grid that is BOTH the shader's threshold source and the gameplay truth for collision,
     * tracing, sight and routing. Without it every line below is what it was — the stage machine
     * drives `uBreak` as one scalar per layer and the panel is solid or it is not.
     *
     * ⚠️ **ONE GRID, TWO CONSUMERS, AND THAT IS THE DESIGN.** A continuous wall has no stages to
     * hang collision off, so if the renderer and the collider read two structures they drift and
     * what you see stops matching what you can walk through. Every query below that used to ask
     * the state machine asks the field instead WHEN THERE IS ONE, and asks the state machine
     * when there is not.
     */
    /**
     * 🚪 **THE DOORWAYS THIS FACE CONTAINS — `{u0,u1,v0,v1}` face-local, or null.**
     *
     * ⚠️ **`o.damage.apertures` IS THE HONEST INTERFACE AND `o.damage.cell` BEING AN OBJECT IS A
     * WORKAROUND WITH AN OWNER.** `room.js` builds this argument as `{ cell: def.cell }` — one
     * hand-picked field — and `room.js` is checked out to another agent this session, so
     * `dig.js` packs the rects into `cell` and this line unpacks them. **When `room.js` is free,
     * widen its literal to `{ cell: def.cell, apertures: def.apertures }` and delete the second
     * clause here and the packing in `freePanels()`.** Both shapes are read so neither edit has
     * to land first.
     */
    const _dmg = (o.damage && typeof o.damage === 'object') ? o.damage : null;
    const _cellSpec = (_dmg?.cell && typeof _dmg.cell === 'object') ? _dmg.cell : null;
    this.apertures = o.apertures ?? _dmg?.apertures ?? _cellSpec?.apertures ?? null;
    this.field = o.damage
      ? new DamageField({
        width: this.width, height: this.height,
        cell: _cellSpec ? _cellSpec.cell : _dmg?.cell,
        apertures: this.apertures,
      })
      : null;
    /**
     * How thick this face's share of the wall band is, for collision only. A dig face is one
     * room's 0.075 m of finish in front of the shared band, but the COLLIDER has to fill that
     * room's half of the band or a body slips into the cavity through a hole one side has dug
     * and the other has not. Defaults to the render thickness, which is what every shipped panel
     * wants and is byte-identical to before.
     */
    this.bandThickness = o.bandThickness ?? this.thickness;

    // Per-panel materials. The baker caches the TEXTURES by key so this costs no VRAM, but
    // the break uniform lives on the material, so panels must not share instances or one
    // hole appears in all of them at once.
    this.mats = wallStageMaterials(o.materialOpts);
    /**
     * 🎯 **A DIG FACE'S OUTER SKIN IS THE ROOM'S OWN WALL** — John, 2026-08-08: *"I want to get
     * the digging chunk game feel happening with the ACTUAL ESTATE ASSETS in the loaded slice
     * per my art."* `estateSkinMat()` calls `boiserieMat` with `room.js`'s exact `mats.wall`
     * arguments, so the baker hands back the same three textures the surrounding wall is drawn
     * with: no extra bake, no extra VRAM, and no seam between "wall" and "the diggable bit".
     * See `wallstages.js` for why the break-order field has to be supplied separately.
     *
     * ⚠️ Only on a damage-armed face. Every scalar panel keeps the damask, so `wall.sheet`,
     * `wall.transition`, the four studio stage views and `wallinstances.js`'s shared copies are
     * untouched — this cannot reach them, because they never pass `o.damage`.
     */
    if (this.field) {
      this.mats[0].dispose();
      this.mats[0] = estateSkinMat();
      /**
       * 🔴 **ROUND 3, RANK 1 — THE OTHER HALF OF FLATTENING THE CYAN, AND IT IS THE HALF THAT
       * ALBEDO ALONE COULD NOT HAVE FIXED.**
       *
       * `DIG_BAND_LOOK` takes the lath's LUMA out of the teal. It cannot take out the other two
       * places the same stripe pattern was entering the picture:
       *
       *   1. **THE BREAK-ORDER FIELD.** `lathMat`'s `breakOrder` steps along lath courses and
       *      `beamMat`'s is 0 off a stud, so both layers tear COURSE BY COURSE — which is where
       *      the horizontal teal fingers in `thick-12` come from. That is a silhouette, not a
       *      colour, and no tint reaches it.
       *   2. **THE NORMAL MAP.** `lathMat` bakes at `heightScale` 0.090 with `normalScale` 1.25
       *      — the strongest relief of any wall stage — so even a perfectly flat teal albedo
       *      would still be lit as a corrugated sheet.
       *
       * So a damage-armed face draws its two structure bands with the PLASTER bake. The teal is
       * then flat in albedo, flat in normal, and tears with the same crumble as the white shell
       * in front of it — one solid slab, which is what all eight images in `refs/_sheets/dig.png`
       * show and what `critic-dig-2` ranked first.
       *
       * ⚠️ **IT COSTS NO BAKE AND NO VRAM.** `plasterMat` is cached by its options object, and
       * layer 1 already built it with these exact arguments, so this is the same three textures
       * a third and a fourth time — a new material instance only, which is required anyway
       * because the break uniform lives on the material.
       *
       * ⚠️ **AND IT CANNOT REACH THE SHIPPED BUILD.** It is inside the `this.field` arm, so
       * `wall.sheet` PASS 78, `wall.transition`, the four studio stage views and
       * `wallinstances.js`'s shared copies all still draw lath and framing exactly as they did.
       * The stage system's own read (paper → plaster → lath → beam) is untouched; this is the
       * free-form dig's read, which John's art says is ornate → white → cyan.
       */
      for (const i of [2, 3]) {
        this.mats[i].dispose();
        this.mats[i] = plasterMat(o.materialOpts?.plaster);
      }
    }
    /** Per-layer slab thickness in metres — how deep the cut through this layer really is. */
    const layerT = [];
    for (let i = 0; i < 4; i++) {
      const f0 = DAMAGE_DEPTH_F[i];
      const f1 = i < 3 ? DAMAGE_DEPTH_F[i + 1] : DAMAGE_BACK_F;
      layerT.push((f1 - f0) * this.thickness);
    }
    this.layerThickness = layerT;
    /**
     * 🎨 **THIS WAS A `for` LOOP AND IT IS NOW A CLOSURE CALLED BY ONE — nothing inside it
     * changed, and that is the point.** Re-coating a face (see `recoat()` below) has to re-patch
     * layer 0, and the ONLY safe way to do that is to run the identical option object rather than
     * a second copy of it that can drift. Every value below closes over `layerT`, `o` and `this`
     * exactly as it did when it was a loop body, so the constructor's behaviour is unchanged by
     * construction. **Do not "tidy" this back into an inline loop without giving `recoat()`
     * somewhere else to call.**
     */
    this._patchLayerMaterial = (i) => {
      applyBreakMask(this.mats[i], this.field
        ? {
          ...BREAK_CFG[i],
          // 🎨 the band's own material — see DIG_BAND_LOOK. Spread AFTER BREAK_CFG so the
          // per-band lip colour wins, and only ever on a damage-armed face.
          ...DIG_BAND_LOOK[i],
          /**
           * 🚨 The top stop on the break-order high-pass — `breakmask.js` `uOrderHi`. It is one
           * value for all four bands on purpose: the four silhouettes are nested and a layer
           * tearing at a different scale from the one in front of it reads as a different
           * material, which is the mistake `DIG_BAND_LOOK`'s lath anisotropy was making.
           * 4.6 is a ~13 cm footprint on a 1024 field over a 5.72 m face; 0.80 leaves a fifth
           * of the fine filigree in to crumble the arris at about a centimetre.
           */
          orderHi: 4.6, orderSoft: 0.80,
          /**
           * 🧩 **ROUND 7: THE TEETH ARE PLATES NOW, AND THEY COME FROM A LATTICE RATHER THAN
           * FROM THE BAKE** — `breakmask.js` `uPlate`, which carries the full argument and the
           * A/B that refuted the bake route.
           *
           * ⚠️ **THE SCALE IS DERIVED FROM THE FACE, NOT TYPED IN**, for the same reason
           * `uOrderLod` is derived from the texture: a span is 2.56 m or 5.72 m depending on
           * where it is in the house, so a constant in cells would make a narrow face break into
           * plates half the size of a wide one's and the two would stop looking like the same
           * material. 0.34 m is the middle of the 20-50 cm fragment range in
           * `refs/_sheets/dig.png`, and the second lattice inside `_bcell` is 2.35x finer, so
           * one plate breaks into pieces about 15 cm across.
           *
           * ⚠️ **IDENTICAL ON ALL FOUR BANDS, LIKE `jag` AND `jagScale` AND FOR THE SAME
           * REASON**: the four contours are level sets of one function and a per-band plate
           * lattice would make them four different functions again.
           */
          /**
           * ⚠️ **0.34 -> 0.50, AND THE TWO 0.34s WERE NEVER THE SAME QUANTITY.** The amplitude
           * is in THRESHOLD units and the scale is in METRES; they collided at one value by
           * accident and that is worth not repeating. A/B'd on one crater in one page, four arms
           * — at 0.34 the outline's mean second difference is 1.66 px and it photographs as a
           * rounded polygon; at 0.50 it is 3.02 px and the straight runs and hard corners are
           * plainly there on the left flank and the right notch. Higher was tried in round 7's
           * first sweep (0.65) only alongside a gain drop to 2.2, which is a confound and undoes
           * round 6's saturation argument, so it is not the arm that was taken.
           */
          plate: 0.50,
          plateScale: [this.width / 0.34, this.height / 0.34],
          /**
           * 🕸️ **THE STRAIN TELL — `breakmask.js` `uCraze`, and it is what turns the collapse
           * from an effect into a mechanic.**
           *
           * John was asked directly and chose *"actively taught"* over *"emergent, no UI"*, and
           * the reason is arithmetic rather than taste: **if collapses look random there is no
           * skill, only luck.** He wants the rule to be *"an efficiency for the player to utilize
           * as a skill to differentiate themselves"*, which requires that a player can form the
           * theory *cut wider than a metre and the storey comes down* by WATCHING. So the wall
           * has to say which material is about to go, one blow early, without a meter.
           *
           * `[amount, plate-wall threshold, darkness]`. It darkens the plate lattice's own
           * fracture lines in proportion to `damagefield.js`'s A channel, which is
           * `support.js` `strain()` — the collapse rule run at 62% of its firing threshold, over
           * the same `depth` array, propagated through the same cascade. **What crazes is what
           * falls**, and ablating the rule (`COLLAPSE.span = 0`) removes the crazing with it,
           * because it is one implementation and not two.
           *
           * ⚠️ **ON ALL FOUR BANDS, LIKE `plate` ITSELF.** Whichever layer is the frontmost
           * survivor at a texel is the one the player is looking at — the ornate coat early, the
           * shell mid-dig, and the crater FLOOR for most of a dig once round 11 gave band 3 the
           * deep half of the axis. A tell that only existed on one of them would vanish exactly
           * when the dig got interesting.
           *
           * ⚠️ **0.55 IS A LOOK NUMBER AND A CRITIC SHOULD RULE ON IT.** It is a multiply on
           * albedo, so it is a fissure taking light away and not a painted line; measured on one
           * crater it takes the crazing region's mean luma down 12.6% while the same face's
           * uncrazed wall is |Δ| 0.0. Louder reads as a decal, quieter is not a warning.
           */
          craze: [1.0, 0.16, 0.55],
          /**
           * 🌊 **CAUSE 2, ROUND 6's RANK 2: the white rim's outer edge FADED into the brown.**
           * `breakmask.js` `uLipEnd` carries the argument — the outermost white in the frame is
           * the lip, and the lip was a smoothstep whose derivative is zero at both ends, i.e. a
           * shoreline drawn between the two loudest colours in the picture. 0.20 spends a fifth
           * of the lip's own width on the fall and holds full plaster value across the other four
           * fifths, so the boiserie/plaster boundary is an edge and the lip's 0.34x-1.80x width
           * variation stops being averaged away.
           *
           * ⚠️ One value for all four bands, like `jag`, `jagScale` and `plate` — see those.
           * It is only loud on band 0, where the lip is white against brown; on the shell the lip
           * colour is within a few per cent of the band colour and the change is invisible, which
           * is the correct outcome and not a reason to make it per-band.
           */
          lipEnd: 0.20,
          /**
           * 🔴 **ROUND 6: 2.8 -> 3.5, AND IT IS WHAT TURNS A WOBBLE INTO PLATES.** The gain
           * stretches the high-passed residual back out, and the result is CLAMPED to [0, 1] —
           * so raising it does not merely make the boundary wobble further, it makes more of
           * the field saturate, which is what puts flat runs and hard corners in the outline
           * instead of a continuous curve. Plaster snaps in plates and crumbles at the arris;
           * a smoothly varying threshold can only ever erode.
           * ⚠️ Saturation used to mean permanent islands in the middle of the crater (round 4's
           * rank-1 defect) and that is why 2.8 was as far as it went. `_rrrSpent` closed that
           * by construction — a texel whose whole band is dug out is gone whatever its order
           * says — so the ceiling this number was under no longer exists.
           */
          orderGain: 3.5,
          /**
           * 🧱 **ROUND 9: THE CUT EDGE GETS A CROSS-SECTION** — `breakmask.js` `uFacet`,
           * `uSecLift` and `uRimFloor` carry the full argument, including the eight-round sign
           * error in the cut face's normal that this round found and fixed.
           *
           * ⚠️ **ONE SET OF NUMBERS FOR ALL FOUR BANDS, LIKE `jag`, `jagScale`, `plate`,
           * `lipEnd` AND `orderGain` — AND FOR THE SAME REASON.** The four contours are level
           * sets of one function; a per-band facet scale or a per-band rim floor would make them
           * four different functions again, which is what round 6 spent the whole round undoing.
           *
           * 🎯 **THE NUMBERS ARE A/B'd, FIVE ARMS IN ONE PAGE ON ONE CRATER**
           * (`harness/scenarios/_chunks11-secab.mjs`), and the measurement is the one the
           * deliverable actually turns on: **the mean luma of the section at the TOP of the hole
           * against the section at the BOTTOM**, at the steep graze.
           *
           *   | arm | soffit | sill | sill/soffit |
           *   |---|---|---|---|
           *   | rounds 1-8 (`secSign` -1, no facet, no lift) | 91.8 | 17.9 | **0.19** |
           *   | round 9 (`secSign` +1, facet 0.85, lift 0.60) | 70.6 | 140.6 | **1.99** |
           *
           * **The old build was not merely flat — it was INVERTED**: the underside of the hole's
           * top edge photographed five times brighter than the sill it faces. That is the sign
           * error, and it is why eight rounds of edge work kept coming back as "a painted band":
           * the two faces disagreed with the geometry, so the eye read neither.
           *
           * `facet` 0.85 leaves the smooth crater falloff carrying a sixth of the direction, so
           * the faceted rim still SITS in a bowl rather than dissolving into noise. `secStep`
           * 0.06 m is under half the sub-plate size (0.145 m) and well over the crumble's ~1 cm,
           * so the difference resolves plate walls without chasing filigree. `cutNorm` 0.55 ->
           * 0.75: with the sign corrected the cut normal is worth leaning further into, and the
           * artefact the old 0.85 note warned about was a gradient artefact of the smooth depth
           * disc, which `facet` has now largely replaced.
           */
          facet: 0.85,
          secStep: 0.06,
          secLift: 0.60,
          cutNorm: 0.75,
          /**
           * 🧱 **ROUND 10, ITEM 1: THE CYAN CORE, IN THE SHELL'S OWN SECTION** — `breakmask.js`
           * `uCore` carries the whole argument, including why the BARRIER cannot own this edge
           * (its visible boundary is an occlusion boundary the barrier's shader cannot compute,
           * and any contour it drew itself would be round 5's deleted "coastline" coming back).
           *
           * ⚠️ **INNERMOST LAYER ONLY, AND THAT IS THE PHYSICS.** `DAMAGE_DEPTH_F` puts layer 3
           * at 0.72 -> 0.97 of the wall band and the barrier plane at 0.97, so layer 3's slab is
           * the only one whose back IS the structure. Painting it on layers 0-2 would put the
           * cyan core inside the plaster.
           *
           * 🎯 **THE WIDTH IS THE ONE NUMBER WITH A MEASURED CEILING, AND IT IS THE RAGGEDNESS
           * THAT SETS IT** (`harness/scenarios/_chunks12-final.mjs`, one page, one crater, the
           * steep graze):
           *
           *   | `core` | outline curvature | what the band is |
           *   |---|---|---|
           *   | 0 (round 9) | 16.3 px | no band |
           *   | 0.45 | **16.5 px** | a 1-2 px hairline |
           *   | 0.75 | **10.4 px** | a clear band |
           *   | 1.00 | **10.5 px** | a clear band |
           *
           * At 0.75 and above the band's OUTER edge is layer 3's own contour rather than the
           * four-layer tear, and layer 3's contour is the smoother of the two — so a band wide
           * enough to be unmissable costs a third of the raggedness `critic-dig-5` closed. 0.55
           * is the largest width measured to leave the tear alone.
           *
           * 🎨 **AND THE TWO VALUES STRADDLE THE FILL RATHER THAN SITTING ABOVE IT.** The first
           * build put the whole band ABOVE the barrier's own value and it photographed as a pale
           * fringe hugging the outline — which is `uLipEnd`'s "wet shore" arriving through a new
           * door. The section of a slab in a cavity is DARKER than its front face everywhere
           * except where it turns up into the room, so the base is scaled under the barrier's own
           * terms and only the up-facing top face is lifted past them.
           */
          // ⚠️ i === 3 ONLY. This options object is spread for all four bands, so an unguarded
          // constant here would paint the structure into the wallpaper and both plaster slices.
          core: i === 3 ? 0.55 : 0,
          coreCol: [0.002 * 0.30, 0.232 * 0.30, 0.296 * 0.30],
          coreEmis: [0, 0.500 * 0.42, 0.648 * 0.42],
          coreTopK: 2.8,
          /**
           * 🔴 The white rim's minimum width, in pixels — round 9 defect 2. The pinch is a
           * projection artefact (the lip is set in threshold units and read in pixels), so the
           * floor is set in pixels too, and capped at 2.4x `_lw` inside the shader so it is
           * bounded by the variation it protects rather than replacing it.
           *
           * ⚠️ **AND IT IS THE COUNTERPART TO A COST ROUND 8 RECORDED ITSELF.** `damagefield.js`
           * `GRAIN`'s note: *"the plate-keyed blur steepens the depth gradient at a plate wall,
           * so the rim narrows exactly where the outline gets its corners… a critic should say
           * which it wants."* The critic said both. 7.0 was tried first and is REJECTED on the
           * delivered frame: it fattens the lip enough that the three shell layers' lips separate
           * into visible parallel terraces, i.e. round 6's contour-map defect coming back through
           * the lip instead of through the bands. 2.5 lifts the hairlines and leaves the rest.
           */
          rimFloor: 2.5,
          /**
           * 🧱 **ROUND 12: THE SECTION'S MINIMUM WIDTH ON SCREEN, AND IT IS `rimFloor`'S
           * ARGUMENT ONE STEP FURTHER IN** — `breakmask.js` `uSecFloor` carries the arithmetic.
           * The part-eaten band is `uCutSoft / |grad(_order - _dmgB)|` pixels wide, and at the end
           * of a dig the crater's interior is saturated so that whole gradient is a cliff at the
           * rim: the 0.780 face, round 6's monotone cut ramp to 0.094, round 9's sill/soffit
           * spread and round 10's `core` band all project onto ONE pixel. John, looking at a
           * fixed breach: *"I can't tell at a glance."*
           *
           * ⚠️ **INNERMOST LAYER ONLY, AND IT IS ROUND 6'S CONSTRAINT THAT DECIDES IT.** Bands
           * 1 and 2 are the same band, the same jag and the same field as each other precisely so
           * the shell reads as ONE tear; widening their section as well would put band 1's 0.94
           * face, its ramp down to 0.45, and then band 3's 0.78 face coming back UP — three ramps
           * in a row, which is the terraced shore round 6 spent itself deleting. On band 3 alone
           * the whole edge stays MONOTONE into the hole: pale ribbon → 0.78 → the cut ramp →
           * 0.094 against the fill. Bands 0-2 are bit-identical, so the outline, the teeth, the
           * lip and every scored capture of them are untouched.
           *
           * 🎯 **AND IT IS WHAT PUTS ROUND 10'S CYAN CORE ON SCREEN.** `core` 0.55 paints the
           * back 55% of this layer's cut face in the barrier's own two constants — the cyan seen
           * in SECTION, which is the reference's own answer to "the cyan is thick"
           * (`refs/_sheets/dig.png` 3 and 7: a flat bright front face and a flat darker return).
           * It was measured at the steep graze and has never had a pixel head-on, because
           * head-on the band it lives in is the one this floor exists to widen.
           *
           * ⚠️ **IT DOES NOT MOVE THE TEAR AND THEREFORE DOES NOT COST FILL.** The ramp is
           * centred on `_order == _dmgB`; widening it symmetrically leaves the 50% contour where
           * it was. Round 11 paid 8 points of the cyan's diameter for its visibility. This pays 0.
           */
          secFloor: i === 3 ? SEC_FLOOR : [0, 0],
          damage: { texture: this.field.texture, band: DAMAGE_BANDS[i] },
          /**
           * 💡 **ROUND 11 — `breakmask.js` `uLitBand`, and it is the innermost layer only.**
           * Two terms answer "how far into the BREACH is this texel" rather than "how far
           * through my own slab has the dig got": the band emissive (a cavity is unlit, and the
           * inner plate is now the FLOOR of the crater for most of a dig) and the cyan bounce
           * (the plate nearest the slab takes the most of it, from the moment the room can see
           * it). On bands 0-2 this IS the layer's own band, so `_dmgL` is `_dmgB` to the bit and
           * nothing about them moves; `breakmask.js` defaults it to the own band for every
           * caller that does not pass it.
           */
          litBand: i === 3 ? DAMAGE_BANDS[2] : undefined,
          /**
           * 🚨 **ROUND 6: ONE BREAK-ORDER FIELD FOR ALL FOUR LAYERS, AND IT IS THE STRUCTURAL
           * HALF OF "ONE RAGGED TEAR".**
           *
           * Layer 0 used to supply its own — `estateSkinMat` hands over the WALLPAPER stage's
           * ORM alpha, a field authored to tear in big soft sheets, because `boiserieMat` has no
           * break order of its own. Layers 1-3 threshold the PLASTER field. Two different fields
           * means two different `_order` functions, which means the skin's contour and the
           * shell's are independent random curves that cross each other — and where they cross,
           * the cyan meets the boiserie with no white between them and the reference's single
           * loudest cue drops out along that stretch of the edge.
           *
           * With one field, every layer's contour is a LEVEL SET OF THE SAME FUNCTION at its own
           * threshold. Level sets of one function are strictly nested and provably cannot cross,
           * so the white rim is guaranteed non-empty everywhere and only its WIDTH varies — fat
           * where the field is flat, hairline where it is steep, which is what a torn plaster rim
           * does. It is also what let the bands go wide again (see `DAMAGE_BANDS`): the bands no
           * longer have to be kept apart to stop a crossing, and band width is what tooth depth
           * is made of.
           *
           * ⚠️ `plasterMat` is cached by its options object and layers 1-3 all built it with the
           * same arguments, so `mats[1]`'s map IS `mats[2]`'s and `mats[3]`'s — this is the one
           * texture they already shared, now shared with layer 0 as well. No extra bake, no extra
           * VRAM, no `materials-local.js` change.
           *
           * ⚠️ **DAMAGE ARM ONLY.** The scalar branch below still reads each material's own
           * field, so `wall.sheet` PASS 78, `wall.transition`, the four studio stage views and
           * `wallinstances.js`'s shared copies tear exactly as they did.
           */
          breakField: this.mats[1].userData.rrrBreakField ?? this.mats[1].roughnessMap ?? null,
          cutDepth: layerT[i],
          faceSize: [this.width, this.height],
          // two damage cells, in uv — the finite difference the cut face's normal is built on
          dmgStep: [2 / this.field.cols, 2 / this.field.rows],
        }
        : BREAK_CFG[i]);
      /**
       * 🚨 **THE KEY IS PER-ARM, NOT PER-PANEL-PER-LAYER, AND THE PER-PANEL VERSION WAS THE
       * SINGLE LARGEST MEASURED WASTE IN THE PROJECT.**
       *
       * ⚠️ **WHY THE PIN EXISTS AT ALL — THIS PART IS STILL TRUE AND MUST NOT BE DELETED.**
       * `applyBreakMask` injects a large patch into the fragment shader and sets its own
       * `customProgramCacheKey`. `patchForScreenAO` (`post/pipeline.js`) then **ASSIGNS**
       * `customProgramCacheKey = () => 'rrr-ssao-v1'` over every standard material in the scene
       * during `engine.finalizeScene()` — it replaces rather than composes, so `applyBreakMask`'s
       * own key is silently discarded and a break-patched material would end up sharing a key
       * with an ordinary estate wall. `pinProgramKey` is an accessor that COMPOSES whatever is
       * assigned later onto a fixed prefix, which is what keeps the two apart.
       *
       * 🚨 **WHAT WAS WRONG WAS THE PREFIX BEING UNIQUE PER PANEL PER LAYER.** The old note
       * claimed a shared program means "only the first material's break uniform is ever bound".
       * **That is not how three.js works, and it was measured rather than argued.**
       * `WebGLRenderer.getProgram()` keys its program map on `properties.get(material)` — i.e.
       * PER MATERIAL — so a material that has never been drawn always runs
       * `parameters.uniforms = programCache.getUniforms(material)`, then its OWN
       * `onBeforeCompile`, then `materialProperties.uniforms = parameters.uniforms`, even when
       * `acquireProgram` hands back a program another material already compiled
       * (`WebGLRenderer.js` ~2082-2091). **The compiled SOURCE is shared; the uniform VALUES are
       * not.** What `acquireProgram` actually discards is the second material's `onBeforeCompile`
       * *output* — which only matters when the two sources DIFFER.
       *
       * ✅ **AND THEY PROVABLY DO NOT.** The only thing in `applyBreakMask` that changes an
       * emitted character is the presence of `opts.damage`; every other knob — the bands, the
       * lip, the jag, the plates, the core, all of `DIG_BAND_LOOK` — is a uniform. That one
       * discriminator lives in `material.defines.RRR_BREAK_DAMAGE` (with `RRR_BREAK_RAGGED`
       * beside it), and **three hashes `defines` AHEAD of `customProgramCacheKey`**
       * (`WebGLPrograms.getProgramCacheKey`, defines at ~line 392, custom key last at ~411), so
       * two panels that differ meaningfully already differ before the custom key is read.
       * `boot-1` confirmed it at the only level that cannot lie, by pulling the compiled GLSL
       * back out of the GL context with `gl.getShaderSource()` and hashing it
       * (`harness/scenarios/_boot1-srcid.mjs`).
       *
       * 📉 **THE COST, MEASURED ON THIS TREE (2026-08-09, `quality=high`, seed s4, 1280x720):**
       * 1077 programs behind **264 distinct source pairs** — a redundancy of 4.08x and **813
       * compiles of GLSL that had already been compiled**. Every one of the ten worst groups
       * differed in this field and in nothing else: `rrr-wall|p.gal_w|0|rrr-ssao-v1` vs
       * `rrr-wall|p.gal_e|0|rrr-ssao-v1`, in groups of 22 (the scalar panels) and 36 (twelve
       * dig faces x their three shell layers, which are the same plaster material three times).
       * At ~106 ms per program that field alone was minutes of the loading screen.
       *
       * 🚨 **THE PROPERTY THIS MUST NOT BREAK, AND IT IS RE-VERIFIED RATHER THAN ASSUMED:
       * PANELS BREAK INDEPENDENTLY.** A shared program with per-material uniforms keeps that by
       * construction (above), and `harness/scenarios/wall-applyrace.mjs` plus a dig-one-photograph-
       * its-neighbour capture check it from the outside. If you ever make `applyBreakMask` emit
       * source that varies with anything other than `opts.damage`, **put that discriminator in
       * `material.defines`** — do not bring the panel id back.
       *
       * ⚠️ The arm token is FREE: `defines.RRR_BREAK_DAMAGE` already separates the two arms, so
       * naming the arm here cannot add a program. It is here so the key is readable in
       * `_boot1-census.mjs` output and so a future collapse cannot silently merge the arms.
       */
      pinProgramKey(this.mats[i], this.field ? 'rrr-wall|dig' : 'rrr-wall|stage');
      /**
       * 🕳️ **A ONE-SIDED FILL FOR A TWO-SIDED HOLE — the "unlit black aperture" defect, fixed.**
       *
       * An aperture is a hole THROUGH a wall, so it has a room on each side of it, and the
       * panel that fills it is the only thing standing in the gap. These four planes were all
       * `FrontSide` facing local +Z, and a connector's `rotY` (`spaces.js`) encodes THE WALL'S
       * AXIS, not a facing: `x.study_w.servants` and `x.ballroom.terrace_e` are both authored
       * `rotY: PI/2`, so one faces into its room and the other faces out of the house. On the
       * +x and +z walls every layer plane was therefore backface-culled from the only room that
       * can look at it, and the aperture rendered as **nothing at all**.
       *
       * 📉 **MEASURED, `x.ballroom.terrace_e`, seed s4, head-on from the ballroom**
       * (`harness/scenarios/_ap1-sided.mjs`, both arms in one frozen page): the aperture read
       * **mean luma 4.3 with 99.7% of its rect under luma 20** against a lit wall beside it at
       * **166.1 / 0.4%**; flipping these four materials to `DoubleSide` live took it to
       * **25.1 / 39.2%** — the wall control moved 0.08 pp and the same-config floor is 0.19 pp.
       * Fourteen scalar panels had a room on their back side: the six exit sites
       * `x.ballroom.{orangery,terrace_e,south_w}`, `x.gallery.east`, `x.study_e.{icehouse,stair}`,
       * and the eight interior breachables (`p.svc_w.n/s`, `p.svc_e.n/s`, `p.gal_w/e`, `p.bal_w`,
       * `p.chapel`), which from their blind room read as an open doorway rather than a wall.
       *
       * ⚠️ **THE SCALAR ARM ONLY, AND THE GUARD IS LOAD-BEARING.** A free face is HALF of a wall
       * band by construction — `dig.js` builds one face per side of every dig edge, each already
       * turned to face its own room — so it has no blind side to fix, and `?dig=free` is
       * `game.play` PASS 76. Double-siding a dig face would put the back of the far face's
       * layer planes inside the near face's crater, which is a change to the break edge.
       *
       * ⚠️ **IT COSTS NO DRAW CALL.** Culling is per primitive, not per submission: the same
       * meshes are submitted either way and only the back-facing quads stop being discarded.
       * It does add one program variant (`DOUBLE_SIDED` is a three-owned define), which is why
       * this is a material flag and NOT a `customProgramCacheKey` suffix — see the note above.
       *
       * ⚠️ **AND THE OCCLUSION RULE SURVIVES IT** — see `occludeLayers`, which is amended there
       * rather than here because the premise it states ("all `FrontSide`") is what changed.
       */
      if (!this.field) this.mats[i].side = THREE.DoubleSide;
      this.mats[i].needsUpdate = true;
    };
    for (let i = 0; i < 4; i++) this._patchLayerMaterial(i);

    /**
     * 🎨 **THE PER-ROOM COAT, AND ARM 0 REACHES NOTHING.** See `COAT_ARMS` above for the price of
     * every arm and for why a cache key is not the lever here.
     *
     * ⚠️ **IT IS RESOLVED ON `added`, NOT IN THIS CONSTRUCTOR, AND THAT IS FORCED.** The room's
     * own wall material is found by walking this panel's PARENT (`roomWallMaterialOf`), and the
     * panel has no parent until `room.js` adds it — one line after it sets `ownerSpace`. So the
     * hook fires during house construction, i.e. **inside the loading screen**, which is the
     * property `_coat1-programs.mjs`'s C6 exists to protect: 0 bakes during play.
     *
     * 🚨 **NEVER MOVE THIS ONTO FIRST DAMAGE.** A coat built lazily would put material
     * construction on the worst frame in the run — the same frame `instancing-1` refused to
     * allocate on, having measured a first-draw upload there at 33 ms — and if anybody ever gets
     * the arguments wrong it becomes a BAKE, priced at 16.08 MB and ~11 ms per face (C5).
     */
    this._coatArm = 0;
    if (this.field) this.root.addEventListener('added', () => this.recoat());

    this.layers = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(this.width, this.height, 1, 1), this.mats[i]);
      // see DAMAGE_DEPTH_F: a damage-armed face spreads its stack over the whole wall band
      m.position.z = this.field ? -DAMAGE_DEPTH_F[i] * this.thickness : DEPTHS[i];
      m.receiveShadow = true;
      m.castShadow = false;
      m.name = `${this.id}.layer${i}`;
      this.root.add(m);
      this.layers.push(m);
    }

    // Reveals: without them a broken wall is a hole in a sheet of paper. Cheap boxes.
    //
    // ONE MESH, NOT FOUR. All four reveals share a single material, so they merge into one
    // BufferGeometry with no visual change whatever. Measured: a panel built 8 meshes — 4
    // layer planes, which genuinely cannot merge because each carries its own break uniform,
    // and 4 reveals which have no reason not to. That is 3 meshes saved per panel, and the
    // mansion carries eight panels. The panels were 86% of the room group's mesh count.
    const rev = o.revealMaterial ?? new THREE.MeshStandardMaterial({ color: 0x241f19, roughness: 0.94 });
    this.revealMaterial = rev;
    this.ownsRevealMaterial = !o.revealMaterial;
    // 🚪 `this.apertures` is null on every face but a slab carrying a doorway; see there.
    const revealGeo = revealGeometry(this.width, this.height, this.thickness, this.apertures);
    this.reveal = new THREE.Mesh(revealGeo, rev);
    this.reveal.name = `${this.id}.reveal`;
    this.reveal.receiveShadow = true;
    this.root.add(this.reveal);

    /**
     * 🕳️ **THE BARRIER PLANE — the cyan structure behind the white, on a free face only.**
     *
     * It is ONE extra mesh and it samples the SAME `tDamage` the layers do, so it cannot
     * disagree with the hole in front of it (`breakmask.js` `barrierMaterial`). It discards
     * where the wall in front still stands and where the G channel says there is no barrier —
     * which is the interconnect, and which is why the interconnect gives nothing away until you
     * have dug to it. It draws nothing at all until somebody has dug past `uShowAt`.
     */
    this.barrier = null;
    if (this.field) {
      /**
       * 🧱 John, 2026-08-08: *"the cyan wall should also look thick."* Round 2 answered that with
       * a marched relief of structural members, and `critic-dig-2` measured the result as a
       * corrugation and ranked it the round's worst defect — the reference's cyan is a flat slab.
       * **So the thickness the cyan has is now entirely GEOMETRIC and none of it is shading:** it
       * stands at `DAMAGE_BACK_F` (146 mm back), you see it through four layer planes and the
       * reveal's inner face. `relief` and `faceSize` are gone with the march.
       *
       * 🚨 **AND THIS PARAGRAPH USED TO END *"…and the only thing this material paints is a
       * contact shadow where the broken rim tucks over it."* THAT HAS BEEN FALSE SINCE ROUND 5
       * AND IT IS A DANGEROUS THING TO LEAVE WRITTEN DOWN** (corrected `pace-2`, 2026-08-09).
       * Round 5 deleted `_bcontact` by name — `breakmask.js`'s own round-5 note lists it as
       * defect 1 of 3, because it was `smoothstep(uShowAt, …, depth)`, i.e. **a 2x brightness
       * ramp keyed to how far the player had dug**, which is the cyan responding to being hit.
       * `receiveShadow` went off the mesh in the same round for the same reason. What the
       * barrier material paints today is exactly two mixes, `uRemain` and `uRemainEmissive`,
       * and **both are gated on the G channel**, so on a texel with structure behind it — every
       * cyan pixel in the game — this shader paints **nothing at all**: one constant albedo,
       * one constant emissive, at every stage of every dig.
       * 🎯 **THE CYAN'S ONLY VISIBLE THICKNESS CUE IS THEREFORE DRAWN BY THE SHELL, NOT BY THE
       * SLAB** — `breakmask.js` `uCore` paints the back 55% of layer 3's cut face in the
       * barrier's own two constants, and round 12's `SEC_FLOOR` is what finally gives that band
       * pixels to live in. A future round that wants more cyan depth must widen or darken THAT
       * band; adding an occlusion term here re-opens a decision John has settled twice.
       */
      // ⚠️ ROUND 5: `faceSize` is gone with `uBMottle`. This material has no spatial variation
      // of any kind left in it, so it has nothing to measure in metres.
      const bm = barrierMaterial(this.field.texture, {
        dmgStep: [2 / this.field.cols, 2 / this.field.rows],
      });
      // ⚠️ ONE KEY FOR EVERY BARRIER IN THE HOUSE — see the layer pin above for the whole
      // argument. `barrierMaterial` emits ONE fragment shader (its knobs are uniforms and its
      // damage texture is a uniform too), so twelve dig faces were compiling one shader twelve
      // times over. The prefix is still needed because `patchForScreenAO` overwrites the key
      // `barrierMaterial` sets for itself; only the per-panel part of it was waste.
      pinProgramKey(bm, 'rrr-wall|barrier');
      bm.name = `wall.barrier.${this.id}`;
      this.barrierMaterial = bm;
      this.barrier = new THREE.Mesh(
        new THREE.PlaneGeometry(this.width, this.height, 1, 1), bm);
      /**
       * Behind every layer plane and behind the reveal's inner face — and now at the BACK of
       * the wall band rather than 75 mm in. The old cap (`min(thickness * 0.92, 0.075)`) put the
       * cyan 6 mm behind the framing plane, which is why it read as a bright screen pasted to
       * the back of the hole instead of as a structure standing behind a thick wall. At
       * `DAMAGE_BACK_F` it stands 146 mm back, so everything you see it through has depth.
       */
      this.barrier.position.z = -DAMAGE_BACK_F * this.thickness;
      this.barrier.name = `${this.id}.barrier`;
      /**
       * 🔴 **ROUND 5: `receiveShadow` OFF, AND IT IS THE SAME NOTE AS THE CONTACT SHADOW'S.**
       * John: the cyan *"seems to visually take damage just like the white layer."* A shadow map
       * sampled across the slab is a value that changes as the room, the player's torch and the
       * broken rim above it move — i.e. the barrier responding to what is happening in front of
       * it, arriving through the lighting instead of through the material. Nothing in the room
       * can plausibly cast onto a plane 146 mm inside the wall anyway; what it bought was a
       * gradient. The slab is now one value under every condition, which is the entire point of
       * `dig.md` §5's *"make it look like an ANSWER"*.
       */
      this.barrier.receiveShadow = false;
      this.barrier.castShadow = false;
      this.root.add(this.barrier);
    }

    // world-space AABB used for collision, tracing and AI routing
    this.box = new THREE.Box3();
    this._recomputeBox();
    /** Cached world-space decomposition of what is still solid. Null == rebuild on next ask. */
    this._solidBoxes = null;
    this._sightBoxes = null;
    /** (point, info) -> void, fired on EVERY landed blow. `views/game.js` hangs chunks off it. */
    this.onChunk = null;
    /**
     * The face on the other side of the same wall band. Set by the builder (`room.js`); see
     * `_couple`, and see the accessor below for why it is one — assigning it also points this
     * face's barrier plane at the twin's grid, which is what lets the renderer answer
     * "is there still wall in this hole" instead of "is MY half of it gone".
     */
    this._twin = null;
    this.twin = null;

    this._progress = 1;
    this._anim = 0;
    this.onBreak = null;      // (stage, info) -> void; the view hangs FX off this

    /**
     * ⚠️ **HIDE A LAYER NOTHING CAN SEE.** The four layer planes have IDENTICAL extents, are
     * parallel, and sit at z = 0 / -0.014 / -0.030 / -0.052. Under a perspective projection a
     * parallel plane of equal extent at GREATER depth projects strictly INSIDE the nearer one's
     * quad. So a layer whose break amount is exactly 0 — fully intact, `discard` unreachable
     * because the test is `_order < uBreak` with `_order >= 0` — is an opaque, depth-writing
     * occluder for everything behind it.
     *
     * An UNDAMAGED panel therefore draws four planes and shows one. That is 3 of its 5 meshes
     * paying a draw call to be invisible, on every panel in the house, for the whole run.
     *
     * `?walls=legacy` puts all four back, unconditionally, so the claim is falsifiable rather
     * than argued. The rule is deliberately conservative: as soon as the front layer has ANY
     * break at all it has holes, and the layer behind it comes back.
     *
     * 🕳️ ⚠️ **THIS RULE USED TO REST ON "ALL `FrontSide`, SO THE CAMERA IS ON THE +Z SIDE", AND
     * THAT PREMISE IS GONE ON THE SCALAR ARM** — see the `DoubleSide` note in the constructor;
     * being one-sided is what made every +x/+z aperture in the house render as nothing. The
     * SAVING is unaffected, because the projection argument never depended on the facing:
     *   · from +Z (the ordinary case) the nearest kept plane is layer 0, exactly as before;
     *   · from -Z the nearest kept plane is layer `cut`, which is BY DEFINITION the first fully
     *     intact one, so it is still an opaque occluder for everything the rule kept in front
     *     of it, and nothing that could show through is being dropped.
     * ⚠️ What the back side does lose is WHICH intact layer it shows: layers `cut+1..3` are all
     * intact too, so a part-broken wall seen from behind shows layer `cut`'s bake rather than
     * the framing's. It is cosmetic, it is only reachable on a part-broken interior breachable,
     * and a pristine panel (`cut` 0, every exit site) is unaffected.
     *
     * ⚠️ Known degenerate case, stated rather than hidden: a camera INSIDE the 14 mm gap
     * between layer 0 and layer 1 sees layer 1 today and nothing under this rule. That is a
     * 14 mm-thick sliver in the middle of a 0.30 m wall; the boom lerps through geometry so it
     * is reachable in principle, and the failure is one frame of a hole where a wall was.
     */
    this.occludeLayers = o.occludeLayers !== false;

    /**
     * PROMOTION. `wallinstances.js` draws every PRISTINE panel out of one shared
     * `InstancedMesh` pair, so a pristine panel's own five meshes are switched off and the
     * panel costs no draw call of its own. The first damage that lands PROMOTES it: its own
     * stack comes back and the instance zero-scales.
     *
     * ⚠️ **NO GEOMETRY IS CREATED OR DESTROYED BY EITHER TRANSITION.** The layered stack is
     * still built once, at construction, exactly as before — promotion flips `visible` flags
     * and writes one instance matrix. The invariant this file has always had ("geometry never
     * changes after construction") is intact, deliberately, because a promotion that allocated
     * meshes would pay a first-draw GPU upload inside `r.render()` on the frame a wall is
     * first hit, which is the worst frame in the run to stall.
     */
    /** See `spent`. `?dig=1` segments only; every shipped row leaves it false. */
    this.demoteOpen = !!o.demoteOpen;

    this.instanced = false;   // owned by wallinstances.js; true == my meshes are off
    this.wantVisible = true;  // residency's answer, cached for the instance sync
    this.onPromote = null;    // () -> void, so a hit re-syncs in the SAME frame it lands

    this.state.onStageChange((stage, info) => {
      this._anim = 0.55;
      this._recomputeBox();
      this._apply();
      this.onPromote?.(this);
      this.onBreak?.(stage, info, this);
    });
    this._apply();
  }

  get stage() { return this.state.stage; }
  get open() { return this.state.stage >= FINAL_STAGE; }

  /**
   * Never been touched this round — stage 0 at full health. Computed from the state machine
   * rather than latched, so `WallField.resetAll()` demotes a panel for free and a client that
   * only ever hears `syncStage` agrees with the server without a second message.
   */
  get pristine() {
    // 🕳️ A free face is pristine until the first blow lands on it. `hits.length` is the field's
    // own record and is exactly what a replay reconstructs from, so the instanced-vs-promoted
    // answer can never disagree with the picture. It has to be checked FIRST: a free face's
    // state machine may still read stage 0 while a person-sized hole stands in it.
    if (this.field && this.field.hits.length) return false;
    return this.state.stage === 0 && this.state.stageHealth >= this.state.defs[0].health;
  }

  /**
   * SPENT — this panel will never change again, and its appearance is a CONSTANT.
   *
   * ⚠️ **THIS IS THE OTHER END OF `pristine`, AND IT IS WHY DEMOTION IS POSSIBLE AT ALL.**
   * `instancing-1` left no demotion deliberately and wrote down the condition for revisiting it:
   * *"dig makes deep digging routine and could put a dozen promoted segments in one room."* It
   * does — measured, `harness/scenarios/dig-promoted.mjs`: 37 promoted panels took the worst
   * parked station from 584 to 796 against a 625 budget. So a panel that can never move again
   * has to stop paying for its own meshes.
   *
   * Three conditions, and each one is load-bearing:
   *   · at the LAST stage of its own table — so `applyStageBreaks` has reached its terminal
   *     values and `stageHealth === def.health`, i.e. the per-stage progress term is exactly 0
   *   · not damageable — nothing can advance it
   *   · **`!canOpen()`** — it can never become a route. This is the clause that makes the whole
   *     mechanism INERT ON THE SHIPPED BUILD: `STAGE_DEFS`, `EXIT_DEFS` and `CHAINED_DEFS` all
   *     end at `open`, so every panel in a `?dig=0` house answers `canOpen() === true` and NOT
   *     ONE of them is ever spent. An `open` panel's look is constant too and could be demoted
   *     the same way — that is a real, separate win, and it belongs to a round that owns
   *     `wallinstances.js` and can re-run the twelve-station A/B on the default build.
   *
   * ⚠️ AND IT MUST NOT BE LATCHED, for `pristine`'s reason: `WallField.resetAll()` has to undo it
   * for free, and a client that only ever hears `syncStage` has to agree without a second message.
   */
  get spent() {
    // 🕳️ A free face can ALWAYS change — every cell can still be dug and the house-wide unlock
    // can still turn its barrier off under it — so it is never a constant picture and never a
    // candidate for the shared spent meshes.
    if (this.field) return false;
    const last = this.state.defs.length - 1;
    if (this.state.stage < last || this.state.isDamageable()) return false;
    /**
     * 🕳️ ⚠️ **`demoteOpen` IS THE ONE CLAUSE THAT CAN BE TRUE OF A PANEL THAT CAN OPEN, AND IT
     * EXISTS BECAUSE `docs/design/dig.md`'S HOUSE-WIDE UNLOCK REMOVES `!canOpen()` FROM EVERY
     * SEGMENT AT ONCE.** After the barrier drops, all 36 run on a table that ends at `open`;
     * without this every one of them would promote permanently the moment it was finished and
     * `dig-promoted.mjs`'s measured 754-against-625 worst case would return with no switch.
     *
     * It is sound for the same reason the `barrier` case is: `applyStageBreaks` is a function of
     * the stage INDEX and the per-stage progress, both tables terminate at index 4, and a
     * terminal stage has progress exactly 0 — so a finished segment's four break amounts are the
     * same constant whether the last row is called `barrier` or `open`, and the shared spent
     * meshes are already the right picture. `dig-unlock.mjs` asserts the two agree at the
     * uniform rather than trusting this paragraph.
     *
     * ⚠️ It is set ONLY by `room.js`, ONLY for `?dig=1` segments. Extending it to every `open`
     * panel in the house is a real, separate win — and it is a change to the SHIPPED build that
     * needs the twelve-station A/B, which is why it is a per-panel flag and not a relaxation of
     * the rule.
     */
    return this.demoteOpen || !this.state.canOpen();
  }

  /**
   * The panel's facing direction in world space — `rotY = 0` faces +Z, matching the layer
   * planes, which are built in the XY plane and rotated with the group.
   *
   * WHY THIS EXISTS. `hunter-ai._breach` used to build its slam direction as
   * `new Vector3(0, 0, hunterZ > 0 ? -1 : 1)` and its impact point as `(x + jitter, y + jitter, 0)`
   * — both of which silently assume every panel lies on the `z = 0` plane, which was true when
   * the level had exactly one divider. Half the mansion's panels sit in walls whose normal
   * runs along X, and against those the old code slams along the wall instead of into it and
   * places the impact 20 m away at z = 0. It would not throw; it would just never break the
   * wall, which is this project's most expensive class of bug.
   */
  get normal() {
    return new THREE.Vector3(Math.sin(this.rotY), 0, Math.cos(this.rotY));
  }

  /** Which side of the panel a world point is on: +1 along `normal`, -1 behind it. */
  sideOf(p) {
    const n = this.normal;
    const d = (p.x - this.root.position.x) * n.x + (p.z - this.root.position.z) * n.z;
    return d >= 0 ? 1 : -1;
  }

  /**
   * A jittered impact point on the face nearest `from`, built in the PANEL'S OWN FRAME and
   * transformed out — not pinned to a world plane.
   */
  hitPoint(from, rng = Math.random, out = new THREE.Vector3()) {
    const jx = (rng() - 0.5) * this.width * 0.45;
    const jy = (rng() - 0.5) * this.height * 0.45;
    out.set(jx, jy, 0).applyAxisAngle(_UP, this.rotY).add(this.root.position);
    return out;
  }
  /**
   * 🕳️ **WORLD POINT -> FACE UV.** The panel group is a Y rotation about `root.position`, so the
   * inverse is the transpose. `normal` is `R * (0,0,1)`, which is what pins the sign convention:
   * local +x runs along the face, local +y is world up, local +z is out into the owning room.
   */
  uvAt(p, out = { u: 0, v: 0, z: 0 }) {
    const c = Math.cos(this.rotY), s = Math.sin(this.rotY);
    const dx = p.x - this.root.position.x, dz = p.z - this.root.position.z;
    const lx = c * dx - s * dz;
    const ly = p.y - this.root.position.y;
    out.u = lx / this.width + 0.5;
    out.v = ly / this.height + 0.5;
    out.z = s * dx + c * dz;
    return out;
  }

  /** Face UV -> world point on the face plane. The inverse of `uvAt`, for FX placement. */
  pointAt(u, v, out = new THREE.Vector3()) {
    const lx = (u - 0.5) * this.width;
    out.set(lx, 0, 0).applyAxisAngle(_UP, this.rotY);
    out.x += this.root.position.x;
    out.z += this.root.position.z;
    out.y = this.root.position.y + (v - 0.5) * this.height;
    return out;
  }

  /**
   * 🎯 **THE INTERFACE `sledge-1` CALLS. One hammer blow, at a world point.**
   *
   *   `wall.applyHit(worldPos, power)  ->  { removed, brokeThrough, depthAt, blocked }`
   *
   * ⚠️ On a face with no damage field this falls back to the stage machine so the signature is
   * safe to call on ANY panel — a caller must never have to ask which kind of wall it hit.
   *
   * ---------------------------------------------------------------------------
   * 🚨 **THE SCALAR ARM RETURNED A CONSTANT THAT LOOKED LIKE SUCCESS AND WAS NOT A MEASUREMENT,
   * AND IT HAS NOW BEEN BELIEVED BY TWO INDEPENDENT AGENTS.**
   * ---------------------------------------------------------------------------
   * It read `removed: r?.changed ? 1 : 0.28 * power`. `changed` is true only when a STAGE is
   * crossed, so **every other outcome returned 0.28** — and those outcomes are not the same
   * thing at all:
   *
   *   · a blow that genuinely took a quarter of the stage's health off        → 0.28  (fair)
   *   · a blow on an UNDAMAGEABLE panel, which `applyDamage` refuses outright → 0.28  (a lie)
   *   · a blow on an already-open panel, likewise refused                     → 0.28  (a lie)
   *
   * `sledge-1` reported the constant when it first wired the swing; `strobe-1` then photographed
   * **six consecutive blows with `removed: 0.28`, `panelStage` stuck at 0 and the wall pixel-
   * unchanged across the contact window** and could not tell whether the hammer was broken.
   * Proved in pure node against the three stage tables: `STAGE_DEFS` (health 40) and `EXIT_DEFS`
   * (health 560) both cross a stage on blow 4, and only **`CHAINED_DEFS` — `health: 999999,
   * damageable: false` — reproduces "stuck at 0 forever while reporting 0.28"**. So the strobe
   * was standing at a chained connector, which is a STAGING fact; but nothing in the return
   * value could have told it that, which is a defect here.
   *
   * So `removed` is now derived from the health that actually left the panel, in the same units
   * the field arm reports (a full-power blow on a fresh stage is still ~0.28, so every existing
   * threshold in `views/game.js` keeps its meaning), and a refused blow returns **0** and sets
   * **`blocked`**.
   *
   * ---------------------------------------------------------------------------
   * 🧱 **AND THE SCALAR ARM NEVER FIRED `onChunk` AT ALL, WHICH IS THE REST OF "NOTHING HAPPENS
   * WHEN THE HAMMER LANDS".**
   * ---------------------------------------------------------------------------
   * The no-field branch RETURNED EARLY, before the `onChunk` call at the bottom of this method —
   * and `onChunk` is the only per-blow hook the view has (`views/game.js` hangs the slab, the
   * crumbs and the dust off it; `onBreak` fires only on a stage change). So on every ordinary
   * wall in the house **three blows in four produced no chip, no dust and no debris whatsoever**,
   * and on a chained connector none ever did. The strobe's four frames across contact — no dent,
   * no chips, no dust, no flash — are that, photographed.
   *
   * ⚠️ **IT IS STILL GATED, SO A CHAINED CONNECTOR STAYS SOLID.** `views/game.js` thresholds its
   * bursts on `info.removed` (`> 0.11` for a slab, `> 0.03` for dust), so a blocked blow now
   * reports 0 and spawns exactly nothing — which is `connectors.js`'s own reasoning that a
   * chained bay must read as solid rather than as a broken gun. What changes is that an ordinary
   * wall stops being silent, and that a caller can finally tell the two cases apart.
   *
   * @param {THREE.Vector3} worldPos
   * @param {number} power 0..1
   */
  applyHit(worldPos, power = 1) {
    if (!this.field) {
      // scalar fallback: one blow is one stage's worth of nibble, so the hammer still works on
      // every ordinary panel in the house
      const st = this.state;
      const stage0 = st.stage;
      const health0 = st.stageHealth;
      const full = st.def.health;
      const r = this.damage(full * 0.28 * power, { point: worldPos.toArray?.() ?? worldPos });
      /**
       * How much health actually left, as a fraction of the stage it left. Within one stage that
       * is the plain difference; across a crossing the blow spent the rest of the old stage, so
       * the fraction it removed OF THAT STAGE is whatever was left of it.
       *
       * ⚠️ **IT IS NOT SCALED BY 0.28 AGAIN.** A full-power blow spends `full * 0.28` health, so
       * this fraction ALREADY comes out at 0.28 — which is the number the old constant was
       * imitating and the magnitude `views/game.js`'s thresholds (`> 0.11` slab, `> 0.03` dust)
       * are written against. Measured with the extra factor in by mistake: an ordinary blow
       * reported 0.0784, which is under the slab threshold, so the wall threw dust and never a
       * chip — a quieter version of the same silence this whole fix is about.
       */
      const removed = st.stage === stage0
        ? Math.max(0, health0 - st.stageHealth) / Math.max(1e-6, full)
        : Math.max(0, health0) / Math.max(1e-6, full);
      const blocked = removed <= 1e-6;
      /**
       * 🧊 **AND THE FACE HAS TO CHEW, NOT WAIT FOR THE STAGE. `genexit-1`, 2026-08-15.**
       *
       * John, playing `?plan=gen` with the hammer: *"there are 3 chained doors on the perimeter
       * walls but I attacked each one many time and none seemed to take damage."* He was hitting
       * the RIGHT door for part of that.
       *
       * 🚨 **MEASURED, AND THE PROGRESS TERM WAS ALREADY BUILT AND CORRECT — IT WAS SIMPLY NEVER
       * CALLED.** `_apply()` computes `p = 1 - stageHealth / def.health` and hands it to
       * `applyStageBreaks`, which tears the CURRENT stage's own layer back by `p * 0.30`. Its only
       * callers were the stage-change listener, the constructor, `resetDamage()`, `recoat()` and
       * the 0.55 s `_anim` window. **Never this, the damage path.** So on an exit connector
       * (`harness/scenarios/_genexit1-frozen.mjs`, 24 real sledge blows, reading the shader's own
       * `uBreak` floats):
       *
       *     uBreak per blow:  * = = = = = =  * = = = = = =  * = = = = = =  * = =
       *
       * **20 landed blows inside a stage moved the health 20 times and the PICTURE 0 times.** The
       * four `*` are the instancing promotion and three stage crossings. `applyHit`'s scalar arm
       * takes a FIXED FRACTION of the stage (`def.health * 0.28 * power`), so it is always 8 blows
       * per stage whatever the health is — seven of which used to be invisible.
       *
       * 🎯 **+0 DRAW CALLS, BY CONSTRUCTION, AND THAT IS ARITHMETIC RATHER THAN A HOPE.**
       * `_apply()`'s occlusion cut is *the first layer whose break is still 0*. The FIRST landed
       * blow already promotes the panel out of `wallinstances.js`'s shared pristine mesh and runs
       * `_apply()` through `setInstanced(false)` — measured `[0,0,0,0] -> [0.042,0,0,0]`, i.e. the
       * cut is already 1. All this does is let layer `stage`'s own float keep climbing 0.042 ->
       * 0.30 while every layer behind it stays at 0, so the cut cannot move. `_apply()` is four
       * uniform writes and five boolean writes, at one hammer blow a second.
       *
       * ⚠️ **NOT A PACING CHANGE, AND THAT IS THE BOUNDARY JOHN SET**: no health, no stage count,
       * no lock. `dig-band`, `dig-free` and `sledge-check` drive the FIELD arm and cannot reach
       * this branch at all. `?chew=0` restores the frozen face for an in-place A/B.
       *
       * ⚠️ **GATED ON A LANDED BLOW.** A refused blow (`blocked`) must not repaint anything — a
       * chained connector has to keep reading as solid, which is `connectors.js`'s own reasoning
       * and the thing `_genexit1-frozen.mjs` asserts on both decoys.
       */
      if (!blocked && CHEW) this._apply();
      // The impact is placed ON THE FACE, not at wherever the caller's ray happened to end, so
      // chips and dust sit in the wall plane exactly as they do on the field arm.
      const q = this.uvAt(worldPos);
      this.onChunk?.(this, {
        point: this.pointAt(Math.min(1, Math.max(0, q.u)), Math.min(1, Math.max(0, q.v))),
        normal: this.normal, removed, depth: 0, power, blocked,
        // the stage machine's own material for this stage — the same table `onBreak` uses, so a
        // chip thrown at contact is the material the collapse a moment later is made of
        kind: STAGE_DEBRIS[Math.min(stage0, STAGE_DEBRIS.length - 1)],
        chunkSize: Math.min(0.30, Math.sqrt(Math.max(0, removed)) * 0.64),
        brokeThrough: !!r?.changed && this.open,
      });
      /**
       * 🔊 **`barrier` IS ABSENT ON THE SCALAR ARM, NOT `false` — `genexit-1`, 2026-08-15, AND
       * THIS ONE KEY WAS THE WHOLE OF THE "A PADLOCKED DOOR AND A DOOR COMING APART SOUND THE
       * SAME" DEFECT.**
       *
       * It used to return a hard `false`, annotated *"the honest answer, not a stub: a stage
       * panel has no cyan structure behind it."* The first half of that is still true and the
       * conclusion was still wrong, because `audio.js` does not ask *is there cyan* — it asks
       * **`typeof opts.barrier === 'boolean'`**, i.e. *do you know?* A hard `false` answered "yes,
       * and there is none", which claimed the branch and left `blocked` unread on every scalar
       * blow in the game. Measured (`_genexit1-tell.mjs`, sledgehammer, three doors in a
       * generated house): a live exit reported `blocked=false` and a padlocked decoy reported
       * `blocked=true`, and **both rendered byte-identically** through the shipped
       * `playMeleeImpact` — proven by rendering them, not by reading the branch.
       *
       * Absent is the honest answer to *do you know?*: this arm has no per-point structure to
       * report. `blocked` then decides, which on a stage panel is the only true signal there is.
       * A refused blow gets the "NOT HERE" clank; a landed one falls through to the depth
       * inference at `depthAt: 0` and is the same wood impact it has always been.
       *
       * 🚨 **AND THIS IS WHY IT IS HERE RATHER THAN IN `audio.js`.** The obvious fix — move
       * `blocked` above `barrier` in that ladder — was written, measured and REVERTED inside one
       * run: **40 of 63 real hammer blows on a real free dig face report `blocked`** (hammer one
       * spot at the shipped x8 base and it bottoms out), so it would have put the refusal clank on
       * two dig blows in three. ⚠️ `audio.js`'s own "zero times in 63 blows" was measured on a
       * SYNTHETIC all-barrier field and does not hold on a real face; it is corrected there.
       * Fixing it here cannot reach the dig at all, because the field arm below still returns a
       * real boolean and still takes the same branch it always did.
       */
      return { removed, brokeThrough: !!r?.changed && this.open, depthAt: 0, blocked };
    }
    const p = this.uvAt(worldPos);
    const u = Math.min(1, Math.max(0, p.u));
    const v = Math.min(1, Math.max(0, p.v));
    const before = this.field.brokeThrough;
    const res = this.field.applyHit(u, v, power);
    if (res.removed > 0) {
      this._solidBoxes = null;
      this._sightBoxes = null;
      this._syncStageFromField();
      /**
       * 🚨 **THE BUG THAT MADE THE CYAN BARRIER INVISIBLE IN ALL TWELVE OF ROUND 1's CAPTURES,
       * AND IT IS A LIVE GAMEPLAY BUG, NOT ONLY A HARNESS ONE.**
       *
       * `_apply()` owns `barrier.visible` (and the layer-occlusion cut). Before this line its
       * ONLY triggers were: the constructor, a `WallState` stage change, `resetDamage()`, and
       * `update(dt)` for the 0.55 s of `_anim` a stage change opens. On a free face the stage is
       * a **monotone** summary — `_syncStageFromField()` is `if (want > this.state.stage)` — so
       * once a face has ever reached stage 4 no further digging can ever fire `_apply()` again.
       *
       * The field, meanwhile, IS resettable: `resetDamage()` zeroes `depth` and calls `_apply()`
       * (barrier off, correctly) but does not touch the state machine. So the sequence
       *
       *     dig to the barrier   ->  stage 4, barrier visible
       *     resetDamage()        ->  depth 0, barrier hidden, stage STILL 4
       *     dig to the barrier   ->  want 4, not > 4, no event, `_apply()` never runs again
       *
       * leaves `barrier.visible === false` over a hole dug clean through to it. That is exactly
       * what `chunk-thick.mjs` does before its deliverable shots (`reset(dud.id)` then 26 blows),
       * which is why `thick-8` through `thick-11` photograph a hole with a black hollow where
       * the campaign's central material should be — and why the critic's rank-1 defect is real
       * but was mis-attributed to the barrier not rendering at all.
       *
       * ⚠️ **AND `room.js` `setDigPlan()` CALLS `resetDamage()` ON EVERY DIG FACE ON EVERY ROUND
       * RESET**, so in the shipped build the barrier would go permanently invisible from round 2
       * onward on any face that had been dug out in round 1. Nothing throws; the wall simply
       * stops having an answer behind it.
       *
       * The fix is to stop deriving a per-texel fact from a per-panel event. `_apply()` is four
       * uniform writes and five boolean writes, it early-outs when the panel is instanced, and a
       * landed blow happens about once a second — so driving it from the thing that actually
       * changed (the field) costs nothing and cannot latch.
       */
      this._apply();
      this.onPromote?.(this);
      // ⚠️ COUPLED ONLY AT THE BREAKTHROUGH, NEVER WHILE DIGGING. `dig.md` §5: *"depth is
      // per-side... exposing it from room A tells you nothing about how far anyone has dug
      // from room B."* But when the last of the material between the two faces goes there is
      // ONE hole, not two — and an uncoupled breakthrough would give the graph an edge through
      // a wall that still physically blocks from the other side, which reads as an AI that
      // forgot what it was doing rather than as a data bug.
      if (res.brokeThrough) this._couple();
    }
    const kind = debrisKindForDepth(res.depthAt);
    this.onChunk?.(this, {
      point: this.pointAt(u, v), normal: this.normal, removed: res.removed,
      depth: res.depthAt, kind, power,
      /**
       * 🧱 **HOW WIDE THE PIECE THAT JUST LEFT THE WALL IS, IN METRES.** `removed` is m² × depth
       * and is what `views/game.js` already scales the crumb count by; this is the same quantity
       * turned back into a LENGTH so the falling slab can be the size of the patch. A full-power
       * blow on pristine wall removes ~0.19 → 0.28 m; a bottomed-out spot removes ~0.02 → 0.09 m,
       * which is under `game.js`'s floor, so a spot that has stopped giving way stops throwing
       * slabs as well as throwing fewer crumbs. That is `dig.md` §5's falloff — *"they can
       * destroy big chunks initially but it becomes less and less"* — as an object rather than
       * as a particle count.
       *
       * ⚠️ Capped at 0.30 m. `refs/_sheets/dig.png` puts the largest fragment at about 25 cm and
       * `wallSlab`'s fracture spreads a piece past its nominal width, so this is the reference's
       * number and not a taste.
       */
      /**
       * 🧱 **ROUND 12: BIG SLABS EARLY, CHIPS DEEP — `dig.md` §5's falloff as a SIZE and not
       * only as a count, and the cap comes up because the art says so.**
       *
       * `removed` alone already falls with depth, but it falls slowly and the 0.30 m ceiling
       * clipped a pristine blow (0.279) to within 7% of a mid-dig one, so the ordering John
       * asked for — *"they can destroy big chunks initially but it becomes less and less"* —
       * was arithmetically present and visually absent. The depth term makes it explicit: the
       * coat and the front of the shell come away in SHEETS, and a bottomed-out spot pays out
       * grit. Measured on the shipped brush: pristine 0.19 removed at depth 0 → **0.40 m**; the
       * same 0.19 at depth 0.8 → 0.20 m; a spent 0.02 at depth 1.0 → 0.065 m, which is under
       * `views/game.js`'s 0.09 floor, so a dead spot stops throwing slabs at all.
       *
       * ⚠️ **THE 0.30 CAP WAS SOURCED AND THE SOURCE WAS READ TOO CONSERVATIVELY.** Round 5
       * took *"the largest fragment is about 25 cm"* off `refs/_sheets/dig.png`. Looked at again
       * against the robots in tile 5 (`dig-gallery-sledge-crew`), whose bodies are 1.5–1.7 m,
       * the biggest slabs in the drift are **0.4–0.6 m** and the plates scattered across tile 2
       * are 0.35–0.5 m. 0.40 here comes out at ~0.50 m of real silhouette once `wallSlab`'s
       * fracture spreads it, which is the top of that range and not past it.
       */
      chunkSize: Math.min(0.40, Math.sqrt(Math.max(0, res.removed)) * 0.64
        * (0.72 + 0.95 * (1 - _smoothstep(0.15, 0.75, res.depthAt)))),
      brokeThrough: res.brokeThrough && !before,
      // symmetry with the scalar arm: a spot that has bottomed out took nothing off either
      blocked: res.removed <= 1e-6,
      /**
       * 🧱 **WHAT THE BLOW BROUGHT DOWN THAT IT DID NOT HIT.** `damagefield.js` `COLLAPSE`: wall
       * with nothing under it falls, so one well-aimed undercut can drop a storey. The view pays
       * it out as debris shaped like the region that left — see `views/game.js` `onChunk`. Null
       * on the overwhelming majority of blows, and null on every blow of a face nobody has been
       * through yet.
       */
      collapse: res.collapse ?? null,
      /** Where the collapsed region is, in world space, so the debris can spawn along it. */
      collapseAt: res.collapse ? this.pointAt(res.collapse.u, res.collapse.v) : null,
    });
    return {
      removed: res.removed, brokeThrough: res.brokeThrough, depthAt: res.depthAt,
      blocked: res.removed <= 1e-6,
      /**
       * 🔊 **IS THERE CYAN BEHIND *THIS SPOT* — the only signal that can tell a refusal from a
       * breakthrough**, for `audio.js` `playMeleeImpact` via `player.js`. `depthAt` reads 1.00
       * both at an indestructible barrier and at every cell punched clean through, so a clank
       * gated on depth congratulates the player for getting out: `audio-listen-1` drove a real
       * 63-blow dig and counted **10 blows on breakable material playing the dead "not here"
       * sound**. ⚠️ And `blocked` is NOT a substitute — measured on an all-barrier field it was
       * true **zero times in 63 blows**, because the 0.52 m brush always finds a neighbouring
       * cell it can still remove. The field already knows; it was simply never asked.
       */
      barrier: !!this.field.barrierAt(u, v),
    };
  }

  /**
   * 🕳️ **AN ACCESSOR, AND THE REASON IS THAT THE RENDERER NEEDS THE TWIN AS BADLY AS THE GRID
   * DOES.**
   *
   * `room.js` wires the pair with a plain `p.twin = …` after both faces are built. Everything
   * that reads the twin used to be gameplay (`_couple`, passability), so a field was enough.
   * `breakmask.js` `tTwin` made it a RENDER input too — the barrier plane cannot tell a hole
   * from a hole through half a wall without the far side's grid — and a uniform that has to be
   * wired by a second call is a uniform someone will forget to wire. Doing it here means the
   * one assignment `room.js` already makes is the only thing that has to be right.
   *
   * ⚠️ Idempotent, null-safe, and inert on the scalar arm (no field, no barrier plane).
   */
  get twin() { return this._twin; }
  set twin(t) {
    this._twin = t ?? null;
    const u = this.barrierMaterial?.userData?.barrierUniforms;
    if (!u) return;
    u.tTwin.value = t?.field?.texture ?? this.field?.texture ?? null;
    u.uTwin.value = t?.field?.texture ? 1 : 0;
  }

  /**
   * Mirror every newly-through cell onto the face on the other side of the same band.
   * The twin's local +x runs the OPPOSITE way round the wall, so `u` mirrors and `v` does not.
   */
  _couple() {
    const t = this.twin;
    if (!t?.field || t.field.cols !== this.field.cols || t.field.rows !== this.field.rows) return;
    const f = this.field, g = t.field;
    let changed = false;
    for (let cy = 0; cy < f.rows; cy++) {
      for (let cx = 0; cx < f.cols; cx++) {
        const i = f.idx(cx, cy);
        if (f.depth[i] < OPEN_AT || f.barrier[i]) continue;
        const j = g.idx(g.cols - 1 - cx, cy);
        if (g.depth[j] >= OPEN_AT && !g.barrier[j]) continue;
        g.depth[j] = 1;
        g.data[j * 4] = 255;
        // ⚠️ AND THE BARRIER GOES WITH IT. If material has physically gone all the way through
        // from this side there is nothing standing there, whatever the other side's rasterised
        // blob happened to say about that cell — a cell that is passage here and barrier there
        // is a hole you dug through and still cannot walk through. `mirrorBarrierFrom` makes
        // that unreachable at plan time; this makes it unreachable at run time as well.
        g.barrier[j] = 0;
        g.data[j * 4 + 1] = 0;
        g._maxDepth = 1;
        changed = true;
      }
    }
    if (!changed) return;
    g.dirty = true;
    g._touch();
    g.brokeThrough = true;
    t._solidBoxes = null;
    t._sightBoxes = null;
    t._syncStageFromField();
    t.onPromote?.(t);
    /**
     * 🚨 **THE TWIN'S FIELD JUST CHANGED AND NOTHING WAS RE-DERIVING ITS PICTURE FROM IT.** This
     * is the same latch `applyHit` calls out above, arriving through the other door: `_apply()`
     * owns `barrier.visible` and the layer-occlusion cut, and its only triggers on the twin are a
     * STAGE change and `_anim`. `_syncStageFromField()` is monotone, so on a twin that has
     * already reached stage 4 — every twin of an abandoned dig, and every twin the unlock
     * couples — it fires nothing, and the twin keeps drawing the layer stack and the barrier
     * visibility of the wall it had before the hole appeared in it. Four uniform writes on an
     * event that happens once per breakthrough.
     */
    t._apply();
  }

  /**
   * ⚠️ **THE STATE MACHINE IS KEPT AS A COARSE SUMMARY, NOT AS THE TRUTH.** Everything that
   * still asks a free face for a `stage` — the FX wiring, the noise the dig makes, the network's
   * `syncStage`, `debrisKind` — gets a sensible answer derived from the deepest point on the
   * face. It never drives passability; the field does. It is deliberately monotone so a stage
   * change fires once per threshold crossed and the breakthrough beat lands exactly once.
   */
  _syncStageFromField() {
    if (!this.field || !this.state.authority) return;
    const want = Math.min(4, Math.floor(this.field.maxDepth * 4.999));
    if (want > this.state.stage) this.state.setStage(want, null);
  }

  /**
   * 🕳️ ⚠️ **PASSABILITY, AND IT IS THE REAL WORK OF THIS SYSTEM.**
   *
   * The stage machine answered "is this panel solid" with a flag. A continuous wall is solid in
   * some places and not others, so the answer is a QUERY ABOUT A REGION: can a body of this size
   * get through the hole that has actually been dug. `DamageField.channel()` is that query and it
   * reads the depth array — never the texture, and never a cached second structure.
   */
  blocksMovement() {
    if (!this.field) return this.state.blocksMovement();
    return !this.field.channel(0.34, 1.70, 0.30, this.root.position.y - this.height / 2).open;
  }

  /**
   * 🚪 🚨 **"HAS A PLAYER DUG A BODY-SIZED WAY THROUGH THIS FACE" — WHICH IS NOT THE SAME
   * QUESTION AS `blocksMovement()` THE MOMENT A FACE CONTAINS A DOORWAY.**
   *
   * `room.js`'s house-wide unlock reads *"`dig.link.has(self.id) && !dig.opened.size &&
   * !self.blocksMovement()`"* on the interconnect face, with the comment *"the unlock fires when
   * a body can actually get through the interconnect — not when a texel reaches depth 1"*. That
   * is right, and it stops being right when the slab has a doorway in it: **`blocksMovement()` is
   * then false before the first blow, so the first `onPromote` on that face drops the barrier in
   * the whole house.** Measured in the built game (`_ap2-slab.mjs` B4): `f.svc_w.0.a` goes from
   * 3280 barrier cells to **0** on a bare `setBarrier(true)`, while its twin — which is not the
   * link face — correctly reads 3644. `dig.md`'s FIND clock, *"the search IS the game"*, would
   * read zero on every seed.
   *
   * ⚠️ **THE FIX IS ONE CLAUSE AND IT IS IN `room.js`, WHICH THIS SLICE DOES NOT OWN:** make that
   * condition `… && self.dugOpen`. This getter is that predicate, with the reasoning attached, so
   * the edit is a token rather than a re-derivation. It is **identical to `!blocksMovement()` on
   * every face with no doorway** — `viaDug` reads `field.aperture`, which is null everywhere but
   * a slab that was asked for one — so the default arm cannot notice it.
   */
  get dugOpen() {
    if (!this.field) return !this.state.blocksMovement();
    return this.field.channel(0.34, 1.70, 0.30,
      this.root.position.y - this.height / 2, true).open;
  }
  blocksProjectile() {
    if (!this.field) return this.state.blocksProjectile();
    // A bullet does not stand on the floor: any see-through cell at all lets shots past, which
    // is the same asymmetry the beam stage had and is most of what makes a half-dug wall
    // interesting. The panel is still TRACED (see `room.castRay`'s `forDamage`) so a shot into
    // standing material still lands and still throws chips.
    return !this.field.anySeeThrough();
  }
  blocksSight() {
    if (!this.field) return this.state.blocksLineOfSight();
    return !this.field.anySeeThrough();
  }
  get debrisKind() {
    if (this.field) return debrisKindForDepth(this.field.maxDepth);
    return STAGE_DEBRIS[Math.min(this.state.stage, STAGE_DEBRIS.length - 1)];
  }

  /**
   * 🕳️ **WHAT IS STILL SOLID, AS WORLD BOXES.** `room.js`'s `boxesNear`, `castRay` and
   * `blocksSight` all take this instead of the single panel AABB, and for a panel with no damage
   * field it returns exactly `[this.box]` when the state machine says the panel blocks and `[]`
   * when it does not — i.e. byte-identical behaviour for every shipped panel.
   *
   * ⚠️ Cached, and invalidated by the only two things that can change it: a landed blow and a
   * barrier change. Rebuilding it per frame would put a 1830-cell sweep in the collision loop.
   *
   * @param {boolean} [forSight=false] see-through rather than passable — see `DamageField`.
   */
  solidBoxes(forSight = false) {
    if (!this.field) return this.state.blocksMovement() ? _ONE(this.box) : _NONE;
    const cache = forSight ? '_sightBoxes' : '_solidBoxes';
    if (this[cache]) return this[cache];
    const rects = this.field.solidRects(forSight);
    const c = Math.cos(this.rotY), s = Math.sin(this.rotY);
    const n = this.normal;
    const t = this.bandThickness;
    const out = [];
    for (const r of rects) {
      // the rect's four corners on the face plane, then extruded back along -normal
      const x0 = (r.u0 - 0.5) * this.width, x1 = (r.u1 - 0.5) * this.width;
      const y0 = this.root.position.y + (r.v0 - 0.5) * this.height;
      const y1 = this.root.position.y + (r.v1 - 0.5) * this.height;
      // world positions of the two ends of the run, on the face
      const ax = this.root.position.x + c * x0, az = this.root.position.z - s * x0;
      const bx = this.root.position.x + c * x1, bz = this.root.position.z - s * x1;
      const box = new THREE.Box3(
        new THREE.Vector3(Math.min(ax, bx), y0, Math.min(az, bz)),
        new THREE.Vector3(Math.max(ax, bx), y1, Math.max(az, bz)));
      // extrude through this face's share of the wall band
      box.expandByPoint(new THREE.Vector3(box.min.x - n.x * t, box.min.y, box.min.z - n.z * t));
      box.expandByPoint(new THREE.Vector3(box.max.x - n.x * t, box.max.y, box.max.z - n.z * t));
      // a zero-thickness slab collides with nothing; give a wall run a minimum in both axes
      if (box.max.x - box.min.x < 0.02) { box.min.x -= 0.01; box.max.x += 0.01; }
      if (box.max.z - box.min.z < 0.02) { box.min.z -= 0.01; box.max.z += 0.01; }
      out.push(box);
    }
    this[cache] = out;
    return out;
  }

  /**
   * What a RAY stops on. `room.castRay`'s gate, moved onto the panel so the free path and the
   * scalar path answer the same question in the same place.
   *
   * ⚠️ `|| blocksProjectile()` is not a widening — see `room.js`'s note; it is what makes a shot
   * at a padlocked door stop and throw chips instead of passing through it.
   */
  traceBoxes(forDamage = false) {
    const stops = forDamage ? (this.state.isDamageable() || this.state.blocksProjectile())
      : this.state.blocksProjectile();
    if (!this.field) return stops ? _ONE(this.box) : _NONE;
    // A free face is always damageable and always stops a shot that lands on standing material;
    // which material is standing is the decomposition's answer, not a flag's.
    return this.solidBoxes(true);
  }

  /** What blocks a SIGHTLINE. Same shape, and `[]` when the panel does not block sight at all. */
  sightBoxes() {
    if (!this.field) return this.state.blocksLineOfSight() ? _ONE(this.box) : _NONE;
    return this.solidBoxes(true);
  }

  /** Metres of contiguous passable channel through this face, and where. A probe's summary. */
  openChannel() {
    if (!this.field) return { open: !this.blocksMovement(), width: this.blocksMovement() ? 0 : this.width, centreU: 0.5 };
    return this.field.channel(0.34, 1.70, 0.30, this.root.position.y - this.height / 2);
  }

  /**
   * Damage entry point. Only lands if the owning field has authority.
   *
   * ⚠️ The promote hook fires on EVERY landed hit, not only on a stage change, because the
   * first chip is what stops a panel being pristine. Without it a wall that has taken damage
   * but not yet crossed a stage would keep being drawn by the shared instance for a frame —
   * `wallinstances.sync()` also sweeps every panel, so this is the latency fix, not the
   * correctness one.
   */
  damage(amount, hit = null) {
    /**
     * 🕳️ **THE NAIL GUN ALREADY CARRIES THE POINT, SO IT NEEDS NO CHANGE TO WORK POSITIONALLY.**
     * `weapons.js` `hitWall` has always called `panel.damage(dmg, { point, weapon })`, so on a
     * free face this routes straight into the brush. That is why nothing in `sledge-1`'s or
     * `weapons.js`'s files has to move for the new system: every existing damage source becomes
     * positional the moment the panel it lands on has a field.
     *
     * The power conversion is stated rather than tuned: one nail-gun round (26) is a chip, one
     * hammer blow is a full-power brush. `POWER_PER_HP` makes 100 points of damage one blow, so
     * the gun stays a bad tool for digging — which is the design (`dig.md` §5: the loud, slow way
     * in) and is what keeps `dig-feel.mjs`'s ratio meaningful.
     */
    /**
     * 🚨 **A POINTLESS HIT ON A POSITIONAL FACE STILL GOES THROUGH THE BRUSH, AND THAT IS A
     * CORRECTION OF A TRAP THAT HAS ALREADY COST A CRITIC ROUND.**
     *
     * `damage(n, { weapon })` with no `point` used to fall through to `state.applyDamage`, i.e.
     * to the SCALAR stage machine — on a face whose truth is the field. **Measured** (2026-08-09,
     * `harness/scenarios/_digside1-diag2.mjs`, `f.svc_w.1.a`, the exact drive `dig-shots.mjs`
     * uses for its "terminal" stage):
     *
     *     p.damage(1e5, { weapon: 'nailgun' }) x8
     *     ->  stage 0 -> 4 "open", pristine true -> false, instanced true -> false,
     *         field hits 0, maxDepth 0.000, barrier.visible FALSE, layers "1000"
     *
     * So the panel de-instanced and drew its own layer 0 with the scalar break mask at the
     * terminal stage — **28.2% of the frame moved** — over a damage field that had never been
     * touched: a wall the state machine calls "open", with no hole in it, no cyan behind it and
     * every layer under the first one culled. `critic-slice-1` staged both of its dig frames
     * that way and filed the result as the dig failing to read; the frames are of a wall nobody
     * dug. **A face that owns a field must not have a second, disagreeing picture**, so a hit
     * with no point lands in the middle of it, which is the only position a caller who did not
     * name one can mean.
     *
     * ⚠️ Inert everywhere it could matter. Every damage source in `src/` passes a point
     * (`weapons.js` `hitWall`, `hunter-ai.js` `_breach`, `wall.js`'s own sledge path), and with
     * `?dig=0` no panel in the house owns a field, so this branch is unreachable on the shipped
     * build. `?dig=bays`' segments have no field either — `dig-feel.mjs` and `dig-promoted.mjs`
     * drive `d.*` panels and are unaffected.
     */
    if (this.field) {
      const pt = hit?.point
        ? (Array.isArray(hit.point)
          ? new THREE.Vector3(hit.point[0], hit.point[1], hit.point[2]) : hit.point)
        : this.pointAt(0.5, 0.5);
      const r = this.applyHit(pt, Math.max(0.02, Math.min(1, amount / 100)));
      return { changed: r.brokeThrough, from: this.state.stage, to: this.state.stage, stagesCrossed: [], overkill: 0 };
    }
    const r = this.state.applyDamage(amount, hit);
    if (r && r.changed !== undefined && this.instanced && !this.pristine) this.onPromote?.(this);
    return r;
  }

  /** Client path: the server said this panel is now at `stage`. */
  syncStage(stage, info) { return this.state.syncStage(stage, info); }

  update(dt) {
    /**
     * ⚠️ **ONE TEXTURE UPLOAD PER FRAME, AND THIS IS THE ONLY PLACE IT HAPPENS.** `room.update()`
     * walks every panel once a frame, so a hammer landing three times a second, or two players
     * digging the same face, costs exactly one upload — not one per hit. `flush()` early-outs
     * when nothing changed, so an undamaged house pays a boolean test per panel.
     */
    if (this.field) this.field.flush();
    if (this._anim > 0) {
      this._anim = Math.max(0, this._anim - dt);
      this._apply();
    }
  }

  /** 🕳️ Set (or clear) this face's interconnect region. See `DamageField.setInterconnect`. */
  setInterconnect(cu, cv, ru, rv, salt) {
    if (!this.field) return false;
    this.field.setInterconnect(cu, cv, ru, rv, salt);
    this._solidBoxes = null; this._sightBoxes = null;
    return true;
  }

  /** 🕳️ The house-wide unlock, on this face. Every dug cell becomes a doorway on this frame. */
  setBarrier(on) {
    if (!this.field) return false;
    this.field.setBarrierEverywhere(on);
    this._solidBoxes = null; this._sightBoxes = null;
    /**
     * 🚨 **THE BUG JOHN HIT: "I THOUGHT I HAD DESTROYED ENOUGH STUFF BUT I COULDN'T GET THROUGH."**
     *
     * The docstring one line up — *"every dug cell becomes a doorway on this frame"* — was a
     * promise this function did not keep, and `harness/scenarios/_pf1-diag2.mjs` measures the
     * gap on **42 of 42 span x seed pairs**: the near face reports an open channel, the twin is
     * untouched and solid, `blocksMovement()` is per FACE, and the collider walks BOTH. So the
     * hole is one the game shows you and refuses you.
     *
     * 🎯 **AND IT IS ONE MISSED CALL, NOT A DESIGN FAULT.** `_couple()` is the only thing that
     * ever tells the far face a hole exists, it runs only on a landed blow, and it skips every
     * cell with a barrier behind it (`if (f.depth[i] < OPEN_AT || f.barrier[i]) continue`) — so
     * every cell you dug to the bottom while the cyan was still there was skipped, correctly, at
     * the time. Dropping the barrier makes all of them passable **on this face** in the same
     * instant, and nothing re-asked the question for the far one.
     *
     * ⚠️ **THIS IS THE SHIPPED MECHANIC AND NOT ONLY THE `[B]` TEST KEY.** `room.unlockBarrier()`
     * reaches this same line, so a legitimate interconnect breakthrough was leaving every
     * abandoned dig in the house see-through and impassable — against `dig.md`'s own sentence
     * that *"a dud you had already dug to the bottom becomes a door on the same frame"* and
     * John's *"walk through the other areas they destroyed the white wall through."*
     * `_pf1-diag2` P3 fails on exactly that and is the gate for this line.
     *
     * ⚠️ **IT IS ALSO WHY THE BUG READS AS INTERMITTENT, WHICH IS THE PART THAT MAKES IT
     * EXPENSIVE TO DIAGNOSE.** P2 drove ONE more blow at the rim of the refused hole: it fires
     * `_couple()` with the barrier already gone, mirrors all 602 through-cells at once, and the
     * body goes from **-0.19 m to 8.6 m past the face**. A player who keeps swinging never sees
     * this; a player who trusts the hole they can see through walks into a wall.
     *
     * `openCells` is `depth >= OPEN_AT && !barrier`, so an untouched face costs one counted scan
     * and skips the mirror entirely — this fires on the handful of faces somebody has actually
     * been digging.
     */
    if (!on && this.field.openCells > 0) {
      this.field.brokeThrough = true;
      this._couple();
      this._apply();
    }
    this.onPromote?.(this);
    return true;
  }

  /**
   * 🎨 **PUT THIS FACE INTO THE CURRENT COAT ARM.** Returns true if anything changed.
   *
   * ⚠️ **THE EARLY-OUT IS WHAT MAKES ARM 0 THE SHIPPED BUILD.** Every panel is constructed at
   * arm 0, so on the default arm this is `if (0 === 0) return false` and not one material, mesh
   * or program is touched. That is asserted rather than argued —
   * `harness/scenarios/_coat1-programs.mjs` reads the program count and the arm together.
   *
   * ⚠️ **SCALAR PANELS ARE NEVER COATED.** The coat exists only on the damage arm; every `p.*`
   * and `x.*` panel keeps the wallpaper stage, so `wall.sheet` (PASS 78), `wall.transition`, the
   * four studio stage views and `wallinstances.js`'s shared pristine/spent copies cannot be
   * reached by any of this — exactly as the `this.field` gate above already guarantees.
   *
   * ⚠️ **`_apply()` AT THE END IS NOT OPTIONAL.** A fresh `applyBreakMask` starts the new
   * material's break uniforms at their defaults, and `_apply()` is the one place that writes this
   * panel's real state back into them (`applyStageBreaks` off `state.stage`/`stageHealth`).
   * Without it a re-coat mid-dig would repaint the face pristine for as long as nothing else
   * changed its stage.
   */
  recoat() {
    if (!this.field || !this.layers) return false;
    const arm = coatArm();
    if (this._coatArm === arm) return false;
    // No room, no bake, or arm 0 → the shipped hardcoded coat, byte for byte.
    const next = panelCoatMaterial(this) || estateSkinMat();
    this.mats[0].dispose();
    this.mats[0] = next;
    this._patchLayerMaterial(0);
    this.layers[0].material = next;
    this._coatArm = arm;
    this._apply();
    /**
     * 🧱 **THE ONE LISTENER, AND IT IS WHY A LIVE `[C]` FLIP REACHES AN UNTOUCHED FACE.**
     * `wallinstances.js` groups pristine faces by their coat, so a re-coat changes which shared
     * `InstancedMesh` a face belongs to. It sets this hook and regroups on the next `sync()`
     * (which `room.setViewpoints` runs every frame), so the arm flip is one press and one frame
     * for the whole house. Nothing else in the build sets it; `room.js` wraps `onPromote`, not
     * this. Fired AFTER `_apply()` so the listener sees the finished state.
     */
    this.onRecoat?.(this);
    return true;
  }

  /**
   * Undo every blow. Called by the round reset beside `WallField.resetAll()`.
   *
   * 🚨 **AND THE STATE MACHINE GOES WITH THE FIELD, WHICH IT DID NOT — THIS IS `skin-1`'S AND
   * `critic-skin-1`'S "THE FACE RECTANGLE IS A FLAT DARK PLANE AFTER A RESET".**
   *
   * On a free face the stage is a MONOTONE SUMMARY OF THE GRID — `_syncStageFromField()` is
   * `if (want > this.state.stage) setStage(want)`. Zeroing the field without zeroing the summary
   * leaves the panel at **stage 4 with depth 0**, and two things follow, neither of which throws:
   *
   *   · `_apply()` below runs `applyStageBreaks(mats, stage 4, 0)` — the LAST stage's terminal
   *     break amounts written into a face whose grid says nothing has been touched.
   *   · `get pristine()` is `state.stage === 0 && …`, so it stays **false** and
   *     `wallinstances.js` never takes the face back into the shared pristine instance. It draws
   *     its own, fully-broken, layer 0 for the rest of the round.
   *
   * Measured: **54 329 px>16 from the intact frame against a 552 floor** (`skin-1`), reproduced
   * three times by `critic-skin-1` (55 620 / 53 184 / 50 103 against 558 / 557 / 422), and
   * isolated to the arm where zero skin erosion occurred — so it was never the dressing.
   * `harness/scenarios/_mortar1-reset.mjs` photographs intact → damaged → reset and carries the
   * PRE-FIX body as the control that must fail.
   *
   * 🎯 **IT IS THE SAME LATCH `applyHit` DOCUMENTS FOR THE BARRIER**, arriving through the other
   * half of the same object: *"dig to the barrier → resetDamage() → depth 0, barrier hidden,
   * stage STILL 4"*. That note fixed the barrier by driving `_apply()` off the field; this fixes
   * the look by making the summary agree with the field it summarises.
   *
   * ⚠️ **IT PREDATES `pristine-1` AND WAS NOT WIDENED BY IT — `pristine-1`'S ARMS MASK IT, WHICH
   * IS NOT THE SAME AS FIXING IT.** `pristine-1` changed `wallinstances.js`'s GROUP KEY;
   * `pristine` is this file's and is unchanged. Run on both arms, the pre-fix reset leaves
   * **byte-identical state** — `stage 4 · pristine false · instanced false · breaks
   * [0.95, 0.95, 0.94, 0.90]` — while the PIXELS differ by two orders of magnitude:
   * **44 222 px>16 on the shipped `?coat=0`, 128 px>16 on `?coat=1`**, both against a 0/23 floor.
   * The reason is the material the de-instanced face falls back to: on arm 0 the shared
   * `wall.pristine.face` draws the DAMASK while this panel's own `mats[0]` is `estateSkinMat()`,
   * so losing the instance swaps the surface; on arm 1 `coat-1` + `pristine-1` made the two the
   * same material and only the break amount differs — which on a damage-armed face is nearly
   * nothing, because the field TEXTURE drives that look and not `uBreak`.
   * 🎯 **So the visible half of this defect is `wall.js`'s own stated damask defect arriving
   * through the reset**, and the state half is live on every arm.
   *
   * ⚠️ **WRITTEN DIRECTLY RATHER THAN THROUGH `WallState.reset()`, AND THE REASON IS A SIDE
   * EFFECT, NOT A SHORTCUT.** `reset()` emits a stage change, and `views/game.js`'s `onBreak`
   * guards only its NOISE and its SOUND on `info.reset` — `debris.burst(18)` and `dust.burst(30)`
   * fire unconditionally. Going through the event would make `resetDamage()` throw a cloud of
   * rubble, which is new behaviour on the `[B]` path and on every direct caller (a round reset
   * already pays it, because `WallField.resetAll()` runs first and emits there). "Undo every
   * blow" must be silent. `onPromote` below is the hook `wallinstances.js` actually needs, and it
   * was already being called.
   *
   * ⚠️ **AUTHORITY-GUARDED**, exactly like `_syncStageFromField`: a client's stage comes from
   * `syncStage`, and a client that rewrote it locally would disagree with the server silently.
   */
  resetDamage() {
    if (!this.field) return false;
    this.field.reset();
    if (this.state.authority) {
      this.state.stage = 0;
      this.state.stageHealth = this.state.defs[0].health;
      this._anim = 0;
    }
    this._solidBoxes = null; this._sightBoxes = null;
    this._recomputeBox();
    this._apply();
    this.onPromote?.(this);
    return true;
  }

  _apply() {
    // progress through the CURRENT stage, from the machine's own health, so a panel part
    // way through plaster looks part way through plaster
    const p = 1 - (this.state.stageHealth / Math.max(1, this.state.def.health));
    applyStageBreaks(this.mats.slice(0, 4), this.state.stage, Math.min(1, p + (1 - this._anim / 0.55) * 0));
    /**
     * ⚠️ **A PANEL THE SHARED INSTANCE IS DRAWING MUST NOT TURN ITS OWN MESHES BACK ON, AND THIS
     * ONE LINE IS A REAL BUG THAT WAS ALREADY IN THE BUILD.**
     *
     * `setInstanced(true)` hides the five meshes and then early-outs on every later call, because
     * `this.instanced` is already true. But `_apply()` below assigns `layers[i].visible`
     * UNCONDITIONALLY, and `update(dt)` calls `_apply()` on every frame for the 0.55 s after any
     * stage change — including the change that made the panel instanced in the first place. So a
     * panel would go instanced, get its layers switched back on one frame later by its own
     * animation, and keep drawing them for the rest of the round: `sync()` cannot fix it, because
     * the (visible, pristine, spent) signature has not changed and there is nothing to re-sync.
     *
     * MEASURED, which is the only reason it was found: driving 36 segments to the barrier left
     * `ballroom.centre` at 765 calls where the same state re-synced by hand reads 627 — 152 own
     * layer planes on screen against 13, and the reveals correctly hidden the whole time, which
     * is the fingerprint (`setInstanced` had run; `_apply` had undone four fifths of it).
     *
     * It is latent on the shipped build rather than absent: `WallField.resetAll()` emits a stage
     * change on every damaged panel, which re-pristines it AND sets `_anim = 0.55`, so the same
     * race exists there. Fixing it here fixes both, and the break amounts above are still applied
     * so that `setInstanced(false)` restores the right picture.
     */
    if (this.instanced) return;
    if (!this.occludeLayers) { for (let i = 0; i < 4; i++) this.layers[i].visible = true; return; }
    /**
     * 🕳️ **THE SAME OCCLUSION RULE, ASKED OF THE DEEPEST POINT ON THE FACE.** A layer whose
     * band the dig has not reached ANYWHERE is fully intact everywhere, so it is still an opaque
     * depth-writing occluder for everything behind it and everything behind it can be dropped.
     * This matters far more here than it did for a bay: a free face is 5.7 m x 2.8 m, so four
     * coplanar planes of it is real fill rate, and `walls-perf.md` records the GPU budget at
     * 1.33–1.60 ms against 1.39. Pristine still draws ONE plane.
     */
    let cut = 4;
    if (this.field) {
      const d = this.field.maxDepth;
      for (let i = 0; i < 4; i++) { if (d <= DAMAGE_BANDS[i][0]) { cut = i; break; } }
      /**
       * ⚠️ **THIS IS A MESH-LEVEL EARLY-OUT FOR `uShowAt`, SO THE TWO NUMBERS MOVE TOGETHER.**
       * It was 0.5 against a `uShowAt` of 0.52. Round 6 drops `uShowAt` to `BARRIER_SHOW_AT`
       * because the shell now tears at depth 0.235 rather than 0.84, and a mesh switched off
       * above the shader's own threshold would hold the cyan back behind a hole that has already
       * opened — the transparency bug (`breakmask.js` `uOpenAt`) arriving through a second door.
       * Typed once, imported by both.
       */
      if (this.barrier) this.barrier.visible = d >= BARRIER_SHOW_AT;
    } else {
      // The first FULLY INTACT layer occludes everything behind it — see `occludeLayers`.
      // Pristine  -> [0,0,0,0]      -> cut 0 -> one plane drawn instead of four.
      // Plaster   -> [0.84,0.06,0,0]-> cut 2 -> the framing is dropped, the rest stands.
      // Beam/open -> no zeros       -> cut 4 -> nothing is dropped.
      for (let i = 0; i < 4; i++) { if (getBreak(this.mats[i]) <= 0) { cut = i; break; } }
    }
    for (let i = 0; i < 4; i++) this.layers[i].visible = i <= cut;
  }

  /** Every mesh this panel owns off (the shared instance is drawing it) or back on. */
  setInstanced(on) {
    if (this.instanced === on) return;
    this.instanced = on;
    if (on) {
      for (const l of this.layers) l.visible = false;
      this.reveal.visible = false;
      if (this.barrier) this.barrier.visible = false;
    } else { this.reveal.visible = true; this._apply(); }
  }

  _recomputeBox() {
    this.root.updateWorldMatrix(true, false);
    const c = new THREE.Vector3().setFromMatrixPosition(this.root.matrixWorld);
    // ⚠️ `bandThickness` defaults to `thickness`, so this is unchanged for every shipped panel.
    // A free face's collider fills its room's half of the wall band and the broad-phase AABB has
    // to be a superset of what `solidBoxes()` returns or a body slips past the narrow phase.
    const hw = this.width / 2, hh = this.height / 2;
    const ht = Math.max(this.thickness, this.bandThickness * 2) / 2;
    // axis-aligned approximation, rotated by 90-degree multiples in practice
    const along = Math.abs(Math.cos(this.rotY)) > 0.5;
    const ex = along ? hw : ht;
    const ez = along ? ht : hw;
    this.box.min.set(c.x - ex, c.y - hh, c.z - ez);
    this.box.max.set(c.x + ex, c.y + hh, c.z + ez);
  }

  dispose() {
    this.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of this.mats) m?.dispose?.();
    this.barrierMaterial?.dispose();
    this.field?.dispose();
    // ⚠️ `room.js` hands EVERY panel the same `mats.reveal`. Disposing a caller-owned material
    // from one panel's dispose() takes the reveal off every other panel in the house.
    if (this.ownsRevealMaterial) this.revealMaterial.dispose();
  }
}

/**
 * Force a material's program cache key to stay unique, even if something later assigns a
 * new one. Any assignment is composed onto the pinned prefix rather than replacing it.
 */
export function pinProgramKey(mat, unique) {
  if (!mat) return;
  let inner = mat.customProgramCacheKey ?? (() => '');
  Object.defineProperty(mat, 'customProgramCacheKey', {
    configurable: true,
    enumerable: false,
    get() { return () => `${unique}|${inner.call(this)}`; },
    set(fn) { inner = typeof fn === 'function' ? fn : () => String(fn); },
  });
}
