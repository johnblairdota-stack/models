/**
 * 🎨 **WHAT DOES A PER-ROOM DIG COAT COST — IN SHADER PROGRAMS, IN BAKES, IN VRAM, IN MILLISECONDS?**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_coat1-programs.mjs \
 *        --port 5456 --q "seed=s4"          # the default (damage) arm — free faces exist
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_coat1-programs.mjs \
 *        --port 5456 --q "seed=s4&dig=0"    # scalar arm: NO free faces — every coat check SKIPs
 *
 * ⚠️ **`--q`, NEVER `--extra`.** `playtest.mjs` rejects unknown flags, but a scenario that took the
 * default arm and skipped its checks reads in a tail as "nearly a pass". Both arms above are
 * legitimate; the scalar one is here so the SKIP path is exercised on purpose.
 *
 * ---------------------------------------------------------------------------------------------
 * THE QUESTION
 * ---------------------------------------------------------------------------------------------
 * John: *"from the inside of the room the destructive wall IS the room asset."* `wall.js` claims
 * that already — *"a dig face's outer skin IS the room's own wall"* — and `dressbin-1` measured
 * it true in 2 of 6 rooms, because `estateSkinMat()` hardcodes ONE `boiserieMat` argument set.
 * Making it per-room is therefore required, and `dressbin-1` explicitly did NOT price it.
 *
 * `progkey-1` took cold boot **199.7 → 98.9 s** and programs **1077 → 213** by collapsing ONE
 * cache-key field. A per-room coat that adds a program per room, or a bake per room, hands that
 * back. **This file prices exactly that, and nothing else.**
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THE PROGRAM QUESTION IS DECIDED WHERE IT IS
 * ---------------------------------------------------------------------------------------------
 * three r180 `WebGLPrograms.getProgramCacheKey` hashes, in order: `shaderID` (which is the
 * material CLASS), the parameter flags (which map slots are bound, `clearcoat > 0`, `side`,
 * `flatShading`, light counts …), then `material.defines`, then `customProgramCacheKey` LAST.
 *
 * ⚠️ **`patchForScreenAO` ASSIGNS `customProgramCacheKey = () => 'rrr-ssao-v1'` over every
 * standard material in the scene, and `wall.js`'s `pinProgramKey` COMPOSES onto that** — so
 * every wall coat in the house already shares one custom key, `rrr-wall|dig|rrr-ssao-v1`. That
 * field is therefore load-bearing for keeping the dig arm apart from the estate walls, and
 * **completely unavailable as a way to separate one room's coat from another's.** It is also
 * unavailable as a way to MERGE them: a class difference is hashed three fields earlier and no
 * custom key can undo it. Both directions are measured below rather than argued.
 *
 * A TEXTURE is a uniform value. `WebGLRenderer.getProgram()` keys its program map on
 * `properties.get(material)`, so a material that shares a program still binds its own uniforms
 * (walls-perf, `progkey-1`). **Same class + same flags + same defines + different textures = one
 * program.** That is the shape a per-room coat has to have, and A1 measures it.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE CONTROLS, AND EVERY ONE OF THEM RUNS ON EVERY RUN
 * ---------------------------------------------------------------------------------------------
 * Sixteen recorded instrument failures in this project share one mechanism: a RESULT-SHAPED
 * OUTPUT INSTEAD OF AN ERROR. A program delta of 0 is the most result-shaped output there is —
 * it is what "nothing was added", "my mesh never drew" and "I am reading the wrong array" all
 * look like. So:
 *
 *   C1  a material with a UNIQUE `customProgramCacheKey` must move the counter by EXACTLY +1.
 *       (`_slab1-boot.mjs`'s form, reused deliberately — it is already validated.)
 *   C2  a material with a NOVEL `defines` entry must move it by EXACTLY +1. This is the
 *       mechanism the whole answer rests on: if defines were not hashed, `RRR_BREAK_DAMAGE`
 *       would not be separating the arms and `progkey-1`'s collapse would have been unsafe.
 *   C3  the SAME textures, SAME defines, SAME custom key, in a `MeshStandardMaterial` instead of
 *       a `MeshPhysicalMaterial`, must move it by EXACTLY +1. **Without C3, A1's zero is
 *       worthless** — it would be indistinguishable from a probe whose meshes never drew.
 *   C4  every arm REVERTS: dispose the material, and the counter must come back to where it
 *       started. If it does not, arms contaminate each other and the run says so instead of
 *       reporting an order-dependent number as a fact.
 *   C5  the baker's bake counter must MOVE for a deliberately-perturbed option set, and the ms
 *       and MB it moves by are the price of getting a coat's arguments wrong by one digit.
 *   C6  no bake at all happens during play. Control: C5 is the arm that makes it move.
 *
 * ⚠️ **NO WALKING.** `dressbin-1` measured `ballroom.centre` at 423 / 461 / 479 on one build
 * across a twelve-station walk, so a parked reading is not stable across a walk. Every arm here
 * is flipped IN PLACE at whatever station the harness settled on, read, reverted, and re-read.
 * The absolute program total is REPORTED; only the deltas are gated.
 *
 * ⚠️ **`renderer.info.programs` is not a per-frame counter** — it is the live program cache
 * array, so HANDOFF's `info.reset()` hazard does not apply to it. `info.render.calls` IS a
 * per-frame counter and this file does not read one.
 *
 * ---------------------------------------------------------------------------------------------
 * HOW THE CANDIDATE COATS ARE BUILT — asked of the game, not re-derived
 * ---------------------------------------------------------------------------------------------
 * `baker.js` sets `material.name = o.key` and every key is `family:{...the options JSON...}`.
 * So the six rooms' own wall arguments are READ OFF THE BUILT SCENE and handed straight back to
 * the maker. Nothing here re-derives `room.js`'s tables; a coat that misses a cache hit would
 * show up as a bake, which is what B1 checks. (Rule 4 of the 2026-08-11 set: an instrument that
 * re-derives the thing it measures will agree with it.)
 *
 * The candidates borrow the SHIPPED coat's `defines` and its `onBeforeCompile` rather than
 * re-running `applyBreakMask`. ⚠️ That shares uniform OBJECTS between the candidates, which is
 * irrelevant to a program count (three keys programs on class/flags/defines/custom key, not on
 * the emitted source) and the materials are disposed the moment they are read. It is stated
 * because it is the one place this probe is a model of the build rather than the build.
 */

