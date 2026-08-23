#!/usr/bin/env node
/**
 * _cy1-edge — PR B: inter-room dig has no cyan end-state; envelope dig retains the barrier.
 *
 *   node harness/_cy1-edge.mjs
 *
 * Headless against the shipped `DamageField` and `dig.js` tables. No browser.
 * Party-warm W16 covers the THREE-free policy (`dig-policy.js`); this file is the
 * grid + edge-table half.
 */

import { DamageField, OPEN_AT } from '../src/destruction/damagefield.js';
import {
  DIG_EDGES, freePanels, digEdges, interiorEdges, envDigTable,
} from '../src/game/dig.js';
import { leftoverRuns, barrierFillForEdge } from '../src/game/dig-policy.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}${detail ? ` · ${detail}` : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ` · ${detail}` : ''}`); }
};

/** A body channel needs ~0.68 m from step height to 1.70 m. Walk a column of blows. */
const smashThrough = (f) => {
  const vs = [0.20, 0.35, 0.50, 0.65, 0.80];
  for (const v of vs) {
    for (let i = 0; i < 8; i++) f.applyHit(0.50, v, 1);
  }
  return f;
};

console.log('\n_cy1-edge — envelope cyan, inter-room open-through\n');

{
  const occupied = [[3, 7]];
  const left = leftoverRuns(0, 10, occupied, 0);
  ok('P0 leftoverRuns splits a side around a neighbour',
    left.length === 2 && Math.abs(left[0][1] - 3) < 1e-9 && Math.abs(left[1][0] - 7) < 1e-9,
    JSON.stringify(left));
  ok('P0b a fully shared side leaves nothing',
    leftoverRuns(0, 10, [[0, 10]]).length === 0);
  ok('P0c barrierFillForEdge is 1 only on envelope',
    barrierFillForEdge({ envelope: true }) === 1
    && barrierFillForEdge({ envelope: false }) === 0
    && barrierFillForEdge({}) === 0);
}

{
  const interior = interiorEdges();
  const all = digEdges();
  const env = envDigTable().edges;
  ok('C1 authored DIG_EDGES are all interior (no envelope flag)',
    DIG_EDGES.every((e) => !e.envelope) && interior === DIG_EDGES);
  ok('C2 envelope rows are appended, never inserted — interior ids unchanged',
    all.slice(0, interior.length).every((e, i) => e === interior[i] || e.id === interior[i].id)
    && env.every((e) => e.envelope && /^env\d+$/.test(e.id)));
  ok('C3 every envelope edge faces outside on exactly one side',
    env.length > 0 && env.every((e) => (e.a === 'outside') !== (e.b === 'outside')),
    `${env.length} envelope edges`);
  const envFaces = freePanels(env);
  ok('C4 envelope free faces are one-sided and marked envelope',
    envFaces.length > 0
    && envFaces.every((p) => p.envelope && p.a !== 'outside' && (p.b === 'outside' || p.a)),
    `${envFaces.length} faces`);
  const interFaces = freePanels(interior);
  ok('C5 interior free faces are two-sided and not envelope',
    interFaces.length > 0 && interFaces.every((p) => !p.envelope)
    && interFaces.filter((p) => p.side === 'a').length === interFaces.filter((p) => p.side === 'b').length,
    `${interFaces.length} faces`);
}

{
  const f = new DamageField({ width: 5.72, height: 2.80, barrier: 0 });
  smashThrough(f);
  let barr = 0;
  for (let i = 0; i < f.barrier.length; i++) if (f.barrier[i]) barr++;
  const ch = f.channel();
  ok('I1 inter-room field (G=0): smash reaches OPEN_AT',
    f.maxDepth >= OPEN_AT, `maxDepth ${f.maxDepth.toFixed(3)}`);
  ok('I2 …and there is no cyan left to stop a body',
    barr === 0 && ch.open === true, `barrierCells ${barr} · open ${ch.open}`);
}

{
  const f = new DamageField({ width: 5.72, height: 2.80, barrier: 1 });
  smashThrough(f);
  let barr = 0;
  for (let i = 0; i < f.barrier.length; i++) if (f.barrier[i]) barr++;
  const ch = f.channel();
  ok('E1 envelope field (G=1): smash still eats the white',
    f.maxDepth >= OPEN_AT, `maxDepth ${f.maxDepth.toFixed(3)}`);
  ok('E2 …but the cyan stays and the channel does not open',
    barr === f.barrier.length && ch.open === false,
    `barrierCells ${barr}/${f.barrier.length} · open ${ch.open}`);
}

{
  const d = new DamageField({ width: 2.0, height: 2.0 });
  let barr = 0;
  for (let i = 0; i < d.barrier.length; i++) if (d.barrier[i]) barr++;
  ok('X1 constructor default is still G=1 — furniture smash fields must not silently open',
    barr === d.barrier.length, `${barr}/${d.barrier.length}`);
}

console.log(`\n_cy1-edge: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
