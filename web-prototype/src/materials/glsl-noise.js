// Shared GLSL noise / pattern library, injected into every procedural bake shader.
// Everything here is deterministic from a seed so a baked texture is byte-identical
// across runs — critics compare screenshots, so drift is not acceptable.

export const NOISE_GLSL = /* glsl */ `
#ifndef RRR_NOISE
#define RRR_NOISE

const float PI  = 3.141592653589793;
const float TAU = 6.283185307179586;

// ---------- hashes (Dave Hoskins style, integer-free for wide GPU support) ----------
float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

vec3 hash33(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// ---------- value + gradient noise ----------
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i + vec2(0,0)), hash12(i + vec2(1,0)), u.x),
             mix(hash12(i + vec2(0,1)), hash12(i + vec2(1,1)), u.x), u.y);
}

float gnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(i + vec2(0,0)) * 2.0 - 1.0, f - vec2(0,0));
  float b = dot(hash22(i + vec2(1,0)) * 2.0 - 1.0, f - vec2(1,0));
  float c = dot(hash22(i + vec2(0,1)) * 2.0 - 1.0, f - vec2(0,1));
  float d = dot(hash22(i + vec2(1,1)) * 2.0 - 1.0, f - vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y) * 0.7071 + 0.5;
}

// tileable gradient noise — wraps exactly at 'period', which every texture needs
float gnoiseT(vec2 p, float period){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 i0 = mod(i,               period);
  vec2 i1 = mod(i + vec2(1,0),   period);
  vec2 i2 = mod(i + vec2(0,1),   period);
  vec2 i3 = mod(i + vec2(1,1),   period);
  float a = dot(hash22(i0) * 2.0 - 1.0, f - vec2(0,0));
  float b = dot(hash22(i1) * 2.0 - 1.0, f - vec2(1,0));
  float c = dot(hash22(i2) * 2.0 - 1.0, f - vec2(0,1));
  float d = dot(hash22(i3) * 2.0 - 1.0, f - vec2(1,1));
  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y) * 0.7071 + 0.5;
}

// ---------- fbm family ----------
float fbm(vec2 p, int oct, float lac, float gain){
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 12; i++){
    if (i >= oct) break;
    s += a * gnoise(p); n += a; p *= lac; a *= gain;
  }
  return s / max(n, 1e-5);
}

float fbmT(vec2 p, float period, int oct, float lac, float gain){
  float a = 0.5, s = 0.0, n = 0.0, per = period;
  for (int i = 0; i < 12; i++){
    if (i >= oct) break;
    s += a * gnoiseT(p, per); n += a;
    p *= lac; per *= lac; a *= gain;
  }
  return s / max(n, 1e-5);
}

float ridged(vec2 p, float period, int oct){
  float a = 0.5, s = 0.0, n = 0.0, per = period;
  for (int i = 0; i < 10; i++){
    if (i >= oct) break;
    float v = abs(gnoiseT(p, per) * 2.0 - 1.0);
    v = 1.0 - v; v *= v;
    s += a * v; n += a;
    p *= 2.0; per *= 2.0; a *= 0.5;
  }
  return s / max(n, 1e-5);
}

float billow(vec2 p, float period, int oct){
  float a = 0.5, s = 0.0, n = 0.0, per = period;
  for (int i = 0; i < 10; i++){
    if (i >= oct) break;
    s += a * abs(gnoiseT(p, per) * 2.0 - 1.0); n += a;
    p *= 2.0; per *= 2.0; a *= 0.5;
  }
  return s / max(n, 1e-5);
}

// ---------- domain warp: the workhorse for marble and plaster ----------
vec2 warp(vec2 p, float period, float amt, int oct){
  vec2 q = vec2(fbmT(p, period, oct, 2.0, 0.5),
                fbmT(p + vec2(5.2, 1.3), period, oct, 2.0, 0.5));
  return p + (q * 2.0 - 1.0) * amt;
}

// ---------- voronoi / worley ----------
// returns (F1, F2, cellId)
vec3 voronoiT(vec2 p, float period){
  vec2 n = floor(p), f = fract(p);
  float f1 = 8.0, f2 = 8.0, id = 0.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++){
    vec2 g = vec2(float(i), float(j));
    vec2 cell = mod(n + g, period);
    vec2 o = hash22(cell);
    float d = length(g + o - f);
    if (d < f1){ f2 = f1; f1 = d; id = hash12(cell); }
    else if (d < f2){ f2 = d; }
  }
  return vec3(f1, f2, id);
}

// ---------- shapes ----------
float sdBox(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d,0.0)) + min(max(d.x,d.y),0.0); }
float sdRound(vec2 p, vec2 b, float r){ return sdBox(p, b - r) - r; }
float sdSeg(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa,ba)/dot(ba,ba), 0.0, 1.0);
  return length(pa - ba*h);
}
float sdEllipse(vec2 p, vec2 r){ return (length(p/r) - 1.0) * min(r.x, r.y); }

mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c,-s,s,c); }

// ---------- utility ----------
float smoothstep3(float e0, float e1, float x){ return smoothstep(e0, e1, x); }
float remap(float v, float a, float b, float c, float d){ return c + (v - a) * (d - c) / (b - a); }
float sat(float v){ return clamp(v, 0.0, 1.0); }
vec3  sat3(vec3 v){ return clamp(v, 0.0, 1.0); }

// sRGB <-> linear (bakes author colours in sRGB, outputs linear where needed)
vec3 srgb2lin(vec3 c){ return pow(c, vec3(2.2)); }
vec3 lin2srgb(vec3 c){ return pow(c, vec3(1.0/2.2)); }

// perceptual luma
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// triangle wave / repeats
float tri(float x){ return abs(fract(x) * 2.0 - 1.0); }
vec2  pmod(vec2 p, vec2 s){ return mod(p + 0.5*s, s) - 0.5*s; }

// stable per-cell jitter for brick/plank layouts
// returns cellCoord in .xy, local uv in .zw
vec4 rowGrid(vec2 uv, vec2 counts, float rowOffset){
  float row = floor(uv.y * counts.y);
  float xo  = fract(row * rowOffset);
  float x   = uv.x + xo;
  float col = floor(x * counts.x);
  vec2 local = vec2(fract(x * counts.x), fract(uv.y * counts.y));
  return vec4(col, row, local);
}

#endif
`;
