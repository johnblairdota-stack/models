// decile-look-26: WHERE ARE THE PIXELS OF A GIVEN DECILE, and what colour are they.
//
// Round 18 spent its whole last stretch treating the decile ladder as an abstraction and
// sweeping global terms at it — the fills, the sun, the toe, the haze, the ambient, the split
// tone. Every one of them ROTATES the ladder, because every one of them is global, and the
// remaining defect is a SHAPE. A decile is not an abstraction: it is a set of pixels somewhere
// in the room, and if deciles 2-3 are too warm then some particular things in the room are too
// warm. This masks them so they can be looked at.
//
//   node harness/_declook26.mjs <img> <fromDecile> <toDecile> <out.png>
import { openCanvasPage, toDataURL } from './imglib.mjs';
import { writeFile } from 'node:fs/promises';

const [img, d0, d1, out] = process.argv.slice(2);
const { browser, page } = await openCanvasPage();
const durl = await toDataURL(img);
const res = await page.evaluate(async ({ durl, d0, d1 }) => {
  const im = new Image(); im.src = durl; await im.decode();
  const cv = document.createElement('canvas');
  cv.width = im.naturalWidth; cv.height = im.naturalHeight;
  const cx = cv.getContext('2d');
  cx.drawImage(im, 0, 0);
  const id = cx.getImageData(0, 0, cv.width, cv.height);
  const d = id.data;
  const L = new Float32Array(d.length / 4);
  for (let p = 0; p < L.length; p++) {
    const i = p * 4;
    L[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  }
  const sorted = Float32Array.from(L).sort();
  const lo = sorted[Math.floor(sorted.length * (d0 / 10))];
  const hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * (d1 / 10)))];
  let r = 0, g = 0, b = 0, n = 0;
  for (let p = 0; p < L.length; p++) {
    const i = p * 4;
    if (L[p] >= lo && L[p] <= hi) {
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      // keep the pixel, but mark the rest so the mask reads as "these ones"
    } else {
      // ⚠ DESATURATE rather than blacken the rest. A black mask hides WHERE the kept pixels
      // are in the room; a grey ghost of the frame keeps the architecture legible so the
      // answer can be "the floor under the sheets" rather than "some pixels".
      const v = Math.round(L[p] * 0.22 + 30);
      d[i] = v; d[i + 1] = v; d[i + 2] = v;
    }
  }
  cx.putImageData(id, 0, 0);
  return {
    url: cv.toDataURL('image/png'),
    lo: +lo.toFixed(1), hi: +hi.toFixed(1), n,
    mean: [r / n, g / n, b / n].map((v) => +v.toFixed(1)),
  };
}, { durl, d0: Number(d0), d1: Number(d1) });
console.log(`deciles ${d0}-${d1}: L ${res.lo} to ${res.hi}, ${res.n} px, mean rgb ${res.mean.join(' / ')}`);
await writeFile(out, Buffer.from(res.url.split(',')[1], 'base64'));
console.log('wrote', out);
await browser.close();
