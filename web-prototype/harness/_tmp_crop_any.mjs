// Critic scratch tool: crop an arbitrary local PNG to a region and save it.
// Usage: node _tmp_crop_any.mjs <srcPath> <x> <y> <w> <h> <outPath>
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const [, , srcPath, xs, ys, ws, hs, outPath] = process.argv;
const url = pathToFileURL(path.resolve(srcPath)).href;
const htmlPath = path.join(os.tmpdir(), '_tmp_crop_any.html');
writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0;padding:0;">
  <img id="im" src="${url}" style="display:block;">
</body></html>`);

const x = +xs, y = +ys, w = +ws, h = +hs;
const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => document.getElementById('im').complete);

const dataUrl = await page.evaluate(({ x, y, w, h }) => {
  const img = document.getElementById('im');
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  return cv.toDataURL('image/png');
}, { x, y, w, h });

const b64 = dataUrl.split(',')[1];
writeFileSync(path.resolve(outPath), Buffer.from(b64, 'base64'));
console.log('wrote', outPath, w, 'x', h, 'from', srcPath, 'at', x, y);
await browser.close();
