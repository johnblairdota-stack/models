#!/usr/bin/env node
/**
 * PERF-BREACH2 — targeted test of ONE hypothesis for play-critic-8's two unattributed
 * >500ms in-play frames (507.8 ms rend 501.3 / 832.3 ms rend 815.2, dprog/dtex/dgeo/dheap/
 * realloc all 0, both while a hunter BREACH was running).
 *
 * HYPOTHESIS: `room.js`'s residency system (`setViewpoints`) sets `space.root.visible = true`
 * the FIRST TIME a space becomes resident (player within PORTAL_VIS_DIST=13m of a portal
 * facing it, OR the player's own current space). A space that has NEVER been visible before
 * has NEVER been drawn, so its meshes' GPU buffers (vertex/index/instance) have never been
 * uploaded — three.js uploads lazily on first draw, INSIDE WebGLRenderer.render(), which is
 * INSIDE pipeline.render(). That upload touches none of the counters play-critic-8 checked:
 * renderer.info.memory.geometries only counts distinct geometry OBJECTS (already registered
 * at scene-build time), not buffer uploads; programs/textures are already warm from the
 * light-count prewarm fix; heap doesn't move for a GPU-side driver call.
 *
 * AND `room.js:166 breachPortals()` adds a NEW portal the moment a panel's `blocksMovement()`
 * goes false (the open stage) — so a hunter finishing a breach can make a space resident for
 * the first time in the run WITHOUT the player ever walking there, exactly the "while a
 * breach was running" correlation in the finding.
 *
 * THIS SCRIPT tests the mechanism directly, without needing the hunter AI or a real 5-minute
 * session: park the camera in the space that is resident at boot, confirm a target space is
 * NOT resident, then teleport the player's viewpoint so residency flips it visible, and time
 * pipeline.render() on the flip frame vs neighbouring frames.
 *
 *   node harness/perf-breach2.mjs --port 5220
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = +opt('port', 5220);
const log = (...a) => console.log(...a);

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});

let vite = null;
if (await portOpen(PORT)) {
  throw new Error(`:${PORT} already occupied — pick a free port with --port. Never reuse :5193.`);
}
log(`  starting vite on :${PORT} …`);
vite = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'),
  '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
  { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
let viteErr = '';
vite.stderr.on('data', (d) => { viteErr += d.toString(); });
{
  const t0 = Date.now();
  while (!(await portOpen(PORT))) {
    if (Date.now() - t0 > 30000) { vite.kill(); throw new Error(`vite did not open :${PORT}\n${viteErr}`); }
    await new Promise((r) => setTimeout(r, 300));
  }
}

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
    '--enable-zero-copy', '--disable-frame-rate-limit', '--force-device-scale-factor=1',
    '--hide-scrollbars', '--mute-audio', '--disable-dev-shm-usage',
  ],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => log('  PAGE ERROR', String(e).slice(0, 300)));

const url = `http://127.0.0.1:${PORT}/?view=game.play&quality=medium`;
log(`  ${url}`);
await page.goto(url, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 240000 });
log('  ready');

await page.click('#rrr-play-btn').catch(() => page.click('#rrr-play-gate').catch(() => {}));
await page.waitForTimeout(500);

const result = await page.evaluate(async () => {
  const e = window.__rrr.engine;
  const room = e.room, p = e.player, pl = e.pipeline, r = e.renderer;

  // ---- pick a target space that is NOT resident right now --------------------------------
  const spaces = room.spaces;
  const startSpace = room.spaceAt(p.pos);
  const target = spaces.find((s) => s !== startSpace && !s.visible);
  if (!target) return { ok: false, why: 'every space already resident, cannot test' };

  const cx = (target.x0 + target.x1) / 2, cz = (target.z0 + target.z1) / 2;

  // ---- instrument pipeline.render() and the renderer's own render() (main pass + shadow) -
  const origPlRender = pl.render.bind(pl);
  const origRRender = r.render.bind(r);
  const log = [];
  let n = 0;
  let inMain = 0;
  r.render = function (scene, camera) {
    const a = performance.now();
    const out = origRRender(scene, camera);
    const dt = performance.now() - a;
    inMain += dt;
    return out;
  };
  pl.render = function (t) {
    inMain = 0;
    const before = {
      geo: r.info.memory.geometries, tex: r.info.memory.textures, prog: r.info.programs.length,
      calls: r.info.render.calls, triangles: r.info.render.triangles,
    };
    const a = performance.now();
    const out = origPlRender(t);
    const total = performance.now() - a;
    const after = {
      geo: r.info.memory.geometries, tex: r.info.memory.textures, prog: r.info.programs.length,
      calls: r.info.render.calls, triangles: r.info.render.triangles,
    };
    if (log.length < 400) {
      log.push({
        n, total: +total.toFixed(2), mainPassMs: +inMain.toFixed(2),
        dgeo: after.geo - before.geo, dtex: after.tex - before.tex, dprog: after.prog - before.prog,
        calls: after.calls, triangles: after.triangles,
        targetVisible: target.visible,
      });
    }
    n++;
    return out;
  };

  // ---- SYNCHRONOUS, manual pl.render() calls — no requestAnimationFrame, so the engine's
  // own live loop (which would fight our camera placement and re-run its own setViewpoint
  // with the real player position) cannot interleave with any of this; JS is single-threaded
  // and nothing else runs until this function returns.
  const camWas = e.camera.position.clone(), quatWas = e.camera.quaternion.clone();
  const wasVisible = target.visible;

  // baseline: a few renders from the CURRENT (already-resident) camera spot
  for (let i = 0; i < 5; i++) pl.render(performance.now());

  // flip residency exactly as room.js's setViewpoints() does (lines 449/452/456-459), and
  // point the camera at the target space's centre so it is in the color pass too, not only
  // whatever a shadow-casting light's frustum happens to cover.
  target._hold = 999; target.visible = true; target.root.visible = true;
  // recompute panel visibility the same way setViewpoints() does: a panel is visible if
  // EITHER space it joins is resident
  for (const pnl of room.panels) {
    const aS = spaces.find((s) => s.id === pnl.spec?.a);
    const bS = spaces.find((s) => s.id === pnl.spec?.b);
    pnl.root.visible = !!((aS && aS.visible) || (bS && bS.visible));
  }

  e.camera.position.set(cx, 1.6, cz);
  e.camera.lookAt(cx, 1.6, cz + 3);
  e.camera.updateMatrixWorld(true);

  for (let i = 0; i < 20; i++) pl.render(performance.now());

  e.camera.position.copy(camWas); e.camera.quaternion.copy(quatWas); e.camera.updateMatrixWorld(true);

  const rows = log.slice(0, 40);
  return {
    ok: true, targetId: target.id, startId: startSpace ? startSpace.id : null,
    wasVisible, nowVisible: target.visible, rows,
  };
});

if (result.ok) {
  const baseline = result.rows.slice(0, 5);
  const postFlip = result.rows.slice(5);
  const maxBase = Math.max(...baseline.map((r) => r.total));
  const maxPost = Math.max(...postFlip.map((r) => r.total));
  log(`  target=${result.targetId} start=${result.startId} wasVisible=${result.wasVisible} nowVisible=${result.nowVisible}`);
  log(`  BASELINE (target hidden) max ${maxBase.toFixed(1)} ms over ${baseline.length} frames: ` +
    baseline.map((r) => r.total).join(', '));
  log(`  POST-FLIP (target just made visible + camera pointed at it) max ${maxPost.toFixed(1)} ms over ${postFlip.length} frames:`);
  log('   n   total  mainPass  dgeo dtex dprog  calls  triangles');
  for (const r of postFlip) {
    log(`   ${String(r.n).padStart(3)} ${String(r.total).padStart(6)} ${String(r.mainPassMs).padStart(8)}` +
      `  ${String(r.dgeo).padStart(4)} ${String(r.dtex).padStart(4)} ${String(r.dprog).padStart(5)}` +
      `  ${String(r.calls).padStart(5)}  ${r.triangles}`);
  }
} else {
  log('  FAILED:', result.why);
}

await browser.close();
if (vite) vite.kill();
