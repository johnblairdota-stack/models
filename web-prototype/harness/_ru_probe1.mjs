/** _ru_probe1 — does a log-only misled derivation agree with session's own, event for event? */
import { play } from './_rc_inv.mjs';
let eps=0, agree=0, disagree=[], prowlNeq=0;
for (let i=0;i<120;i++){
  const r = play({castSeed:100+i*13, worldSeed:7+i*29});
  const log = r.log;
  // walk, windowing on hunter.placed .. expedition.ended
  let cur=null, placed=null, prowl=null, miss=false, said=null, target=null;
  const targets=new Map();
  for (const e of log){
    if (e.type==='expedition.announced') targets.set(e.data.episode, e.data.room);
    if (e.type==='call.said') said = e.data;
    if (e.type==='hunter.placed'){ cur=e.data.episode; placed=e.data.room; prowl=null; miss=false; }
    if (cur!=null && e.type==='noise.emitted' && e.data.sourceType==='PROWL') prowl=e.data.room;
    if (cur!=null && e.type==='task.miss' && e.data.kind==='call') miss=true;
    if (e.type==='expedition.ended'){
      const ep=e.data.episode; target=targets.get(ep);
      const graded = prowl ?? placed;
      if (prowl && prowl!==placed) prowlNeq++;
      const hunterHere = graded===target;
      const s = said && said.episode===ep ? said.said : null;
      const misled = s!=null && ((s==='CLEAR'&&hunterHere)||(s==='HOLD'&&!hunterHere));
      eps++;
      if (misled===miss) agree++; else if(disagree.length<5) disagree.push({game:i,ep,s,target,graded,hunterHere,misled,miss});
      cur=null;
    }
  }
}
console.log(`episodes ${eps} · ledger misled agrees with task.miss{kind:call}: ${agree}/${eps}`);
console.log('PROWL room != hunter.placed room:', prowlNeq);
if (disagree.length) console.log('disagreements:', JSON.stringify(disagree,null,1));
