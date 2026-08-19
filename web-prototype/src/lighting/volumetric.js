import * as THREE from 'three';

/**
 * CHEAP VOLUMETRICS
 *
 * There is no raymarch here and there never will be — a full-res march is the single
 * fastest way to lose the frame budget on integrated graphics. What shipped titles did
 * for a decade instead, and what this does:
 *
 *   1. SHAFT BODY — the window aperture lofted along the light direction into a closed
 *      prism with a rounded cross-section, drawn BACK-FACE ONLY with additive blending.
 *      Back faces give a free thickness proxy: the face you see through the middle of the
 *      shaft is nearly perpendicular to the view (|N·V| ≈ 1, thick, bright), the face you
 *      see at the silhouette is nearly edge-on (|N·V| ≈ 0, thin, dim). That single dot
 *      product is what makes a piece of geometry read as a volume of air.
 *
 *   2. COLOUR FROM THE GLASS. The cross-section carries the window's own uv, so the shaft
 *      is tinted by the actual stained-glass texture and smears out toward a mean tint as
 *      it travels — which is why the shaft in the locked art is gold near the window and
 *      washes to warm white by the time it reaches the floor.
 *
 *   3. DUST — instanced points inside the shaft volume, drifting on a seeded curl. Points
 *      are the cheapest primitive there is and the motes are what make people say
 *      "volumetric" about an effect that is one prism.
 *
 *   4. POOLS — the patch of light where the shaft lands, as an additive decal on the
 *      floor or wall carrying the same glass texture. Also the reason the shaft body can
 *      be faded out before it reaches the floor, which hides the hard polygon
 *      intersection a solid volume would otherwise cut.
 *
 * All of it is deterministic: positions come from a passed-in seeded rng, motion from the
 * engine's fixed-step clock. Two captures of the same view are the same image.
 */

const SHAFT_VERT = /* glsl */ `
attribute float aT;        // 0 at the aperture, 1 at the far end
attribute vec2  aUV;       // cross-section position in aperture uv space
varying float vT;
varying vec2  vUV;
varying vec3  vN;
varying vec3  vV;
varying vec3  vW;
void main(){
  vT = aT;
  vUV = aUV;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SHAFT_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tGlass;
uniform vec3  uTint;
uniform vec3  uMean;        // what the pattern washes out to down the shaft
uniform float uStrength;
uniform float uSmear;       // how fast the pattern loses definition
uniform float uFloorY;
uniform float uFadeY;       // metres over which to fade out as it reaches the floor
uniform float uTime;
uniform float uNear;        // fade in just off the glass so there is no hard start
varying float vT;
varying vec2  vUV;
varying vec3  vN;
varying vec3  vV;
varying vec3  vW;

float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec3 p){
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = h21(i.xy + i.z * 37.0), b = h21(i.xy + vec2(1.0, 0.0) + i.z * 37.0);
  float c = h21(i.xy + vec2(0.0, 1.0) + i.z * 37.0), d = h21(i.xy + vec2(1.0) + i.z * 37.0);
  float e = h21(i.xy + (i.z + 1.0) * 37.0), g = h21(i.xy + vec2(1.0, 0.0) + (i.z + 1.0) * 37.0);
  float k = h21(i.xy + vec2(0.0, 1.0) + (i.z + 1.0) * 37.0), l = h21(i.xy + vec2(1.0) + (i.z + 1.0) * 37.0);
  return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y), mix(mix(e,g,f.x), mix(k,l,f.x), f.y), f.z);
}

void main(){
  // thickness proxy — the whole trick
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float thick = pow(facing, 1.35);

  // length falloff: bright at the aperture, thinning out down the beam
  float lenFade = (1.0 - vT * 0.72) * smoothstep(0.0, uNear, vT);

  // never let the prism cut a hard line into the floor
  float floorFade = smoothstep(uFloorY, uFloorY + uFadeY, vW.y);

  // the pattern of the glass, smearing toward its mean as the light travels
  vec3 pat = texture2D(tGlass, vUV).rgb;
  pat = mix(pat, uMean, clamp(vT * uSmear, 0.0, 1.0));

  // air is not homogeneous — slow drifting density, three scales
  float d = vn(vW * 0.85 + vec3(0.0, uTime * 0.06, uTime * 0.03)) * 0.55
          + vn(vW * 2.4 - vec3(uTime * 0.05, 0.0, 0.0)) * 0.30
          + 0.30;

  float a = thick * lenFade * floorFade * uStrength * d;
  vec3 col = pat * uTint * a;
  gl_FragColor = vec4(col, a);
}
`;

