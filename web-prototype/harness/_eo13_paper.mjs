/**
 * estate-owner-13: IS THE PAPER LITTER LEGIBLE, OR MERELY ON SCREEN?
 *
 * `critic-estate-10`: "the 130 paper sheets project 130/130 on screen and NOT ONE IS LEGIBLE —
 * tight crops at their own reported coordinates show only floor-reflection noise. A raycast
 * landing on screen is not the same as a viewer seeing it."
 *
 * `_eo12_probe.mjs` answers "is it in the frustum" and answered YES while the picture showed
 * nothing, so this asks the next question down: for each instance, project its four CORNERS,
 * measure the pixels INSIDE that quad and the pixels in a ring just OUTSIDE it, and report the
 * contrast between them. A sheet is legible when it differs from the floor it lies on, and by
 * how much is a number.
 *
 *   areaPx      the quad's own screen area. Under ~20 px there is nothing to see whatever the
 *               contrast; the r10 camera's grazing angle is what made this small.
 *   dL          mean luminance inside minus mean luminance of the surrounding ring.
 *   |dL|>=10    the share of sheets that differ from their own background by at least 10 levels
 *               — the working legibility threshold used here, and it is stated rather than
 *               hidden because the whole finding hangs on it. 10/255 is about 4% of the range;
 *               a mark that far from its background is visible on a calibrated screen and holds
 *               up through the JPEG/PNG downscale a critic reads.
 *
 * ⚠ THIS IS NOT PROOF ON ITS OWN. It is a screen-space statistic, and the critic's ruling is
 * that a count is not a sighting. Use `--crops` to write the tightest-contrast and the
 * highest-contrast sheets as 6x nearest-neighbour crops and LOOK at them.
 *
 *   node harness/_eo13_paper.mjs [--extra "&cam=r10"] [--crops]
 */
import { chromium } from 'playwright';
import net from 'node:net';
import { writeFileSync } from 'node:fs';

const PORT = 5178;
const argv = process.argv.slice(2);
const opt = (n, d = null) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const CROPS = argv.includes('--crops');
const OUT = opt('dir', 'C:/Users/John/AppData/Local/Temp/claude/C--Users-John-Documents-Run-Robot-Run-web-prototype/5302cea7-8124-49db-b4fe-f14ded483e05/scratchpad');
const EXTRA = opt('extra', '');
const TAG = opt('tag', 'x');

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

// ---- `--state` — mutate the litter LIVE before measuring -------------------------------
// Rewriting `instanceMatrix.array` by hand (column-major, no THREE on window) is what makes a
// dozen candidate scatters cost one boot instead of a dozen builds. The winner is then written
// into source and RE-MEASURED from a real capture: this rig cannot see the planar floor
// reflection updating, because that is rendered once at build time.
const STATE = opt('state', 'base');
if (STATE !== 'base') {
  await page.evaluate(({ state }) => {
    const e = window.__rrr.engine;
    let obj = null, mat = null;
    e.scene.traverse((o) => { if (o.name === 'paper-scatter') { obj = o; mat = o.material; } });
    if (!obj) return;
    const a = obj.instanceMatrix.array;
    const P = state.split('+');
    // a deterministic prng so two runs of one state agree
    let s = 0x9e3779b9;
    const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
    if (P.includes('bright')) mat.color.setHex(0xf7f4ec);
    if (P.includes('white')) mat.color.setHex(0xffffff);
    for (let k = 0; k < obj.count; k++) {
      const o = k * 16;
      const px = a[o + 12], py = a[o + 13], pz = a[o + 14];
      // recover the existing scale from the column norms so we can rebuild the basis
      const sx = Math.hypot(a[o], a[o + 1], a[o + 2]);
      const sz = Math.hypot(a[o + 8], a[o + 9], a[o + 10]);
      let SX = sx, SZ = sz;
      if (P.includes('big')) { SX *= 1.45; SZ *= 1.45; }
      let ex = (rnd() - 0.5) * 0.10, ez = (rnd() - 0.5) * 0.10;
      if (P.includes('tilt') && rnd() < 0.4) {
        ex = (rnd() - 0.5) * 0.9; ez = (rnd() - 0.5) * 0.9;
      }
      const ey = rnd() * Math.PI * 2;
      const cx = Math.cos(ex), sxr = Math.sin(ex);
      const cy = Math.cos(ey), syr = Math.sin(ey);
      const cz = Math.cos(ez), szr = Math.sin(ez);
      // R = Rx * Ry * Rz  (three's default 'XYZ' order applies Rx last on the left)
      const m00 = cy * cz, m01 = -cy * szr, m02 = syr;
      const m10 = sxr * syr * cz + cx * szr, m11 = -sxr * syr * szr + cx * cz, m12 = -sxr * cy;
      const m20 = -cx * syr * cz + sxr * szr, m21 = cx * syr * szr + sxr * cz, m22 = cx * cy;
      a[o] = m00 * SX; a[o + 1] = m10 * SX; a[o + 2] = m20 * SX;
      a[o + 4] = m01; a[o + 5] = m11; a[o + 6] = m21;
      a[o + 8] = m02 * SZ; a[o + 9] = m12 * SZ; a[o + 10] = m22 * SZ;
      a[o + 12] = px; a[o + 14] = pz;
      a[o + 13] = P.includes('tilt') ? 0.012 + rnd() * 0.02 : py;
    }
    obj.instanceMatrix.needsUpdate = true;
  }, { state: STATE });
  await page.evaluate((n) => window.__rrr.settle(n), 8);
}

