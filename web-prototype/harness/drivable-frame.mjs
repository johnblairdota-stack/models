#!/usr/bin/env node
/**
 * 🎮 **drivable-frame — THE TELEVISION IS THE RUNNER'S SCREEN, AND IT WAS CUTTING AWAY FROM THEM.**
 *
 *   node harness/drivable-frame.mjs
 *
 * ---------------------------------------------------------------------------------------------
 * THE CONTRACT, AND WHY IT IS A CONTRACT
 * ---------------------------------------------------------------------------------------------
 * `rrr-phone-ux.md` §3.3, in full:
 *
 *   *"During EXPEDITION the Broadcast Director **must hold a drivable frame** — behind-and-above
 *   the runner, or the runner's visor feed — and must never cut away while the runner has input.
 *   Cutaways to reaction shots, the seated circle or another camera are permitted **only** in
 *   windows where the host has frozen or auto-driven the runner. Without this, D-P1 is
 *   unplayable."*
 *
 * D-P1 is bible D13: the runner's phone is a controller with no viewport, and the first-person
 * view lives on the TV. So this is not a note about taste. A frame that is not drivable is the
 * runner's screen going dark while they are holding the stick, in a house with a Hunter in it.
 *
 * 🚨 **NOTHING IMPLEMENTED IT.** `director.js`'s `needs()` predicates never asked whether the
 * runner had input, and half the library is not a drivable view: `STING` is framed on the HUNTER,
 * `REACTION` and `CONFESSIONAL` are `kind: 'card'` and `broadcast.js` paints them as an opaque
 * plate, `STATIC` is a fixed security camera at FOV 46 — §3.3's *"another camera"*, by name. And
 * `director-rig.js`'s `apply()` returns `false` for a card, so through a cutaway the camera is not
 * merely wrong, it is FROZEN at its last pose while the runner walks out of frame behind text.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ THE DIRECTION OF THE BUG IS THE WORST PART OF IT
 * ---------------------------------------------------------------------------------------------
 * C2 measures the shipped arbiter across camera counts and the non-drivable fraction goes UP with
 * unlocks — the pool the arbiter scores widens with every camera the crew lights, so earning the
 * objective made the game less playable for the person in the house. Both arms are driven through
 * the same house, the same seed and the same runner, so the only difference between them is
 * whether the Director was told.
 *
 * No GPU: the house is built headless and the broadcast camera is a bare `PerspectiveCamera`, the
 * way `director-rig.js` documents its own seam.
 */

import { readFileSync } from 'node:fs';
import { createDirector, DRIVABLE_IDS, LIVE_IDS, SHOTS, rankOf, poolFor } from '../src/party/director.js';
import { solve, isFiller, FOV } from '../src/party/shots.js';

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
const { HunterAI } = await import(s_('game/hunter-ai.js'));
const { NoiseBus } = await import(s_('game/noise.js'));
const { createRig } = await import(s_('game/director-rig.js'));
const EXP = await import(s_('views/expedition.js'));
const room = await RM.buildTestRoom({ work: (p) => p }, { panels: SP.PANELS });
console.warn = realWarn; console.error = realErr;

const DT = 1 / 60;

/**
 * 🚨 **THE VIEW'S LOOP, THE PARTS OF IT THAT CHOOSE A PICTURE.** Same order, same calls: the bus
 * events `views/expedition.js` feeds, `worldNow()`'s five answers off the same `rig.probe`,
 * `director.drive` / `director.tick`, the solve-refuse-fall-back ladder, and `rig.apply`. What is
 * dropped is only what draws. Everything that decides is the shipped module.
 *
 * @param {boolean} contract  tell the Director whether the runner has input (§3.3), or not
 */
