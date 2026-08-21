import { room, THREE, Player, LimbField, HunterAI, NoiseBus, detentInput } from './_mr2_sim.mjs';
let s=4; const rng=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
const scene=new THREE.Scene(); const field=new LimbField(scene,{rng,floorY:room.floorY,bounds:room.bounds});
const p=new Player({scene,world:room,field,rng,id:'r',avatar:null});
for (const k of ['shoulderL','shoulderR','hipL','hipR']) p.rig.detach(k,{impulse:new THREE.Vector3(0,2.9,0),spin:new THREE.Vector3()});
console.log('runner after 4 previous takes:', JSON.stringify(p.caps));
const centre = room.anchor('ballroom.centre');
p.pos.set(centre.x, 0, centre.z);
const body={root:p.root,rig:p.rig,height:p.height,radius:p.radius,get noise(){return p.noise;}};
const h=new HunterAI({room,scene,rng,position:new THREE.Vector3(centre.x+4,0,centre.z),noise:new NoiseBus(),bangPolicy:'off'});
h.setTargets([body]); h.awareness=1; h.state='PURSUE'; h.target=body; h.lastKnown.copy(p.root.position);
let kills=0; h.onKill=()=>kills++;
const DT=1/60; let attackFrames=0, minSep=Infinity, moved=0;
const start=p.pos.clone();
for(let i=0;i<90/DT;i++){
  p.aimYaw=0; p.update(DT,i*DT,{...detentInput(3),aimYaw:0,aimPitch:0}); room.update(DT);
  h.update(DT,i*DT);
  if(h.state==='ATTACK') attackFrames++;
  const sep=Math.hypot(p.pos.x-h.root.position.x,p.pos.z-h.root.position.z); if(sep<minSep) minSep=sep;
}
console.log(`90 s of a committed Hunter at point-blank on a limbless runner holding RUN:`);
console.log(`  onKill fired ${kills} times.  ATTACK for ${(attackFrames/60).toFixed(1)} s.  closest approach ${minSep.toFixed(2)} m.`);
console.log(`  the runner moved ${p.pos.distanceTo(start).toFixed(2)} m (gait '${p.caps.gait}', throttle at RUN).`);
console.log(`  views/expedition.js's ONLY death test is hunter.onKill -> outcome would be 'held'.`);
