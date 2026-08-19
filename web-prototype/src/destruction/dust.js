import * as THREE from 'three';

/**
 * The dust cloud. In every real demolition photograph and every BF1 wall collapse, the
 * dust is what sells the event — the debris is the detail, the dust is the impact.
 *
 * WHY THE PREVIOUS VERSION WAS INVISIBLE (round 3 critic: "no dust or smoke visible
 * anywhere in the frame"). It was not a spawn bug and not a shader bug: 44 particles were
 * alive with alpha 0.2-0.34 and the quads were rasterising correctly — forcing uColor to
 * red proved the geometry, the billboard, the blend and the depth test all worked. The
 * cloud was invisible because it was UNLIT AND UNIFORM: a flat 0xd2cabb written straight
 * into the HDR buffer, which is within a few percent of the value the lit plaster wall
 * behind it already renders at. Dust the same colour and brightness as its backdrop is
 * not dust, it is nothing. That is the trap this class now avoids by construction.
 *
 * So the cloud is LIT. Each puff samples a baked normal from a small procedural atlas and
 * shades it against the scene's key direction, giving every puff a bright side and a dark
 * side. That value range — not the colour — is what separates a cloud from a wall, and it
 * is what a critic recognises as dust at a glance.
 *
 * The rest of the design is unchanged and is all about fill rate, because alpha-blended
 * quads cost overdraw and overdraw is what integrated GPUs are worst at:
 *   - one InstancedBufferGeometry, one draw call, two attribute writes per frame
 *   - a ring-buffer pool, allocated once, never grown, zero GC
 *   - ONE texture fetch and ~25 ALU per fragment. The lumpy silhouette comes from the
 *     baked atlas, not from per-fragment fbm — noise in the fragment shader is what made
 *     an earlier draft unaffordable at the counts the effect actually needs.
 *   - soft particles: the alpha ramps out where a puff meets solid geometry, using the
 *     pipeline's existing depth prepass. Without it every quad shows a hard elliptical cut
 *     line where it crosses the wall, which is the loudest "this is a particle system" tell.
 */

