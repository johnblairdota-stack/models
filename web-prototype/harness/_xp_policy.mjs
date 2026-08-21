#!/usr/bin/env node
/** THROWAWAY — is the guide's call ever a real decision? And does evil ever get a lever? */
import { createSession, CALL, MOVE_CHOICE, pick } from '../src/party/session.js';
import { PHASE } from '../src/party/phases.js';
import { ROOMS } from '../src/party/coverage.js';

const POOL = ['Vic','Sam','Jo','Kit','Roo','Ali','Mo','Ben'];
const arg = (k,d)=>{const i=process.argv.indexOf(k);return i>0?process.argv[i+1]:d;};
const COUNT=+arg('--count',8), N=+arg('--games',400);

function play(seedG, policy) {
  const frames=new Map();
  const s=createSession({count:COUNT,castSeed:1000+seedG*7,worldSeed:1+seedG*13,names:POOL.slice(0,COUNT),send:(id,f)=>frames.set(id,f)});
  const truth=s.truth(); const align=Object.fromEntries(truth.seats.map(t=>[t.id,t.alignment]));
  const evilIds=truth.seats.filter(t=>t.alignment==='evil').map(t=>t.id);
  const evilGuideEps=new Map(evilIds.map(i=>[i,0]));      // times an evil player guided
  const evilKnowingLie=new Map(evilIds.map(i=>[i,0]));    // guided AND could see the hunter (real lever)
  const evilRunnerEps=new Map(evilIds.map(i=>[i,0]));
  let now=0,lastTick=-1; s.start(now);
  const alive=()=>s.state.players.filter(p=>p.alive).map(p=>p.id);
  for(let i=0;i<8000 && s.state.phase!==PHASE.REUNION;i++){
    if(s.state.tick!==lastTick){
      lastTick=s.state.tick; const ph=s.state.phase, a=alive();
      if(ph===PHASE.CASTING){
        for(let k=0;k<a.length;k++){
          const r=a[(k+s.state.episode*3+seedG)%a.length]; let g=a[(k+s.state.episode+3)%a.length];
          if(g===r) g=a[(k+1)%a.length];
          s.input(a[k],{t:'cast',runner:r,guide:g});
        }
      } else if(ph===PHASE.EXPEDITION){
        const gid=s.state.pair.guide, rid=s.state.pair.runner;
        const fly=s.unprojected(s.socketFor(gid).id).flyover;
        const target=s.state.expedition.room;
        const evilG = align[gid]==='evil';
        if(evilG){ evilGuideEps.set(gid,evilGuideEps.get(gid)+1); if(fly&&fly.hunter) evilKnowingLie.set(gid,evilKnowingLie.get(gid)+1); }
        if(align[rid]==='evil') evilRunnerEps.set(rid,evilRunnerEps.get(rid)+1);
        let call;
        if(evilG && policy!=='allgood'){
          call = (fly&&fly.hunter&&fly.room===target)?CALL.CLEAR:CALL.HOLD;   // murder if you can, else starve
        } else if(policy==='alwaysgo'){ call=CALL.CLEAR; }
        else if(policy==='holdwhenblind'){ call=(fly&&fly.hunter)?((fly.room===target)?CALL.HOLD:CALL.CLEAR):CALL.HOLD; }
        else { call=(fly&&fly.hunter)?((fly.room===target)?CALL.HOLD:CALL.CLEAR):CALL.CLEAR; }  // 'honest' = GO when blind
        s.input(gid,{t:'call',call});
        s.input(rid,{t:'move',move:call===CALL.CLEAR?MOVE_CHOICE.GO:MOVE_CHOICE.WAIT});
      } else if(ph===PHASE.RECKONING){
        const acc=a[(seedG+s.state.episode)%a.length]; let tgt=a[(seedG+s.state.episode+2)%a.length];
        if(tgt===acc) tgt=a[(a.indexOf(acc)+1)%a.length];
        s.input(acc,{t:'nominate',target:tgt});
      } else if(ph===PHASE.VOTE){
        const target=s.state.nominations[0]?.target;
        for(const id of a) s.input(id,{t:'vote',choice:target&&id!==target?target:'NO_ONE'});
      }
    }
    now+=1000; s.tick(now);
  }
  return {outcome:s.state.outcome, cams:s.state.cameras.unlocked, eps:s.state.episode-1,
    evilGuideEps:[...evilGuideEps.values()], evilKnowingLie:[...evilKnowingLie.values()], evilRunnerEps:[...evilRunnerEps.values()]};
}

for (const policy of ['honest','alwaysgo','holdwhenblind','allgood']) {
  const o=new Map(); let camSum=0, epSum=0;
  let evilSeats=0, evilNeverGuided=0, evilNeverLever=0, leverSum=0;
  for(let g=0;g<N;g++){
    const r=play(g,policy);
    o.set(r.outcome,(o.get(r.outcome)||0)+1); camSum+=r.cams; epSum+=r.eps;
    for(let k=0;k<r.evilGuideEps.length;k++){ evilSeats++; if(r.evilGuideEps[k]===0) evilNeverGuided++;
      if(r.evilKnowingLie[k]===0) evilNeverLever++; leverSum+=r.evilKnowingLie[k]; }
  }
  console.log(`\npolicy=${policy}  (${COUNT}p, ${N} games)`);
  console.log('  ', [...o].map(([k,v])=>`${k} ${(100*v/N).toFixed(1)}%`).join('  '), ` avg cams ${(camSum/N).toFixed(2)} avg episodes ${(epSum/N).toFixed(2)}`);
  if (policy!=='allgood') console.log(`   evil seats: ${evilSeats};  never guided all game ${(100*evilNeverGuided/evilSeats).toFixed(1)}%;  never once guided WITH SIGHT (no informed lie available all game) ${(100*evilNeverLever/evilSeats).toFixed(1)}%;  mean informed-lie opportunities per evil player ${(leverSum/evilSeats).toFixed(2)}`);
}