const quads = await page.evaluate(() => {
  const e = window.__rrr.engine, cam = e.camera;
  let obj = null;
  e.scene.traverse((o) => { if (o.name === 'paper-scatter') obj = o; });
  if (!obj) return null;
  cam.updateMatrixWorld(true);
  obj.geometry.computeBoundingBox();
  const bb = obj.geometry.boundingBox;
  const W = 1920, H = 1080;
  const pm = cam.projectionMatrix.elements, vm = cam.matrixWorldInverse.elements;
  const proj = (x, y, z) => {
    const vx = vm[0] * x + vm[4] * y + vm[8] * z + vm[12];
    const vy = vm[1] * x + vm[5] * y + vm[9] * z + vm[13];
    const vz = vm[2] * x + vm[6] * y + vm[10] * z + vm[14];
    const cw = -vz;
    if (cw <= 0.01) return null;
    return [((pm[0] * vx + pm[8] * vz) / cw * 0.5 + 0.5) * W,
      (0.5 - (pm[5] * vy + pm[9] * vz) / cw * 0.5) * H, cw];
  };
  const a = obj.instanceMatrix.array;
  const out = [];
  for (let k = 0; k < obj.count; k++) {
    const m = a.slice(k * 16, k * 16 + 16);
    const local = [[bb.min.x, bb.max.y, bb.min.z], [bb.max.x, bb.max.y, bb.min.z],
      [bb.max.x, bb.max.y, bb.max.z], [bb.min.x, bb.max.y, bb.max.z]];
    const pts = [];
    let bad = false;
    for (const [lx, ly, lz] of local) {
      const wx = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
      const wy = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
      const wz = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
      const p = proj(wx, wy, wz);
      if (!p) { bad = true; break; }
      pts.push([p[0], p[1]]);
    }
    if (bad) continue;
    out.push({ i: k, pts, d: +proj(m[12], m[13], m[14])[2].toFixed(1) });
  }
  return out;
});
if (!quads) { console.error('paper-scatter not in the scene (is ?depot=0 set?)'); process.exit(4); }

const buf = await page.screenshot();
writeFileSync(`${OUT}/eo13-paper-${TAG}.png`, buf);
const dataUrl = `data:image/png;base64,${buf.toString('base64')}`;

