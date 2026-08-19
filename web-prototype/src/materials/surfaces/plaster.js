import * as THREE from 'three';
import { baker } from '../baker.js';

/**
 * ARCHITECTURAL lime plaster and cast ornamental plasterwork.
 *
 * This is the estate's ceilings, its cornices and its ceiling roses, and every wall that is
 * not panelled in walnut or hung with damask. It is the *intact* material.
 *
 * NOT THE SAME BRIEF AS `wallstages.js`.
 * `wallstages.js` also has a plaster, and that one is a destruction stage: broken back,
 * crumbling, with torn wallpaper still clinging and a break-order field baked into the ORM
 * alpha. It belongs to the destruction system and must not gain dependants, so nothing here
 * imports from it. Technique was read across, code was not.
 *
 * WHAT MAKES PLASTER READ AS PLASTER RATHER THAN AS GREY PAINT
 *
 *  1. TROWEL UNDULATION. A plasterer floats a wall in long shallow arcs, so the finished
 *     surface is very slightly wavy at a wavelength of a foot or two, with a visible lap
 *     edge where one pass met the last. This is the thing almost everyone misses and it is
 *     the single cue that says "hand-applied" rather than "a painted board". It lives in
 *     the normal map at low amplitude and long wavelength — see the amplitudes on
 *     `s.height` below, which are chosen for a ~3 degree slope, not for a stucco effect.
 *  2. CRAZING. A hairline crack network following shrinkage cells, so voronoi cell edges
 *     are literally the right primitive: the cracks ARE the cell boundaries. Sparse and
 *     patchy — a full net over the whole wall reads as a dry lakebed.
 *  3. HORSEHAIR. Period lime plaster is haired with ox or horse hair to stop the coat
 *     shrinking apart, and where the float has dragged the surface open the fibres show.
 *  4. Chalky, high roughness, with a sheen only where the float burnished it or where
 *     later paint coats have filled the tooth.
 *  5. Grime that obeys gravity: at the floor line, in the hollows, in the crazing.
 *
 * TILE SIZE. `plasterWall` and `plasterCeiling` are authored for a tile of ABOUT 2.4 m
 * square at `size: 1024` — crazing cells land at 100-120 mm, fibres at ~25 mm, the trowel
 * arcs at ~40 cm. Map them so one uv tile is roughly that. The floor-line grime is a
 * gradient in v from v = 0, so a wall using `grime` must have v = 0 at the floor and must
 * not repeat vertically; pass `grime: 0` for anything tiled or overhead.
 *
 * FIBRES AND CRACKS ARE DRAWN, NOT THRESHOLDED. Four files on this project shipped
 * authored detail that never rendered because it was gated with `smoothstep(0.9, …)` over
 * `fbmT`, whose output is a narrow bell around 0.5 that never gets near 0.9 — the horsehair
 * in the destruction plaster had never drawn a single fibre. Everything here that must be
 * visible is either drawn as explicit geometry (`hairLayer` places segments on a lattice,
 * so its density and width are exact numbers rather than a hope) or gated through `pat()`.
 */

