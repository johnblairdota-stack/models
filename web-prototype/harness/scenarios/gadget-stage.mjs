/**
 * GADGET STAGING — park the player at a NAMED anchor with a NAMED gadget fitted, in the real
 * game, and measure the result on demand.
 *
 * WHY THIS EXISTS. `critic-gadget-4` was asked to rule on the nail gun's heat wash in
 * `game.play` and could not: **"no scenario/debug loadout found within budget."** Its verdict
 * therefore rested entirely on numbers already on record, which it flagged as internally
 * inconsistent with the code comment they came from. A verdict nobody can reproduce is the
 * thing this project keeps getting burned by, so this is the missing half of that loop.
 *
 *   GADGET=nailgun SPOT=service.mid node harness/playtest.mjs --view game.play \
 *     --script harness/scenarios/gadget-stage.mjs --port 5196 --shots
 *
 * Environment (all optional):
 *   GADGET   nailgun | oil | ball | grapple | skates | none        (default nailgun)
 *   SOCKET   shoulderL | shoulderR                                 (default shoulderL)
 *   SPOT     any name from `room.anchorNames()`                    (default service.mid)
 *   YAW      aim yaw in DEGREES, 0 = +Z                            (default 0)
 *   WASH     ab -> also run the heat-wash A/B described below      (default off)
 *   FIRE     1  -> pull the trigger once before measuring          (default off)
 *
 * WHAT IT ASSERTS, and why each one is a measurement rather than a look:
 *
 *  1. THE ANCHOR EXISTS. A hardcoded XZ does not throw when the floor plan changes; it puts
 *     the body inside a wall and reports a plausible number (`spaces.js` says this in its own
 *     ANCHORS header). An unknown SPOT is a hard FAIL here, with the legal list printed.
 *  2. THE GADGET IS FITTED — read back off `rig.occupant()` / `rig.activeWeapon`, not off the
 *     call's return value.
 *  3. THE GADGET REACHES THE SCREEN. This is the project's dominant defect class ("it exists,
 *     something is in front of it"), so the check is a camera->pixel raycast over a grid — the
 *     `_tmp_geoprobe --pick` idiom — counting cells whose FIRST hit is a mesh under the gadget
 *     root. "The gadget is in the scene graph" is not the same claim and has been wrong before.
 *  4. THE FLOOR IS VISIBLE BESIDE THE PLAYER, found the same way, so the wash numbers below
 *     are known to be measuring floor rather than the robot's own shin.
 *
 * THE HEAT-WASH A/B (`WASH=ab`). The four settings documented at `heatWash` in
 * `src/gadgets/index.js` are re-staged HERE, on the corridor mid-tone, against a control with
 * the filter hidden. Every variant is built by the production `glowSprite()` imported from the
 * real module — no reimplementation of the blend maths, which is the failure mode a hand-rolled
 * A/B always has.
 *
 * ⚠️ THREE INSTRUMENT TRAPS, ALL LIVE HERE:
 *  - THE GUN'S OWN LIGHT FLICKERS. `nailGun.update()` drives `light.intensity` off two sines,
 *    so the floor patch breathes several LDR levels frame to frame and two settings sampled at
 *    different phases are not comparable. The sim is FROZEN (`engine.freezeAt`) before any
 *    reading, so every variant is measured on the same lighting frame.
 *  - DYNAMIC RESOLUTION resamples the whole image whenever frame cost moves. Pinned off.
 *  - A WebGL canvas is cleared on present, so `drawImage` must happen in the SAME synchronous
 *    task as the render that filled it. Each variant renders and reads without awaiting.
 */

const CFG = {
  gadget: process.env.GADGET || 'nailgun',
  socket: process.env.SOCKET || 'shoulderL',
  spot: process.env.SPOT || 'service.mid',
  yawDeg: +(process.env.YAW ?? 0),
  wash: (process.env.WASH || '').toLowerCase(),
  fire: process.env.FIRE === '1',
};

/**
 * The four documented settings plus the control. `blend`/`hex`/`strength` are exactly the
 * arguments `glowSprite()` takes, so what is measured is what would ship.
 */
const WASH_SETTINGS = [
  { id: 'off', label: 'control — filter hidden', hidden: true },
  { id: 'opt1-normal', label: '(1) normal blend 0xff8a3c @0.46', blend: 'normal', hex: 0xff8a3c, strength: 0.46 },
  { id: 'opt2-saturated', label: '(2) multiply 0xff7a20 @0.46 (rejected)', blend: 'multiply', hex: 0xff7a20, strength: 0.46 },
  { id: 'opt3-hot', label: '(3) multiply 0xff7a20 @0.72 (first cut)', blend: 'multiply', hex: 0xff7a20, strength: 0.72 },
  { id: 'opt4-shipped', label: '(4) multiply 0xff8a3c @0.46 (studio value)', blend: 'multiply', hex: 0xff8a3c, strength: 0.46 },
  { id: 'gated-world', label: 'GATED: HEAT_WASH.world, multiply 0xff8a3c @0.12', blend: 'multiply', hex: 0xff8a3c, strength: 0.12 },
  // The sprite THIS BUILD actually created, whatever that is. Every other row is a variant
  // constructed here; this row is the ground truth, so a critic can see at a glance which of
  // the settings above the shipping object matches — and catch it if it matches none of them.
  { id: 'as-built', label: 'the sprite this build ships', live: true },
];

