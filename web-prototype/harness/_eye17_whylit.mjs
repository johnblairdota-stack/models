// eye-sweep-17: WHICH LIGHT IS ON THIS WALL. The mirror wall's upper storey measures L 15.4
// against a room median of 43, and the geometry says it should be lit: it faces -x, and the
// cold bounce fill arrives from (-8, 5, 2), so N.L is about 0.83. Either that reasoning is
// wrong or the light is not doing what it says. Toggle each of the room's lights in turn and
// sample the wall, rather than arguing from the direction vectors.
//   node harness/_eye17_whylit.mjs --cam eye.mirror --px 1700,400
import { chromium } from 'playwright';
import net from 'node:net';
const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const CAM = opt('cam', 'eye.mirror');
const PX = argv.reduce((a, v, i) => (v === '--px' ? [...a, argv[i + 1].split(',').map(Number)] : a), []);
const pts = PX.length ? PX : [[1700, 400]];
const portOpen = (p) => new Promise((res) => { const s = net.connect(p, '127.0.0.1'); s.on('connect', () => { s.destroy(); res(true); }); s.on('error', () => res(false)); });
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--force-device-scale-factor=1', '--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&cam=${CAM}`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 600000 });
await page.evaluate((n) => window.__rrr.settle(n), 14);

const meta = await page.evaluate(() => {
  const e = window.__rrr.engine;
  window.__L = [];
  e.scene.traverse((o) => {
    if (o.isDirectionalLight) window.__L.push({ o, kind: 'dir' });
    else if (o.isSpotLight) window.__L.push({ o, kind: 'spot' });
    else if (o.isHemisphereLight) window.__L.push({ o, kind: 'hemi' });
  });
  window.__I = window.__L.map((l) => l.o.intensity);
  window.__env0 = e.scene.environmentIntensity;
  return window.__L.map((l, i) => `${i}:${l.kind}@${l.o.intensity.toFixed(2)}`
    + (l.kind === 'dir' ? ` from ${l.o.position.toArray().map((v) => v.toFixed(1)).join(',')}` : ''));
});
console.log('lights:', meta.join('  |  '));

const sample = async () => page.evaluate((p) => {
  const cv = document.querySelector('canvas');
  const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0);
  return p.map(([px, py]) => { const d = x.getImageData(px, py, 1, 1).data; return `${d[0]},${d[1]},${d[2]}`; });
}, pts);

const step = async (label, fn) => {
  await page.evaluate(fn);
  await page.evaluate((n) => window.__rrr.settle(n), 5);
  console.log(label.padEnd(30), (await sample()).join('  '));
};
await step('base', () => {});
for (let i = 0; i < meta.length; i++) {
  await step(`  light ${meta[i]} OFF`, `window.__L[${i}].o.intensity = 0`);
  await page.evaluate(`window.__L[${i}].o.intensity = window.__I[${i}]`);
}
await step('environment OFF', () => { window.__rrr.engine.scene.environmentIntensity = 0; });
await step('environment back', () => { window.__rrr.engine.scene.environmentIntensity = window.__env0; });
await browser.close();
