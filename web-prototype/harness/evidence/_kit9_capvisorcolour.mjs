#!/usr/bin/env node
/**
 * MINT-CAP COVERAGE and VISOR-GLASS CONTRAST — art vs render.
 *
 *   node harness/evidence/_kit9_capvisorcolour.mjs <render.png>
 *
 * WHAT IS ALREADY SETTLED, AND WHY THIS IS STILL NEEDED. `_kit7_artratio.mjs` established that
 * the cap BAND lands at the right height (1.1814–1.3170 vs the art's 1.1815–1.3141) and that
 * visor/head silhouette is 0.760 against the art's 0.726–0.767 plateau. Both are POSITION
 * measurements. Neither says how much of the shoulder the cap actually COVERS, nor how dark the
 * visor glass reads — and a cap can sit in exactly the right band while being a third of the
 * area, which is what the eye actually reads at gameplay distance.
 *
 * So: AREA and COLOUR, the two quantities _kit7 does not touch.
 *
 *   1. CAP COVERAGE — mint pixels as a fraction of figure-bounding-box area, and mint pixel
 *      count normalised by figure height squared (scale-free).
 *   2. CAP COLOUR   — mean RGB and HSV saturation of the mint, which decides whether it reads
 *      as the art's greyed sage or as a cleaner cyan-green.
 *   3. VISOR CONTRAST — mean luma of the glass against the mean luma of the BEZEL RING
 *      immediately around it. This is the number that decides whether the face reads as a dark
 *      tinted window (art) or as a pale panel barely separated from the white shell (suspected).
 *      Absolute luma is not usable on its own because the two images are exposed differently;
 *      the RATIO and the DIFFERENCE against the adjacent bezel are.
 *
 * ⚠️ SWEPT, per John's rule 1. The mint mask, the visor mask and the bezel ring width are each
 * swept and the table prints every setting so a disagreement is visible instead of averaged away.
 */
import path from 'node:path';
import { toDataURL, openCanvasPage } from '../imglib.mjs';

