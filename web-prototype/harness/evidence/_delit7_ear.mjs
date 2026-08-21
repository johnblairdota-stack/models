#!/usr/bin/env node
/**
 * LOCATE AND MEASURE THE EAR RING in the two side views, source vs de-lit output.
 *
 * The ear is a chrome ring with a lighter disc centre and it SHOULD read as a recessed feature.
 * The question is whether harness/delit.mjs's local-contrast step crushes the ring's core to
 * near-black, at which point Meshy reads a through-hole instead of a recess — John's "gap in the
 * head". Measured, not eyeballed: this prints the ring's darkest percentiles in the source and in
 * the output, so "crushed" is a number.
 *
 * It finds the ring by its own darkness: the centroid of sub-cut pixels inside a generous search
 * box, then the radius profile of mean luma about that centroid.
 *
 *   node harness/evidence/_delit7_ear.mjs [--out <delit dir>]
 */
import { toDataURL, openCanvasPage } from '../imglib.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const outDir = arg('out', 'assets/mv/player/delit');

// Generous search boxes around the ear, read off the head crops. x,y,w,h at 1024.
const EAR_BOX = {
  'side-left': [515, 140, 85, 85],
  'side-right': [420, 140, 85, 85],
};

const WORKER = async ({ urlSrc, urlOut, box }) => {
  const load = async (u) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = u; });
    const cv = document.createElement('canvas');
    cv.width = img.width; cv.height = img.height;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, img.width, img.height).data;
    const L = new Float32Array(img.width * img.height);
    for (let p = 0; p < L.length; p++) { const i = p * 4; L[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; }
    return { W: img.width, H: img.height, L };
  };
  const S = await load(urlSrc), O = await load(urlOut);
  const [bx, by, bw, bh] = box;

  /*
   * The ring's centre, as the centroid of the LARGEST CONNECTED dark component in the box. A plain
   * centroid of "the darkest 12%" is pulled off-centre by whatever else is dark in the box (the
   * visor edge, the neck), and it was: it put side-left's centre 16 px left of the ring and the
   * radial profile came out scattered across 15..22 instead of a tight band.
   */
  const vals = [];
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) vals.push(S.L[y * S.W + x]);
  vals.sort((a, b) => a - b);
  const cut = vals[Math.floor(vals.length * 0.20)];
  const seen = new Uint8Array(S.W * S.H);
  let best = null;
  for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) {
    const p0 = y * S.W + x;
    if (seen[p0] || S.L[p0] > cut) continue;
    const comp = []; const st = [p0]; seen[p0] = 1;
    while (st.length) {
      const p = st.pop(); comp.push(p);
      const px = p % S.W, py = (p / S.W) | 0;
      for (const q of [px > bx ? p - 1 : -1, px < bx + bw - 1 ? p + 1 : -1, py > by ? p - S.W : -1, py < by + bh - 1 ? p + S.W : -1]) {
        if (q < 0 || seen[q] || S.L[q] > cut) continue;
        seen[q] = 1; st.push(q);
      }
    }
    if (!best || comp.length > best.length) best = comp;
  }
  let sx = 0, sy = 0;
  for (const p of best) { sx += p % S.W; sy += (p / S.W) | 0; }
  const cx = sx / best.length, cy = sy / best.length;
  let rmax = 0;
  for (const p of best) rmax = Math.max(rmax, Math.hypot((p % S.W) - cx, ((p / S.W) | 0) - cy));
  const n = best.length;

  // radial profile: mean and min luma per 1px radius bin, source and output
  const prof = [];
  for (let r = 0; r < 40; r++) {
    let ss = 0, sn = 0, smin = 999, os = 0, on = 0, omin = 999;
    const oLo = [], sLo = [];
    for (let y = Math.round(cy) - 42; y <= Math.round(cy) + 42; y++) {
      for (let x = Math.round(cx) - 42; x <= Math.round(cx) + 42; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < r || d >= r + 1) continue;
        const p = y * S.W + x;
        ss += S.L[p]; sn++; if (S.L[p] < smin) smin = S.L[p]; sLo.push(S.L[p]);
        os += O.L[p]; on++; if (O.L[p] < omin) omin = O.L[p]; oLo.push(O.L[p]);
      }
    }
    if (!sn) continue;
    prof.push({ r, srcMean: ss / sn, srcMin: smin, outMean: os / on, outMin: omin });
  }
  // ring band = radii where the SOURCE is darkest
  const ringR = prof.slice().sort((a, b) => a.srcMean - b.srcMean).slice(0, 6).map((o) => o.r).sort((a, b) => a - b);
  const inRing = (d) => d >= ringR[0] - 1 && d <= ringR[ringR.length - 1] + 1;
  const sVals = [], oVals = [];
  for (let y = Math.round(cy) - 42; y <= Math.round(cy) + 42; y++) {
    for (let x = Math.round(cx) - 42; x <= Math.round(cx) + 42; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (!inRing(d)) continue;
      const p = y * S.W + x;
      sVals.push(S.L[p]); oVals.push(O.L[p]);
    }
  }
  sVals.sort((a, b) => a - b); oVals.sort((a, b) => a - b);
  const pc = (a, f) => a[Math.floor(a.length * f)];
  let outUnder30 = 0, srcUnder30 = 0;
  for (const v of oVals) if (v < 30) outUnder30++;
  for (const v of sVals) if (v < 30) srcUnder30++;
  return {
    cx, cy, ringR, rmax, nComp: n,
    src: { p01: pc(sVals, 0.01), p05: pc(sVals, 0.05), p50: pc(sVals, 0.5), min: sVals[0], under30: srcUnder30 },
    out: { p01: pc(oVals, 0.01), p05: pc(oVals, 0.05), p50: pc(oVals, 0.5), min: oVals[0], under30: outUnder30 },
    nRing: sVals.length,
  };
};

const { browser, page } = await openCanvasPage();
try {
  for (const [v, box] of Object.entries(EAR_BOX)) {
    const r = await page.evaluate(WORKER, {
      urlSrc: await toDataURL(`assets/mv/player/baseline_${v}.png`),
      urlOut: await toDataURL(`${outDir}/${v}.png`),
      box,
    });
    console.log(`\n=== ${v} ===  ear centre (${r.cx.toFixed(1)}, ${r.cy.toFixed(1)}) outer radius ${r.rmax.toFixed(1)} from ${r.nComp}px component  ring radii ${r.ringR.join(",")}  ${r.nRing} px in ring band`);
    console.log(`  SOURCE ring luma:  min ${r.src.min.toFixed(1)}  p01 ${r.src.p01.toFixed(1)}  p05 ${r.src.p05.toFixed(1)}  median ${r.src.p50.toFixed(1)}   px under 30: ${r.src.under30}`);
    console.log(`  OUTPUT ring luma:  min ${r.out.min.toFixed(1)}  p01 ${r.out.p01.toFixed(1)}  p05 ${r.out.p05.toFixed(1)}  median ${r.out.p50.toFixed(1)}   px under 30: ${r.out.under30}`);
  }
} finally { await browser.close(); }
