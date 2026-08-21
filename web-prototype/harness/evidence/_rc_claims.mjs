import { play } from './_rc_inv.mjs';
const N=170; let changed=0, tot=0, multi=0, players=0;
for(let i=0;i<N;i++){const r=play({castSeed:100+i*13,worldSeed:7+i*29});
  const by=new Map();
  for(const e of r.log.filter(e=>e.type==='player.claim_set')){ if(!by.has(e.data.id))by.set(e.data.id,[]); by.get(e.data.id).push(e.data.claim);}
  tot++; for(const [id,cs] of by){players++; if(cs.length>1)multi++; if(new Set(cs).size>1)changed++;}
}
console.log(`${N} games · ${players} players who claimed anything`);
console.log(`  claimed more than once: ${multi} (${Math.round(100*multi/players)}%)`);
console.log(`  CHANGED their story:    ${changed} (${Math.round(100*changed/players)}%)`);
console.log('\nThe roll call keeps only the LAST claim. §7 beat 1 specs "true role beside final claim,');
console.log('WITH CLAIM HISTORY". The history is in the log; the reveal drops it.');
