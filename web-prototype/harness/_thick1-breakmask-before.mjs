import * as THREE from 'three';
import { raggedBreak } from '../src/materials/surfaces/wallstages.js';

/**
 * The break edge — the thing that makes layered destruction read as destruction.
 *
 * THE PROBLEM THIS SOLVES
 * The state machine's rule is "layer i is visible when i >= stage". Implemented literally,
 * with whole layers switching on and off, every stage renders as a full flat field: you get
 * a wall of lath, not plaster broken back to *expose* lath. But the torn edge is the hero
 * of the effect. Every demolition photograph and the locked art (Dev Art 1785320177684) show
 * the inner layer inside a ragged hole, with the broken outer layer persisting around it,
 * a crumbling lip, and hairline cracks radiating into the intact surface.
 *
 * THE APPROACH
 * Each surface bakes a "break order" scalar into the unused alpha of its ORM texture
 * (see Surf.breakOrder in baker.js): 0 gives way first, 1 last. At runtime a single
 * uniform `uBreak` is a threshold — discard where breakOrder < uBreak — so one float grows
 * a ragged hole whose silhouette was authored in the bake. No extra texture, no geometry
 * work, no per-frame CPU cost, and the hole shape is deterministic so two clients and two
 * screenshots agree.
 *
 * Just above the threshold sits the LIP: a band a few percent wide where the surface is
 * darkened, roughened and pushed back, which is what reads as crumbling rather than cut.
 * That band is why this looks broken instead of looking like a stencil.
 *
 * ⚠️ THAT LAST CLAIM WAS NOT TRUE UNDER BRIGHT LIGHT, AND THIS IS WHAT WAS WRONG WITH IT.
 * Two defects, one in the field and one here:
 *   - the baked field had no structure between "a fifth of a tile" and "a texel", so it
 *     thresholded into scallop lobes. Fixed in wallstages.js — see BREAK_FIELD there.
 *   - the lip was a CONSTANT-WIDTH band that only mixed toward a mid grey. A constant-width
 *     offset from a silhouette is a bevel, and the mix was a wash: on mat.lath it covered
 *     56% of the surviving plaster while never producing a single dark value. So the
 *     plaster read as a pale sticker lying on the lath rather than as a broken sheet with
 *     thickness — no undercut, no cavity glimpsed under the overhang, nothing at the rim
 *     darker than the face. In the reference (refs/lath/lath-clay-plaster-ceiling.jpg) the
 *     single loudest cue at the edge is a DARK one.
 * So the lip now varies its width along the edge and carries a narrow dark undercut at the
 * very rim. Both are gated on uRagged; at 0 this file reproduces the old lip exactly.
 *
 * Because the layers are nested with the outer ones breaking first and further, the
 * silhouettes stack, and you see plaster edge, then lath edge, then framing — the layered
 * read the README's model was designed to produce.
 *
 * ---------------------------------------------------------------------------
 * 🕳️ WHERE THE THRESHOLD COMES FROM — THE ONE THING THAT CHANGED, 2026-08-08
 * ---------------------------------------------------------------------------
 * `uBreak` is ONE NUMBER FOR A WHOLE SURFACE, which is precisely why the wall used to break
 * uniformly instead of where you hit it — and why `docs/design/dig.md` had to segment a wall
 * into bays to get positional destruction at all. John rejected the bays: *"I wanted a whole
 * new system where white chucks fall off when hit with the hammer."*
 *
 * So a second threshold source exists: **a `tDamage` texture sample instead of a uniform**
 * (`src/destruction/damagefield.js`). Nothing else moved. The raggedness, the varying lip
 * width, the dark rim undercut, the nested layer silhouettes and both of the hard-won fixes
 * recorded above are all THRESHOLD-DRIVEN and survive untouched, because the only difference
 * is what number `_order` is compared against.
 *
 * ⚠️ **THE SCALAR PATH'S SHADER SOURCE IS CHARACTER-IDENTICAL TO WHAT IT WAS.** Every existing
 * piece — `wall.*`, `mat.*`, the studio views, `wallinstances.js`'s pristine and spent copies —
 * drives `uBreak` as a uniform and must render byte-identical; `wall.sheet` PASS 78 is the
 * board's only material PASS lineage and this file carries it. The damage path is therefore
 * gated on the PRESENCE of `opts.damage` and injected by string substitution of the threshold
 * expression, so with no damage texture the emitted GLSL is the same bytes it always was: no
 * extra uniform, no extra branch, no extra varying, no extra program. That is the §8
 * regression gate and it is not negotiable.
 */

const BREAK_PARS = /* glsl */ `
uniform float uBreak;        // 0 = intact, 1 = fully gone
uniform float uLipWidth;
uniform vec3  uLipColor;
uniform float uLipRough;
uniform sampler2D tBreakField;   // ORM; alpha carries break order
uniform float uUseOrmAlpha;
uniform float uJag;          // how far the cut boundary is perturbed
uniform vec2  uJagScale;     // anisotropic: high across the grain, low along it
uniform float uRagged;       // 0 = the pre-2026-08-05 lip, exactly
uniform float uRimDark;      // how dark the undercut at the very rim goes

// Value noise, used to fringe the discard boundary. The baked break field is smooth, so
// on its own it cuts a clean curve — and a clean curve is what made surviving studs at the
// open stage look pristine rather than snapped, which is what failed the blind test. This
// makes the boundary itself splinter. Stretching it along the member's grain turns the
// fringe into long thin slivers instead of a uniform nibble.
float _bhash(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float _bnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(_bhash(i), _bhash(i + vec2(1,0)), u.x),
             mix(_bhash(i + vec2(0,1)), _bhash(i + vec2(1,1)), u.x), u.y);
}
`;

/**
 * The damage arm's extra declarations. Appended to BREAK_PARS only when a damage texture is
 * supplied, so the scalar arm never sees them.
 *
 * ⚠️ **`vDmgUv` IS ITS OWN VARYING AND NOT `vMapUv`, AND THAT IS NOT TIDINESS.** `vMapUv` is
 * the MAP transform applied to `uv` — three multiplies it by `mapTransform`, so any material
 * whose baked texture tiles (`repeat` other than [1,1]) would sample the damage field N times
 * across the face and put N holes in the wall for one hammer blow. The wall stage materials
 * ship at repeat [1,1] today, which means the bug would not appear until somebody tiled one,
 * and it would then look like the damage grid was broken rather than like the UV was.
 * `uv` is the face's own 0..1 parameterisation and it is what `damagefield.js` is gridded on.
 */
