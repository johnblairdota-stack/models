// eye-sweep-17: solve the blown sunlit floor LIVE, in one boot, at a player-eye camera.
//
// WHY LIVE. Round 17's #1 hate is that everything in direct sun clips to a textureless white
// plateau at eye height. Two candidate causes were in play — the planar floor reflection and
// the exposure/key balance — and re-shooting the view per candidate costs ~2 minutes each and
// re-boots the shader compile. This drives `window.__rrr.setGrade` and the scene's own lights
// on ONE settled boot and computes the round's own gate metrics (harness/_eye17_clip.mjs) on
// the framebuffer, so every sample is the same scene with one thing moved.
//
//   node harness/_eye17_sweep.mjs --cam eye.floor base:'{}' e130:'{"exposure":1.30}'
//
// A spec is label:JSON. Recognised keys: exposure, contrast, lift (grade), sun (the daylight
// SpotLight's intensity), env (scene.environmentIntensity), bounce (the three bounceFill
// DirectionalLights, together).
//
// ⚠ `bounce` IS IN HERE BECAUSE `env` IS THE WRONG KNOB, and the file it is testing says so:
// rounds 11-12 established that ~95% of the light on this floor was a structureless five-box
// IBL shell, that this was the whole of "evenly lit", and that the shell coming down 3.2 ->
// 1.70 is what let the sun patches read at all. Buying back the room's dark half by turning
// that shell up again would hand round 12 straight back. The three directional fills are the
// same file's own answer — "dropping the shell alone takes it 67.9 -> 40.0 mean and FLAT, and
// the directional fill is what puts the modelling back" — so they are what a fix should move.
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync } from 'node:fs';

const PORT = 5178;
const argv = process.argv.slice(2);
let CAM = 'eye.floor';
let OUT = null;                       // --out DIR also writes a frame per label; numbers alone
const SPECS = [];                     // sent this round down two wrong causes already.
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--cam') { CAM = argv[++i]; continue; }
  if (argv[i] === '--out') { OUT = argv[++i]; continue; }
  if (argv[i].includes(':')) SPECS.push(argv[i]);
}

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
});
if (!(await portOpen(PORT))) { console.error('vite not running on 5178 — npm run dev'); process.exit(3); }

const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&cam=${CAM}`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 600000 });
await page.evaluate((n) => window.__rrr.settle(n), 16);

// The one SpotLight in the room is the daylight; grab it once so a sweep can move it.
await page.evaluate(() => {
  const e = window.__rrr.engine;
  window.__sun = null;
  e.scene.traverse((o) => { if (o.isSpotLight && !window.__sun) window.__sun = o; });
  window.__sun0 = window.__sun ? window.__sun.intensity : 0;
  window.__env0 = e.scene.environmentIntensity;
  // The bounce fill is three DirectionalLights; the daylight is the one SpotLight. Nothing
  // else in this room is either type, so picking them up by class is unambiguous.
  window.__dirs = [];
  e.scene.traverse((o) => { if (o.isDirectionalLight) window.__dirs.push(o); });
  window.__dir0 = window.__dirs.map((d) => d.intensity);
});

console.log(`cam=${CAM}`);
console.log('label        white%  clip%  bright%  detail   medianL  toeL    p90   p90/p50');
for (const spec of SPECS) {
  const i = spec.indexOf(':');
  const label = spec.slice(0, i);
  const p = JSON.parse(spec.slice(i + 1));
  await page.evaluate((q) => {
    const e = window.__rrr.engine;
    if (q.sun != null && window.__sun) window.__sun.intensity = window.__sun0 * q.sun;
    if (q.env != null) e.scene.environmentIntensity = window.__env0 * q.env;
    if (q.bounce != null) window.__dirs.forEach((d, i) => { d.intensity = window.__dir0[i] * q.bounce; });
    const g = {};
    for (const k of ['exposure', 'contrast', 'saturation', 'lift', 'toeCrush', 'bloomStrength']) {
      if (q[k] != null) g[k] = q[k];
    }
    if (Object.keys(g).length) window.__rrr.setGrade(g);
  }, p);
  await page.evaluate((n) => window.__rrr.settle(n), 6);
  if (OUT) writeFileSync(`${OUT}/sw-${CAM}-${label}.png`, await page.screenshot());
  const r = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0);
    const W = c.width, H = c.height;
    const d = x.getImageData(0, 0, W, H).data;
    const n = W * H;
    const lum = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    let white = 0, clip = 0, sum = 0, cnt = 0;
    const Ls = new Float32Array(n);
    for (let i = 0, k = 0; i < d.length; i += 4, k++) {
      if (Math.min(d[i], d[i + 1], d[i + 2]) >= 250) white++;
      if (Math.max(d[i], d[i + 1], d[i + 2]) >= 254) clip++;
      Ls[k] = lum(i);
    }
    for (let y = 2; y < H - 2; y++) {
      for (let xx = 2; xx < W - 2; xx++) {
        const k = y * W + xx;
        if (Ls[k] <= 190) continue;
        const nb = (Ls[k - 1] + Ls[k + 1] + Ls[k - W] + Ls[k + W]) / 4;
        sum += Math.abs(Ls[k] - nb); cnt++;
      }
    }
    const srt = Float32Array.from(Ls).sort();
    let toe = 0; const dec = Math.floor(n / 10);
    for (let i = 0; i < dec; i++) toe += srt[i];
    // MACRO is the thing that must NOT be given up to fix the blowout. Rounds 12-14 bought the
    // room's hard sun patches with a deliberate rebalance, and any fix that simply turns the
    // key down would hand that back. p90/p50 is the cheapest honest proxy for "the patches
    // still separate from the field": it moves when the ratio between the lit and the shaded
    // floor changes and stays put under a pure exposure shift.
    const p90 = srt[Math.floor(n * 0.9)], p50 = srt[Math.floor(n / 2)];
    return { white: white / n, clip: clip / n, bright: cnt / n,
             detail: cnt ? sum / cnt : 0, median: p50, toe: toe / dec,
             p90, ratio: p90 / Math.max(p50, 1e-3) };
  });
  console.log(`${label.padEnd(12)} ${(r.white * 100).toFixed(2).padStart(5)}  ${(r.clip * 100).toFixed(2).padStart(5)}  `
    + `${(r.bright * 100).toFixed(2).padStart(6)}  ${r.detail.toFixed(2).padStart(6)}  `
    + `${r.median.toFixed(1).padStart(7)}  ${r.toe.toFixed(1).padStart(5)}  `
    + `${r.p90.toFixed(1).padStart(5)}  ${r.ratio.toFixed(2).padStart(5)}`);
}
await browser.close();
