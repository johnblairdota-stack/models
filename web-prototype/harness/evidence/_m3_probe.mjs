import { room, THREE, Player, LimbField, MOVE, DETENT, detentInput } from './_mr2_sim.mjs';
const { HUNTER_SENSE } = await import(new URL('../../src/game/rules.js', import.meta.url).href);
const { noiseFor, audibleRange } = await import(new URL('../../src/party/darkrun.js', import.meta.url).href);
const DT=1/60;
for (let d=0; d<DETENT.length; d++){
  let s=7;const rng=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
  const scene=new THREE.Scene();const field=new LimbField(scene,{rng,floorY:room.floorY,bounds:room.bounds});
  const p=new Player({scene,world:null,field,rng,id:'r',avatar:null});
  p.pos.set(0,0,0);p.facing=0;p.aimYaw=0;
  for(let i=0;i<6*60;i++) p.update(DT,i*DT,{...detentInput(d),aimYaw:0,aimPitch:0});
  const start=p.pos.clone(); let n=0,k=0;
  for(let i=0;i<90*60;i++){p.update(DT,i*DT,{...detentInput(d),aimYaw:0,aimPitch:0});n+=p.noise;k++;}
  const dist=p.pos.distanceTo(start);
  console.log(`${DETENT[d].name.padEnd(6)} table ${DETENT[d].speed.toFixed(3)}/${noiseFor(DETENT[d].speed).toFixed(3)}/${audibleRange(noiseFor(DETENT[d].speed)).toFixed(2)}m  engine ${p.speed.toFixed(3)}/${(n/k).toFixed(3)}/${audibleRange(n/k).toFixed(2)}m  90s travel ${dist.toFixed(2)}m`);
}
console.log('hearFloor',HUNTER_SENSE.hearFloor,'hearRange',HUNTER_SENSE.hearRange,'reach',HUNTER_SENSE.reach,'peripheral',HUNTER_SENSE.peripheral);
