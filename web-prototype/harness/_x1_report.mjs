#!/usr/bin/env node
/**
 * PROBE X1 — the guest with a phone browser and no devtools at all.
 * Can `GET /report` on the show server, mid-game, be turned into the whole deal?
 */
import { startShow, playerIdOf } from '../net/party/show.mjs';
import { MAX_PHONES } from '../net/party/lobby.mjs';
import { dealCast } from '../src/party/cast.js';
import { pick } from '../src/party/session.js';
import { ROOMS } from '../src/party/coverage.js';

const PORT = 5311;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function open(query = '') {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/${query}`);
    const msgs = [];
    const box = { ws, msgs, send: (o) => ws.send(JSON.stringify(o)),
      last: (t) => [...msgs].reverse().find((m) => m.t === t),
      frames: () => msgs.filter((m) => m.t === 'state').map((m) => m.frame) };
    ws.onmessage = (e) => { const m = JSON.parse(e.data); msgs.push(m); if (m.t === 'ping') box.send({ t: 'pong', at: m.at }); };
    ws.onopen = () => resolve(box); ws.onerror = () => resolve(box);
  });
}

const show = startShow({ port: PORT });
await sleep(120);
const tv = await open('?role=tv');
await sleep(60);
const phones = [];
for (let i = 0; i < MAX_PHONES; i++) { const p = await open(); p.send({ t: 'join', name: `R${i + 1}` }); phones.push(p); await sleep(25); }
await sleep(120);
tv.send({ t: 'start' });
await sleep(200);

// ---- the cheat: one fetch, no socket, no devtools, any device on the wifi
const rep = await (await fetch(`http://127.0.0.1:${PORT}/report`)).json();
console.log('\n/report while the show is RUNNING (phase %s):', rep.show && rep.show.phase);
console.log(JSON.stringify({ code: rep.code, durationMs: rep.durationMs, show: rep.show, withheld: rep.withheld }, null, 2));

// count is public: the roster the television prints and every phone receives
const count = rep.seats.filter((s) => s.live).length;
const deal = dealCast({ count, castSeed: rep.show.castSeed });
const truth = show.sessionNow().truth();

const guessed = deal.seats.map((s) => `${s.id}=${s.role}/${s.alignment}`).join(' ');
const actual = truth.seats.map((s) => `${s.id}=${s.role}/${s.alignment}`).join(' ');
console.log('\nreconstructed :', guessed);
console.log('ground truth  :', actual);
console.log('EXACT MATCH   :', guessed === actual);
console.log('evil predicted:', deal.evil.join(','), ' actual:', truth.evil.join(','));
console.log('glitched cover predicted:', deal.seats.filter(s=>s.cover).map(s=>`${s.id}->${s.cover}`).join(',') || 'none');

// and the Hunter, for every episode of the game, in advance
const hunters = [];
for (let ep = 1; ep <= 5; ep++) hunters.push(`ep${ep}=${ROOMS[pick(ROOMS.length, rep.show.worldSeed, 'hunter', ep)]}`);
console.log('hunter room, whole game, in advance:', hunters.join(' '));
console.log('actual hunter room right now       :', truth.hunterRoom);

await show.close();
process.exit(0);
