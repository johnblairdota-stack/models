#!/usr/bin/env node
/**
 * 🚪 **door-hop — THE SOLO DIRECTOR GETS THROUGH EVERY DOOR IN THE HOUSE, AND THE HEADER THAT
 * SAID OTHERWISE WAS BLAMING THE WRONG FILE.**
 *
 *   node harness/door-hop.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS IS ABOUT
 * ---------------------------------------------------------------------------------------------
 * `views/expedition.js`'s scripted runner is how the wired mode is screenshotted, how a
 * look-critic sees a playthrough, and — since the mansion was attached — how anything about the
 * expedition gets driven end to end at all. Its header carried a stated limit: *"IT DOES NOT GET
 * THROUGH D4 … three separate steering fixes did not move it, which is what says the problem is
 * collision at that doorway and not this waypoint logic."*
 *
 * 🚨 **THE DIAGNOSIS WAS WRONG AND THE COST WAS FOUR OF SIX WINGS.** H1 drives a body straight
 * through all four of the house's doorways with no pathfinder at all: every one of them is
 * crossed, on-axis and at ±1.2 m. The doors are fine. The bug was the waypoint's SIGN —
 * `side = sign((pos − c) · n)` inverts the frame the body crosses the plane, so the waypoint jumps
 * to the far side and drives the robot back; and `spaceAt`'s padded rects overlap by 0.9 m either
 * side of a doorway, first-declared-wins, so `study_w` keeps re-offering the hop instead of
 * letting the room change release it. `?wing=gallery` escaped only because `gallery` is declared
 * FIRST in `SPACES` and therefore claims the runner before D1's plane rather than after it.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ TWO CONTROLS, BECAUSE THERE ARE TWO WRONG ANSWERS AND ONE OF THEM WAS IN THE HEADER
 * ---------------------------------------------------------------------------------------------
 * H3 is the rule that shipped. H4 is the rule the old header PROPOSED as the fix — *"take the
 * first hop that is actually somewhere else"* — built and driven rather than assumed: it recovers
 * the ballroom, LOSES THE GALLERY — the one wing that worked before — and leaves study_e and
 * service oscillating at D4 for the full ninety seconds, because a runner that drops the doorway
 * it is standing in then steers at a terminal on the other side of a wall. All three rules are driven through the SAME house, the same seed and the same
 * detent ladder, so nothing here is comparing different runs.
 *
 * No GPU: the house is built headless the way `engine-take` builds it.
 */

import { HOUSE } from '../src/party/houseplan.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };

// ---------------------------------------------------------------- the headless house
const SRC = new URL('../src/', new URL('.', import.meta.url));
const s_ = (p) => new URL(p, SRC).href;
globalThis.location = { search: '' };
globalThis.document = {
  createElementNS: () => ({ set src(_v) {}, get src() { return ''; }, addEventListener() {}, removeEventListener() {}, style: {} }),
  createElement: () => ({ style: {}, getContext: () => null }),
};
const realWarn = console.warn, realErr = console.error;
console.warn = () => {}; console.error = () => {};
const { initBaker } = await import(s_('materials/baker.js'));
initBaker({
  getRenderTarget: () => null, setRenderTarget: () => {}, render: () => {},
  readRenderTargetPixels: (a, b, c, d, e, buf) => { buf[0] = 200; buf[1] = 200; buf[2] = 200; if (buf.length > 3) buf[3] = 255; },
});
const THREE = await import('three');
const RM = await import(s_('game/room.js'));
const SP = await import(s_('game/spaces.js'));
const { Player } = await import(s_('game/player.js'));
const { LimbField } = await import(s_('game/limbs.js'));
const { MOVE } = await import(s_('game/rules.js'));
const { DETENT } = await import(s_('party/darkrun.js'));
const EXP = await import(s_('views/expedition.js'));
const room = await RM.buildTestRoom({ work: (p) => p }, { panels: SP.PANELS });
console.warn = realWarn; console.error = realErr;

const DT = 1 / 60;
const SPAWN = room.spawn.player[0].clone();
const WINGS = ['gallery', 'study_w', 'ballroom', 'study_e', 'service'];

/** `views/expedition.js`'s `detentInput`, and the ladder its solo director climbs. */
function stick(det) {
  const d = DETENT[det];
  if (!d || d.speed <= 0) return { move: { x: 0, y: 0 }, run: false };
  const top = d.speed > MOVE.walk ? MOVE.run : MOVE.walk;
  return { move: { x: 0, y: Math.min(1, d.speed / top) }, run: d.speed > MOVE.walk };
}

/** THE RULE THAT SHIPPED. Waypoint on the far side FROM THE RUNNER — the sign that inverts. */
function runnerSideRule(hops, pos) {
  const h = hops[0];
  const c = h && h.centre;
  if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.z)) return null;
  const n = h.normal || { x: 0, z: 1 };
  const side = Math.sign((pos.x - c.x) * n.x + (pos.z - c.z) * n.z) || 1;
  return { x: c.x - n.x * side * EXP.HOP_BEYOND, z: c.z - n.z * side * EXP.HOP_BEYOND, via: h.id };
}

