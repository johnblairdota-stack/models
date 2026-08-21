#!/usr/bin/env node
/**
 * 📺 **_huntertv — WHAT THE TELEVISION DOES WITH THIS HUNTER OVER NINETY SECONDS.**
 *
 * The same real `HunterAI` + real mansion sim as `_hunterduty.mjs`, with the event feed wired
 * EXACTLY as `views/expedition.js:304-338` wires it, into the real `createDirector()`.
 * Reports the shot mix, the cadence against `rrr-broadcast.md` §1.3 (12-22 cuts/min, median
 * 2.2-3.5 s), and how much of the ninety seconds the Hunter is on a screen at all.
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
const { DETENT, SILENT_SPEED } = await import(s_('party/darkrun.js'));
const { createDirector, poolFor, SHOTS } = await import(s_('party/director.js'));
const room = await RM.buildTestRoom({ work: (p) => p }, {});
console.warn = realWarn;

// ---------------------------------------------------------------- what is even available
console.log('=== the shot pool `expedition.js` can actually reach ===');
console.log('   `expedition.js:304` feeds `world: {}` and `createDirector({world:{}})`, so the');
console.log('   availability predicates in `director.js:65-76` see undefined for every field.');
for (const rank of [1, 2, 3, 4]) {
  const w = { camerasUnlocked: 3, deadAir: 0 };   // exactly what feed() builds
  console.log(`   rank ${rank}: [${poolFor(rank, w).map((s) => s.id).join(', ')}]`);
}
console.log(`   (the library has ${SHOTS.length}: ${SHOTS.map((s) => s.id).join(', ')})`);

// ---------------------------------------------------------------- the ninety seconds
const DT = 1 / 60;
const WINGS = ['gallery', 'ballroom', 'study_e', 'chapel', 'service', 'study_w'];
const TERMINAL_AT = { ballroom: 'ballroom.centre', gallery: 'gallery.east', study_w: 'study_w.north', study_e: 'study_e.north', service: 'service.mid', chapel: 'chapel.centre' };
const lcg = (seed) => { let x = (seed * 2654435761) >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };

function run(seed, stage) {
  const rng = lcg(seed);
  const noise = new NoiseBus();
  const hunter = new HunterAI({ room, scene: null, rng, position: room.spawn.hunter.clone(), noise, bangPolicy: 'auto', stage });
  hunter.radius = 0.30 + stage * 0.12;
  const order = WINGS.slice();
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let wingIdx = 0, terminal = room.anchor(TERMINAL_AT[order[0]]).clone();
  const root = new THREE.Object3D(); root.position.copy(room.spawn.player[0]);
  const runner = { root, rig: { caps: { downed: false }, occupant: () => 'empty', detach: () => null }, height: 1.7, radius: 0.34, noise: 0 };
  hunter.setTargets([runner]);

  const director = createDirector({ world: {} });
  const camerasUnlocked = 3;
  const feed = (kind, subjectId, t) => director.feed({ kind, subjectId, t, camerasUnlocked, world: {} });

  let lastRoom = null, lastState = null, panicUntil = -1;
  const _p = new THREE.Vector3();
  const onAir = {};             // shotId -> seconds actually on screen
  const events = {};
  let hunterOnCam = 0;          // seconds the airing shot's subject is the hunter

  for (let i = 0; i * DT < 90; i++) {
    const t = i * DT;
    const dHunt = Math.hypot(root.position.x - hunter.root.position.x, root.position.z - hunter.root.position.z);
    if (dHunt < 12 && hunter.awareness >= HUNTER_SENSE.alertAt && t > panicUntil) {
      panicUntil = t + 6;
      let best = null, bestD = -1;
      for (const w of WINGS) { const a = room.anchor(TERMINAL_AT[w]); const d = Math.hypot(a.x - hunter.root.position.x, a.z - hunter.root.position.z); if (d > bestD) { bestD = d; best = w; } }
      terminal = room.anchor(TERMINAL_AT[best]).clone();
    }
    const panicking = t <= panicUntil;
    const hops = room.pathPortals(root.position, terminal, 0.6, 1.9);
    const h0 = hops[0]; const c = h0 && h0.centre;
    let leg;
    if (c && Number.isFinite(c.x)) { const n = h0.normal || { x: 0, z: 1 }; const side = Math.sign((root.position.x - c.x) * n.x + (root.position.z - c.z) * n.z) || 1; leg = { x: c.x - n.x * side * 1.5, z: c.z - n.z * side * 1.5 }; }
    else leg = { x: terminal.x, z: terminal.z };
    const dTerm = Math.hypot(terminal.x - root.position.x, terminal.z - root.position.z);
    const want = DETENT[panicking ? 3 : dTerm > 9 ? 3 : dTerm > 3.5 ? 2 : dTerm > 2.2 ? 1 : 0].speed;
    const dx = leg.x - root.position.x, dz = leg.z - root.position.z, dl = Math.hypot(dx, dz) || 1;
    const before = root.position.clone();
    _p.set(root.position.x + (dx / dl) * want * DT, 0, root.position.z + (dz / dl) * want * DT);
    root.position.copy(room.collide(_p, runner.radius, PASS_H.robot, STEP_H.robot));
    root.position.y = room.floorY;
    runner.noise = Math.min(1, (before.distanceTo(root.position) / DT) / MOVE.run);

    if (runner.noise > 0) noise.emit(root.position, runner.noise, 'move');
    noise.update(DT);
    hunter.update(DT, t);

    // ---- `expedition.js:322-338`, verbatim
    const here = room.spaceAt(root.position)?.id ?? null;
    if (here && here !== lastRoom) { lastRoom = here; feed('place', 'runner', t); events.place = (events.place ?? 0) + 1; }
    if (runner.noise > 0.55) { feed('noise', 'runner', t); events.noise = (events.noise ?? 0) + 1; }
    const hs = hunter.state;
    if (hs !== lastState) {
      lastState = hs;
      if (hs === 'ALERT' || hs === 'SEARCH') { feed('hunter_alert', 'hunter', t); events.hunter_alert = (events.hunter_alert ?? 0) + 1; }
      if (hs === 'PURSUE' || hs === 'HUNT' || hs === 'STALK') { feed('hunter_commit', 'hunter', t); events.hunter_commit = (events.hunter_commit ?? 0) + 1; }
      if (hs === 'ATTACK') { feed('grab', 'runner', t); events.grab = (events.grab ?? 0) + 1; }
      if (hs === 'BREACH' || hs === 'BANG' || hs === 'GROW') events[`(silent) ${hs}`] = (events[`(silent) ${hs}`] ?? 0) + 1;
    }
    director.tick(t);
    const cur = director.current();
    if (cur) { onAir[cur.shotId] = (onAir[cur.shotId] ?? 0) + DT; if (cur.subjectId === 'hunter') hunterOnCam += DT; }
    if (dTerm < 2.2) { wingIdx = (wingIdx + 1) % order.length; terminal = room.anchor(TERMINAL_AT[order[wingIdx]]).clone(); }
  }
  director.end(90);
  hunter.dispose();
  return { seed, stage, cadence: director.cadence(), onAir, events, hunterOnCam };
}

const rows = [];
for (const stage of [1, 2, 3]) for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) rows.push(run(seed, stage));

console.log('\n=== cadence over 90 s · §1.3 wants 12-22 cuts/min and a 2.2-3.5 s median ===');
console.log(' stage seed  cuts  cuts/min  median   BODYCAM(s)  REACTION(s)  camera-on-hunter(s)   events');
for (const r of rows) {
  const c = r.cadence;
  const ev = Object.entries(r.events).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}x${v}`).join(' ');
  console.log(`   ${r.stage}    ${String(r.seed).padStart(2)}   ${String(c.n).padStart(3)}   ${c.cutsPerMin.toFixed(1).padStart(6)}   ${(c.median ?? 0).toFixed(2).padStart(5)}   ${(r.onAir.BODYCAM ?? 0).toFixed(1).padStart(6)}      ${(r.onAir.REACTION ?? 0).toFixed(1).padStart(6)}          ${r.hunterOnCam.toFixed(1).padStart(5)}      ${ev}`);
}
const cpm = rows.map((r) => r.cadence.cutsPerMin);
const med = rows.map((r) => r.cadence.median ?? 0);
const react = rows.map((r) => (r.onAir.REACTION ?? 0) / 90);
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`\n  cuts/min: mean ${mean(cpm).toFixed(1)}  min ${Math.min(...cpm).toFixed(1)}  max ${Math.max(...cpm).toFixed(1)}   (§1.3 target 12-22)`);
console.log(`  median shot: mean ${mean(med).toFixed(2)}s  min ${Math.min(...med).toFixed(2)}  max ${Math.max(...med).toFixed(2)}   (§1.3 target 2.2-3.5 s)`);
console.log(`  fraction of the 90 s on a REACTION card ("CIRCLE" plate over a frozen camera): mean ${(mean(react) * 100).toFixed(1)}%`);
