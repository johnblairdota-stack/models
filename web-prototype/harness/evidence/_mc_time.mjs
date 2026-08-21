/** throwaway: honest per-wing completion time for a COMPETENT HUMAN runner (perfect route),
 *  real Player physics, at each fixed detent. Waypoints = door centres then terminal. */
const SRC = new URL('../../src/', new URL('.', import.meta.url));
const s_ = (p) => new URL(p, SRC).href;
globalThis.location = { search: '' };
globalThis.document = { createElementNS: () => ({ set src(_v){}, get src(){return '';}, addEventListener(){}, removeEventListener(){}, style:{} }), createElement: () => ({ style:{}, getContext: () => null }) };
const rw=console.warn,re=console.error; console.warn=()=>{}; console.error=()=>{};
const { initBaker } = await import(s_('materials/baker.js'));
initBaker({ getRenderTarget:()=>null, setRenderTarget:()=>{}, render:()=>{}, readRenderTargetPixels:(a,b,c,d,e,buf)=>{buf[0]=200;buf[1]=200;buf[2]=200;if(buf.length>3)buf[3]=255;} });
const THREE = await import('three');
const RM = await import(s_('game/room.js'));
const { LimbField } = await import(s_('game/limbs.js'));
const { Player } = await import(s_('game/player.js'));
const { MOVE, HUNTER_SENSE } = await import(s_('game/rules.js'));
const { DETENT, audibleRange, noiseFor } = await import(s_('party/darkrun.js'));
const room = await RM.buildTestRoom({ work:(p)=>p }, {});
console.warn=rw; console.error=re;
const TERMINAL_AT = { ballroom:'ballroom.centre', gallery:'gallery.east', study_w:'study_w.north', study_e:'study_e.north', service:'service.mid', chapel:'chapel.centre' };
const DT=1/60, REACH=2.2;
const lcg=(s)=>{let x=(s*2654435761)>>>0;return()=>{x=(x*1664525+1013904223)>>>0;return x/4294967296;};};
function detentInput(d0){ const d=DETENT[d0]; if(!d||d.speed<=0) return {move:{x:0,y:0},run:false}; const top=d.speed>MOVE.walk?MOVE.run:MOVE.walk; return {move:{x:0,y:Math.min(1,d.speed/top)},run:d.speed>MOVE.walk}; }
function mk(){ const scene=new THREE.Scene(); const rng=lcg(1); const field=new LimbField(scene,{rng,floorY:room.floorY,bounds:room.bounds}); const p=new Player({scene,world:room,field,rng,id:'r',avatar:null}); p.pos.copy(room.spawn.player[0]); p.facing=Math.PI; return p; }

