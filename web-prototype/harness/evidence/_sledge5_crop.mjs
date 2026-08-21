/**
 * Crop every silhouette tile of the three arc arms to ONE common box around the figure, then
 * tile them into a phase-matched comparison sheet (rows = arm, columns = phase).
 * The box is computed from the union of the INK bounding boxes, restricted to the left 55% of
 * frame where the figure stands, so the black wall slab on the right cannot drag it out.
 */
import { openCanvasPage, toDataURL } from '../imglib.mjs';
import path from 'node:path';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = 'C:/Users/John/Documents/Run Robot Run/web-prototype';
const AB = path.join(ROOT, 'progress/strobe/arc-ab');
const OUT = path.join(AB, '_ab');
mkdirSync(OUT, { recursive: true });

const ARMS = process.argv[2] ? process.argv[2].split(',') : ['sledge-a100', 'sledge-b079', 'sledge-c054'];
const KIND = process.argv[3] ?? 'sil';          // 'sil' or 'lit'
const PAD = +(process.argv[4] ?? 40);

const files = {};
for (const a of ARMS) {
  const dir = path.join(AB, `${a}.uniform`);
  const all = readdirSync(dir).filter((f) => f.endsWith('.png'));
  files[a] = all.filter((f) => (KIND === 'sil' ? f.startsWith('sil-') : !f.startsWith('sil-')))
    .sort().map((f) => path.join(dir, f));
}

const { browser, page } = await openCanvasPage();

async function inkBox(file) {
  return page.evaluate(async (url) => {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, im.width, im.height).data;
    const xlim = Math.floor(im.width * 0.55);
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < im.height; y++) {
      for (let x = 0; x < xlim; x++) {
        const i = (y * im.width + x) * 4;
        const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        if (L < 60) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    return { w: im.width, h: im.height, x0, y0, x1, y1 };
  }, await toDataURL(file));
}

// The wall slab starts around x ~0.45W in some frames; keep the scan to the figure by also
// dropping any column run that reaches the very top of frame (the slab does, the robot does not).
let X0 = 1e9, Y0 = 1e9, X1 = -1, Y1 = -1, W = 0, H = 0;
for (const a of ARMS) {
  for (const f of files[a]) {
    const b = await inkBox(f);
    W = b.w; H = b.h;
    if (b.x1 < 0) continue;
    X0 = Math.min(X0, b.x0); Y0 = Math.min(Y0, b.y0); X1 = Math.max(X1, b.x1); Y1 = Math.max(Y1, b.y1);
  }
}
console.log('union ink box', { X0, Y0, X1, Y1, W, H });

let cx = Math.max(0, X0 - PAD), cy = Math.max(0, Y0 - PAD);
let cw = Math.min(W - cx, X1 - X0 + PAD * 2), ch = Math.min(H - cy, Y1 - Y0 + PAD * 2);
console.log('crop', { cx, cy, cw, ch });

const outFiles = [];
for (const a of ARMS) {
  for (const f of files[a]) {
    const dst = path.join(OUT, `${a}__${path.basename(f)}`);
    const dataUrl = await page.evaluate(async ({ url, cx, cy, cw, ch }) => {
      const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      c.getContext('2d').drawImage(im, cx, cy, cw, ch, 0, 0, cw, ch);
      return c.toDataURL('image/png');
    }, { url: await toDataURL(f), cx, cy, cw, ch });
    writeFileSync(dst, Buffer.from(dataUrl.split(',')[1], 'base64'));
    outFiles.push(dst);
  }
}
await browser.close();

const cols = files[ARMS[0]].length;
const sheet = path.join(AB, `_sheets/AB-${KIND}-${ARMS.length}arm.png`);
const args = [path.join(ROOT, 'harness/sheet.mjs'), '--out', sheet, '--cols', String(cols), '--width', '2000'];
for (const f of outFiles) args.push('--img', f);
const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
console.log(r.stdout || r.stderr);
console.log('sheet ->', sheet, ' cols', cols, ' rows', ARMS.length);
