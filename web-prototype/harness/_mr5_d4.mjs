import { room, THREE, Player, LimbField, detentInput } from './_mr2_sim.mjs';
function drive({ from, heading, detent = 3, secs = 8, label }) {
  let s = 3; const rng = () => { s = (s*1664525+1013904223)>>>0; return s/4294967296; };
  const scene = new THREE.Scene();
  const field = new LimbField(scene, { rng, floorY: room.floorY, bounds: room.bounds });
  const p = new Player({ scene, world: room, field, rng, id: 'r', avatar: null });
  p.pos.set(from[0], 0, from[1]); p.facing = heading;
  const DT = 1/60; const marks = [];
  for (let i = 0; i < secs/DT; i++) {
    p.aimYaw = heading;
    p.update(DT, i*DT, { ...detentInput(detent), aimYaw: heading, aimPitch: 0 });
    room.update(DT);
    if (i % 30 === 0) marks.push(`${(i*DT).toFixed(1)}s (${p.pos.x.toFixed(2)},${p.pos.z.toFixed(2)}) ${room.spaceAt(p.pos)?.id ?? '-'}`);
  }
  console.log(`${label}: ` + marks.join(' | '));
}
// D4 is at x=-8.60, z=-8.45. Spawn is (-8.60,-11.60). +z heading = atan2(0,1)=0
console.log('--- straight at D4 from the spawn, RUN ---');
drive({ from: [-8.60,-11.60], heading: 0, label: 'exactly on axis' });
drive({ from: [-8.00,-11.60], heading: 0, label: '0.6 m east of axis' });
drive({ from: [-9.20,-11.60], heading: 0, label: '0.6 m west of axis' });
console.log('\n--- straight at D1 (x=-8.60 z=-24.15), -z heading = atan2(0,-1)=PI ---');
drive({ from: [-8.60,-21.00], heading: Math.PI, label: 'on axis, into gallery' });
console.log('\n--- D5 (x=0, z=-8.45) from the service passage ---');
drive({ from: [0,-11.00], heading: 0, label: 'service -> ballroom' });
console.log('\n--- D6 (x=8.60, z=-8.45) from study_e ---');
drive({ from: [8.60,-11.60], heading: 0, label: 'study_e -> ballroom' });
