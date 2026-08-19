import * as THREE from 'three';
import { baker } from '../baker.js';
import { boiserieMat } from '../../world/materials-local.js';

/**
 * The four wall layer materials, one per standing destruction stage.
 * Stage 4 (open air) has no material — that is the point of it.
 *
 * Worked against the real demolition photographs in `refs/lath/`, particularly
 * `lath-and-plaster-wall.jpg`. Things that photograph made obvious and that a from-memory
 * version always gets wrong:
 *
 *   - Exposed lath is NOT clean timber. Every lath face is smeared and speckled with
 *     residual plaster where the key was squeezed through, so the field reads as mottled
 *     grey-white with wood grain showing through in patches — not as a stack of planks.
 *   - The gaps between laths read as near-black, much darker than you expect, because you
 *     are looking into an unlit cavity.
 *   - Plaster keys — the blobs that squeezed through the gaps and set — are the single
 *     detail that makes the stage unmistakable. They partly fill the gaps at irregular
 *     intervals.
 *   - The break edge has a crumbling LIP with hairline cracks radiating outward into
 *     intact plaster, and there is a warm reddish-brown coat visible deeper in.
 *
 * The five stages must be identifiable from a cropped screenshot with no context, so each
 * one is pushed apart deliberately on four axes at once: hue, relief amplitude, dominant
 * spatial frequency, and dominant direction.
 *
 *   stage      hue            relief   frequency         direction
 *   wallpaper  warm gold/rose  none     fine repeat       vertical drop
 *   plaster    cool off-white  low      broad + hairline   none (isotropic)
 *   lath       grey + wood     medium   ~30mm banding      STRONGLY horizontal
 *   beam       raw timber      high     ~400mm spacing     STRONGLY vertical
 *   open       —               —        —                  —
 */

/**
 * THE BREAK-ORDER FIELD, shared by all four layers.
 *
 * It used to be copy-pasted four times, identically, which is how four call sites came to
 * share a defect nobody could fix in one place.
 *
 * WHAT WAS WRONG WITH IT (measured, not guessed — harness/_be1_field.mjs dumps the baked
 * ORM alpha and thresholds it at the uBreak the view actually uses):
 * the field is radial x 0.72 + billow x 0.34 + fbm x 0.16, and fbmT returns a narrow bell
 * around 0.5, so the third term contributes about +/-0.013 of real amplitude. That leaves a
 * field whose ONLY structure is a radial ramp and a 1/5-of-a-tile billow — and a smooth
 * field thresholds into smooth lobes. On mat.lath's plaster the surviving set came out as
 * 41 connected components with a boundary/sqrt(area) of 39.9, i.e. a handful of big rounded
 * blobs: exactly the "smooth, soft, rounded cloud/scallop lobes" the studio grade caught.
 *
 * Note what this means: RAISING THE AMPLITUDE OF THE EXISTING NOISE CANNOT FIX IT. Bigger
 * lobes are still lobes. What is missing is a whole spatial band — the 5-25 cm scale at
 * which plaster actually comes apart. refs/lath/lath-clay-plaster-ceiling.jpg (the index's
 * "best break edge in the set") has three things at that scale and we had none of them:
 *
 *   CHUNKS    pieces that come away WHOLE, so the boundary steps from piece to piece
 *   FISSURES  the joints they separate along — which do not stop at the hole: the same
 *             network runs on into intact plaster as the hairline cracks radiating from
 *             the edge
 *   COURSES   plaster is keyed BETWEEN the laths, hanging off the blobs squeezed through
 *             the gaps, so it lets go a lath-course at a time and the edge follows the
 *             lath spacing. An isotropic field draws a circle with bites in it over a
 *             surface whose entire structure is horizontal.
 *
 * The chunk term is a per-cell CONSTANT offset rather than a noise: that is the whole
 * trick. A noise moves each texel independently and dissolves the edge; a constant per cell
 * moves a whole cell across the threshold at once, which is what "a piece fell off" means.
 *
 * uRagged 0 restores the original field EXACTLY — every new term is multiplied by it, and
 * x + 0.0 * y is x. The bake key carries the flag, so the two arms are different textures
 * rather than the same texture reinterpreted.
 */
// Tile means of the three biased terms in crumbleOrder(), measured on the GPU over the whole
// 1024-square tile by harness/_be1_means.mjs rather than estimated. They exist only to make
// the crumble mean-zero; see the note at the end of crumbleOrder().
// The voronoi F2-F1 distribution is scale free, so fis1/fis2 hold at every `cells` value;
// keyline's 0.25997 also lands on its analytic 0.26, which is the check that the measurement
// method is sound rather than plausible.
const CRUMBLE_MEANS = { fis1: 0.09552, fis2: 0.04824, keyline: 0.25997 };

