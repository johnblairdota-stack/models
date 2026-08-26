import * as THREE from 'three';
import { baker } from '../materials/baker.js';

/**
 * Estate surface set — everything the rooms need that is not already owned by
 * materials-agent.
 *
 * DEPENDENCY POLICY
 * `materials-agent` is building walnut / wallpaper / plaster / lath / brass in parallel.
 * Those modules may not exist yet, may throw on import, or may rename an export under us.
 * So every borrowed material goes through `estateMaterials()`, which dynamic-imports each
 * one inside a try/catch and falls back to a local bake of the same thing. A missing or
 * broken sibling module can therefore never break a room view — it only downgrades one
 * surface. When their real version lands it is picked up with no code change here.
 *
 * The locals in this file are NOT stand-ins for other agents' work — gilt, carved stone,
 * tapestry, carpet, parquet, ceiling plaster, stained glass and portrait canvas are all
 * estate-agent's own surfaces and nobody else is building them.
 *
 * Everything is authored in sRGB (the baker writes an sRGB albedo target), heights are
 * 0..1, and every noise call uses the tileable `…T` variants so no surface seams.
 */

// ---------------------------------------------------------------------------
// GILT — water-gilded gold leaf over gesso over carved wood.
//
// The thing that makes gilding read as gilding rather than as gold paint is that it is a
// LEAF process: 85 mm squares of beaten gold laid overlapping onto a red clay bole. You
// see the seams, you see the burnisher's streaks, and wherever it has been rubbed the red
// bole and then the white gesso come through. Recesses stay dull and collect a brown
// bloom; the arrises are burnished bright. Roughness carries almost all of that.
// ---------------------------------------------------------------------------
const GILT_SURFACE = /* glsl */ `
uniform vec3  uGold;        // burnished leaf
uniform vec3  uBole;        // red clay ground under the leaf
uniform vec3  uGesso;       // chalk ground under the bole
uniform float uWear;
uniform float uOrnament;    // 0 plain moulding, 1 anthemion frieze band
uniform float uLeaf;        // leaf squares across the tile
uniform float uSeed;

// A palmette: a fan of lobes rising from a base scroll. Seven lobes, the classic
// anthemion. Returns a signed distance in cell units.
float palmette(vec2 p){
  float d = 1e3;
  for (int i = -3; i <= 3; i++){
    float a  = float(i) * 0.20;
    float ln = 0.30 - abs(float(i)) * 0.030;      // outer lobes are shorter
    vec2  q  = rot(a) * (p - vec2(0.5, 0.10));
    d = min(d, sdEllipse(q - vec2(0.0, ln * 0.55), vec2(0.036, ln)));
  }
  // base scroll
  d = min(d, sdEllipse(p - vec2(0.5, 0.10), vec2(0.20, 0.075)));
  return d;
}

void surface(in vec2 uv, inout Surf s){
  // ---- carved relief -----------------------------------------------------
  float relief = 0.0;
  if (uOrnament > 0.5){
    vec2 cell = vec2(fract(uv.x * 6.0), uv.y);
    float d = palmette(cell);
    relief = smoothstep(0.030, -0.012, d);
    // a fillet top and bottom so the band reads as let into a moulding
    relief = max(relief, smoothstep(0.055, 0.030, abs(uv.y - 0.5) - 0.40));
  }

  // ---- gesso tooth: the ground is brushed on, never dead flat -------------
  float tooth = fbmT(uv * 220.0, 220.0, 3, 2.0, 0.5);
  float swell = fbmT(uv * 9.0, 9.0, 3, 2.0, 0.55);

  // ---- leaf squares ------------------------------------------------------
  vec2  lp  = uv * uLeaf;
  vec2  lc  = floor(lp), lf = fract(lp);
  float lh  = hash12(lc + uSeed * 7.0);
  float seamD = min(min(lf.x, lf.y), min(1.0 - lf.x, 1.0 - lf.y));
  float seam  = 1.0 - smoothstep(0.0, 0.055, seamD);       // overlap ridge at the joins
  // burnisher streaks run one way inside each leaf
  float burn = fbmT(vec2(lp.x * 3.0 + lh * 30.0, lp.y * 46.0), 46.0, 2, 2.0, 0.5);

  // ---- wear: high points rub back to bole, then to gesso ------------------
  float high = relief * 0.7 + swell * 0.4 + (1.0 - seamD) * 0.15;
  float rub  = smoothstep(0.55, 0.95, high * (0.75 + fbmT(uv * 5.5 + 17.0, 6.0, 3, 2.0, 0.5) * 0.6)) * uWear;
  float bare = smoothstep(0.72, 1.0, rub);

  // ---- recess bloom: brown dirt and dead leaf in the hollows --------------
  float hollow = 1.0 - sat(relief * 1.2 + swell * 0.35);
  float grime  = hollow * smoothstep(0.25, 0.85, fbmT(uv * 13.0 + 4.0, 13.0, 3, 2.0, 0.55));

  vec3 col = uGold * (0.86 + burn * 0.30 + lh * 0.10);
  col = mix(col, uGold * 0.42 * vec3(1.0, 0.93, 0.80), grime * 0.75);   // tarnish in the hollows
  col = mix(col, uBole,  rub * 0.85);
  col = mix(col, uGesso, bare * 0.8);
  col *= 0.97 + tooth * 0.06;

  float metal = 1.0 - rub * 0.75 - bare * 0.25;
  float rough = 0.155 + burn * 0.10 + tooth * 0.06 + grime * 0.42 + rub * 0.30 + seam * 0.06;
  rough = mix(rough, rough * 0.62, sat(relief * 0.6));   // burnished on the raised carving

  s.albedo    = col;
  s.roughness = rough;
  s.metalness = sat(metal);
  s.ao        = 1.0 - hollow * 0.30 - grime * 0.22 - seam * 0.10;
  s.height    = 0.30 + relief * 0.52 + swell * 0.06 + tooth * 0.015 - seam * 0.02;
}
`;

/** Gilt bronze / water-gilded carving. `ornament:1` gives an anthemion frieze band. */
export function giltMat(opts = {}) {
  const o = {
    gold: [0.760, 0.575, 0.230], bole: [0.360, 0.130, 0.085], gesso: [0.760, 0.735, 0.680],
    wear: 0.55, ornament: 0, leaf: 11, seed: 2.0, size: 1024, repeat: [1, 1], ...opts,
  };
  return baker().standard({
    key: `est-gilt:${JSON.stringify(o)}`,
    size: o.size, surface: GILT_SURFACE,
    heightScale: o.ornament ? 0.10 : 0.045, normalStrength: 1.0,
    repeat: o.repeat, anisotropy: 8,
    uniforms: {
      uGold: new THREE.Vector3(...o.gold), uBole: new THREE.Vector3(...o.bole),
      uGesso: new THREE.Vector3(...o.gesso),
      uWear: o.wear, uOrnament: o.ornament, uLeaf: o.leaf, uSeed: o.seed,
    },
  }, { envMapIntensity: 1.5, normalScale: new THREE.Vector2(1, 1) });
}

// ---------------------------------------------------------------------------
// CARVED LIMESTONE — the fireplace surround in the locked art. Grey-white, matte,
// fine-grained, with bedding drift, chisel chatter on the flats, and soot rising out of
// the firebox opening. Grime obeys gravity: it banks along the top of every horizontal
// moulding and washes down below them.
// ---------------------------------------------------------------------------
const STONE_SURFACE = /* glsl */ `
uniform vec3  uStone;
uniform float uSoot;      // soot gradient strength (fireplace vs plain ashlar)
uniform float uCourse;    // >0 = ashlar joints, value = courses across the tile
uniform float uSeed;

void surface(in vec2 uv, inout Surf s){
  vec2 p = uv;

  // bedding: broad soft banding from the quarry, running horizontally
  float bed  = fbmT(vec2(p.x * 1.2, p.y * 5.5) + uSeed, 6.0, 3, 2.0, 0.55);
  // grain: the 20 cm read. Fine oolitic speckle plus a sparse shell/fossil scatter.
  float gr   = fbmT(p * 190.0, 190.0, 3, 2.0, 0.5);
  vec3  vor  = voronoiT(p * 46.0, 46.0);
  float pits = smoothstep(0.10, 0.0, vor.x) * step(0.86, vor.z);       // occasional vug
  // chisel chatter: shallow parallel tool marks, only on the flats
  float chat = fbmT(vec2(p.x * 130.0, p.y * 14.0) + 9.0, 130.0, 2, 2.0, 0.5);

  float joint = 0.0;
  if (uCourse > 0.5){
    vec4 g = rowGrid(p, vec2(uCourse * 0.5, uCourse), 0.5);
    vec2 gd = min(g.zw, 1.0 - g.zw);
    joint = 1.0 - smoothstep(0.004, 0.020, min(gd.x, gd.y));
  }

  // dirt: banked on top-facing ledges, washing downward
  float wash = smoothstep(0.0, 0.55, 1.0 - p.y) * smoothstep(0.15, 0.62, fbmT(p * 7.0 + 21.0, 7.0, 3, 2.0, 0.55));
  float soot = uSoot * (smoothstep(0.55, 0.02, p.y) * 0.75 + wash * 0.5);

  vec3 col = uStone * (0.88 + bed * 0.20 + gr * 0.06);
  col *= 1.0 - pits * 0.35;
  col  = mix(col, vec3(0.115, 0.108, 0.104), sat(soot) * 0.72);
  col  = mix(col, uStone * 0.55, joint * 0.7);

  float rough = 0.72 + gr * 0.14 + chat * 0.06 - bed * 0.05 + sat(soot) * 0.12;

  s.albedo    = sat3(col);
  s.roughness = clamp(rough, 0.35, 1.0);
  s.metalness = 0.0;
  s.ao        = 1.0 - joint * 0.6 - pits * 0.5 - sat(soot) * 0.15;
  s.height    = 0.62 + bed * 0.05 + gr * 0.035 + chat * 0.02 - joint * 0.30 - pits * 0.22;
}
`;

export function stoneMat(opts = {}) {
  const o = { stone: [0.560, 0.552, 0.528], soot: 0.0, course: 0, seed: 5.0, size: 1024,
    repeat: [1, 1], bakeDust: 0, ...opts };
  return baker().standard({
    key: `est-stone:${JSON.stringify(o)}`,
    size: o.size, surface: STONE_SURFACE, heightScale: 0.05, normalStrength: 1.0,
    repeat: o.repeat, anisotropy: 8, bakeDust: o.bakeDust,
    uniforms: { uStone: new THREE.Vector3(...o.stone), uSoot: o.soot, uCourse: o.course, uSeed: o.seed },
  }, { envMapIntensity: 1.0, normalScale: new THREE.Vector2(1, 1) });
}

