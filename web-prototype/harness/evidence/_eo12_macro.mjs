/**
 * estate-owner-12: WHERE DOES THE BALLROOM FLOOR'S BRIGHTNESS COME FROM, AND WHICH KNOB BUYS
 * MACRO LIGHT/SHADOW VARIATION?
 *
 * `critic-estate-9` and `estate-owner-11` both measured the one remaining gap to the locked art
 * as MACRO 32-px block variation on the lit floor (0.658 vs the art's 0.915) — "this room is
 * evenly lit, the reference has big hard sun patches and deep shade". This boots the view ONCE
 * and sweeps live scene states, reporting mean / median / p95 / macro over three floor rects so
 * the direction is a number rather than an opinion.
 *
 * ⚠ TWO THINGS THIS INSTRUMENT CANNOT SEE, stated so nobody quotes it as a final figure:
 *   1. The floor's PLANAR REFLECTION is rendered once at build time. Changing lights live moves
 *      the floor's direct and diffuse terms and leaves the reflection at the OLD lighting, so a
 *      live sweep understates any change that also darkens the reflected room.
 *   2. `scene.environmentIntensity` is the divisor baked into the floor's `uEoGain`. Lowering it
 *      live scales the injected reflection up by the same factor. In source the two move
 *      together; here they do not.
 * Use this to pick a direction, then re-measure from a real capture.
 *
 *   node harness/evidence/_eo12_macro.mjs [--states a,b,c] [--shots]
 */
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync } from 'node:fs';

const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d = null) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const SHOTS = argv.includes('--shots');
const OUT = opt('dir', 'C:/Users/John/AppData/Local/Temp/claude/C--Users-John-Documents-Run-Robot-Run-web-prototype/5302cea7-8124-49db-b4fe-f14ded483e05/scratchpad');
const EXTRA = opt('extra', '');