const DAMAGE_PARS = /* glsl */ `
uniform sampler2D tDamage;   // R = depth 0..1, G = 1 where there is structure behind
uniform vec2 uDmgBand;       // this layer's [lo, hi] slice of depth
/**
 * 💡 **ROUND 11: THE BAND A LAYER IS *LIT* BY IS NOT ALWAYS THE BAND IT *TEARS* ON.**
 *
 * Every term in this file that asks "how far into the breach is this texel" asks '_dmgB', the
 * layer's OWN band — and that was right while all four layers tore over the same slice of depth.
 * 'wall.js' 'DAMAGE_BANDS' now hands the innermost layer the DEEP half of the axis (see there),
 * so layer 3 stands inside an open crater for most of a dig with its own band still at zero. Two
 * terms then read exactly backwards:
 *
 *   · **uBandEmissive** exists because *a cavity is unlit and an unlit white wall is a grey wall*.
 *     Gated on the layer's own band, the one surface that is now the FLOOR of the crater would
 *     get none of it — so the thing this round exists to make visible would be drawn near-black.
 *   · **uGlow** is the breach's bounce onto surviving material. The surviving inner plate is the
 *     material closest to the slab and takes the most bounce; gating it on the plate's own tear
 *     means the bounce only arrives as the plate leaves.
 *
 * So those two read 'uLitBand' — the band of the layer IN FRONT, i.e. "when did the room start
 * being able to see me". Everything that describes the layer's own MATERIAL (the tear, the lip,
 * the march, the spent ramp) still reads its own band, because that is what it is about.
 *
 * ⚠️ **DEFAULT IS THE LAYER'S OWN BAND, SO EVERY EXISTING CALLER IS BIT-IDENTICAL.** 'wall.js'
 * passes it only for layer 3; bands 0-2, 'chunk-thick.mjs' and every other damage-armed caller
 * get 'uLitBand' == 'uDmgBand' and '_dmgL' is '_dmgB' to the bit. ⚠️ And it is declared inside
 * DAMAGE_PARS, so 'wall.sheet' PASS 78 and every scalar consumer never see it at all.
 */
uniform vec2 uLitBand;
uniform vec2 uDmgStep;       // two damage cells, in uv — the gradient's finite difference
uniform float uOrderLod;     // mip level whose footprint is ~half a metre on this face
uniform float uOrderGain;    // how far the high-passed order field is stretched back out
/**
 * 🚨 **ROUND 4, DEFECT 2 — THE HIGH-PASS HAD NO TOP STOP, AND THAT IS WHAT ATE THE SECTION.**
 *
 * '_rrrOrder' subtracts a half-metre local mean from the FULL-RESOLUTION break field, so the
 * residual it drives the silhouette with carries every scale from 5.6 mm up to 54 cm at once,
 * amplified 2.8x. **The white shell is 69 mm thick.** A boundary that wanders by more than the
 * slab's thickness over less than the slab's thickness of travel cannot show a section: the
 * 69 mm cut face is combed into fingers narrower than they are long, which is precisely what
 * 'critic-dig-3' could not find an edge in, and it is a coastline besides.
 *
 * ⚠️ **MEASURED, NOT REASONED, AND THE FIRST GUESS WAS WRONG.** The jag noise was ablated live
 * ('uJag = 0' on all four layers, same frame, same station) and the filigree DID NOT MOVE — so
 * coarsening 'uJagScale' alone, which is what this round tried first, could never have fixed it.
 * Ablating 'uOrderGain' as well flattens the boundary to a clean contour and **the shell's grey
 * section appears immediately, a continuous 12-15 px ribbon** at the same station that had
 * measured 5 px. The residual was always the shredder.
 *
 * So the high-pass gets a top stop: 'uOrderHi' is the mip the fine tap is taken from (a ~13 cm
 * footprint rather than 5.6 mm) and 'uOrderSoft' is how far toward it the fine tap is carried.
 * The residual then band-passes 13-54 cm — chunk structure, which is what plaster snapping into
 * plates actually looks like — and the fifth of the filigree that survives crumbles the arris at
 * about a centimetre, well under the slab's thickness instead of five times over it.
 *
 * ⚠️ Both default to identity, and '_rrrOrder' lives in DAMAGE_PARS, so nothing outside a
 * damage-armed face can reach this at all.
 */
uniform float uOrderHi;
uniform float uOrderSoft;
/**
 * 🧩 **ROUND 7: PLATES. A PER-CELL CONSTANT, AND IT IS THE ONLY TERM IN THE SILHOUETTE THAT IS
 * NOT A SMOOTH FUNCTION OF POSITION.**
 *
 * Round 6's rank-1 defect was *"the teeth are rounded scallops, not angular plates"*, and it
 * named the cause as the fine tap being low-passed: uOrderSoft 0.80 was said to be *"exactly
 * what rounds off the cell walls"*. **That was A/B'd, live, five arms in one page on one crater,
 * and it is refuted.** Dropping the soft to 0.55 / 0.35 / 0.15 / 0.00 does not produce plates; it
 * produces FILIGREE — a lace of white hairs round the rim, worse at every step, with the frame's
 * outline curvature going 1.49 -> 1.83 -> 2.42 -> 2.79 -> 3.95 px of mean second difference. The
 * reason is what is actually IN the plaster bake below 13 cm: 'plasterMat' subtracts
 * 'cracks * 0.30' from its break order, and the crazing is a HAIRLINE at 1-2 cm — nearly five
 * times the chunk term's amplitude and a fifth of its size. The low pass was never hiding the
 * cell walls (the Voronoi is 41 x 20 cm and sits well ABOVE the 13 cm cutoff, so it survives at
 * 0.80 already); it was hiding the crazing, which is a shredder.
 *
 * ⚠️ **SO THE PLATES CANNOT COME OUT OF THE BAKE AND HAVE TO BE REACHED ANOTHER WAY.** Raising
 * the bake's chunk amplitude would work and is forbidden here for a good reason: that ORM alpha
 * is 'wall.sheet' PASS 78's own break field and 'mat.lath''s, and the scalar arm must not move.
 *
 * What a plate IS, as a field: a region over which the threshold offset is CONSTANT, so the
 * whole region crosses at once and the boundary steps from piece to piece. Every other term in
 * '_rrrOrder' is a smooth function of position, and a smooth threshold can only ever erode —
 * which is the scallop. '_bcell' is a hash of a warped integer lattice: constant inside a cell,
 * discontinuous at its walls, and the walls are the straight-ish edges of an irregular polygon
 * because the warp is nearly constant over one cell.
 *
 * ⚠️ **IT IS EVALUATED ONCE AT THE SURFACE AND HELD THROUGH THE MARCH, AND THAT IS PHYSICS
 * RATHER THAN A SAVING.** A plate is a piece of material WITH THICKNESS — its front face and its
 * back face belong to the same piece. Re-evaluating the lattice at each march offset would give
 * a column of independently-shaped laminae, which is the 2D-layers complaint again one scale
 * down. Holding it also means the whole term costs nine hashes per damaged fragment instead of
 * sixty-three.
 *
 * Default 0. Band 0 of a caller that does not ask, every scalar consumer and every studio view
 * emit exactly what they did.
 */
uniform float uPlate;        // amplitude of the per-cell constant, in threshold units
uniform vec2  uPlateScale;   // plates across the face, per axis
/**
 * 🌊 **ROUND 7, CAUSE 2: THE WHITE DID NOT END, IT FADED — AND THE FADE IS THIS FILE'S OWN LIP
 * PROFILE, NOT THE GLOW.**
 *
 * Round 6's rank-2 defect: *"the white rim's OUTER edge fades into the brown. A fading edge is a
 * wet shore; broken plaster is hard."* The outermost white in the picture is not the cut face and
 * is not the band colour — outside the part-eaten band both of those are identically zero. It is
 * the LIP, and the lip is
 *
 *     _lip = 1 - smoothstep(_dmgB, _dmgB + _lw, _order)
 *
 * i.e. a smoothstep whose derivative is ZERO AT BOTH ENDS. So the plaster colour is at full
 * strength only in a hairline at the tear itself and spends the whole rest of the band — 0.062 of
 * threshold, and 1.8x that where the width noise is high — dying away into the boiserie. **A
 * cubic tail is the exact shape of a shoreline**, and it is being drawn between the two loudest
 * colours in the frame.
 *
 * 'uLipEnd' is the fraction of the lip's own width the fall is allowed to take: the plaster holds
 * full value across the rest and then STOPS. Two things fall out and both are wanted:
 *
 *   · the outer boundary becomes an EDGE, so the reader gets a material break where they were
 *     getting a gradient;
 *   · the lip's width variation becomes VISIBLE. '_lw' already swings 0.34x - 1.80x on ~31 cm
 *     features (round 6 built that to kill the bevel) and the cubic tail was averaging it away;
 *     at full value the rim is now plainly fat in some places and hairline in others, which is
 *     the other half of "not a travertine rim".
 *
 * ⚠️ **THE UNDERCUT KEEPS THE SMOOTH PROFILE, AND THAT IS NOT TIDINESS.** '_rim' is
 * 'smoothstep(0.52, 1.0, _lip)' — it selects the INNERMOST sliver of the lip, the bit that
 * overhangs its own broken back, and darkens it by 'uRimDark' (0.58 on the skin). Fed the
 * hardened profile it would select the WHOLE band, because the whole band is now 1.0, and would
 * multiply the entire white rim by 0.42 — i.e. the one cue the reference is loudest about would
 * come out grey. So the hardening applies to the plaster COLOUR and the undercut goes on reading
 * the original ramp, which still describes where the sliver is.
 *
 * ⚠️ **DAMAGE ARM ONLY, AND 0 IS EXACTLY THE OLD CURVE.** Declared in DAMAGE_PARS and branched
 * on, so 'SCALAR_MAP' is untouched text and 'wall.sheet' PASS 78, 'wall.*', 'mat.*', the four
 * studio stage views and 'wallinstances.js''s copies emit the bytes they were scored with.
 */
uniform float uLipEnd;
uniform float uCutSoft;      // threshold width the slab is eaten through over = the CUT FACE
uniform float uCutDepth;     // this layer's own thickness, in metres
uniform float uCutDark;
uniform float uCutNorm;
uniform vec3  uCutColor;
/**
 * ROUND 2's HEADLINE. Each depth band's OWN material colour, and how far the layer's baked
 * albedo is carried toward it.
 *
 * critic-dig-1, having cropped a hole out of context, could not identify it as a hole in a
 * wall: "it's being asked to imply depth through blur alone, which can't work without
 * per-layer albedo." Round 1 gave the cut real geometry, a real march and real normals, and
 * then shaded every one of the four bands with the SAME mid grey (uCutColor 0.505/0.487/0.450
 * for all four, uLipColor 0.42/0.40/0.365 for all four), so a hole came out as one continuous
 * hue — the wall's own colour, lightened. There was nothing for the depth cues to reveal.
 *
 * John's art solves thickness as a COLOUR problem: a crisp jagged WHITE plaster rim directly
 * against a SATURATED FLAT TEAL fill, a hard material break with no ambiguity. So the four
 * bands are now three named materials that look nothing like one another —
 *
 *   band 0  ornate boiserie   untinted (uBandTint 0): it IS the estate's own wall
 *   band 1  white paneling    carried hard to flat white — "white chunks fall off"
 *   band 2  structure, outer  carried to teal, meeting the barrier's hue
 *   band 3  structure, inner  deeper teal, so the last thing before the cyan is already cyan
 *
 * ⚠️ **IT TINTS, IT DOES NOT PAINT.** A straight mix to a flat colour deletes the trowel
 * work, the grain and the crazing that three rounds of 'wallstages.js' authored, and a flat
 * field is the most reliable way to make a surface read as a missing texture. So the target is
 * the band colour MODULATED BY THE SOURCE TEXEL'S OWN LUMA: the hue and saturation come from
 * the band, every bit of spatial detail comes from the bake.
 *
 * ⚠️ **DAMAGE ARM ONLY.** It is declared inside DAMAGE_PARS, so 'wall.sheet' PASS 78 and every
 * scalar consumer emit the same bytes they always did.
 */
uniform vec3  uBandColor;
uniform float uBandTint;
/**
 * 🔴 **ROUND 3, RANK 1: HOW MUCH OF THE BAKE'S OWN LUMA SURVIVES THE TINT — AND FOR THE TEAL
 * CORE THE ANSWER IS "ALMOST NONE".**
 *
 * Round 2 hard-coded the modulation as '0.58 + luma * 0.86', on the reasoning quoted above that
 * a dead-flat field reads as a missing texture. That reasoning is right for the ORNATE and the
 * WHITE, and it is measurably wrong for the structure: bands 2 and 3 were drawn with the lath
 * and framing bakes, whose luma is a horizontal course pattern, so tinting them teal produced a
 * SATURATED TEAL CORRUGATION. 'critic-dig-2' measured it — a scanline through the teal at y=220
 * swinging luminance 30 <-> 152 every 20-40 px — and read it as *"horizontal strips peeling off
 * a flat plane"*, which is John's original 2D-layers complaint relocated one material inward.
 *
 * ⚠️ **AND EVERY REFERENCE IMAGE DISAGREES WITH THE PREMISE.** Across all eight images in
 * 'refs/_sheets/dig.png', including the cross-sections in 'dig-barrier-stages.webp', the cyan is
 * a FLAT, SMOOTH, TEXTURELESS SOLID SLAB. There is no structural framing inside it anywhere. The
 * stillness of that one surface is what makes it read as an answer rather than as more wall.
 *
 * So the constant and the gain are uniforms. Defaults reproduce round 2 exactly, so band 0 and
 * band 1 are byte-identical; the teal bands run base ~0.96 / detail ~0.08, i.e. flat.
 */
uniform float uBandBase;
uniform float uBandDetail;
/**
 * 🔴 **ROUND 4, DEFECT 1: FLAT WAS NECESSARY AND IS NOT SUFFICIENT, AND THAT IS MEASURED.**
 *
 * Round 3 bet that killing the corrugation would buy the identification gate. It did not:
 * 'critic-dig-3' got *"an aerial photo of a lagoon or tide pool"* from THREE OF FOUR blind
 * readers — one confident, convergent wrong answer where round 2 had three disagreeing ones.
 * A dead-flat, bright, uniform teal field IS a body of water; the corrugation was never what
 * made it one.
 *
 * ⚠️ **AND THE FIX IS NOT THE RIBBING COMING BACK.** What a solid slab has and a water surface
 * does not is large-scale, NON-PERIODIC unevenness — casting shade, dirt, the shallow relief of
 * a poured face — at a scale far coarser than the 20-40 px corrugation round 3 deleted. So this
 * is three octaves of value noise measured in METRES on the face (0.32 / 0.77 / 1.8 m, the
 * middle one stretched 4:1 vertically so the smudging runs DOWNWARD, which is the one thing an
 * aerial photograph of water can never do), at an amplitude low enough that a scanline across
 * it stays inside a few per cent. Nothing here repeats: the coarsest octave is under four
 * cycles across a 5.72 m face, so there is no second period for an eye to lock onto.
 *
 * ⚠️ **IT MULTIPLIES THE EMISSIVE TOO, AND IT HAS TO.** The band's emissive is the term that
 * holds the hue against a warm key (see uBandEmissive), and it is constant — so modulating only
 * the albedo would have the emissive flatten the variation straight back out inside the recess,
 * which is exactly the part of the crater the reader is looking at.
 *
 * Default 0: band 0, band 1 and every scalar consumer emit what they always did.
 */
uniform float uSlabMottle;
/**
 * ⚠️ **A CAVITY IS UNLIT, AND AN UNLIT WHITE WALL IS A GREY WALL.**
 *
 * The estate's rooms are dim and WARM. Round 2's first build gave band 1 an albedo of 0.90 and
 * it photographed as mid grey, and gave bands 2 and 3 a teal albedo that photographed as
 * lavender — because albedo is only half of what a colour is on screen, and the other half is a
 * low-intensity orange key light raking across a recess that has no light in it at all.
 *
 * So each band carries a small emissive of its own hue, gated on how far the DIG has gone at
 * this texel: exactly zero on standing wall, rising to full inside the crater. It is the same
 * argument the barrier plane already makes for itself one layer further back (structure you can
 * see into a dark hole), it costs no light and no extra pass, and it is what stops the whole
 * effect from depending on where a lamp happens to be in the room the player dug from.
 */
uniform vec3  uBandEmissive;
/**
 * 💡 **ROUND 6: THE BREACH THROWS LIGHT. IT IS THE THIRD THING THE REFERENCE HAS AT THE EDGE AND
 * THE ONLY ONE WE HAD NONE OF.**
 *
 * 'critic-dig-4' tabulated the edge three ways against 'dig-gallery-sledge-crew.webp' and we
 * scored nothing on the third row: *"the edge: a soft cyan-tinted GLOW bleeding onto the adjacent
 * white — ours: none."* In the reference the plaster for a foot or so around the tear is visibly
 * cooler than the wall further out, because there is a metre-wide emissive cyan slab sitting a
 * hand's width behind it. It is bounce, not decoration.
 *
 * ⚠️ **IT IS THE ONE THING IN THIS ROUND ALLOWED TO BE A COLOUR, AND ONLY BECAUSE IT WAS ASKED
 * FOR BY NAME.** The brief is explicit that THICKNESS is a silhouette problem and must not be
 * solved with albedo, tint or emissive again — all three have been tried and scored. This is not
 * that: it does not touch the shell's value step, its cut face or its rim, and it is a term the
 * critic listed as MISSING rather than as wrong.
 *
 * ⚠️ **ON THE EMISSIVE, NOT THE ALBEDO, AND THAT IS FORCED.** A cavity is unlit (see
 * uBandEmissive for the same argument at full length), so an albedo tint inside the crater is
 * multiplied by almost no light and comes back as nothing exactly where the bounce is strongest.
 *
 * Driven by the layer's OWN '_dmgB', which is the one quantity that already falls off with
 * distance from the hole in every direction at once: on the surviving white rim it runs from
 * nearly 1 at the cyan boundary down to 0 where the shell is untouched, and on the ornate skin it
 * paints a soft halo on wall that is still standing. Default 0, so the scalar arm, band 0 of any
 * caller that does not ask for it, and every studio view are untouched.
 */
uniform vec3  uGlow;
/**
 * 🧱 **ROUND 9: THE CUT EDGE GETS A CROSS-SECTION — TWO FACES, NOT ONE PAINTED BAND.**
 *
 * John's bar quote is *"the cyan wall should also look thick."* Eight rounds gave the break a
 * SHAPE; none gave it VOLUME. 'critic-dig-5', zoomed on the delivered PNGs: *"the reference
 * chunks show a TOP FACE and a SIDE FACE at the break — ours is a near-constant-width painted
 * band with one dark line doing AO duty."*
 *
 * Three separate things were making that true, and only the third of them is a taste question:
 *
 *   1. 🚨 **THE CUT FACE'S NORMAL POINTED THE WRONG WAY, AND IT HAS SINCE ROUND 1.** The old
 *      expression is 'normalize(_N * 0.42 - (_T * _dir.x + _Bt * _dir.y))', i.e. object-space
 *      '(-dir.xy, 0.42)' where '_dir' is the unit gradient of the DUG DEPTH. **A crater is
 *      concave, so its wall's outward normal leans TOWARD the deepest point, not away from it.**
 *      Take the simplest case, a V-groove 'depth = |x|': the surface for x > 0 is the plane
 *      z = -x, whose outward normal is proportional to (+1, 0, +1) — and grad(depth) there is
 *      (+1, 0). In-plane the normal is '+grad', not '-grad'. Every section in this piece has
 *      therefore been lit as if its face were turned away from the cavity it belongs to, which
 *      inverts the one cue that separates a soffit from a sill and flattens the whole annulus to
 *      one value. Fixed, not gated: there is no reading under which the old sign is the wanted
 *      one, and the scalar arm cannot reach this code.
 *   2. 🧩 **THE NORMAL CAME FROM THE DEPTH FIELD ALONE, WHICH IS A SMOOTH DISC.** The brush is a
 *      disc, so 'grad(depth)' is very nearly radial everywhere — meaning every tooth, notch and
 *      plate around the rim was shaded with the SAME slowly-rotating normal as its neighbours.
 *      That is the definition of "a jagged 2D silhouette standing in for volume": the outline is
 *      broken, the shading under it is not. 'uFacet' mixes in the direction of '-grad(_order)' —
 *      the break-order field including the plate lattice — so each plate's section carries its
 *      own orientation and the rim becomes facets instead of a ribbon.
 *   3. 💡 **A CAVITY IS NOT LIT EVENLY AND THE SECTION HAD NO TERM THAT KNEW IT.** In a hole in a
 *      vertical wall the SILL (the section at the bottom, facing up) sees the room's whole upper
 *      hemisphere, the JAMBS (facing sideways) see about half of it, and the SOFFIT (the section
 *      at the top, facing down) sees the floor and is shadowed from above. That ordering is the
 *      reference's "top face and side face" — you read volume because the facets DISAGREE about
 *      how bright they are. 'uSecLift' is how far that ordering is pushed.
 *
 * ⚠️ **NONE OF THIS TOUCHES THE CYAN, AND THAT IS DELIBERATE.** John's settled requirement is
 * that the barrier never appears to take damage; 'barrierMaterial' is not modified by this round
 * at all. Every term here is on the WHITE SHELL's own cut face — the destructible material —
 * and 'uSecLift' is a function of a facet's ORIENTATION, which is a property of geometry and not
 * of how far anyone has dug.
 *
 * ⚠️ Defaults 0 / identity, and all three live in DAMAGE_PARS, so band 0 of a caller that does
 * not ask, every scalar consumer and every studio view emit exactly what they did.
 */
/**
 * ⚠️ **THE SIGN, AS AN ABLATION ARM RATHER THAN AS AN ASSERTION.** +1 is the correction argued
 * for above; **-1 reproduces rounds 1-8 exactly**, so the claim "the cut face was lit as if it
 * faced away from its own cavity" is falsifiable in one page on one crater instead of being a
 * paragraph of geometry nobody can check. It ships at +1.
 */
uniform float uSecSign;
uniform float uFacet;        // 0 = the smooth depth disc, 1 = the broken boundary's own direction
uniform float uSecStep;      // metres, the finite difference the facet direction is taken over
uniform float uSecLift;      // sill/jamb/soffit spread, as a fraction of the section's value
/**
 * 🔴 **ROUND 9, DEFECT 2: THE WHITE RIM PINCHES TO A NEAR-HAIRLINE AT THE SHARPEST NOTCHES.**
 *
 * ⚠️ **THE STYLE QUESTION IS ALREADY RULED ON AND THIS IS NOT IT.** 'critic-dig-5' called the
 * hard variable edge *"the more honest of the two"*, so round 8's edge stays; what is wrong is a
 * MAGNITUDE. The lip's width '_lw' is measured in THRESHOLD units, and the width you actually
 * see is '_lw / |grad(_order - _dmgB)|' — so wherever the order field is steep, which is exactly
 * where the plate lattice puts a sharp notch, the white band collapses to a couple of pixels
 * however fat '_lw' is. It is a projection artefact of the parameterisation, not a design.
 *
 * 'uRimFloor' is a MINIMUM WIDTH IN PIXELS: the effective lip width is raised until the band is
 * at least that wide on screen, and the raise is capped at 2.4x so a plate wall's discontinuous
 * derivative can only ever fatten the corner, never bloom. Where the contour is shallow the floor
 * is below '_lw' and nothing at all changes, so round 6's 0.34x-1.80x width VARIATION — the
 * "not a travertine rim" fix — survives everywhere it was already visible.
 *
 * ⚠️ The derivative is taken at the TOP of the patch body, in uniform control flow and before the
 * march's discard. Derivatives across a discarded neighbour are undefined in GLSL ES, and this
 * one would be taken on the exact fragments that discard most often.
 */
uniform float uRimFloor;     // minimum white-rim width, in pixels. 0 = the old behaviour exactly
/**
 * 🐞 **ROUND 9: THE ISLAND'S ACTUAL CAUSE IS THE CLAMP'S TOP, AND THE SPENT RAMP CANNOT REACH
 * IT WITHOUT EATING THE TEETH. THE ARITHMETIC, BEFORE THE FIX:**
 *
 *   The teal boundary is where the shell is fully gone, i.e. 'b > _order + uCutSoft/2'. With
 *   '_order' averaging 0.5 that is 'b ~ 0.52', and the ragged band either side of it spans
 *   'b' roughly 0.15 to 0.85 — that whole range is TEETH and must not move. An ISLAND is a texel
 *   whose '_order' has PINNED AT THE CLAMP'S CEILING, so it needs 'b ~ 0.98' before the softened
 *   comparison can remove it. **Any 'uSpent' foot low enough to catch an island at b 0.6 is
 *   inside the teeth.** Round 9's first build set [0.72, 0.96], which ate a third of the deepest
 *   teeth AND left the island standing — the worst of both, measured on the delivered frame.
 *
 * So the top of '_rrrOrder' gets a KNEE. Below 'uOrderTop' nothing changes at all; above it the
 * value is compressed asymptotically toward 1.0 and never reaches it, so a blob of over-strong
 * break order keeps an internal ordering — highest in the middle, lower at its edge — and the
 * dig eats it from the outside in like every other piece of plaster, instead of surviving whole
 * because its whole interior sat at one flat ceiling value.
 *
 * ⚠️ **THE BOTTOM CLAMP IS UNTOUCHED, AND THAT IS THE POINT.** Round 6 raised 'uOrderGain'
 * 2.8 -> 3.5 precisely so more of the field would SATURATE, because a saturated region crosses
 * the threshold as one piece and that is what puts flat runs and hard corners in the outline
 * instead of a smooth curve. That mechanism is the LOW side — material that gives way early,
 * together — and it still hard-clamps at 0. Only the high side, which is material that never
 * gives way at all, is softened. 'critic-dig-5' logged the outline as done; this cannot move it.
 *
 * ⚠️ 'uOrderTop >= 1' is the old hard clamp to the bit, and it is the default.
 */
uniform float uOrderTop;
uniform vec2  uSpent;        // see _rrrSpent: [foot, top] of the whole-band-dug-out ramp
/**
 * 🐞 **ROUND 10: THE MARCH'S OWN NEAR-TANGENT CLAMP, AS AN ARM.** Round 9 named this the one
 * untested island candidate and could not test it because it was a literal. It is the cap on
 * how far, ACROSS the face, one march step is allowed to reach: the step offset is
 * '-_par * (_s * uCutDepth)' and 'uCutDepth' is a layer thickness in metres, so a clamp of 8
 * lets a fragment sample material up to '8 * uCutDepth' face-widths away -- on layer 3 of a
 * 5.72 m span that is 1.78 m, and any sample that comes back as material KEEPS the fragment.
 *
 * The cap only binds at a genuinely near-tangent ray (8 is reached at about 88 degrees off the
 * normal on a 5.72 m face), so lowering it is not free and not obviously right: it is what
 * stops a ray that is nearly in the plane of the wall from marching clean across the crater.
 * Shipped at the old literal so this file is byte-identical in behaviour until an arm moves it.
 */
uniform float uParMax;
/**
 * 🧱 **ROUND 10, ITEM 1: THE WALL HAS A CYAN CORE AND THE SECTION NEVER SHOWED IT.**
 *
 * 'critic-dig-6': *"even the most schematic bar image renders the cyan structure as an extruded
 * block with a lit top face and a darker shaded side face -- visible volume. Nothing in our
 * render shows that; the cyan is a flat single RGB value in every frame sampled."* And John's
 * bar quote is *"the cyan wall should also look thick."*
 *
 * ⚠️ **THE BARRIER PLANE CANNOT OWN THIS EDGE, AND THAT IS A MEASURED CONSTRAINT RATHER THAN A
 * PREFERENCE.** The visible cyan boundary is an OCCLUSION boundary: it is where the white
 * shell's alpha test stopped, which the barrier's own shader cannot compute -- it has the
 * smoothed depth and the G channel and no break-order field at all. Any contour it drew itself
 * would be a SECOND ragged boundary a few centimetres off the shell's, which is exactly the
 * "coastline" round 5 deleted to earn John his indestructible slab. So the cyan's thickness has
 * to be drawn by the material that owns the cut: the shell.
 *
 * And that is what the reference actually draws. 'refs/dig/dig-barrier-stages.webp', stages 1
 * and 2, shows the wall END-ON: a white facing, then a TEAL CORE, in section. The shell is not
 * white all the way to the back of the wall band -- the last slice of it is the structure.
 *
 * So the innermost layer's marched section gets its back slice painted in the core's own colour,
 * as a HARD STEP on the march parameter (not a ramp: 'step', so the value is flat right up to
 * the edge and flat after it), and that slice takes **one of exactly two constants** chosen by a
 * hard step on the section's world-up component:
 *
 *     _secUp above the step   the slab's TOP face, turned up into the room   -> the LIT value
 *     otherwise               its SIDE face and its soffit                   -> the SHADED value
 *
 * ⚠️ **IT CANNOT VARY WITH DIG DEPTH AND THAT IS BY CONSTRUCTION.** The width is a fraction of
 * the LAYER'S OWN THICKNESS, read off the march, so it is the same slice of the same slab at one
 * blow and at a hundred; the two values are constants; and the choice between them is a property
 * of which way a facet points. Nothing here reads the damage field except through the march that
 * was already there. The BARRIER material is not touched by this round at all -- the fill you
 * see through the hole is the same flat value it was, which is John's settled requirement.
 *
 * ⚠️ Default 0, so band 0, the scalar arm and every studio view emit exactly what they did.
 */
uniform float uCore;         // fraction of THIS layer's thickness, at its back, that is core
uniform vec3  uCoreCol;      // the core's albedo, on the shaded side/soffit faces
uniform vec3  uCoreEmis;     // the core's emissive -- a cavity is unlit and the slab is emissive
uniform float uCoreTopK;     // how much brighter the LIT top face is. 1.0 = one value, i.e. off
uniform float uCoreUp;       // the world-up component at which a facet counts as a top face
uniform vec2  uFaceSize;     // metres, so a depth in metres becomes an offset in uv
varying vec2 vDmgUv;
varying vec3 vDmgView;       // object-space fragment -> camera. +z is out into the room.
varying vec3 vDmgT;          // view-space tangent along the face's local +x

// Derivatives of the map uv, taken ONCE in main before any of the marching. A texture fetch
// inside non-uniform control flow has undefined derivatives in GLSL ES, and the march below is
// exactly that — so every fetch in it is a textureGrad with these.
vec2 _bgDx, _bgDy;
// see uPlate: the plate lattice's offset at THIS fragment, evaluated once in main and held for
// every march step, because a plate is one piece of material through its own thickness.
float _bgPlate;

/**
 * A per-cell CONSTANT over a warped integer lattice. Constant inside a cell, discontinuous at
 * its walls. The warp is sampled at half the lattice frequency, so it is nearly uniform over one
 * cell and therefore TRANSLATES cells rather than curving their edges — irregular polygons with
 * straight-ish walls, which is the shape a plaster plate snaps into.
 */
float _bcell(vec2 p){
  vec2 w = vec2(_bnoise(p * 0.53 + 7.0), _bnoise(p.yx * 0.53 + 29.0)) - 0.5;
  return _bhash(floor(p + w * 1.15) + 0.5);
}

/**
 * The plate lattice's threshold offset at an arbitrary uv. **Factored out of the patch body
 * because the FACET DIRECTION has to differ it** — '_bgPlate' is deliberately held constant
 * through the march (a plate is one piece of material through its own thickness), so a finite
 * difference that reused it would see a perfectly smooth field and the plates would be exactly
 * the structure that could not reach the shading. See uFacet. Identical arithmetic to the
 * assignment it replaces, so a face with 'uPlate' 0 is unchanged and pays one compare.
 */
float _rrrPlate(vec2 muv){
  if (uPlate <= 0.0001) return 0.0;
  return ((_bcell(muv * uPlateScale) - 0.5) * 0.64
        + (_bcell(muv * uPlateScale * 2.35 + 19.0) - 0.5) * 0.36) * uPlate;
}

/**
 * 🚨 **FOUR HALF-CELL TAPS, NOT ONE, AND THE STAIRCASE IS WHY.**
 *
 * The damage grid is 61 x 30 over a 5.72 m face — a 9.4 cm cell — and it is sampled with
 * LINEAR filtering, which is smooth but is NOT smooth in its iso-contours: a bilinear patch's
 * level sets are hyperbolae that kink at every cell boundary, so a threshold across it comes out
 * as axis-aligned rectangular steps with 45-degree corners. Measured by looking: the first build
 * of this round traded the old scallop lobes for a visible 9 cm STAIRCASE on the plaster layer,
 * which is a worse defect than the one it fixed because it reads as a broken texture rather than
 * as soft art. A tent over half a cell removes the kink for four fetches of a 7 kB texture that
 * never leaves cache.
 */
float _rrrDepth(vec2 duv){
  vec2 h = uDmgStep * 0.5;                 // one cell out, diagonally
  return 0.36 * textureLod(tDamage, duv, 0.0).b
       + 0.16 * (textureLod(tDamage, duv + vec2( h.x,  h.y), 0.0).b
               + textureLod(tDamage, duv + vec2(-h.x,  h.y), 0.0).b
               + textureLod(tDamage, duv + vec2(-h.x, -h.y), 0.0).b
               + textureLod(tDamage, duv + vec2( h.x, -h.y), 0.0).b);
}

/**
 * A share of the dug depth at a uv, against an arbitrary band. 0 = untouched, 1 = spent.
 * ⚠️ Factored out for 'uLitBand' — see there. '_rrrBand' below is the identical arithmetic
 * against the layer's own band and is what every existing call site still uses.
 */
float _rrrBandIn(vec2 duv, vec2 bnd){
  return clamp((_rrrDepth(duv) - bnd.x) / max(1e-4, bnd.y - bnd.x), 0.0, 1.0);
}

/** This layer's share of the dug depth at a uv. 0 = untouched, 1 = the layer's band is spent. */
float _rrrBand(vec2 duv){
  return _rrrBandIn(duv, uDmgBand);
}

/**
 * 🚨 **THE BREAK-ORDER FIELD, HIGH-PASSED — AND THIS IS THE FIX FOR THE SCALLOPED SILHOUETTE.**
 *
 * 'wallstages.js' 'breakOrderField' is 'radial * 0.72 + billow * 0.34 + fine * 0.16 + crumble',
 * and the radial ramp is measured from a fixed origin at the middle of the TILE. In the scalar
 * system that is exactly right: a panel breaks outward from its own centre, and the ramp IS the
 * hole. Driven positionally it is a disaster, and in two separate ways:
 *
 *   1. **The hole's outline is a level set of the ramp, not of the dig.** The discard boundary
 *      is where 'order == threshold', and with a smooth ramp dominating the field at 0.72 of
 *      the range that level set is a circular arc about the middle of the face, perturbed —
 *      which is precisely the *"smooth rounded cloud/scallop lobes"* the old 'PLAN.md' Phase 3
 *      recorded and which free-form digging promoted from a background flaw to the most
 *      looked-at surface in the game.
 *   2. **The corners of a 5.72 m face are saturated and cannot break at all.** At the far corner
 *      radial alone reaches ~0.93 and the field is 'clamp(…, 0, 1)', so 'order' is pinned at
 *      1.0 over a large region — and the test is 'order < threshold' with the threshold reaching
 *      at most 1.0. Material there is undiggable no matter how long you swing at it.
 *
 * Subtracting the field's own local mean removes the ramp, the billow and every other structure
 * coarser than the mip's footprint, and leaves the crumble — the chunks, fissures and lath
 * courses that 'wallstages.js' spent two rounds authoring and that carry the edge quality.
 * **It fixes both defects with one texture fetch and no second bake**, because the local mean
 * is what a mip level IS. Saturated corners come back too: where 'order' is pinned at 1.0 the
 * mean is also 1.0, so the residual is 0 and the texel sits at the middle of the range.
 *
 * ⚠️ **THE SCALAR ARM NEVER SEES THIS.** 'wall.sheet' PASS 78 and every studio view drive
 * 'uBreak' as a uniform, where the radial ramp is the mechanism and must not be touched.
 */
float _rrrOrder(vec2 muv, float low){
  // see uOrderHi: the high-pass needs a top stop or the silhouette wanders further than the
  // slab is thick over less than the slab's thickness of travel, and no section can survive it.
  float hi = mix(textureGrad(tBreakField, muv, _bgDx, _bgDy).a,
                 textureLod(tBreakField, muv, uOrderHi).a, uOrderSoft);
  // ⚠️ ONE MID-SCALE OCTAVE, INSIDE THE MARCH, AND IT IS NOT DECORATION. The residual above
  // carries the crumble's 40 cm chunks and its 3 cm fissures but comparatively little at the
  // 10-25 cm scale — which is exactly the scale of the damage grid's own cell structure, so
  // without a term here the hole's outline follows the grid instead of the material. It is
  // evaluated per march step (the fine octaves are not) because the outline that matters at a
  // grazing angle is where the ray EXITS, deep in the slab, not where it entered.
  // ⚠️ TWO octaves, and the scales are chosen against the CELL, not against the material: 0.30
  // and 0.85 of the jag scale are ~17 cm and ~6 cm on a 5.72 m face, which brackets the damage
  // grid's 9.4 cm. The residual above carries 40 cm chunks and 3 cm fissures and has almost
  // nothing in between — measured by looking, and the gap is exactly where the grid lives.
  //
  // 🔴 **ROUND 6 ADDS A THIRD, AND IT IS THE COARSEST TERM IN THE WHOLE SILHOUETTE.** The
  // high-pass above subtracts a HALF-METRE local mean (uOrderLod), so by construction the order
  // field has NOTHING above ~54 cm — and the damage field's own contours are circles, because a
  // brush is a disc. Between them there was no term anywhere in the system that could make the
  // hole's GROSS OUTLINE anything but round, and round is what the first build of this round
  // photographed: a smooth oval that reads as a mirror. 0.11 of the jag scale is ~1.5 m on a
  // 5.72 m face — under four cycles across the whole face, so it lobes the outline without
  // repeating — and it carries the largest share, because the outline's shape matters more to
  // the read than its crumb does. The reference's breach is tall, lumpy and asymmetric; this is
  // the only term that can produce that.
  float n = _bnoise(muv * uJagScale * 0.11 + 71.0) * 0.44
          + _bnoise(muv * uJagScale * 0.30 + 3.0) * 0.35
          + _bnoise(muv * uJagScale * 0.85 + 41.0) * 0.21;
  // see uPlate. Added OUTSIDE the smooth terms and inside the same clamp, so where a plate's
  // constant pushes a whole cell past the threshold the cell goes as one piece and the boundary
  // steps along its wall instead of curving through it.
  float v = 0.5 + (hi - low) * uOrderGain + (n - 0.5) * uJag * 3.2 + _bgPlate;
  // see uOrderTop. The low side keeps its hard clamp — that is round 6's plate mechanism — and
  // the high side gets a knee so a saturated blob cannot become a permanent island.
  v = max(v, 0.0);
  if (uOrderTop < 0.9999 && v > uOrderTop) {
    float h = 1.0 - uOrderTop;
    v = uOrderTop + h * (1.0 - exp(-(v - uOrderTop) / max(h, 1e-4)));
  }
  return min(v, 1.0);
}

/**
 * 🧩 **THE BROKEN BOUNDARY'S OWN IN-PLANE DIRECTION — see uFacet.**
 *
 * The dug depth is a disc, so its gradient is radial and shades every tooth round the rim the
 * same way. The thing that is actually broken is '_order', and the direction the material falls
 * away at a plate wall is '-grad(_order)'. Four taps, one plate evaluation each, at a step in
 * METRES so the same face reads the same whether it is 2.56 m or 5.72 m wide.
 *
 * ⚠️ **'_bgPlate' IS SAVED AND RESTORED AROUND THE TAPS.** It is a global held for the whole
 * march on purpose; borrowing it here is what lets the lattice into the gradient, and leaving it
 * borrowed would put a neighbour's plate constant into the fragment's own cut face.
 *
 * ⚠️ Called only from a fragment that already has a section on it ('_cf > 0.002'), and only
 * when a caller asks for facets. That is a couple of per cent of a frame at a graze.
 */
vec2 _rrrOrderGrad(vec2 muv, float low){
  vec2 ex = vec2(uSecStep / max(uFaceSize.x, 1e-3), 0.0);
  vec2 ey = vec2(0.0, uSecStep / max(uFaceSize.y, 1e-3));
  float keep = _bgPlate;
  _bgPlate = _rrrPlate(muv + ex); float xp = _rrrOrder(muv + ex, low);
  _bgPlate = _rrrPlate(muv - ex); float xm = _rrrOrder(muv - ex, low);
  _bgPlate = _rrrPlate(muv + ey); float yp = _rrrOrder(muv + ey, low);
  _bgPlate = _rrrPlate(muv - ey); float ym = _rrrOrder(muv - ey, low);
  _bgPlate = keep;
  return vec2(xp - xm, yp - ym);
}

/**
 * 🚨 **ROUND 4, DEFECT 1: THE ISLANDS IN THE MIDDLE OF THE HOLE, AND THEY ARE A CLAMP BUG.**
 *
 * 'critic-dig-3' cropped the crater blind, got *"an aerial photo of a lagoon with small
 * islands"* from three of four readers, and named the cause as *"the new core DEBRIS CHUNKS
 * resting on that field like islets"*. **That attribution is wrong and it was checked before
 * anything was changed.** The two blobs in 'thick-9' and 'thick-16' are not meshes: they carry
 * the layer plane's own dithered alpha-test fringe, they are painted in band 1's tinted plaster
 * albedo (paper-remnant speckle and all), they sit in the same face-relative place in every
 * frame the crater appears in, and they cast no shadow. They are TEXELS OF THE WHITE SHELL that
 * the dig can never remove, and the mechanism is two clamps meeting:
 *
 *   '_rrrOrder' returns 'clamp(0.5 + residual * uOrderGain + noise, 0, 1)' with 'uOrderGain'
 *   2.8, so any texel whose high-passed break-order residual exceeds ~0.18 PINS AT 1.0 —
 *   and '_rrrBand' is 'clamp(...)' too, so the dug depth can never push past 1.0 to beat it.
 *   At 'b == order == 1' the softened comparison returns exactly 0.5: half-eaten, forever.
 *   The surface's extra jag term is added AFTER the clamp, so a texel can even reach
 *   'order > 1' and come back fully INTACT in the middle of a hole dug to the barrier.
 *
 * ⚠️ **DAMAGE_MAP'S OWN COMMENT ALREADY FORBIDS THIS OUTCOME** — *"a 0.95 cap would leave
 * speckles of plaster floating in the middle of a hole you dug through"* — so this is the stated
 * design being restored, not a new rule. When the dig has spent this layer's WHOLE depth band at
 * a texel, the layer is gone at that texel, whatever its break order says.
 *
 * ⚠️ It is a 'max', so it can only ever REMOVE material, never grow it back, and it is identity
 * everywhere below the ramp's foot — which is the entire rim, where the ragged order-driven
 * silhouette lives and must not move. Ramped rather than switched, so the islands dissolve
 * across a few centimetres of crater wall instead of popping at a contour.
 *
 * 🐞 **ROUND 9: THE RAMP IS A UNIFORM NOW AND IT STILL SHIPS AT [0.90, 1.00], BECAUSE LOWERING
 * IT IS REFUTED — THIS IS THE THIRD ROUND TO MIS-ATTRIBUTE THE WHITE ISLAND.**
 *
 * Round 4 blamed two clamps meeting; round 8 blamed this ramp and did not apply the fix; round
 * 9's brief carried the same instruction (*"lower it — one line, in a file you own"*). **Five
 * arms, one page, one crater, sweeping the foot:**
 *
 *   | foot | island px | outline curvature, head-on |
 *   |---|---|---|
 *   | 0.90 (shipped) | 1130 | 2.08 px |
 *   | 0.62 | 1109 | 2.15 px |
 *   | 0.42 | 1033 | 2.11 px |
 *   | 0.25 | 726 | **1.49 px** |
 *   | 0.02 | **0** | **0.99 px** |
 *
 * The island only goes when the ramp has taken the TEETH with it — curvature is the raggedness
 * 'critic-dig-5' logged as correct and closed. There is no foot that removes one without the
 * other, because both are the same quantity: material the dig has not paid for at this texel.
 *
 * ⚠️ **AND THE OTHER TWO CANDIDATES THIS ROUND BUILT AND TESTED ARE ALSO REFUTED**, so the next
 * round need not re-derive them: a soft knee on '_rrrOrder''s top clamp ('uOrderTop', kept at 1)
 * moved the blob by 4 px; a grayscale closing of the depth field ('damagefield.js' '_shed()',
 * kept at 'SHED_R' 0) found ZERO pits at every ring radius from 2 to 6 cells; hiding every debris
 * pool moved it by 1 px. **The one candidate nobody has tested is the march's own '_par' clamp of
 * 8** — see 'damagefield.js' '_shed()' for the full elimination table and the one-arm test.
 */
float _rrrSpent(float b){
  return smoothstep(uSpent.x, uSpent.y, b);
}

/**
 * The slab's own large-scale unevenness, centred on 0. See uSlabMottle. Argument is the face
 * position in METRES, so the feature sizes below are real sizes on a real wall and do not
 * change when a span does.
 */
float _rrrSlabVar(vec2 m){
  return _bnoise(m * 0.55 + 13.0) * 0.46
       + _bnoise(m * vec2(1.55, 0.38) + 61.0) * 0.32
       + _bnoise(m * 2.90 + 5.0) * 0.22 - 0.5;
}

/**
 * How far into this layer's own thickness the material has been eaten at a texel, 0..1.
 *
 * ⚠️ **THIS IS THE ONE LINE THAT GIVES THE CUT AN INSIDE.** The old test was binary — a texel's
 * whole slab was there or gone — which is a sheet of zero thickness however thick the wall is,
 * and is the mechanism behind *"a 2d mesh taking off layers"*. Softening the same comparison
 * over 'uCutSoft' turns the hard boundary into a RAMP OF REMAINING THICKNESS: 0 where the layer
 * is untouched, 1 where it is gone, and everything between is a real wedge of material with a
 * front face set back into the wall. At 'uCutSoft -> 0' it degenerates to exactly the old test,
 * and the old boundary is the middle of the new ramp, so the hole neither grows nor shrinks.
 */
float _rrrFront(vec2 muv, vec2 duv, float low){
  float b = _rrrBand(duv);
  /**
   * 🚨 **THE GATE ON b IS A CORRECTNESS FIX, NOT A TASTE ONE.** Softening the comparison
   * centres it: b == order is half-eaten. So on an UNTOUCHED texel (b == 0) any texel whose
   * order is under uCutSoft / 2 comes out partly eaten — a pre-broken patch of wall nobody
   * has hit, appearing wherever the high-passed field saturates at 0. The old binary test could
   * not have this bug (order < 0 is never true) and neither may this one. Ramping the whole
   * result to zero as the damage goes to zero is continuous, costs a smoothstep, and cannot
   * remove material the dig has not paid for.
   */
  return max(clamp((b - _rrrOrder(muv, low)) / uCutSoft + 0.5, 0.0, 1.0)
           * smoothstep(0.0, uCutSoft * 0.8, b),
             _rrrSpent(b));
}

/**
 * In-plane gradient of the dug depth — which way the cavity falls away.
 *
 * 🚨 **IT MUST DIFFERENCE THE TENT, NOT THE RAW SAMPLE, AND THIS WAS THE ROUND'S WORST DEFECT.**
 * The derivative of a BILINEARLY filtered field is piecewise constant across each cell in one
 * axis, so a finite difference of raw taps hands every damage cell a single flat normal — and
 * because that normal is what lights the cut face, the inside of every hole came out as a
 * MOSAIC of 9 cm rectangles at visibly different brightnesses. It reads as a broken texture, and
 * it was diagnosed by looking at the captures rather than by reasoning: the tiles were axis
 * aligned, one cell across, and present on the interconnect face where there is no barrier to
 * blame. Differencing '_rrrDepth' (a one-cell tent) gives a C1 gradient and the facets are gone.
 * The step is 3 cells rather than 2 for the same reason.
 */
vec2 _rrrGrad(vec2 duv){
  vec2 e = uDmgStep * 1.5;
  float xp = _rrrDepth(duv + vec2(e.x, 0.0));
  float xm = _rrrDepth(duv - vec2(e.x, 0.0));
  float yp = _rrrDepth(duv + vec2(0.0, e.y));
  float ym = _rrrDepth(duv - vec2(0.0, e.y));
  return vec2(xp - xm, yp - ym);
}
`;