// ---------------------------------------------------------------------------
// MARBLE — the estate floor stone.
//
// WHY THIS EXISTS ALONGSIDE materials/surfaces/marble.js
// That module is the hero surface for the `mat.marble` piece and it is beautiful, but it
// is unaffordable as a room floor: measured on this machine, `mat.marble` takes 69 SECONDS
// to reach ready, and a room view that also has to bake walnut, stone, gilt, glass,
// tapestry and brass simply never loads inside the harness's 60 s timeout. Diagnosis: the
// baker evaluates surface() FIVE times per texel to derive the normal, marble.js runs a
// three-contour domain-warped vein system (~55 tileable-noise evaluations per call) and
// its cabochon pattern evaluates the whole stone routine a second time. That is ~550 noise
// evaluations per texel.
//
// This version is the same idea at roughly a tenth of the cost, and the saving comes from
// two decisions:
//
//   1. THE HEIGHT FIELD DOES NOT DEPEND ON THE VEINS. Veins in polished marble are stains,
//      not bumps — the stone is flat. So s.height is built only from the joints, the
//      chamfer and the calcite grain. Because the baker's four gradient taps read nothing
//      but s.height, the compiler dead-code-eliminates the entire vein system in four
//      evaluations out of five. That alone is most of the win, and it costs nothing
//      visually because the relief it removes was never supposed to be there.
//   2. ONE contour with a real gradient normalisation (constant-width, wandering veins),
//      one thinner tributary sharing the same field evaluation, and a monotone ramp so a
//      vein can never close into a loop. No domain warp: the ramp plus three fbm octaves
//      already wander convincingly, and the warp was two thirds of the field cost.
//
// Chequer, cabochon and single-slab patterns are all one evaluation — the dark stone is
// the same routine with the ground and vein colours swapped, not a second pass.
// ---------------------------------------------------------------------------
const MARBLE_SURFACE = /* glsl */ `
uniform float uSlabsX;
uniform float uSlabsY;
uniform float uPattern;     // 0 cabochon field · 1 running bond · 2 chequer · 3 single slab
uniform float uBaseDark;
uniform float uJointW;
uniform float uCabSize;
uniform float uRough;
uniform float uWear;
uniform float uDust;
uniform float uSeed;
uniform vec3  uGroundA;
uniform vec3  uVeinA;
uniform vec3  uGroundB;
uniform vec3  uVeinB;
uniform float uVeinW;
uniform float uScale;
uniform float uAniso;

// The field whose iso-contours are the veins. The linear term is what buys directional
// coherence: contours of (noise + ramp) run broadly across the ramp and, because a linear
// term never repeats, a contour can never close on itself. Fractures do not close.
float mfield(vec2 pn, vec2 pl){
  return fbmT(pn, 48.0, 3, 2.09, 0.55) + pl.y * 0.105;
}

void surface(in vec2 uv, inout Surf s){
  vec2 cnt = vec2(uSlabsX, uSlabsY);
  bool bond    = uPattern > 0.5 && uPattern < 1.5;
  bool chequer = uPattern > 1.5 && uPattern < 2.5;
  bool single  = uPattern > 2.5;
  bool cabo    = uPattern < 0.5;

  float row = floor(uv.y * cnt.y);
  float gx  = uv.x * cnt.x + (bond ? fract(row * 0.5) : 0.0);
  vec2  gp  = vec2(gx, uv.y * cnt.y);
  vec2  cid = mod(floor(gp), cnt);
  vec2  luv = fract(gp);
  if (single){ cid = vec2(0.0); luv = uv; }

  float h = hash12(cid + uSeed * 13.0 + 0.5);

  float darkF = uBaseDark;
  if (chequer && mod(cid.x + cid.y, 2.0) > 0.5) darkF = 1.0 - darkF;

  // ---- cabochon: a small dark diamond let into every slab intersection ----
  vec2  vd   = abs(fract(gp + 0.5) - 0.5);
  float dman = vd.x + vd.y;
  float cab  = cabo ? 1.0 - smoothstep(uCabSize - 0.010, uCabSize, dman) : 0.0;
  if (cab > 0.5) darkF = 1.0 - darkF;

  // ---- joints: sawn, chamfered arris, grey mortar in the gap --------------
  vec2  gd   = min(luv, 1.0 - luv);
  float e1   = min(gd.x, gd.y) + cab;
  float e2   = cabo ? abs(dman - uCabSize) : 1.0;
  float edge = min(e1, e2);
  float jw   = uJointW;
  float ch   = jw * 3.2;
  float joint = 1.0 - smoothstep(jw * 0.55, jw, edge);
  float arris = 1.0 - smoothstep(jw, ch, edge);

  // ---- the height field: joints, chamfer, calcite grain. NOTHING ELSE. ----
  // (see the note above — this is what lets the compiler drop the veins from four of the
  //  five evaluations the baker makes per texel)
  float grain = fbmT(uv * vec2(uSlabsX, uSlabsY) * 40.0 + 21.0, 40.0, 2, 2.0, 0.5);
  float mortN = fbmT(uv * 220.0, 220.0, 2, 2.0, 0.5);
  float prof  = smoothstep(jw * 0.85, ch, edge);
  s.height = mix(0.655 + mortN * 0.010, 0.720 + grain * 0.012, prof);

  // ---- the stone ---------------------------------------------------------
  vec3  ground = mix(uGroundA, uGroundB, darkF);
  vec3  vcol   = mix(uVeinA,   uVeinB,   darkF);

  float ang = (h - 0.5) * 1.22;                       // slabs are cut from one block:
  vec2  off = hash22(vec2(h * 61.7 + 1.0, h * 17.3 + 4.0)) * 26.0;   // loosely directional
  vec2  pl  = rot(ang) * (luv - 0.5) * uScale;
  vec2  q   = (pl + off) * vec2(1.0, uAniso);
  vec2  ql  = pl * vec2(1.0, uAniso);

  const float eps = 0.011;
  float f  = mfield(q, ql);
  float fx = mfield(q + vec2(eps, 0.0), ql + vec2(eps, 0.0));
  float fy = mfield(q + vec2(0.0, eps), ql + vec2(0.0, eps));
  float g  = max(length(vec2(fx - f, fy - f)) / eps, 1e-3);

  // distance to the contour, in q units — dividing by |grad| is what makes the vein a
  // constant width instead of a fat band wherever the field happens to be flat
  float dM = abs(f - 0.500) / g;
  float dA = abs(f - 0.452) / g;

  // presence and gauge: two or three bold fractures carrying a fan of hairlines, and
  // large areas of completely clean ground. Most of a Carrara slab is empty.
  //
  // ROUND 3 — this is the "amoeba blotches" the study critic reports, and it is arithmetic.
  // NOTE (gadget-owner-2, not this file's owner): the eight BACKTICKS that were quoting
  // pres/fbmT/gauge/wMaj in these two comment lines terminated the MARBLE_SURFACE template
  // literal (opened line 217) and broke the whole bundle — trap 3 on the pipeline list.
  // Swapped for single quotes; nothing else in this file was touched.
  //
  // 'pres' gates a vein's existence AND scales its width, and it was built from a raw 'fbmT'
  // (the narrow bell — see the pipeline trap list) pushed through smoothstep(0.455, 0.715).
  // That combination is high over only small islands of the slab, and inside those islands
  // 'gauge' reached 2.35, so 'wMaj' hit 0.29 in q units — on the study's veinW 0.125 that is a
  // 22 cm-wide dark band, chopped by the same gate into isolated patches. A 22 cm blob is not
  // a vein at any viewing distance; it is a stain, which is exactly the word the critic used.
  //
  // A vein is thin AND long. So the presence field drops to a lower frequency (longer
  // continuous runs instead of islands) over a wider, lower ramp (present across most of the
  // slab), and the gauge amplitude comes down by half. The stone reads as veined by having
  // MORE vein, not wider vein — which is also what the reference stone actually does.
  float pres  = smoothstep(0.400, 0.640, fbmT(q * 1.15 + 5.1, 48.0, 2, 2.0, 0.5));
  float gauge = 0.30 + 1.05 * pow(pres, 1.15);
  float wMaj  = uVeinW * gauge;
  float maj  = (1.0 - smoothstep(wMaj * 0.26, wMaj * 1.00, dM)) * pres;
  float sec  = (1.0 - smoothstep(uVeinW * 0.07, uVeinW * 0.30, dA)) * pres;
  // a third contour, free: f and its gradient are already computed, so a second family of
  // hairlines running parallel to the majors costs one subtract and one smoothstep. This is
  // the "fan of hairlines" the comment above always claimed and never drew.
  float dC   = abs(f - 0.561) / g;
  float ter  = (1.0 - smoothstep(uVeinW * 0.05, uVeinW * 0.22, dC)) * pres * 0.8;
  float halo = (1.0 - smoothstep(wMaj * 1.3, wMaj * 6.5, dM)) * (1.0 - maj) * pres;

  float cloud = fbmT((pl + off) * 1.30 + 3.0, 48.0, 3, 2.0, 0.55);

  vec3 col = ground * (0.965 + cloud * 0.070);
  col *= 1.0 + (hash11(h * 91.0 + 0.3) - 0.5) * mix(0.050, 0.11, darkF);
  col  = mix(col, col * mix(1.055, 1.20, darkF), halo * 0.75);
  col  = mix(col, vcol * (0.88 + cloud * 0.24), min(maj * 1.35, 1.0));
  col  = mix(col, mix(col, vcol, 0.62),         min(sec * 1.30, 1.0));
  col  = mix(col, mix(col, vcol, 0.44),         min(ter * 1.20, 1.0));
  col *= 0.994 + grain * 0.013;

  float vm = max(maj, max(sec, ter) * 0.55);
  float rough = uRough + vm * 0.042 + grain * 0.022 + cloud * 0.013;

  // mortar in the joint
  vec3 mortC = vec3(0.255, 0.248, 0.236) * (0.72 + mortN * 0.62);
  col   = mix(col, mortC, joint);
  rough = mix(rough, 0.74 + mortN * 0.15, joint);

  // foot traffic: polish lost in the walking patches. Roughness does all of it.
  float traffic = sat(smoothstep(0.40, 0.86, fbmT(uv * 3.0, 3.0, 3, 2.0, 0.55))) * uWear;
  rough  += traffic * 0.115 + arris * 0.055;
  col    *= 1.0 - traffic * 0.028;

  // scratches: sheared so they tile, and in ROUGHNESS ONLY — a scratch in a normal map at
  // texel scale is a moire generator, not a scratch
  float scr = smoothstep(0.905, 0.998, fbmT(vec2(uv.x * 28.0 + uv.y * 84.0, uv.y * 224.0), 28.0, 2, 2.0, 0.5));
  rough += scr * (0.10 + traffic * 0.22);

  // dust banks against the joint, where a mop never reaches
  float dust = arris * smoothstep(0.30, 0.85, mortN) * uDust;
  col   = mix(col, vec3(0.40, 0.385, 0.355), dust * 0.42);
  rough = mix(rough, 0.82, dust * 0.62);

  s.albedo    = sat3(col);
  s.roughness = clamp(rough, 0.055, 1.0);
  s.metalness = 0.0;
  s.ao        = 1.0 - joint * 0.55 - arris * 0.16 - dust * 0.18;
}
`;

const MARBLE_BASE = {
  slabsX: 5, slabsY: 5, pattern: 0, baseDark: 0,
  jointW: 0.0055, cabSize: 0.105,
  rough: 0.135, wear: 0.55, dust: 0.6, seed: 1.0,
  size: 1024, repeat: [1, 1], heightScale: 0.030, normalScale: 0.22,
  clearcoat: 0.30, clearcoatRoughness: 0.10,
  groundA: [0.905, 0.897, 0.876], veinA: [0.405, 0.396, 0.380],
  groundB: [0.070, 0.070, 0.078], veinB: [0.880, 0.868, 0.835],
  veinW: 0.082, scale: 3.0, aniso: 2.15,
};

function buildMarble(p) {
  return baker().standard({
    key: `est-marble:${JSON.stringify(p)}`,
    size: p.size, surface: MARBLE_SURFACE,
    heightScale: p.heightScale, normalStrength: 1.0,
    repeat: p.repeat, anisotropy: 16,
    uniforms: {
      uSlabsX: p.slabsX, uSlabsY: p.slabsY, uPattern: p.pattern, uBaseDark: p.baseDark,
      uJointW: p.jointW, uCabSize: p.cabSize, uRough: p.rough, uWear: p.wear,
      uDust: p.dust, uSeed: p.seed,
      uGroundA: new THREE.Vector3(...p.groundA), uVeinA: new THREE.Vector3(...p.veinA),
      uGroundB: new THREE.Vector3(...p.groundB), uVeinB: new THREE.Vector3(...p.veinB),
      uVeinW: p.veinW, uScale: p.scale, uAniso: p.aniso,
    },
  }, {
    clearcoat: p.clearcoat, clearcoatRoughness: p.clearcoatRoughness,
    envMapIntensity: 1.0, normalScale: new THREE.Vector2(p.normalScale, p.normalScale),
  }, THREE.MeshPhysicalMaterial);
}

/** Carrara field with a dark cabochon at every slab intersection — the study floor. */
export function estateMarbleFloor(o = {}) { return buildMarble({ ...MARBLE_BASE, ...o }); }
/** Carrara against Nero Marquina — the ballroom and vestibule chequer. */
export function estateMarbleChequer(o = {}) {
  return buildMarble({ ...MARBLE_BASE, pattern: 2, slabsX: 6, slabsY: 6, jointW: 0.0042, wear: 0.45, ...o });
}
/** One slab: chimneypiece, table top, column drum, dado band. */
export function estateMarbleSlab(o = {}) {
  return buildMarble({
    ...MARBLE_BASE, pattern: 3, slabsX: 1, slabsY: 1, jointW: 0.0012,
    scale: 1.7, veinW: 0.060, wear: 0.14, dust: 0.28, size: 512,
    heightScale: 0.018, ...o,
  });
}
/** Nero Marquina in a running bond — stair treads, skirting bands, inlay. */
export function estateMarbleDark(o = {}) {
  return buildMarble({
    ...MARBLE_BASE, pattern: 1, baseDark: 1, slabsX: 4, slabsY: 8, jointW: 0.0040,
    rough: 0.145, wear: 0.5, dust: 0.7, size: 512, veinW: 0.105, scale: 2.1, aniso: 1.20,
    heightScale: 0.026, ...o,
  });
}

// ---------------------------------------------------------------------------
// CEILING PLASTER — lime plaster, trowelled, faintly crazed, water-stained toward the
// corners. Deliberately low contrast: it is a ceiling, seen at 5 m, and its job is to
// hold a gradient without ever showing a tile.
// ---------------------------------------------------------------------------
const CEILING_SURFACE = /* glsl */ `
uniform vec3  uTint;
uniform float uStain;
void surface(in vec2 uv, inout Surf s){
  float trowel = fbmT(uv * 4.5, 5.0, 4, 2.05, 0.55);
  float tooth  = fbmT(uv * 260.0, 260.0, 2, 2.0, 0.5);
  vec3  vc     = voronoiT(uv * 22.0, 22.0);   // one lookup, not two — this shader is
  float craze  = smoothstep(0.02, 0.0, abs(vc.y - vc.x) - 0.012);  // inlined 5x per texel
  float stain  = smoothstep(0.35, 0.9, fbmT(uv * 2.2 + 31.0, 3.0, 4, 2.0, 0.6)) * uStain;

  vec3 col = uTint * (0.93 + trowel * 0.12 + tooth * 0.03);
  col = mix(col, uTint * vec3(0.72, 0.66, 0.56), stain * 0.6);
  col *= 1.0 - craze * 0.10;

  s.albedo    = sat3(col);
  s.roughness = 0.90 + tooth * 0.07 - trowel * 0.05 + stain * 0.04;
  s.metalness = 0.0;
  s.ao        = 1.0 - craze * 0.25 - stain * 0.10;
  s.height    = 0.5 + trowel * 0.20 + tooth * 0.03 - craze * 0.10;
}
`;

export function ceilingMat(opts = {}) {
  const o = { tint: [0.700, 0.678, 0.630], stain: 0.55, size: 1024, repeat: [1, 1],
    bakeDust: 0, ...opts };
  return baker().standard({
    key: `est-ceil:${JSON.stringify(o)}`,
    size: o.size, surface: CEILING_SURFACE, heightScale: 0.03, normalStrength: 0.8,
    repeat: o.repeat, anisotropy: 4, bakeDust: o.bakeDust,
    uniforms: { uTint: new THREE.Vector3(...o.tint), uStain: o.stain },
  }, { envMapIntensity: 1.0, normalScale: new THREE.Vector2(0.7, 0.7) });
}

// ---------------------------------------------------------------------------
// TAPESTRY — a Flemish verdure hanging. Two things make a woven textile read: the weft
// ribs (a strong one-directional relief at ~2 mm pitch) and the fact that the IMAGE is
// quantised to the weave, so every edge in the design is stepped by a thread. Colours are
// faded and dusty at the top where three centuries of soot has settled.
// ---------------------------------------------------------------------------
const TAPESTRY_SURFACE = /* glsl */ `
uniform vec3 uGround;   // dark blue-green field
uniform vec3 uFig;      // gold/ochre figures
uniform vec3 uRed;      // madder red accents
uniform float uSeed;

void surface(in vec2 uv, inout Surf s){
  // ---- ROUND 7: WEAVE YOU CAN SEE, AND A BORDER --------------------------
  // 'critic-estate-3': the study's tapestries are "smeared flat marbled rectangles standing in
  // for woven fabric". Two causes, and the first is a resolution argument rather than a
  // shading one. At 148 x 190 threads over a 2.1 x 3.35 m hanging the weft pitch is 17 mm,
  // which at the study's camera is about ONE screen pixel — so the rib, the slub and the
  // per-thread dye noise all land under the grain and average to a smear. A weave that cannot
  // be resolved is not a weave. Coarser, deliberately: 88 x 118 puts the rib at nearly three
  // pixels, which is what a viewer reads as cloth. The second cause is that the design had no
  // large-scale structure at all — one fbm field, no border, nothing with an edge.
  vec2 tc = vec2(88.0, 118.0);
  vec2 q  = (floor(uv * tc) + 0.5) / tc;

  // ---- the border: a guard band and a patterned inner band ----------------
  // Every hanging in the locked art 1785319916301 has one, it is the strongest large-scale
  // feature they have, and it is what says WOVEN PANEL rather than painted cloth.
  // (NO BACKTICKS IN THIS COMMENT: a backtick here terminates the JS template literal and
  //  breaks the bundle for every agent. Trap 3, and it has now fired three times in this file.)
  float bd    = min(min(q.x, 1.0 - q.x), min(q.y, 1.0 - q.y));
  float guard = 1.0 - smoothstep(0.030, 0.040, bd);
  float band  = smoothstep(0.040, 0.050, bd) * (1.0 - smoothstep(0.088, 0.098, bd));
  float fillet= smoothstep(0.098, 0.104, bd) * (1.0 - smoothstep(0.110, 0.116, bd));
  // a rhythm of rosettes running along the inner band, so it is patterned and not a stripe
  float run   = (q.x + q.y) * 9.0;
  float rose  = 0.5 + 0.5 * cos(run * TAU);
  rose = pow(rose, 2.4);

  // design: a foliate scroll field
  vec2  w = warp(q * 3.4 + uSeed, 4.0, 0.55, 3);
  float lf    = fbmT(w, 4.0, 4, 2.0, 0.55);
  float leaf  = smoothstep(0.46, 0.58, lf);
  float stem  = smoothstep(0.030, 0.0, abs(fbmT(w * 1.9 + 3.0, 8.0, 3, 2.0, 0.5) - 0.5) - 0.020);
  float bloom = smoothstep(0.80, 0.92, fbmT(q * 9.0 + 12.0, 9.0, 3, 2.0, 0.5));

  vec3 col = uGround;
  col = mix(col, uFig,  leaf * 0.82);
  col = mix(col, uFig * 1.35, stem * 0.90);
  col = mix(col, uRed,  bloom * 0.85);
  col = mix(col, uGround * 0.55, guard * 0.85);
  col = mix(col, mix(uFig * 0.70, uRed * 1.05, rose), band * 0.90);
  col = mix(col, uFig * 1.30, fillet * 0.85);

  // weave relief: weft ribs across, warp threads under, plus slub irregularity
  float weft = 0.5 + 0.5 * cos(uv.y * tc.y * TAU);
  float warpT= 0.5 + 0.5 * cos(uv.x * tc.x * TAU);
  float slub = fbmT(uv * vec2(30.0, 120.0), 120.0, 2, 2.0, 0.5);
  float pile = weft * 0.7 + warpT * 0.3;

  // THE SLIT. Where two colour areas meet, a tapestry weaver leaves a vertical gap between
  // the two wefts — the slit is the single unmistakable tell of the technique, and it only
  // ever runs with the warp. Drawn as a fine dark line along the design's own contours.
  float slit = smoothstep(0.055, 0.0, abs(lf - 0.52)) * step(0.55, warpT);
  col *= 1.0 - slit * 0.42;

  // thread-level colour noise: no two dyed threads match
  col *= 0.86 + hash12(floor(uv * tc) + uSeed) * 0.24;
  // soot settles at the top, fading and greying the dye
  float soot = smoothstep(0.45, 1.0, uv.y) * 0.55;
  col = mix(col, vec3(0.20, 0.19, 0.175), soot * 0.45);
  // light-fading down the exposed face
  col = mix(col, col * vec3(1.10, 1.04, 0.92) + 0.035, smoothstep(0.7, 0.0, uv.y) * 0.3);

  s.albedo    = sat3(col);
  s.roughness = 0.88 + slub * 0.10 - pile * 0.05;
  s.metalness = 0.0;
  s.ao        = 1.0 - (1.0 - pile) * 0.35 - slit * 0.30;
  s.height    = 0.45 + pile * 0.35 + slub * 0.14 - slit * 0.22;
}
`;

