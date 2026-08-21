const SRC = new URL('../../src/', new URL('.', import.meta.url));
const s_ = (p) => new URL(p, SRC).href;
globalThis.location = { search: '' };
globalThis.document = { createElementNS: () => ({ set src(_v){}, get src(){return '';}, addEventListener(){}, removeEventListener(){}, style:{} }), createElement: () => ({ style:{}, getContext: () => null }) };
const rw=console.warn,re=console.error; console.warn=()=>{}; console.error=()=>{};
const { initBaker } = await import(s_('materials/baker.js'));
initBaker({ getRenderTarget:()=>null, setRenderTarget:()=>{}, render:()=>{}, readRenderTargetPixels:(a,b,c,d,e,buf)=>{buf[0]=200;buf[1]=200;buf[2]=200;if(buf.length>3)buf[3]=255;} });
const THREE = await import('three');
const RM = await import(s_('game/room.js'));
const room = await RM.buildTestRoom({ work:(p)=>p }, {});
console.warn=rw; console.error=re;
for (const p of room.portals()) if (['D1','D4','D5','D6'].includes(p.id)) console.log(p.id, JSON.stringify({a:p.a,b:p.b,axis:p.axis,w:p.w,h:p.h,centre:p.centre,normal:p.normal}));
const spawn = room.spawn.player[0];
const term = room.anchor('ballroom.centre');
console.log('\nhops spawn->ballroom:', room.pathPortals(spawn, term, 0.6, 1.9).map(h=>({id:h.id, centre:h.centre, normal:h.normal})));
// simulate the steer function from a few positions along the way
function steer(pos, terminal) {
  const hops = room.pathPortals(pos, terminal, 0.6, 1.9);
  const h = hops[0]; const c = h && h.centre;
  if (c && Number.isFinite(c.x) && Number.isFinite(c.z)) {
    const n = h.normal || { x: 0, z: 1 };
    const side = Math.sign((pos.x - c.x) * n.x + (pos.z - c.z) * n.z) || 1;
    return { via: h.id, x: c.x - n.x*side*1.5, z: c.z - n.z*side*1.5, side, n };
  }
  return { via:'direct', x: terminal.x, z: terminal.z };
}
for (const z of [-11.6,-10.5,-9.5,-9.0,-8.6,-8.45,-8.2,-7.5]) {
  const p = new THREE.Vector3(-8.6, room.floorY, z);
  console.log(`pos z ${z}  space ${room.spaceAt(p)?.id}  steer -> ${JSON.stringify(steer(p, term))}`);
}