const BREAK_FIELD = /* glsl */ `
uniform float uRagged;      // 0 = the legacy smooth field, 1 = crumble structure
#define CRUMBLE_FIS1_MEAN ${CRUMBLE_MEANS.fis1.toFixed(5)}
#define CRUMBLE_FIS2_MEAN ${CRUMBLE_MEANS.fis2.toFixed(5)}
#define CRUMBLE_KEYLINE_MEAN ${CRUMBLE_MEANS.keyline.toFixed(5)}
#define CRUMBLE_AREA_BIAS 0.0333

// ---------------------------------------------------------------------------
// BREAK ORDER (see materials/breakmask.js). 0 gives way first, 1 last.
// Damage starts near a hit point and spreads, so the field is a radial ramp warped by
// noise. Each layer gets a DIFFERENT noise character, which is what makes the nested
// silhouettes read as separate materials failing in their own way:
//   plaster  crumbles in rounded lumps  -> billowy, isotropic
//   lath     snaps along the grain      -> stretched hard in x, so it tears in strips
//   beam     splinters                  -> high frequency, ridged
// ---------------------------------------------------------------------------

// cells = chunks across the tile; courseRows = lath courses the edge steps along (0 = none);
// amt = per-layer trust in the whole crumble layer (paper tears in sheets, plaster in bits).
float crumbleOrder(vec2 uv, float cells, float courseRows, float amt){
  vec3 c1 = voronoiT(uv * cells, cells);
  vec3 c2 = voronoiT(uv * cells * 3.0, cells * 3.0);
  // CHUNKS: a constant per cell, so the cell crosses the threshold as one piece.
  float chunk = (c1.z - 0.5) * 0.130 + (c2.z - 0.5) * 0.058;
  // FISSURES: the cell walls give way first. F2-F1 is small exactly on a wall, which is why
  // voronoi is the right primitive here for the same reason it is right for plaster crazing
  // — the crack IS the cell boundary, not something drawn to look like one.
  float fis  = 1.0 - smoothstep(0.0, 0.075, c1.y - c1.x);
  float fis2 = 1.0 - smoothstep(0.0, 0.038, c2.y - c2.x);
  // COURSES: a constant per lath row plus a hold at the gap line, where the key is.
  float course = 0.0;
  if (courseRows > 0.5){
    float ly = fract(uv.y * courseRows);
    float keyline = 1.0 - smoothstep(0.0, 0.26, min(ly, 1.0 - ly));
    course = (hash11(floor(uv.y * courseRows) * 3.7 + 0.5) - 0.5) * 0.090
           + (keyline - CRUMBLE_KEYLINE_MEAN) * 0.048;
  }
  // MEAN-ZERO ON PURPOSE, AND THE MEANS ARE MEASURED RATHER THAN ASSUMED.
  // Every term above is a SHAPE term, and a shape term that also shifts the mean silently
  // re-tunes every uBreak on the board. The uncompensated first cut raised the plaster
  // surviving at mat.lath's own 0.89 from 12.0% of the tile to 16.1% — which would have put
  // more plaster over the lath at wall.2.lath, a PASS at 66 whose gate is "name the stage
  // from a context-free crop", i.e. precisely the thing more plaster makes harder. So the
  // three constants below are the tile means of fis, fis2 and keyline, measured by
  // harness/_be1_means.mjs, not estimated. What is left changes WHERE the material is and
  // not HOW MUCH, which is also what makes the before/after a fair comparison.
  // ...AND MEAN-ZERO IS NOT ENOUGH, WHICH IS WHY THIS SECOND CONSTANT EXISTS.
  // The kept set is the OUTSIDE of a blob, so its boundary is concave toward the kept side,
  // and a mean-zero perturbation of a concave boundary adds more area than it removes. That
  // is geometry, not bias: with the three means above subtracted the plaster surviving at
  // 0.89 still measured 16.06% of the tile against the legacy 11.96%. So this last constant
  // is solved for, on the field itself, with harness/_be1_field.mjs's offset sweep, and it
  // took two rounds because the sweep over-predicts by about a fifth — an offset does not
  // move the texels the cling term pins with max(). It is scaled by the same per-layer amt
  // the perturbation carries, so a layer that barely crumbles barely moves.
  // Landed at 12.24% of the tile against the legacy 11.96%, i.e. inside 2.3% relative, while
  // the boundary/sqrt(area) raggedness of the same set goes 54.9 -> 69.3 and the number of
  // separated pieces goes 306 -> 471. That pair of numbers IS the fix: the crumble changes
  // WHERE the plaster survives and how many pieces it survives in, not how much of it.
  return (chunk - (fis - CRUMBLE_FIS1_MEAN) * 0.090 - (fis2 - CRUMBLE_FIS2_MEAN) * 0.040
          + course - CRUMBLE_AREA_BIAS) * amt;
}

float breakOrderField(vec2 uv, vec2 origin, float spread, vec2 stretch, float ridgy,
                      float cells, float courseRows, float amt){
  vec2 d = (uv - origin) * stretch;
  float radial = length(d) / max(spread, 1e-3);
  float n = ridgy > 0.5
    ? ridged(uv * 7.0 + 3.0, 64.0, 4)
    : billow(uv * 5.0 + 3.0, 64.0, 4);
  float fine = fbmT(uv * 18.0 + 11.0, 64.0, 3, 2.0, 0.5);
  // noise perturbs the boundary hard enough that it never reads as a circle
  float f = radial * 0.72 + n * 0.34 + fine * 0.16;
  return clamp(f + uRagged * crumbleOrder(uv, cells, courseRows, amt), 0.0, 1.0);
}
`;

// ---------------------------------------------------------------------------
// STAGE 0 — silk damask wallpaper over plaster
// ---------------------------------------------------------------------------
const WALLPAPER_SURFACE = /* glsl */ `
uniform vec3  uGround;
uniform vec3  uMotif;
uniform float uRepeatX;
uniform float uRepeatY;
uniform float uFade;
uniform float uDamp;

${BREAK_FIELD}

// A damask motif: a symmetric ogee cartouche with a pomegranate centre, mirrored.
// Built from SDFs because a damask is *drawn*, and noise cannot fake bilateral symmetry.
float damask(vec2 p){
  p.x = abs(p.x);                                  // mirror — damask is always symmetric
  float m = 0.0;

  // central pomegranate / palmette
  m = max(m, 1.0 - smoothstep(0.0, 0.030, sdEllipse(p - vec2(0.0, 0.03), vec2(0.115, 0.175))));
  // petal lobes fanning off it
  for (int i = 0; i < 3; i++){
    float a = 0.42 + float(i) * 0.40;
    vec2 c = vec2(sin(a) * 0.20, cos(a) * 0.20 + 0.02);
    m = max(m, 1.0 - smoothstep(0.0, 0.026, sdEllipse(p - c, vec2(0.052, 0.105))));
  }
  // the ogee frame: two sweeping arcs meeting at top and bottom
  float arc = abs(length(p - vec2(0.30, 0.0)) - 0.34) - 0.030;
  m = max(m, (1.0 - smoothstep(0.0, 0.020, arc)) * (1.0 - smoothstep(0.36, 0.50, abs(p.y))));
  // scrolling tendrils
  float t1 = sdSeg(p, vec2(0.06, 0.26), vec2(0.20, 0.40)) - 0.016;
  float t2 = sdSeg(p, vec2(0.05, -0.24), vec2(0.19, -0.39)) - 0.016;
  m = max(m, 1.0 - smoothstep(0.0, 0.018, min(t1, t2)));
  return clamp(m, 0.0, 1.0);
}

void surface(in vec2 uv, inout Surf s){
  // half-drop match: alternate columns shift by half a tile, as real paper is hung
  vec2 g = uv * vec2(uRepeatX, uRepeatY);
  float col = floor(g.x);
  g.y += mod(col, 2.0) * 0.5;
  vec2 cell = fract(g) - 0.5;
  float m = damask(cell);

  // satin ground: fine vertical warp threads
  float warpTh = fbmT(uv * vec2(620.0, 6.0), 1024.0, 2, 2.0, 0.5);
  float weft   = fbmT(uv * vec2(6.0, 380.0), 512.0, 2, 2.0, 0.5);
  float broad  = fbmT(uv * 3.4 + 4.0, 64.0, 4, 2.0, 0.55);

  // Silk reads as silk because the motif is a SHEEN difference, not a colour difference:
  // the pattern is woven with the threads running the other way, so it catches light
  // differently rather than being painted a different colour.
  vec3 col3 = mix(uGround, uMotif, m * 0.42);
  col3 *= 0.965 + broad * 0.070 + warpTh * 0.022;

  // sun fade, strongest high on the wall
  float fade = smoothstep(0.15, 1.0, uv.y) * uFade;
  col3 = mix(col3, vec3(luma(col3) * 1.06 + 0.03), fade * 0.42);

  // water staining rising from the skirting, with a tide line
  float damp = (1.0 - smoothstep(0.0, 0.30, uv.y)) * uDamp;
  damp *= 0.55 + fbmT(uv * vec2(7.0, 3.0) + 19.0, 64.0, 3, 2.0, 0.5) * 0.9;
  float tide = (1.0 - smoothstep(0.0, 0.045, abs(uv.y - 0.20 - broad * 0.06))) * uDamp;
  col3 = mix(col3, vec3(0.30, 0.255, 0.205), clamp(damp, 0.0, 1.0) * 0.5);
  col3 = mix(col3, vec3(0.24, 0.20, 0.16), tide * 0.35);

  // a lifted seam every repeat, curling very slightly
  float seam = 1.0 - smoothstep(0.0, 0.004, abs(fract(uv.x * uRepeatX) - 0.5) - 0.494);

  s.albedo    = col3;
  // SHEEN, NOT EMBOSSING.
  // A woven damask has almost no relief — the motif is the same cloth with the float
  // threads running the other way, so it returns light differently while sitting flat. The
  // motif was carrying a 0.055 height step, five times the thread relief, and it read as a
  // stamped bump: at a grazing angle the pattern threw a shadow instead of catching a
  // sheen. So the height step goes down to thread depth and all the signal moves into
  // roughness, where it belongs.
  //
  // The two directions are also given different roughness: the ground is warp-faced and
  // the motif weft-faced, so as the light swings the pattern flips between darker and
  // brighter than its ground rather than staying a fixed lighter shape.
  float sheen = 0.66 - m * 0.30
              + (1.0 - m) * weft * 0.075          // ground: rougher across the weft
              - m * warpTh * 0.055;               // motif: the float threads polish it
  s.roughness = sheen + damp * 0.16 + fade * 0.05;
  s.metalness = 0.0;
  s.ao        = 1.0 - seam * 0.35 - damp * 0.10;
  s.height    = 0.5 + m * 0.011 + (warpTh - 0.5) * 0.05 - seam * 0.35;
  // Paper tears in big soft sheets and lifts at the seams first — so it gets the LARGEST
  // chunks (8 across the tile), no lath course (it is a skin, it is not keyed to anything)
  // and only half the crumble amplitude. A sheet of silk does not crumble; it rips.
  s.breakOrder = clamp(breakOrderField(uv, vec2(0.46, 0.54), 0.62, vec2(1.0, 0.9), 0.0,
                                       8.0, 0.0, 0.50) - seam * 0.25, 0.0, 1.0);
}
`;