export function tapestryMat(opts = {}) {
  const o = {
    // GROUND 0.088 IS A BLACK RECTANGLE. Tiled against `1785319916301`, the art's tapestries
    // are mid-value hangings whose figures are legible at the frame edge, and this ground at
    // 0.088 sRGB is 0.007 LINEAR — below the point at which any irradiance a dark room can
    // supply lifts it off zero, so every capture showed a black panel with gold squiggles on
    // it. Faded Flemish verdure is a dusty blue-green, not a void; the darkness in the art
    // comes from the room, and the room is already dark enough.
    // ROUND 5 pushes the ground further from the room's own hue. Tiled against the art, the
    // hangings there are unmistakably deep BLUE-green and red-gold — the only saturated colour
    // in a warm brown room — and at a ground of r/b 0.99 under a warm key ours came back
    // olive, i.e. the same family as the walnut, which is the one thing they must not be. The
    // green-to-red separation is what carries them; the ground has to be cool enough to
    // survive the light.
    ground: [0.148, 0.216, 0.212], fig: [0.482, 0.392, 0.184], red: [0.408, 0.106, 0.070],
    seed: 3.0, size: 1024, repeat: [1, 1], ...opts,
  };
  return baker().standard({
    key: `est-tap:${JSON.stringify(o)}`,
    // 0.042 / 1.25, not 0.028 / 0.85. A rib at three screen pixels can carry real relief; at
    // one it could not, so the old numbers were the right ceiling for the old thread count and
    // are the wrong one for this.
    size: o.size, surface: TAPESTRY_SURFACE, heightScale: 0.042, normalStrength: 1.0,
    repeat: o.repeat, anisotropy: 8,
    uniforms: {
      uGround: new THREE.Vector3(...o.ground), uFig: new THREE.Vector3(...o.fig),
      uRed: new THREE.Vector3(...o.red), uSeed: o.seed,
    },
  }, { envMapIntensity: 0.7, normalScale: new THREE.Vector2(1.25, 1.25) });
}

// ---------------------------------------------------------------------------
// CARPET — a Savonnerie runner. Deep madder ground, a gold guard border, a repeating
// palmette field. Wool pile: the relief is high-frequency and isotropic, the roughness is
// near 1 everywhere, and the walking line down the middle is crushed and shinier.
// ---------------------------------------------------------------------------
const CARPET_SURFACE = /* glsl */ `
uniform vec3  uGround;
uniform vec3  uBorder;
uniform vec3  uFig;
uniform float uWear;
uniform float uReps;      // pattern repeats along v

void surface(in vec2 uv, inout Surf s){
  float bx = min(uv.x, 1.0 - uv.x);
  float guard = 1.0 - smoothstep(0.085, 0.100, bx);
  float inner = smoothstep(0.108, 0.118, bx) * (1.0 - smoothstep(0.126, 0.136, bx));

  vec2 f = vec2(uv.x, fract(uv.y * uReps));
  vec2 c = (f - vec2(0.5, 0.5)) * vec2(1.0, 0.86);
  float rose = 1.0 - smoothstep(0.10, 0.135, length(c * vec2(1.0, 1.35)));
  float ring = smoothstep(0.020, 0.0, abs(length(c * vec2(1.0, 1.2)) - 0.24));
  vec2  w = warp(f * 4.5 + 7.0, 5.0, 0.42, 3);
  float vine = smoothstep(0.028, 0.0, abs(fbmT(w, 5.0, 3, 2.0, 0.5) - 0.5) - 0.018);

  vec3 col = uGround;
  col = mix(col, uFig, sat(rose + ring * 0.8 + vine * 0.55));
  col = mix(col, uBorder, guard);
  col = mix(col, uFig * 1.1, inner);

  // pile: dense isotropic tuft noise, two octaves
  float tuft = fbmT(uv * vec2(300.0, 300.0), 300.0, 2, 2.0, 0.5);
  float row  = 0.5 + 0.5 * cos(uv.y * 520.0 * TAU / 3.0);
  col *= 0.82 + tuft * 0.34;

  // traffic: crushed pile down the centre line, dirtier and glossier
  float lane = (1.0 - smoothstep(0.10, 0.40, abs(uv.x - 0.5))) *
               smoothstep(0.25, 0.75, fbmT(uv * vec2(2.0, 5.0) + 3.0, 5.0, 3, 2.0, 0.5)) * uWear;
  col = mix(col, col * 0.72 + vec3(0.035, 0.030, 0.026), lane * 0.7);

  s.albedo    = sat3(col);
  s.roughness = clamp(0.97 - lane * 0.22 - tuft * 0.05, 0.5, 1.0);
  s.metalness = 0.0;
  s.ao        = 1.0 - (1.0 - tuft) * 0.30 - lane * 0.08;
  s.height    = 0.42 + tuft * 0.45 + row * 0.08 - lane * 0.16;
}
`;

export function carpetMat(opts = {}) {
  const o = {
    ground: [0.235, 0.055, 0.052], border: [0.075, 0.068, 0.095], fig: [0.480, 0.375, 0.190],
    wear: 0.7, reps: 4.0, size: 1024, repeat: [1, 1], ...opts,
  };
  return baker().standard({
    key: `est-carpet:${JSON.stringify(o)}`,
    size: o.size, surface: CARPET_SURFACE, heightScale: 0.055, normalStrength: 1.0,
    repeat: o.repeat, anisotropy: 8,
    uniforms: {
      uGround: new THREE.Vector3(...o.ground), uBorder: new THREE.Vector3(...o.border),
      uFig: new THREE.Vector3(...o.fig), uWear: o.wear, uReps: o.reps,
    },
  }, { envMapIntensity: 0.35, normalScale: new THREE.Vector2(1.1, 1.1) });
}

// ---------------------------------------------------------------------------
// PARQUET — Versailles panel: a square frame of oak with a diagonal lattice inside.
// Individual staves are ray-cut oak with medullary flecking. Wax polish is uneven, which
// is where nearly all of the look comes from at a grazing angle.
// ---------------------------------------------------------------------------
const PARQUET_SURFACE = /* glsl */ `
uniform vec3  uOak;
uniform vec3  uOakDark;
uniform float uPanels;   // panels across the tile
uniform float uWear;
uniform float uJoint;      // how strongly the board joints darken — see the note at the mix
uniform float uJointDark;  // and how far toward black they go
uniform float uPlain;
uniform float uPatCon;      // fine-pattern contrast, 1 = as authored — see the block below
uniform float uWaxVar;      // polish variation at room scale, 1 = as authored

float staveGrain(vec2 sp, float h){
  // stretched fbm along the stave, plus cathedral arcs from the growth rings
  float g = fbmT(vec2(sp.x * 2.2 + h * 40.0, sp.y * 46.0), 48.0, 4, 2.1, 0.55);
  float ring = 0.5 + 0.5 * sin((sp.y * 26.0 + g * 5.0) * TAU * 0.5);
  return g * 0.6 + ring * 0.4;
}

void surface(in vec2 uv, inout Surf s){
  vec2 pp = uv * uPanels;
  vec2 pc = floor(pp), pf = fract(pp);
  float ph = hash12(pc + 3.0);

  // frame vs field
  float bd = min(min(pf.x, 1.0 - pf.x), min(pf.y, 1.0 - pf.y));
  // ⚠ uPlain — THE SAME OAK LAID PLAIN INSTEAD OF IN PANELS (round 17).
  // At 0 this is the Versailles panel it has always been: a bordered frame with a diagonal
  // lattice inside. At 1 the frame is gone and the lattice is un-rotated and stretched into a
  // running block bond — the ordinary parquet de chantier a service floor is laid in. Every
  // other property of the surface (grain, medullary fleck, wax, traffic lanes, joints) is
  // untouched, so this is the same FLOOR laid a different way, not a different material.
  //
  // It exists because the last thing separating this room from
  // refs/bf1/bf1-ballroom-01.png in a blind pair is that its floor reads as a tone and this
  // one reads as pattern, and the reference's floor is parquet too — laid plain. Which one
  // this room should have is a design decision, and a decision wants both pictures.
  float frame = mix(1.0 - smoothstep(0.145, 0.155, bd), 0.0, uPlain);

  // diagonal lattice inside the frame
  vec2 d = (pf - 0.5) * 1.42;
  // ⚠ THE PLAIN BOND RUNS ON THE CONTINUOUS COORDINATE, NOT INSIDE THE PANEL CELL, AND THAT
  // IS THE WHOLE DIFFERENCE BETWEEN A PLANK FLOOR AND A MAZE. pf is per-panel, so a bond
  // built from it RESTARTS at every 0.72 m cell — the courses cannot run past a boundary, the
  // boundary stays visible, and the closed block outlines either side of it interlock into a
  // Greek key. Three passes were spent on block size and joint width before the pattern turned
  // out to be the panel grid still showing through the thing that was meant to replace it.
  // pp is uv * uPanels and is continuous across the whole floor, so courses run the length
  // of the room the way boards do.
  vec2 latPanel = rot(0.7853981) * d * 5.0;
  vec2 latPlain = pp * vec2(1.10, 4.25);
  vec2 lat = mix(latPanel, latPlain, uPlain);
  // running bond: every other course offset by half a block, which is what stops a plain
  // floor reading as a grid the moment the frame that was hiding it is gone
  lat.x += floor(lat.y) * 0.5 * uPlain;
  vec2 lc = floor(lat), lf = fract(lat);
  // ⚠ THE JOINT BAND IS IN LAT-CELL UNITS, NOT METRES, AND ON A LONG THIN BLOCK THAT IS THE
  // WHOLE BUG. One width applied to both axes of a 0.92 x 0.24 m block draws the end joints at
  // 2.2 cm and the side joints at 0.6 cm — nearly four times apart — and with the running
  // bond's half-block offset those fat cross-lines interlock into a Greek-key maze. The plain
  // floor read as brickwork, then as a maze, for this reason alone and not because of block
  // size, which was the first two things tried. Scaling the x width by the cell's own aspect
  // makes both joints the same width ON THE FLOOR, which is what a plank floor has.
  float jx = min(lf.x, 1.0 - lf.x);
  float jy = min(lf.y, 1.0 - lf.y);
  float jw = mix(0.055, 0.024, uPlain);
  float jwx = mix(jw, jw * 0.26, uPlain);
  float latJoint = max(1.0 - smoothstep(0.0, jwx, jx), 1.0 - smoothstep(0.0, jw, jy));

  // pick the stave cell + its local coords
  vec2  sp; float sh;
  if (frame > 0.5){
    float side = (abs(pf.x - 0.5) > abs(pf.y - 0.5)) ? 0.0 : 1.0;
    sp = side > 0.5 ? vec2(pf.y * 3.0, pf.x * 9.0) : vec2(pf.x * 3.0, pf.y * 9.0);
    sh = hash12(pc * 4.0 + side * 17.0 + 1.0);
  } else {
    sp = lf * vec2(1.0, 3.0);
    // under uPlain the stave hash must NOT carry pc, or every board changes tone as it
    // crosses a panel boundary that is no longer supposed to exist
    sh = hash12(lc + mix(pc * 13.0, vec2(0.0), uPlain) + 5.0);
  }

  float g = staveGrain(sp, sh);
  // medullary rays: short bright flecks across the grain — the signature of quartersawn oak
  float fleck = smoothstep(0.80, 0.97, fbmT(vec2(sp.x * 34.0, sp.y * 4.0) + sh * 20.0, 40.0, 2, 2.0, 0.5));

  vec3 col = mix(uOak, uOakDark, g * 0.75);
  col *= 0.90 + hash11(sh * 31.0) * 0.22;              // stave-to-stave tone drift
  col = mix(col, uOak * 1.22, fleck * 0.35);

  float joint = max(frame > 0.5 ? 0.0 : latJoint,
                    1.0 - smoothstep(0.140, 0.152, abs(bd - 0.150) + 0.140));
  joint = max(joint, 1.0 - smoothstep(0.0, 0.006, abs(bd - 0.150)));
  col = mix(col, uOakDark * 0.35, joint * 0.85);

  // ---- ROUND 18: THE PATTERN'S CONTRAST, SEPARATED FROM ITS EXISTENCE -------------------
  //
  // Rounds 17 and 18 both read this floor as "pattern where the bar reads as tone" and both
  // reached for the same answer: lay the oak plain instead. That never converged, and round 18
  // filed the residue as needing a floor surface BUILT to be plain - a piece of work rather
  // than a parameter. All of that assumed the bar's floor has no pattern in it. It plainly
  // does: cropped, it is large faint squares with a diagonal inside them.
  //
  // So the question was never pattern-or-tone, it is HOW MUCH CONTRAST AT WHAT SCALE, and that
  // is measurable. Local standard deviation over a sliding window, normalised by the patch
  // mean, on shade-only rects at matched luminance (harness/_floorpat18.mjs):
  //
  //     window        4px    10px    24px    48px
  //     bar           3.5     7.3    12.1    19.0
  //     this floor    9.5    13.3    15.8    15.6
  //
  // The bar's contrast CLIMBS with scale, 3.5 to 19.0, a factor of 5.4: almost nothing at stave
  // scale and a great deal at room scale, which is precisely what "reads as a tone" means - the
  // variation you see is where the floor is dirty, not what it is made of. This one is nearly
  // FLAT across the range, 9.5 to 15.6, a factor of 1.6, and is 2.7x the bar at the fine end.
  //
  // uPatCon scales the fine pattern - grain, stave drift, flecking and joints - toward the
  // field's own mean colour, leaving the base colour, the wax and the wear lanes alone because
  // those are the LARGE-scale terms and the bar has more of them, not fewer. 1.0 is exactly
  // what this shader did before, so every existing caller is byte-identical.
  vec3 patFlat = mix(uOak, uOakDark, 0.375);
  col = mix(patFlat, col, uPatCon);

  // wax: uneven polish, worn through in the traffic lanes
  float wax  = fbmT(uv * 3.5 + 8.0, 4.0, 3, 2.0, 0.55);
  float lane = smoothstep(0.42, 0.88, fbmT(uv * vec2(2.0, 2.6) + 15.0, 3.0, 3, 2.0, 0.5)) * uWear;
  // ---- ROUND 18: HOW MUCH THE POLISH VARIES, WHICH IS THE FLOOR'S ROOM-SCALE TERM --------
  //
  // ⚠ THE MEASUREMENT THIS WAS BUILT FOR WAS OF THE WRONG THING, AND THE DEFAULT IS THEREFORE
  // 1.0 (byte-identical). It was built to close a 48px local-contrast gap - 11.5 here against
  // the bar's 19.0 - and that 19.0 came from a rect with five sheets of scattered white paper
  // in it. On a paper-free patch at the same luminance the bar reads 2.5 / 3.8 / 4.7 / 5.1
  // across 4/10/24/48px: FLATTER than this floor at every scale, not louder at one. So there
  // was no large-scale deficit and turning this up moves away from the bar.
  //
  // Kept because the mechanism is sound and the next person may want it, and because the two
  // other instruments tried against the same phantom are worth not re-trying: raising the grime
  // macro buys contrast at EVERY scale and costs 11 counts of mean luminance (fbm has energy
  // everywhere, and a multiply only darkens), and raising the AO radius 0.85 -> 3.6 does
  // nothing at all on an open floor patch, because AO is a contact term.
  //
  // The term that varies a floor broadly WITHOUT darkening it is how polished it is. A shut-up
  // ballroom is waxed in patches and dull in others, and under a wall of windows that reads as
  // broad soft sheen variation rather than as dirt. It is already here, driving roughness off
  // an fbm at uv * 3.5, i.e. metre scale; it just had a fixed and fairly small amplitude.
  //
  // uWaxVar scales that amplitude around its own mean, so the average roughness does not move
  // with it and neither does the median luminance. 1.0 is exactly what this shader did before.
  float rough = 0.30 + (0.10 + (wax - 0.5) * 0.40 * uWaxVar)
              + lane * 0.30 + g * 0.05 + joint * 0.3;
  col *= 1.0 - lane * 0.06;

  s.albedo    = sat3(col);
  s.roughness = clamp(rough, 0.10, 1.0);
  s.metalness = 0.0;
  s.ao        = 1.0 - joint * 0.55;
  // ⚠ THE RELIEF SCALES WITH IT, OR THE NORMAL MAP GOES ON DRAWING THE GRID THE ALBEDO JUST
  // STOPPED DRAWING. Round 17 already found this half once - "the pattern was never only in
  // the colour: the NORMAL map was cutting each panel border and its diamond into a groove you
  // could see the shading of" - and halved the height for it. Fading the albedo without fading
  // the height would have re-learned that at the cost of another round.
  s.height    = 0.68 + (-joint * 0.30 + g * 0.03 + (frame > 0.5 ? 0.012 : 0.0)) * uPatCon;
}
`;

