/** _ru_probe4 — if the ledger's hunter rooms join revealSet, how much dictionary survives? */
import { play } from './_rc_inv.mjs';
let tot=0, surv=0, games=0, empty=0;
for(let i=0;i<60;i++){
  const r=play({castSeed:100+i*13,worldSeed:7+i*29});
  const log=r.log;
  const hunter=new Set(log.filter(e=>e.type==='hunter.placed').map(e=>e.data.room));
  // every string value in a PUBLIC entry, minus assertion-class types
  const pub=new Set();
  for(const e of log){ if(e.vis!=='PUBLIC') continue; if(e.type==='player.claim_set') continue;
    for(const v of Object.values(e.data||{})) if(typeof v==='string') pub.add(v); }
  const kept=[...hunter].filter(x=>!pub.has(x));
  games++; tot+=hunter.size; surv+=kept.length; if(!kept.length) empty++;
}
console.log(`${games} games · hunter rooms per game ${(tot/games).toFixed(2)} · surviving the PUBLIC subtraction ${(surv/games).toFixed(2)} · games where NOTHING survives: ${empty}/${games}`);
