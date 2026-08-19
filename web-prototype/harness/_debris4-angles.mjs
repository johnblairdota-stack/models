/**
 * 🎯 **DOES THE PILE REST AT EVERY ANGLE, OR AT ONE? — the reference's own named tell.**
 *
 *   node harness/_debris4-angles.mjs
 *
 * `docs/design/teardown-reference.md`: *"They land and stay, and the heap has STRUCTURE — pieces
 * at every angle leaning on each other."* And the brief's own warning, which is the sharp form of
 * it: **a pile where every slab rests at the same angle is the tell that gives a canned tumble
 * away.** `debris.js` already knows this — the note on the lean says so in capitals.
 *
 * 🚨 **AND `debris-floor.mjs` CAUGHT IT FAILING, ON n = 3.** Its big-chunk drop reads
 * **0.69 rad of spread after a 63-blow dig and 0.11 rad after a 16-blow one** — the same code,
 * the same three plates, a different pile under them. HANDOFF's own case study is that
 * *"n = 3 was a small sample and I called it a strong signal"*, so this probe re-asks the
 * question over the WHOLE pile — hundreds of pieces — instead of three.
 *
 * 🎯 **THE MECHANISM THE CODE PREDICTS, WHICH IS WHAT MAKES THIS WORTH MEASURING RATHER THAN
 * ARGUING.** `update()` draws a settled piece's slop as
 *
 *     rx = restRot[0] + (rand - 0.5) * (0.32 + 1.75 * onPile),   onPile = min(1, h / 0.30)
 *
 * so **the spread is a function of the rubble already under the piece.** On bare floor it is
 * ±0.16 rad; on 0.30 m of drift it is ±1.04 rad. That is deliberate and right in kind — a piece
 * landing on a flat floor lies down, a piece landing on a heap cannot — but it means the FIRST
 * pieces of every pile are near-parallel, and under the shipped `DIG_BASE = 8` a whole wall is
 * now ~8-16 blows, so "the first pieces" is most of what a player ever sees.
 *
 * The lean against the wall (`dw < 0.34`) is the other spread term and it is drawn per piece.
 *
 * ⚠️ Headless, the real `DebrisSystem`, the payout `views/game.js` `onChunk` actually makes at
 * the shipped base. No GL, ~2 s, exactly reproducible.
 *
 * ---------------------------------------------------------------------------------------
 * 🚨 **WHAT THIS PROBE'S POPULATION IS NOT — read this before quoting a number out of it.**
 * ---------------------------------------------------------------------------------------
 * `dig()` below fires **every blow at the same point**, `(0, 1.4, 0)`. So the whole pile lands
 * inside the lean's 0.34 m reach and on top of itself, and this probe therefore measures a HEAP
 * and only a heap. A live dig walks the crosshair (`debris-floor.mjs`'s plan is a body-wide
 * channel) and throws a scatter of singles across open floor out to ~2 m, where `dw >= 0.34`
 * makes the lean **exactly zero** and there is no rubble to cock a piece against — so those
 * pieces lie flat, correctly, and there are enough of them to move a whole-room flat share from
 * 16% to 32%. That gap is not a regression in either place; it is two different questions.
 *
 * `harness/scenarios/_debris5-pop.mjs` is the live instrument that separates them, and
 * `debris-floor.mjs`'s gate now reads the heap explicitly. **This probe is the right tool for
 * "does the rest maths still put structure in a pile" and the wrong one for "what does the floor
 * of a real room look like".** It also never fires `onBreak`, so nothing it reports has ever
 * covered that spawn path — which is where round 15's actual defect was hiding.
 */
import * as THREE from 'three';
import { DebrisSystem } from '../src/destruction/debris.js';

const scene = new THREE.Scene();

function mk(perKind = 110) {
  let s = 20260809;
  const rng = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  return new DebrisSystem(scene, { perKind, floorY: 0, rng });
}

/**
 * One dig against a +z face at x=0, z=0. `blows` at the cadence the game swings at, with the
 * payout `onChunk` makes at `DIG_BASE = 8`: `removed` sits on the deposit plateau (~0.92), so
 * the slab branch and the crumb branch are both at their caps on every blow.
 */
