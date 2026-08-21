#!/usr/bin/env node
/**
 * _bcrit2_after — THE SAME NINETY SECONDS, AFTER T1/T2. Throwaway critic probe; reads only.
 * Same house, same seeds and the same reconstruction as `_bcrit_watch.mjs`, but feeding the bus
 * the way `views/expedition.js` feeds it now: the RUNNER is the subject of a hunter event, the
 * availability world comes from `rig.probe`, and cadence is read off the visible-cut record.
 */
const SRC = new URL('../src/', new URL('.', import.meta.url));
const s_ = (p) => new URL(p, SRC).href;
globalThis.location = { search: '' };
globalThis.document = { createElementNS: () => ({ set src(_v) {}, addEventListener() {}, removeEventListener() {}, style: {} }), createElement: () => ({ style: {}, getContext: () => null }) };
const realWarn = console.warn; console.warn = () => {};
const { initBaker } = await import(s_('materials/baker.js'));
initBaker({ getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {}, readRenderTargetPixels: (a,b,c,d,e,buf) => { buf[0]=200;buf[1]=200;buf[2]=200; if(buf.length>3) buf[3]=255; } });
const THREE = await import('three');
const RM = await import(s_('game/room.js'));
const { HunterAI } = await import(s_('game/hunter-ai.js'));
const { NoiseBus } = await import(s_('game/noise.js'));
const { MOVE, PASS_H, STEP_H, HUNTER_SENSE } = await import(s_('game/rules.js'));
const { DETENT } = await import(s_('party/darkrun.js'));
const { createDirector } = await import(s_('party/director.js'));
const { solve } = await import(s_('party/shots.js'));
const { createRig } = await import(s_('game/director-rig.js'));
const room = await RM.buildTestRoom({ work: (p) => p }, {});
console.warn = realWarn;

const DT = 1/60;
const TERMINAL_AT = { ballroom:'ballroom.centre', gallery:'gallery.east', study_w:'study_w.north', study_e:'study_e.north', service:'service.mid', chapel:'chapel.centre' };
const TELL_FOR_STATE = { ALERT:'hunter_alert', STALK:'hunter_alert', PURSUE:'hunter_commit', HUNT:'hunter_commit', ATTACK:'grab' };
const lcg = (seed) => { let x=(seed*2654435761)>>>0; return () => { x=(x*1664525+1013904223)>>>0; return x/4294967296; }; };

