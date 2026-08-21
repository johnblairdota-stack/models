/** _rc_awards — do the awards discriminate? And do they collide? Probe. */
import { play } from './_rc_inv.mjs';
import { awards, rollCall, decisiveEpisode } from '../../src/party/reunion.js';

const N = Number(process.argv[2] || 170);
const runs = [];
for (let i = 0; i < N; i++) runs.push(play({ castSeed: 100 + i * 13, worldSeed: 7 + i * 29 }));

const NAMES = ['Most Trusted','The Mark','Best Liar','Loudest Robot','Cold Blood','Dead Air'];
const fires = new Map(NAMES.map((n)=>[n,0]));
const winners = new Map(NAMES.map((n)=>[n,new Map()]));
const collide = new Map();
let totalAwards = 0;
const whyLen = [];
const rawIdInWhy = new Map();

for (const r of runs) {
  const A = awards(r.log, r.ctx);
  totalAwards += A.length;
  const seen = new Map();
  for (const a of A) {
    fires.set(a.award, (fires.get(a.award)||0)+1);
    const w = winners.get(a.award); w.set(a.winner, (w.get(a.winner)||0)+1);
    seen.set(a.award, a.winner);
    whyLen.push(a.why.length);
    if (/\bp\d+\b/.test(a.why)) rawIdInWhy.set(a.award, (rawIdInWhy.get(a.award)||0)+1);
  }
  // pairwise collisions
  const es = [...seen.entries()];
  for (let i=0;i<es.length;i++) for (let j=i+1;j<es.length;j++) {
    if (es[i][1] === es[j][1]) { const k = es[i][0]+' == '+es[j][0]; collide.set(k,(collide.get(k)||0)+1); }
  }
}
console.log(`=== ${N} REAL GAMES (session.js), ${totalAwards} awards granted, ${(totalAwards/N).toFixed(2)}/game\n`);
console.log('award             fires      distinct winners   top winner share   entropy(bits)');
for (const n of NAMES) {
  const f = fires.get(n), w = winners.get(n);
  if (!f) { console.log(`  ${n.padEnd(16)} 0/${N}`); continue; }
  const counts = [...w.values()].sort((a,b)=>b-a);
  const top = counts[0]/f;
  const H = -counts.reduce((a,c)=>a + (c/f)*Math.log2(c/f), 0);
  console.log(`  ${n.padEnd(16)} ${String(f).padStart(3)}/${N} (${(100*f/N).toFixed(0).padStart(3)}%)   ${String(w.size).padStart(2)} of 8 seats      ${(100*top).toFixed(0).padStart(3)}%              ${H.toFixed(2)}  (max 3.00)`);
}
console.log('\n--- SAME PLAYER WINS BOTH (per game) ---');
for (const [k,v] of [...collide].sort((a,b)=>b[1]-a[1])) console.log(`  ${String(v).padStart(3)}/${N}  (${(100*v/N).toFixed(0).padStart(3)}%)  ${k}`);

console.log('\n--- querySeq: how much evidence does each award cite? ---');
const qs = new Map();
for (const r of runs) for (const a of awards(r.log, r.ctx)) {
  if (!qs.has(a.award)) qs.set(a.award, []);
  qs.get(a.award).push(a.querySeq.length);
}
for (const n of NAMES) { const v = qs.get(n); if (!v) continue;
  const mean = v.reduce((a,b)=>a+b,0)/v.length;
  console.log(`  ${n.padEnd(16)} mean ${mean.toFixed(1)} seqs cited, min ${Math.min(...v)}, max ${Math.max(...v)}`); }

console.log('\n--- raw player ids printed in `why` (what the TV renders verbatim) ---');
for (const [k,v] of rawIdInWhy) console.log(`  ${k}: ${v}/${N} games print a raw pN id`);
const sample = awards(runs[0].log, runs[0].ctx);
console.log('\nSAMPLE (game 0):');
for (const a of sample) console.log(`  ${a.award.padEnd(15)} ${a.winner}  "${a.why}"  [${a.querySeq.length} seqs]`);
