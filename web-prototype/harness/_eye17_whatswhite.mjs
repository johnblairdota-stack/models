// eye-sweep-17: the parquet is not the white. Turn the room's TRANSPARENT layers off one at a
// time and sample the same four floor pixels.
//
// `_eye17_floorwhy.mjs` established that hiding the parquet mesh entirely leaves those pixels
// at 233,239,248 — so whatever is white is IN FRONT of the floor, not on it. The candidates
// are the three additive light shafts, the three multiply light pools, the dust motes and the
// one glow patch. All four are flat or prismatic and all four were tuned from a camera that
// looks DOWN at them; seen along their own plane from 1.05 m they present a completely
// different amount of material to the eye.
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

const census = await page.evaluate(() => {
  const e = window.__rrr.engine;
  const by = {};
  e.scene.traverse((o) => {
    if (!o.isMesh && !o.isPoints) return;
    const n = o.name || '(unnamed)';
    if (!by[n]) by[n] = 0;
    by[n]++;
  });
  window.__hide = (name) => { const l = []; window.__rrr.engine.scene.traverse((o) => { if (o.name === name) { o.visible = false; l.push(o); } }); return l.length; };
  window.__show = (name) => { window.__rrr.engine.scene.traverse((o) => { if (o.name === name) o.visible = true; }); };
  return Object.entries(by).filter(([n]) => /shaft|pool|dust|glow|decal/i.test(n));
});
console.log('transparent layers found:', JSON.stringify(census));

const SAMPLES = [[900, 900], [1100, 830], [700, 980], [760, 700]];
const sample = async () => page.evaluate((pts) => {
  const cv = document.querySelector('canvas');
  const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0);
  let white = 0; const n = cv.width * cv.height;
  const d0 = x.getImageData(0, 0, cv.width, cv.height).data;
  for (let i = 0; i < d0.length; i += 4) if (Math.min(d0[i], d0[i + 1], d0[i + 2]) >= 250) white++;
  return { px: pts.map(([px, py]) => { const d = x.getImageData(px, py, 1, 1).data; return `${d[0]},${d[1]},${d[2]}`; }), white: white / n };
}, SAMPLES);

const step = async (label, fn) => {
  if (fn) await page.evaluate(fn);
  await page.evaluate((n) => window.__rrr.settle(n), 5);
  const r = await sample();
  console.log(label.padEnd(26), r.px.join('  '), '  white', (r.white * 100).toFixed(2) + '%');
};

await step('base', null);
for (const n of ['light-shaft', 'light-pool', 'dust', 'glow']) {
  await step(`hide ${n}`, `window.__hide(${JSON.stringify(n)})`);
}
await step('all four hidden', null);
for (const n of ['light-shaft', 'light-pool', 'dust', 'glow']) {
  await page.evaluate(`window.__show(${JSON.stringify(n)})`);
}
await step('all back', null);
// and each ALONE removed, from the full scene
for (const n of ['light-shaft', 'light-pool', 'dust', 'glow']) {
  await page.evaluate(`window.__hide(${JSON.stringify(n)})`);
  await step(`only ${n} removed`, null);
  await page.evaluate(`window.__show(${JSON.stringify(n)})`);
}
await browser.close();
