import { createSession, CALL, MOVE_CHOICE } from '../src/party/session.js';
import { PHASE } from '../src/party/phases.js';
import { WIN_TARGETS } from '../src/party/win.js';
function play(count, seed, policy){
  const s=createSession({count, castSeed:seed, worldSeed:seed*7, send:()=>{}}); let now=0; s.start(now);
  for(let i=0;i<4000 && s.state.phase!==PHASE.REUNION;i++){
    const alive=s.state.players.filter(p=>p.alive).map(p=>p.id);
    switch(s.state.phase){
      case PHASE.CASTING: for(let k=0;k<alive.length;k++) s.input(alive[k],{t:'cast',runner:alive[(k+1)%alive.length],guide:alive[(k+2)%alive.length]}); break;
      case PHASE.EXPEDITION: s.input(s.state.pair.guide,{t:'call',call:CALL.CLEAR}); s.input(s.state.pair.runner,{t:'move',move:MOVE_CHOICE.GO}); break;
      case PHASE.RECKONING: if(policy==='vote' && !s.state.nominations.length) s.input(alive[0],{t:'nominate',target:alive[1]}); break;
      case PHASE.VOTE: if(policy==='vote') for(const id of alive) s.input(id,{t:'vote',choice:alive[1]}); break;
      default:break;
    }
    now+=5000; s.tick(now);
  }
  const w=s.log.all().filter(e=>e.type==='win.checked').slice(-1)[0];
  const lit=s.log.all().filter(e=>e.type==='run.camera_lit').length;
  return {outcome:s.state.outcome, rule:w?.data.rule, lit};
}
for (const count of [4,6,8]) {
  for (const policy of ['novote','vote']) {
    const r={}; const lits=[];
    for(let seed=1;seed<=300;seed++){const x=play(count,seed,policy); r[x.outcome+'/'+x.rule]=(r[x.outcome+'/'+x.rule]||0)+1; lits.push(x.lit);}
    const good=Object.entries(r).filter(([k])=>k.startsWith('SEASON')).reduce((a,[,v])=>a+v,0);
    console.log(`${count}p ${policy.padEnd(7)} target ${WIN_TARGETS[count].cameraTarget} · good wins ${(good/300*100).toFixed(0)}% · mean lights ${(lits.reduce((a,b)=>a+b,0)/300).toFixed(2)} · ${JSON.stringify(r)}`);
  }
}
