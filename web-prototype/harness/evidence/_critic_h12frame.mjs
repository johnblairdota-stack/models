// PROBE: shot-solver H12 renders the real overlay in real Chromium — against a frame it wrote
// by hand. How far is that frame from one the shipped session actually sends the television?
import { createSession, CALL, MOVE_CHOICE } from '../../src/party/session.js';
import { PHASE } from '../../src/party/phases.js';
import { keyPaths } from '../../net/party/entitle.js';

const ROSTER = ['A','B','C','D','E','F','G','H'];
const H12_FRAME = {
  episode: 3, pair: { runner: 'p2', guide: 'p5' },
  cameras: { unlocked: 3, needed: 5 },
  players: ROSTER.map((name, i) => ({ id: `p${i+1}`, seat: i, name, alive: i !== 5, taken: i === 5, claim: i % 2 ? 'fixer' : null })),
};

const tape = new Map();
const s = createSession({ count: 8, castSeed: 3, worldSeed: 9, send: (id, f) => { if (!tape.has(id)) tape.set(id, []); tape.get(id).push(f); } });
let now = 0; s.start(now);
for (let i = 0; i < 20000 && s.state.phase !== PHASE.REUNION; i++) {
  const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
  if (s.state.phase === PHASE.CASTING) for (let k = 0; k < alive.length; k++) s.input(alive[k], { t:'cast', runner: alive[(k+1)%alive.length], guide: alive[(k+2)%alive.length] });
  if (s.state.phase === PHASE.EXPEDITION) { s.input(s.state.pair.guide, {t:'call',call:CALL.CLEAR}); s.input(s.state.pair.runner,{t:'move',move:MOVE_CHOICE.GO}); }
  if (s.state.phase === PHASE.RECKONING && !s.state.nominations.length) s.input(alive[0], {t:'nominate',target:alive[1]});
  if (s.state.phase === PHASE.VOTE) for (const id of alive) s.input(id, {t:'vote',choice:alive[1]});
  now += 1000; s.tick(now);
}
const real = new Set();
for (const f of tape.get('tv')) for (const p of keyPaths(f)) real.add(p);
const fake = new Set(keyPaths(H12_FRAME));

console.log('paths the real TV frame carries that H12\'s fixture does NOT (never rendered in the sweep):');
console.log('   ' + [...real].filter((p) => !fake.has(p)).join('\n   '));
console.log('\npaths H12\'s fixture carries that no real frame does:');
console.log('   ' + ([...fake].filter((p) => !real.has(p)).join('\n   ') || '(none)'));
console.log('\nH12 fixture says cameras.needed =', H12_FRAME.cameras.needed,
  '· the shipped frame says', tape.get('tv').slice(-1)[0].cameras.needed,
  '(WIN_TARGETS has no 5 at any player count)');
