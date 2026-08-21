#!/usr/bin/env node
/**
 * WHERE THE DARKS LIVE — a bone-addressable map of the dark set.
 *
 *   node harness/evidence/_two1_regionmap.mjs [image ...]
 *
 * WHY THIS AND NOT `_critdig_darkstruct.mjs`. That script measures the SHAPE of the dark set
 * (components, concentration, elongation) but is blind to WHERE it sits, and "where" is the
 * whole question this round: the art gets its darks from a second, darker STRUCTURAL material
 * on the arms, waist and inner thighs, not from lines scratched over the white. A number that
 * says "13.9% of the shell is dark" is satisfied equally by the art and by a shell with a grid
 * over it, which is exactly the trap the last two rounds fell into.
 *
 * So this reports the dark fraction as a function of
 *   - height, as a fraction of FIGURE height (0 = crown, 1 = sole), and
 *   - lateral position, as a fraction of the HALF-SPAN of that row (0 = centreline, 1 = silhouette
 *     edge), signed so left and right can be checked against each other.
 * Both are scale-free and pose-relative, so they map onto bones rather than onto pixels.
 *
 * It also answers the two questions a region map cannot:
 *   VALUE  — the dark material's luma as a RATIO of the white plates' luma, per band. A ratio
 *            survives an exposure change; an absolute luma does not, and the art and the render
 *            are not exposure-matched.
 *   EDGE   — how many pixels a light->dark transition takes, as a fraction of figure height. A
 *            second material has a hard edge; a painted gradient does not.
 *
 * MASK IS COPIED VERBATIM from `_critdig_darkstruct.mjs` (which took it from
 * `_kit8_shellvalue.mjs`) so all three segment identically and their numbers are comparable.
 *
 * Every cut is swept (rule 1). Rows that disagree across cuts are the ones to distrust.
 */
import { toDataURL, openCanvasPage } from '../imglib.mjs';

const DEFAULTS = [
  'assets/mv/player/baseline_front.png',
  'assets/mv/player/baseline_side-left.png',
  'assets/mv/player/baseline_back.png',
];
const files = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULTS;

const { browser, page } = await openCanvasPage();

