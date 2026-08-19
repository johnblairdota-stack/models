#!/usr/bin/env node
/**
 * SILHOUETTE OVERLAY — the render's outline against the reference art's.
 *
 * WHY THIS EXISTS. Silhouette has been the #1 or #2 complaint in almost every round
 * `char.turnaround` has been through, and until this existed the only way to check one was to
 * tile render and reference side by side and compare from memory. That is a bad instrument: it
 * found the leg lobes only after six rounds, and it never found the shoulder mass sitting
 * 0.05 H too high at all — measurement did, on round 27.
 *
 *   # card overlay: same size and same figure positions as the render, so it swaps in place
 *   node harness/overlay.mjs --img progress/shots/char.turnaround.png \
 *     --ref "C:/Users/John/Documents/Run Robot Run/Dev Art/1785277053522.png" \
 *     --out progress/overlays/char.turnaround.png
 *
 *   # one figure, normalised and centred, for close reading
 *   node harness/overlay.mjs --img ... --ref ... --out ov.png --mode figure --figure 1
 *
 *   --mode card|figure|mask   default card
 *   --figure <n>              which figure, 1-based left to right (figure/mask modes)
 *   --figures <n>             figures per sheet, default 4
 *   --thresh <n>              edge sensitivity, default 4
 *
 * READING IT:
 *   grey    both agree
 *   RED     render only — mass the art does not have
 *   BLUE    art only — mass the render is missing
 * Red ABOVE blue on a feature means it sits too high; red BESIDE blue means too wide. That
 * distinction is what nine rounds of arguing about shoulder width missed — the width was
 * within 1% and the height was out by 0.05 H.
 *
 * CARD MODE ALIGNS TO THE RENDER, and that is the whole point of it. A first version
 * normalised every figure to its own centre and re-tiled them at even spacing, so the
 * silhouettes sat at different x-positions than the robots in the screenshot and toggling
 * between them made the whole sheet jump. Here each figure is composited back at its own
 * position and scale in the source image, and the reference is mapped INTO that figure's box,
 * so the overlay is a true drop-in replacement for the shot.
 *
 * METHOD. Silhouettes come from the horizontal DERIVATIVE, not from a brightness threshold:
 * the shell is #EDEFF0 against a #F2F2F2 cyc, about 2% apart, and both sheets carry a
 * vignette, so any absolute threshold either finds nothing or welds all four figures into one
 * blob. That is what `ART_MANIFEST.md` means when it says auto-segmentation fails here. It
 * does not fail on the derivative.
 *
 * WHAT THIS CANNOT TELL YOU: anything inside the outline. Panel lines, material, contrast and
 * surface detail are all invisible here by design. It answers "is it the right shape".
 *
 * PATHS: relative resolve against the project root; absolute are honoured. QUOTE Windows paths.
 */

import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { toDataURL, openCanvasPage, resolveImg } from './imglib.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const IMG = opt('img'), REF = opt('ref'), OUT = opt('out');
const MODE = opt('mode', 'card');
const FIG = +(opt('figure', 1));
const FIGS = +(opt('figures', 4));
const THRESH = +(opt('thresh', 4));
const BAND = (opt('band', '0.12,0.90')).split(',').map(Number);
// `--refband` — see the long note on the same flag in measure.mjs. The shared 0.90 lower cut
// is calibrated for the RENDER's view labels and truncates the ART SHEET's feet, which moves
// the reference's sole — the origin every H-fraction is taken from — by 32 px in 615.
// Defaults to `--band`, so an invocation that does not pass it is byte-identical.
const REFBAND = (opt('refband', '')).split(',').map(Number).filter(Number.isFinite);
const RBAND = REFBAND.length === 2 ? REFBAND : BAND;

if (!IMG || !OUT || (MODE !== 'mask' && !REF)) {
  console.error('usage: node harness/overlay.mjs --img <png> --ref <png> --out <png> [--mode card|figure|mask]');
  process.exit(1);
}

const { browser, page } = await openCanvasPage();

