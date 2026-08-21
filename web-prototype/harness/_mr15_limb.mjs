import { room, THREE, Player, LimbField, HunterAI, NoiseBus, EXP, detentInput } from './_mr2_sim.mjs';
/** What does the room SEE between 'fine' and 'gone'? */
let s=7; const rng=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
const scene=new THREE.Scene(); const field=new LimbField(scene,{rng,floorY:room.floorY,bounds:room.bounds});
const p=new Player({scene,world:room,field,rng,id:'r',avatar:null});
p.pos.copy(room.spawn.player[0]); p.facing=Math.PI;
const term=room.anchor('ballroom.centre');
const body={root:p.root,rig:p.rig,height:p.height,radius:p.radius,get noise(){return p.noise;}};
const noise=new NoiseBus();
const h=new HunterAI({room,scene:null,rng,position:room.spawn.hunter.clone(),noise,bangPolicy:'auto'});
h.setTargets([body]);
let outcome=null, simT=0; const log=[];
h.onKill=(c,socket,item)=>{ log.push(`  onKill  t=${simT.toFixed(2)}  socket=${socket}  caps.arms=${p.caps.arms} legs=${p.caps.legs} gait=${p.caps.gait} wounds=${p.caps.wounds}`); if(!outcome){outcome='taken'; log.push(`  ==> finish('taken') fires HERE; the loop switches to aftermath() and the sim stops.`);} };
const DT=1/60; let lastState=null, firstAttack=null;
for(let i=0;i<90/DT && !outcome;i++){
  simT=i*DT;
  const hops=room.pathPortals(p.pos,term,0.6,1.9); const c0=hops[0]&&hops[0].centre;
  let leg;
  if(c0){const hh=hops[0];const n=hh.normal||{x:0,z:1};const here=room.spaceAt(p.pos)?.id??null;const far=hh.a===here?hh.b:hh.a;
    const fs=room.spaces.find(x=>x.id===far);const fc=fs?{x:(fs.x0+fs.x1)/2,z:(fs.z0+fs.z1)/2}:term;
    const side=Math.sign((fc.x-c0.x)*n.x+(fc.z-c0.z)*n.z)||1; leg={x:c0.x+n.x*side*1.5,z:c0.z+n.z*side*1.5};}
  else leg={x:term.x,z:term.z};
  const heading=Math.atan2(leg.x-p.pos.x,leg.z-p.pos.z);
  p.aimYaw=heading; p.update(DT,simT,{...detentInput(1),aimYaw:heading,aimPitch:0}); room.update(DT);
  if(p.noise>0) noise.emit(p.pos,p.noise,'move'); noise.update(DT); h.update(DT,simT);
  if(h.state!==lastState){ log.push(`  ${simT.toFixed(2).padStart(6)}s  hunter ${lastState??'-'} -> ${h.state}  sep=${Math.hypot(p.pos.x-h.root.position.x,p.pos.z-h.root.position.z).toFixed(2)}m  runner caps: arms=${p.caps.arms} legs=${p.caps.legs} gait=${p.caps.gait} speedScale=${p.caps.speedScale}`); lastState=h.state; if(h.state==='ATTACK'&&firstAttack==null) firstAttack=simT; }
}
console.log('THE TAKE, FRAME BY FRAME (ballroom, CREEP):');
console.log(log.join('\n'));
console.log(`\noutcome=${outcome}  first ATTACK at ${firstAttack?.toFixed(2)}s  kill at ${simT.toFixed(2)}s  windup gap = ${(simT-firstAttack).toFixed(2)}s`);
console.log(`limbs left: arms=${p.caps.arms} legs=${p.caps.legs} gait=${p.caps.gait}   -> the runner is DELETED with ${p.caps.arms+p.caps.legs} of 4 limbs still on.`);
console.log(`hunter absorbed=${h.absorbed} stage=${h.stage}`);
