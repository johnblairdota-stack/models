// nearest-neighbour upscale at arbitrary scale: node up.mjs <in> <out> <scale>
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
const [inP, outP, sc] = process.argv.slice(2);
const SCALE = Number(sc || 3);
const browser = await chromium.launch();
const page = await browser.newPage();
const buf = await readFile(inP);
const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
const out = await page.evaluate(async ([url, SCALE]) => {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const c = document.createElement('canvas'); c.width = Math.round(img.width * SCALE); c.height = Math.round(img.height * SCALE);
  const cx = c.getContext('2d'); cx.imageSmoothingEnabled = false;
  cx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}, [dataUrl, SCALE]);
await writeFile(outP, Buffer.from(out.split(',')[1], 'base64'));
await browser.close();
console.log('wrote', outP);
