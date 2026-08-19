#!/usr/bin/env node
/**
 * MULTI-VIEW PREP — turn one row of a locked art sheet into generation-ready inputs.
 *
 *   node harness/mv-prep.mjs --row baseline --out assets/mv/player
 *
 * PLAN STEP 3, and for the PLAYER it is already paid for. The pipeline plan says to generate a
 * concept (Step 2) then ask for front/side/back of it (Step 3), because multi-view input gives
 * dramatically better geometry than one picture — the model stops guessing at the back. The
 * player does not need Step 2 at all: `Dev Art/1785300149293.png`'s BASELINE row IS four
 * consistent views of it, locked, and it is the bar every critic has judged against. So this
 * extracts them rather than inventing a new concept that would disagree with the shipped art.
 *
 * WHAT IMAGE-TO-3D ACTUALLY NEEDS, and what this therefore does:
 *   - ONE FIGURE PER FILE, cropped to it. A sheet with four figures reconstructs as one blob.
 *   - A FLAT, UNIFORM BACKGROUND. The sheet's cyc carries a soft radial gradient and a drawn
 *     ground line; both read as geometry. Everything outside the figure is flattened to pure
 *     white so the segmenter has an unambiguous edge.
 *   - CONSISTENT SCALE AND BASELINE across views, or the model reconciles four differently
 *     sized robots. Every output is padded to one square canvas with the figure at one height
 *     and its soles on one line.
 *
 * ⚠️ THE GROUND LINE IS NOT PART OF THE FIGURE and must be cut before the sole is found. It sits
 * as a SEPARATE occupied band a few px under the feet (measured on this sheet: figures at
 * y 67-405 / 494-813 / 931-1231, ground bands at 819-844 and 1246-1264). Including it walks the
 * detected sole down into the shadow, which is the same defect that corrupted the critique
 * bench's art crops for eighteen rounds. Bands are found by scanning, never by eye.
 *
 * Output is deliberately PNG with no alpha: TRELLIS and Hunyuan3D both segment on their own,
 * and a hand-cut alpha edge that disagrees with theirs is worse than none.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHEET = 'C:/Users/John/Documents/Run Robot Run/Dev Art/1785300149293.png';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };

const ROW = opt('row', 'baseline');
const OUTDIR = path.resolve(ROOT, opt('out', `assets/mv/${ROW}`));
const CANVAS = +opt('size', 1024);
// Fraction of canvas height the figure occupies. 0.86 leaves a margin on all sides; a figure
// touching the canvas edge is the single most common way to make a generator clip a limb.
const FILL = +opt('fill', 0.86);

/** Which occupied band of the sheet is this row? 0 = BASELINE, 1 = STAGE 2, 2 = STAGE 3. */
const ROW_INDEX = { baseline: 0, stage2: 1, stage3: 2 };
if (!(ROW in ROW_INDEX)) {
  console.error(`--row must be one of: ${Object.keys(ROW_INDEX).join(', ')}`);
  process.exit(1);
}

mkdirSync(OUTDIR, { recursive: true });

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.goto('about:blank');
const url = `data:image/png;base64,${(await readFile(SHEET)).toString('base64')}`;

