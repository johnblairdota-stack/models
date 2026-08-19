#!/usr/bin/env node
/**
 * SILHOUETTE EDGE SCAN. A bright white rim appeared just inside the figure outline in every
 * corrected output, visible against the grey background and invisible against the source's white
 * page. This prints the actual luma values across that edge so the cause is measured rather than
 * guessed: if the source's outermost figure pixels are already a bright rim highlight, the gain
 * is lifting them to near-white; if they are not, the pipeline is manufacturing the rim.
 *
 *   node harness/_delit4_edge.mjs <y> <img> [<img> ...]
 */
import path from 'node:path';
import { toDataURL, openCanvasPage } from './imglib.mjs';

const y = Number(process.argv[2]);
const files = process.argv.slice(3);
const { browser, page } = await openCanvasPage();

for (const f of files) {
  const url = await toDataURL(f);
  const r = await page.evaluate(async ({ url, y }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const W = img.width, H = img.height;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    const L = (x) => { const i = (y * W + x) * 4; return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; };
    const cor = [d[0], d[1], d[2]];
    const isBg = (x) => {
      const i = (y * W + x) * 4;
      return Math.abs(d[i] - cor[0]) <= 2 && Math.abs(d[i + 1] - cor[1]) <= 2 && Math.abs(d[i + 2] - cor[2]) <= 2;
    };
    // first non-background x scanning right from the frame edge
    let e = -1;
    for (let x = 1; x < W; x++) if (!isBg(x)) { e = x; break; }
    const vals = [];
    for (let k = -3; k <= 22; k++) vals.push(e + k >= 0 && e + k < W ? Math.round(L(e + k)) : -1);
    return { corner: cor, edgeX: e, vals };
  }, { url, y });
  const parts = f.split(/[\\/]/);
  console.log(`  ${(parts[parts.length - 2] + '/' + path.basename(f)).padEnd(30)} bg=${r.corner.join(',')} edge@x=${r.edgeX}`);
  console.log(`      x-3..x+22: ${r.vals.map((v) => String(v).padStart(4)).join('')}`);
}
await browser.close();
