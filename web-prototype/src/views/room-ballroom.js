import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { estate } from './_studio.js';
import { estateMaterials, ceilingMat, foxedMirrorMat, parquetMat,
  boiserieMat, stoneMat } from '../world/materials-local.js';
import { GeoBin, STOREY, STOREY2 } from '../world/kit.js';
/**
 * 🆕 **THE ARCHITECTURE MOVED OUT** (`estate-3`, 2026-08-09). Every kit builder this view used
 * to call by hand — `wallRun`, `windowBay`, `archedOpening`, `cove`, `cofferedCeiling`,
 * `ceilingRose`, `pilaster`, `balustrade`, `pierGlass`, `urnOnPedestal`, `consoleTable` — is now
 * called from `src/world/ballroom-order.js`, which the PLAYABLE ballroom builds from as well.
 * This view still passes every literal it always had, and its capture is byte-identical across
 * the extraction. See the order's header, and the block at the first `ballroomOrder` call below.
 */
import { ballroomPlan, ballroomOrder } from '../world/ballroom-order.js';
import { dustSheetRow, chairRow, crateStack, trestle, paperScatter } from '../world/props.js';
import { grimeBand } from '../world/patina.js';
import { buildChandelier } from '../world/chandelier.js';
import { sconce, candelabra, driveFlicker } from '../lighting/practicals.js';
import { lightShaft, dustMotes, lightPool, glowPatch, driveVolumetrics } from '../lighting/volumetric.js';
import { ballroomEnv, spotKey, bounceFill, GRADES } from '../lighting/rig.js';
import { buildUnit4H } from '../characters/unit4h.js';

/**
 * ROOM.BALLROOM — the hero space. Battlefield 1's "Ballroom Blitz" and the Hitman 3 Paris
 * atrium are the bar.
 *
 * What those references actually teach, and what this room is built to:
 *   1. THE ORNAMENT DENSITY IS ABSURD. Every bay carries a pilaster with a capital, a
 *      panel with a gilt bolection inside a bolection, a dado, a frieze, a dentil cornice
 *      and a coffer overhead. Under-ornamenting is the standard failure and it is what
 *      makes a WebGL room read as a box with wallpaper.
 *   2. DOUBLE HEIGHT, and the eye must be able to measure it. The window order runs the
 *      full 9.6 m — two storeys of the kit stacked exactly — with a musicians' gallery
 *      cutting across at 5.2 so there is a horizontal to read the height against.
 *   3. THE WINDOWS DO THE LIGHTING. A row of real holes in the long wall and ONE spot
 *      outside: the shadow map turns that into six hard-edged patches of daylight
 *      marching down a black-and-white marble chequer, which is the Ballroom Blitz shot.
 *   4. Everything else is a practical. Three crystal chandeliers, sconces between the
 *      piers, a pair of candelabra. No second shadow caster anywhere.
 *
 * PLAN (metres)
 *   26 x 16 x 9.6.  Window wall x = -13 (six bays at BAY*1.8).  Mirror wall x = +13 with a
 *   musicians' gallery over it.  Arched openings in the end wall z = -8.
 */

const R = { x0: -13, x1: 13, z0: -8, z1: 8, h: STOREY2 };
const WIN = { w: 2.05, sill: 1.05, h: 4.35, spacing: 4.2, n: 5, z0: -6.4 };
const GALLERY_Y = 5.2;

/**
 * ---- `?mirror=` — THE PERMANENT ABLATION TOGGLE FOR THE END-PLATE REFLECTION ----------
 *
 * This exists because `critic-estate-7` measured this view at gpu 2.24-2.28 ms against a
 * 1.39 ms budget, over two consistent runs, and COULD NOT ATTRIBUTE IT — the round that
 * swapped the plates from a cube envmap to a planar reflection left no way to render the
 * old path, so "is the mirror the cost?" was unanswerable and the reading sat open. That
 * is the exact gap `perf-ao` avoided by keeping `?aodepth=prepass` permanently, and it is
 * why this is NOT debug scaffolding to be tidied away later: a change that cannot be
 * ablated cannot be judged, and this view has now paid that price once.
 *
 *   ?mirror=planar   (default) the shipping path — one scene render per plate at build
 *                    time into a 576x1024 target, sampled through EO_PLANAR.
 *   ?mirror=cube     the pre-r7 path — one 640 cube per plate (PMREM floors it to 512),
 *                    envMapIntensity 1.35, no planar patch and no EO_PLANAR program.
 *   ?mirror=off      no end plates at all. Not a shipping look; it is the strict upper
 *                    bound on what these two plates can possibly cost per frame, which is
 *                    the number that actually settles the attribution question.
 *
 * `mirror=cube` and `mirror=off` change the PICTURE, so never file a look verdict from
 * them. They change GPU time by the plates' own per-frame cost and nothing else.
 *
 * ---- WHAT THE TOGGLE ANSWERED, AND IT IS NOT THE MIRROR ------------------------------
 *
 * `node harness/perf-ab.mjs --view room.ballroom --extra "quality=medium" --config planar
 * --config cube --config off`, three interleaved rounds in one session after a discarded
 * round, `quality=medium`, RTX 3060 Ti:
 *
 *     planar 2.32 ms   cube 2.31 ms   off 2.30 ms      (within-config spread 0.02-0.07)
 *
 * The plates cost NOTHING per frame, and REMOVING THEM ENTIRELY costs nothing either — the
 * delta is smaller than the instrument can resolve. `estate-owner-9`'s "per-frame cost is
 * zero both before and after" is CONFIRMED, and `critic-estate-7`'s 2.24-2.28 ms is also
 * confirmed (I read 2.30-2.38 on a warmer machine). Both were right; they were about
 * different things.
 *
 * ⚠️ THE OVERRUN IS THE LIGHT COUNT, AND NOTHING ELSE COMES CLOSE. Same session, same tool:
 *
 *     census                       19 PointLight + 1 SpotLight + 3 DirectionalLight
 *     all 19 point lights removed  2.33 -> 1.23 ms   -1.10 ms   <- 47% OF THE FRAME
 *     all 23 lights removed        2.33 -> 0.95 ms   -1.38 ms
 *     scene.environment = null     2.33 -> 2.12 ms   -0.21 ms
 *     the shadow-casting spot      2.33 -> 2.17 ms   -0.16 ms
 *     AO pass off                  2.36 -> 2.21 ms   -0.15 ms
 *     bloom off                    2.36 -> 2.23 ms   -0.13 ms
 *     FXAA off                     2.36 -> 2.34 ms   -0.02 ms   (not resolvable)
 *     ALL volumetrics hidden       2.36 -> 2.34 ms   -0.02 ms   (not resolvable)
 *     renderScale 0.5              2.36 -> 0.81 ms   -1.55 ms   <- fragment-bound, not geometry
 *
 * That is ~0.058 ms per point light at 1080p, paid by EVERY fragment: three.js's forward
 * renderer unrolls `NUM_POINT_LIGHTS` into the fragment shader and evaluates all of them
 * everywhere, so a sconce's 6.5 m `distance` culls its CONTRIBUTION and not its COST.
 * Three chandeliers are two PointLights each (`chandelier.js` core + upper), nine sconces
 * and two candelabra are one each, plus two bounce cards: 6 + 9 + 2 + 2 = 19 exactly.
 *
 * ⚠️ IT IS NOT THIS VIEW'S DEFECT, IT IS THE SHOWCASE RIG'S — `room.gallery` measures WORSE
 * and nobody has ever flagged it: 3.32 ms with 17 point + 13 SPOT + 3 directional, and
 * killing all 33 takes it to 0.90 ms (-2.42, i.e. 73% of its frame is lights).
 *
 * ⚠️ AND THE SHIPPING GAME DOES NOT SHARE IT. `views/game.js` runs a FIXED FIVE-LIGHT RIG
 * for the whole mansion (one spot, three points, one hemisphere) precisely because
 * `numPointLights` is in three's program cache key — which is why `perf-spaces.mjs` reads
 * the worst mansion space at 1.22-1.38 ms against the same 1.39 ms budget. The budget is a
 * GAME budget and the game meets it. These six estate views are art references lit like art
 * references; bringing this one under 1.39 ms means deleting ~16 of its 19 practicals, which
 * is a look change in the room whose whole job is the look. NOT DONE UNILATERALLY: it is
 * priced above so a critic or the lead can rule on it, rather than a builder quietly
 * trading the hero room's atmosphere for a number the shipping renderer already clears.
 */
// ITEM 2 (estate-owner-16, ROUND 16, LOW PRIORITY): TRIED AND REVERTED. A critic's 3x crop of
// the drape (ITEM 3's fix, `estate-owner-15`) found "a flat, foldless plane with only a rim-lit
// edge" where the art shows fold banding, so this round tried replacing each side panel's flat
// `box()` with a real pleated surface (a PlaneGeometry sine-displaced in depth, ~5 folds across
// the 0.55 m panel). Geometry only — it never touched the drape's colour — but even at amp 0.012
// (a bare 12 mm ripple, visually almost flat) `grade.mjs`'s darkest-decile L read 8.05 against a
// ceiling of 8.0, and the budget had only ~0.3 left after ITEM 1 (vestibule, this round) moved
// it 7.5 -> 7.7. Larger amplitudes (0.03, 0.055) read 8.1-8.2, so the failure was not amplitude —
// it was ANY relief at all, most likely the new AO cavities firing at full occlusion regardless
// of visible fold depth, or the flat box's own thin edge faces (lost when swapped for a single
// plane) having been carrying more of the panel's rim highlight than expected. Not chased
// further because "do not break the canonical gate" is explicit and this item is filed
// low-priority/optional. Left for a future round with real toe-decile headroom to spend, or a
// fix that keeps the box's edge faces and displaces only its front face.

