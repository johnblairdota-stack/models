/**
 * Checks the artboards against the rule they exist to make legible: a sound in a room with no
 * camera is NEVER a placed dot, and a bearing band never leaves the building. Reads the scene
 * declarations out of build.mjs rather than the rendered SVG, so it checks intent.
 */
import { readFileSync } from 'node:fs';
const HOUSE = [
  { id: 'gallery', x0: -13.6, x1: 13.6, z0: -31.0, z1: -24.3 },
  { id: 'study_w', x0: -13.6, x1: -2.0, z0: -24.0, z1: -8.6 },
  { id: 'service', x0: -1.7, x1: 1.7, z0: -24.0, z1: -8.6 },
  { id: 'study_e', x0: 2.0, x1: 13.6, z0: -24.0, z1: -8.6 },
  { id: 'ballroom', x0: -13.6, x1: 13.6, z0: -8.3, z1: 7.0 },
  { id: 'chapel', x0: 4.2, x1: 11.0, z0: -37.8, z1: -31.3 },
];
const roomAt = (x, z) => HOUSE.find((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)?.id ?? null;
/* `spaces.js` leaves seams between rooms — 0.3 m between the gallery and the studies, 0.3 m
   either side of the service passage — so a point on a party wall is inside the house and
   inside no room. Dilating by half a metre asks "is this in the building", which is the
   question; `roomAt` still answers "which room" strictly. */
const inHouse = (x, z) => HOUSE.some((r) => x >= r.x0 - 0.5 && x <= r.x1 + 0.5 && z >= r.z0 - 0.5 && z <= r.z1 + 0.5);
const src = readFileSync('build.mjs', 'utf8');
let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.log('  FAIL ' + n + (d ? ' · ' + d : '')); } };

// Every scene, pulled straight out of the generator's own source.
const CAM1 = ['study_e', 'service'], CAM2 = ['study_e', 'service', 'gallery', 'chapel'];
const scenes = [];
for (const m of src.matchAll(/W\('(\w+)\.dc\.html', phone\(\[([\s\S]*?)\n\]\.join/g)) {
  const [, name, body] = m;
  const litM = body.match(/lit: (CAM1|CAM2|\[[^\]]*\])/);
  const lit = !litM ? [] : litM[1] === 'CAM1' ? CAM1 : litM[1] === 'CAM2' ? CAM2
    : JSON.parse(litM[1].replace(/'/g, '"'));
  const marks = [...body.matchAll(/\{ x: (-?[\d.]+), z: (-?[\d.]+), loud: ([\d.]+), kind: '(\w+)' \}/g)]
    .map((g) => ({ x: +g[1], z: +g[2], loud: +g[3], kind: g[4] }));
  const arcs = [...body.matchAll(/\{ x: (-?[\d.]+), z: (-?[\d.]+), from: (-?[\d.]+), to: (-?[\d.]+), r0: ([\d.]+), r1: ([\d.]+)/g)]
    .map((g) => ({ x: +g[1], z: +g[2], from: +g[3], to: +g[4], r0: +g[5], r1: +g[6] }));
  scenes.push({ name, lit, marks, arcs, bare: /bare: true/.test(body) });
}
t('A1 · every artboard was parsed', scenes.length === 6, scenes.map((s) => s.name).join(','));
t('A2 · coverage is a multiple of ROOMS_PER_CAM = 2',
  scenes.every((s) => s.bare || s.lit.length % 2 === 0), scenes.map((s) => s.name + ':' + s.lit.length).join(' '));

for (const s of scenes) {
  for (const m of s.marks) {
    const r = roomAt(m.x, m.z);
    t(`B · ${s.name} ${m.kind} is inside a room`, !!r, `(${m.x}, ${m.z})`);
    // 🚨 The rule. A placed dot asserts a camera; drawing one without is the mechanic broken.
    t(`C · ${s.name} ${m.kind} is placed only where a camera is`, s.lit.includes(r), `${r} not in [${s.lit}]`);
  }
  for (const a of s.arcs) {
    const hit = new Set(); let outside = null;
    for (let d = a.from; d <= a.to; d += 0.5) for (const r of [a.r0, (a.r0 + a.r1) / 2, a.r1]) {
      const x = a.x + Math.sin(d * Math.PI / 180) * r, z = a.z - Math.cos(d * Math.PI / 180) * r;
      if (!inHouse(x, z)) outside ??= `${d}deg r${r} -> (${x.toFixed(1)}, ${z.toFixed(1)})`;
      hit.add(roomAt(x, z));
    }
    t(`D · ${s.name} band stays inside the house`, !outside, outside);
    hit.delete(null);
    t(`E · ${s.name} band names no covered room`, ![...hit].some((r) => s.lit.includes(r)), `${[...hit]} vs lit [${s.lit}]`);
    t(`F · ${s.name} band spans more than one room`, hit.size > 1, `only ${[...hit]}`);
  }
}
// The control: the rule must be capable of failing.
const bad = roomAt(-8.4, -27.6);
t('G control · a gallery mark IS refused when the gallery is dark', !CAM1.includes(bad), bad);
console.log(`\n_geom: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
