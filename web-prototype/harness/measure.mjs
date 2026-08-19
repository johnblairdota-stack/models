#!/usr/bin/env node
/**
 * Silhouette measurement — the same landmarks, off a render AND off the reference art.
 *
 * WHY THIS EXISTS. `ART_MANIFEST.md` states what the art is; nothing states what the RENDER
 * is. So every comparison has been an agent hand-rolling a crop-and-measure script — three
 * separate ones were written and abandoned in this directory — or eyeballing a crop. That
 * made specs unverifiable, and unverifiable specs are how "shoulder-to-shoulder = 0.245"
 * survived long enough to burn a 462k-token round narrowing the character to match it.
 *
 *   node harness/measure.mjs --img progress/shots/char.turnaround.png
 *   node harness/measure.mjs --img progress/shots/char.turnaround.png \
 *        --ref "C:/Users/John/Documents/Run Robot Run/Dev Art/1785277053522.png"
 *
 * With --ref it prints render vs art vs delta, per figure. That table is the point.
 *
 * METHOD, and its one real difficulty. The shell is #EDEFF0 on a #F2F2F2 cyc — about 2% apart
 * in luminance — so a global threshold finds nothing, which is why the manifest says
 * auto-segmentation fails here. It does not fail if you estimate the background PER ROW from
 * the outer margins (both images carry a vignette) and threshold against that local estimate.
 *
 * WHAT IT MEASURES: silhouette only — crown, sole, and the left/right extent at every row.
 * Everything is normalised by that figure's own crown-to-sole height, so a 1376px sheet and a
 * 1920px render are directly comparable.
 *
 * WHAT IT DELIBERATELY DOES NOT MEASURE: anything that is a design judgement rather than a
 * dimension. The angle a hip disc should sit at, whether a joint "reads as a socket", whether
 * chrome looks machined — none of that is a number and forcing it into one has failed here
 * repeatedly. This tool answers "how wide, how tall, how far up". Judge the rest in the render.
 *
 * Composited in a headless browser canvas, same as sheet.mjs — no image-library dependency.
 *
 * PATHS: relative paths resolve against the project root; absolute paths are honoured.
 * QUOTE Windows paths or use forward slashes.
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const all = (name) => argv.reduce((a, v, i) => (v === `--${name}` ? [...a, argv[i + 1]] : a), []);

const IMG = all('img')[0] ?? opt('img');
const REF = opt('ref');
const FIGS = +(opt('figures', 4));
// Both sheets carry a title, and the render also carries view labels underneath. Text is
// high-contrast against the cyc and would register as figure pixels, so trim the bands.
const BAND = (opt('band', '0.12,0.90')).split(',').map(Number);
/*
 * `--refband` — THE REFERENCE NEEDS ITS OWN BAND, AND ROUND 32 FOUND OUT WHY THE HARD WAY.
 *
 * One band was applied to both images, and it is calibrated for the RENDER: `char.turnaround`
 * prints its view labels at 92% of frame height, so the lower cut has to sit above them at
 * 0.90. `Dev Art/1785277053522.png` has no such labels and its figures run much lower in the
 * frame — measured with a per-row edge dump, figure 1 spans y 107..722 of 768, i.e. its soles
 * are at 0.940 of image height. The shared 0.90 cut therefore truncated the reference's FEET:
 * `sole` was found at the band edge, y 690, and the figure was measured 583 px tall instead
 * of 615.
 *
 * That is not a 5% scale error, it is a 5% error IN THE ORIGIN, and every H-fraction in the
 * table is taken from the sole upward. The mapping between a printed fraction and the fraction
 * of the reference actually sampled was f_true = 0.052 + 0.948 f — so a row printed as "0.285"
 * was reading the sheet at 0.322 H, and rows near the feet were out by nearly 0.04 H. Round 31
 * and round 32 both filed defects off that table ("stance -36.8% at 0.285 H", "arms +9.1% at
 * 0.415 H"); both dissolve once the reference is measured to its own soles.
 *
 * Defaults to `--band` so nothing that does not pass it changes by a pixel.
 */
