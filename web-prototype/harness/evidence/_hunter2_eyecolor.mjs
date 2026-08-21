// Critic scratch tool: find bright "eye" pixels (high R relative to B) within a region and
// report their average colour. Region given as absolute px x,y,w,h on the source image.
import { chromium } from 'playwright';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const [, , srcPath, regionStr] = process.argv;
const [x0, y0, w, h] = regionStr.split(',').map(Number);
const b64 = readFileSync(path.resolve(srcPath)).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<body style="margin:0"><img id="im" src="data:image/png;base64,${b64}"></body>`);
await page.waitForFunction(() => { const im = document.getElementById('im'); return im.complete && im.naturalWidth > 0; });

const out = await page.evaluate(({x0,y0,w,h}) => {
  const img = document.getElementById('im');
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const W = cv.width, H = cv.height;
  const d = ctx.getImageData(0, 0, W, H).data;
  let r=0,g=0,b=0,n=0, maxLum=-1, maxPx=null;
  const thresholdPts = [];
  for (let y=y0;y<y0+h;y++) for (let x=x0;x<x0+w;x++) {
    if (x<0||y<0||x>=W||y>=H) continue;
    const i=(y*W+x)*4;
    const R=d[i],G=d[i+1],B=d[i+2];
    const lum = 0.2126*R+0.7152*G+0.0722*B;
    if (lum > maxLum) { maxLum = lum; maxPx = {x,y,R,G,B}; }
    // "eye-like" bright pixel: much brighter than surrounding dark navy plate
    if (lum > 40) { r+=R; g+=G; b+=B; n++; thresholdPts.push({x,y,R,G,B}); }
  }
  const avg = n ? [r/n,g/n,b/n] : null;
  return { region:{x0,y0,w,h}, brightestPixel:maxPx, brightPixelCount:n, avgOfBrightPixels: avg };
}, {x0,y0,w,h});

console.log(path.basename(srcPath), JSON.stringify(out, null, 1));
await browser.close();
