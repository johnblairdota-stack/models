/**
 * THROWAWAY PROBE — the party expedition, driven headlessly with the REAL Player, the REAL
 * HunterAI and the REAL shipped house. Replicates views/expedition.js's loop.
 *   node harness/evidence/_mc_run.mjs solo     the shipped solo director, per wing, no hunter
 *   node harness/evidence/_mc_run.mjs detent   fixed detent per wing, no hunter
 *   node harness/evidence/_mc_run.mjs hunter   full expedition with the hunter, seeds x policies
 */
const SRC = new URL('../../src/', new URL('.', import.meta.url));
const s_ = (p) => new URL(p, SRC).href;
globalThis.location = { search: '' };
globalThis.document = { createElementNS: () => ({ set src(_v) {}, get src(){return '';}, addEventListener(){}, removeEventListener(){}, style:{} }), createElement: () => ({ style:{}, getContext: () => null }) };
const realWarn = console.warn, realErr = console.error; console.warn = () => {}; console.error = () => {};
const { initBaker } = await import(s_('materials/baker.js'));
initBaker({ getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {}, readRenderTargetPixels: (a,b,c,d,e,buf)=>{buf[0]=200;buf[1]=200;buf[2]=200;if(buf.length>3)buf[3]=255;} });
const THREE = await import('three');
const RM = await import(s_('game/room.js'));
const { HunterAI } = await import(s_('game/hunter-ai.js'));
const { NoiseBus } = await import(s_('game/noise.js'));
const { LimbField } = await import(s_('game/limbs.js'));
const { Player } = await import(s_('game/player.js'));
const { MOVE, HUNTER_SENSE } = await import(s_('game/rules.js'));
const { DETENT } = await import(s_('party/darkrun.js'));
const room = await RM.buildTestRoom({ work: (p) => p }, {});
console.warn = realWarn; console.error = realErr;

const TERMINAL_AT = { ballroom:'ballroom.centre', gallery:'gallery.east', study_w:'study_w.north', study_e:'study_e.north', service:'service.mid', chapel:'chapel.centre' };
const WINGS = Object.keys(TERMINAL_AT);
const TERMINAL_REACH = 2.2, EXPEDITION_SECONDS = 90, DT = 1/60;
const lcg = (seed) => { let x=(seed*2654435761)>>>0; return () => { x=(x*1664525+1013904223)>>>0; return x/4294967296; }; };

/** expedition.js's detentInput(), verbatim. */
function detentInput(detent) {
  const d = DETENT[detent];
  if (!d || d.speed <= 0) return { move: { x: 0, y: 0 }, run: false };
  const top = d.speed > MOVE.walk ? MOVE.run : MOVE.walk;
  return { move: { x: 0, y: Math.min(1, d.speed / top) }, run: d.speed > MOVE.walk };
}

function makePlayer(seed) {
  const scene = new THREE.Scene();
  const rng = lcg(seed);
  const field = new LimbField(scene, { rng, floorY: room.floorY, bounds: room.bounds });
  const player = new Player({ scene, world: room, field, rng, id: 'runner', avatar: null });
  player.pos.copy(room.spawn.player[0]);
  player.facing = Math.PI;
  return { player, scene, rng };
}

/** expedition.js's solo waypoint logic, verbatim. */
function steer(player, terminal) {
  const hops = room.pathPortals(player.pos, terminal, 0.6, 1.9);
  const h = hops[0];
  const c = h && h.centre;
  if (c && Number.isFinite(c.x) && Number.isFinite(c.z)) {
    const n = h.normal || { x: 0, z: 1 };
    const side = Math.sign((player.pos.x - c.x) * n.x + (player.pos.z - c.z) * n.z) || 1;
    return { x: c.x - n.x * side * 1.5, z: c.z - n.z * side * 1.5 };
  }
  return { x: terminal.x, z: terminal.z };
}

/**
 * One expedition. policy: 'solo' (shipped distance ladder) or a fixed detent 0..3.
 * hunter: boolean. Returns the trace summary.
 */