const REFBAND = (opt('refband', '')).split(',').map(Number).filter(Number.isFinite);
const RBAND = REFBAND.length === 2 ? REFBAND : BAND;
// Deviation from the per-row background estimate, in 0-255 luma, that counts as "figure".
// 6 is comfortably above sensor/dither noise and still catches the brightest shell.
const THRESH = +(opt('thresh', 6));
// `--prof` — dump the full 0.44..0.72 H width curve with signed front/back edges per figure.
const PROF = argv.includes('--prof');

if (!IMG) {
  console.error('usage: node harness/measure.mjs --img <png> [--ref <png>] [--figures 4]');
  process.exit(1);
}

const resolve = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));

/** The landmark fractions ART_MANIFEST.md records, so output drops straight into that table. */
const LANDMARKS = [
  ['head top', 1.000],
  ['chin / neck', 0.845],
  ['shoulder', 0.790],
  ['chest decal', 0.755],
  ['waist', 0.655],
  ['hip', 0.545],
  ['fingertip', 0.415],
  ['knee', 0.285],
  ['ankle', 0.055],
];

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 400, height: 300 } });

async function measure(file, band = BAND) {
  // Read the bytes here and hand the browser a data: URL rather than a file:// path.
  //
  // This is deliberate and it fixes two things at once. Chromium caches file:// by URL, and
  // every render writes back to the same path, so measuring a re-rendered file returns the
  // PREVIOUS measurement — stale, plausible and wrong; that has already nearly produced a
  // false regression report here. And the obvious fix, a ?t= cache-busting query, does not
  // work on file:// because the query is not stripped — the browser looks for a file that
  // does not exist and you get an opaque decode error. A data: URL has no cache and no
  // origin problem.
  const buf = await readFile(resolve(file));
  const url = `data:image/png;base64,${buf.toString('base64')}`;
  return page.evaluate(async ({ url, FIGS, BAND, THRESH }) => {
    const im = new Image();
    im.src = url;
    await im.decode();
    const W = im.naturalWidth, H = im.naturalHeight;
    const c = new OffscreenCanvas(W, H);
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];

    const y0 = Math.round(H * BAND[0]), y1 = Math.round(H * BAND[1]);
    const margin = Math.max(4, Math.round(W * 0.02));

    // EDGES, NOT LEVELS. Absolute luminance cannot separate this subject: the shell is
    // #EDEFF0 against a #F2F2F2 cyc, about 2% apart, and both sheets carry a vignette that
    // varies radially — so any background model built from the margins misreads mid-frame
    // background as figure and welds all four figures into one blob. That is the failure the
    // manifest is describing when it says auto-segmentation does not work here.
    //
    // A smooth gradient has near-zero local derivative; a silhouette boundary does not, even
    // a near-white one, because of shading rolloff and antialiasing. So threshold the
    // horizontal derivative instead of the level. This is the method that successfully
    // recovered the leg profile curve off the sheet.
    const grad = (x, y) => {
      if (x < 2 || x > W - 3) return 0;
      return Math.abs(lum((y * W + x + 2) * 4) - lum((y * W + x - 2) * 4));
    };
    const isEdge = (x, y) => grad(x, y) > THRESH;

    // ---- RUNS: every separate mass in a row, not just the outer pair -------------------
    // The original version collapsed each row to [leftmost, rightmost] and treated
    // everything between as solid, which throws away exactly the structure that matters:
    // the daylight between arm and torso, and the split between the legs. Without runs you
    // cannot locate a crotch, an armpit, or a limb axis at all.
    //
    // Edges come in clusters (a boundary is a few pixels wide), so cluster first, then pair
    // consecutive clusters into runs. Internal detail — panel lines, dark seams, the chest
    // decal — also produces edges, so a candidate gap only counts as REAL background if it
    // is wide enough AND its luminance matches what the row reads outside the figure. That
    // second test is what stops a panel line being mistaken for an armpit.
    const bgOf = (y) => {
      let s = 0, n = 0;
      for (let x = 0; x < 6; x++) { s += lum((y * W + x) * 4); n++; }
      for (let x = W - 6; x < W; x++) { s += lum((y * W + x) * 4); n++; }
      return s / n;
    };
    const runsOn = (y, fx0, fx1, minGapPx) => {
      const cl = [];
      let s = -1;
      for (let x = fx0; x <= fx1; x++) {
        if (isEdge(x, y)) { if (s < 0) s = x; }
        else if (s >= 0) { cl.push([s, x - 1]); s = -1; }
      }
      if (s >= 0) cl.push([s, fx1]);
      if (cl.length < 2) return [];
      const bg = bgOf(y);
      const runs = [];
      let start = cl[0][0];
      for (let i = 1; i < cl.length; i++) {
        const gapL = cl[i - 1][1] + 1, gapR = cl[i][0] - 1;
        const gapW = gapR - gapL + 1;
        let realGap = false;
        if (gapW >= minGapPx) {
          let s2 = 0, n2 = 0;
          for (let x = gapL; x <= gapR; x++) { s2 += lum((y * W + x) * 4); n2++; }
          realGap = Math.abs(s2 / n2 - bg) < THRESH * 1.6;   // gap reads as background
        }
        if (realGap) { runs.push([start, cl[i - 1][1]]); start = cl[i][0]; }
      }
      runs.push([start, cl[cl.length - 1][1]]);
      return runs.filter((r) => r[1] > r[0]);
    };

    // Column activity -> split into FIGS groups. Background columns carry almost no
    // derivative; figure columns carry a lot.
    const col = new Uint32Array(W);
    for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) if (isEdge(x, y)) col[x]++;
    const minCol = Math.max(2, Math.round((y1 - y0) * 0.01));
    const runs = [];
    let start = -1;
    for (let x = 0; x < W; x++) {
      const on = col[x] >= minCol;
      if (on && start < 0) start = x;
      if (!on && start >= 0) { runs.push([start, x - 1]); start = -1; }
    }
    if (start >= 0) runs.push([start, W - 1]);
    // Merge runs separated by less than a plausible inter-figure gap.
    const gap = Math.round(W / (FIGS * 6));
    const merged = [];
    for (const r of runs) {
      const last = merged[merged.length - 1];
      if (last && r[0] - last[1] < gap) last[1] = r[1];
      else merged.push([...r]);
    }
    merged.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
    const figs = merged.slice(0, FIGS).sort((a, b) => a[0] - b[0]);

    return figs.map(([fx0, fx1]) => {
      // A row belongs to the figure only if it carries a real pair of edges, not one stray
      // gradient — otherwise a faint background artefact sets the crown far too high.
      const edgesOn = (y) => {
        let l = -1, r = -1;
        for (let x = fx0; x <= fx1; x++) if (isEdge(x, y)) { l = x; break; }
        for (let x = fx1; x >= fx0; x--) if (isEdge(x, y)) { r = x; break; }
        return (l >= 0 && r > l) ? [l, r] : null;
      };
      const minSpan = Math.max(3, Math.round((fx1 - fx0) * 0.04));

      let crown = -1, sole = -1;
      for (let y = y0; y < y1 && crown < 0; y++) {
        const e = edgesOn(y);
        if (e && e[1] - e[0] >= minSpan) crown = y;
      }
      for (let y = y1 - 1; y >= y0 && sole < 0; y--) {
        const e = edgesOn(y);
        if (e && e[1] - e[0] >= minSpan) sole = y;
      }
      const hpx = sole - crown;

      // silhouette extent at a given fraction of this figure's own height
      const widthAt = (frac) => {
        const y = Math.round(sole - frac * hpx);
        if (y < 0 || y >= H) return null;
        const e = edgesOn(y);
        return e ? (e[1] - e[0]) / hpx : null;
      };

      // FEATURES, NOT FIXED HEIGHTS. Sampling both images at the same H-fraction only
      // compares like with like if the proportions already match — which is precisely what
      // is in doubt. Our shoulder sits at 0.790 H and the sheet's ball measures ~0.728, so a
      // reading at 0.790 hits shoulder on one image and neck on the other, and the delta is
      // then meaningless. So locate each landmark as a FEATURE of the width profile and
      // report both how wide it is and WHERE it is; a landmark that has moved is itself a
      // finding.
      const peak = (lo, hi) => {
        let w = -1, at = 0;
        for (let f = lo; f <= hi; f += 0.004) { const v = widthAt(f); if (v != null && v > w) { w = v; at = f; } }
        return { w, at };
      };
      const trough = (lo, hi) => {
        let w = Infinity, at = 0;
        for (let f = lo; f <= hi; f += 0.004) { const v = widthAt(f); if (v != null && v < w) { w = v; at = f; } }
        return { w: w === Infinity ? -1 : w, at };
      };
      const shoulder = peak(0.68, 0.86);
      const waist = trough(0.60, 0.72);
      const hips = peak(0.46, 0.60);
      const maxW = shoulder.w, maxAt = shoulder.at;

      // ---- structure from runs ---------------------------------------------------------
      // Body's median axis, used to express limb centres relative to the centreline. Median
      // rather than the sole row's centre: at the last row often only one foot is present.
      const cs = [];
      for (let y = crown; y <= sole; y += Math.max(1, Math.round(hpx / 200))) {
        const e = edgesOn(y);
        if (e) cs.push((e[0] + e[1]) / 2);
      }
      cs.sort((a, b) => a - b);
      const cx = cs.length ? cs[cs.length >> 1] : (fx0 + fx1) / 2;

      const minGapPx = Math.max(2, Math.round(hpx * 0.008));
      const runsAt = (f) => runsOn(Math.round(sole - f * hpx), fx0, fx1, minGapPx);

      // CROTCH — scanning up from the soles, the height at which two leg masses become one.
      // A hard landmark the width profile alone cannot see, and one nothing has measured on
      // this project despite "lanky" being a recurring complaint.
      //
      // ⚠️ IT IS CONFOUNDED BY THE CONTACT SHADOW, AND A FLOORED VALUE IS NOT A MEASUREMENT.
      // The studio's soft ground shadow spreads BETWEEN the boots and segments as mass, so a
      // figure whose legs are visibly wide apart still reads as one run at the bottom of the
      // scan and returns 0.060 — the first sample — every time. Both hunter stages reported
      // exactly 0.060 across every pose tried, including a stance change that moved the feet
      // and did not move this by a thousandth; that constancy is the tell. A critic filed
      // "legs nearly touching, no inverted-V" on two pieces off this number before anyone
      // looked at the pixels, where the render's boots are further apart than the art's.
      // Report the floor as UNRESOLVED so nobody argues about leg splay from a shadow.
      let crotch = null;
      const CROTCH_FLOOR = 0.06;
      for (let f = CROTCH_FLOOR; f <= 0.62; f += 0.004) {
        if (runsAt(f).length < 2) { crotch = f; break; }
      }
      const crotchFloored = crotch != null && crotch <= CROTCH_FLOOR + 1e-9;

      // ARM SEPARATION — the band where three masses read (arm · torso · arm). The art has
      // daylight there; if ours has none the arms are fused to the torso in silhouette.
      //
      // ROUND 31 — the BOOLEAN IS NOT THE MEASUREMENT, and a round was lost to that. A fix
      // that opens one hairline row flips `armTop` from null to a number while the arms are
      // still visibly welded to the torso, and the report then reads as a pass. So also
      // report how WIDE the daylight is: the median gap, in H fractions, over the band where
      // three masses read. That number cannot be moved by a single row.
      let armTop = null, armBot = null;
      const gapsL = [], gapsR = [];
      for (let f = 0.86; f >= 0.30; f -= 0.004) {
        const rs = runsAt(f);
        if (rs.length >= 3) {
          if (armTop === null) armTop = f;
          armBot = f;
          gapsL.push((rs[1][0] - rs[0][1]) / hpx);
          gapsR.push((rs[rs.length - 1][0] - rs[rs.length - 2][1]) / hpx);
        }
      }
      const med = (a) => (a.length ? a.slice().sort((p, q) => p - q)[a.length >> 1] : null);

      /*
       * TORSO WIDTH — the MIDDLE mass, separated from the arms.
       *
       * Added round 33 because the daylight complaint could not be acted on without it. Total
       * silhouette width was already within a few percent of the sheet at every band while the
       * daylight covered 30% of the run against 75%, i.e. the render spends as TORSO the width
       * the art spends as AIR. `widthAt` cannot see that — it is arm-tip to arm-tip and is
       * identical either way — and two rounds were spent moving the arms because the only
       * number on the table was an arm number.
       *
       * Where three masses read the middle one is the torso. Where fewer read, the torso is
       * fused to an arm and there is no honest number, so this reports null rather than the
       * whole span: a fused row is the defect, not a measurement of it.
       */
      const torsoAt = (f) => {
        const rs = runsAt(f);
        if (!rs.length) return null;
        const out = [];
        for (let i = 0; i < rs.length; i++) {
          if (i) out.push(-(rs[i][0] - rs[i - 1][1]) / hpx);   // negative = daylight
          out.push((rs[i][1] - rs[i][0]) / hpx);
        }
        return out;
      };
      // Fraction of the 0.80..0.36 H band (shoulder to hand on both the sheet and the rig)
      // that shows daylight at all. A gap that exists over 10% of the arm is not daylight.
      let bandN = 0, bandHit = 0;
      for (let f = 0.80; f >= 0.36; f -= 0.004) { bandN++; if (runsAt(f).length >= 3) bandHit++; }

      // JOINT TROUGHS — a limb's width along its own length dips at every joint, so the
      // minima ARE the elbow, wrist, knee, ankle. This is the measurement the round-28
      // builder had to derive by hand to re-split the upper arm.
      const limbProfile = (lo, hi, pick) => {
        const out = [];
        for (let f = hi; f >= lo; f -= 0.004) {
          const rs = runsAt(f);
          const r = pick(rs);
          if (r) out.push({ f, w: (r[1] - r[0]) / hpx, c: ((r[0] + r[1]) / 2 - cx) / hpx });
        }
        return out;
      };
      // local minima, ignoring shallow noise
      const troughsIn = (prof) => {
        const t = [];
        for (let i = 2; i < prof.length - 2; i++) {
          const w = prof[i].w;
          if (w < prof[i - 2].w && w < prof[i + 2].w &&
              w < Math.min(prof[i - 2].w, prof[i + 2].w) * 0.94) t.push({ at: prof[i].f, w });
        }
        // collapse neighbours into one joint
        return t.filter((v, i) => i === 0 || Math.abs(v.at - t[i - 1].at) > 0.02);
      };
      const legL = limbProfile(0.04, crotch ? crotch - 0.01 : 0.45, (rs) => rs.length >= 2 ? rs[0] : null);
      const legR = limbProfile(0.04, crotch ? crotch - 0.01 : 0.45, (rs) => rs.length >= 2 ? rs[rs.length - 1] : null);
      const armL = limbProfile(armBot ?? 0.45, armTop ?? 0.80, (rs) => rs.length >= 3 ? rs[0] : null);
      const armR = limbProfile(armBot ?? 0.45, armTop ?? 0.80, (rs) => rs.length >= 3 ? rs[rs.length - 1] : null);

      // SYMMETRY — a symmetric pose that measures asymmetric means a mirroring or winding
      // bug, which this file has had before.
      let asym = 0, asymN = 0;
      for (let f = 0.10; f <= 0.90; f += 0.01) {
        const e = edgesOn(Math.round(sole - f * hpx));
        if (e) { asym += Math.abs((e[1] - cx) - (cx - e[0])) / hpx; asymN++; }
      }
      return { x0: fx0, x1: fx1, crown, sole, hpx, maxW, maxAt, shoulder, waist, hips,
               crotch, crotchFloored, armTop, armBot, asym: asymN ? asym / asymN : null,
               gapL: med(gapsL), gapR: med(gapsR), gapCover: bandN ? bandHit / bandN : 0,
               torso: Object.fromEntries(
                 [0.775, 0.720, 0.655, 0.600, 0.545, 0.480].map((f) => [f, torsoAt(f)])),
               joints: { legL: troughsIn(legL), legR: troughsIn(legR),
                         armL: troughsIn(armL), armR: troughsIn(armR) },
               widths: Object.fromEntries(
                 [0.95, 0.90, 0.845, 0.79, 0.755, 0.655, 0.545, 0.415, 0.285, 0.10]
                   .map((f) => [f, widthAt(f)])),
               /*
                * THE WHOLE WIDTH CURVE, plus where the silhouette's two EDGES are relative to
                * this figure's own centre. Added round 35, because the six sampled `torso` rows
                * and ten `widths` rows could not answer the question the hip defect actually
                * turned on.
                *
                * `hips` is `peak(0.46, 0.60)`, a single number. The render reported 0.192 at
                * 0.584 H and the sheet 0.161 at 0.492 H — a 19.2% overage AND a `LANDMARK
                * MOVED` 0.092 H apart, which are two different findings that one number cannot
                * separate: a figure uniformly too deep, and a figure whose deepest point is
                * somewhere else entirely, print identically here. Dumping the curve shows in one
                * look which it is.
                *
                * `front`/`back` matter because the profile figure's overage turned out to be
                * partly REGISTRATION, not size: the overlay puts render-only mass down the
                * front and art-only mass down the back, which a width-only reading cannot see
                * at all. Signed edge offsets make that measurable instead of a picture.
                */
               prof: (() => {
                 const o = [];
                 for (let f = 0.44; f <= 0.72001; f += 0.01) {
                   const y = Math.round(sole - f * hpx);
                   const e = (y >= 0 && y < H) ? edgesOn(y) : null;
                   o.push(e ? { f: +f.toFixed(3), w: (e[1] - e[0]) / hpx,
                                front: (e[1] - cx) / hpx, back: (cx - e[0]) / hpx } : null);
                 }
                 return o.filter(Boolean);
               })() };
    });
  }, { url, FIGS, BAND: band, THRESH });
}

