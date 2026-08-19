#!/usr/bin/env node
/**
 * SEGMENTATION PROBE. The background is pure white 255 with no alpha, so the figure mask has to
 * be cut out of RGB, and the CONTACT SHADOW is grey-on-white sitting right against the soles.
 * The one way this whole job goes wrong is a mask that either (a) keeps the shadow, so the
 * illumination blur averages it in and the shadow survives into the output, or (b) is so
 * aggressive it eats the near-black soles.
 *
 * So: measure the actual value separation. Fine histogram at the top end, the darkest value
 * anywhere in the shadow band, and a luminance/chroma grid through the foot-and-shadow zone.
 */
import { toDataURL, openCanvasPage } from './imglib.mjs';

const FILES = [
  ['front', 'assets/mv/player/baseline_front.png'],
  ['side-left', 'assets/mv/player/baseline_side-left.png'],
  ['side-right', 'assets/mv/player/baseline_side-right.png'],
  ['back', 'assets/mv/player/baseline_back.png'],
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
    const chr = new Float32Array(W * H);
    for (let p = 0; p < W * H; p++) {
      const i = p * 4;
      lum[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      chr[p] = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
    }

    // fine histogram of the top end
    const fine = {};
    for (let v = 230; v <= 255; v++) fine[v] = 0;
    for (let p = 0; p < W * H; p++) {
      const v = Math.round(lum[p]);
      if (v >= 230) fine[v] = (fine[v] || 0) + 1;
    }

    // bbox of "not page" at several cuts, to see how the figure box grows as the cut loosens
    const boxes = {};
    for (const cut of [254, 250, 245, 240, 235, 230, 220, 200]) {
      let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1, n = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (lum[y * W + x] >= cut) continue;
        n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      boxes[cut] = { n, box: [x0, y0, x1, y1], w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }

    // Rows: for each row in the bottom 15% of the loose box, min luma and count below cuts.
    const loose = boxes[254].box;
    const rows = [];
    const yStart = Math.round(loose[1] + (loose[3] - loose[1]) * 0.84);
    for (let y = yStart; y <= loose[3]; y += 4) {
      let minL = 255, n254 = 0, n230 = 0, n200 = 0, n150 = 0, n100 = 0, maxChr = 0;
      for (let x = 0; x < W; x++) {
        const p = y * W + x, L = lum[p];
        if (L < 254) n254++;
        if (L < 230) n230++;
        if (L < 200) n200++;
        if (L < 150) n150++;
        if (L < 100) n100++;
        if (L < minL) minL = L;
        if (L < 250 && chr[p] > maxChr) maxChr = chr[p];
      }
      rows.push({ y, minL: +minL.toFixed(0), n254, n230, n200, n150, n100, maxChr: +maxChr.toFixed(0) });
    }
    return { W, H, fine, boxes, rows };
  }, { url });

  console.log(`\n===== ${label} =====`);
  console.log('  fine top-end histogram:');
  const fl = Object.entries(r.fine).filter(([, n]) => n > 0).map(([v, n]) => `${v}:${n}`);
  console.log('    ' + fl.join('  '));
  console.log('  bbox growth by luma cut:');
  for (const [cut, b] of Object.entries(r.boxes)) {
    console.log(`    <${String(cut).padStart(3)}  n=${String(b.n).padStart(7)}  box=${b.box.join(',').padEnd(20)} w=${b.w} h=${b.h}`);
  }
  console.log('  bottom-band rows (y, minLuma, count<254/<230/<200/<150/<100, maxChroma of non-page):');
  for (const q of r.rows) {
    console.log(`    y=${q.y}  min=${String(q.minL).padStart(3)}  ${String(q.n254).padStart(4)}/${String(q.n230).padStart(4)}/${String(q.n200).padStart(4)}/${String(q.n150).padStart(4)}/${String(q.n100).padStart(4)}   chr=${q.maxChr}`);
  }
}

await browser.close();
