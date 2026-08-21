import * as THREE from 'three';
import { estate } from './_studio.js';
import { WallField } from '../destruction/wall.js';
import { DebrisSystem, DEBRIS_KINDS } from '../destruction/debris.js';
import { DustSystem } from '../destruction/dust.js';
import { LimbField, LimbItem } from '../game/limbs.js';
import { Player, ThirdPersonCamera, Input } from '../game/player.js';
import { AimMark } from '../game/aimmark.js';
import { buildSledgeProp } from '../game/sledge.js';
import { WeaponSystem } from '../game/weapons.js';
import { HunterAI } from '../game/hunter-ai.js';
import { buildTestRoom } from '../game/room.js';
import { createHUD } from '../ui/hud.js';
import { WEAPON_COOLDOWN, WEAPON_DAMAGE, WEAPON_RANGE, SOCKET_LIMB, HUNTER_SENSE } from '../game/rules.js';
import { RunState, PHASE } from '../game/run.js';
import { EXIT_SITES, PANELS, CONNECTORS } from '../game/spaces.js';
import { CONNECTOR, BREACH_NOISE, isExitSite, resolveConnector, tellMode } from '../game/connectors.js';
import { FINAL_STAGE } from '../destruction/wall.js';
import { buildExterior } from '../game/exterior.js';
import { interconnectIds } from '../game/dig.js';
import { setCoatArm, coatArm } from '../game/wall.js';
import { estateMode, applyEstateSpike } from '../game/estate-spike.js';
import { initAudio, playWallStage, setHunterThreat, playDoorBang } from '../audio/audio.js';
import { NoiseBus, NOISE_KIND } from '../game/noise.js';

/**
 * GAME.PLAY — the playable slice.
 *
 * Everything the other pieces build, running at once and driving each other:
 *
 *   the nail gun costs the player an arm      limbs.js  <-> gadgets/index.js
 *   shooting a wall breaks it open            weapons.js -> destruction/wall.js
 *   the opened wall is a route                room.js's collider list reads the state machine
 *   the hunter breaks its own doors           hunter-ai.js -> the same damage entry point
 *   the hunter takes a LIMB, not hit points   hunter-ai.js -> limbs.js
 *   losing the leg changes the walk           limbs.js -> locomotion.js -> player.js
 *   the limb it took makes the hunter grow    hunter-ai.js
 *   the HUD is the four sockets               ui/hud.js
 *
 * LIVE: click to lock the pointer. WASD, shift to run, mouse to look, LMB fire, E to pick
 * up or refit a limb, Q to drop, R to reset.
 *
 * CAPTURE: a director drives the same inputs on a fixed 28 s loop so the view is a real
 * playthrough rather than a diorama, and so `--at N` lands on the same frame every time.
 * Shoot the hero frame with `--at 15.5`; measure with `--perf` and NO `--at`, because the
 * engine's freeze skips the updaters and a frozen frame does not measure game logic.
 */

const LOOP = 28.0;

