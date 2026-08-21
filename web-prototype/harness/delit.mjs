#!/usr/bin/env node
/**
 * DE-LIT THE REFERENCE ART for a Meshy image-to-3D generation.
 *
 *   node harness/delit.mjs --out assets/mv/player/delit [options]
 *
 * WHAT THIS IS FOR. John generates a new base model by feeding Meshy the four baseline art
 * elevations. Meshy bakes whatever it sees into the new model's albedo AND infers geometry from
 * the image, so two things matter:
 *   - Painted-in LIGHTING (a broad key-light gradient, blown speculars, a contact shadow) would
 *     become permanent shading on a model that then gets lit again in-engine.
 *   - A crisp dark LINE reads as a recessed panel gap and gets modelled as one. Lines are the
 *     point of the exercise; John has said he will re-apply chrome on our side afterwards, so
 *     material VALUE fidelity is explicitly not a goal here.
 *
 * THIS IS AN IMAGE EDIT ON THE ART. It is not a render of our own mesh — a previous round
 * misread the request that way and its output lives at progress/shots/unlit/.
 *
 * ⚠️ THE SOURCES ARE THE PROJECT'S MEASUREMENT REFERENCE. `_kit8_shellvalue.mjs`, `_mat4_teal.mjs`,
 * `_mat4_artbox.mjs`, `measure.mjs`, `overlay.mjs` and every critique round compare against
 * assets/mv/player/baseline_*.png. This tool NEVER writes to them. It refuses to, by md5:
 * SRC_MD5 below is checked before and after every run.
 *
 * ------------------------------------------------------------------------------------------
 * WHAT THE SOURCE ACTUALLY IS, measured (harness/evidence/_delit0_probe.mjs, _delit1_seg.mjs):
 *
 *   - 1024x1024, NO alpha channel — every pixel is opaque, composited on pure white 255.
 *   - The matte is HARD. There are ZERO pixels with luma in 231..254, in all four views. So the
 *     figure has no antialiased edge against the page, and a border flood fill on `luma >= 254`
 *     returns the page EXACTLY. Every cut from 231 to 254 gives the identical mask — that
 *     plateau is why this segmentation can be trusted rather than tuned.
 *   - The contact shadow IS in the RGB (there is no alpha to hide it in): a soft grey blob in
 *     the bottom ~5% of the figure box, values ~185..230, hard-clipped to white at its outer
 *     edge by the same 230/255 step.
 *   - Blown specular is severe and it is CLIPPED: 23.9k px in front and 24.6k in back sit at
 *     exactly 255 INSIDE the figure. Some of that is a sealed page pocket between the legs
 *     (see POCKETS below); the rest is unrecoverable clipped highlight, which is why this tool
 *     inpaints rather than tone-maps it.
 *
 * FOUR LABELS, in the order they are resolved:
 *   PAGE    border flood fill over luma >= 254. Exact, per the plateau above.
 *   SHADOW  in the ground band only: non-page, luma >= --shadowCut, in a connected component
 *           that touches the page and is at least --shadowMinPx. Swept; see the guard below.
 *   POCKET  a clipped-white component that is NOT reachable from the border but IS adjacent to
 *           SHADOW. That adjacency is the whole test, and it is a geometric fact rather than a
 *           tuned one: the gap between the legs is sealed off from the outside page ONLY by the
 *           contact shadow lying across its bottom, so it is the one white region that touches
 *           shadow. Interior speculars (chest, shoulders, crown) touch shell, never shadow.
 *   FIGURE  everything else. Clipped-white figure pixels are holes to be inpainted.
 *
 * ------------------------------------------------------------------------------------------
 * PIPELINE
 *
 *  0.5 PAGE NOTCH REPAIR. The border flood leaks THROUGH blown speculars that touch the silhouette
 *     edge, chewing notches out of the figure — the ragged crown in the side views. A small
 *     morphological closing puts them back; they are clipped white, so step 4 inpaints them.
 *  1. Linearise. Illumination multiplies LINEAR radiance, so the flat-field division is done in
 *     linear light, not on sRGB code values.
 *  1.5 DE-FRINGE the silhouette's outer ring, which in the source is white-contaminated by the way
 *     the matte was cut. Repair by colour, not by erosion — the silhouette does not move. See the
 *     long note at the step itself; this was found by measuring the edge, not by inspection.
 *  2. FLAT-FIELD (homomorphic) correction. I = large masked blur of linear luminance over the
 *     valid figure; gain g = median(I)/I; multiply all three linear channels by g. Multiplying
 *     the channels by a common gain preserves the chroma ratios exactly, so hue and saturation
 *     survive even though value does not.
 *       ⚠️ --radius IS THE DESIGN DECISION. Too small and the chrome/shell material step is
 *       treated as illumination and flattened away; too large and no gradient is removed. It is
 *       given as a fraction of FIGURE HEIGHT and it is swept, never assumed.
 *       The blur is a NORMALISED convolution (numerator and denominator both blurred, identical
 *       clamped windows), so background never bleeds across the silhouette — a plain blur would
 *       drag the white page into every limb edge and manufacture a dark rim.
 *  3. SPECULAR SHOULDER. Reinhard-style soft roll-off above --knee, blended by --specStrength.
 *  4. INPAINT the clipped-white holes from surrounding corrected reflectance. A blown highlight
 *     carries no recoverable detail; leaving it is leaving a painted-on hotspot.
 *  5. EMBLEM (front only, --emblem remove). Remove the stale circular chest emblem by the same
 *     Laplace fill as step 4 — a blur-and-feather version of this left a visible grey DISC on the
 *     chest, which is worse than the emblem. Runs BEFORE the sharpen, and the fill is smooth so the
 *     sharpen finds nothing there to amplify. See docs/design/player-material-spec.md: the chest
 *     carries the 4Humanity WORDMARK now and the kit adds it as its own skinned plate, so the base
 *     model should carry no chest logo at all.
 *  6. LOCAL CONTRAST on the panel-line band, and it is ASYMMETRIC on purpose. Unsharp masking
 *     brightens the light side of every edge as much as it darkens the dark side, and that bright
 *     rim is exactly what Meshy turns into a raised welt beside every groove. --sharpDark and
 *     --sharpLight are separate so the dark side can be driven hard while the light side is held
 *     down. --sharpFloor suppresses boost on low-amplitude texture so film grain is not promoted
 *     into dents. The blur here is masked too, so the silhouette does not get a halo.
 *     The EAR gets a local exemption (--earRelief): a x2.5 gain on a mid-tone ring drove it to
 *     absolute black, and a black ring is a hole rather than a recess. Scoped to a feathered disc
 *     on the ear alone — a global version was measured and REJECTED for softening the panel lines.
 *  7. COMPOSITE onto --bg.
 *
 * ------------------------------------------------------------------------------------------
 * GUARDS, and each one has a control that has been WATCHED to fail (harness/evidence/_delit5_control.mjs):
 *   G1 sources unmodified   — md5 of all four inputs, before and after.
 *   G2 shadow mask sane     — kept shadow must be under --shadowShareMax of the ground band's
 *                             non-page area, must not reach above the ground band, and must leave
 *                             the ground-band figure's median luma above --groundFigMedMin. Both
 *                             numeric caps are calibrated from all four views, not chosen.
 *                             Controls: --shadowCut 150 and --shadowCut 120 flood the boots and
 *                             MUST throw.
 *                             ⚠️ The FIRST version of this guard was a BYPASS: it tested only the
 *                             shadow's share of the WHOLE FIGURE against a 12% cap, and the
 *                             cut-120 flood came in under that cap and passed. Only G4 objected,
 *                             and only because the flood happened to reach the bbox's bottom row.
 *                             Two further candidate tests were measured and REJECTED for not
 *                             separating the cases at all; see the note at the guard itself.
 *   G3 page plateau holds   — the count of non-page pixels must be identical at cuts 231 and 254,
 *                             i.e. the hard matte this whole segmentation assumes really is hard.
 *                             Control: a synthetic image with an antialiased edge MUST throw.
 *   G4 silhouette preserved — the output's non-background bbox must equal the input's non-page
 *                             bbox to the pixel. Control: an erode step MUST throw.
 *   G5 figure never eroded  — G4 compares only BOUNDING BOXES, and that blindness shipped a
 *                             defect: the shadow flood ate ~2000 px out of the MIDDLE of each
 *                             boot, every bbox extreme was still held by a surviving pixel, and
 *                             G2/G3/G4 all passed. Meshy read the holes and reconciled them into
 *                             "structure between the feet". G5 compares the actual silhouette, on
 *                             the composited output bytes against a reference recomputed from the
 *                             source, in three parts: (a) no removed pixel may have figure below
 *                             it in-column, (b) above the ground band the outline may never sit
 *                             inside the source's, (c) no outer-boundary notches survive.
 *                             Controls, all in _delit5_control.mjs and all watched failing:
 *                             --shadowFigBelowMax 9999 (the exact behaviour that shipped, 1817 px
 *                             on front), --sabotage shave, --pageClose 0, --sabotage nibble.
 * A guard that cannot be made to fail is a bypass, not a guard.
 *
 * ------------------------------------------------------------------------------------------
 * THE THREE VARIANTS John keeps, and their invocations — these were NOT recorded anywhere and had
 * to be recovered by measurement (harness/evidence/_delit8_variant.mjs). Common flags:
 *     --radius 0.08 --sharpR 2.5 --sharpLight 0 --sharpFloor 0.020 --defringe 2 --bg grey
 *   delit/             --sharpDark 1.5 --emblem remove     (+ --debug delit/_masks)
 *   delit/emblem-kept/ --sharpDark 1.5 --emblem keep
 *   delit/soft/        --sharpDark 0.8 --emblem remove
 * `soft` was matched to the previous file to within 0.05 pp on the share of figure pixels below
 * luma 5/10/20/40/80 — it is a sharpen-strength variant, nothing else differs.
 */
