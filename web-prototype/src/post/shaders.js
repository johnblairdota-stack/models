// All post-process fragment shaders. GLSL3.

export const AO_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 oAO;   // r = visibility (1 = unoccluded), g = linear view depth

uniform sampler2D tDepth;
uniform vec2  uTexel;        // 1 / full-res size
uniform vec2  uAOSize;       // half-res size in px
uniform mat4  uInvProj;
uniform mat4  uProj;
uniform float uRadius;       // world units
uniform float uBias;
uniform float uIntensity;
uniform float uFrame;

#define DIRS  4
#define STEPS 6
const float PI_ = 3.141592653589793;

float rawDepth(vec2 uv){ return texture(tDepth, uv).r; }

vec3 viewPos(vec2 uv, float d){
  vec4 clip = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = uInvProj * clip;
  return v.xyz / v.w;
}

// Accurate normal-from-depth: of the four neighbours pick, per axis, the one whose
// depth is closest to the centre. Stops normals from smearing across silhouettes.
vec3 normalFromDepth(vec2 uv, vec3 P){
  vec2 e = uTexel;
  float c  = rawDepth(uv);
  float l  = rawDepth(uv - vec2(e.x, 0.0));
  float r  = rawDepth(uv + vec2(e.x, 0.0));
  float d  = rawDepth(uv - vec2(0.0, e.y));
  float u  = rawDepth(uv + vec2(0.0, e.y));

  vec3 Pl = viewPos(uv - vec2(e.x, 0.0), l);
  vec3 Pr = viewPos(uv + vec2(e.x, 0.0), r);
  vec3 Pd = viewPos(uv - vec2(0.0, e.y), d);
  vec3 Pu = viewPos(uv + vec2(0.0, e.y), u);

  vec3 dx = (abs(l - c) < abs(r - c)) ? (P - Pl) : (Pr - P);
  vec3 dy = (abs(d - c) < abs(u - c)) ? (P - Pd) : (Pu - P);
  return normalize(cross(dx, dy)) * -1.0;
}

// interleaved gradient noise — stable, cheap, no texture fetch
float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main(){
  float d = rawDepth(vUv);
  if (d >= 0.999999){ oAO = vec4(1.0, 1e4, 0.0, 1.0); return; }

  vec3 P = viewPos(vUv, d);
  vec3 N = normalFromDepth(vUv, P);

  // project the world-space radius to a pixel radius at this depth
  float pxRadius = uRadius * 0.5 * uProj[1][1] / max(-P.z, 1e-3) * uAOSize.y;
  pxRadius = clamp(pxRadius, 2.0, 96.0);

  vec2 pix = vUv * uAOSize;
  float rnd = ign(pix + uFrame * 7.0);
  float rotJit = ign(pix.yx + 13.0 + uFrame * 3.0);

  float occl = 0.0;

  for (int s = 0; s < DIRS; s++){
    float phi = (float(s) + rotJit) * (PI_ / float(DIRS));
    vec2 dir = vec2(cos(phi), sin(phi));
    float horizon = 0.0;
    for (int i = 0; i < STEPS; i++){
      float t = (float(i) + rnd) / float(STEPS);
      t = t * t;                                   // bias samples toward the centre
      vec2 suv = vUv + dir * (pxRadius * t) * uTexel * 2.0;
      if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) break;
      float sd = rawDepth(suv);
      if (sd >= 0.999999) continue;
      vec3 S = viewPos(suv, sd);
      vec3 V = S - P;
      float len2 = dot(V, V);
      if (len2 < 1e-8) continue;
      float len = sqrt(len2);
      float cosH = dot(N, V / len) - uBias;
      float fall = 1.0 - smoothstep(uRadius * 0.65, uRadius, len);
      horizon = max(horizon, max(cosH, 0.0) * fall);
    }
    // mirror the direction
    float horizon2 = 0.0;
    for (int i = 0; i < STEPS; i++){
      float t = (float(i) + rnd) / float(STEPS);
      t = t * t;
      vec2 suv = vUv - dir * (pxRadius * t) * uTexel * 2.0;
      if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) break;
      float sd = rawDepth(suv);
      if (sd >= 0.999999) continue;
      vec3 S = viewPos(suv, sd);
      vec3 V = S - P;
      float len2 = dot(V, V);
      if (len2 < 1e-8) continue;
      float len = sqrt(len2);
      float cosH = dot(N, V / len) - uBias;
      float fall = 1.0 - smoothstep(uRadius * 0.65, uRadius, len);
      horizon2 = max(horizon2, max(cosH, 0.0) * fall);
    }
    occl += (horizon + horizon2) * 0.5;
  }

  occl /= float(DIRS);
  float vis = pow(clamp(1.0 - occl, 0.0, 1.0), uIntensity);
  oAO = vec4(vis, -P.z, 0.0, 1.0);
}
`;

export const AO_BLUR_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 oCol;

uniform sampler2D tAO;
uniform vec2  uDir;         // (1/w, 0) then (0, 1/h)
uniform float uDepthSigma;

void main(){
  vec4 c = texture(tAO, vUv);
  float centreZ = c.g;
  float sum = c.r, wsum = 1.0;
  // 9-tap depth-aware gaussian
  const float W[4] = float[4](0.2270270, 0.1945946, 0.1216216, 0.0540541);
  for (int i = 1; i <= 3; i++){
    for (int s = -1; s <= 1; s += 2){
      vec2 uv = vUv + uDir * float(i * s) * 1.35;
      vec4 t = texture(tAO, uv);
      float dz = abs(t.g - centreZ);
      float w = W[i] * exp(-dz * dz / (2.0 * uDepthSigma * uDepthSigma));
      sum += t.r * w; wsum += w;
    }
  }
  oCol = vec4(sum / wsum, centreZ, 0.0, 1.0);
}
`;

