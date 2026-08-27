import { tallyCasting } from '../src/party/ballot.js';

const CODE = 'w' + Math.random().toString(36).slice(2, 5);
const WS = 5181;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function open(wantTV) {
  return new Promise((resolve, reject) => {
    const q = wantTV ? `room=${CODE}&seat=tv` : `room=${CODE}`;
    const ws = new WebSocket(`ws://127.0.0.1:${WS}/?${q}`);
    const box = { ws, msgs: [], playerId: null, isTV: wantTV };
    ws.onmessage = (e) => {
      const m = JSON.parse(typeof e.data === 'string' ? e.data : e.data.toString());
      box.msgs.push(m);
      if (m.t === 'welcome') {
        box.playerId = m.playerId;
        box.id = m.id;
        box.isTV = m.isTV;
        resolve(box);
      }
      if (m.t === 'full') reject(new Error('full: ' + JSON.stringify(m)));
    };
    ws.onerror = () => reject(new Error('ws error'));
    setTimeout(() => reject(new Error('welcome timeout')), 5000);
  });
}
const send = (box, o) => box.ws.send(JSON.stringify(o));

console.log('CODE', CODE);
const tv = await open(true);
console.log('TV', { id: tv.id, playerId: tv.playerId, isTV: tv.isTV });
const phones = [];
for (const name of ['Ada', 'Ben', 'Cy', 'Dee']) {
  const p = await open(false);
  send(p, { t: 'name', name });
  send(p, { t: 'look', shell: '#d4a574', accent: '#c45c26' });
  phones.push({ ...p, name });
  console.log('PHONE', name, p.playerId);
}
await sleep(400);
send(tv, { t: 'start' });
send(tv, { t: 'casting' });
await sleep(400);

const ids = phones.map((p) => p.playerId);
console.log('IDS', ids);

for (const p of phones) {
  send(p, { t: 'ballot', runner: ids[0], guide: ids[1] });
}
await sleep(300);

const ballotMsgs = tv.msgs.filter((m) => m.t === 'ballots');
console.log('BALLOT_FANOUTS', ballotMsgs.length);
console.log('LAST_BALLOTS', JSON.stringify(ballotMsgs.at(-1)));

send(tv, { t: 'episode', opts: {} });
await sleep(500);

const states = tv.msgs.filter((m) => m.t === 'state');
const last = states.at(-1);
console.log('PAIR', last?.frame?.pair);
console.log('PHASE', last?.frame?.phase, 'EP', last?.frame?.episode);

const events = tv.msgs.filter((m) => m.t === 'event' && m.ev).map((m) => m.ev);
const castEv = events.filter((e) => e.type === 'cast.pair' || e.type === 'cast.ballot');
console.log('CAST_EVENTS', JSON.stringify(castEv, null, 2));

const expected = tallyCasting({
  ballots: ids.map((v) => ({ voter: v, runner: ids[0], guide: ids[1] })),
  living: ids,
  history: Object.fromEntries(ids.map((id) => [id, { expeditions: 0, lastEp: null }])),
  lastPair: { runner: null, guide: null },
  ep: 1,
  matchSeed: 1,
});
console.log('EXPECTED', expected);
const ok = last?.frame?.pair?.runner === ids[0] && last?.frame?.pair?.guide === ids[1];
console.log('MATCH_UNANIMOUS', ok);

for (const b of [tv, ...phones]) try { b.ws.close(); } catch {}
process.exit(ok ? 0 : 1);
