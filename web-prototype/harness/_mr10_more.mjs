import { play, POLICIES } from './_mr8_full.mjs';
import { room, EXP, MOVE, HUNTER_SPEED, DETENT } from './_mr2_sim.mjs';
const WINGS = ['gallery','ballroom','study_w','study_e','service'];
const SEEDS = [1,2,3,5,7,11,13,17,19,23];

console.log('=== D. how much clock does the longest legal route need? ===');
console.log(`  travel budget over 90 s:  CREEP ${(0.90*90).toFixed(0)} m · WALK ${(MOVE.walk*90).toFixed(0)} m · RUN ${(MOVE.run*90).toFixed(0)} m`);
console.log('  longest reachable route (spawn -> terminal, via portals) = 33.4 m (gallery)');
for (const d of DETENT) if (d.speed>0) console.log(`   ${d.name.padEnd(6)} ${d.speed.toFixed(2)} m/s -> 33.4 m in ${(33.4/d.speed).toFixed(1)} s = ${(100*33.4/d.speed/90).toFixed(0)}% of the clock; slack x${(d.speed*90/33.4).toFixed(1)}`);

console.log('\n=== E. does the Hunter ever wake? (shipped ladder policy, 10 seeds/wing) ===');
for (const w of WINGS) {
  const rs = SEEDS.map((s) => play({ wing: w, seed: s, policy: POLICIES.ladder }));
  const woke = rs.filter(r=>r.firstNonPatrol!=null).length;
  const agg = {}; for (const r of rs) for (const k in r.st) agg[k]=(agg[k]||0)+r.st[k];
  const tot = Object.values(agg).reduce((a,b)=>a+b,0);
  const pct = Object.entries(agg).map(([k,v])=>`${k} ${(100*v/tot).toFixed(0)}%`).join(' ');
  console.log(`  ${w.padEnd(9)} woke in ${woke}/10 runs · state airtime: ${pct}`);
}

console.log('\n=== F. THE BUS ABLATION — expedition.js puts the runner BODY on the NoiseBus; game.js does not ===');
for (const w of WINGS) {
  for (const pn of ['CREEP','WALK']) {
    const on  = SEEDS.map((s)=>play({wing:w,seed:s,policy:POLICIES[pn],busEmit:true}));
    const off = SEEDS.map((s)=>play({wing:w,seed:s,policy:POLICIES[pn],busEmit:false}));
    const f = (rs)=>`${rs.filter(r=>r.outcome==='taken').length} taken, wake ${rs.filter(r=>r.firstNonPatrol!=null).length}/10, minSep ${(rs.reduce((a,r)=>a+Math.min(r.minSep,99),0)/rs.length).toFixed(1)}`;
    console.log(`  ${w.padEnd(9)} ${pn.padEnd(6)} bus ON:  ${f(on)}   |   bus OFF: ${f(off)}`);
  }
}
