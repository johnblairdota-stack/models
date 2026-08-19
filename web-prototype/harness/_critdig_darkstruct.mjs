#!/usr/bin/env node
/**
 * DARK-PIXEL STRUCTURE and SHELL WARMTH — art vs render.
 *
 *   node harness/_critdig_darkstruct.mjs <render.png>
 *
 * WHY. `_kit8_shellvalue.mjs` proved the render can hit the art's dark FRACTION (10-14% below
 * luma 90) while looking nothing like it. A fraction is a histogram statistic and it is blind to
 * WHERE the dark pixels sit. In the art the darks are a small number of long continuous channels
 * — the gaps between armour plates. In the render they are suspected to be thousands of small
 * scattered blobs — facet creases and grime. Same fraction, opposite structure.
 *
 * So this measures the SHAPE of the dark set, not its size:
 *
 *   1. COMPONENTS   — connected components of the dark mask. Count, normalised per 1000 dark px.
 *   2. CONCENTRATION— fraction of all dark area living in the 10 largest components. Channels
 *                     between plates are few and long, so the art should concentrate; scattered
 *                     crease noise should not.
 *   3. ELONGATION   — area-weighted mean of (bbox long side / short side). A channel is long and
 *                     thin; a facet crease blob is stubby.
 *   4. WARMTH       — mean R-B and R-G over LIT neutral shell. Decides cream/champagne vs grey.
 *
 * Mask is copied verbatim from `_kit8_shellvalue.mjs` (chroma shot -> "not chroma"; art -> alpha
 * plus off-paper) so the two scripts segment identically and their numbers are comparable.
 *
 * EVERY CUT IS SWEPT, per John's rule 1 — the dark cut, and the lit cut for warmth.
 */
import { toDataURL, openCanvasPage } from './imglib.mjs';

const renderArg = process.argv[2];
if (!renderArg) { console.error('usage: _critdig_darkstruct.mjs <render.png>'); process.exit(1); }
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

    // --- mask, verbatim from _kit8_shellvalue.mjs ---
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

    // Restrict to the TORSO+LEGS band (0.20 - 0.95 H). The head is judged separately by kit8 and
    // the visor would dominate any dark-structure count in the head band.
    const yA = Math.round(y0 + figH * 0.20), yB = Math.round(y0 + figH * 0.95);
    const inBand = (p) => { const y = (p / W) | 0; return y >= yA && y < yB; };

    const out = { figW, figH, chromaShot, dark: [], warm: [] };

    // --- 1-3: dark-set structure, swept over the dark cut ---
    for (const cut of [70, 90, 110, 130]) {
      const dark = new Uint8Array(W * H);
      let nDark = 0;
      for (let p = 0; p < W * H; p++) {
        // neutral shell only (chroma < 30) so the visor / mint / wordmark cannot masquerade as
        // a panel gap; that exclusion matches kit8's neutCut=30 column.
        if (!fig[p] || !inBand(p) || chroma[p] >= 30) continue;
        if (luma[p] < cut) { dark[p] = 1; nDark++; }
      }
      // connected components, 4-connectivity, iterative stack
      const seen = new Uint8Array(W * H);
      const comps = [];
      const stack = new Int32Array(W * H);
      for (let p0 = 0; p0 < W * H; p0++) {
        if (!dark[p0] || seen[p0]) continue;
        let sp = 0; stack[sp++] = p0; seen[p0] = 1;
        let area = 0, cx0 = 1e9, cx1 = -1e9, cy0 = 1e9, cy1 = -1e9;
        while (sp > 0) {
          const p = stack[--sp];
          const x = p % W, y = (p / W) | 0;
          area++;
          if (x < cx0) cx0 = x; if (x > cx1) cx1 = x;
          if (y < cy0) cy0 = y; if (y > cy1) cy1 = y;
          if (x > 0 && dark[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
          if (x < W - 1 && dark[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
          if (y > 0 && dark[p - W] && !seen[p - W]) { seen[p - W] = 1; stack[sp++] = p - W; }
          if (y < H - 1 && dark[p + W] && !seen[p + W]) { seen[p + W] = 1; stack[sp++] = p + W; }
        }
        const bw = cx1 - cx0 + 1, bh = cy1 - cy0 + 1;
        comps.push({ area, elong: Math.max(bw, bh) / Math.max(1, Math.min(bw, bh)) });
      }
      comps.sort((a, b) => b.area - a.area);
      const top10 = comps.slice(0, 10).reduce((s, k) => s + k.area, 0);
      const wElong = comps.reduce((s, k) => s + k.elong * k.area, 0) / Math.max(1, nDark);
      const med = comps.length ? comps[(comps.length / 2) | 0].area : 0;
      out.dark.push({
        cut, nDark, nComp: comps.length,
        compPer1k: nDark ? (comps.length * 1000) / nDark : 0,
        top10frac: nDark ? top10 / nDark : 0,
        medArea: med, wElong,
        // scale-free: largest component as a multiple of figure height
        biggest: comps.length ? comps[0].area / figH : 0,
      });
    }

    // --- 4: warmth over LIT neutral shell, swept over the lit cut ---
    for (const lit of [140, 160, 180, 200]) {
      let n = 0, sr = 0, sg = 0, sb = 0;
      for (let p = 0; p < W * H; p++) {
        if (!fig[p] || !inBand(p) || chroma[p] >= 30) continue;
        if (luma[p] < lit) continue;
        const i = p * 4;
        n++; sr += d[i]; sg += d[i + 1]; sb += d[i + 2];
      }
      out.warm.push({ lit, n, r: sr / n, g: sg / n, b: sb / n, rmb: (sr - sb) / n, rmg: (sr - sg) / n });
    }
    return out;
  }, { url });

  console.log(`\n  ===== ${label} =====  ${file.split(/[\\/]/).pop()}`);
  console.log(`  figure ${r.figW} x ${r.figH} px   (chroma shot: ${r.chromaShot})   band 0.20-0.95 H, neutral shell only`);
  console.log(`\n  DARK-SET STRUCTURE`);
  console.log(`   cut    nDark   nComp  comp/1k-dark  top10%ofDark  medArea  wElong  biggest/H`);
  for (const s of r.dark) {
    console.log(`   ${String(s.cut).padStart(3)}  ${String(s.nDark).padStart(7)} ${String(s.nComp).padStart(7)}` +
      `  ${s.compPer1k.toFixed(1).padStart(11)}  ${(s.top10frac * 100).toFixed(1).padStart(11)}%` +
      `  ${String(s.medArea).padStart(7)}  ${s.wElong.toFixed(2).padStart(6)}  ${s.biggest.toFixed(2).padStart(9)}`);
  }
  console.log(`\n  LIT SHELL WARMTH`);
  console.log(`   lit      n        R      G      B      R-B     R-G`);
  for (const s of r.warm) {
    console.log(`   ${String(s.lit).padStart(3)}  ${String(s.n).padStart(7)}  ${s.r.toFixed(1).padStart(6)} ${s.g.toFixed(1).padStart(6)} ${s.b.toFixed(1).padStart(6)}` +
      `  ${s.rmb.toFixed(2).padStart(6)}  ${s.rmg.toFixed(2).padStart(6)}`);
  }
  return r;
};

await measure(ART, 'ART — baseline_front');
await measure(renderArg, 'OUR RENDER');
await browser.close();
