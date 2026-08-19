import * as THREE from 'three';
import { baker } from '../baker.js';

/**
 * Palace marble — Carrara / Calacatta field stone, Nero Marquina for inlay and treads.
 *
 * WHY VEINS ARE DONE THIS WAY
 * The obvious approach — threshold a squashed ridged fbm — gives diagonal zebra stripes,
 * because a threshold band is wide wherever the noise field happens to be locally flat
 * and vanishes where it is steep. Real veins are the opposite: near-constant width,
 * wandering, branching at shallow angles.
 *
 * So a vein here is an *iso-contour* of one smooth domain-warped field, and the contour
 * width is divided by the local gradient magnitude, which turns "difference from a level"
 * into an actual distance to the contour. That gives constant-width filaments that
 * meander and fork on their own. Three contours at nearby levels off the SAME field give
 * the real structure: a main fracture with thinner ones running alongside it and pinching
 * in and out, plus a soft bleached halo where the calcite recrystallised.
 *
 * Contrast is deliberately low. Carrara is a white stone with grey veins — measured off
 * `refs/marble/marble-navapark-calacatta-bianco.jpg` the veins sit around 0.55 of the
 * ground's value and cover maybe a tenth of the surface. Most of a marble slab is clean.
 *
 * Polish is roughness ~0.13, not 0.03. Polished marble is glossy, not a mirror; at 0.03
 * plus a heavy clearcoat the albedo becomes invisible and you cannot judge the stone.
 *
 * Slabs are cut by the grid and each one gets its own vein rotation, sample offset and
 * tint drift from its cell hash. Joints are sawn, chamfered so the arris catches a
 * highlight, and filled with grey mortar. Wear lives in roughness: foot-traffic polish
 * loss in the walking patches, sparse scratch families, dust banked against the joints.
 * Scratches are in roughness ONLY — a scratch in a normal map at texel scale is a moiré
 * generator, not a scratch.
 */

