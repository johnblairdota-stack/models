import * as THREE from 'three';
import { FullScreenPass, rt } from './fsquad.js';
import { AO_FRAG, AO_BLUR_FRAG, BLOOM_DOWN_FRAG, BLOOM_UP_FRAG, COMPOSITE_FRAG, AA_CAS_FRAG } from './shaders.js';

/**
 * Render graph
 *
 *   1  depth                  the PREVIOUS frame's main-pass depth buffer  -> tDepth
 *                             (no prepass — see "TEMPORAL DEPTH" below)
 *   2  HBAO                   half res, from depth alone            -> tAO
 *   3  AO blur                separable, depth-aware, half res
 *   4  main pass              HDR RGBA16F. Every standard material is patched so its
 *                             INDIRECT term (irradiance + IBL) is multiplied by screen
 *                             AO. Direct light is untouched, which is the whole point —
 *                             multiplying the final image by AO is what makes cheap SSAO
 *                             look like dirt smeared on the lens.
 *   5  bloom                  6-mip progressive down/up, Karis-averaged first mip
 *   6  composite              haze -> exposure -> ACES -> grade -> vignette -> grain
 *   7  FXAA + CAS             and the upscale when dynamic resolution is below 1.0
 *
 * Dynamic resolution: the whole chain runs at `renderScale`, the final AA/CAS blit
 * upscales to the canvas. Held automatically against a frame-time budget.
 *
 * ---------------------------------------------------------------------------
 * TEMPORAL DEPTH — why there is no depth prepass any more
 * ---------------------------------------------------------------------------
 * AO has to be READY before the main pass shades, so it cannot consume the depth that
 * same pass produces. That circular dependency is the only reason a prepass ever
 * existed here, and it was expensive: `scene.overrideMaterial = MeshDepthMaterial`
 * plus a full `r.render(scene, camera)` is a SECOND traversal of the whole scene,
 * taking draw calls 238 -> 540 and costing ~1.5 ms of a 1.39 ms budget on `game.play`.
 *
 * It is broken by shading AO from the PREVIOUS frame's depth instead. The main pass
 * already writes a full-res depth texture (`sceneRT.depthTexture`), so the depth is
 * free; two scene targets are ping-ponged so frame N reads frame N-1's depth without
 * a read-write hazard. Cost is one frame of latency on AO.
 *
 * ⚠️ THREE THINGS THIS CHANGES, none of them accidents:
 *
 *  1. `uTexel` and the AO radius are UNTOUCHED, deliberately. The old `depthRT` and the
 *     new `sceneRT.depthTexture` are both full-res `w x h` UnsignedInt depth, so
 *     `normalFromDepth()`'s four neighbour taps land exactly where they always did.
 *     (Shrinking the depth source is the thing that would break them — see the note at
 *     the allocation site and the AO block in HANDOFF.md.)
 *
 *  2. AO now sees the BEAUTY depth buffer instead of an override-material one, and an
 *     override replaces the material outright — so the prepass forced `depthWrite` on
 *     for everything, defeating every `depthWrite:false`, every alpha discard, and
 *     every non-FrontSide material in the scene. Light shafts, dust quads, glow
 *     billboards and keyed decal planes were all punching solid occluders into the AO
 *     depth. `mat-robot.js:396` documents one of them at length: the chest decal's pale
 *     rectangle is that plane's own outline, written into the prepass by an override
 *     that discarded its discard. Those artifacts are gone by construction now.
 *
 *  3. Sky/void pixels: unchanged. Nothing in the estate scenes writes depth at the far
 *     plane in the beauty pass either, so the `d >= 0.999999` early-out still fires.
 *
 * `aoDepth: 'prepass'` restores the old path. It is kept ONLY so the ablation can be
 * re-run back to back in one session — absolute GPU numbers on this machine drift ~30%
 * with heat, so an A/B is the only sound measurement. `?aodepth=prepass`.
 */

