// hide-18: shoot a preset with meshes matching a name substring hidden, so "what IS that" can
// be answered by deletion when a raycast cannot answer it. Thin geometry — Points, LineSegments,
// crystal strings — is missed by a default Raycaster (it has no threshold set), so `_eye17_pick`
// reports the WALL BEHIND them and reads as if the wall were painting the pixels.
//   node harness/_hide18.mjs --cam eye.win --hide crystal --out DIR
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync, mkdirSync } from 'node:fs';
const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d = null) => (argv.indexOf('--' + n) >= 0 ? argv[argv.indexOf('--' + n) + 1] : d);
const CAM = opt('cam', 'eye.win');
const OUT = opt('out', '.');
const HIDE = argv.reduce((a, v, i) => (v === '--hide' ? [...a, argv[i + 1]] : a), []);
const portOpen = (p) => new Promise((r) => { const s = net.connect(p, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
if (!(await portOpen(PORT))) { console.error('vite not running'); process.exit(3); }
mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--force-device-scale-factor=1', '--hide-scrollbars'] });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket((u) => u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&cam=${encodeURIComponent(CAM)}`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1', null, { timeout: 600000 });
await page.evaluate((n) => window.__rrr.settle(n), 14);
writeFileSync(`${OUT}/base.png`, await page.screenshot({ type: 'png' }));
// `--mat <substr>:<prop>=<value>` — set a scalar on every material whose NAME contains substr,
// then shoot. The wall's bright dashed vertical lines survive hiding the crystal, the
// chandeliers, the dust motes, the light shafts and the grime, and a raycast puts them on the
// wall itself — which leaves the material, and `boiserieMat` is a MeshPhysicalMaterial with
// clearcoat over a normal map whose crack term draws vertical hairlines.
const MATS = argv.reduce((a, v, i) => (v === '--mat' ? [...a, argv[i + 1]] : a), []);
for (const spec of MATS) {
  const [sub, rest] = spec.split(':');
  const [prop, val] = rest.split('=');
  const n = await page.evaluate(({ sub, prop, val }) => {
    let k = 0;
    const seen = new Set();
    window.__rrr.engine.scene.traverse((o) => {
      const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      for (const m of ms) {
        if (seen.has(m)) continue;
        seen.add(m);
        if ((m.name || '').toLowerCase().includes(sub.toLowerCase())) {
          m[prop] = Number(val); m.needsUpdate = true; k++;
        }
      }
    });
    return k;
  }, { sub, prop, val });
  await page.evaluate((k) => window.__rrr.settle(k), 8);
  writeFileSync(`${OUT}/mat-${sub}-${prop}${val}.png`, await page.screenshot({ type: 'png' }));
  console.log(`set ${prop}=${val} on ${n} material(s) matching "${sub}"`);
}
for (const h of HIDE) {
  const n = await page.evaluate((name) => {
    let k = 0;
    window.__rrr.engine.scene.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isLineSegments || o.isInstancedMesh)) return;
      // match the MATERIAL name too — `GeoBin` merges by material key, so the wall is one mesh
      // called after its bake key rather than anything a human named "wall"
      const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      const hit = (o.name || '').toLowerCase().includes(name.toLowerCase())
        || ms.some((m) => (m.name || '').toLowerCase().includes(name.toLowerCase()));
      if (hit) { o.visible = false; k++; }
    });
    return k;
  }, h);
  await page.evaluate((k) => window.__rrr.settle(k), 6);
  writeFileSync(`${OUT}/no-${h}.png`, await page.screenshot({ type: 'png' }));
  console.log(`hid ${n} object(s) matching "${h}"`);
}
await b.close();
