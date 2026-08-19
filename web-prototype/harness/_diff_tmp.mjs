// Scratch: pixel difference between two renders, for blast-radius checks. Not app code.
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , aPath, bPath] = process.argv;
// CACHE BUST. Chromium caches file:// images by URL, and every render writes back to the
// SAME path, so without this the second and every later comparison of a given file silently
// re-uses the first decode. It does not error — it returns a stale, plausible number, and
// three separate measurements came back identical to the last digit before that showed up.
const bust = `?t=${Date.now()}-${Math.random()}`;
const A = pathToFileURL(path.resolve(aPath)).href + bust;
const B = pathToFileURL(path.resolve(bPath)).href + bust + 'b';

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 300, height: 200 } });
await page.goto(A.replace(/[^/]+$/, ''));
const r = await page.evaluate(async ({ A, B }) => {
  const load = async (u) => { const im = new Image(); im.src = u; await im.decode(); return im; };
  const [a, b] = await Promise.all([load(A), load(B)]);
  if (a.naturalWidth !== b.naturalWidth || a.naturalHeight !== b.naturalHeight) return { err: 'size mismatch' };
  const c = document.createElement('canvas');
  c.width = a.naturalWidth; c.height = a.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(a, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
  g.clearRect(0, 0, c.width, c.height);
  g.drawImage(b, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
  let sum = 0, max = 0, n = 0, over2 = 0, over8 = 0, over32 = 0;
  let bx0 = 1e9, by0 = 1e9, bx1 = -1, by1 = -1;
  for (let i = 0, p = 0; i < da.length; i += 4, p++) {
    const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
    sum += d; n++;
    if (d > max) max = d;
    if (d > 2) over2++;
    if (d > 8) {
      over8++;
      const x = p % c.width, y = (p / c.width) | 0;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
      if (y < by0) by0 = y; if (y > by1) by1 = y;
    }
    if (d > 32) over32++;
  }
  return { w: c.width, h: c.height, mean: sum / n, max, over2, over8, over32, n, box: [bx0, by0, bx1, by1] };
}, { A, B });
console.log(path.basename(aPath), 'vs', path.basename(bPath));
if (r.err) console.log(' ', r.err);
else console.log(`  mean|d| ${r.mean.toFixed(3)}  max ${r.max}  px>2 ${r.over2} (${(100 * r.over2 / r.n).toFixed(2)}%)` +
  `  px>8 ${r.over8} (${(100 * r.over8 / r.n).toFixed(2)}%)  px>32 ${r.over32}` +
  (r.over8 ? `  bbox>8 ${r.box.join(',')}` : ''));
await browser.close();
