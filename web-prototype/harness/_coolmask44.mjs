// cool-mask-44: WHERE IS THE COLD LIGHT? Locate it before sweeping anything at it.
//
// Round 44's class split found that 37.7% of this room's ninth decile is cool-class (r <= 0.92b,
// mean r-b -18.7) against the reference's 0.2%. A percentage is not a place. This paints every
// cool-class pixel over a desaturated plate so the cold can be looked at, the same way
// `_declook26` did for a decile band — and the rule that came out of that one applies here too:
// crop the rect and look at it before believing what it is.
//
//   node harness/_coolmask44.mjs <img> <out.png> [minDecile] [class: cool|neutralcool]
import { openCanvasPage, toDataURL } from './imglib.mjs';
import { writeFile } from 'node:fs/promises';
const [img, out, minDec, klass] = process.argv.slice(2);
const { browser, page } = await openCanvasPage();
const durl = await toDataURL(img);
const res = await page.evaluate(async ({ durl, minDec, klass }) => {
  const im = new Image(); im.src = durl; await im.decode();
  const cv = document.createElement('canvas');
  cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0);
  const id = cx.getImageData(0, 0, cv.width, cv.height);
  const d = id.data, n = d.length / 4;
  const L = new Float32Array(n);
  for (let i = 0, j = 0; j < n; j++, i += 4) L[j] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const sorted = Float32Array.from(L).sort();
  const cut = minDec > 0 ? sorted[Math.floor(n * (minDec - 1) / 10)] : -1;
  let hit = 0;
  for (let i = 0, j = 0; j < n; j++, i += 4) {
    const R = d[i], G = d[i + 1], B = d[i + 2];
    // `neutralcool` widens the mask to everything that is not at least mildly warm — the class
    // the reference has only 7% of in its bright band against this room's 32%.
    const inClass = klass === 'neutralcool' ? R <= 1.10 * B : R <= 0.92 * B;
    const cool = inClass && L[j] >= cut;
    if (cool) { d[i] = 20; d[i + 1] = 190; d[i + 2] = 255; hit++; }
    else { const g = 40 + L[j] * 0.55; d[i] = g; d[i + 1] = g; d[i + 2] = g; }
  }
  cx.putImageData(id, 0, 0);
  return { url: cv.toDataURL('image/png'), pct: 100 * hit / n };
}, { durl, minDec: Number(minDec ?? 0), klass: klass || 'cool' });
await writeFile(out, Buffer.from(res.url.split(',')[1], 'base64'));
console.log(`cool-class pixels${minDec ? ` at or above decile ${minDec}` : ''}: ${res.pct.toFixed(1)}% of frame -> ${out}`);
await browser.close();
