/**
 * 🎯 **IS THE CRATER'S OUTLINE CONVEX? — the seven-round defect, as two numbers off the DEPTH
 * FIELD, with no browser and no shader in the way.**
 *
 * `critic-dig-*` (rounds 4-7): *"the teal is a convex blob. There is not one re-entrant notch and
 * not one spur of surviving white poking INTO the teal anywhere in the crop."*
 *
 * `breakmask.js` tears the white shell where `_dmgB > _order`, i.e. where
 * `smoothDepth = 0.050 + 0.370 * order` (`wall.js` DAMAGE_BANDS[1..3] = [0.050, 0.420]). The order
 * field is a baked GPU texture and is band-limited to ~54 cm by `uOrderLod`, so it can only put
 * TEETH on a contour — round 7 proved it cannot change what shape the contour is. So the gross
 * shape is the shape of the smoothed depth's own contour at `order = 0.5`, i.e. **0.235**, and
 * that is what this measures.
 *
 *   convexity   area(region) / area(convex hull).  1.000 = a convex blob.
 *   notch       the deepest bay, in cm: the furthest a point of (hull \ region) gets from the
 *               hull's own boundary — which across a bay's mouth is the chord, so this is
 *               literally "how far does the surviving white poke into the teal".
 *
 *   node harness/_tmp_lobeshape.mjs [--lobe 0.36] [--strength 0.31] [--drive crater|dig]
 */
import { DamageField, CELL } from '../src/destruction/damagefield.js';
import { writePng } from './_tmp_png.mjs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? +process.argv[i + 1] : d; };
const sArg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? process.argv[i + 1] : d; };
const over = {};
for (const k of ["lobe", "lobeCell", "grain", "strength", "radius", "rim"]) {
  if (process.argv.includes('--' + k)) over[k] = arg(k, 0);
}
const DRIVE = sArg('drive', 'crater');
const PNG = sArg('png', null);
const LEVEL = arg('level', 0.235);
const W = 5.72, H = 2.80;

/** `chunk-thick.mjs`'s crater plan — the deliverable frame's own drive, verbatim. */
const SITES = [
  [0.00, 0.00, 6, 1.00], [0.19, -0.13, 5, 1.00], [-0.16, 0.21, 5, 1.00], [0.04, 0.41, 4, 0.95],
  [0.53, 0.20, 4, 0.80], [-0.47, -0.29, 3, 0.74], [0.28, -0.54, 3, 0.70], [-0.34, 0.56, 3, 0.64],
  [0.79, -0.11, 2, 0.50], [-0.71, 0.34, 2, 0.44], [0.14, 0.79, 2, 0.40], [-0.09, -0.77, 2, 0.34],
  [1.04, 0.29, 1, 0.25], [-0.94, -0.34, 1, 0.22], [0.54, 0.93, 1, 0.20], [-0.53, -0.88, 1, 0.18],
];

