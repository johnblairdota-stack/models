/**
 * _mr2_sim — a faithful headless replay of `views/expedition.js`'s simulation half.
 * Real Player, real room.collide, real HunterAI, real NoiseBus, real steering + detent ladder.
 * Everything the renderer/director/broadcast does is dropped; nothing that moves a body is.
 */
const SRC = new URL('../../src/', new URL('.', import.meta.url));
const s_ = (p) => new URL(p, SRC).href;
globalThis.location = { search: '' };
globalThis.document = {
  createElementNS: () => ({ set src(_v) {}, get src() { return ''; }, addEventListener() {}, removeEventListener() {}, style: {} }),
  createElement: () => ({ style: {}, getContext: () => null }),
};
const realWarn = console.warn, realErr = console.error;
console.warn = () => {}; console.error = () => {};
const { initBaker } = await import(s_('materials/baker.js'));
initBaker({ getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {}, readRenderTargetPixels: (a,b,c,d,e,buf)=>{buf[0]=200;buf[1]=200;buf[2]=200;if(buf.length>3)buf[3]=255;} });
const THREE = await import('three');
const RM = await import(s_('game/room.js'));
const SP = await import(s_('game/spaces.js'));
const { Player } = await import(s_('game/player.js'));
const { LimbField } = await import(s_('game/limbs.js'));
const { HunterAI } = await import(s_('game/hunter-ai.js'));
const { NoiseBus } = await import(s_('game/noise.js'));
const { MOVE, HUNTER_SPEED } = await import(s_('game/rules.js'));
const { DETENT } = await import(s_('party/darkrun.js'));
const EXP = { TERMINAL_AT: { ballroom:'ballroom.centre', gallery:'gallery.east', study_w:'study_w.north', study_e:'study_e.north', service:'service.mid', chapel:'chapel.centre' }, REACH: 2.2, SECONDS: 90 };
console.warn = realWarn; console.error = realErr;

export const room = await (async () => { const w = console.warn, e = console.error; console.warn=()=>{};console.error=()=>{};
  const r = await RM.buildTestRoom({ work: (p) => p }, { panels: SP.PANELS }); console.warn=w;console.error=e; return r; })();
export { THREE, SP, Player, LimbField, HunterAI, NoiseBus, MOVE, HUNTER_SPEED, DETENT, EXP };

/** expedition.js's detentInput(), verbatim. */
export function detentInput(detent) {
  const d = DETENT[detent];
  if (!d || d.speed <= 0) return { move: { x: 0, y: 0 }, run: false };
  const top = d.speed > MOVE.walk ? MOVE.run : MOVE.walk;
  return { move: { x: 0, y: Math.min(1, d.speed / top) }, run: d.speed > MOVE.walk };
}

/**
 * @param {object} o
 * @param {string} o.wing
 * @param {(ctx)=>number} o.policy  returns the detent for this frame
 * @param {number} o.seed
 * @param {boolean} [o.hunterOn]
 */
