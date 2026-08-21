// breakedge-owner-1 — read the BAKED break-order field (ORM alpha) straight off the render
// target and ask, before authoring anything new: is the crumble already in the bake and being
// smoothed away downstream?  (HANDOFF's dominant defect class.)
//
// Writes, per destructible material in the view:
//   <name>_field.png   4 panels: order greyscale | bake-only mask | mask + shader jag | lip band
// and prints, for each, a raggedness metric that does not depend on anyone's eye:
//   P/sqrt(A)  boundary texels / sqrt(kept texels).  A circle is ~3.5. Higher = more ragged.
//   comps      connected components of the KEPT set (islands = separated chunks)
//   bandpx     width of the transition band the jag opens, in texels
//
// Usage: node harness/evidence/_be1_field.mjs <view> <outDir> [extraQuery] [tag] [port]
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const VIEW = process.argv[2] || 'mat.lath';
const OUT = process.argv[3] || '.';
const QS = process.argv[4] ? '&' + process.argv[4] : '';
const TAG = process.argv[5] ? process.argv[5] + '_' : '';
const PORT = +(process.argv[6] || 5178);
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--force-device-scale-factor=1'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.routeWebSocket((u) => u.hostname === '127.0.0.1' && u.port === String(PORT), () => {});
await page.goto(`http://127.0.0.1:${PORT}/?view=${VIEW}&capture=1${QS}`, { waitUntil: 'load', timeout: 45000 });
await page.waitForFunction(() => document.body.dataset.rrrReady === '1' || document.body.dataset.rrrError === '1', null, { timeout: 240000 });

const dumps = await page.evaluate(() => {
  const e = window.__rrr.engine;
  const seen = new Map();
  e.scene.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m?.userData?.breakUniforms || !m?.userData?.bake) continue;
      if (seen.has(m.name)) continue;
      const u = m.userData.breakUniforms;
      seen.set(m.name, {
        name: m.name, size: m.userData.bake.size, bake: m.userData.bake,
        uBreak: u.uBreak.value, jag: u.uJag.value,
        jagScale: [u.uJagScale.value.x, u.uJagScale.value.y],
        lipWidth: u.uLipWidth.value,
        rimDark: u.uRimDark?.value ?? null,
        uRagged: u.uRagged?.value ?? null,
        defines: JSON.stringify(m.defines || {}),
        patch: JSON.stringify(m.userData.breakPatch || null),
      });
    }
  });
  const r = e.renderer;
  const out = [];
  for (const [, d] of seen) {
    const size = d.size;
    const buf = new Uint8Array(size * size * 4);
    // ⚠️ THE 7th ARG IS activeCubeFaceIndex, THE 8th IS textureIndex. `_mat1_dumpbake.mjs`
    // passes the MRT layer as the 7th and therefore dumps COLOR_ATTACHMENT0 (albedo) three
    // times while labelling the strip "albedo | ORM | normal+h". Verified against
    // node_modules/three/build/three.module.js: only `textureIndex` reaches gl.readBuffer.
    r.readRenderTargetPixels(d.bake._rt, 0, 0, size, size, buf, undefined, 1);   // 1 = ORM
    // flip to top-down and keep only alpha (= breakOrder)
    const a = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
      const src = (size - 1 - y) * size * 4;
      for (let x = 0; x < size; x++) a[y * size + x] = buf[src + x * 4 + 3];
    }
    out.push({
      name: d.name, size, uBreak: d.uBreak, jag: d.jag, jagScale: d.jagScale,
      lipWidth: d.lipWidth, defines: d.defines, patch: d.patch,
      rimDark: d.rimDark, uRagged: d.uRagged,
      order: Array.from(a),
    });
  }
  return out;
});

// ---- the shader's value noise, reimplemented exactly (breakmask.js _bhash/_bnoise)
const fract = (x) => x - Math.floor(x);
function bhash(px, py) {
  let x = fract(px * 0.1031), y = fract(py * 0.1031), z = fract(px * 0.1031);
  const d = x * (y + 33.33) + y * (z + 33.33) + z * (x + 33.33);
  x += d; y += d; z += d;
  return fract((x + y) * z);
}
function bnoise(px, py) {
  const ix = Math.floor(px), iy = Math.floor(py);
  const fx = px - ix, fy = py - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = bhash(ix, iy), b = bhash(ix + 1, iy), c = bhash(ix, iy + 1), dd = bhash(ix + 1, iy + 1);
  return (a + (b - a) * ux) + ((c + (dd - c) * ux) - (a + (b - a) * ux)) * uy;
}
const smoothstep = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function metrics(mask, size) {
  let kept = 0, perim = 0;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (!mask[y * size + x]) continue;
    kept++;
    if (x === 0 || y === 0 || x === size - 1 || y === size - 1) { perim++; continue; }
    if (!mask[(y - 1) * size + x] || !mask[(y + 1) * size + x] ||
        !mask[y * size + x - 1] || !mask[y * size + x + 1]) perim++;
  }
  // connected components of the kept set (4-connected), iterative flood fill
  const seen = new Uint8Array(size * size);
  let comps = 0, big = 0;
  const stack = new Int32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    if (!mask[i] || seen[i]) continue;
    comps++;
    let sp = 0, n = 0; stack[sp++] = i; seen[i] = 1;
    while (sp) {
      const p = stack[--sp]; n++;
      const x = p % size, y = (p / size) | 0;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < size - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0 && mask[p - size] && !seen[p - size]) { seen[p - size] = 1; stack[sp++] = p - size; }
      if (y < size - 1 && mask[p + size] && !seen[p + size]) { seen[p + size] = 1; stack[sp++] = p + size; }
    }
    if (n > 20) big++;
  }
  return { kept, perim, comps, big, ratio: kept ? perim / Math.sqrt(kept) : 0 };
}

