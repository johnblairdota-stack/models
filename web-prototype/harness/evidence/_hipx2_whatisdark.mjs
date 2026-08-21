// WHAT SURFACE ARE THE BLACK PIXELS? Nine rounds of the hip-band thread argued MECHANISMS - Loop's
// shrink, shading normals, invented skin weights, the material's curvature response - and not one
// of them established what the dark pixels in the ROI actually ARE in three dimensions. This does
// that: it finds the dark pixels in `_bft1_band.mjs`'s ROI, fires a camera ray through each one at
// the frame the capture uses, and reports what it hits.
//
//   node harness/evidence/_hipx2_whatisdark.mjs "clip=n30&solo=1&anim=Alert" [--dump out.json]
//
// ⚠️ THE SKINNING AND THE RAYCAST ARE DONE HERE, NOT IN THE PAGE, AND THAT IS DELIBERATE. The
// engine does not expose THREE on `window.__rrr`, so building a Raycaster in the page would mean
// either shader surgery or reaching for a constructor through an unrelated object - both of which
// fail quietly and produce a plausible table. Instead the page hands over PLAIN ARRAYS: the bind
// matrices, the skeleton's bone matrices, the attributes, and the camera's own projection and
// view matrices. Every transform below is then arithmetic in this file, which can be controlled
// and which has a control that must fail.
//
// The frame is pinned exactly as `shoot.mjs` pins it - capture mode parks between settles, so
// `__rrr.settle(12)` after ready reproduces the captured frame rather than "whatever the animation
// happened to be doing when a wall-clock wait expired".
//
// PER HIT it reports: model-space y (the GLB's own units, directly comparable to
// `_hipx1_section.py`'s slices), the face normal's vertical component, the DEPTH COMPLEXITY along
// the ray and the distance to the next surface behind the first. Those separate the candidate
// shapes: a shadowed overhang is a first hit with a DOWNWARD normal; a cavity you see into has
// more surface close BEHIND that first hit; a backface leak is a first hit whose normal points AWAY
// from the camera.
//
// THREE CONTROLS, each of which lands wrong if the instrument is broken rather than merely being
// switched off:
//   * BACKDROP - the same rays through `_bft1_band.mjs`'s empty control patch. The body is the only
//     thing in the raycast set, so every one of those rays must MISS. A hit there means the ray
//     reconstruction is wrong and every number in the table is about the wrong pixels.
//   * COVERAGE - the fraction of ROI pixels whose ray hits the body, against the body's own
//     silhouette taken from the renderer. Those are independent routes to the same shape and must
//     agree within a few percent; this is what catches a projection that is subtly wrong - a
//     flipped Y, a stale matrix - which a MISS-only control cannot see.
//     ⚠️ THE FIRST VERSION OF THIS CONTROL WAS THE BROKEN HALF, AND IT FAILED A WORKING
//     INSTRUMENT. It took "not backdrop-coloured" as the reference, which on a near-white cyc
//     behind an off-white robot classifies 99.7% of the ROI as figure - so it reported a 30-point
//     disagreement against a ray cast that was in fact correct. `engine.setSilhouette` is no use
//     either: it sets `scene.overrideMaterial`, which paints the CYC black along with the figure.
//     The reference used here hides every scene child except the rig, clears to magenta and
//     re-renders raw, which makes figure-vs-ground exact rather than a colour guess.
//   * BRIGHT - the same measurement over the ROI's brightest pixels. If dark and bright report the
//     same normals and the same depth complexity then the geometry does not distinguish them, and
//     this instrument has no content however plausible its dark column looks.
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const q = process.argv[2] ?? 'clip=n30&solo=1&anim=Alert';
const dump = process.argv.includes('--dump') ? process.argv[process.argv.indexOf('--dump') + 1] : null;
const PORT = Number(process.env.RRR_SHOOT_PORT) || 5192;
const W = 1920, H = 1080;
const ROI = { x: 850, y: 505, w: 250, h: 165 };
const CTRL = { x: 200, y: 505, w: 250, h: 165 };

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization', '--disable-frame-rate-limit'],
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.error('PAGEERROR', String(e).split('\n')[0]));
await page.goto(`http://127.0.0.1:${PORT}/?view=mesh.animated&capture=1&${q}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__rrr?.ready || window.__rrrError, null, { timeout: 240000 });
const verr = await page.evaluate(() => (window.__rrrError ? String(window.__rrrError) : null));
if (verr) { console.error('view failed: ' + verr.split('\n')[0]); process.exit(2); }
await page.evaluate(() => window.__rrr.settle(12));

const raw = await page.evaluate(({ ROI, CTRL, W, H }) => {
  const e = window.__rrr.engine;
  let mesh = null;
  e.scene.traverse((o) => {
    if (o.isSkinnedMesh && (!mesh || o.geometry.index.count > mesh.geometry.index.count)) mesh = o;
  });
  if (!mesh) return { err: 'no SkinnedMesh in the scene' };
  e.scene.updateMatrixWorld(true);
  const g = mesh.geometry;
  const pick = (n) => (g.attributes[n] ? Array.from(g.attributes[n].array) : null);

  // the framebuffer, read the same way `_bft1_band.mjs` reads the PNG
  const cv = e.renderer.domElement;
  const c2 = document.createElement('canvas');
  c2.width = cv.width; c2.height = cv.height;
  c2.getContext('2d').drawImage(cv, 0, 0);
  const ctx = c2.getContext('2d');
  const sx = cv.width / W, sy = cv.height / H;
  const grab = (R) => {
    const w = Math.round(R.w * sx), h = Math.round(R.h * sy);
    const d = ctx.getImageData(Math.round(R.x * sx), Math.round(R.y * sy), w, h).data;
    const out = [];
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = (j * w + i) * 4;
        out.push([R.x + i / sx, R.y + j / sy,
          0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2],
          d[k], d[k + 1], d[k + 2]]);
      }
    }
    return out;
  };

  // THE COVERAGE REFERENCE: hide everything but the rig, clear to magenta, re-render raw.
  let rigRoot = mesh;
  while (rigRoot.parent && rigRoot.parent !== e.scene) rigRoot = rigRoot.parent;
  const saved = e.scene.children.map((c) => [c, c.visible]);
  const savedBg = e.scene.background;
  for (const [c] of saved) if (c !== rigRoot) c.visible = false;
  e.scene.background = null;
  e.renderer.setClearColor(0xff00ff, 1);
  window.__rrr.redraw(true);
  const sc = document.createElement('canvas');
  sc.width = cv.width; sc.height = cv.height;
  sc.getContext('2d').drawImage(cv, 0, 0);
  const sctx = sc.getContext('2d');
  const sd = sctx.getImageData(Math.round(ROI.x * sx), Math.round(ROI.y * sy),
    Math.round(ROI.w * sx), Math.round(ROI.h * sy)).data;
  let silFig = 0, silTot = 0;
  for (let k = 0; k < sd.length; k += 4) {
    silTot++;
    // magenta ground: R and B high, G low. Anything else is the body.
    if (!(sd[k] > 200 && sd[k + 1] < 80 && sd[k + 2] > 200)) silFig++;
  }
  for (const [c, v] of saved) c.visible = v;
  e.scene.background = savedBg;

  return {
    silFig, silTot,
    pos: pick('position'), skinIndex: pick('skinIndex'), skinWeight: pick('skinWeight'),
    index: Array.from(g.index.array),
    bindMatrix: mesh.bindMatrix.elements.slice(),
    bindMatrixInverse: mesh.bindMatrixInverse.elements.slice(),
    boneMatrices: Array.from(mesh.skeleton.boneMatrices),
    matrixWorld: mesh.matrixWorld.elements.slice(),
    proj: e.camera.projectionMatrix.elements.slice(),
    view: e.camera.matrixWorldInverse.elements.slice(),
    camPos: e.camera.position.toArray(),
    roi: grab(ROI), ctrl: grab(CTRL),
    simState: e.frame,
  };
}, { ROI, CTRL, W, H });
await browser.close();
if (raw.err) { console.error(raw.err); process.exit(2); }

// ---------- plain arithmetic from here down ----------
const mul = (a, b) => {                      // column-major 4x4, THREE's layout
  const o = new Float64Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  }
  return o;
};
const xf = (m, x, y, z, w = 1) => [
  m[0] * x + m[4] * y + m[8] * z + m[12] * w,
  m[1] * x + m[5] * y + m[9] * z + m[13] * w,
  m[2] * x + m[6] * y + m[10] * z + m[14] * w,
  m[3] * x + m[7] * y + m[11] * z + m[15] * w];

const nV = raw.pos.length / 3;
const nT = raw.index.length / 3;
// SKIN, the same rule THREE uses: bindMatrixInverse * sum_i w_i * boneMatrix_i * bindMatrix * p
const obj = new Float64Array(nV * 3);        // mesh OBJECT space == the GLB's own units
const wld = new Float64Array(nV * 3);        // world space, for the raycast
for (let v = 0; v < nV; v++) {
  const p = xf(raw.bindMatrix, raw.pos[v * 3], raw.pos[v * 3 + 1], raw.pos[v * 3 + 2]);
  let ax = 0, ay = 0, az = 0, tw = 0;
  for (let k = 0; k < 4; k++) {
    const wgt = raw.skinWeight[v * 4 + k];
    if (!wgt) continue;
    const bi = raw.skinIndex[v * 4 + k] * 16;
    const bm = raw.boneMatrices.slice(bi, bi + 16);
    const q = xf(bm, p[0], p[1], p[2]);
    ax += wgt * q[0]; ay += wgt * q[1]; az += wgt * q[2]; tw += wgt;
  }
  if (tw > 0 && Math.abs(tw - 1) > 1e-3) { ax /= tw; ay /= tw; az /= tw; }
  const o = xf(raw.bindMatrixInverse, ax, ay, az);
  obj[v * 3] = o[0]; obj[v * 3 + 1] = o[1]; obj[v * 3 + 2] = o[2];
  const w = xf(raw.matrixWorld, o[0], o[1], o[2]);
  wld[v * 3] = w[0]; wld[v * 3 + 1] = w[1]; wld[v * 3 + 2] = w[2];
}

const vp = mul(raw.proj, raw.view);
const toScreen = (x, y, z) => {
  const c = xf(vp, x, y, z);
  if (c[3] <= 0) return null;
  return [(c[0] / c[3] * 0.5 + 0.5) * W, (0.5 - c[1] / c[3] * 0.5) * H];
};
// SCREEN-SPACE BUCKETS, so 4,000 rays do not each test 41,512 triangles.
const BS = 24, GW = Math.ceil(W / BS), GH = Math.ceil(H / BS);
const buckets = new Map();
for (let t = 0; t < nT; t++) {
  const s = [0, 1, 2].map((k) => {
    const i = raw.index[t * 3 + k] * 3;
    return toScreen(wld[i], wld[i + 1], wld[i + 2]);
  });
  if (s.some((p) => p === null)) continue;
  const x0 = Math.max(0, Math.floor(Math.min(s[0][0], s[1][0], s[2][0]) / BS));
  const x1 = Math.min(GW - 1, Math.floor(Math.max(s[0][0], s[1][0], s[2][0]) / BS));
  const y0 = Math.max(0, Math.floor(Math.min(s[0][1], s[1][1], s[2][1]) / BS));
  const y1 = Math.min(GH - 1, Math.floor(Math.max(s[0][1], s[1][1], s[2][1]) / BS));
  if (x1 < 0 || y1 < 0 || x0 > GW - 1 || y0 > GH - 1) continue;
  for (let by = y0; by <= y1; by++) {
    for (let bx = x0; bx <= x1; bx++) {
      const k = by * GW + bx;
      let a = buckets.get(k); if (!a) buckets.set(k, a = []);
      a.push(t);
    }
  }
}

const invVP = (() => {                        // ray direction straight from the camera matrices
  const m = vp, inv = new Float64Array(16);
  // 4x4 inverse by cofactors
  const a = m;
  const s0 = a[0] * a[5] - a[4] * a[1], s1 = a[0] * a[9] - a[8] * a[1], s2 = a[0] * a[13] - a[12] * a[1];
  const s3 = a[4] * a[9] - a[8] * a[5], s4 = a[4] * a[13] - a[12] * a[5], s5 = a[8] * a[13] - a[12] * a[9];
  const c5 = a[10] * a[15] - a[14] * a[11], c4 = a[6] * a[15] - a[14] * a[7];
  const c3 = a[6] * a[11] - a[10] * a[7], c2 = a[2] * a[15] - a[14] * a[3];
  const c1 = a[2] * a[11] - a[10] * a[3], c0 = a[2] * a[7] - a[6] * a[3];
  const det = s0 * c5 - s1 * c4 + s2 * c3 + s3 * c2 - s4 * c1 + s5 * c0;
  const d = 1 / det;
  inv[0] = (a[5] * c5 - a[9] * c4 + a[13] * c3) * d;
  inv[1] = (-a[1] * c5 + a[9] * c2 - a[13] * c1) * d;
  inv[2] = (a[1] * c4 - a[5] * c2 + a[13] * c0) * d;
  inv[3] = (-a[1] * c3 + a[5] * c1 - a[9] * c0) * d;
  inv[4] = (-a[4] * c5 + a[8] * c4 - a[12] * c3) * d;
  inv[5] = (a[0] * c5 - a[8] * c2 + a[12] * c1) * d;
  inv[6] = (-a[0] * c4 + a[4] * c2 - a[12] * c0) * d;
  inv[7] = (a[0] * c3 - a[4] * c1 + a[8] * c0) * d;
  inv[8] = (a[7] * s5 - a[11] * s4 + a[15] * s3) * d;
  inv[9] = (-a[3] * s5 + a[11] * s2 - a[15] * s1) * d;
  inv[10] = (a[3] * s4 - a[7] * s2 + a[15] * s0) * d;
  inv[11] = (-a[3] * s3 + a[7] * s1 - a[11] * s0) * d;
  inv[12] = (-a[6] * s5 + a[10] * s4 - a[14] * s3) * d;
  inv[13] = (a[2] * s5 - a[10] * s2 + a[14] * s1) * d;
  inv[14] = (-a[2] * s4 + a[6] * s2 - a[14] * s0) * d;
  inv[15] = (a[2] * s3 - a[6] * s1 + a[10] * s0) * d;
  return inv;
})();

// CONTROL ARM for the coverage check: shift every ray 14 px up. The ray cast still RUNS, still
// finds real triangles and still reports a plausible table - it is simply about the wrong pixels,
// which is the exact failure the coverage control exists to catch and the one a MISS-only backdrop
// control cannot see. 14 px is ~1/12 of the ROI height, i.e. small enough to look like nothing.
const SHIFT = process.argv.includes('--control-shift') ? 14 : 0;
function castRay(px, py0) {
  const py = py0 - SHIFT;
  const ndcx = (px / W) * 2 - 1, ndcy = -((py / H) * 2 - 1);
  const near = xf(invVP, ndcx, ndcy, -1), far = xf(invVP, ndcx, ndcy, 1);
  const o = [near[0] / near[3], near[1] / near[3], near[2] / near[3]];
  const f = [far[0] / far[3], far[1] / far[3], far[2] / far[3]];
  let dx = f[0] - o[0], dy = f[1] - o[1], dz = f[2] - o[2];
  const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
  const list = buckets.get(Math.floor(py / BS) * GW + Math.floor(px / BS)) || [];
  const hits = [];
  for (const t of list) {
    const i0 = raw.index[t * 3] * 3, i1 = raw.index[t * 3 + 1] * 3, i2 = raw.index[t * 3 + 2] * 3;
    const ax = wld[i0], ay = wld[i0 + 1], az = wld[i0 + 2];
    const e1x = wld[i1] - ax, e1y = wld[i1 + 1] - ay, e1z = wld[i1 + 2] - az;
    const e2x = wld[i2] - ax, e2y = wld[i2 + 1] - ay, e2z = wld[i2 + 2] - az;
    const px_ = dy * e2z - dz * e2y, py_ = dz * e2x - dx * e2z, pz_ = dx * e2y - dy * e2x;
    const det = e1x * px_ + e1y * py_ + e1z * pz_;
    if (Math.abs(det) < 1e-14) continue;
    const invd = 1 / det;
    const tx = o[0] - ax, ty = o[1] - ay, tz = o[2] - az;
    const u = (tx * px_ + ty * py_ + tz * pz_) * invd;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * invd;
    if (v < 0 || u + v > 1) continue;
    const tt = (e2x * qx + e2y * qy + e2z * qz) * invd;
    if (tt <= 1e-7) continue;
    // geometric face normal, world space (uniform rig scale, so no inverse-transpose owed)
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    const at = (c) => obj[i0 + c] + u * (obj[i1 + c] - obj[i0 + c]) + v * (obj[i2 + c] - obj[i0 + c]);
    hits.push({ t: tt, tri: t, ny, facing: nx * dx + ny * dy + nz * dz,
      ox: at(0), oy: at(1), oz: at(2) });
  }
  hits.sort((a, b) => a.t - b.t);
  return hits;
}

const probe = (list) => list.map(([px, py, L]) => {
  const h = castRay(px, py);
  if (!h.length) return { px, py, L, n: 0 };
  return { px, py, L, n: h.length, oy: h[0].oy, ox: h[0].ox, oz: h[0].oz,
    ny: h[0].ny, facing: h[0].facing,
    behindMm: h.length > 1 ? (h[1].t - h[0].t) * 1000 : null };
});

const dark = raw.roi.filter((p) => p[2] < 70);
const bright = raw.roi.slice().sort((a, b) => b[2] - a[2]).slice(0, dark.length);

const rDark = probe(dark), rBright = probe(bright);
const rCtrl = probe(raw.ctrl.filter((_, i) => i % 23 === 0));
const rAll = probe(raw.roi.filter((_, i) => i % 7 === 0));

const q50 = (a, f = 0.5) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor((a.length - 1) * f)] : NaN);
const row = (rows, label) => {
  const h = rows.filter((r) => r.n > 0);
  const oy = h.map((r) => r.oy), ny = h.map((r) => r.ny);
  const beh = h.filter((r) => r.behindMm != null).map((r) => r.behindMm);
  console.log(label.padEnd(9), String(rows.length).padStart(6), String(h.length).padStart(6),
    (h.length ? q50(oy).toFixed(4) : '-').padStart(8),
    (h.length ? `${q50(oy, 0.02).toFixed(3)}..${q50(oy, 0.98).toFixed(3)}` : '-').padStart(14),
    (h.length ? q50(ny).toFixed(3) : '-').padStart(8),
    (h.length ? (ny.filter((v) => v < -0.2).length / ny.length * 100).toFixed(1) : '-').padStart(7),
    (h.length ? h.filter((r) => r.facing > 0).length : '-').toString().padStart(8),
    (h.length ? q50(h.map((r) => r.n)).toFixed(0) : '-').padStart(5),
    (beh.length ? q50(beh).toFixed(1) : '-').padStart(9));
};
console.log(`\n${q}   tris ${nT}  verts ${nV}  frame ${raw.simState}`);
console.log(`ROI ${raw.roi.length}px   dark(<70) ${dark.length}`);
console.log('set'.padEnd(9), 'px'.padStart(6), 'hits'.padStart(6), 'medObjY'.padStart(8),
  'objY p02..p98'.padStart(14), 'med nY'.padStart(8), '%down'.padStart(7), 'BACKFC'.padStart(8),
  'medN'.padStart(5), 'behindMm'.padStart(9));
row(rDark, 'DARK');
row(rBright, 'BRIGHT');
row(rAll, 'ROI/7');
row(rCtrl, 'BACKDROP');

let bad = false;
if (rCtrl.some((r) => r.n > 0)) {
  console.error(`\nCONTROL FAILED (BACKDROP): ${rCtrl.filter((r) => r.n > 0).length} of ` +
    `${rCtrl.length} empty-backdrop rays hit the body. The ray reconstruction is wrong and every ` +
    'number above is about the wrong pixels.');
  bad = true;
} else {
  console.log(`CONTROL ok (BACKDROP): 0 of ${rCtrl.length} rays hit.`);
}
const covRay = rAll.filter((r) => r.n > 0).length / rAll.length * 100;
const covCol = raw.silFig / raw.silTot * 100;
console.log(`CONTROL COVERAGE: rays hit ${covRay.toFixed(1)}% of the ROI, the renderer's own ` +
  `silhouette covers ${covCol.toFixed(1)}%  (delta ${(covRay - covCol).toFixed(1)} pts)`);