/**
 * The threshold, per fragment, from the field.
 *
 * ⚠️ **THE BANDS ARE WHAT KEEPS THE LAYERS NESTED.** In the scalar system `applyStageBreaks`
 * gave each layer its own `uBreak` so the outer ones broke first and further. Here each layer
 * gets a SLICE of the depth axis instead: wallpaper is spent over the first third of the wall's
 * thickness, plaster over the next, and so on, with the slices overlapping so that at any depth
 * two adjacent layers are both partly broken and their torn edges stack. Same read, driven per
 * texel instead of per panel.
 *
 * ⚠️ It reaches exactly 1.0 at the top of the band, unlike the scalar version's 0.95 cap. The
 * cap existed so a passed layer left fragments behind to FRAME the hole — here the framing is
 * geometric rather than statistical, because the depth field falls off across the brush and
 * every layer's silhouette is still standing a few centimetres further out. A 0.95 cap would
 * instead leave speckles of plaster floating in the middle of a hole you dug through.
 */
const DAMAGE_MAP = /* glsl */ `
        _bgDx = dFdx(vMapUv);
        _bgDy = dFdy(vMapUv);
        // 🧩 THE PLATE LATTICE — see uPlate. Two scales: the piece that comes away whole, and
        // the pieces it snaps into on the way down. Zero unless the caller asks for it, and the
        // whole term is behind one branch so band 0 and every scalar consumer pay nothing.
        // ⚠️ The arithmetic moved into _rrrPlate unchanged, because the facet direction has to
        // be able to evaluate it at a neighbour — see _rrrOrderGrad.
        _bgPlate = _rrrPlate(vMapUv);
        float _lowA = textureLod(tBreakField, vMapUv, uOrderLod).a;
        float _order = _rrrOrder(vMapUv, _lowA);
        // The same two-octave fringe the scalar arm uses, but ungated: here the comparison it
        // used to be gated against moves per texel, and the noise is a property of the material
        // rather than of the threshold. It is applied at the SURFACE only — inside the march it
        // would cost twenty hashes a step to move the cut face by a couple of millimetres.
        if (uJag > 0.0001) {
          float _n = _bnoise(vMapUv * uJagScale) * 0.68
                   + _bnoise(vMapUv * uJagScale * 2.7 + 19.0) * 0.32;
          _order += (_n - 0.5) * uJag;
        }
        float _dmgB = _rrrBand(vDmgUv);
        // 💡 see uLitBand: how far into the BREACH this texel is, which for the innermost layer
        // is not the same question as how far through its own slab the dig has got. Identical to
        // _dmgB for every caller that does not ask, because the default band is the same band.
        float _dmgL = _rrrBandIn(vDmgUv, uLitBand);
        /**
         * 🔴 see uRimFloor. The signed distance to the tear, and HOW FAST IT MOVES PER PIXEL —
         * which is the conversion factor between the lip's width in threshold units and the
         * white band's width on screen. Taken here, in uniform control flow, because every
         * fragment reaches this line; taken after the march it would be differencing across
         * neighbours that have discarded, which is undefined.
         */
        float _sd = _order - _dmgB;
        float _sdG = (uRimFloor > 0.0001)
          ? length(vec2(dFdx(_sd), dFdy(_sd))) : 0.0;
        // see _rrrSpent: a layer whose whole depth band has been dug out at this texel is gone,
        // whatever its break order says. Without it the order field's saturated texels survive
        // as permanent ISLANDS in the middle of the crater — round 4's rank-1 defect.
        float _front = max(clamp((_dmgB - _order) / uCutSoft + 0.5, 0.0, 1.0)
                     * smoothstep(0.0, uCutSoft * 0.8, _dmgB), _rrrSpent(_dmgB));
        /**
         * 🧱 **THE MARCH — where the wall gets a side face, and it is the whole of the fix.**
         *
         * A fragment on an intact part of the surface ('_front <= 0') is shaded exactly as
         * before and pays nothing: no loop, no extra fetch. That is every texel of standing
         * wall, which is why this is affordable on a 5.72 x 2.80 m alpha-tested plane.
         *
         * Where the surface HAS been eaten, the view ray is walked back into the layer's own
         * thickness and the first depth at which it re-enters material is found. Three things
         * fall out of that and none of them can be had by shading a flat plane:
         *   - the cut face is REAL: it is where the ray stopped, so it slides with the camera
         *   - the near rim OCCLUDES the far cavity at a grazing angle, which is the single
         *     cue that separates a thick slab from a decal of a thick slab
         *   - a ray that crosses the whole slab without meeting anything is a ray through the
         *     hole, and the hole's outline therefore moves with the eye exactly as a hole in
         *     something 22-46 mm thick does
         *
         * ⚠️ **NO gl_FragDepth, DELIBERATELY, AND IT IS A STATED LIMIT.** Writing it would
         * composite the marched surface against the layer behind to the millimetre, but it
         * defeats early-Z for the entire shader on a surface that can fill the frame, and
         * walls-perf.md puts the whole GPU budget at 1.39 ms. The error it leaves is bounded
         * by one layer's thickness against a layer that is nested behind it anyway.
         */
        float _cut = 0.0;
        if (_front > 0.0) {
          float _vz = max(abs(vDmgView.z), 1e-4);
          vec2 _par = vec2(vDmgView.x / uFaceSize.x, vDmgView.y / uFaceSize.y) / _vz;
          float _pl = length(_par);
          // a near-tangent ray must not cross the face. See uParMax -- the literal 8.0 this
          // used to carry is now the uniform's default, so nothing moves until an arm moves it.
          if (_pl > uParMax) _par *= uParMax / _pl;
          bool _got = false;
          float _sp = 0.0, _dp = -_front;
          for (int _k = 0; _k < 6; _k++) {
            float _s = (float(_k) + 1.0) / 6.0;
            vec2 _o = -_par * (_s * uCutDepth);
            /**
             * 🚨 **_f == 1 IS A HOLE, AND WITHOUT THIS TEST THE LAYER NEVER OPENED AT ALL.**
             *
             * _f is how far through this slab the dig has eaten at the sample, 0..1, and it is
             * CLAMPED at 1. The march is meant to find where the ray re-enters material, which
             * is the first _s with _s >= _f. But the loop's last step is _s = 6/6 = EXACTLY
             * 1.0, so on a fully-eaten column (_f == 1 everywhere along the ray) the last step
             * computes _d = 1.0 - 1.0 = 0.0, the test _d >= 0.0 passes, and the fragment is
             * kept — as a cut face at _cut = 1.0.
             *
             * The consequence is not subtle and it is the whole of round 1's rejection: **no
             * texel of a damaged face ever discarded**, so a hole dug clean through to the
             * barrier was still covered by layer 0, painted edge to edge in layer 0's own
             * uCutColor. Every "hole" in every capture this campaign has taken was one flat
             * shade of the OUTERMOST layer — which is exactly critic-dig-1's rank-2 defect
             * ("one continuous untextured gradient, no material transition anywhere"), and it
             * is why the barrier could be armed, above threshold and mesh-visible and still
             * never appear: the plaster, the lath, the framing and the cyan behind them were
             * all being occluded by an opaque sheet at z = 0 that believed it had been removed.
             *
             * Found by scanline rather than by reading: the middle of a crater dug to depth
             * 1.00 photographed at (98,70,70) — neutral, i.e. layer 0's near-white cut colour —
             * where the barrier's teal or even the far room should have been.
             *
             * ⚠️ It also means every parallax and thickness cue this file added in round 1 was
             * real and correct and had a lid on it.
             */
            float _f = _rrrFront(vMapUv + _o, vDmgUv + _o, _lowA);
            float _d = _s - _f;
            if (_f < 0.999 && _d >= 0.0) {
              // one linear refinement, so the cut face is a surface and not six terraces
              _cut = mix(_sp, _s, _dp / (_dp - _d));
              _got = true;
              break;
            }
            _sp = _s; _dp = _d;
          }
          if (!_got) discard;
        }
        /**
         * 🔴 **ROUND 6: THE LIP'S WIDTH VARIED OVER 1.35 m, WHICH AROUND A 2 m HOLE IS A
         * CONSTANT — AND THIS FILE'S OWN HEADER SAYS WHAT A CONSTANT-WIDTH OFFSET IS.**
         *
         * *"A constant-width offset from a silhouette is a bevel, and a bevel is most of what
         * CG-soft means."* The varying-width lip was built to fix exactly that, and at 0.125 of
         * the jag scale its modulating noise has ~1.35 m features on a 5.72 m face — so all the
         * way round a 2.25 m breach the lip is essentially one width, i.e. the bevel the fix was
         * for. It is drawn concentric with the silhouette, in front of a concentric arris and a
         * concentric rim undercut, and stacking three constant-width offsets is how the first
         * build of this round came out looking like a moulded picture frame.
         *
         * 0.55 of the jag scale is ~31 cm — the same order as the teeth themselves — so the lip
         * is fat where a chunk half-detached and hairline where the sheet snapped clean, several
         * times around one hole instead of once across the whole wall.
         *
         * ⚠️ **DAMAGE ARM ONLY.** SCALAR_MAP keeps 0.125 exactly, so wall.sheet PASS 78 and every
         * studio view emit the bytes they were scored with.
         */
        float _lw = uLipWidth * mix(1.0,
          0.34 + 1.46 * _bnoise(vMapUv * uJagScale * 0.55 + 7.0), uRagged);
        // 🔴 see uRimFloor: hold a minimum width ON SCREEN at the sharpest notches, capped at
        // 2.4x so a plate wall's discontinuity fattens a corner and cannot bloom. Identity
        // wherever the contour is shallow enough that the band was already wide.
        if (uRimFloor > 0.0001) _lw = clamp(uRimFloor * _sdG, _lw, _lw * 2.4);
        // 0 at the tear, 1 at the outer end of the lip. Same quantity the smoothstep below used
        // to take inline; named because the hardened profile and the undercut both need it.
        float _lt = clamp(_sd / max(1e-5, _lw), 0.0, 1.0);
        // the ORIGINAL cubic ramp. Kept, because the undercut is defined on it — see uLipEnd.
        float _lipS = (_dmgB > 0.0001) ? (1.0 - smoothstep(0.0, 1.0, _lt)) : 0.0;
        // 🌊 see uLipEnd: the plaster holds full value and then ENDS, instead of dying away into
        // the boiserie over the whole band. At uLipEnd 0 this is _lipS to the bit.
        float _lip = (uLipEnd > 0.0001 && _dmgB > 0.0001)
          ? smoothstep(0.0, uLipEnd, 1.0 - _lt)
          : _lipS;
        /**
         * 🧱 **ROUND 4, DEFECT 2: THE SECTION WAS BEING CROSS-FADED INTO EXISTENCE, WHICH IS
         * WHY THE MEASURED NUMBERS NEVER BECAME A VISIBLE SLAB EDGE.**
         *
         * 'critic-dig-3' checked all three grazing frames (18 / 15 / 11.7 degrees) for an
         * edge-on profile and found none, and correctly refused to accept the code-side
         * thickness as evidence. The geometry was never the problem — the march does produce
         * the right annulus, and its apparent width is the slab's own thickness, 69 mm, at any
         * grazing angle. The problem is this ramp: '_cut' runs 0 -> 1 across that 69 mm, so
         * cross-fading the cut colour in over '_cut' 0.015 -> 0.34 spent THE OUTER THIRD OF THE
         * SECTION as a gradient. A third of 69 mm of blur is not an edge; it is precisely the
         * soft transition a reader parses as a shoreline rather than as a broken slab.
         *
         * Reaching full cut value inside the first 7.5% puts a hard step where the front face
         * turns into the section — about 5 mm of the 69 — and leaves the rest of the band at one
         * flat value. The section's WIDTH is unchanged; only its edge quality is.
         */
        float _cf = smoothstep(0.008, 0.075, _cut);
        /**
         * **THE ARRIS.** The corner between the front face and the section, crumbled and
         * catching the room, which is 'dig-gallery-sledge-crew.webp''s *crisp jagged white
         * plaster rim* seen where it actually lives — on the edge of a slab, not painted on a
         * flat plane. It is a fifth of the section wide and it is what tells the eye which side
         * of the edge is facing it.
         */
        float _arris = smoothstep(0.004, 0.050, _cut) * (1.0 - smoothstep(0.080, 0.300, _cut));
        /**
         * 🧱 **THE SECTION'S OWN ORIENTATION — see uFacet / uSecLift.** Computed once, here,
         * and consumed three times: by the albedo below, by the cut face's normal in
         * 'normal_fragment_maps', and by the band emissive in 'emissivemap_fragment'. Doing it
         * here rather than in the normal patch also deletes a duplicate '_rrrGrad' call.
         *
         * '_secDir' points INTO the cavity (toward the deepest material), so the cut face's
         * outward normal is '+_secDir' in plane — see uFacet item 1 for why that sign, and for
         * the eight rounds it was the other one.
         *
         * '_secUp' is the world-up component of that normal, and it is exact rather than
         * approximate: a layer plane is a PlaneGeometry in its own XY inside a group whose only
         * rotation is about Y, so the face's local +y IS world up on every wall in the house.
         */
        vec2 _secDir = vec2(0.0);
        float _secUp = 0.0, _secShade = 1.0;
        if (_cf > 0.002) {
          vec2 _g = _rrrGrad(vDmgUv);
          float _gl = length(_g);
          vec2 _d0 = (_gl > 1e-6) ? _g / _gl : vec2(0.0, 1.0);
          if (uFacet > 0.001) {
            // 🧩 the broken boundary's own direction. '_order' is HIGH where material survives,
            // so the way the cavity falls away is '-grad(_order)'.
            vec2 _og = _rrrOrderGrad(vMapUv, _lowA);
            float _ol = length(_og);
            if (_ol > 1e-6) {
              vec2 _mix = mix(_d0, -_og / _ol, uFacet);
              float _ml = length(_mix);
              if (_ml > 1e-4) _d0 = _mix / _ml;
            }
          }
          _secDir = _d0 * uSecSign;
          _secUp = _secDir.y;
          // sill (faces up) bright, jamb mid, soffit (faces down) dark. Clamped so a band with
          // a large lift cannot drive a facet negative.
          _secShade = max(0.15, 1.0 + uSecLift * _secUp);
        }
        #include <map_fragment>
        // 🎨 THE BAND'S OWN MATERIAL. See uBandColor: hue and saturation from the band, every
        // bit of spatial detail from the bake, so ornate / white / teal are three materials
        // rather than one surface getting lighter with depth.
        if (uBandTint > 0.001) {
          float _bl = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          diffuseColor.rgb = mix(diffuseColor.rgb,
                                 uBandColor * (uBandBase + _bl * uBandDetail), uBandTint);
        }
        // 🌊 the slab's large-scale, non-periodic unevenness — see uSlabMottle. Kept out of the
        // scalar arm and off bands 0/1 by the uniform defaulting to 0.
        float _slab = 0.0;
        if (uSlabMottle > 0.001) {
          _slab = _rrrSlabVar(vDmgUv * uFaceSize) * uSlabMottle;
          diffuseColor.rgb *= 1.0 + _slab;
        }
        // the crumbling lip: exposed broken material, not a clean cut
        diffuseColor.rgb = mix(diffuseColor.rgb, uLipColor, _lip * 0.85);
        // ⚠️ ON '_lipS', THE ORIGINAL RAMP, NOT ON '_lip' — see uLipEnd. This selects the
        // innermost sliver that overhangs its own broken back; the hardened profile is 1.0 across
        // the whole band and would trench the entire white rim.
        float _rim = smoothstep(0.52, 1.0, _lipS) * uRagged;
        diffuseColor.rgb *= 1.0 - _rim * uRimDark;
        // THE CUT FACE ITSELF. Fresh broken core, and darker the deeper into the wall it is —
        // a side wall inside a cavity sees a fraction of the room and nothing else.
        diffuseColor.rgb = mix(diffuseColor.rgb, uCutColor, _cf * 0.90);
        diffuseColor.rgb *= 1.0 - _cf * uCutDark * (0.30 + 0.70 * _cut);
        // 🧱 **THE SILL / JAMB / SOFFIT SPREAD — see uSecLift.** On the ALBEDO, so it scales
        // whatever light the cavity has instead of adding a floor of its own: a term that lit an
        // unlit cavity would be a second emissive, and the section is the one surface in the
        // picture that must be allowed to get dark (see the band emissive's own note).
        diffuseColor.rgb *= mix(1.0, _secShade, _cf);
        diffuseColor.rgb = mix(diffuseColor.rgb, uLipColor, _arris * 0.55);
        /**
         * 🧱 **THE CYAN CORE, IN SECTION — see uCore.** Two constants and a hard step between
         * them, on the back slice of the innermost layer's marched cut. 'step' on both axes on
         * purpose: a smoothstep here would be a ramp, and a ramp across a slab edge is the
         * shoreline this piece has spent nine rounds removing.
         *
         * ⚠️ '_coreK' is declared unconditionally because the emissive patch below needs it in
         * scope, and it is 1.0 whenever uCore is 0 -- so a caller that does not ask pays one
         * multiply-by-one and emits the same picture.
         */
        float _core = 0.0;
        float _coreK = 1.0;
        if (uCore > 0.001) {
          _core = step(1.0 - uCore, _cut) * step(0.5, _cf);
          _coreK = mix(1.0, uCoreTopK, step(uCoreUp, _secUp));
          diffuseColor.rgb = mix(diffuseColor.rgb, uCoreCol * _coreK, _core);
        }
      `;

