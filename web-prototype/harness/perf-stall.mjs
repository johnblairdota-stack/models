#!/usr/bin/env node
/**
 * PERF-STALL — the TAIL of the frame-time distribution, in LIVE play, over a long session.
 *
 * WHY THIS EXISTS. John reports the playable slice freezing for ~5 s at a time, in Firefox AND
 * in Chrome, while playing normally. Nothing in this harness has ever been able to see that,
 * for three structural reasons — and the third is the one that made it invisible:
 *
 *  1. **No tool reported a session MAXIMUM or a p99.** `Engine.perf()` does expose `frameMaxMs`
 *     and `frameP95Ms` (HANDOFF's "nothing in the harness reports a maximum" is not quite right)
 *     — but they are computed over a **120-sample ring**, i.e. TWO SECONDS at 60 fps. A stall
 *     that happened four seconds ago has already been overwritten by the time anything reads it.
 *     A 5 s freeze inside a 60 s window is one sample; every existing consumer reads a mean.
 *  2. **Nothing plays for minutes.** Every scenario is a short scripted run or a parked station,
 *     so nothing accumulates: debris, dust, wall damage, hunter growth, exterior state.
 *  3. **Every perf tool runs `capture=1`.** Capture mode takes `_captureLoop`, which PINS the
 *     dynamic-resolution controller. That controller only exists in `_liveLoop`, and every time
 *     it moves `renderScale` it calls `pipeline.setSize()`, which **disposes and reallocates the
 *     entire render-target chain**. No capture-mode measurement can see one frame of that.
 *
 * So this tool: LIVE mode (no `capture=1`), a real play session driven from inside the page,
 * and a per-frame recorder that keeps EVERY frame for the whole session in preallocated typed
 * arrays — no allocation in the hot path, because one of the suspects is GC.
 *
 *   node harness/perf-stall.mjs --minutes 6
 *   node harness/perf-stall.mjs --minutes 6 --q "exits=4"      # the yard-count ablation
 *   node harness/perf-stall.mjs --minutes 6 --dynres 0         # ablate dynamic resolution
 *
 *   --minutes <n>   session length (default 6)
 *   --port <n>      vite port (default 5193 — not 5178/5191, which other tools own)
 *   --quality <t>   quality tier (default medium, the house rule for any perf claim)
 *   --q <qs>        extra query string, e.g. "exits=4&seed=s4"
 *   --dynres <0|1>  1 (default) leaves the live dynamic-resolution controller alone;
 *                   0 neuters it in-page after boot. This is the ABLATION for suspect #5 and
 *                   it is done from the harness so no source file has to change.
 *   --json <path>   write the full per-frame summary
 *   --label <s>     name this arm in the output
 *   --headed        watch it
 *
 * WHAT IT RECORDS, per frame, for the whole session:
 *   gap  ms   rAF-to-rAF interval (the only number that includes GPU work)
 *   prog      renderer.info.programs.length      <- a JUMP means a SHADER COMPILE
 *   tex       renderer.info.memory.textures      <- a JUMP means a TEXTURE UPLOAD
 *   geo       renderer.info.memory.geometries
 *   heap  MB  performance.memory.usedJSHeapSize  <- a DROP means a GC
 *   scale     pipeline.renderScale
 *   realloc   pipeline.setSize() calls that actually rebuilt the render-target chain
 * plus the game context (space, hunter state/stage/flare, run phase, limbs) so a stall can be
 * named by the EVENT it landed on. `programs` vs `textures` vs `heap` is what separates a
 * compile from an upload from a GC, and they need opposite fixes.
 *
 * ⚠️ THE RECORDER MUST NOT BE THE THING IT MEASURES. Every array is preallocated, nothing in
 * the per-frame path allocates, and the autopilot runs IN THE PAGE rather than over CDP — a
 * driver that round-trips `page.evaluate` every few frames adds its own main-thread work and
 * its own jank, which is exactly the contamination this tool exists to avoid.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const flag = (n) => argv.includes(`--${n}`);

const MINUTES = +opt('minutes', 6);
const PORT = +opt('port', 5193);
const QUALITY = opt('quality', 'medium');
const EXTRA = opt('q', '');
const DYNRES = opt('dynres', '1') !== '0';
const LABEL = opt('label', '');
const JSONOUT = opt('json', null);

const log = (...a) => console.log(...a);

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});

// ⚠️ AN OPEN PORT IS NOT THIS PROJECT'S SERVER, AND ASSUMING IT WAS COST A WHOLE MEASUREMENT.
// This used to reuse whatever answered on `PORT`. On 2026-08-04 the fix to `views/game.js` was
// verified against :5193 and reported `programs 447 -> 546 (+99)` — indistinguishable from an
// un-prewarmed baseline, i.e. "the fix does nothing". It was not the fix. Another agent's
// `harness/serve.mjs --dir …/scratchpad/rrr-tablet` held :5193, and being a static server it
// answered `/src/views/game.js` with 3 kB of `index.html` (SPA fallback) instead of 100 kB of
// module. The run measured a STALE SNAPSHOT COPY of the project and said so in numbers that
// looked completely plausible — the same class of failure as this project's other lying
// instruments, and the reason `--label` and `warmupStats` exist.
//
// So: fetch the module the measurement is ABOUT and require it to be the file on disk. Cheap,
// specific, and it fails loudly instead of producing a confident wrong number.
const servingThisProject = async () => {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/src/views/game.js`);
    if (!r.ok) return `GET /src/views/game.js -> ${r.status}`;
    const body = await r.text();
    // A dev server transforms it and it stays large; a static/SPA server hands back index.html.
    if (/<!doctype html/i.test(body.slice(0, 200))) return 'served index.html (a static/SPA server, not vite)';
    if (body.length < 50000) return `served only ${body.length} B (expected ~500 kB transformed)`;
    return null;
  } catch (e) { return `fetch failed: ${String(e).slice(0, 80)}`; }
};

let vite = null;
if (await portOpen(PORT)) {
  const why = await servingThisProject();
  if (why) {
    throw new Error(
      `:${PORT} is occupied by something that is NOT this project's dev server (${why}).\n` +
      `  Refusing to measure it — the numbers would look plausible and describe another build.\n` +
      `  Re-run with a free port, e.g. --port 5199.`);
  }
  log(`  reusing the server already on :${PORT} (verified: it serves this project's src/views/game.js)`);
} else {
  log(`  starting vite on :${PORT} …`);
  vite = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'),
    '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  vite.stderr.on('data', (d) => { err += d.toString(); });
  const t0 = Date.now();
  while (!(await portOpen(PORT))) {
    if (Date.now() - t0 > 30000) { vite.kill(); throw new Error(`vite did not open :${PORT}\n${err}`); }
    await new Promise((r) => setTimeout(r, 300));
  }
}

// Real hardware GL, and `--enable-precise-memory-info` so `performance.memory` is not rounded
// to 5 MB buckets — without it a GC of a few MB is invisible and the GC suspect cannot be
// ruled in or out. `--js-flags=--expose-gc` is deliberately NOT passed: forcing a GC would
// change the thing being measured.
const browser = await chromium.launch({
  headless: !flag('headed'),
  args: [
    '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
    '--enable-zero-copy', '--disable-frame-rate-limit', '--force-device-scale-factor=1',
    '--hide-scrollbars', '--mute-audio', '--disable-dev-shm-usage',
    '--enable-precise-memory-info',
  ],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

// Silence THIS tab's HMR socket. The dev server is shared; another agent's save otherwise
// reloads the page mid-session and every number after it describes a different document.
await page.routeWebSocket((url) => url.hostname === '127.0.0.1' && url.port === String(PORT), () => {});
let navigations = 0;
page.on('framenavigated', (f) => { if (f === page.mainFrame()) navigations++; });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).split('\n')[0].slice(0, 200)));

const url = `http://127.0.0.1:${PORT}/?view=game.play&quality=${QUALITY}${EXTRA ? '&' + EXTRA : ''}`;
log(`  ${url}`);
log(`  LIVE mode (no capture=1) — the dynamic-resolution controller and the live warm-up both run.`);

const tGo = Date.now();
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 240000 });
const readyMs = Date.now() - tGo;
log(`  ready in ${(readyMs / 1000).toFixed(1)} s`);

// ---------------------------------------------------------------- the recorder
//
// Installed BEFORE the play gate is clicked, so it is the FIRST updater in the list and its
// timestamp is as close to frame start as anything can be. `engine.start()` has not happened
// yet at this point (it is deferred to the gate's click), so no frames are missed.
const install = await page.evaluate(({ dynres }) => {
  const e = window.__rrr.engine;
  if (!e) return { ok: false, why: 'no engine' };
  const N = 120000;                                  // 33 min at 60 fps
  const info = e.renderer.info;
  const mem = performance.memory || null;

  const gapT = new Float64Array(N);
  const prog = new Int32Array(N);
  const tex = new Int32Array(N);
  const geo = new Int32Array(N);
  const heap = new Float32Array(N);
  const scale = new Float32Array(N);
  const realc = new Int16Array(N);
  const spIdx = new Int8Array(N);
  const hSt = new Int8Array(N);
  const hStg = new Int8Array(N);
  const hFlr = new Int8Array(N);
  const phIdx = new Int8Array(N);
  const limbs = new Int8Array(N);
  const dtms = new Float32Array(N);
  // ⚠️ THE ONE COLUMN THAT SPLITS THE PROBLEM IN HALF. `renderMs` is wall time spent INSIDE
  // `pipeline.render()`, i.e. our own JS plus any driver call that blocks synchronously —
  // a shader LINK, a render-target allocation, a texture upload. If a 3 s frame has a 3 s
  // `renderMs`, the stall is in work we issued and can move. If `renderMs` is 4 ms and the
  // rAF interval is still 3 s, the stall is OUTSIDE our code — GC, compositor, driver — and
  // needs a completely different fix. No existing tool in this repo reports this.
  const rendMs = new Float32Array(N);
  const bakes = new Int32Array(N);
  const ptVis = new Int8Array(N);
  const ptVisLog = [];
  let lastPtVis = -1;

  const SPACES = (e.room?.spaces ?? []).map((s) => s.id);
  const HSTATES = ['PATROL', 'ALERT', 'STALK', 'SEARCH', 'LOOK', 'PURSUE', 'ATTACK', 'GROW', 'BREACH'];
  const PHASES = ['EXPLORE', 'WINDDOWN', 'RESULTS', 'DOWN'];

  // ---- count render-target chain rebuilds -------------------------------------------------
  // `pipeline.setSize()` early-returns when the scaled size is unchanged, so the only calls
  // that matter are the ones that actually reach `_disposeTargets()`. Counting from outside
  // by watching `pipeline.width` is exact and touches no source file.
  const pl = e.pipeline;
  const origSetSize = pl.setSize.bind(pl);
  let reallocs = 0, sizeCalls = 0, sinceFrame = 0;
  pl.setSize = function (w, h) {
    sizeCalls++;
    const wBefore = pl.width, hBefore = pl.height;
    origSetSize(w, h);
    if (pl.width !== wBefore || pl.height !== hBefore) { reallocs++; sinceFrame++; }
  };

  // ---- NAME WHAT IS COMPILING -------------------------------------------------------------
  //
  // `renderer.info.programs.length` says a compile happened; it does not say WHOSE. three calls
  // `material.onBeforeCompile(parameters, renderer)` exactly once per program build, on the
  // cache MISS path immediately before `acquireProgram` (three 0.180, WebGLRenderer.getProgram),
  // and `parameters` carries the light counts that make up the cache key. So chaining it names
  // the material AND the light variant that was missing.
  //
  // ⚠️ IT HAS TO BE AN ACCESSOR ON `Material.prototype`, NOT A PER-MATERIAL WRAP. Half this
  // scene already has an own `onBeforeCompile` (that is what `patchForScreenAO` installs), and
  // the interesting materials are the ones created DURING play — wall stages, debris, limbs —
  // which do not exist yet at install time. A prototype accessor catches every future
  // assignment; the existing own properties are migrated through it by delete-then-reassign.
  const compiles = [];
  let compileHook = 'none';
  try {
    let anyMat = null;
    e.scene.traverse((o) => { if (!anyMat && o.material) anyMat = Array.isArray(o.material) ? o.material[0] : o.material; });
    let proto = anyMat ? Object.getPrototypeOf(anyMat) : null;
    while (proto && !Object.prototype.hasOwnProperty.call(proto, 'onBeforeCompile')) proto = Object.getPrototypeOf(proto);
    if (proto) {
      const KEY = '__stallOBC';
      const record = (mat, params) => {
        if (compiles.length > 6000) return;
        compiles.push([
          n, mat.type, mat.name || '', mat.uuid.slice(0, 8),
          params.shaderName || params.shaderID || '?',
          params.numDirLights | 0, params.numPointLights | 0, params.numSpotLights | 0,
          params.numHemiLights | 0, params.numDirLightShadows | 0, params.numPointLightShadows | 0,
          params.depthPacking ? 1 : 0, params.instancing ? 1 : 0, params.shadowMapEnabled ? 1 : 0,
        ]);
      };
      Object.defineProperty(proto, 'onBeforeCompile', {
        configurable: true,
        get() {
          const self = this;
          const inner = self[KEY];
          return function (params, r) { try { record(self, params); } catch (_) {} if (inner) return inner.call(self, params, r); };
        },
        set(fn) { Object.defineProperty(this, KEY, { value: fn, writable: true, configurable: true, enumerable: false }); },
      });
      // migrate the own handlers that are already installed
      const seenMat = new Set();
      e.scene.traverse((o) => {
        const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
        for (const m of ms) {
          if (!m || seenMat.has(m.uuid)) continue;
          seenMat.add(m.uuid);
          if (Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) {
            const f = m.onBeforeCompile; delete m.onBeforeCompile; m.onBeforeCompile = f;
          }
        }
      });
      compileHook = `prototype + ${seenMat.size} materials migrated`;
    }
  } catch (err) { compileHook = 'FAILED: ' + String(err).slice(0, 80); }

  // ---- WHO CHANGES THE LIGHT COUNT --------------------------------------------------------
  //
  // `numPointLights` is part of three's program cache key, so every distinct count needs its
  // own copy of EVERY program. `views/game.js`'s warm-up is built on the belief that there are
  // exactly two counts (the hunter's eye flare on and off). If that is wrong, the warm-up is
  // wrong by construction — so count them, live, and name what moves the number.
  const lightLog = [];
  let ptCount = 0, ptAtInstall = 0;
  // Every point light in the scene, so the RENDERED count can be recomputed per frame. three
  // keys programs on `numPointLights`, and that number counts lights in the RENDER LIST — i.e.
  // visible, with every ancestor visible — not lights that merely exist. Scene membership and
  // render-list membership are different numbers and only the second one is in the cache key.
  const ptLights = [];
  const ptVisNames = [];
  const visiblePt = () => {
    let c = 0;
    for (let i = 0; i < ptLights.length; i++) {
      let q = ptLights[i], ok = false;
      while (q) { if (!q.visible) { ok = false; break; } if (q === e.scene) { ok = true; break; } q = q.parent; }
      if (ok) c++;
    }
    return c;
  };
  const visibleNames = () => {
    const out = [];
    for (let i = 0; i < ptLights.length; i++) {
      let q = ptLights[i], ok = false;
      while (q) { if (!q.visible) { ok = false; break; } if (q === e.scene) { ok = true; break; } q = q.parent; }
      if (ok) { const p = []; let r = ptLights[i]; while (r && p.length < 3) { p.unshift(r.name || r.type); r = r.parent; } out.push(p.join('/')); }
    }
    return out;
  };
  try {
    let o3 = e.scene; while (Object.getPrototypeOf(o3) && !Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(o3), 'add')) o3 = Object.getPrototypeOf(o3);
    const O3P = Object.getPrototypeOf(o3);
    const path = (x) => { const p = []; let q = x; while (q && p.length < 4) { p.unshift(q.name || q.type); q = q.parent; } return p.join('/'); };
    const countIn = (x) => { let c = 0; x.traverse((y) => { if (y.isPointLight) { c++; if (!ptLights.includes(y)) ptLights.push(y); } }); return c; };
    ptCount = countIn(e.scene);
    ptAtInstall = ptCount;
    const origAdd = O3P.add, origRemove = O3P.remove;
    O3P.add = function (...objs) {
      const r = origAdd.apply(this, objs);
      for (const o of objs) {
        if (!o || !o.traverse) continue;
        const c = countIn(o);
        if (c) { ptCount += c; if (lightLog.length < 800) lightLog.push([n, +c, o.name || o.type, path(this), ptCount]); }
      }
      return r;
    };
    O3P.remove = function (...objs) {
      for (const o of objs) {
        if (!o || !o.traverse) continue;
        const c = countIn(o);
        if (c) { ptCount -= c; if (lightLog.length < 800) lightLog.push([n, -c, o.name || o.type, path(this), ptCount]); }
      }
      return origRemove.apply(this, objs);
    };
  } catch (err) { lightLog.push([0, 0, 'HOOK FAILED ' + String(err).slice(0, 60), '', 0]); }

  // ---- time inside pipeline.render() ------------------------------------------------------
  const origRender = pl.render.bind(pl);
  let lastRenderMs = 0;
  pl.render = function (tms) {
    const a = performance.now();
    const r = origRender(tms);
    lastRenderMs = performance.now() - a;
    return r;
  };

  // ---- the dynamic-resolution ablation ----------------------------------------------------
  // Suspect #5 lives entirely in `Engine._liveLoop`, which reads `avgFrameMs()` and moves
  // `renderScale`. Neutering it from the harness rather than the source keeps this a pure
  // A/B on one build. `--dynres 0` pins the scale where it is.
  let dynResPinned = false;
  if (!dynres) { e.opts.dynamicRes = false; dynResPinned = true; }

  // Closes the last hole in the attribution. The recorder is UNSHIFTED to the front of
  // `_updaters` so its timestamp is the true frame start, and a second probe is pushed to the
  // BACK so the game's own per-frame work (hunter AI, room, debris, dust, weapons, HUD) can be
  // separated from the render and from everything else. Without this split, "outside
  // pipeline.render()" lumps the game's own JS in with GC, the driver and the compositor —
  // three causes with three different owners.
  const updEnd = new Float64Array(N);

  let n = 0;
  const events = [];
  let lastSpace = -2, lastH = -2, lastFlare = -2, lastStage = -2, lastPhase = -2, lastStg = -2;

  e._updaters.unshift((dt) => {
    if (n >= N) return;
    const now = performance.now();
    gapT[n] = now;
    dtms[n] = dt * 1000;
    prog[n] = info.programs ? info.programs.length : 0;
    tex[n] = info.memory.textures;
    geo[n] = info.memory.geometries;
    heap[n] = mem ? mem.usedJSHeapSize / 1048576 : 0;
    scale[n] = pl.renderScale;
    realc[n] = sinceFrame; sinceFrame = 0;
    // the PREVIOUS frame's render, which is the work the current gap actually measures
    rendMs[n] = lastRenderMs;
    bakes[n] = e.baker ? e.baker.stats.bakes : 0;
    const pv = visiblePt();
    ptVis[n] = pv;
    if (pv !== lastPtVis) {
      if (ptVisLog.length < 400) ptVisLog.push([n, pv, visibleNames()]);
      lastPtVis = pv;
    }

    const p = e.player, h = e.hunter;
    const sp = e.room ? e.room.spaceAt(p.pos) : null;
    const si = sp ? SPACES.indexOf(sp.id) : -1;
    spIdx[n] = si;
    const hs = h ? HSTATES.indexOf(h.state) : -1;
    hSt[n] = hs;
    hStg[n] = h ? h.stage : -1;
    hFlr[n] = h && h._flareOn ? 1 : 0;
    phIdx[n] = e.run ? PHASES.indexOf(e.run.phase) : -1;
    let lc = 0;
    if (p && p.rig) {
      const S = ['shoulderR', 'shoulderL', 'hipR', 'hipL'];
      for (let i = 0; i < 4; i++) if (p.rig.occupant(S[i]) !== 'empty') lc++;
    }
    limbs[n] = lc;

    // A tiny event log, so a stall can be named by what it landed on. Only fires on CHANGE,
    // so it allocates a handful of times per minute rather than per frame.
    if (si !== lastSpace) { events.push([n, 'space', sp ? sp.id : '(none)']); lastSpace = si; }
    if (hs !== lastH) { events.push([n, 'hunter', h ? h.state : '?']); lastH = hs; }
    if (hFlr[n] !== lastFlare) { events.push([n, 'flare', hFlr[n] ? 'ON' : 'off']); lastFlare = hFlr[n]; }
    if (hStg[n] !== lastStg) { events.push([n, 'stage', String(hStg[n])]); lastStg = hStg[n]; }
    if (phIdx[n] !== lastPhase) { events.push([n, 'phase', e.run ? e.run.phase : '?']); lastPhase = phIdx[n]; }

    n++;
  });
  // last in the list: everything between this and `gapT[n]` is the game's own update work
  e.onUpdate(() => { if (n > 0 && n <= N) updEnd[n - 1] = performance.now(); });

  // `dump()` needs the LIVE frame count under a name that is not `n`, because `dump()` below
  // declares its own local `n` (deliberately shadowing this one — see the note there) and any
  // bare `n` written inside that function body would resolve to the shadow, TDZ and all, even
  // on a line that runs before the shadow's own declaration.
  const liveN = () => n;

  window.__stall = {
    get n() { return n; },
    get reallocs() { return reallocs; },
    get sizeCalls() { return sizeCalls; },
    dynResPinned,
    /**
     * @param {number} [deadlineMs] ⚠️ DROP SAMPLES PAST THE SESSION DEADLINE. The recorder
     *   never stops itself — it is still live, on the page's own rAF loop, at the moment this
     *   is called — and `dump()` is a synchronous, O(n log n) pass over every recorded frame,
     *   invoked from Node only AFTER `MINUTES` has already elapsed and the browser has kept
     *   right on recording in the meantime. Measured: the `--dynres 0` arm's worst three
     *   frames (of 76 000+) sat in the LAST SIX SAMPLES, at t = 296.2 / 300.5 / 306.0 s of a
     *   nominal 300 s run — `rend` 4-6 ms (the renderer was fine) against `outside` 1.4-5.5 s
     *   (unaccounted-for main-thread time) — this tool's own end-of-session readback of tens
     *   of thousands of frames blocking the main thread, recorded as if it were a game stall.
     *   `deadlineMs` (pass the same `totalMs` the session was told to run for) clamps the
     *   frame count to the last sample at or before `gapT[1] + deadlineMs`, so nothing
     *   recorded after the intended session end reaches a percentile, a histogram bucket or
     *   the worst-frames table. Omitted (or non-finite): every recorded frame is used, exactly
     *   the old behaviour — existing callers are not silently changed.
     */
    dump(deadlineMs) {
      const total = liveN();
      // Shadows the outer `n` for the REST of this function on purpose: every loop and index
      // below already reads the bare identifier, so clamping it once here is the whole fix and
      // nothing downstream has to know a deadline was ever applied.
      const n = (() => {
        if (!Number.isFinite(deadlineMs) || total <= 1) return total;
        const limit = gapT[1] + deadlineMs;
        let i = 1;
        while (i < total && gapT[i] <= limit) i++;
        return i;
      })();
      const gaps = new Array(n);
      gaps[0] = 0;
      for (let i = 1; i < n; i++) gaps[i] = Math.round((gapT[i] - gapT[i - 1]) * 1000) / 1000;
      // top offenders, with the deltas that name the cause
      const order = [];
      for (let i = 1; i < n; i++) order.push(i);
      order.sort((a, b) => gaps[b] - gaps[a]);
      const ctx = (i) => ({
        i, tSec: +((gapT[i] - gapT[1]) / 1000).toFixed(2), gap: +gaps[i].toFixed(2),
        dprog: prog[i] - prog[i - 1], dtex: tex[i] - tex[i - 1], dgeo: geo[i] - geo[i - 1],
        dheap: +(heap[i] - heap[i - 1]).toFixed(2), heap: +heap[i].toFixed(1),
        rend: +rendMs[i].toFixed(1),
        upd: +Math.max(0, updEnd[i - 1] - gapT[i - 1]).toFixed(1),
        outside: +(gaps[i] - rendMs[i] - Math.max(0, updEnd[i - 1] - gapT[i - 1])).toFixed(1),
        dbake: bakes[i] - bakes[i - 1],
        prog: prog[i], tex: tex[i], scale: +scale[i].toFixed(3), realloc: realc[i],
        space: spIdx[i] >= 0 ? SPACES[spIdx[i]] : null,
        hunter: hSt[i] >= 0 ? HSTATES[hSt[i]] : null, stage: hStg[i], flare: !!hFlr[i],
        phase: phIdx[i] >= 0 ? PHASES[phIdx[i]] : null, limbs: limbs[i],
        dtms: +dtms[i].toFixed(1),
      });
      const worst = order.slice(0, 60).map(ctx);
      // histogram, log-ish buckets in ms
      const edges = [16.7, 20, 25, 33, 50, 100, 200, 500, 1000, 2000, 5000];
      const hist = new Array(edges.length + 1).fill(0);
      for (let i = 1; i < n; i++) {
        let b = 0; while (b < edges.length && gaps[i] > edges[b]) b++;
        hist[b]++;
      }
      // how much wall-clock time is spent in frames over 100 ms
      let overMs = 0, over100 = 0, over1000 = 0;
      for (let i = 1; i < n; i++) { if (gaps[i] > 100) { over100++; overMs += gaps[i]; } if (gaps[i] > 1000) over1000++; }

      // ---- FREEZE EPISODES, which is the thing a PLAYER actually perceives ----------------
      // John says "it freezes for 5 seconds". No single frame has to be 5 s long for that to
      // be true: a 400 ms frame followed by forty 90 ms frames is a five-second freeze and a
      // per-frame maximum reports it as 400 ms. An episode is a maximal run of frames slower
      // than 25 ms (i.e. under 40 fps) containing at least one frame over 120 ms, and its
      // LENGTH is what the complaint is about.
      const eps = [];
      for (let i = 1; i < n; i++) {
        if (gaps[i] <= 25) continue;
        let j = i, sum = 0, peak = 0, dp = 0, dt2 = 0, re = 0, gc = 0, bk = 0, rsum = 0, usum = 0;
        // allow up to 6 good frames inside an episode before calling it over
        let good = 0;
        while (j < n && good <= 6) {
          if (gaps[j] > 25) { good = 0; } else { good++; }
          sum += gaps[j]; rsum += rendMs[j]; usum += Math.max(0, updEnd[j - 1] - gapT[j - 1]);
          if (gaps[j] > peak) peak = gaps[j];
          dp += Math.max(0, prog[j] - prog[j - 1]);
          dt2 += Math.max(0, tex[j] - tex[j - 1]);
          re += realc[j];
          bk += Math.max(0, bakes[j] - bakes[j - 1]);
          if (heap[j] - heap[j - 1] < -2) gc++;
          j++;
        }
        if (peak > 120) {
          eps.push({
            i, frames: j - i, ms: +sum.toFixed(0), peak: +peak.toFixed(0),
            renderMs: +rsum.toFixed(0), updateMs: +usum.toFixed(0),
            progs: dp, texs: dt2, reallocs: re, bakes: bk, gcs: gc,
            tSec: +((gapT[i] - gapT[1]) / 1000).toFixed(1),
            space: spIdx[i] >= 0 ? SPACES[spIdx[i]] : null,
            hunter: hSt[i] >= 0 ? HSTATES[hSt[i]] : null,
            flare: !!hFlr[i], stage: hStg[i], phase: phIdx[i] >= 0 ? PHASES[phIdx[i]] : null,
          });
        }
        i = j;
      }
      eps.sort((a, b) => b.ms - a.ms);
      return {
        n, gaps, worst, hist, edges, over100, over1000, overMs: +overMs.toFixed(0),
        episodes: eps.slice(0, 25), episodeCount: eps.length,
        episodeMs: +eps.reduce((s, x) => s + x.ms, 0).toFixed(0),
        bakesFirst: bakes[1], bakesLast: bakes[n - 1],
        reallocs, sizeCalls, dynResPinned,
        wallSec: +((gapT[n - 1] - gapT[1]) / 1000).toFixed(1),
        progFirst: prog[1], progLast: prog[n - 1],
        texFirst: tex[1], texLast: tex[n - 1],
        heapFirst: +heap[1].toFixed(1), heapLast: +heap[n - 1].toFixed(1),
        // ⚠️ NOT `Math.min(...arr)` — 20 000+ frames is a stack overflow, and it would throw
        // AFTER the whole session had been paid for. Loop.
        scaleMin: (() => { let m = Infinity; for (let i = 1; i < n; i++) if (scale[i] < m) m = scale[i]; return m === Infinity ? 0 : m; })(),
        scaleMax: (() => { let m = 0; for (let i = 1; i < n; i++) if (scale[i] > m) m = scale[i]; return m; })(),
        events: events.slice(0, 4000),
        spaces: SPACES,
        compileHook, compiles, lightLog, ptAtInstall, ptAtEnd: ptCount, ptVisLog,
        ptVisCounts: (() => { const m = {}; for (let i = 1; i < n; i++) m[ptVis[i]] = (m[ptVis[i]] ?? 0) + 1; return m; })(),
        // uuid -> where it lives in the scene, resolved once, offline
        matHome: (() => {
          const want = new Set(compiles.map((c) => c[3]));
          const out = {};
          e.scene.traverse((o) => {
            const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
            for (const m of ms) {
              const k = m && m.uuid.slice(0, 8);
              if (!k || !want.has(k) || out[k]) continue;
              const path = [];
              let q = o; while (q && path.length < 5) { path.unshift(q.name || q.type); q = q.parent; }
              out[k] = path.join('/');
            }
          });
          return out;
        })(),
      };
    },
  };
  return { ok: true, spaces: SPACES, dynResPinned, precise: !!mem };
}, { dynres: DYNRES });

