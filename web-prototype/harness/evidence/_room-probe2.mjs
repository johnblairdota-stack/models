#!/usr/bin/env node
/** _room-probe2 — CRITIC PROBE. The sleep jump, the second television, the orphan sim. */
import { startShow } from '../../net/party/show.mjs';
import { PHASE, SECONDS, sessionSeconds } from '../../src/party/phases.js';
import { createSession } from '../../src/party/session.js';

// ============================================================ D · the laptop sleeps
// session.js takes time as an argument, so this is exact: no wall clock involved.
{
  const seen = [];
  const s = createSession({
    count: 8, castSeed: 12345, worldSeed: 6789,
    names: ['a','b','c','d','e','f','g','h'],
    send: () => {}, emit: () => {},
  });
  let now = 1_000_000;
  s.start(now);
  seen.push(s.state.phase);
  // Play the premiere honestly for 60 s, then the machine sleeps for 12 minutes.
  now += 60_000; s.tick(now);
  const beforeSleep = s.state.phase;
  now += 12 * 60_000;                       // lid closed
  // The server's beat is 250 ms; each beat calls tick(now) exactly once.
  let beats = 0;
  const phases = [];
  while (s.state.phase !== PHASE.REUNION && beats < 400) {
    s.tick(now);
    beats++;
    now += 250;
    if (phases[phases.length - 1] !== s.state.phase) phases.push(s.state.phase);
  }
  console.log('D · THE LAPTOP SLEEPS 12 MINUTES MID-PREMIERE');
  console.log('  phase at the moment of sleep :', beforeSleep);
  console.log('  250 ms beats to reach REUNION:', beats, `→ ${(beats * 0.25).toFixed(2)} s of wall clock`);
  console.log('  episodes burned              :', s.state.episode - 1, ' outcome:', s.state.outcome);
  console.log('  phases the room saw flash by :', phases.length);
  console.log('  a show that should have run  :', (sessionSeconds(5) / 60).toFixed(1), 'min');
}

// ============================================================ E · sockets
const PORT = 5272;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function open(query = '') {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/${query}`);
    const msgs = [];
    const box = { ws, msgs, send: (o) => ws.send(JSON.stringify(o)),
      of: (ty) => msgs.filter((m) => m.t === ty), last: (ty) => [...msgs].reverse().find((m) => m.t === ty),
      close: () => { try { ws.close(); } catch {} } };
    ws.onmessage = (e) => { const m = JSON.parse(e.data); msgs.push(m); if (m.t === 'ping') box.send({ t: 'pong', at: m.at }); };
    ws.onopen = () => resolve(box); ws.onerror = () => resolve(box);
  });
}
const show = startShow({ port: PORT, code: 'probe2', stamp: 1700000000000 });
await sleep(120);
const tv1 = await open('?role=tv');
const phones = [];
for (let i = 0; i < 8; i++) { const p = await open(''); p.send({ t: 'join', name: `G${i}`, boot: 3000, ua: 'probe' }); phones.push(p); await sleep(15); }
await sleep(120);
tv1.send({ t: 'start' });
await sleep(250);
const sess = show.sessionNow();

console.log('\nE · A SECOND TELEVISION OPENS THE ROOT URL');
const before = tv1.msgs.length;
const tv2 = await open('?role=tv');
await sleep(200);
// force some traffic
let g = 0; while (sess.state.phase !== PHASE.CASTING && g++ < 10) { tv1.send({ t: 'skip' }); await sleep(120); }
phones[0].send({ t: 'act', msg: { t: 'cast', runner: 'p2', guide: 'p3' } });
await sleep(250);
console.log('  tv1 messages before tv2 joined:', before, ' after:', tv1.msgs.length, ' (delta', tv1.msgs.length - before, ')');
console.log('  tv2 messages since joining    :', tv2.msgs.length);
console.log('  tv1 state frames after tv2    :', tv1.of('state').length, ' tv2:', tv2.of('state').length);
console.log('  → tv2 can also press skip? sending skip from tv2...');
const phaseA = sess.state.phase;
tv2.send({ t: 'skip' });
await sleep(200);
console.log('    phase', phaseA, '→', sess.state.phase, sess.state.phase !== phaseA ? ' (ACCEPTED from the second TV)' : ' (refused)');

console.log('\nF · AN ORPHANED SIM CAN END AN EXPEDITION');
g = 0; while (sess.state.phase !== PHASE.EXPEDITION && g++ < 20) { tv1.send({ t: 'skip' }); await sleep(110); }
console.log('  phase', sess.state.phase, ' expedition just opened');
const simA = await open('?role=sim');   // the real house
await sleep(80);
const simB = await open('?role=sim');   // a second television's iframe
await sleep(80);
simB.send({ t: 'expedition', outcome: 'taken', room: sess.state.expedition.room });
await sleep(120);
console.log('  a SECOND sim socket reported outcome=taken; session accepted?', 'wired=' + show.sessionNow().wired());
tv1.send({ t: 'skip' }); await sleep(200);
console.log('  after the phase closed, expedition outcome =', JSON.stringify(sess.state.expedition.outcome), 'phase', sess.state.phase);
const taken = sess.state.players.filter((p) => !p.alive);
console.log('  players not alive           :', taken.map((p) => p.id + (p.taken ? ' (taken)' : ' (evicted)')).join(', ') || 'none');

console.log('\nG · THE TELEVISION GOES AWAY MID-SHOW');
tv1.close(); tv2.close();
await sleep(200);
console.log('  server still ticking? phase =', sess.state.phase, '· lobby.tv =', show.lobby.tv ? 'bound' : 'null');
console.log('  can anything still start/skip? (no TV socket) — the host has no control surface at all');

// ============================================================ H · a whole show on one phone
console.log('\nH · TOTAL WIRE, ONE PHONE, WHOLE SHOW (measured so far, this probe)');
const p = phones[3];
const byType = {};
let bytes = 0;
for (const m of p.msgs) { const b = JSON.stringify(m).length; byType[m.t] = (byType[m.t] || 0) + 1; bytes += b; }
console.log('  ', JSON.stringify(byType), bytes, 'bytes');
console.log('   ping alone, over a', (sessionSeconds(5) / 60).toFixed(0), 'min show at 4 Hz:',
  (4 * sessionSeconds(5)), 'pings +', (4 * sessionSeconds(5)), 'pongs =',
  ((4 * sessionSeconds(5) * (31 + 31)) / 1024).toFixed(0), 'KB per phone,',
  (8 * 8 * sessionSeconds(5)), 'frames on the air for the room');

phones.forEach((x) => x.close()); simA.close(); simB.close();
process.exit(0);