const SCALAR_MAP = /* glsl */ `
        float _order = 1.0;
        if (uUseOrmAlpha > 0.5) _order = texture2D(tBreakField, vMapUv).a;
        // Fringe the boundary: two octaves, the coarse one tearing chunks out and the fine
        // one splitting slivers off those. Only applied near the threshold, so intact
        // material well away from the break is untouched.
        if (uJag > 0.0001 && uBreak > 0.0001) {
          float _n = _bnoise(vMapUv * uJagScale) * 0.68
                   + _bnoise(vMapUv * uJagScale * 2.7 + 19.0) * 0.32;
          float _near = 1.0 - smoothstep(0.0, uJag * 3.0, abs(_order - uBreak));
          _order += (_n - 0.5) * uJag * _near;
        }
        if (_order < uBreak) discard;
        // A CRUMBLING LIP IS NOT A CONSTANT WIDTH. It is fat where a chunk half-detached and
        // hairline where the sheet snapped clean. A constant offset from the silhouette is a
        // bevel, and a bevel is most of what "CG-soft" means. The modulating noise is the
        // jag noise at an eighth of its frequency, so the width varies at chunk scale rather
        // than at crumb scale and the two stay in step.
        float _lw = uLipWidth * mix(1.0,
          0.42 + 1.30 * _bnoise(vMapUv * uJagScale * 0.125 + 7.0), uRagged);
        float _lip = (uBreak > 0.0001)
          ? (1.0 - smoothstep(uBreak, uBreak + _lw, _order))
          : 0.0;
        #include <map_fragment>
        // the crumbling lip: exposed broken material, not a clean cut
        diffuseColor.rgb = mix(diffuseColor.rgb, uLipColor, _lip * 0.85);
        // THE UNDERCUT. The outermost sliver of the lip overhangs its own broken back, so it
        // sits in its own shade with the cavity showing under it. This is the only dark value
        // anywhere near the edge, and without it the surviving sheet has no thickness.
        float _rim = smoothstep(0.52, 1.0, _lip) * uRagged;
        diffuseColor.rgb *= 1.0 - _rim * uRimDark;
      `;