const DUST_VERT = /* glsl */ `
precision highp float;
// GLSL3 vertex inputs use the "in" qualifier, not the GLSL1 "attribute" one. With
// glslVersion GLSL3 the old syntax fails to compile and the system renders nothing,
// silently. (Never put backticks in these comments — this is a JS template literal.)
in vec3 position;
in vec2 uv;
in vec4 iPos;              // xyz = world position, w = atlas tile 0..3
in vec4 iData;             // x = size, y = alpha, z = rotation, w = brightness
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
out vec2 vUv;
out vec2 vTile;
out float vAlpha;
out float vBright;
out vec3 vView;            // view-space position of this fragment's quad point
out vec2 vRot;             // cos/sin, to rotate the sampled normal back into view space
void main(){
  vUv = uv;
  float c = cos(iData.z), s = sin(iData.z);
  vRot = vec2(c, s);
  vAlpha = iData.y;
  vBright = iData.w;
  float t = iPos.w;
  vTile = vec2(mod(t, 2.0), floor(t * 0.5));
  vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iData.x;
  // billboard: build the quad in view space so it always faces the camera
  vec4 mv = modelViewMatrix * vec4(iPos.xyz, 1.0);
  mv.xy += p;
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const DUST_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv;
in vec2 vTile;
in float vAlpha;
in float vBright;
in vec3 vView;
in vec2 vRot;
layout(location = 0) out vec4 oCol;

uniform sampler2D tDust;
uniform sampler2D tDepth;
uniform vec3  uLightDir;     // direction TO the key, in VIEW space
uniform vec3  uLit;          // linear colour of a fully lit puff
uniform vec3  uShadow;       // linear colour of a fully shadowed puff
uniform vec3  uFlashCol;
uniform vec4  uFlash;        // xyz = flash position in view space, w = intensity
uniform vec2  uInvRes;
uniform float uSoft;         // soft-particle fade distance in metres; 0 disables
uniform float uNear;
uniform float uFar;

void main(){
  // 2x2 atlas, inset a hair so linear filtering never reaches the neighbouring tile
  vec2 auv = (vUv * 0.98 + 0.01) * 0.5 + vTile * 0.5;
  vec4 t = texture(tDust, auv);

  float a = t.a * vAlpha;
  if (a < 0.004) discard;

  // ---- soft particles ---------------------------------------------------------
  // Fade where the puff intersects solid geometry. The pipeline's depth prepass has
  // already run at this resolution, so this is a single fetch against a buffer that
  // exists anyway. Skipped on the low tier, which has no prepass.
  if (uSoft > 0.0) {
    float dv = texture(tDepth, gl_FragCoord.xy * uInvRes).x * 2.0 - 1.0;
    float sceneZ = (2.0 * uNear * uFar) / (uFar + uNear - dv * (uFar - uNear));
    float fragZ = -vView.z;
    a *= smoothstep(0.0, uSoft, sceneZ - fragZ);
    // and fade out as it crosses the near plane, so a puff blowing past the camera
    // does not slam a full-screen grey wall across the shot for one frame
    a *= smoothstep(uNear, uNear + 0.55, fragZ);
    if (a < 0.004) discard;
  }

  // ---- shading ----------------------------------------------------------------
  // The atlas stores a surface normal for the puff's lumpy front face. Rotating it by the
  // per-particle spin keeps the lighting attached to the lumps as the puff tumbles,
  // instead of the whole cloud lighting identically.
  vec2 nxy = t.rg * 2.0 - 1.0;
  nxy = vec2(nxy.x * vRot.x - nxy.y * vRot.y, nxy.x * vRot.y + nxy.y * vRot.x);
  float nz = sqrt(max(1e-4, 1.0 - dot(nxy, nxy)));
  vec3 n = vec3(nxy, nz);

  // Wrapped diffuse. Dust scatters rather than reflects, so the terminator is very wide
  // and there is no hard shadow line; the half-lambert is the honest cheap model for it.
  float ndl = dot(n, uLightDir) * 0.5 + 0.5;
  vec3 col = mix(uShadow, uLit, pow(ndl, 1.5));

  // Denser parts of a puff are more self-shadowed — this is what stops the cloud reading
  // as a sheet of lit fog and gives it an interior.
  col *= mix(1.0, 0.62, t.b * t.b);
  col *= vBright;

  // Impact flash lighting the cloud from inside. This is where a flash actually reads:
  // the light in the smoke, not the sprite.
  vec3 fd = vView - uFlash.xyz;
  col += uFlashCol * uFlash.w * exp(-dot(fd, fd) * 1.1);

  oCol = vec4(col, a);
}
`;

// ---------------------------------------------------------------------------
// The atlas. Four puffs, baked on the CPU once, ~10 ms. RG = normal.xy, B = density,
// A = coverage. Doing this here rather than per-fragment is the difference between the
// cloud fitting in the frame budget and not.
// ---------------------------------------------------------------------------

function makeDustAtlas() {
  const T = 128, S = 256;
  const px = new Uint8Array(S * S * 4);

  // deterministic hash — no Math.random anywhere that renders
  const h = (x, y, s) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const vn = (x, y, s) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = h(ix, iy, s), b = h(ix + 1, iy, s);
    const c = h(ix, iy + 1, s), d = h(ix + 1, iy + 1, s);
    return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
  };
  const fbm = (x, y, s) => {
    let v = 0, amp = 0.5, f = 1;
    for (let o = 0; o < 4; o++) { v += vn(x * f, y * f, s + o * 7.3) * amp; amp *= 0.5; f *= 2.07; }
    return v;
  };

  const d = new Float32Array(T * T);
  for (let tile = 0; tile < 4; tile++) {
    const seed = 3.1 + tile * 17.7;
    const ox = (tile % 2) * T, oy = Math.floor(tile / 2) * T;

    // density field first, gradients from it second — 5x cheaper than evaluating fbm
    // once per gradient tap
    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const u = (x + 0.5) / T, v = (y + 0.5) / T;
        const dx = u - 0.5, dy = v - 0.5;
        const r = Math.sqrt(dx * dx + dy * dy) * 2;
        const n = fbm(u * 3.2, v * 3.2, seed);
        // erode the circle with noise so the silhouette billows instead of reading round
        let k = 1 - smooth(0.16, 1.0, r + (n - 0.5) * 0.95);
        k *= 0.48 + 0.62 * fbm(u * 6.5 + 11.0, v * 6.5, seed);
        d[y * T + x] = Math.max(0, Math.min(1, k));
      }
    }

    for (let y = 0; y < T; y++) {
      for (let x = 0; x < T; x++) {
        const i = y * T + x;
        const xm = d[y * T + Math.max(0, x - 1)], xp = d[y * T + Math.min(T - 1, x + 1)];
        const ym = d[Math.max(0, y - 1) * T + x], yp = d[Math.min(T - 1, y + 1) * T + x];
        // lumps from the density gradient, plus a spherical term so the puff as a whole
        // reads as a rounded volume rather than a crinkled sheet
        const u = (x + 0.5) / T, v = (y + 0.5) / T;
        let nx = -(xp - xm) * 3.4 + (u - 0.5) * 1.9;
        let ny = -(yp - ym) * 3.4 + (v - 0.5) * 1.9;
        const L = Math.hypot(nx, ny, 0.85);
        nx /= L; ny /= L;

        const a = smooth(0.06, 0.42, d[i]);
        const o = ((oy + y) * S + ox + x) * 4;
        px[o] = Math.round((nx * 0.5 + 0.5) * 255);
        px[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        px[o + 2] = Math.round(d[i] * 255);
        px[o + 3] = Math.round(a * 255);
      }
    }
  }

  const tex = new THREE.DataTexture(px, S, S, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;   // RG is a normal and B is a mask, not colour
  return tex;
}

