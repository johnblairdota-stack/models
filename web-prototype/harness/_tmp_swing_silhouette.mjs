// THROWAWAY — critic-swing-1. Threshold the swing strobe frames to a binary mask so the
// figure's SHAPE can be judged independent of texture/colour cues (the rrr-critique
// "silhouette test"). Luminance > THRESH -> white figure, else black.
//
//   node harness/_tmp_swing_silhouette.mjs <thresh 0-255>
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const DIR = path.join(ROOT, 'progress/playtest');
const OUTDIR = path.join(ROOT, 'progress/playtest');
const THRESH = +(process.argv[2] ?? 150);
const INVERT = process.argv[3] === 'invert';

const files = readdirSync(DIR).filter((f) => /^game\.play\.strobe-\d\d(-rest)?\.png$/.test(f)).sort();
console.log(`${files.length} frames, threshold ${THRESH}${INVERT ? ' (inverted)' : ''}`);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body style="margin:0"><img id="im"/><canvas id="c"></canvas></body></html>');

for (const f of files) {
  const buf = readFileSync(path.join(DIR, f));
  const b64 = buf.toString('base64');
  await page.evaluate((src) => {
    const img = document.getElementById('im');
    return new Promise((res) => { img.onload = res; img.src = src; });
  }, `data:image/png;base64,${b64}`);
  const dataUrl = await page.evaluate(({ thresh, invert }) => {
    const img = document.getElementById('im');
    const c = document.getElementById('c');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const id = g.getImageData(0, 0, c.width, c.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      let bright = lum > thresh;
      if (invert) bright = !bright;
      const v = bright ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    g.putImageData(id, 0, 0);
    return c.toDataURL('image/png');
  }, { thresh: THRESH, invert: INVERT });
  const outName = f.replace('strobe-', 'sil-');
  const outBuf = Buffer.from(dataUrl.split(',')[1], 'base64');
  writeFileSync(path.join(OUTDIR, outName), outBuf);
}
await browser.close();
console.log('done ->', OUTDIR, '(sil-*.png)');
