import { room, THREE, HunterAI, NoiseBus } from './_mr2_sim.mjs';
const { HUNTER_SPEED, HUNTER_GROWTH } = await import(new URL('../src/game/rules.js', import.meta.url).href);
let s=9; const rng=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
const scene = new THREE.Scene();
const h=new HunterAI({room,scene,rng,position:room.spawn.hunter.clone(),noise:new NoiseBus(),bangPolicy:'auto'});
let stageEvents=0; h.onStage=()=>stageEvents++;
const DT=1/60;
console.log('Simulating episodes. Each take = one absorb, then views/expedition.js STOPS calling hunter.update (aftermath()).');
console.log('At the top of the next episode arm() sets state=PATROL and calls resetCombat().\n');
for (let ep=1; ep<=8; ep++) {
  // ---- the take: absorb one limb exactly as `_attack` does, then the loop stops.
  h.absorb(null);
  const stateAfterKill = h.state;
  // ---- arm() for the next episode, verbatim from views/expedition.js
  h.root.position.copy(room.spawn.hunter);
  h.awareness=0; h.state='PATROL'; h.target=null; h.contact=0; h.searchTimer=0; h.resetCombat();
  console.log(`  after take ${ep}: absorbed=${h.absorbed} wantStage=${h.absorbed>=HUNTER_GROWTH.toStage3?3:h.absorbed>=HUNTER_GROWTH.toStage2?2:1}  ACTUAL stage=${h.stage} speed=${HUNTER_SPEED[h.stage]}  state-at-kill='${stateAfterKill}'  onStage fired ${stageEvents}x  growT=${h.growT}`);
}
console.log('\nCONTROL — the same absorbs with the loop still running (i.e. what views/game.js does):');
let s2=9; const rng2=()=>{s2=(s2*1664525+1013904223)>>>0;return s2/4294967296;};
const h2=new HunterAI({room,scene:new THREE.Scene(),rng:rng2,position:room.spawn.hunter.clone(),noise:new NoiseBus(),bangPolicy:'auto'});
let ev2=0; h2.onStage=(a,b)=>{ev2++;console.log(`    onStage ${a} -> ${b}`);};
for (let i=1;i<=8;i++){ h2.absorb(null); for(let k=0;k<Math.ceil(1.6/DT);k++) h2.update(DT,k*DT);
  console.log(`  after take ${i}: absorbed=${h2.absorbed} stage=${h2.stage} speed=${HUNTER_SPEED[h2.stage]} radius=${h2.radius.toFixed(2)}`); }
