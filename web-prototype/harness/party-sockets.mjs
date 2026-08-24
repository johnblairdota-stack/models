#!/usr/bin/env node
/**
 * 🔌 **party-sockets — NINE REAL CONNECTIONS, AND THE FILTER SURVIVES THE TRANSPORT.**
 *
 *   node harness/party-sockets.mjs
 *
 * `party-isolation` proves the projection with an injected transport, which is the right way to
 * test a rule. This file proves the OTHER half: that a real socket layer in front of it does not
 * quietly undo the work — by broadcasting, by welcoming a joiner with a full snapshot, or by
 * handing a reconnecting phone the seat that happened to be free.
 *
 * All three are real bugs from this repo's own history rather than hypotheticals:
 *   · `net/server.mjs` L114-120 — the entire wire is `broadcast()`
 *   · `net/server.mjs` L335-336 — `welcome` hands every joiner every peer's state
 *   · `cuddle-wars-3d/server/relay.js` — forwards every frame to every peer in the room
 *
 * ⚠️ IT DRIVES `net/party/local.mjs`, NOT PARTYKIT, and that limit is real: the adapter seam in
 * `net/party/server.js` is not covered by any gate here. Both wrap the same `createRoom`, so
 * what is proven is the room and the socket discipline, not Cloudflare's parameter shapes.
 */

import { startServer, CAPACITY, makeCode } from '../net/party/local.mjs';

const PORT = 5197;
let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Open a socket and collect everything it is sent. */
function open(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const msgs = [];
    const box = { ws, msgs, welcome: null, send: (o) => ws.send(JSON.stringify(o)), close: () => ws.close() };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      msgs.push(m);
      if (m.t === 'welcome' || m.t === 'full') { box.welcome = m; resolve(box); }
    };
    ws.onerror = () => reject(new Error('socket error'));
    setTimeout(() => resolve(box), 1500);
  });
}

const srv = startServer({ port: PORT, count: 8, castSeed: 77, worldSeed: 7 });
await sleep(150);
const base = `ws://localhost:${PORT}/?room=g1`;

// ---------------------------------------------------------------- S0/S1 · nine connections
const conns = [];
for (let i = 0; i < CAPACITY; i++) conns.push(await open(base));
await sleep(120);

t('S0 arm · every one of the nine connected and was welcomed',
  conns.every((c) => c.welcome && c.welcome.t === 'welcome'),
  `${conns.filter((c) => c.welcome?.t === 'welcome').length}/${CAPACITY}`);

const ids = conns.map((c) => c.welcome.id);
const tokens = conns.map((c) => c.welcome.token);
t('S1 · nine distinct seats and nine distinct tokens',
  new Set(ids).size === CAPACITY && new Set(tokens).size === CAPACITY,
  `${new Set(ids).size} seats incl. ${ids.filter((i) => i === 'tv').length} TV`);

// ---------------------------------------------------------------- S2 · the tenth is refused
{
  const tenth = await open(base);
  t('S2 · the tenth connection is refused, not silently seated',
    tenth.welcome && tenth.welcome.t === 'full', JSON.stringify(tenth.welcome));
  tenth.close();
}

// ---------------------------------------------------------------- drive a real game over the wire
conns[0].send({ t: 'start' });
await sleep(60);
conns[0].send({ t: 'episode', opts: { hunterRoom: 'cellar' } });
await sleep(80);
{
  const room0 = srv.rooms.get('g1');
  const pair0 = room0.game.state.pair;
  t('S2b · N=8 empty-noop waits — unused===0 must not invent a rotation pair',
    !pair0?.runner && !pair0?.guide, JSON.stringify(pair0));
}
const phones = conns.filter((c) => c.welcome.playerId);
const pid = phones.map((c) => c.welcome.playerId);
phones[0].send({ t: 'ballot', runner: pid[0], guide: pid[1] });
phones[1].send({ t: 'ballot', runner: pid[1], guide: pid[2] });
await sleep(60);
conns[0].send({ t: 'episode', opts: { hunterRoom: 'cellar' } });
await sleep(60);
conns[0].send({ t: 'episode', opts: { hunterRoom: 'gallery', takeRunner: true } });
await sleep(200);

const room = srv.rooms.get('g1');
const truth = room.game.truth();
const seatOf = new Map(truth.seats.map((s) => [s.id, s]));
const byId = new Map(conns.map((c) => [c.welcome.id, c]));

t('S3 arm · the game actually ran over the socket',
  conns.every((c) => c.msgs.some((m) => m.t === 'state')),
  `${conns[0].msgs.filter((m) => m.t === 'state').length} state frames on socket 0`);

// ---------------------------------------------------------------- S4 · no cross-talk
{
  let bad = null;
  for (const sock of room.game.sockets) {
    const c = byId.get(sock.id);
    if (!c) continue;
    const evs = c.msgs.filter((m) => m.t === 'event').map((m) => m.ev);
    for (const e of evs) {
      if (e.type === 'role.card' && e.for !== sock.playerId) bad = `${sock.id} got ${e.for}'s role card`;
      if (e.type === 'production.panel' && e.for !== sock.playerId) bad = `${sock.id} got ${e.for}'s panel`;
      if (e.type === 'production.panel' && (sock.isTV || seatOf.get(sock.playerId)?.alignment !== 'evil')) {
        bad = `${sock.id} is not evil and got a panel`;
      }
      if (e.vis === 'SEALED') bad = `${sock.id} got a SEALED entry over the wire`;
    }
    if (bad) break;
  }
  t('S4 · no socket received another socket\'s private event', bad === null,
    bad || 'role cards, panels and sealed entries all stayed put');
}

// ---------------------------------------------------------------- S5 · reconnect by token
{
  const victim = conns.find((c) => c.welcome.id === 'phone-3');
  const tok = victim.welcome.token;
  victim.close();
  await sleep(120);

  const back = await open(`${base}&token=${tok}`);
  await sleep(150);
  t('S5 · a reconnecting phone reclaims its own seat by token',
    back.welcome.t === 'welcome' && back.welcome.id === 'phone-3' && back.welcome.resumed === true,
    JSON.stringify({ id: back.welcome.id, resumed: back.welcome.resumed }));

  const replay = back.msgs.filter((m) => m.t === 'event' && m.replay);
  const sock = room.game.sockets.find((s) => s.id === 'phone-3');
  const mineOnly = replay.every((m) => {
    const e = m.ev;
    if (e.vis === 'SEALED') return false;
    if (e.for && e.for !== sock.playerId) return false;
    if (e.vis === 'EVIL' && seatOf.get(sock.playerId).alignment !== 'evil') return false;
    return true;
  });
  t('S5b · the catch-up replay is entitled-only, not a full snapshot', replay.length > 0 && mineOnly,
    `${replay.length} replayed entries · net/server.mjs L335-336 is the leak this refuses`);
  back.close();
}

// ---------------------------------------------------------------- S6 · the control
{
  const bogus = await open(`${base}&token=deadbeefdeadbeef`);
  t('S6 control · an unknown token does not resume somebody else\'s seat',
    bogus.welcome.t === 'full' || bogus.welcome.resumed === false,
    JSON.stringify(bogus.welcome.t === 'full' ? { t: 'full' } : { id: bogus.welcome.id, resumed: bogus.welcome.resumed }));
  bogus.close();
}

for (const c of conns) c.close();
srv.close();
console.log(`\nparty-sockets: ${pass} passed, ${fail} failed`);
// The server holds live handles; exit rather than await a close that waits on them.
process.exit(fail ? 1 : 0);
