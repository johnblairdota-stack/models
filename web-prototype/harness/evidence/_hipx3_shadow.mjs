// IS THE HIP BAND SHADOW-MAP ACNE? Nine rounds of the hip-band thread eliminated eight mechanisms -
// Loop's shrink, vertex displacement, shading normals, a thin hem, a separate skirt shell, a
// coarse-bridged recess, invented skin weights, the material's curvature response. NOT ONE of them
// touched the shadow map, and every one of those eliminations is consistent with acne:
//
//   * a shadow map ignores shading NORMALS entirely            -> the 5/30/75 deg sweep would be pixel-identical
//   * it ignores the MATERIAL entirely                         -> rseams/occ/seams would barely move it
//   * it is a depth comparison, so a 0.0 mm vertex displacement -> Butterfly's identity guarantee cannot help
//     still changes the DEPTH INTERPOLATED ACROSS A TRIANGLE
//   * acne appears as a RAGGED SAWTOOTH on a curved surface at a grazing light angle, which is
//     exactly what the ROI shows
//
// The last one is the mechanism that makes tessellation matter while geometry does not: a shadow
// map stores one depth per texel, and whether a surface self-shadows depends on the surface's slope
// WITHIN that texel. Subdividing changes which depths land in which texel even when every original
// vertex is provably unmoved, so the acne pattern can grow, move and change character on a mesh
// whose shape is identical. That is precisely the signature this defect has.
//
//   node harness/evidence/_hipx3_shadow.mjs "clip=n30&solo=1&anim=Alert"
//
// Arms, all inside ONE page load so nothing varies but the thing under test:
//   base          as shipped
//   noShadow      renderer.shadowMap.enabled = false, every light's castShadow off
//   bias-N        every shadow's normalBias raised to N mm (acne's textbook cure)
//
// THREE CONTROLS:
//   * BACKDROP - the empty patch `_bft1_band.mjs` uses. Must read ~0 dark on every arm.
//   * REDRAW - the frame's checksum must CHANGE between arms. ⚠️ THIS IS THE ONE THAT MATTERS AND
//     IT IS THE FAILURE THIS FILE EXISTS TO REFUSE: if the ablation is applied but the pipeline
//     never re-renders, every arm reports the base frame's numbers and the honest conclusion
//     "shadows are not the cause" is indistinguishable from "the switch did nothing". An arm whose
//     checksum equals base's is reported as UNRUN, not as a null result.
//   * FRAME - the base arm's dark count must equal the number `_bft1_band.mjs` reads off the
//     captured PNG for the same clip (n30 1333, bf65 1647). If it does not, this script is not
//     looking at the frame the thread's bar was set on.
import { chromium } from 'playwright';