const fmt = (v) => (v == null ? '  —  ' : v.toFixed(3));
const rows = await measure(IMG);
const refRows = REF ? await measure(REF, RBAND) : null;
await browser.close();

console.log(`\n  ${path.basename(IMG)}${REF ? `   vs   ${path.basename(REF)}` : ''}`);
console.log(`  ${rows.length} figure(s) found${refRows ? `, ${refRows.length} in reference` : ''}\n`);

/*
 * ⚠️ FIGURES ARE PAIRED BY POSITION, AND ON THIS PROJECT THAT SILENTLY MEASURES THE WRONG
 * ROBOT. John caught it on 2026-08-14. `hunter.js` builds the hunter by scaling `buildUnit4H`
 * 2.60x, so the scale-reference player standing beside it is the SAME robot in the same
 * materials — a crop of one is entirely plausible as the other. Two ways that bites:
 *
 *   FIGURE 1 IS THE PLAYER. It is leftmost, so on a hunter view it takes slot 1 (measured:
 *   397px against the hunter's 841px) and `figure 1` in this table is the base robot.
 *
 *   OR THEY MERGE. On hunter-stage's default 26deg frame the two silhouettes touch, this
 *   reports "1 figure(s) found" for two robots, and every width below is a hunter+player
 *   composite — the 0.480H cross-section comes out as one unbroken 1.174H run. That is the
 *   frame all five hunter verdicts were filed against.
 *
 * Neither case errors. Both print a complete, plausible, wrong table. So: warn on a count
 * mismatch, and print each figure's height so a reader can see which one they are reading.
 *
 * ⚠️ THE WARNING BELOW DOES NOT CATCH THE MERGE CASE, AND CANNOT. Two robots fused into one
 * blob report "1 figure(s) found, 1 in reference" — the counts agree, so counting is blind to
 * it, and it is the worse of the two failures. The only instrument that catches it is an
 * explicit crop whose BORDER is checked for subject pixels; `harness/hunter-critique.mjs`
 * does that and refuses to print numbers when it fails. Measure isolated crops, not frames.
 */