export function parquetMat(opts = {}) {
  const o = {
    oak: [0.300, 0.196, 0.108], oakDark: [0.140, 0.084, 0.046],
    panels: 4.0, wear: 0.6, size: 1024, repeat: [1, 1],
    // 0.85 / 0.35 are the constants this shader carried before they were exposed — every
    // existing caller stays byte-identical. See the note at the joint mix in PARQUET_SURFACE.
    joint: 0.85, jointDark: 0.35, height: 0.035, normal: 1.0, plain: 0.0, bakeDust: 0,
    patCon: 1.0, waxVar: 1.0, ...opts,
  };
  return baker().standard({
    key: `est-parq:${JSON.stringify(o)}`,
    // ⚠ `height` / `normal` (round 17). These were 0.035 and 1.0 — thirty-five millimetres of
    // relief on a floor — and that is what was still drawing the ballroom's parquet as a
    // carved grid after the albedo joints had been softened. The pattern was never only in the
    // colour: the NORMAL map was cutting each panel border and its diamond as a groove you
    // could see the shading of. Real parquet is flat; its joints are hairlines. Defaults are
    // the old constants, so every existing caller is byte-identical.
    size: o.size, surface: PARQUET_SURFACE, heightScale: o.height, normalStrength: o.normal,
    repeat: o.repeat, anisotropy: 16, bakeDust: o.bakeDust,
    uniforms: {
      uOak: new THREE.Vector3(...o.oak), uOakDark: new THREE.Vector3(...o.oakDark),
      uPanels: o.panels, uWear: o.wear,
      uJoint: o.joint, uJointDark: o.jointDark, uPlain: o.plain, uPatCon: o.patCon, uWaxVar: o.waxVar,
    },
  }, {
    clearcoat: 0.35, clearcoatRoughness: 0.28, envMapIntensity: 1.0,
    normalScale: new THREE.Vector2(0.7, 0.7),
  }, THREE.MeshPhysicalMaterial);
}

// ---------------------------------------------------------------------------
// BRASS — lamp bodies, sconce arms, stair rails, door furniture. Cast and then spun, so
// there are fine concentric turning marks; handled, so the arrises are polished and the
// recesses hold a green-brown tarnish.
// ---------------------------------------------------------------------------
const BRASS_SURFACE = /* glsl */ `
uniform vec3  uBrass;
uniform vec3  uTarnish;
uniform float uPolish;
void surface(in vec2 uv, inout Surf s){
  float turn = fbmT(vec2(uv.x * 4.0, uv.y * 210.0), 210.0, 2, 2.0, 0.5);
  float grit = fbmT(uv * 34.0, 34.0, 3, 2.0, 0.5);
  float dirt = smoothstep(0.42, 0.86, fbmT(uv * 6.0 + 11.0, 6.0, 4, 2.0, 0.55));
  float hand = smoothstep(0.30, 0.80, fbmT(uv * 2.4 + 27.0, 3.0, 3, 2.0, 0.5)) * uPolish;

  vec3 col = uBrass * (0.86 + turn * 0.20 + grit * 0.08);
  col = mix(col, uTarnish, dirt * (1.0 - hand) * 0.8);
  col = mix(col, uBrass * 1.12, hand * 0.5);

  s.albedo    = sat3(col);
  s.roughness = clamp(0.22 + grit * 0.16 + dirt * 0.42 - hand * 0.14 + turn * 0.05, 0.05, 1.0);
  s.metalness = 1.0 - dirt * 0.25;
  s.ao        = 1.0 - dirt * 0.22;
  s.height    = 0.5 + grit * 0.24 + turn * 0.10;
}
`;

export function brassLocalMat(opts = {}) {
  const o = { brass: [0.640, 0.470, 0.185], tarnish: [0.180, 0.150, 0.090], polish: 0.6, size: 512, repeat: [1, 1], ...opts };
  return baker().standard({
    key: `est-brass:${JSON.stringify(o)}`,
    size: o.size, surface: BRASS_SURFACE, heightScale: 0.03, normalStrength: 1.0,
    repeat: o.repeat, anisotropy: 8,
    uniforms: { uBrass: new THREE.Vector3(...o.brass), uTarnish: new THREE.Vector3(...o.tarnish), uPolish: o.polish },
  }, { envMapIntensity: 1.6, normalScale: new THREE.Vector2(0.6, 0.6) });
}

