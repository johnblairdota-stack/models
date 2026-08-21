/**
 * gadget-owner-7 scratch probe: rectangle statistics over a PNG.
 *
 * WHY NOT AN EXISTING TOOL. `_tmp_fxprobe.mjs` scans a whole row or column and
 * `measure.mjs` wants a clean silhouette. What this round needs is the opposite: the
 * skate drift marks are THIN dark lines on a near-white floor, so a mean over a box is
 * dominated by the floor and reports "no mark". Percentiles over the box are what
 * separate "a few dark line pixels" from "a uniformly grey box", and that distinction is
 * the entire measurement for a skid mark.
 *
 *   node harness/evidence/_g7_px.mjs <png> "label:x,y,w,h" ["label:x,y,w,h" ...]
 *
 * Reports, per rect: mean rgb, luminance mean/p01/p05/median/p95, and the fraction of
 * pixels more than N luminance levels below the rect's own 95th percentile (`darkFrac`),
 * which is the "is there a mark here at all" number.
 */
import { toDataURL, openCanvasPage } from '../imglib.mjs';

const [, , file, ...rectArgs] = process.argv;
if (!file || !rectArgs.length) {
  console.error('usage: node harness/evidence/_g7_px.mjs <png> "label:x,y,w,h" ...');
  process.exit(2);
}

const rects = rectArgs.map((s) => {
  const [label, nums] = s.includes(':') ? s.split(':') : ['rect', s];
  const [x, y, w, h] = nums.split(',').map(Number);
  return { label, x, y, w, h };
});

const dataUrl = await toDataURL(file);
const { browser, page } = await openCanvasPage();

const out = await page.evaluate(async ({ dataUrl, rects }) => {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);

  const pick = (arr, q) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(q * (arr.length - 1))))];

  return {
    size: [cv.width, cv.height],
    rows: rects.map((r) => {
      const d = ctx.getImageData(r.x, r.y, r.w, r.h).data;
      const lum = [];
      let sr = 0, sg = 0, sb = 0;
      for (let i = 0; i < d.length; i += 4) {
        sr += d[i]; sg += d[i + 1]; sb += d[i + 2];
        lum.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      }
      const n = lum.length;
      const sorted = lum.slice().sort((a, b) => a - b);
      const p95 = pick(sorted, 0.95);
      let below = 0;
      for (const v of lum) if (v < p95 - 6) below++;
      return {
        label: r.label,
        rgb: [sr / n, sg / n, sb / n].map((v) => +v.toFixed(1)),
        Lmean: +(lum.reduce((a, b) => a + b, 0) / n).toFixed(1),
        p01: +pick(sorted, 0.01).toFixed(1),
        p05: +pick(sorted, 0.05).toFixed(1),
        med: +pick(sorted, 0.50).toFixed(1),
        p95: +p95.toFixed(1),
        darkFrac: +(below / n).toFixed(3),
        n,
      };
    }),
  };
}, { dataUrl, rects });

await browser.close();

console.log(`${file}  ${out.size[0]}x${out.size[1]}`);
console.log('label'.padEnd(16), 'rgb'.padEnd(22), 'Lmean  p01    p05    med    p95    darkFrac');
for (const r of out.rows) {
  console.log(
    r.label.padEnd(16),
    `${r.rgb.join('/')}`.padEnd(22),
    String(r.Lmean).padEnd(6), String(r.p01).padEnd(6), String(r.p05).padEnd(6),
    String(r.med).padEnd(6), String(r.p95).padEnd(6), r.darkFrac,
  );
}
