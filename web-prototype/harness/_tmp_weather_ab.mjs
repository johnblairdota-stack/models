// Side-by-side before/after crop, upscaled and labelled. One image read per comparison.
// Usage: node ab.mjs <before.png> <after.png> <x> <y> <w> <h> <out.png> [scale=3] [label]
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const [, , aPath, bPath, xs, ys, ws, hs, outPath, scaleS, label] = process.argv;
const x = +xs, y = +ys, w = +ws, h = +hs, scale = +(scaleS || 3);
const aUrl = pathToFileURL(path.resolve(aPath)).href;
const bUrl = pathToFileURL(path.resolve(bPath)).href;
const cw = w * scale, ch = h * scale;

const html = `<!doctype html><html><body style="margin:0;background:#111;font:600 ${Math.round(13 * scale / 2)}px sans-serif;color:#fff">
<div style="display:flex;gap:${scale}px">
  <div>
    <div style="height:${18 * scale / 2}px;padding-left:4px">BEFORE${label ? ' — ' + label : ''}</div>
    <div style="width:${cw}px;height:${ch}px;overflow:hidden;position:relative">
      <img src="${aUrl}" style="position:absolute;left:${-x * scale}px;top:${-y * scale}px;width:${1920 * scale}px;image-rendering:pixelated">
    </div>
  </div>
  <div>
    <div style="height:${18 * scale / 2}px;padding-left:4px">AFTER</div>
    <div style="width:${cw}px;height:${ch}px;overflow:hidden;position:relative">
      <img src="${bUrl}" style="position:absolute;left:${-x * scale}px;top:${-y * scale}px;width:${1920 * scale}px;image-rendering:pixelated">
    </div>
  </div>
</div></body></html>`;

const htmlPath = path.join(os.tmpdir(), '_ab_' + Math.random().toString(36).slice(2) + '.html');
writeFileSync(htmlPath, html);
const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
const page = await browser.newPage({
  viewport: {
    width: Math.round(Math.min(cw * 2 + scale, 3800)),
    height: Math.round(Math.min(ch + 18 * scale / 2, 2400)),
  },
});
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => [...document.images].every((i) => i.complete));
await page.screenshot({ path: path.resolve(outPath) });
await browser.close();
console.log('wrote', outPath, `${w}x${h} @${scale}x`);