// COD-style 13-tap partial-Karis downsample — kills bloom fireflies dead.
export const BLOOM_DOWN_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 oCol;

uniform sampler2D tSrc;
uniform vec2  uTexel;     // texel of the SOURCE
uniform float uFirstMip;  // 1.0 on the first downsample -> apply Karis average + threshold
uniform float uThreshold;
uniform float uSoftKnee;
uniform float uClamp;

vec3 fetch(vec2 uv){ return min(texture(tSrc, uv).rgb, vec3(uClamp)); }
float karisW(vec3 c){ return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }

void main(){
  vec2 t = uTexel;
  vec3 a = fetch(vUv + vec2(-2.0, 2.0) * t);
  vec3 b = fetch(vUv + vec2( 0.0, 2.0) * t);
  vec3 c = fetch(vUv + vec2( 2.0, 2.0) * t);
  vec3 d = fetch(vUv + vec2(-2.0, 0.0) * t);
  vec3 e = fetch(vUv);
  vec3 f = fetch(vUv + vec2( 2.0, 0.0) * t);
  vec3 g = fetch(vUv + vec2(-2.0,-2.0) * t);
  vec3 h = fetch(vUv + vec2( 0.0,-2.0) * t);
  vec3 i = fetch(vUv + vec2( 2.0,-2.0) * t);
  vec3 j = fetch(vUv + vec2(-1.0, 1.0) * t);
  vec3 k = fetch(vUv + vec2( 1.0, 1.0) * t);
  vec3 l = fetch(vUv + vec2(-1.0,-1.0) * t);
  vec3 m = fetch(vUv + vec2( 1.0,-1.0) * t);

  vec3 outc;
  if (uFirstMip > 0.5){
    // Karis-weighted average of the five boxes
    vec3 g0 = (j+k+l+m) * 0.25;
    vec3 g1 = (a+b+d+e) * 0.25;
    vec3 g2 = (b+c+e+f) * 0.25;
    vec3 g3 = (d+e+g+h) * 0.25;
    vec3 g4 = (e+f+h+i) * 0.25;
    float w0 = karisW(g0)*0.5, w1 = karisW(g1)*0.125, w2 = karisW(g2)*0.125;
    float w3 = karisW(g3)*0.125, w4 = karisW(g4)*0.125;
    float wsum = w0+w1+w2+w3+w4;
    outc = (g0*w0 + g1*w1 + g2*w2 + g3*w3 + g4*w4) / max(wsum, 1e-5);

    // soft-knee threshold
    float br = max(outc.r, max(outc.g, outc.b));
    float knee = uThreshold * uSoftKnee + 1e-5;
    float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee);
    float contrib = max(soft, br - uThreshold) / max(br, 1e-5);
    outc *= contrib;
  } else {
    outc = e * 0.125
         + (a + c + g + i) * 0.03125
         + (b + d + f + h) * 0.0625
         + (j + k + l + m) * 0.125;
  }
  oCol = vec4(outc, 1.0);
}
`;

export const BLOOM_UP_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 oCol;
uniform sampler2D tSrc;     // smaller mip
uniform sampler2D tDst;     // the mip we are adding into
uniform vec2  uTexel;       // texel of tSrc
uniform float uRadius;
void main(){
  vec2 t = uTexel * uRadius;
  vec3 s = texture(tSrc, vUv + vec2(-1, 1) * t).rgb * 1.0
         + texture(tSrc, vUv + vec2( 0, 1) * t).rgb * 2.0
         + texture(tSrc, vUv + vec2( 1, 1) * t).rgb * 1.0
         + texture(tSrc, vUv + vec2(-1, 0) * t).rgb * 2.0
         + texture(tSrc, vUv                 ).rgb * 4.0
         + texture(tSrc, vUv + vec2( 1, 0) * t).rgb * 2.0
         + texture(tSrc, vUv + vec2(-1,-1) * t).rgb * 1.0
         + texture(tSrc, vUv + vec2( 0,-1) * t).rgb * 2.0
         + texture(tSrc, vUv + vec2( 1,-1) * t).rgb * 1.0;
  oCol = vec4(texture(tDst, vUv).rgb + s * (1.0 / 16.0), 1.0);
}
`;