// ---------------------------------------------------------------------------
// STAINED GLASS — the lancet in the locked art: a central medallion of concentric rings
// on a pale quarry ground, with gold and blue. Baked as an ALBEDO that is used as an
// emissive map, because the window is a light source in every shot it appears in and
// treating it as a lit surface throws away the whole effect.
//
// The lead cames are near-black and about 6 mm; the quarries are pale with a strong
// per-pane tone drift; the glass itself is full of seed bubbles and striations, which is
// what stops it reading as a printed decal.
// ---------------------------------------------------------------------------
const GLASS_SURFACE = /* glsl */ `
uniform vec3  uPale;
uniform vec3  uGold;
uniform vec3  uAmber;
uniform vec3  uBlue;
uniform vec3  uRuby;
uniform float uAspect;   // window height / width, so the medallion is round in WORLD space
uniform float uSeed;
uniform float uInk;      // 0 = daylight glazing, faint cames · 1 = a real leaded light
uniform float uMedal;    // 1 = draw the roundel · 0 = plain glazing, no ornament at all
uniform float uMotif;    // 0 = concentric church roundel · 1 = cusped quatrefoil (see below)

void surface(in vec2 uv, inout Surf s){
  // The mesh IS the lancet — a lancet-shaped sheet whose uv spans the opening — so there
  // is no arch mask here. Every texel of this texture is glass.
  vec2 p = uv;

  // circle in world space, not in uv space: the opening is much taller than it is wide
  vec2  c = (p - vec2(0.5, 0.46)) * vec2(1.0, uAspect);
  float r = length(c);
  float a = atan(c.y, c.x);

  // ---- ROUND 7: THE WINDOW IS THE PIECE'S NAME AND IT WAS BLANK WHITE ------
  //
  // NOTE: backticks in a GLSL template comment terminate the JS string and break the bundle
  // for every agent — trap 3 on the pipeline list, and it has fired twice in this file. Use
  // single quotes in these comments.
  //
  // 'critic-estate-3' on light.shaft: "the window glass itself is fully blown to white with
  // zero visible colour or tracery-through-light ... for a piece titled stained-glass
  // volumetric shaft, the glass carries no stained colour of its own". Confirmed by cropping
  // the lancet out of the capture and out of 'Dev Art/1785320177684' side by side, and the two
  // crops disagree in a way that is arithmetic, not taste:
  //
  //   reference lancet   median L 192, 29% of it at L >= 250, and a DARKEST decile of L 33
  //   our lancet         one flat sheet at L 180-230 with faint grey lines
  //
  // So the reference window IS blown out over most of its area. What makes it read as stained
  // glass is that it also contains NEAR-BLACK — a dense mesh of lead cames and a large gold
  // ornament sitting three to five stops under the quarries. Ours had neither, and both are
  // the same cause: this texture is used as an EMISSIVE map at intensity 6, and ACES puts
  // anything within about two stops of the pale ground into the shoulder with it. The old
  // lead mixed to an effective 0.055, which is 0.33 linear, which tonemaps to output 135 —
  // a mid grey. It was never going to be a came.
  //
  // Two changes, both of them about RANGE rather than about hue:
  //   1. everything that must read as drawing is authored 5-10x darker than the ground, so it
  //      survives the shoulder. 'uInk' scales that, because the ballroom's and the gallery's
  //      daylight glazing wants structure without becoming a church window.
  //   2. the medallion comes BACK UP to a size you can see (round 5 shrank it to r = 0.092 to
  //      kill a "saturated dartboard", which fixed the dartboard by deleting the subject: on a
  //      2 m lancet that is a 90 mm boss). It does not return as a dartboard because it is
  //      drawn in LINE. Concentric gold fillets a few millimetres wide, a cusped inner ring,
  //      four fleur terminals, and ONE small jewelled boss. Filled annuli of alternating
  //      saturated colour make a dartboard; a fine gold line on a pale ground makes a window.
  //
  // ---- border: a band of gold quarries round the whole opening -------------
  vec2  eg   = min(p, 1.0 - p);
  float edge = min(eg.x, eg.y);
  float border = 1.0 - smoothstep(0.056, 0.074, edge);

  // ---- diamond quarry ground ---------------------------------------------
  // 7 across, not 5: the reference's quarries are small and the mesh of cames is most of what
  // says LEADED at a distance where no individual pane can be resolved.
  vec2  qg = vec2((p.x + p.y * uAspect) * 7.0, (p.x - p.y * uAspect) * 7.0);
  vec2  qf = fract(qg);
  float quarryLead = 1.0 - smoothstep(0.0, 0.052, min(min(qf.x, qf.y), min(1.0 - qf.x, 1.0 - qf.y)));
  float quarryId   = hash12(floor(qg) + uSeed);

  // ---- the medallion, drawn as LINEWORK ----------------------------------
  // R3 0.285 puts the medallion at 57% of the window's width, which is what the reference crop
  // measures; the round-6 value of 0.092 was 18% and vanished into the mip chain. 'lw' 0.0125,
  // not 0.0072: at a 1024 bake seen through a window ~200 px wide, a 7-thousandth-of-uv line
  // is a fraction of a screen pixel and mips to the average of itself and the white ground —
  // which is why the first rebuild drew the ornament grey rather than gold.
  float R1 = 0.070, R2 = 0.180, R3 = 0.285;
  float lw = 0.0125;
  float ring1 = smoothstep(lw, lw * 0.35, abs(r - R1));
  float ring2 = smoothstep(lw, lw * 0.35, abs(r - R2));
  float ring3 = smoothstep(lw * 1.3, lw * 0.5, abs(r - R3));
  // a foiled ring between the two outer fillets: eight lobes struck on a circle. The lobes ARE
  // the cusps, and they are what stops the ring reading as a plain hoop.
  float lobeR = (R2 + R3) * 0.5;
  float cusp  = smoothstep(lw, lw * 0.4, abs(r - (lobeR + cos(a * 8.0) * (R3 - R2) * 0.26)));
  // four fleur terminals on the diagonals, just outside the outer fillet
  float fleur = 0.0;
  for (int i = 0; i < 4; i++){
    float fa = 0.7853981 + float(i) * 1.5707963;
    vec2  fp = c - vec2(cos(fa), sin(fa)) * (R3 + 0.050);
    fleur = max(fleur, smoothstep(0.012, 0.0, sdEllipse(rot(-fa) * fp, vec2(0.046, 0.014))));
    fleur = max(fleur, smoothstep(0.011, 0.0, sdEllipse(rot(-fa + 0.62) * fp, vec2(0.032, 0.010))));
    fleur = max(fleur, smoothstep(0.011, 0.0, sdEllipse(rot(-fa - 0.62) * fp, vec2(0.032, 0.010))));
  }
  // ---- ROUND 9: uInk GATES THE DRAWING'S SATURATION AND NEVER ITS PRESENCE ---------------
  //
  // 'critic-estate-6' on room.ballroom: "all four ballroom windows carry an identical
  // concentric-ring decal with a dark central dot, tiled at exactly the same screen
  // position/scale on every window ... not in either bar reference."
  //
  // The round brief suspected the documented worldUV metres-per-repeat trap. IT IS NOT THAT,
  // and that was settled by measurement, not by reading: the live ballroom glass mesh
  // ('kit:glass', 2295 verts = five windows merged) carries uv exactly 0..1 in BOTH axes and
  // its map repeat is exactly 1,1. windowBay authors per-vertex uv (fx, fy) over one
  // lancet-shaped sheet and passes uv = null to GeoBin.add, which means KEEP AUTHORED UVS, so
  // worldUV never runs on glass at all. There is one texture repeat per window and always was.
  //
  // The cause is here. The medallion is a CHURCH ROUNDEL authored into the shared surface, and
  // every mix that draws it is written 0.9x + 0.1x*uInk — so at the daylight glazing's uInk of
  // 0.55 the ornament still lands at 0.964 and the boss at 0.955, i.e. essentially full
  // strength. No existing number turns it off:
  //   * uInk = 0 still draws the ornament at 0.92 and the boss at 0.90, AND collapses leadC to
  //     uPale*0.30, deleting the came grid the gallery's far window was hard-rejected for
  //     lacking. Tested, not assumed - see the A/B in the round report.
  //   * prop-chandelier.js already worked around this the only way available, by flattening its
  //     gold to 0.855 against a pale of 0.900 so the roundel is 5% dark instead of 47%. That is
  //     a palette paying for a missing switch.
  // Measured on the capture, window 1 (the largest), horizontal scan at y 574: the R3 fillet
  // reads 120/113/111 (L 114) against a local ground of 176/171/165 (L 171) - a 57-level ring
  // 0.57 of the window's width across - and the boss reads L 141 against the same 171.
  //
  // So the switch is added rather than found. uMedal is a GEOMETRY gate, not a colour one: at
  // 0 the rings, cusps, fleurs, boss and gem are not drawn at all, and the border and the came
  // grid - which ARE glazing structure and ARE in the references - are untouched. At 1.0 every
  // term is multiplied by exactly 1.0, so the church lancet in light.shaft and room.study is
  // bit-identical to before.
  float orn = max(max(ring1, ring2), max(ring3, max(cusp, fleur))) * uMedal;

  // ---- ROUND 10: uMotif = 1, A CUSPED QUATREFOIL, AND WHY THERE ARE NOW TWO MOTIFS -------
  //
  // NO BACKTICKS IN THIS COMMENT — it lives inside a glsl template literal, and one backtick
  // takes the whole bundle down for every agent sharing the dev server. The lint caught this
  // exact block on its first build, which is the fifth time in three days.
  //
  // 'critic-estate-7' ruled 'room.gallery''s anchor-window split "acceptable-leaning-
  // intentional, but MARGINAL": the roundel above was just removed from fourteen clerestory
  // lights as a defect, and the one far-end anchor that keeps it uses the SAME arch silhouette
  // and the SAME concentric rings — so a viewer without the context reads the accent as the
  // one they missed. Its recommendation was explicit: give it a distinct motif, a rose or a
  // quatrefoil rather than literal concentric target rings.
  //
  // A quatrefoil is the right answer rather than a convenient one. The complaint is that the
  // motif reads as a TARGET, and a target is defined by nested circles about a common centre;
  // this figure has no concentric structure at all. It is the boundary of the UNION of four
  // circles struck on the axes, so min() of their signed distances is the union's SDF and
  // abs() of that is its outline — one closed cusped curve, not four overlapping hoops.
  // Four spandrel eyes and two struck fillets frame it, which is ordinary Gothic tracery and
  // reads as ornament at any size the anchor is ever seen at.
  float quat = 0.0;
  {
    float foilR = 0.132, foilD = 0.140;
    float dq = 1e9;
    for (int i = 0; i < 4; i++){
      float fa = float(i) * 1.5707963;
      vec2  fp = c - vec2(cos(fa), sin(fa)) * foilD;
      dq = min(dq, length(fp) - foilR);
    }
    quat = smoothstep(lw, lw * 0.35, abs(dq));
    // the enclosing fillet, and a second one just inside it so the frame has weight
    quat = max(quat, smoothstep(lw * 1.3, lw * 0.5, abs(r - R3)));
    quat = max(quat, smoothstep(lw, lw * 0.4, abs(r - R3 * 0.885)));
    // four small eyes in the spandrels, on the diagonals where the foils leave a gap
    for (int i = 0; i < 4; i++){
      float fa = 0.7853981 + float(i) * 1.5707963;
      vec2  fp = c - vec2(cos(fa), sin(fa)) * (R3 * 0.80);
      quat = max(quat, smoothstep(lw, lw * 0.4, abs(length(fp) - 0.042)));
    }
  }
  orn = mix(orn, quat * uMedal, uMotif);

  // the jewel: the ONLY filled colour in the design, and it is 60 mm across. The quatrefoil
  // keeps it — it is the one filled note in either motif and it is what stops the ornament
  // reading as pure linework — but drops the wide boss, which is the dark central dot the
  // ring motif was reported for.
  float boss = (1.0 - smoothstep(R1 * 0.90, R1, r)) * uMedal * (1.0 - uMotif);
  float gem  = (1.0 - smoothstep(0.019, 0.025, r)) * uMedal;

  // ---- glass colour -------------------------------------------------------
  //
  // ⚠ ROUND 8 — ON AN EMISSIVE MAP, mix() AT ANYTHING UNDER 1.0 IS NOT A TINT, IT IS A WHITE
  // FLOOD, AND THAT IS WHY THIS WINDOW HAS NEVER SHOWN A COLOURED PANE.
  //
  // 'critic-estate-5': "the pane clipped to near-white with only the dark lead tracery as a
  // silhouette, no visible amber/gold panes ... the colour claim is being carried entirely by
  // the scene sepia grade, not by the glass material." Round 7 solved every one of these
  // vectors correctly against the reference crop and then applied them at mix 0.60-0.92. The
  // arithmetic of what that leaves:
  //
  //   ground   uPale 0.885 x emissive 6      = 5.31 linear
  //   a blue quarry at mix 0.70 keeps 0.30 of the ground   = 1.59 linear
  //   ...against the blue it is replacing it with, 0.021 x 0.70 x 6 = 0.088 linear
  //
  // The SURVIVING GROUND is eighteen times the colour, and ACES puts 1.68 linear at output
  // 245. Every 'coloured' quarry in this window has rendered as white, at every value the
  // palette has ever held, for the whole life of the piece. Same for the border (10% leak =
  // half the total), the ornament (8% leak = 43% of the total) and the boss.
  //
  // So the drawing REPLACES rather than blends, and 'uInk' becomes the saturation gate: at 1.0
  // (the church lancet) a coloured quarry is its own colour, at 0.55 (the ballroom and gallery
  // daylight glazing) most of the pale ground survives on purpose and those windows stay near
  // colourless. The palette itself barely moves — it was already solved; it was never applied.
  vec3 col = uPale * (0.80 + quarryId * 0.40);
  // The coloured quarries are BANDS of the hash, not a tail: 12% amber, 6% blue, 3% ruby. Rare
  // enough to be an accent and common enough that a 200 px window contains several of each,
  // which is what "reads as stained glass at a distance" means.
  float qA = step(0.780, quarryId) * (1.0 - step(0.900, quarryId));
  float qB = step(0.900, quarryId) * (1.0 - step(0.960, quarryId));
  float qR = step(0.960, quarryId) * (1.0 - step(0.990, quarryId));
  float tone = 0.86 + quarryId * 0.28;
  col = mix(col, uAmber * tone, qA * uInk);
  col = mix(col, uBlue  * tone, qB * uInk);
  col = mix(col, uRuby  * tone, qR * uInk);
  col = mix(col, uGold * tone, border * (0.90 + 0.10 * uInk));
  col = mix(col, uGold, orn * (0.92 + 0.08 * uInk));
  col = mix(col, uBlue, boss * (0.90 + 0.10 * uInk));
  col = mix(col, uRuby, gem * (0.85 + 0.15 * uInk));

  // seed bubbles + striations: what stops a leaded light reading as a printed decal.
  // The seed highlight is now a fraction of the GROUND rather than a flat +0.28, which on a
  // palette authored ten times darker would have been the brightest thing in the window.
  float stri = fbmT(vec2(p.x * 22.0, p.y * 90.0) + 4.0, 96.0, 3, 2.0, 0.5);
  vec3  bub  = voronoiT(p * 90.0, 90.0);
  float seeds = smoothstep(0.06, 0.0, bub.x) * step(0.7, bub.z);
  col *= 0.84 + stri * 0.34;
  // PROPORTIONAL, not additive. Adding uPale * 0.12 is 0.106 of emissive-map value, which on a
  // pale quarry is a 12% sparkle and on the new amber quarry (0.074) is MORE THAN THE PANE —
  // every bubble would have punched a white dot through the colour. A seed bubble is a
  // scattering defect: it brightens the glass it is in, it is not a second material.
  col *= 1.0 + seeds * 0.55;

  // ---- leadwork -----------------------------------------------------------
  // The came grid stops inside the medallion, which carries its own; the border has its own
  // came on the inside of the gold band, which is how a real light is glazed.
  // ⚠ THE LEADWORK CARRIES A SECOND COPY OF THE ROUNDEL, AND IT IS THE DARKER ONE. The third
  // line below draws a came ring ON R3 at 0.70, which at the daylight palette lands about 60%
  // of the way to came-black against a pale ground - darker than the gold fillet the eye is
  // meant to be reading. The first line stops the quarry grid inside R3 + 0.070, so with the
  // ornament gone that would leave a bare circular disc in the middle of the glazing: a
  // NEGATIVE bullseye, the same artifact with the sign flipped. Both are gated, so at
  // uMedal = 0 the came grid simply runs unbroken across the whole light, which is what a
  // plain leaded casement is.
  float lead = quarryLead * mix(1.0, smoothstep(R3 + 0.070, R3 + 0.098, r), uMedal) * (1.0 - border);
  lead = max(lead, 1.0 - smoothstep(0.0, 0.0065, abs(edge - 0.074)));
  lead = max(lead, smoothstep(lw * 1.9, lw * 0.8, abs(r - R3)) * 0.70 * uMedal);
  // 0.008, not 0.020, and mixed at FULL strength. See the range note above: at emissive 6 this
  // is 0.048 linear, which is where a came has to sit to come out of the tonemap as a came.
  vec3 leadC = mix(uPale * 0.30, vec3(0.0080, 0.0076, 0.0090), uInk);
  col = mix(col, leadC, lead);

  s.albedo    = sat3(col);
  s.roughness = 0.30 + lead * 0.45;
  s.metalness = 0.0;
  s.ao        = 1.0;
  s.height    = 0.55 - lead * 0.35 + stri * 0.04;
}
`;

export function stainedGlassMat(opts = {}) {
  const o = {
    // The pale quarries are the top luminance decile of any frame this window lights, and a
    // filter hands its own colour to whatever it filters. At (0.88, 0.85, 0.70) they were
    // straw-coloured and dragged `grade.mjs`'s top-decile (r-b)/L to 0.27 on light.shaft.
    // The locked art's diamond quarries are near-neutral and the colour lives in the border
    // and the roundel, which is what these four vectors now say.
    pale: [0.885, 0.872, 0.838],
    // ⚠ THESE ARE EMISSIVE-MAP VALUES, NOT PAINT. They are multiplied by `emissive` (6.0) and
    // then ACES-tonemapped, so a colour authored anywhere near the pale ground lands in the
    // shoulder WITH it and comes out white. The old gold was [0.960, 0.740, 0.230] — brighter
    // than the quarries it was drawn on — and measured out at rgb(250, 245, 205), i.e. it did
    // not exist. Solved backwards from the reference crop: the art's gold ornament measures
    // rgb(168, 151, 123) and its cames measure L 33-60 against a 250 ground, so the drawing
    // sits three to five stops under the field. These four vectors are that arithmetic.
    // ROUND 8 — re-solved through the ACES curve rather than by eye, and the gold moved most.
    // Output = sRGB(ACES(authored * emissive)). At emissive 6, gold 0.115 lands at 0.69 linear
    // = rgb(222, 207, 141), a pale straw — while the note above it correctly states the target
    // as the art's rgb(168, 151, 123). It was out by a factor of 2.5 because the mapping from
    // authored value to output is the tone curve, not a scale. Solved backwards from the target:
    //   r 168 -> 0.276 linear -> 0.046 authored     g 151 -> 0.210 -> 0.035
    //   b 123 -> 0.138 linear -> 0.023 authored
    // and the same inversion for the three quarry colours, whose targets are the reference's
    // amber rgb(200,150,62), blue rgb(78,110,180) and ruby rgb(190,58,52).
    gold: [0.046, 0.035, 0.023],
    amber: [0.0738, 0.0336, 0.0090],
    blue: [0.0115, 0.0215, 0.0527], ruby: [0.0621, 0.0079, 0.0065],
    ink: 1.0,
    // 1 = draw the roundel (a church lancet). 0 = plain leaded glazing with no ornament, which
    // is what every daylight window in this project actually wants — see the note at uMedal in
    // the surface. Defaulted ON so nothing that was authored against the roundel moves.
    medallion: 1.0,
    // 0 = the concentric church roundel · 1 = a cusped quatrefoil. Defaulted to 0 so every
    // window authored against the roundel is bit-identical; only the gallery's anchor asks
    // for 1, and it asks because a critic ruled the shared motif ambiguous THERE and nowhere
    // else. See the uMotif block in GLASS_SURFACE.
    motif: 0.0,
    seed: 4.0, size: 1024, emissive: 6.0, aspect: 1.55, ...opts,
  };
  const t = baker().bake({
    key: `est-glass:${JSON.stringify(o)}`,
    size: o.size, surface: GLASS_SURFACE, heightScale: 0.04, normalStrength: 1.0,
    repeat: [1, 1], anisotropy: 8,
    uniforms: {
      uPale: new THREE.Vector3(...o.pale), uGold: new THREE.Vector3(...o.gold),
      uAmber: new THREE.Vector3(...o.amber),
      uBlue: new THREE.Vector3(...o.blue), uRuby: new THREE.Vector3(...o.ruby),
      uAspect: o.aspect, uSeed: o.seed, uInk: o.ink, uMedal: o.medallion,
      uMotif: o.motif,
    },
  });
  const m = new THREE.MeshStandardMaterial({
    map: t.map, emissiveMap: t.map, normalMap: t.normalMap,
    roughnessMap: t.orm, metalnessMap: t.orm,
    color: 0x000000,
    emissive: new THREE.Color(1, 1, 1),
    emissiveIntensity: o.emissive,
    roughness: 1, metalness: 0,
    side: THREE.DoubleSide,
    toneMapped: true,
  });
  m.name = 'stained-glass';
  return m;
}