export default async function view(args = {}) {
  const qs = args.params ?? new URLSearchParams(location.search);
  const MIRROR = args.mirror ?? qs.get('mirror') ?? 'planar';
  if (!['planar', 'cube', 'off'].includes(MIRROR)) {
    console.warn(`[room.ballroom] unknown ?mirror=${MIRROR} — expected planar|cube|off. Using planar.`);
  }
  const mirrorMode = ['planar', 'cube', 'off'].includes(MIRROR) ? MIRROR : 'planar';
  // `?planarclip=flat` restores the pre-r10 FLAT near plane on the planar reflection, kept
  // permanently for the same reason `?mirror=` is: it is the only way to see what the oblique
  // clip is worth, and the round it replaced argued from a picture nobody could ablate. It is
  // also the break-test — with `flat`, the back of the end wall comes back and covers half the
  // left plate. See fitMirrorCamera.
  const PLANAR_CLIP = qs.get('planarclip') === 'flat' ? 'flat' : 'oblique';
  // ---- `?mirrorfilter=` — THE PERMANENT ABLATION TOGGLE FOR THE PLATE'S MINIFICATION -----
  //
  // ROUND 11. The remaining hate on this piece is "the near plate is still visibly softer
  // than the far one", and it is NOT a resolution problem at either end. Measured
  // (`harness/_tmp_eo11_plates.mjs`):
  //
  //     end-mirror.l   71 x 142 screen px   reflection target 506 x 1024   -> 7.1 : 1
  //     end-mirror.r  188 x 245 screen px   reflection target 568 x 1024   -> 3.0 : 1
  //
  // Both plates render MORE reflection than they can show and then throw it away: the
  // target was created with `minFilter: LinearFilter` and no mip chain, so one screen pixel
  // took a single bilinear tap out of a 7 x 7 texel footprint. That is textbook minification
  // ALIASING, and it destroys exactly the content the critic is looking for — the window's
  // glazing bars are 4-8 texels wide, i.e. far under the sampling interval, so they arrive as
  // speckle rather than as a grid. `harness/_tmp_eo11_rt.mjs` dumps the target and
  // `_tmp_eo11_ideal.mjs` box-filters it to 71 x 142: the correctly filtered version of the
  // SAME data is fully legible at the plate's real screen size.
  //
  //   ?mirrorfilter=point   the pre-r11 path: LinearFilter, no mip chain, one tap. THE BREAK
  //                         TEST — it puts the aliasing straight back.
  //   ?mirrorfilter=mip     trilinear + anisotropy, explicit LOD from the projected uv.
  //   ?mirrorfilter=sharp   (default) mip, plus a one-octave unsharp mask in the mip domain,
  //                         which gives back the acutance a box-filtered minification takes
  //                         out at the Nyquist band. One extra texture fetch.
  const MF = qs.get('mirrorfilter');
  const MIRROR_FILTER = ['point', 'mip', 'sharp'].includes(MF) ? MF : 'sharp';
  // `?floorreflect=0` — the ablation for the near-floor washout fix. See the block after the
  // end plates for the measurement that motivated it.
  const FLOOR_REFLECT = qs.get('floorreflect') !== '0';
  // `?pierreflect=0` — the ablation for round 17's planar reflection on the four pier glasses.
  // See the block after the floor reflection for what it replaced and why it was missed.
  const PIER_REFLECT = qs.get('pierreflect') !== '0';
  // `?outside=0` — the ablation for round 17's courtyard. Restores the emissive-lightbox
  // glazing AND removes the exterior, because the two only make sense together.
  const OUTSIDE = qs.get('outside') !== '0';
  // `?vestglow=N` — the ablation for round 17's vestibule emission. 0 restores r16 exactly.
  const VEST_GLOW = Number.isFinite(parseFloat(qs.get('vestglow')))
    ? Math.max(0, Math.min(8, parseFloat(qs.get('vestglow')))) : 1.0;
  // `?grime=N` — the ablation for round 17's skirting dirt. 0 removes it entirely.
  const GRIME = Number.isFinite(parseFloat(qs.get('grime')))
    ? Math.max(0, Math.min(4, parseFloat(qs.get('grime')))) : 1.0;
  /**
   * `?floorpattern=panel|plain` — WHICH WAY THE OAK IS LAID, AND THE DEFAULT CHANGED.
   *
   * 🚨 **THE DEFAULT FLIPPED TO `plain` DURING ROUND 17 AND THEN FLIPPED BACK. IT IS THE PANEL.**
   * `?floorpattern=plain` is the ablation and it is worth keeping, because the reasoning for
   * trying it was sound and the next person will have it again.
   *
   * Why it was tried: with the daylight matched to the bar (sun-patch chroma 35.8 against
   * its 35.9) the last thing a blind pair turned on was that the reference's floor reads as a
   * TONE and this one read as PATTERN — a 0.7 m panel cell with a 5 x 5 diamond lattice inside
   * every one of them, across the largest surface in every frame. Everything that could be
   * done without changing the pattern was done first and is still in the bake above: the joint
   * darkness came down (85% -> 44% toward black) and the relief was more than halved (35 mm ->
   * 16 mm at half normal strength). Both helped and neither was enough.
   *
   * ⚠ AND A SCALE CORRECTION WAS TRIED BEFORE THIS AND MADE IT WORSE — see the note at the UV
   * repeat below. Bigger cells put the pieces at a realistic 21 cm and made each panel FRAME a
   * bolder square; finer would hide the pattern and would be joinery nobody has ever made. The
   * two cannot both be had from a panelled floor, which is exactly why the reference does not
   * have one: it gets realistic pieces AND a calm floor by laying the same oak plain.
   *
   * 🚨 **AND WHY IT WENT BACK: THE PLAIN BOND NEVER CONVERGED.** Four passes, each one fixing a
   * real defect in it and each one revealing the next:
   *
   *   1. block size — read as brickwork
   *   2. joint width — the band is in lat-cell units, so a 0.92 x 0.24 m block got end joints
   *      four times fatter than its side joints; scaled by the cell aspect
   *   3. the bond was built from `pf`, which is PER-PANEL, so the courses restarted every
   *      0.72 m and the panel boundary it was meant to replace was still drawing itself;
   *      moved to the continuous `pp`
   *   4. and it still comes back as a field of rounded rectangles rather than as boards
   *
   * Each fix was correct and the thing still does not read as a plank floor. A pattern that
   * needs five corrections and is not converging is a worse bet than a coherent one that is
   * already solved, and the panel — with its joints softened (85% -> 44% toward black) and its
   * relief more than halved (35 mm -> 16 mm) — is coherent and solved. Those two fixes were the
   * real wins of this thread and they are unaffected by which bond is used.
   *
   * ⚠ SO THE OPEN COMPLAINT STANDS: this floor reads as more patterned than the reference's,
   * and closing it properly means a floor surface built to be plain rather than a panel
   * surface talked out of being one. That is a piece of work, not a parameter.
   */
  const FLOOR_PLAIN = qs.get('floorpattern') === 'plain' ? 1.0 : 0.0;
  // `?eograze=N` — the ablation for round 17's grazing-lobe widening. 0 restores the pre-r17
  // mirror on BOTH the floor and the end plates; 1 is the shipping physical coefficient. See
  // the long note above `planarEnvmapChunk`'s LOD block for what it does and why it is not a
  // strength knob. Parsed permissively and clamped rather than validated, so a sweep can pass
  // intermediate values without editing source.
  const EO_GRAZE = Number.isFinite(parseFloat(qs.get('eograze')))
    ? Math.max(0, Math.min(8, parseFloat(qs.get('eograze')))) : 1.0;
  // ---- `?floor=` — THE PERMANENT ABLATION TOGGLE FOR THE FLOOR MATERIAL -------------------
  //
  // ROUND 14. `critic-estate-11`'s fastest remaining tell: the bar (`refs/bf1/bf1-ballroom-01.png`
  // — note `refs/bf1/…`, not `progress/refs/…`) has a floor of WOOD PARQUET with chequer marble
  // only at the room's EDGES; this piece has run chequer edge to edge since round 1. The brief
  // filed three things this was expected to move: the whole-frame macro overshoot (ours 0.8815
  // against the art's 0.7796), the shaded-floor macro, and the paper litter's admitted ~40%
  // invisibility (half this floor is white marble at paper's own value).
  //
  // ⚠ MEASURED AFTER THE FACT, ONE OF THREE DID NOT MOVE THE WAY EXPECTED. Whole-frame macro got
  // WORSE, not better — 0.92-1.00 depending on the parquet's own brightness (see the material
  // block below), and reflection was ruled out as the cause. The mechanism, best guess: an
  // edge-to-edge alternating chequer averages toward its own block mean at 32 px (a block spans
  // several tiles), where a large uniform dark field next to a blown sun patch does not — so
  // replacing "busy but self-cancelling" with "flat plus one hard extreme" widens std/mean
  // regardless of the field's absolute tone. The paper legibility win is real and proven by
  // ablation (unchanged from r13, see `_eo13_paper.mjs`'s own note below) and the composition
  // now matches the bar's, which was the critic's actual top-line complaint; the whole-frame
  // macro NUMBER is not the same thing as the composition match and does not confirm it.
  //
  // ⚠ COUPLED TO THE r9 PLANAR-REFLECTION WIN. That patch's roughness gate (lo 0.06 / hi 0.42) is
  // authored for polished marble baking at ~0.135 roughness; PARQUET_SURFACE's own `rough`
  // formula centres near 0.40-0.45 in the clean field before wear or plank joints push it past
  // 0.6 — roughly double marble's baseline — so reusing marble's gate on wood asks for a knee that
  // has already closed and the floor would show no sheen at all. The patch is applied TWICE, once
  // per material, off the SAME render target (the two planes are 4 mm apart, i.e. coplanar for
  // this purpose, so one capture serves both) — see the reflection block below.
  //
  //   ?floor=mixed     the parquet field with the chequer marble left showing as a border at the
  //                    room's edges, matching the bar's composition.
  //   ?floor=chequer   THE COMPLETE PRE-r14 REVERT: no parquet plane is built, no second
  //                    reflection patch runs, and the base chequer plane's own gate is untouched
  //                    — byte-for-byte the r13 floor.
  //
  // DEFAULT DEPENDS ON `?cam=`, NOT A FIXED VALUE, and this is the fix applying its own lesson to
  // itself: this file's `?cam=r10` promises "every historic number stays checkable", and the
  // r10/pre-r14 gate figure was filed under the all-chequer floor — that material did not exist
  // at r10 any more than the vestibule key or the 165-sheet paper did. Building it unconditionally
  // (the first version of this line) would have been the EXACT bug `toggle-audit-1` found in
  // those two — caught here by re-measuring `?cam=r10` after landing this item and finding the
  // gate did not reproduce (0.147/33.5/5.6, a WARN, against the recorded 0.123/39.1/4.5) until
  // this coupling was added. An explicit `?floor=` still wins over the camera either way, so
  // `?floor=mixed&cam=r10` (the new floor under the old camera) stays reachable.
  const FLOOR = qs.has('floor')
    ? (qs.get('floor') === 'chequer' ? 'chequer' : 'mixed')
    : (qs.get('cam') === 'r10' ? 'chequer' : 'mixed');
  const FLOOR_BORDER = 2.2; // metres of chequer left showing at each edge under `mixed`
  // ---- `?daylight=` and `?depot=` — ROUND 12's TWO ABLATIONS ------------------------------
  //
  // `critic-estate-9` and `estate-owner-11` independently measured the one remaining gap to
  // the locked art as MACRO LIGHT/SHADOW VARIATION: 32-px block variation on the lit floor
  // 0.658 against the art's 0.915, with grain, micro-contrast, Sobel acutance and 10-90 edge
  // rise all AT PARITY. "This room is evenly lit; the reference has big hard sun patches and
  // deep shade."
  //
  // ⚠ MEASURED, AND IT IS NOT A GRADE PROBLEM AND NOT A SHADOW-TINT PROBLEM. Live ablation in
  // one boot (`harness/_eo12_macro.mjs`, four floor rects on the 1920x1080 frame):
  //
  //     the 19 point lights, ALL OFF        floor mean 78.3 -> 77.7    -0.8%
  //     the 19 point lights, ALL x6         floor mean 78.3 -> 58.7*   (*at env 1.8; +1%)
  //     the one SpotLight OFF               floor mean 78.3 -> 75.9    -3.1%
  //     the one SpotLight x12               floor mean 78.3 -> 84.4    +7.8%
  //     the 3 DirectionalLights OFF         floor mean 78.3 -> 74.9    -4.3%
  //     scene.environmentIntensity 3.2->0.8 floor mean 78.3 -> 22.9    -71%
  //
  // So ~95% of the light on this floor is a STRUCTURELESS FIVE-BOX IBL SHELL. That is the
  // whole of "evenly lit": the dominant source in the room has no shape, casts no shadow and
  // arrives equally from every direction, and no amount of work on the 20 punctual lights can
  // be seen underneath it. `estate-owner-11`'s "sweeping the SpotLight 300 -> 650 moves median
  // L 49.8 -> 49.8" is CONFIRMED and generalised: at 3.2 the shell drowns everything.
  //
  // ⚠ AND THE 19 POINT LIGHTS COST 47% OF THE FRAME (-1.10 ms of 2.33, `estate-owner-10`)
  // WHILE CONTRIBUTING UNDER 1% OF ITS LIGHT. They are not deleted here — the sconce and
  // chandelier GLOWS are sprites and would survive, but that is a look call on the hero room
  // and it belongs to a critic or the lead. It is priced, not taken.
  //
  //   ?daylight=hard  (default) the rebalance: the shell down, the sun up by the same energy,
  //                   the shaped bounce up. Same lamps, same count, same programs.
  //   ?daylight=flat  the pre-r12 levels EXACTLY, as the break test.
  //   ?depot=0        no packing cases, no trestles, no loose paper — the pre-r12 dressing.
  //   ?sunmap=N       the shadow map edge for the one daylight spot (default 2048, r11 was
  //                   1024). Its own toggle because `?daylight=flat` moves nine things at once
  //                   and the whole +0.22 ms this round costs turned out to be here: with the
  //                   depot ablated the geometry is NOT RESOLVED (-0.09 ms against a 0.24 ms
  //                   spread), so the map is the bill and it needs to be priceable on its own.
  const DAYLIGHT = qs.get('daylight') === 'flat' ? 'flat' : 'hard';
  const DEPOT = qs.get('depot') !== '0';
  // ⚠ `null` WHEN THE PARAM IS ABSENT, and the first version of this line got it wrong in the
  // way this project keeps recording: `Math.max(256, Math.min(4096, +(qs.get('sunmap')||0)||0))`
  // clamps the ABSENT case to 256, so the default build silently shipped a 256 px shadow map.
  // It did not throw and it did not look broken — it looked like a slightly brighter room —
  // and it moved the lit floor's mean 80.1 -> 85.9 and its p95 205 -> 240, i.e. it would have
  // been read as a real lighting result. Caught only because two captures of "the same" build
  // disagreed. A clamp is not a default.
  const SUNMAP = qs.has('sunmap') ? Math.max(256, Math.min(4096, +qs.get('sunmap') || 1024)) : null;
  //   ?vol=0          no light shafts and no dust motes. Round 12 moves the three shafts from
  //                   windows 1/2/3 to 0/1/2 (window 3 is at z 6.2, i.e. beside the camera at
  //                   z 6.1, so its prism was almost entirely off-screen while window 0's fills
  //                   the depth of the frame). This view is FRAGMENT-BOUND — renderScale 0.5
  //                   takes it 2.36 -> 0.81 ms — so moving a big additive volume INTO the frame
  //                   is a real suspect for the round's cost, and `estate-owner-10`'s
  //                   "volumetrics not resolvable" was measured on the OLD placement.
  const VOLUMETRICS = qs.get('vol') !== '0';
  // Every level this round moves, in one table, so `flat` is a real reproduction of the old
  // build rather than an approximation of it.
  //
  // ⚠ THE GRADE IS PART OF THE TOGGLE, and it has to be. Dropping the shell from 3.2 to 1.70
  // takes the frame's median luminance to 24 and its darkest decile to 1.1 — a FAIL and a WARN
  // on `harness/grade.mjs` — so the round would be un-shippable without re-centring the curve
  // over the new light. Leaving `GRADES.ballroom` at the r11 numbers under `?daylight=flat`
  // would then compare the old LIGHTING against the new GRADE, which is not the ablation
  // anybody wants and is exactly the kind of half-reverted A/B this project keeps being burnt
  // by. `flat` restores both.
  //
  // ⚠ AND THIS IS NOT "A STRONGER GRADE", which is the thing the brief warned against. Exposure
  // moves the whole curve and cannot create a difference between two points on it; what changed
  // is the RATIO between the two, and that is measurable independently of any grade:
  // turning the spot off now takes the lit floor down 40%, where before it took it down 3.1%.
  // The exposure lift is there to put the median back in the gate's 30-60 band after the
  // ambient came out, and the numbers below were solved together on one boot
  // (`harness/_eo12_gradesweep.mjs`, gate and macro in the same table).
  // ⚠ `lift: [0, 0, 0]`, NOT `lift: undefined`. Spreading an explicit `undefined` over the base
  // grade DELETES the field, and `Pipeline._applyGrade` does `fromArray(grade.lift)` with no
  // guard — so `?daylight=flat` threw `Cannot read properties of undefined` on the first frame
  // and shoot.mjs reported the whole view FAILED. An ablation that cannot boot is worse than no
  // ablation, because the next owner reads the flag in the header and believes it works.
  const FLAT_GRADE = {
    exposure: 1.05, vignette: 0.26, haze: 0.016, toeCrush: 0.005,
    highlightTint: [1.015, 1.00, 0.985], lift: [0, 0, 0],
  };
  //
  // ⚠ THE SUN'S DIRECTION IS IN THIS TABLE TOO, AND IT HAS TO BE. Round 12 also rakes the sun
  // from 26.1 to 21.6 degrees, which moves every floor patch and therefore which windows get a
  // shaft and where the pool decals land. A `flat` that restored the LEVELS but kept the new
  // ANGLE would be a break test of half the change, reported as a break test of all of it.
  const LIGHTS = DAYLIGHT === 'flat'
    ? { env: 3.2, sun: 300, bounce: 1.0, bounceCard: 2.2, grade: FLAT_GRADE, sunColor: 0xd6e4ff,
        dir: [0.865, -0.44, 0.24], aim: null, angle: 0.34, penumbra: 0.28, mapSize: 1024,
        shaftWins: [1, 2, 3], cardWins: [1, 3] }
    // ---- ROUND 17: THE KEY/FILL RATIO, RE-SOLVED AT PLAYER EYE HEIGHT --------------------
    //
    // `sun` 19400 -> 8150 and `bounce` 2.1 -> 7.35. This is the fix for round 17's #1 hate
    // ("every surface in direct sun clips to a textureless white plateau") and it is a
    // LIGHT-DISTRIBUTION change, not a grade one. What the sweeps established, in order:
    //
    //   _eye17_sweep      the daylight spot at 25% takes white-pixel share 4.56% -> 0.21%, so
    //                     the white IS the key. Exposure alone cannot reach it: 1.55 -> 0.90
    //                     is 0.78 of a stop and the patch is two stops over.
    //   _eye17_floorwhy   not the parquet's albedo, and not its specular either.
    //   _eye17_sheen      clearcoat, clearcoatRoughness and specularIntensity on both floor
    //                     materials move the frame by less than 0.1%. Not a lobe problem.
    //   _eye17_whatswhite not the light shafts, the light pools, the motes or the glow patch.
    //   _eye17_zfight     not a depth fight between the two floor planes.
    //   ?floorreflect=0   not the planar floor reflection (29.97% vs 30.24% bright).
    //
    // What is left, and what the `pqRed` frame shows directly: the sunlit floor is roughly two
    // stops past the ACES shoulder, and ACES desaturates as it saturates — force the parquet's
    // albedo to pure RED and its sunlit half still renders pale pink-white. That is why the
    // wood came back as white line-art with only its joint pattern surviving.
    //
    // ⚠ AND THE ROOM WAS ALREADY WRONG IN THE OTHER DIRECTION AT THE OTHER CAMERA. Against the
    // bar's own ladder (`harness/grade.mjs --img refs/bf1/bf1-ballroom-01.png`: median L 49.8,
    // toe 11.3), measured on the shipped build:
    //
    //     camera        median L before   after     the bar
    //     eye.floor          84.7          77.8       49.8
    //     eye.walk           59.0          57.7       49.8
    //     overlook           32.4          31.0       49.8
    //
    // ⚠ READ THAT HONESTLY: THE SPREAD IS BARELY NARROWED, AND CHASING IT FURTHER WAS TRIED AND
    // REJECTED. The obvious next step is more fill and less key still, and it does work at one
    // end — `_eye17_sweep --cam overlook` at exposure 1.45 / sun x0.70 / bounce x1.5 lands the
    // overlook at median 46.8, toe 10.8, white 0.92%, i.e. on the bar to within noise on all
    // three. The same triple takes eye.walk 57.7 -> 76.8 and eye.floor 77.8 -> 96.6. The two
    // framings pull in opposite directions because their SUBJECTS differ and no exposure can
    // reconcile that: the overlook looks at the room's shaded two thirds, and a standing player
    // looks along a sunlit floor. Since the shipped values put the WALKING player's frame
    // nearest the bar (57.7 against 49.8) and still hold the overlook inside grade.mjs's own
    // 30-60 band, they are what ships. The convergence is not the win here.
    //
    // ⚠ THE WIN IS HEADROOM AND COLOUR, and those did move, measured with
    // `harness/_eye17_clip.mjs` (share of pixels with no detail left in any channel):
    //
    //     camera        white% before   after     the bar
    //     eye.floor          4.56        0.24       1.20
    //     corner             2.73        1.21       1.20
    //     eye.walk           1.27        0.96       1.20
    //
    // and the local contrast INSIDE the bright region, which is the thing the hate was actually
    // about: eye.floor 3.73 -> 5.62, eye.walk 2.59 -> 6.45, corner 5.11 -> 6.33, against the
    // bar's 8.57. Not parity, but no longer a white plateau at any angle.
    //
    // ⚠ THE FILL IS THE THREE DIRECTIONAL bounceFill LIGHTS, NOT `env`, AND THAT IS DELIBERATE.
    // Rounds 11-12 measured that ~95% of the light on this floor was a structureless five-box
    // IBL shell, that this was the whole of "evenly lit", and that taking the shell 3.2 -> 1.70
    // is what let the sun patches read at all. Buying the dark half back out of the shell would
    // hand round 12 straight back. `env` is untouched at 1.70; the directional fill is this
    // file's own documented answer for putting modelling back without putting flatness back.
    //
    // The dust sheets, the crates and the marble veining come back inside the sun patches
    // instead of being white cut-outs. p90/p50 — the macro-contrast guard, so that the patches
    // are not simply being turned off — holds at 3.48 at eye.walk and 3.39 at the overlook
    // against 3.66 / 3.10 before: the patches still separate, they no longer clip.
    //
    // ⚠ `?daylight=flat` IS UNTOUCHED. It is the ablation that holds round 12's pre-rebalance
    // numbers, and re-tuning it here would delete the only reachable copy of them.
    // ---- ROUND 17, SECOND PASS: THE ROOM WAS STILL 18 L DARKER THAN THE BAR ---------------
    //
    // `sun` 8150 -> 5705 and `bounce` 7.35 -> 11.03, with `exposure` 1.28 -> 1.45 in the grade.
    //
    // The first pass of this round rejected exactly this triple, and the rejection was a
    // measuring error worth recording because it is THE error round 13's own note warns about.
    // It was turned down on the grounds that it took `eye.floor`'s median from 77.8 to 96.6
    // and `eye.walk`'s from 57.7 to 76.8, i.e. "further from the bar's 49.8". But `eye.floor`
    // is a CROUCH looking straight down a sunlit floor and the bar is a high overlook of a
    // room's shaded two thirds — comparing their medians compares their subjects, not their
    // grades. Round 13: "four rounds of surface work had been done inside a frame composed
    // differently from the thing it is judged against."
    //
    // Compared at the framing that WAS built to match the bar, this room was plainly too dark,
    // and after this round's three albedo re-solves the same triple now lands on the reference's
    // own ladder almost exactly:
    //
    //     cam=overlook          median L    toe L    white%
    //     before                  32.2       6.4      1.28
    //     after                   48.8      10.6      1.07
    //     refs/bf1-ballroom-01    49.8      11.3      1.20
    //
    // ⚠ AND IT PUTS `grade.mjs`'s DARKEST-DECILE GATE INTO WARN, ON PURPOSE. That gate's 2-8
    // band is stated in its own header to have been read off the two locked STUDY images. The
    // bar for THIS piece sits at 11.3 and would score WARN against it too — so a room chasing
    // 2-8 is chasing a number its own reference does not meet, and the way it gets there is by
    // crushing shadows, which `CRITIC_GUIDE.md` lists as a render tell in its own right
    // ("dead blacks ... a cut-out silhouette"). This build holds 0.8% of the frame at L <= 2.6
    // against the art's 0.1%. Matching the art is the point; the study's band is not the art.
    // ---- ROUND 18: `sunColor` 0xffc87e -> 0xffe4c0, AND THE OLD CLAIM WAS WRONG ------------
    //
    // 🚨 **THIS FILE HAS SAID SINCE ROUND 17 THAT THE SUN PATCH IS MATCHED TO THE BAR — "35.8
    // against its 35.9" — AND CROPPED SIDE BY SIDE IT IS NOT.** On the sunlit floor, rect
    // measured on both pictures at the same scale:
    //
    //     sun patch on the floor        rgb                  L       r-b   (r-b)/L
    //     refs/bf1/bf1-ballroom-01   231.5, 216.3, 186.2   217.4    45.3    0.208
    //     here, 0xffc87e             212.6, 182.3, 116.4   184.0    96.2    0.523
    //
    // Two and a half times the chroma. The bar's patch is a near-white cream and this one is
    // gold, and the two are not close. Whatever the earlier number measured, it was not these
    // two rects — and it is the reason a "matched daylight" was treated as settled while every
    // eye-level angle failed the chroma gate on the floor it lands on.
    //
    // ⚠ THE FIX IS THE COLOUR, NOT THE LEVEL, AND THAT IS NOT A PREFERENCE. Part of why the
    // bar's patch is so pale is that it is nearly blown (its top decile sits at L 217.7 with
    // 2.4% of the frame at L >= 250) and ACES desaturates hard up there. Buying the same
    // desaturation by driving this floor back into clipping would hand round 17 its own #1
    // hate straight back — "every surface in direct sun clips to a textureless white plateau".
    // So the level stays and the sun loses its amber: swept live at `eye.door` and read off the
    // same rect, 0xffdfb4 lands r-b 53.0 and 0xffe9cd lands 37.2, so 0xffe4c0 lands 44.9
    // against the bar's 45.3. The patch gets BRIGHTER doing it (184.0 -> 196.2, still 20 counts
    // under the bar) because the green and blue channels stop being thrown away.
    //
    // ⚠ AND IT IS ALMOST FREE EVERYWHERE ELSE, which is how you can tell it is the right term:
    // across the sweep the whole decile ladder is unmoved except the TOP decile (0.38 -> 0.24)
    // and the median does not move at all (57.2 -> 57.3). A sun colour should only show up
    // where the sun lands.
    : { env: 1.70, sun: 5705, bounce: 11.03, bounceCard: 5.0, grade: null, sunColor: 0xffe4c0,
        dir: [0.885, -0.375, 0.265], aim: [-4.7, 0, 0.2], angle: 0.42, penumbra: 0.22, mapSize: 2048,
        shaftWins: [0, 1, 2], cardWins: [0, 2] };

  // ---- `?cam=overlook|r10` — THE PERMANENT ABLATION TOGGLE FOR THE FRAMING ----------------
  //
  // ROUND 13. `critic-estate-10`'s #1 hate is not about a surface at all:
  //
  //   "shown unlabelled beside the piece's own PRIMARY bar (refs/bf1/bf1-ballroom-01.png), the
  //    fastest tell that these are not the same shot is the CAMERA, not any pixel-level render
  //    defect. The bar is a high overlook that is mostly wood parquet with checker only at the
  //    room's edges; this piece's default camera is a close three-quarter view dominated by
  //    checkerboard marble and ~45% ceiling/upper wall."
  //
  // Four rounds of surface work had been done inside a frame composed differently from the thing
  // it is judged against. `harness/_eo13_cam.mjs` puts a number on it that cannot be confounded
  // by lighting or grade: cast every pixel's ray and ask which face of the room box (x -13..13,
  // y 0..9.6, z -8..8) it leaves through. That is the frame's SUBJECT, independent of what is
  // standing in the way.
  //
  //     camera      floor%   ceiling%   window wall%   end wall%   near wall%   room corners
  //     r10          30.5      20.7        17.7          30.8         0.4          3 of 8
  //     overlook     40.3       3.7        18.9          31.3         5.8          4 of 8
  //
  // The eye height is what moves it: at 1.62 m the floor is seen at ~6 degrees of grazing and
  // costs a third of the frame; from the musicians' gallery it is seen at ~17 and costs 40%,
  // and the coffered ceiling stops being a fifth of the picture. Nothing about the room's read
  // is given up for it — see the note on scale below.
  //
  //   ?cam=overlook  (default) from just inboard of the musicians' gallery rail, pitched down.
  //   ?cam=r10       the shipping camera of rounds 1-12, EXACTLY. Every number on this piece
  //                  from `critic-estate-10` and earlier was taken here, so this is the only
  //                  way to compare against the board's own history rather than re-measure it.
  //
  // ⚠ THE FRAMING IS A SCENE-BUILD INPUT, NOT JUST A VIEW MATRIX, so it cannot be changed by
  // moving the camera live and there is no shortcut. The floor's planar reflection AND both end
  // plates are rendered ONCE at build time through a camera reflected about their own plane;
  // move the camera after that and those three surfaces — including the largest and best one in
  // the room — keep the OLD camera's reflection. `_eo13_cam.mjs` says so in its own header and
  // its pictures show it. Choose a framing live; capture it from source.
  //
  // ---- THE PLAYER-EYE SWEEP (`estate-owner-17`, ROUND 17) --------------------------------
  //
  // Rounds 1-16 judged this room through exactly two cameras, both of them looking the same
  // way down the room's long diagonal from the +x end. A room is not a diorama: the player
  // walks it, and every wall of it is a hero surface for however long they are facing it.
  // The first sweep at eye height found defects that neither `r10` nor `overlook` can see —
  // the window wall's own face, the ceiling read from below, the arches at the z -8 end.
  //
  // These are NOT ablations and NOT alternate framings to ship. They are the standing
  // validation set: capture all of them before filing any verdict on this piece.
  //
  //     node harness/shoot.mjs --view room.ballroom --extra "cam=eye.win" --review 1280
  //
  // ⚠️ THEY ARE SOURCE PRESETS RATHER THAN `--cam` OVERRIDES ON PURPOSE. The header above
  // says why and it is the whole reason this block exists: the floor's planar reflection and
  // both end plates are rendered ONCE at build time from the camera reflected about their own
  // plane. A `?campose=` override moves the view matrix AFTER that, so the largest mirror in
  // the room keeps showing the framing you just left. A sweep done with `--cam` would have
  // reported the reflection defects of the overlook at every one of these nine angles.
  //
  // Eye height is 1.65 m, the player's. `eye.floor` is a crouch and `eye.gallery` stands on
  // the musicians' gallery, which the player can reach.
  const CAM_DEFS = {
    r10: { pos: [7.4, 1.62, 6.1], target: [-5.2, 4.1, -6.4], fov: 66 },
    overlook: { pos: [9.6, 6.6, 7.0], target: [-4.5, 1.0, -4.0], fov: 56 },

    // — the player-eye sweep —
    'eye.door': { pos: [0, 1.65, 6.6], target: [0, 2.6, -8.0], fov: 62 },       // in at the south, down the room to the arches
    'eye.win': { pos: [4.0, 1.65, 0], target: [-13.0, 3.2, 0], fov: 62 },       // mid-room, square on the window order
    'eye.mirror': { pos: [-4.0, 1.65, 0], target: [13.0, 3.6, 0], fov: 62 },    // mid-room, square on the plates and the gallery
    'eye.up': { pos: [0, 1.65, 3.0], target: [0, 9.6, -2.0], fov: 70 },         // head back: coffers and the chandelier line
    'eye.corner': { pos: [-11.4, 1.65, 6.6], target: [11.0, 3.0, -7.0], fov: 66 }, // the long diagonal, from the far corner
    'eye.walk': { pos: [-10.5, 1.65, 6.8], target: [-10.5, 2.2, -8.0], fov: 62 },  // walking the window wall, raking the piers
    'eye.floor': { pos: [-5.0, 1.05, 3.0], target: [-1.5, 0.0, -3.0], fov: 55 },   // crouched on the chequer/parquet seam
    'eye.arch': { pos: [0, 1.65, -6.0], target: [0, 2.2, 8.0], fov: 66 },       // stood in the arches, looking back
    // ⚠ EYE HEIGHT ON THE GALLERY IS DECK + 1.65, NOT 6.5. The first pass put it at 6.5, which
    // is within a few centimetres of the balustrade's own handrail — so the capture came back
    // with a gilt rail lying across the middle of the frame and two balusters in the near
    // foreground. That is a camera error, not a defect in the room, and it is worth the note:
    // an eye-height preset on a raised deck has to be derived from the DECK (galleryY 5.2), or
    // it lands inside whatever is guarding the edge.
    'eye.gallery': { pos: [11.4, 6.85, 0], target: [-9.0, 1.4, 0], fov: 62 },  // on the gallery, over the rail

    // — two positions the first sweep missed, both of them somewhere a player actually stands —
    // `eye.under` is the covered aisle the musicians' gallery makes over the mirror wall: a
    // 2.3 m deck at 5.2 m turns that whole side of the room into a low colonnade, and NOTHING
    // in the sweep had been under it. It is also the only place in the room with a ceiling at
    // arm's reach, so it is where a soffit gets looked at.
    // `eye.back` is the reverse of `eye.win` — hard against the mirror wall looking across the
    // full 26 m at the window order, which is the widest view the room contains and the one a
    // player gets on walking in from the +x end.
    'eye.under': { pos: [11.6, 1.65, 5.4], target: [11.2, 2.4, -8.0], fov: 66 },
    'eye.back': { pos: [12.2, 1.65, 0], target: [-13.0, 3.0, 0], fov: 70 },

    // — and the five that finish the coverage —
    // `eye.corner` above is ONE of four corners. A room is not symmetric to a player: this one
    // has windows on one long side and a gallery over the other, so each corner looks at a
    // different pair of walls and each is a different picture. All three of the others.
    'eye.corner.ne': { pos: [-11.5, 1.65, -6.8], target: [11.0, 2.8, 7.0], fov: 66 },
    'eye.corner.se': { pos: [11.5, 1.65, -6.8], target: [-11.0, 2.8, 7.0], fov: 66 },
    'eye.corner.sw': { pos: [11.5, 1.65, 6.8], target: [-11.0, 2.8, -7.0], fov: 66 },
    // Standing INSIDE the vestibule looking back in — the arch is a way through, so a player
    // stands on both sides of it, and the room framed by its own opening is a shot this piece
    // has never taken.
    'eye.vest': { pos: [0, 1.65, -10.4], target: [0, 2.6, 8.0], fov: 66 },
    // And looking down at your own feet, which is where a player's eye goes whenever they are
    // not going anywhere. Nothing had ever photographed this floor from directly above it at
    // standing height.
    'eye.down': { pos: [-2.0, 1.65, 2.0], target: [-2.6, 0, 0.4], fov: 60 },
  };
  const CAM = CAM_DEFS[qs.get('cam')] ? qs.get('cam') : 'overlook';
  const CAM_DEF = CAM_DEFS[CAM];

  const engine = await estate({
    cameraPos: args.cameraPos ?? CAM_DEF.pos,
    target: args.target ?? CAM_DEF.target,
    fov: args.fov ?? CAM_DEF.fov,
    far: 90,
    envIntensity: 1.0,
    // ITEM 2 (camtool-1): `?orbit=1`'s live readout ports `_eo13_cam.mjs`'s own room-box
    // ray-cast, and `R` above is the exact box that script used (x -13..13, z -8..8, plus
    // the storey height). ⚠️ Orbiting here is still subject to this file's own build-time
    // caveat: the floor's planar reflection and both end plates are fitted to the camera
    // that existed when the scene was BUILT, so an orbited/`?campose=`-overridden frame's
    // mirror keeps showing the old camera's reflection. Fine for choosing a framing; not a
    // substitute for hard-coding it into `CAM_DEFS` and re-capturing, as this file's own
    // header above already says.
    roomBox: { x0: R.x0, x1: R.x1, y0: 0, y1: R.h, z0: R.z0, z1: R.z1 },
  });
  // ⚠ THE OVERLOOK NEEDS A LARGER TOE LIFT AND THE GATE IS WHY, not taste. The reframe trades a
  // fifth of the frame from evenly-lit ceiling to floor, and the floor's shaded two-thirds plus
  // the (now dark) vestibule sit at the bottom of the curve: the darkest decile falls
  // 4.5 -> 1.7 against a 2-8 target, i.e. a WARN, on a build whose median and top-decile chroma
  // both improve. `lift` moves the toe only and cannot manufacture the macro difference this
  // round is judged on (that is measured by the `?cam=r10` A/B, which is un-lifted and
  // reproduces `critic-estate-10`'s filed gate to two decimals). It is applied ONLY to the
  // overlook so `?cam=r10` remains a true reproduction of the board's own numbers rather than
  // the old lighting under a new curve — the half-reverted A/B this project keeps being burnt by.
  // ⚠ NOTED, NOT CHANGED (`toggle-audit-1`, round 14): `?cam=overlook&daylight=flat` gets NO toe
  // lift, because the spread below takes `LIGHTS.grade` (which `daylight=flat` sets regardless
  // of CAM) over `CAM_GRADE` whenever both are present. That combination is not on the board and
  // no filed verdict rests on it — flagged rather than fixed blind, since a change here would
  // touch the `?daylight=flat` break-test's own grade too and that ablation has its own
  // documented reasoning a few lines up that this round did not re-derive.
  // ⚠️ `r10` KEEPS NO LIFT so it stays the byte-for-byte reproduction of the board's own
  // numbers this file promises; every other camera — the shipping `overlook` and the whole
  // eye sweep — gets the shipping toe, because the toe is what the PLAYER sees.
  const CAM_GRADE = CAM === 'r10' ? null : { lift: [0.030, 0.0292, 0.0282] };
  engine.pipeline.setGrade({
    ...GRADES.ballroom,
    ...(LIGHTS.grade ?? {}),
    ...(LIGHTS.grade ? {} : (CAM_GRADE ?? {})),
  });
  const { scene, renderer, camera } = engine;
  const rng = engine.rng;

  // See the `bounceTint` note in `lighting/rig.js`. The floor bounce is the dominant term in
  // everything this room's shade sees, and at r/b 1.106 it was warm enough that three passes of
  // dust-sheet albedo were fighting it rather than fixing the sheets. Pulled to near-neutral —
  // the SUN carries this room's warmth, and it now carries the bar's own amount of it.
  /**
   * `?candle=N` — HOW MUCH CANDLE GLOW IS IN THE ENVIRONMENT SHELL OF A ROOM WHOSE CANDLES ARE
   * NOT LIT.
   *
   * `ballroomEnv`'s two warmest boxes model glow off a lit chandelier cluster at r/b 2.1, and
   * they sit at eye height at both ends of the room. That is right for `prop.chandelier`, which
   * shares this preset and whose subject is a lit fixture; it is not obviously right here, where
   * the chandeliers hang unlit in a shut-up house and the light is daylight.
   *
   * Round 18 matched this room's decile ladder to the bar through deciles 5-8 — 0.327 / 0.334 /
   * 0.318 against 0.362 / 0.342 / 0.334 — and could not close deciles 3-4, which sit at
   * 0.79 / 0.62 against 0.38 / 0.40 after the albedos, the bounce fills and the sun colour have
   * all been corrected. These boxes are what remains that is both warm and low.
   *
   * 🚨 **AND THEY ARE NOT IT. THIS KNOB DOES NOTHING AND IS KEPT TO SAY SO.** Swept 1.0 / 0.5 /
   * 0.15 / 0: decile 3 moves 0.79 -> 0.77 and decile 2 moves 0.79 -> 0.77 the WRONG way
   * (1.08 -> 1.11). They are simply too dim next to the window-wall box at [2.60, 2.72, 2.95]
   * and the floor bounce at 1.075 to matter, however chromatic they are on their own.
   *
   * ⚠ WHAT THE DEEP SHADE ACTUALLY IS, STILL OPEN. At decile 3 this room reads 30.4 / 21.0 /
   * 12.7 against the bar's 31.0 / 27.1 / 20.6 — the RED MATCHES and the green and blue are
   * both far low. So it is not "too much warm light", it is missing green and blue in the
   * shade, which is a different search. Ruled out so far: the albedos (dusted), the three
   * bounce fills (recoloured), the sun (recoloured), these boxes, and the grade's split tone
   * (helps at both ends but bleeds into deciles 6-8, which already match the bar exactly).
   *
   * ⚠ AND PART OF THE RATIO IS AN ARTEFACT OF THE TOE BEING DARKER. (r-b)/L divides by a small
   * number down here: at decile 1 the bar is 0.79 at L 11.3 and this room 1.40 at L 8.4, which
   * in ABSOLUTE r-b is 9.0 against 11.9 — a third more, not nearly double. The gap is real at
   * decile 3 and overstated at decile 1.
   */
  /**
   * `?amb=N&ambtint=cool|flat` — THE SHELL'S UNIFORM TERM, WHICH IS THE LAST THING IN THE ROOM
   * NOBODY HAS MOVED.
   *
   * Every other box in `ballroomEnv` is DIRECTIONAL: a surface has to face it to get any of it.
   * `ambient` is the only term that reaches a fragment facing none of them, so it owns the very
   * bottom of the ladder — and the bottom of the ladder is round 18's last open gap, deciles
   * 2-3 running about 1.7x the bar with the RED MATCHING and green and blue both low.
   */
  const AMB = qs.has('amb') ? Math.max(0.5, Math.min(3, Number(qs.get('amb')) || 1)) : 1.0;
  const AMBT = qs.get('ambtint') === 'cool' ? 'cool' : 'flat';
  const CANDLE = qs.has('candle')
    ? Math.max(0, Math.min(2, Number(qs.get('candle')) || 0)) : 1.0;
  scene.environment = ballroomEnv(renderer, {
    /**
     * ⚠ `key` CARRIES `candleGlow` NOW TOO. `roomEnv` caches on the key alone, so a shell baked
     * at one glow value and requested at another is served the first — the same trap this
     * function's own header documents for `bounceTint`, and the same one `bakeDust` documents
     * in the baker. `-r18` because the value below changes what this key means.
     */
    key: `ballroom2-r18-cg${CANDLE}-a${AMB}-${AMBT}`, bounceTint: [1.075, 1.085, 1.075],
    candleGlow: CANDLE,
    ambientScale: AMB,
    ambientTint: AMBT === 'cool' ? [0.86, 1.00, 1.20] : [1, 1, 1],
  });
  scene.environmentIntensity = LIGHTS.env;
  scene.background = new THREE.Color(0x05070c);

  const mats = await estateMaterials();

  /**
   * `?dust=N` — HOW MUCH OF THIS ROOM'S OWN COLOUR IS DUST, 0 TO 1, AND ROUND 18'S ONE CHANGE.
   *
   * 🚨 **THE SEVENTEEN-ANGLE SWEEP FOUND A DEFECT THE GATE COULD NOT SEE, AND THIS IS IT.**
   * Every previous round measured this room at `overlook` and `overlook` alone. Shot from all
   * seventeen player-eye presets, the top-decile chroma gate PASSES at four and FAILS at
   * eleven — and the reason it ever passed is a framing accident: `overlook` fills its top
   * decile with blown-white window glare, which is neutral, so the gate reads the glare
   * instead of the room. An eye-level frame has no near-white source in it at all.
   *
   * Underneath that, both framings run (r-b)/L between 0.6 and 1.6 through deciles 1-8 against
   * the reference's flat 0.33-0.40. Measured on matched surfaces at matched luminance:
   *
   *     shaded floor        bar  37.5, 32.4, 20.9   L 32.7   r-b 16.6
   *                        here  49.8, 27.7, 16.1   L 31.6   r-b 33.7
   *     shaded upper wall    bar 133.5,119.5,106.0   L 121.5  r-b 27.4
   *                        here 128.8, 99.8, 73.8   L 104.0  r-b 54.9
   *
   * Two to one, on two unrelated surfaces. This room's shade is AMBER where the bar's is a
   * neutral grey-olive, and the reference is not a cool picture — it is a warm one whose warmth
   * comes from the LIGHT and from the red drapes, over surfaces that are essentially grey.
   *
   * ⚠ IT IS NOT THE LIGHTING, AND THE PROBE THAT SAYS SO HAD TO BE FIXED FIRST. With every
   * chromatic light term in the scene zeroed and four white directionals in their place
   * (`harness/_shade18_ab.mjs`, `neutral:`) the room still runs 1.26 / 0.98 / 0.75 through
   * deciles 1-3 against the bar's 0.79 / 0.40 / 0.38. The first version of that probe zeroed
   * the sun and the three bounce fills and called it white light, while leaving this room's
   * cool PointLight bounce cards and its additive light-shaft geometry running — a probe that
   * silently leaves two chromatic terms on is worse than none, because its number gets built
   * on. Corrected, and it restores to the baseline ladder exactly, so it can be trusted.
   *
   * ⚠ AND IT IS NOT THE GRADE. `saturation` scales the ladder but the defect is a SHAPE: the
   * bar's is flat and this room's is a ramp, so the cut that fixes the midtones (0.70) leaves
   * the shade at 1.8x and costs the drapes and the gilding everywhere. `shadowTint` has the
   * right shape — it is weighted by pow(1-L, 2) — but it is a multiply at `splitBalance`
   * strength, and [0.86, 0.97, 1.17], already an implausibly blue shadow, moved the darkest
   * decile 1.42 -> 1.32.
   *
   * So it is the albedo, which is where `room.study` put the identical fix in its round 5 —
   * "an albedo at r/b 2.45 cannot be lit to r/b 1.5 by any light that is not blue" — against
   * the identical measurement, on the identical gate blind spot: *"the top-decile gate passed
   * the whole time, because the top decile is the floor and the floor is neutral; the amber was
   * in the MID-TONES, where the gate does not look."* That correction was never made here.
   *
   * `bakeDust` is that correction generalised: one number, applied in the BAKER to every
   * surface's albedo, desaturating toward its own luminance and weighted to the dark end
   * (see the DUST block in `materials/baker.js` for why the weighting is the measurement and
   * not a refinement). Value preserved, so the median-luminance gate does not move with it.
   *
   * ⚠ THE BALLROOM BAKES ITS OWN WALL AND STONE RATHER THAN TAKING THE SHARED ONES.
   * `estateMaterials()` is a process-wide cache shared with the study, the gallery and the
   * hall; passing dust through it would dust all four rooms on this room's evidence. These are
   * the same two calls with the same arguments, plus the dust.
   */
  const DUST = qs.has('dust') ? Math.max(0, Math.min(1, Number(qs.get('dust')) || 0)) : 0.75;
  /**
   * `?floordust=N` — THE FLOOR TAKES A DIFFERENT DOSE FROM EVERYTHING ELSE, AND IT HAS TO.
   *
   * The floor is the one surface that gets BOTH corrections at full strength: it is dark, so
   * the dust curve gives it nearly all of `DUST`, and it is the largest thing the warm bounce
   * fill lands on, so the fill's neutralisation moves it as well. The two compound, and at
   * `DUST` the floor overshoots the bar in the other direction — measured on the shaded-floor
   * rect at `eye.door`:
   *
   *     shaded floor            rgb                  L      r-b
   *     bar                   37.5, 32.4, 20.9      32.7    16.6
   *     before                49.8, 27.7, 16.1      31.6    33.7
   *     dust 0.75, old fill   40.8, 29.1, 25.2      31.3    15.6
   *     dust 0.75, new fill   35.9, 29.4, 27.4      30.6     8.5
   *
   * ⚠ AND THE OVERSHOOT IS NOT ONLY IN r-b, IT IS IN THE HUE. The bar's shaded floor is OLIVE
   * — its green stands 11.5 above its blue — and at 0.75 with the new fill this one's green
   * stands 2.0 above its blue, i.e. a grey-violet. Two floors can share an r-b and not look
   * remotely like the same material, which is why this is measured on the channels and not on
   * the gate's single scalar.
   *
   * The wall is unaffected by this split: its albedo is bright, so the dust curve was only ever
   * giving it 30% of the number, and it lands on the bar from the fill change alone (r-b
   * 54.9 -> 32.7 against 27.4).
   */
  const FLOOR_DUST = qs.has('floordust')
    ? Math.max(0, Math.min(1, Number(qs.get('floordust')) || 0)) : 0.42;
  /**
   * `?oakg=N` — HOW YELLOW THE OAK IS, AND DUST CANNOT REACH THIS ONE.
   *
   * Dust moves a colour along the line toward its own grey, so it can take saturation out of
   * the floor but it cannot change which hue the floor IS. Measured on the same shaded rect,
   * after the dust and the fill had both landed:
   *
   *     shaded floor            r      g      b     r-g    g-b
   *     bar                   37.5   32.4   20.9    5.1   11.5
   *     here                  40.5   28.5   21.7   12.0    6.8
   *
   * Same r-b to within a couple of counts and NOT THE SAME COLOUR. The bar's floor is a yellow
   * olive — its green sits nearly as high as its red — and this one's is a red-brown with the
   * green down near the blue. Two floors can match on the gate's scalar and still read as
   * different timbers, which is the whole reason this is measured on the channels.
   *
   * ⚠ AND THE CORRECTION IS TOWARD THE MATERIAL'S OWN NAME. Red-brown is walnut and mahogany;
   * OAK is a yellow-brown. `oak` has been [0.281, 0.183, 0.101] since round 14 — r/g 1.54,
   * which is a walnut ratio — and the bar's floor sits at 1.16. This lifts the green and drops
   * the red toward that, at CONSTANT LUMINANCE, so the level this round already solved does not
   * move with the hue.
   *
   * N is the multiplier on the green channel before the luminance is renormalised. 1.0 is the
   * round-14 colour exactly.
   */
  /**
   * ⚠ 1.30, AND IT WAS PICKED ON THE CHANNELS NORMALISED BY LUMINANCE RATHER THAN ON r-b,
   * because r-b picks the wrong one. Same rect, same boot, four values:
   *
   *     oakg        r/L     g/L     b/L      r-b
   *     bar        1.147   0.991   0.639    16.6
   *     1.00       1.292   0.941   0.754    16.4   <- matches on r-b, wrong colour
   *     1.15       1.206   0.967   0.722    14.8
   *     1.30       1.138   0.990   0.695    13.5   <- matches on r AND g
   *     1.45       1.075   1.010   0.673    12.4
   *
   * 1.00 already sits on the bar's r-b to within two counts and is a visibly different timber;
   * 1.30 is 3 counts off on r-b and lands red and green both within 1% of it. What is left is
   * blue, 8% high, which is the dust and the cool fill lifting the darkest channel — a small
   * residual on one channel of one surface, and not worth another pass against the two gates
   * still open.
   */
  const OAK_G = qs.has('oakg') ? Math.max(0.5, Math.min(2, Number(qs.get('oakg')) || 1)) : 1.30;
  /**
   * `?floorpat=N` — THE FINE PATTERN'S CONTRAST, AND IT RETIRES THIS ROUND'S OWN FRAMING.
   *
   * 🚨 **"THE BAR'S FLOOR READS AS A TONE AND THIS ONE READS AS PATTERN" WAS TRUE AND THE
   * CONCLUSION DRAWN FROM IT TWICE WAS WRONG.** Round 17 acted on it by laying the oak plain,
   * which never converged over four passes; round 18 filed the residue as needing a floor
   * surface BUILT to be plain — *"a piece of work, not a parameter"*. Both assumed the bar's
   * floor carries no pattern. Cropped, it plainly does: large faint squares with a diagonal
   * inside them, exactly this floor's own design at a fraction of its contrast.
   *
   * So it was never pattern-or-tone, it is CONTRAST AND SCALE. Local standard deviation over a
   * sliding window, normalised by the patch mean, shade-only rects at matched luminance
   * (`harness/_floorpat18.mjs`, 32.7 against 30.9):
   *
   *     window        4px    10px    24px    48px
   *     bar           3.5     7.3    12.1    19.0
   *     before        9.5    13.3    15.8    15.6
   *
   * The bar CLIMBS 3.5 -> 19.0 across the range, a factor of 5.4 — almost nothing at stave
   * scale, a great deal at room scale, which is what "reads as a tone" actually means: the
   * variation you see is where the floor is dirty, not what it is made of. This one was nearly
   * flat, 9.5 -> 15.6, a factor of 1.6, and 2.7x the bar at the fine end.
   *
   * `patCon` scales grain, stave drift, flecking and joints toward the field's own mean, and
   * the RELIEF with them (see the note at `s.height` — round 17 already learned once that the
   * normal map draws this grid on its own). It deliberately leaves the wax and the wear lanes,
   * because those are the large-scale terms and the bar has MORE of them, not fewer.
   */
  const FLOOR_PAT = qs.has('floorpat')
    ? Math.max(0, Math.min(2, Number(qs.get('floorpat')) || 0)) : 0.30;
  /**
   * `?floorwax=N` — HOW MUCH THE POLISH VARIES ACROSS THE ROOM. **DEFAULT 1.0, WHICH IS
   * BYTE-IDENTICAL, AND THE WHOLE REASON IT EXISTS IS A MEASUREMENT THAT TURNED OUT TO BE OF
   * THE WRONG THING.**
   *
   * 🚨 **THE RECT HAD PAPER IN IT.** This knob was built to close a gap at the 48 px window —
   * 11.5 here against the bar's 19.0, the one scale where this floor looked UNDER the bar
   * rather than over it — and that 19.0 is not the bar's floor. The rect used for it
   * (600,760,300,120) contains five or six sheets of scattered white paper on a dark floor,
   * and the local-contrast measure was reading those. Cropped and looked at, which is what
   * should have happened before four sweeps were run against it.
   *
   * On a genuinely paper-free patch of the same floor at the same luminance (600,830,220,70,
   * mean 33.0) the bar reads **2.5 / 3.8 / 4.7 / 5.1** across 4/10/24/48 px — nearly FLAT, and
   * flatter than this floor at every single scale rather than louder at one. So the conclusion
   * inverts: there was never a large-scale deficit to fill, and turning this knob up moves AWAY
   * from the bar. It is left at 1.0 and kept only as an ablation.
   *
   * Two other instruments were tried against the phantom before the rect was checked, and both
   * are worth recording because both are the obvious guess and both are wrong for real reasons:
   *
   *   · raising the grime macro buys contrast at EVERY scale and costs 11 counts of mean
   *     luminance doing it (31.9 -> 20.9), because fbm has energy everywhere and a multiply
   *     can only darken. `?floorstain=` is the ablation.
   *   · raising the AO radius 0.85 -> 3.6, with intensity, does NOTHING: 11.5 -> 11.6. AO is a
   *     contact term and only acts near occluders, so on the open floor where this is measured
   *     it has nothing to say. That was the "it wants a lighting answer" hand-wave from earlier
   *     in this round, actually pulled, and it was wrong.
   *
   * ⚠ RULE, WRITTEN HERE BECAUSE IT COST THIS ROUND FOUR SWEEPS: a local-contrast number over a
   * rect is only a measurement of the SURFACE if the rect contains nothing but the surface.
   * Crop it and look at it first. Paper, a shadow edge, a prop or a reflection inside the rect
   * are all read as texture by this measure, and it reports them confidently.
   */
  const FLOOR_WAX = qs.has('floorwax')
    ? Math.max(0, Math.min(6, Number(qs.get('floorwax')) || 0)) : 1.0;
  const LUMA = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const oakHue = (c) => {
    const t = [c[0], c[1] * OAK_G, c[2]];
    const k = LUMA(c) / LUMA(t);
    return [t[0] * k, t[1] * k, t[2] * k];
  };
  const wallMat = DUST > 0 ? boiserieMat({ bakeDust: DUST }) : mats.boiserie;
  const stoneDusty = DUST > 0
    ? stoneMat({ stone: [0.545, 0.540, 0.520], course: 0, bakeDust: DUST })
    : mats.stone;
  if (DUST > 0) {
    engine.onDispose?.(() => { wallMat.dispose(); stoneDusty.dispose(); });
  }
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.95, metalness: 0 });
  // ITEM 3 (estate-owner-15, ROUND 15): the drape GEOMETRY (the swag + two side panels per
  // window, below) has been here since before this round — the bar's red velvet at every window
  // was reported as entirely absent because the material was, not because it was missing. At
  // 0x3a0d10 under this room's near-black ambient the panels rendered as raw RGB ~(4,3,3) at a
  // fixed sample point beside the window (`harness/_eo15_drape_sweep.mjs`) — indistinguishable
  // from shadow, same failure class as the vestibule void a few lines down. Brightening the
  // albedo alone (not the light, not the geometry) was swept live on the SAME mesh
  // (`scene.getObjectByName('kit:drape')`) up to pure white to find the ceiling this position can
  // reach at all: white read only ~(75,60,52), confirming the spot is genuinely indirect-lit and
  // any colour placed there reads proportionally dark — so the fix is a saturated albedo, not a
  // brighter one. A first pass at 0xd82535 read ~(42,3,4) at the sample point, matching the bar's
  // OWN shaded drapery pixels sampled off `refs/bf1/bf1-ballroom-01.png` at ~(45-48,2-3,1-2) to
  // within a few counts — a real measured match — BUT it promotes enough of the frame's own dark
  // decile (the panels cover real screen area at every one of five windows) to push
  // `grade.mjs`'s darkest-decile L from this round's 7.0 to 9.6, a WARN. `harness/_eo15_vest_sweep.mjs`
  // (which patches this mesh AND `kit:vest` AND the grade together, see the vestibule note below)
  // found the joint point that keeps both fixes AND the gate: 0xc02030, paired with the vestibule
  // change and `GRADES.ballroom.toeCrush` 0.010 -> 0.018 / `exposure` 1.50 -> 1.55 below, reads
  // ~(10-17, 6-13, 3-10) through the frame — still unmistakably a saturated red column beside a
  // window, not the vivid ceiling colour, but darkest-decile L holds at 7.5 and median at 31.8,
  // both comfortably inside the gate. Roughness (0.86, matte) left untouched: swept to 0.7 in the
  // same tool and it moved the sample by <1 count, i.e. this position is diffuse/indirect-dominated
  // and roughness is not the lever here.
  // ⚠ ROUND 17: 0xc02030 -> 0x9c4038, THE SAME RE-SOLVE THE PARQUET ALBEDO TOOK AND FOR THE
  // SAME REASON. Round 15's sweep is quoted above and its reasoning is sound: under an ambient
  // so dark that pure white only reached ~(75,60,52) at this position, the fix for a drape that
  // read as shadow was a SATURATED albedo, not a brighter one. Round 17 raised the fill 3.5x,
  // and the same albedo now reads as scarlet satin. Measured against the bar's own curtains
  // (`harness/_eye17_rect.mjs`, two rects on each):
  //
  //     drape patch                    rgb                  L      chroma
  //     refs/bf1 curtain               56.7, 21.4, 20.2    28.8     36.5
  //     refs/bf1 curtain               68.2, 27.8, 24.3    36.1     43.9
  //     this room, before             113.4, 17.3, 10.5    37.2    102.9
  //     this room, before              97.5,  5.3,  1.4    24.7     96.1
  //
  //     this room, after               71.3, 22.2, 12.8    32.0     58.5
  //     this room, after               54.9,  8.2,  2.2    17.7     52.7
  //
  // Matched on luminance and 2.5x the chroma to begin with, with G and B driven to almost
  // nothing — in linear the bar held R:G about 6.3 and this held 29.5. Solved to that ratio
  // and scaled back so the level does not rise with it, the chroma comes down to 1.4x the bar
  // and the panels read as crimson velvet rather than scarlet satin. It does not reach the bar
  // exactly and is not pushed further: the near panel in that rect stands beside a lit sconce,
  // so some of the remaining warmth is a light this room has and the reference does not — the
  // same distinction the floor's own warm-bias ruling makes a few hundred lines up.
  /**
   * ⚠ **0x8c4a46 -> 0xa83020, AND THE RECT THAT SETTLED IT WAS THE THIRD ONE TRIED.** Round 15
   * set this by sweep and its note says it "does not reach the bar exactly and is not pushed
   * further" because the sample point stood beside a lit sconce. Measured now on a rect that is
   * nothing but drape, in both pictures:
   *
   *     drape in shade            rgb                  L      r-b   (r-b)/L
   *     refs/bf1                48.5,  9.9,  9.0     18.1     39.5    2.185
   *     0x8c4a46                35.5, 11.7,  9.0     16.6     26.5    1.602
   *     0x9a3830                42.2,  9.3,  7.0     16.1     35.2    2.180
   *     0xa02418                45.0,  7.6,  5.9     15.4     39.1    2.534
   *
   * The bar's velvet is a DEEP SATURATED CRIMSON and this room's was a dusty pink-brown at two
   * thirds of its red. 0x9a3830 lands its ratio exactly and 0xa02418 lands its absolute r-b;
   * this sits between them, a little brighter than either, because the bar is brighter than
   * both (L 18.1 against 16.1 and 15.4).
   *
   * ⚠ AND IT DOES NOT REOPEN ROUND 15's FAILURE, WHICH WAS THE OTHER DIRECTION. That round
   * found 0x3a0d10 rendering at raw rgb ~(4,3,3) and being reported as ENTIRELY ABSENT. This is
   * three times that red and the room is a stop brighter than it was then.
   *
   * ⚠ THE FIRST TWO RECTS WERE WRONG AND THE SWEEP RUN AGAINST THEM SAID "NO EFFECT". One
   * landed on a pilaster in the reference and one on a chandelier chain here — a colour sweep
   * over them moved 0.58 to 0.66 and looked like a dead end. Crop the rect and LOOK at it: it
   * is the rule this round wrote down twice and then broke a third time.
   */
  const drape = new THREE.MeshStandardMaterial({ color: 0xa83020, roughness: 0.86, metalness: 0 });
  // Named so `harness/_hide18.mjs` can address it. `GeoBin` merges by material and names the
  // mesh after it, so an unnamed material is a mesh no diagnostic can find by name — which is
  // the same wall round 18 hit chasing the gilt bucket, from the other side.
  drape.name = 'ballroom-drape';
  // See the OUTSIDE block below for why this is a clone rather than `mats.clearGlass` itself.
  // The BAKE is shared through the baker's key cache — only the two scalars differ — so this
  // costs one material and no extra texture, and `room.gallery`'s and `room.study`'s own
  // glazing is untouched.
  const ballroomGlass = mats.clearGlass.clone();
  if (OUTSIDE) {
    // 3.4 -> 0.9: enough for the leading and the quarry bands to still bloom, not enough to be
    // the picture. What is bright in the opening is now the sky behind it.
    ballroomGlass.emissiveIntensity = 0.9;
    ballroomGlass.transparent = true;
    /**
     * ⚠ **0.42 -> `?glassop=`, DEFAULT 0.16, AND THE OLD VALUE IS WHY THE QUARRY PATTERN IS
     * VISIBLE AT ALL** (round 18). At 0.42 nearly half of every pane is the glass's own baked
     * surface, and that bake carries a diamond quarry across the whole pane. Zoomed in against
     * the bar the difference is not subtle: the bar's windows are near-white with THIN DARK
     * GLAZING BARS and no quarry whatever, and this room's read as frosted decorative glass.
     *
     * ⚠ AND THAT IS SAFE TO DO HERE PRECISELY BECAUSE THE GRID IS GEOMETRY. `wallRun` emits
     * real glazing bars on the `wintrim` bucket; the quarry is the only part of the grid that
     * lives in the texture. So thinning the pane deletes the pattern the bar does not have and
     * keeps the bars it does — which is not a trade, it is the two being separable.
     *
     * Clear glass at normal incidence reflects about 4%. 0.42 was never a physical number; it
     * was the number that let the leading bloom back when the pane was the picture, and the
     * courtyard behind it is the picture now.
     */
    ballroomGlass.opacity = qs.has('glassop')
      ? Math.max(0, Math.min(1, Number(qs.get('glassop')) || 0)) : 0.16;
    // depthWrite stays ON. These panes are the only transparent surface on this side of the
    // room and everything behind them (the courtyard, the sky) is opaque and drawn first, so
    // there is nothing for a pane to sort incorrectly against — and leaving it on keeps the
    // glazing out of the light shafts' own additive sort.
    ballroomGlass.needsUpdate = true;
  }
  engine.onDispose?.(() => ballroomGlass.dispose());
  const ceilPaint = ceilingMat({ tint: [0.480, 0.452, 0.398], stain: 0.7, bakeDust: DUST });

  // The pilaster shafts, a shade down and a shade warmer than the wall they stand against —
  // see the note at the pilaster call in ballroom-order.js. Stone against painted joinery.
  const pilasterStone = wallMat.clone();
  // ⚠ 0xbdb3a2 -> 0x8f887c, AND THE ANGLE THAT SETTLED IT IS `eye.mirror`. Looking ALONG the
  // mirror wall you see the pilasters' returns rather than their faces, and at 0xbdb3a2 they
  // came back as pale flat bands standing three to four times brighter than the wall they are
  // cut from — ghostly strips laid over dark joinery, with a hard unchamfered arris down each
  // one. The tone that separated them nicely when seen face-on (`eye.walk`, where they had been
  // reading as hairlines) separates them far too much seen edge-on, because a return catches
  // the cold fill almost square while the wall beside it catches nothing.
  //
  // This is the third value this material has had in one round and the reason is worth stating:
  // a member's tone cannot be solved from one camera, because what it is solved AGAINST — the
  // wall behind it — changes brightness by a factor of four depending on which way you are
  // looking at that wall.
  pilasterStone.color = new THREE.Color(0x8f887c);
  pilasterStone.name = 'ballroom-pilaster-shaft';
  engine.onDispose?.(() => pilasterStone.dispose());
  /**
   * `?bead=N` — THE PANEL BEADS' OWN TONE, SPLIT OUT OF THE GILT BUCKET.
   *
   * 🚨 **THE UPPER WALL'S DOTTED BRIGHT LINES ARE NOT AN ALIASING BUG, AND THE PROBE THAT
   * SETTLED THAT IS WORTH KEEPING.** Round 18 diagnosed them as sub-pixel geometric aliasing on
   * the gilt panel beads and filed the fix as structural — thicker beads or multi-sample AA in
   * the shared pipeline. MSAA was then actually tried (`samples: 4` on the scene target, which
   * three r180 resolves alongside its depth texture, so the AO and the soft particles survive
   * it) and it made the frame WORSE: the beads became CONTINUOUS bright scratches instead of
   * broken ones. Reverted.
   *
   * That is the answer, just not the expected one. Continuity was never the problem; the beads
   * are simply far brighter against their wall than the reference's are. Cropped side by side
   * at the same zoom, the bar's panel outlines are continuous MUTED gold at low contrast
   * against grey plaster, and this room's are near-white streaks. `metalness` 1.0 -> 0.45 moves
   * it 10% (163 spike pixels -> 147) and `envMapIntensity` 0.62 -> 0.25 moves it not at all, so
   * it is not specular either — it is the albedo, and gilt is a bright warm albedo.
   *
   * ⚠ **AND IT IS NOT THE PANEL BEADS EITHER, WHICH IS WHY THIS DEFAULTS TO 1.0 AND CHANGES
   * NOTHING.** `wallRun` puts the beads on their own `mould` key and `ballroom-order.js` maps
   * `mould`/`cornice`/`skirt`/`trim` all into `gilt`; splitting `mould` out and taking it down
   * a stop and a half moved 163 spike pixels to 158. `?keysplit=1` then put the cornice, the
   * skirting and the window trim in their own buckets too, and the raycast STILL returns
   * `kit:gilt` — so the streaks are not `wallRun` geometry at all. They are two thin gilt
   * surfaces 14 cm apart at 18.2 m, in front of the wall, in the shared bin.
   *
   * 🚨🚨 **AND THEN THE COMPLAINT ITSELF DID NOT SURVIVE ITS OWN METRIC. THE REFERENCE IS
   * SPIKIER THAN THIS ROOM IS.** `harness/_spike18.mjs` counts pixels standing clear of both
   * horizontal neighbours, and it was written in this round to quantify "broken bright marks".
   * Run on the bar's own upper wall, same rect size, same thresholds:
   *
   *     400 x 180 patch of upper wall      thr 40    thr 25
   *     refs/bf1/bf1-ballroom-01             324       908
   *     here                                 253       407
   *
   * The metric does not measure a defect. It measures small bright features, and a reference
   * full of gilded enrichment, marble veining and window mullions has more of them than this
   * room does. Eight probes went into something that reads as a defect at 2x zoom on a crop and
   * is not one — the third complaint in this round withdrawn by measuring it rather than
   * restating it, after "the floor needs rebuilding" and "the room is more gilded than the bar".
   *
   * ⚠ **RULE, AND IT IS THE ONE WORTH KEEPING OUT OF ALL OF THIS: A METRIC INVENTED TO DESCRIBE
   * A DEFECT MUST BE RUN ON THE REFERENCE BEFORE IT IS TRUSTED.** If the bar scores worse on it,
   * there is no defect — there is a metric that measures something both pictures have.
   *
   * ⚠ The probes below are kept anyway, because locating a member inside a merged bucket cost
   * eight boots and nobody should pay that twice. `?bead=` and `?cap=` both default to 1.0 and
   * change nothing. What finally identified the member was not any name but the raycast's WORLD
   * COORDINATE — x -12.7 against a wall at -13.0, y 7.5-7.8, z on the pier spacing, which is
   * `pilaster`'s cap at `proj: 0.30` and nothing else in the room is there. `GeoBin` merges by
   * MATERIAL, so a mesh name is a material name and a raycast can only ever answer with a
   * bucket; when the bucket holds six members that answer is worth nothing. Ask for the point.
   *
   * ---- what the probes DID establish, all still true ----
   * Ruled out by deletion or by a live tweak:
   * the grime, the crystal, the named chandelier meshes, the dust motes, the light shafts, the
   * wall itself, the clearcoat, the environment specular, the panel beads, the cornice, the
   * skirting and the window trim. Ruled out as a CLASS by experiment: aliasing, because MSAA
   * fixes the brokenness and makes the result worse. What remains is un-named geometry emitted
   * straight onto the `gilt` key by something other than `wallRun`, and the honest next step is
   * `?keysplit=1` extended to whatever emits it rather than another round of guessing.
   *
   * The knob stays because the bead tone is a real question independently of this, and because
   * finding where the beads live cost a boot that nobody should have to spend twice.
   */
  const BEAD = qs.has('bead') ? Math.max(0.2, Math.min(1, Number(qs.get('bead')) || 1)) : 1.0;
  // `?cap=N` — the giant order's capitals, which is where the marks above actually live. Same
  // shape of knob as `?bead=` and the same default: 1.0, no split, no extra draw call. Taking
  // them down a stop and a half moved the spike count 253 -> 216, which is real and is also
  // not worth spending a draw call on given the metric itself did not survive the bar control.
  const CAP = qs.has('cap') ? Math.max(0.2, Math.min(1, Number(qs.get('cap')) || 1)) : 1.0;
  const capGilt = CAP < 1 ? mats.gilt.clone() : mats.gilt;
  if (CAP < 1) {
    capGilt.color = new THREE.Color(CAP, CAP, CAP);
    capGilt.name = 'ballroom-pilaster-cap';
    engine.onDispose?.(() => capGilt.dispose());
  }
  const beadGilt = BEAD < 1 ? mats.gilt.clone() : mats.gilt;
  if (BEAD < 1) {
    // ⚠ MULTIPLIES IN LINEAR. 0.62 is about two thirds of a stop, not 38% "less bright" — the
    // same trap that took the packing cases to black silhouettes earlier in this project when
    // a colour multiplier was read as if it were an sRGB percentage.
    beadGilt.color = new THREE.Color(BEAD, BEAD, BEAD);
    beadGilt.name = 'ballroom-panel-bead';
    engine.onDispose?.(() => beadGilt.dispose());
  }
  // ⚠ DECLARED HERE AND NOT AT THE KEY TABLE, WHICH IS 130 LINES DOWN. `const` is in a
  // temporal dead zone until its declaration runs, so reading it in the material table below
  // while declaring it beside `K` threw on the first frame and took the whole view down with
  // it — a boot failure, not a wrong picture. The knob has to exist before the first thing
  // that reads it, and the material table is that thing.
  /**
   * 🚨 **DEFAULTS TO `gilt`, BECAUSE THE EVIDENCE IS GENUINELY MIXED AND THIS IS AN IDENTITY
   * CALL.** (The long note on what this knob is and how its member was found is at the key
   * table below.) Shot at all seventeen angles as `stone`:
   *
   *   FOR: it looks closer. The entablature reads as pale stone with a dark frieze line rather
   *   than a broad gold band, so the room reads as stone architecture WITH gold accents, which
   *   is what the reference is. The chroma gate improves nearly everywhere — `eye.up`
   *   0.331 -> 0.308, `eye.door` 0.223 -> 0.215 — and deciles 3-4 close (0.63 / 0.49 ->
   *   0.57 / 0.41), which is the gap the whole search was for.
   *
   *   AGAINST: a big pale band where a dark one was raises the median everywhere, and two
   *   angles leave the 30-60 band doing it — `eye.door` 59.7 -> 68.4 and `eye.corner.sw`
   *   59.4 -> 62.5. `overlook`'s own median moves 49.5 -> 52.7, i.e. AWAY from the bar's 49.8.
   *   Deciles 5-8 drop further below the reference, so total ladder error is marginally WORSE
   *   (1.73 against 1.68) even though the deciles this was aimed at improve. And it costs two
   *   draw calls, taking the worst angle 296 -> 298 of 300.
   *
   * So it trades two median gates and most of the draw-call headroom for a small chroma gain
   * and a real but arguable compositional one. That is a decision about what this room IS, and
   * this file's history says those get made on more than one round's evidence — round 14 chose
   * wood parquet over marble the same way. One query param, with the numbers attached.
   */
  const CORNICE = qs.get('cornice') === 'stone' ? 'stone' : 'gilt';
  const M = {
    pil: pilasterStone,
    wall: wallMat,
    mould: beadGilt,
    ...(CAP < 1 ? { cap: capGilt } : {}),
    ...(CORNICE === 'stone' ? { cornice: stoneDusty } : {}),
    ...(qs.get('keysplit') === '1'
      ? { cornice: mats.gilt, skirt: mats.gilt, trim: mats.gilt }
      : {}),
    /**
     * 🚨 **OPEN COMPLAINT, DIAGNOSED AND NOT FIXED: THE GILT BEADS ALIAS INTO DOTTED LINES.**
     *
     * On the upper wall at `eye.win` the panel bead outlines break into broken bright vertical
     * dashes — `harness/_spike18.mjs` finds 163 pixels in one 400 x 120 patch standing more
     * than 40 counts clear of both horizontal neighbours. At a glance they read as scratches or
     * as a decal seam, which is a render tell on an otherwise clean wall.
     *
     * What it is NOT, each ruled out by deletion or by a live material tweak rather than by
     * argument — this took six probes and the ruling-out is the reusable part:
     *   · not the grime or the patina    (`?grime=0`, unchanged)
     *   · not the chandelier crystal      (hid 12 objects, unchanged)
     *   · not the chandeliers             (hid 6, unchanged)
     *   · not the dust motes or shafts    (hid 3 + 3, unchanged)
     *   · not the wall itself             (hid it; the dashes remained, over the sky)
     *   · not the clearcoat               (`clearcoat=0` live, unchanged)
     *   · not the environment specular    (`envMapIntensity=0.25` live, 163 -> 162 spikes)
     *
     * ⚠ AND IT IS NOT SHADING AT ALL, WHICH IS WHY NONE OF THOSE MOVED IT. A raycast at the
     * exact spike pixels — found by scanning rather than estimated off a zoomed crop, which is
     * what four earlier probes got wrong — returns `kit:gilt`. These are the gilt hairline beads
     * that outline every panel, and at this distance they are SUB-PIXEL: a bead narrower than
     * one sample against a darker wall resolves to a dotted line no matter what material it
     * carries. It is geometric aliasing.
     *
     * Which means the fixes are all structural rather than a value: thicken the beads so they
     * hold a pixel and a half at room distance (an architectural change, and they would then be
     * too heavy close up), or give the pipeline temporal or multi-sample AA (a change to
     * `post/pipeline.js` that every piece in the project would inherit). Neither is a knob, and
     * neither should be done casually at the end of a round on one angle's evidence.
     */
    gilt: mats.gilt,
    frieze: mats.giltFrieze,
    stone: stoneDusty,
    ceil: ceilPaint,
    glass: ballroomGlass,
    dark,
    drape,
    marbleTop: mats.marbleSlab,
    wintrim: stoneDusty,
  };
  // `estateMaterials()` entries are LAZY GETTERS and reading one bakes it, so `?depot=0` must
  // not name it in the object literal or the ablation still pays for the surface it removed.
  if (DEPOT) {
    // ⚠ WEATHERED, NOT FRESH. `crateDeal` is a warm new pine and it is the right bake; what it
    // is not is what a case looks like after years in a shut-up house. Once the room's ladder
    // matched the reference this was the loudest thing left in a blind pair — the whole depot
    // read as gold where the bar's reads as grey timber. Measured on matched stacks:
    //
    //     packing cases            rgb                  L      chroma
    //     refs/bf1                47.3, 43.6, 37.0     43.9     10.3
    //     refs/bf1                48.0, 39.2, 30.4     40.4     17.6
    //     this room, before      111.4, 89.5, 77.8     93.3     33.6
    //     this room, after        92.3, 76.4, 69.6     79.3     22.6
    //
    // ⚠ AND THE "AFTER" RECT IS NOT PURE CRATE, WHICH COST A ROUND-TRIP. It is a fixed 200x90
    // window on the overlook capture that also catches floor and a sheeted mound, so it barely
    // moves when the crate material does — and reading it as if it were crate-only led to
    // pushing this multiplier to 0x7d8894, which took the cases to black silhouettes with no
    // board detail left in them at all. The picture caught what the rect could not. Shipped at
    // 0x99a3ac, which is the step that greyed the timber without swallowing it; the number to
    // trust here is the capture, not this rect.
    //
    // Twice the brightness and three times the chroma. A COOL multiplier does both jobs at
    // once: it darkens, and multiplying a warm map by a cool colour is what actually greys
    // timber, where a neutral multiplier would only have made bright pine into dark pine.
    // A clone, so `room.gallery`'s and the game's own crates are untouched.
    const crateWeathered = mats.crateDeal.clone();
    crateWeathered.color = new THREE.Color(0xc9ccd2);
    crateWeathered.name = 'ballroom-crate-weathered';
    engine.onDispose?.(() => crateWeathered.dispose());
    M.crate = crateWeathered;
  }
  // ⚠ `mould` NO LONGER LANDS IN `gilt` — see the `?bead=` note above the material table. It is
  // the panel-bead key, and the beads want a shade of gilding rather than the cornice's. The
  // other three stay, so this is one extra bucket and not four.
  // ⚠ `mould` ONLY LEAVES THE `gilt` BUCKET WHEN `?bead=` ASKS IT TO. Splitting it costs a draw
  // call and bought nothing measurable (see the `?bead=` note above the material table), so the
  // default is the original single bucket and the knob is there for the next person who wants
  // to try the beads at a different tone without re-deriving where they live.
  const K = { wall: 'wall', mould: BEAD < 1 ? 'mould' : 'gilt', cornice: 'gilt', skirt: 'gilt', trim: 'gilt', leaf: 'wall' };
  /**
   * `?keysplit=1` — A DIAGNOSTIC, NOT A SHIPPING PATH. Puts every gilt sub-key in its own bin
   * bucket so a raycast can NAME which member it hit, at the cost of three extra draw calls.
   *
   * This exists because "which gilt is that" cost this round several boots of guessing. The
   * upper wall's bright streaks raycast to `kit:gilt`, and `gilt` is the bucket for the
   * cornice, the skirting, the window trim and (until this round) the panel beads all at once —
   * so the answer "gilt" is worth about as much as "the room". Splitting the beads out proved
   * they were NOT the cause (a stop and a half off their tone moved 163 spike pixels to 158);
   * this makes the same question answerable for the other three without another guess.
   */
  if (qs.get('keysplit') === '1') {
    K.cornice = 'cornice'; K.skirt = 'skirt'; K.trim = 'trim';
  }
  /**
   * `?cornice=stone|gilt` — WHAT THE ENTABLATURE IS MADE OF, AND IT IS THE LAST MEASURED GAP.
   *
   * 🚨 Round 18 closed the luminance ladder to the reference decile for decile and matched the
   * chroma at the toe and through deciles 5-8, leaving deciles 2-3 at about 1.7x. Eight global
   * terms were swept at that and every one merely ROTATED the ladder, because the defect is a
   * shape. What finally located it was masking the decile range and then SCANNING for its
   * warmest non-red cells rather than reading rects off a crop by eye — three consecutive
   * attempts at the latter landed on a pilaster, a chandelier chain and a stack of crates.
   *
   * Every warm cell is at the top of the frame, and a raycast at each returns `kit:gilt` at
   * y 7.8 to 9.5 on the window wall: the cornice, the entablature and the coffer beams. They
   * are a bright warm albedo sitting in deep shade, so they land in the LOW deciles while
   * carrying gilt's chroma — which is exactly "red matches, green and blue are low".
   *
   * ⚠ AND THE REFERENCE'S IS NOT GILT. Cropped at 2x, the bar's cornice band is PALE STONE with
   * thin gold enrichment lines run along it; this room's is solid gilding two metres deep. That
   * is a difference in what the order is MADE OF, and it is the same finding as `eye.up`'s
   * coffer grid arriving from another direction: this room wears more gold than the bar not in
   * area (15.5 percent against 24.2) but in which MEMBERS are gold.
   *
   * `stone` puts the cornice band on the room's own limestone and leaves the panel beads, the
   * skirting and the window trim gilt — so the gold goes where the reference keeps it, on the
   * enrichment, and comes off the mass.
   */
  if (CORNICE === 'stone') K.cornice = 'cornice';

  // ⚠ `uvWall` 2.4 -> 1.15, AND IT IS A CLOSE-RANGE DEFECT THAT ONLY ONE CAMERA COULD SEE.
  // The boiserie bake carries a craquelure — the cracked paint of old joinery — and at one
  // world repeat per 2.4 m its cells come out about 20 cm across. At the two down-looking
  // cameras that is a soft mottle and it is fine. `cam=eye.under` (the covered aisle beneath
  // the musicians' gallery, added this round because a player walks it) stands 2 m from that
  // wall, and there the same texture resolves into what it actually is: a hard-edged Voronoi
  // diagram, thin brown lines on a pale field. It was picked as `kit:wall` rather than guessed
  // — the first three attempts at this defect all assumed it was the mirror plate beside it.
  //
  // 1.15 puts the cells near 9 cm, which still is not real craquelure (that is millimetres)
  // but is small enough to read as surface rather than as pattern at the distance a player
  // actually gets to this wall.
  const bin = new GeoBin();

  // ---- floor: black-and-white marble chequer ----------------------------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(R.x1 - R.x0 + 2, R.z1 - R.z0 + 2), mats.marbleChequer);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0);
  floor.receiveShadow = true;
  {
    // INTEGER REPEATS. Was 4.2 x 2.6, and that is a chequer bug, not a scale choice: the
    // baked tile carries an EVEN number of squares, so its black/white parity only continues
    // across a tile boundary if the repeat count is a whole number. At 4.2 the last fifth of
    // a tile wraps to the start of the next one, two same-colour squares meet, and the eye
    // reads a line running the width of the room — which is `critic-estate-2`'s "confirmed
    // visible seam where tile scale changes". Nothing about the scale changes; the parity
    // flips. 4 x 3 keeps the squares within a few percent of square on a 28 x 18 m plane.
    const uv = floor.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 3);
  }
  scene.add(floor);

  // ---- floor: wood parquet field, chequer left showing only at the edges -----------------
  // See the `?floor=` note above. Built as a SECOND, smaller plane laid 4 mm above the chequer,
  // not a cut border ring: the chequer plane above is untouched and simply shows through around
  // the outside, which is the picture the bar actually has, and it means the r9 planar-reflection
  // floor keeps working exactly as before under both `?floor=` states.
  //
  // ⚠ A DEDICATED BAKE, NOT `mats.parquet`. The first version of this cloned the lazy-cached
  // default (`room.gallery`'s own oak, [0.300, 0.196, 0.108]) and it measured wrong: this room's
  // shaded two-thirds is candlelit ambient, not the gallery's brighter fill, and the SAME wood
  // came back at meanL 20.5 against a matched patch of the bar's own shaded floor at meanL 36.2
  // — half the art's brightness, not a subtle miss. That is an albedo choice, in scope for the
  // floor-material item, and not the settled "do not chase the warm shaded floor" ruling, which
  // is about CHROMA (candlelight this room has and the bar does not), not raw level. Swept live
  // at 1.6x / 2.0x / 2.4x off the default and re-measured against the same art patch (36.22):
  // 27.6 / 32.6 / 37.7. 2.0x is shipped — 2.4x matched the art almost exactly but pushed the
  // grade gate's darkest decile from 7.9 to 8.1, out of the 2-8 band, for a shadow floor that
  // has no business matching a room lit only by daylight when this one is also candlelit. A
  // dedicated bake costs one more 1024 compile, which this room's own budget notes (eleven owned
  // surfaces at 7.8 s total) have room for. `room.gallery`'s own floor is untouched.
  //
  // ⚠ WHAT THIS DID NOT FIX: whole-frame macro variation, which is the number the brief predicted
  // this change would move toward the art (0.8815 against 0.7796). Measured at each brightness
  // above, whole-frame macro read 0.9968 / 0.9632 / 0.9411 / 0.9199 — WORSE than the pre-fix
  // baseline at every level tried, not better, and reflection was ruled out as the cause
  // (`?floorreflect=0` moves it 0.9632 -> 0.9596, inside noise). The mechanism: replacing an
  // edge-to-edge alternating chequer (which averages toward its own block mean at 32 px, since a
  // block spans several tiles) with a large uniform dark field plus a blown sun patch WIDENS the
  // frame's std/mean rather than narrowing it, regardless of the field's absolute tone. The
  // composition match to the bar is real and measured elsewhere (see the report); this specific
  // metric is not the one it fixes, and chasing it further into brightness costs the grade gate
  // for no return — see the sweep above. Left open rather than forced.
  let floorParquet = null;
  if (FLOOR === 'mixed') {
    const pw = (R.x1 - R.x0) - FLOOR_BORDER * 2;
    const pd = (R.z1 - R.z0) - FLOOR_BORDER * 2;
    // ⚠ ROUND 17 TAKES THE 2.0x BACK TO 1.2x, AND IT IS THE SAME MEASUREMENT THAT PUT IT THERE.
    // The sweep above is round 14's, and its logic is sound: match a shaded patch of this floor
    // to the same patch of the bar. What invalidated the ANSWER is that round 17 moved the
    // directional fill up 3.5x (see the LIGHTS block), so the shaded floor this brightening was
    // compensating for is no longer dark. Re-read with `harness/_eye17_rect.mjs`, same idea,
    // same bar:
    //
    // Two fixed rects on `cam=eye.arch`'s shaded parquet, and the bar's own two floor patches:
    //
    //     shaded floor patch          rgb                 L      chroma
    //     refs/bf1 mid-floor           58.1, 54.2, 44.9   54.3    13.2
    //     refs/bf1 near-floor          37.7, 33.2, 21.5   33.3    16.1
    //     this room, before rect0      95.2, 69.1, 55.4   73.7    39.8
    //     this room, before rect1     115.0, 85.6, 69.9   90.7    45.1
    //     this room, after  rect0      67.2, 52.4, 45.4   55.0    21.8
    //     this room, after  rect1      76.8, 60.1, 51.1   63.0    25.7
    //
    // So it lands ON the bar's brighter patch instead of at 1.7x it, and the chroma comes back
    // with it — 40-45 was oak rendered as terracotta. It does not reach the bar's DARKER patch
    // and cannot: the planar floor reflection contributes a term this albedo does not scale, so
    // there is a floor under how dark this surface can be made by albedo alone. Chasing it
    // further would be chasing the reflection, which is a different knob and a different round.
    //
    // The room's own warm bias is deliberately NOT chased — this room is candlelit and the bar
    // is not, which is this file's settled ruling. Only the level moves.
    //
    // ⚠ AND THIS IS THE REST OF THE BLOWN-FLOOR HATE. Round 17's key/fill re-solve took the
    // sunlit parquet from a solid white plateau down to something with contrast in it, but a
    // patch measured at L 198.8 with chroma 12.2 is still oak rendered as bleached pine: ACES
    // desaturates as it saturates, so an albedo this bright cannot hold its colour anywhere the
    // sun actually lands. Exposure could not reach that and neither could the key — the albedo
    // is the third term and this is it. The sunlit patch reads L 198.8 -> 174.8 across this
    // change, i.e. still bright, which is correct for a floor in direct sun; what it stops
    // being is COLOURLESS.
    const parquetFloorMat = parquetMat({
      // ⚠ THE PATTERN CONTRAST, NOT THE LEVEL, IS WHAT A BLIND PAIR NOW TURNS ON. Put the
      // composition-matched capture beside `refs/bf1/bf1-ballroom-01.png` unlabelled and the
      // fastest tell is no longer brightness or colour — both are matched — it is that the
      // bar's floor is a large CALM expanse whose parquet pattern is barely legible (a tone),
      // and this one's is a high-contrast diamond repeat that reads as patterned wallpaper
      // across the biggest surface in the frame. `oakDark` was 47% of `oak`; a real waxed
      // parquet's stave-to-stave variation is nothing like a 2:1 ratio. 0.73 halves the
      // pattern's contrast and leaves the panel joints doing the work, which is what the
      // reference's floor actually shows.
      oak: oakHue([0.281, 0.183, 0.101]), oakDark: oakHue([0.205, 0.135, 0.078]),
      wear: 0.6, bakeDust: FLOOR_DUST, patCon: FLOOR_PAT, waxVar: FLOOR_WAX,
      // ⚠ AND THE JOINTS, WHICH ARE THE OTHER HALF OF THE SAME COMPLAINT. Halving the
      // stave-to-stave contrast above stopped the WOOD reading as pattern; the board joints
      // kept drawing the grid on their own, because they were mixing 85% toward near-black.
      // 0.44 / 0.62 keeps them legible underfoot and lets them close up at room distance,
      // which is what a waxed floor's joints actually do.
      joint: 0.44, jointDark: 0.62,
      // ⚠ AND THE RELIEF, WHICH WAS THE REAL CULPRIT. Softening the albedo joints barely moved
      // the read, because the pattern was mostly in the NORMAL map: 35 mm of height on a floor
      // carves every panel border and every diamond into a visible groove, and 21 x 11 m of
      // that is a carved grid no matter what colour it is. 8 mm and a third of the normal
      // strength leaves the joints as something you find underfoot rather than something that
      // patterns the room.
      // ⚠ 0.016 / 0.50 RATHER THAN 0.008 / 0.34, AND THE METRIC IS WHY THE FIRST TRY WENT TOO
      // FAR. Flattening it hard took `cam=eye.floor`'s bright-region local contrast from 6.72
      // to 4.05 — the parquet's relief IS most of what a floor-filling frame has to look at,
      // and removing all of it trades "reads as pattern" for "reads as lino". Half the relief
      // keeps the joints as something the light catches at a raking angle without carving the
      // panel grid across the room. Worth stating that `_eye17_clip.mjs`'s `detail` counts the
      // pattern as detail, so it is exactly the wrong instrument for this one change and was
      // read here only as a floor, not as a target.
      height: 0.016, normal: 0.50,
      // `?floorpattern=plain` lays the same oak in a running block bond instead of Versailles
      // panels — see the note at `uPlain` in materials-local.js. Default is the panel this
      // room has always had; the toggle exists so the design decision can be made from two
      // pictures rather than from an argument.
      plain: FLOOR_PLAIN,
    });
    parquetFloorMat.name = 'ballroom-floor-parquet';
    engine.onDispose?.(() => parquetFloorMat.dispose());
    floorParquet = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), parquetFloorMat);
    floorParquet.rotation.x = -Math.PI / 2;
    floorParquet.position.set(0, 0.004, 0);
    floorParquet.receiveShadow = true;
    floorParquet.name = 'floor-parquet';
    {
      // Repeat picked for a ~0.7 m panel cell over this field — the same reasoning
      // `room.gallery` used for its own parquet floor (2.6 x 10.0 over a 7.2 x ~25 m plane) —
      // not the INTEGER-repeat rule the chequer needs above: PARQUET_SURFACE keys its stave and
      // panel colour off per-cell hashes, not off world-space UV parity, so there is no seam to
      // protect and the repeat count can scale continuously with the border.
      const uv = floorParquet.geometry.attributes.uv;
      // ⚠ 2.9 STANDS, AND A SCALE CORRECTION WAS TRIED HERE AND MADE IT WORSE. At 2.9 the panel
      // cell is 0.72 m and `PARQUET_SURFACE` fits a 5 x 5 diagonal lattice inside it, so the
      // pieces come out at 14 cm where a real Versailles panel's are 20-25 cm. That looked like
      // the explanation for the last thing a blind pair against `refs/bf1/bf1-ballroom-01.png`
      // was turning on — this floor reads as PATTERNED and the reference's, which is also
      // parquet, reads as a tone. So the cell went to 1.09 m (divisor 4.4) to put the pieces at
      // 21 cm.
      //
      // It came back MORE patterned, not less, and the reason is worth keeping: at room
      // distance what draws the eye is not the piece size but the PANEL FRAME, and making the
      // cells bigger makes each frame a bolder square. Finer would hide the pattern and would
      // also be joinery no one has ever made. The two cannot both be had from this surface —
      // the reference gets realistic pieces AND a calm floor by having no lattice at all.
      //
      // So the remaining gap is the PATTERN ITSELF, it is a design decision about this room
      // rather than a defect, and it is John's. Everything that could be done without making
      // it is done: joint darkness and relief are both softened (see the bake above).
      const ru = pw / 2.9, rv = pd / 2.9;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
    }
    scene.add(floorParquet);
  }

  /**
   * ---- THE ORDER (call 1 of 3): window wall, mirror wall + gallery, arched end wall -------
   *
   * 🆕 **THIS ROOM'S ARCHITECTURE NOW LIVES IN `src/world/ballroom-order.js`, WHICH THE GAME
   * BUILDS FROM TOO** (`estate-3`, 2026-08-09). Third of John's three rooms, after
   * `gallery-order.js` (`estate-1`) and `study-order.js` (`estate-2`), and the one three
   * rounds recorded as un-portable because the game's ballroom was a 7.20 m storey against this
   * one's two-storey 9.6. **That constraint did not exist** — `DIG_H` is a fixed 2.80 m band
   * and every `.storey` reader in `room.js` is parametric — so `spaces.js` raised the game's
   * ballroom to 9.60 and the order goes across UNCUT, upper window register and all.
   *
   * ⚠ **NOTHING ABOUT THIS VIEW'S RENDER MAY MOVE**, and it is checked by pixel diff rather than
   * asserted: `shoot.mjs --view room.ballroom` before and after is byte-identical. Three
   * properties make that possible and they are the design — every dimension is a PARAMETER this
   * file passes as the literal it already had, a `FramedBin` proxy renames buckets so no shared
   * kit builder is touched, and emission ORDER is preserved term for term. The order is emitted
   * in THREE calls because two things this file owns land between the phases: the five-band
   * vestibule (below) and the `?depot=` packing cases.
   */
  const PLAN = ballroomPlan({
    x0: R.x0, x1: R.x1, z0: R.z0, z1: R.z1, h: R.h, split: STOREY, galleryY: GALLERY_Y,
    win: WIN,
    bays: { window: 8, mirror: 6, end: 8, near: 8 },
    // ⚠ `spandrelSteps` IS NOT OPTIONAL HERE EITHER, AND THE ORDER'S OWN COMMENT SAYS THE
    // OPPOSITE. `ballroom-order.js` records "the showcase never needed one, because its opening
    // is cut to the arch by `wallRun`" — it is not: the openings that block hands `wallRun` are
    // `{x0, x1, y0: 0, y1: a.h}`, i.e. RECTANGLES, exactly like the game's. So the two corners
    // above the springing line have always been open into the vestibule, and the aperture has
    // always been a 5.2 x 5.2 m rectangle with an arch outline drawn inside it.
    //
    // Nobody could see it because the vestibule behind was black (see the emission note there),
    // so an open corner onto black and an arch onto black are the same pixels. Lighting the
    // vestibule in this round made the rectangle appear, which is the usual way one fix finds
    // the next. `room.js` already passes 28 for its own copy of this arch.
    arches: [{ x: 0, w: 5.2, h: 5.2, spring: 2.6, t: 0.30, spandrelSteps: 28 }],
  });
  const winZ = PLAN.winZ;
  ballroomOrder(bin, {
    plan: PLAN, keys: K, pilasterKey: 'pil', uvWall: 1.15,
    ...(CAP < 1 ? { capKey: 'cap' } : {}),
    parts: { nearWall: false, ceiling: false, mirrors: false, dressing: false, balustrade: false },
  });
  // the vestibule beyond the arch, so the opening is not a black hole
  //
  // ⚠ IT IS A SEPARATE, DARKER KEY BECAUSE THE OVERLOOK LOOKS THROUGH THE ARCH AND THE r10
  // CAMERA DID NOT. At eye height the arch reads as a dark opening and the back wall is barely
  // in it; from the gallery the eye goes straight down the vestibule and lands on 6.6 x 5.6 m
  // of plain stone lit to roughly the value of the room — a FEATURELESS PALE CARD covering
  // about 4% of the frame, and the largest detail-free area in the new picture. Nothing about
  // the wall changed; the camera did. Darkening it to a third puts the anteroom BEHIND the
  // ballroom in depth instead of level with it, which is what an unlit service space looks
  // like, and it costs one draw call (a new bin bucket) and no bake — it is a clone of the
  // same baked stone maps. It also gets a floor, which it never had: `R.z0 - 8..-12.4` is
  // outside the 28 x 18 floor plane, so the vestibule was standing on nothing.
  // ⚠ 0x4a4640 WAS TOO FAR AND THE GRADE GATE CAUGHT IT: this anteroom is ~4% of the frame and
  // the gate's darkest decile is 10% of it, so at a third value the vestibule alone took the
  // darkest decile 2.3 -> 1.4 and turned a PASS into a WARN (target 2-8). Two thirds keeps the
  // depth read and puts the decile back inside the band. Measured both ways, same build.
  // ⚠ CAM-GATED (`toggle-audit-1`, round 14). `?cam=r10` is meant to be a byte-for-byte
  // reproduction of the rounds 1-12 camera, and this line was not conditioned on it — so the
  // "historic reproduction" was silently getting r13's darker vestibule key even though that
  // key did not exist when the r10 gate figure (0.123 / 39.1 / 4.5) was filed. A critic's fresh
  // `?cam=r10` capture read 0.122 / 37.6 / 3.1, and this line is one of the two reasons.
  // Pre-r13 the vestibule wall was the room's own `mats.stone`, unmodified — the "featureless
  // pale card" the r13 header describes — so `?cam=r10` leaves this clone's colour untouched
  // rather than keying it two-thirds down.
  //
  // ITEM 2 (estate-owner-15, ROUND 15): "two thirds" (0x6d685e) turned out to still be a WRONG
  // FIX, just a smaller one — `harness/_eo15_vest_sweep.mjs` forced this mesh to pure white and
  // it STILL only read ~(43-63) through the arch, confirming the space genuinely receives very
  // little light; at 0x6d685e specifically it sampled literal (0,0,0) at four fixed points behind
  // the arch, not merely dark. That is the render's own `contrast: 1.06` grade term doing it: its
  // pivot-at-0.5 formula pushes any sufficiently dark linear value NEGATIVE before the final
  // clamp, so a colour can be genuinely present and still rasterize to true zero — same mechanism
  // whether the cause is "too dark a light" or "too dark an albedo". No amount of local geometry
  // or normal variation can read through a flat zero, which is why 4x-brightening a crop of it
  // showed nothing rather than a dim shape.
  // 0x6d685e -> 0x9a9486 (r15) got the space off literal zero but LEFT IT ONE FLAT COLOUR, and a
  // critic re-confirmed at 8x it is still "uniform grain with zero legible geometry" — a single
  // flat tint can never read as depth, because depth IS a gradient. r15's own header named the
  // fix and did not build it: "an authored near/far gradient — a different material per surface
  // — rather than one flat colour."
  //
  // ITEM 1 (estate-owner-16, THIS ROUND): built as THREE flat z-bands (near/mid/far) rather than
  // one continuous vertex-colour ramp, because every surface in this room is a flat merged-
  // material bucket (see `GeoBin`) and three buckets is the cheap version of the same cue — no
  // new bake, one more draw call than r15's single 'vest' bucket. The FAR band (and the back
  // wall, which was always the room's single darkest vestibule surface) keeps r15's EXACT
  // 0x9a9486 — unchanged, because that value is the one already proven off true zero and inside
  // the gate, and going darker risks the same negative-clamp mechanism ITEM 2 above describes.
  // Only the NEAR and MID bands (2/3 of the side-wall/ceiling/floor area, i.e. under half of the
  // vestibule's own ~4% of the frame) get brighter, tapering toward the arch — which is also
  // where a little of the ballroom's own bounce light would plausibly reach first. That is the
  // "cheaper per unit of visible improvement in toe-decile budget" the r15 header asked for:
  // brightening the WHOLE plane to the near-band value would have spent the budget across 3x the
  // area for the same peak brightness; concentrating it near the arch buys more visible contrast
  // per unit of darkest-decile L spent. Swept live: rebuild, `harness/shoot.mjs --view
  // room.ballroom`, `harness/grade.mjs` against the canonical 0.087/31.9/7.5, plus
  // `harness/_estate14_floorcrop.mjs` for matched before/after 8x crops of the arch — see the
  // report for the measured result: still dark, still a "not black" read rather than a lit
  // gallery, but now a real stepped gradient instead of one flat plane of grain.
  //
  // FIVE bands rather than three, added after a first three-band pass measured PASS 0.087/32.0/7.6
  // (canonical 0.087/31.9/7.5 — toe moved +0.1 against a ceiling of 8) and read as a visible but
  // coarse two-step edge rather than a ramp. `GeoBin.add()` strips any vertex-colour attribute at
  // merge time (`kit.js`, out of this round's file list, keeps only position/normal/uv), so a
  // true continuous gradient is not available without touching a shared file five other views
  // depend on — five flat bands is the finer-grained version of the SAME technique already
  // budget-checked, not a new mechanism. The far band's colour is left mathematically exact to
  // r15's `0x9a9486` (t=1 below) so it still butts seamlessly against the unchanged back wall.
  const VEST_FAR = new THREE.Color(0x9a9486);   // r15's value, unchanged — proven safe
  const VEST_NEAR = new THREE.Color(0xdfd7c2);  // +~45% over far, only at the arch-adjacent band
  //
  // ---- ROUND 17: THE VESTIBULE HAS NOTHING LIGHTING IT, AND ALBEDO CANNOT FIX THAT --------
  //
  // Rounds 15 and 16 both went at this surface and both went at its COLOUR — r15 took the
  // vestibule out of literal (0,0,0), r16 split it into five z-bands tapering toward the arch.
  // Both were measured at the overlook, which sees the aperture at an angle and mostly sees the
  // NEAR bands, and both left the thing a player actually looks at alone: stand in the room and
  // face the arches (`cam=eye.door`) and the opening is a flat black rectangle 5.2 m across
  // with an arch outline on it. `_eye17_pick` says those pixels are `kit:vest` — the BACK WALL,
  // 4.2 m beyond the aperture.
  //
  // ⚠ AND NO ALBEDO REACHES IT, WHICH IS WHY TWO ROUNDS OF ALBEDO DID NOT. Every light in this
  // scene is inside the ballroom: one spot outside the window wall aimed at the floor, three
  // directional fills, and the practicals. The vestibule is a closed box on the far side of a
  // wall, so the only thing that lands on its back wall is the environment shell's own -z face,
  // and r15 already established by forcing this mesh to pure WHITE that the ceiling it can
  // reach is ~(75,60,52) — i.e. the surface is indirect-lit to the point where its colour is
  // nearly irrelevant. A black hole with a lighter paint in it is still a black hole.
  //
  // So it gets a light of its own, as emission rather than as a light: adding a real one would
  // put `numPointLights` up, and this file's own practicals note says that recompiles every
  // material in the scene. The story is the one the architecture already implies — the
  // vestibule leads somewhere, and somewhere has a window — so the emission RISES with depth,
  // opposite to the albedo taper above (which models the ballroom's own light spilling IN).
  // The two together give the opening a front-to-back gradient, which is what makes an aperture
  // read as a passage rather than as a plate.
  //
  // `?vestglow=0` ablates it back to r16.
  const vestTiers = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const m = stoneDusty.clone();
    if (CAM !== 'r10') m.color = VEST_FAR.clone().lerp(VEST_NEAR, 1 - t);
    if (CAM !== 'r10' && VEST_GLOW > 0) {
      // Cool, because it is meant to read as daylight from a room this one cannot see, against
      // a ballroom whose own fill is candlelit and warm. That contrast is the whole read.
      m.emissive = new THREE.Color(0x8f98a6);
      // Solved by shooting `cam=eye.door` and measuring a fixed 120x80 rect inside the
      // aperture (`harness/_eye17_rect.mjs`): r16 leaves it at L 13.5, which is the black
      // card. These numbers put it at L 32.1 — dimmer than the ballroom's own shaded walls,
      // which is the relationship a room beyond a doorway has to have, and far enough off
      // the floor of the range to stop reading as a hole.
      m.emissiveIntensity = (0.080 + 0.256 * t) * VEST_GLOW;
    }
    m.name = `vestibule-stone-t${t}`;
    return m;
  });
  const VEST_KEYS = ['vestNear', 'vestT25', 'vestT50', 'vestT75', 'vest'];
  VEST_KEYS.forEach((k, i) => { M[k] = vestTiers[i]; });
  engine.onDispose?.(() => vestTiers.forEach((m) => m.dispose()));
  // ---- the back wall, in FIVE VERTICAL STRIPS (round 17) ---------------------------------
  // One box lit by one emissive is a uniform slab, and a uniform slab 5.2 m across at the end
  // of a passage is a grey card where there used to be a black one. What says "there is a room
  // through there" is that the light in it comes from SOMEWHERE — so the back wall carries a
  // lateral ramp, as if a window were off to the left of whatever space this leads into. Same
  // trick as the z-bands above and the same reason it is banded rather than mapped: a gradient
  // texture would mean a new bake, and five strips are five boxes.
  const VEST_BACK_KEYS = ['vestB0', 'vestB1', 'vestB2', 'vestB3', 'vestB4',
    'vestB5', 'vestB6', 'vestB7', 'vestB8'];
  const vestBack = VEST_BACK_KEYS.map((k, i) => {
    const t = i / (VEST_BACK_KEYS.length - 1);
    const m = vestTiers[4].clone();
    m.name = `vestibule-back-b${i}`;
    if (CAM !== 'r10' && VEST_GLOW > 0) {
      m.emissive = new THREE.Color(0x8f98a6);
      // 0.62x to 1.38x about the far tier's own value. The first pass ran 0.42-1.55 over five
      // strips and the STEPS were visible as five flat panels — a banded gradient is only
      // invisible while each step is under the eye's own threshold, and 3.7x across five bands
      // is not. Nine strips over a 2.2x range puts each step at about 9%, which reads as a
      // gradient. (This is the same failure r16 fixed on the z-bands by going from three bands
      // to five, and for the same reason.)
      m.emissiveIntensity = (0.080 + 0.256) * VEST_GLOW * (0.62 + 0.76 * t);
    }
    M[k] = m;
    return m;
  });
  engine.onDispose?.(() => vestBack.forEach((m) => m.dispose()));
  VEST_BACK_KEYS.forEach((k, i) => {
    const bw = 6.6 / VEST_BACK_KEYS.length;
    bin.box(k, bw, 5.6, 0.3, -3.3 + (i + 0.5) * bw, 2.8, R.z0 - 4.2, 1.6);
  });

  // ---- AND A DOOR AT THE END OF IT (round 17, second pass) --------------------------------
  //
  // With the room re-graded onto the bar's ladder the vestibule stopped being a black card and
  // became a GREY one: a fixed 150x90 rect inside the aperture reads L 27.7 against L 31.3 for
  // the shaded wall beside it, so the opening is now within four counts of the masonry it is
  // cut into. Even brightness is the problem — the eye reads an aperture as a passage only if
  // something in it is at a DIFFERENT depth, and a uniformly lit end wall gives it nothing.
  //
  // So the vestibule gets a door standing open onto a lit room, offset from the axis so it is
  // not a bullseye, plus the light it throws on the floor in front of it. Two boxes. It is the
  // cheapest possible depth cue and the only one that also answers "where does this go" — this
  // room is the hub of a house the player digs through, and an eyeline that ends in a lit
  // doorway is the difference between a wall with a hole in it and a way on.
  if (VEST_GLOW > 0 && CAM !== 'r10') {
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x2a2c30, roughness: 0.9, metalness: 0,
      // Warm, and deliberately the OPPOSITE temperature to the vestibule's own cool wash: the
      // wash is meant to read as daylight from an unseen window, this as a lit interior, and
      // two different light sources at two different depths is what sells the space as real.
      emissive: new THREE.Color(0xffdcb4), emissiveIntensity: 1.25 * VEST_GLOW,
    });
    engine.onDispose?.(() => doorMat.dispose());
    // ⚠ A DOOR AJAR, NOT A LIT RECTANGLE. The first build was one uniform emissive quad on the
    // back wall and it read as a poster stuck to it — no jamb, no depth, no reason for its own
    // edges. What makes an opening read is the stuff AROUND it: a leaf standing across most of
    // the aperture, a bright slot beside the leaf, and an architrave with a dark inner edge for
    // both to sit in. Four boxes, and the slot is now a shape a viewer can name.
    const doorGroup = new THREE.Group();
    doorGroup.name = 'vestibule-door';
    const zw = R.z0 - 4.03;
    // the lit slot — narrow, because a door left ajar is
    const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 2.62), doorMat);
    slot.position.set(-1.62, 1.31, zw);
    doorGroup.add(slot);
    // the leaf itself, catching a little of its own spill on the room side
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x1a1712, roughness: 0.85, metalness: 0,
      emissive: new THREE.Color(0xffcf94), emissiveIntensity: 0.075 * VEST_GLOW,
    });
    engine.onDispose?.(() => leafMat.dispose());
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.02, 2.62, 0.06), leafMat);
    leaf.position.set(-0.82, 1.31, zw + 0.10);
    leaf.rotation.y = -0.22;                    // swung into the vestibule
    doorGroup.add(leaf);
    // architrave: a dark surround so the whole thing is an opening in a wall
    const jambMat = new THREE.MeshStandardMaterial({ color: 0x151714, roughness: 0.9, metalness: 0 });
    engine.onDispose?.(() => jambMat.dispose());
    {
      // merged for the same draw-call reason as the courtyard above
      const js = [];
      for (const [jw, jh, jx, jy] of [[0.16, 2.86, -2.02, 1.31], [0.16, 2.86, -0.24, 1.31], [1.94, 0.16, -1.13, 2.70]]) {
        const g = new THREE.BoxGeometry(jw, jh, 0.10);
        g.applyMatrix4(new THREE.Matrix4().makeTranslation(jx, jy, zw + 0.05));
        js.push(g);
      }
      const merged = mergeGeometries(js, false);
      for (const g of js) g.dispose();
      if (merged) doorGroup.add(new THREE.Mesh(merged, jambMat));
    }
    scene.add(doorGroup);
    // The pool it throws — a plain quad on the vestibule floor rather than a light, for the
    // same numPointLights reason the wash itself is emissive.
    const spillMat = new THREE.MeshStandardMaterial({
      color: 0x33352f, roughness: 0.95, metalness: 0,
      emissive: new THREE.Color(0xffcf94), emissiveIntensity: 0.30 * VEST_GLOW,
    });
    engine.onDispose?.(() => spillMat.dispose());
    const spill = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.4), spillMat);
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(-1.66, 0.02, R.z0 - 2.9);
    spill.name = 'vestibule-spill';
    scene.add(spill);
  }
  // side walls / ceiling / floor: each split into five 0.84 m z-bands spanning the same
  // R.z0-4.2..R.z0 range r15's single boxes covered — near (at the arch) to far (at the back
  // wall), so the total footprint and draw surface area are exactly unchanged, only re-bucketed.
  VEST_KEYS.forEach((key, i) => {
    const z = R.z0 - (i + 0.5) * 0.84;
    bin.box(key, 0.3, 5.6, 0.84, -3.3, 2.8, z, 1.6);
    bin.box(key, 0.3, 5.6, 0.84, 3.3, 2.8, z, 1.6);
    bin.box(key, 6.6, 0.3, 0.84, 0, 5.6, z, 1.6);
    bin.box(key, 6.6, 0.12, 0.84, 0, -0.06, z, 1.6);
  });

  /**
   * ---- THE NEAR WALL AND THE CEILING (order call 2 of 3) -------------------------------
   *
   * ⚠ THE NEAR WALL WAS HALF A WALL, AND ONLY THE r10 CAMERA HID IT. Every other wall in this
   * room is built as TWO storeys (0..4.8 and 4.8..9.6); this one stopped at 4.8 and the 4.8 m
   * above it was open to the void — the cove and coffers simply ended in mid-air. It never
   * showed because the r10 camera stands at z 6.1 with this wall behind it, so nobody had
   * looked: `node harness/_eo13_cam.mjs --shots --cams "NEARWALL:0,5,-4,0,4.5,8,60"` points a
   * camera at it and photographs a black band across two-thirds of the frame. It carries the
   * same full-height pilaster order as the other three, because any overlook framing wraps its
   * left edge past x -13 and puts 5-10% of the picture on it.
   *
   * The ceiling — cove, 7 x 4 coffer grid, three roses and the gilt anthemion frieze — comes
   * with it, because nothing of this view's own goes between them.
   */
  ballroomOrder(bin, {
    plan: PLAN, keys: K, pilasterKey: 'pil', uvWall: 1.15,
    ...(CAP < 1 ? { capKey: 'cap' } : {}),
    parts: {
      windowWall: false, mirrorWall: false, endWall: false,
      mirrors: false, dressing: false, balustrade: false,
    },
  });

  // ---- dressing ----------------------------------------------------------
  //
  // ⚠ THE PIER MIRRORS ARE NOT IN THIS FRAME, AND HAVE NEVER BEEN.
  //
  // `critic-estate-3` files "the mirror still does not read as a mirror -- a crop shows a
  // slightly different wall panel". The second half of that sentence is exactly right and it is
  // the answer to the first half: it IS a wall panel. Settled with the ownership raycast rather
  // than by looking harder —
  //   node harness/_tmp_geoprobe.mjs --pick --view room.ballroom --grid 0,0,1920,1080,24
  // rasterises the whole frame and `pier-mirrors` never once appears in it; a 10-wide raster
  // over the right-hand 300 px does not find it either. Projecting the plate at z -5.3 through
  // this camera by hand agrees: it lands at screen x 2.37, i.e. more than a frame width off the
  // right edge. The camera stands at (7.4, 1.62, 6.1) looking toward -X and -Z, and the mirror
  // wall is at x +13 BEHIND it.
  //
  // So two rounds of probe and material work have been aimed at an object nobody can see, which
  // is the failure class this project has recorded twice already (the boot seam, the plugged
  // socket). The plates on the pier wall stay — that wall is real and other cameras will use it
  // — and the room gets mirrors WHERE THE FRAME LOOKS: on the end wall, flanking the arch,
  // which the raycast shows occupies the centre and right of the picture. They also fill two of
  // the "large stretches of unbroken flat gilt-striped wall" the same verdict complains about.
  // ---- ROUND 5: WHY THE PLATES REFLECT A BLOB, SOLVED AS OPTICS -------------------------
  // `critic-estate-4` confirmed the plates are in frame and then said the thing in them is "a
  // dark-blob-to-pale-gradient ... no window mullions, no chandelier glint, no checker floor".
  // That is not a material fault and not a probe fault — both are working. It is where the
  // plate is hung. Traced for the right-hand plate, camera (7.4, 1.62, 6.1), plate centre
  // (5.4, 2.95, -7.78), normal +Z:
  //   incident  d = (-0.142,  0.094, -0.985)
  //   reflected r = (-0.142,  0.094, +0.985)   (a +Z normal only flips z)
  // r has POSITIVE elevation, so every ray leaving this plate travels back up the room and
  // lands on the far (+Z) end wall between y 2.7 and y 6.1. The blob is that wall: dark above
  // its cornice, pale below, and the "ragged boundary" the crop shows is the cornice itself.
  // The mirror is behaving perfectly and pointing at the one surface in the room with nothing
  // on it.
  // The lever is NOT the probe. An envMap is sampled by DIRECTION alone, so moving the probe
  // changes what sits at a given angle but never the angle itself — that is why two rounds of
  // probe work could not shift this. Direction is set by the plate, and for an untilted plate
  // it is set by how much of it lies below the eye: below eye level d.y goes negative, r.y goes
  // negative with it, and the plate looks DOWN at the chequer.
  //
  // ⚠ THAT REASONING WAS TESTED BY DROPPING THE PLATE TO y 2.30 (spanning 0.55-4.05, so about a
  // quarter of the visible glass sits below the 1.62 eye) AND IT IS REFUTED BY THE CAPTURE.
  // The result is WORSE, and the reason is worth keeping because it is not obvious: a sub-eye
  // ray leaves the plate at a shallow DOWNWARD angle and meets a polished marble chequer at
  // grazing incidence, where a polished floor returns the bright ceiling rather than its own
  // pattern. So the chequer arrives as more pale wash. The plate went from a dark-over-pale
  // division with a legible horizon (the far wall's cornice) to a UNIFORM pale panel with
  // foxing at the edges — i.e. from "ambiguous" to "blank fogged glass", losing the one piece
  // of structure it had. Reverted to 2.95. Recorded rather than quietly undone, because the
  // next owner will otherwise re-derive the same idea from the same correct optics.
  //
  // WHAT IS ACTUALLY LEFT, stated plainly: at +5 degrees of elevation these plates can only
  // ever show the far end wall, and a chandelier sits at 32 degrees from here — so no untilted
  // plate on this wall can put one in the glass at any height or probe setting. The fix is a
  // forward RAKE, which is also what a real pier glass has; it is blocked on `pierGlass`
  // building its gilt surround flat against the wall, so a raked plate pokes through its own
  // frame. Plate and frame have to rake together, and that is a `pierGlass` signature change
  // deliberately not started at the end of a round. THE MIRRORS STILL DO NOT READ AS MIRRORS.
  // ---- ROUND 6: THE RAKE, WHICH IS THE THING THE LAST THREE ROUNDS WERE BLOCKED ON --------
  //
  // The optics trace above is right and its conclusion — "no untilted plate on this wall can
  // put a chandelier in the glass at any height or probe setting" — is right too. What it could
  // not do was act on it, because `pierGlass` built its surround flat. That is now a signature
  // change (`rake`), so plate and frame tilt together and the plate stops poking through its
  // own moulding.
  //
  // 9 degrees, and it is solved rather than picked. With n = (0, -sin r, cos r) and the traced
  // incident d = (-0.142, 0.0945, -0.985):
  //
  //   r = 0      reflected elevation  +5.4 deg   -> the blank top of the far end wall
  //   r = 9 deg  reflected elevation -13.0 deg at the plate centre, -21 at its foot, -4 at its
  //              head, i.e. the glass sweeps the CHEQUER FLOOR from about z 0 out to the far
  //              end and finishes on the end wall's base
  //
  // The chequer is the correct target and not just a convenient one: it is the highest-contrast
  // surface in the room, it is the one thing in frame whose reflection cannot be mistaken for a
  // wall panel, and its perspective converges — a gradient cannot fake a receding grid. It is
  // also NOT the failed y-2.30 experiment: that one dropped the plate so sub-eye rays met the
  // marble at grazing incidence and returned the ceiling. These meet it at 13-21 degrees, which
  // is where a polished floor returns its own pattern rather than the room above it.
  //
  // Pivoted about the BOTTOM EDGE, not the centre, or a 3.1 m plate raked 9 degrees buries its
  // own foot 0.24 m inside the wall. The foot stays welded to the wall and the head stands
  // 0.48 m proud, which is what a leaning glass looks like.
  // ---- ROUND 10: THE PARITY INVERSION WAS NEVER AN AIM PROBLEM ---------------------------
  //
  // `critic-estate-7` closed the far-mirror haze and opened its mirror image: "the two plates
  // are not at parity -- only the far mirror is unambiguously legible". Both plates run the
  // SAME planar technique into targets of the same height (506x1024 and 568x1024, fitted to
  // the plate corners), so texel density was never the difference and there was nothing to
  // sharpen.
  //
  // ⚠ THE ANSWER IS IN `fitMirrorCamera`, NOT HERE: more than half of the left plate was the
  // BACK OF ITS OWN END WALL, leaking past a flat near plane that is oblique to that wall.
  // The full diagnosis and the fix (an oblique near plane on the mirror plane) are documented
  // at that function. `?planarclip=flat` puts the defect back on demand.
  //
  // ⚠ AND A WRONG TURN WORTH KEEPING, because the next owner will otherwise take it. Before
  // that was found, the plate's AIM was measured and looked like the culprit.
  // `harness/_tmp_eo10_aim.mjs` reflects the eye ray about the plate plane over a 15x15 grid
  // and classifies where each reflected ray first lands, with the right plate as the control
  // (a critic verified it legible by name):
  //
  //     right plate (control)   FLOOR 60%              endZ 40%   floor z-span 10.4 m
  //     left  plate (soft)      FLOOR 29%   wall 54%   GLASS 17%  floor z-span  5.3 m
  //
  // Those numbers are CORRECT and the inference from them was WRONG. "54% wall" was read as
  // "54% blank", because the flat grey field in the capture was assumed to be that wall seen
  // at 13x magnification. It was not — it was the clipped end wall, and the window wall the
  // rays actually reach carries lancets, glazing bars, a lit pier and a sconce flame. Yawing
  // the plate 8 degrees (which does move the census to FLOOR 55 / wall 20 / GLASS 11, i.e.
  // onto the control's own numbers) was built, rendered, and then compared against yaw 0 with
  // the near plane already fixed: yaw 0 is the better picture — the stained-glass lancet is
  // the single most identifiable object in this room and the yaw traded it for more grey-white
  // dust sheet. So the yaw is 0, the pair stays symmetric, and the census stands as a record
  // of a measurement that was sound and an interpretation that was not.
  //
  // The per-plate `yaw` field is kept because the planar block now derives each plate's frame
  // from it, and a shared normal across differently-oriented plates is a silent-wrong-answer
  // bug of exactly the kind this round fixed.
  const RAKE = 0.157;                                     // 9 degrees
  const EM_H = 3.10, EM_FOOT = 1.30;
  const END_MIRROR = {
    z: R.z0 + 0.22 + (EM_H / 2) * Math.sin(RAKE),
    y: EM_FOOT + (EM_H / 2) * Math.cos(RAKE),
    w: 1.70, h: EM_H, rake: RAKE,
    // x paired with the yaw that plate is turned by on its stand. Both 0: see the wrong-turn
    // note above — yaw was measured, built and rejected once the near plane was fixed.
    plates: [{ x: -5.4, yaw: 0 }, { x: 5.4, yaw: 0 }],
  };
  END_MIRROR.x = END_MIRROR.plates.map((p) => p.x);
  /**
   * The gilt SURROUNDS go into the shared bin through the order; the PLATES are built further
   * down against the planar reflection target, which is this view's own business and no part of
   * the architecture. `pierGlass` already composes T * rotY * rotX, so the surround, the
   * cresting and the plate share the yaw by construction — the reason the rake moved into it in
   * round 6.
   *
   * FAR-CORNER DRESSING is in the same call. "The far corners and the wall opposite the windows
   * are large stretches of unbroken flat gilt-striped wall." Console tables under the new
   * mirrors, urns on the outer piers, so the deepest part of the room has something in it to
   * measure the depth against.
   */
  PLAN.consoles = [
    ...END_MIRROR.x.map((mx) => ({ x: mx, z: R.z0 + 0.62, w: 1.55 })),
    { x: R.x1 - 0.55, z: 0, rotY: -Math.PI / 2, w: 1.8 },
  ];
  ballroomOrder(bin, {
    plan: PLAN, keys: K, pilasterKey: 'pil', uvWall: 1.15,
    ...(CAP < 1 ? { capKey: 'cap' } : {}),
    parts: {
      windowWall: false, mirrorWall: false, endWall: false, nearWall: false,
      ceiling: false, balustrade: false,
    },
    mirrors: {
      pier: [-5.3, -1.3, 2.7, 6.7].map((pz) => ({
        x: R.x1 - 0.20, y: 2.85, z: pz, rotY: -Math.PI / 2, w: 1.55, h: 3.3,
      })),
      plates: END_MIRROR.plates.map((p) => ({
        x: p.x, y: END_MIRROR.y, z: END_MIRROR.z, w: END_MIRROR.w, h: END_MIRROR.h,
        rake: END_MIRROR.rake, rotY: p.yaw,
      })),
    },
  });

  // ---- THE DEPOT: PACKING CASES, TRESTLES AND SPILLED PAPER ------------------------------
  //
  // `critic-estate-9`'s item 2: "the reference is stuffed with crates, a statue, scattered
  // paper, wreckage; this room has a robot, a candelabra and a few sheeted shapes."
  //
  // ⚠ WHERE THE CASES STAND IS NOT DRESSING, IT IS THE SAME CRITIQUE'S ITEM 1. The one
  // shadow-casting light enters through the window openings, so the floor is lit ONLY in the
  // window patches, and those patches are solvable rather than guessable. With
  // dir = (0.865, -0.44, 0.24), a point at window height y lands Dx = 1.966y, Dz = 0.545y
  // further on, so each opening (sill 1.05, head 5.40) throws a parallelogram running
  // x -10.9 -> -2.4 and z (wz + 0.57) -> (wz + 2.94). For the four openings that exist in the
  // wall that is three bands visible in this frame:
  //
  //     window z -6.4   floor band z -5.83 .. -3.46
  //     window z -2.2   floor band z -1.63 ..  0.74
  //     window z  2.0   floor band z  2.57 ..  4.94
  //
  // A case standing IN one of those bands throws a hard shadow several metres long across the
  // chequer, which is precisely the "big hard sun patches and deep shade" the measurement asks
  // for and which no light-level change on its own can produce. So the stacks are placed on
  // the bands, not scattered.
  //
  // ⚠ AND THE SPOT CANNOT REACH THE WHOLE ROOM. Its cone is 0.34 rad about an axis meeting the
  // floor at (-6.7, 0, 3.75) from 29.3 m away, i.e. a ~10.4 m radius: nothing past about
  // x +3.7 casts at all. The two stacks beyond that (`x 6.4` and the trestle at `z -6.4`) are
  // there for MASS in the empty right third and are honest about getting no sun.
  if (DEPOT) {
    const K2 = { body: 'crate', batten: 'crate', timber: 'crate' };
    for (const [cx, cz, n, s, ry] of [
      // --- standing in the three sun bands, casting across the chequer ---
      [-9.4, -4.6, 3, 1.00, 0.35],
      [-8.2, -3.2, 2, 0.86, -0.6],
      [-6.9, -0.5, 2, 1.05, 0.15],
      [-10.4, 0.9, 4, 0.92, -0.25],
      [-5.6, 3.9, 3, 0.98, 0.55],
      [-8.6, 4.4, 2, 0.88, -0.4],
      // --- mass in the shaded half, where the frame was emptiest ---
      [1.6, -5.6, 3, 1.02, 0.20],
      [0.2, -4.4, 1, 0.90, -0.5],
      [6.4, -3.4, 2, 0.95, -0.15],
      [4.4, -6.4, 2, 0.84, 0.45],
    ]) {
      crateStack(bin, { keys: K2, x: cx, z: cz, n, scale: s, rotY: ry, rng, boards: 5 });
    }
    trestle(bin, { keys: K2, x: -6.2, z: 5.3, rotY: 0.28, len: 2.4 });
    trestle(bin, { keys: K2, x: 3.4, z: -6.9, rotY: -0.42, len: 2.0, h: 0.70 });
    // one case knocked on its side, because a depot that is all upright reads as a shop
    crateStack(bin, { keys: K2, x: -4.4, z: -5.2, n: 1, scale: 1.1, rotY: 1.1, rng, boards: 5 });
  }

  // ---- balustrade on the musicians' gallery ------------------------------
  const balusterStone = stoneDusty.clone();
  balusterStone.color = new THREE.Color(0xb8ae9c);
  balusterStone.name = 'gallery-baluster-stone';
  engine.onDispose?.(() => balusterStone.dispose());
  // The plinth and handrail go into the shared bin (they merge with the gilt and stone
  // buckets, no extra draw call); the balusters come back as one InstancedMesh.
  const bal = ballroomOrder(bin, {
    plan: PLAN, pilasterKey: 'pil',
    parts: {
      windowWall: false, mirrorWall: false, endWall: false, nearWall: false,
      ceiling: false, mirrors: false, dressing: false,
    },
    // ⚠ ITS OWN STONE, A SHADE DOWN FROM THE WALL'S. The balustrade stands in front of the
    // upper mirror wall and was cut from the same `mats.stone` as it, so at the distance
    // `eye.mirror` sees it the rail, the balusters and the wall behind them all sat within a
    // few counts of each other and the whole assembly read as one pale band. A real stone
    // balustrade is dirtier than the wall it guards — it is handled, and it collects what
    // falls past it — so this is age rather than a contrast trick.
    material: { baluster: balusterStone },
  });

  const meshes = bin.build(M, { noCast: ['glass', 'ceil', 'wintrim'] });
  for (const m of meshes) scene.add(m);
  scene.add(bal.instanced);

  // ---- the mirror wall ---------------------------------------------------
  // ROUND 3. `critic-estate-2` confirmed by crop what the previous round predicted but did
  // not fix: "a flat, textureless grey-beige plane with zero reflection". The prior owner's
  // diagnosis was correct and is the reason roughening it did nothing — A PERFECT MIRROR OF A
  // STRUCTURELESS FIVE-BOX IBL IS STRUCTURELESS. There was never anything for the plate to
  // reflect, so every knob on the material was being turned against a blank source.
  //
  // Fixed with the two halves that problem actually has:
  //
  //  1. SOMETHING TO REFLECT — a real reflection probe. One `CubeCamera` parked in front of
  //     the pier wall, rendered ONCE after the room is built, its cube map assigned as the
  //     plate's own `envMap`. That puts the three chandeliers, the window wall, the arched
  //     opening and the gilt cornice into the glass, which is the entire read the critic says
  //     is missing. It costs six 256px renders at build time and nothing per frame — the room
  //     is static, so a probe that never updates is not an approximation, it is exact.
  //     Assigning `envMap` ON THE MATERIAL is also the only path on which `envMapIntensity` is
  //     honoured at all (three.js overwrites the uniform with `scene.environmentIntensity` for
  //     anything lighting from `scene.environment`) — so the 2.2 this plate used to author and
  //     never get is now live.
  //
  //  2. SOMETHING TO BE — `foxedMirrorMat()`. Even a correct reflection of a dark room is
  //     mostly dark, and a mirror that is only its reflection has no surface. Oxidised
  //     amalgam bloom at the edges, black pinholes where the tin has lifted, and pouring
  //     drift give the plate detail at 20 cm and keep it legible where the reflection is
  //     empty. See the note on the material.
  //
  // The four plates are ONE mesh: coplanar, same material, so four draw calls of nothing.
  // ⚠ A DEDICATED BAKE, AND THE REASON IS THE SCALE OF THE FOXING, NOT ITS AMOUNT.
  // `mats.mirror` is `foxedMirrorMat()` at its defaults — fox 0.85, repeat [1,1] — and the
  // whole of this file's mirror history was written against plates that were 71 SCREEN PIXELS
  // wide, where one pattern repeat stretched over a 1.55 x 3.3 m plate is a soft mottle.
  // `cam=eye.under` passes within a metre of one, and at 700 px the same texture resolves into
  // what it actually is: a hard-edged Voronoi diagram, thin brown lines on a pale field, which
  // reads as cracked paint rather than as tarnished amalgam.
  //
  // ⚠ AND THE FIRST FIX FOR IT TRADED ONE DISTANCE FOR ANOTHER, which is worth recording
  // because it is the trap in every texture-scale change. repeat [3, 5] fixed `eye.under`
  // and broke `eye.mirror`: three cells across a plate is fine crazing at 1 m and a visible
  // regular GRID at 20 m, where the whole plate is 90 px and each cell is 30. A repeat only
  // disappears when it is finer than the eye can resolve at the CLOSEST distance it is seen
  // from, and then it is automatically finer than that at every other distance. [7, 14] is
  // that: sub-pixel mottle across the room, real crazing at arm's length. fox 0.85 -> 0.40
  // because a smaller pattern makes the same amount of it far more legible.
  //
  // The baker caches by key, so this costs one 1024 compile and `room.gallery`'s own mirrors
  // are untouched.
  const mirrorMat = foxedMirrorMat({ fox: 0.40, repeat: [7, 14] });
  engine.onDispose?.(() => mirrorMat.dispose());
  const mirrorPZ = [-5.3, -1.3, 2.7, 6.7];
  const mirrorGeos = mirrorPZ.map((pz) => {
    const g = new THREE.PlaneGeometry(1.55, 3.3);
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2)
      .premultiply(new THREE.Matrix4().makeTranslation(R.x1 - 0.21, 2.85, pz)));
    return g;
  });
  const mirrorMesh = new THREE.Mesh(mergeGeometries(mirrorGeos, false), mirrorMat);
  for (const g of mirrorGeos) g.dispose();
  mirrorMesh.name = 'pier-mirrors';
  scene.add(mirrorMesh);

  // The two plates that are actually IN FRAME. Their own material and their own probe, because
  // a cube map taken at the pier wall is the wrong hemisphere for a plate facing +Z: the two
  // walls are 26 m apart and look at opposite halves of the room. `foxedMirrorMat` shares its
  // baked textures with the pier plates through the baker's key cache, so the second instance
  // costs one material and no bake.
  // ONE MESH AND ONE PROBE PER PLATE, not one shared pair for both. The two plates are 10.8 m
  // apart and a cube map is exact only AT the reflector, so the shared probe at x 0 was 5.4 m
  // from each of them — on a FLAT mirror that is not a small approximation, it is pure parallax
  // error, and it puts the reflected floor half a room sideways. The previous owner wrote that
  // trade down honestly ("one cube cannot be exact for both"); with the rake now aiming the
  // glass at a receding grid rather than at a blank wall, it stops being affordable, because a
  // grid is exactly the content whose displacement you can see. Two 384 px cubes cost twelve
  // face renders once, in a room that never moves, and nothing per frame.
  // `?mirror=off` builds no end plates at all — see the toggle note at the top of the file.
  const endPlates = (mirrorMode === 'off' ? [] : END_MIRROR.plates).map(({ x: mx, yaw }) => {
    const g = new THREE.PlaneGeometry(END_MIRROR.w, END_MIRROR.h);
    // T * Ry(yaw) * Rx(rake) — the SAME composition order pierGlass uses for the surround, or
    // the plate and its own moulding come apart.
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(mx, END_MIRROR.y, END_MIRROR.z)
      .multiply(new THREE.Matrix4().makeRotationY(yaw))
      .multiply(new THREE.Matrix4().makeRotationX(END_MIRROR.rake))
      .multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.012)));
    // fox 0.52, not the 0.85 default. Foxing was carrying this plate for three rounds because
    // there was nothing else in it; with a real reflection arriving, heavy amalgam bloom eats
    // the thing it was standing in for. Enough to keep the glass antique, not enough to be the
    // subject.
    const mesh = new THREE.Mesh(g, foxedMirrorMat({ fox: 0.52 }));
    mesh.name = `end-mirror.${mx > 0 ? 'r' : 'l'}`;
    scene.add(mesh);
    return { mesh, x: mx, yaw };
  });

  // ---- sheeted furniture: the signature of a shut-up grand house ---------
  // TWO SHAPES, not one. `dustSheetRow` instances a single geometry, which is why every
  // sheeted item in the room was the identical loaf — the second call differed only in scale.
  // Sheeted CHAIRS along the back (tall narrow back over a low seat) and sheeted TABLES down
  // the window side (flat top, hard corners) give the row a silhouette to read, at the cost of
  // one extra draw call in a room now running 450 against a 625 budget. See the note in
  // `dustSheet()` for why the mass, not the material, was the defect.
  //
  // ROUND 12: THE MATERIAL IS THE OTHER HALF OF "READS AS STONE". `mats.plaster` is LIME
  // PLASTER — a mineral surface with a trowel-scale normal map and a cold chalk albedo — and it
  // was carrying every sheet in this room. No amount of geometry makes lime plaster read as
  // linen. This is a CLONE, so it shares the baked maps and costs no bake and no compile, with
  // two scalars changed:
  //   normalScale 0.30x   the trowel relief is what says "wall", and at this distance it is the
  //                       only micro-surface the eye gets. Killing most of it hands the read
  //                       back to the fold geometry, which is where it belongs.
  //   color               unbleached linen over a chalk-white map: warm, slightly darker, so
  //                       the sheets stop being the brightest neutral objects in a room whose
  //                       top decile the grade gate measures.
  // Rounded normals (`flatShading` stays off) plus the new radial pleats do the rest.
  const sheetMat = mats.plaster.clone();
  // ⚠ ROUND 17: 0xcfc6b4 -> 0xaea48f, THE THIRD ALBEDO THIS ROUND HAS HAD TO RE-SOLVE AFTER
  // THE KEY/FILL CHANGE, and the note above is the reason it needed one: this colour was
  // already chosen once so the sheets would "stop being the brightest neutral objects in a
  // room whose top decile the grade gate measures". A brighter fill put them straight back
  // there. Measured against the bar's own sheeted mounds (`harness/_eye17_rect.mjs`):
  //
  //     sheet patch                    rgb                    L      chroma
  //     refs/bf1 shaded mound           48.0,  47.8,  46.3    47.8     1.7
  //     refs/bf1 lit mound              89.8,  81.3,  71.3    82.4    18.5
  //     this room, shaded (corner)      88.7,  76.4,  66.0    78.3    22.7   ok
  //     this room, IN SUN (corner)     197.1, 196.4, 197.3   196.6     0.9   a white cut-out
  //     this room, in sun, AFTER       184.3, 182.5, 181.3   182.8     3.1
  //     this room, shaded, AFTER        85.0,  73.1,  62.9    74.9    22.1
  //
  // The shaded sheets were already right; the lit ones were two and a half times the bar's
  // brightest and had lost every trace of the warm bias the same cloth carries in shade. That
  // is unbleached linen rendered as printer paper, and it is why the folds this round put into
  // them stop reading the moment the sun reaches one.
  //     this room, AFTER the cool correction — see below
  //
  // ⚠ AND THE HUE WAS WRONG AS WELL AS THE LEVEL, which only showed once the level was right.
  // 0xaea48f is a warm tan, and against the bar's sheets — 48,48,46 in shade, 90,81,71 lit,
  // i.e. very nearly neutral — a room full of them reads as sand dunes rather than as linen.
  // Dust sheets are unbleached cotton that has been in a dark house for a decade: they go grey,
  // not gold. The room's own warm bounce supplies whatever warmth they should carry, and when
  // the ALBEDO carries it too the two multiply and the sheets end up the most saturated large
  // objects in the frame.
  // ⚠ AND THE ALBEDO HAS TO BE COOL TO LAND NEUTRAL, which is the step the previous pass
  // stopped one short of. 0xa9a79e is a warm-neutral linen, and under this room's key — a warm
  // sun and a warm-leaning fill — it renders at chroma 14.7 in shade and 30.2 in the light
  // against the bar's own sheets at 1.7 and 4.1. The reference's sheets are essentially GREY;
  // ours were still linen-coloured. An albedo is not what the viewer sees, the product of the
  // albedo and the light is, so a surface that must read neutral under a warm light has to be
  // authored cool by as much as the light is warm. That is the same reasoning the vestibule's
  // cool emission already uses two hundred lines down, applied to a material instead of a lamp.
  sheetMat.color = new THREE.Color(0x9fa5aa);
  if (sheetMat.normalScale) sheetMat.normalScale.multiplyScalar(0.30);
  sheetMat.name = 'dust-sheet-linen';
  engine.onDispose?.(() => sheetMat.dispose());
  scene.add(dustSheetRow({
    // ⚠ `variants` 2 -> 4 of 5 (round 17, third pass). `dustSheetRow`'s own header says why the
    // knob exists — "one geometry instanced N times is N copies of the same crease" — and the
    // default of 2 was chosen when these sheets were smooth enough that nobody could tell. Now
    // that they carry gathers AND a wrinkle field, two bakes across five sheets in one row is a
    // visible repeat, and it is the same "every mound the same cloth" the crates just answered.
    // Cost is one draw call per variant.
    count: 5, variants: 4, material: sheetMat, rng, w: 0.98, d: 0.92, h: 1.18, nx: 40, nz: 34,
    shape: 'chair', pleats: 7, from: [-7.5, 0, 5.6], to: [6.5, 0, 6.4],
  }));
  scene.add(dustSheetRow({
    count: 3, variants: 3, material: sheetMat, rng, w: 2.2, d: 1.2, h: 0.86, nx: 40, nz: 28,
    shape: 'table', pleats: 9, from: [-9.0, 0, -3.2], to: [-9.4, 0, 2.6],
  }));
  // Two sheeted MOUNDS among the packing cases — the reference's central pile is exactly this,
  // a heap of crates with a sheet thrown over it, and it is the one shape that says "the house
  // is being emptied" rather than "the furniture is stored".
  if (DEPOT) {
    scene.add(dustSheetRow({
      count: 2, variants: 2, material: sheetMat, rng, w: 3.2, d: 2.3, h: 0.98, nx: 46, nz: 38,
      shape: 'mound', pleats: 6, fold: 0.085, from: [-1.9, 0, -3.4], to: [4.9, 0, -1.6],
    }));
  }
  // ⚠ GILT FRAME, SILK SEAT. `cam=eye.back` puts five of these across the bottom of the widest
  // view the room has, and rendered entirely in `mats.gilt` they read as solid gold objects
  // rather than as furniture — a ballroom chair is a gilded frame with an upholstered seat and
  // splat, and the material split is most of that read. The silk is a faded rose that has been
  // in the dark for years: it has to be dark enough not to compete with the drapes, which are
  // the room's one saturated colour and need to stay so.
  const chairSilk = new THREE.MeshStandardMaterial({ color: 0x6b4a48, roughness: 0.78, metalness: 0 });
  engine.onDispose?.(() => chairSilk.dispose());
  scene.add(chairRow({
    count: 8, material: mats.gilt, seatMaterial: chairSilk, rng,
    from: [8.5, 0, -6.6], to: [8.9, 0, 5.4], face: -Math.PI / 2,
  }));

  // ---- spilled paper ------------------------------------------------------
  // The reference's mid-floor is a litter of ledger sheets turned out of a cabinet, and it is
  // not only dressing: a scatter of near-white rectangles on a dark floor is 32-px-block
  // variation of exactly the kind the macro measurement says this room is short of. One
  // InstancedMesh, one draw call, a plain non-baked material (paper has no interesting
  // surface at 6 m and a bake would cost seconds of D3D compile for nothing).
  //
  // The clusters sit ON the three solved sun bands and around the case stacks, because paper
  // spills where something was opened.
  if (DEPOT) {
    // ⚠ A LEDGER SHEET, NOT A4. The first build used 0.21 x 0.28 at albedo 0.81 and the probe
    // said all 78 were on screen while the picture showed nothing: a sheet that size, seen at
    // 10 m from a 1.62 m eye, is foreshortened to about 4 px, and 0.81 albedo on a floor whose
    // WHITE TILES are 0.90 makes it darker than half the surface it is lying on. Foolscap at
    // 0.30 x 0.40 and a paler stock is what makes it read; the count goes up because the
    // reference's litter is dense, not sparse.
    //
    // ⚠ ROUND 12 STILL PUT 130 SHEETS ON SCREEN THAT NOBODY COULD SEE, AND SIZE WAS NOT THE
    // REASON. `critic-estate-10` cropped tight at their own reported coordinates and found only
    // floor-reflection noise. `harness/_eo13_paper.mjs` measures the thing the count could not:
    // project each instance's four corners, average the pixels inside the quad, average a ring
    // just outside it, and take the difference. On the r12 build it read
    //
    //     median |dL| 6.6 of 255      36% of sheets at |dL| >= 10      15% at >= 16
    //
    // i.e. the typical sheet differed from the floor under it by 2.6% of the range. Swept live
    // in one boot (`--state`), the ranking of the available levers is not the one the brief
    // guessed:
    //
    //     base                       median |dL|  6.6    36% >= 10
    //     bigger sheets (x1.45)                   6.6    31%      <- NO HELP: a bigger sheet
    //                                                                straddles more tiles and
    //                                                                averages them together
    //     curled 40% out of plane                 8.7    42%
    //     paler stock                             8.9    47%
    //     curl + big + paler                     11.1    50%
    //     curl + big + WHITE                     13.0    57%
    //
    // VALUE is the lever and SIZE is not, which inverts the obvious reading of "it is too small
    // to see". The shipping combination below is curl + a larger foolscap + a near-white rag
    // stock, and it is deliberately short of pure white: 0xffffff is a 1.0-reflectance surface,
    // which no paper is, and this room's grade gate measures the frame's top decile.
    //
    // ⚠ AND ~40% OF THEM CANNOT BE MADE LEGIBLE FROM HERE. Half of this floor is WHITE marble
    // at the same value as paper, so a sheet lying on a white tile is camouflaged by the floor
    // material itself. That is not a defect of the litter, it is the composition difference
    // `critic-estate-10` named: `refs/bf1/bf1-ballroom-01.png` scatters its paper across DARK
    // WOOD PARQUET and every sheet in it reads. Stated rather than papered over.
    const paperMat = new THREE.MeshStandardMaterial({
      color: 0xfaf7ef, roughness: 0.94, metalness: 0.0,
    });
    // ⚠ CAM-GATED (`toggle-audit-1`, round 14), the second of the two reasons `?cam=r10` was not
    // a true reproduction: count 165 and curl 0.40/0.85 are the r13 paper overhaul, and neither
    // existed at r10 either — the ablation table above records r12's own shipped count as 130,
    // and curl is a mechanism this round introduced (r12's sheets lay flat). Reverted here to the
    // r12 numbers this file's own comments still carry; size, stock colour and cluster centres
    // are left as shipped because no pre-r13 record of them survives to revert TO (this project
    // keeps no VCS history) and guessing a number here would be exactly the "confident wrong
    // answer" this file warns against elsewhere.
    scene.add(paperScatter({
      count: CAM === 'r10' ? 130 : 165, w: 0.34, d: 0.45, material: paperMat, rng,
      curl: CAM === 'r10' ? 0 : 0.40, curlMax: CAM === 'r10' ? 0 : 0.85, scaleLo: 0.78, scaleHi: 1.32,
      // 9 mm of lift at the corners — see the note in `paperScatter`. Off under `?cam=r10`
      // with the rest of that camera's post-r12 dressing, so the historic frame is unchanged.
      dish: CAM === 'r10' ? 0 : 0.009,
      // Tighter discs than r12's 1.8-2.8 m: paper turned out of a case falls in DRIFTS, and a
      // drift spans a tile boundary, so it reads as one light mass even where an individual
      // sheet is a value match for the square under it. Two of the eight sit hard against a
      // case stack, which is where a drift comes from.
      clusters: [
        [-7.2, -4.0, 1.5], [-6.4, 0.2, 1.6], [-5.0, 3.4, 1.4],
        [-2.4, -1.4, 1.8], [1.2, -4.6, 1.4], [-3.6, 2.4, 1.2],
        [2.6, -2.0, 1.6], [-9.0, 2.6, 1.2], [-8.9, -3.6, 1.1], [-10.0, 1.4, 1.0],
      ],
    }));
    engine.onDispose?.(() => paperMat.dispose());
  }

  // ---- THERE IS NOTHING OUTSIDE THE WINDOWS, AND THE GLASS IS A LIGHTBOX (ROUND 17) ------
  //
  // `critic-eye-sweep`'s top remaining hate: "windows: still flat white planes behind a
  // diamond lattice. No exterior, no sky gradient, no glass depth." `_eye17_pick` on a window
  // pixel returns `kit:glass`, and that material is `stainedGlassMat({ emissive: 3.4 })` — an
  // OPAQUE plane with an emissive map. So the windows are not glazing at all, they are lamps
  // in the shape of windows, and nothing put behind them could ever have shown through.
  //
  // That was the right call while there was nothing out there: an emissive pane is the cheapest
  // way to say "bright day" and it costs no geometry. What it cannot say is WHERE, and the bar
  // (`refs/bf1/bf1-ballroom-01.png`) says where in every opening — courtyard facades, a
  // cornice, sky above them. A blown highlight with a building silhouetted in the bottom two
  // thirds reads as a window; a uniform white rectangle reads as a hole in the renderer.
  //
  // So both halves change together and neither works alone:
  //   · the glazing becomes GLAZING — the same bake, emissiveIntensity 3.4 -> 0.9 so the leading
  //     still blooms, plus transparency so the courtyard is behind it rather than instead of it;
  //   · a courtyard range opposite, its cornice at 6.0 m, on a ground plane, against a sky card.
  //
  // ⚠ NOTHING OUT HERE CASTS. The one shadow-casting light in this room stands at about
  // (-31, 11) and aims through the window wall, so every one of these meshes is between it and
  // the room — the facade's own top edge crosses the sun ray at y 6.27. A single `castShadow`
  // left true here would draw the courtyard's shadow across the ballroom floor and delete the
  // window patches that are the whole point of the lighting rig.
  //
  // ⚠ AND THE HEIGHTS ARE SOLVED, NOT PICKED. The eye must see sky in the TOP of the opening or
  // the courtyard just replaces one flat field with another. A ray from a standing player at
  // (4, 1.65) through the window head (-13, 5.4) is at y 7.83 by the time it reaches x -24, so a
  // range topping out at 6.0 leaves the upper third of every window showing sky. At the wall's
  // first position (x -22, top 9.0) the same ray was still inside masonry and every window went
  // grey.
  //
  // `?outside=0` ablates both halves back to the emissive lightbox.
  if (OUTSIDE) {
    const outside = new THREE.Group();
    outside.name = 'outside';
    const noShadow = (m) => { m.castShadow = false; m.receiveShadow = false; return m; };
    // The sky: unlit, so it is a value rather than a surface, and it sits behind the sun.
    // ⚠ THE SKY IS SET ABOVE 1.0 IN LINEAR, WHICH IS THE POINT. An sRGB white is 1.0 linear, and
    // 1.0 through this room's exposure and ACES lands around 232 — a pale grey card, dimmer than
    // the sun patches it is supposed to be casting. Daylight outside a dark interior is several
    // stops over the interior, so the sky is authored as an HDR value (`setRGB` writes the
    // working linear space directly) and lets the tonemapper roll it off the way it rolls off
    // the real sun. That is also what gives the glazing bars something to silhouette against.
    const skyMat = new THREE.MeshBasicMaterial();
    skyMat.color.setRGB(2.60, 2.66, 2.80);
    const sky = noShadow(new THREE.Mesh(new THREE.PlaneGeometry(110, 70), skyMat));
    sky.rotation.y = Math.PI / 2;                 // the plane's +z turned to face +x, into the room
    sky.position.set(-44, 16, 0);
    outside.add(sky);
    // The range opposite, and the yard between. Both take the room's own limestone, and both
    // face +x — i.e. AWAY from the sun, which travels +x — so they are lit by the shell alone
    // and read as a silhouette against the sky. That is the correct way round: a sunlit facade
    // out there would compete with the window patches on the floor.
    // ⚠ THE COURTYARD IS THREE MESHES, NOT THIRTY, AND THE BUDGET IS WHY. The first build
    // emitted the yard, the range, its cornice and 26 window recesses as separate meshes, and
    // `shoot.mjs --perf` came back at 314 draw calls against CRITIC_GUIDE's 300 for a
    // room-scale view — this piece's own numeric gate, blown by set dressing nobody can even
    // walk up to. Everything sharing a material is merged: the masonry into one, the recesses
    // into one. Same picture, 27 fewer calls.
    /**
     * ---- ROUND 18: THE COURTYARD IS OUTDOORS AND WAS BEING LIT AS IF IT WERE INDOORS -------
     *
     * 🚨 **ROUND 17 ADDED THIS COURTYARD TO FIX "WINDOWS ARE FLAT WHITE PLANES" AND IT COST THE
     * WINDOWS 2.2 STOPS.** Nobody measured them before and after. Same rect on the same
     * `overlook` frame, one boot each:
     *
     *     window glass                      rgb                 L
     *     refs/bf1/bf1-ballroom-01     212.4, 196.3, 181.9    198.7
     *     ?outside=0 (the old lightbox) 161.0, 161.1, 162.7    161.2
     *     ?outside=1 (r17, shipped)      75.1,  71.4,  70.0     72.1
     *
     * The bar's windows are the brightest thing in its frame — they are what says the room is
     * lit by daylight at all. This room's were a third of that, and zoomed in they read as
     * frosted decorative glass: a flat blue-grey wash with the quarry leading drawn across
     * every pane, where the bar's leading is invisible because the daylight behind it blows
     * through. That is a bigger tell in a blind pair than the floor pattern.
     *
     * ⚠ THE CAUSE IS ONE LINE AND IT IS THIS ONE. The range was cut from the room's own stone
     * and therefore lit by `scene.environment` — a shell authored for the INSIDE of a shut-up
     * ballroom, deliberately dropped to 1.70 in round 12 so the sun patches could read at all.
     * A wall standing in an open courtyard is not lit by that. It is lit by the whole sky
     * hemisphere, which is several stops over any interior, and the file already knows this:
     * the sky card three blocks up is authored at linear 2.60-2.80 precisely because *"an sRGB
     * white is 1.0 linear, and 1.0 through this room's exposure and ACES lands around 232 — a
     * pale grey card, dimmer than the sun patches it is supposed to be casting."* The range got
     * the argument's conclusion applied to the sky and not to the building in front of it.
     *
     * ⚠ SO IT IS AN EMISSIVE TERM ON THE SAME BAKE, NOT A NEW MATERIAL AND NOT A LIGHT. Reusing
     * the stone's own map as an `emissiveMap` keeps every bit of the facade's texture — which
     * is the whole reason it is stone and not a grey box — and adds a controllable skylight
     * term on top of the lit result. A light out here would need `castShadow` reasoning against
     * the note above (nothing out here casts, or the courtyard's shadow lands on the ballroom
     * floor and deletes the window patches); an emissive needs none.
     *
     * ⚠ AND IT DOES NOT MAKE THE FACADE SUNLIT, WHICH THE NOTE ABOVE RULES OUT FOR A GOOD
     * REASON. The range still faces +x, away from the sun, and still has no directional
     * modelling on it; it is a silhouette that is now a DAYLIT silhouette rather than an
     * interior-lit one. What competes with the floor patches is a sunlit facade with its own
     * highlights, not a bright even one.
     *
     * `?yard=N` is the ablation; 0 is round 17's behaviour exactly.
     */
    const YARD = qs.has('yard') ? Math.max(0, Math.min(16, Number(qs.get('yard')) || 0)) : 2.5;
    const outMat = YARD > 0 ? stoneDusty.clone() : stoneDusty;
    if (YARD > 0) {
      // ⚠ WARM, BECAUSE THE BAR'S COURTYARD IS SUNLIT AND THE NOTE ABOVE IS WRONG ABOUT THAT.
      // That note rules out a sunlit facade on the grounds it "would compete with the window
      // patches on the floor" — and the reference has one: through its arched window is a pale
      // WARM facade with its own openings, at L 198.7 and r-b 30.5, i.e. (r-b)/L 0.154, while
      // its floor patches still read at L 217.7. Both can be true because the facade is
      // brighter but FLAT and the floor patches are shaped; what competes with a floor patch is
      // another shaped highlight, not an even field.
      outMat.emissive = new THREE.Color(0xfff0e2);
      outMat.emissiveMap = outMat.map;
      outMat.emissiveIntensity = YARD;
      outMat.name = 'ballroom-courtyard-stone';
      outMat.needsUpdate = true;
      engine.onDispose?.(() => outMat.dispose());
    }
    const stoneParts = [];
    const addStone = (g, x, y, z) => {
      g.applyMatrix4(new THREE.Matrix4().makeTranslation(x, y, z));
      stoneParts.push(g);
    };
    addStone(new THREE.BoxGeometry(15, 0.4, 48), -20.5, -0.2, 0);
    // ⚠ TOP AT 5.0 AND SET BACK TO -26, NOT 6.0 AT -24. The first build put the range's cornice
    // above every sight line a player has through these windows and the openings came back
    // grey — one flat field swapped for another, which is the failure this whole item is about.
    // Further back and lower, the same building occupies the bottom half of each opening and
    // leaves the top half sky, which is the bar's own proportion.
    addStone(new THREE.BoxGeometry(0.9, 5.0, 48), -26, 2.5, 0);
    addStone(new THREE.BoxGeometry(1.5, 0.55, 48), -25.8, 5.2, 0);
    // ---- ROOFLINE AND A SECOND RANGE BEHIND IT (round 17, sixth pass) ----------------------
    //
    // `critic-eye-sweep` kept the courtyard on the board after it started working: "one range
    // and a sky — no roofline variation, no depth behind the first building. It does its job at
    // eye.win but reads as a flat once you look at it." Both halves of that are one-line facts
    // about what was built, so both get built.
    //
    // A ROOFLINE, because a real range is not one extrusion: three bays step up out of it at
    // different heights and one carries a stack. And a SECOND RANGE seven metres further back
    // and two metres taller, so the gap between the two is a piece of sky with a building on
    // each side of it — which is the only cue out there that says "distance" rather than
    // "backdrop". The sky card moves from -34 to -44 to stay behind both.
    //
    // Everything here is in the same merged bucket as the first range, so the whole courtyard
    // is still ONE draw call — see the merge note above, which exists because the first version
    // of this blew the view's own 300-call budget with 26 separate window recesses.
    for (const [bz, bh, bw] of [[-14.5, 1.5, 6.0], [2.0, 2.3, 7.5], [15.5, 1.1, 5.0]]) {
      addStone(new THREE.BoxGeometry(1.1, bh, bw), -26, 5.0 + bh / 2, bz);
    }
    addStone(new THREE.BoxGeometry(0.8, 2.2, 0.8), -26, 8.4, 3.4);          // a stack
    addStone(new THREE.BoxGeometry(1.0, 7.0, 44), -33, 3.5, 4.0);           // the second range
    addStone(new THREE.BoxGeometry(1.6, 0.5, 44), -32.8, 7.2, 4.0);
    {
      const merged = mergeGeometries(stoneParts, false);
      for (const g of stoneParts) g.dispose();
      if (merged) {
        merged.computeBoundingSphere();
        const m = noShadow(new THREE.Mesh(merged, outMat));
        m.name = 'outside-stone';
        outside.add(m);
      }
    }
    // Its own windows, as dark recesses. Two storeys, so the range reads as a building with a
    // floor height rather than as a wall — which is also the only cue out there that gives the
    // ballroom's own 9.6 m something to be measured against.
    /**
     * ⚠ **THE RECESSES ARE OUTDOORS TOO, AND AT 0x0b0d11 THEY WERE VOID** (round 18). Once the
     * facade in front of them is lit as daylight rather than as interior (see `?yard=` above),
     * a near-black recess is a two-hundred-to-two contrast and reads as a rectangle punched
     * through the picture rather than as a window. The bar's courtyard has its own openings and
     * they are dark GREY-BLUE, not holes: a recess on a sunlit wall still sees the whole sky
     * hemisphere and half the yard's bounce.
     *
     * They take the same emissive treatment as the facade at a small fraction of it, for the
     * same reason and by the same mechanism, so the two move together if either is ever
     * re-solved.
     */
    const holeMat = new THREE.MeshStandardMaterial({ color: 0x2b3038, roughness: 0.9, metalness: 0 });
    if (YARD > 0) {
      holeMat.emissive = new THREE.Color(0x2b3038);
      holeMat.emissiveIntensity = YARD * 0.16;
    }
    engine.onDispose?.(() => holeMat.dispose());
    {
      const holes = [];
      for (let i = -6; i <= 6; i++) {
        for (const hy of [1.6, 3.8]) {
          const g = new THREE.BoxGeometry(0.35, 1.7, 1.15);
          g.applyMatrix4(new THREE.Matrix4().makeTranslation(-25.6, hy, i * 3.6));
          holes.push(g);
        }
      }
      // the second range's own windows, on a different rhythm and a different storey height so
      // the two buildings do not read as one wall drawn twice
      for (let i = -5; i <= 5; i++) {
        for (const hy of [2.2, 5.0]) {
          const g = new THREE.BoxGeometry(0.35, 1.5, 1.0);
          g.applyMatrix4(new THREE.Matrix4().makeTranslation(-32.6, hy, 4.0 + i * 4.3));
          holes.push(g);
        }
      }
      const merged = mergeGeometries(holes, false);
      for (const g of holes) g.dispose();
      if (merged) {
        merged.computeBoundingSphere();
        const m = noShadow(new THREE.Mesh(merged, holeMat));
        m.name = 'outside-windows';
        outside.add(m);
      }
    }
    scene.add(outside);
    engine.outside = outside;
  }

  // ---- GRIME, AND IT HAS TO OBEY THE GEOMETRY (round 17, third pass) ----------------------
  //
  // `CRITIC_GUIDE.md` lists this FIRST among the usual failures — "grime must collect in
  // corners, along the floor line, in mouldings, under sills" — and after the ladder match the
  // critic's own top complaint is that this room is too clean for a house being emptied. Every
  // surface in it is as clean at the skirting as it is at eye height, and the corners are the
  // same tone as the middle of the wall.
  //
  // ⚠ A MULTIPLY BAND, NOT AN ADDITIVE ONE, AND THIS FILE HAS ALREADY PAID TO LEARN WHY. The
  // light pools a few hundred lines up were additive until round 3, and an additive decal over
  // a black-and-white chequer lifts the black tiles as hard as the white ones, so the pattern
  // dissolves inside the decal and its own rectangle becomes the seam. Dirt has exactly the
  // same job in reverse: it must SCALE what is under it, so a gilt moulding under grime stays
  // gilt and a pale wall stays pale, both a stop down. Same blend factors as POOL_MUL_FRAG, and
  // the same rule that the factor is exactly 1.0 at the band's outer edge or the quad shows.
  //
  // Three frequencies, because one is a gradient and a gradient is not dirt: the vertical rise
  // from the floor, a slow horizontal wander so no two metres of skirting are alike, and a
  // corner term that doubles it in the last metre of each run — which is the specific thing the
  // guide asks for and the thing a viewer reads as "nobody has swept in here".
  //
  // `?grime=0` ablates it.
  if (GRIME > 0) {
    // The shader and the quad live in `world/patina.js` now — the playable ballroom uses the
    // same dirt, and a copy in each file is two copies to keep in step. Everything about how
    // it is SHAPED is documented there; what stays here is where this room puts it.
    const band = (w, h, tint, strength, flip = 0, corner = 1.15, macro = 0) => grimeBand({
      w, h, tint, strength: strength * GRIME, flip, corner, macro: macro * GRIME,
    });
    const grimes = [];
    // A cool, slightly green-grey soot rather than a brown: this room's own bounce is warm, and
    // dirt tinted the same way as the light reads as a lighting change instead of as dirt.
    const SOOT = 0x8e9088;
    // 1.15, not 1.55: the first pass put the band's top edge across the middle of the raised
    // panels, and a dirt gradient that ends halfway up a panel reads as a lighting change. Kept
    // below the dado so its own falloff is hidden by an architectural line.
    const BAND_H = 1.15;
    const place = (mesh, x, z, rotY) => {
      mesh.position.set(x, BAND_H / 2, z);
      mesh.rotation.y = rotY;
      mesh.renderOrder = 8;          // under the light pools (9/10), over the opaques
      mesh.name = 'grime';
      scene.add(mesh);
      grimes.push(mesh);
    };
    place(band(R.z1 - R.z0, BAND_H, SOOT, 0.52), R.x0 + 0.05, 0, Math.PI / 2);   // window wall
    place(band(R.z1 - R.z0, BAND_H, SOOT, 0.52), R.x1 - 0.05, 0, -Math.PI / 2);  // mirror wall
    place(band(R.x1 - R.x0, BAND_H, SOOT, 0.46), 0, R.z0 + 0.05, 0);             // arched end
    place(band(R.x1 - R.x0, BAND_H, SOOT, 0.46), 0, R.z1 - 0.05, Math.PI);       // near wall

    // ---- and the PATINA, full height, on all four ----------------------------------------
    // Same shader, band falloff switched off (`strength` 0), carrying only the macro term. Four
    // more quads, and they are what puts a middle detail frequency on 700 square metres of
    // wall — see the note in the fragment shader for why that is the thing a blind pair was
    // still turning on.
    const PATINA_H = R.h - 0.2;
    const patina = (w, x, z, rotY) => {
      const m = band(w, PATINA_H, SOOT, 0.0, 0, 0.0, 0.24);
      m.position.set(x, PATINA_H / 2 + 0.1, z);
      m.rotation.y = rotY;
      m.renderOrder = 7;
      m.name = 'grime';
      scene.add(m);
      grimes.push(m);
    };
    // ---- AND THE FLOOR, WHICH IS THE LARGEST SURFACE IN EVERY FRAME (round 17, seventh pass)
    //
    // The wall patina closed the "only one detail frequency" complaint on the WALLS and the
    // critic immediately re-filed the same failure one surface along: the reference carries
    // metre-scale history on its FLOOR too — puddled tonal variation, areas that were mopped
    // and areas that were not — and this floor was perfectly even everywhere the light was.
    // It is the same shader laid flat, and on 21 x 11 m it is the single biggest thing left
    // that a blind pair was turning on.
    //
    // ⚠ renderOrder 6, BELOW THE WALL PATINA (7) AND THE POOLS (9/10). It multiplies the floor
    // AND the planar reflection in it, which is correct — a stain on a polished floor dims what
    // the floor is reflecting, it does not sit on top of the reflection like a decal.
    //
    // ⚠ AND `scale` IS LARGER HERE THAN ON THE WALLS. 3.2 m cells across a 21 m floor seen at a
    // grazing angle come out as a fine mottle that reads as noise; a floor's staining is a few
    // big areas, not many small ones.
    {
      /**
       * ⚠ `?floorstain=N`, AND 0.20 -> 0.58 IS THE OTHER HALF OF THE FLOOR FINDING. Cutting the
       * fine pattern (`?floorpat`) alone takes this floor's whole contrast ladder DOWN, and the
       * bar's ladder does not want to come down — it wants to TILT. Measured shade-only at
       * matched luminance, the bar climbs 3.5 / 7.3 / 12.1 / 19.0 across 4 / 10 / 24 / 48 px
       * windows, so it has less than half this floor's fine contrast and more than its large.
       * Two knobs, opposite directions; one of them alone just makes a flatter floor.
       *
       * This is the same "one detail frequency" complaint the walls got in round 17 and the
       * ceiling got earlier in this one, arriving on the floor from the other side: the floor
       * had the FINE frequency and was missing the coarse one.
       */
      const FSTAIN = qs.has('floorstain')
        ? Math.max(0, Math.min(1, Number(qs.get('floorstain')) || 0)) : 0.20;
      const fp = band((R.x1 - R.x0) + 2, (R.z1 - R.z0) + 2, SOOT, 0.0, 0, 0.0, FSTAIN);
      fp.material.uniforms.uMacroScale.value.set(((R.x1 - R.x0) + 2) / 6.5, ((R.z1 - R.z0) + 2) / 6.5);
      fp.rotation.x = -Math.PI / 2;
      fp.position.set(0, 0.02, 0);
      fp.renderOrder = 6;
      fp.name = 'grime';
      scene.add(fp);
      grimes.push(fp);
    }
    patina(R.z1 - R.z0, R.x0 + 0.06, 0, Math.PI / 2);
    patina(R.z1 - R.z0, R.x1 - 0.06, 0, -Math.PI / 2);
    patina(R.x1 - R.x0, 0, R.z0 + 0.06, 0);
    patina(R.x1 - R.x0, 0, R.z1 - 0.06, Math.PI);
    // ---- and under the window sills, which is the next place the guide names --------------
    // The sill is a 26 m long horizontal ledge with five openings' worth of weather coming over
    // it, and it was the cleanest line in the room. `uFlip` runs the same falloff downward from
    // the top of the band; `uCorner` is dialled right down because a sill's dirt concentrates
    // under the openings rather than at the ends of the run.
    for (const wz of winZ) {
      const sill = band(WIN.w + 0.7, 0.62, SOOT, 0.44, 1, 0.15);
      sill.position.set(R.x0 + 0.07, WIN.sill - 0.31, wz);
      sill.rotation.y = Math.PI / 2;
      sill.renderOrder = 8;
      sill.name = 'grime';
      scene.add(sill);
      grimes.push(sill);
    }
    // ---- AND THE CEILING, WHICH `eye.up` IS THE ANGLE THAT ASKS FOR (round 18, eighth pass)
    //
    // The seventeen-angle sweep is the only reason this is here. `eye.up` — head back, which is
    // where a player's eye goes in a double-height room — is a frame that is about half coffer
    // soffit, and that soffit was the last large surface in the house with NO history on it at
    // all: twenty-eight panels of identical clean plaster under a roof that has been leaking
    // into a shut-up house for a decade. The walls got their patina in round 17 and the floor
    // got it seven passes ago in this one; the critic re-filed the same complaint one surface
    // along each time, and this is the last of the three.
    //
    // ⚠ IT SITS JUST UNDER THE SOFFIT FACE AND LETS THE BEAMS OCCLUDE IT, WHICH IS WHY IT IS
    // ONE QUAD AND NOT TWENTY-EIGHT. `cofferedCeiling` puts a flat soffit box at `y + 0.02`
    // 0.05 thick and drops the beams 0.34 BELOW it. A quad a couple of centimetres under the
    // soffit face is therefore above every beam's underside, so looking up from the floor the
    // depth test hits a beam first wherever there is a beam and the quad only wherever there is
    // a panel. One draw call, correctly cut into the coffer wells by geometry that is already
    // there.
    //
    // ⚠ `macro` IS HIGHER AND `scale` COARSER THAN ANYWHERE ELSE IN THE ROOM. Ceiling staining
    // is not the even settled film the walls carry — it is a few large water-borne blooms
    // spreading from wherever the roof let go, so this wants a small number of big soft areas.
    // The band falloff terms are off (`strength` 0, `corner` 0): a ceiling has no bottom edge
    // for dirt to run down to, and leaving the corner term in would have drawn a dark border
    // round the whole ceiling, which is a decal tell rather than a stain.
    {
      const C = PLAN.ceiling ?? { y: 9.6, inset: 2.3 };
      const cw = (R.x1 - R.x0) - (C.inset ?? 2.3);
      const cd = (R.z1 - R.z0) - (C.inset ?? 2.3);
      // ⚠ 0.60 AND 4.5 m CELLS, NOT 0.30 AND 7.5. The first pass took the floor's numbers
      // straight up here and they do not survive the move: 7.5 m cells across an 18 x 9 m
      // soffit is two and a half macro cells by one, which is not a few big stains, it is ONE
      // low-frequency wash — the median moved 101.3 -> 96.5 and the picture was unchanged
      // because a uniform 5% darkening of a uniform surface is still a uniform surface. The
      // number that matters on this surface is how many DISTINCT areas it resolves into, and
      // four by two is the fewest that still reads as damage rather than as exposure.
      const cp = band(cw, cd, SOOT, 0.0, 0, 0.0, 0.60);
      cp.material.uniforms.uMacroScale.value.set(cw / 4.5, cd / 4.5);
      cp.rotation.x = Math.PI / 2;
      cp.position.set(0, (C.y ?? 9.6) - 0.02, 0);
      cp.renderOrder = 6;
      cp.name = 'grime';
      scene.add(cp);
      grimes.push(cp);
    }
    engine.onDispose?.(() => grimes.forEach((m) => { m.geometry.dispose(); m.material.dispose(); }));
    engine.grime = grimes;
  }

  // ---- chandeliers -------------------------------------------------------
  const chandeliers = [];
  const chSpec = [
    { z: 0, arms: 10, tiers: 2, r: 1.25, chain: 1.5, i: 15 },
    { z: -5.0, arms: 8, tiers: 2, r: 1.05, chain: 1.5, i: 11 },
    { z: 5.0, arms: 8, tiers: 2, r: 1.05, chain: 1.5, i: 11 },
  ];
  for (const c of chSpec) {
    const ch = buildChandelier({
      // PERF, and it is the single biggest item in this room. The default build keeps every
      // arm and hoop addressable for `detach()`; three fixtures cost 222 meshes of a 463-mesh
      // scene that was submitting 1150 draw calls against a 625 budget. Nothing in a showcase
      // frame detaches an arm, and `cut()` — the one break this room would ever stage — is
      // unaffected. Same geometry, same look, ~12 meshes per fixture instead of ~74.
      merge: true,
      arms: c.arms, tiers: c.tiers, radius: c.r, chain: c.chain,
      brass: mats.brass, crystal: mats.crystal,
      intensity: c.i, distance: 17, caustic: 0.22, causticSize: c.r * 9, rng,
    });
    ch.root.position.set(-1.2, R.h - 0.36, c.z);
    // ---- THE THREE ORNAMENTAL FIXTURES DO NOT CAST -------------------------
    // Measured with `node harness/_calls_tmp.mjs --view room.ballroom --list`: this room
    // submits 992k triangles a frame against a 900k budget, and the per-mesh table says the
    // largest single group is the chandeliers' brass at 27.5k EACH. `renderer.info` counts
    // submissions, not unique geometry — the one shadow-casting spot and the AO depth prepass
    // each re-traverse the scene — so a caster costs its triangles about three times.
    //
    // These three hang at 9.2 m, and the only shadow caster in the room is a spot OUTSIDE the
    // window wall raking down onto the chequer. A chandelier shadow thrown by that light lands
    // as a faint smear no viewer can attribute to the object that made it, so it is 120k
    // triangles a frame for a read nobody gets. `prop.chandelier` — where the fixture IS the
    // subject and its shadow is part of the shot — is untouched.
    ch.root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    scene.add(ch.root);
    chandeliers.push(ch);
  }
  engine.chandeliers = chandeliers;
  engine.onUpdate((dt, t) => { for (let i = 0; i < chandeliers.length; i++) chandeliers[i].update(t + i * 1.3); });

  // ---- practicals: sconces on every pier, candelabra on the floor --------
  // `merge: true` throughout — nine sconces and two candelabra were 183 meshes of pure
  // ornament. Flames and cores stay separate because they scale every frame.
  // Same reasoning as the chandeliers above, and the same measurement: nine sconces and two
  // candelabra are 11k triangles of pure ornament, submitted three times a frame, to cast
  // shadows from a light that is outside the building and aimed at the floor. None of them is
  // between that spot and anything.
  const noCast = (o) => { o.traverse((n) => { if (n.isMesh) n.castShadow = false; }); return o; };
  /**
   * ---- ROUND 18: THE ORNAMENT MERGES ACROSS ALL NINE SCONCES, NOT JUST WITHIN EACH ---------
   *
   * 🚨 **THE 300-CALL BUDGET WAS ONLY EVER CHECKED AT `overlook`, AND FOUR PLAYER ANGLES BREACH
   * IT.** `eye.corner.sw` 309, `eye.corner.se` and `eye.back` 308, `eye.gallery` 307, against
   * `overlook`'s 298 — a gate measured at the one camera that passes it is not a gate. A corner
   * cam sees down BOTH long walls at once, so it holds every sconce on both of them in frame
   * where `overlook` culls some of each.
   *
   * `sconce({ merge: true })` already merges each fitting's own ornament down to one brass mesh
   * and one wax mesh — that note is below and it stands. What it cannot do is merge ACROSS
   * fittings, because it is handed one position at a time. Nine of them is eighteen draw calls
   * of ornament that never moves, so this takes them to two.
   *
   * ⚠ AND THE WAX MATERIAL HAD TO BE HOISTED FOR IT. `practicals.js` falls back to
   * `new THREE.MeshStandardMaterial(...)` per call when `waxMat` is absent, so the nine sconces
   * carried nine identical-but-distinct wax materials — which merge cannot combine, and which
   * were nine separate program lookups in their own right. One shared material, passed in.
   *
   * ⚠ THE FLAMES AND THE POINT LIGHTS STAY PER-SCONCE and are not touched here: the flames are
   * rescaled every frame by `driveFlicker` and a merged flame would flicker as one object,
   * which is the tell this room's practicals exist to avoid.
   */
  const sconceWax = new THREE.MeshStandardMaterial({
    color: 0xe8dcc0, roughness: 0.62, metalness: 0, name: 'ballroom-sconce-wax',
  });
  engine.onDispose?.(() => sconceWax.dispose());
  const sconceGroups = [];
  for (const wz of winZ) {
    // ⚠ ROUND 17: glowStrength 1.5 -> 0.55 AND glowSize 4.0 -> 2.6. These were 5x and 2.35x
    // `sconce`'s own defaults (0.30 / 1.7), i.e. nine two-and-a-half-metre orange halos on the
    // window wall, and they are the reason the room cannot afford a warm daylight. `grade.mjs`
    // fails a top-decile (r-b)/L over 0.2 and targets 0.14; the sun's own re-tint had already
    // spent the frame up to 0.125, and the diagnosis that stopped it is in the LIGHTS note —
    // the reference reads 0.089 top-decile WHILE carrying chroma 36-49 on its floor, so what
    // eats this room's budget is not its daylight but its own practicals. A halo is also the
    // cheapest thing in the frame to disbelieve: it is a flat radial sprite, and at 4 m across
    // it is unmissable as one.
    const sc = sconce({ merge: true, brass: mats.brass, waxMat: sconceWax, intensity: 3.0, distance: 6.5, phase: wz, glowStrength: 0.55, glowSize: 2.6, glowColor: 0xffb877 });
    sc.position.set(R.x0 + 0.30, 2.35, wz + WIN.w / 2 + 1.35);
    sc.rotation.y = Math.PI / 2;
    scene.add(noCast(sc));
    sconceGroups.push(sc);
  }
  for (const pz of [-5.4, -1.2, 3.0, 6.6]) {
    const sc = sconce({ merge: true, brass: mats.brass, waxMat: sconceWax, intensity: 2.8, distance: 6.5, phase: pz, glowStrength: 0.55, glowSize: 2.6, glowColor: 0xffb877 });
    sc.position.set(R.x1 - 0.30, 2.45, pz);
    sc.rotation.y = -Math.PI / 2;
    scene.add(noCast(sc));
    sconceGroups.push(sc);
  }
  // ⚠ AFTER BOTH LOOPS AND AFTER `scene.add`, because the merge bakes each part's WORLD matrix
  // and a group that has not been added and updated does not have one yet.
  scene.updateMatrixWorld(true);
  //
  // ⚠ THE GLOW DECALS MERGE TOO, AND THEY ARE WHY THIS CLEARS THE BUDGET RATHER THAN SITTING
  // ONE OVER IT. Merging the ornament alone took `eye.corner.sw` 309 -> 301: sixteen meshes
  // saved but only eight calls, because half of them were never in the shadow pass and the two
  // merged meshes are new calls of their own. The nine wall glows are the rest — and unlike the
  // ornament they are trivially mergeable, because every one of the nine is created with the
  // SAME four arguments (0xffb877, strength 0.55, size 2.6, pow 2.6), so the first one's
  // material is correct for all of them. `glowPatch` builds a ShaderMaterial per call, so this
  // also drops eight identical materials.
  //
  // ⚠ `renderOrder` AND THE ADDITIVE BLEND COME FROM THE MATERIAL AND THE MESH SEPARATELY, so
  // the merged mesh has to be told the renderOrder again — a merged additive decal at the
  // default 0 sorts before the room and adds its glow to whatever the depth buffer had at the
  // time, which is nothing.
  const mergeAcross = (partName, forcedMat) => {
    const geos = [];
    let mat = forcedMat, order = 0;
    for (const g of sconceGroups) {
      const m = g.getObjectByName(partName);
      if (!m) continue;
      if (!mat) { mat = m.material; order = m.renderOrder; }
      else if (m.material !== mat) m.material.dispose?.();
      geos.push(m.geometry.clone().applyMatrix4(m.matrixWorld));
      m.removeFromParent();
      m.geometry.dispose();
    }
    if (!geos.length) return;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!merged) return;
    merged.computeBoundingSphere();
    const one = new THREE.Mesh(merged, mat);
    one.name = `${partName}.merged`;
    one.castShadow = false;
    one.receiveShadow = forcedMat != null;
    one.renderOrder = order;
    scene.add(one);
    engine.onDispose?.(() => merged.dispose());
  };
  mergeAcross('sconce-brass', mats.brass);
  mergeAcross('sconce-wax', sconceWax);
  mergeAcross('glow', null);
  for (const [cx, cz] of [[-3.4, -6.2], [3.4, -6.2]]) {
    const cd = candelabra({ merge: true, brass: mats.brass, h: 1.55, arms: 6, intensity: 0.55, distance: 5.0, lights: 1, phase: cx });
    cd.position.set(cx, 1.35, cz);
    scene.add(noCast(cd));
  }

  // ---- daylight: ONE spot outside the window wall ------------------------
  //
  // ⚠ THE FILE HEADER'S CLAIM 3 — "THE WINDOWS DO THE LIGHTING" — WAS AN AMBITION, NOT A
  // DESCRIPTION, AND ROUND 12 MAKES IT TRUE. At intensity 300 against an environment shell of
  // 3.2 this spot moved the floor by 3.1% (measured by turning it off), so the "six hard-edged
  // patches of daylight marching down the chequer" were a few percent of modulation on a flat
  // IBL wash. It is paid for out of the shell rather than added on top: environmentIntensity
  // comes down 3.2 -> 1.70 in the same change.
  //
  // The number is not free-chosen. Swept live over four floor rects with the grade re-solved on
  // the same boot: below about 16x the patches do not separate from the field, and past about
  // 3.6x THIS value the extra buys nothing measurable (macro on the lit floor 0.6159 at 3.6x
  // against 0.6159 at 5.5x — the patches have already saturated) while the mullion grid inside
  // them washes out, and that grid is the one thing the reference's patches unmistakably have.
  //
  // ⚠ AND THE SUN IS RAKED LOWER, WHICH IS A COMPOSITION CHANGE RATHER THAN A LEVEL ONE.
  // At the old (0.865, -0.44, 0.24) the elevation is 26.1 deg, so a ray entering at window
  // height y lands only Dx = 1.966y further into the room: every floor patch died between
  // x -10.9 and x -2.4, i.e. entirely in the LEFT THIRD of a frame that is 26 m wide. The
  // right two thirds of the chequer could not receive daylight at any intensity, which is why
  // "more sun" alone reads as "somebody turned the left wall up". At 21.6 deg the same rays
  // reach Dx = 2.36y, so the bands run x -10.5 -> -0.25 and cross the middle of the picture.
  // A long raking bar of light is also what the reference actually has.
  const dir = new THREE.Vector3(...LIGHTS.dir).normalize();
  const winMid = new THREE.Vector3(R.x0, WIN.sill + WIN.h * 0.5, winZ[2]);
  // ⚠ THE CONE HAS TO COVER THE WINDOW WALL, NOT THE FLOOR PATCH. Aim and angle are solved
  // rather than nudged: the axis crosses the glazing plane x = -13 at (-13, 3.5, -2.3), the
  // openings span z -6.4..6.2 and y 1.05..5.4, so the furthest opening corner is 8.5 m off the
  // axis at 20.6 m — atan(8.5/20.6) = 0.39 rad. At 0.34 the two end windows sat in the spot's
  // own penumbra and threw grey patches, which reads as a soft shadow map and is nothing of
  // the kind. 0.42 with the axis aimed at the CENTRE OF THE THREE FLOOR BANDS (-4.7, 0, 0.2).
  // `?daylight=flat` restores the old aim, which was the point where the MIDDLE window's ray
  // met the floor.
  const sunAim = LIGHTS.aim
    ? new THREE.Vector3(...LIGHTS.aim)
    : (() => {
      const t = (0.02 - winMid.y) / dir.y;
      const h = winMid.clone().addScaledVector(dir, t);
      return new THREE.Vector3(h.x, 0, h.z);
    })();
  const sunFrom = LIGHTS.aim
    ? sunAim.clone().addScaledVector(dir, -30)
    : winMid.clone().addScaledVector(dir, -22);
  const sun = spotKey({
    // ---- ROUND 17: 0xd6e4ff -> 0xffeeda, AND IT IS THE BAR THAT SAYS SO --------------------
    //
    // This key has always been north-sky blue, and paired with warm practicals that is a
    // defensible scheme — it is the one the rig's own "THE COOL SIDE" note argues for. What it
    // is not is what the piece is judged against. Measured on the sun patches themselves
    // (`harness/_eye17_rect.mjs`, three rects on the bar's floor, two on ours):
    //
    //     sun patch on the floor          rgb                    L      chroma
    //     refs/bf1                       198.7, 186.1, 162.9   187.1     35.9
    //     refs/bf1                       181.9, 164.6, 133.1   166.0     48.8
    //     this room, before              163.4, 160.3, 166.0   161.4      5.7
    //
    // The bar's daylight runs R > G > B every time; ours was neutral, and in the half-lit
    // margins it went B-highest. That is skylight where the reference has SUN, and it is a
    // colour tell in eight of the nine player angles because the patches are the brightest
    // thing on the floor in all of them.
    //
    // ⚠ THE COLOUR IS IN `LIGHTS` SO `?daylight=flat` KEEPS 0xd6e4ff. That ablation holds
    // round 12's pre-rebalance state and is the only reachable copy of it; re-tinting its key
    // would quietly make it an ablation of something else.
    //
    // ⚠ AND IT IS 0xffe3c2 RATHER THAN A FULL SUNLIGHT AMBER, because the grade gate is the
    // constraint. Swept at the overlook, reading the patch and the gate together:
    //
    //     key        patch rgb                 patch chroma   top-decile (r-b)/L
    //     0xd6e4ff   163.4, 160.3, 166.0            5.7            0.073
    //     0xffeeda   171.2, 162.7, 161.9            9.3            0.106
    //     0xffe3c2   171.4, 160.9, 157.7           13.7            0.125
    //     0xffdcb0   171.6, 159.7, 154.1           17.5            0.135   at the target
    //     0xffe7c8   (trimmed for margin after the exposure lift)
    //     0xffc87e   163.6, 146.2, 127.7           35.8            0.071   SHIPPED
    //
    // 🚨 THE PARAGRAPHS BELOW WERE WRONG AND ARE KEPT AS A RECORD OF HOW. They conclude twice,
    // over two passes, that the daylight cannot be warmed any further because the gate's
    // top-decile chroma is spent by this room's GILDING — "a separate round's problem", "the
    // honest ceiling on this knob". It was never the gilding. Both horizontal bounce fills ran
    // almost purely along +/-x, the same axis the sun rakes along, so the warm fill and the sun
    // were loading the SAME surfaces into the same decile. Re-aiming the fills to cover the two
    // end walls (see the bounceFill note further down, which is what that change was actually
    // for) separated them, and the gate fell from 0.128 to 0.029 with nothing else touched.
    // That left room to take the key from 0xffe7c8 to 0xffc87e, and the sun patches now measure
    // chroma 35.8 against the bar's own 35.9 — matched, from 5.7 when this round opened.
    //
    // The lesson is worth more than the number: a gate reading is a property of the whole
    // frame, and "this knob is at its ceiling" is only true given everything else. Twice this
    // round a ceiling turned out to be another light standing in the wrong place.
    //
    // ⚠ RE-TRIMMED IN THE SECOND PASS. The numbers above were solved at exposure 1.28; taking
    // the room onto the bar's ladder at 1.45 pushed more warm content into the top decile and
    // 0xffe0b8 arrived at 0.134 against a 0.14 target — passing, but inside the instrument's
    // own noise. 0xffe7c8 restores the margin and keeps the R > G > B order that was the point.
    //
    // The patches now run R > G > B like the bar's. It stops here because 0.14 is the gate's
    // TARGET — and the interesting part is WHY, because it is not the sun. The bar's own ladder
    // reads 0.089 top-decile while its floor patches carry chroma 36-49; ours reads 0.13 while
    // ours carry 17.5. The difference is what ELSE is in each frame's top decile: this room's
    // gilding and its practical flames are up there and the reference has neither.
    //
    // ⚠ THE SCONCE HALOS WERE TRIED AS THE CULPRIT AND ARE NOT IT — worth recording so nobody
    // spends the round again. They were running at 5x `sconce`'s own default strength and 2.35x
    // its size (nine 4 m orange sprites on the window wall); bringing them to 0.55 / 2.6 with a
    // cooler tint is a real improvement to the frame in its own right, but it moved the gate
    // only 0.125 -> 0.119. The conclusion drawn from that at the time — that what remained was
    // the GILDING, and that this was therefore the ceiling — was wrong, and the correction is
    // at the head of this block. The right answer was the direction of the bounce fills.
    color: LIGHTS.sunColor, intensity: LIGHTS.sun,
    position: sunFrom.toArray(),
    target: sunAim.toArray(),
    // 2048, not 1024. The room now has ten stacks of packing cases standing in the light and
    // their shadows are the macro variation this round is for; at 1024 over a 48-degree cone
    // a case edge is 1.8 cm of texel and the shadow arrives with a visible stair. 2048 halves
    // it. Costed with perf-ab rather than assumed — see the round-12 note in the report.
    angle: LIGHTS.angle, penumbra: LIGHTS.penumbra, decay: 1.0, distance: 90,
    mapSize: SUNMAP || LIGHTS.mapSize, near: 6, far: 90, normalBias: 0.03, bias: -0.0009,
  });
  scene.add(sun, sun.target);

  // volumetric shafts through the three windows nearest the camera.
  // `mats.glass`, NOT `mats.clearGlass`, was a real bug and it is visible in the capture:
  // the window openings are built with `keys.glass -> M.glass -> mats.clearGlass` (nearly
  // colourless daylight glazing), but the shafts and the floor pools were pattern-sampling
  // the STAINED glass instead. The result was saturated red and blue rosettes projected onto
  // a black-and-white ballroom chequer from windows that are not coloured. The pool must
  // carry the pattern of the glass the light actually came through.
  const glassTex = M.glass.map;
  const lz = dir.clone().negate();
  const lx = new THREE.Vector3(0, 0, 1).sub(lz.clone().multiplyScalar(lz.z)).normalize();
  const ly = new THREE.Vector3().crossVectors(lz, lx).normalize();
  // ⚠ WINDOWS 0/1/2, NOT 1/2/3, AND THE REASON IS THE NEW SUN ANGLE. The pool decal for each
  // shaft is placed where that window's ray MEETS THE FLOOR, and at 21.6 deg the throw is
  // Dz = 0.743y instead of 0.545y — so window 3 (z 6.2) now lands at z 8.6, which is 0.6 m
  // OUTSIDE the room. It would have been a light pool behind the wall, and the fact that it
  // is derived rather than typed is exactly why it would have gone unnoticed. Windows 0/1/2
  // land at z -4.0 / 0.2 / 4.4, which are the three bands the packing cases stand in.
  for (const wz of LIGHTS.shaftWins.map((k) => winZ[k])) {
    const c = new THREE.Vector3(R.x0 + 0.06, WIN.sill + WIN.h * 0.5, wz);
    const g = new THREE.Group();
    g.matrixAutoUpdate = false;
    g.matrix.makeBasis(lx, ly, lz).setPosition(c);
    g.updateMatrixWorld(true);
    scene.add(g);
    const inner = new THREE.Group();
    inner.position.y = -WIN.h * 0.5;
    g.add(inner);
    // ⚠ `?vol=0` SKIPS THE PRISM AND THE MOTES AND KEEPS THE POOL. The three multiply pool
    // decals are built in this same loop and they are NOT volumetrics — they are the window
    // pattern on the floor, and dropping them would change the picture in a way that has
    // nothing to do with the fill-rate question the toggle exists to answer. An ablation that
    // removes two things and is reported as removing one is the failure this file has a
    // paragraph about already.
    if (VOLUMETRICS) inner.add(lightShaft({
      width: WIN.w + 0.10, height: WIN.h, length: 11.5, spread: 0.07,
      // strength 0.85 -> 0.40 and fadeY 1.5 -> 3.2. Three 15 m prisms rake across the near
      // half of the chequer, and an additive volume lying over a floor lifts its BLACK tiles
      // as hard as its white ones — so the pattern stops at the volume's edge and what is
      // left reads as plain pale slabs beside a chequer, i.e. the "seam where the tile scale
      // changes" that §6.5 reports. Dissolving the prism higher above the floor keeps the
      // beam (which is the point) and returns the floor (which is the subject).
      // ROUND 3: strength 0.40 -> 0.24, fadeY 3.2 -> 4.6, length 15 -> 11.5. Round 2 named
      // the mechanism correctly and then under-corrected it. An ADDITIVE volume lying over
      // a black-and-white chequer lifts the black tiles as hard as the white ones, so the
      // pattern dissolves wherever the prism reaches the floor and reappears where it stops
      // — and that boundary, not any change of tile scale, is the "seam" the critic sees. At
      // fadeY 3.2 three 15 m prisms still had real density at ankle height. They now die out
      // a full storey above the floor, which keeps the beam (the subject) and returns the
      // chequer (the surface it is supposed to be crossing).
      glass: glassTex, tint: 0xd8e4ff, mean: 0xe6eeff, strength: 0.24, smear: 2.2,
      floorY: 0.0, fadeY: 4.6, arch: 0.24,
    }));
    if (VOLUMETRICS) inner.add(dustMotes({
      count: Math.round(300 * (engine.quality.dust ?? 1)),
      extent: new THREE.Vector3(1.4, 2.1, 6.5),
      centre: new THREE.Vector3(0, WIN.h * 0.45, -6.5),
      rng, size: 34, intensity: 0.75, drift: 0.45, color: 0xdfeaff,
    }));
    const t2 = (0.02 - c.y) / dir.y;
    const h2 = c.clone().addScaledVector(dir, t2);
    // MULTIPLY, not add — and here the pattern the pool was destroying is the FLOOR's, which
    // makes the failure easier to see than it was in light.shaft. Three additive decals at
    // strength 0.42 landed on a black-and-white chequer and lifted the BLACK tiles as much as
    // the white ones, so inside each pool the chequer simply stopped: what reads in the
    // capture as "a visible seam where the tile scale changes" (the slice plan's §6.5) is not
    // a tiling seam at all, it is the boundary of an additive light pool erasing a pattern.
    // A filter cannot do that: it scales what is under it, so a black tile stays black and
    // the chequer runs unbroken through the daylight.
    const pool = lightPool({
      blend: 'multiply', w: WIN.w * 2.6, h: WIN.h * 3.0, glass: glassTex,
      tint: 0xf2f7ff, strength: 1.0, soft: 0.20, sat: 0.5,
    });
    pool.rotation.x = -Math.PI / 2;
    pool.rotation.z = Math.atan2(dir.x, dir.z);
    pool.position.set(h2.x, 0.016, h2.z);
    scene.add(pool);
  }

  // Bounce cards where the daylight lands on the chequer. These go up with the sun, and they
  // are the one thing that keeps the rebalance from reading as "somebody turned the lights
  // off": a hot patch on a pale marble tile throws real light back into the room, so the floor
  // AROUND each patch stays a half-stop above the deep shade instead of falling off a cliff.
  // Their COUNT is unchanged — `numPointLights` is in three's program cache key, so adding one
  // recompiles every material in the scene.
  for (const wz of LIGHTS.cardWins.map((k) => winZ[k])) {
    const c = new THREE.Vector3(R.x0, WIN.sill + WIN.h * 0.5, wz);
    const t2 = (0.02 - c.y) / dir.y;
    const h2 = c.clone().addScaledVector(dir, t2);
    const b = new THREE.PointLight(new THREE.Color(0xc9d9f2), LIGHTS.bounceCard, 13.0, 2);
    b.position.set(h2.x, 0.5, h2.z);
    scene.add(b);
  }

  // The three bounceFill DirectionalLights are the only DIRECTIONAL fill in the room, and that
  // is why they go up rather than the environment coming back. A five-box IBL shell arrives
  // near-equally from every direction, so it lights a wall, a floor and a ceiling by the same
  // amount and gives a surface no reason to have a shape; a directional light at least shades
  // by orientation. Measured on the far end wall (a rect that gets no sun and no practical):
  // dropping the shell alone takes it 67.9 -> 40.0 mean and FLAT, and the directional fill is
  // what puts the modelling back without putting the flatness back.
  // ⚠ THE WARM/COLD SPLIT HAD TO MOVE WITH `bounce`, AND ROUND 17 FOUND OUT THE HARD WAY.
  // These three weights were 0.30 warm / 0.42 cold / 0.20 up, i.e. the COLD fill was the
  // strongest of the three, and that was survivable while `bounce` was 2.1 and the sun was
  // 19400: the blue never got a look in because the key was two stops over everything.
  // Round 17 cut the key 2.25 stops and took `bounce` to 7.35, which promoted this light from
  // a tint to the dominant source in every shaded part of the room — and `_eye17_whatswhite`
  // caught the result at `cam=eye.gallery`, sampling the shaded parquet with the light pools
  // ablated out: rgb 134,147,181. Blue by 47 counts, on oak.
  //
  // A total of 0.92 is preserved exactly, so this is a redistribution and not a fourth change
  // to the room's level. What moves is which way the bounce leans, and the physical story is
  // the one the room already tells: most of the light bouncing around this room has come off a
  // warm parquet floor and gilded joinery, and only what comes back off the window wall is
  // sky. Cold stays — it is the reason the shaded side has any modelling at all.
  //
  // ⚠ AND IT IS 0.32/0.38 RATHER THAN THE 0.46/0.24 THIS STARTED AT, BECAUSE THE GRADE GATE
  // CAUGHT THE OVERSHOOT. Chasing the blue out by weight alone walks straight into the
  // opposite failure this project has a whole GRADES note about — monochrome amber. Measured
  // at `cam=eye.gallery` with `harness/grade.mjs` (top-decile (r-b)/L; target <= 0.14, fail
  // > 0.2), against the shaded-parquet rect that found the problem:
  //
  //     weights                       floor rect chroma    top-decile (r-b)/L
  //     0.30 / 0.42 (before)                 22.4            0.181  WARN
  //     0.46 / 0.24                          13.9            0.250  FAIL
  //     0.36 / 0.34                          15.2            0.202  FAIL
  //     0.32 / 0.38 (shipped)                16.8            0.186  WARN
  //
  // So most of the win comes not from the weights at all but from DESATURATING both colours
  // (0xffbc86 -> 0xffcb9e, 0x8fa9d6 -> 0x9db2d4): that takes the blue out of the shade without
  // spending anything in the top decile, which is where a weight shift spends it. The gate at
  // the shipping `overlook` camera is unaffected and passes all three: median 33.6,
  // top-decile 0.032, darkest-decile 7.2.
  // ⚠ THE TWO END WALLS HAD NO FILL AT ALL, AND THE DIRECTIONS ARE WHY (round 17, sixth pass).
  // `harness/_eye17_whylit.mjs` toggles every light in the room one at a time and samples a
  // pixel, which is the only way this was ever going to be settled — at the centre of
  // `cam=eye.mirror` the cold fill is doing the heavy lifting (178,169,130 -> 121,99,47 with
  // it off), and on the arched end wall's upper storey, seen at a grazing angle from the same
  // camera, turning EVERY light off in turn changes nothing: 17,14,12 either way. That surface
  // is lit 100% by the environment shell, and it is 26 m x 4.8 m.
  //
  // The cause is that both horizontal fills ran almost purely along x — [6,3,2] and [-8,5,2] —
  // which is right for the window wall and the mirror wall and gives a z-facing wall an N.L of
  // 0.29 and 0.21. Adding a real z component to each, in OPPOSITE senses, lights both end
  // walls without adding a light: for the z -8 wall the warm fill goes 0.29 -> 0.58, and for
  // the z +8 wall the cold fill goes from UNLIT (-0.21) to 0.46. The two long walls give up
  // about 12% of their own fill for it, which is a trade worth making — they have the sun and
  // the end walls have nothing.
  //
  // ⚠ AND IT IS NOT A FOURTH LIGHT ON PURPOSE. `numDirLights` is in three's program cache key,
  // so adding one recompiles every material in the scene — the same reason this file's own
  // practicals note gives for not adding a point light. Re-aiming is free.
  // ---- ROUND 18: THE WARM FILL WAS THE OTHER HALF OF THE AMBER --------------------------
  //
  // `warmColor` 0xffcb9e -> 0xffecd6 and `warm` 0.32 -> 0.236 of the bounce. The paragraph
  // above is right that desaturating these two colours is where the win lives, and this is the
  // same move again, one step further, on a measurement that round could not make: with the
  // room dusted (see `?dust` at the top of this file), an ablation of every chromatic term at
  // `eye.door` says the remaining warmth splits about evenly between the ALBEDOS and THIS
  // LIGHT. Dust alone took the ladder's third decile 1.04 -> 0.69 against the bar's 0.38;
  // neutralising this fill on top takes it to 0.50, and deciles 6 to 10 land on the bar
  // outright (0.43 / 0.31 / 0.28 / 0.30 / 0.36 against 0.36 / 0.34 / 0.33 / 0.34 / 0.09).
  //
  // ⚠ THE INTENSITY COMES DOWN WITH THE COLOUR AND THAT IS NOT A SEPARATE DECISION. A whiter
  // fill of the same intensity puts more into the green and blue channels of every surface it
  // touches, so the room gets BRIGHTER as it gets cooler: at 3.12 the median went 58.6 -> 63.1
  // and out of the 30-60 band. 2.60 (0.236 x bounce) puts it back at 57.2 with the whole
  // chroma win intact — swept, because the fill's own luminance compensation does not predict
  // it (that would be 3.12, which is where the median moved).
  //
  // ⚠ AND IT IS NOT NEUTRAL, DELIBERATELY. Pure white (0xffffff) reads better on the ladder
  // still — deciles 3 to 5 land exactly on the bar — but it takes deciles 6 to 9 BELOW it
  // (0.24 / 0.20 / 0.14 / 0.19 against 0.36 / 0.34 / 0.33 / 0.34), i.e. it fixes the shade by
  // making the lit half colder than the reference. 0xffecd6 is the point where both halves are
  // as close as one colour gets them.
  scene.add(bounceFill({
    warm: 0.236 * LIGHTS.bounce, warmColor: 0xffecd6, warmDir: [6, 3, 5],
    cold: 0.38 * LIGHTS.bounce, coldColor: 0x9db2d4, coldDir: [-8, 5, -5],
    up: 0.22 * LIGHTS.bounce, upColor: 0xa9a290,
  }));

  const haze = glowPatch({ size: 22, color: 0x8fa6cc, strength: 0.05, pow: 1.4 });
  haze.position.set(-4, 4.5, R.z0 + 0.8);
  scene.add(haze);

  // ---- scale -------------------------------------------------------------
  const u = buildUnit4H({ height: 1.7 });
  u.root.position.set(-3.1, 0, 1.9);
  u.root.rotation.y = 2.0;
  u.setPose({
    head: [-0.30, 0.42, 0], chest: [-0.06, 0.16, 0],
    shoulderL: [-0.42, 0, 0.36], shoulderR: [-0.18, 0, -0.28],
    elbowL: [-0.62, 0, 0], elbowR: [-0.30, 0, 0],
    hipL: [0.16, 0, 0.04], hipR: [-0.12, 0, -0.04],
    kneeL: [-0.14, 0, 0], kneeR: [-0.20, 0, 0],
  });
  scene.add(u.root);

  driveFlicker(engine);
  driveVolumetrics(engine, scene);

  // ---- the reflection probe ----------------------------------------------
  // Rendered ONCE, here, after every mesh and light in the room exists and before
  // `finalizeScene()` starts rewriting materials. The plate is hidden for the six faces so
  // the probe cannot photograph itself — a mirror in its own cube map is the classic
  // infinite-corridor artifact and it costs nothing to avoid.
  //
  // The probe sits at the mirror wall looking into the room, so the cube's -X hemisphere
  // (which is all a wall-mounted plate can ever show) carries the chandeliers, the window
  // wall opposite and the arch. 256px is deliberate: this is a reflection in old glass at
  // 8 m, and a sharper one would read as chrome.
  {
    const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    cubeRT.texture.colorSpace = THREE.NoColorSpace;
    const probe = new THREE.CubeCamera(0.4, 80, cubeRT);
    probe.position.set(R.x1 - 1.6, 3.2, 0.6);
    scene.add(probe);
    mirrorMesh.visible = false;
    const prevTarget = renderer.getRenderTarget();
    probe.update(renderer, scene);
    renderer.setRenderTarget(prevTarget);
    mirrorMesh.visible = true;
    scene.remove(probe);
    mirrorMat.envMap = cubeRT.texture;
    // With `envMap` set ON THE MATERIAL, three.js finally honours `envMapIntensity` instead
    // of overwriting it with `scene.environmentIntensity` — so this number is live, unlike
    // the twenty inert ones this slice inherited.
    mirrorMat.envMapIntensity = 2.0;
    mirrorMat.needsUpdate = true;
    engine.onDispose?.(() => cubeRT.dispose());
  }
  // ---- THE END PLATES: A TRUE PLANAR REFLECTION -----------------------------------------
  //
  // ROUND 9. `critic-estate-6`: the right-hand plate "reads as an indistinct grey-white haze
  // with no recognisable reflected content -- a stranger would likely call it a foggy or
  // damaged painting, not a mirror". Four rounds of cube-probe work (bigger cube, one probe
  // per plate, probe moved onto the plate plane, rake) each improved the AIM and none of them
  // improved the LEGIBILITY, and the reason is in three's own source rather than in this file.
  //
  // ⚠ A CUBE ENVMAP ON A NEAR-SPECULAR FLAT MIRROR CANNOT BE MADE SHARP BY MAKING THE CUBE
  // BIGGER, AND THE PREVIOUS ROUND'S 384 -> 640 IS A NO-OP. Two mechanisms, both read out of
  // three r180 and then confirmed by A/B in the browser:
  //
  //  1. `PMREMGenerator._setSize` does `_lodMax = floor(log2(cubeSize))` and
  //     `_cubeSize = 2^_lodMax`. Any cube handed to `material.envMap` is PMREM'd, so 640 is
  //     FLOORED TO 512 and the old 384 was floored to 256. The number written here has never
  //     been the number the shader gets.
  //  2. `cube_uv_reflection_fragment` makes `faceSize = exp2( mipInt )` -- the mip IS log2 of
  //     the sampled face size -- and under roughness 0.21 the curve is
  //     `mip = -2 * log2( 1.16 * roughness )`. This plate's baked silvering is ~0.055, which
  //     asks for mip 7.94, i.e. a blend of the 128 and 256 faces. `CUBEUV_MAX_MIP` is 9 at a
  //     512 cube and 8 at a 256 cube and NEITHER of them clamps 7.94 -- so the two cube sizes
  //     sample identical resolution and the extra 30 MB bought nothing.
  //
  // The plate subtends 7.04 x 12.64 degrees from this camera, so at mip 7.94 the whole
  // reflection is carried by about 10 x 20 texels stretched over 102 x 184 screen pixels.
  // That is the haze, exactly, and no probe setting reaches it. Measured the other way too:
  // scaling `material.roughness` down to 0.18 saturates the mip at `CUBEUV_MAX_MIP` and the
  // plate does get brighter and gains banding -- and is still not legible, because 40 x 72
  // texels is the ceiling of the technique here.
  //
  // So the plate stops using a cube for its mirror term. A planar reflection renders the room
  // ONCE from the camera reflected about the plate's own raked plane, into a frustum fitted to
  // the plate's four corners, and the shader samples it by projecting the fragment's world
  // position through that same matrix. There is no probe approximation left to tune: the
  // reflection is exact for this camera, at whatever resolution the target is given.
  //
  // ⚠ IT IS EXACT ONLY FOR THIS CAMERA, which is why this is affordable here and would not be
  // in a walkable room: it is rendered once at build time and never again. `end-mirror.*` and
  // `pierGlass` exist in this showcase view only -- `src/game/spaces.js` does not build them --
  // so nothing that moves depends on this. If the ballroom ever becomes walkable with these
  // plates in it, this block becomes a per-frame scene render per plate and must be re-costed.
  //
  // COST, measured rather than asserted:
  //   VRAM   2 cubes at 640 = 39 MB, plus their two PMREM atlases (1536 x 2048 RGBA16F) at
  //          25 MB each = 89 MB.  Now: two 576 x 1024 RGBA16F targets = 9.4 MB, plus two 128
  //          cubes and their atlases for the foxed term = 4.8 MB.  TOTAL 14 MB, i.e. -75 MB.
  //   build  12 face renders at 640^2 -> 2 scene renders at 576 x 1024 plus 12 at 128^2.
  //   frame  zero, both before and after. Neither path costs anything per frame.
  //   calls  unchanged; the plate is still one mesh with one material.
  //
  // The cube is KEPT, at 128, because the foxing needs it: where the amalgam has bloomed or
  // lifted, roughness jumps past 0.34 and the plate mixes back to the blurred cube. A lifted
  // patch scatters, so a sharp reflection there would be the wrong answer as well as an ugly
  // one -- and at that roughness 128 is already more resolution than the mip curve will ask
  // for. That is the one place the old technique is the right technique.
  {
    const prevTarget = renderer.getRenderTarget();
    const hw = END_MIRROR.w / 2, hh = END_MIRROR.h / 2;
    for (const p of endPlates) {
      // ⚠ PER PLATE, not shared. These were one vector outside the loop when both plates had
      // the same orientation; the left plate is now yawed 8 degrees and a shared normal would
      // aim its mirror camera 8 degrees wrong — which does not throw, does not look broken,
      // and just quietly reflects the wrong part of the room. Read off END_MIRROR the same way
      // the geometry is built (T * Ry * Rx), never off matrixWorld: the rake and the yaw are
      // baked into the GEOMETRY, so the mesh's matrixWorld is identity and a normal taken from
      // it comes back as a flat (0,0,1).
      const cr = Math.cos(END_MIRROR.rake), sr = Math.sin(END_MIRROR.rake);
      const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
      const nrm = new THREE.Vector3(cr * sy, -sr, cr * cy);
      // ---- the blurred fallback for the foxed patches ----------------------
      // 640 under `?mirror=cube`, which is the pre-r7 size EXACTLY as it shipped — including
      // the fact that PMREMGenerator floors it to 512. Reproducing the old path's real cost
      // means reproducing its real allocation, not a tidied-up version of it.
      const cubeSize = mirrorMode === 'cube' ? 640 : 128;
      const cubeRT = new THREE.WebGLCubeRenderTarget(cubeSize, { type: THREE.HalfFloatType });
      cubeRT.texture.colorSpace = THREE.NoColorSpace;
      const cubeCam = new THREE.CubeCamera(0.4, 80, cubeRT);
      cubeCam.position.set(p.x + nrm.x * 0.12, END_MIRROR.y + nrm.y * 0.12, END_MIRROR.z + nrm.z * 0.12);
      scene.add(cubeCam);
      for (const q of endPlates) q.mesh.visible = false;
      mirrorMesh.visible = false;
      cubeCam.update(renderer, scene);
      scene.remove(cubeCam);

      // ---- `?mirror=cube`: stop here, on the pre-r7 path --------------------
      // Cube assigned, 1.35 lift restored, no planar target allocated and no EO_PLANAR
      // define — so this material compiles the stock program, exactly as it did before r7.
      if (mirrorMode === 'cube') {
        const cmat = p.mesh.material;
        cmat.envMap = cubeRT.texture;
        cmat.envMapIntensity = 1.35;
        cmat.needsUpdate = true;
        engine.onDispose?.(() => cubeRT.dispose());
        continue;
      }

      // ---- the planar reflection -------------------------------------------
      // The plate centre and its four corners, in world space, in the plate's OWN frame — see
      // the per-plate note at the top of this loop for why none of this may come off
      // matrixWorld.
      const P = new THREE.Vector3(p.x, END_MIRROR.y, END_MIRROR.z);
      const up = new THREE.Vector3(sr * sy, cr, sr * cy);
      const right = new THREE.Vector3(cy, 0, -sy);
      // `cu`/`cv`, not `sx`/`sy` — `sy` is sin(yaw) three lines up and this loop shadowed it.
      const corners = [];
      for (const cu of [-1, 1]) {
        for (const cv of [-1, 1]) {
          corners.push(P.clone()
            .add(right.clone().multiplyScalar(cu * hw))
            .add(up.clone().multiplyScalar(cv * hh)));
        }
      }
      const mcam = fitMirrorCamera(camera, P, nrm, corners, 1.04, PLANAR_CLIP);
      const RT_H = 1024;
      const rtW = Math.max(64, Math.round(RT_H * mcam.aspect) & ~1);
      // MIP CHAIN, AND IT HAS TO BE ASKED FOR AT CONSTRUCTION. `RenderTarget` defaults
      // `generateMipmaps` to false, and three sizes the texture's storage from
      // `getMipLevels()` when the target is first BOUND — so setting the flag after the
      // render allocates no levels and `generateMipmap` has nowhere to write. three then
      // regenerates the chain at the end of every `render()` into this target (see
      // `updateRenderTargetMipmap`), which here means exactly once, at build time.
      const mip = MIRROR_FILTER !== 'point';
      const rt = new THREE.WebGLRenderTarget(rtW, RT_H, {
        type: THREE.HalfFloatType, colorSpace: THREE.NoColorSpace,
        minFilter: mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
        magFilter: THREE.LinearFilter, depthBuffer: true,
        generateMipmaps: mip,
      });
      if (mip) rt.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, mcam);
      renderer.setRenderTarget(prevTarget);

      for (const q of endPlates) q.mesh.visible = true;
      mirrorMesh.visible = true;

      // bias * projection * view — the fragment shader projects its own world position with
      // this and gets the texel of the reflection that belongs to it.
      const texMat = new THREE.Matrix4()
        .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
        .multiply(mcam.projectionMatrix)
        .multiply(mcam.matrixWorldInverse);
      // the plate's flat normal in VIEW space, so the shader can measure how far the foxing's
      // normal map has bent a texel away from flat and wobble the reflection by that much.
      const flatN = nrm.clone().transformDirection(camera.matrixWorldInverse).normalize();

      // Kept on the mesh so the reflection can be INTERROGATED rather than argued about: the
      // question "what is that grey wedge in the left plate" is a raycast from this camera,
      // and without it the only instrument available is squinting at 71 screen pixels.
      p.mesh.userData.mirrorCamera = mcam;
      p.mesh.userData.mirrorRT = rt;

      const mat = p.mesh.material;
      mat.envMap = cubeRT.texture;
      // 1.35 was solved against a cube that was returning a blurred average of the room. A
      // planar reflection returns the room's own values, so the plate no longer needs a lift
      // to stop reading as a panel; 1.0 is the honest number and anything above it is a
      // mirror brighter than the thing it reflects.
      mat.envMapIntensity = 1.0;
      applyPlanarReflection(mat, rt.texture, texMat, flatN, MIRROR_FILTER, [rtW, RT_H],
        { graze: EO_GRAZE });
      engine.onDispose?.(() => { rt.dispose(); cubeRT.dispose(); });
    }
  }

  // ---- THE FLOOR IS A MIRROR TOO, AND IT WAS MIRRORING NOTHING --------------------------
  //
  // ROUND 11. The near third of this frame is a featureless pale sheet with the chequer
  // missing, ending in a hard diagonal where the pattern comes back — the thing critics have
  // been calling "a seam where the tile scale changes" since round 2. It is not a tiling seam
  // and it is not the light pools. ABLATED IN ONE BOOT (`harness/_tmp_eo11_floor.mjs`,
  // 400 x 240 px of near floor at 120,700):
  //
  //     base                      mean L 127.9   acutance 0.0215   macro 0.505
  //     scene.environment = null  mean L  14.5   <- 89% OF THAT FLOOR IS THE IBL
  //     environmentIntensity x0.35 mean L  80.5  acutance 0.0497   macro 0.669
  //     the three lightPools hidden mean L 133.7 <- NOT the pools, they were blamed twice
  //     material.roughness = 1.0   mean L 127.9  <- no-op: the scalar is already 1 and the
  //                                                  ORM MAP carries the real roughness
  //
  // So the near floor is polished marble at grazing incidence returning `scene.environment` —
  // and this room's environment is a FIVE-BOX SHELL. A specular term is added equally to a
  // black tile and a white one, so a structureless bright field lands on both and the chequer
  // stops existing exactly where the floor is most oblique to the eye. **This is the same
  // defect the end plates had for four rounds — a perfect mirror of a structureless IBL is
  // structureless — and nobody had noticed it was also on the largest surface in the room.**
  //
  // The fix is the one that worked there: give it something real to reflect. The camera never
  // moves, so this is ONE extra scene render at build time and nothing per frame. The floor is
  // its own mirror plane (y = 0), so the mirrored camera keeps the MAIN camera's projection —
  // and for any point ON the plane the reflected and direct projections agree, which means the
  // reflection target is sampled 1:1 with the screen and there is no minification to filter.
  //
  // What it buys, beyond the chequer: the reflection is mixed in by the SAME roughness gate the
  // plates use, and the marble's ORM map carries wear and a dust film — so the polished lanes
  // reflect and the dusty ones do not, which is macro-scale variation of exactly the kind the
  // measured comparison against `refs/bf1/bf1-ballroom-01.png` says this render is short of.
  //
  // ⚠ `envMapIntensity` IS NOT 1 HERE. The plates set `envMap` on the material, so three
  // honoured their 1.0. This floor lights from `scene.environment`, and three OVERWRITES the
  // uniform with `scene.environmentIntensity` — 3.2. The injected reflection is multiplied by
  // that on the way out of getIBLRadiance, so it is pre-divided by `uEoGain`. Without this the
  // floor comes back at 3.2x the radiance of the room it is reflecting.
  let floorRT = null;
  if (FLOOR_REFLECT) {
    const prevTarget = renderer.getRenderTarget();
    const nrm = new THREE.Vector3(0, 1, 0);
    const P = new THREE.Vector3(0, 0, 0);
    const mcam = planeMirrorCamera(camera, P, nrm, PLANAR_CLIP);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const fw = Math.max(64, Math.round(size.x) & ~1);
    const fh = Math.max(64, Math.round(size.y) & ~1);
    floorRT = new THREE.WebGLRenderTarget(fw, fh, {
      type: THREE.HalfFloatType, colorSpace: THREE.NoColorSpace,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: true, generateMipmaps: true,
    });
    floorRT.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    floor.visible = false;                 // or the floor photographs its own underside
    if (floorParquet) floorParquet.visible = false;   // same plane, same reason
    renderer.setRenderTarget(floorRT);
    renderer.clear();
    renderer.render(scene, mcam);
    renderer.setRenderTarget(prevTarget);
    floor.visible = true;
    if (floorParquet) floorParquet.visible = true;
    const texMat = new THREE.Matrix4()
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(mcam.projectionMatrix)
      .multiply(mcam.matrixWorldInverse);
    const flatN = nrm.clone().transformDirection(camera.matrixWorldInverse).normalize();
    // 'mip' rather than 'sharp': this target is sampled at about 1:1, so there is no
    // minification to give acutance back — an unsharp mask here would only draw halos.
    applyPlanarReflection(floor.material, floorRT.texture, texMat, flatN, 'mip', [fw, fh], {
      gain: 1 / (scene.environmentIntensity || 1),
      // The chequer bakes at roughness ~0.135 under a 0.3 clearcoat; dusty and worn patches
      // run well past it. Reflect where the marble is polished, fall back to the environment
      // where it is not, and let the material's own map decide which is which.
      //
      // ⚠ ROUND 17: 0.06/0.42 -> 0.02/0.26, THE SAME CORRECTION THE PARQUET GATE JUST TOOK AND
      // for the same reason. 0.06/0.42 puts the clean chequer at smoothstep = 0.106, i.e.
      // EIGHTY-NINE PER CENT planar, and at that weight the black tiles come back as polished
      // black glass carrying a legible upside-down room. `critic-eye-sweep` called the floor a
      // wet mirror and the marble border is the half of it the parquet fix did not touch.
      // 0.02/0.26 lands the same field at 47%: a polished stone floor that holds a soft image,
      // which is what the bar's own chequer does, rather than a mirror.
      // A second measured step (round 17, after the parquet beside it stopped competing):
      // 0.02/0.26 left the clean field at 47% planar and from `cam=eye.walk` the black tiles
      // still carried a legible inverted room. 0.015/0.21 lands it at 33% — enough for the
      // chequer to hold a soft image of the windows, which polished marble does, without the
      // floor reading as the second-brightest thing in the frame.
      lo: 0.015, hi: 0.21,
      wobble: 0.0,
      graze: EO_GRAZE,
    });
    floor.material.needsUpdate = true;
    // ---- THE SAME PATCH, A SECOND TIME, FOR THE PARQUET — see the `?floor=` note up top ----
    // Same render, same texture matrix, same flat normal (the two planes are 4 mm apart, nothing
    // next to a 26 x 16 m room), but a DIFFERENT roughness gate: marble's 0.06/0.42 measured
    // against PARQUET_SURFACE's own `rough` formula (clean field ~0.40-0.45, worn traffic lanes
    // 0.55+, plank joints 0.7+) would either ask wood to be as polished as stone or close the
    // knee before the clean field even reaches it. 0.32/0.68 puts the clean wax just past the
    // knee — a soft sheen, not a mirror — and lets worn lanes and joints fall outside it, which
    // is what a floor that is waxed rather than French-polished actually does.
    if (floorParquet) {
      applyPlanarReflection(floorParquet.material, floorRT.texture, texMat, flatN, 'mip', [fw, fh], {
        gain: 1 / (scene.environmentIntensity || 1),
        // ⚠ ROUND 17: 0.32/0.68 -> 0.20/0.50, AND THE PARQUET'S OWN ALBEDO CHANGE IS WHY.
        // The old gate put clean waxed field (PARQUET_SURFACE bakes it at ~0.42) at
        // smoothstep(0.32, 0.68, 0.42) = 0.24, i.e. SEVENTY-SIX PER CENT planar — a mirror,
        // not the "soft sheen, not a mirror" the note below it claims. That was survivable
        // while the oak was bright enough to dominate its own reflection. Once round 17 took
        // the albedo down to match the bar (see the parquet bake above), the reflection term —
        // which no albedo scales — took over, and from `cam=eye.gallery` the shaded floor came
        // back at rgb 153,156,175: brighter than the wood and BLUE, because what it is
        // reflecting is a wall of cool blown-out windows.
        //
        // 0.20/0.50 puts the same clean field at 0.845 environment / 0.155 planar. Worn lanes
        // and joints (0.55+) fall outside the knee entirely. That is a waxed floor rather than
        // a French-polished one, which is what this room is, and it is also the honest fix for
        // round 17's #2 hate — the grazing-lobe widening added at the same time makes the
        // reflection SOFTER at low angles but cannot make it weaker, and this is the term that
        // does.
        lo: 0.20, hi: 0.50,
        wobble: 0.0,
        graze: EO_GRAZE,
      });
      floorParquet.material.needsUpdate = true;
    }
    engine.onDispose?.(() => floorRT.dispose());
  }

  // ---- THE PIER GLASSES ARE MIRRORS TOO, AND NOBODY HAD LOOKED AT THEM (ROUND 17) --------
  //
  // Rounds 3 through 11 fixed this exact defect twice — once on the pier plates (round 3, a
  // cube probe) and once on the END plates (round 9, a true planar reflection) — and the
  // second fix was never brought back to the first. The reason is entirely a framing one:
  // BOTH of this file's cameras look down the room from the +x end, so the pier glasses are
  // seen edge-on or not at all, and `_tmp_geoprobe.mjs` is quoted a few hundred lines above
  // saying `pier-mirrors` "never once appears" in a raster of the whole frame.
  //
  // A player standing in the middle of the room and turning to face the mirror wall gets four
  // 1.55 x 3.3 m plates square-on under the gallery, and `critic-eye-sweep` filed what they
  // do there: "the mirror plates read as smeared white/grey blurs with brown blobs. They do
  // NOT read as mirrors." That is round 3's own diagnosis, still true, in the words that
  // round used: A PERFECT MIRROR OF A STRUCTURELESS FIVE-BOX IBL IS STRUCTURELESS — and a
  // 256 px cube probe of a room whose brightest object is a wall of blown-out windows returns
  // an almost uniform pale field.
  //
  // ⚠ ONE TARGET FOR ALL FOUR, WHICH IS WHY THIS IS CHEAP AND THE END PLATES WERE NOT. The end
  // plates are raked and 10.8 m apart, so each needs its own fitted frustum (see that block's
  // note on parallax). The four pier glasses are COPLANAR, unraked, and on a plane the camera
  // never crosses — so one mirrored camera with the main projection serves all four exactly,
  // the same construction the floor uses, at one extra scene render at build time and nothing
  // per frame.
  //
  // `?pierreflect=0` ablates it back to the round-3 cube path.
  if (PIER_REFLECT) {
    const prevTarget = renderer.getRenderTarget();
    const nrm = new THREE.Vector3(-1, 0, 0);           // the plates face into the room, -x
    const P = new THREE.Vector3(R.x1 - 0.21, 0, 0);
    const mcam = planeMirrorCamera(camera, P, nrm, PLANAR_CLIP);
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const pw = Math.max(64, Math.round(size.x) & ~1);
    const ph = Math.max(64, Math.round(size.y) & ~1);
    const pierRT = new THREE.WebGLRenderTarget(pw, ph, {
      type: THREE.HalfFloatType, colorSpace: THREE.NoColorSpace,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      depthBuffer: true, generateMipmaps: true,
    });
    pierRT.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    mirrorMesh.visible = false;              // or the plates photograph their own backs
    renderer.setRenderTarget(pierRT);
    renderer.clear();
    renderer.render(scene, mcam);
    renderer.setRenderTarget(prevTarget);
    mirrorMesh.visible = true;
    const texMat = new THREE.Matrix4()
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(mcam.projectionMatrix)
      .multiply(mcam.matrixWorldInverse);
    const flatN = nrm.clone().transformDirection(camera.matrixWorldInverse).normalize();
    // ⚠ envMapIntensity 1.0 FIRST, for the reason the end-plate block gives: this material
    // lights from its OWN cube envMap, so three honours the authored value — and round 3
    // authored 2.2 to lift a blurred average of the room off the plate. A planar reflection
    // returns the room's real values, so anything above 1.0 is a mirror brighter than the
    // thing it reflects.
    // ⚠ 0.62 RATHER THAN 1.0, AND IT IS ABSORPTION, NOT TASTE. 1.0 is "a mirror as bright as the
    // thing it reflects", which is the right number for a clean modern mirror and wrong for a
    // 19th-century mercury plate: the silvering is a tarnished amalgam behind glass with iron
    // in it, and a real one returns roughly two thirds of what falls on it, slightly grey-green.
    // It matters here because what these plates are pointed at is a wall of blown-out windows —
    // so at 1.0 they came back as WHITE PANELS. `cam=eye.under`, added this round because a
    // player walking the covered aisle beneath the musicians' gallery passes within a metre of
    // one, shows it plainly: the plate reads as a sheet of cracked white board, with the foxing
    // that should say "old glass" reading as crazed paint because there is nothing behind it
    // dark enough for the craze to sit on.
    mirrorMat.envMapIntensity = 0.62;
    applyPlanarReflection(mirrorMat, pierRT.texture, texMat, flatN, MIRROR_FILTER, [pw, ph], {
      // The same gate as the end plates: clean silvering bakes near 0.055 and is fully planar,
      // and where the amalgam has bloomed the roughness jumps past 0.34 and the patch falls
      // back to the cube — a scattering patch must not carry a sharp image.
      lo: 0.10, hi: 0.34,
      graze: EO_GRAZE,
    });
    mirrorMat.needsUpdate = true;
    engine.onDispose?.(() => pierRT.dispose());
    engine.pierReflect = mirrorMesh;
  }

  // Introspection for the ablation harness, so an A/B can ASSERT which path it timed rather
  // than trust the query string it passed. `planarPatched` is set inside onBeforeCompile, so
  // it stays null until the plate's program is first compiled — the harness reads it after
  // settling, not here.
  engine.floorReflect = FLOOR_REFLECT ? floor : null;
  engine.floorMode = FLOOR;
  engine.floorParquet = floorParquet;
  engine.mirrorMode = mirrorMode;
  engine.mirrorFilter = MIRROR_FILTER;
  engine.endPlates = endPlates.map((p) => p.mesh);

  engine.finalizeScene();
  engine.markReady();
  engine.start();
  return engine;
}

