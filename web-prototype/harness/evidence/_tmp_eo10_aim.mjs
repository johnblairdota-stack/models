// scratch: WHAT DOES EACH END PLATE REFLECT? Pure geometry, no browser, no GPU.
// Reflect the eye ray about the plate plane over a grid of plate points and classify where
// each reflected ray first lands. The right plate is the CONTROL: it is the one the critic
// verified legible, so its floor fraction is the target the left plate has to reach.
const CAM = [7.4, 1.62, 6.1];
const R = { x0: -13, x1: 13, z0: -8, z1: 8 };
const EM_H = 3.10, EM_W = 1.70, EM_FOOT = 1.30;
const WIN = { w: 2.05, sill: 1.05, h: 4.35, spacing: 4.2, n: 5, z0: -6.4 };
const winZ = []; for (let i = 0; i < WIN.n; i++) winZ.push(WIN.z0 + i * WIN.spacing);

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a); return a.map((v) => v / l); };

// base = T * Ry(yaw) * Rx(rake).  local +Z, +Y, +X in world:
const axes = (rake, yaw) => ({
  n: [Math.cos(rake) * Math.sin(yaw), -Math.sin(rake), Math.cos(rake) * Math.cos(yaw)],
  up: [Math.sin(rake) * Math.sin(yaw), Math.cos(rake), Math.sin(rake) * Math.cos(yaw)],
  rt: [Math.cos(yaw), 0, -Math.sin(yaw)],
});
const centre = (rake, x) => [x, EM_FOOT + (EM_H / 2) * Math.cos(rake), R.z0 + 0.22 + (EM_H / 2) * Math.sin(rake)];

/** first surface the ray Q+t*d meets. Windows are holes in the window wall, so a ray that
 *  reaches x=-13 inside a lancet is classed GLASS, not wall. */
function land(Q, d) {
  const tFloor = d[1] < -1e-6 ? -Q[1] / d[1] : Infinity;
  const tWall = d[0] < -1e-6 ? (R.x0 - Q[0]) / d[0] : Infinity;
  const tEnd = d[2] > 1e-6 ? (R.z1 - Q[2]) / d[2] : Infinity;
  const t = Math.min(tFloor, tWall, tEnd);
  if (!isFinite(t)) return { what: 'nothing', at: [0, 0, 0] };
  const p = Q.map((v, i) => v + d[i] * t);
  let what = t === tFloor ? 'FLOOR' : (t === tWall ? 'wall' : 'endZ');
  if (what === 'wall' && p[1] > WIN.sill && p[1] < WIN.sill + WIN.h
      && winZ.some((wz) => Math.abs(p[2] - wz) < WIN.w / 2)) what = 'GLASS';
  return { what, at: p.map((v) => +v.toFixed(2)) };
}

function census(rake, x, yaw = 0, N = 15) {
  const { n, up, rt } = axes(rake, yaw);
  const P = centre(rake, x);
  const tally = {}; const pts = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const u = ((i + 0.5) / N - 0.5) * EM_W, v = ((j + 0.5) / N - 0.5) * EM_H;
      const Q = P.map((c, k) => c + rt[k] * u + up[k] * v);
      const d = norm(Q.map((c, k) => c - CAM[k]));
      const dn = dot(d, n);
      const dr = d.map((c, k) => c - 2 * dn * n[k]);
      const L = land(Q, dr);
      tally[L.what] = (tally[L.what] ?? 0) + 1;
      pts.push(L);
    }
  }
  const tot = N * N;
  const pc = Object.fromEntries(Object.entries(tally).map(([k, v]) => [k, +(100 * v / tot).toFixed(0)]));
  // how far the floor content RECEDES: the z span of the floor hits, i.e. how much
  // perspective convergence the plate carries. A grid with no depth range is a texture.
  const fz = pts.filter((p) => p.what === 'FLOOR').map((p) => p.at[2]);
  const span = fz.length ? +(Math.max(...fz) - Math.min(...fz)).toFixed(1) : 0;
  return { pc, floorZSpan: span, proud: +((EM_H / 2) * Math.sin(rake) * 2).toFixed(2) };
}

const deg = (d) => d * Math.PI / 180;
const line = (label, c) => console.log(`  ${label.padEnd(26)} ${JSON.stringify(c.pc).padEnd(46)} floor z-span ${String(c.floorZSpan).padStart(5)} m`);

console.log('CONTROL — right plate x=+5.4, the one the critic verified as legible:');
line('rake 9 yaw 0 (shipping)', census(0.157, 5.4));
console.log('\nLEFT plate x=-5.4, shipping:');
line('rake 9 yaw 0 (shipping)', census(0.157, -5.4));

console.log('\nLEFT plate — yaw sweep at the shipping rake of 9 deg:');
for (const d of [0, 4, 6, 8, 10, 12, 14, 16, 20]) line(`rake 9  yaw ${d}`, census(0.157, -5.4, deg(d)));

console.log('\nLEFT plate — rake sweep at yaw 0 (the alternative lever, for comparison):');
for (const d of [9, 12, 15, 18, 21]) line(`rake ${d} yaw 0`, census(deg(d), -5.4));

console.log('\nLEFT plate — a few combinations:');
for (const [r, y] of [[11, 6], [11, 10], [13, 8], [12, 12]]) line(`rake ${r} yaw ${y}`, census(deg(r), -5.4, deg(y)));
