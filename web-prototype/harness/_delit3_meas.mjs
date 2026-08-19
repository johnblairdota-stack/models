#!/usr/bin/env node
/**
 * MEASUREMENT for the de-lit art. Three modes, all on figure-bbox fractions so they apply
 * unchanged to the source and to any output (delit.mjs guard G4 pins the bbox to the pixel).
 *
 *   node harness/_delit3_meas.mjs profile <img> [<img> ...]   luminance ACROSS a limb
 *   node harness/_delit3_meas.mjs region  <img> [<img> ...]   median value per material region
 *   node harness/_delit3_meas.mjs panel   <img> [<img> ...]   panel-line / seam density census
 *
 * ⚠️ measure.mjs and overlay.mjs are NOT usable for this job: they segment the contact shadow as
 * figure mass, and removing that shadow is one of the things being done here.
 *
 * WHY PROFILE IS THE TEST FOR "THE LIGHTING IS GONE". The art is lit by a key from the upper
 * left, so every limb ramps dark across its width. A limb is a near-cylinder of ONE material, so
 * any monotone ramp across it is illumination by construction — there is no material explanation
 * for it. The number reported is the total ramp in luma units across the limb's interior from a
 * least-squares line fit, and the CONTROL is `spread`, the p95-p05 of the same pixels: a ramp
 * that falls while spread stays up means the gradient died and the detail lived, which is the
 * whole objective. A ramp that falls because spread collapsed is failure dressed as success.
 *
 * Runs are found per row rather than at hardcoded x, because a fixed x fraction lands on arm in
 * one image and background in another.
 */
import path from 'node:path';
import { toDataURL, openCanvasPage } from './imglib.mjs';

const mode = process.argv[2];
const files = process.argv.slice(3);
if (!['profile', 'region', 'panel'].includes(mode) || !files.length) {
  console.error('usage: node _delit3_meas.mjs profile|region|panel <img> [<img> ...]');
  process.exit(1);
}

/** Limb bands: a height fraction, and which figure run in that row to take. */
const LIMBS = {
  upperArmL: { yFrac: [0.30, 0.38], run: 'first' },
  upperArmR: { yFrac: [0.30, 0.38], run: 'last' },
  forearmL: { yFrac: [0.46, 0.54], run: 'first' },
  thighL: { yFrac: [0.60, 0.68], run: 'first' },
  thighR: { yFrac: [0.60, 0.68], run: 'last' },
  shinL: { yFrac: [0.80, 0.87], run: 'first' },
};

/** Material boxes, [x0,y0,x1,y1] as fractions of the figure bbox. chest2 is THE CONTROL. */
const BOXES = {
  shellChest: [0.44, 0.26, 0.56, 0.32],
  shellChest2: [0.44, 0.33, 0.56, 0.37],
  shellForearm: [0.19, 0.45, 0.26, 0.55],
  shellShin: [0.36, 0.76, 0.43, 0.84],
  chromeUpperArm: [0.22, 0.31, 0.29, 0.40],
  chromeWaist: [0.42, 0.42, 0.58, 0.46],
  mintCapL: [0.245, 0.235, 0.315, 0.275],
  mintCapR: [0.685, 0.235, 0.755, 0.275],
  visor: [0.43, 0.075, 0.57, 0.145],
};

/** Panel-census bands: height fraction, plus outer (arms) vs core (torso/legs) column split. */
const BANDS = {
  head: [0.00, 0.20], chest: [0.20, 0.40], pelvis: [0.40, 0.56],
  thigh: [0.56, 0.72], knee: [0.70, 0.80], shin: [0.78, 0.92], foot: [0.92, 1.00],
};

const { browser, page } = await openCanvasPage();

