#!/usr/bin/env node
/**
 * _bcrit_watch — WHAT A PERSON IN THE ROOM SEES, SECOND BY SECOND, and what the proposed
 * `world`-from-`rig.probe` fix changes. Throwaway critic probe; reads only.
 *
 *   ARM A  as shipped: `views/expedition.js:335` feeds `world: {}`
 *   ARM B  the fix:    world populated from `rig.probe` every event
 */
const SRC = new URL('../../src/', new URL('.', import.meta.url));
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
const lcg = (seed) => { let x=(seed*2654435761)>>>0; return () => { x=(x*1664525+1013904223)>>>0; return x/4294967296; }; };

function run({ seed = 1, stage = 2, cams = 3, fix = false, trace = null } = {}) {
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
    if (!fix) return {};
    const sites = rig.probe.sites();
    const rp = rig.probe.pose('runner'), hp = rig.probe.pose('hunter');
    return {
      subjectInStaticFrustum: !!rp && sites.some((s) => rig.probe.sees(s, { x: rp.x, y: rp.y+1.0, z: rp.z })),
      hunterInStaticFrustum:  !!hp && sites.some((s) => rig.probe.sees(s, { x: hp.x, y: hp.y+1.0, z: hp.z })),
      subjectWorking: false, cutawayBudget: Math.min(3, Math.ceil(cams/2)), concurrentRank2Rooms: 1,
    };
  };
  const feed = (kind, subjectId, t) => director.feed({ kind, subjectId, t, camerasUnlocked: cams, world: worldNow() });

  let heading = Math.PI, lastRoom = null, lastState = null;
  const _p = new THREE.Vector3();
  const onAir = {}, subjAir = {}, ev = {};
  let unsolvable = 0, frames = 0, hunterCloseFrames = 0, sumHunterDist = 0, hunterShots = 0;
  let visibleChanges = 0, subjectFlips = 0, prevKey = null, lastChangeT = 0; const holds = [];
  const timeline = [];
  let lastLine = null;

  for (let i=0; i*DT < 90; i++) {
    const t = i*DT;
    const dHunt = Math.hypot(root.position.x-hunter.root.position.x, root.position.z-hunter.root.position.z);
    if (dHunt < 12 && hunter.awareness >= HUNTER_SENSE.alertAt && t > panicUntil) {
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
    if (here && here !== lastRoom) { lastRoom = here; feed('place','runner',t); ev.place=(ev.place??0)+1; }
    if (runner.noise > 0.55) { feed('noise','runner',t); ev.noise=(ev.noise??0)+1; }
    const hs = hunter.state;
    if (hs !== lastState) {
      lastState = hs;
      if (hs==='ALERT'||hs==='SEARCH') { feed('hunter_alert','hunter',t); ev.hunter_alert=(ev.hunter_alert??0)+1; }
      if (hs==='PURSUE'||hs==='HUNT'||hs==='STALK') { feed('hunter_commit','hunter',t); ev.hunter_commit=(ev.hunter_commit??0)+1; }
      if (hs==='ATTACK') { feed('grab','runner',t); ev.grab=(ev.grab??0)+1; }
      ev[`state:${hs}`] = (ev[`state:${hs}`]??0)+1;
    }
    director.tick(t);

    const cur = director.current();
    const shot = cur ? solve(cur.shotId, { subjectId: cur.subjectId, probe: rig.probe }) : null;
    frames++;
    if (cur) {
      onAir[cur.shotId] = (onAir[cur.shotId]??0)+DT;
      subjAir[cur.subjectId] = (subjAir[cur.subjectId]??0)+DT;
      if (!shot) unsolvable++;
      if (shot && shot.kind === 'live' && shot.eye && shot.at) {
        const d = Math.hypot(shot.eye.x-shot.at.x, shot.eye.y-shot.at.y, shot.eye.z-shot.at.z);
        if (cur.subjectId === 'hunter') { sumHunterDist += d; hunterShots++; if (d < 6) hunterCloseFrames++; }
      }
    }
    if (dTerm < 2.2) { wingIdx = (wingIdx+1) % order.length; terminal = room.anchor(TERMINAL_AT[order[wingIdx]]).clone(); }
    if (cur) {
      const key = `${cur.shotId}/${cur.subjectId}`;
      if (prevKey !== null && key !== prevKey) { visibleChanges++; if (key.split('/')[1] !== prevKey.split('/')[1]) subjectFlips++; holds.push(t - lastChangeT); lastChangeT = t; }
      prevKey = key;
    }
    if (trace && t >= trace[0] && t <= trace[1]) {
      const line = cur ? `${cur.shotId}/${cur.subjectId}` : 'none';
      const bug = shot ? shot.bug : (cur ? 'FROZEN (solve returned null)' : '—');
      if (line !== lastLine) { timeline.push({ t, line, bug, hs, room: here }); lastLine = line; }
    }
  }
  director.end(90);
  hunter.dispose();
  holds.push(90 - lastChangeT);
  const sortedH = holds.slice().sort((a,b)=>a-b);
  return { cadence: director.cadence(), onAir, subjAir, ev, unsolvable, frames, timeline, visibleChanges, subjectFlips,
           visMedian: sortedH[Math.floor(sortedH.length/2)] ?? 90, visMax: Math.max(...holds),
           hunterMeanDist: hunterShots ? sumHunterDist/hunterShots : 0, hunterCloseFrac: hunterShots ? hunterCloseFrames/hunterShots : 0 };
}

