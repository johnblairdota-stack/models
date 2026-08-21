/** _mr8_full — the party expedition, measured. Fixed steering so the HOUSE is what is measured. */
import { room, THREE, Player, LimbField, HunterAI, NoiseBus, MOVE, HUNTER_SPEED, DETENT, EXP, detentInput } from './_mr2_sim.mjs';

/** The shipped waypoint rule, with the side chosen by WHICH ROOM YOU ARE IN rather than by a
 *  dot product that inverts the instant you cross the plane. One line; see _mr7. */
function legFor(pos, terminal, fix) {
  const hops = room.pathPortals(pos, terminal, 0.6, 1.9);
  const h = hops[0]; const c = h && h.centre;
  if (!(c && Number.isFinite(c.x) && Number.isFinite(c.z))) return { x: terminal.x, z: terminal.z, stuckable: false };
  const n = h.normal || { x: 0, z: 1 };
  if (!fix) {
    const side = Math.sign((pos.x - c.x) * n.x + (pos.z - c.z) * n.z) || 1;
    return { x: c.x - n.x * side * 1.5, z: c.z - n.z * side * 1.5 };
  }
  // the far room is the one we are NOT in
  const here = room.spaceAt(pos)?.id ?? null;
  const far = h.a === here ? h.b : h.a;
  const fs = room.spaces.find((s) => s.id === far);
  const fc = fs ? { x: (fs.x0 + fs.x1) / 2, z: (fs.z0 + fs.z1) / 2 } : terminal;
  const side = Math.sign((fc.x - c.x) * n.x + (fc.z - c.z) * n.z) || 1;
  return { x: c.x + n.x * side * 1.5, z: c.z + n.z * side * 1.5 };
}

export function play({ wing, seed = 7, policy, hunterOn = true, busEmit = true, fix = true, seconds = 90 }) {
  let s = (seed >>> 0) || 1; const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const scene = new THREE.Scene();
  const field = new LimbField(scene, { rng, floorY: room.floorY, bounds: room.bounds });
  const player = new Player({ scene, world: room, field, rng, id: 'runner', avatar: null });
  player.pos.copy(room.spawn.player[0]); player.facing = Math.PI;
  const terminal = room.anchor(EXP.TERMINAL_AT[wing]);
  const body = { root: player.root, rig: player.rig, height: player.height, radius: player.radius, get noise() { return player.noise; } };
  const noise = new NoiseBus();
  const hunter = new HunterAI({ room, scene: null, rng, position: room.spawn.hunter.clone(), noise, bangPolicy: 'auto' });
  hunter.setTargets([body]);
  let outcome = null, limbs = 0;
  hunter.onKill = () => { limbs++; if (!outcome) outcome = 'taken'; };
  const ev = { commit: 0, door: 0, bang: 0, through: 0, stage: 0 };
  hunter.onCommit = () => ev.commit++; hunter.onDoor = () => ev.door++;
  hunter.onBang = (b) => { ev.bang++; if (b?.through) ev.through++; }; hunter.onStage = () => ev.stage++;

  const DT = 1 / 60; let clock = seconds, simT = 0, det = 0;
  const st = {}; let minSep = Infinity, path = 0, noiseSum = 0, frames = 0;
  let firstNonPatrol = null, commitT = null, everSeen = 0;
  hunter.onCommit = () => { ev.commit++; if (commitT == null) commitT = simT; };
  for (let i = 0; i < Math.round(seconds / DT) + 2 && !outcome; i++) {
    simT = i * DT; clock = Math.max(0, clock - DT);
    const leg = legFor(player.pos, terminal, fix);
    const heading = Math.atan2(leg.x - player.pos.x, leg.z - player.pos.z);
    const d = Math.hypot(terminal.x - player.pos.x, terminal.z - player.pos.z);
    det = policy({ d, t: simT, hunter, player, clock, sep: Math.hypot(player.pos.x - hunter.root.position.x, player.pos.z - hunter.root.position.z) });
    const b4x = player.pos.x, b4z = player.pos.z;
    player.aimYaw = heading;
    player.update(DT, simT, { ...detentInput(det), aimYaw: heading, aimPitch: 0 });
    room.update(DT);
    path += Math.hypot(player.pos.x - b4x, player.pos.z - b4z);
    noiseSum += player.noise; frames++;
    if (hunterOn) {
      if (busEmit && player.noise > 0) noise.emit(player.pos, player.noise, 'move');
      noise.update(DT);
      hunter.update(DT, simT);
      st[hunter.state] = (st[hunter.state] || 0) + 1;
      if (hunter.state !== 'PATROL' && firstNonPatrol == null) firstNonPatrol = simT;
      if (hunter.awareness >= 0.22) everSeen++;
      const sep = Math.hypot(player.pos.x - hunter.root.position.x, player.pos.z - hunter.root.position.z);
      if (sep < minSep) minSep = sep;
    }
    const reach = Math.hypot(player.pos.x - terminal.x, player.pos.z - terminal.z);
    if (!outcome && reach < EXP.REACH) outcome = 'lit';
    else if (!outcome && clock <= 0) outcome = 'held';
  }
  return { outcome, t: +simT.toFixed(2), path: +path.toFixed(1), meanNoise: +(noiseSum / Math.max(1, frames)).toFixed(3),
    st, minSep: +minSep.toFixed(2), limbs, ev, firstNonPatrol, commitT, alertFrac: +(everSeen / Math.max(1, frames)).toFixed(2) };
}

export const POLICIES = {
  STILL: () => 0, CREEP: () => 1, WALK: () => 2, RUN: () => 3,
  ladder: ({ d }) => (d > 9 ? 3 : d > 3.5 ? 2 : d > EXP.REACH ? 1 : 0),
  // a plausible human: run in the open, creep when the hunter is near
  cautious: ({ sep }) => (sep < 12 ? 1 : 3),
  smart: ({ sep }) => (sep < 8 ? 3 : sep < 16 ? 2 : 3),
};
export { room };
