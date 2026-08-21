// throwaway: house geometry + route lengths
const SRC = new URL('../../src/', new URL('.', import.meta.url));
const s_ = (p) => new URL(p, SRC).href;
globalThis.location = { search: '' };
globalThis.document = { createElementNS: () => ({ set src(_v) {}, get src(){return '';}, addEventListener(){}, removeEventListener(){}, style:{} }), createElement: () => ({ style:{}, getContext: () => null }) };
const realWarn = console.warn; console.warn = () => {};
const { initBaker } = await import(s_('materials/baker.js'));
initBaker({ getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {}, readRenderTargetPixels: (a,b,c,d,e,buf)=>{buf[0]=200;buf[1]=200;buf[2]=200;if(buf.length>3)buf[3]=255;} });
const THREE = await import('three');
const RM = await import(s_('game/room.js'));
const room = await RM.buildTestRoom({ work: (p) => p }, {});
const SP = await import(s_('game/spaces.js'));
console.warn = realWarn;

const TERMINAL_AT = { ballroom:'ballroom.centre', gallery:'gallery.east', study_w:'study_w.north', study_e:'study_e.north', service:'service.mid', chapel:'chapel.centre' };

console.log('=== SPACES ===');
for (const s of room.spaces) console.log(` ${s.id.padEnd(9)} x ${s.x0.toFixed(2)}..${s.x1.toFixed(2)}  z ${s.z0.toFixed(2)}..${s.z1.toFixed(2)}  ${(s.x1-s.x0).toFixed(1)}x${(s.z1-s.z0).toFixed(1)} m  storey ${s.storey}`);
console.log('\n=== SPAWN ===');
console.log(' player', room.spawn.player.map(p=>`(${p.x.toFixed(2)},${p.z.toFixed(2)}) in ${room.spaceAt(p)?.id}`).join(' '));
console.log(' hunter', `(${room.spawn.hunter.x.toFixed(2)},${room.spawn.hunter.z.toFixed(2)}) in ${room.spaceAt(room.spawn.hunter)?.id}`);
console.log('\n=== PORTALS OPEN AT T0 ===');
for (const p of room.portals()) console.log(` ${String(p.id).padEnd(10)} ${p.a} <-> ${p.b}  w ${p.w?.toFixed(2)} h ${(p.h??0).toFixed(2)} kind ${p.kind??'door'} centre (${p.centre.x.toFixed(2)},${p.centre.z.toFixed(2)})`);
console.log('\n=== PANELS (breachable) ===');
for (const p of room.panels) {
  const d = p.spec;
  console.log(` ${String(d.id).padEnd(14)} ${d.a}->${d.b} state ${d.state} blocksMove ${p.blocksMovement()} at (${d.x?.toFixed(2)},${d.z?.toFixed(2)})`);
}
console.log('\n=== ROUTES spawn -> terminal ===');
const spawn = room.spawn.player[0];
for (const [wing, an] of Object.entries(TERMINAL_AT)) {
  const t = room.anchor(an);
  if (!t) { console.log(` ${wing}: NO ANCHOR ${an}`); continue; }
  const hops = room.pathPortals(spawn, t, 0.6, 1.9);
  const pts = [spawn, ...hops.map(h=>h.centre), t];
  let len = 0; for (let i=1;i<pts.length;i++) len += Math.hypot(pts[i].x-pts[i-1].x, pts[i].z-pts[i-1].z);
  const straight = Math.hypot(t.x-spawn.x, t.z-spawn.z);
  const from = room.spaceAt(spawn)?.id, to = room.spaceAt(t)?.id;
  console.log(` ${wing.padEnd(9)} terminal (${t.x.toFixed(2)},${t.z.toFixed(2)}) in ${to}  hops [${hops.map(h=>h.id).join(',')}]  polyline ${len.toFixed(2)} m  straight ${straight.toFixed(2)} m  reachable ${from===to || hops.length>0}`);
}
console.log('\n=== ALL-PAIRS room graph (open now) ===');
for (const a of room.spaces) {
  const outs = room.spaces.filter(b=>b.id!==a.id).map(b=>{ const h=room.pathPortals(a.id,b.id,0.6,1.9); return `${b.id}:${h.length?h.map(x=>x.id).join('>'):'UNREACHABLE'}`; });
  console.log(` ${a.id.padEnd(9)} ${outs.join('  ')}`);
}
