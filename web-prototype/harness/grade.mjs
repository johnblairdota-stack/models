#!/usr/bin/env node
/**
 * GRADE — turn "it looks like monochrome amber" into a number.
 *
 * WHY THIS EXISTS. Every round of estate work has argued about whether a frame is "too dark"
 * or "too orange" from memory, and memory adapts: an eye that has looked at six amber frames
 * calls the seventh neutral. The locked art does not adapt. So this tool measures the two
 * things the art and the renders actually disagree about, and nothing else.
 *
 *   node harness/grade.mjs --img progress/shots/room.study.png
 *   node harness/grade.mjs --img progress/shots/room.study.png \
 *        --ref "C:/Users/John/Documents/Run Robot Run/Dev Art/1785319916301.png"
 *
 * WHAT IT MEASURES
 *   1  A ten-decile luminance ladder. Pixels sorted by Rec.709 luma over sRGB BYTES (not
 *      linear — the gate numbers were read off 8-bit PNGs and must stay comparable), split
 *      into ten equal-population buckets. Per decile: mean L, mean RGB, r-b, and the
 *      NORMALISED warm bias (r-b)/L.
 *   2  A 16x9 grid of cell means, and the six coolest and six warmest cells by r-b. This is
 *      what catches "one corner is navy" that a whole-frame average hides.
 *
 * WHY (r-b)/L AND NOT SATURATION. A frame can be legitimately warm at the bottom of its
 * range — a dark walnut room bouncing daylight off brown wood is warm in shadow and that is
 * correct. What is never correct is warm HIGHLIGHTS: a near-white source rendered orange.
 * Dividing by L makes the measure scale-free, so a dim frame and a bright frame of the same
 * scene give the same number, and the TOP decile is where the light source itself lives.
 *
 * THE GATE, measured off the two locked study images (see docs/slices/task-estate.md §3):
 *
 *   metric                    target      fail
 *   top-decile (r-b)/L        <= 0.14     > 0.20 is monochrome amber
 *   median pixel luminance    30 - 60     < 20 black frame, > 80 washed out
 *   darkest-decile mean L     2 - 8       0 means the toe is crushing real detail
 *
 * `--dark` relaxes the median band for `light.dark`, which is the one view where a low
 * median is the point. It still enforces the chroma gate and still prints everything.
 *
 * PATHS: relative resolve against the project root; absolute honoured. Quote Windows paths.
 * Images are handed to the browser as `data:` URLs via imglib.mjs — `file://` is cached by
 * URL and every render writes back to the same path, which has already returned three
 * identical "measurements" of three different images on this project.
 */

import { toDataURL, openCanvasPage } from './imglib.mjs';

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const flag = (name) => argv.includes(`--${name}`);

const IMG = opt('img');
const REF = opt('ref');
const DARK = flag('dark');
const JSON_OUT = flag('json');
const STEP = +(opt('step', 2));            // sample every Nth pixel in each axis
const GW = +(opt('gw', 16)), GH = +(opt('gh', 9));
// --crop x0,y0,x1,y1 as FRACTIONS of the image, applied to --img and --ref alike. Fractions,
// not pixels, because the render is 1920x1080 and the locked art is 1376x768: the same region
// of the same room is the same fraction of both frames and is NOT the same pixel box. Every
// hand-rolled crop comparison on this project so far has been in pixels and has therefore been
// comparing two different parts of two pictures.
const CROP = (opt('crop', '') || '').split(',').map(Number);
const HASCROP = CROP.length === 4 && CROP.every((v) => Number.isFinite(v));

if (!IMG) {
  console.error('usage: node harness/grade.mjs --img <png> [--ref <png>] [--dark] [--json]');
  process.exit(1);
}

// The gate. These are not taste: they are read off Dev Art/1785319916301.png (0.093 / L38)
// and 1785320177684.png (0.109 / L52).
const GATE = {
  chromaTarget: 0.14, chromaFail: 0.20,
  medianLo: 30, medianHi: 60, medianFailLo: 20, medianFailHi: 80,
  toeLo: 2, toeHi: 8,
};

/** Rec.709 luma over sRGB bytes. Matches the numbers quoted in the slice plan. */
const LUMA = 'function(r,g,b){return 0.2126*r+0.7152*g+0.0722*b;}';

