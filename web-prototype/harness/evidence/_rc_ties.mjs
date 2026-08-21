/** _rc_ties — how many awards are decided by a tie broken on seat order? Probe. */
import { play } from './_rc_inv.mjs';
import { EVIL, GOOD } from '../../src/party/cast.js';
const N = Number(process.argv[2] || 170);
const runs = []; for (let i=0;i<N;i++) runs.push(play({castSeed:100+i*13, worldSeed:7+i*29}));
const byType = (log,t)=>log.filter(e=>e.type===t);
const stats = new Map();
const bump = (k,tied,elig)=>{ if(!stats.has(k)) stats.set(k,{n:0,ties:0,tieSize:0,elig:0}); const s=stats.get(k); s.n++; if(tied>1){s.ties++;} s.tieSize+=tied; s.elig+=elig; };
for (const r of runs) {
  const log=r.log, al=r.ctx.alignmentOf;
  const dealt = log.find(e=>e.type==='cast.deal').data.seats;
  const ids = dealt.map(s=>s.id);
  const noms=byType(log,'nom.made'), votes=byType(log,'vote.cast'), noise=byType(log,'noise.emitted');
  const good=ids.filter(i=>al(i)===GOOD), evil=ids.filter(i=>al(i)===EVIL);
  const topTie=(pool,score,dir)=>{ const s=pool.map(score); const best=dir>0?Math.max(...s):Math.min(...s); return s.filter(x=>x===best).length; };
  // Most Trusted (min)
  { const sc=id=>noms.filter(e=>e.data.target===id).length+votes.filter(e=>e.data.choice===id).length;
    bump('Most Trusted', topTie(good,sc,-1), good.filter(i=>sc(i)===0).length); }
  // The Mark (max votes)
  { const sc=id=>votes.filter(e=>e.data.choice===id).length; bump('The Mark', topTie(good,sc,1), good.length); }
  // Best Liar (min noms among evil)
  { const sc=id=>noms.filter(e=>e.data.target===id).length; bump('Best Liar', topTie(evil,sc,-1), evil.length); }
  // Loudest Robot (max loud)
  { const sc=id=>noise.filter(e=>e.data.causedBy===id).reduce((a,e)=>a+(e.data.loud||0),0);
    bump('Loudest Robot', topTie(ids,sc,1), ids.filter(i=>sc(i)>0).length); }
  // Dead Air (min acted)
  { const sc=id=>log.filter(e=>e.data&&(e.data.id===id||e.data.actor===id||e.data.nominator===id||e.data.voter===id||e.data.runner===id||e.data.guide===id)).length;
    bump('Dead Air', topTie(ids,sc,-1), ids.length); }
}
console.log(`=== ${N} games — is the winner a distinction, or a tie broken on seat order? ===`);
console.log('award             games with a TIE at the top   mean size of the tied set   mean eligible pool');
for (const [k,s] of stats)
  console.log(`  ${k.padEnd(16)} ${String(s.ties).padStart(3)}/${s.n} (${String(Math.round(100*s.ties/s.n)).padStart(3)}%)                  ${(s.tieSize/s.n).toFixed(2).padStart(5)}                     ${(s.elig/s.n).toFixed(2)}`);
console.log('\n(The tie-break is `Array.prototype.sort` stability over `dealt` order = SEAT NUMBER.');
console.log(' Every tied award is therefore won by the lowest-numbered seat in the tied set.)');

// Best Liar: how often does an evil player who WAS nominated still win?
let neverNom=0, tot=0;
for (const r of runs) { const log=r.log, al=r.ctx.alignmentOf;
  const noms=byType(log,'nom.made');
  const evil=log.find(e=>e.type==='cast.deal').data.seats.map(s=>s.id).filter(i=>al(i)===EVIL);
  const sc=id=>noms.filter(e=>e.data.target===id).length;
  const best=evil.slice().sort((a,b)=>sc(a)-sc(b))[0]; tot++; if(sc(best)===0) neverNom++; }
console.log(`\nBest Liar: "never once nominated" is literally true in ${neverNom}/${tot} games (${Math.round(100*neverNom/tot)}%).`);
console.log('  With 2 evil and a mean of', (runs.reduce((a,r)=>a+byType(r.log,'nom.made').length,0)/N).toFixed(1), 'nominations per game over 8 seats,');
console.log('  the award is mostly "the traitor the room happened not to point at".');