export default async function view(args = {}) {
  // Put the gate up BEFORE any of the heavy work, in a loading state.
  //
  // Building this scene blocks the main thread for roughly 2 s in Chromium and 7–11 s in
  // Firefox (measured: frames=0 at t=3 s, first frames at t≈7 s, steady ~37 fps by t≈11 s).
  // Creating the overlay at the END of this function meant a Firefox user stared at a black
  // page with no spinner, no button and no explanation for ten seconds and reasonably
  // concluded it was broken — which is exactly what happened.
  //
  // `view()` awaits, so the browser gets paint opportunities between steps; an element created
  // here is on screen before the first await returns. Capture mode gets nothing, as ever.
  //
  // ⚠️ `args.capture` IS NEVER SET, AND THIS ONE WORD HAS BEEN CORRUPTING EVERY MEASUREMENT
  // TAKEN OF THIS VIEW. `Engine` decides capture mode with `qs.has('capture')` — `harness/
  // shoot.mjs` appends `&capture=1` to the URL — and nothing ever puts a `capture` key on the
  // view's `args`. So the test above was always false, the gate was always built, and because
  // `armPlayOverlay()` only runs in the `!engine.capture` branch it was never armed or
  // removed: every capture ran with a full-screen modal stuck in its "Building the estate…"
  // state on top of the frame.
  //
  // That is not a cosmetic problem. The gate's background is
  // `radial-gradient(..., rgba(4,6,10,.9) 70%)` — a 90%-opaque near-black scrim over the
  // whole viewport — and `page.screenshot()` captures the DOM composited over the canvas,
  // which is the PNG `grade.mjs` reads. The `--review` copy is drawn from the WebGL canvas
  // alone, which is why the review images looked clean and the graded ones did not, and why
  // nobody caught it. Measured consequence: raising the room's albedo five-fold and its
  // ambient nearly ten-fold moved the median pixel luminance from 5.9 to 9.9, because the
  // measurement was of the scrim and not of the room.
  //
  // Detect capture exactly the way `Engine` does, from the same source of truth.
  const isCapture = args.capture ?? new URLSearchParams(location.search).has('capture');
  const gate = isCapture ? null : buildPlayOverlay();

  const engine = await estate({
    cameraPos: [0, 1.6, 8.0],
    target: [0, 1.2, 3.0],
    fov: 66,
    far: 90,
    orbit: false,
    // 1.30, not 0.34. THE AMBIENT IS THE MID-TONES AND THE MID-TONES WERE MISSING. The four
    // estate room views — which are the only frames on this project a grade gate has ever
    // passed — run `scene.environmentIntensity` at 3.2 (ballroom), 4.3 (gallery) and 4.6
    // (study). `game.play` ran 0.34, i.e. a TENTH of the darkest of them, and then tried to
    // buy the difference back with exposure, which takes the highlights with it and cannot
    // reach a surface no light is arriving at. 1.30 is deliberately well under the estate
    // numbers: this is a horror level and it is supposed to be darker than a showcase render.
    envIntensity: 3.20,
  });
  const scene = engine.scene;
  const rng = engine.rng;

  // ---------------------------------------------------------------- world
  const wallField = new WallField({ authority: true });   // offline: the client is the server

  /**
   * ⚠️ `?exits=N` IS THE ABLATION FOR THE POOL, AND IT IS THE ONLY WAY THE COST OF FOURTEEN
   * SITES CAN EVER BE JUDGED. HANDOFF's own rule, paid for by `room.ballroom`'s 2.24 ms sitting
   * unattributed for a round: a change that ships without a permanent ablation toggle cannot be
   * measured later. `?exits=4` keeps the first four sites in `EXIT_SITES` order — the four that
   * shipped before this round — and drops the rest from the BUILD, not just from the run plan,
   * so both the panel meshes and the holes they cut in the walls go with them.
   *
   * Live play never passes it. It is an instrument.
   */
  const _qsExits = +(new URLSearchParams(location.search).get('exits') ?? 0);
  const _keptExits = _qsExits > 0 ? new Set(EXIT_SITES.slice(0, _qsExits).map((s) => s.id)) : null;
  const _panels = _keptExits ? PANELS.filter((p) => !isExitSite(p) || _keptExits.has(p.id)) : PANELS;
  /**
   * ⚠️ THE RUN'S POOL HAS TO BE NARROWED WITH THE BUILD OR THE ABLATION IS UNWINNABLE. The
   * selection is a pure function of (seed, pool); leave the pool at fourteen while only four
   * panels exist and the seed will eventually name a site with no panel, `exits` drops it, no
   * built site is ever live, and every wall in the house is padlocked. It would not throw.
   */
  const SITES = _keptExits ? EXIT_SITES.filter((s) => _keptExits.has(s.id)) : EXIT_SITES;
  const room = await engine.work(buildTestRoom(engine, { wallField, panels: _panels }));
  scene.add(room.root);

  // `estate()` cannot know the floor plan — it runs before the room exists — so put the camera
  // where the level actually starts before anything reads it. `finalizeScene()`'s compile pass
  // and the first residency call both use `camera.position`, and a camera sitting at the old
  // level's origin would compile and resolve the wrong room on the one frame it matters.
  {
    const start = engine.capture ? room.spawn.capture : room.spawn.player[0];
    engine.camera.position.set(start.x, 1.6, start.z + 3.2);
    engine.camera.lookAt(start.x, 1.2, start.z - 2.0);
  }

  const limbField = new LimbField(scene, { rng, floorY: room.floorY, bounds: room.bounds });
  /**
   * 🚨 **EVERY LOOSE THING ON A FLOOR JOINS RESIDENCY** (`calls-1`, 2026-08-09). A dropped limb
   * or a world gadget is parented to the SCENE, so until this line residency — which switches
   * off every room you cannot see — had no opinion about it at all, and the six world pickups
   * were being drawn from anywhere in the house they happened to fall inside the frustum.
   * Measured at `ballroom.south`, seed s4: **555 of 689 draw calls were the six pickups**, five
   * of them lying in rooms whose walls and floors were switched off. `room.js`'s block above
   * `setViewpoints` has the full per-object table and why the test is deliberately generous.
   *
   * ⚠️ **`onDrop`/`onTake` ARE THE CHOKE POINTS AND THAT IS WHY THIS IS TWO LINES.** `drop()` is
   * the only thing that ever pushes to `limbField.items` (`spawnGadget` and `spawnWorldSledge`
   * both route through it) and `take()` is the only way out — `resetRound` below, the rig's
   * three `field.take(item)` calls and `player.js`'s two all go through it. So there is no
   * fourth place to remember, and `untrackLoose` restores `visible` on the way out.
   *
   * 🚨 **EXCEPT ONE, AND IT IS WHY THE SECOND ARGUMENT EXISTS.** `hunter-ai.js` `absorb()`
   * reparents a limb onto the hunter's model and sets `held`/`attachedTo` WITHOUT calling
   * `field.take()`, so the item stays registered while its `root.position` quietly becomes
   * hunter-LOCAL. Culling on that would test a torso-relative offset against the floor plan and
   * could blank the limb during the pull-in the hunter's own header says the audience has to
   * see. `it.inWorld` is `!held && !attachedTo`, i.e. exactly "still lying on a floor", and it
   * is the same predicate `LimbField.update` and `nearest()` already trust.
   */
  limbField.onDrop((it) => room.trackLoose(it.root, () => it.inWorld));
  limbField.onTake((it) => room.untrackLoose(it.root));
  const debris = new DebrisSystem(scene, { perKind: Math.round(110 * engine.quality.particles), floorY: room.floorY, rng });
  const dust = new DustSystem(scene, { max: Math.round(120 * engine.quality.dust), rng, color: 0xb0a794 });

  // Debug hook, mirroring the UE console command: ?stages=0123 forces each panel to a
  // stage so the layer model can be eyeballed inside the real room lighting.
  //
  // Clamped to the panel's OWN table length: a chained exit site runs on `CHAINED_DEFS`, and
  // `WallState.setStage` clamps to the module-level `FINAL_STAGE` rather than to `defs.length`,
  // so an out-of-range digit here would index past the end and take the view down.
  {
    const s = new URLSearchParams(location.search).get('stages');
    if (s) {
      room.panels.forEach((p, i) => {
        if (s[i] == null) return;
        p.state.setStage(Math.min(+s[i] || 0, p.state.defs.length - 1));
      });
    }
  }

  const weapons = new WeaponSystem({ scene, room, limbField, debris, dust, rng });

  // ---------------------------------------------------------------- lighting
  //
  // Horror lighting has one hard constraint that pure darkness does not satisfy: the
  // player has to be able to read the room they are being hunted through. So this is
  // pools, not a wash — four warm practicals down the near hall at chandelier height, a
  // cold source in the far hall you can only see through the wall you broke, and exactly
  // ONE shadow caster, aimed at the divider because the divider is where everything that
  // matters happens. A second shadow map costs a whole extra pass over every mesh and buys
  // a shadow nobody looks at.
  // COLOUR TEMPERATURE SEPARATION. At 0xffc07a and intensity 150 this key was so saturated
  // and so strong that it swamped everything — the player's white shells, the marble, the
  // plaster and the debris all rendered the same amber, and the frame read as one colour.
  // Reference lighting (Hitman Paris, Alien: Isolation) works because a warm key falls
  // against a COOL shadow: the separation lives between the key and the fill, not inside
  // the key. So the key is now a much less saturated warm at half the intensity, and the
  // cool side is carried by a real hemisphere fill below.
  // ⚠️ **THE ROOM RIG'S LIGHT COUNT IS FIXED. THE GAME'S IS NOT, AND THIS COMMENT USED TO SAY
  // OTHERWISE — WHICH IS MOST OF WHY JOHN'S FIVE-SECOND FREEZE WENT UNDIAGNOSED.**
  //
  // What is true: `numPointLights` is part of three.js's program cache key, so a count the
  // renderer has never compiled for recompiles every visible material. `hunter-ai.js`
  // `_setFlare()` records the measured cost of learning it — driving a light off an AI state
  // took a clean 1.28 ms capture to "execution context destroyed" with a 2.5 s worst frame on
  // the way. A zero-intensity light is not free either: it still costs a full fragment-loop
  // iteration over walls that fill the screen. So this rig REPOSITIONS five lights and never
  // rebuilds them, and it must stay that way.
  //
  // What was FALSE: that the count therefore never changes. It does, four times over, because
  // **the gadgets bring their own point lights** (`src/gadgets/index.js`) and the hunter's eye
  // flare is added and removed on an AI state. `perf-stall-1` measured the RENDERED count at
  // **8, 9, 10 and 11** in live play. The consequence and the fix are at the load-time warm-up
  // lap near the bottom of this file — do not read this paragraph as permission to add a sixth
  // light to the rig; read it as the reason the warm-up covers four counts and not two.
  //
  // So there is ONE rig — key, warmA, warmB, cool, fill — exactly the count this view already
  // had, and it is REPOSITIONED between spaces rather than rebuilt. The per-space values live
  // in `spaces.js`, so a later agent changes the house's lighting without reading this file.
  const key = new THREE.SpotLight(0xffdcb4, 150, 34, 0.88, 0.62, 1.6);
  key.castShadow = true;                       // exactly one shadow caster, as before
  key.shadow.mapSize.set(engine.quality.shadowMap, engine.quality.shadowMap);
  key.shadow.camera.near = 0.6; key.shadow.camera.far = 34;
  key.shadow.bias = -0.0009; key.shadow.normalBias = 0.03;
  scene.add(key, key.target);

  const warmA = new THREE.PointLight(0xffb271, 18, 13, 2);   // a lamp, not a bonfire
  const warmB = new THREE.PointLight(0x6f8fbe, 42, 24, 2);   // the cold source further off
  // COOL: placed on the far side of the space's principal doorway, so anything standing in an
  // opening is rimmed. That is this view's old `rim` light, generalised to any room.
  const cool = new THREE.PointLight(0xa8ccf4, 46, 10, 2);
  scene.add(warmA, warmB, cool);

  // THE COOL SIDE. A HemisphereLight costs one uniform and no per-fragment loop iteration
  // worth worrying about, and it is what stops the unlit half of every object collapsing
  // into the same amber as the lit half. Sky is a cold moonlit blue, ground a very dark
  // warm bounce off the parquet — so a surface facing up reads cold and one facing down
  // reads faintly warm, which is the whole reason a dark room looks like a room.
  // 3.10, not 2.10: with `sightRange 26` inside a 53 m map there are now rooms the key never
  // visits, and the hemisphere is the only thing standing between "dark" and "absent".
  //
  // 🆕 **IT IS CONSTRUCTED HERE AND HANDED TO THE RIG, WHICH IS THE ONLY REASON THIS BLOCK
  // MOVED ABOVE `makeLightRig`** (`ceiling-1`, 2026-08-09). `critic-slice-1`: *"the ceiling is
  // the one surface nobody lit, and it caps every room in the slice like a lid."* This light is
  // the reason — a ceiling normal points DOWN, so of the two colours above it receives
  // `groundColor` and only `groundColor`, and `0x3a2a1c` is 4.3x darker in luminance than the
  // sky every wall in the house gets. The rig now LERPS that ground colour per space out of
  // `spaces.js`'s `up` field, which costs one `Color.lerp` a frame and not one light.
  const fill = new THREE.HemisphereLight(0x6f7d96, 0x3a2a1c, 4.60);
  scene.add(fill);

  // `?aim=box` restores the pre-`estate-light-1` per-space table. See `makeLightRig`.
  const rig = makeLightRig({ key, warmA, warmB, cool, fill },
    { box: (new URLSearchParams(location.search).get('aim') ?? '') === 'box' });
  rig.snapTo(room.spaceAt(engine.camera.position) ?? room.spaces[0]);

  // THE GRADE. Every value here moved, and every one moved because it was measured wrong.
  //
  // `grade.mjs` on the M2 capture: median pixel luminance **5.9** against a 30-60 gate, and a
  // top-decile (r-b)/L of **-0.552** — a frame that is not merely dark but strongly BLUE.
  // Three of the old lines were each independently sufficient to produce that:
  //
  //   shadowTint [0.74, 0.86, 1.14]  a strong blue pushed into the dark end — and in a frame
  //                                  where the ninth decile is L 8.9, EVERYTHING is the dark
  //                                  end, so this was a blue filter over the whole image
  //   toeCrush 0.045                 nine times the estate value, on the darkest scene here
  //   vignette 0.34                  on a frame that was already almost entirely black
  //
  // The direction is `GRADES.study`'s round-4 correction, which is the authoritative source
  // (`src/lighting/rig.js`) and which was arrived at by measuring the locked art: its dark end
  // is the WARMEST part of the image, its coolest cell is still warm, and the amber it was
  // meant to counter was at the TOP, where a warm `highlightTint` was putting it. So: warm
  // shadow, colourless highlight, the toe off the floor, and the vignette down to the value
  // that darkens corners rather than deletes them.
  //
  // ⚠️ ONE NOTE ON THE GATE ITSELF, because it matters to anyone reading the number: the
  // chroma test in `grade.mjs` is `top <= 0.14` — a SIGNED comparison — so a deeply blue
  // frame at -0.552 PASSES it. It only catches amber. Judge the magnitude, not the verdict.
  //
  // `exposure` and `haze` are the two the plan leaves free to tune, and haze is the one a 27 m
  // gallery actually wants: every distant pixel is mixed toward `hazeColor` BEFORE the
  // tonemap, so the far end of a long room cannot fall below it however dark its albedo.
  engine.pipeline.setGrade({
    exposure: 1.85,
    haze: 0.042, hazeColor: [0.062, 0.055, 0.046],
    lift: [0.011, 0.009, 0.007],
    toeCrush: 0.005,
    vignette: 0.24, vignetteRound: 0.92,
    grain: 0.024, contrast: 1.05, saturation: 1.02,
    splitBalance: 0.60,
    shadowTint: [1.05, 0.96, 0.84], highlightTint: [1.015, 1.00, 0.985],
  });

  /**
   * 🎨 THE BLACK POINT, ON A KEY — because this one is TASTE and I cannot judge it from here.
   *
   * The finding, and it is arithmetic rather than an opinion: `contrast` is applied around a
   * 0.5 pivot (`shaders.js`: `col = (col - 0.5) * uContrast + 0.5`), so at contrast 1.05 the
   * output is `1.05 * col - 0.025` and **everything below col 0.0238 lands at or under zero**.
   * `toeCrush` 0.005 then subtracts a little more. `lift` puts the floor at 0.011 — still under
   * the clamp — so a band roughly 0 to 2.9% wide is crushed to exact black before it is ever
   * displayed. That is not "moody"; it is surfaces that are lit, and are being deleted.
   *
   * ⚠️ BUT RAISING IT CHANGES EVERY FRAME IN THE GAME, so it is not a slice's call to make
   * silently, and a still frame is the wrong instrument for it anyway — crushed blacks look
   * *better* in a screenshot and worse to play, because what they cost you is the ability to
   * read a dark room while you are moving through it.
   *
   * So: **[G] cycles the three arms live**, same one-key pattern John asked for with [B]. He
   * plays the room, presses G twice, and picks. Nothing here changes the default — arm 0 IS the
   * shipped grade, byte-for-byte, so every stored reference capture and every `grade.mjs`
   * number stays comparable until John actually chooses something else.
   *
   * `toeCrush` goes to 0 on the lifted arms deliberately: lifting the floor and then crushing it
   * again would just move the clamp, not remove it.
   */
  const BLACK_POINTS = [
    { name: 'SHIPPED',    lift: [0.011, 0.009, 0.007], toeCrush: 0.005, contrast: 1.05 },
    { name: 'LIFTED',     lift: [0.036, 0.032, 0.028], toeCrush: 0.0,   contrast: 1.05 },
    { name: 'OPEN',       lift: [0.060, 0.054, 0.046], toeCrush: 0.0,   contrast: 1.02 },
  ];
  let blackPoint = Math.min(
    BLACK_POINTS.length - 1,
    Math.max(0, Number(new URLSearchParams(location.search).get('black') ?? 0) | 0));
  const applyBlackPoint = () => {
    const b = BLACK_POINTS[blackPoint];
    engine.pipeline.setGrade({ lift: b.lift, toeCrush: b.toeCrush, contrast: b.contrast });
  };
  if (blackPoint !== 0) applyBlackPoint();

  // ---------------------------------------------------------------- actors
  /*
   * 🤖 `?mesh=1` PLAYS AS THE GENERATED CHARACTER. Off by default, deliberately: it is a live
   * toggle rather than a replacement, so arm 0 is bit-identical without it and the two can be
   * compared in the same session by editing one character in the address bar.
   *
   * The load is awaited before the player is built — four GLBs, one for the body and three for
   * their clips. If any of it fails the game still starts, as the procedural player, with the
   * reason on the console: a character that will not load must not take the whole run with it.
   */
  /*
   * 🚨 **ON BY DEFAULT SINCE 2026-08-19 — `?mesh=0` IS NOW THE REVERT.**
   *
   * John: *"I love the rigging. Good work. lets ship that … Include the new robot model rigged."*
   * It had been opt-in behind `?mesh=1` for as long as the generated body's clips were wrong, and
   * that is exactly why the flip has to be recorded rather than quietly made: everything anyone
   * measured on `game.play` without the parameter was measured on the PROCEDURAL player. Old
   * frame-cost and silhouette numbers for "the game" are numbers for a different character.
   *
   * The body is `friendly_all38.glb`, 15,944 tris against the procedural player's 56,308 — this
   * is not a cost increase — with 38 clips regenerated on its own rig. `harness/_gen1_integration.mjs`
   * asserts the body that LOADED is that file, because the fallback below is silent by design and
   * a fallback nobody notices is how this shipped as "the new robot" for a whole round without
   * ever being on screen.
   */
  let avatar = null;
  if ((new URLSearchParams(location.search).get('mesh') ?? '1') !== '0') {
    const { unit4hMaterials } = await import('../materials/surfaces/robot.js');
    try {
      const { createMeshAvatar } = await import('../characters/mesh-avatar.js');
      avatar = await createMeshAvatar({ height: 1.7, materials: unit4hMaterials({}) });
      console.log('[game] player: GENERATED mesh avatar');
    } catch (e) {
      console.error('[game] mesh avatar failed to load, falling back to the procedural player:', e);
      avatar = null;
    }
  }
  const player = new Player({ scene, world: room, field: limbField, rng, id: 'p1', avatar });

  /**
   * 🎯 **THE DIG MARK.** `src/game/aimmark.js` carries the whole design; this is the wiring and
   * the two decisions that belong to the view rather than to the module.
   *
   * `?mark=0` off · `?mark=1` plain ring · `?mark=2` fused with the strain tell (the live
   * default). It is a MODE and not a constant because whether the fusion is one idea too many is
   * a look call, and this file's own history says a builder must not take one for itself.
   *
   * 🚨 **DEFAULT OFF IN CAPTURE, AND THE REASON IS THE BASELINES.** `?capture=1` is what every
   * stored frame and every scored verdict on the board is taken through — `wall.sheet` PASS 78
   * and `game.play` PASS 76 are both defended as byte-identical against baselines. A world object
   * that appears whenever the Director happens to face a wall with the hammer out would move an
   * unknowable subset of them, and it would do it silently. So the mark follows the same rule as
   * the play overlay and the [B]/[G]/`[`/`]` keys: live only, unless a probe asks for it by name.
   * Naming `?mark=` in the query string is that opt-in, in capture as well as live.
   */
  // (read directly rather than from `qsRun`, which is declared further down beside the run seed)
  const markQ = new URLSearchParams(location.search).get('mark');
  const aimMark = new AimMark(scene, {
    mode: markQ != null ? Math.max(0, Math.min(2, Number(markQ) | 0)) : (engine.capture ? 0 : 2),
  });
  window.__rrr.mark = (m) => (m == null ? aimMark.census() : aimMark.setMode(m));

  // The capture starts somewhere composed; live play starts where the level puts you.
  player.pos.copy(engine.capture ? room.spawn.capture : room.spawn.player[0]);
  // `facing` is atan2(dx, dz), so 0 points toward +Z and PI toward -Z. The player spawns at
  // the study's south end looking north, up the room and toward its door. Getting this
  // backwards spawns the player staring at a wall.
  player.facing = Math.PI;
  player.aimYaw = Math.PI;

  // ⚠️ SPAWN UNARMED — task-sledge-pickup.md, John, 2026-08-08: "yes start unarmed. put the
  // sledge in the first room for the player to find imediatly. the nail gun can spwn somewhere
  // else for now." This used to be `player.rig.fitGadget('shoulderL', 'nailgun')`, right here.
  // A FITTED GADGET REPLACES THAT ARM — that is the game's whole idea, not a side effect — so
  // `caps.arms` was 1 from frame zero, and the two-handed sledgehammer (gated on `caps.arms
  // === 2`, `player.js` `_toggleSledge`) was unequippable in the shipped game. Always. John
  // played a whole build and reported "a 2d mesh taking off layers where I was clicking" — he
  // was firing the nail gun. He had never swung the hammer; nothing in the build let him.
  //
  // The player now spawns as the plain, baseline two-armed UNIT-4H from `char.turnaround` —
  // exactly what John's own art shows — and both the hammer and the gun are WORLD PICKUPS, at
  // named anchors, in the placement loop below. Removing this line is the entire fix for
  // `caps.arms`; nothing else in this block changes what a loadout IS.

  // THE ROUND-START LOADOUT, RECORDED FROM THE RIG ITSELF RATHER THAN RESTATED. `resetRound`
  // has to put this exact layout back, and a second hand-written list of sockets is a second
  // thing to forget to update — which is how the reclaim block below came to be missing
  // `shoulderL` in the first place.
  const LOADOUT_SOCKETS = ['shoulderL', 'shoulderR', 'hipL', 'hipR'];
  const LOADOUT = LOADOUT_SOCKETS.map((s) => ({
    socket: s, type: player.rig.sockets[s].type, gadget: player.rig.sockets[s].item?.gadget ?? null,
  })).filter((e) => e.type !== 'empty');

  /**
   * 🛼 **STRIP THE BODY BACK TO `LOADOUT` — TAKE THINGS OFF, not just put missing things back.**
   *
   * John, 2026-08-10: *"I escaped with the skates on and respawned with them. we were supposed
   * to have fixed the reset not working on load out and all the items."* He is right, and the
   * reason the audit missed it is that `resetRound`'s refit loop only ever ADDED: it read
   * `if (occupant(socket) !== 'empty') continue;`, so a socket that still held **last round's
   * gadget** was, by that test, already correct. A reset that can only fill sockets can never
   * empty one, and everything below survived a respawn (measured, `harness/_reset2-loadout.mjs`,
   * one page, R pressed the way a player presses it):
   *
   *   · **rocket skates** — the one John saw. `rig.skates` is NOT a socket occupant: they mount
   *     `shinBoth` over both legs through `fitSkates()` and `occupant()` cannot see them at all,
   *     so no amount of socket comparison would ever have found this. The new round opened with
   *     `caps.gait === 'skate'` — a different movement model, carried out of the last life.
   *   · **a gadget bolted into a socket** — `shoulderR = nailgun` came back, AND a second nail
   *     gun respawned in the gallery. Worse than cosmetic: a fitted gadget makes that socket's
   *     type `'gadget'`, so `caps.arms` opened the round at **1**, and `_toggleSledge` gates on
   *     `caps.arms === 2` — the player could pick the hammer up and never draw it. That is the
   *     exact `caps.arms` trap the spawn-unarmed note above this block was written about.
   *   · **`rig.gadgetsFitted[socket]`** — the built gadget object, still bolted on with it.
   *   · **a limb in the wrong socket** — scavenge a part, fit it to the other side, and
   *     `occupant()` reads `'limb'` on both hips forever. Identity is the only tell, so the
   *     predicate is `item.root === unit.limbs[SOCKET_LIMB[socket]]` and not a type string.
   *
   * ⚠️ **CALLED BEFORE THE `limbField` CLEAR IN `resetRound`, DELIBERATELY.** `detach()` drops
   * what it takes off into the field, so stripping first means the same sweep that empties the
   * floor also swallows the ejected parts. Stripping after it would leave a nail gun arm lying
   * in the ballroom at the start of every round.
   *
   * ⚠️ `voluntary: true` because this is not a wound. Un-listed, the HUD punches a red rosette,
   * shouts "TORN OFF" and kicks the camera — every retry would open with a trauma response to
   * the reset itself (see `Player`'s `onChange` handler).
   *
   * ⚠️ **SKATES COME OFF FIRST.** `LimbRig.detach()` calls `removeSkates()` when the socket is a
   * LEG, because they are bolted to both ankles — so a leg stripped before them would take them
   * off at a moment when that leg's ankle joint is being unbound, and the boot meshes
   * `fitSkates()` hid would never be shown again.
   *
   * @returns {number} how many things came off — 0 on a clean round, which is the normal case.
   */
  function stripToLoadout() {
    let stripped = 0;
    if (player.rig.removeSkates?.()) stripped++;
    for (const s of LOADOUT_SOCKETS) {
      const c = player.rig.sockets[s];
      if (!c || c.type === 'empty') continue;
      const want = LOADOUT.find((e) => e.socket === s) ?? null;
      const right = !!want && (want.type === 'gadget'
        ? c.type === 'gadget' && c.item?.gadget === want.gadget
        : c.type === 'limb' && c.item?.root === player.unit.limbs[SOCKET_LIMB[s]]);
      if (right) continue;
      const gone = player.rig.detach(s, { voluntary: true });
      // The gun bolted to the arm we just ejected. `detach()` hands it back on the item so
      // `attach()` can reuse it rather than build a second one; nothing is going to reattach
      // this one, and the sweep below only unparents. `removeSkates()` disposes the same way.
      // ⚠️ AND CLEAR THE POINTER, because `detach()` has just dropped this item into the field
      // and the sweep in `resetRound` now disposes `gadgetObj` too. Leaving it set would hand
      // the sweep an already-freed object to free again a few lines later.
      if (gone?.gadgetObj) { gone.gadgetObj.dispose?.(); gone.gadgetObj = null; }
      stripped++;
    }
    return stripped;
  }

  // `noise` is a live getter, not a copy: `HunterAI._sense` reads it every frame to decide
  // what it can hear, and hearing is now the sense that works through a wall.
  const playerBody = {
    root: player.root, rig: player.rig, height: player.height, radius: player.radius,
    get noise() { return player.noise; },
  };
  weapons.addBody(playerBody);

  /**
   * 🔊 **THE NOISE CHANNEL.** One bus, positional, decaying — `src/game/noise.js` has the whole
   * argument including the determinism ruling (**LOCAL, not authoritative**). It replaces a
   * direct `hunter.hearNoise()` call at the one site that had one, and it is what the debris
   * mechanic's noise cost plugs into when that lands. Ticked in the updater, cleared by
   * `resetRound` — a round that opened hearing the last one's dig would summon the hunter on
   * frame one, every 28 s in capture.
   */
  const noise = new NoiseBus();

  /**
   * 🚪 **`?bang=auto|always|off` — WHICH DOORS THE HUNTER IS WILLING TO FORCE.**
   *
   *   auto    (default) it works on a chained door only when there is NO open route into the
   *           room the noise came from that its body fits through. Correct AI, and on today's
   *           floor plan that means **the chapel and nowhere else** — every other space has an
   *           open doorway (D1/D4/D5/D6), so it walks in like a sane creature. The mechanic is
   *           built for the sealed-room dig loop; this is what it does until that exists.
   *   always  it prefers the door whenever the noise room has one. **How John sees the beat
   *           today**, and the arm `harness/scenarios/bang-door.mjs` gates on.
   *   off     ablated — the hunter behaves exactly as it did before this mechanic.
   */
  const BANG_POLICY = (() => {
    // read directly rather than from `qsRun`, which is declared further down beside the run seed
    const v = new URLSearchParams(location.search).get('bang');
    if (v === 'always' || v === '1') return 'always';
    if (v === 'off' || v === '0') return 'off';
    return 'auto';
  })();

  const hunter = new HunterAI({
    room, scene, rng, debris, dust, weapons,
    position: room.spawn.hunter.clone(),
    noise, bangPolicy: BANG_POLICY,
  });
  // Seeded one part short of stage 2, so the first limb it takes in the demo is the one that
  // grows it — the escalation has to be visible inside a `LOOP`-length capture (28 s).
  //
  // ⚠️ **IT IS NOT BEHIND `engine.capture`, SO IT IS THE LIVE OPENING TOO, AND IT PUTS STAGE 3 OUT
  // OF REACH IN THIS MODE.** A body has four sockets and `:3079` calls `run.down('p1')` the moment
  // `caps.gait === 'down'`, which is the fourth take — so one life yields at most 2 + 4 = 6 absorbs
  // against `HUNTER_GROWTH.toStage3 = 7`. Measured across 20 driven runs, 10 seeds and 2 policies:
  // stage 2 in every one, stage 3 in none. `HUNTER_SPEED[3]`, the stage-3 rig and the `PASS_H`
  // reasoning tuned for a 0.66 m body have never been on screen here. `engine-take` K6g holds the
  // arithmetic; the party mode reaches stage 3 across a show because a show is many lives.
  hunter.absorbed = 2;
  hunter.setTargets([playerBody]);
  weapons.addBody(hunter.body);

  // ---------------------------------------------------------------- gadgets IN THE WORLD
  //
  // ⚠️ WITHOUT THIS THE PLAYER CAN NEVER HOLD ANY GADGET BUT THE NAIL GUN. `play-critic-4`
  // found there was **zero world placement of gadgets anywhere in the project** — nothing
  // spawned one, nothing dropped one — so the ball's decoy, the oil pool, the grapple's pull
  // and the skates' charge were all unreachable by playing. Everything else about them can be
  // perfect and it does not matter until they exist somewhere a person can walk to.
  //
  // PLACEMENT IS THE TUTORIAL. Each one sits where its own verb is the obvious answer, so the
  // room teaches the tool without a word of text:
  //   sledge   THE SPAWN ROOM, dead ahead — see `spawnWorldSledge` below. First thing on
  //            screen, first frame, no text: walk to it, pick it up, hit a wall.
  //   nailgun  the GALLERY'S WEST END — reached by heading north through D1 then west down the
  //            long room; `gallery.east` is the ball's, so the two never stack.
  //   ball     the GALLERY — the long sightline, where throwing a noise past something is
  //            the move, and where you can watch it walk to the wrong place
  //   oil      the SERVICE PASSAGE — the narrowest route in the house, so the first pool you
  //            ever light is across a corridor that matters
  //   grapple  the CHAPEL — the dead-end spur; the one place being cornered is guaranteed,
  //            and the tool that answers it is lying there
  //   skates   the BALLROOM — the only floor big enough to reach 9 m/s and feel it
  //
  // ⚠️ WRAPPED IN A FUNCTION AND CALLED FROM `resetRound()` TOO, WHICH IT WAS NOT BEFORE. Every
  // item this loop places was being wiped by `resetRound`'s `for (const it of [...limbField.
  // items])` clear below and never put back — harmless while retry reloaded the page (a reload
  // rebuilt the whole view and re-ran this once), but `resetRound()` is now the LIVE RETRY
  // PATH, so a second life with nothing on any floor — including the sledge and the nail gun
  // this slice just made load-bearing — is a real defect, not a cosmetic gap.
  function spawnWorldGadgets() {
    for (const [gadget, anchor] of [
      ['ball', 'gallery.east'],
      ['oil', 'service.mid'],
      ['grapple', 'chapel.centre'],
      ['skates', 'ballroom.south'],
      ['nailgun', 'gallery.west'],
    ]) {
      const at = room.anchor(anchor);
      if (!at) { console.warn('[game] no anchor for gadget', gadget, anchor); continue; }
      limbField.spawnGadget(gadget, new THREE.Vector3(at.x, room.floorY + 0.35, at.z), {
        height: player.height, materials: player.unit.materials,
      });
    }
  }
  spawnWorldGadgets();

  /**
   * THE SLEDGEHAMMER, LYING WHERE IT CANNOT BE MISSED.
   *
   * `study_w.north` is `[-8.60, -21.00]` — 9.4 m due north of the spawn's `[-8.60, -11.60]`,
   * and `spaces.js` records the player spawning at the study's south end "facing north, up the
   * room and toward D1" (`facing = Math.PI`, set above). So this anchor sits dead ahead on the
   * very first rendered frame: the player sees it, walks to it, picks it up. That is the
   * opening beat and it needs no text (task-sledge-pickup.md §3.2).
   *
   * Not a `buildGadget()` entry — the sledge is `sledge.js`'s own independent held-prop system,
   * deliberately outside the four-socket rig (see `player.js`'s `_toggleSledge` header) — so it
   * is placed by hand with a real `LimbItem` rather than through `spawnGadget()`.
   */
  /**
   * @param {{x:number,z:number}} [where]  floor position; defaults to the study anchor.
   * @param {{impulse:THREE.Vector3, spin:THREE.Vector3}} [throwWith]  see `dropSledge()`.
   */
  function spawnWorldSledge(where, throwWith) {
    /**
     * 🔨 **THE FALLBACK IS THE SPAWN POINT, AND WITHOUT IT A GENERATED HOUSE HAS NO HAMMER IN IT.**
     *
     * `room.anchor('study_w.north')` is an AUTHORED station. Under `?plan=gen` the station table
     * is deliberately deferred with the hunter (`house-packing.md` §9.4), so this returned null,
     * warned to a console nobody reads, and **returned before spawning the sledge at all** — John
     * played three generated seeds and reported *"I didn't start with a sledge hammer"*. Spawning
     * the player unarmed is the design (`task-sledge-pickup.md`); spawning the house with no
     * hammer anywhere in it is not.
     *
     * 🚨 **AND SINCE 2026-08-12 IT IS FATAL RATHER THAN ANNOYING.** Generated doors now start
     * SHUT (`genplan.js`), so a run with no hammer is a sealed room with no way out of it. The
     * two changes are independent and their combination is not; this is the line that keeps the
     * house finishable.
     *
     * `room.spawn.player[0]` is the one position a plan cannot fail to emit — `_plangen1-boot`
     * B3 gates that the spawn is inside a space on every seed. Dropped where the player stands
     * rather than at an offset: an offset needs a facing this function does not have, and a guess
     * can put the hammer inside a wall. Tripping over it satisfies John's own brief for this
     * prop — *"put the sledge in the first room for the player to find imediatly."*
     */
    /**
     * 🚨 **AND THE FIRST FIX FOR THIS WAS WRONG BECAUSE `anchor()` NEVER FAILED.** `ANCHORS` is an
     * AUTHORED, plan-independent table, so `study_w.north` resolves under `?plan=gen` too — to a
     * world coordinate that in seed 0 lands **44.72 m away, inside `r7.chapel`, while the player
     * spawns in `r1.gallery`** (`_genfix1-diag` D4). A `??` chain can only catch a null, and there
     * was never a null to catch. **The test that matters is not "did the lookup work", it is "is
     * the hammer in the room the player is standing in"** — so that is what is asserted here.
     */
    const spawnAt = room.spawn?.player?.[0] ?? null;
    const authored = room.anchor('study_w.north');
    const sameRoom = authored && spawnAt
      && room.spaceAt(authored)?.id === room.spaceAt(spawnAt)?.id;
    const at = where ?? (sameRoom ? authored : spawnAt) ?? authored ?? null;
    if (!at) { console.warn('[game] no anchor and no spawn point for the sledge'); return; }
    const built = buildSledgeProp(player.height, { materials: player.unit.materials });
    // `LimbField._settle()` lays an item down by rotating its LOCAL -Y axis level — the
    // convention every limb and gadget is built to, socket/origin at the joint, body hanging
    // below it. `buildSledgeProp` is built the opposite way up on purpose (grip at the origin,
    // haft running +Y to the head, so `equip()` can hang it straight off a wrist joint) — so a
    // bare drop would try to level the few centimetres below the grip and leave the head end
    // standing on its side. Flipping it 180° into a holder puts the haft on local -Y instead,
    // and the generic ballistics + settle in `limbs.js` do the rest: it falls, it lies flat,
    // heavy end and all, exactly like every other thing this file drops on a floor.
    built.root.rotation.x = Math.PI;
    const holder = new THREE.Group();
    holder.name = 'pickup.sledgehammer';
    holder.add(built.root);
    holder.position.set(at.x, room.floorY + 0.35, at.z);
    const item = new LimbItem({
      id: 'world.sledge', type: 'sledge', socketKind: 'sledge', gadget: null,
      root: holder, owner: null, height: player.height,
    });
    // Same ownership record every world pickup now carries: this prop is built here, referenced
    // only by this item, and freed by whoever destroys it. `SledgeRig` builds its OWN prop when
    // the hammer is equipped (`sledge.js`'s `buildSledgeProp` call) — this one is never handed
    // to the player, so disposing it can never pull the hammer out of their hands.
    item.ownedBuild = built;
    scene.add(holder);
    limbField.drop(item, throwWith ?? {
      impulse: new THREE.Vector3(0, 0.2, 0), spin: new THREE.Vector3(0, 0.4, 0),
    });
    return item;
  }
  spawnWorldSledge();

  /**
   * 🔨 **THE HAMMER FALLS ON THE FLOOR WHEN A COLLAPSE TAKES THE ARM THAT WAS HOLDING IT.**
   *
   * John, 2026-08-10, on the same playtest as the limb rule: *"the sledge also needs to **drop on
   * the floor instead of just floating in front of the player**."*
   *
   * 🚨 **THE PATH DID NOT EXIST — DIFF-READ BEFORE ASSUMING IT DOES.** `Player.update`'s
   * two-handed gate called `sledge.unequip()`, and `unequip()` does not put a hammer anywhere:
   * it `_mount('stow')`s it, i.e. **reparents the prop to `unit.joints.chest` and leaves it
   * drawn at a fixed chest-local transform**. That transform is authored for a robot with two
   * arms; with a shoulder socket emptied a metre-long prop hung off the chest at a pose nothing
   * is holding, which is the "floating in front of the player" John is looking at. `forget()`
   * exists (it is `resetRound`'s), but nothing between a collapse and the floor ever called it.
   *
   * 🎯 **AND IT IS THE SAME OBJECT THE OPENING BEAT USES, WHICH IS WHY THIS IS SIX LINES.**
   * `spawnWorldSledge()` above already makes a real `LimbItem` that `limbField` lays flat and
   * `Player.interact`'s `item.type === 'sledge'` branch already takes with `[E]`, disposing the
   * world prop and drawing the rig's own. So the drop is: un-own the carried one (which is what
   * `forget()` is — state AND prop, or neither), and put a takeable one on the floor in front of
   * the body. Nothing new is invented, and `[E]` works on it because it is the same item the
   * player picked up at the spawn.
   *
   * ⚠️ **BOTH `impulse` AND `spin` ARE PASSED, FOR THE REASON `Player.hitByCollapse` GIVES.**
   * `LimbField.drop()` draws from its seeded rng **only** when they are null, so a disarm costs
   * zero rng draws and cannot shift the view's stream.
   *
   * ⚠️ **IT LANDS SHORT OF THE ARM, NOT ON TOP OF IT.** The limb is thrown along the face normal
   * and settles 1.8–2.1 m from the body (`destruction.md` §12.6); the hammer is dropped at the
   * body's own feet with barely any throw, so the two recoveries are two different walks and
   * `E_REACH` (1.25 m, ONE constant for prompt, picker and press) can never have to choose
   * between them.
   */
  function dropSledge() {
    const fwd = { x: Math.sin(player.facing), z: Math.cos(player.facing) };
    player.sledge.forget();
    return spawnWorldSledge(
      { x: player.pos.x + fwd.x * 0.35, z: player.pos.z + fwd.z * 0.35 },
      {
        impulse: new THREE.Vector3(fwd.x * 0.55, 0.35, fwd.z * 0.55),
        spin: new THREE.Vector3(1.4, 0.6, -2.2),
      });
  }

  // The ball's decoy noise goes through here. `WeaponSystem` is constructed BEFORE the hunter
  // exists, so it cannot take it as a constructor arg — and an optional-chained
  // `this.hunter?.hearNoise?.()` on an undefined field is exactly the silent no-op this
  // project keeps shipping. Wire it explicitly, at the first moment both objects exist.
  weapons.hunter = hunter;

  // ---------------------------------------------------------------- THE RUN
  //
  // `docs/design/escape.md` §10.1-3. The state machine itself is `src/game/run.js` and knows
  // nothing about three.js, the room or the DOM — this block is the whole of the wiring, and
  // keeping it to a block is most of the value of having the module at all.
  //
  // THE SEED. In capture it is a CONSTANT, or every screenshot of this view would be of a
  // different house and `--at N` would stop landing on the same frame — the property the whole
  // capture harness is built on. Live play gets a fresh one per session unless `?seed=` says
  // otherwise, which is what makes the exit unlearnable (§6) and what lets a scenario pin it.
  const qsRun = new URLSearchParams(location.search);
  const runSeed = qsRun.get('seed') ?? (engine.capture ? 'rrr-capture' : String(Date.now()));
  const run = new RunState({
    seed: runSeed,
    authority: true,                       // offline: the client is the server, as WallField is
    sites: SITES.map((s) => s.id),
  });
  run.addPlayer('p1');

  /**
   * The exit sites, resolved against the built room.
   *
   * `outSign` is DERIVED, never authored: it is the side of the panel's plane the owning room
   * is NOT on. Writing +1/-1 into the floor-plan table would be a fifth hand-maintained number
   * per site that is invisible when wrong — a mirrored sign does not throw, it just means the
   * player can never escape, or escapes by standing in the room.
   */
  const exits = SITES.map((site) => {
    const panel = room.panels.find((p) => p.id === site.id);
    if (!panel) { console.warn('[run] exit site has no panel', site.id); return null; }
    const home = room.spaces.find((s) => s.id === site.a);
    const inside = home
      ? panel.sideOf(new THREE.Vector3(home.cx, 0, home.cz))
      : 1;
    return { site, panel, outSign: -inside, halfW: (site.w ?? panel.width) / 2 };
  }).filter(Boolean);

  /**
   * Put the run's plan onto the world: one live site, the rest chained.
   *
   * ⚠️ THIS MUTATES `WallState.defs` AND IT HAS TO BE DONE HERE RATHER THAN AT BUILD TIME.
   * Which site is chained is a PER-RUN fact derived from the seed, and `room.js` builds the
   * house before a run exists; handing the defs down through the builder would make the floor
   * plan depend on the run, which is backwards. `defs`, `stage` and `stageHealth` are all
   * public fields of `WallState` with no invariant between them beyond the three lines below,
   * and `_apply()` is the panel's own refresh — the same three things its constructor does.
   */
  /**
   * ⚠️ **THE RESOLVED STATE OF EVERY CONNECTOR IN THE HOUSE, THIS RUN — ONE MAP, ONE DERIVATION.**
   *
   * `resolveConnector(spec, plan)` in `src/game/connectors.js` is the only place the four states
   * are decided, and everything downstream reads its answer: the stage table the panel runs on,
   * the stage it starts at, how loud it is when it comes apart, and what the exterior dresses
   * it with. It used to be decided three times in three files against three different tests
   * (`run.isLiveExit`, `exitIds.has`, `s.live`), which is exactly how a fourth consumer ends up
   * with a fifth opinion.
   */
  let conn = new Map();
  function applyExitPlan() {
    const plan = { exitId: run.exitId, lock: run.lock };
    conn = new Map(CONNECTORS.map((c) => [c.id, resolveConnector(c, plan)]));
    for (const e of exits) {
      const r = conn.get(e.site.id);
      const st = e.panel.state;
      // ⚠️ `EXIT_DEFS`, NOT `STAGE_DEFS`, AND THAT ONE WORD IS THE SIEGE. Same five stages and
      // the same flags, much larger healths — see `connectors.js`. The eight BREACHABLE panels
      // are untouched and keep `STAGE_DEFS`, because breaching a wall between two rooms is a
      // traversal verb and has to stay cheap.
      //
      // The LOCK is the other half of the per-run variety (§6.3): the same site is the full
      // four-stage chew one run, plaster the next, and bare beams the third — the one stage you
      // can see daylight through and still not walk out of. `startStage` is 0 for every state
      // except EXIT, which is why this is one assignment rather than a branch.
      st.defs = r.defs;
      st.stage = r.startStage;
      st.stageHealth = st.defs[st.stage].health;
      e.panel._recomputeBox();
      e.panel._apply();
    }
    /**
     * 🕳️ **AND THE SAME SENTENCE FOR THE WALLS: ONE SEGMENT PER SHARED EDGE IS THE WAY THROUGH.**
     *
     * This sits here, beside the exit plan, on purpose. Which padlocked door is the exit and
     * which bay of the wall is the interconnect are the SAME KIND OF FACT — derived from the run
     * seed, applied to the built world, re-derived on every `resetRound()` — and this file
     * already carries the reasoning for why that cannot be baked into the builder: *"which site
     * is live is a PER-RUN fact and the builder runs before a run exists."*
     *
     * ⚠️ Inert with `?dig=0`: `room.setDigPlan` early-outs on the build flag and there are no
     * segments for `interconnectIds` to name.
     *
     * 🕳️ **`seed` IS PASSED FOR THE FREE-FORM ARM** (`?dig=1`), where the answer is a REGION on a
     * continuous wall rather than a bay index, so the plan is derived inside `room.setDigPlan`
     * from `chooseFreeInterconnect(seed)`. `link` is still passed so `?dig=bays` is unchanged;
     * whichever arm is not live ignores its half of this object.
     */
    room.setDigPlan?.({ link: interconnectIds(run.seed), seed: run.seed });

    // ...and the outside follows the plan: which site leaks and which is padlocked is the
    // same per-run fact the stage tables above encode, and it must never be derived twice.
    exterior.setPlan({ liveId: run.exitId, lock: run.lock.id, seed: run.seed, connectors: conn });
  }

  /**
   * THE OUTSIDE. `src/game/exterior.js` — daylight through an opened exit, the concealment
   * tell on every live one, and a walled court to stand in once you are through.
   *
   * ⚠️ IT IS RESIDENT ONLY WHILE AN EXIT ACTUALLY EXPOSES IT (`exterior.update`), for the same
   * reason the mansion is: 423 draw calls against a 625 budget leaves no room for a garden that
   * draws from inside six rooms that cannot see it. `?exterior=0` ablates the whole thing, which
   * is how the cost is measured rather than asserted.
   */
  /**
   * ⚠️ `?tells=blind|marked|off` — THE FLAG THIS ROUND'S SECOND HALF HANGS ON, AND IT EXISTS
   * BECAUSE THE DEFAULT DELIBERATELY CONTRADICTS WORK THAT SHIPPED AND WAS MEASURED.
   *
   *   blind   the default. A closed connector gives nothing away: the chain and the seam are a
   *           SEEDED property of the connector, never of its state, so they appear on ordinary
   *           breachable panels too and counting padlocks answers nothing. See `connectors.js`
   *           `connectorDressing`.
   *   marked  `exterior-owner-2`'s shipped behaviour, exactly — chain on the chained, seam and
   *           draught and floor spill on the live one, +20.3 luma on the jamb strip. Kept so
   *           `harness/scenarios/exterior-look.mjs` stays re-runnable and so nothing measured is
   *           deleted on a builder's say-so.
   *   off     no dressing at all. The control arm.
   */
  const TELLS = tellMode(qsRun.get('tells'));

  const exterior = buildExterior({
    room, scene, exits, rng,
    enabled: qsRun.get('exterior') !== '0',
    dustQuality: engine.quality.dust ?? 1,
    // ⚠️ EVERY panel, not just the exit sites. `procedural-map.md` §2 wants breachable, chained
    // and exit indistinguishable while closed, and the eight interior panels wore NO dressing at
    // all — so "does this wall have hardware on it" separated a candidate from a plain wall
    // before the padlock count even started.
    //
    // 🚨 ⚠️ **AND THAT NOW INCLUDES `?dig=1`'S SEGMENTS. THE FILTER THAT USED TO SIT HERE WAS A
    // TELL, AND IT WAS THE ONE THAT BROKE THE DESIGN'S CORE PROMISE.**
    //
    // It read `room.panels.filter((p) => !p.spec?.dig)`, on the argument that *"a dig segment is
    // not a connector you gamble on — it can never lead anywhere"*. That was true for exactly as
    // long as every dig was a dud. **One segment per edge now leads somewhere**, and with the
    // segments undressed the shipped panels were the only bays in the wall wearing boards and a
    // chain — so "does this bay have hardware on it" separated the connectors from the dig
    // band before the player had spent a single second digging. `procedural-map.md` §2:
    // *"a closed connector must give NOTHING away."*
    //
    // ⚠️ The other half of the old note was a real problem and it is fixed in `exterior.js`
    // rather than worked around here: the hardware is authored at one aperture and SCALED per
    // instance, so a padlock on a 1.14 x 1.80 segment came out 0.55 x 0.67. There is now a
    // second authored FAMILY at segment scale — see `SEG_FAMILY` — so a chain is the same
    // physical chain on a 2.08 m connector and on a 1.14 m bay.
    //
    // ⚠️ AND THE POPULATION MUST NOT BE A TELL FROM THE OTHER END EITHER. `connectorDressing` in
    // `blind` derives every cue from a seeded hash of (run seed, connector id) and NEVER from
    // the connector's state, so the interconnect draws from the same distribution as its 35
    // neighbours. That is measured, not argued: `harness/_tmp_dig_dress_correlation.mjs` sweeps
    // 512 seeds and `conn-1.mjs` C6 asserts the state-blindness in the built house.
    panels: room.panels,
    tells: TELLS,
  });
  applyExitPlan();

  // ---------------------------------------------------------------- FX wiring
  //
  // 🦾 **`?limbs=0` ABLATES THE COLLAPSE COST** — the one line of this slice that is not inside
  // `onChunk`, and it is here because John plays off a live tunnel and a URL is the only switch
  // he has. `COLLAPSE_LIMB` is a shared table hung on the player (`player.collapseLimbs`), so an
  // instrument flips `engine.player.collapseLimbs.on` and gets the identical arm. See
  // `limbs.js`'s `COLLAPSE_LIMB` for the rule and `Player.hitByCollapse` for the consequence.
  player.collapseLimbs.on = new URLSearchParams(location.search).get('limbs') !== '0';
  /**
   * 🖼️ **`?skin=0` ABLATES THE ERODING DRESSING, AND `?skin=<metres>` SETS ITS GRAIN.** The build
   * half is read in `src/game/skin.js` at module scope (the subdivision has to happen in the
   * builder), so this line is the RUNTIME half: with the geometry already fragmented, flipping
   * `room.skin.on` stops the erosion without rebuilding anything, which is what lets an
   * instrument A/B it in place at one station instead of across two processes.
   */
  if (room.skin) room.skin.on = new URLSearchParams(location.search).get('skin') !== '0';
  /**
   * ⚠️ Allocated here, not per blow, and not at module scope: the skin's fall is one vector per
   * event and `onChunk` is the only part of this file that writes it — the same decision the
   * collapse block's `_chunkAt` records ten lines down.
   */
  const _skinAt = new THREE.Vector3();
  for (const p of room.panels) {
    /**
     * 🕳️ **CHUNKS, PER BLOW, SCALED BY THE DEPTH ACTUALLY REMOVED — the visible half of the
     * falloff.** `onChunk` fires on every landed hammer blow on a free face (`wall.js`
     * `applyHit`); `onBreak` below still fires on stage crossings and is unchanged.
     *
     * ⚠️ **THE COUNT AND THE SIZE BOTH TRACK `removed`, WHICH IS THE POINT.** John's sentence is
     * *"they can destroy big chunks initially but it becomes less and less"*, and `dig.md` §5
     * says the feedback and the search heuristic are the SAME CHANNEL — so a wall that paid out
     * an identical spray every blow would delete the mechanic even with the depth falloff
     * working perfectly underneath. A fresh surface throws ~14 pieces; a bottomed-out spot
     * throws 2.
     *
     * ⚠️ Instanced from the start, by construction: `DebrisSystem` is one `InstancedMesh` per
     * KIND, so this costs draw calls equal to the number of MATERIALS on screen and not to the
     * number of chunks — the standing warning is the skate drift trail, which cost +82 calls for
     * 76 sprites. `dig-fx.mjs` measured the segmented build's whole FX cost at +5 calls.
     */
    p.onChunk = (panel, info) => {
      /**
       * 🧱 **THE PIECE THAT LEFT THE WALL, FIRST — and it is the answer to John's verdict.**
       *
       * *"the destruction didn't feel like chunks coming off the wall. It felt like a 2d mesh
       * taking off layers where I was clicking… thick chunks falling off the wall."*
       *
       * ⚠️ **THE CRUMB SPRAY BELOW WAS NEVER THE BUG.** It already threw fractured solids with
       * real volume. What was missing is that nothing that flew was the same object as the
       * material that left: a blow took a 30 cm patch out of the wall and paid out fifteen 7 cm
       * lumps, so cause and effect were never visibly the same thing.
       *
       * So the FIRST thing a blow spawns is ONE SLAB, sized from the patch it just removed
       * (`wall.js` hands the width across in `info.chunkSize`), spawned flush against the face
       * with its wall-side surface still facing the room (`align`), and shed rather than
       * ejected — it drops off the wall under its own weight, which is what a piece of plaster
       * losing its key actually does. It costs no draw call of its own beyond the one the
       * `slab` pool pays while it is alive, and that pool is idle-free (`debris.js` gates every
       * pool's `visible` on its live count, which also gave back the 8 calls the four existing
       * pools were paying to draw nothing).
       */
      if (info.chunkSize > 0.09) {
        debris.burst('slab', info.point, info.removed > 0.11 && rng() < 0.35 ? 2 : 1, {
          size: info.chunkSize,
          align: info.normal,
          normal: info.normal,
          // barely leaves the wall: it falls off it. `eject` is the fraction thrown hard out.
          speed: 1.5 + 1.6 * Math.min(1, info.removed * 5.5),
          eject: 0.30,
          spinScale: 0.7,
          wall: true,       // clamp it out of the face it came from — see `wnx` in debris.js
          area: { x: info.chunkSize * 0.5, y: info.chunkSize * 0.5, z: 0.06 },
        });
      }
      /**
       * 🧱 **THE COLLAPSE — WHAT THE BLOW BROUGHT DOWN THAT IT DID NOT HIT.**
       *
       * John, after playing: *"extra chunks flying off because it's no longer supported by the
       * rest of the structure… how effectively they can break down large segments with the
       * least hits."* `damagefield.js` `COLLAPSE` decides WHICH wall falls; this decides what
       * that looks like, and the one rule it has to obey is `disconnection.md` §6 — **the piece
       * that falls is the piece that left, at the size it was removed.** So the payout is
       * derived entirely from the region's own measurements: `info.collapse.w/h` is its extent
       * in metres, `area` is its m², and the pieces are spawned ACROSS it rather than at the
       * crosshair. A collapse that paid out a firework at the aim point would be the exact
       * defect round 5 fixed for the ordinary blow.
       *
       * ⚠️ **NO NEW POOL AND NO NEW MATERIAL KEY.** This is the `slab` and `plaster` pools the
       * wall already pays for; `calls-1` left ~24 calls of headroom at the pessimal station and
       * a sixth `InstancedMesh` would have spent half of it on the rarest event in the game.
       */
      const col = info.collapse;
      if (col && (col.cells > 0 || col.sagRegions > 0)) {
        const at = info.collapseAt ?? info.point;
        /**
         * 🧱 **ONE BIG CHUNK, NOT A FIREWORK — and this is John's sentence, verbatim:**
         *
         *   > *"when a piece becomes unsupported it **falls off as one big chunk** and has its
         *   > own physics bouncing off the wall and into the pile on the ground."*
         *
         * ⚠️ **THE FIRST VERSION OF THIS BLOCK PAID OUT UP TO 64 CHIPS ACROSS THE REGION AND
         * THAT IS THE DEFECT, NOT THE FEATURE.** It is the same lie round 12 removed from the
         * ordinary blow: a 30 cm patch that pays out fifteen 7 cm lumps reads as a particle
         * effect playing near a fading texture. At a collapse's scale it is worse, because the
         * region that came away is the ONE thing the player is being told about — it is the
         * payoff for the undercut they aimed, i.e. `dig.md`'s skill channel.
         *
         * So the region becomes SLABS, plural only because a storey coming away is not one
         * object: the region is tiled in BOTH axes into plates no wider than `SLAB_MAX`, so
         * together they are the shape of the hole they left. Each carries the region's own
         * thickness and each falls under `debris.chunk`'s seeded tumble — out, sag back, catch
         * the face below, and settle propped against the heap.
         */
        /**
         * ⚠️ **`SLAB_MAX` CAPS EVERY DIMENSION, NOT THE AREA — MEASURED.** An early version
         * divided by `area / 0.42` and so took its aspect ratio from nowhere: a 1.34 x 0.32 m
         * region is 0.42 m² exactly, so it came out as **one 1.34 m plate**, and another arrived
         * as a 0.18 x 1.23 m sliver. A 1.3 m slab in a 1.4 m passage is not a piece of rubble, it
         * is a wall panel with a physics bug. 0.62 is the top of the reference's own range —
         * `refs/_sheets/dig.png` tile 5, measured against the 1.5-1.7 m robots in it, puts the
         * biggest plates in the drift at 0.4-0.6 m.
         */
        const SLAB_MAX = 0.62;
        /**
         * 🚨 **TILED IN BOTH AXES, AND CAPPED AT 30 RATHER THAN 5 — THE OLD CAP WOULD HAVE EATEN
         * THE THING JOHN ASKED FOR.** `support.js` does not drop rows; it drops a connected
         * ARCHING REGION. Five 0.62 m plates cover 1.9 m², so a bigger event would have come away
         * invisibly, and splitting along the LONG AXIS ONLY made it worse — an arch region is not
         * a strip, and the short axis was being clamped to one plate.
         *
         * ⚠️ **30 IS A GUARD AND NOT THE WORKING NUMBER, AND THE WORKING NUMBER IS SMALLER THAN
         * THIS COMMENT USED TO CLAIM.** `budget = round(area / (0.62² × 0.80))` binds long before
         * `nx*ny` or 30 — you need **≥ 9.2 m² in one event** before 30 is reachable at all, which
         * nothing produces. `critic-dig-8` measured the old whole-storey event at **14 plates, not
         * the 20–30 the record said**; since the sag, one `bite` of 1.40 m² pays out **five**.
         */
        const MAX_PLATES = 30;
        // the region's own thickness: what the collapse actually took out of a 0.15 m wall
        const ct = Math.max(0.045, Math.min(0.13, (info.depth ?? 0.5) * 0.15));
        const nrm = info.normal;
        const tX = nrm.z, tZ = -nrm.x;      // along the face, floor plane — see debris.js
        // ⚠️ Allocated HERE and not at module scope on purpose: a collapse is null on the
        // overwhelming majority of blows, so this is a handful of vectors in a whole run, and
        // this handler is the only part of this file the debris slice owns.
        const _chunkAt = new THREE.Vector3();
        /**
         * 🎯 **PER-PLATE VARIATION FROM A HASH AND NOT FROM `rng()`, AND THAT IS DELIBERATE.**
         * This block consumed **zero** rng draws before this slice; taking some now would shift
         * the view's whole stream and move every stored capture for a reason unrelated to the
         * change. A pure integer hash of the plate's index is deterministic, replay-safe, and
         * invisible to everything else in the file.
         */
        const jit = (k) => {
          let x = Math.imul(k + 0x9e37, 0x27d4eb2d) >>> 0;
          x ^= x >>> 15; x = Math.imul(x, 0x2545f491) >>> 0; x ^= x >>> 13;
          return (x >>> 8) / 16777216;
        };
        /**
         * 🧱 **ONE PAYOUT PER EVENT, AND THE EVENTS ARE `support.js`'s.** John: *"I want the
         * collapse to also feel more bit by bit… the sections all falling down at once and in the
         * same direction statically like a sheet isn't immersive."* The rule now hands over a LIST
         * of things that happened — a region letting go (`sag`), a bite off one that already has
         * (`arch`), a course, a rim's chips — each with **its own tight box, its own place on the
         * face and its own magnitude**, instead of one bounding rect around everything the blow
         * did. A blow that sheds a course at the skirting and pulls a bite out of a storey
         * overhead used to report a single 5.72 x 2.43 m rect that was 27% full and tile plates
         * across the empty part of it; those are two events now and they are both honest.
         *
         * 🎯 **AND THIS IS THE HOOK ANYTHING LANDING ON TOP OF THIS SLICE SHOULD USE.** Each entry
         * is a POSITION and a MAGNITUDE (`ev.kind`, `ev.cells`, `ev.area`, `ev.load`, and the
         * world point computed on the next line) — enough for a sound, a camera shake, or a robot
         * that loses an arm when a storey lands on it, without re-deriving anything.
         */
        const evs = (col.events && col.events.length) ? col.events : [{
          kind: 'arch', cells: col.cells, area: col.area, load: col.load,
          w: col.w, h: col.h, dx: 0, dy: 0,
        }];
        /**
         * 🦾 **WHICH BITES THE WALL HAD ALREADY WARNED YOU ABOUT — `limbs.js` condition 3.**
         *
         * John, 2026-08-10: *"initially the arm comes off way too easy."* One of the three
         * reasons, measured, is that `support.js` emits a region's `sag` **and peels its first
         * bite on the same blow** (`pull = !already || …`): beat 2 and beat 3 arrive together,
         * so the warning the whole mechanic is built on had never been on screen for a single
         * frame when the limb came off. Worse, that blow is by definition an undercut blow at
         * the skirting, which `WEAPON_RANGE.sledge` says must be taken from ≤ 0.90 m — inside
         * the fall. It was unavoidable, and an unavoidable cost teaches nothing.
         *
         * A bite is that blow's own break iff its box overlaps a `sag` box **from this same
         * blow**, so the test is local to the list `support.js` just handed over — no new field
         * in `src/destruction/`, no state, no time term, and `collapseLimbHit` stays a pure
         * function of one event. Anything a later blow pulls off the piece is `warned` and can
         * take a limb: you were shown it hanging and you stood under it anyway.
         *
         * ⚠️ Every event carries `dx/dy` in metres from the blow's own reported centre and
         * `w/h` as its own tight box (`support.js`'s `emit`), so this is a plain box overlap in
         * the face's frame and needs no world placement.
         */
        const sags = evs.length > 1 ? evs.filter((e) => e.kind === 'sag') : null;
        const warnedEv = (e) => !sags?.some((s) =>
          Math.abs((s.dx ?? 0) - (e.dx ?? 0)) <= (s.w + e.w) * 0.5
          && Math.abs((s.dy ?? 0) - (e.dy ?? 0)) <= (s.h + e.h) * 0.5);
        let plates = 0, ei = 0;
        for (const ev of evs) {
          const ex = at.x + tX * ev.dx, ey = at.y + ev.dy, ez = at.z + tZ * ev.dx;
          /**
           * 🦾 **AND THE COST TERM: IF IT LANDED ON YOU, IT TOOK A PART OFF YOU.**
           *
           * John, asked whether a collapse should be able to hurt the player: *"I think generally
           * a collapse shouldn't hurt you. we could try it as a mechanic but **maybe the robots
           * limbs fall off and they just need to put it back on**."* No health, no damage number
           * — the cost is time and capability. Losing an arm stows the two-handed hammer
           * (`Player.update`'s `caps.arms < 2` rule), so the dig genuinely stops until the part
           * is back on.
           *
           * 🎯 **THIS IS THE HOOK `sag-1` LEFT FOR EXACTLY THIS AND IT NEEDED NOTHING ELSE.** The
           * event already carries a position and a magnitude, so the whole wiring is: hand it to
           * the rule with the world point this loop already computed. **The RULE — which limb,
           * how big an event has to be, and the box you have to be standing in — is
           * `limbs.js`'s `collapseLimbHit`, measured off this event stream; the CONSEQUENCE is
           * `Player.hitByCollapse`.** Nothing about it belongs in this file, and nothing in this
           * file had to change to make room for it.
           *
           * ⚠️ **AVOIDABLE ON PURPOSE, AND IT IS WHAT FINALLY PUTS SOMETHING IN THE CRAZING
           * WINDOW.** `critic-dig-8` called the warning *"a promise, not a warning… 1.9 s with
           * nothing the player can do in it"*. Beat 2 outlines the piece that has let go and
           * hangs it until you commit to the pull — so the answer to the warning is
           * **undermine, then back off**, and the pull is still in reach from outside the fall
           * (danger 1.05 m out, `WEAPON_RANGE.sledge` 1.55).
           *
           * ⚠️ **ZERO RNG DRAWS AND ZERO NEW DRAW CALLS.** `hitByCollapse` passes both `impulse`
           * and `spin` so `LimbField.drop` never touches the seeded stream (the same decision as
           * `jit()` below), and a detached limb is the SAME `Object3D` that was on the robot one
           * frame earlier — `limbs.js`'s founding design — reparented into the scene the room
           * already tracks through `limbField.onDrop`. Nothing is built, pooled or keyed.
           */
          const took = player.hitByCollapse({
            kind: ev.kind, cells: ev.cells, area: ev.area, w: ev.w, h: ev.h,
            x: ex, y: ey, z: ez, nx: nrm.x, nz: nrm.z, warned: warnedEv(ev),
          });
          if (took) {
            /**
             * 🚨 **AND THE PLAYER HAS TO BE TOLD *WHY*.** The rig's own subscriber in `hud.js`
             * already fires the whole trauma response off `kind: 'detach'` — the red wound
             * overlay, the rosette punch, the schematic node flash, "LEFT ARM TORN OFF" at WOUND
             * rank — and `player.js` kicks the camera and the gait. All of that is correct and
             * none of it is new. What none of it says is **what did it**, and this game already
             * has one thing that takes limbs off you: without a cause line the player reads a
             * falling wall as the hunter arriving behind them.
             *
             * So exactly ONE extra line, at WOUND rank so it queues immediately behind the "TORN
             * OFF" it belongs to and the two read as one sentence — the same arbitration
             * `player.onDisarm`'s hammer line uses, and if the hammer was out that line follows
             * this one and completes the chain: *torn off · the wall did it · the hammer is
             * stowed · fit an arm*. `hud.say` at DENY rank would have been dropped instead of
             * queued (`hud.js`: "a deny NEVER queues"), which is why this is at WOUND.
             */
            hud.say?.(`THE WALL TOOK YOUR ${took.kind.toUpperCase()} — [E] TO REFIT`,
              '#ffb648', 1.8, hud.RANK.wound);
          }
          /**
           * 🕸️ **BEAT 2 — THE SAG. Nothing falls, and that is the point.** `support.js`'s arch no
           * longer drops a storey in one moment; it lets go, sheds a bite, and **hangs there
           * crazed at full strength until the player commits to pulling it.** This is the cue for
           * the letting-go itself: grit runs out of the crack across the whole width of the piece
           * that has gone, and it falls rather than blooming, because nothing has been thrown —
           * the wall has just stopped holding itself up. It is the one payout in this file that
           * pays out no slab, and `critic-dig-8` is why it exists: the crazing was *"a promise,
           * not a warning… 1.9 s with nothing the player can do in it."*
           */
          if (ev.kind === 'sag') {
            _chunkAt.set(ex, ey - ev.h * 0.5, ez);
            dust.burst(_chunkAt, Math.min(34, 8 + Math.round(ev.w * 9)), {
              area: { x: ev.w * 0.92, y: ev.h * 0.30, z: 0.08 },
              speed: 0.55, rise: -0.55, size: 0.24, grow: 1.1, life: 2.4, alpha: 0.42,
            });
            debris.burst('plaster', _chunkAt, Math.min(14, 4 + Math.round(ev.w * 3)), {
              normal: nrm, speed: 0.9, eject: 0.10, wall: true,
              area: { x: ev.w * 0.85, y: 0.14, z: 0.06 },
            });
            ei++;
            continue;
          }
          // ⚠️ A two-cell nibble is not "one big chunk" and must not be paid out as one — below a
          // hand's width the honest payout is the crumb spray below, which is what a rim shedding
          // chips looks like. `_collapse`'s LONELY rule fires constantly at the crater's edge.
          const nx = Math.max(1, Math.ceil(ev.w / SLAB_MAX));
          const ny = Math.max(1, Math.ceil(ev.h / SLAB_MAX));
          /**
           * 🚨 **NEVER SPAWN MORE PLATE THAN CAME OUT OF THE WALL.** A region's bounding box can
           * be far larger than the material in it, so the plate count is bounded by the event's
           * own `area` and the tiles that get filled are picked on a stride so they spread.
           */
          const budget = Math.max(1, Math.round(ev.area / (SLAB_MAX * SLAB_MAX * 0.80)));
          const nBig = ev.area < 0.022 ? 0 : Math.min(nx * ny, budget, MAX_PLATES, MAX_PLATES - plates);
          const cw = Math.min(SLAB_MAX, (ev.w / nx) * 0.94);
          const ch = Math.min(SLAB_MAX, (ev.h / ny) * 0.94);
          const tiles = nx * ny;
          const stride = tiles / Math.max(1, nBig);
          for (let k = 0; k < nBig; k++) {
            const t = Math.min(tiles - 1, Math.floor(k * stride));
            const gx = t % nx, gy = (t - gx) / nx;
            const ou = nx > 1 ? ((gx + 0.5) / nx - 0.5) : 0;
            const ov = ny > 1 ? ((gy + 0.5) / ny - 0.5) : 0;
            _chunkAt.set(ex + tX * ou * ev.w, ey + ov * ev.h, ez + tZ * ou * ev.w);
            const j = jit(plates * 3 + ei);
            /**
             * 🧱 **THE PEEL. THE PLATE OVER THE CRACK GOES FIRST AND THE ONES ABOVE IT FOLLOW.**
             * `critic-dig-8`, driving this exact block headless at 60 Hz: with the centroid
             * subtracted the plates' RMS relative scatter was **0.034 m at 0.20 s against a
             * 0.56 m plate** — *"the group translates 5–8× further than it deforms"* — and **all
             * 14 landed inside 0.35 s**, because they were spawned on ONE FRAME with the same
             * size, the same spin scale and an `out` that was always outward.
             *
             * A held plate is drawn flush in the face where its material stood and integrates
             * nothing until its moment (`debris.js` `chunk`'s `hold`), so this is a peel and not
             * a stagger: at no point is a plate hanging in air it has not fallen through. It is
             * also what keeps the breach visible — **`critic-dig-8`'s second finding was that the
             * plates tile the aperture they just made and move toward the camera, so the hole is
             * hidden for the whole 0.8 s payoff** — because the bottom of the hole is clear on
             * frame one and the rest opens up under a fifth of a second.
             *
             * ⚠️ **CAPPED AT 0.30 s TOTAL.** Longer and it stops reading as a collapse and starts
             * reading as material dissolving; John's word for the good half of this is
             * *"satisfying"*, and a slab that hesitates is not.
             */
            const hold = Math.min(0.26,
              ei * 0.040 + (ny > 1 ? (gy / (ny - 1)) * 0.16 : 0) + j * 0.048);
            debris.chunk('slab', _chunkAt, {
              // ⚠️ **A SIZE SPREAD, BECAUSE `chunk()` DERIVES ITS SPIN SCALE FROM THE SIZE.**
              // Identical `cw`/`ch` gave every plate in a collapse the same `slow` factor, i.e.
              // the same tumble rate — one of the four causes of the sheet. ±22% is enough to
              // separate them visibly and small enough that the plates still read as the piece.
              w: cw * (0.80 + j * 0.42), h: ch * (0.80 + jit(plates * 3 + ei + 977) * 0.42),
              t: ct, normal: nrm, hold, spread: 1,
            });
            plates++;
          }
          // the dust OF the chunks — the grit that comes away with a region, not the region.
          _chunkAt.set(ex, ey, ez);
          debris.burst('plaster', _chunkAt, Math.min(40, 6 + Math.round(ev.area * 22)), {
            normal: nrm, speed: 1.9, eject: 0.35, wall: true,
            area: { x: ev.w, y: ev.h, z: 0.10 },
          });
          ei++;
        }
        // the plume is the tell that something big just happened, and it is the one cue that
        // reaches the player when the collapse is behind their own robot. ⚠️ ONE per blow, off
        // the whole blow's extent — it is the event's atmosphere, not a per-piece effect, and a
        // plume per sub-event would put four clouds where the player is looking for one hole.
        if (col.cells > 0) {
          dust.burst(at, Math.min(70, 10 + Math.round(col.area * 26)),
            { radius: 0.8 + Math.min(1.9, col.w * 0.5) });
        }
      }
      // `info.removed` is m² x depth (`damagefield.js`): ~0.18 on pristine wall, ~0.02 when the
      // spot has bottomed out. The crumbs are now the DUST OF the slab rather than the whole
      // event, so the count comes down: the reference's "roughly 40 fragments" is a wall part
      // way through a collapse, not one swing.
      const n = Math.max(1, Math.min(13, Math.round(info.removed * 56)));
      debris.burst(info.kind, info.point, n, {
        speed: 2.2 + 4.0 * Math.min(1, info.removed * 5.5),
        normal: info.normal,
        wall: true,
        area: { x: 0.40, y: 0.40, z: 0.12 },
        eject: 0.55,
      });
      if (info.removed > 0.03) dust.burst(info.point, Math.min(22, Math.round(info.removed * 90)), { radius: 0.9 });

      /**
       * 🖼️ **AND THE ROOM'S OWN DRESSING GOES WITH THE WALL IT WAS HANGING ON.**
       *
       * John: *"from the inside of the room the destructive wall IS the room asset — only when
       * they damage it can they see its white underneath. I don't want it to disappear in one
       * hit."* `src/game/skin.js` owns the rule and the removal (a three-integer index write into
       * a merged bin, **+0 draw calls**, measured at 8 of 8 parked stations); this is the FALL.
       *
       * ⚠️ **LAST, AND AFTER THE COLLAPSE BLOCK, WHICH IS NOT COSMETIC ORDERING.** `erode()` is a
       * sweep of the whole face against the damage grid, so it has to run after everything that
       * could have changed that grid on this blow — `applyHit`'s deposit AND `support.js`'s
       * collapse, which removes cells the player never hit. Run first, a storey that came down
       * would leave its panelling hanging for one more blow.
       *
       * ⚠️ **NO NEW POOL, NO NEW KIND, NO NEW MATERIAL.** `slab` and `plaster` are the two the dig
       * already has in flight, so this is +0 draw calls. `paper` and `timber` would suit gilt and
       * canvas better and each costs **+1 call while it flies** (`debris.js` gates a pool's
       * `visible` on its live count), which is a look decision with a price and not a builder's to
       * take.
       */
      const skin = room.skin;
      if (skin?.on) {
        const off = skin.erode(panel);
        if (off) {
          _skinAt.set(off.x, off.y, off.z);
          /**
           * The piece that left, at the size it left — `disconnection.md` §6, the same rule the
           * collapse payout obeys. `off.area` is the real world m² of the fragments that died, so
           * a blow that clips the corner of a picture frame throws one chip and one that takes
           * half a canvas throws a plate.
           */
          const w = Math.min(0.52, Math.max(0.10, off.w));
          const h = Math.min(0.52, Math.max(0.10, off.h));
          debris.chunk('slab', _skinAt, {
            w, h, t: 0.035, normal: info.normal, hold: 0.03, spread: 1,
          });
          debris.burst('plaster', _skinAt, Math.min(9, 2 + Math.round(off.area * 26)), {
            normal: info.normal, speed: 1.4, eject: 0.25, wall: true,
            area: { x: off.w * 0.8, y: off.h * 0.8, z: 0.05 },
          });
        }
      }
      /**
       * 🔨 **AND THE GAME SAYS WHICH DOOR THAT WAS — `genexit-1`, 2026-08-15. THE HAMMER WAS MUTE.**
       *
       * John, playing `?plan=gen` carrying the sledgehammer: *"there are 3 chained doors on the
       * perimeter walls but I attacked each one many time and none seemed to take damage."*
       *
       * 🚨 **MEASURED: 0 HUD lines in 16 blows x 3 doors, on two arms**
       * (`harness/scenarios/_genexit1-tell.mjs`). The two lines that exist —
       * `CHAINED FROM THE OUTSIDE` and `<name> IS OPEN`, ~250 lines below — hang off
       * `weapons.onWallHit`, whose ONLY caller is `WeaponSystem.hitWall` (`weapons.js`). The
       * hammer does not go through the weapon system at all: `Player._resolveSledgeHit` calls
       * `panel.applyHit()` directly and has never held a `weapons` reference, which its own
       * docstring states. So a nail-gun player is told which door they hit and a hammer player
       * is told nothing.
       *
       * 🎯 **THE CONTROL IS ALREADY IN THE TREE AND IT IS GREEN.** `escape.mjs` drives the NAIL
       * GUN over the same house and reports *"the HUD marks the moment the way out opens —
       * queued behind CHAINED FROM THE OUTSIDE"*. Same build, same panels: the gun spoke, the
       * hammer did not. That pair is what separates "the line did not fire" from "I did not look
       * at the HUD", and `_genexit1-tell.mjs` runs both arms.
       *
       * ⚠️ **`onChunk` IS THE RIGHT DOOR AND NO NEW HOOK WAS ADDED.** It already fires on every
       * landed hammer blow (`wall.js` `applyHit`, both arms) and already carries the panel and
       * `info.blocked`. `player.js`, `weapons.js` and `wall.js`'s hit path are untouched.
       *
       * ⚠️ **IT CANNOT DOUBLE-FIRE WITH THE GUN'S COPY.** A nail-gun round on a connector goes
       * `damage()` -> no field -> `state.applyDamage`, which never reaches `onChunk`; and a dig
       * face, which does reach `onChunk`, is not in `conn` and returns on the first line. One
       * blow, one line, whichever tool made it.
       *
       * ⚠️ **`toldAbout` IS SHARED WITH THE GUN'S HANDLER ON PURPOSE** — shoot a door once and
       * then hammer it and you are told once, which is what "the second time you shoot the same
       * door you already know" meant. It is declared later in this same scope and read from a
       * closure that cannot run before then, so there is no TDZ here.
       *
       * 🚫 **THIS IS A POST-COMMIT REVEAL AND MUST STAY ONE.** `procedural-map.md` §2 forbids a
       * CLOSED door giving anything away; you learn this by swinging, which is the gamble, and it
       * is the identical rule the gun's copy has shipped under since `escape-owner-1`.
       */
      const r = conn.get(panel.id);
      if (r) {
        if (r.state === CONNECTOR.EXIT) {
          if (panel.state.stage >= FINAL_STAGE && !toldAbout.has(`open:${r.id}`)) {
            toldAbout.add(`open:${r.id}`);
            hud.say?.(`${r.spec.name ?? 'THE WAY OUT'} IS OPEN`, '#8fd8f0', 1.8, hud.RANK.deny);
          }
        } else if (r.state === CONNECTOR.CHAINED && info.blocked && !toldAbout.has(r.id)) {
          toldAbout.add(r.id);
          hud.say?.('CHAINED FROM THE OUTSIDE', '#cbbfa6', 1.7, hud.RANK.deny);
        }
      }
    };
    p.onBreak = (stage, info, panel) => {
      const at = new THREE.Vector3(panel.root.position.x, panel.root.position.y, panel.root.position.z);
      const kind = panel.debrisKind;
      /**
       * 🚨 **THIS SPRAY LEFT ALONG WORLD +Z ON EVERY WALL IN THE HOUSE, AND THE `dir` IT PASSED TO
       * SAY OTHERWISE HAS NEVER BEEN READ BY `burst()`** — measured 2026-08-10, `_debris5-pop.mjs`.
       *
       * `debris.js` `burst()` takes its ejection cone and its spawn frame from `o.normal` and has
       * no `o.dir` at all; the vector below was dead on arrival, so every stage crossing threw its
       * eighteen pieces along the default `(0,0,1)`. It is `wall.js`'s own documented bug class,
       * still open in this one caller — see the note on `impactPoint` there: *"half the mansion's
       * panels sit in walls whose normal runs along X, and against those the old code slams along
       * the wall instead of into it."*
       *
       * 🎯 **AND WITHOUT `wall: true` THE EIGHTEEN CARRIED NO WALL PLANE, WHICH IS THE ONLY REASON
       * A PIECE IS KEPT OUT OF THE MASONRY.** On a 63-blow dig at `f.svc_e.1.b` (an X-facing face)
       * that is 36 resting slabs — two stage crossings past `debrisKindForDepth`'s 0.38 — of which
       * **20 came to rest BEHIND the face, up to 0.90 m inside the wall**, where the masonry draws
       * over them. The remaining 16 lay on open floor at a mean tilt of 0.129 rad with an sd of
       * **0.048**: eighteen plates at one angle is the deck-of-cards tell this slice's own gate is
       * named for, and `onBreak` was the one spawn path still opted out of the fix that closed it
       * everywhere else (`debris.js`, round 5 and round 13, `wnx`).
       *
       * ⚠️ **`spread` IS REPLACED BY `area`, NOT DROPPED, AND THE EXTENT IS UNCHANGED.** `spread`'s
       * spawn jitter is world-axis and squashes Z — the same z = 0 assumption — so on an X-facing
       * face it scattered pieces ±0.58 m straight THROUGH the wall. `area` is the face's own frame
       * and its depth term is one-sided by construction (`debris.js`: *"a chunk that came off a
       * wall is in front of that wall"*), which is where every other wall caller in this file
       * already is. Same 18 pieces, same 4.6 m/s, same ±0.58 m of scatter — corrected frame.
       */
      const nrm = panel.normal;
      debris.burst(kind, at, 18, {
        speed: 4.6, normal: nrm, wall: true,
        area: { x: 1.15, y: 1.15, z: 0.10 },
      });
      dust.burst(at, 30, { radius: 1.35 });
      if (stage >= 4) dust.burst(at, 26, { radius: 1.9 });

      // ---- 🔊 A LAYER OF WALL COMING OFF IS THE LOUDEST THING IN THE GAME, and until this
      // line it was the only loud thing that made no sound at all.
      //
      // `escape.md` §1's load-bearing sentence — *"the act required to escape is the act that
      // summons the thing hunting you"* — was **not true in the build**, and `play-critic-7`
      // measured exactly how untrue: **0 calls to `hearNoise` in 60 s of demolishing a wall**,
      // and a controlled A/B with the hunter staged identically in both arms giving *60 s
      // holding the trigger → never left PATROL, closest 15.5 m* against *60 s in silence →
      // never left PATROL, closest 15.5 m*. The perception ladder was fine; nothing was
      // ringing the bell. Reproduced here before changing anything.
      //
      // ⚠️ THE STRENGTH IS ABOVE 1.0 ON PURPOSE AND IT IS IN CONTRACT. `hearNoise` refuses at
      // `d > HUNTER_SENSE.hearRange * strength`, so the argument is "how far this carries, in
      // gunshots" — 1.0 is a gunshot and means 14 m. **At 1.0 this call would have been a
      // no-op**: the measurement above says the patrol never comes within 15.5 m of that wall,
      // so every one of these events would have been refused and the A/B would have come back
      // identical a second time. See `BREACH_NOISE` in `spaces.js` for the two values.
      //
      // ⚠️ GUARDED ON `authoritative` AND `!reset`. `WallState._emit` fires for THREE reasons:
      // real damage, `syncStage` from a server (a remote client's work, already heard where it
      // happened), and `reset()` — and `resetRound()` resets every panel in the house, which
      // without this guard would fire twelve sirens at the hunter on the frame the capture
      // Director restarts the round, every 28 seconds.
      //
      // ⚠️ `hearNoise` REFUSES DURING PURSUE / ATTACK / GROW AND THAT IS CORRECT. Once it has
      // seen you, a bang across the room does not un-see you. Do not "fix" it.
      //
      // ⚠️ AND IT MUST NOT HEAR **ITSELF**. `HunterAI._breach` calls `panel.damage()` directly
      // while in the `BREACH` state — which `hearNoise` does NOT refuse — so an unguarded call
      // here would make the hunter knock a wall down, hear the bang, set `lastKnown` to the
      // wall it is standing at, drop to SEARCH and abandon the breach it was in the middle of.
      // It would look exactly like the D7 mechanic being broken. A weapon hit carries a
      // `weapon` key (`WeaponSystem.hitWall`); the hunter's own slam does not.
      //
      // ⚠️ AND THE STRENGTH NOW COMES OFF THE RESOLVED CONNECTOR, WHICH IS THE ONE PLACE THE
      // FOUR STATES ARE DECIDED. It used to test `exitIds.has(id)` — membership of the exit
      // POOL — so all fourteen sites, including the thirteen chained ones, were the loud value.
      // That was harmless only because a chained panel can never emit a stage transition; the
      // moment §8's detonation opens them it would have fired fourteen house-wide sirens on one
      // frame. `noiseFor(state)` gives the loud value to the ONE connector that is an exit.
      //
      // 🔊 **AND IT NOW GOES ON THE BUS RATHER THAN STRAIGHT INTO THE HUNTER'S EAR.** Same
      // position, same strength, same guards, one frame at most of latency (`noise.update` and
      // `hunter.update` both run below `player.update`, which is what fired this) — but the
      // hunter can now be deaf to a class of noise without every emitter knowing about it, which
      // is exactly what the door mechanic needs (it must not hear its own hammer) and what the
      // debris noise cost will need. See `src/game/noise.js`.
      const byWeapon = info?.hit?.weapon;
      if (info?.authoritative && !info?.reset && byWeapon && byWeapon !== 'hunterSlam') {
        noise.emit(at, conn.get(panel.id)?.noise ?? BREACH_NOISE.panel, NOISE_KIND.dig);
      }

      // ---- 🔊 the stage-crossing sound. Same event, same guard as the noise call above:
      // a silent `resetRound()` (every 28 s in capture, or a live `engine.resetRound()`)
      // must not fire five sirens across twelve panels on one frame. Differs audibly by
      // stage inside `playWallStage` — plaster is not lath is not beam — because that IS
      // the search heuristic `docs/design/dig.md` is built on.
      if (!info?.reset) playWallStage(stage);
    };
  }

  // `sledge` is passed alongside `rig` so the weapon readout can say SLEDGEHAMMER — it is a
  // second, independent held-prop system (`player.sledge`, see `sledge.js`'s own header) that
  // `rig.activeWeapon` has no way to see, which is why the readout used to show the fitted
  // gadget/fist and nothing else even with the hammer drawn (task-sledge-pickup.md §3.4).
  const hud = createHUD({ rig: player.rig, sledge: player.sledge });
  const cam = new ThirdPersonCamera(engine.camera, { world: room, distance: 3.1, shoulder: 0.44 });
  cam.yaw = player.aimYaw;
  // WHICH WAY IS OUT. `ThirdPersonCamera._cueStep` owns the latch and measures the direction;
  // the HUD owns how it looks. See both — play-critic-5's #1 is half geometry and half this.
  cam.onWedge = ({ turn, first }) => hud.turnCue(turn, first);

  /**
   * 🔨 **LOSING AN ARM MID-DIG SILENTLY DISARMED YOU.** (`critic-slice-3`, defect 7.)
   *
   * *"In the service-passage run the hunter took an arm at ~blow 26; the two-handed gate dropped
   * the sledge and the next thirty swings were punches. The only tell is a bottom-left label
   * changing SLEDGEHAMMER to FIST, under a red screen wash."*
   *
   * ⚠️ THE RULE IS NOT THE BUG. `task-sledge.md` §7 decided that a two-handed hammer is stowed
   * the instant both arms are no longer present, and rejected the alternative outright — a
   * one-armed robot does not swing a sledgehammer. What was missing is that the game never said
   * it. So this spends BOTH channels the game already has, at the moment `Player.update()`
   * fires the event:
   *
   *   · the callout slot, at WOUND rank, so it queues immediately behind the "ARM TORN OFF"
   *     line that caused it rather than fighting it — the two read as one sentence.
   *   · the context-prompt slot, which then keeps a standing line on screen for as long as the
   *     hammer is owned and not in your hands (see `_liveInput`). A callout is a moment and the
   *     player was mid-swing when it happened; the recovery has to still be there afterwards.
   *
   * The recovery it names is real and is the same two presses in either order: put an arm back
   * on (E over any arm on the floor — the one that was just torn off is right there), then E
   * with nothing in reach to draw the hammer.
   *
   * 🔨 **AND SINCE 2026-08-10 THE HAMMER ACTUALLY GOES SOMEWHERE.** See `dropSledge()` above for
   * why `unequip()` alone was leaving a prop in mid-air, and `Player.update`'s disarm block for
   * why only a WOUNDED disarm drops it — fitting a gadget is a tool swap and still slings it.
   * The callout has to name the right recovery for each, because they are different walks: a
   * dropped hammer is a second thing to pick up and the player is looking at the wall, not at
   * their feet.
   */
  player.onDisarm = ({ wounded } = {}) => {
    if (wounded) dropSledge();
    hud.say?.(wounded
      ? 'SLEDGEHAMMER DROPPED — FIT THE ARM, THEN [E] TO TAKE IT BACK'
      : 'SLEDGEHAMMER SLUNG — BOTH ARMS NEEDED', '#ffb648', 2.6, hud.RANK.wound);
  };

  // ---- THE ONE MOMENT THE PLAYER MUST NOT MISS.
  //
  // Measured, not assumed. `harness/scenarios/flee-survival.mjs` stages a real chase with room
  // to run and finds that fleeing WORKS at every point: on the commit (all four limbs kept,
  // 7.2 m clear), on the rear-back from inside reach at 2.0 m (all four kept), and through a
  // route — gallery, D3, study_e — where the hunter loses contact entirely at t=6.9 s, 18.6 m
  // behind. Standing still in the identical staging costs three limbs in 8.1 s.
  //
  // `harness/scenarios/commit-tell.mjs` then measured whether the player is ever TOLD. Frames
  // photographed either side of `commitAt` differed by 1.1x the noise floor of the room's own
  // breathing lights, across fewer pixels than that floor moves on its own — because every
  // channel was a continuous function of `awareness`. A fair encounter nobody can read plays
  // as an unfair one, and play-critic-4 stood still for exactly that reason.
  //
  // So: the AI owns the latch (`HunterAI._commitStep`, which also punches the eye and the eye
  // light in world) and this is where it reaches the player.
  hunter.onCommit = () => hud.alarm();

  /**
   * 🚪 **SOMETHING IS AT THE DOOR — and the player has to be able to say WHICH.**
   *
   * John's design is a creature that hears you, walks to one door of your room and works on it,
   * *"and if the players don't move out of the room this can be the timer"*. The distinction that
   * makes it a mechanic rather than a countdown is that the banging comes from **one identifiable
   * place**, so all three channels here name the same door:
   *
   *   · **in world**, and this is the one that matters: `HunterAI._bang` throws a dust puff and
   *     plaster off the panel itself on every blow, at the panel centre so it blooms on the
   *     player's face of the wall too. Zero draw calls — both kinds are already instanced and
   *     already on screen during a dig.
   *   · **the ear**: `playDoorBang(progress, { distance, throughWall })`, escalating with how much
   *     of the door is actually gone. Level by distance; no panner, see `audio.js` for why.
   *   · **the HUD**: the door's authored name, once when it starts and once when it is nearly
   *     through. NOT on every blow — six identical callouts is how a warning becomes wallpaper,
   *     which is the exact finding behind `_commitStep`'s latch.
   *
   * ⚠️ **`RANK.wound`, NOT `alarm()`.** `hud.js`'s standing rule is that the alarm vocabulary
   * belongs to the hunter having COMMITTED to you. A hunter at a door has not seen you — the
   * whole point is that you can still move — and spending the alarm here would make the one
   * signal that means "it is coming for you now" mean two different things.
   */
  hunter.onDoor = (door) => {
    hud.say?.(`SOMETHING IS AT ${door.name}`, '#ffb648', 2.4, hud.RANK.wound);
  };
  let _bangSaid = 0;
  hunter.onBang = ({ door, panel, progress, through }) => {
    const d = Math.hypot(panel.root.position.x - player.pos.x, panel.root.position.z - player.pos.z);
    // Is the player on the far side of this door from the hunter? That is the case the mechanic
    // exists for, and it is the one that should sound muffled. `sideOf` is the panel's own frame,
    // so this is right for the half of the mansion whose walls run along Z.
    const split = panel.sideOf(player.pos) !== panel.sideOf(hunter.root.position);
    playDoorBang(progress, { distance: d, throughWall: split ? 1 : 0 });
    // The bus, so the hunter's own hammer is a noise in the world like any other — and `door` is
    // the one kind `HunterAI._noiseStep` is deaf to, or it would re-summon itself every 2.4 s.
    noise.emit(panel.root.position, 1.1, NOISE_KIND.door);
    if (through) {
      _bangSaid = 0;
      hud.say?.(`${door.name} IS OPEN`, '#ff6a48', 2.2, hud.RANK.wound);
      hud.alarm?.();                       // it is INSIDE now. This one has earned the alarm.
    } else if (progress > 0.66 && _bangSaid < 1) {
      _bangSaid = 1;
      hud.say?.(`${door.name} IS GIVING WAY`, '#ff8a48', 2.0, hud.RANK.wound);
    }
  };

  /**
   * 🕳️ **THE ACT BREAK — AND IT IS THE ONE EVENT IN THIS GAME THAT IS GOOD NEWS.**
   *
   * `dig.md` §1: *"someone finds the interconnect, the barrier drops house-wide, and the estate
   * becomes the connected, breachable place the current game already is. That is a genuine act
   * break, and the moment it flips is a broadcast event: someone else got through first."*
   *
   * ⚠️ **DENY RANK, NOT ALARM.** `hud.js`'s standing rule is that the alarm vocabulary belongs to
   * the hunter and to nothing else; putting the best thing that can happen to you into the same
   * channel as "IT HAS SEEN YOU" would teach the player to read that channel as noise. And the
   * colour is the daylight cyan the exit already uses (`#8fd8f0`), because this is the same
   * category of news: a way through opened.
   *
   * ⚠️ The audio is `playWallStage(4)` — the wall-opening sound the whole house already knows,
   * at the stage it already means "that one went all the way". Nothing new to author, and it is
   * the sound the finder just made, heard by everyone.
   */
  room.onBarrierUnlock?.(({ edges, mode }) => {
    hud.say?.(mode === 'edge' ? 'A WALL GAVE WAY' : 'THE HOUSE IS OPEN', '#8fd8f0', 2.4, hud.RANK.deny);
    playWallStage(4);
    if (window.__rrr) window.__rrr.unlocked = { edges, mode, t: +(run?.t ?? 0).toFixed(2) };
  });

  // ---- THE HOUSE IS SEALED, AND IT HAS TO SAY SO ONCE.
  //
  // `escape.md` §2: "the first thing the player learns is that force alone does not work,
  // which is what makes the concealed exits a discovery rather than a chore." That lesson is
  // carried by DRESSING in the design — chains, a padlock, boards, a folding chair — and the
  // dressing is §10.6, estate-owner work that is not built. Without it, a chained site is a
  // wall panel that eats bullets and never opens, which reads as a bug in the wall system.
  //
  // So: one line of text, at DENY rank, the first time the player attacks a padlocked exit.
  // Not amber-red and not at alarm rank — `hud.js`'s own rule is that the alarm vocabulary
  // belongs to the hunter and nothing else, and this is an answer to a button the player is
  // pressing, which is exactly what DENY is for. Once per site per run: the second time you
  // shoot the same door you already know.
  //
  // `weapons.onWallHit` is an existing hook with no other caller — the wall damage path did
  // not need widening for this.
  //
  // ⚠️ IT KEYS ON THE CONNECTOR'S **STATE**, NOT ON MEMBERSHIP OF THE EXIT POOL. Same behaviour
  // on today's floor plan, because the only CHAINED connectors in it are exit sites — but the
  // line is about a padlock, not about a doorway to the garden, and the moment a generator
  // chains a connector between two ROOMS this reads correctly instead of going silent. It is
  // still a post-commit reveal: you learn it by shooting, which is the gamble, not before.
  const toldAbout = new Set();
  weapons.onWallHit = (panel, point, res) => {
    const r = conn.get(panel.id);
    if (!r) return;
    if (r.state === CONNECTOR.EXIT) {
      // It just went. The one thing worth saying about the way out is that there IS one now:
      // §7's "the first escape gives away the answer" starts here, with the player's own work.
      if (panel.state.stage >= FINAL_STAGE && !toldAbout.has(`open:${r.id}`)) {
        toldAbout.add(`open:${r.id}`);
        hud.say?.(`${r.spec.name ?? 'THE WAY OUT'} IS OPEN`, '#8fd8f0', 1.8, hud.RANK.deny);
      }
      return;
    }
    if (r.state !== CONNECTOR.CHAINED) return;
    if (res?.changed) return;               // cannot happen on a chained connector; cheap guard
    if (toldAbout.has(r.id)) return;
    toldAbout.add(r.id);
    hud.say?.('CHAINED FROM THE OUTSIDE', '#cbbfa6', 1.7, hud.RANK.deny);
  };

  /**
   * IS THIS BODY OUT OF THE HOUSE — through THAT opening?
   *
   * Four conditions, and every one of them is load-bearing. Measured by breaking each in
   * `harness/scenarios/escape.mjs` E7:
   *
   *   1. the panel is not blocking       an unopened exit is a wall; standing against it from
   *                                      either side is not an escape
   *   2. the point is in NO space        "outside" is the absence of a room, which is what it
   *                                      literally is here. ⚠️ THIS IS NOT REDUNDANT WITH 3
   *                                      AND 4: the chapel's vestry door faces WEST across the
   *                                      gallery, whose clear extent reaches to z = -31.00 and
   *                                      overlaps the far corner of the box below by 4 cm. A
   *                                      player standing in the gallery is on the outside side
   *                                      of that plane and within its lateral span. `pad = 0`,
   *                                      because the default 0.6 m grace would keep claiming a
   *                                      body that has already walked out through the hole.
   *   3. the outside side of the plane   derived, never authored — see `exits` above
   *   4. through the OPENING, not the wall  0.45 m clear of the plane (the outer wall face is
   *                                      only 0.15 m out) and inside the aperture's own width
   *
   * `pos.y` is not tested and must not be: `Player.update` pins it to `floorY` every frame.
   * There is no vertical axis in this game — see the note on the exit table in `spaces.js`.
   */
  const _exv = new THREE.Vector3();
  function outThrough(e, pos) {
    if (e.panel.blocksMovement()) return false;
    if (room.spaceAt(pos, 0)) return false;
    if (e.panel.sideOf(pos) !== e.outSign) return false;
    const n = e.panel.normal;
    _exv.set(pos.x - e.panel.root.position.x, 0, pos.z - e.panel.root.position.z);
    const along = Math.abs(_exv.x * n.x + _exv.z * n.z);
    // the lateral axis is the panel's own, so this works for X-normal and Z-normal walls alike
    const lateral = Math.abs(_exv.x * n.z - _exv.z * n.x);
    return along >= 0.45 && lateral <= e.halfW + 1.0;
  }

  // ---------------------------------------------------------------- input
  const input = new Input(engine.canvas, { enabled: !engine.capture });
  const director = new Director(player, weapons, room, hunter, limbField);

  const _camDir = new THREE.Vector3();
  let lastPlace = null;

  let resetAt = LOOP;
  /**
   * ♻️ **EVERYTHING A ROUND OWNS GOES BACK.** John, 2026-08-09: *"when you hit retry after you
   * die or when you respawn after wining everything needs to be reset properly."*
   *
   * He named two symptoms; the instruction is the general one, so the list below is an audit of
   * what a round actually owns rather than a patch for the two he saw. What was leaking:
   *
   *   · **held keys** — the worst of them, and its own story: *"movement input continue
   *     permanently after an escape."* A HELD-key set is emptied only by `keyup`, and across a
   *     modal / pointer-lock exit / alt-tab that `keyup` can land nowhere. `Input.clearInput`
   *     is called here AND on lock loss AND on blur, because the leak has three entrances.
   *   · **the sledgehammer prop** — `unequip()` STOWS, it does not un-draw (see
   *     `SledgeRig.forget`, added for this): the player wore last round's hammer while the game
   *     said they had never found one and a second lay on the floor.
   *   · **the HUD's own visibility** — `buildEscapeWatch` calls `hud.setHidden(true)` because a
   *     modal owns the frame, and nothing ever turned it back on. A live retry from the WIN
   *     screen therefore started with no HUD at all: no sockets, no clock, no prompts. Nobody
   *     saw it because the only retry that existed when that line was written was a page reload.
   *   · **a live grapple pull** (`player._pull`) drives velocity for up to 1.6 s and overrides
   *     the stick while it does, so a reset mid-line teleported the new round's spawn sideways.
   *   · **a carried limb** — `rig.held` pointed at an item whose root the clear loop below had
   *     just removed from the scene: a fist holding a thing that no longer exists.
   *   · 🛼 **THE WHOLE LOADOUT — the skates, a socket gadget, a limb on the wrong side.** The
   *     one this audit itself got wrong, reported live on 2026-08-10: *"I escaped with the
   *     skates on and respawned with them... we were supposed to have fixed the reset not
   *     working on load out and all the items."* The refit loop below can only FILL an empty
   *     socket, so last round's kit read as already correct and stayed bolted on; the skates
   *     are not a socket occupant at all. `stripToLoadout()` is the missing half — see its own
   *     note for the measured census of what was surviving a respawn.
   *   · **the socket cursor** (`_target`) and the E/Q hold timers, which are module-level.
   *   · **the camera's own smoothing** — `_first` makes the boom SNAP to the new pose instead of
   *     sliding 12 m across the house over the first half second of the new round.
   *
   * ⚠️ **DELIBERATELY NOT RESET, and both are decisions rather than omissions:** the black point
   * ([G]) and the dig power ([ / ]) are John's testing preferences, not round state — a reset
   * that silently put them back would make them useless for the thing he wants them for.
   * `barriersOff` IS reset, and that is also deliberate: `applyExitPlan()` below has already
   * re-armed every barrier, so leaving the flag set would make the toggle lie about the walls.
   */
  function resetRound(nextSeed) {
    input.clearInput(true);
    wallField.resetAll();
    for (const p of room.panels) { p._apply(); p._recomputeBox(); }
    room.resetFurn?.();
    player._pull = null;
    player.rig.dropHeld?.();           // ...before the clear below, so it goes back in the field
    // 🛼 AND TAKE OFF WHAT THE LAST ROUND PUT ON — skates, socket gadgets, a limb fitted to the
    // wrong side. Also before the clear, so everything it ejects is swept by the same loop; see
    // `stripToLoadout`'s own note for the census and for why the refit loop below could not do
    // this on its own.
    stripToLoadout();
    // ⚠️ **AND FREE WHAT IT THROWS AWAY, OR THE ROUND COSTS SIX PROPS' WORTH OF VRAM.** This
    // loop used to only unparent and de-list, while `spawnWorldGadgets()` + `spawnWorldSledge()`
    // immediately below build six replacements from scratch — five `buildGadget()`s and a
    // `buildSledgeProp()`. Unparenting frees nothing on the GPU: three.js releases a geometry or
    // material only on an explicit `dispose()`, so every reset orphaned six props' geometries and
    // materials and allocated six more. Capture resets every 28 s and every retry/death/win calls
    // this too, so it accumulated for a whole session.
    //
    // ⚠️ **DISPOSE ONLY WHAT THE ITEM OWNS — DO NOT WALK THE SUBTREE.** The obvious version of
    // this fix, traversing `it.root` and disposing every geometry/material found, corrupts the
    // player: a limb item's root IS `unit.limbs[...]`, which `refit()` below reclaims and
    // reattaches, and `_armStub()` builds a gadget arm's stub from `mesh.clone()` — which SHARES
    // geometry and material with the real arm it was cloned from. Walking either would free
    // meshes the body is still using. `ownedBuild` (limbs.js) is the ownership record instead:
    // set only where something was built for this item alone, null on every limb.
    //   ownedBuild  the world pickup's own prop — the five gadgets and the sledge.
    //   gadgetObj   a gun that came off with its arm mid-round (hunter attack, or a gadget
    //               displaced by another). `stripToLoadout()` above covers the sockets it
    //               strips and nulls each one as it goes; this covers the ones already lying
    //               on a floor, which nothing was freeing at all.
    // Both are safe to free here precisely because nothing reuses a field item after this line:
    // `refit()` rebuilds limbs from `unit.limbs` and `fitGadget()` builds a fresh gadget.
    for (const it of [...limbField.items]) {
      it.root.removeFromParent();
      it.ownedBuild?.dispose?.(); it.ownedBuild = null;
      it.gadgetObj?.dispose?.(); it.gadgetObj = null;
      limbField.take(it);
    }
    // ⚠️ AND PUT THE WORLD BACK, OR A RETRY IS PERMANENTLY UNARMED. The clear above empties
    // `limbField.items` completely, including every gadget and the sledge — nothing was ever
    // re-spawning them, which `spawnWorldGadgets`/`spawnWorldSledge`'s own comments cover. A
    // player who dies or wins once now starts their next life in a house with nothing on any
    // floor: worse than the bug this slice exists to fix.
    spawnWorldGadgets();
    spawnWorldSledge();
    // 🔨 THE SLEDGE'S ACQUISITION RESETS TOO, AND IT TAKES THE PROP WITH IT.
    //
    // John, 2026-08-09: *"the sledge will appear floating in front of me but I need to pick up a
    // new one to use it after restarting the level from an escape."* This line USED to be
    // `unequip(); owned = false;`, which is two thirds of a reset: `unequip()` does not un-draw
    // the hammer, it `_mount('stow')`s it — reparented to the chest and left there, drawn. So a
    // retry wore last round's hammer while `owned` said the player had never found one and a
    // second prop lay at the spawn anchor. `SledgeRig.forget()` (see its own long note) is the
    // method that takes BOTH: state and prop, or neither.
    //
    // ⚠️ IT LEAVES THE PLAYER UNARMED ON PURPOSE. John, 2026-08-08: *"yes start unarmed. put the
    // sledge in the first room for the player to find imediatly."* `spawnWorldSledge()` above has
    // already put a hammer back on the floor, so a retry replays the opening beat; the ghost on
    // his back was the defect, not the walk to pick it up.
    player.sledge.forget();
    // Rebuilding the player from scratch is overkill; refit what is missing.
    //
    // ⚠️ THIS BLOCK USED TO BE A NO-OP, AND IT WAS A CONFIDENT, WELL-COMMENTED ONE. It read
    // `player.rig.sockets[s].item` to find "the original spare" — but `LimbRig.detach()` ends
    // with `c.item = null`, so that lookup returns null for exactly the sockets that need
    // refitting, `continue` fires, and nothing is ever restored. It also listed three sockets,
    // omitting `shoulderL` — the FIRST one `HunterAI._attack` takes.
    //
    // Measured over seven staged 5 m encounters on one page, calling `resetRound()` between
    // each: the round-start limb count fell 3 -> 2 -> 1 -> 0 and stayed at 0. Past zero the
    // player is `downed`, `_sense` skips downed candidates outright, and the hunter stops
    // perceiving anyone at all — so four of those seven "identical" trials recorded no attack,
    // no approach and no contact, from staging code that was byte-for-byte the same. THAT is
    // the mechanism behind "identical trials, wildly different outcomes": the trials were not
    // identical, and nothing on screen said so. The capture Director resets every 28 s, so
    // every pass after the first was quietly running a more dismembered player than the last.
    //
    // `LimbRig.refit()` (added with this fix) does it properly, from `unit.limbs`, which is
    // the one reference a detach cannot invalidate. Gadget sockets go back through
    // `fitGadget` so the nail gun returns with the arm it costs.
    //
    // ⚠️ **AND IT ONLY FILLS — IT CANNOT EMPTY.** The `continue` below skips any socket that is
    // not empty, which for its whole life meant last round's gadget counted as "already
    // correct" and stayed on the body. `stripToLoadout()` above is what makes this `continue`
    // safe: by the time this loop runs, anything still in a socket has been verified against
    // `LOADOUT` by identity, so the only sockets left to touch are genuinely empty ones. Do not
    // reorder these two — this loop is the second half of a pair.
    for (const e of LOADOUT) {
      if (player.rig.occupant(e.socket) !== 'empty') continue;
      if (e.type === 'gadget' && e.gadget) player.rig.fitGadget(e.socket, e.gadget);
      else player.rig.refit(e.socket);
    }
    hunter._pull = null;         // and stop the absorb animation dragging a part we took back
    player.pos.copy(engine.capture ? room.spawn.capture : room.spawn.player[0]);
    player.vel.set(0, 0, 0);
    player.facing = Math.PI; player.aimYaw = Math.PI;
    cam.yaw = Math.PI; cam.pitch = 0;      // the boom resets with the round, not 5 s into it
    armFurnDemo(); // re-park in the chair circle if ?furndemo=1
    armFurnLine(); // re-park at Meshy smash row if ?furnline=1
    // Snap, do not slide: a 0.35 s light lerp across a round reset reads as the room
    // re-lighting itself in the first second of the loop.
    rig.snapTo(room.spaceAt(player.pos) ?? room.spaces[0]);
    lastPlace = null;
    hunter.root.position.copy(room.spawn.hunter);
    hunter.vel.set(0, 0, 0);
    hunter.state = 'PATROL'; hunter.target = null;
    hunter.absorbed = 2;
    // ⚠️ THE PERCEPTION STATE HAS TO RESET TOO, AND IT DID NOT. Putting the body back at the
    // spawn while leaving `awareness` at the 1.0 the last round ended on means the next round
    // opens with the hunter one frame from PURSUE at a spawn 23.7 m away through two walls —
    // the exact beat §6.2 is built to prevent, and it would have shown up as the second and
    // every subsequent capture loop being a different game from the first. `routeIdx` matters
    // for the same reason: `PATROL_ROUTE[0..2]` walking east and north away from D4/D5 is what
    // buys the opening's quiet minute, and resuming mid-route throws that away.
    hunter.awareness = 0;
    hunter.routeIdx = 0; hunter.dwellLeft = null;
    hunter.searchTimer = 0; hunter.breachTarget = null;
    // ...and the fight state, which is invisible from out here and so was never reset: the
    // strike windup, the slam rhythm and the stagger economy. See `HunterAI.resetCombat`.
    hunter.resetCombat();
    // 🔊 ...and the NOISE BUS, for the identical reason. Events live 2.4 s; a capture Director
    // that resets every 28 s would otherwise open each loop with the previous round's dig still
    // audible and summon the hunter on frame one. `resetCombat` clears the hunter's own consumed
    // sequence, so the two cannot get out of step.
    noise.clear();
    hunter.lastKnown.copy(room.spawn.hunter);
    if (hunter.stage !== 1) {
      hunter.stage = 1;
      for (const s of [1, 2, 3]) hunter.rigs[s].root.visible = s === 1;
    }
    // radius tracks stage and is only rewritten at the END of a growth, so a round that reset
    // out of stage 3 kept a 0.66 m body on a stage-1 rig and could not fit through D7.
    hunter.radius = 0.30 + hunter.stage * 0.12;
    // ⚠️ THE RUN AND THE EXIT PLAN HAVE TO COME BACK TOO, AND `wallField.resetAll()` ABOVE IS
    // NOT ENOUGH ON ITS OWN. `WallState.reset()` puts every panel at stage 0 of ITS OWN table
    // — so a live exit whose lock started it at `beam` would silently restart the next capture
    // loop at `wallpaper`, i.e. 165 hp of extra work that no scenario asked for and nothing on
    // screen would explain. Re-deriving the plan from the same seed also proves the seeded
    // selection is stable across a reset, which is the property a lobby will depend on.
    // `run.reset(seed)` defaults to the seed it already has, so passing nothing is "same run
    // again" and passing one is "a different house" — which is what a page reload used to buy
    // on the win screen. See `liveRestart`.
    run.reset(nextSeed);
    applyExitPlan();
    // 🧪 `applyExitPlan()` just re-armed every barrier and re-derived the interconnect on its
    // own path (see `toggleBarriers` below) — so a normal round reset (R, death, win) must drop
    // the B-toggle's local flag back to false too, or it would silently read "off" against walls
    // that a real reset had already put back on.
    barriersOff = false;
    barrierMsgUntil = 0;
    toldAbout.clear();
    director.reset();
    // ---- and the four the audit above NAMES but nothing was actually doing. Each one was
    // written into that comment as a finding and then not carried into this body; they are
    // listed there, so the fix is here rather than in a second list.
    //
    // 🚨 THE HUD'S OWN VISIBILITY. `buildEscapeWatch` does `hud.setHidden(true)` because a modal
    // owns the frame, and nothing ever turned it back on — so a live retry FROM THE WIN SCREEN,
    // which is the single most likely way to reach this function, started with no HUD at all:
    // no sockets, no clock, no prompts. Invisible until now because the only retry that existed
    // when that line was written was a page reload, which rebuilt the HUD from scratch.
    hud?.setHidden?.(false);
    // The boom SNAPS to the new pose rather than sliding across the house over the first half
    // second of the round. `cam.yaw`/`cam.pitch` are set above; `_first` is what stops
    // `ThirdPersonCamera.update` easing from wherever the last round left the camera standing.
    cam._first = true;
    // Module-level input state — the socket cursor and the E/Q hold timers. See its own note.
    resetLiveInput();
    // 🧹 AND THE FLOOR. `DebrisSystem.clear()` exists and its own comment says nothing in the
    // game calls it; a round reset is precisely the caller it was waiting for. Without it a
    // retry inherits the last round's rubble AND its settled pile, which is both wrong on
    // screen and a draw-call cost that accumulates across every retry in a session.
    // ⚠️ Dust deliberately gets no call: it has no `clear()`, and it does not need one — every
    // puff is a short-lived particle that expires on its own inside `dust.update(dt)`, so the
    // only trace it can leave is a second or two of settling haze. Writing `dust.clear?.()`
    // here would be a silent no-op that reads like a handled case, which this file has been
    // bitten by before (see `hud.reset()` in `liveRestart`).
    debris.clear?.();
  }

  /**
   * ⚡ RETRY WITHOUT RELOADING THE PAGE.
   *
   * `buildDeathWatch` and `buildEscapeWatch` both used `location.reload()`, and both documented
   * the same reasoning: *"a hand-rolled reset would have to unwind the player, the limb field,
   * wall damage, hunter growth, debris, dust and the director — and this project's history is a
   * catalogue of partial fixes that looked complete. A reload is provably total. It costs the
   * texture bake again, which is the honest price of being certain."*
   *
   * **The reasoning was right and the price was wrong, because nobody had measured it.**
   * `warmupStats.warmMs` now does: the load compiles **1054 shader programs in ~83 s** at
   * 1280x720, and John measured **~5 minutes** in Chrome at 1080p. So the "honest price" of a
   * retry was several minutes, paid on every death and every win — which is not a price a
   * playtest can afford, and it is why John reported *"every time I retry after dying or
   * finishing, the game loads from the start."*
   *
   * ⚠️ AND THE OTHER HALF OF THE REASONING HAS EXPIRED TOO: the hand-rolled reset it feared
   * **already exists and is exactly `resetRound()` above.** It is not new code written for this
   * change — it runs every 28 s in capture, `escape.mjs` asserts it restores the exit plan, and
   * its own comments are a record of the partial-reset bugs (the limb refit no-op, the unreset
   * `awareness`, the stale `routeIdx`, the stage-3 radius) already being found and fixed. This
   * function reuses it rather than duplicating it.
   *
   * What `resetRound()` does not own, because they belong to the overlays: the modal itself, the
   * HUD's carried state, and pointer lock. Those are handled by the callers.
   *
   * `?retry=reload` restores the old full-reload behaviour for comparison.
   */
  const _retryMode = new URLSearchParams(location.search).get('retry');
  const liveRestart = () => {
    if (_retryMode === 'reload') { location.reload(); return; }
    // Match what a reload would have produced: a URL-pinned seed survives a reload, so retry
    // keeps it; an unpinned run drew `String(Date.now())` at boot, so retry draws a fresh one
    // and the next house is different. That preserved property is the one thing the win
    // screen's reload was explicitly buying.
    resetRound(qsRun.get('seed') ? undefined : String(Date.now()));
    // The HUD needs no explicit reset and deliberately does not get a fake one: the rosette is
    // repainted from the rig every frame, `setRunClock` is driven from `run.t` by the loop, and
    // callouts expire on their own timers. There is no `hud.reset()` — writing `hud?.reset?.()`
    // here would have been a silent no-op that read like a handled case.
  };

  /**
   * 🧪 TESTING AFFORDANCE ONLY — NOT A GAME MECHANIC. John, 2026-08-08: *"for testing purposes
   * I would like a button to toggle off and on the cyan walls making to reset the interconnect
   * mechanic too."* He is iterating on the dig and cannot currently re-test the puzzle without a
   * fresh run: once the interconnect is found, the house-wide unlock drops every barrier for
   * good. Bound to B — unbound (Space/WASD/Shift/E/Q/R/arrows are all taken, see `Input` in
   * `src/game/player.js`).
   *
   * Composes only what already exists, per dig face:
   *   OFF  `panel.setBarrier(false)` — `DamageField.setBarrierEverywhere` via `wall.js`. Clears
   *        the cyan everywhere so a dig goes through anywhere, without touching depth (whatever
   *        is already dug stays dug — this is the barrier channel only).
   *   ON   `room.setDigPlan({ link, seed })` — the exact call `applyExitPlan()` already makes on
   *        every round reset. It re-arms the barrier on every face first
   *        (`setInterconnect(null)` fills the channel back to 1), HEALS every dig face's damage
   *        (`resetDamage()`, inside `setDigPlan`'s free-mode branch), and only then re-derives a
   *        fresh interconnect region from the seed. That is "reset the interconnect mechanic",
   *        not only the wall look — a barrier put back behind an already-dug wall would not
   *        reset anything.
   *
   * ⚠️ Deliberately does NOT call `resetRound()`/`run.reset()`: those also reshuffle the escape
   * exit/lock and move the player and the hunter, which is the ESCAPE mechanic, not the
   * interconnect one — this is meant to be a no-consequence retest of the dig, not a new round.
   * `resetRound()` still re-arms everything correctly on its own path (R, death, win), so
   * `barriersOff` is dropped back to false there too, or a round reset would leave this toggle
   * silently out of sync with what the walls actually show.
   *
   * Seed mirrors `liveRestart` above, exactly: a pinned `?seed=` keeps re-deriving from that same
   * seed (`run.seed` never changes when pinned); unpinned draws a fresh one every time B re-arms
   * the barrier, so each cycle is a new puzzle — never touching `run.seed` itself, since that
   * would also be read by a later real round reset and is the escape mechanic's own state.
   *
   * ⚠️ Wired through `input.consume('KeyB')` inside the `!engine.capture` branch of the update
   * loop below, never through `liveInput`'s own call chain reached from capture — and `Input`
   * (`src/game/player.js`) attaches no listeners at all when `engine.capture` is true
   * (`enabled: !engine.capture` at construction, above). So this cannot fire under `?capture=1`
   * or any scenario, by construction, not by a flag someone could forget to check.
   */
  let barriersOff = false;
  let barrierMsg = '';
  let barrierMsgUntil = 0;
  const toggleBarriers = (t) => {
    barriersOff = !barriersOff;
    if (barriersOff) {
      /**
       * 🚨 **[B] WAS PRINTING A PROMISE IT DID NOT KEEP, AND THE SECOND PASS IS THE FIX.**
       *
       * It printed *"BARRIERS OFF — DIG ANYWHERE"*, which is a claim about GETTING THROUGH, and
       * `_pf1-diag.mjs` measured it false: after [B] the near face was open with a **1.46 m
       * channel**, the twin was **untouched and solid**, and a body was refused. John hit it in
       * play — he dug a hole in the gallery and could not walk through it.
       *
       * 🎯 **AND THE CAUSE IS AN ORDERING ONE, NOT A MISSING MECHANIC.** Depth is per side by
       * design (`dig.md` §5), and the thing that reconciles the two sides already exists:
       * `WallPanel._couple()` mirrors every through-cell onto the twin, and `applyHit` fires it
       * on `res.brokeThrough`. But `brokeThrough` requires a cell to reach `OPEN_AT` **with no
       * barrier behind it** — so while the cyan is up, a player digging to the barrier NEVER
       * breaks through and `_couple()` never runs. Clearing the barrier afterwards does not
       * retroactively fire it: the near face's cells now read as through, the twin was never
       * told, and the result is a hole you can see through and cannot enter.
       *
       * So the pass below is not "dig for the player" — it digs nothing and removes no material
       * the player did not already remove. It replays the coupling that the barrier suppressed,
       * on the cells they already excavated. Two separate loops, and the order is load-bearing:
       * `_couple()` skips any source cell with `f.barrier[i]` still set, so every barrier in the
       * house must be down before the first mirror runs, or the faces cleared last would couple
       * against faces that were still armed when they were read.
       *
       * ⚠️ **THE RENDERER HALF IS DELIBERATELY NOT TOUCHED AND IS NOT THIS KEY'S BUG.** Once you
       * dig through your own side, the twin's `FrontSide` planes are backface-culled from your
       * eye, so remaining wall is invisible and nothing on screen explains a refusal. That is a
       * real defect (HANDOFF's open list, Phase 1 of the campaign, owner `wall.js`) and it is
       * what made this one so hard to see — but the fix for a lying prompt is to stop it lying.
       */
      for (const p of room.panels) if (p.spec?.dig) p.setBarrier(false);
      let opened = 0;
      for (const p of room.panels) {
        if (!p.spec?.dig) continue;
        const before = p.field?.channel?.().open === true;
        p._couple?.();
        if (!before && p.field?.channel?.().open === true) opened++;
      }
      // ...and SAY WHAT IT DID. The count is the honest part: on a fresh house nothing has been
      // dug yet and it reads 0 opened, which is correct and is the state the old message was
      // already lying about. "DIG ANYWHERE" is true once the cyan is down; whether anything is
      // walk-through yet is a separate fact and now gets its own words.
      barrierMsg = opened > 0
        ? `[B] BARRIERS OFF — DIG ANYWHERE  ·  ${opened} BREACH${opened > 1 ? 'ES' : ''} NOW OPEN THROUGH`
        : '[B] BARRIERS OFF — DIG ANYWHERE  ·  NOTHING DUG THROUGH YET';
    } else {
      const seed = qsRun.get('seed') ? run.seed : String(Date.now());
      room.setDigPlan?.({ link: interconnectIds(seed), seed });
      barrierMsg = `[B] BARRIERS ON — FRESH HUNT — SEED ${seed}`;
    }
    barrierMsgUntil = t + 4;
  };

  // 🎨 [G] — cycle the black point. See `BLACK_POINTS` above for why this is a key and not a
  // decision. Shares `barrierMsg`'s prompt slot rather than adding HUD furniture; the two are
  // never pressed in the same frame and whichever fired last is the one worth reading.
  const cycleBlackPoint = (t) => {
    blackPoint = (blackPoint + 1) % BLACK_POINTS.length;
    applyBlackPoint();
    barrierMsg = `[G] BLACK POINT — ${BLACK_POINTS[blackPoint].name}`;
    barrierMsgUntil = t + 4;
  };

  /**
   * 🎨 **[C] — CYCLE THE WALL'S COAT. John's eye decides this one, exactly as [G] does.**
   *
   * `wall.js`'s `COAT_ARMS` carries the full argument and the measured price of each arm. The
   * short version: arm 0 is the shipped build, arm 1 gives every face its own room's skin for
   * **+0 shader programs**, and arm 2 additionally matches the gallery's paper exactly for
   * **+1 program family (≈+6 at boot, ~0.6 s of cold boot)**.
   *
   * 🚨 **THE PROGRAM COUNT IS PRINTED WITH THE ARM, AND THAT IS THE POINT OF THE MESSAGE.** A
   * still frame is the wrong instrument for a look question, and a look question with a price tag
   * is worse — he has to be able to see both at once, on the wall, while walking. `changed` is in
   * there too so "I pressed it and nothing moved" and "it moved and I cannot see it" can never
   * read the same.
   */
  const cycleCoat = (t) => {
    const r = setCoatArm(coatArm() + 1, room?.panels ?? [], engine.renderer);
    barrierMsg = `[C] COAT ${r.arm} ${r.tag} — ${r.name}  ·  ${r.changed} faces  ·  ${r.programs} programs`;
    barrierMsgUntil = t + 6;
  };

  /**
   * 🛩️ **[F] — THE FLY-OVER. RISE ABOVE THE HOUSE WITH THE ROOF OFF.**
   *
   * John, 2026-08-15, about a measurement that could not be taken: *"could we remove the roof and
   * do a fly over check?"* It answers two separate questions and both of them were stuck.
   *
   * 1. **HE CANNOT JUDGE A HOUSE HE CANNOT SEE.** Twice — *"I don't know the feel and can't
   *    understand from just a map"* — which is why the generated plan was made walkable. But
   *    walking is a poor way to answer *"does this read as a place or as a layout"*, and the map
   *    designer draws a DIAGRAM from the plan tables, not the built house. This is the missing
   *    middle: the real geometry, the real materials, the real lights, seen whole.
   * 2. 🚨 **`px>16` IS BLIND IN A GENERATED HOUSE AND IT COST A ROUND** (`dressfix-1`). Mean frame
   *    luma is **6.65 of 255** in there, so a 26 m chain across a wall measured **8 pixels**;
   *    at `px>2` the same mesh is 5629 px. Every look test in this project is tuned on the LIT
   *    authored house and silently reports "no change" on a generated one. A lit, roofless,
   *    top-down frame is a view a pixel test can work in — and this file states its own luma
   *    rather than asserting that (`_flyover1-view.mjs` L4/L5 measure the histogram).
   *
   * ---------------------------------------------------------------------------------------
   * THE FOUR DECISIONS, TAKEN RATHER THAN ASKED, AND WHY
   * ---------------------------------------------------------------------------------------
   * **PERSPECTIVE, NOT ORTHOGRAPHIC.** An orthographic top-down of a roofless house is a MAP
   * with textures on it — every wall reduced to the 0.30 m line of its own top — which is the
   * exact artefact John already said he cannot judge from. The shipped 66° perspective sees the
   * INNER FACE of every wall that is off the frame's centre, so the ornate coat, the skirting,
   * the dig faces and the doorway reveals are all in the picture. That is the difference between
   * a plan and a place. It also costs nothing: `engine.camera` stays the same `PerspectiveCamera`
   * object with the same fov, so the pipeline, the AO pass and the shadow map are untouched — an
   * ortho swap would have been surgery on `Pipeline`'s camera.
   *
   * **THE WHOLE ENVELOPE, FITTED, NOT A ROOM AND NOT A FIXED HEIGHT.** The height is solved from
   * `room.bounds` and the live fov/aspect, so `?planrooms=3`, `?planrooms=6` and the authored
   * house each frame themselves. A fixed height would crop one of them and waste the frame on
   * the other two. Screen-up is world **−Z** and screen-right world **+X**, which is plan
   * orientation and matches the map designer, so the two can be laid side by side.
   *
   * **THE DEPTH HAZE COMES OFF, AND THIS IS ARITHMETIC, NOT TASTE.** `shaders.js` mixes every
   * pixel toward `hazeColor` by `f = 1 − exp(−linZ · haze)`. At the shipped 0.042 and a 40 m
   * eye that is **f = 0.81**: four fifths of every pixel in the frame replaced by a flat dark
   * brown. The fly-over would have rendered a fog of the house's own colour and no assertion in
   * it would have meant anything. Haze and the 0.24 vignette both go to 0 while it is up.
   *
   * **THE HEMISPHERE COMES UP.** There is ONE light rig in this view and it is REPOSITIONED
   * between rooms (see `makeLightRig`) — so from above, exactly one room is lit and the rest are
   * black. `fill` is the only light every room shares, its intensity is the one field the rig
   * never writes (it lerps `groundColor` and nothing else), and a floor normal points UP so it
   * receives `skyColor` in full. Raising it is therefore a per-light UNIFORM and cannot move
   * `numPointLights` — the count `calls-1` measured at **+52 shader compiles** when it moved.
   * `?flyfill=` and `?flyhaze=` are the knobs; `genlight-1`'s rig is left exactly as it is.
   *
   * ---------------------------------------------------------------------------------------
   * 🚨 WHAT IT IS FORBIDDEN TO TOUCH
   * ---------------------------------------------------------------------------------------
   * **RESIDENCY IS LOAD-BEARING AND THIS DOES NOT CHANGE IT — IT USES IT.** `visibleSpaces()`
   * peaks at 4 in play because `setViewpoints` walks portals from where you stand. A fly-over
   * needs every space at once, and `setViewpoints` **already takes an ARRAY, written for split
   * screen**: one viewpoint parked in the centre of every space makes the union of the house
   * resident through the shipped code path, with no new residency rule and no branch inside
   * `room.js`. The player's own viewpoint goes in LAST so `_cur` is left on the player's space
   * and the frame after [F] is released is the one the walker would have had anyway.
   *
   * **THE ROOF IS HIDDEN GEOMETRY AND NOTHING ELSE.** `room.setLid(false)` writes `visible` on
   * merged ceiling buckets. It touches no collider, no portal, no `DamageField`, no
   * `blocksSight`. HANDOFF: *"every collider in the house is always live"* — and it stays that
   * way, because a hidden room whose colliders went with it would sail the camera boom into an
   * invisible wall and black the frame, which is this project's most expensive failure class.
   *
   * ⚠️ **IT COSTS DRAW CALLS AND THAT IS ACCEPTED, NOT HIDDEN.** Every space resident at once is
   * a number nothing in play ever asks for, and `_flyover1-view.mjs` A3 reports it against the
   * 625 budget as a fly-over figure. What is NOT accepted is moving the number during play: the
   * same probe flips [F] **in place at one station** (never across a walk — `ballroom.centre`
   * read 423/461/479 on one build) and requires the OFF arm either side to be identical.
   *
   * ⚠️ Read inside the `!engine.capture` branch like [B]/[G]/[C], and `Input` attaches no
   * listeners at all in capture mode, so no `?capture=1` run and no stored baseline can reach it.
   */
  const FLY_FILL = Number(qsRun.get('flyfill') ?? 26);
  const FLY_HAZE = Number(qsRun.get('flyhaze') ?? 0);
  /**
   * The shipped terms this borrows, captured rather than restated. [G] writes `lift`, `toeCrush`
   * and `contrast` and none of these three, so restoring them is exact on every black-point arm.
   */
  const GRADE_HAZE = 0.042, GRADE_VIGNETTE = 0.24, FILL_I0 = fill.intensity;
  /** How much clear air to leave around the envelope, in metres, so the walls are not clipped. */
  const FLY_MARGIN = Number(qsRun.get('flymargin') ?? 2.5);
  /**
   * 🎥 **[F] TAKES THE MOUSE WHILE IT IS UP — John, 2026-08-15: *"but I want to control the
   * angle."*** Two axes, and no new keys at all.
   *
   * 🚨 **AND ROUTING THE LOOK INTO THE FLY-OVER IS WHAT PROTECTS THE ROUND TRIP, NOT WHAT
   * THREATENS IT.** The brief's constraint is that `[F]` must still drop him back into the boom
   * exactly as it does now. The shipped build already fed `cmd.look` straight into `cam.look()`
   * every frame the fly-over was up — so swinging the overhead view with the mouse would have
   * spun the BOOM'S yaw at the same time, and he would have landed facing somewhere he never
   * chose. Sending `cmd.look` here instead **freezes `cam.yaw`/`cam.pitch` for the duration**,
   * which makes the return strictly more exact than it was. `_flyover1-view.mjs` A2/A2b still
   * measures it, and A4 is the new arm that drags the mouse 400 px in the fly-over and requires
   * the boom's yaw and pitch to come back BYTE-IDENTICAL.
   *
   * ⚠️ **NOT A NEW KEY, AND THAT IS THE POINT** — it is the control he already uses to look
   * around, it cannot collide with WASD (which still walks the robot, deliberately: watching
   * yourself move through the plan is half of what the view is for), and the arrow-key look path
   * feeds the same `cmd.look`, so there is a no-mouse fallback for free.
   *
   * 📐 **THE TILT FLOOR IS 62° AND IT IS AN OCCLUSION BUDGET, NOT A PREFERENCE.** A wall of
   * height `H` seen at elevation `θ` hides a strip of the floor behind it `H / tan θ` deep. At
   * the shipped 4.80 m storey that is **0 m at 90°, 1.75 m at 70°, 2.55 m at 62°, 4.80 m at
   * 45°**. The brief's bar — *"a tilt low enough to hide half the house behind the nearest wall
   * is worse than no tilt"* — lands the floor at 62°: 2.55 m against the generated house's
   * measured room spans (`_flyover1-view.mjs` reports them per space, with the fraction hidden).
   * ⚠️ `?flytiltmin=<degrees>` moves it, because a floor chosen by arithmetic still has to
   * survive his eye, and this project ships taste calls as live knobs with arm 0 unchanged.
   */
  const FLY_TILT_MIN = Math.max(5, Math.min(89,
    Number(qsRun.get('flytiltmin') ?? 62))) * Math.PI / 180;
  const FLY_LOOK_SENS = Number(qsRun.get('flysens') ?? 0.0026);
  let flyOn = false;
  let flyFit = null;
  let flyPrompt = '';
  /**
   * 🔒 **DEFAULT UNLOCKED, AND THAT IS JOHN'S OWN CALL RATHER THAN A GUESS.** The free-swinging
   * view is what he played and called *"really cool"*; the lock is a thing he reaches for once he
   * has framed something. Shipping it locked would make the first press of [F] feel broken.
   */
  let flyLocked = false;
  let flyYaw = 0;
  let flyTilt = Math.PI / 2;              // straight down — the landed default, byte for byte
  let flyTiltShown = 90;
  let lidHiddenNow = 0;
  const _flyEye = new THREE.Vector3();
  const _flyAt = new THREE.Vector3();
  /** One parked viewpoint per space, allocated once — see the residency paragraph above. */
  const _flyViews = [];
  /**
   * Solve the eye height from the envelope and the LIVE fov/aspect, every frame the fly-over is
   * up: `engine.camera.aspect` changes when the window does, and a fly-over that was fitted at
   * boot would crop the house the first time John resized the tab.
   */
  const flyFrame = () => {
    /**
     * 🚨 **NOT `room.bounds`, AND THAT IS A MEASURED CORRECTION RATHER THAN A PREFERENCE.**
     * `room.bounds` is the union of each space's `bounds`, and `spaces.js` builds those **inset
     * 0.4 m** to keep actors off the walls (`room.js`'s own `collide` note says so in capitals).
     * Framing to it crops 0.4 m of floor plus the 0.30 m wall on every side of the house. The
     * clear extents are what the building actually occupies.
     */
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, top = 0;
    for (const s of room.spaces) {
      if (s.x0 < x0) x0 = s.x0; if (s.x1 > x1) x1 = s.x1;
      if (s.z0 < z0) z0 = s.z0; if (s.z1 > z1) z1 = s.z1;
      if (s.storey > top) top = s.storey;
    }
    if (!Number.isFinite(x0)) { const b = room.bounds; x0 = b.minX; x1 = b.maxX; z0 = b.minZ; z1 = b.maxZ; }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const halfX = (x1 - x0) / 2 + FLY_MARGIN, halfZ = (z1 - z0) / 2 + FLY_MARGIN;
    const c = engine.camera;
    const tanV = Math.tan((c.fov * Math.PI) / 360);
    const tanH = tanV * (c.aspect || 1);
    /**
     * 🚨 **AND THE FIT IS SOLVED AT THE TOP OF THE WALLS, NOT AT THE FLOOR — THE FIRST BUILD
     * CROPPED THE HOUSE AND THE FRAME IS ON DISK PROVING IT.** Under perspective a point at
     * height `h` is `y − h` from the eye, so a 4.80 m wall top projects **1.32× larger** than
     * the floor beneath it at a 19.69 m eye. Fitting the floor plane put the far walls off the
     * top and bottom edges of a frame whose floor fitted perfectly. Solving `(y − top)·tan = half`
     * fits the extreme point of the whole building, which is the corner of the tallest wall.
     * ⚠️ **screen-up is world −Z** (see `up` in `placeFlyCamera`), so Z takes the VERTICAL
     * half-angle and X the horizontal one. `far` is 90 in this view; a house that still cannot
     * fit is clamped and the fly-over SAYS SO rather than quietly showing part of it.
     */
    /**
     * 🎥 **THE FIT IS NOW A CORNER SOLVE, AND IT REPRODUCES THE LANDED STRAIGHT-DOWN FORMULA
     * EXACTLY — WHICH IS WHY IT IS SAFE TO GENERALISE.**
     *
     * With a tilt and a swing the house is no longer axis-aligned to the frame, so "half the Z
     * span over tan(v)" stops being the answer. The general form is one line of algebra and has
     * no special cases: put the eye at `target + dir·D`; because `dir` is perpendicular to the
     * camera's own right and up axes, a point `p` (relative to the target) has camera-space
     * right/up components `p·right` and `p·up` that **do not depend on D at all**, and a depth of
     * `D − p·dir`. Requiring `|p·right| ≤ tanH·depth` and `|p·up| ≤ tanV·depth` gives
     *
     *     D ≥ p·dir + |p·right| / tanH        and        D ≥ p·dir + |p·up| / tanV
     *
     * over the eight corners of the house's box. **At tilt 90° / swing 0 that collapses to
     * `top + max(halfX/tanH, halfZ/tanV)` — the landed formula, term for term** (`dir` = +Y so
     * `p·dir` is the corner's height, `right` = +X, `up` = −Z). `_flyover1-view.mjs` A1b asserts
     * that equality on every run, so the accepted straight-down framing cannot drift under the
     * angle control.
     */
    const st = Math.sin(flyTilt), ct = Math.cos(flyTilt);
    const sy = Math.sin(flyYaw), cy = Math.cos(flyYaw);
    const dir = [sy * ct, st, cy * ct];                       // target -> eye, unit
    const up = [-sy * st, ct, -cy * st];                      // dir·up = 0 for every tilt/yaw
    const right = [up[1] * dir[2] - up[2] * dir[1],           // up × dir, three.js `lookAt`'s x
      up[2] * dir[0] - up[0] * dir[2], up[0] * dir[1] - up[1] * dir[0]];
    let want = 0;
    for (const px of [x0 - FLY_MARGIN, x1 + FLY_MARGIN]) {
      for (const pz of [z0 - FLY_MARGIN, z1 + FLY_MARGIN]) {
        for (const py of [0, top]) {
          const p = [px - cx, py - room.floorY, pz - cz];
          const along = p[0] * dir[0] + p[1] * dir[1] + p[2] * dir[2];
          const r = Math.abs(p[0] * right[0] + p[1] * right[1] + p[2] * right[2]);
          const u = Math.abs(p[0] * up[0] + p[1] * up[1] + p[2] * up[2]);
          want = Math.max(want, along + r / tanH, along + u / tanV);
        }
      }
    }
    const y = Math.min(want, c.far - 4);
    return { cx, cz, y, want, clamped: y < want - 1e-6, top, dir, up,
      halfX, halfZ, tanH, tanV,
      spanX: +(x1 - x0).toFixed(2), spanZ: +(z1 - z0).toFixed(2) };
  };
  /**
   * Written AFTER `cam.update(dt, player)` so it is the last word on the camera for the frame,
   * and before residency, which reads `engine.camera` — the same ordering the residency block
   * already documents for `cam.update`.
   */
  const placeFlyCamera = () => {
    flyFit = flyFrame();
    const c = engine.camera;
    /**
     * Straight down is degenerate against the default up (0,1,0) — `lookAt` would build a
     * zero-length basis vector and an unusable matrix. The `up` solved in `flyFrame` is the
     * tilt derivative, so it is exactly **(0,0,−1) at tilt 90° and swing 0** (which is what makes
     * the frame a PLAN, screen-up = world −Z) and rolls continuously to world +Y as the tilt
     * comes down to the horizon. It is perpendicular to `dir` at every angle, by construction.
     */
    c.up.set(flyFit.up[0], flyFit.up[1], flyFit.up[2]);
    _flyAt.set(flyFit.cx, room.floorY, flyFit.cz);
    _flyEye.set(
      flyFit.cx + flyFit.dir[0] * flyFit.y,
      room.floorY + flyFit.dir[1] * flyFit.y,
      flyFit.cz + flyFit.dir[2] * flyFit.y);
    c.position.copy(_flyEye);
    c.lookAt(_flyAt);
    c.updateMatrixWorld();
  };
  /**
   * The mouse, while the fly-over is up. Returns true if it consumed the look — the call site
   * hands it `cmd.look` INSTEAD of `cam.look()`, which is what freezes the boom.
   */
  const flyLook = (look) => {
    if (!flyOn || !look) return flyOn;
    /**
     * 🔒 **[L] — THE LOCK, AND THE WHOLE MECHANISM IS THIS EARLY RETURN.** John, after playing
     * the angle control: *"the Fly by mode has the changing camera position but it needs to be
     * able to lock and unlock."* With the mouse permanently driving the view he cannot hold a
     * composition still, and he cannot drive the robot with WASD without the house swinging under
     * him.
     *
     * 🚨 **RETURNING HERE DISCARDS THE DELTA RATHER THAN BANKING IT, AND THAT IS THE ENTIRE
     * REASON UNLOCKING CANNOT JUMP.** The obvious way to write a lock is to stop *applying* the
     * accumulated look while leaving the accumulator running — and `Input.mouse.dx/dy` is an
     * ACCUMULATOR, so that version stores every millimetre of mouse travel and spends it all on
     * the frame the lock comes off. It cannot happen here: `liveInput` calls `takeMouse()` every
     * frame whatever this function does with the result, and `takeMouse()` **zeroes the
     * accumulator as it reads it**. So the delta is already spent by the time we decline it. The
     * arrow-key look integrates through the same call and is drained the same way.
     * ⚠️ Asserted rather than argued: `_flyover1-view.mjs` **A6** drags for 30 frames locked and
     * requires the camera matrix to be byte-identical, **A7** then unlocks and requires it to
     * still be byte-identical BEFORE any new input, and **C6** runs the identical drag unlocked
     * and requires it to move — so a lock that worked by killing the key would go red.
     */
    if (flyLocked) return true;
    flyYaw -= look.dx * FLY_LOOK_SENS;
    // Wrapped rather than clamped: a swing has no ends. `%` keeps the float from growing without
    // bound over a long session, which is where a single-precision-ish drift would start to show.
    if (flyYaw > Math.PI) flyYaw -= Math.PI * 2;
    if (flyYaw < -Math.PI) flyYaw += Math.PI * 2;
    // Mouse DOWN tips the view toward straight down, which is the same sense as the game's own
    // look (`ThirdPersonCamera.look` does `pitch -= dy`, and negative pitch is DOWN in this
    // codebase). The floor is the occlusion budget above; the ceiling is vertical.
    flyTilt = Math.max(FLY_TILT_MIN, Math.min(Math.PI / 2, flyTilt + look.dy * FLY_LOOK_SENS));
    const deg = Math.round((flyTilt * 180) / Math.PI);
    if (deg !== flyTiltShown) { flyTiltShown = deg; refreshFlyPrompt(); }
    return true;
  };
  /**
   * ══════════════════════════════════════════════════════════════════════════════════════════
   * 🔊 **THE SENSE OVERLAY — WHAT TURNS THE FLY-OVER FROM A LOOK TOOL INTO THE DESIGN VIEW FOR
   * THE STEALTH LOOP.** John, 2026-08-15: *"in the mode it would also be good to see the radius
   * of sounds and the hunters listening radius and vision cone."*
   * ══════════════════════════════════════════════════════════════════════════════════════════
   *
   * The loop he described is *"stuck in a room with the hammer forcing you to make noise to
   * leave"*, and until now the noise half of it has been **completely invisible** — nobody could
   * see the game they were tuning. Three overlays, all lying flat on the floor plane so they
   * read as a plan:
   *
   *   · **YOUR NOISE** — a filled disc and a rim at `HUNTER_SENSE.hearRange × player.noise`.
   *     That is not a decoration: `HunterAI._sense` hears a body at `d < hearRange × noise`, so
   *     the rim IS the refusal boundary. Standing still it vanishes (`player.noise` is 0);
   *     walking it is ~0.49 → 6.9 m; sprinting or swinging the hammer it is 1.0 → 14 m.
   *   · **EVERY LIVE NOISE ON THE BUS** — a rim per event at `hearRange × heard`, where `heard`
   *     is `NoiseBus.loudest`'s DECAYED loudness, which that file's own header names as *"the
   *     number a listener should range-check against"*. So a hammer blow blooms and shrinks over
   *     `NOISE_LIFE`, which is exactly what a listener experiences.
   *   · **THE HUNTER** — his maximum hearing reach (`hearRange`, i.e. what a full-loudness noise
   *     would carry to him), his `peripheral` bubble, and his vision cone at `sightRange` with a
   *     half-angle of `acos(fovCos)`, swung to `facing + scan` so the head sweep is live.
   *
   * 🚨 **NOT ONE NUMBER HERE IS RE-DERIVED, AND THAT IS THE WHOLE DESIGN CONSTRAINT.** HANDOFF:
   * *"an instrument that re-derives the thing it measures will agree with it."* Every radius is
   * read from the same `HUNTER_SENSE` object `hunter-ai.js` imports and the same `NoiseBus` the
   * AI polls — the overlay cannot drift from the AI, because there is no second copy to drift.
   * If somebody retunes `hearRange`, this moves in the same frame.
   *
   * 🚨 **THE HUNTER IS IN A GENERATED HOUSE AND THIS OVERLAY MUST NOT SAY OTHERWISE.** John,
   * 2026-08-15: *"I can tell you the hunter is in the house lol."* He is right, and the first
   * build of this block was wrong: it gated the cone on the PATROL ROUTE resolving, so under
   * `?plan=gen` it drew nothing and printed *"NO PATROL IN THIS HOUSE"* over a hunter who was
   * standing right there. **That is the result-shaped-output failure this overlay exists to
   * avoid, committed by the overlay itself.** Verified directly rather than from a document:
   * `GEN.spawn.hunter` is a real position — **[11.15, 19.82] on seed 0, inside `r1.service`** —
   * so the overlay is gated on his LIVE PRESENCE IN THE SCENE and nothing else.
   *
   * ⚠️ **AND THE ROUTE IS NOT ABSENT EITHER, IT IS FOREIGN — WHICH IS A DIFFERENT AND WORSE
   * THING.** `HunterAI._patrol` reads `wp.x`, `wp.z` and `wp.dwell` and **never reads
   * `wp.space`** (checked, not assumed), so a generated house does not fall back to no route: it
   * walks `spaces.js`'s AUTHORED coordinates, which were written for a different building.
   * `hunterStatus()` therefore counts how many patrol stops land inside THIS house's envelope and
   * the prompt reports that count — a fact, never a verdict. Fixing the route is not this slice;
   * `_flyover1-view.mjs` H1 measures it so the number exists.
   *
   * ⚠️ **DRAWN WITH `depthTest: false` ON PURPOSE.** A sound radius that a wall clips in half is
   * a lie about a mechanic that explicitly ignores walls (`_sense`: *"hearing is deliberately NOT
   * gated on line of sight … hearing through a wall is the only thing hearing is for"*). The cone
   * is not occluded either, because what it shows is the SHAPE of the test, not its result — the
   * `blocksSight` half is a per-target query with no geometry of its own to draw.
   *
   * ⚠️ **BUILT VISIBLE AND LEFT VISIBLE UNTIL THE FIRST UPDATE TICK**, so `finalizeScene`'s
   * compile pass and the warm-up lap both see these materials — the trap this file already
   * documents in capitals for hidden rooms and for the hunter's stage rigs. Four
   * `MeshBasicMaterial`s share one program family, and the update loop is the only writer of
   * `visible` after boot, so the lap cannot leave them on.
   */
  const SENSE = {
    noise: 0xffb271,      // the warm practical's colour — a sound is a warm event
    hear: 0x6f8fbe,       // the hemisphere's sky blue — a listening volume
    sight: 0xa8ccf4,      // the cool rim's blue — what the eye reaches
    mark: 0xffffff,
  };
  /**
   * ⚠️ **`depthTest` IS PER-OVERLAY AND IT IS AN HONESTY DECISION, NOT A LOOK ONE.**
   *
   * The hearing rings and the markers are drawn WITHOUT depth, because the mechanic they describe
   * ignores walls — `HunterAI._sense` says so in capitals: *"hearing is deliberately NOT gated on
   * line of sight … hearing through a wall is the only thing hearing is for."* A sound radius that
   * a wall clipped in half would be a picture of a rule the game does not have. The marker is
   * without depth for the same reason in the other direction: its whole job is to be findable
   * when the body is not.
   *
   * The VISION CONE is depth-tested, because sight IS stopped by walls (`blocksSight`), so a cone
   * that painted itself over the roofs of the rooms next door would claim a reach the AI refuses.
   * It also stops the cone flooding the frame the moment the view is tilted, which the first
   * build's frames show it doing. ⚠️ **Neither setting is part of a three.js program key**, so
   * this cannot add a shader compile — `S6` measures that on every run.
   */
  const senseMat = (hex, opacity, depth = false) => new THREE.MeshBasicMaterial({
    color: hex, transparent: true, opacity, depthTest: depth, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
  });
  /**
   * ⚠️ **THE RIM IS 4% OF ITS RADIUS AND THE MARKER IS 38% OF ITS OWN, AND THAT IS TWO
   * GEOMETRIES ON PURPOSE.** A single 10% band was tried and the frame is on disk: at the
   * hunter's 14 m hearing radius it draws a **1.4 m thick** annulus, which stops reading as a
   * boundary and starts reading as a doughnut over the house. 4% is 0.56 m at 14 m and 0.27 m at
   * the 6.8 m walking ring — a line, at every size that matters. The markers are the opposite
   * problem: they are 0.55 m across, so the same 4% would be 2 cm and invisible.
   */
  const RING_G = new THREE.RingGeometry(0.96, 1.0, 72);
  const MARK_G = new THREE.RingGeometry(0.62, 1.0, 40);
  const DISC_G = new THREE.CircleGeometry(1, 72);
  const HALF_FOV = Math.acos(HUNTER_SENSE.fovCos);
  // Centred on local -Y so that after `rotation.x = -PI/2` it points at world +Z, which makes
  // the group's `rotation.y` equal to the hunter's own `facing + scan` with no offset term.
  const CONE_G = new THREE.CircleGeometry(1, 64, -Math.PI / 2 - HALF_FOV, HALF_FOV * 2);
  const flat = (geo, mat, order, y) => {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.order = 'YXZ';
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.renderOrder = order;
    m.frustumCulled = false;          // the fit already guarantees the house is in frame
    m.castShadow = false; m.receiveShadow = false;
    return m;
  };
  const M_NOISE_FILL = senseMat(SENSE.noise, 0.09);
  const M_NOISE_RIM = senseMat(SENSE.noise, 0.62);
  const M_HEAR = senseMat(SENSE.hear, 0.50);
  const M_SIGHT = senseMat(SENSE.sight, 0.09, true);
  const M_SIGHT_RIM = senseMat(SENSE.sight, 0.42, true);
  const M_MARK = senseMat(SENSE.mark, 0.85);

  const flyGroup = new THREE.Group();
  flyGroup.name = 'flyover.overlay';
  const senseGroup = new THREE.Group();
  senseGroup.name = 'flyover.senses';
  /** Always on with the fly-over — see the ROBOT-DISAPPEARS diagnosis on `toggleFlyover`. */
  const youMark = flat(MARK_G, M_MARK, 40, 0.16);
  const hunterMark = flat(MARK_G, M_MARK, 40, 0.16);
  // NAMED so a probe finds them by name rather than by child index — `_flyover1-robot.mjs`
  // ablates the marker and the body SEPARATELY, and an index would silently follow a reorder.
  youMark.name = 'flyover.you';
  hunterMark.name = 'flyover.hunter';
  flyGroup.add(youMark, hunterMark, senseGroup);
  const youFill = flat(DISC_G, M_NOISE_FILL, 10, 0.06);
  const youRim = flat(RING_G, M_NOISE_RIM, 12, 0.07);
  const hunterHear = flat(RING_G, M_HEAR, 14, 0.08);
  const hunterPeri = flat(RING_G, M_HEAR, 15, 0.08);
  // ⚠️ 0.12 m off the floor, not 0.05: the cone is the one overlay that IS depth-tested, so it
  // has to clear the floor slab (top at exactly y = 0) by enough that a 62° grazing view at 33 m
  // cannot z-fight it. Twelve centimetres is invisible from overhead and unambiguous to the
  // depth buffer.
  const hunterCone = flat(CONE_G, M_SIGHT, 11, 0.12);
  const hunterConeRim = flat(CONE_G, M_SIGHT_RIM, 13, 0.13);
  /**
   * Four, because `NoiseBus` caps itself at 24 live events and a fly-over that drew all of them
   * would be a wall of rings — and because the bus is already sorted loudest-first by `recent()`,
   * so four is the four that matter. The count is REPORTED with the overlay rather than silently
   * truncated: `flyStatus().noise.live` is the real number.
   */
  const busRims = [0, 1, 2, 3].map(() => flat(RING_G, M_NOISE_RIM, 16, 0.07));
  senseGroup.add(youFill, youRim, hunterHear, hunterPeri, hunterCone, hunterConeRim, ...busRims);
  scene.add(flyGroup);

  let senseOn = qsRun.get('flysense') !== '0';
  /** Live, measured, and re-read every time it is asked for — never cached into a belief. */
  const hunterStatus = () => {
    const route = room.patrolRoute?.() ?? [];
    const ids = new Set(room.spaces.map((s) => s.id));
    /**
     * TWO DIFFERENT COUNTS, because they answer two different questions and conflating them is
     * what produced the on-screen lie. `named` is how many stops carry a space id this house has
     * — interesting only as archaeology, since `_patrol` never reads it. `inside` is how many
     * stops land within this house's envelope, which is what the hunter will actually walk to.
     */
    let named = 0, inside = 0;
    for (const w of route) {
      if (ids.has(w.space)) named++;
      if (room.spaceAt({ x: w.x, y: 0, z: w.z }, 0.6)) inside++;
    }
    const p = hunter?.root?.position ?? null;
    return {
      inScene: !!hunter?.root?.parent,
      targets: hunter?.candidates?.length ?? 0,
      pos: p ? [+p.x.toFixed(2), +p.z.toFixed(2)] : null,
      space: p ? (room.spaceAt(p)?.id ?? null) : null,
      route: route.length, named, inside,
      /** The overlay's ONLY gate: is there a body to describe. Never the route. */
      present: !!hunter?.root?.parent && !!p,
    };
  };
  /**
   * 🚨 THE WHOLE-HOUSE READOUT, published for `harness/_gen1_integration.mjs`.
   *
   * Every piece of this build had a passing probe of its own while the COMBINATION was broken:
   * the hunter walked the authored house's patrol route through a generated building, and no
   * single-piece probe could see it because the route resolved and the hunter moved. This reads
   * the live scene — the room's own space list, its own furniture array, the item field the
   * player can actually pick from, and the avatar that actually loaded — so an assertion here
   * cannot pass by agreeing with a table.
   *
   * ⚠️ NOTHING IS RE-DERIVED. `patrolInside` reuses `hunterStatus()`, which reuses
   * `room.spaceAt` — the same test the hunter's own movement uses.
   */
  window.__rrr.integration = () => {
    const h = hunterStatus();
    const furn = room.furnProps ?? [];
    const items = limbField?.items ?? [];
    return {
      spaces: room.spaces?.length ?? 0,
      patrolStops: h.route,
      patrolInside: h.inside,
      hunterInScene: h.inScene,
      furnProps: furn.length,
      // `player.js` takes exactly this route to break one: `cast.furn.isDamageable` gates the
      // hit, `applyHit` lands it. Asserting on the same two members the game uses means a prop
      // that passes here is a prop the sledgehammer can actually break.
      furnDestructible: furn.filter((f) => f.isDamageable && typeof f.applyHit === 'function').length,
      // On the FLOOR, not in the hands: the round opens unarmed by John's instruction, so the
      // hammer being a world item is the mechanic, not an accident of ordering.
      sledgeOnFloor: items.some((it) => it.type === 'sledge' && !it.attachedTo),
      arms: player?.caps?.arms ?? null,
      playerBody: avatar?.sourceFile ?? (avatar ? 'unknown' : 'procedural fallback'),
      playerClips: avatar?.clipNames?.length ?? 0,
    };
  };

  const _busPos = new THREE.Vector3();
  /**
   * One write per frame while the fly-over is up, and NOTHING while it is not — the early return
   * is what keeps this off the play path entirely. `noise.recent()` allocates, so it is only
   * called behind that return.
   */
  const updateSenses = () => {
    flyGroup.visible = flyOn;
    if (!flyOn) return;
    senseGroup.visible = senseOn;
    youMark.position.set(player.pos.x, 0.10, player.pos.z);
    youMark.scale.set(0.55, 0.55, 1);
    const hs = hunterStatus();
    const hp = hunter?.root?.position;
    hunterMark.visible = hs.inScene && !!hp;
    if (hp) { hunterMark.position.set(hp.x, 0.10, hp.z); hunterMark.scale.set(0.95, 0.95, 1); }
    if (!senseOn) return;

    // ---- YOUR OWN NOISE. `player.noise` is the exact field `_sense` range-checks.
    const yr = HUNTER_SENSE.hearRange * (player.noise ?? 0);
    const audible = (player.noise ?? 0) > HUNTER_SENSE.hearFloor;
    youFill.visible = youRim.visible = audible;
    if (audible) {
      for (const m of [youFill, youRim]) {
        m.position.set(player.pos.x, m.position.y, player.pos.z);
        m.scale.set(yr, yr, 1);
      }
    }

    // ---- EVERY LIVE EVENT ON THE BUS, loudest first — `recent()`'s own order.
    const live = noise.recent();
    for (let i = 0; i < busRims.length; i++) {
      const ev = live[i];
      busRims[i].visible = !!ev;
      if (!ev) continue;
      const r = HUNTER_SENSE.hearRange * ev.heard;
      _busPos.set(ev.x, busRims[i].position.y, ev.z);
      busRims[i].position.copy(_busPos);
      busRims[i].scale.set(r, r, 1);
    }

    // ---- THE HUNTER. Gated on his BODY BEING THERE and on nothing else — see the correction in
    // the block header. A cone hidden because of a route would be a lie about a hunter who is
    // standing in the room.
    const show = hs.present;
    hunterHear.visible = hunterPeri.visible = hunterCone.visible = hunterConeRim.visible = show;
    if (!show) return;
    const a = (hunter.facing ?? 0) + (hunter.scan ?? 0);
    for (const m of [hunterHear, hunterPeri, hunterCone, hunterConeRim]) {
      m.position.set(hp.x, m.position.y, hp.z);
    }
    hunterHear.scale.set(HUNTER_SENSE.hearRange, HUNTER_SENSE.hearRange, 1);
    hunterPeri.scale.set(HUNTER_SENSE.peripheral, HUNTER_SENSE.peripheral, 1);
    for (const m of [hunterCone, hunterConeRim]) {
      m.scale.set(HUNTER_SENSE.sightRange, HUNTER_SENSE.sightRange, 1);
      m.rotation.y = a;
    }
  };

  const refreshFlyPrompt = () => {
    const hs = hunterStatus();
    const deg = Math.round((flyTilt * 180) / Math.PI);
    /**
     * ⚠️ **THE HUNTER LINE STATES WHAT IS TRUE AND NOTHING MORE.** It used to claim he was not in
     * the house; he is. Now it names his ranges whenever there is a body to name them for, and
     * appends the patrol-stop count ONLY when some of the route falls outside this envelope —
     * which is a fact about the route, not a verdict about the hunter.
     */
    /**
     * ⚠️ **KEPT TO ONE LINE, AND THE FIRST VERSION OF THE LOCK WORDING BROKE THAT.** `#rrr-prompt`
     * does not truncate — it WRAPS — so an over-long line takes a second row and lays it across
     * the middle of the house, which is the one part of the frame the fly-over exists to show.
     * The frame is on disk. Every clause below is therefore as short as it can be while still
     * naming its unit: about 130 characters against the ~155 the prompt fits at this size.
     */
    const hunterLine = !hs.present ? 'HUNTER NOT IN SCENE'
      : `HUNTER HEARS ${HUNTER_SENSE.hearRange} m · SEES ${HUNTER_SENSE.sightRange}`
        + `/${Math.round((HALF_FOV * 360) / Math.PI)}°`
        + (hs.inside < hs.route ? ` · PATROL ${hs.inside}/${hs.route} HERE` : '');
    /**
     * 🔒 **THE LOCK STATE IS THE SECOND THING ON THE LINE, BEFORE ANY NUMBER.** The brief's rule
     * is that it has to be discoverable from the on-screen line alone — he does not use a
     * terminal — so the line names the state it is IN and the key that leaves it, in that order.
     * Both halves change wording, not just a flag, because "LOCKED / not LOCKED" read at a glance
     * on a busy line is exactly the kind of distinction that gets missed.
     */
    const lockLine = flyLocked
      ? 'LOCKED — [L] FREES'
      : 'FREE, MOUSE AIMS — [L] LOCKS';
    flyPrompt = `[F] FLY-OVER · ${lockLine} · ${room.spaces.length} ROOMS`
      + ` · ${(flyFit?.y ?? 0).toFixed(1)} m · TILT ${deg}°`
      + ` · [N] SENSES ${senseOn ? 'ON' : 'OFF'} · ${hunterLine}`;
  };
  /**
   * 🔒 **[L] — LOCK / RELEASE THE FLY-OVER CAMERA.** L for LOCK; unbound, and the only letter that
   * needs no legend next to the word the HUD already prints. A modifier or a mouse button was
   * considered and refused: right-drag is a look gesture in most engines and would read as "swing
   * it", and a modifier cannot be shown as a state on a single HUD line, which the brief requires.
   *
   * ⚠️ **IT WRITES ONE BOOLEAN AND TOUCHES NO CAMERA STATE, WHICH IS WHY NEITHER DIRECTION CAN
   * MOVE THE VIEW.** `flyYaw`/`flyTilt` are untouched here, and `placeFlyCamera()` is a pure
   * function of those two plus the envelope and the aspect — so the frame after a lock, and the
   * frame after a release, are solved from identical inputs. There is deliberately no "snap to
   * the nearest axis" and no easing: a lock that tidied the angle would lose the composition he
   * pressed it to keep.
   */
  const toggleLock = (t, on = !flyLocked) => {
    flyLocked = !!on;
    refreshFlyPrompt();
    if (!flyOn) {
      barrierMsg = `[L] FLY-OVER CAMERA ${flyLocked ? 'LOCKED' : 'FREE'} — TAKES EFFECT IN [F]`;
      barrierMsgUntil = t + 4;
    }
    return flyStatus();
  };
  const toggleSenses = (t) => {
    senseOn = !senseOn;
    refreshFlyPrompt();
    if (!flyOn) { barrierMsg = `[N] SENSE OVERLAY ${senseOn ? 'ON' : 'OFF'} — SHOWS IN [F] FLY-OVER`; barrierMsgUntil = t + 4; }
    return flyStatus();
  };

  const toggleFlyover = (t, on = !flyOn) => {
    flyOn = !!on;
    if (flyOn) {
      const lid = room.setLid?.(false);
      engine.pipeline.setGrade({ haze: FLY_HAZE, vignette: 0 });
      fill.intensity = FLY_FILL;
      /**
       * ⚠️ **THE ANGLE RESETS TO STRAIGHT DOWN ON EVERY ARM, AND THAT IS DELIBERATE.** Carrying
       * the last swing over would mean pressing [F] from inside a room and arriving at whatever
       * heading a previous session left behind, which reads as the control being broken. Straight
       * down is the one orientation that is the same answer whatever he was doing.
       */
      flyYaw = 0; flyTilt = Math.PI / 2; flyTiltShown = 90;
      // 🔒 …and the LOCK resets with the angle, for the same reason and as one decision: a pin
      // remembered onto an angle that was just reset is a pin on a composition that no longer
      // exists. [F] always arrives free and straight down.
      flyLocked = false;
      placeFlyCamera();
      lidHiddenNow = lid?.hidden ?? 0;
      refreshFlyPrompt();
    } else {
      room.setLid?.(true);
      engine.pipeline.setGrade({ haze: GRADE_HAZE, vignette: GRADE_VIGNETTE });
      fill.intensity = FILL_I0;
      engine.camera.up.set(0, 1, 0);
      /**
       * 🚨 **AND THERE IS DELIBERATELY NO `cam._first = true` HERE — IT WAS TRIED, AND IT WAS
       * THE ONLY THING THAT MADE THE ROUND TRIP INEXACT.**
       *
       * The obvious line is the one `eo2-calls.mjs` uses when it teleports a player between
       * stations: snap the boom rather than let it fly 20 m down through five ceilings. It is
       * wrong here, and the reason is that **`ThirdPersonCamera` keeps its own state**. `_pos`
       * and `_look` are lerped toward a target computed from the PLAYER, and `update()` never
       * reads `camera.position` back — so a fly-over that overwrites `engine.camera` *after*
       * `cam.update()` has run leaves the boom's own state untouched and correctly evolving.
       * The camera was never actually up there as far as the boom is concerned; there is
       * nothing to fly back from and nothing to snap.
       *
       * 📐 **MEASURED, because "it should be fine" is an argument and this file's rule is that
       * an argument is not a measurement.** `_flyover1-view.mjs` A2/A2b, one parked station,
       * OFF → ON → OFF flipped in place: **with** the snap the visible draw set came back
       * IDENTICAL name for name and the scalar read **374 → 644 → 373 calls (−1, −24 tris)**
       * against a same-config no-flip drift of **±0**. The snap replaced a correctly-lerped
       * `_pos` with `want`, which is a different position, which changes what the frustum
       * culls. Without it the same test comes back exact.
       */
      barrierMsg = '[F] FLY-OVER OFF — BACK IN THE HOUSE';
      barrierMsgUntil = t + 4;
    }
    return flyStatus();
  };
  const flyStatus = () => ({
    on: flyOn, y: flyFit ? +flyFit.y.toFixed(2) : null,
    cx: flyFit ? +flyFit.cx.toFixed(2) : null, cz: flyFit ? +flyFit.cz.toFixed(2) : null,
    clamped: !!flyFit?.clamped, spanX: flyFit?.spanX ?? null, spanZ: flyFit?.spanZ ?? null,
    spaces: room.spaces.length, resident: room.visibleSpaces(),
    lid: room.lidCensus?.() ?? null, lidHidden: lidHiddenNow,
    fill: fill.intensity, haze: flyOn ? FLY_HAZE : GRADE_HAZE,
    /** The angle control — degrees, so a report reads without a conversion. */
    locked: flyLocked,
    yawDeg: +((flyYaw * 180) / Math.PI).toFixed(2),
    tiltDeg: +((flyTilt * 180) / Math.PI).toFixed(2),
    /**
     * 🔒 **THE CAMERA MATRIX ITSELF, SO "IT DID NOT MOVE" IS A MEASUREMENT AND NOT A PROXY.**
     * A6/A7 compare these across a locked drag. Asserting on `yawDeg`/`tiltDeg` alone would pass
     * a build where the lock held the angle and something else moved the eye.
     */
    eye: [+engine.camera.position.x.toFixed(6), +engine.camera.position.y.toFixed(6),
      +engine.camera.position.z.toFixed(6)],
    quat: [+engine.camera.quaternion.x.toFixed(6), +engine.camera.quaternion.y.toFixed(6),
      +engine.camera.quaternion.z.toFixed(6), +engine.camera.quaternion.w.toFixed(6)],
    tiltMinDeg: +((FLY_TILT_MIN * 180) / Math.PI).toFixed(2),
    /** How deep a strip of floor a wall hides at the current tilt — the occlusion budget. */
    blindStrip: +((flyFit?.top ?? 0) / Math.tan(flyTilt)).toFixed(3),
    /** ⚠️ The boom's own state, so a probe can prove the fly-over never touched it. */
    boomYaw: +cam.yaw.toFixed(6), boomPitch: +cam.pitch.toFixed(6),
    senses: senseOn,
    /**
     * ⚠️ **THE BOOM'S OWN ANSWER, PUBLISHED SO THE FIX HAS A CONTROL.** `cam.modelHidden` is what
     * `ThirdPersonCamera` decided about the body this frame; while the fly-over is up the view
     * overrides it. If this ever reads `false` at a wall-hugging station, the override is not
     * being exercised and `_flyover1-robot.mjs` R2's green is meaningless.
     */
    boomWantsHidden: !!cam.modelHidden,
    modelVisible: player.model ? player.model.visible : null,
    /** Every radius on screen, READ BACK from the live objects rather than restated. */
    sense: {
      hearRange: HUNTER_SENSE.hearRange, hearFloor: HUNTER_SENSE.hearFloor,
      sightRange: HUNTER_SENSE.sightRange, peripheral: HUNTER_SENSE.peripheral,
      fovHalfDeg: +((HALF_FOV * 180) / Math.PI).toFixed(2),
      playerNoise: +(player.noise ?? 0).toFixed(3),
      playerReach: +(HUNTER_SENSE.hearRange * (player.noise ?? 0)).toFixed(2),
      youRimRadius: youRim.visible ? +youRim.scale.x.toFixed(2) : null,
      hunterConeYaw: hunterCone.visible ? +hunterCone.rotation.y.toFixed(4) : null,
      hunterFacing: +((hunter?.facing ?? 0) + (hunter?.scan ?? 0)).toFixed(4),
      busVisible: busRims.filter((m) => m.visible).length,
      busRadii: busRims.filter((m) => m.visible).map((m) => +m.scale.x.toFixed(2)),
    },
    noise: { live: noise.recent().length, ...noise.census() },
    hunter: hunterStatus(),
  });
  /**
   * The harness handle. `_flyover1-view.mjs` flips this IN PLACE at one parked station, which is
   * the only draw-call comparison this project accepts (HANDOFF: *"never compare two walks"*).
   * Live only in practice — nothing in capture mode calls it — but it is not gated on
   * `engine.capture`, because a probe that cannot arm the thing it measures reports SKIP, and a
   * SKIP that was caused by the instrument is the failure class this project has paid for most.
   */
  window.__rrr.flyover = (on) => (on == null ? flyStatus() : toggleFlyover(0, on));
  /**
   * The angle, for the harness. Degrees in, status out. Setting it here goes through the SAME
   * clamp the mouse does — a probe that could reach an angle the player cannot would be testing
   * a view that does not ship.
   */
  window.__rrr.flyAngle = (yawDeg, tiltDeg) => {
    if (yawDeg != null) flyYaw = (yawDeg * Math.PI) / 180;
    if (tiltDeg != null) {
      flyTilt = Math.max(FLY_TILT_MIN, Math.min(Math.PI / 2, (tiltDeg * Math.PI) / 180));
    }
    if (flyOn) { placeFlyCamera(); refreshFlyPrompt(); }
    return flyStatus();
  };
  /**
   * 🔒 The lock, for the harness. Same function the key calls, so a probe cannot reach a lock
   * state the player cannot — and A6/C6 flip it around the identical drag.
   */
  window.__rrr.flyLock = (on) => (on == null ? flyStatus() : toggleLock(0, on));
  window.__rrr.flySenses = (on) => {
    if (on != null && !!on !== senseOn) toggleSenses(0);
    updateSenses();
    return flyStatus();
  };
  /**
   * 🔗 **`?fly=1` — THE SAME VIEW FROM A BOOKMARK, AND IT IS NOT A SUBSTITUTE FOR THE KEY.**
   * John does not use a terminal, so a URL-only mode would have been no answer at all — [F] is
   * the deliverable and this is a convenience beside it, for a `.bat` launcher that wants to open
   * straight into the overhead view of a seed. Armed on the FIRST UPDATE TICK rather than here,
   * because at this point in the file the world is not finished: `finalizeScene`, the compile
   * warm-up and the first residency pass all still have to run, and arming before them would
   * hand the warm-up a scene with six ceilings missing and every room resident.
   * ⚠️ **LIVE ONLY.** No stored capture, baseline or scored verdict can reach it.
   */
  let flyFromUrl = qsRun.get('fly') === '1' && !engine.capture;

  /**
   * 🎛️ **[ AND ] — DIG POWER, LIVE.** John, 2026-08-09: *"I want to abandon a set time for dig
   * while we testing. I want to be able to ramp or lower digging speed in game so I can try
   * different levels."*
   *
   * TWO KEYS, NOT ONE CYCLE, and the reason is the request: he wants to *ramp or lower*, which
   * is a direction, not a list. On an eight-entry cycle, going one step slower costs seven
   * presses and passes through the top on the way — i.e. the control fights the thing he is
   * trying to feel. `[` and `]` are adjacent, unbound, and read as "less / more" without a
   * legend.
   *
   * 🚨 **THE KEY WAS A NO-OP ABOVE x1 UNTIL 2026-08-09, WHICH IS WHY NO NUMBER FROM BEFORE THEN
   * CAN BE READ AS A CALIBRATION.** `damagefield.js` `_add()` clamped `power` to 1, so `digPower`
   * 2, 4 and 8 were all identically 1 on the free dig arm — the default arm, the one John was
   * digging in. What x8 really did was one-shot SCALAR panels (`wall.js`'s stage fallback
   * multiplies health by it unclamped). The clamp is now split (radius clamped, deposit not), so
   * this ladder does what its label says. Full argument and the sweep: `damagefield.js`
   * `DIG_BASE`.
   */
  /**
   * 🔨 **THE LADDER WAS RESCALED ON 2026-08-10 AND THE RUNG JOHN PLAYS ON MOVED, NOT THE FIELD.**
   *
   * > *"I want the digging speed toggle changed again — **the current .5 should be the 1x** and
   * > the total should **scale up to 16x**. I also want a **1.5x option**."*
   *
   * So `DIG_POWERS` is now **John's labels**, and `DIG_UNIT` is what one of them is worth in the
   * units `damagefield.js` `_add()` takes. The new ×1 is `1 × 0.5` = **exactly the rung he was
   * playing on**, ×16 is 16 × that, and ×1.5 exists.
   *
   * 🚨 **WHY THE HALVING IS HERE AND NOT IN `DIG_BASE`, WHICH IS WHERE THE LAST RE-CENTRING
   * WENT.** On 2026-08-09 *"8x should be the base speed"* was shipped by moving `DIG_BASE`,
   * because the base has to be somewhere every instrument sees. That argument does not transfer,
   * for a measured reason: `_add()`'s clamp is **split**, and the two halves of a rung are not
   * the same lever.
   *
   *   · `pw = min(1, power)` drives the **brush RADIUS**. `DIG_BASE` cannot reach it at all.
   *   · `power` unclamped drives the **DEPTH one blow deposits**. `DIG_BASE` scales only this.
   *
   * The rung John played and asked for is `power = 0.5`, which is **a 0.81 m brush that does not
   * punch clean through in one hit**. `DIG_BASE = 4` would have reproduced its depth and left the
   * brush at the full 1.04 m — a different, wider, faster-feeling dig that he has not seen and
   * did not ask for. Reproducing what he played means moving the label, so the label is what
   * moves. ⚠️ **AND THE HONEST COST OF THAT IS STATED RATHER THAN GLOSSED:** every instrument in
   * the project drives `panel.applyHit(point, 1)` and so still measures `power = 1`, which on
   * this ladder is now the **×2** rung. `dig-band` and `dig-free` report a clock for ×2, not for
   * the new base; both already REPORT rather than gate it (John suspended the band on
   * 2026-08-09), so nothing goes red — but a reader comparing a gate's seconds against his own
   * play is comparing two different rungs, and this is the sentence that says so.
   *
   * 📐 **WHAT EACH RUNG ACTUALLY DOES, MEASURED — IT IS NOT LINEAR AND THE LABEL IS NOT A LIE
   * SO MUCH AS AN INCOMPLETE TRUTH.** `R = BRUSH_R × (0.55 + 0.45 × min(1, power))`, so below
   * `power` 1 a rung takes the HOLE'S WIDTH down with the depth; at and above it, the hole stops
   * growing and only the deposit deepens — and the deposit itself saturates once one blow takes
   * every cell in the brush clean through (`DIG_BASE`'s own sweep: ×6 0.9038, ×8 0.9183, ×10
   * 0.9328 m²·depth).
   *
   * 📐 **MEASURED HEADLESS ON THE SHIPPED `DamageField`, `dig-free`'s own "swing at the least-dug
   * cell" policy, 4.60 × 2.80 m face.** `probe` = blows until one cell is through; `channel` =
   * blows until `channel()` opens a body-sized route; seconds at `WEAPON_COOLDOWN.sledge` 0.95 s.
   *
   *   | label | `power` | brush across | m²·depth/blow | probe | channel | ≈ |
   *   |---|---|---|---|---|---|---|
   *   | ×0.25 | 0.125 | **0.63 m** | 0.061 | 6 | **92** | 87 s — the pre-2026-08-09 game, bit-for-bit (`8 × 0.125 === 1`) |
   *   | ×0.5 | 0.25 | **0.69 m** | 0.142 | 3 | **42** | 40 s |
   *   | **×1** | **0.5** | **0.81 m** | **0.431** | **1** | **14** | **13 s — the new base, John's rung** |
   *   | ×1.5 | 0.75 | **0.92 m** | 0.717 | 1 | **2** | 1.9 s — the last rung that widens the hole |
   *   | ×2 | 1.0 | 1.04 m | 0.929 | 1 | 2 | the old ×1 — **what every gate and scenario measures** |
   *   | ×4 | 2.0 | 1.04 m | 0.991 | 1 | 2 | deeper only; the brush is already through |
   *   | ×8 | 4.0 | 1.04 m | 1.011 | 1 | 2 | on the deposit plateau |
   *   | ×16 | 8.0 | 1.04 m | 1.011 | 1 | 2 | **identical to ×8 and ×4 in play.** Kept because John |
   *   | | | | | | | asked for the RANGE; `]` cannot grow `BRUSH_R` and that is the hole's size |
   *
   * 🚨 **THE LADDER IS NOT SMOOTH AND THE STEP IS BETWEEN ×1 AND ×1.5 — SAY IT RATHER THAN LET
   * HIM FIND IT.** A body-sized channel goes **14 blows → 2** across that one press, because
   * `0.75 × DIG_BASE × RIM` is the point at which a single blow takes its whole brush clean
   * through and the dig stops being a matter of coming back to the same spot. Everything at ×1.5
   * and above is the same dig. Everything at ×1 and below is a different one. **The new base is
   * on the slow side of that step on purpose: it is the rung John played and asked for**, and
   * `critic-dig-8`'s complaint was that *"three blows feels cheap because it IS free."*
   *
   * ⚠️ **`WEAPON_COOLDOWN.sledge` DOES NOT MOVE AND MUST NOT.** "Digging speed" as John means it
   * is how fast the wall goes down; the swing's cadence is choreography `critic-swing-2` passed
   * and `sledge-check` gates. See `Player.digPower`'s own note.
   * ⚠️ Like [B] and [G] the keys are read inside the `!engine.capture` branch, and `Input`
   * attaches no listeners at all in capture mode, so no scenario and no `?capture=1` run can
   * reach them by accident — `dig-band.mjs` stays deterministic. `?digpower=` is the deliberate
   * opt-in and takes a LABEL, so `?digpower=2` is the pacing every gate measures.
   */
  const DIG_UNIT = 0.5;
  const DIG_POWERS = [0.25, 0.5, 1, 1.5, 2, 4, 8, 16];
  let digPowerIx = DIG_POWERS.indexOf(Number(qsRun.get('digpower') ?? 1));
  if (digPowerIx < 0) digPowerIx = DIG_POWERS.indexOf(1);
  const applyDigPower = () => { player.digPower = DIG_POWERS[digPowerIx] * DIG_UNIT; };
  applyDigPower();
  const stepDigPower = (d, t) => {
    digPowerIx = Math.min(DIG_POWERS.length - 1, Math.max(0, digPowerIx + d));
    applyDigPower();
    const p = DIG_POWERS[digPowerIx];
    const tag = p === 1 ? ' (BASE)' : p === 0.25 ? ' (THE OLD BASE)' : p >= 4 ? ' (NO WIDER)' : '';
    barrierMsg = `DIG POWER x${p}${tag}  ·  [ SLOWER  ·  ] FASTER`;
    barrierMsgUntil = t + 4;
  };

  /**
   * ⏸️ **THE GAME PAUSES WHEN YOU ALT-TAB.** John asked for it in the same message as the
   * pointer-lock complaint, and the two belong together: `Input` gives the OS cursor back the
   * instant focus leaves (see its focus block), and this stops the world while it is gone.
   * Without it, alt-tabbing for a minute means coming back to a hunter that has spent a minute
   * hunting an idle robot, and a run clock that charged you for it.
   *
   * Implemented as an early return from THIS updater rather than as an engine-level pause,
   * because the engine's loop is not this slice's file and does not need to be: skipping the
   * one updater freezes the player, the hunter, the room, the FX and `run.tick` together, while
   * rendering carries on costing nothing anyone can see. `Engine._liveLoop` already clamps
   * `dt` to 0.1 s (checked, not assumed), so the first frame back cannot deliver a minute of
   * accumulated time — no teleport, no swing that completed itself while you were away.
   *
   * ⚠️ **OFF UNDER AUTOMATION, ON PURPOSE.** `navigator.webdriver` is true in every harness
   * browser and false in John's. A headless page can lose focus for reasons that have nothing
   * to do with a player — `strobe.mjs` opens a second page in the same browser to compose its
   * sheets, which blurs the game page — and a scenario that silently froze would not fail, it
   * would report a world in which nothing ever happened. `window.__rrr.autoPause(true)` turns
   * it on deliberately, which is how it is tested (`_cam1-occlusion.mjs`).
   */
  const _automated = typeof navigator !== 'undefined' && navigator.webdriver === true;
  let autoPause = !engine.capture && !_automated;
  let pausedFrames = 0;
  window.__rrr.autoPause = (on = true) => { autoPause = !!on && !engine.capture; return autoPause; };
  window.__rrr.pausedFrames = () => pausedFrames;

  // ---------------------------------------------------------------- loop
  engine.onUpdate((dt, t) => {
    if (autoPause && input.focused === false) { pausedFrames++; return; }
    const cmd = engine.capture ? director.step(dt, t) : liveInput(input, cam, player, weapons, limbField, hud, t);

    // 🧪 the B-key testing toggle — see `toggleBarriers` above. `!engine.capture` is
    // belt-and-suspenders: `input` already attaches no listeners at all in capture mode, so
    // `consume()` could never see 'KeyB' there either way, but the guard keeps the gate legible
    // at the call site too, and it is what keeps this out of `?capture=1` and every scenario.
    if (!engine.capture) {
      if (input.consume('KeyB')) toggleBarriers(t);
      if (input.consume('KeyG')) cycleBlackPoint(t);
      if (input.consume('KeyC')) cycleCoat(t);
      // 🛩️ [F] — the fly-over. Same slot, same gate; see `toggleFlyover` above.
      if (input.consume('KeyF')) toggleFlyover(t);
      // 🔊 [N] — the sense overlay inside it. See `updateSenses` for what each ring is read from.
      if (input.consume('KeyN')) toggleSenses(t);
      // 🔒 [L] — lock/release the fly-over camera. See `toggleLock` above.
      if (input.consume('KeyL')) toggleLock(t);
      if (flyFromUrl) { flyFromUrl = false; toggleFlyover(t, true); }
      // 🎛️ [ and ] — dig power. Same gate, same slot; see `stepDigPower` above.
      if (input.consume('BracketLeft')) stepDigPower(-1, t);
      if (input.consume('BracketRight')) stepDigPower(+1, t);
      /**
       * 🖱️ **AND THE ONE MESSAGE THAT EXPLAINS A DEAD CONTROL.** `Input` releases pointer lock
       * on blur / visibility change / Esc (see its focus block) and deliberately never asks for
       * it back on its own: a browser refuses a programmatic re-lock without a gesture and
       * Chrome enforces a cooldown after an exit, so an automatic retry fails SILENTLY and
       * leaves the player with no mouselook and nothing on screen saying why. The retry has to
       * be a click, so the player has to be told to click.
       *
       * `input.lockPrompt` is the whole policy and it lives in `player.js`: it is empty unless
       * the pointer has ACTUALLY been locked at some point this session, so the line cannot
       * appear in a harness browser (headless Chromium is routinely refused the lock, which
       * would otherwise print this across every scenario screenshot the project takes).
       *
       * ⚠️ A fresh [B]/[G]/[ ] message still wins for its four seconds — it is a direct answer
       * to a key just pressed — but `lockLost` DROPS a stale one, because the frame you get the
       * cursor back on is not the frame to be reading about dig power. Both share the one
       * context-prompt slot that already shows "[E] TAKE OIL"; no new HUD furniture, per the
       * same rule [B] and [G] follow.
       */
      if (input.lockLost) { input.lockLost = false; barrierMsgUntil = 0; }
      /**
       * 🛩️ **THE FLY-OVER'S LINE IS STANDING, NOT A FOUR-SECOND CALLOUT, AND THAT IS THE ONE
       * PLACE IT DEPARTS FROM [B]/[G]/[C].** Those three change something you are looking at and
       * then you carry on playing; this one puts you somewhere you did not walk to, and a view
       * with no way back on screen is a control that reads as a crash. The text is CONSTANT while
       * it is up, so `hud.setPrompt`'s own `text === promptText` early-out means this costs
       * exactly one DOM write per press and nothing per frame.
       */
      if (flyOn) hud.setPrompt(flyPrompt);
      else if (t < barrierMsgUntil) hud.setPrompt(barrierMsg);
      else if (input.lockPrompt) hud.setPrompt(input.lockPrompt);
    }

    /**
     * 🎥 **THE FLY-OVER TAKES THE LOOK, AND THAT IS WHAT KEEPS THE BOOM FROZEN.** `flyLook`
     * returns true only while the fly-over is up; the `else` is the shipped line, untouched. See
     * the block above `flyFrame` for why routing rather than adding keys is the answer, and
     * `_flyover1-view.mjs` A4 for the arm that drags 400 px and requires `cam.yaw`/`cam.pitch`
     * to come back byte-identical.
     */
    if (!flyLook(cmd.look)) { if (cmd.look) cam.look(cmd.look.dx, cmd.look.dy); }
    // ⚠️ CAPTURE HAS NO MOUSE, SO NOTHING WAS EVER TURNING THE BOOM. `cam.yaw` is set once at
    // construction from `player.aimYaw` and then only ever moved by `cam.look()`, which is fed
    // from `input.takeMouse()` — and `_captureLoop` never runs input. The director has always
    // returned an `aimYaw`, the PLAYER has always turned to it, and the camera has always kept
    // staring due north: every `game.play` screenshot ever taken is of a robot walking around
    // in front of a fixed camera, which is why the "look down the 27 m gallery" beat rendered
    // the north wall from 7 m away. Eased rather than snapped, because a boom that teleports
    // between headings makes the capture read as a series of cuts rather than a playthrough.
    if (engine.capture && cmd.aimYaw != null) {
      let d = cmd.aimYaw - cam.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const k = 1 - Math.exp(-5.5 * dt);
      cam.yaw += d * k;
      cam.pitch += ((cmd.aimPitch ?? 0) - cam.pitch) * k;
    }
    player.update(dt, t, {
      move: cmd.move, run: cmd.run,
      aimYaw: cmd.aimYaw ?? cam.yaw, aimPitch: cmd.aimPitch ?? cam.pitch,
    });

    // a club swing lands mid-animation, not on the button press
    const sw = player.rig.swingHit();
    if (sw) weapons.melee('limbClub', sw.at, sw.dir, t, { ignore: playerBody });

    // ---- SKATES ARE A CONTACT WEAPON, and this is where they become one.
    //
    // `rules.js` gives skates 40 damage at 1.6 m range and calls it "a rocket-skate body
    // slam", but nothing ever fired it: skates have no trigger, so the entry sat unused while
    // the gadget was just a movement mode. The damage is CARRIED, not aimed — you commit to a
    // line at 9 m/s and what you hit, you hit. `skateTop` is 9.0 against a 5.2 run, so the
    // threshold is set where you are genuinely faster than a sprint and clearly committed.
    if (player.caps.gait === 'skate' && player.speed > 6.0) {
      const d = Math.hypot(hunter.root.position.x - player.pos.x, hunter.root.position.z - player.pos.z);
      if (d < WEAPON_RANGE.skates + hunter.radius && t - _lastSlam > WEAPON_COOLDOWN.skates) {
        _lastSlam = t;
        const dir = new THREE.Vector3(
          hunter.root.position.x - player.pos.x, 0, hunter.root.position.z - player.pos.z).normalize();
        hunter.stagger?.(WEAPON_DAMAGE.skates, dir, hunter.root.position.clone());
        player.makeNoise(1);                     // hitting something at speed is not quiet
        player.vel.multiplyScalar(-0.35);        // you bounce off it too
      }
    }

    // 🔊 BEFORE the hunter, and after `player.update` (which is what fires a hammer blow's
    // `onBreak`): a noise made this frame is on the bus by the time the ear that wants it looks.
    noise.update(dt);
    hunter.update(dt, t);
    limbField.update(dt, t);
    room.update(dt);
    debris.update(dt);
    dust.update(dt);
    weapons.update(dt, t);
    // "Something is coming" needs a channel that survives a wall — see hunter-ai.js `threat`.
    // The second argument is the CHASE flag, and it is the reason the channel is worth having
    // twice: presence is a mood, a committed hunter is an instruction. See `hud.setThreat`.
    hud.setThreat(hunter.threat, hunter.committed);
    // 🔊 same two numbers the vignette just got, so the ear and the eye can never disagree.
    setHunterThreat(hunter.threat, hunter.committed);

    // ---- THE RUN. Everything that decides whether this session was a win.
    //
    // Ticked from `dt`, not from `performance.now()`: `Engine._liveLoop` clamps `dt` to 0.1 s,
    // so on a starved frame wall-clock time and game time diverge — and a score measured in
    // wall-clock seconds would charge the player for a shader compile. `flee-survival.mjs`
    // learned the same thing from the other end (an 11 s hold advanced the world 5.28 s).
    //
    // Every exit is tested, not just the live one. A chained site can never open today
    // (`damageable: false`), so the extra three iterations early-out on the first line — but
    // §8's detonation drives every panel in the house to `open`, and on that day walking out
    // through a hole the bomb made is still walking out.
    run.tick(dt);
    if (run.running) {
      for (const e of exits) if (outThrough(e, player.pos)) { run.escape('p1'); break; }
      if (player.caps?.gait === 'down') run.down('p1');
    }
    hud.setRunClock(run.t, run.phase);

    hud.update(dt);
    // 🔨 THE WORK FRAMING IS OFF WHILE SOMETHING IS COMING FOR YOU. See `ThirdPersonCamera`'s
    // WORK FRAMING header: the camera has two jobs, and reading a chase is the other one. The
    // melee gate already keeps this out of a firefight, but "am I being hunted" must not depend
    // on which weapon happens to be in the player's hands — `committed` is the same latch the
    // alarm fires from, so the lens and the HUD can never disagree about it.
    cam.workAllowed = !hunter.committed;
    cam.update(dt, player);
    // 🛩️ THE FLY-OVER IS THE LAST WORD ON THE CAMERA, and it has to be AFTER `cam.update` for
    // the same reason residency is: the boom writes `engine.camera` every frame, so overriding
    // before it would be overwritten inside the same tick. See `toggleFlyover` above.
    if (flyOn) placeFlyCamera();
    /**
     * 🐞 **"IT DOESN'T SHOW THE ROBOT SOMETIMES WHEN I STAND TOO CLOSE TO THE WALLS."** John,
     * 2026-08-15, on the fly-over. **DIAGNOSED, AND IT IS NOT AN OCCLUDER.**
     *
     * `ThirdPersonCamera.update` ends with *"below `HIDE_AT` the body stops drawing"* and sets
     * `player.model.visible = !this._hidden` **every frame** — because when the boom is pinched
     * the robot would fill the lens. Stand 0.45 m off a wall and the boom, 3.1 m behind you, is
     * inside that wall: `dist` collapses, the model is switched off, and the fly-over camera 25 m
     * overhead is then looking at a robot that is not being drawn at all.
     *
     * 📐 **MEASURED, NOT DEDUCED — `_flyover1-robot.mjs`, 35 stations derived from the floor
     * plan.** 20 DRAWN / 13 NOT-DRAWN, and the NOT-DRAWN rows read **39 of 39 meshes `visible`,
     * `player.root.visible` true, and 33–39 of them with an INVISIBLE ANCESTOR** — the fault is
     * inside his own rig, above the meshes and below the root, which is exactly `player.model`.
     * Every NOT-DRAWN station is a wall-hugging one; every room centre is DRAWN.
     * 🚨 **AND THE OBVIOUS SUSPECT WAS WRONG.** This project's dominant defect class is *"it
     * exists, something is in front of it"*, so the probe hid **every wall bucket in the house**
     * and re-ran the identical ablation: **0 px before, 0 px after**, and the game's own
     * `room.castRay` from the camera to his chest was **not stopped**. Nothing was in front of
     * him. That removal is still in the file as the first rung of D1's ladder, precisely so the
     * next person does not spend the round I nearly spent looking for an occluder.
     *
     * **THE FIX IS THIS LINE AND IT NEEDS NO STATE.** The boom's judgement is about the boom's
     * frame; the fly-over is not that frame. `cam.update` rewrites `player.model.visible` on
     * every single tick, so overriding it here while the fly-over is up hands the decision
     * straight back on the first frame after [F] drops him — there is nothing to save and
     * nothing to restore, which is why it cannot desynchronise. `player.js` is untouched.
     */
    if (flyOn && player.model) player.model.visible = true;
    // 🔊 …and the sense overlay follows the bodies it describes. THE ONLY WRITER of the overlay's
    // `visible` flags after boot, which is what stops the compile warm-up lap leaving them on.
    updateSenses();

    // 🎯 THE DIG MARK — after `player.update` (which recomputed `workAim` from this frame's aim)
    // and after the camera, so the ring the player sees is placed for the frame they are looking
    // at. It reads `player.workAim` and writes nothing but its own vertices; `aimmark.js` carries
    // the design. One mesh, one material, one draw call, `visible = false` when there is nothing
    // diggable under the swing.
    aimMark.update(player);

    // ---- the house follows the camera ------------------------------------------------
    // RESIDENCY IS A RENDER CONCEPT AND NOTHING ELSE — see room.js's header. It runs AFTER
    // `cam.update` so it sees this frame's camera and not the last one's, and BEFORE the
    // render, which the engine does after every updater. Colliders, rays and sight are
    // untouched by it; the boom raycasts a world that is always fully present.
    engine.camera.getWorldDirection(_camDir);
    // ⚠️ BOTH VIEWPOINTS, AND THE PLAYER IS THE ONE THAT MATTERS.
    //
    // This passed the CAMERA alone, and in third person the camera sits metres behind the
    // player — routinely inside a wall, or in the room you just left. `spaceAt(camera)` then
    // resolves to the WRONG space, residency is computed for that space, and **the room the
    // player is actually standing in is not resident, so it is hidden**. The characters are
    // not children of a space root, so they keep drawing: the frame becomes two lit robots
    // floating in blackness. Reported from a real playthrough as "weird render bug while
    // walking around" and "the walls are only visible on one side" — the second is the same
    // fault seen from the other end, because each space builds only its own half of a shared
    // wall, so hiding one side leaves a wall that exists from one room and not the other.
    //
    // `setViewpoints` takes an ARRAY precisely so more than one thing can keep geometry
    // resident (it was written for split screen). The player's own position is the authority
    // on which room must be present; the camera only ADDS what the boom can additionally see.
    const _views = [
      { pos: player.pos, dir: player.aimDir },
      { pos: engine.camera.position, dir: _camDir },
    ];
    /**
     * 🛩️ **THE FLY-OVER MAKES EVERY SPACE RESIDENT THROUGH THE SHIPPED CODE PATH, NOT AROUND
     * IT.** `setViewpoints` takes an ARRAY because it was written for split screen, and one
     * viewpoint parked in the middle of each space is exactly what "N eyes, keep the union" means
     * — so `room.js` needs no fly-over branch, no new residency rule and no exception for the
     * lid. The player goes in LAST because `_cur` (residency's doorway fallback) is left on the
     * last viewpoint that resolved, and the frame after [F] drops you back has to be the frame
     * the walker would have had.
     * ⚠️ The parked viewpoints carry NO `dir`, on purpose: `setViewpoints` only uses `dir` to
     * REJECT a portal behind you, and a fly-over has no behind.
     */
    if (flyOn) {
      if (_flyViews.length !== room.spaces.length + 1) {
        _flyViews.length = 0;
        for (const s of room.spaces) _flyViews.push({ pos: new THREE.Vector3(s.cx, room.floorY, s.cz) });
        _flyViews.push({ pos: player.pos, dir: player.aimDir });
      } else {
        _flyViews[_flyViews.length - 1] = { pos: player.pos, dir: player.aimDir };
      }
      room.setViewpoints(_flyViews, dt);
      exterior.update(dt, t, _flyViews);
    } else {
      room.setViewpoints(_views, dt);
      // The outside, on the same two viewpoints and immediately after — a yard is resident only
      // while its exit is open enough to see through AND somebody is placed to see it. Once the
      // player is OUT, `spaceAt` returns null for both viewpoints and the yard is kept by the
      // second test rather than by the room's residency, which no longer has anything to say.
      exterior.update(dt, t, _views);
    }

    // Lights follow the space the CAMERA is in, not the player's — in third person those
    // differ in a doorway, and the frame is lit for what the frame contains.
    /**
     * 🛩️ **…AND THE FLY-OVER DOES NOT MOVE THEM AT ALL, WHICH IS BOTH THE HONEST STATE AND THE
     * BETTER PICTURE.** `spaceAt(engine.camera.position)` is x/z only, so a camera 20 m over the
     * middle of the house resolves to whatever room happens to be under the centre — and the ONE
     * shared rig would then walk to it, leaving the room the player is standing in dark and, on
     * the way back, re-converging on the player's room only asymptotically (`follow` is an
     * exponential lerp; it never exactly arrives). Freezing it instead means the round trip is
     * exact by construction, and the key light stays as a single warm pool in the room the player
     * is actually in — which is the only depth cue a flat hemisphere wash gives you.
     * ⚠️ The BREATHING below still runs: it is `intensity` only, it is not part of any program
     * cache key and it cannot move a shadow frustum.
     */
    const seen = flyOn ? null : (room.spaceAt(engine.camera.position) ?? room.spaceAt(player.pos));
    if (seen) rig.follow(seen, dt);
    // 🛩️ The fly-over's overhead fill, re-asserted every frame it is up. `fill.intensity` is the
    // one field `apply()` never writes (it lerps `groundColor` and nothing else), so this
    // contends with nothing, and a hemisphere intensity is a per-light uniform that cannot move
    // `numPointLights` — the count `calls-1` measured at +52 shader compiles when it moved.
    if (flyOn) fill.intensity = FLY_FILL;

    // The place caption, and the same space test drives it, so it can never disagree with
    // the lighting about which room you are in.
    const stood = room.spaceAt(player.pos);
    if (stood && stood.id !== lastPlace) { lastPlace = stood.id; hud.setPlace?.(stood.name ?? stood.id); }

    // the lights breathe, so the dark is never a flat wash. A MULTIPLIER on the table value.
    key.intensity = rig.base.key.i * (1 + Math.sin(t * 2.1) * 0.05 + Math.sin(t * 7.7) * 0.02);
    warmA.intensity = rig.base.warmA.i * (1 + Math.sin(t * 5.1) * 0.06);
    warmB.intensity = rig.base.warmB.i * (1 + Math.sin(t * 6.8) * 0.05);
    /**
     * 🚨 **AND `cool` WAS MISSING FROM THIS LIST, WHICH MADE ITS TABLE COLUMN DEAD CODE.**
     * `makeLightRig`'s own header says *"Intensity is lerped too … so the table is the single
     * source of truth"*, and for three of the four it is. `cool` was read into `want.cool.i` by
     * `read()` and then never written to the light, so every `cool.intensity` in `spaces.js`
     * was decoration and the light ran at its CONSTRUCTOR 46 in all six rooms — exactly the
     * "a value that reads like a decision but is dead code" failure the header describes, one
     * light along from where it was fixed. Found by `estate-light-1` while re-aiming the table.
     * ⚠️ It changes one shipped number: the chapel's entry says 44, so the chapel's rim light
     * is now 4% dimmer than it has been. That is the table being obeyed, not a tuning change.
     * No breathing on this one — it is a doorway rim, and a rim that pulses reads as a fault.
     */
    cool.intensity = rig.base.cool.i;

    if (engine.capture && t > resetAt) { resetAt += LOOP; resetRound(); }
  });

  engine.player = player;
  engine.hunter = hunter;
  // 🔊 The bus, so a scenario can EMIT a noise at a chosen place rather than having to drive a
  // sixty-second dig to produce one — and can read `census()`/`recent()` to prove what was heard.
  // `bangPolicy` is exposed as a live field so an A/B can flip the arm inside ONE page.
  engine.noise = noise;
  // Exposed for `harness/scenarios/mansion.mjs` A5. The opening beat is an assertion about the
  // state the round STARTS in, and by the time a scenario reaches it the world has been shot
  // at, breached and dismembered. Re-running the production reset is the honest way back to
  // t=0 without paying a 26 s re-bake for a page reload — and it tests the reset path itself,
  // which the capture loop runs every 28 s and nothing else ever checked.
  engine.resetRound = resetRound;
  engine.run = run;
  // The resolved sites, for `harness/scenarios/escape.mjs`. `outThrough` is exposed with them
  // because a probe that re-implements the escape rule is testing its own copy of it, which is
  // exactly how this project got five lying instruments.
  engine.exits = exits;
  engine.exterior = exterior;
  /**
   * Re-derive every connector's state from the run and push it at the world. Exposed for the
   * same reason `resetRound` is: `harness/scenarios/conn-2.mjs` has to flip ONE site between
   * live and chained inside a single page, at one station, with the boom already settled —
   * because an A/B taken on two pages is the comparison this project has been burned by. A
   * probe that re-implemented this would be testing its own copy of the rule.
   */
  engine.applyExitPlan = applyExitPlan;
  /** The resolved connector map — the answer everything else in the build reads. */
  engine.connectorState = (id) => conn.get(id) ?? null;
  engine.outThrough = outThrough;
  engine.room = room;
  engine.weapons = weapons;
  engine.limbField = limbField;
  // NOT `engine.hud` — that name is taken. `Engine` sets `this.hud = capture ? null :
  // makeHud()`, a FUNCTION it calls every frame in `_liveLoop` (`if (this.hud) this.hud(this)`).
  // Assigning the game's HUD *object* here replaced that function and threw
  // "this.hud is not a function" on every live frame, so `game.play` crashed instantly the
  // moment anyone actually played it.
  //
  // It went unnoticed for 30 rounds because CAPTURE mode sets `this.hud = null` and takes
  // `_captureLoop`, which never makes that call — so every screenshot, every audit and every
  // critic verdict on this piece was taken down a code path that cannot reach the bug.
  engine.gameHud = hud;
  engine.debris = debris;
  engine.dust = dust;
  engine.cam = cam;
  /**
   * Exposed for `harness/mechanics.mjs`'s ROUND-RESET check, and the reason is the bug it was
   * written for: *"movement input continue permanently after an escape"* is a claim about
   * `Input.keys` — a HELD-key set whose only eraser is a `keyup` that a round transition can
   * eat — and there is no way to assert on it from outside without the object. Every other
   * symptom of that defect (the robot walking into a wall) is a consequence measured seconds
   * later and confounded by everything else the reset moves; the set itself is the fact.
   */
  engine.input = input;
  /**
   * The one reach E advertises and acts on, published for the same reason `input` above is: an
   * instrument that carries its own copy of the number cannot detect the two drifting apart,
   * because it has already picked a side. See `E_REACH`'s note by the input handler.
   */
  engine.eReach = E_REACH;
  /**
   * 🚨 **THIS LINE WAS MISSING AND IT MADE `perf-spaces.mjs` A LYING INSTRUMENT.**
   *
   * That tool's `park()` reads: *"Capture mode's Director drives the player every frame, so a
   * teleport alone lasts exactly one frame before it steers away. `engine.director.step` is
   * replaced with a no-op for the duration instead of fighting it — a parked measurement has to
   * actually stay parked, and a probe that cannot hold its own conditions is measuring something
   * it cannot name."* The reasoning is exactly right. **`engine.director` was never assigned
   * anywhere in `src/`** — grep it — so `if (e.director && ...)` was silently false on every run
   * this project has ever made, the no-op was never installed, and the Director walked the
   * player out of the station inside every timed window.
   *
   * ⚠️ **SO EVERY ABSOLUTE `perf-spaces` FIGURE ON RECORD WAS TAKEN UNPARKED** — the worst-space
   * 1.22–1.38 ms and the 576–596 draw calls included. Those numbers are not wrong so much as
   * they are not what their labels say: they are a short walk starting at an anchor, not a stand
   * at one. Re-measure before quoting any of them as a per-station figure.
   *
   * It is one line, it is in the file this round already edits, and the alternative is every
   * future parked measurement inheriting the same silent failure.
   */
  engine.director = director;

  // ⚠️ THIS ORDER IS THE WHOLE POINT AND IT IS NOT ARBITRARY.
  //
  // `finalizeScene()` both runs `patchForScreenAO` over every standard material in the scene
  // and drives a compile pass — and BOTH walk VISIBLE objects only. Residency hides rooms, so
  // a room hidden at this moment gets its shaders built on the frame you first walk into it,
  // and a room whose materials were never patched gets a different program later anyway.
  //
  // That is exactly the trap `precompileStages` exists for: the hunter's stages 2 and 3 are
  // built hidden and their shaders were compiled on the frame the hunter GROWS — a measured
  // 2498 ms freeze at the single most important moment in the round. Hidden rooms are the
  // same bug with a different subject.
  //
  // So: everything visible -> finalize -> precompile both light-count variants -> and only
  // THEN apply residency. All of it inside the loading screen, where a stall costs nothing.
  /**
   * ⚠️ `?estate=` — THE FEASIBILITY SPIKE, DEFAULT OFF, AND IT IS AN INSTRUMENT NOT A FEATURE.
   *
   * John, 2026-08-08: *"none of the room assets are in the playable slice."* Verified — this
   * file never imports `room-gallery.js`/`room-ballroom.js`/`room-study.js`, so every art score
   * on the board is for a frame no player ever sees. `src/game/estate-spike.js` ports the
   * showcase gallery into the game's `gallery` space in three separable layers so each can be
   * PRICED before anyone commits to the refactor. Read that file's header for the arms.
   *
   * ⚠️ IT GOES HERE, IMMEDIATELY BEFORE THE VISIBILITY LAP AND `finalizeScene()`, FOR THE SAME
   * REASON EVERYTHING ELSE DOES: the finalize pass patches materials and drives a compile over
   * VISIBLE objects, and the warm-up lap below covers whatever `numPointLights` is at that
   * moment. Adding lights after either of them would pay the recompile on the frame the player
   * first sees the room — the exact failure the warm-up exists to prevent.
   */
  // 🆕 DEFAULTS TO `port` — see the matching note in `src/game/room.js`. Both call sites must
  // agree or the room is built to the estate order while the fixture rig is left off it.
  // `?estate=off` restores the shipped boxes.
  const _estate = estateMode(
    (args.estate ?? new URLSearchParams(location.search).get('estate')) ?? 'port');
  /**
   * 🆕 **`?estate=port` IS THE REFACTOR, AND IT SPLITS THE RIG IN TWO ON PURPOSE.**
   *
   * `src/game/room.js` has already built the gallery to `src/world/gallery-order.js` — the same
   * module `views/room-gallery.js` builds from — by the time this runs. What is left is the
   * PRACTICALS, and `estate-spike-1` measured both horns of how to place them:
   *
   *   · scene-parented, the rig costs **818 draw calls** at a station where the gallery is
   *     hidden; parented under the space root, **537** — residency saves **281**.
   *   · but three's `projectObject` skips a hidden subtree entirely, so parenting the LIGHTS
   *     there culls them out of `numPointLights`, `numPointLights` is in three's program cache
   *     key, and the count then changes on every room transition. That is the mechanism behind
   *     John's five-second freeze, and the warm-up lap below exists because of it.
   *
   * So: **fixture MESHES under the space root, LIGHTS on the scene root at a constant count.**
   * Both halves of the deal, neither horn. The count is 2 and the reasoning is in
   * `src/lighting/gallery-rig.js`'s header, priced off the project's own ABBA instrument.
   *
   * ⚠️ It runs BEFORE the visibility lap and `finalizeScene()` for the same reason the spike
   * does: adding a light after either of them pays the recompile on the frame the player first
   * sees the room.
   */
  if (_estate?.port && room.estate?.order && !_estate.norig) {
    await engine.work((async () => {
      const { galleryFixtures } = await import('../lighting/gallery-rig.js');
      const sp = room.spaces.find((s) => s.orderPlan && s.orderBase);
      if (!sp) return;
      const rig = galleryFixtures({
        plan: sp.orderPlan, base: sp.orderBase,
        mats: { brass: room.materials?.estate?.brass },
        points: _estate.rigPoints,
        // `?aim=box` reverts these two with the five in `spaces.js`, so the arm is one build.
        box: (new URLSearchParams(location.search).get('aim') ?? '') === 'box',
        candelabra: new URLSearchParams(location.search).get('furn') !== '0' ? false : undefined,
      });
      for (const m of rig.meshes) sp.root.add(m);
      for (const l of rig.lights) scene.add(l);
      engine.onUpdate((dt, t) => rig.flicker(t));
      // Reported through the build, never through the query string — HANDOFF's rule, and two
      // toggles in this project have reverted less than they claimed.
      engine.__estateRig = rig.stats;
    })());
  }
  /**
   * 🆕 **AND THE SAME DEAL FOR THE TWO STUDIES** (`estate-2`, 2026-08-09).
   *
   * `src/game/room.js` has already built `study_w` and `study_e` to `src/world/study-order.js`
   * — the same module `views/room-study.js` builds from, and its capture is byte-identical
   * across the extraction. What is left is the PRACTICALS, and they take the split the gallery
   * proved: fixture MESHES under each space root so residency culls them, LIGHTS on the scene
   * root at a count that never moves.
   *
   * ⚠️ **THE COUNT IS 1 PER STUDY, i.e. 2 FOR THE HOUSE, and it is not the gallery's number
   * halved by timidity.** It is the hearth, and the hearth is the only practical in this room
   * whose job is to light a CARVED object: `critic-estate-5` filed the chimneypiece's
   * coat-of-arms as flat, and the cause was that it is lit by a hemisphere, which has no
   * direction, so a 30 mm relief and a flat plate return the same value. Everything else the
   * showcase buys with lights this rig buys with emissive glazing and merged glow decals. Full
   * reasoning and the ablation arms in `src/lighting/study-rig.js`'s header.
   *
   * ⚠️ It runs BEFORE the visibility lap and `finalizeScene()` for the same reason the gallery's
   * does: a light added after either of them pays its recompile on the frame the player first
   * sees the room.
   */
  if (_estate?.port && _estate.study && room.estate?.study && !_estate.norig) {
    await engine.work((async () => {
      const { studyFixtures } = await import('../lighting/study-rig.js');
      const stats = [];
      for (const sp of room.spaces) {
        if (sp.order !== 'study' || !sp.orderPlan) continue;
        const rig = studyFixtures({
          plan: sp.orderPlan,
          mats: { brass: room.materials?.estate?.brass },
          points: _estate.studyPoints,
        });
        for (const m of rig.meshes) sp.root.add(m);
        for (const l of rig.lights) scene.add(l);
        engine.onUpdate((dt, t) => rig.flicker(t));
        stats.push({ space: sp.id, ...rig.stats });
      }
      // Reported through the build, never through the query string — HANDOFF's rule.
      engine.__studyRig = stats;
    })());
  }
  /**
   * 🆕 **AND THE THIRD ROOM** (`estate-3`, 2026-08-09). `src/game/room.js` has already built the
   * ballroom to `src/world/ballroom-order.js` — the same module `views/room-ballroom.js` builds
   * from, and its capture is byte-identical across the extraction — at its REAL 9.6 m storey,
   * upper window register and musicians' gallery intact. What is left is the practicals, and
   * they take the split the other two proved: fixture MESHES under the space root so residency
   * culls them, LIGHTS on the scene root at a count that never moves.
   *
   * 🚨 **AND HERE THE COUNT THAT NEVER MOVES IS ZERO.** The gallery bought 2 and each study 1, so
   * the house runs 14 point + 1 spot + 1 hemisphere and this room leaves it there. The thing the
   * other two rigs bought a point light for — direction, which a hemisphere and a decal cannot
   * have — this room already owns in the shadow-casting KEY that `spaces.js` aims across the
   * colonnade. Adding fragment-loop iterations to the one room whose problem is fragments (it is
   * a third taller than it was) would also make the `noballroom` A/B a comparison between two
   * different program sets. Full argument, and the ordered spec `?estate=port,bp1..bp3` walks up,
   * in `src/lighting/ballroom-rig.js`'s header.
   */
  if (_estate?.port && _estate.ballroom && room.estate?.ballroom && !_estate.norig) {
    await engine.work((async () => {
      const { ballroomFixtures } = await import('../lighting/ballroom-rig.js');
      const sp = room.spaces.find((s) => s.order === 'ballroom' && s.orderPlan);
      if (!sp) return;
      const rig = ballroomFixtures({
        plan: sp.orderPlan,
        mats: {
          brass: room.materials?.estate?.brass,
          crystal: room.materials?.estate?.crystal,
        },
        points: _estate.ballPoints,
        rng: engine.rng,
        candelabra: new URLSearchParams(location.search).get('furn') !== '0' ? false : undefined,
      });
      for (const m of rig.meshes) sp.root.add(m);
      for (const l of rig.lights) scene.add(l);
      engine.onUpdate((dt, t) => rig.flicker(t));
      engine.__ballroomRig = rig.stats;
    })());
  }
  /**
   * 🪑 Phase A — eight ornate chairs in a circle at ballroom centre.
   * `docs/slices/task-furn-destruct.md`. One InstancedMesh + 8 AABBs; sledge prefers them
   * over a dig face behind. `?furn=0` ablates the whole dress for a same-station call A/B.
   */
  if (_estate?.port && _estate.ballroom && room.estate?.ballroom
      && new URLSearchParams(location.search).get('furn') !== '0') {
    await engine.work((async () => {
      const { chairCircleParts } = await import('../world/props.js');
      const { FurnPart, FurnAssembly, partBoxWorld } = await import('../destruction/furn-parts.js');
      const { makeFurnHandlers } = await import('../destruction/furn-fx.js');
      const sp = room.spaces.find((s) => s.order === 'ballroom' && s.orderPlan);
      if (!sp || !room.materials) return;
      const mat = (room.materials.gilt ?? room.materials.wall)?.clone?.()
        ?? room.materials.gilt ?? room.materials.wall;
      if (!mat) return;
      const { onBreak, onStage, onPartBreak, onHit } = makeFurnHandlers({ debris, dust });
      const { seats } = chairCircleParts({
        count: 8, radius: 3.4, cx: sp.cx, cz: sp.cz, y: 0,
        material: mat, rng: engine.rng, idPrefix: `${sp.id}.chair`,
      });
      for (const seat of seats) {
        sp.root.add(seat.root);
        const parts = seat.partDefs.map((def) => new FurnPart({
          id: def.id, role: def.role, mesh: def.mesh,
          box: partBoxWorld(seat.x, seat.y, seat.z, seat.rotY, def.local),
        }));
        room.registerFurn(new FurnAssembly({
          id: seat.id, spaceId: sp.id, kind: 'chair', root: seat.root, parts,
          onBreak, onStage, onPartBreak, onHit, legsToCollapse: 3,
        }));
      }
      engine.__chairCircle = { space: sp.id, count: seats.length, radius: 3.4, parted: true };
    })());
  }
  /**
   * 🪑 Phase B — desks / consoles / crates into study, ballroom and gallery.
   * `dressLooseFurniture` places per-space without mirroring study_e from study_w.
   */
  if (_estate?.port && new URLSearchParams(location.search).get('furn') !== '0') {
    await engine.work((async () => {
      const { dressLooseFurniture } = await import('../game/furn-dress.js');
      engine.__furnDress = dressLooseFurniture(room, { debris, dust, rng: engine.rng });
      engine.__rrrCams = engine.__furnDress?.cams ?? [];
    })());
  }
  /** Meshy smash lineup — `?furnline=1` (see docs/slices/task-meshy-furn-lineup.md). */
  if (new URLSearchParams(location.search).get('furnline') === '1') {
    await engine.work((async () => {
      const { dressMeshyLineup } = await import('../game/furn-meshy-lineup.js');
      engine.__furnLineup = await dressMeshyLineup(room, { debris, dust });
    })());
  }
  /**
   * 🪑 `?furndemo=1` — one-click furniture destruction demo (FURN.bat).
   * Equips the sledge and parks you in the ballroom chair circle. Live only; capture
   * baselines must not move. Re-armed on `resetRound` so Retry keeps the demo setup.
   */
  function armFurnDemo() {
    if (engine.capture) return false;
    if (new URLSearchParams(location.search).get('furndemo') !== '1') return false;
    const at = room.anchor?.('ballroom.centre');
    if (!at) return false;
    player.pos.copy(at);
    // Step back from +Z chair.0 and push out of any furniture AABB.
    player.pos.z -= 0.55;
    player.vel.set(0, 0, 0);
    room.collide?.(player.pos, 0.42);
    room.collide?.(player.pos, 0.42);
    // Face +Z toward chair.0 (circle places i=0 near +Z from centre).
    player.facing = 0; player.aimYaw = 0; player.aimPitch = -0.08;
    cam.yaw = 0;
    player.sledge.owned = true;
    player.sledge.equip();
    engine.__furnDemo = true;
    return true;
  }
  function armFurnLine() {
    if (engine.capture) return false;
    if (new URLSearchParams(location.search).get('furnline') !== '1') return false;
    const at = room.anchor?.('ballroom.centre');
    if (!at) return false;
    player.pos.copy(at);
    player.pos.z += 1.2;
    player.pos.x -= 2;
    player.vel.set(0, 0, 0);
    room.collide?.(player.pos, 0.42);
    player.facing = 0;
    player.aimYaw = 0;
    player.aimPitch = -0.06;
    cam.yaw = 0;
    player.sledge.owned = true;
    player.sledge.equip();
    engine.__furnLine = true;
    return true;
  }
  armFurnDemo();
  armFurnLine();
  // ⚠️ THE SPIKE'S ADDITIVE ARMS ONLY. `port` alone must not also run the price probe on top of
  // the refactor, or the capture is of both and attributable to neither.
  if (_estate && (_estate.geo || _estate.lights || _estate.points || _estate.spots)) {
    await engine.work(applyEstateSpike(engine, room, _estate, room.materials));
  }

  for (const s of room.spaces) { s.visible = true; s.root.visible = true; }
  for (const p of room.panels) p.root.visible = true;
  // ⚠️ AND THE OUTSIDE, FOR EXACTLY THE SAME REASON. Every yard, every seam and every padlock
  // is built HIDDEN — so without this they are invisible to `patchSceneForScreenAO` and to the
  // compile pass, and their programs get built on the frame the wall finally opens. That is the
  // one frame in the run where a stall is unforgivable: it is the win.
  exterior.warmup(true);
  engine.finalizeScene();
  hunter.precompileStages(engine);
  // ⚠️ `renderer.compile()` IS NOT ENOUGH ON ITS OWN — MEASURED, NOT ASSUMED.
  // With every space visible and `finalizeScene()` already run, walking from the study into
  // the gallery still cost a **1974 ms** frame, and the probe that caught it recorded the
  // renderer's program count going **59 -> 73 across that one frame**. A program count is the
  // difference between a shader compile and a texture upload, which need opposite fixes; this
  // was unambiguously a compile. So `compile()` did not cover those fourteen.
  // Actually DRAWING each space once does, because a draw is the thing whose requirements the
  // renderer must satisfy. One render per space, camera inside it so nothing is frustum-culled
  // out of the pass, paid here inside the loading screen where a stall is free.
  //
  // ⚠️ LIVE ONLY, AND THIS IS A MEASURED TRADE RATHER THAN AN OVERSIGHT. In capture mode the
  // canvas is a hard 1920x1080 with `preserveDrawingBuffer`, and paying this warm-up there
  // took `markReady` from 33 s to 44-50 s and then lost the renderer outright — three runs in
  // a row died on "execution context was destroyed" AFTER signalling ready, with no JS error
  // and with `boots clean` still passing under `playtest --q capture=1`. That is the GPU
  // process going down, not a bug in the view.
  // The stall this prevents is a first-visit compile when the hunter's eye lights in a room
  // you have just walked into — which is a LIVE PLAY event. The capture director stays in the
  // gallery for the whole 28 s loop, so capture cannot hit it, and a screenshot path that
  // cannot produce a screenshot is worse than an optimisation it does not need.
  if (!engine.capture) {
    const camWas = engine.camera.position.clone();
    const quatWas = engine.camera.quaternion.clone();
    const home = room.spaceAt(camWas) ?? room.spaces[0];

    // ⚠️ **FOUR POINT-LIGHT COUNTS, NOT TWO — AND THIS IS JOHN'S FIVE-SECOND FREEZE.**
    //
    // `perf-stall-1` proved it by removal. On every un-prewarmed run the largest freeze episode
    // is a SHADER COMPILE: `renderer.info.programs.length` jumps **+30 to +52 on the stalling
    // frame** while `memory.textures` is flat, `baker.stats.bakes` is flat, and ~100% of the
    // interval is inside `pipeline.render()`. Programs built during play across five runs:
    // **+152, +107, +177, +132, +111**, with episodes of 4.97 / 5.29 / 5.41 / 5.90 / 10.26 s.
    //
    // The cause is one loop bound. This used to read `for (const flareOn of [true, false])`,
    // because the file believed the hunter's eye flare was the only thing that could move
    // `numPointLights`. **It is not. THE GADGETS BRING THEIR OWN POINT LIGHTS**
    // (`src/gadgets/index.js`), and the RENDERED count takes FOUR values in live play:
    //
    //     10 = warmA + warmB + cool  +  nailgun x2 + oil x2 + grapple + skates x2
    //     11 = 10 + the hunter's eye flare
    //      8 = 10 - the nail gun's pair leaving the render list
    //      9 = 8 + the flare
    //
    // `numPointLights` is part of three.js's program cache key, so ONE FRAME at a count that
    // was never compiled recompiles every visible material. In one recorded run count 8 was
    // live for a **single frame** and still cost **+132 programs**. Warming two of the four
    // counts left the other two to be paid mid-play, at whatever moment the player happened to
    // drop a gun or the hunter happened to notice them.
    //
    // ⚠️ AND THE COMMENT AT THE LIGHT RIG SAID THE OPPOSITE. *"THE LIGHT COUNT IS FIXED FOR THE
    // WHOLE MANSION AND MUST NEVER CHANGE"* is true of the ROOM RIG and false of the GAME, and
    // that stale sentence is most of why nobody looked. It is corrected at its own site.
    //
    // Measured with `harness/perf-stall.mjs`, which gates on the DETERMINISTIC counter rather
    // than the clock (wall-clock tails do not resolve on this box: max ranged 3.0-10.7 s within
    // identical configs, which by this project's own rule is NOT RESOLVED). The equivalent
    // harness-side experiment collapses in-play program builds from **+152/+107/+177 to
    // +10/+8/+7/+2**, four times, with no compile burst in any freeze episode of any prewarmed
    // run.
    //
    // ⚠️ STILL LIVE ONLY — see the note above; paying this in capture took `markReady` from
    // 33 s to 44-50 s and then lost the renderer outright on three runs.
    //
    // ⚠️ AND EVERY OBJECT VISIBLE, NOT JUST EVERY SPACE ROOT. A render only compiles what it
    // DRAWS. The gadgets lying at their anchors, the hunter's hidden stage rigs, the debris and
    // dust pools and this round's connector dressing are all built hidden or empty, so a lap
    // that only unhides rooms warms the rooms and nothing that is ever in them.
    const progBefore = engine.renderer.info.programs?.length ?? 0;
    const fovWas = engine.camera.fov;
    engine.camera.fov = 120;
    engine.camera.updateProjectionMatrix();
    const visWas = [];
    engine.scene.traverse((o) => { visWas.push(o, o.visible); o.visible = true; });
    // ⚠️ THE PARTICLE POOLS DRAW NOTHING UNTIL SOMETHING HAS HAPPENED, so a lap over a quiet
    // house never compiles them and the first wall you hit pays for both. `DebrisSystem` is one
    // `InstancedMesh` per material with `instanceCount` at 0, and `DustSystem` sets
    // `geometry.instanceCount = 0` whenever nothing is alive — an instance count of zero is a
    // draw the driver skips, so the program is never built. Prime them here, in the loading
    // screen, and let their own update loops expire them normally.
    for (const s of room.spaces) {
      const at = new THREE.Vector3((s.x0 + s.x1) / 2, 1.2, (s.z0 + s.z1) / 2);
      for (const kind of Object.keys(DEBRIS_KINDS)) debris.burst(kind, at, 3, { speed: 0.2, spread: 0.4 });
      dust.burst(at, 6, { radius: 1.0 });
    }
    debris.update(0.016); dust.update(0.016);

    // The nail gun's pair is the one that measurably leaves and rejoins the render list. Found
    // by NAME PATH rather than by a hardcoded reference, because these lights belong to
    // `src/gadgets/index.js` and this file must not reach into another owner's structure.
    const gunLights = [];
    engine.scene.traverse((o) => {
      if (!o.isPointLight) return;
      let q = o, tag = '';
      while (q) { tag = `${q.name || ''}/${tag}`; q = q.parent; }
      if (/nailgun/i.test(tag)) gunLights.push(o);
    });

    // ⚡ THE LAP RENDERS INTO A TINY BUFFER, AND IT IS SAFE BY EXACTLY THE ARGUMENT THE FOV BELOW
    // ALREADY USES: **resolution is not part of the program cache key.** A program is identified
    // by its material, its defines and its light counts — never by how many pixels it was asked
    // to fill. So the lap compiles the same set of programs into a 320-wide buffer that it would
    // into a 1920-wide one, for a fraction of the fill.
    //
    // Why it was worth doing: the lap is 2 x 2 x SPACES x 4 = **96 FULL PIPELINE renders**, each
    // with every object in the scene forced visible, through a stack that runs a depth prepass,
    // AO, bloom mips and FXAA. That is fill-rate bound, and it scales with the window. John
    // measured **~5 MINUTES** on an RTX 3060 Ti with WebGL hardware-accelerated and the NVIDIA
    // card active, while the 1280x720 Playwright harness on the SAME MACHINE boots in 20-40 s.
    // The gap was never the GPU; it was that nobody had ever watched this lap at 1920x1080.
    //
    // ⚠️ ASPECT IS PRESERVED. Aspect changes the frustum, and the lap's coverage argument (four
    // 120 deg looks covering the circle twice over) is a frustum argument. Only pixel count moves.
    // ⚠️ AND THIS CHANGES NO PIXEL THE PLAYER SEES — the buffers are restored below, before the
    // play gate opens. It is a load-time cost change, not a look change.
    //
    // `?warmres=full` reproduces the old full-resolution lap for comparison; `?warmres=<width>`
    // picks a different target width.
    // 🚨 THE LAP MUST HAND THE MAIN THREAD BACK, OR CHROME KILLS THE TAB.
    //
    // John, 2026-08-07: **"I get page unresponsive when I try it in chrome."** That is not a slow
    // load, it is a HUNG one — Chrome shows that dialog when the main thread has not returned to
    // the event loop for ~15 s, and this lap runs 96 renders and ~1054 shader compiles in ONE
    // unbroken synchronous block. So the "loading screen" was never a loading screen: it was a
    // frozen tab with a CSS sweep bar animating on the compositor, which is exactly why it still
    // *looked* alive while the page was dead. **Nobody caught it because Playwright has no
    // unresponsive dialog and never complains.**
    //
    // Yielding is safe HERE and would not be everywhere: this block is `!engine.capture` (live
    // only, see the note above, so capture determinism cannot be touched) and `engine.start()`
    // does not happen until the gate is clicked, so no render loop is running that could observe
    // the half-restored `visible` flags this lap sets.
    //
    // ⚠️ MessageChannel, NOT setTimeout and NOT requestAnimationFrame. Background tabs clamp
    // timers to ~1/s, which would turn a 5-minute load into an hour if John alt-tabs away, and
    // rAF stops entirely in a hidden tab — either would mean the load never finishes if he looks
    // away. A MessageChannel round trip yields to the event loop and is throttled by neither.
    const yieldToBrowser = () => new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
      ch.port2.postMessage(0);
    });
    // The card already says "Building the estate…" forever. Say what is actually happening, so a
    // long wait reads as progress rather than as a hang. `?warmres=full` still gets the counter.
    // ⚠️ TOUCH THE DOM SPARINGLY. Writing `textContent` on a full-screen overlay every render
    // dirties style and layout 96 times, and the first version of this block did exactly that —
    // it pushed the load past `playtest.mjs`'s six-second pre-click wait and broke the play gate
    // in the harness. The yield has to stay cheap or it becomes the cost it was added to remove.
    const gateMsg = document.getElementById('rrr-gate-msg');
    /**
     * 🔬 **`?warmlap=compile` — THE FRUSTUM-FREE LAP. MEASURED, NOT THE DEFAULT, AND THE REASON IT
     * IS NOT THE DEFAULT IS THE MOST USEFUL THING `boot-1` FOUND ABOUT THIS BLOCK.**
     *
     * Every "the count is load-bearing" argument below — four looks per space, the 120° fov,
     * `scene.traverse(o => o.visible = true)` — exists for ONE reason: *a render only compiles what
     * it DRAWS*. That reason does not apply to `renderer.compile()`. Three r180 gathers lights with
     * `traverseVisible` and then walks materials with a plain **`scene.traverse`** — no frustum
     * test, no culling, no camera position, not even a visibility test on the mesh. So one call per
     * light variant compiles a strict SUPERSET of anything six spaces x four looks can reach.
     *
     * **And the superset is measurably bigger, which means the drawn lap has always been
     * incomplete.** A/B on one file, `quality=high`, 1280x720, lap at 320 px, fresh profile
     * (`_boot1-census.mjs`):
     *
     * | lap | programs built | lap wall clock | to `ready` | ms per program |
     * |---|---|---|---|---|
     * | drawn, 96 renders (**default**) | **462** | 49.2 s | 78.9 s | 106.5 |
     * | `?warmlap=compile`, 4 compiles + 24 renders | **631** | 57.5 s | 87.4 s | **91.1** |
     *
     * Two facts, and they point opposite ways. `compileAsync` is **14% cheaper per program** —
     * `KHR_parallel_shader_compile` lets ANGLE's workers overlap, where a drawn lap serialises each
     * compile behind the draw that needs it. But it finds **169 programs (37%) the drawn lap never
     * reached**, mostly wall-stage materials on panel sites no look direction covers — `ws.paper`
     * goes 132 -> 160 — so it costs **8.5 s more wall clock** despite being faster per unit.
     *
     * **Load time is what is blocking the campaign, so the cheaper lap stays default.** Flip this
     * default the moment the program COUNT comes down — `harness/scenarios/_boot1-census.mjs`
     * measures 75% of these programs sitting behind ONE cache-key field (`wall.js` pins
     * `customProgramCacheKey` per panel per layer; collapsing it takes 696 keys to 174) — at that
     * point the superset is nearly free and it closes a coverage hole that is real today.
     *
     * ⚠️ **WHAT `compile()` DOES NOT COVER, so the renders run in both modes.** It knows nothing
     * about the shadow map's own depth pass (`WebGLShadowMap`'s internal depth materials) and
     * nothing about the post stack's fullscreen passes, which are not in `scene` at all. The
     * shadow half still needs `rig.snapTo(s)` per space, for the reason recorded below.
     *
     * ⚠️ `compileAsync`'s internal poll is `setTimeout(…, 10)`, which a BACKGROUND tab clamps to
     * ~1 s — the hazard the MessageChannel note above exists for. It is bounded rather than
     * unbounded: each pass re-checks every outstanding material and deletes the ready ones, so an
     * alt-tabbed load costs a few extra seconds per variant, not a stalled load.
     */
    const _lapMode = new URLSearchParams(location.search).get('warmlap') === 'compile' ? 'compile' : 'render';
    const _lapLooks = (s) => (_lapMode === 'compile'
      ? [[s.x0, s.z0]]
      : [[s.x0, s.z0], [s.x1, s.z1], [s.x0, s.z1], [s.x1, s.z0]]);
    const totalRenders = 4 * (room.spaces.length * (_lapMode === 'compile' ? 1 : 4) + (_lapMode === 'compile' ? 1 : 0));
    let doneRenders = 0, shownPct = -1;
    const warmTick = async () => {
      doneRenders++;
      const pct = Math.round((doneRenders / totalRenders) * 100);
      if (gateMsg && pct >= shownPct + 10) {
        shownPct = pct;
        gateMsg.textContent = `Compiling shaders… ${pct}%`;
      }
      await yieldToBrowser();
    };
    const warmT0 = performance.now();

    const _warmArg = new URLSearchParams(location.search).get('warmres');
    const _warmW0 = engine.pipeline.canvasWidth, _warmH0 = engine.pipeline.canvasHeight;
    let warmRes = null;
    if (_warmArg !== 'full' && _warmW0 > 0 && _warmH0 > 0) {
      const targetW = Math.max(64, +(_warmArg ?? 320) || 320);
      if (targetW < _warmW0) {
        const k = targetW / _warmW0;
        const w = Math.max(64, Math.round(_warmW0 * k));
        const h = Math.max(36, Math.round(_warmH0 * k));
        engine.renderer.setSize(w, h, false);
        engine.pipeline.setSize(w, h);
        warmRes = { from: [_warmW0, _warmH0], to: [w, h] };
      }
    }

    for (const gunOn of [true, false]) {
      for (const l of gunLights) l.visible = gunOn;
      for (const flareOn of [true, false]) {
        // `HunterAI._setFlare(true)` ADDS the eye light to the scene the first time the hunter
        // notices you. `precompileStages()` already pays this for the hunter's own stage rigs —
        // that is exactly why it runs twice — but nothing was paying it for the ROOMS.
        if (flareOn) hunter.root.add(hunter.flare); else hunter.flare.removeFromParent();
        // ---- the frustum-free half. See the block comment at `_lapMode` above.
        // This is what actually compiles the mansion's main-pass programs at this light count;
        // the renders below exist for the shadow pass and the post stack, not for coverage.
        if (_lapMode === 'compile') {
          if (engine.renderer.compileAsync) await engine.renderer.compileAsync(engine.scene, engine.camera);
          else engine.renderer.compile(engine.scene, engine.camera);
          await warmTick();
        }
        for (const s of room.spaces) {
          // MOVE THE KEY LIGHT WITH THE CAMERA. This is the half that was missing and it cost
          // two measured rounds: a material's SHADOW-pass program is a different program from
          // its main-pass one, and it is only built when the mesh is inside the shadow caster's
          // own frustum. Rendering each space with the light left behind in the previous room
          // compiled fourteen main-pass programs that already existed and none of the depth
          // variants, so the stall did not move at all — 59 -> 73 programs, twice, to the digit.
          rig.snapTo(s);
          // ⚠️ EVERYTHING FROM HERE TO THE END OF THIS LOOP IS THE DEFAULT DRAWN LAP AND IS
          // UNCHANGED. Under `?warmlap=compile` only, `_lapLooks` returns ONE direction and the fov
          // widening becomes redundant rather than load-bearing, because the coverage worry below
          // is answered by `compileAsync` having no frustum — see the block comment at `_lapMode`.
          //
          // FOUR LOOK DIRECTIONS, AND THE COUNT IS LOAD-BEARING. A render only compiles what it
          // actually DRAWS, so frustum culling means one direction warms up one wall of the
          // room. Cutting this from two directions to one halved the fix: the stall came back
          // at 1102 ms instead of 2410.
          //
          // ⚠️ AND FOUR CORNERS DOES **NOT** COVER A RECTANGULAR ROOM — this comment used to
          // claim it did and it is wrong by arithmetic. Four diagonals at a 62° fov leave four
          // ~50° wedges uncovered, one down each AXIS, and the middle of the room falls in
          // them: from the ballroom's centre the skates lying at `ballroom.south` are **60.6°**
          // off the nearest corner look, i.e. outside every one of the four frustums. That is
          // why the gadgets' own materials — `jetPlume0Mat`, `jetPlume1Mat` and the rest — were
          // still being compiled mid-play at all four light counts after the count fix landed.
          // The fov is widened for the lap instead of adding four more renders: it costs
          // nothing, it is not part of the program cache key, and 120° x 4 covers the circle
          // twice over.
          engine.camera.position.set((s.x0 + s.x1) / 2, 1.6, (s.z0 + s.z1) / 2);
          for (const look of _lapLooks(s)) {
            engine.camera.lookAt(look[0], 1.2, look[1]);
            engine.camera.updateMatrixWorld(true);
            // `engine.pipeline.render()`, NOT `renderer.render()`. The live loop renders through
            // the post pipeline, and at every quality tier above `low` that pipeline runs a
            // DEPTH PREPASS — which draws every mesh again with a depth-only material, i.e. a
            // second program per material that a raw `renderer.render` never asks for. Warming
            // up with the wrong render path compiled the wrong programs and moved the stall 0 ms.
            engine.pipeline.render(0);
            // One yield per render. A single render is ~11 of the 1054 programs, so it is
            // seconds at worst — comfortably under Chrome's unresponsive threshold, which is
            // what this has to stay under.
            await warmTick();
          }
        }
      }
    }
    // Put the buffers back BEFORE anything the player will ever see is drawn. `_resize()` is the
    // one place that knows how to size the renderer and the pipeline together, and it re-derives
    // from the window (or the capture size), so it is correct in both modes.
    if (warmRes) engine._resize();

    // Leave the flare exactly as `HunterAI` expects to find it: detached, with `_flareOn`
    // still falsy, so its own add/remove bookkeeping is untouched by the warm-up.
    hunter.flare.removeFromParent();
    for (const l of gunLights) l.visible = true;
    // ...and every visibility flag back to exactly what it was. Restored in reverse so a child
    // that was hidden by its own flag AND by its parent's comes back hidden by both.
    for (let i = visWas.length - 2; i >= 0; i -= 2) visWas[i].visible = visWas[i + 1];
    /**
     * 🚨 **AND SWEEP THE FLOOR THE WARM-UP JUST DIRTIED. THE PRIMING BURST IS NOT MATERIAL A
     * PLAYER KNOCKED OFF, AND SINCE THE PILE BECAME PERMANENT IT WAS SCENERY IN EVERY ROOM IN
     * THE HOUSE BEFORE THE FIRST SWING.**
     *
     * The lap above needs the pools to be drawing something or their programs are never built
     * (see the priming burst at the top of this block), so the material has to exist while the
     * lap runs — and then it has to go. It did not: 3 pieces x 5 kinds x 6 spaces, spawned
     * 1.2 m above the floor in the CENTRE of each room, fall, land and `rest`, and a resting
     * piece is scenery that never ages out.
     *
     * 📉 **Measured on the shipped `DebrisSystem`, headless** (`harness/_debris3-warmup.mjs`,
     * the real burst, the real spaces, 30 s of integration): **72 of the 90 pieces come to rest,
     * exactly 12 in every one of the six rooms**, and they are still there after a full 63-blow
     * dig somewhere else — including in the five rooms the player never entered.
     * ⚠️ **AND IT IS ONLY HALF A REGRESSION, WHICH IS WORTH SAYING PLAINLY.** Ablated back to
     * round 11's even pool budget and plain ring buffer the same warm-up still leaves **41**
     * pieces (6 per room) — so the artefact predates round 12. What round 12/13 changed is
     * WHICH kinds survive: round 11 recycled every warm-up `slab` away during the first dig,
     * and the shipped build keeps all 18 of them plus 18 plaster. The slab is the piece the
     * whole reference is about, so the visible half of this really is new.
     *
     * ⚠️ **CLEARING CANNOT UN-COMPILE ANYTHING.** A program is cached against the MATERIAL, and
     * `clear()` touches only instance matrices, `count` and `visible` — the same state the pools
     * are in on a quiet house, which is the state the first real blow already recovers from.
     * ⚠️ **DUST DELIBERATELY GETS NOTHING HERE**, for the reason `resetRound` gives at its own
     * `debris.clear?.()`: a puff is a short-lived particle that expires inside `dust.update`, so
     * the warm-up's haze is gone a few seconds into play and there is no pile to inherit.
     *
     * ⚠️ **`?warmsweep=0` REVERTS IT, AND THAT IS NOT A CONVENIENCE — IT IS WHAT MAKES THE GATE
     * MEAN ANYTHING.** This file's own rule is that a check which has only ever run against
     * working code is not evidence, and the defect here is invisible to every existing
     * instrument: nothing is missing, nothing throws, the piece counts are all correct, and the
     * only symptom is scenery in a room nobody has been in. So the revert arm ships alongside
     * the fix and `harness/scenarios/_debris4-warmfloor.mjs` FAILS ITSELF if turning the sweep
     * off does not put the rubble back. Same shape as `?loose=0`.
     */
    if (new URLSearchParams(location.search).get('warmsweep') !== '0') debris.clear();
    engine.camera.fov = fovWas;
    engine.camera.updateProjectionMatrix();
    rig.snapTo(home);
    engine.camera.position.copy(camWas);
    engine.camera.quaternion.copy(quatWas);
    engine.camera.updateMatrixWorld(true);
    /**
     * ⚠️ THE WARM-UP HAS TO BE ABLE TO SAY WHAT IT DID, OR THE NEXT PERSON MEASURES A NO-OP AND
     * BLAMES THE DIAGNOSIS. `perf-stall.mjs` gates on programs-built-DURING-PLAY, which cannot
     * distinguish "the warm-up did not help" from "the warm-up did not run" — and the first
     * version of this block found ZERO nail-gun lights and reported a perfect four-variant lap
     * that was really two variants twice.
     */
    engine.warmupStats = {
      programs: { before: progBefore, after: engine.renderer.info.programs?.length ?? 0 },
      gunLights: gunLights.length,
      pointLights: (() => { let n = 0; engine.scene.traverse((o) => { if (o.isPointLight) n++; }); return n; })(),
      variants: 4, spaces: room.spaces.length, looks: _lapMode === 'compile' ? 1 : 4,
      // ⚠️ AND RECORD WHICH LAP RAN, for exactly the reason the rest of this object exists: the
      // two laps reach DIFFERENT program sets (462 vs 631) by different routes, so a later
      // measurement that cannot tell them apart cannot attribute its own number. `render` is the
      // default drawn lap; `?warmlap=compile` is the frustum-free one.
      lap: _lapMode,
      // ⚠️ RECORD THE LAP RESOLUTION FOR THE SAME REASON THE BLOCK ABOVE RECORDS EVERYTHING ELSE:
      // if a later round measures a boot time it must be able to tell "the lap ran small" from
      // "the lap did not run". `null` means full resolution (`?warmres=full`, or a window already
      // narrower than the target).
      warmRes,
      renders: 4 * room.spaces.length * (_lapMode === 'compile' ? 1 : 4),
      /**
       * The number this whole investigation is about. Report it so a boot-time claim can be
       * checked instead of believed — and so John's browser and the harness can be compared on
       * the same figure rather than on a stopwatch.
       *
       * 🚨 **AND THE SINGLE MOST USEFUL THING TO KNOW ABOUT IT: THIS NUMBER IS A COLD-CACHE
       * NUMBER, AND ALMOST NOBODY EVER PAYS IT TWICE.** Every harness tool launches a fresh
       * Chromium profile, so the GPU driver's on-disk program cache is empty on every single run
       * and the harness has only ever measured a first load. Measured by loading the SAME
       * persistent profile three times (`boot-1`, 2026-08-08, ANGLE / NVIDIA RTX 3060 Ti D3D11,
       * `quality=high`, 1280x720):
       *
       * | load | to `ready` | this lap | programs built |
       * |---|---|---|---|
       * | 1 (cold profile) | **82.4 s** | 50.4 s | 462 |
       * | 2 | **15.3 s** | 12.7 s | 462 |
       * | 3 | **14.8 s** | 12.3 s | 462 |
       *
       * **82% faster on the second load, with the program count identical to the digit** — so the
       * cache is doing the work, not a shorter lap. Two consequences worth carrying: the ~2.6 s
       * that is left once compilation is cached means **essentially the whole cold load is shader
       * compilation and nothing else**; and the fix John can use today is not in this file — keep
       * one Chrome profile and do not hard-reload. What DOES make him pay cold again is any change
       * to shader source, which during an active campaign is most days.
       */
      warmMs: Math.round(performance.now() - warmT0),
    };
  }
  // Put the outside back where `setPlan` left it: chained sites dressed, the live site's tell
  // and yard hidden until something actually exposes them.
  exterior.warmup(false);
  exterior.setPlan({ liveId: run.exitId, lock: run.lock.id });
  {
    const d = new THREE.Vector3();
    engine.camera.getWorldDirection(d);
    room.setViewpoint(engine.camera.position, d, 1);
  }
  engine.markReady();

  // ---------------------------------------------------------------- PLAY overlay
  // Live only. `engine.capture` must skip this entirely: an overlay in capture mode would
  // appear in every screenshot, in every audit, and in every critic verdict on this piece.
  //
  // It exists for two reasons. Pointer lock can only be requested from a real user gesture, so
  // something has to be clicked before mouse-look works at all — and until this was added the
  // view gave no sign it was interactive rather than another static render, which is exactly
  // how a slice that crashed on every live frame went thirty rounds without anyone noticing.
  //
  // `engine.start()` happens on the gate's click, not here: the hunter's AI clock must not
  // tick while the player is still reading the control legend — a 5 s pause on the gate was
  // measured to put the hunter in STALK before the player's first input. Capture mode has no
  // gate, so it starts immediately.
  if (!engine.capture) {
    armPlayOverlay(gate ?? buildPlayOverlay(), engine);
    buildDeathWatch(engine, player, liveRestart);
    // The site NAMES, not the network ids: "THE VESTRY DOOR" is what the player just walked
    // through, `x.chapel.vestry` is what the wire calls it.
    buildEscapeWatch(engine, run, hud, new Map(SITES.map((s) => [s.id, s.name])), liveRestart);
  } else {
    engine.start();
  }

  return engine;
}