const load = async (file) => {
  const url = await toDataURL(file);
  return page.evaluate(async ({ url, mode, LIMBS, BOXES, BANDS }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const W = img.width, H = img.height;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    const N = W * H;
    const lum = new Float32Array(N);
    for (let p = 0; p < N; p++) {
      const i = p * 4;
      lum[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    }

    /*
     * FIGURE MASK. The source art is a hard matte on pure white, so a border flood fill on
     * luma>=254 is exact. A delit.mjs output is a hard matte on a FLAT background colour, so the
     * same flood on "equals the corner colour" is exact too. One code path covers both: flood
     * from the border over pixels matching the corner pixel's RGBA within a tolerance of 2.
     */
    const cor = [d[0], d[1], d[2], d[3]];
    const isBgCol = (p) => {
      const i = p * 4;
      return Math.abs(d[i] - cor[0]) <= 2 && Math.abs(d[i + 1] - cor[1]) <= 2 &&
             Math.abs(d[i + 2] - cor[2]) <= 2 && Math.abs(d[i + 3] - cor[3]) <= 2;
    };
    const bg = new Uint8Array(N);
    const st = [];
    for (let x = 0; x < W; x++) { st.push(x); st.push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { st.push(y * W); st.push(y * W + W - 1); }
    while (st.length) {
      const p = st.pop();
      if (bg[p] || !isBgCol(p)) continue;
      bg[p] = 1;
      const x = p % W, y = (p / W) | 0;
      if (x > 0) st.push(p - 1);
      if (x < W - 1) st.push(p + 1);
      if (y > 0) st.push(p - W);
      if (y < H - 1) st.push(p + W);
    }
    /*
     * Interior regions that are exactly the background colour must be judged by SIZE, and getting
     * this wrong invalidated the first profile table this script produced. The sealed leg-gap
     * pocket really is background (~21000 px). But in the SOURCE art the background colour is
     * pure white and so is every clipped specular hotspot INSIDE the figure (largest component
     * ~1019 px) — excluding those as "background" punched holes in the arms, split each row into
     * short runs, and reported the upper arm as 40 px wide against 79 px in the de-lit output.
     * The two populations are two orders of magnitude apart, so any cut in 1500..5000 separates
     * them; `--poolCut` exists so that plateau can be demonstrated rather than asserted.
     */
    const POOL_CUT = 2000;
    const interior = new Uint8Array(N);
    {
      const seen = new Uint8Array(N);
      for (let p0 = 0; p0 < N; p0++) {
        if (seen[p0] || bg[p0] || !isBgCol(p0)) continue;
        const comp = []; const st2 = [p0]; seen[p0] = 1;
        while (st2.length) {
          const p = st2.pop(); comp.push(p);
          const x = p % W, y = (p / W) | 0;
          const nb = [];
          if (x > 0) nb.push(p - 1);
          if (x < W - 1) nb.push(p + 1);
          if (y > 0) nb.push(p - W);
          if (y < H - 1) nb.push(p + W);
          for (const qq of nb) { if (seen[qq] || bg[qq] || !isBgCol(qq)) continue; seen[qq] = 1; st2.push(qq); }
        }
        if (comp.length >= POOL_CUT) for (const p of comp) interior[p] = 1;
      }
    }
    const fig = new Uint8Array(N);
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let p = 0; p < N; p++) {
      if (bg[p] || interior[p]) continue;
      fig[p] = 1;
      const x = p % W, y = (p / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const fw = x1 - x0 + 1, fh = y1 - y0 + 1;
    const q = (a, f) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * f))] : NaN);

    const out = { W, H, box: [x0, y0, x1, y1], fw, fh };

    if (mode === 'profile') {
      out.limbs = {};
      for (const [name, spec] of Object.entries(LIMBS)) {
        const yA = Math.round(y0 + spec.yFrac[0] * fh), yB = Math.round(y0 + spec.yFrac[1] * fh);
        // Average the profile over the band's rows, resampled to a common 0..1 across the run.
        const NS = 40;
        const acc = new Float64Array(NS), cnt = new Float64Array(NS);
        let widths = [], all = [];
        for (let y = yA; y <= yB; y++) {
          // figure runs in this row
          const runs = [];
          let s = -1;
          for (let x = x0; x <= x1 + 1; x++) {
            const on = x <= x1 && fig[y * W + x];
            if (on && s < 0) s = x;
            if (!on && s >= 0) { if (x - s >= 8) runs.push([s, x - 1]); s = -1; }
          }
          if (!runs.length) continue;
          const run = spec.run === 'first' ? runs[0] : runs[runs.length - 1];
          const [ra, rb] = run, rw = rb - ra + 1;
          widths.push(rw);
          for (let x = ra; x <= rb; x++) {
            const t = (x - ra) / Math.max(1, rw - 1);
            const k = Math.min(NS - 1, Math.floor(t * NS));
            acc[k] += lum[y * W + x]; cnt[k]++;
            all.push(lum[y * W + x]);
          }
        }
        const prof = [];
        for (let k = 0; k < NS; k++) prof.push(cnt[k] ? acc[k] / cnt[k] : NaN);
        /*
         * Least-squares line over the INTERIOR 25%..75% only. At 15%..85% the fit was still
         * catching the dark silhouette rim, which is a material/occlusion edge and not
         * illumination: the forearm then reported a ramp of ~98 luma that did not move at ANY
         * correction radius, because the number was measuring the rim rather than the gradient.
         */
        const kA = Math.round(NS * 0.25), kB = Math.round(NS * 0.75);
        let sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
        for (let k = kA; k < kB; k++) {
          if (!Number.isFinite(prof[k])) continue;
          const t = k / (NS - 1);
          sx += t; sy += prof[k]; sxx += t * t; sxy += t * prof[k]; n++;
        }
        const slope = n > 1 ? (n * sxy - sx * sy) / (n * sxx - sx * sx) : NaN;
        // ramp = luma change across the measured interior span
        const ramp = slope * ((kB - 1) / (NS - 1) - kA / (NS - 1));
        all.sort((a, b) => a - b);
        out.limbs[name] = {
          rows: widths.length, meanW: widths.reduce((a, b) => a + b, 0) / Math.max(1, widths.length),
          ramp, spread: q(all, 0.95) - q(all, 0.05), med: q(all, 0.5), prof,
        };
      }
    }

    if (mode === 'region') {
      out.regions = {};
      for (const [k, b] of Object.entries(BOXES)) {
        const L = [], rb = [], gb = [];
        for (let y = Math.round(y0 + b[1] * fh); y < Math.round(y0 + b[3] * fh); y++) {
          for (let x = Math.round(x0 + b[0] * fw); x < Math.round(x0 + b[2] * fw); x++) {
            const p = y * W + x;
            if (!fig[p]) continue;
            const i = p * 4;
            L.push(lum[p]); rb.push(d[i] - d[i + 2]); gb.push(d[i + 1] - d[i + 2]);
          }
        }
        L.sort((a, b2) => a - b2); rb.sort((a, b2) => a - b2); gb.sort((a, b2) => a - b2);
        out.regions[k] = { n: L.length, med: q(L, 0.5), p05: q(L, 0.05), p95: q(L, 0.95), rb: q(rb, 0.5), gb: q(gb, 0.5) };
      }
    }

    if (mode === 'panel') {
      out.bands = {};
      for (const [bname, [a, b]] of Object.entries(BANDS)) {
        const yA = Math.round(y0 + a * fh), yB = Math.round(y0 + b * fh);
        for (const part of ['outer', 'core']) {
          const px = [];
          for (let y = yA; y < yB; y++) {
            for (let x = x0; x <= x1; x++) {
              const p = y * W + x;
              if (!fig[p]) continue;
              const xf = (x - x0) / fw;
              const isOuter = xf < 0.30 || xf > 0.70;
              if ((part === 'outer') !== isOuter) continue;
              px.push(p);
            }
          }
          const key = `${bname}.${part}`;
          if (px.length < 400) { out.bands[key] = null; continue; }
          /*
           * SEAM DENSITY: fraction of pixels sitting at least `dep` below the median of a 9x9
           * ring of figure pixels around them — a LOCAL trough, which is what a panel gap looks
           * like at any exposure. Local, not global, because a globally paler image would
           * otherwise report zero seams for that reason alone.
           */
          const seam = {};
          for (const dep of [6, 10, 16, 24]) {
            let n = 0, tot = 0;
            for (const p of px) {
              const x = p % W, y = (p / W) | 0;
              if (x < 5 || x > W - 6 || y < 5 || y > H - 6) continue;
              let s = 0, cc = 0;
              for (let dy = -4; dy <= 4; dy += 2) for (let dx = -4; dx <= 4; dx += 2) {
                const qq = (y + dy) * W + (x + dx);
                if (!fig[qq]) continue;
                s += lum[qq]; cc++;
              }
              if (cc < 12) continue;
              tot++;
              if (lum[p] < s / cc - dep) n++;
            }
            seam[dep] = tot ? n / tot : null;
          }
          // gradient magnitude percentiles (Sobel-lite), interior only
          const gm = [];
          for (const p of px) {
            const x = p % W, y = (p / W) | 0;
            if (!fig[p - 1] || !fig[p + 1] || !fig[p - W] || !fig[p + W]) continue;
            const gx = lum[p + 1] - lum[p - 1], gy = lum[p + W] - lum[p - W];
            gm.push(Math.hypot(gx, gy));
          }
          gm.sort((u, v) => u - v);
          out.bands[key] = { n: px.length, seam, gm50: q(gm, 0.5), gm90: q(gm, 0.9), gm99: q(gm, 0.99) };
        }
      }
    }
    return out;
  }, { url, mode, LIMBS, BOXES, BANDS });
};