/**
 * Build the shaft body.
 *
 * @param o.width/o.height   aperture size in metres
 * @param o.length           how far the beam travels
 * @param o.spread           fractional widening over the run (sunlight ≈ 0.05)
 * @param o.glass            THREE.Texture — the stained glass albedo
 * @param o.tint             THREE.Color
 * @param o.strength         master alpha
 * @param o.floorY / fadeY   where and how fast to dissolve before the floor
 * @param o.arch             fraction of the aperture height that is a semicircular head
 */
export function lightShaft(o = {}) {
  const w = o.width ?? 1.4, h = o.height ?? 3.0;
  const len = o.length ?? 9.0;
  const spread = o.spread ?? 0.06;
  const segsRound = o.segs ?? 22;
  const slices = o.slices ?? 5;
  const archFrac = o.arch ?? 0.34;

  // ---- cross-section: a lancet outline, softened at every corner -----------
  const sec = [];
  const hw = w / 2, sh = h * (1 - archFrac), ar = w / 2;
  for (let i = 0; i < segsRound; i++) {
    const t = i / segsRound;
    // parametrise the outline: arch head then the two jambs and the sill
    const a = t * Math.PI * 2;
    let x, y;
    if (t < 0.5) {
      // top half: semicircular head + upper jambs
      const p = t / 0.5;                       // 0..1 left->right over the head
      const ang = Math.PI * (1 - p);
      x = Math.cos(ang) * ar;
      y = sh + Math.max(0, Math.sin(ang)) * ar * (archFrac * h) / ar;
    } else {
      const p = (t - 0.5) / 0.5;               // right jamb down, sill, left jamb up
      if (p < 0.34) { x = hw; y = sh * (1 - p / 0.34); }
      else if (p < 0.66) { x = hw - ((p - 0.34) / 0.32) * w; y = 0; }
      else { x = -hw; y = sh * ((p - 0.66) / 0.34); }
    }
    sec.push([x, y]);
  }
  // soften the outline so |N·V| never steps at a corner
  const soft = sec.map((_, i) => {
    const a = sec[(i - 1 + sec.length) % sec.length], b = sec[i], c = sec[(i + 1) % sec.length];
    return [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4];
  });

  const n = soft.length;
  const rows = slices + 1;
  const pos = new Float32Array(n * rows * 3);
  const aT = new Float32Array(n * rows);
  const aUV = new Float32Array(n * rows * 2);
  const idx = [];
  const yMid = h * 0.5;
  for (let j = 0; j < rows; j++) {
    const t = j / slices;
    const s = 1 + spread * t * len / Math.max(w, h);
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const [x, y] = soft[i];
      pos[k * 3] = x * s;
      pos[k * 3 + 1] = (y - yMid) * s + yMid;
      pos[k * 3 + 2] = -t * len;
      aT[k] = t;
      aUV[k * 2] = x / w + 0.5;
      aUV[k * 2 + 1] = y / h;
    }
  }
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * n + i, b = j * n + ((i + 1) % n);
      const c = (j + 1) * n + i, d = (j + 1) * n + ((i + 1) % n);
      idx.push(a, c, b, b, c, d);
    }
  }
  // cap the far end so a camera looking straight down the beam still sees volume
  const capStart = rows * n;
  const capPos = [];
  for (let i = 0; i < n; i++) capPos.push(pos[((rows - 1) * n + i) * 3], pos[((rows - 1) * n + i) * 3 + 1], pos[((rows - 1) * n + i) * 3 + 2]);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
  g.setAttribute('aUV', new THREE.BufferAttribute(aUV, 2));
  g.setIndex(idx);
  g.computeVertexNormals();

  const mat = new THREE.ShaderMaterial({
    vertexShader: SHAFT_VERT,
    fragmentShader: SHAFT_FRAG,
    uniforms: {
      tGlass: { value: o.glass ?? null },
      uTint: { value: new THREE.Color(o.tint ?? 0xffe6bd) },
      uMean: { value: new THREE.Color(o.mean ?? 0xfff0d6) },
      uStrength: { value: o.strength ?? 0.42 },
      uSmear: { value: o.smear ?? 1.5 },
      uFloorY: { value: o.floorY ?? 0.0 },
      uFadeY: { value: o.fadeY ?? 1.1 },
      uNear: { value: o.near ?? 0.06 },
      uTime: { value: 0 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.BackSide,
    toneMapped: true,
  });

  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 12;
  mesh.name = 'light-shaft';
  mesh.userData.setTime = (t) => { mat.uniforms.uTime.value = t; };
  return mesh;
}

// ---------------------------------------------------------------------------
// Dust motes
// ---------------------------------------------------------------------------

const DUST_VERT = /* glsl */ `
attribute vec3  aSeed;
attribute float aSize;
uniform float uTime;
uniform float uSize;
uniform vec3  uExtent;
uniform float uDrift;
varying float vTw;
varying float vDepth;
void main(){
  vec3 p = position;
  // slow settling plus a lazy lateral curl, wrapped inside the extent so nothing escapes
  float t = uTime * uDrift;
  p.y -= mod(t * (0.30 + aSeed.x * 0.5), uExtent.y * 2.0);
  p.y = mod(p.y + uExtent.y, uExtent.y * 2.0) - uExtent.y;
  p.x += sin(t * (0.5 + aSeed.y) + aSeed.z * 6.28) * 0.11;
  p.z += cos(t * (0.4 + aSeed.z) + aSeed.x * 6.28) * 0.11;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vDepth = -mv.z;
  // motes catch the light when they turn — a fast twinkle keyed off the seed
  vTw = 0.35 + 0.65 * pow(abs(sin(t * (2.1 + aSeed.y * 3.0) + aSeed.x * 12.0)), 3.0);
  gl_PointSize = uSize * aSize * (1.0 / max(vDepth, 0.2));
  gl_Position = projectionMatrix * mv;
}
`;

const DUST_FRAG = /* glsl */ `
precision highp float;
uniform vec3  uColor;
uniform float uIntensity;
varying float vTw;
varying float vDepth;
void main(){
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;
  float a = exp(-r * 3.4);
  a *= vTw * uIntensity;
  // distant motes must not turn into aliased single pixels
  a *= smoothstep(0.0, 1.2, vDepth) * (1.0 - smoothstep(14.0, 26.0, vDepth) * 0.7);
  gl_FragColor = vec4(uColor * a, a);
}
`;

/**
 * Dust inside a box volume. Parent it to the shaft so it inherits the shaft's transform.
 * @param o.count  number of motes (scaled by engine.quality.dust by the caller)
 * @param o.extent THREE.Vector3 half-extents in local space
 * @param o.rng    seeded rng — REQUIRED for a deterministic capture
 */
export function dustMotes(o = {}) {
  const count = Math.max(1, Math.round(o.count ?? 600));
  const ext = o.extent ?? new THREE.Vector3(1.2, 3.0, 5.0);
  const centre = o.centre ?? new THREE.Vector3(0, 0, 0);
  const rng = o.rng ?? Math.random;

  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 3);
  const size = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = centre.x + (rng() * 2 - 1) * ext.x;
    pos[i * 3 + 1] = centre.y + (rng() * 2 - 1) * ext.y;
    pos[i * 3 + 2] = centre.z + (rng() * 2 - 1) * ext.z;
    seed[i * 3] = rng(); seed[i * 3 + 1] = rng(); seed[i * 3 + 2] = rng();
    // a few big motes carry most of the read; the rest are fine haze
    size[i] = rng() < 0.09 ? 2.4 + rng() * 2.2 : 0.55 + rng() * 0.85;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.boundingSphere = new THREE.Sphere(centre.clone(), ext.length() * 1.3);

  const mat = new THREE.ShaderMaterial({
    vertexShader: DUST_VERT,
    fragmentShader: DUST_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: o.size ?? 34 },
      uExtent: { value: ext.clone() },
      uDrift: { value: o.drift ?? 1.0 },
      uColor: { value: new THREE.Color(o.color ?? 0xfff0d2) },
      uIntensity: { value: o.intensity ?? 0.85 },
    },
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 14;
  pts.name = 'dust';
  pts.userData.setTime = (t) => { mat.uniforms.uTime.value = t; };
  return pts;
}

