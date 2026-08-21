/** _rc_deadair — what "fewest events of any kind" actually counts. Probe. */
import { play } from './_rc_inv.mjs';
const r = play({ castSeed: 100, worldSeed: 7 });
const log = r.log;
const ids = r.s.truth().seats.map(s=>s.id);
const SHIPPED = (id) => log.filter((e) => e.data && (e.data.id === id || e.data.actor === id
  || e.data.nominator === id || e.data.voter === id || e.data.runner === id || e.data.guide === id));
const FULL = (id) => log.filter((e) => e.data && JSON.stringify(e.data).includes('"'+id+'"'));
console.log('player   shipped acted()   any-mention   which types the shipped count MISSES');
for (const id of ids) {
  const s = new Set(SHIPPED(id).map(e=>e.type));
  const f = FULL(id);
  const missed = new Map();
  for (const e of f) if (!SHIPPED(id).includes(e)) missed.set(e.type, (missed.get(e.type)||0)+1);
  console.log(`  ${id}      ${String(SHIPPED(id).length).padStart(3)}          ${String(f.length).padStart(3)}          ${[...missed].map(([k,v])=>k+'×'+v).join(', ')}`);
}
console.log('\nfield names that appear in log data but are NOT in acted()\'s list:');
const fields = new Set();
for (const e of log) for (const [k,v] of Object.entries(e.data||{})) if (typeof v === 'string' && /^p\d+$/.test(v)) fields.add(e.type+'.'+k);
console.log('  ', [...fields].sort().join('\n   '));
console.log('\nattributed noise per player (Loudest Robot\'s whole evidence base):');
const noise = log.filter(e=>e.type==='noise.emitted');
console.log('  total noise events:', noise.length, '· attributed:', noise.filter(e=>e.data.causedBy).length, '· nobody\'s (PROWL):', noise.filter(e=>!e.data.causedBy).length);
for (const id of ids) {
  const mine = noise.filter(e=>e.data.causedBy===id);
  if (mine.length) console.log(`  ${id}: ${mine.map(e=>e.data.sourceType+' '+e.data.loud).join(', ')}`);
}
