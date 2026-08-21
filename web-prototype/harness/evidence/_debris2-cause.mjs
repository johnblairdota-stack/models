/**
 * 🎯 **WHY THE FLOOR WAS CLEAN — the attribution, by ablation, headless.**
 *
 *   node harness/evidence/_debris2-cause.mjs
 *
 * `critic-slice-3` ranked *"the floor stays clean"* #1 of everything between the build and
 * John's art, and three explanations were on the table when `debris-1` was killed:
 *
 *   **H1 RECYCLING** — the pool is a ring buffer that overwrites the OLDEST allocation, i.e. a
 *        piece of the pile, while pieces still in the air are left alone. Round 12's `_alloc`.
 *   **H2 POOL SIZE** — `views/game.js` passes `perKind = 110 x quality.particles`, spent evenly
 *        over five kinds, so the two kinds the dig actually uses got 220 of 1100 slots.
 *        Round 12's `def.pool` weighting.
 *   **H3 THE REST POSE** — every piece came to rest in ONE PLANE at `floorY + sc*0.016`, so two
 *        hundred pieces occupied 2 cm of vertical space and hid inside each other. Round 12's
 *        `_pileAt`/`_pileDrop` height field.
 *
 * Each is ablated back to its pre-round-12 behaviour, alone and in combination, on the SAME
 * seeded 63-blow drive at the same cadence, against the SHIPPED `DebrisSystem`. No browser and
 * no GL context — `InstancedMesh` construction and matrix writes need neither — so this is two
 * seconds and it is exactly reproducible.
 *
 * ⚠️ **THE HEADLINE METRIC IS A HEIGHT, NOT A COUNT.** A count can be raised by throwing more
 * confetti; what `critic-slice-3` photographed and called *"six to ten hand-sized chips"* was a
 * drift with no depth. Both are reported, and they do not move together — which is the finding.
 */
import * as THREE from 'three';
import { DebrisSystem, DEBRIS_KINDS } from '../../src/destruction/debris.js';

const BLOWS = Number(process.env.BLOWS ?? 63);
const scene = new THREE.Scene();

function drive({ recycle, pools, pile, perKind = 110 }) {
  let s = 12345;
  const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

  // H2 ablation: hand every kind the same slice of the budget, as round 11 did.
  const saved = {};
  if (!pools) for (const k in DEBRIS_KINDS) { saved[k] = DEBRIS_KINDS[k].pool; DEBRIS_KINDS[k].pool = 1; }
  const d = new DebrisSystem(scene, { perKind, floorY: 0, rng });
  if (!pools) for (const k in DEBRIS_KINDS) DEBRIS_KINDS[k].pool = saved[k];

  // H1 ablation: the plain ring buffer — take the next slot, whatever is in it.
  if (!recycle) {
    d._alloc = (p) => {
      const i = p.next;
      p.next = (i + 1) % p.per;
      if (!p.alive[i]) p.liveCount++; else d._pileRefund(p, i);
      return i;
    };
  }
  // H3 ablation: no height field — a piece lands on the floor and rests in the floor plane.
  if (!pile) {
    d._pileAt = () => 0;
    d._pileDrop = () => 0;
  }

  const at = new THREE.Vector3(0, 1.4, 0);
  const normal = { x: 0, y: 0, z: 1 };
  let spawned = 0;
  for (let b = 0; b < BLOWS; b++) {
    spawned += d.burst('slab', at, 1, { size: 0.30, align: normal, normal, wall: true, speed: 2.0, eject: 0.30, spinScale: 0.7, area: { x: 0.15, y: 0.15, z: 0.06 } });
    spawned += d.burst('plaster', at, 10, { speed: 4.0, normal, wall: true, area: { x: 0.4, y: 0.4, z: 0.12 }, eject: 0.55 });
    for (let f = 0; f < 57; f++) d.update(1 / 60);
  }
  for (let f = 0; f < 180; f++) d.update(1 / 60);

  // the census: resting pieces, their bulk, and the SHAPE of what is on the floor
  let rest = 0, vol = 0;
  const ys = [];
  const CELL = 0.15, NA = 40, NB = 40;
  const hi = new Float32Array(NA * NB), cnt = new Int32Array(NA * NB);
  for (const k in d.pools) {
    const p = d.pools[k];
    const g = p.mesh.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    const unit = (bb.max.x - bb.min.x) * (bb.max.y - bb.min.y) * (bb.max.z - bb.min.z) * 0.55;
    const tall = Math.max(bb.max.y, bb.max.z);
    for (let i = 0; i < p.per; i++) {
      if (!p.alive[i] || !p.rest[i]) continue;
      rest++;
      const sc = p.sc[i];
      vol += unit * sc * sc * sc;
      ys.push(p.py[i]);
      const ia = Math.round(p.px[i] / CELL) + (NA >> 1), ib = Math.round(p.pz[i] / CELL) + (NB >> 1);
      if (ia >= 0 && ia < NA && ib >= 0 && ib < NB) {
        const j = ib * NA + ia;
        cnt[j]++;
        hi[j] = Math.max(hi[j], p.py[i] + tall * sc);
      }
    }
  }
  ys.sort((a, b) => a - b);
  let covered = 0, hmax = 0, hsum = 0;
  for (let j = 0; j < hi.length; j++) if (cnt[j]) { covered++; hsum += hi[j]; if (hi[j] > hmax) hmax = hi[j]; }
  return {
    spawned, rest, litres: vol * 1000,
    peak: hmax, mean: hsum / Math.max(1, covered), area: covered * CELL * CELL,
    p90: ys.length ? ys[Math.floor(ys.length * 0.9)] : 0,
  };
}

