/*
 * builder-hubs2b: WHICH RRW UNIFORM DARKENS THE SHOULDER BOSS.
 *
 * `_hubs2-varying.mjs --fixinject=1` reproduces the defect exactly (capFixtureFR reads
 * (77,75,65) on the shared injected kit shell) BUT the body's own injected shell material
 * renders the same boss at (161,157,145). Both are `shellWhite()` with the same injection, so
 * the skinning varyings cannot be the whole story — the two materials differ only in OPTIONS.
 *
 * So: ablate the injection's own uniforms one at a time, on the material the boss is wearing,
 * and read the delivered pixel back. `material.userData.weathering` is the live uniform object.
 *
 * ⚠️ THE URL BELOW STILL CARRIES ?fixinject=1. That knob existed only while mesh-identity.js
 * was handing the fixtures an un-injected clone; it was deleted with the workaround on
 * 2026-08-17, so the flag is now inert and these probes read the SHIPPING path.
 *
 * usage: node harness/_hubs2-uni.mjs [port] [part] [azim]
 */
import { chromium } from 'playwright';

const PORT = process.argv[2] ?? '5192';
const PART = process.argv[3] ?? 'capFixtureFR';
const AZIM = process.argv[4] ?? '0';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`http://localhost:${PORT}/?view=mesh.animated&capture=1&solo=1&clip=merged`
  + `&anim=Alert&label=0&azim=${AZIM}&fixinject=1`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__rrr?.engine || window.__rrrError, null, { timeout: 180000 });
await page.evaluate(() => window.__rrr.settle(30));

const r = await page.evaluate(async (part) => {
  const e = window.__rrr.engine;
  let o = null;
  e.scene.traverse((n) => { if (n.name === part) o = n; });
  if (!o) return { err: `${part} missing` };
  const uni = o.material.userData.weathering;
  if (!uni) return { err: 'no userData.weathering on the material' };

  const cam = e.camera;
  const W = e.canvas.width, H = e.canvas.height;
  const p = o.getWorldPosition(new (cam.position.constructor)());
  const s = p.clone().project(cam);
  const cx = Math.round((s.x * 0.5 + 0.5) * W), cy = Math.round((-s.y * 0.5 + 0.5) * H);
  const c2 = document.createElement('canvas');
  c2.width = W; c2.height = H;
  const g2 = c2.getContext('2d', { willReadFrequently: true });
  const read = () => {
    window.__rrr.redraw();
    g2.clearRect(0, 0, W, H);
    g2.drawImage(e.canvas, 0, 0);
    const R = 4;
    const d = g2.getImageData(cx - R, cy - R, R * 2, R * 2).data;
    let a = 0, b = 0, c = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { a += d[i]; b += d[i + 1]; c += d[i + 2]; n++; }
    return [a / n, b / n, c / n].map(v => Math.round(v));
  };

  const out = { px: [cx, cy], baseline: read(), off: {} };
  const KEYS = ['uRRWOn', 'uRRWSeam', 'uRRWSeamOcc', 'uRRWSeamNear', 'uRRWSeamDeep', 'uRRWOcc',
    'uRRWGrime', 'uRRWDark', 'uRRWAOOn', 'uRRWHeadClean', 'uRRWLift', 'uRRWInner', 'uRRWTSeam',
    'uRRWRidge', 'uRRWJoint'];
  for (const k of KEYS) {
    const u = uni[k];
    if (!u || typeof u.value !== 'number') { out.off[k] = 'absent/not scalar'; continue; }
    const was = u.value;
    u.value = 0;
    out.off[k] = read();
    u.value = was;
    out.off[`${k} (was)`] = was;
  }
  out.restored = read();
  return out;
}, PART);

await browser.close();
console.log(`${PART} azim=${AZIM} fixinject=1`);
console.log(JSON.stringify(r, null, 1));