if (Math.abs(covRay - covCol) > 6) {
  console.error('CONTROL FAILED (COVERAGE): the projected silhouette does not agree with the ' +
    'rendered one, so the camera reconstruction is off.');
  bad = true;
}
if (dump) { writeFileSync(dump, JSON.stringify({ dark: rDark, bright: rBright, all: rAll })); console.log('dumped ' + dump); }

/*
 * THE PICTURE. The cross-section of the POSED mesh in the plane the dark pixels actually sit in,
 * with those dark pixels drawn ON it as points.
 *
 * ⚠️ IT HAS TO BE THE POSED MESH, AND THAT IS WHY THIS IS NOT DONE IN `_hipx1_section.py`. That
 * tool slices the BIND pose, which is the right thing for judging the modelled shape but the wrong
 * thing for locating a defect seen in a rendered frame: the hit positions dumped above are in the
 * posed mesh's object space, so plotting them against a bind-pose outline would put the band
 * wherever `Alert` happens to differ from bind and the picture would be a coincidence.
 */
if (process.argv.includes('--svg')) {
  const svgOut = process.argv[process.argv.indexOf('--svg') + 1];
  const hitsD = rDark.filter((r) => r.n > 0);
  const side = (r) => (r.ox >= 0 ? 'L' : 'R');
  const panels = [];
  for (const s of ['L', 'R']) {
    const hs = hitsD.filter((r) => side(r) === s);
    if (!hs.length) continue;
    /*
     * ⚠️ THE SLICE PLANE MUST BE FORCED WHEN TWO ARMS ARE COMPARED. Left to its own median the
     * plane lands at z=5.8 on n30 and z=7.8 on bf65 - a 20 mm difference - so the two pictures
     * would be sections of two different places and any change between them would be that, not
     * the subdivision. `--z` pins it.
     */
    const cz = process.argv.includes('--z')
      ? +process.argv[process.argv.indexOf('--z') + 1] : q50(hs.map((r) => r.oz));
    // slice the posed mesh at z = cz and keep the half this leg is on
    const segs = [];
    for (let t = 0; t < nT; t++) {
      const ii = [0, 1, 2].map((k) => raw.index[t * 3 + k] * 3);
      const sd = ii.map((i) => obj[i + 2] - cz);
      if (sd.every((v) => v > 0) || sd.every((v) => v < 0)) continue;
      const pts = [];
      for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
        if (sd[a] === sd[b] || (sd[a] > 0) === (sd[b] > 0)) continue;
        const f = sd[a] / (sd[a] - sd[b]);
        pts.push([obj[ii[a]] + f * (obj[ii[b]] - obj[ii[a]]),
          obj[ii[a] + 1] + f * (obj[ii[b] + 1] - obj[ii[a] + 1])]);
      }
      if (pts.length < 2) continue;
      const i0 = ii[0], i1 = ii[1], i2 = ii[2];
      const e1 = [obj[i1] - obj[i0], obj[i1 + 1] - obj[i0 + 1], obj[i1 + 2] - obj[i0 + 2]];
      const e2 = [obj[i2] - obj[i0], obj[i2 + 1] - obj[i0 + 1], obj[i2 + 2] - obj[i0 + 2]];
      const ny2 = e1[2] * e2[0] - e1[0] * e2[2];
      const nl = Math.hypot(e1[1] * e2[2] - e1[2] * e2[1], ny2, e1[0] * e2[1] - e1[1] * e2[0]) || 1;
      segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1], ny2 / nl]);
    }
    panels.push({ label: `${s} hip — posed slice at z=${cz.toFixed(1)}, ${hs.length} dark px`,
      segs, pts: hs.filter((r) => Math.abs(r.oz - cz) < 1.2) });
  }
  const winArg = process.argv.includes('--win')
    ? process.argv[process.argv.indexOf('--win') + 1].split(',').map(Number) : null;
  const AX = winArg ? { x0: winArg[0], x1: winArg[1], y0: winArg[2], y1: winArg[3] }
    : { x0: -14, x1: 14, y0: 60, y1: 95 };           // obj units (1 unit = 10 mm)
  const PXU = process.argv.includes('--pxu') ? +process.argv[process.argv.indexOf('--pxu') + 1] : 26;
  const PW = (AX.x1 - AX.x0) * PXU, PH = (AX.y1 - AX.y0) * PXU, PAD = 54, TOP = 30;
  const Wd = panels.length * (PW + PAD) + PAD, Hd = PH + PAD + TOP + 20;
  const o = [`<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="${Hd}" viewBox="0 0 ${Wd} ${Hd}">`,
    `<rect width="${Wd}" height="${Hd}" fill="#12151a"/>`,
    `<text x="${PAD}" y="20" fill="#cfd6e0" font-family="monospace" font-size="15">${q}` +
    ` — POSED cross-section through the dark pixels. 1 grid = 10 mm.` +
    ` <tspan fill="#9aa4b2">grey=faces UP</tspan> <tspan fill="#4aa8e2">blue=OUT</tspan>` +
    ` <tspan fill="#e2444a">RED=faces DOWN</tspan> <tspan fill="#ffd400">●=A DARK PIXEL</tspan></text>`];
  panels.forEach((p, i) => {
    const ox = PAD + i * (PW + PAD), oy = TOP + PAD;
    const X = (v) => ox + (v - AX.x0) * PXU, Y = (v) => oy + PH - (v - AX.y0) * PXU;
    o.push(`<rect x="${ox}" y="${oy}" width="${PW}" height="${PH}" fill="#1b2027" stroke="#39414d"/>`);
    for (let g = Math.ceil(AX.x0); g <= AX.x1; g++) {
      o.push(`<line x1="${X(g)}" y1="${oy}" x2="${X(g)}" y2="${oy + PH}" stroke="${g % 5 === 0 ? '#3a4450' : '#242b34'}"/>`);
      if (g % 5 === 0) o.push(`<text x="${X(g) + 2}" y="${oy + PH + 14}" fill="#7c8894" font-family="monospace" font-size="11">${g * 10}</text>`);
    }
    for (let g = Math.ceil(AX.y0); g <= AX.y1; g++) {
      o.push(`<line x1="${ox}" y1="${Y(g)}" x2="${ox + PW}" y2="${Y(g)}" stroke="${g % 5 === 0 ? '#3a4450' : '#242b34'}"/>`);
      if (g % 5 === 0) o.push(`<text x="${ox - 46}" y="${Y(g) + 4}" fill="#7c8894" font-family="monospace" font-size="11">y${g * 10}</text>`);
    }
    for (const [a, ya, b, yb, ny] of p.segs) {
      if (Math.max(ya, yb) < AX.y0 || Math.min(ya, yb) > AX.y1) continue;
      const col = ny < -0.2 ? '#e2444a' : (ny < 0.2 ? '#4aa8e2' : '#9aa4b2');
      o.push(`<line x1="${X(a).toFixed(1)}" y1="${Y(ya).toFixed(1)}" x2="${X(b).toFixed(1)}" y2="${Y(yb).toFixed(1)}" stroke="${col}" stroke-width="${ny < -0.2 ? 3 : 2}"/>`);
    }
    // segment endpoints, so the TESSELLATION DENSITY is visible and not merely implied
    for (const [a, ya, b, yb] of p.segs) {
      for (const [u, v] of [[a, ya], [b, yb]]) {
        if (v < AX.y0 || v > AX.y1 || u < AX.x0 || u > AX.x1) continue;
        o.push(`<circle cx="${X(u).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="1.6" fill="#e8eef6" fill-opacity="0.7"/>`);
      }
    }
    for (const r of p.pts) o.push(`<circle cx="${X(r.ox).toFixed(1)}" cy="${Y(r.oy).toFixed(1)}" r="2.2" fill="#ffd400" fill-opacity="0.8"/>`);
    o.push(`<text x="${ox + 6}" y="${oy + 18}" fill="#f0c674" font-family="monospace" font-size="13">${p.label}</text>`);
  });
  o.push('</svg>');
  writeFileSync(svgOut, o.join('\n'));
  console.log('wrote ' + svgOut);
}
if (bad) process.exit(3);
