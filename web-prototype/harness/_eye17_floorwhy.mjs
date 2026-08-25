// eye-sweep-17: WHY IS THE PARQUET WHITE AT EYE HEIGHT.
//
// `_eye17_sweep.mjs` ruled out the obvious knobs: cutting the daylight spot to a quarter, or
// pulling exposure to 0.90, leaves ~26-28% of the frame above L 190 with the local contrast
// inside it near 2 against the bar's 8.57. A full-res crop of the sunlit floor shows the
// mechanism plainly — the parquet is a WHITE field with thin brown pattern OUTLINES, in the
// shadow as well as in the sun, so it is not a clipping problem and it is not the key light.
//
// This ablates the parquet material itself on one settled boot, sampling a fixed row of floor
// pixels, so "what is that white" is answered by turning each contributor off in turn instead
// of by argument.
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

const info = await page.evaluate(() => {
  const e = window.__rrr.engine;
  const m = e.floorParquet;
  window.__p = m;
  if (!m) return { found: false };
  const mat = m.material;
  window.__save = {
    color: mat.color.getHex(), rough: mat.roughness, metal: mat.metalness,
    envI: mat.envMapIntensity, env: e.scene.environmentIntensity,
    normalScale: mat.normalScale ? mat.normalScale.clone() : null,
  };
  return {
    found: true, name: mat.name, type: mat.type,
    color: mat.color.getHexString(), rough: mat.roughness, metal: mat.metalness,
    hasMap: !!mat.map, hasRough: !!mat.roughnessMap, hasNormal: !!mat.normalMap,
    envI: mat.envMapIntensity, sheen: mat.sheen, clearcoat: mat.clearcoat,
    envIntensity: e.scene.environmentIntensity,
  };
});
console.log('parquet material:', JSON.stringify(info));
if (!info.found) { console.error('engine.floorParquet missing'); process.exit(4); }

// A row of floor pixels well inside the sunlit patch, and one in the shadow band beside it.
const SAMPLES = [[900, 900], [1100, 830], [700, 980], [760, 700]];
const sample = async () => page.evaluate((pts) => {
  const cv = document.querySelector('canvas');
  const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0);
  return pts.map(([px, py]) => {
    const d = x.getImageData(px, py, 1, 1).data;
    return `${d[0]},${d[1]},${d[2]}`;
  });
}, SAMPLES);

const run = async (label, fn) => {
  await page.evaluate(fn);
  await page.evaluate((n) => window.__rrr.settle(n), 5);
  console.log(label.padEnd(22), (await sample()).join('   '));
};

await run('base', () => {});
await run('albedo -> black', () => { window.__p.material.color.setHex(0x000000); window.__p.material.needsUpdate = true; });
await run('  + specular off', () => { window.__p.material.envMapIntensity = 0; window.__p.material.needsUpdate = true; });
await run('  restore albedo', () => { window.__p.material.color.setHex(window.__save.color); window.__p.material.needsUpdate = true; });
await run('  restore env', () => { window.__p.material.envMapIntensity = window.__save.envI; window.__p.material.needsUpdate = true; });
await run('roughness 1.0', () => { window.__p.material.roughness = 1.0; window.__p.material.needsUpdate = true; });
await run('  + metal 0', () => { window.__p.material.metalness = 0; window.__p.material.needsUpdate = true; });
await run('restore', () => {
  const m = window.__p.material, s = window.__save;
  m.color.setHex(s.color); m.roughness = s.rough; m.metalness = s.metal; m.envMapIntensity = s.envI;
  m.needsUpdate = true;
});
await run('parquet HIDDEN', () => { window.__p.visible = false; });
await run('parquet back', () => { window.__p.visible = true; });
await browser.close();