// ---------------------------------------------------------------------------
// Light pools
// ---------------------------------------------------------------------------

const POOL_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tGlass;
uniform vec3  uTint;
uniform float uStrength;
uniform float uSoft;
uniform float uBlur;
varying vec2 vUv;
void main(){
  vec2 e = smoothstep(vec2(0.0), vec2(uSoft), vUv) * (1.0 - smoothstep(vec2(1.0 - uSoft), vec2(1.0), vUv));
  float edge = e.x * e.y;
  // cheap 5-tap blur so the pattern is soft-edged the way a projected image is
  vec3 c = texture2D(tGlass, vUv).rgb * 0.36;
  c += texture2D(tGlass, vUv + vec2( uBlur, 0.0)).rgb * 0.16;
  c += texture2D(tGlass, vUv + vec2(-uBlur, 0.0)).rgb * 0.16;
  c += texture2D(tGlass, vUv + vec2(0.0,  uBlur)).rgb * 0.16;
  c += texture2D(tGlass, vUv + vec2(0.0, -uBlur)).rgb * 0.16;
  float a = edge * uStrength;
  gl_FragColor = vec4(c * uTint * a, a);
}
`;

// The SAME decal as a MULTIPLIER instead of an addition, and this is the fix for the
// "second, blank-white pool beside the traceried one" that survived two rounds.
//
// WHY ADDITIVE CANNOT WORK WHERE THE SUN LANDS. The scene renders to a HalfFloat target and
// is tone-mapped in post, so a sunlit marble floor sits at a LINEAR radiance of roughly 6,
// not at 1.0. An additive decal at strength 0.62 is then a 10% modulation on top of that,
// and the tone-map curve — which is compressing 6 down to ~0.95 — removes what is left of
// it. On floor the sun does NOT reach, the base is ~0.05 and the same 0.62 is the entire
// signal. That is the whole mechanism: ONE decal produced a strong pattern on the shadowed
// half and nothing on the lit half, and the lit half is the half a viewer calls "the pool".
// Enlarging the decal (round 4) could not fix it because coverage was never the problem.
//
// Multiplying is also what stained glass actually does: it removes light rather than adding
// it. It cannot clip, it cannot exceed the sunlit brightness, and it puts the pattern
// exactly and only where the light is — so the pattern and the pool stop being two objects.
const POOL_MUL_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tGlass;
uniform vec3  uTint;
uniform float uStrength;
uniform float uSoft;
uniform float uBlur;
uniform float uSat;
varying vec2 vUv;
void main(){
  vec2 e = smoothstep(vec2(0.0), vec2(uSoft), vUv) * (1.0 - smoothstep(vec2(1.0 - uSoft), vec2(1.0), vUv));
  float edge = e.x * e.y;
  vec3 c = texture2D(tGlass, vUv).rgb * 0.36;
  c += texture2D(tGlass, vUv + vec2( uBlur, 0.0)).rgb * 0.16;
  c += texture2D(tGlass, vUv + vec2(-uBlur, 0.0)).rgb * 0.16;
  c += texture2D(tGlass, vUv + vec2(0.0,  uBlur)).rgb * 0.16;
  c += texture2D(tGlass, vUv + vec2(0.0, -uBlur)).rgb * 0.16;
  // Desaturate BEFORE filtering. A filter hands its own colour to the brightest thing in the
  // frame, so a warm leaded light drags the top luminance decile warm with it and the grade
  // gate reads the whole view as monochrome amber ((r-b)/L 0.27 at uSat 1.0). The
  // locked art's daylight is near-neutral and the colour lives in the border and the
  // roundel; uSat is how much of the glass's chroma reaches the floor.
  c = mix(vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), c, uSat);
  // Outside the decal the factor must be exactly 1.0 or the quad's own rectangle becomes a
  // visible seam on the floor — which is the same defect wearing a different hat.
  gl_FragColor = vec4(mix(vec3(1.0), c * uTint * uStrength, edge), 1.0);
}
`;

