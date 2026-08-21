/** _rc_leak — is the guide ledger ALREADY on a wire? Probe. */
import { play } from './_rc_inv.mjs';
const r = play({ castSeed: 100, worldSeed: 7 });
const seats = r.s.truth().seats;
for (const [sid, frames] of r.tape) {
  const blob = JSON.stringify(frames);
  const hits = [];
  for (const tok of ['"said":"CLEAR"','"said":"HOLD"','hunter.placed','causedBy'])
    if (blob.includes(tok)) hits.push(tok);
  console.log(`  ${sid.padEnd(12)} ${frames.length} frames · ${hits.length? 'CARRIES ' + hits.join(', ') : 'clean'}`);
}
console.log('\nevent streams:');
for (const [sid, evs] of r.events) {
  const blob = JSON.stringify(evs);
  const hits = [];
  for (const tok of ['"said"','hunter.placed','call.said','causedBy','cast.deal'])
    if (blob.includes(tok)) hits.push(tok);
  console.log(`  ${sid.padEnd(12)} ${evs.length} events · ${hits.length? 'CARRIES ' + hits.join(', ') : 'clean'}`);
}