export const GRADE_PRESETS = {
  // The house look: Alien: Isolation's blacks, Hitman Paris' warm gilt highlights.
  estate: {
    exposure: 1.0,
    bloomStrength: 0.055,
    bloomThreshold: 1.05,
    bloomSoftKnee: 0.6,
    bloomRadius: 1.0,
    halation: 0.045,
    halationTint: [1.0, 0.34, 0.16],
    ca: 0.0022,
    vignette: 0.62,
    vignetteRound: 0.85,
    grain: 0.030,
    grainSize: 1.6,
    lift: [0.004, 0.008, 0.016],
    gamma: [1.0, 1.0, 1.02],
    gain: [1.02, 1.0, 0.965],
    saturation: 1.06,
    contrast: 1.075,
    shadowTint: [0.80, 0.90, 1.10],
    highlightTint: [1.06, 1.005, 0.93],
    splitBalance: 0.55,
    toeCrush: 0.012,
    haze: 0.0075,
    hazeColor: [0.030, 0.038, 0.052],
    sharpen: 0.45,
    aoRadius: 0.65,
    aoIntensity: 1.35,
    aoBias: 0.035,
  },
  // Flat, neutral, no grade. For judging a material or a model on its own merits.
  studio: {
    exposure: 1.0,
    bloomStrength: 0.03, bloomThreshold: 1.3, bloomSoftKnee: 0.5, bloomRadius: 1.0,
    halation: 0.0, halationTint: [1, 0.4, 0.2],
    ca: 0.0, vignette: 0.14, vignetteRound: 0.9, grain: 0.0, grainSize: 1.0,
    lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1],
    saturation: 1.0, contrast: 1.0,
    shadowTint: [1, 1, 1], highlightTint: [1, 1, 1], splitBalance: 0.0, toeCrush: 0.0,
    haze: 0.0, hazeColor: [0, 0, 0],
    sharpen: 0.35,
    aoRadius: 0.4, aoIntensity: 1.0, aoBias: 0.03,
  },
};

// ---------------------------------------------------------------------------
// Material patch: multiply indirect light by screen-space AO.
// ---------------------------------------------------------------------------
/*
 * EXPORTED so a material can reuse the screen-space AO buffer as a CAVITY MASK rather than
 * only as a light multiplier — see `applyWeathering` in `materials/surfaces/robot.js`, which
 * needs to know where a pocket is in order to pool grime in it. Consumers bind these same
 * uniform OBJECTS under their own names, so nothing depends on `patchForScreenAO` having run
 * first and nothing collides with the declarations it injects. `uAOEnabled` is 0 until a
 * Pipeline with AO on has rendered, which is the correct fail-safe: no AO, no cavity term.
 */
export const AO_UNIFORMS = {
  tScreenAO: { value: null },
  uAOEnabled: { value: 0 },
  uAOResolution: { value: new THREE.Vector2(1, 1) },
};

const _patched = new WeakSet();

export function patchForScreenAO(material) {
  if (!material || _patched.has(material)) return material;
  if (!('roughness' in material) && !('shininess' in material)) return material;
  _patched.add(material);

  const prev = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, renderer) {
    if (prev) prev.call(this, shader, renderer);
    shader.uniforms.tScreenAO = AO_UNIFORMS.tScreenAO;
    shader.uniforms.uAOEnabled = AO_UNIFORMS.uAOEnabled;
    shader.uniforms.uAOResolution = AO_UNIFORMS.uAOResolution;

    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `
        uniform sampler2D tScreenAO;
        uniform float uAOEnabled;
        uniform vec2  uAOResolution;
        void main() {`)
      // <lights_fragment_end> is where three has finished gathering irradiance and
      // iblIrradiance but before they are combined — the exact right seam.
      .replace('#include <aomap_fragment>', `
        #include <aomap_fragment>
        if (uAOEnabled > 0.5) {
          float ssao = texture2D(tScreenAO, gl_FragCoord.xy / uAOResolution).r;
          reflectedLight.indirectDiffuse  *= ssao;
          reflectedLight.indirectSpecular *= mix(1.0, ssao, 0.75);
        }
      `);
  };
  material.customProgramCacheKey = () => 'rrr-ssao-v1';
  material.needsUpdate = true;
  return material;
}

