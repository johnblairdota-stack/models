import { tallyCasting } from '../src/party/ballot.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const WS = 5181;
const N = 8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const NAMES = [
  { name: 'Ada', shell: '#d4a574', accent: '#c45c26' },
  { name: 'Ben', shell: '#8bb4c8', accent: '#2a6f8f' },
  { name: 'Cy', shell: '#c9a0dc', accent: '#6b3fa0' },
  { name: 'Dee', shell: '#a8c686', accent: '#3d6b2f' },
  { name: 'Eli', shell: '#e8b4b8', accent: '#a33b44' },
  { name: 'Fox', shell: '#f0c27a', accent: '#b36a1e' },
  { name: 'Gus', shell: '#7ec8e3', accent: '#1f6f8b' },
  { name: 'Ada', shell: '#d4a574', accent: '#c45c26' }, // dupe name OK
];

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
function closeAll(...boxes) { for (const b of boxes.flat()) try { b.ws.close(); } catch {} }

async function seatN(code, n = N) {
  const tv = await open(code, true);
  const phones = [];
  for (let i = 0; i < n; i++) {
    const who = NAMES[i];
    const p = await open(code, false);
    send(p, { t: 'name', name: who.name });
    send(p, { t: 'look', shell: who.shell, accent: who.accent });
    phones.push(p);
  }
  await sleep(250);
  send(tv, { t: 'start' });
  send(tv, { t: 'casting' });
  await sleep(250);
  return { tv, phones, ids: phones.map((p) => p.playerId) };
}

function judge(expected, pair) {
  if (expected.tiebreaks.some((t) => t.includes('seeded'))) return !!pair?.runner && pair.runner !== pair.guide;
  return pair?.runner === expected.runner && pair?.guide === expected.guide;
}

async function runCombo(id, buildBallots, opts = {}) {
  const CODE = 'n8' + Math.random().toString(36).slice(2, 5);
  const { tv, phones, ids } = await seatN(CODE, N);
  const ballots = buildBallots(ids);
  if (opts.late) {
    for (let i = 0; i < phones.length - 1; i++) {
      const b = ballots[i];
      if (b && (b.runner != null || b.guide != null)) send(phones[i], { t: 'ballot', ...b });
    }
    await sleep(400);
    const last = ballots[phones.length - 1];
    if (last && (last.runner != null || last.guide != null)) send(phones[phones.length - 1], { t: 'ballot', ...last });
  } else {
    for (let i = 0; i < phones.length; i++) {
      const b = ballots[i];
      if (b && (b.runner != null || b.guide != null)) send(phones[i], { t: 'ballot', ...b });
    }
  }
  await sleep(300);
  const lastBallots = tv.msgs.filter((m) => m.t === 'ballots').at(-1);
  send(tv, { t: 'episode', opts: {} });
  await sleep(450);
  const last = tv.msgs.filter((m) => m.t === 'state').at(-1);
  const castEv = tv.msgs.filter((m) => m.t === 'event' && m.ev?.type === 'cast.ballot').at(-1)?.ev;
  const valid = ballots
    .map((b, i) => ({ voter: ids[i], runner: b?.runner ?? null, guide: b?.guide ?? null }))
    .filter((b) => b.runner && b.guide && b.runner !== b.guide);
  const expected = tallyCasting({
    ballots: valid.length ? valid : ballots.map((b, i) => ({ voter: ids[i], runner: b?.runner ?? null, guide: b?.guide ?? null })),
    living: ids,
    history: Object.fromEntries(ids.map((id) => [id, { expeditions: 0, lastEp: null }])),
    lastPair: { runner: null, guide: null },
    ep: 1, matchSeed: 1,
  });
  const pair = last?.frame?.pair || null;
  let pass = opts.expectNoPair ? !pair?.runner : judge(expected, pair);
  const row = { id, CODE, N, ids, ballots, serverVotes: lastBallots?.votes, pair, castEv: castEv?.data, expected, pass, note: opts.note || '', phase: last?.frame?.phase };
  results.push(row);
  console.log(JSON.stringify({ id, pass, pair, expected: { runner: expected.runner, guide: expected.guide, tiebreaks: expected.tiebreaks }, note: row.note }));
  closeAll(tv, phones);
}

await runCombo('N8-unanimous', (ids) => ids.map(() => ({ runner: ids[0], guide: ids[1] })));

await runCombo('N8-near-tie-4-4', (ids) => [
  { runner: ids[0], guide: ids[7] },
  { runner: ids[0], guide: ids[7] },
  { runner: ids[0], guide: ids[7] },
  { runner: ids[0], guide: ids[7] },
  { runner: ids[1], guide: ids[7] },
  { runner: ids[1], guide: ids[7] },
  { runner: ids[1], guide: ids[7] },
  { runner: ids[1], guide: ids[7] },
], { note: 'runner 4-4 → seeded; guide clear Ada-dupe' });