// ---------------------------------------------------------------------------------------
// Shared GLSL. Concatenated into each surface shader — they are separate compilations, so
// there is no redefinition to worry about.
// ---------------------------------------------------------------------------------------
const PLASTER_LIB = /* glsl */ `
// fbmT averages octaves of gradient noise, so its output is a narrow bell around 0.5 and
// essentially never reaches 0.9. A gate written smoothstep(0.9, 0.99, fbmT(...)) therefore
// never fires, and a gate written over the middle of the range returns mid-grey mush
// instead of patches. Stretch the distribution first and the gates behave as they read.
float pat(float v, float k){ return clamp((v - 0.5) * k + 0.5, 0.0, 1.0); }

// ---------------------------------------------------------------------------------------
// ZOOM — the same physical material authored onto a SMALLER TILE.
//
// The two-distance requirement cannot be met by magnifying one bake. A 2.4 m tile at 1024
// is 2.34 mm per texel; put the camera a metre from a fallen lump and the finest octave the
// texture holds is wider than a screen pixel, so the lump goes smooth and pale and reads as
// white plastic. That is exactly what the floor debris was doing.
//
// uZoom shrinks the AUTHORED TILE by an integer factor while keeping every feature the same
// size IN METRES: a frequency of K cycles per 2.4 m tile becomes K/uZoom cycles per
// (2.4/uZoom) m tile, which is the same wavelength on a quarter of the area, i.e. uZoom
// times the texel density for the same map size.
//
// IT MUST STAY INTEGER OR THE TEXTURE STOPS TILING. Every noise here wraps by taking mod
// against its period on an integer lattice (see gnoiseT / voronoiT), and hairLayer's cell
// grid wraps the same way, so a fractional period puts a hard seam down two edges of the
// map. fq() therefore rounds, and clamps at 1 — and with uZoom = 1 it is the identity on
// every integer, so every existing bake is unchanged to the bit.
//
// The caller must also divide heightScale by uZoom: heightScale is a slope per UV unit, and
// halving the tile doubles the UV gradient of the same physical bump.
uniform float uZoom;
float fq(float k){ return max(1.0, floor(k / uZoom + 0.5)); }

// local coordinate inside one member of a moulding: 0 at its lower edge, 1 at its upper
float mem(float t, float a, float b){ return clamp((t - a) / (b - a), 0.0, 1.0); }

// a soft band between two edges
float band(float t, float a, float b, float f){
  return smoothstep(a - f, a + f, t) * (1.0 - smoothstep(b - f, b + f, t));
}

// CRAZING. Real crazing follows shrinkage cells, so voronoi edges are the right primitive:
// the cracks ARE the cell boundaries, which is why the network never looks like a grid.
// F2 - F1 goes to zero exactly on an edge.
float crazeNet(vec2 p, float period, float w){
  vec3 v = voronoiT(p, period);
  return 1.0 - smoothstep(0.0, w, v.y - v.x);
}

// HORSEHAIR, DRAWN.
// One short fibre per cell of a tileable lattice, jittered in position, angle and length,
// with most cells empty. Drawing it means the width, the length and the density are numbers
// I chose rather than emergent properties of a threshold over noise — and a threshold over
// noise is exactly how every previous attempt at this on the project ended up invisible.
// The cells argument must be an integer or the lattice will not wrap.
float hairLayer(vec2 uv, float cells, float len, float wid, float sd){
  vec2 p = uv * cells;
  vec2 id = floor(p);
  vec2 f = fract(p);
  float d = 1e5;
  for (int j = -1; j <= 1; j++){
    for (int i = -1; i <= 1; i++){
      vec2 g = vec2(float(i), float(j));
      vec2 cid = mod(id + g, cells);
      if (hash12(cid * 1.31 + sd) < 0.44) continue;      // most cells hold no visible fibre
      vec2 c = g + hash22(cid + sd + 0.5) - f;           // fibre centre, relative to here
      float ang = hash12(cid * 2.17 + sd + 3.0) * PI;
      float ln = len * (0.55 + hash12(cid * 4.53 + sd + 7.0) * 0.90);
      vec2 dir = vec2(cos(ang), sin(ang)) * ln * 0.5;
      d = min(d, sdSeg(vec2(0.0), c - dir, c + dir));
    }
  }
  return 1.0 - smoothstep(wid * 0.40, wid, d);
}

// THE PLASTERER'S ARC.
// Everything here is authored to tile: the noises take a period equal to their own
// frequency, and the drawn strokes use INTEGER coefficients on uv inside a TAU, so a shift
// of one whole tile is a whole number of cycles and the pattern wraps exactly.
struct Trowel {
  float wave;   // broad undulation, 0..1
  float arc;    // the stroke ridges, -1..1
  float lap;    // the ridge where one pass met the last, 0..1
  float bay;    // per-pass tone offset, -0.5..0.5
};

Trowel trowelField(vec2 uv){
  Trowel t;
  float f3 = fq(3.0), f7 = fq(7.0), f2 = fq(2.0);
  t.wave = fbmT(uv * f3 + 1.7, f3, 4, 2.0, 0.58) * 0.66
         + fbmT(uv * f7 + 9.3, f7, 3, 2.0, 0.50) * 0.34;

  // The strokes bend, and they only appear WHERE THE FLOAT CHATTERED. Both matter. Drawn
  // straight and edge to edge, a pair of sines is a row of evenly spaced diagonal ridges
  // running the whole width of the wall — it renders as corduroy, which is worse than no
  // trowel work at all. A tileable warp bends them, and a patch mask means a stroke starts
  // and stops the way a real one does.
  //
  // THE WARP HAS A CEILING, AND THE FIRST VERSION WAS OVER IT. At 0.95 the warp field's
  // own derivative reaches about +/-1.9, so d(aw)/d(uv) goes NEGATIVE over part of the
  // tile: the sinusoid folds back on itself, and a folded sinusoid piles its crests into
  // caustic-like pinches. That is what put wandering half-metre tubes across the hero wall
  // — the render read as quilted vinyl. Keep the warp derivative under 1 (0.30 here peaks
  // near 0.6) and the strokes bend without folding.
  vec2 aw = uv + (vec2(fbmT(uv * f2 +  5.0, f2, 3, 2.0, 0.50),
                       fbmT(uv * f2 + 15.0, f2, 3, 2.0, 0.50)) - 0.5) * 0.30;
  float chat = smoothstep(0.24, 0.86, pat(fbmT(uv * f3 + 44.0, f3, 3, 2.0, 0.55), 2.4));
  t.arc = (sin((aw.x * fq(3.0) + aw.y * fq( 5.0)) * TAU) * 0.60
         + sin((aw.x * fq(7.0) - aw.y * fq(11.0)) * TAU) * 0.40) * (0.10 + chat * 0.70);

  // THE LAP EDGE. A plasterer works a wall in bays, and where the next pass overlapped the
  // last there is a faint step with a narrow ridge on it. This is the detail that says the
  // wall was laid on by hand in sections; without it the trowel work is just wobble.
  //
  // IT WAS THE LAP, NOT THE STROKES, THAT READ AS CORDUROY. At 2 cycles in u and 4 in v the
  // lap ran 4.5 times across a 2.4 m tile — a bay every 530 mm, when a plasterer's bay is
  // most of a metre — and its 0.075 relief over a 30 mm ridge made it the steepest feature
  // in the whole height field, four times the slope of anything else. So the hero wall was
  // covered in nine bright wandering welts and every reference (the locked art, and
  // refs/lath/lath-and-plaster-wall.jpg) shows a wall with no nameable ridging at all.
  // Cutting the count to 2.4 per tile puts the bay at 1.0 m, and cutting the relief to 0.016
  // puts the lap where it belongs: findable at 20 cm, invisible across the room.
  // The lap coefficients are DIVIDED rather than passed through fq(): 2.2 is not an integer
  // and never was, so this term has never tiled vertically (the wall is mapped with a single
  // v repeat, which is why that has never shown). Rounding it here would change the base
  // wall at uZoom = 1, which is the one thing this addition must not do.
  float lapC = uv.x * (1.0 / uZoom) + uv.y * (2.2 / uZoom)
             + (fbmT(uv * f2 + 31.0, f2, 3, 2.0, 0.55) - 0.5) * 0.42;
  float lf = fract(lapC);
  t.lap = smoothstep(0.0, 0.013, lf) * (1.0 - smoothstep(0.013, 0.055, lf));
  t.bay = hash11(mod(floor(lapC), 3.0) * 5.7 + 0.3) - 0.5;
  return t;
}
`;

