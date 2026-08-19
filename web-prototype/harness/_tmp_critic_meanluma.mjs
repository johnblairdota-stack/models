// Independent check: signed mean luma delta + differing-pixel count between two PNGs.
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const [, , aPath, bPath] = process.argv;
const htmlPath = path.join(os.tmpdir(), '_tmp_meanluma.html');
writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0">
  <img id="a" src="${pathToFileURL(path.resolve(aPath)).href}">
  <img id="b" src="${pathToFileURL(path.resolve(bPath)).href}"></body></html>`);

const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => document.getElementById('a').complete && document.getElementById('b').complete);

const out = await page.evaluate(() => {
  const luma = (d, j) => 0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2];
  const read = (id) => {
    const im = document.getElementById(id);
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    c.getContext('2d').drawImage(im, 0, 0);
    return c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  };
  const da = read('a'), db = read('b');
  let sum = 0, sumAbs = 0, n = da.length / 4, diffPix = 0, meanA = 0;
  for (let j = 0; j < da.length; j += 4) {
    const la = luma(da, j), lb = luma(db, j);
    const d = lb - la;
    sum += d; sumAbs += Math.abs(d); meanA += la;
    if (Math.abs(d) > 0.5) diffPix++;
  }
  return { signedMean: sum / n, absMean: sumAbs / n, diffPix, n, meanA: meanA / n };
});
console.log(`${path.basename(aPath)} vs ${path.basename(bPath)}`);
console.log(`  signed mean luma delta (b-a): ${out.signedMean.toFixed(4)}   absMean: ${out.absMean.toFixed(4)}`);
console.log(`  meanA luma: ${out.meanA.toFixed(2)}   pct: ${(100*out.signedMean/out.meanA).toFixed(2)}%`);
console.log(`  differing pixels (>0.5 luma): ${out.diffPix} of ${out.n} (${(100*out.diffPix/out.n).toFixed(3)}%)`);
await browser.close();
