/**
 * Draw-call / triangle counter with NO GPU timing.
 *
 * `shoot.mjs --gate` is the normal way to read these, but it also opens GPU timer queries,
 * and round 33 ran while another agent held the perf lock. `renderer.info.render` is a
 * CPU-side counter incremented by three.js as it submits — reading it costs nothing on the
 * GPU and contends with nothing. Same numbers `--gate` prints for `calls` / `tris`.
 *
 *   node harness/_calls_tmp.mjs --view char.turnaround [--extra "quality=medium"]
 *
 * RUN `npx vite build` FIRST. THIS DOES NOT MEASURE YOUR WORKING TREE.
 *
 * It starts harness/serve.mjs, which is a static server for `dist/` — the LAST BUILD.
 * shoot.mjs is the opposite: it spawns vite dev and renders live source. So a builder who
 * captures a frame, likes it, and then reads a draw-call count here gets a picture of the new
 * geometry and a number for the old, with nothing anywhere saying so. That happened on
 * mat.plaster round 4: two readings of "102 calls / 576k tris" were the round-3 bundle, and
 * the real figures after a rebuild were 106 / 581k. Neither number is implausible, which is
 * exactly why it survives review.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const VIEW = opt('view', 'char.turnaround');
const EXTRA = opt('extra', 'quality=medium');
const PORT = 5199;

const srv = spawn(process.execPath, ['harness/serve.mjs', '--port', String(PORT)], {
  env: { ...process.env }, stdio: 'ignore',
});
await new Promise((r) => setTimeout(r, 1800));

const browser = await chromium.launch({
  args: ['--use-angle=default', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message ?? e)));
await page.goto(`http://127.0.0.1:${PORT}/?view=${encodeURIComponent(VIEW)}&capture=1&${EXTRA}`,
  { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(
  () => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 180000 });
await page.evaluate(() => window.__rrr.settle(8));
const info = await page.evaluate(() => {
  const r = window.__rrr.engine.renderer.info;
  const rows = [];
  window.__rrr.engine.scene.traverse((o) => {
    if (!o.isMesh) return;
    let p = o, path = [];
    while (p && path.length < 4) { path.unshift(p.name || '?'); p = p.parent; }
    rows.push({
      n: o.name, path: path.join('/'), mat: o.material?.name || o.material?.uuid?.slice(0, 6),
      tris: (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3,
      shadow: o.castShadow, vis: o.visible,
    });
  });
  return { calls: r.render.calls, tris: r.render.triangles, geos: r.memory.geometries, rows };
});
console.log(`${VIEW}  calls ${info.calls}  tris ${(info.tris / 1000).toFixed(0)}k  geometries ${info.geos}  meshes ${info.rows.length}`);
if (argv.includes('--list')) {
  const agg = new Map();
  for (const r of info.rows) {
    const k = `${r.n}|${r.mat}|${r.shadow}`;
    if (!agg.has(k)) agg.set(k, { ...r, n: 1, tris: 0 });
    const a = agg.get(k); a.n++; a.tris += r.tris;
  }
  const list = [...agg.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.tris - a.tris);
  for (const r of list) console.log(`  ${String(r.tris | 0).padStart(7)}  x${String(r.n - 1).padStart(2)}  shadow=${r.shadow ? 1 : 0}  ${r.k.split('|')[0]}  [${r.k.split('|')[1]}]`);
}
if (errs.length) console.log('  page errors:', errs.slice(0, 3));
await browser.close();
srv.kill();
process.exit(0);
