import * as THREE from 'three';
import { baker } from '../baker.js';

/**
 * Dark walnut wall panelling, gilt mouldings, and real board / parquet floors.
 *
 * Worked against Dev Art 1785319916301, the one piece of in-world mansion art: the study's
 * walls are dark walnut in a frame-and-panel layout, with the panel fields catching a deep
 * French-polish sheen and the mouldings holding grime in their hollows. Also worked against
 * refs/_sheets/hitman.png and refs/_sheets/bf1.png for how gilded panelling reads at room
 * distance.
 *
 * What makes wood read as wood rather than as brown noise:
 *   - CATHEDRAL FIGURE. Growth rings are nested arcs, not stripes. Sampling a low-frequency
 *     field through an abs() gives the nested-V pattern a flat-sawn board actually shows.
 *   - The grain runs ALONG the board and is much finer across it than across the board.
 *   - Pores. Walnut is open-grained: fine dark flecks elongated along the grain, and they
 *     live in roughness as much as in colour. Semi-ring-porous: the pores cluster toward
 *     the earlywood side of each growth arc rather than spreading evenly across the board.
 *   - Medullary rays. Quarter-sawn stock shows fine bright flecks running ACROSS the grain
 *     — sparse, low-contrast, and mostly absent from a flat-sawn face.
 *   - Per-board colour drift and a rotated figure per panel, or the wall tiles visibly.
 *     Adjacent panels are book-matched (mirror images), not independent random offcuts —
 *     consecutive veneer leaves are opened like a book.
 *   - Polish sits ON the wood: a clearcoat lobe over the grain, duller in the mouldings
 *     where a cloth never reaches.
 *   - Gilt mouldings. Water-gilded gold leaf on the bevel band only, with red bole showing
 *     through the worn high points and a faint ~85 mm leaf-joint grid — the detail that
 *     stops gilt reading as a flat gold fill.
 *
 * fbmT SUMS OCTAVES, so by the central limit theorem its output is a narrow bell about 0.5
 * and essentially never reaches a threshold like 0.72. The pore gate below was written at
 * exactly that threshold and had therefore never drawn a single pore — the fourth file on
 * this project with this bug. pat() stretches the distribution about its midpoint first, so
 * a threshold means what it appears to mean.
 *
 * THE SAME TRAP HAS A SECOND FORM, and this file had that one too until 2026-08-03: an fbm
 * used not as a GATE but as a LERP FACTOR. `figure()`'s output went straight into the
 * uWoodDark -> uWood mix in board(), and measurement put its p01..p99 band at 0.326..0.659,
 * so three quarters of the authored tonal range was unreachable and every board rendered the
 * same flat mid-brown. A gate that never fires draws nothing and is obvious once looked for;
 * a lerp factor that only ever visits the middle draws something plausible-looking and hides.
 * Look for BOTH. Details at the fix, in board().
 */

