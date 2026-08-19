#!/usr/bin/env node
/**
 * IS THE UPPER ARM RIBBED LIKE A SCREW THREAD, OR MACHINED LIKE METAL?
 *
 *   node harness/_turn1_ribs.mjs --img <beauty.png> --figh <px> \
 *        --mask upperarm=<mask.png> --mask forearm=<...> --mask thighall=<...>
 *   node harness/_turn1_ribs.mjs --img <art.png> --autofig \
 *        --box upperarm=0.22,0.31,0.29,0.40 ...
 *
 * WHY A NEW INSTRUMENT AND NOT A BOX WITH A SOBEL IN IT. The round that produced this file was
 * opened by two critics quoting EDGE DENSITY inside hand-placed boxes, and a third box placement
 * on the same image disagreed with both (8.5% against 32-40%) because it landed on smooth arm and
 * missed a panel line. Edge density inside a box is dominated by WHICH EDGES THE BOX CAUGHT: a
 * silhouette, a panel seam and an elbow disc all count, and none of them are the defect. So this
 * measures three things instead, and only the second and third can tell a thread from a finish:
 *
 *   density   fraction of masked pixels whose VERTICAL second difference exceeds a threshold.
 *             The critics' number, reproduced so this file can be compared to their reports.
 *             It is threshold-bound and source-bound and it is NOT the headline.
 *
 *   aniso     median |dI/dy| over median |dI/dx|, inside the mask. Turning marks run AROUND the
 *             limb, so a thread is strongly anisotropic along the limb axis while a satin finish,
 *             a panel line network and image noise are not. A number near 1.0 is "no preferred
 *             direction"; the shipped build reads 2.3 and the art reads 1.0-1.2.
 *
 *   period    THE HEADLINE. Column-wise normalised autocorrelation of the high-passed signal over
 *             lags 2..24 px. A screw thread is PERIODIC and nothing else on this figure is: a
 *             panel line is a single event, a satin finish is broadband, an elbow disc is one
 *             blob. peak is the correlation at the best lag; lag is that lag in pixels. A real
 *             machined surface at capture scale has no peak to find, so peak collapses toward
 *             zero and lag becomes meaningless noise. Read peak FIRST and ignore lag when peak
 *             is under ~0.12.
 *
 * ⚠️ THE SILHOUETTE IS THE LOUDEST EDGE ON THE FIGURE AND IT IS NOT THE DEFECT. Every mask is
 * ERODED before use, and the erosion radius is one of the swept parameters, because a 1 px rim of
 * background inside the mask puts a 200-level step into every statistic and manufactures density
 * out of nothing. --erode 0 is available and is worth one run: it roughly doubles every density
 * figure on every build including the art, which is how you know the erosion is load-bearing.
 *
 * ⚠️ AND THE TWO SOURCES MUST BE BROUGHT TO THE SAME SCALE FIRST. Density and period are measured
 * in PIXELS, so an art sheet whose figure is 900 px tall and a capture whose figure is 880 px
 * tall are already 2% apart before anything is compared, and a 1024 sheet against a 1080 capture
 * would be 20% apart. --figh states the figure height in the image and everything is resampled to
 * --scale-to (default 880, the capture's own figure height) before a single statistic is taken.
 * --autofig finds the figure by cutting the white page out, which works on the art sheets and NOT
 * on a capture over a gradient background.
 *
 * THE CONTROL, and it is printed on every run: the same three numbers on the THIGH, a smooth
 * white plate in both the art and the render. If the thigh comes back ribbed, the operator is
 * measuring lighting or noise rather than tooling and no other row in the table means anything.
 */
import { toDataURL, openCanvasPage } from './imglib.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i < 0 ? d : argv[i + 1]; };
const multi = (k) => argv.reduce((a, v, i) => (v === k ? [...a, argv[i + 1]] : a), []);
const has = (k) => argv.includes(k);

const imgFile = arg('--img');
if (!imgFile) { console.error('need --img'); process.exit(2); }
const scaleTo = +arg('--scale-to', 880);
const erode = +arg('--erode', 3);
const cut = arg('--cut', 'luma');          // luma | green | mean
const split = arg('--split', 'full');      // full | top | bot
const figh = arg('--figh') ? +arg('--figh') : null;
const autofig = has('--autofig');
const masks = multi('--mask').map((s) => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1)]; });
const subFile = arg('--sub');   // see the block by its use, below
const boxes = multi('--box').map((s) => { const i = s.indexOf('='); return [s.slice(0, i), s.slice(i + 1).split(',').map(Number)]; });

