/**
 * Headless doorway-picker measurement, pass 2.
 * Open test: channel(0.34, 1.70, 0.30).open
 */
import { DamageField, CELL } from '../src/destruction/damagefield.js';

const CAP = 40;
const POWER = 1;

function fresh(w, h) {
  const g = new DamageField({ width: w, height: h, cell: CELL });
  g.setBarrierEverywhere(false);
  return g;
}

function ch(g) { return g.channel(0.34, 1.70, 0.30, 0); }

function drive(name, next, w, h) {
  const g = fresh(w, h);
  let last = null, n = 0;
  for (;;) {
    const [u, v] = next(g);
    last = g.applyHit(u, v, POWER);
    n++;
    const c = ch(g);
    if (c.open) {
      return { name, blows: n, w: +c.width.toFixed(3), h: +c.height.toFixed(3),
        collapse: !!(last?.collapse?.broke), load: last?.collapse?.load != null ? +last.collapse.load.toFixed(2) : null };
    }
    if (n >= CAP) return { name, blows: n, opened: false, w: +c.width.toFixed(3), collapse: !!(last?.collapse?.broke) };
  }
}

function shallowest(g, y0, y1, x0, x1) {
  const cx0 = Math.max(0, Math.floor(x0 / g.cellW));
  const cx1 = Math.min(g.cols - 1, Math.ceil(x1 / g.cellW));
  const cy0 = Math.max(0, Math.floor(y0 / g.cellH));
  const cy1 = Math.min(g.rows - 1, Math.ceil(y1 / g.cellH));
  let bx = cx0, by = cy0, bd = 2;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const d = g.depth[g.idx(cx, cy)];
      if (d < bd) { bd = d; bx = cx; by = cy; }
    }
  }
  return [(bx + 0.5) / g.cols, (by + 0.5) / g.rows];
}

const faces = [
  { label: 'slab-5.72', w: 5.72, h: 2.80 },
  { label: 'slab-2.96', w: 2.96, h: 2.80 },
  { label: 'door-2.08', w: 2.08, h: 2.68 },
];

function strategies(face) {
  const midX0 = face.w / 2 - 0.40, midX1 = face.w / 2 + 0.40;
  return [
    ['oneSpot-v0.40', (g) => [0.5, 0.40]],
    ['tallStack-0.55/1.00/1.45', (() => { let i = 0; const ys = [0.55, 1.00, 1.45]; return (g) => { const y = ys[i++ % ys.length]; return [0.5, y / g.height]; }; })()],
    ['bodyWindow-0.30-1.70', (g) => shallowest(g, 0.30, 1.70, midX0, midX1)],
    ['floorWindow-0-1.95', (g) => shallowest(g, 0.00, 1.95, midX0, midX1)],
    ['lowLine-y0.22', (g) => shallowest(g, 0.10, 0.40, midX0, midX1)],
  ];
}

const out = [];
for (const face of faces) {
  for (const [name, next] of strategies(face)) {
    out.push({ face: face.label, ...drive(name, next, face.w, face.h) });
  }
}
console.log(JSON.stringify(out, null, 2));
