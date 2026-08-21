/*
 * builder-head: WHICH RRW UNIFORM DARKENS THE HEAD.
 *
 * The head measures dark<120 at 32.2-44.6% against the art's 12.3-15.3% (baseline_back), the
 * largest single deviation on the figure — and it carries FEWER seams than the art (7.2-8.6 vs
 * 10.9-11.5). Darker with less structure is grime, not machining. Six terms could be doing it
 * (rrwWet/rrwScour from uRRWGrime, the screen-AO cavity via uRRWOcc, the panel network via
 * uRRWSeam/uRRWSeamNear, the joint rings) and reading the code cannot rank them.
 *
 * So do what `_hubs2-uni.mjs` did for the shoulder boss: zero ONE live uniform at a time on the
 * material the head is actually wearing, redraw, and read the delivered pixels back. The
 * statistic is the head band's dark<120 fraction, computed with the same chroma figure mask and
 * the same top-20%-of-figure-height band `_kit8_shellvalue.mjs` uses, so the numbers are directly
 * comparable to that probe's table.
 *
 * ⚠️ THE CONTROL IS uRRWOn. Zeroing it turns the ENTIRE weathering injection off. If any single
 * term's ablation is bigger than uRRWOn's, the probe is measuring noise rather than the term, and
 * the run should be thrown away. It is printed first for that reason.
 *
 * usage: node harness/evidence/_head1-uni.mjs [port] [azim]
 */
import { chromium } from 'playwright';

const PORT = process.argv[2] ?? '5192';
const AZIM = process.argv[3] ?? '180';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`http://localhost:${PORT}/?view=mesh.animated&capture=1&solo=1&clip=merged`
  + `&anim=Alert&label=0&azim=${AZIM}&bg=ff00ff`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__rrr?.engine || window.__rrrError, null, { timeout: 240000 });
await page.evaluate(() => window.__rrr.settle(30));

const r = await page.evaluate(async () => {
  const e = window.__rrr.engine;
  // Every material in the scene carrying the weathering injection. The player's body is one
  // skinned primitive, so in a solo capture this is a set of one — but collect them all and
  // ablate them together rather than assuming which one the head is on.
  const unis = [];
  e.scene.traverse((n) => {
    const ms = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
    for (const m of ms) if (m?.userData?.weathering && !unis.includes(m.userData.weathering)) unis.push(m.userData.weathering);
  });
  if (!unis.length) return { err: 'no material carries userData.weathering' };

  const W = e.canvas.width, H = e.canvas.height;
  const c2 = document.createElement('canvas');
  c2.width = W; c2.height = H;
  const g2 = c2.getContext('2d', { willReadFrequently: true });
  const isChroma = (r0, g0, b0) => r0 > 150 && b0 > 150 && g0 < 110;

  const grab = () => {
    window.__rrr.redraw();
    g2.clearRect(0, 0, W, H);
    g2.drawImage(e.canvas, 0, 0);
    return g2.getImageData(0, 0, W, H).data;
  };

  // Figure bbox from the baseline frame, then FROZEN. Recomputing it per ablation would let a
  // term that changes the silhouette edge also change the band being measured.
  const d0 = grab();
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (d0[i + 3] <= 40 || isChroma(d0[i], d0[i + 1], d0[i + 2])) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const figH = y1 - y0 + 1;
  const yB = Math.round(y0 + figH * 0.20);

  const stat = (d) => {
    let n = 0, dark = 0, sum = 0;
    for (let y = y0; y < yB; y++) for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] <= 40 || isChroma(d[i], d[i + 1], d[i + 2])) continue;
      const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      n++; sum += L; if (L < 120) dark++;
    }
    return { n, dark120: n ? dark / n : null, mean: n ? sum / n : null };
  };

  const out = { fig: [x0, y0, x1, y1], figH, materials: unis.length, baseline: stat(d0), off: {} };
  const KEYS = ['uRRWOn', 'uRRWGrime', 'uRRWOcc', 'uRRWSeam', 'uRRWSeamNear', 'uRRWSeamOcc',
    'uRRWSeamDeep', 'uRRWSeamFlr', 'uRRWLift', 'uRRWAOOn', 'uRRWRing', 'uRRWRidge', 'uRRWDark',
    'uRRWInner', 'uRRWTSeam', 'uRRWVent', 'uRRWChrFloor', 'uRRWOccPool'];
  for (const k of KEYS) {
    const have = unis.filter((u) => u[k] && typeof u[k].value === 'number');
    if (!have.length) { out.off[k] = 'absent/not scalar'; continue; }
    const was = have.map((u) => u[k].value);
    have.forEach((u) => { u[k].value = 0; });
    out.off[k] = { was: was[0], ...stat(grab()) };
    have.forEach((u, i) => { u[k].value = was[i]; });
  }
  // uRRWHeadClean is the head's own protection: ablating it should make the head WORSE, which is
  // the direction control for the whole table.
  const hc = unis.filter((u) => u.uRRWHeadClean && typeof u.uRRWHeadClean.value === 'number');
  if (hc.length) {
    const was = hc.map((u) => u.uRRWHeadClean.value);
    hc.forEach((u) => { u.uRRWHeadClean.value = 0; });
    out.off.uRRWHeadClean = { was: was[0], ...stat(grab()) };
    hc.forEach((u, i) => { u.uRRWHeadClean.value = was[i]; });
  }
  out.restored = stat(grab());
  return out;
});

await browser.close();
if (r.err) { console.log(r.err); process.exit(1); }
console.log(`\n  head band ${r.fig.join(',')}  figH=${r.figH}  materials=${r.materials}`);
const pc = (v) => (v == null ? '  --' : (v * 100).toFixed(2).padStart(6));
console.log(`  baseline           dark<120 ${pc(r.baseline.dark120)}%   mean ${r.baseline.mean.toFixed(1)}   n=${r.baseline.n}`);
const rows = Object.entries(r.off).filter(([, v]) => typeof v === 'object')
  .map(([k, v]) => [k, v, r.baseline.dark120 - v.dark120]);
rows.sort((a, b) => b[2] - a[2]);
console.log('  uniform = 0        dark<120     d(pp)    mean    d(mean)   (was)');
for (const [k, v, d] of rows) {
  console.log(`  ${k.padEnd(17)} ${pc(v.dark120)}%  ${(d * 100).toFixed(2).padStart(7)}  ${v.mean.toFixed(1).padStart(6)}  ${(v.mean - r.baseline.mean).toFixed(1).padStart(7)}   ${v.was}`);
}
for (const [k, v] of Object.entries(r.off)) if (typeof v === 'string') console.log(`  ${k.padEnd(17)} ${v}`);
console.log(`  restored           dark<120 ${pc(r.restored.dark120)}%   mean ${r.restored.mean.toFixed(1)}`);
console.log('');
