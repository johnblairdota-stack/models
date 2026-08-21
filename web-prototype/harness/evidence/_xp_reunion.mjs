#!/usr/bin/env node
import { createSession, CALL, MOVE_CHOICE } from '../../src/party/session.js';
import { PHASE } from '../../src/party/phases.js';
import { reunion } from '../../src/party/reunion.js';
const POOL=['Vic','Sam','Jo','Kit','Roo','Ali','Mo','Ben'];
const g = +(process.argv[2] ?? 3);
const frames=new Map();
const s=createSession({count:8,castSeed:1000+g*7,worldSeed:1+g*13,names:POOL,send:(id,f)=>frames.set(id,f)});
const truth=s.truth(); const align=Object.fromEntries(truth.seats.map(t=>[t.id,t.alignment]));
const nm=Object.fromEntries(s.state.players.map(p=>[p.id,p.name]));
let now=0,lastTick=-1; s.start(now);
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
const log=s.log.reunion();
const r=reunion(log,{alignmentOf:(id)=>align[id]});
console.log('OUTCOME '+s.state.outcome+'  cams '+s.state.cameras.unlocked+'/'+s.state.cameras.needed+'\n');
console.log('--- ROLL CALL (the whole reveal) ---');
for(const p of r.rollCall) console.log('  '+nm[p.id].padEnd(5)+' '+p.role.padEnd(13)+' '+p.alignment.padEnd(5)+' claimed='+(p.finalClaim??'-')+' believed='+(p.believedTheyWere??'-')+' death='+(p.death?p.death.by:'survived'));
console.log('\n--- DECISIVE --- '+JSON.stringify(r.decisive));
console.log('\n--- AWARDS ---'); for(const a of r.awards) console.log('  '+a.award+': '+nm[a.winner]+' - '+a.why+'  (evidence: '+a.querySeq.length+' seq)');
console.log('\n--- CHAT --- '+r.chat.length+' messages');
console.log('\n--- LOG TYPES THE REUNION NEVER QUERIES ---');
const asked = new Set(['cast.deal','player.claim_set','player.taken','player.executed','win.checked','cast.ballot','nom.made','vote.cast','noise.emitted','chat.posted']);
const counts=new Map(); for(const e of log) counts.set(e.type,(counts.get(e.type)||0)+1);
for(const [t,c] of [...counts].sort()) if(!asked.has(t)) console.log('  '+t.padEnd(24)+' x'+c+'   '+log.find(e=>e.type===t).vis);
console.log('\n--- sealed calls vs where the Hunter was (IN THE LOG, NEVER SHOWN) ---');
const calls=log.filter(e=>e.type==='call.said'), hp=log.filter(e=>e.type==='hunter.placed'), ee=log.filter(e=>e.type==='expedition.ended');
for(let i=0;i<calls.length;i++) console.log('  ep'+calls[i].data.episode+': '+nm[calls[i].data.by]+' ('+align[calls[i].data.by]+') said '+calls[i].data.said+'; hunter in '+(hp[i]&&hp[i].data.room)+'; wing '+(ee[i]&&ee[i].data.room)+'; outcome '+(ee[i]&&ee[i].data.outcome));