// ---------------------------------------------------------------- 1. the transcript
const A = run({ seed: 2, stage: 2, fix: false, trace: [0, 90] });
console.log('=== ARM A (as shipped) · every change of image across the full 90 s (seed 2) ===');
let prev = null;
for (const r of A.timeline) {
  const dur = prev == null ? 0 : r.t - prev;
  if (prev != null) console.log(`        (held ${dur.toFixed(2)}s)`);
  console.log(` t=${r.t.toFixed(2).padStart(6)}  ${r.line.padEnd(20)} bug:"${r.bug}"  hunterState=${r.hs}  runnerRoom=${r.room}`);
  prev = r.t;
}
console.log(`\n  visible frame changes in that 30 s window: ${A.timeline.length}`);
console.log(`\n=== recorded cuts vs cuts a person can SEE (90 s, arm A) ===`);
for (const seed of [1,2,3,5]) {
  const r = run({ seed, stage:2, fix:false });
  console.log(`  seed ${seed}: director.cuts() = ${String(r.cadence.n).padStart(3)}  (${r.cadence.cutsPerMin.toFixed(1)}/min)   changes visible on screen = ${String(r.visibleChanges).padStart(3)}  (${(r.visibleChanges/1.5).toFixed(1)}/min)   of which subject flips runner<->hunter = ${r.subjectFlips}`);
}

// ---------------------------------------------------------------- 2. arms
console.log('\n=== ARM A vs ARM B (world populated from rig.probe) ===');
const rows = [];
for (const fix of [false, true]) for (const seed of [1,2,3,5,6,7]) rows.push({ fix, seed, r: run({ seed, stage:2, fix }) });
console.log(' arm  seed  cuts/min  median   BODYCAM  WORK  STATIC  STING  SPLIT  REACTION  CONFESS  SPONSOR   air:hunter  air:runner  frozen-frames');
for (const x of rows) {
  const o = x.r.onAir, c = x.r.cadence;
  const g = (k) => (o[k]??0).toFixed(1).padStart(6);
  console.log(`  ${x.fix?'B':'A'}   ${String(x.seed).padStart(3)}  ${c.cutsPerMin.toFixed(1).padStart(7)}  ${(c.median??0).toFixed(2).padStart(5)}  ${g('BODYCAM')} ${g('WORK')} ${g('STATIC')} ${g('STING')} ${g('SPLIT')} ${g('REACTION')} ${g('CONFESSIONAL')} ${g('SPONSOR')}   ${(x.r.subjAir.hunter??0).toFixed(1).padStart(8)}s ${(x.r.subjAir.runner??0).toFixed(1).padStart(10)}s   ${String(x.r.unsolvable).padStart(6)} (${(100*x.r.unsolvable/x.r.frames).toFixed(1)}%)`);
}
const mean = (a) => a.reduce((x,y)=>x+y,0)/a.length;
for (const fix of [false, true]) {
  const g = rows.filter((x)=>x.fix===fix);
  console.log(`\n ARM ${fix?'B':'A'}: cuts/min mean ${mean(g.map(x=>x.r.cadence.cutsPerMin)).toFixed(1)} · median shot ${mean(g.map(x=>x.r.cadence.median??0)).toFixed(2)}s · hunter airtime ${(100*mean(g.map(x=>(x.r.subjAir.hunter??0)/90))).toFixed(0)}% · frozen ${(100*mean(g.map(x=>x.r.unsolvable/x.r.frames))).toFixed(1)}% of frames`);
  console.log(`        camera-to-hunter distance when the hunter is the subject: mean ${mean(g.map(x=>x.r.hunterMeanDist)).toFixed(2)} m · under 6 m ${(100*mean(g.map(x=>x.r.hunterCloseFrac))).toFixed(0)}% of those frames  (shots.js STING_MIN_RANGE = 6.0)`);
}
console.log('\n=== what the SCREEN does, both arms (the thing director.cadence() cannot see) ===');
console.log(' arm  seed   recorded cuts/min   visible changes/min   median visible hold   longest visible hold');
for (const fix of [false, true]) for (const seed of [1,2,3,5]) {
  const r = run({ seed, stage:2, fix });
  console.log(`  ${fix?'B':'A'}   ${String(seed).padStart(3)}   ${r.cadence.cutsPerMin.toFixed(1).padStart(15)}   ${(r.visibleChanges/1.5).toFixed(1).padStart(19)}   ${r.visMedian.toFixed(2).padStart(19)}s   ${r.visMax.toFixed(2).padStart(19)}s`);
}
console.log('  (§1.3 wants 12-22 cuts/min, median 2.2-3.5 s, and MAX_HOLD 6.0 s: "a locked wide is unwatchable")');

console.log('\n=== hunter state census (arm A, seed 2) ===');
console.log(Object.entries(A.ev).filter(([k])=>k.startsWith('state:')).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}x${v}`).join('  '));