if (!install.ok) { console.error('  install failed:', install.why); await browser.close(); process.exit(3); }
log(`  recorder installed · spaces ${install.spaces.join(', ')}` +
  `${install.dynResPinned ? ' · DYNAMIC RESOLUTION PINNED (ablation)' : ''}` +
  `${install.precise ? '' : ' · ⚠ performance.memory unavailable, heap column is dead'}`);

// ---------------------------------------------------------------- the PROOF experiment
//
// `--prewarm` re-runs the load-time warm-up from the harness with the two things `views/game.js`
// leaves out: EVERY object visible (not just every space and panel root) and FOUR point-light
// counts instead of two. If the diagnosis is right this collapses the in-play program builds to
// near zero and the multi-second episodes with them; if it does not, the diagnosis is wrong.
// It is done from the harness on purpose — no source file changes, so it is a clean A/B on one
// build, and the fix can then be specified to whoever owns the file.
if (flag('prewarm')) {
  const t = Date.now();
  const pw = await page.evaluate(() => {
    const e = window.__rrr.engine, room = e.room;
    const cam = e.camera;
    const camWas = cam.position.clone(), quatWas = cam.quaternion.clone();
    // snapshot every visibility flag, then force the whole scene on
    const was = [];
    e.scene.traverse((o) => { was.push([o, o.visible]); o.visible = true; });
    // the nail gun's own point lights are the pair that moves the count in play
    const gunLights = [];
    e.scene.traverse((o) => {
      if (!o.isPointLight) return;
      let q = o, tag = '';
      while (q) { tag = (q.name || '') + '/' + tag; q = q.parent; }
      if (/nailgun/i.test(tag)) gunLights.push(o);
    });
    const flare = e.hunter && e.hunter.flare;
    const key = (() => { let k = null; e.scene.traverse((o) => { if (!k && o.isSpotLight) k = o; }); return k; })();
    const before = e.renderer.info.programs.length;
    let renders = 0;
    for (const gunOn of [true, false]) {
      for (const l of gunLights) l.visible = gunOn;
      for (const flareOn of [true, false]) {
        if (flare) { if (flareOn) e.hunter.root.add(flare); else flare.removeFromParent(); }
        for (const s of room.spaces) {
          const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
          if (key) { key.position.set(cx, 3.2, cz); key.target.position.set(cx, 0, cz); key.target.updateMatrixWorld(true); }
          cam.position.set(cx, 1.6, cz);
          for (const look of [[s.x0, s.z0], [s.x1, s.z1], [s.x0, s.z1], [s.x1, s.z0]]) {
            cam.lookAt(look[0], 1.2, look[1]);
            cam.updateMatrixWorld(true);
            e.pipeline.render(0);
            renders++;
          }
        }
      }
    }
    if (flare) flare.removeFromParent();
    for (const l of gunLights) l.visible = true;
    for (const [o, v] of was) o.visible = v;
    cam.position.copy(camWas); cam.quaternion.copy(quatWas); cam.updateMatrixWorld(true);
    return { gunLights: gunLights.length, renders, before, after: e.renderer.info.programs.length };
  });
  log(`  PREWARM: ${pw.renders} renders over 4 light variants (${pw.gunLights} nail-gun lights found)` +
    ` · programs ${pw.before} -> ${pw.after} (+${pw.after - pw.before}) in ${((Date.now() - t) / 1000).toFixed(1)} s`);
}

