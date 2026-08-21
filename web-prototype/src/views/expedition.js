import * as THREE from 'three';
import { estate } from './_studio.js';
import { WallField } from '../destruction/wall.js';
import { DebrisSystem } from '../destruction/debris.js';
import { DustSystem } from '../destruction/dust.js';
import { LimbField, SOCKET_LIMB } from '../game/limbs.js';
import { Player } from '../game/player.js';
import { WeaponSystem } from '../game/weapons.js';
import { HunterAI } from '../game/hunter-ai.js';
import { buildTestRoom } from '../game/room.js';
import { makeLightRig } from './game.js';
import { PANELS } from '../game/spaces.js';
import { NoiseBus } from '../game/noise.js';
import { MOVE } from '../game/rules.js';
import { DETENT } from '../party/darkrun.js';
import { createDirector } from '../party/director.js';
import { solve } from '../party/shots.js';
import { createLowerThirds } from '../party/captions.js';
import { rankOf } from '../party/director.js';
import { initAudio, setHunterThreat, playDoorBang, playWallStage, playFurnBreak } from '../audio/audio.js';
import { createRig } from '../game/director-rig.js';
import { createBroadcast } from '../ui/broadcast.js';
import { ROOMS } from '../party/coverage.js';
import { camerasNeeded } from '../party/win.js';

/**
 * 🏚️ **PARTY.EXPEDITION — the ninety seconds in the house, on the television.**
 *
 *   ?view=party.expedition                    solo, keyboard, for looking at it
 *   ?view=party.expedition&join=ws://ip:5183  the real thing: driven by a phone
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT THIS REPLACES
 * ---------------------------------------------------------------------------------------------
 * M3 stubbed the expedition: the guide called CLEAR or HOLD, the runner tapped GO or WAIT, and
 * `session.js` decided the outcome by comparing two room names. Everything the mode rests on was
 * being asserted rather than played — that a robot can outrun the Hunter and cannot do it
 * quietly, that a guide with no camera genuinely does not know, that a wrong call and a lie look
 * identical from the sofa. This is those ninety seconds actually happening.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE TELEVISION SIMULATES. THE SERVER ADJUDICATES. IT IS NOT A DEMOTION OF THE SERVER.
 * ---------------------------------------------------------------------------------------------
 * Physics, the Hunter and the house run here, because there is exactly one screen showing them
 * and no second client to disagree with. What this process never learns is who anybody IS: it is
 * sent a runner id, a wing and a camera count, and it reports back positions and events. Roles,
 * alignments and the coverage gate stay on the server, where `project()` is. So the TV is
 * authoritative about **where a robot is** and knows nothing about **what a robot is** — and
 * `show-wire` X4 already asserts the second half over the wire.
 *
 * 🚨 THE CAMERA BELONGS TO THE DIRECTOR, NOT TO THE RUNNER. There is no third-person follow here.
 * Under D1 six of eight players are watching television and nothing else, so the shot is chosen
 * by `director.js`, framed by `shots.js` and applied by `director-rig.js`. A follow-cam would be
 * a different game — and a much worse one to watch.
 *
 * 🚨 THERE IS NO FLYOVER IN THIS FILE AND THERE MUST NEVER BE. `rrr-broadcast.md` §6.1 puts the
 * guide's map under *Do not* in its own words. The TV emits marks; the SERVER decides which of
 * them the guide has earned; the guide's PHONE draws them. Three processes, and the television is
 * not one of the two that can see the Hunter on a map.
 */

/** Where the terminal stands in each of the six spaces. `room.anchor` owns the coordinates. */
export const TERMINAL_AT = Object.freeze({
  ballroom: 'ballroom.centre', gallery: 'gallery.east', study_w: 'study_w.north',
  study_e: 'study_e.north', service: 'service.mid', chapel: 'chapel.centre',
});

/**
 * ⏱️ **TWO GATES, BECAUSE A BUS EVENT PER FRAME IS NOT AN EVENT.**
 *
 * Measured over a wired 90 s expedition: **926-5398 `noise` events and 3450 `place` events**. The
 * noise test is `player.noise > 0.55` evaluated every frame, so a runner holding RUN emits sixty a
 * second; and `place` fires on `here !== lastRoom`, which a runner standing IN a doorway satisfies
 * every other frame as `spaceAt` flips between the two rooms it joins. That second one is not just
 * noise on the bus — the same branch calls `lightRig.snapTo`, so **straddling a doorway relit the
 * whole house at 60 Hz**.
 *
 * `rateGate` is the rising-edge limiter; `roomGate` refuses to believe a room change until the new
 * room has held for a moment. Both pure and exported, so `expedition-wire` can hold the rates
 * against a synthetic 90 seconds without a GPU.
 */
export const NOISE_GAP = 1.2;     // seconds between `noise` events from a running robot
export const ROOM_SETTLE = 0.35;  // how long a new room must hold before it counts as arriving

export function rateGate(gap) {
  let last = -Infinity;
  return (t, open = true) => {
    if (!open) return false;
    if (t - last < gap) return false;
    last = t;
    return true;
  };
}

export function roomGate(settle) {
  let cand = null, since = 0, held = null;
  return (room, t) => {
    if (room === held || room == null) { cand = null; return null; }
    if (room !== cand) { cand = room; since = t; return null; }
    if (t - since < settle) return null;
    held = room;
    cand = null;
    return room;
  };
}

/**
 * 🛰️ **THE SIMULATOR'S BRIEF, READ.** `show.mjs` sends `{t:'brief', wing, cameras, worldSeed,
 * episode}` on connect and at the top of every expedition, and the view's socket handler had no
 * branch for it — `wing` was bound once from a query string and never reassigned, so the runner
 * drove to the wrong room's terminal and the lower third named the wrong room.
 *
 * Pure and exported so `expedition-wire` E11 can take a brief off a REAL show and prove this
 * recovers what the server put in it, without a GPU. Anything malformed is dropped rather than
 * applied: a brief is the only message that can move the whole segment, and half of one is worse
 * than none.
 */
export function readBrief(b = {}) {
  const out = {};
  if (typeof b.wing === 'string' && ROOMS.includes(b.wing)) out.wing = b.wing;
  if (Number.isInteger(b.cameras)) out.cameras = Math.max(1, b.cameras);
  if (Number.isFinite(b.episode)) out.episode = b.episode;
  if (Number.isFinite(b.worldSeed)) out.worldSeed = b.worldSeed;
  return out;
}

/**
 * `hunter-ai.js`'s state ladder, mapped onto `director.js`'s closed list of kinds. **Absent means
 * silent**, and the absences are the load-bearing half: PATROL is nothing happening, BREACH and
 * GROW announce themselves through their own authored hooks rather than through a state
 * comparison, and SEARCH is the state where it is GIVING UP — `hunter-ai.js:711` enters it when
 * awareness has fallen below `alertAt` and it is sweeping a last known point. Captioning that
 * "SOMETHING HEARD THAT", as this did, told the room the opposite of what had happened.
 *
 * 🚨 AND PURSUE IS ABSENT BECAUSE THE COMMITMENT IS A LATCH, NOT A STATE TEST. `_commitStep`
 * spends a page of comments on exactly this: PURSUE is entered and left on hysteresis, so *"a
 * hunter losing and regaining sight through a colonnade crosses that boundary repeatedly inside
 * one chase"* and re-announcing it *"is how a warning becomes wallpaper"*. `onCommit` fires ONCE,
 * the frame it stops considering and starts coming, and that is what carries `hunter_commit`.
 */
