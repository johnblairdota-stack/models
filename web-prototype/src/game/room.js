import * as THREE from 'three';
import { DestructibleWall } from './wall.js';
import {
  SPACES, INNER_WALLS, PORTALS, PANELS, SPAWN, ANCHORS, PATROL_ROUTE, WALL_T,
} from './spaces.js';
import { CONNECTOR, aperture, clearWidth, clearHeight, connectorAxis } from './connectors.js';
import { PanelInstances, WALL_MODE, wallMode } from './wallinstances.js';
import {
  DIG_DEFS, DIG_OPEN_DEFS, DIG_FREE_DEFS, SEG_W,
  digPanels, barrierSlabs, freePanels, chooseFreeInterconnect, digMode,
} from './dig.js';
import { PASS_H } from './rules.js';
import { estateMode } from './estate-spike.js';
import { buildSkin } from './skin.js';
import { furnDressEnabled } from '../destruction/furnprop.js';
import { MIN_LANDING_SPAN, uHitsAnyOpening } from './portal-clearance.js';

/**
 * THE PLAYABLE SPACE — built from the floor-plan table in `spaces.js`.
 *
 * The design statement is unchanged and it is one sentence: there is a route the level gives
 * you and there are routes you make. Destructible panels are TOPOLOGY, not decals — the AI
 * routes through a hole you shot the same way it routes through a door, because `portals()`
 * reports both and `pathPortals()` runs a BFS over whatever is open right now.
 *
 * WHAT THIS FILE OWNS AND WHAT IT DOES NOT
 * `spaces.js` is the floor plan. This is the builder and the query layer: geometry, the
 * collider buckets, the space graph, residency, and the interface below. Materials come from
 * `estate-agent`'s `materials-local.js` at RUNTIME (never at module scope — that file moves)
 * and degrade to plain PBR when the shape expected is not there.
 *
 *   room.root         Object3D to add to the scene
 *   room.floorY
 *   room.bounds       {minX,maxX,minZ,maxZ}   union AABB of every space
 *   room.panels       DestructibleWall[]      flat, every panel in the house
 *   room.collide(p, r)       -> Vector3       circle-vs-world, XZ only
 *   room.castRay(o, d, max, opts) -> {point,distance,normal,panel} | null
 *   room.blocksSight(a, b)   -> boolean
 *   room.spawn               {player:Vector3[], hunter:Vector3, breaches:Vector3[]}
 *   room.portals()           -> Portal[]      every way through, RIGHT NOW
 *   room.update(dt)
 *   room.spaces              Space[]
 *   room.spaceAt(v3)         -> Space | null
 *   room.setViewpoint(p, d) / setViewpoints([{pos,dir}])   RENDER ONLY (see below)
 *   room.pathPortals(a, b)   -> Portal[]
 *   room.anchor(name)        -> Vector3
 *
 * ⚠️ RESIDENCY IS A RENDER CONCEPT AND NOTHING ELSE. `collide`, `castRay`, `blocksSight`,
 * `portals()` and `update()` ignore visibility entirely; every collider in the house is
 * always live. `ThirdPersonCamera` raycasts the world to keep its boom out of walls, and if a
 * hidden room's colliders went away the boom would sail into an invisible room and the frame
 * would go black — in live play only, which is the failure class that has cost this project
 * the most.
 */