if (refRows && rows.length !== refRows.length) {
  console.log(`  ⚠️  FIGURE COUNT MISMATCH — ${rows.length} in the render, ${refRows.length} in the reference.`);
  console.log(`      Figures pair BY POSITION, so this table may be comparing different subjects.`);
  console.log(`      Crop to one isolated figure per side before believing any number below.\n`);
} else if (rows.length > 1) {
  console.log(`  ⚠️  ${rows.length} figures — pairing is BY POSITION (leftmost first). On a hunter view`);
  console.log(`      figure 1 is the scale-reference PLAYER, not the hunter. Check the heights.\n`);
}

rows.forEach((f, i) => {
  const r = refRows?.[i];
  console.log(`  figure ${i + 1}   height ${f.hpx}px${r ? `   (ref ${r.hpx}px)` : ''}`);
  for (const key of ['shoulder', 'waist', 'hips']) {
    const a = f[key], b = r?.[key];
    const dw = b ? `${(((a.w - b.w) / b.w) * 100).toFixed(1)}%`.padStart(7) : '';
    const dh = b ? `   at ${a.at.toFixed(3)} vs ${b.at.toFixed(3)}` +
      (Math.abs(a.at - b.at) > 0.02 ? '  <-- LANDMARK MOVED' : '') : `   at ${a.at.toFixed(3)}`;
    console.log(`    ${key.padEnd(9)} ${fmt(a.w)}${b ? `  ref ${fmt(b.w)}  ${dw}` : ''}${dh}`);
  }
  // structure derived from per-row RUNS — invisible to a width profile alone
  const pf = (v) => (v == null ? '  —  ' : v.toFixed(3));
  const dd = (a, b) => (a != null && b != null) ? `  Δ ${(a - b >= 0 ? '+' : '') + (a - b).toFixed(3)}H` : '';
  const crotchNote = (f.crotchFloored || r?.crotchFloored)
    ? `   <-- UNRESOLVED (hit the 0.06 scan floor${f.crotchFloored && r?.crotchFloored ? ', both' : f.crotchFloored ? ', render' : ', ref'}` +
      `): the legs read as one mass at the lowest sample, which the CONTACT SHADOW between the feet` +
      ` is usually enough to cause. Not evidence about leg splay — look at the pixels.`
    : '';
  console.log(`    crotch    ${pf(f.crotch)}${r ? `  ref ${pf(r.crotch)}${dd(f.crotch, r.crotch)}` : ''}${crotchNote}`);
  console.log(`    arm gap   ${pf(f.armTop)}..${pf(f.armBot)}` +
    (r ? `  ref ${pf(r.armTop)}..${pf(r.armBot)}` : '') +
    (f.armTop == null ? '   <-- NO DAYLIGHT between arm and torso' : ''));
  console.log(`    arm daylight  median L ${pf(f.gapL)} R ${pf(f.gapR)} H` +
    (r ? `  ref L ${pf(r.gapL)} R ${pf(r.gapR)}` : '') +
    `   covers ${(f.gapCover * 100).toFixed(0)}% of the 0.80..0.36 band` +
    (r ? ` (ref ${(r.gapCover * 100).toFixed(0)}%)` : ''));
  if (f.asym != null) console.log(`    asymmetry ${pf(f.asym)} H mean L/R` + (f.asym > 0.01 ? '   <-- CHECK, pose is symmetric' : ''));
  // Joint troughs are PROVISIONAL. The mechanism is sound — a limb narrows at every joint,
  // so minima in its width profile are the elbow, wrist, knee, ankle — but the detection is
  // not yet robust: on a symmetric pose the two sides can disagree in count, which means at
  // least one side is wrong. Self-flag that rather than let a number be quoted as fact.
  const nL = (f.joints?.legL || []).length, nR = (f.joints?.legR || []).length;
  const aL = (f.joints?.armL || []).length, aR = (f.joints?.armR || []).length;
  const shaky = nL !== nR || aL !== aR;
  for (const k of ['legL', 'legR', 'armL', 'armR']) {
    const mine = (f.joints?.[k] || []).map((t) => t.at.toFixed(3)).join(' ');
    const theirs = (r?.joints?.[k] || []).map((t) => t.at.toFixed(3)).join(' ');
    if (mine || theirs) console.log(`    ${k.padEnd(9)} joints at ${mine || '—'}${r ? `   ref ${theirs || '—'}` : ''}`);
  }
  if (shaky) console.log(`    ^ joint troughs UNRELIABLE here — left/right counts disagree on a`+
    ` symmetric pose, so at least one side is wrong. Treat as a hint, not a measurement.`);
  // TORSO ONLY — the middle mass with the arms taken off it. `—` means the arm is fused to
  // the torso at that height and the silhouette has no torso edge to measure.
  console.log(`    cross-section (mass | air | mass ...), H fractions:`);
  const xs = (a) => (a == null ? '—' :
    a.map((v) => (v < 0 ? `[${(-v).toFixed(3)}]` : v.toFixed(3))).join(' '));
  for (const k of Object.keys(f.torso || {})) {
    console.log(`      ${(+k).toFixed(3)}   ${xs(f.torso[k]).padEnd(42)}${r ? `ref  ${xs(r.torso?.[k])}` : ''}`);
  }
  console.log(`    raw width at fixed H-fraction (only comparable where landmarks agree):`);
  for (const k of Object.keys(f.widths)) {
    const a = f.widths[k], b = r?.widths[k];
    const delta = (a != null && b != null && b > 0) ? `${(((a - b) / b) * 100).toFixed(1)}%` : '';
    console.log(`      ${(+k).toFixed(3)}   ${fmt(a)}${r ? `   ${fmt(b)}   ${delta.padStart(7)}` : ''}`);
  }
  // `--prof` — the whole 0.44..0.72 width curve with signed front/back edges. Off by default:
  // it is 29 rows per figure and only earns its space when a hip/pelvis defect is in play.
  if (PROF && f.prof?.length) {
    console.log(`    width curve 0.44..0.72 H  (w = width, F/B = front/back edge from centre):`);
    console.log(`        H      w      F      B  ${r ? '|  ref w   refF   refB   dw%' : ''}`);
    const byF = new Map((r?.prof || []).map((p) => [p.f, p]));
    for (const p of f.prof) {
      const q = byF.get(p.f);
      const d = q && q.w > 0 ? `${(((p.w - q.w) / q.w) * 100).toFixed(1)}%` : '';
      console.log(`      ${p.f.toFixed(2)}  ${p.w.toFixed(3)}  ${p.front.toFixed(3)}  ${p.back.toFixed(3)}  ` +
        (q ? `|  ${q.w.toFixed(3)}  ${q.front.toFixed(3)}  ${q.back.toFixed(3)}  ${d.padStart(6)}` : ''));
    }
  }
  console.log('');
});

if (refRows) {
  console.log('  Delta is (render - art) / art. Negative = the render is narrower than the sheet.');
  console.log('  Silhouette only. Anything that is a design judgement is not in this table by design.\n');
}