// ---------------------------------------------------------------------------
// STAGE 1 — bare lime plaster
// ---------------------------------------------------------------------------
const PLASTER_SURFACE = /* glsl */ `
uniform vec3  uTint;
uniform float uCrazing;
uniform float uHair;
uniform float uPaperRemnant;   // torn wallpaper still clinging
uniform float uStudCount;      // must match the framing layer: plaster clings where lath did
uniform float uLathCourse;     // must match the LATH layer's lathCount: plaster is keyed to it
uniform vec3  uPaperCol;

${BREAK_FIELD}

// Crazing: a cell network. Real crazing follows shrinkage cells, so voronoi edges are
// literally the right primitive — the cracks ARE the cell boundaries.
float craze(vec2 p, float period, float w){
  vec3 v = voronoiT(p, period);
  return 1.0 - smoothstep(0.0, w, v.y - v.x);   // F2-F1 is small on a cell edge
}

// fbmT is a narrow bell around 0.5, so a smoothstep gate written over it returns mid-grey
// mush rather than the patches it reads like. Stretch the distribution first.
float pat(float v, float k){ return clamp((v - 0.5) * k + 0.5, 0.0, 1.0); }

void surface(in vec2 uv, inout Surf s){
  // TROWEL UNDULATION. Low-frequency, slightly directional sweeps from the plasterer's
  // arc. This is the thing almost everyone misses, and it is what makes plaster read as
  // hand-applied rather than as a flat painted board.
  float trowel = fbmT(uv * vec2(3.2, 2.6) + 1.0, 64.0, 3, 2.0, 0.55);
  float trowel2 = fbmT(rot(0.6) * uv * 6.5 + 8.0, 64.0, 3, 2.0, 0.5);
  float sweep = fbmT(uv * vec2(1.6, 5.0) + 21.0, 64.0, 2, 2.0, 0.5);
  // THE ARCS THEMSELVES. Trowel work is not isotropic noise: it is a series of long
  // shallow sweeps left by the blade, each with a faint ridge where the trowel lifted.
  // Noise alone gave a wobble too fine and too even to read as hand-applied at 2 m, which
  // is exactly the complaint. These are drawn as bands rather than sampled.
  vec2 aw = uv + vec2(fbmT(uv * 2.1 + 5.0, 64.0, 3, 2.0, 0.5) - 0.5,
                      fbmT(uv * 1.7 + 15.0, 64.0, 3, 2.0, 0.5) - 0.5) * 0.55;
  float arcs = sin((aw.x * 1.9 + aw.y * 3.1) * PI * 2.2)
             * sin((aw.x * 2.7 - aw.y * 1.3) * PI * 1.5);
  // and the hard edge where one pass overlapped the last
  float lap = smoothstep(0.55, 0.92, pat(fbmT(rot(1.1) * uv * vec2(2.4, 4.2) + 27.0, 64.0, 3, 2.0, 0.5), 2.6));

  // chalky fine tooth
  float tooth = fbmT(uv * 300.0, 512.0, 3, 2.05, 0.5);

  // crazing at two scales
  float c1 = craze(uv * 30.0, 30.0, 0.012) * uCrazing;
  float c2 = craze(uv * 62.0 + 3.0, 62.0, 0.018) * uCrazing * 0.45;
  float cracks = clamp(c1 + c2 * 0.7, 0.0, 1.0);

  // HORSEHAIR. Lime plaster is haired to stop it shrinking apart, and where the float has
  // dragged the surface the fibres sit proud of it. They were gated at smoothstep(0.90,
  // 0.99) over an fbm that essentially never reaches 0.9, so not one fibre was ever drawn.
  // Stretched and re-gated they come out as what they are: short bright hairs lying at
  // three different angles, sparse enough to be a 20 cm detail rather than a texture.
  float hair = 0.0;
  for (int i = 0; i < 3; i++){
    float a = float(i) * 2.1 + 0.3;
    float h = fbmT(rot(a) * uv * vec2(9.0, 260.0) + float(i) * 11.0, 512.0, 2, 2.0, 0.5);
    // a fibre is a thin bright line, so gate a narrow band near the top of the range
    hair = max(hair, smoothstep(0.62, 0.86, pat(h, 3.0)));
  }
  // they only show where the float has scuffed the surface open
  hair *= uHair * (0.45 + smoothstep(0.30, 0.80, pat(trowel2, 2.4)) * 0.85);

  vec3 col = uTint;
  col *= 0.945 + trowel * 0.075 + trowel2 * 0.030 + sweep * 0.020;
  col *= 1.0 + arcs * 0.030 + lap * 0.022;
  col *= 0.985 + tooth * 0.030;
  col = mix(col, col * 0.86, cracks * 0.55);        // cracks are shadowed lines
  col = mix(col, col * 1.16, hair * 0.6);           // fibres catch light

  // grime gathering at the floor line — gravity, not uniform noise
  float grime = (1.0 - smoothstep(0.0, 0.16, uv.y)) * (0.4 + trowel * 0.8);
  col = mix(col, vec3(0.235, 0.225, 0.205), clamp(grime, 0.0, 1.0) * 0.42);

  // TORN WALLPAPER REMNANTS still clinging. This is the cue that says "the paper came off
  // this wall" rather than "this wall was never papered", which is what separates stage 1
  // from a generic plaster wall.
  float edge = fbmT(uv * vec2(5.5, 4.0) + 31.0, 64.0, 4, 2.0, 0.55);
  float remnant = smoothstep(0.56, 0.60, edge) * uPaperRemnant;
  float curl = smoothstep(0.575, 0.60, edge) - smoothstep(0.60, 0.625, edge);
  col = mix(col, uPaperCol * (0.9 + trowel * 0.2), remnant);
  col = mix(col, uPaperCol * 1.25, curl * uPaperRemnant * 0.8);   // lit curling lip

  s.albedo    = col;
  s.roughness = 0.90 - tooth * 0.10 + cracks * 0.05 - remnant * 0.22 - hair * 0.10;
  s.metalness = 0.0;
  s.ao        = 1.0 - cracks * 0.30 - grime * 0.20;
  // Relief: broad trowel waves plus the arcs, incised cracks, and the paper sitting proud.
  // The undulation was carried entirely by two noise terms at 0.55 and 0.18 of the range,
  // which at this heightScale is a millimetre of wobble — invisible at 2 m, which is the
  // distance the wall is judged from.
  s.height    = 0.52 + (trowel - 0.5) * 0.80 + (trowel2 - 0.5) * 0.26
              + arcs * 0.16 + lap * 0.10 + hair * 0.05
              - cracks * 0.05 + remnant * 0.10 + curl * 0.22;
  // Plaster lets go along the crazing: a texel on a crack goes early. And it is the layer
  // the whole complaint is about, so it gets the full crumble: 14 chunks across a 3.2 m
  // panel is ~23 cm, which is the largest fragment in refs/dig/dig-gallery-leg-breach.jpg,
  // and the lath course locks the edge to the keys it actually hangs off.
  float pOrder = breakOrderField(uv, vec2(0.46, 0.54), 0.55, vec2(1.0, 1.0), 0.0,
                                 14.0, uLathCourse, 1.0) - cracks * 0.30;

  // WHAT CLINGS ON INTO THE OPEN STAGE.
  // Plaster only stays up where the lath under it stayed up, and the lath that stays up is
  // the stub still nailed to a stud. So tongues of plaster cling beside the stud lines, out
  // in the middle of the opening rather than only around its rim. They matter out of all
  // proportion to their area: cream against a black void is the highest-contrast thing the
  // open stage has, and a crop of the middle of the opening had nothing in it at all.
  float dStud = abs(fract(uv.x * uStudCount) - 0.5);
  float cling = 1.0 - smoothstep(0.09, 0.24, dStud);
  // Low frequency: a surviving piece of plaster is a SHEET the size of a hand or bigger
  // with a crumbling edge, not a spatter. At uv.y * 8 it broke into isolated white blobs
  // that read as droppings on the lath rather than as plaster that had not let go yet.
  cling *= smoothstep(0.40, 0.90, pat(fbmT(vec2(uv.x * 3.0, uv.y * 3.2) + 53.0, 64.0, 4, 2.0, 0.55), 3.0));
  // and it breaks off along the crazing like the rest of it
  cling *= 1.0 - cracks * 0.5;
  pOrder = max(pOrder, cling * 0.965);

  s.breakOrder = clamp(pOrder, 0.0, 1.0);
}
`;