// ---------------------------------------------------------------------------
// PLANAR REFLECTION — the two helpers the end plates use. See the long note at the end-plate
// block for why a cube map cannot do this job and what the swap costs.
// ---------------------------------------------------------------------------

/**
 * A camera at `cam` reflected about the plane (P, n), with its frustum fitted to `corners`
 * so that almost every texel of the render target lands on the plate.
 *
 * ⚠ THE NEAR PLANE IS THE TRAP IN THIS TECHNIQUE, AND IT FAILS SILENTLY. A mirrored camera
 * stands BEHIND the wall the mirror is hung on, so with a default near plane it photographs
 * the back of that wall and returns a flat field — which looks exactly like "the reflection
 * has nothing in it" and is nothing of the kind.
 *
 * ⚠⚠ ROUND 10: THE FLAT NEAR PLANE THAT USED TO SIT HERE WAS NOT ENOUGH, AND THIS COMMENT
 * ARGUED ITSELF INTO THE BUG. It said: "the plate spans only ~0.3 m of depth from this camera,
 * so a flat near plane just short of the nearest corner clips the wall (0.49 m nearer) and
 * keeps the whole plate." Both halves are true and the conclusion does not follow, because
 * A NEAR PLANE IS PERPENDICULAR TO THE VIEW AXIS AND THE WALL IS NOT. The two planes are
 * oblique to each other, so they INTERSECT IN A LINE, and on one side of that line the wall
 * is beyond the near plane and renders. For the left plate the mirrored camera meets the end
 * wall at 60 degrees off its normal and the crossing line falls right across the middle of
 * the frustum: MORE THAN HALF THAT PLATE'S REFLECTION WAS THE BACK OF ITS OWN WALL — a flat
 * grey field with a dead-straight diagonal edge, which reads exactly like "soft mirror" and
 * is nothing of the kind. The right plate escaped only because its axis is nearly normal to
 * the wall (view-axis z-component 0.964 against 0.868), which pushes the crossing line
 * outside the frustum. That is the whole of "the two plates are not at parity".
 *
 * The fix is the oblique near plane the old comment named and declined to build — Lengyel's
 * clip-plane substitution, the same one three's own `Reflector` uses. The near plane is
 * replaced by the MIRROR PLANE ITSELF, so anything behind the glass is clipped whatever the
 * angle, and there is no longer a hand-tuned distance that can be right for one plate and
 * wrong for another.
 *
 * ⚠ Validated by breaking it: `?planarclip=flat` puts the old flat near plane back, and the
 * grey wedge returns across the left plate. That flag is kept permanently, not deleted after
 * the round — the previous owner's flat-plane reasoning shipped precisely because there was
 * no way to run it against the alternative.
 */
