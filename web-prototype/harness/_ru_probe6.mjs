import { createSession, CALL, MOVE_CHOICE } from '../src/party/session.js';
import { PHASE } from '../src/party/phases.js';
import { reunion, revealSet, guideLedger, awards } from '../src/party/reunion.js';
const rng=(s)=>{let h=(s*2654435761)>>>0;return()=>(h=Math.imul(h^(h>>>15),2246822507)>>>0)/4294967296;};
function play({castSeed,worldSeed}){
  const state={},events={};const rnd=rng(castSeed*7919+worldSeed);
  const s=createSession({count:8,castSeed,worldSeed,send:(id,f)=>{(state[id]=state[id]||[]).push(f);},emit:(id,e)=>{(events[id]=events[id]||[]).push(e);}});
  const act=(p,m)=>s.input(p,m);
  const offered=new Set();
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
const r=play({castSeed:11*41,worldSeed:11});
// where does cameraOp appear in phone-0's stream?
const f=(r.state['phone-0']||[]);
const hit=f.find(x=>JSON.stringify(x).includes('cameraOp'));
console.log('phone-0 frame containing cameraOp — keys:',Object.keys(hit||{}));
console.log('you:',JSON.stringify(hit&&hit.you));
console.log('sock playerId:', r.s.sockets[0].playerId);
// Dead Air debug
const votes=r.log.filter(e=>e.type==='vote.cast');
const ids=r.s.truth().seats.map(s=>s.id);
const chances=id=>1+votes.filter(e=>e.data.voter===id).length;
const spoke=id=>r.log.filter(e=>(e.type==='player.claim_set'&&e.data.id===id)||(e.type==='nom.made'&&e.data.nominator===id)||(e.type==='vote.cast'&&e.data.voter===id&&e.data.choice!=='NO_ONE'&&e.data.choice!=null)).length;
console.log('\nchances/spoke:',ids.map(i=>`${i}:${spoke(i)}/${chances(i)}`).join(' '));
const most=Math.max(...ids.map(chances));
console.log('most',most,'pool',ids.filter(i=>chances(i)===most));
const A=awards(r.log,r.ctx); console.log('awards:',A.map(a=>a.award+'→'+a.winner+(a.sharedWith.length?'+'+a.sharedWith:'')).join(' | '));
console.log('NO_ONE votes:', votes.filter(e=>e.data.choice==='NO_ONE').length,'of',votes.length);
// rooms
console.log('\nledger rooms:',guideLedger(r.log).map(x=>x.hunterRoom).join(','));
const pub=new Set(); for(const e of r.log){if(e.vis!=='PUBLIC'||e.type==='player.claim_set')continue;const w=v=>{if(typeof v==='string')pub.add(v);else if(Array.isArray(v))v.forEach(w);else if(v&&typeof v==='object')Object.values(v).forEach(w);};w(e.data);}
console.log('public strings:',[...pub].join(','));

// --- turnout, one-for-one: the nameplate + every ballot you were alive for
console.log('\n=== turnout, one chance one row ===');
let dead=0,first=0,tot=0,coll=0,share=0;
for(let i=0;i<170;i++){
  const q=play({castSeed:100+i*13,worldSeed:7+i*29});
  const log=q.log, ids=q.s.truth().seats.map(s=>s.id);
  const votes=log.filter(e=>e.type==='vote.cast');
  const chances=id=>1+votes.filter(e=>e.data.voter===id).length;
  const used=id=>(log.some(e=>e.type==='player.claim_set'&&e.data.id===id)?1:0)
    +votes.filter(e=>e.data.voter===id&&e.data.choice!=='NO_ONE'&&e.data.choice!=null).length;
  const most=Math.max(...ids.map(chances));
  const pool=ids.filter(id=>chances(id)===most);
  if(most<2||!pool.length) continue;
  const rate=id=>used(id)/chances(id);
  const mn=Math.min(...pool.map(rate));
  if(mn>=1){ continue; }
  const tied=pool.filter(id=>rate(id)===mn);
  const w=tied[0];
  const deaths=log.filter(e=>e.type==='player.taken'||e.type==='player.executed').map(e=>e.data.id);
  tot++; if(deaths.includes(w))dead++; if(deaths[0]===w)first++; if(tied.length>1)share++;
}
console.log(`granted ${tot}/170 · winner had died ${Math.round(100*dead/tot)}% · was FIRST death ${Math.round(100*first/tot)}% · tied at top ${Math.round(100*share/tot)}%`);