export function run({ wing = 'gallery', policy, seed = 7, hunterOn = true, seconds = EXP.SECONDS, spawn = null, trace = null } = {}) {
  let s = seed >>> 0; const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const scene = new THREE.Scene();
  const field = new LimbField(scene, { rng, floorY: room.floorY, bounds: room.bounds });
  const player = new Player({ scene, world: room, field, rng, id: 'runner', avatar: null });
  player.pos.copy(spawn ? new THREE.Vector3(spawn[0], 0, spawn[1]) : room.spawn.player[0]);
  player.facing = Math.PI;
  const terminal = room.anchor(EXP.TERMINAL_AT[wing]);
  const body = { root: player.root, rig: player.rig, height: player.height, radius: player.radius, get noise() { return player.noise; } };
  const noise = new NoiseBus();
  const hunter = new HunterAI({ room, scene: null, rng, position: room.spawn.hunter.clone(), noise, bangPolicy: 'auto' });
  hunter.setTargets([body]);
  let outcome = null, simT = 0, limbsLost = 0;
  hunter.onKill = () => { limbsLost++; if (!outcome) outcome = 'taken'; };
  const ev = { commit: 0, door: 0, bang: 0, through: 0, stage: 0 };
  hunter.onCommit = () => ev.commit++;
  hunter.onDoor = () => ev.door++;
  hunter.onBang = (b) => { ev.bang++; if (b?.through) ev.through++; };
  hunter.onStage = () => ev.stage++;

  const DT = 1/60;
  let clock = seconds, heading = player.facing, detent = 0;
  let pathLen = 0, noiseSum = 0, frames = 0;
  const states = {}; let minSep = Infinity; let firstHeard = null; let alertT = null;
  const rows = [];
  for (let i = 0; i < Math.round(seconds / DT) + 2; i++) {
    simT = i * DT;
    if (outcome) break;
    clock = Math.max(0, clock - DT);
    // --- steering (expedition.js SOLO director, verbatim)
    const hops = room.pathPortals(player.pos, terminal, 0.6, 1.9);
    const h = hops[0];
    const c = h && h.centre;
    let leg;
    if (c && Number.isFinite(c.x) && Number.isFinite(c.z)) {
      const n = h.normal || { x: 0, z: 1 };
      const side = Math.sign((player.pos.x - c.x) * n.x + (player.pos.z - c.z) * n.z) || 1;
      leg = { x: c.x - n.x * side * 1.5, z: c.z - n.z * side * 1.5 };
    } else leg = { x: terminal.x, z: terminal.z };
    heading = Math.atan2(leg.x - player.pos.x, leg.z - player.pos.z);
    const d = Math.hypot(terminal.x - player.pos.x, terminal.z - player.pos.z);
    detent = policy ? policy({ d, t: simT, hunter, player, clock }) : (d > 9 ? 3 : d > 3.5 ? 2 : d > EXP.REACH ? 1 : 0);
    const before = player.pos.clone();
    player.aimYaw = heading;
    player.update(DT, simT, { ...detentInput(detent), aimYaw: heading, aimPitch: 0 });
    room.update(DT);
    pathLen += Math.hypot(player.pos.x - before.x, player.pos.z - before.z);
    noiseSum += player.noise; frames++;
    if (hunterOn) {
      if (player.noise > 0) noise.emit(player.pos, player.noise, 'move');
      noise.update(DT);
      hunter.update(DT, simT);
      states[hunter.state] = (states[hunter.state] || 0) + 1;
      const sep = Math.hypot(player.pos.x - hunter.root.position.x, player.pos.z - hunter.root.position.z);
      if (sep < minSep) minSep = sep;
      if (hunter.awareness > 0 && firstHeard == null) firstHeard = simT;
      if (alertT == null && hunter.state !== 'PATROL' && hunter.state !== 'IDLE') alertT = simT;
    }
    if (trace && i % trace === 0) rows.push({ t: +simT.toFixed(2), x: +player.pos.x.toFixed(2), z: +player.pos.z.toFixed(2), d: +d.toFixed(2), det: detent, room: room.spaceAt(player.pos)?.id ?? null, hs: hunter.state, aw: +hunter.awareness.toFixed(2) });
    const reach = Math.hypot(player.pos.x - terminal.x, player.pos.z - terminal.z);
    if (!outcome && reach < EXP.REACH) outcome = 'lit';
    else if (!outcome && clock <= 0) outcome = 'held';
  }
  return { outcome, t: +simT.toFixed(2), pathLen: +pathLen.toFixed(2), meanNoise: +(noiseSum/Math.max(1,frames)).toFixed(3),
    states, minSep: +minSep.toFixed(2), limbsLost, ev, firstHeard, alertT, rows,
    end: { x: +player.pos.x.toFixed(2), z: +player.pos.z.toFixed(2), room: room.spaceAt(player.pos)?.id ?? null },
    hunterStage: hunter.stage, hunterAbsorbed: hunter.absorbed };
}