/**
 * Per-figure silhouette geometry in SOURCE pixel coordinates.
 * Returns { W, H, figures: [{ x0, x1, crown, sole, cx, edges }] } where `edges[y - crown]`
 * is [left, right] or null. Source coordinates are what card mode needs; normalising is a
 * later step, only for the single-figure modes.
 */
async function analyse(file, band = BAND) {
  const url = await toDataURL(file);
  return page.evaluate(async ({ url, FIGS, BAND, THRESH }) => {
    const im = new Image();
    im.src = url;
    await im.decode();
    const W = im.naturalWidth, H = im.naturalHeight;
    const c = new OffscreenCanvas(W, H);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const grad = (x, y) => (x < 2 || x > W - 3) ? 0
      : Math.abs(lum((y * W + x + 2) * 4) - lum((y * W + x - 2) * 4));
    const isEdge = (x, y) => grad(x, y) > THRESH;

    const y0 = Math.round(H * BAND[0]), y1 = Math.round(H * BAND[1]);

    const col = new Uint32Array(W);
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) if (isEdge(x, y)) col[x]++;
    const minCol = Math.max(2, Math.round((y1 - y0) * 0.01));
    const runs = [];
    let s = -1;
    for (let x = 0; x < W; x++) {
      const on = col[x] >= minCol;
      if (on && s < 0) s = x;
      if (!on && s >= 0) { runs.push([s, x - 1]); s = -1; }
    }
    if (s >= 0) runs.push([s, W - 1]);
    const gap = Math.round(W / (FIGS * 6));
    const merged = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && r[0] - last[1] < gap) last[1] = r[1]; else merged.push([...r]);
    }
    merged.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
    const figs = merged.slice(0, FIGS).sort((a, b) => a[0] - b[0]);

    const out = figs.map(([fx0, fx1]) => {
      const edgesOn = (y) => {
        let l = -1, r = -1;
        for (let x = fx0; x <= fx1; x++) if (isEdge(x, y)) { l = x; break; }
        for (let x = fx1; x >= fx0; x--) if (isEdge(x, y)) { r = x; break; }
        return (l >= 0 && r > l) ? [l, r] : null;
      };
      const minSpan = Math.max(3, Math.round((fx1 - fx0) * 0.04));
      let crown = -1, sole = -1;
      for (let y = y0; y < y1 && crown < 0; y++) { const e = edgesOn(y); if (e && e[1] - e[0] >= minSpan) crown = y; }
      for (let y = y1 - 1; y >= y0 && sole < 0; y--) { const e = edgesOn(y); if (e && e[1] - e[0] >= minSpan) sole = y; }
      if (crown < 0 || sole <= crown) return null;

      const edges = [];
      for (let y = crown; y <= sole; y++) edges.push(edgesOn(y));

      // Register on the body's MEDIAN axis, not the sole row's centre. At the last row often
      // only one foot (or a contact shadow) is present, so a sole-centre pivot is a foot's
      // centre and the whole overlay comes out displaced sideways — which reads as a shape
      // error when it is purely alignment.
      const cs = edges.filter(Boolean).map((e) => (e[0] + e[1]) / 2).sort((a, b) => a - b);
      const cx = cs.length ? cs[cs.length >> 1] : (fx0 + fx1) / 2;
      return { x0: fx0, x1: fx1, crown, sole, cx, edges };
    }).filter(Boolean);

    return { W, H, figures: out };
  }, { url, FIGS, BAND: band, THRESH });
}

const A = await analyse(IMG);
const B = REF ? await analyse(REF, RBAND) : null;
if (!A.figures.length) { console.error(`  ${path.basename(IMG)}: no figures found`); await browser.close(); process.exit(1); }

