// Critic-robot-34 scratch tool: luminance median/range stats over a rectangular patch.
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
  const lums = [];
  for (let i=0; i<d.length; i+=4) lums.push((d[i]+d[i+1]+d[i+2])/3);
  lums.sort((a,b)=>a-b);
  const n = lums.length;
  const median = lums[Math.floor(n/2)];
  const p05 = lums[Math.floor(n*0.05)];
  const p95 = lums[Math.floor(n*0.95)];
  return { median: Math.round(median), min: Math.round(lums[0]), max: Math.round(lums[n-1]),
           range: Math.round(lums[n-1]-lums[0]), p05: Math.round(p05), p95: Math.round(p95),
           rangeP: Math.round(p95-p05) };
}, {x,y,w,h});
console.log(path.basename(srcPath), x, y, w, h, JSON.stringify(result));
await browser.close();
