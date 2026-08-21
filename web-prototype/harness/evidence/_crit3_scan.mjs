// usage: node _crit3_scan.mjs <img> <axis:v|h> <fixed> <from> <to>
import { openCanvasPage, toDataURL } from '../imglib.mjs';

const [imgPath, axis, fixed, from, to] = process.argv.slice(2);
const { browser, page } = await openCanvasPage();
const durl = await toDataURL(imgPath);
const data = await page.evaluate(async ({ durl, axis, fixed, from, to }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = durl; });
  const canvas = document.createElement('canvas');
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const out = [];
  for (let i = Number(from); i <= Number(to); i++) {
    const x = axis === 'v' ? Number(fixed) : i;
    const y = axis === 'v' ? i : Number(fixed);
    const d = ctx.getImageData(x, y, 1, 1).data;
    const lum = 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
    out.push({ i, r: d[0], g: d[1], b: d[2], lum: Math.round(lum) });
  }
  return { w: img.width, h: img.height, out };
}, { durl, axis, fixed, from, to });
console.log('image', data.w, 'x', data.h);
console.log(data.out.map(o => `${o.i}:${o.lum}`).join(' '));
await browser.close();
