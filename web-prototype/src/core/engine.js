import * as THREE from 'three';
import { Pipeline, patchSceneForScreenAO } from '../post/pipeline.js';
import { initBaker } from '../materials/baker.js';
import { debugChrome } from './debug.js';

/**
 * The engine shell every view boots into.
 *
 * Two modes matter:
 *   live     — rAF loop, dynamic resolution chasing a frame budget, perf HUD
 *   capture  — fixed timestep, dynamic resolution pinned, deterministic RNG.
 *              `window.__rrr.settle(n)` resolves once n frames have been rendered with
 *              no pending texture bakes, so a screenshot is always of a converged frame.
 *              Critics screenshot the real thing; the real thing must not flicker.
 *
 * CAPTURE MODE DOES NOT FREE-RUN — read this before touching `_captureLoop`.
 *
 * It used to. The claim above ("two screenshots of the same view are the same image") was
 * measurably false until 2026-08-05: two `shoot.mjs` runs of one view with identical flags
 * differed in 7-10% of pixel bytes on mat.lath and 83% on room.ballroom. The reason was not
 * the settle gate — that part was exact in every run measured — but what happened AFTER it.
 * rAF is uncapped in the harness (`--disable-frame-rate-limit`), so the loop kept stepping
 * the simulation through every Playwright round trip. Measured: **790 frames — 13.2 seconds
 * of simulation — elapse inside a single `page.screenshot()` call.** Whatever the settle
 * resolved on, the pixels that reached disk were from ~13 s later, at a frame index nobody
 * chose. `views/gadget.js` reasons out loud about "settle(12), i.e. t ~ 0.20 s"; the true
 * capture time was ~13 s and a lottery.
 *
 * So the capture loop now steps only while something is actually waiting on a frame:
 *   - an outstanding `settle()` target,
 *   - a `?at=N` run-up that has not reached N yet,
 *   - an explicit measurement window (`resetPerf()`; see `_freeRun`),
 *   - the very first frame, so the canvas is never blank for a tool that forgets to settle.
 * Otherwise it parks and holds the last rendered frame. `preserveDrawingBuffer` is already
 * on in capture mode, so a parked canvas screenshots exactly what it last drew.
 *
 * Consequence to know about: a capture-mode tool that waits on the WALL CLOCK for an
 * animation to advance no longer advances anything. Ask for frames instead — `settle(n)`
 * is n fixed 1/60 steps — or freeze at a chosen moment with `?at=N`. That is the same
 * advice `shoot.mjs` already gave for `--seconds`, now enforced rather than hoped for.
 */

/**
 * Quality tiers. The whole point of the project is 60 fps at 1080p on integrated
 * graphics, and the post stack is the dominant cost in an empty scene — so the tier is
 * not a nice-to-have, it is the mechanism that makes the target reachable. `auto` picks
 * from the GPU string; a URL param always wins so the harness can pin a tier.
 */