// ---------------------------------------------------------------------------
// STAGE 2 — exposed lath. The hero stage.
// ---------------------------------------------------------------------------
const LATH_SURFACE = /* glsl */ `
uniform float uLathCount;    // laths across the tile height
uniform float uGapFrac;      // gap as a fraction of pitch
uniform float uStudCount;    // must match the framing layer: the nails are IN the studs
uniform vec3  uWood;
uniform vec3  uPlasterResidue;
uniform vec3  uCavity;
uniform float uKeys;         // plaster squeezed through the gaps
uniform float uResidue;

${BREAK_FIELD}

// fbmT averages several octaves of gradient noise, so its output is a narrow bell around
// 0.5 — nothing like the flat 0..1 that a smoothstep gate written over it assumes. Every
// "patchy" feature on this surface was gated that way and every one of them came out as a
// uniform mid-grey wash instead of patches: the plaster keys ran as a continuous pale line
// down every gap, and the residue never varied. Stretch the distribution first and the
// gates behave the way they read.
float pat(float v, float k){ return clamp((v - 0.5) * k + 0.5, 0.0, 1.0); }

void surface(in vec2 uv, inout Surf s){
  float pitch = 1.0 / uLathCount;
  float row = floor(uv.y * uLathCount);
  float ly = fract(uv.y * uLathCount);          // 0..1 within one pitch; the gap sits at 0

  // Riven lath is split by hand, so each one has slightly different width and a wandering
  // edge. Straight parallel bands are the giveaway of a fake.
  float rh = hash11(row * 7.3 + 1.0);
  float wob = (fbmT(vec2(uv.x * 5.0, row * 3.1), 32.0, 3, 2.0, 0.5) - 0.5) * 0.10;
  float gap = clamp(uGapFrac * (0.72 + rh * 0.55) + wob, 0.10, 0.52);

  // ---- THE SECTION.
  // The gap used to be a binary step, and that is exactly why the critic read it as dark
  // paint on a flat board rather than as depth into a cavity: a step has no slope, so the
  // height function handed the normal derivation a single texel of transition. One texel
  // at 1024 across a 3.2 m wall is 3 mm — sub-pixel at 2 m, so the groove could neither
  // catch a highlight on its arris nor shade its own interior. It was a line, not a hole.
  //
  // So the lath gets a real milled section instead: deep gap floor, a rounded arris up
  // onto the face, a slightly cupped face, a rounded arris off the top edge. Every one of
  // those is several texels wide and therefore actually shades.
  float arris = 0.10;
  float lo = smoothstep(gap - arris, gap + arris, ly);         // climbing out of the gap
  float hi = 1.0 - smoothstep(1.0 - arris * 1.4, 1.0, ly);     // over the top arris
  float faceH  = lo * hi;                       // smooth: this is what drives the normal
  float onFace = smoothstep(0.28, 0.72, faceH); // sharper: this is what drives colour
  float inGap  = 1.0 - onFace;
  float gy = clamp(ly / max(gap, 1e-3), 0.0, 1.0);   // 0 at the bottom of the gap, 1 at the top
  float across = clamp((ly - gap) / max(1.0 - gap, 1e-3), 0.0, 1.0);  // 0..1 up the face

  // riven lath cups as it dries, and adjacent boards cup opposite ways
  float cup = sin(across * PI) * (rh - 0.5);

  // ---- wood grain, running ALONG the lath (x), per-lath phase
  // 26 cycles across a 3.2 m wall is a 12 cm wavelength — that is not grain, it is a smear,
  // and it made the laths read as blurred paint strokes. Timber grain is a fine line.
  vec2 gp = vec2(uv.x * 62.0 + rh * 40.0, (across + row) * 3.0);
  float grain = fbmT(gp * vec2(1.0, 9.0), 256.0, 4, 2.05, 0.52);
  float rings = ridged(gp * vec2(0.35, 2.2), 64.0, 3);
  // saw / split marks across the face
  float split = smoothstep(0.80, 0.98, fbmT(vec2(uv.x * 90.0, row * 5.0), 256.0, 2, 2.0, 0.5));

  vec3 wood = uWood * (0.80 + grain * 0.40 + rings * 0.16);
  wood *= 0.92 + hash11(row * 13.7) * 0.18;     // per-lath timber colour
  wood = mix(wood, wood * 0.7, split * 0.5);

  // ---- RESIDUAL PLASTER on the lath face. The reference photograph is emphatic about
  // this: the laths are smeared and speckled with set plaster, so the field reads mottled
  // grey-white with wood showing through in patches. Clean timber is the classic error.
  float smear = fbmT(uv * vec2(11.0, 26.0) + row * 3.7, 128.0, 4, 2.0, 0.55);
  float resid = smoothstep(0.30, 0.72, pat(smear, 3.2)) * uResidue;
  // heavier at both arrises, where the plaster was pressed hardest into the gap
  // Modulated by the smear noise, not applied flat: a continuous pale band down both
  // arrises of every lath turned the field into hard bright/dark striping.
  float arrisPatch = smoothstep(0.25, 0.80, pat(fbmT(vec2(uv.x * 16.0, row * 4.1) + 7.0, 128.0, 3, 2.0, 0.5), 3.0));
  resid = clamp(resid + (1.0 - smoothstep(0.0, 0.26, min(across, 1.0 - across))) * 0.34 * arrisPatch * uResidue, 0.0, 1.0);
  vec3 face = mix(wood, uPlasterResidue * (0.86 + smear * 0.30), resid);

  // ---- nail heads, ON THE STUD LINES. They were at a different pitch from the framing
  // layer's studs, so the fixings sat where there was no stud to fix to.
  float studU = fract(uv.x * uStudCount);
  // the nail head is round in world space, and the two axes here have wildly different
  // world scales (one stud bay across vs one lath width up), so it has to be an ellipse
  // A lath nail head is 5 mm across. Sized by eye at 0.016 of a stud bay it came out at
  // 30 mm and rendered as a row of rivets down the wall.
  float nail = 1.0 - smoothstep(0.0, 0.0012, sdEllipse(vec2(studU - 0.5, across - 0.5), vec2(0.0048, 0.045)));
  nail *= onFace;
  face = mix(face, vec3(0.20, 0.185, 0.17), nail * 0.85);
  // rust bleeding down from the fixing
  float rust = (1.0 - smoothstep(0.010, 0.045, abs(studU - 0.5))) * smoothstep(0.55, 0.10, across);
  face = mix(face, vec3(0.30, 0.180, 0.115), rust * 0.28 * onFace);

  // ---- the cavity seen through the gap. It is not a flat black: it is darkest right
  // under the overhang of the lath above and opens out lower down where light gets in.
  float cavN = fbmT(uv * 40.0 + 9.0, 64.0, 2, 2.0, 0.5);
  vec3 cav = uCavity * (0.45 + cavN * 0.75) * (1.35 - gy * 1.0);
  // Through the gap, at every stud line, you see the FACE OF THE STUD a few centimetres
  // back — dim, but timber-coloured and unmistakably a solid object standing behind the
  // laths. This is the cue the critic was missing when the gaps read as dark paint: black
  // proves nothing, but something visible at a different depth proves there is a depth.
  float studSeen = 1.0 - smoothstep(0.13, 0.20, abs(fract(uv.x * uStudCount) - 0.5));
  cav = mix(cav, uWood * (0.14 + grain * 0.10) * (1.0 - gy * 0.45), studSeen * 0.85);

  // ---- PLASTER KEYS.
  // When the plaster was floated on, it was pushed through the gaps and slumped over the
  // back of the lath below, then set. This is THE detail that makes exposed lath read as a
  // plastered wall rather than as a slatted fence, and every demolition photograph has it.
  //
  // The previous version modulated the key by a 55-cycle noise, which chopped every key
  // into a dotted line of beads — it rendered as a string of pearls along each gap rather
  // than as lumps of plaster. Keys are LOW frequency: a key is a run of 5-20 cm that fills
  // its stretch of gap solidly, with a lumpy edge, and then there is a clear stretch with
  // nothing. So the run and the lumpiness are separate scales and the fine one only
  // perturbs the boundary, it never punches holes in the middle.
  float keyRun  = fbmT(vec2(uv.x * 3.4 + rh * 17.0, row * 1.9), 32.0, 3, 2.0, 0.55);
  float keyHere = smoothstep(0.26, 0.78, pat(keyRun, 4.2));          // where a key sits at all
  // Two lump scales, both only perturbing the key's TOP EDGE. A flat-topped band of pale
  // grey along the gap is a painted stripe; a scalloped edge at roughly a hand's width is
  // a row of squeezed-out lumps, and the difference is the whole effect.
  float keyLump = fbmT(vec2(uv.x * 26.0 + rh * 5.0, row * 3.3), 64.0, 3, 2.0, 0.5);
  float keyFine = fbmT(vec2(uv.x * 90.0 + rh * 3.0, row * 8.0), 256.0, 2, 2.0, 0.5);
  float keyTop  = gap * (0.30 + keyHere * 1.05)
                * (0.55 + pat(keyLump, 2.8) * 0.95 + (keyFine - 0.5) * 0.30);
  float key = keyHere * (1.0 - smoothstep(keyTop - gap * 0.10, keyTop + gap * 0.07, ly)) * uKeys;
  // it spills a little onto the arris of the lath below rather than stopping at the edge
  key *= 1.0 - onFace * 0.80;
  key = clamp(key, 0.0, 1.0);
  // A key is a blob of plaster forced through a slot: thickest at the bottom where it
  // slumped, rounding over to nothing at its top edge. Without the dome it modelled as a
  // flat card standing in the gap and caught no highlight at all.
  float keyDome = sqrt(clamp((keyTop - ly) / max(keyTop, 1e-3), 0.0, 1.0));
  // set plaster is paler, warmer and chalkier than the smears left on the lath faces
  vec3 keyCol = uPlasterResidue * vec3(1.20, 1.15, 1.04) * (0.88 + keyLump * 0.30);

  vec3 col = mix(face, cav, inGap);
  col = mix(col, keyCol, key);

  // dust and crumbs caught on the TOP arris of every lath — gravity. This was on the
  // bottom edge, which is the one edge gravity cannot put anything on.
  float crumbN = fbmT(vec2(uv.x * 30.0, row * 6.0) + 4.0, 128.0, 3, 2.0, 0.5);
  float ledge = smoothstep(0.76, 0.99, across) * onFace * smoothstep(0.34, 0.80, pat(crumbN, 3.4));
  col = mix(col, uPlasterResidue * 1.16, ledge * 0.55);

  float rough = mix(0.72 - grain * 0.10, 0.93, resid);
  rough = mix(rough, 0.98, inGap * 0.8);
  rough = mix(rough, 0.94, key);
  rough = mix(rough, 0.97, ledge * 0.8);
  rough -= nail * 0.35;                          // nail heads are smooth metal

  s.albedo    = col;
  s.roughness = clamp(rough, 0.05, 1.0);
  s.metalness = nail * 0.75;
  // AO carries the depth the normal map cannot: the top of the gap is under an overhang
  // and is nearly closed, the bottom of the gap catches a little light, and a key that
  // fills the gap removes the occlusion because there is no longer a hole there.
  s.ao        = 1.0 - inGap * (0.42 + gy * 0.50) + key * 0.55 - ledge * 0.10;
  // RELIEF IS THE POINT: laths stand proud, gaps recede hard, keys bulge back out
  s.height    = 0.22
              + faceH * 0.60
              + key * (0.22 + keyDome * 0.38)
              + cup * 0.07
              + (grain - 0.5) * 0.06
              - split * 0.05
              + ledge * 0.03
              + nail * 0.04;
  // Lath snaps ACROSS its length and tears away in whole strips, so the field is
  // stretched hard in x. A lath still nailed at a stud survives longer, so nails hold on.
  // The course term is the lath pitch ITSELF here, so a board goes as a board: one constant
  // per row means the whole lath crosses the threshold together instead of the tear cutting
  // across the middle of three boards at once.
  float lathOrder = breakOrderField(uv, vec2(0.46, 0.54), 0.50, vec2(0.30, 1.7), 0.0,
                                    10.0, uLathCount, 0.85)
                    + nail * 0.30 - split * 0.12;

  // ---------------------------------------------------------------------------
  // WHAT SURVIVES INTO THE OPEN STAGE.
  //
  // The break field is radial from the middle of the wall, so by construction the middle
  // is the most destroyed part of it — which is precisely where the blind-identification
  // crop is taken. Everything below exists to put material back into the centre of the
  // opening, because real demolition never leaves a clean void.
  // ---------------------------------------------------------------------------

  // SNAPPED STUBS. Lath is nailed to every stud it crosses. When the field is torn out the
  // boards snap at the nail line and leave a short stub still nailed to the stud — the
  // vertical column of ragged lath ends visible in every one of the reference photographs.
  // These are the single most identifiable thing in the opening: a stack of short broken
  // boards at a regular vertical pitch says "wall, stripped" and nothing else.
  // Asymmetric about the stud: lath snaps on ONE side of the fixing, not both, so the stub
  // that stays is a lopsided piece. Centring every stub on its stud produced a column of
  // neat rectangles that read as a barcode rather than as broken boards.
  float stubOff = (hash11(row * 4.7 + 13.0) - 0.5) * 0.26;
  float dStud = abs(fract(uv.x * uStudCount) - 0.5 - stubOff);
  float stubW = 0.030 + 0.130 * hash11(row * 3.3 + 5.0);
  // Not every row keeps one. A stub on every single lath turned each stud into a ladder of
  // rungs, and a ladder is the one thing this must not look like.
  float stub = (1.0 - smoothstep(stubW, stubW + 0.030, dStud)) * onFace
             * step(0.38, hash11(row * 15.1 + 2.0));
  // snapped, not sawn: the end wanders at two scales, the coarse one taking whole bites
  stub *= 0.72 + 0.34 * fbmT(vec2(uv.x * 18.0, row * 3.0), 64.0, 3, 2.0, 0.5)
               + 0.26 * fbmT(vec2(uv.x * 70.0, row * 7.0), 128.0, 2, 2.0, 0.5);
  // Graded, so the progression reads: at the framing stage nearly every stub is still
  // there, and by the open stage only the best-nailed ones are.
  lathOrder = max(lathOrder, stub * (0.820 + 0.19 * hash11(row * 9.7 + 3.0)));

  // HANGERS. A few whole laths stay nailed at one end and swing down across the opening
  // rather than falling clear. Deterministic mod() rather than a hash pick, because a hash
  // over the ~22 rows in play kept evaluating to nothing on screen.
  // One in four rather than one in three, and reaching two thirds of the way across rather
  // than 94%: at every third row and near-full width they lined up into a regular lattice
  // and the opening read as the side of a wooden crate instead of as a broken wall.
  float hanger = step(mod(row, 4.0), 0.5) * onFace;
  // fract() because uv.x exceeds 1 wherever the material is tiled, and a raw uv.x made
  // this smoothstep return 0 outside the first tile.
  float ax = fract(uv.x);
  float along = step(0.5, hash11(row * 7.1)) > 0.5 ? ax : 1.0 - ax;
  hanger *= smoothstep(0.52 + hash11(row * 2.7 + 8.0) * 0.34, 0.14, along);
  // ragged snapped end rather than a clean stop
  hanger *= 0.80 + 0.4 * fbmT(vec2(uv.x * 22.0, row * 5.0), 64.0, 2, 2.0, 0.5);
  lathOrder = max(lathOrder, hanger * 0.99);

  // ISLANDS. Isolated snapped fragments left anywhere across the field — the odd short
  // length wedged between two studs, or hooked on a nail. Small and sparse, but they are
  // what stops any given crop of the opening from being empty.
  float isl = smoothstep(0.62, 0.78, fbmT(uv * vec2(11.0, 6.0) + 41.0, 64.0, 4, 2.0, 0.5));
  isl *= onFace * (0.7 + 0.5 * fbmT(vec2(uv.x * 40.0, row * 4.0), 128.0, 2, 2.0, 0.5));
  lathOrder = max(lathOrder, isl * 0.935);

  s.breakOrder = clamp(lathOrder, 0.0, 1.0);
}
`;

