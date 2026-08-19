// Desaturate a PNG using Playwright + canvas, for a colour-independence check.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const [,, inPath, outPath, mode] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: node desat.mjs <in.png> <out.png> [gray|dark]');
  process.exit(1);
}

const buf = readFileSync(resolve(inPath));
const b64 = buf.toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<html><body style="margin:0"><img id="im" src="data:image/png;base64,${b64}"/><canvas id="c"></canvas></body></html>`);
await page.waitForFunction(() => document.getElementById('im').complete);

const dataUrl = await page.evaluate((mode) => {
  const img = document.getElementById('im');
  const c = document.getElementById('c');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
    let v = lum;
    if (mode === 'dark') v = lum * 0.35; // simulate a dark/dim frame, desaturated too
    d[i] = d[i+1] = d[i+2] = v;
  }
  g.putImageData(id, 0, 0);
  return c.toDataURL('image/png');
}, mode || 'gray');

const outBuf = Buffer.from(dataUrl.split(',')[1], 'base64');
writeFileSync(resolve(outPath), outBuf);
await browser.close();
console.log('wrote', outPath);
