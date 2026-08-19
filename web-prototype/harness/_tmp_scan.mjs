// Scratch probe: horizontal luminance scanline + patch percentiles.
//   node scan.mjs row <img> <x0> <x1> <y> [rows]      -> mean luma per column over `rows` rows
//   node scan.mjs patch <img> <x> <y> <w> <h>         -> p05/p50/p95/min/max/range
import { chromium } from 'playwright';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const [, , mode, srcPath, ...rest] = process.argv;
const b64 = readFileSync(path.resolve(srcPath)).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<body style="margin:0"><img id="im" src="data:image/png;base64,${b64}"></body>`);
await page.waitForFunction(() => {
  const im = document.getElementById('im');
  return im.complete && im.naturalWidth > 0;
});

const out = await page.evaluate(({ mode, rest }) => {
  const img = document.getElementById('im');
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  if (mode === 'row') {
    const [x0, x1, y, rows] = rest.map(Number);
    const n = rows || 1;
    const d = ctx.getImageData(x0, y, x1 - x0 + 1, n).data;
    const res = [];
    for (let cx = 0; cx <= x1 - x0; cx++) {
      let s = 0;
      for (let r = 0; r < n; r++) s += lum(d, (r * (x1 - x0 + 1) + cx) * 4);
      res.push(+(s / n).toFixed(1));
    }
    return { size: [cv.width, cv.height], values: res };
  }
  if (mode === 'col') {
    const [x, y0, y1, cols] = rest.map(Number);
    const n = cols || 1;
    const d = ctx.getImageData(x, y0, n, y1 - y0 + 1).data;
    const res = [];
    for (let cy = 0; cy <= y1 - y0; cy++) {
      let s = 0;
      for (let c = 0; c < n; c++) s += lum(d, (cy * n + c) * 4);
      res.push(+(s / n).toFixed(1));
    }
    return { size: [cv.width, cv.height], values: res };
  }
  const [x, y, w, h] = rest.map(Number);
  const d = ctx.getImageData(x, y, w, h).data;
  const v = [];
  for (let i = 0; i < d.length; i += 4) v.push(lum(d, i));
  v.sort((a, b) => a - b);
  const q = (p) => +v[Math.min(v.length - 1, Math.floor(p * v.length))].toFixed(1);
  return {
    size: [cv.width, cv.height], n: v.length,
    min: +v[0].toFixed(1), p05: q(0.05), p50: q(0.50), p95: q(0.95),
    max: +v[v.length - 1].toFixed(1), rangeP: +(q(0.95) - q(0.05)).toFixed(1),
  };
}, { mode, rest });

console.log(JSON.stringify(out));
await browser.close();
