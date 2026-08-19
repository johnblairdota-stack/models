// Ad-hoc: % of pixels in a crop region that are "clean" (bright, near-shell) vs "dirty"
// (dark, grime), by luminance threshold. Ignores near-background pixels (very light, >250,
// treated separately) is not needed here since crops are pre-isolated to metal surface.
import { toDataURL, openCanvasPage } from './imglib.mjs';
import { writeFileSync } from 'fs';

const [,, file, x, y, w, h, cleanT, dirtT] = process.argv;
const X = +x, Y = +y, W = +w, H = +h;
const CLEAN = cleanT ? +cleanT : 190;
const DIRT = dirtT ? +dirtT : 140;

const { browser, page } = await openCanvasPage();
const url = await toDataURL(file);
await page.setContent(`<img id="im" src="${url}"/><canvas id="c"></canvas>`);
await page.waitForFunction(() => document.getElementById('im').complete);

const result = await page.evaluate(({X,Y,W,H,CLEAN,DIRT}) => {
  const img = document.getElementById('im');
  const c = document.getElementById('c');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(img, X, Y, W, H, 0, 0, W, H);
  const id = g.getImageData(0, 0, W, H);
  const d = id.data;
  let clean = 0, dirty = 0, mid = 0, bg = 0, total = 0, sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
    total++; sum += lum;
    if (lum > 246) bg++;
    else if (lum >= CLEAN) clean++;
    else if (lum <= DIRT) dirty++;
    else mid++;
  }
  return { total, clean, dirty, mid, bg, meanLum: sum/total,
    pctClean: (100*clean/total).toFixed(1), pctDirty: (100*dirty/total).toFixed(1), pctMid: (100*mid/total).toFixed(1), pctBg: (100*bg/total).toFixed(1) };
}, {X,Y,W,H,CLEAN,DIRT});

console.log(JSON.stringify({ file, crop: [X,Y,W,H], cleanThreshold: CLEAN, dirtThreshold: DIRT, ...result }, null, 2));
await browser.close();