// Shared across all three bakes (panel, boards, parquet): the pat() gate, the cathedral
// figure, and one piece of timber in its own local uv. Textually inlined into each surface
// string below — each bake is a separate compiled program, so this just avoids maintaining
// the same wood three times.
const WALNUT_COMMON = /* glsl */ `
float pat(float v, float k){ return clamp((v - 0.5) * k + 0.5, 0.0, 1.0); }

// Cathedral figure: nested arcs. abs() around a wandering centre line is what turns
// stripes into the nested Vs of a flat-sawn board.
float figure(vec2 p, float seed){
  float wander = fbmT(vec2(p.y * 0.35, seed) , 32.0, 3, 2.0, 0.5) - 0.5;
  float d = abs(p.x + wander * 1.6);
  float rings = fbmT(vec2(d * 5.2, p.y * 0.55 + seed), 48.0, 4, 2.05, 0.55);
  return rings;
}

// One piece of timber, in its own local uv (x = across the board, y = along the grain).
// quarterSawn is 0..1: 0 is a flat-sawn face (rays essentially absent), 1 is quarter-sawn
// stock (rays common) — furniture stiles are cut quarter-sawn for stability, flat panel
// fields are not.
void board(vec2 uv, float seed, float quarterSawn, out vec3 col, out float rough, out float relief){
  vec2 p = uv * vec2(3.0, 7.0);

  // THE FIGURE HAS TO BE STRETCHED, AND IT WAS NOT. figure() returns a raw 4-octave fbmT.
  // fbmT sums octaves, so its output is a narrow bell about 0.5 — measured off a 512 bake of
  // this exact code it runs 0.326 at p01 to 0.659 at p99. Fed straight into the mix() below
  // that used only a quarter of the authored uWoodDark -> uWood range (t spanned 0.365..0.627
  // measured), so every board came out the same flat mid-brown and the cathedral arcs — which
  // ARE correctly shaped, verified by dumping the field on its own — never appeared. The only
  // thing left visible was the fine grain and the pore speckle, which is why the floor read as
  // brown sandpaper rather than timber.
  //
  // This is the same narrow-bell trap the pore and ray gates below already carry pat() for.
  // It is the reason pat() is in this file at all; it had simply never been applied to the
  // figure itself. k = 2.4 takes the p01..p99 band to 0.10..0.88, i.e. the wood now actually
  // reaches both authored tones, without clipping enough to flatten into two-tone banding.
  float fig = pat(figure(p, seed), 2.4);

  // Fine grain along the board. Stretched for the same reason as the figure — at its raw
  // width this contributed a 0.31..0.69 dither and nothing readable — and dropped from 190 to
  // 78 cycles across the board. 190 was PAST the bake's Nyquist limit: the floor hands board()
  // one board's own uv, which spans a TENTH of the baked tile, so 190 cycles across the board
  // landed as 1900 across a 1024 texture — about half a texel per cycle. That does not render
  // as grain, it renders as per-texel noise that mips straight to flat grey.
  float grain = pat(fbmT(vec2(uv.x * 78.0 + seed * 31.0, uv.y * 7.0), 256.0, 3, 2.0, 0.5), 1.6);

  // open pores: short dark dashes elongated along the grain. Gated through pat() — see the
  // file header — and then multiplied by the figure field so they cluster toward the
  // earlywood side of each growth arc instead of spreading evenly (semi-ring-porous).
  //
  // Coverage was measured at 17.2% of texels, which is not "sparse flecks" — it is a mottle
  // over a sixth of the surface — and at 420 cycles per board it was a quarter of a texel per
  // cycle on the floor, i.e. pure aliasing. Coarsened to a frequency the bake can resolve and
  // the gate raised so the pores read as pores.
  float pore = smoothstep(0.80, 0.97, pat(fbmT(vec2(uv.x * 165.0, uv.y * 20.0 + seed), 512.0, 2, 2.0, 0.5), 2.6));
  pore *= fig;

  // medullary rays: fine bright flecks running ACROSS the grain. High frequency on the
  // axis grain itself runs slowly on (y) and low frequency on the axis it runs fast on (x)
  // gives streaks perpendicular to the grain direction — the opposite anisotropy of
  // 'grain' above. Also gated through pat() so the threshold actually fires, and scaled by
  // quarterSawn so it is common in quarter-sawn stock and rare on a flat-sawn face.
  // Frequency cut for the same Nyquist reason as the two fields above.
  float ray = smoothstep(0.87, 0.97, pat(fbmT(vec2(uv.y * 150.0 + seed * 11.0, uv.x * 10.0), 384.0, 2, 2.0, 0.5), 3.0));
  ray *= quarterSawn;

  float t = fig * 0.72 + grain * 0.28;
  col = mix(uWoodDark, uWood, clamp(t, 0.0, 1.0));
  col *= 0.94 + hash11(seed * 17.3) * 0.13;       // board-to-board drift
  col = mix(col, uWoodDark * 0.72, pore * 0.55);
  col = mix(col, uWood * 1.55 + vec3(0.02, 0.015, 0.03), ray * 0.42);   // faint cool iridescent fleck

  rough = 0.34 - fig * 0.06 + pore * 0.20 + grain * 0.04 - ray * 0.06;
  relief = fig * 0.25 + grain * 0.10 - pore * 0.45;
}
`;

