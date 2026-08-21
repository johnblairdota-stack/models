/** _rc_guide — the question the room spent 375 seconds on: DID THE GUIDE LIE? Probe. */
import { play } from './_rc_inv.mjs';
import { reunion } from '../../src/party/reunion.js';
import { VIS } from '../../src/party/events.js';

const N = Number(process.argv[2] || 170);
const runs = [];
for (let i = 0; i < N; i++) runs.push(play({ castSeed: 100 + i * 13, worldSeed: 7 + i * 29 }));

/** The join nothing performs: call.said ⋈ hunter.placed, per episode. */
function guideLedger(log) {
  const said = new Map(), hunt = new Map(), room = new Map(), out = new Map(), ended = new Map();
  for (const e of log) {
    if (e.type === 'call.said') said.set(e.data.episode, e.data);
    if (e.type === 'hunter.placed') hunt.set(e.data.episode, e.data.room);
    if (e.type === 'expedition.announced') room.set(e.data.episode, e.data.room);
    if (e.type === 'expedition.ended') { out.set(e.data.episode, e.data.outcome); ended.set(e.data.episode, e.data.move); }
  }
  const rows = [];
  for (const ep of [...room.keys()].sort()) {
    const s = said.get(ep);
    const hunterHere = hunt.get(ep) === room.get(ep);
    rows.push({ ep, guide: s ? s.by : null, said: s ? s.said : null,
      target: room.get(ep), hunterRoom: hunt.get(ep), hunterHere,
      misled: s ? ((s.said === 'CLEAR' && hunterHere) || (s.said === 'HOLD' && !hunterHere)) : null,
      outcome: out.get(ep), move: ended.get(ep) });
  }
  return rows;
}

let calls = 0, wrong = 0, silent = 0, hunterInTarget = 0, eps = 0;
const perGuideWrong = [];
for (const r of runs) {
  for (const row of guideLedger(r.log)) {
    eps++;
    if (row.hunterHere) hunterInTarget++;
    if (row.said == null) { silent++; continue; }
    calls++; if (row.misled) wrong++;
  }
}
console.log(`=== ${N} games, ${eps} episodes`);
console.log(`  the guide spoke in           ${calls}/${eps} episodes (${(100*calls/eps).toFixed(0)}%)`);
console.log(`  the guide was WRONG in       ${wrong}/${calls} calls  (${(100*wrong/calls).toFixed(1)}%)`);
console.log(`  the Hunter was in the target ${hunterInTarget}/${eps} episodes (${(100*hunterInTarget/eps).toFixed(1)}%)`);
console.log(`  the guide said nothing in    ${silent}/${eps}`);

console.log('\n=== DOES THE REUNION SAY? — search every field of every beat for the answer ===');
const r0 = runs[0];
const R = reunion(r0.log, r0.ctx);
const blob = JSON.stringify(R);
for (const probe of ['call.said','said','CLEAR','HOLD','hunter.placed','hunterRoom','misled','task.miss','guide'])
  console.log(`  "${probe}" appears in the whole reunion payload: ${blob.includes(probe)}`);
console.log('\n  reunion payload keys:', Object.keys(R), '· awards:', R.awards.map(a=>a.award).join(', '), '· chat entries:', R.chat.length);

console.log('\n=== WHAT THE LEDGER WOULD SAY, GAME 0 (all already sealed in the log) ===');
const names = Object.fromEntries(r0.s.state.players.map((p)=>[p.id,p.name||p.id]));
for (const row of guideLedger(r0.log))
  console.log(`  ep${row.ep}  ${String(names[row.guide]||'—').padEnd(9)} said ${String(row.said).padEnd(5)} · target ${String(row.target).padEnd(9)} · hunter ${String(row.hunterRoom).padEnd(9)} · ${row.misled ? '*** WRONG ***' : 'right'} · runner ${row.move} → ${row.outcome}`);

console.log('\n=== per-guide across all games: is anyone consistently wrong? ===');
const tally = new Map();
for (const r of runs) {
  const al = r.ctx.alignmentOf;
  for (const row of guideLedger(r.log)) {
    if (!row.guide) continue;
    const k = al(row.guide);
    if (!tally.has(k)) tally.set(k, { n: 0, wrong: 0, clearWrong: 0 });
    const t = tally.get(k); t.n++; if (row.misled) t.wrong++;
    if (row.said === 'CLEAR' && row.hunterHere) t.clearWrong++;
  }
}
for (const [k,v] of tally) console.log(`  ${k.padEnd(5)} guides: ${v.n} calls, ${v.wrong} wrong (${(100*v.wrong/v.n).toFixed(1)}%), ${v.clearWrong} fatal CLEARs`);

// task.miss sealed — is it attributable at the reunion?
console.log('\n=== task.miss (SEALED) — what it carries ===');
const tm = r0.log.filter((e)=>e.type==='task.miss');
console.log(' ', tm.length, 'in game 0:', JSON.stringify(tm.map((e)=>({seq:e.seq, ...e.data}))));
console.log('  → closed schema: kind, room, phaseTick, loudness. NO episode, NO guide. To attribute it you must');
console.log('    join it to the noise.emitted{sourceType:MISS} that follows it. Present?',
  r0.log.some((e)=>e.type==='noise.emitted'&&e.data.sourceType==='MISS'));
