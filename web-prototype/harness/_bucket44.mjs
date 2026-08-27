// bucket-44: WHICH BUCKET OWNS THIS ANGLE'S TOP-DECILE CHROMA? Hide one at a time and read it.
//
// `eye.up` reads 0.209 and `eye.door` 0.210 against a 0.2 fail line, and round 44 has already
// established that no grade term can move them — every term that shipped is shaped so it cannot
// reach the top decile, which is what keeps it from costing the other fifteen cameras. So the
// change has to be to what is IN the frame, and the first question is WHICH THING. `GeoBin`
// merges by material, so a mesh name is a bucket name and hiding one is a clean ablation.
//
//   node harness/_bucket44.mjs --cam eye.up
import { chromium } from 'playwright';
import net from 'node:net';
const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d = null) => (argv.indexOf('--' + n) >= 0 ? argv[argv.indexOf('--' + n) + 1] : d);
const CAM = opt('cam') || 'eye.up';
const portOpen = (p) => new Promise((r) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); r(true); }); s.on('error', () => r(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.log('[E]', String(e).slice(0, 200)));
await page.routeWebSocket((u) => u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&cam=${encodeURIComponent(CAM)}`,
  { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1',
  null, { timeout: 900000 });
await page.evaluate(() => window.__rrr.settle(10));
const names = await page.evaluate(() => {
  const e = window.__rrr.engine;
  const seen = new Map();
  e.scene.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh) || !o.visible) return;
    const n = o.name || '(unnamed)';
    seen.set(n, (seen.get(n) ?? 0) + 1);
  });
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
});
const shot = async () => page.evaluate(() => {
  window.__rrr.redraw();
  const c = document.querySelector('canvas');
  const cv = document.createElement('canvas');
  cv.width = c.width; cv.height = c.height;
  cv.getContext('2d').drawImage(c, 0, 0);
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const raw = [];
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    raw.push([l, l > 1 ? (d[i] - d[i + 2]) / l : 0]);
  }
  raw.sort((a, b) => a[0] - b[0]);
  const top = raw.slice(Math.floor(raw.length * 0.9));
  return +(top.reduce((s, p) => s + p[1], 0) / top.length).toFixed(3);
});
const base = await shot();
console.log(`\n${CAM}: baseline top-decile chroma ${base}\n`);
const rows = [];
for (const n of names) {
  const hid = await page.evaluate((n) => {
    const e = window.__rrr.engine;
    let k = 0;
    e.scene.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.name === n) { o.visible = false; k++; } });
    return k;
  }, n);
  const v = await shot();
  await page.evaluate((n) => {
    window.__rrr.engine.scene.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.name === n) o.visible = true; });
  }, n);
  rows.push([n, v, v - base, hid]);
}
rows.sort((a, b) => a[2] - b[2]);
for (const [n, v, d, k] of rows) {
  if (Math.abs(d) < 0.002) continue;
  console.log(`   hide ${n.padEnd(16)} -> ${String(v).padStart(7)}   ${d > 0 ? '+' : ''}${d.toFixed(3)}   (${k} mesh)`);
}
console.log('\n   (buckets that moved it less than 0.002 omitted)');
await browser.close();
