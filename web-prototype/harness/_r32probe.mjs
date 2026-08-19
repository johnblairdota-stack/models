// scratch: dump per-row silhouette extents for one x-window of an image
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const [, , file, x0s, x1s, thr] = process.argv;
const buf = await readFile(file);
const url = `data:image/png;base64,${buf.toString('base64')}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
const out = await page.evaluate(async ({ url, x0, x1, THRESH }) => {
  const im = new Image(); im.src = url; await im.decode();
  const W = im.naturalWidth, H = im.naturalHeight;
  const c = new OffscreenCanvas(W, H);
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const grad = (x, y) => (x < 2 || x > W - 3) ? 0
    : Math.abs(lum((y * W + x + 2) * 4) - lum((y * W + x - 2) * 4));
  const rows = [];
  for (let y = 0; y < H; y++) {
    let l = -1, r = -1;
    for (let x = x0; x <= x1; x++) if (grad(x, y) > THRESH) { l = x; break; }
    for (let x = x1; x >= x0; x--) if (grad(x, y) > THRESH) { r = x; break; }
    rows.push([y, l, r]);
  }
  return { W, H, rows };
}, { url, x0: +x0s, x1: +x1s, THRESH: +(thr || 6) });
await browser.close();
console.log('image', out.W, out.H);
for (const [y, l, r] of out.rows) {
  if (l >= 0 && r > l) console.log(y, l, r, r - l);
}