// ---------------------------------------------------------------------------------------
// FLAT LIME PLASTER — walls and ceilings
// ---------------------------------------------------------------------------------------
const WALL_SURFACE = /* glsl */ `
uniform vec3  uTint;
uniform vec3  uGrimeCol;
uniform float uTrowel;
uniform float uCrazing;
uniform float uHair;
uniform float uBurnish;
uniform float uGrime;      // gravity grime rising from v = 0. Ceilings and tiled walls: 0.
uniform float uSoil;       // broad age soiling, direction-free
uniform float uRepair;     // made-good patches

${PLASTER_LIB}

void surface(in vec2 uv, inout Surf s){
  Trowel tw = trowelField(uv);

  // The chalky tooth of the finishing coat, at two scales.
  //
  // FREQUENCY HAS A CEILING SET BY THE TEXEL, AND 400 WAS OVER IT. A 2.4 m tile at size
  // 1024 is 2.34 mm per texel, so frequency 400 puts the base octave at 6 mm — 2.6 texels —
  // and its third octave at 1.4 mm, which is HALF a texel. That octave cannot be sampled;
  // it aliases at bake time and then the mip chain removes what survived, which is why the
  // wall was glassy smooth between the lap ridges while the height field said it was not.
  // 190 puts the base octave at 12 mm (5 texels) and the top at 3 mm, which resolves.
  //
  // Real lime tooth is finer than this and no texture at this world scale can hold it. That
  // is what the near-field fragments in the view are for: same material, a 0.55 m tile, so
  // the SAME shader resolves 0.5 mm grain when the camera is 40 cm away. Two distances are
  // carried by two texel densities, not by one texture pretending to do both.
  float fTh = fq(190.0), fTh2 = fq(90.0);
  float tooth  = fbmT(uv * fTh, fTh, 3, 2.05, 0.50);
  float tooth2 = fbmT(uv * fTh2 + 3.0, fTh2, 2, 2.0, 0.50);

  // MADE GOOD. No wall in a two-hundred-year-old house is one continuous coat: it has been
  // patched where a fitting came off or a pipe went in, and a patch sets a shade lighter
  // and has not had time to craze. This is the 10 m frequency layer — it is what stops the
  // wall reading as one uniform noise field when you see three metres of it at once.
  float fRp = fq(2.0);
  float repairF = pat(fbmT(uv * fRp + 41.0, fRp, 3, 2.0, 0.55), 2.2);
  float repair = smoothstep(0.62, 0.74, repairF) * uRepair;
  float repairEdge = band(repairF, 0.600, 0.632, 0.011) * uRepair;

  // CRAZING, warped so the cells are not evenly sized, and gated so it appears in patches
  // rather than as a net over the whole wall.
  float fCw = fq(8.0), fC1 = fq(20.0), fC2 = fq(48.0), fCm = fq(5.0);
  vec2 cw = uv + (vec2(fbmT(uv * fCw + 61.0, fCw, 2, 2.0, 0.5),
                       fbmT(uv * fCw + 71.0, fCw, 2, 2.0, 0.5)) - 0.5) * 0.045;
  float c1 = crazeNet(cw * fC1 +  3.0, fC1, 0.050);
  float c2 = crazeNet(cw * fC2 + 11.0, fC2, 0.062);
  float crazeMask = smoothstep(0.30, 0.84, pat(fbmT(uv * fCm + 21.0, fCm, 3, 2.0, 0.55), 2.6));
  float cracks = clamp(c1 * crazeMask + c2 * crazeMask * 0.55, 0.0, 1.0) * uCrazing;
  cracks *= 1.0 - repair * 0.85;

  // HORSEHAIR. Two passes on the same lattice so a cell can hold two fibres crossing.
  float fH = fq(30.0);
  float hair = max(hairLayer(uv, fH, 0.34, 0.055,  0.0),
                   hairLayer(uv, fH, 0.26, 0.045, 23.0)) * uHair;
  // and they only show where the float scuffed the surface open
  hair *= 0.40 + smoothstep(0.32, 0.80, pat(tw.wave, 2.2)) * 0.85;

  // ---- RELIEF ------------------------------------------------------------------------
  // Amplitudes are set from the SLOPE they produce, not from how they look on the height
  // map, because the normal map is the gradient and a small-amplitude short-wavelength term
  // outranks a large-amplitude long one. That is how the first tuning went wrong: the arc
  // term was 5.5% of the wave term's amplitude and still dominated, because it is a coherent
  // sinusoid at a quarter of the wavelength and the eye locks onto coherent ridges in a way
  // it never does onto noise. (No backticks in this comment on purpose: a backtick inside a
  // GLSL template literal ends the JS string. Writing one here cost a render.)
  //
  // The bar for this is the locked art (Dev Art/1785320177684, 1785319916301) and
  // refs/lath/lath-and-plaster-wall.jpg. All three show a lime wall that is essentially
  // FLAT: soft broad tonal mottling, a faint crazing net, and no directional ridging you
  // can name at room distance. So the budget went to the two frequencies that actually
  // carry the material — a very soft float undulation you read as a sheen gradient, and
  // the chalky tooth you only see at arm's length — and the stroke ridges were cut to a
  // quarter, where they register as a change in sheen rather than as corduroy.
  float hgt = 0.50
    + (tw.wave - 0.5) * 0.22 * uTrowel     // 0.36: broad float sweep, now ~2 deg over 80 cm
    + tw.arc  * 0.005 * uTrowel            // 0.020: the corduroy term. This is the fix.
    + tw.lap  * 0.016 * uTrowel            // 0.075: the ACTUAL corduroy term. See trowelField.
    + tw.bay  * 0.024 * uTrowel
    + (tooth  - 0.5) * 0.015               // 0.010: 6 mm grain, the 20 cm read
    + (tooth2 - 0.5) * 0.032               // 0.020: 3 cm grain, bridges 20 cm to 2 m
    + hair * 0.006
    - cracks * 0.012
    + repairEdge * 0.014;

  // ---- DIRT OBEYS GRAVITY AND GEOMETRY -----------------------------------------------
  float hollow = sat((0.50 - hgt) * 3.2);
  float low = 1.0 - smoothstep(0.0, 0.20, uv.y);
  low *= 0.40 + fbmT(uv * vec2(fq(6.0), fq(2.0)) + 19.0, fq(6.0), 3, 2.0, 0.5) * 1.20;
  float grime = uGrime * clamp(low * 0.95 + hollow * 0.20 + cracks * 0.30, 0.0, 1.0);
  float fSo = fq(4.0);
  float soil = uSoil * sat(fbmT(uv * fSo + 55.0, fSo, 4, 2.0, 0.55) * 1.30 - 0.30);

  // ---- COLOUR --------------------------------------------------------------------------
  vec3 col = uTint;
  col *= 0.955 + tw.wave * 0.070 + tw.bay * 0.022;
  col *= 1.0 + tw.arc * 0.006 + tw.lap * 0.012;
  col *= 0.985 + tooth * 0.022 + tooth2 * 0.012;
  col *= 1.0 + repair * 0.030 - repairEdge * 0.020;
  col = mix(col, col * 0.90, cracks * 0.65);                 // cracks are shadowed lines
  col = mix(col, col * 1.10 + vec3(0.014), hair * 0.55);     // fibres catch the light
  col = mix(col, uGrimeCol, grime * 0.55);
  col = mix(col, col * vec3(0.90, 0.905, 0.925), soil * 0.55);

  // Burnish: where the float polished the high points and where later paint coats filled
  // the tooth. Plaster's only highlight lives here, and without it the surface reads as
  // paper. Roughness carries far more of this material than albedo does.
  float burnish = uBurnish * sat(smoothstep(0.50, 0.88, tw.wave) * 0.85 + tw.lap * 0.20);

  s.albedo    = col;
  // The fibres are the ONE thing on this surface with a sheen. Without a roughness step they
  // are a 1.4% albedo lift on a matt field, which is why the horsehair measured as present
  // at texture level and was never once visible in a render. A hair is a smooth keratin
  // filament lying in a chalky matrix, so the step is physical, and at 4 mm wide on a 2.3 mm
  // texel it cannot register at room distance — it only pays at the near-field tile.
  s.roughness = clamp(0.935 - burnish * 0.30 - tooth * 0.045 - sat(hair) * 0.16
                    + cracks * 0.030 + grime * 0.050 + soil * 0.030, 0.05, 1.0);
  s.metalness = 0.0;
  s.ao        = 1.0 - cracks * 0.28 - grime * 0.24 - hollow * 0.10;
  s.height    = clamp(hgt, 0.0, 1.0);
}
`;

