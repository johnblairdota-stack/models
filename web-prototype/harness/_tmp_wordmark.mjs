// Measure the 4Humanity wordmark art: ink bbox, navy colour, per-column runs.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const src = process.argv[2];
const buf = await readFile(src);
const dataUrl = 'data:image/png;base64,' + buf.toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 200, height: 200 } });
const out = await page.evaluate(async (url) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const W = img.naturalWidth, H = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, W, H).data;
  const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
  const isInk = (x, y) => { const [r, g, b] = at(x, y); return (r + g + b) / 3 < 170 && b > r; };

  // bbox of ink
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  const hist = {};
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (isInk(x, y)) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      const [r, g, b] = at(x, y);
      const k = `${r >> 3},${g >> 3},${b >> 3}`;
      hist[k] = (hist[k] || 0) + 1;
    }
  }
  const top = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, n]) => ({ rgb: k.split(',').map(v => (+v) * 8 + 4), n }));

  // column ink coverage: for each x, count ink rows, and first/last ink row
  const cols = [];
  for (let x = 0; x < W; x++) {
    let n = 0, a = -1, bm = -1;
    const runs = [];
    let inRun = false, rs = 0;
    for (let y = 0; y < H; y++) {
      const ink = isInk(x, y);
      if (ink) { n++; if (a < 0) a = y; bm = y; }
      if (ink && !inRun) { inRun = true; rs = y; }
      if (!ink && inRun) { inRun = false; runs.push([rs, y - 1]); }
    }
    if (inRun) runs.push([rs, H - 1]);
    cols.push({ x, n, top: a, bot: bm, runs });
  }
  // row ink coverage
  const rows = [];
  for (let y = 0; y < H; y++) {
    let n = 0, a = -1, bm = -1;
    const runs = []; let inRun = false, rs = 0;
    for (let x = 0; x < W; x++) {
      const ink = isInk(x, y);
      if (ink) { n++; if (a < 0) a = x; bm = x; }
      if (ink && !inRun) { inRun = true; rs = x; }
      if (!ink && inRun) { inRun = false; runs.push([rs, x - 1]); }
    }
    if (inRun) runs.push([rs, W - 1]);
    rows.push({ y, n, left: a, right: bm, runs });
  }
  return { W, H, bbox: [x0, y0, x1, y1], top, cols, rows };
}, dataUrl);
await browser.close();
await writeFile(process.argv[3] || 'analysis.json', JSON.stringify(out));
console.log('size', out.W, out.H);
console.log('ink bbox', out.bbox, 'w=', out.bbox[2] - out.bbox[0] + 1, 'h=', out.bbox[3] - out.bbox[1] + 1);
console.log('top colours', JSON.stringify(out.top));
