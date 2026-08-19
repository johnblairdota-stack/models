// estate-owner-14 scratch tool: crop + upscale + brighten an arbitrary local PNG region.
// Usage: node _estate14_floorcrop.mjs <srcPath> <x> <y> <w> <h> <outPath> [scale=4] [bright=1]
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const [, , srcPath, xs, ys, ws, hs, outPath, scaleS, brightS] = process.argv;
const url = pathToFileURL(path.resolve(srcPath)).href;
const htmlPath = path.join(os.tmpdir(), '_estate14_floorcrop.html');
writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0;padding:0;">
  <img id="im" src="${url}" style="display:block;">
</body></html>`);

const x = +xs, y = +ys, w = +ws, h = +hs, scale = +(scaleS || 4), bright = +(brightS || 1);
const outW = w * scale, outH = h * scale;
const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
const page = await browser.newPage({ viewport: { width: Math.min(outW, 4000), height: Math.min(outH, 4000) } });
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => document.getElementById('im').complete);

const dataUrl = await page.evaluate(({ x, y, w, h, outW, outH, bright }) => {
  const img = document.getElementById('im');
  const cv = document.createElement('canvas');
  cv.width = outW; cv.height = outH;
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.filter = `brightness(${bright})`;
  ctx.drawImage(img, x, y, w, h, 0, 0, outW, outH);
  return cv.toDataURL('image/png');
}, { x, y, w, h, outW, outH, bright });

const b64 = dataUrl.split(',')[1];
writeFileSync(path.resolve(outPath), Buffer.from(b64, 'base64'));
console.log('wrote', outPath, outW, 'x', outH, 'from', srcPath, 'region', x, y, w, h, 'bright', bright);
await browser.close();
