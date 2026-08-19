// critic-meshplayer-1: segment a near-white figure against a near-white cyc.
// Builds a per-ROW background model from the outer columns of the search window,
// so the cyc gradient is subtracted instead of thresholded against.
// Usage: node _meshcritic_seg.mjs <img> <x> <y> <w> <h> [thresh]
import { toDataURL, openCanvasPage } from './imglib.mjs';

const [, , img, xs, ys, ws, hs, ts] = process.argv;
const X = +xs, Y = +ys, W = +ws, H = +hs, T = ts ? +ts : 7;

const { page, browser } = await openCanvasPage();
const url = await toDataURL(img);
const out = await page.evaluate(async ({ url, X, Y, W, H, T }) => {
  const im = new Image();
  im.src = url;
  await im.decode();
  const cv = document.createElement('canvas');
  cv.width = im.width; cv.height = im.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(im, 0, 0);
  const d = ctx.getImageData(X, Y, W, H).data;
  const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

  // per-row background = LINEAR ramp fitted through the outer 6% of columns each side.
  // (A flat median fails on the studio cyc, whose gradient runs horizontally.)
  const edge = Math.max(4, Math.round(W * 0.06));
  const bgL = new Float64Array(H), bgR = new Float64Array(H);
  for (let y = 0; y < H; y++) {
    const sl = [], sr = [];
    for (let x = 0; x < edge; x++) { sl.push(lum((y * W + x) * 4)); sr.push(lum((y * W + (W - 1 - x)) * 4)); }
    sl.sort((a, b) => a - b); sr.sort((a, b) => a - b);
    bgL[y] = sl[sl.length >> 1]; bgR[y] = sr[sr.length >> 1];
  }
  // mask
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const bgv = bgL[y] + (bgR[y] - bgL[y]) * (x / (W - 1));
    if (Math.abs(lum(i) - bgv) > T) mask[y * W + x] = 1;
  }
  // morphological open: erode once (kill isolated grain that a low threshold picks up),
  // then dilate twice (restore the figure edge). Lets T drop far enough to catch a
  // white head against a white cyc without the background flooding in.
  const nb4 = (p, x, y, m) => (x > 0 ? m[p - 1] : 0) + (x < W - 1 ? m[p + 1] : 0) + (y > 0 ? m[p - W] : 0) + (y < H - 1 ? m[p + W] : 0);
  let cur = mask;
  { const o = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; if (cur[p] && nb4(p, x, y, cur) >= 3) o[p] = 1; }
    cur = o; }
  for (let it = 0; it < 2; it++) {
    const o = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = y * W + x; if (cur[p] || nb4(p, x, y, cur) >= 1) o[p] = 1; }
    cur = o;
  }
  mask.set(cur);

  // largest connected component (4-way), so ground shadow / neighbour views drop out
  const lab = new Int32Array(W * H).fill(-1);
  let best = -1, bestN = 0, comps = [];
  const stack = new Int32Array(W * H);
  for (let p = 0; p < W * H; p++) {
    if (!mask[p] || lab[p] >= 0) continue;
    const id = comps.length; let sp = 0, n = 0;
    stack[sp++] = p; lab[p] = id;
    while (sp) {
      const q = stack[--sp]; n++;
      const qx = q % W, qy = (q / W) | 0;
      const nb = [qx > 0 ? q - 1 : -1, qx < W - 1 ? q + 1 : -1, qy > 0 ? q - W : -1, qy < H - 1 ? q + W : -1];
      for (const r of nb) if (r >= 0 && mask[r] && lab[r] < 0) { lab[r] = id; stack[sp++] = r; }
    }
    comps.push(n);
    if (n > bestN) { bestN = n; best = id; }
  }
  // bbox + per-row width of the winning component
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  const rowW = [], rowL = [], rowR = [];
  for (let y = 0; y < H; y++) {
    let l = -1, r = -1, c = 0;
    for (let x = 0; x < W; x++) if (lab[y * W + x] === best) { if (l < 0) l = x; r = x; c++; }
    rowW.push(r < 0 ? 0 : r - l + 1); rowL.push(l); rowR.push(r);
    if (r >= 0) { if (l < x0) x0 = l; if (r > x1) x1 = r; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { px: bestN, bbox: [x0, y0, x1, y1], rowW, rowL, rowR, ncomp: comps.length };
}, { url, X, Y, W, H, T });

const [x0, y0, x1, y1] = out.bbox;
console.log(`img=${img} window=${X},${Y},${W},${H} thresh=${T}`);
console.log(`components=${out.ncomp} largest=${out.px}px`);
console.log(`BBOX abs: x ${X + x0}..${X + x1}  y ${Y + y0}..${Y + y1}   w=${x1 - x0 + 1} h=${y1 - y0 + 1}`);
console.log(`crop args: ${X + x0} ${Y + y0} ${x1 - x0 + 1} ${y1 - y0 + 1}`);
// width profile normalised by figure height
const fh = y1 - y0 + 1;
const prof = [];
for (let k = 0; k <= 40; k++) {
  const y = y0 + Math.round((fh - 1) * k / 40);
  prof.push(`${(k / 40).toFixed(3)} ${String(out.rowW[y]).padStart(4)}  ${(out.rowW[y] / fh).toFixed(4)}`);
}
console.log('h/H  wpx   w/H');
console.log(prof.join('\n'));
await browser.close();
