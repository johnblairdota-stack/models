#!/usr/bin/env node
/** PROBE X7 — every byte a phone is sent over a whole game, on the {t:'event'} path. */
import { startShow } from '../../net/party/show.mjs';
import { MAX_PHONES } from '../../net/party/lobby.mjs';
import { PHASE } from '../../src/party/phases.js';
import { audienceFor, keyPaths } from '../../net/party/entitle.js';

const PORT = 5316;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function open(q = '') {
  return new Promise((res) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/${q}`);
    const msgs = [];
    const box = { ws, msgs, send: (o) => ws.send(JSON.stringify(o)),
      act: (msg) => ws.send(JSON.stringify({ t: 'act', msg })),
      last: (t) => [...msgs].reverse().find((m) => m.t === t),
      events: () => msgs.filter((m) => m.t === 'event').map((m) => m.ev),
      frames: () => msgs.filter((m) => m.t === 'state').map((m) => m.frame),
      close: () => { try { ws.close(); } catch {} } };
    ws.onmessage = (e) => { const m = JSON.parse(e.data); msgs.push(m); if (m.t === 'ping') box.send({ t: 'pong', at: m.at }); };
    ws.onopen = () => res(box); ws.onerror = () => res(box);
  });
}
const show = startShow({ port: PORT, code: 'evts', stamp: 1700000001111 });
await sleep(100);
const tv = await open('?role=tv');
await sleep(50);
const phones = [];
for (let i = 0; i < MAX_PHONES; i++) { const p = await open(); p.send({ t: 'join', name: `R${i + 1}` }); phones.push(p); await sleep(20); }
await sleep(120);
tv.send({ t: 'start' });
await sleep(200);
// play a whole show by skipping, but tap enough that resolutions are real
for (let n = 0; n < 90 && show.sessionNow().state.phase !== PHASE.REUNION; n++) {
  const st = show.sessionNow().state;
  const alive = st.players.filter((p) => p.alive).map((p) => p.id);
  const idx = (pid) => Number(pid.slice(1)) - 1;
  if (st.phase === PHASE.CASTING) for (const id of alive) phones[idx(id)].act({ t: 'cast', runner: alive[0], guide: alive[1] });
  if (st.phase === PHASE.EXPEDITION) { phones[idx(st.pair.guide)].act({ t: 'call', call: n % 2 ? 'CLEAR' : 'HOLD' }); await sleep(40); phones[idx(st.pair.runner)].act({ t: 'move', move: 'GO' }); }
  if (st.phase === PHASE.RECKONING) phones[idx(alive[0])].act({ t: 'nominate', target: alive[2] });
  if (st.phase === PHASE.VOTE) for (const id of alive) phones[idx(id)].act({ t: 'vote', choice: alive[2] });
  await sleep(90);
  tv.send({ t: 'skip' });
  await sleep(90);
}
await sleep(300);

const truth = show.sessionNow().truth();
const evilIds = new Set(truth.evil);
const goodPhone = phones.find((p, i) => !evilIds.has(`p${i + 1}`));
const evilPhone = phones.find((p, i) => evilIds.has(`p${i + 1}`));
const roleOf = Object.fromEntries(truth.seats.map((s) => [s.id, s.role]));

const types = (b) => { const m = new Map(); for (const e of b.events()) m.set(e.type, (m.get(e.type) || 0) + 1); return [...m].map(([k, v]) => `${k}x${v}`).join(' '); };
console.log('GOOD phone event stream :', types(goodPhone));
console.log('EVIL phone event stream :', types(evilPhone));
console.log('TV   event stream       :', types(tv));

// what fields do those events carry that no frame does?
const frameKeys = new Set();
for (const f of goodPhone.frames()) for (const k of keyPaths(f)) frameKeys.add(k);
const evKeys = new Map();
for (const e of goodPhone.events()) for (const k of keyPaths(e.data || {})) evKeys.set(`${e.type}.${k}`, JSON.stringify(e.data[k.split('[')[0].split('.')[0]]));
console.log('\nfields a GOOD phone gets on the event path, with the matrix audience of the same leaf name:');
for (const [k] of evKeys) {
  const leaf = k.split('.').slice(1).join('.');
  console.log('  ', k.padEnd(34), '| matrix row for leaf', leaf, '=', audienceFor(leaf) ?? '(none)');
}
// the sealed set, positively
const SEALED = ['noise.emitted', 'task.miss', 'win.checked', 'cast.deal', 'call.said', 'hunter.placed'];
for (const b of [['good', goodPhone], ['evil', evilPhone], ['tv', tv]]) {
  const bad = b[1].events().filter((e) => SEALED.includes(e.type));
  console.log(`\nSEALED events reaching the ${b[0]} socket:`, bad.length, bad.map((e) => e.type).join(','));
}
// does any event name a role or alignment that is not the recipient's own?
for (const [label, b, pid] of [['good', goodPhone, `p${phones.indexOf(goodPhone) + 1}`], ['evil', evilPhone, `p${phones.indexOf(evilPhone) + 1}`]]) {
  const leaks = [];
  for (const e of b.events()) {
    const j = JSON.stringify(e);
    for (const [id, role] of Object.entries(roleOf)) if (id !== pid && j.includes(`"${role}"`)) leaks.push(`${e.type} names ${id}'s ${role}`);
  }
  console.log(`${label} phone: events naming somebody else's role:`, leaks.length ? leaks.join(' | ') : 'none');
}
console.log('\nreunion payload received by a phone:', JSON.stringify(goodPhone.last('reunion')).slice(0, 200));
process.exit(0);
