// mat-owner-1: what is actually reaching the metal in mat.brass?
// The base capture shows a NEAR-BLACK backdrop where the view asks for 0x4e535a, and a
// chrome ball that is mostly black. Both would explain all four open hates at once
// (metal is almost entirely environment reflection), so measure before authoring.
import { chromium } from 'playwright';

const PORT = 5178;
const VIEW = process.argv[2] || 'mat.brass';
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--disable-frame-rate-limit',
    '--force-device-scale-factor=1', '--hide-scrollbars'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=${VIEW}&capture=1`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 240000 });

const out = await page.evaluate(async () => {
  const THREE = window.__rrr.THREE ?? null;
  const e = window.__rrr.engine;
  const s = e.scene;
  const bg = s.background;
  const r = {};
  r.bgIsColor = !!(bg && bg.isColor);
  r.bgLinearRGB = bg && bg.isColor ? [bg.r, bg.g, bg.b] : null;
  r.bgHexString = bg && bg.isColor ? bg.getHexString() : null;
  r.envPresent = !!s.environment;
  r.envIntensity = s.environmentIntensity;
  r.outputColorSpace = e.renderer.outputColorSpace;
  r.toneMapping = e.renderer.toneMapping;
  r.colorManagementEnabled = window.THREE_CM ?? null;

  // what does the cyc mesh actually carry?
  r.cyc = null;
  s.traverse((o) => {
    if (o.isMesh && o.material && o.material.polygonOffset && !r.cyc) {
      r.cyc = { color: [o.material.color.r, o.material.color.g, o.material.color.b],
        hex: o.material.color.getHexString(), visible: o.visible };
    }
  });

  // material census: name -> envMap set? metalness? colour?
  const mats = [];
  s.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (!m || mats.find((x) => x.uuid === m.uuid)) return;
    mats.push({ uuid: m.uuid, type: m.type, metalness: m.metalness, roughness: m.roughness,
      envMap: !!m.envMap, envMapIntensity: m.envMapIntensity,
      map: !!m.map, normalMap: !!m.normalMap, rmMap: !!m.roughnessMap, aoMap: !!m.aoMap,
      transmission: m.transmission ?? null, defines: m.defines ? Object.keys(m.defines) : null,
      cacheKeyFn: !!m.customProgramCacheKey });
  });
  r.materials = mats;
  return r;
});

// pixel readback from the real canvas
const px = await page.evaluate(() => {
  const cv = document.querySelector('canvas');
  const c2 = document.createElement('canvas');
  c2.width = cv.width; c2.height = cv.height;
  const ctx = c2.getContext('2d');
  ctx.drawImage(cv, 0, 0);
  const pick = (fx, fy) => {
    const x = Math.round(fx * cv.width), y = Math.round(fy * cv.height);
    const d = ctx.getImageData(x, y, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const box = (fx, fy, fw, fh) => {
    const x = Math.round(fx * cv.width), y = Math.round(fy * cv.height);
    const w = Math.max(1, Math.round(fw * cv.width)), h = Math.max(1, Math.round(fh * cv.height));
    const d = ctx.getImageData(x, y, w, h).data;
    let n = 0, sr = 0, sg = 0, sb = 0, mx = 0, mn = 255;
    for (let i = 0; i < d.length; i += 4) {
      sr += d[i]; sg += d[i + 1]; sb += d[i + 2]; n++;
      const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      if (l > mx) mx = l; if (l < mn) mn = l;
    }
    return { mean: [ (sr/n).toFixed(1), (sg/n).toFixed(1), (sb/n).toFixed(1) ], maxL: mx.toFixed(1), minL: mn.toFixed(1) };
  };
  return {
    size: [cv.width, cv.height],
    backdropTopLeft: pick(0.06, 0.06),
    backdropTopMid: pick(0.5, 0.05),
    backdropBehindSpecimens: pick(0.30, 0.28),
    chromeBall: box(0.815, 0.755, 0.03, 0.05),
    giltShaft: box(0.495, 0.50, 0.02, 0.06),
    giltBase: box(0.49, 0.68, 0.03, 0.02),
    mirrorGlass: box(0.28, 0.45, 0.05, 0.08),
    frameBar: box(0.235, 0.45, 0.008, 0.06),
    stile: box(0.69, 0.45, 0.02, 0.06),
    hardwarePlate: box(0.665, 0.475, 0.008, 0.03),
    floor: box(0.15, 0.86, 0.06, 0.04),
  };
});

console.log(JSON.stringify({ scene: out, pixels: px }, null, 2));
await browser.close();