// ---------------------------------------------------------------------------------------
// THE BROKEN FACE — the fractured cross-section, and the keyed back
// ---------------------------------------------------------------------------------------
//
// This material exists to be destroyed, so the edge is not a detail, it is the point. Every
// photograph of broken lath-and-plaster in refs/lath shows the same three things and a
// critic on the wall group named the failure exactly: "a clean line where the photo has a
// ragged crumbling lip with dust below it."
//
//  1. THE COAT HAS A THICKNESS, and you see it end-on all round the hole. About 20 mm of
//     raw core under a 3 mm limewashed finish. A break with no visible section reads as
//     torn paper, which is what a plane with an alpha cutout always reads as.
//  2. THE CORE IS NOT THE FACE. Under the finish it is coarse sand and lime — greyer,
//     lighter, matt, full of aggregate and air voids. The tonal step between the two is
//     what makes the eye read "this was solid and it has been snapped".
//  3. THE HAIR IS IN THE SECTION. Ox or horse hair was beaten into the coarse coat, and a
//     fracture pulls the fibres out of the matrix rather than cutting them, so they stand
//     proud of the broken face and bridge the gap. This is the detail that separates
//     historic lime from modern gypsum and it is only ever visible at a break — which is
//     why a plaster piece with no break cannot show the thing it is named for.
//
// The same shader also serves the BACK of a fallen fragment, with uKeys = 1. Wet plaster was
// pressed through the gaps between the laths and slumped over behind them; when the face
// comes off, those keys go with it. The reference index calls the keys "the single detail
// that makes exposed lath read as real rather than as a wooden slat wall" — and they are
// plaster, not lath, so they belong here and not in mat.lath.
//
// AUTHORED FOR A 0.55 m TILE at size 1024, i.e. 0.54 mm per texel. That is deliberate and it
// is the other half of the two-distance requirement: the wall's 2.4 m tile physically cannot
// hold 2 mm aggregate, so the near-field pieces carry their own tile at four times the texel
// density instead of magnifying the wall's and calling the blur detail.
const BREAK_SURFACE = /* glsl */ `
uniform vec3  uTint;       // the raw core: sand and lime, greyer and paler than the face
uniform vec3  uDustCol;
uniform float uAgg;        // sand grains and lime lumps
uniform float uVoid;       // air voids left by the beating
uniform float uHair;
uniform float uKeys;       // 0 = fractured section, 1 = the keyed back of a fragment
uniform float uDust;

${PLASTER_LIB}

void surface(in vec2 uv, inout Surf s){
  // the core is mixed by hand and it is nowhere one tone
  float fB = fq(7.0), fB2 = fq(23.0);
  float body  = fbmT(uv * fB + 2.0, fB, 4, 2.0, 0.55);
  float body2 = fbmT(uv * fB2 + 9.0, fB2, 3, 2.0, 0.50);

  // AGGREGATE. Lime plaster is mostly sharp sand, so voronoi cells ARE the grains: cell
  // centres stand proud, cell boundaries are the interstices between them. A fraction of
  // the cells are grains the fracture pulled OUT, which leaves a pit rather than a bump —
  // that mix of proud and pitted is what stops it reading as an even bumpy noise.
  float fAg = fq(340.0), fAg2 = fq(120.0), fVd = fq(34.0);
  vec3 ag = voronoiT(uv * fAg + 5.0, fAg);            // 1.6 mm grains, 3 texels across
  float grainDome = 1.0 - smoothstep(0.0, 0.42, ag.x);
  float pulled = step(0.78, ag.z);                     // 22% of grains came away
  float grain = grainDome * (1.0 - pulled * 2.0);      // proud, or a pit
  vec3 ag2 = voronoiT(uv * fAg2 + 17.0, fAg2);        // 4.6 mm lime lumps
  float lump = (1.0 - smoothstep(0.0, 0.30, ag2.x)) * step(0.62, ag2.z);

  // AIR VOIDS — sparse, round, dark, with a bright lip on the near side
  vec3 vd = voronoiT(uv * fVd + 29.0, fVd);
  float voidC = (1.0 - smoothstep(0.10, 0.20, vd.x)) * step(0.80, vd.z) * uVoid;
  float voidLip = (1.0 - smoothstep(0.0, 0.07, abs(vd.x - 0.23))) * step(0.80, vd.z) * uVoid;

  // HAIR, STANDING PROUD OF THE FRACTURE.
  // 14 cells over 0.55 m is a 39 mm cell; length 0.8 of a cell is a 31 mm fibre, which is
  // what a plasterer's hair actually measures. Width 0.030 of a cell is 1.2 mm — coarser
  // than a real hair, and it has to be: 1024 texels over 0.55 m is 0.54 mm per texel, so
  // anything under about 1.1 mm is thinner than two texels and aliases into nothing. Three
  // passes on the same lattice so fibres cross and clump the way beaten hair does.
  float fHr = fq(14.0);
  float hair = max(max(hairLayer(uv, fHr, 0.80, 0.030,  0.0),
                       hairLayer(uv, fHr, 0.62, 0.026, 41.0)),
                       hairLayer(uv, fHr, 0.45, 0.022, 83.0)) * uHair;

  // THE KEYS. Squeezed through the gaps between the laths and slumped over the back: a
  // rounded bead on a 39 mm pitch (lath 32 mm plus a 7 mm gap), running horizontally, its
  // fullness varying along the run because the plasterer's pressure did. 14 beads per tile
  // is an integer, so the pattern wraps.
  float fKy = fq(14.0), fLg = fq(150.0), fDu = fq(26.0);
  float ky = fract(uv.y * fKy);
  float fullness = 0.45 + 0.55 * pat(fbmT(uv * vec2(fq(9.0), fKy) + 51.0, fKy, 3, 2.0, 0.55), 1.9);
  float bead = sin(PI * sat(mem(ky, 0.02, 0.38))) * fullness;
  // and between the beads, the flat the plaster took off the face of the lath, with the
  // timber's own grain pressed into it
  float lathGrain = fbmT(uv * vec2(fq(5.0), fLg) + 3.0, fLg, 2, 2.0, 0.5) - 0.5;
  float keyed = uKeys * (bead * 0.55 + lathGrain * 0.05 * (1.0 - bead));

  // dust and crumbs sit on anything roughly horizontal; on a vertical section they lodge in
  // the pits instead
  float dust = uDust * (0.35 + 0.65 * fbmT(uv * fDu + 61.0, fDu, 3, 2.0, 0.55));

  // ---- RELIEF --------------------------------------------------------------------------
  // Slopes, not amplitudes: at heightScale 0.035 a grain works out at about 20 degrees over
  // its 1.6 mm and a key at about 30 degrees over its shoulder, which is a fracture and a
  // squeezed bead respectively. The hair sits 0.4 mm proud — enough to catch a rim light
  // and throw a shadow, which is the only way a 1 mm fibre reads at all.
  float hgt = 0.34
    + grain * 0.016 * uAgg
    + lump  * 0.022 * uAgg
    + (body2 - 0.5) * 0.030
    + (body  - 0.5) * 0.055
    - voidC * 0.070
    + voidLip * 0.012
    + hair * 0.020
    + keyed * 0.120;

  // ---- COLOUR --------------------------------------------------------------------------
  vec3 col = uTint;
  col *= 0.88 + body * 0.24;
  col *= 0.95 + body2 * 0.10;
  col *= 1.0 + grainDome * 0.10 - pulled * grainDome * 0.14;   // pits read darker
  col *= 1.0 + lump * 0.09;
  col = mix(col, col * 0.42, sat(voidC) * 0.85);               // a void is a hole
  col = mix(col, col * 1.12, sat(voidLip) * 0.5);
  col = mix(col, col * 1.05 + vec3(0.020), hair * 0.60);       // fibres catch the light
  col = mix(col, uDustCol, sat(dust) * 0.30);
  col *= 1.0 - uKeys * 0.06 * (1.0 - bead);                    // the lath flats sat damp

  s.albedo    = col;
  // A fracture is the roughest surface in the estate — it is a torn open-pore solid with no
  // finish on it at all. The only thing on it with any sheen is the hair.
  s.roughness = clamp(0.965 - hair * 0.22 - lump * 0.05 + sat(voidC) * 0.02, 0.05, 1.0);
  s.metalness = 0.0;
  s.ao        = 1.0 - sat(voidC) * 0.55 - (1.0 - grainDome) * 0.10 - uKeys * (1.0 - bead) * 0.18;
  s.height    = clamp(hgt, 0.0, 1.0);
}
`;