// ---------------------------------------------------------------------------
// STAGE 3 — bare studs and noggins
// ---------------------------------------------------------------------------
const BEAM_SURFACE = /* glsl */ `
uniform float uStudCount;
uniform float uStudFrac;
uniform vec3  uTimber;
uniform vec3  uCavity;
uniform float uNoggin;

${BREAK_FIELD}

void surface(in vec2 uv, inout Surf s){
  // VERTICAL studs at wide spacing — the opposite direction and a much lower frequency
  // than the lath stage, which is what stops the two being confused.
  float sx = fract(uv.x * uStudCount);
  float sIdx = floor(uv.x * uStudCount);
  float sh = hash11(sIdx * 5.1 + 2.0);
  float halfW = uStudFrac * (0.86 + sh * 0.28);
  // GOUGES bitten out of the stud edges along its length. This framing was exposed by
  // something smashing through it, so a stud is never a clean rectangle — and a clean
  // rectangle is exactly what made a surviving stud at the open stage read as intact
  // stage-3 framing in a context-free crop. Baked in permanently, because the damage is
  // true at every stage where the framing is visible at all.
  float gouge = smoothstep(0.58, 0.94, fbmT(vec2(uv.y * 13.0 + sh * 21.0, sIdx * 4.3), 64.0, 3, 2.0, 0.5));
  float gouge2 = smoothstep(0.72, 0.97, fbmT(vec2(uv.y * 41.0 + sh * 9.0, sIdx * 2.1), 128.0, 2, 2.0, 0.5));
  // bite from one side at a time, so the stud stays structural rather than pinching out
  float side = step(0.5, hash11(floor(uv.y * 6.0) * 3.7 + sIdx)) * 2.0 - 1.0;
  float bite = (gouge * 0.42 + gouge2 * 0.22) * uStudFrac;
  float edge = abs(sx - 0.5) - bite * step(0.0, side * (sx - 0.5));
  float onStud = 1.0 - smoothstep(halfW, halfW + 0.008, edge);

  // one horizontal noggin partway up
  float nogY = 0.42 + sh * 0.06;
  float onNog = (1.0 - smoothstep(0.030, 0.036, abs(uv.y - nogY))) * uNoggin;

  float onTimber = clamp(onStud + onNog, 0.0, 1.0);

  // Rough sawn timber. Grain must run ALONG the member: high frequency across its width,
  // low frequency down its length. Sampling y at 30 made the grain band horizontally at
  // roughly the stud pitch, and the framing read as brick coursing rather than as wood —
  // which is the single thing that gave this stage away as stone.
  vec2 gp = vec2((sx - 0.5) * 3.0 + sIdx * 17.0, uv.y * 4.2);
  float grain = fbmT(gp * vec2(9.0, 1.0), 256.0, 4, 2.05, 0.52);
  float rings = ridged(gp * vec2(5.0, 0.35), 64.0, 3);
  float sawChatter = smoothstep(0.55, 0.95, fbmT(vec2(uv.y * 240.0, sIdx * 3.0), 256.0, 2, 2.0, 0.5));

  vec3 timber = uTimber * (0.80 + grain * 0.36 + rings * 0.18);
  timber *= 0.90 + sh * 0.20;
  timber = mix(timber, timber * 1.10, sawChatter * 0.35);

  // TORN NAIL HOLES in rows where the lath used to be nailed on. This is the memory of
  // the previous stage and it is what makes the framing read as *stripped*, not as new
  // construction — a detail worth more than any amount of extra grain.
  // A nail hole is a SMALL torn pit, roughly one nail wide. The previous version spanned
  // a third of each lath row and ran the full width of the stud, which rendered as a
  // ladder rung — the most obvious tell in the whole stage. Two staggered columns of
  // small pits, jittered, most of them missing.
  float rowI = floor(uv.y * 34.0);
  float lathRow = fract(uv.y * 34.0);
  float holeJit = hash12(vec2(sIdx, rowI));
  // two nail columns, inset from the stud edges, staggered row to row
  float nailCol = step(0.5, fract(rowI * 0.5)) > 0.5 ? 0.30 : 0.70;
  nailCol += (hash12(vec2(rowI, sIdx * 3.1)) - 0.5) * 0.10;
  float dx = (sx - 0.5) / max(halfW, 1e-3) * 0.5 + 0.5;   // 0..1 across the stud
  float hole = 1.0 - smoothstep(0.0, 0.055, length(vec2((dx - nailCol) * 1.4, (lathRow - 0.5) * 0.30)));
  hole *= step(0.52, holeJit);                            // most rows have no visible hole
  timber = mix(timber, timber * 0.42, hole * 0.75);

  // splintered fibres torn up where lath was levered off
  float splinter = smoothstep(0.86, 0.99, fbmT(vec2(uv.x * 180.0, uv.y * 40.0), 256.0, 2, 2.0, 0.5));

  vec3 cav = uCavity * (0.5 + fbmT(uv * 26.0 + 5.0, 64.0, 3, 2.0, 0.5) * 0.9);
  vec3 col = mix(cav, timber, onTimber);

  // dust on the top face of the noggin
  col = mix(col, vec3(0.55, 0.53, 0.50),
    (1.0 - smoothstep(0.0, 0.012, abs(uv.y - nogY - 0.030))) * uNoggin * 0.35);

  s.albedo    = col;
  s.roughness = mix(0.97, 0.80 - grain * 0.08 + splinter * 0.12, onTimber);
  s.metalness = 0.0;
  s.ao        = 1.0 - (1.0 - onTimber) * 0.85 - hole * 0.25;
  // studs stand well proud of a deep empty cavity — the biggest relief of any stage
  s.height    = 0.30 + onTimber * 0.62 + (grain - 0.5) * 0.07
              - hole * 0.18 + splinter * 0.10 + onNog * 0.05;
  // Framing is the last thing to go and it splinters. The cavity between studs has
  // nothing to break, so it is forced to 0 and is discarded immediately.
  // BREAK ORDER — what survives when the wall goes to open air.
  //
  // A stud does not vanish: it snaps, and its ends stay nailed to the head and sole
  // plates. So the top and bottom of every stud is anchored and survives longest, and a
  // few studs keep a long splintered stub mid-span. Without this the open stage was a
  // clean empty rectangle, and a context-free crop of it was pure black — unidentifiable,
  // which failed the blind test outright. The torn edge IS this stage.
  // Every stud keeps SOMETHING, and that is not decoration: the lath layer leaves a column
  // of snapped stubs still nailed at every stud line, and where the stud behind them had
  // gone entirely those stubs hung in mid-air with nothing holding them up. The two layers
  // have to agree about which studs are still standing.
  float ragged = 0.72 + 0.5 * fbmT(vec2(uv.x * 9.0, uv.y * 2.0) + 31.0, 64.0, 3, 2.0, 0.5);
  // one stud in three is missed by the blast and stands its full height. mod() rather than
  // a hash pick: over the three or four studs actually on screen a hash is coarse enough to
  // leave the whole middle of the opening — which is exactly where the blind crop is taken
  // — with nothing standing in it at all.
  float tall = step(mod(sIdx + 2.0, 3.0), 0.5) * 0.99;
  // the rest snap low and keep a jagged stump standing on the sole plate
  float snapY = 0.10 + 0.20 * hash11(sIdx * 5.9 + 21.0);
  float stump = (1.0 - smoothstep(snapY - 0.06, snapY + 0.02, uv.y)) * 0.97 * ragged;
  // and a short splintered length still nailed to the head plate, hanging into the opening
  float hung = smoothstep(0.84 + 0.10 * hash11(sIdx * 3.1 + 9.0), 0.99, uv.y) * 0.96 * ragged;
  float anchor = max(max(tall, stump), hung);

  // ANCHOR BIAS — why this exists.
  //
  // The anchor mask marks studs that resist breaking, and pinning them at 0.97 meant they
  // survived every break level the machine ever applies. So the identical central stud
  // stood at stage 3 AND at stage 4, and a context-free centre crop of the two stages was
  // the same picture with more black around it. An independent critic ran the blind gate
  // and named beam "open" and open "beam" — mutual confusion, which fails both.
  //
  // Anchoring now falls off toward the break origin. Framing at the edges of the wall
  // still holds (something must frame the opening), but framing in the middle gives way,
  // so at the open stage the centre is genuinely a hole you see the next room through
  // rather than the same lattice on a darker background.
  float aRad = clamp(length((uv - vec2(0.46, 0.54)) * vec2(1.0, 0.62)) / 0.42, 0.0, 1.0);
  float anchorBias = mix(0.54, 1.0, aRad * aRad);

  s.breakOrder = onTimber < 0.5 ? 0.0
    // Framing is the layer whose splintering was tuned hardest and is the one piece a blind
    // critic already separates from lath, so it gets the crumble at a third amplitude and
    // no course lock — a stud does not break in horizontal courses.
    : clamp(max(breakOrderField(uv, vec2(0.46, 0.54), 0.42, vec2(1.0, 0.55), 1.0,
                                7.0, 0.0, 0.34) + 0.18,
                anchor * 0.97 * anchorBias), 0.0, 1.0);
}
`;

