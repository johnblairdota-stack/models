import { openCanvasPage, toDataURL } from './imglib.mjs';
const [imgPath, x, y] = process.argv.slice(2);
const { browser, page } = await openCanvasPage();
const durl = await toDataURL(imgPath);
const d = await page.evaluate(async ({ durl, x, y }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = durl; });
  const canvas = document.createElement('canvas');
  canvas.width = img.width; canvas.height = img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return Array.from(ctx.getImageData(Number(x), Number(y), 1, 1).data);
}, { durl, x, y });
console.log(imgPath, x, y, '->', d);
await browser.close();
