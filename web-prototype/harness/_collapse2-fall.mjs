/**
 * 🧱 **DO THE CHUNKS FALL, OR DO THEY FLOAT? — the instrument behind `collapse-2`'s first fix.**
 *
 *   node harness/_collapse2-fall.mjs
 *
 * John, 2026-08-10, after playing: *"the falling chunks kinda seem to **float down to the
 * ground**."* Against his own Teardown reference (`docs/design/teardown-reference.md`): *"slabs
 * tumble slowly enough to follow ONE, but they FALL — they are heavy."*
 *
 * 🎯 **THIS RUNS THE SHIPPED `DebrisSystem` HEADLESS, WITH NO RENDERER.** An `InstancedMesh` is
 * plain scene-graph data, so the integrator can be driven at a fixed 60 Hz timestep in node — no
 * browser, no boot wait, no GPU contention, and two runs agree to the digit. There is no wall
 * clock in this file: the only time term is the fixed `dt` the loop advances.
 *
 * 🚨 **AND IT CARRIES ITS OWN REINTRODUCTION, WHICH IS THIS PROJECT'S OWN RULE.** The defect was
 * `update()` applying the horizontal `drag` to `vy`, which is not air resistance — it is a
 * terminal velocity of `g·dt·drag/(1-drag)`, i.e. **1.41 m/s for a slab and 1.05 for a crumb**
 * against the 6.7 m/s a free fall from wall height reaches. The second arm below puts those
 * numbers back **as data** (`DEBRIS_KINDS[kind].vTerm`) and the file FAILS if the two arms agree,
 * because then the fix is not the thing doing the work.
 */

import * as THREE from 'three';
import { DebrisSystem, DEBRIS_KINDS } from '../src/destruction/debris.js';

const scene = new THREE.Scene();
const N = { x: 0, y: 0, z: 1 };
const DT = 1 / 60;

let seed = 1;
const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

/** @returns {{n, spawnY, fall, arrival, wallHits, resting}} averaged over the pieces that landed. */
function drive(kind, spawn) {
  seed = 1;
  const d = new DebrisSystem(scene, { perKind: 60, floorY: 0, rng });
  spawn(d);
  const p = d.pools[kind];
  const live = [];
  for (let i = 0; i < p.per; i++) if (p.alive[i]) live.push(i);
  const y0 = live.map((i) => p.py[i]);
  const landT = new Array(live.length).fill(-1);
  const peak = new Array(live.length).fill(0);
  const wall = new Array(live.length).fill(0);
  let t = 0;
  for (let f = 0; f < 60 * 8; f++) {
    d.update(DT); t += DT;
    for (let k = 0; k < live.length; k++) {
      const i = live[k];
      if (p.whit[i] > wall[k]) wall[k] = p.whit[i];
      if (landT[k] < 0) {
        // the speed it was carrying on the frame it first touched the floor
        if (Math.abs(p.vy[i]) > peak[k]) peak[k] = Math.abs(p.vy[i]);
        if (p.hits[i] > 0) landT[k] = t;
      }
    }
  }
  const ok = [];
  for (let k = 0; k < live.length; k++) if (landT[k] >= 0) ok.push(k);
  const avg = (f) => ok.reduce((a, k) => a + f(k), 0) / Math.max(1, ok.length);
  let resting = 0;
  for (let i = 0; i < p.per; i++) if (p.alive[i] && p.rest[i]) resting++;
  return {
    n: live.length, landed: ok.length, spawnY: avg((k) => y0[k]),
    fall: avg((k) => landT[k]), arrival: avg((k) => peak[k]),
    wallHits: avg((k) => wall[k]), resting,
  };
}

const CASES = [
  ['a collapsed slab, chunk() 0.6 x 0.6 m from 2.2 m', 'slab', (d) => {
    for (let k = 0; k < 5; k++) {
      d.chunk('slab', new THREE.Vector3(k * 0.7 - 1.4, 2.2, 0), { w: 0.6, h: 0.6, t: 0.09, normal: N });
    }
  }],
  ['an ordinary blow\'s slab, burst() from 1.6 m', 'slab', (d) => {
    d.burst('slab', new THREE.Vector3(0, 1.6, 0), 6, {
      size: 0.3, align: N, normal: N, speed: 2.6, eject: 0.30, spinScale: 0.7, wall: true,
      area: { x: 0.15, y: 0.15, z: 0.06 },
    });
  }],
  ['the crumb spray, plaster from 1.6 m', 'plaster', (d) => {
    d.burst('plaster', new THREE.Vector3(0, 1.6, 0), 12, {
      normal: N, speed: 1.9, eject: 0.35, wall: true, area: { x: 1.0, y: 1.0, z: 0.10 },
    });
  }],
];

const f2 = (v) => v.toFixed(2).padStart(6);
const row = (label, r) => console.log(`  ${label.padEnd(44)} spawn ${f2(r.spawnY)} m · fall ${f2(r.fall)} s`
  + ` · arrives at ${f2(r.arrival)} m/s · wall contacts ${f2(r.wallHits)} · resting ${r.resting}/${r.n}`);

const G = 9.4;   // DebrisSystem's own gravity
console.log('\nSHIPPED — drag on the horizontal only, vTerm on the vertical');
const after = CASES.map(([label, kind, spawn]) => {
  const r = drive(kind, spawn);
  row(label, r);
  return r;
});

// ---- the defect, put back AS DATA. See the header.
const OLD = { slab: 1.41, plaster: 1.05, lath: 1.41, timber: 2.08, paper: 0.26 };
const keep = {};
for (const k of Object.keys(OLD)) { keep[k] = DEBRIS_KINDS[k].vTerm; DEBRIS_KINDS[k].vTerm = OLD[k]; }
console.log('\nDEFECT REINTRODUCED — the terminal velocities `drag` on `vy` imposed');
const before = CASES.map(([label, kind, spawn]) => {
  const r = drive(kind, spawn);
  row(label, r);
  return r;
});
for (const k of Object.keys(OLD)) DEBRIS_KINDS[k].vTerm = keep[k];

console.log('\n  case                                          fall s        arrives m/s     free fall');
let bad = 0;
for (let i = 0; i < CASES.length; i++) {
  const a = after[i], b = before[i];
  const free = Math.sqrt(2 * G * Math.max(0.01, a.spawnY));
  console.log(`  ${CASES[i][0].padEnd(44)} ${f2(b.fall)} → ${f2(a.fall)}   ${f2(b.arrival)} → ${f2(a.arrival)}`
    + `   ${f2(free)} m/s   ${(100 * a.arrival / free).toFixed(0)}% of free fall`);
  /**
   * ⚠️ **THE BAR IS "IS IT FALLING", NOT "IS IT FAST".** John asked for weight, and explicitly not
   * for everything to be sped up — `spin` is untouched and is not measured here. A piece within a
   * quarter of free fall is accelerating under gravity for its whole flight, which is the only
   * thing that separates a heavy object from a scripted descent.
   */
  if (a.arrival < free * 0.75) { console.log('    ✗ still slower than three quarters of free fall'); bad++; }
  if (a.arrival < b.arrival * 2) { console.log('    ✗ the reintroduced defect reads the same — the fix is not doing the work'); bad++; }
}
console.log(bad === 0 ? '\n  OK — every kind falls under gravity, and putting the defect back changes it.'
  : `\n  ${bad} FAILED`);
process.exit(bad ? 1 : 0);