/**
 * THE FIXED LIGHT RIG. Five lights, forever. `follow(space, dt)` lerps every one of them
 * toward that space's table entry over `LERP` seconds; nothing is ever added, removed or
 * driven to zero. `snapTo` is the same move with no easing, for the first frame and for
 * `resetRound`, where a 0.35 s slide would be visible as the room re-lighting itself.
 *
 * Intensity is lerped too, because a room's brightness is part of what tells you which room
 * you are in — but the CONSTRUCTOR values above are only a starting point: before this rig
 * existed the update loop overwrote `key.intensity` with `150 + sin(...)` every frame, which
 * made the 78 it was constructed with dead code that read like a decision. The breathing is
 * now a MULTIPLIER on the table's value, so the table is the single source of truth.
 */
/**
 * ⚠️ EXPORTED FOR `views/expedition.js`, WHICH LIGHTS THE SAME HOUSE. Not a general-purpose API —
 * it takes this file's five-light rig and the per-space table in `spaces.js`. A second rig built
 * beside it would make the party mode's mansion a visibly different building from the survival
 * mode's, which is the one thing an edit must never do.
 */
export function makeLightRig(L, o = {}) {
  const LERP = 0.35;
  /**
   * 🆕 **`?aim=box` — THE ABLATION FOR THE 2026-08-09 RE-AIM, AND IT IS PERMANENT ON PURPOSE.**
   *
   * HANDOFF's rule, paid for by `room.ballroom`'s 2.24 ms sitting unattributed for a round: a
   * change that ships without a toggle cannot be measured later. `estate-light-1` re-pointed the
   * gallery's and both studies' entries at architecture that did not exist when they were
   * written; `spaces.js` keeps the previous entry verbatim as `lightsBox`, and this flag selects
   * it. That is what lets both arms run in ONE browser session — which is the only comparison
   * this project accepts, since recorded per-station history has failed to reproduce three
   * rounds running.
   *
   * ⚠️ It selects a TABLE, never a light. The count, the objects and the parenting are
   * identical on both arms, so no arm of this flag can recompile a program.
   */
  const box = !!o.box;
  /**
   * 🆕 **`?ceil=<scale>` — THE ABLATION FOR THE 2026-08-09 CEILING PASS, AND IT IS A NUMBER
   * RATHER THAN A BOOLEAN ON PURPOSE** (`ceiling-1`).
   *
   * `critic-slice-1` measured the ceiling band as the darkest and flattest band at all five
   * aimed stations. The answer is two terms — the per-space hemisphere GROUND colour below, and
   * merged ceiling glow decals in `gallery-rig.js` / `study-rig.js` — and `ceil` scales BOTH,
   * so `?ceil=0` is the pre-`ceiling-1` build exactly (no `up` lerp, and the rigs emit their old
   * geometry rather than a zero-strength copy of the new geometry) and `?ceil=1.5` re-prices the
   * choice upward without an edit. That is what lets the before and the after run in ONE browser
   * session, which is the only comparison this project accepts.
   *
   * ⚠️ **`?aim=box` IMPLIES `ceil=0` UNLESS `ceil` IS GIVEN EXPLICITLY.** `aim=box`'s own header
   * says it exists so the flag is *"a WHOLE ablation rather than half of one"*; an arm that
   * reverted the re-aim and kept the ceiling pass would be neither build, and every number taken
   * on it would be attributable to neither. Same reasoning, one round later.
   *
   * ⚠️ It scales UNIFORMS AND VERTEX DATA, never a light. The count, the objects and the
   * parenting are identical at every value, so no value of this flag can recompile a program.
   * `gallery-rig.js` exports the identical parse — one function, imported by `study-rig.js` —
   * and this copy exists because `makeLightRig` must not drag a lighting module into `game.js`'s
   * static import graph for two lines of query parsing.
   */
  const CEIL = (() => {
    const q = new URLSearchParams(location.search).get('ceil');
    if (q == null) return box ? 0 : 1;
    const v = Number(q);
    return Number.isFinite(v) && v > 0 ? v : 0;
  })();
  /** The points' as-constructed falloff — the value an absent `decay` entry restores. */
  const DECAY0 = { warmA: L.warmA.decay, warmB: L.warmB.decay, cool: L.cool.decay };
  /**
   * 🆕 The hemisphere's as-constructed GROUND colour — the value an absent `up` entry restores,
   * for exactly `decay`'s reason one paragraph down: three of six spaces write `up`, so a space
   * that does not mention it has to be RESTORED rather than skipped, or `service`, `ballroom`
   * and `chapel` would run on whichever study the player last walked out of.
   */
  const GROUND0 = L.fill ? L.fill.groundColor.clone() : null;
  const _tmpCol = new THREE.Color();
  const want = {
    key: { pos: new THREE.Vector3(), at: new THREE.Vector3(), i: L.key.intensity },
    warmA: { pos: new THREE.Vector3(), i: L.warmA.intensity },
    warmB: { pos: new THREE.Vector3(), i: L.warmB.intensity },
    cool: { pos: new THREE.Vector3(), i: L.cool.intensity },
    up: GROUND0 ? GROUND0.clone() : null,
  };
  const read = (space) => {
    const s = (box ? space?.lightsBox : null) ?? space?.lights;
    if (!s) return;
    /**
     * 🆕 **THE CEILING TERM.** `up` is not a light and not a position: it is the shared
     * `fill` HemisphereLight's ground colour, i.e. the term a DOWN-facing normal receives.
     * `mix(ground, sky, 0.5 * dot(n, up) + 0.5)` gives a ceiling the ground and nothing else,
     * a wall the average of the two, and a floor pure sky — so moving this lifts the ceiling
     * by the full ratio, the walls by half of it, and **the floors not at all**. The floors are
     * the brightest thing in every one of these frames, which is the only reason a term this
     * blunt is usable without blowing the 30–60 median gate `estate-light-1` just earned.
     * ⚠️ It is lerped rather than snapped (the colours above are snapped) because it is a
     * large-area term and a hard step across a doorway would read as a fault, not as a room.
     */
    if (want.up) {
      want.up.copy(GROUND0);
      if (CEIL > 0 && s.up != null) want.up.lerp(_tmpCol.setHex(s.up), CEIL);
    }
    if (s.key) {
      want.key.pos.set(...s.key.pos); want.key.at.set(...s.key.at); want.key.i = s.key.intensity;
      if (s.key.color != null) L.key.color.setHex(s.key.color);
      // SHAPE, not just position. One spot cone cannot serve a 3.4 m passage and a 27 m
      // gallery at the same time — a 50-degree cone that fills the corridor lights two metres
      // of the gallery and leaves the vista black, which is exactly what the M2 capture shows.
      // These are snapped rather than lerped: `angle` and `distance` are not interpolated
      // anywhere in three.js's shadow frustum update, and a lerped cone re-fits the shadow
      // camera every frame for 0.35 s. Light COUNT is untouched, which is the rule that matters.
      if (s.key.angle != null) L.key.angle = s.key.angle;
      if (s.key.penumbra != null) L.key.penumbra = s.key.penumbra;
      if (s.key.dist != null) { L.key.distance = s.key.dist; L.key.shadow.camera.far = s.key.dist + 2; }
      if (s.key.decay != null) L.key.decay = s.key.decay;
    }
    /**
     * 🆕 **`decay` IS NOW READABLE ON THE POINTS, AND IT IS THE KNOB THESE ROOMS ACTUALLY
     * NEEDED** (`estate-light-1`). `key` has taken a per-space `decay` since M2; the three
     * points were built with **2** and had no way to say otherwise, so each one lit its own
     * 3–4 m and nothing beyond it. In a 3.4 m service passage that is right. In a 15.4 x 11.6 m
     * study it means the two fill lights cannot reach the middle of their own room, which is why
     * the old rig had to carry the studies on a 0.86 rad key cone — a wash that blew one end
     * (median L 85.6) while the other end sat at 12.8 with a quarter of its pixels crushed.
     * At decay 1.45 the same light delivers ~4x as much at 10 m for the same intensity.
     * 🚨 **AND IT FALLS BACK TO THE CONSTRUCTOR VALUE, NOT TO "WHATEVER THE LAST ROOM SET".**
     * Every other field in this table is written by all six spaces, so a stale value cannot
     * survive a transition; `decay` is written by three, so an absent entry has to RESTORE
     * rather than skip. Skipping it would leave `service`, `ballroom` and `chapel` running at
     * whichever study the player last walked out of — a lighting change in three rooms this
     * round does not touch, arriving through a field they never mention. Decay is a per-light
     * uniform and not part of three's program cache key, so none of this recompiles anything.
     */
    const w = s.warm ?? [];
    for (const [k, d] of [['warmA', w[0]], ['warmB', w[1]]]) {
      if (!d) continue;
      want[k].pos.set(...d.pos); want[k].i = d.intensity;
      if (d.color != null) L[k].color.setHex(d.color);
      if (d.dist != null) L[k].distance = d.dist;
      L[k].decay = d.decay ?? DECAY0[k];
    }
    if (s.cool) {
      want.cool.pos.set(...s.cool.pos); want.cool.i = s.cool.intensity;
      if (s.cool.color != null) L.cool.color.setHex(s.cool.color);
      if (s.cool.dist != null) L.cool.distance = s.cool.dist;
      L.cool.decay = s.cool.decay ?? DECAY0.cool;
    }
  };
  const apply = (a) => {
    L.key.position.lerp(want.key.pos, a);
    L.key.target.position.lerp(want.key.at, a);
    for (const k of ['warmA', 'warmB', 'cool']) L[k].position.lerp(want[k].pos, a);
    if (want.up) L.fill.groundColor.lerp(want.up, a);
  };
  return {
    base: want,
    snapTo(space) { read(space); apply(1); },
    follow(space, dt) { read(space); apply(1 - Math.exp(-dt / (LERP / 3))); },
  };
}

