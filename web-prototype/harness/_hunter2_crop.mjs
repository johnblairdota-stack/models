// Critic scratch tool: crop an image by pixel or fractional coords, reporting natural size.
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

// usage: node _hunter2_crop.mjs <srcPath> <outPath> [fx,fy,fw,fh (0-1 fractions)]
const [,, srcPath, outPath, fracStr] = process.argv;

const url = pathToFileURL(path.resolve(srcPath)).href;
const htmlPath = path.join(path.dirname(outPath), '_hunter2_crop_tmp.html');
writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0;padding:0;background:#fff;">
  <img id="im" src="${url}" style="display:block;position:absolute;left:0;top:0;">
</body></html>`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2000, height: 1400 } });
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => document.getElementById('im').complete);
const nw = await page.evaluate(() => document.getElementById('im').naturalWidth);
const nh = await page.evaluate(() => document.getElementById('im').naturalHeight);
console.error('naturalSize', nw, nh, 'url', url);

if (fracStr) {
  const [fx, fy, fw, fh] = fracStr.split(',').map(Number);
  const x = Math.round(fx * nw), y = Math.round(fy * nh);
  const width = Math.round(fw * nw), height = Math.round(fh * nh);
  await page.setViewportSize({ width: Math.max(nw, x+width)+10, height: Math.max(nh, y+height)+10 });
  await page.screenshot({ path: outPath, clip: { x, y, width, height } });
  console.error('wrote', outPath, {x,y,width,height});
} else {
  await page.screenshot({ path: outPath, clip: { x:0, y:0, width: nw, height: nh } });
  console.error('wrote full', outPath);
}
await browser.close();