const POOL_VERT = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

/**
 * The patch of coloured light where a shaft lands. One quad, and it is what makes the marble
 * in the locked art pick up the window.
 *
 * `blend: 'multiply'` (see POOL_MUL_FRAG) makes it a filter over floor the sun is already
 * lighting; the default `'add'` makes it a source in its own right, for floor the sun does
 * not reach. They are different jobs and a view may want both.
 */
export function lightPool(o = {}) {
  const g = new THREE.PlaneGeometry(o.w ?? 3, o.h ?? 5, 1, 1);
  const mul = o.blend === 'multiply';
  const mat = new THREE.ShaderMaterial({
    vertexShader: POOL_VERT,
    fragmentShader: mul ? POOL_MUL_FRAG : POOL_FRAG,
    uniforms: {
      tGlass: { value: o.glass ?? null },
      uTint: { value: new THREE.Color(o.tint ?? 0xffe9c4) },
      uStrength: { value: o.strength ?? 0.9 },
      uSoft: { value: o.soft ?? 0.22 },
      uBlur: { value: o.blur ?? 0.006 },
      uSat: { value: o.sat ?? 1.0 },
    },
    transparent: true,
    // CustomBlending, NOT THREE.MultiplyBlending. The built-in constant additionally requires
    // `premultipliedAlpha: true` and three.js enforces that with a per-draw console error and
    // then declines the state change — which does not throw, does not fail the view, and
    // produced a capture of a uniform rgb(5,7,10) that `shoot.mjs` reported as `ok`. Spelling
    // the factors out gives dst = dst * src with the destination ALPHA left alone, which is
    // what a filter over an HDR target actually wants.
    blending: mul ? THREE.CustomBlending : THREE.AdditiveBlending,
    ...(mul ? {
      blendEquation: THREE.AddEquation, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor,
      blendEquationAlpha: THREE.AddEquation, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
    } : {}),
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: true,
  });
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = 10;
  m.name = 'light-pool';
  return m;
}

/**
 * A soft radial glow decal — the halo a practical throws on the surface behind it, and
 * the cheapest possible substitute for a bounce light. No texture, one quad.
 */
export function glowPatch(o = {}) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: POOL_VERT,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uColor; uniform float uStrength; uniform float uPow;
      varying vec2 vUv;
      void main(){
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - d), uPow) * uStrength;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    uniforms: {
      uColor: { value: new THREE.Color(o.color ?? 0xffb060) },
      uStrength: { value: o.strength ?? 0.6 },
      uPow: { value: o.pow ?? 2.4 },
    },
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, side: THREE.DoubleSide, toneMapped: true,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(o.size ?? 2, o.size ?? 2), mat);
  m.renderOrder = 9;
  m.name = 'glow';
  return m;
}

/** Wire every volumetric in `root` to the engine clock in one updater. */
export function driveVolumetrics(engine, root) {
  const items = [];
  root.traverse((o) => { if (o.userData?.setTime) items.push(o); });
  if (!items.length) return;
  engine.onUpdate((dt, t) => { for (const it of items) it.userData.setTime(t); });
}