const KEYCAP = (k) => `<b style="display:inline-block;min-width:20px;padding:2px 6px;margin:0 2px;
  border:1px solid #2b3a4b;border-radius:4px;background:#111823;color:#dce8f4;
  font-weight:600;text-align:center">${k}</b>`;

/** Full-screen modal used by both the start gate and the death screen. */
function makeOverlay(id, inner, accent = '#7dd3fc') {
  const wrap = document.createElement('div');
  wrap.id = id;
  wrap.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:60', 'display:grid', 'place-items:center',
    `background:radial-gradient(ellipse at center, ${accent}0f 0%, rgba(4,6,10,.9) 70%)`,
    'backdrop-filter:blur(2px)',
    'font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace', 'color:#cfe2f5',
    'cursor:pointer', 'user-select:none',
  ].join(';');
  wrap.innerHTML = inner;
  document.body.appendChild(wrap);
  return wrap;
}

const BTN = (id, label, accent = '#7dd3fc') => `<button id="${id}" style="
  font:700 15px/1 ui-monospace,monospace;letter-spacing:.22em;text-transform:uppercase;
  color:#08121c;background:${accent};border:0;border-radius:999px;
  padding:16px 44px;cursor:pointer;box-shadow:0 6px 30px ${accent}47">${label}</button>`;

