#!/usr/bin/env node
/**
 * PROBE X2 — the seed is DERIVABLE even if you take it off /report.
 *
 * `castSeed = seedFrom(code, 'cast', stamp, count)`.  code is printed on the television, count is
 * the roster, and `stamp` is a wall-clock millisecond that the wire itself hands you:
 *   · every phone receives `{t:'ping', at: <the SERVER's Date.now()>}` four times a second
 *   · /report's connection-health half — the part X9b calls "the half nobody has to hide" —
 *     carries `durationMs = Date.now() - lobby.startedAt`, and `stamp` is one statement earlier.
 * So the attacker does NOT read show.castSeed. They subtract.
 */
import { startShow, seedFrom } from '../net/party/show.mjs';
import { MAX_PHONES } from '../net/party/lobby.mjs';
import { dealCast } from '../src/party/cast.js';

const PORT = 5312;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function open(q = '') {
  return new Promise((res) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/${q}`);
    const msgs = [];
    const box = { ws, msgs, send: (o) => ws.send(JSON.stringify(o)), lastPing: null,
      last: (t) => [...msgs].reverse().find((m) => m.t === t) };
    ws.onmessage = (e) => { const m = JSON.parse(e.data); msgs.push(m);
      if (m.t === 'ping') { box.lastPing = { at: m.at, seen: Date.now() }; box.send({ t: 'pong', at: m.at }); } };
    ws.onopen = () => res(box); ws.onerror = () => res(box);
  });
}

const show = startShow({ port: PORT });
await sleep(120);
const tv = await open('?role=tv');
await sleep(60);
const phones = [];
for (let i = 0; i < MAX_PHONES; i++) { const p = await open(); p.send({ t: 'join', name: `R${i + 1}` }); phones.push(p); await sleep(20); }
await sleep(300);
tv.send({ t: 'start' });
await sleep(400);

// ---------------------------------------------------------------------------- what a cheat has
const CODE = tv.last('hello').code;                       // printed on the television in 60pt
const roster = phones[0].last('roster').players;
const count = roster.filter((p) => p.live).length;        // the roster every phone receives
const rep = await (await fetch(`http://127.0.0.1:${PORT}/report`)).json();
const durationMs = rep.durationMs;                        // health half — "nobody has to hide" it
// server clock, from the ping the phone answers anyway
const p0 = phones[0].lastPing;
const serverNow = p0.at + (Date.now() - p0.seen);
const startedAt = serverNow - durationMs;

const truth = show.sessionNow().truth();
const truthStr = truth.seats.map((s) => `${s.id}=${s.role}/${s.alignment}`).join(' ');

console.log(`code=${CODE} count=${count} durationMs=${durationMs} -> startedAt≈${startedAt}`);
let hits = [];
for (let d = -60; d <= 60; d++) {
  const stamp = startedAt + d;
  const cand = dealCast({ count, castSeed: seedFrom(CODE, 'cast', stamp, count) });
  if (cand.seats.map((s) => `${s.id}=${s.role}/${s.alignment}`).join(' ') === truthStr) hits.push(d);
}
console.log(`±60 ms window around the derived start: ${hits.length} of 121 candidate stamps deal the true table`);
console.log('offsets that matched:', hits.join(','));

// how many candidates does an attacker have to try, and how would they confirm one?
// they cannot check against truth — but they CAN check against public behaviour. The wing
// sequence is worldSeed's; the deal is castSeed's; both come from the SAME stamp.
console.log('\nsame stamp seeds BOTH — so any public worldSeed-derived observable confirms castSeed.');
process.exit(0);