function run({ wing, seed = 1, policy = 'solo', withHunter = false, stage = 1, maxSeconds = EXPEDITION_SECONDS }) {
  const { player, rng } = makePlayer(seed);
  const terminal = room.anchor(TERMINAL_AT[wing]).clone();
  const noise = new NoiseBus();
  let hunter = null, bangs = 0, through = 0, doors = 0, stages = 0, kills = 0;
  if (withHunter) {
    hunter = new HunterAI({ room, scene: null, rng, position: room.spawn.hunter.clone(), noise, bangPolicy: 'auto', stage });
    hunter.radius = 0.30 + stage * 0.12;
    hunter.setTargets([{ root: player.root, rig: player.rig, height: player.height, radius: player.radius, get noise(){ return player.noise; } }]);
    hunter.onBang = ({ through: th }) => { bangs++; if (th) through++; };
    hunter.onDoor = () => { doors++; };
    hunter.onStage = () => { stages++; };
    hunter.onKill = () => { kills++; };
  }
  let outcome = null, t = 0, dist = 0, noiseSum = 0, awareSecs = 0, seenSecs = 0, detentTime = [0,0,0,0];
  let minContact = Infinity;
  const prev = new THREE.Vector3();
  for (let i = 0; i * DT < maxSeconds; i++) {
    t = i * DT;
    const leg = steer(player, terminal);
    const heading = Math.atan2(leg.x - player.pos.x, leg.z - player.pos.z);
    const d = Math.hypot(terminal.x - player.pos.x, terminal.z - player.pos.z);
    const detent = policy === 'solo' ? (d > 9 ? 3 : d > 3.5 ? 2 : d > TERMINAL_REACH ? 1 : 0) : policy;
    detentTime[detent] += DT;
    prev.copy(player.pos);
    player.aimYaw = heading;
    player.update(DT, t, { ...detentInput(detent), aimYaw: heading, aimPitch: 0 });
    room.update(DT);
    dist += Math.hypot(player.pos.x - prev.x, player.pos.z - prev.z);
    noiseSum += player.noise * DT;
    if (player.noise > 0) noise.emit(player.pos, player.noise, 'move');
    noise.update(DT);
    if (hunter) {
      hunter.update(DT, t);
      if (hunter.awareness >= HUNTER_SENSE.alertAt) awareSecs += DT;
      if (hunter.sawThisFrame) seenSecs += DT;
      const c = Math.hypot(player.pos.x - hunter.root.position.x, player.pos.z - hunter.root.position.z);
      if (c < minContact) minContact = c;
      if (kills > 0) { outcome = 'taken'; break; }
    }
    if (d < TERMINAL_REACH) { outcome = 'lit'; break; }
  }
  if (!outcome) outcome = 'held';
  const res = { wing, seed, policy, outcome, t, dist, meanNoise: noiseSum / Math.max(t, DT), bangs, through, doors, stages, kills, awareSecs, seenSecs, minContact, detentTime, endStage: hunter?.stage ?? null, limbsLost: player.limbsLost };
  hunter?.dispose();
  return res;
}

const q = (a, p) => { const b=[...a].sort((x,y)=>x-y); return b[Math.min(b.length-1, Math.floor(p*b.length))]; };
const mean = (a) => a.length ? a.reduce((x,y)=>x+y,0)/a.length : NaN;
const mode = process.argv[2] ?? 'solo';

if (mode === 'solo') {
  console.log('=== SHIPPED SOLO DIRECTOR · no hunter · real Player · 90 s cap ===');
  console.log(' wing       outcome   t(s)    path(m)  meanNoise  detent seconds STILL/CREEP/WALK/RUN');
  const ts = [];
  for (const wing of WINGS) {
    const r = run({ wing });
    if (r.outcome === 'lit') ts.push(r.t);
    console.log(` ${wing.padEnd(9)}  ${r.outcome.padEnd(6)}  ${r.t.toFixed(1).padStart(5)}   ${r.dist.toFixed(1).padStart(6)}   ${r.meanNoise.toFixed(2)}       ${r.detentTime.map(x=>x.toFixed(1)).join(' / ')}`);
  }
  console.log(` completed ${ts.length}/6 wings · median t ${ts.length?q(ts,0.5).toFixed(1):'-'} s · mean ${ts.length?mean(ts).toFixed(1):'-'} s`);
  console.log('\n=== same, but 300 s cap so slow/failed wings show their real time ===');
  for (const wing of WINGS) {
    const r = run({ wing, maxSeconds: 300 });
    console.log(` ${wing.padEnd(9)}  ${r.outcome.padEnd(6)}  ${r.t.toFixed(1).padStart(6)} s  path ${r.dist.toFixed(1)} m`);
  }
}

