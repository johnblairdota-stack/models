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
import { captionFor } from '../party/captions.js';
import { createRig } from '../game/director-rig.js';
import { createBroadcast } from '../ui/broadcast.js';
import { ROOMS } from '../party/coverage.js';

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
  const bx = createBroadcast({ mount: overlay });

  const director = createDirector({ world: {} });
  let camerasUnlocked = Math.max(1, +(qs.get('cams') ?? 1));
  const rig = createRig({
    camera: engine.camera, room, worldSeed: +(qs.get('seed') ?? 7),
    subjects: () => ({
      runner: { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.facing, eyeHeight: player.eyeHeight },
      hunter: { x: hunter.root.position.x, y: hunter.root.position.y, z: hunter.root.position.z, yaw: 0, eyeHeight: hunter.height * 0.8 },
    }),
    unlocked: () => camerasUnlocked,
  });

  // ---------------------------------------------------------------- the expedition
  // Default to the gallery: it is the wing the solo director can actually reach — see its note.
  const wing = qs.get('wing') && ROOMS.includes(qs.get('wing')) ? qs.get('wing') : 'gallery';
  const terminal = room.anchor(TERMINAL_AT[wing]) ?? room.spawn.player[0].clone();
  let clock = EXPEDITION_SECONDS;
  let outcome = null;
  const state = {
    episode: +(qs.get('ep') ?? 1),
    pair: { runner: 'runner', guide: 'guide' },
    cameras: { unlocked: camerasUnlocked, needed: 3 },
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
      if (m.t === 'cams' && Number.isInteger(m.unlocked)) camerasUnlocked = m.unlocked;
    };
  }

  // ---------------------------------------------------------------- the loop
  let lastRoom = null, lastState = null, sinceReport = 0;
  const _camDir = new THREE.Vector3();
  const feed = (kind, subjectId, t) => director.feed({ kind, subjectId, t, camerasUnlocked, world: {} });

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
    if (player.noise > 0.55) feed('noise', 'runner', t);
    const hs = hunter.state;
    if (hs !== lastState) {
      lastState = hs;
      if (hs === 'ALERT' || hs === 'SEARCH') feed('hunter_alert', 'hunter', t);
      if (hs === 'PURSUE' || hs === 'HUNT' || hs === 'STALK') feed('hunter_commit', 'hunter', t);
      if (hs === 'ATTACK') feed('grab', 'runner', t);
    }
    director.tick(t);

    // ---- what airs
    const cur = director.current();
    const shot = cur ? solve(cur.shotId, { subjectId: cur.subjectId, probe: rig.probe }) : null;
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
    const cap = captionFor(kind === 'taken'
      ? { kind: 'taken', rank: 4 }
      : { kind: kind === 'lit' ? 'cam_unlock' : 'task_result', room: wing, rank: 4 });
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