export const TELL_FOR_STATE = Object.freeze({
  ALERT: 'hunter_alert', STALK: 'hunter_alert',
  ATTACK: 'grab',
});

/**
 * 🚨 **EVERY HUNTER TELL IS AN EVENT ABOUT THE RUNNER.** The Hunter is what happened; the runner
 * is who it happened to, and who the audience is watching while it does. Feeding these with
 * `subjectId: 'hunter'` put a shoulder camera on the monster for 82% of a 90-second expedition.
 * Exported with the table so `expedition-wire` can hold the whole mapping — kind AND subject —
 * without a browser.
 */
export const tellFor = (state, t, runnerId = 'runner') => {
  const kind = TELL_FOR_STATE[state];
  return kind ? { kind, subjectId: runnerId, t } : null;
};

/**
 * 🎚️ **ONE DETENT, AS A STICK.** `darkrun.js` owns the four speeds; this is the only place one of
 * them becomes an input, and it is the only place a top speed is chosen.
 *
 * 🚨 **A DETENT IS A FRACTION OF A TOP SPEED AND `_stepGround` APPLIES IT ONCE.** It used to apply
 * it twice — the direction vector already carries the stick's magnitude and the scale multiplied by
 * it again — so this returned 0.353 for CREEP and the body delivered 0.353². Exported so
 * `dark-run` D4 can drive the real `Player` with the real ladder rather than asserting
 * `darkrun.js`'s table against `darkrun.js`'s table, which is how three years of a factor of three
 * went unnoticed.
 */
export function detentInputFor(detent) {
  const d = DETENT[detent];
  if (!d || d.speed <= 0) return { move: { x: 0, y: 0 }, run: false };
  const top = d.speed > MOVE.walk ? MOVE.run : MOVE.walk;
  return { move: { x: 0, y: Math.min(1, d.speed / top) }, run: d.speed > MOVE.walk };
}

/**
 * 🚪 **HOW FAR BEYOND A DOORWAY THE WAYPOINT SITS.** Far enough that the runner is never standing
 * on its own target — `atan2(~0, ~0)` is what put the first draft in a jitter in the opening.
 */
export const HOP_BEYOND = 1.5;

/**
 * 🧭 **THE WAYPOINT THE SOLO DIRECTOR STEERS AT — AND ITS SIDE COMES FROM THE DOORWAY, NEVER FROM
 * THE RUNNER.**
 *
 * That one word is the whole of the bug the solo director's header used to blame on collision at
 * D4. `side = sign((pos − c) · n)` inverts the instant the body crosses the portal plane, so the
 * waypoint jumps 3 m back the way it came; `spaceAt`'s padded rects overlap by 0.9 m either side
 * of a doorway and the first-declared rect wins, so the hop keeps being re-offered and the robot
 * oscillates in the opening for the whole segment. Deriving the far side from the ROOMS THE
 * DOORWAY JOINS makes the sign a property of the house rather than of the body, so there is
 * nothing left to invert.
 *
 * The `cur` walk is what lets a hop that cannot be oriented from where the runner is standing fall
 * through to one that can, rather than poisoning the stick: each hop's far room becomes the near
 * room of the next, which is the sequence `pathPortals` returned in the first place.
 *
 * Pure, and takes the room rather than closing over one, so `door-hop` can drive it against the
 * built house. Returns `null` when there is no doorway left between here and the target — steer at
 * the terminal.
 *
 * @param {object} room   the built room: `spaceAt`, `spaces`
 * @param {Array}  hops   `room.pathPortals(...)`
 * @param {{x:number,z:number}} pos
 * @returns {{x:number, z:number, via:string}|null}
 */
export function hopWaypoint(room, hops, pos) {
  let cur = room.spaceAt(pos)?.id ?? null;
  for (const h of hops ?? []) {
    const other = h?.a === cur ? h.b : h?.b === cur ? h.a : null;
    const sp = other ? room.spaces.find((s) => s.id === other) : null;
    /**
     * 🚨 THE PORTAL'S POSITION IS `centre`, A Vector3 — NOT `x`/`z`. `room.js:399-404` rebuilds
     * every connector into `{id, a, b, axis, w, h, kind, state, centre, normal}`; the raw
     * `PORTALS` spec in `spaces.js` has bare `x`/`z` and the built graph does not. Reading `h.x`
     * gets `undefined`, which becomes a NaN heading, a NaN velocity and a robot at NaN,NaN within
     * one frame — silently, with nothing thrown and nothing red.
     */
    const c = h?.centre, n = h?.normal;
    if (!sp || !c || !n || !Number.isFinite(c.x) || !Number.isFinite(c.z)) { cur = other ?? cur; continue; }
    const far = Math.sign(((sp.x0 + sp.x1) / 2 - c.x) * n.x + ((sp.z0 + sp.z1) / 2 - c.z) * n.z) || 1;
    return { x: c.x + n.x * far * HOP_BEYOND, z: c.z + n.z * far * HOP_BEYOND, via: h.id };
  }
  return null;
}

/**
 * 🦾 **THE FOUR SOCKETS A SHOW HAS TO PUT BACK, AND THE PAIR OF FUNCTIONS THAT DO IT.**
 *
 * Exported and taking the player as an argument rather than closing over one, for two reasons.
 * `views/game.js:421` learned the first the expensive way — a hand-written second list of sockets
 * is a second thing to forget to update, and the list it kept was missing `shoulderL`, *the first
 * one `_attack` takes*. So the loadout is READ OFF THE RIG at construction and never restated.
 *
 * The second is that `engine-take` K5 has to drive the shipped refit across five real episodes,
 * and a gate that reimplements the fix it is testing proves only that the gate can be written
 * twice. These two functions are the ones the view calls and the ones the gate calls.
 */
export const LOADOUT_SOCKETS = Object.freeze(['shoulderL', 'shoulderR', 'hipL', 'hipR']);

/** The round-start body, recorded from the rig itself. Call once, at construction. */
export function recordLoadout(player) {
  return LOADOUT_SOCKETS
    .map((s) => ({ socket: s, type: player.rig.sockets[s]?.type ?? 'empty' }))
    .filter((e) => e.type !== 'empty');
}

/**
 * Put that body back. Strip first, then fill — the two halves are a pair and the order matters:
 * the fill loop skips any socket that is not empty, which is only safe once the strip has
 * verified by IDENTITY that whatever is still fitted is the right part in the right socket.
 * (A part scavenged into the wrong side reads `'limb'` on both hips for ever; `game.js`'s
 * `stripToLoadout` note has the full census.)
 *
 * @returns {number} how many sockets were touched — 0 on an undamaged runner, the normal case.
 */