function fitMirrorCamera(cam, P, n, corners, margin = 1.04, clipMode = 'oblique') {
  const reflectPoint = (p) => p.clone().sub(n.clone().multiplyScalar(2 * p.clone().sub(P).dot(n)));
  const reflectDir = (d) => d.clone().sub(n.clone().multiplyScalar(2 * d.dot(n)));

  const mcam = new THREE.PerspectiveCamera(30, 1, 0.1, 90);
  mcam.position.copy(reflectPoint(cam.position));
  mcam.up.copy(reflectDir(cam.up));
  mcam.lookAt(P);
  mcam.updateMatrixWorld(true);

  const inv = new THREE.Matrix4().copy(mcam.matrixWorld).invert();
  let tx = 1e-4, ty = 1e-4, near = Infinity;
  for (const c of corners) {
    const v = c.clone().applyMatrix4(inv);
    const z = Math.max(1e-3, -v.z);
    tx = Math.max(tx, Math.abs(v.x) / z);
    ty = Math.max(ty, Math.abs(v.y) / z);
    near = Math.min(near, z);
  }
  tx *= margin; ty *= margin;
  mcam.fov = 2 * Math.atan(ty) * 180 / Math.PI;
  mcam.aspect = tx / ty;
  // A SMALL near plane on purpose. The oblique substitution below REPLACES the near plane with
  // the mirror plane, so the number here only sets the depth range; keeping the old
  // "just short of the nearest corner" value would leave the flat plane fighting the oblique
  // one for whichever is nearer, which is the bug this is fixing.
  mcam.near = clipMode === 'flat' ? Math.max(0.05, near - 0.05) : 0.1;
  mcam.far = 90;
  mcam.updateProjectionMatrix();
  mcam.updateMatrixWorld(true);
  if (clipMode === 'flat') return mcam;

  // ---- OBLIQUE NEAR PLANE (Lengyel), matching three's own Reflector -----------------------
  // `n` faces the room (it is the plate's outward normal and the real camera stands in front
  // of the plate), which is the sign convention Reflector uses.
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, P);
  plane.applyMatrix4(mcam.matrixWorldInverse);
  const cp = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
  const e = mcam.projectionMatrix.elements;
  const q = new THREE.Vector4(
    (Math.sign(cp.x) + e[8]) / e[0],
    (Math.sign(cp.y) + e[9]) / e[5],
    -1.0,
    (1.0 + e[10]) / e[14]);
  cp.multiplyScalar(2.0 / cp.dot(q));
  e[2] = cp.x;
  e[6] = cp.y;
  // The 1e-4 is a clip bias: without it the plate's own coplanar geometry z-fights the new
  // near plane and stipples the first few texels of the reflection.
  e[10] = cp.z + 1.0 - 1e-4;
  e[14] = cp.w;
  mcam.projectionMatrixInverse.copy(mcam.projectionMatrix).invert();
  return mcam;
}

