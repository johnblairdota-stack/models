#!/usr/bin/env node
/**
 * STAGE-BY-STAGE EROSION DIAGNOSTIC for harness/delit.mjs.
 *
 * John's Meshy generation came back with "a gap in the head and structure between the feet".
 * The cause is in OUR de-lit output: background grey is showing THROUGH the figure. This script
 * measures WHICH LABELLING STAGE removes each lost pixel, rather than guessing from the picture.
 *
 * It replicates delit.mjs's segmentation exactly (PAGE flood / SHADOW / POCKET / FIGURE) and then
 * asks two independent questions the shipping tool never asked:
 *
 *   1. PAGE-FLOOD INTRUSION. The border flood on luma>=254 is supposed to return the page. But the
 *      source's blown speculars reach 255, and where one touches the silhouette edge the flood
 *      walks straight through it into the figure. Measured as a morphological CLOSING of the
 *      figure mask: any pixel the closing fills was a notch the flood chewed, not real page.
 *   2. SHADOW EATING THE BOOTS. A genuine contact-shadow pixel lies ON THE FLOOR, so nothing of
 *      the figure is below it in its column. A boot pixel wrongly labelled shadow has the rest of
 *      the boot below it. Reported as a histogram of "figure pixels below, in column".
 *      (delit.mjs's header rejected vertical support ABOVE a shadow pixel as a guard, correctly —
 *      genuine shadow tucked under a boot has the whole leg above it. BELOW is the other
 *      direction and it is not symmetric.)
 *
 * Also reports the narrowest genuine page gap (arm-to-torso etc.) so a closing radius chosen to
 * repair notches can be shown NOT to bridge a real gap.
 *
 *   node harness/_delit6_stage.mjs [--dump <dir>]
 */
import path from 'node:path';
import { writeFile, mkdir } from 'node:fs/promises';
import { toDataURL, openCanvasPage, ROOT } from './imglib.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const dumpDir = arg('dump', null);

const VIEWS = {
  front: 'assets/mv/player/baseline_front.png',
  'side-left': 'assets/mv/player/baseline_side-left.png',
  'side-right': 'assets/mv/player/baseline_side-right.png',
  back: 'assets/mv/player/baseline_back.png',
};
const O = { shadowCut: 185, shadowMinPx: 200, shadowGroundFrac: 0.93 };