// ---------------------------------------------------------------- start playing
await page.click('#rrr-play-btn').catch(() => page.click('#rrr-play-gate').catch(() => {}));
await page.waitForTimeout(700);

// Look channel. `Input` writes `mouse.dx` from a window `mousemove` ONLY while pointer lock is
// held, and from a pointer DRAG only while it is not. Pick whichever actually moves the yaw
// rather than assuming — a driver that cannot aim is this project's most repeated instrument
// failure.
const lockOK = await page.evaluate(() => {
  const e = window.__rrr.engine, y0 = e.cam.yaw;
  for (let i = 0; i < 8; i++) window.dispatchEvent(new MouseEvent('mousemove', { movementX: 25, bubbles: true }));
  return { locked: document.pointerLockElement != null, y0 };
});
await page.waitForTimeout(200);
const moved = await page.evaluate((y0) => Math.abs(window.__rrr.engine.cam.yaw - y0) > 1e-4, lockOK.y0);
log(`  look channel: pointerLock=${lockOK.locked} mousemove-drives-yaw=${moved}`);

// ---------------------------------------------------------------- the autopilot
//
// IN THE PAGE, on the engine's own update list, so the measurement window contains no CDP
// traffic at all. It plays the loop a player plays: tour the house, stop and shoot, run away
// when the hunter closes, and when it has toured enough, go and open the live exit and step
// out. That is what makes debris, dust, wall damage, limb loss, hunter growth and the yard's
// residency ACCUMULATE — the thing no scripted scenario has ever done.
await page.evaluate(({ useMouseMove, minutes }) => {
  const e = window.__rrr.engine;
  const p = e.player, room = e.room;
  const held = new Set();
  const key = (code, down) => {
    if (down && held.has(code)) return;
    if (!down && !held.has(code)) return;
    if (down) held.add(code); else held.delete(code);
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
  };
  let dragId = 9001, dragX = 640, dragY = 360, dragDown = false;
  const canvas = e.canvas;
  const look = (dx, dy) => {
    if (useMouseMove) {
      window.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: dy, bubbles: true }));
      return;
    }
    if (!dragDown) {
      canvas.dispatchEvent(new PointerEvent('pointerdown', { pointerId: dragId, clientX: dragX, clientY: dragY, bubbles: true, pointerType: 'mouse' }));
      dragDown = true;
    }
    dragX += dx; dragY += dy;
    if (dragX < 40 || dragX > 1880) { dragX = 640; dragDown = false; return; }
    canvas.dispatchEvent(new PointerEvent('pointermove', { pointerId: dragId, clientX: dragX, clientY: dragY, bubbles: true, pointerType: 'mouse' }));
  };
  let firing = false;
  const fire = (on) => {
    if (on === firing) return;
    firing = on;
    window.dispatchEvent(new MouseEvent(on ? 'mousedown' : 'mouseup', { button: 0, bubbles: true }));
  };

  const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  // yaw per synthetic pixel — calibrated once, live, rather than assumed
  let perPx = 0.0025;
  {
    const y0 = e.cam.yaw;
    for (let i = 0; i < 10; i++) look(20, 0);
    // cam.look is applied on the next update; calibrate lazily on the first autopilot frame
    var _calib = { y0, done: false };
  }

  const ANCHORS = room.anchorNames().filter((n) => !/^(hide|duel)\./.test(n));
  const tour = [];
  for (const n of ANCHORS) { const a = room.anchor(n); if (a) tour.push({ n, x: a.x, z: a.z, sp: room.spaceAt(a)?.id ?? null }); }

  const live = e.exits.find((q) => e.run.isLiveExit(q.site.id));
  const site = live ? {
    x: live.panel.root.position.x, z: live.panel.root.position.z,
    nx: live.panel.normal.x, nz: live.panel.normal.z, out: live.outSign,
    room: live.site.a, id: live.site.id,
  } : null;
  const stand = site ? { x: site.x + site.nx * -site.out * 2.6, z: site.z + site.nz * -site.out * 2.6 } : null;

  const st = {
    phase: 'tour', ti: 0, hops: [], hop: 0, t: 0, lastShoot: 0, shootUntil: -1,
    stuck: 0, lastX: 0, lastZ: 0, retreats: 0, laps: 0, log: [], goal: null,
  };
  const EXIT_AT = minutes * 60 * 0.55;      // spend the first ~55% touring, then go for the exit
  const push = (s) => { if (st.log.length < 400) st.log.push(`${st.t.toFixed(1)}s ${s}`); };

  const routeTo = (tx, tz, toSp) => {
    const from = room.spaceAt(p.pos)?.id;
    const to = toSp ?? room.spaceAt({ x: tx, y: 0, z: tz })?.id;
    if (!from || !to || from === to) return [];
    return room.pathPortals(from, to, 0.9).map((q) => ({ x: q.centre.x, z: q.centre.z }));
  };
  const setGoal = (tx, tz, toSp, why) => {
    st.hops = routeTo(tx, tz, toSp); st.hop = 0; st.goal = { x: tx, z: tz };
    push(`goal ${why} via ${st.hops.length} hops`);
  };

  const nextTourStop = () => {
    st.ti = (st.ti + 1) % tour.length;
    if (st.ti === 0) st.laps++;
    const g = tour[st.ti];
    setGoal(g.x, g.z, g.sp, `tour ${g.n}`);
  };

  e.onUpdate((dt, t) => {
    st.t += dt;
    if (!_calib.done) {
      const dy = wrap(e.cam.yaw - _calib.y0);
      if (Math.abs(dy) > 1e-5) { perPx = dy / 200; _calib.done = true; }
      else { for (let i = 0; i < 10; i++) look(20, 0); return; }
    }

    const h = e.hunter;
    const hd = h ? Math.hypot(h.root.position.x - p.pos.x, h.root.position.z - p.pos.z) : 99;
    const down = p.caps && p.caps.gait === 'down';

    // ---- pick the current objective ------------------------------------------------------
    if (down) { key('KeyW', false); key('ShiftLeft', false); fire(false); return; }

    if (st.phase === 'tour' && st.t > EXIT_AT && site) {
      st.phase = 'exit'; push('going for the live exit ' + site.id);
      setGoal(stand.x, stand.z, site.room, 'the exit');
    }

    // Break contact when it commits — a player who stands still is measuring a mistake, and a
    // dead player stops accumulating anything.
    if ((hd < 7.5 || (h && h.committed)) && st.phase !== 'flee') {
      st.resume = st.phase; st.phase = 'flee'; st.retreats++;
      const far = tour.reduce((m, g) => {
        const d = Math.hypot(g.x - p.pos.x, g.z - p.pos.z);
        return (!m || d > m.d) ? { g, d } : m;
      }, null);
      if (far) setGoal(far.g.x, far.g.z, far.g.sp, 'flee');
      push(`flee at ${hd.toFixed(1)} m (${h ? h.state : '?'}) limbs`);
    }
    if (st.phase === 'flee' && hd > 16 && h && !h.committed && (h.state === 'PATROL' || h.state === 'SEARCH')) {
      st.phase = st.resume || 'tour';
      if (st.phase === 'exit' && site) setGoal(stand.x, stand.z, site.room, 'back to the exit');
      else nextTourStop();
      push(`contact broken at ${hd.toFixed(1)} m`);
    }

    // ---- steer toward the goal -----------------------------------------------------------
    let tx = st.goal ? st.goal.x : p.pos.x, tz = st.goal ? st.goal.z : p.pos.z;
    if (st.hop < st.hops.length) { tx = st.hops[st.hop].x; tz = st.hops[st.hop].z; }
    const dx = tx - p.pos.x, dz = tz - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < (st.hop < st.hops.length ? 0.9 : 1.4)) {
      if (st.hop < st.hops.length) st.hop++;
      else if (st.phase === 'tour') nextTourStop();
    }

    const want = Math.atan2(dx, dz);
    const dyaw = wrap(want - e.cam.yaw);
    const dpitch = -e.cam.pitch;
    if (Math.abs(dyaw) > 0.02 || Math.abs(dpitch) > 0.03) {
      look(Math.max(-260, Math.min(260, Math.round(dyaw / perPx))),
        Math.max(-160, Math.min(160, Math.round(dpitch / perPx))));
    }

    // ---- move ----------------------------------------------------------------------------
    const walking = d > 1.2 || st.phase === 'flee';
    key('KeyW', walking);
    key('ShiftLeft', st.phase === 'flee' || d > 4);

    // Unstick — a body wedged on a doorjamb stops accumulating anything. ⚠️ ACCUMULATE
    // SECONDS, NOT FRAMES: the first version counted frames, and headless runs at 150–190 fps,
    // so "stuck for 45 frames" fired after 0.25 s of merely TURNING ON THE SPOT and the driver
    // skipped a tour stop every 0.4 s. It looked like a fast tour and was a stationary one.
    if (Math.hypot(p.pos.x - st.lastX, p.pos.z - st.lastZ) < 1.2 * dt) st.stuck += dt; else st.stuck = 0;
    st.lastX = p.pos.x; st.lastZ = p.pos.z;
    if (st.stuck > 1.2) {
      key('KeyD', true); key('KeyW', true);
      if (st.stuck > 2.4) { key('KeyD', false); st.stuck = 0; if (st.phase === 'tour') nextTourStop(); }
    } else key('KeyD', false);

    // ---- shoot ---------------------------------------------------------------------------
    // At the exit: hold the trigger on the panel. Touring: a burst every few seconds, which is
    // what actually makes debris, dust and wall damage accumulate over minutes.
    if (st.phase === 'exit' && site && d < 3.2) {
      const ddx = site.x - p.pos.x, ddz = site.z - p.pos.z;
      const dw = wrap(Math.atan2(ddx, ddz) - e.cam.yaw);
      if (Math.abs(dw) > 0.04) look(Math.max(-200, Math.min(200, Math.round(dw / perPx))), 0);
      key('KeyW', false);
      fire(true);
    } else if (st.phase === 'flee') {
      fire(false);
    } else {
      if (st.t - st.lastShoot > 5) { st.lastShoot = st.t; st.shootUntil = st.t + 1.4; }
      fire(st.t < st.shootUntil);
    }
  });

  window.__auto = st;
  window.__autoInfo = { tour: tour.map((g) => g.n), site: site ? site.id : null, exitAt: EXIT_AT };
}, { useMouseMove: moved, minutes: MINUTES });

