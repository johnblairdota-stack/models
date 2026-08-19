// Crop several boxes out of PNGs and lay them out in one strip, nearest-neighbour upscaled.
// usage: node zoom.mjs <out.png> <scale> <label:in.png:x:y:w:h> ...
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';

const [outPath, scaleS, ...specs] = process.argv.slice(2);
const SCALE = Number(scaleS);
const browser = await chromium.launch();
const page = await browser.newPage();

const items = [];
for (const s of specs) {
  const parts = s.split('|');
  const [label, inPath, x, y, w, h] = parts;
  const buf = await readFile(inPath);
  items.push({ label, url: `data:image/png;base64,${buf.toString('base64')}`,
    x: +x, y: +y, w: +w, h: +h });
}

const out = await page.evaluate(async ({ items, SCALE }) => {
  const imgs = [];
  for (const it of items) {
    imgs.push(await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = it.url;
    }));
  }
  const PAD = 8, LAB = 22;
  const cw = items.map(it => it.w * SCALE);
  const ch = Math.max(...items.map(it => it.h * SCALE));
  const c = document.createElement('canvas');
  c.width = cw.reduce((a, b) => a + b, 0) + PAD * (items.length + 1);
  c.height = ch + PAD * 2 + LAB;
  const g = c.getContext('2d');
  g.fillStyle = '#14171a'; g.fillRect(0, 0, c.width, c.height);
  g.imageSmoothingEnabled = false;
  let x = PAD;
  items.forEach((it, i) => {
    g.drawImage(imgs[i], it.x, it.y, it.w, it.h, x, PAD, it.w * SCALE, it.h * SCALE);
    g.imageSmoothingEnabled = true;
    g.fillStyle = '#cfe3ff'; g.font = '15px monospace';
    g.fillText(it.label, x + 2, PAD + ch + 16);
    g.imageSmoothingEnabled = false;
    x += it.w * SCALE + PAD;
  });
  return c.toDataURL('image/png');
}, { items, SCALE });

await writeFile(outPath, Buffer.from(out.split(',')[1], 'base64'));
await browser.close();
console.log('wrote', outPath);