/**
 * The camera reflected about the plane (P, n), KEEPING the real camera's own projection.
 *
 * This is the right form for a mirror that fills the frame — the floor — and the wrong form
 * for a small plate, which wants `fitMirrorCamera`'s fitted frustum so its target is not
 * mostly wasted. The useful property: for any point ON the plane the reflected view matrix
 * and the direct one agree, so a floor fragment samples the reflection target at its own
 * screen position and there is no minification to filter.
 *
 * ⚠ BOTH the eye and the look direction are reflected, and `lookAt` then rebuilds an
 * orthonormal RIGHT-handed basis — so the scene is rendered unmirrored from a normal camera
 * and no winding or culling flip is needed. This is three's own `Reflector` construction;
 * reflecting the world instead (a matrix with determinant -1) is the version that needs one.
 */
function planeMirrorCamera(cam, P, n, clipMode = 'oblique') {
  const reflectPoint = (p) => p.clone().sub(n.clone().multiplyScalar(2 * p.clone().sub(P).dot(n)));
  const reflectDir = (d) => d.clone().sub(n.clone().multiplyScalar(2 * d.dot(n)));

  const mcam = new THREE.PerspectiveCamera(cam.fov, cam.aspect, cam.near, cam.far);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
  const camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
  mcam.position.copy(reflectPoint(cam.position));
  mcam.up.copy(reflectDir(camUp));
  mcam.lookAt(reflectPoint(cam.position.clone().add(fwd)));
  mcam.updateProjectionMatrix();
  mcam.updateMatrixWorld(true);
  if (clipMode === 'flat') return mcam;

  // Oblique near plane (Lengyel) at the mirror plane itself — same substitution and the same
  // reasoning as `fitMirrorCamera`; here it is what stops anything under the floor rendering.
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, P);
  plane.applyMatrix4(mcam.matrixWorldInverse);
  const cp = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
  const e = mcam.projectionMatrix.elements;
  const q = new THREE.Vector4(
    (Math.sign(cp.x) + e[8]) / e[0],
    (Math.sign(cp.y) + e[9]) / e[5],
    -1.0,
    (1.0 + e[10]) / e[14]);
  cp.multiplyScalar(2.0 / cp.dot(q));
  e[2] = cp.x;
  e[6] = cp.y;
  e[10] = cp.z + 1.0 - 1e-4;
  e[14] = cp.w;
  mcam.projectionMatrixInverse.copy(mcam.projectionMatrix).invert();
  return mcam;
}