/**
 * @param {THREE.Material} material  a MeshStandardMaterial/MeshPhysicalMaterial from the baker
 * @param {object} [opts]
 * @param {number} [opts.break=0]
 * @param {number} [opts.lipWidth=0.055]
 * @param {number[]} [opts.lipColor]
 * @returns {THREE.Material} the same material, patched
 */
export function applyBreakMask(material, opts = {}) {
  if (material.userData.breakPatched) return material;
  material.userData.breakPatched = true;

  // ONE READ OF THE FLAG, HERE. Every destructible surface in the project is patched through
  // this function, so this is the single point that decides which arm the whole build is in.
  const ragged = opts.ragged ?? raggedBreak();

  /**
   * 🕳️ THE THRESHOLD SOURCE. `opts.damage` is `{ texture, band:[lo,hi] }` and its PRESENCE is
   * the whole switch — see the header. It selects one of two complete patch bodies
   * (`SCALAR_MAP` / `DAMAGE_MAP`), so with no damage texture every emitted character is what it
   * was before this feature existed.
   */
  const dmg = opts.damage ?? null;

  /**
   * 🎯 **THE BREAK FIELD CAN COME FROM A DIFFERENT MATERIAL THAN THE ONE BEING PATCHED, AND
   * THAT IS WHAT LETS THE DIG HAPPEN ON THE ESTATE'S OWN WALL.**
   *
   * `baker.js` defaults `Surf.breakOrder` to 1.0 — "never breaks" — so every material in the
   * house that is not a wall stage carries a flat alpha. Patching `boiserieMat` with the mask
   * alone would therefore give a perfectly smooth boundary, which is the exact defect this
   * round exists to remove. Handing the field in separately means the estate's ornate surface
   * can break with the wallpaper stage's authored raggedness without one line of
   * `materials-local.js` moving — see `wallstages.js` `estateSkinMat`.
   */
  const field = opts.breakField ?? material.roughnessMap ?? null;
  const fieldSize = field?.image?.width ?? 1024;

  const u = {
    uBreak: { value: opts.break ?? 0 },
    uLipWidth: { value: opts.lipWidth ?? 0.055 },
    uLipColor: { value: new THREE.Vector3(...(opts.lipColor ?? [0.42, 0.40, 0.365])) },
    uLipRough: { value: opts.lipRough ?? 0.96 },
    tBreakField: { value: field },
    uUseOrmAlpha: { value: field ? 1 : 0 },
    uJag: { value: opts.jag ?? 0.10 },
    uJagScale: { value: new THREE.Vector2(...(opts.jagScale ?? [190, 190])) },
    uRagged: { value: ragged ? 1 : 0 },
    uRimDark: { value: opts.rimDark ?? 0.58 },
  };
  if (dmg) {
    const face = opts.faceSize ?? [5.72, 2.80];
    const cutDepth = opts.cutDepth ?? 0.04;
    u.tDamage = { value: dmg.texture };
    u.uDmgBand = { value: new THREE.Vector2(dmg.band?.[0] ?? 0, dmg.band?.[1] ?? 1) };
    /**
     * 💡 see uLitBand. **Defaults to this layer's own band**, so `_dmgL` is `_dmgB` to the bit
     * for every caller that does not ask and no existing damage-armed picture moves. `wall.js`
     * passes the layer-in-front's band for the innermost layer only.
     */
    u.uLitBand = {
      value: new THREE.Vector2(...(opts.litBand ?? [dmg.band?.[0] ?? 0, dmg.band?.[1] ?? 1])),
    };
    u.uDmgStep = { value: new THREE.Vector2(...(opts.dmgStep ?? [0.033, 0.067])) };
    /**
     * ⚠️ **THE MIP LEVEL IS THE ONLY THING THAT SETS WHAT COUNTS AS "COARSE", SO IT IS DERIVED
     * FROM THE TEXTURE AND NOT TYPED IN.** `log2(size) - 3.4` reduces any bake to about ten
     * texels across, i.e. a footprint of a tenth of the tile — roughly half a metre on a 5.72 m
     * face. Above that (the radial ramp, the billow at a fifth of a tile) is removed; below it
     * (the 40 cm chunks, the 14 cm sub-cells, the fissures and the lath courses) survives. Type
     * a constant here and the 2048 lath bake gets a footprint half the size of the 1024s and
     * the four layers stop tearing at the same scale.
     */
    u.uOrderLod = { value: opts.orderLod ?? (Math.log2(fieldSize) - 3.4) };
    /**
     * The residual is small — a high-pass of a field whose range is mostly ramp — so it has to
     * be stretched back out or every layer's boundary would be a smooth curve again. 2.0 puts
     * the crumble's own +/-0.15 back to about +/-0.30 of threshold, which against the brush's
     * measured 0.64-per-metre threshold gradient is an in-plane wobble of ~0.25 m: the size of
     * the largest fragment in `refs/_sheets/dig.png`, which is where the number comes from.
     */
    u.uOrderGain = { value: opts.orderGain ?? 2.8 };
    // see uOrderHi / uOrderSoft. Both default to identity.
    u.uOrderHi = { value: opts.orderHi ?? 0 };
    u.uOrderSoft = { value: opts.orderSoft ?? 0 };
    /**
     * 🧩 See uPlate. 0 is inert, and the scale is in PLATES ACROSS THE FACE so a caller that
     * knows its face in metres can ask for a real fragment size — `wall.js` does.
     */
    u.uPlate = { value: opts.plate ?? 0 };
    u.uPlateScale = { value: new THREE.Vector2(...(opts.plateScale ?? [16, 8])) };
    // 🌊 see uLipEnd. 0 is the pre-round-7 cubic ramp exactly.
    u.uLipEnd = { value: opts.lipEnd ?? 0 };
    /**
     * How wide, in threshold units, the layer is eaten through — i.e. how broad the cut face
     * is in plan. Scaled off the lip, because the lip was the SHADING of exactly this band and
     * the two must not disagree about where the edge of the sheet is.
     *
     * ⚠️ **IT HAS TO BE WIDER THAN THE ORDER FIELD'S OWN VARIATION OR THE CUT FACE FRAGMENTS.**
     * The band where the slab is part-eaten is where `|band - order| < uCutSoft / 2`; with the
     * high-passed field swinging about +/-0.35 a soft of 0.05 leaves that band in disconnected
     * speckles instead of a ring around the hole. Raised 0.05 -> 0.11 after looking at the first
     * capture. It is the one number in this file most worth a critic's opinion: too small and
     * the wall is a sheet again, too large and the cut becomes a shallow chamfer.
     *
     * 🔴 **ROUND 2: 0.11 -> 0.037, AND THE CRITIC'S REASONING IS WHY THE FEAR ABOVE WAS WRONG.**
     * `critic-dig-1`: *"uCutSoft too large AND the wrong tool — cut it hard, to about a third."*
     * The paragraph above is arguing that a narrow part-eaten band FRAGMENTS, and it does — but
     * only as a band of SHADING on a flat plane, which is what it was when the number was chosen.
     * Since round 1 the cut face is MARCHED: the ray is walked back through the slab and the face
     * you see is where it re-entered material, so the face's visible width comes from the view
     * angle and the slab's thickness, not from how far the threshold is smeared in plan. A hard
     * cut is therefore a STEEPER wall to the cavity — which is what a hole in plaster actually
     * has — and the march still finds it at every grazing angle. What 0.11 bought was a shallow
     * 25 cm chamfer all round the hole, i.e. exactly the soft gradient the critic could not read
     * as an edge. Paired with per-band albedo (see uBandColor) the boundary is now a hard
     * MATERIAL break as well as a hard geometric one, which is the reference's whole signature.
     */
    u.uCutSoft = { value: opts.cutSoft ?? Math.max(0.034, (opts.lipWidth ?? 0.055) * 0.55) };
    u.uCutDepth = { value: cutDepth };
    u.uCutDark = { value: opts.cutDark ?? 0.46 };
    // ⚠️ 0.85 tipped the cut face almost fully into the wall plane, which made every artefact in
    // the gradient a lighting artefact at full strength. 0.55 still reads as a side wall.
    u.uCutNorm = { value: opts.cutNorm ?? 0.55 };
    u.uCutColor = { value: new THREE.Vector3(...(opts.cutColor ?? [0.505, 0.487, 0.450])) };
    /**
     * 🎨 The band's own material. Defaults are INERT — tint 0 leaves the layer's baked albedo
     * exactly as it was — so a caller that does not ask for a band look gets round 1's picture
     * and the only build that changes is the one `wall.js` explicitly re-colours.
     */
    u.uBandColor = { value: new THREE.Vector3(...(opts.bandColor ?? [1, 1, 1])) };
    u.uBandTint = { value: opts.bandTint ?? 0 };
    // See uBandBase / uBandDetail. The defaults are round 2's hard-coded constants, so a caller
    // that does not ask for a flat band gets exactly round 2's picture.
    u.uBandBase = { value: opts.bandBase ?? 0.58 };
    u.uBandDetail = { value: opts.bandDetail ?? 0.86 };
    u.uBandEmissive = { value: new THREE.Vector3(...(opts.bandEmissive ?? [0, 0, 0])) };
    // see uGlow: the breach's own bounce onto the surviving white. 0 is inert.
    u.uGlow = { value: new THREE.Vector3(...(opts.glow ?? [0, 0, 0])) };
    /**
     * 🧱 **ROUND 9 — see uFacet / uSecLift / uRimFloor for the full argument.** All three are
     * identity at their defaults: `facet` 0 leaves the section's normal on the smooth depth
     * disc, `secLift` 0 leaves it one value all the way round, and `rimFloor` 0 leaves the lip
     * exactly as wide as `uLipWidth` says. `wall.js` is the only caller that asks.
     *
     * ⚠️ The SIGN correction in the normal patch is NOT behind a uniform, deliberately. It is
     * not a look knob — a concave crater's wall leans toward its own deepest point and the old
     * expression said the opposite, so there is no arm in which the old one is wanted. It cannot
     * reach a scalar consumer: the whole normal patch's damage branch is gated on `dmg`.
     */
    // see uSecSign: +1 is the corrected cut-face normal, -1 reproduces rounds 1-8 for ablation
    u.uSecSign = { value: opts.secSign ?? 1 };
    u.uFacet = { value: opts.facet ?? 0 };
    u.uSecStep = { value: opts.secStep ?? 0.06 };
    u.uSecLift = { value: opts.secLift ?? 0 };
    u.uRimFloor = { value: opts.rimFloor ?? 0 };
    // 🐞 see uOrderTop / _rrrSpent. `orderTop` 1 is the old hard clamp to the bit and `spent`
    // [0.90, 1.00] is the ramp round 4 shipped, so a caller that does not ask is unchanged.
    u.uOrderTop = { value: opts.orderTop ?? 1 };
    u.uSpent = { value: new THREE.Vector2(...(opts.spent ?? [0.90, 1.0])) };
    // 🐞 see uParMax. 8 is the literal the march carried from round 1, so this is inert until an
    // arm moves it — which is the point: round 9 could not test it because it was not a uniform.
    u.uParMax = { value: opts.parMax ?? 8.0 };
    /**
     * 🧱 see uCore. `core` 0 is off and is the default, so band 0, the scalar arm and every
     * studio view are untouched. `coreTopK` 1 collapses the two faces onto one value, which is
     * the ablation arm for "is the two-tone doing anything".
     */
    u.uCore = { value: opts.core ?? 0 };
    u.uCoreCol = { value: new THREE.Vector3(...(opts.coreCol ?? [0.002, 0.232, 0.296])) };
    u.uCoreEmis = { value: new THREE.Vector3(...(opts.coreEmis ?? [0, 0.5, 0.648])) };
    u.uCoreTopK = { value: opts.coreTopK ?? 1 };
    u.uCoreUp = { value: opts.coreUp ?? 0.12 };
    // see uSlabMottle. 0 keeps band 0, band 1 and every scalar consumer byte-identical.
    u.uSlabMottle = { value: opts.slabMottle ?? 0 };
    u.uFaceSize = { value: new THREE.Vector2(face[0], face[1]) };
  }
  material.userData.breakUniforms = u;
  material.userData.breakRagged = !!ragged;
  material.userData.breakDamage = !!dmg;

  // The discriminator goes in `defines`, NOT in customProgramCacheKey.
  // `post/pipeline.js`'s patchForScreenAO() ASSIGNS customProgramCacheKey rather than
  // composing it, so a key set here is silently discarded at scene finalize; and three's own
  // program key is built from booleans like "has a normalMap", not from texture identity.
  // `defines` is hashed by WebGLPrograms.getProgramCacheKey and nothing in the project
  // rewrites it. It costs one extra program and it means the two arms of the ablation can
  // never be handed each other's compiled shader.
  material.defines = material.defines || {};
  material.defines.RRR_BREAK_RAGGED = ragged ? 1 : 0;
  // Same reasoning one line up: the two threshold sources are two different programs and must
  // never be handed each other's compiled shader.
  material.defines.RRR_BREAK_DAMAGE = dmg ? 1 : 0;

  // Alpha-clipping needs the material to not be depth-sorted as opaque-with-holes, and
  // three needs to know the shader discards so shadows clip too.
  material.transparent = false;
  material.alphaTest = 0.0;      // we discard by hand; three's alphaTest reads map.a
  material.side = THREE.FrontSide;

  const prev = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, renderer) {
    if (prev) prev.call(this, shader, renderer);
    Object.assign(shader.uniforms, u);

    // ⚠️ onBeforeCompile hands you the shader with its #includes UNRESOLVED, and a
    // String.replace that matches nothing FAILS SILENTLY — it does not throw, it merely
    // renders slightly differently and every conclusion drawn from the capture is wrong.
    // HANDOFF records this trap costing more than an hour, more than once. So every patch
    // goes through here, the count is recorded on the material for a probe to read, and a
    // miss throws where the capture harness will report it as a broken view.
    const hits = {};
    let src = shader.fragmentShader;
    const sub = (name, needle, repl) => {
      const i = src.indexOf(needle);
      hits[name] = i >= 0 ? 1 : 0;
      if (i < 0) {
        material.userData.breakPatch = hits;
        throw new Error(`applyBreakMask: patch "${name}" matched nothing in the fragment ` +
          `shader (looked for ${needle}). three's shader chunks changed, or this material ` +
          'is not a MeshStandardMaterial. Refusing to render a silently wrong break edge.');
      }
      src = src.slice(0, i) + repl + src.slice(i + needle.length);
    };

    /**
     * ⚠️ THE VERTEX SHADER IS ONLY TOUCHED IN THE DAMAGE ARM, and it is asserted the same way
     * the fragment patches are. `attribute vec2 uv` is unconditional in three's vertex prefix
     * (r180 `WebGLProgram.js`), so this needs no `USE_UV` gate — but a miss here would produce
     * a varying that is never written, which reads as a hole in a random place rather than as
     * a broken patch, so it throws like everything else in this function.
     */
    if (dmg) {
      let vsrc = shader.vertexShader;
      const vi = vsrc.indexOf('void main() {');
      hits.vertex = vi >= 0 ? 1 : 0;
      if (vi < 0) {
        material.userData.breakPatch = hits;
        throw new Error('applyBreakMask: vertex patch matched nothing. Refusing to render a ' +
          'damage-driven break edge with an unwritten UV varying.');
      }
      /**
       * ⚠️ **THE VIEW VECTOR IS TAKEN IN OBJECT SPACE, NOT VIA A COTANGENT FRAME, AND THAT IS
       * WHAT MAKES THE MARCH EXACT RATHER THAN APPROXIMATE.** A layer plane is a
       * `PlaneGeometry(width, height)` in its own XY with +Z out into the room, so its uv IS
       * `position.xy / faceSize + 0.5` — there is no tangent basis to reconstruct and no
       * derivative to be wrong about. `inverse(modelMatrix)` runs four times per plane.
       *
       * `vDmgT` is the view-space image of the face's local +x, which the cut face's normal is
       * built on. `normalMatrix` and `cameraPosition` are both in three's own vertex prefix.
       */
      vsrc = `${vsrc.slice(0, vi)}varying vec2 vDmgUv;
varying vec3 vDmgView;
varying vec3 vDmgT;
void main() {
  vDmgUv = uv;
  vDmgView = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz - position;
  vDmgT = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
${vsrc.slice(vi + 'void main() {'.length)}`;
      shader.vertexShader = vsrc;
    }

    sub('pars', 'void main() {', `${BREAK_PARS}${dmg ? DAMAGE_PARS : ''}\nvoid main() {`);
    // Discard first, before any lighting work, so a broken texel costs nothing.
    //
    // ⚠️ **THE TWO ARMS ARE TWO WHOLE PATCH BODIES, NOT ONE BODY WITH THE THRESHOLD SWAPPED,
    // AND THAT IS THE §8 REGRESSION GATE.** `SCALAR_MAP` is the pre-2026-08-08 text with
    // `uBreak` written in where the interpolation used to be, so with no damage texture the
    // emitted GLSL is the same bytes it always was — no extra uniform, no extra branch, no
    // extra varying, no extra program. `wall.sheet` PASS 78 is the board's only material PASS
    // lineage and this file carries it.
    sub('map', '#include <map_fragment>', dmg ? DAMAGE_MAP : SCALAR_MAP);
    sub('roughness', '#include <roughnessmap_fragment>', `
        #include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, uLipRough, _lip * 0.9);${dmg ? `
        roughnessFactor = mix(roughnessFactor, uLipRough, _cf * 0.85);` : ''}
      `);
    // Push the lip back and rough up its normal so it catches light like a torn edge.
    sub('normal', '#include <normal_fragment_maps>', `
        #include <normal_fragment_maps>
        if (_lip > 0.001) {
          vec3 _j = normalize(vec3(
            fract(sin(dot(vMapUv, vec2(12.9898, 78.233))) * 43758.5453) - 0.5,
            fract(sin(dot(vMapUv, vec2(93.9898, 17.233))) * 24634.6345) - 0.5,
            1.2));
          normal = normalize(mix(normal, normalize(normal + _j * 1.1), _lip * 0.75));
        }${dmg ? `
        // 🧱 **THE CUT FACE IS A SURFACE AND HAS TO BE LIT AS ONE.** Without its own normal it
        // is a dark stain lying in the plane of the wall, which is a painted lip again. The
        // cavity falls away along the dug depth's gradient, so the side wall's outward normal
        // is the OPPOSITE of that direction, tilted most of the way out of the plane — and
        // because it is a real orientation it takes the room's light from a different angle
        // than the face beside it, which is the thing the eye actually reads as thickness.
        if (_cf > 0.002 && dot(_secDir, _secDir) > 0.25) {
          vec3 _N = normalize(normal);
          vec3 _T = normalize(vDmgT - _N * dot(_N, vDmgT));
          vec3 _Bt = cross(_N, _T);
          /**
           * 🚨 **THE SIGN IS '+_secDir' AND IT USED TO BE '-'. See uFacet item 1.** A crater is
           * concave, so its wall leans TOWARD the deepest point: for 'depth = |x|' the surface at
           * x > 0 is 'z = -x', outward normal proportional to (+1, 0, +1), and grad(depth) is
           * (+1, 0). The old expression turned every section away from the cavity it belongs to,
           * which is what made a soffit and a sill photograph as the same value — and one value
           * all the way round a hole is a painted band by definition.
           *
           * '_secDir' also carries the plate lattice when a caller asks for facets, so this
           * normal is now per-PLATE rather than per-radius.
           */
          vec3 _cn = normalize(_N * 0.42 + (_T * _secDir.x + _Bt * _secDir.y));
          normal = normalize(mix(normal, _cn, _cf * uCutNorm));
        }` : ''}
      `);
    // metalness must not survive into the lip — torn plaster is not metal
    sub('metalness', '#include <metalnessmap_fragment>', `
        #include <metalnessmap_fragment>
        metalnessFactor *= 1.0 - _lip * 0.9;${dmg ? `
        metalnessFactor *= 1.0 - _cf * 0.95;` : ''}
      `);
    /**
     * The band's own emissive — see uBandEmissive. DAMAGE ARM ONLY, and gated on `_dmgB` so it
     * is identically zero everywhere the wall has not been dug: the standing estate wall around
     * a hole must not glow, only the section revealed inside it.
     *
     * ⚠️ `emissivemap_fragment` comes AFTER `map_fragment` in three's standard fragment shader,
     * so `_dmgB` is already in scope — the same property the roughness, normal and metalness
     * patches above rely on for `_lip` and `_cf`. The substitution is asserted like every other
     * one in this function, so a chunk reorder in a future three fails loudly instead of quietly
     * dropping the band colour that this whole round is about.
     */
    if (dmg) {
      sub('emissive', '#include <emissivemap_fragment>', `
        #include <emissivemap_fragment>
        /**
         * 🔴 **ROUND 6: THE BAND EMISSIVE IS A FLOOR, AND A FLOOR IS THE ONE THING THE SECTION
         * CANNOT HAVE.** It exists because a cavity is unlit and an unlit white wall photographs
         * as a grey wall (see uBandEmissive) — which is an argument about the FRONT FACE inside
         * the crater, and the exact opposite of what the CUT FACE needs. Applied flat it put a
         * 0.09 floor under every pixel of the cross-section, so the shell's darkest edge could
         * not get dark and the white ran into the cyan with nothing between them. A cut face is
         * the surface that sees least of the room, so it loses the term it was never for.
         */
        // 🧱 ...and what little of it the section keeps is spread by the facet's orientation for
        // the same reason the albedo is — see uSecLift. Without this the 0.12 that survives is a
        // flat floor under a soffit that is supposed to be the darkest thing at the edge.
        // 💡 **ON '_dmgL', NOT '_dmgB' — see uLitBand.** A cavity is unlit, so what decides
        // whether a texel needs this term is whether it is INSIDE the breach, not how far
        // through its own slab the dig has got. They are the same number on every band but the
        // innermost one, whose whole job in round 11 is to stand inside an open crater.
        totalEmissiveRadiance += uBandEmissive * smoothstep(0.02, 0.55, _dmgL)
                               * (1.0 + _slab) * (1.0 - _cf * 0.88)
                               * mix(1.0, _secShade, _cf);
        // 💡 the breach's bounce — see uGlow. Squared so it hugs the boundary instead of washing
        // the whole damaged area, and taken OFF the cut face for the same reason as the line
        // above: the reference's glow lies on the standing white beside the tear, not inside it.
        // ⚠️ '_dmgL' for the same reason as the emissive: the surviving inner plate is the
        // material NEAREST the slab and therefore takes the most bounce, and it takes it from
        // the moment the room can see it rather than from the moment it starts to go.
        float _gw = smoothstep(0.03, 1.0, _dmgL);
        totalEmissiveRadiance += uGlow * _gw * _gw * (1.0 - _cf * 0.75);
        /**
         * 🧱 **THE CORE CARRIES ITS OWN EMISSIVE AND NONE OF THE SHELL'S — see uCore.** The
         * barrier slab is mostly emissive (a cavity is unlit, and the fill you see through the
         * hole is very nearly 'barrierMaterial''s emissive put through the tonemap), so a core
         * painted only in albedo would come back as a dark grey rim rather than as teal. It
         * REPLACES the band emissive rather than adding to it, because two constants plus a
         * varying floor is not two constants.
         */
        totalEmissiveRadiance = mix(totalEmissiveRadiance, uCoreEmis * _coreK, _core);
      `);
    }

    shader.fragmentShader = src;
    material.userData.breakPatch = hits;
  };

  // ⚠️ THE SCALAR KEY IS 'rrr-break-v1' AND IT DOES NOT MOVE — `wall.sheet` PASS 78 and every
  // studio view are on it. The damage arm's key tracks its own source, which round 7 changed
  // twice (uPlate / _bcell, then uLipEnd), so it goes v3 -> v5; round 9's section work takes
  // it to v6; round 11's `uLitBand` takes it to v8; round 12's `uSecFloor` takes it to v9.
  // ⚠️ It is still ONE key for the whole damage arm and must stay that way — `progkey-1`
  // collapsed 1077 programs to 213 by deleting a per-panel prefix, and a new VARIANT belongs in
  // `material.defines`, never here. `uLitBand` and `uSecFloor` are uniforms, so neither adds a
  // program: the damage arm is still exactly one key and the scalar arm is still exactly one.
  material.customProgramCacheKey = () => (dmg ? 'rrr-break-dmg-v8' : 'rrr-break-v1');
  material.needsUpdate = true;
  return material;
}

