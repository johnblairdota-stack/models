// Critic scratch tool: luminance stats (min/max/mean/stddev) over a rectangular patch.
// Usage: node _tmp_patch_stats.mjs <imgPath> <x> <y> <w> <h>
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const [, , srcPath, xs, ys, ws, hs] = process.argv;
const url = pathToFileURL(path.resolve(srcPath)).href;
const htmlPath = path.join(os.tmpdir(), '_tmp_patch_stats.html');
writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0;padding:0;">
  <img id="im" src="${url}" style="display:block;">
</body></html>`);

const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => document.getElementById('im').complete);

const x = +xs, y = +ys, w = +ws, h = +hs;
const result = await page.evaluate(({x,y,w,h}) => {
  const img = document.getElementById('im');
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(x, y, w, h).data;
  let min=255, max=0, sum=0, n=0, sumsq=0;
  for (let i=0; i<d.length; i+=4) {
    const l = (d[i]+d[i+1]+d[i+2])/3;
    if (l<min) min=l; if (l>max) max=l;
    sum+=l; sumsq+=l*l; n++;
  }
  const mean = sum/n;
  const std = Math.sqrt(sumsq/n - mean*mean);
  return { min: Math.round(min), max: Math.round(max), range: Math.round(max-min), mean: Math.round(mean), std: Math.round(std*10)/10 };
}, {x,y,w,h});

console.log(path.basename(srcPath), x, y, w, h, JSON.stringify(result));
await browser.close();