export default async function coat1Programs({ page, note, pass, fail, skip, consoleErrors }) {
  const errAt = () => (Array.isArray(consoleErrors) ? consoleErrors.length : -1);
  const errBoot = errAt();
  // ------------------------------------------------------------------ 0. census
  const census = await page.evaluate(() => {
    const e = window.__rrr?.engine ?? window.__engine ?? window.engine;
    if (!e) return { err: 'no engine on window' };
    const r = e.renderer;
    const scene = e.scene ?? e.world?.scene;
    if (!scene) return { err: 'no scene on engine' };

    const desc = (m) => {
      if (!m) return null;
      let key = '';
      try { key = m.customProgramCacheKey ? String(m.customProgramCacheKey()) : ''; } catch { key = 'THREW'; }
      const slots = ['map', 'normalMap', 'aoMap', 'roughnessMap', 'metalnessMap', 'emissiveMap',
        'alphaMap', 'bumpMap', 'displacementMap', 'clearcoatMap', 'clearcoatNormalMap',
        'clearcoatRoughnessMap', 'sheenColorMap', 'iridescenceMap', 'transmissionMap']
        .filter((s) => !!m[s]);
      return {
        name: m.name || '(unnamed)',
        type: m.type,
        clearcoat: ('clearcoat' in m) ? m.clearcoat : null,
        transmission: ('transmission' in m) ? m.transmission : null,
        sheen: ('sheen' in m) ? m.sheen : null,
        iridescence: ('iridescence' in m) ? m.iridescence : null,
        side: m.side,
        flatShading: !!m.flatShading,
        transparent: !!m.transparent,
        alphaTest: m.alphaTest ?? 0,
        vertexColors: !!m.vertexColors,
        defines: m.defines ? Object.keys(m.defines).sort().join('+') : '',
        cacheKey: key,
        slots,
        hasBake: !!m.userData?.bake,
      };
    };

    // the six rooms' own wall material, off the built scene (`GeoBin.build` names it `kit:wall`)
    const rooms = [];
    scene.traverse((o) => {
      if (typeof o.name !== 'string' || !o.name.startsWith('space.')) return;
      let wallMat = null;
      o.traverse((c) => { if (!wallMat && c.isMesh && c.name === 'kit:wall') wallMat = c.material; });
      rooms.push({ space: o.name.slice(6), wall: desc(wallMat), visible: o.visible });
    });

    // every damage-armed face and the coat it is actually wearing
    const panels = e.room?.panels ?? [];
    const free = panels.filter((p) => p.spec?.free);
    const faces = free.map((p) => ({
      id: p.spec.id ?? p.id,
      facing: (p.ownerSpace?.root?.name ?? '').slice(6) || (p.spec.a ?? '?'),
      coat: desc(p.mats?.[0]),
      pristine: !!p.pristine,
      instanced: !!p.instanced,
      layer0: !!p.layers?.[0]?.visible,
      coatArm: p._coatArm ?? null,
    }));

    /**
     * 🚨 **WHICH INSTANCED MESH DRAWS EACH PRISTINE FACE — BY WORLD-MATRIX MATCH, 2026-08-11.**
     * Until `pristine-1` there was exactly ONE `wall.pristine.face` mesh in the house, so "the
     * first one traversal finds" was the answer. It now splits by room coat, and a probe that
     * still took the first would be reading a random room's material. So each face's own world
     * transform is searched for in every face mesh's `instanceMatrix` — the transform the GPU is
     * handed, which cannot agree with `wallinstances.js`'s bookkeeping by construction.
     * ⚠️ Only a face residency currently shows has a non-zero matrix in its slot; the rest report
     * `null` and are excluded rather than counted as a miss. `_pris1-groups.mjs` walks twelve
     * stations to reach all 28 and carries the decoy control that proves this search can say NO.
     */
    const faceMeshes = [];
    let instFace = null;
    scene.traverse((o) => {
      if (!o.isInstancedMesh || typeof o.name !== 'string') return;
      if (!o.name.startsWith('wall.pristine.face')) return;
      faceMeshes.push(o);
      if (!instFace) instFace = o;
    });
    const _M = scene.matrixWorld.clone();
    const _near = (a, b) => { for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > 1e-4) return false; return true; };
    const drawnBy = (p) => {
      p.root.updateWorldMatrix(true, false);
      const want = p.root.matrixWorld.elements;
      for (const o of faceMeshes) {
        for (let s = 0; s < o.count; s++) {
          _M.fromArray(o.instanceMatrix.array, s * 16);
          if (_near(_M.elements, want)) return { mesh: o.name, mat: desc(o.material) };
        }
      }
      return null;
    };
    free.forEach((p, i) => {
      const d = drawnBy(p);
      faces[i].drawnMesh = d ? d.mesh : null;
      faces[i].drawnMat = d ? d.mat : null;
    });

    // program name histogram — how many programs one material family actually spawns
    const progs = r.info.programs ?? [];
    const byName = {};
    for (const p of progs) byName[p.name] = (byName[p.name] ?? 0) + 1;

    return {
      /**
       * ⚠️ **`?? 1` BECAUSE THE SHIPPED DEFAULT IS ARM 1 SINCE 2026-08-12, AND THIS LINE READ
       * `?? 0` FOR AN HOUR AFTER IT STOPPED BEING TRUE.** With no `?coat=` in the URL this file
       * assumed arm 0, so both arm-0 assertions FAILED on a healthy tree (19/2) while
       * `--q "seed=s4&coat=0"` read 21/0 — a false red, which is the kind that teaches people to
       * bypass a gate. **It must mirror `wall.js`'s `COAT_DEFAULT_ARM`; if that constant moves and
       * this does not, this file goes red on a good tree again.** Kept as a literal rather than
       * imported because this census runs inside `page.evaluate` where `wall.js` is not in scope.
       */
      urlArm: Number(new URLSearchParams(location.search).get('coat') ?? 1) | 0,
      instFace: instFace ? { name: instFace.name, mat: desc(instFace.material), count: instFace.count } : null,
      programs: progs.length,
      byName,
      textures: r.info.memory?.textures ?? -1,
      geometries: r.info.memory?.geometries ?? -1,
      rooms,
      faces,
      freeCount: free.length,
      panelCount: panels.length,
      baker: e.baker
        ? {
          bakes: e.baker.stats.bakes, hits: e.baker.stats.hits,
          mb: e.baker.stats.bytes / 1048576, ms: e.baker.stats.ms,
          keys: [...e.baker.cache.keys()],
        }
        : null,
      t: Math.round(performance.now()),
    };
  });

  if (census.err) { fail('the engine is reachable', census.err); return; }

  note(`programs ${census.programs} · textures ${census.textures} · geometries ${census.geometries}`);
  note(`⏱️ page start → this probe: ${(census.t / 1000).toFixed(1)} s (REPORTED, not gated)`);
  note(`free (damage-armed) faces: ${census.freeCount} of ${census.panelCount} panels`);

  note('--- the six rooms\' own wall material (mesh `kit:wall`) ---');
  for (const rm of census.rooms) {
    if (!rm.wall) { note(`   ${rm.space.padEnd(10)} — NO kit:wall mesh`); continue; }
    note(`   ${rm.space.padEnd(10)} ${rm.wall.type.padEnd(22)} clearcoat ${String(rm.wall.clearcoat)}  ${rm.wall.name.slice(0, 96)}`);
  }

  const coats = new Map();
  for (const f of census.faces) {
    if (!f.coat) continue;
    const k = `${f.coat.type}|${f.coat.name}|${f.coat.defines}|${f.coat.cacheKey}`;
    if (!coats.has(k)) coats.set(k, { d: f.coat, n: 0 });
    coats.get(k).n++;
  }
  note(`--- the coat actually on those faces: ${coats.size} distinct (type, bake, defines, key) ---`);
  for (const { d, n } of coats.values()) {
    note(`   ×${n}  ${d.type} clearcoat ${d.clearcoat} · defines ${d.defines || '(none)'} · key ${d.cacheKey}`);
    note(`        name ${d.name.slice(0, 110)}`);
    note(`        texture slots bound: ${d.slots.join(', ')}`);
  }

  // ------------------------------------------------------------------ 1. does the coat match its room?
  if (!census.freeCount) {
    skip('the coat matches the room it faces', 'no damage-armed faces on this arm (`dig=0`) — nothing to coat');
  } else {
    const rmWall = new Map(census.rooms.map((r) => [r.space, r.wall?.name ?? null]));
    const rows = [];
    let match = 0, resolved = 0;
    for (const f of census.faces) {
      const want = rmWall.get(f.facing);
      if (!want || !f.coat) continue;
      resolved++;
      const ok = want === f.coat.name;
      if (ok) match++;
      rows.push({ id: f.id, facing: f.facing, ok });
    }
    const byRoom = new Map();
    for (const r of rows) {
      if (!byRoom.has(r.facing)) byRoom.set(r.facing, { ok: 0, n: 0 });
      const b = byRoom.get(r.facing); b.n++; if (r.ok) b.ok++;
    }
    note('--- per room: faces whose coat IS that room\'s own wall bake ---');
    for (const [room, b] of byRoom) note(`   ${room.padEnd(10)} ${b.ok}/${b.n}`);
    const roomsOk = [...byRoom.values()].filter((b) => b.ok === b.n && b.n > 0).length;

    /**
     * 🚨 **THIS ASSERTION FLIPS WITH THE ARM, AND THAT IS WHAT MAKES IT A MEASUREMENT.**
     * On `?coat=0` the coat MUST mismatch (it is one hardcoded boiserie); on `?coat=1|2` it MUST
     * match every room. Neither outcome can be a constant, so a probe that had stopped reading
     * the scene would go red on one of the two arms. **Run both.**
     */
    const armed = (census.urlArm ?? 0) !== 0;
    if (resolved === 0) {
      fail('CONTROL — every free face resolves to a room with a wall bake',
        'zero faces resolved; the census cannot say anything about the coat');
    } else if (!armed && match < resolved) {
      pass(`arm 0 — the coat does NOT match the room, in ${resolved - match} of ${resolved} faces`,
        `${roomsOk} of ${byRoom.size} rooms fully matched. This is the SHIPPED build and it `
        + 're-measures dressbin-1\'s "true in 2 of 6 rooms" off the built scene.');
    } else if (armed && match === resolved) {
      pass(`arm ${census.urlArm} — the coat IS the room's own wall bake, ${match} of ${resolved} faces`,
        `${roomsOk} of ${byRoom.size} rooms fully matched. Arm 0 reads 8/28 and 2/6 on this same `
        + 'build, so this assertion flips with the arm and cannot be a constant.');
    } else if (armed) {
      fail(`arm ${census.urlArm} — the coat IS the room's own wall bake`,
        `only ${match} of ${resolved} faces match; ${roomsOk} of ${byRoom.size} rooms. `
        + 'The coat did not reach every face.');
    } else {
      fail('arm 0 — the coat does NOT match the room',
        'every face already wears its room\'s own bake on the DEFAULT arm — arm 0 is supposed to '
        + 'be the shipped build unchanged. Something is coating faces without being asked.');
    }
  }

  /**
   * 🚨 **AND HERE IS THE HALF THE COAT CANNOT REACH — MEASURED, NOT READ.**
   * `wallinstances.js` draws every PRISTINE face out of one shared `InstancedMesh` whose material
   * is `applyBreakMask(wallStageMaterials()[0], BREAK_CFG[0])` — the DAMASK wallpaper stage — and
   * `wall.js` hides the panel's own five meshes while that is true. So an UNTOUCHED dig face does
   * not draw its own `mats[0]` at all, on any arm. This section reports it per face rather than
   * inferring it from the source.
   */
  {
    const pf = census.faces.filter((f) => f.pristine);
    const drawnOwn = census.faces.filter((f) => f.layer0);
    note(`--- who actually draws an untouched dig face ---`);
    note(`   free faces ${census.faces.length} · pristine ${pf.length} · instanced `
      + `${census.faces.filter((f) => f.instanced).length} · drawing their OWN layer 0 ${drawnOwn.length}`);
    if (census.instFace) {
      note(`   the shared pristine instance: ${census.instFace.name} ×${census.instFace.count}`);
      note(`      material ${census.instFace.mat.type} · ${census.instFace.mat.name.slice(0, 90)}`);
    }
    /**
     * 🚨 **THIS ASSERTION NOW FLIPS WITH THE ARM, LIKE SECTION 1'S, AND THAT IS WHAT CLOSED IT.**
     * `pristine-1` put the room coat into `wallinstances.js`'s group key, so:
     *   · **arm 0** — a pristine face MUST still draw the shared damask `wall.pristine.face`. That
     *     is the shipped build unchanged AND it is `wall.js`'s long-standing defect, still true.
     *   · **arms 1–2** — every resolved pristine face MUST draw an `InstancedMesh` whose material
     *     name IS its own bake key.
     * Neither outcome can be a constant, so run both. `_pris1-groups.mjs` is the fuller instrument
     * (twelve stations, all 28 faces, and the decoy control that proves the match can fail).
     */
    const resolved = census.faces.filter((f) => f.drawnMat);
    const own = resolved.filter((f) => f.drawnMat.name === f.coat?.name && f.drawnMat.type === f.coat?.type);
    const dam = resolved.filter((f) => f.drawnMat.name === 'wall.pristine.face');
    note(`   resolved by world-matrix match at this station: ${resolved.length} of ${census.faces.length}`
      + ` · drawing their own coat ${own.length} · drawing the shared damask ${dam.length}`);
    const armedC = (census.urlArm ?? 0) !== 0;
    if (!census.faces.length) {
      skip('the coat is what a PRISTINE face draws', 'no damage-armed faces on this arm');
    } else if (!census.instFace) {
      skip('the coat is what a PRISTINE face draws',
        'no `wall.pristine.face` InstancedMesh found — is this `?walls=legacy`?');
    } else if (!resolved.length) {
      skip('the coat is what a PRISTINE face draws',
        'no free face resolved to an instance slot at this station — residency is showing none of '
        + 'them, so this probe cannot rule. Run `_pris1-groups.mjs`, which walks twelve stations.');
    } else if (armedC && own.length === resolved.length) {
      pass(`arm ${census.urlArm} — the coat IS what a PRISTINE face draws, ${own.length}/${resolved.length} resolved`,
        'matched by WORLD TRANSFORM to the `InstancedMesh` that draws it, so this cannot be '
        + '`wallinstances.js` agreeing with itself. On arm 0 the same code reads damask for all of '
        + 'them. 🎯 This line was the standing FAIL until 2026-08-11 — `pristine-1` closed it.');
    } else if (armedC) {
      fail(`arm ${census.urlArm} — the coat IS what a PRISTINE face draws`,
        `only ${own.length} of ${resolved.length} resolved faces draw their own coat; ${dam.length} `
        + 'still draw the shared damask. The coat is invisible until a blow lands on those faces.');
    } else if (dam.length === resolved.length) {
      pass('arm 0 — a PRISTINE face still draws the SHARED DAMASK, and that is the shipped build',
        `${dam.length}/${resolved.length} resolved faces draw \`wall.pristine.face\`. 🚨 It is also `
        + '`wall.js`\'s own stated defect — *"a band of damask in a boiserie room gave away the dig '
        + 'band before a blow landed"* — and on this arm it is still happening, deliberately: arm 0 '
        + 'is byte-for-byte the shipped look. `?coat=1` is where the fix lives.');
    } else {
      fail('arm 0 — a PRISTINE face still draws the SHARED DAMASK',
        `only ${dam.length} of ${resolved.length} draw \`wall.pristine.face\` — a coat has leaked `
        + 'onto the shipped arm, which is supposed to be unchanged.');
    }
  }

  // ------------------------------------------------------------------ 2. program arms
  const errBeforeArms = errAt();
  const arms = await page.evaluate(async () => {
    const e = window.__rrr?.engine ?? window.__engine ?? window.engine;
    const r = e.renderer;
    const scene = e.scene ?? e.world?.scene;
    const cam = e.cam?.camera ?? e.camera;
    const out = { rows: [], err: null, notes: [] };

    let mods;
    try {
      mods = {
        wall: await import('/src/game/wall.js'),
        pipe: await import('/src/post/pipeline.js'),
        local: await import('/src/world/materials-local.js'),
        stages: await import('/src/materials/surfaces/wallstages.js'),
        walnut: await import('/src/materials/surfaces/walnut.js'),
      };
    } catch (err) { out.err = 'module import failed: ' + (err?.message ?? err); return out; }
    if (typeof mods.wall.pinProgramKey !== 'function') { out.err = 'wall.js does not export pinProgramKey'; return out; }
    if (typeof mods.pipe.patchForScreenAO !== 'function') { out.err = 'pipeline.js does not export patchForScreenAO'; return out; }

    // a live mesh to borrow a constructor and a geometry from (NEVER dispose the geometry)
    let host = null;
    scene.traverse((o) => { if (!host && o.isMesh && o.material && !Array.isArray(o.material) && o.geometry) host = o; });
    if (!host) { out.err = 'no mesh in the scene to borrow a constructor from'; return out; }

    // the shipped coat — the template every candidate is measured against
    const free = (e.room?.panels ?? []).filter((p) => p.spec?.free);
    const L0 = free[0]?.mats?.[0] ?? null;
    if (!L0) { out.err = 'NO_FREE_FACE'; return out; }
    if (!L0.userData?.bake) { out.err = 'the shipped coat has no userData.bake — it did not come from the baker'; return out; }

    const raf = () => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));

    /**
     * Add one material to the live scene on a tiny quad at the camera, let two frames go by,
     * read the program cache, then remove and dispose and read it again. The revert read is C4.
     */
    const measure = async (label, mat, detail, keep = false) => {
      const before = r.info.programs.length;
      const mesh = new host.constructor(host.geometry, mat);
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.position.copy(cam.position);
      mesh.scale.set(0.002, 0.002, 0.002);
      scene.add(mesh);
      await raf();
      const during = r.info.programs.length;
      mesh.removeFromParent();
      // ⚠️ `keep` is for materials the GAME owns (A5 renders live panel coats). Disposing one
      // would take a live face's material out from under it. A kept material also keeps its
      // program, so a kept arm is EXPECTED not to revert and is excluded from C4.
      if (!keep) mat.dispose();      // frees the program when usedTimes hits 0
      await raf();
      const after = r.info.programs.length;
      out.rows.push({
        label, before, during, after, delta: during - before,
        reverted: keep ? true : after === before, keep, detail,
      });
      return during - before;
    };

    // ---- the four families the six rooms actually use, read off the built scene ----
    const wallMats = new Map();   // space -> material
    scene.traverse((o) => {
      if (typeof o.name !== 'string' || !o.name.startsWith('space.')) return;
      o.traverse((c) => { if (c.isMesh && c.name === 'kit:wall' && !wallMats.has(o.name.slice(6))) wallMats.set(o.name.slice(6), c.material); });
    });

    const parseKey = (name) => {
      const i = String(name).indexOf(':');
      if (i < 0) return null;
      try { return { family: name.slice(0, i), opts: JSON.parse(name.slice(i + 1)) }; } catch { return null; }
    };
    const MAKER = {
      'est-bois': (o) => mods.local.boiserieMat(o),
      'ws.paper': (o) => mods.stages.wallpaperMat(o),
      walnut: (o) => mods.walnut.walnutPanel(o),
    };

    // one representative per distinct room-wall bake
    const targets = [];
    for (const [space, m] of wallMats) {
      if (!m || !m.name) continue;
      if (targets.some((t) => t.name === m.name)) { targets.find((t) => t.name === m.name).spaces.push(space); continue; }
      targets.push({ name: m.name, spaces: [space], mat: m, parsed: parseKey(m.name) });
    }
    out.targets = targets.map((t) => ({
      name: t.name, spaces: t.spaces, type: t.mat.type,
      clearcoat: ('clearcoat' in t.mat) ? t.mat.clearcoat : null,
      family: t.parsed?.family ?? null, hasBake: !!t.mat.userData?.bake, makerKnown: !!MAKER[t.parsed?.family],
    }));

    const coatify = (m) => {
      m.defines = { ...(L0.defines ?? {}) };
      m.onBeforeCompile = L0.onBeforeCompile;   // shares uniform objects — see the header
      mods.wall.pinProgramKey(m, 'rrr-wall|dig');
      mods.pipe.patchForScreenAO(m);
      m.needsUpdate = true;
      return m;
    };

    const Physical = L0.constructor;

    // ==================== A1 — one class, per-room TEXTURES ====================
    for (const t of targets) {
      const bake = t.mat.userData?.bake;
      if (!bake) { out.notes.push(`A1 skipped ${t.name.slice(0, 40)} — no userData.bake`); continue; }
      const m = coatify(new Physical({
        map: bake.map, normalMap: bake.normalMap, aoMap: bake.orm,
        roughnessMap: bake.orm, metalnessMap: bake.orm,
        roughness: 1.0, metalness: 1.0,
        clearcoat: L0.clearcoat, clearcoatRoughness: L0.clearcoatRoughness,
        envMapIntensity: 1.0,
      }));
      m.name = 'coat1-A1-' + (t.parsed?.family ?? '?');
      await measure(`A1 texture-only coat · ${t.spaces.join('+')} · ${t.parsed?.family}`, m,
        `same class (${Physical.name}), same defines, same key, ${t.parsed?.family} textures`);
    }

    // ==================== A2 — each room's OWN maker function ====================
    for (const t of targets) {
      const fam = t.parsed?.family;
      const mk = MAKER[fam];
      if (!mk) { out.notes.push(`A2 skipped ${fam} — no maker wired`); continue; }
      let m;
      try { m = mk(t.parsed.opts); } catch (err) { out.notes.push(`A2 ${fam} maker threw: ${err?.message ?? err}`); continue; }
      coatify(m);
      m.name = 'coat1-A2-' + fam;
      await measure(`A2 maker-built coat · ${t.spaces.join('+')} · ${fam}`, m,
        `${m.type}, clearcoat ${('clearcoat' in m) ? m.clearcoat : 'n/a'} — the room's own maker, unchanged`);
    }

    // ==================== A3 — the SHIPPED estateSkinMat, per-room paint ====================
    // The minimal build-slice edit: `estateSkinMat(opts)` already takes opts and spreads them
    // over the hardcoded boiserie arguments. This is that edit, for the one room whose wall IS
    // a boiserie with different paint (the ballroom).
    for (const t of targets) {
      if (t.parsed?.family !== 'est-bois') continue;
      let m;
      try { m = mods.stages.estateSkinMat(t.parsed.opts); } catch (err) { out.notes.push(`A3 threw: ${err?.message ?? err}`); continue; }
      coatify(m);
      m.name = 'coat1-A3-estateSkinMat';
      await measure(`A3 estateSkinMat(roomOpts) · ${t.spaces.join('+')}`, m,
        'the one-line form of the fix, for a room whose wall is already a boiserie');
    }

    /**
     * ==================== A5 — IS THE LIVE COAT'S PROGRAM ALREADY PAID? ====================
     * 🚨 **THE QUESTION THIS ARM EXISTS FOR.** `?coat=2` reads the SAME 231 programs as arm 0, and
     * the obvious reading — "arm 2 is free after all" — is wrong and would have been believed.
     * Every free face is pristine, so `wallinstances.js` draws it and the panel's own layer 0
     * never reaches the GPU; a program that is never drawn is never compiled. So this takes the
     * REAL, live `mats[0]` off one face per distinct coat and draws it once. **+1 means that
     * coat's program did not exist yet — i.e. it is DEFERRED to the first blow, not free.**
     * `keep` is on: these belong to the game and must not be disposed.
     */
    {
      const seen = new Set();
      for (const p of free) {
        const m = p.mats?.[0];
        if (!m) continue;
        const k = `${m.type}|${m.name}`;
        if (seen.has(k)) continue;
        seen.add(k);
        await measure(`A5 LIVE coat · ${(p.ownerSpace?.root?.name ?? '?').slice(6)} · ${m.type}`, m,
          `the face's own material, drawn once — +1 means its program was not compiled at boot`,
          true);
      }
    }

    // ==================== A4 — the gallery joins the family with a token clearcoat ====================
    // The gallery's own wall is a `MeshStandardMaterial` (no clearcoat), so matching its LOOK
    // exactly means a second class, which A2 prices. This asks whether a near-invisible wax
    // (0.02 against the boiserie's 0.25) buys the gallery a seat in the one family — i.e. the
    // zero-program answer that still looks like paper rather than like varnished panelling.
    {
      const gal = targets.find((t) => t.parsed?.family === 'ws.paper');
      const bake = gal?.mat?.userData?.bake;
      if (!bake) { out.notes.push('A4 skipped — no gallery paper bake'); } else {
        const m = coatify(new Physical({
          map: bake.map, normalMap: bake.normalMap, aoMap: bake.orm,
          roughnessMap: bake.orm, metalnessMap: bake.orm, roughness: 1, metalness: 1,
          clearcoat: 0.02, clearcoatRoughness: 0.9, envMapIntensity: 1.0,
        }));
        m.name = 'coat1-A4-paper-token-clearcoat';
        await measure('A4 gallery paper as Physical, clearcoat 0.02', m,
          'a token wax instead of the boiserie\'s 0.25 — does the VALUE move a program?');
      }
    }

    // ==================== C7 — clearcoat PRESENCE is the boundary, not its value ==========
    // `WebGLPrograms.getParameters` sets `clearcoat: material.clearcoat > 0`, so 0.02 and 0.55
    // are the same program and 0.00 is a different one. If this reads 0 the A4 result above is
    // meaningless, because it would mean the clearcoat flag is not reaching the key at all.
    {
      const bake = L0.userData.bake;
      const m = coatify(new Physical({
        map: bake.map, normalMap: bake.normalMap, aoMap: bake.orm,
        roughnessMap: bake.orm, metalnessMap: bake.orm, roughness: 1, metalness: 1,
        clearcoat: 0.0, envMapIntensity: 1.0,
      }));
      m.name = 'coat1-C7-no-clearcoat';
      await measure('C7 CONTROL · the same coat with clearcoat 0', m,
        'clearcoat PRESENCE is a program parameter — must be exactly +1');
    }

    // ==================== C1 — unique custom cache key MUST be +1 ====================
    {
      const bake = L0.userData.bake;
      const m = coatify(new Physical({
        map: bake.map, normalMap: bake.normalMap, aoMap: bake.orm,
        roughnessMap: bake.orm, metalnessMap: bake.orm, roughness: 1, metalness: 1,
        clearcoat: L0.clearcoat, clearcoatRoughness: L0.clearcoatRoughness, envMapIntensity: 1.0,
      }));
      m.customProgramCacheKey = () => `rrr-coat1-control-${Math.random()}`;
      m.needsUpdate = true;
      await measure('C1 CONTROL · unique customProgramCacheKey', m, 'must be exactly +1');
    }

    // ==================== C2 — a novel `defines` entry MUST be +1 ====================
    {
      const bake = L0.userData.bake;
      const m = coatify(new Physical({
        map: bake.map, normalMap: bake.normalMap, aoMap: bake.orm,
        roughnessMap: bake.orm, metalnessMap: bake.orm, roughness: 1, metalness: 1,
        clearcoat: L0.clearcoat, clearcoatRoughness: L0.clearcoatRoughness, envMapIntensity: 1.0,
      }));
      m.defines = { ...m.defines, RRR_COAT1_CONTROL: Math.floor(Math.random() * 1e9) };
      m.needsUpdate = true;
      await measure('C2 CONTROL · a novel defines entry', m, 'must be exactly +1 — defines are hashed AHEAD of the custom key');
    }

    // ==================== C3 — the CLASS flip MUST be +1 ====================
    // Same textures, same defines, same custom key, MeshStandardMaterial instead of Physical.
    // This is what makes A1's zero mean something, and it is also the mechanism behind A2.
    {
      let Standard = null;
      scene.traverse((o) => {
        if (Standard) return;
        const m = o.material;
        if (m && !Array.isArray(m) && m.type === 'MeshStandardMaterial') Standard = m.constructor;
      });
      if (!Standard) {
        out.notes.push('C3 could not find a MeshStandardMaterial in the scene to borrow a constructor from');
      } else {
        const bake = L0.userData.bake;
        const m = coatify(new Standard({
          map: bake.map, normalMap: bake.normalMap, aoMap: bake.orm,
          roughnessMap: bake.orm, metalnessMap: bake.orm, roughness: 1, metalness: 1,
          envMapIntensity: 1.0,
        }));
        m.name = 'coat1-C3-standard';
        await measure('C3 CONTROL · the same coat as MeshStandardMaterial', m,
          'identical textures/defines/key, different material CLASS — must be exactly +1');
      }
    }

    out.programsEnd = r.info.programs.length;
    return out;
  });

  const errAfterArms = errAt();
  note(`console errors: ${errBoot} before this scenario · ${errBeforeArms} before the program arms · `
    + `${errAfterArms} after them (the arms' own contribution is ${errAfterArms - errBeforeArms})`);

  /**
   * 🚨 **THE ARMS EMIT `THREE.WebGLProgram: Shader Error … VALIDATE_STATUS false`, AND THEY ARE
   * THE PROBE'S, NOT THE BUILD'S.** Measured: 0 console errors before the arms on the default
   * arm, and **0 for the whole run on `--q "seed=s4&dig=0"`**, which builds no ad-hoc material
   * at all. The cause is that a candidate borrows the shipped coat's `onBeforeCompile`, so it
   * declares the break patch's samplers without three having bound texture units for them at
   * `validateProgram` time. It cannot affect the numbers: a program delta is over
   * `getProgramCacheKey`, which three computes and looks up BEFORE it compiles anything, and the
   * program object is pushed onto `info.programs` either way. C1/C2/C3/C7 all read exactly +1
   * through this same path, which is what rules out "my meshes never drew".
   * **This assertion exists so that a REAL boot error can never hide inside the probe's noise.**
   */
  if (errBeforeArms === 0) {
    pass('CONTROL — the shader warnings are the probe\'s, not the build\'s',
      `${errBeforeArms} console errors before the arms ran, ${errAfterArms} after. `
      + 'Run `--q "seed=s4&dig=0"` for the null arm: no ad-hoc material is built and the whole run '
      + 'reports 0. Any non-zero here is a real boot error and must be read as one.');
  } else {
    fail('CONTROL — the shader warnings are the probe\'s, not the build\'s',
      `${errBeforeArms} console errors were already present BEFORE any arm ran. Those belong to `
      + 'the build, not to this probe, and every number below was taken on a page that was '
      + 'already complaining.');
  }

  if (arms.err === 'NO_FREE_FACE') {
    skip('the program arms', 'no damage-armed face on this arm — the coat does not exist here');
  } else if (arms.err) {
    fail('the program arms could run at all', arms.err);
  } else {
    for (const n of arms.notes ?? []) note(`   ⚠️ ${n}`);
    note('--- the distinct room-wall bakes the coat would have to reproduce ---');
    for (const t of arms.targets ?? []) {
      note(`   ${t.spaces.join('+').padEnd(18)} ${String(t.family).padEnd(9)} ${t.type.padEnd(22)} clearcoat ${String(t.clearcoat)} · maker wired ${t.makerKnown}`);
    }
    note('--- program deltas, flipped in place at one station ---');
    for (const r of arms.rows) {
      note(`   ${r.delta >= 0 ? '+' : ''}${r.delta}  ${r.before}→${r.during}→${r.after}${r.reverted ? '' : '  ⚠️ DID NOT REVERT'}  ${r.label}`);
    }

    // ---- C4: every arm reverted ----
    const noRevert = arms.rows.filter((r) => !r.reverted);
    if (!arms.rows.length) {
      fail('C4 CONTROL — every arm reverts', 'no arms ran');
    } else if (noRevert.length) {
      fail('C4 CONTROL — every arm reverts',
        `${noRevert.length} of ${arms.rows.length} arms left the program count changed `
        + `(${noRevert.map((r) => `${r.label}: ${r.before}→${r.after}`).join('; ')}). `
        + 'Arms contaminate each other; treat every delta below as order-dependent.');
    } else {
      pass('C4 CONTROL — every arm reverts',
        `all ${arms.rows.length} arms returned the program count to its starting value, so no arm `
        + 'can be hiding behind a program another arm already compiled.');
    }

    // ---- C1 / C2 / C3 ----
    for (const tag of ['C1', 'C2', 'C3', 'C7']) {
      const row = arms.rows.find((r) => r.label.startsWith(tag));
      if (!row) { fail(`${tag} CONTROL ran`, `${tag} did not run — see the notes above`); continue; }
      if (row.delta === 1) {
        pass(`${tag} CONTROL — the counter sees a genuinely new program`,
          `${row.label}: ${row.before} → ${row.during} (+1). ${row.detail}`);
      } else {
        fail(`${tag} CONTROL — the counter sees a genuinely new program`,
          `${row.label}: ${row.before} → ${row.during} (${row.delta >= 0 ? '+' : ''}${row.delta}), expected +1. `
          + 'Every zero this file reports is now unfalsifiable — do not use the numbers.');
      }
    }

    // ---- A1: the shape that must be free ----
    const a1 = arms.rows.filter((r) => r.label.startsWith('A1'));
    if (!a1.length) {
      skip('A1 — a per-room coat carrying per-room TEXTURES costs no program', 'no A1 arms ran');
    } else if (a1.every((r) => r.delta === 0)) {
      pass('A1 — a per-room coat carrying per-room TEXTURES costs NO program',
        `${a1.length} distinct room bakes, every one +0 programs. Same class, same defines, same `
        + 'pinned key, different textures — three keys programs on the parameters, and a texture is '
        + 'a uniform. C3 (+1 for a class change through the same code path) is what makes this zero '
        + 'a measurement rather than a probe that never drew.');
    } else {
      fail('A1 — a per-room coat carrying per-room TEXTURES costs NO program',
        a1.filter((r) => r.delta !== 0).map((r) => `${r.label} ${r.delta >= 0 ? '+' : ''}${r.delta}`).join(' · '));
    }

    // ---- A2: the naive shape ----
    const a2 = arms.rows.filter((r) => r.label.startsWith('A2'));
    if (!a2.length) {
      skip('A2 — building each coat from its room\'s own maker', 'no A2 arms ran');
    } else {
      const spent = a2.filter((r) => r.delta !== 0);
      const total = a2.reduce((n, r) => n + r.delta, 0);
      if (spent.length === 0) {
        pass('A2 — building each coat from its room\'s own maker is ALSO free',
          `${a2.length} makers, +0 programs each. Every maker returns the same material class with `
          + 'the same flags, so the naive form costs nothing either.');
      } else {
        pass(`A2 — the naive form costs +${total} program${total === 1 ? '' : 's'}, and it is a CLASS difference`,
          spent.map((r) => `${r.label} ${r.delta >= 0 ? '+' : ''}${r.delta} (${r.detail})`).join(' · ')
          + '. Not a cache-key problem: `shaderID` is hashed three fields ahead of '
          + '`customProgramCacheKey`, so no key can merge these — A1 is the shape that can.');
      }
    }

    // ---- A5: is the live coat's program already in the cache? ----
    const a5 = arms.rows.filter((r) => r.label.startsWith('A5'));
    if (!a5.length) {
      skip('A5 — the live coat\'s program, at boot', 'no A5 arms ran');
    } else {
      const unpaid = a5.filter((r) => r.delta !== 0);
      const paid = a5.filter((r) => r.delta === 0);
      note(`   A5: ${paid.length} of ${a5.length} live coats already had a program at boot`);
      pass(`A5 — ${unpaid.length} of ${a5.length} live coats had NO program compiled at boot`,
        unpaid.length
          ? unpaid.map((r) => `${r.label} +${r.delta}`).join(' · ')
            + '. 🚨 So a program cost this arm carries is DEFERRED to the first blow on such a face, '
            + 'not avoided — the boot count cannot see it, because a pristine face is drawn by '
            + '`wallinstances.js` and its own layer 0 never reaches the GPU.'
          : 'every live coat\'s program was already compiled at boot, so the boot program count is '
            + 'the whole bill for this arm and nothing is deferred.');
    }

    // ---- A4 ----
    const a4 = arms.rows.filter((r) => r.label.startsWith('A4'));
    if (a4.length) {
      if (a4.every((r) => r.delta === 0)) {
        pass('A4 — the gallery joins the one program family for a token clearcoat',
          'the gallery\'s paper bake in a `MeshPhysicalMaterial` at clearcoat 0.02 is +0 programs, '
          + 'while its own maker\'s `MeshStandardMaterial` is +1 (A2) and clearcoat 0.00 is +1 (C7). '
          + 'So the boundary is clearcoat PRESENCE, not its value: one family can hold all six '
          + 'rooms\' coats, and the only thing spent is a wax the room\'s own wall does not have.');
      } else {
        fail('A4 — the gallery joins the one program family for a token clearcoat',
          a4.map((r) => `${r.label} ${r.delta >= 0 ? '+' : ''}${r.delta}`).join(' · '));
      }
    }

    // ---- A3 ----
    const a3 = arms.rows.filter((r) => r.label.startsWith('A3'));
    if (a3.length) {
      if (a3.every((r) => r.delta === 0)) {
        pass('A3 — `estateSkinMat(roomOpts)` costs no program',
          'the one-line edit (spreading the room\'s own boiserie arguments into the existing '
          + 'hardcoded call) is +0 programs for every room whose wall is already a boiserie.');
      } else {
        fail('A3 — `estateSkinMat(roomOpts)` costs no program',
          a3.map((r) => `${r.label} ${r.delta >= 0 ? '+' : ''}${r.delta}`).join(' · '));
      }
    }
  }

  // ------------------------------------------------------------------ 3. the bake
  const bake = await page.evaluate(async () => {
    const e = window.__rrr?.engine ?? window.__engine ?? window.engine;
    const b = e.baker;
    if (!b) return { err: 'engine.baker is not reachable' };
    const scene = e.scene ?? e.world?.scene;

    let mods;
    try {
      mods = {
        local: await import('/src/world/materials-local.js'),
        stages: await import('/src/materials/surfaces/wallstages.js'),
        walnut: await import('/src/materials/surfaces/walnut.js'),
      };
    } catch (err) { return { err: 'module import failed: ' + (err?.message ?? err) }; }
    const MAKER = {
      'est-bois': (o) => mods.local.boiserieMat(o),
      'ws.paper': (o) => mods.stages.wallpaperMat(o),
      walnut: (o) => mods.walnut.walnutPanel(o),
    };

    const wallMats = new Map();
    scene.traverse((o) => {
      if (typeof o.name !== 'string' || !o.name.startsWith('space.')) return;
      o.traverse((c) => { if (c.isMesh && c.name === 'kit:wall' && !wallMats.has(o.name.slice(6))) wallMats.set(o.name.slice(6), c.material); });
    });
    const names = [...new Set([...wallMats.values()].filter(Boolean).map((m) => m.name))];

    const snap = () => ({ bakes: b.stats.bakes, hits: b.stats.hits, bytes: b.stats.bytes, ms: b.stats.ms, size: b.cache.size });

    // B1 — asking the maker for a room's own arguments must be a CACHE HIT
    const hitRows = [];
    for (const name of names) {
      const i = name.indexOf(':');
      const family = name.slice(0, i);
      const mk = MAKER[family];
      if (!mk) { hitRows.push({ name, family, err: 'no maker wired' }); continue; }
      let opts;
      try { opts = JSON.parse(name.slice(i + 1)); } catch (err) { hitRows.push({ name, family, err: 'key is not JSON' }); continue; }
      const a = snap();
      let m = null;
      try { m = mk(opts); } catch (err) { hitRows.push({ name, family, err: 'maker threw: ' + (err?.message ?? err) }); continue; }
      const c = snap();
      const roundTrip = m.name === name;
      m.dispose();
      hitRows.push({
        name, family, roundTrip,
        dBakes: c.bakes - a.bakes, dHits: c.hits - a.hits,
        dMB: (c.bytes - a.bytes) / 1048576, dMs: c.ms - a.ms,
      });
    }

    // B2 / C5 — perturb ONE number and the bake counter must move; that delta is the price
    const probe = names.find((n) => MAKER[n.slice(0, n.indexOf(':'))]);
    let ctrl = null;
    if (probe) {
      const i = probe.indexOf(':');
      const family = probe.slice(0, i);
      const opts = JSON.parse(probe.slice(i + 1));
      // pick a scalar to nudge; falls back to injecting an unused key, which also changes the key
      const scalarKey = Object.keys(opts).find((k) => typeof opts[k] === 'number');
      const perturbed = { ...opts };
      if (scalarKey) perturbed[scalarKey] = opts[scalarKey] + 0.001;
      else perturbed.__coat1 = Math.random();
      const a = snap();
      const t0 = performance.now();
      let m = null, err = null;
      try { m = MAKER[family](perturbed); } catch (e2) { err = e2?.message ?? String(e2); }
      const wall = performance.now() - t0;
      const c = snap();
      if (m) m.dispose();
      ctrl = {
        family, scalarKey, err,
        dBakes: c.bakes - a.bakes, dMB: (c.bytes - a.bytes) / 1048576,
        dMs: c.ms - a.ms, wallMs: wall,
      };
    }

    return {
      names,
      hitRows,
      ctrl,
      totals: { bakes: b.stats.bakes, hits: b.stats.hits, mb: b.stats.bytes / 1048576, ms: b.stats.ms, cache: b.cache.size },
      report: typeof b.report === 'function' ? b.report() : '',
      atMs: Math.round(performance.now()),
    };
  });

  if (bake.err) {
    fail('the bake can be priced', bake.err);
  } else {
    note(`--- the baker, whole page: ${bake.report} ---`);
    note(`   cache entries ${bake.totals.cache} · bakes ${bake.totals.bakes} · hits ${bake.totals.hits} · `
      + `${bake.totals.mb.toFixed(1)} MB · ${bake.totals.ms.toFixed(0)} ms total`);
    note('--- B1: asking each room\'s maker for that room\'s own arguments ---');
    for (const h of bake.hitRows) {
      if (h.err) { note(`   ${h.family.padEnd(9)} ERR ${h.err}`); continue; }
      note(`   ${h.family.padEnd(9)} bakes ${h.dBakes >= 0 ? '+' : ''}${h.dBakes} · hits +${h.dHits} · `
        + `${h.dMB.toFixed(2)} MB · ${h.dMs.toFixed(1)} ms · key round-trips ${h.roundTrip}`);
    }

    const bad = bake.hitRows.filter((h) => h.err || h.dBakes !== 0 || !h.roundTrip);
    if (!bake.hitRows.length) {
      fail('B1 — a per-room coat costs NO new bake and NO new VRAM', 'no room wall bakes found');
    } else if (bad.length) {
      fail('B1 — a per-room coat costs NO new bake and NO new VRAM',
        bad.map((h) => `${h.family}: ${h.err ?? `bakes +${h.dBakes}, key round-trip ${h.roundTrip}`}`).join(' · '));
    } else {
      pass('B1 — a per-room coat costs NO new bake and NO new VRAM',
        `${bake.hitRows.length} distinct room wall bakes, every one a CACHE HIT (bakes +0, `
        + '0.00 MB, ~0 ms) when the maker is handed the room\'s own arguments. The baker keys on '
        + '`family:JSON.stringify(opts)` and the material NAME round-trips, so "the coat is the '
        + 'room\'s own texture" is free by construction — as long as the arguments are the same '
        + 'ones, which is what C5 prices getting wrong.');
    }

    if (!bake.ctrl) {
      fail('C5 CONTROL — the bake counter moves for a NEW argument set', 'the control did not run');
    } else if (bake.ctrl.err) {
      fail('C5 CONTROL — the bake counter moves for a NEW argument set', bake.ctrl.err);
    } else if (bake.ctrl.dBakes === 1) {
      pass('C5 CONTROL — the bake counter moves for a NEW argument set',
        `perturbing \`${bake.ctrl.family}\`'s \`${bake.ctrl.scalarKey}\` by 0.001 cost `
        + `**1 bake · ${bake.ctrl.dMB.toFixed(2)} MB VRAM · ${bake.ctrl.dMs.toFixed(0)} ms** `
        + `(${bake.ctrl.wallMs.toFixed(0)} ms wall clock). That is the price of ONE room's coat `
        + 'whose arguments do not match its wall — and it is what B1\'s zero is measured against.');
    } else {
      fail('C5 CONTROL — the bake counter moves for a NEW argument set',
        `bakes +${bake.ctrl.dBakes} for a deliberately new key — expected +1. B1's zeros are not `
        + 'trustworthy: the counter may not be live.');
    }
  }

  // ------------------------------------------------------------------ 4. C6 — no bake during play
  const before = await page.evaluate(() => {
    const b = (window.__rrr?.engine ?? window.__engine ?? window.engine)?.baker;
    return b ? { bakes: b.stats.bakes, ms: b.stats.ms, t: performance.now() } : null;
  });
  await page.waitForTimeout(3000);
  const after = await page.evaluate(() => {
    const b = (window.__rrr?.engine ?? window.__engine ?? window.engine)?.baker;
    return b ? { bakes: b.stats.bakes, ms: b.stats.ms, t: performance.now() } : null;
  });
  if (!before || !after) {
    fail('C6 — no bake happens during play', 'baker not reachable');
  } else if (after.bakes === before.bakes) {
    pass('C6 — no bake happens during play',
      `${((after.t - before.t) / 1000).toFixed(1)} s of live play, bakes ${before.bakes} → ${after.bakes} (+0). `
      + 'Every bake in this page happened during construction, i.e. inside the loading screen — '
      + 'NOT inside a frame the player is looking at. A coat built at panel construction inherits '
      + 'that; a coat built lazily on first damage would not, and C5 says what that would cost.');
  } else {
    fail('C6 — no bake happens during play',
      `bakes ${before.bakes} → ${after.bakes} over ${((after.t - before.t) / 1000).toFixed(1)} s of play — `
      + 'something bakes mid-frame, which is a stall the player sees.');
  }

  // ------------------------------------------------------------------ 5. what a new family costs at boot
  const byName = census.byName ?? {};
  const fam = Object.entries(byName).sort((a, b) => b[1] - a[1]);
  note('--- programs per program NAME (how many variants one material family spawns at boot) ---');
  for (const [n, c] of fam.slice(0, 14)) note(`   ×${String(c).padStart(3)}  ${n}`);

  /**
   * 🚨 **THE IN-PLACE DELTA IS PER LIGHT-COUNT; THE BOOT COST OF A NEW FAMILY IS THE MULTIPLIER.**
   * An arm added at one settled station compiles for the ONE light/shadow configuration on screen
   * at that moment, so a new family reads +1. At boot, `views/game.js` warms four point-light
   * counts on purpose (`perf-stall-1`: an un-warmed count costs +132 programs, i.e. John's
   * five-second freeze), and `_boot1-census` recorded every wall material at SIX programs after
   * `progkey-1`. So the number to multiply an A2-style +1 by is this histogram, read off THIS
   * page rather than quoted — printed here so a report can say "+1 in place, ~×N at boot"
   * without either figure being a guess.
   */
  /**
   * ⚠️ **READ THIS COLUMN AS "PROGRAMS FIRST CREATED BY THIS MATERIAL", NOT "PROGRAMS IT USES".**
   * `WebGLProgram.name` comes from the parameters of whichever material compiled the program
   * FIRST; every later material that hits the same key just increments `usedTimes`. So a ZERO
   * here does not mean the material draws without a program — it means **it is already sharing
   * someone else's**, which is the very behaviour this file is asking a per-room coat to inherit.
   */
  const wallNames = [...new Set((census.rooms ?? []).map((r) => r.wall?.name).filter(Boolean))];
  note('--- programs FIRST CREATED by each room-wall material (0 = it shares another\'s) ---');
  for (const n of wallNames) {
    note(`   ×${String(byName[n] ?? 0).padStart(3)}  ${n.slice(0, 100)}`);
  }
  const mult = wallNames.map((n) => byName[n] ?? 0).filter((c) => c > 0);
  if (mult.length) {
    const lo = Math.min(...mult), hi = Math.max(...mult);
    note(`   → one program FAMILY is ${lo === hi ? lo : `${lo}–${hi}`} programs at boot (light/shadow `
      + `variants), so an A2-style "+1 in place" is ~${hi} at boot, not 1. At progkey-1's `
      + `~106 ms/program that is ~${(hi * 0.106).toFixed(1)} s of cold boot. `
      + '(ARITHMETIC from this page\'s own histogram, stated as such — not a timed measurement.)');
  }
  const shared = wallNames.filter((n) => (byName[n] ?? 0) === 0);
  if (shared.length) {
    note(`   → ${shared.length} of ${wallNames.length} room-wall materials already create ZERO `
      + 'programs of their own — the house is ALREADY sharing wall programs across rooms with '
      + 'different textures. A per-room coat is asking for the behaviour that already ships.');
  }
}