const renderArg = process.argv[2];
const ART = 'assets/mv/player/baseline_front.png';

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

    const bgp = [d[idx(2, 2)], d[idx(2, 2) + 1], d[idx(2, 2) + 2]];
    const isChroma = (r0, g0, b0) => r0 > 150 && b0 > 150 && g0 < 110;
    const chromaShot = isChroma(bgp[0], bgp[1], bgp[2]);

    const fig = new Uint8Array(W * H);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        let on;
        if (chromaShot) on = d[i + 3] > 40 && !isChroma(d[i], d[i + 1], d[i + 2]);
        else on = d[i + 3] > 40 && (Math.abs(d[i] - bgp[0]) + Math.abs(d[i + 1] - bgp[1]) + Math.abs(d[i + 2] - bgp[2]) > 24);
        if (!on) continue;
        fig[y * W + x] = 1;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    const figH = y1 - y0 + 1, figW = x1 - x0 + 1;
    const L = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

    const out = { figW, figH, x0, x1, y0, y1, chromaShot, mint: {}, visor: {} };

    // ---- MINT CAPS. Green must exceed red and blue. Sweep how strongly.
    for (const cut of [8, 14, 22, 30]) {
      let n = 0, sr = 0, sg = 0, sb = 0, mnY = 1e9, mxY = -1e9;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const p = y * W + x; if (!fig[p]) continue;
          const i = p * 4;
          if (!(d[i + 1] - d[i] > cut * 0.5 && d[i + 1] - d[i + 2] > cut * 0.2)) continue;
          n++; sr += d[i]; sg += d[i + 1]; sb += d[i + 2];
          if (y < mnY) mnY = y; if (y > mxY) mxY = y;
        }
      }
      if (!n) { out.mint[cut] = null; continue; }
      const [mr, mg, mb] = [sr / n, sg / n, sb / n];
      const mx = Math.max(mr, mg, mb), mn = Math.min(mr, mg, mb);
      out.mint[cut] = {
        n,
        // Scale-free coverage: mint pixels per (figure height)^2, x1000 for readability.
        cov: (n / (figH * figH)) * 1000,
        covBox: n / (figW * figH),
        r: mr, g: mg, b: mb,
        sat: mx > 0 ? (mx - mn) / mx : 0,
        luma: 0.2126 * mr + 0.7152 * mg + 0.0722 * mb,
        yTop: (mnY - y0) / figH, yBot: (mxY - y0) / figH,
      };
    }

    // ---- VISOR GLASS vs BEZEL. Restrict to the head band so the chest mark cannot enter.
    const headCut = y0 + figH * 0.24;
    for (const cut of [20, 40, 60] ) {
      const on = [];
      let vx0 = 1e9, vx1 = -1e9, vy0 = 1e9, vy1 = -1e9;
      for (let y = y0; y < headCut; y++) {
        for (let x = x0; x <= x1; x++) {
          const p = y * W + x; if (!fig[p]) continue;
          const i = p * 4;
          if (!(d[i + 2] - d[i] > cut && d[i + 2] - d[i + 1] > cut * 0.25)) continue;
          on.push(p);
          if (x < vx0) vx0 = x; if (x > vx1) vx1 = x;
          if (y < vy0) vy0 = y; if (y > vy1) vy1 = y;
        }
      }
      if (on.length < 200) { out.visor[cut] = null; continue; }
      const glassL = on.reduce((a, p) => a + L(p * 4), 0) / on.length;
      const set = new Set(on);
      // BEZEL RING: figure pixels just outside the visor box, swept over ring width. This is
      // the white shell immediately framing the glass — the local reference the eye uses.
      const ring = {};
      for (const rw of [6, 12, 20]) {
        let n = 0, s = 0;
        for (let y = vy0 - rw; y <= vy1 + rw; y++) {
          for (let x = vx0 - rw; x <= vx1 + rw; x++) {
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            const p = y * W + x; if (!fig[p] || set.has(p)) continue;
            const inner = x >= vx0 && x <= vx1 && y >= vy0 && y <= vy1;
            if (inner) continue;
            const i = p * 4;
            // Exclude anything chromatic so the ear discs' tint cannot skew the white reference.
            const mx = Math.max(d[i], d[i + 1], d[i + 2]), mn = Math.min(d[i], d[i + 1], d[i + 2]);
            if (mx - mn > 30) continue;
            n++; s += L(i);
          }
        }
        ring[rw] = n > 50 ? { n, luma: s / n } : null;
      }
      out.visor[cut] = { n: on.length, glassL, w: vx1 - vx0 + 1, h: vy1 - vy0 + 1, ring };
    }
    return out;
  }, { url });

  console.log(`\n  ===== ${label} =====  ${path.basename(file)}`);
  console.log(`  figure ${r.figW} x ${r.figH}   (chroma shot: ${r.chromaShot})`);
  console.log('\n  MINT CAPS');
  console.log('   cut      n   cov(px/H^2 x1e3)  ofBox%   meanRGB          sat    luma   yTop   yBot');
  for (const [cut, m] of Object.entries(r.mint)) {
    if (!m) { console.log(`   ${String(cut).padStart(3)}  (none)`); continue; }
    console.log(`   ${String(cut).padStart(3)} ${String(m.n).padStart(6)}   ${m.cov.toFixed(2).padStart(8)}      ` +
      `${(m.covBox * 100).toFixed(2).padStart(5)}%  ${m.r.toFixed(0).padStart(3)},${m.g.toFixed(0).padStart(3)},${m.b.toFixed(0).padStart(3)}` +
      `   ${m.sat.toFixed(3)}  ${m.luma.toFixed(1).padStart(5)}  ${m.yTop.toFixed(3)}  ${m.yBot.toFixed(3)}`);
  }
  console.log('\n  VISOR GLASS vs BEZEL RING');
  console.log('   cut   glassLuma  size      bezel@6   @12    @20   | contrast(bezel12-glass)  ratio');
  for (const [cut, v] of Object.entries(r.visor)) {
    if (!v) { console.log(`   ${String(cut).padStart(3)}  (none)`); continue; }
    const b = (rw) => (v.ring[rw] ? v.ring[rw].luma.toFixed(1).padStart(6) : '    --');
    const b12 = v.ring[12]?.luma;
    console.log(`   ${String(cut).padStart(3)}   ${v.glassL.toFixed(1).padStart(7)}  ${String(v.w).padStart(3)}x${String(v.h).padStart(3)}` +
      `   ${b(6)}${b(12)}${b(20)}  |  ${b12 != null ? (b12 - v.glassL).toFixed(1).padStart(8) : '      --'}` +
      `            ${b12 != null ? (v.glassL / b12).toFixed(3) : '--'}`);
  }
  return r;
};

await measure(ART, 'ART — baseline_front');
if (renderArg) await measure(renderArg, 'OUR RENDER');

await browser.close();
console.log('');
