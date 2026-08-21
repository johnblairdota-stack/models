/**
 * Crop a set of frames to ONE SHARED box around the ink, and upscale.
 *
 * WHY SHARED. These tiles are a controlled comparison — same camera, same phase, only the grip
 * roll differs. Cropping each to its own bounding box would rescale each figure independently and
 * silently destroy the only thing the comparison is for. The box is the UNION of every image's
 * ink extent, so every tile is the same window on the same world.
 *
 * The chosen box is PRINTED, because a claim made from a crop has to name its crop.
 *
 *   node harness/evidence/_crit_swingface_crop.mjs --out sheet.png --scale 3 --img a.png --img b.png ...
 *   --ink <L>   luminance below which a pixel counts as figure (default 100)
 *   --pad <px>  padding around the union box (default 12)
 *   --dark      the figure is LIGHT on a dark ground (normal render), so invert the ink test
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { toDataURL, openCanvasPage, ROOT, resolveImg } from '../imglib.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const all = (n) => argv.reduce((a, v, i) => (v === '--' + n && argv[i + 1] ? [...a, argv[i + 1]] : a), []);
const flag = (n) => argv.includes('--' + n);

const imgs = all('img').map(resolveImg);
if (imgs.length < 1) { console.error('need --img'); process.exit(2); }
const outFile = resolveImg(opt('out', 'progress/crop.png'));
const scale = +opt('scale', 3);
const pad = +opt('pad', 12);
const inkL = +opt('ink', 100);
const dark = flag('dark');

const { browser, page } = await openCanvasPage();
const urls = [];
for (const f of imgs) urls.push(await toDataURL(f));

const res = await page.evaluate(async ({ urls, inkL, pad, dark, scale }) => {
  const load = (src) => new Promise((r, j) => { const im = new Image(); im.onload = () => r(im); im.onerror = () => j(new Error('decode')); im.src = src; });
  const ims = [];
  for (const u of urls) ims.push(await load(u));
  const W = ims[0].width, H = ims[0].height;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true });
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  const per = [];
  for (const im of ims) {
    g.clearRect(0, 0, W, H); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    let a = W, b = H, cc = 0, dd = 0, n = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const isInk = dark ? L > inkL : L < inkL;
      if (!isInk) continue;
      n++;
      if (x < a) a = x; if (x > cc) cc = x; if (y < b) b = y; if (y > dd) dd = y;
    }
    per.push({ n, box: [a, b, cc, dd] });
    if (n) { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, cc); y1 = Math.max(y1, dd); }
  }
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const out = [];
  for (const im of ims) {
    const o = document.createElement('canvas');
    o.width = Math.round(bw * scale); o.height = Math.round(bh * scale);
    const og = o.getContext('2d');
    og.imageSmoothingEnabled = false;
    og.drawImage(im, x0, y0, bw, bh, 0, 0, o.width, o.height);
    out.push(o.toDataURL('image/png'));
  }
  return { box: [x0, y0, bw, bh], src: [W, H], per, out };
}, { urls, inkL, pad, dark, scale });

await browser.close();

const dir = path.dirname(outFile);
const names = [];
for (let i = 0; i < res.out.length; i++) {
  const f = path.join(dir, path.basename(outFile, '.png') + '.' + path.basename(imgs[i]));
  await writeFile(f, Buffer.from(res.out[i].split(',')[1], 'base64'));
  names.push(f);
}
console.log(`source ${res.src[0]}x${res.src[1]}`);
console.log(`SHARED CROP  x=${res.box[0]} y=${res.box[1]} w=${res.box[2]} h=${res.box[3]}  (upscaled x${scale})`);
res.per.forEach((p, i) => console.log(`  ${path.basename(imgs[i])}  ink px ${p.n}  own box ${p.box.join(',')}`));
console.log(names.map((n) => path.relative(ROOT, n)).join('\n'));
