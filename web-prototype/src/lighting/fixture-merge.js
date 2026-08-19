import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * MERGE THE PRACTICALS BEFORE BRINGING ANY OF THEM INTO THE GAME.
 *
 * 🚨 `estate-spike-1` measured the showcase gallery's practical rig at **+184 draw calls** at
 * `gallery.mid` and **+232** at `chapel.centre`, against a **625** ceiling — one room, and the
 * budget is gone. The cause is not the lights and it is not the triangles: the rig is ~138
 * separate `Mesh` objects (12 picture lights x 3 parts, 10 sconces, a candelabra, 21 clerestory
 * glow decals, 12 picture glows, 3 haze patches) and **a draw call is per MESH, not per
 * material** — sharing `mats.brass` across forty objects saves nothing at all.
 *
 * The architecture never had this problem because `GeoBin` merges it. This file is `GeoBin` for
 * the things `GeoBin` cannot take: geometry whose material is not a bin key, because it is
 * additive, or emissive, or a per-instance `ShaderMaterial`.
 *
 * ~138 objects become **five**:
 *
 *     brass        every hood, arm, drip pan, back plate and stem      1 mesh
 *     wax          every candle stub                                   1 mesh
 *     emissive     every hot core and picture-light strip              1 mesh, vertex colours
 *     flame        every flame, additively blended                     1 mesh, vertex colours
 *     glow         every glow decal                                    1 mesh, ONE shader
 *
 * ⚠️ **THE GLOW BUCKET IS THE BIG ONE AND THE REASON IS SUBTLE.** `volumetric.js` `glowPatch()`
 * builds a NEW `ShaderMaterial` per call — so forty-five decals are forty-five programs' worth
 * of state changes and forty-five draws, even though every one of them evaluates the same four
 * lines. Here the per-decal colour, strength and falloff move into VERTEX ATTRIBUTES, so one
 * material and one merged mesh draw the lot.
 *
 * ⚠️ **WHAT IS HONESTLY LOST: PER-FIXTURE FLICKER.** `practicals.js` registers one closure per
 * flame that scales that flame's own mesh. Merged, there is no per-flame mesh to scale. What
 * survives is a GLOBAL flicker driven through the shared materials (`flicker(t)` below), so the
 * room still breathes but every candle breathes together. That is a real reduction and it is
 * stated rather than buried: at 27 m, with the nearest sconce ~3 m away and bloom on top, the
 * cue a player reads is the room's luminance wobbling, not phase differences between two
 * candles 6 m apart. If a critic files it, the fix is a per-vertex phase attribute and a sine
 * in the vertex shader, which is one more attribute and no more draw calls.
 *
 * ⚠️ **MESHES ONLY. THE LIGHTS ARE A SEPARATE BUDGET AND THEY MUST NOT COME THROUGH HERE.**
 * `harvest()` returns any light it finds instead of baking it, because three's `projectObject`
 * skips a hidden subtree entirely — so a light parented under a space root is culled with the
 * room, `numPointLights` moves on every doorway, and `numPointLights` is part of three's program
 * cache key. That is the mechanism behind John's five-second freeze. Fixture MESHES go under the
 * space root (residency culls them, and that is 281 draw calls by the spike's own measurement);
 * LIGHTS go on the scene root at a CONSTANT count.
 */

/** Is this the per-instance shader `glowPatch()` builds? */
function isGlow(mat) {
  return !!(mat?.isShaderMaterial && mat.uniforms?.uColor && mat.uniforms?.uStrength
    && mat.uniforms?.uPow);
}

/** Strip a geometry down to the attribute set every bucket agrees on, so merging cannot fail. */
function normalise(geo, matrix) {
  const g = geo.clone();
  if (matrix) g.applyMatrix4(matrix);
  for (const a of Object.keys(g.attributes)) {
    if (a !== 'position' && a !== 'normal' && a !== 'uv') g.deleteAttribute(a);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    const n = g.attributes.position.count;
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  }
  if (!g.index) {
    const n = g.attributes.position.count;
    g.setIndex(Array.from({ length: n }, (_, i) => i));
  }
  return g;
}

function withColor(g, c) {
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.Float32BufferAttribute(arr, 3));
  return g;
}