const rows = await page.evaluate(async ({ url, quads }) => {
  const img = new Image(); img.src = url; await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.naturalWidth; cv.height = img.naturalHeight;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0);
  const W = cv.width, H = cv.height;
  const px = cx.getImageData(0, 0, W, H).data;
  const lum = (i) => 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];

  // signed area tells us the winding; `inside` then works for either.
  const inQuad = (p, x, y, grow) => {
    let cxx = 0, cyy = 0;
    for (const q of p) { cxx += q[0] / 4; cyy += q[1] / 4; }
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = p[i], b = p[(i + 1) % 4];
      // push each edge outward by `grow` along its own outward normal
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const len = Math.hypot(ex, ey) || 1;
      let nx = ey / len, ny = -ex / len;
      if ((a[0] - cxx) * nx + (a[1] - cyy) * ny < 0) { nx = -nx; ny = -ny; }
      const d = (x - a[0]) * nx + (y - a[1]) * ny - grow;
      const s = Math.sign(d);
      if (s === 0) continue;
      if (sign === 0) sign = s; else if (s !== sign) return false;
    }
    return true;
  };

  const out = [];
  for (const q of quads) {
    const xs = q.pts.map((p) => p[0]), ys = q.pts.map((p) => p[1]);
    const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 7), x1 = Math.min(W - 1, Math.ceil(Math.max(...xs)) + 7);
    const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 7), y1 = Math.min(H - 1, Math.ceil(Math.max(...ys)) + 7);
    let sIn = 0, nIn = 0, sOut = 0, nOut = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = (y * W + x) * 4;
        if (inQuad(q.pts, x + 0.5, y + 0.5, -0.6)) { sIn += lum(i); nIn++; }
        else if (!inQuad(q.pts, x + 0.5, y + 0.5, 2.0) && inQuad(q.pts, x + 0.5, y + 0.5, 6.0)) { sOut += lum(i); nOut++; }
      }
    }
    // shoelace area
    let A = 0;
    for (let i = 0; i < 4; i++) A += q.pts[i][0] * q.pts[(i + 1) % 4][1] - q.pts[(i + 1) % 4][0] * q.pts[i][1];
    out.push({
      i: q.i, d: q.d, area: +(Math.abs(A) / 2).toFixed(1), nIn,
      cx: Math.round(xs.reduce((a, b) => a + b, 0) / 4), cy: Math.round(ys.reduce((a, b) => a + b, 0) / 4),
      lIn: nIn ? +(sIn / nIn).toFixed(1) : null,
      lOut: nOut ? +(sOut / nOut).toFixed(1) : null,
      dL: (nIn && nOut) ? +(sIn / nIn - sOut / nOut).toFixed(1) : null,
    });
  }
  return out;
}, { url: dataUrl, quads });

const ok = rows.filter((r) => r.dL !== null && r.nIn >= 3);
const abs = ok.map((r) => Math.abs(r.dL)).sort((a, b) => a - b);
const areas = rows.map((r) => r.area).sort((a, b) => a - b);
const med = (a) => (a.length ? a[a.length >> 1] : NaN);
console.log(`sheets ${rows.length}  measurable(>=3 interior px) ${ok.length}`);
console.log(`area px      median ${med(areas)}   p10 ${areas[Math.floor(areas.length * 0.1)]}   p90 ${areas[Math.floor(areas.length * 0.9)]}`);
console.log(`|dL|         median ${med(abs)?.toFixed(1)}   p10 ${abs[Math.floor(abs.length * 0.1)]?.toFixed(1)}   p90 ${abs[Math.floor(abs.length * 0.9)]?.toFixed(1)}`);
for (const t of [6, 10, 16, 25]) {
  const n = ok.filter((r) => Math.abs(r.dL) >= t).length;
  console.log(`|dL| >= ${String(t).padStart(2)}    ${n} of ${rows.length}   (${(100 * n / rows.length).toFixed(0)}%)`);
}
const byArea = [...ok].sort((a, b) => b.area - a.area);
console.log('\nlargest 10 by screen area:');
for (const r of byArea.slice(0, 10)) console.log(`  #${String(r.i).padStart(3)}  ${String(r.area).padStart(6)} px  at ${r.cx},${r.cy}  ${r.d} m   in ${r.lIn} / out ${r.lOut}  dL ${r.dL}`);