const arms = [
  ['SHIPPED (round 12)                    ', { recycle: 1, pools: 1, pile: 1 }],
  ['H1 off — plain ring buffer            ', { recycle: 0, pools: 1, pile: 1 }],
  ['H2 off — even pool budget             ', { recycle: 1, pools: 0, pile: 1 }],
  ['H3 off — no height field, flat rest   ', { recycle: 1, pools: 1, pile: 0 }],
  ['round 11 (all three off)              ', { recycle: 0, pools: 0, pile: 0 }],
  ['SHIPPED at quality=low (perKind 50)   ', { recycle: 1, pools: 1, pile: 1, perKind: 50 }],
];

console.log(`${BLOWS} blows, one spot, 0.95 s cadence, same seed in every arm\n`);
console.log('arm                                     rest  litres   peak    mean   area   p90 y');
console.log('-'.repeat(84));
for (const [name, cfg] of arms) {
  const r = drive(cfg);
  console.log(`${name} ${String(r.rest).padStart(5)} ${r.litres.toFixed(0).padStart(7)}`
    + ` ${r.peak.toFixed(3).padStart(7)} ${r.mean.toFixed(3).padStart(7)}`
    + ` ${r.area.toFixed(2).padStart(6)} ${r.p90.toFixed(3).padStart(7)}`);
}
console.log('\npeak/mean/p90 are metres above the floor; area is m² of floor carrying a resting piece.');

/**
 * ⚠️ **AND THE CASE H1 IS ACTUALLY FOR.** An ordinary dig never fills the slab pool, so the
 * recycling ORDER buys almost nothing above — but the support collapse `damagefield.js` now
 * computes dumps a whole region in one frame, which is precisely when a plain ring buffer eats
 * the pile it just made. Same probe, 768 slabs into a 330-slot pool over twelve frames.
 */
function dump({ recycle }) {
  let s = 999;
  const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const d = new DebrisSystem(scene, { perKind: 110, floorY: 0, rng });
  if (!recycle) {
    d._alloc = (p) => {
      const i = p.next;
      p.next = (i + 1) % p.per;
      if (!p.alive[i]) p.liveCount++; else d._pileRefund(p, i);
      return i;
    };
  }
  const at = new THREE.Vector3(0, 1.6, 0);
  const normal = { x: 0, y: 0, z: 1 };
  // 20 ordinary blows first, so there is a pile for the collapse to land on and to destroy
  for (let b = 0; b < 20; b++) {
    d.burst('slab', at, 1, { size: 0.30, align: normal, normal, wall: true, speed: 2.0, eject: 0.30, area: { x: 0.15, y: 0.15, z: 0.06 } });
    for (let f = 0; f < 57; f++) d.update(1 / 60);
  }
  let before = 0;
  for (let i = 0; i < d.pools.slab.per; i++) if (d.pools.slab.alive[i] && d.pools.slab.rest[i]) before++;
  for (let b = 0; b < 12; b++) {
    d.burst('slab', at, 64, { size: 0.30, align: normal, normal, wall: true, speed: 1.15, eject: 0.12, area: { x: 1.2, y: 1.4, z: 0.07 } });
    d.update(1 / 60);
  }
  for (let f = 0; f < 420; f++) d.update(1 / 60);
  let after = 0;
  for (let i = 0; i < d.pools.slab.per; i++) if (d.pools.slab.alive[i] && d.pools.slab.rest[i]) after++;
  return { before, after, peak: d.pileDepth };
}
console.log('\nTHE COLLAPSE CASE — 768 slabs into a 330-slot pool in twelve frames,'
  + ' on top of a 20-blow pile:');
