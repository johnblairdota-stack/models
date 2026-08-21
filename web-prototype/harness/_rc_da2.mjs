/** _rc_da2 — is Dead Air just "died first"? Is Loudest Robot just "was the runner"? Probe. */
import { play } from './_rc_inv.mjs';
import { awards } from '../src/party/reunion.js';
const N=170; const runs=[]; for(let i=0;i<N;i++) runs.push(play({castSeed:100+i*13,worldSeed:7+i*29}));
let daDead=0, daFirstDead=0, tot=0, lrRunner=0, lrTot=0, lrTaken=0, both=0;
for(const r of runs){
  const A=awards(r.log,r.ctx);
  const da=A.find(a=>a.award==='Dead Air'), lr=A.find(a=>a.award==='Loudest Robot');
  const deaths=r.log.filter(e=>e.type==='player.taken'||e.type==='player.executed').map(e=>e.data.id);
  const runners=new Set(r.log.filter(e=>e.type==='expedition.begun').map(e=>e.data.runner));
  if(da){tot++; if(deaths.includes(da.winner))daDead++; if(deaths[0]===da.winner)daFirstDead++;}
  if(lr){lrTot++; if(runners.has(lr.winner))lrRunner++; if(deaths.includes(lr.winner))lrTaken++;}
  if(da&&lr&&da.winner===lr.winner)both++;
}
console.log(`Dead Air winner had already died: ${daDead}/${tot} (${Math.round(100*daDead/tot)}%)`);
console.log(`Dead Air winner was the FIRST to die: ${daFirstDead}/${tot} (${Math.round(100*daFirstDead/tot)}%)`);
console.log(`Loudest Robot winner was cast as runner: ${lrRunner}/${lrTot} (${Math.round(100*lrRunner/lrTot)}%)`);
console.log(`Loudest Robot winner also died:        ${lrTaken}/${lrTot} (${Math.round(100*lrTaken/lrTot)}%)`);
console.log(`Loudest Robot == Dead Air (same person): ${both}/${N} (${Math.round(100*both/N)}%)`);
console.log('\n→ "the design\'s own warning light" for quiet players is measuring who was killed,');
console.log('  not who was quiet. It is a death detector wearing a participation ribbon.');