const info = await page.evaluate(() => window.__autoInfo);
log(`  autopilot: ${info.tour.length} tour stops · live exit ${info.site} · goes for it at ${info.exitAt.toFixed(0)} s`);

// ---------------------------------------------------------------- run
const totalMs = MINUTES * 60 * 1000;
const t0 = Date.now();
let lastN = 0;
while (Date.now() - t0 < totalMs) {
  await page.waitForTimeout(20000);
  const s = await page.evaluate(() => ({
    n: window.__stall.n, reallocs: window.__stall.reallocs,
    phase: window.__auto.phase, laps: window.__auto.laps, retreats: window.__auto.retreats,
    t: window.__auto.t,
  }));
  const fps = (s.n - lastN) / 20; lastN = s.n;
  log(`   ${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s  ${s.n} frames (${fps.toFixed(1)} fps)` +
    `  phase ${s.phase}  laps ${s.laps}  retreats ${s.retreats}  RT rebuilds ${s.reallocs}`);
  if (navigations > 1) { console.error('  FAIL: the page navigated mid-session. Re-run.'); break; }
}

// ⚠️ PASS THE DEADLINE — see the note on `dump()` itself. Without it, whatever the browser
// recorded between the while loop's exit and this call landing (including `dump()`'s own
// synchronous readback of the previous call, on a re-run) is reported as session data.
const d = await page.evaluate((deadlineMs) => window.__stall.dump(deadlineMs), totalMs);
const autoLog = await page.evaluate(() => window.__auto.log);

