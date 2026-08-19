import * as THREE from 'three';
import { baker } from '../baker.js';

/**
 * Gilt bronze, lead crystal, foxed mirror glass, patinated bronze — the estate's polished
 * metal-and-glass palette: chandeliers, sconces, door furniture, mirror frames.
 *
 * Bar: `refs/_sheets/hitman.png` (the Paris chandeliers and gilt mirror frames).
 *
 * This is a different brief from `src/gadgets/gadgetmat.js`'s `brass()`, which is read for
 * technique (cast surface, lathe-turned bands, polish on the high points, grime in the
 * hollows) but not imported — that file is a *worn tool* brass and belongs to the gadget
 * system. This one is *cast, chased and gilded architectural ornament*: finer, more
 * ornate, worn by dusting and polishing rather than by use.
 *
 * NB: do NOT name anything `cast` — it is a GLSL reserved word, and a variable named that
 * in gadgetmat.js's brass shader once failed to compile silently and baked every brass part
 * on the oil lobber as a pure black blob. The baker validates against an all-black bake now,
 * but the word is still banned project-wide.
 */

// Shared narrow-bell fix: fbmT sums octaves, so its output is a bell curve tight around 0.5
// and a raw smoothstep threshold above ~0.85 or so will never fire. pat() re-centres the
// distribution around its own midpoint before the threshold, so a gate at 0.9 means what it
// looks like it means. See BUILD_GUIDE.md and every surface file in this directory.
const PAT_FN = /* glsl */ `
float pat(float v, float k){ return clamp((v - 0.5) * k + 0.5, 0.0, 1.0); }
`;

