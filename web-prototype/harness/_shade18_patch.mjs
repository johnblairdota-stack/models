// shade-18: MEAN RGB OF A NAMED RECT IN A NAMED IMAGE, so "the floor in shade" is a number
// in both pictures rather than an adjective in one.
//   node harness/_shade18_patch.mjs <img> x,y,w,h [x,y,w,h ...]
// Rects are in the IMAGE's OWN pixels. Both the bar and the captures are 1920x1080, so a rect
// read off a 1280-wide review PNG must be scaled by 1.5 first — that mistake put an earlier
// measurement on a rug instead of a floor.
import { openCanvasPage, toDataURL } from './imglib.mjs';

const [imgPath, ...rects] = process.argv.slice(2);
const { browser, page } = await openCanvasPage();
const durl = await toDataURL(imgPath);
const out = await page.evaluate(async ({ durl, rects }) => {
  const img = new Image();
  img.src = durl;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const cx = cv.getContext('2d');
  cx.drawImage(img, 0, 0);
  return rects.map((spec) => {
    const [x, y, w, h] = spec.split(',').map(Number);
    const d = cx.getImageData(x, y, w, h).data;
    let r = 0, g = 0, b = 0;
    const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
    r /= n; g /= n; b /= n;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return { spec, r: +r.toFixed(1), g: +g.toFixed(1), b: +b.toFixed(1),
      L: +L.toFixed(1), rb: +(r - b).toFixed(1), norm: +((r - b) / L).toFixed(3),
      wh: +(w * h) };
  });
}, { durl, rects });
console.log(`${imgPath.split('/').pop()}  (${out[0] ? '' : 'no rects'})`);
for (const o of out) console.log(`  ${o.spec.padEnd(20)} rgb ${String(o.r).padStart(6)} ${String(o.g).padStart(6)} ${String(o.b).padStart(6)}   L ${String(o.L).padStart(6)}   r-b ${String(o.rb).padStart(6)}   (r-b)/L ${o.norm}`);
await browser.close();
