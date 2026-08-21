/** _ru_probe2 — does a turnout-based Dead Air stop being a death detector? */
import { play } from './_rc_inv.mjs';
const N=170; const runs=[]; for(let i=0;i<N;i++) runs.push(play({castSeed:100+i*13,worldSeed:7+i*29}));
const NO_ONE='NO_ONE';
function stats(pickFn,label){
  let dead=0,first=0,tot=0,coll=0;
  for(const r of runs){
    const log=r.log, ids=r.s.truth().seats.map(s=>s.id);
    const w=pickFn(log,ids);
    const deaths=log.filter(e=>e.type==='player.taken'||e.type==='player.executed').map(e=>e.data.id);
    const noise=log.filter(e=>e.type==='noise.emitted');
    const loud=id=>noise.filter(e=>e.data.causedBy===id).reduce((a,e)=>a+(e.data.loud||0),0);
    const lr=ids.slice().sort((a,b)=>loud(b)-loud(a))[0];
    if(w==null) continue;
    tot++; if(deaths.includes(w))dead++; if(deaths[0]===w)first++; if(loud(lr)>0&&lr===w)coll++;
  }
  console.log(`${label.padEnd(34)} winner had died ${String(Math.round(100*dead/tot)).padStart(3)}%  · was FIRST death ${String(Math.round(100*first/tot)).padStart(3)}%  · == Loudest Robot ${String(Math.round(100*coll/tot)).padStart(3)}%   (${tot} games)`);
}
const shipped=(log,ids)=>{const acted=id=>log.filter(e=>e.data&&(e.data.id===id||e.data.actor===id||e.data.nominator===id||e.data.voter===id||e.data.runner===id||e.data.guide===id)).length;return ids.slice().sort((a,b)=>acted(a)-acted(b))[0];};
const widened=(log,ids)=>{const acted=id=>log.filter(e=>e.data&&Object.values(e.data).includes(id)).length;return ids.slice().sort((a,b)=>acted(a)-acted(b))[0];};
function turnout(log,ids,minFrac){
  const chances=id=>1+log.filter(e=>e.type==='vote.cast'&&e.data.voter===id).length;
  const spoke=id=>log.filter(e=>(e.type==='player.claim_set'&&e.data.id===id)
    ||(e.type==='nom.made'&&e.data.nominator===id)
    ||(e.type==='vote.cast'&&e.data.voter===id&&e.data.choice!==NO_ONE&&e.data.choice!=null)).length;
  const maxC=Math.max(...ids.map(chances));
  const pool=ids.filter(id=>chances(id)>=Math.ceil(maxC*minFrac));
  if(!pool.length) return null;
  const rate=id=>spoke(id)/chances(id);
  return pool.slice().sort((a,b)=>rate(a)-rate(b))[0];
}
stats(shipped,'shipped acted() (6 fields)');
stats(widened,'acted() widened to every value');
stats((l,i)=>turnout(l,i,0),'turnout rate, everyone eligible');
stats((l,i)=>turnout(l,i,0.5),'turnout rate, >=50% of max chances');
stats((l,i)=>turnout(l,i,1.0),'turnout rate, full-game survivors only');
// how much does the widened acted() differ in raw counts?
const r=runs[0], log=r.log, ids=r.s.truth().seats.map(s=>s.id);
console.log('\nper-player event counts, game 0:');
for(const id of ids){
  const a=log.filter(e=>e.data&&(e.data.id===id||e.data.actor===id||e.data.nominator===id||e.data.voter===id||e.data.runner===id||e.data.guide===id)).length;
  const b=log.filter(e=>e.data&&Object.values(e.data).includes(id)).length;
  console.log(`  ${id}: shipped ${String(a).padStart(3)}  widened ${String(b).padStart(3)}  undercount ${(100*(1-a/b)).toFixed(0)}%`);
}