// ---------------------------------------------------------------------------
// 1. Gilt bronze — cast, chased, water-gilded. Chandeliers, sconces, door furniture,
//    mirror frames, mouldings.
// ---------------------------------------------------------------------------
const GILT_BRONZE_SURFACE = /* glsl */ `
uniform vec3  uGold;
uniform vec3  uBole;
uniform vec3  uGrimeCol;
uniform vec3  uDustCol;
uniform float uOrnScale;
uniform float uOrnAspect;   // corrects the ornament grid for how UV maps to THIS mesh's
                             // actual physical proportions — see giltBronze() below
uniform float uLeafScale;
uniform float uWear;
uniform float uDust;
uniform float uGrime;
uniform float uDetail;      // ABLATION HANDLE. 0 zeroes every authored detail term (bosses,
                            // chased ground, chisel marks, pitting, leaf joints, bole) and
                            // leaves plain burnished gold, so a critic can ask "is any of
                            // this reading, or is it noise?" without editing the shader.
uniform float uSeed;

${PAT_FN}

void surface(in vec2 uv, inout Surf s){
  // uv is 0..1 across whatever the mesh's UV mapping covers, regardless of the mesh's real
  // physical size — a box-projected UV on a tall thin frame bar spans the same 0..1 range
  // across its 5.5 cm width as it does across its 74 cm height, and a LatheGeometry's v
  // spans a 1 m profile while its u spans a 30 cm circumference. Multiplying both axes by
  // one scalar therefore squashes the ornament into long streaks on anything that isn't
  // roughly square, which is exactly what read as wood grain on the mirror frame the first
  // time this baked — and, unnoticed until now, is what stretched the torchere's ornament
  // into vertical smears, because that caller was left at aspect 1.0. uOrnAspect corrects
  // the v-axis frequency for the mesh's real aspect ratio so a boss stays a boss instead of
  // a stripe; the caller sets it from the object's known dimensions, since the shader has
  // no way to know them itself.
  vec2 p = vec2(uv.x, uv.y * uOrnAspect) * uOrnScale;

  // ---- CAST GROUND ---------------------------------------------------------------
  // Sand-cast bronze at two scales. The previous single pit field ran at 260 cycles across
  // a 512 bake — under two texels per cycle — so it mipped to a flat tint before it ever
  // reached a screen pixel, which is a large part of why the gilt read as smooth wax. The
  // coarse cluster below is what actually survives to the render; the fine speckle rides
  // inside it and does the close-up work.
  float sand    = fbmT(uv * 90.0 + uSeed, 96.0, 4, 2.1, 0.55);
  float pitBig  = smoothstep(0.54, 0.84, pat(fbmT(uv * 34.0 + uSeed * 3.1, 36.0, 3, 2.0, 0.5), 2.4));
  float pitFine = smoothstep(0.62, 0.92, pat(fbmT(uv * 150.0 + uSeed * 5.7, 160.0, 3, 2.0, 0.5), 2.6));
  float pits    = clamp(pitBig * 0.80 + pitFine * 0.55, 0.0, 1.0) * uDetail;

  // ---- THE ORNAMENT --------------------------------------------------------------
  // 🚨 THE OLD ORNAMENT FIELD WAS AN fbm CLOUD, AND A CLOUD HAS NO EDGES. It was four
  // evaluations of a domain-warped fbm, thresholded for a "boss" mask and finite-differenced
  // for a "rim". Dumping the baked tile off the render target shows what that produces:
  // soft smoke, no boss outline anywhere, and — because the rim was a gradient magnitude of
  // a smooth field, gated through a rare tail — essentially no bole at all. That is the
  // whole of "gilt reads as smooth yellow wax".
  //
  // A voronoi cell field gives the two things the cloud could not: a boss with a DEFINED
  // OUTLINE, and a rim that is a GEOMETRIC BAND at a known distance from the cell seed
  // rather than a guess derived from a derivative. Domain-warped so the cells do not read
  // as a lattice, and per-cell radius jitter so the bosses are not all one size. It is also
  // cheaper than what it replaces — one voronoi plus one warp against twelve fbm octaves.
  //
  // ⚠️ THE BAND OFFSET IS NOT COSMETIC — WITHOUT IT THIS TILES VISIBLY AND READS AS WOOD.
  // voronoiT and fbmT both take ONE period and apply it to BOTH axes, but this tile is
  // deliberately anisotropic: the mirror's vertical frame bars run p from 0..2.4 in u and
  // 0..32 in v, so a period of 2.4 repeats the same block of cells thirteen times down the
  // bar. That is a hard vertical stripe pattern, and it is exactly the "the frame reads as
  // wood grain" defect brass.js's header describes — the previous fix corrected the cell
  // SHAPE and left the REPEAT, so the bar went from smeared grain to striped grain.
  // Offsetting each band of uOrnScale rows by its own hashed shift along u decorrelates the
  // repeat while keeping the pattern exactly periodic in u, which is what a LatheGeometry
  // needs (its u wraps around the circumference and a seam there would be visible).
  float band = floor(p.y / uOrnScale);
  vec2  pb = p + vec2(hash11(band * 3.7 + uSeed) * uOrnScale, 0.0);
  vec2  w  = warp(pb, uOrnScale, 0.24, 2);
  vec3  vr = voronoiT(w, uOrnScale);
  float cellR = 0.30 + hash11(vr.z * 31.0 + uSeed) * 0.17;
  float boss  = 1.0 - smoothstep(cellR * 0.55, cellR * 1.28, vr.x);
  // the narrow band ON the boss edge: where a duster, a sleeve and a burnisher all reach,
  // and the only place water gilding ever wears through to its bole
  float rimB  = smoothstep(cellR * 0.58, cellR * 1.00, vr.x)
              * (1.0 - smoothstep(cellR * 1.00, cellR * 1.55, vr.x));
  // the chased ground: the tooled trench where two bosses meet
  float ground = (1.0 - smoothstep(0.0, 0.075, vr.y - vr.x)) * uDetail;

  float orn = mix(0.5, boss, uDetail);

  // Bole coverage. The old gate was smoothstep(0.60, 0.92) on a re-centred fbm — the rare
  // tail of a narrow bell, i.e. almost never — ON TOP of a rim term that was itself weak.
  // The rim is now real, so the patch field only has to break the ring up rather than carry
  // the whole term, and it is widened accordingly.
  // ⚠️ AND rimB IS RENORMALISED, WHICH IS NOT A TUNING CHOICE. The product of two adjacent
  // smoothsteps peaks near 0.5, never 1 — so a band built this way silently halves whatever
  // rides on it. Bole was already a small term; through an unnormalised band it was landing
  // near 0.2 of a mix at its strongest, which is a warm hint rather than clay showing
  // through. Same narrow-bell family as the pat() trap this file already carries.
  float patchy = smoothstep(0.32, 0.84, pat(fbmT(p * 1.7 + uSeed * 7.0, uOrnScale, 3, 2.0, 0.5), 2.0));
  float rim  = clamp(rimB * 2.1, 0.0, 1.0) * (0.30 + patchy * 0.70) * uDetail;

  // Chased chisel marks: short parallel hand-tooled strokes on the raised ornament. The
  // stroke direction is hashed PER CELL — a chaser turns the work between bosses — and the
  // direction change is hidden in the ground trench, which is where a real one would be.
  float chAng  = 0.4 + hash11(vr.z * 7.3) * 1.7;
  vec2  cp     = rot(chAng) * (pb * vec2(1.0, 6.0));
  float ridge  = 0.5 + 0.5 * sin(cp.x * TAU * 1.6);
  float dash   = smoothstep(0.28, 0.72, pat(fbmT(vec2(cp.y * 0.35, cp.x * 0.12) + uSeed * 2.0, 24.0, 3, 2.0, 0.5), 3.0));
  float chasing = ridge * dash * boss * uDetail;

  // Leaf joints: gold leaf comes in ~85 mm squares. A faint, low-contrast grid with the
  // occasional darker overlap line where one leaf laps the next — the detail that keeps
  // gilding from reading as a flat gold fill.
  vec2 lc    = uv * uLeafScale + 5.0;
  vec2 lid   = floor(lc);
  vec2 lluv  = fract(lc);
  vec2 ledge = min(lluv, 1.0 - lluv);
  float leafSeam    = (1.0 - smoothstep(0.0, 0.030, min(ledge.x, ledge.y))) * uDetail;
  float leafOverlap = leafSeam * step(0.72, hash12(lid + 4.7));
  float leafTone    = (hash12(lid + 1.3) - 0.5) * 0.13 * uDetail;

  vec3 gold = uGold * (1.0 + leafTone) * (0.86 + sand * 0.24 + chasing * 0.16);
  gold = mix(gold, gold * 0.78, leafOverlap);
  gold *= 1.0 - pits * 0.26;
  gold *= 1.0 - ground * 0.20;              // the tooled trench sits in its own shade

  // Red bole showing through where the leaf has worn thinnest — right at a rim, patchy,
  // never a clean ring. This is the one detail that separates gilding from gold paint.
  float boleAmt = rim * uWear;
  vec3 col = mix(gold, uBole * (0.85 + sand * 0.35), boleAmt);

  // Dust settles on the flat TOPS of the ornament, not on the rims. This is deliberately
  // the inverse of the usual "high points are bright" convention: a neglected house dusts
  // nothing, and only the touched rims stay bright from handling.
  float plateau  = boss * (1.0 - rimB) * uDetail;
  float dustAmt  = plateau * uDust;
  col = mix(col, uDustCol, dustAmt * 0.30);

  // Grime pools in the recesses and in the chased trench.
  //
  // ⚠️ THE OLD "gravity = 1.0 - smoothstep(0.0, 0.4, uv.y)" TERM IS DELETED, NOT RETUNED.
  // This is a BAKED tile: baker().standard() evaluates surface() once into a 512 square that
  // is then repeated over every mesh that asks for this material, so uv.y is not world-down
  // — it points along the profile of a lathe, across the face of a horizontal frame rail,
  // and radially on a sphere, all at the same strength. That is the exact defect
  // robot-owner-1 traced in SHELL_SURFACE on 2026-08-05. Its measured contribution here was
  // at most 0.18 x 0.5 x 0.55 = 0.05 of a mix toward grime, so nothing visible is lost by
  // removing it; what is removed is a term that pointed a different way on every mesh.
  // A real gravity term has to come from world space at render time, which is a separate
  // job from this one.
  float hollow   = (1.0 - boss) * mix(0.0, 1.0, uDetail) + ground * 0.55;
  float grimeAmt = clamp(hollow * (0.45 + sand * 0.55), 0.0, 1.0) * uGrime;
  col = mix(col, uGrimeCol, grimeAmt * 0.55);

  s.albedo = col;

  // metalness 1.0, roughness 0.20 on burnished high points rising to 0.52 in the hollows.
  float rough = mix(0.52, 0.20, orn);
  rough = mix(rough, 0.68, boleAmt);   // bole is a matte clay ground, not polished metal
  rough += grimeAmt * 0.20 + dustAmt * 0.26 + pits * 0.16 - chasing * 0.07 + ground * 0.12;
  s.roughness = clamp(rough, 0.05, 1.0);

  // ⚠️ BOLE HAS TO STOP BEING A METAL, OR IT CANNOT BE SEEN AT ALL. The previous floor of
  // 0.12 was reached only at boleAmt = 1, so at a realistic 0.6-0.7 the worn rim was still
  // 35-40% metallic — and a metal's base colour tints its REFLECTION rather than showing as
  // pigment, so a dark red albedo on a partly-metallic texel renders as a dark patch, not as
  // red clay. That is why bole was invisible in the render while plainly present in the bake.
  // Exposed bole is dry gesso and clay: dielectric, diffuse, and the reason it is worth
  // drawing at all is that it is the one WARM NON-METALLIC note on an otherwise all-metal
  // object. Driven through a steepened response so it commits rather than fading in.
  float boleD = smoothstep(0.10, 0.55, boleAmt);
  s.metalness = clamp(mix(1.0, 0.03, boleD) * (1.0 - dustAmt * 0.12), 0.0, 1.0);
  s.ao = clamp(1.0 - hollow * 0.32 - grimeAmt * 0.20, 0.0, 1.0);
  // Boss relief deliberately modest against a deep ground trench: at 0.34 the bosses read as
  // dents in melted wax rather than as cast ornament, because a broad smooth dome is exactly
  // what a lathe profile already gives. The information is in the TRENCH between bosses and
  // in the chisel marks on top of them, not in the dome.
  s.height = 0.5 + (boss * 0.20 + chasing * 0.14 - ground * 0.30 - pits * 0.16 - leafSeam * 0.03) * uDetail;
}
`;