const R = {};
for (const f of files) R[f] = await load(f);
await browser.close();

const nm = (f) => path.basename(f).replace(/\.png$/, '');
const short = (f) => {
  const parts = f.split(/[\\/]/);
  return `${parts[parts.length - 2]}/${nm(f)}`;
};

if (mode === 'profile') {
  for (const limb of Object.keys(LIMBS)) {
    console.log(`\n=== ${limb} ===`);
    console.log('  image                              width   ramp(luma)   spread(p95-p05)   median');
    for (const f of files) {
      const L = R[f].limbs[limb];
      console.log(`  ${short(f).padEnd(34)} ${L.meanW.toFixed(0).padStart(5)} ${L.ramp.toFixed(1).padStart(12)} ${L.spread.toFixed(1).padStart(17)} ${L.med.toFixed(1).padStart(8)}`);
    }
    // Profile over the INTERIOR only (25%..75%), the same span the ramp is fitted on, so the
    // printed numbers and the quoted ramp describe the same pixels.
    console.log('  profile across the limb INTERIOR (25%..75% of width), left->right:');
    for (const f of files) {
      const p = R[f].limbs[limb].prof;
      const s = [];
      for (let k = 10; k <= 30; k += 3) s.push(Number.isFinite(p[k]) ? p[k].toFixed(0).padStart(5) : '   --');
      console.log(`    ${short(f).padEnd(34)}${s.join('')}`);
    }
  }
}