/** Put the gate on screen immediately, in a loading state. No engine yet — that is the point. */
function buildPlayOverlay() {
  // ⚠️ THE BOOT SPLASH AND THIS CARD ARE THE SAME SCREEN, AND BOTH WERE DRAWN FOR ~300 ms.
  //
  // `index.html`'s `#boot` is `z-index:100` with `transition: opacity .35s`, and `main.js`
  // only adds `.gone` when the view's promise RESOLVES — which is ~30 s after this function
  // has already put an identical loading card on screen at `z-index:60`. So the handover was
  // a third of a second of the splash's "RUN ROBOT RUN / booting… / sweep bar" dissolving
  // through this card's "Run Robot Run — playable slice / Building the estate… / sweep bar",
  // two centred texts and two progress bars printed over each other. Measured before the fix:
  // **8 frames, 283 ms, peak #boot opacity 0.969 over a fully visible gate** — and the
  // composite shows "RUN ROBOT RUN" struck through "Lose them and you lose both". It is the
  // first thing anyone sees, and `play-critic-4` caught it on its very first screenshot.
  //
  // The fix is not a shorter crossfade. Two cards that say the same thing should never both be
  // on screen at all: this one is a strict superset — it carries the world lines and the
  // control card as well as the loading state — so the splash's job ends the moment this
  // exists. Killed WITHOUT the transition, in the same synchronous task that appends the gate,
  // so the browser's next paint has exactly one of them.
  const boot = document.getElementById('boot');
  if (boot) { boot.style.transition = 'none'; boot.style.display = 'none'; }

  return makeOverlay('rrr-play-gate', `
    <div style="text-align:center;max-width:460px">
      <div style="font-size:10px;letter-spacing:.28em;color:#5d7186;
           text-transform:uppercase;margin-bottom:14px">Run Robot Run — playable slice</div>
      <div id="rrr-gate-slot">
        <div id="rrr-gate-msg" style="font:700 13px/1 ui-monospace,monospace;letter-spacing:.2em;
             text-transform:uppercase;color:#5d7186;padding:18px 0">Building the estate…</div>
        <div style="width:190px;height:3px;margin:0 auto;border-radius:2px;background:#141c26;
             overflow:hidden"><div id="rrr-gate-bar" style="width:38%;height:100%;
             background:linear-gradient(90deg,#1b3145,#7dd3fc,#1b3145);
             animation:rrrsweep 1.15s ease-in-out infinite"></div></div>
        <style>@keyframes rrrsweep{0%{transform:translateX(-160%)}100%{transform:translateX(420%)}}
          @media (prefers-reduced-motion:reduce){#rrr-gate-bar{animation:none;width:100%}}</style>
        <!-- Carried over from the boot splash, which this card now replaces outright rather
             than crossfading with. It is the only line that sets the right expectation for a
             cold load, and losing it would turn a known 30 s wait back into a hung-looking app.
             (No backticks in here: this whole card is a JS template literal and one would end
             the string. That trap has broken this bundle three times — see rrr-pipeline.) -->
        <div style="margin-top:12px;color:#4c5f73;font-size:11px;letter-spacing:.04em">
          first load builds the scene — 25–30 s. after that, restarts are instant</div>
      </div>
      <!-- TWO LINES OF WORLD, ABOVE THE CONTROLS AND SEPARATE FROM THEM.
           The card taught the keyboard and nothing else, so a first death — reachable inside
           30 s — read as the game breaking rather than as the game working. These are the two
           rules that make it read as a horror beat instead: that the parts you are holding are
           both your health bar and your weapon, and that everything it takes off you it puts
           on itself. Not a tutorial: no objectives, no map, no controls repeated, and nothing
           about the chapel or the service passage — finding those is the game. -->
      <div style="margin-top:20px;color:#b6c7da;font-size:12.5px;line-height:1.75;
           border-top:1px solid #1b2735;border-bottom:1px solid #1b2735;padding:14px 0">
        Your limbs are your health <span style="color:#5d7186">and</span> your weapons.
        Lose them and you lose both.<br>
        <span style="color:#e08a72">It grows from what it takes.</span>
      </div>
      <div style="margin-top:18px;color:#8fa4bb;font-size:12px;line-height:2">
        ${KEYCAP('W')}${KEYCAP('A')}${KEYCAP('S')}${KEYCAP('D')} move &nbsp;·&nbsp; ${KEYCAP('Shift')} run<br>
        mouse look &nbsp;·&nbsp; ${KEYCAP('LMB')} attack &nbsp;·&nbsp; ${KEYCAP('E')} interact
        &nbsp;·&nbsp; ${KEYCAP('Q')} drop<br>
        <span style="color:#5d7186">${KEYCAP('Esc')} releases the mouse &nbsp;·&nbsp; ${KEYCAP('R')} restarts</span><br>
        <span style="color:#4c5f72;font-size:11px">testing &nbsp;
        ${KEYCAP('B')} cyan walls off/on &nbsp;·&nbsp; ${KEYCAP('G')} black point
        &nbsp;·&nbsp; ${KEYCAP('C')} wall coat
        &nbsp;·&nbsp; ${KEYCAP('[')}${KEYCAP(']')} dig power</span>
      </div>
    </div>`);
}