export function giltBronze(opts = {}) {
  const o = {
    gold: [0.725, 0.545, 0.235],       // #B98B3C, burnished high points
    // #9D4A2D. Lifted from #7A3B22: bole is Armenian clay under a thin gesso, and once it is
    // correctly dielectric (see s.metalness) it is lit by diffuse only, so at the old value
    // it landed darker than the shaded gold beside it and read as dirt rather than as clay.
    bole: [0.616, 0.290, 0.176],
    grimeCol: [0.10, 0.085, 0.06],
    dustCol: [0.55, 0.52, 0.46],
    ornScale: 6.0,
    ornAspect: 1.0,   // set this from the mesh's real height/width when a piece isn't
                      // roughly square in UV space — see the shader comment above
    leafScale: 10.0,
    wear: 0.65,
    dust: 0.45,
    grime: 0.5,
    detail: 1.0,      // 0 = plain burnished gold, no authored detail at all (ablation)
    seed: 1.0,
    size: 512,
    ...opts,
  };
  return baker().standard({
    key: `brass-gilt:${JSON.stringify(o)}`,
    size: o.size,
    surface: GILT_BRONZE_SURFACE,
    // 0.035 with a 0.7 normalScale put the ornament's relief below the threshold at which
    // a directional key can find it — the bosses existed in the height channel and cast no
    // visible light change. Raised together because they multiply.
    heightScale: 0.055,
    normalStrength: 1.0,
    anisotropy: 8,
    uniforms: {
      uGold: new THREE.Vector3(...o.gold),
      uBole: new THREE.Vector3(...o.bole),
      uGrimeCol: new THREE.Vector3(...o.grimeCol),
      uDustCol: new THREE.Vector3(...o.dustCol),
      uOrnScale: o.ornScale,
      uOrnAspect: o.ornAspect,
      uLeafScale: o.leafScale,
      uWear: o.wear,
      uDust: o.dust,
      uGrime: o.grime,
      uDetail: o.detail,
      uSeed: o.seed,
    },
  }, { envMapIntensity: 1.3, normalScale: new THREE.Vector2(0.95, 0.95) });
}

