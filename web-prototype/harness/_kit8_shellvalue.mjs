#!/usr/bin/env node
/**
 * SHELL VALUE, PANEL-SEAM DENSITY AND FACETING — art vs render.
 *
 *   node harness/_kit8_shellvalue.mjs <render.png>
 *
 * WHY THIS EXISTS. `_kit7_artratio.mjs` measures where the kit's FEATURES sit — visor/head,
 * cap band, head width — and every one of those now passes. The character still does not read
 * as the art. So the failure is not in the feature placement, it is in the SURFACE: the art is
 * brushed metal carrying dark panel seams and deep ambient occlusion, and the render is a matte
 * near-white with neither. This probe measures that difference instead of asserting it.
 *
 * Three quantities, all restricted to the NEUTRAL SHELL (the mint caps, the visor and the chest
 * mark are chromatic and would drag every statistic):
 *
 *   1. VALUE SPREAD   — luma percentiles over the shell. "No value range" is p95-p5.
 *   2. SEAM DENSITY   — fraction of shell pixels sitting in a local dark trough, i.e. a panel
 *                       line or an occluded gap. This is the graphic language of the art.
 *   3. FACET ENERGY   — mean |second difference| of luma along a row. A machined surface is a
 *                       smooth gradient (low); a flat-shaded triangle mosaic is piecewise-linear
 *                       with hard creases at every shared edge (high, and spiky).
 *
 * ⚠️ EVERY CUT IS SWEPT, per John's rule 1. A single neutrality cut or a single trough depth
 * prints a complete and plausible table that is wrong. Values are only quotable where they agree
 * across settings; the sweep columns are printed so disagreement is visible rather than hidden.
 *
 * ⚠️ SCALE. Seam density and facet energy are per-pixel quantities, so the two figures must be
 * compared at a matched figure height. The script prints both heights and rejects the comparison
 * if they differ by more than 8%.
 */
import path from 'node:path';
import { toDataURL, openCanvasPage } from './imglib.mjs';

const renderArg = process.argv[2];
/*
 * ⚠️ THE REFERENCE IS AN ARGUMENT NOW, AND THE DEFAULT IS STILL THE FRONT so every number this
 * file has ever printed still means what it meant. It was hardcoded to the front elevation, which
 * silently made the whole probe blind to any BACK-facing feature: the round that added the chrome
 * calf panel and the waist flexion ridges measured them as EXACTLY ZERO on every column of every
 * cut — correctly, because neither is visible from the front — and a reader would have read that
 * table as "the feature does nothing" rather than "the instrument is pointed the other way".
 *
 *   node harness/_kit8_shellvalue.mjs <render.png> [reference.png]
 *
 * The four references are assets/mv/player/baseline_{front,side-left,side-right,back}.png, which
 * is the same set `docs/design/player-material-spec.md` requires every comparison to ship.
 */
const ART = process.argv[3] ?? 'assets/mv/player/baseline_front.png';

const { browser, page } = await openCanvasPage();

