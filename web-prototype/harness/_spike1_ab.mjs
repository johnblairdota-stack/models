#!/usr/bin/env node
/**
 * ESTATE-SPIKE-1 — INTERLEAVED A/B AT PARKED STATIONS.
 *
 * `perf-ab.mjs` interleaves configs but lets the capture Director walk, so on `game.play` its
 * gpu number is an average over six different rooms and its `calls` is wherever the camera
 * happened to be. `perf-spaces.mjs` parks properly but measures ONE config, so comparing two
 * arms means two separate browsers — the cross-session comparison this project rules invalid.
 * This spike needs both properties at once, so this is the two tools crossed:
 *
 *   configs interleaved A B C, A B C   (perf-ab: thermal drift lands on the round axis)
 *   camera PARKED at named anchors     (perf-spaces: the scene is static and deterministic)
 *   one whole discarded round          (a fresh Chromium's cold compile outlives any settle)
 *
 *   node harness/_spike1_ab.mjs --config "off:" --config "lights:estate=lights" \
 *        --stations gallery.mid,ballroom.centre --rounds 3 --port 5413
 *
 *   --config "name:qs"   repeatable. Bare "name:" is the default build.
 *   --stations a,b       room anchors to park at (default gallery.mid,ballroom.centre)
 *   --rounds <n>         timed rounds per config after the discarded one (default 3)
 *   --window <ms>        sampling window per station (default 1800)
 *   --probe <js>         evaluated after each load; recorded with every sample
 *   --port <n>           private vite port
 *
 * ⚠️ GPU TIME IS NOT VALID WHILE ANOTHER AGENT IS WORKING. Draw calls and triangles are
 * deterministic and exempt (HANDOFF). The report prints both, and says which is which.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const all = (n) => argv.reduce((a, v, i) => (v === `--${n}` && argv[i + 1] ? [...a, argv[i + 1]] : a), []);
const flagOn = (n) => argv.includes(`--${n}`);

const PORT = +opt('port', 5413);
const ROUNDS = +opt('rounds', 3);
const WINDOW_MS = +opt('window', 1800);
const EXTRA = opt('extra', 'quality=medium');
const PROBE = opt('probe', 'JSON.stringify(window.__rrr.engine.__estateSpike ?? null)');
const STATIONS = opt('stations', 'gallery.mid,ballroom.centre').split(',');
const CONFIGS = (all('config').length ? all('config') : ['off:']).map((s) => {
  const i = s.indexOf(':');
  return i < 0 ? { name: s, qs: '' } : { name: s.slice(0, i), qs: s.slice(i + 1) };
});

const log = (...a) => console.log(...a);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return +s[s.length >> 1].toFixed(2); };

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});

let child = null;
if (!(await portOpen(PORT))) {
  child = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'),
    '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const t0 = Date.now();
  while (!(await portOpen(PORT))) {
    if (Date.now() - t0 > 60000) { console.error('vite failed to start'); process.exit(3); }
    await new Promise((r) => setTimeout(r, 250));
  }
}

const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization', '--enable-zero-copy', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars', '--mute-audio', '--disable-dev-shm-usage'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
// Silence THIS tab's HMR socket — a concurrent agent's save otherwise reloads the page
// mid-window, which is the failure `audio-3` spent a run on.
await page.routeWebSocket((url) => url.hostname === '127.0.0.1' && url.port === String(PORT), () => {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e).split('\n')[0].slice(0, 160)));
if (flagOn('nohunter')) await page.addInitScript(() => { window.__rrrNoHunter = true; });

const park = async (anchor, yaw) => page.evaluate(({ anchor, yaw }) => {
  const e = window.__rrr.engine, p = e.player, h = e.hunter, room = e.room;
  if (e.director && !e.director.__parked) {
    e.director.__parked = true;
    // ⚠️ `look` MUST BE NULL. `game.js` reads `cmd.look.dx`/`.dy`; the `{x, y}` shape
    // `perf-spaces.mjs` shipped makes those `undefined`, `cam.yaw -= undefined` is NaN, and
    // every position in the sim follows it. Fixed there too.
    e.director.step = () => ({ move: { x: 0, y: 0 }, look: null, run: false, fire: false,
      aimYaw: e.cam?.yaw ?? 0, aimPitch: e.cam?.pitch ?? 0 });
  }
  const a = room.anchor(anchor);
  if (!a) return { ok: false, why: `no anchor ${anchor}` };
  p.pos.copy(a); p.vel.set(0, 0, 0); p.aimYaw = yaw;
  // ⚠️ `_first` IS WHAT MAKES THE BOOM SNAP INSTEAD OF EASING. `ThirdPersonCamera.update` uses
  // `k = this._first ? 1 : 1 - exp(-11 dt)`, so after a teleport the camera CHASES the player
  // across the house at an exponential rate and takes seconds to arrive. Residency reads BOTH
  // the player and the camera as viewpoints, so a boom in transit keeps the room it came from
  // resident and reports a scene that belongs to neither station. Measured: 22.9 m of camera
  // travel inside a 2 s window, and `ballroom.centre` reporting "2 spaces, camera in gallery".
  if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true; }
  if (h) {
    /**
     * ⚠️ **PARKING THE HUNTER 6 m IN FRONT OF A STATIONARY PLAYER IS NOT A STABLE STATION.**
     * `perf-spaces.mjs` does exactly this and "starves its senses" once, but the awareness
     * ladder climbs again over a 2 s window: the hunter kills the player, `run.js` resets the
     * round, and the player respawns across the house. Measured here as a **22.9 m drift at
     * `ballroom.centre`**, deterministic in every lit arm and variable (0.2–3.7 m) in the
     * control — so the two arms were not being compared at the same place. `--nohunter`
     * banishes it, which costs the worst-case its most expensive object and buys a station
     * that holds still. Say which one you used.
     */
    const far = window.__rrrNoHunter === true;
    h.root.position.set(far ? a.x + 400 : a.x + Math.sin(yaw) * 6, 0,
      far ? a.z + 400 : a.z - Math.cos(yaw) * 6);
    h.vel?.set?.(0, 0, 0);
    h.state = 'PATROL'; h.awareness = 0; h.target = null; h.candidates = [];
  }
  return { ok: true, space: room.spaceAt(p.pos)?.id ?? null };
}, { anchor, yaw });

