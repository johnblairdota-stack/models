// throwaway: is D4 physically passable by the real Player?
const SRC = new URL('../../src/', new URL('.', import.meta.url));
const s_ = (p) => new URL(p, SRC).href;
globalThis.location = { search: '' };
globalThis.document = { createElementNS: () => ({ set src(_v){}, get src(){return '';}, addEventListener(){}, removeEventListener(){}, style:{} }), createElement: () => ({ style:{}, getContext: () => null }) };
const rw = console.warn, re = console.error; console.warn=()=>{}; console.error=()=>{};
const { initBaker } = await import(s_('materials/baker.js'));
initBaker({ getRenderTarget:()=>null, setRenderTarget:()=>{}, render:()=>{}, readRenderTargetPixels:(a,b,c,d,e,buf)=>{buf[0]=200;buf[1]=200;buf[2]=200;if(buf.length>3)buf[3]=255;} });
const THREE = await import('three');
const RM = await import(s_('game/room.js'));
const { LimbField } = await import(s_('game/limbs.js'));
const { Player } = await import(s_('game/player.js'));
const { MOVE, PASS_H, STEP_H } = await import(s_('game/rules.js'));
const { DETENT } = await import(s_('party/darkrun.js'));
const room = await RM.buildTestRoom({ work:(p)=>p }, {});
console.warn=rw; console.error=re;
const lcg=(s)=>{let x=(s*2654435761)>>>0;return()=>{x=(x*1664525+1013904223)>>>0;return x/4294967296;};};
const DT=1/60;
function detentInput(detent){ const d=DETENT[detent]; if(!d||d.speed<=0) return {move:{x:0,y:0},run:false}; const top=d.speed>MOVE.walk?MOVE.run:MOVE.walk; return {move:{x:0,y:Math.min(1,d.speed/top)},run:d.speed>MOVE.walk}; }
function mk(){ const scene=new THREE.Scene(); const rng=lcg(1); const field=new LimbField(scene,{rng,floorY:room.floorY,bounds:room.bounds}); const p=new Player({scene,world:room,field,rng,id:'r',avatar:null}); p.pos.copy(room.spawn.player[0]); p.facing=Math.PI; return p; }

// waypoint drive: a list of points, drive to each in turn
function drive(pts, detent, secs=60, label='') {
  const p = mk(); let i=0, t=0, log=[];
  for (let k=0;k*DT<secs;k++) {
    t=k*DT;
    const g = pts[i];
    const d = Math.hypot(g.x-p.pos.x, g.z-p.pos.z);
    if (d < 1.0) { if (i<pts.length-1) i++; else break; }
    const heading = Math.atan2(g.x-p.pos.x, g.z-p.pos.z);
    p.aimYaw = heading;
    p.update(DT, t, { ...detentInput(detent), aimYaw: heading, aimPitch: 0 });
    room.update(DT);
    if (k%30===0) log.push(`${t.toFixed(1)}s (${p.pos.x.toFixed(2)},${p.pos.z.toFixed(2)}) sp ${p.speed.toFixed(2)} -> wp${i} in ${room.spaceAt(p.pos)?.id}`);
  }
  console.log(`${label}: ended t=${t.toFixed(1)}s at (${p.pos.x.toFixed(2)},${p.pos.z.toFixed(2)}) in ${room.spaceAt(p.pos)?.id} wp ${i}/${pts.length-1}`);
  return { p, t, log, i };
}
// D4 centre at (-8.60, -8.45). Spawn (-8.60,-11.60) in study_w. Ballroom terminal (0,-0.65).
console.log('--- straight through D4, RUN, human-style waypoints ---');
const a = drive([{x:-8.60,z:-8.45},{x:-8.60,z:-6.0},{x:0,z:-0.65}], 3, 30, 'D4 direct');
a.log.forEach(l=>console.log('   ',l));
console.log('--- straight through D4, WALK ---');
const b = drive([{x:-8.60,z:-8.45},{x:-8.60,z:-6.0},{x:0,z:-0.65}], 2, 60, 'D4 walk');
b.log.slice(0,20).forEach(l=>console.log('   ',l));
console.log('--- straight through D4, CREEP ---');
drive([{x:-8.60,z:-8.45},{x:-8.60,z:-6.0},{x:0,z:-0.65}], 1, 120, 'D4 creep');
console.log('--- through D1 to gallery, RUN (the wing that works) ---');
drive([{x:-8.60,z:-24.15},{x:-8.60,z:-26.5},{x:12.0,z:-27.6}], 3, 40, 'D1 direct');
// probe: sweep collide across the D4 aperture to see the clear channel
console.log('\n--- collide sweep across D4 (z from -9.6 to -7.4 at x=-8.60), radius 0.34 ---');
for (let z=-9.6; z<=-7.4; z+=0.2) {
  const out = room.collide(new THREE.Vector3(-8.60, room.floorY, z), 0.34, PASS_H.robot, STEP_H.robot);
  console.log(`  z ${z.toFixed(2)} -> (${out.x.toFixed(2)}, ${out.z.toFixed(2)}) moved ${Math.hypot(out.x+8.60,out.z-z).toFixed(3)}`);
}
console.log('\n--- collide sweep across D1 (z -25.2..-23.0 at x=-8.60) ---');
for (let z=-25.2; z<=-23.0; z+=0.2) {
  const out = room.collide(new THREE.Vector3(-8.60, room.floorY, z), 0.34, PASS_H.robot, STEP_H.robot);
  console.log(`  z ${z.toFixed(2)} -> (${out.x.toFixed(2)}, ${out.z.toFixed(2)}) moved ${Math.hypot(out.x+8.60,out.z-z).toFixed(3)}`);
}
