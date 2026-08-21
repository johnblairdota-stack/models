/*
 * builder-head: WHAT PUTS THE HEAD'S 22 POINTS OF MIDTONE THERE.
 *
 * `_head1-uni.mjs` ruled the weathering out and the ruling is not subtle: zeroing uRRWOn — the
 * master for the ENTIRE injection — moves the head's dark<120 by 0.57 pp, from 32.80% to 32.23%,
 * against an art figure of 12.3-15.3%. Whatever darkens this head is not in the weathering block,
 * so no amount of tuning rrwWet / rrwScour / rrwPool / rrwOcc can reach it. (uRRWHeadClean = 0
 * moves it 21.6 pp the WRONG way, which is the direction control for that table: the protection
 * that already exists is working, and it is already doing the biggest single job on the head.)
 *
 * The SHAPE of the miss says where to look instead. Splitting the two cuts:
 *
 *            dark<90      dark<120     the band between them
 *   art       11.76%       15.31%          3.55 pp
 *   render    10.52%       32.27%         21.75 pp
 *
 * We are not darker in the darks — we have FEWER pixels below 90 than the art does. The entire
 * deviation is a slab of MIDTONE in 90..120 that the art does not have. The art's head is bimodal:
 * a bright pearl shell plus hard accents, and almost nothing in between. Ours has a soft grey
 * blanket over the back of the skull. That is a SHADING quantity, not a dirt quantity.
 *
 * So this probe ablates the things that shade rather than the things that soil, one at a time, on
 * the live material, and reads the delivered pixels back. Same frozen head band and same chroma
 * figure mask as `_head1-uni.mjs`, so the two tables are directly comparable.
 *
 * It reports dark<90 and dark<120 SEPARATELY, because a change that moves them together is a
 * general exposure change and a change that closes the gap between them is the actual fix.
 *
 * usage: node harness/evidence/_head2-shade.mjs [port] [azim]
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
  const mats = [];
  e.scene.traverse((n) => {
    const ms = n.material ? (Array.isArray(n.material) ? n.material : [n.material]) : [];
    for (const m of ms) if (m?.userData?.weathering && !mats.includes(m)) mats.push(m);
  });
  if (!mats.length) return { err: 'no material carries userData.weathering' };

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

  const d0 = grab();
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (d0[i + 3] <= 40 || isChroma(d0[i], d0[i + 1], d0[i + 2])) continue;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  const yB = Math.round(y0 + (y1 - y0 + 1) * 0.20);
  const stat = (d) => {
    let n = 0, d90 = 0, d120 = 0, sum = 0;
    for (let y = y0; y < yB; y++) for (let x = x0; x <= x1; x++) {
      const i = (y * W + x) * 4;
      if (d[i + 3] <= 40 || isChroma(d[i], d[i + 1], d[i + 2])) continue;
      const L = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      n++; sum += L; if (L < 90) d90++; if (L < 120) d120++;
    }
    return { n, d90: d90 / n, d120: d120 / n, mean: sum / n };
  };

  const out = { baseline: stat(d0), off: {}, info: [] };
  for (const m of mats) {
    out.info.push({
      name: m.name || '(unnamed)', type: m.type,
      map: !!m.map, normalMap: !!m.normalMap, aoMap: !!m.aoMap, roughnessMap: !!m.roughnessMap,
      metalnessMap: !!m.metalnessMap, aoMapIntensity: m.aoMapIntensity,
      envMapIntensity: m.envMapIntensity, clearcoat: m.clearcoat,
      clearcoatRoughness: m.clearcoatRoughness, roughness: m.roughness, metalness: m.metalness,
      normalScale: m.normalScale ? [m.normalScale.x, m.normalScale.y] : null,
      color: m.color ? m.color.getHexString() : null,
    });
  }

  // Each entry: apply a change to every injected material, measure, undo.
  const TRIALS = {
    'normalMap = null':      (m) => { const v = m.normalMap; m.normalMap = null; m.needsUpdate = true; return () => { m.normalMap = v; m.needsUpdate = true; }; },
    'normalScale = 0':       (m) => { if (!m.normalScale) return () => {}; const v = m.normalScale.clone(); m.normalScale.set(0, 0); return () => m.normalScale.copy(v); },
    'aoMapIntensity = 0':    (m) => { const v = m.aoMapIntensity; m.aoMapIntensity = 0; return () => { m.aoMapIntensity = v; }; },
    'aoMap = null':          (m) => { const v = m.aoMap; m.aoMap = null; m.needsUpdate = true; return () => { m.aoMap = v; m.needsUpdate = true; }; },
    'roughnessMap = null':   (m) => { const v = m.roughnessMap; m.roughnessMap = null; m.needsUpdate = true; return () => { m.roughnessMap = v; m.needsUpdate = true; }; },
    'map = null':            (m) => { const v = m.map; m.map = null; m.needsUpdate = true; return () => { m.map = v; m.needsUpdate = true; }; },
    'clearcoat = 0':         (m) => { const v = m.clearcoat; m.clearcoat = 0; m.needsUpdate = true; return () => { m.clearcoat = v; m.needsUpdate = true; }; },
    'clearcoat = 1':         (m) => { const v = m.clearcoat; m.clearcoat = 1; m.needsUpdate = true; return () => { m.clearcoat = v; m.needsUpdate = true; }; },
    'envMapIntensity x2':    (m) => { const v = m.envMapIntensity; m.envMapIntensity = v * 2; return () => { m.envMapIntensity = v; }; },
    'roughness -> 0.25':     (m) => { const v = m.roughness; m.roughness = 0.25; return () => { m.roughness = v; }; },
    'color -> white':        (m) => { if (!m.color) return () => {}; const v = m.color.clone(); m.color.setRGB(1, 1, 1); return () => m.color.copy(v); },
  };
  for (const [label, fn] of Object.entries(TRIALS)) {
    const undo = mats.map(fn);
    out.off[label] = stat(grab());
    undo.forEach((u) => u());
  }
  out.restored = stat(grab());
  return out;
});

await browser.close();
if (r.err) { console.log(r.err); process.exit(1); }
console.log('\n  materials carrying the injection:');
for (const m of r.info) console.log('   ' + JSON.stringify(m));
const pc = (v) => (v * 100).toFixed(2).padStart(6);
console.log(`\n  baseline               dark<90 ${pc(r.baseline.d90)}%  dark<120 ${pc(r.baseline.d120)}%  gap ${((r.baseline.d120 - r.baseline.d90) * 100).toFixed(2)}pp  mean ${r.baseline.mean.toFixed(1)}`);
console.log('  ART (baseline_back)    dark<90  11.76%  dark<120  15.31%  gap 3.55pp');
console.log('\n  trial                  dark<90  dark<120     gap    mean   d(mean)');
const rows = Object.entries(r.off).map(([k, v]) => [k, v, v.d120 - v.d90]);
rows.sort((a, b) => a[2] - b[2]);
for (const [k, v, gap] of rows) {
  console.log(`  ${k.padEnd(22)} ${pc(v.d90)}%  ${pc(v.d120)}%  ${(gap * 100).toFixed(2).padStart(6)}  ${v.mean.toFixed(1).padStart(6)}  ${(v.mean - r.baseline.mean).toFixed(1).padStart(7)}`);
}
console.log(`  restored               dark<90 ${pc(r.restored.d90)}%  dark<120 ${pc(r.restored.d120)}%`);
console.log('');
