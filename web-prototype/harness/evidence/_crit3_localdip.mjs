// usage: node _crit3_localdip.mjs <img> <xcenter> <halfwin> <yfrom> <yto> <ystep>
import { openCanvasPage, toDataURL } from '../imglib.mjs';

const [imgPath, xc, halfwin, yfrom, yto, ystep] = process.argv.slice(2);
const HW = Number(halfwin);
const XC = Number(xc);
const { browser, page } = await openCanvasPage();
const durl = await toDataURL(imgPath);
const data = await page.evaluate(async ({ durl, XC, HW, yfrom, yto, ystep }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = durl; });
  const canvas = document.createElement('canvas');
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const lumAt = (x, y) => {
    const d = ctx.getImageData(x, y, 1, 1).data;
    return 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
  };
  const out = [];
  for (let y = Number(yfrom); y <= Number(yto); y += Number(ystep)) {
    const center = lumAt(XC, y);
    const flank = (lumAt(XC - HW, y) + lumAt(XC + HW, y)) / 2;
    out.push({ y, center: Math.round(center), flank: Math.round(flank), dip: Math.round(flank - center) });
  }
  return { w: img.width, h: img.height, out };
}, { durl, XC, HW, yfrom, yto, ystep });
console.log('image', data.w, 'x', data.h, 'xcenter', XC, 'halfwin', HW);
console.log(data.out.map(o => `y${o.y}:c${o.center}/f${o.flank}/dip${o.dip}`).join(' '));
await browser.close();
