#!/usr/bin/env node
/** THROWAWAY PROBE — the information ledger at 8 players. Not a gate. Delete me. */
import { createSession, CALL, MOVE_CHOICE } from '../../src/party/session.js';
import { PHASE } from '../../src/party/phases.js';

const frames = new Map();   // socketId -> [{phase, ep, frame}]
let S;
const send = (id, frame) => {
  if (!frames.has(id)) frames.set(id, []);
  frames.get(id).push({ phase: frame.phase, ep: frame.episode, frame: JSON.parse(JSON.stringify(frame)) });
};

S = createSession({ count: 8, castSeed: 424242, worldSeed: 99, send });
const truth = S.truth();
console.log('DEAL:', truth.seats.map((s) => `${s.id}=${s.role}${s.cover ? `(cover ${s.cover})` : ''}`).join(' '));
console.log('EVIL:', truth.evil.join(','));

let now = 1000;
const step = () => { now += 1; S.skip(now); };
S.start(now);

// Run 4 episodes with plausible human input.
for (let ep = 1; ep <= 5; ep++) {
  // PREMIERE (ep1) or CASTING
  if (S.state.phase === PHASE.PREMIERE) step();
  // CASTING: everyone casts
  const alive = S.state.players.filter((p) => p.alive).map((p) => p.id);
  for (const id of alive) {
    const r = alive[(ep) % alive.length], g = alive[(ep + 1) % alive.length];
    S.input(id, { t: 'cast', runner: r, guide: g });
  }
  step();  // -> EXPEDITION
  S.input(S.state.pair.guide, { t: 'call', call: CALL.CLEAR });
  S.input(S.state.pair.runner, { t: 'move', move: MOVE_CHOICE.GO });
  step();  // -> RECAP
  step();  // -> DEBRIEF
  // one claim per episode from a different player
  const claimer = alive[ep % alive.length];
  S.input(claimer, { t: 'claim', claim: 'Camera Op' });
  step();
  if (S.state.phase === PHASE.RECKONING) {
    S.input(alive[0], { t: 'nominate', target: alive[3] });
    step();  // VOTE
    for (const id of S.state.players.filter((p) => p.alive).map((p) => p.id)) S.input(id, { t: 'vote', choice: alive[3] });
    step(); step(); step();  // EXECUTION, VERDICT -> next
  }
  if (S.state.phase === PHASE.REUNION || ['SEASON FINALE','CANCELLED'].includes(S.state.outcome)) break;
}
console.log('END PHASE:', S.state.phase, 'outcome:', S.state.outcome, 'episode:', S.state.episode);

// ---------------- 1. cross-player frame identity, excluding `you`
const strip = (f) => { const c = { ...f }; delete c.you; delete c.flyover; return JSON.stringify(c); };
const ids = truth.seats.map((s) => `phone-${s.seat}`);
const byPhase = new Map();
for (const id of ids) for (const rec of frames.get(id) || []) {
  const k = `${rec.ep}/${rec.phase}`;
  if (!byPhase.has(k)) byPhase.set(k, new Map());
  byPhase.get(k).set(id, rec);
}
console.log('\n=== A. non-`you` frame body, distinct values across the 8 phones, per phase ===');
for (const [k, m] of byPhase) {
  const vals = new Set([...m.values()].map((r) => strip(r.frame)));
  console.log(`  ${k.padEnd(22)} distinct bodies: ${vals.size} of ${m.size}`);
}

// ---------------- 2. what is in `you`, and does it ever change with the episode?
console.log('\n=== B. keys present under `you`, per player, and which ever CHANGE mid-game ===');
for (const id of ids) {
  const recs = frames.get(id) || [];
  const keys = new Set();
  const seen = new Map();
  for (const r of recs) for (const [k, v] of Object.entries(r.frame.you || {})) {
    keys.add(k);
    if (!seen.has(k)) seen.set(k, new Set());
    seen.get(k).add(JSON.stringify(v));
  }
  const varying = [...seen].filter(([, s]) => s.size > 1).map(([k, s]) => `${k}(${s.size})`);
  console.log(`  ${id}: [${[...keys].join(',')}]  varying: ${varying.join(' ') || 'NONE'}`);
}

// ---------------- 3. private log events per player over the whole game
console.log('\n=== C. events each socket may replay, by visibility class ===');
for (const s of S.sockets) {
  const evs = S.replayFor(s);
  const priv = evs.filter((e) => e.vis !== 'PUBLIC');
  const counts = {};
  for (const e of priv) counts[`${e.vis}:${e.type}`] = (counts[`${e.vis}:${e.type}`] || 0) + 1;
  console.log(`  ${(s.playerId || 'TV').padEnd(4)} ${String(evs.length).padStart(3)} events, ${priv.length} non-public: ${JSON.stringify(counts)}`);
}
console.log('\n  TOTAL log entries:', S.log.all().length);
const types = {};
for (const e of S.log.all()) types[`${e.vis}:${e.type}`] = (types[`${e.vis}:${e.type}`] || 0) + 1;
console.log('  by type:', JSON.stringify(types, null, 0));

// ---------------- 4. unrowed
console.log('\n  unrowed fields reported:', JSON.stringify(S.state.unrowed || []));

// ---------------- 5. WHAT differs when two bodies appear
console.log('\n=== D. the differing field, per phase where distinct > 1 ===');
for (const [k, m] of byPhase) {
  const groups = new Map();
  for (const [id, r] of m) {
    const s = strip(r.frame);
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s).push(id);
  }
  if (groups.size < 2) continue;
  const [a, b] = [...groups.keys()];
  const A = JSON.parse(a), B = JSON.parse(b);
  const diff = [];
  const walk = (x, y, pre) => {
    const keys = new Set([...Object.keys(x || {}), ...Object.keys(y || {})]);
    for (const key of keys) {
      const p = pre ? `${pre}.${key}` : key;
      if (x?.[key] && typeof x[key] === 'object' && !Array.isArray(x[key])) { walk(x[key], y?.[key], p); continue; }
      if (JSON.stringify(x?.[key]) !== JSON.stringify(y?.[key])) diff.push(`${p}: ${JSON.stringify(x?.[key])} vs ${JSON.stringify(y?.[key])}`);
    }
  };
  walk(A, B, '');
  console.log(`  ${k.padEnd(20)} ${groups.get(a).length}v${groups.get(b).length} → ${diff.join(' | ')}`);
}

// ---------------- 6. how many players ever GUIDE (the only info seat)
console.log('\n=== E. seats held over the game ===');
console.log('  ', JSON.stringify(S.state.history));

// ---------------- 7. the Reunion, actually run
const { reunion } = await import('../../src/party/reunion.js');
const alignOf = (id) => (truth.seats.find((s) => s.id === id) || {}).alignment;
const R = reunion(S.log.all(), { alignmentOf: alignOf });
console.log('\n=== F. THE REUNION, as the code actually produces it ===');
console.log('  rollCall rows:', R.rollCall.length);
for (const r of R.rollCall) console.log(`    ${r.id} ${r.role.padEnd(13)} ${r.alignment.padEnd(4)} believed=${r.believedTheyWere ?? '-'} claim=${r.finalClaim ?? '-'} death=${r.death ? r.death.by : '-'}`);
console.log('  decisive:', JSON.stringify(R.decisive));
console.log('  awards:', R.awards.length);
for (const a of R.awards) console.log(`    ${a.award.padEnd(14)} ${a.winner}  (${a.querySeq.length} seqs)  "${a.why}"`);
console.log('  chat entries:', R.chat.length, '<-- BEAT 4');
