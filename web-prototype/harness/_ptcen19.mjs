// pt-census-19: what grime quads exist in the PLAYABLE ballroom, and where.
// The floor quad ported and moved pixels; the ceiling quad ported and moved none, at any of
// four rects across the visible soffit. Counting and locating them is faster than guessing
// which of "not created", "created off-position" and "created but occluded" it is.
import { chromium } from 'playwright';
import net from 'node:net';
const PORT = 5178;
const portOpen = (p) => new Promise((r) => { const s = net.connect(p, '127.0.0.1'); s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false)); });
if (!(await portOpen(PORT))) { console.error('vite not running'); process.exit(3); }
const b = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[E]', String(e).slice(0, 300)));
await page.routeWebSocket((u) => u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=game.play&capture=1&spawn=ballroom.south&facing=3.14159`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 600000 });
await page.evaluate((n) => window.__rrr.settle(n), 12);
const out = await page.evaluate(() => {
  const rows = [];
  window.__rrr.engine.scene.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (!m || !m.uniforms || !m.uniforms.uMacro) return;   // grimeBand's own signature
    o.updateMatrixWorld(true);
    const p = o.position, ms = o.matrixWorld.elements;
    rows.push({
      order: o.renderOrder,
      macro: +m.uniforms.uMacro.value.toFixed(2),
      pos: [p.x, p.y, p.z].map((v) => +v.toFixed(2)),
      world: [ms[12], ms[13], ms[14]].map((v) => +v.toFixed(2)),
      rotX: +o.rotation.x.toFixed(2),
      vis: o.visible,
    });
  });
  return rows;
});
console.log(`${out.length} grime quads in the playable ballroom`);
for (const r of out) console.log(`  order ${r.order}  macro ${String(r.macro).padStart(5)}  rotX ${String(r.rotX).padStart(6)}  local ${JSON.stringify(r.pos)}  world ${JSON.stringify(r.world)}  vis ${r.vis}`);
await b.close();