// ---------------------------------------------------------------------------------------
// ORNAMENTAL / CAST PLASTERWORK — cornices, enriched mouldings
// ---------------------------------------------------------------------------------------
//
// v runs ACROSS the section, 0 at the wall and 1 at the ceiling. u runs ALONG the run.
//
// The section is split in two on purpose:
//
//   sectionH(t)  the smooth classical profile — fillet, cavetto, astragal, ovolo, dentil
//                backing, cyma. This is the shape the GEOMETRY is swept from (see
//                `corniceSection()` below, which returns the same curve to JS), so by
//                default it is NOT written into the height map: doing both would shade
//                the profile twice.
//   enrichH(uv)  the cast ornament sitting on that profile — bead and reel, egg and dart,
//                dentil blocks. This is what the normal map carries.
//
// Set `section: 1` to fold the profile back into the height map for a cheap flat band with
// no swept geometry. It reads acceptably at room distance and badly in silhouette.
//
// Dust and grime are read off the SLOPE of the full section rather than painted on with
// noise, so they land where they physically must: dust on every facet that faces up, grime
// hanging in every undercut and hollow.
const ORNAMENT_SURFACE = /* glsl */ `
uniform vec3  uTint;
uniform vec3  uDustCol;
uniform vec3  uGrimeCol;
uniform float uUnits;      // enrichment units along one uv tile
uniform float uDentils;    // dentils per enrichment unit
uniform float uDust;
uniform float uGrime;
uniform float uPaint;      // coats of limewash rounding the arrises off
uniform float uCrazing;
uniform float uHair;
uniform float uSection;    // 0 = geometry carries the profile, 1 = the normal map does

${PLASTER_LIB}

// The smooth classical section. Mirrored in JS by corniceSection() — change one, change
// the other, or the geometry and the ornament will disagree about where the members are.
float sectionH(float t){
  float h = 0.05;
  h += 0.055 * smoothstep(0.000, 0.050, t);                       // fillet on the wall
  float mc = mem(t, 0.055, 0.210);
  h += 0.150 * (1.0 - sqrt(max(1.0 - mc * mc, 0.0)));             // cavetto — concave cove
  h += 0.055 * sin(PI * mem(t, 0.210, 0.275));                    // astragal — half round
  h += 0.030 * mem(t, 0.275, 0.300);                              // fillet
  h += 0.115 * sin(0.5 * PI * mem(t, 0.300, 0.520));              // ovolo — convex quarter
  h += 0.028 * mem(t, 0.520, 0.570);                              // fillet
  h += 0.020 * mem(t, 0.730, 0.775);                              // fillet over the dentils
  float mk = mem(t, 0.775, 1.000);                                // cyma into the ceiling
  h += 0.160 * (mk < 0.5 ? 0.5 * pow(mk * 2.0, 1.8)
                         : 1.0 - 0.5 * pow(max(1.0 - mk, 0.0) * 2.0, 1.8));
  return h;
}

float enrichH(vec2 uv, out float mEgg, out float mDent, out float mBead){
  float t = uv.y;
  float h = 0.0;

  // BEAD AND REEL on the astragal: two round beads then a reel — a pair of thin discs.
  float onAst = sin(PI * mem(t, 0.210, 0.275));
  float reel = step(0.66, fract(uv.x * uUnits));
  float bu = fract(uv.x * uUnits * 3.0);
  float beadP = mix(abs(bu - 0.5), abs(fract(bu * 2.0) - 0.5), reel);
  mBead = sat(1.0 - smoothstep(0.20, 0.34, beadP)) * onAst;
  h += 0.045 * mBead;

  // EGG AND DART on the ovolo. The single most recognisable piece of classical enrichment,
  // and the thing that makes a cornice read as cast plasterwork rather than as a chamfered
  // box: an ovoid sitting in a cup, with a pointed dart filling the gap to the next one.
  float mo = mem(t, 0.300, 0.520);
  vec2 e = vec2(fract(uv.x * uUnits) - 0.5, mo - 0.5);
  float eggR = length(e / vec2(0.215, 0.415));
  mEgg = (1.0 - smoothstep(0.92, 1.03, eggR)) * band(t, 0.312, 0.508, 0.018);
  float dome = sqrt(sat(1.0 - min(eggR, 1.0) * min(eggR, 1.0)));
  h += 0.085 * mEgg * dome;
  float rim = 1.0 - smoothstep(0.0, 0.13, abs(eggR - 1.24));      // the cup around the egg
  h += 0.032 * rim * band(t, 0.302, 0.518, 0.018);
  float dxu = abs(abs(e.x) - 0.5);
  float dartW = 0.060 * (0.30 + 0.85 * mo);                       // the dart tapers downward
  h += 0.060 * (1.0 - smoothstep(dartW * 0.55, dartW, dxu)) * band(t, 0.318, 0.502, 0.026);

  // DENTIL COURSE: square blocks standing off a flat backing, gaps between them.
  float du = fract(uv.x * uUnits * uDentils);
  mDent = (1.0 - smoothstep(0.31, 0.38, abs(du - 0.5))) * band(t, 0.582, 0.728, 0.010);
  h += 0.090 * mDent;

  return h;
}

float enrichHt(vec2 uv){ float a, b, c; return enrichH(uv, a, b, c); }
float fullH(vec2 uv){ return sectionH(uv.y) + enrichHt(uv); }

void surface(in vec2 uv, inout Surf s){
  float mEgg, mDent, mBead;
  float enr = enrichH(uv, mEgg, mDent, mBead);
  float sec = sectionH(uv.y);
  float total = sec + enr;

  // WHICH WAY DOES THIS FACET LOOK?
  // Dust only settles on something that faces up, and grime only hangs where the section
  // undercuts. Both are read straight off the slope of the cast profile, so they land in
  // the right places by construction. A cornice with an even noise dirt on it is the
  // giveaway of a surface nobody thought about.
  float ev = 0.0045;
  float dV = (fullH(uv + vec2(0.0, ev)) - fullH(uv - vec2(0.0, ev))) / (2.0 * ev);
  float faceUp = sat(-dV * 0.75);                                 // receding as v rises
  float faceDn = sat( dV * 0.55);                                 // overhanging: a soffit

  // and a hollow is anything sitting below what surrounds it
  float around = (fullH(uv + vec2(0.00, 0.032)) + fullH(uv - vec2(0.00, 0.032))
                + fullH(uv + vec2(0.032, 0.00)) + fullH(uv - vec2(0.032, 0.00))) * 0.25;
  float hollow = sat((around - total) * 5.0);

  // cast plaster still has a plaster surface under the paint
  float tooth = fbmT(uv * 300.0, 300.0, 3, 2.05, 0.50);
  float crazeMask = smoothstep(0.32, 0.86, pat(fbmT(uv * 6.0 + 17.0, 6.0, 3, 2.0, 0.55), 2.6));
  float cracks = crazeNet(uv * 26.0 + 5.0, 26.0, 0.055) * crazeMask * uCrazing;
  float hair = hairLayer(uv, 26.0, 0.22, 0.050, 11.0) * uHair;

  // CASTING BLEMISHES: air bubbles that broke open when the cast was struck from the mould.
  // Sparse, small, and only ever on the flat backing and the fillets, never on an arris.
  vec3 vb = voronoiT(uv * 40.0 + 29.0, 40.0);
  float blem = (1.0 - smoothstep(0.045, 0.095, vb.x)) * step(0.82, vb.z);

  // PAINT BUILD-UP. A century of limewash rounds the arrises off and pools in the internal
  // angles, so the enrichment loses definition — which is why real period cornices look
  // softer than a fresh cast and why a razor-crisp one looks like a render.
  float relief = mix(enr, (enr + (around - sec)) * 0.5, uPaint * 0.55);

  float dust = uDust * faceUp * (0.55 + 0.45 * fbmT(uv * 18.0 + 7.0, 18.0, 3, 2.0, 0.50));
  float grime = uGrime * clamp(faceDn * 0.80 + hollow * 0.75, 0.0, 1.0)
              * (0.45 + 0.75 * fbmT(uv * 9.0 + 23.0, 9.0, 3, 2.0, 0.50));

  vec3 col = uTint;
  col *= 0.975 + tooth * 0.045;
  col *= 0.945 + total * 0.14;                       // the high members have been washed pale
  col = mix(col, col * 0.91, cracks * 0.55);
  col = mix(col, col * 1.08 + vec3(0.010), hair * 0.45);
  col = mix(col, col * 0.86, blem * 0.55);
  col = mix(col, uDustCol, sat(dust) * 0.60);
  col = mix(col, uGrimeCol, sat(grime) * 0.55);

  s.albedo    = col;
  s.roughness = clamp(0.900 - uPaint * 0.170 - tooth * 0.040
                    + sat(dust) * 0.075 - sat(grime) * 0.090 + cracks * 0.030, 0.05, 1.0);
  s.metalness = 0.0;
  s.ao        = 1.0 - hollow * 0.50 - sat(grime) * 0.18 - cracks * 0.20;
  s.height    = clamp(0.13 + relief * 2.6 + uSection * sec * 1.15
                    + (tooth - 0.5) * 0.012 + hair * 0.006 - cracks * 0.012 - blem * 0.030,
                    0.0, 1.0);
}
`;