function segment({ wing, cameras, contract, seed = 7, worldSeed = 7 }) {
  let s = seed;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const scene = new THREE.Scene();
  const field = new LimbField(scene, { rng, floorY: room.floorY, bounds: room.bounds });
  const player = new Player({ scene, world: room, field, rng, id: 'runner', avatar: null });
  player.pos.copy(room.spawn.player[0]); player.facing = Math.PI;
  const body = {
    root: player.root, rig: player.rig, height: player.height, radius: player.radius,
    get noise() { return player.noise; },
  };
  const noise = new NoiseBus();
  const hunter = new HunterAI({ room, scene, rng, position: room.spawn.hunter.clone(), noise, bangPolicy: 'off' });
  hunter.setTargets([body]);

  const camera = new THREE.PerspectiveCamera(66, 16 / 9, 0.1, 90);
  const subjects = () => ({
    runner: { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.facing, eyeHeight: player.eyeHeight },
    hunter: { x: hunter.root.position.x, y: hunter.root.position.y, z: hunter.root.position.z, yaw: 0, eyeHeight: hunter.height * 0.8 },
  });
  const rig = createRig({ camera, room, worldSeed, subjects, unlocked: () => cameras });
  let director = createDirector({ world: {} });

  // `views/expedition.js`'s `worldNow()`, verbatim in what it answers.
  const worldNow = () => {
    const sites = rig.probe.sites();
    const rp = rig.probe.pose('runner'), hp = rig.probe.pose('hunter');
    const at = (p) => ({ x: p.x, y: p.y + 1.0, z: p.z });
    return {
      subjectInStaticFrustum: !!rp && sites.some((si) => rig.probe.sees(si, at(rp))),
      hunterInStaticFrustum: !!hp && sites.some((si) => rig.probe.sees(si, at(hp))),
      subjectWorking: false,
      cutawayBudget: Math.min(3, Math.ceil(cameras / 2)),
      concurrentRank2Rooms: 1,
    };
  };
  const feed = (kind, tt) => director.feed({ kind, subjectId: 'runner', t: tt, camerasUnlocked: cameras, world: worldNow() });

  hunter.onCommit = () => feed('hunter_commit', simT);
  hunter.onDoor = () => feed('progress', simT);
  hunter.onStage = () => feed('progress', simT);

  const terminal = room.anchor(EXP.TERMINAL_AT[wing]);
  let rooms = EXP.roomGate(EXP.ROOM_SETTLE), loud = EXP.rateGate(EXP.NOISE_GAP);
  let lastRoom = null, lastState = null, outcome = null, simT = 0, clock = EXP.EXPEDITION_SECONDS;
  let detent = 0;
  const frames = [];

  for (let i = 0; i < Math.round(EXP.EXPEDITION_SECONDS / DT) && !outcome; i++) {
    simT = i * DT; clock -= DT;
    const hops = room.pathPortals(player.pos, terminal, 0.6, 1.9);
    const leg = EXP.hopWaypoint(room, hops, player.pos) ?? { x: terminal.x, z: terminal.z };
    const heading = Math.atan2(leg.x - player.pos.x, leg.z - player.pos.z);
    const d = Math.hypot(terminal.x - player.pos.x, terminal.z - player.pos.z);
    detent = d > 9 ? 3 : d > 3.5 ? 2 : d > EXP.TERMINAL_REACH ? 1 : 0;
    player.aimYaw = heading;
    player.update(DT, simT, { ...EXP.detentInputFor(detent), aimYaw: heading, aimPitch: 0 });
    room.update(DT);
    if (player.noise > 0) noise.emit(player.pos, player.noise, 'move');
    noise.update(DT);
    hunter.update(DT, simT);

    const here = room.spaceAt(player.pos)?.id ?? null;
    const arrived = rooms(here, simT);
    if (arrived) { lastRoom = arrived; feed('place', simT); }
    if (loud(simT, player.noise > 0.55)) feed('noise', simT);
    const hs = hunter.state;
    if (hs !== lastState) {
      lastState = hs;
      const ev = EXP.tellFor(hs, simT);
      if (ev) feed(ev.kind, simT);
    }
    if (contract) director.drive(EXP.runnerHasInput(detent), simT);
    director.tick(simT);

    let cur = director.current();
    let shot = cur ? solve(cur.shotId, { subjectId: cur.subjectId, probe: rig.probe }) : null;
    if (cur && !shot) {
      director.refuse(simT);
      cur = director.current();
      shot = cur ? solve(cur.shotId, { subjectId: cur.subjectId, probe: rig.probe }) : null;
      if (!shot) shot = solve('BODYCAM', { subjectId: 'runner', probe: rig.probe });
    }
    // ...and the view's last resort, for the frames before the Director has chosen anything.
    if (!shot) shot = solve('BODYCAM', { subjectId: 'runner', probe: rig.probe });
    const applied = shot ? rig.apply(shot) : false;
    frames.push({
      driving: EXP.runnerHasInput(detent),
      shotId: shot?.shotId ?? null,
      subjectId: cur?.subjectId ?? 'runner',
      drivable: !!shot && DRIVABLE_IDS.has(shot.shotId) && (cur?.subjectId ?? 'runner') === 'runner',
      applied,
    });
    if (Math.hypot(player.pos.x - terminal.x, player.pos.z - terminal.z) < EXP.TERMINAL_REACH) outcome = 'lit';
    else if (clock <= 0) outcome = 'held';
  }
  /**
   * ...and `aftermath()`: the runner has finished, nobody is steering, and §3.3's permitted window
   * is open. This is where a show gets its cutaways back, so it is measured rather than assumed.
   */
  const cutsAtEnd = director.visibleCuts().length;
  feed('terminal', simT);
  for (let i = 0; i < Math.round(6 / DT); i++) {
    const tt = simT + i * DT;
    if (contract) director.drive(false, tt);
    director.tick(tt);
    let cur2 = director.current();
    let sh = cur2 ? solve(cur2.shotId, { subjectId: cur2.subjectId, probe: rig.probe }) : null;
    if (cur2 && !sh) { director.refuse(tt); cur2 = director.current(); sh = cur2 ? solve(cur2.shotId, { subjectId: cur2.subjectId, probe: rig.probe }) : null; }
    if (sh) rig.apply(sh);
  }
  const afterCuts = director.visibleCuts().slice(cutsAtEnd);

  const driving = frames.filter((f) => f.driving);
  const bad = driving.filter((f) => !f.drivable);
  const shots = {};
  for (const f of driving) shots[f.shotId ?? 'none'] = (shots[f.shotId ?? 'none'] ?? 0) + 1;
  return {
    wing, cameras, contract, outcome, frames: frames.length, driving: driving.length,
    badFrac: driving.length ? bad.length / driving.length : 0,
    frozen: driving.filter((f) => !f.applied).length / Math.max(1, driving.length),
    shots, cuts: cutsAtEnd,
    afterCuts: afterCuts.length,
    afterFillers: afterCuts.filter((c) => !DRIVABLE_IDS.has(c.shotId)).length,
  };
}

