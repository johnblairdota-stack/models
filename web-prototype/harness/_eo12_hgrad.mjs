// estate-owner-12: `_critic9_floorbreak.mjs`'s EXACT acutance metric — mean |dL/dx| / 255 —
// computed on a SAVED PNG instead of on a live page, so a saved-frame comparison and the live
// break test can be checked against each other. They disagreed by 4.6x on one rect and the
// disagreement had to be resolved before either number could be quoted.
//   node harness/_eo12_hgrad.mjs <img> "x,y,w,h,label" ...
import { toDataURL, openCanvasPage } from './imglib.mjs';

const [, , file, ...regions] = process.argv;
const url = await toDataURL(file);
const { browser, page } = await openCanvasPage();
const rows = await page.evaluate(async ({ url, regions }) => {
  const img = new Image(); img.src = url; await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const W = cv.width;
  const all = cx.getImageData(0, 0, cv.width, cv.height).data;
  const out = [];
  for (const spec of regions) {
    const [xs, ys, ws, hs, label] = spec.split(',');
    const X = +xs, Y = +ys, Wd = +ws, Ht = +hs;
    const L = (x, y) => {
      const i = ((Y + y) * W + (X + x)) * 4;
      return 0.2126 * all[i] + 0.7152 * all[i + 1] + 0.0722 * all[i + 2];
    };
    let sum = 0, n = 0, ls = 0;
    for (let y = 0; y < Ht; y++) {
      for (let x = 1; x < Wd; x++) { sum += Math.abs(L(x, y) - L(x - 1, y)); n++; }
    }
    for (let y = 0; y < Ht; y++) for (let x = 0; x < Wd; x++) ls += L(x, y);
    out.push({ label, acut: +(sum / n / 255).toFixed(4), meanAbsDx: +(sum / n).toFixed(2), meanL: +(ls / (Wd * Ht)).toFixed(1) });
  }
  return out;
}, { url, regions });
for (const r of rows) console.log(`${r.label.padEnd(18)} acut ${r.acut}  mean|dL/dx| ${r.meanAbsDx}  meanL ${r.meanL}`);
await browser.close();