export function refitLoadout(player, loadout) {
  let changed = 0;
  for (const s of LOADOUT_SOCKETS) {
    const c = player.rig.sockets[s];
    if (!c || c.type === 'empty') continue;
    if (c.type === 'limb' && c.item?.root === player.unit.limbs[SOCKET_LIMB[s]]) continue;
    // `voluntary` because this is not a wound — unlisted, the trauma response fires on the reset.
    player.rig.detach(s, { voluntary: true });
    changed++;
  }
  for (const e of loadout) {
    if (player.rig.occupant(e.socket) !== 'empty') continue;
    player.rig.refit(e.socket);
    changed++;
  }
  return changed;
}

/** How close counts as reaching it. A robot's arm, not a pixel. */
export const TERMINAL_REACH = 2.2;
/** `phases.js` SECONDS[EXPEDITION]. Restated nowhere — see `EXPEDITION_SECONDS` below. */
export const EXPEDITION_SECONDS = 90;

export default async function view(args = {}) {
  const qs = new URLSearchParams(location.search);
  const engine = await estate({
    cameraPos: [0, 1.6, 8.0], target: [0, 1.2, 3.0], fov: 66, far: 90,
    orbit: false, envIntensity: 3.20,
  });
  const scene = engine.scene;
  const rng = engine.rng;

  // ---------------------------------------------------------------- the house
  const wallField = new WallField({ authority: true });
  const room = await engine.work(buildTestRoom(engine, { wallField, panels: PANELS }));
  scene.add(room.root);

  /**
   * 💡 THE SAME FIVE LIGHTS `game.play` USES, REPOSITIONED PER SPACE BY ITS OWN RIG.
   * `estate()` lights the world, but the interior key, the two practicals, the cool rim and the
   * hemisphere are `game.js`'s and they are what make a dark room read as a room rather than as
   * absence. Without them the feed is not moody, it is black — which is exactly what the first
   * probe screenshot showed under a perfectly correct broadcast overlay.
   */
  const key = new THREE.SpotLight(0xffdcb4, 150, 34, 0.88, 0.62, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(engine.quality.shadowMap, engine.quality.shadowMap);
  key.shadow.camera.near = 0.6; key.shadow.camera.far = 34;
  key.shadow.bias = -0.0009; key.shadow.normalBias = 0.03;
  const warmA = new THREE.PointLight(0xffb271, 18, 13, 2);
  const warmB = new THREE.PointLight(0x6f8fbe, 42, 24, 2);
  const cool = new THREE.PointLight(0xa8ccf4, 46, 10, 2);
  const fill = new THREE.HemisphereLight(0x6f7d96, 0x3a2a1c, 4.60);
  scene.add(key, key.target, warmA, warmB, cool, fill);
  const lightRig = makeLightRig({ key, warmA, warmB, cool, fill });

  const limbField = new LimbField(scene, { rng, floorY: room.floorY, bounds: room.bounds });
  const debris = new DebrisSystem(scene, { perKind: Math.round(110 * engine.quality.particles), floorY: room.floorY, rng });
  const dust = new DustSystem(scene, { max: Math.round(120 * engine.quality.dust), rng, color: 0xb0a794 });
  const weapons = new WeaponSystem({ scene, room, limbField, debris, dust, rng });

  // ---------------------------------------------------------------- the runner
  let avatar = null;
  try {
    const { unit4hMaterials } = await import('../materials/surfaces/robot.js');
    const { createMeshAvatar } = await import('../characters/mesh-avatar.js');
    avatar = await createMeshAvatar({ height: 1.7, materials: unit4hMaterials({}) });
  } catch (e) {
    console.error('[expedition] mesh avatar failed; procedural fallback', e);
  }
  const player = new Player({ scene, world: room, field: limbField, rng, id: 'runner', avatar });
  player.pos.copy(room.spawn.player[0]);
  player.facing = Math.PI;
  lightRig.snapTo(room.spaceAt(player.pos) ?? room.spaces[0]);

  /**
   * 🦾 **THE RUNNER'S BODY IS PUT BACK BETWEEN EPISODES, AND IT NEVER WAS — SO A SHOW ENDED WITH
   * AN IMMOBILE, IMMORTAL ROBOT ON THE BALLROOM FLOOR, REPORTED AS A CLEAN HOLD.**
   *
   * The house is loaded once and plays every episode (see `arm()`), and `arm()` re-armed the
   * clock, both positions, the Director, the caption memory and the Hunter's combat state — and
   * never touched `player.rig`. `_attack` takes sockets in the fixed order `armL, armR, legL,
   * legR`, one per episode, so a show degrades on a ratchet nothing releases:
   *
   *   after 1 take   armL gone
   *   after 2        both arms gone
   *   after 3        `gait: 'limp'`, `canRun: false`, top speed 1.12 m/s — SLOWER than a stage-1
   *                  Hunter at 2.05, so the runner can no longer outrun it, which is
   *                  `darkrun.js`'s entire trade
   *   after 4        `gait: 'down'`, and `Player.update` zeroes the velocity: the phone is inert
   *
   * 🚨 **AND THEN IT BECOMES IMMORTAL.** With every socket empty, `_attack` finds no socket and
   * its `if (!socket) return;` fires BEFORE `this.onKill?.()` — and `onKill` is this mode's only
   * death test. Measured headless: a committed Hunter, 90 s, 0.40 m separation, a limbless runner
   * holding RUN — **0 kills, 0.0 s of ATTACK, 0.00 m travelled**. Every later expedition ends
   * `'held'`, which `session.js` grades as the guide having held correctly. The show reports a
   * clean hold while the Hunter stands on the robot.
   *
   * `views/game.js:421` has had the answer since the skates bug: record the loadout ONCE from the
   * rig itself rather than restating it as a list, then strip-and-restore. There are no gadgets
   * and no skates in this mode — the runner is the plain two-armed UNIT-4H — so the strip is the
   * identity check alone, and `LimbRig.refit()` rebuilds from `unit.limbs`, the one reference a
   * detach cannot invalidate (including a part the Hunter has absorbed and shrunk into its
   * shoulder).
   *
   * `engine-take` K5 drives four takes through the real Hunter and asserts the fifth still ends
   * `'taken'`; K5's control removes this call and watches the fifth come back `'held'`.
   */
  const LOADOUT = recordLoadout(player);
  const refitRunner = () => refitLoadout(player, LOADOUT);

  const playerBody = {
    root: player.root, rig: player.rig, height: player.height, radius: player.radius,
    get noise() { return player.noise; },
  };
  weapons.addBody(playerBody);

  // ---------------------------------------------------------------- the Hunter
  const noise = new NoiseBus();
  const hunter = new HunterAI({
    room, scene, rng, debris, dust, weapons,
    position: room.spawn.hunter.clone(), noise, bangPolicy: 'auto',
  });
  hunter.setTargets([playerBody]);
  /**
   * 🚨 **THE HUNTER'S OWN KILL ENDS THE EXPEDITION. `taken.js:27` SAID THIS WAS ALREADY WIRED AND
   * NOTHING HAD EVER SUBSCRIBED TO IT** — *"`_attack` calls `this.onKill?.(c, socket, item)` at
   * L1116. The party room subscribes there and applies the rule"*. `grep -rn onKill src/views/
   * src/party/` found exactly one hit and it was that sentence.
   *
   * What decided a take instead was `contact < 1.35`, a distance test in the loop below, and the
   * Hunter cannot get that close: `hunter-ai.js:692` enters ATTACK at
   * `seenD < reach * (stage*0.35 + 0.8)` and `_attack` immediately damps `vel` — it stops where
   * it is and swings, because `WEAPON_RANGE.hunterSlam` is 2.4 m and it is *built* to kill from
   * arm's length. Measured across three stages and three runner behaviours: minimum contact
   * **2.11-2.17 m** whenever the runner is not actively walking into it. So a runner who stood
   * still while the Hunter took all four of its limbs finished the segment `'held'`.
   *
   * ⚠️ AND RAISING THE THRESHOLD IS THE WORSE FIX, WHICH IS WHY IT IS NOT THE ONE HERE.
   * `hunter-ai.js:76-89` spends a page arguing that a kill must be *"something the player watched
   * coming and failed to answer"* — entering reach starts an `ATTACK_WINDUP` of 0.85 s, and
   * stepping out of reach inside it means the swing lands on nothing. A distance test races that
   * windup and wins: in the one staging where 1.35 m *did* fire, it fired 0.32-0.83 s after the
   * first ATTACK, so the anticipation the AI is built around never completed. Subscribing to the
   * kill means the take lands exactly when the arm does, in every staging, and the reaction
   * window is the AI's rather than a number in this file. `engine-take` K1-K3 measures both.
   */
  let simT = 0;
  hunter.onKill = () => finish('taken', simT);
  /**
   * ⚠️ `hunter.body` IS A FRESH OBJECT EVERY CALL AND CARRIES NO POSITION. `hunter-ai.js:275` is
   * `get body() { return { root, rig: null, height, radius, hunter } }` — a descriptor for the
   * weapon system, allocated per access. The position lives on `hunter.root`. Reading
   * `hunter.body.position` throws, and because it was inside `onUpdate` it threw on every frame,
   * killed the rAF loop, and left `settle()` hanging for ever — which from outside looks exactly
   * like a slow software renderer rather than a broken view. Cost me three probe runs.
   */
  weapons.addBody(hunter.body);

  // ---------------------------------------------------------------- the broadcast
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:20';
  document.body.appendChild(overlay);
  /**
   * 🚨 `?chrome=feed` — THIS VIEW IS THE PICTURE INSIDE SOMEBODY ELSE'S TELEVISION.
   * `net/party/show-tv.html` composites this page in as a frame during EXPEDITION and already
   * carries §4's permanent furniture: the show bug, the camera wall, the segment clock and the
   * nameplate rail, all drawn from the frame the SERVER projected for the TV. This process is
   * never sent a roster — the sim's brief is four fields on purpose — so the rail here could only
   * ever be empty, and a second camera counter fed from a different quantity is how a television
   * ends up disagreeing with itself in front of eight people. The lower third and the shot bug
   * are the two things only this side knows, and they stay.
   */
  const EMBEDDED = qs.get('chrome') === 'feed';
  const bx = createBroadcast({ mount: overlay, furniture: !EMBEDDED });

  /**
   * ⚠️ THE DIRECTOR AND THE RIG ARE REBUILT PER EPISODE, NOT PER PAGE. §3's cutaway budget is
   * stated *"per expedition"*, and the camera roster is derived from the world seed the SERVER
   * chose — which this process does not learn until its first brief. Both are `let` for that
   * reason; every call site reaches through the binding rather than holding a copy.
   */
  let director = createDirector({ world: {} });
  let camerasUnlocked = Math.max(1, +(qs.get('cams') ?? 1));
  let worldSeed = +(qs.get('seed') ?? 7);
  const subjects = () => ({
    runner: { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.facing, eyeHeight: player.eyeHeight },
    hunter: { x: hunter.root.position.x, y: hunter.root.position.y, z: hunter.root.position.z, yaw: 0, eyeHeight: hunter.height * 0.8 },
  });
  let rig = createRig({ camera: engine.camera, room, worldSeed, subjects, unlocked: () => camerasUnlocked });

  // ---------------------------------------------------------------- the expedition
  // Default to the gallery: it is the wing the solo director can actually reach — see its note.
  let wing = qs.get('wing') && ROOMS.includes(qs.get('wing')) ? qs.get('wing') : 'gallery';
  let terminal = room.anchor(TERMINAL_AT[wing]) ?? room.spawn.player[0].clone();
  let clock = EXPEDITION_SECONDS;
  let outcome = null;
  const state = {
    episode: +(qs.get('ep') ?? 1),
    pair: { runner: 'runner', guide: 'guide' },
    // 🚨 THE DENOMINATOR IS ASKED FOR, NEVER WRITTEN DOWN. This was a literal `3` — a fourth copy
    // of the camera objective, driving the camera wall `src/ui/broadcast.js` paints, while the
    // television next to it read a different number. `win.js` owns the target; the count is not on
    // the sim's brief (which is four fields on purpose), so this uses the flagship eight-player
    // row, which is also what `?cams` defaults against. `win-machine` W10c keeps the literal out.
    cameras: { unlocked: camerasUnlocked, needed: camerasNeeded(8) },
    players: [], expedition: { room: wing, outcome: null },
  };

  /**
   * ⚠️ THE THROTTLE IS DETENTED, AND THE DETENTS ARE `darkrun.js`'s, NOT NEW ONES. A continuous
   * stick lets a runner sit just under `HUNTER_SENSE.hearFloor` and cross 14 m of house in total
   * silence, which makes silence a winning strategy and breaks Task Contract T4. The detented
   * stick has no notch in that band — `dark-run` D4 asserts both halves.
   */
  let detent = 0;
  const detentInput = () => detentInputFor(detent);

  // Steering: the runner aims at a heading the phone sets. In solo it chases the terminal.
  let heading = player.facing;
  let leg = null;
  let soloLeg = null;                    // the waypoint the scripted runner is steering at
  const SOLO = !qs.get('join');
  if (SOLO) {
    /**
     * A scripted runner, so the view can be screenshotted and a look-critic sees a real
     * playthrough rather than a diorama. Same argument as `game.play`'s capture director.
     *
     * 🚨 IT ROUTES THROUGH DOORWAYS, BECAUSE STEERING STRAIGHT AT THE TERMINAL DOES NOT WORK.
     * The first version aimed at the target and held RUN; the probe showed it pinned against the
     * wall beside the service passage from t+1.7s, x stuck at -2.3, noise decaying as it slid.
     * `room.pathPortals` is the same BFS the Hunter routes on (`hunter-ai.js:374`) and it already
     * understands that a hole somebody dug is a door — so the demo walks the house the way the
     * house is actually connected.
     *
     * ⚠️ THIS IS THE SOLO DIRECTOR ONLY. A human runner steers with their own thumb and gets no
     * pathfinding; walking into a wall is allowed to be their problem, and being lost is part of
     * what the guide is for.
     *
     * ---------------------------------------------------------------------------------------
     * 🚨 **THIS HEADER USED TO BLAME COLLISION AT D4, AND IT WAS WRONG. THE BUG WAS IN THE
     * WAYPOINT RULE THREE LINES BELOW IT.**
     * ---------------------------------------------------------------------------------------
     * What it said: *"`?wing=ballroom` reaches D4 at z=-8.45, sits in the aperture and never
     * crosses … three separate steering fixes did not move it, which is what says the problem is
     * collision at that doorway and not this waypoint logic."* It is not collision. A body driven
     * straight through D1, D4, D5 and D6 at RUN, on-axis and at ±1.2 m, crosses every one of them
     * cleanly — measured, and the same four doors are what the Hunter's own BFS routes on all day.
     *
     * The real cause was the waypoint's SIGN. The rule was `side = sign((pos − c) · n)` — the side
     * the RUNNER is on — and the waypoint was placed on the opposite side of it. So the instant
     * the body crossed the portal plane the sign flipped, the waypoint teleported 3 m back the way
     * it came, and the robot turned round. It should then have escaped on the next frame, because
     * `pathPortals` drops a hop once the room changes — except that `spaceAt`'s padded rects
     * overlap by 0.9 m either side of a doorway and the FIRST matching rect wins, so `study_w`
     * keeps answering for 0.9 m past D4 and the hop keeps coming back. Stable oscillation at
     * z=-8.45, which is exactly the trace the old header read as a body being stopped by geometry.
     *
     * `?wing=gallery` worked only by accident of `SPACES` ORDERING: `gallery` is declared first,
     * so it wins its overlap with `study_w` and claims the runner 0.9 m BEFORE D1's plane — the
     * sign never gets the chance to flip. Four of the six wings had therefore never been driven
     * end to end, and the one that had was the one whose room happened to be listed first.
     *
     * ⚠️ **AND THE FIX THE OLD HEADER PROPOSED — "take the first hop that is actually somewhere
     * else" — IS NEITHER NECESSARY NOR SUFFICIENT, WHICH IS WHY IT IS NOT WHAT IS BELOW.** It was
     * built and measured, and it TRADES ONE WING FOR ANOTHER: it recovers the ballroom and loses
     * the gallery. Dropping the doorway underfoot leaves the runner steering at the TERMINAL while
     * still standing in the opening — which for the gallery is the wall beside D1, and for a
     * two-hop route (study_e, service) is back through the wall it just came through. Measured:
     * arrived at study_w and ballroom, stuck 19.4 m / 19.8 m / 10.0 m short in the other three.
     *
     * Orienting the waypoint from the DOORWAY rather than from the runner fixes all five drawable
     * wings, on-axis and at ±1.2 m, and it subsumes the skip — a point 1.5 m beyond an opening is
     * never a point you are standing on, which was the only reason to want one. `door-hop` H1-H4
     * drives all three rules through the same house.
     */
    engine.onUpdate(() => {
      {
        /**
         * ⚠️ RE-SOLVE EVERY FRAME RATHER THAN ON ARRIVAL. The earlier version only recomputed
         * within 1.4 m of its target, which is what let a stale waypoint stick. The BFS is cached
         * by (from, to, minW, minH) in `room.js`, so asking every frame costs a map lookup.
         */
        const hops = room.pathPortals(player.pos, terminal, 0.6, 1.9);
        leg = hopWaypoint(room, hops, player.pos) ?? { x: terminal.x, z: terminal.z, via: 'direct' };
      }
      const dx = leg.x - player.pos.x, dz = leg.z - player.pos.z;
      heading = Math.atan2(dx, dz);
      soloLeg = leg;
      const d = Math.hypot(terminal.x - player.pos.x, terminal.z - player.pos.z);
      detent = d > 9 ? 3 : d > 3.5 ? 2 : d > TERMINAL_REACH ? 1 : 0;
    });
  }

  // ---------------------------------------------------------------- the wire
  let sock = null;
  const send = (m) => { if (sock && sock.readyState === 1) sock.send(JSON.stringify(m)); };
  if (!SOLO) {
    sock = new WebSocket(qs.get('join'));
    sock.onmessage = (e) => {
      const m = JSON.parse(e.data);
      // 🚨 THE ONLY THING A PHONE MAY SEND INTO THE SIMULATION IS A HEADING AND A DETENT. Not a
      // position, not a velocity, not a teleport — a client that could set its own position is
      // a client that can walk through the Hunter, and this is a game about not doing that.
      if (m.t === 'drive' && Number.isFinite(m.heading) && Number.isInteger(m.detent)) {
        heading = m.heading;
        detent = Math.max(0, Math.min(DETENT.length - 1, m.detent));
      }
      /**
       * 🚨 **THE SERVER SENDS A BRIEF ON EVERY EXPEDITION AND THIS HANDLER DID NOT HAVE A BRANCH
       * FOR IT.** `show.mjs` has sent `{t:'brief', wing, cameras, worldSeed, episode}` on connect
       * and at the top of every expedition since the socket existed. The view accepted `drive` and
       * `cams` and dropped the brief on the floor: `wing` was bound once from a query string and
       * never reassigned, so **the runner drove to the wrong room's terminal**, the lower third
       * named the wrong room, and `session.js`'s `simReport` reads only `msg.outcome` — so the
       * mismatch was discarded in silence rather than caught.
       *
       * The seed matters as much as the wing. `director-rig.js` derives the camera roster from
       * `cameraRoster(worldSeed)` and the guide's sight is gated on exactly that roster; a house
       * running on the query-string default of 7 while the server graded a different seed would
       * put rooms on the television the guide cannot see, which is S3 undone from the renderer.
       */
      if (m.t === 'brief') arm(m);
      // ⚠️ THE BRIEF'S FIELD IS `cameras` AND THIS ONE IS `unlocked` — two names, one quantity,
      // and reading the wrong one here is why this branch looked dead. `show.mjs` sends
      // `camerasLive()` under both, so the house and the scoreboard agree mid-expedition.
      if (m.t === 'cams' && Number.isInteger(m.unlocked)) camerasUnlocked = Math.max(1, m.unlocked);
    };
  }

  /**
   * 🎬 **ARM THE SEGMENT.** The house is loaded once and plays every episode of the show, so a
   * brief is not just four numbers to store — it is the top of a new ninety seconds. Everything
   * with a per-expedition lifetime is rebuilt: the clock, the outcome, both bodies, the Director
   * (whose cutaway budget §3 states *"per expedition"*), the caption arbiter's repeat memory, and
   * the camera roster when the seed is one this process has not seen.
   *
   * ⚠️ THE HUNTER'S OWN RESET IS THE HUNTER'S. `hunter-ai.js:499`'s `resetCombat` says which four
   * pieces of state are invisible from outside and therefore the ones that survive a round
   * boundary — a strike timer, a stun resist, a door, and the commit latch — and that *"perception
   * and the route are the view's to reset (it owns the spawn)"*. Both halves are here.
   */
  function arm(b = {}) {
    const v = readBrief(b);
    if (v.wing) {
      wing = v.wing;
      terminal = room.anchor(TERMINAL_AT[wing]) ?? room.spawn.player[0].clone();
      state.expedition.room = wing;
    }
    if (v.cameras !== undefined) camerasUnlocked = v.cameras;
    if (v.episode !== undefined) state.episode = v.episode;
    if (v.worldSeed !== undefined && v.worldSeed !== worldSeed) {
      worldSeed = v.worldSeed;
      rig = createRig({ camera: engine.camera, room, worldSeed, subjects, unlocked: () => camerasUnlocked });
    }

    clock = EXPEDITION_SECONDS;
    outcome = null;
    state.expedition.outcome = null;
    state.cameras.unlocked = camerasUnlocked;
    window.__rrrExpedition = null;

    // 🦾 THE BODY FIRST — see `refitRunner`. Before the field sweep below, deliberately, exactly
    // as `game.js`'s `resetRound` orders the same pair: `detach()` drops what it takes off INTO
    // the field, so stripping first means the same sweep swallows the ejected parts.
    refitRunner();
    /**
     * 🦴 ...AND THE FLOOR. `limbField` was never cleared by `arm()`, so severed limbs accumulated
     * for the whole show: every arm the Hunter took off in episode one was still lying in the
     * gallery in episode six, on camera, in a segment that has not happened yet. `LimbField.take`
     * is the de-list; `hunter._pull` is nulled with it so a half-finished absorb animation is not
     * still dragging a part this loop has just reclaimed (`game.js:1798`'s line, same reason).
     */
    for (const it of [...limbField.items]) {
      it.root.removeFromParent();
      it.gadgetObj?.dispose?.(); it.gadgetObj = null;
      limbField.take(it);
    }
    hunter._pull = null;

    player.pos.copy(room.spawn.player[0]);
    player.facing = Math.PI;
    player.vel.set(0, 0, 0);
    heading = player.facing;
    detent = 0;
    lightRig.snapTo(room.spaceAt(player.pos) ?? room.spaces[0]);

    hunter.root.position.copy(room.spawn.hunter);
    hunter.vel.set(0, 0, 0);
    hunter.awareness = 0;
    hunter.state = 'PATROL';
    hunter.target = null;
    hunter.contact = 0;
    hunter.searchTimer = 0;
    hunter.resetCombat();

    lastRoom = null;
    lastState = null;
    rooms = roomGate(ROOM_SETTLE);
    loud = rateGate(NOISE_GAP);
    director = createDirector({ world: {} });
    thirds = createLowerThirds();
    bx.setShot(null);
  }

  // ---------------------------------------------------------------- the loop
  let lastRoom = null, lastState = null, sinceReport = 0;
  // See `rateGate`/`roomGate` above for the 3450 place events and the house relit at 60 Hz.
  let rooms = roomGate(ROOM_SETTLE), loud = rateGate(NOISE_GAP);
  const _camDir = new THREE.Vector3();
  /**
   * 🚨 **THE DIRECTOR WAS BEING ASKED TO CHOOSE BETWEEN EIGHT SHOTS AND TOLD NOTHING ABOUT ANY OF
   * THEM.** `world: {}` meant `subjectInStaticFrustum`, `hunterInStaticFrustum`, `subjectWorking`,
   * `cutawayBudget` and `concurrentRank2Rooms` were all `undefined`, so every `needs()` in
   * `director.js`'s library except BODYCAM's and REACTION's answered false: measured over six
   * seeds, **BODYCAM 85% of airtime, REACTION the rest, and STATIC, STING, SPLIT and CONFESSIONAL
   * zero seconds each**. The camera roster was live, the solvers worked, and nothing could reach
   * them because the availability questions were never answered.
   *
   * `rig.probe` answers all five from the scene it is already holding — the same five questions
   * `shots.js` documents as its entire surface — so the pool the arbiter scores is the pool that
   * actually exists. Cost: two `sees()` sweeps per event, not per frame.
   */
  const worldNow = () => {
    const sites = rig.probe.sites();
    const rp = rig.probe.pose('runner'), hp = rig.probe.pose('hunter');
    const at = (p) => ({ x: p.x, y: p.y + 1.0, z: p.z });
    return {
      subjectInStaticFrustum: !!rp && sites.some((s) => rig.probe.sees(s, at(rp))),
      hunterInStaticFrustum: !!hp && sites.some((s) => rig.probe.sees(s, at(hp))),
      subjectWorking: false,
      // §3's budget, stated there as `min(3, ceil(cameras / 2))` per expedition.
      cutawayBudget: Math.min(3, Math.ceil(camerasUnlocked / 2)),
      concurrentRank2Rooms: 1,
    };
  };
  const feed = (kind, subjectId, t) => director.feed({ kind, subjectId, t, camerasUnlocked, world: worldNow() });

  /**
   * 📰 **THE LOWER THIRD — `captionFor` WAS CALLED FROM EXACTLY ONE PLACE, INSIDE `finish()`.**
   *
   * So for the whole ninety seconds the television had **no text on it at all**: the bank, its
   * closed vocabulary, its ROOM_LABEL table and `broadcast.js`'s renderer all existed and nothing
   * ever asked them for a word. Every bus event now offers one, through `captions.js`'s arbiter —
   * `hud.js`'s ranked hold, one level up, so nineteen alerts do not become nineteen lower thirds.
   *
   * 🚨 THE ROOM RULE — a caption may only name the room the camera is in — lives in the arbiter,
   * because it is an information rule and belongs where a gate can hold it. See `captions.js`.
   */
  let thirds = createLowerThirds();
  const say = (kind, t, where) => {
    const at = where === undefined ? lastRoom : where;
    const cap = thirds.offer({ kind, room: at ?? wing, rank: rankOf(kind) }, t, lastRoom ?? wing);
    if (cap) bx.say(cap, t);
    return cap;
  };
  /** One call: the bus, and the words that go with it. */
  const announce = (kind, t, where) => { feed(kind, 'runner', t); say(kind, t, where); };

  /**
   * 🔊 **THE TELEVISION WAS SILENT FOR NINETY SECONDS.** This file imported nothing from
   * `audio/audio.js`; `game.js` imports four functions from it. Broadcast §3: *"Audio never cuts.
   * You hear the crash you did not see — the deniability engine."* Under D9 six of eight players
   * are getting the round entirely through this screen, and a horror sequence with no sound is not
   * a horror sequence.
   *
   * ⚠️ AND THE CONTEXT MUST BE ARMED BY A GESTURE, WHICH THIS PAGE DOES NOT NECESSARILY GET.
   * `initAudio` is called from a click handler in `game.js` because the autoplay policy requires
   * one. Here the page may be a cross-origin frame inside the television, where the host's
   * keypress does not reach — so the television delegates with `allow="autoplay"` and this arms
   * on load AND on the first gesture that does arrive. A second call is free: `initAudio` resumes
   * a suspended context and returns. Capture runs stay silent, which is `initAudio`'s own rule.
   */
  initAudio(engine);
  const armAudio = () => initAudio(engine);
  addEventListener('pointerdown', armAudio, { passive: true });
  addEventListener('keydown', armAudio);

  /**
   * 🚨 **EVERY AUTHORED HUNTER TELL WAS WIRED IN `game.js` AND UNWIRED HERE.** `onCommit`,
   * `onDoor`, `onBang` and `onStage` are hooks the AI builds and announces in its own header —
   * *"(from,to) — the view hangs sound/shake off this"*, *"ONE blow. Audio hangs off this."* — and
   * none of them had a subscriber, an event or a caption on the television. The survival mode
   * hears the door coming apart; the party mode, whose entire audience is this screen, did not.
   */
  hunter.onCommit = () => announce('hunter_commit', simT);
  hunter.onDoor = () => {
    // Rank 2 and DELIBERATELY silent: `progress` has no template, because §6.8 refuses to leak how
    // close a door is to giving way. The audience hears the work and watches the runner decide.
    feed('progress', 'runner', simT);
  };
  hunter.onBang = ({ panel, progress, through }) => {
    const at = panel?.root?.position;
    const d = at ? Math.hypot(at.x - player.pos.x, at.z - player.pos.z) : 6;
    // `game.js`'s own two lines: the far side of the door is the case the mechanic exists for,
    // and it is the one that should sound muffled.
    const split = at && panel.sideOf ? panel.sideOf(player.pos) !== panel.sideOf(hunter.root.position) : false;
    playDoorBang(progress, { distance: d, throughWall: split ? 1 : 0 });
    const where = at ? room.spaceAt(at)?.id ?? null : null;
    if (through) { playWallStage(4); announce('channel_open', simT, where); }
    else announce('blow', simT, where);
  };
  hunter.onStage = () => {
    /**
     * The 1.4 s convulsion `hunter-ai.js`'s header calls the moment the round changes character.
     * It gets the bus and a sound and no words: naming it would be naming the Hunter's condition,
     * which is the one thing §6.2 keeps off this screen.
     *
     * ⚠️ THE SOUND IS A REUSE AND IS SAID TO BE ONE. There is no authored growth cue in
     * `audio.js`; `playFurnBreak('stone')` is the heaviest low crack the house already owns.
     */
    playFurnBreak('stone');
    feed('progress', 'runner', simT);
  };


  /**
   * 🚨 **THE EPISODE ENDED ON A PERMANENTLY FROZEN FRAME UNDER A PERMANENT CAPTION.** `finish()`
   * sets `outcome` and this loop returned immediately, for ever — so the rank-4 event it had just
   * fed was never applied to a camera, `bx.tick` never ran again and the lower third it had just
   * raised stayed up until the phase changed. The climax of the segment was the one shot the
   * Director never got to take.
   *
   * §3: *"Return to the aftermath, not a new scene. Same room, 3-6 s later, in whatever state it
   * is in."* So the simulation stops — nobody moves after a take, and the runner has finished —
   * and the BROADCAST keeps running: the rank-4 shot airs, `MAX_HOLD` keeps re-solving it, the
   * dust settles, and the caption drops on its own hold. The return to the circle is the
   * television's: `show-tv.html` hides the feed the moment the phase leaves EXPEDITION.
   */
  function aftermath(dt, t) {
    simT = t;
    debris.update(dt); dust.update(dt); limbField.update?.(dt);
    director.tick(t);
    let cur = director.current();
    let shot = cur ? solve(cur.shotId, { subjectId: cur.subjectId, probe: rig.probe }) : null;
    if (cur && !shot) {
      director.refuse(t);
      cur = director.current();
      shot = cur ? solve(cur.shotId, { subjectId: cur.subjectId, probe: rig.probe }) : null;
    }
    if (shot) { rig.apply(shot); bx.setShot(shot); }
    engine.camera.getWorldDirection(_camDir);
    room.setViewpoint(engine.camera.position, _camDir, dt);
    bx.setFrame(state, clock);
    bx.tick(t);
  }

  engine.onUpdate((dt, t) => {
    if (outcome) return aftermath(dt, t);
    // The one thing `onKill` needs and cannot be handed: the simulation's clock, for the caption
    // and the report. `hunter.update` is called from inside this loop, so it is never stale.
    simT = t;
    clock = Math.max(0, clock - dt);

    // ---- the runner
    player.aimYaw = heading;
    player.update(dt, t, { ...detentInput(), aimYaw: heading, aimPitch: 0 });
    room.update(dt);

    // ---- the Hunter, and the noise it lives on
    if (player.noise > 0) noise.emit(player.pos, player.noise, 'move');
    noise.update(dt);
    hunter.update(dt, t);
    // 🔊 `game.js:3063`'s line: presence is a mood, a committed hunter is an instruction, and the
    // ear is the only channel that survives a wall — which is the whole of §3's deniability.
    setHunterThreat(hunter.threat, hunter.committed);
    debris.update(dt); dust.update(dt); limbField.update?.(dt);

    // ---- the bus the Director reads
    const here = room.spaceAt(player.pos)?.id ?? null;
    const arrived = rooms(here, t);
    if (arrived) {
      lastRoom = arrived;
      // The rig follows the RUNNER, not the broadcast camera: the lights belong to the room the
      // robot is standing in, and a cutaway must not relight the house.
      lightRig.snapTo(room.spaceAt(player.pos) ?? room.spaces[0]);
      feed('place', 'runner', t);
    }
    if (loud(t, player.noise > 0.55)) announce('noise', t);
    /**
     * 🚨 **A HUNTER EVENT IS ABOUT THE RUNNER. THE SUBJECT IS WHO THE AUDIENCE IS WATCHING, NOT
     * WHAT CAUSED THE EVENT — AND GETTING THAT BACKWARDS COST THE RUNNER 74 SECONDS.**
     *
     * These three lines fed `subjectId: 'hunter'`, so the arbiter scored shots ON the Hunter and
     * BODYCAM framed it from 2.22 m: **82% of a 90 s expedition was a third-person camera on the
     * monster**, under `shots.js`'s own `STING_MIN_RANGE` on 100% of those frames, while the
     * person the whole Debrief is about was on screen for sixteen seconds. `shots.js` now refuses
     * the pose outright as a second line of defence; this is the first.
     *
     * ⚠️ SEARCH IS NOT AN ALERT — IT IS THE STATE WHERE IT IS GIVING UP. `hunter-ai.js:711` enters
     * SEARCH when awareness has fallen BELOW `alertAt` and it is sweeping the last known point.
     * Captioning that "SOMETHING HEARD THAT" told the room the opposite of what happened, and
     * firing a rank-3 event on it pinned the camera for the sweep. It emits nothing at all now.
     *
     * ⚠️ AND STALK IS NOT A COMMITMENT. The commitment is `onCommit` — the latch `hunter-ai.js`
     * spends a page building precisely so that "it has stopped considering and started coming" is
     * announced ONCE and cannot flicker. It is wired below; the state ladder no longer guesses.
     */
    const hs = hunter.state;
    if (hs !== lastState) {
      lastState = hs;
      const ev = tellFor(hs, t);
      if (ev) { feed(ev.kind, ev.subjectId, ev.t); say(ev.kind, ev.t); }
    }
    director.tick(t);

    // ---- what airs
    /**
     * 🚨 A REFUSED SOLVE IS NOT A FRAME TO KEEP. `shots.js` returns `null` for *"this shot cannot
     * be solved right now — the arbiter must pick another"*, and this loop used to shrug and leave
     * the camera exactly where it was: measured at 8.6-20.0% of frames holding a dead pose,
     * because a STING is chosen the instant the Hunter is in an unlocked frustum and the Hunter
     * keeps walking. Ask for another angle, and fall back to the one shot §1.1 promises is never
     * lost. `bx.setShot` follows whatever actually got framed, so the bug never names a camera
     * that is not on.
     */
    let cur = director.current();
    let shot = cur ? solve(cur.shotId, { subjectId: cur.subjectId, probe: rig.probe }) : null;
    if (cur && !shot) {
      director.refuse(t);
      cur = director.current();
      shot = cur ? solve(cur.shotId, { subjectId: cur.subjectId, probe: rig.probe }) : null;
      if (!shot) shot = solve('BODYCAM', { subjectId: 'runner', probe: rig.probe });
    }
    if (shot) { rig.apply(shot); bx.setShot(shot); }

    /**
     * 🚨 RESIDENCY FOLLOWS THE CAMERA EVERY FRAME, OR THE FEED IS BLACK. `room.setViewpoint`
     * walks portals from where the camera stands and keeps only what can be seen; call it once at
     * startup, as the first draft did, and the moment the Director cuts anywhere the resident set
     * belongs to a camera that no longer exists. Everything the new shot is pointing at has been
     * culled, and the television shows a perfectly composed frame of nothing. `game.js` calls
     * `setViewpoints` every frame (:3179) for exactly this reason.
     */
    engine.camera.getWorldDirection(_camDir);
    room.setViewpoint(engine.camera.position, _camDir, dt);
    state.cameras.unlocked = camerasUnlocked;
    bx.setFrame(state, clock);
    bx.tick(t);

    // ---- the three ways ninety seconds end. The fourth — being taken — is not measured here
    // at all: it arrives from `hunter.onKill` above, at the moment the Hunter's arm lands.
    const reach = Math.hypot(player.pos.x - terminal.x, player.pos.z - terminal.z);
    if (reach < TERMINAL_REACH) finish('lit', t);
    else if (clock <= 0) finish('held', t);

    // ---- the report. Positions go to the SERVER, which decides who has earned to see them.
    sinceReport += dt;
    if (sinceReport >= 0.2) {
      sinceReport = 0;
      send({
        t: 'sim', clock,
        runner: { x: +player.pos.x.toFixed(2), z: +player.pos.z.toFixed(2), room: here, noise: +player.noise.toFixed(2) },
        // ⚠️ `wallDist` IS GEOMETRY, NOT A VERDICT. The server runs `darkrun.js`'s `guideSight`
        // over it to decide whether the guide sees anything — the TV must not get a vote on that,
        // or the screen everybody is looking at becomes part of the information gate.
        hunter: { x: +hunter.root.position.x.toFixed(2), z: +hunter.root.position.z.toFixed(2),
          room: room.spaceAt(hunter.root.position)?.id ?? null, state: hs,
          wallDist: +wallDistance(hunter.root.position).toFixed(2) },
      });
    }
  });

  /** How far a point stands from the nearest wall of its own space. `H / tan θ` needs this. */
  function wallDistance(p) {
    const sp = room.spaceAt(p);
    if (!sp) return 99;
    return Math.min(p.x - sp.x0, sp.x1 - p.x, p.z - sp.z0, sp.z1 - p.z);
  }

  function finish(kind, t) {
    if (outcome) return;
    outcome = kind;
    state.expedition.outcome = kind;
    feed(kind === 'taken' ? 'taken' : 'terminal', 'runner', t);
    const cap = thirds.offer(kind === 'taken'
      ? { kind: 'taken', rank: 4 }
      : { kind: kind === 'lit' ? 'cam_unlock' : 'task_result', room: wing, rank: 4 }, t);
    if (cap) bx.say(cap, t);
    send({ t: 'expedition', outcome: kind, room: wing });
    // The instruments read this rather than scraping the DOM.
    window.__rrrExpedition = { outcome: kind, wing, seconds: EXPEDITION_SECONDS - clock };
  }

  /**
   * 🚨 `markReady()` OR THE HARNESS WAITS THREE MINUTES AND CALLS THE VIEW BROKEN. Nothing sets
   * `body.dataset.rrrReady` on a view's behalf — `game.js` does it by hand at :3988 after the
   * exterior and the residency pass, and every capture on this project blocks on it. The first
   * draft of this file omitted it and `shoot.mjs` timed out against a scene that was, in fact,
   * running perfectly.
   *
   * It goes AFTER the residency prime below for the same reason `game.js` puts it there: the
   * first frame is what gets photographed, and a camera that has not told the room where it is
   * photographs an unresident house.
   */
  {
    const d = new THREE.Vector3();
    engine.camera.getWorldDirection(d);
    room.setViewpoint(engine.camera.position, d, 1);
  }
  engine.markReady();

  /**
   * 🚨 THE ONE THING THIS PAGE SAYS TO THE TELEVISION, AND THE ONLY REASON A PARTY WITH NO HOUSE
   * STILL WORKS. `show-tv.html` shows the feed only after this message arrives, so a television
   * pointed at a vite server that is not running gets no message, shows no frame, and plays the
   * expedition exactly as it shipped — a circle and a line of text. A `load` event could not
   * carry that: Chromium fires one for its own connection-refused page too.
   *
   * `'*'` is the right target here and is not a hole: the payload is a boolean, and the TV checks
   * `e.source === iframe.contentWindow` rather than trusting an origin string, because the host
   * may have started the house on any port.
   */
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ t: 'rrr.feed', ready: true }, '*');
  }

  /**
   * 🚨 `engine.start()` OR NOTHING EVER RENDERS. The engine does not start its own loop —
   * `estate()` builds it and the VIEW starts it (`game.js:4010`, `room-gallery.js:615`). Without
   * this the rAF loop never begins, `frame` stays 0 for ever, and `settle()` waits on a frame
   * count that cannot advance. The failure looks exactly like a slow software renderer: ready in
   * forty seconds, then silence. It cost more probe runs than the bug that preceded it.
   *
   * Unlike `game.play` there is no click-to-start gate here. That gate exists because the
   * Hunter's AI clock must not tick while a player reads a control legend — and in this mode
   * nobody is at the television's keyboard: the runner is on a phone, and the expedition's own
   * ninety-second clock is what starts it.
   */
  engine.start();

  window.__rrrExpedition = null;
  window.__rrr = window.__rrr || {};
  window.__rrr.expedition = () => ({
    outcome, wing, clock, detent,
    runner: { x: player.pos.x, z: player.pos.z, room: room.spaceAt(player.pos)?.id ?? null, noise: player.noise },
    hunter: { x: hunter.root.position.x, z: hunter.root.position.z, state: hunter.state, stage: hunter.stage },
    shot: director.current()?.shotId ?? null,
    leg: soloLeg,
    hops: room.pathPortals(player.pos, terminal, 0.6, 1.9).map((h) => ({ id: h.id, x: h.centre?.x, z: h.centre?.z, kind: h.kind })),
    at: { from: room.spaceAt(player.pos)?.id ?? null, to: room.spaceAt(terminal)?.id ?? null },
    terminal: { x: terminal.x, z: terminal.z },
    cuts: director.cuts().length,
  });

  return { engine, room, player, hunter, director, rig, bx };
}
