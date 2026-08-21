#!/usr/bin/env node
/** PROBE X6 — phantom chairs from a multi-join socket, TV displacement, and the dead. */
import { startShow, playerIdOf } from '../net/party/show.mjs';
import { PHASE } from '../src/party/phases.js';
import { COMPOSITION } from '../src/party/cast.js';

const PORT = 5315;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => console.log(...a);
function open(q = '') {
  return new Promise((res) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/${q}`);
    const msgs = [];
    const box = { ws, msgs, send: (o) => ws.send(JSON.stringify(o)),
      act: (msg) => ws.send(JSON.stringify({ t: 'act', msg })),
      of: (t) => msgs.filter((m) => m.t === t), last: (t) => [...msgs].reverse().find((m) => m.t === t),
      frames: () => msgs.filter((m) => m.t === 'state').map((m) => m.frame),
      close: () => { try { ws.close(); } catch {} } };
    ws.onmessage = (e) => { const m = JSON.parse(e.data); msgs.push(m); if (m.t === 'ping') box.send({ t: 'pong', at: m.at }); };
    ws.onopen = () => res(box); ws.onerror = () => res(box);
  });
}

const show = startShow({ port: PORT, code: 'seat', stamp: 1700000000789 });
await sleep(100);
const tv = await open('?role=tv');
await sleep(50);

// ---- H · one socket takes four chairs in the LOBBY, then closes the tab
say('=== H · a phantom roster ===');
const greedy = await open();
for (let i = 0; i < 4; i++) { greedy.send({ t: 'join', name: `Ghost${i}` }); await sleep(40); }
const real = [];
for (let i = 0; i < 4; i++) { const p = await open(); p.send({ t: 'join', name: `Real${i}` }); real.push(p); await sleep(30); }
await sleep(100);
say('H1  lobby seats:', show.lobby.seats.size, '| live:', [...show.lobby.seats.values()].filter((s) => s.live).length);
greedy.close();
await sleep(250);
const live = [...show.lobby.seats.values()].filter((s) => s.live);
say('H2  the greedy tab is CLOSED. lobby still calls live:', live.length,
  '->', live.map((s) => s.name).join(','));
say('H3  humans actually in the room: 4 (Real0-3). The television will print', live.length);
const r = show.begin(Date.now());
say('H4  START ->', JSON.stringify(r), '| dealt for', show.sessionNow() && show.sessionNow().state.players.length, 'players');
if (show.sessionNow()) {
  const n = show.sessionNow().state.players.length;
  say('H5  execution threshold is floor(n/2)+1 =', Math.floor(n / 2) + 1, 'of', 4, 'people who can actually vote',
    Math.floor(n / 2) + 1 > 4 ? '-> NOBODY CAN EVER BE EXECUTED' : '-> unanimity');
}

// ---- I · the television, displaced
say('\n=== I · the host screen, displaced ===');
const before = tv.frames().length;
const fakeTV = await open('?role=tv');
await sleep(150);
show.sessionNow().refresh();
await sleep(200);
say('I1  real TV frames since the impostor connected:', tv.frames().length - before);
say('I2  impostor TV frames:', fakeTV.frames().length, '| got a hello with the join code:',
  JSON.stringify(fakeTV.last('hello')));

// ---- J · the dead
say('\n=== J · a dead player ===');
let guard = 0;
while (show.sessionNow().state.phase !== PHASE.EXPEDITION && guard++ < 30) { fakeTV.send({ t: 'skip' }); await sleep(70); }
const st = show.sessionNow().state;
const sim = await open('?role=sim');
await sleep(100);
sim.send({ t: 'expedition', outcome: 'taken' });
await sleep(80);
fakeTV.send({ t: 'skip' }); await sleep(250);
const deadId = (show.sessionNow().state.players.find((p) => !p.alive) || {}).id;
say('J0  dead:', deadId);
const idxOf = (pid) => Number(pid.slice(1)) - 1;
const deadSock = real.find((p) => p.last('seated') && p.last('seated').playerId === deadId);
if (!deadSock) { say('J-  the dead chair belonged to the closed greedy tab; skipping'); }
else {
  deadSock.act({ t: 'claim', claim: 'Camera Op' }); await sleep(80);
  say('J1  dead publishes a claim ->', JSON.stringify(deadSock.last('refused')));
  deadSock.act({ t: 'cast', runner: 'p1', guide: 'p2' }); await sleep(80);
  say('J2  dead casts a ballot   ->', JSON.stringify(deadSock.last('refused')));
  deadSock.send({ t: 'drive', heading: 0, detent: 3 }); await sleep(80);
  say('J3  dead sends {t:"drive"} ->', JSON.stringify(deadSock.last('refused')));
  say('J3b (drive never consults p.alive — only pair.runner)');
}
process.exit(0);
