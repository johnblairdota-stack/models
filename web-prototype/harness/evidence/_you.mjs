import { createRoom } from '../../src/party/room.js';
const frames=[];
const r=createRoom({count:8,castSeed:5,worldSeed:5,send:(id,f)=>frames.push({id,f})});
r.start(); r.playEpisode();
const tv=frames.filter(x=>x.id==='tv');
const ph=frames.filter(x=>x.id!=='tv');
console.log('tv frames:',tv.length,'| any tv frame with a `you`:', tv.some(x=>x.f.you!==undefined));
console.log('phone frames with a `you`:', ph.filter(x=>x.f.you!==undefined).length,'/',ph.length);
console.log('sample phone you:', JSON.stringify(ph.find(x=>x.f.you)?.f.you));
console.log('sample tv keys:', Object.keys(tv[0]?.f||{}).join(','));
// the Glitched: does the phone read the cover in full?
const truth=r.truth();
const g=truth.seats.find(s=>s.cover);
if(g){ const own=ph.filter(x=>x.f.you?.id===g.id).slice(-1)[0];
  console.log(`glitched seat ${g.id}: true role ${g.role}, cover ${g.cover} -> card says role=${own?.f.you.role} name=${own?.f.you.roleName} line="${(own?.f.you.roleLine||'').slice(0,50)}"`);}
const st=truth.seats.find(s=>s.role==='theStatic');
if(st){ const own=ph.filter(x=>x.f.you?.id===st.id).slice(-1)[0];
  console.log(`theStatic seat ${st.id}: card name=${own?.f.you.roleName} line=${own?.f.you.roleLine===undefined?'(absent)':JSON.stringify(own?.f.you.roleLine)}`);}
