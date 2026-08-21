import { play, POLICIES } from './_mr8_full.mjs';
import { room, THREE, Player, LimbField, EXP, detentInput } from './_mr2_sim.mjs';
// trace the gallery CREEP run positionally
let s=7; const rng=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
const scene=new THREE.Scene(); const field=new LimbField(scene,{rng,floorY:room.floorY,bounds:room.bounds});
const p=new Player({scene,world:room,field,rng,id:'r',avatar:null});
p.pos.copy(room.spawn.player[0]); p.facing=Math.PI;
const term=room.anchor('gallery.east');
const DT=1/60;
for(let i=0;i<90/DT;i++){
  const hops=room.pathPortals(p.pos,term,0.6,1.9); const h=hops[0]; const c=h&&h.centre;
  let leg;
  if(c){ const n=h.normal||{x:0,z:1}; const here=room.spaceAt(p.pos)?.id??null; const far=h.a===here?h.b:h.a;
    const fs=room.spaces.find(x=>x.id===far); const fc=fs?{x:(fs.x0+fs.x1)/2,z:(fs.z0+fs.z1)/2}:term;
    const side=Math.sign((fc.x-c.x)*n.x+(fc.z-c.z)*n.z)||1; leg={x:c.x+n.x*side*1.5,z:c.z+n.z*side*1.5};
  } else leg={x:term.x,z:term.z};
  const heading=Math.atan2(leg.x-p.pos.x,leg.z-p.pos.z);
  p.aimYaw=heading;
  p.update(DT,i*DT,{...detentInput(1),aimYaw:heading,aimPitch:0}); room.update(DT);
  if(i%300===0) console.log(`${(i*DT).toFixed(1)}s (${p.pos.x.toFixed(2)},${p.pos.z.toFixed(2)}) ${room.spaceAt(p.pos)?.id} d=${Math.hypot(term.x-p.pos.x,term.z-p.pos.z).toFixed(2)} spd=${p.speed.toFixed(2)} leg=(${leg.x.toFixed(1)},${leg.z.toFixed(1)})`);
}