/** Swap the loading state for a real PLAY button once the scene is actually up. */
function armPlayOverlay(wrap, engine) {
  const slot = wrap.querySelector('#rrr-gate-slot');
  if (slot) slot.innerHTML = BTN('rrr-play-btn', '▶ Play');
  wrap.addEventListener('click', () => {
    wrap.remove();
    engine.start();
    // 🔊 the click is the user gesture the autoplay policy requires. This branch already
    // never runs in capture (`if (!engine.capture) armPlayOverlay(...)` below), which is
    // what keeps the whole audio module inert for every screenshot and perf run.
    initAudio(engine);
    // ⚠️ MUST swallow the rejection. `requestPointerLock()` returns a promise, and `main.js:26`
    // turns any unhandled rejection into the full-screen "VIEW ... FAILED" error — so a browser
    // that merely REFUSES the lock (an embedded frame; iPadOS Safari, which has no Pointer Lock
    // at all) took a black screen with a stack trace instead of a playable game. `Input` falls
    // back to drag-to-look in that case; see the long note in `player.js`.
    try {
      const r = engine.canvas?.requestPointerLock?.();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch { /* no pointer lock here — drag-to-look covers it */ }
    engine.canvas?.focus?.();
  });
  wrap.querySelector('#rrr-play-btn')?.focus?.();
}

/**
 * Death screen and restart.
 *
 * `gaitFor()` in `rules.js` returns 'down' once both legs are gone, and until now NOTHING acted
 * on it — `player.update` zeroed the velocity and that was the end of the session. You were
 * alive, immobile and stuck, with no way back but editing the URL.
 *
 * RESTART IS A FULL RELOAD, deliberately. A hand-rolled reset would have to unwind the player,
 * the limb field, wall damage across 18 panels, hunter growth, debris, dust and the director —
 * and this project's history is a catalogue of partial fixes that looked complete. A reload is
 * provably total. It costs the texture bake again, which is the honest price of being certain.
 */
function buildDeathWatch(engine, player, onRestart) {
  let shown = false;
  let overlay = null;
  // `onRestart` is `liveRestart` from the view — an in-place `resetRound()`. Falls back to the
  // old reload if a caller does not pass one, so this function is still correct on its own.
  const restart = () => {
    if (!onRestart) { location.reload(); return; }
    overlay?.remove();
    overlay = null;
    shown = false;          // ⚠️ or the next death is silent and you are stuck with no modal
    onRestart();
  };

  const show = () => {
    if (shown) return;
    shown = true;
    document.exitPointerLock?.();
    const w = makeOverlay('rrr-death', `
      <div style="text-align:center;max-width:460px">
        <div style="font-size:10px;letter-spacing:.28em;color:#f2756b;
             text-transform:uppercase;margin-bottom:14px">Taken by the hunter</div>
        <div style="color:#8fa4bb;font-size:12px;margin-bottom:20px">
          Every limb is gone. You cannot move.</div>
        ${BTN('rrr-retry-btn', '⟲ Retry', '#f2756b')}
        <div style="margin-top:20px;color:#5d7186;font-size:12px">
          or press ${KEYCAP('R')}</div>
      </div>`, '#f2756b');
    overlay = w;
    w.addEventListener('click', restart);
    w.querySelector('#rrr-retry-btn')?.focus?.();
  };

  // R restarts at any time, not only on death — useful for re-running a scenario without
  // hunting for the reload button while pointer-locked.
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyR' && !e.repeat && !e.ctrlKey && !e.metaKey) { e.preventDefault(); restart(); }
  });

  engine.onUpdate(() => { if (player.caps?.gait === 'down') show(); });
}