// ---------------------------------------------------------------------------------------
// CEILING ROSE
// ---------------------------------------------------------------------------------------
//
// Radial, centred at uv 0.5 and filling the tile: apply to a disc with 0..1 uvs. The whole
// relief of a rose is 40-50 mm across a 700 mm plate, so a flat disc plus this normal map
// is honest — no lathe geometry needed, though a couple of millimetres of real dome keeps
// the silhouette from being a card.
//
// Leaf, bead and egg counts MUST be integers, and the leaf count must be EVEN: the angular
// coordinate wraps at +/-PI and both `fract` and the long/short leaf alternation have to
// survive that wrap or there is a seam down one radius.
//
// SOOT, not dust. A rose is the mount for a gasolier or an oil lamp, so what it collects is
// the plume of a burnt flame — a warm-black stain strongest at the centre and fading out —
// and cobweb grime in the undercuts. Nothing lands on it, because nothing on a ceiling
// faces up.
const ROSE_SURFACE = /* glsl */ `
uniform vec3  uTint;
uniform vec3  uGrimeCol;
uniform vec3  uSootCol;
uniform float uLeaves;
uniform float uBeads;
uniform float uEggs;
uniform float uSoot;
uniform float uGrime;
uniform float uCrazing;
uniform float uHair;
uniform float uPaint;

${PLASTER_LIB}

float roseH(vec2 uv, out float mLeaf, out float mEgg, out float mBead){
  vec2 q = (uv - 0.5) * 2.0;
  float r = length(q);
  float a = atan(q.y, q.x);

  mLeaf = 0.0; mEgg = 0.0; mBead = 0.0;
  float onRose = 1.0 - smoothstep(0.88, 0.94, r);
  float orn = 0.055 * onRose;                       // the plate stands off the ceiling

  // outer ogee sweeping down off the ceiling into the enriched ring
  orn += 0.075 * (1.0 - smoothstep(0.70, 0.90, r));

  // EGG AND DART ring
  float ringE = mem(r, 0.500, 0.700);
  vec2 ep = vec2(fract(a / TAU * uEggs) - 0.5, ringE - 0.5);
  float eggR = length(ep / vec2(0.235, 0.400));
  mEgg = (1.0 - smoothstep(0.92, 1.03, eggR)) * band(r, 0.512, 0.688, 0.020);
  orn += 0.150 * mEgg * sqrt(sat(1.0 - min(eggR, 1.0) * min(eggR, 1.0)));
  orn += 0.045 * (1.0 - smoothstep(0.0, 0.14, abs(eggR - 1.26))) * band(r, 0.505, 0.695, 0.020);
  float dartX = abs(abs(ep.x) - 0.5);
  orn += 0.095 * (1.0 - smoothstep(0.030, 0.058, dartX)) * band(r, 0.520, 0.680, 0.030);

  // BEAD ring
  float ringB = sin(PI * mem(r, 0.420, 0.500));
  float ba = fract(a / TAU * uBeads) - 0.5;
  mBead = (1.0 - smoothstep(0.26, 0.40, abs(ba))) * ringB;
  orn += 0.055 * ringB + 0.055 * mBead;

  // ACANTHUS. Twelve leaves radiating, alternating long and short — the alternation is what
  // stops a rosette reading as a cog. Each leaf is domed, with a raised central rib and
  // side lobes, and comes to a point.
  float la = a / TAU * uLeaves;
  float li = floor(la);
  float lf = fract(la) - 0.5;
  float tip = mix(0.430, 0.335, mod(li, 2.0));
  float lr = mem(r, 0.150, tip);
  float halfW = 0.5 * (0.28 + 0.72 * sin(PI * pow(lr, 0.62)));
  mLeaf = (1.0 - smoothstep(halfW * 0.70, halfW, abs(lf)))
        * (1.0 - smoothstep(0.94, 1.0, lr))
        * step(0.001, lr);
  float rib = 1.0 - smoothstep(0.0, 0.11, abs(lf));
  float lobe = 0.5 + 0.5 * cos(lf * PI * 4.0);
  orn += mLeaf * (0.115 * (0.45 + 0.55 * rib) + 0.045 * lobe) * (0.35 + 0.65 * sin(PI * sat(lr)));

  // astragal collar and the central boss, with the hole the hook comes through
  orn += 0.085 * sin(PI * mem(r, 0.100, 0.158));
  orn += 0.185 * (1.0 - smoothstep(0.048, 0.098, r));
  orn -= 0.230 * (1.0 - smoothstep(0.022, 0.042, r));

  return clamp(0.055 + orn * onRose, 0.0, 1.0);
}

float roseHt(vec2 uv){ float a, b, c; return roseH(uv, a, b, c); }

void surface(in vec2 uv, inout Surf s){
  float mLeaf, mEgg, mBead;
  float h = roseH(uv, mLeaf, mEgg, mBead);

  vec2 q = (uv - 0.5) * 2.0;
  float r = length(q);
  float onRose = 1.0 - smoothstep(0.88, 0.94, r);

  // the ceiling AROUND the rose is ordinary floated lime plaster, and it has to match or
  // the rose looks stuck onto a different material
  Trowel tw = trowelField(uv);

  float around = (roseHt(uv + vec2(0.00, 0.030)) + roseHt(uv - vec2(0.00, 0.030))
                + roseHt(uv + vec2(0.030, 0.00)) + roseHt(uv - vec2(0.030, 0.00))) * 0.25;
  float hollow = sat((around - h) * 5.0);

  float tooth = fbmT(uv * 340.0, 340.0, 3, 2.05, 0.50);
  float crazeMask = smoothstep(0.30, 0.84, pat(fbmT(uv * 5.0 + 13.0, 5.0, 3, 2.0, 0.55), 2.6));
  float cracks = crazeNet(uv * 22.0 + 7.0, 22.0, 0.052) * crazeMask * uCrazing;
  float hair = max(hairLayer(uv, 28.0, 0.30, 0.052, 5.0),
                   hairLayer(uv, 28.0, 0.22, 0.042, 31.0)) * uHair;

  // SOOT from whatever burned under it: a warm-black plume, densest on the plate and
  // trailing off across the ceiling, warped so it is never a clean circle.
  float sootR = r * (0.75 + 0.55 * fbmT(uv * 4.0 + 3.0, 4.0, 3, 2.0, 0.55));
  float soot = uSoot * sat(1.0 - smoothstep(0.20, 1.05, sootR));
  float grime = uGrime * clamp(hollow * 0.85 + cracks * 0.25, 0.0, 1.0)
              * (0.45 + 0.75 * fbmT(uv * 11.0 + 19.0, 11.0, 3, 2.0, 0.50));

  vec3 col = uTint;
  col *= 0.965 + tooth * 0.055;
  col *= 0.955 + h * 0.115;
  col *= 0.965 + tw.wave * 0.055 * (1.0 - onRose) + tw.wave * 0.020 * onRose;
  col *= 1.0 + tw.lap * 0.026 * (1.0 - onRose);
  col = mix(col, col * 0.90, cracks * 0.60);
  col = mix(col, col * 1.09 + vec3(0.012), hair * 0.50);
  col = mix(col, uGrimeCol, sat(grime) * 0.55);
  col = mix(col, uSootCol, sat(soot) * 0.42);

  s.albedo    = col;
  s.roughness = clamp(0.915 - uPaint * 0.170 - tooth * 0.040
                    + sat(soot) * 0.045 - sat(grime) * 0.070 + cracks * 0.030, 0.05, 1.0);
  s.metalness = 0.0;
  s.ao        = 1.0 - hollow * 0.50 - sat(grime) * 0.18 - cracks * 0.20;
  s.height    = clamp(h
                    + (1.0 - onRose) * ((tw.wave - 0.5) * 0.045 + tw.lap * 0.012)
                    + (tooth - 0.5) * 0.012 + hair * 0.006 - cracks * 0.012, 0.0, 1.0);
}
`;

