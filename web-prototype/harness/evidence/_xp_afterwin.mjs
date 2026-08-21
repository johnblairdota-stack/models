#!/usr/bin/env node
/** THROWAWAY — does the show keep playing after the win condition is met? */
import { createSession, CALL, MOVE_CHOICE } from '../../src/party/session.js';
import { PHASE } from '../../src/party/phases.js';
import { foldWin } from '../../src/party/win.js';
const POOL=['Vic','Sam','Jo','Kit','Roo','Ali','Mo','Ben'];
const COUNT=+(process.argv[2]||8), N=+(process.argv[3]||400);
let games=0, wonEarly=0, deadAfterWin=0, secAfter=0, gamesWithDeadAfter=0;
const SEC={CASTING:45,EXPEDITION:90,RECAP:20,DEBRIEF:75,RECKONING:45,VOTE:25,EXECUTION:20,VERDICT:15};
for(let g=0;g<N;g++){
  const frames=new Map();
  const s=createSession({count:COUNT,castSeed:1000+g*7,worldSeed:1+g*13,names:POOL.slice(0,COUNT),send:(id,f)=>frames.set(id,f)});
  const align=Object.fromEntries(s.truth().seats.map(t=>[t.id,t.alignment]));
  let now=0,lastTick=-1; s.start(now); games++;
  const alive=()=>s.state.players.filter(p=>p.alive).map(p=>p.id);
  for(let i=0;i<8000&&s.state.phase!==PHASE.REUNION;i++){
    if(s.state.tick!==lastTick){lastTick=s.state.tick;const ph=s.state.phase,a=alive();
      if(ph===PHASE.CASTING){for(let k=0;k<a.length;k++){const r=a[(k+s.state.episode*3+g)%a.length];let gg=a[(k+s.state.episode+3)%a.length];if(gg===r)gg=a[(k+1)%a.length];s.input(a[k],{t:'cast',runner:r,guide:gg});}}
      else if(ph===PHASE.EXPEDITION){const gid=s.state.pair.guide,rid=s.state.pair.runner;
        const fly=s.unprojected(s.socketFor(gid).id).flyover;const target=s.state.expedition.room;
        const inT=!!(fly&&fly.hunter&&fly.room===target);
        const call=inT?(align[gid]==='evil'?CALL.CLEAR:CALL.HOLD):CALL.CLEAR;
        s.input(gid,{t:'call',call});s.input(rid,{t:'move',move:call===CALL.CLEAR?MOVE_CHOICE.GO:MOVE_CHOICE.WAIT});}
      else if(ph===PHASE.RECKONING){const acc=a[(g+s.state.episode)%a.length];let t=a[(g+s.state.episode+2)%a.length];if(t===acc)t=a[(a.indexOf(acc)+1)%a.length];s.input(acc,{t:'nominate',target:t});}
      else if(ph===PHASE.VOTE){const t=s.state.nominations[0]?.target;for(const id of a)s.input(id,{t:'vote',choice:t&&id!==t?t:'NO_ONE'});}}
    now+=1000;s.tick(now);
  }
  const log=s.log.reunion();
  const w=foldWin(log,{count:COUNT,alignmentOf:id=>align[id]});
  if(w.atSeq==null) continue;
  wonEarly++;
  const after=log.filter(e=>e.seq>w.atSeq);
  const kills=after.filter(e=>e.type==='player.executed'||e.type==='player.taken');
  const phases=after.filter(e=>e.type.startsWith('phase.')&&e.type!=='phase.REUNION');
  const secs=phases.reduce((a,e)=>a+(e.data.seconds||0),0);
  secAfter+=secs;
  if(kills.length){ deadAfterWin+=kills.length; gamesWithDeadAfter++; }
}
console.log(`${COUNT}p, ${games} games; ${wonEarly} had a decisive win event mid-show.`);
console.log(`After the win rule fired, the show still played a mean of ${(secAfter/wonEarly).toFixed(0)}s (${(secAfter/wonEarly/60).toFixed(1)} min) of further phases.`);
console.log(`${(100*gamesWithDeadAfter/wonEarly).toFixed(1)}% of those games executed or took someone AFTER the game was already decided (${(deadAfterWin/wonEarly).toFixed(2)} people per game).`);