// The three floor rects, chosen on the 1920x1080 capture and held fixed across every state.
// floorA/B are open chequer; floorC is the near-left third that round 11's floor fix owns.
const RECTS = (opt('rects') === 'wide' ? [
  ['floorA', 300, 760, 896, 300],
  ['floorRIGHT', 1250, 780, 600, 288],
  ['endwall', 820, 380, 512, 224],
  ['frame', 0, 0, 1920, 1080],
] : [
  ['floorA', 300, 760, 896, 300],
  ['floorB', 560, 740, 672, 320],
  ['floorC', 200, 760, 640, 300],
  ['floorWIDE', 150, 700, 1600, 380],
]);

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
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1${EXTRA}`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 300000 });
await page.evaluate((n) => window.__rrr.settle(n), 16);

// Census + save originals so every state is measured from the same baseline.
const census = await page.evaluate(() => {
  const e = window.__rrr.engine, s = e.scene;
  const spots = [], points = [], dirs = [];
  s.traverse((o) => {
    if (o.isSpotLight) spots.push(o);
    else if (o.isPointLight) points.push(o);
    else if (o.isDirectionalLight) dirs.push(o);
  });
  e.__L = { spots, points, dirs };
  e.__saved = {
    spotI: spots.map((l) => l.intensity),
    pointI: points.map((l) => l.intensity),
    dirI: dirs.map((l) => l.intensity),
    envI: s.environmentIntensity,
    env: s.environment,
  };
  return { spots: spots.length, points: points.length, dirs: dirs.length, envI: s.environmentIntensity };
});
console.log('census:', JSON.stringify(census));

const STATE_SRC = {
  base: '',
  sun3: 'L.spots.forEach((l,i)=>l.intensity=S.spotI[i]*3);',
  sun6: 'L.spots.forEach((l,i)=>l.intensity=S.spotI[i]*6);',
  sun12: 'L.spots.forEach((l,i)=>l.intensity=S.spotI[i]*12);',
  sunoff: 'L.spots.forEach((l)=>l.intensity=0);',
  env20: 's.environmentIntensity=2.0;',
  env14: 's.environmentIntensity=1.4;',
  env08: 's.environmentIntensity=0.8;',
  ptsoff: 'L.points.forEach((l)=>l.intensity=0);',
  diroff: 'L.dirs.forEach((l)=>l.intensity=0);',
  // the combination the diagnosis points at: sun up, ambient down
  combo_a: 'L.spots.forEach((l,i)=>l.intensity=S.spotI[i]*6); s.environmentIntensity=1.4;',
  combo_b: 'L.spots.forEach((l,i)=>l.intensity=S.spotI[i]*12); s.environmentIntensity=0.9;',
  combo_c: 'L.spots.forEach((l,i)=>l.intensity=S.spotI[i]*20); s.environmentIntensity=0.6;',
  combo_d: 'L.spots.forEach((l,i)=>l.intensity=S.spotI[i]*40); s.environmentIntensity=1.2;',
  combo_e: 'L.spots.forEach((l,i)=>l.intensity=S.spotI[i]*60); s.environmentIntensity=1.0;',
  combo_f: 'L.spots.forEach((l,i)=>l.intensity=S.spotI[i]*100); s.environmentIntensity=0.9;',
  combo_g: 'L.spots.forEach((l,i)=>l.intensity=S.spotI[i]*160); s.environmentIntensity=0.8;',
};
// Directional-fill variants: the 3 bounceFill DirectionalLights are the only shaped, zero-cost
// fill in the room (an IBL five-box shell is near-uniform in every direction and is what makes
// this room flat). dK = every directional light x K.
for (const env of [2.4, 2.0, 1.8]) {
  for (const sun of [16, 24]) {
    for (const d of [1, 3, 5, 8]) {
      STATE_SRC[`e${String(env).replace('.', '')}s${sun}d${d}`] =
        `s.environmentIntensity=${env};`
        + `L.spots.forEach((l,i)=>l.intensity=S.spotI[i]*${sun});`
        + `L.dirs.forEach((l,i)=>l.intensity=S.dirI[i]*${d});`;
    }
  }
}
// A grid: eNN_sMM_pKK == environmentIntensity N.N, spot x MM, every point light x K.K.
for (const env of [2.2, 1.8, 1.5, 1.2]) {
  for (const sun of [8, 16, 30, 60]) {
    for (const pts of [1, 3, 6]) {
      STATE_SRC[`e${String(env).replace('.', '')}s${sun}p${pts}`] =
        `s.environmentIntensity=${env};`
        + `L.spots.forEach((l,i)=>l.intensity=S.spotI[i]*${sun});`
        + `L.points.forEach((l,i)=>l.intensity=S.pointI[i]*${pts});`;
    }
  }
}
const want = (opt('states') || Object.keys(STATE_SRC).join(',')).split(',');

const header = 'state       ' + RECTS.map(([n]) => n.padEnd(30)).join('');
console.log(header);
console.log('            ' + RECTS.map(() => 'mean/med/p95   macro'.padEnd(30)).join(''));

for (const key of want) {
  if (!(key in STATE_SRC)) { console.error(`unknown state ${key}`); continue; }
  await page.evaluate(({ src }) => {
    const e = window.__rrr.engine, s = e.scene, L = e.__L, S = e.__saved;
    // restore
    L.spots.forEach((l, i) => { l.intensity = S.spotI[i]; });
    L.points.forEach((l, i) => { l.intensity = S.pointI[i]; });
    L.dirs.forEach((l, i) => { l.intensity = S.dirI[i]; });
    s.environmentIntensity = S.envI;
    s.environment = S.env;
    // eslint-disable-next-line no-new-func
    if (src) new Function('e', 's', 'L', 'S', src)(e, s, L, S);
  }, { src: STATE_SRC[key] });
  await page.evaluate((n) => window.__rrr.settle(n), 8);

  const buf = await page.screenshot();
  if (SHOTS) writeFileSync(`${OUT}/eo12-${key}.png`, buf);
  const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;
  const rows = await page.evaluate(async ({ url, rects }) => {
    const img = new Image(); img.src = url; await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const W = cv.width;
    const all = cx.getImageData(0, 0, cv.width, cv.height).data;
    const out = [];
    for (const [name, X, Y, Wd, Ht] of rects) {
      const L = new Float64Array(Wd * Ht);
      for (let dy = 0; dy < Ht; dy++) {
        for (let dx = 0; dx < Wd; dx++) {
          const i = ((Y + dy) * W + (X + dx)) * 4;
          L[dy * Wd + dx] = 0.2126 * all[i] + 0.7152 * all[i + 1] + 0.0722 * all[i + 2];
        }
      }
      const blocks = [];
      for (let by = 0; by + 32 <= Ht; by += 32) {
        for (let bx = 0; bx + 32 <= Wd; bx += 32) {
          let s = 0;
          for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) s += L[(by + y) * Wd + bx + x];
          blocks.push(s / 1024);
        }
      }
      const mean = (a) => { let s = 0; for (const v of a) s += v; return s / a.length; };
      const std = (a) => { const m = mean(a); let s = 0; for (const v of a) s += (v - m) * (v - m); return Math.sqrt(s / a.length); };
      const ls = Array.from(L).sort((a, b) => a - b);
      out.push({
        name,
        mean: +mean(L).toFixed(1),
        med: +ls[ls.length >> 1].toFixed(1),
        p95: +ls[Math.floor(ls.length * 0.95)].toFixed(1),
        macro: +(std(blocks) / Math.max(1, mean(blocks))).toFixed(4),
      });
    }
    return out;
  }, { url: dataUrl, rects: RECTS });

  console.log(key.padEnd(12) + rows.map((r) => `${r.mean}/${r.med}/${r.p95}`.padEnd(15) + String(r.macro).padEnd(15)).join(''));
}
await browser.close();
