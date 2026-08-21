// Measure the hip band: how many DARK pixels sit in the skirt/thigh junction, per arm.
// The band is the defect, so its area is the number. Read through Playwright's canvas, the same
// way the harness's other ad-hoc image tools do, since no image lib is installed.
//
// CONTROL: the same measurement is run on a patch of empty BACKDROP, which contains no figure and
// therefore must report ~0 dark pixels on every arm. If that column is nonzero the threshold is
// picking up the cyc gradient rather than the band, and the whole table is meaningless.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const files = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage();

const ROI = { x: 850, y: 505, w: 250, h: 165 };   // the hip crop
const CTRL = { x: 200, y: 505, w: 250, h: 165 };  // empty backdrop, same size

console.log('arm'.padEnd(10), 'darkPx'.padStart(8), 'darkPct'.padStart(9),
            'meanLuma'.padStart(9), '| CONTROL darkPx'.padStart(17));
for (const f of files) {
  const b64 = readFileSync(f).toString('base64');
  const r = await page.evaluate(async ({ b64, ROI, CTRL }) => {
    const img = new Image();
    await new Promise((res) => { img.onload = res; img.src = 'data:image/png;base64,' + b64; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    const g = c.getContext('2d');
    const meas = (R) => {
      const d = g.getImageData(R.x, R.y, R.w, R.h).data;
      let dark = 0, sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        sum += L; n++;
        if (L < 70) dark++;          // the band reads far below the shell's mid-tones
      }
      return { dark, pct: dark / n * 100, mean: sum / n };
    };
    return { roi: meas(ROI), ctrl: meas(CTRL) };
  }, { b64, ROI, CTRL });
  const name = f.split(/[\\/]/).pop().replace(/^t_|\.png$/g, '');
  console.log(name.padEnd(10), String(r.roi.dark).padStart(8),
              r.roi.pct.toFixed(2).padStart(9), r.roi.mean.toFixed(1).padStart(9),
              String(r.ctrl.dark).padStart(17));
}
await browser.close();