async function analyse(page, file, crop) {
  const url = await toDataURL(file);
  return page.evaluate(async ({ url, step, gw, gh, lumaSrc, crop }) => {
    const luma = eval('(' + lumaSrc + ')');
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const FW = img.naturalWidth, FH = img.naturalHeight;
    const cv = document.createElement('canvas');
    cv.width = FW; cv.height = FH;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, FW, FH).data;

    const cx0 = crop ? Math.round(crop[0] * FW) : 0;
    const cy0 = crop ? Math.round(crop[1] * FH) : 0;
    const cx1 = crop ? Math.round(crop[2] * FW) : FW;
    const cy1 = crop ? Math.round(crop[3] * FH) : FH;
    const W = cx1 - cx0, H = cy1 - cy0;

    const px = [];                       // {L,r,g,b}
    const cells = [];
    for (let i = 0; i < gw * gh; i++) cells.push({ r: 0, g: 0, b: 0, n: 0 });

    for (let yy = 0; yy < H; yy += step) {
      const y = cy0 + yy;
      const gy = Math.min(gh - 1, Math.floor((yy / H) * gh));
      for (let xx = 0; xx < W; xx += step) {
        const x = cx0 + xx;
        const o = (y * FW + x) * 4;
        const r = d[o], g = d[o + 1], b = d[o + 2];
        px.push({ L: luma(r, g, b), r, g, b });
        const gx = Math.min(gw - 1, Math.floor((xx / W) * gw));
        const c = cells[gy * gw + gx];
        c.r += r; c.g += g; c.b += b; c.n++;
      }
    }

    px.sort((a, b) => a.L - b.L);
    const n = px.length;
    const deciles = [];
    for (let k = 0; k < 10; k++) {
      const lo = Math.floor((k * n) / 10), hi = Math.floor(((k + 1) * n) / 10);
      let L = 0, r = 0, g = 0, b = 0;
      for (let i = lo; i < hi; i++) { L += px[i].L; r += px[i].r; g += px[i].g; b += px[i].b; }
      const c = hi - lo;
      deciles.push({ L: L / c, r: r / c, g: g / c, b: b / c });
    }
    const median = px[Math.floor(n / 2)].L;
    const mean = px.reduce((a, p) => a + p.L, 0) / n;
    // share of the frame that is effectively pure black — the "40% of pixels at L<=2.6"
    // number the slice plan quotes
    const blackShare = px.filter((p) => p.L <= 2.6).length / n;
    const clipShare = px.filter((p) => p.L >= 250).length / n;

    const grid = cells.map((c, i) => ({
      x: i % gw, y: Math.floor(i / gw),
      r: c.r / c.n, g: c.g / c.n, b: c.b / c.n,
      L: luma(c.r / c.n, c.g / c.n, c.b / c.n),
    }));
    const all = px.reduce((a, p) => (a.r += p.r, a.g += p.g, a.b += p.b, a), { r: 0, g: 0, b: 0 });
    const meanRGB = { r: all.r / n, g: all.g / n, b: all.b / n };
    return { W, H, n, deciles, median, mean, blackShare, clipShare, grid, meanRGB };
  }, { url, step: STEP, gw: GW, gh: GH, lumaSrc: LUMA, crop: crop ?? null });
}

const f1 = (v) => v.toFixed(1);
const f3 = (v) => v.toFixed(3);
const chroma = (d) => (d.L > 0.5 ? (d.r - d.b) / d.L : 0);

function ladder(name, a) {
  console.log(`\n  ${name}  (${a.W}x${a.H}, ${a.n} samples)`);
  console.log(`   mean RGB ${Math.round(a.meanRGB.r)},${Math.round(a.meanRGB.g)},${Math.round(a.meanRGB.b)}`);
  console.log('   decile   meanL     R     G     B    r-b   (r-b)/L');
  a.deciles.forEach((d, i) => {
    const mark = i === 9 ? ' <- top' : (i === 0 ? ' <- toe' : '');
    console.log(`     ${String(i + 1).padStart(2)}    ${f1(d.L).padStart(6)}  ${f1(d.r).padStart(5)} ${f1(d.g).padStart(5)} ${f1(d.b).padStart(5)}  ${f1(d.r - d.b).padStart(5)}   ${f3(chroma(d)).padStart(6)}${mark}`);
  });
  console.log(`   median L ${f1(a.median)}   mean L ${f1(a.mean)}   pixels at L<=2.6 ${(a.blackShare * 100).toFixed(1)}%   at L>=250 ${(a.clipShare * 100).toFixed(1)}%`);
}