/**
 * 🕳️ **THE BARRIER — cyan structure behind the white, and it has to read as an ANSWER.**
 *
 * ---------------------------------------------------------------------------
 * 🔴 **ROUND 5, JOHN'S OWN NOTE AFTER PLAYING ROUND 4, AND IT OUTRANKS THE CRITIC'S BRIEF:**
 * ---------------------------------------------------------------------------
 * *"The cyan barrier is supposed to feel indestructible and instead it seems to visually take
 * damage just like the white layer."*
 *
 * He is describing this function, and the mechanism is three modulations that were each argued
 * for individually and are collectively the whole defect. **Every one of them is deleted.**
 *
 *   1. **`_bcontact` — the contact shadow — WAS DRIVEN BY THE DIG.** It is
 *      `smoothstep(uShowAt, uShowAt + uBContact, depth)`, so the slab was darkened to 0.50 of
 *      albedo and 0.55 of emissive at the silhouette and rose to full a fifth of the threshold
 *      range deeper in. **That is a 2x brightness ramp keyed to how far the player has dug**,
 *      re-drawn every blow, spreading outward as the hole grows. It was defended as "a shadow
 *      the broken plaster casts, not a pattern" — true, and beside the point: a value on the
 *      barrier that MOVES WHEN YOU HIT THE WALL is the barrier responding to being hit,
 *      whatever the physical story for it is. It is also, geometrically, a soft gradient sitting
 *      exactly at the white/teal boundary, i.e. the single feature that made the boundary read
 *      as a shoreline rather than as a material break.
 *   2. **`uBMottle` — the large-scale unevenness** added in round 4 to stop a flat teal field
 *      reading as water. It is +/-15% of value in soft blobs a metre across, which is precisely
 *      "shading that implies a worn surface". The reference answers the water question a
 *      different way and it is the way John states: the cyan is not a surface you are making
 *      progress against, so it does not need to look weathered — it needs to look INERT.
 *   3. **The torn threshold.** The barrier had its own jittered silhouette, so its edge was a
 *      second ragged boundary a few centimetres off the shell's. Two ragged edges a hand's
 *      width apart, between a pale field and a teal one, IS the coastline.
 *
 * **What replaces them: nothing.** `uShowAt` drops 0.62 -> 0.52 and the noise goes, which makes
 * the barrier's own contour STRICTLY INSIDE the region where the innermost white layer is still
 * standing (`wall.js` `DAMAGE_BANDS[3]` starts at 0.68, and layer 3 is an opaque depth-writing
 * occluder until then). **So the barrier's own edge is never on screen: the boundary you see is
 * the white shell's cut edge, and it is as hard as that edge is.** The cyan is one constant
 * value over every pixel of it, at every stage of every dig, forever.
 *
 * ⚠️ **AND `receiveShadow` IS OFF ON THE MESH** (`wall.js`) for the same reason — a shadow
 * tracking across the slab is the same tell arriving through the lighting instead of the
 * material.
 *
 * `docs/design/dig.md` §5: *"do not make the barrier look like failure — make it look like an
 * ANSWER."* `refs/_sheets/dig.png` shows exactly this: person-sized ragged holes in ornate
 * white walls with **cyan structure behind them**.
 *
 * ⚠️ **IT SAMPLES THE SAME `tDamage` AND THEREFORE CANNOT DISAGREE WITH THE HOLE IN FRONT OF
 * IT.** A separate mesh switched on by a CPU rule would be a second source of truth about where
 * the wall is gone, and this project's most expensive failure class is two structures that
 * drift. Instead: discard where the wall in front is still standing (`R < uShowAt`) and discard
 * where the barrier is not there at all (`G < 0.5`, i.e. the interconnect).
 *
 * ⚠️ **THAT SECOND DISCARD IS ALSO WHY THE INTERCONNECT GIVES NOTHING AWAY WHILE CLOSED.** The
 * G channel is only ever legible through material you have already removed. `procedural-map.md`
 * §2 — *"a closed connector must give NOTHING away"* — enforced by construction rather than by
 * matching a dressing population.
 *
 * ---------------------------------------------------------------------------
 * 🔴 **ROUND 3, RANK 1: THE RIBS ARE GONE. THE CYAN IS A FLAT SOLID SLAB.**
 * ---------------------------------------------------------------------------
 * Rounds 1 and 2 both argued from a premise this file wrote down and never checked:
 *
 *   *"A flat plane of one colour is the single most reliable way to make something read as a
 *   missing texture."*
 *
 * True in general, **false against this reference**, and the reference is the bar. All eight
 * images in `refs/_sheets/dig.png` show the cyan as a flat, smooth, textureless solid slab —
 * including where `dig-barrier-stages.webp` shows it in cross-section, where any internal
 * framing would have to appear and does not. So the horizontal structural members at 0.30 m,
 * the vertical stiffeners, and the five-step relief march that gave them sides are all deleted.
 *
 * ⚠️ **THIS IS JOHN'S ORIGINAL COMPLAINT, AND IT HAD MOVED RATHER THAN GONE.** *"A 2d mesh
 * taking off layers"* was fixed on the white wall in round 2 and reintroduced on the cyan:
 * `critic-dig-2` measured the teal swinging luminance 30 <-> 152 every 20-40 px along a
 * scanline, which at head-on range reads as horizontal strips peeling off a flat plane.
 * ⚠️ **AND IT CORRECTS A READING OF JOHN'S OWN** — after playing he said *"I can see the cyan
 * wall is actually the lath, beam and brick structure"*, which was him pattern-matching onto
 * this artefact. The art asks for the opposite. Do not build the framing back.
 *
 * What survives, and why each one is not texture:
 *   · **the torn threshold** — the barrier's own silhouette, so where the wall in front has just
 *     cleared it the cyan appears as a ragged edge and not as axis-aligned 9 cm rectangles
 *   · **a contact shadow at that silhouette**, a fifth of the threshold range wide and flat
 *     everywhere else. It is what stops the slab from looking pasted to the back of the hole;
 *     it is a shadow the broken plaster casts, not a pattern, and it has no repeat.
 * The plane also still stands at the BACK of the wall band (`wall.js` `DAMAGE_BACK_F`), so
 * everything you see it through — four layer planes over 105 mm and a 146 mm reveal — is
 * genuinely in front of it. That is where the thickness comes from now, all of it geometric.
 *
 * 🧱 Deleting the march also removes a five-iteration loop with a texture fetch in each step
 * from a surface that can fill the frame — the one unpriced fill-rate risk this slice named.
 *
 * ---------------------------------------------------------------------------
 * 🔴 **ROUND 2: THE DIMMING WENT TOO FAR AND THE ALBEDO WAS NEVER THE RIGHT COLOUR.**
 * ---------------------------------------------------------------------------
 * Cyan appears in NONE of round 1's twelve captures. Two independent causes, and this file
 * owns the second of them (the first is `wall.js`'s latched `barrier.visible` — see there):
 *
 * **The base colour could not have photographed as teal even when drawn.** `color` was
 * [0.055, 0.150, 0.175] — a near-black — and the two modulations below then multiplied it by
 * as little as `0.30 * 0.42 = 0.126`, i.e. an albedo of 0.019 in its own brightest channel,
 * inside an unlit cavity, with `metalness 0.34` moving a third of what was left out of the
 * diffuse term entirely. That is black by construction, at any exposure.
 *
 * John's art is unambiguous: a **saturated FLAT teal fill** behind a white rim. So the albedo
 * is a real teal, the relief and depth modulations keep their SHAPE but are compressed so they
 * shade the structure instead of crushing it, and metalness drops because a flat saturated fill
 * is paint on steel, not bare steel. The emissive is only nudged — the room should still be
 * what lights it, which is the part of the "not a beacon" note that was right.
 */