/**
 * `WASH=sweep` — the same tint at a ladder of strengths. This is the table that decides
 * whether ONE static value can serve a near-white studio cyc and a lit corridor mid-tone, or
 * whether the strength has to be gated on which of the two the gun is standing in.
 */
const WASH_SWEEP = [{ id: 'off', label: 'control — filter hidden', hidden: true }].concat(
  [0.08, 0.12, 0.14, 0.20, 0.28, 0.36, 0.46, 0.60].map((s) => ({
    id: `mul@${s.toFixed(2)}`, label: `multiply 0xff8a3c @${s.toFixed(2)}`,
    blend: 'multiply', hex: 0xff8a3c, strength: s,
  })));

const SETTINGS = CFG.wash === 'sweep' ? WASH_SWEEP : WASH_SETTINGS;

export default async function gadgetStage({ page, note, pass, fail, skip, shot, waitFor }) {
  // ---------------------------------------------------------------- which world are we in
  //
  // THE SAME INSTRUMENT HAS TO ANSWER BOTH HALVES OF THE HEAT-WASH QUESTION, or the two halves
  // get measured by two tools and the comparison is worthless. Pointed at `game.play` it stages
  // a player in a room; pointed at `gadget.nailgun` it profiles the studio cyc beside the gun,
  // which is the surface the filter was tuned on. One code path, one set of settings, one
  // pixel-reading routine.
  const STUDIO = !(await page.evaluate(() => !!window.__rrr?.engine?.player));
  if (STUDIO) return studioProfile({ page, note, pass, fail, skip, shot });

  note(`staging ${CFG.gadget} at ${CFG.spot}, socket ${CFG.socket}, yaw ${CFG.yawDeg}°`);

  // ---------------------------------------------------------------- 0. WAIT IN GAME TIME
  //
  // ⚠️ WALL CLOCK IS NOT GAME TIME HERE, AND THIS COST A WHOLE RUN. `engine.start()` is deferred
  // to the Play-gate click, so the seconds right after it are the room's first-visit shader
  // compile — a 2 400 ms hitch during which the live loop renders a handful of frames. A 1.2 s
  // wall-clock wait bought THREE frames of simulation, the camera boom's exponential ease had
  // not converged, and the first run of this scenario measured a camera 9.5 m from the player
  // with the robot behind a wall. Wait on `engine.elapsed` instead.
  // (`waitFor` evaluates its predicate INSIDE the page, so the two samples have to be taken
  // from here — a predicate that calls `page.evaluate` throws in the page and is swallowed as
  // "not ready yet", which silently turns this into a fixed sleep of the whole timeout.)
  let warmed = null;
  for (let i = 0; i < 200 && warmed == null; i++) {
    const a = await page.evaluate(() => window.__rrr.engine.elapsed);
    await page.waitForTimeout(400);
    const b = await page.evaluate(() => window.__rrr.engine.elapsed);
    if (b - a > 0.30) warmed = +b.toFixed(2);          // ≥45 fps of game time for 0.4 s
  }
  warmed == null
    ? note('WARNING: game time never reached full rate — readings below may be mid-compile')
    : note(`live loop at full rate, engine.elapsed = ${warmed}s`);

  // ---------------------------------------------------------------- 1. stage the world
  const staged = await page.evaluate(async (cfg) => {
    const e = window.__rrr.engine, p = e.player, h = e.hunter, room = e.room;
    const names = room.anchorNames();
    if (!names.includes(cfg.spot)) return { ok: false, why: 'unknown anchor', names };

    const a = room.anchor(cfg.spot);
    const yaw = cfg.yawDeg * Math.PI / 180;
    p.pos.set(a.x, p.pos.y, a.z);
    p.vel.set(0, 0, 0);
    p.aimYaw = yaw;
    if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = 0; }

    // Banish the hunter. It is a lit body with its own flare, and a wandering one changes the
    // floor's luminance between two readings that are supposed to differ only by the filter.
    if (h) {
      h.root.position.set(a.x, 0, a.z + 200);
      h.state = 'PATROL'; h.awareness = 0; h.vel?.set?.(0, 0, 0);
    }

    // Clear both arms first: `fitGadget` ejects whatever is there, and an ejected arm falls on
    // the floor exactly where the wash is about to be measured.
    for (const s of ['shoulderL', 'shoulderR']) {
      if (p.rig.occupant(s) !== 'empty') p.rig.detach(s);
    }
    for (const it of (e.limbField?.items ?? []).filter((i) => i.inWorld)) {
      if (it.root) it.root.position.z += 300;   // sweep loose debris out of frame
    }

    let fitted = null;
    if (cfg.gadget === 'skates') fitted = p.rig.fitSkates?.() ?? null;
    else if (cfg.gadget !== 'none') fitted = p.rig.fitGadget(cfg.socket, cfg.gadget);
    p.rig.preferSocket = cfg.socket;

    return {
      ok: true,
      pos: [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)],
      space: room.spaceAt(p.pos)?.id ?? null,
      floorY: room.floorY,
      occ: p.rig.occupant(cfg.socket),
      weapon: p.rig.activeWeapon,
      skates: !!p.rig.skates,
      fitted: !!fitted,
    };
  }, CFG);

  if (!staged.ok) {
    fail('the staging anchor exists', `"${CFG.spot}" is not an anchor — legal: ${staged.names.join(', ')}`);
    return;
  }
  pass('the staging anchor exists', `${CFG.spot} -> ${JSON.stringify(staged.pos)} in ${staged.space}`);
  note(`staged: ${JSON.stringify(staged)}`);

  // Let the camera boom converge ON THE STAGED BODY — measured, not waited for. The boom eases
  // at `1 - exp(-11·dt)` and raycasts the world, so after a teleport it has to travel; a frozen
  // frame taken before it arrives photographs a wall.
  await page.evaluate(() => {
    const e = window.__rrr.engine;
    e.opts.dynamicRes = false;                       // pin BEFORE the settle, not after
    if (e.pipeline.renderScale !== 1) {
      e.pipeline.renderScale = 1;
      e.pipeline.setSize(e.pipeline.canvasWidth, e.pipeline.canvasHeight);
    }
  });
  const boom = await waitFor(() => {
    const e = window.__rrr.engine;
    const d = e.camera.position.distanceTo(e.player.pos);
    return d < (e.cam?.distance ?? 3.1) + 0.9 ? +d.toFixed(2) : null;
  }, { timeout: 30000, every: 200 });
  boom == null
    ? note('WARNING: the camera boom never settled onto the staged body')
    : note(`camera boom settled ${boom} m from the player`);
  await page.waitForTimeout(500);

  if (CFG.fire) {
    await page.evaluate(() => {
      const e = window.__rrr.engine, p = e.player;
      const d = p.aimDir.clone(); d.y = 0; d.normalize();
      e.weapons.fire(p.rig.activeWeapon, p.eye.clone(), d, performance.now() / 1000, { ignore: p.rig, shooter: p });
    });
    await page.waitForTimeout(200);
  }

  const frozen = await page.evaluate(() => {
    const e = window.__rrr.engine;
    e.freezeAt = e.elapsed;                    // `_step` now renders without running updaters
    return { at: +e.elapsed.toFixed(3), renderScale: +e.pipeline.renderScale.toFixed(3) };
  });
  note(`world frozen at t=${frozen.at}s, renderScale pinned at ${frozen.renderScale}`);
  await page.waitForTimeout(300);

  // ---------------------------------------------------------------- 2. is it fitted
  if (CFG.gadget === 'none') skip('the gadget is fitted', 'GADGET=none');
  else if (CFG.gadget === 'skates') {
    staged.skates ? pass('the gadget is fitted', 'rig.skates set')
      : fail('the gadget is fitted', 'fitSkates() refused — needs two whole legs');
  } else if (staged.weapon === CFG.gadget || staged.occ === 'gadget') {
    pass('the gadget is fitted', `${CFG.socket}=${staged.occ}, activeWeapon=${staged.weapon}`);
  } else {
    fail('the gadget is fitted', `socket reads "${staged.occ}", activeWeapon "${staged.weapon}"`);
  }

  // ---------------------------------------------------------------- 3./4. what owns the pixels
  //
  // Camera -> pixel raycast, the `_tmp_geoprobe --pick` idiom, run over a grid across the
  // frame. It answers "is it missing, or is something in front of it" — the question that has
  // cost this project at least six rounds. It also finds the floor cells the wash measurement
  // needs, so those coordinates are DERIVED rather than guessed.
  const owners = await page.evaluate(({ cfg }) => {
    const e = window.__rrr.engine, cam = e.camera, p = e.player;
    const V3 = cam.position.constructor;
    const W = e.canvas.width, H = e.canvas.height;

    // `fitSkates()` stores on `rig.skates`, NOT in `gadgetsFitted` — skates mount `shinBoth`
    // over both legs and never occupy an arm socket (see limbs.js's own warning).
    const gadgetRoot = (cfg.gadget === 'skates')
      ? (e.player.rig.skates?.root ?? null)
      : (e.player.rig.gadgetsFitted?.[cfg.socket]?.root ?? null);
    const underGadget = new Set();
    gadgetRoot?.traverse?.((o) => underGadget.add(o));

    const meshes = [];
    e.scene.traverse((o) => {
      if (!o.isMesh) return;
      let vis = true;
      for (let q = o; q; q = q.parent) if (q.visible === false) vis = false;
      if (!vis) return;
      if (!o.geometry?.boundingSphere) o.geometry?.computeBoundingSphere?.();
      meshes.push(o);
    });

    const hit = (m, o, d) => {
      const g = m.geometry, pa = g.attributes.position, bs = g.boundingSphere;
      if (bs) {
        const cx = bs.center.x - o.x, cy = bs.center.y - o.y, cz = bs.center.z - o.z;
        const t = cx * d.x + cy * d.y + cz * d.z;
        const dx = cx - t * d.x, dy = cy - t * d.y, dz = cz - t * d.z;
        if (dx * dx + dy * dy + dz * dz > bs.radius * bs.radius) return Infinity;
      }
      const a = pa.array, idx = g.index ? g.index.array : null;
      const n = idx ? idx.length : pa.count;
      let best = Infinity;
      for (let t3 = 0; t3 < n; t3 += 3) {
        const i0 = (idx ? idx[t3] : t3) * 3, i1 = (idx ? idx[t3 + 1] : t3 + 1) * 3, i2 = (idx ? idx[t3 + 2] : t3 + 2) * 3;
        const e1x = a[i1] - a[i0], e1y = a[i1 + 1] - a[i0 + 1], e1z = a[i1 + 2] - a[i0 + 2];
        const e2x = a[i2] - a[i0], e2y = a[i2 + 1] - a[i0 + 1], e2z = a[i2 + 2] - a[i0 + 2];
        const hx = d.y * e2z - d.z * e2y, hy = d.z * e2x - d.x * e2z, hz = d.x * e2y - d.y * e2x;
        const det = e1x * hx + e1y * hy + e1z * hz;
        if (Math.abs(det) < 1e-14) continue;
        const inv = 1 / det;
        const sx = o.x - a[i0], sy = o.y - a[i0 + 1], sz = o.z - a[i0 + 2];
        const u = (sx * hx + sy * hy + sz * hz) * inv;
        if (u < 0 || u > 1) continue;
        const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
        const v = (d.x * qx + d.y * qy + d.z * qz) * inv;
        if (v < 0 || u + v > 1) continue;
        const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (tt > 1e-6 && tt < best) best = tt;
      }
      return best;
    };

    cam.updateMatrixWorld();
    const pick = (px, py) => {
      const near = new V3((px / W) * 2 - 1, -(py / H) * 2 + 1, -1).unproject(cam);
      const far = new V3((px / W) * 2 - 1, -(py / H) * 2 + 1, 1).unproject(cam);
      const dirW = far.clone().sub(near).normalize();
      let bestD = Infinity, bestM = null;
      for (const m of meshes) {
        const invM = m.matrixWorld.clone().invert();
        const o = cam.position.clone().applyMatrix4(invM);
        const tip = cam.position.clone().add(dirW).applyMatrix4(invM);
        const d = tip.sub(o);
        const len = d.length();
        if (len < 1e-12) continue;
        d.multiplyScalar(1 / len);
        const t = hit(m, o, d) / len;
        if (t < bestD) { bestD = t; bestM = m; }
      }
      return bestM ? { m: bestM, dist: bestD } : null;
    };

    // Project a world point to canvas pixels — used to aim the floor probes.
    const project = (v) => {
      const q = v.clone().project(cam);
      return [(q.x * 0.5 + 0.5) * W, (1 - (q.y * 0.5 + 0.5)) * H, q.z];
    };

    // ---- gadget coverage: a coarse grid over the whole frame
    const N = 48;
    let gadgetCells = 0, total = 0;
    let bb = [1e9, 1e9, -1e9, -1e9];
    const tally = new Map();
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const px = (c + 0.5) * W / N, py = (r + 0.5) * H / N;
        const h = pick(px, py);
        total++;
        const nm = h ? (h.m.name || '(unnamed)') : '(bg)';
        tally.set(nm, (tally.get(nm) ?? 0) + 1);
        if (h && underGadget.has(h.m)) {
          gadgetCells++;
          bb = [Math.min(bb[0], px), Math.min(bb[1], py), Math.max(bb[2], px), Math.max(bb[3], py)];
        }
      }
    }

    // ---- floor probes: a polar ring of world points on the floor around the player, kept
    // only where the raycast agrees that the first thing the camera meets there IS the floor.
    const floorY = e.room.floorY ?? 0;
    const probes = [];
    for (const rad of [0.7, 1.0, 1.4, 1.8, 2.4, 3.0]) {
      for (let k = 0; k < 16; k++) {
        const th = k / 16 * Math.PI * 2;
        const w = new V3(p.pos.x + Math.cos(th) * rad, floorY + 0.01, p.pos.z + Math.sin(th) * rad);
        const [px, py, z] = project(w);
        if (z > 1 || px < 4 || py < 4 || px > W - 4 || py > H - 4) continue;
        const h = pick(px, py);
        if (!h) continue;
        // is the first hit actually at this floor point? (within 12 cm along the ray)
        const camd = cam.position.distanceTo(w);
        if (Math.abs(h.dist - camd) > 0.12) continue;
        probes.push({
          r: rad, thDeg: Math.round(th * 180 / Math.PI),
          px: Math.round(px), py: Math.round(py),
          mesh: h.m.name || '(unnamed)', mat: h.m.material?.name || '',
          world: [+w.x.toFixed(2), +w.z.toFixed(2)],
        });
      }
    }

    // Where is the body, and does the camera point at it? Reported ALWAYS, because "the gadget
    // is not on screen" has two completely different causes and only this tells them apart.
    const body = p.root ?? p.model ?? null;
    let bodyMeshes = 0, bodyVisible = 0;
    body?.traverse?.((o) => {
      if (!o.isMesh) return;
      bodyMeshes++;
      let vis = true;
      for (let q = o; q; q = q.parent) if (q.visible === false) vis = false;
      if (vis) bodyVisible++;
    });
    const bodyPx = body ? project(body.getWorldPosition(new V3())) : null;
    const camInfo = {
      pos: [+cam.position.x.toFixed(2), +cam.position.y.toFixed(2), +cam.position.z.toFixed(2)],
      dir: (() => { const d = new V3(); cam.getWorldDirection(d); return [+d.x.toFixed(2), +d.y.toFixed(2), +d.z.toFixed(2)]; })(),
      playerPos: [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2)],
      distToPlayer: +cam.position.distanceTo(p.pos).toFixed(2),
      bodyMeshes, bodyVisible,
      bodyPx: bodyPx ? [Math.round(bodyPx[0]), Math.round(bodyPx[1]), +bodyPx[2].toFixed(3)] : null,
      gadgetMeshes: underGadget.size,
    };

    return {
      W, H, gadgetCells, total, camInfo,
      gadgetName: gadgetRoot?.name ?? null,
      bb: gadgetCells ? bb.map((n) => Math.round(n)) : null,
      top: [...tally].sort((a, b) => b[1] - a[1]).slice(0, 8),
      probes,
    };
  }, { cfg: CFG });

  note(`frame ${owners.W}x${owners.H}; biggest pixel owners: ${owners.top.map(([n, c]) => `${n}:${c}`).join(' ')}`);
  note(`camera: ${JSON.stringify(owners.camInfo)}`);
  if (CFG.gadget === 'none') skip('the gadget reaches the screen', 'GADGET=none');
  else if (owners.gadgetCells > 0) {
    pass('the gadget reaches the screen',
      `${owners.gadgetCells}/${owners.total} raycast cells own it, bbox ${JSON.stringify(owners.bb)}`);
  } else {
    fail('the gadget reaches the screen',
      'not one raycast cell hits a mesh under the gadget root — it is fitted but occluded or off-frame');
  }

  owners.probes.length >= 3
    ? pass('floor is visible beside the player', `${owners.probes.length} floor probe points, ${owners.probes[0].mesh}`)
    : fail('floor is visible beside the player', `${owners.probes.length} probes — nothing to measure the wash on`);

  await shot(`stage-${CFG.gadget}-${CFG.spot}`);

  // ---------------------------------------------------------------- 5. the heat-wash A/B
  if (CFG.wash !== 'ab' && CFG.wash !== 'sweep') {
    note('WASH not set to ab|sweep — skipping the heat-wash A/B');
    return;
  }
  if (!owners.probes.length) { skip('heat wash A/B', 'no floor probe points'); return; }

  const ab = await page.evaluate(async ({ settings, probes, cfg }) => {
    const e = window.__rrr.engine;
    // The REAL production factory, from the same module URL the app imported — so the blend
    // factors, the texture ramp and the sRGB decode are the shipping ones, not a copy.
    const gm = await import('/src/gadgets/gadgetmat.js');
    const fittedRoot = (cfg.gadget === 'skates')
      ? (e.player?.rig?.skates?.root ?? null)
      : (e.player?.rig?.gadgetsFitted?.[cfg.socket]?.root ?? null);

    // ⚠️ THE SCENE CONTAINS MORE THAN ONE `heatWash`, AND PICKING THE WRONG ONE FAKES A NULL
    // RESULT. Detaching the starting arm leaves its whole gadget — sprite included — alive as
    // world debris, so `traverse` finds two. The first version of this took the LAST one it
    // reached, hid a sprite 300 m off-frame, and reported that all five settings including the
    // control were pixel-identical: a confident "this effect does nothing" that was entirely
    // the instrument. Take the one under the FITTED gadget's root, and say how many there are.
    const washes = [];
    e.scene.traverse((o) => { if (o.isSprite && o.name === 'heatWash') washes.push(o); });
    if (!washes.length) return { ok: false, why: 'no sprite named heatWash in the scene' };
    const owned = new Set();
    fittedRoot?.traverse?.((o) => owned.add(o));
    const wash = washes.find((w) => owned.has(w)) ?? washes[0];
    const washOwned = owned.has(wash);

    // Where is it on screen, and how big? A filter that is off-frame or sub-pixel cannot be
    // the thing staining the room, whatever the comment says.
    const cam = e.camera; cam.updateMatrixWorld();
    const V3 = cam.position.constructor;
    const W0 = e.canvas.width, H0 = e.canvas.height;
    const wp = wash.getWorldPosition(new V3());
    const q = wp.clone().project(cam);
    const geom = {
      n: washes.length, washUnderFittedGadget: washOwned,
      worldPos: [+wp.x.toFixed(2), +wp.y.toFixed(2), +wp.z.toFixed(2)],
      px: [Math.round((q.x * 0.5 + 0.5) * W0), Math.round((1 - (q.y * 0.5 + 0.5)) * H0), +q.z.toFixed(3)],
      worldScale: +wash.getWorldScale(new V3()).x.toFixed(2),
      distToCam: +cam.position.distanceTo(wp).toFixed(2),
      visible: wash.visible,
      blending: wash.material.blending,
      depthTest: wash.material.depthTest,
      renderOrder: wash.renderOrder,
      frustumCulled: wash.frustumCulled,
      inFrustum: Math.abs(q.x) < 1.5 && Math.abs(q.y) < 1.5 && q.z < 1,
    };

    const home = wash.parent;
    const out = [];
    let alt = null;
    for (const s of settings) {
      if (alt) { alt.removeFromParent(); alt.material.dispose(); alt = null; }
      if (s.hidden) {
        wash.visible = false;
      } else if (s.live) {
        wash.visible = true;                       // the object this build actually ships
      } else {
        wash.visible = false;
        alt = gm.glowSprite(s.hex, s.strength, { blend: s.blend, order: -4, name: 'heatWashAB' });
        alt.scale.copy(wash.scale);
        alt.position.copy(wash.position);
        home.add(alt);
      }
      // Render and read in ONE synchronous block: a WebGL drawing buffer is gone after present.
      for (let i = 0; i < 3; i++) e._step(1 / 60, performance.now());
      const cv = document.createElement('canvas');
      cv.width = e.canvas.width; cv.height = e.canvas.height;
      const c2 = cv.getContext('2d', { willReadFrequently: true });
      c2.drawImage(e.canvas, 0, 0);
      const px = c2.getImageData(0, 0, cv.width, cv.height).data;
      out.push({
        id: s.id, label: s.label,
        // Whole-frame footprint, against the control. This is the check that separates "the
        // filter is gentle" from "the filter never reached the screen" — the class of error
        // that has cost this project six rounds.
        raw: px,
        vals: probes.map((q) => {
          const i = (q.py * cv.width + q.px) * 4;
          return [px[i], px[i + 1], px[i + 2]];
        }),
      });
    }
    if (alt) { alt.removeFromParent(); alt.material.dispose(); }
    wash.visible = true;

    // frame diffs, computed here so the raw buffers never cross the bridge
    const base = out[0].raw;
    const n = base.length / 4;
    for (const s of out) {
      let sum = 0, moved = 0, peak = 0;
      for (let i = 0; i < n; i++) {
        const d = Math.abs(s.raw[i * 4] - base[i * 4])
          + Math.abs(s.raw[i * 4 + 1] - base[i * 4 + 1])
          + Math.abs(s.raw[i * 4 + 2] - base[i * 4 + 2]);
        sum += d / 3;
        if (d > 3) moved++;
        if (d / 3 > peak) peak = d / 3;
      }
      s.diff = { mean: +(sum / n).toFixed(3), movedPct: +(100 * moved / n).toFixed(2), peak: +peak.toFixed(1) };
      delete s.raw;
    }
    return { ok: true, out, geom };
  }, { settings: SETTINGS, probes: owners.probes.map((p) => ({ px: p.px, py: p.py })), cfg: CFG });

  if (!ab.ok) { fail('heat wash A/B', ab.why); return; }

  const L = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const ctrl = ab.out[0];

  note(`heatWash sprite: ${JSON.stringify(ab.geom)}`);
  note('');
  note('  WHOLE-FRAME FOOTPRINT of each setting against the filter-hidden control:');
  for (const s of ab.out) {
    note(`    ${s.id.padEnd(14)} mean|Δ| ${String(s.diff.mean).padStart(6)}  moved ${String(s.diff.movedPct).padStart(6)}% of pixels  peak ${s.diff.peak}`);
  }
  const ship = ab.out.find((s) => s.id === 'opt4-shipped') ?? ab.out.at(-1);
  ship.diff.movedPct > 1.0
    ? pass('the heat wash reaches the screen', `${ship.id}: ${ship.diff.movedPct}% of pixels move when it is hidden`)
    : fail('the heat wash reaches the screen',
      `hiding it changes only ${ship.diff.movedPct}% of pixels (mean|Δ| ${ship.diff.mean}) — the filter is not the thing colouring this room`);

  // Rank the probes by how WARM they already are with the filter off. "The warm floor patch
  // beside the player" is then a measured selection, not a coordinate somebody remembered.
  const ranked = owners.probes
    .map((p, i) => ({ ...p, i, base: ctrl.vals[i], warmth: ctrl.vals[i][0] - ctrl.vals[i][2] }))
    .sort((a, b) => b.warmth - a.warmth);

  note('');
  note(`HEAT WASH ON THE CORRIDOR MID-TONE — ${owners.probes.length} floor probes, world-frozen`);
  note(`  the 6 warmest floor points with the filter OFF, then each setting at the same pixel:`);
  for (const p of ranked.slice(0, 6)) {
    const cells = ab.out.map((s) => {
      const v = s.vals[p.i];
      return `${s.id.padEnd(14)} ${String(v[0]).padStart(3)}/${String(v[1]).padStart(3)}/${String(v[2]).padStart(3)} L${L(v).toFixed(0).padStart(3)}`;
    });
    note(`  r=${p.r}m th=${p.thDeg}° px ${p.px},${p.py} on ${p.mesh}`);
    for (const c of cells) note(`      ${c}`);
  }

  // Mean over the warm half, which is the patch the HANDOFF's 171/99/45 describes.
  const warmSet = ranked.filter((p) => p.warmth > 8).slice(0, 12);
  const set = warmSet.length ? warmSet : ranked.slice(0, 6);
  note('');
  note(`  MEAN over the ${set.length} warmest floor probes:`);
  const means = ab.out.map((s) => {
    const m = [0, 1, 2].map((ch) => set.reduce((a, p) => a + s.vals[p.i][ch], 0) / set.length);
    return { id: s.id, label: s.label, m, L: L(m) };
  });
  for (const m of means) {
    note(`    ${m.id.padEnd(14)} ${m.m.map((v) => v.toFixed(0).padStart(3)).join('/')}  L${m.L.toFixed(1).padStart(5)}  r-b ${(m.m[0] - m.m[2]).toFixed(1)}   ${m.label}`);
  }

  // Assertions the next critic can gate on, stated as observable facts rather than opinions.
  const byId = Object.fromEntries(means.map((m) => [m.id, m]));
  note('');
  note(`  luminance COST against the control, per setting:`);
  for (const m of means) if (m.id !== 'off') note(`    ${m.id.padEnd(14)} ΔL ${(m.L - byId.off.L).toFixed(1)}`);

  // The HISTORICAL finding, kept as a printed number rather than as a permanently-red
  // assertion: options (2) and (4) — the setting rejected on its own terms and the "fix" that
  // replaced it — are the same setting on this surface. Both are still built above so the claim
  // stays checkable, but neither is what ships, so neither belongs in a regression gate.
  if (byId['opt4-shipped'] && byId['opt2-saturated']) {
    const dShip = byId['opt4-shipped'].L - byId.off.L;
    const dSat = byId['opt2-saturated'].L - byId.off.L;
    note(`  (2) vs (4): ΔL ${dSat.toFixed(1)} vs ${dShip.toFixed(1)} — ${Math.abs(dShip - dSat).toFixed(1)} levels apart`
      + `${Math.abs(dShip - dSat) < 4 ? ', i.e. the "tint backed off toward white" fix never took effect here' : ''}`);
  }

  // THE GATE ITSELF, and it is the thing that must not regress. `as-built` is the sprite this
  // build created; on the mid-tone it has to be gentle, and it still has to be warmer than no
  // filter at all — a wash that costs nothing by doing nothing is not a fix.
  const built = byId['as-built'];
  if (!built) skip('the shipping heat wash is gentle on a mid-tone', 'no as-built row (WASH=sweep?)');
  else {
    const dBuilt = built.L - byId.off.L;
    const warmGain = (built.m[0] - built.m[2]) - (byId.off.m[0] - byId.off.m[2]);
    (dBuilt > -10 && warmGain > 2)
      ? pass('the shipping heat wash is gentle on a mid-tone',
        `ΔL ${dBuilt.toFixed(1)} (bar -10) while still adding r-b +${warmGain.toFixed(1)}`)
      : fail('the shipping heat wash is gentle on a mid-tone',
        `ΔL ${dBuilt.toFixed(1)}, r-b gain +${warmGain.toFixed(1)} — needs ΔL > -10 AND r-b gain > 2`);
  }
}