// ---------------------------------------------------------------- report
const gaps = d.gaps.slice(1).sort((a, b) => a - b);
const pct = (q) => gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * q))] : 0;
const fmt = (x) => (+x).toFixed(2);
const arm = LABEL || (EXTRA ? EXTRA : 'default') + (DYNRES ? '' : ' +dynres=0');

log('');
log(`  ===== PERF-STALL · ${arm} · ${d.wallSec} s · ${d.n} frames =====`);
log(`  p50 ${fmt(pct(0.5))}   p95 ${fmt(pct(0.95))}   p99 ${fmt(pct(0.99))}   p99.9 ${fmt(pct(0.999))}` +
  `   MAX ${fmt(gaps[gaps.length - 1])} ms`);
log(`  frames >100 ms: ${d.over100}   >1000 ms: ${d.over1000}   total time inside them: ${(d.overMs / 1000).toFixed(1)} s` +
  ` (${(100 * d.overMs / (d.wallSec * 1000)).toFixed(1)}% of the session)`);
log(`  programs ${d.progFirst} -> ${d.progLast}    textures ${d.texFirst} -> ${d.texLast}` +
  `    heap ${d.heapFirst} -> ${d.heapLast} MB`);
log(`  renderScale ${d.scaleMin.toFixed(3)}–${d.scaleMax.toFixed(3)}   RENDER-TARGET REBUILDS ${d.reallocs}` +
  ` (setSize calls ${d.sizeCalls})${d.dynResPinned ? '   [dynres PINNED]' : ''}`);