// ---------------------------------------------------------------------------
// Frame-and-panel wall panelling, with an optional gilded moulding.
// ---------------------------------------------------------------------------
const WALNUT_SURFACE = /* glsl */ `
uniform float uPanelsX;
uniform float uPanelsY;
uniform float uStile;        // frame width, in cell units
uniform float uBevel;
uniform vec3  uWood;
uniform vec3  uWoodDark;
uniform float uGrime;
uniform float uSeed;
uniform float uGilt;         // 0 plain walnut moulding, 1 fully water-gilded

${WALNUT_COMMON}

void surface(in vec2 uv, inout Surf s){
  vec2 g = uv * vec2(uPanelsX, uPanelsY);
  vec2 cid = floor(g);
  vec2 luv = fract(g);

  // Book-matched panels: adjacent panels are mirror images, because consecutive veneer
  // leaves are opened like a book. The PAIR shares one seed — so the mirrored halves
  // genuinely match — but the pair index still drives the hash, so the wall does not
  // become one motif stamped over and over.
  vec2 pairCid = vec2(floor(cid.x / 2.0), cid.y);
  float seed = hash12(pairCid + uSeed) * 90.0;

  // frame-and-panel: a stile/rail border with a recessed field inside
  vec2 d = min(luv, 1.0 - luv);
  float edge = min(d.x, d.y);
  float inField = smoothstep(uStile, uStile + uBevel, edge);
  float onBevel = smoothstep(uStile - uBevel * 0.4, uStile + uBevel, edge) * (1.0 - inField);

  // wear on the arris where shoulders and furniture have rubbed the polish off — computed
  // early because the gilt wear (bole showing through) below rides the same term.
  float arris = (1.0 - smoothstep(0.0, uBevel * 0.8, abs(edge - uStile)));

  // the field's figure is rotated per panel so the wall never repeats, then mirrored on
  // alternate columns for the book match.
  float ang = (hash11(seed) - 0.5) * 0.5;
  vec2 fuv = rot(ang) * (luv - 0.5) + 0.5;
  if (mod(cid.x, 2.0) > 0.5) fuv.x = 1.0 - fuv.x;

  vec3 colF; float roughF, reliefF;
  board(fuv, seed, 0.08, colF, roughF, reliefF);                           // field: flat-sawn
  vec3 colS; float roughS, reliefS;
  board(luv.yx * vec2(0.4, 1.0), seed + 7.0, 0.85, colS, roughS, reliefS); // stiles: quarter-sawn, grain the other way

  vec3 col = mix(colS, colF, inField);
  float rough = mix(roughS, roughF, inField);
  float relief = mix(reliefS, reliefF, inField);
  float metal = 0.0;

  // ---- GILT: water-gilded gold leaf, applied to the bevel/moulding band ONLY — never the
  // panel field, never the stiles themselves. uGilt is the plain<->gilded blend.
  if (uGilt > 0.001) {
    vec3 goldHigh = vec3(0.725, 0.545, 0.235);   // #B98B3C, burnished high points
    vec3 bole     = vec3(0.478, 0.231, 0.133);   // #7A3B22, red bole under worn leaf

    // leaf joints: gold leaf comes in ~85 mm squares. At panel scale that reads as a
    // faint, large, low-contrast grid — the detail that stops gilt reading as a flat gold
    // fill — with occasional darker overlap lines where one leaf laps the next.
    vec2 leafCell  = uv * 11.0 + 4.0;
    vec2 leafId    = floor(leafCell);
    vec2 leafLuv   = fract(leafCell);
    vec2 leafEdge  = min(leafLuv, 1.0 - leafLuv);
    float leafSeam    = 1.0 - smoothstep(0.0, 0.028, min(leafEdge.x, leafEdge.y));
    float leafOverlap = leafSeam * step(0.72, hash12(leafId + 8.3));
    float leafTone    = (hash12(leafId + 2.1) - 0.5) * 0.10;

    vec3 gold = goldHigh * (1.0 + leafTone);
    gold = mix(gold, gold * 0.80, leafOverlap);

    // burnished on the ridge (the same arris term the wood wear below reads), duller in
    // the hollows of the moulding profile.
    float giltRoughBase = mix(0.55, 0.28, arris);

    // red bole showing through where the burnisher and later hands have worn the leaf
    // thinnest — a narrow, PATCHY band right at the ridge, not a clean uniform ring.
    float wearPatch = fbmT(uv * 40.0 + seed, 40.0, 3, 2.0, 0.5);
    float boleAmt = smoothstep(0.55, 0.98, arris)
                  * mix(0.25, 1.0, smoothstep(0.35, 0.75, wearPatch)) * 0.8;

    vec3  giltCol   = mix(gold, bole, boleAmt);
    float giltRough = mix(giltRoughBase, 0.62, boleAmt);
    float giltMetal = mix(1.0, 0.12, boleAmt);

    float giltMask = onBevel * uGilt;
    col   = mix(col,   giltCol,   giltMask);
    rough = mix(rough, giltRough, giltMask);
    metal = mix(metal, giltMetal, giltMask);
  }

  // GRIME collects in the moulding hollow and along the bottom rail — gravity and hands.
  // Gilt does not clean itself: this applies whether or not uGilt is on.
  float hollow = (1.0 - inField) * (1.0 - onBevel);
  float low = 1.0 - smoothstep(0.0, 0.35, uv.y);
  float grime = clamp(hollow * 0.55 + low * 0.45, 0.0, 1.0) * uGrime;
  grime *= 0.5 + fbmT(uv * 26.0 + 3.0, 64.0, 3, 2.0, 0.5);
  col = mix(col, vec3(0.055, 0.045, 0.036), grime * 0.45);
  rough = mix(rough, 0.78, grime * 0.6);

  // dust settled on every upward-facing moulding edge
  float ledge = (1.0 - smoothstep(0.0, uBevel * 1.4, abs(d.y - uStile))) * step(luv.y, 0.5);
  col = mix(col, vec3(0.34, 0.32, 0.29), ledge * 0.18 * uGrime);
  rough = mix(rough, 0.85, ledge * 0.35);

  // extra polish wear right at the arris, on top of whatever gilt/wood sits there
  rough += arris * 0.16;

  s.albedo    = col;
  s.roughness = clamp(rough, 0.05, 1.0);
  s.metalness = metal;
  s.ao        = 1.0 - hollow * 0.45 - grime * 0.15;
  s.height    = 0.5 + inField * 0.10 + relief * 0.05 - hollow * 0.22;
}
`;