const report = [];
for (const d of dumps) {
  const size = d.size, N = size * size;
  const ord = d.order;
  const B = d.uBreak;
  // A probe that cannot observe must report SKIP, never PASS: a constant field means the read
  // came back from the wrong colour attachment, not that the surface never breaks.
  let omin = 255, omax = 0;
  for (let i = 0; i < N; i++) { if (ord[i] < omin) omin = ord[i]; if (ord[i] > omax) omax = ord[i]; }
  if (omax - omin < 4) {
    console.error(`SKIP ${d.name}: break-order field is constant (${omin}..${omax}). ` +
      'Wrong MRT attachment or the surface writes no breakOrder — do not read the numbers below.');
  }
  const maskBake = new Uint8Array(N);
  const maskJag = new Uint8Array(N);
  const lip = new Float32Array(N);
  let bandLo = 1e9, bandHi = -1e9;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const o0 = ord[i] / 255;
      maskBake[i] = o0 >= B ? 1 : 0;
      let o = o0;
      if (d.jag > 0.0001 && B > 0.0001) {
        const u = (x + 0.5) / size, v = 1 - (y + 0.5) / size;   // vMapUv, tile 0..1
        const n = bnoise(u * d.jagScale[0], v * d.jagScale[1]) * 0.68
                + bnoise(u * d.jagScale[0] * 2.7 + 19, v * d.jagScale[1] * 2.7 + 19) * 0.32;
        const near = 1 - smoothstep(0, d.jag * 3, Math.abs(o0 - B));
        o += (n - 0.5) * d.jag * near;
      }
      maskJag[i] = o >= B ? 1 : 0;
      if (maskJag[i] !== maskBake[i]) { bandLo = Math.min(bandLo, o0 - B); bandHi = Math.max(bandHi, o0 - B); }
      const uu = (x + 0.5) / size, vv = 1 - (y + 0.5) / size;
      const lw = d.lipWidth * (d.uRagged > 0.5
        ? 0.42 + 1.30 * bnoise(uu * d.jagScale[0] * 0.125 + 7, vv * d.jagScale[1] * 0.125 + 7)
        : 1);
      lip[i] = (o >= B && B > 0.0001) ? 1 - smoothstep(B, B + lw, o) : 0;
    }
  }
  // How much the kept fraction moves if the whole field is offset. This is what tells you
  // the constant that restores the legacy surviving AREA after a shape change — the kept set
  // here is the exterior of a blob, so a mean-zero perturbation does NOT preserve area and
  // the offset has to be measured, not derived from the perturbation's mean.
  const sweep = {};
  for (const off of [-0.03, -0.02, -0.015, -0.01, -0.005, 0, 0.005, 0.01, 0.02]) {
    let k = 0;
    for (let i = 0; i < N; i++) if (ord[i] / 255 + off >= B) k++;
    sweep[off.toFixed(3)] = k;
  }
  const mb = metrics(maskBake, size), mj = metrics(maskJag, size);
  let lipPx = 0; for (let i = 0; i < N; i++) if (lip[i] > 0.02) lipPx++;
  report.push({
    name: d.name, size, uBreak: +B.toFixed(3), jag: d.jag, jagScale: d.jagScale,
    lipWidth: d.lipWidth, defines: d.defines, patch: d.patch,
    rimDark: d.rimDark, uRagged: d.uRagged,
    bake: mb, jagged: mj, sweep,
    orderBand: [+bandLo.toFixed(4), +bandHi.toFixed(4)],
    lipFrac: +(lipPx / Math.max(1, mj.kept)).toFixed(4),
  });

  // ---- write the 4-panel image. Built in node (nearest-sampled to PANEL px per panel) and
  // handed to the browser as raw base64 bytes; serialising 4 x 4M numbers through
  // page.evaluate() as JSON is what made the first version of this probe take two minutes.
  const PANEL = Math.min(size, 640);
  const rgba = Buffer.alloc(PANEL * 4 * PANEL * 4);
  const put = (px, py, r, g, b) => {
    const o = (py * PANEL * 4 + px) * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
  };
  for (let y = 0; y < PANEL; y++) {
    const sy = Math.floor(y * size / PANEL);
    for (let x = 0; x < PANEL; x++) {
      const i = sy * size + Math.floor(x * size / PANEL);
      put(x, y, ord[i], ord[i], ord[i]);
      const kb = maskBake[i], kj = maskJag[i];
      put(PANEL + x, y, kb ? 235 : 12, kb ? 230 : 12, kb ? 215 : 16);
      put(PANEL * 2 + x, y, kj ? 235 : 12, kj ? 230 : 12, kj ? 215 : 16);
      const L = Math.round(lip[i] * 255);
      put(PANEL * 3 + x, y, kj ? L : 0, kj ? Math.round(L * 0.4) : 0, kj ? 40 : 0);
    }
  }
  const png = await page.evaluate(({ w, h, b64 }) => {
    const bin = atob(b64);
    const arr = new Uint8ClampedArray(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    cv.getContext('2d').putImageData(new ImageData(arr, w, h), 0, 0);
    return cv.toDataURL('image/png');
  }, { w: PANEL * 4, h: PANEL, b64: rgba.toString('base64') });
  const file = path.join(OUT, TAG + d.name.replace(/[^a-z0-9]+/gi, '_').slice(0, 40) + '_field.png');
  await writeFile(file, Buffer.from(png.split(',')[1], 'base64'));
  console.log('wrote', file);
}
console.log(JSON.stringify(report, null, 2));
await browser.close();