const result = await page.evaluate(({ A, B, MODE, FIG }) => {
  const inside = (fig, y, x) => {
    const e = fig.edges[y - fig.crown];
    return !!e && x >= e[0] && x <= e[1];
  };

  if (MODE === 'card') {
    // Canvas matches the RENDER exactly, and each figure is painted at its own source
    // position — so this file is a drop-in swap for the screenshot on a card.
    const c = new OffscreenCanvas(A.W, A.H);
    const g = c.getContext('2d');
    const img = g.createImageData(A.W, A.H);
    const px = (x, y, r, gr, b, a) => {
      const i = (y * A.W + x) * 4;
      img.data[i] = r; img.data[i + 1] = gr; img.data[i + 2] = b; img.data[i + 3] = a;
    };
    let both = 0, only = 0;
    A.figures.forEach((fa, i) => {
      const fb = B && B.figures[i];
      const hA = fa.sole - fa.crown;
      const hB = fb ? fb.sole - fb.crown : 0;
      const k = fb ? hB / hA : 1;                       // art px per render px
      for (let y = fa.crown; y <= fa.sole; y++) {
        for (let x = fa.x0; x <= fa.x1; x++) {
          const inR = inside(fa, y, x);
          // map this render pixel into the reference figure's own frame
          let inA = false;
          if (fb) {
            const ay = Math.round(fb.crown + (y - fa.crown) * k);
            const ax = Math.round(fb.cx + (x - fa.cx) * k);
            if (ay >= fb.crown && ay <= fb.sole) inA = inside(fb, ay, ax);
          }
          if (inR && inA) { px(x, y, 150, 155, 158, 255); both++; }
          else if (inR) { px(x, y, 224, 87, 76, 255); only++; }
          else if (inA) { px(x, y, 74, 134, 214, 255); only++; }
        }
      }
    });
    g.putImageData(img, 0, 0);
    return c.convertToBlob({ type: 'image/png' })
      .then((bl) => bl.arrayBuffer())
      .then((ab) => ({ bytes: Array.from(new Uint8Array(ab)), iou: both / (both + only) }));
  }

  // figure / mask: one figure, normalised to a square grid, for close reading
  const SZ = 512, pad = 24;
  const fa = A.figures[FIG - 1];
  const fb = B && B.figures[FIG - 1];
  if (!fa) return { err: `figure ${FIG} not found` };
  const grid = (fig) => {
    const h = fig.sole - fig.crown;
    const gr = new Uint8Array(SZ * SZ);
    for (let gy = 0; gy < SZ; gy++) {
      const y = Math.round(fig.crown + (gy / (SZ - 1)) * h);
      for (let gx = 0; gx < SZ; gx++) {
        const sx = fig.cx + ((gx - SZ / 2) / SZ) * h;
        if (inside(fig, y, Math.round(sx))) gr[gy * SZ + gx] = 1;
      }
    }
    return gr;
  };
  const ga = grid(fa), gb = fb ? grid(fb) : null;
  const c = new OffscreenCanvas(SZ + pad * 2, SZ + pad * 2);
  const g = c.getContext('2d');
  const img = g.createImageData(SZ, SZ);
  let both = 0, only = 0;
  for (let i = 0; i < SZ * SZ; i++) {
    const a = ga[i], b = gb ? gb[i] : 0;
    let col = [255, 255, 255, 0];
    if (MODE === 'mask' || !gb) col = a ? [40, 44, 48, 255] : [255, 255, 255, 0];
    else if (a && b) { col = [150, 155, 158, 255]; both++; }
    else if (a) { col = [224, 87, 76, 255]; only++; }
    else if (b) { col = [74, 134, 214, 255]; only++; }
    img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1];
    img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = col[3];
  }
  g.putImageData(img, pad, pad);
  return c.convertToBlob({ type: 'image/png' })
    .then((bl) => bl.arrayBuffer())
    .then((ab) => ({ bytes: Array.from(new Uint8Array(ab)), iou: gb ? both / (both + only) : null }));
}, { A, B, MODE, FIG });

await browser.close();
if (result.err) { console.error('  ' + result.err); process.exit(1); }
await writeFile(resolveImg(OUT), Buffer.from(result.bytes));

if (result.iou != null) {
  console.log(`  silhouette IoU  ${(result.iou * 100).toFixed(1)}%   (${MODE} mode` +
    `${MODE === 'card' ? `, ${A.figures.length} figures` : `, figure ${FIG}`})`);
  console.log(`  red = render-only mass · blue = art-only · grey = agreement`);
}
console.log(`  -> ${path.basename(OUT)}`);
