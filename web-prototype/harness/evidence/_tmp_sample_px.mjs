// Critic scratch tool: sample luminance at explicit points, and a small patch median,
// in an image. Usage: node _tmp_sample_px.mjs <imgPath> "x1,y1,label1" "x2,y2,label2" ...
// THE IMAGE IS INLINED AS A DATA URL RATHER THAN LOADED OVER file://.
//
// CORRECTION, RECORDED BECAUSE THE FIRST VERSION OF THIS COMMENT WAS WRONG. It claimed the
// file:// path was silently failing for sources outside the project root, on the evidence of
// a run where every one of eleven probes returned 5,7,10. It was not: that capture was
// GENUINELY an all-black frame — shoot.mjs had written an 8.5 kB PNG and reported `ok`, the
// hazard the handoff warns about — and the tool was reporting it correctly. The same values
// come back through a data URL. So this is a hardening, not a fix: `complete` is true for a
// failed load too, so the wait now also requires naturalWidth > 0, and a data URL cannot
// taint the canvas or trip over a path. The lesson is the one that nearly got inverted here
// — when an instrument and a capture disagree, check the capture's FILE SIZE first.
import { chromium } from 'playwright';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const [,, srcPath, ...pts] = process.argv;
const b64 = readFileSync(path.resolve(srcPath)).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(`<body style="margin:0"><img id="im" src="data:image/png;base64,${b64}"></body>`);
await page.waitForFunction(() => {
  const im = document.getElementById('im');
  return im.complete && im.naturalWidth > 0;
});

const parsed = pts.map(p => { const [x,y,label] = p.split(','); return { x: +x, y: +y, label }; });

const result = await page.evaluate((parsed) => {
  const img = document.getElementById('im');
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return parsed.map(({x,y,label}) => {
    // median of a 5x5 patch to avoid single-pixel noise/AA
    const R=[],G=[],B=[];
    for (let dy=-2; dy<=2; dy++) for (let dx=-2; dx<=2; dx++) {
      const d = ctx.getImageData(x+dx, y+dy, 1, 1).data;
      R.push(d[0]); G.push(d[1]); B.push(d[2]);
    }
    const med = arr => { const s=[...arr].sort((a,b)=>a-b); return s[Math.floor(s.length/2)]; };
    const r=med(R), g=med(G), b=med(B);
    return { label, x, y, r, g, b, lum: Math.round((r+g+b)/3) };
  });
}, parsed);

console.log(path.basename(srcPath), JSON.stringify(result, null, 2));
await browser.close();
