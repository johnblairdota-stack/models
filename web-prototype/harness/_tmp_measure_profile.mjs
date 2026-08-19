// Critic scratch tool: measure ear-disc vs visor extents in a profile head crop.
// Usage: node _tmp_measure_profile.mjs <imgPath> <label>
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const [,, srcPath, label] = process.argv;
const url = pathToFileURL(path.resolve(srcPath)).href;
const htmlPath = path.join(os.tmpdir(), '_tmp_measure_profile.html');
writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0;padding:0;">
  <img id="im" src="${url}" style="display:block;">
</body></html>`);

const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => document.getElementById('im').complete);

const result = await page.evaluate(() => {
  const img = document.getElementById('im');
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, cv.width, cv.height);
  const px = (x, y) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i+1], data[i+2], data[i+3]];
  };
  const corners = [px(1,1), px(width-2,1), px(1,height-2), px(width-2,height-2)];
  const bg = corners[0];
  const lumAt = (x,y) => { const [r,g,b] = px(x,y); return (r+g+b)/3; };

  // Per-row local background estimate (studio cyc is a gradient, not flat) — average
  // the outer N px on each side of the row, same method measure.mjs uses.
  const MARGIN = Math.max(2, Math.floor(width * 0.03));
  const rowBg = new Array(height);
  for (let y=0;y<height;y++){
    let sum=0, n=0;
    for (let x=0;x<MARGIN;x++){ sum+=lumAt(x,y); n++; }
    for (let x=width-MARGIN;x<width;x++){ sum+=lumAt(x,y); n++; }
    rowBg[y] = sum/n;
  }

  const mask = new Uint8Array(width*height);
  let xmin=width, xmax=0, ymin=height, ymax=0;
  for (let y=0;y<height;y++){
    for (let x=0;x<width;x++){
      const l = lumAt(x,y);
      const [r,g,b,a] = px(x,y);
      const isFg = a > 10 && (Math.abs(l - rowBg[y]) > 7 || (b - r) > 15);
      if (isFg) {
        mask[y*width+x] = 1;
        if (x<xmin) xmin=x; if (x>xmax) xmax=x;
        if (y<ymin) ymin=y; if (y>ymax) ymax=y;
      }
    }
  }
  const headLen = xmax - xmin + 1;
  const headHt = ymax - ymin + 1;

  let vxmin=width, vxmax=0, vymin=height, vymax=0, blueCount=0;
  const blueMask = new Uint8Array(width*height);
  for (let y=ymin;y<=ymax;y++){
    for (let x=xmin;x<=xmax;x++){
      const [r,g,b] = px(x,y);
      if (mask[y*width+x] && (b - r) > 18 && b > 90) {
        blueMask[y*width+x] = 1;
        blueCount++;
        if (x<vxmin) vxmin=x; if (x>vxmax) vxmax=x;
        if (y<vymin) vymin=y; if (y>vymax) vymax=y;
      }
    }
  }

  const lums = [];
  for (let y=ymin;y<=ymax;y++) for (let x=xmin;x<=xmax;x++){
    if (mask[y*width+x] && !blueMask[y*width+x]) lums.push(lumAt(x,y));
  }
  lums.sort((a,b)=>a-b);
  const shellMedian = lums[Math.floor(lums.length/2)];

  let dxmin=width, dxmax=0, dymin=height, dymax=0, darkCount=0;
  for (let y=ymin;y<=ymax;y++){
    for (let x=xmin;x<=xmax;x++){
      if (!mask[y*width+x] || blueMask[y*width+x]) continue;
      const l = lumAt(x,y);
      if (l < shellMedian - 20) {
        darkCount++;
        if (x<dxmin) dxmin=x; if (x>dxmax) dxmax=x;
        if (y<dymin) dymin=y; if (y>dymax) dymax=y;
      }
    }
  }

  return {
    width, height, bg, shellMedian,
    headBBox: [xmin, ymin, xmax, ymax], headLen, headHt,
    visorBBox: [vxmin, vymin, vxmax, vymax],
    visorLenFrac: (vxmax - vxmin + 1) / headLen,
    visorHtFrac: (vymax - vymin + 1) / headHt,
    visorCenterFromLeftFrac: ((vxmin+vxmax)/2 - xmin) / headLen,
    blueCount,
    darkAccentBBox: [dxmin, dymin, dxmax, dymax],
    darkCount,
    darkLenFrac: darkCount>0 ? (dxmax - dxmin + 1) / headLen : null,
    darkHtFrac: darkCount>0 ? (dymax - dymin + 1) / headHt : null,
    darkCenterFromLeftFrac: darkCount>0 ? ((dxmin+dxmax)/2 - xmin) / headLen : null,
  };
});

console.log(label, JSON.stringify(result, null, 2));
await browser.close();