const CASES = [
  { wing: 'gallery', cameras: 1 }, { wing: 'gallery', cameras: 3 },
  { wing: 'ballroom', cameras: 3 }, { wing: 'study_e', cameras: 3 },
];
const held = CASES.map((c) => segment({ ...c, contract: true }));
const loose = CASES.map((c) => segment({ ...c, contract: false }));
const pctf = (x) => `${(x * 100).toFixed(1)}%`;

console.log('       wing      cams │ non-drivable while driving │ frozen camera');
for (let i = 0; i < CASES.length; i++) {
  console.log(`       ${held[i].wing.padEnd(9)} ${String(held[i].cameras).padStart(4)} │ shipped ${pctf(loose[i].badFrac).padStart(6)}  →  held ${pctf(held[i].badFrac).padStart(6)} │ ${pctf(loose[i].frozen)} → ${pctf(held[i].frozen)}`);
}

// ---------------------------------------------------------------- C0 · the arm
{
  t('C0 arm · real segments were driven, with the runner actually driving for most of them',
    held.every((r) => r.driving > 200) && loose.every((r) => r.driving > 200),
    held.map((r) => `${r.wing}/${r.cameras}cam ${r.driving} driving frames of ${r.frames}, ${r.outcome}`).join(' · '));
  t('C0b arm · and both arms are the same house, the same seed and the same runner',
    held.every((r, i) => r.frames === loose[i].frames && r.driving === loose[i].driving),
    'only the `director.drive()` call differs between them');
}

// ---------------------------------------------------------------- C1 · the contract
{
  t('C1 · while the runner has input, the frame is always one they can drive by',
    held.every((r) => r.badFrac === 0),
    held.map((r) => `${r.wing}/${r.cameras}cam ${pctf(r.badFrac)}`).join(' · '));

  t('C1b · and the camera is never frozen on them — a card moves no camera at all',
    held.every((r) => r.frozen === 0),
    `${pctf(Math.max(...held.map((r) => r.frozen)))} worst · `
    + `shipped ${pctf(Math.max(...loose.map((r) => r.frozen)))}`);

  t('C1c · every shot that airs while driving is behind-and-above the RUNNER, not the Hunter',
    held.every((r) => Object.keys(r.shots).every((id) => DRIVABLE_IDS.has(id))),
    held.map((r) => `${r.wing}/${r.cameras}: ${Object.entries(r.shots).map(([k, v]) => `${k}×${v}`).join(' ')}`).join(' · '));

  /**
   * 🚨 **THE COST, STATED RATHER THAN HIDDEN, BECAUSE IT IS LARGE.** With the contract held there
   * is exactly ONE drivable shot available — `WORK` is the other, and `worldNow()` hardcodes
   * `subjectWorking: false` because the runner has no work verb yet — so a driving segment is a
   * single continuous BODYCAM and the visible-cut count collapses to 1. That is §2 in its own
   * words (*"one subject, forever … the seams are held by lower thirds, confessional cutaways and
   * chat. Deliberately thin"*) and it is what §3.3 asks for, but it is not free: §1.3's 12-22
   * cuts/min target is unreachable DURING a drive, by construction.
   *
   * Two things make that liveable and both are measured. The aftermath is a real window and the
   * budget is spendable in it (C1e). And BODYCAM is a boom that follows, not a locked wide — the
   * frame `MAX_HOLD` exists to break up. The headroom is `WORK`: the moment the runner has a verb
   * and `subjectWorking` is answered honestly, there are two drivable angles and the arbiter can
   * cut between them without ever leaving the runner.
   */
  t('C1d · the cost is one continuous drivable frame per drive, which is what the contract asks for',
    held.every((r) => r.cuts === 1) && loose.every((r) => r.cuts > held[0].cuts),
    `held ${held.map((r) => r.cuts).join('/')} visible cuts while driving vs ${loose.map((r) => r.cuts).join('/')} shipped`);

  t('C1e · and the cutaway comes back in the aftermath, which is the window §3.3 permits',
    held.every((r) => r.afterCuts > 0) && held.some((r) => r.afterFillers > 0),
    held.map((r) => `${r.wing}/${r.cameras}: ${r.afterCuts} cuts after the take, ${r.afterFillers} of them off the runner`).join(' · '));
}