/**
 * Swap a MeshStandardMaterial's IBL RADIANCE (its mirror term) for a screen-projected planar
 * reflection, leaving every other part of the standard shading — Fresnel, the metalness and
 * roughness maps, the diffuse irradiance — exactly as it was. That is the whole reason for
 * patching `getIBLRadiance` rather than adding light in `opaque_fragment`: the foxed silvering
 * is what makes this plate read as glass, and it is carried by those maps.
 *
 * ⚠ `patchForScreenAO` (post/pipeline.js) runs LATER, chains onto this `onBeforeCompile`, and
 * then OVERWRITES `customProgramCacheKey` with a constant shared by every standard material in
 * the project. So a cache key of our own would be thrown away, and this material could be
 * handed a program compiled for the pier plates — same parameters, no planar patch. A
 * `defines` entry is used instead: `getProgramCacheKey` walks `parameters.defines` BEFORE it
 * reaches `customProgramCacheKey`, so the define is the thing that actually keeps the programs
 * apart. Verified against three r180's own `WebGLPrograms.getProgramCacheKey`.
 *
 * ⚠ AND THE ONE THAT COST THIS ROUND AN HOUR: `onBeforeCompile` HANDS YOU THE SHADER WITH ITS
 * `#include` DIRECTIVES STILL UNRESOLVED. `resolveIncludes()` runs later, inside WebGLProgram.
 * So a string replace aimed at text that lives INSIDE a chunk — here
 * `vec4 envMapColor = textureCubeUV(...)`, which lives in envmap_physical_pars_fragment —
 * matches nothing, returns the string unchanged, and FAILS COMPLETELY SILENTLY. The plate went
 * on rendering the cube path and simply looked a bit darker, which is indistinguishable from
 * "the planar reflection is working and the target is dark". Every other onBeforeCompile in
 * this project (pipeline.js, materials-local.js, robot.js, gadgetmat.js) replaces an
 * `#include <...>` line or `void main() {` — that is not a style, it is the only thing that
 * works. The chunk is pulled out of THREE.ShaderChunk, edited, and injected in place of its
 * own include, and the edit is ASSERTED rather than hoped for.
 *
 * ⚠ NO BACKTICKS ANYWHERE IN THIS FUNCTION, including in comments — one inside a GLSL template
 * literal terminates the JS string and takes the whole bundle down for every agent sharing the
 * dev server. It has happened four times in two days. These strings are single-quoted and
 * array-joined for that reason.
 */
