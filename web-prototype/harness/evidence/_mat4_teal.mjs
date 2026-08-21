#!/usr/bin/env node
/**
 * HOW MUCH TEAL, AND WHERE — the shoulder-cap row of `docs/design/player-material-spec.md`.
 *
 *   node harness/evidence/_mat4_teal.mjs <label>=<file> ...
 *
 * WHY THIS EXISTS RATHER THAN A LOOK. The spec says "the TOP and BACK are NOT teal; teal is the
 * front/outer face only", and that sentence has (at least) two readings that produce different
 * caps: "no teal is visible from behind" and "the cap's own rearward-facing surface is not teal,
 * though its outer face still shows from behind". The reference art settles it — its BACK view
 * plainly carries a teal wedge on each shoulder — but only if the comparison is a count rather
 * than an impression, because at figure scale a wedge seen edge-on and no wedge at all look
 * similar in a thumbnail and the two are a swing-window apart.
 *
 * So: teal coverage as a fraction of FIGURE pixels, per view, art beside render. A ratio against
 * the figure, not an absolute count, because the art and the render are different resolutions
 * and the figure fills a different share of each frame.
 *
 * TEAL IS DETECTED BY CHROMA, NOT BY DISTANCE TO A REFERENCE COLOUR. G - R is large and positive
 * on mint and near zero on every other surface this character has — the shells, the chrome, the
 * dark grey and both backgrounds are all achromatic to within a few levels — so one channel
 * difference separates the cap from the entire rest of the frame without needing the two images
 * to be exposure-matched, which they are not.
 *
 * THE CONTROL is the `--control` flag: it re-runs the count with the teal test INVERTED (chroma
 * the wrong way, R - G). Mint is the only saturated thing on the figure, so a correct run
 * reports essentially zero there. If the inverted test also finds "teal", the detector is
 * counting shading rather than colour and none of the numbers above it mean anything.
 */
import fs from 'node:fs';
import path from 'node:path';
import { toDataURL, openCanvasPage } from '../imglib.mjs';

const args = process.argv.slice(2);
const control = args.includes('--control');
const boxes = args.includes('--boxes');
const THR = args.includes('--chroma') ? Number(args[args.indexOf('--chroma') + 1]) : 22;
const maskDir = args.includes('--mask') ? args[args.indexOf('--mask') + 1] : null;
const pairs = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--mask' && args[i - 1] !== '--chroma').map((a) => {
  const i = a.indexOf('=');
  return [a.slice(0, i), a.slice(i + 1)];
});

const { browser, page } = await openCanvasPage();

