#!/usr/bin/env node
/**
 * STRUCTURE PROBE for the four baseline art files, before any de-lighting is designed.
 *
 * The three things the de-lit tool's correctness depends on and that I refuse to guess:
 *   1. Is there an ALPHA channel, and does it separate the figure from the contact shadow?
 *      (If alpha is a clean figure matte, the shadow is background and dies with the background.
 *       If alpha is 255 everywhere, the shadow is composited into the RGB and must be segmented.)
 *   2. What is the BACKGROUND value, exactly, and is the figure edge antialiased against it?
 *   3. Where is the figure bbox, and what does the LUMINANCE histogram of the page look like
 *      versus the figure — i.e. is there a clean gap I can cut on, or do shadow and shell overlap?
 */
import { toDataURL, openCanvasPage } from './imglib.mjs';

const FILES = [
  'assets/mv/player/baseline_front.png',
  'assets/mv/player/baseline_side-left.png',
  'assets/mv/player/baseline_side-right.png',
  'assets/mv/player/baseline_back.png',
];

const { browser, page } = await openCanvasPage();

for (const f of FILES) {
  const url = await toDataURL(f);
  const r = await page.evaluate(async ({ url }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const W = c.width, H = c.height;
    const d = g.getImageData(0, 0, W, H).data;

    // --- alpha census
    const aHist = new Array(6).fill(0); // 0, 1-63, 64-127, 128-191, 192-254, 255
    for (let p = 0; p < W * H; p++) {
      const a = d[p * 4 + 3];
      if (a === 0) aHist[0]++;
      else if (a < 64) aHist[1]++;
      else if (a < 128) aHist[2]++;
      else if (a < 192) aHist[3]++;
      else if (a < 255) aHist[4]++;
      else aHist[5]++;
    }

    // --- corner samples
    const px = (x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2], d[i + 3]]; };
    const corners = { tl: px(2, 2), tr: px(W - 3, 2), bl: px(2, H - 3), br: px(W - 3, H - 3), midtop: px(W >> 1, 2) };

    // --- luminance over OPAQUE pixels only, and bbox of alpha>=250
    const lum = new Float32Array(W * H);
    for (let p = 0; p < W * H; p++) {
      const i = p * 4;
      lum[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    }
    let ax0 = 1e9, ax1 = -1, ay0 = 1e9, ay1 = -1, nOpaque = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (d[p * 4 + 3] < 250) continue;
      nOpaque++;
      if (x < ax0) ax0 = x; if (x > ax1) ax1 = x; if (y < ay0) ay0 = y; if (y > ay1) ay1 = y;
    }

    // bbox for "any alpha at all" (>=8) — if the shadow is in alpha this box is TALLER
    let bx0 = 1e9, bx1 = -1, by0 = 1e9, by1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (d[p * 4 + 3] < 8) continue;
      if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
    }

    // histogram of luminance over pixels with alpha>=250 (16 bins)
    const hist = new Array(16).fill(0);
    for (let p = 0; p < W * H; p++) {
      if (d[p * 4 + 3] < 250) continue;
      hist[Math.min(15, Math.floor(lum[p] / 16))]++;
    }

    // Does anything sit BELOW the deepest opaque row (i.e. shadow rendered into RGB)?
    // Scan rows below ay1 for any pixel darker than 250 luma.
    const belowRows = [];
    for (let y = ay1 + 1; y < H; y++) {
      let n = 0, minL = 255;
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (lum[p] < 250 && d[p * 4 + 3] > 8) { n++; if (lum[p] < minL) minL = lum[p]; }
      }
      if (n > 0) belowRows.push({ y, n, minL: +minL.toFixed(1) });
    }

    // A horizontal slice through the foot/shadow zone, sampled, to see the shadow profile
    const shadowRow = ay1 - 4;
    const slice = [];
    if (shadowRow > 0) {
      for (let x = 0; x < W; x += 24) {
        const p = shadowRow * W + x;
        slice.push([x, +lum[p].toFixed(0), d[p * 4 + 3]]);
      }
    }
    return {
      W, H, aHist, corners, nOpaque,
      opaqueBox: [ax0, ay0, ax1, ay1], anyAlphaBox: [bx0, by0, bx1, by1],
      hist, belowCount: belowRows.length,
      belowSample: belowRows.filter((_, i) => i % Math.max(1, Math.ceil(belowRows.length / 6)) === 0),
      shadowRow, slice,
    };
  }, { url });

  console.log(`\n===== ${f} =====`);
  console.log(`  ${r.W}x${r.H}   opaque px ${r.nOpaque}`);
  console.log(`  alpha census  a=0:${r.aHist[0]}  1-63:${r.aHist[1]}  64-127:${r.aHist[2]}  128-191:${r.aHist[3]}  192-254:${r.aHist[4]}  255:${r.aHist[5]}`);
  console.log(`  corners  tl=${r.corners.tl}  tr=${r.corners.tr}  bl=${r.corners.bl}  br=${r.corners.br}`);
  console.log(`  bbox alpha>=250 : ${r.opaqueBox.join(',')}   (w=${r.opaqueBox[2] - r.opaqueBox[0] + 1} h=${r.opaqueBox[3] - r.opaqueBox[1] + 1})`);
  console.log(`  bbox alpha>=8   : ${r.anyAlphaBox.join(',')}   (w=${r.anyAlphaBox[2] - r.anyAlphaBox[0] + 1} h=${r.anyAlphaBox[3] - r.anyAlphaBox[1] + 1})`);
  console.log(`  luma hist (opaque, bins of 16): ${r.hist.join(' ')}`);
  console.log(`  rows below deepest opaque row carrying non-white: ${r.belowCount}`);
  if (r.belowSample.length) console.log(`    sample: ${r.belowSample.map((b) => `y${b.y}:n${b.n}/min${b.minL}`).join('  ')}`);
  console.log(`  row y=${r.shadowRow} slice (x, luma, alpha): ${r.slice.map((s) => s.join('/')).join(' ')}`);
}

await browser.close();
