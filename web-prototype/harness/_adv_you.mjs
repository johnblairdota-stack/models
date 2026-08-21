// throwaway: attack the you.* ownership fix from every angle the author did not enumerate.
import { createSession, CALL, MOVE_CHOICE } from '../src/party/session.js';
import { project, entitled, audienceFor, ownerOf } from '../net/party/entitle.js';
import { PHASE } from '../src/party/phases.js';

const s = createSession({ count: 8, castSeed: 5, worldSeed: 35, send: () => {} });
let now = 0; s.start(now);
const phases = new Set();
const snaps = [];
for (let i = 0; i < 400 && s.state.phase !== PHASE.REUNION; i++) {
  phases.add(s.state.phase);
  if (i % 7 === 0) snaps.push({ phase: s.state.phase, full: s.sockets.map(k => ({ sock: k, full: s.unprojected ? s.unprojected(k.id) : null })) });
  const alive = s.state.players.filter(p => p.alive).map(p => p.id);
  switch (s.state.phase) {
    case PHASE.CASTING: for (let k = 0; k < alive.length; k++) s.input(alive[k], { t:'cast', runner: alive[(k+1)%alive.length], guide: alive[(k+2)%alive.length] }); break;
    case PHASE.EXPEDITION: s.input(s.state.pair.guide, { t:'call', call: CALL.CLEAR }); s.input(s.state.pair.runner, { t:'move', move: MOVE_CHOICE.GO }); break;
    case PHASE.RECKONING: if (!s.state.nominations.length) s.input(alive[0], { t:'nominate', target: alive[1] }); break;
    case PHASE.VOTE: for (const id of alive) s.input(id, { t:'vote', choice: alive[1] }); break;
    default: break;
  }
  now += 5000; s.tick(now);
}
console.log('phases seen:', [...phases].join(', '));
console.log('has unprojected():', typeof s.unprojected);
const api = Object.keys(s);
console.log('session api:', api.join(', '));