const measure = async (file, label) => {
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

    // Same figure mask as _kit7_artratio: chroma shot -> "not chroma"; art -> alpha + off-paper.
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
    for (let p = 0; p < W * H; p++) {
      const i = p * 4;
      luma[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    }
    // Chromatic strength, used to exclude mint / visor / wordmark from the "shell".
    const chroma = new Float32Array(W * H);
    for (let p = 0; p < W * H; p++) {
      const i = p * 4;
      const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
      chroma[p] = mx - mn;
    }

    // Regions, as fractions of figure height below the crown. Torso and legs are judged
    // separately because the art's seam language is densest on the legs and a whole-figure
    // average would let the smooth torso mask it.
    const bands = {
      whole: [0.00, 1.00],
      head: [0.00, 0.20],
      torso: [0.20, 0.50],
      legs: [0.50, 0.95],
    };

    const out = { figW, figH, x0, x1, y0, y1, chromaShot, regions: {} };

    for (const [rname, [a, b]] of Object.entries(bands)) {
      const yA = Math.round(y0 + figH * a), yB = Math.round(y0 + figH * b);
      out.regions[rname] = { neutral: {} };
      // SWEEP the neutrality cut: how chromatic a pixel may be and still count as "shell".
      /*
       * nc=999 admits EVERY figure pixel, chromatic ones included. It exists for the HEAD band,
       * where the visor glass is the whole point and excluding it as "chromatic" would measure
       * only the white bezel. It is the one setting with no free colour parameter at all, so a
       * head-band result that holds at 999 is not a threshold artefact — which matters, because
       * `_kit9_capvisorcolour.mjs`'s blue-cut visor mask did NOT agree across its own sweep.
       */
      for (const nc of [12, 20, 30, 45, 999]) {
        const px = [];
        for (let y = yA; y < yB; y++) {
          for (let x = x0; x <= x1; x++) {
            const p = y * W + x;
            if (!fig[p] || chroma[p] > nc) continue;
            px.push(p);
          }
        }
        if (px.length < 500) { out.regions[rname].neutral[nc] = null; continue; }
        const vals = px.map((p) => luma[p]).sort((u, v) => u - v);
        const pc = (q) => vals[Math.min(vals.length - 1, Math.floor(q * vals.length))];

        // SEAM DENSITY. A pixel is "seam" when it is at least `dep` darker than the median of
        // a 9x9 ring around it — a local trough, which is what a panel gap or an occluded
        // crease looks like regardless of the overall exposure of the image. Using a LOCAL
        // reference rather than a global threshold is essential: the render is globally paler,
        // and a global dark threshold would report zero seams for that reason alone rather
        // than because the seams are absent.
        const seam = {};
        for (const dep of [8, 14, 20, 28]) {
          let n = 0;
          for (const p of px) {
            const x = p % W, y = (p / W) | 0;
            if (x < 5 || x > W - 6 || y < 5 || y > H - 6) continue;
            let sum = 0, cnt = 0;
            for (let dy = -4; dy <= 4; dy += 2) {
              for (let dx = -4; dx <= 4; dx += 2) {
                const q = (y + dy) * W + (x + dx);
                if (!fig[q]) continue;
                sum += luma[q]; cnt++;
              }
            }
            if (cnt < 12) continue;
            if (luma[p] < sum / cnt - dep) n++;
          }
          seam[dep] = n / px.length;
        }

        // FACET ENERGY. |L(x-2) - 2L(x) + L(x+2)| along rows, over interior shell pixels.
        // A smooth machined gradient is near-linear locally (low); a flat-shaded triangle
        // mosaic has a crease at every shared edge (high).
        let fsum = 0, fcnt = 0, fspike = 0;
        for (const p of px) {
          const x = p % W, y = (p / W) | 0;
          if (x < x0 + 3 || x > x1 - 3) continue;
          const pm = y * W + (x - 2), pp = y * W + (x + 2);
          if (!fig[pm] || !fig[pp]) continue;
          const dd = Math.abs(luma[pm] - 2 * luma[p] + luma[pp]);
          fsum += dd; fcnt++;
          if (dd > 6) fspike++;
        }

        out.regions[rname].neutral[nc] = {
          n: px.length,
          p01: pc(0.01), p05: pc(0.05), p25: pc(0.25), p50: pc(0.50),
          p75: pc(0.75), p95: pc(0.95), p99: pc(0.99),
          spread: pc(0.95) - pc(0.05),
          darkFrac90: vals.filter((v) => v < 90).length / vals.length,
          darkFrac120: vals.filter((v) => v < 120).length / vals.length,
          seam,
          facet: fcnt ? fsum / fcnt : null,
          facetSpike: fcnt ? fspike / fcnt : null,
        };
      }
    }
    return out;
  }, { url });

  console.log(`\n  ===== ${label} =====  ${path.basename(file)}`);
  console.log(`  figure ${r.figW} x ${r.figH} px   (chroma shot: ${r.chromaShot})`);
  for (const [rname, rr] of Object.entries(r.regions)) {
    console.log(`\n  -- ${rname} --`);
    console.log('   neutCut     n     p05   p50   p95  spread  dark<90  dark<120 | seam@8  @14   @20   @28  | facet  spike');
    for (const [nc, s] of Object.entries(rr.neutral)) {
      if (!s) { console.log(`   ${String(nc).padStart(6)}  (too few pixels)`); continue; }
      const f = (v, w = 5, dp = 1) => (v == null ? '  --' : v.toFixed(dp).padStart(w));
      const pctf = (v) => (v * 100).toFixed(2).padStart(6);
      console.log(`   ${String(nc).padStart(6)} ${String(s.n).padStart(7)} ${f(s.p05)} ${f(s.p50)} ${f(s.p95)} ${f(s.spread)}  ` +
        `${pctf(s.darkFrac90)}%  ${pctf(s.darkFrac120)}% | ${pctf(s.seam[8])}${pctf(s.seam[14])}${pctf(s.seam[20])}${pctf(s.seam[28])} | ` +
        `${f(s.facet, 5, 2)}  ${pctf(s.facetSpike)}%`);
    }
  }
  return r;
};

const art = await measure(ART, `ART — ${ART.split(/[\\/]/).pop().replace(/\.png$/, '')}`);
if (renderArg) {
  const ren = await measure(renderArg, 'OUR RENDER');
  const ratio = ren.figH / art.figH;
  console.log(`\n  figure-height ratio render/art = ${ratio.toFixed(3)}` +
    (Math.abs(ratio - 1) > 0.08
      ? '   ⚠️ OVER 8% — per-pixel seam/facet numbers are NOT comparable at this scale gap'
      : '   ok — within 8%, per-pixel numbers are comparable'));
}

await browser.close();
console.log('');
