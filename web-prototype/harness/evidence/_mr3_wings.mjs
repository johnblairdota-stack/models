import { run, room, EXP, THREE } from './_mr2_sim.mjs';
const WINGS = ['gallery','ballroom','study_w','study_e','service','chapel'];
console.log('=== A. straight-line and graph distance, spawn -> each wing terminal ===');
const spawn = room.spawn.player[0];
for (const w of WINGS) {
  const term = room.anchor(EXP.TERMINAL_AT[w]);
  const hops = room.pathPortals(spawn, term, 0.6, 1.9);
  // polyline through hop centres
  let len = 0, prev = spawn;
  for (const h of hops) { const c = h.centre; len += Math.hypot(c.x-prev.x, c.z-prev.z); prev = c; }
  len += Math.hypot(term.x-prev.x, term.z-prev.z);
  const straight = Math.hypot(term.x-spawn.x, term.z-spawn.z);
  console.log(`  ${w.padEnd(9)} straight ${straight.toFixed(1).padStart(5)} m   via-portals ${len.toFixed(1).padStart(5)} m   hops ${hops.map(h=>h.id).join('>')||'(none)'}   spaceOfTerminal=${room.spaceAt(term)?.id}`);
}
console.log('\n=== B. the shipped solo detent ladder, hunter ON, one seed per wing ===');
for (const w of WINGS) {
  const r = run({ wing: w, seed: 7 });
  console.log(`  ${w.padEnd(9)} ${String(r.outcome).padEnd(6)} t=${String(r.t).padStart(6)}s path=${String(r.pathLen).padStart(6)}m end=${r.end.room} minSep=${r.minSep} states=${JSON.stringify(r.states)}`);
}