const MARBLE_SURFACE = /* glsl */ `
uniform float uSlabsX;
uniform float uSlabsY;
uniform float uPattern;      // 0 cabochon field · 1 running bond · 2 chequer · 3 single slab
uniform float uBaseDark;     // 0 field stone is light, 1 field stone is dark
uniform float uJointW;       // sawn joint half-width, in slab-local units
uniform float uCabSize;      // cabochon half-diagonal, in cell units
uniform float uRough;        // polished base roughness
uniform float uWear;
uniform float uDust;
uniform float uSeed;

uniform vec3  uGroundA;      // light stone
uniform vec3  uVeinA;
uniform float uVeinWA;       // contour width, slab-local units
uniform float uScaleA;       // vein features across a slab
uniform float uAnisoA;       // >1 = veins run long in x

uniform vec3  uGroundB;      // dark stone
uniform vec3  uVeinB;
uniform float uVeinWB;
uniform float uScaleB;
uniform float uAnisoB;

// ---------------------------------------------------------------------------
// The field whose contours are the veins. Domain-warped so the contours wander
// and fork instead of running straight.
// ---------------------------------------------------------------------------
// pn is the noise-lookup coordinate (carries the big per-slab offset so no two slabs
// sample the same noise). pl is the SAME point in slab-local space, centred on zero.
//
// The two must stay separate. The ramp below has to be computed from pl: driven from pn,
// the per-slab offset (up to 26 units) dominates it, shoves the field far outside the
// contour levels, and most slabs come out with no veins at all.
// fbmT sums octaves, so by the central limit theorem its output is a narrow bell about
// 0.5 and it essentially never reaches 0.9. The scratch gates below are written at 0.905
// and 0.925 and had therefore NEVER drawn a single scratch. pat() stretches the
// distribution about its midpoint first, so a threshold means what it appears to mean.
float pat(float v, float k){ return clamp((v - 0.5) * k + 0.5, 0.0, 1.0); }

float vfield(vec2 pn, vec2 pl){
  // Gentle warp only. At 0.72 amplitude / 0.85 frequency the warp was the same scale as
  // the field itself, which folded the iso-contours back on themselves into closed loops
  // and spirals — a topographic contour map. Veins are fractures; they never close.
  // Low amplitude, low frequency: bend the vein, don't fold it.
  vec2 w = pn + (vec2(fbmT(pn * 0.42 + 13.7, 48.0, 2, 2.0, 0.5),
                      fbmT(pn * 0.42 + 71.3, 48.0, 2, 2.0, 0.5)) * 2.0 - 1.0) * 0.30;

  // A MONOTONE RAMP is what actually buys directional coherence. Iso-contours of
  // (noise + linear) run broadly perpendicular to the ramp, and since a linear term never
  // repeats, a contour cannot close on itself — it has to cross the slab and leave.
  return fbmT(w, 48.0, 3, 2.11, 0.56) + pl.y * 0.105;
}

/**
 * maj  the main fracture
 * sec  a thinner vein running alongside it (a nearby contour of the same field)
 * cap  capillaries, far enough away to read as a separate hairline network
 * halo bleached recrystallised band flanking the main vein
 */
void veinSystem(vec2 q, vec2 ql, float width, out float maj, out float sec, out float cap, out float halo){
  const float eps = 0.010;
  float f  = vfield(q, ql);
  float gx = vfield(q + vec2(eps, 0.0), ql + vec2(eps, 0.0)) - f;
  float gy = vfield(q + vec2(0.0, eps), ql + vec2(0.0, eps)) - f;
  float g  = max(length(vec2(gx, gy)) / eps, 1e-3);   // |grad f|

  float dM = abs(f - 0.500) / g;                      // distance to the contour, in q units
  float dA = abs(f - 0.452) / g;
  float dB = abs(f - 0.618) / g;

  // PRESENCE, not just swell. Measured off refs/marble/marble-navapark-calacatta-bianco
  // and the bookmatch slabs: veins cover roughly a tenth of a Calacatta surface and the
  // clean ground dominates. A mask centred on 0.5 (which is what a raw fbm gives you)
  // puts a vein almost everywhere and the slab reads as a topographic contour map. So
  // these thresholds sit high on purpose — most of the field carries no vein at all.
  float pres  = smoothstep(0.455, 0.715, fbmT(q * 1.7 + 5.1,  48.0, 3, 2.0, 0.5));
  float pres2 = smoothstep(0.420, 0.700, fbmT(q * 3.1 + 29.0, 48.0, 2, 2.0, 0.5));

  // THICKNESS SPREAD. A real slab has two or three bold fractures carrying a fan of
  // hairlines; uniform-width filaments are the other half of the contour-map look.
  // Low frequency so a single vein stays bold along its whole length.
  float gauge = 0.35 + 2.05 * pow(fbmT(q * 0.62 + 41.0, 48.0, 2, 2.0, 0.5), 2.2);

  // Presence GATES the finished mask; it must not scale the smoothstep edges. Folding it
  // into the edges narrows the band instead of removing it, so every vein came out a
  // hairline at partial strength — visible only as a faint emboss from the normal map,
  // never as mineral in the stone. Full-width vein, then multiply by presence.
  float wMaj = width * gauge;
  maj  = (1.0 - smoothstep(wMaj * 0.26,  wMaj * 1.00,  dM)) * pres;
  sec  = (1.0 - smoothstep(width * 0.07, width * 0.30, dA)) * pres2;
  cap  = (1.0 - smoothstep(width * 0.02, width * 0.10, dB)) * pres2 * 0.8;
  halo = (1.0 - smoothstep(wMaj * 1.3, wMaj * 7.0, dM)) * (1.0 - maj) * pres;
}

// ---------------------------------------------------------------------------
// One slab's worth of stone, in slab-local uv, keyed off a per-slab hash.
// ---------------------------------------------------------------------------
void stone(vec2 luv, float h, float darkF, out vec3 albedo, out float rough, out float relief){
  vec3  ground = mix(uGroundA, uGroundB, darkF);
  vec3  vcol   = mix(uVeinA,   uVeinB,   darkF);
  float width  = mix(uVeinWA,  uVeinWB,  darkF);
  float scale  = mix(uScaleA,  uScaleB,  darkF);
  float aniso  = mix(uAnisoA,  uAnisoB,  darkF);

  // Per-slab: no quarry cuts two identical slabs. Rotation stays inside +-35 deg because
  // a real floor is cut from one block and laid in order — it is loosely directional,
  // not randomised.
  float ang = (h - 0.5) * 1.22;
  vec2  off = hash22(vec2(h * 61.7 + 1.0, h * 17.3 + 4.0)) * 26.0;
  vec2  pl  = rot(ang) * (luv - 0.5) * scale;   // slab-local, centred on zero
  vec2  p   = pl + off;                         // noise lookup, unique per slab
  vec2  q   = p  * vec2(1.0, aniso);
  vec2  ql  = pl * vec2(1.0, aniso);

  float maj, sec, cap, halo;
  veinSystem(q, ql, width, maj, sec, cap, halo);

  // Body clouding — soft grey drift. Without it the ground between the veins is paint.
  float c1    = fbmT(p * 1.30 + 3.0,  48.0, 3, 2.0, 0.55);
  float c2    = fbmT(p * 5.70 + 8.0,  48.0, 3, 2.0, 0.50);
  // Sugary calcite grain: the 20 cm read on a stone that has no other small detail.
  float grain = fbmT(p * 44.0 + 21.0, 48.0, 2, 2.0, 0.50);

  vec3 col = ground * (0.968 + c1 * 0.058 + c2 * 0.024);
  col *= 1.0 + (hash11(h * 91.0 + 0.3) - 0.5) * mix(0.048, 0.11, darkF);   // slab tint drift
  col  = mix(col, col * mix(1.055, 1.20, darkF), halo * 0.75);             // bleached halo
  col  = mix(col, vcol * (0.88 + c1 * 0.24),     min(maj * 1.35, 1.0));
  col  = mix(col, mix(col, vcol, 0.62),          min(sec * 1.30, 1.0));
  col  = mix(col, mix(col, vcol, 0.30),          cap * 0.55);
  col *= 0.994 + grain * 0.013;

  albedo = col;

  // Calcite in a vein takes a slightly duller polish than the matrix, and the sugary
  // grain scatters a little. Both small: this is a glossy stone.
  float vm = max(maj, max(sec * 0.55, cap * 0.35));
  rough = uRough + vm * 0.042 + grain * 0.022 + c2 * 0.013;

  // Veins sit a hair BELOW the polished plane — calcite is softer than the matrix, so
  // the polishing wheel dishes it. Tiny amplitude; this is a flat floor.
  relief = -vm * 0.16 - grain * 0.10 + c1 * 0.18;   // veins are STAINS, not bumps: a polished slab is flat
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
  vec2  cid = mod(floor(gp), cnt);          // mod keeps the slab layout tiling
  vec2  luv = fract(gp);
  if (single){ cid = vec2(0.0); luv = uv; }

  float h = hash12(cid + uSeed * 13.0 + 0.5);

  float darkF = uBaseDark;
  if (chequer && mod(cid.x + cid.y, 2.0) > 0.5) darkF = 1.0 - darkF;

  // ---- cabochon: a small Nero diamond let into every corner intersection ----
  vec2  vd   = abs(fract(gp + 0.5) - 0.5);
  float dman = vd.x + vd.y;                             // diamond distance to the vertex
  float cab  = cabo ? 1.0 - smoothstep(uCabSize - 0.010, uCabSize, dman) : 0.0;

  // ---- stone ----
  vec3 albedo; float rough, relief;
  stone(luv, h, darkF, albedo, rough, relief);

  if (cab > 0.001){
    vec3 ca; float cr, crel;
    // its own hash, its own scale — a 200 mm cabochon is a much smaller piece of stone
    stone(fract(gp + 0.5), hash12(cid * 7.1 + 19.0), 1.0 - darkF, ca, cr, crel);
    albedo = mix(albedo, ca, cab);
    rough  = mix(rough,  cr, cab);
    relief = mix(relief, crel, cab);
  }

  // ---- joints: sawn, chamfered arris, grey mortar in the gap ----
  vec2  gd  = min(luv, 1.0 - luv);
  float e1  = min(gd.x, gd.y) + cab;                    // slab joint, hidden under a cabochon
  float e2  = cabo ? abs(dman - uCabSize) : 1.0;        // cabochon rim
  float edge = min(e1, e2);

  float jw = uJointW;
  float ch = jw * 3.2;                                  // chamfer width
  float joint = 1.0 - smoothstep(jw * 0.55, jw, edge);
  float arris = 1.0 - smoothstep(jw, ch, edge);         // 1 at the joint, 0 out on the face

  float mortN = fbmT(uv * 384.0, 384.0, 3, 2.0, 0.5);
  vec3  mortC = vec3(0.255, 0.248, 0.236) * (0.72 + mortN * 0.62);
  albedo = mix(albedo, mortC, joint);
  rough  = mix(rough, 0.74 + mortN * 0.15, joint);

  // ---- foot traffic: polish worn off in the walking patches ----
  // Soft, tileable, low contrast. Two frequencies so it is neither a stripe nor a blob.
  float t1 = fbmT(uv * 3.0,  3.0, 3, 2.0, 0.55);
  float t2 = fbmT(uv * vec2(9.0, 6.0) + 4.0, 3.0, 3, 2.0, 0.5);
  float traffic = sat(smoothstep(0.40, 0.86, t1 * 0.72 + t2 * 0.28)) * uWear;
  rough   += traffic * 0.115;
  albedo  *= 1.0 - traffic * 0.028;

  // Polish also lifts at the sawn edge — the wheel cannot reach into the arris.
  rough += arris * 0.055;

  // ---- scratch families: sparse, sheared so they tile, roughness only ----
  vec2 sa = vec2(uv.x * 28.0 + uv.y * 84.0, uv.y * 224.0);
  vec2 sb = vec2(uv.x * 196.0, uv.y * 28.0 - uv.x * 56.0);
  float scr = smoothstep(0.905, 0.998, pat(fbmT(sa, 28.0, 2, 2.0, 0.5), 3.4))
            + smoothstep(0.925, 0.999, pat(fbmT(sb, 28.0, 2, 2.0, 0.5), 3.4)) * 0.7;
  rough += scr * (0.10 + traffic * 0.22);

  // ---- dust: banked against the joint, where a mop never reaches ----
  float dustN = smoothstep(0.30, 0.85, fbmT(uv * 72.0 + 9.0, 72.0, 3, 2.0, 0.5));
  float dust  = arris * dustN * uDust;
  albedo = mix(albedo, vec3(0.40, 0.385, 0.355), dust * 0.42);
  rough  = mix(rough, 0.82, dust * 0.62);

  // ---- height: face, chamfer ramp, mortar floor ----
  float prof  = smoothstep(jw * 0.85, ch, edge);
  float faceH = 0.72 + relief * 0.012 - dust * 0.004;
  float mortH = 0.655 + mortN * 0.010;

  s.albedo    = sat3(albedo);
  s.roughness = clamp(rough, 0.055, 1.0);
  s.metalness = 0.0;
  s.ao        = 1.0 - joint * 0.55 - arris * 0.16 - dust * 0.18;
  s.height    = mix(mortH, faceH, prof);
}
`;