// ---------------------------------------------------------------------------
// 2. Lead crystal — chandelier drops, cut glass. Transmission + high IOR + a small
//    iridescence term for the fire that makes crystal read as crystal rather than plastic.
// ---------------------------------------------------------------------------
const LEAD_CRYSTAL_SURFACE = /* glsl */ `
uniform vec3  uTint;
uniform float uFacetScale;
uniform float uSeed;

${PAT_FN}

void surface(in vec2 uv, inout Surf s){
  // Cut facets: a coarse voronoi field. Near F1==F2 is a facet boundary — the cut line
  // where two polished faces meet and catch a thin bright or dark edge.
  vec3 vr = voronoiT(uv * uFacetScale, uFacetScale);
  float facetEdge = 1.0 - smoothstep(0.0, 0.045, vr.y - vr.x);
  float sparkle = smoothstep(0.90, 0.995, pat(fbmT(uv * 420.0 + uSeed, 420.0, 3, 2.0, 0.5), 3.2));
  float micro = fbmT(uv * 60.0 + uSeed * 4.0, 64.0, 3, 2.0, 0.5);

  s.albedo    = uTint;
  s.roughness = clamp(0.032 + facetEdge * 0.05 + micro * 0.015 - sparkle * 0.018, 0.02, 0.13);
  s.metalness = 0.0;
  s.ao        = 1.0;
  s.height    = 0.5 - facetEdge * 0.14 + micro * 0.02;
}
`;

