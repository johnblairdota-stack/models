/**
 * fx-glow scratch probe: region statistics on a PNG.
 *
 *   node fxglow_probe.mjs <img> "x,y,w,h,label" ...
 *   node fxglow_probe.mjs <img> --row "y,x0,x1,step"
 *   node fxglow_probe.mjs <img> --col "x,y0,y1,step"
 */
import { toDataURL, openCanvasPage, resolveImg } from './imglib.mjs';
import { statSync } from 'node:fs';

const [, , file, ...rest] = process.argv;
const st = statSync(resolveImg(file));
const url = await toDataURL(file);
const { browser, page } = await openCanvasPage();
await page.setContent('<body style="margin:0"></body>');

const out = await page.evaluate(async ({ url, rest }) => {
  const img = new Image();
  img.src = url;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const all = cx.getImageData(0, 0, cv.width, cv.height).data;
  const W = cv.width, H = cv.height;
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

  let fr = 0, fg = 0, fb = 0;
  for (let i = 0; i < all.length; i += 4) { fr += all[i]; fg += all[i + 1]; fb += all[i + 2]; }
  const n = all.length / 4;

  const rows = [];
  const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
  for (let k = 0; k < rest.length; k++) {
    const spec = rest[k];
    if (spec === '--row' || spec === '--col') { k++; continue; }
    const [x, y, w, h, label] = spec.split(',');
    const X = +x, Y = +y, Wd = +w, Ht = +h;
    const R = [], G = [], B = [];
    let maxL = -1, maxPx = null;
    for (let dy = 0; dy < Ht; dy++) for (let dx = 0; dx < Wd; dx++) {
      const px = X + dx, py = Y + dy;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const i = (py * W + px) * 4;
      R.push(all[i]); G.push(all[i + 1]); B.push(all[i + 2]);
      const L = lum(all[i], all[i + 1], all[i + 2]);
      if (L > maxL) { maxL = L; maxPx = [all[i], all[i + 1], all[i + 2], px, py]; }
    }
    if (!R.length) continue;
    const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
    rows.push({
      label: label ?? `${X},${Y}`,
      rect: `${X},${Y} ${Wd}x${Ht}`,
      mean: [mean(R), mean(G), mean(B)].map((v) => +v.toFixed(1)),
      median: [med(R), med(G), med(B)],
      luma: +lum(mean(R), mean(G), mean(B)).toFixed(1),
      rmb: +(mean(R) - mean(B)).toFixed(1),
      maxLuma: +maxL.toFixed(1),
      maxPx,
    });
  }

  const scans = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--row' || rest[i] === '--col') {
      const [a, b, c, step] = rest[i + 1].split(',').map(Number);
      const isRow = rest[i] === '--row';
      const pts = [];
      for (let v = b; v <= c; v += (step || 1)) {
        const px = isRow ? v : a, py = isRow ? a : v;
        if (px < 0 || py < 0 || px >= W || py >= H) continue;
        const j = (py * W + px) * 4;
        pts.push([v, all[j], all[j + 1], all[j + 2]]);
      }
      scans.push({ kind: rest[i], spec: rest[i + 1], pts });
    }
  }

  return { W, H, frameMean: [fr / n, fg / n, fb / n].map((v) => +v.toFixed(1)), rows, scans };
}, { url, rest });

await browser.close();
console.log(`${file}  ${out.W}x${out.H}  ${(st.size / 1024).toFixed(0)} kB  mtime ${st.mtime.toISOString()}`);
console.log(`frame mean rgb ${out.frameMean.join('/')}`);
for (const r of out.rows) {
  console.log(`  ${String(r.label).padEnd(20)} [${r.rect.padEnd(15)}] mean ${r.mean.join('/')}  med ${r.median.join('/')}  luma ${r.luma}  r-b ${r.rmb}  maxL ${r.maxLuma} @${r.maxPx?.slice(3).join(',')} rgb ${r.maxPx?.slice(0, 3).join('/')}`);
}
for (const s of out.scans) {
  console.log(`  ${s.kind} ${s.spec}`);
  console.log('    ' + s.pts.map((p) => `${p[0]}:${p[1]}/${p[2]}/${p[3]}`).join('  '));
}
