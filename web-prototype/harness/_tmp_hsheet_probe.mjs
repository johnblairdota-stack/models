// Critic scratch: probe background vs figure pixel values on hunter.sheet to calibrate a mask.
import { toDataURL, openCanvasPage } from './imglib.mjs';
const img = process.argv[2];
const { browser, page } = await openCanvasPage();
const url = await toDataURL(img);
const out = await page.evaluate(async (url) => {
  const im = await new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = url; });
  const W = im.width, H = im.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(im, 0, 0);
  const D = cx.getImageData(0, 0, W, H).data;
  const px = (x, y) => { const i = (y * W + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };
  const rows = [40, 200, 400, 600, 800, 1000, 1060];
  const res = { W, H, rowProfiles: {}, colSums: null };
  for (const y of rows) {
    const samples = [];
    for (let x = 0; x < W; x += 120) samples.push(`${x}:${px(x, y).join(',')}`);
    res.rowProfiles[y] = samples.join('  ');
  }
  // Column occupancy using a high threshold vs a per-row robust background (median).
  const rowBg = [];
  for (let y = 0; y < H; y++) {
    const rs = [];
    for (let x = 0; x < W; x += 3) rs.push(D[(y * W + x) * 4 + 1]);
    rs.sort((a, b) => a - b);
    rowBg.push(rs[rs.length >> 1]);
  }
  const counts = {};
  for (const TH of [10, 20, 30, 45, 60]) {
    const colCount = new Int32Array(W);
    let tot = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const d = Math.abs(D[i] - rowBg[y]) + Math.abs(D[i + 1] - rowBg[y]) + Math.abs(D[i + 2] - rowBg[y]);
        if (d > TH) { colCount[x]++; tot++; }
      }
    }
    // Report which columns are occupied at >1% of height
    const occ = [];
    let run = null;
    for (let x = 0; x < W; x++) {
      const on = colCount[x] > H * 0.012;
      if (on && !run) run = [x, x];
      else if (on) run[1] = x;
      else if (run) { if (run[1] - run[0] > 8) occ.push(run.join('-')); run = null; }
    }
    if (run) occ.push(run.join('-'));
    counts[TH] = { totalFrac: +(tot / (W * H)).toFixed(4), runs: occ.join('  ') };
  }
  res.counts = counts;
  return res;
}, url);
console.log(JSON.stringify(out, null, 1));
await browser.close();
