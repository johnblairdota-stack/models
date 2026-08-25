// eye-sweep-17: the grazing sheen on the ballroom floor, isolated to its lobe.
//
// The chain of ablations that got here, so nobody repeats them:
//   _eye17_sweep      the daylight spot at 25% takes white 4.56% -> 0.21%, so the white IS the
//                     sun; exposure and environmentIntensity barely touch it.
//   _eye17_floorwhy   with the parquet's ALBEDO forced black those pixels still read 131 —
//                     half the brightness is a specular lobe, not the wood.
//   _eye17_whatswhite not the shafts, not the pools, not the motes, not the glow patch.
//
// So it is direct-sun specular at grazing incidence, and a MeshPhysicalMaterial floor has TWO
// lobes that behave that way: the base GGX (whose F90 is `specularIntensity` for a dielectric)
// and a clearcoat, whose own Fresnel also runs to 1 at grazing no matter how rough the base
// is. The parquet carries clearcoat 0.35. This sweeps both, live, on one boot.
import { chromium } from 'playwright';
import net from 'node:net';

const PORT = 5178;
const argv = process.argv.slice(2);
const CAM = argv.includes('--cam') ? argv[argv.indexOf('--cam') + 1] : 'eye.floor';
const SPECS = argv.filter((a) => a.includes(':'));
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
await page.goto(`http://127.0.0.1:${PORT}/?view=room.ballroom&capture=1&cam=${CAM}`, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 600000 });
await page.evaluate((n) => window.__rrr.settle(n), 16);

await page.evaluate(() => {
  const e = window.__rrr.engine;
  window.__mats = [];
  if (e.floorParquet) window.__mats.push(e.floorParquet.material);
  if (e.floorReflect) window.__mats.push(e.floorReflect.material);
  window.__save = window.__mats.map((m) => ({
    cc: m.clearcoat, ccr: m.clearcoatRoughness, si: m.specularIntensity, r: m.roughness,
  }));
});

console.log(`cam=${CAM}   parquet + chequer`);
console.log('label            white%  clip%  bright%  detail   medianL   toeL');
for (const spec of SPECS) {
  const i = spec.indexOf(':');
  const label = spec.slice(0, i);
  const p = JSON.parse(spec.slice(i + 1));
  await page.evaluate((q) => {
    window.__mats.forEach((m, k) => {
      const s = window.__save[k];
      // `which` picks the surface: 0/absent = both, 1 = parquet only, 2 = chequer only.
      if (q.which === 1 && k !== 0) return;
      if (q.which === 2 && k !== 1) return;
      m.clearcoat = q.cc != null ? q.cc : s.cc;
      m.clearcoatRoughness = q.ccr != null ? q.ccr : s.ccr;
      m.specularIntensity = q.si != null ? q.si : s.si;
      m.needsUpdate = true;
    });
  }, p);
  await page.evaluate((n) => window.__rrr.settle(n), 5);
  const r = await page.evaluate(() => {
    const cv = document.querySelector('canvas');
    const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0);
    const W = c.width, H = c.height, n = W * H;
    const d = x.getImageData(0, 0, W, H).data;
    const Ls = new Float32Array(n);
    let white = 0, clip = 0, sum = 0, cnt = 0;
    for (let i = 0, k = 0; i < d.length; i += 4, k++) {
      if (Math.min(d[i], d[i + 1], d[i + 2]) >= 250) white++;
      if (Math.max(d[i], d[i + 1], d[i + 2]) >= 254) clip++;
      Ls[k] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    }
    for (let y = 2; y < H - 2; y++) for (let xx = 2; xx < W - 2; xx++) {
      const k = y * W + xx;
      if (Ls[k] <= 190) continue;
      sum += Math.abs(Ls[k] - (Ls[k - 1] + Ls[k + 1] + Ls[k - W] + Ls[k + W]) / 4); cnt++;
    }
    const srt = Float32Array.from(Ls).sort();
    const dec = Math.floor(n / 10); let toe = 0;
    for (let i = 0; i < dec; i++) toe += srt[i];
    return { white: white / n, clip: clip / n, bright: cnt / n, detail: cnt ? sum / cnt : 0,
             median: srt[Math.floor(n / 2)], toe: toe / dec };
  });
  console.log(`${label.padEnd(16)} ${(r.white * 100).toFixed(2).padStart(5)}  ${(r.clip * 100).toFixed(2).padStart(5)}  `
    + `${(r.bright * 100).toFixed(2).padStart(6)}  ${r.detail.toFixed(2).padStart(6)}  `
    + `${r.median.toFixed(1).padStart(7)}  ${r.toe.toFixed(1).padStart(5)}`);
}
await browser.close();