// The anchor is three r180 verbatim, envMapRotation included — read out of
// ShaderChunk.envmap_physical_pars_fragment rather than recalled. It occurs exactly once;
// getIBLIrradiance uses worldNormal and is deliberately left on the cube, because the diffuse
// term genuinely does want a blurred average of the room.
const IBL_RADIANCE_ANCHOR =
  'vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );';

function planarEnvmapChunk(filterMode = 'sharp') {
  const src = THREE.ShaderChunk.envmap_physical_pars_fragment;
  if (src.indexOf(IBL_RADIANCE_ANCHOR) < 0) {
    console.warn('[room.ballroom] planar reflection: getIBLRadiance anchor not found in '
      + 'THREE.ShaderChunk.envmap_physical_pars_fragment — three.js changed the chunk. '
      + 'The plates are on the cube path and WILL read as haze.');
    return null;
  }
  // The pre-r11 fetch, kept verbatim behind ?mirrorfilter=point so the aliasing can be put
  // back on demand. A change that ships without an ablation cannot be judged later.
  const POINT = [
    '  vec2 eoUv = clamp( eoBase + ( normal - uEoFlatN ).xy * uEoWobble, 0.002, 0.998 );',
    '  vec3 eoPlanar = texture2D( uEoMap, eoUv ).rgb;',
  ];
  // ⚠ THE LOD IS TAKEN FROM THE SMOOTH PROJECTED UV, NEVER FROM THE WOBBLED ONE. The wobble
  // is a normal-map term, so its derivative is high-frequency noise; feeding that to the mip
  // selection picks a different level per pixel and reintroduces the exact speckle this is
  // removing — as a blur that changes every pixel, which looks like dirty glass and is not.
  //
  // ---- THE GRAZING LOBE, WHICH IS THE WHOLE OF ROUND 17's #2 HATE ------------------------
  //
  // A planar reflection is a MIRROR AT EVERY ANGLE, and that is wrong in one specific place:
  // the floor seen nearly edge-on. `critic-eye-sweep` filed it as "the parquet is a mirror …
  // like wet lacquer" against a bar (`refs/bf1/bf1-ballroom-01.png`) whose floor is matt, and
  // `harness/_eye17_clip.mjs` puts the same thing in numbers — at `cam=eye.floor` 30.2% of the
  // frame is above L 190 (the bar: 7.5%) and the local contrast INSIDE that bright area is
  // 3.73 against the bar's 8.57. A blown, textureless, mirror-bright floor.
  //
  // Rounds 1-16 never saw it because both of their cameras look DOWN. Elevation is the whole
  // variable: the overlook meets the floor at 17 degrees, the r10 camera at 6, and a standing
  // player at 3-6 across most of the room. The lower the angle the more of the frame the floor
  // is, and the more mirror-like this code makes it.
  //
  // THE FIX IS NOT A STRENGTH KNOB, IT IS THE MISSING HALF OF THE BRDF. A GGX lobe's angular
  // width grows as roughness / cos(theta_v): at normal incidence a waxed floor returns a soft
  // sheen, and at grazing that SAME material smears the room into a long vertical streak. The
  // planar path models the direction and skips the width, so it hands back a sharp mirror at
  // exactly the angle where a real floor has none. Widen the lobe by fetching a coarser mip:
  //
  //     spread = 1 + uEoGraze * roughness / max( N.V, 0.02 )      lod += log2( spread )
  //
  // The numbers this produces are the point. Clean waxed parquet bakes at roughness ~0.42:
  //
  //     camera          floor N.V     spread    extra mip levels
  //     eye.floor (3 deg)   0.10       5.2         2.4      a streak, which is correct
  //     overlook (17 deg)   0.29       2.4         1.3      a soft sheen
  //     straight down       1.00       1.4         0.5      almost untouched
  //
  // ⚠ IT IS DELIBERATELY THE SAME CODE ON THE END PLATES, and it costs them nothing: they are
  // looked at nearly square-on (N.V ~ 0.9) and bake at roughness ~0.055, so spread is 1.06 and
  // the reflected mullion grid — the one piece of structure those plates have, and the subject
  // of rounds 5 through 11 — keeps every bit of its sharpness. A term that had to be excluded
  // from half the surfaces it applies to would be a fudge; this one does not.
  //
  // `?eograze=0` is the permanent ablation and restores the pre-r17 mirror exactly.
  const LOD = [
    '  vec2 eoPx = eoBase * uEoSize;',
    '  vec2 eoDx = dFdx( eoPx ), eoDy = dFdy( eoPx );',
    '  float eoLod = clamp( 0.5 * log2( max( dot( eoDx, eoDx ), dot( eoDy, eoDy ) ) ), 0.0, uEoMaxLod );',
    // ⚠ CLAMPED AT 0.02, NOT AT 0. N.V reaches zero on the silhouette of every curved surface
    // this material touches, and an unclamped divide there returns inf -> a NaN lod -> a black
    // pixel ring. 0.02 is 88.9 degrees, past any angle the floor is actually seen at.
    '  float eoNdV = clamp( dot( normal, viewDir ), 0.02, 1.0 );',
    '  float eoSpread = 1.0 + uEoGraze * roughness / eoNdV;',
    '  eoLod = clamp( eoLod + log2( eoSpread ), 0.0, uEoMaxLod );',
    '  vec2 eoUv = clamp( eoBase + ( normal - uEoFlatN ).xy * uEoWobble, 0.002, 0.998 );',
    '  vec3 eoPlanar = texture2DLodEXT( uEoMap, eoUv, eoLod ).rgb;',
  ];
  // One octave of unsharp mask, in the mip domain. A box-filtered minification is a correct
  // low-pass and an ugly one: it rolls the top octave off long before Nyquist, which is what
  // a viewer reads as "soft". Subtracting the next mip puts that octave back at one extra
  // fetch, and it cannot ring beyond the data because both taps come from the same chain.
  const SHARP = [
    '  vec3 eoBlur = texture2DLodEXT( uEoMap, eoUv, min( eoLod + 1.0, uEoMaxLod ) ).rgb;',
    '  eoPlanar = max( vec3( 0.0 ), eoPlanar + uEoSharp * ( eoPlanar - eoBlur ) );',
  ];
  const body = filterMode === 'point' ? POINT
    : filterMode === 'mip' ? LOD
      : LOD.concat(SHARP);
  return src.replace(IBL_RADIANCE_ANCHOR, [
    IBL_RADIANCE_ANCHOR,
    '#ifdef EO_PLANAR',
    '{',
    '  vec4 eoClip = uEoMat * vec4( vEoWorld, 1.0 );',
    '  vec2 eoBase = eoClip.xy / max( eoClip.w, 1e-4 );',
    ...body,
    // Where the amalgam has bloomed or lifted, the roughness map jumps well past the gate and
    // the plate goes back to the blurred cube — a scattering patch should not carry a sharp
    // image. Clean silvering bakes at about 0.055, so it is fully planar. The floor uses the
    // same gate against its own wear-and-dust map, which is what makes its polished lanes
    // reflect and its dusty ones not.
    '  envMapColor.rgb = mix( eoPlanar * uEoGain, envMapColor.rgb, smoothstep( uEoRough.x, uEoRough.y, roughness ) );',
    '}',
    '#endif',
  ].join('\n'));
}