// `particles` and `dust` scale the counts a view spawns. Dust is the expensive one: it is
// large alpha-blended quads, so its cost is overdraw, and overdraw is exactly what an
// integrated GPU is worst at. Measured on the collapse view, medium sat 4% over budget
// purely on dust fill; scaling the budget by tier is the standard fix and costs nothing
// visually at the distances the effect is actually read from.
/**
 * 🚨 **`depthPrepass` IS A DEAD FLAG, AND BELIEVING IT WAS LIVE COST A WHOLE DIAGNOSIS ROUND.**
 *
 * It is forwarded to the Pipeline below and **`src/post/pipeline.js` never reads it** — grep it.
 * The prepass it names was DELETED by `perf-ao` on 2026-08-04 and replaced by `aoDepth:
 * 'temporal'`; the only surviving `_renderDepthOnly()` call primes the temporal buffer once per
 * resize, through a single shared `scene.overrideMaterial`, which is a handful of programs and
 * not "a second program per material". Left in place rather than removed only because deleting a
 * tier key is a change to every tier at once; treat it as documentation of a dead option.
 *
 * ⚠️ **THE TIER IS NOT A LOAD-TIME LEVER AND THIS IS MEASURED, THREE ARMS, ONE FROZEN TREE**
 * (`boot-1`, 2026-08-08, `harness/scenarios/_boot1-census.mjs`, 1280x720, warm lap at 320 px):
 *
 * | tier | programs the load warm-up builds | lap | time to `ready` |
 * |---|---|---|---|
 * | `low` (ao off, "prepass" off) | **457** | 47.4 s | 77.7 s |
 * | `medium` | **462** | 47.9 s | 79.5 s |
 * | `high` | **462** | 49.0 s | 79.4 s |
 *
 * **Five programs and 1.6 s separate the cheapest tier from the most expensive one.** So the
 * Checkpoint-A inference — John's tablet ran `?quality=low` and loaded faster than his RTX
 * 3060 Ti, therefore the tier drives the load — is REFUTED at the tier, whatever else explains
 * the tablet. Do not spend another round on it.
 *
 * Where the programs DO come from: run `_boot1-census.mjs`, which collapses three's own program
 * cache keys field by field. Two fields carry almost all of it — `customProgramCacheKey`
 * (`wall.js` pins one per panel per layer: collapsing it takes 696 keys to 174, **x4.00**) and
 * `numPointLights` (the four counts live play visits: 696 -> 328, **x2.12**). Neither is in this
 * file and neither is a quality setting.
 */
export const QUALITY = {
  ultra:  { ao: true,  aoScale: 0.75, aoDirs: 6, aoSteps: 8, bloomMips: 7, fxaa: true, depthPrepass: true, shadowMap: 2048, softShadow: true,  particles: 1.25, dust: 1.30 },
  high:   { ao: true,  aoScale: 0.5,  aoDirs: 4, aoSteps: 6, bloomMips: 6, fxaa: true, depthPrepass: true, shadowMap: 1024, softShadow: true,  particles: 1.00, dust: 1.00 },
  medium: { ao: true,  aoScale: 0.30, aoDirs: 3, aoSteps: 4, bloomMips: 5, fxaa: true, depthPrepass: true, shadowMap: 1024, softShadow: false, particles: 0.70, dust: 0.55 },
  low:    { ao: false, aoScale: 0.30, aoDirs: 2, aoSteps: 4, bloomMips: 4, fxaa: true, depthPrepass: false, shadowMap: 512,  softShadow: false, particles: 0.45, dust: 0.30 },
};

const INTEGRATED_RE = /intel|uhd graphics|iris|hd graphics|radeon\(tm\) graphics|vega \d|adreno|mali|apple m\d/i;

export function pickQuality(gpuString) {
  if (INTEGRATED_RE.test(gpuString)) return 'medium';
  return 'high';
}


