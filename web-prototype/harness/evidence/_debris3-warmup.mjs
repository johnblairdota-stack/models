/**
 * 🚨 **THE LOADING-SCREEN WARM-UP THROWS DEBRIS INTO THE MIDDLE OF EVERY ROOM — measured.**
 *
 *   node harness/evidence/_debris3-warmup.mjs
 *
 * `views/game.js`'s live-only shader warm-up primes the particle pools so their programs are
 * compiled inside the loading screen rather than on the first blow:
 *
 *     for (const s of room.spaces) {
 *       const at = new THREE.Vector3((s.x0+s.x1)/2, 1.2, (s.z0+s.z1)/2);
 *       for (const kind of Object.keys(DEBRIS_KINDS)) debris.burst(kind, at, 3, {speed: 0.2, spread: 0.4});
 *       dust.burst(at, 6, {radius: 1.0});
 *     }
 *
 * That is 3 pieces x 5 kinds x every space, spawned 1.2 m above the floor in the CENTRE of the
 * room, with no wall plane and no player involved. This probe drives the real `DebrisSystem`
 * through the real burst and asks two questions the flag could not answer by inspection:
 *
 *   **Q1 DOES IT REST?** — does warm-up material end up as permanent scenery on the floor?
 *   **Q2 IS IT A REGRESSION FROM ROUND 12/13?** — ablate the two round-12 terms that could have
 *        turned a throwaway artefact into scenery (the pool weighting, the recycling order) and
 *        see whether the round-11 build swept it away.
 *
 * ⚠️ The answer to Q2 does not change what has to be done. A pile must only ever contain
 * material a player actually knocked off.
 *
 * Headless, no GL context, ~2 s, exactly reproducible.
 */
import * as THREE from 'three';
import { DebrisSystem, DEBRIS_KINDS } from '../../src/destruction/debris.js';
import { SPACES } from '../../src/game/spaces.js';

const scene = new THREE.Scene();
const KINDS = Object.keys(DEBRIS_KINDS);

function mk({ pools = 1, recycle = 1, perKind = 110 }) {
  let s = 20260809;
  const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const saved = {};
  if (!pools) for (const k in DEBRIS_KINDS) { saved[k] = DEBRIS_KINDS[k].pool; DEBRIS_KINDS[k].pool = 1; }
  const d = new DebrisSystem(scene, { perKind, floorY: 0, rng });
  if (!pools) for (const k in DEBRIS_KINDS) DEBRIS_KINDS[k].pool = saved[k];
  if (!recycle) {
    d._alloc = (p) => {
      const i = p.next;
      p.next = (i + 1) % p.per;
      if (!p.alive[i]) p.liveCount++; else d._pileRefund(p, i);
      return i;
    };
  }
  return d;
}

/** Exactly what `views/game.js` does in the loading screen. */
function warmup(d, spaces) {
  const at = new THREE.Vector3();
  for (const s of spaces) {
    at.set((s.x0 + s.x1) / 2, 1.2, (s.z0 + s.z1) / 2);
    for (const kind of KINDS) d.burst(kind, at, 3, { speed: 0.2, spread: 0.4 });
  }
  d.update(0.016);
}

/** Every live slot, tagged so we can ask later whether THIS piece is still on the floor. */
function tag(d) {
  const out = [];
  for (const k in d.pools) {
    const p = d.pools[k];
    for (let i = 0; i < p.per; i++) if (p.alive[i]) out.push([k, i, p.age[i]]);
  }
  return out;
}

/** Of the tagged slots, how many still hold a RESTING piece that was never recycled. */
function survivors(d, tags) {
  let n = 0;
  const byKind = {};
  for (const [k, i, age0] of tags) {
    const p = d.pools[k];
    // a recycled slot has had its age reset, so a survivor's age can only have grown
    if (p.alive[i] && p.rest[i] && p.age[i] >= age0) { n++; byKind[k] = (byKind[k] ?? 0) + 1; }
  }
  return { n, byKind };
}

