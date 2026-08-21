// usage: node _crit3_colavg.mjs <img> <xfrom> <xto> <yfrom> <yto>
import { openCanvasPage, toDataURL } from '../imglib.mjs';

const [imgPath, xfrom, xto, yfrom, yto] = process.argv.slice(2);
const { browser, page } = await openCanvasPage();
const durl = await toDataURL(imgPath);
const data = await page.evaluate(async ({ durl, xfrom, xto, yfrom, yto }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = durl; });
  const canvas = document.createElement('canvas');
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const out = [];
  for (let x = Number(xfrom); x <= Number(xto); x++) {
    let sum = 0, n = 0;
    for (let y = Number(yfrom); y <= Number(yto); y++) {
      const d = ctx.getImageData(x, y, 1, 1).data;
      sum += 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2];
      n++;
    }
    out.push({ x, avg: Math.round(sum / n) });
  }
  return { w: img.width, h: img.height, out };
}, { durl, xfrom, xto, yfrom, yto });
console.log('image', data.w, 'x', data.h);
console.log(data.out.map(o => `${o.x}:${o.avg}`).join(' '));
await browser.close();