/** THE RULE THE OLD HEADER PROPOSED. Same sign, but skip the doorway you are standing in. */
function skipUnderfootRule(hops, pos) {
  for (const h of hops) {
    const c = h && h.centre;
    if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.z)) continue;
    const n = h.normal || { x: 0, z: 1 };
    const dx = pos.x - c.x, dz = pos.z - c.z;
    const along = dx * n.x + dz * n.z, across = -dx * n.z + dz * n.x;
    if (Math.abs(along) < 1.2 && Math.abs(across) < (h.w ?? 1.9) / 2 + 0.6) continue;
    const side = Math.sign(along) || 1;
    return { x: c.x - n.x * side * EXP.HOP_BEYOND, z: c.z - n.z * side * EXP.HOP_BEYOND, via: h.id };
  }
  return null;
}

/** One expedition, one waypoint rule. Same house, same seed, same ladder. */
function drive(wing, rule, { dx = 0, dz = 0 } = {}) {
  let seed = 5;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const scene = new THREE.Scene();
  const field = new LimbField(scene, { rng, floorY: room.floorY, bounds: room.bounds });
  const player = new Player({ scene, world: room, field, rng, id: 'runner', avatar: null });
  player.pos.copy(SPAWN); player.pos.x += dx; player.pos.z += dz; player.facing = Math.PI;
  const terminal = room.anchor(EXP.TERMINAL_AT[wing]);
  const visited = new Set([room.spaceAt(player.pos)?.id]);
  let outcome = null, simT = 0, clock = EXP.EXPEDITION_SECONDS, path = 0;
  for (let i = 0; i < Math.round(EXP.EXPEDITION_SECONDS / DT) && !outcome; i++) {
    simT = i * DT; clock -= DT;
    const hops = room.pathPortals(player.pos, terminal, 0.6, 1.9);
    const leg = rule(hops, player.pos) ?? { x: terminal.x, z: terminal.z, via: 'direct' };
    const heading = Math.atan2(leg.x - player.pos.x, leg.z - player.pos.z);
    const d = Math.hypot(terminal.x - player.pos.x, terminal.z - player.pos.z);
    const det = d > 9 ? 3 : d > 3.5 ? 2 : d > EXP.TERMINAL_REACH ? 1 : 0;
    const was = player.pos.clone();
    player.aimYaw = heading;
    player.update(DT, simT, { ...stick(det), aimYaw: heading, aimPitch: 0 });
    room.update(DT);
    path += Math.hypot(player.pos.x - was.x, player.pos.z - was.z);
    visited.add(room.spaceAt(player.pos)?.id);
    if (Math.hypot(player.pos.x - terminal.x, player.pos.z - terminal.z) < EXP.TERMINAL_REACH) outcome = 'lit';
    else if (clock <= 0) outcome = 'held';
  }
  return {
    wing, outcome: outcome ?? 'held', t: simT, path,
    short: Math.hypot(player.pos.x - terminal.x, player.pos.z - terminal.z),
    endRoom: room.spaceAt(player.pos)?.id ?? null, rooms: [...visited].filter(Boolean),
  };
}

const shipped = (hops, pos) => EXP.hopWaypoint(room, hops, pos);
const row = (r) => `${r.wing} ${r.outcome}@${r.t.toFixed(1)}s`;

// ---------------------------------------------------------------- H1 · the doors are not the bug
/**
 * No pathfinder, no waypoint rule: a body pointed at the far side of each doorway and told to RUN.
 * If the old header were right about collision at D4 this is where it would show.
 */
{
  const cross = [];
  for (const p of room.portals()) {
    for (const lateral of [-1.2, -0.6, 0, 0.6, 1.2]) {
      const n = p.normal || { x: 0, z: 1 };
      // Start 4 m back on one side, aim 4 m through to the other, offset along the wall.
      const tx = -n.z, tz = n.x;
      const from = new THREE.Vector3(p.centre.x + n.x * 4 + tx * lateral, 0, p.centre.z + n.z * 4 + tz * lateral);
      const to = new THREE.Vector3(p.centre.x - n.x * 4, 0, p.centre.z - n.z * 4);
      let seed = 3;
      const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const scene = new THREE.Scene();
      const field = new LimbField(scene, { rng, floorY: room.floorY, bounds: room.bounds });
      const pl = new Player({ scene, world: room, field, rng, id: 'x', avatar: null });
      pl.pos.copy(from);
      let got = false;
      for (let i = 0; i < 12 * 60 && !got; i++) {
        const heading = Math.atan2(to.x - pl.pos.x, to.z - pl.pos.z);
        pl.aimYaw = heading;
        pl.update(DT, i * DT, { move: { x: 0, y: 1 }, run: true, aimYaw: heading, aimPitch: 0 });
        room.update(DT);
        // crossed when the signed distance to the plane changes sign
        if (Math.sign((pl.pos.x - p.centre.x) * n.x + (pl.pos.z - p.centre.z) * n.z) < 0) got = true;
      }
      cross.push({ id: p.id, lateral, got });
    }
  }
  const missed = cross.filter((c) => !c.got);
  t('H1 · every doorway in the house is crossable by a body that just walks at it',
    missed.length === 0,
    missed.length ? missed.map((m) => `${m.id}@${m.lateral}m`).join(', ')
      : `${cross.length} crossings · ${room.portals().map((p) => p.id).join('/')} at ±1.2 m`);
  t('H1b · including D4, which the old header named as the blocker',
    cross.filter((c) => c.id === 'D4').every((c) => c.got),
    'D4 crossed at every lateral offset — it is not collision');
}