/** the route a competent human takes: through each door on the BFS path, then the terminal */
function routeFor(wing) {
  const spawn = room.spawn.player[0];
  const term = room.anchor(TERMINAL_AT[wing]);
  const hops = room.pathPortals(spawn, term, 0.6, 1.9);
  const pts = [];
  let cur = { x: spawn.x, z: spawn.z };
  for (const h of hops) {
    const n = h.normal || { x: 0, z: 1 };
    const a = { x: h.centre.x + n.x * 1.2, z: h.centre.z + n.z * 1.2 };
    const b = { x: h.centre.x - n.x * 1.2, z: h.centre.z - n.z * 1.2 };
    const da = Math.hypot(a.x - cur.x, a.z - cur.z), db = Math.hypot(b.x - cur.x, b.z - cur.z);
    const near = da < db ? a : b, far = da < db ? b : a;
    pts.push(near, { x: h.centre.x, z: h.centre.z }, far);
    cur = far;
  }
  pts.push({x:term.x, z:term.z});
  return { pts, term };
}
function timeTo(wing, detent, cap=400) {
  const { pts, term } = routeFor(wing);
  const p = mk(); let i=0, t=0, dist=0, path=[];
  const prev = new THREE.Vector3();
  for (let k=0;k*DT<cap;k++) {
    t=k*DT;
    const g = pts[i];
    const dg = Math.hypot(g.x-p.pos.x, g.z-p.pos.z);
    if (dg < (i<pts.length-1 ? 0.5 : REACH)) { if (i<pts.length-1) { i++; continue; } }
    const dTerm = Math.hypot(term.x-p.pos.x, term.z-p.pos.z);
    if (dTerm < REACH) return { t, dist, ok:true };
    const heading = Math.atan2(g.x-p.pos.x, g.z-p.pos.z);
    prev.copy(p.pos);
    p.aimYaw = heading;
    p.update(DT, t, { ...detentInput(detent), aimYaw: heading, aimPitch: 0 });
    room.update(DT);
    dist += Math.hypot(p.pos.x-prev.x, p.pos.z-prev.z);
  }
  return { t, dist, ok:false };
}
console.log('=== COMPETENT HUMAN ROUTE · real Player · time from spawn to terminal ===');
console.log(' wing        route(m)   CREEP 0.90     WALK 2.55     RUN 5.20    RUN as % of 90s clock');
const runs = [];
for (const wing of Object.keys(TERMINAL_AT)) {
  const c = timeTo(wing,1), w = timeTo(wing,2), r = timeTo(wing,3);
  runs.push({wing, c, w, r});
  const f=(x)=> x.ok ? `${x.t.toFixed(1)}s`.padEnd(13) : 'UNREACHABLE  ';
  console.log(` ${wing.padEnd(11)} ${r.dist.toFixed(1).padStart(6)}     ${f(c)} ${f(w)} ${f(r)}  ${r.ok?(r.t/90*100).toFixed(0)+'%':'-'}`);
}
const okr = runs.filter(x=>x.r.ok).map(x=>x.r.t).sort((a,b)=>a-b);
const okw = runs.filter(x=>x.w.ok).map(x=>x.w.t).sort((a,b)=>a-b);
const okc = runs.filter(x=>x.c.ok).map(x=>x.c.t).sort((a,b)=>a-b);
const med=(a)=>a.length?a[Math.floor(a.length/2)]:NaN;
console.log(`\n median over reachable wings — RUN ${med(okr).toFixed(1)}s · WALK ${med(okw).toFixed(1)}s · CREEP ${med(okc).toFixed(1)}s`);
console.log(` slowest reachable wing — RUN ${Math.max(...okr).toFixed(1)}s · WALK ${Math.max(...okw).toFixed(1)}s · CREEP ${okc.length?Math.max(...okc).toFixed(1):'-'}s`);

console.log('\n=== the detent ledger ===');
console.log(' detent   speed   noise   audible to hunter at   90 s covers   time for the longest reachable route');
const longest = Math.max(...runs.filter(x=>x.r.ok).map(x=>x.r.dist));
for (let i=0;i<DETENT.length;i++) {
  const d = DETENT[i]; const n = noiseFor(d.speed);
  console.log(` ${d.name.padEnd(7)} ${d.speed.toFixed(2)}   ${n.toFixed(2)}    ${audibleRange(n).toFixed(2)} m`.padEnd(62)
    + `${(d.speed*90).toFixed(0)} m`.padStart(8) + `        ${d.speed>0?(longest/d.speed).toFixed(0)+' s':'never'}`);
}
console.log(` (hearFloor ${HUNTER_SENSE.hearFloor}, hearRange ${HUNTER_SENSE.hearRange} m, sightRange ${HUNTER_SENSE.sightRange} m)`);
console.log(` house diagonal: ${Math.hypot(room.bounds.maxX-room.bounds.minX, room.bounds.maxZ-room.bounds.minZ).toFixed(1)} m (bounds ${(room.bounds.maxX-room.bounds.minX).toFixed(1)} x ${(room.bounds.maxZ-room.bounds.minZ).toFixed(1)})`);
