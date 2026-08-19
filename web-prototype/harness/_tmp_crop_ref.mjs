// Throwaway crop utility for inspecting a static reference image. Critic scratch tool, not app code.
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

const [,, srcPath, cropStr, outPath] = process.argv;
const [x, y, w, h] = cropStr.split(',').map(Number);

const url = pathToFileURL(path.resolve(srcPath)).href;
const htmlPath = path.join(path.dirname(outPath), '_tmp_crop_ref.html');
writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0;padding:0;background:#fff;">
  <img id="im" src="${url}" style="display:block;position:absolute;left:0;top:0;">
</body></html>`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2000, height: 1400 } });
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => document.getElementById('im').complete);
const nw = await page.evaluate(() => document.getElementById('im').naturalWidth);
console.log('naturalWidth', nw, 'url', url);
await page.screenshot({ path: outPath, clip: { x, y, width: w, height: h } });
await browser.close();
console.log('wrote', outPath);