const q = process.argv[2] ?? 'clip=n30&solo=1&anim=Alert';
const PORT = Number(process.env.RRR_SHOOT_PORT) || 5192;
const W = 1920, H = 1080;
const ROI = { x: 850, y: 505, w: 250, h: 165 };
const CTRL = { x: 200, y: 505, w: 250, h: 165 };
const EXPECT = { n30: 1333, bf65: 1647 };

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization', '--disable-frame-rate-limit'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.error('PAGEERROR', String(e).split('\n')[0]));
await page.goto(`http://127.0.0.1:${PORT}/?view=mesh.animated&capture=1&${q}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__rrr?.ready || window.__rrrError, null, { timeout: 240000 });
const verr = await page.evaluate(() => (window.__rrrError ? String(window.__rrrError) : null));
if (verr) { console.error('view failed: ' + verr.split('\n')[0]); process.exit(2); }
await page.evaluate(() => window.__rrr.settle(12));

const res = await page.evaluate(async ({ ROI, CTRL, W, H }) => {
  const e = window.__rrr.engine;
  const cv = e.renderer.domElement;
  const c2 = document.createElement('canvas');
  const lights = [];
  e.scene.traverse((o) => { if (o.isLight && o.shadow) lights.push(o); });

  const measure = () => {
    c2.width = cv.width; c2.height = cv.height;
    const g = c2.getContext('2d');
    g.drawImage(cv, 0, 0);
    const sx = cv.width / W, sy = cv.height / H;
    const one = (R) => {
      const d = g.getImageData(Math.round(R.x * sx), Math.round(R.y * sy),
        Math.round(R.w * sx), Math.round(R.h * sy)).data;
      let dark = 0, sum = 0, n = 0, ck = 0;
      for (let i = 0; i < d.length; i += 4) {
        const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        sum += L; n++;
        ck = (ck * 31 + d[i] + d[i + 1] * 7 + d[i + 2] * 13) % 2147483647;
        if (L < 70) dark++;
      }
      return { dark, mean: sum / n, ck };
    };
    return { roi: one(ROI), ctrl: one(CTRL) };
  };

  /*
   * ⚠️ `redraw()`, NOT `settle()`, AND THE REDRAW CONTROL BELOW CAUGHT THE FIRST VERSION OF THIS
   * LINE. `settle(n)` returns a PROMISE and advances the simulation by n frames; called without an
   * await it returns immediately having rendered nothing, so every arm measured the base frame and
   * the run reported "shadows change nothing" in the most convincing possible way - five arms, all
   * identical, all wrong. `redraw()` renders the pipeline synchronously at the CURRENT elapsed
   * time, which also keeps the pose fixed so the only thing differing between arms is the thing
   * under test rather than two frames of animation.
   */
  const render = () => { window.__rrr.redraw(); };
  const arms = [];
  arms.push({ name: 'base', ...measure() });

  // ---- arm: no shadows at all
  const savedCast = lights.map((l) => l.castShadow);
  e.renderer.shadowMap.enabled = false;
  lights.forEach((l) => { l.castShadow = false; });
  e.scene.traverse((o) => { if (o.material) { const m = [].concat(o.material); m.forEach((x) => { x.needsUpdate = true; }); } });
  render();
  arms.push({ name: 'noShadow', ...measure() });
  e.renderer.shadowMap.enabled = true;
  lights.forEach((l, i) => { l.castShadow = savedCast[i]; });
  e.scene.traverse((o) => { if (o.material) { const m = [].concat(o.material); m.forEach((x) => { x.needsUpdate = true; }); } });
  render();

  // ---- arms: raise normalBias, the textbook cure for acne
  const savedNB = lights.map((l) => l.shadow.normalBias);
  const savedB = lights.map((l) => l.shadow.bias);
  for (const nb of [0.002, 0.01, 0.03]) {
    lights.forEach((l) => { l.shadow.normalBias = nb; l.shadow.needsUpdate = true; });
    render();
    arms.push({ name: `nbias-${nb}`, ...measure() });
  }
  lights.forEach((l, i) => { l.shadow.normalBias = savedNB[i]; l.shadow.bias = savedB[i]; });
  render();
  arms.push({ name: 'restore', ...measure() });

  return {
    arms,
    lights: lights.map((l) => ({ type: l.type, castShadow: l.castShadow,
      bias: l.shadow.bias, normalBias: l.shadow.normalBias,
      mapSize: l.shadow.mapSize ? [l.shadow.mapSize.x, l.shadow.mapSize.y] : null,
      pos: l.position.toArray().map((v) => +v.toFixed(2)) })),
  };
}, { ROI, CTRL, W, H });
await browser.close();

console.log(`\n${q}`);
console.log('shadow-casting lights:');
for (const l of res.lights) {
  console.log(`  ${l.type.padEnd(18)} cast=${l.castShadow} bias=${l.bias} normalBias=${l.normalBias} ` +
    `map=${l.mapSize} pos=${JSON.stringify(l.pos)}`);
}
const base = res.arms[0];
console.log('\narm'.padEnd(12), 'darkPx'.padStart(8), 'vs base'.padStart(8), 'meanLuma'.padStart(9),
  'CTRLdark'.padStart(9), 'frameCk'.padStart(12), 'RUN?'.padStart(6));
for (const a of res.arms) {
  const ran = a.name === 'base' ? '-' : (a.ck === base.ck ? 'UNRUN' : 'ok');
  console.log(a.name.padEnd(12), String(a.roi.dark).padStart(8),
    (a.name === 'base' ? '-' : `${a.roi.dark - base.roi.dark >= 0 ? '+' : ''}${a.roi.dark - base.roi.dark}`).padStart(8),
    a.roi.mean.toFixed(1).padStart(9), String(a.ctrl.dark).padStart(9),
    String(a.roi.ck).padStart(12),
    (a.name === 'base' ? '-' : (a.roi.ck === base.roi.ck ? 'UNRUN' : 'ok')).padStart(6));
}
let bad = false;
const clip = /clip=([a-z0-9]+)/.exec(q)?.[1];
if (EXPECT[clip] != null && base.roi.dark !== EXPECT[clip]) {
  console.error(`\nCONTROL FAILED (FRAME): base reads ${base.roi.dark} dark px but _bft1_band.mjs ` +
    `reads ${EXPECT[clip]} for ${clip}. This is not the frame the bar was set on.`);
  bad = true;
} else if (EXPECT[clip] != null) {
  console.log(`\nCONTROL ok (FRAME): base ${base.roi.dark} matches _bft1_band.mjs's ${EXPECT[clip]}.`);
}
if (res.arms.some((a) => a.ctrl.dark > 5)) {
  console.error('CONTROL FAILED (BACKDROP): an arm reports dark pixels on empty backdrop.');
  bad = true;
} else {
  console.log('CONTROL ok (BACKDROP): every arm reads <=5 dark px on empty backdrop.');
}
const unrun = res.arms.slice(1, -1).filter((a) => a.roi.ck === base.roi.ck).map((a) => a.name);
if (unrun.length) {
  console.error(`CONTROL FAILED (REDRAW): ${unrun.join(', ')} produced a frame byte-identical to ` +
    'base, so the switch was applied but nothing re-rendered. These arms are UNRUN, not null ' +
    'results, and no conclusion may be drawn from them.');
  bad = true;
} else {
  console.log('CONTROL ok (REDRAW): every ablation arm changed the frame.');
}
if (bad) process.exit(3);
