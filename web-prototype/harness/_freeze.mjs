import { startShow, playerIdOf } from '../net/party/show.mjs';
const PORT = 5401;
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function open2(port, query='') { return new Promise(res=>{
  const ws=new WebSocket(`ws://127.0.0.1:${port}/${query}`); const msgs=[];
  const box={ws,msgs,send:o=>ws.send(JSON.stringify(o)),of:t=>msgs.filter(m=>m.t===t),
    frames:()=>msgs.filter(m=>m.t==='state').map(m=>m.frame),
    close:()=>{try{ws.close()}catch{}}};
  ws.onmessage=e=>{const m=JSON.parse(e.data);msgs.push(m);if(m.t==='ping')box.send({t:'pong',at:m.at});};
  ws.onopen=()=>res(box); ws.onerror=()=>res(box);});}
const say=(n,ok,d='')=>console.log(`  ${ok?'ok  ':'BAD '} ${n}${d?' · '+d:''}`);

// ------- scenario 1: drop one tick before the bell, reclaim one tick after
{
  const s = startShow({ port: PORT, code: 'brk1', stamp: 1 }); await sleep(120);
  const tv = await open2(PORT, '?role=tv'); await sleep(60);
  const ph=[]; for(let i=0;i<6;i++){const p=await open2(PORT); p.send({t:'join',name:`P${i}`,token:null,boot:100}); ph.push(p);}
  await sleep(250);
  const tok = ph.map(p=>p.of('seated')[0]?.token);
  ph[2].close(); await sleep(60);           // drops ~one tick before START
  tv.send({t:'start'}); await sleep(300);
  const sess = s.sessionNow();
  say('S1 five dealt after one drops just before the bell', sess.state.players.length===5, `${sess.state.players.length}`);
  const back = await open2(PORT); back.send({t:'join',name:'Back',token:tok[2],boot:20}); await sleep(250);
  say('S1 the evicted phone is refused', back.of('late').length===1 && !back.of('seated').length,
      JSON.stringify(back.of('late')[0]||back.of('seated')[0]||null));
  say('S1 ... and the reason it is given', true, `phone reads: "${back.of('late')[0]?.why}" · lobby log says "${s.lobby.events.filter(e=>e.type==='seat.evicted')[0]?.reason}"`);
  // seat indices dense?
  say('S1 seats dense', [...s.lobby.seats.values()].map(x=>x.seat).sort().join(',')==='0,1,2,3,4',
     [...s.lobby.seats.values()].map(x=>x.seat).join(','));
  // do the log's earlier seat.joined entries now point at the wrong people?
  const joined = s.lobby.events.filter(e=>e.type==='seat.joined').map(e=>`${e.seat}:${e.name}`);
  const nowSeats = [...s.lobby.seats.values()].sort((a,b)=>a.seat-b.seat).map(x=>`${x.seat}:${x.name}`);
  say('S1 log vs live seat numbering', false, `log seat.joined = [${joined}] · live = [${nowSeats}]`);
  const rep = await (await fetch(`http://127.0.0.1:${PORT}/report`)).json();
  say('S1 report seats', true, JSON.stringify(rep.seats.map(x=>({seat:x.seat,name:x.name}))));
  say('S1 report events keep the OLD indices', true, JSON.stringify(rep.events.filter(e=>e.type==='seat.joined'||e.type==='seat.dropped'||e.type==='seat.evicted').map(e=>`${e.type} seat${e.seat} ${e.name}`)));
  for(const p of ph)p.close(); back.close(); tv.close(); await s.close();
}