const { browser, page } = await openCanvasPage();

const put = async (file, slot, scale) => {
  const url = await toDataURL(file);
  await page.evaluate(async ({ url, slot, scale }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const W = Math.max(1, Math.round(img.width * scale)), H = Math.max(1, Math.round(img.height * scale));
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingEnabled = scale !== 1;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, W, H);
    window[slot] = { d: g.getImageData(0, 0, W, H).data, W, H };
  }, { url, slot, scale });
};

// pass 1 at scale 1, only to find the figure height when --autofig is asked for
let scale = 1;
if (autofig) {
  await put(imgFile, '__probe', 1);
  const fh = await page.evaluate(() => {
    const { d, W, H } = window.__probe;
    let y0 = 1e9, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] < 128 || (d[i] > 244 && d[i + 1] > 244 && d[i + 2] > 244)) continue;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return y1 - y0;
  });
  scale = scaleTo / fh;
} else if (figh) {
  scale = scaleTo / figh;
}

await put(imgFile, '__img', scale);
for (const [name, file] of masks) await put(file, '__m_' + name, scale);
if (subFile) await put(subFile, '__sub', scale);

const result = await page.evaluate(({ masks, boxes, erode, cut, split, autofig, hasSub }) => {
  const I = window.__img, W = I.W, H = I.H, d = I.d;
  const val = (i) => (cut === 'green' ? d[i + 1]
    : cut === 'mean' ? (d[i] + d[i + 1] + d[i + 2]) / 3
      : 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
  const L = new Float32Array(W * H);
  for (let p = 0; p < W * H; p++) L[p] = val(p * 4);

  // ---- selection ----------------------------------------------------------------------
  const sels = {};
  for (const [name] of masks) {
    const M = window['__m_' + name];
    if (M.W !== W || M.H !== H) return { err: `mask ${name} size ${M.W}x${M.H} vs img ${W}x${H}` };
    /*
     * ⚠️ THE PREDICATE IS "RED", NOT "HAS RED IN IT", AND THE DIFFERENCE IS THE WHOLE FRAME.
     * ?weather=debug5 replaces the SHELL MATERIAL's outgoing light. It does not touch the
     * studio background, which stays a light grey gradient — and grey passes any test of the
     * form `r > threshold`. The first version of this script used exactly that and selected
     * 1.87 MILLION pixels for every region, all three of which then reported an identical
     * median of 196.1: the colour of the cyc. Require the other two channels to be dark.
     */
    const s = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) {
      const i = p * 4;
      s[p] = (M.d[i] > 100 && M.d[i + 1] < 70 && M.d[i + 2] < 70) ? 1 : 0;
    }
    sels[name] = s;
  }
  /*
   * ⚠️ `?famprobe=` OVERRIDES THE BONE FAMILY AND NOTHING ELSE, SO ITS MASK IS NOT THE REGION.
   * The delivered chrome mask is the bone assignment MAXed with every per-pixel detail the
   * shader adds afterwards — the elbow and knee caps, the wrist rings, the calf panel, the
   * inner-thigh face. Those survive `famprobe` because they are not bone families. Captured
   * raw, `famprobe=upperarm` therefore returns the upper arm UNION both knees, both wrists and
   * both ankles: the first run of this script had upperarm, forearm and thighall all reporting
   * the identical bounding box 742,271,1181,795, which is the figure's whole chrome furniture
   * and not any one region.
   *
   * `?famprobe=none` names no region — the resolver's last line only matches a real key — so it
   * captures EXACTLY that detail furniture and nothing else. Subtracting it leaves the bone's
   * own skin, which is the surface the machining is drawn on and the surface being judged. It
   * also correctly removes the elbow cap from the upper arm: the cap is a disc, it is not the
   * turned tube, and it carries an edge at every threshold.
   */
  if (hasSub) {
    const SB = window.__sub;
    const sub = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) {
      const i = p * 4;
      sub[p] = (SB.d[i] > 100 && SB.d[i + 1] < 70 && SB.d[i + 2] < 70) ? 1 : 0;
    }
    // dilate the subtrahend by 1 so the cap's own antialiased rim goes with it
    const dil = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (sub[p] || sub[p - 1] || sub[p + 1] || sub[p - W] || sub[p + W]) dil[p] = 1;
    }
    for (const s of Object.values(sels)) for (let p = 0; p < W * H; p++) if (dil[p]) s[p] = 0;
  }
  if (boxes.length) {
    // figure bbox, for box-fraction coordinates (art sheets only)
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] < 128 || (d[i] > 244 && d[i + 1] > 244 && d[i + 2] > 244)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const fw = x1 - x0, fh = y1 - y0;
    for (const [name, b] of boxes) {
      const s = new Uint8Array(W * H);
      const bx0 = Math.round(x0 + b[0] * fw), bx1 = Math.round(x0 + b[2] * fw);
      const by0 = Math.round(y0 + b[1] * fh), by1 = Math.round(y0 + b[3] * fh);
      for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3] < 128 || (d[i] > 244 && d[i + 1] > 244 && d[i + 2] > 244)) continue;
        s[y * W + x] = 1;
      }
      sels[name] = s;
    }
  }

  const out = {};
  window.__sels = [];
  for (const [name, sel0] of Object.entries(sels)) {
    // ---- erode, so the silhouette step is not counted as tooling -----------------------
    let sel = sel0;
    for (let e = 0; e < erode; e++) {
      const n = new Uint8Array(W * H);
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const p = y * W + x;
        if (sel[p] && sel[p - 1] && sel[p + 1] && sel[p - W] && sel[p + W]) n[p] = 1;
      }
      sel = n;
    }
    // ---- crop split -------------------------------------------------------------------
    let ry0 = 1e9, ry1 = -1;
    for (let p = 0; p < W * H; p++) if (sel[p]) { const y = (p / W) | 0; if (y < ry0) ry0 = y; if (y > ry1) ry1 = y; }
    if (split !== 'full' && ry1 > ry0) {
      const mid = (ry0 + ry1) / 2;
      const n = new Uint8Array(W * H);
      for (let p = 0; p < W * H; p++) {
        if (!sel[p]) continue;
        const y = (p / W) | 0;
        if (split === 'top' ? y <= mid : y > mid) n[p] = 1;
      }
      sel = n;
    }
    window.__sels.push(sel);

    const lum = [], gy = [], gx = [];
    let n = 0;
    const dens = { 2: 0, 3: 0, 4: 0, 6: 0 };
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (!sel[p]) continue;
      // second differences need their neighbours inside the mask too, or the operator
      // reaches across the eroded boundary and measures the step it was eroded to avoid
      if (!sel[p - W] || !sel[p + W] || !sel[p - 1] || !sel[p + 1]) continue;
      n++;
      lum.push(L[p]);
      const hy = L[p] - (L[p - W] + L[p + W]) / 2;
      const hx = L[p] - (L[p - 1] + L[p + 1]) / 2;
      gy.push(Math.abs(hy)); gx.push(Math.abs(hx));
      for (const t of [2, 3, 4, 6]) if (Math.abs(hy) > t) dens[t]++;
    }
    if (!n) { out[name] = { px: 0 }; continue; }
    const q = (a, f) => { const s = [...a].sort((p, r) => p - r); return s[Math.floor(s.length * f)]; };

    // ---- periodicity: autocorrelation of the high-passed signal DOWN each column --------
    // A thread repeats; a panel line, an elbow disc and a satin finish do not.
    const lags = [];
    for (let lag = 2; lag <= 24; lag++) {
      let num = 0, dA = 0, dB = 0, cnt = 0;
      for (let x = 1; x < W - 1; x++) for (let y = 1; y < H - 1 - lag; y++) {
        const p = y * W + x, p2 = p + lag * W;
        if (!sel[p] || !sel[p2]) continue;
        if (!sel[p - W] || !sel[p + W] || !sel[p2 - W] || !sel[p2 + W]) continue;
        const a = L[p] - (L[p - W] + L[p + W]) / 2;
        const b = L[p2] - (L[p2 - W] + L[p2 + W]) / 2;
        num += a * b; dA += a * a; dB += b * b; cnt++;
      }
      if (cnt > 200) lags.push([lag, num / Math.sqrt(Math.max(dA * dB, 1e-9))]);
    }
    let best = [0, 0];
    for (const l of lags) if (l[1] > best[1]) best = l;

    out[name] = {
      px: n,
      med: +q(lum, 0.5).toFixed(1), p05: +q(lum, 0.05).toFixed(1), p95: +q(lum, 0.95).toFixed(1),
      d2: +(100 * dens[2] / n).toFixed(1), d3: +(100 * dens[3] / n).toFixed(1),
      d4: +(100 * dens[4] / n).toFixed(1), d6: +(100 * dens[6] / n).toFixed(1),
      aniso: +(q(gy, 0.5) / Math.max(q(gx, 0.5), 1e-3)).toFixed(2),
      peak: +best[1].toFixed(3), lag: best[0],
      // WHERE the selection actually landed. Printed on every run because a mask that has
      // drifted off the arm still returns a full set of confident numbers.
      box: (() => {
        let bx0 = 1e9, bx1 = -1, by0 = 1e9, by1 = -1;
        for (let p = 0; p < W * H; p++) if (sel[p]) {
          const x = p % W, y = (p / W) | 0;
          if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y;
        }
        return [bx0, by0, bx1, by1];
      })(),
    };
  }
  return { W, H, out };
}, { masks, boxes, erode, cut, split, autofig, hasSub: !!subFile });