// Vein features must cross a slab, not tile inside it — a slab is cut from a block a
// couple of metres across, so you see two or three vein systems on it, not twenty.
const CARRARA = {
  groundA: [0.905, 0.897, 0.876],   // #E7E5DF
  veinA:   [0.405, 0.396, 0.380],   // #676460 — Calacatta vein cores go darker than they look at a distance
  veinWA:  0.082,
  scaleA:  3.0,
  anisoA:  2.15,                    // veins run broadly one way, tributaries fork shallow
};

// Nero Marquina is not a speckled granite: it is near-black with a few BOLD, angular,
// high-contrast calcite fractures. Wider veins, lower feature count, less anisotropy.
const NERO = {
  groundB: [0.070, 0.070, 0.078],   // #121214
  veinB:   [0.880, 0.868, 0.835],   // #E0DDD5
  veinWB:  0.105,
  scaleB:  2.1,
  anisoB:  1.20,
};

function build(preset) {
  const key = `marble:${JSON.stringify(preset)}`;
  return baker().standard({
    key,
    size: preset.size,
    surface: MARBLE_SURFACE,
    heightScale: preset.heightScale,
    normalStrength: 1.0,
    repeat: preset.repeat,
    anisotropy: 16,
    uniforms: {
      uSlabsX: preset.slabsX, uSlabsY: preset.slabsY,
      uPattern: preset.pattern, uBaseDark: preset.baseDark,
      uJointW: preset.jointW, uCabSize: preset.cabSize,
      uRough: preset.rough, uWear: preset.wear, uDust: preset.dust,
      uSeed: preset.seed,
      uGroundA: new THREE.Vector3(...preset.groundA),
      uVeinA: new THREE.Vector3(...preset.veinA),
      uVeinWA: preset.veinWA, uScaleA: preset.scaleA, uAnisoA: preset.anisoA,
      uGroundB: new THREE.Vector3(...preset.groundB),
      uVeinB: new THREE.Vector3(...preset.veinB),
      uVeinWB: preset.veinWB, uScaleB: preset.scaleB, uAnisoB: preset.anisoB,
    },
  }, {
    // A thin sealer lobe over the stone's own. Light — at clearcoat 0.85 the stone
    // disappears under the reflection of the room.
    clearcoat: preset.clearcoat,
    clearcoatRoughness: preset.clearcoatRoughness,
    envMapIntensity: 1.0,
    normalScale: new THREE.Vector2(preset.normalScale, preset.normalScale),
  }, THREE.MeshPhysicalMaterial);
}