function run({ seed = 1, stage = 2, cams = 3, old = false } = {}) {
  const rng = lcg(seed);
  const noise = new NoiseBus();
  const hunter = new HunterAI({ room, scene: null, rng, position: room.spawn.hunter.clone(), noise, bangPolicy: 'auto', stage });
  hunter.radius = 0.30 + stage*0.12;
  const root = new THREE.Object3D(); root.position.copy(room.spawn.player[0]);
  const runner = { root, rig: { caps:{downed:false}, occupant:()=> 'empty', detach:()=>null }, height:1.7, radius:0.34, noise:0 };
  hunter.setTargets([runner]);
  const WINGS = ['gallery','ballroom','study_e','chapel','service','study_w'];
  const order = WINGS.slice();
  for (let i=order.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
  let wingIdx = 0, terminal = room.anchor(TERMINAL_AT[order[0]]).clone();
  let panicUntil = -1;

  const camera = { position:{ set(){} }, lookAt(){}, fov:0, updateProjectionMatrix(){} };
  const rig = createRig({ camera, room, worldSeed: 7,
    subjects: () => ({
      runner: { x: root.position.x, y: root.position.y, z: root.position.z, yaw: heading, eyeHeight: 1.62 },
      hunter: { x: hunter.root.position.x, y: hunter.root.position.y, z: hunter.root.position.z, yaw: 0, eyeHeight: hunter.height*0.8 },
    }),
    unlocked: () => cams });

  const director = createDirector({ world: {} });
  const worldNow = () => {
    const sites = rig.probe.sites();
    const rp = rig.probe.pose('runner'), hp = rig.probe.pose('hunter');
    const at = (p) => ({ x: p.x, y: p.y+1.0, z: p.z });
    return {
      subjectInStaticFrustum: !!rp && sites.some((s) => rig.probe.sees(s, at(rp))),
      hunterInStaticFrustum:  !!hp && sites.some((s) => rig.probe.sees(s, at(hp))),
      subjectWorking: false, cutawayBudget: Math.min(3, Math.ceil(cams/2)), concurrentRank2Rooms: 1,
    };
  };
  const feed = (kind, subjectId, t) => director.feed({ kind, subjectId, t, camerasUnlocked: cams, world: worldNow() });

  let heading = Math.PI, lastRoom = null, lastState = null;
  const _p = new THREE.Vector3();
  const onAir = {}, subjAir = {};
  let unsolvable = 0, frames = 0, hunterCloseFrames = 0, sumHunterDist = 0, hunterShots = 0;

  for (let i=0; i*DT < 90; i++) {
    const t = i*DT;
    if (Math.hypot(root.position.x-hunter.root.position.x, root.position.z-hunter.root.position.z) < 12
        && hunter.awareness >= HUNTER_SENSE.alertAt && t > panicUntil) {
      panicUntil = t + 6;
      let best=null,bestD=-1;
      for (const w of WINGS){const a=room.anchor(TERMINAL_AT[w]);const d=Math.hypot(a.x-hunter.root.position.x,a.z-hunter.root.position.z);if(d>bestD){bestD=d;best=w;}}
      terminal = room.anchor(TERMINAL_AT[best]).clone();
    }
    const panicking = t <= panicUntil;
    const hops = room.pathPortals(root.position, terminal, 0.6, 1.9);
    const h0 = hops[0], c = h0 && h0.centre;
    let leg;
    if (c && Number.isFinite(c.x)) { const n = h0.normal || {x:0,z:1}; const side = Math.sign((root.position.x-c.x)*n.x + (root.position.z-c.z)*n.z) || 1; leg = { x: c.x-n.x*side*1.5, z: c.z-n.z*side*1.5 }; }
    else leg = { x: terminal.x, z: terminal.z };
    const dTerm = Math.hypot(terminal.x-root.position.x, terminal.z-root.position.z);
    const want = DETENT[panicking?3:dTerm>9?3:dTerm>3.5?2:dTerm>2.2?1:0].speed;
    const dx = leg.x-root.position.x, dz = leg.z-root.position.z, dl = Math.hypot(dx,dz)||1;
    heading = Math.atan2(dx, dz);
    const before = root.position.clone();
    _p.set(root.position.x + (dx/dl)*want*DT, 0, root.position.z + (dz/dl)*want*DT);
    root.position.copy(room.collide(_p, runner.radius, PASS_H.robot, STEP_H.robot));
    root.position.y = room.floorY;
    runner.noise = Math.min(1, (before.distanceTo(root.position)/DT)/MOVE.run);
    if (runner.noise > 0) noise.emit(root.position, runner.noise, 'move');
    noise.update(DT); hunter.update(DT, t);

    const here = room.spaceAt(root.position)?.id ?? null;
    if (here && here !== lastRoom) { lastRoom = here; feed('place','runner',t); }
    if (runner.noise > 0.55) feed('noise','runner',t);
    const hs = hunter.state;
    if (hs !== lastState) {
      lastState = hs;
      if (old) {
        if (hs==='ALERT'||hs==='SEARCH') feed('hunter_alert','hunter',t);
        if (hs==='PURSUE'||hs==='HUNT'||hs==='STALK') feed('hunter_commit','hunter',t);
        if (hs==='ATTACK') feed('grab','runner',t);
      } else {
        const k = TELL_FOR_STATE[hs];
        if (k) feed(k, 'runner', t);
      }
    }
    director.tick(t);

    let cur = director.current();
    let shot = cur ? solve(cur.shotId, { subjectId: cur.subjectId, probe: rig.probe }) : null;
    if (cur && !shot && !old) {
      director.refuse(t);
      cur = director.current();
      shot = cur ? solve(cur.shotId, { subjectId: cur.subjectId, probe: rig.probe }) : null;
      if (!shot) shot = solve('BODYCAM', { subjectId: 'runner', probe: rig.probe });
    }
    frames++;
    if (cur) {
      onAir[cur.shotId] = (onAir[cur.shotId]??0)+DT;
      subjAir[cur.subjectId] = (subjAir[cur.subjectId]??0)+DT;
      if (!shot) unsolvable++;
      if (shot && shot.kind === 'live' && shot.eye && shot.at) {
        const d = Math.hypot(shot.eye.x-shot.at.x, shot.eye.y-shot.at.y, shot.eye.z-shot.at.z);
        if (cur.subjectId === 'hunter' || cur.shotId === 'STING') { sumHunterDist += d; hunterShots++; if (d < 6) hunterCloseFrames++; }
      }
    }
    if (dTerm < 2.2) { wingIdx = (wingIdx+1) % order.length; terminal = room.anchor(TERMINAL_AT[order[wingIdx]]).clone(); }
  }
  director.end(90);
  hunter.dispose();
  return { cadence: director.cadence(), onAir, subjAir, unsolvable, frames,
           hunterMeanDist: hunterShots ? sumHunterDist/hunterShots : 0,
           hunterCloseFrac: hunterShots ? hunterCloseFrames/hunterShots : 0, hunterShots };
}

const SEEDS = [1,2,3,5,6,7];
const mean = (a) => a.reduce((x,y)=>x+y,0)/a.length;
for (const old of [true, false]) {
  console.log(`\n=== ${old ? 'BEFORE (hunter as subject, world:{} )' : 'AFTER  (runner as subject, world from rig.probe)'} ===`);
  console.log(' seed  vis-cuts/min  median  longest  takes   BODYCAM  STATIC  STING  REACT  CONFESS  SPONSOR   air:hunter  air:runner  frozen');
  const rows = SEEDS.map((seed) => ({ seed, r: run({ seed, old }) }));
  for (const {seed, r} of rows) {
    const g = (k) => (r.onAir[k]??0).toFixed(1).padStart(6);
    const c = r.cadence;
    console.log(`  ${String(seed).padStart(3)}  ${c.cutsPerMin.toFixed(1).padStart(11)}  ${(c.median??0).toFixed(2).padStart(6)}  ${(c.longestHold??0).toFixed(1).padStart(7)}  ${String(c.takes).padStart(5)}  ${g('BODYCAM')} ${g('STATIC')} ${g('STING')} ${g('REACTION')} ${g('CONFESSIONAL')} ${g('SPONSOR')}   ${(r.subjAir.hunter??0).toFixed(1).padStart(8)}s ${(r.subjAir.runner??0).toFixed(1).padStart(10)}s   ${(100*r.unsolvable/r.frames).toFixed(1)}%`);
  }
  const R = rows.map((x)=>x.r);
  console.log(`  MEAN  visible ${mean(R.map(x=>x.cadence.cutsPerMin)).toFixed(1)}/min · median ${mean(R.map(x=>x.cadence.median??0)).toFixed(2)}s · longest hold ${mean(R.map(x=>x.cadence.longestHold??0)).toFixed(1)}s · runner airtime ${(100*mean(R.map(x=>(x.subjAir.runner??0)/90))).toFixed(0)}% · hunter airtime ${(100*mean(R.map(x=>(x.subjAir.hunter??0)/90))).toFixed(0)}%`);
  console.log(`        camera-to-hunter distance when the Hunter is on screen: mean ${mean(R.map(x=>x.hunterMeanDist)).toFixed(2)} m · under 6 m on ${(100*mean(R.map(x=>x.hunterCloseFrac))).toFixed(0)}% of those frames  (STING_MIN_RANGE 6.0)`);
  console.log('        (§1.3: 12-22 cuts/min, median 2.2-3.5 s, MAX_HOLD 6.0 s)');
}