/**
 * YOU GOT OUT — the win screen, and the first one this project has ever had.
 *
 * `buildDeathWatch` above is the piece this has to match in weight. `escape.md` §10.3 says so
 * outright ("escaping needs at least the same weight"), and it matters more than it sounds:
 * for the whole history of this build the only full-screen thing that could ever happen to you
 * was losing, so a win that fades a caption in the corner would read as the game not having
 * noticed. Same modal, same restart, opposite colour.
 *
 * RESTART IS A FULL RELOAD, for the reason `buildDeathWatch` already argued and which still
 * applies verbatim: a hand-rolled reset would have to unwind the player, the limb field, wall
 * damage across twelve panels, hunter growth, debris, dust, the director AND now the run plan,
 * and this project's history is a catalogue of partial fixes that looked complete. A reload is
 * provably total. Here it buys one thing more — a NEW seed, so the next run is a different
 * house, which is exactly what §6 is for.
 *
 * ⚠️ IT LISTENS TO `onEscape`, NOT TO THE PHASE. Phase RESULTS is also where a run that ended
 * with everybody DOWN arrives, and `buildDeathWatch` already owns that screen; two overlays on
 * one frame is the boot-splash bug again. The trigger is "this player, specifically, is out".
 *
 * ---------------------------------------------------------------------------
 * ⚠️ AND THE MODAL DOES NOT GO UP UNTIL THE RUN IS ACTUALLY OVER. THIS WAS THE WORST BUG ON
 * THE PIECE AND IT WAS PHOTOGRAPHED, NOT ARGUED.
 *
 * `play-critic-7`, with a second player registered: escaping enters WINDDOWN, and this function
 * put "OUT OF THE HOUSE / AGAIN" on screen anyway, killed pointer lock and hid the HUD. The
 * critic then **walked 17 m into the yard with the bomb at 85.9 s and had its right arm torn
 * off at 2.6 m, entirely behind a victory modal.** The hunter following you out is John's
 * explicit decision (`escape.md` §5, §8), so **being outside is not being safe** — and a screen
 * that says otherwise while taking the mouse away is the game lying to the player at the exact
 * moment it has handed the hunter its best advantage.
 *
 * So there are two moments, and they used to be one:
 *
 *   YOU ARE OUT      the run continues. No modal, no `exitPointerLock`, the HUD stays up, and
 *                    the two lines that matter go through `hud.say` where they cannot cover
 *                    the thing about to kill you.
 *   THE RUN IS OVER  phase RESULTS. Now the modal, with the time and the board.
 *
 * ⚠️ THE STRANDED COUNT IS CAPTURED AT THE ESCAPE, NOT READ AT THE MODAL. By the time RESULTS
 * arrives, `stillInside()` is 0 by definition — that is usually WHY it arrived — so reading it
 * late would print "0 still inside" or nothing at all, and `escape.md` §5's best line would be
 * lost a second time in a second way.
 */