export function walnutPanel(opts = {}) {
  const o = {
    panelsX: 3, panelsY: 2, stile: 0.16, bevel: 0.035,
    wood: [0.213, 0.132, 0.079],
    woodDark: [0.072, 0.042, 0.026],
    grime: 0.8, seed: 3.0, size: 1024, repeat: [1, 1],
    gilt: 0.0,
    ...opts,
  };
  return baker().standard({
    key: `walnut:${JSON.stringify(o)}`,
    size: o.size, surface: WALNUT_SURFACE,
    heightScale: 0.06, normalStrength: 1.0, repeat: o.repeat, anisotropy: 8,
    uniforms: {
      uPanelsX: o.panelsX, uPanelsY: o.panelsY, uStile: o.stile, uBevel: o.bevel,
      uWood: new THREE.Vector3(...o.wood), uWoodDark: new THREE.Vector3(...o.woodDark),
      uGrime: o.grime, uSeed: o.seed, uGilt: o.gilt,
    },
  }, {
    clearcoat: 0.55, clearcoatRoughness: 0.16, envMapIntensity: 1.0,
    normalScale: new THREE.Vector2(0.8, 0.8),
  }, THREE.MeshPhysicalMaterial);
}

// ---------------------------------------------------------------------------
// A real board floor: long planks, staggered end joints, per-board tone drift, heavier
// wear along the walking lanes. NOT walnutPanel with a wide aspect ratio — that gave a
// 7-across panel grid with a hairline frame, which is not a floor.
// ---------------------------------------------------------------------------
const WALNUT_FLOOR_SURFACE = /* glsl */ `
uniform float uBoardsX;   // boards across the tile's width
uniform float uSegLen;    // length-segments per board run — where the staggered end joints fall
uniform float uJointW;    // joint half-width, in local segment units
uniform float uWear;      // walking-lane wear intensity
uniform vec3  uWood;
uniform vec3  uWoodDark;
uniform float uGrime;
uniform float uSeed;

${WALNUT_COMMON}

void surface(in vec2 uv, inout Surf s){
  // Long boards running along V. rowGrid's "row" axis (offset once per row) becomes the
  // board's WIDTH index here, so every board keeps one fixed lateral position; its "x"
  // axis (the one that gets offset) becomes the LENGTH axis — that offset is exactly the
  // staggered end joint a real strip floor is laid with. An irrational step makes the
  // per-board offset look hashed without ever repeating in a visible cycle.
  const float ROW_OFFSET = 0.6180339887;
  vec4 grid = rowGrid(uv.yx, vec2(uSegLen, uBoardsX), ROW_OFFSET);
  float boardCol = grid.y;     // which board, across the width
  float segId    = grid.x;     // which length-segment of that board
  vec2  local    = grid.zw;    // local.x along the board length, local.y across its width

  float seed = hash12(vec2(segId, boardCol) + uSeed * 13.0) * 90.0;

  vec3 col; float rough, relief;
  board(vec2(local.y, local.x), seed, 0.12, col, rough, relief);   // (width, length) into board()'s (x, y)
  col *= 0.92 + hash11(boardCol * 31.7 + segId * 5.3) * 0.16;      // per-board tone drift, beyond one plank's own

  // joints: tight, both the long seam between boards and the staggered end joints
  vec2 jd = min(local, 1.0 - local);
  float joint = 1.0 - smoothstep(uJointW * 0.5, uJointW, min(jd.x, jd.y));
  col = mix(col, uWoodDark * 0.55, joint * 0.65);
  rough = mix(rough, 0.70, joint * 0.55);

  float grimeN = fbmT(uv * 22.0 + 5.0, 22.0, 3, 2.0, 0.5);
  float grime = (joint * 0.5 + grimeN * 0.12) * uGrime;
  col = mix(col, vec3(0.05, 0.042, 0.034), grime * 0.4);
  rough = mix(rough, 0.80, grime * 0.5);

  // heavier wear along the walking lanes: broad and low-frequency, two offset scales so it
  // reads as a worn path rather than a stripe or a single blob.
  float t1 = fbmT(uv * 1.8, 3.0, 3, 2.0, 0.55);
  float t2 = fbmT(uv * vec2(5.0, 2.4) + 4.0, 3.0, 3, 2.0, 0.5);
  float traffic = sat(smoothstep(0.42, 0.86, t1 * 0.7 + t2 * 0.3)) * uWear;
  rough += traffic * 0.14;
  col *= 1.0 - traffic * 0.05;

  s.albedo    = col;
  s.roughness = clamp(rough, 0.05, 1.0);
  s.metalness = 0.0;
  s.ao        = 1.0 - joint * 0.35;
  s.height    = 0.5 + relief * 0.05 - joint * 0.28;
}
`;