export function leadCrystal(opts = {}) {
  const o = {
    tint: [1.0, 0.975, 0.93],   // real lead crystal is faintly warm, not neutral
    facetScale: 5.0,
    ior: 1.62,                  // 1.55-1.7 for lead crystal, higher than window glass
    thickness: 0.06,
    seed: 2.0,
    size: 512,
    ...opts,
  };
  return baker().standard({
    key: `brass-crystal:${JSON.stringify(o)}`,
    size: o.size,
    surface: LEAD_CRYSTAL_SURFACE,
    heightScale: 0.018,
    normalStrength: 0.6,
    anisotropy: 8,
    uniforms: { uTint: new THREE.Vector3(...o.tint), uFacetScale: o.facetScale, uSeed: o.seed },
  }, {
    metalness: 0,
    transmission: 1.0,
    ior: o.ior,
    thickness: o.thickness,
    clearcoat: 1.0,
    clearcoatRoughness: 0.03,
    iridescence: 0.35,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [100, 380],
    envMapIntensity: 2.4,
    normalScale: new THREE.Vector2(0.4, 0.4),
  }, THREE.MeshPhysicalMaterial);
}

// ---------------------------------------------------------------------------
// 3. Foxed mirror — an old mirror is not a clean reflector. High-reflectivity metal,
//    modulated by a foxing mask that eats into the reflection: dark speckled patches
//    where the silvering has failed, a warm tint, edge darkening.
// ---------------------------------------------------------------------------
/*
 * 🚨 "READS AS DIRTY WHITE PAINT RATHER THAN DEGRADED SILVERING WITH A REFLECTION EATEN INTO
 * IT" IS TWO SEPARATE FAULTS, AND ONLY ONE OF THEM LIVES IN THIS FILE.
 *
 * (a) THERE WAS NO REFLECTION TO EAT INTO. Baked into a MeshStandardMaterial with no envMap
 *     of its own, a flat plane's only specular source is `scene.environment` — the studio
 *     PMREM, which is a smooth grey box. One flat plane sampling one smooth probe in one
 *     direction returns ONE VALUE, so the glass rendered as an even wash no matter what this
 *     shader wrote. Measured on the r1 capture: the whole glass panel spanned luminance
 *     54.2 to 74.8, a range of twenty values across the entire mirror. That half is fixed in
 *     `views/mat-brass.js`, which now gives the glass a real cube probe of the actual scene.
 *
 * (b) THE SILVERING ITSELF HAD NO RANGE. Clean silver sat at albedo 0.82 / roughness 0.10 and
 *     the foxing lerped smoothly toward 0.62 roughness — no hard edge anywhere, and a 9% soft
 *     border vignette on every side that read as a dirty painted frame. Old mirror glass is
 *     the opposite: a clean, almost perfect specular with DEAD PATCHES punched through it,
 *     and the boundary between the two is sharp because it is a chemical front.
 */