/**
 * THE OTHER SURFACE: the near-white studio cyc in `gadget.nailgun`, profiled along a row
 * beside the gun the way the bar art itself was profiled.
 *
 *   WASH=ab node harness/playtest.mjs --view gadget.nailgun \
 *     --script harness/scenarios/gadget-stage.mjs --port 5196 --shots
 *
 * The bar art's own row (Dev Art 1785313925351, recorded in `index.js`) runs r-b
 * +6/+17/+27/+45/+62 as it approaches the gun, against a clean cyc of r-b 0. Those five
 * numbers are the acceptance target, and they are why the filter is a multiply at all.
 */
async function studioProfile({ page, note, pass, fail, skip, shot }) {
  note(`studio profile — no engine.player, so this is a gadget view, not the game`);
  // ⚠️ DO NOT `await window.__rrr.settle(n)` HERE. `settle()` targets are only ever resolved
  // inside `Engine._captureLoop`; `_liveLoop` never touches `_settleTargets`, so under
  // `playtest.mjs` — which boots without `capture=1` — that promise never settles and the
  // evaluate hangs until the harness times out. It cost one 10-minute run. Count frames.
  const f0 = await page.evaluate(() => window.__rrr.frames());
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(250);
    const f = await page.evaluate(() => window.__rrr.frames());
    if (f - f0 > 30) break;
  }

  const setup = await page.evaluate(() => {
    const e = window.__rrr.engine;
    e.opts.dynamicRes = false;
    e.freezeAt = e.elapsed;
    const cam = e.camera; cam.updateMatrixWorld();
    const V3 = cam.position.constructor;
    const W = e.canvas.width, H = e.canvas.height;
    let wash = null;
    e.scene.traverse((o) => { if (o.isSprite && o.name === 'heatWash') wash = o; });
    if (!wash) return { ok: false, why: 'no heatWash sprite — is this the nail gun view?' };
    const wp = wash.getWorldPosition(new V3()).project(cam);
    const gx = (wp.x * 0.5 + 0.5) * W, gy = (1 - (wp.y * 0.5 + 0.5)) * H;
    return { ok: true, W, H, gx: Math.round(gx), gy: Math.round(gy), at: +e.elapsed.toFixed(2) };
  });
  if (!setup.ok) { fail('studio profile', setup.why); return; }
  note(`frame ${setup.W}x${setup.H}, heat wash projects to ${setup.gx},${setup.gy}, frozen at t=${setup.at}s`);

  // Stations along the row through the wash centre, marching OUTBOARD from the gun toward the
  // frame edge, plus a clean reference at the far edge. Fractions of frame width so the row
  // does not depend on the capture size.
  const dir = setup.gx > setup.W / 2 ? 1 : -1;
  const stations = [0.02, 0.05, 0.09, 0.14, 0.20, 0.27].map((f) => ({
    f, px: Math.round(setup.gx + dir * f * setup.W), py: setup.gy,
  })).filter((s) => s.px > 2 && s.px < setup.W - 2);
  const refPx = { f: 'ref', px: dir > 0 ? setup.W - 8 : 8, py: setup.gy };
  const probes = stations.concat([refPx]);

  const ab = await page.evaluate(async ({ settings, probes }) => {
    const e = window.__rrr.engine;
    const gm = await import('/src/gadgets/gadgetmat.js');
    let wash = null;
    e.scene.traverse((o) => { if (o.isSprite && o.name === 'heatWash') wash = o; });
    const home = wash.parent;
    const out = [];
    let alt = null;
    for (const s of settings) {
      if (alt) { alt.removeFromParent(); alt.material.dispose(); alt = null; }
      if (s.hidden) wash.visible = false;
      else if (s.live) wash.visible = true;
      else {
        wash.visible = false;
        alt = gm.glowSprite(s.hex, s.strength, { blend: s.blend, order: -4, name: 'heatWashAB' });
        alt.scale.copy(wash.scale); alt.position.copy(wash.position);
        home.add(alt);
      }
      for (let i = 0; i < 3; i++) e._step(1 / 60, performance.now());
      const cv = document.createElement('canvas');
      cv.width = e.canvas.width; cv.height = e.canvas.height;
      const c2 = cv.getContext('2d', { willReadFrequently: true });
      c2.drawImage(e.canvas, 0, 0);
      const px = c2.getImageData(0, 0, cv.width, cv.height).data;
      out.push({
        id: s.id, label: s.label,
        vals: probes.map((q) => { const i = (q.py * cv.width + q.px) * 4; return [px[i], px[i + 1], px[i + 2]]; }),
      });
    }
    if (alt) { alt.removeFromParent(); alt.material.dispose(); }
    wash.visible = true;
    return { out };
  }, { settings: SETTINGS, probes });

  note('');
  note('  STUDIO CYC — r-b at stations marching outboard from the gun (last column = clean cyc):');
  note(`    ${'setting'.padEnd(15)} ${probes.map((p) => String(p.f).padStart(9)).join('')}`);
  for (const s of ab.out) {
    const row = s.vals.map((v) => String(v[0] - v[2]).padStart(9)).join('');
    note(`    ${s.id.padEnd(15)}${row}`);
  }
  note('');
  note('  and the raw pixels, nearest station to the gun first:');
  for (const s of ab.out) {
    note(`    ${s.id.padEnd(15)} ${s.vals.slice(0, 4).map((v) => v.join('/')).join('   ')}`);
  }
  note('  bar art at the equivalent stations: r-b +6 / +17 / +27 / +45 / +62');

  await shot('studio-cyc');

  const ship = ab.out.find((s) => s.id === 'opt4-shipped');
  const norm = ab.out.find((s) => s.id === 'opt1-normal');
  const ctl = ab.out[0];
  if (!ship || !norm) { skip('multiply beats normal blend on the cyc', 'set WASH=ab for the four documented settings'); return; }
  const peak = (s) => Math.max(...s.vals.slice(0, -1).map((v) => v[0] - v[2]));
  const pShip = peak(ship), pNorm = peak(norm), pCtl = peak(ctl);
  note(`  peak r-b on the cyc: control ${pCtl} · normal blend ${pNorm} · shipped multiply ${pShip}`);
  (pShip - pCtl) > 3 * Math.max(1, pNorm - pCtl)
    ? pass('the multiply is what carries the cyc', `r-b gain: multiply +${pShip - pCtl} vs normal +${pNorm - pCtl}`)
    : fail('the multiply is what carries the cyc', `r-b gain: multiply +${pShip - pCtl} vs normal +${pNorm - pCtl}`);
}
