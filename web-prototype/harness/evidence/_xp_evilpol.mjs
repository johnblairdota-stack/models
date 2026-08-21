#!/usr/bin/env node
/** THROWAWAY — evil's two guide strategies: win rate vs how visible they are. */
import { createSession, CALL, MOVE_CHOICE } from '../../src/party/session.js';
import { PHASE } from '../../src/party/phases.js';
const POOL=['Vic','Sam','Jo','Kit','Roo','Ali','Mo','Ben'];
const N=+(process.argv[2]||500);
function run(evilPol){
  const tally={good:{lit:0,taken:0,held:0},evil:{lit:0,taken:0,held:0}}; const o=new Map();
  for(let g=0;g<N;g++){
    const frames=new Map();
    const s=createSession({count:8,castSeed:1000+g*7,worldSeed:1+g*13,names:POOL,send:(id,f)=>frames.set(id,f)});
    const align=Object.fromEntries(s.truth().seats.map(t=>[t.id,t.alignment]));
    let now=0,lastTick=-1; s.start(now); const guideOf=[];
    const alive=()=>s.state.players.filter(p=>p.alive).map(p=>p.id);
    for(let i=0;i<8000&&s.state.phase!==PHASE.REUNION;i++){
      if(s.state.tick!==lastTick){lastTick=s.state.tick;const ph=s.state.phase,a=alive();
        if(ph===PHASE.CASTING){for(let k=0;k<a.length;k++){const r=a[(k+s.state.episode*3+g)%a.length];let gg=a[(k+s.state.episode+3)%a.length];if(gg===r)gg=a[(k+1)%a.length];s.input(a[k],{t:'cast',runner:r,guide:gg});}}
        else if(ph===PHASE.EXPEDITION){const gid=s.state.pair.guide,rid=s.state.pair.runner;
          const fly=s.unprojected(s.socketFor(gid).id).flyover;const target=s.state.expedition.room;
          const sees=!!(fly&&fly.hunter); const inTarget=sees&&fly.room===target;
          let call;
          if(align[gid]==='evil'){
            if(evilPol==='mimic') call = inTarget?CALL.CLEAR:CALL.CLEAR;              // kill when you can, else look normal
            else call = inTarget?CALL.CLEAR:(sees?CALL.CLEAR:CALL.HOLD);              // 'starve': hold whenever blind
          } else call = inTarget?CALL.HOLD:CALL.CLEAR;
          s.input(gid,{t:'call',call});s.input(rid,{t:'move',move:call===CALL.CLEAR?MOVE_CHOICE.GO:MOVE_CHOICE.WAIT});guideOf.push(gid);}
        else if(ph===PHASE.RECKONING){const acc=a[(g+s.state.episode)%a.length];let t=a[(g+s.state.episode+2)%a.length];if(t===acc)t=a[(a.indexOf(acc)+1)%a.length];s.input(acc,{t:'nominate',target:t});}
        else if(ph===PHASE.VOTE){const t=s.state.nominations[0]?.target;for(const id of a)s.input(id,{t:'vote',choice:t&&id!==t?t:'NO_ONE'});}}
      now+=1000;s.tick(now);
    }
    o.set(s.state.outcome,(o.get(s.state.outcome)||0)+1);
    s.log.reunion().filter(e=>e.type==='expedition.ended').forEach((e,i)=>{const gid=guideOf[i]; if(gid) tally[align[gid]][e.data.outcome]++;});
  }
  return {o,tally};
}
for(const pol of ['mimic','starve']){
  const {o,tally}=run(pol);
  const ev=(o.get('CANCELLED')||0)/N;
  console.log(`\nevil guide policy = ${pol}:  evil wins ${(100*ev).toFixed(1)}%`);
  for(const k of ['good','evil']){const t=tally[k],n=t.lit+t.taken+t.held;
    console.log(`   ${k.padEnd(4)} guide n=${String(n).padStart(4)}  lit ${(100*t.lit/n).toFixed(1)}%  taken ${(100*t.taken/n).toFixed(1)}%  held ${(100*t.held/n).toFixed(1)}%`);}
}