// ---------------------------------------------------------------------------

/**
 * THE ABLATION TOGGLE, and why it is read HERE rather than in the views.
 *
 *   ?ragged=0   the pre-2026-08-05 smooth break field and the pre-2026-08-05 lip
 *   (default)   the crumbling edge
 *
 * Every consumer of these materials — the five wall.* views, mat.lath, wall.sheet,
 * wall.transition, game.play's panels and wallinstances.js's spent/pristine copies — goes
 * through these four factories, so reading the flag once here is what makes the revert
 * complete BY CONSTRUCTION rather than by remembering to gate five call sites. That is the
 * failure mode HANDOFF records four times in two days.
 *
 * It is put in the OPTIONS OBJECT, which is what the bake cache key is built from, so the
 * two arms are two different baked textures. A flag that only reached the runtime uniform
 * would leave the second arm reinterpreting the first arm's texture — the toggle would look
 * like it worked and the field would never revert.
 */
export function raggedBreak() {
  if (typeof location === 'undefined') return true;
  return new URLSearchParams(location.search).get('ragged') !== '0';
}

export function wallpaperMat(opts = {}) {
  const o = {
    ground: [0.455, 0.352, 0.268], motif: [0.585, 0.470, 0.330],
    repeatX: 3, repeatY: 4, fade: 0.55, damp: 0.70, size: 1024, repeat: [1, 1],
    ragged: raggedBreak(), ...opts,
  };
  return baker().standard({
    key: `ws.paper:${JSON.stringify(o)}`,
    size: o.size, surface: WALLPAPER_SURFACE,
    heightScale: 0.016, normalStrength: 1.0, repeat: o.repeat, anisotropy: 8,
    uniforms: {
      uGround: new THREE.Vector3(...o.ground), uMotif: new THREE.Vector3(...o.motif),
      uRepeatX: o.repeatX, uRepeatY: o.repeatY, uFade: o.fade, uDamp: o.damp,
      uRagged: o.ragged ? 1 : 0,
    },
  }, { envMapIntensity: 1.0, normalScale: new THREE.Vector2(0.8, 0.8) });
}

