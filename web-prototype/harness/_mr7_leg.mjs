import { room, THREE } from './_mr2_sim.mjs';
const term = room.anchor('ballroom.centre');
// walk a probe point across the D4 plane and print the waypoint the shipped logic produces
for (const z of [-9.6,-9.0,-8.7,-8.5,-8.46,-8.44,-8.4,-8.2,-7.8,-7.0]) {
  const pos = new THREE.Vector3(-8.60, 0, z);
  const hops = room.pathPortals(pos, term, 0.6, 1.9);
  const h = hops[0]; const c = h && h.centre;
  const sp = room.spaceAt(pos)?.id ?? null;
  if (!c) { console.log(`z=${z}  space=${sp} hops=[] -> steer straight at terminal`); continue; }
  const n = h.normal || { x: 0, z: 1 };
  const dot = (pos.x - c.x) * n.x + (pos.z - c.z) * n.z;
  const side = Math.sign(dot) || 1;
  const leg = { x: c.x - n.x * side * 1.5, z: c.z - n.z * side * 1.5 };
  console.log(`z=${String(z).padStart(6)} space=${String(sp).padEnd(8)} hops=[${hops.map(x=>x.id)}] h=${h.id} c=(${c.x.toFixed(2)},${c.z.toFixed(2)}) n=(${n.x},${n.z}) dot=${dot.toFixed(3)} side=${side} leg=(${leg.x.toFixed(2)},${leg.z.toFixed(2)})  -> heading pushes ${leg.z>z?'+z':'-z'}`);
}
