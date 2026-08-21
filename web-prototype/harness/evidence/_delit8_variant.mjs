#!/usr/bin/env node
/**
 * Recover the SHARPEN STRENGTH of an existing de-lit PNG, so the `soft/` variant can be
 * regenerated to match. Its original invocation was never recorded anywhere in the repo.
 *
 * The discriminator is how hard the local-contrast step drove the dark side of edges: it reports
 * the share of figure pixels below a few luma cuts, which rises steeply with --sharpDark.
 *
 *   node harness/evidence/_delit8_variant.mjs <a.png> <b.png> ...
 */
import { toDataURL, openCanvasPage } from '../imglib.mjs';

const files = process.argv.slice(2);
const { browser, page } = await openCanvasPage();
try {
  for (const f of files) {
    const r = await page.evaluate(async ({ url }) => {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const cv = document.createElement('canvas');
      cv.width = img.width; cv.height = img.height;
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, img.width, img.height).data;
      const N = img.width * img.height;
      let fig = 0; const cuts = [5, 10, 20, 40, 80]; const n = cuts.map(() => 0);
      let sum = 0;
      for (let p = 0; p < N; p++) {
        const i = p * 4;
        const R = d[i], G = d[i + 1], B = d[i + 2];
        if (R === 128 && G === 128 && B === 128) continue;          // flat grey backdrop
        const L = 0.2126 * R + 0.7152 * G + 0.0722 * B;
        fig++; sum += L;
        for (let k = 0; k < cuts.length; k++) if (L < cuts[k]) n[k]++;
      }
      return { fig, mean: sum / fig, cuts, n };
    }, { url: await toDataURL(f) });
    console.log(`${f}\n   figure ${r.fig}px  mean luma ${r.mean.toFixed(1)}   share below ` +
      r.cuts.map((c, k) => `${c}:${(100 * r.n[k] / r.fig).toFixed(2)}%`).join('  '));
  }
} finally { await browser.close(); }