if (mode === 'region') {
  const keys = Object.keys(BOXES);
  console.log('\n  region                ' + files.map((f) => short(f).slice(-22).padStart(23)).join(''));
  for (const k of keys) {
    console.log(`  ${k.padEnd(20)}` + files.map((f) => {
      const r = R[f].regions[k];
      return `${r.med.toFixed(1)} (${r.p05.toFixed(0)}-${r.p95.toFixed(0)})`.padStart(23);
    }).join(''));
  }
  console.log('\n  shellChest2 is THE CONTROL: a second box on the same plate as shellChest.');
  console.log('  It must track shellChest closely in every column, or the boxes are not where this script thinks.');
  for (const f of files) {
    const a = R[f].regions.shellChest.med, b = R[f].regions.shellChest2.med;
    console.log(`    ${short(f).padEnd(34)} chest ${a.toFixed(1)}  chest2 ${b.toFixed(1)}  ratio ${(b / a).toFixed(3)}`);
  }
  console.log('\n  material STEPS (ratio to shellChest), the thing that either survives or does not:');
  for (const f of files) {
    const g = R[f].regions, base = g.shellChest.med;
    console.log(`    ${short(f).padEnd(34)} chrome/shell ${(g.chromeUpperArm.med / base).toFixed(3)}  waist/shell ${(g.chromeWaist.med / base).toFixed(3)}  mintL/shell ${(g.mintCapL.med / base).toFixed(3)}  visor/shell ${(g.visor.med / base).toFixed(3)}`);
  }
  console.log('\n  CHROMA, median R-B and G-B per region (identity survives only if these hold):');
  for (const f of files) {
    const g = R[f].regions;
    console.log(`    ${short(f).padEnd(34)} mintL ${g.mintCapL.rb.toFixed(0)}/${g.mintCapL.gb.toFixed(0)}  visor ${g.visor.rb.toFixed(0)}/${g.visor.gb.toFixed(0)}  chest ${g.shellChest.rb.toFixed(0)}/${g.shellChest.gb.toFixed(0)}`);
  }
}

if (mode === 'panel') {
  const keys = Object.keys(R[files[0]].bands);
  console.log('\n  SEAM DENSITY (% of pixels in a local dark trough) at trough depth 10, and gradient p90.');
  console.log('  band              ' + files.map((f) => short(f).slice(-20).padStart(21)).join(''));
  for (const k of keys) {
    const row = files.map((f) => {
      const b = R[f].bands[k];
      if (!b) return '        (too few px)'.padStart(21);
      return `${(b.seam[10] * 100).toFixed(2)}%  g90 ${b.gm90.toFixed(1)}`.padStart(21);
    });
    console.log(`  ${k.padEnd(18)}` + row.join(''));
  }
  console.log('\n  full trough-depth sweep, first image only — a claim is only quotable where depths agree:');
  console.log('  band                 @6      @10     @16     @24    gm50   gm90   gm99');
  for (const k of keys) {
    const b = R[files[0]].bands[k];
    if (!b) { console.log(`  ${k.padEnd(18)} (too few px)`); continue; }
    console.log(`  ${k.padEnd(18)}` + [6, 10, 16, 24].map((dd) => `${(b.seam[dd] * 100).toFixed(2)}%`.padStart(8)).join('') +
      `${b.gm50.toFixed(1).padStart(7)}${b.gm90.toFixed(1).padStart(7)}${b.gm99.toFixed(1).padStart(7)}`);
  }
}