function restCensus(d) {
  const byKind = {};
  let n = 0;
  for (const k in d.pools) {
    const p = d.pools[k];
    let c = 0;
    for (let i = 0; i < p.per; i++) if (p.alive[i] && p.rest[i]) c++;
    byKind[k] = c; n += c;
  }
  return { n, byKind };
}

/** Resting pieces within 5 m of a point — "is there junk in THIS room". */
function near(d, x, z, r = 5) {
  let n = 0;
  for (const k in d.pools) {
    const p = d.pools[k];
    for (let i = 0; i < p.per; i++) {
      if (!p.alive[i] || !p.rest[i]) continue;
      if (Math.hypot(p.px[i] - x, p.pz[i] - z) < r) n++;
    }
  }
  return n;
}

const spaces = SPACES;
console.log(`${spaces.length} spaces: ${spaces.map((s) => s.id).join(', ')}`);
console.log(`warm-up payout = ${spaces.length} spaces x ${KINDS.length} kinds x 3 = ${spaces.length * KINDS.length * 3} pieces\n`);

// ---------------------------------------------------------------------------
// Q1 — does the warm-up material come to rest, and where?
// ---------------------------------------------------------------------------
console.log('Q1  THE WARM-UP ALONE, no player, integrated for 30 s of live loop');
console.log('arm                        spawned  resting  peak(m)  per-room resting');
console.log('-'.repeat(96));
for (const [name, cfg] of [
  ['SHIPPED (round 13)      ', { pools: 1, recycle: 1 }],
  ['round 11 pools+recycler ', { pools: 0, recycle: 0 }],
  ['SHIPPED at quality=low  ', { pools: 1, recycle: 1, perKind: 50 }],
]) {
  const d = mk(cfg);
  warmup(d, spaces);
  const spawned = d.liveCount;
  for (let f = 0; f < 1800; f++) d.update(1 / 60);
  const c = restCensus(d);
  const rooms = spaces.map((s) => near(d, (s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2));
  console.log(`${name} ${String(spawned).padStart(7)} ${String(c.n).padStart(8)} ${d.pileDepth.toFixed(3).padStart(8)}  [${rooms.join(', ')}]`);
}

// ---------------------------------------------------------------------------
// Q2 — does a real dig sweep it away, or does it survive the whole session?
// ---------------------------------------------------------------------------
console.log('\nQ2  WARM-UP, THEN A REAL 63-BLOW DIG IN ONE ROOM — do the warm-up pieces survive?');
console.log('arm                        warm-up pieces still resting after the dig  (of 90)   by kind');
console.log('-'.repeat(96));
for (const [name, cfg] of [
  ['SHIPPED (round 13)      ', { pools: 1, recycle: 1 }],
  ['round 11 pools+recycler ', { pools: 0, recycle: 0 }],
]) {
  const d = mk(cfg);
  warmup(d, spaces);
  for (let f = 0; f < 600; f++) d.update(1 / 60);
  const tags = tag(d);
  // a real dig, at the first space's centre, with the payout `onChunk` actually makes
  const s0 = spaces[0];
  const at = new THREE.Vector3((s0.x0 + s0.x1) / 2, 1.4, (s0.z0 + s0.z1) / 2);
  const normal = { x: 0, y: 0, z: 1 };
  for (let b = 0; b < 63; b++) {
    d.burst('slab', at, 4, { size: 0.30, align: normal, normal, wall: true, speed: 2.0, eject: 0.30, spinScale: 0.7, area: { x: 0.15, y: 0.15, z: 0.06 } });
    d.burst('plaster', at, 2, { speed: 4.0, normal, wall: true, area: { x: 0.4, y: 0.4, z: 0.12 }, eject: 0.55 });
    for (let f = 0; f < 57; f++) d.update(1 / 60);
  }
  for (let f = 0; f < 300; f++) d.update(1 / 60);
  const sv = survivors(d, tags);
  const kinds = Object.entries(sv.byKind).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`${name} ${String(sv.n).padStart(43)}   ${kinds}`);
  // and the rooms nobody dug in
  const untouched = spaces.slice(1).map((s) => near(d, (s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2));
  console.log(`${' '.repeat(25)}rooms the player never entered still hold: [${untouched.join(', ')}]`);
}
