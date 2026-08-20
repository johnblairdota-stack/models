#!/usr/bin/env node
/** _econ6_signal — throwaway. Is the ONLY evidence in the game (a failed expedition) informative? */
import { createRoom } from '../src/party/room.js';
import { tallyCasting } from '../src/party/ballot.js';
import { EPISODE_CAP } from '../src/party/phases.js';
import { OUTCOME } from '../src/party/win.js';
import { ROOMS, coveredRooms } from '../src/party/coverage.js';
import { blindStrip } from '../src/party/darkrun.js';
import { castBallot, nominate, vote, willLie, spikesThisEpisode, chance } from '../src/party/policy.js';
const BLIND = Math.min(1, blindStrip(4.80, 70) / 8.0);
const SEEDS = Number(process.env.SEEDS || 600);
const guides = [];  // { evil, failed, count, ep }
for (const count of [4,5,6,7,8]) for (const [gp,evp] of [['naive-good','patient-evil'],['cautious-good','patient-evil'],['naive-good','aggressive-evil'],['cautious-good','aggressive-evil']]) for (let seed=0; seed<SEEDS; seed++){
  const r = createRoom({count, castSeed: seed*977+count, worldSeed: seed+1, send:()=>{}, emit:()=>{}});
  r.start();
  const align=Object.fromEntries(r.deal.seats.map((s)=>[s.id,s.alignment]));
  const evilSet=new Set(r.deal.evil); const pol=(id)=>(align[id]==='evil'?evp:gp); const suspicion={};
  for(let ep=1; ep<=EPISODE_CAP; ep++){
    if(r.state.outcome && r.state.outcome!==OUTCOME.RENEWED)break;
    const living=r.state.players.filter((p)=>p.alive).map((p)=>p.id); if(living.length<2)break;
    const ballots=living.map((id)=>castBallot({policy:pol(id),self:id,living,history:r.state.history,seed,ep}));
    const pair=tallyCasting({ballots,living,history:r.state.history,lastPair:r.state.lastPair,ep,matchSeed:seed+1});
    const seatedEvil=living.filter((id)=>evilSet.has(id)&&id!==pair.runner&&id!==pair.guide);
    const spikers=seatedEvil.filter((id)=>spikesThisEpisode({policy:evp,seed,ep,self:id}));
    const covered=coveredRooms(seed+1, r.state.cameras.unlocked);
    let hunter=ROOMS[Math.floor(chance(seed,`h${ep}`)*ROOMS.length)], runner='hall', taken=false;
    for(let turn=0;turn<4&&!taken;turn++){
      const hadSignal=covered.has(hunter)&&!(chance(seed,`strip${ep}${turn}`)<BLIND);
      const lied=willLie({policy:pol(pair.guide),hadSignal,seed,salt:`${ep}:${turn}`});
      const hw=!lied&&!hadSignal&&chance(seed,`guess${ep}${turn}`)<0.5;
      const wrong=lied||hw;
      const wt=ROOMS[Math.floor(chance(seed,`mv${ep}${turn}`)*ROOMS.length)];
      runner=wrong&&chance(seed,`meet${ep}${turn}`)<0.5?hunter:wt;
      hunter=(spikers.length>0&&turn===1)?runner:ROOMS[Math.floor(chance(seed,`hw${ep}${turn}`)*ROOMS.length)];
      if(hunter===runner) taken=chance(seed,`kill${ep}${turn}`)<0.55;
    }
    guides.push({ evil: evilSet.has(pair.guide), failed: taken, count, ep, living: living.length,
      livingEvil: living.filter((id)=>evilSet.has(id)).length });
    if(taken) suspicion[pair.guide]=(suspicion[pair.guide]??0)+1;
    const noms=[]; for(const id of living){ if(noms.length>=3)break; const nn=nominate({policy:pol(id),self:id,living,suspicion,seed,ep});
      if(nn&&!noms.some((x)=>x.nominator===nn.nominator||x.target===nn.target)&&nn.target!==nn.nominator)noms.push(nn); }
    const standing=noms.map((nn)=>nn.target);
    const votes=Object.fromEntries(living.map((id)=>[id,vote({policy:pol(id),self:id,standing,suspicion,evilSet,seed,ep})]));
    r.playEpisode({ballots,takeRunner:taken,nominations:noms,votes,hunterRoom:ROOMS[0]});
  }
}
const pct=(x)=>(x*100).toFixed(1)+'%';
console.log(`PROBE _econ6_signal · ${guides.length.toLocaleString()} guide-episodes (room.js + party-sim's expedition model)\n`);
console.log('=== THE GAME\'S ONLY MECHANICAL EVIDENCE: "the expedition you guided failed" ===');
console.log('  count │ P(guide is Production | expedition FAILED) │ P(guide is Production | SURVIVED) │ base rate │ lift');
for(const c of [4,5,6,7,8]){
  const s=guides.filter((g)=>g.count===c);
  const f=s.filter((g)=>g.failed), ok=s.filter((g)=>!g.failed);
  const base=s.reduce((a,g)=>a+g.livingEvil/g.living,0)/s.length;
  const pf=f.filter((g)=>g.evil).length/f.length, po=ok.filter((g)=>g.evil).length/ok.length;
  console.log(`  ${String(c).padStart(5)} │ ${pct(pf).padStart(42)} │ ${pct(po).padStart(33)} │ ${pct(base).padStart(9)} │ ${((pf-base)*100).toFixed(1)}pp`);
}
const f=guides.filter((g)=>g.failed);
console.log(`\n  overall: failed-expedition guide is Production ${pct(f.filter((g)=>g.evil).length/f.length)} of the time `
  + `vs base rate ${pct(guides.reduce((a,g)=>a+g.livingEvil/g.living,0)/guides.length)} (n=${f.length.toLocaleString()} failures)`);
