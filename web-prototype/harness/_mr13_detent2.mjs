import { room, THREE, Player, LimbField, MOVE, DETENT, detentInput } from './_mr2_sim.mjs';
const { noiseFor, audibleRange, SILENT_SPEED } = await import(new URL('../src/party/darkrun.js', import.meta.url).href);
console.log('detent   TABLE speed / noise / audible   ||   ENGINE speed / noise / audible   (free body, no collide)');
for (let i = 0; i < DETENT.length; i++) {
  let s=1; const rng=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
  const scene=new THREE.Scene(); const field=new LimbField(scene,{rng,floorY:0,bounds:room.bounds});
  const p=new Player({scene,world:{ floorY:0 },field,rng,id:'r',avatar:null});
  const inp=detentInput(i); const DT=1/60;
  for(let k=0;k<240;k++) p.update(DT,k*DT,{...inp,aimYaw:0,aimPitch:0});
  const d=DETENT[i], tn=noiseFor(d.speed);
  console.log(`${d.name.padEnd(6)}  ${d.speed.toFixed(3)} / ${tn.toFixed(3)} / ${audibleRange(tn).toFixed(2).padStart(5)} m   ||   ${p.speed.toFixed(3)} / ${p.noise.toFixed(3)} / ${audibleRange(p.noise).toFixed(2).padStart(5)} m   ratio ${(p.speed/(d.speed||1)).toFixed(3)}`);
}