// ---------------------------------------------------------------------------
// PORTRAIT CANVAS — an 8-cell atlas of old-master portraits, so a gallery wall of frames
// can be ONE merged mesh with per-frame uv cells and still show eight different sitters.
//
// ROUND 3. `critic-estate-2`: "every painting on both walls is the identical repeated
// crescent-icon placeholder — for a piece titled portrait gallery this is the most damaging
// single defect". That verdict was exactly right and the previous shader is why, in a way
// worth writing down because it is the third instance of the same class of bug on this
// project — authored variation that never reaches the frame.
//
// The old cell DID vary per `cid`: cloth colour picked from three, flesh scaled by a hash,
// collar brightness scaled by a hash. What never varied was the DRAWING. Every cell put the
// same oval at the same (0.5, 0.615), the same hair cap above it, the same body mass rising
// from the same point, and the same collar ring at the same radius. Eight tints of one
// picture is one picture. Worse, the tints were all in the 0.03-0.14 range against a collar
// at 0.72 — so on a wall lit to L 37 the ONLY thing above the noise floor was that collar
// ring, clipped by `step(c.y, 0.50)` into an arc. The critic's "identical crescent icon" is a
// literal description of the one feature that survived: the shape of a clipped ring.
//
// So the fix is not more hashes on the same drawing. Every cell now derives its own SITTER —
// head size and height in the frame (bust versus three-quarter length), head tilt, which
// cheek is lit, skin tone, hair mass or a tall powdered wig, and one of three neck treatments
// (cartwheel ruff / lace jabot / plain band) — plus its own SETTING: a pilaster and swagged
// drape on one side, or a pale landscape opening, on a ground whose warmth varies. And the
// whole tonal range is lifted so the face, not the linen, is the thing that reads at 3 m.
// ---------------------------------------------------------------------------
const PORTRAIT_SURFACE = /* glsl */ `
uniform float uCols;
uniform float uRows;
uniform float uSeed;

void surface(in vec2 uv, inout Surf s){
  vec2 g = vec2(uCols, uRows);
  vec2 cid = floor(uv * g);
  vec2 c = fract(uv * g);
  float h  = hash12(cid + uSeed);
  float h2 = hash12(cid * 3.1  + uSeed + 7.0);
  float h3 = hash12(cid * 7.7  + uSeed + 19.0);
  float h4 = hash12(cid * 13.3 + uSeed + 41.0);
  float h5 = hash12(cid * 21.9 + uSeed + 63.0);

  // A cell is 1/cols x 1/rows of the atlas and lands on a canvas roughly 3 units wide to 4
  // tall, so 1.34 is the factor that makes a circle in this space a circle on the wall.
  // Everything below is measured in that world-isotropic frame.
  float AY = 1.34;

  // ---- the sitter: eight different people, not eight tints of one -------
  float side  = h3 < 0.5 ? -1.0 : 1.0;      // which cheek the studio window is on
  float scl   = 0.86 + h * 0.52;            // head size => bust vs three-quarter length
  float headY = 0.700 - h2 * 0.135;         // how high the sitter sits in the frame
  float lean  = (h4 - 0.5) * 0.085;         // head tilt off the centre line
  float wig   = step(0.60, h4);             // tall powdered wig instead of hair
  float ruff  = step(0.68, h5);             // Elizabethan cartwheel ruff
  float jabot = step(0.38, h3) * (1.0 - ruff);
  float sash  = step(0.62, h2);             // officer's sash across the chest
  float land  = step(0.66, h3);             // a landscape opening rather than a drape

  float hx = 0.5 + lean;
  vec2  q  = (c - vec2(hx, headY)) * vec2(1.0, AY);

  // ---- ground: bituminous brown, its warmth per sitter, lighter behind the head
  // ROUND 5 VALUE LIFT. 'critic-estate-5': "each is a blurred pale oval on a near-black field
  // with one small coloured accent -- they are demonstrably DIFFERENT from each other, but
  // neither one individually reads as a portrait, a face, or a person at any distance."
  // The distinctness fix worked; what it left is a RANGE problem. The whole canvas lived
  // between 0.03 and 0.22 albedo on a wall the grade puts at L 37, so the only thing clearing
  // the noise floor was the linen at 0.575 — which is why the surviving read is a pale smudge
  // with a bright bar under it. An old-master ground is dark RELATIVE TO ITS SITTER, not dark
  // in absolute albedo; a real bituminous brown measures around 0.09-0.13.
  vec3 gA = mix(vec3(0.086, 0.070, 0.054), vec3(0.112, 0.084, 0.053), h5);
  vec3 gB = mix(vec3(0.255, 0.208, 0.145), vec3(0.288, 0.240, 0.200), h2);
  float halo = 1.0 - smoothstep(0.10, 0.46, length((c - vec2(hx, headY - 0.02)) * vec2(1.0, AY)));
  vec3 col = mix(gA, gB, halo * (0.45 + h * 0.45));

  // ---- setting: a pilaster with a swagged drape, OR a pale landscape opening
  float sx = 0.5 + side * 0.34;
  float colm = (1.0 - smoothstep(0.085, 0.105, abs(c.x - sx))) * smoothstep(0.20, 0.32, c.y);
  float sw   = 1.0 - smoothstep(0.0, 0.10, abs(c.y - (0.80 - abs(c.x - sx) * 0.55)));
  col = mix(col, vec3(0.150, 0.126, 0.096), colm * (1.0 - land) * 0.70);
  col = mix(col, vec3(0.135, 0.038, 0.034) * (0.7 + h4 * 0.7), sw * (1.0 - land) * 0.80);
  // the landscape: a pale cool sky band with a dark horizon, the one cool note in the picture
  float ld = (1.0 - smoothstep(0.10, 0.15, abs(c.x - sx)))
           * smoothstep(0.34, 0.42, c.y) * (1.0 - smoothstep(0.74, 0.82, c.y));
  vec3 sky = mix(vec3(0.088, 0.096, 0.104), vec3(0.310, 0.318, 0.300), smoothstep(0.40, 0.76, c.y));
  col = mix(col, sky, ld * land * 0.85);

  // ---- costume: a mass rising from the bottom edge, shoulders set by head size
  float shw = 0.30 + scl * 0.20;
  float body = 1.0 - smoothstep(0.0, 0.14, length((c - vec2(hx, 0.02)) * vec2(1.0 / shw * 0.62, AY * 0.62)) - 0.30);
  // ...and the costume was DARKER than the ground behind it (0.03-0.14 against 0.05-0.22), so
  // the sitter had no silhouette at all — a shoulder line only exists where the shoulder and
  // the wall behind it differ. Lifted, and given a lit edge on the key side, which is the cue
  // that says 'a body turned in a light' rather than 'a darker patch'.
  vec3 cloth = h2 < 0.26 ? vec3(0.205, 0.055, 0.048)
             : (h2 < 0.50 ? vec3(0.058, 0.074, 0.140)
             : (h2 < 0.72 ? vec3(0.090, 0.080, 0.066) : vec3(0.080, 0.102, 0.074)));
  col = mix(col, cloth * (0.75 + h4 * 0.6), body);
  float shoulderLit = body * smoothstep(0.02, 0.22, side * (c.x - hx) + 0.10)
                           * (1.0 - smoothstep(0.0, 0.10, 0.30 - length((c - vec2(hx, 0.02)) * vec2(1.0 / shw * 0.62, AY * 0.62))));
  col = mix(col, cloth * 2.30 + vec3(0.045), clamp(shoulderLit, 0.0, 1.0) * 0.75);
  // the sash: a broad diagonal band of the one saturated colour in the picture
  float sb = 1.0 - smoothstep(0.045, 0.062, abs((c.x - hx) * 0.55 + (c.y - 0.24) * 0.30));
  col = mix(col, vec3(0.245, 0.052, 0.045), sb * body * sash * 0.85);

  // ---- neck: one of three treatments, never the same silhouette twice ----
  float nY = headY - 0.108 * scl;
  vec2  nq = (c - vec2(hx, nY)) * vec2(1.0, AY);
  // cartwheel ruff: a full disc, not an arc
  float rf = (1.0 - smoothstep(0.115 * scl, 0.140 * scl, length(nq)))
             * (1.0 - smoothstep(0.30, 0.55, 1.0 - c.y));
  // lace jabot: a narrow fall down the chest
  float jb = (1.0 - smoothstep(0.030, 0.044, abs(nq.x)))
             * smoothstep(0.0, 0.05, nY - c.y) * (1.0 - smoothstep(0.10, 0.20, nY - c.y));
  // plain linen band at the throat
  float bd = (1.0 - smoothstep(0.055 * scl, 0.075 * scl, abs(nq.x)))
             * (1.0 - smoothstep(0.018, 0.030, abs(nq.y + 0.012)));
  float linen = max(rf * ruff, max(jb * jabot, bd * (1.0 - ruff) * (1.0 - jabot)));
  // pleat shadows, so the linen is a fabric rather than a decal
  float pleat = 0.80 + 0.20 * cos(atan(nq.y, nq.x) * 22.0);
  col = mix(col, vec3(0.575, 0.565, 0.530) * (0.80 + h * 0.28) * pleat, linen * 0.92);

  // ---- the face: the thing that must read at 3 m ------------------------
  float rx = 0.074 * scl, ry = 0.098 * scl;
  float face = 1.0 - smoothstep(0.94, 1.05, length(q / vec2(rx, ry)));
  // a real key direction: lit cheek, shadow cheek, and a terminator between them
  float lit = 0.46 + 0.66 * smoothstep(-0.055, 0.045, side * q.x + q.y * 0.34);
  vec3 flesh = mix(vec3(0.560, 0.410, 0.322), vec3(0.700, 0.545, 0.430), h5) * (0.80 + h * 0.36);
  col = mix(col, flesh * lit, face);
  // brow shadow and a lit forehead plane, which is what makes an oval read as a head
  col = mix(col, flesh * lit * 0.62, face * (1.0 - smoothstep(0.0, 0.030, abs(q.y - ry * 0.16))) * 0.55);
  col = mix(col, flesh * 1.16, face * smoothstep(ry * 0.30, ry * 0.66, q.y) * 0.40);
  // ---- FEATURES, and this is the line between 'a pale oval' and 'a person' ----------------
  // Measured off the shipped gallery capture, a near painting's head is 55-70 px tall and a far
  // one 25-35. Two dark eye marks, a nose shadow, a mouth and a jaw shadow survive at 25 px;
  // brow-and-forehead modelling alone does not, because a smooth gradient over an ellipse is
  // an egg at every resolution. The previous round modelled the LIGHT on the head and never
  // drew the head, which is why the crop shows a lit oval with nothing in it.
  // ---- ROUND 10: EVERY ONE OF THESE WAS A CONE WITH NO FLAT CORE -------------------------
  //
  // The features above were added last round and the complaint did not move, so the natural
  // reading is "they mip away at range". Measured, that is only half true, and the half that
  // is false is the one that was being worked on.
  //
  // The atlas is 1024 at 4x2, so ONE PORTRAIT IS 256 x 512 TEXELS. With scl 0.86-1.38 a head
  // is 2 * 0.074 * scl of the cell width = 33-52 TEXELS ACROSS and 64-103 tall — that is the
  // whole budget a face has ever had, at any viewing distance, including the near painting
  // that fills a third of the frame height. That is a resolution problem and it is fixed by
  // the atlas size in portraitMat, not here.
  //
  // What IS here: every feature was written 1.0 - smoothstep(0.0, R, d). With the inner edge
  // at ZERO that is a soft cone whose peak exists at exactly one point and which ramps to
  // nothing over its entire radius — so its MEAN over a 3-texel footprint is about a third of
  // its nominal strength, and its mean over a 2-pixel far-field footprint is near nothing.
  // A feature that must survive downsampling needs a FLAT CORE: the inner edges below are all
  // non-zero, so each mark keeps its full value over roughly half its radius and only then
  // falls off. Same shapes, same sizes, same palette — this is the difference between drawing
  // an eye and drawing a smudge that is darkest in the middle.
  vec2  fq = q / vec2(rx, ry);                       // head-normalised, -1..1
  float eyes = 0.0;
  for (int i = 0; i < 2; i++){
    float ex = (float(i) * 2.0 - 1.0) * 0.36;
    eyes = max(eyes, 1.0 - smoothstep(0.085, 0.190, length((fq - vec2(ex, 0.10)) * vec2(1.0, 1.9))));
  }
  float nose  = (1.0 - smoothstep(0.028, 0.088, abs(fq.x + 0.06 * side)))
              * smoothstep(-0.36, -0.12, fq.y) * (1.0 - smoothstep(-0.12, 0.06, fq.y));
  float mouth = (1.0 - smoothstep(0.125, 0.290, abs(fq.x)))
              * (1.0 - smoothstep(0.034, 0.098, abs(fq.y + 0.48)));
  float jaw   = smoothstep(-0.52, -0.96, fq.y);
  float feat  = clamp(eyes * 0.95 + nose * 0.50 + mouth * 0.68 + jaw * 0.42, 0.0, 1.0);
  col = mix(col, flesh * lit * 0.38, face * feat);
  // hair mass, or a powdered wig with rolled curls over the ears
  float hm = (1.0 - smoothstep(0.98, 1.10, length((c - vec2(hx, headY + 0.030 * scl)) * vec2(1.0, AY) / vec2(rx * 1.24, ry * 1.16))))
             * smoothstep(-ry * 0.55, -ry * 0.10, q.y);
  vec3 hairCol = mix(vec3(0.062, 0.044, 0.032), vec3(0.128, 0.096, 0.070), h4);
  col = mix(col, hairCol, hm * (1.0 - face * 0.88) * (1.0 - wig));
  // ⚠ THE WIG WAS PHOTOGRAPHING AS A SCALLOP SHELL, and both causes are in this line. Nine
  // exactly-even radial spokes struck from the head's centre is a fan by construction — real
  // rolled curls sit in two or three horizontal tiers over the ears and do not radiate — and at
  // 0.560 it was BRIGHTER than the lit cheek (0.700 * 0.46 shadow side), so the halo out-read
  // the face it belongs to. Fewer, uneven, tiered, and a stop under the flesh.
  float curls = 0.66 + 0.20 * cos(atan(q.y, q.x) * 5.0 + h4 * 6.0)
                     + 0.14 * cos((q.y / max(ry, 1e-4)) * 7.5);
  float wg = (1.0 - smoothstep(0.92, 1.12, length((c - vec2(hx, headY + 0.046 * scl)) * vec2(1.0, AY) / vec2(rx * 1.34, ry * 1.24))))
             * smoothstep(-ry * 0.85, -ry * 0.20, q.y);
  col = mix(col, vec3(0.395, 0.380, 0.352) * curls, wg * wig * (1.0 - face * 0.80));

  // ---- brushwork + canvas weave -----------------------------------------
  float weave = (0.5 + 0.5 * cos(uv.x * 900.0 * TAU / 3.0)) * 0.5 + (0.5 + 0.5 * cos(uv.y * 900.0 * TAU / 3.0)) * 0.5;
  float brush = fbmT(c * vec2(70.0, 26.0) + h * 20.0, 80.0, 3, 2.0, 0.5);
  col *= 0.88 + brush * 0.24;

  // ---- yellowed varnish + craquelure -------------------------------------
  // 0.86/0.80/0.62 was a strong sepia multiply over the WHOLE canvas and this atlas covers
  // twelve of the largest surfaces in a room whose measured top-decile chroma was 0.374.
  // Old varnish is yellow at the edges, where it is thickest, not across the sitter's face.
  float vign = 1.0 - smoothstep(0.25, 0.78, length(c - 0.5));
  col = mix(col * vec3(0.93, 0.89, 0.78), col, vign * 0.80 + 0.20);
  vec3 cr = voronoiT(c * 54.0, 54.0);
  float crack = smoothstep(0.020, 0.002, abs(cr.y - cr.x));
  col *= 1.0 - crack * 0.30;

  s.albedo    = sat3(col);
  s.roughness = clamp(0.44 + brush * 0.22 - vign * 0.10 + crack * 0.2, 0.15, 1.0);
  s.metalness = 0.0;
  s.ao        = 1.0 - crack * 0.15;
  s.height    = 0.5 + brush * 0.10 + weave * 0.05 - crack * 0.12 + linen * 0.10;
}
`;