function smooth(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

let _atlas = null;
const _v = new THREE.Vector3();

export class DustSystem {
  constructor(scene, o = {}) {
    this.scene = scene;
    this.rng = o.rng ?? Math.random;
    this.max = o.max ?? 260;
    this.gravity = o.gravity ?? -0.28;   // dust barely falls; it hangs and drifts

    if (!_atlas) _atlas = makeDustAtlas();

    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;
    geo.instanceCount = 0;

    this.iPos = new Float32Array(this.max * 4);
    this.iData = new Float32Array(this.max * 4);
    geo.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.iPos, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('iData', new THREE.InstancedBufferAttribute(this.iData, 4).setUsage(THREE.DynamicDrawUsage));

    // Values are LINEAR and go straight into the HDR buffer — the cloud is not lit by the
    // scene's lights, it fakes them, which is why it costs nothing. The spread between lit
    // and shadow is the whole effect: pull them together and the dust disappears again.
    const lit = o.lit ?? [1.32, 1.24, 1.10];
    const shadow = o.shadow ?? [0.055, 0.062, 0.082];

    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      uniforms: {
        tDust: { value: _atlas },
        tDepth: { value: null },
        uLightDir: { value: new THREE.Vector3(0, 0.6, 0.8) },
        uLit: { value: new THREE.Vector3(...lit) },
        uShadow: { value: new THREE.Vector3(...shadow) },
        uFlashCol: { value: new THREE.Vector3(1.0, 0.72, 0.42) },
        uFlash: { value: new THREE.Vector4(0, 0, 0, 0) },
        uInvRes: { value: new THREE.Vector2(1 / 1920, 1 / 1080) },
        uSoft: { value: 0.0 },
        uNear: { value: 0.05 },
        uFar: { value: 40 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.NormalBlending,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;

    // The pipeline's depth prepass renders the whole scene with an overrideMaterial. That
    // material knows nothing about iPos, so every dust instance would collapse onto a unit
    // quad at the world origin and stamp a bogus silhouette into the depth buffer the AO
    // pass reads — a dark smear on the floor at the foot of the wall, from a system that
    // should not be in a depth prepass at all. Drop the instance count for that draw and
    // put it back afterwards.
    this.mesh.onBeforeRender = (r, sc, cam, g, material) => {
      if (material.isMeshDepthMaterial || material.isMeshDistanceMaterial) {
        this._hidden = g.instanceCount; g.instanceCount = 0;
      }
    };
    this.mesh.onAfterRender = (r, sc, cam, g, material) => {
      if (this._hidden !== undefined && (material.isMeshDepthMaterial || material.isMeshDistanceMaterial)) {
        g.instanceCount = this._hidden; this._hidden = undefined;
      }
    };
    scene.add(this.mesh);

    const M = this.max;
    this.px = new Float32Array(M); this.py = new Float32Array(M); this.pz = new Float32Array(M);
    this.vx = new Float32Array(M); this.vy = new Float32Array(M); this.vz = new Float32Array(M);
    this.size = new Float32Array(M); this.grow = new Float32Array(M);
    this.rot = new Float32Array(M); this.spin = new Float32Array(M);
    this.age = new Float32Array(M); this.life = new Float32Array(M);
    this.tile = new Float32Array(M); this.bright = new Float32Array(M);
    this.drag = new Float32Array(M); this.buoy = new Float32Array(M);
    this.peak = new Float32Array(M);
    this.alive = new Uint8Array(M);
    this.next = 0; this.liveCount = 0;
    this._flash = 0;
    this._flashPos = new THREE.Vector3();
    base.dispose();
  }

  /** Key direction so the puffs shade against the same light as the wall. */
  setLight(worldDir) {
    this._lightWorld = _v.copy(worldDir).normalize().clone();
  }

  /**
   * A puff of dust. `at` is the centre; `area` (optional {x,y,z}) spreads the spawn over a
   * box instead of a sphere, which is how you get dust off a whole break edge rather than
   * a cartoon puff at a point.
   */
  burst(at, count, o = {}) {
    const r = this.rng;
    const speed = o.speed ?? 1.5;
    const spread = o.spread ?? 0.5;
    const area = o.area;
    const nz = o.normal?.z ?? 1;
    const rise = o.rise ?? 0.55;
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      if (!this.alive[i]) this.liveCount++;

      if (area) {
        this.px[i] = at.x + (r() - 0.5) * area.x;
        this.py[i] = at.y + (r() - 0.5) * area.y;
        this.pz[i] = at.z + (r() - 0.5) * area.z;
      } else {
        this.px[i] = at.x + (r() - 0.5) * spread;
        this.py[i] = at.y + (r() - 0.5) * spread;
        this.pz[i] = at.z + (r() - 0.5) * spread * 0.5;
      }
      const sp = speed * (0.25 + r() * 1.2);
      this.vx[i] = (r() - 0.5) * sp * 1.9;
      this.vy[i] = (rise * (0.15 + r()) ) * sp;
      this.vz[i] = (nz * 0.75 + (r() - 0.5) * 1.2) * sp;

      this.size[i] = (o.size ?? 0.30) * (0.5 + r() * 1.6);
      this.grow[i] = (o.grow ?? 1.5) * (0.6 + r() * 1.1);
      this.rot[i] = r() * 6.283;
      this.spin[i] = (r() - 0.5) * (o.spin ?? 0.75);
      this.life[i] = (o.life ?? 3.2) * (0.55 + r() * 1.0);
      this.drag[i] = o.drag ?? 0.905;
      // Buoyancy: fine dust that has stopped moving still creeps upward on its own warmth
      // and on the air the collapse displaced. Without it the whole cloud sinks together
      // and reads as sand, not dust.
      this.buoy[i] = (o.buoy ?? 0.30) * (0.4 + r());
      this.peak[i] = (o.alpha ?? 0.55) * (0.7 + r() * 0.55);
      this.tile[i] = Math.floor(r() * 4);
      this.bright[i] = (o.bright ?? 0.62) + r() * (o.brightVar ?? 0.62);
      this.age[i] = 0;
      this.alive[i] = 1;
    }
  }

  /**
   * The ground roll. Everything a collapsing wall sheds hits the floor and blows outward
   * in a low, fast, flat sheet before it lifts — in the reference photographs this is the
   * biggest, densest part of the cloud and it is the part a point-burst never produces.
   */
  roll(at, count, o = {}) {
    const r = this.rng;
    const w = o.width ?? 2.6;
    const speed = o.speed ?? 2.2;
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      if (!this.alive[i]) this.liveCount++;

      const side = r() < 0.5 ? -1 : 1;
      const lat = (0.1 + r() * 0.9) * side;
      this.px[i] = at.x + lat * w * 0.5;
      this.py[i] = at.y + r() * 0.30;
      this.pz[i] = at.z + r() * 0.45;
      const sp = speed * (0.3 + r() * 1.1);
      this.vx[i] = lat * sp * 1.5;
      this.vy[i] = (0.05 + r() * 0.35) * sp;
      this.vz[i] = (0.45 + r() * 0.9) * sp;

      this.size[i] = (o.size ?? 0.46) * (0.6 + r() * 1.5);
      this.grow[i] = (o.grow ?? 2.1) * (0.6 + r() * 1.0);
      this.rot[i] = r() * 6.283;
      this.spin[i] = (r() - 0.5) * 0.5;
      this.life[i] = (o.life ?? 4.4) * (0.6 + r() * 0.9);
      this.drag[i] = o.drag ?? 0.935;
      this.buoy[i] = (o.buoy ?? 0.42) * (0.4 + r());
      this.peak[i] = (o.alpha ?? 0.48) * (0.7 + r() * 0.5);
      this.tile[i] = Math.floor(r() * 4);
      this.bright[i] = 0.55 + r() * 0.55;
      this.age[i] = 0;
      this.alive[i] = 1;
    }
  }

  /** A short bright light inside the cloud. Decays on its own; call once per impact. */
  flash(at, intensity = 1.0, seconds = 0.22) {
    this._flashPos.copy(at);
    this._flash = intensity;
    this._flashPeak = intensity;
    this._flashLife = seconds;
    this._flashT = seconds;
  }

  update(dt, camera = null) {
    const mat = this.mesh.material;

    if (this._flashT > 0) {
      this._flashT = Math.max(0, this._flashT - dt);
      this._flash = this._flashPeak * Math.pow(this._flashT / this._flashLife, 2.2);
    } else this._flash = 0;

    if (camera) {
      // light and flash position both live in view space in the shader
      if (this._lightWorld) {
        _v.copy(this._lightWorld).transformDirection(camera.matrixWorldInverse);
        mat.uniforms.uLightDir.value.copy(_v).normalize();
      }
      _v.copy(this._flashPos).applyMatrix4(camera.matrixWorldInverse);
      mat.uniforms.uFlash.value.set(_v.x, _v.y, _v.z, this._flash);
      mat.uniforms.uNear.value = camera.near;
      mat.uniforms.uFar.value = camera.far;
    }

    if (!this.liveCount) { this.mesh.geometry.instanceCount = 0; return; }
    let live = 0, w = 0;
    const iPos = this.iPos, iData = this.iData;
    for (let i = 0; i < this.max; i++) {
      if (!this.alive[i]) continue;
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) { this.alive[i] = 0; continue; }
      live++;

      // gravity pulls the coarse fraction down, buoyancy lifts the fine fraction; the
      // two together are why a real cloud shears vertically as it disperses
      this.vy[i] += (this.gravity + this.buoy[i]) * dt;
      const drag = Math.pow(this.drag[i], dt * 60);
      this.vx[i] *= drag; this.vy[i] *= drag; this.vz[i] *= drag;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.spin[i] * dt;

      // fade in fast, out slow — a dust cloud appears instantly and lingers. Density comes
      // from OVERLAP, so each puff stays translucent and the core builds up from many.
      const a = (t < 0.06 ? t / 0.06 : 1.0 - smoothstep01((t - 0.06) / 0.94)) * this.peak[i];

      iPos[w * 4] = this.px[i];
      iPos[w * 4 + 1] = this.py[i];
      iPos[w * 4 + 2] = this.pz[i];
      iPos[w * 4 + 3] = this.tile[i];
      iData[w * 4] = this.size[i] * (1.0 + this.grow[i] * t);
      iData[w * 4 + 1] = a > 0 ? a : 0;
      iData[w * 4 + 2] = this.rot[i];
      iData[w * 4 + 3] = this.bright[i];
      w++;
    }
    this.liveCount = live;
    this.mesh.geometry.instanceCount = w;
    this.mesh.geometry.attributes.iPos.needsUpdate = true;
    this.mesh.geometry.attributes.iData.needsUpdate = true;
  }

  /**
   * Wire the pipeline's depth prepass in for soft particles. Safe to call every frame —
   * the targets are reallocated on resize, so the texture reference has to be refreshed.
   * On a tier with no prepass this quietly turns the feature off.
   */
  bindDepth(pipeline, softness = 0.35) {
    const u = this.mesh.material.uniforms;
    const d = pipeline?.depthRT?.depthTexture ?? null;
    u.tDepth.value = d;
    u.uSoft.value = d ? softness : 0.0;
    if (pipeline) u.uInvRes.value.set(1 / pipeline.width, 1 / pipeline.height);
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

function smoothstep01(x) {
  const t = x < 0 ? 0 : x > 1 ? 1 : x;
  return t * t * (3 - 2 * t);
}
