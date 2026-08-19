/**
 * estate-owner-8 scratch probe — settle the ballroom "bullseye on every window" defect.
 *
 * The candidate causes are mutually exclusive and both are measurable from the live scene:
 *   A) worldUV metres-per-repeat: the glass carries MANY texture repeats per window, so the
 *      shader's single authored medallion tiles. Signature: uv range >> 1, or map.repeat != 1.
 *   B) the medallion is drawn ONCE per window because it is authored into GLASS_SURFACE and
 *      the uInk gate does not gate its PRESENCE. Signature: uv range == 1 and repeat == 1.
 *
 * Reports the uv extent of every mesh using a stained-glass material, plus the texture repeat
 * and the material's uniform-ish identity, so the two are told apart by measurement.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const VIEW = opt('view', 'room.ballroom');
const PORT = Number(opt('port', '5199'));

const srv = spawn(process.execPath, ['harness/serve.mjs', '--port', String(PORT)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1800));
const browser = await chromium.launch({ args: ['--use-angle=default', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR', String(e.message ?? e)));
await page.goto(`http://127.0.0.1:${PORT}/?view=${encodeURIComponent(VIEW)}&capture=1&quality=medium`,
  { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 240000 });
await page.evaluate(() => window.__rrr.settle(4));

const out = await page.evaluate(() => {
  const eng = window.__rrr.engine;
  const rows = [];
  eng.scene.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || m.name !== 'stained-glass') continue;
      const uv = o.geometry.attributes.uv;
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i), v = uv.getY(i);
        if (u < u0) u0 = u; if (u > u1) u1 = u;
        if (v < v0) v0 = v; if (v > v1) v1 = v;
      }
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      rows.push({
        mesh: o.name || '(unnamed)',
        verts: uv.count,
        u: [+u0.toFixed(4), +u1.toFixed(4)],
        v: [+v0.toFixed(4), +v1.toFixed(4)],
        mapRepeat: m.map ? [m.map.repeat.x, m.map.repeat.y] : null,
        mapOffset: m.map ? [m.map.offset.x, m.map.offset.y] : null,
        emissiveIntensity: m.emissiveIntensity,
        bbox: [
          [+bb.min.x.toFixed(2), +bb.min.y.toFixed(2), +bb.min.z.toFixed(2)],
          [+bb.max.x.toFixed(2), +bb.max.y.toFixed(2), +bb.max.z.toFixed(2)],
        ],
        mapUuid: m.map ? m.map.uuid : null,
      });
    }
  });
  return rows;
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
srv.kill();
