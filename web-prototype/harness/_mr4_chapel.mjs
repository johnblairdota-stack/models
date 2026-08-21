import { room, SP, EXP, THREE } from './_mr2_sim.mjs';
console.log('--- connectors touching chapel ---');
for (const c of room.connectors ?? []) {
  if (c.a === 'chapel' || c.b === 'chapel') console.log(' ', c.id, c.a, '<->', c.b, 'kind=', c.kind, 'state=', c.state, 'w=', c.w, 'h=', c.h, 'centre=', c.centre?.toArray?.().map(v=>+v.toFixed(2)).join(','));
}
console.log('\n--- authored spec rows for chapel ---');
for (const c of SP.CONNECTORS) if (c.a==='chapel'||c.b==='chapel') console.log(' ', JSON.stringify(c).slice(0,220));
console.log('\n--- pathPortals into chapel from every other space centre ---');
const term = room.anchor('chapel.centre');
for (const s of room.spaces) {
  if (s.id === 'chapel') continue;
  const from = new THREE.Vector3((s.x0+s.x1)/2, 0, (s.z0+s.z1)/2);
  const hops = room.pathPortals(from, term, 0.6, 1.9);
  console.log(`  from ${s.id.padEnd(9)} hops=[${hops.map(h=>h.id).join(',')}]`);
}
console.log('\n--- hunter-sized query (its own BFS width/height) ---');
const from = new THREE.Vector3(0,0,-27.6);
console.log('  gallery->chapel robot 0.6/1.9:', room.pathPortals(from, term, 0.6, 1.9).map(h=>h.id));
console.log('\n--- space rects ---');
for (const s of room.spaces) console.log(`  ${s.id.padEnd(9)} x[${s.x0.toFixed(2)},${s.x1.toFixed(2)}] z[${s.z0.toFixed(2)},${s.z1.toFixed(2)}]`);
