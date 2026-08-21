#!/usr/bin/env node
/** PROBE X8 — one socket that is BOTH a seated player and the mansion; and the two-tab yield. */
import { startShow } from '../../net/party/show.mjs';
import { MAX_PHONES } from '../../net/party/lobby.mjs';
import { dealCast } from '../../src/party/cast.js';

const PORT = 5317;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function open(q = '') {
  return new Promise((res) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/${q}`);
    const msgs = [];
    const box = { ws, msgs, send: (o) => ws.send(JSON.stringify(o)),
      act: (m) => ws.send(JSON.stringify({ t: 'act', msg: m })),
      last: (t) => [...msgs].reverse().find((m) => m.t === t),
      of: (t) => msgs.filter((m) => m.t === t),
      frames: () => msgs.filter((m) => m.t === 'state').map((m) => m.frame) };
    ws.onmessage = (e) => { const m = JSON.parse(e.data); msgs.push(m); if (m.t === 'ping') box.send({ t: 'pong', at: m.at }); };
    ws.onopen = () => res(box); ws.onerror = () => res(box);
  });
}
const show = startShow({ port: PORT, code: 'comb', stamp: 1700000002222 });
await sleep(100);
const tv = await open('?role=tv'); await sleep(50);
// the cheat's single connection: ?role=sim AND a chair
const both = await open('?role=sim');
both.send({ t: 'join', name: 'Alex' });
await sleep(60);
const rest = [];
for (let i = 0; i < MAX_PHONES - 1; i++) { const p = await open(); p.send({ t: 'join', name: `R${i}` }); rest.push(p); await sleep(20); }
await sleep(120);
tv.send({ t: 'start' });
await sleep(300);
console.log('one connection, ?role=sim + {t:"join"} — message types it receives:',
  [...new Set(both.msgs.map((m) => m.t))].join(','));
console.log('  its own card :', JSON.stringify(both.frames().filter((f) => f.you).slice(-1)[0]?.you));
console.log('  its brief    :', JSON.stringify(both.of('brief').slice(-1)[0] || both.of('brief')[0]));
console.log('  seated as    :', JSON.stringify(both.last('seated')));
console.log('  truth seed   :', show.sessionNow().state.worldSeed);

// ---- how much does N chairs buy, at 8 players?
console.log('\nN chairs held by one guest at 8 players (10000 deals):');
const N = 10000;
for (const k of [1, 2, 3, 4]) {
  let sawEvil = 0, wholeTeam = 0;
  for (let i = 0; i < N; i++) {
    const d = dealCast({ count: 8, castSeed: (Math.random() * 2 ** 32) >>> 0 });
    const seats = d.seats.slice().sort(() => Math.random() - 0.5).slice(0, k);
    const evilHeld = seats.filter((s) => s.alignment === 'evil');
    if (evilHeld.length) { sawEvil++; wholeTeam++; }        // one evil card => the panel names the other
  }
  console.log(`  ${k} chair(s): P(holds a Production card) = ${(sawEvil / N * 100).toFixed(1)}%  -> that card's panel names the whole team, so P(knows both traitors) = ${(wholeTeam / N * 100).toFixed(1)}%   (chance of naming both by guess: ${(100 / 28).toFixed(1)}%)`);
}
process.exit(0);