if (mode === 'detent') {
  console.log('=== FIXED DETENT · no hunter · 300 s cap · time to light the terminal ===');
  console.log(' wing       CREEP(0.9)     WALK(2.55)     RUN(5.20)     STILL');
  for (const wing of WINGS) {
    const row = [1,2,3,0].map((p) => { const r = run({ wing, policy: p, maxSeconds: 300 }); return r.outcome === 'lit' ? `${r.t.toFixed(1)}s` : `${r.outcome}`; });
    console.log(` ${wing.padEnd(9)}  ${row[0].padEnd(14)} ${row[1].padEnd(14)} ${row[2].padEnd(13)} ${row[3]}`);
  }
  console.log('\n=== within the shipped 90 s clock: which detents finish? ===');
  console.log(' wing       CREEP    WALK     RUN');
  for (const wing of WINGS) {
    const row = [1,2,3].map((p) => { const r = run({ wing, policy: p }); return r.outcome === 'lit' ? `${r.t.toFixed(1)}s` : 'FAIL'; });
    console.log(` ${wing.padEnd(9)}  ${row[0].padEnd(8)} ${row[1].padEnd(8)} ${row[2]}`);
  }
}

if (mode === 'hunter') {
  const SEEDS = [1,2,3,4,5,6,7,8];
  console.log('=== FULL EXPEDITION · real HunterAI · shipped house · 8 seeds x 3 stages x 4 wings ===\n');
  const POL = { 'solo ladder': 'solo', 'CREEP always': 1, 'WALK always': 2, 'RUN always': 3 };
  const REACHABLE = ['gallery','ballroom','study_w','study_e','service'];
  console.log(' policy        runs  lit%   taken%  held%  median t(lit)  median aware s  hunter bangs  breaches  growth  median minDist');
  for (const [name, policy] of Object.entries(POL)) {
    const rr = [];
    for (const stage of [1,2,3]) for (const seed of SEEDS) for (const wing of REACHABLE) rr.push(run({ wing, seed, policy, withHunter: true, stage }));
    const lit = rr.filter(r=>r.outcome==='lit');
    const pc = (n) => `${(n/rr.length*100).toFixed(0)}%`;
    console.log(` ${name.padEnd(13)} ${String(rr.length).padStart(4)}  ${pc(lit.length).padStart(5)}  ${pc(rr.filter(r=>r.outcome==='taken').length).padStart(5)}  ${pc(rr.filter(r=>r.outcome==='held').length).padStart(5)}  ${(lit.length?q(lit.map(r=>r.t),0.5).toFixed(1)+' s':'-').padStart(11)}    ${q(rr.map(r=>r.awareSecs),0.5).toFixed(1)} s        ${rr.reduce((a,r)=>a+r.bangs,0)}          ${rr.reduce((a,r)=>a+r.through,0)}        ${rr.reduce((a,r)=>a+r.stages,0)}     ${q(rr.map(r=>r.minContact),0.5).toFixed(1)} m`);
  }
  console.log('\n=== per wing, solo ladder, stage 1 ===');
  for (const wing of REACHABLE) {
    const rr = SEEDS.map(seed => run({ wing, seed, policy: 'solo', withHunter: true, stage: 1 }));
    console.log(` ${wing.padEnd(9)} outcomes ${rr.map(r=>r.outcome[0]).join('')}  median t ${q(rr.map(r=>r.t),0.5).toFixed(1)} s  bangs ${rr.reduce((a,r)=>a+r.bangs,0)}  breaches ${rr.reduce((a,r)=>a+r.through,0)}`);
  }
  console.log('\n=== chapel: the wing with no door ===');
  for (const stage of [1,2,3]) {
    const rr = SEEDS.map(seed => run({ wing: 'chapel', seed, policy: 'solo', withHunter: true, stage }));
    console.log(` stage ${stage}: outcomes ${rr.map(r=>r.outcome).join(',')}  median t ${q(rr.map(r=>r.t),0.5).toFixed(1)} s`);
  }
}
