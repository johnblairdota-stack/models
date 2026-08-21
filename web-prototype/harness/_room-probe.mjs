#!/usr/bin/env node
/**
 * _room-probe — CRITIC PROBE, NOT A GATE. Measures the physical-room cost of the show:
 * bytes and messages per phone per second, the guide's flyover frame, and the sleep jump.
 * Read-only against the shipped modules. Delete freely.
 */
import { startShow, playerIdOf } from '../net/party/show.mjs';
import { PHASE, SECONDS, orderFor, sessionSeconds } from '../src/party/phases.js';

const PORT = 5271;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(query = '', label = '') {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/${query}`);
    const stat = { label, n: 0, bytes: 0, byType: {}, bytesByType: {}, msgs: [] };
    const box = {
      ws, stat,
      send: (o) => ws.send(JSON.stringify(o)),
      act: (msg) => ws.send(JSON.stringify({ t: 'act', msg })),
      last: (ty) => [...stat.msgs].reverse().find((m) => m.t === ty),
      close: () => { try { ws.close(); } catch {} },
    };
    ws.onmessage = (e) => {
      const raw = e.data;
      const m = JSON.parse(raw);
      stat.n++; stat.bytes += raw.length;
      stat.byType[m.t] = (stat.byType[m.t] || 0) + 1;
      stat.bytesByType[m.t] = (stat.bytesByType[m.t] || 0) + raw.length;
      stat.msgs.push(m);
      if (m.t === 'ping') box.send({ t: 'pong', at: m.at });
    };
    ws.onopen = () => resolve(box);
    ws.onerror = () => resolve(box);
  });
}

const show = startShow({ port: PORT, code: 'probe', stamp: 1700000000000 });
await sleep(150);

const tv = await open('?role=tv', 'tv');
const phones = [];
for (let i = 0; i < 8; i++) {
  const p = await open('', `p${i + 1}`);
  p.send({ t: 'join', name: `Guest${i + 1}`, boot: 3000 + i * 200, ua: 'probe' });
  phones.push(p);
  await sleep(20);
}
await sleep(150);
tv.send({ t: 'start' });
await sleep(250);

const sess = show.sessionNow();
console.log('phase after start:', sess.state.phase, 'players', sess.state.players.length);

// ---- reset counters after the join burst so we measure steady state
const reset = (b) => { b.stat.n = 0; b.stat.bytes = 0; b.stat.byType = {}; b.stat.bytesByType = {}; };

// =============================================================== A · frame sizes
{
  const f = phones[0].last('state');
  const tvf = tv.last('state');
  console.log('\nA · FRAME SIZE (PREMIERE, 8 players)');
  console.log('  phone state frame bytes :', JSON.stringify({ t: 'state', frame: f.frame }).length);
  console.log('  tv    state frame bytes :', JSON.stringify({ t: 'state', frame: tvf.frame }).length);
  console.log('  roster msg bytes        :', JSON.stringify(phones[0].last('roster')).length);
  console.log('  ping msg bytes          :', JSON.stringify(phones[0].last('ping')).length);
}

// =============================================================== B · the expedition, wired
// Drive the session to EXPEDITION and attach a sim reporting at the shipped 5 Hz.
const sim = await open('?role=sim', 'sim');
await sleep(80);
let guard = 0;
while (sess.state.phase !== PHASE.EXPEDITION && guard++ < 20) { tv.send({ t: 'skip' }); await sleep(120); }
console.log('\nB · phase now', sess.state.phase, 'pair', JSON.stringify(sess.state.pair));

const guideId = sess.state.pair.guide;
const guideSeat = Number(guideId.slice(1)) - 1;
const guide = phones[guideSeat];
const bystander = phones[(guideSeat + 1) % 8];
reset(guide); reset(bystander); reset(tv);

// 450 reports = the shipped 0.2s cadence over a full 90s expedition.
const REPORTS = 450;
const t0 = Date.now();
for (let i = 0; i < REPORTS; i++) {
  sim.send({ t: 'sim', clock: 90 - i * 0.2,
    runner: { x: 1 + (i % 40) * 0.1, z: -2 + (i % 30) * 0.1, room: 'gallery', noise: 0.4 },
    hunter: { x: 7 + (i % 20) * 0.1, z: 3, room: 'ballroom', state: 'hunt', wallDist: 1.2 } });
  if (i % 25 === 0) await sleep(4);
}
await sleep(400);
const el = (Date.now() - t0) / 1000;
console.log(`  ${REPORTS} sim reports (one wired 90 s expedition) delivered in ${el.toFixed(2)}s of probe time`);
console.log('  GUIDE     received:', guide.stat.n, 'msgs', guide.stat.bytes, 'bytes', JSON.stringify(guide.stat.byType));
console.log('  bystander received:', bystander.stat.n, 'msgs', bystander.stat.bytes, 'bytes', JSON.stringify(bystander.stat.byType));
console.log('  TV        received:', tv.stat.n, 'msgs', tv.stat.bytes, 'bytes', JSON.stringify(tv.stat.byType));
const gf = guide.last('state');
console.log('  guide frame bytes  :', JSON.stringify({ t: 'state', frame: gf.frame }).length);
if (gf.frame.flyover) {
  console.log('  ...of which flyover:', JSON.stringify(gf.frame.flyover).length,
    '(plan rows:', gf.frame.flyover.plan?.length, ', marks:', gf.frame.flyover.marks?.length, ')');
}
console.log('  → per real second on the guide phone:',
  (guide.stat.bytes / 90).toFixed(0), 'B/s,', (guide.stat.n / 90).toFixed(1), 'msg/s (sim traffic only)');

// =============================================================== C · a tap storm
reset(tv); phones.forEach(reset);
guard = 0;
while (sess.state.phase !== PHASE.CASTING && guard++ < 40) { tv.send({ t: 'skip' }); await sleep(90); }
console.log('\nC · CASTING tap storm — phase', sess.state.phase);
reset(tv); phones.forEach(reset);
const alive = sess.state.players.filter((p) => p.alive).map((p) => p.id);
for (let i = 0; i < 8; i++) {
  phones[i].act({ t: 'cast', runner: alive[0], guide: alive[1] });
  await sleep(15);
}
await sleep(300);
console.log('  8 taps →', phones.map((p) => p.stat.byType.state || 0).join('/'), 'state frames per phone');
console.log('  bytes on one phone from 8 taps:', phones[0].stat.bytesByType.state || 0);
console.log('  bytes on the TV from 8 taps   :', tv.stat.bytesByType.state || 0);
let tot = phones.reduce((a, p) => a + (p.stat.bytesByType.state || 0), 0) + (tv.stat.bytesByType.state || 0);
console.log('  total wire cost of 8 taps     :', tot, 'bytes');

await show.close();
tv.close(); sim.close(); phones.forEach((p) => p.close());
process.exit(0);
