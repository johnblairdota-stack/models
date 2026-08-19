// Critic-robot-34 scratch tool: average RGB over a rectangular patch.
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , srcPath, xs, ys, ws, hs] = process.argv;
const url = pathToFileURL(path.resolve(srcPath)).href;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(url);
await page.waitForFunction(() => document.querySelector('img')?.complete);
const x = +xs, y = +ys, w = +ws, h = +hs;
const result = await page.evaluate(({x,y,w,h}) => {
  const img = document.querySelector('img');
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(x, y, w, h).data;
  let r=0,g=0,b=0,n=0;
  for (let i=0; i<d.length; i+=4) { r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++; }
  return { r: Math.round(r/n), g: Math.round(g/n), b: Math.round(b/n), n };
}, {x,y,w,h});
console.log(path.basename(srcPath), x, y, w, h, JSON.stringify(result));
await browser.close();