/*
 * --dump <file.png> paints every final selection back over the image in flat colour. It is the
 * ALIGNMENT ASSERTION and it is cheap: this round's first three tables were all produced by a
 * selection that was not where the script said it was, twice, and both times the numbers came
 * back complete, plausible and wrong. Look at the dump before quoting any row.
 */
const dumpFile = arg('--dump');
if (dumpFile) {
  const b64 = await page.evaluate(() => {
    const { W, H, d } = window.__img;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const im = g.createImageData(W, H);
    const COL = [[255, 40, 40], [40, 255, 90], [80, 140, 255], [255, 220, 40]];
    for (let p = 0; p < W * H; p++) {
      const i = p * 4;
      im.data[i] = d[i]; im.data[i + 1] = d[i + 1]; im.data[i + 2] = d[i + 2]; im.data[i + 3] = 255;
    }
    window.__sels.forEach((sel, k) => {
      const c3 = COL[k % 4];
      for (let p = 0; p < W * H; p++) if (sel[p]) {
        const i = p * 4;
        im.data[i] = (im.data[i] + c3[0] * 2) / 3;
        im.data[i + 1] = (im.data[i + 1] + c3[1] * 2) / 3;
        im.data[i + 2] = (im.data[i + 2] + c3[2] * 2) / 3;
      }
    });
    g.putImageData(im, 0, 0);
    return c.toDataURL('image/png').split(',')[1];
  });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(dumpFile, Buffer.from(b64, 'base64'));
  console.log(`  dump -> ${dumpFile}`);
}

