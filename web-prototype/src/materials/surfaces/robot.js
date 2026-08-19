import * as THREE from 'three';
import { baker } from '../baker.js';
import { AO_UNIFORMS } from '../../post/pipeline.js';

/**
 * UNIT-4H material set. Values read off the turnaround sheet (Dev Art 1785277053522) and
 * recorded in ART_MANIFEST.md.
 *
 * The discipline here is RESTRAINT. This is an injection-moulded consumer robot, not a
 * weathered military prop. Every surface detail is at the threshold of visibility: mould
 * flow, orange peel, fine machining lines. A robot carrying grungy noise textures looks
 * worse than a clean one, and the sheet is unambiguous — these shells are showroom clean.
 *
 * What actually separates the shells from plastic-looking geometry is the CLEARCOAT and
 * the roughness *contrast* between the three families:
 *   white shells   glossy clearcoat, r 0.18   — the bright specular
 *   chrome satin   metal, r 0.28              — the structural mid tone
 *   mint caps      satin non-metal, r 0.42    — deliberately the dullest
 * That mint-vs-white sheen difference is a signature read on the sheet. If the mint is as
 * shiny as the shells, the character stops looking like the art.
 */

// ---------------------------------------------------------------------------
// White shell: mould-flow lines radiating from a gate, plus micro orange peel.
// ---------------------------------------------------------------------------
const SHELL_SURFACE = /* glsl */ `
uniform vec3  uTint;
uniform float uPeel;
uniform float uWear;
uniform float uGrime;    // 0 = showroom player, 1 = stage-3 hunter
uniform float uSootDark; // 0 = dusty grey deposit (legacy), 1 = heavy carbon. See the soot mix.
uniform float uSeam;     // 0 = the pre-round shell EXACTLY. 1 = the full panel network.
uniform float uSeamN;    // plate grid frequency, lines per uv unit
uniform float uSeamW;    // groove half-width, in uv units
uniform float uSeamBake; // 1 = the GROOVES are baked flat here. 0 = the render layer draws them.
uniform float uBrush;    // brushed-metal streak strength

// fbmT sums octaves, so by the central limit theorem its output is a narrow bell around
// 0.5 — it almost never reaches 0.9. Every gate written as smoothstep(0.9, 0.99, fbm)
// therefore never fires, which is why the weathering on this shell has been invisible.
// pat() stretches the distribution about its midpoint first so a gate means what it says.
float pat(float v, float k){ return clamp((v - 0.5) * k + 0.5, 0.0, 1.0); }

/* ===========================================================================================
 * PANEL SEAMS — the surface half of "the art is brushed metal with panel seams and deep
 * occlusion, the render is matte white plastic".
 *
 * MEASURED, on a chroma-key capture masked identically to assets/mv/player/baseline_front.png
 * (harness/_kit8_shellvalue.mjs), the whole figure:
 *
 *                                    ART          RENDER before
 *   shell pixels below luma 90     13.9-15.9%     0.56-1.16%
 *   same, LEGS only                10.0-10.9%     0.01-0.11%
 *   local-trough density, depth 14 12.1-13.6%     2.4-3.9%
 *   value spread p95-p05           ~159           ~111
 *
 * Those are not four defects, they are ONE. The art's darks ARE its seams: every dark pixel on
 * the reference's legs is a panel gap, a plate shadow or a joint recess, and the trough detector
 * and the sub-90 count are therefore measuring mostly the same pixels. A seam network that
 * covers 12-15% of the surface and bottoms out below half the shell's value closes all four at
 * once, and nothing else on the shell can close any of them — the base tint, the mould flow and
 * the orange peel are all sub-1% modulations by construction (this file's rule is RESTRAINT,
 * and that rule is right for the FINISH and wrong for the STRUCTURE).
 *
 * WHY UV SPACE AND NOT WORLD SPACE. The pattern has to be indexed by something that is ATTACHED
 * to the surface. The player is a SKINNED mesh, so its surface moves through world space every
 * frame and a world-space pattern swims across the skin as the character walks; object space is
 * no better, because the skin deforms relative to the object too. The only frame that rides the
 * surface is the texture coordinate. So the pattern is a function of uv — but see the next
 * paragraph for where it is EVALUATED, which is a separate question and used to be answered
 * wrongly here.
 *
 * ⚠️ WHY THE GROOVES ARE NO LONGER BAKED INTO THIS TEXTURE — uSeamBake DEFAULTS TO 0.
 *
 * Baking evaluates this function once into a tile and multiplies it into the albedo FLAT, at the
 * same strength on every texel. On the procedural robot that is fine, because its unwrap is
 * body-aligned and its charts are large. On the GENERATED player (mesh.animated) it is not: that
 * GLB is one mesh whose atlas is 405 charts with a median uv-bbox diagonal of 0.070 — about
 * 14 cm of surface — at arbitrary orientations, so a uv-space grid cannot be body-aligned and
 * the network lands as a uniform crazed glaze across the whole figure. Measured: mean |second
 * difference| of luma along a row (the 'facet' column of harness/_kit8_shellvalue.mjs) sat at
 * 17.9-18.7 against the reference art's 9-12 in every setting that also delivered the darks.
 *
 * The reference does not distribute its darks uniformly. It concentrates them at joints, plate
 * edges and recesses and leaves the large convex faces — thigh front, chest, forearm — clean.
 * That is a GEOMETRIC statement, and no function of uv can make it: uv does not know what is a
 * joint. The masks that do know are already computed per pixel in the render-time weathering
 * layer below (rrwCav from the AO buffer, rrwPool/rrwProud from screen-space curvature), and
 * 'vMapUv' is available there because this material has maps. So the network moved: the pattern
 * is still this function of uv, evaluated per pixel at render time and MULTIPLIED BY A GEOMETRIC
 * GATE. Curvature is stable on a deforming skinned mesh — it is a property of the surface at the
 * instant it is shaded — so this does not reintroduce the swimming that world space would.
 *
 * '?seambake=1&rseams=0&rseamnear=0' puts the flat bake back, and it is an EXACT revert rather
 * than an approximate one: that capture is byte-identical to the pre-round one, 0 of 6 220 800
 * bytes differing, which is the same floor a same-config control pair reads on this harness.
 * Everything below still runs at uSeamBake 0: the PLATE-TO-PLATE VALUE STEP and the BRUSHED
 * FINISH stay baked, because both are broad surface properties rather than structure and
 * neither is a geometric statement.
 *
 * MEASURED, mesh.animated ?solo=1&clip=walking, whole figure, neutrality cuts 20 and 30
 * (harness/_kit8_shellvalue.mjs). Every row is a capture, not an estimate:
 *
 *                                    dark<90     legs      seam@14    spread     facet
 *   nothing (?seams=0&occ=0)         0.7-1.0%   0.0-0.1%   3.4-3.7    107-111    7.4-7.5
 *   occlusion only (?seams=0)        2.8-3.4%   1.6-2.0%   5.4-6.0    119-122   10.3-10.5
 *   FLAT BAKE (the previous round)  10.3-12.0%  6.5-9.1%  13.0-14.6   163-166   17.9-18.7
 *   SHIPPED (gated, render-time)    10.0-12.3%  6.6-10.1% 11.6-13.2   156-162   17.4-18.0
 *   ART (assets/mv/player/...)      13.9-15.9% 10.0-10.9% 12.1-13.6    ~159       9-12
 *
 * WHAT THAT SAYS. The seam density and the value spread both move ONTO the reference's band
 * from the wrong side of it — the flat bake was over on troughs (13.0-14.6 against 12.1-13.6)
 * and over on spread (163-166 against ~159), which is the arithmetic signature of too many
 * lines, and both now sit inside. The darks and the legs hold what the previous round bought.
 *
 * ⚠️ AND THE HONEST PART: FACET ENERGY BARELY MOVED, 17.9-18.7 -> 17.4-18.0, AGAINST THE ART'S
 * 9-12. The crazing is gone from the capture — the open faces of the chest, the thigh fronts
 * and the forearms are clean where they were covered in dashes — but the instrument that named
 * the defect does not register the fix, and it is worth saying why rather than quoting the
 * number as a win. Facet energy is a second difference of luma; it counts how MUCH dark line
 * there is, not where it is. Every configuration swept in this round, across three independent
 * levers (line depth, line width, gate floor), bought darks at a fixed 1.0-2.0 points of
 * dark<90 per point of facet energy above the 7.4 floor, whatever the placement. It is a
 * coverage meter, and it caught the flat bake only because that bake was ALSO over-covered.
 *
 * So it cannot be driven to the art's band by moving seams around, and it should not be tried:
 * reaching 13.9-15.9% of darks along that line costs facet about 19 no matter how the lines are
 * arranged. The art is not on the line at all — 14-16% of dark at facet 9-12 — because its
 * darks are large SMOOTH masses of painted shadow rather than troughs. Nothing indexed by uv,
 * and nothing built from a per-fragment derivative on a 10k-triangle mesh, produces those. That
 * gap is a LIGHTING AND OCCLUSION problem — a real AO with a large world radius, or a shadowing
 * fill — and should be opened as one rather than paid for with more seams.
 *
 * WHY THAT IS AFFORDABLE HERE, which had to be checked rather than assumed. The animation GLB is
 * ONE mesh with ONE UV set, unwrapped to 98.7% occupancy of the 0..1 square, at a texel density
 * of 2.044 model units per uv unit (p05 1.077, p95 3.383, so a 3.1x spread across the body).
 * The character is 1.7 m, so one uv unit is about 2.04 m of surface and the grid frequency below
 * is a real physical plate size:  uSeamN 17  ->  2.04/17 = 12 cm plates, which is the reference's
 * own plate scale on the thigh and shin.
 *
 * WHAT THE NETWORK CANNOT BE. A dense atlas packs unrelated islands next to each other, so a
 * grid line is continuous in uv and discontinuous in 3D — the seams are a plausible panel
 * LANGUAGE, not lines that follow this particular model's plate boundaries. Two things make that
 * read as deliberate rather than as wallpaper: each segment is gated on its own hash, so a line
 * runs the length of one plate and stops instead of ruling the whole body like graph paper, and
 * each line is jittered off its grid position so the network is not visibly square.
 * =========================================================================================== */

// Same construction as rrwHash below — fract-multiply rather than the usual sin(dot(...)), which
// is not portable across drivers and would bake a different network on different machines.
float sHash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Distance, in UV UNITS, to the nearest line of a segmented, jittered grid of frequency n.
// Only the two candidate lines either side of the sample can be nearest (the jitter is capped
// well under half a cell), so this is four hashes and no search.
float panelDist(vec2 uv, float n, float seed, float density){
  vec2 g = uv * n;
  vec2 c = floor(g);
  float d = 1e9;
  for (int i = 0; i < 2; i++){
    // lines of constant U. The existence gate is keyed on (line index, ROW), so a line breaks
    // between plates; the jitter is keyed on the line index alone, so the whole line moves
    // together and the gate — which is keyed on the other axis — cannot disagree with it.
    float ex = c.x + float(i);
    float jx = (sHash(vec2(ex * 1.7, seed)) - 0.5) * 0.30;
    float onx = step(1.0 - density, sHash(vec2(ex, c.y) + seed + 11.0));
    d = min(d, onx > 0.5 ? abs(g.x - ex - jx) / n : 1e9);

    float ey = c.y + float(i);
    float jy = (sHash(vec2(seed, ey * 1.3)) - 0.5) * 0.30;
    float ony = step(1.0 - density, sHash(vec2(c.x, ey) + seed + 23.0));
    d = min(d, ony > 0.5 ? abs(g.y - ey - jy) / n : 1e9);
  }
  return d;
}

void surface(in vec2 uv, inout Surf s){
  // orange peel — the faint dimpled texture every moulded gloss panel has
  float peel = fbmT(uv * 190.0, 256.0, 3, 2.05, 0.5);
  // mould flow: long soft streaks following the fill direction
  float flow = fbmT(uv * vec2(3.0, 34.0) + 7.0, 64.0, 3, 2.0, 0.55);
  // very sparse handling marks, only where a thumb would land
  float smudge = smoothstep(0.62, 0.95, pat(fbmT(uv * 9.0 + 21.0, 64.0, 3, 2.0, 0.5), 2.6));

  vec3 col = uTint * (0.995 + flow * 0.010);
  col *= 1.0 - smudge * 0.012 * uWear;

  float rough = 0.175 + peel * 0.030 * uPeel + flow * 0.014 + smudge * 0.055 * uWear;
  float height = 0.5 + (peel - 0.5) * 0.10 * uPeel + (flow - 0.5) * 0.05;
  float ao = 1.0;

  // ---------------------------------------------------------------------------
  // PANEL NETWORK, PLATE-TO-PLATE VALUE, AND THE BRUSHED FINISH.
  // See the block comment above panelDist() for the measurement this closes.
  // uSeam = 0 reproduces the previous surface EXACTLY — nothing below runs.
  // ---------------------------------------------------------------------------
  if (uSeam > 0.0001){
    // sb is the GROOVE's share of the baked tile, and it is 0 by default — see the uSeamBake
    // paragraph above. The plate step and the brush below are gated on uSeam alone and stay.
    float sb = uSeam * uSeamBake;
    // Two networks. The coarse one is the plate boundary; the finer, much sparser one is the
    // sub-division a real panel carries (an access hatch, a bolted-on cover). One network alone
    // reads as a single repeated cell size, which is the tell that gives wallpaper away.
    /*
     * SEGMENT DENSITY 0.62 -> 0.88, AND THE SUB-NETWORK 0.26 -> 0.10. This is the difference
     * between panelling and crackle, and the facet-energy instrument found it before the eye did.
     *
     * At 0.62 a little over half of each line's segments survive, so what bakes is not a grid of
     * plate outlines but a field of short disconnected DASHES — and with 405 uv charts at
     * arbitrary orientations, dashes are exactly the crazed-glaze read the round-2 and round-3
     * captures show. Mean |second difference| of luma measured 19-26 against the reference's
     * 9-12 in every setting that delivered the darks, which is the same fact in a number: the
     * energy was in stroke ENDS, and a dash has two of them per unit length where a continuous
     * line has none.
     *
     * At 0.88 a line runs the length of a chart and stops at its border, which is what a panel
     * seam does. The width comes down with it to hold total coverage roughly constant, because
     * continuous lines cover more than dashed ones at the same frequency.
     */
    float dCoarse = panelDist(uv, uSeamN,        3.0, 0.88);
    float dFine   = panelDist(uv, uSeamN * 2.7, 71.0, 0.10);
    float d = min(dCoarse, dFine);

    // A GROOVE IS A CORE AND A SHOULDER, and the shoulder is what carries the read. The core is
    // the gap itself and goes nearly to the gap material's own value; the shoulder is the
    // ambient light the gap steals from the millimetre of shell either side of it. Rendered, the
    // core is a few pixels wide and the shoulder is what the eye actually registers as a seam.
    // ROUND 2 — SOFTER AND WIDER, and it is a FACET-ENERGY correction as much as a taste one.
    // Round 1 ran the core hard-edged at 0.40 of the half-width and measured facet energy
    // (mean |second difference| of luma along a row) 22-25 against the reference's 8-12, i.e.
    // the shell had become a field of hard-edged strokes. It photographed as cracked eggshell.
    // A real moulding gap is a soft-bottomed groove with a long ambient shoulder, and softening
    // the profile is what separates "panel line" from "ink".
    float core     = 1.0 - smoothstep(uSeamW * 0.15, uSeamW,       d);
    float shoulder = 1.0 - smoothstep(uSeamW,        uSeamW * 3.6, d);

    // PLATE VALUE. Adjacent plates on the reference sit at visibly different values because they
    // are separate pressings that face slightly differently — it is most of why the art's legs
    // have a value range at all where ours were one continuous tone.
    float plate = sHash(floor(uv * uSeamN) + 5.0);

    // BRUSHED FINISH. The tool marks on a real brushed part run along the part, and the part's
    // axis changes from plate to plate, so the direction is chosen per plate. Two axis-aligned
    // families rather than an arbitrary rotation: a rotated sample breaks fbmT's tiling period,
    // and these textures are baked with RepeatWrapping.
    float brushU = fbmT(uv * vec2(2.0, 900.0), 2048.0, 2, 2.0, 0.5);
    float brushV = fbmT(uv * vec2(900.0, 2.0), 2048.0, 2, 2.0, 0.5);
    float brush  = mix(brushU, brushV, step(0.5, sHash(floor(uv * uSeamN) + 19.0)));

    col *= 0.970 + plate * 0.055 * uSeam;
    col *= 1.0 + (brush - 0.5) * 0.045 * uBrush;
    col *= 1.0 - core     * 0.62 * sb;
    col *= 1.0 - shoulder * 0.13 * sb;

    // The groove has lost its clearcoat and its polish; the brush adds a fine roughness streak,
    // which is what makes a metal read as brushed rather than as polished or as matte.
    rough  = mix(rough, 0.88, core * sb);
    rough += (brush - 0.5) * 0.11 * uBrush;
    ao     = min(ao, 1.0 - (core * 0.60 + shoulder * 0.28) * sb);
    // The height cut is nearly halved from round 1 for the same reason as the profile above: at
    // 0.85 with heightScale 0.006 over a two-texel groove the generated normal is a vertical
    // wall, and a wall catches a hard specular edge on both flanks — which is most of what the
    // facet-energy instrument was reading.
    height -= (core * 0.45 + shoulder * 0.16) * sb;
  }

  // ---------------------------------------------------------------------------
  // CORRUPTION. Only above zero on the hunter. The progression sheet's whole read is
  // that this is the SAME chassis gone wrong, so the corruption sits on top of the
  // player's material rather than replacing it.
  // ---------------------------------------------------------------------------
  if (uGrime > 0.001){
    float g = uGrime;

    // SOOT: broad mottled patches, biased downward because smoke and filth settle. Two
    // scales so it reads at 5 m and at 30 cm.
    // Three scales, not two. At two the low frequency wins and the shell comes out in
    // dalmatian blotches; the reference's filth is a continuous field that happens to be
    // denser in places, which needs a mid band to bridge the blob and the speckle.
    float sootBig  = pat(fbmT(uv * 5.5 + 51.0, 64.0, 4, 2.0, 0.55), 2.2);
    float sootMid  = pat(fbmT(uv * 11.0 + 29.0, 64.0, 3, 2.0, 0.52), 2.1);
    float sootFine = pat(fbmT(uv * 26.0 + 8.0, 64.0, 3, 2.0, 0.5), 2.0);
    // Soot settles on horizontal surfaces as well as running down vertical ones, and the
    // reference's heaviest deposits are on the SHOULDERS and upper back. A pure gravity
    // bias left the chest showroom-white under a filthy pair of legs.
    float gravity  = 1.0 - smoothstep(0.0, 0.95, uv.y);
    float soot = clamp(sootBig * 0.56 + sootMid * 0.42 + sootFine * 0.24, 0.0, 1.0)
               * (0.66 + gravity * 0.48);

    // The GATE SLIDES with grime; the RESULT is not scaled by it. Multiplying the finished
    // mask by uGrime is what made stage 1 read as showroom clean to a critic: every patch
    // came out at 30% strength, which is a uniform faint grey wash, not dirt. Sliding the
    // threshold instead means low grime = a few genuinely dark patches on an otherwise
    // clean shell, high grime = near-total coverage. Dirt is coverage, not opacity.
    soot = smoothstep(0.56 - g * 0.42, 1.06 - g * 0.30, soot);
    // Bias the mid-tones DOWN. Without this the mask sits around 0.5 over most of the
    // shell and every texel gets half-darkened, which is a uniform grey wash — the shell
    // stops being white-with-filth-on-it and becomes granite. Dirt reads as dirt only when
    // there is still clean shell next to it to compare against.
    soot = pow(soot, 1.55);

    // RUST BLEED: warm orange-brown weeping DOWNWARD from horizontal seam lines. Streaks
    // are stretched hard in y and gated so they start at a seam and fade as they run.
    // Stage 1 has none per the ramp table, so it ramps in from grime 0.42.
    //
    // RUST IS A GARNISH, NOT A BASE COAT. Run wide it turns the shells into bark or
    // jungle camouflage, which is a completely different creature from the reference: the
    // hunter's dominant weathering is grey-black SOOT, with rust only where a seam has
    // been weeping. So the streaks are gated narrow and kept sparse on purpose.
    float seam = smoothstep(0.80, 0.99, pat(fbmT(vec2(uv.x * 2.0, uv.y * 26.0), 128.0, 2, 2.0, 0.5), 3.0));
    float bleed = pat(fbmT(uv * vec2(26.0, 2.2) + 33.0, 128.0, 3, 2.0, 0.5), 2.8);
    float rust = clamp(seam * 0.85 + bleed * smoothstep(0.78, 0.99, bleed) * 0.9, 0.0, 1.0);
    rust *= (0.35 + gravity * 0.65) * smoothstep(0.42, 0.95, g) * 0.78;

    // WELDED SCAR PLATES: hard-edged patches with a raised bead around them, where parts
    // torn off other robots have been fused on. Voronoi gives the plate boundaries; the
    // ramp table puts these on stage 3 only, so they open up late and hard.
    // Sparse on purpose. With most cells switched on, the bead network covers the shell in
    // a continuous polygonal web and the torso reads as dried mud, not as a body with a few
    // pieces of somebody else welded onto it.
    vec3 cell = voronoiT(uv * 4.5 + 3.0, 4.5);
    float plateEdge = 1.0 - smoothstep(0.008, 0.042, cell.y - cell.x);   // F2-F1 = boundary
    float plateOn = step(0.70, cell.z) * smoothstep(0.62, 0.95, g);
    float bead  = plateEdge * plateOn;
    float plate = step(0.70, cell.z) * (1.0 - plateEdge) * smoothstep(0.62, 0.95, g);

    /*
     * SOOT HAS A SECOND CHANNEL NOW: DEPTH, NOT JUST COVERAGE.
     *
     * The gate above slides with grime, so uGrime buys COVERAGE and nothing else — by 1.0
     * it is near-total and the ramp has nowhere left to go. That dead end is why the stage
     * table started tinting the BASE SHELL browner instead (player #EDEFF0 cool white ->
     * stage 3 [0.525,0.482,0.432] khaki, hue flipping cool-to-warm), which two independent
     * critics then read as "recoloured, not dirtied" and "mould, not burn". The art keeps ONE
     * white shell across every row and escalates with black soot.
     *
     * So give the soot itself somewhere to go: uSootDark deepens the deposit toward carbon
     * and lifts its opacity ceiling, which is what lets the SHELL move back toward white
     * without the figure getting lighter overall. uSootDark = 0.0 reproduces the previous
     * line EXACTLY (0.24/0.232/0.218 at 0.92), so nothing moves until a caller asks.
     *
     * ⚠️ ORDER MATTERS IF YOU TUNE THIS. Extend the depth FIRST, then walk the shell tint
     * back — doing it the other way re-opens the defect the tint was introduced to close
     * ("STAGE 3 WAS NOT DIRTIER THAN STAGE 2"), because the shell goes pale before the soot
     * can carry the loss. The control is that stage 3 must stay measurably darker than
     * stage 2 at every intermediate step.
     */
    vec3 sootCol = mix(vec3(0.24, 0.232, 0.218), vec3(0.030, 0.028, 0.026), uSootDark);
    col = mix(col, col * sootCol, soot * mix(0.92, 0.99, uSootDark));
    col = mix(col, vec3(0.255, 0.150, 0.088), rust * 0.55);
    // a grafted plate is a DIFFERENT piece of scrap: cooler and greyer than the shell
    col = mix(col, vec3(0.44, 0.435, 0.425), plate * 0.45);
    // the weld bead itself: burnt-blue heat scale over bright fused metal
    col = mix(col, vec3(0.21, 0.185, 0.175), bead * 0.80);

    rough = mix(rough, 0.94, soot * 0.88);
    rough = mix(rough, 0.96, rust * 0.80);
    rough = mix(rough, 0.55, bead * 0.60);
    // min(), not assignment. This line used to OVERWRITE ao, which threw away whatever the
    // panel network above had put there — so every grimed shell (i.e. the entire hunter) would
    // have kept the seams in its albedo and lost them in its occlusion, which is the half that
    // carries a seam at a distance. A filthy robot has MORE occlusion in its panel gaps, not none.
    ao = min(ao, 1.0 - soot * 0.26 - bead * 0.34);
    height += bead * 0.35 - soot * 0.02 + plate * 0.06;
  }

  s.albedo    = col;
  s.roughness = clamp(rough, 0.02, 1.0);
  s.metalness = 0.0;
  s.ao        = ao;
  s.height    = height;
}
`;

// ---------------------------------------------------------------------------
// Chrome satin: fine circumferential machining lines. Anisotropic in V so it reads
// as turned metal on cylindrical limbs, which is what the sheet shows.
// ---------------------------------------------------------------------------
const CHROME_SURFACE = /* glsl */ `
uniform vec3  uTint;
uniform float uLines;
uniform float uWear;
uniform float uGrime;    // 0 = showroom player, 1 = stage-3 hunter

float pat(float v, float k){ return clamp((v - 0.5) * k + 0.5, 0.0, 1.0); }

/*
 * ROUND 32 — MACHINED, NOT SMOOTH. Item 1 of the round is "the sheet is dense with panel
 * seams, screw heads and machined chrome; the render is smooth toy-plastic outside the joint
 * discs", and this is the chrome half of it.
 *
 * MEASURED off the sheet (harness/_probe_tmp.mjs on Dev Art/1785277053522.png): a 10x30 px
 * box on the front figure's upper arm reads median 119 with a RANGE of 203 — p05 32, p95 235.
 * The abdomen band reads median 106, range 111. That is the signature: the sheet's structural
 * metal is not a mid grey, it is a narrow bright band and a dark band a few pixels apart, i.e.
 * a surface that RESOLVES its environment rather than averaging it, with visible turning marks
 * running round the part.
 *
 * Three changes, all of them contrast rather than level:
 *  - the turned lines get a second, much finer band and roughly double the roughness swing they
 *    drive, so the anisotropic streak survives a mip level instead of dissolving into the base;
 *  - the base roughness drops 0.285 -> 0.225, which is what lets the environment resolve at all
 *    (at 0.285 the studio's bright panels and dark flags average into the flat mid grey a
 *    critic reads as plastic);
 *  - a sparse SCRATCH field, gated through pat() because a raw fbmT gate at 0.9 never fires
 *    — that trap has now been found in five separate files on this project.
 * uLines still scales all of it, so the hunter's grimier limbs can dial it back.
 */
void surface(in vec2 uv, inout Surf s){
  // turned lines: high frequency in one axis only
  float turn = fbmT(uv * vec2(1.5, 420.0), 512.0, 2, 2.0, 0.5);
  // ...and a much finer second band. One octave of very high frequency reads as the tool mark
  // itself rather than as a wobble in the first band.
  float fine = fbmT(uv * vec2(2.0, 1100.0), 2048.0, 1, 2.0, 0.5);
  float broad = fbmT(uv * 6.0 + 3.0, 64.0, 3, 2.0, 0.5);
  // edge burnish: contact points polish brighter and smoother
  float burnish = smoothstep(0.55, 0.92, fbmT(uv * 11.0 + 33.0, 64.0, 2, 2.0, 0.5));
  // sparse handling scratches, running with the turning direction
  float scr = smoothstep(0.80, 0.99, pat(fbmT(uv * vec2(3.0, 260.0) + 17.0, 512.0, 2, 2.0, 0.5), 3.2))
            * smoothstep(0.55, 0.95, pat(fbmT(uv * 7.0 + 41.0, 64.0, 2, 2.0, 0.5), 2.4));

  vec3 col = uTint * (0.975 + broad * 0.050 + turn * 0.020 + fine * 0.016);
  col *= 1.0 + burnish * 0.035 + scr * 0.05 * uWear;

  /*
   * ROUND 32, SECOND PASS — 0.225 -> 0.290, and it is a RANGE correction, not a level one.
   * Measured on the round-32 render against the sheet, front figure, 0-255 luminance:
   *
   *                     sheet     render
   *   upper arm tube     190        120
   *   waist / abdomen    131        216
   *
   * Both wrong, in OPPOSITE directions, from ONE material — which rules out the environment
   * multiplier, because that moves them together. At 0.225 this metal RESOLVES the studio's
   * individual panels: a tube facing the dark flags comes out charcoal and a broad flat band
   * facing the bright cyc comes out brighter than the shells. The sheet's structural metal
   * spans about 119-190 across the whole figure, i.e. it AVERAGES its environment. Roughening
   * is the only lever that closes a spread; the turned lines above still carry the machining.
   *
   * It also cost the silhouette instrument a real measurement: at 216 against a ~235 cyc the
   * abdomen's rolled edge has almost no derivative left, and measure.mjs was losing it — which
   * is most of the "-41% profile depth at 0.655 H" this round was briefed with.
   * (NO BACKTICKS IN HERE. This is inside a GLSL template literal; one backtick terminates the
   * JS string and takes the whole module down. It has now happened twice on this file.)
   */
  float rough = 0.290 + turn * 0.130 * uLines + fine * 0.055 * uLines
              + broad * 0.030 - burnish * 0.075 + scr * 0.30 * uWear;
  float metal = 1.0;
  float ao = 1.0;
  float height = 0.5 + (turn - 0.5) * 0.20 * uLines + (fine - 0.5) * 0.09 * uLines;

  // ---------------------------------------------------------------------------
  // CORRUPTION. Only above zero on the hunter. A critic reading the progression sheet
  // sees the arms, abdomen and joints — all of which are this material — as "bright clean
  // chrome" while the white shells were dirty, which made the hunter read as a clean robot
  // wearing a dirty jacket. Filth does not stop at a material boundary.
  //
  // The important trick on a METAL is that soot is a DIELECTRIC: it does not just darken
  // the reflection, it kills the metalness underneath it. Dropping metalness is what turns
  // chrome into grubby chrome rather than into dark chrome.
  // ---------------------------------------------------------------------------
  if (uGrime > 0.001){
    float g = uGrime;
    float sootBig  = pat(fbmT(uv * 6.5 + 17.0, 64.0, 4, 2.0, 0.55), 2.2);
    float sootFine = pat(fbmT(uv * 24.0 + 61.0, 64.0, 3, 2.0, 0.5), 2.0);
    float gravity  = 1.0 - smoothstep(0.0, 0.95, uv.y);
    float soot = clamp(sootBig * 0.62 + sootFine * 0.52, 0.0, 1.0) * (0.62 + gravity * 0.50);
    soot = pow(smoothstep(0.62 - g * 0.40, 1.08 - g * 0.28, soot), 1.5);

    // grime packs into the turned machining grooves first, so the lines go dark and dirty
    // before the flats do — that is the read that says "not cleaned in a long time".
    float grooves = (1.0 - turn) * g * 0.55;

    // rust weeping out of the joint gaps
    float rust = pat(fbmT(uv * vec2(20.0, 2.6) + 5.0, 128.0, 3, 2.0, 0.5), 2.8);
    rust = smoothstep(0.74, 0.99, rust) * (0.30 + gravity * 0.70) * smoothstep(0.42, 0.95, g);

    // Soot on a limb must not take it to black. The reference arms are grubby SATIN, still
    // clearly the same bright structural metal as the player's — an arm mixed all the way
    // down to soot reads as a different, darker character rather than as a dirty one.
    col = mix(col, uTint * 0.34, soot * 0.60);
    col = mix(col, col * 0.78, grooves);
    col = mix(col, vec3(0.255, 0.140, 0.075), rust * 0.60);

    rough = mix(rough, 0.90, soot * 0.85);
    rough = mix(rough, 0.95, rust * 0.85);
    metal = mix(metal, 0.05, max(soot * 0.88, rust * 0.90));
    ao = 1.0 - soot * 0.20;
    height -= soot * 0.03;
  }

  s.albedo    = col;
  s.roughness = clamp(rough, 0.02, 1.0);
  s.metalness = metal;
  s.ao        = ao;
  s.height    = height;
}
`;

// ---------------------------------------------------------------------------
// Mint cap: satin paint over the shell. Slight sheen drift, no metal.
// ---------------------------------------------------------------------------
const MINT_SURFACE = /* glsl */ `
uniform vec3  uTint;
uniform float uGrime;   // 0 = showroom player, 1 = stage-3 hunter
uniform float uCrack;   // 0 = intact, 1 = the fractured stage-3 cap

float pat(float v, float k){ return clamp((v - 0.5) * k + 0.5, 0.0, 1.0); }

void surface(in vec2 uv, inout Surf s){
  float fine  = fbmT(uv * 150.0, 256.0, 3, 2.0, 0.5);
  float drift = fbmT(uv * 4.5 + 11.0, 64.0, 3, 2.0, 0.55);

  vec3 col = uTint * (0.985 + drift * 0.026);
  // deliberately the dullest family on the character — this contrast is the signature
  float rough = 0.415 + fine * 0.048 + drift * 0.030;
  float ao = 1.0;
  float height = 0.5 + (fine - 0.5) * 0.06;

  if (uGrime > 0.001){
    float g = uGrime;
    float soot = clamp(pat(fbmT(uv * 5.0 + 71.0, 64.0, 4, 2.0, 0.55), 2.4) * 0.75
                     + pat(fbmT(uv * 19.0 + 3.0, 64.0, 3, 2.0, 0.5), 2.2) * 0.45, 0.0, 1.0);
    soot *= 0.45 + (1.0 - smoothstep(0.0, 0.90, uv.y)) * 0.75;
    soot = pow(smoothstep(0.62 - g * 0.40, 1.06 - g * 0.28, soot), 1.6);
    // The mint cap is the character's signature colour. Grimed to the point where it reads
    // grey-green the signature is gone, so the cap dulls and picks up deposits but never
    // stops being mint.
    /*
     * ⚠️ DARKEN TOWARD DARK MINT, NOT TOWARD NEUTRAL GREY — the old target vec3(0.150,0.150,
     * 0.138) is achromatic, so every unit of grime spent BOTH darkening and DESATURATING the
     * one colour this block exists to protect. Two critics measured the result independently:
     * the stage-3 cap renders green-minus-red +5 against the hero shot's +26, i.e. a fifth of
     * the reference chroma, on the character's signature colour. A dark green target darkens
     * just as hard while the hue survives, which is what the paragraph above actually asks
     * for. Deposit strength also goes 0.55 -> 0.72: these caps sit at 1.08x their background
     * luma where the hero's sit at 0.52x, so they were reading as the CLEANEST thing on a
     * stage-3 monster.
     */
    col = mix(col, vec3(0.085, 0.128, 0.112), soot * 0.72);
    rough = mix(rough, 0.93, soot * 0.80);
    ao = 1.0 - soot * 0.20;
  }

  // ---------------------------------------------------------------------------
  // FRACTURE. The manifest and the stage-3 hero shot both call for visible dark crack
  // lines across each mint cap, and they are a defining stage-3 cue. Modelling them as
  // little dark boxes glued to the shoulder never worked: a crack is a groove IN the
  // paint, so it belongs in the surface, where it darkens, roughens and cuts a normal.
  //
  // Voronoi cell boundaries are exactly a fracture network. A large-scale region mask
  // keeps the crack field local — a cap that is cracked edge to edge reads as crazy
  // paving, not as impact damage.
  // ---------------------------------------------------------------------------
  if (uCrack > 0.001){
    // Low cell count on purpose: a dense network is crazy paving or a turtle shell, and
    // the reference cap carries a handful of big branching splits, not a mosaic.
    vec3 cell = voronoiT(uv * 2.6 + 2.0, 2.6);
    float trunkLine = 1.0 - smoothstep(0.004, 0.026, cell.y - cell.x);
    vec3 fine2 = voronoiT(uv * 6.0 + 13.0, 6.0);
    float hair = (1.0 - smoothstep(0.002, 0.010, fine2.y - fine2.x)) * 0.55;
    float region = smoothstep(0.42, 0.86, pat(fbmT(uv * 2.0 + 9.0, 32.0, 3, 2.0, 0.5), 2.6));
    float crack = clamp(max(trunkLine, hair) * region, 0.0, 1.0) * uCrack;

    // a chipped lip along the crack: paint has flaked back to a paler edge
    float lip = clamp(max(trunkLine, hair) * region, 0.0, 1.0)
              * smoothstep(0.024, 0.055, cell.y - cell.x) * uCrack;

    col = mix(col, vec3(0.045, 0.048, 0.044), crack * 0.94);
    col = mix(col, col * 1.22, lip * 0.5);
    rough = mix(rough, 0.97, crack);
    ao = min(ao, 1.0 - crack * 0.55);
    height -= crack * 0.55;
  }

  s.albedo    = col;
  s.roughness = clamp(rough, 0.02, 1.0);
  s.metalness = 0.0;
  s.ao        = ao;
  s.height    = height;
}
`;

// ---------------------------------------------------------------------------
// The face. Drawn as SDFs so it stays crisp at any distance: two soft rounded-rect
// eyes and one thin upward crescent mouth, emissive cyan on dark blue glass.
// No physical mouth — it is light on a screen.
// ---------------------------------------------------------------------------
const FACE_SURFACE = /* glsl */ `
uniform vec3  uGlass;
uniform vec3  uLight;
uniform float uEyeW;
uniform float uEyeH;
uniform float uEyeGap;
uniform float uEyeY;
uniform float uEyeCant;
uniform float uEyeTaper;
uniform float uMouthY;
uniform float uMouthW;
uniform float uMouthT;
uniform float uBrowY;
uniform float uBrowW;
uniform float uBrowT;
uniform float uBrowR;

// A thin arc over each eye, opening DOWNWARD — the same difference-of-two-circles the
// mouth uses, with the circle centre placed BELOW the arc instead of above it. Mirrored
// on abs(p.x) about uEyeGap so it tracks whatever the eyes are doing. Returns 0 when
// uBrowT is 0, which is how the hunter's slit face keeps its brows off.
float browArc(vec2 p, float gap, float y, float halfW, float thick, float rad){
  if (thick < 0.0001) return 0.0;
  vec2 bp = vec2(abs(p.x) - gap, p.y - y + rad);
  float dO = length(bp) - rad;
  float dI = length(bp) - (rad - thick);
  float a = (1.0 - smoothstep(0.0, 0.008, dO)) * smoothstep(0.0, 0.008, dI);
  a *= 1.0 - smoothstep(halfW, halfW + 0.030, abs(abs(p.x) - gap));
  a *= step(y - rad * 0.6, p.y);          // upper half of the ring only
  return a;
}

void surface(in vec2 uv, inout Surf s){
  vec2 p = uv - 0.5;

  // --- eyes: rounded rects, mirrored about the centreline
  vec2 e = vec2(abs(p.x) - uEyeGap, p.y - uEyeY);
  // CANT — the scowl. The art's eyes are not level: the INNER end of each drops, and that
  // single cue carries most of the menace (a critic ranked level eyes the #1 face defect on
  // stage 2). Rotating here rather than at the call site is what makes it mirror correctly:
  // 'e' is already in the folded abs(p.x) space, so +x is OUTBOARD on both eyes and one
  // rotation produces a symmetric pair. Rotating before the fold would cant both eyes the
  // same way and read as a tilted head. uEyeCant defaults to 0.0, so the player is untouched.
  float ca = cos(uEyeCant), sa = sin(uEyeCant);
  e = mat2(ca, -sa, sa, ca) * e;
  // TAPER — the art's eye is a BLADE, not a lozenge: thick at the outboard end, sharpening to
  // a point inboard, and the two inner tips nearly meet over the bridge. A cant alone only
  // tilts a uniform-width capsule, which still reads as a glowing pill; the wedge is what
  // reads as a narrowed eye. Squeezing e.y before the box is equivalent to shrinking the
  // half-height there, so k>1 inboard thins that end. Cheap and approximate — it makes the
  // field non-euclidean, which is harmless at this smoothstep width but is why the alpha edge
  // is taken at a fixed 0.012 rather than scaled by the gradient.
  float k = 1.0 + uEyeTaper * clamp(-e.x / max(uEyeW, 1e-4), 0.0, 1.0);
  float dEye = sdRound(vec2(e.x, e.y * k), vec2(uEyeW, uEyeH), min(uEyeW, uEyeH) * 0.96);
  float eye = 1.0 - smoothstep(0.0, 0.012, dEye);
  float brow = browArc(p, uEyeGap, uBrowY, uBrowW, uBrowT, uBrowR);

  // --- mouth: upward crescent = a wide flat arc. Difference of two circles gives the
  // crescent, then clip the horizontal extent so it does not wrap round the sides.
  float r1 = 0.30, r2 = 0.30 - uMouthT;
  vec2  mp = vec2(p.x, p.y - uMouthY - r1);
  float dOuter = length(mp) - r1;
  float dInner = length(mp) - r2;
  float arc = (1.0 - smoothstep(0.0, 0.010, dOuter)) * smoothstep(0.0, 0.010, dInner);
  arc *= 1.0 - smoothstep(uMouthW, uMouthW + 0.035, abs(p.x));
  // THE CLIP HAS TO FOLLOW THE THICKNESS. The crescent runs from uMouthY up to
  // uMouthY + uMouthT at its centre, so a constant 0.04 ceiling silently truncated any mouth
  // thicker than that — which is exactly the class of dead constant this file keeps finding.
  arc *= step(p.y, uMouthY + uMouthT + 0.020);

  // the brow is a thinner stroke than the eye and reads slightly dimmer on the sheet
  float lit = clamp(eye + arc + brow * 0.85, 0.0, 1.0);
  // NO HALO IN THE ALBEDO. A soft halo was authored here ("so the light looks like it is
  // behind glass, not painted on it") and was never read by anything -- the compiler dropped
  // it, so it has never rendered. It is not being revived, for two reasons:
  //  1. THE JOB IS ALREADY DONE, in the right channel. FACE_EMISSIVE_SURFACE carries 'bleed',
  //     the same falloff off the same dEye, and that one IS used. Behind-glass spill is light,
  //     not paint, so it belongs in the emissive; a second copy in the albedo would be paint.
  //  2. IT FIGHTS ROUND 33. That round fixed an inverted screen/eye polarity by DARKENING the
  //     screen -- the plate measured 0.654 against the art's 0.409. A halo brightens the screen
  //     immediately around the eyes, which lifts the screen median and cuts POP: it pushes back
  //     against the fix in both measured quantities at once.
  // If a picture ever argues for it, it is a LOOK change on the most identifying feature on the
  // character: it ships behind its own URL knob defaulting to 0, and it gets measured.

  vec3 glassNoise = uGlass * (0.94 + fbmT(uv * 60.0, 128.0, 2, 2.0, 0.5) * 0.12);
  s.albedo    = mix(glassNoise, uLight, lit);
  // ROUND 31: 0.075 -> 0.26. At 0.075 under the turnaround's high-contrast environment the
  // plate is a MIRROR on a curved cap, so it reflects a bright studio panel across its top
  // third and a dark flag panel across its bottom third — measured 149 against 28 on one
  // face. The sheet's screen holds 15 of range. Roughening it averages the environment
  // instead of resolving it, which is the only thing that closes a range that wide; the
  // clearcoat below still supplies the sheet's glossy Fresnel edge.
  s.roughness = mix(0.26, 0.30, lit);
  s.metalness = 0.0;
  s.ao        = 1.0;
  s.height    = 0.5;
  // emissive rides in the ORM alpha-free slots, so it is applied via a second map below
}
`;

// The emissive mask reuses the same SDF so the glow lines up exactly with the albedo.
const FACE_EMISSIVE_SURFACE = /* glsl */ `
uniform float uEyeW;
uniform float uEyeH;
uniform float uEyeGap;
uniform float uEyeY;
uniform float uEyeCant;
uniform float uEyeTaper;
uniform float uMouthY;
uniform float uMouthW;
uniform float uMouthT;
uniform float uBrowY;
uniform float uBrowW;
uniform float uBrowT;
uniform float uBrowR;
uniform float uGlow;
// The two GRADE COEFFICIENTS of the backlight floor, promoted from GLSL constants to uniforms
// so '?facepop' can change the floor's SHAPE and not merely its level. See THE BACKLIGHT below
// and the FACE POP block in faceplate(). At the pre-round values (3.40 / 3.10) this file is
// arithmetically identical to what it was when they were literals.
uniform float uGlowLow;
uniform float uGlowEdge;
uniform vec3  uLight;

// Duplicated from FACE_SURFACE on purpose: the two shaders are baked separately and the
// emissive mask must line up with the albedo exactly, so they share the maths by being
// written the same, not by including each other.
float browArc(vec2 p, float gap, float y, float halfW, float thick, float rad){
  if (thick < 0.0001) return 0.0;
  vec2 bp = vec2(abs(p.x) - gap, p.y - y + rad);
  float dO = length(bp) - rad;
  float dI = length(bp) - (rad - thick);
  float a = (1.0 - smoothstep(0.0, 0.010, dO)) * smoothstep(0.0, 0.010, dI);
  a *= 1.0 - smoothstep(halfW, halfW + 0.030, abs(abs(p.x) - gap));
  a *= step(y - rad * 0.6, p.y);
  return a;
}

void surface(in vec2 uv, inout Surf s){
  vec2 p = uv - 0.5;
  vec2 e = vec2(abs(p.x) - uEyeGap, p.y - uEyeY);
  // CANT — the scowl. The art's eyes are not level: the INNER end of each drops, and that
  // single cue carries most of the menace (a critic ranked level eyes the #1 face defect on
  // stage 2). Rotating here rather than at the call site is what makes it mirror correctly:
  // 'e' is already in the folded abs(p.x) space, so +x is OUTBOARD on both eyes and one
  // rotation produces a symmetric pair. Rotating before the fold would cant both eyes the
  // same way and read as a tilted head. uEyeCant defaults to 0.0, so the player is untouched.
  float ca = cos(uEyeCant), sa = sin(uEyeCant);
  e = mat2(ca, -sa, sa, ca) * e;
  // TAPER — the art's eye is a BLADE, not a lozenge: thick at the outboard end, sharpening to
  // a point inboard, and the two inner tips nearly meet over the bridge. A cant alone only
  // tilts a uniform-width capsule, which still reads as a glowing pill; the wedge is what
  // reads as a narrowed eye. Squeezing e.y before the box is equivalent to shrinking the
  // half-height there, so k>1 inboard thins that end. Cheap and approximate — it makes the
  // field non-euclidean, which is harmless at this smoothstep width but is why the alpha edge
  // is taken at a fixed 0.012 rather than scaled by the gradient.
  float k = 1.0 + uEyeTaper * clamp(-e.x / max(uEyeW, 1e-4), 0.0, 1.0);
  float dEye = sdRound(vec2(e.x, e.y * k), vec2(uEyeW, uEyeH), min(uEyeW, uEyeH) * 0.96);
  float eye = 1.0 - smoothstep(0.0, 0.014, dEye);
  float brow = browArc(p, uEyeGap, uBrowY, uBrowW, uBrowT, uBrowR);

  float r1 = 0.30, r2 = 0.30 - uMouthT;
  vec2  mp = vec2(p.x, p.y - uMouthY - r1);
  float dOuter = length(mp) - r1;
  float dInner = length(mp) - r2;
  float arc = (1.0 - smoothstep(0.0, 0.012, dOuter)) * smoothstep(0.0, 0.012, dInner);
  arc *= 1.0 - smoothstep(uMouthW, uMouthW + 0.035, abs(p.x));
  arc *= step(p.y, uMouthY + uMouthT + 0.020);   // see the note in FACE_SURFACE

  float lit = clamp(eye + arc + brow * 0.85, 0.0, 1.0);
  float bleed = (1.0 - smoothstep(0.0, 0.045, dEye)) * 0.28;

  // THE BACKLIGHT — round 31, and it is what the reference screen physically IS.
  //
  // Measured off Dev Art/1785277053522.png: the sheet's blue screen holds luminance
  // 106-127 face-on and 153 at the grazing angle the profile figure sees, with only 15 of
  // internal RANGE across the whole plate. A dark-blue albedo lit by a key cannot do that --
  // this rig measured 28 in the lower half of the same plate and 149 in the upper, a range
  // of 109 -- because the value of a reflective surface tracks its facing and the sheet's
  // does not. The sheet's screen is a lit PANEL behind glass; its floor comes from inside.
  //
  // So the glass carries a small uniform emissive floor. It is a floor, not a glow: the
  // eyes and mouth still ride an order of magnitude above it, and the ramp between them is
  // untouched. Off by default for any caller that hand-authors the face opts -- the hunter
  // sets material.emissive to red, and a red-glowing plate is a different character.
  // The floor is GRADED DOWNWARD, and that is a compensation, not a stylisation. Measured
  // on the round-31 render: the plate holds 115 across its upper half and 59 across its
  // lower, because the cap wraps under the jaw and the studio environment's lower hemisphere
  // is dark -- the whole lower front of this character reads 30% under the sheet, not just
  // the visor. The sheet's screen is flat to within 21 luminance top to bottom. A backlight
  // is uniform in the panel; making the RENDER uniform is what reproduces the reference, so
  // the emissive carries the difference the ambient does not deliver.
  // TWO grades, and both are compensations rather than styling.
  //  low  -- the cap wraps under the jaw and the studio environment's lower hemisphere is
  //          dark, so the plate ran 150 at the top against 86 at the bottom where the sheet
  //          runs 106 against 127.
  //  edge -- the sheet's screen is BRIGHTEST along its outer columns (measured 153 on the
  //          profile figure, which sees nothing but those columns, against 106 face-on).
  //          That is Fresnel against a bright room; this view opts into a high-contrast
  //          environment whose flag panels are what a grazing clearcoat actually finds, so
  //          the lift has to be carried rather than reflected. It is also the single lever
  //          that reaches the LEFT PROFILE view, where this defect has failed eight rounds.
  // ROUND 32 — the same two grades, pushed. Item 5: the plate still measures 0.60-0.65 of its
  // neighbouring shell against the sheet's 0.96, and "the visor must not be the darkest thing on
  // the head". The edge term is widened (it starts at 0.14 rather than 0.22, so the grazing lift
  // reaches further in from the rim and the profile view — which sees nothing BUT those columns —
  // gets it across the whole plate) and both coefficients go up, together with uGlow and the
  // glass albedo in C. Level, not mechanism: round 31 established that a backlit panel is what
  // the sheet's screen physically is, and that finding stands.
  /*
   * ⚠️ ROUND 33 — THE COMPENSATION OVERSHOT AND INVERTED THE THING IT WAS CORRECTING, and that
   * is measurable rather than arguable. harness/_face1-pop.mjs reports the median of the
   * screen's top half minus its bottom half, over the segmented visor:
   *
   *     art (assets/mv/player/baseline_front.png)   +0.002   i.e. FLAT, as a backlit panel is
   *     render at 3.40 / 3.10                       -0.112   i.e. brighter UNDER THE JAW
   *
   * Round 31 found the plate running bright at the top and near-black at the bottom and added
   * 'low' to lift the bottom; round 32 pushed it further. It is now 0.112 past flat in the other
   * direction, and the same over-driven term is most of why the screen measures 0.654 against
   * the art's 0.409. So the fix cuts the grade rather than the base: uGlowLow carries the
   * tilt, uGlowEdge carries the profile view, and they are separated so the profile lift can
   * be kept while the jaw lift is taken away.
   */
  float edge = smoothstep(0.14, 0.42, abs(p.x));
  float low  = smoothstep(0.34, -0.45, p.y);
  // Measured at 0.45/2.00: the plate ran 153 at the top against 86 at the bottom where the
  // sheet runs 106 against 127 -- still the wrong way round, just less so. The top's value
  // is environment, not backlight (the glow contributes 0.04 of it), so the base comes down
  // and the low-end compensation goes up rather than trying to lift everything.
  float glass = uGlow * (0.55 + uGlowLow * low + uGlowEdge * edge);

  // luminance only — material.emissive owns the colour, so the hunter can be red
  s.albedo    = vec3(max(max(lit, bleed), glass));
  s.roughness = 1.0;
  s.metalness = 0.0;
  s.ao        = 1.0;
  s.height    = 0.5;
}
`;

// ---------------------------------------------------------------------------
// The 4Humanity split-head mark, printed on the wearer's left pec. Low contrast,
// slightly absorbed into the shell — it is a pad print, not a sticker.
// ---------------------------------------------------------------------------
const DECAL_SURFACE = /* glsl */ `
uniform vec3  uShell;
uniform vec3  uInk;

// The mark: a head profile split by a vertical seam, with a figure-8 on the seam.
// Approximated with SDFs at the size it is actually seen (about 5% of body height),
// where the silhouette and the seam-plus-8 are the only things that read.
float markMask(vec2 p){
  // skull: an ellipse, chin pulled down-left
  float skull = sdEllipse(p - vec2(0.0, 0.03), vec2(0.30, 0.36));
  float jaw   = sdEllipse(p - vec2(-0.06, -0.24), vec2(0.20, 0.17));
  float head  = min(skull, jaw);
  float body  = 1.0 - smoothstep(-0.012, 0.012, head);

  // hollow it out to a heavy outline
  float inner = 1.0 - smoothstep(-0.012, 0.012, head + 0.055);
  float ring  = max(body - inner, 0.0);

  // vertical split seam
  float seam = (1.0 - smoothstep(0.011, 0.019, abs(p.x))) * body;

  // figure-8 on the seam
  float c1 = abs(length(p - vec2(0.0,  0.085)) - 0.085) - 0.016;
  float c2 = abs(length(p - vec2(0.0, -0.075)) - 0.075) - 0.016;
  float eight = 1.0 - smoothstep(0.0, 0.010, min(c1, c2));

  // robot side gets a couple of panel slots
  float slot1 = (1.0 - smoothstep(0.0, 0.008, sdRound(p - vec2(0.16, 0.16), vec2(0.055, 0.014), 0.010))) * step(0.0, p.x);
  float slot2 = (1.0 - smoothstep(0.0, 0.008, sdRound(p - vec2(0.15, -0.06), vec2(0.045, 0.012), 0.010))) * step(0.0, p.x);

  return clamp(max(max(ring, seam), max(eight, max(slot1, slot2))), 0.0, 1.0);
}

void surface(in vec2 uv, inout Surf s){
  vec2 p = (uv - 0.5) * 1.25;
  float m = markMask(p);

  float peel = fbmT(uv * 190.0, 256.0, 3, 2.05, 0.5);
  vec3 shell = uShell * (0.995 + fbmT(uv * vec2(3.0, 34.0) + 7.0, 64.0, 3, 2.0, 0.55) * 0.010);

  // print is slightly broken up — pad printing never lays down perfectly solid
  float ink = m * (0.86 + fbmT(uv * 120.0 + 5.0, 128.0, 2, 2.0, 0.5) * 0.28);

  s.albedo    = mix(shell, uInk, clamp(ink, 0.0, 1.0));
  s.roughness = 0.175 + peel * 0.030 + m * 0.075;   // ink is duller than the clearcoat
  s.metalness = 0.0;
  s.ao        = 1.0;
  s.height    = 0.5 + (peel - 0.5) * 0.10 + m * 0.012;
}
`;

// ---------------------------------------------------------------------------

const C = {
  /*
   * WARM CHAMPAGNE, NOT NEUTRAL — #EDEFF0 -> #F1EEE6, AND IT IS A HUE DEFECT RATHER THAN AN
   * EXPOSURE ONE.
   *
   * Measured on `harness/_critdig_darkstruct.mjs`, mean R-B over the LIT neutral shell of the
   * torso+legs band, swept over four lit cuts. The art's number is remarkably stable, which is
   * what says it is a deliberate paint colour and not a lighting artefact:
   *
   *                      lit 140   lit 160   lit 180   lit 200
   *   ART  R-B            10.98     10.82     10.62     10.49
   *   ART  R-G             4.60      4.43      4.36      4.46
   *   RENDER (#EDEFF0)    -0.05      0.40      0.54      0.72
   *   RENDER R-G           3.73      2.61      1.40      0.50
   *
   * The ABSOLUTE levels already agree — 194.1/189.7/183.3 art against 191.2/188.6/190.8 render
   * at lit 160 — so nothing here is an exposure or an environment-intensity problem. It is one
   * channel: blue arrives about 9 levels too high. The old tint was actively COOL (B > G > R,
   * a photographic-white plastic); the art's shell is a warm off-white with red leading.
   *
   * ⚠️ THE TRANSFER IS NOT THE IDENTITY, so this was solved from a sweep rather than by
   * subtracting the deficit from the tint. The composite tonemaps and grades, and the studio
   * environment carries its own warmth: at the OLD tint, authored R-G was -0.008 (i.e. -2 levels)
   * yet delivered R-G was +2.6, so the chain adds roughly 4-5 levels of red-over-green by itself
   * and compresses everything near the top of the range. See `?shellwarm` in `shellWhite` for the
   * sweep and for the exact A/B back to #EDEFF0.
   */
  /*
   * ⚠️ THIS ALBEDO IS MUCH WARMER THAN THE PIXELS IT PRODUCES, AND THAT IS DELIBERATE — the
   * same compensation `mintCap` argues for below, for the same reason and with the same shape
   * of evidence. A first cut authored the delivered colour directly (#F1EEE6, tint R-B 0.043)
   * and delivered R-B 3.03 against the art's 10.82: a transfer slope of about 0.24 levels out
   * per level in. The shell is lit mostly by a near-white studio environment at envMapIntensity
   * 2.05 and wears a 0.9 clearcoat, and both of those are WHITE light added on top of the
   * albedo, so roughly three quarters of any hue authored here is washed out before it reaches
   * a pixel. Authoring the target value would land at a quarter of it.
   *
   * Solved from the measured slope, holding Rec.709 luma at the old tint's 0.9356 so the
   * ABSOLUTE levels — which already matched the art within ~2 — do not move:
   *   R-G in = (4.43 - 2.61)/0.24 = 7.6 levels;  R-B in = (10.82 - 0.40)/0.24 = 43.4 levels.
   */
  shell: [0.969, 0.939, 0.799],   // #F7EFCC authored -> champagne delivered
  chrome: [0.725, 0.745, 0.761],  // #B9BEC2
  mint: [0.561, 0.788, 0.741],    // #8FC9BD — the sheet's own value, kept as the reference
  // What is actually authored into the cap's albedo. It is deliberately more saturated
  // than the sheet value; see mintCap() for the measurement that justifies it.
  // ROUND 32, SECOND PASS — #80D5C4 -> #66CCB4. With the environment response finally live (see
  // `applyUnit4HEnv`) the cap stopped being white, but it still measured green-minus-red 18
  // against the sheet's 50. Red is what a near-white lobe adds, so red is what comes out.
  mintLit: [0.400, 0.800, 0.706], // #66CCB4
  // ROUND 32: #2C5C93 -> #35659E. Sampled on the sheet's front figure the screen's own glass
  // reads rgb(100,151,182) against a head shell of rgb(216,217,218); this rig's read
  // rgb(101,130,153) — the right darkness in RED but a third short in GREEN, i.e. the plate was
  // not merely dark, it was the wrong blue. The lift is mostly in G and B, so the hue moves
  // toward the sheet's steel blue rather than the render's navy.
  /*
   * ROUND 32, SECOND PASS — #35659E -> #2659A0, and the defect it closes is SATURATION, not
   * level. Measured face-on at the screen's centre on both images:
   *
   *              sheet            this render (round-32 first pass)
   *   field      (81,124,157)     (112,141,162)
   *   eye        (163,222,241)    bright, lum 194 against the sheet's 211
   *   mouth      lum 199          lum 145   <-- the real failure
   *
   * Blue is already right. RED is 38% over and GREEN 14% over, i.e. the plate is the correct
   * darkness and the wrong CHROMA — it reads as pale slate where the sheet reads as a lit blue
   * screen. Pulling red down is the whole change; pulling luminance down as well would walk
   * straight back into the black-crescent defect round 31 spent itself on.
   */
  glass: [0.150, 0.348, 0.628],   // #2659A0
  // The lit strokes go one step toward CYAN. The sheet's eye samples (163,222,241): green is
  // within 8% of blue, where this value has green a fifth under it. It is the emissive colour
  // as well as the lit albedo, and the hunter overrides `material.emissive` to red, so this
  // cannot follow the hunter anywhere.
  faceLight: [0.494, 0.741, 0.941], // #7EBDF0
  gap: [0.165, 0.180, 0.192],     // #2A2E31
  /*
   * THE BRAND NAVY, SAMPLED — was #5C7286, a desaturated slate that is not in the art at all.
   *
   * Measured on `Dev Art/1785276265860.png` over a 35x160 patch deep inside the H's right stem
   * (x 465..500, y 300..460), away from every antialiased edge: mean rgb(5.2, 78.2, 132.1),
   * modal rgb(5, 78, 131). So the ink is #054E84.
   *
   * The old value was 0.36/0.45/0.53 — that is 18x the red, and a blue/red ratio of 1.45 where
   * the art's is 26. It read as grey-blue pencil, not as a printed navy, and no amount of
   * placement or scale work could have fixed the colour.
   *
   * This is an ALBEDO, and the mark is lit, so it does not render at its own value. Printing the
   * sampled #054E84 straight and then measuring the RESULT — a 5x24 px patch of the H's right
   * stem interior on the mat.robot specimen, the only place in the project where this mark has
   * pure interior pixels rather than edge blends — gave rgb(11.6, 77.6, 113.6) against the art's
   * (5, 78, 132). Luma landed at 66.1 against 66.4, and green at 77.6 against 78, i.e. exact.
   * BLUE came back 14% short, which is the whole of the remaining error and is what made the
   * first render read as a flat teal rather than as navy.
   *
   * So blue alone is pre-compensated. 0.518 -> 0.600 measured rgb(9.8, 77.8, 125.0), i.e. the
   * channel's response is SUBLINEAR — 15.8% more albedo bought 10% more pixel — so the last step
   * to 0.650 is taken on the measured slope (139 rendered units per unit of albedo) rather than
   * on the ratio. Red is left near its floor: it renders at ~10 from an albedo of 5 because there
   * is a small additive term, and no albedo can take it lower.
   *
   * This is the same pattern `mintLit` and `glass` above are already written to — an authored
   * value deliberately more saturated than the sampled one, because the value that MEASURES
   * right on screen is the one that matters, not the value that looks right in the table.
   * MEASURE THE RENDER, not this array, if you ever want to change it.
   */
  ink: [0.010, 0.306, 0.650],     // renders as the art's #054E84; see above
  sole: [0.130, 0.140, 0.150],
};

/* ===========================================================================================
 * GRAVITY- AND GEOMETRY-AWARE WEATHERING          toggle: ?weather=0 turns ALL of it off
 * ===========================================================================================
 *
 * WHY IT CANNOT LIVE IN THE BAKED SURFACES ABOVE, which is the whole reason this defect
 * survived every previous attempt at it.
 *
 * `SHELL_SURFACE` and `CHROME_SURFACE` each carry a line reading
 *
 *     float gravity = 1.0 - smoothstep(0.0, 0.95, uv.y);
 *
 * and it is not gravity. These surfaces are BAKED — `baker().standard()` evaluates them once
 * into a 512x512 tile which is then repeated over every mesh on the character. `uv.y` is a
 * coordinate in that tile, not a height in the world, so "down" points wherever the mesh's own
 * parameterisation happens to point: down a vertical thigh, ALONG a horizontal outstretched
 * arm, and radially on a sphere. The same tile then lands on the armpit, the knee crease and
 * the boot top at the same orientation and the same strength, which is exactly the reported
 * defect — one flat mottled speckle everywhere, no pooling at seams.
 *
 * (`plaster.js` gets away with the identical idiom because a wall's v axis really is world up.
 * A character is the case where it breaks, and it broke silently.)
 *
 * So the geometry-aware half has to be evaluated PER PIXEL AT RENDER TIME, where the world
 * normal and the world position of the fragment exist. Four reads, all of them VALUE and
 * PLACEMENT rather than hue, so they survive a greyscale and a dimmed pass:
 *
 *   POOLING     tight concave curvature -> run-off collects and never dries. Armpit, knee and
 *               elbow creases, panel gaps, the boot top.
 *   STREAKING   noise sampled in world XZ and held CONSTANT along world Y is vertical on every
 *               surface no matter what that surface's uv does. A sawtooth in world Y gives each
 *               streak a hard top edge and a downward fade, i.e. it starts at a horizontal edge
 *               or fixing and runs down from it.
 *   SCOURING    upward-facing and convex-proud surfaces are cleaner — rain and contact take the
 *               deposit off shoulder tops, forearm ridges and knee caps.
 *   SHELTER     downward-facing surfaces keep theirs.
 *
 * WHAT IS AND IS NOT TOUCHED. Nothing above this line changed. The whole feature is one
 * `onBeforeCompile` per material plus its uniforms, installed only when the toggle is on, so
 * `?weather=0` is a complete revert by construction rather than by audit — and it was verified
 * as one: `?weather=0` reproduces the pre-change capture of all four affected pieces
 * BYTE-IDENTICALLY (0/6220800 bytes differing), which is the same floor a same-config control
 * pair reads on this harness since capture determinism was fixed.
 *
 * TRAPS THIS CODE IS WRITTEN AROUND
 *  - `onBeforeCompile` hands you the shader with its `#include`s UNRESOLVED, and a
 *    `String.replace` that matches nothing returns the string unchanged and throws nothing.
 *    Both patches below replace an `#include` LINE and BOTH ARE ASSERTED — see `rrwPatch()`.
 *  - a patched program needs its own `customProgramCacheKey`, or three hands the material a
 *    program compiled from the unpatched source.
 *  - NO BACKTICKS anywhere inside these template literals.
 */

/** `?weather=0` disables the whole layer. Absent or anything else = on. */
export function weatheringEnabled() {
  if (typeof location === 'undefined') return true;
  return new URLSearchParams(location.search).get('weather') !== '0';
}

/**
 * `?weather=debug` paints the geometry masks instead of the character.
 *
 * This exists because the first cut of this layer was tuned BY GUESSING, landed almost
 * invisible, and could equally well have been a mask that was reading nothing at all — the two
 * are indistinguishable from a render. Painting the masks turned a guess into a measurement in
 * one capture, and it is what found the mesh-boundary limit recorded in `rrwCav` below.
 *
 *   ?weather=debug    red = wet (everything the deposit terms add)
 *                     green = scour (everything rain and contact take off)
 *                     blue = run (the vertical streak field alone)
 *   ?weather=debug2   red = cav (AO pockets)   green = proud (curvature edges)
 *                     blue = under (sheltered downward-facing)
 *   ?weather=debug4   red = the panel network as drawn (its core)
 *                     green = the geometric gate that network is multiplied by
 *                     blue = the two together, i.e. what actually darkens the albedo
 */
export function weatheringDebug() {
  if (typeof location === 'undefined') return 0;
  const v = new URLSearchParams(location.search).get('weather');
  return v === 'debug' ? 1 : v === 'debug2' ? 2 : v === 'debug3' ? 3 : v === 'debug4' ? 4
    : v === 'debug5' ? 5 : v === 'debug6' ? 6 : 0;
}

const RRW_DEBUG = [
  '',
  /* glsl */ 'outgoingLight = vec3(rrwWet, rrwScour, rrwRun);',
  /* glsl */ 'outgoingLight = vec3(rrwCav, rrwProud, rrwUnder);',
  // ?weather=debug3 — the RAW AO buffer in bands, because the threshold above cannot be
  // guessed: the post chain tonemapes and grades whatever is written here, so a greyscale
  // readout cannot be sampled back, but a BANDED one can be read off a single picture.
  //   red < 0.30   yellow 0.30-0.50   green 0.50-0.70   cyan 0.70-0.85   blue 0.85-0.95
  //   white >= 0.95
  /* glsl */ `
  float rrwQ = rrwAODbg;
  outgoingLight =
      rrwQ < 0.30 ? vec3(1.0, 0.0, 0.0)
    : rrwQ < 0.50 ? vec3(1.0, 0.9, 0.0)
    : rrwQ < 0.70 ? vec3(0.0, 1.0, 0.0)
    : rrwQ < 0.85 ? vec3(0.0, 0.9, 1.0)
    : rrwQ < 0.95 ? vec3(0.1, 0.1, 1.0)
    :               vec3(1.0);
  `,
  // ?weather=debug4 — the panel network, its gate, and their product. The failure this exists
  // to tell apart is "the network is drawn everywhere" (red covers the figure evenly) from
  // "the gate is finding nothing" (green is black), which look identical in a beauty render.
  /* glsl */ 'outgoingLight = vec3(rrwSeamCore, rrwSeamGate, rrwSeamCore * rrwSeamGate);',
  /*
   * ?weather=debug5 — WHICH MATERIAL FAMILY ACTUALLY LANDED WHERE. This is the control for the
   * bone resolver, and it exists because the resolver's failure mode is a picture that still
   * looks like a robot: match the wrong spine bone and you re-skin the CHEST (this rig chains
   * Hips -> Spine02 -> Spine01 -> Spine, so `Spine` is the chest, not the waist), match /arm/
   * too loosely and you take the shoulders with it. Both render as a plausible figure and
   * neither trips any threshold in the scoreboard.
   *
   * The three DELIVERED masks, after the edge smoothstep, the head veto and the precedence
   * rule — so this is what the shading actually used, not what was requested:
   *
   *   red   = CHROME   upper arms, waist, inner thighs
   *   green = DARK     the neck
   *   blue  = RUBBER   the feet
   *
   * A correct run therefore reads: red upper arms with WHITE (black here) forearms and hands
   * below them, a red band at the waist and NOT on the chest, red only on the inboard face of
   * each thigh, blue feet, green neck, and black everywhere else. Any channel bleeding onto the
   * chest plate is the spine-bone trap; red covering a whole thigh is the facing test failing
   * open, which is precisely what flipping uRRWLeftAxis's sign produces on purpose.
   */
  /* glsl */ 'outgoingLight = vec3(rrwChromeM, rrwDarkM, rrwRubberM);',
  /*
   * ?weather=debug6 — the RAW family vector, before any smoothstep, veto or precedence. Told
   * apart from debug5 it separates "the bone assignment is wrong" from "the edge bounds ate the
   * mask", which are indistinguishable in a beauty render and have opposite fixes.
   *
   *   red = raw chrome weight   green = raw dark weight   blue = |raw inner weight|
   */
  /* glsl */ 'outgoingLight = vec3(vRRWFam.x, vRRWFam.y, abs(vRRWFam.w));',
];

// Declarations. Injected over a pars include so it lands in the fragment header.
const RRW_PARS = /* glsl */ `
uniform float uRRWOn;      // master strength for this family; 0 = inert
uniform float uRRWGrime;   // how much loose deposit this material has to redistribute
uniform vec3  uRRWClean;   // LINEAR clean tint — the ceiling a scoured texel may be lifted to
uniform vec3  uRRWDirt;    // what a pooled texel is multiplied by. Near-neutral: VALUE, not hue
uniform float uRRWLift;    // scour gain, i.e. roughly the inverse of the baked soot multiply
uniform float uRRWOcc;     // CLEAN-surface cavity occlusion depth; 0 = the pre-round behaviour
uniform float uRRWCleanR;  // roughness a fully scoured texel returns to
uniform float uRRWMetal;   // 1 = metal, so soot (a dielectric) must kill metalness under it
uniform sampler2D uRRWAO;  // the pipeline's screen-space AO buffer, reused as a CAVITY mask
uniform float uRRWAOOn;    // 0 until a Pipeline with AO on has rendered — fail-safe to no cavity
uniform vec2  uRRWAORes;

uniform float uRRWSeam;    // panel-network depth. 0 = no render-time network at all
uniform float uRRWSeamPlate;// plate size in METRES of surface — not a uv frequency; see below
uniform float uRRWSeamWM;  // groove half-width in METRES, converted per fragment
uniform float uRRWSeamFlr; // share of the network that survives on a clean, flat, convex face
uniform float uRRWSeamOcc; // how much of the groove is OCCLUSION (multiplies finished radiance)
uniform float uRRWSeamNear;// broad shading of everything NEAR structure — see the block below
uniform float uRRWSeamCurv;// how much SCREEN-SPACE CURVATURE is allowed into the seam gate
uniform float uRRWOccPool; // how much curvature is allowed into the cavity term
uniform float uRRWOccCap;  // ceiling on the cavity term AFTER uRRWOcc scales it
uniform float uRRWSeamDeep;// groove DEPTH, independent of the gate that places it
uniform float uRRWSeamFit; // 1 = fade the network out on surfaces smaller than one plate
uniform float uRRWHeadClean;// how hard the head is protected from all of the above

// THE STRUCTURAL MATERIAL FAMILIES — see the block above RRW_BONE_PARS_VERT.
uniform float uRRWDark;     // master: 0 = inert, an EXACT revert of this whole feature
uniform float uRRWDarkAlb;  // albedo multiplier where the DARK mask is 1
uniform float uRRWDarkMetal;// metalness the dark surface is driven to
uniform float uRRWDarkRough;// roughness the dark surface is driven to
uniform float uRRWDarkCoat; // how much of the white plates' clearcoat a masked family removes
uniform vec2  uRRWDarkEdge; // smoothstep bounds on the bone weight — the material BOUNDARY

// CHROME. An ABSOLUTE tint rather than a multiplier: a metal's albedo IS its F0 reflectance,
// so "the shell darkened" is the wrong operation — chrome is a different colour, not a shaded
// white. uRRWChrEnv is the piece that stops it reading as dark grey; see RRW_MAPS.
uniform vec3  uRRWChrTint;
uniform float uRRWChrMetal;
uniform float uRRWChrRough;
uniform float uRRWChrEnv;   // environment gain over the shell's, matching chromeSatin()'s 2.4

/*
 * CHROME SURFACE CHARACTER — the two things a masked region does NOT inherit from
 * CHROME_SURFACE, because it is wearing SHELL_SURFACE's baked tile. See the block above the
 * machining code in RRW_BODY and the one above uRRWChrCon in RRW_MAPS.
 */
uniform float uRRWChrTurn;  // machining amplitude master; 0 = the tile-inherited surface exactly
uniform float uRRWChrPitch; // turned-line pitch in METRES of surface — not a uv frequency
uniform float uRRWChrDepth; // machining height amplitude in METRES; sets the slope with the pitch
uniform float uRRWChrRgh;   // roughness swing the machining drives
uniform float uRRWChrCon;   // RESOLVING POWER: contrast exponent on the gathered radiance. 1 = off
uniform float uRRWChrPiv;   // the linear radiance the contrast curve passes through unchanged
uniform float uRRWChrFloor; // LUMINANCE FLOOR in linear radiance. 0 = off, an EXACT revert

// RUBBER — the feet. Dark and matte and emphatically NOT a metal; that is the whole difference
// between "worn rubber tread" and "dark chrome boot".
uniform float uRRWRubAlb;
uniform float uRRWRubMetal;
uniform float uRRWRubRough;

// INNER-FACE CHROME — the inner thigh. uRRWLeftAxis is the body's own left direction in WORLD
// space, re-derived per draw from the two upper-leg bones; (0,0,0) makes the test inert.
uniform vec3  uRRWLeftAxis;
uniform vec2  uRRWInnerBand; // smoothstep bounds on inboard-facing-ness
uniform float uRRWInner;     // master for the facing test alone; 0 leaves the thighs white

/*
 * THE THIGH SEAM. The spec's inner/outer thigh are two PANELS with a seam down the middle front
 * and back, not one panel — and a seam is exactly where the facing test above crosses zero. Its
 * own master so it survives dlinner=0: the panel join exists whether or not the inner panel is
 * chrome. Sign-free, because |dot| is zero on the front centreline and on the back one alike.
 */
uniform float uRRWTSeam;    // master; 0 = no seam at all
uniform float uRRWTSeamW;   // half-width of the band, in |dot(normal, leftAxis)| units
uniform float uRRWTSeamD;   // albedo multiply in the trough
uniform float uRRWTSeamO;   // how much of the seam is OCCLUSION rather than pigment

/*
 * THE FOOT SOLE. The spec's rubber is the PLANTA only and the boot above it is the BRIGHTEST
 * region on the figure, so the foot bones' rubber family is gated by a downward-facing test.
 * uRRWUpAxis is the body's OWN up, re-derived per draw from hips -> head, so the test follows the
 * character when it leans or turns; it defaults to world up, which is the pre-round answer for a
 * standing figure rather than a guess.
 */
uniform vec3  uRRWUpAxis;
uniform vec2  uRRWSoleBand; // smoothstep bounds on downward-facing-ness
uniform float uRRWSole;     // 0 = the whole boot is rubber, i.e. the pre-round behaviour

/*
 * HOW MUCH OF THIS FRAGMENT BELONGS TO THE HEAD BONE — see RRW_BONE_VERT for how it is filled
 * and 'boneMaskAutoBind' for how the bone is found without any view having to say so.
 */
varying float vRRWHead;
// ...and its membership of each material family. Same mechanism, same fail-safe.
varying vec4  vRRWFam;

/*
 * THE JOINT FEATURES — the spec's five dark rings, and the chrome it asks for round the elbow
 * and the knee. See the block above RRW_BONE_PARS_VERT for the mechanism and for why the
 * distance is interpolated and the band is not.
 *   .x  metres to the nearest CREASED joint (1000 = this fragment has none)
 *   .y  how dark that crease is, 0..1, before uRRWRing scales it
 *   .z  metres to the nearest CHROME-CAPPED joint
 *   .w  how strongly that joint is capped, 0..1, before uRRWJoint scales it
 */
varying vec4  vRRWRing;
uniform float uRRWRing;   // master. 0 is the exact pre-round revert.
uniform vec2  uRRWRingW;  // metres: solid out to .x, gone by .y
uniform float uRRWRingD;  // albedo the crease takes away
uniform float uRRWRingO;  // ...and how much of the FINISHED light, which is the half that reads
/*
 * THE CHROME JOINT CAPS. 'player-material-spec.md': "Elbow: above, below, back, front and side
 * are chrome" and "Knee: above, below, back, front and side are chrome" — five directions each,
 * which is the spec's way of saying the whole assembly and not a facing test. So it is a RADIUS
 * about the joint, in the same metres the crease uses, and the crease then draws on top of it.
 */
uniform float uRRWJoint;  // master. 0 is the exact revert of the caps alone.
uniform vec2  uRRWJointW; // metres: solid out to .x, gone by .y

/*
 * THE TWO PANEL FEATURES. Both are BACK-facing, so both ride uRRWFwdAxis — derived per draw from
 * the TOES (see rrwFwdAxis), not from a cross product whose sign nobody wrote down.
 */
varying vec4  vRRWDet2;
uniform vec3  uRRWFwdAxis;
uniform float uRRWCalf;    // master, and its SIGN is the control: negative panels the SHIN FRONT
uniform vec2  uRRWCalfB;   // smoothstep bounds on back-facing-ness
/*
 * ⚠️ uRRWVent IS DECLARED HERE AND ONCE WAS NOT, AND THE FAILURE IS THIS PROJECT'S SIGNATURE ONE.
 * The fragment shader used it, the declaration was only added to the VERTEX side, the program
 * failed to compile, three dropped every draw using this material — and the harness reported
 * "1/1 captured" over a frame in which the entire body was missing while the ear rings and the
 * visor, which are different materials, drew normally. Nothing in the pipeline said a word. The
 * only instrument that caught it was looking at the picture.
 */
uniform float uRRWVent;    // master for the head's ventilation panel; sign flips its facing too
/*
 * ⚠️ THE HEAD-CLEAN MASK WAS DELETING THE HEAD'S OWN SPEC'D FEATURE, AND THIS IS THE MEASUREMENT.
 *
 * rrwHeadClean exists to keep DIRT and SEAMS off the head. But rrwNotHead is applied to the whole
 * of rrwChromeM and to the whole of rrwRidge, and the ventilation panel and its slots ride both —
 * so the one feature the spec puts ON the head was being multiplied out BY the head mask.
 *
 * '_head4-vent.mjs' measures how much. It pulls the 639 head-dominant vertices out of the live
 * skinned geometry in BIND space and reports, for each, the head skin weight the clean mask sees.
 * On the occiput — back-facing, in the lower 45% of the skull, which is exactly "the back of the
 * head where it meets the neck" — that weight is 0.571..0.876, median 0.721. rrwHeadClean is
 * smoothstep(0.25, 0.75, w), so at the median it is 0.895 and rrwNotHead is 0.105: NINE TENTHS of
 * the panel and of the slots were being erased, and what survived was the thin fringe lower down
 * where the weight falls off. A feature drawn at a tenth of its amplitude over a soft weight ramp
 * is not a panel with vents in it — it is a smudge, which is what the critique called a blotch.
 *
 * uRRWVentKeep routes the head's panel AROUND that multiply and gates the head's slots on the
 * panel instead — which is also the spec's own wording, "chrome panel WITH ventilation": the
 * slots live inside the panel or they do not exist. The waist's ridges keep rrwNotHead exactly as
 * before, because the waist is not the head's feature.
 *
 * '?dlventkeep=0' is the EXACT revert: at 0 the panel folds into rrwChromeM before the mask and
 * the slots multiply by plain rrwNotHead, which is bit-for-bit the old code path.
 */
uniform float uRRWVentKeep;
/*
 * ⚠️ t CANNOT BOUND THIS PANEL FROM ABOVE, AND THE FIRST BUILD OF THIS FIX PROVED IT IN ONE
 * PICTURE: the slots came out as seven concentric arcs wrapping the entire back of the skull and
 * over the crown, which is not a ventilation panel, it is a rib cage.
 *
 * The reason is in harness/_head4-vent.mjs and it follows from the fork. The mean axis leans 47
 * degrees FORWARD, so every vertex on the rear of the skull projects BEHIND the proximal joint, goes
 * negative, and RRW_BONE_VERT's clamp(aBoneEnd.x / len, 0, 1) flattens all of them onto t = 0 —
 * the probe measures 140 vertices at t < 0.1 spanning 0 to 0.159 m of height on a skull whose
 * crown is 0.279 m up. They are one number. No window in t can separate the bottom of that from
 * the top of it, because there is nothing left to separate.
 *
 * The quantity that DOES vary down the back of the skull is the head skin weight, and this shader
 * already carries it. The same probe: the occiput's weight runs 0.571..0.876 (median 0.721) while
 * the temple's runs 0.976..1.000 (median 1.000). Weight falls off toward the neck, so "where it
 * meets the neck" is literally a band of low head weight — the spec's own phrase, in the one
 * coordinate the rig hands us. uRRWVentH is that band's upper edge.
 *
 * It rides inside the uRRWVentKeep mix so '?dlventkeep=0' stays a bit-for-bit revert of
 * everything here; '?dlventh1=9' disables the bound on its own without touching the rest.
 */
uniform vec2  uRRWVentH;
uniform float uRRWRidge;   // master for the stripes — waist ridges and head ventilation
uniform float uRRWRidgeD;  // how much light a groove takes
/*
 * THE TWO CHROME WRIST RINGS. 'player-material-spec.md': "Wrist: two chrome rings." Two bands at
 * set distances from the wrist joint, which is exactly what 'player-fine-detail-plan.md' own
 * mechanism table says — its later "proud physical parts" list puts them in kit geometry instead,
 * and the two halves of that document disagree. Bands win here on evidence rather than by
 * preference: a ring on this character reads at ~3 px of figure height, the plan's own measured
 * floor for a part that must follow the silhouette is well above that, and a band costs no draw
 * call and no seating problem. If John wants them PROUD they become geometry; nothing here blocks
 * that, and '?dlwrist=0' removes these first.
 */
uniform float uRRWWrist;   // master
uniform vec2  uRRWWristAt; // metres from the wrist joint to each ring's centre
uniform float uRRWWristW;  // each ring's half-width, in metres

float rrwHash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float rrwNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = rrwHash(i);
  float b = rrwHash(i + vec2(1.0, 0.0));
  float c = rrwHash(i + vec2(0.0, 1.0));
  float d = rrwHash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float rrwFbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ v += a * rrwNoise(p); p *= 2.03; a *= 0.5; }
  return v;
}
// A sawtooth with a soft leading edge and a long trailing fade: 0 at the wrap, up to 1 within
// w, then a linear decay. Used on world Y, so it reads as "a horizontal edge, and grime weeping
// down from it". A raw 1.0 - fract() would put a hard discontinuity across the whole model.
float rrwSaw(float x, float w){
  float f = fract(x);
  return (1.0 - f) * smoothstep(0.0, w, f);
}

/*
 * PANEL NETWORK — the same construction as panelDist() in SHELL_SURFACE, evaluated here per
 * pixel instead of once into a tile. Kept as a duplicate on purpose: that one runs inside the
 * baker's own shader and this one inside three's, they share no compilation unit, and the two
 * uses now differ (this one is antialiased against the screen derivative, which is meaningless
 * in a bake). If you change the LANGUAGE of the network, change both — the bake still draws it
 * under ?seambake=1 and the two must not disagree about what a panel looks like.
 *
 * rrwHash is byte-identical to that file's sHash, so the two draw the same network.
 */
float rrwPanelDist(vec2 uv, float n, float seed, float density){
  vec2 g = uv * n;
  vec2 c = floor(g);
  float d = 1e9;
  for (int i = 0; i < 2; i++){
    float ex = c.x + float(i);
    float jx = (rrwHash(vec2(ex * 1.7, seed)) - 0.5) * 0.30;
    float onx = step(1.0 - density, rrwHash(vec2(ex, c.y) + seed + 11.0));
    d = min(d, onx > 0.5 ? abs(g.x - ex - jx) / n : 1e9);

    float ey = c.y + float(i);
    float jy = (rrwHash(vec2(seed, ey * 1.3)) - 0.5) * 0.30;
    float ony = step(1.0 - density, rrwHash(vec2(c.x, ey) + seed + 23.0));
    d = min(d, ony > 0.5 ? abs(g.y - ey - jy) / n : 1e9);
  }
  return d;
}
`;

/*
 * ===========================================================================================
 * THE HEAD MASK, AND WHY IT IS BUILT FROM SKIN WEIGHTS RATHER THAN FROM ANYTHING EASIER.
 *
 * THE DEFECT. Measured head/torso dark-fraction ratio is 0.33-0.58 in the art and 1.32-2.24 in
 * the render, disjoint across five neutrality cuts. Our head is the DIRTIEST region on the
 * character (15.5-22.9% dark, its highest seam density anywhere); the art's is the CLEANEST — a
 * single unbroken pearl shell at 7.1-10.9%. It is also where the eye lands first, so it is the
 * most expensive place on the model to be wrong.
 *
 * WHY THE SHELL CANNOT JUST BE TOLD. The animation GLB is ONE mesh with ONE primitive and no
 * material slots at all (verified by reading the glTF JSON chunk: `meshes: [char1 prims=1]`,
 * `materials: []`, 10,378 triangles). Every view assigns a single `shellWhite()` to the whole
 * rig, so there is no draw-call boundary at the neck to hang a different material on, and
 * making one would mean editing geometry — which this round is explicitly forbidden to do.
 *
 * WHAT WAS AVAILABLE, AND WHY EACH OF THE OBVIOUS ONES IS WRONG:
 *   world Y      — the material is shared by the procedural robot and three hunter stages, all
 *                  standing at different places, and the player jumps. A height cut would clean
 *                  a different band on every character in the scene.
 *   object Y     — no better on a SKINNED mesh, and on `unit4h.js` each part is its own geometry
 *                  with its own local origin, so "y is high" means nothing there.
 *   uv region    — the atlas is a repack; there is no contiguous head chart to key on.
 *   curvature    — that is the tessellation mosaic this same round exists to get rid of.
 *
 * The one frame that knows what a head is, is the SKELETON, and it is already in the vertex
 * shader: `skinIndex`/`skinWeight` say exactly how much of this vertex the Head bone owns. It
 * is animation-invariant (a bind-time property), it costs one varying, and on any mesh that is
 * not skinned it compiles to a constant 0.
 *
 * uRRWHeadBone is -1 until something binds it, and at -1 this whole feature is inert — so the
 * procedural robot, the hunters and every non-skinned caller are bit-for-bit unchanged. That is
 * the fail-safe, and `?headclean=0` is the A/B for the shell.
 * ===========================================================================================
 */
/*
 * ===========================================================================================
 * THE DARK STRUCTURAL MATERIAL, AND WHY IT RIDES THE SAME SKIN WEIGHTS AS THE HEAD MASK.
 *
 * THE DEFECT. The reference art is TWO-TONE. It gets its darks from a second, much darker
 * structural material — arms, hands, neck, abdomen — with the white plates left nearly
 * unbroken. Our body was one white shell with a procedural panel lattice scratched into it, and
 * that lattice is drawn in UV space over a body whose plate boundaries are somewhere else, so
 * it read as "out of place black lines all over the model" and is now off. Every attempt to
 * close the gap with a finer or coarser grid failed for the same structural reason: A GRID
 * CANNOT KNOW WHERE A PLATE ENDS.
 *
 * MEASURED, `harness/_two1_regionmap.mjs`, over baseline_front / side-left / back:
 *
 *   region        art value / white chest plate      verdict
 *   arms           0.563  0.721 | 0.622  0.667       DARK  (the dominant two-tone)
 *   abdomen        0.649        | 0.694              DARK
 *   neck           band 0.15-0.20 H is the darkest upper band in all three views
 *   pelvis         0.937        | 1.013              WHITE
 *   chest          1.000        | 1.000              WHITE
 *   shins          1.079        | 1.130              WHITE — the BRIGHTEST region on the figure
 *   thighs         inner 0.853/0.949 vs outer 0.771/0.706 — the two disagree, see below
 *
 * So the second material sits at 0.60-0.68 of the white plate's rendered value, and its edge is
 * HARD: the median light->dark transition is 4-5 px on an ~880 px figure, i.e. 0.46-0.57% of
 * figure height, p25 = 3 px, and all three views agree on that. That is a material boundary,
 * not a painted gradient — hence a tight smoothstep on the bone weight rather than a ramp.
 *
 * ⚠️ THE THIGHS ARE DELIBERATELY LEFT WHITE and that is a measurement result, not caution. The
 * brief expected "inner thighs" to be dark. The lateral map agrees (centreline dark at
 * 0.55-0.65 H) but the box probe says the opposite (outer thigh 0.771/0.706 is DARKER than
 * inner 0.853/0.949, in BOTH views). Two statistics off the same pixels disagreeing about the
 * sign means neither is evidence, so the thighs get 0 until something settles it.
 *
 * WHY SKIN WEIGHTS, AGAIN. Identical to the head mask's reasoning and it has not weakened: this
 * GLB is ONE mesh, ONE primitive, ZERO material slots, so there is no draw boundary at the
 * elbow to hang a second material on. World or object Y, uv region and curvature are all wrong
 * for a material shared with the procedural robot and three hunter stages. THE SKELETON IS THE
 * ONLY FRAME THAT KNOWS WHAT A FOREARM IS.
 *
 * THE FAIL-SAFE IS THE ARRAY ITSELF. uRRWDarkW is all zeros until something fills it, and an
 * all-zero mask is a bit-for-bit revert. The procedural robot (`unit4h.js`) and the hunters
 * carry NO skeleton at all — verified: neither file constructs a Bone, a Skeleton or a
 * SkinnedMesh — so `USE_SKINNING` is not even defined in their program and this compiles to a
 * constant 0 there. `?darklimb=0` is the A/B for the shell.
 * ===========================================================================================
 */
/*
 * ===========================================================================================
 * ROUND 2 — ONE FLAG BECOMES A FAMILY ASSIGNMENT, BECAUSE THE ERROR WAS THE MATERIAL AND NOT
 * THE AMOUNT.
 *
 * `docs/design/player-material-spec.md` is John's own art direction and it OVERRULES the
 * statistics that drove the round above. Read side by side, the previous round got the PLACES
 * roughly right and the MATERIAL wrong on five of them:
 *
 *   region        round 1        SPEC
 *   forearms      dark grey      WHITE          <- "the most visible error"
 *   hands         dark grey      WHITE
 *   upper arm     dark grey      CHROME
 *   waist         dark grey      CHROME
 *   inner thigh   white          CHROME
 *   feet          white          dark grey, rubber-like, for wear
 *
 * A single `dark` flag cannot express that, so the per-bone mask becomes a per-bone FAMILY
 * VECTOR. `uRRWFamW[bone]` is a vec4 of memberships and `vRRWFam` is their skin-weighted sum:
 *
 *   .x  CHROME    bright satin structural metal — the spec's "structure"
 *   .y  DARK      the round-1 dark structural metal. After this round only the neck wears it.
 *   .z  RUBBER    dark, matte, NON-metal. The feet, and nothing else.
 *   .w  INNER     chrome on the INBOARD FACE ONLY, sign-carrying: + on the character's left
 *                 limb, - on its right. See the facing test in RRW_BODY.
 *
 * WHY A vec4 AND NOT THREE float ARRAYS. A GLSL `float[64]` occupies 64 uniform vectors on any
 * driver that does not pack scalars — which is most of them — so three families would cost the
 * same as four vec4 arrays while carrying a quarter of the information. One vec4[64] costs
 * exactly what the single float[64] it replaces cost in the worst case, and leaves room for the
 * families the fine-detail round adds.
 *
 * WHY THE FOURTH CHANNEL IS SIGNED RATHER THAN A FIFTH ARRAY. "Inner thigh" is a FACING test,
 * and a facing test needs to know which way "inboard" is for the limb the fragment belongs to.
 * That is one bit, it is a property of the bone, and it survives the skin-weight blend because
 * every influence on a thigh vertex is on the same side of the body. So it rides in the sign of
 * the weight and costs nothing.
 *
 * ⚠️ THE INNER-THIGH TEST IS THE ONLY THING HERE THAT IS NOT PURELY PER-BONE, AND IT IS NOT THE
 * `aBoneLocal` MECHANISM. It needs a DIRECTION, not a position — so it is answered by the world
 * normal (already reconstructed in this shader) against the body's own left-right axis, which
 * `boneMaskAutoBind` derives per draw from the two upper-leg bones. That is animation-invariant
 * in the way that matters: the axis is re-derived from the live skeleton every draw, so it
 * follows the character round a corner instead of being baked to a world direction.
 * `docs/design/player-fine-detail-plan.md` is still the mechanism for everything that needs a
 * POSITION within a bone (rings, bands, panels); none of that is attempted here.
 * ===========================================================================================
 */
const RRW_MAXBONE = 64;

const RRW_BONE_PARS_VERT = /* glsl */ `
varying float vRRWHead;
varying vec4  vRRWFam;
uniform float uRRWHeadBone;
uniform vec4  uRRWFamW[ ${RRW_MAXBONE} ];

/*
 * ===========================================================================================
 * ROUND 3 — THE JOINT CREASES. The first feature on this character that needs to know WHERE
 * ALONG A BONE a fragment sits, which is the thing a skin weight can never say.
 *
 * 'docs/design/player-material-spec.md' asks for five of these and they are all one shape:
 *
 *   "A dark ring around the elbow actuator, in a crease."
 *   "A dark ring around the knee actuator, in a crease."
 *   "A dark ring around the ankle actuator, in a crease."
 *   "Where the arm detaches at the shoulder: much darker in the crease of the parts."
 *   "Where the leg detaches at the hip: much darker in the crease."
 *
 * Each is a dark band at ONE END of ONE BONE. 'aBoneEnd' (see mesh-avatar.js, where it is
 * computed and where the continuity argument lives) carries metres to the proximal joint and
 * metres to the distal one; 'uRRWBoneDet' says which of a bone's two ends carries a crease and
 * how dark. The vertex stage picks the nearer of the two ends that is actually creased and
 * hands the fragment stage one distance and one strength.
 *
 * ⚠️ WHY THE PICK IS IN THE VERTEX SHADER AND THE BAND IS IN THE FRAGMENT SHADER. The pick is a
 * per-bone decision and is constant over a vertex; the band is a smoothstep and interpolating a
 * smoothstep is not the same thing as smoothstepping an interpolant — at this mesh's density a
 * 2 cm ring can land inside a single triangle, and a vertex-side band would then be invisible.
 * Interpolating the DISTANCE and thresholding per pixel draws it at any tessellation.
 *
 * ✅ THE FAIL-SAFE IS ARITHMETIC RATHER THAN A FLAG. aBoneEnd.x + aBoneEnd.y is the bone's own
 * LENGTH, so it is positive on every real bone and exactly zero on a mesh that never met
 * 'attachBoneLocal' — where a missing attribute reads as 0. Gating on that sum is what stops
 * "distance to the joint is 0" being true everywhere on the procedural robot and the hunters,
 * which is the shape this project's silent failures always take.
 * ===========================================================================================
 */
#ifdef USE_SKINNING
  attribute float aBoneId;
  attribute vec2  aBoneEnd;
#endif
uniform vec4  uRRWBoneDet[ ${RRW_MAXBONE} ];
uniform float uRRWRingCtl;
varying vec4  vRRWRing;

/*
 * THE PANEL FEATURES — the two the spec puts in the BELLY of a bone rather than at a joint: the
 * chrome calf panel and the waist's flexion ridges. Separate array from uRRWBoneDet because they
 * are a different quantity; see rrwBonePanels().
 *
 * ⚠️ UNIFORM BUDGET, STATED SO THE NEXT FEATURE KNOWS WHAT IT IS SPENDING. This is the THIRD
 * vec4[64] in this vertex shader (uRRWFamW, uRRWBoneDet, uRRWBonePan) = 192 uniform vectors. The
 * WebGL2 floor is 256 and three's own standard vertex shader wants a few dozen, so ONE more array
 * of this size is the last one that fits on a minimum-spec device. The next feature packs into a
 * free channel — .z and .w of uRRWBonePan are both unused — or it re-thinks the layout.
 */
/*
 * uRRWBonePan, per bone:
 *   .x  CHROME PANEL strength, and its SIGN picks the window: positive uses uRRWCalfT (a band in
 *       the far half of the bone — the calf), negative uses uRRWVentT (a band at the near end —
 *       the back of the head where it meets the neck). Two features, one channel, because both
 *       are "a chrome panel over a window along the bone, back-facing".
 *   .y  STRIPE amplitude — the waist's flexion ridges and the head's ventilation slots. Also one
 *       operation: dark slots at a pitch, back-facing, on a chrome region.
 *   .z  that stripe's PITCH IN METRES, per bone. It rides here rather than in a uniform because
 *       the waist and the head want different pitches and they share the varying.
 *   .w  WRIST RINGS, and its sign says which end of the bone the wrist is: positive = distal
 *       (the forearm), negative = proximal (the hand).
 */
uniform vec4  uRRWBonePan[ ${RRW_MAXBONE} ];
uniform vec4  uRRWCalfT;   // fraction along the shin: ramp in .x->.y, ramp out .z->.w
uniform vec4  uRRWVentT;   // the same, for the head's ventilation panel
/*
 * ⚠️ DECLARED IN THIS STAGE AS WELL AS IN THE FRAGMENT STAGE, DELIBERATELY, AND NOT BY MISTAKE.
 * uRRWVentKeep gates a decision in BOTH shaders — it un-clamps the head panel's window here and
 * routes the finished panel around the head-clean mask there — so it needs a declaration in each.
 * The failure this file's uRRWVent block records is the OPPOSITE case (used in the fragment stage,
 * declared only in the vertex one, program silently dropped); two honest declarations are fine.
 */
uniform float uRRWVentKeep;
/*
 *   .x  the chrome PANEL's membership from POSITION alone; the facing test is per pixel
 *   .y  the STRIPE amplitude, likewise
 *   .z  the stripe's phase IN CYCLES — the per-bone pitch is already divided out, which is what
 *       lets one varying serve two features at two different pitches. Safe to interpolate across
 *       a bone boundary only because the fragment stage gates hard on .y being ~1; see the
 *       interior-gate block in RRW_BODY, which exists because the first build drew a maze.
 *   .w  metres to the WRIST joint, 1000 where this fragment has none. Monotone away from the
 *       wrist on every bone that carries it, so the interpolation to 1000 on a neighbour never
 *       re-enters the band from above — the same argument aBoneEnd makes for the creases.
 */
varying vec4  vRRWDet2;

/* Same range fail-safe, and the same reason, as rrwFamW below: out of range is NO detail. */
vec4 rrwDetW(float bi) {
  return (bi < 0.0 || bi > float(${RRW_MAXBONE - 1})) ? vec4(0.0) : uRRWBoneDet[int(bi)];
}

/*
 * Which END of this bone is nearest, out of the ends that carry the feature at all, and how
 * strong it is there. Returns (metres, strength); 1000 metres is "this bone has no such feature",
 * which every band downstream reads as "not near one".
 *
 * abs(), because a vertex can sit OUTSIDE its bone's span at either end and a joint feature is
 * symmetric about the joint — the shoulder cap's top is behind the arm bone's origin, and the
 * kneecap sits proud of both bones that meet under it.
 *
 * ⚠️ ctl IS THE FRAME CONTROL AND IT IS NOT A DEBUG FLAG. See uRRWRingCtl's block below: it
 * moves the feature to the MIDDLE of the bone, which is the only way to tell a correctly-placed
 * joint feature from one whose distance is wrong by a scale factor or a sign.
 */
vec2 rrwNearEnd(vec2 ends, float len, float sProx, float sDist, float ctl) {
  if (sProx <= 0.0 && sDist <= 0.0) return vec2(1000.0, 0.0);
  if (ctl > 0.5) return vec2(abs(ends.x - 0.5 * len), max(sProx, sDist));
  float dp = sProx > 0.0 ? abs(ends.x) : 1000.0;
  float dd = sDist > 0.0 ? abs(ends.y) : 1000.0;
  return dp <= dd ? vec2(dp, sProx) : vec2(dd, sDist);
}

/*
 * One skin influence's contribution to the family vector.
 *
 * The range test is a FAIL-SAFE, not a formality. Clamping an out-of-range index instead would
 * silently hand a bone the families of bone 63 — a wrong-region bug that renders as a plausible
 * picture. Out of range returns 0, which is "white plate", which is the pre-round behaviour.
 */
vec4 rrwFamW(float bi, float w) {
  return (bi < 0.0 || bi > float(${RRW_MAXBONE - 1})) ? vec4(0.0) : uRRWFamW[int(bi)] * w;
}
`;

/*
 * Injected over <skinning_vertex>. That chunk is always PRESENT in the source and expands to
 * nothing when USE_SKINNING is undefined, so patching it is safe on unskinned materials — but
 * skinIndex/skinWeight only EXIST under USE_SKINNING, hence the guard. The varying is written
 * on every path: a varying the vertex shader leaves unassigned is undefined, not zero.
 *
 * step(abs(skinIndex - b), 0.4) rather than an equality test because skinIndex arrives as a
 * float attribute and an exact == on a float that made a round trip through a normalised
 * integer attribute is a coin flip on some drivers.
 */
const RRW_BONE_VERT = /* glsl */ `
vRRWHead = 0.0;
vRRWFam = vec4(0.0);
/*
 * 1e3 metres from the nearest joint feature, i.e. nowhere near one. A varying the vertex shader
 * leaves unassigned is UNDEFINED rather than zero, and zero here would mean "in the middle of it".
 *
 * ⚠️ THE CONTROL, AND IT IS THE ONE THING HERE THAT COULD NOT BE CHECKED FROM A PICTURE OF THE
 * SHIPPED ARM. A band drawn at a WRONG distance still renders as a plausible band, so "there is a
 * dark ring near the elbow" is not evidence that the bone frame is oriented or scaled correctly —
 * a frame 100x out, or reversed, would put a band SOMEWHERE and a critic would call it a joint.
 * '?dlringctl=1' moves every joint feature to the MIDDLE of its own bone: bands across the belly
 * of the forearm and the shin, at no joint at all. If the distance were not real, the two
 * pictures could not differ. It drives BOTH halves, so neither can pass on the other's evidence.
 */
vRRWRing = vec4(1000.0, 0.0, 1000.0, 0.0);
vRRWDet2 = vec4(0.0, 0.0, 0.0, 1000.0);
#ifdef USE_SKINNING
  {
    vec4 rrwDet = rrwDetW(aBoneId);
    float rrwBoneLen = aBoneEnd.x + aBoneEnd.y;      // == the bone's length, by construction
    if (rrwBoneLen > 1e-4) {
      vRRWRing.xy = rrwNearEnd(aBoneEnd, rrwBoneLen, rrwDet.x, rrwDet.y, uRRWRingCtl);
      vRRWRing.zw = rrwNearEnd(aBoneEnd, rrwBoneLen, rrwDet.z, rrwDet.w, uRRWRingCtl);

      vec4 rrwPan = (aBoneId < 0.0 || aBoneId > float(${RRW_MAXBONE - 1}))
        ? vec4(0.0) : uRRWBonePan[int(aBoneId)];
      /*
       * THE CALF PANEL'S POSITION HALF. t is 0 at the knee and 1 at the ankle, so "closer to the
       * Achilles tendon" is a window in the UPPER half of that range. It is authored as a
       * FRACTION rather than in metres because it is a proportion of the shin — the same panel on
       * a taller character sits at the same place on the leg, and the metre value would not.
       *
       * ⚠️ THE WINDOW IS BUILT PER VERTEX AND INTERPOLATED, WHICH IS WHY IT STOPS AT THE BONE.
       * A vertex on the foot or the thigh has rrwPan.x == 0, so the membership falls to zero
       * across the boundary triangle on its own. No separate edge test, and no leak onto the boot.
       */
      if (rrwPan.x != 0.0) {
        float rrwTRaw = aBoneEnd.x / rrwBoneLen;
        float t = clamp(rrwTRaw, 0.0, 1.0);
        /*
         * ⚠️ THE CLAMP IS RIGHT FOR THE CALF AND IT DESTROYS THE HEAD PANEL. Head is a FORKED
         * bone and boneAxisTable gives it the MEAN of head_end and headfront, which leans 47
         * degrees forward — so the entire occiput projects BEHIND the proximal joint and lands at
         * a NEGATIVE fraction. clamp() flattens all of it onto exactly 0, and a window in a
         * constant cannot place anything. harness/_head4-vent.mjs bins the back-facing head
         * vertices by height and prints both: the unclamped fraction runs -0.317, -0.169, 0.046,
         * 0.263, 0.477 from the bottom fifth of the skull to the crown — cleanly monotone, exactly
         * the vertical coordinate this panel needs — while the clamped one reads 0.000 for the
         * bottom TWO fifths and separates nothing. Unclamped, the window is authored in negative t
         * and the panel sits where the spec puts it.
         *
         * The shin is unaffected in both senses: its own window is positive and its bone axis is
         * not forked, so nothing on the calf ever reaches the clamp. Only the head branch changes,
         * and only at uRRWVentKeep 1 — at 0 this is clamp() exactly, which is the exact revert.
         */
        if (rrwPan.x < 0.0) t = mix(t, rrwTRaw, uRRWVentKeep);
        vec4 rrwWin = rrwPan.x > 0.0 ? uRRWCalfT : uRRWVentT;
        // The SIGN is carried through to the fragment stage, which is how one varying serves two
        // panels with two masters and two facing bands. It is constant within a bone, and a
        // neighbouring bone contributes 0, so the interpolation never crosses zero from the wrong
        // side — the same argument the INNER family channel already makes for the thigh.
        vRRWDet2.x = sign(rrwPan.x) * abs(rrwPan.x) * smoothstep(rrwWin.x, rrwWin.y, t)
                                    * (1.0 - smoothstep(rrwWin.z, rrwWin.w, t));
      }
      // The stripes carry a PHASE as well as a membership, already divided by this bone's own
      // pitch so one varying serves the waist and the head at different pitches.
      if (rrwPan.y > 0.0 && rrwPan.z > 1e-5) {
        vRRWDet2.y = rrwPan.y;
        vRRWDet2.z = aBoneEnd.x / rrwPan.z;
      }
      /*
       * ⚠️ SIGNED, AND abs() WAS THE FIRST BUILD'S BUG. The wrist is the forearm's DISTAL end and
       * the hand's PROXIMAL one, so with abs() each authored ring distance drew TWICE — once up
       * the forearm and once down the hand. The capture showed FOUR rings for two spec lines, and
       * "Wrist: two chrome rings" is a count.
       *
       * Signed, the quantity is metres ABOVE the wrist: positive on the forearm, negative on the
       * hand, continuous through exactly 0 at the joint. Two positive ring positions then draw
       * two rings, and the hand side is simply out of range.
       *
       * ⚠️ AND THE SENTINEL'S SIGN IS LOAD-BEARING. 1000 means "no wrist here". From the forearm's
       * far end (+0.25 at the elbow) the interpolation to a neighbouring bone's 1000 climbs away
       * from the rings and never re-enters them. From the HAND side it would climb THROUGH them,
       * which is why every bone on the hand chain — fingers included, and RRW_REGION.hand matches
       * them — carries the negative sign rather than being left at the sentinel.
       */
      if (rrwPan.w != 0.0) vRRWDet2.w = rrwPan.w > 0.0 ? aBoneEnd.y : -aBoneEnd.x;
    }
  }
  if (uRRWHeadBone >= 0.0) {
    vec4 rrwHB = vec4(uRRWHeadBone);
    vRRWHead = dot(step(abs(skinIndex - rrwHB), vec4(0.4)), skinWeight);
  }
  // The family set is a per-bone VECTOR rather than a single index, so one lookup covers chrome,
  // dark, rubber and the inner-face test at once and each can be graded independently.
  vRRWFam = rrwFamW(skinIndex.x, skinWeight.x) + rrwFamW(skinIndex.y, skinWeight.y)
          + rrwFamW(skinIndex.z, skinWeight.z) + rrwFamW(skinIndex.w, skinWeight.w);
#endif
`;

// The body. Injected immediately before <lights_physical_fragment>, which is where
// diffuseColor / roughnessFactor / metalnessFactor are still live and the world frame is
// reconstructible from three's own view-space quantities.
const RRW_BODY = /* glsl */ `
float rrwWet = 0.0;
float rrwScour = 0.0;
float rrwPool = 0.0, rrwProud = 0.0, rrwRun = 0.0, rrwTop = 0.0, rrwUnder = 0.0, rrwCav = 0.0;
float rrwAODbg = 1.0;
float rrwSeamCore = 0.0, rrwSeamGate = 0.0, rrwSeamOcc = 0.0;
/*
 * THE HEAD IS KEPT CLEAN — see the block above RRW_HEAD_PARS_VERT for the measurement and for
 * why this is a skin weight and not a height. smoothstep rather than the raw weight so the
 * transition sits inside the neck joint instead of drawing a hard line at the vertex where the
 * weighting happens to hand over; the jaw and the crown are both solidly Head-weighted, so the
 * ramp only ever falls in the collar.
 */
float rrwHeadClean = smoothstep(0.25, 0.75, vRRWHead) * uRRWHeadClean;
if (uRRWOn > 0.0001) {
  // WORLD FRAME. inverseTransformDirection is three's own idiom for view->world on a
  // direction; the same multiply without the normalize converts the view-space vector from
  // the camera to this fragment, and viewMatrix's inverse translation IS cameraPosition.
  vec3 rrwN = inverseTransformDirection(nonPerturbedNormal, viewMatrix);
  vec3 rrwP = cameraPosition + (vec4(-vViewPosition, 0.0) * viewMatrix).xyz;

  // SIGNED CURVATURE in 1/metres: the divergence of the normal field over the surface.
  // Positive on a convex ridge, negative in a concave crease, and its magnitude is the
  // reciprocal of the radius — a 5 cm crease reads -20. Derivatives are the only way to get
  // a cavity term on a SHARED material that knows nothing about the mesh it is on.
  vec3 rrwDNx = dFdx(rrwN), rrwDNy = dFdy(rrwN);
  vec3 rrwDPx = dFdx(rrwP), rrwDPy = dFdy(rrwP);
  float rrwDen = max(dot(rrwDPx, rrwDPx) + dot(rrwDPy, rrwDPy), 1e-9);
  float rrwCurv = clamp((dot(rrwDNx, rrwDPx) + dot(rrwDNy, rrwDPy)) / rrwDen, -90.0, 90.0);

  rrwPool  = smoothstep(-2.0, -20.0, rrwCurv);   // crevice, seam, panel gap
  rrwProud = smoothstep( 3.0,  20.0, rrwCurv);   // ridge, rolled edge, kneecap

  // GRAVITY, from the world normal rather than from a texture coordinate.
  float rrwUp    = rrwN.y;
  rrwTop   = smoothstep( 0.20,  0.85, rrwUp);    // rained on and walked into
  rrwUnder = smoothstep(-0.05, -0.70, rrwUp);    // sheltered, keeps its deposit
  float rrwSide  = 1.0 - abs(rrwUp);                   // near-vertical, where run-off runs

  // RUN-OFF. Sampled in world XZ only, so the pattern is constant along world Y and therefore
  // vertical on every surface in the scene regardless of that surface's own parameterisation.
  float rrwPhase = rrwFbm(rrwP.xz * 2.6);
  float rrwFine  = rrwFbm(rrwP.xz * 19.0 + rrwPhase * 3.0);
  rrwRun   = rrwSaw(-rrwP.y * 3.1 + rrwPhase * 2.7, 0.07) * 0.62
           + rrwSaw(-rrwP.y * 1.25 + rrwFine * 1.9, 0.10) * 0.38;
  // only some columns weep, and only down near-vertical faces
  rrwRun *= smoothstep(0.28, 0.84, rrwFine) * rrwSide;

  /*
   * CAVITY, from the pipeline's screen-space AO buffer.
   *
   * THE DEBUG PASS IS WHY THIS TERM EXISTS AND IT OVERTURNED THE FIRST DESIGN. Painting the
   * masks (?weather=debug) showed the curvature estimator firing beautifully on every panel
   * line, rim, ring and rolled edge — and finding essentially NOTHING in the armpit, which is
   * the first place the complaint names. The reason is structural: screen-space curvature can
   * only see concavity WITHIN one continuous surface, and this character's deep pockets are
   * gaps between separate, individually convex, interpenetrating meshes. There is no concave
   * surface in an armpit, so there is nothing for a derivative to find.
   *
   * The AO buffer is the one signal already in this shader that does see them — it is exactly
   * a map of "how enclosed is this point", which is exactly where run-off collects and never
   * dries. It is low-resolution and blurred, so it contributes the BROAD soft pooling while
   * the curvature term above contributes the tight seam lines.
   *
   * THE THRESHOLD IS MEASURED, NOT GUESSED, and the first guess was wrong by a wide margin.
   * '?weather=debug3' paints the raw buffer in bands, because the post chain tonemaps and
   * grades anything written to 'outgoingLight' and a greyscale readout therefore cannot be
   * sampled back, whereas a banded one can be read off a single picture. On hunter.3 the
   * buffer sits almost entirely in 0.50-0.85 — that is the general half-space occlusion every
   * point on a dense model has, not a pocket — and the genuinely enclosed points (armpits,
   * chest/collar recess, panel gaps, knee ring, boot-to-ankle junction, between the fingers)
   * are the sparse 0.30-0.50 band. An initial 0.34-0.92 window therefore called the ENTIRE
   * character a crevice, which would have replaced one uniform field with another.
   *
   * ⚠️ Do not widen the top of this window. Above ~0.6 it stops selecting pockets, and the
   * 30%-resolution buffer also bleeds unoccluded background across silhouette gaps (the
   * crotch V and the underside of the chest plate both read HIGHER than the flat thigh in
   * front of them), so a loose window picks up halo as well as noise.
   */
  float rrwAO = 1.0;
  if (uRRWAOOn > 0.5) rrwAO = texture2D(uRRWAO, gl_FragCoord.xy / uRRWAORes).r;
  rrwAODbg = rrwAO;
  rrwCav = 1.0 - smoothstep(0.28, 0.55, rrwAO);

  /*
   * A HARD FEATURE IS A GROOVE AND A LIP AT THE SAME TIME, and which one a texel gets is
   * decided by gravity. The up-facing flank of a panel edge is scoured to a bright polished
   * lip by rain and contact; the groove beside and beneath it packs with grime. Splitting the
   * one curvature signal by facing is what turns "I have an edge detector" into the reference's
   * actual read, and it is where most of the seam pooling comes from.
   */
  float rrwLip  = rrwProud * rrwTop;
  float rrwSeam = rrwProud * (1.0 - rrwTop);

  // DEPOSIT vs REMOVAL. Dirt is placed by water and taken off by contact and rain.
  float rrwAdd = clamp(rrwCav * 1.45 + rrwPool * 1.10 + rrwSeam * 0.70
                     + rrwUnder * 0.55 + rrwRun * 1.00, 0.0, 1.5);
  float rrwOff = clamp(rrwTop * 0.80 + rrwLip * 1.10, 0.0, 1.0);
  // an upward-facing POCKET is still a trap — that is the boot top, and it must not scour
  rrwOff *= 1.0 - max(rrwCav, rrwPool);

  // Even a showroom shell has contact grime in its pockets and a polished lip on its proud
  // edges, so a little of this is not gated by grime. Small on purpose: this file's rule is
  // RESTRAINT and the sheet's player is clean.
  rrwWet   = clamp((uRRWGrime * rrwAdd + 0.10 * max(rrwCav, rrwPool)) * uRRWOn, 0.0, 1.0);
  rrwScour = clamp((uRRWGrime * rrwOff + 0.08 * rrwLip) * uRRWOn, 0.0, 1.0);

  /*
   * DEEP OCCLUSION, AND IT IS OCCLUSION RATHER THAN DIRT.
   *
   * The reference's third surface property, after the brushed finish and the panel seams, is
   * that its creases go genuinely DARK — the armpit, the crotch, under the chest plate, the
   * knee ring, the ankle. Measured on the render, the legs' 5th percentile sat at luma 126-138
   * against the art's 38-61: the darkest twentieth of our leg was still a mid grey, i.e. there
   * was no crease on the character that the light did not reach.
   *
   * The cavity masks needed to fix that were already computed here and were being spent
   * entirely on GRIME — the clean-shell term was 0.10 * cav feeding a 0.40 dirt multiply, so a
   * showroom robot could lose at most 6% of its value in its deepest pocket. That conflates two
   * different things. Dirt is a deposit and belongs behind uRRWGrime; occlusion is geometry and
   * is there on a factory-fresh machine. So it gets its own term, applied BEFORE the dirt mix
   * and unscaled by grime.
   *
   * FAIL-SAFE AND CONTROL. rrwCav comes from the pipeline's AO buffer, and uRRWAOOn is 0 until
   * a Pipeline with AO enabled has actually rendered — so in a view with no AO pass rrwAO is 1,
   * rrwCav is 0, and this term contributes nothing rather than guessing. rrwPool is derivative
   * curvature and needs no buffer, so a no-AO view still gets the tight seam creases.
   * uRRWOcc = 0 is an exact revert.
   */
  /*
   * 🚨 TWO BUGS IN THE LINE THIS REPLACES, AND ONE OF THEM PAINTED A HOLE IN THE CHARACTER.
   *
   * It used to read
   *     float rrwOcc = clamp(rrwCav * 0.85 + rrwPool * 0.55, 0.0, 1.0) * uRRWOcc;
   *     diffuseColor.rgb *= 1.0 - rrwOcc;
   *
   * (1) THE CLAMP IS BEFORE THE SCALE, SO THE RESULT IS NOT CLAMPED AT ALL. The shell runs
   *     uRRWOcc 1.45, so any texel whose masks summed past 1/1.45 = 0.690 got '1.0 - rrwOcc'
   *     NEGATIVE and its albedo went to black — not dark, CLIPPED. rrwCav alone reaches 0.85,
   *     so cav > 0.81 was enough on its own. That is the black crust the critique found ringing
   *     the visor bezel: the bezel, the ear discs and the neck column are separate interpenetrating
   *     parts, the AO buffer reads the gaps between them as fully enclosed, and every one of those
   *     pixels clipped to zero simultaneously. A clipped region has no internal variation, which
   *     is exactly why it reads as a hole rather than as a shadow. uRRWOccCap now bounds the
   *     finished term, so the deepest pocket keeps a little albedo and stays a dark TINTED grey.
   *
   * (2) rrwPool IS SCREEN-SPACE CURVATURE ON A FACETED MESH, AND AT WEIGHT 0.55 x 1.45 = 0.80 IT
   *     WAS THE SECOND-LARGEST DARK SOURCE ON THE BODY. Measured by ablation on the Alert pose
   *     ('?rseams=0', i.e. cavity only): 3016 dark px below luma 90 arriving in 240 connected
   *     components — 79.6 components per 1000 dark px, against the art's 3.4. Per dark pixel that
   *     is the SPECKLIEST term on the character. The mechanism is in the uRRWSeamNear block below
   *     and it is not fixable by moving the threshold: this body is 10,378 triangles with
   *     per-vertex normals, so a 2 cm triangle on a 6 cm limb generates curvature around 16 1/m
   *     from TESSELLATION alone, which is the same magnitude the genuine creases sit at. The two
   *     are not separable by a threshold because they are not separable at all.
   *
   *     So the weight moves onto rrwCav, which comes from the AO buffer — 30% resolution and
   *     blurred, therefore intrinsically low-frequency, therefore incapable of drawing a triangle.
   *     '?rpool=1' restores the old weight and is the control: it puts the speckle straight back.
   */
  float rrwOcc = clamp(clamp(rrwCav * 0.85 + rrwPool * 0.55 * uRRWOccPool, 0.0, 1.0) * uRRWOcc,
                       0.0, uRRWOccCap);
  // The art's head carries occlusion only where the bezel meets the shell, not over the dome.
  // Two thirds off rather than all of it: at zero the skull loses its terminator and reads as a
  // flat white disc, which is a worse failure than the crust was.
  rrwOcc *= 1.0 - rrwHeadClean * 0.66;
  diffuseColor.rgb *= 1.0 - rrwOcc;

  /*
   * =======================================================================================
   * PANEL SEAMS, GATED BY GEOMETRY. See the uSeamBake paragraph at the top of this file for
   * why they are drawn here and not baked into the albedo.
   *
   * THE GATE IS THE WHOLE POINT. A uv-space network is a plausible panel LANGUAGE but it has
   * no idea what part of the body it is on, so drawn flat it panels the thigh front exactly as
   * hard as the knee ring — which is the crazed-glaze read. The reference concentrates its
   * darks at joints, plate edges and recesses and leaves large convex faces clean, and that is
   * a statement about GEOMETRY that only the masks above can make.
   *
   * ⚠️ THE GATE IS BROADER THAN rrwPool / rrwProud AND HAS TO BE — THIS WAS MEASURED, AND THE
   * FIRST VERSION OF IT WAS WRONG. Gating on the weathering's own rrwPool/rrwProud (thresholds
   * 2..20 and 3..20 in 1/m) painted almost nothing: '?weather=debug4' with the floor at 0 shows
   * why, and it is obvious once seen. Those two masks are LINE fields — they fire on the crease
   * itself and nowhere else — so multiplying them by the panel network multiplies one thin line
   * field by another, and two thin line fields only intersect at points. Whole dark<90 moved
   * 3.4% -> 4.0% for the entire network, i.e. the seams were not being placed anywhere, they
   * were being deleted.
   *
   * What the gate has to express is "this pixel is NEAR structure", not "this pixel is on a
   * crease", so it gets its own much broader pair of thresholds off the same curvature. A 30 cm
   * thigh front reads about 3 1/m and still comes out near zero; a 12 cm forearm reads ~8 and
   * lights up; a 5 cm knee ring saturates. That is the shape of the reference's own
   * distribution, and it leaves the big convex faces clean, which is the whole ask.
   *
   * ⚠️ THE FLOOR IS NOT ZERO AND MUST NOT BE. At gate 0 exactly, a flat plate carries no line
   * at all and the character reads as one seamless pressing with dirt in its creases — the
   * reference does put occasional seams across open faces. uRRWSeamFlr is how much of the
   * network survives there; it buys read at a direct cost in facet energy, so it is a knob.
   *
   * ⚠️ THE PLATE IS A SIZE IN METRES, NOT A UV FREQUENCY, AND THIS IS NOT A REFINEMENT — IT IS
   * WHAT STOPS THIS PASS WRECKING THE PROCEDURAL ROBOT. The bake could afford to count lines
   * per uv unit because the same tile lands on every mesh. This pass cannot: it draws into
   * whatever uv the mesh happens to carry, and the two characters that share this material do
   * not agree about what a uv unit is by two orders of magnitude. The generated player's atlas
   * is about 2.04 m of surface per uv unit; unit4h.js authors its parts by hand, a cylinder
   * segment at a time, so one uv unit there is the width of a shin. Drawn at a fixed 15 lines
   * per uv unit the same code is a 14 cm plate on one character and a 5 mm CROSS-HATCH on the
   * other — which is exactly what the first turnaround capture of this round showed.
   *
   * Metres per uv unit is recoverable per fragment: we already have both dFdx(uv) and dFdx of
   * the world position, and their ratio is it. Dividing the plate size in metres by that gives
   * the frequency this fragment should use, so a 14 cm plate is 14 cm on any mesh with any
   * unwrap. The groove half-width rides the same conversion.
   *
   * The frequency then varies per fragment, which would normally tear a grid apart — floor()
   * of a moving grid is not a continuous line. It survives because uv density is near constant
   * WITHIN a chart and only changes BETWEEN charts, and a chart boundary is already a
   * discontinuity in this network by construction (see the atlas note at the top of the file).
   *
   * ANTIALIASING, which the baked version got from mipmaps and this does not. The groove is
   * about 9 mm on a 1.7 m character; at any distance it goes sub-pixel, and a sub-pixel
   * smoothstep is a flicker generator on a walking figure. Widening the profile to at least
   * one pixel of uv trades the (already invisible) width for stability.
   * =======================================================================================
   */
#ifdef USE_MAP
  if (uRRWSeam > 0.0001) {
    vec2 rrwSUV = vMapUv;
    float rrwSPx = max(length(dFdx(rrwSUV)), length(dFdy(rrwSUV)));

    // metres of surface per uv unit at this fragment — the whole point of the note above
    float rrwSMpU = (length(rrwDPx) + length(rrwDPy))
                  / max(length(dFdx(rrwSUV)) + length(dFdy(rrwSUV)), 1e-7);
    /*
     * ⚠️ QUANTISED TO A POWER OF TWO, AND THE UNQUANTISED VERSION WAS MEASURED FIRST SO THIS IS
     * NOT SUPERSTITION. rrwSMpU is built from screen derivatives, so it wobbles from pixel to
     * pixel; feeding that straight in makes floor(uv * n) inside rrwPanelDist land in DIFFERENT
     * CELLS for neighbouring pixels, and the network stops being lines and becomes chopped
     * fragments with a new end every few pixels. Facet energy read 19.4-20.0 that way — worse
     * than the flat bake this round replaced, and for a change that was supposed to be neutral
     * on this character. Snapping to a power of two makes the frequency exactly constant over
     * whole regions, so the only discontinuity is the single contour where the exponent steps,
     * and the plate size is then within a factor of two of what was asked for.
     *
     * (floor(x + 0.5) rather than round(x): round() is not in GLSL ES 1.00, and this shader has
     * to compile on the WebGL1 path as well. Rounding rather than flooring the exponent is what
     * keeps the delivered plate within sqrt(2) of the requested one instead of up to 2x over —
     * flooring it turned the asked-for 13.6 cm into 25.5 cm and cost 1.3 points of dark<90.)
     */
    float rrwSRatio = rrwSMpU / max(uRRWSeamPlate, 0.005);
    float rrwSN = exp2(floor(log2(clamp(rrwSRatio, 1.0, 600.0)) + 0.5));
    float rrwSW = max(uRRWSeamWM / max(rrwSMpU, 1e-4), rrwSPx * 1.20);
    /*
     * =====================================================================================
     * 🚨 THE LOWER CLAMP ABOVE IS A DEGENERATE CASE AND IT IS WHY A KIT PART WEARING THIS
     * MATERIAL PHOTOGRAPHS AS A FLAT DARK WASH. This is the real cause of the defect that
     * 'mesh-identity.js' used to work around by handing the shoulder bosses an UN-INJECTED
     * clone of the shell; the skinning varyings it blamed are innocent (see below).
     *
     * The plate is a size in METRES and the frequency is metres-per-uv over it. On the
     * player's 2.044 m per uv unit that ratio is 7.6 and the block above works as designed.
     * On a KIT PART it is not: a 40 mm dome boss carries its own generated uv spanning the
     * full 0..1 square, so it measures about 0.04 m per uv unit and the ratio is ~0.15. The
     * clamp then pins the grid at ONE CELL over the entire part, while the groove half-width
     * — 14.5 mm, converted through the same tiny metres-per-uv — becomes a large fraction of
     * that one cell. The part is not panelled. The part IS a groove, plus a 4.6x shoulder.
     *
     * MEASURED, capFixtureFR at azim 0 on the shared material (harness/_hubs2-uni.mjs and
     * _hubs2-plate.mjs), each uniform zeroed one at a time and the delivered pixel read back:
     *
     *   shipped                 ( 77, 75, 65)     the dark hole
     *   uRRWSeam   = 0          (161,157,145)   +84   <- the network, i.e. this block
     *   uRRWSeamDeep = 0        (161,157,145)   +84
     *   uRRWOcc    = 0          (101, 98, 86)   +24
     *   uRRWOn     = 0          (192,189,178)  +115   the whole injection off
     *   uRRWDark   = 0          ( 77, 75, 65)     0   <- THE FAMILY VARYINGS DO NOTHING HERE
     *
     * The last row is the control for the diagnosis this replaces. uRRWDark is the master for
     * every varying-driven family mask, so if an unwritten 'vRRWFam' were washing the part
     * dark, zeroing it would have brightened it. It moves nothing. RRW_BONE_VERT already
     * initialises all four varyings outside the '#ifdef USE_SKINNING' guard, and this
     * measurement is what proves that initialisation is doing its job.
     *
     * AND THE PLATE SWEEP IS THE CONTROL FOR THE MECHANISM ITSELF. If the wash were the
     * network drawn at a WRONG-BUT-REAL frequency, changing the plate size would change the
     * picture. It does not — 0.27 / 0.14 / 0.06 all deliver bit-identical (77,75,65), because
     * all three are below the clamp and deliver the same one cell. Only at 0.03, where the
     * ratio finally passes 1, does the value move (57,55,48). A dial that does nothing over a
     * 4x range is the signature of a clamped quantity, not of a mis-tuned one.
     *
     * THE FIX IS TO FADE THE NETWORK OUT WHERE A WHOLE PLATE DOES NOT FIT, rather than to
     * clamp it to one cell. A part smaller than a single plate has NO plate boundary crossing
     * it — the honest picture of a 4 cm boss pressed from 26 cm plate stock is unbroken metal.
     * The fade is on the ratio the clamp already computes, so it costs nothing new, and it is
     * inert wherever the block was working: at the player's 7.6 it is exactly 1.0, so the body
     * and every other above-plate surface are bit-for-bit unchanged. '?rseamfit=0' restores
     * the clamp-only behaviour and is the A/B for this paragraph.
     *
     * ⚠️ IT GATES, IT DOES NOT SUPPRESS. The bosses keep the rest of the weathering — grime,
     * scour, the cavity term, the screen AO — which is the point: they rejoin the system the
     * un-injected clone had taken them out of. capFixtureFR lands at (161,157,145) against a
     * clean plate's (192,189,178), i.e. shaded like a part rather than blanked like a hole.
     * =====================================================================================
     */
    float rrwSFit = mix(1.0, smoothstep(0.55, 1.30, rrwSRatio), uRRWSeamFit);

    float rrwSD = min(rrwPanelDist(rrwSUV, rrwSN,       3.0, 0.88),
                      rrwPanelDist(rrwSUV, rrwSN * 2.7, 71.0, 0.10));
    rrwSeamCore     = 1.0 - smoothstep(rrwSW * 0.15, rrwSW,       rrwSD);
    float rrwSShoul = 1.0 - smoothstep(rrwSW,        rrwSW * 4.6, rrwSD);

    /*
     * =====================================================================================
     * 🚨 THE GATE WAS NOT PLACING THE SEAMS, IT WAS CHOPPING THEM INTO DUST. THIS IS THE
     * SINGLE BIGGEST DEFECT ON THE SURFACE AND THE MEASUREMENT IS UNAMBIGUOUS.
     *
     * The critique's finding: our darks arrive as 1-2 px median connected components at
     * 21.9-59.7 components per 1000 dark px, where the art has 10-16 px components at 1.5-7.3.
     * Disjoint at every dark cut and on both poses. Per-component ELONGATION did not separate
     * them (art 1.95-2.32, render 1.74-1.91), which rules out "our lines are the wrong shape"
     * and leaves "our lines are not lines".
     *
     * WHY. The network below draws long continuous grooves. This gate then multiplied them by
     * mix(0.20, 1.0, rrwSGeo), and rrwSGeo was dominated by rrwSNear — screen-space curvature,
     * which on a 10,378-triangle mesh with per-vertex normals is very nearly PIECEWISE CONSTANT
     * PER TRIANGLE. So the gate is a triangle mosaic laid over a continuous line field, and the
     * part of the line that survives to read as dark is (line AND high-gate) — a row of
     * disconnected specks where the line crosses a triangle whose curvature happened to spike.
     * The line was drawn full length and then eaten.
     *
     * THE CONTROL, RUN BEFORE THE FIX AND WATCHED TO PASS. '?rseamfloor=1&occ=0' opens the gate
     * flat, changing nothing else — same network, same width, same depth. Alert pose, cut 90:
     *
     *                              nDark   nComp  comp/1k  top10% of dark  wElong  biggest/H
     *   gate as shipped (floor .20) 10546     489     46.4          54.4%    1.78       1.14
     *   gate opened flat (floor 1)  37536     447     11.9          86.9%    2.48      20.76
     *   ART                         21096      72      3.4          85.9%    1.95       4.38
     *
     * Opening the gate quadrupled the darks while REDUCING the component count, took
     * concentration from 54% to 87% against the art's 86%, and took the largest channel from
     * 1.1 to 20.8 figure-heights. Nothing about the network changed. It was the gate.
     *
     * THE FIX IS NOT "OPEN THE GATE" — flat is the crazed-glaze failure the re-unwrap was done
     * to escape. It is that THE FLOOR MUST SIT ABOVE THE VALUE AT WHICH A GROOVE READS AS DARK,
     * so the gate modulates a channel's DEPTH instead of deciding its EXISTENCE. The groove
     * multiplies albedo by (1 - 0.62g) and radiance by (1 - 0.50g), so against a 190-level shell:
     *
     *   g = 0.20 -> 150     g = 0.50 -> 98     g = 0.62 -> 81     g = 1.00 -> 36
     *
     * At the old 0.20 floor a groove off structure sat at 150 and was not a dark pixel at all;
     * only the gate spikes crossed 90, and those spikes are the speckle. At 0.62 the whole
     * channel is below the cut and the gate's remaining 0.62->1.0 travel makes creases DEEPER
     * rather than making flats BLANK. That is why the fix is a floor and not a strength.
     *
     * The line count comes down to pay for it (see 'rseamplate' in 'shellWhite'): fewer, wider,
     * longer, which is what the critique asked for and what a 0.62 floor can afford.
     *
     * uRRWSeamCurv keeps a quarter of the curvature term so genuine joints still deepen. It is
     * a quarter and not zero because at zero the gate is rrwCav alone and the AO buffer cannot
     * see a rolled edge on a convex part. '?rseamcurv=1' is the exact revert of this half and
     * puts the dashing back — it is the control for the paragraph above.
     * =====================================================================================
     */
    float rrwSNear = smoothstep(-1.0, -9.0, rrwCurv) * 1.00    // near a concavity
                   + smoothstep( 2.0, 13.0, rrwCurv) * 0.70;   // near a rim or a small part
    float rrwSGeo = clamp(rrwCav * 1.15 + rrwSNear * uRRWSeamCurv, 0.0, 1.0);
    // ...and the panel network all but stops at the neck. The art's skull is ONE pressing with a
    // bezel ring set into it — no plate lines anywhere on it — and with the 0.62 floor above the
    // head was picking up more line per square centimetre than any other region, because it is
    // the smallest part on the body and the plate size is fixed in METRES.
    // ...and rrwSFit is applied HERE, on the gate, rather than on the network. The gate is the
    // one quantity both halves of the feature pass through — the albedo groove, the roughness
    // and the occlusion term all multiply by it — so a part below one plate loses the whole
    // feature at one seam instead of three, and nothing downstream can reintroduce it.
    rrwSeamGate = mix(uRRWSeamFlr, 1.0, rrwSGeo) * uRRWSeam * (1.0 - rrwHeadClean * 0.88) * rrwSFit;

    /*
     * DEPTH IS NOW SEPARATE FROM PLACEMENT, AND IT HAS TO BE. The gate floor above decides
     * whether a channel EXISTS as a dark pixel; this decides how dark it gets where it does.
     * They were one number, so the only way to make the channels continuous was to make them
     * black — which is the '?rseamfloor=1' control's look: a figure wrapped in electrical tape,
     * measuring beautifully on every structural column and unshippable. Splitting them is what
     * lets the floor go high (continuous channels, few components) while the groove stays a
     * groove.
     */
    diffuseColor.rgb *= 1.0 - (rrwSeamCore * 0.62 + rrwSShoul * 0.13) * rrwSeamGate * uRRWSeamDeep;
    // the groove has lost its polish, same as the baked version did
    roughnessFactor = mix(roughnessFactor, 0.88, rrwSeamCore * rrwSeamGate);

    /*
     * ...AND THE GROOVE IS OCCLUSION AS WELL AS PIGMENT, which is the other half of what the
     * bake used to deliver and the reason an albedo multiply alone came up short. The baked
     * network wrote an AO map (0.60 of core) and a normal map (a 0.45 height cut) as well as
     * darkening the albedo, and on a near-white dielectric under studio light most of a
     * texel's value is SPECULAR AND AMBIENT, neither of which an albedo multiply touches.
     * Measured ungated (?rseamfloor=1), albedo alone reached whole dark<90 7.8% against the
     * flat bake's 10.3-12.0% — the network was drawn but it was not deep.
     *
     * So the groove also multiplies the finished radiance, which is what an occlusion IS.
     * That is applied at the top of <opaque_fragment> where outgoingLight exists; this only
     * computes the amount. It is cheap in facet energy for the same reason the cavity term
     * is: it darkens a texel the light was already leaving, rather than adding a new edge.
     *
     * ⚠️ THE SECOND TERM IS OFF BY DEFAULT AND THE REASON IS THE MOST USEFUL THING THIS ROUND
     * FOUND. The idea was sound and general: deepening the LINE buys darks and facet energy in
     * lockstep, because a line IS facet energy, whereas a BROAD shade of everything near
     * structure should be free in a second-difference metric. rrwSGeo is already that field,
     * so it darkens directly.
     *
     * It is not free, on this mesh. The generated player is 10,378 triangles with per-vertex
     * normals, so screen-space curvature — the derivative of an interpolated normal — is very
     * nearly PIECEWISE CONSTANT PER TRIANGLE. Darkening by it does not shade the form, it
     * paints the tessellation. At 0.35 the capture shows the pelvis and thighs as a visible
     * polygon mosaic and facet energy read 17.9-18.7, which is the number this round exists to
     * fix, arrived at from the other direction. A blur, or a curvature taken from a smoothed
     * normal, would be the real fix and neither is available to a single fragment.
     *
     * uRRWSeamNear stays as the control for that, and as the switch to flip if this ever runs
     * on a mesh dense enough for curvature to be smooth.
     */
    rrwSeamOcc = clamp((rrwSeamCore * 0.50 + rrwSShoul * 0.34) * rrwSeamGate * uRRWSeamOcc * uRRWSeamDeep
                     + rrwSGeo * uRRWSeamNear * uRRWSeam,
                       0.0, 0.95);
  }
#endif

  // APPLY — VALUE AND PLACEMENT, NOT HUE. uRRWDirt is near-neutral, and scouring lifts a
  // texel back toward the shell's OWN clean tint rather than toward a colour, so nothing here
  // depends on chroma surviving the grade.
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uRRWDirt, rrwWet);
  // ...and the lift is capped at that tint, so a texel that was never dirty cannot brighten.
  vec3 rrwLifted = min(diffuseColor.rgb * uRRWLift, uRRWClean);
  diffuseColor.rgb = mix(diffuseColor.rgb, max(diffuseColor.rgb, rrwLifted), rrwScour);

  roughnessFactor = mix(roughnessFactor, 0.95, rrwWet * 0.85);
  roughnessFactor = mix(roughnessFactor, uRRWCleanR, rrwScour * 0.75);
  // soot is a DIELECTRIC: it does not darken a reflection, it stops the surface being a metal
  metalnessFactor = mix(metalnessFactor, 0.04, rrwWet * 0.85 * uRRWMetal);
}

/*
 * THE STRUCTURAL MATERIAL FAMILIES. Applied AFTER the weathering block, and outside it, because
 * they are not weathering: they are different PARTS, and they have to survive uRRWOn going to
 * zero.
 *
 * The edge is a smoothstep on the bone WEIGHT, not on any spatial quantity. Skin weight hands
 * over across the joint, so the boundary lands inside the elbow, the wrist and the collar —
 * where a real part boundary is — and it is animation-invariant, so the seam does not crawl
 * when the arm swings. uRRWDarkEdge defaults tight (0.40/0.60) because the art's edge measures
 * 0.46-0.57% of figure height, which is a hard material join rather than a graded one.
 *
 * Each family is a MATERIAL swap and not a multiply-by-grey. The art's structural parts are
 * satin metal, and metalness is the reason they still carry a bright specular run down the limb
 * instead of reading as a white plastic that someone has shaded. Darkening the albedo alone was
 * tried in round 1 and gives the "electrical tape" look this work was explicitly warned about.
 */
float rrwChromeM = smoothstep(uRRWDarkEdge.x, uRRWDarkEdge.y, vRRWFam.x) * uRRWDark;
float rrwDarkM   = smoothstep(uRRWDarkEdge.x, uRRWDarkEdge.y, vRRWFam.y) * uRRWDark;
float rrwRubberM = smoothstep(uRRWDarkEdge.x, uRRWDarkEdge.y, vRRWFam.z) * uRRWDark;
float rrwThighSeam = 0.0;

/*
 * THE CHROME JOINT CAPS — 'player-material-spec.md', twice, in the same words:
 *   "Elbow: above, below, back, front and side are chrome."
 *   "Knee: above, below, back, front and side are chrome."
 *
 * FIVE DIRECTIONS IS THE SPEC SAYING "ALL OF THEM". It is the one item on the list that is
 * explicitly NOT a facing test — unlike the inner thigh, unlike the sole, unlike the teal cap.
 * So it is a RADIUS about the joint and nothing else, which is exactly the quantity aBoneEnd
 * already carries for the creases.
 *
 * ⚠️ WHY IT IS max() AND NOT AN ADD. A fragment can be inside a cap AND already chrome — the
 * whole upper arm is, so the elbow cap overlaps it for its entire proximal half. Adding would
 * push the mask past 1 and the smoothstep edge would move; max() leaves the upper arm bit-for-bit
 * unchanged and only extends chrome DOWN onto the forearm, which is the half the spec is adding.
 *
 * ⚠️ AND IT IS DELIBERATELY UNDER THE CREASE. The crease is applied at the very end of this
 * block, over every family, so the dark ring at the elbow sits IN the chrome cap rather than
 * beside it. That is the art's own arrangement: a chrome assembly with a recess round its
 * actuator, not two adjacent materials.
 *
 * '?dljoint=0' is the exact revert of the caps and leaves the creases alone.
 */
if (uRRWJoint > 0.0001 && vRRWRing.w > 0.0001) {
  float rrwCap = (1.0 - smoothstep(uRRWJointW.x, uRRWJointW.y, vRRWRing.z))
               * vRRWRing.w * uRRWJoint * uRRWDark;
  rrwChromeM = max(rrwChromeM, rrwCap);
}

/*
 * THE CHROME CALF PANEL — 'player-material-spec.md': "A chrome panel on the back of the calf,
 * closer to the Achilles tendon."
 *
 * Position comes from the vertex stage (a window in the lower half of the shin); FACING is done
 * here, per pixel, because a panel's edge has to follow the silhouette of the limb rather than
 * the mesh's triangles. That split is the same one the crease uses and for the same reason.
 *
 * ⚠️ THE SIGN OF uRRWCalf IS A CONTROL, NOT A KNOB, and it is the only way to know the forward
 * axis is oriented at all. "Chrome on the back of the calf" and "chrome on the shin" both render
 * as a plausible two-tone leg and score identically on any dark fraction or seam count.
 * '?dlcalf=-1' puts it on the SHIN — the picture of the axis being backwards. (NO BACKTICKS IN
 * HERE — this comment is inside a GLSL template literal.)
 *
 * FAIL-SAFE: an underived forward axis is (0,0,0), which makes the dot zero, which the smoothstep
 * sends to zero. No axis, no panel — never a panel on a guessed side.
 */
/*
 * rrwVentPan is the head panel's GEOMETRIC membership — window times facing, before any master —
 * and it is hoisted out here because the slots downstream have to be gated on the panel they sit
 * in, not on the head weight. rrwVentM is the same thing with the masters applied, i.e. the chrome
 * this panel would contribute. Both are zero on the calf, on every unskinned caller, and on any
 * rig where uRRWVent is 0.
 */
float rrwVentPan = 0.0, rrwVentM = 0.0;
if (abs(vRRWDet2.x) > 0.0001) {
  // positive = the calf panel, negative = the head's ventilation panel. See the vertex block.
  float rrwPanMst = vRRWDet2.x > 0.0 ? uRRWCalf : uRRWVent;
  if (abs(rrwPanMst) > 0.0001) {
    vec3 rrwNC = inverseTransformDirection(nonPerturbedNormal, viewMatrix);
    float rrwBack = -dot(rrwNC, uRRWFwdAxis) * sign(rrwPanMst);
    float rrwPanM = abs(vRRWDet2.x)
      * smoothstep(uRRWCalfB.x, uRRWCalfB.y, rrwBack) * uRRWDark * abs(rrwPanMst);
    if (vRRWDet2.x < 0.0) {
      // The upper edge, in head skin weight rather than in t — see uRRWVentH. mix() past
      // uRRWVentKeep so that at 0 this factor is exactly 1 and the old path is untouched.
      float rrwVentTop = mix(1.0, 1.0 - smoothstep(uRRWVentH.x, uRRWVentH.y, vRRWHead), uRRWVentKeep);
      rrwVentPan = abs(vRRWDet2.x) * smoothstep(uRRWCalfB.x, uRRWCalfB.y, rrwBack) * rrwVentTop;
      rrwVentM = rrwPanM * rrwVentTop;
      // THE EXACT REVERT. At uRRWVentKeep 0 the head panel folds in HERE, before the head mask,
      // which is the old line character for character; at 1 it is held back and re-added after it.
      rrwChromeM = max(rrwChromeM, rrwVentM * (1.0 - uRRWVentKeep));
    } else {
      rrwChromeM = max(rrwChromeM, rrwPanM);
    }
  }
}

/*
 * THE TWO CHROME WRIST RINGS — see the uniform block for why they are bands rather than parts.
 *
 * Two bands about ONE distance quantity, so the pair costs the same as one and cannot drift
 * apart: both are measured from the wrist joint, which is a bone END and therefore the same point
 * whether the fragment belongs to the forearm or to the hand.
 *
 * ⚠️ THE SPEC PUTS THESE ON A WHITE FOREARM AND A WHITE HAND, so they are the one chrome feature
 * on this character with white on BOTH sides. That makes their width the whole game: too wide and
 * the wrist reads as a chrome cuff, which is the shoulder's material, not the wrist's.
 */
if (uRRWWrist > 0.0001 && vRRWDet2.w > -900.0 && vRRWDet2.w < 900.0) {
  float rrwW1 = 1.0 - smoothstep(0.0, max(uRRWWristW, 1e-4), abs(vRRWDet2.w - uRRWWristAt.x));
  float rrwW2 = 1.0 - smoothstep(0.0, max(uRRWWristW, 1e-4), abs(vRRWDet2.w - uRRWWristAt.y));
  rrwChromeM = max(rrwChromeM, max(rrwW1, rrwW2) * uRRWWrist * uRRWDark);
}

/*
 * THE SOLE IS A FACING TEST, NOT A REGION — 'player-material-spec.md', corrected 2026-08-16:
 * "Dark grey rubber on the PLANTA — the sole — only. Not the whole boot." The first build put
 * rubber on the whole foot BONE and the same document measures the art's feet as the BRIGHTEST
 * region on the figure (1.222 of the chest), so a bone-wide band is not merely coarse here, it
 * inverts the brief on the most-visible plate on the leg.
 *
 * The sole is the surface whose normal points at the floor, so this is a DIRECTION test and
 * therefore reachable without aBoneLocal — the same finding that made the inner thigh reachable.
 * It is taken against the BODY's own up rather than world up so a leaning or turning character
 * keeps its soles; uRRWUpAxis falls back to (0,1,0) in JS, which is the standing answer, so
 * there is no case in which this fails open and rubbers the whole boot again.
 *
 * ⚠️ WHAT THIS DOES NOT SOLVE, stated rather than hidden: in a pose where the foot pitches hard
 * (toe-off in a run) the sole turns to face BACKWARD and part of it leaves the band. A foot-bone
 * local frame would fix it; that is the aBoneLocal round. At the Alert pose this ships against,
 * and through the whole walk cycle's stance phase, the sole faces down.
 *
 * '?dlsole=0' is the exact revert to the whole-boot rubber.
 */
if (rrwRubberM > 0.0001 && uRRWSole > 0.0001) {
  vec3 rrwNS = inverseTransformDirection(nonPerturbedNormal, viewMatrix);
  float down = -dot(rrwNS, uRRWUpAxis);
  rrwRubberM *= mix(1.0, smoothstep(uRRWSoleBand.x, uRRWSoleBand.y, down), uRRWSole);
}

/*
 * THE INNER THIGH, AND IT IS A FACING TEST RATHER THAN A REGION.
 *
 * The spec asks for chrome on the INNER thigh with the outer thigh left as a white plate, so a
 * bone-wide band is the wrong answer — it would chrome the whole leg. What separates the two is
 * which way the surface FACES, and the world normal is already reconstructible here.
 *
 * uRRWLeftAxis is the body's own left direction, taken per draw from LeftUpLeg - RightUpLeg, so
 * it rotates with the character rather than being a fixed world direction. vRRWFam.w carries
 * the limb's side in its SIGN, so one expression serves both legs: on the left leg the inboard
 * face points along -axis, on the right leg along +axis.
 *
 * FAIL-SAFE: an unresolved axis is (0,0,0), which makes g zero, which the smoothstep sends to
 * zero — the thighs stay white rather than guessing a side. '?dlinner=0' is that revert by hand.
 *
 * ⚠️ THE CONTROL IS uRRWInner NEGATIVE, and it is a control rather than a knob: the SIGN flips
 * the facing test so the chrome lands on the OUTER thigh. "Inner thigh is chrome" and "outer
 * thigh is chrome" both render as a plausible two-tone leg and score identically on any dark
 * fraction, so the only way to know the test is oriented at all is to have watched the wrong
 * orientation appear. '?dlinner=-1' is that picture.
 * (NO BACKTICKS IN HERE — this comment is inside a GLSL template literal.)
 */
if (abs(uRRWInner) > 0.0001 && abs(vRRWFam.w) > 0.0001) {
  vec3 rrwNW = inverseTransformDirection(nonPerturbedNormal, viewMatrix);
  float g = -dot(rrwNW, uRRWLeftAxis) * sign(vRRWFam.w) * sign(uRRWInner);
  float inner = smoothstep(uRRWDarkEdge.x, uRRWDarkEdge.y, abs(vRRWFam.w))
              * smoothstep(uRRWInnerBand.x, uRRWInnerBand.y, g) * uRRWDark * abs(uRRWInner);
  rrwChromeM = max(rrwChromeM, inner);
}

/*
 * THE SEAM BETWEEN THE TWO THIGH PANELS. 'player-material-spec.md', corrected 2026-08-16:
 * "inner thigh and outer thigh are definitely different panels, seam runs exactly down the middle
 * at the front and back."
 *
 * ⚠️ THIS IS THE FEATURE A VALUE PROBE CANNOT SEE, AND THAT IS WHY IT IS HERE. A builder measured
 * the art's inner and outer thigh at 0.911 and 0.907 of the chest and filed the spec as
 * contradicting the art. Two panels of similar VALUE separated by a SEAM produce exactly those
 * two medians — the seam is a handful of pixels and does not move a median at all. The panels are
 * not the evidence; the join is.
 *
 * IT IS THE ZERO CROSSING OF THE TEST ABOVE, which is what makes it free. dot(normal, leftAxis)
 * is +1 on the outboard face and -1 on the inboard one, so it passes through zero exactly where
 * the two panels meet — and it does so TWICE round the limb, at the front centreline and at the
 * back one, which is what the spec asks for and what no single band on a position could give.
 *
 * A SIGNED test would put the seam on one side only. abs() is load-bearing.
 *
 * Its own master, deliberately not shared with uRRWInner: the join between two panels exists
 * whether or not the inboard one is chrome, so '?dlinner=0' must not delete it. '?dltseam=0' is
 * this feature's own exact revert.
 */
if (uRRWTSeam > 0.0001 && abs(vRRWFam.w) > 0.0001) {
  vec3 rrwNT = inverseTransformDirection(nonPerturbedNormal, viewMatrix);
  float across = abs(dot(rrwNT, uRRWLeftAxis));
  rrwThighSeam = (1.0 - smoothstep(0.0, max(uRRWTSeamW, 1e-4), across))
               * smoothstep(uRRWDarkEdge.x, uRRWDarkEdge.y, abs(vRRWFam.w)) * uRRWTSeam;
}

// The head wins wherever it overlaps anything: the neck is dark, the jaw is not, and the head
// mask is the settled one of the set.
float rrwNotHead = 1.0 - rrwHeadClean;
rrwChromeM *= rrwNotHead;
rrwDarkM   *= rrwNotHead;
rrwRubberM *= rrwNotHead;
// ...and the head's OWN panel comes back over the top of that mask. See uRRWVentKeep's block: the
// mask is there to keep the neck's chrome and the body's dirt off the skull, not to delete the one
// feature the spec puts on it. At uRRWVentKeep 0 this term is zero and the line above is the whole
// story, which is the exact revert.
rrwChromeM = max(rrwChromeM, rrwVentM * uRRWVentKeep);
// Families are mutually exclusive per BONE, so the only place two can overlap is the blend zone
// between two differently-assigned bones (the ankle, the shoulder). Giving dark and rubber
// precedence there makes the order explicit instead of leaving it to whichever mix runs last.
rrwChromeM *= 1.0 - max(rrwDarkM, rrwRubberM);

if (rrwDarkM > 0.0001) {
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uRRWDarkAlb, rrwDarkM);
  roughnessFactor  = mix(roughnessFactor, uRRWDarkRough, rrwDarkM);
  metalnessFactor  = mix(metalnessFactor, uRRWDarkMetal, rrwDarkM);
}
if (rrwRubberM > 0.0001) {
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uRRWRubAlb, rrwRubberM);
  roughnessFactor  = mix(roughnessFactor, uRRWRubRough, rrwRubberM);
  metalnessFactor  = mix(metalnessFactor, uRRWRubMetal, rrwRubberM);
}
if (rrwChromeM > 0.0001) {
  // ABSOLUTE, not a multiply — see the uniform's declaration.
  diffuseColor.rgb = mix(diffuseColor.rgb, uRRWChrTint, rrwChromeM);
  roughnessFactor  = mix(roughnessFactor, uRRWChrRough, rrwChromeM);
  metalnessFactor  = mix(metalnessFactor, uRRWChrMetal, rrwChromeM);

  /*
   * =======================================================================================
   * TURNED MACHINING, DRAWN HERE BECAUSE THE MASKED REGION IS WEARING THE WRONG TILE.
   *
   * THE DEFECT. 'shellWhite()' bakes SHELL_SURFACE — mould flow and micro orange peel, a
   * near-flat finish by design, because this file's rule for the plates is RESTRAINT. The
   * family masks then drive some of those fragments to metalness 1 and a chrome tint, but
   * the ALBEDO, ROUGHNESS and NORMAL MAPS under them are still the shell's. CHROME_SURFACE's
   * turned lines, its 0.13 roughness swing and its height field are in a different baked tile
   * that this mesh never samples: the player's body is ONE primitive with ONE material, so
   * there is no second map set to reach. A masked chrome region therefore has a metal's
   * REFLECTANCE and a moulded plastic's MICRO-SURFACE, which is the "slightly-grey white, not
   * metal" read.
   *
   * So the machining is drawn per pixel, the same way and for the same reason the panel
   * network is: it is a property of a REGION the baked tile cannot know about.
   *
   * ⚠️ IT IS DRAWN AT A PITCH THAT CAN SURVIVE THE CAPTURE, AND THAT IS NOT THE PITCH OF REAL
   * LATHE MARKS. The figure is about 880 px tall for a 1.7 m character — 518 px per metre, so
   * one pixel is 1.9 mm and a sub-millimetre turning mark is invisible at any amplitude. What
   * IS at this scale is a fine circumferential RIBBING, which is what the sheet's structural
   * metal actually shows on the upper arm and the waist girdle. uRRWChrPitch is in METRES of
   * surface, converted per fragment through metres-per-uv exactly as uRRWSeamPlate is, so the
   * pitch means the same thing on the player's atlas and on any other mesh.
   *
   * ANTIALIASING. The band-limit is not optional here: a pattern whose period falls under a
   * pixel is a flicker generator on a walking figure, and this one perturbs the NORMAL, which
   * is the most visible thing to alias. The amplitude fades out below ~3 screen pixels of
   * period and is gone by 1.6, so the lines dissolve into the base surface at distance instead
   * of sparkling.
   *
   * THE GRADIENT IS ANALYTIC, NOT dFdx(height). A triangle wave built on fract() has a
   * discontinuity at every wrap, and a screen derivative across it returns a spike the width of
   * one pixel — a bright dotted line down the middle of every groove. The wave's slope is
   * +/-2 per unit of phase and is known in closed form, so the chain rule through duv/dscreen
   * gives the true surface gradient with no discontinuity at all.
   *
   * WHY THE NORMAL AND NOT JUST THE ROUGHNESS. On a metal there is no diffuse term: the pixel
   * is the environment sampled along the mirror direction. Tilting the normal by a few degrees
   * moves that sample by twice as much and lands it somewhere genuinely different, which is
   * what produces a bright line beside a dark one — the sheet's own signature for this
   * material. Roughness only chooses a mip of an already-prefiltered probe (see the dead-lever
   * note on uRRWChrRough), so it can soften the lines but it cannot create them.
   *
   * '?dlcturn=0' is the exact revert of this whole block.
   * =======================================================================================
   */
#ifdef USE_MAP
  if (uRRWChrTurn > 0.0001) {
    vec2 rrwCUV = vMapUv;
    vec2 rrwCDx = dFdx(rrwCUV), rrwCDy = dFdy(rrwCUV);
    float rrwCDuv = length(rrwCDx) + length(rrwCDy);
    // view-space surface position, for both the metre conversion and the tangent frame
    vec3 rrwCVP = -vViewPosition;
    vec3 rrwCVx = dFdx(rrwCVP), rrwCVy = dFdy(rrwCVP);
    // metres of surface per uv unit at this fragment — same construction as the seam network
    float rrwCMpU = (length(rrwCVx) + length(rrwCVy)) / max(rrwCDuv, 1e-7);
    // lines per uv unit that delivers the requested pitch in metres
    float rrwCN = clamp(rrwCMpU / max(uRRWChrPitch, 1e-4), 0.5, 8192.0);
    // ...and the same period measured in SCREEN pixels, which is what decides whether it is
    // drawn at all. rrwCDuv is uv per pixel, so its reciprocal over rrwCN is pixels per line.
    float rrwCPer = 1.0 / max(rrwCDuv * rrwCN, 1e-7);
    float rrwCAA = smoothstep(1.6, 3.2, rrwCPer);
    float rrwCAmp = uRRWChrTurn * rrwChromeM * rrwCAA;

    if (rrwCAmp > 0.0001) {
      // Anisotropic on purpose: turning marks run AROUND a part, not along it. The direction is
      // the chart's own v axis — this atlas is a cube projection, so it is body-aligned within a
      // chart and changes between charts, which reads as differently-machined parts rather than
      // as one wrapped pattern. A world-space direction is not available: the surface of a
      // SKINNED mesh moves through world space every frame and the lines would swim.
      float rrwCP1 = rrwCUV.y * rrwCN;
      float rrwCP2 = rrwCUV.y * rrwCN * 2.63 + rrwCUV.x * 0.37;
      // triangle waves in -0.5..0.5, and their exact slopes
      float rrwCF1 = fract(rrwCP1), rrwCF2 = fract(rrwCP2);
      float rrwCW1 = abs(rrwCF1 - 0.5) * 2.0 - 0.5;
      float rrwCW2 = abs(rrwCF2 - 0.5) * 2.0 - 0.5;
      float rrwCS1 = rrwCF1 > 0.5 ? 2.0 : -2.0;
      float rrwCS2 = rrwCF2 > 0.5 ? 2.0 : -2.0;
      float rrwCH = rrwCW1 * 0.74 + rrwCW2 * 0.26;

      // d(height) / d(uv), in metres of height per uv unit
      vec2 rrwCG = uRRWChrDepth * (
          vec2(0.0, rrwCS1 * rrwCN) * 0.74
        + vec2(rrwCS2 * 0.37, rrwCS2 * rrwCN * 2.63) * 0.26);
      // ...through to metres of height per SCREEN pixel
      float rrwCHx = dot(rrwCG, rrwCDx) * rrwCAmp;
      float rrwCHy = dot(rrwCG, rrwCDy) * rrwCAmp;

      /*
       * Surface-gradient perturbation (Mikkelsen). It needs no tangent attribute — the frame is
       * rebuilt from the screen derivatives of the view-space position, which is the same thing
       * three's own bump-map path does. Working in metres throughout makes the ratio below a
       * true physical slope: uRRWChrDepth over uRRWChrPitch is the tangent of the flank angle.
       */
      vec3 rrwCNv = normalize(normal);
      vec3 rrwCR1 = cross(rrwCVy, rrwCNv);
      vec3 rrwCR2 = cross(rrwCNv, rrwCVx);
      float rrwCDet = dot(rrwCVx, rrwCR1);
      vec3 rrwCGrad = sign(rrwCDet) * (rrwCHx * rrwCR1 + rrwCHy * rrwCR2);
      normal = normalize(abs(rrwCDet) * rrwCNv - rrwCGrad);

      // the flanks are polished and the trough is not — a real turned surface is not one
      // roughness, and this is the half CHROME_SURFACE delivers through its own 0.13 swing
      roughnessFactor = clamp(roughnessFactor + rrwCH * uRRWChrRgh * rrwCAmp, 0.02, 1.0);
      // ...and a touch of albedo, which is what CHROME_SURFACE's turn/fine terms do. Small: on a
      // metal the albedo is the reflectance and a big swing here reads as dirt, not as tooling.
      diffuseColor.rgb *= 1.0 + rrwCH * 0.055 * rrwCAmp;
    }
  }
#endif
}

/*
 * THE THIGH SEAM, APPLIED. Placed last so it draws over whichever panel it separates — it is the
 * gap BETWEEN two parts, so it belongs to neither of them. It is pigment and occlusion in the
 * same proportion the panel network uses, and for the same reason: on a near-white dielectric
 * under studio light most of a texel's value is specular and ambient, and an albedo multiply
 * alone leaves a groove that is drawn but not deep.
 */
if (rrwThighSeam > 0.0001) {
  diffuseColor.rgb *= 1.0 - rrwThighSeam * uRRWTSeamD;
  roughnessFactor = mix(roughnessFactor, 0.90, rrwThighSeam);
  rrwSeamOcc = clamp(max(rrwSeamOcc, rrwThighSeam * uRRWTSeamO), 0.0, 0.95);
}

/*
 * THE JOINT CREASES, APPLIED. Last, over every family, because a crease is the GAP BETWEEN two
 * parts and therefore belongs to neither of them — the same argument and the same three-term
 * treatment as the thigh seam above, which is the shape this file has already proven reads as a
 * recess rather than as a grey stripe.
 *
 * ⚠️ THE OCCLUSION TERM IS NOT DECORATION AND THE ALBEDO-ONLY VERSION IS A KNOWN FAILURE. On a
 * near-white dielectric under studio light most of a texel's value is specular and ambient, and
 * on a CHROME region it is ALL of it — a metal has no diffuse term, so multiplying diffuseColor
 * on the upper arm changes almost nothing. rrwSeamOcc multiplies the finished outgoing light in
 * RRW_OPAQUE, which is the only seam at which a crease on a mirror can be made dark.
 * '?dlringo=0' is that control, and it is worth one capture: it leaves the ring drawn on the
 * white plates and nearly deletes it on the chrome.
 *
 * The head is exempted for the same reason every other family is: the neck/jaw handover is the
 * settled mask and the spec puts ventilation there, not a crease.
 */
/*
 * THE WAIST'S FLEXION RIDGES — 'player-material-spec.md': "The back's waist chrome has RIDGES —
 * they exist to allow flexion and extension of the spine." A reason, not a decoration, so they
 * run ACROSS the spine (each ridge horizontal, the stack vertical), which is what a bellows does.
 *
 * The phase is metres along the waist bone, so the pitch is a real distance and the ridges do not
 * stretch when the character bends. Back-facing only, per the spec's own word "back's".
 *
 * ⚠️ THE BAND-LIMIT IS NOT OPTIONAL. A repeating pattern whose period falls under a pixel is a
 * flicker generator on a walking figure. The amplitude fades out below ~3 screen pixels of period
 * and is gone by 1.6, which is the same treatment and the same numbers the turned machining uses.
 * dFdx of the PHASE is the honest measure of that period; a fixed distance falloff is not, because
 * it does not know the camera.
 *
 * '?dlridge=0' is the exact revert; '?dlridgep=' is the pitch in metres.
 */
float rrwRidge = 0.0;
if (uRRWRidge > 0.0001 && vRRWDet2.y > 0.0001) {
  vec3 rrwNR = inverseTransformDirection(nonPerturbedNormal, viewMatrix);
  float rrwRBack = smoothstep(0.15, 0.55, -dot(rrwNR, uRRWFwdAxis));
  // already in CYCLES — the per-bone pitch was divided out in the vertex stage, which is what
  // lets the waist girdle and the head's ventilation share one varying at two different pitches
  float rrwPh = vRRWDet2.z;
  float rrwDPh = length(vec2(dFdx(rrwPh), dFdy(rrwPh)));
  float rrwRAA = smoothstep(1.6, 3.2, 1.0 / max(rrwDPh, 1e-7));
  float rrwTri = abs(fract(rrwPh) - 0.5) * 2.0;   // 0 in the groove, 1 on the crest
  /*
   * ⚠️ THE INTERIOR GATE, AND IT IS THE FIX FOR A DEFECT THAT SHIPPED IN THIS ROUND'S FIRST
   * BUILD — a chaotic MAZE of nested rectangles across the whole upper back, not ribbing.
   *
   * The phase is metres along the waist bone and is only meaningful on vertices the waist bone
   * OWNS. On a triangle straddling the waist/chest handover, the phase interpolates between a
   * real distance and the ZERO carried by the chest vertex, so it sweeps an arbitrary range
   * across that triangle and fract() of it draws a contour map of the interpolation itself. The
   * membership .y is also mid-way there, so it does NOT suppress it — the argument that it would
   * was the mistake, and it is wrong because both quantities fade together instead of the gate
   * leading.
   *
   * smoothstep(0.90, 0.999) draws only where every vertex of the triangle is fully the waist's,
   * so the phase inside it is exact rather than blended. It costs the outermost centimetre of the
   * girdle and buys a pattern that is ribbing.
   *
   * ANY future feature that interpolates a POSITION rather than a DISTANCE-TO-A-FEATURE needs
   * this gate. aBoneEnd was designed to be continuous across a joint precisely so the creases and
   * caps do NOT need it; a raw phase is the case it does not cover.
   */
  /*
   * ⚠️ THE HEAD'S SLOTS ARE GATED ON THE PANEL, THE WAIST'S RIDGES STILL ON THE HEAD MASK.
   *
   * vRRWDet2.y is 1 over the WHOLE head bone, so the stripe membership alone would rib the entire
   * skull. What bounds them is rrwVentPan — the panel's own window-times-facing membership — which
   * is the spec's wording ("chrome panel WITH ventilation") read literally: the slots exist inside
   * the panel or not at all. That is also why they cannot simply be exempted from rrwNotHead.
   *
   * max() rather than a mix: on the waist rrwVentPan is 0 and this is rrwNotHead unchanged; on the
   * head rrwNotHead is ~0.1 and the panel carries them. uRRWVentKeep 0 zeroes the second argument
   * and leaves plain rrwNotHead, which is the exact revert.
   */
  float rrwStripeKeep = max(rrwNotHead, rrwVentPan * uRRWVentKeep);
  rrwRidge = (1.0 - smoothstep(0.18, 0.55, rrwTri))
           * rrwRBack * smoothstep(0.90, 0.999, vRRWDet2.y) * uRRWRidge * rrwRAA * rrwStripeKeep;
}
if (rrwRidge > 0.0001) {
  diffuseColor.rgb *= 1.0 - rrwRidge * uRRWRidgeD;
  roughnessFactor = clamp(mix(roughnessFactor, 0.88, rrwRidge), 0.02, 1.0);
  rrwSeamOcc = clamp(max(rrwSeamOcc, rrwRidge * uRRWRidgeD * 0.80), 0.0, 0.95);
}

float rrwRing = 0.0;
if (uRRWRing > 0.0001 && vRRWRing.y > 0.0001) {
  rrwRing = (1.0 - smoothstep(uRRWRingW.x, uRRWRingW.y, vRRWRing.x))
          * vRRWRing.y * uRRWRing * rrwNotHead;
}
if (rrwRing > 0.0001) {
  diffuseColor.rgb *= 1.0 - rrwRing * uRRWRingD;
  // a recess collects the dust a proud face sheds, and it is never the polished part
  roughnessFactor = clamp(mix(roughnessFactor, 0.92, rrwRing), 0.02, 1.0);
  rrwSeamOcc = clamp(max(rrwSeamOcc, rrwRing * uRRWRingO), 0.0, 0.95);
}
`;

// Runs AFTER <lights_physical_fragment>, which is where material.clearcoat exists.
const RRW_POST = /* glsl */ `
#ifdef USE_CLEARCOAT
  material.clearcoat *= 1.0 - rrwWet * 0.90;
  material.clearcoatRoughness = mix(material.clearcoatRoughness, 0.85, rrwWet * 0.80);
  // The white plates are lacquered; the structural metal and the foot rubber are not. Leaving
  // the clearcoat on under a family mask puts a white plate's gloss highlight on a chrome arm,
  // which reads as the SAME material in shadow — i.e. exactly the one-tone failure this is
  // meant to fix. max() rather than a sum: the coat is removed once, not three times.
  material.clearcoat *= 1.0 - max(rrwDarkM, max(rrwChromeM, rrwRubberM)) * uRRWDarkCoat;
#endif
`;

/*
 * Runs immediately AFTER <lights_fragment_maps>, which is the one seam at which the image-based
 * lighting has been gathered and not yet used.
 *
 * ⚠️ THIS IS THE LINE THAT DECIDES WHETHER CHROME READS AS CHROME OR AS DARK GREY, and it is
 * the defect the last round shipped. `chromeSatin()` — this file's own settled chrome, used for
 * the ear discs and the ankle stacks — runs at envMapIntensity 2.4 with the note "a metal has no
 * diffuse term: it is ONLY what it reflects. At envMapIntensity 1 the limbs read as dark grey
 * against the white shells, which side by side with the art looks like a different character."
 * The player's body is ONE mesh wearing shellWhite(), whose envMapIntensity is 1.0, so a masked
 * region driven to metalness 1 inherits the shell's environment gain and lands at exactly the
 * dark grey that comment describes. Raising envMapIntensity on the material would take the white
 * plates with it; scaling the gathered radiance under the mask is the same operation applied to
 * the fragments that asked for it.
 *
 * Both symbols are declared unconditionally inside their RE_ guards by <lights_fragment_begin>,
 * and both are ZERO on a material with no environment — so on a caller with no envMap this is a
 * multiply against nothing rather than a difference.
 */
/*
 * ⚠️ AND THIS IS THE LINE THAT DECIDES WHETHER IT HAS A DARK CORE — WHICH IS A DIFFERENT
 * QUESTION FROM THE ONE ABOVE, AND THE ONE THE VALUE-SPREAD DEFICIT TURNED OUT TO BE.
 *
 * MEASURED. The art's upper arm (harness/_mat4_artbox.mjs on baseline_front.png) reads
 * p05 57.4, median 120.3, p95 221.3 — spread 163.9. The render at the settled dlcenv 2.0 reads
 * p05 103.8, median 127.5, p95 214.5 — spread 110.7. THE BRIGHT END IS ALREADY RIGHT, within 7
 * levels of the art. The whole 53-level deficit is at the DARK end: our chrome never goes dark.
 *
 * A metal is only what it reflects, so a chrome region with no dark pixels is a statement about
 * the ROOM, not about the material — and `src/views/_studio.js` says so in its own words:
 * "This room had nothing dark in it at any envMapIntensity, which is why chrome and clearcoat
 * both read as a flat bright wash regardless of roughness." That file already solved this once,
 * with near-black flag panels flanking the subject, and measured the result: p05 104 -> 59 and
 * range 137 -> 152 on the arm tube. But it is gated behind `contrast > 0`, and the two callers
 * that pass it are `char.turnaround` and `mat.robot`. THE PLAYER'S OWN VIEW, `mesh.animated`,
 * RUNS THE DEFAULT LOW-CONTRAST ENV — a white box with no dark surface anywhere in it.
 *
 * That also explains the two sweeps that went nowhere and were correctly reported as dead:
 * roughness cannot resolve detail a prefiltered probe no longer has, and envMapIntensity scales
 * dark and bright TOGETHER, so neither can put a floor under a room that has no floor.
 *
 * Raising `contrast` on that view is the physically honest fix and it is NOT what ships here:
 * it darkens the room 0.72 -> 0.20 and the floor 0.62 -> 0.24 for EVERY material in the frame,
 * which moves the white plates John has already signed off. `char.turnaround` had to re-light
 * with a high-contrast key to pay that back. `?meshcontrast=1` on `mesh.animated` is that
 * experiment, kept as the control for this paragraph; the number it produces is in the round's
 * report.
 *
 * So the resolving power is applied to the CHROME MASK ALONE, where it costs nothing else: a
 * contrast curve on the radiance this fragment has already gathered, pivoting at uRRWChrPiv so
 * the bright end (which measures correctly) stays put while the mid and dark ends separate. It
 * is the operation a lower-roughness metal in a higher-contrast room would perform, applied to
 * the fragments that asked for it — the same argument uRRWChrEnv above already makes for level.
 *
 * ⚠️ THE CURVE IS ONE-SIDED, AND THE SYMMETRIC VERSION WAS BUILT AND MEASURED FIRST. THIS IS THE
 * SHAPE OF THE ART'S DISTRIBUTION AND IT IS NOT THE SHAPE A CONTRAST KNOB PRODUCES.
 *
 * The art's upper arm about its own median: p05 is 0.48 of it and p95 is 1.84 of it. The render's
 * are 0.81 and 1.68. So the BRIGHT tail is nearly right already and only the dark one is short —
 * the distribution is ASYMMETRIC. A power curve about a pivot is symmetric in log, i.e. it
 * multiplies both tails by the same exponent, so the exponent that takes 0.81 down to 0.48 (2.2,
 * solved and then confirmed by sweep) simultaneously takes the bright tail past 3.6 and blows the
 * arm out over the chest plate. Measured, at pivot 3 and exponent 1.8: spread 169.3 against the
 * art's 163.9 — the target number, hit — with p95 233.1 against the art's 221.3 and a median 18
 * levels UNDER it. That variant scores and is unshippable, which is this project's most repeated
 * failure and the reason the symmetric version is written down here rather than deleted.
 *
 * So the low side alone is expanded and everything above the pivot is returned untouched. That is
 * not a trick to make a number behave: it is precisely the edit `_studio.js` makes when it goes
 * to high contrast — "bright panels unchanged at any contrast, so exposure does not move", with
 * only the room, the floor and the flags darkening. The curve applies that same one-sided change
 * to the radiance a chrome fragment gathered, on the fragments that asked for it.
 *
 * ⚠️ uRRWChrPiv IS A LEVEL, NOT A STRENGTH, and the two are separable here in a way they are not
 * in the symmetric form: for two radiances both below the pivot the output ratio is the input
 * ratio raised to uRRWChrCon regardless of where the pivot sits, so the exponent owns the SPREAD
 * and the pivot owns how much of the range is affected at all. A build that reads dark overall
 * has the pivot too high, not the exponent.
 *
 * '?dlccon=1' is the exact revert, and it is the control this claim is quoted against.
 */
const RRW_MAPS = /* glsl */ `
#if defined( RE_IndirectSpecular )
  radiance *= mix(1.0, uRRWChrEnv, rrwChromeM);
  if (rrwChromeM > 0.0001 && uRRWChrCon > 1.0001) {
    float rrwCPiv = max(uRRWChrPiv, 1e-4);
    vec3 rrwCE = max(radiance, vec3(0.0)) / rrwCPiv;
    // min() is what makes it one-sided; the residual above the pivot is added back unchanged, so
    // the curve is continuous at the pivot and the identity everywhere above it.
    vec3 rrwCD = rrwCPiv * pow(min(rrwCE, vec3(1.0)), vec3(uRRWChrCon))
               + max(radiance - rrwCPiv, vec3(0.0));
    radiance = mix(radiance, rrwCD, rrwChromeM);
  }
  /*
   * =========================================================================================
   * THE CHROME LUMINANCE FLOOR — the fix for "the player reads as a pale bust with no legs".
   *
   * THE DEFECT, in the game and not in the studio. Every chrome region on this character is
   * driven to metalness 1 twenty lines up. A metal has NO DIFFUSE ALBEDO: it can only ever be
   * as bright as what it reflects. On 'mesh.animated' the cyc is near-white, chrome mirrors
   * white and reads bright silver; in the estate's dark rooms it mirrors near-black and IS
   * black. That single fact is why the studio verdict and the in-game verdict disagree about
   * the same material, and it applies to every chrome region here, not just the new ones.
   *
   * ⚠️ AND THE CURVE ABOVE IS THE AMPLIFIER, WHICH IS THE HALF THAT IS NOT OBVIOUS. uRRWChrPiv
   * is an ABSOLUTE radiance level (its own block says so, in bold) and it was solved on the
   * studio cyc, where a chrome fragment gathers radiance of order the pivot. In the estate it
   * gathers roughly a tenth of that, and the curve is a FOURTH power of the ratio, so what is
   * a near-identity in the studio is a two-to-three ORDER OF MAGNITUDE annihilation in the
   * game. Worked at the shipped uRRWChrCon 4 / uRRWChrPiv 1.6:
   *
   *     radiance in     3.0      1.6      0.5        0.2
   *     curve out       3.0      1.6      0.0153     0.00039
   *     ratio           1.00     1.00     1/33       1/512
   *
   * A knob that behaves as the identity where it was tuned and as a delete where it ships is
   * the same class of defect as a gate that never fires, and it is why the legs were measured
   * losing 82% of their contrast against the floor while head, chest and thigh — which are
   * white shell, not chrome — moved by at most 1.2 levels.
   *
   * WHY A FLOOR AND NOT A SMALLER EXPONENT. The exponent is the art direction: it is what
   * stops chrome reading as flat dark grey against the sheet, and it is measured onto the art
   * on four angles. Lowering it spends the fix on undoing a thing John asked for. A floor
   * leaves the curve exactly as tuned everywhere it was tuned and only refuses to follow it
   * below a level at which nothing can be seen at all.
   *
   * WHY max() AND NOT AN ADD, WHICH IS THE WHOLE REASON THE STUDIO SURVIVES. An add lifts
   * every value including the bright ones and flattens the spread the art bar is measured on.
   * A max() is the IDENTITY everywhere the surface is already brighter than the floor, so it
   * cannot move a value it is not rescuing: with the floor set below the studio's own darkest
   * curved chrome it is provably a no-op on all four studio angles, and in the estate — where
   * the curve has put the whole region three orders below that — it is the only thing there.
   * That asymmetry is the feature, not a compromise.
   *
   * AT THE CHROME'S OWN TINT, and that is 'mintCap()'s argument transplanted. It hit the same
   * failure — a domed cap turning away from the key, losing its light and therefore its hue —
   * and answered it with an emissive floor at the cap's own tint rather than more environment,
   * because a pixel at luma 20 carries no hue whatever its albedo is. The in-game critic found
   * the same thing from the other end: the teal shoulder accents survived near-black better
   * than any grey value on the model. SATURATED COLOUR SURVIVES DARKNESS THAT VALUE DOES NOT.
   * uRRWChrTint is already the linear chrome colour, so the floor lifts the region toward what
   * chrome IS rather than toward grey.
   *
   * ⚠️ IT IS A FLOOR ON THE REFLECTED RADIANCE, NOT ON THE PIXEL, and that is deliberate: it
   * still goes through the BRDF, so it obeys grazing angle, roughness and Fresnel, and a
   * chrome fragment facing away from the viewer stays darker than one facing it. Flooring
   * outgoingLight instead would paint a flat silhouette-shaped patch with no form in it.
   *
   * '?dlcfloor=0' is the exact revert, and every other caller of this file gets 0 by default.
   * =========================================================================================
   */
  if (rrwChromeM > 0.0001 && uRRWChrFloor > 0.0) {
    radiance = mix(radiance, max(radiance, uRRWChrTint * uRRWChrFloor), rrwChromeM);
  }
#endif
#if defined( RE_IndirectDiffuse )
  iblIrradiance *= mix(1.0, uRRWChrEnv, rrwChromeM);
#endif
`;

/*
 * Runs at the top of <opaque_fragment>, the one seam at which the FINISHED radiance exists.
 *
 * This is where the panel groove's occlusion half lands — see the block in RRW_BODY. It is
 * injected for every weathered family, not only the shell, so all three keep one program
 * source; rrwSeamOcc is 0 wherever uRRWSeam is 0, so on chrome and mint the line is a no-op
 * rather than a difference.
 */
const RRW_OPAQUE = /* glsl */ `
  outgoingLight *= 1.0 - rrwSeamOcc;
`;

/**
 * Replace an include line and PROVE the replacement happened.
 *
 * A `String.replace` that matches nothing returns the input unchanged, throws nothing, and
 * produces a render that merely looks a bit darker — indistinguishable from "it worked and the
 * target is dark". This project has lost more than one round to exactly that, so every patch
 * here is asserted instead of assumed.
 */
function rrwPatch(src, include, before = '', after = '') {
  if (src.indexOf(include) === -1) {
    throw new Error(`weathering: "${include}" not found in the shader — the patch matched ` +
      `NOTHING and would have failed silently. three.js chunk names have changed.`);
  }
  return src.replace(include, `${before}\n${include}\n${after}`);
}

/** sRGB-authored tint -> the LINEAR value it actually renders at. */
function rrwLinear(tint) {
  return new THREE.Color().setRGB(tint[0], tint[1], tint[2], THREE.SRGBColorSpace);
}

/**
 * Install the weathering layer on one baked material.
 *
 * `family` only picks the program cache key; every per-material difference rides in uniforms,
 * so all shells share one compiled program however many grime levels are on screen.
 */
const RRW_FAMILY_ID = { shell: 1, chrome: 2, mint: 3 };

/*
 * FIND THE HEAD BONE WITHOUT ANY VIEW HAVING TO SAY SO.
 *
 * `skinIndex` indexes `skeleton.bones`, which only the object being drawn knows, so the uniform
 * has to be set per draw. `material.onBeforeRender` is exactly that seam — three calls it from
 * `renderBufferDirect` immediately before the draw, with the object in hand — and it keeps this
 * whole feature inside this file. Routing it through the views instead would mean editing
 * `mesh-avatar.js`, `mesh-animated.js` and `game.js` to pass a bone index that only this
 * material cares about, and any view that was missed would fail SILENTLY by rendering the old
 * dirty head.
 *
 * The lookup is cached on the OBJECT, not on the material: one material dresses the player, the
 * procedural robot and the hunters, and they do not share a skeleton. -1 is cached too, so a
 * rig with no head bone costs one search and never searches again.
 *
 * ⚠️ The name test is /head/i and deliberately loose — Meshy, Mixamo and the hand-built rigs
 * disagree about capitalisation and prefixes ('Head', 'mixamorigHead', 'Bip01_Head'). It takes
 * the SHALLOWEST match so that 'HeadTop_End' or a jaw child cannot win over the head itself.
 */
/** Depth of a bone in its own hierarchy. Rig-agnostic; the only ordering these names admit. */
function rrwBoneDepth(b) { let d = 0; for (let p = b; p; p = p.parent) d++; return d; }

/**
 * Bone names are camelCase, snake_case, prefixed and inconsistently capitalised across Meshy,
 * Mixamo and the hand-built rigs, so match against a normalised token string rather than
 * against the raw name: 'LeftForeArm' -> ' left fore arm ', 'mixamorig:LeftArm' ->
 * ' mixamorig left arm ', 'upperarm_l' -> ' upperarm l '.
 */
function rrwTokens(name) {
  return ' ' + String(name || '').replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase().replace(/[^a-z]+/g, ' ').trim() + ' ';
}

/** Channel order of the per-bone family vector. Mirrors the block above RRW_BONE_PARS_VERT. */
export const RRW_FAM = { CHROME: 0, DARK: 1, RUBBER: 2, INNER: 3 };

/**
 * THE REGION CLASSIFIER, AS ONE TABLE, AND IT IS SHARED WITH THE MEASUREMENT PROBE ON PURPOSE.
 *
 * Every predicate here answers "is this bone part of region X" against the normalised token
 * string from rrwTokens(). Two things depend on it: the family assignment below, and the
 * `?famprobe=` selection mask that `harness/_mat4_regions.mjs` uses to decide which PIXELS of a
 * capture are the forearm.
 *
 * ⚠️ THEY MUST BE THE SAME PREDICATE OR THE MEASUREMENT IS NOT A MEASUREMENT OF THE SHADER. A
 * probe with its own idea of where the forearm is would report the value of some other pixels
 * and would agree with the render exactly when both were wrong in the same way. Sharing the
 * table is what makes "the forearm now reads 0.98 of the chest plate" a statement about the
 * thing that shipped.
 *
 * ORDER IS LOAD-BEARING inside `upperarm`: ' left fore arm ' contains ' arm ', so the upper-arm
 * predicate has to exclude the forearm and the hand explicitly rather than relying on being
 * tried second. `harness/_two3_bones.mjs` case 3b is the control for that.
 */
const RRW_REGION = {
  forearm: (t) => / (fore|lower) ?arm|forearm|lowerarm/.test(t),
  hand: (t) => / hand/.test(t),
  upperarm: (t) => !RRW_REGION.forearm(t) && !RRW_REGION.hand(t)
    && (/ (upper ?)?arm /.test(t) || / upperarm/.test(t)),
  neck: (t) => / neck/.test(t) && !/ head/.test(t),
  foot: (t) => / (toe|foot|ankle|ball)/.test(t),
  // NOT the shin: ' left leg ' would match a loose / leg / rule and take the brightest region on
  // the figure with it. Anchoring on the qualifier is what keeps the two apart.
  thigh: (t) => / (up ?leg|upperleg|thigh)/.test(t),
  shin: (t) => !RRW_REGION.thigh(t) && !RRW_REGION.foot(t) && / (leg|shin|calf)/.test(t),
};

/** + on the character's left limb, - on its right, 0 when the bone names neither. */
const rrwSide = (t) => (/ left | l /.test(t) ? 1 : / right | r /.test(t) ? -1 : 0);

/**
 * WHICH MATERIAL FAMILY EACH BONE WEARS — `docs/design/player-material-spec.md` is the authority
 * for every row here, and it OVERRULES the statistics that placed round 1's single dark set.
 *
 *   forearms, hands            WHITE   (round 1 had them dark — the spec calls this the most
 *                                       visible error on the character)
 *   upper arm                  CHROME  front and back
 *   waist                      CHROME  (round 1 had it dark)
 *   inner thigh                CHROME  inboard FACE only — see the INNER channel
 *   feet and toes              RUBBER  "dark grey rubber-like material for wear"
 *   neck                       DARK    unchanged from round 1; the spec's table does not name it
 *
 * ⚠️ THE WAIST IS FOUND BY DEPTH, NOT BY NAME, AND THAT IS STILL THE LOAD-BEARING LINE HERE.
 * The two rigs in this project number their spines in OPPOSITE directions — this one chains
 * Hips -> Spine02 -> Spine01 -> Spine (so bare `Spine` is the CHEST, carrying the neck and both
 * shoulders), while Mixamo chains Hips -> Spine -> Spine1 -> Spine2 (so bare `Spine` is the
 * waist). Matching /spine$/i for "the waist" would therefore have put CHROME ON THE CHEST PLATE
 * of this character — the one surface the brief protects, because the 4Humanity wordmark is on
 * it. The SHALLOWEST spine bone is the one nearest the hips in either convention, and
 * `harness/_two3_bones.mjs` case 3 asserts the naive rule and is expected to FAIL.
 *
 * ⚠️ THE FOREARM TEST MUST BE TRIED BEFORE THE UPPER-ARM TEST and it is not merely tidy: ' left
 * fore arm ' matches / arm / too, so an upper-arm-first chain would paint the forearms chrome —
 * which is the exact material error this round exists to correct, reintroduced by an ordering.
 * The chain is `else if` for that reason and the bone test above asserts the result.
 *
 * The shoulders are deliberately excluded: they carry the mint pauldrons, a separate material
 * built as kit geometry, and taking them with the arms would push chrome under the caps.
 *
 * @param bones    skeleton.bones, or any array of {name, parent}
 * @param opts     per-family masters, so a rig that resolves oddly can be switched off in parts
 * @returns Float32Array(RRW_MAXBONE * 4), ready for a vec4[] uniform
 */
export function rrwFamilyWeights(bones, opts = {}) {
  const waist = opts.waist ?? 1.0;
  const feet = opts.feet ?? 1.0;
  const neck = opts.neck ?? 1.0;
  const inner = opts.inner ?? 1.0;
  const w = new Float32Array(RRW_MAXBONE * 4);
  const set = (i, ch, v) => { if (i >= 0 && i < RRW_MAXBONE) w[i * 4 + ch] = v; };

  // The waist and the chest are the two spine bones this rig can confuse; both are found by
  // DEPTH. Shallowest = nearest the hips = the waist under either numbering convention.
  let spine = -1, spineDepth = Infinity, chest = -1, chestDepth = -Infinity;
  for (let i = 0; i < bones.length; i++) {
    if (!/ spine/.test(rrwTokens(bones[i].name))) continue;
    const d = rrwBoneDepth(bones[i]);
    if (d < spineDepth) { spineDepth = d; spine = i; }
    if (d > chestDepth) { chestDepth = d; chest = i; }
  }

  /*
   * MEASUREMENT MODE. `?famprobe=<region>` throws the whole assignment away and puts exactly one
   * region into a channel, so `?weather=debug5` becomes a clean per-region SELECTION MASK for a
   * capture. It exists because a box drawn on a POSED figure lands on the wrong parts — the
   * lesson `_two2_ratio.mjs` was written for — and because the only trustworthy way to measure
   * "what value does the forearm render at" is to ask the shader which pixels it thinks are the
   * forearm.
   *
   * The thigh probes go into the INNER channel so the FACING test still runs and the mask is the
   * inner face alone; `thighall` bypasses it for the whole-bone region. Nothing here affects a
   * default URL: opts.probe is undefined unless someone asks.
   */
  if (opts.probe) {
    const p = String(opts.probe);
    for (let i = 0; i < bones.length && i < RRW_MAXBONE; i++) {
      const t = rrwTokens(bones[i].name);
      if (p === 'waist') { if (i === spine) set(i, RRW_FAM.CHROME, 1.0); continue; }
      if (p === 'chest') { if (i === chest) set(i, RRW_FAM.CHROME, 1.0); continue; }
      if (p === 'thigh') { if (RRW_REGION.thigh(t)) set(i, RRW_FAM.INNER, rrwSide(t)); continue; }
      if (p === 'thighall') { if (RRW_REGION.thigh(t)) set(i, RRW_FAM.CHROME, 1.0); continue; }
      if (RRW_REGION[p] && RRW_REGION[p](t)) set(i, RRW_FAM.CHROME, 1.0);
    }
    return w;
  }

  for (let i = 0; i < bones.length && i < RRW_MAXBONE; i++) {
    const t = rrwTokens(bones[i].name);
    if (RRW_REGION.forearm(t)) continue;                                  // forearm — WHITE
    else if (RRW_REGION.hand(t)) continue;                                // hand, digits — WHITE
    else if (RRW_REGION.upperarm(t)) set(i, RRW_FAM.CHROME, 1.0);
    else if (RRW_REGION.neck(t)) set(i, RRW_FAM.DARK, neck);
    else if (RRW_REGION.foot(t)) set(i, RRW_FAM.RUBBER, feet);
    // Signed, because the inner-face test needs to know which way inboard is for this limb.
    else if (RRW_REGION.thigh(t)) set(i, RRW_FAM.INNER, inner * rrwSide(t));
  }
  set(spine, RRW_FAM.CHROME, waist);                                      // the waist girdle
  return w;
}

/**
 * Channel order of the per-bone joint-feature vector. Mirrors the block above
 * RRW_BONE_PARS_VERT. PROX/DIST are the dark crease at each end of the bone; CAPP/CAPD are the
 * chrome cap at each end. Two features, four channels, one array.
 */
export const RRW_DET = { PROX: 0, DIST: 1, CAPP: 2, CAPD: 3 };

/**
 * ⚠️ THE ANKLE IS THE FOOT BONE'S PROXIMAL END AND THE BALL OF THE FOOT IS THE TOE'S, AND
 * `RRW_REGION.foot` CANNOT TELL THEM APART — it matches toe/foot/ankle/ball together because the
 * RUBBER family wants all of them. Reused here it would put a second dark ring across the middle
 * of the boot, at the toe joint, which the spec never asks for and which reads as a break in the
 * one plate it calls the brightest on the figure.
 */
const rrwIsFootBone = (t) => / foot/.test(t);

/**
 * WHICH END OF WHICH BONE CARRIES A DARK CREASE — `docs/design/player-material-spec.md` again,
 * and every row below is one of its sentences:
 *
 *   forearm   proximal   "a dark ring around the elbow actuator, in a crease"
 *   upper arm distal     the same ring, seen from above the joint
 *   upper arm proximal   "where the arm detaches at the shoulder: MUCH DARKER in the crease"
 *   thigh     distal     "a dark ring around the knee actuator, in a crease"
 *   thigh     proximal   "where the leg detaches at the hip: MUCH DARKER in the crease"
 *   shin      proximal   the knee ring, seen from below
 *   shin      distal     "a dark ring around the ankle actuator, in a crease"
 *   foot      proximal   the same ankle ring, seen from below
 *
 * ⚠️ EVERY JOINT IS LISTED TWICE, ONCE FROM EACH SIDE, AND THAT IS THE WHOLE POINT rather than
 * redundancy. The surface at the elbow is skinned to BOTH bones; a crease written on the forearm
 * alone would stop dead at the weight handover and read as a half-ring drawn on one part.
 *
 * ⚠️ THE HIP AND SHOULDER CREASES ARE STRONGER THAN THE ACTUATOR RINGS BECAUSE THE SPEC SAYS SO
 * TWICE — "much darker" appears on those two lines and on no others. It is a ratio between two
 * features on one character, so it survives any exposure argument about absolute levels.
 *
 * @param bones  skeleton.bones, or any array of {name}
 * @param opts   per-feature masters, so a rig that resolves oddly can be switched off in parts
 * @returns Float32Array(RRW_MAXBONE * 4), ready for a vec4[] uniform
 */
/*
 * ...and the CHROME CAPS, which ride the same array because they are the same quantity:
 *
 *   forearm   proximal   "Elbow: above, below, back, front and side are chrome"
 *   thigh     distal     "Knee: above, below, back, front and side are chrome"
 *   shin      proximal   the same knee cap, seen from below
 *
 * ⚠️ THE UPPER ARM IS ABSENT FROM THAT LIST AND ITS ABSENCE IS CORRECT, not an oversight. The
 * spec already puts CHROME on the whole upper arm ("Upper arm is CHROME, front and back") and
 * `rrwFamilyWeights` delivers it bone-wide, so the elbow's upper half is chrome before this
 * feature runs. Adding a cap there would be a second mask over an identical region — invisible,
 * and it would make the shipped elbow depend on two rules instead of one. The cap's whole job is
 * to carry chrome DOWN onto the forearm, which the spec calls WHITE everywhere else.
 *
 * ⚠️ NO ANKLE CAP. The spec's ankle line asks for a dark ring and for "chrome actuators SLIGHTLY
 * EXPOSED in the crease" — a proud part, which `player-fine-detail-plan.md` assigns to kit
 * geometry, not a band. A cap here would chrome the top of the boot, which the same document
 * measures as the brightest region on the figure.
 */
export function rrwBoneDetail(bones, opts = {}) {
  const joint = opts.joint ?? 0.75;
  const detach = opts.detach ?? 1.0;
  const cap = opts.cap ?? 1.0;
  const w = new Float32Array(RRW_MAXBONE * 4);
  // max() rather than assign: a bone can be named by two rows and the darker sentence wins.
  const set = (i, ch, v) => {
    if (i >= 0 && i < RRW_MAXBONE) w[i * 4 + ch] = Math.max(w[i * 4 + ch], v);
  };

  for (let i = 0; i < bones.length && i < RRW_MAXBONE; i++) {
    const t = rrwTokens(bones[i].name);
    // Same ordering rule, same reason, as rrwFamilyWeights: ' left fore arm ' matches / arm /,
    // so the forearm has to be taken before the upper arm or the shoulder's detach crease lands
    // on the WRIST. `harness/_fd2-ring.mjs` case 2 is the control for that.
    if (RRW_REGION.forearm(t)) { set(i, RRW_DET.PROX, joint); set(i, RRW_DET.CAPP, cap); }
    else if (RRW_REGION.hand(t)) continue;
    else if (RRW_REGION.upperarm(t)) { set(i, RRW_DET.DIST, joint); set(i, RRW_DET.PROX, detach); }
    else if (RRW_REGION.thigh(t)) {
      set(i, RRW_DET.DIST, joint); set(i, RRW_DET.PROX, detach); set(i, RRW_DET.CAPD, cap);
    } else if (RRW_REGION.shin(t)) {
      set(i, RRW_DET.PROX, joint); set(i, RRW_DET.DIST, joint); set(i, RRW_DET.CAPP, cap);
    } else if (rrwIsFootBone(t)) set(i, RRW_DET.PROX, joint);
  }
  return w;
}

/**
 * Channel order of the per-bone PANEL vector — the features that are not a radius about a joint.
 * PANEL and STRIPE are each shared by two body parts and carry a SIGN or a per-bone pitch to tell
 * them apart; see the uniform's block above RRW_BONE_PARS_VERT.
 */
export const RRW_PAN = { PANEL: 0, STRIPE: 1, PITCH: 2, WRIST: 3 };

/**
 * WHICH BONE CARRIES A PANEL FEATURE. Two entries, both from
 * `docs/design/player-material-spec.md`:
 *
 *   shin    "A chrome panel on the back of the calf, closer to the Achilles tendon."
 *   waist   "The back's waist chrome has RIDGES — they exist to allow flexion and extension."
 *
 * ⚠️ NEITHER IS A JOINT FEATURE, WHICH IS WHY THEY ARE NOT IN `rrwBoneDetail`. A joint feature is
 * a radius about a bone END and is continuous across the two bones that meet there; these two sit
 * in the BELLY of one bone and stop at its edges. Sharing the array would have meant one of the
 * two behaving as the other at the knee.
 *
 * ⚠️ THE WAIST IS FOUND BY DEPTH, NOT BY NAME — the same load-bearing line as `rrwFamilyWeights`,
 * for the same reason. This rig chains Hips -> Spine02 -> Spine01 -> Spine, so a `/spine$/i` rule
 * would put the flexion ridges across the CHEST, over the 4Humanity wordmark. Shallowest spine
 * bone = nearest the hips = the waist under either numbering convention.
 */
export function rrwBonePanels(bones, opts = {}) {
  const calf = opts.calf ?? 1.0;
  const ridge = opts.ridge ?? 1.0;
  const vent = opts.vent ?? 1.0;
  const wrist = opts.wrist ?? 1.0;
  const ridgeP = opts.ridgePitch ?? 0.022;
  const ventP = opts.ventPitch ?? 0.016;
  const w = new Float32Array(RRW_MAXBONE * 4);
  const set = (i, ch, v) => { if (i >= 0 && i < RRW_MAXBONE) w[i * 4 + ch] = v; };

  let spine = -1, spineDepth = Infinity;
  let head = -1, headDepth = Infinity;
  for (let i = 0; i < bones.length; i++) {
    const t = rrwTokens(bones[i].name);
    if (/ spine/.test(t)) {
      const d = rrwBoneDepth(bones[i]);
      if (d < spineDepth) { spineDepth = d; spine = i; }
    }
    // The SHALLOWEST head bone, the same way `boneMaskAutoBind` finds it — this rig also carries
    // `head_end` and `headfront`, and a naive /head/ match picks whichever comes first.
    if (/ head/.test(t)) {
      const d = rrwBoneDepth(bones[i]);
      if (d < headDepth) { headDepth = d; head = i; }
    }
  }
  for (let i = 0; i < bones.length && i < RRW_MAXBONE; i++) {
    const t = rrwTokens(bones[i].name);
    if (RRW_REGION.shin(t)) set(i, RRW_PAN.PANEL, calf);        // + = the calf window
    // The wrist joint is the forearm's DISTAL end and the hand's PROXIMAL one, so the sign says
    // which. Both are named, for the same reason every joint feature names both its bones: the
    // surface there is skinned to the pair and a ring on one of them is a half ring.
    // ⚠️ FINGERS INCLUDED, DELIBERATELY. RRW_REGION.hand matches ' left hand index ' as well as
    // ' left hand ', and that is what is wanted here: a finger bone left at the +1000 sentinel
    // would interpolate UP through both ring positions across the knuckle triangles and draw a
    // chrome band on the fingers. Carrying the negative sign puts every hand-chain fragment
    // safely below the rings instead. See the vertex block for the full argument.
    if (RRW_REGION.forearm(t)) set(i, RRW_PAN.WRIST, wrist);
    else if (RRW_REGION.hand(t)) set(i, RRW_PAN.WRIST, -wrist);
  }
  set(spine, RRW_PAN.STRIPE, ridge);
  set(spine, RRW_PAN.PITCH, ridgeP);
  // NEGATIVE — "back of the head, WHERE IT MEETS THE NECK", i.e. the near end of the head bone,
  // which is the uRRWVentT window rather than the calf's.
  set(head, RRW_PAN.PANEL, -vent);
  set(head, RRW_PAN.STRIPE, vent);
  set(head, RRW_PAN.PITCH, ventP);
  return w;
}

/**
 * THE BODY'S OWN LEFT DIRECTION, IN WORLD SPACE, from the live skeleton.
 *
 * The inner-thigh facing test needs to know which way is inboard, and a fixed world axis is
 * wrong the moment the character turns. Taking it from the two upper-leg bones re-derives it
 * every draw, so it tracks the character; and it is a difference of two positions on the same
 * rig, so it is immune to the model's own orientation convention. Returns null when the rig has
 * no recognisable pair — the caller then leaves the axis at zero and the test stays inert.
 */
function rrwLeftAxis(bones) {
  let l = null, r = null;
  for (const b of bones) {
    const t = rrwTokens(b.name);
    if (!/ (up ?leg|upperleg|thigh)/.test(t)) continue;
    if (/ left | l /.test(t)) l = b; else if (/ right | r /.test(t)) r = b;
  }
  if (!l || !r) return null;
  const a = new THREE.Vector3().setFromMatrixPosition(l.matrixWorld);
  const b = new THREE.Vector3().setFromMatrixPosition(r.matrixWorld);
  const v = a.sub(b);
  return v.lengthSq() > 1e-8 ? v.normalize() : null;
}

/**
 * THE BODY'S OWN UP DIRECTION, IN WORLD SPACE, from the live skeleton — the sole test's frame.
 *
 * Same argument as `rrwLeftAxis` and the same failure it avoids: a fixed world axis is wrong the
 * moment the character leans, and on a jumping, turning player "down" is not (0,-1,0). Hips ->
 * the deepest spine bone is the trunk, which is the axis a boot's sole is perpendicular to when
 * the figure stands.
 *
 * ⚠️ IT FALLS BACK TO WORLD UP RATHER THAN TO NULL, and that is the opposite convention from
 * rrwLeftAxis on purpose. An unresolved LEFT axis must leave the thighs white — it cannot guess a
 * side, and guessing wrong renders as a plausible leg. An unresolved UP axis has a correct answer
 * for a standing figure, and the alternative failure — a sole mask that selects nothing — would
 * put the whole boot back to white and quietly delete the rubber the spec asks for.
 */
function rrwUpAxis(bones) {
  let hips = null, top = null, topDepth = -Infinity;
  for (const b of bones) {
    const t = rrwTokens(b.name);
    if (hips === null && / (hips|pelvis|root) /.test(t)) hips = b;
    if (/ spine/.test(t)) {
      const d = rrwBoneDepth(b);
      if (d > topDepth) { topDepth = d; top = b; }
    }
  }
  if (!hips || !top) return null;
  const a = new THREE.Vector3().setFromMatrixPosition(top.matrixWorld);
  const b = new THREE.Vector3().setFromMatrixPosition(hips.matrixWorld);
  const v = a.sub(b);
  return v.lengthSq() > 1e-8 ? v.normalize() : null;
}

/**
 * THE BODY'S OWN FORWARD DIRECTION, IN WORLD SPACE — and it is DERIVED FROM THE TOES rather than
 * from a cross product, which is the whole point of this function.
 *
 * The calf panel and the spine ridges are both BACK-facing features, so both need to know which
 * way the character faces. `cross(up, left)` produces a vector perpendicular to both and its SIGN
 * depends on the handedness of a frame nobody wrote down — it is a coin flip, and a wrong flip
 * renders as a chrome panel on the SHIN instead of the calf, which is a plausible-looking robot.
 * This project has already shipped one bug from assuming a bone axis.
 *
 * A toe is forward of its ankle on any biped, in any rig, under any convention. So the axis is
 * measured: toe minus foot, with the trunk component removed so a pitched foot does not tilt it,
 * averaged over both feet so a mid-stride pose does not lean it.
 *
 * FAIL-SAFE: returns null when the rig has no foot/toe pair, and the caller then leaves the axis
 * at ZERO — every facing test against a zero axis returns 0 and selects nothing. That is the
 * uRRWLeftAxis convention and the opposite of uRRWUpAxis's, for the same reason: there is no
 * correct guess for "which way is forward", and guessing wrong paints the wrong side of the leg.
 */
function rrwFwdAxis(bones, up) {
  const acc = new THREE.Vector3();
  let n = 0;
  for (const b of bones) {
    if (!/ foot/.test(rrwTokens(b.name))) continue;
    // its own toe child, not any toe — a left foot must not be paired with a right toe
    const toe = (b.children ?? []).find((c) => / (toe|ball)/.test(rrwTokens(c.name)));
    if (!toe) continue;
    const v = new THREE.Vector3().setFromMatrixPosition(toe.matrixWorld)
      .sub(new THREE.Vector3().setFromMatrixPosition(b.matrixWorld));
    if (up && up.lengthSq() > 1e-8) v.addScaledVector(up, -v.dot(up));
    if (v.lengthSq() > 1e-10) { acc.add(v.normalize()); n++; }
  }
  return n && acc.lengthSq() > 1e-8 ? acc.normalize() : null;
}

function boneMaskAutoBind(uni, famOpts) {
  const axis = new THREE.Vector3();
  const upAxis = new THREE.Vector3();
  const fwdAxis = new THREE.Vector3();
  return (renderer, scene, camera, geometry, object) => {
    if (!object || !object.isSkinnedMesh || !object.skeleton) {
      uni.uRRWHeadBone.value = -1;
      // An all-zero family array is an EXACT revert, so an unskinned caller is untouched.
      uni.uRRWFamW.value.fill(0);
      uni.uRRWBoneDet.value.fill(0);
      uni.uRRWBonePan.value.fill(0);
      uni.uRRWLeftAxis.value.set(0, 0, 0);
      uni.uRRWUpAxis.value.set(0, 1, 0);
      uni.uRRWFwdAxis.value.set(0, 0, 0);
      return;
    }
    let idx = object.userData.rrwHeadBone;
    if (idx === undefined) {
      const bones = object.skeleton.bones;
      let best = -1, bestDepth = Infinity;
      for (let i = 0; i < bones.length; i++) {
        if (!/head/i.test(bones[i].name || '')) continue;
        const d = rrwBoneDepth(bones[i]);
        if (d < bestDepth) { bestDepth = d; best = i; }
      }
      idx = object.userData.rrwHeadBone = best;
    }
    uni.uRRWHeadBone.value = idx;
    let fw = object.userData.rrwFamW;
    if (fw === undefined) fw = object.userData.rrwFamW = rrwFamilyWeights(object.skeleton.bones, famOpts);
    uni.uRRWFamW.value.set(fw);
    // Cached on the OBJECT and not on the material, for the same reason the family vector is:
    // the array is indexed by this skeleton's bone order, and one material is shared by the body,
    // the mint caps, the ear discs and the wordmark plate.
    let dw = object.userData.rrwBoneDet;
    if (dw === undefined) dw = object.userData.rrwBoneDet = rrwBoneDetail(object.skeleton.bones, famOpts);
    uni.uRRWBoneDet.value.set(dw);
    let pw = object.userData.rrwBonePanel;
    if (pw === undefined) pw = object.userData.rrwBonePanel = rrwBonePanels(object.skeleton.bones, famOpts);
    uni.uRRWBonePan.value.set(pw);
    // NOT cached: the bones move, and the whole point of deriving it from them is that it
    // follows the character. One subtract and a normalize per draw.
    const a = rrwLeftAxis(object.skeleton.bones);
    uni.uRRWLeftAxis.value.copy(a ?? axis.set(0, 0, 0));
    const u = rrwUpAxis(object.skeleton.bones);
    uni.uRRWUpAxis.value.copy(u ?? upAxis.set(0, 1, 0));
    const f = rrwFwdAxis(object.skeleton.bones, uni.uRRWUpAxis.value);
    uni.uRRWFwdAxis.value.copy(f ?? fwdAxis.set(0, 0, 0));
  };
}

function applyWeathering(material, o) {
  const clean = rrwLinear(o.tint);
  const uni = {
    uRRWOn: { value: o.strength },
    uRRWGrime: { value: o.grime },
    uRRWClean: { value: new THREE.Vector3(clean.r, clean.g, clean.b) },
    uRRWDirt: { value: new THREE.Vector3(0.40, 0.39, 0.37) },
    uRRWLift: { value: o.lift },
    uRRWOcc: { value: o.occ ?? 0.0 },
    uRRWCleanR: { value: o.cleanRough },
    uRRWMetal: { value: o.metal ? 1.0 : 0.0 },
    // The panel network. Only the shell passes these; on chrome and mint uRRWSeam is 0 and the
    // branch costs nothing, which keeps all three families on one program.
    uRRWSeam: { value: o.seam ?? 0.0 },
    uRRWSeamPlate: { value: o.seamPlate ?? 0.136 },
    uRRWSeamWM: { value: o.seamWM ?? 0.0092 },
    uRRWSeamFlr: { value: o.seamFloor ?? 0.25 },
    uRRWSeamOcc: { value: o.seamOcc ?? 1.0 },
    uRRWSeamNear: { value: o.seamNear ?? 0.0 },
    // See the two blocks in RRW_BODY. These defaults are the OLD behaviour, so a family that
    // does not pass them (chrome, mint) is bit-for-bit unchanged by this round; only the shell
    // overrides them. uRRWOccCap's default is the value at which the old unclamped expression
    // would first have gone negative on chrome (occ 0.465), i.e. never — so it cannot bind there.
    uRRWSeamCurv: { value: o.seamCurv ?? 1.0 },
    uRRWOccPool: { value: o.occPool ?? 1.0 },
    uRRWOccCap: { value: o.occCap ?? 1.0 },
    uRRWSeamDeep: { value: o.seamDeep ?? 1.0 },
    // 1 = ON. See the block in RRW_BODY: it is 1.0 on any surface at or above one plate, so
    // defaulting it on is bit-for-bit unchanged everywhere the network was working, and it is
    // only the small kit parts — which it was washing dark — that move.
    uRRWSeamFit: { value: o.seamFit ?? 1.0 },
    uRRWHeadClean: { value: o.headClean ?? 0.0 },
    // -1 = "no skeleton has claimed this material yet", which makes the head mask inert. Bound
    // per draw by boneMaskAutoBind() below; a family that never meets a SkinnedMesh keeps -1.
    uRRWHeadBone: { value: -1 },
    /*
     * The structural material families. Every default here is the PRE-ROUND behaviour: an
     * all-zero family array masks nothing, and uRRWDark 0 makes the whole block a no-op
     * regardless. Only the shell overrides them, so chrome and mint are bit-for-bit unchanged —
     * and so is any caller that never meets a SkinnedMesh, which is all of them except the
     * player.
     */
    uRRWDark: { value: o.dark ?? 0.0 },
    uRRWDarkAlb: { value: o.darkAlb ?? 1.0 },
    uRRWDarkMetal: { value: o.darkMetal ?? 0.0 },
    uRRWDarkRough: { value: o.darkRough ?? 0.5 },
    uRRWDarkCoat: { value: o.darkCoat ?? 0.0 },
    uRRWDarkEdge: { value: new THREE.Vector2(o.darkEdge0 ?? 0.40, o.darkEdge1 ?? 0.60) },
    uRRWFamW: { value: new Float32Array(RRW_MAXBONE * 4) },
    // Chrome. The tint is authored in sRGB like every other colour in this file and converted
    // here, because diffuseColor at the injection point is LINEAR.
    uRRWChrTint: { value: (() => { const c = rrwLinear(o.chrTint ?? C.chrome); return new THREE.Vector3(c.r, c.g, c.b); })() },
    uRRWChrMetal: { value: o.chrMetal ?? 1.0 },
    uRRWChrRough: { value: o.chrRough ?? 0.29 },
    uRRWChrEnv: { value: o.chrEnv ?? 1.0 },
    // Chrome SURFACE CHARACTER. Every default here is the pre-round behaviour — no machining,
    // and a contrast exponent of exactly 1, which is the identity — so a family that does not
    // pass them (chrome, mint) and every unskinned caller are bit-for-bit unchanged.
    uRRWChrTurn: { value: o.chrTurn ?? 0.0 },
    uRRWChrPitch: { value: o.chrPitch ?? 0.010 },
    uRRWChrDepth: { value: o.chrDepth ?? 0.0012 },
    uRRWChrRgh: { value: o.chrRgh ?? 0.10 },
    uRRWChrCon: { value: o.chrCon ?? 1.0 },
    uRRWChrPiv: { value: o.chrPiv ?? 1.0 },
    // 0 is INERT and is the default for every caller that does not ask, so the hunter, the
    // gadgets and `chromeSatin()` are byte-identical. See the floor's block in RRW_MAPS.
    uRRWChrFloor: { value: o.chrFloor ?? 0.0 },
    uRRWRubAlb: { value: o.rubAlb ?? 1.0 },
    uRRWRubMetal: { value: o.rubMetal ?? 0.0 },
    uRRWRubRough: { value: o.rubRough ?? 0.5 },
    uRRWLeftAxis: { value: new THREE.Vector3(0, 0, 0) },
    uRRWInnerBand: { value: new THREE.Vector2(o.innerBand0 ?? 0.10, o.innerBand1 ?? 0.45) },
    uRRWInner: { value: o.inner ?? 0.0 },
    // The thigh seam and the foot sole. Both default OFF/inert; only the shell passes them.
    uRRWTSeam: { value: o.tseam ?? 0.0 },
    uRRWTSeamW: { value: o.tseamW ?? 0.10 },
    uRRWTSeamD: { value: o.tseamD ?? 0.55 },
    uRRWTSeamO: { value: o.tseamO ?? 0.45 },
    // World up, not zero: this axis is a FALLBACK that has to be usable, because a sole test
    // against a zero axis selects nothing and would silently white the whole boot. A standing
    // figure's body-up IS world up, so the fallback is the right answer rather than a guess.
    uRRWUpAxis: { value: new THREE.Vector3(0, 1, 0) },
    uRRWSoleBand: { value: new THREE.Vector2(o.soleBand0 ?? 0.05, o.soleBand1 ?? 0.55) },
    uRRWSole: { value: o.sole ?? 0.0 },
    /*
     * THE JOINT CREASES. Every default here is the PRE-ROUND behaviour — an all-zero crease array
     * names no bone, and uRRWRing 0 makes the whole block a no-op regardless — so chrome, mint and
     * every caller that never meets a SkinnedMesh are bit-for-bit unchanged. Only the shell
     * overrides them.
     */
    uRRWBoneDet: { value: new Float32Array(RRW_MAXBONE * 4) },
    uRRWRing: { value: o.ring ?? 0.0 },
    uRRWRingW: { value: new THREE.Vector2(o.ringW0 ?? 0.006, o.ringW1 ?? 0.016) },
    uRRWRingD: { value: o.ringD ?? 0.62 },
    uRRWRingO: { value: o.ringO ?? 0.55 },
    uRRWRingCtl: { value: o.ringCtl ?? 0.0 },
    uRRWJoint: { value: o.joint ?? 0.0 },
    uRRWJointW: { value: new THREE.Vector2(o.jointW0 ?? 0.030, o.jointW1 ?? 0.052) },
    // The panel features. Same convention as everything above: every default is the pre-round
    // behaviour, so a family that does not pass them is bit-for-bit unchanged.
    uRRWBonePan: { value: new Float32Array(RRW_MAXBONE * 4) },
    uRRWFwdAxis: { value: new THREE.Vector3(0, 0, 0) },
    uRRWCalf: { value: o.calf ?? 0.0 },
    uRRWCalfB: { value: new THREE.Vector2(o.calfB0 ?? 0.15, o.calfB1 ?? 0.55) },
    uRRWCalfT: {
      value: new THREE.Vector4(o.calfT0 ?? 0.30, o.calfT1 ?? 0.46, o.calfT2 ?? 0.84, o.calfT3 ?? 0.96),
    },
    uRRWRidge: { value: o.ridge ?? 0.0 },
    uRRWRidgeD: { value: o.ridgeD ?? 0.45 },
    uRRWVent: { value: o.vent ?? 0.0 },
    uRRWVentT: {
      value: new THREE.Vector4(o.ventT0 ?? -0.05, o.ventT1 ?? 0.02, o.ventT2 ?? 0.30, o.ventT3 ?? 0.46),
    },
    // 0 is the OLD code path exactly — see uRRWVentKeep's block in RRW_PARS. Only shellWhite
    // overrides it, so every other caller of this file is bit-for-bit unchanged.
    uRRWVentKeep: { value: o.ventKeep ?? 0.0 },
    uRRWVentH: { value: new THREE.Vector2(o.ventH0 ?? 0.86, o.ventH1 ?? 0.98) },
    uRRWWrist: { value: o.wrist ?? 0.0 },
    uRRWWristAt: { value: new THREE.Vector2(o.wristAt0 ?? 0.012, o.wristAt1 ?? 0.040) },
    uRRWWristW: { value: o.wristW ?? 0.010 },
    // the SAME uniform objects the pipeline updates each frame, under names of our own so
    // nothing collides with, or depends on the ordering of, `patchForScreenAO`'s declarations
    uRRWAO: AO_UNIFORMS.tScreenAO,
    uRRWAOOn: AO_UNIFORMS.uAOEnabled,
    uRRWAORes: AO_UNIFORMS.uAOResolution,
  };
  material.userData.weathering = uni;
  material.onBeforeRender = boneMaskAutoBind(uni, {
    waist: o.darkAbdomen ?? 1.0, feet: o.famFeet ?? 1.0,
    neck: o.famNeck ?? 1.0, inner: o.famInner ?? 1.0, probe: o.famProbe ?? null,
    joint: o.ringJoint ?? 0.75, detach: o.ringDetach ?? 1.0, cap: o.ringCap ?? 1.0,
    calf: o.calfW ?? 1.0, ridge: o.ridgeW ?? 1.0, vent: o.ventW ?? 1.0, wrist: o.wristW2 ?? 1.0,
    ridgePitch: o.ridgeP ?? 0.022, ventPitch: o.ventP ?? 0.016,
  });
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    // VERTEX SIDE — the head mask. <common> and <skinning_vertex> are both unconditionally
    // present in three's standard vertex shader, so rrwPatch's assertion is a real check here
    // rather than a formality: if three renames either chunk this throws instead of silently
    // rendering a head that is never cleaned.
    sh.vertexShader = rrwPatch(
      rrwPatch(sh.vertexShader, '#include <common>', RRW_BONE_PARS_VERT),
      '#include <skinning_vertex>', '', RRW_BONE_VERT);
    let f = sh.fragmentShader;
    f = rrwPatch(f, '#include <lights_physical_pars_fragment>', RRW_PARS);
    f = rrwPatch(f, '#include <lights_physical_fragment>', RRW_BODY, RRW_POST);
    // The chrome family's environment gain. Separate seam from RRW_POST because `radiance` and
    // `iblIrradiance` do not exist until <lights_fragment_maps> has gathered them, and are
    // consumed by <lights_fragment_end> immediately after — this is the only window.
    f = rrwPatch(f, '#include <lights_fragment_maps>', '', RRW_MAPS);
    // `outgoingLight` is declared just above <opaque_fragment>, so this is the last seam at
    // which the masks can be painted over the finished shading — and the only one at which
    // the panel groove's occlusion can multiply the specular and the ambient as well as the
    // diffuse. The debug readout goes AFTER it because it overwrites rather than modulates.
    f = rrwPatch(f, '#include <opaque_fragment>', RRW_OPAQUE + (o.debug ? RRW_DEBUG[o.debug] : ''));
    sh.fragmentShader = f;
  };
  /*
   * 🚨 `customProgramCacheKey` ALONE IS NOT ENOUGH HERE, AND FINDING OUT WHY WAS THE ONE REAL
   * SURPRISE IN THIS ROUND.
   *
   * `post/pipeline.js`'s `patchForScreenAO()` runs over every material in the scene at finalize
   * and does
   *     material.customProgramCacheKey = () => 'rrr-ssao-v1';
   * i.e. it ASSIGNS rather than composes, so whatever this line sets is discarded a moment
   * later. (It composes `onBeforeCompile` correctly — it keeps and calls the previous one — so
   * the patch itself survives; only the key is lost.)
   *
   * Left there, every weathered material would advertise the same cache key as every OTHER
   * ssao-patched material with the same map slots and defines — three's own key is built from
   * booleans like "has a normalMap", not from texture identity — so a baked
   * MeshPhysicalMaterial from `marble.js` or `walnut.js` standing in the same scene as a robot
   * shell could be handed the shell's program, or the shell theirs. That is a SHARED-BUILD
   * regression waiting for the first scene that puts a robot in a room, and it would present as
   * a wrong-looking wall rather than as anything pointing back here.
   *
   * `material.defines` is hashed into the program cache key too (WebGLPrograms.js
   * `getProgramCacheKey`, and it is hashed BEFORE `customProgramCacheKey`), and nothing in the
   * project rewrites it. So the discriminator rides there, where it cannot be clobbered. The
   * macro itself is never referenced by the GLSL — it exists purely to be hashed.
   */
  // the debug mode changes the SOURCE, so it has to be part of the discriminator too
  const id = RRW_FAMILY_ID[o.family] * 10 + (o.debug ?? 0);
  material.defines = { ...(material.defines ?? {}), RRR_WEATHER: id };
  material.customProgramCacheKey = () => `rrr-weather-v1:${id}`;
  return material;
}

/**
 * Near-white glossy shell: chest, thigh, boot upper, helmet.
 *
 * THE `envMapIntensity` BELOW IS INERT IN EVERY VIEW THAT SETS `scene.environment`, which
 * is all of them. three's WebGLRenderer forces the uniform to `scene.environmentIntensity`
 * whenever `material.envMap === null`, so the material's own value is never read. Do not
 * try to tune a surface's environment response here — see `setEnvResponse()` in
 * `src/views/_studio.js`, which is the only thing that makes this number live.
 */
/**
 * The panel network's live knobs. Defaults are the NEW surface.
 *
 * THE COMPLETE REVERT IS `?seams=0&occ=0&shellsize=512`, AND THE THIRD TERM IS NOT OPTIONAL —
 * this was asserted rather than assumed, and the first version of the assertion FAILED. At
 * `?seams=0&occ=0` alone the capture still differed from the pre-round one in 1.58% of bytes
 * (max delta 30, but only 14 pixels above 16), because `size` moved 512 -> 1024 OUTSIDE the
 * uSeam branch: every texel of the albedo, ORM and normal is resampled at the new resolution
 * whether the network is drawn into it or not. With `shellsize=512` restored the capture is
 * byte-identical to the pre-round one, 0 of 6 220 800 bytes differing — the same floor a
 * same-config control pair reads on this harness. The shipped default differs from it in
 * 174 095 pixels above 1, so the control is one that has been watched both pass and fail.
 *
 *   ?seams=0      no panel network at all, baked or drawn
 *   ?occ=0        no clean-surface cavity occlusion
 *   ?shellsize=512  the pre-round bake resolution
 *   ?seams=0.5    half depth
 *   ?seamn=24     plate grid frequency; 2.04 m per uv unit, so 17 is a 12 cm plate
 *   ?seamw=0.005  groove half-width in uv units; 0.0034 is about 7 mm on a 1.7 m robot
 *   ?brush=0      no brushed-metal streak
 *   ?seambake=1   bake the grooves flat into the tile, as rounds 1-3 shipped. Default 0.
 *   ?rseams=0     no RENDER-TIME network (leaves the plate step, the brush and the occlusion)
 *   ?rseamfloor=0 the network only where the geometry says joint/edge/recess; 1 = everywhere,
 *                 which is the flat bake again with none of its normal-map cost
 *   ?rseamplate=0.20  render-time plate size in METRES of surface (not a uv frequency)
 *   ?rseamfit=0   draw the network even on a surface SMALLER THAN ONE PLATE, where the
 *                 frequency clamp pins it to a single cell and the groove swallows the part.
 *                 This is what made the kit's shoulder bosses photograph as dark holes.
 *   ?rseamwm=0.005  render-time groove half-width in METRES
 *   ?rseamocc=0   the groove darkens the ALBEDO only, as the first cut of this did. It is the
 *                 control for the "an albedo multiply is not a groove" measurement.
 *   ?rseamnear=0  no broad structural shading — LINES ONLY, which is the state that measured
 *                 facet energy 15-16 against the art's 9-12. The control for that claim.
 */
function shellKnob(name, fallback) {
  if (typeof location === 'undefined') return fallback;
  const v = new URLSearchParams(location.search).get(name);
  if (v === null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/*
 * The shipped chrome warmth. Named here rather than written inline at the call site because it
 * was SWEPT, and the sweep is the only reason it is this number rather than 0 — see the block
 * above `chrTint` in shellWhite() for the art measurement and the table.
 */
/*
 * ⚠️ 0.05 -> 0.065, AND IT IS A CONSEQUENCE OF THE ROUND'S OTHER CHANGE RATHER THAN A NEW TASTE
 * CALL. The one-sided contrast curve (see above RRW_MAPS) darkens the chrome's low tail, and a
 * pixel pushed toward black loses chroma along with value — delivered upper-arm R-B fell from +11
 * to +7 at the old 0.05 with nothing about the tint touched. The art measures +9. Re-swept at the
 * shipped exponent: 0.050 -> +3, 0.060 -> +7, 0.075 -> +13, i.e. about 400 delivered levels per
 * authored unit, so 0.065 is the setting that puts it back on the art's own number.
 *
 * '?dlcwarm=0.05' is the pre-round tint and is part of this round's exact-revert string.
 */
const DLCWARM = 0.065;

/** The same, for a knob whose value is a NAME rather than a number (currently ?famprobe=). */
function shellText(name, fallback) {
  if (typeof location === 'undefined') return fallback;
  return new URLSearchParams(location.search).get(name) ?? fallback;
}

export function shellWhite(opts = {}) {
  /*
   * SIZE 512 -> 1024, AND IT IS THE PANEL NETWORK THAT FORCES IT.
   *
   * One uv unit is 2.044 m of this character's surface, so a 512 tile is a 4 mm texel and a
   * 1024 tile a 2 mm one. The groove below is 3.7 mm wide (uSeamW is a HALF-width) — at 512
   * that is under one texel and the network bakes as a grey smear with no core, which is
   * exactly the state in which it costs value spread without ever reading as a line. At 1024 it
   * is two texels and has a bottom.
   *
   * ✅ THE COST IS NOW MEASURED, AND IT IS PAID ONCE, NOT FOUR TIMES — `harness/_vram3_shellsize.mjs`.
   * This block used to say the increase was "12.6 MB per variant ... a scene holding the player
   * plus three hunter stages pays it four times". The per-variant figure was near enough (12.00 MB,
   * not 12.6 — the mip chain is 4/3, not 1.34). THE "FOUR TIMES" WAS WRONG, because it reasoned
   * about grime levels rather than about callers: `hunter.js:393` passes `size: 512` explicitly for
   * shell, chrome and mint, and `...opts` is merged AFTER the default below, so a hunter's shell
   * cannot move with this number at all. The only 1024 set anywhere is the player's clean shell.
   *
   *   view           shell sets in the scene                       delta
   *   game.play      1 @ 1024 (player) + 3 @ 512 + 1 @ 256         +12.00 MB
   *   hunter.1/2/3   1 @ 1024 (scale-reference player) + 1 @ 512   +12.00 MB
   *   hunter.sheet   1 @ 1024 + 3 @ 512 + 1 @ 256                  +12.00 MB
   *
   * Every view, the same 12.00 MB, once. Against `game.play`'s whole texture budget — 659.92 MB
   * over 220 unique textures, measured the same way — that is 1.8%. The budget is not tight here,
   * so 1024 stays. Widths are read off the LIVE textures (`tex.image.width`), not off the `size`
   * that was requested, precisely because a caller can win the merge; the hunters' pinned 512s are
   * the probe's own control, and a run in which they moved would mean it was reading the request.
   *
   * `harness/_vram1_reset.mjs` is NOT the probe for this, though this comment used to name it. It
   * reads `renderer.info.memory.{textures,geometries}`, which are counts of OBJECTS — a 512 tile
   * and a 1024 tile both count as 1, and the count is identical under both flags in every view
   * above (53, 53, 65, 91, 283). It would have printed the same number twice and read as "free".
   *
   * `?shellsize=512` still puts it back, at the cost of the groove's core.
   */
  /*
   * `?shellwarm` — the champagne A/B, and 0 is an EXACT revert of the tint.
   *
   * SHELL_NEUTRAL is the pre-round #EDEFF0 verbatim, so `?shellwarm=0` bakes the old albedo
   * byte for byte and is the control this change is quoted against. 1 is the shipped champagne.
   * Values above 1 extrapolate along the same line, which is how the number below was solved:
   * the transfer through the tonemap is not the identity (see the block on `C.shell`), so the
   * tint deficit cannot be read off the pixel deficit and had to be swept.
   */
  const SHELL_NEUTRAL = [0.929, 0.937, 0.941];
  const warm = shellKnob('shellwarm', 1.0);
  const o = {
    tint: C.shell.map((v, i) => SHELL_NEUTRAL[i] + (v - SHELL_NEUTRAL[i]) * warm),
    peel: 1.0, wear: 0.35, grime: 0.0, sootDark: 0.0,
    size: shellKnob('shellsize', 1024),
    seam: shellKnob('seams', 1.0),
    // 2.044 m per uv unit, so 30 is a 6.8 cm plate. Round 1 ran 17 (12 cm) and the atlas's
    // charts have a median uv-bbox diagonal of 0.070 (14.3 cm across 405 charts), so almost
    // every chart got exactly ONE line, at whatever orientation that chart happens to carry.
    // One arbitrary slash per part reads as damage; a consistent local grid of three or four
    // reads as plating, and the orientation changing between charts then reads as different
    // parts panelled differently, which is what a real assembly looks like.
    /*
     * ROUND 3 — 30 -> 20 AND THE GROOVE WIDENS, WHICH IS A FACET-ENERGY TRADE, NOT A TASTE ONE.
     *
     * Measured across the round-2 depth sweep (neutrality cuts 20 and 30, which agree; the
     * cut-12 column disagrees on the legs and is named rather than quoted):
     *
     *                        whole dark<90   legs dark<90   trough@14   spread   facet
     *   seams 0.60             5.5-7.1%       4.1-5.5%      14.5-15.6    129-135   16.8
     *   seams 0.85             9.1-11.4%      6.6-9.6%      17.4-19.0    145-151   22.1
     *   seams 1.00            11.9-14.5%      9.2-12.8%     18.5-20.2    158-163   25.5
     *   occlusion alone        3.1-3.8%       1.9-2.5%       5.7-6.2     120-124   10.9
     *   ART                   13.9-15.9%     10.0-10.9%     12.1-13.6    ~159       ~9-12
     *
     * At the depth that lands the DARKS and the SPREAD, trough density is 50% over the art and
     * facet energy — mean |second difference| of luma along a row — is 2.5x it. Both say the
     * same thing, and the capture says it too: the darks were being spent on too many thin
     * lines, so the shell photographed as a maze rather than as panelling.
     *
     * The occlusion row is the way out. It buys darks at facet energy 10.9, which is INSIDE the
     * reference's own band, because it is broad and geometric rather than linear. So the budget
     * moves: a third fewer seam lines, each half again as wide (wider is lower spatial frequency
     * and therefore cheaper in facet energy for the same coverage), and the cavity term takes up
     * the slack at more than double its round-2 strength.
     */
    seamN: shellKnob('seamn', 15.0),
    seamW: shellKnob('seamw', 0.0026),
    brush: shellKnob('brush', 1.0),
    // 0 = the grooves are drawn at render time through the geometric gate (the shipped
    // behaviour); 1 = baked flat into this tile, which is what rounds 1-3 shipped.
    seamBake: shellKnob('seambake', 0.0),
    ...opts,
  };
  const m = baker().standard({
    key: `rrshell:${JSON.stringify(o)}`,
    size: o.size, surface: SHELL_SURFACE,
    heightScale: 0.006, normalStrength: 1.0, anisotropy: 8,
    uniforms: {
      uTint: new THREE.Vector3(...o.tint), uPeel: o.peel, uWear: o.wear, uGrime: o.grime,
      uSootDark: o.sootDark,
      uSeam: o.seam, uSeamN: o.seamN, uSeamW: o.seamW, uBrush: o.brush,
      uSeamBake: o.seamBake,
    },
  }, {
    // A filthy shell has lost its clearcoat; a clean one still has it. The old 0.75 slope
    // left the stage-1 hunter at clearcoat 0.68 — still a showroom gloss, and gloss is the
    // first thing that reads as "clean" at a glance, before any albedo does.
    clearcoat: 0.9 * Math.max(0, 1.0 - o.grime * 1.25),
    clearcoatRoughness: 0.032 + o.grime * 0.5,
    envMapIntensity: 1.0 - o.grime * 0.30,
    normalScale: new THREE.Vector2(0.35 + o.grime * 0.45, 0.35 + o.grime * 0.45),
  }, THREE.MeshPhysicalMaterial);
  // The shell is the surface the complaint was filed against (armpit, knee crevice, boot top),
  // so it carries the layer at full strength. `lift` roughly inverts SHELL_SURFACE's own soot
  // multiply of 0.24, capped at the tint so a clean texel cannot brighten.
  if (weatheringEnabled()) {
    applyWeathering(m, {
      family: 'shell', debug: weatheringDebug(), strength: 1.0, grime: o.grime, tint: o.tint,
      lift: 2.8, cleanRough: 0.20, metal: false, occ: shellKnob('occ', 1.45),
      // The panel network, drawn per pixel through the geometric gate. `rseams=0` is a
      // complete revert of this half; `?seambake=1&rseams=0&rseamnear=0` reverts the round.
      seam: o.seam * shellKnob('rseams', 1.0),
      /*
       * PLATE SIZE IN METRES. 0.136 is the generated player's 2.044 m per uv unit divided by
       * the bake's 15 lines per uv unit, so on THAT character this is the frequency the bake
       * used and the two are comparable under ?seambake=1. On every other mesh it now means
       * what it says instead of inheriting that mesh's unwrap scale — see the block in
       * RRW_BODY for why that distinction is load-bearing rather than tidy.
       *
       * THE GROOVE IS WIDER THAN THE BAKED ONE (12.5 mm against the bake's 5.3 mm) AND THAT IS
       * MEASURED. The bake is mipmapped and anisotropically filtered, so its groove arrives on
       * screen already spread over several pixels; this pass has no mip chain and lands the
       * profile at its literal width, so it has to be authored wider to read at all. Width was
       * also the cheapest lever in the round: swept at a matched gate it bought roughly two
       * points of dark<90 per point of facet energy, against 1.0-1.3 for depth and for the gate
       * floor, because a wide groove is a LOWER spatial frequency for the same coverage and the
       * facet column is a second difference.
       */
      /*
       * 0.136 -> 0.27 m, WHICH IS HALF AS MANY LINES, AND IT IS THE PRICE OF THE 0.62 GATE
       * FLOOR IN THE BLOCK IN RRW_BODY. A floor that puts every groove below the dark cut is
       * only affordable if there are few grooves; at the old 12.8 cm plate it would be the
       * graph-paper failure with the lines merely darker.
       *
       * The delivered plate is quantised to a power of two of the uv frequency (see rrwSN), so
       * this is not a free dial: on the player's 2.044 m per uv unit, 0.136 lands on 16 lines
       * per uv unit = 12.8 cm plates, and 0.27 lands on 8 = 25.6 cm plates. Anything between
       * 0.19 and 0.38 delivers the same 25.6 cm, so the number is the middle of its own bucket
       * rather than a tuned value — a deliberate choice, because a value near a bucket edge
       * would flip on any mesh whose unwrap scale differs slightly.
       *
       * MEASURED at the flat-gate control, Alert pose, cut 90 (`?rseamfloor=1&occ=0`):
       *
       *                 nDark   nComp  comp/1k  top10%  wElong  biggest/H
       *   plate 0.136   37536     447     11.9   86.9%    2.48      20.76
       *   plate 0.27    21813     319     14.6   84.7%    2.10       7.09
       *   ART           21096      72      3.4   85.9%    1.95       4.38
       *
       * The coarser plate lands the art's dark COUNT almost exactly (21813 against 21096) and
       * its concentration and elongation, which the finer one overshoots on every column.
       */
      seamPlate: shellKnob('rseamplate', 0.27),
      // 12.5 -> 14.5 mm. At 536 px per metre on this capture the groove's half-strength width
      // is about 8 px, comfortably over the ~4 px below which the critique says a feature
      // contributes dust rather than panelling. Width is the cheapest lever in facet energy —
      // a wider groove is a LOWER spatial frequency for the same coverage — so it is spent here
      // rather than on depth.
      seamWM: shellKnob('rseamwm', 0.0145),
      // 0.20 -> 0.62. THE HEADLINE NUMBER OF THIS ROUND. See the block in RRW_BODY: below ~0.55
      // a groove off structure does not reach the dark cut, so the gate decides whether a
      // channel EXISTS and the surviving fragments are the speckle. `?rseamfloor=0.20` is the
      // exact revert.
      seamFloor: shellKnob('rseamfloor', 0.62),
      seamOcc: shellKnob('rseamocc', 1.0),
      // 1.0 -> 0.25: a quarter of the screen-space curvature reaches the seam gate. The other
      // three quarters were the tessellation mosaic that chopped the lines. `?rseamcurv=1` reverts.
      seamCurv: shellKnob('rseamcurv', 0.25),
      // 1.0 -> 0.30: the same tessellation signal, in the cavity term. `?rpool=1` reverts.
      occPool: shellKnob('rpool', 0.30),
      // The cavity term's ceiling AFTER uRRWOcc (1.45) scales it. Unbounded it went past 1.0 and
      // clipped the albedo to black around the visor bezel — see the block in RRW_BODY.
      // `?rocccap=1` reverts to the unbounded expression (and reinstates the hole).
      occCap: shellKnob('rocccap', 0.86),
      seamDeep: shellKnob('rseamdeep', 1.0),
      // The plate-fit fade. `?rseamfit=0` is the EXACT revert and is the picture of the
      // shoulder boss as a dark hole; see the block in RRW_BODY for the ablation that found it.
      seamFit: shellKnob('rseamfit', 1.0),
      // The head is the shell's problem alone — chrome and mint never pass this, so the bezel
      // ring, the ear discs and the neck column keep exactly the surface they had.
      // '?headclean=0' is the A/B and puts the dirty head straight back.
      headClean: shellKnob('headclean', 1.0),
      /*
       * THE SECOND, DARKER STRUCTURAL MATERIAL — arms, hands, neck, abdomen. See the long block
       * above RRW_BONE_PARS_VERT for the art measurement every number below is taken from, and
       * `?weather=debug5` for where the mask actually lands.
       *
       * `?darklimb=0` is the EXACT revert of this whole round.
       */
      dark: shellKnob('darklimb', 1.0),
      /*
       * ALBEDO 0.52, AND TWO MEASUREMENTS DISAGREED ABOUT IT — the disagreement is named here
       * rather than averaged away, because picking the wrong one of the two costs a whole round.
       *
       * Swept on the Alert capture, `harness/_two2_ratio.mjs` (which selects the region with the
       * ?weather=debug5 mask rather than with a box, because the render is posed and a box lands
       * on the wrong parts) and `harness/_two1_regionmap.mjs` for the fractions:
       *
       *   at dlmetal 0.55:
       *   darkAlb    0.28   0.34   0.42   0.52   0.64  |  ART
       *   dark<70   15.7%  13.5%  10.6%   7.0%   3.8%  |  7.0 - 8.8%
       *   dark<90   18.5%  17.3%  15.3%  12.4%   9.5%  |  12.3 - 14.0%
       *   dark<110  22.5%  21.5%  20.4%  18.6%  15.9%  |  19.3 - 20.8%
       *   dark<130  29.2%  28.3%  27.5%  26.3%  24.7%  |  30.5 - 33.2%
       *   arm/plate  0.30   0.36   0.44   0.53   0.61  |  0.60 - 0.68
       *
       *   at the shipped dlmetal 0.85:
       *   darkAlb                   0.52   0.58   0.64  |  ART
       *   dark<70                   9.6%   7.7%   5.1%  |  7.0 - 8.8%
       *   dark<90                  14.6%  13.2%  11.3%  |  12.3 - 14.0%
       *   dark<110                 19.6%  18.8%  17.7%  |  19.3 - 20.8%
       *
       * ⚠️ ALBEDO AND METALNESS ARE NOT INDEPENDENT — a metal has no diffuse term, so raising
       * metalness darkens wherever the environment does not reach and shifts this whole table.
       * They were swept one at a time rather than as a 25-cell grid, and 0.58 is the albedo that
       * re-centres the fractions AFTER metalness was chosen for its look. Anyone re-tuning one
       * of the two has to re-sweep the other; neither column is valid on its own.
       *
       * TWO MEASUREMENTS DISAGREED and the disagreement is named rather than averaged away. The
       * dark-FRACTION columns pick 0.58; the arm/plate RATIO column picks 0.64. The fractions
       * win, on two grounds: they are the target this round was set, and they agree across four
       * cuts and three art views — whereas the ratio is one box on two views whose own two arms
       * disagree with each other by 0.16 (0.563 vs 0.721, lit side against shadow side), a
       * spread wider than the gap being argued about.
       *
       * ⚠️ cut 130 is UNDER the art at EVERY setting and barely moves with this knob (29.2 ->
       * 24.7 across the whole sweep). That deficit is not an albedo problem and this round does
       * not close it: the art's mid-tones are plate seams, joint recesses and panel gaps, i.e.
       * geometry and detail that a bone mask has no way to draw.
       */
      darkAlb: shellKnob('dlalb', 0.58),
      /*
       * METALNESS 0.85, AND IT IS DOING THE WORK THAT STOPS THIS LOOKING LIKE ELECTRICAL TAPE.
       *
       * A pure albedo multiply gives a matte grey limb — the exact failure this round was warned
       * about, where the best-scoring variant shipped a figure wrapped in tape. The art's dark
       * parts are satin structural METAL, and the giveaway is that they keep a bright specular
       * run down the forearm with darker recesses at the joints. That is what makes them read as
       * a different MATERIAL rather than as the white plate in shadow, and it is HUE and
       * SPECULAR CHARACTER doing it, not value: the art's arms are only modestly darker than its
       * chest plate (see the ratio row above), yet they never read as the same part.
       *
       * Compared at a matched albedo, 0.55 gives a flat uniform grey tube and 0.85 gives a
       * surface with specular life along the forearm. The crops are what decided it; the
       * fractions merely permitted it, and they were re-centred afterwards on darkAlb.
       *
       * It is NOT driven to 1.0: a full metal has no diffuse term at all and goes near-black
       * wherever the environment does not reach, which on a character that has to stay readable
       * against a dark track is a worse failure than being slightly plastic.
       */
      darkMetal: shellKnob('dlmetal', 0.85),
      darkRough: shellKnob('dlrough', 0.42),
      // The white plates are lacquered and the dark metal is not; 1.0 removes the coat entirely.
      darkCoat: shellKnob('dlcoat', 1.0),
      /*
       * THE EDGE. Measured at 0.46-0.57% of figure height (median 4-5 px of ~880), p25 = 3 px,
       * agreeing across all three art views — a hard material join. These are bounds on the
       * BONE WEIGHT, so the boundary lands wherever the rig hands over, i.e. inside the elbow,
       * the wrist and the collar, and it does not crawl when the arm swings.
       */
      darkEdge0: shellKnob('dledge0', 0.40),
      darkEdge1: shellKnob('dledge1', 0.60),
      /*
       * The waist girdle — CHROME per the spec, where round 1 had it dark. Separate from the
       * arms because it is the one region whose bone is found by DEPTH rather than by name, so
       * it is the one most worth being able to switch off on its own if a rig numbers its spine
       * in a third way. `?dlabs=0` leaves the whole torso white.
       *
       * ⚠️ The spec also asks the waist chrome to WRAP AROUND TO THE SMALL OF THE BACK with
       * ridges for flexion. A bone mask covers the whole girdle, front and back, so the wrap is
       * present; the RIDGES are finer than a bone and belong to the aBoneLocal round.
       */
      darkAbdomen: shellKnob('dlabs', 1.0),
      /*
       * ===== THE FAMILY ASSIGNMENT, AND ITS THREE NEW MATERIALS =====
       * `docs/design/player-material-spec.md` is the authority; see rrwFamilyWeights() for the
       * row-by-row mapping. Each family has its own master so a wrong one can be switched off
       * without losing the others.
       */
      famFeet: shellKnob('dlfeet', 1.0),
      famNeck: shellKnob('dlneck', 1.0),
      famInner: shellKnob('dlinnerw', 1.0),
      // MEASUREMENT ONLY — see rrwFamilyWeights(). Absent from a normal URL, so it cannot alter
      // anything that ships; with it, ?weather=debug5 is a per-region selection mask.
      famProbe: shellText('famprobe', null),
      /*
       * CHROME. The tint is this file's own C.chrome — the same #B9BEC2 `chromeSatin()` uses for
       * the ear discs and ankle stacks — so the masked regions and the real chrome parts are one
       * colour rather than two that nearly agree.
       *
       * ⚠️ chrEnv IS THE WHOLE DIFFERENCE BETWEEN CHROME AND DARK GREY, and it is copied from
       * chromeSatin()'s own envMapIntensity rather than invented. See RRW_MAPS for why a
       * material-level envMapIntensity cannot deliver it here: the player's body is one mesh, so
       * raising it would take the white plates with it. `?dlcenv=1` is the control and puts the
       * dark-grey arm straight back, which is exactly the round-1 defect.
       */
      /*
       * CHROME HUE, AND IT IS THE ONE THING THE SPEC EXPLICITLY DELEGATES TO MEASUREMENT:
       * "The hue of the chrome and of the dark crease. Measure those off the art; they are not
       * described here."
       *
       * MEASURED, `harness/_mat4_artbox.mjs` on assets/mv/player/baseline_front.png, median R-B
       * over a box on each region (0-255):
       *
       *                     ART R-B      RENDER R-B at dlcwarm 0
       *   upper arm            +9              -13
       *   waist               +16              -13
       *   white shell       +7..+12         +6..+13   (already right — see C.shell's own block)
       *
       * So the shell's warmth is landing and the chrome's is not: C.chrome is #B9BEC2, which is
       * authored COOL (B > G > R), and at metalness 1 the albedo IS the reflectance so that lean
       * arrives almost undiluted. The art's structural metal is very slightly WARM, the same
       * champagne family as its plates — which is what makes the two read as one machine in two
       * finishes rather than as a white robot with steel bolted on.
       *
       * dlcwarm adds to R and subtracts from B in the AUTHORED sRGB tint, before the linear
       * conversion. It is deliberately a separate knob from C.chrome and NOT an edit to it:
       * C.chrome also dresses chromeSatin() — the ear discs, the ankle stacks, the procedural
       * robot and all three hunter stages — and this round is not allowed to move those.
       * '?dlcwarm=0' is the exact A/B back to the neutral chrome tint.
       *
       * SWEPT, delivered upper-arm R-B against the art's +9:
       *
       *   dlcwarm      0.00   0.05   0.10   0.16
       *   R-B           -13    +11    +36    +64
       *
       * That is about 480 delivered levels per authored unit — roughly four times the slope the
       * WHITE shell sees for the same authored shift, and the difference is physical rather than
       * mysterious: at metalness 1 there is no diffuse term, so the albedo multiplies the
       * reflected environment directly instead of being averaged into it. 0.05 lands at +11,
       * inside the art's own chrome spread (+9 upper arm, +16 waist); 0.10 is visibly orange.
       */
      /*
       * ⚠️ THE THREE CHROME KNOBS BELOW TAKE A PER-CALLER DEFAULT, AND THE URL STILL WINS.
       *
       * `shellWhite` dresses the player in `mesh.animated`, the player in `game.play` through
       * `mesh-avatar.js`, and all three hunter stages. Until the lighting round they shared one
       * set of chrome constants, which was correct while there was one room: `chrCon` 4.0 is a
       * CONTRAST CURVE ON THE GATHERED RADIANCE, and it exists precisely because `mesh.animated`
       * ran an environment with nothing dark in it (see the long block above RRW_MAPS). It is a
       * stand-in for a room, and a stand-in double-counts the moment the room turns up: measured
       * on the new environment, `chrCon` 4.0 takes the upper arm to median 28.9 and p05 10.1 — a
       * near-black tube — against the art's 120.3 and 57.4.
       *
       * So the view that now has a real dark environment turns the stand-in OFF and pays for its
       * level and its hue honestly, and every other caller keeps the constants it was tuned with,
       * byte for byte, because `opts.chr*` is undefined for all of them. `?dlcenv=`/`?dlccon=`/
       * `?dlcwarm=` still override either way, so every sweep in this file's history still runs.
       */
      chrTint: (() => {
        const k = shellKnob('dlcwarm', opts.chrWarm ?? DLCWARM);
        return [C.chrome[0] + k, C.chrome[1], C.chrome[2] - k];
      })(),
      chrMetal: shellKnob('dlcmetal', 1.0),
      /*
       * ROUGHNESS IS A DEAD LEVER HERE AND THE SWEEP IS RECORDED SO NOBODY SPENDS A ROUND ON IT.
       * Upper-arm median across dlcrough 0.20 / 0.29 / 0.42: 138.1 / 140.2 / 145.0, i.e. 5% over
       * the whole range, because the environment reaching this mask is a PREFILTERED probe whose
       * mip chain is already blurred — there is no sharp detail left for roughness to blur. It
       * stays at CHROME_SURFACE's own base value so the masked chrome and the real chrome parts
       * agree about what this material is.
       */
      chrRough: shellKnob('dlcrough', 0.29),
      /*
       * 2.0, AND THE FIRST ANSWER WAS WRONG BECAUSE IT WAS JUDGED BEFORE THE HUE WAS FIXED.
       *
       * Swept against the art's own value RELATIONSHIP rather than an absolute level — upper arm
       * over forearm, both measured through ?famprobe= masks, which is free of exposure and of
       * the chest reference (the chest bone's delivered mask is an 824 px highlight sliver and
       * makes a poor denominator):
       *
       *   dlcenv          1.0    1.8    2.0    2.4    3.0  |  ART
       *   upperarm/fore    --   0.619  0.675  0.743  0.837 |  0.671
       *   spread (p95-p05) --   115.6  110.7  103.6   91.7 |  163.9
       *
       * ⚠️ AND THE HONEST PART. Judged by eye at dlcwarm 0, 2.4 looked best and 1.8 looked dead —
       * so the number (which said ~2.0) and the eye disagreed, and the eye was believed. That was
       * an error: the "deadness" at low env was the BLUE cast, not the level. With dlcwarm at
       * 0.05 the same crop at 2.0 reads as warm satin metal with more separation from the shell
       * than 2.4 gives, and both instruments now pick the same number. The lesson is ordering —
       * value cannot be judged through a hue error — and it is written down because the wrong
       * answer was one capture away from shipping.
       *
       * '?dlcenv=1' is the control and it is worth looking at once: at the shell's own
       * envMapIntensity the chrome collapses to near-black, which is the round-1 dark-grey arm.
       */
      chrEnv: shellKnob('dlcenv', opts.chrEnv ?? 2.0),
      /*
       * ===== CHROME SURFACE CHARACTER — the round-3 headline. See the two long blocks in
       * RRW_BODY (machining) and above RRW_MAPS (resolving power) for what each does and why
       * neither could be reached from the levels that were already swept.
       *
       * '?dlcturn=0&dlccon=1' is the exact revert of the pair, and each reverts on its own.
       */
      /*
       * MEASURED, mesh.animated ?solo=1&clip=merged&anim=Alert&azim=0, upper arm through its
       * ?famprobe= mask (`harness/_mat4_regions.mjs`), against the art's own upper-arm box
       * (`harness/_mat4_artbox.mjs` on baseline_front.png). Every row is a capture:
       *
       *                                        p05    med    p95   spread   R-B
       *   pre-round                           103.8  127.5  214.5   110.7    11
       *   + machining only (dlccon=1)         103.1  130.7  217.3   114.2    11
       *   + one-sided curve, con 3.0           75.9  125.2  217.3   141.4     5
       *   + one-sided curve, con 4.0 SHIPPED   64.0  118.3  215.5   151.5     7
       *   + one-sided curve, con 5.0           54.4  120.1  217.3   162.9     2
       *   ART                                  57.4  120.3  221.3   163.9     9
       *
       * ⚠️ con 5.0 IS THE BEST-SCORING VARIANT AND IT IS NOT WHAT SHIPS. It lands the art's
       * spread to within a point and its median to within 0.2 of a level, and at figure scale it
       * photographs as a near-black ribbed tube where the art has a mid satin one — the p05/p50/
       * p95 triple cannot tell a smooth gradient from a bimodal one, and at con 5 the arm is
       * bimodal. It also costs the hue: R-B falls to 2 against the art's 9, because crushing a
       * pixel toward black takes its chroma with it. 4.0 is where the crops still read as one
       * turned surface. This is the fourth round on this character in which the best-scoring
       * variant was the wrong picture, and the number is quoted here rather than the win.
       *
       * ⚠️ AND THE MACHINING IS DOING A SECOND JOB THAT WAS NOT THE REASON FOR BUILDING IT.
       * '?dlcturn=0' at con 4-5 is worth one capture: the curve alone delivers the dark core, and
       * that core arrives as a VISIBLE POLYGON MOSAIC. This body is 10,378 triangles with
       * per-vertex normals, so any sharp response to normal direction paints the tessellation —
       * the same mechanism that made uRRWSeamNear unshippable. The machining's own high-frequency
       * normal perturbation breaks the mosaic up. The two features are therefore not independent
       * and must not be tuned apart: raising the exponent without the machining puts the polygons
       * straight back.
       */
      /*
       * ===== ROUND 4: THE PITCH WAS THE DEFECT, AND DEPTH IS A DECOY LEVER =====
       *
       * The round-3 values (turn 1.0 / pitch 0.013 / depth 0.00035) photographed as a CORRUGATED
       * SCREW THREAD — a dryer hose, not machined metal. It is the loudest object in the frame on
       * both side elevations and it is plainly visible at 6x. Round 3 had already chased this
       * with DEPTH, from 0.0012 down to 0.00035, and the note below records that as the fix. It
       * was not the fix, and the reason is structural:
       *
       * ⚠️ uRRWChrDepth SCALES THE NORMAL AND NOTHING ELSE. The roughness swing (uRRWChrRgh) and
       * the albedo swing (the 0.055 term) are both multiplied by rrwCAmp, which is turn x mask x
       * AA and carries NO depth. So half the ribbing is completely deaf to the knob round 3 spent
       * itself on. Measured: halving depth at the shipped pitch moved upper-arm edge density
       * 65.6 -> 55.3, about a sixth of the way to the art, and the picture still read as a thread.
       * That is why four consecutive depth reductions each looked like they should have worked.
       *
       * THE PITCH IS THE LEVER, and the whole of its useful range is a narrow band just above a
       * CLIFF. Swept on mesh.animated ?solo=1, upper arm through its ?famprobe= mask minus the
       * ?famprobe=none detail furniture (harness/_turn1_ribs.mjs), at turn 1.0:
       *
       *   pitch (m)   0.013   0.010   0.009   0.008   0.007   0.0065   0.0045
       *   density      65.6    56.3    48.4    35.5    23.0     18.2     18.2
       *   aniso        1.37    1.21    1.12    0.88    0.65     0.47     0.47
       *
       * ⚠️ 0.0065 AND 0.0045 ARE NOT SETTINGS, THEY ARE THE FEATURE SWITCHED OFF. They reproduce
       * '?dlcturn=0' to the decimal in every column. Four points of an earlier sweep landed below
       * the cliff and returned four IDENTICAL rows, which is the only reason it was caught — a
       * single point down there would have read as a spectacular win. The cause is the AA fade:
       * rrwCPer is metres-of-pitch over metres-of-surface-per-screen-pixel, and on a limb seen at
       * a grazing angle that denominator is far larger than the flat 1.9 mm/px the block above
       * quotes, so the smoothstep(1.6, 3.2) bottoms out at a pitch three times coarser than the
       * flat arithmetic predicts. ANY new value here must be A/B'd against '?dlcturn=0' before it
       * is believed.
       *
       * SHIPPED 0.0075 / 0.00021 / turn 0.8, and the depth holds the round-3 flank angle of about
       * 1.5 degrees (0.00021 over 0.0075) so the tooling keeps its physical proportions.
       * Delivered against the art's own upper-arm boxes, all four angles, art beside render:
       *
       *                        azim 0   azim 90  azim -90  azim 180  |  ART (4 sheets)
       *   aniso, before          1.39      1.65      1.42      1.43  |  0.71 0.58 0.39 0.80
       *   aniso, SHIPPED         0.73      0.60      0.69      0.93  |
       *   density, before        60.1      59.5      65.9      61.7  |  5.9  3.8  2.1  5.6
       *   density, SHIPPED       22.6      18.3      26.9      29.1  |
       *
       * ⚠️ READ ANISO, NOT DENSITY, AND THE ART'S DENSITY COLUMN IS NOT A TARGET. The art sheets
       * are a softer source than a 1080p capture: the render's THIGH, which is smooth white plate
       * carrying no machining at all, reads 10.7-17.1 against the art thigh's 10.1-13.3, so the
       * render starts with a density floor the art does not have. Aniso is |dI/dy| over |dI/dx|
       * inside the region, a ratio taken WITHIN one image, so it survives that difference. It is
       * also the number that actually says "thread": circumferential tooling is the only thing on
       * this figure with a preferred direction. The art's arm has none (0.39-0.80, i.e. at or
       * below 1). Before, the upper arm was the ONLY region on the render above 1.3 at every
       * angle. After, it sits inside the art's band at three angles of four.
       *
       * ⚠️ THE DISAGREEING SETTING, NAMED: azim 180 (the back) lands aniso 0.93, above the art's
       * 0.80 ceiling. It disagrees at every pitch tried and it is the last angle to come down; it
       * is quoted here rather than dropped. Pushing pitch below 0.0075 to close it walks into the
       * cliff above — 0.007 buys 0.65/-90 but is already 60% of the way to the feature being gone.
       *
       * TURN IS A WEAK LEVER ONCE THE PITCH IS RIGHT and is deliberately left high. At pitch
       * 0.0075, turn 0.8 vs 0.65 moves aniso by 0.02-0.03 at every angle — inside the noise — so
       * there is no reason to pay amplitude for it, and amplitude is what the block above says
       * breaks up the polygon mosaic for the callers that still run chrCon 4.0. Held at 0.8 the
       * normal perturbation is 78% of what round 3 delivered before the AA fade.
       *
       * ⚠️ AND THE MOSAIC CLAIM ABOVE DID NOT REPRODUCE, which is recorded because it is the one
       * thing that could make this unshippable elsewhere. Forced to '?dlccon=4' — verified to be
       * ACTING, upper-arm p05 falls 49.7 -> 27.3 while median and p95 hold, which is the one-sided
       * curve working — the mosaic did not appear at these values, and it did not appear at
       * '?dlcturn=0&dlccon=4' either, where the block above predicts it plainly. So either the
       * mosaic needs the room environment that mesh.animated does not have, or it has since been
       * fixed elsewhere. It was NOT re-verified in game.play or on the hunter stages, which are
       * the callers that actually run chrCon 4.0 and which this round was not allowed to open.
       * If a mosaic turns up there, raise chrTurn back toward 1.0 FIRST — it is nearly free here.
       *
       * '?dlcpitch=0.013&dlcdepth=0.00035&dlcturn=1' is the exact revert to round 3.
       */
      chrTurn: shellKnob('dlcturn', 0.8),
      chrPitch: shellKnob('dlcpitch', 0.0075),
      /*
       * ROUND 3'S NOTE, KEPT because its sweep is still true and still worth not repeating:
       * 0.35 mm of height over a 13 mm pitch — a flank slope of about 1.5 degrees. Swept at
       * 0.0012 / 0.0009 / 0.0004 / 0.00035: the first two photograph as KNURLING at figure scale,
       * which the art's chrome plainly is not (its arms and waist girdle are smooth satin and
       * their measured spread comes from the dark core, not from surface). Below 0.0003 the
       * mosaic starts coming back through. This is the smallest amplitude that still hides it.
       * Round 4 keeps its FLANK ANGLE and not its number: the pitch moved, so 0.00021 over 0.0075
       * is the same 1.5 degrees, and the "below 0.0003" floor was a floor on the RATIO, not on
       * the millimetres. See the round-4 block above for why this knob could not have fixed the
       * thread on its own.
       */
      chrDepth: shellKnob('dlcdepth', 0.00021),
      chrRgh: shellKnob('dlcrgh', 0.08),
      chrCon: shellKnob('dlccon', opts.chrCon ?? 4.0),
      /*
       * THE PIVOT IS WHERE THE MEDIAN SITS, WHICH IS WHY THE MEDIAN BARELY MOVES. Swept at
       * exponent 2 over pivots 1.5 / 2.2 / 3.0, the upper-arm median read 129.6 / 109.6 / 91.8
       * against an unaffected 130.7 — so the median radiance of this mask is ~1.6 and a pivot
       * there leaves the middle of the distribution alone while the low tail is pulled down.
       * p95 held at 217.3 in every one of those runs, which is the one-sidedness working.
       */
      chrPiv: shellKnob('dlcpiv', 1.6),
      /*
       * THE CHROME LUMINANCE FLOOR. The mechanism is argued in full in RRW_MAPS; this is the
       * VALUE, and the value is chosen by one property: a max() placed BELOW a distribution is
       * arithmetically incapable of moving it, so the floor has to sit under the studio's chrome
       * radiance and over the game's. What makes that gap wide enough to aim at is a fact about
       * the two CALLERS, and it is worth knowing before touching this number:
       *
       * ⚠️ THE STUDIO HAS ALREADY BEEN EXEMPTED FROM THE CURVE AND THE GAME HAS NOT. Read
       * 'views/mesh-animated.js': under the default '?meshlight=1' it calls this function with
       * chrCon 1.0 and chrEnv 2.95 — the curve OFF and the environment RAISED, its own comment
       * saying 2.95 is "the level the curve was suppressing". 'characters/mesh-avatar.js', which
       * is what 'game.play' plays, passes neither and gets the defaults: chrCon 4.0, chrEnv 2.0.
       *
       * So the view John judges the art bar on does not run the operator that is deleting the
       * limbs in the view he plays, and the gap this floor aims at is wide because of it: studio
       * chrome radiance is uncrushed and mostly well above 1, while in the estate the fourth
       * power has put it two to three orders below that.
       *
       * ⚠️ BUT THE CALLER IS NOT THE DISCRIMINATOR, THE ROOM IS, AND THE OBVIOUS CONTROL SAYS SO.
       * '?meshlight=0' hands mesh.animated the game's exact chrome settings — chrCon 4.0, chrEnv
       * 2.0 — and it was captured expecting black limbs in the cyc. THEY DO NOT GO BLACK. They
       * read as mid-grey satin metal, and dlcfloor barely touches them. The reason is the whole
       * point of this block: uRRWChrPiv is an ABSOLUTE level, so what the curve does to a
       * fragment depends on the RADIANCE IT GATHERED and not on who configured it. Against a
       * near-white cyc a chrome fragment gathers more than the pivot and the curve is the
       * identity by construction; against a candle-lit gallery it gathers a fraction of it and
       * the fourth power is a delete. Turning the curve off in the studio is therefore belt and
       * braces on a view that was never in danger, and the two settings together made the
       * disagreement look like a caller difference when it is an ENVIRONMENT difference.
       * Do not "reproduce the bug in the studio" by copying flags across; it cannot be done.
       *
       * ⚠️ SWEPT IN BOTH PLACES, because this is precisely the knob whose whole purpose is to
       * behave differently in the two, so a sweep in either one alone proves nothing. The
       * arithmetic above predicts where the floor BITES; it does not predict how much lift the
       * game needs, because the radiance goes through the BRDF, the tonemap and the grade before
       * it is a pixel — measured, 0.045 of floor moved a black forearm by 1.8 levels.
       *
       * STUDIO, 'mesh.animated?solo=1&bg=ff00ff&azim=0', _kit8_shellvalue vs baseline_front,
       * cut 45 — and GAME, 'game.play?mesh=1&quality=medium&seed=s4' at 6.2 s, p10 of a fixed
       * box on the shin and on the forearm (harness/_rd1-legcontrast.mjs):
       *
       *   floor    studio spread   studio legs spread  |  shinL p10   forearm p10
       *   0            168.0            153.2          |     7.0          1.4
       *   0.045        168.0            153.2          |     7.0(-)       3.2
       *   0.2          167.7            153.2          |      —            —
       *   0.6          166.7            149.8          |    35.4         29.5
       *   1.5          158.4            144.4          |    71.2         38.9
       *   5.0          152.0            133.9          |      —            —
       *
       * 0.6 is the knee: the game's dark limbs come back off the floor by 5x and 21x while the
       * studio pays 1.3 of whole-figure spread (0.8%) and 3.4 on the legs (2.2%). 1.5 buys a
       * little more game and costs seven times as much studio. Below 0.2 the studio is
       * BYTE-IDENTICAL and the game is barely touched — that is the honest zero-cost setting if
       * anyone decides 2.2% of leg spread is too much to spend, and it is why this is a knob.
       *
       * '?dlcfloor=0' is the exact revert of the entire feature, and it is the control every
       * claim about it is quoted against. ⚠️ A no-op is also what a DEAD uniform looks like:
       * '?dlcfloor=5' is the ALIVENESS control and it must wreck the studio (dark<120 30.5% ->
       * 19.4%). Watch that one fail before believing any "unchanged" above.
       *
       * SCALED BY (1 - grime), which is 'mintCap()'s rider and it is here for the same reason:
       * 'hunter.js' builds its rider from this same shellWhite() at grime 0.22, and a corrupted
       * robot that will not go dark is a worse bug than a player that does. The player is
       * grime 0, so this multiplies by exactly 1 and none of the numbers above move.
       */
      chrFloor: shellKnob('dlcfloor', 0.6) * Math.max(0, 1 - o.grime),
      /*
       * RUBBER — the feet. "Dark grey rubber-like material for wear." The distinguishing property
       * is NOT its value, it is that it is a DIELECTRIC: metalness 0 and a high roughness. Given
       * the same albedo at metalness 0.85 the boot reads as dark chrome, which is a different
       * part of the spec entirely.
       */
      /*
       * 0.28, AND IT WAS SWEPT. Foot median as a ratio of the SHIN — the white plate immediately
       * above it on the same limb, so the comparison is free of pose and exposure
       * (`harness/_mat4_regions.mjs`, masks from ?famprobe=):
       *
       *   dlralb      0.28   0.36   0.46   0.60
       *   foot/shin   0.66   0.76   0.86   0.97
       *
       * 0.46 and 0.60 photograph as an off-white boot with dirt in its creases, not as a
       * material; 0.28 is the first setting where the boot reads as grey RUBBER against the
       * white shin, which is what the spec asks for. It is not driven lower: the sole and the
       * toe cap already fall to luma 35 from occlusion alone, and a darker base takes them to
       * black, which reads as a hole rather than as tread.
       */
      rubAlb: shellKnob('dlralb', 0.28),
      rubMetal: shellKnob('dlrmetal', 0.0),
      rubRough: shellKnob('dlrrough', 0.72),
      /*
       * THE INNER-THIGH FACING TEST. The band is on dot(worldNormal, inboard): 0.10 starts the
       * ramp just past a surface that faces straight down the leg, 0.45 is fully inboard at
       * about 63 degrees off. `?dlinner=0` leaves the thighs white and is the clean A/B; the
       * CONTROL is a negative value, which flips the axis and chromes the OUTER thigh instead.
       */
      inner: shellKnob('dlinner', 1.0),
      innerBand0: shellKnob('dliband0', 0.10),
      innerBand1: shellKnob('dliband1', 0.45),
      /*
       * THE THIGH SEAM and THE FOOT SOLE — both corrections dated 2026-08-16 in
       * `docs/design/player-material-spec.md`, and both pure DIRECTION tests, so both are
       * reachable without the aBoneLocal attribute. See their blocks in RRW_BODY.
       *
       * '?dltseam=0' and '?dlsole=0' are the two exact reverts.
       */
      tseam: shellKnob('dltseam', 1.0),
      tseamW: shellKnob('dltseamw', 0.10),
      tseamD: shellKnob('dltseamd', 0.55),
      tseamO: shellKnob('dltseamo', 0.45),
      sole: shellKnob('dlsole', 1.0),
      soleBand0: shellKnob('dlsoleb0', 0.05),
      soleBand1: shellKnob('dlsoleb1', 0.55),
      /*
       * ===== THE JOINT CREASES — the first feature indexed by POSITION ALONG A BONE =====
       * `docs/design/player-material-spec.md`'s five "dark ring ... in a crease" lines. See
       * rrwBoneDetail() for the bone-by-bone mapping and the block above RRW_BONE_PARS_VERT for
       * the mechanism. '?dlring=0' is the exact revert of the whole feature.
       *
       * ⚠️ THIS IS ALSO THE ROUND THAT IS SUPPOSED TO MOVE THE ONE NUMBER THE FAMILY ROUND SAID
       * IT COULD NOT. The darkAlb sweep above records: "cut 130 is UNDER the art at EVERY setting
       * and barely moves with this knob (29.2 -> 24.7 across the whole sweep). That deficit is
       * not an albedo problem ... the art's mid-tones are plate seams, JOINT RECESSES and panel
       * gaps, i.e. geometry and detail that a bone mask has no way to draw." The art reads
       * 30.5-33.2% under cut 130. That is this feature's target and its falsifier: if the creases
       * are drawn and that fraction does not move, they are too narrow to be structure.
       */
      /*
       * WIDTH, IN METRES OF SURFACE, AND IT IS SET AGAINST THE ONE RULE THIS PROJECT HAS ALREADY
       * MEASURED FOR CREASES: "anything under ~4 px at figure scale contributes dust rather than
       * structure" (player-material-spec.md, "what this spec does not settle").
       *
       * The figure renders about 880 px tall for a 1.7 m character — 518 px/m, so one pixel is
       * 1.9 mm. These are HALF-widths about the joint, so the solid core is 2 x 12 mm = 12.4 px
       * and the full extent 2 x 26 mm = 26.9 px.
       *
       * ⚠️ THE FIRST SETTING WAS 0.006 / 0.016 AND IT DREW NOTHING A HUMAN COULD SEE. It cleared
       * the spec's own 4 px floor on paper (6.2 px of solid core) and the capture differed from
       * the pre-round one in 0.141% of pixels — i.e. the feature was working, correctly placed and
       * completely invisible. The floor is a floor for a crease drawn on FLAT WHITE; these are on
       * a curved limb where the crease's own occlusion competes with the form shading already
       * there, and it takes about twice the width before the eye separates the two. Recorded
       * because "it is drawn and it measures" was true of the invisible version.
       *
       * ⚠️ AND THE UPPER BOUND IS TESSELLATION, NOT TASTE. At 0.018 / 0.040 the hip crease comes
       * out as a visible ZIGZAG: aBoneEnd is a per-vertex quantity, so an iso-line of it is a
       * polygon on a 10,378-triangle mesh, and the pelvis has the largest triangles on the body.
       * A LONG fade hides that (the edge is soft, so its polygonal shape is not readable) and a
       * short one at a big radius does not. That is what sets w1 - w0 at 14 mm rather than the
       * 10 mm the first setting used. '?dlringw1=0.040' is the picture of it failing.
       */
      ringW0: shellKnob('dlringw0', 0.012),
      ringW1: shellKnob('dlringw1', 0.026),
      ring: shellKnob('dlring', 1.0),
      /*
       * ⚠️ DEPTH 0.85 / 0.75 WAS BUILT, MEASURED WELL, AND IS NOT WHAT SHIPS — the failure was
       * only visible from BEHIND, which is the whole argument for the four-angle rule.
       *
       * The occlusion term multiplies the FINISHED outgoing light, so a crease costs a fixed
       * FRACTION of whatever was there. On the front that is right: the hip and knee sit on lit
       * white plate and 75% of a bright pixel is still a pixel. At azim 180 the elbow crease
       * lands on chrome that is ALREADY in shadow, and 25% of an already-dark value is black —
       * the elbow photographed as a solid black block, i.e. a hole in the arm rather than a gap
       * between two parts. Every whole-figure statistic went the right way in that build.
       *
       * Swept at azim 0 and 180 together: 0.45/0.70 loses the hip separation the round exists
       * for, 0.75/0.85 blacks the elbow, and 0.60/0.70 is indistinguishable from 0.75/0.85 on
       * the front while the elbow stays a crease. '?dlringo=0.75&dlringd=0.85' is that picture.
       */
      ringD: shellKnob('dlringd', 0.70),
      ringO: shellKnob('dlringo', 0.60),
      // "much darker" is in the spec on the hip and shoulder lines and on no others, so the two
      // strengths are a RATIO between features on one character rather than two absolute levels.
      ringJoint: shellKnob('dlringj', 0.75),
      ringDetach: shellKnob('dlringx', 1.0),
      /*
       * ===== THE CHROME JOINT CAPS — "above, below, back, front and side are chrome" =====
       * See rrwBoneDetail() for which bones and why the upper arm is deliberately not one of
       * them. '?dljoint=0' is the exact revert and leaves the dark creases in place.
       *
       * THE RADIUS IS SET FROM THE ART, not from the mesh. On `baseline_front` the knee's chrome
       * assembly spans about 7% of figure height; at 1.7 m that is a 12 cm assembly, i.e. a 6 cm
       * radius about the joint. 0.030 solid / 0.052 gone puts the solid core at half of that and
       * the fade at the art's own edge, so the cap has a soft shoulder rather than a cut line —
       * the same reason the crease carries a long fade, and the same defect if it does not: an
       * iso-line of a per-vertex quantity is a POLYGON on a 10,378-triangle mesh.
       */
      joint: shellKnob('dljoint', 1.0),
      jointW0: shellKnob('dljointw0', 0.030),
      jointW1: shellKnob('dljointw1', 0.052),
      ringCap: shellKnob('dljointw', 1.0),
      /*
       * ===== THE CALF PANEL AND THE WAIST RIDGES — the two features in the BELLY of a bone =====
       * See rrwBonePanels() for the bone rule and both blocks in RRW_BODY for the mechanism.
       * '?dlcalf=0' and '?dlridge=0' are the two exact reverts, and **'?dlcalf=-1' is the CONTROL
       * for the forward axis** — it puts the panel on the shin, which is the picture of the axis
       * being backwards. Nothing else on this character can tell you that.
       *
       * THE WINDOW, as a fraction of the shin from knee (0) to ankle (1): 0.30 -> 0.46 in,
       * 0.84 -> 0.96 out. "Closer to the Achilles tendon" puts its mass in the lower half; it is
       * stopped short of 1.0 so it does not run into the ankle crease, which is a different
       * feature the spec names separately, and short of the knee so it does not merge with the
       * chrome cap above it and read as one chrome shin.
       */
      calf: shellKnob('dlcalf', 1.0),
      calfW: shellKnob('dlcalfw', 1.0),
      calfB0: shellKnob('dlcalfb0', 0.15),
      calfB1: shellKnob('dlcalfb1', 0.55),
      calfT0: shellKnob('dlcalft0', 0.30),
      calfT1: shellKnob('dlcalft1', 0.46),
      calfT2: shellKnob('dlcalft2', 0.84),
      calfT3: shellKnob('dlcalft3', 0.96),
      /*
       * PITCH 22 mm, AND IT IS SET BY THE CAMERA RATHER THAN BY THE ART. At 518 px per metre a
       * 22 mm pitch is 11.4 screen pixels, so a groove and a crest each get about 5 px — the
       * minimum at which a repeating pattern reads as ribbing instead of as grey noise, and
       * comfortably clear of the 3 px band-limit that fades it out. A finer, more machine-like
       * pitch is available (?dlridgep=0.012) and photographs as a smear at this figure size.
       */
      ridge: shellKnob('dlridge', 1.0),
      ridgeW: shellKnob('dlridgew', 1.0),
      ridgeP: shellKnob('dlridgep', 0.022),
      ridgeD: shellKnob('dlridged', 0.45),
      /*
       * ===== HEAD VENTILATION AND THE TWO WRIST RINGS =====
       * "Back of the head, where it meets the neck: chrome panel with ventilation." and
       * "Wrist: two chrome rings." '?dlvent=0' and '?dlwrist=0' are the exact reverts.
       *
       * ⚠️ THE WINDOW WAS SET BY EYE AGAINST A FORKED BONE AND IT WAS WRONG. IT IS MEASURED NOW.
       *
       * `Head` is one of this rig's FORKED bones: it has two children, head_end and headfront, and
       * `boneAxisTable` in mesh-avatar.js takes its axis as their MEAN. `_head4-vent.mjs` prints
       * that mean in the head's own bind frame and it is (-0.014, 0.679, 0.734) — 47 degrees up
       * and 47 degrees FORWARD at once. So t is not "how far up the skull" at all; a band of
       * constant t is a plane tilted halfway onto the face, and the old window (-0.05, 0.02, 0.30,
       * 0.46) was chosen against that by looking.
       *
       * The same probe reports where the parts of the skull actually land in t, over the 639
       * head-dominant vertices, in BIND space:
       *
       *   occiput (back-facing, lower 45% of the skull)   t 0.000..0.058, median 0.000
       *   temple  (not back-facing, mid skull)            t 0.382..0.915, median 0.677
       *   the OLD window's full-strength body t 0.02..0.30 has a back-facing median of 0.155
       *
       * The occiput reads t = 0 EXACTLY because of the CLAMP, not because of where it is — see the
       * block in RRW_BONE_VERT. Unclamped, the same probe bins the back-facing head vertices by
       * height and the fraction is monotone all the way down:
       *
       *   height above the neck joint   0-20%   20-40%   40-60%   60-80%   80-100%
       *   unclamped fraction (median)  -0.317   -0.169    0.046    0.263    0.477
       *
       * So the window is authored in NEGATIVE t, which is what the panel's own position actually
       * is. Fully open below -0.70 (nothing on this skull reaches -0.45, so the in-ramp is only a
       * fail-safe against a taller head), closing over -0.20..0.02 — which holds the whole of the
       * bottom fifth, most of the second, and nothing from 40% up. The BOTTOM edge needs no ramp
       * at all: a neck vertex carries rrwPan.x = 0 and the membership falls to zero across the
       * boundary triangle on its own, the argument already made in the vertex block.
       *
       * '?dlventt0..t3' still set all four by hand, and the pre-2026-08-17 window is one URL away —
       * '?dlventkeep=0&dlventt0=-0.05&dlventt1=0.02&dlventt2=0.30&dlventt3=0.46' is BYTE-FOR-BYTE
       * the old capture, which is this round's revert control and was checked as bytes, not by eye.
       *
       * THE RING SPACING is 12 mm and 40 mm from the wrist joint at a 10 mm half-width, so the
       * pair spans 5 cm of a 25 cm forearm — two distinct rings with white between them at figure
       * scale. Wider and they merge into the chrome cuff the spec does not ask for.
       */
      /*
       * 🚨 DEFAULT 0 — THE FEATURE IS BUILT AND CORRECT AND IT IS OFF, BECAUSE IT IS ON THE WRONG
       * PART. Read this before switching it back on.
       *
       * The mechanism works: the round that shipped it root-caused two real bugs (the `Head` bone
       * is FORKED and its mean axis leans 47 degrees forward, and `clamp(aBoneEnd.x / len, 0, 1)`
       * was flattening the whole occiput to a constant so no window could place anything there;
       * separately `rrwNotHead` was erasing nine tenths of the panel). Seam density on the head
       * went 7.4 to 11.0 against the art's 11.5 — on the art, from 4 short.
       *
       * ⚠️ BUT THE PICTURE IS WORSE AND THE ART SAYS WHY. `...\scratchpad\SHEET_head6x.png`, art
       * beside before beside after: the ART'S SKULL IS CLEAN WHITE. Its dark venting sits BELOW
       * the skull, on the NECK COLUMN, at the junction — which is a different part, and one this
       * project already builds as kit geometry (`neckColumn` / `neckRib0..2` in
       * `mesh-identity.js`). Ours puts a dark chrome gouge on the side of the cranium, which
       * reads as damage. The spec line is "back of the head, WHERE IT MEETS THE NECK"; the art
       * resolves that phrase toward the neck and we resolved it toward the head.
       *
       * It also costs 7 pp of head value (dark<120 32.2% -> 39.3% against the art's 15.3%), and
       * that cost is the chrome field itself, not the slots — ablated, the slots are 0.67 pp of
       * it. A metal has no diffuse term, so a chrome patch on a skull turned from the key is a
       * grey hole in a white shell. Same physics as `uRRWChrFloor`, arriving on a new part.
       *
       * ⚠️ AND THE 'HEAD IS TOO DARK' DEFECT IT WAS PAIRED WITH IS NOT A WEATHERING PROBLEM —
       * that was disproved by control: zeroing `uRRWOn`, the master for the ENTIRE injection,
       * moves head dark<120 by 0.57 pp against a 17-point miss. The cranium already matches the
       * art. The excess is a midtone slab on the jaw/ear wedge of a head turned ~30 degrees out
       * of the art's dead-on view, i.e. substantially a POSE artefact of comparing `Alert`
       * against a neutral reference. Do not invent a head tone curve to move that number.
       *
       * '?dlvent=1' restores it exactly as built, for anyone re-siting it on the neck column.
       */
      vent: shellKnob('dlvent', 0.0),
      ventW: shellKnob('dlventw', 1.0),
      ventP: shellKnob('dlventp', 0.016),
      ventT0: shellKnob('dlventt0', -0.90),
      ventT1: shellKnob('dlventt1', -0.70),
      /*
       * ⚠️ THE OUT-RAMP IS SET BY VALUE COST, NOT BY TASTE, AND THE WIDER WINDOW WAS MEASURED
       * FIRST. At (-0.20, 0.02) the panel holds the bottom TWO fifths of the back of the skull and
       * harness/_head1-uni.mjs ablates it at NINE AND A HALF POINTS of head dark<120 — and of that,
       * uRRWRidge (the slots) is 1.06 and the rest is the chrome field itself. A metal has no
       * diffuse term, so a chrome patch on a surface turned away from the key is a grey hole in a
       * white skull, and this head was already the figure's worst region for exactly that
       * complaint. So the window closes over -0.34..-0.16, which is the bottom fifth alone — the
       * literal reading of "where it meets the neck" — and the slots and the panel edge still
       * read while the field costs a fraction of what it did.
       */
      ventT2: shellKnob('dlventt2', -0.34),
      ventT3: shellKnob('dlventt3', -0.16),
      // 1 = the head's own panel and slots survive the head-clean mask; 0 is the exact revert of
      // that alone, leaving the window change visible on its own. See uRRWVentKeep in RRW_PARS.
      ventKeep: shellKnob('dlventkeep', 1.0),
      // The panel's upper edge, in head skin weight — see uRRWVentH. '?dlventh1=9' removes the
      // bound and restores the whole-skull rib cage, which is the picture that put it here.
      ventH0: shellKnob('dlventh0', 0.86),
      ventH1: shellKnob('dlventh1', 0.98),
      wrist: shellKnob('dlwrist', 1.0),
      wristW2: shellKnob('dlwristw2', 1.0),
      wristAt0: shellKnob('dlwrista0', 0.012),
      wristAt1: shellKnob('dlwrista1', 0.040),
      wristW: shellKnob('dlwristw', 0.010),
      // THE CONTROL. See RRW_BONE_VERT: 1 moves every crease to the middle of its own bone.
      ringCtl: shellKnob('dlringctl', 0.0),
      /*
       * ⚠️ DEFAULT 0, AND IT IS OFF BECAUSE IT WAS TRIED AND IT FAILED — see uRRWSeamNear in
       * RRW_BODY for what it computes. On paper a broad structural shade is the cheap way to
       * buy darks; on THIS mesh it is not, and the capture says so in one glance. rrwSGeo comes
       * from screen-space curvature, and on a 10,378-triangle mesh with per-vertex normals
       * curvature is very nearly piecewise constant PER TRIANGLE — so darkening by it paints
       * the tessellation. At 0.35 the pelvis and thighs come out as a visible polygon mosaic
       * and facet energy went UP to 17.9-18.7, i.e. back to exactly the number this round
       * exists to fix. Kept as a knob because it is the control for that claim.
       */
      seamNear: shellKnob('rseamnear', 0.0),
    });
  }
  return m;
}

/** Chrome-satin structural metal: limbs, joints, ear discs, ankle stacks. */
export function chromeSatin(opts = {}) {
  const o = { tint: C.chrome, lines: 1.0, wear: 0.4, grime: 0.0, size: 512, ...opts };
  const m = baker().standard({
    key: `rrchrome:${JSON.stringify(o)}`,
    size: o.size, surface: CHROME_SURFACE,
    heightScale: 0.005, normalStrength: 1.0, anisotropy: 8,
    uniforms: {
      uTint: new THREE.Vector3(...o.tint), uLines: o.lines, uWear: o.wear, uGrime: o.grime,
    },
    // A metal has no diffuse term: it is ONLY what it reflects. At envMapIntensity 1
    // against this environment the limbs read as dark grey against the white shells, which
    // side by side with the art looks like a different character. The art's structural
    // metal is bright satin, so it needs to gather considerably more of the environment.
    // Filth is the exception: soot does not reflect, so a grimy limb gathers less.
  }, {
    envMapIntensity: 2.4 - o.grime * 1.3,
    normalScale: new THREE.Vector2(0.4 + o.grime * 0.4, 0.4 + o.grime * 0.4),
  });
  // CHROME_SURFACE's own note — "filth does not stop at a material boundary" — applies to the
  // gravity layer as much as to the baked soot. The armpit and the knee crevice are BOTH
  // families meeting at a crease, and a crease that pools on one side of the seam and not the
  // other is worse than no pooling at all. `metal: true` so pooled soot kills metalness under
  // it rather than merely darkening the reflection.
  if (weatheringEnabled()) {
    applyWeathering(m, {
      family: 'chrome', debug: weatheringDebug(), strength: 0.9, grime: o.grime, tint: o.tint,
      lift: 2.4, cleanRough: 0.30, metal: true, occ: shellKnob('occ', 0.62) * 0.75,
    });
  }
  return m;
}

/** Mint shoulder caps — satin, the dullest family on the character. */
export function mintCap(opts = {}) {
  // TINT IS COMPENSATED, ON PURPOSE. Authoring the sheet's literal #8FC9BD here was
  // verified — by reading the baked albedo texture back off the GPU — to bake exactly
  // #8FC9BD, so this is not a bake bug. But the composite pass tonemaps, and tonemapping
  // desaturates bright values hard: the cap's lit face measured green-minus-red 17 in the
  // render against 38 measured on the sheet itself, i.e. the pipeline compresses the mint's
  // chroma by about 3x. Since the sheet's own studio lighting is what `studio()` reproduces
  // and the grade/tonemap are shared Tier 0 code, the only lever on this side is the albedo.
  // C.mint above stays as the documented reference value; this is the one that renders as it.
  const o = { tint: C.mintLit, grime: 0.0, crack: 0.0, size: 256, ...opts };
  const m = baker().standard({
    key: `rrmint:${JSON.stringify(o)}`,
    size: o.size, surface: MINT_SURFACE,
    // a crack is a real groove, not a painted line — it needs enough height range to
    // catch a shadow edge, which is what makes it read as broken rather than drawn on.
    heightScale: 0.004 + o.crack * 0.020, normalStrength: 1.0, anisotropy: 4,
    uniforms: {
      uTint: new THREE.Vector3(...o.tint), uGrime: o.grime, uCrack: o.crack,
    },
  }, {
    // NO clearcoat, and a deliberately quiet environment response. Both are the manifest's
    // "matte-satin, noticeably less reflective than the white shells", and both matter for
    // the COLOUR as much as the finish: a clearcoat lays a broad white specular lobe over
    // the base, and a near-white studio environment reflected at full strength does the
    // same, and together they were desaturating the cap from #8FC9BD to a grey-green that
    // measured green-minus-red 17 against the sheet's 38. The mint is the character's
    // signature colour — it has to survive the studio lighting the sheet itself uses.
    clearcoat: 0.0,
    envMapIntensity: 0.55,
    normalScale: new THREE.Vector2(0.25 + o.crack * 0.75, 0.25 + o.crack * 0.75),
  }, THREE.MeshPhysicalMaterial);
  /*
   * ===========================================================================================
   * THE TEAL HAS TO SURVIVE AT GRAZING ANGLES — John, on the round-2 build: *"Both the shoulder
   * cap should be completely teal but they only show as teal from the front."*
   *
   * THE MECHANISM, because the obvious diagnosis is the wrong one. The caps had been narrowed to
   * a front/outer wedge and that IS being reverted (see `shoulderCap` in `mesh-identity.js`), but
   * coverage alone does not explain the complaint: the round-1 cap covered the back and John's
   * reading of the ART is that both caps are completely teal, which means the back of a full cap
   * still was not reading as mint. A domed cap's top and rear turn away from the key, their
   * diffuse term goes to near zero, and what is left is this material's deliberately QUIET
   * environment response — envMapIntensity 0.55, no clearcoat, both argued for at length above
   * because a near-white studio reflected at full strength desaturates the mint to grey-green.
   * A pixel at luma 20 carries no hue whatever its albedo is, so the cap loses its colour exactly
   * where it loses its light.
   *
   * WHY EMISSIVE AND NOT MORE ENVIRONMENT. They are the two ways to lift an unlit face and they
   * are not equivalent. The environment here is near-WHITE, so every unit of it desaturates —
   * that is the measured 3x chroma loss this function's tint compensation exists for, and raising
   * 0.55 would spend the fix on undoing the fix. An emissive at the cap's OWN tint adds the mint
   * hue itself: it is negligible against a lit face (which is an order of magnitude brighter) and
   * it is the whole of an unlit one, so it raises chroma precisely where chroma has collapsed.
   *
   * SCALED BY (1 - grime), so the hunters are untouched at the top of their ramp: the stage-3
   * cap is meant to read as a dead, sooted green and a glow floor would fight the block above
   * that darkens it. The rider's 0.18 keeps 82% of it.
   *
   * '?capgraze=0' is the exact revert — emissiveIntensity 0 is the pre-round material.
   * ===========================================================================================
   */
  const graze = shellKnob('capgraze', 0.11) * Math.max(0, 1 - o.grime);
  if (graze > 0) {
    m.emissive = rrwLinear(o.tint);
    m.emissiveIntensity = graze;
  }
  // The caps ARE the upward-facing proud surface the brief calls out — shoulder tops — so most
  // of what this does here is SCOUR rather than deposit, which is why the deposit strength is
  // the lowest of the three. The mint is the character's signature colour and the layer is a
  // value multiply, so the hue survives whatever the value does.
  if (weatheringEnabled()) {
    applyWeathering(m, {
      family: 'mint', debug: weatheringDebug(), strength: 0.8, grime: o.grime, tint: o.tint,
      lift: 2.4, cleanRough: 0.42, metal: false,
    });
  }
  return m;
}

/** The faceplate: dark blue glass with the emissive face light behind it. */
/**
 * ROUND 28, ITEM 7 — "wide pill-shaped eyes nearly touching, versus the reference's
 * rounder, clearly separated eyes with thin light brow arcs."
 *
 * MEASURED off `Dev Art/1785277053522.png`, front figure, by thresholding the lit cyan
 * against the blue glass rather than by eye. In source pixels:
 *
 *   left eye    x 217..229 (w 13)   y 156..170 (h 15)
 *   left brow   x 215..228 (w 14)   y 150..154 (h  5)
 *   mouth       x 232..250 (w 19)   y 185..189
 *   blue screen x 201..279 (w 79)   y 127..208 (h 82)
 *
 * The mouth's centre (241.0) and the screen's (240.0) agree, so the face centre is 240.5
 * and the right eye is the left one mirrored. That gives:
 *   - separation-to-half-width 17.5/6.5 = 2.69, against 1.39 here (0.150/0.108)
 *   - eye aspect h/w = 1.15 — the sheet's eyes are TALLER than wide. This file's were
 *     WIDER than tall (0.086/0.108 = 0.80), which is the whole "pill" complaint.
 *   - the brow sits 11 px above the eye centre, is a hair wider than the eye, and is a
 *     thin downward-opening arc about 2 px thick with its ends dropping ~3 px.
 *
 * Converted to uv through the cap's linear-in-angle mapping (see `visorCap` in unit4h.js:
 * uv 0..1 spans +/-54 deg, the screen itself only +/-49 deg) and de-projected through
 * sin(a) for the sphere, which is what stops the edge compression being baked in.
 *
 * uEyeY is left near where it was: the sheet's eye centre is 11% of the screen's half
 * height above its middle and this file already had 13%. Vertical placement was not the
 * defect. The mouth is untouched for the same reason and because it is a difference of
 * two circles that straightens into a dash if the map is scaled anisotropically.
 */
export function faceplate(opts = {}) {
  /*
   * ===========================================================================================
   * FACE POP — ROUND 33. THE POLARITY WAS INVERTED, AND THE FIX IS THE SCREEN, NOT THE EYES.
   *
   * The art is a DARK visor with LIT eyes glowing out of it. This plate had become a PALE panel
   * with eyes that barely rose above it — the single most identifying thing on the character,
   * reading as switched off. Measured with harness/_face1-pop.mjs, which SEGMENTS the visor by
   * blue chroma rather than taking a crop box (see below for why that distinction is the whole
   * ballgame), over the front elevation:
   *
   *                                 screen median      eye p90        POP        tilt top-bot
   *     art, baseline_front.png         0.409           0.708       +0.299          +0.002
   *     render, round 32                0.654           0.741       +0.087          -0.112
   *
   * 🚨 READ THE EYE COLUMN BEFORE TOUCHING ANY EMISSIVE. The render's eyes were ALREADY BRIGHTER
   * than the art's — 0.741 against 0.708. Not one part of this defect was a dim eye. The entire
   * 3.4x deficit is the SCREEN sitting 0.245 too high, so raising emissive would have made the
   * measurement worse in the only place it was already passing, and would have clipped the eye
   * to a flat white blob on the way. `emissiveIntensity` is therefore UNCHANGED at 2.95 and
   * `?faceeye` exists only so that claim has a control.
   *
   * WHAT WENT WRONG, and it is a compensation that overshot rather than a wrong idea. Round 31
   * correctly established that the sheet's screen is a lit PANEL behind glass — flat, with its
   * floor coming from inside — and added an emissive floor graded to lift the jaw and the rim
   * where the studio environment fails. Round 32 pushed both grades harder. At 3.40/3.10 the
   * floor is no longer a floor: at the bottom of the plate it delivers 0.466 x 2.95 = 1.375 of
   * emissive against the eye's 2.95, i.e. the screen had climbed to within a factor of two of
   * the eyes, and the tilt had gone 0.112 PAST flat in the opposite direction. The plate was
   * being lit from inside about as hard as its own eyes were.
   *
   * SO THE LEVER IS A RATIO AND IT IS TAKEN OUT OF THE SCREEN. Four terms move together, and
   * each has its own knob because each needed its own ablation to size:
   *   glow  the backlight floor's LEVEL
   *   low   its vertical grade — the term carrying the inverted tilt
   *   edge  its rim grade — kept proportionally higher than `low` because it is the only lever
   *         that reaches the LEFT PROFILE view, where this plate has failed eight rounds
   *   glass the albedo's own value. Worth 0.467 -> 0.395 of screen median on its own, i.e. the
   *         floor cannot reach the art by itself and this is the rest of the distance
   *
   * ⚠️ `envMapIntensity` IS NOT ON THAT LIST AND IT WAS THE FIRST THING TRIED. This file already
   * warns, above `applyUnit4HEnv`, that every envMapIntensity written here is inert in a scene
   * that sets `scene.environment` — three.js overwrites the uniform with
   * `scene.environmentIntensity` unless the material carries its own envMap — and UNIT4H_ENV has
   * no `face` entry, so the plate rides the scene. Confirmed rather than assumed: captures at
   * envMapIntensity 0 AND at 20 are both MD5-IDENTICAL to the shipped plate
   * (30f94c35fb44e838c4ef7ff3e853c8a5). An absurd value that changes nothing is the only way to
   * tell a dead lever from a weak one, and 0 alone would not have told them apart. The live
   * lever, if the plate ever needs one, is a `face` entry in UNIT4H_ENV.
   *
   * === THE SECOND HALF: THE EYES WERE THE WRONG COLOUR, WHICH ONLY THE PICTURE SAID ===
   *
   * With the screen landed the numbers were good and the face was still wrong: the art's eyes
   * are CYAN lights, and these render as WHITE pills. Every statistic above was blind to it,
   * because luma cannot see chroma — and darkening the screen made it MORE conspicuous, not
   * less, since a white blob on a dark plate is a starker white blob.
   *
   * It is the same mechanism `mintCap` documents for the shoulder caps: the pipeline tonemaps,
   * and tonemapping desaturates bright values hard. The eye is authored #7EBDF0 and driven at
   * emissiveIntensity 2.95, which puts every channel over 1.0 (R 1.46, G 2.19, B 2.78) — three
   * clipped channels are white by definition, whatever hue they started as. So the fix is the
   * same shape as `mintLit`: author the emissive MORE saturated than the target, and stop
   * driving it so far past the roll-off that the ratio between channels is destroyed.
   * `sat` pulls red out of the EMISSIVE only, never out of `uLight`, so the lit albedo and the
   * hunter's red override are untouched.
   *
   * === WHERE IT LANDED, front elevation, harness/_face1-pop.mjs ===
   *
   *                    screen    eye    POP      tilt    eyeChroma  screenChroma
   *   art               0.396   0.743  +0.347   +0.003     47.1        39.6
   *   shipped (r32)     0.642   0.806  +0.164   -0.114     21.2        43.4
   *   THIS ROUND        0.384   0.783  +0.400   -0.014     37.2        47.5
   *
   * ⚠️ AND THE HONEST REMAINDER, because this plate has shipped five variants that scored well
   * and photographed badly. The POP now OVERSHOOTS the art (+0.400 against +0.347) and the eye
   * chroma is still 21% SHORT of it (37.2 against 47.1) — side by side the eyes read as pale
   * cyan where the art's are vivid cyan, and ours are visibly larger and softer-edged, with no
   * equivalent of the art's small white specular core. The measured lit fraction says the same
   * thing from the other side: 11.0% of the plate against the art's 15.1%. What is fixed is the
   * POLARITY — dark screen, lit eyes — and that is what the round was for. The eye's SHAPE and
   * its last 10 levels of chroma are not fixed and should not be reported as fixed.
   *
   * '?facepop=0' IS THE EXACT REVERT and restores round 32 bit-for-bit. Callers that
   * hand-author `opts.face` — the hunter, whose plate glows red — get 0 and are untouched, the
   * same gate `uBrowT` and `uGlow` already use.
   * ===========================================================================================
   */
  const pop = opts.face ? 0 : shellKnob('facepop', 1);
  const fpLerp = (from, to) => from + (to - from) * pop;
  const fp = {
    /*
     * THE LANDED SET. Every one of these was swept and measured rather than chosen; the table
     * in the block above is the sweep. `glow` and `eye` are deliberately NOT independent — the
     * backlight floor is `glow * eye`, so dropping the eye's drive from 2.95 to 1.85 would have
     * darkened the screen a second time by accident. 0.045 * 2.95 = 0.1328 and
     * 0.0718 * 1.85 = 0.1328: the floor is held across that change on purpose, which is what
     * makes the two knobs separable when someone next sweeps one of them.
     */
    glow:  shellKnob('faceglow',  fpLerp(0.118, 0.0718)),
    low:   shellKnob('facelow',   fpLerp(3.40, 1.30)),
    edge:  shellKnob('faceedge',  fpLerp(3.10, 1.60)),
    glass: shellKnob('faceglass', fpLerp(1.00, 0.72)),
    // 2.95 -> 1.85 is NOT a dimming of the eyes, it is what stops all three channels clipping:
    // the delivered eye luma only moves 0.851 -> 0.783 against the art's 0.743, while measured
    // eye chroma goes 19.8 -> 37.2 against the art's 47.1. See THE SECOND HALF above.
    eye:   shellKnob('faceeye',   fpLerp(2.95, 1.85)),
    // fraction of RED pulled out of the emissive colour only. 0 is the shipped #7EBDF0.
    sat:   shellKnob('facesat',   fpLerp(0.00, 0.60)),
    /*
     * ⚠️ THE GLASS HAD TO BE DESATURATED, AND THAT IS A CONSEQUENCE OF REMOVING THE FLOOR RATHER
     * THAN A NEW TASTE CALL. C.glass was pushed to a saturated #2659A0 in round 32 against a
     * plate that was carrying a large, nearly-neutral emissive floor — the floor was washing the
     * blue out, so the albedo underneath was authored bluer to survive it. Take the floor away
     * and that compensation is left running with nothing to compensate: measured screen chroma
     * (G+B)/2 - R went 43.4 shipped -> 59.7 with the floor cut, against the art's 39.6, i.e. the
     * screen overshot from too pale straight past the art to too blue. C.glass itself is NOT
     * touched — it is the documented reference and the hunter reads it — so the grey is mixed in
     * here, at constant luma, and only under the knob.
     */
    grey:  shellKnob('facegrey',  fpLerp(0.00, 0.34)),
  };
  const face = {
    uEyeW: 0.068, uEyeH: 0.080, uEyeGap: 0.185, uEyeY: 0.055,
    // CANT, in radians, positive = inner ends DROP (a scowl). 0.0 for the player, whose eyes
    // are level and friendly by design; the hunter overrides it. Declared here rather than
    // only in the override so the uniform always exists — a baked shader reading a uniform
    // the JS never supplied is one of this project's documented silent failures, and it
    // fails by rendering something plausible rather than by throwing.
    uEyeCant: 0.0,
    // TAPER, 0 = a uniform lozenge (the player's friendly eye), higher = a blade sharpening
    // toward the nose. Same reasoning as uEyeCant for declaring it here: the uniform must
    // always exist, and the player must be untouched by a hunter-only feature.
    uEyeTaper: 0.0,
    /*
     * THE MOUTH — round 32, second pass, and it was the worst-measured feature on the whole
     * character. Sampled face-on: the render's mouth read luminance 145 against a 136 field,
     * a ratio of 1.07; the sheet's reads 199 against 122, a ratio of 1.63. It was not dim, it
     * was THIN — a stroke barely wider than its own two antialiasing skirts cannot hold a
     * value however bright the emissive behind it is.
     *
     * The sheet measures the mouth at 5 px tall on a 82 px screen (0.061 of screen height) and
     * 19 px wide on a 79 px screen. `uMouthT` 0.024 in uv is ~0.027 of screen height, i.e. the
     * stroke was under HALF the sheet's. 0.048 is the measured thickness; `uMouthW` follows the
     * measured width. Both needed the clip fix in the shader — a 0.04 constant ceiling was
     * truncating anything thicker than the old value, which is why this never showed up as a
     * simple tuning miss.
     */
    uMouthY: -0.150, uMouthW: 0.112, uMouthT: 0.048,
    // BROWS ARE A PLAYER FEATURE. Any caller that hand-authors `face` owns the whole
    // expression — the hunter's red slit override is the only one — so brows default OFF
    // for it and ON for everyone else. That is what lets this land without touching
    // `hunter.js`, which is out of scope this round, and it is also just correct: a
    // corrupted hunter with friendly eyebrows would be a worse bug than no brows at all.
    uBrowT: opts.face ? 0.0 : 0.014,
    // See THE BACKLIGHT in FACE_EMISSIVE_SURFACE. Same opts.face gate as the brows: the
    // hunter hand-authors its expression and drives `material.emissive` red.
    /*
     * ROUND 32, SECOND PASS — 0.135 -> 0.118, and it is paid straight back into
     * `emissiveIntensity` below (2.6 -> 2.95). Measured face-on the FIELD was 136 against the
     * sheet's 122 and the EYE was 194 against 211: the plate was carrying too much floor and
     * not enough stroke. The product `uGlow * emissiveIntensity` is held (0.351 -> 0.348) so
     * the backlight — including the grazing `edge` term that is the only lever reaching the
     * LEFT PROFILE view — is unchanged, while everything gated by `lit` gains 13%.
     */
    uGlow: opts.face ? 0.0 : fp.glow,
    // The backlight floor's two grade coefficients, promoted from GLSL constants so the FACE POP
    // block above can change the floor's SHAPE. They live in `face` — and therefore in the bake
    // key — so a changed grade re-bakes instead of returning a cached plate from the old one.
    uGlowLow: fp.low,
    uGlowEdge: fp.edge,
    // 0.205 is what the measurement above gives, and it renders with the brow touching the
    // eye: the emissive bleed and the two 0.008 smoothstep skirts eat the 0.020 gap that
    // the sheet has there. Raised to 0.224 so the GAP survives the glow rather than the
    // geometry being nominally right and the render reading as one blob.
    // ROUND 31 — the arcs are FLATTER and THINNER. `uBrowR` is the arc's radius, so 0.110
    // on a 0.072 half-width brow bends it through 80 degrees: it rendered as a pair of thick
    // curled hooks rather than the sheet's brows, which are near-straight strokes with only
    // a slight droop at the outer end (measured: 14 px wide, 5 px tall, i.e. an arc whose
    // sagitta is a third of its half-width, needing R ~ 0.19 at this scale). Thickness
    // drops with it — a thinner stroke on a flatter arc is the same ink, better drawn.
    uBrowY: 0.238, uBrowW: 0.076, uBrowR: 0.190,
    ...opts.face,
  };
  const b = baker();
  /*
   * ⚠️ `uGlass` IS NOT IN `face`, SO IT WAS NOT IN THE BAKE KEY. Every other input to this plate
   * rides in `face` and is stringified into the key; the glass tint was passed separately from
   * C and was constant, so nothing had ever noticed. The moment it became a function of a knob
   * that stopped being true: two values of '?faceglass' would have hashed to the SAME key and
   * the second one would have been served the first one's cached texture — a sweep that returns
   * the same picture for every setting and looks like "the knob does nothing" rather than like a
   * cache bug. It is folded into the key explicitly below.
   */
  const glassDark = C.glass.map((v) => v * fp.glass);
  // toward grey AT CONSTANT LUMA, so `facegrey` moves chroma without moving the screen median
  // that the rest of the round is holding at the art's 0.396.
  const glassLum = 0.2126 * glassDark[0] + 0.7152 * glassDark[1] + 0.0722 * glassDark[2];
  const glassTint = glassDark.map((v) => v + (glassLum - v) * fp.grey);
  const t = b.bake({
    key: `rrface:${JSON.stringify(face)}:g${fp.glass}:y${fp.grey}`,
    size: 512, surface: FACE_SURFACE,
    heightScale: 0.002, normalStrength: 0.4, anisotropy: 8,
    uniforms: {
      uGlass: new THREE.Vector3(...glassTint),
      uLight: new THREE.Vector3(...C.faceLight),
      ...face,
    },
  });
  const e = b.bake({
    key: `rrfaceE:${JSON.stringify(face)}`,
    size: 512, surface: FACE_EMISSIVE_SURFACE,
    heightScale: 0.001, normalStrength: 0.1, anisotropy: 8,
    uniforms: { uLight: new THREE.Vector3(...C.faceLight), ...face },
    // This one really IS meant to be black. It is an emissive MASK, not an albedo: the
    // only lit texels are the two eyes and the mouth arc, and the baker's black-bake
    // guard probes the four corners plus the centre — all five of which fall on unlit
    // glass between the eyes. Without this every robot in the game fails to build.
    validate: false,
  });
  const m = new THREE.MeshPhysicalMaterial({
    map: t.map,
    normalMap: t.normalMap,
    roughnessMap: t.orm,
    metalnessMap: t.orm,
    roughness: 1, metalness: 1,
    // Red pulled out for the tonemap's desaturation, see THE SECOND HALF above. `fp.sat` is 0
    // at facepop=0 and for any caller that hand-authors `opts.face`, so this is exactly
    // C.faceLight in both those cases.
    emissive: new THREE.Color(C.faceLight[0] * (1 - fp.sat), C.faceLight[1], C.faceLight[2]),
    emissiveMap: e.map,
    // 2.6 -> 2.95: see the `uGlow` note above. The hunter passes its own `opts.face` and drives
    // `material.emissive` red, so it takes the 13% on its slit and nothing else.
    // UNCHANGED at 2.95, and that is the point of the round rather than an oversight: the eyes
    // measured 0.741 against the art's 0.708 BEFORE any of this. See the FACE POP block.
    emissiveIntensity: opts.emissiveIntensity ?? fp.eye,
    // 0.04 -> 0.18 for the same reason the base roughness moved: a clearcoat that sharp
    // resolves individual environment panels and paints them across the face as hard bands.
    // The hunter already overrode this to 0.16 by hand, which is corroboration rather than
    // coincidence — the sharp value never survived contact with a render.
    clearcoat: 1.0, clearcoatRoughness: 0.18,
    // Left at 1.0 and NOT made a knob: measured inert in every view that sets scene.environment.
    // See the envMapIntensity note in the FACE POP block for the two captures that prove it.
    envMapIntensity: 1.0,
  });
  m.name = 'unit4h.faceplate';
  return m;
}

/**
 * THE GLYPH BOXES INSIDE THE BRAND FILES, MEASURED — not estimated.
 *
 * Both locked PNGs are a 1408x768 canvas with the artwork floating in a sea of white padding,
 * so every consumer needs the artwork's own rect. Measured by thresholding ink
 * (`mean < 170 && b > r`) over the whole canvas and taking the bounding box:
 *
 *   wordmark.png   ink bbox x 185..1222, y 264..503   ->  1038 x 240, aspect 4.325
 *   mark.png       (unchanged, see below)
 *
 * The rects below pad that bbox so the plane's own border is guaranteed white paper, which the
 * shader keys to alpha 0 — a tight bbox would put ink on the outermost texel row and let
 * ClampToEdge smear it. 16 px of pad horizontally, 7 px vertically, giving 4.213:1.
 *
 * The `mark` rect is the old `offset(0.30, 0.14) / repeat(0.40, 0.72)` re-expressed in pixels
 * and is numerically identical to it (422/1408 = 0.29972, 553/768 = 0.71997, and so on), so
 * moving to this table cannot have changed how the split-head mark prints anywhere.
 */
export const BRAND_ART = { w: 1408, h: 768 };
export const BRAND_CROPS = {
  mark: { x: 422, y: 108, w: 563, h: 553 },
  wordmark: { x: 169, y: 257, w: 1070, h: 254 },
};
/** Width/height of a brand crop. Anything shaping a decal plane must use this. */
export const brandAspect = (which = 'wordmark') => {
  const c = BRAND_CROPS[which] ?? BRAND_CROPS.wordmark;
  return c.w / c.h;
};

/**
 * The chest decal, printed from the ACTUAL locked brand art.
 *
 * The SDF version below (`chestDecal`, not `chestDecalProcedural` — that name has never
 * existed in this file) approximates the SPLIT-HEAD MARK ONLY; it has no wordmark form and
 * never had one, and it now has NO CALLERS anywhere in src/. A critic correctly rejected it:
 * an approximation cannot be "verified against the brand art", which is the only test that
 * matters for a logo. The real files are locked art and we have them, so we print them.
 *
 * Do not resurrect the SDF for the wordmark. The 4/H ligature is a white keyline that slices
 * through the H's left stem, a shoulder that springs off that stem as a quarter-round arch,
 * and a bar that stops 16/1038 of the width short of the stem — reproducing that with strokes
 * would be a large amount of work whose best possible outcome is "indistinguishable from the
 * file we already ship".
 *
 * The source PNGs are flat navy on white with no alpha, so alpha is keyed from luminance:
 * white paper becomes transparent, ink becomes opaque. That also gives free antialiasing
 * on the glyph edges, because a half-grey edge texel becomes a half-alpha texel.
 *
 * `which` picks the mark (the split human/robot head) or the 4Humanity wordmark. Both are
 * served from public/brand/, and both files are BYTE-IDENTICAL to the locked art —
 * `public/brand/wordmark.png` md5-matches `Dev Art/1785276265860.png`, `mark.png` matches
 * `1785276058591.png`. That is the whole reason this path exists instead of the SDF below:
 * printing the locked file is not an approximation of the logo, it IS the logo.
 *
 * DEFAULT IS NOW `wordmark` — John's direction of 2026-08-03 replaces the split-head emblem
 * on the chest and back with the 4Humanity text wordmark. `mark` is kept working (its crop is
 * numerically unchanged, see BRAND_CROPS) because the manifest still specifies it for engraved
 * crests in the mansion and the loading screen.
 */
/*
 * ROUND 35 — THE DECAL COULD RENDER AS A SOLID NAVY BAR, AND IT DID SO IN ONE CAPTURE OUT OF
 * TWO. Found while byte-comparing two `mat.robot` shoots for reproducibility; it is not a
 * cosmetic bug, it is a CAPTURE-INTEGRITY bug of exactly the class HANDOFF's "captures lie"
 * section is about, and it reached every consumer of this material.
 *
 * `TextureLoader().load()` is asynchronous and nothing waited on it. Until the PNG decodes,
 * `map` samples as opaque BLACK. The keying below is luminance-inverted — white paper keys to
 * alpha 0, navy ink to alpha 1 — so an all-black sample gives `_lum = 0`, `_a = 1.0`, and
 * `smoothstep(0.10, 0.55, 1.0) = 1.0`: the ENTIRE plane paints at full ink strength. The
 * unloaded state was the maximally-inked state.
 *
 * MEASURED: two `mat.robot` captures of the identical build differ by 0.266% of pixels in one
 * bbox (270,454..453,808) with maxDiff 337 — the shell panel's mark, drawn as "4Humanity" in
 * one run and as a filled navy rectangle in the other. A capture that loses this race is not
 * obviously broken; it looks like a design decision, so it can be judged and scored as one.
 *
 * TWO FIXES, because either alone leaves a hole:
 *   1. `uReady` makes the unloaded state draw NOTHING. A missing mark is self-announcing and
 *      the existing probes catch it; a solid navy bar is not and they do not. This needs no
 *      API change, so every consumer — hunter, game, gadgets — gets it without being touched.
 *   2. `brandReady()` lets a view AWAIT the decode before `markReady()`, so a correct capture
 *      is guaranteed rather than merely likely. Applied in the two views this file's owner
 *      owns (`mat-robot.js`, `char-turnaround.js`); any other view that starts capturing the
 *      mark should await it too.
 */
const _brandLoads = [];
/** Resolves once every `brandDecal` texture requested so far has decoded. */
export function brandReady() { return Promise.all(_brandLoads); }

export function brandDecal(opts = {}) {
  const which = opts.which ?? 'wordmark';
  // Shared with the shader as the `uReady` uniform OBJECT, so flipping `.value` in the load
  // callback reaches the compiled program without recompiling it.
  const ready = { value: 0 };
  let done;
  _brandLoads.push(new Promise((res) => { done = res; }));
  const tex = new THREE.TextureLoader().load(`/brand/${which}.png`,
    () => { ready.value = 1; done(); },
    undefined,
    // A failed load must also resolve, or a view awaiting `brandReady()` hangs until the
    // harness's own timeout and reports a dead view instead of a missing file.
    () => { done(); });
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;

  // THE ACTUAL CAUSE OF "too small and low-contrast to resolve": the source PNG is a wide
  // 1408x768 canvas (matching the other brand exports) with the glyph itself occupying
  // only the centre third or so, padded by white on both sides. The decal geometry is a
  // SQUARE plane sampling the full 0..1 texture, so the whole wide canvas — padding
  // included — was squeezed onto a square, which compresses the glyph horizontally by the
  // canvas's ~1.83:1 aspect ratio. That is what rendered as a thin dark vertical bar
  // instead of the split-head mark: it was never a contrast problem, it was a crop
  // problem, and no amount of decal-size or ink-contrast tuning could have fixed it.
  // Cropping the texture's UV rect to the glyph's own bounding box (roughly square in the
  // source) fixes the distortion and uses the whole decal plane for the glyph instead of
  // for padding, which is most of the legibility fix on its own.
  //
  // THE WORDMARK MAKES THAT CROP LOAD-BEARING RATHER THAN MERELY HELPFUL, because its glyph
  // box is not roughly square — it is 4.21:1. Uncropped, a square decal plane squeezes a
  // 1038 px-wide wordmark into the same space as a 240 px-tall one and the ligature closes up
  // into a navy smear. The crop and `brandAspect()` are therefore a matched pair: whatever
  // shapes the plane MUST take its aspect from the same rect the texture is cropped to, or the
  // letterforms distort. Both callers (the robot's chest, the mat.robot specimen) do.
  const crop = BRAND_CROPS[which];
  if (crop) {
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    // v is bottom-up, the measured rect is top-down.
    tex.offset.set(crop.x / BRAND_ART.w, 1 - (crop.y + crop.h) / BRAND_ART.h);
    tex.repeat.set(crop.w / BRAND_ART.w, crop.h / BRAND_ART.h);
  }

  const ink = new THREE.Color(...(opts.ink ?? C.ink));
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: tex,
    transparent: true,
    roughness: 0.30,
    metalness: 0.0,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  m.onBeforeCompile = (sh) => {
    sh.uniforms.uInk = { value: new THREE.Vector3(ink.r, ink.g, ink.b) };
    sh.uniforms.uInkStrength = { value: opts.strength ?? 1.0 };
    sh.uniforms.uReady = ready;
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', `
        uniform vec3 uInk;
        uniform float uInkStrength;
        uniform float uReady;
        void main() {`)
      .replace('#include <map_fragment>', `
        // BEFORE THE TEXTURE DECODES, DRAW NOTHING. An undecoded map samples opaque black,
        // and the luminance keying below turns black into FULL ink — so without this the
        // whole plane paints as a solid navy rectangle. See the note above brandDecal.
        if (uReady < 0.5) discard;
        vec4 _brand = texture2D(map, vMapUv);
        // key alpha off luminance: white paper -> 0, navy ink -> 1
        float _lum = dot(_brand.rgb, vec3(0.2126, 0.7152, 0.0722));
        float _a = clamp(1.0 - _lum * 1.18, 0.0, 1.0);
        _a = smoothstep(0.10, 0.55, _a) * uInkStrength;
        if (_a < 0.02) discard;
        diffuseColor.rgb = uInk;
        diffuseColor.a *= _a;
      `);
  };
  // v2: the shader gained `uReady`, so a cache key that still said v1 would hand this material
  // the OLD program and reinstate the bug on any page that had already compiled one.
  m.customProgramCacheKey = () => 'rrr-brand-decal-v2';
  return m;
}

/** Chest shell carrying the printed 4Humanity mark, drawn procedurally. */
export function chestDecal(opts = {}) {
  const o = { size: 512, ...opts };
  return baker().standard({
    key: `rrdecal:${JSON.stringify(o)}`,
    size: o.size, surface: DECAL_SURFACE,
    heightScale: 0.006, normalStrength: 1.0, anisotropy: 8,
    uniforms: {
      uShell: new THREE.Vector3(...C.shell),
      uInk: new THREE.Vector3(...C.ink),
    },
  }, {
    clearcoat: 0.9, clearcoatRoughness: 0.075,
    envMapIntensity: 1.0, normalScale: new THREE.Vector2(0.35, 0.35),
  }, THREE.MeshPhysicalMaterial);
}

/** Matte dark for panel gaps, knuckle gaps, vents. */
export function gapDark() {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(...C.gap), roughness: 0.82, metalness: 0.1,
  });
  m.name = 'unit4h.gap';
  return m;
}

/** Boot sole rubber. */
export function soleRubber() {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(...C.sole), roughness: 0.74, metalness: 0.0,
  });
  m.name = 'unit4h.sole';
  return m;
}

export const UNIT4H_COLORS = C;

/** One call for everything the model needs. */
export function unit4hMaterials(opts = {}) {
  return {
    shell: shellWhite(opts.shell),
    chrome: chromeSatin(opts.chrome),
    mint: mintCap(opts.mint),
    face: faceplate(opts.faceplate),
    // The real brand art, not the SDF approximation — a logo has to be verifiable
    // against the locked file, and only the locked file can do that.
    /*
     * THE CORRUPTED HUNTER KEEPS THE WORDMARK, AND THE ART SAYS SO EXPLICITLY.
     *
     * `ART_MANIFEST.md` #05 (Hunter Stage 3 hero shot): "Chest still carries two
     * ghost-impressions of the 4Humanity mark." So the answer is not "grime hides it" and not
     * "it prints as new" — it is a mark that has been worn back toward the shell until only its
     * shape survives. That is a strength, not a colour, and `brandDecal` already has the knob.
     *
     * Derived from the grime the caller is ALREADY passing rather than added to hunter.js,
     * because hunter.js is another owner's file and because a hunter that dirties its shell and
     * keeps a factory-fresh logo is wrong at every stage, not just at stage 3. The ramp:
     *
     *   player   grime 0.00  ->  strength 1.00   fresh print
     *   stage 1  grime 0.52  ->  strength 0.59   faded but plainly legible
     *   stage 2  grime 0.76  ->  strength 0.41   worn
     *   stage 3  grime 1.00  ->  strength 0.22   a ghost impression
     *
     * At 0.22 over stage 3's #B8AFA3 shell the ink lands near rgb(145,154,156): the wordmark is
     * still readable as a shape, has lost its colour, and reads as something that was printed a
     * long time ago on a machine that has since stopped being maintained. An explicit
     * `opts.decal.strength` still wins, so a caller can override the ramp.
     *
     * ONLY THE STAGE-1 END OF THIS RAMP HAS BEEN SEEN ON SCREEN, and the reason is a bug in
     * hunter.js, not here. `scaleMeshes()` (hunter.js:371) widens the chest with
     *     if (c.isMesh && !c.userData.keepSeparate) c.scale.set(sx, sy, sz)
     * and the decal is precisely the mesh that carries `keepSeparate` — a flag unit4h.js sets to
     * protect it from DRAW-CALL MERGING, which this line reads as "do not scale". So stages 2 and
     * 3 grow their chest shell 12% and 21% deeper while the mark stays at the original depth and
     * ends up buried INSIDE the shell. It is not a strength problem: driven to strength 1.0 the
     * stage-3 chest still shows no navy anywhere (checked by clustering every navy-ish pixel in
     * the frame — the only clusters are the two faceplates and the scale-reference player). It
     * correlates exactly with `chestWide`: stage 1 is 1.00, `scaleMeshes` early-returns, and the
     * mark renders correctly there. This predates the wordmark and buried the split-head mark the
     * same way. ART_MANIFEST #05 says the stage-3 chest must carry the mark, so the hunter's owner
     * should fix that line and then re-judge whether 0.78 is the right slope at the far end.
     */
    /*
     * ⚠️ FADING THE ALPHA KEEPS THE HUE, AND THE HUE IS THE DEFECT. The strength ramp above
     * makes the mark FAINTER but every surviving pixel is still full-strength #054E84, so a
     * stage-2 chest photographs with a legible BLUE wordmark on a body that should read as a
     * wreck. Measured on the stage-2 chest, peak blue excess (b - (r+g)/2): render 34.5,
     * the art's own ghost roundels 7 — ours is five times as blue as anything the art has
     * there, while the MEAN colour of the two patches matches almost exactly (128/130/129
     * against 123/114/107). A mean would have called this fixed; the peak is what reads.
     *
     * This block's own text already said it — a worn mark "has lost its colour" — but only
     * alpha was ever ramped. So ramp the INK toward a warm grey on the same grime, which is
     * what ink actually does as it weathers: it greys and warms, it does not just thin. The
     * target is a shape you can still read with no hue left in it.
     *
     *   player   grime 0.00  ->  ink #054E84 (fresh print)
     *   stage 2  grime 0.76  ->  ~68% of the way to warm grey
     *   stage 3  grime 1.00  ->  ~90% of the way — shape only
     *
     * `desatTo` is deliberately DARKER than the shell so the ghost stays legible as a shape;
     * blending toward the shell itself would erase it, and ART_MANIFEST #05 requires the
     * stage-3 chest to still carry the mark.
     */
    decal: brandDecal({
      strength: 1 - (opts.shell?.grime ?? 0) * 0.78,
      ink: (() => {
        const g = opts.shell?.grime ?? 0;
        const desatTo = [0.300, 0.268, 0.240];
        return C.ink.map((v, i) => v + (desatTo[i] - v) * Math.min(1, g * 0.90));
      })(),
      ...opts.decal,
    }),
    gap: gapDark(),
    sole: soleRubber(),
  };
}

/**
 * MAKE THIS FILE'S ENVIRONMENT NUMBERS LIVE — one call, from a view.
 *
 * Every `envMapIntensity` written above is INERT in any scene that sets `scene.environment`,
 * which is all of them: three.js overwrites the uniform with `scene.environmentIntensity`
 * unless the material carries its own `envMap`. HANDOFF.md records this as one of the project's
 * silent failures, and the cost has been real — `mintCap()` argues at length for a quiet 0.55
 * because a near-white studio environment reflected at full strength desaturates the character's
 * signature colour, and then runs at 1.40 anyway. Measured on the round-32 capture, front figure:
 *
 *              sheet                 render
 *   mint cap   (97,147,141) lum 128  (180,193,189) lum 187
 *
 * That is not a slightly pale mint, it is a WHITE cap with a green cast — the single loudest
 * colour on the character, gone.
 *
 * This helper takes the engine's `setEnvResponse` (passed in, so this module keeps no dependency
 * on the view layer) and applies the intended per-family response. Views that want the materials
 * to look the way this file describes call it; nothing changes for views that do not, so the
 * hunter and the game keep the exact frames they have until someone judges them.
 */
/*
 * MEASURED, round 32 second pass, front figure, 0-255 luminance, sheet vs render:
 *   arm chrome  190 / 126     mint cap  128 / 164 (and green-minus-red 50 / 18)
 * The chrome is still charcoal where the sheet is bright satin, and the mint is still a pale
 * cast rather than a colour. Both move; `gap` stays where round 31 measured it (knee recess
 * p05 11 against the sheet's 20).
 */
/*
 * ROUND 33 adds `sole`. It had never been listed, so the boot's rubber ran at whatever the
 * scene set (1.40 on the turnaround) while every other dark on the model was pinned. The
 * sheet's boot is the one place on the figure with a genuinely black band in it and ours read
 * as mid-grey. 0.22 rather than gap's 0.10 because the sole is a large, curved, outward-facing
 * surface rather than a recess — at 0.10 it loses its own form and becomes a silhouette.
 * `bootSeam` moved onto this material in the same round (see `buildBoot`), so this number now
 * governs the toe seam too, which is why it is not simply set to gap's value.
 */
/*
 * ROUND 35 — `sole` 0.22 -> 0.90. THE PREMISE ABOVE IS WRONG, AND IT IS WHY THE BOOT'S SEAM
 * READS AS A BLACK BAR RATHER THAN AS A LINE.
 *
 * "The sheet's boot is the one place on the figure with a genuinely black band in it" is
 * checkable, and it does not hold. Tight patches on all four of the sheet's boots, 0-255
 * luminance (`_tmp_scan.mjs patch`):
 *
 *   sheet sole floors    heel min 34.5 p05 39.5 · fig1 min 43 p05 45 · fig3 min 25.5 p05 30
 *   sheet shell p50      199
 *   -> the sole sits at roughly 0.15-0.33 of the shell. Dark grey. Not black.
 *
 *   render sole          p05 4 · p50 11 · min 1     render shell p50 160
 *   -> 0.025-0.07 of the shell, i.e. 3-5x too dark. Genuinely black — a void, not a material.
 *
 * Round 33 set out to stop the sole reading as mid-grey. The sheet's sole IS mid-grey, and the
 * unpinned 1.40 it replaced was closer to the art than the 0.22 that replaced it.
 *
 * THIS IS ALSO THE REMAINING HALF OF `critic-robot-35`'s BLACK-BAR COMPLAINT. `bootSeam` runs
 * on this material, so the seam inherited the same crush: measured across the mark
 * (`_tmp_scan.mjs row`), the render's stroke bottoms at luma 22 against a local shell of 170,
 * i.e. 13% of shell, where the sheet's equivalent stroke bottoms at 62 against 225 — 28%. The
 * seam's WIDTH was already right after the geometry rebuild (core 5 px on a 140 px boot =
 * 0.036 of boot height, against the sheet's 3 px on 49 px = 0.061 — if anything ours is thin).
 * What made it read as a bar rather than a scribe was that it was twice as dark as the art's,
 * on a material that was five times too dark to begin with.
 *
 * LANDED AT 1.60, SOLVED RATHER THAN GUESSED, because the response is strongly SUB-LINEAR and
 * a first cut at 0.90 — a 4.1x change — moved the sole only 11 -> 19.9. Two points give the
 * line: sole p50 = 8.1 + 13.1 * env, seam floor = 18.4 + 16.6 * env. The material has a large
 * env-independent term, so anything under ~1.5 cannot reach the sheet's values at all.
 *
 *   env    sole p50 (shell 160)     seam floor (shell 170)
 *   0.22      11    = 0.07 shell        22   = 0.13 shell
 *   0.90      19.9  = 0.12                33.3 = 0.20
 *   1.60      (target ~29 = 0.18)         (target ~45 = 0.26)   sheet: 0.25-0.33 / 0.28
 *
 * It lands just above the 1.40 the scene used to set unpinned, which is the value round 33
 * called too light — and the sheet says 1.40 was nearer right than 0.22 was. The number is
 * still PINNED rather than left to the scene, which is the part of round 33's change that was
 * correct and is kept: `mat.robot` and `char.turnaround` set different env intensities, and an
 * unpinned dark reads as a different material in each.
 */
/*
 * ...and `shell`, which had never been listed either, so the white shells rode whatever the
 * scene set. That was fine until round 33 put a black flag on the camera side of the studio
 * environment for the chrome's sake (see `buildStudioEnv`, change 4): the metal needed it and
 * the diffuse family paid for it, dropping the chest from 189 to 173 against the sheet's 188.
 * Listing `shell` is what makes those two independent. Measured on the front figure's chest,
 * env response against 0-255 luminance: 1.40 -> 173, 1.62 -> 178, 1.78 -> 181, 2.05 -> 185,
 * against the sheet's 188. 2.05 also moves the shell's own p05..p95 range 140 -> 116 toward the
 * sheet's 82 — ours has been the MORE contrasty of the two since round 26's `lightContrast`,
 * not the flatter one, so level and range want the same direction here.
 */
export const UNIT4H_ENV = { mint: 0.30, gap: 0.10, chrome: 3.05, sole: 1.60, shell: 2.05 };

export function applyUnit4HEnv(setEnvResponse, engine, mats, over = {}) {
  const v = { ...UNIT4H_ENV, ...over };
  for (const k of Object.keys(v)) if (mats[k] && v[k] != null) setEnvResponse(engine, mats[k], v[k]);
  return mats;
}
