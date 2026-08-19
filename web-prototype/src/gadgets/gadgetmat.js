import * as THREE from 'three';
import { baker } from '../materials/baker.js';

/**
 * Materials for the gadget limbs.
 *
 * These live here rather than in materials/surfaces/brass.js on purpose: the gadgets need
 * a specific *worn tool* character — cast brass with polished high points and grime in the
 * recesses, hot steel, scuffed gun-body chrome — which is a different brief from the
 * architectural gilt bronze on a chandelier. Keeping them separate also keeps this file
 * out of the materials agent's ownership.
 *
 * Read off the Dev Art gadget shots: the brass is warm and quite yellow, genuinely
 * reflective but not mirror; the chrome bodies are cooler and satin; the hot barrel of the
 * nail gun glows from within rather than being painted orange.
 */

// ---------------------------------------------------------------------------
// Cast brass / gilt bronze. Mould texture in the recesses, burnished on the ridges.
// ---------------------------------------------------------------------------
const BRASS_SURFACE = /* glsl */ `
uniform vec3  uTint;
uniform float uPolish;
uniform float uGrime;

void surface(in vec2 uv, inout Surf s){
  // Sand-cast surface: fine pitting at two scales. Real cast brass is never smooth except
  // where the polishing wheel has touched it.
  // NB: do NOT call this "cast" — that is a GLSL reserved word, and naming it that made
  // this whole shader fail to compile, which silently baked an all-zero texture set and
  // rendered every brass part as a pure black blob.
  float sand  = fbmT(uv * 96.0, 128.0, 4, 2.1, 0.55);
  float pits  = smoothstep(0.62, 0.90, fbmT(uv * 210.0 + 7.0, 256.0, 3, 2.0, 0.5));
  // Turned/burnished bands — brass parts are lathe-finished, so a fine circumferential
  // line pattern runs around the body. This is the 20cm detail on an otherwise plain metal.
  float lathe = fbmT(vec2(uv.x * 2.0, uv.y * 620.0), 1024.0, 2, 2.0, 0.5);
  // Large-scale polish: high points are bright, hollows stay dull.
  float high  = smoothstep(0.35, 0.75, fbmT(uv * 5.5 + 21.0, 64.0, 3, 2.0, 0.5));

  vec3 col = uTint;
  col *= 0.80 + sand * 0.30 + lathe * 0.06;
  // burnished high points go paler and slightly greener, tarnish in the hollows goes brown
  col = mix(col * vec3(0.72, 0.66, 0.50), col * vec3(1.10, 1.07, 0.98), high * uPolish);
  col = mix(col, col * vec3(0.55, 0.46, 0.34), (1.0 - high) * uGrime * 0.55);
  col *= 1.0 - pits * 0.22;

  s.albedo    = col;
  s.metalness = 1.0;
  // Roughness carries almost all the story on a metal: polished ridges vs cast hollows.
  s.roughness = clamp(mix(0.62, 0.16, high * uPolish) + pits * 0.22 - lathe * 0.05
                      + (1.0 - high) * uGrime * 0.18, 0.05, 1.0);
  s.ao        = 1.0 - pits * 0.30 - (1.0 - high) * 0.12;
  s.height    = sand * 0.35 + high * 0.5 - pits * 0.55 + lathe * 0.08;
}
`;

export function brass(opts = {}) {
  const o = { tint: [0.78, 0.60, 0.24], polish: 0.85, grime: 0.45, size: 512, ...opts };
  return baker().standard({
    key: `gadget-brass:${JSON.stringify(o)}`,
    size: o.size,
    surface: BRASS_SURFACE,
    heightScale: 0.02,
    normalStrength: 0.8,
    anisotropy: 8,
    uniforms: {
      uTint: new THREE.Vector3(...o.tint),
      uPolish: o.polish,
      uGrime: o.grime,
    },
  }, { envMapIntensity: 1.25, normalScale: new THREE.Vector2(0.5, 0.5) });
}

