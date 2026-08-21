// usage: node _crit3_crop.mjs <img> <x> <y> <w> <h> <out> [<scale>]
import { openCanvasPage, toDataURL } from '../imglib.mjs';
import { writeFile } from 'node:fs/promises';

const [imgPath, x, y, w, h, out, scale] = process.argv.slice(2);
const sc = scale ? Number(scale) : 1;

const { browser, page } = await openCanvasPage();
const durl = await toDataURL(imgPath);
const b64 = await page.evaluate(async ({ durl, x, y, w, h, sc }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = durl; });
  const canvas = document.createElement('canvas');
  canvas.width = w * sc; canvas.height = h * sc;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, x, y, w, h, 0, 0, w * sc, h * sc);
  return canvas.toDataURL('image/png').split(',')[1];
}, { durl, x: Number(x), y: Number(y), w: Number(w), h: Number(h), sc });

await writeFile(out, Buffer.from(b64, 'base64'));
console.log('wrote', out);
await browser.close();
