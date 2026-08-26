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
uniform float uBakeDust;     // albedo desaturation toward its own luminance - see oAlbedo below

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

  // ---- DUST -----------------------------------------------------------------------
  // A shut-up room's surfaces are not the colour of the material, they are the colour of the
  // material under a decade of dust, and that is a DESATURATION rather than a darkening.
  //
  // Round 18 measured this against the bar at seventeen player-eye angles and it is the
  // round's finding. At MATCHED LUMINANCE the reference's shaded floor carries r-b 16.6 and
  // this room's 33.7; its shaded upper wall 27.4 against this room's 54.9. Exactly two to one,
  // on two unrelated surfaces. And it is not the lighting: with every chromatic light term
  // replaced by white directionals the room still ran (r-b)/L 1.05 through its second decile
  // against the bar's 0.40, so no fill colour, sun colour or environment tint can reach it.
  //
  // ⚠ IT ALSO IS NOT THE GRADE, AND BOTH GRADE KNOBS WERE TRIED. saturation scales the whole
  // ladder and the defect is a SHAPE — the bar's ladder is flat at 0.33-0.40 across deciles
  // 2-9 and this room's is a ramp from 1.14 down to 0.49 — so the cut that fixes the midtones
  // (0.70) still leaves the shade at 1.8x and costs the drapes and the gilding everywhere.
  // shadowTint, which is weighted by pow(1-L, 2) and so has the right shape, is a MULTIPLY
  // at splitBalance strength: [0.86, 0.97, 1.17], already an implausibly blue shadow, moved
  // the darkest decile 1.42 -> 1.32. The instrument has to be the albedo.
  //
  // ⚠ AND IT GOES HERE, IN THE BAKER, RATHER THAN INTO EACH SURFACE'S OWN COLOUR CONSTANTS.
  // Dust does not know which shader it landed on. Applied per material it would be a dozen
  // edits each with its own hand-fitted number and no way to move the room as a whole; applied
  // to s.albedo it desaturates the flecks, the joints, the stave drift and the patina
  // together, which is what a layer of dust actually does to a surface.
  //
  // ⚠ THE NAME IS uBakeDust AND NOT uDust FOR A REASON THAT COST A BOOT. This uniform is
  // injected into EVERY surface shader, so its name shares a namespace with every uniform any
  // of them declares — and marble.js already had a uDust of its own. The collision is a GLSL
  // 'redefinition' error, which does not throw: the draw is dropped, the bake hands back a
  // cleared texture, and the room comes up black. The validation twenty lines down is what
  // turned that into a loud failure instead of a silent one, which is exactly what it is for.
  // Anything added here in future wants the same uBake prefix.
  //
  // ⚠ uBakeDust MUST APPEAR IN THE CALLER'S CACHE KEY. bake() caches on o.key alone, so a
  // material baked dusty and then requested clean is served the dusty one — the same trap
  // documented on ballroomEnv's key and on applyPlanarReflection. Default 0.0, so every
  // caller that does not ask for dust is byte-identical.
  //
  // Toward the albedo's OWN luminance, so a dusty floor is the same brightness as a clean one
  // and the median-luminance gate does not move when this does.
  //
  // ⚠ AND IT IS WEIGHTED TO THE DARK END, WHICH IS NOT A REFINEMENT — IT IS THE MEASUREMENT.
  // Under the white-light probe this room runs (r-b)/L 1.26 / 0.98 / 0.75 through deciles 1-3
  // against the bar's 0.79 / 0.40 / 0.38, and 0.27 / 0.19 / 0.22 through 7-9 against its
  // 0.34 / 0.33 / 0.34 — too warm by two and a half at the bottom and ALREADY COOLER THAN THE
  // BAR at the top. A flat desaturation would fix the shade by making the highlights wrong.
  //
  // The dark end is where the warmth is because that is where these shaders put it: every one
  // of them derives its dark values by tinting the base colour warmer, not just darker
  // (PARQUET's joints are uOakDark * 0.35 at r/b 2.63; BOISERIE's dirt is uPaint * 0.58/0.54/
  // 0.46). Which is also the physical story, so the curve costs nothing to justify: dust is not
  // wiped out of the recesses, the pores and the joints, and the exposed high points are the
  // parts that get handled and polished. 30% strength by mid-grey, full strength in the dark.
  float aL = dot(s.albedo, vec3(0.2126, 0.7152, 0.0722));
  vec3 dusted = mix(s.albedo, vec3(aL),
                    uBakeDust * mix(1.0, 0.30, smoothstep(0.05, 0.45, aL)));
  oAlbedo       = vec4(sat3(dusted), 1.0);
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
   * @param {number} [o.bakeDust=0]   desaturate the albedo toward its own luminance, 0..1. A
   *                                  shut-up room is grey because it is dusty, not because its
   *                                  materials are grey. MUST be reflected in `o.key`.
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
      // ⚠ ANY CALLER PASSING THIS MUST ALSO PUT IT IN `o.key` — see the DUST block in the
      // fragment above. `bake()` caches on the key alone and will happily serve a dusty bake
      // to a caller that asked for a clean one.
      uBakeDust: { value: o.bakeDust ?? 0.0 },
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