// ---------------------------------------------------------------- C2 · the control
{
  t('C2 control · do not tell the Director, and the runner is driving blind for a fifth to a third of the segment',
    loose.every((r) => r.badFrac > 0.15) && loose.some((r) => r.badFrac > 0.30),
    loose.map((r) => `${r.wing}/${r.cameras}cam ${pctf(r.badFrac)}`).join(' · '));

  const g1 = loose.find((r) => r.wing === 'gallery' && r.cameras === 1);
  const g3 = loose.find((r) => r.wing === 'gallery' && r.cameras === 3);
  t('C2b control · and it gets WORSE with every camera the crew earns, which is the wrong direction',
    g3.badFrac > g1.badFrac,
    `gallery at 1 camera ${pctf(g1.badFrac)} → at 3 cameras ${pctf(g3.badFrac)} — unlocking widens the pool the arbiter scores`);

  t('C2c control · the frames it spends there are cards and cameras, by name',
    loose.some((r) => Object.keys(r.shots).some((id) => isFiller(id) || id === 'STATIC' || id === 'STING')),
    loose.map((r) => `${r.wing}/${r.cameras}: ${Object.entries(r.shots).filter(([k]) => !DRIVABLE_IDS.has(k)).map(([k, v]) => `${k}×${v}`).join(' ') || '—'}`).join(' · '));

  t('C2d control · and a card genuinely freezes the camera rather than merely misframing it',
    loose.some((r) => r.frozen > 0),
    `director-rig.apply() returns false for kind:'card' · worst ${pctf(Math.max(...loose.map((r) => r.frozen)))} of driving frames on a dead pose`);
}

// ---------------------------------------------------------------- C3 · the library, by name
/**
 * The pool filter is only as good as the `drivable` flags, so those are held against what each
 * shot actually IS — a card, a fixed camera at a security FOV, or a boom on the Hunter — rather
 * than against a list this file wrote.
 */
{
  const byId = Object.fromEntries(SHOTS.map((sh) => [sh.id, sh]));
  const cards = SHOTS.filter((sh) => isFiller(sh.id)).map((sh) => sh.id);
  t('C3 · every seam filler is a card, and no card is drivable',
    cards.length >= 3 && cards.every((id) => !byId[id].drivable),
    `${cards.join(', ')} — `
    + `${cards.map((id) => `solve('${id}') → kind '${solve(id, { subjectId: 'runner', probe: { label: () => 'X' } }).kind}'`).join(', ')}`);

  t('C3b · STATIC is "another camera" in §3.3\'s own words — a fixed security lens, not the boom',
    !byId.STATIC.drivable && FOV.STATIC < FOV.BODYCAM,
    `STATIC ${FOV.STATIC}° from a bracketed corner vs BODYCAM ${FOV.BODYCAM}° over the shoulder`);

  t('C3c · STING is framed on the Hunter, so it can never be the runner\'s view',
    !byId.STING.drivable
    && solve('STING', { subjectId: 'runner', probe: { pose: () => null, sites: () => [], sees: () => false, label: () => 'X' } }) === null,
    'the solver takes the hunter id, never the subject the arbiter chose');

  t('C3d · and BODYCAM is drivable and always available, so the narrowed pool is never empty',
    byId.BODYCAM.drivable && byId.BODYCAM.needs({}) === true
    && poolFor(4, { runnerDriving: true, camerasUnlocked: 3, subjectInStaticFrustum: true, hunterInStaticFrustum: true, cutawayBudget: 3 }).length >= 1,
    `driving pool at rank 4 with everything unlocked: ${poolFor(4, { runnerDriving: true, camerasUnlocked: 3, subjectInStaticFrustum: true, hunterInStaticFrustum: true, cutawayBudget: 3 }).map((sh) => sh.id).join(', ')}`);

  t('C3 control · with `runnerDriving` off, the same call returns the whole live library',
    poolFor(4, { runnerDriving: false, camerasUnlocked: 3, subjectInStaticFrustum: true, hunterInStaticFrustum: true, cutawayBudget: 3 }).length
      > poolFor(4, { runnerDriving: true, camerasUnlocked: 3, subjectInStaticFrustum: true, hunterInStaticFrustum: true, cutawayBudget: 3 }).length,
    `parked: ${poolFor(4, { runnerDriving: false, camerasUnlocked: 3, subjectInStaticFrustum: true, hunterInStaticFrustum: true, cutawayBudget: 3 }).map((sh) => sh.id).join(', ')}`);
}

