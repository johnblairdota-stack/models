import * as THREE from 'three';
import { NOISE_GLSL } from './glsl-noise.js';

/**
 * GPU procedural material baker.
 *
 * You write ONE function per surface:
 *
 *   void surface(in vec2 uv, out Surf s)
 *
 * where Surf carries albedo / roughness / metalness / ao / height. The baker calls it
 * five times per texel (centre + 4 gradient taps) inside a single multiple-render-target
 * pass and emits three RGBA8 textures:
 *
 *   0  albedo            sRGB
 *   1  ORM               r=ao  g=roughness  b=metalness      (glTF convention — three
 *                        reads aoMap.r, roughnessMap.g, metalnessMap.b, so one texture
 *                        serves all three slots)
 *   2  normal + height   rgb = tangent-space normal, a = height
 *
 * Deriving the normal from extra evaluations of the *height function itself* rather than
 * from a stored 8-bit height buffer is what keeps fine detail — plaster tooth, wood
 * grain, marble vein relief — free of terracing.
 *
 * Bakes are cached by key, so a material requested from ten places costs one bake.
 */

const VERT = /* glsl */ `
precision highp float;
in vec3 position;
out vec2 vUv;
void main(){
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

function buildFragment(body, defines = '') {
  return /* glsl */ `
precision highp float;
in vec2 vUv;

layout(location = 0) out vec4 oAlbedo;
layout(location = 1) out vec4 oORM;
layout(location = 2) out vec4 oNormalHeight;

uniform vec2  uTexel;        // 1 / size
uniform float uNormalStrength;
uniform float uHeightScale;  // world-ish scale of height relative to one uv tile

${defines}
${NOISE_GLSL}

struct Surf {
  vec3  albedo;
  float roughness;
  float metalness;
  float ao;
  float height;      // 0..1
  // BREAK ORDER, 0..1. The order in which this texel gives way when the surface is
  // destroyed: 0 goes first, 1 last. Rides in the unused alpha of the ORM target, so a
  // destructible surface costs no extra texture. Left at 1.0 it means "never breaks",
  // which is what every non-destructible surface wants, so existing surfaces are
  // unaffected. Consumed by applyBreakMask() — see materials/breakmask.js.
  float breakOrder;
};

Surf defaultSurf(){
  Surf s;
  s.albedo     = vec3(0.5);
  s.roughness  = 0.5;
  s.metalness  = 0.0;
  s.ao         = 1.0;
  s.height     = 0.5;
  s.breakOrder = 1.0;
  return s;
}

${body}

float heightAt(vec2 uv){
  Surf s = defaultSurf();
  surface(uv, s);
  return s.height;
}

