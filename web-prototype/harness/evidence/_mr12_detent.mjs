import { room, THREE, Player, LimbField, MOVE, DETENT, detentInput } from './_mr2_sim.mjs';
const { HUNTER_SENSE } = await import(new URL('../../src/game/rules.js', import.meta.url).href);
const { noiseFor, audibleRange, SILENT_SPEED } = await import(new URL('../../src/party/darkrun.js', import.meta.url).href);
console.log('detent   table speed  table noise  table audible   ||  ENGINE speed  ENGINE noise  ENGINE audible');
for (let i = 0; i < DETENT.length; i++) {
  let s=1; const rng=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
  const scene=new THREE.Scene(); const field=new LimbField(scene,{rng,floorY:room.floorY,bounds:room.bounds});
  const p=new Player({scene,world:room,field,rng,id:'r',avatar:null});
  p.pos.set(0,0,0); p.facing=0; // open ballroom-ish, but use a free spot
  p.pos.set(0,0,-0.65); // ballroom.centre
  const inp = detentInput(i);
  const DT=1/60;
  for (let k=0;k<180;k++) p.update(DT,k*DT,{...inp,aimYaw:Math.PI/2,aimPitch:0});
  const d=DETENT[i];
  const tn=noiseFor(d.speed);
  console.log(`${d.name.padEnd(7)} ${d.speed.toFixed(3).padStart(9)}  ${tn.toFixed(3).padStart(11)}  ${audibleRange(tn).toFixed(2).padStart(11)} m  ||  ${p.speed.toFixed(3).padStart(11)}  ${p.noise.toFixed(3).padStart(12)}  ${audibleRange(p.noise).toFixed(2).padStart(12)} m   stick=(${inp.move.x},${inp.move.y.toFixed(3)}) run=${inp.run}`);
}
console.log(`\nSILENT_SPEED (hearFloor*run) = ${SILENT_SPEED.toFixed(3)} m/s;  darkrun.js claims the continuous-stick exploit crosses ${(SILENT_SPEED*90).toFixed(2)} m in 90 s.`);
console.log(`CREEP as the ENGINE plays it: 0.318 m/s x 90 s = ${(0.318*90).toFixed(1)} m at an audible radius of ${(14*0.061).toFixed(2)} m.`);