export class Engine {
  constructor(opts = {}) {
    this.opts = opts;
    const qs = new URLSearchParams(location.search);
    this.capture = qs.has('capture') || !!opts.capture;

    const canvas = document.createElement('canvas');
    canvas.id = 'rrr-canvas';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;outline:none';
    document.body.appendChild(canvas);
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,          // we do FXAA in the composite; MSAA on an HDR target is costly
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: this.capture,
    });
    this.renderer.setPixelRatio(1);           // 1080p means 1080p; never devicePixelRatio
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;   // the pipeline tonemaps
    this.renderer.info.autoReset = false;

    // ---- quality tier ----
    const gpu = gpuName(this.renderer);
    const wanted = qs.get('quality') ?? opts.quality ?? 'auto';
    this.qualityName = wanted === 'auto' ? pickQuality(gpu) : wanted;
    const q = QUALITY[this.qualityName] ?? QUALITY.high;
    this.quality = { ...q };
    // explicit URL overrides, for profiling one pass at a time
    if (qs.has('ao')) this.quality.ao = qs.get('ao') !== '0';
    if (qs.has('bloom')) this.quality.bloom = qs.get('bloom') !== '0';
    if (qs.has('fxaa')) this.quality.fxaa = qs.get('fxaa') !== '0';
    if (qs.has('aoScale')) this.quality.aoScale = +qs.get('aoScale');
    // `?aodepth=prepass` restores the pre-2026-08-04 duplicate-traversal depth prepass.
    // Kept so the temporal-depth ablation can be re-run A/B in one session; absolute GPU
    // numbers on this box drift ~30% with heat, so back-to-back is the only sound form.
    if (qs.has('aodepth')) this.quality.aoDepth = qs.get('aodepth');
    if (qs.has('mips')) this.quality.bloomMips = +qs.get('mips');

    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = this.quality.softShadow ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = true;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      opts.fov ?? 62, 1,
      opts.near ?? 0.06,
      opts.far ?? 160);

    this.pipeline = new Pipeline(this.renderer, this.scene, this.camera, {
      grade: opts.grade ?? 'estate',
      ao: this.quality.ao && opts.ao !== false,
      bloom: (this.quality.bloom !== false) && opts.bloom !== false,
      fxaa: this.quality.fxaa && opts.fxaa !== false,
      aoScale: this.quality.aoScale,
      bloomMips: this.quality.bloomMips,
      depthPrepass: this.quality.depthPrepass,
      aoDepth: this.quality.aoDepth,
      // These were defined per tier but never forwarded, so every tier silently ran the
      // pipeline's 4x6 default. AO is the single most expensive pass in the stack — on a
      // near-empty scene it measures 0.42 ms of a 1.39 ms budget — so the tier ladder was
      // doing almost nothing where it mattered most.
      aoDirs: this.quality.aoDirs,
      aoSteps: this.quality.aoSteps,
      renderScale: +(qs.get('scale') ?? opts.renderScale ?? 1.0),
      // Pin the AO dither rotation and the grain phase, the two frame-variant terms in the
      // post stack. See the DETERMINISM note in pipeline.js — without this a capture is a
      // function of its own frame index, which no caller chooses.
      deterministic: this.capture,
    });

    this.baker = initBaker(this.renderer);

    this.clock = new THREE.Clock();
    this.elapsed = 0;
    this.frame = 0;
    this._updaters = [];
    // Two separate series. `_frameTimes` is the real rAF-to-rAF interval, which is the
    // only number that includes GPU work — WebGL submits asynchronously, so timing the
    // JS render call measures nothing but our own bookkeeping. `_cpuTimes` is that
    // bookkeeping, kept because when the two diverge you know which side is the problem.
    this._frameTimes = new Float32Array(120);
    this._cpuTimes = new Float32Array(120);
    this._ftIdx = 0;
    this._lastRaf = 0;
    this._settleTargets = [];
    this._pendingWork = 0;
    // Capture-mode loop state. `_freeRun` is the measurement escape hatch: perf needs real
    // back-to-back frames, a screenshot needs a still one, and the two must not overlap.
    this._freeRun = false;
    this._parked = false;
    this._gpuTimer = makeGpuTimer(this.renderer);

    // deterministic RNG — every view seeds from the same place so two screenshots of
    // the same view are the same image
    this.rng = mulberry32(opts.seed ?? 0x5eed);

    // ?at=N — freeze the simulation N seconds in (see _step)
    this.freezeAt = qs.has('at') ? +qs.get('at') : (opts.at ?? null);

    this._resize();
    window.addEventListener('resize', () => this._resize());

    this.hud = (this.capture || !debugChrome()) ? null : makeHud();

    window.__rrr = {
      engine: this,
      settle: (n = 6) => this.settle(n),
      ready: false,
      frames: () => this.frame,
      perf: () => this.perf(),
      setGrade: (g) => this.pipeline.setGrade(g),
      // Capture mode parks between settles (see the class header). A tool that wants the
      // clock to keep running on its own — a soak, a stall hunt — opts in here.
      freeRun: (on = true) => { this._freeRun = !!on; },
      // What a screenshot taken right now would be a picture of. Anything that must be
      // reproducible should be able to assert on these two numbers.
      // `pendingWork` is here because a view that leaves it above zero parks the loop for ever
      // and `settle()` never resolves — which reads from the outside as a slow renderer rather
      // than a stuck one. Cost: one integer on a debug object.
      simState: () => ({ frame: this.frame, elapsed: this.elapsed, parked: this._parked,
        pendingWork: this._pendingWork, settleTargets: this._settleTargets.length }),
      // OFF BY DEFAULT, and nothing in the game ever turns it on — see `setSilhouette`.
      silhouette: (on = true, bg) => this.setSilhouette(on, bg),
      redraw: (raw = false) => (raw ? this.renderRaw() : this.pipeline.render(this.elapsed * 1000)),
    };
  }

  /**
   * FLAT-SILHOUETTE RENDER MODE — the engine half of `harness/strobe.mjs --silhouette`.
   *
   * A good motion reads as weight in silhouette alone. If a pose is only legible because you
   * can see the prop's texture, the animation is not carrying it — so the strobe needs the
   * same frames as flat black shapes on a light ground.
   *
   * ⚠️ THIS CANNOT BE DONE BY THRESHOLDING THE PNG IN POST, WHICH IS THE OBVIOUS WRONG FIX.
   * Most stations in this game measure luminance 7-13, i.e. already near black, so a
   * brightness threshold produces garbage that still looks like a plausible silhouette.
   * `scene.overrideMaterial` is the mechanism that actually separates figure from ground, and
   * `pipeline.js:_renderDepthOnly()` already proves it is cheap: one shared material, one
   * extra traversal, no per-material programs.
   *
   * Fog is cleared with it. Fog tints a black shape toward the fog colour with distance, which
   * turns a flat silhouette into a soft grey gradient — legible, but no longer the test.
   */
  setSilhouette(on = true, bg = 0xd6dbe1) {
    if (on) {
      if (!this._silMat) this._silMat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
      if (!this._silSaved) this._silSaved = { bg: this.scene.background, fog: this.scene.fog };
      this._silMat.color.setHex(0x000000);
      this.scene.overrideMaterial = this._silMat;
      this.scene.fog = null;
      // BOTH, deliberately. `scene.background` is what three clears with when it is set, but a
      // view that leaves it null clears with the RENDERER's colour instead — and a silhouette
      // whose ground quietly stayed black still writes a PNG and still looks like a picture.
      this._silBg = new THREE.Color(bg);
      this.scene.background = this._silBg;
    } else if (this._silSaved) {
      this.scene.overrideMaterial = null;
      this.scene.background = this._silSaved.bg;
      this.scene.fog = this._silSaved.fog;
      this._silSaved = null;
      this._silBg = null;
    }
    return !!on;
  }

  /**
   * Draw the current frame straight to the canvas, bypassing the post stack.
   *
   * The silhouette must not go through `pipeline.render()`: the grade lifts the toe, bloom
   * blooms the light ground into the figure, and the film grain dithers the edge — all three
   * work against "flat black on flat light". Nothing else in the project calls this.
   */
  renderRaw() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    const prevClear = new THREE.Color();
    r.getClearColor(prevClear);
    const prevAlpha = r.getClearAlpha();
    r.setRenderTarget(null);
    r.setScissorTest(false);
    r.setViewport(0, 0, r.domElement.width, r.domElement.height);
    const prevAutoClear = r.autoClear;
    r.autoClear = true;
    if (this._silBg) r.setClearColor(this._silBg, 1);
    // ⚠️ CLEAR EXPLICITLY. `pipeline.render()` drives `autoClear` and the per-buffer
    // `autoClearColor/Depth/Stencil` flags itself and does not promise what it leaves them at,
    // so relying on `render()` to clear for us produced a silhouette drawn ON TOP OF THE
    // PREVIOUS POST-PROCESSED FRAME: black geometry over a stale bloom, which reads as a
    // near-black rectangle with an unexplained orange glow in it. That is what the first
    // silhouette sheet actually was.
    r.clear(true, true, true);
    r.render(this.scene, this.camera);
    r.autoClear = prevAutoClear;
    r.setClearColor(prevClear, prevAlpha);
    r.setRenderTarget(prev);
  }

  /** 1080p target unless the window is smaller; capture mode forces exact 1920x1080. */
  _resize() {
    let w, h;
    if (this.capture) {
      w = this.opts.captureWidth ?? 1920;
      h = this.opts.captureHeight ?? 1080;
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.canvas.style.position = 'absolute';
      this.canvas.style.inset = '0';
    } else {
      w = window.innerWidth; h = window.innerHeight;
    }
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.pipeline.setSize(w, h);
  }

  onUpdate(fn) { this._updaters.push(fn); return fn; }

  /** Call after the scene graph is built so screen-AO reaches every material. */
  finalizeScene() {
    patchSceneForScreenAO(this.scene);
    this.renderer.compile(this.scene, this.camera);
  }

  start() {
    if (this.capture) { this._captureLoop(); } else { this._liveLoop(); }
  }

  _liveLoop() {
    const budgetMs = 1000 / 60;
    let last = performance.now();
    const tick = () => {
      this._raf = requestAnimationFrame(tick);
      const now = performance.now();
      let dt = (now - last) / 1000;
      last = now;
      dt = Math.min(dt, 0.1);
      this._step(dt, now);

      // dynamic resolution: nudge toward the budget, 2% per frame, clamped
      const avg = this.avgFrameMs();
      if (this.frame > 30 && this.opts.dynamicRes !== false) {
        const s = this.pipeline.renderScale;
        let next = s;
        if (avg > budgetMs * 1.08) next = s - 0.02;
        else if (avg < budgetMs * 0.82) next = s + 0.012;
        next = Math.min(1.0, Math.max(0.62, next));
        if (Math.abs(next - s) > 1e-4) {
          this.pipeline.renderScale = next;
          this.pipeline.setSize(this.pipeline.canvasWidth, this.pipeline.canvasHeight);
        }
      }
      if (this.hud) this.hud(this);
    };
    tick();
  }

  _captureLoop() {
    // fixed 1/60 steps for determinism, but frame *timing* is still measured off the
    // real rAF interval so --perf in capture mode reports the truth
    const tick = () => {
      this._raf = requestAnimationFrame(tick);

      // ---- park unless a frame was actually asked for (see the class header) -----------
      // Async setup gates the simulation too. `settle()` counts frames down, so letting the
      // clock advance while a bake is still outstanding would make the settled sim time a
      // function of how long that bake took in wall-clock terms. Every view measured so far
      // finishes its bakes before markReady() — `_pendingWork` was 0 at ready in every run
      // of every view probed — but the loop must not depend on that staying true.
      const runUp = this.freezeAt != null && this.elapsed < this.freezeAt;
      const boot = this.frame === 0;
      const wanted = this._freeRun || runUp || boot || this._settleTargets.length > 0;
      this._parked = !wanted || this._pendingWork > 0;
      if (this._parked) return;

      // The boot frame poses the scene at t=0 and paints it, so a tool that screenshots
      // without settling gets the view rather than an unpainted canvas — this project's
      // worst failure mode is a capture that lies, and a blank one lies loudest. It steps
      // with dt=0 so it costs no simulation time: that keeps `settle(n)` worth exactly
      // n/60 seconds, which is the contract views already reason against out loud
      // (`src/views/gadget.js`: "after settle(12) ... t ~ 0.20 s").
      this._step(boot ? 0 : 1 / 60, this.frame * (1000 / 60));

      // A measurement window is frames-for-timing, not frames-for-a-picture: it must not
      // also satisfy a settle target, or `--perf` would silently move the captured frame.
      if (this._freeRun) return;

      // When a freeze point is set, settle must not start counting until the simulation
      // has actually reached it, or the screenshot lands mid-run-up.
      const atFreeze = this.freezeAt == null || this.elapsed >= this.freezeAt;
      const done = [];
      for (const t of this._settleTargets) {
        if (!atFreeze) continue;
        t.left--;
        if (t.left <= 0) { t.resolve(); done.push(t); }
      }
      if (done.length) this._settleTargets = this._settleTargets.filter((t) => !done.includes(t));
    };
    tick();
  }

  _step(dt, nowMs) {
    // Deterministic animation capture. In capture mode rAF is uncapped, so a wall-clock
    // wait of one second advances the fixed 1/60 sim by whatever the GPU managed — often
    // 13x. `?at=N` freezes the simulation exactly N seconds in, so an animated view can be
    // screenshotted at a chosen moment and two runs land on the identical frame.
    if (this.freezeAt != null && this.elapsed >= this.freezeAt) {
      // Still time the frame. Skipping the GPU timer here reported gpuMs 0 and made the
      // "60 fps while a wall is collapsing" measurement silently meaningless — the one
      // number this freeze mode exists to capture.
      const w = performance.now();
      if (this._lastRaf) this._frameTimes[this._ftIdx % this._frameTimes.length] = w - this._lastRaf;
      this._lastRaf = w;
      this.frame++;
      this.renderer.info.reset();
      this._gpuTimer?.begin();
      this.pipeline.render(this.elapsed * 1000);
      this._gpuTimer?.end();
      this._cpuTimes[this._ftIdx % this._cpuTimes.length] = performance.now() - w;
      this._ftIdx++;
      return;
    }
    const wall = performance.now();
    if (this._lastRaf) {
      const i = this._ftIdx % this._frameTimes.length;
      this._frameTimes[i] = wall - this._lastRaf;
    }
    this._lastRaf = wall;

    const t0 = wall;
    this.elapsed += dt;
    this.frame++;
    this.renderer.info.reset();
    this._gpuTimer?.begin();
    for (const u of this._updaters) u(dt, this.elapsed, this);
    this.pipeline.render(this.elapsed * 1000);
    this._gpuTimer?.end();
    this._cpuTimes[this._ftIdx % this._cpuTimes.length] = performance.now() - t0;
    this._ftIdx++;
  }

  _series(arr) {
    const v = [];
    for (let i = 0; i < arr.length; i++) if (arr[i] > 0) v.push(arr[i]);
    if (!v.length) return { avg: 0, p95: 0, max: 0, n: 0 };
    v.sort((a, b) => a - b);
    let s = 0; for (const x of v) s += x;
    return {
      avg: s / v.length,
      p95: v[Math.min(v.length - 1, Math.floor(v.length * 0.95))],
      max: v[v.length - 1],
      n: v.length,
    };
  }

  avgFrameMs() { return this._series(this._frameTimes).avg; }

  perf() {
    const info = this.renderer.info;
    const f = this._series(this._frameTimes);
    const c = this._series(this._cpuTimes);
    return {
      // frame = real presented interval, the number that must stay under 16.67
      fps: +(1000 / Math.max(f.avg, 0.001)).toFixed(1),
      frameMs: +f.avg.toFixed(2),
      frameP95Ms: +f.p95.toFixed(2),
      frameMaxMs: +f.max.toFixed(2),
      worstFps: +(1000 / Math.max(f.p95, 0.001)).toFixed(1),
      cpuMs: +c.avg.toFixed(2),
      gpuMs: this._gpuTimer ? +this._gpuTimer.avg().toFixed(2) : null,
      samples: f.n,
      calls: info.render.calls,
      tris: info.render.triangles,
      programs: info.programs?.length ?? 0,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      renderScale: +this.pipeline.renderScale.toFixed(3),
      bake: this.baker.report(),
      gpu: gpuName(this.renderer),
      quality: this.qualityName,
      passes: {
        ao: this.pipeline.aoEnabled,
        aoScale: this.pipeline.aoScale,
        bloom: this.pipeline.bloomEnabled,
        bloomMips: this.pipeline.bloomDownRTs?.length ?? 0,
        fxaa: this.pipeline.fxaa,
      },
    };
  }

  /**
   * Start a measurement window — and, in capture mode, release the parked loop so there is
   * something to measure. Every perf tool in `harness/` already calls this immediately
   * before its sampling wait (shoot.mjs --perf, perf-ab.mjs, perf-spaces.mjs), which is
   * exactly the boundary that wants free-running frames; `settle()` closes it again.
   */
  resetPerf() {
    this._frameTimes.fill(0); this._cpuTimes.fill(0); this._lastRaf = 0; this._gpuTimer?.reset();
    if (this.capture) this._freeRun = true;
  }

  /** Stop a `resetPerf()` measurement window without settling. */
  endPerf() { this._freeRun = false; }

  /**
   * Resolve once `frames` more frames have rendered and no async work is pending.
   *
   * In capture mode this is the ONLY thing that advances the simulation for a picture, and
   * it advances it by exactly `frames` fixed 1/60 steps — so the sim time at the screenshot
   * is a property of the flags, not of how fast this machine happened to be. It also closes
   * any open perf window, because a measurement window is the one state where frames run
   * free and a screenshot taken during it would be unrepeatable.
   */
  settle(frames = 6) {
    this._freeRun = false;
    return new Promise((resolve) => { this._settleTargets.push({ left: frames, resolve }); });
  }

  /** Bracket async setup work so settle() waits for it. */
  async work(promise) {
    this._pendingWork++;
    try { return await promise; } finally { this._pendingWork--; }
  }

  markReady() { window.__rrr.ready = true; document.body.dataset.rrrReady = '1'; }
}

