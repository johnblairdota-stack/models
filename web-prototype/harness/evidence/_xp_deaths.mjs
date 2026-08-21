#!/usr/bin/env node
/** THROWAWAY — deaths: how many, when, and how good the room's aim is. */
import { createSession, CALL, MOVE_CHOICE } from '../../src/party/session.js';
import { PHASE } from '../../src/party/phases.js';
const POOL=['Vic','Sam','Jo','Kit','Roo','Ali','Mo','Ben'];
const COUNT=+(process.argv[2]||8), N=+(process.argv[3]||400);
let deaths=0, exec=0, taken=0, execGood=0, execEvil=0, games=0, epSum=0;
const deadByEp=new Map(); const idleAfter=[];   // seconds of show a dead player still sits through
const SECS={PREMIERE:150,CASTING:45,EXPEDITION:90,RECAP:20,DEBRIEF:75,RECKONING:45,VOTE:25,EXECUTION:20,VERDICT:15,REUNION:240};
const EPSECS = SECS.CASTING+SECS.EXPEDITION+SECS.RECAP+SECS.DEBRIEF+SECS.RECKONING+SECS.VOTE+SECS.EXECUTION+SECS.VERDICT;
for(let g=0;g<N;g++){
  const frames=new Map();
  const s=createSession({count:COUNT,castSeed:1000+g*7,worldSeed:1+g*13,names:POOL.slice(0,COUNT),send:(id,f)=>frames.set(id,f)});
  const truth=s.truth(); const align=Object.fromEntries(truth.seats.map(t=>[t.id,t.alignment]));
  let now=0,lastTick=-1; s.start(now); games++;
  const alive=()=>s.state.players.filter(p=>p.alive).map(p=>p.id);
  for(let i=0;i<8000&&s.state.phase!==PHASE.REUNION;i++){
    if(s.state.tick!==lastTick){lastTick=s.state.tick;const ph=s.state.phase,a=alive();
      if(ph===PHASE.CASTING){for(let k=0;k<a.length;k++){const r=a[(k+s.state.episode*3+g)%a.length];let gg=a[(k+s.state.episode+3)%a.length];if(gg===r)gg=a[(k+1)%a.length];s.input(a[k],{t:'cast',runner:r,guide:gg});}}
      else if(ph===PHASE.EXPEDITION){const gid=s.state.pair.guide,rid=s.state.pair.runner;
        const fly=s.unprojected(s.socketFor(gid).id).flyover;const target=s.state.expedition.room;
        const call=(fly&&fly.hunter&&fly.room===target)?(align[gid]==='evil'?CALL.CLEAR:CALL.HOLD):CALL.CLEAR;
        s.input(gid,{t:'call',call});s.input(rid,{t:'move',move:call===CALL.CLEAR?MOVE_CHOICE.GO:MOVE_CHOICE.WAIT});}
      else if(ph===PHASE.RECKONING){const acc=a[(g+s.state.episode)%a.length];let t=a[(g+s.state.episode+2)%a.length];if(t===acc)t=a[(a.indexOf(acc)+1)%a.length];s.input(acc,{t:'nominate',target:t});}
      else if(ph===PHASE.VOTE){const t=s.state.nominations[0]?.target;for(const id of a)s.input(id,{t:'vote',choice:t&&id!==t?t:'NO_ONE'});}}
    now+=1000;s.tick(now);
  }
  const log=s.log.reunion(); const totalEps=s.state.episode-1; epSum+=totalEps;
  let ep=1;
  for(const e of log){
    if(e.type==='phase.CASTING') ep=e.data.episode??ep;
    if(e.type==='player.taken'){deaths++;taken++;deadByEp.set(ep,(deadByEp.get(ep)||0)+1);idleAfter.push((totalEps-ep)*EPSECS+SECS.REUNION);}
    if(e.type==='player.executed'){deaths++;exec++;(align[e.data.id]==='evil')?execEvil++:execGood++;deadByEp.set(ep,(deadByEp.get(ep)||0)+1);idleAfter.push((totalEps-ep)*EPSECS+SECS.REUNION);}
  }
}
console.log(`${COUNT} players, ${games} games, avg ${(epSum/games).toFixed(2)} episodes`);
console.log(`deaths/game ${(deaths/games).toFixed(2)}  (executions ${(exec/games).toFixed(2)}, hunter-takes ${(taken/games).toFixed(2)})`);
console.log(`executions: ${(100*execEvil/Math.max(1,exec)).toFixed(1)}% hit Production, ${(100*execGood/Math.max(1,exec)).toFixed(1)}% hit a good player   (chance at 8p = ${(100*2/8).toFixed(1)}%)`);
console.log('deaths by episode:', [...deadByEp].sort((a,b)=>a[0]-b[0]).map(([e,n])=>`ep${e}:${(n/games).toFixed(2)}`).join(' '));
idleAfter.sort((a,b)=>a-b);
const mean = idleAfter.reduce((a,b)=>a+b,0)/Math.max(1,idleAfter.length);
console.log(`a dead player then sits through: mean ${(mean/60).toFixed(1)} min, median ${(idleAfter[Math.floor(idleAfter.length/2)]/60).toFixed(1)} min, max ${(idleAfter[idleAfter.length-1]/60).toFixed(1)} min  — with zero inputs available`);