const N = arg('n', 1);
const outRows = [];
for (let trial = 0; trial < N; trial++) {
const g = new DamageField({ width: W, height: H, cell: CELL, brush: over });
if (DRIVE === 'crater') {
  // ⚠️ ONE CRATER IS ONE DRAW OF A HASH AND IT IS NOISE. The centre is walked across the face so
  // the figures below are a median over N independent lattice draws, not one lucky silhouette.
  const CU = 0.46 + (trial % 5) * 0.031 - 0.062, CV = 0.44 + ((trial / 5) | 0) * 0.021 - 0.021;
  for (const [du, dv, count, power] of SITES) {
    const u = Math.min(0.97, Math.max(0.03, CU + du / W));
    const v = Math.min(0.94, Math.max(0.06, CV + dv / H));
    for (let k = 0; k < count; k++) g.applyHit(u, v, power);
  }
} else {
  // a played dig: probe, then chase the shallowest cell in a body-wide window — dig-free.mjs's aim
  const CU = 0.46 + (trial % 5) * 0.031 - 0.062;
  for (let i = 0; i < 6; i++) g.applyHit(CU, 0.40, 1);
  for (let i = 0; i < 46; i++) {
    let bx = 0, by = 0, bd = 2;
    const c0 = Math.max(0, Math.floor((CU * W - 0.75) / g.cellW));
    const c1 = Math.min(g.cols - 1, Math.ceil((CU * W + 0.75) / g.cellW));
    const r1 = Math.min(g.rows - 1, Math.ceil(1.95 / g.cellH));
    for (let cy = 0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const d = g.depth[g.idx(cx, cy)];
      if (d < bd) { bd = d; bx = cx; by = cy; }
    }
    g.applyHit((bx + 0.5) / g.cols, (by + 0.5) / g.rows, 1);
  }
}
g.flush();                                   // builds the B channel the shader actually samples

// ---------------------------------------------------------------------------
// the field the shader sees: B, bilinear, plus `_rrrDepth`'s half-cell tent
// ---------------------------------------------------------------------------
const bAt = (fx, fy) => {                    // fx, fy in cells, bilinear on the B channel
  const x = Math.min(g.cols - 1.001, Math.max(0, fx - 0.5));
  const y = Math.min(g.rows - 1.001, Math.max(0, fy - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
  const s = (cx, cy) => g.data[(Math.min(g.rows - 1, cy) * g.cols + Math.min(g.cols - 1, cx)) * 4 + 2] / 255;
  return (s(x0, y0) * (1 - tx) + s(x0 + 1, y0) * tx) * (1 - ty)
       + (s(x0, y0 + 1) * (1 - tx) + s(x0 + 1, y0 + 1) * tx) * ty;
};
const tent = (fx, fy) => 0.36 * bAt(fx, fy)
  + 0.16 * (bAt(fx + 0.5, fy + 0.5) + bAt(fx - 0.5, fy + 0.5)
          + bAt(fx - 0.5, fy - 0.5) + bAt(fx + 0.5, fy - 0.5));

// ---------------------------------------------------------------------------
// rasterise the region at 1 cm and take its largest connected component
// ---------------------------------------------------------------------------
const PX = 0.01;
const NX = Math.round(W / PX), NY = Math.round(H / PX);
const inR = new Uint8Array(NX * NY);
for (let y = 0; y < NY; y++) {
  for (let x = 0; x < NX; x++) {
    const fx = ((x + 0.5) * PX / W) * g.cols, fy = ((y + 0.5) * PX / H) * g.rows;
    if (tent(fx, fy) >= LEVEL) inR[y * NX + x] = 1;
  }
}
const lab = new Int32Array(NX * NY).fill(-1);
let best = -1, bestN = 0, comp = 0;
const stack = [];
for (let i = 0; i < inR.length; i++) {
  if (!inR[i] || lab[i] >= 0) continue;
  let n = 0; stack.length = 0; stack.push(i); lab[i] = comp;
  while (stack.length) {
    const p = stack.pop(); n++;
    const px = p % NX, py = (p / NX) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const qx = px + dx, qy = py + dy;
      if (qx < 0 || qy < 0 || qx >= NX || qy >= NY) continue;
      const q = qy * NX + qx;
      if (inR[q] && lab[q] < 0) { lab[q] = comp; stack.push(q); }
    }
  }
  if (n > bestN) { bestN = n; best = comp; }
  comp++;
}
if (bestN < 100) { console.log(JSON.stringify({ error: 'no region', bestN })); process.exit(0); }

const pts = [];
for (let i = 0; i < lab.length; i++) if (lab[i] === best) pts.push([(i % NX) * PX, ((i / NX) | 0) * PX]);

// convex hull, monotone chain
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const sorted = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const lower = [], upper = [];
for (const p of sorted) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
for (let i = sorted.length - 1; i >= 0; i--) { const p = sorted[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
const hull = lower.slice(0, -1).concat(upper.slice(0, -1));

const hullArea = (() => { let a = 0; for (let i = 0; i < hull.length; i++) { const p = hull[i], q = hull[(i + 1) % hull.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a) / 2; })();
const regArea = bestN * PX * PX;

const inHull = (x, y) => { for (let i = 0; i < hull.length; i++) { const p = hull[i], q = hull[(i + 1) % hull.length]; if ((q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]) < -1e-9) return false; } return true; };
const distEdge = (x, y) => {
  let m = Infinity;
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i], q = hull[(i + 1) % hull.length];
    const vx = q[0] - p[0], vy = q[1] - p[1];
    const L2 = vx * vx + vy * vy || 1e-9;
    let t = ((x - p[0]) * vx + (y - p[1]) * vy) / L2;
    t = Math.max(0, Math.min(1, t));
    const dx = x - (p[0] + t * vx), dy = y - (p[1] + t * vy);
    const d = Math.hypot(dx, dy);
    if (d < m) m = d;
  }
  return m;
};
// the bays: points inside the hull but outside the region, scored by how far in from the hull
// boundary they reach. Across a bay's mouth the hull boundary IS the chord, so this is the
// intrusion depth — "how far does the surviving white poke into the teal".
let notch = 0;
const bays = [];
for (let y = 0; y < NY; y += 1) {
  for (let x = 0; x < NX; x += 1) {
    if (lab[y * NX + x] === best) continue;
    const wx = x * PX, wy = y * PX;
    if (!inHull(wx, wy)) continue;
    const d = distEdge(wx, wy);
    if (d > 0.02) bays.push(d);
    if (d > notch) notch = d;
  }
}
bays.sort((a, b) => b - a);
// islands: not-region blobs wholly enclosed by the region — round 4's "lagoon with islets"
let islands = 0, islandPx = 0;
{
  const seen = new Uint8Array(NX * NY);
  const q = [];
  for (let y = 0; y < NY; y++) {
    for (let x = 0; x < NX; x++) {
      const i0 = y * NX + x;
      if (lab[i0] === best || seen[i0]) continue;
      let n = 0, out = false; q.length = 0; q.push(i0); seen[i0] = 1;
      while (q.length) {
        const p = q.pop(); n++;
        const px = p % NX, py = (p / NX) | 0;
        if (px === 0 || py === 0 || px === NX - 1 || py === NY - 1) out = true;
        for (const r of [p - 1, p + 1, p - NX, p + NX]) {
          if (r < 0 || r >= NX * NY) continue;
          if (lab[r] === best || seen[r]) continue;
          seen[r] = 1; q.push(r);
        }
      }
      if (!out && n >= 12) { islands++; islandPx += n; }
    }
  }
}
/**
 * ⚠️ **LOOK AT IT.** The two bands `breakmask.js` actually draws, false-coloured: teal where the
 * shell has torn (`smooth >= 0.235`), white for the rim the skin keeps (`>= 0.085`, the band-0
 * contour at order 0.5), brown for standing wall. It is not the render — but it IS the field the
 * render's silhouette is a level set of, and it is where a convex blob is or is not visible.
 */
if (PNG && trial === 0) {
  const rgb = new Uint8Array(NX * NY * 3);
  for (let y = 0; y < NY; y++) {
    for (let x = 0; x < NX; x++) {
      const fx = ((x + 0.5) * PX / W) * g.cols, fy = ((NY - 1 - y + 0.5) * PX / H) * g.rows;
      const t = tent(fx, fy);
      const o = (y * NX + x) * 3;
      const c = t >= LEVEL ? [26, 150, 168] : t >= 0.085 ? [236, 231, 220] : [74, 58, 44];
      rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
    }
  }
  writePng(PNG, NX, NY, rgb);
}
outRows.push({
  regionArea: +regArea.toFixed(3), hullArea: +hullArea.toFixed(3),
  convexity: +(regArea / hullArea).toFixed(4),
  notchCm: +(notch * 100).toFixed(1),
  bayAreaCm2: +(bays.length * PX * PX * 1e4).toFixed(0), islands, islandPx,
});
}
const med = (k) => { const v = outRows.map((r) => r[k]).sort((a, b) => a - b); return +v[v.length >> 1].toFixed(4); };
console.log(JSON.stringify({
  drive: DRIVE, n: N, lobe: over.lobe ?? '(default)', lobeCell: over.lobeCell ?? '(default)',
  strength: over.strength ?? '(default)', radius: over.radius ?? '(default)', level: LEVEL,
  convexity: med('convexity'), notchCm: med('notchCm'), bayAreaCm2: med('bayAreaCm2'),
  regionAreaM2: med('regionArea'), islands: med('islands'), islandPx: med('islandPx'),
  worstNotch: Math.max(...outRows.map((r) => r.notchCm)),
  bestNotch: Math.min(...outRows.map((r) => r.notchCm)),
}));
