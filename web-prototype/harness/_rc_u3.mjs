/** _rc_u3 — what U3 actually certifies. Probe. */
import { play } from './_rc_inv.mjs';
import { awards } from '../src/party/reunion.js';
const r = play({ castSeed: 100, worldSeed: 7 });
const log = r.log;
const only = log.slice(0, 1);      // nothing ever happened but the deal
console.log('A log containing ONE entry (cast.deal) and nothing else:');
for (const a of awards(only, r.ctx))
  console.log(`  GRANTED "${a.award}" to ${a.winner} — "${a.why}"  querySeq=${JSON.stringify(a.querySeq)}`);
const seqs = new Set(only.map(e=>e.seq));
console.log('  U3 verdict: every querySeq resolves in the log →',
  awards(only, r.ctx).every(a=>a.querySeq.length && a.querySeq.every(s=>seqs.has(s))));
console.log('\nAnd in the full game, what does each querySeq CITE (by type)?');
const t = new Map(log.map(e=>[e.seq, e.type]));
for (const a of awards(log, r.ctx)) {
  const kinds = new Map();
  for (const s of a.querySeq) kinds.set(t.get(s), (kinds.get(t.get(s))||0)+1);
  console.log(`  ${a.award.padEnd(15)} → ${[...kinds].map(([k,v])=>k+'×'+v).join(', ')}`);
}
