/**
 * 🧱 **THE PILE'S BOOKKEEPING, HEADLESS — no browser, no WebGL, no 120 s boot.**
 *
 *   node harness/evidence/_debris2-unit.mjs
 *
 * `debris-floor.mjs` photographs the floor and costs a real minute plus a cold boot.
 * This drives the SAME shipped `DebrisSystem` object in plain node — `InstancedMesh`
 * construction and matrix writes need no GL context — so the invariants a picture cannot
 * see are checked in two seconds and can be re-run after every edit:
 *
 *   U1  the pool weighting the caller actually gets
 *   U2  a 63-blow dig at real cadence: how much is still resting at the end
 *   U3  🎯 **the height field equals the sum of the resting pieces' own contributions.**
 *       This is the invariant that decides whether the pile can be permanent: every piece
 *       banks `pdh` into one cell and hands exactly that back when it is recycled, so if
 *       the two totals ever diverge the drift climbs on its own as the ring turns over.
 *   U4  a fully settled pool reports `moving = 0`, i.e. it has stopped re-uploading
 *   U5  the drift has a HEIGHT (the round-12 finding: 201 resting pieces in one 2 cm plane
 *       photograph as a dozen chips)
 *   U6  ⚠️ **the collapse case: 768 pieces dumped into a 330-slot pool in twelve frames.**
 *       That is the moment a recycling pool eats the evidence, and it is the one the
 *       support-collapse slice will produce for real.
 */
import * as THREE from 'three';
import { DebrisSystem } from '../../src/destruction/debris.js';

const scene = new THREE.Scene();
let s = 12345;
const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

const d = new DebrisSystem(scene, { perKind: Number(process.env.PERKIND ?? 110), floorY: 0, rng });
console.log('U1 pools:', Object.fromEntries(Object.entries(d.pools).map(([k, p]) => [k, p.per])));

const N = Number(process.env.BLOWS ?? 63);
const at = new THREE.Vector3(0, 1.4, 0);
const normal = { x: 0, y: 0, z: 1 };
let spawned = 0;
for (let b = 0; b < N; b++) {
  // one slab + crumbs: what `views/game.js` onChunk pays out on a face that is still giving way
  spawned += d.burst('slab', at, 1, { size: 0.30, align: normal, normal, wall: true, speed: 2.0, eject: 0.30, spinScale: 0.7, area: { x: 0.15, y: 0.15, z: 0.06 } });
  spawned += d.burst('plaster', at, 10, { speed: 4.0, normal, wall: true, area: { x: 0.4, y: 0.4, z: 0.12 }, eject: 0.55 });
  for (let f = 0; f < 57; f++) d.update(1 / 60);   // ~0.95 s of frames between blows
}
for (let f = 0; f < 180; f++) d.update(1 / 60);

function audit() {
  let banked = 0, resting = 0, inPile = 0;
  for (const k in d.pools) {
    const p = d.pools[k];
    for (let i = 0; i < p.per; i++) {
      if (!p.alive[i] || !p.rest[i]) continue;
      resting++;
      if (p.pcell[i] >= 0) { inPile++; banked += p.pdh[i]; }
    }
  }
  let field = 0;
  for (const v of d.pile.values()) field += v;
  return { banked, resting, inPile, field, cells: d.pile.size };
}

let a = audit();
console.log(`U2 spawned ${spawned} · resting ${a.resting} · live ${d.liveCount} · restCount ${d.restCount}`);
console.log(`U3 height field ${a.field.toFixed(4)} m vs banked ${a.banked.toFixed(4)} m over ${a.inPile} pieces · ${a.cells} cells`
  + `  ${Math.abs(a.field - a.banked) < 1e-3 ? 'EXACT' : '*** DIVERGED ***'}`);
console.log('U4 moving per pool after settle:', Object.fromEntries(Object.entries(d.pools).map(([k, p]) => [k, p.moving])));
console.log(`U5 pileDepth ${d.pileDepth.toFixed(3)} m`);

const ys = [];
for (const k in d.pools) {
  const p = d.pools[k];
  for (let i = 0; i < p.per; i++) if (p.alive[i] && p.rest[i]) ys.push(p.py[i]);
}
ys.sort((x, y) => x - y);
const q = (f) => (ys.length ? ys[Math.min(ys.length - 1, Math.floor(f * ys.length))] : 0).toFixed(3);
console.log(`U5 y spread of resting pieces: min ${q(0)} p50 ${q(0.5)} p90 ${q(0.9)} max ${q(0.999)}`);

// ---- U6: the collapse dump ------------------------------------------------------------------
for (let b = 0; b < 12; b++) d.burst('slab', at, 64, { size: 0.30, align: normal, normal, wall: true, speed: 1.15, eject: 0.12, area: { x: 1.2, y: 1.4, z: 0.07 } });
for (let f = 0; f < 400; f++) d.update(1 / 60);
a = audit();
console.log(`U6 after a 768-piece dump: resting ${a.resting} · field ${a.field.toFixed(4)} vs banked ${a.banked.toFixed(4)}`
  + ` · ${a.cells} cells · peak ${d.pileDepth.toFixed(3)} m  ${Math.abs(a.field - a.banked) < 1e-3 ? 'EXACT' : '*** DIVERGED ***'}`);
console.log('U6 pools:', Object.fromEntries(Object.entries(d.pools).map(([k, p]) => [k, `${p.mesh.count}/${p.per} vis=${p.mesh.visible} moving=${p.moving}`])));