log('');
log('  histogram (rAF interval)');
{
  const labels = d.edges.map((x, i) => `${i ? d.edges[i - 1] : 0}–${x}`).concat([`>${d.edges[d.edges.length - 1]}`]);
  for (let i = 0; i < d.hist.length; i++) {
    if (!d.hist[i]) continue;
    const share = 100 * d.hist[i] / d.n;
    log(`   ${labels[i].padStart(12)} ms  ${String(d.hist[i]).padStart(6)}  ${'#'.repeat(Math.max(1, Math.round(share / 2)))} ${share.toFixed(2)}%`);
  }
}
log('');
log(`  FREEZE EPISODES — a maximal run under 40 fps with a frame over 120 ms in it. THIS is what`);
log(`  a player calls "a freeze". ${d.episodeCount} of them, ${(d.episodeMs / 1000).toFixed(1)} s total` +
  ` (${(100 * d.episodeMs / (d.wallSec * 1000)).toFixed(1)}% of the session).`);
log(`   ${'t s'.padStart(7)} ${'length'.padStart(8)} ${'frames'.padStart(7)} ${'peak'.padStart(8)} ${'render'.padStart(8)} ${'update'.padStart(8)} ${'elsewhere'.padStart(9)} ${'progs'.padStart(6)} ${'texs'.padStart(5)} ${'RTreb'.padStart(6)}  where`);
for (const ep of d.episodes.slice(0, 12)) {
  const other = Math.max(0, ep.ms - ep.renderMs - (ep.updateMs ?? 0));
  log(`   ${String(ep.tSec).padStart(7)} ${(ep.ms / 1000).toFixed(2).padStart(7)}s ${String(ep.frames).padStart(7)}` +
    ` ${String(ep.peak).padStart(6)}ms ${(ep.renderMs / 1000).toFixed(2).padStart(7)}s ${((ep.updateMs ?? 0) / 1000).toFixed(2).padStart(7)}s` +
    ` ${(other / 1000).toFixed(2).padStart(8)}s ${String(ep.progs).padStart(6)}` +
    ` ${String(ep.texs).padStart(5)} ${String(ep.reallocs).padStart(6)}` +
    `  ${ep.space ?? '-'} · ${ep.hunter}${ep.flare ? '+flare' : ''} st${ep.stage}`);
}

