import { room, THREE, HunterAI, NoiseBus } from './_mr2_sim.mjs';
const { PASS_H } = await import(new URL('../src/game/rules.js', import.meta.url).href);
let s=1; const rng=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
const h=new HunterAI({room,scene:null,rng,position:room.spawn.hunter.clone(),noise:new NoiseBus(),bangPolicy:'auto'});
console.log('hunter radius', h.radius, 'stage', h.stage, ' -> width needed', (h.radius*2+0.12).toFixed(2), 'm, height', PASS_H.hunter);
const need = h.radius*2+0.12;
const ids = room.spaces.map(x=>x.id);
console.log('\ncan the hunter WALK from A to B? (if yes, _summon returns false and it never bangs)');
let blocked=0, total=0;
for (const a of ids) for (const b of ids) { if(a===b) continue; total++;
  const p = room.pathPortals(a,b,need,PASS_H.hunter);
  if (!p.length) { blocked++; console.log(`  BLOCKED ${a} -> ${b}`); } }
console.log(`  ${total-blocked}/${total} ordered pairs walkable with no breach at all.`);
console.log('\nchainedDoorsOf per space (the only doors _summon can pick):');
for (const id of ids) console.log(`  ${id.padEnd(9)} ${room.chainedDoorsOf(id).map(d=>d.id).join(', ')||'(none)'}`);
console.log('\nSUMMON_LOUDNESS = 0.95. Runner noise by detent (as the ENGINE plays it): STILL 0 · CREEP 0.061 · WALK 0.490 · RUN 1.000');
console.log('-> only RUN can ever summon, and only into a room the hunter cannot walk to.');
