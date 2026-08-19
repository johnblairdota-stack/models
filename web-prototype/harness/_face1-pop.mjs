/*
 * builder-face — THE FACE POLARITY INSTRUMENT.
 *
 * THE DEFECT IT MEASURES. The art's visor is a DARK screen with BRIGHT eyes glowing out of it.
 * The render's was a PALE screen with eyes that barely rose above it. Both images can be
 * "bright enough" on an absolute meter and still be opposite characters, so the statistic here
 * is a RATIO — the eyes' p90 luma minus the screen's median luma, over the same region — and
 * that is the number to move. An absolute eye brightness is NOT the number: pushing emissive
 * alone clips the eye to white and measures better while reading worse.
 *
 * WHY IT FINDS THE VISOR RATHER THAN TAKING A CROP BOX. A hand-typed box is the thing that made
 * the original report ambiguous — two boxes over the same face produced two different verdicts
 * ("eyes dark" vs "flat / no contrast"). The visor is segmented instead, by the one property
 * nothing else on this character has: blue chroma with b > g. That excludes
 *   - the champagne shell and the chrome  (b - r about 0)
 *   - the MINT caps, which are also b > r (#66CCB4 gives b - r = 78, the same as the screen)
 *     but are TEAL, i.e. g > b. The `b > g` half of the test is entirely there for the mint,
 *     and `--dump` writes the mask so it can be looked at rather than trusted.
 *
 * Reported at two apertures — the segmented visor itself, and that bbox padded 15% — because
 * the disagreement in the original report was between two apertures. If the two disagree in
 * DIRECTION here, the reading is not to be believed.
 *
 * CONTROLS (`--selftest`), each of which was watched failing before it was watched passing:
 *   C1  a flat mid-grey plate must report pop 0.000. Catches a statistic that manufactures
 *       contrast out of nothing.
 *   C2  the art measured with its eyes painted out at the screen's own value must lose its pop.
 *       Catches "the p90 is picking up the bezel / the rim / the background", which is the way
 *       this measurement fails silently.
 *   C3  art and render must not report the same numbers. Catches the locator finding the same
 *       thing in both images (e.g. latching onto a shared background).
 *
 * usage: node harness/_face1-pop.mjs <img.png> [<img2.png> ...] [--dump <dir>] [--selftest]
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const args = process.argv.slice(2);
const dumpAt = args.indexOf('--dump');
const dumpDir = dumpAt >= 0 ? args[dumpAt + 1] : null;
// ⚠️ the value AFTER --dump is not a file. Dropping only args starting with '--' fed the dump
// directory to readFileSync as an image (EISDIR) — an arg filter has to know about arity.
// ⚠️ the `dumpAt >= 0` guard is load-bearing: with no --dump, dumpAt is -1 and `i !== dumpAt+1`
// silently drops argv[0], i.e. the first image. It did, and the run still printed a tidy report
// for the remaining file and a green control count for a file nobody asked about.
/*
 * ⚠️ --roi EXISTS BECAUSE "THE LARGEST BLUE REGION" IS ONLY THE FACE ON A WHITE CYC. On the
 * estate captures the biggest blue-ish component is a moonlit DOORWAY, and the instrument
 * happily measured it — reporting numbers that were IDENTICAL between two arms whose faces were
 * visibly different, which is how the mistake was caught. Identical statistics across a changed
 * render are not reassurance, they are a symptom. --list prints every candidate so the region is
 * chosen by looking rather than by hoping.
 */
const roiAt = args.indexOf('--roi');
const roi = roiAt >= 0 ? args.slice(roiAt + 1, roiAt + 5).map(Number) : null;
const wantList = args.includes('--list');
const files = args.filter((a, i) => !a.startsWith('--')
  && !(dumpAt >= 0 && i === dumpAt + 1)
  && !(roiAt >= 0 && i > roiAt && i <= roiAt + 4));
