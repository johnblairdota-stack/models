import { play, CALL, MOVE_CHOICE, PHASE } from './_pw_play.mjs';
import { visibleTo } from '../../src/party/log.js';

const taps = (s, act) => {
  const alive = s.state.players.filter(p=>p.alive).map(p=>p.id);
  switch (s.state.phase) {
    case PHASE.CASTING: alive.forEach((id,i)=>act(id,{t:'cast',runner:alive[(i+1)%alive.length],guide:alive[(i+2)%alive.length]})); break;
    case PHASE.EXPEDITION: act(s.state.pair.guide,{t:'call',call:CALL.CLEAR}); act(s.state.pair.runner,{t:'move',move:MOVE_CHOICE.GO}); break;
    case PHASE.RECKONING: if(!s.state.nominations.length) act(alive[0],{t:'nominate',target:alive[1]}); break;
    case PHASE.VOTE: alive.forEach(id=>act(id,{t:'vote',choice:alive[1]})); break;
  }
};
const R = play({taps});
const s = R.s;
const all = s.log.all();
console.log('== TRUTH ==');
for (const t of s.truth().seats) console.log(' ', t.id, t.role, t.alignment, t.cover?('believes '+t.cover):'');
console.log('outcome:', s.state.outcome, 'cameras', JSON.stringify(s.state.cameras));

console.log('\n== EVENT STREAM (type, vis, ep-ish) ==');
for (const e of all) console.log(' ', String(e.seq).padStart(3), e.type.padEnd(22), e.vis.padEnd(8), JSON.stringify(e.data).slice(0,140), e.for?('for='+e.for):'');

console.log('\n== WHAT EACH SOCKET SEES, per phase beat ==');
for (const b of R.beats) {
  console.log(`\n--- ep${b.ep} ${b.phase} (${b.seconds}s) ---`);
  for (const id of Object.keys(b.view)) {
    const f = b.view[id];
    console.log('  ', id.padEnd(9), JSON.stringify(f));
  }
}
