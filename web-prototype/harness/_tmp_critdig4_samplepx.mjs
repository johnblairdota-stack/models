import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const [, , srcPath, ...coords] = process.argv;
const url = pathToFileURL(path.resolve(srcPath)).href;
const htmlPath = path.join(os.tmpdir(), '_tmp_sample.html');
writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0;padding:0;"><img id="im" src="${url}"></body></html>`);

const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => document.getElementById('im').complete);

const pts = [];
for (let i = 0; i < coords.length; i += 2) pts.push([+coords[i], +coords[i+1]]);

const result = await page.evaluate((pts) => {
  const img = document.getElementById('im');
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return pts.map(([x,y]) => { const d = ctx.getImageData(x,y,1,1).data; return [x,y,d[0],d[1],d[2],d[3]]; });
}, pts);

console.log(srcPath);
result.forEach(r => console.log(`  (${r[0]},${r[1]}) -> rgb(${r[2]},${r[3]},${r[4]}) a=${r[5]}`));
await browser.close();