function buildEscapeWatch(engine, run, hud, siteNames, onRestart) {
  const ACCENT = '#78dba9';
  let shown = false;
  let overlay = null;
  /** What was true the moment this player crossed the plane. See the header. */
  let out = null;
  // ⚠️ `out` MUST BE CLEARED TOO, and it is the easy one to miss. `onEscape` opens with
  // `if (out || rec.id !== 'p1') return`, so a retry that reset `shown` but left `out` set
  // would swallow the next escape entirely — you would win the run and no screen would say so.
  // That is precisely the "partial fix that looks complete" this file's own comments warn about.
  const restart = () => {
    if (!onRestart) { location.reload(); return; }
    overlay?.remove();
    overlay = null;
    shown = false;
    out = null;
    onRestart();
  };

  run.onEscape((rec) => {
    if (out || rec.id !== 'p1') return;
    // ⚠️ READ AFTER THE PHASE HAS MOVED. `RunState.escape()` now runs `_setPhase` BEFORE it
    // emits (see its own comment) precisely so this is the post-escape state — the state the
    // escape produced rather than the one it replaced.
    out = { rec, stranded: run.stillInside(), phase: run.phase };

    if (run.phase !== PHASE.RESULTS) {
      // STILL RUNNING. The bomb is ticking, somebody is inside, and the hunter can follow you
      // through the hole you just made. Say what happened and get out of the way.
      hud?.say?.('OUT OF THE HOUSE', ACCENT, 2.0, hud.RANK.deny);
      if (out.stranded > 0) {
        hud?.say?.(`${out.stranded} STILL INSIDE — YOU STARTED THE CLOCK`, '#e0a072', 3.4, hud.RANK.alarm);
      }
      return;
    }
    show();
  });

  // The run ended while this player was outside: the bomb went off, the house emptied, or a
  // host aborted. NOW the screen may claim the win.
  run.onPhase((phase) => { if (phase === PHASE.RESULTS && out) show(); });

  function show() {
    if (shown || !out) return;
    // ⚠️ AND NOT OVER THE DEATH SCREEN. The hunter follows you out (`escape.md` §5), so a player
    // can escape, be torn apart in the yard, and only THEN reach RESULTS when the bomb goes —
    // at which point `buildDeathWatch` already owns the frame. Two full-screen modals on one
    // frame is the boot-splash bug for the third time. The death screen wins: it is the more
    // urgent fact and it is the one that has already been judged.
    if (document.getElementById('rrr-death')) return;
    shown = true;
    const rec = out.rec;
    document.exitPointerLock?.();
    // A MODAL OWNS THE FRAME. See `hud.setHidden` — without this the room caption prints
    // through the run time, both centred at 34%, and it was visible in the very first
    // screenshot of this screen. ⚠️ `buildDeathWatch` above has the identical exposure and is
    // NOT changed here: its screen has already been judged and a silent restyle of a
    // critic-approved frame is worse than the bug. Reported instead.
    hud?.setHidden?.(true);

    const r = run.results();
    const site = siteNames?.get(run.exitId) ?? run.exitId ?? 'unknown';
    const mins = Math.floor(rec.at / 60);
    const clock = `${mins}:${(rec.at - mins * 60).toFixed(1).padStart(4, '0')}`;
    // The board. One row today because there is one player; the shape is the multiplayer one
    // because §9's ranking is the whole point of scoring by time and adding a column later is
    // not the same as adding a concept later.
    const board = r.escaped.map((e) => {
      const m = Math.floor(e.seconds / 60);
      return `<tr><td style="padding:3px 14px 3px 0;color:#5d7186">${e.rank}</td>
        <td style="padding:3px 14px 3px 0;color:#cfe2f5">${e.id}</td>
        <td style="padding:3px 0;color:${ACCENT};font-variant-numeric:tabular-nums">
        ${m}:${(e.seconds - m * 60).toFixed(1).padStart(4, '0')}</td></tr>`;
    }).join('');

    // ⚠️ ONLY SHOWN WHEN SOMEONE WAS ACTUALLY STILL INSIDE **AT THE MOMENT YOU LEFT**, and
    // that tense is the whole fix. `escape.md` §5's best line — that getting out first is
    // simultaneously the best score and the most hostile act in the game — is only true when
    // there was somebody left to strand, and by the time this modal is built the run is over
    // and `stillInside()` is 0 by construction. It used to read `run.phase === WINDDOWN` at a
    // moment when the phase was still EXPLORE, so it could never print at all; reading
    // `stillInside()` here instead would fail the same way from the other end.
    const stranded = out.stranded > 0
      ? `<div style="margin-top:16px;color:#e0a072;font-size:12px;line-height:1.7">
           ${out.stranded} still inside.<br>
           <span style="color:#8a6f5d">You started the clock.</span></div>`
      : '';

    const w = makeOverlay('rrr-escape', `
      <div style="text-align:center;max-width:480px">
        <div style="font-size:10px;letter-spacing:.28em;color:${ACCENT};
             text-transform:uppercase;margin-bottom:14px">Out of the house</div>
        <div id="rrr-escape-time" style="font:700 44px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
             letter-spacing:.06em;color:#eaf6ff;font-variant-numeric:tabular-nums">${clock}</div>
        <div style="margin-top:10px;color:#8fa4bb;font-size:12px">
          through <span style="color:#cfe2f5">${site}</span></div>
        <table style="margin:22px auto 0;font:500 12px/1.4 ui-monospace,monospace;
               border-top:1px solid #1b2735;border-bottom:1px solid #1b2735;
               padding:10px 0;border-collapse:collapse">${board}</table>
        ${stranded}
        <div style="margin-top:22px">${BTN('rrr-again-btn', '⟲ Again', ACCENT)}</div>
        <div style="margin-top:18px;color:#5d7186;font-size:12px">
          a new run puts the way out somewhere else &nbsp;·&nbsp; or press ${KEYCAP('R')}</div>
      </div>`, ACCENT);
    overlay = w;
    w.addEventListener('click', restart);
    w.querySelector('#rrr-again-btn')?.focus?.();
  }
}

// ---------------------------------------------------------------------------
// Live input
// ---------------------------------------------------------------------------
let _inputFaults = 0;
/**
 * Input handling, guarded. An exception in here used to take the whole view down — the engine
 * swaps in the red FAILED page — while the simulation carried on running behind it. That is
 * the single defect class that has cost this project the most: `game.play` threw on every live
 * frame for thirty rounds and screenshot tooling could not see it, because capture mode takes
 * a different loop. A player pressing one advertised key should never be able to end the
 * session, and a fault here should be loud in the console and survivable on screen.
 */
function liveInput(input, cam, player, weapons, limbField, hud, t) {
  try {
    return _liveInput(input, cam, player, weapons, limbField, hud, t);
  } catch (e) {
    if (_inputFaults++ === 0) console.error('[input] handler threw — game continues:', e);
    return { move: { x: 0, y: 0 }, run: false };
  }
}

let _qHeld = 0, _qFired = false, _qWas = false;
let _lastSlam = -99;   // skate body-slam cooldown, see the update loop
let _eHeld = 0, _eWas = false, _target = null;

/**
 * 🚨 ONE REACH, USED BY BOTH THE PROMPT AND THE ACTION — they disagreed by 0.05 m.
 *
 * The HUD and the target cursor were driven off `nearest(pos, 1.3)` while the press called
 * `interact(field, 1.25, …)`. **An item in that 5 cm band was advertised as `[E] FIT ARM` and
 * then silently refused** — which is exactly the defect `promptFor`'s own comment describes and
 * claims to have fixed, one axis over. That round asked the rig *what it would do*; nobody
 * checked it was asking about *the same item*.
 *
 * It is John's original bug report almost word for word — *"an arm 0.1 m away, only a leg
 * socket open, HUD reading [E] FIT ARM, and pressing E correctly refused"* — and a control that
 * advertises then declines reads as broken, not as strict.
 *
 * Found 2026-08-10 by `inputfix-1` while proving a different suspicion wrong, and reported as
 * out of its lane rather than fixed silently. **Advertise only what you will actually do**, so
 * the constant is the ACTION's 1.25, not the prompt's more generous 1.3.
 *
 * ⚠️ MODULE SCOPE, AND PUBLISHED AS `engine.eReach`, FOR ONE REASON: the only way to prove the
 * two agree is to probe the boundary, and an instrument that hardcodes its own 1.25 is a THIRD
 * copy of the rule — the same mistake that produced the bug. `mechanics.mjs`'s
 * `reach-agreement` check stages an item a few centimetres either side of THIS number and
 * asserts the prompt and the press reach the same verdict. Change it here and the probe follows.
 */
const E_REACH = 1.25;

/**
 * ♻️ **THE INPUT HANDLER'S OWN STATE IS ROUND STATE, AND IT LIVES OUT HERE WHERE `resetRound()`
 * CANNOT SEE IT.** The seven variables above are module-level because `_liveInput` is a plain
 * function called once a frame, not an object — which is fine until a round ends, at which
 * point every one of them is stale in a way that outlives the round that made it:
 *
 *   · `_target` is a SOCKET CURSOR pointing at the last socket the player was aiming a fitting
 *     at. `resetRound()` refits every socket from `LOADOUT`, so the new round opens with the
 *     cursor parked on a socket that is now full, and the HUD draws it there.
 *   · `_eHeld` / `_qHeld` are HOLD TIMERS mid-count if the round ended with E or Q down — which
 *     is the norm for a death, because the player was scrabbling. A carried-over `_eHeld` makes
 *     the first tap of the new round read as the tail of a hold that started in the last one.
 *   · `_eWas` / `_qWas` / `_qFired` are the edge latches those timers are debounced against, and
 *     a latch that says "already fired" eats the new round's first real press.
 *   · `_lastSlam` is a cooldown stamped in `t`, and `t` does NOT restart with the round — so it
 *     is the one that is safe by construction, and it is reset anyway rather than being left as
 *     the reader's exercise in proving that.
 *
 * Exported to the view as a function for exactly the reason the bug existed: a closure cannot
 * reach these, and the alternative — moving them into the view — would make `_liveInput` a
 * method and is a bigger change than the defect justifies.
 */
function resetLiveInput() {
  _qHeld = 0; _qFired = false; _qWas = false;
  _eHeld = 0; _eWas = false; _target = null;
  _lastSlam = -99;
}

/** The sockets an item of this kind could ever go in, in a stable order. */
const targetsFor = (item) => (item && item.socketKind === 'leg'
  ? ['hipR', 'hipL'] : ['shoulderR', 'shoulderL']);

/**
 * Keep the target sane: it must exist, and it must match what is under your feet. Defaults to
 * the first socket that would actually accept the item, so the common case needs no input at
 * all and the cursor only matters when the player wants to override it.
 *
 * 🚨 **THE CURSOR USED TO BE STICKY ACROSS A WOUND, AND THAT IS HALF OF JOHN'S REFIT LOOP.**
 * `if (cur && opts.includes(cur)) return cur;` was unconditional, so `_target` resolved to
 * `shoulderR` on frame one of every round and stayed there whether or not that socket was still
 * empty — and whether or not the other shoulder had just been torn off by falling debris. His
 * report: *"when replacing an arm that fell off from debris I kept replacing the arm with the
 * nail gun and vise versa instead of putting it in the open arm slot."* With the cursor parked on
 * the nail gun's socket, that is precisely the state `Player.interact()`'s swap branch answered.
 *
 * `interact()` now puts an empty socket first regardless of the cursor, so the loop is closed
 * either way — **but without this line the HUD then lies about it**: `hud.setTargetSocket` draws
 * the target ring on the gadget's socket while the limb goes somewhere else. Same confusion,
 * different hat. The rule the two now share is `LimbRig.emptyFits()`, asked once, here.
 *
 * ⚠️ **`free.includes(cur)` IS WHAT KEEPS HOLD-`E` MEANINGFUL AND MUST NOT BE SIMPLIFIED AWAY.**
 * When several sockets of the right kind are open the player's own choice wins outright, which is
 * the entire point of `cycleTarget` — `mechanics`'s `refit` group asserts a limb landing in the
 * socket the cursor names *against* its own side preference, so dropping this clause goes red.
 * `!free.length` keeps the cursor where it is when nothing is open, which is the swap case and
 * the only case where the swap branch is still reachable.
 *
 * ⚠️ **A NULL `item` IS UNCHANGED BEHAVIOUR, BY CONSTRUCTION.** `emptyFits(null)` returns `[]`,
 * so `!free.length` holds and this collapses to the old first line — which matters because
 * `_liveInput` calls this EVERY FRAME with whatever `nearest()` returned, and that is usually
 * nothing at all.
 */
function validTarget(rig, cur, item) {
  const opts = targetsFor(item);
  const free = rig.emptyFits(item);
  if (cur && opts.includes(cur) && (free.includes(cur) || !free.length)) return cur;
  return free[0] ?? opts[0] ?? null;
}

/** Next socket of the same kind — two arms or two legs, so this is a toggle in practice. */
function cycleTarget(rig, cur, item) {
  const opts = targetsFor(item);
  if (!opts.length) return null;
  const i = opts.indexOf(cur);
  return opts[(i + 1) % opts.length];
}

/** Which socket a hold-Q would empty: the fitted gadget first, else a plain limb. */
function ejectableSocket(rig) {
  const arms = ['shoulderR', 'shoulderL'];
  return arms.find((s) => rig.occupant(s) === 'gadget')
    ?? arms.find((s) => rig.occupant(s) === 'limb')
    ?? null;
}

/**
 * What `E` would ACTUALLY do with this item, asked of the rig rather than guessed from
 * `caps.wounds`. Mirrors `Player.interact`'s own order: a matching empty socket wins, then
 * carrying. Anything else must not offer a prompt at all.
 */
function promptFor(rig, item) {
  // THE SLEDGEHAMMER NEVER FITS A SOCKET, so it has to be answered before the socket-fit scan
  // below ever runs — `item.label` (limbs.js) only knows `'limb'`/`'gadget'`, so it cannot be
  // trusted for this item's text either. Same real acquisition every gadget already uses:
  // proximity + E (task-sledge-pickup.md §3.4).
  if (item.type === 'sledge') return '[E] TAKE SLEDGEHAMMER';
  const sockets = ['hipL', 'hipR', 'shoulderL', 'shoulderR'];
  const fits = sockets.some((s) => rig.occupant(s) === 'empty' && SOCKET_KIND_OF(s) === item.socketKind);
  if (fits) return `[E] FIT ${item.label}`;
  if (!rig.held && rig.caps.hands > 0) return `[E] TAKE ${item.label}`;
  return '';
}

/** Socket -> kind, without importing the rig's table into this file. */
const SOCKET_KIND_OF = (s) => (s.startsWith('shoulder') ? 'arm' : 'leg');

/**
 * 🔨 A SLEDGEHAMMER YOU OWN AND ARE NOT HOLDING IS A STANDING PROMPT, NOT A ONE-OFF CALLOUT.
 *
 * Two defects close here and they are the same defect from two ends:
 *
 *  1. `critic-slice-3`'s #7 — the hunter takes an arm mid-dig, the two-handed gate stows the
 *     hammer, and **thirty punches follow** because nothing on screen says the tool left or how
 *     to get it back. `player.onDisarm` above spends the callout for the moment; this spends
 *     the prompt for the aftermath, and the aftermath is where the thirty punches happened.
 *  2. `Player._toggleSledge`'s own header calls it "A KNOWN HUD GAP, STATED RATHER THAN HIDDEN":
 *     drawing an owned hammer is **E with nothing in reach**, and the game had no advertised
 *     control for it anywhere. `mechanics.mjs` exists to catch exactly that class — an
 *     advertised control that does nothing is its worst bug, and an UNadvertised one that does
 *     something is the same fault wearing the other shoe.
 *
 * Each line names a control the player already has and states the rule that is blocking them,
 * so the answer is never "guess". `caps.arms` counts sockets holding a `limb`, so an arm that
 * has been replaced by a nail gun fails the two-handed gate the same way a missing one does —
 * and that case gets its own line, because "fit an arm" is useless advice when both shoulders
 * are full. The empty string is the normal state and costs nothing: the prompt element is only
 * touched when the text actually changes (`hud.setPrompt`).
 */
function sledgePrompt(player) {
  const s = player.sledge;
  if (!s?.owned || s.equipped) return '';
  if (player.caps.arms === 2) return '[E] DRAW SLEDGEHAMMER';
  const busy = player.rig.occupant('shoulderL') === 'gadget' || player.rig.occupant('shoulderR') === 'gadget';
  return busy ? '[Q] HOLD TO EJECT — SLEDGEHAMMER NEEDS BOTH ARMS'
    : 'SLEDGEHAMMER NEEDS BOTH ARMS — [E] FIT ONE';
}

function _liveInput(input, cam, player, weapons, limbField, hud, t) {
  const m = input.takeMouse();
  if (input.mouse.down) {
    const a = player.attack(t);
    // A dead trigger now answers. Pressing the game's primary button after full dismemberment
    // used to do nothing whatsoever — no sound, no HUD, no message — which reads as the game
    // having broken rather than as the body having run out of ways to fight.
    if (a?.denied) hud.denyAttack(a.denied);
    // `shooter` is what the grapple hauls. Passed explicitly rather than inferred from
    // `ignore`, which is a rig and has no idea how to move a body.
    else if (a?.weapon && !a.pending) weapons.fire(a.weapon, a.at, a.dir, t, { ignore: player.rig, shooter: player });
  }
  // `E_REACH` is module scope now — see its note there. Every query in this function and the
  // `interact()` call below take that one number, and so does the probe that guards it.
  // E: tap acts on the TARGETED socket, hold cycles which socket that is (Model C).
  // Same shape as Q below and for the same reason — never `consume()` a key you are timing.
  const near0 = limbField.nearest(player.pos, E_REACH);
  _target = validTarget(player.rig, _target, near0);
  hud.setTargetSocket?.(_target);
  // The cursor selects what FIRES as well as what you fit — see `LimbRig.weapons(prefer)`.
  // Without this a second gadget can be worn but never used.
  player.rig.preferSocket = _target;

  const eDown = input.pressed('KeyE');
  if (eDown) {
    _eHeld += 1 / 60;
    if (_eHeld > 0.25) {
      _eHeld = -1e9;                         // one cycle per hold, not a spin
      _target = cycleTarget(player.rig, _target, near0);
      hud.setTargetSocket?.(_target);
    }
  } else {
    const tapped = input.consume('KeyE');
    if ((_eWas || tapped) && _eHeld > -1e8) player.interact(limbField, E_REACH, _target);
    _eHeld = 0;
  }
  _eWas = eDown;
  // `dropHeld` is on LimbRig, not Player. Calling it on the player threw on every Q press —
  // an ADVERTISED control, printed on the game's own instruction card — and the engine swapped
  // the screen for the red FAILED page with no recovery. Worse, the simulation kept running
  // perfectly behind that page: a play-critic went on collecting flawless state (hunter
  // PATROL->PURSUE->GROW->ATTACK, limbs coming off) while the player saw a crash. Any
  // instrument reading `window.__rrr` would have filed a glowing report.
  // Q: tap drops what you CARRY. Hold ejects what is FITTED — the verb the game did not have.
  //
  // Swapping one gadget for another was impossible: `dropHeld` only ever released a carried
  // item, so a nail gun bolted to your arm could not come off by any input the game offered.
  // `fitGadget()` has always returned a `displaced` item for exactly this and nothing used it.
  // Per `docs/design/attachments.md` (Model C, John's call): a displaced part is EJECTED TO
  // THE FLOOR and recoverable — never consumed.
  // ⚠️ NEVER `consume()` A KEY YOU ARE ALSO TIMING. `consume()` deletes from the HELD set, so
  // calling it here reset `pressed('KeyQ')` to false on the very next frame and the hold timer
  // could never reach its threshold — the eject was unreachable and the first version of this
  // failed its own test. Consume only on RELEASE, where it does double duty: it clears the
  // one-shot latch so a sub-frame tap (see `Input.once`) still registers as a drop.
  const qDown = input.pressed('KeyQ');
  if (qDown) {
    _qHeld += 1 / 60;
    if (_qHeld > 0.25 && !_qFired) {
      _qFired = true;
      const s = ejectableSocket(player.rig);
      if (s) {
        player.rig.detach(s, { voluntary: true });
        hud.say?.(`EJECTED ${s.startsWith('shoulder') ? 'ARM' : 'LEG'}`, '#ffb648', 1.2, hud.RANK.deny);
      }
    }
  } else {
    const tapped = input.consume('KeyQ');
    if ((_qWas || tapped) && !_qFired) {
      player.rig.dropHeld(player.aimDir.clone().multiplyScalar(3).setY(2));
    }
    _qHeld = 0; _qFired = false;
  }
  _qWas = qDown;

  // THE PROMPT MUST NOT PROMISE WHAT THE RIG WILL REFUSE.
  //
  // It read `[E] FIT` whenever `caps.wounds > 0`, without checking that THIS item fits THAT
  // socket. Reproduced: an arm 0.1 m away, only a leg socket open, HUD reading "[E] FIT ARM",
  // and pressing E correctly refused on `socketKind` — the game advertising an action it then
  // declines, which reads as the control being broken. Ask the rig what it would actually do.
  // `E_REACH`, not 1.3 — see its note above. This is the line that does the advertising, so it
  // is the one that must not be more generous than the press.
  const near = limbField.nearest(player.pos, E_REACH);
  hud.setPrompt((near ? promptFor(player.rig, near) : '') || sledgePrompt(player));

  return { move: input.move, run: input.run, look: { dx: m.dx, dy: m.dy } };
}

// ---------------------------------------------------------------------------
// Capture director
// ---------------------------------------------------------------------------

/**
 * Scripts the SAME inputs a player would give, so the capture is a playthrough and every
 * consequence in it is produced by the real systems. It never touches wall stages or limb
 * state directly — it walks, aims and pulls the trigger, and the rest follows.
 */
const _dv = new THREE.Vector3();
const _dv2 = new THREE.Vector3();

class Director {
  constructor(player, weapons, room, hunter, limbField) {
    this.p = player; this.w = weapons; this.room = room; this.h = hunter; this.f = limbField;
    this.t0 = 0;
    this.cd = 0;
    this.target = null;
  }
  reset() { this.t0 = null; this.target = null; }

  /**
   * The panel this loop is about, chosen from the map rather than by index.
   *
   * ⚠️ THIS USED TO BE `this.room.panels[1]` — "the panel at x = -2.6" — together with an
   * aim point built as `(panel.x, 1.35, 0)` and a straight advance down the z axis. All three
   * are facts about the one-room level and none of them survive a floor plan. Index 1 does not
   * exist in a map with one panel; `z = 0` is a point outside the house; and a z-advance walks
   * the robot into a wall in any room whose panels face along X. Leaving it alone would have
   * made every screenshot, every `audit --render` and every critic verdict on `game.play` a
   * picture of a robot walking into a wall — which is not a failure anyone would have read as
   * a bug in the director.
   */
  /** The panel this loop is about, by ID rather than by index. */
  _pick() {
    const ps = this.room.panels;
    return ps.find((q) => q.id === 'p.svc_w.s' && q.state.isDamageable())
      ?? ps.find((q) => q.state.isDamageable()) ?? ps[0] ?? null;
  }

  /**
   * Walk at a point the way a player would: turn toward it, hold W. Returns the remaining
   * distance so a beat can tell whether it arrived.
   *
   * ⚠️ EVERY LEG BELOW IS A STRAIGHT LINE THAT DOES NOT CROSS A SOLID WALL, and that is
   * checked against the floor plan rather than assumed. The gallery leg runs along the room;
   * the leg into the passage runs down x = 0, which is exactly D2's centre line, so the
   * doorway is passed through rather than steered around. A director that needs pathfinding
   * to make its own capture is a director that will drive into a wall the first time the
   * floor plan moves — the fix is to pick legs the map makes trivial, not to give the
   * director an AI.
   */
  _walk(to, out, opts = {}) {
    const d = _dv2.set(to[0] - this.p.pos.x, 0, to[1] - this.p.pos.z);
    const len = Math.hypot(d.x, d.z);
    if (opts.face !== false) out.aimYaw = Math.atan2(d.x, d.z);
    out.move = { x: 0, y: len > (opts.stop ?? 0.7) ? 1.0 : 0 };
    out.run = !!opts.run;
    return len;
  }

  step(dt, t) {
    if (this.t0 == null) { this.t0 = t; this.target = this._pick(); }
    const T = (t - this.t0) % LOOP;
    this.cd -= dt;

    const p = this.p;
    const target = this.target ?? (this.target = this._pick());

    const shoot = (cd) => {
      if (this.cd > 0) return;
      this.cd = cd;
      const a = p.attack(t);
      if (a?.weapon && !a.pending) this.w.fire(a.weapon, a.at, a.dir, t, { ignore: p.rig });
    };
    /** Aim at a panel's real centre at chest height, wherever in the house it is. */
    const aimAt = (panel, out) => {
      if (!panel) return;
      const tp = panel.root.position;
      const v = _dv.set(tp.x, 1.35, tp.z).sub(p.eye);
      out.aimYaw = Math.atan2(v.x, v.z);
      out.aimPitch = Math.atan2(v.y, Math.hypot(v.x, v.z));
    };

    const out = { move: { x: 0, y: 0 }, run: false, aimYaw: p.aimYaw, aimPitch: 0 };

    if (T < 2.2) {
      // THE READ OF THE SPACE. Hold still and look east down the full recession of the
      // gallery, with the chapel door at the far end. `--at 1.2` lands here.
      const vista = this.room.anchor?.('gallery.east');
      if (vista) { const d = _dv2.copy(vista).sub(p.pos); out.aimYaw = Math.atan2(d.x, d.z); }
      out.aimPitch = -0.02;
    } else if (T < 7.8) {
      // east along the gallery, toward D2
      this._walk([0.0, -27.10], out);
    } else if (T < 11.4) {
      // south through D2 and down the service passage. Same x as the door centre.
      this._walk([0.4, -13.10], out, { run: T > 8.6 });
    } else if (T < 17.0) {
      // Square up on `p.svc_w.s` and open fire. 255 total health against the nail gun's 26 at
      // 0.13 s is ~10 shots, so the wall opens around T = 13 and the rest of this beat is
      // shooting through the hole it made — which is also what pulls the hunter here, because
      // firing spikes `noise` to full and that is audible at 14 m THROUGH the wall.
      aimAt(target, out);
      out.move = { x: 0, y: 0 };
      shoot(0.16);
    } else if (T < 22.0) {
      // Retreat north up the passage, still firing into the breach. Retreating along the
      // breach's own axis is what frames whatever comes through it. HERO FRAME at `--at 19`.
      aimAt(target, out);
      out.move = { x: 0, y: -0.55 };
      shoot(0.34);
    } else {
      // back into the gallery and pick your arm up off the floor
      const near = this.f.nearest(p.pos, 14);
      if (near) {
        const len = this._walk([near.root.position.x, near.root.position.z], out);
        if (len <= 1.2) p.interact(this.f, 1.3);
      } else {
        this._walk([0.0, -26.60], out);
      }
    }
    return out;
  }
}