import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { toDataURL, openCanvasPage, ROOT } from './imglib.mjs';

// ---------------------------------------------------------------------------- args
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const flag = (k) => argv.includes(`--${k}`);
const num = (k, d) => Number(arg(k, d));

const VIEWS = {
  front: 'assets/mv/player/baseline_front.png',
  'side-left': 'assets/mv/player/baseline_side-left.png',
  'side-right': 'assets/mv/player/baseline_side-right.png',
  back: 'assets/mv/player/baseline_back.png',
};

/**
 * md5 of the four sources as they stand. G1 compares against this before AND after the run, so
 * the tool cannot silently overwrite the project's measurement reference even if a path is
 * mistyped. If the art is ever legitimately re-exported these must be updated deliberately.
 */
const SRC_MD5 = {
  'assets/mv/player/baseline_front.png': '6ae79903362b9dc6f21a0f0a792a40b0',
  'assets/mv/player/baseline_side-left.png': '650216cec8da0697e128f2da815faf8f',
  'assets/mv/player/baseline_side-right.png': 'f1257f105e15b210b326307fd43db4c0',
  'assets/mv/player/baseline_back.png': 'f94e6751a8e084f4c0572a678c177422',
};

const OPTS = {
  radius: num('radius', 0.20),          // illumination blur radius, FRACTION OF FIGURE HEIGHT
  knee: num('knee', 0.55),              // specular shoulder knee, linear luminance
  specStrength: num('specStrength', 1.0),
  sharpR: num('sharpR', 2.5),           // panel-line band radius, px at 1024
  sharpDark: num('sharpDark', 1.2),     // gain on the DARK side of an edge
  sharpLight: num('sharpLight', 0.35),  // gain on the LIGHT side — held down to avoid welts
  sharpFloor: num('sharpFloor', 0.010), // below this |detail| amplitude, no boost (grain guard)
  inpaintR: num('inpaintR', 40),
  gainClamp: num('gainClamp', 4.0),
  shadowCut: num('shadowCut', 185),
  shadowMinPx: num('shadowMinPx', 200),
  shadowWeakCut: num('shadowWeakCut', num('shadowCut', 185)),
  shadowGroundFrac: num('shadowGroundFrac', 0.93),
  shadowMaxFrac: num('shadowMaxFrac', 0.12),
  bg: arg('bg', 'grey'),                // grey | white | transparent
  emblem: arg('emblem', 'keep'),        // keep | remove
  emblemCx: num('emblemCx', 511),
  emblemCy: num('emblemCy', 326),
  emblemR: num('emblemR', 32),
  emblemFeather: num('emblemFeather', 7),
  defringe: num('defringe', 2),
  shadowShareMax: num('shadowShareMax', 0.40),
  groundFigMedMin: num('groundFigMedMin', 125),
  /*
   * THE TWO EROSION FIXES. Both were added after John's first Meshy generation came back with
   * "a gap in the head and structure between the feet" — background grey was showing THROUGH the
   * figure in our own output, and Meshy dutifully modelled the holes. Neither cause was the
   * de-fringe, which was the standing suspect; de-fringe only rewrites COLOUR and never touches a
   * label. See harness/evidence/_delit6_stage.mjs for the measurement that named them.
   */
  shadowFigBelowMax: num('shadowFigBelowMax', 2),  // see SHADOW: floor rule
  pageClose: num('pageClose', 2),                  // see PAGE: notch repair
  /*
   * THE EAR. See the manufactured-hole note at step 6. --noNewBlacks applies the rule to the WHOLE
   * figure and it was MEASURED AND REJECTED as a default: it held 22k-29k px per view at the local
   * min and the 6x crop of the hip/knee panel lines showed them plainly weaker than the shipped
   * output — a general softening of the panel lines, which is the one thing John asked not to
   * happen. It is kept as an option because it is how the ear crush was proved, and because it is
   * the right tool if the line contrast is ever dialled back for other reasons.
   * --earRelief applies the same rule to the EAR DISC ONLY, which is what was actually wanted.
   */
  noNewBlacks: num('noNewBlacks', 0),
  earRelief: num('earRelief', 1),
  earFeather: num('earFeather', 0.25),
};

/**
 * Ear ring centre and outer radius per side view, at 1024. Found as the centroid and extent of the
 * largest connected dark component in a box around the ear (harness/evidence/_delit7_ear.mjs) and then
 * CONFIRMED BY EYE against a tinted overlay — the centroid alone was not trustworthy on its own,
 * it drifts when the box catches the visor edge as well as the ring.
 */
const EAR = {
  'side-left': { cx: 541, cy: 167, r: 34 },
  'side-right': { cx: 486, cy: 158, r: 32 },
};
/*
 * Feather width as a fraction of r. A first pass used r=38 and 0.35, and the 6x crop showed the
 * outer skirt reaching the NECK SLATS and visibly softening them — real panel lines, not the ear.
 * The disc was pulled up onto the ring's true centre and tightened until the skirt clears the
 * neck. Verified on the cyan-ringed debug mask, not assumed. See --earFeather.
 */

const BG_RGB = { grey: [128, 128, 128], white: [255, 255, 255], transparent: [128, 128, 128] };
if (!BG_RGB[OPTS.bg]) { console.error(`--bg must be grey|white|transparent`); process.exit(1); }

const outDir = arg('out', null);
const debugDir = arg('debug', null);
const wanted = arg('view', 'all');
const viewList = wanted === 'all' ? Object.keys(VIEWS) : [wanted];
for (const v of viewList) if (!VIEWS[v]) { console.error(`unknown view ${v}`); process.exit(1); }

// A deliberate escape hatch for the G3/G4 controls, which must be able to point the pipeline at a
// synthetic image and at a sabotaged step. Not for normal use.
const CONTROL_SRC = arg('controlSrc', null);
const CONTROL_SABOTAGE = arg('sabotage', null);   // 'erode' -> break G4 on purpose

const md5 = async (rel) => createHash('md5').update(await readFile(path.join(ROOT, rel))).digest('hex');

async function checkSources(when) {
  for (const [rel, wantRaw] of Object.entries(SRC_MD5)) {
    /*
     * --controlBadMd5 corrupts the EXPECTED digest in memory so G1 can be watched failing without
     * anyone ever writing to the four reference files. Testing the guard by actually modifying a
     * source would risk exactly the damage the guard exists to prevent.
     */
    const want = flag('controlBadMd5') ? wantRaw.replace(/^./, (c) => (c === '0' ? '1' : '0')) : wantRaw;
    const got = await md5(rel);
    if (got !== want) {
      throw new Error(`G1 FAILED (${when}): ${rel} md5 ${got} != expected ${want} — a source was modified`);
    }
  }
  return true;
}

// ---------------------------------------------------------------------------- the worker
/**
 * Everything below runs inside the Playwright page: no image library is installed in this project
 * and a browser canvas is how all image work here is done (see harness/imglib.mjs).
 */