const measure = async (file, invert, wantMask = false) => {
  const url = await toDataURL(file);
  return page.evaluate(async ({ url, invert, wantMask, THR }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const W = c.width, H = c.height;
    const at = (x, y) => (y * W + x) * 4;

    // FIGURE MASK. The art is a cut-out on white (alpha or near-255 white); the render sits on a
    // grey studio gradient. Both are separated from the figure by "not close to the frame's own
    // corner colour", which is the mask _kit8_shellvalue.mjs uses and is kept compatible here.
    /*
     * ⚠️ THE RENDER'S BACKGROUND IS A GRADIENT AND A NAIVE MASK SELECTS THE WHOLE FRAME. A first
     * run of this script reported 1.84 million "figure" pixels out of a 2.07 million pixel frame
     * — i.e. it had masked the studio cyc as robot — which makes every percentage-of-figure
     * number meaningless while still printing a plausible-looking table. Captures for this script
     * are therefore taken with '&bg=ff00ff' and the figure is everything that is NOT magenta.
     * The art is a cut-out and is separated by alpha or by its white page, as before.
     */
    const isChroma = (r0, g0, b0) => r0 > 150 && b0 > 150 && g0 < 110;
    const chromaShot = isChroma(d[at(2, 2)], d[at(2, 2) + 1], d[at(2, 2) + 2]);
    const isFig = (i) => {
      if (d[i + 3] < 128) return false;                       // transparent cut-out
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (chromaShot) return !isChroma(r, gg, b);             // magenta-key capture
      return !(r > 244 && gg > 244 && b > 244);               // the art's white page
    };

    let fig = 0, teal = 0;
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;       // figure bbox
    let tx0 = 1e9, tx1 = -1, ty0 = 1e9, ty1 = -1;   // teal bbox
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = at(x, y);
        if (!isFig(i)) continue;
        fig++;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        /*
         * ⚠️ G - R ALONE COUNTS THE FACE. The visor is a light BLUE, which is also G > R, and a
         * first run of this script reported the art's teal starting 0.039 of figure height below
         * the crown — i.e. on the head — and inflated every art row. Mint and the visor separate
         * cleanly on the OTHER difference: mint #8FC9BD has G - B = +12, the visor's blue has
         * G - B strongly negative. So teal is "green over red AND green over blue", and the
         * threshold goes 12 -> 22 because the art's champagne shell carries a few levels of
         * chroma of its own, which is what the inverted control was picking up at 1.5-2.1%.
         */
        const chroma = invert ? d[i] - d[i + 1] : d[i + 1] - d[i];
        if (chroma > THR && d[i + 1] > 60 && d[i + 1] > d[i + 2]) {
          teal++;
          if (x < tx0) tx0 = x; if (x > tx1) tx1 = x;
          if (y < ty0) ty0 = y; if (y > ty1) ty1 = y;
        }
      }
    }
    const figH = Math.max(1, y1 - y0), figW = Math.max(1, x1 - x0);
    /*
     * ⚠️ `--mask` DUMPS WHAT THE MASK ACTUALLY SELECTED, because this script's first run counted
     * the studio cyc as robot and still printed a plausible table (see the note above). The same
     * class of error recurs with the CONTACT SHADOW: on a magenta-key capture the shadow is a
     * DARKER magenta, and `isChroma`'s `r0 > 150 && b0 > 150` fails on it, so the shadow is scored
     * as figure — which inflates `fig` and deflates every percentage without changing their shape.
     * Grey = figure, green = teal, black = background. LOOK AT IT before quoting a number.
     */
    let maskURL = null;
    if (wantMask) {
      const mc = document.createElement('canvas');
      mc.width = W; mc.height = H;
      const mg = mc.getContext('2d');
      const md = mg.createImageData(W, H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const i = at(x, y);
          let r = 0, g = 0, b = 0;
          if (isFig(i)) {
            const chroma = invert ? d[i] - d[i + 1] : d[i + 1] - d[i];
            const isTeal = chroma > THR && d[i + 1] > 60 && d[i + 1] > d[i + 2];
            if (isTeal) { r = 0; g = 255; b = 90; } else { r = g = b = 130; }
          }
          md.data[i] = r; md.data[i + 1] = g; md.data[i + 2] = b; md.data[i + 3] = 255;
        }
      }
      mg.putImageData(md, 0, 0);
      maskURL = mc.toDataURL('image/png');
    }
    return {
      fig, teal, pct: +(100 * teal / Math.max(1, fig)).toFixed(3), maskURL,
      // teal bbox as a fraction of figure height from the CROWN, and of half-span from centre —
      // scale-free, so the art and the render are directly comparable.
      top: teal ? +((ty0 - y0) / figH).toFixed(3) : null,
      bot: teal ? +((ty1 - y0) / figH).toFixed(3) : null,
      wid: teal ? +((tx1 - tx0) / figW).toFixed(3) : null,
      /*
       * ⚠️ `wid` DIVIDES BY FIGURE WIDTH AND THAT DENOMINATOR IS NOT SHARED. The render's Alert
       * stance is 15-19% wider than the art's relative to its own height (front, measured:
       * render 480/911 = 0.527 against art 391/880 = 0.444), so `wid` charges a STANCE difference
       * to the cap. It read 0.677 against the art's 0.798 — "8% too narrow" — while the same two
       * spans normalised by HEIGHT are 314 px and 312 px at matched figure scale, i.e. the same
       * to 0.6%. Judge lateral reach on `widH`; `wid` is kept only so older rows still parse.
       */
      widH: teal ? +((tx1 - tx0) / figH).toFixed(3) : null,
      hgt: teal ? +((ty1 - ty0) / figH).toFixed(3) : null,
      // PIXEL geometry, so a crop for a zoom can be derived from the same mask that produced the
      // percentages rather than eyeballed off the image — the two then cannot drift apart.
      box: { W, H, x0, x1, y0, y1, figW, figH },
    };
  }, { url, invert, wantMask, THR });
};

/*
 * ⚠️ `--chroma N` SWEEPS THE DETECTOR'S OWN THRESHOLD, AND IT HAS TO BE SWEPT BEFORE ANY
 * "the render carries N times the art's teal" CLAIM IS MADE. The count is a population above a
 * cut, and the render's mint and the art's mint do not sit at the same saturation — the art's is
 * far flatter. A fixed cut therefore charges a SATURATION difference to COVERAGE, and the two are
 * separate defects owned by separate files. If the ratio between two images moves when this
 * number moves, the ratio is a property of the cut and not of the geometry.
 */

const rows = [];
for (const [label, file] of pairs) {
  const m = await measure(file, false, !!maskDir);
  if (m.maskURL) {
    fs.mkdirSync(maskDir, { recursive: true });
    const out = path.join(maskDir, `mask_${label}.png`);
    fs.writeFileSync(out, Buffer.from(m.maskURL.split(',')[1], 'base64'));
    console.log(`  mask -> ${out}`);
  }
  delete m.maskURL;
  const cm = control ? await measure(file, true, false) : null;
  rows.push({ label, ...m, ctrl: cm ? cm.pct : null });
  if (boxes) {
    const b = m.box;
    console.log(`  box ${label.padEnd(10)} img ${b.W}x${b.H}  fig x ${b.x0}..${b.x1} y ${b.y0}..${b.y1}` +
      `  (${b.figW} x ${b.figH})`);
  }
}
await browser.close();

console.log('\nteal coverage, as a percentage of FIGURE pixels');
console.log('label                     figpx    tealpx    %fig   top   bot   hgt  widH    wid' + (control ? '   CTRL%' : ''));
for (const r of rows) {
  console.log(
    r.label.padEnd(24),
    String(r.fig).padStart(8), String(r.teal).padStart(9), String(r.pct).padStart(7),
    String(r.top ?? '-').padStart(6), String(r.bot ?? '-').padStart(5),
    String(r.hgt ?? '-').padStart(5), String(r.widH ?? '-').padStart(5), String(r.wid ?? '-').padStart(6),
    control ? String(r.ctrl).padStart(8) : '');
}
if (control) {
  console.log('\nCTRL% is the same count with the chroma test INVERTED. Mint is the only saturated');
  console.log('surface on this character, so a working detector reports ~0 there. A large CTRL%');
  console.log('means the test is reading shading, not colour, and every number above it is void.');
}