export const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 oCol;

uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tDepth;
uniform vec2  uResolution;
uniform float uExposure;
uniform float uBloomStrength;
uniform float uHalation;
uniform vec3  uHalationTint;
uniform float uCA;
uniform float uVignette;
uniform float uVignetteRound;
uniform float uGrain;
uniform float uGrainSize;
// Grain phase in [0,1), NOT a clock. It used to be a fract(uTime) computed here, which
// silently made every capture a function of how many frames had happened to render before
// the screenshot — see the determinism note in pipeline.js. The pipeline now decides the
// phase (animated live, pinned in capture mode), and it computes the fract in float64.
uniform float uGrainPhase;
// grade
uniform vec3  uLift;
uniform vec3  uGamma;
uniform vec3  uGain;
uniform float uSaturation;
uniform float uToneChroma;   // 0 = plain ACES - see the tonemap block below
uniform float uContrast;
uniform vec3  uShadowTint;
uniform vec3  uHighlightTint;
uniform float uSplitBalance;
uniform float uToeCrush;
// fog-of-dark / depth haze
uniform float uHazeAmount;
uniform vec3  uHazeColor;
uniform float uNear;
uniform float uFar;

// ---------- ACES (Stephen Hill fit) ----------
const mat3 ACESInput = mat3(
  0.59719, 0.07600, 0.02840,
  0.35458, 0.90834, 0.13383,
  0.04823, 0.01566, 0.83777);
const mat3 ACESOutput = mat3(
   1.60475, -0.10208, -0.00327,
  -0.53108,  1.10813, -0.07276,
  -0.07367, -0.00605,  1.07602);