await browser.close();

if (result.err) { console.error('MISALIGNED:', result.err); process.exit(1); }
console.log(`\n${imgFile}`);
console.log(`  scale x${scale.toFixed(3)} -> ${result.W}x${result.H}   cut=${cut} erode=${erode} split=${split}`);
console.log('region        px      med    p05    p95   dens2  dens3  dens4  dens6  aniso   peak  lag   where(x0,y0,x1,y1)');
for (const [k, v] of Object.entries(result.out)) {
  if (!v.px) { console.log(k.padEnd(12), '     0   (empty after erosion)'); continue; }
  console.log(
    k.padEnd(12), String(v.px).padStart(6), String(v.med).padStart(8), String(v.p05).padStart(6),
    String(v.p95).padStart(6), String(v.d2).padStart(7), String(v.d3).padStart(6),
    String(v.d4).padStart(6), String(v.d6).padStart(6), String(v.aniso).padStart(7),
    String(v.peak).padStart(6), String(v.lag).padStart(4), '  ', v.box.join(','));
}
const R = result.out;
const ratio = (a, b) => (R[a]?.med && R[b]?.med ? (R[a].med / R[b].med).toFixed(3) : '  -  ');
if (R.upperarm) {
  console.log(`\n  upperarm/forearm ${ratio('upperarm', 'forearm')}   upperarm/thigh ${ratio('upperarm', 'thighall')}   forearm/thigh ${ratio('forearm', 'thighall')}`);
}