async function runConfig(cfg, discard) {
  const qs = cfg.qs ? '&' + cfg.qs : '';
  const t0 = Date.now();
  await page.goto(`http://127.0.0.1:${PORT}/?view=game.play&capture=1&${EXTRA}${qs}`,
    { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(
    () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
    null, { timeout: 300000 });
  const readyMs = Date.now() - t0;
  const err = await page.evaluate(() => window.__rrrError ?? null);
  if (err) throw new Error(`[${cfg.name}] ${err}`);
  const probe = await page.evaluate(`(() => { try { return (${PROBE}); } catch (e) { return 'PROBE ERROR: ' + e.message; } })()`);
  const counts = await page.evaluate(() => {
    const e = window.__rrr.engine; let point = 0, spot = 0, dir = 0, hemi = 0;
    e.scene.traverse((o) => {
      if (o.isPointLight) point++; else if (o.isSpotLight) spot++;
      else if (o.isDirectionalLight) dir++; else if (o.isHemisphereLight) hemi++;
    });
    let shadow = 0;
    e.scene.traverse((o) => { if (o.isLight && o.castShadow) shadow++; });
    return { point, spot, dir, hemi, shadow, programs: e.renderer.info.programs?.length ?? -1,
      textures: e.renderer.info.memory.textures, geometries: e.renderer.info.memory.geometries };
  });

  /**
   * 🚨 **IN CAPTURE MODE FRAMES ONLY RUN INSIDE A MEASUREMENT WINDOW, SO A BARE
   * `waitForTimeout` AFTER A TELEPORT ADVANCES NOTHING AT ALL.**
   *
   * `Engine`'s capture loop renders only when there is an outstanding `settle()` target or
   * `_freeRun` is set, and `resetPerf()` is what sets `_freeRun` (`src/core/engine.js`). So a
   * park followed by a plain wait leaves residency, the third-person boom and the light rig on
   * whatever state the previous station left them in — proved directly with
   * `_spike1_resprobe.mjs`, which teleported the player to three different rooms and got
   * `visibleSpaces 3, gallery:1 ... ballroom:0` and a camera still in the gallery **all three
   * times**. ⚠️ `perf-spaces.mjs`'s warm-up lap is exactly this shape (`park` + 260 ms with no
   * `resetPerf`), so that lap has never warmed anything.
   *
   * The fix is to open free-run explicitly and let the world converge BEFORE the timed window.
   */
  /**
   * 🚨 **DYNAMIC RESOLUTION ABSORBS EXACTLY THE COST YOU ARE TRYING TO MEASURE.**
   *
   * `Engine.opts.dynamicRes` chases a frame budget by moving `pipeline.renderScale`, so an arm
   * that adds per-fragment work does not get slower — it gets SMALLER, and a gpu-ms A/B reports
   * "NOT RESOLVED" for a change that is really costing image quality. Caught by running
   * `harness/scenarios/_price-pointlight.mjs` (an ABBA design that pins `renderScale` to 1.0)
   * and getting **+0.112 ms for ONE point light** against this tool's **+0.01 ms for
   * SEVENTEEN**. Two instruments, opposite answers, and the fixed-resolution one is the one
   * that answers a budget question.
   *
   * ⚠️ Both readings are true of something. `--fixedres` measures the COST; the default
   * measures what a player actually gets, which is the same cost paid in pixels. Say which.
   */
  if (flagOn('fixedres')) {
    await page.evaluate(() => {
      const e = window.__rrr.engine;
      e.opts.dynamicRes = false;
      e.pipeline.renderScale = 1.0;
      e.pipeline.setSize(e.pipeline.canvasWidth, e.pipeline.canvasHeight);
    });
  }
  const settleAt = async (s) => {
    await park(s, 0);
    await page.evaluate(() => window.__rrr.freeRun(true));
    await page.waitForTimeout(700);      // residency resolves and the boom catches the player
    await park(s, 0);                    // re-snap: the boom moved the player's frame of reference
    await page.waitForTimeout(300);
  };
  // warm-up lap over every station, so first-visit residency and any remaining compile is paid
  // outside the timed windows
  for (const s of STATIONS) await settleAt(s);

  const rows = [];
  for (const s of STATIONS) {
    const at = await park(s, 0);
    await settleAt(s);
    // ⚠️ ASSERT THE STATION HELD. `perf-spaces.mjs` believed it was neutralising the capture
    // Director and was not (`engine.director` was never assigned), so its windows measured a
    // short walk from an anchor rather than a stand at one. A probe that cannot hold its own
    // conditions is measuring something it cannot name — so this one reports the drift.
    const before = await page.evaluate(() => { const c = window.__rrr.engine.camera.position; return [c.x, c.z]; });
    await page.evaluate(() => window.__rrr.engine.resetPerf());
    await page.waitForTimeout(WINDOW_MS);
    const p = await page.evaluate(() => window.__rrr.perf());
    const after = await page.evaluate(() => { const c = window.__rrr.engine.camera.position; return [c.x, c.z]; });
    const drift = Math.hypot(after[0] - before[0], after[1] - before[1]);
    // ⚠️ THE LIGHT COUNT AND THE PROGRAM COUNT, PER STATION. A residency-hidden practical is
    // culled out of `numPointLights`, and `numPointLights` is part of three's program cache
    // key — so a count the renderer has never compiled recompiles every visible material on the
    // frame you walk through the door. That is the shape of John's five-second freeze, and it
    // is invisible to a wall clock but obvious in this counter.
    const lp = await page.evaluate(() => {
      const e = window.__rrr.engine; let point = 0, spot = 0;
      // WORLD visibility, not the object's own flag — three walks the parent chain, so a light
      // whose space root is hidden is culled out of `numPointLights` even though its own
      // `visible` is true.
      const shown = (o) => { let p = o; while (p) { if (!p.visible) return false; p = p.parent; } return true; };
      e.scene.traverse((o) => {
        if (o.isPointLight && shown(o)) point++; else if (o.isSpotLight && shown(o)) spot++;
      });
      e.endPerf?.();
      return { point, spot, programs: e.renderer.info.programs?.length ?? -1,
        spaces: e.room.visibleSpaces(), camSpace: e.room.spaceAt(e.camera.position)?.id ?? null };
    });
    rows.push({ station: s, space: at.space, gpuMs: p.gpuMs, cpuMs: p.cpuMs, calls: p.calls, tris: p.tris,
      rs: p.renderScale,
      drift: +drift.toFixed(3), litPoint: lp.point, litSpot: lp.spot, programs: lp.programs,
      spaces: lp.spaces, camSpace: lp.camSpace });
  }
  if (!discard) log(`    ${cfg.name.padEnd(9)} ready ${(readyMs / 1000).toFixed(1)}s  lights p${counts.point}/s${counts.spot}/d${counts.dir}/h${counts.hemi} shadow${counts.shadow}  programs ${counts.programs}  tex ${counts.textures}`
    + rows.map((r) => `\n      ${r.station.padEnd(18)} gpu ${String(r.gpuMs).padStart(5)}  cpu ${String(r.cpuMs).padStart(5)}  ${String(r.calls).padStart(4)} calls  ${((r.tris / 1000) | 0)}k tris  rs ${r.rs}  lit p${r.litPoint}/s${r.litSpot}  prog ${r.programs}  ${r.spaces}sp in ${r.camSpace}  drift ${r.drift}m${r.drift > 0.15 ? ' !!MOVED' : ''}`).join(''));
  else log(`    [discard] ${cfg.name}  ready ${(readyMs / 1000).toFixed(1)}s`);
  return { rows, counts, readyMs, probe };
}

const samples = [];
log(`\n  game.play — ${CONFIGS.length} configs x ${ROUNDS} timed rounds, stations: ${STATIONS.join(', ')}`);
log('  (one whole interleaved round discarded first)\n');
for (let r = 0; r <= ROUNDS; r++) {
  if (r) log(`  round ${r}`);
  for (const cfg of CONFIGS) {
    const s = await runConfig(cfg, r === 0);
    if (r) samples.push({ round: r, config: cfg.name, ...s });
  }
}

log('\n  ===== RESULT =====');
for (const st of STATIONS) {
  log(`\n  station ${st}`);
  log('    config      gpuMs   spread    cpuMs    calls    tris     lights(p/s/d)  programs');
  const base = {};
  for (const cfg of CONFIGS) {
    const mine = samples.filter((s) => s.config === cfg.name);
    const g = mine.map((s) => s.rows.find((r) => r.station === st)?.gpuMs).filter((v) => v != null);
    const c = mine.map((s) => s.rows.find((r) => r.station === st)?.cpuMs).filter((v) => v != null);
    const calls = mine.map((s) => s.rows.find((r) => r.station === st)?.calls);
    const tris = mine.map((s) => s.rows.find((r) => r.station === st)?.tris);
    const spread = g.length ? Math.max(...g) - Math.min(...g) : 0;
    const k = mine[0]?.counts ?? {};
    const row = { gpu: median(g), spread, cpu: median(c), calls: [...new Set(calls)].join('/'), tris: median(tris) };
    if (!base.gpu) Object.assign(base, row);
    log(`    ${cfg.name.padEnd(10)} ${String(row.gpu).padStart(5)}   ${spread.toFixed(2).padStart(5)}    ${String(row.cpu).padStart(5)}   ${String(row.calls).padStart(6)}  ${String(((row.tris ?? 0) / 1000) | 0).padStart(5)}k    ${k.point}/${k.spot}/${k.dir}         ${k.programs}`
      + `   [${g.join(' ')}]`);
  }
  const b = CONFIGS[0];
  const bg = median(samples.filter((s) => s.config === b.name).map((s) => s.rows.find((r) => r.station === st)?.gpuMs).filter((v) => v != null));
  const bs = (() => { const g = samples.filter((s) => s.config === b.name).map((s) => s.rows.find((r) => r.station === st)?.gpuMs).filter((v) => v != null); return g.length ? Math.max(...g) - Math.min(...g) : 0; })();
  for (const cfg of CONFIGS.slice(1)) {
    const g = samples.filter((s) => s.config === cfg.name).map((s) => s.rows.find((r) => r.station === st)?.gpuMs).filter((v) => v != null);
    const m = median(g), sp = g.length ? Math.max(...g) - Math.min(...g) : 0;
    const d = (m ?? 0) - (bg ?? 0), noise = Math.max(bs, sp);
    log(`      ${cfg.name} vs ${b.name}: gpu ${d >= 0 ? '+' : ''}${d.toFixed(2)} ms  (spread up to ${noise.toFixed(2)} — ${Math.abs(d) > noise ? 'RESOLVED' : 'NOT RESOLVED, treat as zero'})`);
  }
}
log('\n  budget gpu 1.389 ms · cpu 2.00 ms · 625 calls · 900k tris');
for (const cfg of CONFIGS) {
  const p = samples.find((s) => s.config === cfg.name)?.probe;
  log(`  probe [${cfg.name}] ${typeof p === 'string' ? p.slice(0, 260) : JSON.stringify(p)?.slice(0, 260)}`);
}
if (pageErrors.length) log(`  ! page errors: ${[...new Set(pageErrors)].slice(0, 4).join(' | ')}`);
if (opt('json')) await writeFile(opt('json'), JSON.stringify({ CONFIGS, STATIONS, samples }, null, 2));
await browser.close();
if (child) child.kill();
process.exit(0);
