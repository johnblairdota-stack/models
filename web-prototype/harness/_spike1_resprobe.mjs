#!/usr/bin/env node
/**
 * ESTATE-SPIKE-1 — does portal residency actually hide a space-parented practical rig?
 * No timing at all; this asks the scene graph what it is drawing and why.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const PORT = +opt('port', 5416);
const QS = opt('qs', 'estate=nosun,resident');

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false));
});
let child = null;
if (!(await portOpen(PORT))) {
  child = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'),
    '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const t0 = Date.now();
  while (!(await portOpen(PORT))) {
    if (Date.now() - t0 > 60000) process.exit(3);
    await new Promise((r) => setTimeout(r, 250));
  }
}
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=game.play&capture=1&quality=medium&${QS}`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 300000 });

for (const anchor of ['gallery.mid', 'ballroom.centre', 'chapel.centre']) {
  const r = await page.evaluate(async (anchor) => {
    const e = window.__rrr.engine, room = e.room;
    if (e.director && !e.director.__parked) {
      e.director.__parked = true;
      e.director.step = () => ({ move: { x: 0, y: 0 }, look: null, run: false, fire: false,
        aimYaw: e.cam?.yaw ?? 0, aimPitch: e.cam?.pitch ?? 0 });
    }
    const a = room.anchor(anchor);
    if (!a) return { fail: `no anchor ${anchor}` };
    const snap = () => {
      e.player.pos.copy(a); e.player.vel.set(0, 0, 0);
      // BANISHED, not parked in frame: a hunter 6 m from a stationary player kills it inside a
      // 2 s window and `run.js` resets the round, which teleports the player across the house.
      // This probe is about WHICH GEOMETRY IS RESIDENT, so the station has to hold still.
      if (e.hunter) { e.hunter.root.position.set(a.x + 400, 0, a.z + 400); e.hunter.state = 'PATROL'; e.hunter.awareness = 0; e.hunter.target = null; e.hunter.candidates = []; }
    };
    snap();
    // ⚠️ FRAMES ONLY RUN INSIDE A FREE-RUN WINDOW IN CAPTURE MODE (`engine.js` `_freeRun`).
    // Without this the teleport is never simulated and residency never re-resolves.
    window.__rrr.freeRun(true);
    for (let i = 0; i < 4; i++) { await new Promise((res) => setTimeout(res, 250)); snap(); }
    await new Promise((res) => setTimeout(res, 250));
    e.resetPerf();
    await new Promise((res) => setTimeout(res, 700));
    const perf = window.__rrr.perf();
    e.endPerf();
    let grp = null;
    e.scene.traverse((o) => { if (o.name === 'estate.spike.gallery') grp = o; });
    // WORLD visibility — three walks the parent chain, so a `visible: true` under a hidden
    // parent draws nothing. Asking the object alone is the mistake this probe exists to avoid.
    const chain = [];
    let p = grp;
    while (p) { chain.push(`${p.name || p.type}:${p.visible}`); p = p.parent; }
    let drawn = 0, hidden = 0;
    grp?.traverse((o) => { if (o.isMesh || o.isPoints) (o.visible ? drawn++ : hidden++); });
    const info = e.renderer.info.render;
    return {
      spaces: room.spaces.map((s) => `${s.id}:${s.visible ? 1 : 0}`).join(' '),
      visibleSpaces: room.visibleSpaces(),
      chain, groupMeshesVisibleFlag: drawn, groupMeshesHiddenFlag: hidden,
      calls: info.calls, tris: info.triangles, perfCalls: perf.calls, perfGpu: perf.gpuMs,
      playerSpace: room.spaceAt(e.player.pos)?.id ?? null,
      camSpace: room.spaceAt(e.camera.position)?.id ?? null,
      playerPos: [+e.player.pos.x.toFixed(2), +e.player.pos.z.toFixed(2)],
      camPos: [+e.camera.position.x.toFixed(2), +e.camera.position.y.toFixed(2), +e.camera.position.z.toFixed(2)],
    };
  }, anchor);
  if (r.fail) { console.log(`\n--- ${anchor} --- ${r.fail}`); continue; }
  console.log(`\n--- ${anchor} ---`);
  console.log(`  player ${r.playerPos} in ${r.playerSpace}   camera ${r.camPos} in ${r.camSpace}   visibleSpaces ${r.visibleSpaces}`);
  console.log(`  perf window: calls ${r.perfCalls}  gpu ${r.perfGpu}`);
  console.log(`  spaces: ${r.spaces}`);
  console.log(`  spike group parent chain (name:visible): ${r.chain.join('  <  ')}`);
  console.log(`  spike meshes flagged visible ${r.groupMeshesVisibleFlag}, flagged hidden ${r.groupMeshesHiddenFlag}`);
  console.log(`  renderer.info calls ${r.calls}  tris ${r.tris}`);
}
await browser.close();
if (child) child.kill();
process.exit(0);
