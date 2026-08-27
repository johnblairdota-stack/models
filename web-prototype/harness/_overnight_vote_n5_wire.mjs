import { tallyCasting } from '../src/party/ballot.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const WS = 5181;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const NAMES = [
  { name: 'Ada', shell: '#d4a574', accent: '#c45c26' },
  { name: 'Ben', shell: '#8bb4c8', accent: '#2a6f8f' },
  { name: 'Cy', shell: '#c9a0dc', accent: '#6b3fa0' },
  { name: 'Dee', shell: '#a8c686', accent: '#3d6b2f' },
  { name: 'Eli', shell: '#e8b4b8', accent: '#a33b44' },
];
// Dupes OK — vary palette including a dupe name shade
const ALT_NAMES = [
  { name: 'Fox', shell: '#f0c27a', accent: '#b36a1e' },
  { name: 'Gus', shell: '#7ec8e3', accent: '#1f6f8b' },
  { name: 'Ada', shell: '#d4a574', accent: '#c45c26' }, // dupe name
  { name: 'Ivy', shell: '#b8e0c8', accent: '#2f6b4f' },
  { name: 'Jem', shell: '#f5c6ec', accent: '#9b3d7a' },
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

async function seatFive(code, nameSet = NAMES) {
  const tv = await open(code, true);
  const phones = [];
  for (const who of nameSet) {
    const p = await open(code, false);
    send(p, { t: 'name', name: who.name });
    send(p, { t: 'look', shell: who.shell, accent: who.accent });
    phones.push({ ...p, name: who.name, look: who });
  }
  await sleep(250);
  send(tv, { t: 'start' });
  send(tv, { t: 'casting' });
  await sleep(250);
  return { tv, phones, ids: phones.map((p) => p.playerId) };
}

function closeAll(...boxes) {
  for (const b of boxes.flat()) try { b.ws.close(); } catch {}
}

function judge(expected, pair) {
  if (expected.tiebreaks.some((t) => t.includes('seeded'))) {
    return !!pair?.runner && pair.runner !== pair.guide;
  }
  return pair?.runner === expected.runner && pair?.guide === expected.guide;
}

async function runCombo(id, buildBallots, opts = {}) {
  const CODE = 'n5' + Math.random().toString(36).slice(2, 5);
  const nameSet = opts.altNames ? ALT_NAMES : NAMES;
  const { tv, phones, ids } = await seatFive(CODE, nameSet);
  const ballots = buildBallots(ids);
  // late ballot: send all but last, wait, then last
  if (opts.late) {
    for (let i = 0; i < phones.length - 1; i++) {
      if (ballots[i]) send(phones[i], { t: 'ballot', ...ballots[i] });
    }
    await sleep(400);
    if (ballots[phones.length - 1]) send(phones[phones.length - 1], { t: 'ballot', ...ballots[phones.length - 1] });
  } else {
    for (let i = 0; i < phones.length; i++) {
      if (ballots[i] && (ballots[i].runner != null || ballots[i].guide != null)) {
        send(phones[i], { t: 'ballot', ...ballots[i] });
      }
      // skip null/empty ballot entries (partial/empty)
    }
  }
  await sleep(300);
  const lastBallots = tv.msgs.filter((m) => m.t === 'ballots').at(-1);
  send(tv, { t: 'episode', opts: {} });
  await sleep(450);
  const last = tv.msgs.filter((m) => m.t === 'state').at(-1);
  const castEv = tv.msgs.filter((m) => m.t === 'event' && m.ev?.type === 'cast.ballot').at(-1)?.ev;
  const validForTally = ballots
    .map((b, i) => ({ voter: ids[i], runner: b?.runner ?? null, guide: b?.guide ?? null }))
    .filter((b) => b.runner && b.guide && b.runner !== b.guide);
  const expected = tallyCasting({
    ballots: validForTally.length ? validForTally : ballots.map((b, i) => ({ voter: ids[i], runner: b?.runner ?? null, guide: b?.guide ?? null })),
    living: ids,
    history: Object.fromEntries(ids.map((id) => [id, { expeditions: 0, lastEp: null }])),
    lastPair: { runner: null, guide: null },
    ep: 1,
    matchSeed: 1,
  });
  const pair = last?.frame?.pair || null;
  let pass;
  let note = opts.note || '';
  if (opts.expectNoPair) {
    pass = !pair?.runner;
    note = note || 'must not invent pair';
  } else if (opts.seededOk) {
    pass = judge(expected, pair);
    if (expected.tiebreaks.some((t) => t.includes('seeded'))) {
      note = (note ? note + '; ' : '') + 'seeded-tie: pass=resolved distinct pair';
    }
  } else {
    pass = judge(expected, pair);
  }
  const row = {
    id, CODE, N: 5, names: nameSet.map((n) => n.name), ids, ballots,
    serverVotes: lastBallots?.votes, pair, castEv: castEv?.data, expected, pass, note,
    phase: last?.frame?.phase,
  };
  results.push(row);
  console.log(JSON.stringify({ id, pass, pair, expected: { runner: expected.runner, guide: expected.guide, tiebreaks: expected.tiebreaks }, note }));
  closeAll(tv, phones);
  return row;
}

// --- Combos ---
// 1. Unanimous
await runCombo('N5-unanimous', (ids) => ids.map(() => ({ runner: ids[0], guide: ids[1] })));

// 2. Near-tie / plurality — runner 2-1-1-1, guide clear
await runCombo('N5-near-tie-plurality', (ids) => [
  { runner: ids[0], guide: ids[4] },
  { runner: ids[0], guide: ids[4] },
  { runner: ids[1], guide: ids[4] },
  { runner: ids[2], guide: ids[4] },
  { runner: ids[3], guide: ids[4] },
], { altNames: true });

// 3. Multi-way split (all different runner picks) → seeded runner
await runCombo('N5-multiway-split', (ids) => [
  { runner: ids[0], guide: ids[1] },
  { runner: ids[1], guide: ids[2] },
  { runner: ids[2], guide: ids[3] },
  { runner: ids[3], guide: ids[4] },
  { runner: ids[4], guide: ids[0] },
], { seededOk: true });

// 4. Self-pick ballots voided (runner===guide filtered server-side)
await runCombo('N5-self-pick-void', (ids) => [
  { runner: ids[0], guide: ids[0] }, // void
  { runner: ids[1], guide: ids[1] }, // void
  { runner: ids[2], guide: ids[3] }, // valid
  { runner: ids[2], guide: ids[3] },
  { runner: ids[2], guide: ids[3] },
], { note: 'self-picks filtered; remaining valid ballots decide' });

// 5. Late ballot (last phone after delay)
await runCombo('N5-late-ballot', (ids) => [
  { runner: ids[0], guide: ids[1] },
  { runner: ids[0], guide: ids[1] },
  { runner: ids[0], guide: ids[1] },
  { runner: ids[2], guide: ids[3] },
  { runner: ids[0], guide: ids[1] }, // late
], { late: true, note: 'last ballot arrives late; still counted' });

// 6. Empty / partial ballots — some null, some only one slot
await runCombo('N5-partial-ballots', (ids) => [
  { runner: ids[0], guide: ids[1] },
  { runner: ids[0], guide: null },   // partial — server may drop
  null,                               // empty
  { runner: ids[0], guide: ids[1] },
  { runner: null, guide: ids[1] },    // partial
], { note: 'partials dropped; two full ballots remain' });

// 7. Guide vs runner conflict — same person tops both roles
await runCombo('N5-guide-runner-conflict', (ids) => [
  { runner: ids[0], guide: ids[0] }, // self void? actually runner===guide filtered
  { runner: ids[0], guide: ids[1] },
  { runner: ids[0], guide: ids[1] },
  { runner: ids[2], guide: ids[0] }, // votes Ada guide
  { runner: ids[3], guide: ids[0] },
], { note: 'Ada tops runner; guide votes for Ada fall to next (Ben) after runner lock' });

// Fix combo 7: make conflict without self-pick voids dominating
// Re-run a cleaner conflict: everyone votes Ada runner; guide votes split with Ada leading guide too
await runCombo('N5-conflict-ada-tops-both', (ids) => [
  { runner: ids[0], guide: ids[0] }, // void self
  { runner: ids[0], guide: ids[2] },
  { runner: ids[0], guide: ids[0] }, // void — wait this voids. Better:
  { runner: ids[0], guide: ids[2] },
  { runner: ids[0], guide: ids[2] },
], { note: 'replaced by cleaner combo below' });

// Cleaner: all vote Ada runner; guide majority Ada but she takes runner so guide=next
await runCombo('N5-ada-tops-runner-and-guide', (ids) => [
  { runner: ids[0], guide: ids[1] },
  { runner: ids[0], guide: ids[0] }, // void
  { runner: ids[0], guide: ids[1] },
  { runner: ids[0], guide: ids[1] },
  { runner: ids[2], guide: ids[1] },
], { note: 'Ada unanimous runner; Ben clear guide' });

// True conflict: ballots where guide votes for the eventual runner
await runCombo('N5-true-role-conflict', (ids) => [
  { runner: ids[0], guide: ids[1] },
  { runner: ids[0], guide: ids[0] }, // void self Ada
  { runner: ids[0], guide: ids[2] },
  { runner: ids[3], guide: ids[0] }, // guide Ada
  { runner: ids[4], guide: ids[0] }, // guide Ada
], { note: 'Ada runner; guide tallies Ada(2)+Ben(1)+Cy(1) but Ada excluded → Ben or Cy via scores' });

// 8. Empty all ballots with unused chairs → noop
{
  const CODE = 'n5e' + Math.random().toString(36).slice(2, 4);
  const { tv, phones } = await seatFive(CODE);
  send(tv, { t: 'episode', opts: {} });
  await sleep(350);
  const last = tv.msgs.filter((m) => m.t === 'state').at(-1);
  const row = {
    id: 'N5-empty-ballot-noop', N: 5,
    pair: last?.frame?.pair || null,
    phase: last?.frame?.phase,
    pass: !last?.frame?.pair?.runner,
    note: 'empty ballots + unused chairs must not invent a pair',
  };
  results.push(row);
  console.log(JSON.stringify(row));
  closeAll(tv, phones);
}

// 9. Force from spare after real ballots
{
  const CODE = 'n5f' + Math.random().toString(36).slice(2, 4);
  const { tv, phones, ids } = await seatFive(CODE, ALT_NAMES);
  for (const p of phones) send(p, { t: 'ballot', runner: ids[0], guide: ids[1] });
  await sleep(250);
  const spare = await open(CODE, false);
  send(spare, { t: 'episode', opts: {} });
  await sleep(450);
  const last = tv.msgs.filter((m) => m.t === 'state').at(-1);
  const row = {
    id: 'N5-force-spare-with-ballots', N: 5,
    pair: last?.frame?.pair,
    pass: last?.frame?.pair?.runner === ids[0] && last?.frame?.pair?.guide === ids[1],
    note: 'spare socket episode still consumes room.ballots',
  };
  results.push(row);
  console.log(JSON.stringify(row));
  closeAll(tv, phones, spare);
}

let head = 'unknown';
try { head = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch {}
await mkdir('progress/overnight-vote', { recursive: true });
const summary = { at: new Date().toISOString(), head, N: 5, results };
await writeFile('progress/overnight-vote/loop5-n5-wire.json', JSON.stringify(summary, null, 2));
const fails = results.filter((r) => !r.pass).length;
console.log('WIRE_SUMMARY_N5', { pass: results.length - fails, fail: fails, total: results.length, head });
process.exit(fails ? 1 : 0);
