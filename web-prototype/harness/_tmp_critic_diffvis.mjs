// Render a diff-heatmap PNG: red where A and B differ, faint grey where they agree.
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const [, , aPath, bPath, outPath] = process.argv;
const urlA = pathToFileURL(path.resolve(aPath)).href;
const urlB = pathToFileURL(path.resolve(bPath)).href;
const htmlPath = path.join(os.tmpdir(), '_tmp_diffvis.html');
writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0;padding:0;">
  <img id="a" src="${urlA}"><img id="b" src="${urlB}">
</body></html>`);

const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => document.getElementById('a').complete && document.getElementById('b').complete);

const dataUrl = await page.evaluate(() => {
  const a = document.getElementById('a'), b = document.getElementById('b');
  const w = a.naturalWidth, h = a.naturalHeight;
  const cvA = document.createElement('canvas'); cvA.width = w; cvA.height = h;
  const cvB = document.createElement('canvas'); cvB.width = w; cvB.height = h;
  cvA.getContext('2d').drawImage(a, 0, 0);
  cvB.getContext('2d').drawImage(b, 0, 0);
  const dataA = cvA.getContext('2d').getImageData(0, 0, w, h).data;
  const dataB = cvB.getContext('2d').getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const octx = out.getContext('2d');
  const img = octx.createImageData(w, h);
  for (let i = 0; i < dataA.length; i += 4) {
    const dr = Math.abs(dataA[i] - dataB[i]);
    const dg = Math.abs(dataA[i+1] - dataB[i+1]);
    const db = Math.abs(dataA[i+2] - dataB[i+2]);
    const d = dr + dg + db;
    if (d > 15) {
      img.data[i] = 255; img.data[i+1] = 0; img.data[i+2] = 0; img.data[i+3] = 255;
    } else {
      // faint grey background from A so we can see body outline for reference
      const g = dataA[i];
      img.data[i] = g; img.data[i+1] = g; img.data[i+2] = g; img.data[i+3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out.toDataURL('image/png');
});

writeFileSync(path.resolve(outPath), Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log('wrote', outPath);
await browser.close();