const result = await page.evaluate(async ({ src, rowIndex, CANVAS, FILL }) => {
  const im = new Image(); im.src = src; await im.decode();
  const W = im.naturalWidth, H = im.naturalHeight;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(im, 0, 0);
  const d = cx.getImageData(0, 0, W, H).data;
  const lum = (x, y) => { const i = (y * W + x) * 4; return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; };
  const INK = 226;               // anything below this is subject, not cyc
  const runs = (occ, min) => {
    const out = []; let s = -1;
    for (let i = 0; i < occ.length; i++) {
      const on = occ[i];
      if (on && s < 0) s = i;
      if (!on && s >= 0) { if (i - s >= min) out.push([s, i]); s = -1; }
    }
    if (s >= 0 && occ.length - s >= min) out.push([s, occ.length]);
    return out;
  };

  // --- rows of the whole sheet -> figure bands. The ground lines are short bands; the tallest
  // --- three are the figure rows. Sorting by height is what separates them without a constant.
  const rowOcc = [];
  for (let y = 0; y < H; y++) { let n = 0; for (let x = 0; x < W; x++) if (lum(x, y) < INK) n++; rowOcc.push(n / W > 0.01); }
  const allBands = runs(rowOcc, 12);
  const figureRows = allBands.slice().sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, 3)
    .sort((a, b) => a[0] - b[0]);
  if (figureRows.length < 3) return { error: `found ${figureRows.length} figure rows, expected 3` };
  const [ry0, ry1] = figureRows[rowIndex];

  // --- columns inside that row -> the individual views
  const colOcc = [];
  for (let x = 0; x < W; x++) { let n = 0; for (let y = ry0; y < ry1; y++) if (lum(x, y) < INK) n++; colOcc.push(n > 3); }
  const views = runs(colOcc, 30);

  const out = [];
  for (const [cx0, cx1] of views) {
    /*
     * ⚠️ THE CONTACT SHADOW IS NOT THE FIGURE, AND A LUMINANCE THRESHOLD CANNOT SEPARATE THEM.
     * Measured on this sheet: the shadow runs 190-225 while the figure's own median is 154 and
     * its white shell is brighter than the shadow — so any single cut either keeps the smear or
     * erases the robot. A border flood-fill fails too, because a white robot on a white cyc has
     * stretches of silhouette with no dark edge for the fill to stop against.
     *
     * The BOOTS are the discriminator. They are genuinely dark (this strip bottoms out at 10)
     * where the shadow never goes below ~190, so the true sole is the lowest row holding a
     * clearly-dark pixel. Everything under that line is ground, not robot, and gets cut — which
     * matters because the plan is explicit that baked shadows wreck the 3D conversion, and a
     * generator will happily reconstruct a smear as a plinth.
     */
    const SOLE_DARK = 120;
    let x0 = cx1, x1 = cx0, y0 = ry1, y1 = ry0;
    for (let y = ry0; y < ry1; y++) for (let x = cx0; x < cx1; x++) {
      const L = lum(x, y);
      if (L < INK) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; }
      if (L < SOLE_DARK) { if (y > y1) y1 = y; }                       // sole from DARK only
    }
    /*
     * ⚠️ AND THE SHADOW IS LATERAL, NOT JUST BELOW. Cutting under the sole line does not remove
     * it: the smear spreads SIDEWAYS at boot height, so it survives every vertical cut and then
     * gets re-included by the silhouette pass below. It has to be erased by SPAN.
     *
     * In the bottom slice of the figure the only real geometry is the boots, and they are dark
     * (< SOLE_DARK) where the smear never is. So take the dark pixels' x-range in that slice as
     * the true foot span and blank anything outside it. Two extra columns of tolerance keep the
     * boots' own antialiased edge.
     */
    const footTop = Math.round(y1 - (y1 - y0) * 0.14);
    let fx0 = cx1, fx1 = cx0;
    for (let y = footTop; y <= y1; y++) for (let x = cx0; x < cx1; x++) {
      if (lum(x, y) < SOLE_DARK) { if (x < fx0) fx0 = x; if (x > fx1) fx1 = x; }
    }
    const clearFrom = fx0 - 2, clearTo = fx1 + 2;
    if (fx1 >= fx0) {
      for (let y = footTop; y <= y1; y++) for (let x = cx0; x < cx1; x++) {
        if (x < clearFrom || x > clearTo) {
          const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255;
        }
      }
      cx.putImageData(new ImageData(new Uint8ClampedArray(d), W, H), 0, 0);
    }

    // Widen back to the true silhouette above the sole, now that the smear is gone.
    x0 = cx1; x1 = cx0;
    for (let y = y0; y <= y1; y++) for (let x = cx0; x < cx1; x++) {
      if (lum(x, y) < INK) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
    }
    const fw = x1 - x0 + 1, fh = y1 - y0 + 1;
    const scale = (CANVAS * FILL) / fh;                 // one height for every view
    const dw = Math.round(fw * scale), dh = Math.round(fh * scale);
    const dx = Math.round((CANVAS - dw) / 2);
    const dy = Math.round(CANVAS * (1 - FILL) / 2 + (CANVAS * FILL - dh)); // soles on one line

    const oc = document.createElement('canvas'); oc.width = CANVAS; oc.height = CANVAS;
    const ox = oc.getContext('2d', { willReadFrequently: true });
    ox.fillStyle = '#ffffff'; ox.fillRect(0, 0, CANVAS, CANVAS);
    ox.imageSmoothingQuality = 'high';
    ox.drawImage(cv, x0, y0, fw, fh, dx, dy, dw, dh);

    // Flatten the cyc: anything the sheet drew as near-background becomes pure white, so the
    // generator sees one unambiguous edge instead of a soft gradient plus a ground line.
    const id = ox.getImageData(0, 0, CANVAS, CANVAS); const p = id.data;
    for (let i = 0; i < p.length; i += 4) {
      const L = 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
      if (L >= INK) { p[i] = p[i + 1] = p[i + 2] = 255; }
    }
    ox.putImageData(id, 0, 0);
    out.push({ box: [x0, y0, fw, fh], png: oc.toDataURL('image/png') });
  }
  return { rowBand: [ry0, ry1], views: out };
}, { src: url, rowIndex: ROW_INDEX[ROW], CANVAS, FILL });

await browser.close();

if (result.error) { console.error(`mv-prep: ${result.error}`); process.exit(1); }

// Four views on this sheet, left to right. Named for what image-to-3D expects to be told.
const NAMES = ['front', 'side-left', 'side-right', 'back'];
console.log(`\n  row "${ROW}" occupies sheet rows ${result.rowBand[0]}..${result.rowBand[1]}`);
console.log(`  ${result.views.length} view(s) found\n`);
result.views.forEach((v, i) => {
  const name = NAMES[i] ?? `view${i + 1}`;
  const file = path.join(OUTDIR, `${ROW}_${name}.png`);
  writeFileSync(file, Buffer.from(v.png.split(',')[1], 'base64'));
  console.log(`  ${name.padEnd(11)} src box ${String(v.box[2]).padStart(3)}x${String(v.box[3]).padStart(3)}  ->  ${path.relative(ROOT, file)}`);
});
if (result.views.length !== 4) {
  console.log(`\n  ⚠️  expected 4 views on this sheet and found ${result.views.length}. Check the`);
  console.log(`      outputs before feeding them to a generator — a merged pair reconstructs as one blob.`);
}
console.log(`\n  ${CANVAS}px square, figure at ${(FILL * 100).toFixed(0)}% height, soles on a common line, cyc flattened to pure white.\n`);