const FOXED_MIRROR_SURFACE = /* glsl */ `
uniform vec3  uSilver;
uniform vec3  uFoxCol;
uniform float uFoxAmt;
uniform float uDetail;      // ABLATION HANDLE — 0 leaves clean undegraded silvering
uniform float uSeed;

${PAT_FN}

void surface(in vec2 uv, inout Surf s){
  // The corrosion front, thresholded HARD. Foxing spreads as islands under the silvering
  // with a visible boundary; a smoothstep wide enough to be a gradient is a fog, and a fog
  // is what made this read as paint.
  // ⚠️ COVERAGE IS THE WHOLE ARGUMENT HERE, AND THE FIRST CUT GOT IT BADLY WRONG. Gated at
  // the median of a re-centred field, "foxed" took HALF the pane and the plate read as
  // camouflage — which destroys the very reflection the defect is supposed to be eating into.
  // An antique pier glass is mostly still a mirror: scattered spots and small clusters, denser
  // toward the rebate, over clean silvering. Gating well above the midpoint and at nearly
  // three times the frequency puts coverage back in the teens and makes the spots SPOTS.
  float ff     = pat(fbmT(uv * 14.0 + uSeed, 14.0, 4, 2.05, 0.55), 2.0);
  float island = smoothstep(0.635, 0.685, ff);
  // sputter: the front is not a clean curve — fine speckle straddles it and sprays ahead
  float speck  = smoothstep(0.55, 0.86, pat(fbmT(uv * 130.0 + uSeed * 5.0, 132.0, 3, 2.0, 0.5), 2.8));
  float halo   = smoothstep(0.575, 0.635, ff) * (1.0 - smoothstep(0.635, 0.72, ff));
  float fox    = clamp(island * 0.92 + speck * halo * 1.4 + speck * island * 0.3, 0.0, 1.0)
               * uFoxAmt * uDetail;

  // Silvering fails first under the frame rebate where damp gets in — but as an IRREGULAR
  // creeping margin, not the soft 9% vignette on all four sides that was there before, which
  // is what put a painted-looking border round the whole plate.
  vec2  d = min(uv, 1.0 - uv);
  float rebate = 1.0 - smoothstep(0.0, 0.022 + 0.030 * fbmT(uv * 9.0 + 21.0, 9.0, 2, 2.0, 0.5), min(d.x, d.y));
  fox = clamp(fox + rebate * 0.8 * uDetail, 0.0, 1.0);

  // Crazing in the varnish over the back: fine dark hairlines across clean and foxed alike.
  vec3  cz    = voronoiT(uv * 26.0, 26.0);
  float craze = (1.0 - smoothstep(0.0, 0.035, cz.y - cz.x)) * 0.5 * uDetail;

  vec3 col = mix(uSilver, uFoxCol, fox);
  col *= 1.0 - craze * 0.35;

  s.albedo    = col;
  // 0.028 is a real mirror; the dead patches go matte. The jump is deliberately steep.
  s.roughness = clamp(mix(0.028, 0.72, smoothstep(0.05, 0.55, fox)) + craze * 0.20, 0.02, 0.85);
  s.metalness = mix(1.0, 0.10, smoothstep(0.05, 0.6, fox));
  s.ao        = 1.0 - fox * 0.22;
  s.height    = 0.5 - fox * 0.06 - craze * 0.05;
}
`;