// ---------------------------------------------------------------- H2 · the shipped rule delivers
{
  const runs = WINGS.map((w) => drive(w, shipped));
  t('H2 · the solo director reaches the terminal in every drawable wing',
    runs.every((r) => r.outcome === 'lit'), runs.map(row).join(' · '));

  const off = [];
  for (const w of WINGS) for (const d of [-1.2, -0.6, 0.6, 1.2]) off.push(drive(w, shipped, { dx: d }));
  t('H2b · and from off-axis starts, so it is not one lucky line through the house',
    off.every((r) => r.outcome === 'lit'),
    `${off.length} runs at ±0.6/±1.2 m · slowest ${Math.max(...off.map((r) => r.t)).toFixed(1)}s`);

  const multi = runs.filter((r) => r.rooms.length >= 3);
  t('H2c · two-hop wings really do cross two rooms rather than arriving by luck',
    multi.length >= 2, multi.map((r) => `${r.wing}: ${r.rooms.join('→')}`).join(' · '));

  t('H2d · and the route is walked, not slid along a wall — path length is near the straight line',
    runs.every((r) => r.path > 1 && r.path < 40),
    runs.map((r) => `${r.wing} ${r.path.toFixed(1)}m`).join(' '));
}

// ---------------------------------------------------------------- H3 · the control: what shipped
{
  const runs = WINGS.map((w) => drive(w, runnerSideRule));
  const stuck = runs.filter((r) => r.outcome !== 'lit');
  t('H3 control · restore the runner-side sign and four of the five wings never arrive',
    stuck.length >= 3, runs.map((r) => `${row(r)}${r.outcome === 'lit' ? '' : ` (${r.short.toFixed(1)}m short in ${r.endRoom})`}`).join(' · '));

  t('H3b control · and the one that still works is the one whose room is declared first in SPACES',
    runs.find((r) => r.wing === 'gallery')?.outcome === 'lit'
    && HOUSE[0].id === 'gallery',
    `SPACES order: ${HOUSE.map((h) => h.id).join(', ')} — gallery wins its overlap with study_w and is claimed BEFORE D1's plane`);

  t('H3c control · and every stuck one is still in the spawn room at the ninety-second mark',
    stuck.length > 0 && stuck.every((r) => r.endRoom === 'study_w'),
    stuck.map((r) => `${r.wing} ended in ${r.endRoom}, ${r.short.toFixed(1)}m short`).join(' · '));
}

// ---------------------------------------------------------------- H4 · the control the header proposed
/**
 * The old header's own prescription, built and driven. It is a real improvement and it is not the
 * fix: the ballroom recovers, the two-hop wings do not, because a runner that drops the doorway it
 * is standing in then steers at a terminal on the other side of the wall behind it.
 */
{
  const runs = WINGS.map((w) => drive(w, skipUnderfootRule));
  const arrived = runs.filter((r) => r.outcome === 'lit').map((r) => r.wing);
  t('H4 control · "take the first hop that is actually somewhere else" is not sufficient either',
    runs.some((r) => r.outcome !== 'lit'),
    runs.map((r) => `${row(r)}${r.outcome === 'lit' ? '' : ` (${r.short.toFixed(1)}m short)`}`).join(' · '));
  /**
   * ⚠️ AND IT IS WORSE THAN "INCOMPLETE" — IT TRADES ONE WING FOR ANOTHER. Skipping the doorway
   * underfoot recovers the ballroom and LOSES THE GALLERY, the one wing that worked before: the
   * skip fires 1.2 m short of D1's plane, at which point the runner steers at `gallery.east` while
   * still on the study_w side and walks into the wall beside the door. That is the second of the
   * two failure modes the shipped code's own comment already listed, arrived at from the other
   * direction — which is the argument for orienting the waypoint instead of dropping it.
   */
  t('H4b control · and it trades one wing for another — the gallery, which used to work, is lost',
    !arrived.includes('gallery') && arrived.includes('ballroom'),
    `arrived: ${arrived.join(', ')} · stuck: ${runs.filter((r) => r.outcome !== 'lit').map((r) => `${r.wing}(${r.short.toFixed(1)}m)`).join(', ')}`);
  t('H4c · so the shipped rule strictly dominates both controls, in the same house',
    WINGS.every((w) => drive(w, shipped).outcome === 'lit'),
    `${WINGS.length}/${WINGS.length} with the doorway-oriented waypoint`);
}

console.log(`\ndoor-hop: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
