import { tallyCasting } from '../src/party/ballot.js';

const WS = 5181;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

function open(code, wantTV) {
  return new Promise((resolve, reject) => {
    const q = wantTV ? `room=${code}&seat=tv` : `room=${code}`;
    const ws = new WebSocket(`ws://127.0.0.1:${WS}/?${q}`);
    const box = { ws, msgs: [], playerId: null, isTV: wantTV };
    ws.onmessage = (e) => {
      const m = JSON.parse(typeof e.data === 'string' ? e.data : e.data.toString());
      box.msgs.push(m);
      if (m.t === 'welcome') { box.playerId = m.playerId; box.id = m.id; box.isTV = m.isTV; resolve(box); }
      if (m.t === 'full') reject(new Error('full'));
    };
    ws.onerror = () => reject(new Error('ws error'));
    setTimeout(() => reject(new Error('welcome timeout')), 5000);
  });
}
const send = (box, o) => box.ws.send(JSON.stringify(o));

async function runCombo(id, buildBallots) {
  const CODE = 'v' + Math.random().toString(36).slice(2, 5);
  const tv = await open(CODE, true);
  const phones = [];
  for (const name of ['Ada', 'Ben', 'Cy', 'Dee']) {
    const p = await open(CODE, false);
    send(p, { t: 'name', name });
    phones.push(p);
  }
  await sleep(200);
  send(tv, { t: 'start' });
  send(tv, { t: 'casting' });
  await sleep(200);
  const ids = phones.map((p) => p.playerId);
  const ballots = buildBallots(ids);
  for (let i = 0; i < phones.length; i++) send(phones[i], { t: 'ballot', ...ballots[i] });
  await sleep(250);
  const lastBallots = tv.msgs.filter((m) => m.t === 'ballots').at(-1);
  send(tv, { t: 'episode', opts: {} });
  await sleep(400);
  const last = tv.msgs.filter((m) => m.t === 'state').at(-1);
  const castEv = tv.msgs.filter((m) => m.t === 'event' && m.ev?.type === 'cast.ballot').at(-1)?.ev;
  const expected = tallyCasting({
    ballots: ballots.map((b, i) => ({ voter: ids[i], ...b })),
    living: ids,
    history: Object.fromEntries(ids.map((id) => [id, { expeditions: 0, lastEp: null }])),
    lastPair: { runner: null, guide: null },
    ep: 1,
    matchSeed: 1,
  });
  const pair = last?.frame?.pair;
  // seeded ties: any of tied set OK if tiebreaks include seeded; else exact match
  let pass;
  if (expected.tiebreaks.some((t) => t.includes('seeded'))) {
    pass = !!pair?.runner && pair.runner !== pair.guide;
  } else {
    pass = pair?.runner === expected.runner && pair?.guide === expected.guide;
  }
  const row = {
    id, CODE, ids, ballots, serverVotes: lastBallots?.votes, pair,
    castEv: castEv?.data, expected, pass,
    note: expected.tiebreaks.some((t) => t.includes('seeded'))
      ? 'seeded-tie: pass=resolved distinct pair (seed may differ from matchSeed=1)'
      : '',
  };
  results.push(row);
  console.log(JSON.stringify(row));
  for (const b of [tv, ...phones]) try { b.ws.close(); } catch {}
}

await runCombo('N4-unanimous', (ids) => ids.map(() => ({ runner: ids[0], guide: ids[1] })));
await runCombo('N4-runner-2-2', (ids) => [
  { runner: ids[0], guide: ids[2] },
  { runner: ids[0], guide: ids[2] },
  { runner: ids[1], guide: ids[2] },
  { runner: ids[1], guide: ids[2] },
]);
await runCombo('N4-late-style-split', (ids) => [
  { runner: ids[0], guide: ids[1] },
  { runner: ids[0], guide: ids[2] },
  { runner: ids[1], guide: ids[2] },
  { runner: ids[3], guide: ids[0] },
]);

// empty ballot + 4 seated (capacity 8): should NO-OP (unused>0)
{
  const CODE = 'v' + Math.random().toString(36).slice(2, 5);
  const tv = await open(CODE, true);
  const phones = [];
  for (const name of ['Ada', 'Ben', 'Cy', 'Dee']) {
    const p = await open(CODE, false);
    send(p, { t: 'name', name });
    phones.push(p);
  }
  await sleep(200);
  send(tv, { t: 'start' });
  send(tv, { t: 'casting' });
  await sleep(200);
  send(tv, { t: 'episode', opts: {} });
  await sleep(300);
  const last = tv.msgs.filter((m) => m.t === 'state').at(-1);
  const row = {
    id: 'N4-empty-ballot-noop',
    pair: last?.frame?.pair || null,
    phase: last?.frame?.phase,
    pass: !last?.frame?.pair?.runner,
    note: 'empty ballots with unused chairs must not invent a pair',
  };
  results.push(row);
  console.log(JSON.stringify(row));
  for (const b of [tv, ...phones]) try { b.ws.close(); } catch {}
}

// force from spare socket AFTER real ballots (simulates harness force)
{
  const CODE = 'v' + Math.random().toString(36).slice(2, 5);
  const tv = await open(CODE, true);
  const phones = [];
  for (const name of ['Ada', 'Ben', 'Cy', 'Dee']) {
    const p = await open(CODE, false);
    send(p, { t: 'name', name });
    phones.push(p);
  }
  await sleep(200);
  send(tv, { t: 'start' });
  send(tv, { t: 'casting' });
  await sleep(200);
  const ids = phones.map((p) => p.playerId);
  for (const p of phones) send(p, { t: 'ballot', runner: ids[0], guide: ids[1] });
  await sleep(200);
  // spare phone seat 5 forces episode
  const spare = await open(CODE, false);
  send(spare, { t: 'episode', opts: {} });
  await sleep(400);
  const last = tv.msgs.filter((m) => m.t === 'state').at(-1);
  const row = {
    id: 'N4-force-from-spare-with-ballots',
    pair: last?.frame?.pair,
    pass: last?.frame?.pair?.runner === ids[0] && last?.frame?.pair?.guide === ids[1],
    note: 'spare socket episode must still consume room.ballots',
  };
  results.push(row);
  console.log(JSON.stringify(row));
  for (const b of [tv, ...phones, spare]) try { b.ws.close(); } catch {}
}

import { writeFile, mkdir } from 'node:fs/promises';
await mkdir('progress/overnight-vote', { recursive: true });
await writeFile('progress/overnight-vote/loop1-wire.json', JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
const fails = results.filter((r) => !r.pass).length;
console.log('WIRE_SUMMARY', { pass: results.length - fails, fail: fails });
process.exit(fails ? 1 : 0);
