/*
 * builder-head: WHERE the head's dark pixels are, rather than how many.
 *
 * `_head1-uni.mjs` and `_head2-shade.mjs` both came back empty: neither the weathering injection
 * (uRRWOn = 0 moves dark<120 by 0.57 pp) nor any material property (aoMap, normalMap, clearcoat,
 * envMapIntensity, roughnessMap — all under 1 pp) accounts for a 17-point excess of MIDTONE on
 * the head. A count cannot say which pixels those are, so paint them.
 *
 * Prints the figure bbox and the head band, and writes a picture of the band with every pixel
 * below the cut painted: red for < 90, orange for 90..120. Run it on the render and on the art
 * and the two pictures answer "is this a shadow, a feature, or the band including the shoulders".
 *
 * usage: node harness/evidence/_head3-map.mjs <img.png> <out.png> [bandFrac=0.20] [scale=3]
 */
import { writeFileSync } from 'node:fs';
import { toDataURL, openCanvasPage } from '../imglib.mjs';

const [, , src, out, bandS, scaleS] = process.argv;
const BAND = +(bandS || 0.20), SCALE = +(scaleS || 3);

const { browser, page } = await openCanvasPage();
const url = await toDataURL(src);
const r = await page.evaluate(async ({ url, BAND, SCALE }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const W = c.width, H = c.height;
  const d = g.getImageData(0, 0, W, H).data;
  const idx = (x, y) => (y * W + x) * 4;

  // Identical figure mask to _kit8_shellvalue.mjs: chroma shot -> "not chroma"; art -> alpha and
  // off-paper. Using a different mask here would make the two pictures incomparable.
  const bgp = [d[idx(2, 2)], d[idx(2, 2) + 1], d[idx(2, 2) + 2], d[idx(2, 2) + 3]];
  const isChroma = (r0, g0, b0) => r0 > 150 && b0 > 150 && g0 < 110;
  const chromaShot = isChroma(bgp[0], bgp[1], bgp[2]);
  const fig = new Uint8Array(W * H);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    const on = chromaShot
      ? d[i + 3] > 40 && !isChroma(d[i], d[i + 1], d[i + 2])
      : d[i + 3] > 40 && (Math.abs(d[i] - bgp[0]) + Math.abs(d[i + 1] - bgp[1]) + Math.abs(d[i + 2] - bgp[2]) > 24);
    if (!on) continue;
    fig[y * W + x] = 1;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const figH = y1 - y0 + 1;
  const yB = Math.round(y0 + figH * BAND);

  // Tight horizontal bounds of the BAND itself, so the crop frames the head and not the whole
  // figure width — otherwise the head sits in a sea of background and the picture is unreadable.
  let bx0 = 1e9, bx1 = -1e9;
  for (let y = y0; y < yB; y++) for (let x = x0; x <= x1; x++) if (fig[y * W + x]) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; }

  let n = 0, d90 = 0, d120 = 0;
  const o = document.createElement('canvas');
  const bw = bx1 - bx0 + 1, bh = yB - y0 + 1;
  o.width = bw; o.height = bh;
  const og = o.getContext('2d');
  const od = og.createImageData(bw, bh);
  for (let y = y0; y <= yB; y++) for (let x = bx0; x <= bx1; x++) {
    const i = idx(x, y), j = ((y - y0) * bw + (x - bx0)) * 4;
    const on = fig[y * W + x];
    const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    let col;
    if (!on) col = [40, 40, 48];
    else {
      n++;
      if (L < 90) { d90++; d120++; col = [230, 40, 40]; }
      else if (L < 120) { d120++; col = [250, 170, 30]; }
      else col = [L, L, L];
    }
    od.data[j] = col[0]; od.data[j + 1] = col[1]; od.data[j + 2] = col[2]; od.data[j + 3] = 255;
  }
  og.putImageData(od, 0, 0);
  const up = document.createElement('canvas');
  up.width = bw * SCALE; up.height = bh * SCALE;
  const ug = up.getContext('2d');
  ug.imageSmoothingEnabled = false;
  ug.drawImage(o, 0, 0, up.width, up.height);
  return {
    chromaShot, fig: [x0, y0, x1, y1], figH, band: [bx0, y0, bx1, yB],
    n, d90: d90 / n, d120: d120 / n, url: up.toDataURL('image/png'),
  };
}, { url, BAND, SCALE });

writeFileSync(out, Buffer.from(r.url.split(',')[1], 'base64'));
await browser.close();
console.log(`  ${src}`);
console.log(`  chromaShot=${r.chromaShot}  figure=[${r.fig}]  figH=${r.figH}  band=[${r.band}]`);
console.log(`  head band n=${r.n}  dark<90 ${(r.d90 * 100).toFixed(2)}%  dark<120 ${(r.d120 * 100).toFixed(2)}%`);
console.log(`  -> ${out}`);