export function gpuName(renderer) {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown';
  } catch { return 'unknown'; }
}

/**
 * Real GPU time via EXT_disjoint_timer_query_webgl2 when the driver exposes it.
 * Results come back asynchronously, so queries are kept in a small ring and harvested
 * a few frames later. When the extension is missing this returns null and the rAF
 * interval is the only truth available — which is still a real measurement.
 */
function makeGpuTimer(renderer) {
  const gl = renderer.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return null;
  const pool = [];
  const inflight = [];
  const samples = new Float32Array(120);
  let idx = 0, active = null;

  return {
    begin() {
      if (active) return;
      const q = pool.pop() ?? gl.createQuery();
      try { gl.beginQuery(ext.TIME_ELAPSED_EXT, q); active = q; } catch { pool.push(q); active = null; }
    },
    end() {
      if (!active) return;
      try { gl.endQuery(ext.TIME_ELAPSED_EXT); inflight.push(active); } catch {}
      active = null;
      // harvest
      for (let i = inflight.length - 1; i >= 0; i--) {
        const q = inflight[i];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
        const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
        if (!disjoint) {
          const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
          samples[idx++ % samples.length] = ns / 1e6;
        }
        inflight.splice(i, 1);
        pool.push(q);
      }
    },
    avg() {
      let s = 0, n = 0;
      for (let i = 0; i < samples.length; i++) if (samples[i] > 0) { s += samples[i]; n++; }
      return n ? s / n : 0;
    },
    reset() { samples.fill(0); idx = 0; },
  };
}

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeHud() {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;top:8px;left:8px;z-index:50;font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;
    color:#c8e6ff;background:rgba(6,10,16,.72);padding:7px 9px;border:1px solid rgba(120,180,255,.22);
    border-radius:5px;pointer-events:none;white-space:pre;letter-spacing:.02em;backdrop-filter:blur(6px)`;
  document.body.appendChild(el);
  let acc = 0;
  return (engine) => {
    acc++;
    if (acc % 12) return;
    const p = engine.perf();
    const bad = p.worstFps < 58;
    el.style.color = bad ? '#ffb4a8' : '#c8e6ff';
    el.textContent =
      `${p.fps.toFixed(1)} fps   frame ${p.frameMs.toFixed(2)} ms   p95 ${p.frameP95Ms.toFixed(2)} (${p.worstFps} fps)\n` +
      `cpu ${p.cpuMs.toFixed(2)}${p.gpuMs != null ? `   gpu ${p.gpuMs.toFixed(2)}` : ''}   scale ${(p.renderScale * 100).toFixed(0)}%\n` +
      `${p.calls} calls   ${(p.tris / 1000).toFixed(0)}k tris   ${p.textures} tex   ${p.programs} prog\n${p.bake}`;
  };
}
