// dec-who-44: INSIDE A DECILE BAND, WHICH PIXELS ARE CARRYING THE CHROMA?
//
// `_declook26` masks a band so it can be LOOKED at, and round 18's rule came out of that: a
// decile is a set of pixels somewhere in the room. This is the arithmetic half — the same band,
// split by hue class, reporting each class's share of the PIXELS and its share of the total
// (r-b). Those two numbers are different questions and the round turns on the second: the gilt
// is the warmest thing in deciles 2-3 and can still be a tenth of the error.
//
//   node harness/_decwho44.mjs <img> <fromDecile> <toDecile>
import { openCanvasPage, toDataURL } from './imglib.mjs';
const [img, d0, d1] = process.argv.slice(2);
const { browser, page } = await openCanvasPage();
const durl = await toDataURL(img);
const r = await page.evaluate(async ({ durl, d0, d1 }) => {
  const im = new Image(); im.src = durl; await im.decode();
  const cv = document.createElement('canvas');
  cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
  const d = cx.getImageData(0, 0, cv.width, cv.height).data;
  const n = d.length / 4;
  const L = new Float32Array(n);
  for (let i = 0, j = 0; j < n; j++, i += 4) L[j] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => L[a] - L[b]);
  const a = Math.floor(n * (d0 - 1) / 10), b = Math.floor(n * d1 / 10);
  // classes by the SHAPE of the triple, not by a guess at what object it is
  const classes = {
    'red (r > 1.8b, r > 1.25g)': (R, G, B) => R > 1.8 * B && R > 1.25 * G,
    'amber (r > 1.35b, g between)': (R, G, B) => R > 1.35 * B && R <= 1.8 * B,
    'warm-grey (1.1b < r <= 1.35b)': (R, G, B) => R > 1.10 * B && R <= 1.35 * B,
    'neutral (0.92b..1.1b)': (R, G, B) => R > 0.92 * B && R <= 1.10 * B,
    'cool (r <= 0.92b)': (R, G, B) => R <= 0.92 * B,
  };
  const names = Object.keys(classes);
  const px = names.map(() => 0), rb = names.map(() => 0);
  let totRB = 0, totL = 0;
  for (let i = a; i < b; i++) {
    const j = idx[i] * 4, R = d[j], G = d[j + 1], B = d[j + 2];
    const diff = R - B;
    totRB += diff; totL += L[idx[i]];
    for (let k = 0; k < names.length; k++) {
      if (classes[names[k]](R, G, B)) { px[k]++; rb[k] += diff; break; }
    }
  }
  const cnt = b - a;
  return { cnt, meanL: totL / cnt, meanRB: totRB / cnt, totRB,
    rows: names.map((nm, k) => ({ nm, pct: 100 * px[k] / cnt, share: 100 * rb[k] / totRB,
      meanRB: px[k] ? rb[k] / px[k] : 0 })) };
}, { durl, d0: +d0, d1: +d1 });
console.log(`\n${img}  deciles ${d0}-${d1}: ${r.cnt} px, mean L ${r.meanL.toFixed(1)}, ` +
  `mean (r-b) ${r.meanRB.toFixed(1)}, (r-b)/L ${(r.meanRB / r.meanL).toFixed(2)}`);
for (const row of r.rows) {
  console.log(`   ${row.nm.padEnd(32)} ${row.pct.toFixed(1).padStart(5)}% of pixels   ` +
    `${row.share.toFixed(1).padStart(5)}% of the (r-b)   mean r-b ${row.meanRB.toFixed(1)}`);
}
await browser.close();