// ---------------------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------------------

/**
 * Flat lime plaster for walls. One uv tile is about 2.4 m at size 1024.
 *
 * `grime` is a gradient rising from v = 0, so map the wall with v = 0 at the floor and do
 * not repeat vertically. For anything tiled or overhead pass `grime: 0`.
 */
export function plasterWall(opts = {}) {
  const o = {
    // WARM. Lime plaster is lime putty plus a pit sand, and the sand is what carries the
    // colour — everything from a buff to an ochre. The locked art
    // (Dev Art/1785320177684.png) measures R-B between +18 and +46 across its whole plaster
    // range, with R/B holding at 1.24-1.30 from the deepest shadow to the brightest lit
    // patch. The previous 0.812/0.780/0.706 is R/B 1.15, and once the studio's blue fill
    // (0xdfeaff) landed on it the RENDER measured R-B 9 to 13 and the return wall 2.8 —
    // i.e. effectively neutral. Raised to R/B 1.24 so the albedo alone sits where the art's
    // ratio does; the view also warms the fill, because half of that error was the light.
    tint: [0.848, 0.792, 0.684],
    grimeCol: [0.300, 0.268, 0.220],
    trowel: 1.0, crazing: 0.85, hair: 0.85, burnish: 0.55,
    grime: 0.85, soil: 0.45, repair: 0.7,
    size: 1024, repeat: [1, 1],
    // Integer shrink factor on the AUTHORED TILE. 1 = the 2.4 m tile this is written for;
    // 4 = a 0.6 m tile carrying identical physical detail at four times the texel density,
    // for anything the camera gets within a metre of. See uZoom in PLASTER_LIB.
    zoom: 1,
    ...opts,
  };
  return baker().standard({
    key: `plasterWall:${JSON.stringify(o)}`,
    size: o.size, surface: WALL_SURFACE,
    // heightScale is a slope per UV unit, so it tracks the tile: shrinking the tile by uZoom
    // doubles-and-more the UV gradient of the same physical bump, and leaving this alone
    // would make a near-field bake look like corrugated iron.
    heightScale: 0.030 / o.zoom, normalStrength: 1.0, repeat: o.repeat, anisotropy: 8,
    uniforms: {
      uTint: new THREE.Vector3(...o.tint),
      uGrimeCol: new THREE.Vector3(...o.grimeCol),
      uTrowel: o.trowel, uCrazing: o.crazing, uHair: o.hair, uBurnish: o.burnish,
      uGrime: o.grime, uSoil: o.soil, uRepair: o.repair, uZoom: o.zoom,
    },
  }, { envMapIntensity: 1.0, normalScale: new THREE.Vector2(0.9, 0.9) });
}

/**
 * The same lime plaster, floated overhead: limewashed a shade whiter, no gravity grime
 * (nothing runs down a ceiling), crazed harder — a ceiling coat is thinner and cracks more
 * — and left duller, because nobody ever burnished a ceiling.
 */
export function plasterCeiling(opts = {}) {
  return plasterWall({
    tint: [0.880, 0.842, 0.752],
    crazing: 1.0, burnish: 0.28, grime: 0.0, soil: 0.60, repair: 0.55,
    ...opts,
  });
}

/**
 * THE BROKEN FACE. Put this on the rim of any hole in a plaster coat and on the back and
 * edges of anything that has fallen out of one.
 *
 * AUTHORED FOR A 0.55 m TILE — map it that way, or the aggregate comes out the size of
 * cobbles. A 20 mm slab rim therefore wants v spanning 20/550 = 0.036 of the tile, which is
 * 37 texels across the thickness: enough to carry two or three grains and a hair end, which
 * is all the eye needs from a lip that narrow.
 *
 * `keys: 1` switches it from a fractured section to the keyed back of a fallen fragment.
 */
