import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const [,, srcPath, cropStr, outPath, scaleStr] = process.argv;
const [x, y, w, h] = cropStr.split(',').map(Number);
const scale = Number(scaleStr || 2);
const url = pathToFileURL(path.resolve(srcPath)).href;
const htmlPath = path.join(path.dirname(outPath), '_zoom.html');
writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0;padding:0;background:#fff;overflow:hidden">
  <img id="im" src="${url}" style="display:block;position:absolute;image-rendering:auto;transform-origin:0 0;transform:scale(${scale}) translate(${-x}px,${-y}px);">
</body></html>`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Math.round(w*scale), height: Math.round(h*scale) }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => document.getElementById('im').complete);
const nw = await page.evaluate(() => [document.getElementById('im').naturalWidth, document.getElementById('im').naturalHeight]);
console.log('natural', nw);
await page.screenshot({ path: outPath });
await browser.close();
console.log('wrote', outPath);
