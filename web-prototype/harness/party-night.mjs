#!/usr/bin/env node
/**
 * party-night — the sit-down path: TV + two phones, lobby, casting, stub expedition, recap.
 *
 *   node harness/party-night.mjs
 *
 * Does not replace party-sockets. That gate still proves the filter over nine connections.
 * This one proves a reviewer can open a host, two phones, see the lobby, and advance.
 */

import { startServer } from '../net/party/local.mjs';
import { recapFromEvents } from '../src/party/recap.js';
import { qrMatrix } from '../src/party/qr.js';

const PORT = 5198;
let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function last(box, type) {
  return [...box.msgs].reverse().find((m) => m.t === type);
}

{
  const recap = recapFromEvents([
    { type: 'cast.pair', data: { runner: 'p1', guide: 'p2' } },
    { type: 'run.camera_lit', data: { camera: 2, episode: 1 } },
    { type: 'panel.alarm', data: { kind: 'panel' } },
    { type: 'panel.alarm', data: { kind: 'panel' } },
  ]);
  t('N0 · recap card reads camera / taken / alarms from the vis log',
    recap.cameraLit === true && recap.taken.length === 0 && recap.alarmCount === 2 && recap.runner === 'p1',
    JSON.stringify(recap));
  const dark = recapFromEvents([{ type: 'player.taken', data: { id: 'p1', seat: 0 } }]);
  t('N0b · a take without a lit camera is STAYED DARK + TAKEN',
    dark.cameraLit === false && dark.taken[0].id === 'p1');
}

{
  const { modules, size } = qrMatrix('http://localhost:5178/?view=party.phone&room=test');
  const finder = (ox, oy) => modules[oy][ox] === 1 && modules[oy + 6][ox + 6] === 1 && modules[oy + 3][ox + 3] === 1;
  t('N1 · QR encodes a join URL with three finder patterns',
    size >= 21 && finder(0, 0) && finder(size - 7, 0) && finder(0, size - 7),
    `v size ${size}`);
}

const srv = startServer({ port: PORT, count: 8, castSeed: 21, worldSeed: 3, code: 'night' });
await sleep(120);
const base = `ws://localhost:${PORT}/?room=night`;

const host = await open(`${base}&seat=tv`);
t('N2 · host with seat=tv is the TV spectator, not a robot',
  host.welcome?.t === 'welcome' && host.welcome.id === 'tv' && host.welcome.isTV === true,
  JSON.stringify({ id: host.welcome?.id, isTV: host.welcome?.isTV }));

const a = await open(base);
const b = await open(base);
await sleep(80);

t('N3 · two phones claim robot seats',
  a.welcome?.t === 'welcome' && b.welcome?.t === 'welcome'
    && a.welcome.id !== 'tv' && b.welcome.id !== 'tv' && a.welcome.id !== b.welcome.id,
  `${a.welcome?.id} + ${b.welcome?.id}`);

const lobby = last(host, 'lobby');
const live = (lobby?.seats || []).filter((s) => !s.isTV && s.connected);
t('N4 · TV lobby lists both phones as live',
  live.length >= 2 && live.some((s) => s.id === a.welcome.id) && live.some((s) => s.id === b.welcome.id),
  live.map((s) => s.id).join(','));

t('N4b · lobby rows do not carry a role or alignment',
  (lobby?.seats || []).every((s) => s.role == null && s.alignment == null));

a.send({ t: 'name', name: 'Ada' });
b.send({ t: 'name', name: 'Bea' });
await sleep(60);
const named = last(host, 'lobby');
t('N5 · phones can set a published name',
  (named?.seats || []).some((s) => s.name === 'Ada') && (named?.seats || []).some((s) => s.name === 'Bea'));

host.send({ t: 'start' });
host.send({ t: 'casting' });
await sleep(80);
t('N6 · host opens CASTING',
  last(host, 'state')?.frame?.phase === 'CASTING' || last(a, 'state')?.frame?.phase === 'CASTING',
  last(host, 'state')?.frame?.phase);

a.send({ t: 'ballot', runner: b.welcome.playerId, guide: a.welcome.playerId });
b.send({ t: 'ballot', runner: a.welcome.playerId, guide: b.welcome.playerId });
await sleep(80);
const ballots = last(host, 'ballots');
t('N7 · casting ballots are public and attributed',
  (ballots?.votes || []).length === 2
    && ballots.votes.every((v) => v.voter && v.runner && v.guide && v.runner !== v.guide),
  JSON.stringify(ballots?.votes));

host.send({ t: 'episode', opts: {} });
await sleep(220);

const hostEvs = host.msgs.filter((m) => m.t === 'event').map((m) => m.ev);
const aEvs = a.msgs.filter((m) => m.t === 'event').map((m) => m.ev);
const bEvs = b.msgs.filter((m) => m.t === 'event').map((m) => m.ev);

t('N8 · episode ran: casting pair + expedition + recap phase',
  hostEvs.some((e) => e.type === 'cast.pair')
    && hostEvs.some((e) => e.type === 'phase.EXPEDITION')
    && hostEvs.some((e) => e.type === 'phase.RECAP'),
  [...new Set(hostEvs.map((e) => e.type))].join(','));

const card = recapFromEvents(hostEvs);
t('N9 · TV can build a recap card from the vis log it actually received',
  card.alarmCount >= 1 && (card.cameraLit === true || card.taken.length >= 0),
  JSON.stringify(card));

t('N10 · TV never received a role card or a flyover',
  !hostEvs.some((e) => e.type === 'role.card')
    && host.msgs.filter((m) => m.t === 'state').every((m) => m.frame?.flyover == null));

const aCards = aEvs.filter((e) => e.type === 'role.card');
const bCards = bEvs.filter((e) => e.type === 'role.card');
t('N11 · each phone got only its own role card',
  aCards.every((e) => e.for === a.welcome.playerId)
    && bCards.every((e) => e.for === b.welcome.playerId)
    && !aEvs.some((e) => e.type === 'role.card' && e.for === b.welcome.playerId)
    && !bEvs.some((e) => e.type === 'role.card' && e.for === a.welcome.playerId),
  `a=${aCards.length} b=${bCards.length}`);

t('N12 · no SEALED event on any of the three sockets',
  ![...hostEvs, ...aEvs, ...bEvs].some((e) => e.vis === 'SEALED'));

const tok = a.welcome.token;
a.close();
await sleep(100);
const back = await open(`${base}&token=${tok}`);
await sleep(80);
t('N13 · a dropped phone reconnects to the same seat by token',
  back.welcome?.resumed === true && back.welcome?.id === a.welcome.id,
  JSON.stringify({ id: back.welcome?.id, resumed: back.welcome?.resumed }));

const replay = back.msgs.filter((m) => m.t === 'event' && m.replay);
t('N13b · catch-up is entitled replay, not a dump',
  replay.length > 0 && replay.every((m) => m.ev.vis !== 'SEALED' && (!m.ev.for || m.ev.for === a.welcome.playerId)),
  `${replay.length} replayed`);

host.send({ t: 'show', beat: 'recap' });
await sleep(40);
t('N14 · host can pace the room onto the recap beat',
  last(b, 'show')?.beat === 'recap' && last(back, 'show')?.beat === 'recap');

for (const c of [host, a, b, back]) c.close();
srv.close();
console.log(`\nparty-night: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