const WORKER = async ({ url, O, isFront, bgRGB, sabotage, ear }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const W = img.width, H = img.height;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g2 = cv.getContext('2d', { willReadFrequently: true });
  g2.drawImage(img, 0, 0);
  const src = g2.getImageData(0, 0, W, H);
  const d = src.data;
  const N = W * H;

  // ---- sRGB <-> linear
  const s2l = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    s2l[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  const l2s = (v) => {
    const c = Math.min(1, Math.max(0, v));
    return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
  };

  const lum8 = new Float32Array(N);          // sRGB-domain luma, for segmentation cuts
  const R = new Float64Array(N), G = new Float64Array(N), B = new Float64Array(N);
  for (let p = 0; p < N; p++) {
    const i = p * 4;
    lum8[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    R[p] = s2l[d[i]]; G[p] = s2l[d[i + 1]]; B[p] = s2l[d[i + 2]];
  }
  const Ylin = new Float64Array(N);
  for (let p = 0; p < N; p++) Ylin[p] = 0.2126 * R[p] + 0.7152 * G[p] + 0.0722 * B[p];

  // ================================================================ SEGMENTATION
  const floodPage = (cut) => {
    const m = new Uint8Array(N);
    const st = [];
    for (let x = 0; x < W; x++) { st.push(x); st.push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { st.push(y * W); st.push(y * W + W - 1); }
    while (st.length) {
      const p = st.pop();
      if (m[p] || lum8[p] < cut) continue;
      m[p] = 1;
      const x = p % W, y = (p / W) | 0;
      if (x > 0) st.push(p - 1);
      if (x < W - 1) st.push(p + 1);
      if (y > 0) st.push(p - W);
      if (y < H - 1) st.push(p + W);
    }
    return m;
  };

  // ---- G3: the hard-matte plateau this segmentation depends on.
  const page254 = floodPage(254);
  const page231 = floodPage(231);
  let n254 = 0, n231 = 0;
  for (let p = 0; p < N; p++) { if (!page254[p]) n254++; if (!page231[p]) n231++; }
  const g3 = { n254, n231, ok: n254 === n231 };

  const isPage = page254;

  // ---- PAGE NOTCH REPAIR (fix 2 of 2 for the erosion defect).
  /*
   * The border flood is supposed to return the page. It does not, quite: the source's blown
   * speculars sit at exactly 255, so wherever one REACHES THE SILHOUETTE EDGE the flood walks
   * straight through it and chews a notch out of the figure. On the side views' crown that is the
   * ragged, grey-intruded head outline John saw; there is a matching set at the boot toes.
   *
   * Measured (harness/evidence/_delit6_stage.mjs): a morphological CLOSING of the non-page mask fills
   * 58/26/27/49 px at r=1 and 186/64/82/160 px at r=2 (front/side-left/side-right/back). Every
   * one of them is a clipped-white pixel — a closing cannot fill anything except a concavity
   * narrower than its structuring element, and there is no genuine page channel in these
   * elevations under 2*pageClose px wide (the leg gap is ~180 px, the arm-to-torso gap ~30).
   *
   * Reclaimed pixels are clipped white, so they fall into `isFig && !isValid` and get the Laplace
   * inpaint at step 4 like any other blown highlight — the silhouette comes back and there is no
   * white lip where it was repaired. Radius is deliberately small: this repairs notches, it does
   * not dilate the figure. --pageClose 0 disables it, and is the control for G5b.
   */
  // Snapshot the RAW flood before the repair mutates it. G5 needs a reference that owes nothing
  // to any of the fixes below, or it would only be re-asserting them.
  const pageRaw = page254.slice();

  let notchRepaired = 0;
  if (O.pageClose > 0) {
    const r = Math.round(O.pageClose);
    const nonPage = new Uint8Array(N);
    for (let p = 0; p < N; p++) nonPage[p] = isPage[p] ? 0 : 1;
    const maxFilt = (m) => {
      const a = new Uint8Array(N), b = new Uint8Array(N);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let v = 0;
        for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < W && m[y * W + xx]) { v = 1; break; } }
        a[y * W + x] = v;
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let v = 0;
        for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < H && a[yy * W + x]) { v = 1; break; } }
        b[y * W + x] = v;
      }
      return b;
    };
    const minFilt = (m) => {
      const inv = new Uint8Array(N);
      for (let p = 0; p < N; p++) inv[p] = m[p] ? 0 : 1;
      const dd = maxFilt(inv);
      const o = new Uint8Array(N);
      for (let p = 0; p < N; p++) o[p] = dd[p] ? 0 : 1;
      return o;
    };
    const closed = minFilt(maxFilt(nonPage));
    for (let p = 0; p < N; p++) if (closed[p] && isPage[p]) { isPage[p] = 0; notchRepaired++; }
  }

  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x;
    if (isPage[p]) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const fh = y1 - y0 + 1, fw = x1 - x0 + 1;
  const inBox = [x0, y0, x1, y1];

  // ---- SHADOW: components in the ground band that touch the page.
  const yGround = Math.round(y0 + O.shadowGroundFrac * fh);
  const isShadow = new Uint8Array(N);
  const shadowComps = [];

  /*
   * THE FLOOR RULE (fix 1 of 2, and the big one). THIS IS THE STAGE THAT ATE THE BOOTS.
   *
   * The boots are painted near-white — their uppers sit well above --shadowCut 185 — and they
   * touch the contact shadow directly. So the shadow component flood climbed straight out of the
   * floor and up into the boot, the boot got labelled shadow, and step 7 composited BACKGROUND
   * over it. That is the grey bite around the ankle and heel, and it is what Meshy read as a hole
   * and reconciled into "structure between the feet".
   *
   * Measured before the fix (harness/evidence/_delit6_stage.mjs), shadow pixels that had figure BELOW them
   * in their own column — i.e. that were sitting on top of a boot, not on the floor:
   *      front 1941/3351 (57.9%)   side-left 1701/2467 (69.0%)
   *      side-right 2348/2399 (97.9%)   back 274/1608 (17.0%)
   * with up to 58 px of figure underneath. 6264 px of figure deleted across the four views.
   *
   * The invariant: a contact shadow lies ON THE FLOOR, so it is the LOWEST thing in its column —
   * what is below it is more shadow or page, never figure. A boot pixel wrongly labelled shadow
   * has the rest of the boot below it.
   *
   * ⚠️ NOT the same test the header rejects under G2. That one capped the figure rows ABOVE a
   * shadow pixel and was correctly rejected, because genuine shadow tucked under a boot has the
   * whole leg above it (708..847 px, worse than the deliberately-broken control's 650). BELOW is
   * the other direction and the asymmetry is the entire point: nothing of the figure is ever
   * below the floor line.
   *
   * `belowFig` counts DEFINITE figure — non-page pixels darker than --shadowCut, which can never
   * themselves be shadow candidates. Defining it that way keeps it non-circular (it does not
   * depend on the shadow labelling it constrains) and it is exactly the dark rubber sole, which
   * is what sits under every wrongly-eaten boot pixel.
   *
   * Applied as a CANDIDATE filter rather than a post-hoc reclaim, so the component flood cannot
   * enter the boot in the first place and connectivity stops at the boot's edge by itself.
   */
  const belowFig = new Int32Array(N);
  {
    for (let x = 0; x < W; x++) {
      let run = 0;
      for (let y = Math.min(H - 1, y1); y >= 0; y--) {
        const p = y * W + x;
        belowFig[p] = run;
        if (!isPage[p] && lum8[p] < O.shadowCut) run++;
      }
    }
  }
  {
    const seen = new Uint8Array(N);
    const cand = (p) => {
      if (isPage[p]) return false;
      const y = (p / W) | 0;
      if (y < yGround) return false;
      if (belowFig[p] > O.shadowFigBelowMax) return false;   // the floor rule
      return lum8[p] >= O.shadowCut && lum8[p] < 254;
    };
    for (let y = yGround; y <= y1; y++) {
      for (let x = x0 - 2; x <= x1 + 2; x++) {
        if (x < 0 || x >= W) continue;
        const p0 = y * W + x;
        if (seen[p0] || !cand(p0)) continue;
        const comp = [];
        let touchesPage = false, minY = 1e9;
        const st = [p0]; seen[p0] = 1;
        while (st.length) {
          const p = st.pop();
          comp.push(p);
          const px = p % W, py = (p / W) | 0;
          if (py < minY) minY = py;
          const nb = [];
          if (px > 0) nb.push(p - 1);
          if (px < W - 1) nb.push(p + 1);
          if (py > 0) nb.push(p - W);
          if (py < H - 1) nb.push(p + W);
          for (const q of nb) {
            if (isPage[q]) { touchesPage = true; continue; }
            if (seen[q] || !cand(q)) continue;
            seen[q] = 1; st.push(q);
          }
        }
        shadowComps.push({ n: comp.length, touchesPage, minY });
        if (touchesPage && comp.length >= O.shadowMinPx) for (const p of comp) isShadow[p] = 1;
      }
    }
  }
  /*
   * HYSTERESIS GROWTH — PRESENT BUT INERT BY DEFAULT, because G2 caught it eating the boots.
   *
   * The problem it was written for is real and is NOT fixed: a single cut at --shadowCut removes the
   * contact shadow's bright body but leaves its DARKER CORE behind, that residue gets labelled
   * figure, and the local-contrast step then hardens it into a crisp horizontal line beside the heel
   * in both side views. It reads as a flat shelf and Meshy would model a shelf. See the 6x foot crop
   * in the report; no single number showed it.
   *
   * The attempted fix was standard hysteresis: seed from the strong cut, grow 4-connected down to
   * --shadowWeakCut inside the ground band. The reasoning was that the dark rubber sole (luma 40..96)
   * sits far below any useful weak cut and would act as a barrier, so growth could only spread across
   * the floor. THAT REASONING IS WRONG, and G2 falsified it: the shadow also touches the boot's
   * BRIGHT upper directly, with no dark sole in between, so growth climbs straight into the boot.
   * The ground-band figure median — the guard's boot-eating test — falls 140.3 (off) -> 112.6
   * (weak 150) -> 90.5 (weak 130) on side-left, which is the same signature as the deliberately
   * broken --shadowCut controls (107.9 and 78.5). Share of the ground band rises 23% -> 53% -> 67%.
   *
   * So --shadowWeakCut defaults to --shadowCut, which skips this block entirely. The code and these
   * numbers are kept so the next person does not spend the round re-deriving them. The residual heel
   * streak is a KNOWN, REPORTED limitation, not a solved problem.
   */
  if (O.shadowWeakCut < O.shadowCut) {
    const st = [];
    for (let p = 0; p < N; p++) if (isShadow[p]) st.push(p);
    while (st.length) {
      const p = st.pop();
      const x = p % W, y = (p / W) | 0;
      const nb = [];
      if (x > 0) nb.push(p - 1);
      if (x < W - 1) nb.push(p + 1);
      if (y > 0) nb.push(p - W);
      if (y < H - 1) nb.push(p + W);
      for (const q of nb) {
        if (isShadow[q] || isPage[q]) continue;
        if (((q / W) | 0) < yGround) continue;
        // The floor rule bounds the growth too — which is precisely why it failed before.
        if (belowFig[q] > O.shadowFigBelowMax) continue;
        if (lum8[q] < O.shadowWeakCut || lum8[q] >= 254) continue;
        isShadow[q] = 1; st.push(q);
      }
    }
  }

  let nShadow = 0, shadowMinY = 1e9;
  for (let p = 0; p < N; p++) if (isShadow[p]) { nShadow++; const y = (p / W) | 0; if (y < shadowMinY) shadowMinY = y; }

  // ---- POCKET: clipped-white components not reachable from the border but adjacent to SHADOW.
  const isPocket = new Uint8Array(N);
  const whiteComps = [];
  {
    const seen = new Uint8Array(N);
    for (let p0 = 0; p0 < N; p0++) {
      if (seen[p0] || isPage[p0] || lum8[p0] < 254) continue;
      const comp = []; let touchesShadow = false;
      const st = [p0]; seen[p0] = 1;
      while (st.length) {
        const p = st.pop(); comp.push(p);
        const px = p % W, py = (p / W) | 0;
        const nb = [];
        if (px > 0) nb.push(p - 1);
        if (px < W - 1) nb.push(p + 1);
        if (py > 0) nb.push(p - W);
        if (py < H - 1) nb.push(p + W);
        for (const q of nb) {
          if (isShadow[q]) { touchesShadow = true; continue; }
          if (seen[q] || isPage[q] || lum8[q] < 254) continue;
          seen[q] = 1; st.push(q);
        }
      }
      whiteComps.push({ n: comp.length, touchesShadow });
      if (touchesShadow) for (const p of comp) isPocket[p] = 1;
    }
  }
  let nPocket = 0;
  for (let p = 0; p < N; p++) if (isPocket[p]) nPocket++;

  const isBg = new Uint8Array(N);
  const isFig = new Uint8Array(N);
  const isValid = new Uint8Array(N);   // figure AND carrying information (not clipped)
  let nFig = 0, nClipped = 0;
  for (let p = 0; p < N; p++) {
    isBg[p] = (isPage[p] || isShadow[p] || isPocket[p]) ? 1 : 0;
    if (isBg[p]) continue;
    isFig[p] = 1; nFig++;
    if (lum8[p] >= 254) nClipped++; else isValid[p] = 1;
  }

  // ---- G2
  /*
   * VERTICAL SUPPORT is the test that actually distinguishes shadow from boot, and it was added
   * because the first version of this guard was a BYPASS. That version checked only the shadow's
   * area fraction and that it stayed inside the ground band; running the control at --shadowCut 120
   * flooded the mask into the boots and the guard still reported "pass" — only G4 noticed, and only
   * because the flood happened to reach the bbox's bottom row. A flood that ate the middle of a
   * boot would have passed both.
   *
   * The invariant: a genuine contact-shadow pixel has NO figure above it. The shadow lies on the
   * ground, so what sits above it is the sealed white pocket between the legs, the page, or more
   * shadow. A boot pixel wrongly labelled shadow has boot above it for as many rows as the boot is
   * tall. So: count the consecutive FIGURE rows immediately above each kept shadow pixel and cap
   * the maximum. Measured on the shipped settings the max is small; the cap is set well above that
   * and far below a boot's height, and the control at cut 120 must exceed it.
   */
  const qsort = (a) => { a.sort((u, v) => u - v); return a; };
  const pct = (a, f) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * f))] : NaN);

  // Shadow area as a share of the GROUND BAND's non-page area — a tighter denominator than the
  // whole figure, which is what made the first version of this guard useless.
  let groundNonPage = 0;
  const shadowL = [], groundFigL = [];
  for (let y = yGround; y <= y1; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (isPage[p]) continue;
      groundNonPage++;
      if (isShadow[p]) shadowL.push(lum8[p]);
      else if (isFig[p]) groundFigL.push(lum8[p]);
    }
  }
  qsort(shadowL); qsort(groundFigL);
  const shadowShare = groundNonPage ? nShadow / groundNonPage : 0;
  const shadowMedL = pct(shadowL, 0.5), groundFigMedL = pct(groundFigL, 0.5);
  const brighterBy = shadowMedL - groundFigMedL;

  const g2guard = {
    frac: nShadow / Math.max(1, nFig),
    max: O.shadowMaxFrac,
    minY: shadowMinY === 1e9 ? null : shadowMinY,
    yGround, groundNonPage, shadowShare, shareCap: O.shadowShareMax,
    shadowMedL, groundFigMedL, brighterBy, groundFigMedMin: O.groundFigMedMin,
    /*
     * TWO independent tests, both calibrated from measurement across all four views rather than
     * chosen, and both exceeded by the control at --shadowCut 150 and 120:
     *
     *   shadow share of the ground band   shipped 12.7 / 23.4 / 27.3 / 28.2 %   control 57.3 / 65.7 %
     *   ground-band figure median luma    shipped 138.6 / 140.3 / 151.1 / 162.5  control 107.9 / 78.5
     *
     * The second exists because share alone would miss a flood that bit the MIDDLE of one boot.
     * Eating boot pixels removes the bright boot uppers from the figure population and drags its
     * median down, so a floor on that median catches the bite from the other direction.
     *
     * A third candidate was tried and REJECTED: "the shadow must be brighter than the ground-band
     * figure". It moves the wrong way — flooding into the dark soles removes them from the figure
     * population, so the separation grows (44..70 shipped vs 108 at cut 120) and the test would
     * have passed the very case it was written to catch. It is not in the guard.
     *
     * Also rejected: "vertical support", i.e. capping the consecutive figure rows above a shadow
     * pixel. Genuine shadow tucked under a boot has the whole leg above it, so shipped settings
     * measure 708..847 px against the control's 650 — the control scored BETTER than the real
     * thing and no threshold could separate them.
     */
    ok: shadowShare <= O.shadowShareMax
      && (shadowMinY === 1e9 || shadowMinY >= yGround)
      && (!groundFigL.length || groundFigMedL >= O.groundFigMedMin),
  };

  // ================================================================ 1.5 DE-FRINGE
  /*
   * The source's outermost figure pixels are WHITE-CONTAMINATED, and this was found by measuring
   * the edge rather than by reasoning about it (harness/evidence/_delit4_edge.mjs). On the shin at y=840 the
   * two outermost figure pixels read 205 and 175 against a limb interior of ~145 — a bright rim
   * BRIGHTER than the surface it borders. It is invisible in the source because the page behind it
   * is white, and it appears as a glowing outline the moment the figure is placed on grey.
   *
   * The cause is visible in the histogram: there are ZERO pixels in luma 231..254 anywhere in any
   * view, which no antialiased edge would produce. The matte was cut by snapping everything above
   * ~230 to pure 255, so the upper half of the edge's alpha ramp became "background" and the lower
   * half stayed behind as partly-white-blended figure pixels. Meshy would bake that ring as a
   * bright lip around every silhouette.
   *
   * Repair, not erosion: walk inward-out. Every figure pixel within `defringe` of the background
   * takes the mean of its neighbours one step FURTHER from the edge, which are already final. The
   * silhouette shape is untouched to the pixel, so guard G4 still means what it says — this fixes
   * the colour of the boundary ring without moving the boundary.
   *
   * It runs BEFORE the flat field so the contaminated ring does not bias the illumination estimate
   * either.
   */
  let defringed = 0;
  if (O.defringe > 0) {
    const dist = new Int32Array(N).fill(-1);
    let frontier = [];
    for (let p = 0; p < N; p++) {
      if (isFig[p]) continue;
      const x = p % W, y = (p / W) | 0;
      const nb = [];
      if (x > 0) nb.push(p - 1);
      if (x < W - 1) nb.push(p + 1);
      if (y > 0) nb.push(p - W);
      if (y < H - 1) nb.push(p + W);
      for (const q of nb) if (isFig[q] && dist[q] === -1) { dist[q] = 1; frontier.push(q); }
    }
    for (let dd = 1; dd <= O.defringe; dd++) {
      const next = [];
      for (const p of frontier) {
        const x = p % W, y = (p / W) | 0;
        const nb = [];
        if (x > 0) nb.push(p - 1);
        if (x < W - 1) nb.push(p + 1);
        if (y > 0) nb.push(p - W);
        if (y < H - 1) nb.push(p + W);
        for (const q of nb) if (isFig[q] && dist[q] === -1) { dist[q] = dd + 1; next.push(q); }
      }
      frontier = next;
    }
    // Assign from the deepest ring outward, so each ring reads already-final values.
    for (let dd = O.defringe; dd >= 1; dd--) {
      const ring = [];
      for (let p = 0; p < N; p++) if (dist[p] === dd) ring.push(p);
      const nr = new Float64Array(ring.length), ng = new Float64Array(ring.length), nb2 = new Float64Array(ring.length);
      for (let k = 0; k < ring.length; k++) {
        const p = ring[k], x = p % W, y = (p / W) | 0;
        let sr = 0, sg = 0, sb = 0, cc = 0;
        const nb = [];
        if (x > 0) nb.push(p - 1);
        if (x < W - 1) nb.push(p + 1);
        if (y > 0) nb.push(p - W);
        if (y < H - 1) nb.push(p + W);
        for (const q of nb) {
          if (!isFig[q]) continue;
          if (dist[q] !== dd + 1 && !(dist[q] === -1)) continue;   // only deeper or interior
          sr += R[q]; sg += G[q]; sb += B[q]; cc++;
        }
        if (!cc) { nr[k] = R[p]; ng[k] = G[p]; nb2[k] = B[p]; continue; }
        nr[k] = sr / cc; ng[k] = sg / cc; nb2[k] = sb / cc;
      }
      for (let k = 0; k < ring.length; k++) {
        const p = ring[k];
        R[p] = nr[k]; G[p] = ng[k]; B[p] = nb2[k];
        Ylin[p] = 0.2126 * R[p] + 0.7152 * G[p] + 0.0722 * B[p];
        defringed++;
      }
    }
  }

  // ================================================================ BLUR (normalised convolution)
  /**
   * Box SUM over a (2r+1)^2 window via an integral image, divided by the constant window area so
   * magnitudes stay bounded. Returns sums-scaled values; callers always use it as a RATIO of two
   * such results with identical windows, so the border clamping cancels exactly.
   */
  const boxSum = (srcArr, r) => {
    const I = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let rs = 0;
      const o = (y + 1) * (W + 1), o0 = y * (W + 1);
      for (let x = 0; x < W; x++) { rs += srcArr[y * W + x]; I[o + x + 1] = I[o0 + x + 1] + rs; }
    }
    const out = new Float64Array(N);
    const area = (2 * r + 1) * (2 * r + 1);
    for (let y = 0; y < H; y++) {
      const ya = Math.max(0, y - r), yb = Math.min(H - 1, y + r);
      const ra = ya * (W + 1), rb = (yb + 1) * (W + 1);
      for (let x = 0; x < W; x++) {
        const xa = Math.max(0, x - r), xb = Math.min(W - 1, x + r);
        out[y * W + x] = (I[rb + xb + 1] - I[ra + xb + 1] - I[rb + xa] + I[ra + xa]) / area;
      }
    }
    return out;
  };
  /** Masked blur: 3 box passes on numerator and denominator => approx Gaussian, sigma ~ r. */
  const maskedBlur = (val, mask, r, passes = 3) => {
    let numA = new Float64Array(N), denA = new Float64Array(N);
    for (let p = 0; p < N; p++) { const m = mask[p] ? 1 : 0; denA[p] = m; numA[p] = m ? val[p] : 0; }
    for (let k = 0; k < passes; k++) { numA = boxSum(numA, r); denA = boxSum(denA, r); }
    const out = new Float64Array(N);
    for (let p = 0; p < N; p++) out[p] = denA[p] > 1e-12 ? numA[p] / denA[p] : NaN;
    return out;
  };

  // ================================================================ 2. FLAT FIELD
  const rIll = Math.max(2, Math.round(O.radius * fh));
  const Ill = maskedBlur(Ylin, isValid, rIll);
  // Renormalise on the MEDIAN illumination over valid figure pixels, so overall exposure holds.
  const illVals = [];
  for (let p = 0; p < N; p++) if (isValid[p] && Number.isFinite(Ill[p])) illVals.push(Ill[p]);
  illVals.sort((a, b) => a - b);
  const illMed = illVals.length ? illVals[illVals.length >> 1] : 1;
  const illP01 = illVals.length ? illVals[Math.floor(illVals.length * 0.01)] : 1;
  const illP99 = illVals.length ? illVals[Math.floor(illVals.length * 0.99)] : 1;

  const Rc = new Float64Array(N), Gc = new Float64Array(N), Bc = new Float64Array(N);
  let gMin = 1e9, gMax = -1e9;
  for (let p = 0; p < N; p++) {
    if (!isFig[p]) continue;
    let gg = Number.isFinite(Ill[p]) && Ill[p] > 1e-9 ? illMed / Ill[p] : 1;
    gg = Math.min(O.gainClamp, Math.max(1 / O.gainClamp, gg));
    if (gg < gMin) gMin = gg; if (gg > gMax) gMax = gg;
    Rc[p] = R[p] * gg; Gc[p] = G[p] * gg; Bc[p] = B[p] * gg;
  }

  // ================================================================ 3. SPECULAR SHOULDER
  if (O.specStrength > 0) {
    const knee = O.knee;
    for (let p = 0; p < N; p++) {
      if (!isFig[p]) continue;
      const Y = 0.2126 * Rc[p] + 0.7152 * Gc[p] + 0.0722 * Bc[p];
      if (Y <= knee || Y < 1e-9) continue;
      const e = Y - knee, span = Math.max(1e-6, 1 - knee);
      const rolled = knee + e / (1 + e / span);
      const target = Y + (rolled - Y) * O.specStrength;
      const s = target / Y;
      Rc[p] *= s; Gc[p] *= s; Bc[p] *= s;
    }
  }

  // ================================================================ 4. INPAINT CLIPPED HOLES
  /*
   * LAPLACE (diffusion) FILL, not a blur fill, and the difference is visible rather than academic.
   * A large-radius masked blur of the surrounding reflectance produced a patch measurably DARKER
   * than the ring of pixels immediately around the hole — because the hole is a blown highlight,
   * so its immediate surroundings are the highlight's bright penumbra while a wide blur averages
   * in the darker rest of the plate. On the chest that rendered as a grey stain with a visible
   * edge, which Meshy would bake as a dirt patch or model as a dent.
   *
   * Solving the Laplace equation on the hole with the boundary pinned to the real neighbouring
   * pixels matches the surroundings EXACTLY at the seam and interpolates smoothly across, so there
   * is no edge to find. Gauss-Seidel, seeded from the blur fill so it converges quickly; iteration
   * count is scaled to the largest hole's diameter since Laplace information travels one pixel per
   * sweep.
   */
  let inpaintIters = 0;
  if (nClipped > 0) {
    const holes = [];
    for (let p = 0; p < N; p++) if (isFig[p] && !isValid[p]) holes.push(p);
    // seed
    const fR = maskedBlur(Rc, isValid, Math.round(O.inpaintR));
    const fG = maskedBlur(Gc, isValid, Math.round(O.inpaintR));
    const fB = maskedBlur(Bc, isValid, Math.round(O.inpaintR));
    for (const p of holes) {
      if (Number.isFinite(fR[p])) { Rc[p] = fR[p]; Gc[p] = fG[p]; Bc[p] = fB[p]; }
    }
    // relax: enough sweeps to cross the widest hole several times over
    let maxSpan = 0;
    for (const c of whiteComps) if (!c.touchesShadow) maxSpan = Math.max(maxSpan, Math.ceil(Math.sqrt(c.n)));
    inpaintIters = Math.min(4000, Math.max(200, maxSpan * 40));
    for (let it = 0; it < inpaintIters; it++) {
      for (const p of holes) {
        const x = p % W, y = (p / W) | 0;
        let sr = 0, sg = 0, sb = 0, k = 0;
        if (x > 0 && isFig[p - 1]) { sr += Rc[p - 1]; sg += Gc[p - 1]; sb += Bc[p - 1]; k++; }
        if (x < W - 1 && isFig[p + 1]) { sr += Rc[p + 1]; sg += Gc[p + 1]; sb += Bc[p + 1]; k++; }
        if (y > 0 && isFig[p - W]) { sr += Rc[p - W]; sg += Gc[p - W]; sb += Bc[p - W]; k++; }
        if (y < H - 1 && isFig[p + W]) { sr += Rc[p + W]; sg += Gc[p + W]; sb += Bc[p + W]; k++; }
        if (!k) continue;
        Rc[p] = sr / k; Gc[p] = sg / k; Bc[p] = sb / k;
      }
    }
  }

  // ================================================================ 5. EMBLEM
  /*
   * LAPLACE FILL AGAIN, for the same reason and after the same mistake. The first version blended
   * the disc toward a wide masked blur of the surrounding shell, and it left a plainly visible grey
   * DISC on the chest in the four-angle sheet — a circular tonal patch where the emblem had been,
   * which Meshy would model as a recessed or raised disc. That is strictly worse than leaving the
   * emblem alone.
   *
   * Pinning the boundary to the real neighbouring pixels and solving inside removes the emblem with
   * no edge and no tonal step, and it needs no feather: the fill agrees with its surroundings at the
   * seam by construction. It runs BEFORE the sharpen, and because the result is smooth the sharpen
   * finds no detail to amplify there.
   */
  let emblemPx = 0;
  if (isFront && O.emblem === 'remove') {
    const { emblemCx: cx, emblemCy: cy, emblemR: er } = O;
    const holes = [];
    for (let p = 0; p < N; p++) {
      if (!isFig[p]) continue;
      const x = p % W, y = (p / W) | 0;
      if (Math.hypot(x - cx, y - cy) <= er) { holes.push(p); emblemPx++; }
    }
    const isHole = new Uint8Array(N);
    for (const p of holes) isHole[p] = 1;
    // seed from the ring just outside, then relax
    const keep = new Uint8Array(N);
    for (let p = 0; p < N; p++) keep[p] = isFig[p] && !isHole[p] ? 1 : 0;
    const fR = maskedBlur(Rc, keep, Math.round(er + 20));
    const fG = maskedBlur(Gc, keep, Math.round(er + 20));
    const fB = maskedBlur(Bc, keep, Math.round(er + 20));
    for (const p of holes) if (Number.isFinite(fR[p])) { Rc[p] = fR[p]; Gc[p] = fG[p]; Bc[p] = fB[p]; }
    const iters = Math.min(6000, Math.max(400, Math.round(er * 2 * 40)));
    for (let it = 0; it < iters; it++) {
      for (const p of holes) {
        const x = p % W, y = (p / W) | 0;
        let sr = 0, sg = 0, sb = 0, k = 0;
        if (x > 0 && isFig[p - 1]) { sr += Rc[p - 1]; sg += Gc[p - 1]; sb += Bc[p - 1]; k++; }
        if (x < W - 1 && isFig[p + 1]) { sr += Rc[p + 1]; sg += Gc[p + 1]; sb += Bc[p + 1]; k++; }
        if (y > 0 && isFig[p - W]) { sr += Rc[p - W]; sg += Gc[p - W]; sb += Bc[p - W]; k++; }
        if (y < H - 1 && isFig[p + W]) { sr += Rc[p + W]; sg += Gc[p + W]; sb += Bc[p + W]; k++; }
        if (!k) continue;
        Rc[p] = sr / k; Gc[p] = sg / k; Bc[p] = sb / k;
      }
    }
  }

  // ================================================================ 6. LOCAL CONTRAST
  let sharpStats = null;
  if (O.sharpDark > 0 || O.sharpLight > 0) {
    const Ys = new Float64Array(N);
    for (let p = 0; p < N; p++) if (isFig[p]) Ys[p] = 0.2126 * Rc[p] + 0.7152 * Gc[p] + 0.0722 * Bc[p];
    const base = maskedBlur(Ys, isFig, Math.max(1, Math.round(O.sharpR)));

    /*
     * THE MANUFACTURED-HOLE RULE. --sharpDark 1.5 amplifies every dark dip by 2.5x and the result
     * was hard-clipped at zero, so a mid-tone feature could be driven to ABSOLUTE BLACK and then
     * flattened there. The EAR is where that bites: it is a chrome ring around a lighter disc and
     * it should read as a recess, but measured (harness/evidence/_delit7_ear.mjs) the side-left ring runs
     * min 31.8 / p01 46.1 / p05 72.3 in the ART with ZERO pixels under luma 30, and came out of
     * this step at min 0 / p01 0 / p05 0 with 90 px at pure black. A black arc is not a recess, it
     * is a hole, and Meshy modelled it as one — John's "gap in the head".
     *
     * The rule: the local-contrast step may redistribute contrast but may NOT invent a tone darker
     * than the darkest tone already present in the pixel's own neighbourhood, taken at the same
     * radius the step works at.
     *
     * ⚠️ This is NOT a general softening of the panel lines, which is the thing John explicitly
     * asked for and the whole point of the tool. A genuine panel line IS the darkest thing in its
     * neighbourhood, so at its core Ys == Ymin and the floor never binds; the flanks are still
     * pulled all the way down to the core, which widens the groove instead of spiking it. Only a
     * feature the art drew as mid-tone is prevented from becoming a hole. The measured effect on
     * mean|detail| is reported per view so this claim is checkable rather than asserted.
     *
     * --noNewBlacks 0 restores the old clip-at-zero behaviour, and is the control.
     */
    /*
     * The ear mask: full relief inside r, feathered to nothing by 1.35r so there is no disc edge
     * for the sharpen to leave behind — the same mistake the emblem removal made twice.
     */
    const earW = new Float32Array(N);
    if (O.earRelief > 0 && ear) {
      for (let y = Math.max(0, ear.cy - 60); y < Math.min(H, ear.cy + 60); y++) {
        for (let x = Math.max(0, ear.cx - 60); x < Math.min(W, ear.cx + 60); x++) {
          const dd = Math.hypot(x - ear.cx, y - ear.cy);
          const t = (dd - ear.r) / (O.earFeather * ear.r);
          earW[y * W + x] = dd <= ear.r ? 1 : t >= 1 ? 0 : 1 - t * t * (3 - 2 * t);
        }
      }
    }

    let Ymin = null;
    if (O.noNewBlacks || (O.earRelief > 0 && ear)) {
      const rs = Math.max(1, Math.round(O.sharpR));
      const BIG = 1e9;
      const a = new Float64Array(N), b = new Float64Array(N);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let m = BIG;
        for (let k = -rs; k <= rs; k++) {
          const xx = x + k; if (xx < 0 || xx >= W) continue;
          const q = y * W + xx; if (!isFig[q]) continue;
          if (Ys[q] < m) m = Ys[q];
        }
        a[y * W + x] = m;
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let m = BIG;
        for (let k = -rs; k <= rs; k++) {
          const yy = y + k; if (yy < 0 || yy >= H) continue;
          const v = a[yy * W + x]; if (v < m) m = v;
        }
        b[y * W + x] = m;
      }
      Ymin = b;
    }

    let dAbsSum = 0, dn = 0, clipLow = 0, clipHigh = 0, floored = 0;
    for (let p = 0; p < N; p++) {
      if (!isFig[p]) continue;
      const b = Number.isFinite(base[p]) ? base[p] : Ys[p];
      const dv = Ys[p] - b;
      dAbsSum += Math.abs(dv); dn++;
      // Soft floor: detail below sharpFloor gets no boost, ramping in over one floor-width.
      const mag = Math.abs(dv);
      const w = O.sharpFloor <= 0 ? 1 : Math.min(1, Math.max(0, (mag - O.sharpFloor) / O.sharpFloor));
      const amp = dv < 0 ? O.sharpDark : O.sharpLight;
      let Yn = Ys[p] + dv * amp * w;
      // The floor applies globally only under --noNewBlacks; otherwise it is blended in by the
      // ear weight, so the panel lines everywhere else are bit-for-bit what shipped.
      const fw = O.noNewBlacks ? 1 : earW[p];
      if (fw > 0 && Ymin && Ymin[p] < 1e8 && Yn < Ymin[p]) {
        Yn = Yn + (Ymin[p] - Yn) * fw;
        floored++;
      }
      if (Yn < 0) { Yn = 0; clipLow++; }
      if (Yn > 1) { Yn = 1; clipHigh++; }
      if (Ys[p] > 1e-9) {
        const s = Yn / Ys[p];
        Rc[p] *= s; Gc[p] *= s; Bc[p] *= s;
      }
    }
    sharpStats = { meanAbsDetail: dAbsSum / Math.max(1, dn), clipLow, clipHigh, floored, radius: Math.round(O.sharpR) };
  }

  // ================================================================ 7. COMPOSITE
  const out = g2.createImageData(W, H);
  const od = out.data;
  for (let p = 0; p < N; p++) {
    const i = p * 4;
    if (!isFig[p]) {
      od[i] = bgRGB[0]; od[i + 1] = bgRGB[1]; od[i + 2] = bgRGB[2];
      od[i + 3] = bgRGB[3];
    } else {
      od[i] = l2s(Rc[p]); od[i + 1] = l2s(Gc[p]); od[i + 2] = l2s(Bc[p]); od[i + 3] = 255;
      /*
       * A figure pixel that lands EXACTLY on the background colour is a hole — not just to G5,
       * which reads the output bytes, but to Meshy and to anyone else keying off the flat
       * backdrop. Nudge it one code value so the figure is always byte-distinguishable from the
       * background. Found by the G5 control run: the tool's own default parameters put 22 px of
       * the front view exactly on grey 128, and G5 correctly called them notches.
       */
      if (od[i] === bgRGB[0] && od[i + 1] === bgRGB[1] && od[i + 2] === bgRGB[2]) {
        od[i + 1] = bgRGB[1] >= 255 ? bgRGB[1] - 1 : bgRGB[1] + 1;
      }
    }
  }

  // Deliberate sabotage hook for the G4 control: shave one pixel off the figure everywhere.
  if (sabotage === 'erode') {
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      if (!isFig[p]) continue;
      if (isFig[p - 1] && isFig[p + 1] && isFig[p - W] && isFig[p + W]) continue;
      const i = p * 4;
      od[i] = bgRGB[0]; od[i + 1] = bgRGB[1]; od[i + 2] = bgRGB[2]; od[i + 3] = bgRGB[3];
    }
  }

  /*
   * Sabotage hook for the G5b control. Bites a 24x6 px notch out of the figure a little below the
   * crown — deliberately NOT at the very top, so the bbox is untouched and G4 still passes. This
   * is the exact shape of the defect that shipped: a hole in the silhouette that every existing
   * guard was blind to.
   */
  /*
   * Sabotage hook for the G5b control. Shaves 3 px off the LEFT silhouette edge across the head
   * rows only — deliberately not where the figure's leftmost extreme lives (that is the shoulders,
   * lower down), so G4's bbox test still passes and G5b has to catch it alone. Without this, G5b
   * had never once been observed failing, which would have made it decoration rather than a guard.
   */
  if (sabotage === 'shave') {
    for (let y = y0 + 20; y < y0 + 120; y++) {
      let lx = -1;
      for (let x = 0; x < W; x++) if (isFig[y * W + x]) { lx = x; break; }
      if (lx < 0) continue;
      for (let x = lx; x < lx + 3; x++) {
        const i = (y * W + x) * 4;
        od[i] = bgRGB[0]; od[i + 1] = bgRGB[1]; od[i + 2] = bgRGB[2]; od[i + 3] = bgRGB[3];
      }
    }
  }

  if (sabotage === 'nibble') {
    for (let y = y0 + 8; y < y0 + 14; y++) for (let x = (x0 + x1) >> 1; x < ((x0 + x1) >> 1) + 24; x++) {
      const p = y * W + x;
      if (!isFig[p]) continue;
      const i = p * 4;
      od[i] = bgRGB[0]; od[i + 1] = bgRGB[1]; od[i + 2] = bgRGB[2]; od[i + 3] = bgRGB[3];
    }
  }

  // ---- G4: silhouette bbox preserved, measured on the OUTPUT.
  let ox0 = 1e9, ox1 = -1, oy0 = 1e9, oy1 = -1;
  const bgKey = `${bgRGB[0]},${bgRGB[1]},${bgRGB[2]},${bgRGB[3]}`;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (`${od[i]},${od[i + 1]},${od[i + 2]},${od[i + 3]}` === bgKey) continue;
    if (x < ox0) ox0 = x; if (x > ox1) ox1 = x; if (y < oy0) oy0 = y; if (y > oy1) oy1 = y;
  }
  const outBox = [ox0, oy0, ox1, oy1];
  const g4 = { inBox, outBox, ok: inBox.join() === outBox.join() };

  // ---- G5: THE FIGURE IS NEVER ERODED.
  /*
   * G4 only ever compared BOUNDING BOXES, so it was blind to the defect that shipped: the shadow
   * flood ate ~2000 px out of the middle of each boot and every extreme of the bbox was still
   * held by some surviving pixel. G5 compares the actual SILHOUETTE.
   *
   * It is measured on the composited OUTPUT BYTES against a reference recomputed from the SOURCE
   * here, from scratch — it does not read O.shadowFigBelowMax, O.pageClose, isFig, isShadow or
   * isPocket. Disabling either fix leaves G5 running at full strength on a wrong picture, which
   * is the property the last five guards on this project lacked.
   *
   *   G5a INTERIOR BITE. A source figure pixel that the output turned to background, and that has
   *       more than 3 definite-figure pixels below it in its own column, was on top of something
   *       — a boot — not on the floor. Must be 0. Control: --shadowFigBelowMax 9999 restores the
   *       old behaviour and G5a lands at ~1900-2400 px per view.
   *   G5b OUTLINE EROSION. Above the ground band nothing may be removed at all, so the output's
   *       top / left / right silhouette profiles must never sit INSIDE the source's. One-sided on
   *       purpose: the notch repair is allowed to push the outline back OUT to where the art has
   *       it. Control: --pageClose 0, and --sabotage nibble.
   *
   * Legitimate shadow removal is the only thing exempt, and it exempts itself: floor shadow has
   * nothing below it (G5a) and lives in the ground band (G5b).
   */
  const g5 = (() => {
    const outFig = new Uint8Array(N);
    for (let p = 0; p < N; p++) {
      const i = p * 4;
      outFig[p] = `${od[i]},${od[i + 1]},${od[i + 2]},${od[i + 3]}` === bgKey ? 0 : 1;
    }
    // reference: source non-page, and its definite-figure-below count, both from pageRaw + lum8
    const belowSrc = new Int32Array(N);
    for (let x = 0; x < W; x++) {
      let run = 0;
      for (let y = H - 1; y >= 0; y--) {
        const p = y * W + x;
        belowSrc[p] = run;
        if (!pageRaw[p] && lum8[p] < O.shadowCut) run++;
      }
    }
    let bite = 0, biteDeepest = 0, lostTotal = 0;
    const biteBy = { shadow: 0, pocket: 0, other: 0 };   // diagnostic only — the test is on `bite`
    const bitePx = new Uint8Array(N);
    for (let p = 0; p < N; p++) {
      if (pageRaw[p] || outFig[p]) continue;
      lostTotal++;
      /*
       * Clipped-white source pixels are exempt, and this is a limit rather than a loophole. At 255
       * a pixel is byte-identical to the page and carries no information at all — it is only ever
       * called figure or pocket by CONNECTIVITY, which is the documented boundary of this whole
       * segmentation. The sealed page pocket between the legs is 21k such pixels, and 1203 of them
       * sit in columns where the boots flare inward underneath, so without this they are a
       * standing false positive on correct output.
       * The defect being guarded is NOT white: the boot uppers this ate read 185..230.
       */
      if (lum8[p] >= 254) continue;
      if (belowSrc[p] > 3) {
        bite++; bitePx[p] = 1;
        if (belowSrc[p] > biteDeepest) biteDeepest = belowSrc[p];
        if (isShadow[p]) biteBy.shadow++; else if (isPocket[p]) biteBy.pocket++; else biteBy.other++;
      }
    }
    // outline profiles, above the ground band only
    let worst = 0, badCols = 0, badRows = 0;
    const first = (get, n) => { for (let k = 0; k < n; k++) if (get(k)) return k; return -1; };
    const last = (get, n) => { for (let k = n - 1; k >= 0; k--) if (get(k)) return k; return -1; };
    for (let x = 0; x < W; x++) {
      const sT = first((y) => y < yGround && !pageRaw[y * W + x], H);
      const oT = first((y) => y < yGround && outFig[y * W + x], H);
      if (sT < 0) continue;
      const dv = (oT < 0 ? yGround : oT) - sT;      // positive = output outline sits INSIDE
      if (dv > 1) { badCols++; if (dv > worst) worst = dv; }
    }
    for (let y = 0; y < yGround; y++) {
      const sL = first((x) => !pageRaw[y * W + x], W), sR = last((x) => !pageRaw[y * W + x], W);
      if (sL < 0) continue;
      const oL = first((x) => outFig[y * W + x], W), oR = last((x) => outFig[y * W + x], W);
      const dL = (oL < 0 ? W : oL) - sL, dR = sR - (oR < 0 ? -1 : oR);
      const dv = Math.max(dL, dR);
      if (dv > 1) { badRows++; if (dv > worst) worst = dv; }
    }
    /*
     * G5c NOTCHES. G5a and G5b both missed the page-flood notches when they were first written:
     * --pageClose 0 sailed through both. A notch chewed into the SIDE of the crown is not the
     * topmost pixel of its column, so the outline profiles never see it, and it has no figure
     * below it, so the bite test never sees it either. This is the direct measurement — a closing
     * of the OUTPUT figure mask can only fill a concavity narrower than its own structuring
     * element, so anything it fills above the ground band is a notch that should not be there.
     * Restricted to above the ground band because the boundary between removed floor shadow and
     * kept boot is legitimately ragged at this scale.
     */
    let notches = 0;
    {
      const r = 2, BIG = 1;
      const up = new Uint8Array(N);
      for (let p = 0; p < N; p++) up[p] = outFig[p];
      const mx = (m) => {
        const a = new Uint8Array(N), b = new Uint8Array(N);
        for (let y = 0; y < yGround; y++) for (let x = 0; x < W; x++) {
          let v = 0;
          for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < W && m[y * W + xx]) { v = BIG; break; } }
          a[y * W + x] = v;
        }
        for (let y = 0; y < yGround; y++) for (let x = 0; x < W; x++) {
          let v = 0;
          for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < yGround && a[yy * W + x]) { v = BIG; break; } }
          b[y * W + x] = v;
        }
        return b;
      };
      const mn = (m) => {
        const inv = new Uint8Array(N);
        for (let y = 0; y < yGround; y++) for (let x = 0; x < W; x++) { const p = y * W + x; inv[p] = m[p] ? 0 : 1; }
        const dd = mx(inv);
        const o = new Uint8Array(N);
        for (let y = 0; y < yGround; y++) for (let x = 0; x < W; x++) { const p = y * W + x; o[p] = dd[p] ? 0 : 1; }
        return o;
      };
      /*
       * Only concavities that open onto the OUTER background count. The sealed page pocket between
       * the legs is background in the output too, and its boundary against the legs is every bit as
       * concave as a notch — front and back scored 21 px of pure false positive before this.
       * The pocket's only route to the outside is DOWNWARD through the removed floor shadow, so a
       * border flood restricted to rows above the ground band reaches every genuine outer notch and
       * never reaches the pocket. That is a geometric fact about these elevations, the same one the
       * POCKET label itself relies on, not a tuned threshold.
       */
      const outer = new Uint8Array(N);
      {
        const st = [];
        for (let x = 0; x < W; x++) if (!up[x]) { st.push(x); outer[x] = 1; }
        for (let y = 0; y < yGround; y++) {
          for (const x of [0, W - 1]) { const p = y * W + x; if (!up[p] && !outer[p]) { outer[p] = 1; st.push(p); } }
        }
        while (st.length) {
          const p = st.pop();
          const x = p % W, y = (p / W) | 0;
          const nb = [];
          if (x > 0) nb.push(p - 1);
          if (x < W - 1) nb.push(p + 1);
          if (y > 0) nb.push(p - W);
          if (y < yGround - 1) nb.push(p + W);
          for (const q of nb) { if (!outer[q] && !up[q]) { outer[q] = 1; st.push(q); } }
        }
      }
      const closed = mn(mx(up));
      for (let y = r; y < yGround - r; y++) for (let x = r; x < W - r; x++) {
        const p = y * W + x;
        if (closed[p] && !up[p] && outer[p]) notches++;
      }
    }

    return {
      lostTotal, bite, biteDeepest, badCols, badRows, worstOutline: worst, biteBy, bitePx, notches,
      ok: bite === 0 && badCols === 0 && badRows === 0 && notches === 0,
    };
  })();

  g2.putImageData(out, 0, 0);
  const png = cv.toDataURL('image/png');

  // ---- debug mask image
  let maskPng = null;
  {
    const mk = g2.createImageData(W, H);
    for (let p = 0; p < N; p++) {
      const i = p * 4; mk.data[i + 3] = 255;
      if (isShadow[p]) { mk.data[i] = 255; mk.data[i + 1] = 40; mk.data[i + 2] = 40; }
      else if (isPocket[p]) { mk.data[i] = 40; mk.data[i + 1] = 90; mk.data[i + 2] = 255; }
      else if (isPage[p]) { mk.data[i] = 255; mk.data[i + 1] = 255; mk.data[i + 2] = 255; }
      else if (!isValid[p]) { mk.data[i] = 255; mk.data[i + 1] = 220; mk.data[i + 2] = 0; }
      else { const v = Math.round(lum8[p] * 0.55); mk.data[i] = v; mk.data[i + 1] = v; mk.data[i + 2] = v; }
    }
    // The ear relief disc, as two cyan rings at r and 1.35r — this is how the hardcoded EAR
    // coordinates were confirmed against the actual ring rather than trusted from a centroid.
    if (ear) {
      for (let y = Math.max(0, ear.cy - 60); y < Math.min(H, ear.cy + 60); y++) {
        for (let x = Math.max(0, ear.cx - 60); x < Math.min(W, ear.cx + 60); x++) {
          const dd = Math.hypot(x - ear.cx, y - ear.cy);
          if (Math.abs(dd - ear.r) < 0.6 || Math.abs(dd - ear.r * (1 + O.earFeather)) < 0.6) {
            const i = (y * W + x) * 4;
            mk.data[i] = 0; mk.data[i + 1] = 255; mk.data[i + 2] = 255;
          }
        }
      }
    }
    // G5's failing pixels in MAGENTA, over everything, so a failure is locatable rather than
    // just a number. This is how the remaining 1203 px were traced to the sealed page pocket.
    for (let p = 0; p < N; p++) if (g5.bitePx[p]) { const i = p * 4; mk.data[i] = 255; mk.data[i + 1] = 0; mk.data[i + 2] = 255; }
    g2.putImageData(mk, 0, 0);
    maskPng = cv.toDataURL('image/png');
  }

  return {
    W, H, fw, fh, inBox, rIll,
    counts: { nFig, nClipped, nShadow, nPocket, nPage: N - nFig - nShadow - nPocket, emblemPx },
    ill: { med: illMed, p01: illP01, p99: illP99, ratio: illP99 / Math.max(1e-9, illP01) },
    gain: { min: gMin, max: gMax },
    shadowComps: shadowComps.sort((a, b) => b.n - a.n).slice(0, 6),
    whiteComps: whiteComps.sort((a, b) => b.n - a.n).slice(0, 6),
    sharpStats, g2guard, g3, g4, g5: { ...g5, bitePx: undefined }, png, maskPng, inpaintIters, defringed, notchRepaired,
  };
};

