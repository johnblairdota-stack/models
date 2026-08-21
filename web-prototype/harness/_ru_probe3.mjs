/** _ru_probe3 — does the §7.1 cast.pair tiebreak actually resolve the ties? */
import { play } from './_rc_inv.mjs';
import { EVIL, GOOD } from '../src/party/cast.js';
const N=170; const runs=[]; for(let i=0;i<N;i++) runs.push(play({castSeed:100+i*13,worldSeed:7+i*29}));
const byType=(l,t)=>l.filter(e=>e.type===t);
const S=new Map();
const bump=(k,tied,after)=>{if(!S.has(k))S.set(k,{n:0,t:0,a:0});const s=S.get(k);s.n++;if(tied>1)s.t++;if(after>1)s.a++;};
for(const r of runs){
  const log=r.log, al=r.ctx.alignmentOf;
  const ids=log.find(e=>e.type==='cast.deal').data.seats.map(s=>s.id);
  const noms=byType(log,'nom.made'),votes=byType(log,'vote.cast'),noise=byType(log,'noise.emitted');
  const pairs=byType(log,'cast.pair');
  const pc=id=>pairs.filter(e=>e.data.runner===id||e.data.guide===id).length;
  const good=ids.filter(i=>al(i)===GOOD), evil=ids.filter(i=>al(i)===EVIL);
  const ends=byType(log,'expedition.ended');
  const deathSeq=id=>{const e=log.find(x=>(x.type==='player.taken'||x.type==='player.executed')&&x.data.id===id);return e?e.seq:Infinity;};
  const epsAlive=id=>ends.filter(e=>e.seq<=deathSeq(id)).length;
  const go=(k,pool,score,dir)=>{ if(!pool.length)return; const v=pool.map(score);
    const best=dir>0?Math.max(...v):Math.min(...v);
    const tied=pool.filter((id,i)=>v[i]===best);
    const p=Math.max(...tied.map(pc)); const still=tied.filter(id=>pc(id)===p);
    bump(k,tied.length,still.length); };
  go('Most Trusted',good,id=>noms.filter(e=>e.data.target===id).length+votes.filter(e=>e.data.choice===id).length,-1);
  go('The Mark',good,id=>votes.filter(e=>e.data.choice===id).length,1);
  go('Best Liar (shipped: min noms)',evil,id=>noms.filter(e=>e.data.target===id).length,-1);
  go('Best Liar (§7.1: alive-noms)',evil,id=>epsAlive(id)-noms.filter(e=>e.data.target===id).length,1);
  go('Loudest Robot',ids.filter(i=>noise.some(e=>e.data.causedBy===i)),id=>noise.filter(e=>e.data.causedBy===id).reduce((a,e)=>a+(e.data.loud||0),0),1);
  { const chances=id=>1+votes.filter(e=>e.data.voter===id).length;
    const spoke=id=>log.filter(e=>(e.type==='player.claim_set'&&e.data.id===id)||(e.type==='nom.made'&&e.data.nominator===id)||(e.type==='vote.cast'&&e.data.voter===id&&e.data.choice!=='NO_ONE'&&e.data.choice!=null)).length;
    const mx=Math.max(...ids.map(chances)); const pool=ids.filter(i=>chances(i)===mx);
    go('Dead Air (turnout, full pool)',pool,id=>spoke(id)/chances(id),-1); }
}
console.log(`${N} games · ties at the top, before and after the §7.1 cast.pair tiebreak`);
console.log('award                             tie before      tie still unresolved after');
for(const [k,s] of S) console.log(`  ${k.padEnd(30)} ${String(Math.round(100*s.t/s.n)).padStart(3)}% (${s.t}/${s.n})     ${String(Math.round(100*s.a/s.n)).padStart(3)}% (${s.a}/${s.n})`);
