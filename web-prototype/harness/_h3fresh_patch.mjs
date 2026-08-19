// Sample mean RGB/luma over hand-placed fractional rects. usage: node patch.mjs <img> "name:fx,fy,fw,fh" ...
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync, unlinkSync } from 'node:fs';

const [, , src, ...rects] = process.argv;
const abs = path.resolve(src);
const url = pathToFileURL(abs).href;
const htmlPath = path.join(path.dirname(abs), '_h3fresh_patch_tmp.html');
writeFileSync(htmlPath, `<!doctype html><html><body><img id="im" src="${url}"></body></html>`);
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => { const i = document.getElementById('im'); return i.complete && i.naturalWidth > 0; });

const out = await page.evaluate((rectDefs) => {
  const im = document.getElementById('im');
  const W = im.naturalWidth, H = im.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(im, 0, 0);
  const res = { size: [W, H], rows: [] };
  for (const def of rectDefs) {
    const [name, nums] = def.split(':');
    const [fx, fy, fw, fh] = nums.split(',').map(Number);
    const x = Math.round(fx * W), y = Math.round(fy * H);
    const w = Math.max(1, Math.round(fw * W)), h = Math.max(1, Math.round(fh * H));
    const d = ctx.getImageData(x, y, w, h).data;
    let r = 0, g = 0, b = 0, n = 0;
    const lumas = [];
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      lumas.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
    }
    lumas.sort((p, q) => p - q);
    const q = (f) => Math.round(lumas[Math.min(lumas.length - 1, Math.floor(f * lumas.length))]);
    res.rows.push({
      name, px: [x, y, w, h], n,
      mean: [Math.round(r / n), Math.round(g / n), Math.round(b / n)],
      luma: Math.round((0.2126 * r + 0.7152 * g + 0.0722 * b) / n),
      p05: q(0.05), p50: q(0.5), p95: q(0.95), spread: q(0.95) - q(0.05),
    });
  }
  return res;
}, rects);

console.log(src, 'natural', out.size.join('x'));
for (const r of out.rows) {
  console.log(`  ${r.name.padEnd(14)} rgb(${r.mean.join(',').padEnd(12)}) luma ${String(r.luma).padStart(3)}  p05 ${String(r.p05).padStart(3)} p50 ${String(r.p50).padStart(3)} p95 ${String(r.p95).padStart(3)}  spread ${String(r.spread).padStart(3)}  px[${r.px.join(',')}]`);
}
await browser.close();
try { unlinkSync(htmlPath); } catch {}
