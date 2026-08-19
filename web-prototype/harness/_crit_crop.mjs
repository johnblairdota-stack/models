// Ad-hoc crop tool for critic use (post-hoc cropping of an already-captured PNG), via
// Playwright canvas since no image lib is present in node_modules. Not part of the pipeline.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const [,, inPath, outPath, xs, ys, ws, hs] = process.argv;
if (!inPath || !outPath || xs === undefined) {
  console.error('usage: node _crit_crop.mjs <in.png> <out.png> x y w h');
  process.exit(1);
}
const [x, y, w, h] = [xs, ys, ws, hs].map(Number);

const buf = readFileSync(resolve(inPath));
const b64 = buf.toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<html><body style="margin:0"><img id="im" src="data:image/png;base64,${b64}"/><canvas id="c"></canvas></body></html>`);
await page.waitForFunction(() => document.getElementById('im').complete);

const dataUrl = await page.evaluate(({x,y,w,h}) => {
  const img = document.getElementById('im');
  const c = document.getElementById('c');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, x, y, w, h, 0, 0, w, h);
  return c.toDataURL('image/png');
}, {x,y,w,h});

const outBuf = Buffer.from(dataUrl.split(',')[1], 'base64');
writeFileSync(resolve(outPath), outBuf);
await browser.close();
console.log('wrote', outPath);