// ------- scenario 2: two phones racing for the same token, mid-show
{
  const s = startShow({ port: PORT+1, code: 'brk2', stamp: 2 }); await sleep(120);
  const tv = await open2(PORT+1,'?role=tv'); await sleep(60);
  const ph=[]; for(let i=0;i<5;i++){const p=await open2(PORT+1); p.send({t:'join',name:`Q${i}`,token:null,boot:100}); ph.push(p);}
  await sleep(250);
  const tok = ph.map(p=>p.of('seated')[0]?.token);
  tv.send({t:'start'}); await sleep(300);
  // A and B both claim seat 1's token while the original is STILL CONNECTED
  const A = await open2(PORT+1); A.send({t:'join',name:'A',token:tok[1],boot:10}); await sleep(200);
  const B = await open2(PORT+1); B.send({t:'join',name:'B',token:tok[1],boot:10}); await sleep(200);
  say('S2 both impostors were seated on the same chair',
      A.of('seated')[0]?.seat===1 && B.of('seated')[0]?.seat===1,
      `A seat ${A.of('seated')[0]?.seat} · B seat ${B.of('seated')[0]?.seat} · seats now ${s.lobby.seats.size}`);
  const orig = ph[1];
  say('S2 the ORIGINAL phone is still connected and still receiving', orig.frames().length>0,
      `${orig.frames().length} frames · last you.id ${orig.frames().slice(-1)[0]?.you?.id}`);
  // can the displaced original still act as p2?
  const before = s.sessionNow().state.phase;
  orig.send({t:'act',msg:{t:'claim',claim:'Continuity'}}); await sleep(200);
  const p2 = s.sessionNow().state.players.find(p=>p.id===playerIdOf(1));
  say('S2 a DISPLACED socket can still act as that player', p2?.claim==='Continuity',
      `claim=${p2?.claim} (phase ${before})`);
  // now close B; does the seat die while A is still on it?
  B.close(); await sleep(200);
  const seat1 = [...s.lobby.seats.values()].find(x=>x.seat===1);
  say('S2 after the LAST claimer leaves, the chair is marked dead though A is still connected',
      seat1.live===false, `live=${seat1.live} · A open=${A.ws.readyState===1}`);
  for(const p of ph)p.close(); A.close(); tv.close(); await s.close();
}

// ------- scenario 3: drop AFTER the bell, another phone tries to take the freed index
{
  const s = startShow({ port: PORT+2, code: 'brk3', stamp: 3 }); await sleep(120);
  const tv = await open2(PORT+2,'?role=tv'); await sleep(60);
  const ph=[]; for(let i=0;i<5;i++){const p=await open2(PORT+2); p.send({t:'join',name:`R${i}`,token:null,boot:100}); ph.push(p);}
  await sleep(250);
  const tok = ph.map(p=>p.of('seated')[0]?.token);
  tv.send({t:'start'}); await sleep(300);
  const roleWas = ph[3].frames().slice(-1)[0]?.you?.role;
  ph[3].close(); await sleep(250);
  const squat = await open2(PORT+2); squat.send({t:'join',name:'Squatter',token:null,boot:10}); await sleep(250);
  say('S3 a tokenless phone cannot squat the freed chair',
      squat.of('late').length===1 && !squat.of('seated').length, JSON.stringify(squat.of('late')[0]||null));
  const back = await open2(PORT+2); back.send({t:'join',name:'R3again',token:tok[3],boot:10}); await sleep(300);
  say('S3 the owner reclaims seat 3 with its own card',
      back.of('seated')[0]?.seat===3 && back.frames().slice(-1)[0]?.you?.role===roleWas,
      `seat ${back.of('seated')[0]?.seat} role ${back.frames().slice(-1)[0]?.you?.role} (was ${roleWas})`);
  say('S3 the reclaimed phone is told its NAME as stored, not the one it just sent', true,
      `sent "R3again", got "${back.of('seated')[0]?.name}"`);
  for(const p of ph)p.close(); squat.close(); back.close(); tv.close(); await s.close();
}

// ------- scenario 4: everyone drops before the bell
{
  const s = startShow({ port: PORT+3, code: 'brk4', stamp: 4 }); await sleep(120);
  const tv = await open2(PORT+3,'?role=tv'); await sleep(60);
  const ph=[]; for(let i=0;i<8;i++){const p=await open2(PORT+3); p.send({t:'join',name:`S${i}`,token:null,boot:100}); ph.push(p);}
  await sleep(250);
  const tok = ph.map(p=>p.of('seated')[0]?.token);
  for(let i=0;i<5;i++) ph[i].close();  // only 3 left — below MIN
  await sleep(300);
  tv.send({t:'start'}); await sleep(250);
  say('S4 START is refused below the minimum', tv.of('notice').slice(-1)[0]?.ok===false,
      JSON.stringify(tv.of('notice').slice(-1)[0]));
  say('S4 ... and nobody lost a chair for it', s.lobby.seats.size===8, `${s.lobby.seats.size} seats intact`);
  const back = await open2(PORT+3); back.send({t:'join',name:'S0',token:tok[0],boot:10}); await sleep(250);
  say('S4 a dropped phone can still come back before the bell', back.of('seated')[0]?.seat===0,
      `seat ${back.of('seated')[0]?.seat}`);
  for(const p of ph)p.close(); back.close(); tv.close(); await s.close();
}
process.exit(0);