void main(){
  vec2 uv = vUv;

  Surf s = defaultSurf();
  surface(uv, s);

  // analytic-ish gradient from four extra evaluations of the height field
  float e = 1.0;
  float hL = heightAt(uv - vec2(uTexel.x, 0.0) * e);
  float hR = heightAt(uv + vec2(uTexel.x, 0.0) * e);
  float hD = heightAt(uv - vec2(0.0, uTexel.y) * e);
  float hU = heightAt(uv + vec2(0.0, uTexel.y) * e);

  // dh/duv in height units per uv unit, then scaled to a surface slope
  float dx = (hR - hL) * 0.5 / uTexel.x;
  float dy = (hU - hD) * 0.5 / uTexel.y;
  vec3 n = normalize(vec3(-dx * uHeightScale * uNormalStrength,
                          -dy * uHeightScale * uNormalStrength,
                          1.0));

  oAlbedo       = vec4(sat3(s.albedo), 1.0);
  oORM          = vec4(sat(s.ao), sat(s.roughness), sat(s.metalness), sat(s.breakOrder));
  oNormalHeight = vec4(n * 0.5 + 0.5, sat(s.height));
}
`;
}

export class MaterialBaker {
  constructor(renderer) {
    this.renderer = renderer;
    this.cache = new Map();
    this._quad = new THREE.BufferGeometry();
    this._quad.setAttribute('position', new THREE.BufferAttribute(
      new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this._scene = new THREE.Scene();
    this._camera = new THREE.Camera();
    this._mesh = new THREE.Mesh(this._quad, null);
    this._mesh.frustumCulled = false;
    this._scene.add(this._mesh);
    this.stats = { bakes: 0, hits: 0, bytes: 0, ms: 0 };
  }

  /**
   * @param {object} o
   * @param {string} o.key            cache key — must be unique per (shader, uniforms)
   * @param {string} o.surface        GLSL: void surface(in vec2 uv, inout Surf s){...}
   * @param {number} [o.size=512]
   * @param {object} [o.uniforms]     {name: value}
   * @param {string} [o.defines]      raw GLSL prepended (consts, helper fns)
   * @param {number} [o.normalStrength=1]
   * @param {number} [o.heightScale=0.04]  height range / uv-tile size, i.e. relief steepness
   * @param {number[]} [o.repeat=[1,1]]
   * @param {number} [o.anisotropy=4]
   * @returns {{map:THREE.Texture, orm:THREE.Texture, normalMap:THREE.Texture, size:number}}
   */
  bake(o) {
    const key = o.key;
    if (this.cache.has(key)) { this.stats.hits++; return this.cache.get(key); }

    const t0 = performance.now();
    const size = o.size ?? 512;
    const aniso = o.anisotropy ?? 4;

    const rt = new THREE.WebGLRenderTarget(size, size, {
      count: 3,
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      generateMipmaps: true,
      depthBuffer: false,
      stencilBuffer: false,
    });

    const uniforms = {
      uTexel: { value: new THREE.Vector2(1 / size, 1 / size) },
      uNormalStrength: { value: o.normalStrength ?? 1.0 },
      uHeightScale: { value: o.heightScale ?? 0.04 },
    };
    for (const [k, v] of Object.entries(o.uniforms ?? {})) uniforms[k] = { value: v };

    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: VERT,
      fragmentShader: buildFragment(o.surface, o.defines ?? ''),
      uniforms,
      depthTest: false,
      depthWrite: false,
    });

    const prevTarget = this.renderer.getRenderTarget();
    this._mesh.material = mat;
    this.renderer.setRenderTarget(rt);
    this.renderer.render(this._scene, this._camera);

    // ---- BAKE VALIDATION -------------------------------------------------------
    // A GLSL compile failure does not throw here. three logs to the console, the draw is
    // dropped, and the render target keeps its cleared contents — so the bake "succeeds"
    // and hands back an all-zero texture set. Downstream that is a pure black material
    // with metalness from a zeroed ORM, which looks like an unfinished asset rather than
    // a broken one. It cost this project a full critic round: a variable named `cast`
    // (a GLSL reserved word) silently turned every brass part on the oil lobber into a
    // black blob, and the critic reasonably reported it as missing geometry.
    //
    // Sampling four texels of the albedo is enough to catch it, costs one small readback
    // per bake (bakes happen once, at load), and turns a silent failure into a loud one.
    if (o.validate !== false) {
      const probe = new Uint8Array(4);
      let lit = false;
      for (const [px, py] of [[1, 1], [size >> 1, size >> 1], [size - 2, 1], [1, size - 2]]) {
        this.renderer.readRenderTargetPixels(rt, px, py, 1, 1, probe, 0);
        if (probe[0] || probe[1] || probe[2]) { lit = true; break; }
      }
      if (!lit) {
        this.renderer.setRenderTarget(prevTarget);
        mat.dispose();
        rt.dispose();
        throw new Error(
          `MaterialBaker: "${o.key}" baked a completely black albedo.\n` +
          `This almost always means the surface shader FAILED TO COMPILE — check the ` +
          `console for a GLSL error just above this.\n` +
          `Most common cause: a variable name that is a GLSL reserved word ` +
          `(cast, sample, filter, input, output, matrix, texture, image, buffer, ...).\n` +
          `If the surface really is meant to be black, pass validate: false.`);
      }
    }

    this.renderer.setRenderTarget(prevTarget);
    mat.dispose();

    const [albedo, orm, nrm] = rt.textures;

    albedo.colorSpace = THREE.SRGBColorSpace;
    orm.colorSpace = THREE.NoColorSpace;
    nrm.colorSpace = THREE.NoColorSpace;

    const rep = o.repeat ?? [1, 1];
    for (const t of rt.textures) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(rep[0], rep[1]);
      t.anisotropy = aniso;
      t.needsUpdate = true;
    }

    const out = { map: albedo, orm, normalMap: nrm, size, _rt: rt };
    this.cache.set(key, out);
    this.stats.bakes++;
    this.stats.bytes += size * size * 4 * 3 * 1.34; // + mip chain
    this.stats.ms += performance.now() - t0;
    return out;
  }

  /**
   * Bake and wire straight into a MeshStandardMaterial / MeshPhysicalMaterial.
   * `matOpts` are passed to the material constructor; texture slots are filled after.
   */
  standard(o, matOpts = {}, Ctor = THREE.MeshStandardMaterial) {
    const t = this.bake(o);
    const m = new Ctor({
      map: t.map,
      normalMap: t.normalMap,
      aoMap: t.orm,
      roughnessMap: t.orm,
      metalnessMap: t.orm,
      roughness: 1.0,
      metalness: 1.0,
      ...matOpts,
    });
    m.name = o.key;
    m.userData.bake = t;
    if (o.normalScale !== undefined) m.normalScale.setScalar(o.normalScale);
    return m;
  }

  /** Clone a baked material with different uv repeat without re-baking. */
  static reRepeat(material, rx, ry) {
    const m = material.clone();
    for (const slot of ['map', 'normalMap', 'aoMap', 'roughnessMap', 'metalnessMap']) {
      if (m[slot]) { m[slot] = m[slot].clone(); m[slot].repeat.set(rx, ry); m[slot].needsUpdate = true; }
    }
    return m;
  }

  dispose() {
    for (const v of this.cache.values()) v._rt.dispose();
    this.cache.clear();
    this._quad.dispose();
  }

  report() {
    return `baked ${this.stats.bakes} sets (${this.stats.hits} cache hits) · ` +
      `${(this.stats.bytes / 1048576).toFixed(1)} MB VRAM · ${this.stats.ms.toFixed(0)} ms`;
  }
}

/** Singleton wiring so any module can grab the baker without threading it through. */
let _baker = null;
export function initBaker(renderer) { _baker = new MaterialBaker(renderer); return _baker; }
export function baker() {
  if (!_baker) throw new Error('MaterialBaker not initialised — call initBaker(renderer) first');
  return _baker;
}
