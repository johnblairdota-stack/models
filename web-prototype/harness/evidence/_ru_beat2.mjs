/** _ru_beat2 — print one real game's Reunion the way the television will read it. */
import { play } from './_ru_probe7.mjs';
import { reunion } from '../../src/party/reunion.js';
const seed = Number(process.argv[2] || 15);
const r = play({ castSeed: seed * 41, worldSeed: seed });
const R = reunion(r.log, r.ctx);
const name = Object.fromEntries(r.s.state.players.map((p) => [p.id, p.name]));
const N = (id) => name[id] || id;
console.log(`=== castSeed ${seed*41} / worldSeed ${seed} · ${r.s.state.outcome} · ${JSON.stringify(R).length} bytes\n`);
console.log('BEAT 2 — THE LEDGER');
console.log('ep  guide      said   target     hunter was  verdict         runner');
for (const x of R.ledger) {
  console.log(` ${x.episode}  ${String(N(x.guide)).padEnd(9)}  ${String(x.said).padEnd(5)}  ${String(x.target).padEnd(9)}  ${String(x.hunterRoom).padEnd(10)}  ${(x.misled ? '*** WRONG ***' : 'right        ').padEnd(14)}  ${N(r.log.filter(e=>e.type==='expedition.begun'&&e.data.episode===x.episode).map(e=>e.data.runner)[0])} ${x.move} → ${x.outcome}`);
}
console.log('\nBEAT 3 — THE AWARDS');
for (const a of R.awards) {
  const who = [a.winner, ...a.sharedWith].map(N).join(' & ');
  const why = a.why.replace(/\{(\d+)\}/g, (_, i) => N(a.whyRefs[Number(i)]));
  console.log(`  ${a.award.padEnd(20)} ${who.padEnd(20)} ${why}`);
  if (a.tiebreak) console.log(`  ${''.padEnd(20)} ${''.padEnd(20)} (${a.tiebreak})`);
}
console.log('\nBEAT 1 — THE ROLL CALL, in reveal order');
for (const c of R.reveal.cues.filter(c=>c.startsWith('roll:'))) {
  const p = R.rollCall[Number(c.slice(5))];
  console.log(`  w${p.weight}  ${N(p.id).padEnd(9)} ${String(p.roleName).padEnd(18)} ${p.alignment.padEnd(5)} ${p.believedName && p.believedName!==p.roleName ? 'believed ' + p.believedName : ''} ${p.death ? '· ' + p.death.by : ''}`);
}
console.log(`\nreveal.cues (${R.reveal.cues.length}, ${R.reveal.holdMs} ms each): ${R.reveal.cues.join(' ')}`);