// ---------------------------------------------------------------------------- run
await checkSources('before');

const { browser, page } = await openCanvasPage();
const results = {};
try {
  for (const v of viewList) {
    const rel = CONTROL_SRC ?? VIEWS[v];
    const url = await toDataURL(rel);
    const bgRGB = [...BG_RGB[OPTS.bg], OPTS.bg === 'transparent' ? 0 : 255];
    const r = await page.evaluate(WORKER, {
      url, O: OPTS, isFront: v === 'front', bgRGB, sabotage: CONTROL_SABOTAGE, ear: EAR[v] ?? null,
    });
    results[v] = r;

    const fails = [];
    if (!r.g3.ok) fails.push(`G3 page-plateau: non-page count differs between cut 231 (${r.g3.n231}) and 254 (${r.g3.n254}) — the matte is NOT hard, so this segmentation is invalid for this image`);
    if (!r.g2guard.ok) fails.push(`G2 shadow-mask: kept shadow is ${(r.g2guard.frac * 100).toFixed(1)}% of figure, shadow share of ground band ${(r.g2guard.shadowShare*100).toFixed(1)}% (cap ${(r.g2guard.shareCap*100).toFixed(0)}%), topmost shadow row ${r.g2guard.minY} vs ground band start ${r.g2guard.yGround}, ground-band figure median luma ${r.g2guard.groundFigMedL.toFixed(1)} (floor ${r.g2guard.groundFigMedMin})`);
    if (!r.g4.ok) fails.push(`G4 silhouette: input bbox ${r.g4.inBox.join(',')} != output bbox ${r.g4.outBox.join(',')}`);
    if (!r.g5.ok) fails.push(`G5 figure eroded: ${r.g5.bite} px of source figure turned to background with more than 3 px of figure BELOW them in-column (deepest ${r.g5.biteDeepest}) — that is a bite out of a boot, not floor shadow; outline sits inside the source on ${r.g5.badCols} columns / ${r.g5.badRows} rows above the ground band, worst ${r.g5.worstOutline} px; unfilled silhouette notches above the ground band ${r.g5.notches} px`);

    console.log(`\n=== ${v} ===  ${rel}`);
    console.log(`  figure ${r.fw}x${r.fh} at bbox ${r.inBox.join(',')}   illumination blur r=${r.rIll}px (${(OPTS.radius * 100).toFixed(0)}% of figure height)`);
    console.log(`  px  figure ${r.counts.nFig}   clipped-white inside figure ${r.counts.nClipped} (${(100 * r.counts.nClipped / r.counts.nFig).toFixed(1)}% of figure)   shadow ${r.counts.nShadow}   sealed page pocket ${r.counts.nPocket}` + (r.counts.emblemPx ? `   emblem painted ${r.counts.emblemPx}` : '') + `   (Laplace fill ${r.inpaintIters} sweeps)   de-fringed edge ring ${r.defringed}px`);
    console.log(`  illumination field over figure: p01 ${r.ill.p01.toFixed(4)}  med ${r.ill.med.toFixed(4)}  p99 ${r.ill.p99.toFixed(4)}  -> p99/p01 = ${r.ill.ratio.toFixed(2)}x`);
    console.log(`  gain applied: ${r.gain.min.toFixed(3)} .. ${r.gain.max.toFixed(3)}`);
    console.log(`  shadow share of ground band ${(r.g2guard.shadowShare*100).toFixed(1)}%  shadow med luma ${r.g2guard.shadowMedL} vs ground-band figure ${r.g2guard.groundFigMedL} (brighter by ${r.g2guard.brighterBy.toFixed(1)})   components (n, touchesPage): ${r.shadowComps.map((c) => `${c.n}${c.touchesPage ? '+' : '-'}`).join(' ')}`);
    console.log(`  clipped-white components (n, touchesShadow): ${r.whiteComps.map((c) => `${c.n}${c.touchesShadow ? 'S' : '.'}`).join(' ')}`);
    if (r.sharpStats) console.log(`  local contrast r=${r.sharpStats.radius}px dark x${OPTS.sharpDark} light x${OPTS.sharpLight} floor ${OPTS.sharpFloor}: mean|detail| ${r.sharpStats.meanAbsDetail.toFixed(4)}  clipped low ${r.sharpStats.clipLow} high ${r.sharpStats.clipHigh}  held at local min (no-new-blacks) ${r.sharpStats.floored}`);
    console.log(`  silhouette vs source: removed ${r.g5.lostTotal}px total (floor shadow + sealed pocket), of which interior BITE ${r.g5.bite}px (deepest ${r.g5.biteDeepest}px of figure below; shadow ${r.g5.biteBy.shadow} pocket ${r.g5.biteBy.pocket} other ${r.g5.biteBy.other}); outline inside source on ${r.g5.badCols} cols / ${r.g5.badRows} rows, worst ${r.g5.worstOutline}px; notches ${r.g5.notches}px; page notches repaired ${r.notchRepaired}px`);
    console.log(`  guards: G2 ${r.g2guard.ok ? 'pass' : 'FAIL'}  G3 ${r.g3.ok ? 'pass' : 'FAIL'}  G4 ${r.g4.ok ? 'pass' : 'FAIL'}  G5 ${r.g5.ok ? 'pass' : 'FAIL'}`);
    for (const f of fails) console.log(`    ⚠️ ${f}`);

    // The debug mask is written BEFORE the throw on purpose: when a guard fires you want to see
    // WHERE, and G5 paints its failing pixels magenta into this image.
    if (debugDir) {
      const dir = path.isAbsolute(debugDir) ? debugDir : path.join(ROOT, debugDir);
      await mkdir(dir, { recursive: true });
      const f = path.join(dir, `${v}.mask.png`);
      await writeFile(f, Buffer.from(r.maskPng.split(',')[1], 'base64'));
      console.log(`  wrote ${f}`);
    }

    if (fails.length) throw new Error(`GUARD FAILURE on ${v}:\n  - ${fails.join('\n  - ')}`);

    if (outDir) {
      const dir = path.isAbsolute(outDir) ? outDir : path.join(ROOT, outDir);
      await mkdir(dir, { recursive: true });
      const f = path.join(dir, `${v}.png`);
      await writeFile(f, Buffer.from(r.png.split(',')[1], 'base64'));
      console.log(`  wrote ${f}`);
    }
  }
} finally {
  await browser.close();
}

await checkSources('after');
console.log('\nG1 pass: all four sources byte-identical (md5 verified before and after).');
