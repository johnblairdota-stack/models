#!/usr/bin/env node
/**
 * WHAT MATERIAL EACH REGION ACTUALLY RENDERS AS — the per-region confirmation for
 * `docs/design/player-material-spec.md`.
 *
 *   node harness/evidence/_mat4_regions.mjs --beauty <shot.png> <region>=<mask.png> ...
 *
 * THE PROBLEM THIS SOLVES. "Is the forearm white now?" cannot be answered by drawing a box on
 * the capture: the figure is POSED, so a box that lands on the forearm in one build lands on the
 * hip in the next, and every number it produces is confidently wrong. `_two2_ratio.mjs` hit this
 * and switched to selecting with a shader mask; this does the same thing with a mask that can
 * name any single region.
 *
 * HOW. `?famprobe=<region>&weather=debug5` makes the shader paint exactly one region red and
 * everything else black, using THE SAME PREDICATE the shipping shader classifies bones with
 * (RRW_REGION in `src/materials/surfaces/robot.js` — shared on purpose; a probe with its own
 * idea of where the forearm is would measure some other pixels and agree with the render only
 * when both were wrong). The mask capture and the beauty capture are the same URL otherwise, and
 * shoot.mjs is deterministic to a fixed sim time and frame, so the two are pixel-aligned.
 *
 * THE ALIGNMENT IS ASSERTED, NOT ASSUMED: a mask whose selected pixels land on background in the
 * beauty shot means the two captures drifted, and the script says so rather than reporting the
 * colour of the studio wall as a forearm.
 *
 * WHAT IS REPORTED, per region, over the beauty capture's pixels inside that mask:
 *   luma      median, 0-255. The value.
 *   /plate    that median as a RATIO of the chest plate's. A ratio survives an exposure change
 *             and an absolute luma does not, which matters because nothing here is exposure
 *             matched to the art.
 *   p05/p95   the spread. THIS is what separates a metal from a shaded plastic: a metal
 *             RESOLVES its environment and therefore has a wide range, a diffuse plate averages
 *             it and has a narrow one. Two regions can share a median and be different
 *             materials, which is exactly the failure mode of the round this replaces.
 *   R-B       hue lean. The shell is a warm champagne; chrome is neutral-to-cool.
 */
import { toDataURL, openCanvasPage } from '../imglib.mjs';

const args = process.argv.slice(2);
const bi = args.indexOf('--beauty');
if (bi < 0) { console.error('need --beauty <file>'); process.exit(2); }
const beautyFile = args[bi + 1];
const pairs = args.filter((a, i) => i !== bi && i !== bi + 1 && a.includes('='))
  .map((a) => { const i = a.indexOf('='); return [a.slice(0, i), a.slice(i + 1)]; });

const { browser, page } = await openCanvasPage();

const load = async (file, slot) => {
  const url = await toDataURL(file);
  await page.evaluate(async ({ url, slot }) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    window[slot] = { d: g.getImageData(0, 0, c.width, c.height).data, W: c.width, H: c.height };
  }, { url, slot });
};

await load(beautyFile, '__beauty');

const stat = async (maskFile) => {
  await load(maskFile, '__mask');
  return page.evaluate(() => {
    const B = window.__beauty, M = window.__mask;
    if (B.W !== M.W || B.H !== M.H) return { err: 'size mismatch' };
    const lum = [], rb = [];
    let sel = 0, onBg = 0;
    for (let p = 0; p < B.W * B.H; p++) {
      const i = p * 4;
      // The debug readout is a pure-red paint that survives the tonemap; the studio gradient is
      // neutral. Requiring red to LEAD by a wide margin is what keeps a bright grey wall out.
      if (!(M.d[i] > 90 && M.d[i] - M.d[i + 1] > 55 && M.d[i] - M.d[i + 2] > 55)) continue;
      sel++;
      const r = B.d[i], g = B.d[i + 1], b = B.d[i + 2];
      /*
       * THE ALIGNMENT CHECK, AND THE FALSE POSITIVE IT HAD ON ITS FIRST RUN.
       *
       * The studio background is a smooth near-neutral gradient, so "bright and perfectly
       * achromatic" looks like a good test for a mask that has drifted off the figure. It is
       * not: CHROME IS ALSO BRIGHT AND ACHROMATIC, and the first run flagged the upper arm, the
       * waist and the inner thigh — i.e. exactly and only the three regions this round turned
       * chrome — at 3.8-4.5%, while reporting every white region clean. That is the signature of
       * the test measuring the material rather than the alignment.
       *
       * The alignment is instead proven by running the SAME masks over the pre-round capture,
       * where those regions were dark grey: that run reports 0% on every region, which it could
       * not do if the masks were landing on the studio wall. So the threshold here is raised
       * above anything on the figure and the flag is advisory.
       */
      if (r > 236 && Math.abs(r - g) < 2 && Math.abs(g - b) < 2 && Math.abs(r - b) < 2) onBg++;
      lum.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
      rb.push(r - b);
    }
    if (!sel) return { err: 'mask selected nothing' };
    lum.sort((a, b) => a - b); rb.sort((a, b) => a - b);
    const q = (arr, f) => arr[Math.min(arr.length - 1, Math.floor(arr.length * f))];
    return {
      px: sel, bgFrac: +(onBg / sel).toFixed(3),
      med: +q(lum, 0.5).toFixed(1), p05: +q(lum, 0.05).toFixed(1), p95: +q(lum, 0.95).toFixed(1),
      rb: +q(rb, 0.5).toFixed(1),
    };
  });
};

const out = [];
for (const [label, file] of pairs) out.push({ label, ...(await stat(file)) });
await browser.close();

const plate = out.find((r) => r.label === 'chest');
const ref = plate && !plate.err ? plate.med : null;

console.log(`\nbeauty: ${beautyFile}`);
console.log('region        px      luma   /plate    p05    p95  spread   R-B   bg?');
for (const r of out) {
  if (r.err) { console.log(r.label.padEnd(12), 'ERROR:', r.err); continue; }
  console.log(
    r.label.padEnd(12), String(r.px).padStart(7),
    String(r.med).padStart(8),
    (ref ? (r.med / ref).toFixed(3) : '-').padStart(8),
    String(r.p05).padStart(7), String(r.p95).padStart(7),
    String(+(r.p95 - r.p05).toFixed(1)).padStart(7),
    String(r.rb).padStart(6),
    (r.bgFrac > 0.02 ? `  ${(r.bgFrac * 100).toFixed(1)}% MISALIGNED` : '   ok'));
}
console.log('\n/plate is the region median over the CHEST PLATE median — the white reference.');
console.log('spread (p95-p05) is the material tell: metal resolves the environment, a plate averages it.');
