#!/usr/bin/env node
/** PROBE X5 — seats, tokens, displaced sockets, the fake mansion, and the dead. */
import { startShow, playerIdOf } from '../net/party/show.mjs';
import { MAX_PHONES } from '../net/party/lobby.mjs';
import { PHASE } from '../src/party/phases.js';

const PORT = 5314;
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

const show = startShow({ port: PORT, code: 'ident', stamp: 1700000000456 });
await sleep(100);
const tv = await open('?role=tv');
await sleep(50);

// ============================================ D · one socket, many seats
say('=== D · one browser tab, many chairs ===');
const greedy = await open();
for (let i = 0; i < 4; i++) { greedy.send({ t: 'join', name: `Ghost${i}` }); await sleep(40); }
say('D1  four {t:"join"} down ONE socket ->', greedy.of('seated').map((m) => `seat${m.seat}/${m.playerId}`).join(' '));
say('D1b lobby now holds', show.lobby.seats.size, 'seats, all with sock ===  the same connection:',
  [...show.lobby.seats.values()].every((s) => s.sock === [...show.lobby.seats.values()][0].sock));

// two more real phones so the composition is legal
const phones = [];
for (let i = 0; i < 4; i++) { const p = await open(); p.send({ t: 'join', name: `Real${i}` }); phones.push(p); await sleep(30); }
await sleep(120);
tv.send({ t: 'start' });
await sleep(300);
const framesByYou = {};
for (const f of greedy.frames()) if (f.you) framesByYou[f.you.id] = f.you;
say('D2  the greedy socket now receives a `you` panel for:', Object.keys(framesByYou).join(','));
say('D2b it can read all of these cards:',
  Object.entries(framesByYou).map(([id, y]) => `${id}=${y.roleName}/${y.alignment}${y.teammates ? '+mates:' + y.teammates.map(m => m.id + ':' + m.role) : ''}`).join(' | '));
say('D2c ground truth              :', show.sessionNow().truth().seats.map((s) => `${s.id}=${s.role}/${s.alignment}`).join(' '));

// ============================================ E · the token, and the displaced socket
say('\n=== E · token reclaim and the displaced socket ===');
const victim = phones[0];
const tok = victim.last('seated').token;
const victimPid = victim.last('seated').playerId;
const thief = await open();
thief.send({ t: 'join', name: 'Thief', token: tok });
await sleep(150);
say('E1  a second socket joins with a copied token ->', JSON.stringify(thief.last('seated')));
say('E2  the thief now receives frames:', thief.frames().length, '| a `you` panel for', thief.frames().filter(f=>f.you).slice(-1).map(f=>`${f.you.id}=${f.you.roleName}/${f.you.alignment}`).join(''));
const vBefore = victim.frames().length;
show.sessionNow().refresh();
await sleep(120);
say('E3  the displaced (victim) socket received', victim.frames().length - vBefore, 'new frames since — its wire is dead');
// but can the displaced socket still ACT?
let guard = 0;
while (show.sessionNow().state.phase !== PHASE.CASTING && guard++ < 20) { tv.send({ t: 'skip' }); await sleep(80); }
const alive = show.sessionNow().state.players.filter((p) => p.alive).map((p) => p.id);
victim.act({ t: 'cast', runner: alive[0], guide: alive[1] });
await sleep(120);
say('E4  the DISPLACED socket casts a ballot ->', JSON.stringify(victim.last('refused')) || 'accepted');
say('E4b did the server record it for', victimPid, '?',
  JSON.stringify(show.sessionNow().unprojected('phone-' + (Number(victimPid.slice(1)) - 1)).you.acted));
// and now close the displaced socket
victim.close();
await sleep(150);
const seatRec = [...show.lobby.seats.values()].find((s) => s.token === tok);
say('E5  after the displaced socket closes, the chair is live =', seatRec.live, '(false would mark a seated player dead)');

// ============================================ F · the fake mansion decides the episode
say('\n=== F · ?role=sim decides what happened ===');
guard = 0;
while (show.sessionNow().state.phase !== PHASE.EXPEDITION && guard++ < 20) { tv.send({ t: 'skip' }); await sleep(80); }
const sim = await open('?role=sim');
await sleep(120);
say('F0  the fake mansion was handed:', JSON.stringify(sim.msgs.filter((m) => m.t === 'brief')));
const stF = show.sessionNow().state;
say('F1  runner', stF.pair.runner, 'guide', stF.pair.guide, 'wing', stF.expedition.room);
// tell the guide the hunter is standing in the wing, wherever it really is
sim.send({ t: 'sim', runner: { x: 0, z: 0, room: stF.expedition.room, noise: 1 },
  hunter: { x: 1, z: 1, room: stF.expedition.room, wallDist: 99 } });
await sleep(150);
const gSock = 'phone-' + (Number(stF.pair.guide.slice(1)) - 1);
const gFrame = show.sessionNow().unprojected(gSock);
say('F2  the guide\'s flyover now reads:', JSON.stringify(gFrame.flyover && { hunter: gFrame.flyover.hunter, room: gFrame.flyover.room }));
// and simply declare the runner taken
sim.send({ t: 'expedition', outcome: 'taken' });
await sleep(80);
tv.send({ t: 'skip' }); await sleep(200);
const runnerNow = show.sessionNow().state.players.find((p) => p.id === stF.pair.runner);
say('F3  after {t:"expedition",outcome:"taken"} from an unauthenticated socket: runner alive =',
  runnerNow.alive, '| taken =', runnerNow.taken, '| outcome =', show.sessionNow().state.expedition.outcome);

// ============================================ G · the dead
say('\n=== G · a dead player\'s socket ===');
const dead = show.sessionNow().state.players.find((p) => !p.alive);
if (dead) {
  const dSock = phones.find((p) => p.last('seated') && p.last('seated').playerId === dead.id)
    || greedy;
  dSock.act({ t: 'claim', claim: 'Camera Op' }); await sleep(80);
  say('G1  a dead player publishes a claim ->', JSON.stringify(dSock.last('refused')));
  dSock.act({ t: 'nominate', target: alive[0] }); await sleep(80);
  say('G2  a dead player nominates          ->', JSON.stringify(dSock.last('refused')));
}
process.exit(0);
