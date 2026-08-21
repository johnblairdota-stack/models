import { createSession, CALL, MOVE_CHOICE } from '../src/party/session.js';
import { PHASE } from '../src/party/phases.js';
import { awards } from '../src/party/reunion.js';
const rng=(s)=>{let h=(s*2654435761)>>>0;return()=>(h=Math.imul(h^(h>>>15),2246822507)>>>0)/4294967296;};
export function play({castSeed,worldSeed}){
  const state={},events={};const rnd=rng(castSeed*7919+worldSeed);
  const s=createSession({count:8,castSeed,worldSeed,send:(id,f)=>{(state[id]=state[id]||[]).push(f);},emit:(id,e)=>{(events[id]=events[id]||[]).push(e);}});
  const act=(p,m)=>s.input(p,m);const offered=new Set();
  const once=(id)=>{const k=s.state.tick+':'+id;if(offered.has(k))return false;offered.add(k);return true;};
  const taps=()=>{const alive=s.state.players.filter(p=>p.alive).map(p=>p.id);if(!alive.length)return;
    switch(s.state.phase){
      case PHASE.PREMIERE: for(const id of alive) if(once(id)&&rnd()<0.7) act(id,{t:'claim',claim:['Focus Puller','Gaffer','Boom Op','Grip'][Math.floor(rnd()*4)]}); break;
      case PHASE.CASTING: for(let i=0;i<alive.length;i++){if(!once(alive[i]))continue;const a=Math.floor(rnd()*alive.length),b=Math.floor(rnd()*alive.length);act(alive[i],{t:'cast',runner:alive[a],guide:alive[(b+1)%alive.length]});} break;
      case PHASE.EXPEDITION: if(s.state.call.said==null&&s.state.pair.guide)act(s.state.pair.guide,{t:'call',call:rnd()<0.65?CALL.CLEAR:CALL.HOLD}); if(s.state.pair.runner)act(s.state.pair.runner,{t:'move',move:rnd()<0.8?MOVE_CHOICE.GO:MOVE_CHOICE.WAIT}); break;
      case PHASE.RECKONING: if(s.state.nominations.length<2&&rnd()<0.55&&alive.length>2){const a=Math.floor(rnd()*alive.length);let b=Math.floor(rnd()*alive.length);if(a===b)b=(b+1)%alive.length;act(alive[a],{t:'nominate',target:alive[b]});} break;
      case PHASE.VOTE:{const st=s.state.nominations.map(x=>x.target);for(const id of alive) if(once(id)&&st.length&&rnd()<0.75)act(id,{t:'vote',choice:st[Math.floor(rnd()*st.length)]});break;}
      default:break;}};
  let now=0;s.start(now);
  for(let i=0;i<40000;i++){taps();now+=500;s.tick(now);if(s.state.phase===PHASE.REUNION)break;}
  const al=Object.fromEntries(s.truth().seats.map(x=>[x.id,x.alignment]));
  return {s,state,events,log:s.log.all(),ctx:{alignmentOf:id=>al[id]}};
}
if((process.argv[1]||'').endsWith('_ru_probe7.mjs')){
  const hits=[];const deck=new Map();
  for(let seed=1;seed<=120;seed++){
    const r=play({castSeed:seed*41,worldSeed:seed});
    const A=awards(r.log,r.ctx);
    for(const a of A) deck.set(a.award,(deck.get(a.award)||0)+1);
    if(A.some(a=>a.award==='Cold Blood')) hits.push(seed);
  }
  console.log('Cold Blood seeds:',hits.slice(0,20).join(','),'of 120');
  console.log('deck over 120 games:',[...deck].map(([k,v])=>`${k} ${v}`).join(' · '));
}
