// Scan a horizontal row of a PNG and print pixel luma at intervals, to detect a faint ring/arc.
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import { writeFileSync } from 'node:fs';

const [, , srcPath, yStart, yEnd, xStart, xEnd, step] = process.argv;
const url = pathToFileURL(path.resolve(srcPath)).href;
const htmlPath = path.join(os.tmpdir(), '_tmp_scanrow.html');
writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0;padding:0;"><img id="im" src="${url}"></body></html>`);

const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => document.getElementById('im').complete);

const result = await page.evaluate(({ yStart, yEnd, xStart, xEnd, step }) => {
  const img = document.getElementById('im');
  const w = img.naturalWidth, h = img.naturalHeight;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const rows = [];
  for (let y = +yStart; y <= +yEnd; y += Math.max(1, Math.round((+yEnd - +yStart) / 6))) {
    const vals = [];
    for (let x = +xStart; x <= +xEnd; x += +step) {
      const i = (y * w + x) * 4;
      const luma = 0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2];
      vals.push(Math.round(luma));
    }
    rows.push({ y, vals });
  }
  return { w, h, rows };
}, { yStart, yEnd, xStart, xEnd, step });

console.log('image', result.w, 'x', result.h);
for (const r of result.rows) {
  console.log('y=' + r.y, r.vals.join(' '));
}
await browser.close();