export async function buildTestRoom(engine, o = {}) {
  const root = new THREE.Group();
  root.name = 'room';

  /**
   * 🏚️ **`o.tables` — THE FLOOR PLAN, HANDED IN RATHER THAN IMPORTED.**
   *
   * `docs/slices/task-prime-time-lobby-warm-night.md` §3.3. Everything below used to read
   * `spaces.js`'s module-level tables directly, and those tables are computed from
   * `location.search` **at import time** (`spaces.js` L85-96's `GEN`). That is fine for
   * `views/game.js`, which is a page a person types a URL into. It does not work for the party
   * night, whose mansion renders inside a follow slot with a CLOSED URL schema that has `plan` on
   * its forbidden list — and rightly so: a TV showing a different house from the one the guide's
   * map draws is the leak that entry was written for.
   *
   * The resolution is that the party night does not get to choose either. `src/party/mansion.js`
   * derives one plan from the public `worldSeed` and hands it in here, so the TV and the phones
   * cannot disagree because neither is asked.
   *
   * ⚠️ **ALL FIVE OR NONE, AND `basePanels`'s OWN HEADER BELOW SAYS WHY.** The panel table is read
   * in three places that must agree, and the space/portal/spawn tables are what the connectors are
   * resolved against. A half-applied override gives a panel embedded in a solid wall, or a hole in
   * the building with nothing in it.
   *
   * ⚠️ **`ANCHORS` AND `INNER_WALLS` ARE DELIBERATELY NOT OVERRIDDEN.** `INNER_WALLS` is `[]` and
   * a generated plan has no authored anchors, so `room.anchor(name)` returning `null` under
   * `tables` is the correct answer rather than a missing feature — `views/game.js`'s sledge spawn
   * already falls back to `room.spawn.player[0]` for exactly that case.
   *
   * With no `o.tables` every local below IS the import it replaced, so `game.play` is byte for
   * byte the house it was.
   */
  const _T = o.tables ?? null;
  const _SPACES = _T?.spaces ?? SPACES;
  const _PORTALS = _T?.portals ?? PORTALS;
  const _PANELS = _T?.panels ?? PANELS;
  const _SPAWN = _T?.spawn ?? SPAWN;
  const _PATROL = _T?.patrol ?? PATROL_ROUTE;

  /**
   * THE PANEL TABLE THIS BUILD USES — `PANELS` unless the caller narrows it.
   *
   * ⚠️ IT IS READ IN THREE PLACES AND ALL THREE HAVE TO AGREE, WHICH IS THE ONLY REASON IT IS
   * A LOCAL AND NOT AN IMPORT: the build loop makes the `DestructibleWall`, `cutsOnWall` cuts
   * the hole for it, and `cutsOnInnerWall` does the same for the M1 divider. Filtering one and
   * not the others gives either a panel embedded in a solid wall (it opens, and the wall is
   * still there) or a hole in the building with nothing in it.
   *
   * ⚠️ IT EXISTS TO BE AN ABLATION, NOT A FEATURE. HANDOFF's rule, learned from
   * `room.ballroom`'s 2.24 ms sitting unattributed for a whole round: **a change that ships
   * without a permanent ablation toggle cannot be judged later.** The exit-site pool went from
   * 4 to 14 this round; `?exits=4` in `views/game.js` rebuilds the house exactly as it was, so
   * the draw-call cost of that decision is measurable rather than argued. Nothing in play
   * passes this.
   */
  /**
   * ⚠️ `?dig=1` — **DEFAULT OFF, AND IT IS A BUILD FLAG, SO IT IS READ HERE.**
   *
   * `docs/design/dig.md` / `docs/PLAN.md` Phase 2. It adds `src/game/dig.js`'s segmented walls
   * and their brick barrier to the house. Same reasoning as `?walls=`: it changes what is BUILT
   * and nothing about the run plan, which is the room's own business, and `o.dig` overrides so a
   * scenario can drive both arms without a query string.
   *
   * ⚠️ **EVERY PIECE OF STATE THE FLAG IMPLIES HANGS OFF THIS ONE VALUE**, because HANDOFF's
   * `?cam=r10` audit found a toggle that reverted less than it claimed and thereby contaminated
   * every comparison made with it, and three incomplete reverts have been found in two days.
   * The complete list, and there is nothing else:
   *
   *   1. `panelDefs`      the 36 segment rows are appended (below)
   *   2. `DIG_DEFS`       those rows and only those rows get the dig stage table (build loop)
   *   3. `def.t`          those rows and only those rows are 0.075 m thick, not `WALL_T`
   *   4. the BRICK        `barrierSlabs()` geometry + colliders, emitted in `buildSpace`
   *   5. `mats.brick`     baked only when the flag is on — the arm-off build bakes nothing extra
   *
   * `room.dig` reports the arm, so a probe asserts on the build rather than on the URL it typed.
   */
  /**
   * 🕳️ ⚠️ **`?dig=` IS NOW THREE-VALUED, AND `1` MEANS FREE-FORM.**
   *
   *   off   DEFAULT. Nothing from `dig.js` reaches the build; byte-for-byte the shipped house.
   *   free  `?dig=1` or `?dig=free`. One continuous destructible face per span per room, with a
   *         `DamageField` on it: chunks come off wherever the hammer lands (`dig.js` `digMode`).
   *   bays  `?dig=bays`. The 2026-08-05 segmented build, unchanged, kept ONLY so every number
   *         measured against it — `dig-feel.mjs`, `dig-link.mjs`, `dig-promoted.mjs`, the
   *         27.9/48.9 s search figures — stays re-runnable and comparable.
   *
   * ⚠️ It is read through `digMode()` rather than compared here, because the mode gates FIVE
   * separate build decisions and HANDOFF records three incomplete reverts in two days. `o.dig`
   * still overrides so a scenario can drive any arm without a query string; `true` maps to free.
   */
  /**
   * 🕳️ **DIGGING IS NOW ON BY DEFAULT** (2026-08-08). It had been behind `?dig=1` since `dig-1`
   * built it, which meant **the playable slice a person loads contained no digging at all** —
   * seven builder rounds, four critics and John's own playthroughs all ran with the flag, and the
   * default build did not. That is the campaign's own Wave 6 step and it was never taken.
   *
   * `?dig=0` (or `off`) restores the pre-dig build; `?dig=bays` is the retired segmented arm, kept
   * so every `dig-1`/`dig-2` figure stays re-runnable.
   *
   * ⚠️ Verified before flipping: `escape.mjs` is **20/20 on `seed=s4&dig=1`** (`digtoggle-1`), so
   * the win condition holds with digging live — the arm that matters, since the default is now
   * the arm the contract must pass on.
   */
  const _digRaw = o.dig ?? (typeof location !== 'undefined'
    ? new URLSearchParams(location.search).get('dig') : null);
  const DIG_MODE = digMode(_digRaw ?? 'free');
  const DIG = DIG_MODE !== 'off';
  const FREE = DIG_MODE === 'free';

  const basePanels = o.panels ?? _PANELS;
  /**
   * ⚠️ APPENDED, NEVER INSERTED, AND `PANELS` IS NOT TOUCHED AT ALL. The ids in `PANELS` are a
   * network protocol surface and `run.js`'s `chooseExit()` derives the live exit from
   * `EXIT_SITES` = `PANELS.filter(isExitSite)` — so a table that is neither inserted into
   * `PANELS` nor an exit site cannot move a seed. **No seed quoted in any document goes stale
   * because of this round**, which is a property worth more than the tidiness of one table.
   */
  const panelDefs = DIG ? [...basePanels, ...(FREE ? freePanels() : digPanels())] : basePanels;
  /**
   * 🕳️ **NO MASONRY IN FREE MODE, AND THAT IS THE THIRD PIECE OF STATE THE TOGGLE OWNS.** The
   * barrier is the damage field's G channel (`damagefield.js`), so there is no brick to emit, no
   * collider to drop, no `brickOf` entry and no bake — which also means the house-wide unlock is
   * one pass over a Uint8Array instead of 36 degenerate-vertex writes.
   */
  const barriers = DIG_MODE === 'bays' ? barrierSlabs() : [];

  // ⚠️ AFTER `DIG`, BECAUSE THE BRICK IS ONLY BAKED WHEN THE FLAG IS ON. A texture bake the
  // arm-off build pays for is a cost the toggle claims not to have; `loadMaterials` returns the
  // same object it always did when `brick` is false.
  /**
   * 🆕 **`?estate=port` — THE ESTATE KIT ACTUALLY BUILDS A ROOM NOW.**
   *
   * `estate-spike-1` verified John's complaint in code and it is worse than he put it: this
   * file used **exactly one symbol from the entire estate kit — `kit.GeoBin`.** Not `wallRun`,
   * not `windowBay`, not `pilaster`, not `cofferedCeiling`, nothing from `world/props.js` or
   * `lighting/practicals.js`. Every playable room is `bin.box()` calls with five materials,
   * so every art score on the board is for a frame no player ever sees.
   *
   * Under this flag the gallery is built to `src/world/gallery-order.js` — the SAME module
   * `views/room-gallery.js` builds from — and the order REPLACES this file's own boxes on that
   * room rather than standing on top of them: the panelled storey is capped at the string
   * course and the clerestory band above it is emitted with real holes in it.
   *
   * ⚠️ Read here rather than in `views/game.js` for the same reason `?walls=` is: it changes
   * the BUILD, and the build is this file's business. `o.estate` overrides so a scenario can
   * drive both arms with no query string.
   */
  /**
   * 🆕 **`port` IS NOW THE DEFAULT** (John, 2026-08-08). He asked for the game to be developed
   * against the real estate art rather than the placeholder boxes — *"I just want the game to
   * progress from the assets we made for the 3 rooms we had in the art"* — and, on the one open
   * question of whether the ported gallery reads too bright for a horror level: *"light will be
   * important but for now it's okay if its just more practical."* So the look is accepted and
   * the switch flips.
   *
   * `?estate=off` (or `0`) restores the shipped boxes; every price-probe arm still works.
   * ⚠️ **Cost, measured by `estate-1`:** `gallery.mid` 559 → 570 against a 625 ceiling, and
   * `chapel.centre` 634 → 645 — that station was ALREADY over budget at 634 before any of this,
   * per `estate-spike-1`'s baseline, so the port worsens a pre-existing failure rather than
   * causing one. Re-baselining the whole budget is its own task.
   */
  const _estateRaw = o.estate ?? (typeof location !== 'undefined'
    ? new URLSearchParams(location.search).get('estate') : null);
  const ESTATE = estateMode(_estateRaw ?? 'port');
  const PORT = !!ESTATE?.port;

  const mats = await loadMaterials(engine, { brick: barriers.length > 0, estate: PORT });
  const kit = await tryImport(() => import('../world/kit.js'));
  // ⚠️ DYNAMIC, LIKE `kit`, AND FOR THE SAME REASON: `materials-local.js` and the estate kit
  // belong to another owner and move. A missing module has to degrade to the shipped build,
  // not take the game down — so `PORT` is only true if the import actually landed.
  const order = PORT ? await tryImport(() => import('../world/gallery-order.js')) : null;
  const hasOrder = !!order?.galleryOrder;
  /**
   * 🆕 **THE STUDY'S ORDER — the second of John's three rooms** (`estate-2`, 2026-08-09).
   *
   * Same contract as the gallery's: a separate dynamic import, so a missing or broken module
   * degrades to the shipped boxes for THAT ROOM ONLY instead of taking the house down, and
   * `STUDY` is only true if the import actually landed. `?estate=port,nostudy` is the ablation
   * and it restores the 2026-08-08 gallery-only default exactly.
   */
  const STUDY = !!(PORT && ESTATE?.study);
  const studyMod = STUDY ? await tryImport(() => import('../world/study-order.js')) : null;
  /**
   * 🆕 **THE BALLROOM'S ORDER — the third and last of John's three rooms** (`estate-3`,
   * 2026-08-09). Same contract as the other two: its own dynamic import, so a missing or broken
   * module degrades to the shipped boxes for THAT ROOM ONLY, and `BALL` is only true if the
   * import actually landed. `?estate=port,noballroom` is the ablation.
   *
   * ⚠️ **AND IT IS THE ONE ORDER THAT CHANGES A ROOM'S DIMENSIONS.** `spaces.js` raised
   * `ballroom.storey` 7.20 -> 9.60 for it — see the long note there. That raise is NOT gated on
   * this flag and must not be: the storey is the floor plan, the ablation is the ORDER, and a
   * toggle that quietly rebuilds the room at a different size is a toggle whose two arms are
   * not comparable. `estate-2`'s item 7 is the whole reason that rule exists.
   */
  const BALL = !!(PORT && ESTATE?.ballroom);
  const ballMod = BALL ? await tryImport(() => import('../world/ballroom-order.js')) : null;
  // The dirt layer the ballroom showcase uses, loaded the same guarded way as the order itself
  // so a missing module degrades to "no grime" rather than to a room that will not build.
  const ballPatina = BALL ? await tryImport(() => import('../world/patina.js')) : null;
  /**
   * 🆕 **`?ballfix=0` — THE PERMANENT ABLATION FOR `ballroom-fix-1`'S TWO CHANGES**, and it is
   * one flag for both because they were measured as one round.
   *
   *   ?ballfix=1   (default) curved spandrels on the three arches + the four pier glasses
   *   ?ballfix=0   `estate-3`'s build: the 10-box stepped spandrel, and a bare mirror wall
   *
   * ⚠️ It exists because a before/after taken in TWO browser sessions is not a control pair,
   * and this project's own rule is that a cross-session comparison proves nothing. With the
   * flag, `critic-slice-2`'s sawtooth and this round's fix can be photographed from the same
   * camera in one boot — which is the only way the sawtooth claim was ever going to be settled,
   * since `estate-3` raised the step count once already and could not see that it had not
   * helped. `?planarclip=flat` in `views/room-ballroom.js` is kept for exactly this reason.
   */
  const BALLFIX = (typeof location !== 'undefined'
    ? new URLSearchParams(location.search).get('ballfix') : null) !== '0';
  const hasStudy = !!studyMod?.studyOrder;
  const hasBall = !!ballMod?.ballroomOrder;

  /**
   * ⚠️ `?walls=legacy | occlude | instanced` — THE ABLATION FOR THE INSTANCING GATE, AND IT IS
   * READ HERE RATHER THAN IN `views/game.js` ON PURPOSE.
   *
   * `?exits=` is read in the view because it changes the RUN PLAN as well as the build; this
   * one changes nothing but how the panels are drawn, it is the room's own business, and
   * `views/game.js` is another agent's live file this round. `o.wallMode` overrides, so a
   * scenario or a test can drive all three arms without a query string.
   *
   *   legacy     the exact pre-change build: four layer planes and a reveal per panel, always.
   *   occlude    hide layers nothing can see (`wall.js` `occludeLayers`). No instancing.
   *   instanced  default. Occlusion + one shared `InstancedMesh` pair per authored aperture.
   *
   * ⚠️ `legacy` must revert EVERYTHING the toggle implies or every comparison made with it is
   * contaminated — HANDOFF's `?cam=r10` finding. There are exactly two pieces of state: the
   * per-panel `occludeLayers` flag and whether `PanelInstances` is constructed at all. Both are
   * set from this one value and nothing else reads it.
   */
  const MODE = o.wallMode ?? wallMode(
    typeof location !== 'undefined' ? new URLSearchParams(location.search).get('walls') : null);

  /**
   * ⚠️ **THE ONE LIST.** Every hole in every wall in the house — doorways and destructibles
   * alike — is a CONNECTOR (`src/game/connectors.js`), and this is the list the wall cutter,
   * the graph and the panel builder all read. Before this they were two tables read in three
   * places with two different sets of defaults, which is how "the panel opens and the wall is
   * still there" was possible: `cutsOnWall` and the build loop could disagree about what a row
   * meant, and nothing threw.
   *
   * `PORTALS` first, then whatever panel table this build is using — see `o.panels`, which is
   * what makes `?exits=4` an honest ablation rather than a run-plan filter.
   */
  const connectorDefs = [..._PORTALS, ...panelDefs];

  const panels = [];
  const panelsByWall = new Map();
  const spaces = [];
  const byId = new Map();
  /**
   * 🕳️ **THE TWO THINGS A BARRIER IS MADE OF, ADDRESSABLE.** `buildSpace` fills both.
   *   brickOf   panel id -> that segment's own half of the shared masonry (geometry + collider)
   *   lintelOf  `<space>|<edge>.<seg>` -> the 3.00 m of wall standing on a segment, per room skin
   * Empty with `?dig=0`, because nothing puts anything in them.
   */
  const brickOf = new Map();
  const lintelOf = new Map();

  // ------------------------------------------------------------------ spaces
  for (const def of _SPACES) {
    const sp = {
      ...def,
      root: new THREE.Group(),
      colliders: [],
      panels: [],
      portals: [],
      neighbours: new Set(),
      cx: (def.x0 + def.x1) / 2, cz: (def.z0 + def.z1) / 2,
      w: def.x1 - def.x0, d: def.z1 - def.z0,
      bounds: { minX: def.x0 + 0.4, maxX: def.x1 - 0.4, minZ: def.z0 + 0.4, maxZ: def.z1 - 0.4 },
      /** clear extents grown by a wall thickness — what segment tests use */
      aabb: new THREE.Box3(
        new THREE.Vector3(def.x0 - WALL_T, -0.5, def.z0 - WALL_T),
        new THREE.Vector3(def.x1 + WALL_T, def.storey + 0.5, def.z1 + WALL_T)),
      visible: true,
      _hold: 0,
    };
    sp.root.name = `space.${def.id}`;
    root.add(sp.root);
    spaces.push(sp);
    byId.set(def.id, sp);
  }

  // ------------------------------------------------------------------ geometry
  for (const sp of spaces) buildSpace(sp);

  // ------------------------------------------------------------------ panels
  for (const def of panelDefs) {
    const owner = byId.get(def.a) ?? byId.get(def.b);
    if (!owner) continue;
    // ⚠️ ONE APERTURE FUNCTION, AND IT IS THE SAME ONE `cutsOnWall` USES. Per-connector `w` /
    // `h` / `cy` are optional and every pre-existing panel omits them, so this is
    // behaviour-identical for the eight original panels. The exit sites need them: a pair of
    // orangery doors is not the same opening as a hole knocked between two studies.
    //
    // ⚠️ AND THE APERTURE IS NOT A FUNCTION OF THE STATE. `aperture()` reads the spec alone, so
    // the hole an exit site cuts is the same hole whether this run made it live or left it
    // chained — which is `procedural-map.md` §2's whole requirement, enforced by construction
    // rather than by two tables agreeing.
    const ap = aperture(def);
    const p = new DestructibleWall({
      id: def.id,
      field: o.wallField ?? null,
      position: [def.x, ap.cy, def.z],
      rotY: def.rotY ?? 0,
      width: ap.w, height: ap.h,
      // ⚠️ `def.t` IS ONLY EVER SET BY `dig.js`. A dig segment is one room's 0.075 m of finish in
      // front of the shared brick, not the whole 0.30 m band — the two rooms' segments plus the
      // brick between them add up to `WALL_T` exactly. Every shipped row omits it.
      thickness: def.t ?? WALL_T,
      /**
       * 🕳️ **`def.free` IS WHAT PUTS A DAMAGE FIELD ON A FACE, AND IT IS THE ONLY SWITCH.**
       * `wall.js` builds a `DamageField` when this is present and every one of its queries —
       * collision, tracing, sight, the shader's threshold — reads that one grid. Undefined here
       * is the stage machine, byte-identical to before.
       */
      damage: def.free ? { cell: def.cell, barrier: def.envelope ? 1 : 0 } : null,
      bandThickness: def.bandT ?? undefined,
      // ⚠️ AND SO IS `def.dig`. Undefined here is byte-identical to the pre-dig build: the panel
      // gets `STAGE_DEFS` from `WallState`'s own default, exactly as before.
      defs: def.free ? DIG_FREE_DEFS : (def.dig ? DIG_DEFS : undefined),
      /**
       * ⚠️ **AND SO IS `demoteOpen`, AND IT IS THE PRICE OF THE HOUSE-WIDE UNLOCK.** `wall.js`
       * `spent` requires `!canOpen()`, which is what makes demotion inert on the shipped build —
       * but the unlock turns EVERY segment's table into one that ends at `open`, so after it
       * fires not one of the 36 would be spent and `dig-promoted.mjs`'s 754-call worst case
       * comes straight back, this time with no way to switch it off. An `open` panel's look is a
       * constant for exactly the same reason a `barrier` panel's is (`applyStageBreaks` is
       * driven by the stage INDEX, and both tables terminate at index 4), so the shared spent
       * meshes already draw the right picture. This flag is what lets `spent` say so, and it is
       * set for dig segments only — `?dig=0` never sets it and cannot notice it.
       */
      // 🕳️ A free face is never `spent` (`wall.js`), so this is dead for it — set false rather
      // than relying on that, because a flag that is true of a panel the mechanism cannot handle
      // is exactly the kind of thing that survives a refactor and then draws the wrong picture.
      demoteOpen: !!def.dig && !def.free,
      revealMaterial: mats.reveal,
      occludeLayers: MODE !== WALL_MODE.LEGACY,
    });
    p.spec = def;
    p.connector = def;
    p.ownerSpace = owner;
    owner.root.add(p.root);
    panels.push(p);
    // A panel belongs to BOTH spaces it joins, for tracing and for residency.
    for (const id of new Set([def.a, def.b])) byId.get(id)?.panels.push(p);
    const key = `${def.a}|${def.b}`;
    if (!panelsByWall.has(key)) panelsByWall.set(key, []);
    panelsByWall.get(key).push(p);
    // A broken panel changes the graph, so the BFS cache has to die with it.
    p.state.onStageChange((stage, info) => { pathCache.clear(); if (def.dig) _digStageChanged(p, info); });
  }

  /**
   * 🕳️ **THE TWIN LINK — the two faces of one wall band, wired to each other.**
   *
   * `wall.js` `_couple()` mirrors newly-through cells onto the other side, because when the last
   * of the material between two faces goes there is ONE hole and not two. It has to be done here
   * rather than in the builder because a face does not know its own id scheme; `room.js` is
   * already the place that knows `.a` and `.b` name the same physical thing.
   *
   * ⚠️ The path-cache invalidation a free face needs is wired further down, AFTER
   * `PanelInstances` is constructed — see the note there.
   */
  for (const p of panels) {
    if (!p.spec?.free) continue;
    const other = p.spec.side === 'a' ? 'b' : 'a';
    p.twin = panels.find((q) => q.spec?.free && q.spec.edge === p.spec.edge
      && q.spec.seg === p.spec.seg && q.spec.side === other) ?? null;
  }

  // ------------------------------------------------------------------ the graph
  // `kind: 'door'` is the OPEN state. `w` is the CLEAR WIDTH and it comes through
  // `clearWidth()` untouched — that single number is D7's mechanic (see `connectors.js`).
  const portalDefs = connectorDefs.filter((d) => d.state === CONNECTOR.OPEN).map((d) => ({
    id: d.id, a: d.a, b: d.b, axis: connectorAxis(d), w: clearWidth(d), h: clearHeight(d), kind: 'door',
    state: CONNECTOR.OPEN,
    centre: new THREE.Vector3(d.x, 0, d.z),
    normal: connectorAxis(d) === 'x' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0),
  }));
  for (const pd of portalDefs) {
    for (const id of new Set([pd.a, pd.b])) byId.get(id)?.portals.push(pd);
    if (pd.a !== pd.b) { byId.get(pd.a)?.neighbours.add(pd.b); byId.get(pd.b)?.neighbours.add(pd.a); }
  }

  /** Breach edges, rebuilt each call because they appear the moment a panel opens. */
  function breachPortals() {
    const out = [];
    for (const p of panels) {
      if (p.blocksMovement()) continue;
      const d = p.spec;
      out.push({
        id: d.id, a: d.a, b: d.b, kind: 'breach', panel: p,
        // 🕳️ A HUNTER-MADE HOLE IS ITS OWN SIZE, and the graph has to say so or the hunter is
        // refused the hole it just made. `hunterBreach` takes out the lintel AND the bay next
        // door, so the clear opening there really is two bays wide and a full storey tall — this
        // is the physical answer being reported, not a special case for one body.
        /**
         * 🕳️ **A FREE FACE REPORTS THE HOLE IT ACTUALLY HAS, NOT ITS AUTHORED APERTURE.** A span
         * is 5.72 m wide, so `clearWidth()` would tell the BFS that a hole you punched with a
         * hammer is a five-metre doorway and it would route a stage-3 hunter at it. `openChannel`
         * is the same measurement `blocksMovement` is made of, so the graph and the collider can
         * never disagree about whether a body fits.
         */
        w: d.free ? p.openChannel().width
          : d.dig ? (dig.breached.get(`${d.edge}.${d.seg}`)?.w ?? clearWidth(d)) : clearWidth(d),
        h: d.free ? p.openChannel().height
          : d.dig ? (dig.breached.get(`${d.edge}.${d.seg}`)?.h ?? clearHeight(d)) : clearHeight(d),
        axis: connectorAxis(d),
        centre: new THREE.Vector3(d.x, 0, d.z),
        normal: new THREE.Vector3(Math.sin(d.rotY ?? 0), 0, Math.cos(d.rotY ?? 0)),
      });
    }
    return out;
  }

  function portals() { return [...portalDefs, ...breachPortals()]; }

  // ==========================================================================
  // 🕳️ THE BARRIER — the interconnect, the house-wide unlock, the hunter's crossing
  //
  // `docs/design/dig.md` §1, John: *"where the rooms interconnect there is a solid visible
  // barrier that robots can't enter until they find the interconnect. Once the interconnect is
  // accessed by a player the whole robot barrier turns off and players can continue digging into
  // the other rooms of the estate."*
  //
  // ⚠️ **EVERYTHING BELOW IS DEAD WITH `?dig=0`.** `dig.on` is the build flag, every entry point
  // early-outs on it, and `brickOf` / `lintelOf` are empty because nothing put anything in them.
  // ==========================================================================

  const panelById = new Map(panels.map((p) => [p.id, p]));

  /**
   * ⚠️ **`?unlock=global | edge | off` — THE ABLATION FOR THE ONE READING THIS ROUND HAD TO
   * GUESS AT, AND IT IS WHY IT IS A TOGGLE AND NOT A CONSTANT.**
   *
   * `dig.md` §1 flags it in as many words: *"one reading to confirm: 'the whole robot barrier
   * turns off' is taken as GLOBAL — one discovery opens every room pair, not each pair needing
   * its own. Flagged, not assumed."* John's sentence is ambiguous and the two readings are
   * genuinely different games, so both are built:
   *
   *   room    DEFAULT since 2026-08-12. Each ROOM has its own interconnect, and finding it drops
   *           the barrier on every wall bounding THAT room only. Every other room keeps its own.
   *   global  One discovery drops every barrier in the house. The finder's moment is a broadcast
   *           event and the act break in §1 is real: sealed, then open.
   *   edge    only the pair of rooms that interconnect opens. The same puzzle N more times.
   *   off     the barrier never lifts. The control arm — it is what makes "the unlock is what
   *           changed this number" answerable instead of arguable, and it is also exactly the
   *           pre-interconnect build, so `dig-1`'s figures stay re-runnable.
   *
   * 🚨 **`global` WAS THE DEFAULT AND JOHN REVERSED IT AFTER PLAYING, 2026-08-12. THIS BLOCK USED
   * TO SAY "I did NOT find a reason the global reading is wrong and I looked for one." HE FOUND
   * IT BY PLAYING, WHICH IS THE ONLY PLACE IT WAS VISIBLE.** His words:
   *
   *   *"I had a lot of freedom of movement on this map when I most expect to be stuck in a room
   *   with the hammer forcing you to make noise to leave."*
   *   *"the interconnect should be the main way out of each room. each room having an
   *   interconnect that removes the cyan barrier for the walls of that room. other barriers
   *   should remain on else where for their rooms."*
   *
   * ⚠️ **AND THIS REVERSES HIS OWN EARLIER SENTENCE** (*"once the interconnect is accessed by a
   * player the whole robot barrier turns off"*, 2026-08-08) that `dig.js` `DIG_OPEN_DEFS` was
   * built to implement literally. Both readings still ship; only the default moved. **The old
   * argument against per-room — that it is "the grind §1 names" — was made about the AUTHORED
   * house's 7 edges. A generated house has 17-36, and `genslab-1` measured every single face
   * carrying an interconnect (12/12 to 28/28 per seed), i.e. the search had collapsed to zero.
   * Per-room is what puts it back**, so the two facts that look contradictory are about
   * different houses.
   */
  const UNLOCK = (() => {
    const raw = o.unlock ?? (typeof location !== 'undefined'
      ? new URLSearchParams(location.search).get('unlock') : null);
    return ['room', 'global', 'edge', 'off'].includes(raw) ? raw : 'room';
  })();

  const dig = {
    on: DIG,
    mode: DIG_MODE,
    free: FREE,
    unlock: UNLOCK,
    /** panel ids that are this run's interconnects. Set by `setDigPlan`, never by the build. */
    link: new Set(),
    /** edges whose barrier has lifted. `global` fills it in one go. */
    opened: new Set(),
    /** segment columns the HUNTER has come through — those holes are full height. */
    breached: new Map(),
    /** the hunter may cross a dig wall at all. Its own switch, so the beat can be ablated. */
    hunterCrossing: DIG,
    unlockedAt: null,
  };
  const _onUnlock = new Set();

  const _col = (spec) => `${spec.edge}.${spec.seg}`;
  const _sideId = (spec, side) => `d.${spec.edge}.${spec.seg}.${side}`;
  function _twinOf(p) {
    return p.spec?.dig ? (panelById.get(_sideId(p.spec, p.spec.side === 'a' ? 'b' : 'a')) ?? null) : null;
  }

  /** Take a static box out of the world. Kept by reference so it can be put back. */
  function _dropCollider(rec) {
    if (!rec?.box || rec.dropped) return;
    const arr = rec.space.colliders;
    const i = arr.indexOf(rec.box);
    if (i >= 0) arr.splice(i, 1);
    rec.dropped = true;
  }
  function _restoreCollider(rec) {
    if (!rec?.box || !rec.dropped) return;
    rec.space.colliders.push(rec.box);
    rec.dropped = false;
  }

  /**
   * One segment's masonry, on or off — BOTH sides, because the brick is one wall.
   *
   * ⚠️ It has to be reversible. `views/game.js` re-derives the whole plan on every
   * `resetRound()` (every 28 s in capture), and a new seed picks a DIFFERENT interconnect — so a
   * one-way `hide()` would leave last round's answer permanently unbricked and this round's
   * bricked, which is a hole in the wall that means nothing and a barrier where the way through
   * should be. Neither throws.
   */
  function _setBrick(colKey, on) {
    for (const side of ['a', 'b']) {
      const rec = brickOf.get(`d.${colKey}.${side}`);
      if (!rec) continue;
      if (on) { rec.geo.show?.(); _restoreCollider(rec); }
      else { rec.geo.hide(); _dropCollider(rec); }
    }
  }

  /**
   * Swap a segment onto a different stage table, in place.
   *
   * ⚠️ **THE STAGE IS KEPT AND THE HEALTH IS RE-READ, WHICH IS THE WHOLE POINT.** The unlock has
   * to be able to fire while a player is part way through a wall, and `DIG_DEFS` and
   * `DIG_OPEN_DEFS` share their first four rows object-for-object — so a segment mid-plaster
   * carries on exactly where it was and only what happens at the BOTTOM changes. A segment
   * already sitting at `barrier` becomes a hole on the same frame, which is the payoff John's
   * sentence promises: *"players can continue digging"*, and the digs you already paid for
   * become doors.
   */
  function _setDefs(p, defs) {
    const st = p.state;
    if (st.defs === defs) return false;
    st.defs = defs;
    st.stageHealth = defs[Math.min(st.stage, defs.length - 1)].health;
    p._recomputeBox();
    p._apply();
    // The (pristine, spent) signature can flip here without a stage change, and `sync()`
    // early-outs on an unchanged signature — so a panel that just stopped being spent would go
    // on being drawn by the shared instance. `onPromote` is the same hook a landed hit uses.
    p.onPromote?.(p);
    pathCache.clear();
    return true;
  }

  /**
   * ⚠️ **BREAKING THROUGH IS THE ONE MOMENT THE TWO SIDES ARE COUPLED, AND IT HAS TO BE.**
   *
   * `dig.md` §5's two-sidedness — *"depth is per-side; the barrier is the shared floor of both
   * sides"* — is why each segment has two independent `WallState`s, and that is right for as long
   * as there is something between them. When the last of it goes there is one hole, not two, and
   * a panel is registered as a collider by BOTH spaces it joins (`boxesNear` walks `s.panels`).
   * So an uncoupled breakthrough gives `breachPortals()` a graph edge through a wall that still
   * physically blocks: the BFS routes bodies at a hole they bounce off. That does not throw and
   * it reads as an AI that forgot what it was doing — this file's most expensive failure class.
   */
  function _digStageChanged(p, info) {
    if (!dig.on) return;
    // 🕳️ A free face never uses this path: its breakthrough is a grid event, not a stage change,
    // and `_freeBreakthrough` below is what watches for it.
    if (p.spec?.free) return;
    const last = p.state.defs.length - 1;
    if (p.state.stage < last || p.blocksMovement()) return;
    const twin = _twinOf(p);
    if (twin && twin.state.canOpen() && twin.state.stage < twin.state.defs.length - 1) {
      twin.state.setStage(twin.state.defs.length - 1, info?.hit ?? null);
    }
    // The interconnect being reached is the unlock. `info.authoritative` guards the client path
    // and `!info.reset` guards `WallField.resetAll()`, which re-emits on every damaged panel in
    // the house on the frame the capture Director restarts the round.
    if (dig.link.has(p.id) && !info?.reset) unlockBarrier(p.spec.edge, p.id);
  }

  /**
   * 🕳️ **THE HOUSE-WIDE UNLOCK.** Every segment moves onto the table the interconnect was
   * already on, and every barrier's masonry comes out. One assignment per panel, because
   * `dig.js` made "the interconnect" and "an unlocked segment" the same table on purpose.
   */
  /**
   * 🕳️ **THE WALLS OF ONE ROOM — derived from the PANELS, not from a room→edge table.**
   *
   * Every dig segment already carries `ownerSpace` (set at the `p.ownerSpace = owner` line in the
   * build), so "the walls of that room" is a filter and there is no second table to fall out of
   * sync with `digEdges()`. That matters under `?plan=gen`, where the edge ids are generated and
   * an authored lookup is exactly the crash `dig.js`'s foot-of-file validator just had.
   *
   * ⚠️ **BOTH FACES OF EACH BOUNDING EDGE LIFT, AND THAT IS REQUIRED, NOT SLOPPY.** A wall carries
   * a barrier grid per FACE; lifting only the face that looks into this room would leave the far
   * face's masonry standing and the room would be a sealed box you could dig forever in. Opening
   * room A therefore lets you through every wall A touches — and leaves every wall it does NOT
   * touch barriered, which is the half John asked for: *"other barriers should remain on else
   * where for their rooms."*
   *
   * 🚨 **THE FALLBACK SHRINKS THE UNLOCK, IT NEVER GROWS IT.** If the room cannot be resolved this
   * degrades to the single edge, never to `global` — a bug here must make the house harder to
   * escape, not trivially open. That direction is the whole safety property of this function.
   */
  function edgesBoundingRoomOf(byPanel, edgeId) {
    const sp = (byPanel ? panelById.get(byPanel) : null)?.ownerSpace ?? null;
    if (!sp) return edgeId ? [edgeId] : [];
    const out = new Set(digSegments().filter((q) => q.ownerSpace === sp).map((q) => q.spec.edge));
    if (edgeId) out.add(edgeId);
    return [...out];
  }

  function unlockBarrier(edgeId = null, byPanel = null) {
    if (!dig.on || dig.unlock === 'off') return false;
    const want = dig.unlock === 'edge' && edgeId ? [edgeId]
      : dig.unlock === 'room' ? edgesBoundingRoomOf(byPanel, edgeId)
        : [...new Set(digSegments().map((p) => p.spec.edge))];
    const fresh = want.filter((e) => !dig.opened.has(e));
    if (!fresh.length) return false;
    for (const e of fresh) dig.opened.add(e);
    for (const p of digSegments()) {
      if (!dig.opened.has(p.spec.edge)) continue;
      /**
       * 🕳️ **IN FREE MODE THE UNLOCK IS ONE PASS OVER THE G CHANNEL.** John described it and
       * that description IS the implementation: *"the barrier disapears when a robot uses the
       * interconnect… allowing other player to walk through the other areas they destroyed the
       * white wall through to the other room."* Every cell already at depth 1 becomes passable
       * on this frame, so every abandoned dig in the house turns into a doorway at once — the
       * work you already paid for becomes a route. The segmented build did the same thing with
       * 36 stage-table swaps and 36 collider drops; this is a `fill(0)`.
       */
      if (p.spec.free) {
        if (p.spec.envelope) continue;   // map-edge cyan never lifts
        p.setBarrier(false);
        continue;
      }
      _setDefs(p, DIG_OPEN_DEFS);
      _setBrick(_col(p.spec), false);
    }
    dig.unlockedAt = byPanel;
    pathCache.clear();
    for (const fn of _onUnlock) fn({ edges: fresh, by: byPanel, mode: dig.unlock });
    return true;
  }

  /**
   * 🕳️ **THE HUNTER CROSSES — AND ITS HOLE IS NOT YOUR HOLE.**
   *
   * `dig.md` §2: *"the barrier is a ROBOT barrier, exactly as John wrote it, and the hunter is
   * not a robot in that sense. It crosses. It comes through the wall."* In Act 1 the player is
   * sealed in and the hunter is not, and that is the whole horror of the design.
   *
   * ⚠️ **IT TAKES THE LINTEL WITH IT, AND THAT IS THE POINT RATHER THAN A DETAIL.** A dig segment
   * is 1.80 m — robot scale, by construction (`dig.js` `SEG_H`) — so a hunter that merely opened
   * one would be standing at a hole it still could not get under. So its breach removes that
   * column's masonry AND the 3.00 m of wall standing on it, in BOTH rooms' skins, and the
   * resulting hole is full storey height. The player's holes stay robot-sized; the thing hunting
   * them makes its own, and you can tell at a glance which is which.
   */
  function hunterBreach(p) {
    if (!dig.on || !dig.hunterCrossing || !p?.spec?.dig) return false;
    if (p.spec.envelope) return false;   // hunter does not leave the map either
    if (dig.breached.has(_col(p.spec))) return false;
    /**
     * ⚠️ **IT TAKES THE BAY NEXT DOOR TOO, AND THAT IS NOT DECORATION — IT IS THE ONLY WAY THE
     * THING FITS.** Measured before it was built (`dig-low.mjs`): with one column taken, a
     * full-height hole 1.14 m wide still refused a stage-3 body at **0.660 m short of the face,
     * i.e. exactly its own radius** — `room.collide` is a circle push-out, so a body needs more
     * than twice its radius of clear width (0.84 / 1.08 / **1.32** at stages 1/2/3) and 1.14 only
     * ever admitted stage 1. A crossing that works until the hunter grows and then silently stops
     * working is the worst possible version of this beat.
     *
     * Two contiguous bays are 2.28 m, which clears every stage. `segmentCentres` spaces the bays
     * in one span exactly `SEG_W` apart and `buildWall` emits no infill between contiguous cuts,
     * so a pair really is one opening — but a bay at the end of a SPAN has solid wall beside it,
     * so the sibling is found by MEASURING the distance between the two panels rather than by
     * assuming `seg ± 1` is adjacent. If there is no contiguous neighbour the crossing still
     * happens at one bay's width and `digCensus().hunterBreached` reports the width it got.
     */
    const sibling = digSegments().find((q) => q.spec.side === p.spec.side
      && q.spec.edge === p.spec.edge && q.spec.seg !== p.spec.seg
      && !dig.breached.has(_col(q.spec))
      && q.root.position.distanceTo(p.root.position) < SEG_W * 1.05);
    const cols = [p.spec, ...(sibling ? [sibling.spec] : [])];
    const w = cols.length * SEG_W;
    const h = byId.get(p.spec.a)?.storey ?? 4.8;
    for (const spec of cols) {
      const col = _col(spec);
      dig.breached.set(col, { w, h });
      for (const side of ['a', 'b']) {
        const q = panelById.get(_sideId(spec, side));
        if (!q) continue;
        _setDefs(q, DIG_OPEN_DEFS);
        q.state.setStage(q.state.defs.length - 1, null);
      }
      _setBrick(col, false);
      for (const sp of spaces) {
        const l = lintelOf.get(`${sp.id}|${col}`);
        if (!l) continue;
        l.geo.hide();
        _dropCollider(l);
      }
    }
    pathCache.clear();
    return true;
  }

  function digSegments() { return panels.filter((q) => q.spec?.dig); }

  /**
   * THIS RUN'S INTERCONNECTS. Called by `views/game.js` from `applyExitPlan()`, beside the one
   * that decides which padlocked door is the exit — the same kind of fact, derived from the same
   * seed, applied in the same place. See `dig.js` `chooseInterconnect` for why it is not baked
   * into the build.
   */
  function setDigPlan(plan = {}) {
    if (!dig.on) return { on: false, link: [] };
    /**
     * 🕳️ **THE FREE-MODE PLAN IS A REGION PER EDGE, NOT A PANEL ID PER EDGE.**
     *
     * `plan.free` is `chooseFreeInterconnect(seed)`'s map. Every face's barrier channel is
     * rewritten from scratch here, on every round reset, for `setDigPlan`'s existing reason: a
     * new seed picks a different answer and a one-way apply would leave last round's passage
     * open and this round's bricked, neither of which throws.
     *
     * ⚠️ **AND THE TWIN GETS THE MIRRORED REGION.** A face's local +x runs the opposite way
     * round the wall from its twin's, so applying the same `u` to both would put the two halves
     * of one passage in different places and the wall would never open anywhere. `wall.js`
     * `_couple()` mirrors the same way and for the same reason.
     */
    if (FREE) {
      /**
       * 🚨 **PR B — CYAN IS A PROPERTY OF THE EDGE KIND, NOT A SEARCH ON EVERY FACE.**
       *
       * Inter-room faces start and stay at G=0: digging through opens the next room.
       * Envelope faces start and stay at G=1: smash the white, hit impassable cyan.
       * `setInterconnect` fills G=1 then punches a blob — that would put cyan BACK on
       * every interior wall. It is not called here.
       */
      for (const p of digSegments()) {
        p.resetDamage();
        p.setBarrier(!!p.spec.envelope);
      }
      /**
       * 🖼️ **AND THE DRESSING COMES BACK WITH THE WALL.** `resetDamage()` zeroes the grid; the
       * skin is a second structure keyed off that grid, so a one-way erosion would leave last
       * round's holes in this round's panelling — accumulating every 28 s under the capture
       * Director until the gallery had no paintings in it, silently. It is the same argument
       * `tracked().hide()` records for the brick twenty lines up, and the same failure mode.
       */
      skin?.reset();
      /**
       * Interconnect regions are still derived so a census / old unlock ablation can
       * read them, but they do not write G. Travel between rooms is "dig through".
       */
      const regions = plan.free ?? chooseFreeInterconnect(plan.seed ?? '');
      dig.link = new Set();
      dig.free_regions = regions;
      dig.opened.clear();
      dig.unlockedAt = null;
      dig.breached.clear();
      pathCache.clear();
      return { on: true, mode: 'free', link: [...dig.link] };
    }
    const link = new Set((plan.link ?? []).filter((id) => panelById.get(id)?.spec?.dig));
    dig.link = link;
    dig.opened.clear();
    dig.unlockedAt = null;
    /**
     * ⚠️ **AND THE HUNTER'S HOLES HEAL, BECAUSE THIS IS ALSO THE ROUND RESET.** `views/game.js`
     * `resetRound()` calls `wallField.resetAll()` and then `applyExitPlan()`, which lands here —
     * every 28 seconds under the capture Director. Leaving a crossing behind would accumulate
     * full-height holes in a house that is supposed to be sealed, one per round, and the search
     * would be over before it started on run three. Nothing about a crossing is latched anywhere
     * else: it is these three things and no more.
     */
    for (const [colKey] of dig.breached) {
      for (const sp of spaces) {
        const l = lintelOf.get(`${sp.id}|${colKey}`);
        if (l) { l.geo.show?.(); _restoreCollider(l); }
      }
    }
    dig.breached.clear();
    for (const p of digSegments()) {
      const isLink = link.has(p.id);
      _setDefs(p, isLink ? DIG_OPEN_DEFS : DIG_DEFS);
      // ⚠️ RE-BRICKED WHEN IT IS NOT THIS RUN'S ANSWER. A new seed picks a different segment and
      // the old one must go back to being an ordinary dud, or every round after the first leaves
      // a trail of un-bricked bays and the search is over before it starts.
      _setBrick(_col(p.spec), !isLink);
    }
    pathCache.clear();
    return { on: true, link: [...link] };
  }

  // ---- BFS over OPEN portals, cached, invalidated when any panel changes stage
  //
  // `minW` is a CLEAR-WIDTH FILTER and it is what makes D7 a mechanic instead of a trap.
  // `HunterAI.radius` is `0.30 + stage * 0.12` and `collide()` is a circle push-out, so a body
  // needs more than twice its radius of clear width to get through an opening: 0.84 / 1.08 /
  // 1.32 at stages 1/2/3 against D7's 1.20 m. Without this filter the BFS happily hands a
  // stage-3 hunter a route through a door it physically cannot pass, `_waypoint` lines it up
  // square in front of the opening, and it presses into the jamb for the rest of the round.
  // That does not throw and it does not look like a pathfinding bug — it looks like the AI
  // forgot what it was doing, three metres from the player.
  //
  // A BREACH edge is `PANEL_W` = 2.08 m wide, so a hole in the wall passes every stage. That
  // is the design: growth takes the chapel away and hands back the loud way in.
  //
  // 🕳️ ⚠️ **`minH` IS THE SAME FILTER ON THE OTHER AXIS AND IT IS NOT OPTIONAL POLISH.**
  // `dig.js`'s segment is 1.14 m wide — WIDER than the 1.08 m a stage-2 hunter needs — so the
  // width filter alone would hand a stage-2 hunter a route through a 1.80 m hole it cannot get
  // under, `_waypoint` would line it up square in front of it, `collide()` would refuse, and it
  // would press into the lintel for the rest of the round. That is the exact failure mode the
  // `minW` filter was written to prevent, arriving through the axis it does not cover.
  const pathCache = new Map();
  function pathPortals(from, to, minW = 0, minH = 0) {
    const a = typeof from === 'string' ? from : spaceAt(from)?.id;
    const b = typeof to === 'string' ? to : spaceAt(to)?.id;
    if (!a || !b) return [];
    if (a === b) return [];
    const key = `${a}>${b}|${minW.toFixed(2)}|${minH.toFixed(2)}`;
    const hit = pathCache.get(key);
    if (hit) return hit;

    const edges = portals().filter((p) => p.a !== p.b && p.w >= minW && (p.h ?? 99) >= minH);
    const adj = new Map();
    for (const e of edges) {
      if (!adj.has(e.a)) adj.set(e.a, []);
      if (!adj.has(e.b)) adj.set(e.b, []);
      adj.get(e.a).push({ to: e.b, e });
      adj.get(e.b).push({ to: e.a, e });
    }
    const prev = new Map([[a, null]]);
    const q = [a];
    while (q.length) {
      const cur = q.shift();
      if (cur === b) break;
      for (const nx of adj.get(cur) ?? []) {
        if (prev.has(nx.to)) continue;
        prev.set(nx.to, { from: cur, e: nx.e });
        q.push(nx.to);
      }
    }
    if (!prev.has(b)) { pathCache.set(key, []); return []; }
    const out = [];
    let cur = b;
    while (cur !== a) { const st = prev.get(cur); out.unshift(st.e); cur = st.from; }
    pathCache.set(key, out);
    return out;
  }

  /**
   * 🚪 **THE CHAINED DOORS OF A ROOM — the walls the hunter is allowed to work on.**
   *
   * John, 2026-08-10: *"the chained doors are a way the hunter can enter the room prior to the
   * player opening the interconnect … the hunter is much stronger and bangs away at the doors to
   * scare the players and eventually break its way in."*
   *
   * ⚠️ **WHICH DOORS THOSE ARE IS A MEASURED ANSWER, NOT AN ASSUMPTION, AND THE OBVIOUS ONE IS
   * WRONG.** The connectors whose STATE is literally `CHAINED` are the thirteen decoy EXIT SITES
   * — `b: 'outside'`, `CHAINED_DEFS`, `damageable: false`. Three separate things rule them out:
   *
   *   1. **They are `damageable: false`.** Nothing can force one, by construction. `escape.md`
   *      §2's whole first lesson is that force does not work on them.
   *   2. **Forcing one would break the win condition.** A chained site that can be opened is a
   *      second way out of the house, and `escape.mjs`'s 20/20 on `seed=s4` is exactly the gate
   *      that says there is only one. This mechanic must not be able to reach that.
   *   3. **They are on the EXTERIOR wall**, so a hunter walking the corridors cannot get to the
   *      far side of one without already being outdoors, which nothing in this build can do.
   *
   * What the player actually SEES wearing a chain and a padlock is a different set: `?tells=blind`
   * (the default) makes the dressing a seeded property of the connector and **never of its state**
   * — see `connectors.js` `connectorDressing` — so chains hang on ordinary BREACHABLE interior
   * panels too. Those are the doors this returns: shut, forcible, interior, and already the ones
   * `HunterAI._breach` has always known how to open. **The filter is the three flags, not the id.**
   *
   * ⚠️ **A DIG FACE IS NOT A DOOR.** `spec.free`/`spec.dig` rows are a continuous destructible
   * wall band, not a connector, and `dig.md` §2 gives the hunter its own way through those
   * (`hunterBreach`). Including them here would let the AI pick a 1.14 m bay as "the door" and
   * would put the two mechanics in each other's way.
   *
   * @param {string} spaceId  the room the noise came from
   * @returns {Array<{panel, id, name, inside, outside, centre: THREE.Vector3,
   *                  stand: THREE.Vector3, dist(v): number}>}
   *   `stand` is a point one standoff OUTSIDE the room, i.e. on the side the hunter has to work
   *   from. It is a point inside a real space, which is what `HunterAI._waypoint` needs — the
   *   panel's own centre sits in the wall band where `spaceAt` returns null and the BFS is blind.
   */
  const DOOR_STANDOFF = 1.45;
  function chainedDoorsOf(spaceId) {
    const inside = byId.get(spaceId);
    if (!inside) return [];
    const out = [];
    for (const p of panels) {
      const spec = p.spec;
      if (!spec || spec.free || spec.dig) continue;            // a dig band is not a door
      if (spec.a !== spaceId && spec.b !== spaceId) continue;
      const otherId = spec.a === spaceId ? spec.b : spec.a;
      const other = byId.get(otherId);
      if (!other) continue;                                    // `outside` — an exit site, not this
      if (!p.state.isDamageable()) continue;                   // chained EXIT: nothing forces it
      if (!p.state.canOpen()) continue;                        // a barrier is not a door
      if (!p.blocksMovement()) continue;                       // already open: not a door to force
      const c = p.root.position;
      // Toward the far room, along the wall's own normal. `sideOf` reads the sign off the
      // panel's rotation, so this is right for the half of the mansion whose walls run along Z
      // as well — the axis assumption that broke `_breach` at M2.
      const side = p.sideOf(_doorV.set(other.cx, c.y, other.cz));
      const n = p.normal.multiplyScalar(side * DOOR_STANDOFF);
      out.push({
        panel: p, id: p.id, name: spec.name ?? `THE DOOR TO ${other.name ?? otherId}`,
        inside: spaceId, outside: otherId,
        centre: new THREE.Vector3(c.x, 0, c.z),
        stand: new THREE.Vector3(c.x + n.x, 0, c.z + n.z),
      });
    }
    return out;
  }

  // ------------------------------------------------------------------ queries
  const _v = new THREE.Vector3();
  const _out = new THREE.Vector3();
  const _doorV = new THREE.Vector3();

  function spaceAt(v, pad = 0.6) {
    for (const s of spaces) {
      if (v.x >= s.x0 - pad && v.x <= s.x1 + pad && v.z >= s.z0 - pad && v.z <= s.z1 + pad) return s;
    }
    return null;
  }

  /**
   * Which spaces a segment could possibly touch. Six AABB tests instead of walking every
   * collider in the house — `_sense` calls `blocksSight` once per candidate per frame and the
   * session model eventually puts eight players in that loop.
   */
  const _seg = [];
  function spacesOnSegment(a, b) {
    _seg.length = 0;
    for (const s of spaces) if (segHitsBox(a, b, s.aabb)) _seg.push(s);
    if (!_seg.length) for (const s of spaces) _seg.push(s);
    return _seg;
  }

  /**
   * The live escape yard's walls, in world space, owned by `game/exterior.js` and handed over
   * whole on every plan change. Empty until an exterior exists, which is why nothing outdoors
   * collided before this: outside the house there are no spaces and therefore no colliders.
   */
  let _extSolids = [];
  function setExteriorSolids(boxes) { _extSolids = boxes ?? []; }

  /**
   * Static boxes plus whichever panels are still solid at this height, near this point.
   *
   * 🕳️ ⚠️ **`passH` USED TO BE THE LITERAL `1.7` AND MAKING IT A PARAMETER IS WHAT TURNS
   * `dig.js`'S LOW SEGMENT INTO A MECHANIC.** Every body in the house was 1.7 m tall to this
   * function, hunter included, so no opening could ever admit one body and refuse another by
   * height — a lintel at 1.80 m would have been walked under by a 4.42 m stage-3 hunter without
   * touching it. `rules.js` `PASS_H` is the table; see its note for why the hunter's number is
   * 2.40 and not its actual body height (every doorway in the house is 2.72).
   *
   * ⚠️ **AND IT IS INERT ON THE SHIPPED BUILD.** No collider in a `?dig=0` house has a base
   * between 1.70 and 2.40 — the lowest thing anything passes under is a 2.68 m connector's
   * lintel — so raising the hunter's number changes nothing there. That is asserted rather than
   * asserted-to: `harness/scenarios/dig-low.mjs` walks every collider in the arm-off build.
   */
  /**
   * 🪜 **THE STEP-UP, AND THE ONE THING IT MAY NOT STEP OVER.**
   *
   * `stepH` used to be the literal `0.3` written twice in the loop below. It is a parameter now
   * for exactly the reason `passH` became one: John's *"if the wall has just the bottom intact
   * because we attacked in the middle the wall can't be passed"* is a rule about the BOTTOM of an
   * opening, and a rule that only exists as a magic number cannot be given to one body and
   * withheld from another. `rules.js` `STEP_H` is the table and carries the whole decision.
   *
   * 🚨 **A BOX HOLDING BARRIER IS NEVER STEPPED OVER, AND THIS IS THE LINE THAT KEEPS THE CYAN
   * SETTLED.** `_macro`'s MACRO-1 rewrite made `gone` exactly `passable(i)` and `passable` false
   * wherever the barrier stands, so a body walking through cyan became *"unreachable by
   * construction rather than by margin"*. A raised step would have reopened it by a different
   * door — drop the box and the barrier in it goes with it — so a panel box is only steppable
   * when its own rect holds no barrier cell.
   *
   * ⚠️ **THE RECTS ARE INDEX-PARALLEL TO THE BOXES AND THAT IS LOAD-BEARING.** `wall.js`
   * `solidBoxes()` is one `for (const r of rects) out.push(box)` over `field.solidRects(forSight)`
   * with `forSight` false on this path, so box `k` IS rect `k`. That is what makes an exact answer
   * cheap: no world->UV inversion, no margin, just the barrier array over the rect the box was
   * built from. If that loop ever stops being one-to-one this must stop being an index.
   *
   * ⚠️ Cached on the field's own `_stamp`, which `_touch()` bumps on every write, so a whole dig
   * pays one scan per landed blow per face and a still house pays a integer compare.
   */
  const BASE_STEP = 0.30;
  /**
   * 🧪 THE ABLATION FOR THE LINE ABOVE, so the gate that protects the cyan can be **validated by
   * reintroducing the defect on every run** rather than only against working code — this file's
   * own standing rule, and the one that caught `mechanics`' first slow-frame check passing with
   * the fix reverted. `harness/scenarios/aim-step.mjs` S4 drives both arms and fails ITSELF if
   * turning the guard off does not let a body through the barrier. Never reachable from a key or
   * a URL; a scenario has to ask for it by name.
   */
  let _stepGuard = true;
  const _stepCache = new WeakMap();
  function steppableBoxes(q) {
    const f = q.field;
    if (!f) return null;                       // an ordinary panel: one box, no field, no barrier
    if (!_stepGuard) return null;              // the ablation: every box steppable, cyan included
    const hit = _stepCache.get(q);
    if (hit && hit.stamp === f._stamp) return hit.flags;
    const rects = f.solidRects(false);
    const flags = new Uint8Array(rects.length);
    for (let k = 0; k < rects.length; k++) {
      const r = rects[k];
      const cx0 = Math.max(0, Math.floor(r.u0 * f.cols));
      const cx1 = Math.min(f.cols - 1, Math.ceil(r.u1 * f.cols) - 1);
      const cy0 = Math.max(0, Math.floor(r.v0 * f.rows));
      const cy1 = Math.min(f.rows - 1, Math.ceil(r.v1 * f.rows) - 1);
      let clean = 1;
      for (let cy = cy0; clean && cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          if (f.barrier[f.idx(cx, cy)]) { clean = 0; break; }
        }
      }
      flags[k] = clean;
    }
    _stepCache.set(q, { stamp: f._stamp, flags });
    return flags;
  }

  /**
   * 🪜 **THE SILL THE LAST `collide()` STEPPED OVER, in world Y.** A side channel rather than a
   * second query on purpose: `boxesNear` is already walking exactly these boxes, and a separate
   * `sillAt()` would be a second pass over the same list every frame for one float. Written only
   * when `stepH` is above the shipped 0.30, so the hunter's and every scenario's path is
   * untouched. **Valid only immediately after a `collide()` call** — see `room.sillTop`.
   */
  let _sillTop = 0;
  const _boxes = [];
  function boxesNear(p, y, passH = PASS_H.robot, stepH = BASE_STEP, radius = 0) {
    _boxes.length = 0;
    const wantSill = stepH > BASE_STEP && radius > 0;
    // ⚠️ THE OUTSIDE IS NOT A SPACE, SO ITS WALLS CANNOT LIVE IN ONE. `spaceAt` returns null
    // everywhere outdoors and the loop below is driven entirely by `spaces` — so a yard's
    // boundary wall registered on any space would either be culled (the player is in no space)
    // or would collide from inside the room that owns it. They are a flat list, tested
    // unconditionally, and there are at most three of them because only the LIVE yard ever
    // registers any (see `exterior.js` `setPlan`).
    for (const b of _extSolids) {
      if (p.x < b.min.x - 2 || p.x > b.max.x + 2) continue;
      if (p.z < b.min.z - 2 || p.z > b.max.z + 2) continue;
      if (b.max.y > y + stepH && y + passH > b.min.y) _boxes.push(b);
    }
    const seen = new Set();
    for (const s of spaces) {
      if (p.x < s.aabb.min.x - 2 || p.x > s.aabb.max.x + 2) continue;
      if (p.z < s.aabb.min.z - 2 || p.z > s.aabb.max.z + 2) continue;
      for (const b of s.colliders) {
        // STEP HEIGHT. Anything whose top is under `stepH` is walked over, not walked into.
        // ⚠️ Measured before it was raised: the band (0.30, 1.00] m contains NO static collider
        // anywhere in the estate — the lowest is 1.05 m — so `STEP_H.robot` at 0.55 changes
        // nothing here. `harness/scenarios/aim-step.mjs` S3 re-takes that census on every run
        // rather than trusting this comment.
        if (b.max.y > y + stepH && y + passH > b.min.y) _boxes.push(b);
      }
      for (const q of s.panels) {
        if (seen.has(q.id)) continue;
        seen.add(q.id);
        /**
         * 🕳️ ⚠️ **A PANEL IS NO LONGER ONE BOX, AND THAT IS THE WHOLE OF WHAT PASSABILITY MEANS
         * ON A CONTINUOUS WALL.** `solidBoxes()` returns exactly `[q.box]` when an ordinary
         * panel blocks and `[]` when it does not — byte-identical for every shipped panel — and
         * the merged remainder of the material for a face that has a hole dug in it. The y
         * filter below is unchanged and is what makes a hole you cannot reach (a sill under
         * the step height is stepped over; a hole above `passH` is walked under) behave
         * correctly for free.
         *
         * 🪜 …and it is where John's *"just the bottom intact"* sill lives, which is why the step
         * is a parameter now. `steppableBoxes` is what keeps the barrier out of it.
         */
        const boxes = q.solidBoxes();
        const flags = stepH > BASE_STEP && boxes.length ? steppableBoxes(q) : null;
        for (let k = 0; k < boxes.length; k++) {
          const b = boxes[k];
          const st = (!flags || flags[k]) ? stepH : BASE_STEP;
          if (b.max.y > y + st && y + passH > b.min.y) { _boxes.push(b); continue; }
          // stepped over rather than walked into: how high did the foot have to come?
          if (wantSill && b.max.y > y + 1e-4 && b.max.y <= y + st) {
            const cx = Math.min(Math.max(p.x, b.min.x), b.max.x);
            const cz = Math.min(Math.max(p.z, b.min.z), b.max.z);
            const dx = p.x - cx, dz = p.z - cz;
            if (dx * dx + dz * dz < radius * radius && b.max.y > _sillTop) _sillTop = b.max.y;
          }
        }
      }
    }
    return _boxes;
  }

  /**
   * Circle vs AABB push-out in XZ. Cheap, stable, and enough for a house of boxes.
   *
   * 🕳️ ⚠️ **`passH` IS THE THIRD ARGUMENT AND IT USED TO BE IGNORED GARBAGE.** `player.js` was
   * calling `world.collide(_v, this.radius, this.pos)` — a third argument this function has
   * never had, left over from an older signature — so adding a real one here would have handed
   * the player a `Vector3` as its clear-height requirement. Fixed at the call site in the same
   * change; do not put it back.
   */
  function collide(pos, radius, passH = PASS_H.robot, stepH = BASE_STEP) {
    _sillTop = 0;
    _out.copy(pos);
    // A body in a doorway belongs to no space and is governed by the collider boxes alone,
    // which is correct. Clamping to the UNION rectangle would at best do nothing and at worst
    // trap an actor inside the bounding box of an L-shaped house.
    //
    // ⚠️ THE CLAMP IS TO THE CLEAR EXTENTS GROWN BY A WALL THICKNESS, **NOT** TO `sp.bounds`.
    // `sp.bounds` is inset 0.4 m to keep actors off the walls — and a 0.4 m inset SEALS EVERY
    // DOORWAY, because a doorway lives in the 0.30 m wall band OUTSIDE the clear extent. It
    // does not throw and it does not look like a bug: the player simply stops 0.4 m short of
    // the opening and slides along the wall, and the hunter does the same, which reads as bad
    // steering rather than as a wall you cannot pass. Measured: a robot at full run for 5 s
    // straight at the only door in the map never left the room it started in.
    //
    // Growing by WALL_T instead lets a body move into the wall band, where `spaceAt(pos, 0)`
    // returns null — no space owns the band — so the clamp switches itself off and the wall
    // colliders take over, which is precisely the behaviour the doorway needs. The body still
    // cannot get further than one wall thickness outside its own room while any clamp applies,
    // so this is still a real containment net and not a removal of one.
    const sp = spaceAt(_out, 0.0);
    if (sp) {
      _out.x = Math.min(sp.x1 + WALL_T, Math.max(sp.x0 - WALL_T, _out.x));
      _out.z = Math.min(sp.z1 + WALL_T, Math.max(sp.z0 - WALL_T, _out.z));
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const b of boxesNear(_out, _out.y, passH, stepH, radius)) {
        const cx = Math.min(Math.max(_out.x, b.min.x), b.max.x);
        const cz = Math.min(Math.max(_out.z, b.min.z), b.max.z);
        const dx = _out.x - cx, dz = _out.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          _out.x += (dx / d) * (radius - d);
          _out.z += (dz / d) * (radius - d);
        } else {
          // dead centre: push out along the shallowest axis
          const px = Math.min(_out.x - b.min.x, b.max.x - _out.x);
          const pz = Math.min(_out.z - b.min.z, b.max.z - _out.z);
          if (px < pz) _out.x += (_out.x < (b.min.x + b.max.x) / 2 ? -1 : 1) * (px + radius);
          else _out.z += (_out.z < (b.min.z + b.max.z) / 2 ? -1 : 1) * (pz + radius);
        }
      }
    }
    return _out;
  }

  const _end = new THREE.Vector3();
  /** Ray vs the world. Returns the nearest hit, naming the panel if it was one. */
  function castRay(origin, dir, maxDist = 60, opts = {}) {
    let best = null;
    _end.copy(origin).addScaledVector(dir, maxDist);
    const test = (b, panel) => {
      const h = rayBox(origin, dir, b);
      if (h == null || h < 0 || h > maxDist) return;
      if (!best || h < best.distance) {
        best = {
          distance: h, panel: panel ?? null, furn: b._furn ?? null,
          partId: b._furnPart ?? null,
          point: origin.clone().addScaledVector(dir, h),
          normal: boxNormal(b, origin, dir, h),
        };
      }
    };
    const seenP = new Set();
    for (const s of spacesOnSegment(origin, _end)) {
      for (const b of s.colliders) test(b, null);
      for (const p of s.panels) {
        if (seenP.has(p.id)) continue;
        seenP.add(p.id);
        // a beam-stage wall does not stop a bullet, but it is still a target — so it is
        // traced when we are looking for something to shoot and skipped when we are not
        //
        // ⚠️ `|| blocksProjectile()` IS NOT A WIDENING — it is IDENTICAL for every entry in
        // `STAGE_DEFS` (damageable and blocksShots are both true at stages 0-2, damageable is
        // true at beam, and both are false at open), and it is verified as identical rather
        // than assumed. What it fixes is a stage that `STAGE_DEFS` does not contain and
        // `spaces.js`'s `CHAINED_DEFS` does: SOLID BUT NOT DAMAGEABLE. Under the old test a
        // chained exit was skipped by the damage trace entirely, so a shot at a padlocked door
        // passed straight through it and hit the void behind — no chip, no impact, no sound,
        // which reads as the gun being broken rather than as the door being solid. "Can I
        // damage this" and "does this stop a bullet" are different questions and the trace has
        // to stop for either.
        // 🕳️ On a free face the trace has to stop on what is STILL THERE, not on the panel's
        // whole extent — otherwise a shot aimed through a hole you dug hits the wall you removed
        // and the gun reads as broken. `traceBoxes` carries the gate that used to be written out
        // here (`isDamageable() || blocksProjectile()`), unchanged, so an ordinary panel is
        // traced exactly as it was.
        for (const b of p.traceBoxes(opts.forDamage)) test(b, p);
      }
    }
    return best;
  }

  function blocksSight(a, b) {
    const dir = _v.copy(b).sub(a);
    const dist = dir.length();
    if (dist < 1e-4) return false;
    dir.multiplyScalar(1 / dist);
    const seenP = new Set();
    for (const s of spacesOnSegment(a, b)) {
      for (const c of s.colliders) {
        // Movement-only boxes (intro chairs) must not yank a ringside camera inside the ring.
        if (c._noSight) continue;
        const h = rayBox(a, dir, c); if (h != null && h > 0 && h < dist) return true;
      }
      for (const p of s.panels) {
        if (seenP.has(p.id)) continue;
        seenP.add(p.id);
        // 🕳️ `sightBoxes()` is `[box]` when an ordinary panel blocks sight and `[]` when it does
        // not — unchanged — and the standing remainder for a face with a hole in it, so a
        // sightline through a hole you dug is a sightline and one into plaster beside it is not.
        for (const b of p.sightBoxes()) {
          const h = rayBox(a, dir, b);
          if (h != null && h > 0 && h < dist) return true;
        }
      }
    }
    return false;
  }

  // ------------------------------------------------------------------ residency
  //
  // RENDER ONLY. See the header. A space that leaves the set stays visible for HOLD seconds,
  // for the same reason the awareness ladder has hysteresis: a threshold crossed going up is
  // not the same threshold going down, and a room that blinks reads as broken.
  // 13.0, NOT 16.0 — §5.2's one sanctioned knob, applied because A8 measured 4 visible spaces
  // over a run of the outer ring against a budget of 3.
  //
  // ⚠️ AND IT IS NOT ENOUGH ON ITS OWN, WHICH IS A FACT ABOUT THE FLOOR PLAN RATHER THAN ABOUT
  // THIS NUMBER. The ballroom is a hub with THREE doors in one wall — D4, D5 and D6 at
  // x = -8.6 / 0 / +8.6 — and from `ballroom.north` they are 8.9 m, 2.3 m and 8.9 m away and
  // all three are in front of the camera. Four spaces resident from the middle of the ballroom
  // is therefore geometrically CORRECT: you really can see into three rooms at once from
  // there, and any distance that hides one of them would pop a room the player is looking
  // through. A cap below ~8.5 m is the only thing that would satisfy a hard 3, and §5.2 itself
  // says a cap "can hide a room you are looking into, which is a worse artefact than a draw
  // call". The budget exists to protect draw calls; the perf gate is the measurement that
  // actually protects them, and it passes with room to spare. Reported, not silently widened.
  const PORTAL_VIS_DIST = 13.0;
  const HOLD = 0.25;
  const _resident = new Set();
  let _cur = spaces[0] ?? null;
  let _lastT = 0;

  /**
   * ------------------------------------------------------------------ loose objects
   *
   * 🚨 **RESIDENCY GOVERNED THE HOUSE AND NOT ONE THING STANDING IN IT, AND THAT WAS THE WHOLE
   * DRAW-CALL OVERRUN** (`calls-1`, 2026-08-09).
   *
   * Every space root is switched by `setViewpoints` below, so a room you cannot see costs
   * nothing. But the six
   * world gadget pickups (`limbs.js` `spawnGadget`, and the sledgehammer in `views/game.js`)
   * are parented to the SCENE — exactly like the player and the hunter — so residency never
   * had an opinion about them and the only thing removing them was the view frustum. From the
   * middle of a 36 m house that removes almost nothing.
   *
   * Attributed per draw call rather than by ablation: `harness/scenarios/_calls1-who.mjs`
   * wraps `WebGLRenderer.renderBufferDirect`, which IS the draw call, so the table below sums
   * to `renderer.info.render.calls` exactly. Seed s4, `?walls=instanced`, `ballroom.south`:
   *
   *     pickup.oil     205 = 148 main +  57 shadow    lying in the SERVICE PASSAGE, 21 m away
   *     pickup.ball    134 =  68 main +  66 shadow    lying in the GALLERY, 34 m away
   *     pickup.skates   90 =  90 main +   0 shadow    lying in the ballroom — genuinely here
   *     pickup.nailgun  69 =  39 main +  30 shadow    lying in the GALLERY
   *     pickup.grapple  39 =  39 main +   0 shadow    lying in the CHAPEL, through two rooms
   *     pickup.sledge   18 =   9 main +   9 shadow    lying in STUDY_W
   *     ---------------------------------------------------------------------------------
   *     555 of that station's 689 calls — and the whole ported 9.6 m BALLROOM was 20 of them.
   *
   * 🎯 **SO THE OVERRUN WAS NEVER THE BALLROOM.** Every ROOM in the house prices out at 10-21
   * calls including its estate order, because `GeoBin` merges each bucket into one mesh. A
   * gadget prices out at 39-205 because it is ~150 individually-materialled sub-meshes built
   * for a studio showcase. That is HANDOFF's own standing warning — *"the skate drift trail
   * cost +82 calls for 76 sprites"* — at six times the size.
   *
   * From `ballroom.south` the only resident space IS the ballroom, so five of those six were
   * drawn into rooms whose floors, walls and ceilings are switched off. That is not a trade
   * being made here: an object drawn where its room is not is either invisible (pure waste) or
   * visible (a prop floating in a void, which is the bug `views/game.js` already records from
   * John's playthrough as "two lit robots in blackness"). Gating them on the same residency
   * answer their room gets is the rule the rest of the house already follows.
   *
   * ⚠️ **THE TEST IS "ANY SPACE THAT COULD CONTAIN IT IS RESIDENT", NOT "ITS SPACE".** Same
   * conservatism a panel gets in `setViewpoints` (`a.visible || b.visible`): an item resting in
   * a doorway or
   * inside a wall band is within `LOOSE_PAD` of two spaces, and hiding it because the first one
   * in the list is not resident would pop loot the player is walking toward. An item in NO
   * space is outside the house — the escape yard — and is never this function's business.
   *
   * ⚠️ **THE PLAYER AND THE HUNTER ARE NOT IN THE REGISTRY AND MUST NEVER BE.** They are
   * scene-parented for the same reason and are exactly what `views/game.js`'s residency note
   * says must keep drawing. This is opt-in: only `limbs.js`'s loose pool is tracked, wired in
   * `views/game.js` off `LimbField`'s existing `onDrop`/`onTake` hooks, which are the single
   * choke points for an item entering and leaving the world.
   */
  const LOOSE_PAD = 0.6;                       // `spaceAt`'s own default, for the same reason
  /**
   * 🚨 **AN ENTRY CARRIES A LIVENESS PREDICATE, AND WITHOUT IT THIS IS A BUG WAITING FOR A KILL.**
   * `hunter-ai.js` `absorb()` reparents a limb onto the hunter's model and sets `held` /
   * `attachedTo` — but it never calls `field.take()`, so the item is still in `LimbField.items`
   * and still registered here. The instant it is reparented, `root.position` stops being a world
   * coordinate and becomes hunter-LOCAL, so an unguarded cull would be testing a torso-relative
   * offset against the floor plan and could hide the limb during the pull-in that
   * `hunter-ai.js` says the audience has to see. `views/game.js` passes `() => it.inWorld`.
   */
  const _loose = new Map();                    // Object3D -> { live: (() => boolean) | null, hid: bool }
  /**
   * ⚠️ `?loose=0` IS A COMPLETE REVERT AND IT EXISTS BECAUSE THIS PROJECT'S RULE IS THAT A
   * CHANGE SHIPPING WITHOUT AN ABLATION CANNOT BE JUDGED LATER. There is exactly one piece of
   * state and `setLooseCull()` flips it inside ONE frozen page, so the look A/B never has to
   * compare two page loads — the failure `wallinstances.js` and `_ap1-sided.mjs` both record.
   */
  let _looseCull = (typeof location !== 'undefined'
    ? new URLSearchParams(location.search).get('loose') : null) !== '0';
  /**
   * 🛩️ Is the roof on. Shipped state is `true` and nothing in `src/` writes it except
   * `setLid()`, which only `views/game.js`'s `[F]` fly-over calls. See `setLid` in the
   * interface below for why this is geometry and nothing else.
   */
  let _lidOn = true;
  const _lidCount = () => spaces.reduce((n, s) => n + (s._lid?.length ?? 0), 0);
  /**
   * 🚨 **IT HIDES THE MESHES AND LEAVES THE LIGHTS, AND THAT IS NOT TIDINESS — IT IS THE WHOLE
   * DIFFERENCE BETWEEN THIS FIX AND A SHADER STALL.**
   *
   * The first build set `visible = false` on the holder. That is one line and it is wrong: a
   * gadget carries its own `PointLight` (`gadgets/index.js` — the nail gun's pilot at 0.5·H, the
   * ball's at 1.0·H), three collects lights with `traverseVisible`, so hiding the holder takes
   * the light out of the array and moves **`numPointLights`** — the field `views/game.js` says
   * in capitals *"a count the renderer has never compiled for RECOMPILES EVERY VISIBLE
   * MATERIAL"*, priced by `perf-stall-1` at +132 programs and named in HANDOFF as John's
   * five-second freeze.
   *
   * **Measured, and it is why this paragraph exists** (`harness/scenarios/_calls1-lights.mjs`,
   * twelve stations, no flips, `renderer.info.programs.length` start to finish):
   *
   * | build | point-light counts met | programs over the walk |
   * |---|---|---|
   * | `?loose=0` (pre-change) | 13, 14 | 213 -> 213, **+0** |
   * | holder-hiding (first build) | 6, 8, 9, 10 | 232 -> 284, **+52** |
   * | **meshes-only (this one)** | 13, 14 | 213 -> 213, **+0** |
   *
   * ⚠️ **AND THE OBVIOUS PROBE MISSED IT.** Flipping the cull at a settled station and reading
   * the counter either side reported "identical at all twelve" — because residency had already
   * paid the arrival compile before the first read, and flipping back only ever revisited counts
   * already built. **A flip A/B at a settled station is structurally blind to a cost paid on
   * arrival.** The two-arm no-flip walk above is the form that sees it.
   *
   * Hiding the meshes removes every draw call and every shadow draw — `projectObject` skips an
   * invisible object for both lists — while the light stays in the array exactly as it was
   * before this change. The list is built once here, not walked per frame.
   */
  function trackLoose(obj, live = null) {
    if (!obj) return obj;
    const drawn = [];
    obj.traverse((o) => { if (o.isMesh || o.isSprite || o.isPoints || o.isLine) drawn.push(o); });
    _loose.set(obj, { live, hid: false, drawn });
    return obj;
  }
  function untrackLoose(obj) {
    /**
     * ⚠️ **RESTORE ON THE WAY OUT, AND ONLY WHAT WE TOOK.** An item that is picked up is
     * re-parented onto a body and never passes through `cullLoose` again, so a `visible = false`
     * left behind on it is a gadget that fits, fires, and cannot be seen — a defect that would
     * only appear when the player collected it from a room they had walked out of. `hid` is
     * checked rather than assumed so this can never overwrite a `false` some other system set.
     */
    if (!obj) return;
    const e = _loose.get(obj);
    if (e?.hid) _show(e, true);
    _loose.delete(obj);
  }
  /** Write the state onto the item's DRAWN descendants only — never onto a light. See `trackLoose`. */
  function _show(e, on) {
    for (const m of e.drawn) m.visible = on;
    e.hid = !on;
  }
  function cullLoose() {
    for (const [o, e] of _loose) {
      // Not loose any more (absorbed, held, fitted) — hand it straight back to its new owner.
      if (!_looseCull || (e.live && !e.live())) {
        if (e.hid) _show(e, true);
        continue;
      }
      const p = o.position;
      let inside = false, seen = false;
      for (const s of spaces) {
        if (p.x < s.x0 - LOOSE_PAD || p.x > s.x1 + LOOSE_PAD) continue;
        if (p.z < s.z0 - LOOSE_PAD || p.z > s.z1 + LOOSE_PAD) continue;
        inside = true;
        if (s.visible) { seen = true; break; }
      }
      // Only write on a CHANGE: this is up to 161 booleans for one gadget, and residency runs
      // every frame while the answer changes a handful of times in a whole run.
      const vis = seen || !inside;
      if (e.hid !== !vis) _show(e, vis);
    }
  }

  /**
   * Split screen means N viewports and the residency set for N viewpoints is the UNION, so
   * this is the real signature and `setViewpoint` is the one-viewpoint wrapper. Writing it the
   * other way round costs nothing now and is a rewrite later.
   */
  function setViewpoints(views, dt = 0.016) {
    _resident.clear();
    for (const vp of views) {
      const here = spaceAt(vp.pos) ?? _cur;      // null in a doorway: keep the previous
      if (here) { _cur = here; _resident.add(here); }
      if (!here) continue;
      for (const p of portals()) {
        if (p.a === p.b) continue;
        if (p.a !== here.id && p.b !== here.id) continue;
        const other = byId.get(p.a === here.id ? p.b : p.a);
        if (!other) continue;
        const dx = p.centre.x - vp.pos.x, dz = p.centre.z - vp.pos.z;
        if (Math.hypot(dx, dz) > PORTAL_VIS_DIST) continue;
        if (vp.dir && (dx * vp.dir.x + dz * vp.dir.z) < -0.35 * Math.hypot(dx, dz)) continue;
        _resident.add(other);
      }
    }
    for (const s of spaces) {
      if (_resident.has(s)) { s._hold = HOLD; s.visible = true; }
      else if (s._hold > 0) { s._hold -= dt; s.visible = true; }
      else s.visible = false;
      s.root.visible = s.visible;
    }
    // A panel is visible if EITHER of the spaces it joins is resident, so a hole in a wall
    // never disappears while you are looking through it.
    for (const p of panels) {
      const a = byId.get(p.spec.a), b = byId.get(p.spec.b);
      p.root.visible = !!((a && a.visible) || (b && b.visible));
      /**
       * ⚠️ THE EFFECTIVE ANSWER, CACHED FOR THE INSTANCE SYNC — AND IT IS NOT THE LINE ABOVE.
       * A panel is a child of ONE of the two spaces it joins, so a `root.visible = true` on a
       * panel whose owning space is hidden draws nothing: three.js walks the parent chain. The
       * instanced meshes hang off the ROOM root and have no such parent, so they have to be
       * told the same thing the parent chain says, or the instanced build draws panels the
       * legacy build does not and the A/B measures my bookkeeping instead of the picture.
       */
      p.wantVisible = p.root.visible && !!(p.ownerSpace?.visible ?? true);
    }
    /**
     * ⚠️ HERE, NOT IN `LimbField.update()`, AND THE REASON IS ONE FRAME. `views/game.js` runs
     * `limbField.update` at the top of its tick and `setViewpoints` near the bottom, so gating
     * from inside the field would answer with the PREVIOUS frame's residency — and the frame
     * where that is wrong is the frame you walk through a door, which is the only frame anybody
     * would ever notice. Residency decides and disposes in the same instant, for panels and for
     * the things lying on the floor alike.
     */
    cullLoose();
    instances?.sync();
    return _resident.size;
  }
  function setViewpoint(pos, dir, dt) { return setViewpoints([{ pos, dir }], dt); }
  function visibleSpaces() { return spaces.filter((s) => s.visible).length; }


  /**
   * ------------------------------------------------------------------ instancing
   *
   * Built AFTER the panels and BEFORE anything reads `room`, and parented to the room root
   * rather than to a space, because a pristine panel has to be drawn from whichever side is
   * resident and a space root would gate it on the wrong one.
   *
   * ⚠️ AND THE WARM-UP COVERS IT FOR FREE, WHICH IS THE WHOLE REASON PROMOTION IS CHEAP.
   * `views/game.js` opens its load-time lap with `scene.traverse(o => o.visible = true)` and
   * renders every space four ways at four light counts. So the pristine face's program AND
   * every per-panel layer plane's program and vertex buffers are built during the loading
   * screen exactly as they were before this change — a promoted panel is drawing meshes that
   * have already been drawn, so it cannot pay the first-draw GPU upload HANDOFF measured at
   * 33 ms for a space becoming resident for the first time. Measured on the promotion frame
   * specifically rather than assumed; see the report.
   */
  const instances = MODE === WALL_MODE.INSTANCED && panels.length
    // ⚠️ `demote` IS THE SIXTH PIECE OF STATE `?dig=1` OWNS — see the flag's own note above. The
    // mechanism is inert without a panel that can never open (`wall.js` `spent`), so gating the
    // CONSTRUCTION on the flag is belt to that braces: with `?dig=0` the spent materials are
    // never baked and the spent meshes never exist, so the arm-off build does not pay even a
    // shader compile for it.
    /**
     * 🕳️ **`demote` IS A `bays`-ONLY COST NOW.** Demotion exists for a panel whose picture is a
     * CONSTANT — `wall.js` `spent` — and a free face never is: every cell can still be dug and
     * the house-wide unlock can still turn its barrier off underneath it. So in free mode the
     * five spent meshes per aperture group would be built, compiled and never drawn. Gating it
     * here rather than relying on `spent` returning false is the same belt-and-braces the flag
     * already used: with the mechanism unreachable, do not pay for its shaders either.
     */
    ? new PanelInstances(panels, root, { revealMaterial: mats.reveal, demote: DIG_MODE === 'bays' })
    : null;

  /**
   * 🕳️ ⚠️ **THE BFS CACHE HAS TO DIE ON A BLOW, NOT ONLY ON A STAGE CHANGE — AND THIS WRAP HAS
   * TO BE AFTER `PanelInstances`, WHICH ASSIGNS `onPromote` OUTRIGHT.**
   *
   * On a free face passability comes off the damage grid, so a hole can become person-sized
   * without the stage table moving at all — and `pathPortals` caches by (from, to, minW, minH).
   * A stale route through a wall that is now open is a hunter that walks the long way round
   * forever; a stale route through one that is not is a hunter pressing into plaster. Neither
   * throws. `onPromote` is the one hook guaranteed to fire on every landed blow (`wall.js`
   * `applyHit`), so it is the right place — but `wallinstances.js` sets it with `=` for every
   * panel it owns, so wrapping before that silently loses the wrap and the failure is invisible.
   */
  for (const p of panels) {
    if (!p.spec?.free) continue;
    const prev = p.onPromote;
    p.onPromote = (self) => {
      pathCache.clear();
      prev?.(self);
      /**
       * 🕳️ **THE UNLOCK FIRES WHEN A BODY CAN ACTUALLY GET THROUGH THE INTERCONNECT — not when
       * a texel reaches depth 1.** John's sentence is *"once the interconnect is ACCESSED by a
       * player"*, and a peephole is not access. `blocksMovement()` is the same channel query the
       * collider is made of, so the moment the house opens is exactly the moment the wall stops
       * refusing a body, and the two can never disagree about which frame that was.
       */
      if (dig.link.has(self.id) && !dig.opened.size && !self.blocksMovement()) {
        unlockBarrier(self.spec.edge, self.id);
      }
    };
  }

  /**
   * 🖼️ **THE ROOM'S DRESSING BECOMES PART OF THE WALL — `src/game/skin.js`.**
   *
   * John: *"from the inside of the room the destructive wall IS the room asset — only when they
   * damage it can they see its white underneath. I don't want it to disappear in one hit."*
   * A gallery portrait used to hang in front of a breach because the canvas did not know the wall
   * behind it was gone; the skin subdivides every piece of dressing standing on a destructible
   * face and takes it away per cell, with the damage grid, at **+0 draw calls**.
   *
   * ⚠️ **HERE, AND NOT EARLIER, FOR TWO REASONS.** It needs the panels (they are the faces) and it
   * needs `PanelInstances` to have already taken its copy of every pristine face — the instanced
   * arm authors its own geometry from `wall.js`'s exported builders and never from a room bin, so
   * nothing this rewrite touches can reach it, but the ORDER is what makes that true by
   * construction rather than by argument.
   *
   * ⚠️ **AND IT IS IN THE CONSTRUCTOR, NEVER LAZILY ON FIRST DAMAGE** — `coatbake-1`'s rule. The
   * geometry rewrite has to happen before the buffers are on the GPU, or the first hammer blow on
   * a gallery wall pays a full re-upload of a 15 000-triangle bin.
   */
  const skin = buildSkin({ panels, warn: (...a) => console.warn(...a) });

  /**
   * 🪑 Collidable / sledge-destructible furniture (`docs/slices/task-furn-destruct.md`).
   * Registered by `views/game.js` after the room builds; colliders live on `space.colliders`
   * (always live, same as walls). `castRay` returns `furn` when the nearest hit is one of these.
   */
  const furnProps = [];
  function _dropFurnCollider(fp) {
    if (!fp || fp._colDropped) return;
    // Cladding never drops — building fabric (`task-furn-local.md`).
    if (fp.kind === 'fireplace' && fp.field) return;
    const sp = spaces.find((s) => s.id === fp.spaceId);
    const arr = sp?.colliders;
    if (arr) {
      const drop = (b) => {
        const i = arr.indexOf(b);
        if (i >= 0) arr.splice(i, 1);
      };
      if (fp.box) drop(fp.box);
      for (const b of fp.partBoxes ?? []) drop(b);
      for (const p of fp.parts ?? []) if (p.box) drop(p.box);
    }
    fp._colDropped = true;
  }
  function _dropFurnPartBox(fp, part) {
    if (!fp || !part?.box) return;
    const sp = spaces.find((s) => s.id === fp.spaceId);
    const arr = sp?.colliders;
    if (!arr) return;
    const i = arr.indexOf(part.box);
    if (i >= 0) arr.splice(i, 1);
  }
  function _restoreFurnCollider(fp) {
    if (!fp) return;
    const sp = spaces.find((s) => s.id === fp.spaceId);
    if (!sp) return;
    const add = (b) => {
      if (b && !sp.colliders.includes(b)) sp.colliders.push(b);
    };
    if (fp.parts?.length) {
      for (const p of fp.parts) {
        if (!p.alive || !p.box) continue;
        p.box._furn = fp;
        p.box._furnPart = p.id;
        add(p.box);
      }
      fp._rebuildUnion?.();
      if (fp.box) fp.box._furn = fp;
    } else if (fp.box) {
      // Fireplace cladding: always restore the building collider.
      add(fp.box);
      fp.box._furn = fp;
    }
    fp._colDropped = false;
  }
  function registerFurn(fp) {
    if (!fp) return fp;
    const sp = spaces.find((s) => s.id === fp.spaceId) ?? null;
    fp.box && (fp.box._space = sp);
    const add = (b, partId) => {
      if (!b || !sp) return;
      b._furn = fp;
      b._space = sp;
      if (partId) b._furnPart = partId;
      if (!sp.colliders.includes(b)) sp.colliders.push(b);
    };
    if (fp.parts?.length) {
      for (const p of fp.parts) {
        if (p.box) add(p.box, p.id);
      }
      fp._rebuildUnion?.();
      if (fp.box) fp.box._furn = fp;
    } else if (fp.box) {
      add(fp.box, null);
    } else {
      return fp;
    }
    fp._colDropped = false;
    const prevBreak = fp.onBreak;
    fp.onBreak = (prop, info) => {
      _dropFurnCollider(prop);
      prevBreak?.(prop, info);
    };
    // Part break drops only that AABB (assembly stays).
    const prevPart = fp.onPartBreak;
    fp.onPartBreak = (prop, part, info) => {
      _dropFurnPartBox(prop, part);
      prevPart?.(prop, part, info);
    };
    furnProps.push(fp);
    return fp;
  }
  function resetFurn() {
    for (const fp of furnProps) {
      fp.reset();
      _restoreFurnCollider(fp);
    }
  }
  function clearFurn() {
    for (const fp of furnProps) {
      _dropFurnCollider(fp);
      if (fp.mesh?.parent) fp.mesh.parent.remove(fp.mesh);
      fp.mesh?.geometry?.dispose?.();
    }
    furnProps.length = 0;
  }

  // ------------------------------------------------------------------ interface
  const bounds = {
    minX: Math.min(...spaces.map((s) => s.bounds.minX)),
    maxX: Math.max(...spaces.map((s) => s.bounds.maxX)),
    minZ: Math.min(...spaces.map((s) => s.bounds.minZ)),
    maxZ: Math.max(...spaces.map((s) => s.bounds.maxZ)),
  };

  const room = {
    root, floorY: 0, bounds, panels, spaces, materials: mats,
    /**
     * 🖼️ **THE ERODABLE DRESSING, OR `null` ON `?skin=0`.** `views/game.js` `onChunk` drives it
     * (`skin.erode(panel)` -> the piece that left) and pays the fall out of the debris pool it
     * already owns. A probe reads `room.skin.stats()`; nothing else in `src/` touches it.
     */
    skin,
    /**
     * 🪑 Sledge-destructible furniture. `registerFurn` / `resetFurn` / `clearFurn` are the
     * only mutators — `views/game.js` owns spawn; this owns collider lifetime.
     */
    furnProps,
    registerFurn,
    resetFurn,
    clearFurn,
    /** which arm of `?walls=` this build is, and the instancing census a probe asserts on */
    wallMode: MODE,
    /**
     * 🆕 **WHICH ARM OF `?estate=` THIS BUILD IS — READ OFF THE BUILD, NEVER OFF THE URL.**
     * Same rule as `dig` below: a probe that parses its own query string is testing the string
     * it typed. `views/game.js` hangs the merged fixture rig on `plans`, so an arm that
     * half-applied would show up as a rig with nothing to hang on rather than as a silent
     * difference in a capture.
     */
    estate: PORT ? {
      on: true, order: hasOrder,
      /**
       * 🆕 Two separate booleans, because the two orders load through two dynamic imports and a
       * probe has to be able to tell "the study arm is off" from "the study module failed to
       * import and the room silently fell back to boxes". They are also what `views/game.js`
       * gates each fixture rig on, so an arm that half-applied shows up as a rig with nothing to
       * hang on rather than as a difference in a capture nobody attributes.
       */
      study: hasStudy,
      /** 🆕 the third order, and the same "did the import land" question. */
      ballroom: hasBall,
      orders: Object.fromEntries(spaces.filter((s) => s.order && s.orderPlan).map((s) => [s.id, s.order])),
      plans: Object.fromEntries(spaces.filter((s) => s.orderPlan).map((s) => [s.id, s.orderPlan])),
      surfaces: !!mats.estate,
    } : null,
    panelInstances: instances,
    /**
     * ⚠️ WHICH ARM OF `?dig=` THIS BUILD IS — read off the BUILD, never off the URL. A probe
     * that parses its own query string is testing the string it typed; `dig-toggle.mjs` asserts
     * on this and on the counts below, so an arm that half-applied would be visible.
     */
    dig: DIG,
    /** The brick, as world boxes. Empty with the flag off. A probe's proof that it is there. */
    barriers: barriers.map((s) => ({
      space: s.space, edge: s.edge, side: s.side,
      min: [s.x - s.w / 2, s.y - s.h / 2, s.z - s.d / 2],
      max: [s.x + s.w / 2, s.y + s.h / 2, s.z + s.d / 2],
    })),
    /**
     * THE DIG CENSUS — what a segment can and cannot become, asked of the built world.
     *
     * `canOpen` is the load-bearing one: `WallState.canOpen()` asks whether ANY stage of this
     * panel's table stops blocking movement, and for a dig segment the answer is no at every
     * stage from either side. That is `dig.md` §5's "you cannot meet in the middle" as an
     * assertion rather than as a level-design promise.
     */
    digCensus() {
      const seg = panels.filter((p) => p.spec?.dig);
      const byStage = new Array(DIG_DEFS.length).fill(0);
      for (const p of seg) byStage[Math.min(p.state.stage, byStage.length - 1)]++;
      /**
       * 🕳️ THE FREE-FORM SUMMARY, read off the BUILD and off the damage grids — never off a URL
       * and never off a second bookkeeping structure. `channel` is the same query the collider
       * is made of, so a probe asserting on `passable` is asserting on what a body would meet.
       */
      const free = seg.filter((p) => p.spec?.free).map((p) => {
        const ch = p.openChannel();
        const st = p.field?.stats() ?? null;
        return {
          id: p.id, edge: p.spec.edge, span: p.spec.seg, side: p.spec.side,
          w: +p.width.toFixed(2), h: +p.height.toFixed(2),
          grid: st ? `${st.cols}x${st.rows}` : null,
          hits: st?.hits ?? 0,
          maxDepth: +(st?.maxDepth ?? 0).toFixed(3),
          meanDepth: +(st?.meanDepth ?? 0).toFixed(4),
          openCells: st?.openCells ?? 0,
          seeCells: st?.seeCells ?? 0,
          barrierCells: st?.barrierCells ?? 0,
          channelW: +ch.width.toFixed(2), channelH: +(ch.height ?? 0).toFixed(2),
          passable: !!ch.open,
          boxes: p.solidBoxes().length,
          link: dig.link.has(p.id),
        };
      });
      return {
        on: DIG,
        mode: DIG_MODE,
        free,
        freeFaces: free.length,
        freePassable: free.filter((f) => f.passable).length,
        segments: seg.length,
        edges: [...new Set(seg.map((p) => p.spec.edge))],
        barriers: barriers.length,
        byStage,
        atBarrier: seg.filter((p) => p.state.stage >= DIG_DEFS.length - 1).length,
        canOpen: seg.filter((p) => p.state.canOpen()).length,
        others: panels.filter((p) => !p.spec?.dig).length,
        othersCanOpen: panels.filter((p) => !p.spec?.dig && p.state.canOpen()).length,
        // ---- the interconnect, the unlock and the crossing, read off the BUILD
        unlockMode: dig.unlock,
        link: [...dig.link],
        /** how many segments can ever become a route. 2 before the unlock, 36 after. */
        linkCount: seg.filter((p) => p.state.canOpen()).length,
        unlocked: dig.opened.size > 0,
        openedEdges: [...dig.opened],
        unlockedBy: dig.unlockedAt,
        hunterCrossing: dig.hunterCrossing,
        hunterBreached: [...dig.breached].map(([k, v]) => `${k}@${v.w.toFixed(2)}x${v.h.toFixed(2)}`),
        /** brick still standing, as colliders. 36 pristine, 34 once a plan is applied. */
        brickStanding: [...brickOf.values()].filter((r) => !r.dropped).length,
        segmentH: seg[0]?.height ?? null,
        open: seg.filter((p) => !p.blocksMovement()).length,
        spent: seg.filter((p) => p.spent).length,
      };
    },
    /** See `setDigPlan` / `unlockBarrier` / `hunterBreach` above. All inert with `?dig=0`. */
    setDigPlan, unlockBarrier, hunterBreach,
    onBarrierUnlock(fn) { _onUnlock.add(fn); return () => _onUnlock.delete(fn); },
    /** The ablation for the crossing: turn the beat off inside one frozen page. */
    setHunterCrossing(on) { dig.hunterCrossing = !!on && DIG; return dig.hunterCrossing; },
    digCanHunterCross(p) { return dig.on && dig.hunterCrossing && !!p?.spec?.dig; },
    /**
     * SWITCH ARMS WITHOUT RELOADING. Every piece of state the mode implies, in one place:
     * the per-panel `occludeLayers` flag, whether the shared instances draw, and a `_apply()`
     * to make the layer visibilities agree with the flag that was just changed. A toggle that
     * leaves one of those behind is the `?cam=r10` failure and it would silently contaminate
     * the very A/B it exists to make possible.
     *
     * ⚠️ Reachable from a build that HAS instances. `?walls=legacy` never constructs them, so
     * from there only `legacy` and `occlude` are reachable and this reports what it did.
     */
    setWallMode(mode) {
      const m = wallMode(mode);
      const got = (m === WALL_MODE.INSTANCED && !instances) ? WALL_MODE.OCCLUDE : m;
      for (const p of panels) p.occludeLayers = got !== WALL_MODE.LEGACY;
      instances?.enable(got === WALL_MODE.INSTANCED);
      for (const p of panels) if (!p.instanced) p._apply();
      room.wallMode = got;
      return got;
    },
    /**
     * DEMOTION'S OWN ABLATION — flip it inside ONE frozen frame, never across two page loads.
     * See `wallinstances.enableDemote`. Returns what it actually did, because a build without
     * the spent groups (`?dig=0`, or `?walls=legacy`) cannot turn it on.
     */
    setDemote(on) { return instances?.enableDemote(on) ?? false; },
    panelCensus() {
      let ownMeshes = 0, visiblePanels = 0, pristine = 0, spent = 0;
      for (const p of panels) {
        if (p.pristine) pristine++;
        if (p.spent) spent++;
        if (!p.wantVisible) continue;
        visiblePanels++;
        for (const l of p.layers) if (l.visible) ownMeshes++;
        if (p.reveal.visible) ownMeshes++;
      }
      return {
        mode: MODE, panels: panels.length, pristine, spent, visiblePanels, ownMeshes,
        instanced: instances ? instances.census() : null,
      };
    },
    storey: spaces[0]?.storey ?? 4.8,
    get colliders() { return spaces.flatMap((s) => s.colliders); },
    collide, castRay, blocksSight, setExteriorSolids,
    /**
     * 🪜 The height of the tallest sill the LAST `collide()` call stepped over, world Y, 0 if
     * none. Only ever non-zero for a caller that passed a `stepH` above the shipped 0.30 — see
     * `boxesNear`. `Player.update` reads it the frame it calls `collide`; nothing may cache it.
     */
    sillTop() { return _sillTop; },
    /** 🧪 See `_stepGuard`. Returns the new setting. For `aim-step.mjs` S4 and nothing else. */
    setStepGuard(on) { _stepGuard = !!on; return _stepGuard; },
    /**
     * 🪜 **EVERY PANEL BOX, AND WHETHER THE STEP WOULD DROP IT — through the code that decides.**
     *
     * The invariant the cyan depends on is *"no box holding a barrier cell is ever dropped"*, and
     * a probe that re-derived the answer from the rects would be testing its own arithmetic
     * instead of `boxesNear`'s. So this calls the SAME `steppableBoxes`, which means it also
     * follows `setStepGuard` — turn the guard off and this reports the defect, which is what lets
     * `aim-step.mjs` S4 validate itself by reintroduction on every run.
     */
    stepCensus(y = 0, stepH = BASE_STEP) {
      const out = [];
      for (const q of panels) {
        const boxes = q.solidBoxes();
        if (!boxes.length) continue;
        const flags = stepH > BASE_STEP ? steppableBoxes(q) : null;
        const rects = q.field ? q.field.solidRects(false) : null;
        for (let k = 0; k < boxes.length; k++) {
          const b = boxes[k];
          const st = (!flags || flags[k]) ? stepH : BASE_STEP;
          // ⚠️ `barrier` is recomputed here rather than read off `flags`, so the two answers are
          // independent: `flags` is what the collider believed and this is what is actually in
          // the grid. A test that read one number twice would agree with itself for free.
          let barrier = false;
          if (rects && q.field) {
            const f = q.field, r = rects[k];
            const cx0 = Math.max(0, Math.floor(r.u0 * f.cols));
            const cx1 = Math.min(f.cols - 1, Math.ceil(r.u1 * f.cols) - 1);
            const cy0 = Math.max(0, Math.floor(r.v0 * f.rows));
            const cy1 = Math.min(f.rows - 1, Math.ceil(r.v1 * f.rows) - 1);
            for (let cy = cy0; !barrier && cy <= cy1; cy++) {
              for (let cx = cx0; cx <= cx1; cx++) if (f.barrier[f.idx(cx, cy)]) { barrier = true; break; }
            }
          }
          out.push({ panel: q.id, top: +(b.max.y).toFixed(3), base: +(b.min.y).toFixed(3),
            barrier, dropped: b.max.y <= y + st });
        }
      }
      return { stepH, guard: _stepGuard, boxes: out };
    },
    get exteriorSolids() { return _extSolids; },
    /**
     * EVERY CONNECTOR THIS BUILD CONTAINS, in table order — doorways and destructibles alike.
     * The query surface a generator, a critic or a scenario should reach for: it already
     * reflects `?exits=N`, so a probe that walks it cannot count sites the build does not have.
     * `connector(id)` is the by-id form; `panelOf(id)` gets you the `DestructibleWall` when the
     * connector has one (an OPEN doorway does not).
     */
    connectors: connectorDefs,
    connector(id) { return connectorDefs.find((c) => c.id === id) ?? null; },
    panelOf(id) { return panels.find((p) => p.id === id) ?? null; },
    chainedDoorsOf,
    spaceAt, spacesOnSegment, pathPortals, portals,
    setViewpoint, setViewpoints, visibleSpaces,
    /**
     * LOOSE OBJECTS JOIN RESIDENCY — see the block above `setViewpoints` for the measurement.
     * `trackLoose` is called for anything scene-parented that BELONGS to a room rather than to
     * the frame: a dropped limb, a world gadget, the sledgehammer. Never the player or hunter.
     */
    trackLoose, untrackLoose,
    /**
     * THE ABLATION, IN ONE PAGE. `?loose=0` is the same revert from the URL. Returns what it
     * actually did and re-culls immediately, so a probe can read the delta without stepping a
     * frame and a look A/B never has to compare two page loads.
     */
    setLooseCull(on) { _looseCull = !!on; cullLoose(); return _looseCull; },
    /**
     * 🛩️ **THE ROOF, ON A SWITCH — AND IT IS A RENDER CONCEPT AND NOTHING ELSE.**
     *
     * `setLid(false)` hides every merged bucket that lies entirely at or above its space's
     * storey; `setLid(true)` puts back exactly what it took. Built for the fly-over
     * (`views/game.js` `[F]`), which cannot see a house through six ceilings.
     *
     * ⚠️ **IT WRITES `visible` ON MESHES AND NOTHING ELSE.** `collide`, `castRay`, `blocksSight`,
     * `portals()` and `update()` ignore visibility entirely (this file's own header), so a lid
     * that is off changes what is drawn and nothing a body, a ray or the hunter can feel.
     * `harness/scenarios/_flyover1-view.mjs` L2 asserts that with a flood of `room.collide()`
     * results taken on both arms, and its C2 control displaces one probe to prove the comparison
     * can see a difference at all.
     *
     * ⚠️ **RESTORE ONLY WHAT WE TOOK**, the same conservatism `untrackLoose` uses: `took` is
     * checked rather than assumed, so this can never overwrite a `false` some other system set.
     */
    setLid(on) {
      _lidOn = !!on;
      let hidden = 0;
      for (const sp of spaces) {
        for (const e of sp._lid ?? []) {
          if (_lidOn) { if (e.took) { e.mesh.visible = true; e.took = false; } }
          else if (e.mesh.visible) { e.mesh.visible = false; e.took = true; }
          if (e.took) hidden++;
        }
      }
      return { on: _lidOn, hidden, lid: _lidCount() };
    },
    /**
     * What the lid IS, per space, so a probe can assert the roof came off rather than trust it —
     * and so a bucket the rule REFUSED (a cornice merged with a coffer beam) is visible as a
     * refusal rather than as a silent absence.
     */
    lidCensus() {
      const items = [];
      let hidden = 0;
      for (const sp of spaces) {
        const took = (sp._lid ?? []).map((e) => e.key);
        for (const e of sp._lid ?? []) if (e.took) hidden++;
        // Only the informative refusals: a bucket that REACHES the ceiling band but starts
        // below it, i.e. one this rule declined because taking it would delete wall dressing.
        const refused = [];
        for (const o of sp.root.children) {
          if (!o.isMesh) continue;
          if (!o.geometry?.boundingBox) o.geometry?.computeBoundingBox?.();
          const bb = o.geometry?.boundingBox;
          if (!bb) continue;
          const key = String(o.name || '').replace(/^kit:/, '');
          if (took.includes(key) || bb.max.y < sp.storey - 0.01) continue;
          refused.push({ key, minY: +bb.min.y.toFixed(2), maxY: +bb.max.y.toFixed(2) });
        }
        items.push({ space: sp.id, storey: sp.storey, took, refused });
      }
      return { on: _lidOn, lid: _lidCount(), hidden, spaces: items };
    },
    /**
     * What a probe needs to assert the gate is live without reaching into three.js.
     * ⚠️ It NAMES the items, because "5 of 6 hidden" is a number without an owner and the look
     * A/B has to be able to reveal exactly one of them and say which.
     */
    looseCensus() {
      let hidden = 0, live = 0;
      const items = [];
      for (const [o, e] of _loose) {
        const on = !e.live || e.live();
        if (e.hid) hidden++;
        if (on) live++;
        items.push({ name: o.name || '(unnamed)', hidden: !!e.hid, live: on,
          space: spaceAt(o.position)?.id ?? null,
          x: +o.position.x.toFixed(2), z: +o.position.z.toFixed(2) });
      }
      return { on: _looseCull, tracked: _loose.size, live, hidden, items };
    },
    /**
     * The hunter's patrol loop, from the floor-plan table. Handed out through the room rather
     * than imported straight into `hunter-ai.js` for one reason: the AI must never know the
     * shape of the house. It asks the room where to go next exactly as it asks it what it can
     * see through, so changing the floor plan is a `spaces.js` edit and nothing else.
     */
    patrolRoute() { return _PATROL; },
    /** Named test/spawn points, so no scenario ever hardcodes a coordinate again. */
    anchor(name) {
      const a = ANCHORS[name];
      if (!a) { console.warn('[room] no anchor named', name); return null; }
      return new THREE.Vector3(a[0], 0, a[1]);
    },
    anchorNames() { return Object.keys(ANCHORS); },
    spawn: {
      player: _SPAWN.player.map((p) => new THREE.Vector3(p[0], 0, p[1])),
      hunter: new THREE.Vector3(_SPAWN.hunter[0], 0, _SPAWN.hunter[1]),
      capture: new THREE.Vector3(_SPAWN.capture[0], 0, _SPAWN.capture[1]),
      // where a panel breach lands you, for the AI's route reasoning
      breaches: panels.map((p) => new THREE.Vector3(p.root.position.x, 0, p.root.position.z)),
    },
    update(dt) {
      for (const p of panels) p.update(dt);
      for (const fp of furnProps) fp.update?.(dt);
    },
  };
  return room;

  // ==========================================================================
  // builders
  // ==========================================================================

  function buildSpace(sp) {
    const bin = kit?.GeoBin ? new kit.GeoBin() : null;
    /**
     * 🆕 **THE ARCHITECTURAL ORDER FOR THIS SPACE, IF IT HAS ONE.**
     *
     * ⚠️ **THE PLAN IS RESOLVED BEFORE ANY WALL IS BUILT, BECAUSE THE CLERESTORY IS HOLES IN
     * THEM.** `estate-spike-1`'s `geo` arm hung a window bay against a solid wall — and
     * `windowBay` puts its glass at `-t * 0.55`, i.e. 165 mm INSIDE the masonry, so the glazing
     * that carries the top of the showcase's luminance range rendered and could not be seen.
     * That is HANDOFF's dominant defect class ("it exists, something is in front of it") and
     * the reason this has to happen in the wall builder rather than beside it.
     *
     * The gallery runs down X in the game and down Z in the showcase, so the plan is resolved
     * in a LOCAL frame (long axis on Z) and `base` rotates it into place. One `rotY`, exactly
     * as the spike measured.
     */
    /**
     * 🆕 **TWO ORDERS NOW, AND THE DISPATCH IS BY `sp.order`.** `makeOrder` returns a small
     * uniform interface — `plan`, `base`, `capFor(side)`, `cutsFor(side)`, `solids` and
     * `emit(bin)` — so `buildSpace` and `buildWall` below know they are building TO an order
     * without knowing WHICH. That is the difference between adding a second room and adding a
     * second copy of the first room's plumbing.
     */
    const ord = bin ? makeOrder(sp) : null;
    sp.orderPlan = ord?.plan ?? null;
    // `views/game.js` hangs the practicals off these two. Lighting is that file's business,
    // not this one's — but the anchors are the ARCHITECTURE's, and a fixture that derived its
    // own idea of where the wall is would drift the moment either changed.
    sp.orderBase = ord?.base ?? null;
    /**
     * 🕳️ **A BOX THAT CAN BE TAKEN BACK OUT OF A MERGED MESH, WITHOUT REBUILDING IT.**
     *
     * `?dig=1` needs two boxes to be removable at runtime and neither of them was: the brick
     * behind the run's interconnect (there is no barrier there, ever) and the brick + lintel the
     * hunter takes with it when it crosses. Both live in a `GeoBin` bucket that merges every box
     * in the room into ONE `BufferGeometry` — which is exactly why the barrier costs no draw call
     * and exactly why nothing could hole it.
     *
     * ⚠️ **SO REMOVAL IS A DEGENERATE-VERTEX WRITE, NOT A GEOMETRY REBUILD.** `GeoBin` merges its
     * bucket in insertion order, so a box's vertices occupy a known contiguous range of the merged
     * position attribute. Collapsing that range onto the box's own centroid turns 12 triangles
     * into 12 zero-area ones, which rasterise nothing. The alternative — rebuilding and
     * re-uploading the merged geometry — would pay a first-draw GPU upload **on the frame the
     * hunter comes through the wall**, which `wall.js` and `wallinstances.js` both go out of
     * their way to avoid and which is the single worst frame in the run to stall. This writes
     * ~24 floats into a buffer that is already on the GPU.
     *
     * ⚠️ It returns a handle rather than an id because the fallback path (no `kit`, so no
     * `GeoBin`) is a real per-box `Mesh`, and `hide()` has to mean the same thing on both.
     */
    const tracked = (key, w, h, d, x, y, z, uv = 1.2) => {
      if (!bin) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[key] ?? mats.wall);
        m.position.set(x, y, z);
        m.castShadow = true; m.receiveShadow = true;
        sp.root.add(m);
        return { hide() { m.visible = false; } };
      }
      const bucket = bin.bins.get(key);
      const start = bucket ? bucket.reduce((n, g) => n + g.attributes.position.count, 0) : 0;
      bin.box(key, w, h, d, x, y, z, uv);
      const added = bin.bins.get(key);
      const count = added[added.length - 1].attributes.position.count;
      const handle = {
        key, start, count, centre: [x, y, z], mesh: null, hidden: false, orig: null,
        hide() {
          if (this.hidden) return;
          const g = this.mesh?.geometry;
          if (!g) { this.hidden = true; return; }
          const pos = g.attributes.position;
          // ⚠️ SAVED BEFORE THE FIRST COLLAPSE, NEVER AFTER. `setDigPlan` runs on every round
          // reset with a fresh seed, so a segment that was the answer last round has to be
          // re-bricked this one; a one-way hide leaves a hole that means nothing standing next
          // to a barrier where the way through should be, and neither of those throws.
          this.orig ??= pos.array.slice(this.start * 3, (this.start + this.count) * 3);
          for (let i = this.start; i < this.start + this.count; i++) {
            pos.setXYZ(i, this.centre[0], this.centre[1], this.centre[2]);
          }
          pos.needsUpdate = true;
          // The bounding sphere shrinks toward the room, never grows, so a stale one can only
          // over-include. Recomputed anyway: `frustumCulled` is on for these merged meshes.
          g.computeBoundingSphere();
          this.hidden = true;
        },
        show() {
          if (!this.hidden) return;
          this.hidden = false;
          const g = this.mesh?.geometry;
          if (!g || !this.orig) return;
          g.attributes.position.array.set(this.orig, this.start * 3);
          g.attributes.position.needsUpdate = true;
          g.computeBoundingSphere();
        },
      };
      (sp._tracked ??= []).push(handle);
      return handle;
    };
    const put = (key, w, h, d, x, y, z, uv = 1.2) => {
      if (bin) bin.box(key, w, h, d, x, y, z, uv);
      else {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats[key] ?? mats.wall);
        m.position.set(x, y, z);
        m.castShadow = true; m.receiveShadow = true;
        sp.root.add(m);
        // 🛩️ the no-`kit` fallback's half of `setLid` — see the bin path after `bin.build`.
        if (key === 'ceiling') (sp._lid ??= []).push({ key, mesh: m, took: false });
      }
    };
    // Returns the box so a caller that may have to REMOVE it later can keep the reference —
    // see `dropCollider`. Every existing caller ignores the return value.
    const solid = (w, h, d, x, y, z) => {
      const b = new THREE.Box3(
        new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
        new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2));
      b._space = sp;
      sp.colliders.push(b);
      return b;
    };
    const H = sp.storey;

    // ---- floor + ceiling
    put(sp.floor ?? 'floor', sp.w, 0.30, sp.d, sp.cx, -0.15, sp.cz, 2.4);
    put('ceiling', sp.w, 0.30, sp.d, sp.cx, H + 0.15, sp.cz, 2.4);

    // ---- the four boundary walls, as skins on this space's own side
    for (const side of ['zmin', 'zmax', 'xmin', 'xmax']) {
      const t = neighbourAcross(sp, side) ? WALL_T / 2 : WALL_T;
      const alongZ = side === 'zmin' || side === 'zmax';
      // Z-normal walls close the corners; X-normal walls stop at the clear extent. Same
      // convention the pre-mansion hall used, and it must stay consistent or corners open.
      const u0 = alongZ ? sp.x0 - WALL_T : sp.z0;
      const u1 = alongZ ? sp.x1 + WALL_T : sp.z1;
      const n = side === 'zmin' ? sp.z0 - t / 2 : side === 'zmax' ? sp.z1 + t / 2
        : side === 'xmin' ? sp.x0 - t / 2 : sp.x1 + t / 2;
      /**
       * 🆕 **THE TWO LONG WALLS BECOME TWO STOREYS, AND THAT IS A REPLACEMENT, NOT AN ADDITION.**
       *
       * The panelled storey stops at the string course (`capY`) and the clerestory band above it
       * is emitted by the same builder with the window openings cut out of it. So the wall this
       * file has always drawn is SHORTER, and the kit's order stands in the space it left —
       * which is what "replace the game's `bin.box()` walls rather than add on top of them"
       * means, and the difference between this and `estate-spike-1`'s additive probe.
       *
       * ⚠️ **THE COLLIDERS ARE UNCHANGED AND STILL FULL HEIGHT.** `capY` clips the GEOMETRY
       * only. The camera boom raycasts the world to stay out of walls, and a collider that
       * stopped at 3.4 m would let the boom sail through the top of the room — in live play
       * only, which is the failure class that has cost this project the most.
       *
       * ⚠️ **AND ONLY ON A SPACE WITH NO DIG SEGMENTS ON THAT EDGE.** `DIG_EDGES` holds `svc_w`
       * and `svc_e` only — both x-normal walls between the service passage and the studies — so
       * the gallery's long walls carry no tracked lintel and nothing collapsible is clipped.
       * `capY` is refused for a tracked box regardless (see `buildWall`), so the invariant is
       * enforced where it can be checked rather than asserted here.
       */
      /**
       * ⚠️ **THE CAP AND ITS BAND ARE THE ORDER'S DECISION, PER WALL.** The gallery caps its two
       * LONG walls and re-emits a clerestory storey with real holes in it; the study caps ALL
       * FOUR and re-emits a stone frieze with none, because its window sits in the panelled
       * storey (see `study-order.js`'s header for why that one thing must not travel from the
       * showcase). Same machinery, two answers, and the only branch is inside `makeOrder`.
       */
      const cap = ord?.capFor(side, alongZ) ?? null;
      buildWall(sp, {
        axis: alongZ ? 'z' : 'x', at: n, t, u0, u1, H, put, solid, tracked,
        skirtShrink: 0.999,
        // ⚠️ The order's own openings (the study's windows) are APPENDED to the connector cuts,
        // not merged into them: a window is a hole in this wall like any other, and it has to go
        // through the SAME sorted walk so its sill and its lintel land where the infill stops.
        cuts: [...cutsOnWall(sp, alongZ ? 'z' : 'x', side, t), ...(ord?.cutsFor(side) ?? [])],
        capY: cap?.capY ?? null,
        band: cap?.band ?? null,
      });
    }

    /**
     * 🆕 **THE COLLIDERS THE ORDER OWES BACK.**
     *
     * A window is a hole in the wall, and `buildWall` gives a hole a sill collider and a lintel
     * collider and nothing across the opening — which is right for a doorway and WRONG for a
     * glazed one. Left alone, a 1.45 x 2.23 m gap in the house's OUTSIDE wall is a gap in the
     * collider set, and `ThirdPersonCamera` raycasts the world to keep its boom out of walls:
     * the boom would sail through the window and the frame would go black from outside the
     * building. That is this project's most expensive failure class (live play only), and it is
     * cheap to refuse — the glass IS solid, so the aperture gets its collider back.
     */
    for (const s of ord?.solids ?? []) solid(s[0], s[1], s[2], s[3], s[4], s[5]);

    // ---- inner walls (M1's divider)
    for (const w of INNER_WALLS) {
      if (w.space !== sp.id) continue;
      const alongZ = w.axis === 'z';
      buildWall(sp, {
        axis: w.axis, at: w.at, t: WALL_T,
        u0: alongZ ? sp.x0 : sp.z0, u1: alongZ ? sp.x1 : sp.z1,
        H, put, solid, tracked, skirtShrink: 1.0,
        cuts: cutsOnInnerWall(w),
      });
    }

    // ---- the BRICK BARRIER, when `?dig=1` is on. `dig.md` §5's terminal surface.
    //
    // ⚠️ EMITTED AS THIS ROOM'S OWN SKIN, WHICH IS THE FLOOR PLAN'S OWN RULE — see `spaces.js`:
    // *"each space always draws its own four walls"*, because a boundary owned wholly by one
    // space punches a hole in the wall its neighbour is looking at the moment residency hides
    // the owner. `barrierSlabs()` returns room `a`'s 0.075 m and room `b`'s 0.075 m as two
    // ABUTTING boxes, so they neither overlap nor z-fight, and NEITHER CARRIES ANY STATE. That
    // is the strong form of `dig.md`'s "model it once per shared edge, never twice": there is no
    // barrier state anywhere in the build, so there is nothing for two clients to disagree about.
    //
    // Into the `brick` GeoBin key, so however many spans an edge has they cost ONE draw call per
    // room — the same trick the colonnade uses for six piers.
    // ⚠️ ONE BOX PER SEGMENT NOW, NOT ONE PER SPAN, AND IT IS REGISTERED AGAINST THE PANEL IN
    // FRONT OF IT. `dig-1` merged a whole span because nothing could ever remove one; the
    // interconnect and the hunter's crossing both can. Still ONE draw call per room — the boxes
    // go into the same `brick` bucket and merge — but each is individually collapsible.
    for (const s of barriers) {
      if (s.space !== sp.id) continue;
      const geo = tracked('brick', s.w, s.h, s.d, s.x, s.y, s.z, 0.9);
      const box = solid(s.w, s.h, s.d, s.x, s.y, s.z);
      brickOf.set(s.panel, { geo, box, space: sp });
    }

    // ---- pilasters: break the long walls up so they are not flat slabs
    //
    // ⚠️ A PILASTER MUST NEVER LAND ON AN OPENING. The pitch is a fixed 3.2 m and the doors
    // and panels are wherever the floor plan put them, so the two collide — measured in the
    // passage, where the 3.2 m pitch puts a pilaster at z = -19.5 and `p.svc_w.n` spanned
    // -21.04 to -18.96. A 0.34 m pier standing across a breach hole is not a wall you can
    // see is broken, and it intersects the panel's own box. `clearOfCuts` drops any pier
    // whose run overlaps an opening plus a 0.25 m reveal margin.
    //
    // ⚠️ **THAT WORKED EXAMPLE IS NOW ONLY LIVE UNDER `?doors=1`.** The four `p.svc_*` rows are
    // off by default since 2026-08-10 (`spaces.js` `PASSAGE_DOORS`), so on the shipped arm the
    // passage's two side walls have NO cut in them and **all five piers stand on each: z -22.70,
    // -19.50, -16.30, -13.10, -9.90, where three stood before.** They go into the `mould` GeoBin
    // and merge, so that is triangles and no draw call — but it IS the visible change in the
    // hallway: two holes per wall became wall, and a pier came back where each one was. The rule
    // itself is unchanged and still fires for every other opening in the house.
    const pitch = 3.2;
    const clearOfCuts = (side, u) => {
      for (const c of cutsOnWall(sp, side === 'xmin' || side === 'xmax' ? 'x' : 'z', side, WALL_T)) {
        if (Math.abs(u - c.u) < c.w / 2 + 0.35 + 0.17) return false;
      }
      return true;
    };
    // ⚠️ A SPACE WITH AN ORDER DOES NOT GET THESE. The kit emits a real fluted pilaster order
    // at its own bay rhythm; leaving this one on would put a 0.34 m slab of `mould` through
    // every one of them, which is the clash `estate-spike-1`'s additive probe photographed.
    if ((sp.pilasters ?? 'x') !== 'none' && !ord) {
      const n = Math.max(1, 1 + 2 * Math.floor((sp.d - 2.0) / (2 * pitch)));
      for (const [s, side] of [[-1, 'xmin'], [1, 'xmax']]) {
        for (let i = -(n - 1) / 2; i <= (n - 1) / 2; i++) {
          const u = sp.cz + i * pitch;
          if (!clearOfCuts(side, u)) continue;
          put('mould', 0.34, H, 0.14, sp.cx + s * (sp.w / 2 - 0.05), H / 2, u, 0.7);
        }
      }
    }
    if ((sp.pilasters ?? 'x') === 'both' && !ord) {
      const n = Math.max(1, 1 + 2 * Math.floor((sp.w - 2.0) / (2 * pitch)));
      for (const [s, side] of [[-1, 'zmin'], [1, 'zmax']]) {
        for (let i = -(n - 1) / 2; i <= (n - 1) / 2; i++) {
          const u = sp.cx + i * pitch;
          if (!clearOfCuts(side, u)) continue;
          put('mould', 0.14, H, 0.34, u, H / 2, sp.cz + s * (sp.d / 2 - 0.05), 0.7);
        }
      }
    }

    // ---- colonnade reader. Occlusion, not decoration: it breaks a long diagonal SOMETIMES.
    // One merged mesh under `mould`. John 2026-08-23 deleted `ROOMS.ballroom.columns` and
    // `placeRoom` / `dressGenerated` refuse to attach columns to a ballroom, so the live
    // starting room no longer emits this block. The reader stays: a non-ballroom `sp.columns`
    // (or a future field) still becomes mould + colliders. Do not put a ballroom special-case
    // here — the policy is in `spaces.js`.
    //
    // 🆕 **TWO SHAPES** (`gendress-1`, 2026-08-15). `{ z, xs, w }` is a pier row at one world z —
    // the shape this file has always read. `{ pts: [[x, z], …], w }` is the general form a
    // quarter-turn needs: the row sits at one world X, which the pair cannot say.
    // `house-packing.md` §9.4b item 2, closed. The live ballroom no longer supplies either
    // shape (John 2026-08-23); other rooms still can.
    if (sp.columns) {
      const { w = 0.95 } = sp.columns;
      const pts = sp.columns.pts ?? sp.columns.xs.map((x) => [x, sp.columns.z]);
      for (const [x, z] of pts) {
        put('mould', w, H, w, x, H / 2, z, 0.9);
        solid(w, H, w, x, H / 2, z);
      }
    }

    // ---- cornice band
    for (const [w, d, x, z] of [
      [sp.w, 0.22, sp.cx, sp.z0 + 0.11], [sp.w, 0.22, sp.cx, sp.z1 - 0.11],
      [0.22, sp.d, sp.x0 + 0.11, sp.cz], [0.22, sp.d, sp.x1 - 0.11, sp.cz],
    ]) put('mould', w, 0.46, d, x, H - 0.23, z, 0.8);

    /**
     * 🆕 **THE ORDER GOES INTO THIS SPACE'S OWN BIN, AND THAT IS THE WHOLE DRAW-CALL STORY.**
     *
     * `estate-spike-1` measured its additive probe at **+14 draw calls** and explained why it
     * was not more: *"draw calls are a function of the number of MATERIAL KEYS, not of how much
     * geometry is in them"*. The probe still paid 14 because it had its OWN bin and its own
     * group — eight keys that could not merge with the eight already in the room.
     *
     * Emitted into `bin` under `ORDER_KEYS`, the shared keys land in buckets this room is
     * already drawing, so the marginal cost is the number of GENUINELY NEW keys: `clere`
     * (emissive glazing — there is nothing like it in the game), `gilt` and `wood`, plus the
     * portrait canvases, which are one merged mesh by construction. Four.
     */
    if (bin && ord) ord.emit(bin);

    if (bin) {
      const built = new Map();
      for (const m of bin.build(binMaterials(mats, sp))) {
        const key = m.name.replace(/^kit:/, '');
        // ⚠️ EMISSIVE GLAZING MUST NEVER CAST. A pane that casts seals its own aperture and the
        // room goes black — the bug that took the first study render down to nothing, recorded
        // in `kit.js`'s own `noCast` note.
        //
        // ⚠️ **AND THE EXCLUSION IS GATED ON `ord`, BECAUSE WITH THE FLAG OFF NOTHING MAY MOVE.**
        // `ceiling` is in the set and every room in the shipped house has a ceiling bucket; an
        // ungated `NO_CAST` would silently stop six ceilings casting, which is a lighting change
        // in five rooms that have nothing to do with this slice.
        m.castShadow = !(ord && NO_CAST.has(key));
        m.receiveShadow = true; sp.root.add(m);
        built.set(key, m);
      }
      // ⚠️ THE HANDLE IS USELESS UNTIL IT KNOWS WHICH MESH IT LANDED IN, and the mesh does not
      // exist until `build()`. `GeoBin.build` merges each bucket in insertion order and names the
      // result `kit:<key>`, so the ranges recorded during authoring are still valid — that is the
      // property this whole mechanism rests on, and it is the reason `tracked` records the key.
      // A bucket that never got a material is SKIPPED with a warning rather than thrown, so a
      // handle with no mesh has to be survivable: `hide()` early-outs on it.
      for (const h of sp._tracked ?? []) h.mesh = built.get(h.key) ?? null;
      /**
       * 🛩️ **THE LID — EVERY MERGED BUCKET THAT LIES ENTIRELY AT OR ABOVE THIS SPACE'S STOREY.**
       *
       * `setLid(false)` (the fly-over, `views/game.js` `[F]`) takes the roof off so the house can
       * be seen from above. This is the list it writes `visible = false` on, and it is recorded
       * HERE because this is the only moment the merged meshes and the space they belong to are
       * both in hand.
       *
       * **IT IS A UNION OF TWO RULES AND BOTH HALVES WERE EARNED BY A FRAME ON DISK.**
       *
       * (a) **THE `ceiling` KEY.** That key means ceiling everywhere in this codebase — `put()`
       *     emits the slab into it, `ORDER_KEYS` maps every order's `ceil` into it, and `NO_CAST`
       *     already treats it as a ceiling. Nothing else is ever put there.
       * (b) **ANY BUCKET WHOSE LOWEST VERTEX IS AT OR ABOVE THE STOREY**, whatever it is called,
       *     because an order may emit ceiling-height geometry under a key of its own.
       *
       * 🚨 **(a) IS NOT REDUNDANT AND THE FIRST BUILD SHIPPED WITHOUT IT AND WAS WRONG.** A
       * geometric-only rule took **4 of 6** ceilings in the authored house and the fly-over frame
       * showed the gallery and the ballroom as two solid white lids. The census says why:
       * `gallery:ceiling` spans **5.57–5.90 against a 5.60 storey** and `ballroom:ceiling` spans
       * **8.43–9.90 against 9.60** — a coffered ceiling hangs its panels BELOW the slab plane, so
       * its bounding box starts under the storey and rule (b) refuses it. It is still a ceiling.
       *
       * ⚠️ **AND THE REFUSALS ARE STILL THE POINT.** `ballroom:gilt` spans −1.77 to 9.60 because
       * one merged bucket carries the coffer beams, the capitals and the skirting mouldings
       * together; taking it would delete wall dressing in every room. It is refused, the beams
       * stay as a lattice over the ballroom, and `lidCensus()` REPORTS that rather than leaving
       * it as a silence somebody has to rediscover from a picture.
       *
       * 🚨 **GEOMETRY ONLY. This touches no collider, no portal, no `DamageField` and no
       * `blocksSight`** — HANDOFF's residency rule, for the same reason it applies there: the
       * camera boom raycasts a world that must always be fully present.
       */
      sp._lid ??= [];
      for (const [key, m] of built) {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        if (key === 'ceiling' || m.geometry.boundingBox.min.y >= sp.storey - 0.01) {
          sp._lid.push({ key, mesh: m, took: false });
        }
      }
    }
  }

  // ==========================================================================
  // The architectural orders. One interface, two rooms.
  // ==========================================================================

  /** @returns the order interface for this space, or null if it has none / it failed to load. */
  function makeOrder(sp) {
    if (hasOrder && sp.order === 'gallery') return galleryOrderFor(sp);
    if (hasStudy && sp.order === 'study') return studyOrderFor(sp);
    if (hasBall && sp.order === 'ballroom') return ballroomOrderFor(sp);
    return null;
  }

  /**
   * The long gallery — `estate-1`, reached through `makeOrder`.
   *
   * 🚨 **THE QUARTER TURN IS DERIVED FROM THE FOOTPRINT NOW, NOT HARDCODED — AND THIS IS THE ONE
   * ORDER THAT GENUINELY NEEDED IT** (`gendress-1`, 2026-08-15).
   *
   * The order is authored with its LONG axis on LOCAL Z (it is `views/room-gallery.js`'s own
   * frame). The authored gallery runs along world X, so `base` was `makeRotationY(PI/2)`, flat.
   * A GENERATED gallery is turned on 11 of the 19 galleries in a 16-seed sample — genspike's
   * `rot` flag swaps a room's structural w/d at selection time — and on those the constant is
   * exactly backwards: `len` came out **6.70** and `wid` **27.20**, so the whole order (bay
   * rhythm, clerestory pitch, portrait count, transverse arch) would be solved for a 6.7 m room
   * and then laid across a 27.2 m one. Not a subtle mis-dressing; the room would be visibly
   * wrong, and nothing would throw.
   *
   * ⚠️ **THREE THINGS TURN TOGETHER OR NONE OF THEM DO, WHICH IS WHY THEY ARE ONE FLAG.**
   *   · which extent is `len` — the plan is solved in the long axis
   *   · `base`'s rotation — `PI/2` maps local +z onto world +x; `0` maps it onto world +z
   *   · which pair of walls takes the CAP — `capFor` used to test `alongZ` (a z-NORMAL wall,
   *     i.e. one that RUNS along x). That is "the long walls" only while the room runs along x.
   * The authored room is `alongX`, so all three keep their old values and this is a no-op on
   * `HOUSE_PLAN` — the `?estate=port` captures and `_loc1_golden` are unmoved.
   */
  function galleryOrderFor(sp) {
    const alongX = (sp.x1 - sp.x0) >= (sp.z1 - sp.z0);
    const len = alongX ? sp.x1 - sp.x0 : sp.z1 - sp.z0;
    const wid = alongX ? sp.z1 - sp.z0 : sp.x1 - sp.x0;
    const plan = order.galleryPlan({
      x0: -wid / 2, x1: wid / 2, z0: -len / 2, z1: len / 2, h: sp.storey,
      corniceH: 0.46,                       // this file's own cornice band, below
      portraits: 8,                         // 27.2 m of wall, not 27.0 with a stair in it
      sconces: 7,
    });
    /**
     * 🚪 **PILASTERS MUST NOT STAND IN A DOORWAY.** The bay rhythm is 3.02 m and the
     * connectors are wherever the generator put them. A 0.50 m fluted pier in a 1.90 m
     * opening is the white vertical trim in John's RRR CAM 01 chase still. `uHitsAnyOpening`
     * is the same keep-out the furniture dresser uses, in this wall's local z.
     */
    {
      const alongLong = alongX ? 'z' : 'x';
      const longSides = alongX ? ['zmin', 'zmax'] : ['xmin', 'xmax'];
      const cuts = longSides.flatMap((side) => cutsOnWall(sp, alongLong, side, WALL_T));
      const centre = alongX ? sp.cx : sp.cz;
      const localCuts = cuts.map((c) => ({ u: c.u - centre, w: c.w }));
      const PIL_HALF = 0.50 / 2;
      plan.pilasterZ = plan.pilasterZ.filter((z) => !uHitsAnyOpening(z, PIL_HALF, localCuts, 0.16));
      plan.archPiers = !uHitsAnyOpening(plan.archZ, 0.78 / 2, localCuts, 0.16);
    }
    const base = new THREE.Matrix4().makeRotationY(alongX ? Math.PI / 2 : 0)
      .premultiply(new THREE.Matrix4().makeTranslation(sp.cx, 0, sp.cz));
    // World sites for FurnProp dress (portraits / urns / candelabra) — local → world via `base`.
    {
      const toW = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(base);
      const yawOf = (rotY) => {
        const e = new THREE.Euler().setFromRotationMatrix(
          base.clone().multiply(new THREE.Matrix4().makeRotationY(rotY)),
        );
        return e.y;
      };
      const sites = [];
      for (const it of plan.portraits) {
        const p = toW(plan.x0 + 0.11, it.y, it.x);
        sites.push({
          x: p.x, y: p.y, z: p.z, rotY: yawOf(Math.PI / 2),
          w: it.w, h: it.h, cell: it.cell ?? 0, side: 'L',
        });
      }
      for (const it of plan.portraits) {
        const p = toW(plan.x1 - 0.11, it.y, it.x + 1.45);
        sites.push({
          x: p.x, y: p.y, z: p.z, rotY: yawOf(-Math.PI / 2),
          w: it.w, h: it.h, cell: ((it.cell ?? 0) + 3) % 8, side: 'R',
        });
      }
      plan.furnPortraits = sites;
      plan.furnUrns = [];
      for (const z of plan.urnZ) {
        const a = toW(plan.x0 + 0.62, 0, z);
        const b = toW(plan.x1 - 0.62, 0, z - 2.8);
        plan.furnUrns.push({ x: a.x, z: a.z }, { x: b.x, z: b.z });
      }
      const cd = toW(plan.x0 + 1.2, 0, plan.archZ + 2.4);
      plan.furnCandelabra = [{ x: cd.x, z: cd.z }];
    }
    // local +z is world +x once rotated (and world +z when it is not), so an opening at local z
    // lands at `centre + z` on whichever world axis this room's long side runs down.
    const u = (z) => (alongX ? sp.cx : sp.cz) + z;
    return {
      kind: 'gallery', plan, base, u, solids: [],
      capFor(side, alongZ) {
        // the LONG walls take the clerestory. They are the z-normal pair when the room runs
        // down x, and the x-normal pair when it runs down z.
        if (alongZ !== alongX) return null;
        return {
          capY: plan.fieldTop,
          band: {
            y0: plan.fieldTop, y1: sp.storey,
            cuts: plan.openings.map((p) => ({ u: u(p.u), w: p.w, y0: p.y0, y1: p.y1 })),
          },
        };
      },
      cutsFor() { return []; },
      emit(bin) {
        const built = order.galleryOrder(bin, {
          plan, base, remap: ORDER_KEYS,
          material: { portrait: mats.estate?.portrait ?? mats.wall },
          // ⚠️ THE THINNER OF THE TWO LONG WALLS. The zmax boundary is a 0.15 skin (shared band,
          // half each) and zmin is a full 0.30; one bay depth has to sit inside BOTH, so it
          // takes the thin one. See `gallery-order.js` — the alternative buries the glass.
          wallT: 0.14,
          // the game's own ceiling slab sits at H with its underside at H exactly; drop the
          // coffers 20 mm so the pan cannot z-fight with it
          ceilingY: sp.storey - 0.02,
          // FurnProp owns portraits + urns / console dressing.
          ...(furnDressEnabled() ? { parts: { portraits: false, dressing: false } } : {}),
        });
        for (const m of built.meshes) {
          m.castShadow = false; m.receiveShadow = true;
          sp.root.add(m);
        }
      },
    };
  }

  /**
   * 🆕 **THE STUDY — `views/room-study.js`'s own order, resolved against THIS room's cut list.**
   *
   * ⚠️ **NOTHING HERE IS AUTHORED PER ROOM AND THAT IS THE POINT.** `study_w` and `study_e` are
   * described in `spaces.js` as "the same room" and they are not: `study_w` has D1 in its
   * gallery wall and `study_e` has had nothing there since D3 was removed, and each has two
   * exit sites in a different wall. A hand-mirrored placement would have put a chimney breast
   * across a doorway in one of the two — silently, because a breast is geometry with no
   * collider and from the far side the door would simply look shut. So the chimney bay, the
   * window bays, the pilasters and the hangings are all chosen from the spans this room's own
   * connectors leave free, and the same code produces both rooms.
   *
   * ⚠️ **NO `base`.** The showcase's frame IS this room's frame — chimney wall on zmin, returns
   * on x, long axis on z — so unlike the gallery there is no rotation and no chance of the
   * "twelve paintings in the middle of the ballroom" class of bug.
   */
  function studyOrderFor(sp) {
    const H = sp.storey;
    const HP = Math.PI / 2;
    const faces = [
      { side: 'zmin', id: 'back', axis: 'z', ox: sp.x0, oz: sp.z0, rotY: 0, len: sp.w,
        lo: sp.x0, hi: sp.x1, at: sp.z0, into: 1, toU: (u) => u - sp.x0 },
      { side: 'xmin', id: 'left', axis: 'x', ox: sp.x0, oz: sp.z1, rotY: HP, len: sp.d,
        lo: sp.z0, hi: sp.z1, at: sp.x0, into: 1, toU: (u) => sp.z1 - u },
      { side: 'xmax', id: 'right', axis: 'x', ox: sp.x1, oz: sp.z0, rotY: -HP, len: sp.d,
        lo: sp.z0, hi: sp.z1, at: sp.x1, into: -1, toU: (u) => u - sp.z0 },
      { side: 'zmax', id: 'front', axis: 'z', ox: sp.x1, oz: sp.z1, rotY: Math.PI, len: sp.w,
        lo: sp.x0, hi: sp.x1, at: sp.z1, into: -1, toU: (u) => sp.x1 - u },
    ];
    for (const f of faces) {
      const nb = neighbourAcross(sp, f.side);
      f.t = nb ? WALL_T / 2 : WALL_T;
      f.exterior = !nb;
      f.cuts = cutsOnWall(sp, f.axis, f.side, f.t);
    }
    /** world (x, z) for a point `u` along this face, `off` metres INTO the room. */
    const at = (f, u, off) => (f.axis === 'z'
      ? { x: u, z: f.at + f.into * off }
      : { x: f.at + f.into * off, z: u });
    /** local wallRun opening for a world-`u` cut, in the run's own increasing coordinate. */
    const toOpening = (f, c, y0, y1) => {
      const a = f.toU(c.u - c.w / 2), b = f.toU(c.u + c.w / 2);
      return { x0: Math.min(a, b), x1: Math.max(a, b), y0, y1 };
    };

    // ---- the panelling top, solved against the doorway rather than scaled ---
    const plan0 = studyMod.studyPlan({ x0: sp.x0, x1: sp.x1, z0: sp.z0, z1: sp.z1, h: H });
    const wallTop = plan0.wallTop;

    /**
     * ---- the chimney: the widest free span on the gallery wall, biased to the room's centre
     *
     * 🚨 **IN A GENERATED HOUSE THIS DECLINES ON 9 OF 16 STUDIES, AND IT IS RIGHT TO — BUT THE
     * ROOM LOSES ITS SIGNATURE PIECE AND THE FIX IS NOT IN THIS FILE** (`gendress-1`,
     * 2026-08-15, measured over 8 seeds x `planrooms=6`, reading `sp.orderPlan.hearthWorld` off
     * the BUILT house).
     *
     * The breast needs `breastW + 0.60` = **3.60 m** of free span on `faces[0]` (zmin). In the
     * authored house zmin is the gallery wall and is clear. In a generated house the dig table
     * routinely puts a **FULL-WALL dig face** there: every chimney-less study measured carries a
     * cut of width **11.60 m on an 11.60 m wall** (`f.g18.0.a`/`.b`, `f.g14.0.a`/`.b`, …), so
     * `freeSpans` returns nothing and `chimneyX` is null. Every study that DID get a chimney had
     * an empty or 2.08 m zmin cut list. **The declining is correct** — a fireplace standing in a
     * wall the player is meant to hammer through would be both a lie and a hole into the
     * neighbour — and the same mechanism costs a generated ballroom its windows on **4 of 8**
     * seeds (`ext` free spans, `WIN_HALF` 2.005 m).
     *
     * ⚠️ **AND IT CANNOT BE FIXED BY CHOOSING A DIFFERENT `faces[0]` HERE, WHICH IS THE OBVIOUS
     * MOVE AND IS WRONG.** `src/world/study-order.js`'s PHASE F draws the chimney wall's cornice
     * at a hardcoded `makeTranslation(0, wallTop - 0.02, z0 + 0.02)` — it assumes the chimney
     * wall IS zmin — so reordering the faces would put a cornice run across the wrong wall.
     * Two real fixes, neither in this slice's files: let the order build a chimney on any face
     * (`study-order.js`), or let the dig table prefer a wall the order does not need (`dig.js`).
     * **Owner: unassigned.**
     */
    const back = faces[0];
    const CH = { openW: 1.62, openH: 1.32, jambW: 0.52, proj: 0.46, overH: 2.38,
      fieldInset: 0.50, cartoucheScale: 1.00, breastExtra: 0.34, breastD: 0.32 };
    const breastW = CH.openW + 2 * CH.jambW + CH.breastExtra;
    const bays = freeSpans(back.cuts, sp.x0, sp.x1);
    const room = bays.filter((s) => s[1] - s[0] >= breastW + 0.60)
      .sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] ?? null;
    const chimneyX = room
      ? Math.min(Math.max(sp.cx, room[0] + breastW / 2 + 0.30), room[1] - breastW / 2 - 0.30)
      : null;
    const chimney = chimneyX == null ? null : {
      ...CH, x: chimneyX, y: 0, z: sp.z0 + 0.16, rotY: 0,
    };

    // ---- the windows: the OUTSIDE long wall, one per free span that can hold one ----
    /**
     * ⚠️ **ON THE OUTSIDE WALL, WHICH IS NOT A PREFERENCE.** The other long wall is the service
     * passage's, and in free dig mode `DIG_EDGES` makes the whole of it a destructible face —
     * a stained-glass lancet in a wall the player is meant to hammer through would be both a
     * lie and a hole into the service passage's own lighting.
     *
     * ⚠️ **AND CLEAR OF EVERY CONNECTOR IN `u`.** A window that overlapped a doorway would put
     * two cuts at the same `u` into `buildWall`'s single sorted walk, and the second one's
     * "sill" box would run from the FLOOR to the window — sealing the doorway, throwing
     * nothing, and looking from outside like a wall. `freeSpans` is what makes that impossible.
     */
    const WIN = { w: 1.45, sill: 1.05, spring: 2.555 };
    const winHead = WIN.spring + WIN.w / 2;                       // 3.28, under the cap at 3.33
    const ext = faces.find((f) => f.exterior && f.axis === 'x') ?? null;
    const windows = [];
    if (ext) {
      for (const s of freeSpans(ext.cuts, ext.lo, ext.hi)) {
        if (s[1] - s[0] < WIN.w + 1.30) continue;
        const u = (s[0] + s[1]) / 2;
        const p = at(ext, u, 0.005);
        windows.push({ wall: ext.id, face: ext, u, x: p.x, z: p.z, rotY: ext.rotY,
          w: WIN.w, sill: WIN.sill, spring: WIN.spring, t: ext.t, mullions: 1, transoms: 2 });
        if (windows.length >= 2) break;
      }
    }

    // ---- the door cases: OPEN doorways only ---------------------------------
    // A `doorCase` builds real leaves, and a leaf across an open doorway is a wall you can walk
    // through — the worst possible reading. `leaves: 0` leaves the architrave and the
    // entablature hood, which is the part that makes a hole in a panelled wall read as a door.
    const doors = [];
    for (const f of faces) {
      for (const d of connectorDefs) {
        if (d.state !== CONNECTOR.OPEN) continue;
        if (d.a !== sp.id && d.b !== sp.id) continue;
        const ap = aperture(d);
        const u = f.axis === 'z' ? d.x : d.z;
        const onAxis = f.axis === 'z' ? d.z : d.x;
        if (Math.abs(onAxis - f.at) > WALL_T + 1e-6) continue;
        if (u < f.lo - 1e-6 || u > f.hi + 1e-6) continue;
        const p = at(f, u, 0.005);
        doors.push({ wall: f.id, x: p.x, y: 0, z: p.z, rotY: f.rotY,
          w: ap.w, h: ap.y1, leaves: 0, gilt: false });
      }
    }

    // ---- pilasters flanking the breast, dropped where they would clash -------
    const pilasters = [];
    if (chimney) {
      for (const s of [-1, 1]) {
        const px = chimney.x + s * (breastW / 2 + 0.40);
        if (px < sp.x0 + 0.30 || px > sp.x1 - 0.30) continue;
        if (back.cuts.some((c) => Math.abs(px - c.u) < c.w / 2 + 0.35)) continue;
        pilasters.push({ x: px, y: 0.34, z: sp.z0 + 0.16, rotY: 0,
          h: wallTop - 0.86, w: 0.46, proj: 0.11 });
      }
    }

    // ---- the hangings and the sconce anchors --------------------------------
    // Both come off free spans on the PANELLED walls, so a tapestry cannot land on a dig face
    // and a sconce cannot land on a doorhead.
    const blocked = [
      ...(chimney ? [{ f: back, a: chimney.x - breastW / 2 - 0.2, b: chimney.x + breastW / 2 + 0.2 }] : []),
      ...windows.map((w) => ({ f: w.face, a: w.u - w.w, b: w.u + w.w })),
      ...pilasters.map((p) => ({ f: back, a: p.x - 0.4, b: p.x + 0.4 })),
    ];
    // every wall except the service passage's, which is a dig face from end to end
    const panelled = faces.filter((f) => f.exterior || f.axis === 'z');
    const tapestries = [];
    const sconces = [];
    for (const f of panelled) {
      for (const s of freeSpans(f.cuts, f.lo, f.hi, blocked.filter((b) => b.f === f))) {
        const wSpan = s[1] - s[0];
        if (wSpan < 1.9) continue;
        const u = (s[0] + s[1]) / 2;
        if (tapestries.length < 3) {
          const p = at(f, u, 0.16);
          tapestries.push({ x: p.x, y: 0.55, z: p.z, rotY: f.rotY,
            w: Math.min(2.0, wSpan - 0.6), h: 2.40, folds: 5, amp: 0.055, sag: 0.05 });
        } else if (sconces.length < 4) {
          const p = at(f, u, 0.18);
          sconces.push({ x: p.x, y: 2.10, z: p.z, rotY: f.rotY });
        }
      }
    }
    // ...and a pair either side of the chimney breast, which is where a study actually has them
    if (chimney) {
      for (const s of [-1, 1]) {
        const u = chimney.x + s * (breastW / 2 + 0.85);
        if (u < sp.x0 + 0.4 || u > sp.x1 - 0.4) continue;
        if (back.cuts.some((c) => Math.abs(u - c.u) < c.w / 2 + 0.30)) continue;
        const p = at(back, u, 0.18);
        sconces.push({ x: p.x, y: 2.10, z: p.z, rotY: 0 });
      }
    }

    const plan = studyMod.studyPlan({
      x0: sp.x0, x1: sp.x1, z0: sp.z0, z1: sp.z1, h: H, closed: true,
      wallTop, corniceH: 0.40, corniceProj: 0.24, fieldLo: 0.44,
      walls: faces.map((f) => ({
        id: f.id, x: f.ox, z: f.oz, rotY: f.rotY, length: f.len,
        bays: Math.max(1, Math.round(f.len / 1.55)), cornice: false, uvWall: 2.9, skip: [],
        openings: [
          ...f.cuts.map((c) => toOpening(f, c, c.y0, c.y1)),
          // the breast is not an opening, but a raised panel behind 320 mm of masonry is a
          // panel nobody will ever see and a merge nobody should pay for
          ...(f === back && chimney
            ? [toOpening(f, { u: chimney.x, w: breastW }, 0, H)] : []),
          ...windows.filter((w) => w.face === f)
            .map((w) => toOpening(f, { u: w.u, w: w.w }, w.sill, winHead)),
        ],
      })),
      doors,
      windows: windows.map((w) => ({ wall: w.wall, x: w.x, y: 0, z: w.z, rotY: w.rotY,
        w: w.w, sill: w.sill, spring: w.spring, t: w.t, mullions: w.mullions, transoms: w.transoms })),
      chimney,
      pilasters,
      beams: {
        n: 7, span: sp.w - 0.50, h: 0.34, d: 0.30, y: H - 0.17,
        z0: sp.z0 + 1.30, z1: sp.z1 - 1.30,
        ridgeW: 0.42, ridgeH: 0.42, ridgeLen: sp.d - 0.50, ridgeY: H - 0.21,
      },
      tapestries,
      sconces,
    });
    plan.hearthWorld = chimney ? { x: chimney.x, y: 0.06, z: sp.z0 + 0.16 } : null;
    plan.windowsWorld = windows.map((w) => ({ x: w.x, z: w.z, rotY: w.rotY, u: w.u,
      w: w.w, sill: w.sill, head: winHead, face: w.face.axis, into: w.face.into }));

    /**
     * The window's collider — see the call site in `buildSpace`. The glass is solid, so the
     * aperture keeps a full-thickness box even though the geometry has a hole in it.
     */
    const solids = windows.map((w) => (w.face.axis === 'x'
      ? [w.face.t, winHead - w.sill, w.w, w.face.at - w.face.into * (w.face.t / 2),
        (w.sill + winHead) / 2, w.u]
      : [w.w, winHead - w.sill, w.face.t, w.u,
        (w.sill + winHead) / 2, w.face.at - w.face.into * (w.face.t / 2)]));

    return {
      kind: 'study', plan, base: null, solids,
      /**
       * ⚠️ **ALL FOUR WALLS, AND THE BAND HAS NO CUTS IN IT.** The study's windows sit in the
       * PANELLED storey, so the frieze above the cap is unbroken — which means the two height
       * bands' cut lists are genuinely disjoint and `buildWall`'s "sealed doorway" hazard
       * cannot arise here at all. The band only exists to change the MATERIAL of the top of the
       * wall from walnut to stone, and it costs nothing: the same wall area, in a bucket the
       * room already draws.
       */
      capFor() {
        return { capY: wallTop, band: { y0: wallTop, y1: H, cuts: [], key: 'skirt' } };
      },
      cutsFor(side) {
        return windows.filter((w) => w.face.side === side)
          .map((w) => ({ u: w.u, w: w.w, y0: w.sill, y1: winHead + 0.02 }));
      },
      emit(bin) {
        const built = studyMod.studyOrder(bin, {
          plan, base: null, remap: ORDER_KEYS_STUDY,
          material: { tapestry: mats.estate?.tapestry ?? null },
          mergeHangings: true,
          // the wall boxes already exist, with every doorway and dig face cut out of them, and
          // `buildWall` already drew this room's skirting where the openings are
          solid: false, skirt: false,
          parts: {
            upper: false, ceiling: false,
            // FurnProp owns the chimneypiece; breast stays for cornice die-in / wall mass.
            ...(furnDressEnabled() && chimney ? { chimney: false, chimneyBreast: true } : {}),
          },
        });
        for (const m of built.meshes) {
          m.castShadow = false; m.receiveShadow = true;
          sp.root.add(m);
        }
      },
    };
  }

  /**
   * 🆕 **THE BALLROOM — `views/room-ballroom.js`'s own order (PASS 85), at its REAL SIZE.**
   *
   * ⚠️ **THE MAPPING IS 1:1 AND THERE IS NO `base`.** The showcase's window wall is its `x0`
   * face and so is this room's; its mirror wall is `x1`, its arched end wall is `z0`, its near
   * wall is `z1`. The gallery needed a `rotY` and this does not — which also means there is no
   * chance of `gallery-order.js`'s "twelve paintings in the middle of the ballroom" class of bug.
   *
   * ⚠️ **AND LIKE THE STUDY, NOTHING IS AUTHORED PER OPENING.** The windows, the mirror wall's
   * piers, the near wall's pilasters and the corner urns are all chosen from the spans THIS
   * room's own connectors leave free. That matters more here than in either study: the ballroom
   * is the hub, with three doorways and a breach panel in one wall and four exit sites spread
   * over the other three, and every one of them is a hole a hand-placed pilaster could stand in.
   */
  function ballroomOrderFor(sp) {
    const H = sp.storey;
    const HP = Math.PI / 2;
    const SPLIT = 4.80;                      // `kit.STOREY` — the showcase's own storey break
    const WIN = { w: 2.05, sill: 1.05, h: 4.35 };
    const WIN_HALF = WIN.w / 2 + 0.62 + 0.36;   // a window plus its flanking pilaster
    const faces = [
      { side: 'xmin', id: 'window', axis: 'x', at: sp.x0, lo: sp.z0, hi: sp.z1 },
      { side: 'xmax', id: 'mirror', axis: 'x', at: sp.x1, lo: sp.z0, hi: sp.z1 },
      { side: 'zmin', id: 'end', axis: 'z', at: sp.z0, lo: sp.x0, hi: sp.x1 },
      { side: 'zmax', id: 'near', axis: 'z', at: sp.z1, lo: sp.x0, hi: sp.x1 },
    ];
    for (const f of faces) {
      const nb = neighbourAcross(sp, f.side);
      f.t = nb ? WALL_T / 2 : WALL_T;
      f.exterior = !nb;
      f.cuts = cutsOnWall(sp, f.axis, f.side, f.t);
    }
    const byId = (id) => faces.find((f) => f.id === id);
    /** is `u` clear of every opening in this wall, allowing `pad` either side? */
    const clear = (f, u, pad) => !f.cuts.some((c) => Math.abs(u - c.u) < c.w / 2 + pad)
      && u > f.lo + pad && u < f.hi - pad;

    // ---- the windows: the west wall, at the showcase's pitch where it fits -------------
    /**
     * ⚠️ **THE PITCH GIVES WAY, NOT THE WINDOW.** The showcase runs 4.2 m centres down a 16 m
     * wall with nothing else in it. This wall is 15.30 m and has `x.ballroom.terrace_w` in it at
     * z -5.45, which leaves 11.41 m of free span — and three windows at 4.2 with their flanking
     * pilasters need 12.41. So the COUNT is solved first (each window owns 2.05 m of wall
     * including its pier) and the pitch is whatever divides the span that is left. Scaling the
     * window itself was refused: `w 2.05 / sill 1.05 / h 4.35` crossing the 4.80 storey break is
     * the two-storey register, and it is the thing this port exists to bring across.
     */
    const wf = byId('window');
    const winZ = [];
    {
      const span = freeSpans(wf.cuts, wf.lo, wf.hi)
        .sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0] ?? null;
      if (span) {
        const usable = (span[1] - span[0]) - 2 * WIN_HALF;
        const n = usable < 0 ? 0 : Math.min(4, Math.floor(usable / 3.2) + 1);
        const pitch = n > 1 ? Math.min(4.2, usable / (n - 1)) : 0;
        const mid = (span[0] + span[1]) / 2;
        for (let i = 0; i < n; i++) winZ.push(mid + (i - (n - 1) / 2) * pitch);
      }
    }
    const winHead = WIN.sill + WIN.h;                              // 5.40, above the 4.80 split
    const winSpring = winHead - WIN.w / 2;

    // ---- the arches: over the OPEN doorways in the north wall ---------------------------
    /**
     * 🆕 **THREE, WHERE THE SHOWCASE HAS ONE, BECAUSE THIS WALL HAS THREE DOORS IN IT.** D4, D5
     * and D6 at x -8.60 / 0 / +8.60 are the hub's whole floor-plan identity. `archedOpening` is
     * the showcase's motif for a hole in a wall of this order, and putting it on the holes that
     * already exist costs no new geometry class and no new material key.
     * ⚠️ **OPEN doorways only, and the arch is fitted to the CUT rather than the other way
     * round.** A breachable panel is a wall until someone breaks it, and an arch over one would
     * advertise a route the level is trying not to advertise (`dig.md` §1). And an arch WIDER
     * than the hole `buildWall` cut would be an archivolt over solid masonry.
     * ⚠️ **`spandrelSteps` IS NOT OPTIONAL HERE.** `buildWall` cuts a RECTANGLE; an arch
     * springing inside it leaves the two corners above the springing line open into the wall
     * band — two triangular holes into the neighbour's room, which is exactly the class of
     * defect that does not throw and does not read as a bug from either side.
     */
    const ef = byId('end');
    const arches = [];
    for (const d of connectorDefs) {
      if (d.state !== CONNECTOR.OPEN) continue;
      if (d.a !== sp.id && d.b !== sp.id) continue;
      if (Math.abs(d.z - ef.at) > WALL_T + 1e-6) continue;
      const ap = aperture(d);
      /**
       * ⚠ **28 ARC SEGMENTS, AND THE UNITS CHANGED UNDER THIS NUMBER** (`ballroom-fix-1`).
       * `estate-3` filled the spandrel with a stack of BOXES and wrote *"10 steps, not the 6
       * `windowBay` uses ... at 6 steps over a 0.95 m radius the staircase silhouette is
       * legible"*. `critic-slice-2` confirmed 10 is still legible on a smoothed 3x crop, which
       * it always would be — a stepped circle keeps its corners at every count. The fill is now
       * ONE extruded polygon per side whose inner edge IS the arc (`ballroom-order.js`
       * `spandrel()`), so this is a CHORD count, not a riser count: at 28 over a 0.95 m radius
       * the chord sags 3 mm, under a fifth of a pixel at this station, and the triangle count
       * is the same as the ten boxes it replaces.
       */
      arches.push({
        x: d.x, w: ap.w, h: ap.y1, spring: ap.y1 - ap.w / 2, t: ef.t,
        inset: 0.005, spandrelSteps: BALLFIX ? 28 : 10, spandrelLegacy: !BALLFIX,
      });
    }

    // ---- the piers and pilasters, dropped where an opening is ---------------------------
    const mf = byId('mirror'), nf = byId('near');
    const pierZ = Array.from({ length: 7 }, (_, i) => sp.z1 - (i * sp.d) / 6)
      .filter((z) => clear(mf, z, 0.31 + 0.20));
    const nearX = Array.from({ length: 9 }, (_, i) => sp.x0 + (i * sp.w) / 8)
      .filter((x) => clear(nf, x, 0.33 + 0.20) || Math.abs(x - sp.x0) < 0.01 || Math.abs(x - sp.x1) < 0.01);

    /**
     * ---- the pier glasses on the mirror wall ----------------------------------------
     * 🆕 **THE WALL GETS ITS DEFINING MOTIF BACK** (`ballroom-fix-1`). `estate-3` shipped the
     * mirror wall as flat boiserie because the showcase's plates need a planar reflection pass
     * the game cannot pay for; `critic-slice-2` then ranked that wall the slice's worst frame.
     * A plate does not need a reflection to be a pier glass — it needs a gilt surround, a
     * cresting and a piece of dead silvering — and all three are already in the kit.
     *
     * ⚠️ **ONE PER BAY, CHOSEN FROM THE SAME PIER GRID THE PILASTERS USE, AND NOTHING IS
     * AUTHORED.** The plate sits at the MIDPOINT between two piers on the full (unfiltered)
     * grid, and is dropped if it clashes with anything cut into this wall — which is why the
     * bay containing `x.ballroom.terrace_e` gets none. Hand-placing four z values would have
     * put a mirror across the east terrace door the first time the floor plan moved.
     * ⚠️ Height is the showcase's own `1.55 x 3.30 at y 2.85`: it clears the 0.92 m dado rail,
     * stops 0.70 m under the musicians' gallery deck at 5.20, and is not scaled from a ratio.
     */
    const PLATE = { w: 1.55, h: 3.30, y: 2.85 };
    const mirrorPlates = [];
    if (BALLFIX && mats.estate?.ball?.mirror) {
      const grid = Array.from({ length: 7 }, (_, i) => sp.z1 - (i * sp.d) / 6);
      for (let i = 0; i + 1 < grid.length; i++) {
        const z = (grid[i] + grid[i + 1]) / 2;
        if (!clear(mf, z, PLATE.w / 2 + 0.25)) continue;
        mirrorPlates.push({ x: sp.x1 - 0.06, y: PLATE.y, z, rotY: -HP, w: PLATE.w, h: PLATE.h });
      }
    }

    // ---- the corner urns ------------------------------------------------------------
    /**
     * ⚠️ **IN THE CORNERS, AND WITH COLLIDERS, AND BOTH ARE DECISIONS.** `critic-estate-9` asked
     * for the far corners to have something to measure depth against, and the corners are also
     * the only part of a CHASE ARENA that is not a traffic lane — `spaces.js` says of this room
     * *"do not try to make this room safe"*, and a 0.46 m pedestal in the middle of the floor is
     * cover the design does not want. They get colliders because `estate-2` left exactly this
     * open for the study's furniture: *"a desk with no collider is something a robot and a 2.4 m
     * hunter walk through, which reads worse than an empty room."* Four 0.5 m boxes in four
     * corners is the cheapest possible version of taking that seriously.
     */
    const urns = [];
    for (const ux of [sp.x0 + 1.15, sp.x1 - 1.15]) {
      for (const uz of [sp.z0 + 1.15, sp.z1 - 1.15]) urns.push([ux, uz]);
    }

    const plan = ballMod.ballroomPlan({
      x0: sp.x0, x1: sp.x1, z0: sp.z0, z1: sp.z1, h: H, split: SPLIT, galleryY: 5.20,
      win: { ...WIN, n: winZ.length },
      winZ,
      bays: {
        window: Math.max(2, Math.round(sp.d / 1.95)),
        mirror: Math.max(2, Math.round(sp.d / 2.55)),
        end: Math.max(2, Math.round(sp.w / 3.4)),
        near: Math.max(2, Math.round(sp.w / 3.4)),
      },
      arches, pierZ, nearX, urns,
      // ⚠ EVERY CONNECTOR IN EVERY WALL, IN WORLD COORDINATES. `wallRun` needs them even though
      // the game passes `solid: false`: they are what `clashes()` uses to stop a raised and
      // fielded panel being drawn straight across a doorway. `kit.js`'s own note records that
      // bug costing `light.dark` a whole critique round.
      cuts: Object.fromEntries(faces.map((f) => [f.id,
        f.cuts.map((c) => ({ u: c.u, w: c.w, y0: c.y0, y1: c.y1 }))])),
      ceiling: {
        x: sp.cx, z: sp.cz, y: H - 0.02,
        roseZ: [sp.cz - sp.d * 0.28, sp.cz, sp.cz + sp.d * 0.28], roseX: [sp.cx - 7.6, sp.cx + 7.6],
        friezeY: H - 1.62,
      },
      sconceZ: winZ.map((z) => z),
      chandelierZ: [sp.cz - sp.d * 0.28, sp.cz, sp.cz + sp.d * 0.28],
    });
    plan.windowsWorld = winZ.map((z) => ({
      x: sp.x0, z, rotY: HP, u: z, w: WIN.w, sill: WIN.sill, head: winHead, face: 'x', into: 1,
    }));
    plan.archesWorld = arches.map((a) => ({ x: a.x, z: sp.z0, w: a.w, h: a.h }));
    // Same floor sites as ballroom-rig candelabra — FurnProp dress when `furn` is on.
    plan.furnCandelabra = [
      { x: sp.x0 + 2.6, z: sp.z1 - 2.4 },
      { x: sp.x1 - 3.4, z: sp.z0 + 2.6 },
    ];

    /**
     * The window's collider — the aperture is 2.05 x 4.35 in the house's OUTSIDE wall, and
     * `buildWall` gives a hole a sill and a lintel and nothing across it, which is right for a
     * doorway and wrong for a glazed one. `ThirdPersonCamera` raycasts the world to keep its
     * boom out of walls; without this the boom sails through a window and the frame goes black
     * from outside the building. Live play only, which is this project's most expensive class.
     * ...plus one 0.5 m box per corner urn — see the note above.
     */
    const solids = [
      ...winZ.map((z) => [wf.t, winHead - WIN.sill, WIN.w,
        sp.x0 - wf.t / 2, (WIN.sill + winHead) / 2, z]),
      // Urn colliders live on FurnProps when furniture dress is on (avoids double AABB).
      ...(furnDressEnabled() ? [] : urns.map(([ux, uz]) => [0.50, 1.90, 0.50, ux, 0.95, uz])),
    ];

    return {
      kind: 'ballroom', plan, base: null, solids,
      /**
       * ⚠️ **ALL FOUR WALLS CAP AT 4.80, AND ONLY THE WINDOW WALL'S BAND HAS HOLES IN IT.** The
       * band is the same boiserie with the top of each window in it, so it keeps the default
       * `wall` bucket and costs nothing — the same wall area, in a bucket the room already draws.
       *
       * 🚨 **AND THE WINDOW IS 5.40 m TALL, WHICH IS THE FIRST OPENING IN THIS PROJECT TO CROSS
       * THE CAP.** The gallery's clerestory lives entirely above it and the study's lancet
       * entirely below. Here the LOWER walk gets the cut and emits no lintel (its lintel starts
       * at 5.40, above the cap, so it is clipped to nothing but keeps its collider), and the BAND
       * walk emits the attic above 5.40. Two disjoint walks, one opening — which is also why
       * `estate-1`'s "SEALED DOORWAY" hazard cannot arise: no doorway shares this wall's band.
       */
      capFor(side) {
        const f = faces.find((q) => q.side === side);
        return {
          capY: SPLIT,
          band: {
            y0: SPLIT, y1: H,
            cuts: f?.id === 'window'
              ? winZ.map((z) => ({ u: z, w: WIN.w, y0: SPLIT, y1: winHead + 0.02 })) : [],
          },
        };
      },
      cutsFor(side) {
        if (side !== 'xmin') return [];
        return winZ.map((z) => ({ u: z, w: WIN.w, y0: WIN.sill, y1: winHead + 0.02 }));
      },
      emit(bin) {
        const built = ballMod.ballroomOrder(bin, {
          plan, base: null, remap: ORDER_KEYS_BALL,
          // the wall boxes already exist with every connector cut out of them, and `buildWall`
          // already drew this room's skirting where the openings are — but nothing else puts
          // anything at the 4.80 storey break, which is half of what makes two storeys read
          solid: false, skirtLower: false, skirtUpper: true,
          // ⚠ NO DADO ON THE WALL WITH THREE OPEN DOORWAYS IN IT — `wallRun`'s dado RAIL is one
          // continuous extrusion that openings do not cut, so it crossed all three at 0.92 m and
          // read as a barrier. See the note in `ballroom-order.js`.
          dado: { end: false },
          // 🆕 the pier glasses — see the note where `mirrorPlates` is resolved. `mirrorPlates`
          // is what makes the order hand the merged plate back instead of discarding it, and it
          // is the flag that keeps `views/room-ballroom.js` byte-identical.
          parts: {
            mirrors: mirrorPlates.length > 0,
            // FurnProp owns urns / consoles; keep architecture, skip merged dressing.
            ...(furnDressEnabled() ? { dressing: false } : {}),
          },
          mirrors: { pier: mirrorPlates },
          mirrorPlates: true,
          material: {
            baluster: mats.estate?.stone ?? mats.skirt,
            mirror: mats.estate?.ball?.mirror ?? null,
          },
        });
        for (const m of built.meshes) {
          m.castShadow = false; m.receiveShadow = true;
          sp.root.add(m);
        }
        // ⚠ ONE `InstancedMesh`, ONE DRAW CALL, ~47 balusters. It cannot go in the bin — an
        // instanced mesh is the opposite of a merge — and it is the cheapest way to draw a
        // balustrade that reads as turned stone rather than as a rail.
        if (built.instanced) {
          built.instanced.castShadow = false;
          built.instanced.receiveShadow = true;
          sp.root.add(built.instanced);
        }

        /**
         * 🆕 **THE DIRT, THE SAME LAYER THE SHOWCASE USES** (`world/patina.js`).
         *
         * `CRITIC_GUIDE.md` lists this first among the usual failures — grime collects in
         * corners, along the floor line, under sills — and `room.ballroom`'s round 17 added it
         * there after a critic put it at the top of the board. This room had the same problem
         * and worse: every surface as clean at the skirting as at eye height, on the largest
         * wall area in the house. The shader is shared rather than copied, so the two rooms
         * cannot drift.
         *
         * Two passes per wall, and they do different jobs — see the module for both. The band
         * is the skirting grime; the patina is the metre-scale blotching that gives the wall a
         * middle detail frequency, which is the guide's SECOND named failure and the thing this
         * room, all panels and mouldings and nothing in between, was most short of.
         *
         * ⚠️ `renderOrder` 7 AND 8, UNDER THE LIGHT POOLS. Everything here is a multiply over
         * opaque geometry and has to land before anything additive does.
         */
        {
          const SOOT = 0x8e9088;
          const BAND_H = 1.15;
          const PAT_H = Math.max(1, plan.h - 0.2);
          const wallLen = plan.z1 - plan.z0, endLen = plan.x1 - plan.x0;
          const put = (mesh, x, y, z, rotY, order) => {
            mesh.position.set(x, y, z);
            mesh.rotation.y = rotY;
            mesh.renderOrder = order;
            sp.root.add(mesh);
          };
          const faces = [
            [wallLen, plan.x0 + 0.06, 0, Math.PI / 2],
            [wallLen, plan.x1 - 0.06, 0, -Math.PI / 2],
            [endLen, 0, plan.z0 + 0.06, 0],
            [endLen, 0, plan.z1 - 0.06, Math.PI],
          ];
          for (const [len, x, z, rotY] of (ballPatina?.grimeBand ? faces : [])) {
            put(ballPatina.grimeBand({ w: len, h: BAND_H, tint: SOOT, strength: 0.5, corner: 1.15 }),
              x, BAND_H / 2, z, rotY, 8);
            put(ballPatina.grimeBand({ w: len, h: PAT_H, tint: SOOT, strength: 0, corner: 0, macro: 0.24 }),
              x, PAT_H / 2 + 0.1, z, rotY, 7);
          }
        }
      },
    };
  }

  /**
   * The gaps a wall has left between its openings, in the wall's own world coordinate.
   * `extra` blocks further ranges (a chimney breast, a window already placed).
   */
  function freeSpans(cuts, lo, hi, extra = []) {
    const blocks = [
      ...cuts.map((c) => [c.u - c.w / 2, c.u + c.w / 2]),
      ...extra.map((e) => [e.a, e.b]),
    ].sort((a, b) => a[0] - b[0]);
    const out = [];
    let cur = lo;
    for (const [a, b] of blocks) {
      if (a > cur + 0.01) out.push([cur, Math.min(a, hi)]);
      cur = Math.max(cur, b);
      if (cur >= hi) break;
    }
    if (cur < hi) out.push([cur, hi]);
    return out.filter((s) => s[1] - s[0] > 0.05);
  }

  /**
   * One wall run with openings cut out of it: solid infill between the cuts, a lintel above
   * each, and a sill below any cut that does not reach the floor. Carried straight from the
   * pre-mansion divider — it already did exactly this and it is the piece that makes a
   * doorway a hole rather than a decal.
   */
  function buildWall(sp, o) {
    const alongZ = o.axis === 'z';
    const put = o.put, solid = o.solid, tracked = o.tracked;
    /**
     * @param track  dig-segment key, or null. A TRACKED box is never clipped by `capY` — its
     *               vertex range has to stay exactly what the hunter's crossing will collapse,
     *               and a clipped lintel is a floating band over a hunter-sized hole.
     */
    const box = (w, h, u, y, track = null) => {
      // `w` runs along the wall, `h` is height, and the thickness is o.t across the normal
      const emit = track && tracked ? tracked : put;
      // GEOMETRY may be shorter than the COLLIDER. See the `capY` note at the call site: the
      // kit's clerestory band replaces the top of this wall, but nothing may become walkable
      // or see-through-able as a side effect of a look change.
      let gh = h, gy = y;
      if (o.capY != null && !track) {
        const bot = y - h / 2, top = y + h / 2;
        if (top > o.capY) { const t2 = Math.max(bot, o.capY); gh = t2 - bot; gy = (bot + t2) / 2; }
      }
      const geo = gh > 1e-4
        ? (alongZ ? emit('wall', w, gh, o.t, u, gy, o.at) : emit('wall', o.t, gh, w, o.at, gy, u))
        : null;
      const b = alongZ ? solid(w, h, o.t, u, y, o.at) : solid(o.t, h, w, o.at, y, u);
      if (track) lintelOf.set(`${sp.id}|${track}`, { geo, box: b, space: sp });
    };
    const skirt = (w, u) => {
      const k = o.skirtShrink ?? 1.0;
      if (alongZ) put('skirt', w * k, 0.34, o.t + 0.03, u, 0.17, o.at, 0.6);
      else put('skirt', o.t * k, 0.34, w + 0.03, o.at, 0.17, u, 0.6);
    };

    /**
     * ⚠️ **SORTED BY LEFT EDGE, NOT BY CENTRE, AND THAT IS THE DIFFERENCE BETWEEN A SLAB WITH A
     * DOORWAY IN IT AND 2.96 m OF MASONRY STANDING INSIDE ONE.** The infill test below is an
     * EDGE test against a `cursor` that only advances to a cut's RIGHT edge. For disjoint cuts
     * centre-order and edge-order are the same order — which is why this was correct for every
     * opening in the house and why `_ap3-golden.mjs` finds 15740 leaves unmoved. Nest a 2.08 m
     * doorway at u −20.00 inside a 15.40 m slab centred at −16.30 and they come apart: the
     * doorway sorts FIRST, the walk still has `cursor` at the wall's start, and the 2.96 m in
     * front of the doorway is filled with a full-storey box and a skirting board — inside the
     * span the slab owns. `_ap3-geom.mjs` A1 is the number.
     *
     * `|| (b.w - a.w)` puts the WIDER cut first when two share a left edge, so a contained cut
     * always meets its container before itself.
     */
    const cuts = [...o.cuts].sort((a, b) => ((a.u - a.w / 2) - (b.u - b.w / 2)) || (b.w - a.w));
    const done = [];
    let cursor = o.u0;
    for (const c of cuts) {
      const left = c.u - c.w / 2, right = c.u + c.w / 2;
      if (left > cursor + 0.01) {
        const w = left - cursor;
        box(w, o.H, cursor + w / 2, o.H / 2);
        skirt(w, cursor + w / 2);
      }
      /**
       * 🕳️ **THE LINTEL, AND OVER A DIG SEGMENT IT IS A MECHANIC RATHER THAN INFILL.**
       *
       * A segment is 1.80 m tall (`dig.js` `SEG_H`), so this box is the 3.00 m of wall standing
       * on top of it — real geometry with a real collider, whose BASE is at 1.80. `boxesNear`
       * admits a body under it when `y + passH <= base`, so a 1.70 m robot walks through a dug
       * segment and a 2.40 m hunter does not. **The exclusion is therefore physical, not a flag**
       * — the same thing that stops the hunter is the thing you can see above the hole.
       *
       * It is TRACKED for dig cuts only, because the hunter's crossing has to take it with the
       * brick: a hunter-sized hole is full height by definition. Every other lintel in the house
       * goes through the untracked path and is byte-identical to before.
       */
      /**
       * 🚪 **A CUT THAT LIVES WHOLLY INSIDE AN EARLIER CUT OWES THIS WALK NOTHING.** A doorway
       * inside a dig face is already a hole: the face carries it as an `apertures` rect in its
       * `DamageField`, the host's lintel already covers everything above the host's own head, and
       * the sliver between the two heads (2.68 m in a 2.80 m band) is drawn by the destructible
       * face itself. Emitting a second lintel there puts 2.08 x 2.12 m of coincident wall in one
       * merged bin, twice per face — see `_ap3-geom.mjs` A1.
       *
       * 🚨 **AN OVERLAP THAT IS NOT A CONTAINMENT IS REFUSED, NOT GUESSED AT.** A doorway taller
       * than the band it sits in would need to CUT the host's lintel, and no visit order of a
       * single-pass walk can do that. Nothing in the house or in `dig.js` `SLAB_DOORWAYS` can
       * produce that shape, so this is a tripwire for a generator, not a live branch — and it
       * warns rather than throws, because a throw at build time paints "VIEW … FAILED" over the
       * whole game and a floor plan that does not fit is not a crash.
       */
      const host = done.find((d) => d.u - d.w / 2 <= left + 1e-6
        && d.u + d.w / 2 >= right - 1e-6 && d.y0 <= c.y0 + 1e-6 && d.y1 >= c.y1 - 1e-6);
      if (!host) {
        if (done.some((d) => d.u - d.w / 2 < right - 1e-6 && d.u + d.w / 2 > left + 1e-6)) {
          console.warn(`[room] buildWall: overlapping cuts that do not nest on ${sp.id} ${o.axis}@${o.at} — the opening at ${c.u} is not representable by this walk`);
        }
        if (c.y1 < o.H) { const h = o.H - c.y1; box(c.w, h, c.u, c.y1 + h / 2, c.dig ?? null); }
        if (c.y0 > 0.01) box(c.w, c.y0, c.u, c.y0 / 2);
      }
      done.push(c);
      cursor = Math.max(cursor, right);
    }
    // ⚠️ **THE SAME 0.01 m THE LEADING TEST USES, AND IT IS NOT TIDINESS.** `-16.3 + 7.7` is
    // `-8.600000000000001`, so a cut that reaches exactly `o.u1` — which is what a slab spanning
    // its whole wall does — left `cursor` one ULP past it and this branch emitted a ZERO-WIDTH
    // full-storey box and skirting board. Four of them on plain `?slab=1`, doorway or no doorway.
    // The BAND walk below has always guarded this (`if (w < 1e-4) return;`); this walk had not.
    if (o.u1 - cursor > 0.01) {
      const w = o.u1 - cursor;
      box(w, o.H, cursor + w / 2, o.H / 2);
      skirt(w, cursor + w / 2);
    }

    /**
     * 🆕 **THE CLERESTORY STOREY — the band `capY` took off, put back with holes in it.**
     *
     * Geometry only: every collider on this wall was already emitted at full height above, so
     * a second set here would be a duplicate, and duplicated colliders are how a room acquires
     * a wall you can neither see nor walk through.
     *
     * ⚠️ **THE BAND'S OPENINGS DO NOT INTERACT WITH THE DOORWAY CUTS ABOVE, AND THEY MUST NOT.**
     * Sharing one cut list would put the clerestory into `buildWall`'s single sorted walk, and
     * a clerestory whose 1.62 m span overlaps a 1.90 m doorway in `u` — which four of the
     * gallery's seven do — makes that walk emit a solid "sill" box from the floor to the
     * window, SEALING THE DOORWAY. It does not throw and it does not look like a bug from
     * outside; the door is simply a wall. Two independent walks over two disjoint height bands
     * cannot produce it.
     */
    if (o.band) {
      const b = o.band;
      /**
       * 🆕 **THE BAND CARRIES ITS OWN BUCKET KEY.** The gallery's upper storey is more of the
       * same damask with clerestory holes in it (`wall`); the study's is a STONE FRIEZE over a
       * panelled storey, which is the whole two-storey read and half of what makes a walnut
       * room stop looking like a walnut box. Defaulting to `wall` keeps the gallery
       * byte-identical, and re-pointing a band at a bucket the room already draws costs zero
       * draw calls.
       */
      const bkey = b.key ?? 'wall';
      const bcuts = [...b.cuts].sort((p, q) => p.u - q.u);
      const seg = (w, u) => {
        if (w < 1e-4) return;
        if (alongZ) put(bkey, w, b.y1 - b.y0, o.t, u, (b.y0 + b.y1) / 2, o.at, 1.2);
        else put(bkey, o.t, b.y1 - b.y0, w, o.at, (b.y0 + b.y1) / 2, u, 1.2);
      };
      const above = (w, u, y0, y1) => {
        if (y1 - y0 < 1e-4 || w < 1e-4) return;
        if (alongZ) put(bkey, w, y1 - y0, o.t, u, (y0 + y1) / 2, o.at, 1.2);
        else put(bkey, o.t, y1 - y0, w, o.at, (y0 + y1) / 2, u, 1.2);
      };
      let cur = o.u0;
      for (const c of bcuts) {
        const left = c.u - c.w / 2, right = c.u + c.w / 2;
        if (left > cur + 0.01) seg(left - cur, cur + (left - cur) / 2);
        // under and over the opening, within the band
        above(c.w, c.u, b.y0, Math.max(b.y0, Math.min(b.y1, c.y0)));
        above(c.w, c.u, Math.max(b.y0, Math.min(b.y1, c.y1)), b.y1);
        cur = Math.max(cur, right);
      }
      if (cur < o.u1) seg(o.u1 - cur, cur + (o.u1 - cur) / 2);
    }
  }

  /**
   * Connectors that pierce this space's boundary wall on `side`.
   *
   * ⚠️ ONE LOOP OVER ONE LIST, USING THE SAME `aperture()` THE BUILD LOOP USES. It was two
   * loops with two hand-written sets of defaults, and the failure mode of that arrangement does
   * not throw: a row whose defaults were applied one way here and another way there gives a
   * panel embedded in a solid wall — it opens, you walk at the aperture, and the wall is still
   * there — or a hole in the building with nothing in it. The doorway/panel difference survives
   * exactly where it belongs, inside `aperture()`: an OPEN connector's cut starts at the floor
   * and reaches its lintel, a closed one's is the shared 2.08 x 2.68.
   */
  function cutsOnWall(sp, axis, side, t) {
    const out = [];
    const lo = side === 'zmin' ? sp.z0 - WALL_T : side === 'zmax' ? sp.z1
      : side === 'xmin' ? sp.x0 - WALL_T : sp.x1;
    const hi = lo + WALL_T;
    const inBand = (v) => v >= lo - 1e-6 && v <= hi + 1e-6;
    for (const d of connectorDefs) {
      if (d.a !== sp.id && d.b !== sp.id) continue;
      if (d.a === d.b) continue;
      if (axis === 'z' ? !inBand(d.z) : !inBand(d.x)) continue;
      /**
       * 🚪 **AN OPEN HOLE MUST LAND IN A WALKABLE ROOM ON BOTH SIDES.** Playtest: John walked
       * out of the mansion through a doorway whose named neighbour did not cover this `u` —
       * leftover envelope, or a 5 cm corridor sliver. Seal it: no cut, the wall stays wall.
       * Closed connectors (exit / chained / breachable / dig) still cut; a panel fills them.
       * `b: 'outside'` EXIT sites stay sealed-by-panel, not open-to-void.
       */
      if ((d.state ?? CONNECTOR.BREACHABLE) === CONNECTOR.OPEN) {
        const farOutside = d.a === 'outside' || d.b === 'outside';
        if (farOutside) continue;
        const u = axis === 'z' ? d.x : d.z;
        if (!walkableNeighbourAt(sp, side, u)) continue;
      }
      const ap = aperture(d);
      // ⚠️ `dig` IS THE COLUMN KEY, NOT THE PANEL ID, AND THAT IS DELIBERATE. Both sides of one
      // segment (`d.<edge>.<i>.a` and `.b`) cut the SAME hole in the SAME two spaces' skins and
      // `dedupeCuts` keeps whichever came first, so keying the lintel on a panel id would make
      // which side "owns" it depend on table order. The column is the physical thing.
      out.push({ u: axis === 'z' ? d.x : d.z, w: ap.w, y0: ap.y0, y1: ap.y1,
        dig: d.dig ? `${d.edge}.${d.seg}` : null });
    }
    return dedupeCuts(out);
  }

  /** The same, for a wall that is not a space boundary (M1's divider; `INNER_WALLS` is empty). */
  function cutsOnInnerWall(w) {
    const alongZ = w.axis === 'z';
    const out = [];
    for (const d of connectorDefs) {
      if (d.wall !== w.id) continue;
      const ap = aperture(d);
      out.push({ u: alongZ ? d.x : d.z, w: ap.w, y0: ap.y0, y1: ap.y1 });
    }
    return out;
  }

  function neighbourAcross(sp, side) {
    for (const t of spaces) {
      if (t === sp) continue;
      if (side === 'zmin' && near(t.z1 + WALL_T, sp.z0) && span(t.x0, t.x1, sp.x0, sp.x1)) return t;
      if (side === 'zmax' && near(t.z0 - WALL_T, sp.z1) && span(t.x0, t.x1, sp.x0, sp.x1)) return t;
      if (side === 'xmin' && near(t.x1 + WALL_T, sp.x0) && span(t.z0, t.z1, sp.z0, sp.z1)) return t;
      if (side === 'xmax' && near(t.x0 - WALL_T, sp.x1) && span(t.z0, t.z1, sp.z0, sp.z1)) return t;
    }
    return null;
  }

  /**
   * Neighbour that actually occupies THIS `u` on the wall, and is wide enough to walk into.
   * `neighbourAcross` only asks "does any span overlap" — a corridor covering the north 3 m
   * of a 15 m wall still made the whole wall interior-thin, and a door in the leftover south
   * opened into void.
   */
  function walkableNeighbourAt(sp, side, u) {
    for (const t of spaces) {
      if (t === sp) continue;
      if (Math.min(t.x1 - t.x0, t.z1 - t.z0) < MIN_LANDING_SPAN) continue;
      if (side === 'zmin' && near(t.z1 + WALL_T, sp.z0)
          && u >= Math.max(t.x0, sp.x0) - 1e-6 && u <= Math.min(t.x1, sp.x1) + 1e-6) return t;
      if (side === 'zmax' && near(t.z0 - WALL_T, sp.z1)
          && u >= Math.max(t.x0, sp.x0) - 1e-6 && u <= Math.min(t.x1, sp.x1) + 1e-6) return t;
      if (side === 'xmin' && near(t.x1 + WALL_T, sp.x0)
          && u >= Math.max(t.z0, sp.z0) - 1e-6 && u <= Math.min(t.z1, sp.z1) + 1e-6) return t;
      if (side === 'xmax' && near(t.x0 - WALL_T, sp.x1)
          && u >= Math.max(t.z0, sp.z0) - 1e-6 && u <= Math.min(t.z1, sp.z1) + 1e-6) return t;
    }
    return null;
  }
}