/** Walk a scene graph and patch every standard material found. Safe to call repeatedly. */
export function patchSceneForScreenAO(root) {
  root.traverse((o) => {
    if (!o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) patchForScreenAO(m);
  });
}

// ---------------------------------------------------------------------------

export class Pipeline {
  constructor(renderer, scene, camera, opts = {}) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.grade = { ...GRADE_PRESETS[opts.grade ?? 'estate'] };
    this.aoEnabled = opts.ao !== false;
    this.bloomEnabled = opts.bloom !== false;
    this.fxaa = opts.fxaa !== false;
    this.renderScale = opts.renderScale ?? 1.0;
    this.aoScale = opts.aoScale ?? 0.5;
    this.bloomMips = opts.bloomMips ?? 6;
    this.aoDirs = opts.aoDirs ?? 4;
    this.aoSteps = opts.aoSteps ?? 6;
    // 'temporal' (default) = previous frame's main-pass depth, no prepass.
    // 'prepass'            = the old duplicate scene traversal, kept for the ablation.
    this.aoDepth = opts.aoDepth === 'prepass' ? 'prepass' : 'temporal';

    /**
     * DETERMINISM (capture mode). Two passes in this stack are deliberately frame-VARIANT:
     * the AO's sample rotation (`uFrame`) and the film grain's phase (`uGrainPhase`). Both
     * exist to trade a per-frame dither pattern for smoothness the eye integrates over
     * time. A screenshot integrates nothing — it gets one frame — so in capture mode both
     * are pinned to a constant.
     *
     * This is not cosmetic. Measured 2026-08-05: two `shoot.mjs` captures of the SAME view
     * with IDENTICAL flags differed in 7-10% of pixel bytes on mat.lath (studio grade, no
     * grain — AO dither alone) and 83% on room.ballroom (estate grade, grain + AO). The
     * captured frame index is a wall-clock lottery: ~790 frames render while Playwright's
     * `page.screenshot()` round-trips, so `frame % 64` and the grain phase land wherever
     * they land. Proven by a controlled experiment (`harness/determinism.mjs --explain`):
     * with the loop frozen, rendering the same scene at pipeline frame 100, then 164, then
     * 100 again is bit-identical every time, while frame 101 differed by 7.2% of bytes. The
     * GPU is perfectly repeatable; only these two uniforms were not.
     *
     * The dither MAGNITUDE is unchanged — pinning changes the seed, not the noise level.
     * A capture still carries roughly +/-1.5/255 of AO dither; see docs/capture-determinism.md.
     */
    this.deterministic = opts.deterministic === true;

    this.width = 1;
    this.height = 1;
    this.frame = 0;