export function plasterMat(opts = {}) {
  const o = {
    tint: [0.735, 0.712, 0.660], crazing: 0.42, hair: 0.60, paperRemnant: 0.55, studCount: 3.5,
    // Must match lathMat's lathCount, for the same reason studCount must match the framing:
    // this plaster is keyed to THAT lath, and if the two disagree the courses the edge steps
    // along land in the middle of the boards behind them.
    lathCourse: 30,
    paperCol: [0.430, 0.335, 0.255], size: 1024, repeat: [1, 1],
    ragged: raggedBreak(), ...opts,
  };
  return baker().standard({
    key: `ws.plaster:${JSON.stringify(o)}`,
    size: o.size, surface: PLASTER_SURFACE,
    heightScale: 0.022, normalStrength: 1.0, repeat: o.repeat, anisotropy: 8,
    uniforms: {
      uTint: new THREE.Vector3(...o.tint), uCrazing: o.crazing, uHair: o.hair, uStudCount: o.studCount,
      uPaperRemnant: o.paperRemnant, uPaperCol: new THREE.Vector3(...o.paperCol),
      uLathCourse: o.lathCourse, uRagged: o.ragged ? 1 : 0,
    },
  }, { envMapIntensity: 1.0, normalScale: new THREE.Vector2(0.55, 0.55) });
}

