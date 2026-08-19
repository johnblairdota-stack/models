/**
 * Round-33 scratch: median RGB + luminance of a rectangular patch, and a p05/p95 spread.
 *
 * Data: URL loader (see `imglib`) rather than a `file://` <img>, because every render writes
 * back to the same path and Chromium caches `file://` by URL — `_tmp_sample_px.mjs` has that
 * trap and returns the PREVIOUS capture.
 *
 *   node harness/_px33.mjs <img> "x,y,w,h,label" ["x,y,w,h,label" ...]
 */
import { toDataURL, openCanvasPage } from './imglib.mjs';

const [, , src, ...specs] = process.argv;
const { page, browser } = await openCanvasPage();
const url = await toDataURL(src);

const out = await page.evaluate(async ({ url, specs }) => {
  const im = new Image();
  im.src = url;
  await im.decode();
  const c = new OffscreenCanvas(im.naturalWidth, im.naturalHeight);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  return specs.map((s) => {
    const [x, y, w, h, ...rest] = s.split(',');
    const d = g.getImageData(+x, +y, +w, +h).data;
    const R = [], G = [], B = [], L = [];
    for (let i = 0; i < d.length; i += 4) {
      R.push(d[i]); G.push(d[i + 1]); B.push(d[i + 2]);
      L.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    }
    const q = (a, p) => { a = a.slice().sort((u, v) => u - v); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };
    return {
      label: rest.join(',') || `${x},${y}`,
      rgb: [q(R, 0.5) | 0, q(G, 0.5) | 0, q(B, 0.5) | 0],
      lum: q(L, 0.5) | 0, p05: q(L, 0.05) | 0, p95: q(L, 0.95) | 0,
      range: (q(L, 0.95) - q(L, 0.05)) | 0,
    };
  });
}, { url, specs });

for (const r of out) {
  console.log(`  ${r.label.padEnd(22)} rgb(${r.rgb.join(',')})  lum ${String(r.lum).padStart(3)}` +
    `  p05 ${String(r.p05).padStart(3)}  p95 ${String(r.p95).padStart(3)}  range ${String(r.range).padStart(3)}`);
}
await browser.close();
process.exit(0);
