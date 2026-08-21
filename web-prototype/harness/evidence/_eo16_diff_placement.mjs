// estate-owner-16: confirm the vestibule gradient change is PLACED — differing pixels should
// sit inside the crop box and be near-zero outside it, per HANDOFF's captures-are-deterministic
// note (a real change should be measured, not eyeballed).
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const [, , aPath, bPath, cx, cy, cw, ch] = process.argv;
const X0 = +cx, Y0 = +cy, X1 = +cx + +cw, Y1 = +cy + +ch;

const urlA = pathToFileURL(path.resolve(aPath)).href;
const urlB = pathToFileURL(path.resolve(bPath)).href;
const htmlPath = path.join(os.tmpdir(), '_diff_placement.html');
writeFileSync(htmlPath, `<!doctype html><html><body style="margin:0;">
  <img id="a" src="${urlA}"><img id="b" src="${urlB}">
</body></html>`);

const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForFunction(() => document.getElementById('a').complete && document.getElementById('b').complete);

const r = await page.evaluate(({ X0, Y0, X1, Y1 }) => {
  const a = document.getElementById('a'), b = document.getElementById('b');
  const W = a.naturalWidth, H = a.naturalHeight;
  const ca = document.createElement('canvas'); ca.width = W; ca.height = H;
  const cb = document.createElement('canvas'); cb.width = W; cb.height = H;
  ca.getContext('2d').drawImage(a, 0, 0);
  cb.getContext('2d').drawImage(b, 0, 0);
  const da = ca.getContext('2d').getImageData(0, 0, W, H).data;
  const db = cb.getContext('2d').getImageData(0, 0, W, H).data;
  let insideDiff = 0, insideN = 0, outsideDiff = 0, outsideN = 0, maxOutside = 0;
  let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
  const GRID = 96;
  const grid = new Map();
  for (let y = 0; y < H; y++) {
    const inside = y >= Y0 && y < Y1;
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const dr = Math.abs(da[o] - db[o]), dg = Math.abs(da[o + 1] - db[o + 1]), db2 = Math.abs(da[o + 2] - db[o + 2]);
      const d = Math.max(dr, dg, db2);
      const isIn = inside && x >= X0 && x < X1;
      if (isIn) { insideN++; if (d > 0) insideDiff++; }
      else {
        outsideN++;
        if (d > 0) outsideDiff++;
        if (d > 3) { // ignore single-count dither noise for the bbox
          if (x < bx0) bx0 = x; if (y < by0) by0 = y;
          if (x > bx1) bx1 = x; if (y > by1) by1 = y;
          const gk = Math.floor(x / GRID) + ',' + Math.floor(y / GRID);
          grid.set(gk, (grid.get(gk) || 0) + 1);
        }
        if (d > maxOutside) maxOutside = d;
      }
    }
  }
  const gridArr = [...grid.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
    .map(([k, n]) => { const [gx, gy] = k.split(',').map(Number); return { x0: gx * GRID, y0: gy * GRID, n }; });
  return { W, H, insideDiff, insideN, outsideDiff, outsideN, maxOutside, bbox: [bx0, by0, bx1, by1], gridArr };
}, { X0, Y0, X1, Y1 });

console.log(`frame ${r.W}x${r.H}`);
console.log(`inside crop  [${X0},${Y0},${X1},${Y1}]: ${r.insideDiff}/${r.insideN} differing (${(100 * r.insideDiff / r.insideN).toFixed(1)}%)`);
console.log(`outside crop: ${r.outsideDiff}/${r.outsideN} differing (${(100 * r.outsideDiff / r.outsideN).toFixed(3)}%), max delta ${r.maxOutside}`);
console.log(`outside bbox (delta>3): [${r.bbox.join(',')}]`);
console.log('top outside-crop cells by diff count (96px grid):');
for (const c of r.gridArr) console.log(`  (${c.x0},${c.y0})-(${c.x0 + 96},${c.y0 + 96}): ${c.n}`);
await browser.close();