log('');
log('  WORST FRAMES — dprog names a COMPILE, dtex an UPLOAD, dheap a GC, realloc an RT rebuild');
log('  `rend` is time inside pipeline.render(); `out` is the rest of the interval (GC/driver/compositor)');
log(`   ${'t s'.padStart(7)} ${'gap ms'.padStart(9)} ${'rend'.padStart(8)} ${'upd'.padStart(7)} ${'else'.padStart(8)} ${'dprog'.padStart(6)} ${'dtex'.padStart(5)} ${'rt'.padStart(3)} ${'bk'.padStart(3)} ${'scale'.padStart(6)}  where`);
for (const w of d.worst.slice(0, 26)) {
  log(`   ${String(w.tSec).padStart(7)} ${fmt(w.gap).padStart(9)} ${String(w.rend).padStart(8)} ${String(w.upd).padStart(7)} ${String(w.outside).padStart(8)}` +
    ` ${String(w.dprog).padStart(6)} ${String(w.dtex).padStart(5)} ${String(w.realloc).padStart(3)}` +
    ` ${String(w.dbake).padStart(3)} ${w.scale.toFixed(3).padStart(6)}` +
    `  ${w.space ?? '-'} · ${w.hunter}${w.flare ? '+flare' : ''} st${w.stage} · ${w.phase} · limbs ${w.limbs}`);
}

