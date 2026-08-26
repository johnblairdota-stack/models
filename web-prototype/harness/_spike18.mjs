// spike-18: find the pixels a thin bright artefact actually occupies, instead of estimating
// them off a zoomed crop. Four `_eye17_pick` probes were spent on coordinates read by eye from
// a 2x crop and all four landed on the wall behind the thing being looked for.
// Reports pixels that stand well clear of their own horizontal neighbours.
//   node harness/_spike18.mjs <img> x,y,w,h [minDelta]
import { openCanvasPage, toDataURL } from './imglib.mjs';
const [img, rect, minD] = process.argv.slice(2);
const [rx, ry, rw, rh] = rect.split(',').map(Number);
const D = Number(minD ?? 25);
const { browser, page } = await openCanvasPage();
const durl = await toDataURL(img);
const out = await page.evaluate(async ({ durl, rx, ry, rw, rh, D }) => {
  const im = new Image(); im.src = durl; await im.decode();
  const cv = document.createElement('canvas');
  cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
  const d = cx.getImageData(rx, ry, rw, rh).data;
  const L = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const hits = [];
  for (let y = 0; y < rh; y++) {
    for (let x = 3; x < rw - 3; x++) {
      const i = (y * rw + x) * 4;
      const c = L(i), l = L(i - 12), r = L(i + 12);
      if (c - Math.max(l, r) > D) hits.push([rx + x, ry + y, +c.toFixed(0), +Math.max(l, r).toFixed(0)]);
    }
  }
  return hits;
}, { durl, rx, ry, rw, rh, D });
console.log(`${out.length} spike px (centre brighter than both neighbours by > ${D})`);
for (const h of out.slice(0, 14)) console.log(`  (${h[0]},${h[1]})  L ${h[2]} vs neighbours ${h[3]}`);
await browser.close();