const WORKER = async ({ url, O }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const W = img.width, H = img.height, N = W * H;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g2 = cv.getContext('2d', { willReadFrequently: true });
  g2.drawImage(img, 0, 0);
  const d = g2.getImageData(0, 0, W, H).data;
  const lum = new Float32Array(N);
  for (let p = 0; p < N; p++) { const i = p * 4; lum[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; }

  const nbrs = (p) => {
    const x = p % W, y = (p / W) | 0, a = [];
    if (x > 0) a.push(p - 1); if (x < W - 1) a.push(p + 1);
    if (y > 0) a.push(p - W); if (y < H - 1) a.push(p + W);
    return a;
  };

  // ---- PAGE (exactly delit.mjs)
  const isPage = new Uint8Array(N);
  {
    const st = [];
    for (let x = 0; x < W; x++) { st.push(x); st.push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { st.push(y * W); st.push(y * W + W - 1); }
    while (st.length) {
      const p = st.pop();
      if (isPage[p] || lum[p] < 254) continue;
      isPage[p] = 1;
      for (const q of nbrs(p)) st.push(q);
    }
  }
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x; if (isPage[p]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const fh = y1 - y0 + 1;

  // ---- SHADOW (exactly delit.mjs, default settings)
  const yGround = Math.round(y0 + O.shadowGroundFrac * fh);
  const isShadow = new Uint8Array(N);
  {
    const seen = new Uint8Array(N);
    const cand = (p) => !isPage[p] && ((p / W) | 0) >= yGround && lum[p] >= O.shadowCut && lum[p] < 254;
    for (let y = yGround; y <= y1; y++) for (let x = Math.max(0, x0 - 2); x <= Math.min(W - 1, x1 + 2); x++) {
      const p0 = y * W + x;
      if (seen[p0] || !cand(p0)) continue;
      const comp = []; let touchesPage = false;
      const st = [p0]; seen[p0] = 1;
      while (st.length) {
        const p = st.pop(); comp.push(p);
        for (const q of nbrs(p)) {
          if (isPage[q]) { touchesPage = true; continue; }
          if (seen[q] || !cand(q)) continue;
          seen[q] = 1; st.push(q);
        }
      }
      if (touchesPage && comp.length >= O.shadowMinPx) for (const p of comp) isShadow[p] = 1;
    }
  }

  // ---- POCKET (exactly delit.mjs)
  const isPocket = new Uint8Array(N);
  {
    const seen = new Uint8Array(N);
    for (let p0 = 0; p0 < N; p0++) {
      if (seen[p0] || isPage[p0] || lum[p0] < 254) continue;
      const comp = []; let touchesShadow = false;
      const st = [p0]; seen[p0] = 1;
      while (st.length) {
        const p = st.pop(); comp.push(p);
        for (const q of nbrs(p)) {
          if (isShadow[q]) { touchesShadow = true; continue; }
          if (seen[q] || isPage[q] || lum[q] < 254) continue;
          seen[q] = 1; st.push(q);
        }
      }
      if (touchesShadow) for (const p of comp) isPocket[p] = 1;
    }
  }

  const isFig = new Uint8Array(N);
  let nFig = 0;
  for (let p = 0; p < N; p++) { if (!isPage[p] && !isShadow[p] && !isPocket[p]) { isFig[p] = 1; nFig++; } }

  // ================================ Q1: page-flood intrusion, via closing of the figure mask
  // Chebyshev-distance closing: dilate by r then erode by r, both on the raw non-page mask.
  const nonPage = new Uint8Array(N);
  for (let p = 0; p < N; p++) nonPage[p] = isPage[p] ? 0 : 1;
  const dilate = (m, r) => {
    // separable max filter
    const a = new Uint8Array(N), b = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 0;
      for (let k = -r; k <= r; k++) { const xx = x + k; if (xx < 0 || xx >= W) continue; if (m[y * W + xx]) { v = 1; break; } }
      a[y * W + x] = v;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 0;
      for (let k = -r; k <= r; k++) { const yy = y + k; if (yy < 0 || yy >= H) continue; if (a[yy * W + x]) { v = 1; break; } }
      b[y * W + x] = v;
    }
    return b;
  };
  const erode = (m, r) => { const inv = new Uint8Array(N); for (let p = 0; p < N; p++) inv[p] = m[p] ? 0 : 1; const dd = dilate(inv, r); const o = new Uint8Array(N); for (let p = 0; p < N; p++) o[p] = dd[p] ? 0 : 1; return o; };
  const closing = {};
  for (const r of [1, 2, 3, 4, 6]) {
    const c = erode(dilate(nonPage, r), r);
    let filled = 0, filledClipped = 0;
    for (let p = 0; p < N; p++) if (c[p] && !nonPage[p]) { filled++; if (lum[p] >= 254) filledClipped++; }
    closing[r] = { filled, filledClipped };
  }

  // ================================ Q2: shadow with figure BELOW it in the same column
  const belowHist = {};
  let shadowWithFigBelow = 0, nShadow = 0, maxBelow = 0;
  const figBelowOf = new Int32Array(N).fill(-1);
  for (let x = 0; x < W; x++) {
    // running count of figure pixels below, within bbox rows
    let run = 0;
    for (let y = Math.min(H - 1, y1); y >= 0; y--) {
      const p = y * W + x;
      figBelowOf[p] = run;
      if (isFig[p]) run++;
    }
  }
  for (let p = 0; p < N; p++) {
    if (!isShadow[p]) continue;
    nShadow++;
    const b = figBelowOf[p];
    if (b > 0) shadowWithFigBelow++;
    if (b > maxBelow) maxBelow = b;
    const k = b === 0 ? '0' : b <= 2 ? '1-2' : b <= 5 ? '3-5' : b <= 10 ? '6-10' : b <= 25 ? '11-25' : b <= 60 ? '26-60' : '60+';
    belowHist[k] = (belowHist[k] || 0) + 1;
  }

  // ================================ narrowest genuine page gap inside the bbox
  // For each page pixel inside the bbox, distance to the nearest non-page pixel is 1 by
  // definition at the boundary; what matters is the WIDTH of page channels. Measure as: the
  // largest r for which erode(page,r) is still non-empty inside the bbox, per connected page
  // channel. Cheap proxy: count page pixels inside bbox that survive erosion at each r.
  const pageIn = new Uint8Array(N);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const p = y * W + x; if (isPage[p]) pageIn[p] = 1; }
  const pageErode = {};
  for (const r of [1, 2, 3, 4, 6]) { const e = erode(pageIn, r); let n = 0; for (let p = 0; p < N; p++) if (e[p]) n++; pageErode[r] = n; }

  // ================================ dump: removal map
  const map = g2.createImageData(W, H);
  for (let p = 0; p < N; p++) {
    const i = p * 4; map.data[i + 3] = 255;
    if (isShadow[p]) { const bad = figBelowOf[p] > 0; map.data[i] = bad ? 255 : 90; map.data[i + 1] = bad ? 0 : 0; map.data[i + 2] = bad ? 0 : 160; }
    else if (isPocket[p]) { map.data[i] = 40; map.data[i + 1] = 90; map.data[i + 2] = 255; }
    else if (isPage[p]) { map.data[i] = 255; map.data[i + 1] = 255; map.data[i + 2] = 255; }
    else { const v = Math.round(lum[p] * 0.5); map.data[i] = v; map.data[i + 1] = v; map.data[i + 2] = v; }
  }
  // overlay closing-r3 intrusion in green
  {
    const c = erode(dilate(nonPage, 3), 3);
    for (let p = 0; p < N; p++) if (c[p] && !nonPage[p]) { const i = p * 4; map.data[i] = 0; map.data[i + 1] = 230; map.data[i + 2] = 0; }
  }
  g2.putImageData(map, 0, 0);
  const mapPng = cv.toDataURL('image/png');

  return { W, H, bbox: [x0, y0, x1, y1], fh, yGround, nFig, nShadow, shadowWithFigBelow, maxBelow, belowHist, closing, pageErode, mapPng };
};

const { browser, page } = await openCanvasPage();
try {
  for (const [v, rel] of Object.entries(VIEWS)) {
    const r = await page.evaluate(WORKER, { url: await toDataURL(rel), O });
    console.log(`\n=== ${v} ===  bbox ${r.bbox.join(',')}  figure height ${r.fh}  ground band starts y=${r.yGround}`);
    console.log(`  labelled: figure ${r.nFig}   shadow ${r.nShadow}`);
    console.log(`  Q2 SHADOW WITH FIGURE BELOW IT IN-COLUMN: ${r.shadowWithFigBelow} px (${(100 * r.shadowWithFigBelow / Math.max(1, r.nShadow)).toFixed(1)}% of shadow), deepest ${r.maxBelow} px of figure underneath`);
    console.log(`     histogram (figure px below -> count): ${Object.entries(r.belowHist).map(([k, n]) => `${k}:${n}`).join('  ')}`);
    console.log(`  Q1 PAGE-FLOOD INTRUSION (pixels a closing of the figure mask fills back in):`);
    for (const [rr, o] of Object.entries(r.closing)) console.log(`     r=${rr}: ${o.filled} px filled, of which ${o.filledClipped} are clipped-white (blown specular the flood walked through)`);
    console.log(`  page channels inside bbox surviving erosion (how wide the genuine page gaps are):`);
    console.log(`     ${Object.entries(r.pageErode).map(([rr, n]) => `r=${rr}:${n}`).join('  ')}`);
    if (dumpDir) {
      const dir = path.isAbsolute(dumpDir) ? dumpDir : path.join(ROOT, dumpDir);
      await mkdir(dir, { recursive: true });
      const f = path.join(dir, `${v}.stage.png`);
      await writeFile(f, Buffer.from(r.mapPng.split(',')[1], 'base64'));
      console.log(`  wrote ${f}`);
    }
  }
} finally { await browser.close(); }
