#!/usr/bin/env node
/**
 * 🚪 **wing-draw — EVERY WING THE SHOW CAN SEND SOMEBODY TO IS A WING THE RUNNER CAN WALK TO.**
 *
 *   node harness/wing-draw.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 ONE EXPEDITION IN SIX TARGETED A ROOM NOBODY CAN ENTER
 * ---------------------------------------------------------------------------------------------
 * `session.js` drew the wing uniformly from `coverage.js`'s `ROOMS`, which is every room in the
 * house — and the chapel has **zero open connectors**. `spaces.js` removed D7 in full on
 * 2026-08-08 (*"remove all 'door' structures in the gallery except the one that leads into the
 * spawn point"*), leaving `p.chapel`, a BREACHABLE panel, and two exit sites. So `room.portals()`
 * reports four doorways in the whole building and none of them touches the chapel.
 *
 * That would be a dig objective if the runner could dig. It cannot: there is no `player.attack`,
 * no sledge, no `interact` and no ACTION button anywhere in `views/expedition.js` or on the
 * runner's phone — `rrr-phone-ux.md` §3.1 specifies one, and it is not built. W4 measures what
 * the runner actually does with those ninety seconds, by driving the real house.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ WHY THE FIX IS A DERIVATION AND THIS GATE IS SHAPED THE WAY IT IS
 * ---------------------------------------------------------------------------------------------
 * `ROOMS.filter(r => r !== 'chapel')` would pass W3 and would be a worse repo: `spaces.js` builds
 * from `GEN.portals` behind `?plan=gen`, so the next generated plan with a dead end reintroduces
 * the bug under a different name. `houseplan.js` states the CONNECTIVITY instead and derives
 * `WINGS` from it by BFS — and because `houseplan.js` may not import THREE (it runs in a worker,
 * in bare node and on a phone), the stated connectivity is pinned to the built house HERE, which
 * is exactly the trade `expedition-wire` E1c already makes for the footprint. W1 is that pin.
 *
 * No GPU: the house is built headless the way `engine-take` builds it.
 */

import { readFileSync } from 'node:fs';
import { DOORS, WINGS, SPAWN_ROOM, reachableFrom, HOUSE } from '../src/party/houseplan.js';
import { ROOMS } from '../src/party/coverage.js';
import { createSession } from '../src/party/session.js';
import { PHASE } from '../src/party/phases.js';

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

const SPAWN = room.spawn.player[0].clone();
const spawnSpace = room.spaceAt(SPAWN)?.id ?? null;

/** The house's own answer: BFS over whatever `room.portals()` says is open right now. */
function engineReachable(from) {
  const adj = new Map();
  const link = (a, b) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); };
  for (const p of room.portals()) { link(p.a, p.b); link(p.b, p.a); }
  const seen = new Set([from]), q = [from];
  while (q.length) for (const n of adj.get(q.shift()) ?? []) if (!seen.has(n)) { seen.add(n); q.push(n); }
  return [...seen].sort();
}
const ENGINE_REACHABLE = engineReachable(spawnSpace);

/** The route the runner would actually be given, from the spawn to a wing's terminal. */
function routeTo(wing) {
  const term = room.anchor(EXP.TERMINAL_AT[wing]);
  if (!term) return null;
  const hops = room.pathPortals(SPAWN, term, 0.6, 1.9);
  return { term, hops, sameRoom: room.spaceAt(term)?.id === spawnSpace };
}

// ---------------------------------------------------------------- W0 · the arm
{
  t('W0 arm · the real house was built and it answers about its own doorways',
    room.portals().length > 0 && spawnSpace != null,
    `spawn in ${spawnSpace} · ${room.portals().length} open connectors: ${room.portals().map((p) => p.id).join(', ')}`);
  t('W0b arm · and the spawn room the pure side names is the one the engine spawns in',
    SPAWN_ROOM === spawnSpace, `houseplan says ${SPAWN_ROOM}, the house says ${spawnSpace}`);
}

