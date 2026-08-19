/**
 * estate-owner-11: MEASURE THE ALIASING, rather than describe it.
 *
 * The plate's reflection target is minified about 7:1 (506 x 1024 texels onto 71 x 142 screen
 * pixels). Aliasing has a definition rather than a look: the image changes a lot when the
 * SAMPLING POSITION moves by a fraction of a screen pixel, because a different texel wins.
 * Correct prefiltering makes the same shift produce a small, smooth change.
 *
 * So: boot the view, capture the plate, then translate the reflection's uv by half a screen
 * pixel's worth of texels (a pure edit of `uEoMat`, nothing else in the frame moves), capture
 * again, and report the mean and 99th-percentile absolute luma change inside the plate.
 *
 * Note this measures the SAMPLER only — the render target is baked once at build time and is
 * bit-identical between the two captures, so any difference is the fetch and nothing else.
 *
 *   node harness/_tmp_eo11_jitter.mjs point
 *   node harness/_tmp_eo11_jitter.mjs sharp
 */
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync } from 'node:fs';

const PORT = 5178;
const MODE = process.argv[2] ?? 'sharp';
const DIR = process.argv[3] ?? 'C:/Users/John/AppData/Local/Temp/claude';
// half of the 7.1-texel screen-pixel footprint on the left plate, in texels
const SHIFT_TEXELS = 3.5;

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running on 5178'); process.exit(3); }

const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&mirrorfilter=${MODE}`,
  { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 240000 });
await page.evaluate((n) => window.__rrr.settle(n), 16);

const state = await page.evaluate(() => {
  const e = window.__rrr.engine;
  return e.endPlates.map((m) => ({
    name: m.name,
    filter: m.material.userData.planarFilter,
    patched: m.material.userData.planarPatched,
    lod: m.material.userData.planarLod,
    sharp: m.material.userData.planarSharpPatched,
    hasMips: m.userData.mirrorRT?.texture?.generateMipmaps ?? null,
  }));
});
console.log(`mode=${MODE}`, JSON.stringify(state));

const RECTS = { 'end-mirror.l': [958, 533, 64, 134], 'end-mirror.r': [1497, 443, 178, 235] };
const shots = {};
for (const phase of ['a', 'b']) {
  if (phase === 'b') {
    await page.evaluate(({ texels }) => {
      const e = window.__rrr.engine;
      for (const m of e.endPlates) {
        const u = m.material.userData.planarUniforms;
        const w = m.userData.mirrorRT.width;
        // uv.x = (0.5*clip.x + 0.5*clip.w) / clip.w  ->  row 0, col 3 is the +0.5 term.
        // Column-major elements: row0col3 is index 12.
        u.uEoMat.value.elements[12] += texels / w;
      }
    }, { texels: SHIFT_TEXELS });
    await page.evaluate((n) => window.__rrr.settle(n), 4);
  }
  for (const [name, r] of Object.entries(RECTS)) {
    const buf = await page.screenshot({ clip: { x: r[0], y: r[1], width: r[2], height: r[3] } });
    const f = `${DIR}/eo11-jit-${MODE}-${name.replace(/[^a-z0-9]/gi, '_')}-${phase}.png`;
    writeFileSync(f, buf);
    (shots[name] ??= {})[phase] = f;
  }
}
await browser.close();

// ---- diff the pairs -------------------------------------------------------
const { openCanvasPage, toDataURL } = await import('./imglib.mjs');
const { browser: b2, page: p2 } = await openCanvasPage();
await p2.setContent('<body style="margin:0"></body>');
for (const [name, pair] of Object.entries(shots)) {
  const [ua, ub] = [await toDataURL(pair.a), await toDataURL(pair.b)];
  const stats = await p2.evaluate(async ({ ua, ub }) => {
    const load = async (u) => { const i = new Image(); i.src = u; await i.decode(); return i; };
    const [ia, ib] = [await load(ua), await load(ub)];
    const cv = document.createElement('canvas');
    cv.width = ia.naturalWidth; cv.height = ia.naturalHeight;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(ia, 0, 0);
    const A = cx.getImageData(0, 0, cv.width, cv.height).data;
    cx.clearRect(0, 0, cv.width, cv.height);
    cx.drawImage(ib, 0, 0);
    const B = cx.getImageData(0, 0, cv.width, cv.height).data;
    const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    const ds = [];
    let mA = 0;
    for (let i = 0; i < A.length; i += 4) { ds.push(Math.abs(lum(A, i) - lum(B, i))); mA += lum(A, i); }
    ds.sort((x, y) => x - y);
    const mean = ds.reduce((s, v) => s + v, 0) / ds.length;
    return {
      n: ds.length,
      meanA: +(mA / ds.length).toFixed(2),
      meanAbsDelta: +mean.toFixed(3),
      p99: +ds[Math.floor(ds.length * 0.99)].toFixed(1),
      max: +ds[ds.length - 1].toFixed(1),
    };
  }, { ua, ub });
  console.log(`${MODE.padEnd(6)} ${name.padEnd(14)} meanL ${String(stats.meanA).padStart(6)} · `
    + `half-pixel shift: mean|dL| ${String(stats.meanAbsDelta).padStart(6)} · p99 ${String(stats.p99).padStart(5)} · max ${stats.max}`);
}
await b2.close();
