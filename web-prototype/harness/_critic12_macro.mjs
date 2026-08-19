// critic-estate-12 scratch tool: whole-frame (and rect) macro-variation metric on ANY local image
// (PNG or WebP-as-.png, browser sniffs content), independent verification of estate-owner-14's
// claimed 0.8815 -> 0.9968/0.9632/0.9411/0.9199 vs art 0.7796.
// macro = std(32x32 block means) / mean(32x32 block means), luminance = Rec.709.
//
// Usage: node harness/_critic12_macro.mjs <imgPath> [--rect x,y,w,h] [--label name]
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const argv = process.argv.slice(2);
const imgPath = argv[0];
const opt = (n, d = null) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const label = opt('label', imgPath);
const rectArg = opt('rect', null);

const url = pathToFileURL(path.resolve(imgPath)).href;
const htmlPath = path.join(os.tmpdir(), '_critic12_macro.html');
writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0;padding:0;">
  <img id="im" src="${url}" style="display:block;">
</body></html>`);

const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => document.getElementById('im').complete && document.getElementById('im').naturalWidth > 0, null, { timeout: 15000 });

const result = await page.evaluate(({ rectArg }) => {
  const img = document.getElementById('im');
  const W = img.naturalWidth, H = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  let rx = 0, ry = 0, rw = W, rh = H;
  if (rectArg) { const p = rectArg.split(',').map(Number); [rx, ry, rw, rh] = p; }
  const data = ctx.getImageData(rx, ry, rw, rh).data;
  const L = new Float64Array(rw * rh);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    L[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }
  const blocks = [];
  for (let by = 0; by + 32 <= rh; by += 32) {
    for (let bx = 0; bx + 32 <= rw; bx += 32) {
      let s = 0;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) s += L[(by + y) * rw + bx + x];
      blocks.push(s / 1024);
    }
  }
  const mean = (a) => { let s = 0; for (const v of a) s += v; return s / a.length; };
  const std = (a) => { const m = mean(a); let s = 0; for (const v of a) s += (v - m) * (v - m); return Math.sqrt(s / a.length); };
  const bm = mean(blocks), bs = std(blocks);
  return { W, H, rx, ry, rw, rh, nblocks: blocks.length, blockMean: +bm.toFixed(3), blockStd: +bs.toFixed(3), macro: +(bs / Math.max(1, bm)).toFixed(4) };
}, { rectArg });

console.log(label, JSON.stringify(result));
await browser.close();