const near = (a, b) => Math.abs(a - b) < 1e-6;
const span = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0) > 1e-6;

/**
 * ONE HOLE PER OPENING, however many connectors describe it.
 *
 * ⚠️ WHY THIS IS NEEDED AND WHY IT IS INERT ON THE SHIPPED TABLE. `docs/design/dig.md`'s
 * two-sidedness gives each segment TWO panels — one per room, each digging its own side of the
 * shared brick — and both of them land in the same 0.30 m wall band with the same `u`, `w` and
 * height. `buildWall` walks the cut list in order: the second identical cut produces no infill
 * (its left edge is already behind the cursor) but DOES emit a second lintel and sill on top of
 * the first, which is z-fighting geometry paid for twice.
 *
 * On the shipped table no two connectors share a `(u, w, y0, y1)` — the ids are unique places in
 * the house — so this filter removes nothing and `?dig=0` builds the same walls it always did.
 * Measured rather than argued: `dig-toggle.mjs` compares the arm-off mesh, triangle and
 * collider counts against the pre-change build.
 */
function dedupeCuts(cuts) {
  const seen = new Set();
  const out = [];
  for (const c of cuts) {
    const k = `${c.u.toFixed(4)}|${c.w.toFixed(4)}|${c.y0.toFixed(4)}|${c.y1.toFixed(4)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/** Alias: this IS the mansion builder now. `buildTestRoom` is kept as the import site name. */
export { buildTestRoom as buildMansion };

// ---------------------------------------------------------------------------

/**
 * 🆕 **THE ESTATE KIT'S KEY NAMES, MAPPED ONTO THE BUCKETS THIS ROOM ALREADY DRAWS.**
 *
 * This table IS the draw-call budget for the port. Every kit key that resolves to an existing
 * bucket costs nothing at all, because `GeoBin` merges the whole bucket into one mesh — so the
 * window reveals ride in with the skirting and the coffer pans ride in with the ceiling.
 * Exactly three keys are genuinely new (`gilt`, `wood`, `clere`), and each earns it:
 *
 *   gilt   the pale gilt of the frames, capitals and coffer bosses. Merging it into `mould`
 *          would work, and `room-gallery.js`'s own round-3 note is why it must not: gilt is a
 *          METAL with no diffuse term, so a gilt cornice reflects the room multiplied by gold
 *          and measured 5.5:1 red-to-blue. Gilt belongs on frames and bosses ONLY.
 *   wood   the coffer beams, the window leadwork and the console. Same argument, other way up:
 *          the top third of every frame down this room is coffer, and it must not be gold.
 *   clere  emissive stained glazing. Nothing in the shipped game is emissive at all.
 */
const ORDER_KEYS = {
  wall: 'wall', gilt: 'gilt', wood: 'wood', clere: 'clere',
  stone: 'skirt', wintrim: 'skirt', ceil: 'ceiling', marbleTop: 'floor',
};

/**
 * 🆕 **THE STUDY'S KEY TABLE, AND IT IS THREE NEW BUCKETS FOR A WHOLE ROOM.**
 *
 * Same arithmetic as the gallery's: a draw call is a MATERIAL KEY, not a quantity of geometry,
 * so every kit key that lands in a bucket this room already merges is free. The panelling rides
 * in with the wall, every moulding and the beams ride in with the `mould` the cornice band
 * already uses, and the whole stone frieze, the window trim and the cartouche's sunk ground
 * ride in with the skirting. Exactly three keys are genuinely new and each has to earn it:
 *
 *   cstone  the chimneypiece. It CANNOT share `skirt`, and this is measured rather than
 *           preferred: `room-study.js` re-cropped the art and found the stone is 23% BRIGHTER
 *           than the walnut beside it while the render had it 27% DARKER — "the relationship is
 *           inverted, which is the actual reason the chimneypiece reads as a dead slab". The
 *           frieze stone is deliberately half that value (it is the top third of the frame and
 *           nothing lights it). One albedo cannot be both.
 *   dark    the firebox and the beams. The art's reliable black is a HOLE in the brightest
 *           object in the frame; routed to any stone it becomes a legible grey cave.
 *   clere   the glazing. Nothing in the shipped game is emissive at all, and this is the one
 *           thing in the room that pays for itself in light rather than in draw calls.
 *
 * ⚠️ **AND `gilt` IS NOT IN THE LIST, WHICH IS A DECISION.** The only gilt in the showcase's
 * architecture is `doorCase`'s bead and the hearth fender; the game passes `gilt: false` on its
 * door cases and does not take the loose furniture, so the bucket never exists. A fourth merged
 * mesh per study, in two studies, for a 28 mm bead nobody can see at play distance.
 */
const ORDER_KEYS_STUDY = {
  wood: 'wall', trim: 'mould', stoneUp: 'skirt', wintrim: 'skirt', stoneGround: 'skirt',
  stone: 'cstone', soot: 'dark', dark: 'dark', glass: 'clere',
  ceil: 'ceiling', gilt: 'gilt', marbleTop: 'floor',
};

/**
 * 🆕 **THE BALLROOM'S KEY TABLE — THREE NEW BUCKETS FOR THE BIGGEST ROOM IN THE HOUSE**
 * (`estate-3`). Same arithmetic as the other two: a draw call is a MATERIAL KEY, not a quantity
 * of geometry, so every kit key landing in a bucket this room already merges is free. The
 * panelling, the arch reveals and soffits, the gallery deck's underside and every spandrel ride
 * in with `wall`; the urn pedestals, the balustrade plinth and the whole window surround ride in
 * with the skirting. Exactly three are new and each has to earn it:
 *
 *   gilt   the mouldings, cornices, capitals, coffer beams and bosses, ceiling roses, the
 *          gallery deck and its brackets, the balustrade rail and the arch trim. It CANNOT
 *          share `mould`: `room-gallery.js`'s round-3 note is that gilt is a METAL with no
 *          diffuse term, measured at 5.5:1 red-to-blue, and this is the room where it covers
 *          most of the joinery rather than an accent — but `mould` is also the SIX COLONNADE
 *          PIERS, which are 0.95 m square and 9.6 m tall. One bucket cannot be both a moulding
 *          and a pier without one of them being wrong.
 *   clere  the glazing, and it is `mats.clearGlass` rather than a new bake: `materials-local.js`
 *          authored that entry FOR this room (*"clear leaded daylight glazing for the ballroom
 *          and the gallery"*, `medallion: 0`, `emissive: 3.4`). It is the one thing in the room
 *          that pays for itself in light rather than in draw calls, which is the whole reason
 *          the rig can leave the key light where the colonnade needs it.
 *   drape  the crimson velvet at every window head. `estate-owner-15` spent a round proving the
 *          drape GEOMETRY had always been there and the MATERIAL had not — *"indistinguishable
 *          from shadow"* at 0x3a0d10 — and solved 0xc02030 against the bar's own shaded drapery
 *          pixels. It is the only saturated colour in a room of gilt, boiserie and grey stone,
 *          and routing it to any of them deletes it.
 *
 * ⚠️ **`frieze` IS MERGED INTO `gilt`, WHICH IS A DECISION.** The showcase bakes a separate
 * `giltFrieze` (an anthemion ornament) for four 0.46 m bands under the cornice. In the game
 * those bands sit at **7.98 m** in a room whose nearest station is 8 m away — an ornament nobody
 * can resolve, for a fourth merged mesh and a fourth bake. Plain gilding at that height is the
 * same pixels.
 */
const ORDER_KEYS_BALL = {
  wall: 'wall', gilt: 'gilt', frieze: 'gilt', glass: 'clere', drape: 'drape',
  stone: 'skirt', wintrim: 'skirt', ceil: 'ceiling', marbleTop: 'floor',
};

/**
 * Buckets that must not cast a shadow. See the note at the call site.
 * `dark` joins them for the study: the beams sit against the ceiling and the firebox sits
 * inside a chimneypiece, so neither can cast anything a player will ever see — and a casting
 * bucket is a second draw of that mesh in the shadow pass. Inert for the gallery, which has no
 * `dark` bucket at all.
 */
const NO_CAST = new Set(['clere', 'ceiling', 'dark']);

/**
 * @param sp  the space being built, or null. Only present so a space with an ORDER can take the
 *            showcase's own surfaces without repainting the whole house — `?estate=port` is a
 *            gallery change, and every other room must render exactly as it did.
 */
function binMaterials(m, sp = null) {
  /**
   * 🚨 **GATED ON `orderPlan`, NOT ON `sp.order` — AND THE FIRST BUILD OF `estate-2` WAS NOT.**
   *
   * `sp.order` is a floor-plan FACT (`spaces.js` says this room has an order); `sp.orderPlan` is
   * a BUILD fact (the order actually resolved and was emitted). Keyed on the first, the ablation
   * arm `?estate=port,nostudy` repainted both studies in walnut and marble while building the
   * shipped boxes — so the "before" capture of this very port came back with a marble floor in
   * it, and the arm that is supposed to be the 2026-08-08 default bit for bit was not.
   *
   * That is HANDOFF's `?cam=r10` finding wearing a third hat: **a toggle that reverts less than
   * it claims contaminates every comparison made with it.** It is also only visible in a
   * PICTURE — the draw-call delta is unaffected, because a different material in the same bucket
   * is the same draw call. Caught by looking at the before shot rather than at the numbers.
   *
   * The gallery arm takes the same gate. It is a no-op there whenever the module imports (which
   * is always), and it closes the identical hole for the case where it does not.
   */
  const E = (sp?.order === 'gallery' && sp?.orderPlan && m.estate) ? m.estate : null;
  /**
   * 🆕 **THE STUDY'S SURFACES, AND EVERY LINE OF IT IS THE SHOWCASE'S OWN MEASURED VALUE.**
   *
   * Deliberately a SEPARATE table from the gallery's rather than a merged one: `?estate=port`
   * repaints two rooms now and it must repaint neither of the other four. The keys that differ
   * from the gallery's are the whole point — a study is walnut and grey stone where a gallery
   * is faded damask, and that difference is most of what makes them read as different rooms
   * rather than as the same box twice.
   *
   * ⚠️ **`floor` GOES TO MARBLE, AND IT IS ONE LINE AND ZERO DRAW CALLS.** The locked art's
   * study floor is a grey-white veined slab and it is the FIRST read in both reference frames.
   * If a critic rules it too bright for a horror level, this line is the revert.
   */
  const S = (sp?.order === 'study' && sp?.orderPlan && m.estate?.study) ? m.estate.study : null;
  /**
   * 🆕 **THE BALLROOM'S SURFACES** (`estate-3`), gated the same way and for the same reason.
   *
   * ⚠️ **THE FLOOR IS NOT TOUCHED, AND THAT IS THE SHOWCASE'S OWN ANSWER RATHER THAN A
   * SHORTCUT.** `room-ballroom.js` ran an edge-to-edge marble chequer for thirteen rounds and
   * `estate-owner-14` replaced it: *"the bar has a floor of WOOD PARQUET with chequer marble only
   * at the room's EDGES; this piece has run chequer edge to edge since round 1."* The game's
   * `floor` key IS `parquetMat`. Routing this room to marble would be undoing a measured
   * correction in order to look more like the version that was corrected — and it would repeat
   * `estate-2`'s blown-white-sheet defect on the biggest floor in the house.
   *
   * ⚠️ **`mould` GOES TO STONE, NOT GILT, AND IT IS THE COLONNADE THAT DECIDES IT.** That bucket
   * carries six 0.95 m piers standing the full 9.6 m — the room's gameplay, `spaces.js`'s *"cover
   * you have to use well"* — and gilt is a metal with no diffuse term. Six gold columns would be
   * the brightest thing in a survival-horror arena and would read as the answer to a question
   * nobody asked. Every actual moulding in the room is in the `gilt` bucket instead.
   */
  const BR = (sp?.order === 'ballroom' && sp?.orderPlan && m.estate?.ball) ? m.estate.ball : null;
  if (BR) {
    return {
      wall: BR.wall,
      floor: BR.floor ?? m.floor,
      ceiling: BR.ceil,
      mould: BR.stone,
      skirt: BR.stone,
      gilt: BR.gilt,
      clere: BR.clere,
      drape: BR.drape,
      marble: m.marble ?? m.floor, paper: m.paper ?? m.wall,
      ...(m.brick ? { brick: m.brick } : {}),
    };
  }
  if (S) {
    return {
      wall: S.wood,
      floor: S.marble ?? m.floor,
      ceiling: S.ceil ?? m.ceiling,
      mould: S.trim,
      skirt: S.stoneUp,
      cstone: S.stone,
      dark: S.dark,
      clere: S.clere,
      gilt: S.gilt ?? m.mould,
      wood: S.wood, marble: m.marble ?? m.floor, paper: m.paper ?? m.wall,
      ...(m.brick ? { brick: m.brick } : {}),
    };
  }
  return {
    wall: E?.damask ?? m.wall,
    floor: m.floor,
    ceiling: E?.ceil ?? m.ceiling,
    mould: m.mould,
    skirt: E?.stone ?? m.skirt,
    gilt: E?.gilt ?? m.mould,
    wood: E?.wood ?? m.mould,
    clere: E?.clere ?? m.mould,
    marble: m.marble ?? m.floor, paper: m.paper ?? m.wall,
    // ⚠️ ONLY PRESENT UNDER `?dig=1`. `GeoBin.build` warns and SKIPS a bucket with no material,
    // so a missing key would silently drop the barrier rather than throw — but nothing puts into
    // the `brick` bucket unless the flag is on, so the bucket does not exist either.
    ...(m.brick ? { brick: m.brick } : {}),
  };
}

async function tryImport(fn) { try { return await fn(); } catch { return null; } }

/**
 * Materials, pulled from `estate-agent`'s local set when it is there and degraded to
 * plain PBR when it is not. Deliberately a SMALL set: `estateMaterials()` bakes two 2048
 * marbles plus a dozen others, which is most of the texture budget for one test room, and it
 * is a globally-cached object owned by another agent. Import the individual makers; never
 * couple the game's load path to that cache.
 */
async function loadMaterials(engine, want = {}) {
  const L = await tryImport(() => import('../world/materials-local.js'));
  const call = (fn, args, fallback) => {
    if (typeof fn !== 'function') return fallback();
    try { return fn(args); } catch { return fallback(); }
  };
  const plain = (c, r, mtl = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: mtl });

  return {
    floor: call(L?.parquetMat, { size: 1024 }, () => plain(0x3a2a1c, 0.62)),
    // ⚠️ 0.300/0.258/0.212, NOT 0.126/0.086/0.062, AND THIS ONE LINE IS MOST OF WHY THE GAME
    // FRAME WAS BLACK. Measured: `grade.mjs` on the M2 capture returned a median pixel
    // luminance of 5.9 against a 30-60 gate, on a frame whose largest surface by far is this
    // material. sRGB 0.126 is LINEAR 0.0144 — a 1.4% reflector, darker than any estate
    // surface by a factor of four and darker than soot. No light rig can fix a wall that
    // absorbs 98.6% of what hits it; raising the lights instead just moves the black around.
    // For comparison the same maker's default is 0.560 and `prop-chandelier.js` uses 0.395.
    // The second half of the fix is the SATURATION: r/b was 2.03, which is what made every
    // capture read as one flat amber however the grade was tuned, because the amber was in
    // the albedo. 1.42 keeps the room warm without painting it.
    wall: call(L?.boiserieMat, { paint: [0.300, 0.258, 0.212], grime: 0.9, size: 1024 }, () => plain(0x51443a, 0.72)),
    ceiling: call(L?.ceilingMat, { size: 512 }, () => plain(0x554d42, 0.9)),
    mould: call(L?.giltMat, { wear: 0.55, size: 512 }, () => plain(0x6a5628, 0.45, 0.7)),
    skirt: call(L?.stoneMat, { stone: [0.20, 0.175, 0.15], size: 512 }, () => plain(0x201b16, 0.85)),
    reveal: plain(0x1c1710, 0.95),
    /**
     * THE BARRIER'S BRICK — `?dig=1` only, and it is `stoneMat` rather than a new shader.
     *
     * `dig.md` §6a.1 settled that the barrier is masonry and that the reference set already
     * photographs it: `refs/lath/lath-tower-of-london.jpg` is *"bare framing against BRICK — the
     * stage-3 reference"* and `refs/lath/demo-selective-12.jpg` is *"plaster stripped back to
     * brick with lath fragments"*. Lath and plaster on studs, in front of a masonry wall, is a
     * real building.
     *
     * ⚠️ **THE COURSE LINES ARE THE POINT, NOT THE COLOUR.** `dig.md` §6a.2 rules out a HUD
     * percentage — *"an explicit percentage replaces a physical tell with a number and throws
     * away the best part of the design"* — and says to spend the legibility on the WALL instead.
     * `STONE_SURFACE`'s `uCourse` is a running-bond `rowGrid` with bricks twice as wide as they
     * are tall, i.e. exactly brick bond, and `room.js`'s GeoBin world-projects the UVs at 0.9 m,
     * so the courses are a real, consistent scale across every barrier in the house and they are
     * the ruler the eye measures a dig against.
     *
     * ⚠️ It is deliberately DARK and sooty rather than a bright pillar-box red. This is a
     * horror level lit by five lights and the room material next to it is a 0.300/0.258/0.212
     * boiserie; a saturated brick would be the brightest thing in the frame and would read as
     * the answer rather than as the absence of one. `dig.md` §5: *"do not make the barrier look
     * like failure — make it look like an ANSWER."*
     *
     * NOT_BUILT and honestly stated: this is a first pass by a builder, it has never been near
     * `refs/lath/*`, and it has not been judged. `mat.lath` is still NOT_BUILT and a real
     * `mat.brick` piece belongs on the board beside it.
     */
    brick: want.brick
      ? call(L?.stoneMat,
        { stone: [0.300, 0.176, 0.140], soot: 0.75, course: 10, seed: 23.0, size: 1024 },
        () => plain(0x3a241b, 0.88))
      : null,

    /**
     * 🆕 **THE SHOWCASE'S OWN SURFACES, `?estate=port` ONLY, AND THE HEADER'S WARNING STILL
     * STANDS — WHICH IS WHY THIS IS BEHIND A FLAG AND MEASURED.**
     *
     * The note above this function says never to couple the game's load path to
     * `estateMaterials()`, on the grounds that it *"bakes two 2048 marbles plus a dozen
     * others"*. `estate-spike-1` re-measured that and the number in the note is wrong for this
     * use: **`estateMaterials()` is a table of LAZY GETTERS**, so touching six keys bakes six,
     * and the whole `mat` arm measured **83-94 ms of bake and 31 textures** — not the 18-24 s
     * the record claims, which is what a SHOWCASE view costs when it touches everything.
     *
     * ⚠️ Copied parameter-for-parameter from `views/room-gallery.js`'s local corrections rather
     * than imported out of it, because that view must not be edited by this slice and those
     * three values (the faded damask, the pale gilt solved through the tone curve, the
     * medallion-free clerestory glazing) are most of its chroma result. When someone does
     * unify them, they move into `gallery-order.js` beside the geometry they dress.
     */
    estate: want.estate ? await loadEstateSurfaces(L) : null,
  };
}

