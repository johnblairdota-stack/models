// Diff two local PNGs of identical size, report pixel-level difference stats.
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const [, , aPath, bPath] = process.argv;
const urlA = pathToFileURL(path.resolve(aPath)).href;
const urlB = pathToFileURL(path.resolve(bPath)).href;
const htmlPath = path.join(os.tmpdir(), '_tmp_diff.html');
writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0;padding:0;">
  <img id="a" src="${urlA}" style="display:block;">
  <img id="b" src="${urlB}" style="display:block;">
</body></html>`);

const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => document.getElementById('a').complete && document.getElementById('b').complete);

const result = await page.evaluate(() => {
  const a = document.getElementById('a');
  const b = document.getElementById('b');
  const w = a.naturalWidth, h = a.naturalHeight;
  const w2 = b.naturalWidth, h2 = b.naturalHeight;
  if (w !== w2 || h !== h2) return { error: `size mismatch ${w}x${h} vs ${w2}x${h2}` };
  const cvA = document.createElement('canvas'); cvA.width = w; cvA.height = h;
  const cvB = document.createElement('canvas'); cvB.width = w; cvB.height = h;
  const ctxA = cvA.getContext('2d'); ctxA.drawImage(a, 0, 0);
  const ctxB = cvB.getContext('2d'); ctxB.drawImage(b, 0, 0);
  const dataA = ctxA.getImageData(0, 0, w, h).data;
  const dataB = ctxB.getImageData(0, 0, w, h).data;
  let diffPixels = 0, sumAbsDiff = 0, maxDiff = 0;
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const dr = Math.abs(dataA[i] - dataB[i]);
      const dg = Math.abs(dataA[i+1] - dataB[i+1]);
      const db = Math.abs(dataA[i+2] - dataB[i+2]);
      const d = dr + dg + db;
      if (d > 10) {
        diffPixels++;
        sumAbsDiff += d;
        if (d > maxDiff) maxDiff = d;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { w, h, diffPixels, totalPixels: w*h, pct: (100*diffPixels/(w*h)).toFixed(3), sumAbsDiff, maxDiff, bbox: diffPixels ? [minX,minY,maxX,maxY] : null };
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