// ---- `--ablate` — the only test that answers the critic's actual question -----------------
// Per-sheet ring contrast punishes a DRIFT: when sheets overlap, the "ring outside sheet A" is
// mostly sheet B, so a legible pile of paper scores near zero. Hiding the whole InstancedMesh
// and re-shooting the same frame does not have that problem, and it is the same one-toggle,
// one-frame, one-camera form this project's other ablations use. It reports what a VIEWER sees
// change, and it writes both crops so the change can be looked at rather than argued about.
if (argv.includes('--ablate')) {
  const RECTS = (opt('rects') || '950,660,620,350;380,620,620,350;1050,700,420,260').split(';')
    .map((s) => s.split(',').map(Number));
  const shot = async (on) => {
    await page.evaluate((v) => {
      window.__rrr.engine.scene.traverse((o) => { if (o.name === 'paper-scatter') o.visible = v; });
    }, on);
    await page.evaluate((n) => window.__rrr.settle(n), 8);
    return page.screenshot();
  };
  const bOn = await shot(true);
  const bOff = await shot(false);
  await shot(true);
  const urlOn = `data:image/png;base64,${bOn.toString('base64')}`;
  const urlOff = `data:image/png;base64,${bOff.toString('base64')}`;
  const res = await page.evaluate(async ({ a, b, rects }) => {
    const load = async (u) => { const im = new Image(); im.src = u; await im.decode(); return im; };
    const grab = async (u) => {
      const im = await load(u);
      const cv = document.createElement('canvas');
      cv.width = im.naturalWidth; cv.height = im.naturalHeight;
      const c = cv.getContext('2d', { willReadFrequently: true });
      c.drawImage(im, 0, 0);
      return { d: c.getImageData(0, 0, cv.width, cv.height).data, W: cv.width };
    };
    const A = await grab(a), B = await grab(b);
    const L = (p, i) => 0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2];
    const out = [];
    for (const [X, Y, W, H] of rects) {
      let sum = 0, n = 0, hits = 0, maxd = 0;
      for (let y = Y; y < Y + H; y++) {
        for (let x = X; x < X + W; x++) {
          const i = (y * A.W + x) * 4;
          const d = Math.abs(L(A.d, i) - L(B.d, i));
          sum += d; n++; if (d >= 8) hits++; if (d > maxd) maxd = d;
        }
      }
      out.push({ rect: [X, Y, W, H], meanAbsD: +(sum / n).toFixed(2),
        pctChanged: +(100 * hits / n).toFixed(1), maxD: +maxd.toFixed(0) });
    }
    return out;
  }, { a: urlOn, b: urlOff, rects: RECTS });
  console.log('\nablation — paper-scatter visible vs hidden, same frame:');
  for (const r of res) {
    console.log(`  rect ${r.rect.join(',')}   mean|dL| ${r.meanAbsD}   pixels moved >=8: ${r.pctChanged}%   max ${r.maxD}`);
  }
  writeFileSync(`${OUT}/eo13-ablate-${TAG}-ON.png`, bOn);
  writeFileSync(`${OUT}/eo13-ablate-${TAG}-OFF.png`, bOff);
  for (const [i, [X, Y, W, H]] of RECTS.entries()) {
    for (const [nm, u] of [['ON', urlOn], ['OFF', urlOff]]) {
      const b64 = await page.evaluate(async ({ u, X, Y, W, H }) => {
        const im = new Image(); im.src = u; await im.decode();
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
        c.drawImage(im, X, Y, W, H, 0, 0, W, H);
        return cv.toDataURL('image/png');
      }, { u, X, Y, W, H });
      writeFileSync(`${OUT}/eo13-ablate-${TAG}-r${i}-${nm}.png`, Buffer.from(b64.split(',')[1], 'base64'));
    }
  }
}

if (CROPS) {
  const picks = [...byArea.slice(0, 3), ...[...ok].sort((a, b) => Math.abs(b.dL) - Math.abs(a.dL)).slice(0, 3),
    ...[...ok].sort((a, b) => Math.abs(a.dL) - Math.abs(b.dL)).slice(0, 3)];
  for (const r of picks) {
    const b = await page.evaluate(async ({ url, r }) => {
      const img = new Image(); img.src = url; await img.decode();
      const S = 6, Wd = 120, Ht = 90;
      const cv = document.createElement('canvas');
      cv.width = Wd * S; cv.height = Ht * S;
      const cx = cv.getContext('2d');
      cx.imageSmoothingEnabled = false;
      cx.drawImage(img, r.cx - Wd / 2, r.cy - Ht / 2, Wd, Ht, 0, 0, Wd * S, Ht * S);
      return cv.toDataURL('image/png');
    }, { url: dataUrl, r });
    writeFileSync(`${OUT}/eo13-paper-${TAG}-i${r.i}-a${Math.round(r.area)}-d${r.dL}.png`,
      Buffer.from(b.split(',')[1], 'base64'));
  }
  console.log(`\nwrote ${picks.length} 6x crops to ${OUT}`);
}
await browser.close();