/**
 * The gallery's surfaces. Returns null rather than throwing if the estate kit is not there —
 * `?estate=port` then renders the new ARCHITECTURE in the game's five materials, which is
 * still the right room, just not the right paint.
 */
async function loadEstateSurfaces(L) {
  if (!L?.estateMaterials) return null;
  try {
    const mats = await L.estateMaterials();
    return {
      damask: mats.wallpaperNeutral ?? mats.wallpaper,
      // ⚠️ `wear: 0.72` and this exact gold — `estate-owner-10` re-solved it because at emissive
      // 8.4 the old 0.530-0.640 landed within ~3 output levels of an already-clipped white
      // ground: the gilding rendered and could not be seen. Do not "tidy" these numbers.
      gilt: L.giltMat({
        gold: [0.775, 0.712, 0.575], bole: [0.310, 0.245, 0.200],
        gesso: [0.790, 0.775, 0.750], wear: 0.72, seed: 6.0,
      }),
      // `medallion: 0` is `estate-owner-9`'s fix: the church roundel is authored into the
      // shared GLASS_SURFACE and appeared, identically placed, in all fourteen of this room's
      // clerestory lights. It is a GEOMETRY gate, not an ink level; at 1.0 every other view
      // is bit-identical.
      clere: L.stainedGlassMat({
        pale: [0.900, 0.935, 0.990], gold: [0.500, 0.545, 0.610],
        blue: [0.400, 0.460, 0.560], ruby: [0.460, 0.490, 0.540],
        medallion: 0, seed: 21.0, emissive: 6.0, aspect: 1.15, ink: 0.45,
      }),
      ceil: L.ceilingMat({ tint: [0.402, 0.390, 0.378], stain: 0.8 }),
      stone: mats.stone,
      wood: mats.walnutBoard,
      marbleTop: mats.marbleSlab,
      portrait: mats.portrait,
      brass: mats.brass,
      // 🆕 the chandeliers' crystal — a lazy getter like every other entry, so a build with no
      // ballroom order never bakes it (`estate-spike-1`: touching six keys bakes six)
      crystal: mats.crystal,
      tapestry: mats.tapestry,
      /**
       * 🆕 **THE STUDY'S OWN SET** (`estate-2`). Copied value-for-value from
       * `views/room-study.js`'s local corrections for the same reason the gallery's were: that
       * view must not be edited by this slice, and those numbers are most of its chroma result.
       *
       * ⚠️ **THE TWO STONES ARE DIFFERENT BAKES AND MERGING THEM WOULD UNDO A MEASUREMENT.**
       * `room-study.js` round 5 cropped the same fractional box out of the art and the render:
       * the art's chimneypiece is 23% BRIGHTER than the walnut beside it and the render had it
       * 27% darker. `stone` at 0.470 is that correction; `stoneUp` at 0.235 is the frieze, half
       * the value on purpose because it is up in the roof where nothing lights it and at the
       * chimneypiece value it became "a flat grey band across the top third".
       *
       * ⚠️ **AND THE GAME HAS NO `setEnvResponse`.** The showcase separates these two stones
       * with per-material env intensity as well as albedo (4.30 against 2.60); in the game only
       * the albedo survives, so the ratio the player sees is 0.50 rather than the showcase's
       * ~0.30. Stated rather than discovered: the frieze will read a little lighter here than
       * it does in the scored frame, and if a critic files it the fix is the albedo, not a
       * lighting change.
       */
      study: {
        wood: mats.walnutField,
        trim: mats.walnutTrim,
        // ⚠️ 0.385, NOT THE SHOWCASE'S 0.470, AND IT IS THE SAME `setEnvResponse` GAP AS THE
        // FLOOR. There the chimneypiece runs at env 4.30 against the walnut's 5.40, so its
        // albedo advantage is partly given back; here only the albedo survives and at 0.470 the
        // first capture of this port had a near-white chimneypiece clipping in a horror level.
        // The art's relationship is the target and it is measured, not chosen: the reference's
        // chimneypiece is ~23% brighter than the walnut beside it, not three times.
        stone: L.stoneMat({ stone: [0.385, 0.354, 0.305], seed: 5.0, size: 1024 }),
        stoneUp: L.stoneMat({ stone: [0.235, 0.216, 0.186], seed: 17.0, size: 512 }),
        // the ceiling of a walnut room is soot and shadow, not white plaster
        ceil: L.ceilingMat({ tint: [0.260, 0.242, 0.214], stain: 0.92 }),
        // dark enough that the firebox is a real black, light enough that it is not a void:
        // the art's darkest decile still holds L 2.7 (`room-study.js` round 5)
        dark: new THREE.MeshStandardMaterial({ color: 0x1a1713, roughness: 0.94, metalness: 0 }),
        // ⚠️ `medallion: 0` is `estate-owner-9`'s fix — the church roundel is authored into the
        // shared GLASS_SURFACE and appeared, identically placed, in every light of a room.
        clere: L.stainedGlassMat({
          pale: [0.880, 0.905, 0.955], gold: [0.520, 0.520, 0.560],
          blue: [0.360, 0.415, 0.520], ruby: [0.470, 0.420, 0.430],
          medallion: 0, seed: 11.0, emissive: 5.0, aspect: 1.55, ink: 0.50,
        }),
        /**
         * 🚨 **THE FLOOR IS A SEPARATE, DARKER BAKE AND THE FIRST BUILD OF THIS PORT PROVED WHY.**
         *
         * Routed to the shared `marbleSlab` the study's floor photographed as a featureless
         * white sheet across the bottom third of the frame — the exact defect `room-study.js`
         * spent three rounds on (*"a floor 53% brighter than the reference cannot hold a
         * reflection, because a reflection is a CONTRAST and there is no headroom left"*).
         *
         * ⚠️ **AND THE SHOWCASE'S OWN FIX DOES NOT TRAVEL.** It solves this with TWO knobs —
         * albedo AND `setEnvResponse(floorMat, 0.30)` — and the second one is a studio facility
         * (`views/_studio.js`); the game has no per-material environment response at all. So the
         * whole correction has to be in the albedo, which is why the ground here is 0.255 against
         * the showcase's 0.395. Carrara is a grey stone with white in it.
         *
         * ⚠️ **AND IT IS NOT POLISHED.** The showcase's 0.055 roughness earns its keep because
         * that view draws the subject a second time mirrored through the floor (`mirrorOf`); the
         * game has no such pass and no budget for one, and a mirror finish with nothing to
         * reflect is just a brighter sheet. 0.26 is a honed floor, which is what a stone floor
         * walked on by a household actually is.
         */
        marble: L.estateMarbleFloor ? L.estateMarbleFloor({
          pattern: 1, slabsX: 4, slabsY: 4, jointW: 0.0021, cabSize: 0.0,
          rough: 0.26, wear: 0.42, dust: 0.40, veinW: 0.052, scale: 3.1, aniso: 1.35,
          clearcoat: 0.30, clearcoatRoughness: 0.10, size: 1024,
          groundA: [0.255, 0.250, 0.243], veinA: [0.096, 0.094, 0.091],
        }) : mats.marbleSlab,
        gilt: mats.gilt,
      },
      /**
       * 🆕 **THE BALLROOM'S OWN SET** (`estate-3`). Four of the six are the showcase's entries
       * unchanged, because unlike the study's stones they were solved against a value range this
       * room shares; the two that move are stated rather than buried.
       */
      ball: {
        /**
         * ⚠️ **0.330, NOT THE SHOWCASE'S DEFAULT 0.560.** `boiserieMat()`'s default paint is what
         * `room-ballroom.js` takes, and it is authored for a DAYLIT reference lit by one 1150 W
         * spot through five windows. `room.js`'s own note two hundred lines up is the counter-
         * example in the other direction: the game's walls went to 0.300 because 0.126 made the
         * whole frame black, and 0.300/0.258/0.212 is the measured landing point for a room lit
         * by five lights. 0.330 is a shade above the house's boiserie — this room is the grand
         * one and its walls are the reference's palest — without being a different tier of
         * brightness from the rooms either side of it.
         */
        wall: L.boiserieMat({ paint: [0.330, 0.302, 0.262], grime: 0.85, size: 1024 }),
        /**
         * 🆕 **ITS OWN PARQUET BAKE, CARRYING THE SHOWCASE'S ROUND-17 PATTERN SOLVE** — and
         * carrying ONLY the pattern half of it, which is the whole point of this entry.
         *
         * `room.ballroom`'s round 17 found two things about this surface that are properties of
         * the JOINERY and not of the light it is under. The board joints were mixing 85% toward
         * 35% of `oakDark`, i.e. very nearly black; and `heightScale` was 0.035 with
         * `normalStrength` 1.0, which is thirty-five millimetres of relief on a floor, so the
         * normal map carved every panel border and every diamond into a groove you could see
         * the shading of. On the 21 x 11 m field that draws a legible grid across the largest
         * surface in the frame, and against the piece's own bar — whose floor is also parquet —
         * it is the difference between reading as a floor and reading as patterned wallpaper.
         * Neither of those is a function of how the room is lit, so both port straight over.
         *
         * ⚠️ **THE ALBEDO DELIBERATELY DOES NOT PORT.** The showcase also re-solved `oak` and
         * `oakDark` in the same round, and those numbers were matched against a reference patch
         * under ITS key — one 1150 W spot through five windows. This room is lit by five
         * practicals and its whole palette sits a tier darker; `m.floor`'s own values are the
         * measured landing point for that, exactly as `wall` above is 0.330 rather than the
         * showcase's 0.560. Taking the showcase's albedo here would repeat the mistake that
         * note exists to prevent. If this floor's level is ever judged wrong, it wants its own
         * solve against this room's lights, not a copy of someone else's.
         */
        floor: L.parquetMat({
          size: 1024, joint: 0.44, jointDark: 0.62, height: 0.016, normal: 0.50,
          /**
           * ⚠️ **AND THE ALBEDO DOES PORT AFTER ALL — SOLVED HERE, NOT COPIED.** The entry
           * above originally shipped without this and said so: the showcase's oak was matched
           * under one 1150 W spot through five windows, this room is lit by five practicals,
           * so its level wanted its own solve rather than a copy. That reasoning stands; what
           * was missing was the measurement, because until `?spawn=` existed nothing had ever
           * photographed this room. With a camera in it:
           *
           *     floor patch                    rgb                    L      chroma
           *     game ballroom, before        178.9, 128.6,  77.9    135.6    101.0
           *     views/room-ballroom.js       100.7,  70.6,  45.1     75.2     55.5
           *
           * 1.8x the brightness AND 1.8x the chroma — the house default is a mid oak, and five
           * warm practicals close over it render it as blond, almost orange, laminate. So the
           * albedo comes down and is desaturated toward its own luma, in two measured steps —
           * 0.6x landed at 108.9 / 87.7 and a second step at 85.8 / 73.8 — which is the same recipe the
           * showcase used against ITS reference and a different answer, because the two rooms
           * are lit differently. `oakDark` keeps the showcase's ratio
           * (0.73 of `oak`) rather than the default's 0.47, since halving the stave-to-stave
           * contrast is the other half of what stopped that floor reading as pattern.
           */
          oak: [0.108, 0.088, 0.072], oakDark: [0.079, 0.064, 0.053],
          /**
           * ⚠️ **NOT PLAIN — THE SHOWCASE TRIED THAT AND WENT BACK.** `views/room-ballroom.js` ended
           * round 17 by laying this oak in a running block bond instead of Versailles panels —
           * with the daylight matched to the bar, a 0.7 m panel cell with a diamond lattice in
           * every one of them was the last thing a blind pair turned on, because the reference's
           * floor reads as a TONE and a panelled one reads as pattern. Softening the joints and
           * halving the relief (both above) helped and neither was enough.
           *
           * The two rooms are the same room, so this followed it there and back. That file's
           * note lists the four passes the plain bond took and why none of them converged; the
           * joint and relief fixes above are the part of that thread that DID work and they are
           * independent of which bond is laid.
           */
        }),
        // the showcase's own gilding, unchanged — it is already solved through the tone curve
        gilt: mats.gilt,
        stone: mats.stone,
        /**
         * ⚠️ 0.400 against the showcase's 0.480. `ceiling-1` measured every ceiling in the slice
         * as the darkest and flattest band in the frame, so this does NOT take the study's 0.260
         * treatment — but this soffit is 9.6 m up with no practical within 4 m of it, and the
         * `up` term in `spaces.js` is doing the other half of the work. Both are `?ceil=`-able.
         */
        ceil: L.ceilingMat({ tint: [0.400, 0.378, 0.336], stain: 0.75 }),
        /**
         * ⚠️ **`mats.clearGlass`, NOT A NEW BAKE.** `materials-local.js` authored that entry for
         * this exact room — *"clear leaded daylight glazing for the ballroom and the gallery...
         * NO ROUNDEL. A ballroom's windows are daylight glazing"* — with `medallion: 0` already
         * set, which is `estate-owner-9`'s fix for the church roundel appearing identically in
         * every light of a room. Re-baking it here would be a second copy of a solved material.
         */
        clere: mats.clearGlass,
        /**
         * ⚠️ **0xc02030 VERBATIM, AND IT IS A MEASURED VALUE RATHER THAN A COLOUR CHOICE.**
         * `estate-owner-15` swept this material live: at 0x3a0d10 the velvet rendered at raw rgb
         * ~(4,3,3) and was reported as ENTIRELY ABSENT — the geometry had been there for rounds
         * and the material had not. Pure white read only ~(75,60,52) at the same point, proving
         * the position is indirect-lit and that the fix is a SATURATED albedo rather than a
         * brighter one. 0xc02030 matched the bar's own shaded drapery pixels to within a few
         * counts while keeping the grade gate.
         */
        drape: new THREE.MeshStandardMaterial({ color: 0xc02030, roughness: 0.86, metalness: 0 }),
        /**
         * 🆕 **THE PIER GLASS, AND IT IS A DIELECTRIC — MEASURED, NOT PREFERRED**
         * (`ballroom-fix-1`, 2026-08-09).
         *
         * 🚨 **`views/game.js` NEVER ASSIGNS `scene.environment`.** Every showcase view does
         * (`light-dark.js`, `light-shaft.js`, `prop-chandelier.js`, and `room-ballroom.js`
         * additionally builds a `CubeCamera` probe per plate) and the playable house does not.
         * So the showcase's `foxedMirrorMat` — metalness 1.0, roughness 0.055 out of
         * `MIRROR_SURFACE` — has **no specular source at all** here: a metal with nothing to
         * reflect returns black, and it would have shipped as a second black rectangle on the
         * wall this round exists to un-blacken. That is why the plate is not simply the
         * showcase's material re-used, which is what the other three buckets above are.
         *
         * The clone keeps every baked map — the amalgam bloom, the lifted-tin pinholes, the
         * pouring drift, and the normal map struck from them, which is the whole reason to use
         * this maker at all — and changes exactly two scalars:
         *   · `metalness` 0.26. It MULTIPLIES the baked metalness map, so the silvering keeps
         *     its variation and stops being a mirror; the bloomed and pitted areas, which the
         *     surface already drops toward dielectric, go fully diffuse.
         *   · `color` 0xc1c5cc, and 🚨 **THE FIRST VALUE TRIED WAS 0x6e767e AND IT SHIPPED THE
         *     DEFECT BACK.** Reasoning from "0.760 silver is three times this room's boiserie,
         *     so tint it down hard" ignored the `1 - metalness` the diffuse term is multiplied
         *     by as well. Measured at `ballroom.east`: the plate area read **93.4 mean luma as
         *     bare wall and 26.5 with that glass in it** — four rectangles 3.5x DARKER than the
         *     wall they were added to improve, on the wall this round exists to un-blacken.
         *     Solved instead of guessed: the effective diffuse is `silver x color x (1 -
         *     metalness)`, so matching the boiserie's ~0.30 linear needs `color` at ~0.53-0.60
         *     linear, which is this hex. Cool rather than neutral because that is the one thing
         *     a dead mirror still does — it is the coldest surface in a candlelit room.
         *     ⚠️ The foxing then takes large patches BACK down (tarnish 0.150/0.128/0.100,
         *     pinholes 0.030), so the plate lands a little under the wall in the mean and well
         *     under it in the blooms, which is the mottle that makes it read as glass and not
         *     as a panel of paint.
         * `fox 0.92` (against the showcase's pier default 0.85 and its end plates' 0.52) buys
         * back some of what a reflection was carrying: with nothing in the glass, the foxing IS
         * the drawing. ⚠️ `size 512`, not 1024 — the plate subtends ~200 px at the station and
         * a distinct bake key is what keeps this clone off the showcase's cached material.
         */
        mirror: (() => {
          const mm = L.foxedMirrorMat({ fox: 0.92, size: 512 }).clone();
          mm.metalness = 0.26;
          mm.color = new THREE.Color(0xc1c5cc);
          mm.name = 'ball-pier-glass';
          return mm;
        })(),
      },
    };
  } catch (e) {
    console.warn('[room] estate surfaces unavailable:', e?.message ?? e);
    return null;
  }
}