export function foxedMirror(opts = {}) {
  const o = {
    silver: [0.93, 0.915, 0.865],   // warm-tinted, and near-total: silver reflects ~95%
    fox: [0.085, 0.075, 0.062],
    foxAmt: 0.55,
    detail: 1.0,
    seed: 3.0,
    size: 512,
    ...opts,
  };
  return baker().standard({
    key: `brass-mirror:${JSON.stringify(o)}`,
    size: o.size,
    surface: FOXED_MIRROR_SURFACE,
    heightScale: 0.012,
    normalStrength: 0.7,
    anisotropy: 8,
    uniforms: {
      uSilver: new THREE.Vector3(...o.silver),
      uFoxCol: new THREE.Vector3(...o.fox),
      uFoxAmt: o.foxAmt,
      uDetail: o.detail,
      uSeed: o.seed,
    },
  }, {
    // The silvering is BEHIND glass, and the glass has its own front surface. A clearcoat
    // lobe over the top is what stops the dead patches reading as bare painted board: even
    // where the silver has gone, the pane still returns a clean sharp specular.
    clearcoat: 1.0,
    clearcoatRoughness: 0.035,
    envMapIntensity: 1.6,
    normalScale: new THREE.Vector2(0.5, 0.5),
  }, THREE.MeshPhysicalMaterial);
}

// ---------------------------------------------------------------------------
// 4. Patinated bronze — ungilded bronze gone green-black in the recesses. Door furniture,
//    hinges, hardware. Verdigris collects where water sits and hands never reach; the
//    touched high points stay polished bronze underneath it.
// ---------------------------------------------------------------------------
/*
 * 🚨 WHY THIS ONE READ AS "A FEATURELESS SLAB — A MISSING TEXTURE": ITS PATTERN WAS AN ORDER
 * OF MAGNITUDE LARGER THAN THE OBJECTS IT DRESSES.
 *
 * The tile's structural fields ran at 3.2 and 9.0 cycles across the whole 0..1 tile. A baked
 * tile maps 0..1 across ONE MESH, and the meshes this material is on are an escutcheon plate
 * 7.5 cm tall, a rose 6.8 cm across, a lever 19 cm long and a hinge leaf 19 cm — so "3.2
 * cycles" meant roughly two blobs over the whole plate and ONE over the rose. Every piece of
 * hardware therefore rendered as a single flat wash of whatever value its one blob happened
 * to hold, which is exactly what a missing texture looks like. Dumping the baked tile off the
 * render target confirms it: a soft two-colour smear with a near-flat normal map.
 *
 * Everything structural below is raised to a frequency that puts several features on a 7 cm
 * plate, and the verdigris is given a HARD crust edge with a powdery margin instead of a
 * smooth lerp — corrosion has an edge, a lerp does not.
 */