// ---------------------------------------------------------------- C4 · coming back is immediate
/**
 * *"Must never cut away while the runner has input"* is also "must not still be away when the
 * input arrives". A card that had to wait out `MAX_HOLD` would leave the runner driving blind for
 * up to six seconds after they push the stick.
 */
{
  const d = createDirector({ world: {} });
  const w = { camerasUnlocked: 3, cutawayBudget: 3, subjectInStaticFrustum: true, hunterInStaticFrustum: true };
  d.feed({ kind: 'place', subjectId: 'runner', t: 0, camerasUnlocked: 3, world: w });
  // Park the runner and let the Director wander off onto whatever it likes.
  d.drive(false, 0);
  for (let i = 1; i <= 40; i++) d.tick(i * 0.5, w);
  const away = d.current();
  d.drive(true, 20.1);
  const back = d.current();
  t('C4 · pushing the stick cuts back to a drivable frame on the same frame',
    DRIVABLE_IDS.has(back.shotId),
    `parked on ${away.shotId} → driving on ${back.shotId}, at t=20.1 with MAX_HOLD 6.0 s`);
  {
    const q = createDirector({ world: {} });
    q.drive(false, 0);
    q.feed({ kind: 'place', subjectId: 'runner', t: 0, camerasUnlocked: 3, world: w });
    q.feed({ kind: 'noise', subjectId: 'runner', t: 0.1, camerasUnlocked: 3, world: w });  // pre-empts, defers the first
    const parked = q.current().shotId;
    q.drive(true, 0.2);
    for (let i = 1; i <= 30; i++) q.tick(0.2 + i * 0.5, w);
    // Everything that STARTED at or after the push. What was already on air before it is the
    // parked window's business and is allowed to have been a card or a fixed camera.
    const since = q.cuts().concat([q.current()]).filter((c) => c && c.startedAt >= 0.2);
    t('C4b · and nothing non-drivable airs after the stick is pushed, however it got queued',
      since.length > 0 && since.every((c) => DRIVABLE_IDS.has(c.shotId)),
      `parked on ${parked} · after the push: ${[...new Set(since.map((c) => c.shotId))].join(', ')} over ${since.length} takes`);
    t('C4b control · and the parked window really did put a non-drivable shot up first',
      !DRIVABLE_IDS.has(parked),
      `${parked} was legitimately chosen while nobody was steering — the filter is on the window, not on the shot`);
  }
}

// ---------------------------------------------------------------- C5 · the view is what calls it
/**
 * Everything above is `director.js`'s and would hold whether or not anything told it. This is the
 * half that says `views/expedition.js` does — and the control is `views/game.js`, a real file
 * with a real Director in it that has no runner on a phone and therefore no such call.
 */
{
  const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const exp = strip(readFileSync(new URL('../src/views/expedition.js', import.meta.url), 'utf8'));
  const game = strip(readFileSync(new URL('../src/views/game.js', import.meta.url), 'utf8'));
  const call = /director\.drive\(/;
  t('C5 · `views/expedition.js` tells the Director whether the runner has input, every frame',
    call.test(exp) && /director\.drive\(runnerHasInput\(detent\), t\)/.test(exp),
    'director.drive(runnerHasInput(detent), t) before director.tick(t)');
  t('C5b · and releases the frame in the aftermath, when nobody is steering any more',
    /director\.drive\(false, t\)/.test(exp), 'the one window §3.3 permits a cutaway in');
  t('C5 control · and the same scan finds no such call in `views/game.js`, which has no phone',
    !call.test(game), 'the survival mode\'s player is at the keyboard in front of the same screen');
}

console.log(`\ndrivable-frame: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
