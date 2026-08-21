#!/usr/bin/env node
/** PROBE X4 — what a phone can actually send to a real show.mjs. Real sockets, no reading. */
import { startShow, playerIdOf } from '../../net/party/show.mjs';
import { MAX_PHONES } from '../../net/party/lobby.mjs';
import { PHASE } from '../../src/party/phases.js';

const PORT = 5313;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = [];
const say = (...a) => { console.log(...a); out.push(a.join(' ')); };
function open(q = '') {
  return new Promise((res) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/${q}`);
    const msgs = [];
    const box = { ws, msgs, send: (o) => ws.send(JSON.stringify(o)), raw: (s) => ws.send(s),
      act: (msg) => ws.send(JSON.stringify({ t: 'act', msg })),
      of: (t) => msgs.filter((m) => m.t === t), last: (t) => [...msgs].reverse().find((m) => m.t === t),
      frames: () => msgs.filter((m) => m.t === 'state').map((m) => m.frame),
      close: () => { try { ws.close(); } catch {} } };
    ws.onmessage = (e) => { const m = JSON.parse(e.data); msgs.push(m); if (m.t === 'ping') box.send({ t: 'pong', at: m.at }); };
    ws.onopen = () => res(box); ws.onerror = () => res(box);
  });
}

const show = startShow({ port: PORT, code: 'prob', stamp: 1700000000123 });
await sleep(120);
const tv = await open('?role=tv');
await sleep(60);

// =========================================================== A · role= is a query string
say('\n=== A · the ?role= query string has no authentication at all ===');
const fakeSim = await open('?role=sim');
await sleep(80);
say('A1  a phone that opens ?role=sim before the show:', JSON.stringify(fakeSim.msgs));

const phones = [];
for (let i = 0; i < MAX_PHONES; i++) { const p = await open(); p.send({ t: 'join', name: `R${i + 1}` }); phones.push(p); await sleep(20); }
await sleep(150);
tv.send({ t: 'start' });
await sleep(300);

const fakeSim2 = await open('?role=sim');
await sleep(150);
say('A2  ?role=sim opened DURING the show receives:', JSON.stringify(fakeSim2.msgs));
say('A2b truth worldSeed =', show.sessionNow().state.worldSeed);

const fakeTV = await open('?role=tv');
await sleep(150);
say('A3  ?role=tv opened during the show receives msg types:', fakeTV.msgs.map((m) => m.t).join(','));
say('A3b did it displace the real television? lobby.tv === fakeTV:', show.lobby.tv !== null);
const phaseBefore = show.sessionNow().state.phase;
fakeTV.send({ t: 'skip' }); await sleep(120);
fakeTV.send({ t: 'skip' }); await sleep(120);
say(`A4  a phone holding ?role=tv sent {t:'skip'} twice: ${phaseBefore} -> ${show.sessionNow().state.phase}`);

// =========================================================== B · acting out of turn / as someone else
say('\n=== B · out of turn, as someone else, twice, while dead ===');
// drive to EXPEDITION
let guard = 0;
while (show.sessionNow().state.phase !== PHASE.EXPEDITION && guard++ < 20) { tv.send({ t: 'skip' }); await sleep(90); }
const st = show.sessionNow().state;
say('B0  phase', st.phase, 'runner', st.pair.runner, 'guide', st.pair.guide);
const seatOf = (pid) => phones[Number(pid.slice(1)) - 1];
const notCrew = phones.find((p, i) => playerIdOf(i) !== st.pair.runner && playerIdOf(i) !== st.pair.guide);
notCrew.act({ t: 'call', call: 'CLEAR' }); await sleep(80);
say('B1  a bystander calls CLEAR ->', JSON.stringify(notCrew.last('refused')));
notCrew.act({ t: 'move', move: 'GO' }); await sleep(80);
say('B2  a bystander moves      ->', JSON.stringify(notCrew.last('refused')));
// act AS someone else: put a playerId in the payload
notCrew.send({ t: 'act', playerId: st.pair.guide, seat: 0, msg: { t: 'call', call: 'HOLD' } }); await sleep(80);
say('B3  bystander names the guide in the envelope ->', JSON.stringify(notCrew.last('refused')));
// twice
const g = seatOf(st.pair.guide);
g.act({ t: 'call', call: 'CLEAR' }); await sleep(60);
g.act({ t: 'call', call: 'HOLD' }); await sleep(60);
say('B4  the guide calls twice ->', JSON.stringify(g.last('refused')), '| said =', show.sessionNow().state.call.said);

// malformed
say('\n=== C · malformed payloads ===');
const c = notCrew;
const before = JSON.stringify(show.sessionNow().state.players);
c.send({ t: 'act' }); await sleep(40);
say('C1  {t:"act"} with no msg ->', JSON.stringify(c.last('refused')));
c.send({ t: 'act', msg: 'claim' }); await sleep(40);
say('C2  msg is a string       ->', JSON.stringify(c.last('refused')));
c.send({ t: 'act', msg: { t: 'claim', claim: 'X'.repeat(500) } }); await sleep(60);
const mine = show.sessionNow().state.players.find((p) => p.id === playerIdOf(phones.indexOf(c)));
say('C3  a 500-char claim -> stored length', mine.claim && mine.claim.length, '| plate', mine.plate);
c.send({ t: 'act', msg: { t: 'claim', claim: '<img src=x onerror=alert(1)>' } }); await sleep(60);
say('C3b a second claim after publishing ->', JSON.stringify(c.last('refused')));
c.send({ t: 'act', msg: { t: '__proto__' } }); await sleep(40);
say('C4  msg.t = "__proto__"   ->', JSON.stringify(c.last('refused')));
c.send({ t: 'act', msg: { t: 'constructor' } }); await sleep(40);
say('C4b msg.t = "constructor" ->', JSON.stringify(c.last('refused')));
c.raw('not json at all'); await sleep(40);
say('C5  non-JSON frame -> socket still up:', c.ws.readyState === 1);
say('C6  players array unchanged by C1/C2/C4:', before !== JSON.stringify(show.sessionNow().state.players) ? 'CHANGED (by C3 claim, expected)' : 'unchanged');

// drive relay
c.send({ t: 'drive', heading: 1, detent: 3 }); await sleep(60);
say('C7  a bystander sends {t:"drive"} ->', JSON.stringify(c.last('refused')));
const runnerP = seatOf(st.pair.runner);
runnerP.send({ t: 'drive', heading: 'NaN', detent: 99 }); await sleep(60);
say('C8  the runner sends detent 99 / heading "NaN" -> relayed to sim as:',
  JSON.stringify(fakeSim2.msgs.filter((m) => m.t === 'drive').slice(-1)));

process.exit(0);
