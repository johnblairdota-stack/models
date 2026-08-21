/**
 * gadget-owner-6 scratch: silhouette WIDTH at a ladder of heights, as a fraction of a named
 * reference band. Used to compare a render's grapnel claw against the bar art's without
 * depending on either image's scale, crop or figure height.
 *
 *   node harness/evidence/_g6_span.mjs <img> <x0> <x1> <y0> <y1> [rows=24] [tol=14]
 *
 * Background is taken as the median of the four corners of the search box, so it works on the
 * art's near-white paper and on the studio cyc alike. A row's span is the distance between the
 * FIRST and LAST column that departs from that background by more than `tol` in any channel —
 * i.e. the outer silhouette, which is what "how wide does the claw read" means. Rows are printed
 * raw so a thin cable and a wide fluke are distinguishable rather than averaged together.
 */
import { toDataURL, openCanvasPage, resolveImg } from '../imglib.mjs';

const [, , file, x0s, x1s, y0s, y1s, rowsS, tolS] = process.argv;
const url = await toDataURL(file);
const { browser, page } = await openCanvasPage();
await page.setContent('<body style="margin:0"></body>');

const out = await page.evaluate(async ({ url, x0, x1, y0, y1, nRows, tol }) => {
  const img = new Image(); img.src = url; await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const W = cv.width, H = cv.height;
  const d = cx.getImageData(0, 0, W, H).data;
  const at = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };

  const corners = [at(x0, y0), at(x1 - 1, y0), at(x0, y1 - 1), at(x1 - 1, y1 - 1)];
  const bg = [0, 1, 2].map((c) => corners.map((p) => p[c]).sort((a, b) => a - b)[1]);

  const rows = [];
  for (let k = 0; k < nRows; k++) {
    const y = Math.round(y0 + (y1 - y0) * (k + 0.5) / nRows);
    let lo = -1, hi = -1, n = 0;
    for (let x = x0; x < x1; x++) {
      const p = at(x, y);
      const off = Math.max(Math.abs(p[0] - bg[0]), Math.abs(p[1] - bg[1]), Math.abs(p[2] - bg[2]));
      if (off > tol) { if (lo < 0) lo = x; hi = x; n++; }
    }
    rows.push({ y, lo, hi, span: lo < 0 ? 0 : hi - lo + 1, ink: n });
  }
  return { W, H, bg, rows };
}, { url, x0: +x0s, x1: +x1s, y0: +y0s, y1: +y1s, nRows: +(rowsS || 24), tol: +(tolS || 14) });

console.log(`${resolveImg(file)}  ${out.W}x${out.H}  bg ${out.bg.join('/')}`);
console.log(`   ${'y'.padStart(6)} ${'lo'.padStart(6)} ${'hi'.padStart(6)} ${'span'.padStart(6)} ${'ink'.padStart(6)}`);
for (const r of out.rows) {
  console.log(`   ${String(r.y).padStart(6)} ${String(r.lo).padStart(6)} ${String(r.hi).padStart(6)} ${String(r.span).padStart(6)} ${String(r.ink).padStart(6)}`);
}
await browser.close();