export class FixtureBin {
  constructor() {
    this.brass = [];
    this.wax = [];
    this.emissive = [];
    this.flame = [];
    this.glow = [];
    /**
     * 🆕 **A SIXTH BUCKET, AND IT ONLY EXISTS IF A CALLER NAMES A MATERIAL FOR IT**
     * (`estate-3`). `crystalMat` is opted into by `harvest`'s third argument; with two arguments
     * nothing can ever match it, so the gallery's and the studies' merges are unchanged down to
     * the bucket count. It is here because the ballroom's three chandeliers are the one fixture
     * in this project whose material is neither brass, wax, an emissive core nor a decal — a
     * `MeshPhysicalMaterial` at metalness 0, ior 1.72, envMapIntensity 3.2 — and the
     * metalness>=0.85 fallback below would have swept every crystal in the room into WAX.
     */
    this.crystal = [];
    this.lights = [];
    this.harvested = 0;
    this.instances = 0;
  }

  /**
   * Walk a built practical (a `sconce()`, `candelabra()`, `pictureLight()`, `glowPatch()` …)
   * and bucket everything in it. The object is CONSUMED — its meshes are not usable afterwards.
   *
   * @param obj    the group as returned by `practicals.js`, already positioned/rotated
   * @param brassMat  the material passed to the builder, matched by reference. Anything
   *                  standard that is not this is treated as wax.
   */
  harvest(obj, brassMat = null, crystalMat = null) {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      if (o.isLight) { this.lights.push(o); return; }
      if (!o.isMesh || !o.geometry) return;
      const mat = o.material;
      this.harvested++;
      /**
       * 🚨 **AN `InstancedMesh` IS AN `isMesh` AND `matrixWorld` IS NOT ITS TRANSFORM.**
       * `normalise(geometry, matrixWorld)` on one bakes the GROUP transform and throws every
       * per-instance matrix away, so forty crystal drops collapse onto a single point — silently,
       * with no error and no missing object, just a fixture that looks wrong in a way nobody can
       * name. Nothing the gallery or the studies build is instanced, so this path is new with the
       * ballroom's chandeliers (drops, spears and beads are three `InstancedMesh`es EACH). They
       * are expanded and merged: a drop is ~24 triangles, so three fixtures' worth is a few
       * thousand — against three more draw calls per fixture if they were parented as they are.
       */
      if (o.isInstancedMesh) {
        const im = new THREE.Matrix4();
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, im);
          // a shattered/hidden instance is written as a zero matrix by `chandelier.js`
          if (im.elements[0] === 0 && im.elements[5] === 0 && im.elements[10] === 0) continue;
          this.instances++;
          this.bucketFor(mat, brassMat, crystalMat)
            .push(normalise(o.geometry, o.matrixWorld.clone().multiply(im)));
        }
        return;
      }
      if (isGlow(mat)) {
        const g = normalise(o.geometry, o.matrixWorld);
        const n = g.attributes.position.count;
        const col = mat.uniforms.uColor.value;
        const cArr = new Float32Array(n * 3);
        const pArr = new Float32Array(n * 2);
        const s = mat.uniforms.uStrength.value, p = mat.uniforms.uPow.value;
        for (let i = 0; i < n; i++) {
          cArr[i * 3] = col.r; cArr[i * 3 + 1] = col.g; cArr[i * 3 + 2] = col.b;
          pArr[i * 2] = s; pArr[i * 2 + 1] = p;
        }
        g.setAttribute('aColor', new THREE.Float32BufferAttribute(cArr, 3));
        g.setAttribute('aParam', new THREE.Float32BufferAttribute(pArr, 2));
        this.glow.push(g);
        return;
      }
      if (mat?.isMeshBasicMaterial) {
        const g = withColor(normalise(o.geometry, o.matrixWorld), mat.color);
        // Additive blending is the flame; everything else (the hot core, the picture light's
        // strip) writes depth like ordinary geometry and belongs in the opaque bucket.
        if (mat.blending === THREE.AdditiveBlending) this.flame.push(g);
        else this.emissive.push(g);
        return;
      }
      this.bucketFor(mat, brassMat, crystalMat).push(normalise(o.geometry, o.matrixWorld));
    });
    return this;
  }

  /** Which opaque bucket a standard/physical material belongs in. */
  bucketFor(mat, brassMat, crystalMat) {
    if (crystalMat && mat === crystalMat) return this.crystal;
    const isBrass = brassMat ? mat === brassMat
      : !!(mat?.isMeshStandardMaterial && (mat.metalness ?? 0) >= 0.85);
    return isBrass ? this.brass : this.wax;
  }

  /** Add a bare `glowPatch()` mesh (no group around it). Same bucket, same rules. */
  harvestGlow(mesh) { return this.harvest(mesh); }

  /**
   * @returns { meshes, flicker(t), stats } — `meshes` is at most five objects, and the caller
   *          parents them under whatever root residency should govern.
   */
  build(o = {}) {
    const meshes = [];
    const made = {};
    const one = (list, mat, name, order = 0) => {
      if (!list.length) return null;
      const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!geo) { console.warn('[fixture-merge] merge failed for', name); return null; }
      if (list.length > 1) for (const g of list) g.dispose();
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      m.name = `fixture:${name}`;
      m.renderOrder = order;
      meshes.push(m);
      made[name] = m;
      return m;
    };

    const brassMat = o.brass ?? new THREE.MeshStandardMaterial({
      color: 0x8e6a26, roughness: 0.34, metalness: 1.0,
    });
    const waxMat = o.wax ?? new THREE.MeshStandardMaterial({
      color: 0xe8dcc0, roughness: 0.62, metalness: 0,
    });
    const b = one(this.brass, brassMat, 'brass');
    if (b) { b.castShadow = o.castShadow ?? false; b.receiveShadow = true; }
    one(this.wax, waxMat, 'wax');
    // 🆕 Only exists when a caller named a crystal material — see the constructor.
    if (this.crystal.length && o.crystal) {
      const c = one(this.crystal, o.crystal, 'crystal');
      if (c) { c.castShadow = false; c.receiveShadow = false; }
    }

    // ONE material for every hot core and lamp strip in the room, with the per-object colour
    // carried in the vertex attribute. `toneMapped` stays true: these are HDR values (the core
    // is rgb 7.0/5.2/3.1) and the whole point is that the tonemap and bloom see them as such.
    const emisMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true });
    one(this.emissive, emisMat, 'emissive');

    const flameMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: true,
    });
    const fl = one(this.flame, flameMat, 'flame', 11);

    const glowMat = makeGlowMaterial();
    const gl = one(this.glow, glowMat, 'glow', 9);
    if (gl) { gl.castShadow = false; gl.receiveShadow = false; }

    /**
     * The global flicker. `flickerValue`'s shape is copied from `practicals.js` rather than
     * imported, because importing it would drag `registerFlicker`'s module-level array in with
     * it and that array is exactly what this file exists to stop feeding.
     */
    const flicker = (t) => {
      const a = Math.sin(t * 5.3) * 0.5 + Math.sin(t * 11.7 + 2.1) * 0.28
        + Math.sin(t * 23.1 + 3.7) * 0.14;
      const gust = Math.max(0, Math.sin(t * 0.9 + 1.3) - 0.86) * 6.0;
      const f = 1 + a * 0.085 - gust * 0.22;
      if (fl) flameMat.opacity = 0.72 + f * 0.24;
      // `material.color` multiplies the vertex colour, so one scalar dims every core at once
      // without touching a single vertex.
      if (made.emissive) emisMat.color.setScalar(0.86 + f * 0.16);
      glowMat.uniforms.uGain.value = 0.90 + f * 0.11;
    };

    return {
      meshes,
      flicker,
      stats: {
        harvested: this.harvested,
        instances: this.instances,
        meshes: meshes.length,
        lights: this.lights.length,
        tris: meshes.reduce((n, m) => n
          + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0),
      },
      lights: this.lights,
    };
  }
}

/**
 * The merged form of `glowPatch()`'s shader: identical falloff, but colour / strength / power
 * arrive per vertex so an arbitrary number of decals share one program and one draw.
 * `uGain` is the global flicker's only handle on this bucket.
 */
export function makeGlowMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      precision highp float;
      attribute vec3 aColor;
      attribute vec2 aParam;
      varying vec2 vUv;
      varying vec3 vCol;
      varying vec2 vPar;
      void main(){
        vUv = uv;
        vCol = aColor;
        vPar = aParam;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uGain;
      varying vec2 vUv;
      varying vec3 vCol;
      varying vec2 vPar;
      void main(){
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(max(0.0, 1.0 - d), vPar.y) * vPar.x * uGain;
        gl_FragColor = vec4(vCol * a, a);
      }`,
    uniforms: { uGain: { value: 1.0 } },
    transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: true, side: THREE.DoubleSide, toneMapped: true,
  });
}
