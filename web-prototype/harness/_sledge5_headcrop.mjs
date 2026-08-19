/**
 * Crop the six head-bulk frames (new vs old head, three beats) to one common box and tile them
 * new-above-old so the mass difference is judged in the silhouette, as critic-swing-2 asked.
 */
import { openCanvasPage, toDataURL } from './imglib.mjs';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const DIR = path.join(ROOT, 'progress/strobe/arc-ab/head-bulk');
const OUT = path.join(DIR, '_crop');
mkdirSync(OUT, { recursive: true });

const BEATS = ['rest', 'cock', 'contact'];
const ORDER = [];
for (const t of ['new', 'old']) for (const b of BEATS) ORDER.push(path.join(DIR, `${b}-${t}.png`));

const { browser, page } = await openCanvasPage();
const box = async (file) => page.evaluate(async (url) => {
  const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, im.width, im.height).data;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, ink = 0;
  for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) {
    const i = (y * im.width + x) * 4;
    const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    if (L < 60) { ink++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { w: im.width, h: im.height, x0, y0, x1, y1, ink };
}, await toDataURL(file));

let X0 = 1e9, Y0 = 1e9, X1 = -1, Y1 = -1, W = 0, H = 0;
const inks = {};
for (const f of ORDER) {
  const b = await box(f);
  W = b.w; H = b.h;
  inks[path.basename(f)] = b.ink;
  X0 = Math.min(X0, b.x0); Y0 = Math.min(Y0, b.y0); X1 = Math.max(X1, b.x1); Y1 = Math.max(Y1, b.y1);
}
const PAD = 25;
const cx = Math.max(0, X0 - PAD), cy = Math.max(0, Y0 - PAD);
const cw = Math.min(W - cx, X1 - X0 + PAD * 2), ch = Math.min(H - cy, Y1 - Y0 + PAD * 2);
console.log('crop', { cx, cy, cw, ch });
console.log('INK PIXELS (whole figure, 1280x720):');
for (const b of BEATS) {
  const n = inks[`${b}-new.png`], o = inks[`${b}-old.png`];
  console.log(`  ${b.padEnd(8)} new ${n}  old ${o}  delta ${n - o} (+${((n / o - 1) * 100).toFixed(2)}% of the WHOLE figure)`);
}

const outFiles = [];
for (const f of ORDER) {
  const dst = path.join(OUT, path.basename(f));
  const url = await toDataURL(f);
  const dataUrl = await page.evaluate(async ({ url, cx, cy, cw, ch }) => {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    c.getContext('2d').drawImage(im, cx, cy, cw, ch, 0, 0, cw, ch);
    return c.toDataURL('image/png');
  }, { url, cx, cy, cw, ch });
  writeFileSync(dst, Buffer.from(dataUrl.split(',')[1], 'base64'));
  outFiles.push(dst);
}
await browser.close();

const sheet = path.join(ROOT, 'progress/strobe/arc-ab/_sheets/AB-headbulk.png');
const args = [path.join(ROOT, 'harness/sheet.mjs'), '--out', sheet, '--cols', String(BEATS.length), '--width', '1700'];
for (const f of outFiles) args.push('--img', f);
const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
console.log((r.stdout || r.stderr).split('\n').slice(-3).join('\n'));
console.log('sheet ->', sheet, '(top row NEW head, bottom row OLD head)');
