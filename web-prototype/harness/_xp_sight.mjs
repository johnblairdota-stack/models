#!/usr/bin/env node
/** THROWAWAY — how often does the guide's flyover change the guide's call at all? */
import { createSession, CALL, MOVE_CHOICE } from '../src/party/session.js';
import { PHASE } from '../src/party/phases.js';
const POOL=['Vic','Sam','Jo','Kit','Roo','Ali','Mo','Ben'];
const COUNT=8, N=600;
let eps=0, seen=0, seenInTarget=0, changedCall=0;
const byEp=new Map();
for(let g=0; g<N; g++){
  const frames=new Map();
  const s=createSession({count:COUNT,castSeed:1000+g*7,worldSeed:1+g*13,names:POOL,send:(id,f)=>frames.set(id,f)});
  let now=0,lastTick=-1; s.start(now);
  const alive=()=>s.state.players.filter(p=>p.alive).map(p=>p.id);
  for(let i=0;i<8000&&s.state.phase!==PHASE.REUNION;i++){
    if(s.state.tick!==lastTick){ lastTick=s.state.tick; const ph=s.state.phase,a=alive();
      if(ph===PHASE.CASTING){for(let k=0;k<a.length;k++){const r=a[(k+s.state.episode*3+g)%a.length];let gg=a[(k+s.state.episode+3)%a.length];if(gg===r)gg=a[(k+1)%a.length];s.input(a[k],{t:'cast',runner:r,guide:gg});}}
      else if(ph===PHASE.EXPEDITION){
        const gid=s.state.pair.guide,rid=s.state.pair.runner;
        const fly=s.unprojected(s.socketFor(gid).id).flyover; const target=s.state.expedition.room;
        eps++; const ep=s.state.episode;
        if(!byEp.has(ep)) byEp.set(ep,{n:0,seen:0,changed:0});
        const b=byEp.get(ep); b.n++;
        if(fly&&fly.hunter){ seen++; b.seen++; if(fly.room===target){ seenInTarget++; changedCall++; b.changed++; } }
        // honest: HOLD only when the hunter is visibly in the target room
        const call=(fly&&fly.hunter&&fly.room===target)?CALL.HOLD:CALL.CLEAR;
        s.input(gid,{t:'call',call}); s.input(rid,{t:'move',move:call===CALL.CLEAR?MOVE_CHOICE.GO:MOVE_CHOICE.WAIT});
      } else if(ph===PHASE.RECKONING){const acc=a[(g+s.state.episode)%a.length];let t=a[(g+s.state.episode+2)%a.length];if(t===acc)t=a[(a.indexOf(acc)+1)%a.length];s.input(acc,{t:'nominate',target:t});}
      else if(ph===PHASE.VOTE){const t=s.state.nominations[0]?.target;for(const id of a)s.input(id,{t:'vote',choice:t&&id!==t?t:'NO_ONE'});}
    }
    now+=1000;s.tick(now);
  }
}
console.log(`expeditions: ${eps}`);
console.log(`guide saw the Hunter anywhere: ${(100*seen/eps).toFixed(1)}%`);
console.log(`guide saw the Hunter IN THE TARGET ROOM (the only case the flyover changes the call): ${(100*seenInTarget/eps).toFixed(1)}%`);
console.log(`=> the guide's private screen alters their call in ${(100*changedCall/eps).toFixed(1)}% of expeditions; in the other ${(100*(1-changedCall/eps)).toFixed(1)}% the correct play is CLEAR regardless of what they see.`);
console.log('\nby episode:');
for(const [ep,b] of [...byEp].sort((a,b)=>a[0]-b[0])) console.log(`  ep${ep}: n=${b.n} sawHunter ${(100*b.seen/b.n).toFixed(1)}%  flyover changed the call ${(100*b.changed/b.n).toFixed(1)}%`);
