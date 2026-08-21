import * as THREE from 'three';
import { estate } from './_studio.js';
import { WallField } from '../destruction/wall.js';
import { DebrisSystem } from '../destruction/debris.js';
import { DustSystem } from '../destruction/dust.js';
import { LimbField } from '../game/limbs.js';
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
  const detentInput = () => {
    const d = DETENT[detent];
    if (!d || d.speed <= 0) return { move: { x: 0, y: 0 }, run: false };
    // `_stepGround` scales the stick by its own magnitude, so a detent is a magnitude against
    // whichever top speed `run` selects. That is the only place a speed is chosen.
    const top = d.speed > MOVE.walk ? MOVE.run : MOVE.walk;
    return { move: { x: 0, y: Math.min(1, d.speed / top) }, run: d.speed > MOVE.walk };
  };

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
     * 🚨 KNOWN LIMIT, MEASURED RATHER THAN SUSPECTED: **IT DOES NOT GET THROUGH D4.**
     * ---------------------------------------------------------------------------------------
     * `?wing=gallery` runs study_w → D1 → gallery cleanly, 10.9 m in 2.7 s at RUN.
     * `?wing=ballroom` reaches D4 at z=-8.45, sits in the aperture and never crosses; the noise
     * trace oscillates 0.01–0.53, which is a body being stopped and re-accelerated rather than a
     * steering wobble. Three separate steering fixes did not move it, which is what says the
     * problem is collision at that doorway and not this waypoint logic.
     *
     * It is left as it is, deliberately. A human runner steers around it in a second, so it
     * blocks nothing the wired mode does — and a demo pathfinder that quietly grew special cases
     * for one doorway would be a worse thing to own than a stated limit. `?wing=gallery` is the
     * wing to shoot. Whatever is at D4 wants finding on its own terms, in `game.play`, where the
     * survival mode walks the same door.
     */
    engine.onUpdate(() => {
      {
        const hops = room.pathPortals(player.pos, terminal, 0.6, 1.9);
        /**
         * 🚨 SKIP THE DOORWAY YOU ARE ALREADY STANDING IN. `pathPortals` answers from the space
         * the runner is in, and while it is IN the doorway that space is still the room behind —
         * so the first hop keeps coming back as the door under its feet. Steering at a point you
         * are standing on gives `atan2(~0, ~0)`, and the probe showed the robot parked at
         * z=-8.45 for two and a half seconds, heading flickering, noise oscillating 0.01–0.53,
         * never getting through. Take the first hop that is actually somewhere else.
         *
         * ⚠️ AND RE-SOLVE EVERY FRAME RATHER THAN ON ARRIVAL. The earlier version only recomputed
         * within 1.4m of its target, which is what let the stale waypoint stick. The BFS is
         * cached by (from, to, minW, minH) in `room.js`, so asking every frame costs a map lookup.
         */
        const h = hops[0];
        /**
         * 🚨 THE PORTAL'S POSITION IS `centre`, A Vector3 — NOT `x`/`z`. `room.js:399-404` rebuilds
         * every connector into `{id, a, b, axis, w, h, kind, state, centre, normal}`; the raw
         * `PORTALS` spec in `spaces.js` has bare `x`/`z` and the built graph does not. Reading
         * `h.x` gets `undefined`, which becomes a NaN heading, a NaN velocity and a robot at
         * NaN,NaN within one frame — silently, with nothing thrown and nothing red.
         *
         * The finite check stays even though the field is right now: a hop that cannot be steered
         * at must fall back to the terminal, never poison the stick.
         */
        const c = h && h.centre;
        if (c && Number.isFinite(c.x) && Number.isFinite(c.z)) {
          /**
           * 🚨 AIM THROUGH THE DOORWAY, NOT AT IT. Two versions failed here and both failed the
           * same way — a robot pinned beside an open door with the throttle at RUN.
           *
           *   · aiming AT the centre: once inside the aperture the runner is standing on its own
           *     waypoint, `atan2(~0, ~0)` is unstable, and it jitters in the opening.
           *   · skipping the hop once within 1.6m: it then steers at the terminal while still on
           *     the near side, which points it at the wall BESIDE the door.
           *
           * The fix is the standard one: put the waypoint a metre and a half beyond the opening,
           * on the far side from wherever the runner currently is. `pathPortals` drops the hop as
           * soon as the room changes, so the target never has to be "arrived at".
           */
          const n = h.normal || { x: 0, z: 1 };
          const side = Math.sign((player.pos.x - c.x) * n.x + (player.pos.z - c.z) * n.z) || 1;
          leg = { x: c.x - n.x * side * 1.5, z: c.z - n.z * side * 1.5, via: h.id };
        } else {
          leg = { x: terminal.x, z: terminal.z, via: 'direct' };
        }
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

    player.pos.copy(room.spawn.player[0]);
    player.facing = Math.PI;
    heading = player.facing;
    detent = 0;
    lightRig.snapTo(room.spaceAt(player.pos) ?? room.spaces[0]);

    hunter.root.position.copy(room.spawn.hunter);
    hunter.awareness = 0;
    hunter.state = 'PATROL';
    hunter.target = null;
    hunter.contact = 0;
    hunter.searchTimer = 0;
    hunter.resetCombat();

    lastRoom = null;
    lastState = null;
    director = createDirector({ world: {} });
    thirds = createLowerThirds();
    bx.setShot(null);
  }

  // ---------------------------------------------------------------- the loop
  let lastRoom = null, lastState = null, sinceReport = 0;
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


  engine.onUpdate((dt, t) => {
    if (outcome) return;
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
    if (here && here !== lastRoom) {
      lastRoom = here;
      // The rig follows the RUNNER, not the broadcast camera: the lights belong to the room the
      // robot is standing in, and a cutaway must not relight the house.
      lightRig.snapTo(room.spaceAt(player.pos) ?? room.spaces[0]);
      feed('place', 'runner', t);
    }
    if (player.noise > 0.55) announce('noise', t);
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
