// usage: node _crit3_luma.mjs <img>
import { openCanvasPage, toDataURL } from '../imglib.mjs';
const [imgPath] = process.argv.slice(2);
const { browser, page } = await openCanvasPage();
const durl = await toDataURL(imgPath);
const d = await page.evaluate(async ({ durl }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = durl; });
  const canvas = document.createElement('canvas');
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  const lums = [];
  for (let i = 0; i < data.length; i += 4) {
    lums.push(0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
  }
  lums.sort((a, b) => a - b);
  const pct = (p) => lums[Math.floor(lums.length * p)];
  const belowFrac = (t) => lums.filter(l => l < t).length / lums.length;
  return {
    w: img.width, h: img.height,
    median: Math.round(pct(0.5)),
    p10: Math.round(pct(0.1)), p90: Math.round(pct(0.9)),
    fracBelow10: +(belowFrac(10)).toFixed(3),
    fracBelow20: +(belowFrac(20)).toFixed(3),
  };
}, { durl });
console.log(imgPath, JSON.stringify(d));
await browser.close();