vec3 rrtOdtFit(vec3 v){
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 acesFitted(vec3 c){
  c = ACESInput * c;
  c = rrtOdtFit(c);
  c = ACESOutput * c;
  return clamp(c, 0.0, 1.0);
}

float lumaW(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 lgg(vec3 c){
  c = c * uGain + uLift * (1.0 - c);
  c = pow(max(c, 0.0), 1.0 / max(uGamma, vec3(1e-3)));
  return c;
}

// hash for grain
float h21(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main(){
  vec2 uv = vUv;
  vec2 centred = uv - 0.5;
  float r2 = dot(centred, centred);

  // ---- chromatic aberration: radial, only at the edges, sampled from the scene ----
  vec3 scene;
  {
    float amt = uCA * r2 * 2.4;
    vec2 dir = centred * amt;
    scene.r = texture(tScene, uv - dir * 1.0).r;
    scene.g = texture(tScene, uv).g;
    scene.b = texture(tScene, uv + dir * 1.0).b;
  }

  vec3 bloom = texture(tBloom, uv).rgb;

  // halation: the red-shifted glow real film gets around hot highlights
  vec3 hal = bloom * uHalationTint * uHalation;

  vec3 col = scene + bloom * uBloomStrength + hal;

  // ---- distance haze (this is what sells "Alien: Isolation dark") ----
  {
    float d = texture(tDepth, uv).r;
    float ndc = d * 2.0 - 1.0;
    float linZ = (2.0 * uNear * uFar) / (uFar + uNear - ndc * (uFar - uNear));
    float f = 1.0 - exp(-linZ * uHazeAmount);
    if (d >= 0.999999) f = 1.0 - exp(-uFar * uHazeAmount);
    col = mix(col, uHazeColor, clamp(f, 0.0, 1.0));
  }

  col *= uExposure;

  // ---- tonemap ----
  /**
   * ---- TONEMAP, AND A CHROMA-RECOVERY TERM ON TOP OF IT ---------------------------------
   *
   * ⚠ **uToneChroma DEFAULTS TO 0 AND AT 0 THIS IS EXACTLY acesFitted(col).** Every piece
   * in this project shares this pass, so the term is authored to be a literal no-op unless a
   * grade asks for it.
   *
   * WHY IT EXISTS. room.ballroom's round 18 matched the reference's LUMINANCE ladder decile
   * for decile and could not match the shape of its CHROMA ladder. The bar's chroma is nearly
   * FLAT from decile 2 to decile 9 (0.40 down to 0.34); this room's RAMPS (0.90 down to 0.10).
   * Ten global terms were swept at that — the bounce fills, the sun, the environment's candle
   * boxes and its ambient, the toe, the haze, the split tone, the drape, the cornice — and
   * every one of them ROTATES the ladder, because a global multiply or tint cannot change a
   * slope. Deciles 2-3 sit above the bar and 5-8 now sit below it, so pulling either end
   * further costs the other.
   *
   * The slope has a cause, and it is here. ACES is fitted in a colour space where increasing
   * luminance pulls the result toward the white point, so it desaturates highlights hard — and
   * nothing downstream puts any of it back. That is a property of the TONEMAPPER, not of any
   * light or material in the room, which is why nothing in the room could fix it.
   *
   * WHAT THIS DOES. Tonemap the LUMINANCE and keep the input's chroma ratio, then blend that
   * against plain ACES. At 1.0 the hue and saturation of the scene survive tonemapping intact,
   * which is garish on real highlights; the useful range is small.
   */
  vec3 preTone = col;
  col = acesFitted(col);
  if (uToneChroma > 0.0) {
    float pl = max(lumaW(preTone), 1e-4);
    // the scene's own colour, rescaled to the luminance the tonemapper chose for it
    vec3 keepChroma = clamp(preTone * (lumaW(col) / pl), 0.0, 1.0);
    col = mix(col, keepChroma, uToneChroma);
  }

  // ---- grade ----
  float L = lumaW(col);
  // split toning
  float sw = pow(1.0 - clamp(L, 0.0, 1.0), 2.0);
  float hw = pow(clamp(L, 0.0, 1.0), 1.5);
  col *= mix(vec3(1.0), uShadowTint,    sw * uSplitBalance);
  col *= mix(vec3(1.0), uHighlightTint, hw * uSplitBalance);

  col = lgg(col);
  col = mix(vec3(lumaW(col)), col, uSaturation);
  col = (col - 0.5) * uContrast + 0.5;

  // toe crush — pull the darkest values to true black so shadows read as void,
  // which is the single biggest difference between "dark game" and "grey game"
  col = max(col - uToeCrush, vec3(0.0)) / max(1.0 - uToeCrush, 1e-3);

  // ---- vignette ----
  {
    vec2 v = centred;
    v.x *= mix(1.0, uResolution.x / uResolution.y, uVignetteRound);
    float d = length(v) * 1.4142;
    col *= mix(1.0, smoothstep(1.05, 0.25, d), uVignette);
  }

  // ---- grain: luminance-weighted, coarser than a pixel ----
  {
    vec2 gp = floor(uv * uResolution / max(uGrainSize, 1.0));
    float n = h21(gp + uGrainPhase * 511.0) - 0.5;
    float w = uGrain * (1.0 - 0.65 * lumaW(col));
    col += n * w;
  }

  // ordered dither to stop 8-bit banding in the near-black
  {
    float dth = h21(uv * uResolution) - 0.5;
    col += dth / 255.0;
  }

  oCol = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

// FXAA 3.11 (console-quality preset) + AMD FidelityFX CAS sharpen in one pass.
export const AA_CAS_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
layout(location = 0) out vec4 oCol;

uniform sampler2D tSrc;
uniform vec2  uTexel;
uniform float uSharpen;
uniform float uFxaa;

float lum(vec3 c){ return c.g * 1.963211 + c.r * 0.374410 + c.b * 0.0; }

vec3 fxaa(vec2 uv){
  vec3 rgbM = texture(tSrc, uv).rgb;
  vec3 rgbNW = texture(tSrc, uv + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 rgbNE = texture(tSrc, uv + vec2( 1.0, -1.0) * uTexel).rgb;
  vec3 rgbSW = texture(tSrc, uv + vec2(-1.0,  1.0) * uTexel).rgb;
  vec3 rgbSE = texture(tSrc, uv + vec2( 1.0,  1.0) * uTexel).rgb;

  float lM = lum(rgbM), lNW = lum(rgbNW), lNE = lum(rgbNE), lSW = lum(rgbSW), lSE = lum(rgbSE);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  float range = lMax - lMin;
  if (range < max(0.0312, lMax * 0.125)) return rgbM;

  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float dirReduce = max((lNW + lNE + lSW + lSE) * 0.25 * 0.03125, 1.0/128.0);
  float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
  dir = clamp(dir * rcpDirMin, vec2(-8.0), vec2(8.0)) * uTexel;

  vec3 rgbA = 0.5 * (texture(tSrc, uv + dir * (1.0/3.0 - 0.5)).rgb +
                     texture(tSrc, uv + dir * (2.0/3.0 - 0.5)).rgb);
  vec3 rgbB = rgbA * 0.5 + 0.25 * (texture(tSrc, uv - dir * 0.5).rgb +
                                   texture(tSrc, uv + dir * 0.5).rgb);
  float lB = lum(rgbB);
  return (lB < lMin || lB > lMax) ? rgbA : rgbB;
}

void main(){
  vec3 c = (uFxaa > 0.5) ? fxaa(vUv) : texture(tSrc, vUv).rgb;

  if (uSharpen > 0.001){
    // CAS: contrast-adaptive sharpening on the 3x3 cross
    vec3 a = texture(tSrc, vUv + vec2( 0,-1) * uTexel).rgb;
    vec3 b = texture(tSrc, vUv + vec2(-1, 0) * uTexel).rgb;
    vec3 d = texture(tSrc, vUv + vec2( 1, 0) * uTexel).rgb;
    vec3 e = texture(tSrc, vUv + vec2( 0, 1) * uTexel).rgb;
    vec3 mn = min(c, min(min(a,b), min(d,e)));
    vec3 mx = max(c, max(max(a,b), max(d,e)));
    vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
    vec3 w = -amp * (uSharpen * 0.2 + 0.02);
    vec3 sum = (a + b + d + e) * w + c;
    vec3 rcp = 1.0 / (1.0 + 4.0 * w);
    c = clamp(sum * rcp, 0.0, 1.0);
  }
  oCol = vec4(c, 1.0);
}
`;