// ---------------------------------------------------------------------------
// Gun-body chrome: satin, machined, scuffed at the edges from use.
// ---------------------------------------------------------------------------
const GUNMETAL_SURFACE = /* glsl */ `
uniform vec3  uTint;
uniform float uWear;
uniform float uDark;

void surface(in vec2 uv, inout Surf s){
  // Machined circumferential lines — the signature of a turned metal part.
  float mach  = fbmT(vec2(uv.x * 3.0, uv.y * 480.0), 512.0, 2, 2.0, 0.5);
  float grain = fbmT(uv * 130.0, 256.0, 3, 2.0, 0.5);
  // Scuffs cluster where a hand or a wall would touch: broad patches, not uniform noise.
  float scuffZone = smoothstep(0.45, 0.85, fbmT(uv * 4.0 + 13.0, 64.0, 3, 2.0, 0.5));
  float scuff = smoothstep(0.70, 0.96, fbmT(uv * 60.0 + 3.0, 128.0, 2, 2.0, 0.5)) * scuffZone;

  vec3 col = mix(uTint, uTint * 0.45, uDark);
  col *= 0.90 + mach * 0.10 + grain * 0.06;
  col = mix(col, col * 1.22, scuff * uWear * 0.6);      // scuffs expose brighter metal

  s.albedo    = col;
  s.metalness = 1.0;
  s.roughness = clamp(0.30 - mach * 0.10 + grain * 0.10 + scuff * uWear * 0.30, 0.04, 1.0);
  s.ao        = 1.0 - grain * 0.10;
  s.height    = mach * 0.25 + grain * 0.2 - scuff * 0.3;
}
`;

export function gunmetal(opts = {}) {
  const o = { tint: [0.72, 0.74, 0.76], wear: 0.55, dark: 0.0, size: 512, ...opts };
  return baker().standard({
    key: `gadget-gunmetal:${JSON.stringify(o)}`,
    size: o.size,
    surface: GUNMETAL_SURFACE,
    heightScale: 0.015,
    normalStrength: 0.7,
    anisotropy: 8,
    uniforms: { uTint: new THREE.Vector3(...o.tint), uWear: o.wear, uDark: o.dark },
  }, { envMapIntensity: 1.15, normalScale: new THREE.Vector2(0.45, 0.45) });
}

/**
 * The nail gun's rail, glowing from internal heat.
 *
 * Emissive is driven by a blackbody-ish ramp along the barrel rather than a flat orange. A flat
 * emissive colour is the thing that makes glowing props look like stickers.
 *
 * ⚠️ WHICH END IS HOT IS THE CALLER'S TO SAY, AND THIS COMMENT USED TO SAY THE OPPOSITE OF WHAT
 * SHIPS. It read "the reference shows the muzzle end white-hot fading to deep red toward the
 * breech"; the reference (Dev Art 1785313925351) shows the exact reverse — white-hot at the
 * grip/coil junction beside the pilot flame, fading through yellow and orange to a SOOTY DARK
 * CAP at the muzzle — and `nailGun()` passes `dir: 1` for that. A stale docstring here is not
 * cosmetic: it is why the direction was argued about for two rounds. Measured on the shipping
 * render (`harness/scenarios/_g6-railscan.mjs`, 21 stations, each kept only if a camera->pixel
 * raycast says the rail owns it): breech half mean L210.7, muzzle half L121.4, peak at t=0.85,
 * far tip 48/24/18. `dir` is the knob; read the CALLER to find out which way a given rail runs.
 *
 * Two things this has to survive, both of which have bitten it before:
 *
 *  - `half` is the mesh's half-length in local Y. The ramp normalises by it, because the
 *    classic `y * 0.5 + 0.5` assumes the mesh spans [-1,1]; on a 0.4-unit rail `t` never
 *    leaves ~0.5 and the whole bar sits at one dim orange.
 *  - `post/pipeline.js:patchForScreenAO()` chains onto onBeforeCompile and then
 *    *overwrites* `customProgramCacheKey` with its own constant. Any material that relied
 *    on a custom cache key to keep its program distinct silently starts sharing a compiled
 *    program with the first look-alike material in the scene — and loses its shader. So
 *    the distinguishing mark lives in `defines` instead, which three folds into the
 *    program cache key and nothing downstream rewrites.
 */