function applyPlanarReflection(mat, texture, texMat, flatViewNormal, filterMode = 'sharp',
  size = [512, 1024], opts = {}) {
  const chunk = planarEnvmapChunk(filterMode);
  // If three ever moves that line, leave the plate on the cube rather than shipping a material
  // that silently does nothing. planarEnvmapChunk has already warned.
  if (chunk === null) { mat.userData.planarPatched = false; return mat; }

  const uni = {
    uEoMap: { value: texture },
    uEoMat: { value: texMat },
    uEoFlatN: { value: flatViewNormal },
    // How far the silvering's own normal map drags the reflection sideways, in uv. A real
    // mercury plate is not optically flat and a perfectly rigid reflection is one of the
    // tells that a frame is a render; this couples the pouring drift already in the normal
    // map into the image the plate carries.
    //
    // ⚠ 0.030 -> 0.010, AND THIS IS HALF OF THE PARITY HATE. The displacement is in UV, so it
    // is 3% of the PLATE regardless of how big the plate is on screen — but what it costs is
    // measured in the SIZE OF THE FEATURES it smears. On the far plate 3% is 5.6 screen px
    // against a reflected chequer square of about 40, i.e. invisible. On the near plate it is
    // 2.1 screen px against a window mullion of about 1, i.e. it destroys the one piece of
    // structure the plate has. The same number, applied honestly to both plates, damages only
    // the small one — which is exactly the asymmetry the "not at parity" hate describes.
    // Swept in one boot at 0.030 / 0.010 / 0 (`harness/_tmp_eo11_knob.mjs uEoWobble`): at
    // 0.030 the reflected glazing bars are visibly wavy and broken, at 0.010 they are a clean
    // grid with a slight lean, at 0 they are ruler-straight and the plate starts to read as
    // polished steel rather than as old glass. 0.010 keeps the character and returns the read.
    uEoWobble: { value: opts.wobble ?? 0.010 },
    // ⚠ getIBLRadiance ends in `* envMapIntensity`, and three OVERWRITES that uniform with
    // `scene.environmentIntensity` for anything lighting from the scene environment rather
    // than from its own `envMap`. The plates set envMap and get 1.0; the floor does not and
    // gets 3.2. Pre-divide, or the reflection comes out brighter than the room.
    uEoGain: { value: opts.gain ?? 1.0 },
    uEoRough: { value: new THREE.Vector2(opts.lo ?? 0.10, opts.hi ?? 0.34) },
    uEoSize: { value: new THREE.Vector2(size[0], size[1]) },
    uEoMaxLod: { value: Math.floor(Math.log2(Math.max(size[0], size[1]))) },
    // Swept in one boot at 0 / 0.55 / 1.0 (`harness/_tmp_eo11_knob.mjs uEoSharp`), measured on
    // the near plate's 64 x 134 crop: acutance 0.1949 / 0.2048 / 0.2144 and the 2-px band
    // 8.36 / 9.03 / 9.71, with the reflected glazing bars gaining definition the whole way and
    // no visible halo at this magnification. 0.85 rather than 1.0 only because a mask this
    // strong on a 71-px plate has nowhere to hide if a later camera enlarges it.
    uEoSharp: { value: 0.85 },
    // See the grazing-lobe note above planarEnvmapChunk's LOD block. 1.0 is not a taste
    // setting — it is the coefficient that makes `spread` the GGX lobe's own width ratio
    // rather than a scaled version of it. `?eograze=0` restores the pre-r17 mirror.
    uEoGraze: { value: opts.graze ?? 1.0 },
  };
  mat.userData.planarUniforms = uni;
  mat.userData.planarFilter = filterMode;
  // The filter mode changes the PROGRAM, so it has to be part of the cache key or two plates
  // built in different modes share one compilation. Same reason EO_PLANAR is a define and not
  // a customProgramCacheKey — see the note above.
  mat.defines = { ...(mat.defines || {}), EO_PLANAR: '1', EO_FILTER: filterMode.toUpperCase() };

  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = function (shader, renderer) {
    if (prev) prev.call(this, shader, renderer);
    Object.assign(shader.uniforms, uni);

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', [
        '#include <common>',
        'varying vec3 vEoWorld;',
      ].join('\n'))
      // worldpos_vertex runs after begin_vertex, so 'transformed' is the final local position.
      .replace('#include <worldpos_vertex>', [
        '#include <worldpos_vertex>',
        'vEoWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
      ].join('\n'));

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform sampler2D uEoMap;',
        'uniform mat4  uEoMat;',
        'uniform vec3  uEoFlatN;',
        'uniform float uEoWobble;',
        'uniform vec2  uEoSize;',
        'uniform float uEoMaxLod;',
        'uniform float uEoSharp;',
        'uniform float uEoGain;',
        'uniform vec2  uEoRough;',
        'uniform float uEoGraze;',
        'varying vec3  vEoWorld;',
      ].join('\n'))
      // The chunk is injected EXPANDED, in place of its own include — see the note above for
      // why replacing chunk-internal text here matches nothing and fails silently.
      .replace('#include <envmap_physical_pars_fragment>', chunk);
    // ASSERT THE REPLACE LANDED, both halves. `String.replace` returning its input unchanged
    // is this file's documented silent failure; `uEoMap` proves the uniform block arrived and
    // `eoBase` proves the CHUNK did, which is the half that fails when three moves an include.
    const fs = shader.fragmentShader;
    mat.userData.planarPatched = fs.indexOf('uEoMap') >= 0 && fs.indexOf('eoBase') >= 0;
    mat.userData.planarLod = fs.indexOf('texture2DLodEXT( uEoMap') >= 0;
    mat.userData.planarSharpPatched = fs.indexOf('uEoSharp *') >= 0;
    if (!mat.userData.planarPatched) {
      console.warn('[room.ballroom] planar reflection: the chunk injection MATCHED NOTHING. '
        + 'The plate is on the cube path and will read as haze.');
    }
  };
  mat.needsUpdate = true;
  return mat;
}