/** Real board floor: long planks, staggered end joints, per-board drift, walking wear. */
export function walnutBoards(opts = {}) {
  const o = {
    boardsX: 10, segLen: 3, jointW: 0.025, wear: 0.6,
    wood: [0.213, 0.132, 0.079],
    woodDark: [0.072, 0.042, 0.026],
    grime: 0.5, seed: 3.0, size: 1024, repeat: [1, 1],
    ...opts,
  };
  return baker().standard({
    key: `walnutBoards:${JSON.stringify(o)}`,
    size: o.size, surface: WALNUT_FLOOR_SURFACE,
    heightScale: 0.045, normalStrength: 1.0, repeat: o.repeat, anisotropy: 8,
    uniforms: {
      uBoardsX: o.boardsX, uSegLen: o.segLen, uJointW: o.jointW, uWear: o.wear,
      uWood: new THREE.Vector3(...o.wood), uWoodDark: new THREE.Vector3(...o.woodDark),
      uGrime: o.grime, uSeed: o.seed,
    },
  }, {
    clearcoat: 0.35, clearcoatRoughness: 0.24, envMapIntensity: 1.0,
    normalScale: new THREE.Vector2(0.8, 0.8),
  }, THREE.MeshPhysicalMaterial);
}

// ---------------------------------------------------------------------------
// Ballroom parquet: basket-weave blocks of parallel strips, each block alternating
// orientation with its neighbours so the strips interlock — the Versailles-panel reading
// of "parquet". A separate function from walnutBoards on purpose: a plank floor and a
// woven parquet panel are different joinery, not one function with a flag.
// ---------------------------------------------------------------------------
const WALNUT_PARQUET_SURFACE = /* glsl */ `
uniform float uBlocks;   // basket-weave blocks across each axis
uniform float uStrips;   // parallel strips per block
uniform float uJointW;
uniform vec3  uWood;
uniform vec3  uWoodDark;
uniform float uGrime;
uniform float uSeed;

${WALNUT_COMMON}

void surface(in vec2 uv, inout Surf s){
  vec2 blockUV  = uv * uBlocks;
  vec2 blockId  = floor(blockUV);
  vec2 blockLuv = fract(blockUV);
  float orient  = mod(blockId.x + blockId.y, 2.0);
  vec2  o       = orient > 0.5 ? blockLuv.yx : blockLuv.xy;   // o.x across the strips, o.y along them

  float stripIdx = floor(o.x * uStrips);
  vec2  local     = vec2(fract(o.x * uStrips), o.y);          // local.x across one strip, local.y along it

  float seed = hash12(blockId * 3.1 + vec2(stripIdx, orient) * 7.7 + uSeed * 13.0) * 90.0;

  vec3 col; float rough, relief;
  board(vec2(local.x, local.y * 2.2), seed, 0.15, col, rough, relief);
  col *= 0.93 + hash11(seed * 21.3) * 0.14;

  // joints: strip-to-strip within a block, and the block seam where two weaves meet
  vec2 jd = min(local, 1.0 - local);
  float stripJoint = 1.0 - smoothstep(uJointW * 0.5, uJointW, jd.x);
  vec2  bd = min(blockLuv, 1.0 - blockLuv);
  float blockJoint = 1.0 - smoothstep(uJointW * 1.4, uJointW * 2.4, min(bd.x, bd.y));
  float joint = max(stripJoint, blockJoint);
  col = mix(col, uWoodDark * 0.55, joint * 0.6);
  rough = mix(rough, 0.68, joint * 0.5);

  float grimeN = fbmT(uv * 30.0 + 7.0, 30.0, 3, 2.0, 0.5);
  float grime = (joint * 0.35 + grimeN * 0.08) * uGrime;
  col = mix(col, vec3(0.05, 0.042, 0.034), grime * 0.35);
  rough = mix(rough, 0.75, grime * 0.4);

  s.albedo    = col;
  s.roughness = clamp(rough, 0.06, 1.0);
  s.metalness = 0.0;
  s.ao        = 1.0 - joint * 0.3;
  s.height    = 0.5 + relief * 0.04 - joint * 0.22;
}
`;

/** Ballroom floor: basket-weave (Versailles-panel) parquet. */
export function walnutParquet(opts = {}) {
  const o = {
    blocks: 4, strips: 3, jointW: 0.05,
    wood: [0.213, 0.132, 0.079],
    woodDark: [0.072, 0.042, 0.026],
    grime: 0.4, seed: 5.0, size: 1024, repeat: [1, 1],
    ...opts,
  };
  return baker().standard({
    key: `walnutParquet:${JSON.stringify(o)}`,
    size: o.size, surface: WALNUT_PARQUET_SURFACE,
    heightScale: 0.035, normalStrength: 1.0, repeat: o.repeat, anisotropy: 8,
    uniforms: {
      uBlocks: o.blocks, uStrips: o.strips, uJointW: o.jointW,
      uWood: new THREE.Vector3(...o.wood), uWoodDark: new THREE.Vector3(...o.woodDark),
      uGrime: o.grime, uSeed: o.seed,
    },
  }, {
    clearcoat: 0.5, clearcoatRoughness: 0.18, envMapIntensity: 1.0,
    normalScale: new THREE.Vector2(0.8, 0.8),
  }, THREE.MeshPhysicalMaterial);
}
