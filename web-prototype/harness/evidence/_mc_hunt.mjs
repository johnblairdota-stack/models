/** throwaway: the full 90 s party expedition with the REAL HunterAI, a competent human route,
 *  measured per throttle policy. Counts every destruction event the house emits. */
const SRC = new URL('../../src/', new URL('.', import.meta.url));
const s_ = (p) => new URL(p, SRC).href;
globalThis.location = { search: '' };
globalThis.document = { createElementNS: () => ({ set src(_v){}, get src(){return '';}, addEventListener(){}, removeEventListener(){}, style:{} }), createElement: () => ({ style:{}, getContext: () => null }) };
const rw=console.warn,re=console.error; console.warn=()=>{}; console.error=()=>{};
const { initBaker } = await import(s_('materials/baker.js'));
initBaker({ getRenderTarget:()=>null, setRenderTarget:()=>{}, render:()=>{}, readRenderTargetPixels:(a,b,c,d,e,buf)=>{buf[0]=200;buf[1]=200;buf[2]=200;if(buf.length>3)buf[3]=255;} });
const THREE = await import('three');
const RM = await import(s_('game/room.js'));
const { HunterAI } = await import(s_('game/hunter-ai.js'));
const { NoiseBus } = await import(s_('game/noise.js'));
const { LimbField } = await import(s_('game/limbs.js'));
const { Player } = await import(s_('game/player.js'));
const { MOVE, HUNTER_SENSE } = await import(s_('game/rules.js'));
const { DETENT } = await import(s_('party/darkrun.js'));
const room = await RM.buildTestRoom({ work:(p)=>p }, {});
console.warn=rw; console.error=re;
const TERMINAL_AT = { ballroom:'ballroom.centre', gallery:'gallery.east', study_w:'study_w.north', study_e:'study_e.north', service:'service.mid', chapel:'chapel.centre' };
const WINGS = ['ballroom','gallery','study_w','study_e','service'];
const DT=1/60, REACH=2.2, CLOCK=90;
const lcg=(s)=>{let x=(s*2654435761)>>>0;return()=>{x=(x*1664525+1013904223)>>>0;return x/4294967296;};};
function detentInput(d0){ const d=DETENT[d0]; if(!d||d.speed<=0) return {move:{x:0,y:0},run:false}; const top=d.speed>MOVE.walk?MOVE.run:MOVE.walk; return {move:{x:0,y:Math.min(1,d.speed/top)},run:d.speed>MOVE.walk}; }
function routeFor(from, term) {
  const hops = room.pathPortals(from, term, 0.6, 1.9);
  const pts = []; let cur = { x: from.x, z: from.z };
  for (const h of hops) {
    const n = h.normal || { x:0,z:1 };
    const a = { x:h.centre.x+n.x*1.2, z:h.centre.z+n.z*1.2 }, b = { x:h.centre.x-n.x*1.2, z:h.centre.z-n.z*1.2 };
    const near = Math.hypot(a.x-cur.x,a.z-cur.z) < Math.hypot(b.x-cur.x,b.z-cur.z) ? a : b;
    const far = near===a?b:a;
    pts.push(near,{x:h.centre.x,z:h.centre.z},far); cur = far;
  }
  pts.push({x:term.x,z:term.z});
  return pts;
}
function run({ wing, seed, policy, stage }) {
  const scene = new THREE.Scene(); const rng = lcg(seed);
  const field = new LimbField(scene,{rng,floorY:room.floorY,bounds:room.bounds});
  const player = new Player({scene,world:room,field,rng,id:'r',avatar:null});
  player.pos.copy(room.spawn.player[0]); player.facing = Math.PI;
  const term = room.anchor(TERMINAL_AT[wing]).clone();
  let pts = routeFor(player.pos, term), i = 0;
  const noise = new NoiseBus();
  const hunter = new HunterAI({ room, scene:null, rng, position: room.spawn.hunter.clone(), noise, bangPolicy:'auto', stage });
  hunter.radius = 0.30 + stage*0.12;
  hunter.setTargets([{ root: player.root, rig: player.rig, height: player.height, radius: player.radius, get noise(){return player.noise;} }]);
  let bangs=0, through=0, doors=0, growths=0, kills=0, killT=null;
  hunter.onBang = ({through:th}) => { bangs++; if (th) through++; };
  hunter.onDoor = () => doors++;
  hunter.onStage = () => growths++;
  hunter.onKill = () => { kills++; if (killT==null) killT=t; };
  let t=0, outcome=null, aware=0, seen=0, minC=Infinity, commit=0;
  hunter.onCommit = () => commit++;
  for (let k=0;k*DT<CLOCK;k++) {
    t=k*DT;
    const g = pts[Math.min(i,pts.length-1)];
    if (i<pts.length-1 && Math.hypot(g.x-player.pos.x,g.z-player.pos.z)<0.5) { i++; continue; }
    const dTerm = Math.hypot(term.x-player.pos.x, term.z-player.pos.z);
    const det = policy==='solo' ? (dTerm>9?3:dTerm>3.5?2:dTerm>REACH?1:0) : policy;
    const heading = Math.atan2(g.x-player.pos.x, g.z-player.pos.z);
    player.aimYaw = heading;
    player.update(DT,t,{...detentInput(det), aimYaw:heading, aimPitch:0});
    room.update(DT);
    if (player.noise>0) noise.emit(player.pos, player.noise, 'move');
    noise.update(DT);
    hunter.update(DT,t);
    if (hunter.awareness>=HUNTER_SENSE.alertAt) aware+=DT;
    if (hunter.sawThisFrame) seen+=DT;
    const c = Math.hypot(player.pos.x-hunter.root.position.x, player.pos.z-hunter.root.position.z);
    if (c<minC) minC=c;
    if (kills>0) { outcome='taken'; break; }
    if (dTerm<REACH) { outcome='lit'; break; }
  }
  if (!outcome) outcome='held';
  hunter.dispose();
  return { wing, seed, policy, stage, outcome, t, aware, seen, minC, bangs, through, doors, growths, endStage:hunter.stage, limbs:player.limbsLost };
}
const q=(a,p)=>{const b=[...a].sort((x,y)=>x-y);return b[Math.min(b.length-1,Math.floor(p*b.length))];};
const SEEDS=[1,2,3,4,5,6,7,8];
const POL = { 'solo ladder':'solo', 'CREEP always':1, 'WALK always':2, 'RUN always':3 };
console.log('=== 90 s expedition · real HunterAI · shipped house · 8 seeds x 3 stages x 5 reachable wings ===\n');
console.log(' policy         runs   lit%  taken%  held%   median t   median AWARE s  median SEEN s  median minDist   hunter door-blows  breaches through  growths');
for (const [name,policy] of Object.entries(POL)) {
  const rr=[];
  for (const stage of [1,2,3]) for (const seed of SEEDS) for (const wing of WINGS) rr.push(run({wing,seed,policy,stage}));
  const pc=(n)=>`${(n/rr.length*100).toFixed(0)}%`;
  console.log(` ${name.padEnd(13)} ${String(rr.length).padStart(5)}  ${pc(rr.filter(r=>r.outcome==='lit').length).padStart(5)} ${pc(rr.filter(r=>r.outcome==='taken').length).padStart(6)} ${pc(rr.filter(r=>r.outcome==='held').length).padStart(6)}   ${q(rr.map(r=>r.t),0.5).toFixed(1)} s     ${q(rr.map(r=>r.aware),0.5).toFixed(1)} s          ${q(rr.map(r=>r.seen),0.5).toFixed(1)} s         ${q(rr.map(r=>r.minC),0.5).toFixed(1)} m           ${rr.reduce((a,r)=>a+r.bangs,0)}              ${rr.reduce((a,r)=>a+r.through,0)}          ${rr.reduce((a,r)=>a+r.growths,0)}`);
}
console.log('\n=== how long the SEGMENT lasts vs the 90 s clock (WALK always) ===');
{
  const rr=[]; for (const stage of [1,2,3]) for (const seed of SEEDS) for (const wing of WINGS) rr.push(run({wing,seed,policy:2,stage}));
  const ts = rr.map(r=>r.t).sort((a,b)=>a-b);
  console.log(` min ${ts[0].toFixed(1)}s  p25 ${q(ts,0.25).toFixed(1)}s  median ${q(ts,0.5).toFixed(1)}s  p75 ${q(ts,0.75).toFixed(1)}s  max ${ts[ts.length-1].toFixed(1)}s`);
  console.log(` dead air after the outcome (90 - t): median ${(90-q(ts,0.5)).toFixed(1)}s of a frozen simulation`);
  for (const wing of WINGS) { const v=rr.filter(r=>r.wing===wing); console.log(`   ${wing.padEnd(9)} median ${q(v.map(r=>r.t),0.5).toFixed(1)}s  lit ${v.filter(r=>r.outcome==='lit').length}/${v.length}  taken ${v.filter(r=>r.outcome==='taken').length}`); }
}
console.log('\n=== chapel (no door, runner has no dig verb) ===');
{ const rr=[]; for (const stage of [1,2,3]) for (const seed of SEEDS) rr.push(run({wing:'chapel',seed,policy:2,stage}));
  const o={}; for (const r of rr) o[r.outcome]=(o[r.outcome]??0)+1;
  console.log(' outcomes', JSON.stringify(o), ' median t', q(rr.map(r=>r.t),0.5).toFixed(1)+'s'); }