// ---------------------------------------------------------------- W1 · the pin
/**
 * `houseplan.js` may not import THREE, so its `DOORS` is a stated copy. This is the check that
 * keeps it honest — every open connector in the built house, by id and by the pair it joins, in
 * both directions, exactly as `expedition-wire` E1c pins the footprint.
 */
{
  const built = room.portals().map((p) => ({ id: p.id, pair: [p.a, p.b].sort().join('-') }));
  const stated = DOORS.map((d) => ({ id: d.id, pair: [d.a, d.b].sort().join('-') }));
  const key = (l) => l.map((e) => `${e.id}:${e.pair}`).sort().join(' ');
  t('W1 · the pure door table IS the built house\'s open connectors, id for id and pair for pair',
    key(built) === key(stated), `built [${key(built)}] vs stated [${key(stated)}]`);

  t('W1b · and no BREACHABLE panel is in it — a wall the runner cannot open is not a route',
    !DOORS.some((d) => room.panels.some((p) => p.id === d.id)) && room.panels.length > 0,
    `${room.panels.length} panels in the house, ${DOORS.length} doors in the table, no overlap`);

  // The panel's own connector spec — `p.a`/`p.b` are not on the built wall, they are on `connector`.
  const touches = (c, id) => c && (c.a === id || c.b === id);
  const chapelPanels = room.panels.filter((p) => touches(p.connector, 'chapel'));
  const chapelDoors = room.portals().filter((p) => touches(p, 'chapel'));
  t('W1c · the chapel\'s only connectors are panels, which is why it is not a wing',
    chapelPanels.length > 0 && chapelDoors.length === 0,
    `${chapelPanels.map((p) => `${p.id}(${p.connector.state})`).join(', ')} · 0 open connectors`);
  t('W1d control · and the detector finds open connectors where there ARE some',
    room.portals().filter((p) => touches(p, 'ballroom')).length === 3,
    `the ballroom has ${room.portals().filter((p) => touches(p, 'ballroom')).map((p) => p.id).join('/')}`);

  // Control: drop a real door and the pin must notice. Nothing is written by hand.
  const dropped = DOORS.filter((d) => d.id !== 'D4');
  t('W1 control · take D4 out of the stated table and W1 goes red',
    key(built) !== key(dropped.map((d) => ({ id: d.id, pair: [d.a, d.b].sort().join('-') }))),
    'the pin compares the built list, so a missing door is a mismatch');
  // ...and the other direction: an invented door.
  const invented = [...DOORS, { id: 'D7', a: 'gallery', b: 'chapel' }];
  t('W1b control · and putting the removed D7 back in the table goes red too',
    key(built) !== key(invented.map((d) => ({ id: d.id, pair: [d.a, d.b].sort().join('-') }))),
    'D7 was removed from `spaces.js` in full; the house does not build it');
}

// ---------------------------------------------------------------- W2 · the derivation
{
  t('W2 · `WINGS` is exactly what the built house says is reachable from the spawn',
    JSON.stringify([...WINGS].sort()) === JSON.stringify(ENGINE_REACHABLE),
    `pure [${[...WINGS].sort()}] vs engine [${ENGINE_REACHABLE}]`);

  t('W2b · which is five of the six rooms, and the sixth is the chapel',
    WINGS.length === ROOMS.length - 1 && !WINGS.includes('chapel'),
    `${WINGS.length} wings of ${ROOMS.length} rooms · missing: ${ROOMS.filter((r) => !WINGS.includes(r)).join(', ')}`);

  t('W2c · it is a SEARCH, not a deny-list — reverse the house and the chapel becomes the only wing',
    JSON.stringify(reachableFrom('chapel')) === JSON.stringify(['chapel'])
    && JSON.stringify(reachableFrom('service')) === JSON.stringify([...WINGS]),
    `from the chapel: [${reachableFrom('chapel')}] · from the service passage: [${reachableFrom('service')}]`);

  t('W2d · and a generated plan that opens the chapel would put it back with no edit here',
    reachableFrom(SPAWN_ROOM, [...DOORS, { id: 'D7', a: 'gallery', b: 'chapel' }]).includes('chapel'),
    'the derivation is over the door table, so the wing list follows the house');
}

