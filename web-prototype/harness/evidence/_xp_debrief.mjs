#!/usr/bin/env node
/** THROWAWAY — the exact DEBRIEF board (show-tv.html's own template) for every episode of one game. */
import { createSession, CALL, MOVE_CHOICE } from '../../src/party/session.js';
import { PHASE } from '../../src/party/phases.js';
import { project } from '../../net/party/entitle.js';
const POOL=['Vic','Sam','Jo','Kit','Roo','Ali','Mo','Ben'];
const g=+(process.argv[2]||11);
const frames=new Map();
const s=createSession({count:8,castSeed:1000+g*7,worldSeed:1+g*13,names:POOL,send:(id,f)=>frames.set(id,f)});
const align=Object.fromEntries(s.truth().seats.map(t=>[t.id,t.alignment]));
const role=Object.fromEntries(s.truth().seats.map(t=>[t.id,t.role]));
const nm=Object.fromEntries(s.state.players.map(p=>[p.id,p.name]));
console.log('TRUTH: '+s.truth().seats.map(t=>nm[t.id]+'='+t.role+'/'+t.alignment).join('  '));
let now=0,lastTick=-1; s.start(now);
const alive=()=>s.state.players.filter(p=>p.alive).map(p=>p.id);
const board=(f)=>{
  const e=f.expedition||{}; const happened={taken:'The Hunter had them',lit:'The camera came on',held:'They held at the door'}[e.outcome]||'Nothing aired';
  return `      WING ${(f.expedition.room||'—').toUpperCase()}\n      RAN ${nm[f.pair.runner]}\n      GUIDED ${nm[f.pair.guide]}\n      OUTCOME ${happened}\n      CAMERAS ${f.cameras.unlocked} of ${f.cameras.needed} lit\n      INCIDENTS ${f.incident.alarms} this season\n      "${nm[f.pair.guide]} called it out loud, and what they said is not written down anywhere."`;
};
for(let i=0;i<8000&&s.state.phase!==PHASE.REUNION;i++){
  if(s.state.tick!==lastTick){lastTick=s.state.tick;const ph=s.state.phase,a=alive();
    if(ph===PHASE.CASTING){for(let k=0;k<a.length;k++){const r=a[(k+s.state.episode*3+g)%a.length];let gg=a[(k+s.state.episode+3)%a.length];if(gg===r)gg=a[(k+1)%a.length];s.input(a[k],{t:'cast',runner:r,guide:gg});}}
    else if(ph===PHASE.EXPEDITION){const gid=s.state.pair.guide,rid=s.state.pair.runner;
      const fly=s.unprojected(s.socketFor(gid).id).flyover;const target=s.state.expedition.room;
      const inT=!!(fly&&fly.hunter&&fly.room===target);
      const call=inT?(align[gid]==='evil'?CALL.CLEAR:CALL.HOLD):CALL.CLEAR;
      console.log(`\n  [private] ep${s.state.episode} guide ${nm[gid]} (${role[gid]}/${align[gid]}) phone shows: ${fly&&fly.hunter?('HUNTER IN '+fly.room.toUpperCase()):'NO SIGNAL'}; wing is ${target}; says ${call}`);
      s.input(gid,{t:'call',call});s.input(rid,{t:'move',move:call===CALL.CLEAR?MOVE_CHOICE.GO:MOVE_CHOICE.WAIT});}
    else if(ph===PHASE.DEBRIEF){
      const sock=s.sockets.find(x=>!x.isTV);
      const {frame}=project(s.unprojected('tv'),{playerId:null,alignment:null,isTV:true,seatRole:null});
      console.log(`\n===== EPISODE ${s.state.episode} · THE DEBRIEF (75s) — the entire television =====`);
      console.log('      Talk.');
      console.log(board(frame));
      const live=s.state.players.filter(p=>p.alive).length;
      console.log(`      [seats: ${s.state.players.map(p=>p.name+(p.alive?'':' ✖')).join(' · ')}]`);
    }
    else if(ph===PHASE.RECKONING){const acc=a[(g+s.state.episode)%a.length];let t=a[(g+s.state.episode+2)%a.length];if(t===acc)t=a[(a.indexOf(acc)+1)%a.length];s.input(acc,{t:'nominate',target:t});}
    else if(ph===PHASE.VOTE){const t=s.state.nominations[0]?.target;for(const id of a)s.input(id,{t:'vote',choice:t&&id!==t?t:'NO_ONE'});}}
  now+=1000;s.tick(now);
}
console.log('\nOUTCOME '+s.state.outcome);