// attribute the tail
const tail = d.worst.filter((w) => w.gap > 100);
const byProg = tail.filter((w) => w.dprog > 0);
const byTex = tail.filter((w) => w.dtex > 0);
const byRe = tail.filter((w) => w.realloc > 0);
const byGC = tail.filter((w) => w.dheap < -2 && w.dprog === 0 && w.dtex === 0);
const unex = tail.filter((w) => w.dprog === 0 && w.dtex === 0 && w.realloc === 0 && !(w.dheap < -2));
log('');
log(`  ATTRIBUTION of the ${tail.length} worst frames over 100 ms:`);
log(`    compile (dprog>0)          ${byProg.length}   total programs added ${byProg.reduce((s, w) => s + w.dprog, 0)}`);
log(`    upload  (dtex>0)           ${byTex.length}   total textures added ${byTex.reduce((s, w) => s + w.dtex, 0)}`);
log(`    RT rebuild (realloc>0)     ${byRe.length}`);
log(`    GC      (heap dropped)     ${byGC.length}`);
log(`    UNEXPLAINED                ${unex.length}`);
{
  const inRender = tail.filter((w) => w.rend > w.gap * 0.6).length;
  const inUpdate = tail.filter((w) => w.upd > w.gap * 0.6).length;
  const elsewhere = tail.filter((w) => w.outside > w.gap * 0.6).length;
  log(`    WHERE THE TIME WENT: inside pipeline.render() ${inRender}/${tail.length}` +
    ` · inside the game's own update ${inUpdate}/${tail.length}` +
    ` · ELSEWHERE (GC / driver / compositor / setSize) ${elsewhere}/${tail.length}`);
}
{
  // ⚠️ SAY WHEN A COLUMN IS DEAD. Chrome quantises `performance.memory.usedJSHeapSize` and
  // this box does not honour `--enable-precise-memory-info`: if the value never moves across
  // the whole session then GC is NOT ruled out by this run, it is UNMEASURED. A tool that
  // silently reports "0 GC events" from a frozen counter is the lying-instrument pattern.
  const moved = d.worst.some((w) => w.dheap !== 0) || d.heapFirst !== d.heapLast;
  if (!moved) log(`    ⚠ HEAP COLUMN IS DEAD (usedJSHeapSize never moved from ${d.heapFirst} MB).` +
    ` GC is UNMEASURED here, not ruled out — a GC pause would land in ELSEWHERE.`);
}
log(`  bakes ${d.bakesFirst} -> ${d.bakesLast} (a bake during play is a multi-hundred-ms upload)`);

// ---- WHAT compiled, which is the half that names a fix ------------------------------------
if (d.compiles && d.compiles.length) {
  log('');
  log(`  WHAT COMPILED DURING PLAY (${d.compiles.length} program builds · hook: ${d.compileHook})`);
  const key = (c) => `${c[1]}|${c[4]}|dir${c[5]} pt${c[6]} sp${c[7]} hemi${c[8]} shadow(d${c[9]} p${c[10]})|depth${c[11]}|inst${c[12]}`;
  const groups = new Map();
  for (const c of d.compiles) {
    const k = key(c);
    let g = groups.get(k);
    if (!g) { g = { k, n: 0, names: new Set(), homes: new Set(), frames: [] }; groups.set(k, g); }
    g.n++;
    if (c[2]) g.names.add(c[2]);
    const h = d.matHome[c[3]]; if (h) g.homes.add(h);
    if (g.frames.length < 4) g.frames.push(c[0]);
  }
  const gs = [...groups.values()].sort((a, b) => b.n - a.n);
  for (const g of gs.slice(0, 20)) {
    log(`   ${String(g.n).padStart(4)}x  ${g.k}`);
    const where = [...g.homes].slice(0, 2).join(' , ') || [...g.names].slice(0, 3).join(', ') || '(gone from the scene by the end)';
    log(`          ${where}`);
  }
  // the light-count census is the discriminator against the existing warm-up, which covers
  // exactly TWO point-light counts (hunter flare on / off) per space
  const byLights = new Map();
  for (const c of d.compiles) {
    const k = `dir${c[5]} pt${c[6]} spot${c[7]} hemi${c[8]}`;
    byLights.set(k, (byLights.get(k) ?? 0) + 1);
  }
  log('');
  log('  …grouped by LIGHT COUNT (the part of the program cache key the warm-up is built around):');
  for (const [k, v] of [...byLights.entries()].sort((a, b) => b[1] - a[1])) log(`   ${String(v).padStart(4)}x  ${k}`);
  const depth = d.compiles.filter((c) => c[11]).length;
  log(`   of all builds, ${depth} were DEPTH/shadow programs and ${d.compiles.length - depth} were main-pass`);
}

if (d.lightLog) {
  log('');
  log(`  WHO MOVES THE POINT-LIGHT COUNT (${d.ptAtInstall} point lights in the scene at boot, ${d.ptAtEnd} at the end)`);
  log(`  RENDERED point-light counts and how many frames each was live for: ` +
    Object.entries(d.ptVisCounts).map(([k, v]) => `${k}:${v}`).join('  '));
  log(`  ⚠ EVERY DISTINCT COUNT IS A SEPARATE COPY OF EVERY PROGRAM IN THE SCENE.`);
  for (const [f, c, names] of (d.ptVisLog ?? []).slice(0, 14)) {
    log(`   f${String(f).padStart(6)}  -> ${c} lights: ${names.slice(0, 12).join(', ')}`);
  }
  const g = new Map();
  for (const [, delta, name, parent] of d.lightLog) {
    const k = `${delta > 0 ? '+' : ''}${delta}  ${name}  ->  ${parent}`;
    g.set(k, (g.get(k) ?? 0) + 1);
  }
  for (const [k, v] of [...g.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14)) log(`   ${String(v).padStart(5)}x  ${k}`);
  const counts = new Set(d.lightLog.map((x) => x[4]));
  log(`   distinct running totals seen: ${[...counts].sort((a, b) => a - b).join(', ')}`);
}

log('');
log(`  events near the worst frame:`);
{
  const wi = d.worst[0]?.i ?? 0;
  for (const [i, k, v] of d.events) if (Math.abs(i - wi) < 400) log(`    f${i} ${k} ${v}`);
}
log('');
log(`  autopilot: ${autoLog.slice(0, 24).join(' | ')}`);
if (pageErrors.length) log(`  page errors: ${[...new Set(pageErrors)].slice(0, 3).join(' | ')}`);
if (navigations > 1) log(`  ⚠ ${navigations} navigations — the session was interrupted`);

if (JSONOUT) {
  await mkdir(path.dirname(path.resolve(ROOT, JSONOUT)), { recursive: true });
  await writeFile(path.resolve(ROOT, JSONOUT), JSON.stringify({
    arm, url, readyMs, minutes: MINUTES, quality: QUALITY, extra: EXTRA, dynres: DYNRES,
    n: d.n, wallSec: d.wallSec,
    p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), p999: pct(0.999), max: gaps[gaps.length - 1],
    over100: d.over100, over1000: d.over1000, overMs: d.overMs,
    programs: [d.progFirst, d.progLast], textures: [d.texFirst, d.texLast], heap: [d.heapFirst, d.heapLast],
    reallocs: d.reallocs, sizeCalls: d.sizeCalls, scale: [d.scaleMin, d.scaleMax],
    hist: d.hist, edges: d.edges, worst: d.worst, events: d.events, autoLog, pageErrors,
    episodes: d.episodes, episodeCount: d.episodeCount, episodeMs: d.episodeMs,
    bakes: [d.bakesFirst, d.bakesLast],
    compileHook: d.compileHook, compiles: d.compiles, matHome: d.matHome,
    lightLog: d.lightLog, ptAtInstall: d.ptAtInstall, ptAtEnd: d.ptAtEnd,
    ptVisLog: d.ptVisLog, ptVisCounts: d.ptVisCounts,
  }, null, 2));
  log(`  json -> ${JSONOUT}`);
}

await browser.close();
if (vite) vite.kill();