function dig(d, blows, { collapseEvery = 4 } = {}) {
  const n = { x: 0, y: 0, z: 1 };
  const at = new THREE.Vector3(0, 1.4, 0);
  for (let b = 0; b < blows; b++) {
    // the ordinary blow: one slab sized to the patch, plus the crumb spray (capped at 13)
    d.burst('slab', at, 2, {
      size: 0.40, align: n, normal: n, wall: true,
      speed: 3.1, eject: 0.30, spinScale: 0.7, area: { x: 0.20, y: 0.20, z: 0.06 },
    });
    d.burst('plaster', at, 13, {
      speed: 6.2, normal: n, wall: true, area: { x: 0.40, y: 0.40, z: 0.12 }, eject: 0.55,
    });
    // the collapse: one big chunk per region, `debris.chunk`'s seeded tumble
    if (b % collapseEvery === collapseEvery - 1) {
      for (let k = 0; k < 3; k++) {
        d.chunk('slab', new THREE.Vector3((k - 1) * 0.5, 1.5, 0), { w: 0.58, h: 0.44, t: 0.12, normal: n });
      }
    }
    for (let f = 0; f < 57; f++) d.update(1 / 60);   // 0.95 s at 60 fps
  }
  for (let f = 0; f < 240; f++) d.update(1 / 60);
}

/** The angular statistics of every resting piece of one kind. */
function angles(d, kind) {
  const p = d.pools[kind];
  const rest = p.def.restRot[0];
  const tilt = [];
  for (let i = 0; i < p.per; i++) {
    if (!p.alive[i] || !p.rest[i]) continue;
    // how far this piece is from lying flat in its own rest pose, in radians
    tilt.push(Math.hypot(p.rx[i] - rest, p.rz[i] - p.def.restRot[1]));
  }
  if (!tilt.length) return null;
  tilt.sort((a, b) => a - b);
  const q = (f) => tilt[Math.min(tilt.length - 1, Math.floor(f * tilt.length))];
  const mean = tilt.reduce((a, b) => a + b, 0) / tilt.length;
  const sd = Math.sqrt(tilt.reduce((a, b) => a + (b - mean) ** 2, 0) / tilt.length);
  // the share lying within 10 degrees of flat — "a deck of cards"
  const flat = tilt.filter((t) => t < 0.175).length / tilt.length;
  return { n: tilt.length, mean, sd, p10: q(0.10), p50: q(0.50), p90: q(0.90), flat };
}

const f3 = (x) => x.toFixed(3);

console.log('THE SHIPPED PILE — rest-angle spread of every resting slab, by dig length\n');
console.log('blows  removed-ish  slabs  peak(m)   mean tilt    sd    p10    p50    p90   within 10 deg of flat');
console.log('-'.repeat(104));
for (const blows of [4, 8, 16, 32, 63]) {
  const d = mk();
  dig(d, blows);
  const a = angles(d, 'slab');
  if (!a) { console.log(`${String(blows).padStart(5)}  no resting slab`); continue; }
  console.log(`${String(blows).padStart(5)}  ${String(blows * 2).padStart(11)}  ${String(a.n).padStart(5)}`
    + `  ${f3(d.pileDepth).padStart(7)}   ${f3(a.mean).padStart(9)}  ${f3(a.sd)}  ${f3(a.p10)}  ${f3(a.p50)}  ${f3(a.p90)}`
    + `   ${(a.flat * 100).toFixed(0)}%`);
}

// ---------------------------------------------------------------------------
// WHERE THE SPREAD COMES FROM — ablate each of the two terms that supply it.
// ---------------------------------------------------------------------------
console.log('\nWHICH TERM SUPPLIES THE SPREAD (16 blows — one wall at the shipped DIG_BASE = 8)');
console.log('arm                                slabs  mean tilt     sd    p90   within 10 deg of flat');
console.log('-'.repeat(96));
for (const [name, patch] of [
  ['SHIPPED                          ', null],
  ['pile-height slop pinned to bare  ', (d) => { d._pileAt = () => 0; }],
  ['no wall lean (dw gate disabled)  ', (d) => { const k = d._key.bind(d); d._key = k; d.__noLean = 1; }],
]) {
  const d = mk();
  if (name.startsWith('no wall lean')) {
    // the lean is gated on the piece carrying a wall plane; strip it at rest time
    const upd = d.update.bind(d);
    d.update = (dt) => {
      for (const kk in d.pools) {
        const p = d.pools[kk];
        for (let i = 0; i < p.per; i++) if (!p.rest[i]) { p.wnx[i] = 0; p.wnz[i] = 0; }
      }
      upd(dt);
    };
  } else if (patch) patch(d);
  dig(d, 16);
  const a = angles(d, 'slab');
  console.log(`${name} ${String(a.n).padStart(5)}  ${f3(a.mean).padStart(9)}  ${f3(a.sd)}  ${f3(a.p90)}   ${(a.flat * 100).toFixed(0)}%`);
}

console.log('\nnote: `restRot` for a slab is -PI/2 (lying on its face), so "tilt" is radians away');
console.log('      from flat. The reference wants pieces at every angle leaning on each other;');
console.log('      a high "within 10 deg of flat" share is the deck-of-cards failure.');
