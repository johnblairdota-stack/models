// calls-18: WHICH OBJECTS ARE DRAWING AT AN ANGLE THAT BREACHES THE BUDGET.
// The 300-call budget was only ever measured at `overlook` (298). Shot from all seventeen
// player-eye presets, four angles go over — 307 to 309 — and a gate that is only checked at
// the one camera that passes it is not a gate.
//   node harness/_calls18.mjs --cam eye.corner.sw
import { chromium } from 'playwright';
import net from 'node:net';
const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d = null) => (argv.indexOf('--' + n) >= 0 ? argv[argv.indexOf('--' + n) + 1] : d);
const CAM = opt('cam', 'eye.corner.sw');
const portOpen = (p) => new Promise((r) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running'); process.exit(3); }
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket((u) => u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&cam=${encodeURIComponent(CAM)}`,
  { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1', null, { timeout: 600000 });
await page.evaluate((n) => window.__rrr.settle(n), 12);
const out = await page.evaluate(() => {
  const e = window.__rrr.engine;
  const groups = {};
  let total = 0, drawn = 0;
  e.scene.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh && !o.isLine && !o.isPoints) return;
    total++;
    if (!o.visible) return;
    // walk up for a hidden ancestor
    let p = o.parent, vis = true;
    while (p) { if (!p.visible) { vis = false; break; } p = p.parent; }
    if (!vis) return;
    drawn++;
    const k = o.name || `(unnamed ${o.material?.name || o.type})`;
    groups[k] = (groups[k] || 0) + 1;
  });
  return { total, drawn, calls: e.renderer.info.render.calls,
    groups: Object.entries(groups).sort((a, c) => c[1] - a[1]) };
});
console.log(`${CAM}: renderer calls ${out.calls} · meshes in scene ${out.total} · visible ${out.drawn}`);
for (const [k, n] of out.groups) if (n > 1 || out.groups.length < 40) console.log(`  ${String(n).padStart(4)}  ${k}`);
await b.close();
