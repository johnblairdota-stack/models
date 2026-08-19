#!/usr/bin/env node
/**
 * Contact-sheet builder. Tiles many images into one labelled grid.
 *
 * This exists for one reason: looking at images is the dominant cost of this project.
 * An image costs roughly (width x height) / 750 tokens to read, so a 1920x1080 shot is
 * ~2800. A critic comparing five wall stages reads five of them — 14k tokens — when one
 * 5-up sheet conveys the same comparison for ~2800. And comparison is exactly what the
 * blind-identification gate needs, so this is the tool that makes the gate affordable.
 *
 *   node harness/sheet.mjs --dir refs/lath --out refs/_sheets/lath.png --cols 4
 *   node harness/sheet.mjs --glob "progress/shots/wall.*.png" --out progress/walls.png
 *   node harness/sheet.mjs --img a.png --img b.png --out progress/cmp.png --cols 2
 *
 * Flags
 *   --dir <path>     every image in a directory
 *   --glob <pat>     shell-style glob (only * supported, on the basename)
 *   --img <path>     explicit image, repeatable, order preserved
 *   --out <path>     output PNG (required)
 *   --cols <n>       columns (default: ceil(sqrt(n)))
 *   --width <px>     total sheet width (default 1600)
 *   --labels 0       turn off filename captions
 *   --crop <n>       take a centre crop of each source at n% before tiling (for detail)
 *   --bg <#hex>
 *
 * Composited in a headless browser canvas so there are no image-library dependencies.
 *
 * PATHS: relative paths resolve against the project root; absolute paths are honoured
 * verbatim. QUOTE Windows paths (or use forward slashes) — unquoted, a POSIX shell eats
 * the backslashes and the file silently lands in the repo root. See harness/paths.mjs.
 */

import { chromium } from 'playwright';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOutFile, resolveInPath, displayPath, PathArgError } from './paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d = null) => {
  const i = argv.indexOf('--' + n);
  if (i < 0) return d;
  const v = argv[i + 1];
  // A value-taking flag given no value is a mistake, not a request for the default.
  if (v === undefined || v.startsWith('--')) {
    console.error(`--${n} needs a value (got ${v === undefined ? 'end of arguments' : `the next flag, "${v}"`})`);
    process.exit(2);
  }
  return v;
};
// Every user-supplied path goes through paths.mjs, which refuses the drive-relative form
// an unquoted Windows path collapses into rather than resolving it into the repo root.
const guardPaths = (fn) => { try { return fn(); } catch (e) {
  if (!(e instanceof PathArgError)) throw e;
  console.error(e.message); process.exit(2);
} };
const optAll = (n) => {
  const o = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--' + n && argv[i + 1]) o.push(argv[i + 1]);
  return o;
};

const OUT = opt('out');
if (!OUT) { console.error('--out is required'); process.exit(2); }
// Validated before any work happens, not after the browser has composited the sheet.
const outPath = guardPaths(() => resolveOutFile('out', OUT, ROOT));
const WIDTH = +(opt('width', 1600));
const LABELS = opt('labels', '1') !== '0';
const CROP = opt('crop') ? +opt('crop') / 100 : 0;
const BG = opt('bg', '#0b0e13');

const IMG_RE = /\.(png|jpe?g|webp|gif|bmp)$/i;

let files = guardPaths(() => optAll('img').map((p) => resolveInPath('img', p, ROOT)));

if (opt('dir')) {
  const d = guardPaths(() => resolveInPath('dir', opt('dir'), ROOT));
  const names = (await readdir(d)).filter((n) => IMG_RE.test(n)).sort();
  files.push(...names.map((n) => path.join(d, n)));
}

