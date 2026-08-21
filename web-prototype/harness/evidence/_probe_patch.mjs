/**
 * Patch probe: mean sRGB over rectangles given in NORMALISED image coords (0..1).
 * Loads through imglib's data: URL so a re-rendered file is never served from cache.
 *
 *   node harness/evidence/_probe_patch.mjs <image> x,y,w,h[,label] ...
 */
import { toDataURL, openCanvasPage } from '../imglib.mjs';

const [file, ...rects] = process.argv.slice(2);
const boxes = rects.map((r) => {
  const p = r.split(',');
  return { x: +p[0], y: +p[1], w: +p[2], h: +p[3], label: p[4] || r };
});

const url = await toDataURL(file);
const { browser, page } = await openCanvasPage();
const out = await page.evaluate(async ({ url, boxes }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  return boxes.map((b) => {
    const x = Math.round(b.x * img.width), y = Math.round(b.y * img.height);
    const w = Math.max(1, Math.round(b.w * img.width)), h = Math.max(1, Math.round(b.h * img.height));
    const d = g.getImageData(x, y, w, h).data;
    let r = 0, gg = 0, bb = 0, n = 0;
    const lum = [];
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++;
      lum.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    }
    lum.sort((a, b2) => a - b2);
    return {
      label: b.label, n, size: `${img.width}x${img.height}`,
      r: r / n, g: gg / n, b: bb / n,
      p05: lum[Math.floor(n * 0.05)], p50: lum[Math.floor(n * 0.5)], p95: lum[Math.floor(n * 0.95)],
    };
  });
}, { url, boxes });
await browser.close();

for (const o of out) {
  console.log(
    `${o.label.padEnd(22)} R ${o.r.toFixed(1).padStart(6)} G ${o.g.toFixed(1).padStart(6)} B ${o.b.toFixed(1).padStart(6)}`
    + `  R-B ${(o.r - o.b).toFixed(1).padStart(6)}`
    + `  lum ${o.p05.toFixed(0)}/${o.p50.toFixed(0)}/${o.p95.toFixed(0)}  (${o.size})`);
}
