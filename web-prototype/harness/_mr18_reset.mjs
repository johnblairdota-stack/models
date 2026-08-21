import { room, THREE, Player, LimbField, HunterAI, NoiseBus } from './_mr2_sim.mjs';
const { MOVE, gaitFor } = await import(new URL('../src/game/rules.js', import.meta.url).href);
/** views/expedition.js builds ONE Player for the page and arm() re-arms it per episode.
 *  arm() touches pos, facing, heading, detent, lightRig — and nothing on the rig. */
let s=4; const rng=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
const scene=new THREE.Scene(); const field=new LimbField(scene,{rng,floorY:room.floorY,bounds:room.bounds});
const p=new Player({scene,world:room,field,rng,id:'runner',avatar:null});
const h=new HunterAI({room,scene,rng,position:room.spawn.hunter.clone(),noise:new NoiseBus(),bangPolicy:'auto'});
h.setTargets([{root:p.root,rig:p.rig,height:p.height,radius:p.radius,get noise(){return p.noise;}}]);
h.target = h.targets?.[0] ?? { root:p.root, rig:p.rig };
console.log('episode | what arm() does: pos/facing/heading/detent/lightRig.  NOT the rig.');
console.log('ep  before-take: arms legs gait   scale canRun  |  after-take: arms legs gait   scale canRun  top speed');
for (let ep=1; ep<=5; ep++) {
  const b = p.caps;
  // one take = hunter._attack's socket pick + detach, exactly
  const socket = ['shoulderL','shoulderR','hipL','hipR'].find(k => p.rig.occupant(k) !== 'empty');
  if (socket) p.rig.detach(socket, { impulse: new THREE.Vector3(0,2.9,0), spin: new THREE.Vector3() });
  const a = p.caps;
  const top = (a.canRun ? MOVE.run : MOVE.walk) * a.speedScale;
  console.log(`${String(ep).padStart(2)}   ${String(b.arms).padStart(4)} ${String(b.legs).padStart(4)} ${b.gait.padEnd(6)} ${String(b.speedScale).padStart(5)} ${String(b.canRun).padStart(6)}  |  ${String(a.arms).padStart(9)} ${String(a.legs).padStart(4)} ${a.gait.padEnd(6)} ${String(a.speedScale).padStart(5)} ${String(a.canRun).padStart(6)}  ${top.toFixed(2)} m/s   (took ${socket})`);
  // arm(), verbatim from views/expedition.js:487-501 — nothing here touches the rig
  p.pos.copy(room.spawn.player[0]); p.facing=Math.PI;
  h.root.position.copy(room.spawn.hunter); h.awareness=0; h.state='PATROL'; h.target=null; h.contact=0; h.searchTimer=0; h.resetCombat();
  h.target = { root:p.root, rig:p.rig };
}
console.log(`\nlimbs left on the floor after 5 episodes: LimbField items = ${field.items?.length ?? '(n/a)'}`);
console.log(`hunter at ${MOVE.run>2.05?'2.05':''} m/s vs a runner whose top speed is now ${((p.caps.canRun?MOVE.run:MOVE.walk)*p.caps.speedScale).toFixed(2)} m/s`);