await runCombo('N8-plurality', (ids) => [
  { runner: ids[0], guide: ids[2] },
  { runner: ids[0], guide: ids[2] },
  { runner: ids[0], guide: ids[2] },
  { runner: ids[1], guide: ids[2] },
  { runner: ids[1], guide: ids[2] },
  { runner: ids[3], guide: ids[2] },
  { runner: ids[4], guide: ids[2] },
  { runner: ids[5], guide: ids[2] },
], { note: 'runner 3-2-1-1-1 plurality → Ada; guide Cy' });

await runCombo('N8-multiway-split', (ids) => ids.map((_, i) => ({
  runner: ids[i], guide: ids[(i + 1) % N],
})), { note: '8-way runner split → seeded' });

await runCombo('N8-self-pick-void', (ids) => [
  { runner: ids[0], guide: ids[0] },
  { runner: ids[1], guide: ids[1] },
  { runner: ids[2], guide: ids[3] },
  { runner: ids[2], guide: ids[3] },
  { runner: ids[2], guide: ids[3] },
  { runner: ids[2], guide: ids[3] },
  { runner: ids[2], guide: ids[3] },
  { runner: ids[2], guide: ids[3] },
], { note: 'self-picks void; p3/p4 win' });

await runCombo('N8-late-ballot', (ids) => [
  { runner: ids[0], guide: ids[1] },
  { runner: ids[0], guide: ids[1] },
  { runner: ids[0], guide: ids[1] },
  { runner: ids[0], guide: ids[1] },
  { runner: ids[2], guide: ids[3] },
  { runner: ids[4], guide: ids[5] },
  { runner: ids[6], guide: ids[7] },
  { runner: ids[0], guide: ids[1] },
], { late: true, note: 'last ballot late; still counted → p1/p2' });

await runCombo('N8-partial-ballots', (ids) => [
  { runner: ids[0], guide: ids[1] },
  { runner: ids[0], guide: null },
  null,
  { runner: ids[0], guide: ids[1] },
  { runner: null, guide: ids[1] },
  { runner: ids[0], guide: ids[1] },
  null,
  { runner: ids[0], guide: ids[1] },
], { note: 'partials/empties dropped → p1/p2' });

await runCombo('N8-guide-runner-conflict', (ids) => [
  { runner: ids[0], guide: ids[1] },
  { runner: ids[0], guide: ids[2] },
  { runner: ids[0], guide: ids[0] }, // void
  { runner: ids[3], guide: ids[0] },
  { runner: ids[4], guide: ids[0] },
  { runner: ids[5], guide: ids[1] },
  { runner: ids[6], guide: ids[1] },
  { runner: ids[7], guide: ids[2] },
], { note: 'Ada runner lock; guide Ada excluded → next scores' });

{
  const CODE = 'n8e' + Math.random().toString(36).slice(2, 4);
  const { tv, phones } = await seatN(CODE, N);
  send(tv, { t: 'episode', opts: {} });
  await sleep(350);
  const last = tv.msgs.filter((m) => m.t === 'state').at(-1);
  const row = { id: 'N8-empty-noop', N, pair: last?.frame?.pair || null, phase: last?.frame?.phase, pass: !last?.frame?.pair?.runner, note: 'empty+unused must not invent' };
  results.push(row); console.log(JSON.stringify(row)); closeAll(tv, phones);
}

{
  const CODE = 'n8f' + Math.random().toString(36).slice(2, 4);
  const { tv, phones, ids } = await seatN(CODE, N);
  for (const p of phones) send(p, { t: 'ballot', runner: ids[0], guide: ids[1] });
  await sleep(250);
  // at capacity 8 phones + TV — spare may get 'full'; try anyway, fall back to TV episode if full
  let spare = null;
  let spareNote = 'spare socket episode still consumes room.ballots';
  try {
    spare = await open(CODE, false);
    send(spare, { t: 'episode', opts: {} });
  } catch (e) {
    spareNote = 'room full at N=8; force via TV episode instead (' + e.message + ')';
    send(tv, { t: 'episode', opts: {} });
  }
  await sleep(450);
  const last = tv.msgs.filter((m) => m.t === 'state').at(-1);
  const row = {
    id: 'N8-force-spare-with-ballots', N,
    pair: last?.frame?.pair,
    pass: last?.frame?.pair?.runner === ids[0] && last?.frame?.pair?.guide === ids[1],
    note: spareNote,
  };
  results.push(row);
  console.log(JSON.stringify(row));
  closeAll(tv, phones, spare ? [spare] : []);
}

let head = 'unknown';
try { head = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch {}
await mkdir('progress/overnight-vote', { recursive: true });
await writeFile('progress/overnight-vote/loop5-n8-wire.json', JSON.stringify({ at: new Date().toISOString(), head, N, results }, null, 2));
const fails = results.filter((r) => !r.pass).length;
console.log('WIRE_SUMMARY_N8', { pass: results.length - fails, fail: fails, total: results.length, head });
process.exit(fails ? 1 : 0);
