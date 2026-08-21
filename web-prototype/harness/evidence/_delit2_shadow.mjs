#!/usr/bin/env node
/**
 * Can the contact shadow be separated from the boot by VALUE, given that the two touch?
 *
 * The page is exactly 255 and nothing exists in 231..254, so "figure OR shadow" is an exact
 * region (flood fill the 255 page from the border, take the complement). The only open question
 * is the second cut: within that region, does the shadow occupy a value band the boot does not?
 *
 * Prints, for the ground band of each view:
 *   - luma along rows through the shadow, so the shadow's band is visible directly
 *   - the value histogram of the region ABOVE the ground band (pure figure, no shadow) versus
 *     the extra pixels the ground band adds (figure + shadow)
 */
import { toDataURL, openCanvasPage } from '../imglib.mjs';

const FILES = [
  ['front', 'assets/mv/player/baseline_front.png'],
  ['back', 'assets/mv/player/baseline_back.png'],
  ['side-left', 'assets/mv/player/baseline_side-left.png'],
];

const { browser, page } = await openCanvasPage();

for (const [label, f] of FILES) {
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
    const lum = new Float32Array(W * H);
    for (let p = 0; p < W * H; p++) {
      const i = p * 4;
      lum[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    }

    // EXACT page mask: flood fill 4-connected from the border over pixels with luma>=254.
    const isPage = new Uint8Array(W * H);
    const stack = [];
    for (let x = 0; x < W; x++) { stack.push(x); stack.push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { stack.push(y * W); stack.push(y * W + W - 1); }
    while (stack.length) {
      const p = stack.pop();
      if (isPage[p] || lum[p] < 254) continue;
      isPage[p] = 1;
      const x = p % W, y = (p / W) | 0;
      if (x > 0) stack.push(p - 1);
      if (x < W - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - W);
      if (y < H - 1) stack.push(p + W);
    }
    let nPage = 0, nEnclosedWhite = 0;
    for (let p = 0; p < W * H; p++) {
      if (isPage[p]) nPage++;
      else if (lum[p] >= 254) nEnclosedWhite++;   // blown speculars INSIDE the figure
    }

    // bbox of the non-page region
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (isPage[p]) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const fh = y1 - y0 + 1;

    // rows through the ground band, printing runs of luma so the shadow band is visible
    const rowScans = [];
    for (const fr of [0.955, 0.968, 0.980, 0.992]) {
      const y = Math.round(y0 + fr * fh);
      const vals = [];
      for (let x = x0 - 6; x <= x1 + 6; x += 6) {
        const p = y * W + x;
        vals.push(isPage[p] ? '..' : String(Math.round(lum[p])).padStart(3));
      }
      rowScans.push({ y, fr, s: vals.join(' ') });
    }

    // histograms: figure-only band (above 0.90 of height) vs ground band (0.945..1.0)
    const hist = (yA, yB) => {
      const h = new Array(26).fill(0);
      let n = 0;
      for (let y = yA; y <= yB; y++) for (let x = x0; x <= x1; x++) {
        const p = y * W + x;
        if (isPage[p]) continue;
        h[Math.min(25, Math.floor(lum[p] / 10))]++; n++;
      }
      return { h, n };
    };
    const above = hist(y0, Math.round(y0 + 0.90 * fh));
    const ground = hist(Math.round(y0 + 0.945 * fh), y1);
    return { W, H, nPage, nEnclosedWhite, box: [x0, y0, x1, y1], fh, rowScans, above, ground };
  }, { url });

  console.log(`\n===== ${label} =====`);
  console.log(`  page px (flood, luma>=254) = ${r.nPage};  luma>=254 pixels NOT reachable from the border (blown specular inside the figure) = ${r.nEnclosedWhite}`);
  console.log(`  non-page bbox ${r.box.join(',')}  figure height ${r.fh}`);
  console.log('  ground-band row scans (".." = page):');
  for (const s of r.rowScans) console.log(`   y=${s.y} (${s.fr.toFixed(3)}H): ${s.s}`);
  const fmt = (o) => o.h.map((n, i) => (n ? `${i * 10}-${i * 10 + 9}:${(100 * n / o.n).toFixed(1)}%` : null)).filter(Boolean).join(' ');
  console.log(`  hist of non-page, top 90% of figure (n=${r.above.n}):\n    ${fmt(r.above)}`);
  console.log(`  hist of non-page, ground band 0.945-1.0H (n=${r.ground.n}):\n    ${fmt(r.ground)}`);
}

await browser.close();