if (opt('glob')) {
  const g = opt('glob');
  const dir = guardPaths(() => resolveInPath('glob', path.dirname(g), ROOT));
  const pat = new RegExp('^' + path.basename(g).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
  const names = (await readdir(dir)).filter((n) => IMG_RE.test(n) && pat.test(n)).sort();
  files.push(...names.map((n) => path.join(dir, n)));
}

files = files.filter((f) => {
  if (!existsSync(f)) { console.error('missing:', f); return false; }
  if (statSync(f).size < 200) return false;
  return true;
});

if (!files.length) { console.error('no images matched'); process.exit(2); }

const COLS = +(opt('cols', Math.ceil(Math.sqrt(files.length))));

// Load as data URLs — the browser page has no filesystem access.
const items = [];
for (const f of files) {
  const buf = await readFile(f);
  const ext = path.extname(f).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  items.push({
    label: path.basename(f),
    url: `data:image/${mime};base64,${buf.toString('base64')}`,
  });
}

const browser = await chromium.launch({ headless: true, args: ['--force-device-scale-factor=1'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });

const dataUrl = await page.evaluate(async ({ items, cols, width, labels, crop, bg }) => {
  const load = (src) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('decode failed'));
    im.src = src;
  });

  const imgs = [];
  for (const it of items) {
    try { imgs.push({ ...it, im: await load(it.url) }); } catch { /* skip undecodable */ }
  }
  if (!imgs.length) throw new Error('no images decoded');

  const rows = Math.ceil(imgs.length / cols);
  const pad = Math.max(4, Math.round(width / cols * 0.012));
  const capH = labels ? Math.max(14, Math.round(width / cols * 0.075)) : 0;
  const cellW = Math.floor((width - pad * (cols + 1)) / cols);

  // Uniform cell aspect from the median source aspect, so a sheet of mixed sizes still
  // tiles evenly instead of leaving ragged gaps.
  const aspects = imgs.map((o) => o.im.height / o.im.width).sort((a, b) => a - b);
  const aspect = aspects[Math.floor(aspects.length / 2)];
  const cellH = Math.round(cellW * aspect);

  const W = width;
  const H = pad + rows * (cellH + capH + pad);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';

  imgs.forEach((o, i) => {
    const cx = i % cols, cy = (i / cols) | 0;
    const x = pad + cx * (cellW + pad);
    const y = pad + cy * (cellH + capH + pad);

    // source rect: optional centre crop, then cover-fit the cell
    let sx = 0, sy = 0, sw = o.im.width, sh = o.im.height;
    if (crop > 0) { sw = o.im.width * crop; sh = o.im.height * crop; sx = (o.im.width - sw) / 2; sy = (o.im.height - sh) / 2; }
    const srcA = sh / sw, cellA = cellH / cellW;
    if (srcA > cellA) { const nh = sw * cellA; sy += (sh - nh) / 2; sh = nh; }
    else { const nw = sh / cellA; sx += (sw - nw) / 2; sw = nw; }

    g.drawImage(o.im, sx, sy, sw, sh, x, y, cellW, cellH);
    g.strokeStyle = 'rgba(255,255,255,.14)';
    g.lineWidth = 1;
    g.strokeRect(x + .5, y + .5, cellW - 1, cellH - 1);

    if (labels) {
      const fs = Math.max(9, Math.round(capH * 0.5));
      g.fillStyle = '#9fb6cc';
      g.font = `${fs}px ui-monospace, Menlo, monospace`;
      g.textBaseline = 'middle';
      // index badge makes it possible to refer to a tile unambiguously in prose
      const badge = `${i + 1}`;
      g.fillStyle = '#7d94ab';
      g.fillText(`${badge}. ${o.label}`, x + 2, y + cellH + capH * 0.5);
    }
  });

  return c.toDataURL('image/png');
}, { items, cols: COLS, width: WIDTH, labels: LABELS, crop: CROP, bg: BG });

await browser.close();

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, Buffer.from(dataUrl.split(',')[1], 'base64'));
console.log(`${files.length} tiles -> ${displayPath(outPath, ROOT)} (${COLS} cols, ${WIDTH}px)`);
files.forEach((f, i) => console.log(`  ${i + 1}. ${displayPath(f, ROOT)}`));