export function hotSteel(opts = {}) {
  const heat = opts.heat ?? 1.0;
  const half = opts.half ?? 1.0;
  // +1 = hottest at local +Y, -1 = hottest at local -Y.
  const dir = opts.dir ?? 1;
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x1a0f0a),
    metalness: 1.0,
    roughness: 0.42,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 1.0,
  });
  m.defines = { RRR_HOTSTEEL: 1 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHeat = { value: heat };
    sh.uniforms.uHalf = { value: half };
    sh.uniforms.uDir = { value: dir };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vLocalPos;
        uniform float uHeat;
        uniform float uHalf;
        uniform float uDir;
        // crude blackbody: deep red -> orange -> yellow -> white
        vec3 blackbody(float t){
          t = clamp(t, 0.0, 1.0);
          vec3 c = mix(vec3(0.40, 0.015, 0.0), vec3(1.0, 0.24, 0.02), smoothstep(0.0, 0.42, t));
          c = mix(c, vec3(1.0, 0.70, 0.16), smoothstep(0.38, 0.70, t));
          // White-hot completes at 0.94, not 1.0. The rail's last few percent is buried
          // behind the muzzle block and the shroud, so a band that only finishes at the
          // extreme tip puts its white where the camera cannot see it and leaves every
          // VISIBLE texel short of the bar art.
          c = mix(c, vec3(1.0, 0.97, 0.90), smoothstep(0.68, 0.94, t));
          return c;
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // t = 1 at local +Y when uDir = +1; the caller decides which end that is
        float t = clamp(vLocalPos.y * uDir / max(uHalf, 1e-4) * 0.5 + 0.5, 0.0, 1.0);
        // Ribbed cooling slots crossing the rail: dark bands that make the gradient
        // legible as a *bar with structure* rather than a smooth airbrushed blob.
        float rib = smoothstep(0.30, 0.46, abs(fract(vLocalPos.y / max(uHalf, 1e-4) * 9.0) - 0.5));
        // COLOUR COMES FROM POSITION, BRIGHTNESS FROM POSITION x RIB.
        //
        // These used to be the same number: blackbody() was fed the rib-modulated value, so
        // every cooling slot did not merely darken, it walked the whole bar back DOWN the
        // temperature ramp. The muzzle therefore alternated white-ish and orange rib by rib
        // and its measured peak landed at (238,208,144) — a warm yellow — against the bar
        // art's (253,247,226). A slot is a shadow, not colder steel, so it has no business
        // changing the colour temperature. Splitting the two is what buys the white muzzle
        // back without washing the deep red breech out.
        float hot = pow(t, 1.3) * uHeat;
        float g = hot * mix(0.45, 1.0, rib);
        totalEmissiveRadiance = blackbody(hot) * (g * 9.0);`);
  };
  return m;
}

// ---------------------------------------------------------------------------
// Polished chrome. Same machining story as gunmetal but taken to a mirror: the grapple
// housing and the ball gun body in the Dev Art are bright chrome that visibly bends the
// whole environment across their curve, which a roughness of 0.3 cannot do.
// ---------------------------------------------------------------------------
const CHROME_SURFACE = /* glsl */ `
uniform vec3  uTint;
uniform float uWear;

void surface(in vec2 uv, inout Surf s){
  // Fine draw lines from the polishing wheel — the only thing keeping a mirror from
  // being a featureless white blob is that its highlight has grain.
  float draw  = fbmT(vec2(uv.x * 2.0, uv.y * 700.0), 1024.0, 2, 2.0, 0.5);
  float grain = fbmT(uv * 160.0, 256.0, 3, 2.0, 0.5);
  // Handling haze pools in broad patches, the way a chromed part goes cloudy where it is
  // gripped. fbmT sits in a narrow bell around 0.5, so stretch before gating or the
  // threshold never fires.
  float hazeF = clamp((fbmT(uv * 3.5 + 9.0, 64.0, 3, 2.0, 0.5) - 0.5) * 2.6 + 0.5, 0.0, 1.0);
  float haze  = smoothstep(0.55, 0.95, hazeF) * uWear;
  float nick  = smoothstep(0.80, 0.97, fbmT(uv * 90.0 + 4.0, 128.0, 2, 2.0, 0.5)) * uWear;

  vec3 col = uTint * (0.95 + draw * 0.05 + grain * 0.04);
  col = mix(col, col * 0.92, haze * 0.5);

  s.albedo    = col;
  s.metalness = 1.0;
  s.roughness = clamp(0.055 + haze * 0.22 + nick * 0.30 + grain * 0.035 - draw * 0.02, 0.02, 1.0);
  s.ao        = 1.0 - grain * 0.05;
  s.height    = draw * 0.2 + grain * 0.15 - nick * 0.4;
}
`;

export function chrome(opts = {}) {
  const o = { tint: [0.90, 0.92, 0.95], wear: 0.45, size: 512, ...opts };
  return baker().standard({
    key: `gadget-chrome:${JSON.stringify(o)}`,
    size: o.size,
    surface: CHROME_SURFACE,
    heightScale: 0.010,
    normalStrength: 0.5,
    anisotropy: 8,
    uniforms: { uTint: new THREE.Vector3(...o.tint), uWear: o.wear },
  }, { envMapIntensity: 1.9, normalScale: new THREE.Vector2(0.3, 0.3) });
}

/**
 * ============================================================================
 * WHY EVERY GLOW ON THIS FILE WAS INVISIBLE, MEASURED RATHER THAN ARGUED
 * ============================================================================
 *
 * Three separate faults compounded, and the two that were previously written down here
 * were both wrong. All numbers below are from `harness/_tmp_fxglow.mjs`, which reads the
 * PRE-TONEMAP half-float target and the final canvas at the SAME pixel, so "the sprite
 * never deposited light" and "the tone curve ate the light it deposited" can be told apart.
 *
 * 1. THE TONE CURVE, and this is the whole thing. The studio cyc does not sit near 1.0 —
 *    it sits at a LINEAR RADIANCE of 2.2 to 3.6, and ACES maps that entire range onto
 *    LDR 204..207. Measured slope at the cyc's own operating point: a radiance change of
 *    1.0 moves the output by ABOUT ONE 8-BIT LEVEL. So anything a normal-blended sprite or
 *    a unit-brightness additive sprite can do — both are bounded by a colour of 1.0 — is
 *    arithmetically incapable of moving that backdrop. Proof, one sprite, one pixel:
 *
 *      normal-blended orange, opacity 0.42, covering the whole area   207/206/205 -> 205/204/202
 *      the SAME sprite as a MULTIPLY filter                           207/206/205 -> 209/188/168
 *
 *    r-b goes +2 -> +41, which is the bar art's own +38..+62 beside its gun. Multiplying
 *    works because it DIVIDES a channel by two or three, dropping it out of the shoulder
 *    and into the part of the curve that still has slope. Adding cannot: there are only ~48
 *    levels of headroom above the cyc and they cost unbounded radiance.
 *    (Same mechanism, same conclusion, already on record for `lightPool` in
 *    `lighting/volumetric.js` — an additive decal at 0.62 over sunlit marble at radiance ~6.)
 *
 * 2. `toneMapped: false` IS A NO-OP IN THIS PIPELINE AND ALWAYS HAS BEEN. `engine.js` sets
 *    `renderer.toneMapping = NoToneMapping` because the composite pass tone-maps instead,
 *    and three only emits the tonemapping chunk when the RENDERER has a tone mapping mode —
 *    `material.toneMapped` merely picks between that mode and none. Flipping it on every
 *    sprite in the scene and re-measuring moved four separate cyc references by 0 or 1
 *    level. The comment that used to sit here calling it "the difference between a glow and
 *    a smudge" was describing an effect that cannot exist.
 *
 * 3. RENDER ORDER. Sprites and these materials all run `depthWrite: false`, so the
 *    transparent queue sorts them by distance — and two co-located effects can land either
 *    way round. On the skates that flipped BETWEEN THE TWO FEET (the right one is built with
 *    `scale.x = -1`): the additive cores deposited +1.70 radiance on the left skate and
 *    +0.06 on the right, because on the right the normal-blended plume ellipsoids drew last
 *    and painted over them. Forcing `depthTest = false` recovered +1.48. Anything meant to
 *    be a light must carry an explicit `renderOrder` above the shapes it lights.
 *
 * So the rule for this file: A GLOW IS A MULTIPLY PLUS AN ADD. The multiply supplies the
 * colour by removing the complementary channels, which is the only move with any authority
 * over a bright backdrop; the add supplies the hot centre and feeds the bloom pass, which is
 * what does the work in the game's dark rooms where multiply has nothing to bite on.
 */

/**
 * Effect material for flame geometry — cones, the burning oil arc, the skate plumes.
 *
 *   glowMat(hex, opacity, { blend: 'add' | 'normal', intensity })
 *
 * `intensity` scales the LINEAR colour above 1.0. That is the only lever that reaches the
 * backdrop from an additive layer, and three does not clamp it. The legacy boolean third
 * argument still means `blend: 'add'`.
 */
export function glowMat(hex, opacity = 0.6, opts = {}) {
  const o = typeof opts === 'boolean' ? { blend: opts ? 'add' : 'normal' } : opts;
  const add = o.blend === 'add';
  const color = new THREE.Color(hex);
  if (o.intensity && o.intensity !== 1) color.multiplyScalar(o.intensity);
  const m = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: add ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  if (o.name) m.name = o.name;
  return m;
}

/**
 * A soft radial sprite. Used for the nail gun's heat bloom on the air and the oil
 * lobber's burning splash — the reference shots both spill light into the scene around
 * the gadget, and a prop that glows without lighting anything reads as a decal.
 */
let _radialTex = null;
export function radialTexture() {
  if (_radialTex) return _radialTex;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0.00, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.72)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  grad.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  _radialTex = new THREE.CanvasTexture(c);
  _radialTex.colorSpace = THREE.SRGBColorSpace;
  return _radialTex;
}

/**
 * The multiply companion to `radialTexture()`: RGB ramps from `tint` at the centre to PURE
 * WHITE at the rim, alpha is irrelevant. Under `blend: 'multiply'` the destination is
 * scaled by these texels, so white is an exact no-op and the sprite's square edge cannot
 * show — which is the failure mode a rectangular filter always has.
 *
 * `strength` is folded in here rather than exposed as `opacity`, because SpriteMaterial's
 * opacity only reaches the alpha channel and a multiply blend never looks at alpha. For the
 * same reason the tint must NOT go through `material.color`: that multiplies the whole quad
 * uniformly, rim included, and the soft edge becomes a hard square overnight.
 */
const _mulTex = new Map();
export function multiplyTexture(hex, strength = 1) {
  const key = `${hex}:${strength}`;
  if (_mulTex.has(key)) return _mulTex.get(key);
  const c0 = new THREE.Color(hex);
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // `t` is how much of the filter is applied; the stops mirror radialTexture()'s falloff so
  // an add layer and a multiply layer of the same scale sit on top of each other exactly.
  const stop = (t) => {
    const k = t * strength;
    const ch = (v) => Math.round(255 * Math.min(1, Math.max(0, 1 - (1 - v) * k)));
    return `rgb(${ch(c0.r)},${ch(c0.g)},${ch(c0.b)})`;
  };
  grad.addColorStop(0.00, stop(1.00));
  grad.addColorStop(0.22, stop(0.80));
  grad.addColorStop(0.50, stop(0.42));
  grad.addColorStop(0.78, stop(0.14));
  grad.addColorStop(1.00, stop(0.00));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  _mulTex.set(key, t);
  return t;
}

/**
 * A soft radial glow sprite.
 *
 *   glowSprite(hex, opacity, { blend, intensity, order, name })
 *
 *   blend      'normal' (default) — a stain. Correct for smoke, wrong for anything hot.
 *              'add'    — a light. `intensity` scales the LINEAR colour above 1.0 so it can
 *                         actually clear a backdrop at radiance ~3 and cross the bloom
 *                         threshold. Calibrated on the skate jet against the cyc:
 *                            x1  radiance  2.2 -> LDR 220     x8  radiance 14.7 -> 251
 *                            x3  radiance  5.8 -> LDR 243     x20 radiance 36   -> 255 (clips)
 *              'multiply' — a filter. `opacity` becomes the filter STRENGTH. This is the
 *                         only blend with real authority over the bright cyc; see the block
 *                         comment above for the measurements.
 *   order      renderOrder. A light must draw after the shape it lights — see fault 3.
 *
 * The legacy third argument may still be a boolean meaning `additive`. The legacy FOURTH
 * argument (`toneMapped`) is gone: it never did anything, and leaving a dead knob in the
 * signature is how it got set twice more.
 *
 * ⚠️ `allowOverride: false` is load-bearing — do not drop it. `post/pipeline.js` runs its
 * depth prepass by setting `scene.overrideMaterial`, and three applies an override to every
 * material whose `allowOverride` is true, which `SpriteMaterial`'s is by default. In the
 * prepass each sprite was then drawn with a MESH vertex shader, which does no billboarding,
 * so the unit quad rasterised as a flat plane lying in its parent's local XY plane — and
 * wrote depth. Nothing looked wrong in the beauty pass; the damage was one pass downstream,
 * where HBAO reads that depth and every sprite stamped a hard-edged, wrongly-oriented quad
 * of "unoccluded" AO onto whatever was behind it. On the nail gun that was a 1.2 m slanted
 * pale parallelogram across the cyc, measured 221 against 199-215 either side of its edge,
 * and NEUTRAL GREY rather than the sprite's own orange — which is what proves it was the AO
 * term and not the sprite. Confirmed by `--extra "dbg=nosprite"`.
 */
export function glowSprite(hex, opacity = 0.6, opts = {}) {
  const o = typeof opts === 'boolean' ? { blend: opts ? 'add' : 'normal' } : opts;
  const mul = o.blend === 'multiply';
  const add = o.blend === 'add';
  const color = new THREE.Color(mul ? 0xffffff : hex);
  if (add && o.intensity && o.intensity !== 1) color.multiplyScalar(o.intensity);

  const mat = new THREE.SpriteMaterial({
    map: mul ? multiplyTexture(hex, opacity) : radialTexture(),
    color,
    transparent: true,
    opacity: mul ? 1 : opacity,
    depthWrite: false,
    allowOverride: false,
    // CustomBlending, NOT THREE.MultiplyBlending. The built-in constant additionally demands
    // `premultipliedAlpha: true`; three enforces that with a per-draw console error and then
    // DECLINES the state change — no throw, no failed view, and on `lightPool` it produced a
    // uniform dark capture that `shoot.mjs` reported as `ok`. Spelling the factors out gives
    // dst = dst * src.rgb with the destination alpha left alone, which is what a filter over
    // an HDR target actually wants.
    blending: mul ? THREE.CustomBlending : (add ? THREE.AdditiveBlending : THREE.NormalBlending),
    ...(mul ? {
      blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    } : {}),
  });
  const s = new THREE.Sprite(mat);
  s.name = o.name ?? (mul ? 'glow-filter' : add ? 'glow-light' : 'glow-stain');
  mat.name = s.name + '-mat';
  if (o.order !== undefined) s.renderOrder = o.order;
  // A multiply filter is a property of the AIR, so it must not be scaled by the flicker that
  // drives the flames; callers read this to skip it.
  s.userData.filter = mul;
  return s;
}

/**
 * The ball hopper dome.
 *
 * Deliberately NOT `transmission`. Real transmission refracts the background through the
 * dome, and the studio background is a near-white cyc — so a transmissive dome in front of
 * white is invisible, which is exactly how the signature silhouette of this gadget went
 * missing. A thin alpha shell with a hard clearcoat keeps the rim, the specular arc and
 * the double-surface highlight that say "glass", and it costs nothing.
 */
export function clearGlass(tint = 0xe8f1fb) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(tint),
    metalness: 0, roughness: 0.02,
    transparent: true, opacity: 0.26,
    ior: 1.52, envMapIntensity: 2.2,
    clearcoat: 1.0, clearcoatRoughness: 0.02,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

/** The bouncy balls: saturated, glossy, self-lit enough to pop in a dark room. */
export function ballMaterial(hex) {
  const c = new THREE.Color(hex);
  return new THREE.MeshPhysicalMaterial({
    color: c, metalness: 0, roughness: 0.14,
    clearcoat: 1.0, clearcoatRoughness: 0.05,
    emissive: c, emissiveIntensity: 0.16,
    envMapIntensity: 1.1,
  });
}

export const BALL_COLOURS = [0xe23b3b, 0x3b7fe2, 0x36c26a, 0xf0c020, 0xb44ce0, 0xef7a2a];

/** Matte black polymer for magazines and grips. */
export function polymer(opts = {}) {
  const o = { tint: [0.055, 0.058, 0.062], size: 256, ...opts };
  return baker().standard({
    key: `gadget-polymer:${JSON.stringify(o)}`,
    size: o.size,
    surface: /* glsl */ `
      uniform vec3 uTint;
      void surface(in vec2 uv, inout Surf s){
        // moulded stipple — the pebbled finish on a polymer gun body
        float v = voronoiT(uv * 150.0, 150.0).x;
        float stip = smoothstep(0.05, 0.45, v);
        float wear = smoothstep(0.72, 0.95, fbmT(uv * 8.0, 64.0, 3, 2.0, 0.5));
        s.albedo    = uTint * (0.75 + stip * 0.45) * (1.0 + wear * 0.35);
        s.metalness = 0.0;
        s.roughness = clamp(0.86 - stip * 0.18 - wear * 0.22, 0.1, 1.0);
        s.ao        = 1.0 - (1.0 - stip) * 0.25;
        s.height    = stip;
      }`,
    heightScale: 0.012,
    normalStrength: 0.9,
    uniforms: { uTint: new THREE.Vector3(...o.tint) },
  }, { envMapIntensity: 0.8 });
}
