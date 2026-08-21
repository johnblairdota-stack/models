#!/usr/bin/env node
/** _room-probe6 — CRITIC PROBE. Backpressure, and the unrated drive relay. */
import net from 'node:net';
import crypto from 'node:crypto';
import { startShow } from '../net/party/show.mjs';
import { PHASE } from '../src/party/phases.js';

const PORT = 5274;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function open(query = '') {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/${query}`);
    const msgs = [];
    const box = { ws, msgs, send: (o) => ws.send(JSON.stringify(o)), of: (ty)=>msgs.filter(m=>m.t===ty), close:()=>{try{ws.close()}catch{}} };
    ws.onmessage = (e) => { const m = JSON.parse(e.data); msgs.push(m); if (m.t==='ping') box.send({t:'pong',at:m.at}); };
    ws.onopen = () => resolve(box); ws.onerror = () => resolve(box);
  });
}
/** A phone on a link so bad it has stopped reading: the socket is up, nothing is drained. */
function deafPhone() {
  return new Promise((resolve) => {
    const s = net.connect(PORT, '127.0.0.1', () => {
      const key = crypto.randomBytes(16).toString('base64');
      s.write(`GET / HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`);
    });
    let did = false;
    s.on('data', () => { if (did) return; did = true;
      // a client-masked text frame carrying the join
      const body = Buffer.from(JSON.stringify({ t:'join', name:'Deaf', ua:'probe' }));
      const mask = crypto.randomBytes(4);
      const masked = Buffer.from(body.map((b,i)=>b^mask[i%4]));
      s.write(Buffer.concat([Buffer.from([0x81, 0x80|body.length]), mask, masked]));
      setTimeout(() => { s.pause(); resolve(s); }, 120);   // 2 bars: the radio stops draining
    });
  });
}

const show = startShow({ port: PORT, code: 'p6', stamp: 1700000000000 });
await sleep(120);
const tv = await open('?role=tv');
const phones = [];
for (let i=0;i<7;i++){ const p = await open(''); p.send({t:'join',name:`G${i+1}`,ua:'probe'}); phones.push(p); await sleep(15); }
const deaf = await deafPhone();
await sleep(200);
console.log('seats:', show.lobby.seats.size);
tv.send({ t:'start' }); await sleep(200);
const sess = show.sessionNow();

// ---- fill the deaf phone's queue for 20 s of show, compressed: pings + a tap storm
const seatOf = (n) => [...show.lobby.seats.values()].find(s=>s.seat===n);
const dead = seatOf(7);
console.log('\nBACKPRESSURE · a phone whose radio has stopped draining');
console.log('  server writableLength for that seat, right after the bell:', dead.sock.writableLength, 'bytes');
let guard=0;
while (sess.state.phase !== PHASE.CASTING && guard++<10) { tv.send({t:'skip'}); await sleep(90); }
const a = sess.state.players.filter(p=>p.alive).map(p=>p.id);
for (let round=0; round<600; round++) {
  phones.forEach((p)=>p.send({t:'act',msg:{t:'cast',runner:a[0],guide:a[1]}}));
  if (round % 20 === 0) await sleep(1);
}
await sleep(400);
console.log('  after 4200 taps (≈ a busy CASTING phase):', dead.sock.writableLength, 'bytes queued in userspace');
console.log('  is the seat still "live"?', dead.live, '· drops:', dead.drops, '· destroyed?', dead.sock.destroyed);
console.log('  → nothing anywhere checks writableLength, calls cork(), drops a stale frame or ends the socket.');
console.log('    grep: net/party/lobby.mjs send() is `if (sock && !sock.destroyed) sock.write(...)`');

// ---- the drive relay
console.log('\nDRIVE RELAY · is there a rate gate between a thumb and the mansion?');
guard=0; while (sess.state.phase !== PHASE.EXPEDITION && guard++<20) { tv.send({t:'skip'}); await sleep(80); }
const runnerId = sess.state.pair.runner;
const rSeat = Number(runnerId.slice(1))-1;
const runner = phones[rSeat] || phones[0];
const sim = await open('?role=sim');
await sleep(80);
const before = sim.msgs.length;
const N = 3000;
for (let i=0;i<N;i++) runner.send({ t:'drive', heading: i*0.001, detent: 3 });
await sleep(700);
const got = sim.of('drive').length;
console.log(`  runner sent ${N} drive messages as fast as the socket took them`);
console.log(`  the simulator received ${got} of them → ${got===N?'every one relayed, no gate at all':'some dropped'}`);
console.log('  (the phone produces one of these per pointermove — see show-phone.html wireDrive/set —');
console.log('   plus a 250 ms keepalive timer that is never cleared when EXPEDITION ends.)');
process.exit(0);