for (const [name, cfg] of [['SHIPPED (pile recycled last)', { recycle: 1 }], ['plain ring buffer          ', { recycle: 0 }]]) {
  const r = dump(cfg);
  console.log(`  ${name}  pile before ${String(r.before).padStart(3)} -> after ${String(r.after).padStart(3)}`
    + ` slabs resting · peak ${r.peak.toFixed(3)} m`);
}

/**
 * 🎯 **THE CASE THAT DECIDES WHETHER A PILE IS PERMANENT: TWO DIGS, TWO ROOMS.** Everything
 * above digs one spot, so a recycler that eats the pile eats it and refills it in the same
 * place and the picture never moves. The question a persistent pile actually has to answer is
 * whether the drift you left in the service passage is still there after you have dug your way
 * out of the gallery — i.e. whether the floor accumulates across the HOUSE or only locally.
 */
function twoRooms({ recycle }) {
  let s = 4242;
  const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const d = new DebrisSystem(scene, { perKind: 110, floorY: 0, rng });
  if (!recycle) {
    d._alloc = (p) => {
      const i = p.next;
      p.next = (i + 1) % p.per;
      if (!p.alive[i]) p.liveCount++; else d._pileRefund(p, i);
      return i;
    };
  }
  const normal = { x: 0, y: 0, z: 1 };
  /**
   * ⚠️ **THIS ARM USES THE PAYOUT THE GAME ACTUALLY MAKES, NOT THE TABLE'S.** The ablation table
   * above drives 1 slab + 10 crumbs a blow, which is a stress case; `debris-floor.mjs` measured
   * the shipped `onChunk` over a real 63-blow dig at **259 slabs and 147 crumbs**, i.e. ~4 and
   * ~2. Getting this wrong makes the pools look four times thirstier than they are, and the
   * whole point of this arm is whether the SECOND dig has enough slots.
   */
  const dig = (x) => {
    const at = new THREE.Vector3(x, 1.4, 0);
    for (let b = 0; b < BLOWS; b++) {
      d.burst('slab', at, 4, { size: 0.30, align: normal, normal, wall: true, speed: 2.0, eject: 0.30, area: { x: 0.15, y: 0.15, z: 0.06 } });
      d.burst('plaster', at, 2, { speed: 4.0, normal, wall: true, area: { x: 0.4, y: 0.4, z: 0.12 }, eject: 0.55 });
      for (let f = 0; f < 57; f++) d.update(1 / 60);
    }
    for (let f = 0; f < 180; f++) d.update(1 / 60);
  };
  const near = (x) => {
    let n = 0;
    for (const k in d.pools) {
      const p = d.pools[k];
      for (let i = 0; i < p.per; i++) if (p.alive[i] && p.rest[i] && Math.abs(p.px[i] - x) < 5) n++;
    }
    return n;
  };
  dig(0);
  const roomA = near(0);
  dig(40);
  return { roomA, roomAafter: near(0), roomB: near(40) };
}
console.log('\nTWO DIGS, TWO ROOMS — is the first room\'s drift still there after the second dig?');
for (const [name, cfg] of [['SHIPPED (pile recycled last)', { recycle: 1 }], ['plain ring buffer          ', { recycle: 0 }]]) {
  const r = twoRooms(cfg);
  console.log(`  ${name}  room A ${String(r.roomA).padStart(3)} resting -> ${String(r.roomAafter).padStart(3)}`
    + ` after digging room B (${r.roomB} there)`);
}
