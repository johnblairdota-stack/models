#!/usr/bin/env node
/** _econ7_ablate — throwaway. Cross the policies to find WHICH side's competence loses good the game. */
import { createRoom } from '../src/party/room.js';
import { tallyCasting } from '../src/party/ballot.js';
import { EPISODE_CAP } from '../src/party/phases.js';
import { OUTCOME } from '../src/party/win.js';
import { ROOMS, coveredRooms } from '../src/party/coverage.js';
import { blindStrip } from '../src/party/darkrun.js';
import { castBallot, nominate, vote, willLie, spikesThisEpisode, chance } from '../src/party/policy.js';
const BLIND = Math.min(1, blindStrip(4.80, 70) / 8.0);
const SEEDS = Number(process.env.SEEDS || 400);
function play({count,seed,gp,evp}){
  const r=createRoom({count,castSeed:seed*977+count,worldSeed:seed+1,send:()=>{},emit:()=>{}}); r.start();
  const align=Object.fromEntries(r.deal.seats.map((s)=>[s.id,s.alignment])); const evilSet=new Set(r.deal.evil);
  const pol=(id)=>(align[id]==='evil'?evp:gp); const suspicion={};
  for(let ep=1;ep<=EPISODE_CAP;ep++){
    if(r.state.outcome&&r.state.outcome!==OUTCOME.RENEWED)break;
    const living=r.state.players.filter((p)=>p.alive).map((p)=>p.id); if(living.length<2)break;
    const ballots=living.map((id)=>castBallot({policy:pol(id),self:id,living,history:r.state.history,seed,ep}));
    const pair=tallyCasting({ballots,living,history:r.state.history,lastPair:r.state.lastPair,ep,matchSeed:seed+1});
    const spikers=living.filter((id)=>evilSet.has(id)&&id!==pair.runner&&id!==pair.guide).filter((id)=>spikesThisEpisode({policy:evp,seed,ep,self:id}));
    const covered=coveredRooms(seed+1,r.state.cameras.unlocked);
    let hunter=ROOMS[Math.floor(chance(seed,`h${ep}`)*ROOMS.length)],runner='hall',taken=false;
    for(let t=0;t<4&&!taken;t++){
      const hs=covered.has(hunter)&&!(chance(seed,`strip${ep}${t}`)<BLIND);
      const lied=willLie({policy:pol(pair.guide),hadSignal:hs,seed,salt:`${ep}:${t}`});
      const hw=!lied&&!hs&&chance(seed,`guess${ep}${t}`)<0.5;
      const wt=ROOMS[Math.floor(chance(seed,`mv${ep}${t}`)*ROOMS.length)];
      runner=(lied||hw)&&chance(seed,`meet${ep}${t}`)<0.5?hunter:wt;
      hunter=(spikers.length>0&&t===1)?runner:ROOMS[Math.floor(chance(seed,`hw${ep}${t}`)*ROOMS.length)];
      if(hunter===runner)taken=chance(seed,`kill${ep}${t}`)<0.55;
    }
    if(taken)suspicion[pair.guide]=(suspicion[pair.guide]??0)+1;
    const noms=[]; for(const id of living){if(noms.length>=3)break;const nn=nominate({policy:pol(id),self:id,living,suspicion,seed,ep});
      if(nn&&!noms.some((x)=>x.nominator===nn.nominator||x.target===nn.target)&&nn.target!==nn.nominator)noms.push(nn);}
    const standing=noms.map((nn)=>nn.target);
    const votes=Object.fromEntries(living.map((id)=>[id,vote({policy:pol(id),self:id,standing,suspicion,evilSet,seed,ep})]));
    r.playEpisode({ballots,takeRunner:taken,nominations:noms,votes,hunterRoom:ROOMS[0]});
  }
  return r.state.outcome===OUTCOME.FINALE;
}
const GP=['naive-good','cautious-good','scatter'], EV=['patient-evil','aggressive-evil','scatter'];
console.log(`PROBE _econ7_ablate · good win rate, ${SEEDS} seeds/cell (room.js + party-sim expedition model)\n`);
console.log('  good policy \\ evil policy │ ' + EV.map((e)=>e.padStart(16)).join(' │ '));
for(const c of [4,8]){
  console.log(`  --- ${c} players ---`);
  for(const gp of GP){
    const cells=EV.map((evp)=>{let w=0;for(let s=0;s<SEEDS;s++)if(play({count:c,seed:s,gp,evp}))w++;return ((w/SEEDS)*100).toFixed(0)+'%';});
    console.log(`  ${gp.padEnd(26)} │ ` + cells.map((x)=>x.padStart(16)).join(' │ '));
  }
}