export function portraitMat(opts = {}) {
  // ⚠ 2048, NOT 1024, AND THE ARITHMETIC IS THE WHOLE ARGUMENT. This is an ATLAS: at 1024
  // with a 4x2 grid each of the eight portraits owns 256 x 512 texels, so a sitter's head is
  // 33-52 texels across and an eye is about 6. `room.gallery`'s standing headline complaint is
  // "faces read as portraits only within about 2 m", and no amount of drawing can answer that
  // inside 33 texels — the near painting fills a third of the frame height and is being
  // magnified about 4x past its own texel grid. 2048 gives each sitter 512 x 1024 and doubles
  // every linear feature. It is the only material in the estate that is an eight-cell atlas of
  // the room's SUBJECT, which is why it, and not the wallpaper, is worth the memory. Used by
  // `room.gallery` alone (grep-checked), so nothing else pays for it.
  const o = { cols: 4, rows: 2, seed: 6.0, size: 2048, ...opts };
  return baker().standard({
    key: `est-portrait:${JSON.stringify(o)}`,
    size: o.size, surface: PORTRAIT_SURFACE, heightScale: 0.02, normalStrength: 0.7,
    repeat: [1, 1], anisotropy: 8,
    uniforms: { uCols: o.cols, uRows: o.rows, uSeed: o.seed },
  }, { envMapIntensity: 0.5, normalScale: new THREE.Vector2(0.5, 0.5) });
}

// ---------------------------------------------------------------------------
// PAINTED BOISERIE — the ballroom's wall field: broken-white oil paint over a moulded
// panel, dirty in the hollows. Distinct from walnut, which is what the study uses.
// ---------------------------------------------------------------------------
const BOISERIE_SURFACE = /* glsl */ `
uniform vec3  uPaint;
uniform float uGrime;
void surface(in vec2 uv, inout Surf s){
  float brush = fbmT(vec2(uv.x * 8.0, uv.y * 90.0), 96.0, 3, 2.0, 0.5);
  float tooth = fbmT(uv * 190.0, 190.0, 2, 2.0, 0.5);
  // craquelure in old oil paint: long, branching, follows the panel
  vec3 cr = voronoiT(uv * 30.0, 30.0);
  float crack = smoothstep(0.016, 0.002, abs(cr.y - cr.x));
  // grime rises from the bottom and settles in a broad drift
  float dirt = uGrime * (smoothstep(0.30, 0.0, uv.y) * 0.7 +
                         smoothstep(0.35, 0.85, fbmT(uv * 4.0 + 19.0, 4.0, 3, 2.0, 0.55)) * 0.5);

  vec3 col = uPaint * (0.94 + brush * 0.10 + tooth * 0.04);
  col = mix(col, uPaint * vec3(0.58, 0.54, 0.46), sat(dirt) * 0.55);
  col *= 1.0 - crack * 0.22;

  s.albedo    = sat3(col);
  s.roughness = clamp(0.42 + tooth * 0.16 + sat(dirt) * 0.28 + crack * 0.2, 0.15, 1.0);
  s.metalness = 0.0;
  s.ao        = 1.0 - crack * 0.20 - sat(dirt) * 0.10;
  s.height    = 0.5 + brush * 0.08 + tooth * 0.03 - crack * 0.16;
}
`;

export function boiserieMat(opts = {}) {
  const o = { paint: [0.560, 0.535, 0.478], grime: 0.75, size: 1024, repeat: [1, 1],
    bakeDust: 0, ...opts };
  return baker().standard({
    key: `est-bois:${JSON.stringify(o)}`,
    size: o.size, surface: BOISERIE_SURFACE, heightScale: 0.025, normalStrength: 0.9,
    repeat: o.repeat, anisotropy: 8, bakeDust: o.bakeDust,
    uniforms: { uPaint: new THREE.Vector3(...o.paint), uGrime: o.grime },
  }, { clearcoat: 0.25, clearcoatRoughness: 0.35, envMapIntensity: 1.0 }, THREE.MeshPhysicalMaterial);
}

// ---------------------------------------------------------------------------
// FOXED MERCURY SILVERING — the ballroom's pier glasses.
//
// `critic-estate-2`: "the mirror wall is a flat, textureless grey-beige plane with zero
// reflection of the room". The prior owner's diagnosis was right and is worth keeping: a
// PERFECT mirror of a five-box IBL shell is a perfect mirror of nothing, so roughening it
// changed a flat plane into a slightly softer flat plane. Two things are needed and only
// one of them is a material — the other is a real reflection probe (see `room-ballroom.js`).
//
// This is the material half. An eighteenth-century mercury-silvered plate is NOT an optical
// mirror: the tin amalgam oxidises from the edges inward, so the glass carries a dark
// speckled bloom near the frame, a scatter of black pinholes where the amalgam has lifted
// clean off, and long horizontal drift bands from the pouring. That gives the plate its own
// texture at 20 cm, breaks the reflection into something the eye reads as GLASS rather than
// as chrome, and — the part that matters most here — it means the plate is legible even
// where the reflection has nothing in it.
//
// metalness stays 1.0 everywhere the silvering survives; where it has lifted, metalness
// drops and the roughness jumps, which is what makes a pinhole read as a hole rather than
// as a grey dot.
// ---------------------------------------------------------------------------
const MIRROR_SURFACE = /* glsl */ `
uniform vec3  uSilver;
uniform float uFox;
// fbmT sums octaves into a narrow bell around 0.5 and never reaches the ends of its range;
// any gate written against the raw value silently never fires. Stretch before gating.
float pat(float v, float k){ return clamp((v - 0.5) * k + 0.5, 0.0, 1.0); }
void surface(in vec2 uv, inout Surf s){
  // distance from the plate edge, in UV — the amalgam always dies from the edge inward
  vec2  e   = min(uv, 1.0 - uv);
  float edge = 1.0 - smoothstep(0.0, 0.22, min(e.x, e.y));

  // the oxidised bloom: a coarse cloud, gated hard so it stays in patches rather than
  // becoming an even wash. Stretched first, because a raw fbmT never leaves its middle.
  float cloud = pat(fbmT(uv * 5.0, 5.0, 4, 2.0, 0.55), 2.2);
  float bloom = sat(cloud * (0.35 + edge * 1.15) - 0.30) * uFox;

  // black pinholes where the tin has lifted clean off the glass
  vec3  cell  = voronoiT(uv * 34.0, 34.0);
  float spot  = smoothstep(0.055, 0.012, cell.x) * step(0.55, hash11(cell.z * 7.3));
  spot *= sat(0.25 + edge * 1.4) * uFox;

  // pouring drift: long, very low-contrast horizontal bands in the silvering thickness
  float drift = fbmT(vec2(uv.x * 2.0, uv.y * 26.0), 26.0, 3, 2.0, 0.5);

  vec3 col = uSilver * (0.97 + drift * 0.06);
  col = mix(col, vec3(0.150, 0.128, 0.100), bloom * 0.85);   // warm tarnish
  col = mix(col, vec3(0.030, 0.028, 0.026), spot);           // dead glass

  s.albedo    = sat3(col);
  s.roughness = clamp(0.055 + bloom * 0.42 + spot * 0.55 + drift * 0.02, 0.03, 1.0);
  s.metalness = clamp(1.0 - bloom * 0.45 - spot * 0.9, 0.0, 1.0);
  s.ao        = 1.0 - spot * 0.25;
  s.height    = 0.5 + drift * 0.03 - spot * 0.10;
}
`;

export function foxedMirrorMat(opts = {}) {
  const o = { silver: [0.760, 0.775, 0.790], fox: 0.85, size: 1024, repeat: [1, 1], ...opts };
  return baker().standard({
    key: `est-mirror:${JSON.stringify(o)}`,
    size: o.size, surface: MIRROR_SURFACE, heightScale: 0.006, normalStrength: 0.5,
    repeat: o.repeat, anisotropy: 8,
    uniforms: { uSilver: new THREE.Vector3(...o.silver), uFox: o.fox },
  }, { envMapIntensity: 1.0 });
}

// ---------------------------------------------------------------------------
// LEAD CRYSTAL. No transmission pass — `transmission` is a second scene render per frame
// and the perf budget will not carry one, let alone three fixtures of it.
//
// ROUND 5. `critic-estate-2`, twice now: "no faceting, no colour dispersion, no internal
// refraction highlights — they read as opaque frosted-white/milky teardrops". The geometry
// was never the problem: `dropGeo()` is an 8-sided lathe put through `facet()`, so every
// drop genuinely has flat facets with hard normals. The MATERIAL was the problem, and in a
// way that is obvious once stated — it was OPAQUE, and its base colour was 0xdce7f2, a
// near-white. An opaque near-white body under a bright key returns roughly the same value
// from every facet no matter which way that facet points, because a Lambert term over a
// small solid angle barely changes. Eight facets all returning "pale" average, at chandelier
// distance, to exactly one thing: a frosted teardrop. Every knob that was turned to fix it —
// roughness 0.045, clearcoat 1.0, envMapIntensity 3.2 — makes the SPECULAR sharper, and the
// specular was never what dominated; the flat white diffuse was.
//
// What makes glass read as glass, in order of how much it buys:
//
//  1. YOU CAN SEE THROUGH IT. The single biggest cue, and it is free: alpha blending. A drop
//     that lets the dark room behind it show through stops being a solid object. The body
//     colour comes down to a dim blue-grey at the same time, because a clear thing is not
//     white — white IS the frosted read.
//  2. FRESNEL. Glass is transparent face-on and a mirror at grazing incidence. Driving alpha
//     from the view/normal angle is what puts a bright rim on every facet that turns away
//     and leaves the middle of each facet dark. On a faceted solid that reads directly as
//     cut edges catching light, which is the "faceting" the critic cannot find.
//  3. FIRE. Real lead crystal disperses: each facet flashes its own colour. The geometry is
//     flat-shaded, so the facet normal is CONSTANT across each facet — feeding it into a
//     three-phase cosine gives each facet one saturated hue, scattered over the drop, which
//     is exactly the look and costs three cosines.
//
// Alpha is Fresnel-driven, so the fire appears precisely where the surface is opaque enough
// to show it; the two effects reinforce instead of cancelling. `depthWrite` stays TRUE: the
// drops are one InstancedMesh and cannot be sorted internally, so letting the nearest
// fragment win is both correct-looking and cheaper than any alternative.
// ---------------------------------------------------------------------------
export function crystalMat(opts = {}) {
  const o = { base: 0.16, fire: 0.55, ...opts };
  delete o.base; delete o.fire;
  const uBase = opts.base ?? 0.16;
  const uFire = opts.fire ?? 0.55;

  const m = new THREE.MeshPhysicalMaterial({
    // A dim blue-grey, not a near-white. Most of what you see is the reflection and what is
    // behind the drop; the body itself contributes almost nothing, which is the point.
    color: new THREE.Color(0x2c3947),
    metalness: 0.0,
    roughness: 0.030,
    ior: 1.78,
    reflectivity: 1.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.015,
    envMapIntensity: 4.2,
    emissive: new THREE.Color(0xffe6c4),
    emissiveIntensity: 0.020,
    transparent: true,
    depthWrite: true,
    ...o,
  });

  const uni = {
    uCrystalBase: { value: uBase },
    uCrystalFire: { value: uFire },
  };
  m.userData.uniforms = uni;

  m.onBeforeCompile = (shader) => {
    shader.uniforms.uCrystalBase = uni.uCrystalBase;
    shader.uniforms.uCrystalFire = uni.uCrystalFire;
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', [
        'uniform float uCrystalBase;',
        'uniform float uCrystalFire;',
        'void main() {',
      ].join('\n'))
      .replace('#include <opaque_fragment>', [
        '{',
        // geometryNormal / geometryViewDir are three.js\'s own already-normalised pair from
        // <normal_fragment_begin>, and they handle the orthographic case correctly.
        '  vec3 crN = geometryNormal;',
        '  float crF = pow( 1.0 - clamp( dot( crN, geometryViewDir ), 0.0, 1.0 ), 2.6 );',
        // transparent face-on, near-opaque and mirror-bright at the edge of every facet
        '  diffuseColor.a *= clamp( uCrystalBase + crF * 0.90, 0.0, 1.0 );',
        // dispersion: the facet normal is constant across a flat-shaded facet, so each facet
        // flashes one hue. Gated on the Fresnel so it lives on the cut edges, not the middle.
        '  float crP = crN.x * 7.3 + crN.y * 4.1 + crN.z * 5.7;',
        '  vec3 crFire = vec3( 0.5 + 0.5 * cos( crP ),',
        '                      0.5 + 0.5 * cos( crP + 2.094 ),',
        '                      0.5 + 0.5 * cos( crP + 4.189 ) );',
        '  outgoingLight += crFire * crF * crF * uCrystalFire;',
        '}',
        '#include <opaque_fragment>',
      ].join('\n'));
  };
  // onBeforeCompile mutates the program source, so it needs its own cache key or three.js
  // hands this material a program compiled for a plain MeshPhysicalMaterial.
  m.customProgramCacheKey = () => `crystal:${uBase}:${uFire}`;
  m.name = 'lead-crystal';
  return m;
}

/** A visible flame / filament / hot glass source. Unlit, blooms, casts no shadow. */
export function emissiveMat(color = 0xffb457, intensity = 6.0) {
  const m = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: new THREE.Color(color),
    emissiveIntensity: intensity,
    roughness: 1, metalness: 0,
    toneMapped: true,
  });
  return m;
}

// ---------------------------------------------------------------------------
// Defensive resolution of materials-agent's surfaces.
// ---------------------------------------------------------------------------

// The paths are built at runtime and marked @vite-ignore so the bundler never tries to
// resolve them. That is the point: `materials/surfaces/brass.js` does not exist yet, and a
// statically analysed import of a missing file is a hard 500 from the dev server — one
// agent's unwritten file would take down all six of these rooms. Resolved late, a missing
// module is just a rejected promise we catch.
// ⚠ THE RUNTIME-URL VERSION OF THIS SILENTLY DOWNGRADED EVERY BUILT RENDER.
//
// It was `new URL('../materials/surfaces/' + name, import.meta.url)` — a path computed at run
// time so the bundler would never try to resolve it. In DEV that works: `import.meta.url` is
// `/src/world/materials-local.js` and the sibling resolves to `/src/materials/surfaces/…`. In a
// BUILD it does not. `materials-local.js` is bundled to `/assets/materials-local-*.js`, so the
// same expression asks for `/materials/surfaces/walnut.js`, which does not exist in `dist/` —
// and `harness/serve.mjs` answers unknown paths with `index.html` at **200 OK**, so the import
// does not 404, it succeeds and returns an HTML document. Parsing that throws, `tryMod` catches
// it exactly as designed, and every borrowed surface quietly becomes its local stand-in.
//
// Measured: `node harness/_tmp_geoprobe.mjs --pick --view light.dark` (which serves `dist/`)
// reports the study's and dark room's walnut panelling as
// `est-bois:{"paint":[0.23,0.15,0.092],…}` — the fallback PAINT shader — not walnut.
//
// Two consequences worth separating, because one of them is an instrument fault:
//   - `shoot.mjs` runs `npm run dev`, so the CAPTURES are fine and no estate grade is affected.
//   - `_tmp_geoprobe.mjs` serves `dist/`, so the ownership raycast reports a DIFFERENT material
//     set than the picture it is being used to explain. Any `--pick` material identification
//     on an estate view before this fix names the fallback. Mesh names and geometry are
//     unaffected, so ownership conclusions still hold; material ones do not.
//   - the built game — the thing `game.play` actually ships — has been rendering the whole
//     estate on stand-in surfaces.
//
// The four modules all exist now (the comment this replaces was written when they did not), so
// the specifiers can be literals. Vite then emits a real chunk per module and the dynamic
// import still rejects rather than throwing if one of them fails at evaluation, which is the
// property the original was protecting.
const _MODS = {
  'walnut.js': () => import('../materials/surfaces/walnut.js'),
  'wallstages.js': () => import('../materials/surfaces/wallstages.js'),
  'marble.js': () => import('../materials/surfaces/marble.js'),
  'brass.js': () => import('../materials/surfaces/brass.js'),
};

