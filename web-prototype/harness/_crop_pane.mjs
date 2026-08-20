// Crop a region out of a PNG using the browser's own canvas — no image library needed.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const [src, out, x, y, w, h, scale] = process.argv.slice(2);
const b64 = readFileSync(src).toString('base64');
const browser = await chromium.launch({ executablePath: process.env.RRR_CHROME, args: ['--disable-dev-shm-usage'] });
const page = await browser.newPage();
const data = await page.evaluate(async ([d, X, Y, W, H, S]) => {
  const img = new Image();
  await new Promise((r) => { img.onload = r; img.src = d; });
  const c = document.createElement('canvas');
  c.width = W * S; c.height = H * S;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, X, Y, W, H, 0, 0, W * S, H * S);
  return c.toDataURL('image/png');
}, [`data:image/png;base64,${b64}`, +x, +y, +w, +h, +(scale || 1)]);
writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
console.log('→', out);
await browser.close(); process.exit(0);