const measure = async (file) => {
  const url = await toDataURL(file);
  const r = await page.evaluate(async ({ url }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const W = c.width, H = c.height;
    const idx = (x, y) => (y * W + x) * 4;

    // --- mask, verbatim from _critdig_darkstruct.mjs ---
    const bgp = [d[idx(2, 2)], d[idx(2, 2) + 1], d[idx(2, 2) + 2], d[idx(2, 2) + 3]];
    const isChroma = (r0, g0, b0) => r0 > 150 && b0 > 150 && g0 < 110;
    const chromaShot = isChroma(bgp[0], bgp[1], bgp[2]);

    const fig = new Uint8Array(W * H);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        const a = d[i + 3];
        let on;
        if (chromaShot) on = a > 40 && !isChroma(d[i], d[i + 1], d[i + 2]);
        else on = a > 40 && (Math.abs(d[i] - bgp[0]) + Math.abs(d[i + 1] - bgp[1]) + Math.abs(d[i + 2] - bgp[2]) > 24);
        if (!on) continue;
        fig[y * W + x] = 1;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    const figH = y1 - y0 + 1, figW = x1 - x0 + 1;

    const luma = new Float32Array(W * H);
    const chroma = new Float32Array(W * H);
    for (let p = 0; p < W * H; p++) {
      const i = p * 4;
      luma[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
      chroma[p] = mx - mn;
    }
    // neutral shell only — the visor, the mint and the wordmark are not structural material
    const NEUT = 30;
    const shell = (p) => fig[p] && chroma[p] < NEUT;

    // --- per-row centreline and half-span, from the SILHOUETTE (all figure px, not just shell).
    // The lateral coordinate has to be relative to the limb it is on; a global centreline would
    // call an arm "outer" purely for hanging away from the body.
    const rowL = new Int32Array(H).fill(-1), rowR = new Int32Array(H).fill(-1);
    for (let y = y0; y <= y1; y++) {
      let l = -1, rr = -1;
      for (let x = x0; x <= x1; x++) if (fig[y * W + x]) { if (l < 0) l = x; rr = x; }
      rowL[y] = l; rowR[y] = rr;
    }

    const NB = 20;   // height bands
    const NL = 8;    // lateral bins, signed: index 0..NL-1 spans u in [-1, 1]
    const CUTS = [70, 90, 110, 130];

    const out = { file: '', figW, figH, chromaShot, bands: [], grid: [], value: [], edge: [], whole: [] };

    // A per-band lit reference: the MEDIAN luma of the band's shell pixels ABOVE the cut. That
    // is the white plate's value in that band, and dividing by it is what makes the darkness a
    // ratio rather than an exposure reading.
    const medianOf = (arr) => {
      if (!arr.length) return NaN;
      arr.sort((a, b) => a - b);
      return arr[(arr.length / 2) | 0];
    };

    for (const cut of CUTS) {
      const bandDark = new Array(NB).fill(0), bandN = new Array(NB).fill(0);
      const gridDark = [], gridN = [];
      for (let b = 0; b < NB; b++) { gridDark.push(new Array(NL).fill(0)); gridN.push(new Array(NL).fill(0)); }
      const litVals = [], darkVals = [];
      const bandLit = [], bandDk = [];
      for (let b = 0; b < NB; b++) { bandLit.push([]); bandDk.push([]); }

      for (let y = y0; y <= y1; y++) {
        const b = Math.min(NB - 1, Math.floor(((y - y0) / figH) * NB));
        const l = rowL[y], rr = rowR[y];
        if (l < 0) continue;
        const cx = (l + rr) / 2, half = Math.max(1, (rr - l) / 2);
        for (let x = l; x <= rr; x++) {
          const p = y * W + x;
          if (!shell(p)) continue;
          const u = (x - cx) / half;                       // -1 .. 1
          const li = Math.min(NL - 1, Math.max(0, Math.floor(((u + 1) / 2) * NL)));
          bandN[b]++; gridN[b][li]++;
          if (luma[p] < cut) {
            bandDark[b]++; gridDark[b][li]++;
            darkVals.push(luma[p]); bandDk[b].push(luma[p]);
          } else {
            litVals.push(luma[p]); bandLit[b].push(luma[p]);
          }
        }
      }

      const totN = bandN.reduce((a, k) => a + k, 0), totD = bandDark.reduce((a, k) => a + k, 0);
      out.whole.push({ cut, n: totN, dark: totD, frac: totD / Math.max(1, totN) });
      out.bands.push({ cut, frac: bandDark.map((v, b) => v / Math.max(1, bandN[b])), n: bandN.slice() });
      out.grid.push({ cut, g: gridDark.map((row, b) => row.map((v, l) => v / Math.max(1, gridN[b][l]))) });
      out.value.push({
        cut,
        litMed: medianOf(litVals.slice()), darkMed: medianOf(darkVals.slice()),
        band: bandDk.map((dk, b) => ({
          lit: medianOf(bandLit[b].slice()), dark: medianOf(dk.slice()),
        })),
      });
    }

    // --- EDGE SHARPNESS. Walk each row; at every light->dark crossing measure how many pixels
    // it takes to fall from 90% of the row's lit median to 110% of the global dark median.
    // Reported as a fraction of figure height so it is comparable between images of different
    // resolution. Only transitions that COMPLETE are counted, and runs shorter than 3 px on
    // either side are ignored so single-pixel noise cannot register as an infinitely hard edge.
    {
      const globalDark = out.value[1].darkMed;  // cut 90 column
      const widths = [];
      for (let y = y0; y <= y1; y++) {
        const l = rowL[y], rr = rowR[y];
        if (l < 0) continue;
        const vals = [];
        for (let x = l; x <= rr; x++) { const p = y * W + x; vals.push(shell(p) ? luma[p] : NaN); }
        const rowLit = medianOf(vals.filter((v) => v > 90).slice());
        if (!(rowLit > 0)) continue;
        const hi = rowLit * 0.90, lo = Math.max(globalDark * 1.10, 20);
        if (!(hi > lo)) continue;
        for (let i = 3; i < vals.length - 3; i++) {
          if (!(vals[i] >= hi) || !(vals[i + 1] < hi)) continue;
          let j = i + 1;
          while (j < vals.length && vals[j] > lo && vals[j] < hi) j++;
          if (j >= vals.length || !(vals[j] <= lo)) { i = j; continue; }
          widths.push(j - i);
          i = j;
        }
      }
      widths.sort((a, b) => a - b);
      out.edge = {
        n: widths.length,
        p25: widths[(widths.length * 0.25) | 0],
        med: widths[(widths.length * 0.50) | 0],
        p75: widths[(widths.length * 0.75) | 0],
        medFracH: widths.length ? widths[(widths.length * 0.50) | 0] / figH : NaN,
      };
    }

    /*
     * --- MATERIAL RATIO. The band and whole-figure ratios above compare the below-cut pixels to
     * the above-cut pixels, which are two DIFFERENT POPULATIONS — that number answers "how dark
     * are the shadows", not "how dark is the second material", and it understates the latter
     * badly because half of a dark metal arm sits above any cut you pick.
     *
     * So sample explicit boxes on the parts the art is two-toning and take the ratio of MEDIANS
     * to a box on the white chest plate. Boxes are in figure-bbox-normalised coordinates, so
     * they survive the resolution difference between the three views — but they assume an
     * A-pose seen front-on, so they are only meaningful on the front and back plates and the
     * runner names the view rather than quoting the side.
     */
    {
      const BOX = {
        chestPlate:  [0.42, 0.24, 0.58, 0.33],
        armLeft:     [0.05, 0.30, 0.17, 0.44],
        armRight:    [0.83, 0.30, 0.95, 0.44],
        waist:       [0.44, 0.43, 0.56, 0.49],
        thighInner:  [0.47, 0.55, 0.53, 0.65],
        thighOuterL: [0.35, 0.55, 0.43, 0.65],
        shinLeft:    [0.36, 0.79, 0.45, 0.88],
        shinRight:   [0.55, 0.79, 0.64, 0.88],
        pelvis:      [0.44, 0.49, 0.56, 0.54],
      };
      out.mat = {};
      for (const [k, b] of Object.entries(BOX)) {
        const vals = [];
        let sr = 0, sg = 0, sb = 0;
        const ax = Math.round(x0 + b[0] * figW), ay = Math.round(y0 + b[1] * figH);
        const bx = Math.round(x0 + b[2] * figW), by = Math.round(y0 + b[3] * figH);
        for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) {
          const p = y * W + x;
          if (!shell(p)) continue;
          vals.push(luma[p]); sr += d[p * 4]; sg += d[p * 4 + 1]; sb += d[p * 4 + 2];
        }
        out.mat[k] = {
          n: vals.length, med: medianOf(vals.slice()),
          r: sr / Math.max(1, vals.length), g: sg / Math.max(1, vals.length), b: sb / Math.max(1, vals.length),
        };
      }
    }
    return out;
  }, { url });

  const name = file.split(/[\\/]/).pop();
  console.log(`\n================ ${name}  (${r.figW} x ${r.figH}, chroma:${r.chromaShot}) ================`);

  console.log(`\n  WHOLE-SHELL DARK FRACTION`);
  console.log(`   ` + r.whole.map((w) => `cut${w.cut}: ${(w.frac * 100).toFixed(1)}%`).join('   '));

  console.log(`\n  DARK FRACTION BY HEIGHT BAND (0.00 = crown, 1.00 = sole), % of neutral shell px`);
  console.log(`   band   yFrac        cut70   cut90  cut110  cut130    n@90`);
  for (let b = 0; b < 20; b++) {
    const y0f = (b / 20).toFixed(2), y1f = ((b + 1) / 20).toFixed(2);
    const cells = r.bands.map((s) => (s.frac[b] * 100).toFixed(1).padStart(6));
    console.log(`   ${String(b).padStart(4)}  ${y0f}-${y1f}  ${cells.join('  ')}  ${String(r.bands[1].n[b]).padStart(7)}`);
  }

  console.log(`\n  LATERAL x HEIGHT MAP at cut 90 — columns are u = (x-rowCentre)/rowHalfSpan,`);
  console.log(`  left silhouette edge .. centreline .. right edge. Each cell = % dark.`);
  console.log(`   band   yFrac      -1.0  -0.75 -0.50 -0.25  0.25  0.50  0.75   1.0`);
  const G = r.grid[1].g;
  for (let b = 0; b < 20; b++) {
    const y0f = (b / 20).toFixed(2), y1f = ((b + 1) / 20).toFixed(2);
    const cells = G[b].map((v) => (v * 100).toFixed(0).padStart(5));
    const bar = G[b].map((v) => (v > 0.45 ? '#' : v > 0.25 ? '+' : v > 0.12 ? '.' : ' ')).join('');
    console.log(`   ${String(b).padStart(4)}  ${y0f}-${y1f} ${cells.join(' ')}   |${bar}|`);
  }

  console.log(`\n  VALUE — dark median / lit median (a RATIO, so exposure-independent)`);
  for (const v of r.value) {
    console.log(`   cut ${String(v.cut).padStart(3)}:  lit ${v.litMed.toFixed(1).padStart(5)}   dark ${v.darkMed.toFixed(1).padStart(5)}   ratio ${(v.darkMed / v.litMed).toFixed(3)}`);
  }
  console.log(`\n   per-band ratio at cut 90 (blank = no dark px in band)`);
  {
    const v = r.value[1];
    const line = v.band.map((k, b) => (k.dark > 0 && k.lit > 0 ? `${(b / 20).toFixed(2)}:${(k.dark / k.lit).toFixed(2)}` : null)).filter(Boolean);
    for (let i = 0; i < line.length; i += 5) console.log(`     ` + line.slice(i, i + 5).join('   '));
  }

  console.log(`\n  EDGE SHARPNESS — px to fall from 90% of lit to 110% of dark`);
  console.log(`   n=${r.edge.n}  p25=${r.edge.p25}  median=${r.edge.med}  p75=${r.edge.p75}   median as fraction of figure height = ${(r.edge.medFracH * 100).toFixed(3)}%`);

  console.log(`\n  MATERIAL RATIO — median luma of a box, and that box / the chest plate box`);
  console.log(`  (front/back plates only; an A-pose is assumed, so the side view's row is noise)`);
  console.log(`   region           n     med     R     G     B    /chest`);
  const ref = r.mat.chestPlate.med;
  for (const [k, v] of Object.entries(r.mat)) {
    console.log(`   ${k.padEnd(13)} ${String(v.n).padStart(5)}  ${v.med.toFixed(1).padStart(6)}` +
      ` ${v.r.toFixed(0).padStart(5)} ${v.g.toFixed(0).padStart(5)} ${v.b.toFixed(0).padStart(5)}` +
      `  ${(v.med / ref).toFixed(3).padStart(7)}`);
  }
  return r;
};

for (const f of files) await measure(f);
await browser.close();
