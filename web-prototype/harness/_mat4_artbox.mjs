#!/usr/bin/env node
/**
 * THE ART'S OWN PER-REGION VALUES, so the render has something to be compared TO.
 *
 *   node harness/_mat4_artbox.mjs [image]
 *
 * Boxes, not a shader mask — and that is a deliberate reversal of the rule
 * `_mat4_regions.mjs` follows. A box is unreliable on the RENDER because the render is posed
 * and animated, so a rectangle that lands on the forearm today lands on the hip tomorrow. The
 * art is a straight front elevation with the arms at the sides and it never moves, so on THIS
 * image a box is the honest instrument and a shader mask is unavailable anyway.
 *
 * Boxes are given as fractions of the FIGURE bounding box (found by cutting the white page out),
 * so they do not depend on the image resolution or on where the figure sits in the frame.
 *
 * ⚠️ WHAT THESE NUMBERS ARE AND ARE NOT. They are the art's VALUE RELATIONSHIPS — each region as
 * a ratio of the chest plate. They are not a target the render should be driven to by exposure:
 * nothing here is exposure-matched, which is exactly why every column is a ratio. And per
 * `docs/design/player-material-spec.md` they do not overrule the spec on WHICH MATERIAL goes
 * where — that document is the authority and it was written after these pixels.
 *
 * THE CONTROL is the `chest2` row: a second, disjoint box on the same chest plate. It is the
 * same material as `chest` by construction, so it must come back at a ratio near 1.0. If it does
 * not, the boxes are landing somewhere other than where this script thinks they are and no other
 * row means anything.
 */
import { toDataURL, openCanvasPage } from './imglib.mjs';

const file = process.argv[2] ?? 'assets/mv/player/baseline_front.png';

// [x0, y0, x1, y1] as fractions of the figure bbox. x is 0 at the figure's left edge.
const BOXES = {
  chest: [0.44, 0.26, 0.56, 0.32],
  chest2: [0.44, 0.33, 0.56, 0.37],   // THE CONTROL — same plate, different pixels
  forearm: [0.19, 0.45, 0.26, 0.55],
  hand: [0.17, 0.60, 0.24, 0.66],
  upperarm: [0.22, 0.31, 0.29, 0.40],
  waist: [0.42, 0.42, 0.58, 0.46],
  thighInner: [0.46, 0.55, 0.505, 0.66],
  thighOuter: [0.33, 0.55, 0.39, 0.66],
  shin: [0.36, 0.76, 0.43, 0.84],
  foot: [0.34, 0.88, 0.45, 0.93],
};

const { browser, page } = await openCanvasPage();
const url = await toDataURL(file);
const r = await page.evaluate(async ({ url, BOXES }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const W = c.width, H = c.height;
  const at = (x, y) => (y * W + x) * 4;
  const isFig = (i) => d[i + 3] >= 128 && !(d[i] > 244 && d[i + 1] > 244 && d[i + 2] > 244);

  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!isFig(at(x, y))) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const fw = x1 - x0, fh = y1 - y0;
  const out = {};
  for (const [k, b] of Object.entries(BOXES)) {
    const lum = [], rb = [];
    for (let y = Math.round(y0 + b[1] * fh); y < Math.round(y0 + b[3] * fh); y++) {
      for (let x = Math.round(x0 + b[0] * fw); x < Math.round(x0 + b[2] * fw); x++) {
        const i = at(x, y);
        if (!isFig(i)) continue;
        lum.push(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
        rb.push(d[i] - d[i + 2]);
      }
    }
    lum.sort((a, b2) => a - b2); rb.sort((a, b2) => a - b2);
    const q = (arr, f) => (arr.length ? arr[Math.floor(arr.length * f)] : NaN);
    out[k] = {
      px: lum.length, med: +q(lum, 0.5).toFixed(1),
      p05: +q(lum, 0.05).toFixed(1), p95: +q(lum, 0.95).toFixed(1), rb: +q(rb, 0.5).toFixed(1),
    };
  }
  return { fig: [fw, fh], out };
}, { url, BOXES });
await browser.close();

const ref = r.out.chest.med;
console.log(`\n${file}   figure ${r.fig[0]}x${r.fig[1]} px`);
console.log('region          px     luma   /chest     p05     p95  spread    R-B');
for (const [k, v] of Object.entries(r.out)) {
  console.log(k.padEnd(14), String(v.px).padStart(5), String(v.med).padStart(8),
    (v.med / ref).toFixed(3).padStart(8), String(v.p05).padStart(7), String(v.p95).padStart(7),
    String(+(v.p95 - v.p05).toFixed(1)).padStart(7), String(v.rb).padStart(6));
}
console.log('\nchest2 is THE CONTROL: a second box on the same plate. It must read /chest ~1.0.');