export function lathMat(opts = {}) {
  const o = {
    // 22 laths over a 2.9 m wall is a 130 mm pitch — that is siding, not lath, and it is
    // why the field kept reading as a plank fence. Riven lath is ~25 mm wide with a ~10 mm
    // key gap; 40 puts the pitch at 72 mm, still generous but unmistakably lath. The extra
    // frequency is what forces the bake up to 2048: at 1024 a gap was three texels wide and
    // there was nothing left to draw a key or an arris into.
    lathCount: 30, gapFrac: 0.30, studCount: 3.5,
    wood: [0.310, 0.262, 0.208],
    plasterResidue: [0.618, 0.605, 0.572],
    cavity: [0.045, 0.040, 0.036],
    keys: 0.95, residue: 0.78,
    size: 2048, repeat: [1, 1], ragged: raggedBreak(), ...opts,
  };
  return baker().standard({
    key: `ws.lath:${JSON.stringify(o)}`,
    size: o.size, surface: LATH_SURFACE,
    heightScale: 0.090, normalStrength: 1.0, repeat: o.repeat, anisotropy: 8,
    uniforms: {
      uLathCount: o.lathCount, uGapFrac: o.gapFrac, uStudCount: o.studCount,
      uWood: new THREE.Vector3(...o.wood),
      uPlasterResidue: new THREE.Vector3(...o.plasterResidue),
      uCavity: new THREE.Vector3(...o.cavity),
      uKeys: o.keys, uResidue: o.residue, uRagged: o.ragged ? 1 : 0,
    },
  }, { envMapIntensity: 1.0, normalScale: new THREE.Vector2(1.25, 1.25) });
}

export function beamMat(opts = {}) {
  const o = {
    studCount: 3.5, studFrac: 0.16,
    timber: [0.395, 0.315, 0.225],
    cavity: [0.032, 0.030, 0.028],
    noggin: 1.0,
    size: 1024, repeat: [1, 1], ragged: raggedBreak(), ...opts,
  };
  return baker().standard({
    key: `ws.beam:${JSON.stringify(o)}`,
    size: o.size, surface: BEAM_SURFACE,
    heightScale: 0.14, normalStrength: 1.0, repeat: o.repeat, anisotropy: 8,
    uniforms: {
      uStudCount: o.studCount, uStudFrac: o.studFrac,
      uTimber: new THREE.Vector3(...o.timber),
      uCavity: new THREE.Vector3(...o.cavity),
      uNoggin: o.noggin, uRagged: o.ragged ? 1 : 0,
    },
  }, { envMapIntensity: 1.0, normalScale: new THREE.Vector2(1.4, 1.4) });
}

/** All four, in stage order. Index == stage. Stage 4 is null: open air has no surface. */
export function wallStageMaterials(opts = {}) {
  return [
    wallpaperMat(opts.wallpaper),
    plasterMat(opts.plaster),
    lathMat(opts.lath),
    beamMat(opts.beam),
    null,
  ];
}

/**
 * 🎯 **THE DIG'S OUTER SKIN IS THE ESTATE'S OWN WALL, NOT A DIG-FACE MATERIAL.**
 *
 * John, 2026-08-08: *"I want to get the digging chunk game feel happening with the ACTUAL
 * ESTATE ASSETS in the loaded slice per my art."* His reference reads
 * **ornate painted/gilded surface → white panelling body → cyan structure**, and the build read
 * **damask wallpaper → white plaster → lath → cyan**: the outermost thing you hit was a
 * material that appears nowhere else in the house.
 *
 * ⚠️ **IT IS `room.js`'S OWN `mats.wall` ARGUMENTS, TO THE DIGIT, AND THAT IS THE WHOLE POINT.**
 * `boiserieMat` is cached by a key built from its options object, so calling it with the same
 * `{paint, grime, size}` room.js passes returns **the same three baked textures** — no extra
 * bake, no extra VRAM, and the dig face's skin is not merely *like* the wall it is set into, it
 * is the same picture. The seam between "wall" and "the bit you can dig" disappears, which also
 * closes a tell: `procedural-map.md` §2 wants a closed connector to give nothing away, and a
 * band of damask in a boiserie room gave away the whole dig band before a blow landed.
 *
 * ⚠️ **`materials-local.js` IS NOT EDITED AND MUST NOT BE** — `room.ballroom` is PASS 90, the
 * board's best piece, and it draws this material. The one thing `boiserieMat` does not provide
 * is a **break-order field**: `baker.js` defaults `Surf.breakOrder` to 1.0 ("never breaks"), so
 * patched with the mask alone this material would either refuse to break or break with a
 * perfectly smooth boundary — and a smooth boundary is precisely the CG-soft scallop this round
 * exists to kill. So the break order is supplied SEPARATELY, out of the wallpaper stage's
 * already-baked ORM alpha: a field authored to tear *"in big soft sheets"*, which is what a
 * painted panel skin does, and it costs nothing because that bake happens today anyway.
 *
 * The throwaway material is disposed; `Material.dispose()` does not touch textures, and the
 * texture it hands over is owned by the baker's cache and outlives every material built from it.
 */
export function estateSkinMat(opts = {}) {
  const m = boiserieMat({ paint: [0.300, 0.258, 0.212], grime: 0.9, size: 1024, ...opts });
  const src = wallpaperMat();
  m.userData.rrrBreakField = src.roughnessMap;
  src.dispose();
  return m;
}
