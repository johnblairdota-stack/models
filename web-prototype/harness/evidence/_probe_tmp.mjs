// Scratch: luminance AND mean-RGB stats for named boxes on a render, so contrast/colour work
// is tuned against numbers rather than impressions. Not app code.
//
// Round 31: loads through `imglib.toDataURL` instead of a bare file:// URL. Every render in
// this project writes back to the same path, and Chromium caches file:// by URL — the old
// version silently returned the PREVIOUS capture's numbers on a re-shoot. Also reports mean
// RGB, because "the visor reads dark" is a colour question and luminance alone cannot answer
// whether a blue is too dark or merely too desaturated.
import path from 'node:path';
import { openCanvasPage, toDataURL } from '../imglib.mjs';

const [, , srcPath, ...boxArgs] = process.argv;
// each arg: name=x,y,w,h
const boxes = boxArgs.map((a) => {
  const [name, rect] = a.split('=');
  const [x, y, w, h] = rect.split(',').map(Number);
  return { name, x, y, w, h };
});
const url = await toDataURL(srcPath);

const { browser, page } = await openCanvasPage();
const out = await page.evaluate(async ({ url, boxes }) => {
  const im = new Image();
  im.src = url;
  await im.decode();
  const c = document.createElement('canvas');
  c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  return boxes.map((b) => {
    const d = g.getImageData(b.x, b.y, b.w, b.h).data;
    const L = [];
    let r = 0, gg = 0, bb = 0;
    for (let i = 0; i < d.length; i += 4) {
      L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      r += d[i]; gg += d[i + 1]; bb += d[i + 2];
    }
    L.sort((p, q) => p - q);
    const q = (f) => L[Math.min(L.length - 1, Math.round(f * (L.length - 1)))];
    return {
      name: b.name, n: L.length,
      min: q(0), p05: q(0.05), p50: q(0.50), p95: q(0.95), max: q(1),
      mean: L.reduce((a, v) => a + v, 0) / L.length,
      rgb: [r / L.length, gg / L.length, bb / L.length],
    };
  });
}, { url, boxes });

console.log(`${path.basename(srcPath)}  (${out.length} boxes)`);
for (const r of out) {
  console.log(`  ${r.name.padEnd(14)} min ${r.min.toFixed(0).padStart(3)}  p05 ${r.p05.toFixed(0).padStart(3)}` +
    `  med ${r.p50.toFixed(0).padStart(3)}  p95 ${r.p95.toFixed(0).padStart(3)}  max ${r.max.toFixed(0).padStart(3)}` +
    `  mean ${r.mean.toFixed(1).padStart(5)}  range ${(r.p95 - r.p05).toFixed(0)}` +
    `  rgb(${r.rgb.map((v) => v.toFixed(0).padStart(3)).join(',')})`);
}
await browser.close();