function cellExtremes(name, a) {
  const s = [...a.grid].sort((p, q) => (p.r - p.b) - (q.r - q.b));
  const fmt = (c) => `(${c.x},${c.y}) L${f1(c.L).padStart(5)} rgb ${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)} r-b ${f1(c.r - c.b).padStart(6)}`;
  console.log(`   ${name} coolest cells: ` + s.slice(0, 6).map(fmt).join('\n' + ' '.repeat(6 + name.length + 16)));
  console.log(`   ${name} warmest cells: ` + s.slice(-6).reverse().map(fmt).join('\n' + ' '.repeat(6 + name.length + 16)));
}

function verdict(a) {
  const top = chroma(a.deciles[9]);
  const med = a.median;
  const toe = a.deciles[0].L;
  const out = [];
  out.push(['top-decile (r-b)/L', f3(top),
    top <= GATE.chromaTarget ? 'PASS' : (top > GATE.chromaFail ? 'FAIL' : 'WARN'),
    `target <=${GATE.chromaTarget}, fail >${GATE.chromaFail}`]);
  if (DARK) {
    out.push(['median luminance', f1(med), 'n/a', 'relaxed by --dark; justify the value in the report']);
  } else {
    out.push(['median luminance', f1(med),
      (med >= GATE.medianLo && med <= GATE.medianHi) ? 'PASS'
        : ((med < GATE.medianFailLo || med > GATE.medianFailHi) ? 'FAIL' : 'WARN'),
      `target ${GATE.medianLo}-${GATE.medianHi}`]);
  }
  out.push(['darkest-decile L', f1(toe),
    (toe >= GATE.toeLo && toe <= GATE.toeHi) ? 'PASS' : 'WARN',
    `target ${GATE.toeLo}-${GATE.toeHi}`]);
  console.log('\n  GATE');
  for (const [k, v, s, note] of out) {
    console.log(`   ${s.padEnd(5)} ${k.padEnd(20)} ${String(v).padStart(7)}   ${note}`);
  }
  return { top, median: med, toe, fail: out.some((o) => o[2] === 'FAIL') };
}

const { browser, page } = await openCanvasPage();
try {
  const a = await analyse(page, IMG, HASCROP ? CROP : null);
  if (JSON_OUT) {
    const r = REF ? await analyse(page, REF, HASCROP ? CROP : null) : null;
    const pack = (x) => x && ({
      median: x.median, mean: x.mean, blackShare: x.blackShare, clipShare: x.clipShare,
      topChroma: chroma(x.deciles[9]), toeL: x.deciles[0].L,
      deciles: x.deciles.map((d) => ({ L: d.L, r: d.r, g: d.g, b: d.b, chroma: chroma(d) })),
    });
    console.log(JSON.stringify({ img: pack(a), ref: pack(r) }, null, 2));
  } else {
    ladder(`IMG  ${IMG}`, a);
    cellExtremes('img', a);
    const v = verdict(a);
    if (REF) {
      const r = await analyse(page, REF, HASCROP ? CROP : null);
      ladder(`REF  ${REF}`, r);
      cellExtremes('ref', r);
      console.log('\n  DELTA (img - ref)');
      console.log(`   median L      ${f1(a.median - r.median).padStart(7)}   (img ${f1(a.median)}  ref ${f1(r.median)})`);
      console.log(`   top chroma    ${f3(chroma(a.deciles[9]) - chroma(r.deciles[9])).padStart(7)}   (img ${f3(chroma(a.deciles[9]))}  ref ${f3(chroma(r.deciles[9]))})`);
      console.log(`   black share   ${((a.blackShare - r.blackShare) * 100).toFixed(1).padStart(7)}%  (img ${(a.blackShare * 100).toFixed(1)}%  ref ${(r.blackShare * 100).toFixed(1)}%)`);
    }
    if (v.fail && flag('gate')) process.exitCode = 1;
  }
} finally {
  await browser.close();
}
