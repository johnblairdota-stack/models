// eye-sweep-17: is the white floor a Z-FIGHT between the two floor planes?
//
// `room-ballroom.js` lays the parquet field as a SECOND plane 4 mm above the marble chequer
// ("not a cut border ring", see the `?floor=` note) so the chequer shows through around the
// edges. 4 mm is ample separation seen from above — the overlook meets the floor at 17 deg and
// r10 at 6 — but the depth buffer's resolvable separation grows as 1/cos(theta) along the view
// ray, and a standing player meets the far half of this floor at 1-3 deg. The two planes then
// land within one depth quantum of each other for most of the room.
//
// The evidence that pointed here: forcing the parquet's albedo to BLACK left those pixels at
// 131 rather than near 0 — a half-and-half mix of a black parquet and a white marble tile is
// exactly what a stippled depth fight looks like — while every specular knob on both materials
// (clearcoat, clearcoatRoughness, specularIntensity) moved the frame by less than 0.1%.
import { chromium } from 'playwright';
import net from 'node:net';

const PORT = 5178;
const CAM = process.argv.includes('--cam') ? process.argv[process.argv.indexOf('--cam') + 1] : 'eye.floor';
const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }

const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&cam=${CAM}`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 600000 });
await page.evaluate((n) => window.__rrr.settle(n), 16);

await page.evaluate(() => {
  const e = window.__rrr.engine;
  window.__pq = e.floorParquet;
  window.__ch = e.floorReflect;         // the chequer plane (set when ?floorreflect is on)
  if (!window.__ch) e.scene.traverse((o) => { if (o.isMesh && o.material?.name?.includes('chequer')) window.__ch = o; });
  window.__y0 = window.__pq ? window.__pq.position.y : null;
  const cam = e.camera;
  window.__near = cam.near; window.__far = cam.far;
});
const meta = await page.evaluate(() => ({
  pq: !!window.__pq, ch: !!window.__ch, y: window.__y0, near: window.__near, far: window.__far,
}));
console.log('meshes:', JSON.stringify(meta));

const SAMPLES = [[900, 900], [1100, 830], [700, 980], [1500, 760]];
const sample = async () => page.evaluate((pts) => {
  const cv = document.querySelector('canvas');
  const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0);
  const d0 = x.getImageData(0, 0, cv.width, cv.height).data;
  let white = 0; const n = cv.width * cv.height;
  for (let i = 0; i < d0.length; i += 4) if (Math.min(d0[i], d0[i + 1], d0[i + 2]) >= 250) white++;
  return { px: pts.map(([px, py]) => { const d = x.getImageData(px, py, 1, 1).data; return `${d[0]},${d[1]},${d[2]}`; }), white: white / n };
}, SAMPLES);
const step = async (label, fn) => {
  if (fn) await page.evaluate(fn);
  await page.evaluate((n) => window.__rrr.settle(n), 5);
  const r = await sample();
  console.log(label.padEnd(24), r.px.join('  '), '  white', (r.white * 100).toFixed(2) + '%');
};

await step('base', null);
await step('CHEQUER hidden', () => { window.__ch.visible = false; });
await step('  chequer back', () => { window.__ch.visible = true; });
await step('PARQUET hidden', () => { window.__pq.visible = false; });
await step('  parquet back', () => { window.__pq.visible = true; });
for (const y of [0.02, 0.05, 0.12, 0.30]) {
  await step(`parquet lifted to ${y}`, `window.__pq.position.y = ${y}; window.__pq.updateMatrixWorld(true);`);
}
await step('back to 0.004', 'window.__pq.position.y = 0.004; window.__pq.updateMatrixWorld(true);');
await browser.close();
