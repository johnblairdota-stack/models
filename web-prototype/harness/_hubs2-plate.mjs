/*
 * builder-hubs2d: IS THE BOSS'S DARK WASH A DEGENERATE SEAM FREQUENCY?
 *
 * The network picks its plate frequency per fragment from rrwSMpU (metres of surface per uv
 * unit) divided by uRRWSeamPlate, CLAMPED TO A MINIMUM OF ONE CELL. On a 40 mm dome whose uv
 * spans 0..1, that ratio is far below 1, so the clamp fires: one cell over the whole part, with
 * a groove whose half-width is a large fraction of it. Prediction: the part is mostly groove,
 * and SHRINKING the plate (raising the ratio back above 1) must brighten it.
 *
 * ⚠️ THE URL BELOW STILL CARRIES ?fixinject=1. That knob existed only while mesh-identity.js
 * was handing the fixtures an un-injected clone; it was deleted with the workaround on
 * 2026-08-17, so the flag is now inert and these probes read the SHIPPING path.
 *
 * usage: node harness/_hubs2-plate.mjs [port] [part] [azim]
 */
import { chromium } from 'playwright';

const PORT = process.argv[2] ?? '5192';
const PART = process.argv[3] ?? 'capFixtureFR';
const AZIM = process.argv[4] ?? '0';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`http://localhost:${PORT}/?view=mesh.animated&capture=1&solo=1&clip=merged`
  + `&anim=Alert&label=0&azim=${AZIM}&fixinject=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__rrr?.engine || window.__rrrError, null, { timeout: 180000 });
await page.evaluate(() => window.__rrr.settle(30));

const r = await page.evaluate(async (part) => {
  const e = window.__rrr.engine;
  let o = null;
  e.scene.traverse((n) => { if (n.name === part) o = n; });
  const uni = o.material.userData.weathering;
  const cam = e.camera;
  const W = e.canvas.width, H = e.canvas.height;
  const p = o.getWorldPosition(new (cam.position.constructor)());
  const s = p.clone().project(cam);
  const cx = Math.round((s.x * 0.5 + 0.5) * W), cy = Math.round((-s.y * 0.5 + 0.5) * H);
  const c2 = document.createElement('canvas');
  c2.width = W; c2.height = H;
  const g2 = c2.getContext('2d', { willReadFrequently: true });
  const read = () => {
    window.__rrr.redraw();
    g2.clearRect(0, 0, W, H);
    g2.drawImage(e.canvas, 0, 0);
    const R = 4;
    const d = g2.getImageData(cx - R, cy - R, R * 2, R * 2).data;
    let a = 0, b = 0, c = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { a += d[i]; b += d[i + 1]; c += d[i + 2]; n++; }
    return [a / n, b / n, c / n].map(v => Math.round(v));
  };
  const out = { px: [cx, cy], plateWas: uni.uRRWSeamPlate.value, widthWas: uni.uRRWSeamWM.value,
    baseline: read(), plate: {}, width: {} };
  for (const v of [0.27, 0.14, 0.06, 0.03, 0.015, 0.008, 0.005]) {
    uni.uRRWSeamPlate.value = v; out.plate[v] = read();
  }
  uni.uRRWSeamPlate.value = out.plateWas;
  for (const v of [out.widthWas, out.widthWas * 0.5, out.widthWas * 0.25, out.widthWas * 0.1]) {
    uni.uRRWSeamWM.value = v; out.width[v.toFixed(5)] = read();
  }
  uni.uRRWSeamWM.value = out.widthWas;
  out.restored = read();
  return out;
}, PART);

await browser.close();
console.log(`${PART} azim=${AZIM}`);
console.log(JSON.stringify(r, null, 1));