export function plasterBreak(opts = {}) {
  const o = {
    // Paler and markedly greyer than the finished face (0.812, 0.780, 0.706). A fracture
    // exposes the coarse coat, which never had the limewash or the burnish on it, and
    // getting this step wrong is what makes a break read as a shadow rather than as
    // material: too dark and it is a hole, too warm and it is the same wall with dirt on it.
    tint: [0.800, 0.762, 0.688],
    dustCol: [0.650, 0.620, 0.560],
    agg: 1.0, voids: 0.85, hair: 1.0, keys: 0.0, dust: 0.55,
    size: 1024, repeat: [1, 1],
    // as plasterWall: integer shrink on the 0.55 m authored tile
    zoom: 1,
    ...opts,
  };
  return baker().standard({
    key: `plasterBreak:${JSON.stringify(o)}`,
    size: o.size, surface: BREAK_SURFACE,
    heightScale: 0.035 / o.zoom, normalStrength: 1.0, repeat: o.repeat, anisotropy: 8,
    uniforms: {
      uTint: new THREE.Vector3(...o.tint),
      uDustCol: new THREE.Vector3(...o.dustCol),
      uAgg: o.agg, uVoid: o.voids, uHair: o.hair, uKeys: o.keys, uDust: o.dust,
      uZoom: o.zoom,
    },
  }, { envMapIntensity: 1.0, normalScale: new THREE.Vector2(1.0, 1.0) });
}

/** The keyed back of a fallen fragment: the beads that were squeezed between the laths. */
export function plasterKeyBack(opts = {}) {
  return plasterBreak({ keys: 1.0, dust: 0.35, voids: 0.55, ...opts });
}

/**
 * Cast ornamental plasterwork: cornice runs, enriched mouldings.
 *
 * Author it so one uv tile is roughly square in world space. The default of 6 enrichment
 * units per tile over a 300 mm band puts a tile at about 360 x 300 mm, so a 4 m cornice run
 * wants `repeat: [11, 1]`.
 *
 * By default the height map carries ONLY the enrichment, because the swept geometry is
 * expected to carry the classical section — sweep it from `corniceSection()`, which returns
 * exactly the curve this shader was authored against. Pass `section: 1` to fold the profile
 * into the normal map instead and apply it to a flat band.
 */
export function plasterOrnament(opts = {}) {
  const o = {
    // limewashed whiter than the wall it sits on, but still warmer than neutral — a cast
    // that reads blue-white against a cream wall is the giveaway that the whole rig is cold
    tint: [0.892, 0.856, 0.762],
    dustCol: [0.612, 0.586, 0.532],
    grimeCol: [0.262, 0.236, 0.196],
    units: 6, dentils: 2,
    dust: 0.85, grime: 0.80, paint: 0.55, crazing: 0.55, hair: 0.40,
    section: 0,
    size: 1024, repeat: [1, 1],
    ...opts,
  };
  return baker().standard({
    key: `plasterOrnament:${JSON.stringify(o)}`,
    size: o.size, surface: ORNAMENT_SURFACE,
    heightScale: 0.140, normalStrength: 1.0, repeat: o.repeat, anisotropy: 8,
    uniforms: {
      uTint: new THREE.Vector3(...o.tint),
      uDustCol: new THREE.Vector3(...o.dustCol),
      uGrimeCol: new THREE.Vector3(...o.grimeCol),
      uUnits: o.units, uDentils: o.dentils,
      uDust: o.dust, uGrime: o.grime, uPaint: o.paint,
      uCrazing: o.crazing, uHair: o.hair, uSection: o.section,
      // PLASTER_LIB declares uZoom, so every shader that includes it must bind one or fq()
      // divides by zero. A cornice is always seen at room distance and never wants a
      // near-field tile, so it is pinned at 1 rather than exposed as an option — and being
      // outside `o` it does not change this material's bake key.
      uZoom: 1.0,
    },
  }, { envMapIntensity: 1.0, normalScale: new THREE.Vector2(1.0, 1.0) });
}

/** A cornice preset with the profile folded into the normal map, for a flat band. */
export function plasterCorniceBand(opts = {}) {
  return plasterOrnament({ section: 1, ...opts });
}

/**
 * A ceiling rose. Apply to a disc with 0..1 uvs — the ornament fills the tile and the
 * plain floated ceiling takes over outside r = 0.9, so the plate blends into the ceiling
 * instead of ending on a hard edge.
 */
export function plasterRose(opts = {}) {
  const o = {
    tint: [0.894, 0.858, 0.766],
    grimeCol: [0.250, 0.228, 0.192],
    sootCol: [0.145, 0.132, 0.120],
    leaves: 12, beads: 40, eggs: 20,
    soot: 0.70, grime: 0.85, crazing: 0.75, hair: 0.45, paint: 0.50,
    size: 1024, repeat: [1, 1],
    ...opts,
  };
  return baker().standard({
    key: `plasterRose:${JSON.stringify(o)}`,
    size: o.size, surface: ROSE_SURFACE,
    heightScale: 0.095, normalStrength: 1.0, repeat: o.repeat, anisotropy: 8,
    uniforms: {
      uTint: new THREE.Vector3(...o.tint),
      uGrimeCol: new THREE.Vector3(...o.grimeCol),
      uSootCol: new THREE.Vector3(...o.sootCol),
      uLeaves: o.leaves, uBeads: o.beads, uEggs: o.eggs,
      uSoot: o.soot, uGrime: o.grime, uCrazing: o.crazing,
      uHair: o.hair, uPaint: o.paint,
      uZoom: 1.0,   // see plasterOrnament
    },
  }, { envMapIntensity: 1.0, normalScale: new THREE.Vector2(1.0, 1.0) });
}

/**
 * The cornice section, in JS, as normalised (projection, height) pairs with t running 0 at
 * the wall to 1 at the ceiling. This is the SAME curve as `sectionH()` in ORNAMENT_SURFACE
 * — if you change one, change the other, or the swept geometry and the cast ornament will
 * disagree about where the members sit.
 *
 * Multiply `d` by the projection you want and `t` by the band height:
 *
 *   corniceSection(48).map(([d, t]) => [d * 0.22, t * 0.30])
 *
 * @param {number} samples
 * @returns {Array<[number, number]>} [projection 0..~0.66, position across the band 0..1]
 */
export function corniceSection(samples = 48) {
  const mem = (t, a, b) => Math.min(Math.max((t - a) / (b - a), 0), 1);
  const ss = (a, b, x) => { const u = Math.min(Math.max((x - a) / (b - a), 0), 1); return u * u * (3 - 2 * u); };
  const out = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    let h = 0.05;
    h += 0.055 * ss(0.000, 0.050, t);
    const mc = mem(t, 0.055, 0.210);
    h += 0.150 * (1 - Math.sqrt(Math.max(1 - mc * mc, 0)));
    h += 0.055 * Math.sin(Math.PI * mem(t, 0.210, 0.275));
    h += 0.030 * mem(t, 0.275, 0.300);
    h += 0.115 * Math.sin(0.5 * Math.PI * mem(t, 0.300, 0.520));
    h += 0.028 * mem(t, 0.520, 0.570);
    h += 0.020 * mem(t, 0.730, 0.775);
    const mk = mem(t, 0.775, 1.000);
    h += 0.160 * (mk < 0.5 ? 0.5 * Math.pow(mk * 2, 1.8)
                           : 1 - 0.5 * Math.pow(Math.max(1 - mk, 0) * 2, 1.8));
    out.push([h, t]);
  }
  return out;
}