// ---------------------------------------------------------------- W3 · what a show actually draws
/**
 * The real `createSession`, driven through real episodes across many world seeds, and every wing
 * it announces put back through the BUILT house's own pathfinder — the same BFS `hunter-ai.js`
 * routes on. Nothing here compares two name lists.
 */
{
  const drawn = [];
  for (let worldSeed = 1; worldSeed <= 60; worldSeed++) {
    const s = createSession({ count: 8, castSeed: worldSeed * 7 + 1, worldSeed, send: () => {} });
    let now = 0;
    s.start(now);
    const seenEp = new Set();
    for (let i = 0; i < 400 && seenEp.size < 3; i++) {
      if (s.state.phase === PHASE.CASTING && s.state.expedition?.room) {
        if (!seenEp.has(s.state.episode)) {
          seenEp.add(s.state.episode);
          drawn.push({ worldSeed, episode: s.state.episode, wing: s.state.expedition.room });
        }
        const alive = s.state.players.filter((p) => p.alive).map((p) => p.id);
        for (let k = 0; k < alive.length; k++) {
          s.input(alive[k], { t: 'cast', runner: alive[(k + 1) % alive.length], guide: alive[(k + 2) % alive.length] });
        }
      }
      now += 1000;
      s.tick(now);
    }
  }
  const unroutable = drawn.filter((d) => {
    const r = routeTo(d.wing);
    return !r || (!r.sameRoom && r.hops.length === 0);
  });
  t('W3 arm · a real show was driven and it announced wings',
    drawn.length >= 100, `${drawn.length} announcements across 60 world seeds`);
  t('W3 · every wing a show announces has a route from the spawn, in the built house',
    unroutable.length === 0,
    unroutable.length ? `${unroutable.length} unroutable, e.g. seed ${unroutable[0].worldSeed} ep ${unroutable[0].episode} → ${unroutable[0].wing}`
      : `${drawn.length} announcements · wings drawn: ${[...new Set(drawn.map((d) => d.wing))].sort().join(', ')}`);
  t('W3b · and the draw still uses every reachable wing, so nothing was narrowed by accident',
    WINGS.every((w) => drawn.some((d) => d.wing === w)),
    WINGS.map((w) => `${w}:${drawn.filter((d) => d.wing === w).length}`).join(' '));

  /**
   * The control is the pool that shipped, run through the identical predicate. Nothing is
   * re-simulated and no string is compared to a string this file wrote.
   */
  const shippedPool = ROOMS.filter((r) => {
    const rt = routeTo(r);
    return !rt || (!rt.sameRoom && rt.hops.length === 0);
  });
  t('W3 control · put the unreachable room back in the pool and the same predicate goes red',
    shippedPool.length > 0,
    `drawing from ROOMS offers ${shippedPool.join(', ')} — no route from ${spawnSpace}, ${(shippedPool.length / ROOMS.length * 100).toFixed(0)}% of episodes`);
}