const BASE = {
  slabsX: 5, slabsY: 5,
  pattern: 0, baseDark: 0,
  jointW: 0.0055, cabSize: 0.105,
  rough: 0.135, wear: 0.55, dust: 0.6,
  seed: 1.0,
  size: 2048, repeat: [1, 1],
  heightScale: 0.030, normalScale: 0.22,
  clearcoat: 0.30, clearcoatRoughness: 0.10,
  ...CARRARA, ...NERO,
};

/** The main hall floor: Carrara field with a Nero cabochon at every corner. */
export function marbleFloor(opts = {}) {
  return build({ ...BASE, ...opts });
}

/** Ballroom / vestibule chequer — Carrara against Nero Marquina, no cabochons. */
export function marbleChequer(opts = {}) {
  return build({ ...BASE, pattern: 2, slabsX: 6, slabsY: 6, jointW: 0.0042, wear: 0.45, ...opts });
}

/** A single slab: fireplace surround, table top, column drum, dado panel. */
export function marbleSlab(opts = {}) {
  return build({
    ...BASE, pattern: 3, slabsX: 1, slabsY: 1, jointW: 0.0012,
    scaleA: 1.7, veinWA: 0.060, wear: 0.14, dust: 0.28, size: 1024,
    heightScale: 0.018, ...opts,
  });
}

/** Nero Marquina, running bond — stair treads, skirting bands, inlay strips. */
export function marbleDark(opts = {}) {
  return build({
    ...BASE, pattern: 1, baseDark: 1, slabsX: 4, slabsY: 8,
    jointW: 0.0040, rough: 0.145, wear: 0.5, dust: 0.7, size: 1024,
    heightScale: 0.026, ...opts,
  });
}

/** A stair tread: one wide dark slab, heavy wear along the nosing. */
export function marbleTread(opts = {}) {
  return build({
    ...BASE, pattern: 3, baseDark: 1, slabsX: 1, slabsY: 1, jointW: 0.0012,
    scaleB: 1.5, rough: 0.165, wear: 0.85, dust: 0.5, size: 1024,
    heightScale: 0.018, ...opts,
  });
}