const selftest = args.includes('--selftest');
if (dumpDir) mkdirSync(resolve(dumpDir), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();

/*
 * Everything below runs in the page because there is no image library in node_modules — the
 * same reason `_crit_crop.mjs` goes through a canvas. `mode` selects the synthetic controls.
 */
async function measure(inPath, mode = 'normal', roiBox = roi, list = false) {
  const b64 = readFileSync(resolve(inPath)).toString('base64');
  return page.evaluate(async ({ url, mode, roiBox, list }) => {
    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
    });
    const W = img.width, H = img.height;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;

    const lum = (i) => (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;

    // --- segment: blue chroma, and b > g so the teal shoulder caps cannot qualify.
    const mask = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) {
      const i = p * 4;
      if (d[i + 3] < 128) continue;
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if (b - r > 28 && b > gg + 4) mask[p] = 1;
    }
    if (roiBox) {
      const [rx, ry, rw, rh] = roiBox;
      for (let p = 0; p < W * H; p++) {
        const x = p % W, y = (p / W) | 0;
        if (x < rx || x >= rx + rw || y < ry || y >= ry + rh) mask[p] = 0;
      }
    }

    // --- largest connected component (4-neighbour flood, iterative — a recursive fill
    //     blows the stack on a 1080p region and would fail as a crash, not a wrong number).
    const seen = new Int32Array(W * H).fill(-1);
    let best = null, id = 0;
    const stack = [];
    for (let p0 = 0; p0 < W * H; p0++) {
      if (!mask[p0] || seen[p0] >= 0) continue;
      stack.length = 0; stack.push(p0); seen[p0] = id;
      let n = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
      while (stack.length) {
        const p = stack.pop();
        const x = p % W, y = (p / W) | 0;
        n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
        for (const q of nb) if (q >= 0 && mask[q] && seen[q] < 0) { seen[q] = id; stack.push(q); }
      }
      if (!best || n > best.n) best = { n, x0, x1, y0, y1, id };
      if (list) (window.__cands ||= []).push({ n, x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
      id++;
    }
    if (!best) return { error: 'no blue region found' };
    if (list) {
      const cands = (window.__cands || []).sort((a, b) => b.n - a.n).slice(0, 6);
      window.__cands = [];
      return { W, H, candidates: cands };
    }

    /*
     * ⚠️ HOLE-FILL, AND IT IS NOT COSMETIC — WITHOUT IT THE MASK DELETES THE EYES IT EXISTS TO
     * MEASURE. The visor is segmented on blue chroma (b - r > 28), but a bright eye is nearly
     * WHITE, and white has b - r about 0. So the brightest texels on the plate — the only ones
     * that carry the pop — fail the chroma test and punch holes in the mask. The statistic then
     * reports the screen against itself and the eyes are simply absent from the population.
     * Any texel inside the visor's bbox that the background cannot reach is interior, so the
     * complement is flooded from the bbox border and whatever it does not reach is filled in.
     */
    {
      const bx0 = best.x0, bx1 = best.x1, by0 = best.y0, by1 = best.y1;
      const bw = bx1 - bx0 + 1, bh = by1 - by0 + 1;
      const out = new Uint8Array(bw * bh);
      const st = [];
      for (let x = 0; x < bw; x++) { st.push(x); st.push((bh - 1) * bw + x); }
      for (let y = 0; y < bh; y++) { st.push(y * bw); st.push(y * bw + bw - 1); }
      while (st.length) {
        const q = st.pop();
        if (out[q]) continue;
        const lx = q % bw, ly = (q / bw) | 0;
        if (mask[(by0 + ly) * W + (bx0 + lx)]) continue;   // blocked by the visor itself
        out[q] = 1;
        if (lx > 0) st.push(q - 1);
        if (lx < bw - 1) st.push(q + 1);
        if (ly > 0) st.push(q - bw);
        if (ly < bh - 1) st.push(q + bw);
      }
      for (let ly = 0; ly < bh; ly++) {
        for (let lx = 0; lx < bw; lx++) {
          if (!out[ly * bw + lx]) mask[(by0 + ly) * W + (bx0 + lx)] = 1;
        }
      }
    }

    /*
     * ⚠️ THE SECOND APERTURE HAS TO BE A GENUINELY DIFFERENT PIXEL SET, and the first version of
     * this was not: padding the BOX while still filtering by the mask returns the identical
     * texels, because every masked texel is inside the tight bbox by construction. It printed
     * two lines that always agreed and would have agreed on a broken reading too.
     * `useMask=false` takes EVERY pixel in the padded box — bezel, shell and all — which is what
     * a hand-typed crop box actually does, and is the aperture the original report disagreed on.
     */
    const stat = (pad, useMask = true) => {
      const bw = best.x1 - best.x0 + 1, bh = best.y1 - best.y0 + 1;
      const px = Math.round(bw * pad), py = Math.round(bh * pad);
      const ax0 = Math.max(0, best.x0 - px), ax1 = Math.min(W - 1, best.x1 + px);
      const ay0 = Math.max(0, best.y0 - py), ay1 = Math.min(H - 1, best.y1 + py);
      const vals = [];
      for (let y = ay0; y <= ay1; y++) {
        for (let x = ax0; x <= ax1; x++) {
          const p = y * W + x;
          if (useMask && !mask[p]) continue;  // visor only; useMask=false is the crop-box aperture
          let v = lum(p * 4);
          if (mode === 'flat') v = 0.5;    // C1
          vals.push(v);
        }
      }
      vals.sort((a, b) => a - b);
      const q = (f) => vals[Math.min(vals.length - 1, Math.max(0, Math.round(f * (vals.length - 1))))];
      /*
       * FLATNESS, and it is a guard rather than a curiosity. Round 31 of this plate fixed a
       * screen that ran bright at the top and near-black under the jaw — the studio
       * environment's lower hemisphere is dark and the cap wraps under — and the emissive
       * floor's `low` grade is the compensation for it. Darkening the screen by cutting that
       * floor therefore walks straight back toward the same defect, so the top-half / bottom-half
       * split is measured every run. The sheet's own screen is flat to within about 0.08.
       */
      const yMid = (ay0 + ay1) / 2;
      const hi = [], lo = [];
      for (let y = ay0; y <= ay1; y++) {
        for (let x = ax0; x <= ax1; x++) {
          const p = y * W + x;
          if (useMask && !mask[p]) continue;
          (y < yMid ? hi : lo).push(mode === 'flat' ? 0.5 : lum(p * 4));
        }
      }
      hi.sort((a, b) => a - b); lo.sort((a, b) => a - b);
      const medOf = (a) => (a.length ? a[(a.length / 2) | 0] : NaN);

      /*
       * 🚨 THE HEADLINE STATISTIC IS A SEGMENTATION, NOT A PERCENTILE, and the first version of
       * this file got that wrong in a way that inverted a verdict.
       *
       * `p90 - median` only means "eyes minus screen" if the lit strokes occupy MORE than 10% of
       * the visor. They do not always: measured here the art's strokes cover a larger share of
       * its screen than this rig's do. So when a candidate correctly darkened the screen, p90
       * stopped landing on an eye at all and slid down onto plain screen — and the report said
       * the pop had COLLAPSED to +0.048 when what had actually happened was that the eyes had
       * become a smaller bright minority against a darker field, which is the intended direction.
       * A percentile silently changes what it is measuring when the population changes shape.
       *
       * So the strokes are separated by VALUE the same way the visor is separated from the shell
       * by chroma: threshold midway between the screen's median and the plate's p99.5, then
       * report the two populations independently. `litFrac` is reported alongside because it is
       * the term that broke the percentile, and because "our eyes cover less of the plate than
       * the art's" is a real finding rather than a nuisance.
       */
      const p995 = q(0.995), med0 = q(0.50);
      const thresh = med0 + 0.45 * (p995 - med0);
      const dark = [], lit = [];
      for (const v of vals) (v > thresh ? lit : dark).push(v);

      /*
       * 🚨 EYE CHROMA, ADDED BECAUSE THE PICTURE CAUGHT WHAT EVERY NUMBER ABOVE IS BLIND TO.
       * With the screen landed within 0.001 of the art, the face was still wrong: the art's
       * eyes are CYAN and these rendered as WHITE pills. Luma cannot see that — a white eye and
       * a cyan eye of the same brightness are the same number — so a run can hit every target
       * here and still be the wrong character. Reported as (G+B)/2 - R over the lit texels, in
       * 0-255 levels, which is the same statistic mintCap() uses for the shoulder caps and for
       * the same reason: this pipeline tonemaps, and tonemapping desaturates bright values.
       */
      let cn = 0, csum = 0, sn = 0, ssum = 0;
      for (let y = ay0; y <= ay1; y++) {
        for (let x = ax0; x <= ax1; x++) {
          const p = y * W + x;
          if (useMask && !mask[p]) continue;
          const i = p * 4;
          const ch = ((d[i + 1] + d[i + 2]) / 2) - d[i];
          if (lum(i) > thresh) { csum += ch; cn++; } else { ssum += ch; sn++; }
        }
      }
      // A plate with no strokes at all (the C1 flat control) leaves `lit` empty, and a median of
      // nothing is NaN — which propagates into POP and reads as a broken instrument rather than
      // as the correct answer. No strokes means no pop; say so.
      if (!lit.length) { lit.push(medOf(dark)); }
      return {
        n: vals.length, box: [ax0, ay0, ax1 - ax0 + 1, ay1 - ay0 + 1],
        med: q(0.50), p90: q(0.90), p99: q(0.99), p10: q(0.10),
        screen: medOf(dark), eye: medOf(lit), litFrac: lit.length / vals.length,
        eyeChroma: cn ? csum / cn : NaN, screenChroma: sn ? ssum / sn : NaN,
        pop: medOf(lit) - medOf(dark),
        popP90: q(0.90) - q(0.50),
        hi: medOf(hi), lo: medOf(lo), tilt: medOf(hi) - medOf(lo),
      };
    };

    // C2 — repaint anything above the screen's own median down TO that median, i.e. delete the
    // eyes and keep everything else. A statistic that still reports a pop after this is not
    // measuring the eyes.
    if (mode === 'noeyes') {
      const vals = [];
      for (let p = 0; p < W * H; p++) if (mask[p]) vals.push(lum(p * 4));
      vals.sort((a, b) => a - b);
      const med = vals[(vals.length / 2) | 0];
      for (let p = 0; p < W * H; p++) {
        if (!mask[p]) continue;
        if (lum(p * 4) > med) {
          const i = p * 4;
          const k = med / Math.max(1e-6, lum(i));
          d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
        }
      }
      g.putImageData(new ImageData(d, W, H), 0, 0);
    }

    // The `noeyes` repaint above mutates `d` IN PLACE and `stat` reads `d`, so both apertures
    // below already see the repainted image. An earlier version re-read the canvas afterwards
    // and assigned `out.pad = out.tight`, which destroyed the very comparison C2 needs.
    const out = { W, H, tight: stat(0.0, true), pad: stat(0.15, false) };
    // mask picture, so the segmentation is looked at rather than trusted
    const mc = document.createElement('canvas'); mc.width = W; mc.height = H;
    const mg = mc.getContext('2d'); mg.drawImage(img, 0, 0);
    const md = mg.getImageData(0, 0, W, H);
    for (let p = 0; p < W * H; p++) if (mask[p]) { md.data[p * 4] = 255; md.data[p * 4 + 1] = 0; md.data[p * 4 + 2] = 255; }
    mg.putImageData(md, 0, 0);
    out.maskUrl = mc.toDataURL('image/png');
    return out;
  }, { url: `data:image/png;base64,${b64}`, mode, roiBox, list });
}

const fmt = (s) => `n=${String(s.n).padStart(6)} screen=${s.screen.toFixed(3)} eye=${s.eye.toFixed(3)}`
  + ` lit=${(s.litFrac * 100).toFixed(1)}%  POP=${s.pop >= 0 ? '+' : ''}${s.pop.toFixed(3)}`
  + `  tilt=${s.tilt >= 0 ? '+' : ''}${s.tilt.toFixed(3)}`
  + `  eyeChroma=${s.eyeChroma.toFixed(1)} screenChroma=${s.screenChroma.toFixed(1)}`;

for (const f of files) {
  if (wantList) {
    const r = await measure(f, 'normal', roi, true);
    console.log(`\n${basename(f)}  (${r.W}x${r.H})  blue components, largest first:`);
    for (const c of r.candidates) console.log(`   n=${String(c.n).padStart(6)}  box=${c.x0},${c.y0},${c.w},${c.h}`);
    continue;
  }
  const r = await measure(f);
  if (r.error) { console.log(`${basename(f)}: ${r.error}`); continue; }
  console.log(`\n${basename(f)}  (${r.W}x${r.H})`);
  console.log(`   tight  ${fmt(r.tight)}`);
  console.log(`   pad15  ${fmt(r.pad)}`);
  const agree = Math.sign(r.tight.pop) === Math.sign(r.pad.pop);
  console.log(`   apertures ${agree ? 'AGREE' : '*** DISAGREE IN DIRECTION — do not believe this reading ***'}`);
  if (dumpDir) {
    writeFileSync(resolve(dumpDir, basename(f).replace(/\.png$/, '') + '_mask.png'),
      Buffer.from(r.maskUrl.split(',')[1], 'base64'));
  }
}

if (selftest) {
  console.log('\n--- CONTROLS ---');
  let pass = 0, fail = 0;
  const chk = (name, ok, detail) => { if (ok) { pass++; console.log(`  ok   ${name}  ${detail}`); } else { fail++; console.log(`  FAIL ${name}  ${detail}`); } };

  const c1 = await measure(files[0], 'flat');
  chk('C1 flat plate reports zero pop', Math.abs(c1.tight.pop) < 1e-6, `pop=${c1.tight.pop.toFixed(6)}`);

  const c2 = await measure(files[0], 'noeyes');
  const c2base = await measure(files[0]);
  chk('C2 eyes deleted -> segmented pop collapses', c2.tight.pop < c2base.tight.pop * 0.34,
    `pop ${c2base.tight.pop.toFixed(3)} -> ${c2.tight.pop.toFixed(3)}`);
  /*
   * C2b IS THE CONTROL THAT MUST FAIL, and it is why the two apertures are both reported.
   * Delete the eyes and the CROP-BOX aperture keeps almost all of its pop, because its p90 is
   * the white shell around the plate and not the eyes at all — on the art it reads p90 1.000,
   * which is paper. So a hand-typed box over this face measures the BEZEL. That is the
   * mechanism behind the two contradictory verdicts in the original report, and it is the
   * reason this instrument segments instead of cropping. If C2b ever starts collapsing too,
   * the padded aperture has stopped including the shell and the cross-check is dead.
   */
  chk('C2b eyes deleted -> CROP-BOX pop survives (it was never measuring the eyes)',
    c2.pad.pop > c2base.pad.pop * 0.60,
    `pop ${c2base.pad.pop.toFixed(3)} -> ${c2.pad.pop.toFixed(3)} (p90 ${c2.pad.p90.toFixed(3)})`);

  if (files[1]) {
    const a = await measure(files[0]), b = await measure(files[1]);
    chk('C3 two different images differ', Math.abs(a.tight.med - b.tight.med) > 0.005,
      `med ${a.tight.med.toFixed(3)} vs ${b.tight.med.toFixed(3)}`);
  }
  console.log(`\n  ${pass}/${pass + fail} controls pass`);
}

await browser.close();