/**
 * ---------------------------------------------------------------------------
 * 🎯 **AND THE LAST MOVE IS CHROMA, NOT BRIGHTNESS — MEASURED BY `legibility-1`.**
 * ---------------------------------------------------------------------------
 * With the barrier finally on screen, a hue classifier at a real play station on the real
 * third-person camera put the game at **12.7% teal against the reference's 19.3%** — so the
 * signature is present at about two thirds of the reference's density, and what is left is
 * PURITY: it reads as a muted tint inside a warm gradient rather than as the reference's hard
 * white-rim-against-flat-teal break. Top-decile chroma 0.238 against a 0.14 gate.
 *
 * 🚨 **EXPOSURE CANNOT FIX THAT AND MAKES IT WORSE, WHICH IS WHY THE FIX IS HERE.** Driven
 * 1.85 → 4.0: chroma moved 0.238 → 0.147, the frame blew out to a median of 124, and the teal
 * fraction FELL to 8.5% — ACES compresses saturated colour toward white as it nears the
 * highlight rolloff. The estate's key light is warm, so DIFFUSE cannot hold a teal either: it
 * is multiplied channel-wise by roughly (1.0, 0.7, 0.45) and comes back grey.
 *
 * **Emissive is the only term that is neither lit by the room nor compressed as a highlight**,
 * so the barrier's chroma is moved onto it: a purer emissive (red down, blue up) at a higher
 * intensity, with metalness dropped because a flat saturated fill is paint on steel rather
 * than bare steel and metal moves albedo out of the diffuse term entirely. The room still
 * shades the relief — the marched members keep every one of their modulations.
 */
/**
 * 🔴 **ROUND 6: 0.52 -> 0.060, AND IT IS A CONSEQUENCE OF THE SHELL'S BANDS, NOT A TASTE MOVE.**
 *
 * The rule this number has to satisfy has never changed and is stated under uShowAt below: the
 * barrier's own contour must sit UNDER MATERIAL THAT IS STILL STANDING, so the edge you see is
 * always the white shell's cut edge and never the barrier's threshold. Round 5 satisfied it with
 * 0.52 because wall.js DAMAGE_BANDS[3] started at 0.68.
 *
 * Round 6 collapses the three shell bands into one wide tear and that band starts at **0.050** —
 * so a shell texel can be part-torn anywhere the smoothed depth exceeds 0.050, which on the
 * reference crater is a radius of 1.19 m. 0.030 puts the barrier's contour at 1.26 m, i.e.
 * **outside the furthest tooth the shell can lose**, with 7 cm of margin. Anything higher
 * re-opens the transparency bug (see uOpenAt) along the ragged fringe: material gone in front,
 * far face back-face culled, barrier discarded, and nothing in the wall at all.
 *
 * ⚠️ **IT CANNOT LEAK THE INTERCONNECT ANY EARLIER THAN 0.52 DID, FOR THE REASON THE G-CHANNEL
 * DISCARD HAS ALWAYS BEEN SOUND:** the G channel is only ever legible through material that has
 * already gone, and at a smoothed depth of 0.03 nothing has — the shell is intact out to 1.19 m
 * and the ornate skin out to 1.41 m. procedural-map.md section 2 holds by construction.
 *
 * ⚠️ Exported because wall.js needs the SAME number for the mesh-level visible flag. A mesh
 * switched off above the shader's threshold holds the cyan back behind an open hole.
 */
export const BARRIER_SHOW_AT = 0.030;

