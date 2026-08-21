#!/usr/bin/env node
/** _room-probe5 — CRITIC PROBE. The reconnect, end to end, late in a show. */
import { startShow } from '../net/party/show.mjs';
import { PHASE } from '../src/party/phases.js';
import { roomGate, ROOM_SETTLE } from '../src/views/expedition.js';

// fix D's off-by-one: hold each room a hair past the settle window
{ const g = roomGate(ROOM_SETTLE); let r=0;
  for (let i=0;i<60*90;i++){ const t=i/60; if (g(Math.floor(t/0.40)%2?'gallery':'ballroom', t)) r++; }
  console.log(`D(fixed) · worst alternation the gate permits → ${r} relights in 90 s = ${(r/90).toFixed(2)} Hz (Harding limit 3 Hz)`);
}

const PORT = 5273;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function open(query = '') {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/${query}`);
    const msgs = [], marks = [];
    const box = { ws, msgs, marks, t0: Date.now(),
      send: (o) => ws.send(JSON.stringify(o)),
      of: (ty) => msgs.filter((m) => m.t === ty), close: () => { try { ws.close(); } catch {} } };
    ws.onmessage = (e) => { const m = JSON.parse(e.data); m.__at = Date.now(); m.__bytes = e.data.length; msgs.push(m); if (m.t === 'ping') box.send({ t: 'pong', at: m.at }); };
    ws.onopen = () => { box.opened = Date.now(); resolve(box); };
    ws.onerror = () => resolve(box);
  });
}
const show = startShow({ port: PORT, code: 'p5', stamp: 1700000000000 });
await sleep(120);
const tv = await open('?role=tv');
const phones = [];
for (let i=0;i<8;i++){ const p = await open(''); p.send({ t:'join', name:`G${i+1}`, boot:3000, ua:'probe' }); phones.push(p); await sleep(15); }
await sleep(120);
tv.send({ t:'start' }); await sleep(200);
const sess = show.sessionNow();
const tok = phones[2].of('seated')[0].token;

// Play forward a few episodes so the log is realistic, tapping as we go.
let guard = 0;
while (sess.state.episode < 3 && guard++ < 120) {
  const ph = sess.state.phase;
  if (ph === PHASE.CASTING) { const a = sess.state.players.filter(p=>p.alive).map(p=>p.id);
    phones.forEach((p,i)=>p.send({t:'act',msg:{t:'cast',runner:a[0],guide:a[1]}})); }
  if (ph === PHASE.RECKONING) { const a = sess.state.players.filter(p=>p.alive).map(p=>p.id);
    phones.forEach((p)=>p.send({t:'act',msg:{t:'nominate',target:a[2]}})); }
  if (ph === PHASE.VOTE) { const a = sess.state.players.filter(p=>p.alive).map(p=>p.id);
    phones.forEach((p)=>p.send({t:'act',msg:{t:'vote',choice:a[2]}})); }
  await sleep(40);
  tv.send({ t:'skip' }); await sleep(60);
}
console.log('\nsimulated up to episode', sess.state.episode, 'phase', sess.state.phase);

// ---- the phone locks during the DEBRIEF, then is picked up
guard = 0; while (sess.state.phase !== PHASE.DEBRIEF && guard++ < 60) { tv.send({t:'skip'}); await sleep(70); }
console.log('phase now', sess.state.phase, '· phone 3 locks its screen');
const before = phones[2].msgs.length;
phones[2].close();
await sleep(300);

const t0 = Date.now();
const back = await open('');
const tOpen = Date.now();
back.send({ t: 'join', name: 'G3', token: tok, ua: 'probe' });
await new Promise((res) => { const iv = setInterval(() => { if (back.of('state').length) { clearInterval(iv); res(); } }, 5); setTimeout(() => { clearInterval(iv); res(); }, 4000); });
const tFrame = Date.now();
const seated = back.of('seated')[0];
const replay = back.msgs.filter((m) => m.replay);
const bytes = back.msgs.reduce((a,m)=>a+m.__bytes,0);
console.log('\nRECONNECT, END TO END (localhost, so this is the floor, not the number in a lounge)');
console.log('  socket open        :', tOpen - t0, 'ms');
console.log('  seated echoed      :', (seated?.__at ?? tFrame) - t0, 'ms');
console.log('  first state frame  :', tFrame - t0, 'ms');
console.log('  replayed events    :', replay.length, 'messages,', replay.reduce((a,m)=>a+m.__bytes,0), 'bytes');
console.log('  total on the wire  :', back.msgs.length, 'messages,', bytes, 'bytes');
console.log('  same seat?         :', seated?.seat, '· same token?', seated?.token === tok);
console.log('  what the player sees while waiting: the phone renders nothing new until the frame lands;');
console.log('  the clock keeps counting from the LAST frame it held, which is', 
  (sess.state.clock.endsAt - Date.now() > 0 ? 'still running' : 'already past zero'));

// how big does the replay get at the end of a long show?
const sk = sess.sockets.find((s) => s.id === 'phone-2');
console.log('  events visible to this seat in the whole log so far:', sess.replayFor(sk).length,
  '(log holds', sess.log.all().length, 'total)');
process.exit(0);
