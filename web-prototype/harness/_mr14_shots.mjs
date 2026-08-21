/** _mr14_shots — what is ON THE TELEVISION during a party expedition, measured with the real
 *  director, the real shot solver and the real camera rig. This is the runner's only view. */
import { room, THREE, Player, LimbField, HunterAI, NoiseBus, EXP, detentInput } from './_mr2_sim.mjs';
const S = new URL('../src/', new URL('.', import.meta.url));
const s_ = (p) => new URL(p, S).href;
const { createDirector, rankOf } = await import(s_('party/director.js'));
const { solve, isFiller } = await import(s_('party/shots.js'));
const { createRig } = await import(s_('game/director-rig.js'));
const { TELL_FOR_STATE } = { TELL_FOR_STATE: { ALERT:'hunter_alert', STALK:'hunter_alert', ATTACK:'grab' } };

function episode({ wing='ballroom', seed=7, cams=3, worldSeed=7, policy }) {
  let s=(seed>>>0)||1; const rng=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
  const scene=new THREE.Scene();
  const field=new LimbField(scene,{rng,floorY:room.floorY,bounds:room.bounds});
  const player=new Player({scene,world:room,field,rng,id:'runner',avatar:null});
  player.pos.copy(room.spawn.player[0]); player.facing=Math.PI;
  const terminal=room.anchor(EXP.TERMINAL_AT[wing]);
  const body={root:player.root,rig:player.rig,height:player.height,radius:player.radius,get noise(){return player.noise;}};
  const noise=new NoiseBus();
  const hunter=new HunterAI({room,scene:null,rng,position:room.spawn.hunter.clone(),noise,bangPolicy:'auto'});
  hunter.setTargets([body]);
  const camera=new THREE.PerspectiveCamera(60,16/9,0.1,200);
  const subjects=()=>({ runner:{x:player.pos.x,y:player.pos.y,z:player.pos.z,yaw:player.facing,eyeHeight:player.eyeHeight},
    hunter:{x:hunter.root.position.x,y:hunter.root.position.y,z:hunter.root.position.z,yaw:0,eyeHeight:hunter.height*0.8} });
  const rig=createRig({camera,room,worldSeed,subjects,unlocked:()=>cams});
  let director=createDirector({world:{}});
  const worldNow=()=>{ const sites=rig.probe.sites(); const rp=rig.probe.pose('runner'),hp=rig.probe.pose('hunter');
    const at=(p)=>({x:p.x,y:p.y+1.0,z:p.z});
    return { subjectInStaticFrustum: !!rp&&sites.some(x=>rig.probe.sees(x,at(rp))),
      hunterInStaticFrustum: !!hp&&sites.some(x=>rig.probe.sees(x,at(hp))),
      subjectWorking:false, cutawayBudget:Math.min(3,Math.ceil(cams/2)), concurrentRank2Rooms:1 }; };
  const feed=(kind,subjectId,t)=>director.feed({kind,subjectId,t,camerasUnlocked:cams,world:worldNow()});
  let outcome=null, simT=0; hunter.onKill=()=>{ if(!outcome) outcome='taken'; };
  hunter.onCommit=()=>feed('hunter_commit','runner',simT);
  hunter.onDoor=()=>feed('progress','runner',simT);
  hunter.onBang=(b)=>feed(b?.through?'channel_open':'blow','runner',simT);
  hunter.onStage=()=>feed('progress','runner',simT);
  const DT=1/60; let clock=90, lastState=null, lastRoom=null;
  const air={}; let frames=0, nulls=0;
  const roomGate=(()=>{let cand=null,since=0,held=null;return(r,t)=>{if(r===held||r==null){cand=null;return null;}if(r!==cand){cand=r;since=t;return null;}if(t-since<0.35)return null;held=r;cand=null;return r;};})();
  const rateGate=(()=>{let last=-Infinity;return(t,open)=>{if(!open)return false;if(t-last<1.2)return false;last=t;return true;};})();
  for(let i=0;i<90/DT && !outcome;i++){
    simT=i*DT; clock=Math.max(0,clock-DT);
    const hops=room.pathPortals(player.pos,terminal,0.6,1.9); const h=hops[0]; const c=h&&h.centre;
    let leg;
    if(c){ const n=h.normal||{x:0,z:1}; const here=room.spaceAt(player.pos)?.id??null; const far=h.a===here?h.b:h.a;
      const fs=room.spaces.find(x=>x.id===far); const fc=fs?{x:(fs.x0+fs.x1)/2,z:(fs.z0+fs.z1)/2}:terminal;
      const side=Math.sign((fc.x-c.x)*n.x+(fc.z-c.z)*n.z)||1; leg={x:c.x+n.x*side*1.5,z:c.z+n.z*side*1.5}; }
    else leg={x:terminal.x,z:terminal.z};
    const heading=Math.atan2(leg.x-player.pos.x,leg.z-player.pos.z);
    const d=Math.hypot(terminal.x-player.pos.x,terminal.z-player.pos.z);
    const det=policy?policy({d,t:simT}):(d>9?3:d>3.5?2:d>EXP.REACH?1:0);
    player.aimYaw=heading;
    player.update(DT,simT,{...detentInput(det),aimYaw:heading,aimPitch:0}); room.update(DT);
    if(player.noise>0) noise.emit(player.pos,player.noise,'move');
    noise.update(DT); hunter.update(DT,simT);
    const here=room.spaceAt(player.pos)?.id??null; const arrived=roomGate(here,simT);
    if(arrived){ lastRoom=arrived; feed('place','runner',simT); }
    if(rateGate(simT,player.noise>0.55)) feed('noise','runner',simT);
    const hs=hunter.state;
    if(hs!==lastState){ lastState=hs; const k=TELL_FOR_STATE[hs]; if(k) feed(k,'runner',simT); }
    director.tick(simT);
    let cur=director.current(); let shot=cur?solve(cur.shotId,{subjectId:cur.subjectId,probe:rig.probe}):null;
    if(cur&&!shot){ director.refuse(simT); cur=director.current(); shot=cur?solve(cur.shotId,{subjectId:cur.subjectId,probe:rig.probe}):null;
      if(!shot) shot=solve('BODYCAM',{subjectId:'runner',probe:rig.probe}); }
    frames++;
    if(shot){ air[shot.shotId]=(air[shot.shotId]||0)+1; } else { nulls++; }
    const reach=Math.hypot(player.pos.x-terminal.x,player.pos.z-terminal.z);
    if(!outcome&&reach<EXP.REACH) outcome='lit'; else if(!outcome&&clock<=0) outcome='held';
  }
  return { outcome, t:+simT.toFixed(2), frames, nulls, air, cuts: director.cuts().length };
}
const CONST = (n) => () => n;
for (const [wing, pol, name] of [['ballroom',null,'ladder'],['gallery',null,'ladder'],['ballroom',CONST(1),'CREEP'],['study_e',CONST(2),'WALK']]) {
  for (const cams of [1,3,6]) {
    const r = episode({ wing, cams, policy: pol });
    const tot = r.frames;
    const pct = Object.entries(r.air).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k} ${(100*v/tot).toFixed(0)}%`).join('  ');
    const nondriv = ['STING','REACTION','CONFESSIONAL','SPONSOR','STATIC','SPLIT'].reduce((a,k)=>a+(r.air[k]||0),0);
    console.log(`${wing.padEnd(9)} ${name.padEnd(7)} cams=${cams}  ${String(r.outcome).padEnd(5)} ${String(r.t).padStart(6)}s  cuts=${String(r.cuts).padStart(3)}  NOT-DRIVABLE ${(100*nondriv/tot).toFixed(0)}%  | ${pct}${r.nulls?`  NOSHOT ${(100*r.nulls/tot).toFixed(0)}%`:''}`);
  }
}
