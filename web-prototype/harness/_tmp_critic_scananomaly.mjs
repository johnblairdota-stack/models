// Scan a region of a PNG row-by-row and flag any pixel that deviates from its row's local
// smoothed trend by more than a threshold -- catches a faint ring/patch against a gradient.
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import { writeFileSync } from 'node:fs';

const [, , srcPath, yStart, yEnd, xStart, xEnd, thresh] = process.argv;
const url = pathToFileURL(path.resolve(srcPath)).href;
const htmlPath = path.join(os.tmpdir(), '_tmp_scananomaly.html');
writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0;padding:0;"><img id="im" src="${url}"></body></html>`);

const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => document.getElementById('im').complete);

const result = await page.evaluate(({ yStart, yEnd, xStart, xEnd, thresh }) => {
  const img = document.getElementById('im');
  const w = img.naturalWidth, h = img.naturalHeight;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;
  const anomalies = [];
  for (let y = +yStart; y <= +yEnd; y++) {
    const lumas = [];
    for (let x = +xStart; x <= +xEnd; x++) {
      const i = (y * w + x) * 4;
      lumas.push(0.299*data[i] + 0.587*data[i+1] + 0.114*data[i+2]);
    }
    // smooth with a wide moving average (window 41) as the local trend, flag deviation
    const win = 41, half = 20;
    for (let k = half; k < lumas.length - half; k++) {
      let sum = 0;
      for (let j = k - half; j <= k + half; j++) sum += lumas[j];
      const avg = sum / win;
      const dev = lumas[k] - avg;
      if (Math.abs(dev) > +thresh) {
        anomalies.push({ x: +xStart + k, y, luma: Math.round(lumas[k]), avg: Math.round(avg), dev: Math.round(dev) });
      }
    }
  }
  return { w, h, count: anomalies.length, sample: anomalies.slice(0, 80) };
}, { yStart, yEnd, xStart, xEnd, thresh });

console.log('image', result.w, 'x', result.h, 'anomalies found:', result.count);
for (const a of result.sample) console.log(a);
await browser.close();
