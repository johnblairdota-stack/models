// probe: does the SHIPPED session leave unrowed fields, and does the shipped Reunion work?
import { createSession, CALL, MOVE_CHOICE } from '../src/party/session.js';
import { PHASE } from '../src/party/phases.js';
import { reunion, rollCall, awards, decisiveEpisode } from '../src/party/reunion.js';
import { audienceFor, keyPaths } from '../net/party/entitle.js';

function play({ count = 8, castSeed = 1, worldSeed = 2, engaged = true } = {}) {
  const tape = new Map();
  const s = createSession({ count, castSeed, worldSeed,
    send: (id, f) => { if (!tape.has(id)) tape.set(id, []); tape.get(id).push(f); },
    emit: () => {} });
  let now = 0; s.start(now);
  for (let i = 0; i < 20000; i++) {
    if (engaged) {
      const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
      if (s.state.phase === PHASE.CASTING) for (let k = 0; k < alive.length; k++) s.input(alive[k], { t: 'cast', runner: alive[(k+1)%alive.length], guide: alive[(k+2)%alive.length] });
      if (s.state.phase === PHASE.EXPEDITION) { s.input(s.state.pair.guide, { t:'call', call: CALL.CLEAR }); s.input(s.state.pair.runner, { t:'move', move: MOVE_CHOICE.GO }); }
      if (s.state.phase === PHASE.RECKONING && !s.state.nominations.length) s.input(alive[0], { t:'nominate', target: alive[1] });
      if (s.state.phase === PHASE.VOTE) for (const id of alive) s.input(id, { t:'vote', choice: alive[1] });
    }
    now += 1000; s.tick(now);
    if (s.state.phase === PHASE.REUNION) break;
  }
  return { s, tape };
}

const { s, tape } = play({});
console.log('--- unrowed fields the shipped session produced ---');
console.log(JSON.stringify(s.state.unrowed ?? null));

console.log('\n--- the full pre-projection paths vs the matrix (tv socket sample) ---');
// what does the TV actually receive
const tv = tape.get('tv');
const seen = new Set();
for (const f of tv) for (const p of keyPaths(f)) seen.add(p);
const noRow = [...seen].filter((p) => audienceFor(p) === null);
console.log('paths on TV frames with no matrix row:', JSON.stringify(noRow));

console.log('\n--- Reunion over the SHIPPED session log ---');
const align = Object.fromEntries(s.deal.seats.map((x) => [x.id, x.alignment]));
const out = reunion(s.log.all(), { alignmentOf: (id) => align[id] });
console.log('rollCall n =', out.rollCall.length);
console.log('finalClaim non-null:', out.rollCall.filter((p) => p.finalClaim !== null).length);
console.log('death rows:', JSON.stringify(out.rollCall.filter((p)=>p.death).map((p)=>[p.id,p.death.by])));
console.log('decisive:', JSON.stringify(out.decisive));
console.log('awards:', JSON.stringify(out.awards.map((a) => [a.award, a.winner, a.querySeq.length])));
console.log('chat:', out.chat.length);
