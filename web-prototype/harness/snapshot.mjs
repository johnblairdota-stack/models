#!/usr/bin/env node
/**
 * Build a SELF-CONTAINED snapshot of the progress board.
 *
 * The live page at progress/index.html fetches status.json and loads screenshots from
 * disk, which only works on this machine. A hosted copy has to carry everything inside
 * it, so this inlines the board data and downscales every screenshot into a data URI.
 *
 * Thumbnails are made in a real browser via canvas — no image library needed, and it is
 * the same playwright that already drives the harness.
 *
 *   node harness/snapshot.mjs --out progress/snapshot.html --thumb 460
 */

import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveOutFile, displayPath, PathArgError } from './paths.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf('--' + n);
  if (i < 0) return d;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) {
    console.error(`--${n} needs a value (got ${v === undefined ? 'end of arguments' : `the next flag, "${v}"`})`);
    process.exit(2);
  }
  return v;
};

// Absolute paths honoured verbatim; the drive-relative form an unquoted Windows path
// collapses into is refused rather than resolved into the repo root. See paths.mjs.
let OUT;
try {
  OUT = resolveOutFile('out', opt('out', path.join(ROOT, 'progress/snapshot.html')), ROOT);
} catch (e) {
  if (!(e instanceof PathArgError)) throw e;
  console.error(e.message);
  process.exit(2);
}
const THUMB = +opt('thumb', 460);
const QUALITY = +opt('quality', 0.62);

const status = JSON.parse(await readFile(path.join(ROOT, 'progress/status.json'), 'utf8'));
const pieces = Object.values(status.pieces);

// Prefer the 1280-wide review capture over the full 1080p one: same content, far less to
// downscale, and these are going to be a few hundred pixels wide in the end anyway.
function shotFor(p) {
  const base = path.join(ROOT, 'progress', p.shot || `shots/${p.id}.png`);
  const review = base.replace(/\.png$/, '.review.png');
  if (existsSync(review)) return review;
  if (existsSync(base)) return base;
  return null;
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto('about:blank');

let done = 0, bytes = 0;
for (const p of pieces) {
  const file = shotFor(p);
  if (!file) { p._thumb = null; continue; }
  try {
    // Feed the bytes in as a data URI rather than a file:// URL. A cross-origin image
    // taints the canvas and toDataURL then throws a SecurityError — which surfaced here
    // as every thumbnail silently coming back null.
    const raw = `data:image/png;base64,${(await readFile(file)).toString('base64')}`;
    p._thumb = await page.evaluate(async ({ url, w, q }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, w / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', q);
    }, { url: raw, w: THUMB, q: QUALITY });
    bytes += p._thumb.length;
    done++;
  } catch { p._thumb = null; }
}
await browser.close();

// Strip anything the page does not need, so the payload stays as small as it can.
const slim = pieces.map((p) => ({
  id: p.id, group: p.group, title: p.title, verdict: p.verdict, score: p.score || 0,
  round: p.round || 0, owner: p.owner || null, summary: p.summary || '',
  hates: p.hates || [], wins: p.wins || [], blind: p.blind || null,
  perf: p.perf ? { fps: p.perf.fps, worstFps: p.perf.worstFps, gpuMs: p.perf.gpuMs,
                   calls: p.perf.calls, tris: p.perf.tris, quality: p.perf.quality } : null,
  history: (p.history || []).slice(-14).map((h) => h.score || 0),
  updatedAt: p.updatedAt, thumb: p._thumb,
}));

const payload = {
  generatedAt: new Date().toISOString(),
  startedAt: status.startedAt,
  round: status.round || 0,
  pieces: slim,
  log: (status.log || []).slice(0, 40),
};

const tpl = await readFile(path.join(ROOT, 'harness/snapshot-template.html'), 'utf8');
const html = tpl.replace('/*__DATA__*/null', JSON.stringify(payload));
await writeFile(OUT, html);

console.log(`snapshot -> ${displayPath(OUT, ROOT)}`);
console.log(`  ${done}/${pieces.length} thumbnails inlined, ${(bytes / 1048576).toFixed(2)} MB of image data`);
console.log(`  total ${(html.length / 1048576).toFixed(2)} MB`);