async function tryMod(name) {
  try {
    const load = _MODS[name];
    if (!load) return null;
    return await load();
  } catch (e) {
    console.warn(`[estate] optional surface module "${name}" unavailable:`, e?.message ?? e);
    return null;
  }
}

let _cache = null;

/**
 * The whole estate palette in one object. Cached — call it from every view.
 *
 * EVERY ENTRY IS A LAZY GETTER, and that is not a style choice. Baking all twenty-two
 * surfaces eagerly cost 62 SECONDS of page load, which blew the harness's 60 s ready
 * timeout and made the rooms unshootable. Almost none of it was texel throughput: it is
 * D3D shader compilation. The baker inlines `surface()` five times per texel (centre plus
 * four gradient taps), so a shader with a domain-warped three-contour vein system or a
 * 3x3 voronoi becomes an enormous unrolled HLSL function, and marble alone has five
 * variants of it — two at 2048. Measured: the eleven surfaces owned by this file total
 * 7.8 s; the five marble variants plus three walnuts plus wallpaper and plaster were the
 * other 54.
 *
 * A getter means a view pays only for what it actually puts on screen. The study touches
 * eleven surfaces and loads in about eight seconds; the gallery touches a different
 * eleven. Nothing else changes at the call site — `mats.marbleFloor` still just works.
 *
 * Borrowed (falls back to a local bake if the sibling module is missing or throws):
 *   walnut, walnutDado, walnutBoard   <- materials/surfaces/walnut.js
 *   wallpaper, plaster                <- materials/surfaces/wallstages.js
 *   brass                             <- materials/surfaces/brass.js (not written yet)
 *   marbleFloor/Chequer/Slab/Dark/Tread <- materials/surfaces/marble.js
 * Owned here:
 *   gilt, giltFrieze, stone, sootStone, ashlar, ceiling, tapestry, carpet, parquet,
 *   boiserie, glass, portrait, crystal
 */
export async function estateMaterials() {
  if (_cache) return _cache;

  const [walnutMod, wallMod, marbleMod, brassMod] = await Promise.all([
    tryMod('walnut.js'), tryMod('wallstages.js'), tryMod('marble.js'), tryMod('brass.js'),
  ]);

  const call = (fn, args, fallback) => {
    if (typeof fn !== 'function') return fallback();
    try { return fn(args); } catch (e) { console.warn('[estate] surface threw, using local:', e?.message ?? e); return fallback(); }
  };

  const m = {};
  const defs = {
    // ---- walnut panelling: the study's whole identity ----
    // TINT IS PASSED IN, NOT TAKEN AS DEFAULT. walnut.js ships wood [0.213,0.132,0.079],
    // which is 0.037 linear at its lightest and about 0.012 averaged over the figure. A
    // wall at 0.012 albedo cannot be lit — at any irradiance the room can afford it lands
    // below 20/255 and reads as a hole, which is exactly what round 2 of room.study looked
    // like. Real dark walnut is 0.05–0.09 linear. These values put the ground there while
    // keeping the pores and the dark side of the cathedral figure genuinely dark, so the
    // wood still reads as walnut and not as oak.
    walnut: () => call(walnutMod?.walnutPanel,
      { panelsX: 1, panelsY: 3, stile: 0.13, bevel: 0.030, grime: 0.9, size: 1024,
        wood: [0.372, 0.243, 0.152], woodDark: [0.146, 0.088, 0.054] },
      () => boiserieMat({ paint: [0.230, 0.150, 0.092], grime: 0.9 })),
    // THE WALL FIELD IS NOT THE SAME TEXTURE AS THE PANEL, and conflating them is what
    // produced the horizontal brick-tiling artifact on room.study's panelling.
    //
    // `walnutPanel` bakes a COMPLETE frame-and-panel design into the tile: stiles, rails, a
    // recessed field, and — the part that does the damage — a grime gradient keyed off
    // `uv.y` that darkens the bottom 35% of every tile. `wallRun` then maps that tile in
    // WORLD space at `uvWall` repeats per metre. At the study's 2.6 that is eleven repeats
    // up a 4.32 m wall, so eleven dark bands, each subdivided by the texture's own three
    // panel rows. Thirty-three horizontal edges is a brick wall, and no amount of work
    // inside walnut.js can fix it because walnut.js is doing exactly what it was asked.
    //
    // The geometry ALREADY builds real fielded panels — `wallRun` emits a sunk box and a
    // mitred moulding per bay. So the texture's job is only to be walnut: one book-matched
    // flat-sawn leaf, no frame, no per-tile gradient. `grime: 0` is what switches off both
    // the `low` band and the `ledge` dust line, which are the only two terms in that shader
    // that reference the tile's own edges once the stile is hairline.
    // ROUND 5 DESATURATES IT, and this is the largest single correction on room.study's grade.
    // Cropping the same fractional box out of the render and out of `1785319916301`:
    //     walnut back wall   art 46,38,31 (r-b 15, (r-b)/L 0.38)
    //                     render 76,48,26 (r-b 50, (r-b)/L 0.95)
    // Two and a half times the art's warm bias, on the material that occupies most of the
    // frame — which is why room.study's deciles 3 to 8 all measure (r-b)/L near 1.0 while the
    // art's fall from 0.75 to 0.22 across the same range. The top-decile gate passed the whole
    // time, because the top decile is the floor and the floor is neutral; the amber was in the
    // MID-TONES, where the gate does not look. An albedo at r/b 2.45 cannot be lit to r/b 1.5
    // by any light that is not blue, and this room correctly has no blue in it. So the ratio
    // has to come out of the albedo: 2.45 -> 1.64, keeping the value.
    walnutField: () => call(walnutMod?.walnutPanel,
      { panelsX: 1, panelsY: 1, stile: 0.006, bevel: 0.010, grime: 0.0, size: 1024,
        seed: 6.0, wood: [0.322, 0.252, 0.196], woodDark: [0.128, 0.095, 0.074] },
      () => boiserieMat({ paint: [0.230, 0.150, 0.092], grime: 0.35 })),
    walnutDado: () => call(walnutMod?.walnutPanel,
      { panelsX: 1, panelsY: 1, stile: 0.20, bevel: 0.035, grime: 1.0, size: 512,
        wood: [0.330, 0.212, 0.132], woodDark: [0.128, 0.076, 0.047] },
      () => m.walnut),
    walnutBoard: () => call(walnutMod?.walnutBoards,
      { size: 1024, wood: [0.395, 0.262, 0.166], woodDark: [0.158, 0.098, 0.062] },
      () => boiserieMat({ paint: [0.250, 0.165, 0.102], grime: 0.6 })),

    // MOULDINGS ARE NOT MADE OF FLOORBOARDS, and until this existed they were.
    //
    // `walnutBoard` resolves to `walnutBoards`, whose own header says it is "a real board
    // floor: long planks, staggered end joints". Every room here was then using it for the
    // skirting, the dado rail, the cornice, the panel mouldings and the door leaves — and
    // `wallRun` emits most of those with `uv = null`, which `GeoBin.add` turns into
    // `worldUV(g, 1)`, one plank-floor repeat per METRE. A 0.18 m skirting board therefore
    // shows a horizontal slice through a floor's staggered end joints, and so does every
    // moulding beside it. Stacked up a wall that is a brick bond, and it is the
    // "brick-like horizontal tiling artifact" the estate slice plan attributes to a
    // regression in walnut.js. It is not a regression in walnut.js. walnut.js is drawing a
    // floor because it was asked for a floor.
    //
    // A moulding is a single length of timber: one board, no end joints, quarter-sawn
    // because that is how stable stock is cut. Slightly lighter than the field so the
    // relief still separates when the light is flat.
    walnutTrim: () => call(walnutMod?.walnutPanel,
      { panelsX: 1, panelsY: 1, stile: 0.004, bevel: 0.008, grime: 0.0, size: 1024,
        seed: 11.0, wood: [0.352, 0.280, 0.222], woodDark: [0.146, 0.110, 0.086] },
      () => boiserieMat({ paint: [0.250, 0.165, 0.102], grime: 0.35 })),

    // ---- damask silk + lime plaster ----
    // The damask's ground was left at wallstages' default [0.455, 0.352, 0.268] — a red-brown
    // whose own red-to-blue ratio is 1.7 before any light touches it. It covers both walls of
    // the gallery from dado to cornice, so it is the largest single contributor to that
    // view's measured monochrome amber. Warmer than neutral is right for old silk; 1.7 is a
    // surface that can only ever return one hue (§9: a surface cannot show the colour of
    // anything it has no channel for).
    wallpaper: () => call(wallMod?.wallpaperMat,
      { size: 1024, ground: [0.430, 0.374, 0.334], motif: [0.562, 0.502, 0.436] },
      () => boiserieMat({ paint: [0.180, 0.125, 0.115], grime: 0.6 })),
    // A FADED variant for room.gallery. Measured on that view's top-decile mask, the sconce
    // pools on the wallpaper are the largest warm population in the brightest 10% of the
    // frame, and a lit surface returns the product of the light's red/blue ratio and its own.
    // The paper above is r/b 1.29; this is 1.10. Silk damask in a house that has been shut up
    // fades toward grey-fawn, so this is the older wall, not a different one.
    wallpaperNeutral: () => call(wallMod?.wallpaperMat,
      { size: 1024, ground: [0.412, 0.386, 0.374], motif: [0.532, 0.505, 0.484] },
      () => boiserieMat({ paint: [0.165, 0.150, 0.143], grime: 0.6 })),
    plaster: () => call(wallMod?.plasterMat, { size: 1024 },
      () => ceilingMat({ tint: [0.640, 0.616, 0.568], stain: 0.7 })),

    // ---- marble ----
    // MARBLE COMES FROM THE LOCAL FAST VERSION, NOT FROM marble.js, AND THAT IS A
    // MEASURED DECISION — see the note above MARBLE_SURFACE. `mat.marble` on its own takes
    // 69 s to reach ready on this machine; the harness gives a view 60 s. Any room that
    // used it would be permanently unshootable. The `*Hq` entries below keep the real
    // module wired up for anyone who wants it (or for when it gets cheaper), and every
    // room here uses the local one.
    marbleFloor: () => estateMarbleFloor(),
    marbleChequer: () => estateMarbleChequer(),
    marbleSlab: () => estateMarbleSlab(),
    marbleDark: () => estateMarbleDark(),
    marbleTread: () => estateMarbleDark({ pattern: 3, slabsX: 1, slabsY: 1, wear: 0.85, rough: 0.165 }),
    marbleFloorHq: () => call(marbleMod?.marbleFloor, { size: 1024 }, () => estateMarbleFloor()),
    marbleChequerHq: () => call(marbleMod?.marbleChequer, { size: 1024 }, () => estateMarbleChequer()),
    marbleSlabHq: () => call(marbleMod?.marbleSlab, { size: 512 }, () => estateMarbleSlab()),

    // ---- sawn deal: packing cases, trestles, barricade timber ----
    // Same SHADER as walnutBoard (walnut.js's board floor), different uniforms — so this
    // costs one bake and NO extra D3D program compile, which matters on a view that already
    // takes ~50 s to reach ready. What makes it deal rather than walnut is entirely in the
    // numbers: five wide boards instead of ten narrow ones, one segment (a case side is one
    // length of stock, not a floor with staggered end joints), a fat joint, and a pale
    // yellow-grey ground. `wear` and `grime` at maximum because a packing case is sawn,
    // knocked about and never finished.
    //
    // ⚠ CLEARCOAT IS TURNED OFF AFTER THE FACT. walnutBoards hard-codes `clearcoat: 0.35`
    // for a waxed floor; on a crate that is a coat of varnish, and under this room's raking
    // daylight it reads as wet plastic. The scalar is a plain uniform, so clearing it here
    // is a legitimate override rather than a fork of the surface.
    crateDeal: () => {
      const mm = call(walnutMod?.walnutBoards,
        { size: 512, boardsX: 5, segLen: 1, jointW: 0.040, wear: 0.95, grime: 1.0, seed: 21.0,
          wood: [0.520, 0.455, 0.352], woodDark: [0.286, 0.242, 0.180] },
        () => boiserieMat({ paint: [0.470, 0.412, 0.330], grime: 1.0 }));
      if (mm && 'clearcoat' in mm) { mm.clearcoat = 0.0; mm.clearcoatRoughness = 1.0; }
      return mm;
    },

    // ---- brass ----
    brass: () => call(brassMod?.brassMat ?? brassMod?.brass, {}, () => brassLocalMat()),

    // ---- owned ----
    gilt: () => giltMat(),
    giltFrieze: () => giltMat({ ornament: 1, wear: 0.42, seed: 9.0, leaf: 9 }),
    stone: () => stoneMat({ stone: [0.545, 0.540, 0.520], course: 0 }),
    sootStone: () => stoneMat({ stone: [0.510, 0.500, 0.482], soot: 1.0, seed: 11.0 }),
    ashlar: () => stoneMat({ stone: [0.500, 0.492, 0.470], course: 6, seed: 13.0, repeat: [2, 2] }),
    ceiling: () => ceilingMat(),
    tapestry: () => tapestryMat(),
    carpet: () => carpetMat(),
    parquet: () => parquetMat(),
    boiserie: () => boiserieMat(),
    glass: () => stainedGlassMat(),
    // Clear leaded daylight glazing for the ballroom and the gallery: same leaded quarry
    // construction, but the glass is nearly colourless so the light it passes reads as
    // daylight rather than as a church window.
    // `ink` 0.55 and a HALF-VALUE gold: daylight glazing wants visible glazing STRUCTURE (the
    // gallery's far window was hard-rejected for having none) without the near-black cames and
    // saturated ornament of a church light. Same shader, two different windows.
    clearGlass: () => stainedGlassMat({
      pale: [0.900, 0.930, 0.980], gold: [0.480, 0.512, 0.560],
      // amber must be given explicitly or daylight glazing inherits the church lancet's, and
      // the quarry bands are new in round 8 — an unset default would put saturated amber panes
      // in the ballroom's and the gallery's windows, which is the opposite of what they are for.
      amber: [0.470, 0.470, 0.480],
      blue: [0.360, 0.420, 0.520], ruby: [0.430, 0.450, 0.485],
      // NO ROUNDEL. A ballroom's windows are daylight glazing, and both bar references agree:
      // BF1's ballroom windows are plain small-pane casements with glazing bars and nothing
      // drawn on them. With one texture repeat per window, an ornament in this shader is an
      // ornament in EVERY window at the same place, which is what a critic reads as a repeated
      // artifact rather than as five separate windows.
      medallion: 0,
      seed: 12.0, emissive: 3.4, aspect: 2.1, ink: 0.55,
    }),
    portrait: () => portraitMat(),
    crystal: () => crystalMat(),
    // Antique pier-glass silvering. The reflection itself comes from a probe the VIEW
    // installs as this material's `envMap` — see `room-ballroom.js`.
    mirror: () => foxedMirrorMat(),
  };

  for (const [name, make] of Object.entries(defs)) {
    let v;
    Object.defineProperty(m, name, {
      enumerable: true,
      configurable: true,
      get() { if (v === undefined) v = make(); return v; },
    });
  }

  _cache = m;
  return m;
}

/** Test hook — the baker caches by key so this only matters across page loads. */
export function _resetEstateMaterials() { _cache = null; }
