/** _rc_draft — the Reunion as it could be TODAY, from facts already sealed. Probe. */
import { play } from './_rc_inv.mjs';
import { SCRIPT } from '../src/party/roles.js';
const N=60; let best=null;
for(let i=0;i<N;i++){ const r=play({castSeed:100+i*13,worldSeed:7+i*29});
  const takes=r.log.filter(e=>e.type==='player.taken').length;
  const exe=r.log.filter(e=>e.type==='player.executed').length;
  const wrong=(()=>{const s=new Map(),h=new Map(),t=new Map();let w=0;
    for(const e of r.log){if(e.type==='call.said')s.set(e.data.episode,e.data);if(e.type==='hunter.placed')h.set(e.data.episode,e.data.room);if(e.type==='expedition.announced')t.set(e.data.episode,e.data.room);}
    for(const[ep,c]of s){const hh=h.get(ep)===t.get(ep); if((c.said==='CLEAR'&&hh)||(c.said==='HOLD'&&!hh))w++;} return w;})();
  const goodOnGood=r.log.filter(e=>e.type==='player.executed').filter(e=>r.ctx.alignmentOf(e.data.executioner)==='good'&&r.ctx.alignmentOf(e.data.id)==='good').length;
  const sc=takes*3+exe+wrong+goodOnGood*2;
  if(!best||sc>best.sc) best={r,sc,i};
}
const {r,i}=best;
console.log(`# chosen game: castSeed ${100+i*13}, worldSeed ${7+i*29} · ${r.log.length} entries · ${r.s.state.outcome}\n`);
const nm=Object.fromEntries(r.s.state.players.map(p=>[p.id,p.name||p.id]));
const N_=id=>nm[id]||id;
const RN=k=>(SCRIPT[k]&&SCRIPT[k].name)||k;
const seats=r.log.find(e=>e.type==='cast.deal').data.seats;
const log=r.log;
const say=new Map(),hunt=new Map(),tgt=new Map(),out=new Map(),pair=new Map();
for(const e of log){const d=e.data;
  if(e.type==='call.said')say.set(d.episode,d);
  if(e.type==='hunter.placed')hunt.set(d.episode,d.room);
  if(e.type==='expedition.announced')tgt.set(d.episode,d.room);
  if(e.type==='expedition.ended')out.set(d.episode,d);
  if(e.type==='expedition.begun')pair.set(d.episode,d);}

console.log('BEAT 2 — THE EPISODE LEDGER (every fact below is SEALED in the log today)');
console.log('ep  guide      said   target     hunter was  verdict            runner');
for(const ep of [...tgt.keys()].sort()){
  const c=say.get(ep), hh=hunt.get(ep)===tgt.get(ep), o=out.get(ep)||{}, p=pair.get(ep)||{};
  const mis=c?((c.said==='CLEAR'&&hh)||(c.said==='HOLD'&&!hh)):null;
  console.log(`${String(ep).padStart(2)}  ${N_(p.guide).padEnd(10)} ${String(c&&c.said).padEnd(6)} ${String(tgt.get(ep)).padEnd(10)} ${String(hunt.get(ep)).padEnd(11)} ${(mis?'*** WRONG ***':'right       ').padEnd(18)} ${N_(p.runner)} ${o.move} → ${o.outcome}`);
}
console.log('\nBEAT 1 — ROLL CALL');
for(const s of seats){
  const claim=[...log].reverse().find(e=>e.type==='player.claim_set'&&e.data.id===s.id);
  const d=log.find(e=>(e.type==='player.taken'||e.type==='player.executed')&&e.data.id===s.id);
  let line=`  ${N_(s.id).padEnd(9)} ${RN(s.role).padEnd(18)} ${s.alignment.toUpperCase().padEnd(5)}`;
  line+=` claimed "${claim?claim.data.claim:'nothing'}"`;
  if(s.cover) line+=` · was told they were the ${RN(s.cover)}`;
  if(d) line+= d.type==='player.taken' ? ' · TAKEN' : ` · SLEDGEHAMMERED by ${N_(d.data.executioner)}`;
  console.log(line);
}
console.log('\nTHE THING NOBODY SAYS:');
const ex=log.filter(e=>e.type==='player.executed');
const gg=ex.filter(e=>r.ctx.alignmentOf(e.data.executioner)==='good'&&r.ctx.alignmentOf(e.data.id)==='good');
console.log(`  ${gg.length} of ${ex.length} executions were the crew killing the crew:`);
for(const e of gg) console.log(`    ${N_(e.data.executioner)} (good) swung on ${N_(e.data.id)} (good)`);
const fed=log.filter(e=>e.type==='win.checked').pop().data;
console.log(`  the feed count finished at ${fed.fed} · cameras ${fed.camerasLit} · rule ${fed.rule}`);
const noise=log.filter(e=>e.type==='noise.emitted');
console.log(`  ${noise.filter(e=>!e.data.causedBy).length} of ${noise.length} incidents were nobody's — the Hunter, alone, on its own schedule.`);