// ---------------------------------------------------------------- W4 · what the robot does there
/**
 * 🚨 THE MEASURED HALF. The graph says unreachable; this drives the real `Player` through the real
 * `room.collide` for the full ninety seconds, steering exactly as `views/expedition.js`'s solo
 * director steers, and reports where it ends up. A wing that cannot be reached is not a hard
 * episode — it is a robot standing against a wall on television while the guide talks.
 */
{
  const DT = 1 / 60;
  function drive(wing) {
    let seed = 5;
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const scene = new THREE.Scene();
    const field = new LimbField(scene, { rng, floorY: room.floorY, bounds: room.bounds });
    const player = new Player({ scene, world: room, field, rng, id: 'runner', avatar: null });
    player.pos.copy(SPAWN); player.facing = Math.PI;
    const terminal = room.anchor(EXP.TERMINAL_AT[wing]);
    let outcome = null, clock = EXP.EXPEDITION_SECONDS, simT = 0;
    for (let i = 0; i < Math.round(EXP.EXPEDITION_SECONDS / DT) && !outcome; i++) {
      simT = i * DT; clock -= DT;
      // The shipped solo director, verbatim: `pathPortals` and `hopWaypoint`, nothing else.
      const hops = room.pathPortals(player.pos, terminal, 0.6, 1.9);
      const leg = EXP.hopWaypoint(room, hops, player.pos) ?? { x: terminal.x, z: terminal.z };
      const heading = Math.atan2(leg.x - player.pos.x, leg.z - player.pos.z);
      const d = Math.hypot(terminal.x - player.pos.x, terminal.z - player.pos.z);
      const det = d > 9 ? 3 : d > 3.5 ? 2 : d > EXP.TERMINAL_REACH ? 1 : 0;
      const dd = DETENT[det];
      const top = dd.speed > MOVE.walk ? MOVE.run : MOVE.walk;
      const input = dd.speed <= 0 ? { move: { x: 0, y: 0 }, run: false }
        : { move: { x: 0, y: Math.min(1, dd.speed / top) }, run: dd.speed > MOVE.walk };
      player.aimYaw = heading;
      player.update(DT, simT, { ...input, aimYaw: heading, aimPitch: 0 });
      room.update(DT);
      if (Math.hypot(player.pos.x - terminal.x, player.pos.z - terminal.z) < EXP.TERMINAL_REACH) outcome = 'lit';
      else if (clock <= 0) outcome = 'held';
    }
    return {
      wing, outcome: outcome ?? 'held', t: simT,
      short: Math.hypot(player.pos.x - terminal.x, player.pos.z - terminal.z),
      endRoom: room.spaceAt(player.pos)?.id ?? null,
    };
  }

  const chapel = drive('chapel');
  t('W4 control · a chapel expedition, driven for real, ends `held` with the robot short of it',
    chapel.outcome === 'held' && chapel.short > EXP.TERMINAL_REACH,
    `ninety seconds → ${chapel.outcome}, ${chapel.short.toFixed(2)} m short, stopped in the ${chapel.endRoom}`);

  const reached = WINGS.filter((w) => w !== SPAWN_ROOM).map(drive);
  t('W4 · and every DRAWABLE wing is reached, in the same house, by the same driver',
    reached.every((r) => r.outcome === 'lit'),
    reached.map((r) => `${r.wing} ${r.outcome}@${r.t.toFixed(1)}s`).join(' · '));
}

// ---------------------------------------------------------------- W5 · the runner has no dig verb
/**
 * The reason a breachable panel is not a route. Scanned rather than asserted in prose — and the
 * control is `views/game.js`, a REAL file that really does carry every one of these verbs, so the
 * detector is shown finding them somewhere before it is trusted to report their absence.
 */
{
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const VERBS = [/\bplayer\.attack\b/, /\bplayer\.sledge\.(?!forget)/, /\bplayer\.interact\b/, /\bswing\s*:/];
  const expSrc = strip(readFileSync(new URL('../src/views/expedition.js', import.meta.url), 'utf8'));
  const gameSrc = strip(readFileSync(new URL('../src/views/game.js', import.meta.url), 'utf8'));
  const inExp = VERBS.filter((r) => r.test(expSrc));
  const inGame = VERBS.filter((r) => r.test(gameSrc));
  t('W5 · the expedition gives the runner no attack verb, so a wall is not a door',
    inExp.length === 0, `${VERBS.length} verbs scanned for, none present`);
  t('W5 control · the survival mode carries those verbs, so the scan can find them',
    inGame.length >= 3, `${inGame.length} of ${VERBS.length} found in views/game.js`);
}

console.log(`\nwing-draw: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