export function barrierMaterial(texture, opts = {}) {
  const m = new THREE.MeshStandardMaterial({
    /**
     * 🎨 **ROUND 4: 0.80x THE VALUE, AND IT IS A MEASUREMENT AGAINST THE ART, NOT A TASTE MOVE.**
     * 'critic-dig-3' sampled the rendered fill at about (64,164,169) sRGB against the
     * reference's (45,125,127) — a fifth too bright and slightly under-saturated. A pale bright
     * cyan is also the single most water-like value the fill could have, so the colour
     * correction and defect 1 pull the same way for once. Both terms scale together so the
     * albedo/emissive balance the note below argues for is preserved exactly.
     */
    /**
     * 🎨 **ROUND 5: NOT A SCALE THIS TIME — A HUE CORRECTION, AND IT IS MEASURED OFF THE
     * DELIVERED FRAME.** Round 4 scaled both terms by 0.80 against `critic-dig-3`'s reading of
     * the reference at (45,125,127) sRGB. With the contact shadow and the mottle deleted the
     * fill finally has ONE value to measure, and `chunk-thick.mjs`'s own scanline reads it at
     * **(39,145,150)** — so the brightness is now right in the red and still ~15% hot in green
     * and blue, i.e. the residual error is hue and not level. Green and blue come down 10% and
     * red goes up 10%, on the EMISSIVE only, because that is the term the render is actually
     * made of here (the albedo is a fifth of it inside an unlit cavity and moves the answer
     * about two units).
     */
    /**
     * 🎨 **ROUND 6: THE FILL UNDERSHOT ITS OWN TARGET BY 40 sRGB UNITS AND THE CORRECTION IS
     * BIGGER THAN IT LOOKS, BECAUSE THE COMPOSITE IS NOT LINEAR.**
     *
     * `critic-dig-4` measured the delivered fill at **(36-43, 113-121, 115-121)** against the
     * reference's **(2-51, 156-170, 163-170)** — darker and less saturated than the reference AND
     * than round 5's own claimed (34,135,140), so round 5's hue correction was applied to a
     * brightness that was already low and the two errors compounded. Red is inside the
     * reference's range; green and blue are ~45 units under it.
     *
     * ⚠️ **A 40-UNIT sRGB LIFT IS NOT A 1.4x MULTIPLIER ON THE EMISSIVE.** The composite is
     * exposure 1.85 -> ACES -> grade -> sRGB (`views/game.js`, `post/shaders.js`), and ACES
     * compresses hard in exactly this range. Inverting that chain numerically against the
     * MEASURED pixel — solve for the scene attenuation that reproduces (39,117,118) from the
     * shipped emissive, then re-solve the emissive that reaches (30,163,166) through the same
     * attenuation — puts green at ~0.59 and blue at ~0.65 linear, i.e. **2.1x and 1.8x**. Half
     * that would have moved the reading by about fifteen units and read as "still short",
     * which is the trap round 5 fell into.
     *
     * ⚠️ **RED IS LEFT NEARLY ALONE ON PURPOSE.** The same inversion predicts red 0 from the
     * emissive against a measured 39, so the red in the fill is NOT this term — it is the warm
     * key on the albedo plus the haze the composite mixes in before the tonemap. Cutting the
     * emissive's red further buys almost nothing and starts tinting the slab green; the albedo's
     * red comes down instead, which is where the measured red actually lives.
     *
     * 🎯 Predicted (30, 163, 166) against the reference's (2-51, 156-170, 163-170). It is a
     * prediction from a model calibrated on one pixel, so `chunk-thick.mjs`'s scanline is the
     * thing that decides it, not this comment.
     */
    /**
     * 🎯 **AND THE MEASURED CORRECTION, TAKEN OFF THE FIRST BUILD OF THIS ROUND.** The lift above
     * landed green and blue where they belong — `chunk-thick.mjs`'s scanline read
     * **(51-77, 157-185, 153-179)** against the reference's (2-51, 156-170, 163-170) — and
     * exposed the term the model had said would not move: **red came UP with them, 39 -> 51-77,
     * i.e. out of the reference's range at the top**. That is ACES: its input matrix mixes 0.355
     * of green and 0.048 of blue into red, so a saturated colour desaturates as it brightens and
     * red is not independently controllable by the red channel alone.
     *
     * So red goes to ZERO on the emissive and near-zero on the albedo — what is left is the warm
     * key, the haze the composite mixes in before the tonemap, and that ACES crosstalk, none of
     * which this material owns — and green comes down ~11% (185 was over the reference's 170)
     * while blue holds, which also restores the reference's ordering: **blue above green**, where
     * ours had green above blue.
     */
    color: new THREE.Color(...(opts.color ?? [0.002, 0.232, 0.296])),
    emissive: new THREE.Color(...(opts.emissive ?? [0.0, 0.500, 0.648])),
    emissiveIntensity: opts.emissiveIntensity ?? 1.05,
    /**
     * ⚠️ **ROUGHER THAN ROUND 2 (0.64 -> 0.82), AND THAT IS PART OF THE SAME FIX.** With the
     * relief gone the plane has ONE normal over 5.72 x 2.80 m, so a tight specular lobe puts a
     * single broad highlight across the slab — which is a gradient, which is the thing the
     * critic could not read past. A near-matte paint takes the room's light evenly.
     */
    roughness: opts.roughness ?? 0.82, metalness: 0.02, side: THREE.FrontSide,
  });
  const u = {
    tDamage: { value: texture },
    /**
     * 🔴 **ROUND 5: 0.62 -> 0.52, AND IT IS WHAT MAKES THE BOUNDARY CRISP.** The barrier used to
     * carry its own jittered silhouette, so its edge was a second ragged boundary a few
     * centimetres inside the shell's. At 0.52 the barrier's contour sits under material that is
     * still standing — `wall.js` `DAMAGE_BANDS[3]` is [0.68, 1.00] and layer 3 is an opaque
     * depth-writing plane until the dig reaches it — so **this threshold is never the thing you
     * see.** What you see is where the white ran out, and it is exactly as hard as the white's
     * own cut edge.
     *
     * ⚠️ It also cannot leak the interconnect any earlier than 0.62 did, and for the same
     * reason: the `_bd.g` discard is only ever legible through material that has already gone,
     * and at 0.52 nothing has.
     */
    uShowAt: { value: opts.showAt ?? BARRIER_SHOW_AT },
    uBStep: { value: new THREE.Vector2(...(opts.dmgStep ?? [0.033, 0.067])) },
    /**
     * 🐞 **ROUND 5: THE TRANSPARENCY BUG. THE INTERCONNECT WAS A WINDOW BEFORE IT WAS A HOLE.**
     *
     * John, after playing round 4: *"in one location the cyan wall became transparent."* It did,
     * and it was neither depth-write nor draw order — it is a hole in the **set of surfaces that
     * exist**, and it opens on exactly one kind of spot, which is why he saw it in one location
     * and not another:
     *
     *   · A shared wall band is TWO faces, one per room, each drawing its own 146 mm of stack
     *     with every plane `FrontSide` facing its own room (`wall.js` — the occlusion rule
     *     depends on it). **So the far face's material is back-facing from here and is culled.**
     *   · At an interconnect the G channel is 0, so the barrier plane discarded outright.
     *   · The shell's innermost layer opens at a smoothed depth of about 0.70; the wall is not
     *     physically through until `OPEN_AT` = 0.999.
     *
     * In that window — roughly 0.70 to 0.999, i.e. the first few blows after the white gives
     * way, and a ring around every interconnect crater after that — **this face's material is
     * gone, the far face's material is culled, and the barrier has discarded, so there is no
     * surface in the wall at all.** You see into the dark room beyond a wall that still stops a
     * body, still blocks sight for the AI (`passable()` reads `depth`, which is under `OPEN_AT`)
     * and still has 30 cm of masonry in it. Nothing threw and nothing was black-on-black: it
     * photographs as a clean view through a solid wall.
     *
     * The fix costs one uniform and one branch: where there is no barrier and this face is not
     * yet through, the barrier plane stops discarding and **draws the inside of the wall band**
     * instead — the same near-black the reveal box is painted, because that is literally what is
     * there. It discards only once the texel really is open, which is the same moment
     * `_couple()` opens the twin and the hole becomes a hole on both sides.
     *
     * ⚠️ **IT IS NOT A DAMAGE MODULATION OF THE CYAN**, which the rest of this round exists to
     * remove. It is a binary choice of WHICH MATERIAL a texel is — structure or cavity — taken
     * from a channel that is static for the whole run, and it never touches a texel with a
     * barrier behind it.
     */
    uOpenAt: { value: opts.openAt ?? 0.985 },
    /**
     * 🕳️ **THE FAR HALF OF THE BAND, AND IT IS THE THING JOHN COULD NOT SEE.**
     *
     * John, after playing 2026-08-09: *"I thought I had destroyed enough stuff but I couldn't get
     * through... you can't see the back side of the other wall and thats why im unable to see the
     * bits I can't get through."* He is right, and `harness/scenarios/_pf1-diag2.mjs` measures it:
     * a wall band is TWO faces, each drawing its own 146 mm of stack FrontSide toward its own
     * room, so **the far face's surviving material is backface-culled from here and its own
     * meshes are switched off entirely while it is pristine** (the diag reads the twin's four
     * layers as visible "falsefalsefalsefalse" — `wallinstances.js` is drawing it). Flipping the
     * dig arm to `DoubleSide` therefore cannot fix this and never could.
     *
     * `uOpenAt` above already closed HALF of it — the window where THIS face's material has gone
     * and it is not through yet. What it could not know is whether the OTHER half of the band is
     * still standing, because that lives in the twin's grid. So the twin's grid is sampled here,
     * with `u` mirrored (its local +x runs the opposite way round the wall — see `wall.js`
     * `_couple`), and the discard asks **the BAND**, not this face:
     *
     *     a texel is a hole  <=>  no barrier  AND  this face is through  AND  the far face is too
     *
     * ⚠️ **ONE SAMPLE, ONE PROGRAM, ZERO DRAW CALLS, ZERO MESHES.** The barrier plane already
     * exists on every dig face and already samples `tDamage`; this is a second sampler on the
     * same material, whose UNIFORM VALUES are per-panel while the compiled source is shared (see
     * `wall.js`'s `pinProgramKey` note for why that is safe and why a per-panel cache key is not).
     *
     * ⚠️ **`uTwin` 0 IS THE HONEST FALLBACK, NOT A STUB.** A face with no twin (none ship today;
     * `wall.js` wires this off `twin`'s setter) keeps exactly round 5's behaviour, because with
     * `uTwin` 0 the far-side term is forced to "open" and the test collapses to what it was.
     */
    tTwin: { value: texture },
    uTwin: { value: 0 },
    /**
     * 🎨 **WHAT IS ACTUALLY BEHIND THE HOLE, AND ROUND 5 PAINTED IT THE WRONG MATERIAL.**
     *
     * Round 5 filled this branch with `uCavity` — *"the same near-black the reveal box is
     * painted, because that is literally what is there."* **It is not what is there.** A reveal
     * box lines an APERTURE, which is a hole with air in it; a dig face's band is 0.30 m of solid
     * wall that nobody has been through. Painting it the cavity colour made the one surface that
     * proves the wall is still standing look exactly like a way through — the whole breach in
     * `progress/playtest/game.play.pf1-breach-from-the-gallery.png` is a black void with white
     * torn rims, and a player reads a black void as somewhere to walk.
     *
     * 🎯 **So it is the WHITE, and it is the same white the shell's inner face already is.**
     * `wall.js` `DIG_BAND_LOOK[3]` went to `bandColor` 0.780 in round 11 for precisely this
     * argument — *"the two white faces read as one material and the width of the surviving white
     * IS the remaining thickness of the wall"* — and this plane is the next surface in that same
     * stack, 38 mm further back, so it continues the ramp rather than introducing a fourth value.
     * The read the player gets is then binary and unmissable: **white is wall, black is through,
     * cyan is never.**
     *
     * ⚠️ **AND THE EMISSIVE HAS TO COME WITH IT, FOR ROUND 11's REASON EXACTLY** — see
     * `DIG_BAND_LOOK[3]`'s `bandEmissive` note: this plane is 146 mm inside a cavity that almost
     * no room light reaches, so an albedo lift on its own comes back as the same grey it
     * replaced. It sits a step under band 3's 0.062 because it is a step further in.
     *
     * ⚠️ **THE CYAN IS UNREACHABLE FROM THIS LINE AND THAT IS STRUCTURAL, NOT CAREFUL.** Both
     * terms are gated on `_bIsStruct`, the G channel, which is 1 wherever there is barrier — so
     * every texel of every dud face in the house takes the identical path it took before. What
     * changes is only texels with NO structure behind them: the interconnect, and any face after
     * the house-wide unlock.
     */
    uRemain: { value: new THREE.Vector3(...(opts.remain ?? [0.720, 0.712, 0.694])) },
    uRemainEmissive: {
      value: new THREE.Vector3(...(opts.remainEmissive ?? [0.055, 0.054, 0.052])),
    },
  };
  m.userData.barrierUniforms = u;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    const vi = shader.vertexShader.indexOf('void main() {');
    if (vi < 0) throw new Error('barrierMaterial: vertex patch matched nothing.');
    // ⚠️ The varying is still needed — this material carries no map, so three emits no `vMapUv`
    // and the face's own 0..1 parameterisation would otherwise not reach the fragment shader.
    // `vBView` and its `inverse(modelMatrix)` are gone with the march.
    shader.vertexShader = `${shader.vertexShader.slice(0, vi)}varying vec2 vDmgUv;
void main() {
  vDmgUv = uv;
${shader.vertexShader.slice(vi + 'void main() {'.length)}`;

    const fi = shader.fragmentShader.indexOf('void main() {');
    if (fi < 0) throw new Error('barrierMaterial: fragment pars patch matched nothing.');
    shader.fragmentShader = `${shader.fragmentShader.slice(0, fi)}
uniform sampler2D tDamage;
uniform float uShowAt;
uniform vec2 uBStep;
uniform float uOpenAt;
uniform sampler2D tTwin;
uniform float uTwin;
uniform vec3 uRemain;
uniform vec3 uRemainEmissive;
varying vec2 vDmgUv;

/**
 * 🚨 **THE BARRIER'S OWN EDGE WAS A GRID STAIRCASE AND NOBODY HAD LOOKED AT IT.** The old
 * "_bd.r < uShowAt" was a HARD threshold on a bilinearly-filtered 61 x 30 grid, so where the
 * wall in front had only just cleared it the cyan appeared as axis-aligned 9 cm rectangles with
 * 45-degree corners. Round 3 fixed it twice over: a one-cell tent so the field's iso-contours
 * have no kinks, AND a value noise so the boundary was torn rather than sampled.
 *
 * 🔴 **ROUND 5 KEEPS THE TENT AND DELETES THE NOISE, AND THE STAIRCASE STILL CANNOT COME BACK.**
 * The tear existed to hide a contour that is now permanently BEHIND STANDING MATERIAL -- see
 * uShowAt. A contour nobody can see does not need to be ragged, and while it was ragged it was a
 * second torn edge a few centimetres off the shell's, which is the coastline in person.
 * _bnoise2 and _bhash2 go with it; so do _bslab and the whole uBMottle path.
 */
float _bDepth(vec2 duv){
  vec2 h = uBStep * 0.5;
  return 0.36 * texture2D(tDamage, duv).b
       + 0.16 * (texture2D(tDamage, duv + vec2( h.x,  h.y)).b
               + texture2D(tDamage, duv + vec2(-h.x,  h.y)).b
               + texture2D(tDamage, duv + vec2(-h.x, -h.y)).b
               + texture2D(tDamage, duv + vec2( h.x, -h.y)).b);
}
void main() {${shader.fragmentShader.slice(fi + 'void main() {'.length)}`;

    const needle = '#include <map_fragment>';
    const mi = shader.fragmentShader.indexOf(needle);
    if (mi < 0) throw new Error('barrierMaterial: map patch matched nothing.');
    shader.fragmentShader = `${shader.fragmentShader.slice(0, mi)}
        vec2 _bd = vec2(_bDepth(vDmgUv), texture2D(tDamage, vDmgUv).g);
        /**
         * 🔴 **ROUND 5: THIS DISCARD IS THE WHOLE SHADER NOW.**
         *
         * Two questions, no shading: is there still wall in front of me (uShowAt, which sits
         * under standing material and is therefore never the visible edge), and is there a
         * barrier here at all (the G channel, which is the interconnect). Everything past
         * "#include <map_fragment>" used to modulate the slab by how far the player had dug and
         * by a metre-scale mottle, and both are gone -- John, after playing round 4: the cyan
         * *"seems to visually take damage just like the white layer."* It did. It does not now:
         * every kept fragment leaves this shader at the material's own constant colour and its
         * own constant emissive, so the ONLY thing a blow can change about the cyan is how much
         * of it you can see.
         * (No backticks in this comment: it lives inside an UNTAGGED JS template literal, which
         * lint-glsl.mjs does not scan -- HANDOFF records the sixth bundle outage in this exact
         * function.)
         */
        // nothing in front of me has gone yet
        if (_bd.r < uShowAt) discard;
        float _bIsStruct = step(0.5, _bd.g);
        /**
         * 🕳️ **IS THIS TEXEL A HOLE THROUGH THE BAND, OR ONLY A HOLE THROUGH MY HALF OF IT?**
         * Round 5 asked the first question with the second one's data and could not have known
         * the difference, because the answer lives on the twin. See tTwin above: its local +x
         * runs the opposite way round the wall, so u mirrors and v does not, which is the same
         * mapping wall.js _couple uses to mirror a breakthrough.
         */
        vec4 _bt = texture2D(tTwin, vec2(1.0 - vDmgUv.x, vDmgUv.y));
        float _bFarOpen = mix(1.0, step(uOpenAt, _bt.b) * (1.0 - step(0.5, _bt.g)), uTwin);
        // no barrier here (the interconnect) AND the WHOLE BAND is through: it is a hole.
        // Short of that there is still wall standing in it, from one side or the other.
        if (_bIsStruct < 0.5 && _bd.r >= uOpenAt && _bFarOpen > 0.5) discard;
        #include <map_fragment>
        // structure, or the white the wall is made of. One binary choice per texel, from a
        // channel that does not move while you dig -- NOT a shading of the cyan by how far the
        // dig has gone.
        diffuseColor.rgb = mix(uRemain, diffuseColor.rgb, _bIsStruct);
${shader.fragmentShader.slice(mi + needle.length)}`;

    const ei = shader.fragmentShader.indexOf('#include <emissivemap_fragment>');
    if (ei < 0) throw new Error('barrierMaterial: emissive patch matched nothing.');
    shader.fragmentShader = `${shader.fragmentShader.slice(0, ei)}#include <emissivemap_fragment>
        // The emissive is the term that holds the teal against a warm key, so the surviving white
        // has to lose it or the wall band glows cyan -- and it needs its OWN, for the reason
        // DIG_BAND_LOOK[3] gives: a surface 146 mm inside an unlit cavity comes back grey on
        // albedo alone. Constant per texel; see uRemain above.
        totalEmissiveRadiance = mix(uRemainEmissive, totalEmissiveRadiance, _bIsStruct);
${shader.fragmentShader.slice(ei + '#include <emissivemap_fragment>'.length)}`;
  };
  m.customProgramCacheKey = () => 'rrr-barrier-v7';
  m.needsUpdate = true;
  return m;
}

/**
 * Point a patched material's damage sampling at a different band, in place. Used by `wall.js`
 * only when a face's geometry is rebuilt; the band is otherwise a construction-time constant.
 */
export function setDamageBand(material, lo, hi) {
  const u = material.userData.breakUniforms;
  if (u?.uDmgBand) u.uDmgBand.value.set(lo, hi);
}

/** Set how far this layer has broken away. 0 = intact, 1 = gone. */
export function setBreak(material, v) {
  const u = material.userData.breakUniforms;
  if (u) u.uBreak.value = Math.max(0, Math.min(1, v));
}

export function getBreak(material) {
  return material.userData.breakUniforms?.uBreak.value ?? 0;
}

/**
 * Map a wall's stage onto per-layer break amounts.
 *
 * A layer that the stage has already passed is not simply hidden — it is broken *back*,
 * to a point short of gone, so its torn edge still frames the hole. That surviving frame is
 * the entire reason the stages read as layers rather than as swapped textures. Later
 * stages break the outer layers further, so the silhouettes nest.
 *
 * @param {THREE.Material[]} layerMats  index == layer, length 4
 * @param {number} stage 0..4
 * @param {number} [progress=1] 0..1 through the current transition, for animating a collapse
 */
export function applyStageBreaks(layerMats, stage, progress = 1) {
  for (let i = 0; i < layerMats.length; i++) {
    const m = layerMats[i];
    if (!m) continue;
    let b;
    if (i > stage) {
      b = 0;                                    // not reached yet: intact
    } else if (i === stage) {
      // The layer currently being chewed through. Freshly arrived at this stage it must be
      // INTACT — it is the wall's new surface, and it is what makes the stage identifiable.
      // A constant floor here punched a permanent hole in every stage's own surface.
      b = progress * 0.30;
    } else {
      // Already breached. A layer the wall has moved PAST is mostly gone — the contrast
      // between "intact, it is the surface" and "broken back to fragments" is the entire
      // signal that separates one stage from the next. The previous ramp only took the
      // framing to 0.58 at the open stage, so stage 3 and stage 4 both rendered as a full
      // grid and were indistinguishable in a blind crop. Never quite 1.0: something has to
      // remain to frame the opening and prove the wall had layers.
      // 0.80 for the layer one step back left so much of it standing that the layer the
      // stage is actually named after was not the dominant thing on screen: at the framing
      // stage the surviving lath covered the studs and the bottom third of the wall, and
      // the shot read as a lath wall with some timber in it.
      const age = stage - i;
      b = Math.min(0.95, 0.84 + age * 0.05);
    }
    // THE FINAL STAGE IS A STATEMENT ABOUT THE FRAMING.
    // "Open" means passable, and what has to give way for the wall to be passable is the
    // frame — not the paper, not the plaster. On the plain age ramp the framing at the open
    // stage sat one step past intact, so stage 3 (frame whole) and stage 4 (frame broken)
    // came out looking like the same wall with slightly different lath on it, and two
    // stages a critic can confuse are two stages that both fail. The innermost layer is
    // therefore pushed harder than its age alone would put it.
    if (i === layerMats.length - 1 && stage >= layerMats.length) b = 0.90;
    setBreak(m, b);
  }
}
