/** _rc_trunc — invariant 4: "every query must tolerate a truncated log" (SKIP TO REUNION). Probe. */
import { play } from './_rc_inv.mjs';
import { reunion, awards, rollCall, decisiveEpisode, revealSet } from '../../src/party/reunion.js';
const r = play({ castSeed: 100, worldSeed: 7 });
const log = r.log;
console.log('full log:', log.length, 'entries');
for (const n of [0, 1, 2, 5, 10, 20, 40, 60, 100, log.length]) {
  const cut = log.slice(0, n);
  let res = 'ok';
  try { const R = reunion(cut, r.ctx); res = `ok · ${R.rollCall.length} plates, ${R.awards.length} awards, decisive=${R.decisive?R.decisive.episode:'null'}`; }
  catch (e) { res = 'THROWS: ' + e.constructor.name + ': ' + e.message; }
  console.log(`  truncated to ${String(n).padStart(4)}: ${res}`);
}
console.log('\n(SKIP TO REUNION at any phase in episode 1 truncates the log to exactly this range.)');
// where does cast.deal sit?
console.log('cast.deal at seq', log.find(e=>e.type==='cast.deal').seq, '· first nom.made at seq', (log.find(e=>e.type==='nom.made')||{}).seq);
