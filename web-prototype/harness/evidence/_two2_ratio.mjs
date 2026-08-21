#!/usr/bin/env node
/**
 * HOW DARK IS THE DARK MATERIAL, ON THE RENDER — selected by the mask, not by a box.
 *
 *   node harness/evidence/_two2_ratio.mjs <mask_debug5.png> <beauty.png> [beauty.png ...]
 *
 * WHY NOT BOXES. `_two1_regionmap.mjs` samples the ART with figure-normalised boxes, which is
 * fine on a front-on A-pose plate. The RENDER is a posed, three-quarter-turned character, so
 * the same boxes land on the wrong parts and the number they return is confident nonsense.
 *
 * So the region selector is the mask itself: shoot `?weather=debug5`, which paints
 * vec3(vRRWDark, rrwDarkM, rrwHeadClean), then read the GREEN channel of that capture as
 * "this pixel is the dark structural material" and compare the SAME pixels in the beauty
 * capture. Both are shot at the same view, clip, pose and sim time, so they are pixel-aligned.
 *
 * The comparison is median dark-material luma / median white-plate luma, against the art's
 * measured 0.60-0.68 (`_two1_regionmap.mjs`, arms and abdomen, front and back plates).
 *
 * Thresholds are swept, per rule 1: the debug channel goes through the post chain's tonemap
 * and grade, so the value that arrives is NOT the value the shader wrote, and a single
 * threshold would be a guess about a transfer curve nobody has characterised.
 */
import { toDataURL, openCanvasPage } from '../imglib.mjs';

const [maskFile, ...beauties] = process.argv.slice(2);
if (!maskFile || !beauties.length) {
  console.error('usage: _two2_ratio.mjs <mask_debug5.png> <beauty.png> [more.png ...]');
  process.exit(1);
}

const { browser, page } = await openCanvasPage();

/*
 * BOTH images are decoded INSIDE the page and never cross the bridge. A 1920x1080 frame is
 * 8.3M RGBA bytes, and handing that to node as a plain JS Array — which is what
 * `Array.from(imageData.data)` produces — is roughly 500 MB of boxed numbers per image. Doing
 * that once per sweep entry walked straight into "Ineffective mark-compacts near heap limit"
 * three images in, after printing three perfectly plausible rows. Only the summary crosses.
 */
const maskUrl = await toDataURL(maskFile);
console.log(`mask: ${maskFile.split(/[\\/]/).pop()}`);

for (const bf of beauties) {
  const beautyUrl = await toDataURL(bf);
  const r = await page.evaluate(async ({ maskUrl, beautyUrl }) => {
    const pixels = async (url) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      return { d: g.getImageData(0, 0, c.width, c.height).data, W: c.width, H: c.height };
    };
    const m = await pixels(maskUrl), b = await pixels(beautyUrl);
    if (m.W !== b.W || m.H !== b.H) return { mismatch: true };
    const md = m.d, bd = b.d, W = m.W, H = m.H;
    const isChroma = (r0, g0, b0) => r0 > 150 && b0 > 150 && g0 < 110;
    const med = (a) => { if (!a.length) return NaN; a.sort((x, y) => x - y); return a[(a.length / 2) | 0]; };
    const out = [];
    for (const [dHi, dLo] of [[100, 40], [140, 30], [200, 15]]) {
      const dark = [], plate = [];
      for (let p = 0; p < W * H; p++) {
        const i = p * 4;
        if (bd[i + 3] <= 40 || isChroma(bd[i], bd[i + 1], bd[i + 2])) continue;
        // neutral shell only — the visor, the mint caps and the wordmark are other materials
        const mx = Math.max(bd[i], bd[i + 1], bd[i + 2]), mn = Math.min(bd[i], bd[i + 1], bd[i + 2]);
        if (mx - mn >= 30) continue;
        const L = 0.2126 * bd[i] + 0.7152 * bd[i + 1] + 0.0722 * bd[i + 2];
        if (md[i + 2] > 60) continue;         // head — judged by the head mask, not this one
        const G = md[i + 1];
        if (G >= dHi) dark.push(L);
        else if (G <= dLo) plate.push(L);     // the band between is the material EDGE, excluded
      }
      const dm = med(dark), pm = med(plate);
      out.push({ dHi, dLo, nDark: dark.length, nPlate: plate.length, dm, pm, ratio: dm / pm });
    }
    return { out };
  }, { maskUrl, beautyUrl });

  console.log(`\n  ${bf.split(/[\\/]/).pop()}`);
  if (r.mismatch) { console.log('   SIZE MISMATCH with mask — skipped'); continue; }
  console.log(`   maskCut   nDark  nPlate    darkMed  plateMed   ratio   (ART = 0.60-0.68)`);
  for (const s of r.out) {
    console.log(`   >${String(s.dHi).padStart(3)}/<${String(s.dLo).padStart(2)}  ${String(s.nDark).padStart(6)}  ${String(s.nPlate).padStart(6)}` +
      `   ${s.dm.toFixed(1).padStart(7)}  ${s.pm.toFixed(1).padStart(8)}  ${s.ratio.toFixed(3).padStart(6)}`);
  }
}
await browser.close();