const PATINATED_BRONZE_SURFACE = /* glsl */ `
uniform vec3  uBronze;
uniform vec3  uVerdigris;
uniform float uWear;
uniform float uPatina;
uniform float uDetail;      // ABLATION HANDLE — 0 leaves plain cast bronze, no patina at all
uniform float uSeed;

${PAT_FN}

void surface(in vec2 uv, inout Surf s){
  // cast texture: coarse orange-peel from the sand mould, plus fine porosity
  float sand  = fbmT(uv * 46.0 + uSeed, 48.0, 4, 2.1, 0.55);
  float grit  = fbmT(uv * 190.0 + uSeed * 5.0, 192.0, 3, 2.0, 0.5);
  float poro  = smoothstep(0.66, 0.93, pat(fbmT(uv * 78.0 + uSeed * 2.7, 80.0, 3, 2.0, 0.5), 2.6)) * uDetail;

  // the cast form's own broad modelling — raised where a burnisher and a hand reach
  float f    = fbmT(uv * 11.0 + uSeed * 3.0, 12.0, 3, 2.0, 0.5);
  float high = smoothstep(0.42, 0.70, pat(f, 1.7));

  // VERDIGRIS AS A CRUST, NOT A GRADIENT. A corrosion front has an edge you can see: a
  // hard-ish boundary, a pale powdery margin just inside it, and a denser core. Built from
  // one field thresholded three times so the three bands are guaranteed to be concentric
  // instead of three independent noises that happen to overlap.
  float cf    = pat(fbmT(uv * 7.5 + uSeed * 2.0, 8.0, 4, 2.05, 0.55), 2.1);
  float crust = smoothstep(0.44, 0.56, cf);
  float bloom = smoothstep(0.40, 0.50, cf) * (1.0 - smoothstep(0.50, 0.62, cf));  // powdery rim
  float core  = smoothstep(0.60, 0.80, cf);

  // run-off: verdigris bleeds downhill from the crust in fine hard-topped streaks
  float streak = smoothstep(0.52, 0.86, pat(fbmT(vec2(uv.x * 34.0, uv.y * 5.0) + uSeed * 2.0, 36.0, 3, 2.0, 0.5), 2.8));

  float verd = clamp(crust * 0.85 + streak * 0.35 * crust + (1.0 - high) * 0.30, 0.0, 1.0)
             * uPatina * uDetail;

  // Touched high points polish back through the patina to bare bronze — a real handle is
  // bright exactly where a palm lands and green everywhere else.
  float touch = high * uWear;
  verd *= 1.0 - touch * 0.75;

  vec3 bare = uBronze * (0.80 + sand * 0.28 + grit * 0.10 + high * 0.22);
  bare *= 1.0 - poro * 0.30;
  vec3 green = uVerdigris * (0.78 + sand * 0.34);
  green = mix(green, green * 1.9 + vec3(0.05, 0.07, 0.05), bloom * 0.7);   // pale powdery margin
  green = mix(green, green * 0.62, core * 0.6);                            // dense dark core

  vec3 col = mix(bare, green, verd);

  s.albedo    = col;
  s.roughness = clamp(mix(0.58, 0.17, high * uWear) + verd * 0.42 + poro * 0.22 + grit * 0.08, 0.05, 1.0);
  s.metalness = mix(1.0, 0.22, verd);
  s.ao        = clamp(1.0 - (1.0 - high) * 0.22 - verd * 0.18, 0.0, 1.0);
  s.height    = 0.5 + high * 0.22 + (verd * 0.16 + bloom * 0.10 - poro * 0.30 + sand * 0.10) * uDetail;
}
`;

export function patinatedBronze(opts = {}) {
  const o = {
    bronze: [0.42, 0.30, 0.16],
    verdigris: [0.20, 0.34, 0.28],
    wear: 0.6,
    patina: 0.6,
    detail: 1.0,
    seed: 4.0,
    size: 512,
    ...opts,
  };
  return baker().standard({
    key: `brass-patina:${JSON.stringify(o)}`,
    size: o.size,
    surface: PATINATED_BRONZE_SURFACE,
    heightScale: 0.045,
    normalStrength: 0.9,
    anisotropy: 8,
    uniforms: {
      uBronze: new THREE.Vector3(...o.bronze),
      uVerdigris: new THREE.Vector3(...o.verdigris),
      uWear: o.wear,
      uPatina: o.patina,
      uDetail: o.detail,
      uSeed: o.seed,
    },
  }, { envMapIntensity: 1.2, normalScale: new THREE.Vector2(0.85, 0.85) });
}
