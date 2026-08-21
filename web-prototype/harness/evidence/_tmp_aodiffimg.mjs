// Amplified signed difference image + the hottest blocks, for judging an AO change.
// Green = B darker than A (more occlusion), magenta = B lighter (less occlusion).
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const [, , aPath, bPath, outPath, gainArg] = process.argv;
const gain = +(gainArg ?? 12);
const htmlPath = path.join(os.tmpdir(), '_tmp_aodiffimg.html');
writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0">
  <img id="a" src="${pathToFileURL(path.resolve(aPath)).href}">
  <img id="b" src="${pathToFileURL(path.resolve(bPath)).href}"></body></html>`);

const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
const page = await browser.newPage({ viewport: { width: 100, height: 100 } });
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => document.getElementById('a').complete && document.getElementById('b').complete);

const out = await page.evaluate((gain) => {
  const luma = (d, j) => 0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2];
  const read = (id) => {
    const im = document.getElementById(id);
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    c.getContext('2d').drawImage(im, 0, 0);
    return { ctx: c.getContext('2d'), w: c.width, h: c.height };
  };
  const A = read('a'), B = read('b');
  const da = A.ctx.getImageData(0, 0, A.w, A.h).data;
  const db = B.ctx.getImageData(0, 0, B.w, B.h).data;
  const cv = document.createElement('canvas'); cv.width = A.w; cv.height = A.h;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(A.w, A.h);
  const BS = 120, bx = Math.ceil(A.w / BS), by = Math.ceil(A.h / BS);
  const blocks = new Float64Array(bx * by);
  for (let y = 0; y < A.h; y++) {
    for (let x = 0; x < A.w; x++) {
      const j = (y * A.w + x) * 4;
      const d = luma(db, j) - luma(da, j);          // negative = B darker = more AO
      blocks[Math.floor(y / BS) * bx + Math.floor(x / BS)] += d;
      const v = Math.min(255, Math.abs(d) * gain);
      if (d < 0) { img.data[j] = 0; img.data[j + 1] = v; img.data[j + 2] = 0; }
      else { img.data[j] = v; img.data[j + 1] = 0; img.data[j + 2] = v; }
      img.data[j + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const hot = [...blocks].map((v, i) => ({ v: v / (BS * BS), x: (i % bx) * BS, y: Math.floor(i / bx) * BS }))
    .sort((p, q) => Math.abs(q.v) - Math.abs(p.v)).slice(0, 5);
  return { png: cv.toDataURL('image/png'), hot, w: A.w, h: A.h };
}, gain);

writeFileSync(outPath, Buffer.from(out.png.split(',')[1], 'base64'));
console.log(`wrote ${outPath}  (green = new build DARKER / more AO, magenta = lighter, gain x${gain})`);
console.log('hottest 120px blocks (mean signed luma delta):');
for (const h of out.hot) console.log(`   x${String(h.x).padStart(4)} y${String(h.y).padStart(4)}  ${h.v.toFixed(2)}`);
await browser.close();