    this._depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking });

    this._buildPasses();
  }

  _buildPasses() {
    const aoSrc = AO_FRAG
      .replace('#define DIRS  4', `#define DIRS  ${this.aoDirs}`)
      .replace('#define STEPS 6', `#define STEPS ${this.aoSteps}`);
    this.aoPass = new FullScreenPass(aoSrc, {
      tDepth: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uAOSize: { value: new THREE.Vector2() },
      uInvProj: { value: new THREE.Matrix4() },
      uProj: { value: new THREE.Matrix4() },
      uRadius: { value: this.grade.aoRadius },
      uBias: { value: this.grade.aoBias },
      uIntensity: { value: this.grade.aoIntensity },
      uFrame: { value: 0 },
    });

    this.aoBlur = new FullScreenPass(AO_BLUR_FRAG, {
      tAO: { value: null },
      uDir: { value: new THREE.Vector2() },
      uDepthSigma: { value: 0.35 },
    });

    this.bloomDown = new FullScreenPass(BLOOM_DOWN_FRAG, {
      tSrc: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uFirstMip: { value: 0 },
      uThreshold: { value: this.grade.bloomThreshold },
      uSoftKnee: { value: this.grade.bloomSoftKnee },
      uClamp: { value: 24.0 },
    });

    this.bloomUp = new FullScreenPass(BLOOM_UP_FRAG, {
      tSrc: { value: null },
      tDst: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uRadius: { value: this.grade.bloomRadius },
    });

    this.composite = new FullScreenPass(COMPOSITE_FRAG, {
      tScene: { value: null },
      tBloom: { value: null },
      tDepth: { value: null },
      uResolution: { value: new THREE.Vector2() },
      uExposure: { value: 1 },
      uBloomStrength: { value: 0.06 },
      uHalation: { value: 0.04 },
      uHalationTint: { value: new THREE.Vector3(1, .35, .16) },
      uCA: { value: 0.002 },
      uVignette: { value: 0.6 },
      uVignetteRound: { value: 0.85 },
      uGrain: { value: 0.03 },
      uGrainSize: { value: 1.6 },
      uGrainPhase: { value: 0 },
      uLift: { value: new THREE.Vector3() },
      uGamma: { value: new THREE.Vector3(1, 1, 1) },
      uGain: { value: new THREE.Vector3(1, 1, 1) },
      uSaturation: { value: 1 },
      uContrast: { value: 1 },
      uShadowTint: { value: new THREE.Vector3(1, 1, 1) },
      uHighlightTint: { value: new THREE.Vector3(1, 1, 1) },
      uSplitBalance: { value: 0.5 },
      uToeCrush: { value: 0.01 },
      uHazeAmount: { value: 0.008 },
      uHazeColor: { value: new THREE.Vector3(0.03, 0.04, 0.05) },
      uNear: { value: 0.1 },
      uFar: { value: 100 },
    });

    this.aaPass = new FullScreenPass(AA_CAS_FRAG, {
      tSrc: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uSharpen: { value: 0.4 },
      uFxaa: { value: 1 },
    });
  }

  setSize(width, height) {
    const w = Math.max(1, Math.round(width * this.renderScale));
    const h = Math.max(1, Math.round(height * this.renderScale));
    this.canvasWidth = width;
    this.canvasHeight = height;
    if (w === this.width && h === this.height) return;
    this.width = w; this.height = h;

    this._disposeTargets();

    // Ping-pong the main target only when AO actually reads last frame's depth from it.
    // With AO off (the `low` tier) or in prepass mode this stays a single buffer, so
    // neither pays the extra ~25 MB at 1080p.
    this._temporal = this.aoEnabled && this.aoDepth === 'temporal';
    this.sceneRTs = [this._makeSceneRT(w, h)];
    if (this._temporal) this.sceneRTs.push(this._makeSceneRT(w, h));
    this._rtIdx = 0;
    this.sceneRT = this.sceneRTs[0];
    this._depthPrimed = false;

    // ---- AO chain. Only allocated when AO is on: on the low tier this is 3 render
    // targets and a whole shading pass we never pay for.
    if (this.aoEnabled) {
      if (!this._temporal) {
        // FULL RESOLUTION IS CORRECT HERE AND SHRINKING IT BUYS NOTHING — measured, do not
        // "optimise" this without re-reading the AO block in HANDOFF.md. A `?depthScale=`
        // experiment took this target to 25% (16x fewer pixels) and moved the worst space
        // 2.64 -> 3.01 ms, i.e. nothing outside noise. The prepass is NOT fill-bound; its
        // cost is the duplicate scene TRAVERSAL (draw calls 238 -> 540 when AO is on),
        // which no resolution change can touch — which is why the default path no longer
        // has a prepass at all. This branch exists only for the A/B.
        const depthTex = new THREE.DepthTexture(w, h);
        depthTex.type = THREE.UnsignedIntType;
        depthTex.minFilter = THREE.NearestFilter;
        depthTex.magFilter = THREE.NearestFilter;
        this.depthRT = new THREE.WebGLRenderTarget(w, h, {
          depthTexture: depthTex,
          depthBuffer: true,
          stencilBuffer: false,
          format: THREE.RedFormat,
          type: THREE.UnsignedByteType,
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter,
          generateMipmaps: false,
        });
      }
      const aw = Math.max(1, Math.round(w * this.aoScale));
      const ah = Math.max(1, Math.round(h * this.aoScale));
      this.aoRT = rt(aw, ah, { type: THREE.HalfFloatType });
      this.aoRT2 = rt(aw, ah, { type: THREE.HalfFloatType });
      this.aoRT3 = rt(aw, ah, { type: THREE.HalfFloatType });
    }

    // Two chains: `down` receives the downsample pyramid, `up` receives the upsample
    // accumulation. Separate buffers means no read-write aliasing and no scratch dance.
    this.bloomDownRTs = [];
    this.bloomUpRTs = [];
    let bw = w >> 1, bh = h >> 1;
    for (let i = 0; i < this.bloomMips; i++) {
      if (bw < 4 || bh < 4) break;
      this.bloomDownRTs.push(rt(bw, bh));
      this.bloomUpRTs.push(rt(bw, bh));
      bw >>= 1; bh >>= 1;
    }

    this.ldrRT = rt(w, h, { type: THREE.UnsignedByteType, colorSpace: THREE.NoColorSpace });

    AO_UNIFORMS.uAOResolution.value.set(w, h);
    AO_UNIFORMS.tScreenAO.value = this.aoRT3 ? this.aoRT3.texture : this._blackTex();
    AO_UNIFORMS.uAOEnabled.value = this.aoEnabled ? 1 : 0;
  }

  /**
   * The main HDR target. Its depth buffer is exposed as a texture, which costs essentially
   * nothing (we need a depth buffer regardless) and now feeds three consumers: the composite
   * pass's distance haze, the AO pass on the NEXT frame, and soft particles.
   */
  _makeSceneRT(w, h) {
    const depth = new THREE.DepthTexture(w, h);
    depth.type = THREE.UnsignedIntType;
    depth.minFilter = THREE.NearestFilter;
    depth.magFilter = THREE.NearestFilter;
    return new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      depthTexture: depth,
      stencilBuffer: false,
      generateMipmaps: false,
      colorSpace: THREE.NoColorSpace,
      samples: 0,
    });
  }

  _disposeTargets() {
    // `depthRT` is an ALIAS of one of the scene targets in temporal mode (it is what
    // `dust.bindDepth` reads for soft particles), so drop the reference before the owned
    // targets are disposed or it gets disposed twice.
    if (this._temporal) this.depthRT = null;
    for (const k of ['depthRT', 'aoRT', 'aoRT2', 'aoRT3', 'ldrRT']) {
      if (this[k]) { this[k].dispose(); this[k] = null; }
    }
    for (const t of (this.sceneRTs ?? [])) t.dispose();
    this.sceneRTs = [];
    this.sceneRT = null;
    for (const arr of [this.bloomDownRTs, this.bloomUpRTs]) {
      if (arr) for (const b of arr) b.dispose();
    }
    this.bloomDownRTs = [];
    this.bloomUpRTs = [];
  }

  _applyGrade() {
    const g = this.grade, u = this.composite.uniforms;
    u.uExposure.value = g.exposure;
    u.uBloomStrength.value = this.bloomEnabled ? g.bloomStrength : 0;
    u.uHalation.value = this.bloomEnabled ? g.halation : 0;
    u.uHalationTint.value.fromArray(g.halationTint);
    u.uCA.value = g.ca;
    u.uVignette.value = g.vignette;
    u.uVignetteRound.value = g.vignetteRound;
    u.uGrain.value = g.grain;
    u.uGrainSize.value = g.grainSize;
    u.uLift.value.fromArray(g.lift);
    u.uGamma.value.fromArray(g.gamma);
    u.uGain.value.fromArray(g.gain);
    u.uSaturation.value = g.saturation;
    u.uContrast.value = g.contrast;
    u.uShadowTint.value.fromArray(g.shadowTint);
    u.uHighlightTint.value.fromArray(g.highlightTint);
    u.uSplitBalance.value = g.splitBalance;
    u.uToeCrush.value = g.toeCrush;
    u.uHazeAmount.value = g.haze;
    u.uHazeColor.value.fromArray(g.hazeColor);
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;

    this.bloomDown.uniforms.uThreshold.value = g.bloomThreshold;
    this.bloomDown.uniforms.uSoftKnee.value = g.bloomSoftKnee;
    this.bloomUp.uniforms.uRadius.value = g.bloomRadius;
    this.aoPass.uniforms.uRadius.value = g.aoRadius;
    this.aoPass.uniforms.uBias.value = g.aoBias;
    this.aoPass.uniforms.uIntensity.value = g.aoIntensity;
    this.aaPass.uniforms.uSharpen.value = g.sharpen;
    this.aaPass.uniforms.uFxaa.value = this.fxaa ? 1 : 0;
  }

  render(time = 0) {
    const r = this.renderer;
    const w = this.width, h = this.height;
    if (!this.sceneRT) return;
    this.frame++;
    this._applyGrade();

    const prevAutoClear = r.autoClear;

    // Ping-pong: `cur` is written by the main pass below, `prev` holds the depth the main
    // pass wrote LAST frame, which is what AO shades from. No read-write hazard: we sample
    // one target's depth texture while rendering into the other.
    const cur = this.sceneRTs[this._rtIdx];
    const prev = this._temporal ? this.sceneRTs[1 - this._rtIdx] : null;
    this.sceneRT = cur;

    // ---- 1. depth ---------------------------------------------------------
    if (this.aoEnabled) {
      let depthTex;
      if (this._temporal) {
        // The one frame there is no previous depth: after boot and after every resize
        // (dynamic resolution reallocates). Prime it with a single prepass rather than
        // dropping AO for a frame — an AO pop on every dynamic-res step would read as a
        // lighting glitch, and this costs one frame, not every frame.
        if (!this._depthPrimed) { this._renderDepthOnly(prev); this._depthPrimed = true; }
        depthTex = prev.depthTexture;
      } else {
        this._renderDepthOnly(this.depthRT);
        depthTex = this.depthRT.depthTexture;
      }

      // ---- 2. AO ---------------------------------------------------------
      // `uTexel` stays full-res because `depthTex` is full-res in BOTH modes. Changing
      // either one without the other degenerates normalFromDepth()'s cross product or
      // rescales the sampling stride ~3.3x. See the header.
      const au = this.aoPass.uniforms;
      au.tDepth.value = depthTex;
      au.uTexel.value.set(1 / w, 1 / h);
      au.uAOSize.value.set(this.aoRT.width, this.aoRT.height);
      au.uInvProj.value.copy(this.camera.projectionMatrixInverse);
      au.uProj.value.copy(this.camera.projectionMatrix);
      // Pinned in capture mode — see the DETERMINISM note in the constructor.
      au.uFrame.value = this.deterministic ? 0 : this.frame % 64;
      this.aoPass.render(r, this.aoRT);

      // ---- 3. blur -------------------------------------------------------
      this.aoBlur.uniforms.tAO.value = this.aoRT.texture;
      this.aoBlur.uniforms.uDir.value.set(1 / this.aoRT.width, 0);
      this.aoBlur.render(r, this.aoRT2);
      this.aoBlur.uniforms.tAO.value = this.aoRT2.texture;
      this.aoBlur.uniforms.uDir.value.set(0, 1 / this.aoRT.height);
      this.aoBlur.render(r, this.aoRT3);

      AO_UNIFORMS.tScreenAO.value = this.aoRT3.texture;
      AO_UNIFORMS.uAOEnabled.value = 1;
    } else {
      AO_UNIFORMS.uAOEnabled.value = 0;
    }

    // ---- 4. main pass -----------------------------------------------------
    r.setRenderTarget(cur);
    r.clear(true, true, false);
    r.render(this.scene, this.camera);

    // ---- 5. bloom ---------------------------------------------------------
    let bloomTex = null;
    const nMips = this.bloomDownRTs.length;
    if (this.bloomEnabled && nMips) {
      // down
      let src = cur.texture, sw = w, sh = h;
      for (let i = 0; i < nMips; i++) {
        const d = this.bloomDownRTs[i];
        this.bloomDown.uniforms.tSrc.value = src;
        this.bloomDown.uniforms.uTexel.value.set(1 / sw, 1 / sh);
        this.bloomDown.uniforms.uFirstMip.value = i === 0 ? 1 : 0;
        this.bloomDown.render(r, d);
        src = d.texture; sw = d.width; sh = d.height;
      }
      // up: up[n-1] is just down[n-1]; each step adds the smaller level into this one
      let smaller = this.bloomDownRTs[nMips - 1];
      for (let i = nMips - 2; i >= 0; i--) {
        const dst = this.bloomUpRTs[i];
        this.bloomUp.uniforms.tSrc.value = smaller.texture;      // smaller mip, tent-filtered
        this.bloomUp.uniforms.tDst.value = this.bloomDownRTs[i].texture; // this level
        this.bloomUp.uniforms.uTexel.value.set(1 / smaller.width, 1 / smaller.height);
        this.bloomUp.render(r, dst);
        smaller = dst;
      }
      bloomTex = smaller.texture;
    }

    // ---- 6. composite -----------------------------------------------------
    const cu = this.composite.uniforms;
    cu.tScene.value = cur.texture;
    cu.tBloom.value = bloomTex ?? this._blackTex();
    cu.tDepth.value = cur.depthTexture;   // this frame's, written by the main pass above
    cu.uResolution.value.set(w, h);
    // Grain phase, pinned in capture mode — see the DETERMINISM note in the constructor.
    // The fract is done here in float64: at t = 900 s a float32 `fract(uTime)` in the
    // shader has ~5 significant bits left and the grain visibly coarsens.
    const ts = time * 0.001;
    cu.uGrainPhase.value = this.deterministic ? 0 : ts - Math.floor(ts);
    this.composite.render(r, this.ldrRT);

    // ---- 7. AA + CAS + upscale to the canvas ------------------------------
    this.aaPass.uniforms.tSrc.value = this.ldrRT.texture;
    this.aaPass.uniforms.uTexel.value.set(1 / w, 1 / h);
    r.setRenderTarget(null);
    this.aaPass.render(r, null);

    r.autoClear = prevAutoClear;

    if (this._temporal) {
      // Publish the buffer just rendered as "the depth prepass" for soft particles.
      // `dust.bindDepth` reads `pipeline.depthRT.depthTexture` every frame from the update
      // phase, so by the time it is consumed this IS the previous frame — the same buffer
      // AO will be shading from, one frame stale, which is all a soft-particle fade needs.
      this.depthRT = cur;
      this._rtIdx = 1 - this._rtIdx;
    }
  }

  /** The old depth prepass: a second full traversal with an override material. */
  _renderDepthOnly(target) {
    const r = this.renderer;
    const prevOverride = this.scene.overrideMaterial;
    this.scene.overrideMaterial = this._depthMat;
    r.setRenderTarget(target);
    r.clear(true, true, false);
    r.render(this.scene, this.camera);
    this.scene.overrideMaterial = prevOverride;
  }

  _blackTex() {
    if (!this._black) {
      this._black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
      this._black.needsUpdate = true;
    }
    return this._black;
  }

  setGrade(nameOrObject) {
    this.grade = typeof nameOrObject === 'string'
      ? { ...GRADE_PRESETS[nameOrObject] }
      : { ...this.grade, ...nameOrObject };
  }

  dispose() {
    this._disposeTargets();
    for (const p of [this.aoPass, this.aoBlur, this.bloomDown, this.bloomUp, this.composite, this.aaPass]) p.dispose();
    this._depthMat.dispose();
  }
}