// ---- ray/box maths --------------------------------------------------------

const _inv = new THREE.Vector3();
function rayBox(o, d, b) {
  _inv.set(1 / (d.x || 1e-9), 1 / (d.y || 1e-9), 1 / (d.z || 1e-9));
  let t0 = (b.min.x - o.x) * _inv.x, t1 = (b.max.x - o.x) * _inv.x;
  let tmin = Math.min(t0, t1), tmax = Math.max(t0, t1);
  t0 = (b.min.y - o.y) * _inv.y; t1 = (b.max.y - o.y) * _inv.y;
  tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
  t0 = (b.min.z - o.z) * _inv.z; t1 = (b.max.z - o.z) * _inv.z;
  tmin = Math.max(tmin, Math.min(t0, t1)); tmax = Math.min(tmax, Math.max(t0, t1));
  if (tmax < Math.max(tmin, 0)) return null;
  return tmin >= 0 ? tmin : tmax;
}

/** Segment vs AABB, slab test. Used to bucket a sightline to the spaces it crosses. */
function segHitsBox(a, b, box) {
  let tmin = 0, tmax = 1;
  for (const ax of ['x', 'y', 'z']) {
    const d = b[ax] - a[ax];
    if (Math.abs(d) < 1e-9) { if (a[ax] < box.min[ax] || a[ax] > box.max[ax]) return false; continue; }
    const inv = 1 / d;
    let t0 = (box.min[ax] - a[ax]) * inv, t1 = (box.max[ax] - a[ax]) * inv;
    if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
    tmin = Math.max(tmin, t0); tmax = Math.min(tmax, t1);
    if (tmax < tmin) return false;
  }
  return true;
}

const _p = new THREE.Vector3();
function boxNormal(b, o, d, t) {
  _p.copy(o).addScaledVector(d, t);
  const n = new THREE.Vector3();
  const e = 1e-3;
  if (Math.abs(_p.x - b.min.x) < e) n.set(-1, 0, 0);
  else if (Math.abs(_p.x - b.max.x) < e) n.set(1, 0, 0);
  else if (Math.abs(_p.y - b.min.y) < e) n.set(0, -1, 0);
  else if (Math.abs(_p.y - b.max.y) < e) n.set(0, 1, 0);
  else if (Math.abs(_p.z - b.min.z) < e) n.set(0, 0, -1);
  else n.set(0, 0, 1);
  return n;
}
