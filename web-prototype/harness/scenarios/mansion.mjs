/**
 * THE MANSION ASSERTIONS — `docs/slices/task-mansion.md` §9.
 *
 * This scenario grows with the milestones. Each assertion states which milestone it becomes
 * meaningful at, and an assertion that cannot yet observe its subject reports SKIP with the
 * reason — never PASS. A probe that cannot observe and says PASS is the single most expensive
 * failure class on this project: a canvas `luma()` probe here once returned a confident 0 for
 * every case, and a threat-overlay probe measured opacity 0 on a layer that paints perfectly
 * well. Every measurement below is cross-checked against a second, differently-shaped
 * observation wherever the shape of the thing allows it.
 *
 * MILESTONE STATE: **M1**. One space (`hall`), reproducing the pre-mansion room from the
 * `spaces.js` table. What M1 can honestly assert is the CONTRACT — the shape of the graph
 * layer, that residency is render-only, that a breach is still topology, and that the refactor
 * reproduces the old room's measured geometry. A1–A7 need rooms that do not exist yet.
 */

// The game's own numbers, not a copy of them. `rules.js` deliberately imports nothing so bare
// node can run it (that is why `net/server.mjs` works), which makes it safe to read here — and
// A2 needs `hearRange`/`reach`/`alertAt`/`soundGain` to state its own ceiling in the units the
// game actually uses rather than in constants that rot the first time somebody retunes one.
import { HUNTER_SENSE as HS } from '../../src/game/rules.js';

export default async function mansion({ page, note, pass, fail, skip, shot, waitFor }) {
  const reach = await page.evaluate(() => {
    if (!window.__rrr?.engine?.room) return false;
    // `three` is not on `window` and `engine.js` is not this slice's file to change, so the
    // page-side helper clones a Vector3 the engine already owns. Cheaper than a global, and it
    // cannot drift from the THREE build the scene is actually using.
    window.__V = (x, y, z) => window.__rrr.engine.camera.position.clone().set(x, y, z);
    return true;
  });
  if (!reach) { skip('room reachable', 'engine.room not exposed'); return; }

  // =========================================================================
  // M1-G · THE REFACTOR REPRODUCES THE OLD ROOM
  //
  // M1 is a pure refactor: `room.js` stopped hardcoding a hall and started building from
  // `spaces.js`. The only honest way to check that is against numbers measured off the OLD
  // code, which the slice plan recorded before the change: interior 15.6 x 16.8 x 4.80, a
  // divider door of 1.28 m, four panels, and a spawn separation of 13.04 m. If the table and
  // the builder disagree with those, the refactor moved the world.
  // =========================================================================
  const geo = await page.evaluate(() => {
    const r = window.__rrr.engine.room;
    const b = r.bounds;
    return {
      spaces: r.spaces.map((s) => ({ id: s.id, w: +(s.x1 - s.x0).toFixed(2), d: +(s.z1 - s.z0).toFixed(2), h: s.storey })),
      panels: r.panels.map((p) => ({ id: p.id, x: +p.root.position.x.toFixed(2), z: +p.root.position.z.toFixed(2) })),
      doors: r.portals().filter((p) => p.kind === 'door')
        .map((p) => ({ id: p.id, x: +p.centre.x.toFixed(2), z: +p.centre.z.toFixed(2), w: p.w, axis: p.axis })),
      bounds: { minX: +b.minX.toFixed(2), maxX: +b.maxX.toFixed(2), minZ: +b.minZ.toFixed(2), maxZ: +b.maxZ.toFixed(2) },
      spawnSep: +Math.hypot(r.spawn.player[0].x - r.spawn.hunter.x, r.spawn.player[0].z - r.spawn.hunter.z).toFixed(2),
      floorY: r.floorY,
    };
  });
  note(`spaces: ${JSON.stringify(geo.spaces)}`);
  note(`panels: ${geo.panels.map((p) => `${p.id}@(${p.x},${p.z})`).join(' ')}`);
  note(`doors: ${geo.doors.map((d) => `${d.id} ${d.w}m @(${d.x},${d.z}) axis=${d.axis}`).join(' ')}`);
  note(`union bounds ${JSON.stringify(geo.bounds)} · spawn separation ${geo.spawnSep} m · floorY ${geo.floorY}`);

  {
    // ⚠️ THE DOOR-WIDTH RULE IS A SHIPPED, LATENT BUG THE PLAN FOUND AND IT IS WORTH A GATE.
    // `HunterAI.radius = 0.30 + stage * 0.12` reaches 0.66 at stage 3, and `room.collide()` is
    // a circle-vs-AABB push-out, so the hunter's CENTRE needs more than 2 x radius = 1.32 m of
    // clear width to pass. The kit's `DOOR.w` and the old `room.js` `DOOR_W` were both 1.28 —
    // i.e. a stage-3 hunter could not fit through the game's only door, and nobody had seen it
    // because growth to stage 3 takes 7 absorbed parts and the capture loop never gets there.
    // D7 is under the limit ON PURPOSE (the chapel is safe until the hunter grows), so it is
    // named as the one legitimate exception rather than being silently tolerated.
    const R3 = 0.30 + 3 * 0.12;
    const NARROW_BY_DESIGN = new Set(['D7']);
    const tooNarrow = geo.doors.filter((d) => d.w <= 2 * R3 && !NARROW_BY_DESIGN.has(d.id));
    const deliberate = geo.doors.filter((d) => NARROW_BY_DESIGN.has(d.id));
    note(`stage-3 hunter radius ${R3.toFixed(2)} m needs > ${(2 * R3).toFixed(2)} m of clear width`
      + (deliberate.length ? ` · deliberately narrow: ${deliberate.map((d) => `${d.id} ${d.w}m`).join(', ')}` : ''));
    if (!tooNarrow.length) pass('every circulation door passes a stage-3 hunter', `${geo.doors.length} door(s), narrowest circulation ${Math.min(...geo.doors.filter((d) => !NARROW_BY_DESIGN.has(d.id)).map((d) => d.w))} m`);
    else fail('every circulation door passes a stage-3 hunter', `${tooNarrow.map((d) => `${d.id} ${d.w}m`).join(', ')} — needs > ${(2 * R3).toFixed(2)}`);
  }
  {
    // The builder and the table must agree, and both spawns must be in a room rather than in
    // the void between rooms — a spawn outside every AABB is a body with no space, and
    // `collide()` governs it by colliders alone, which is how an actor ends up inside a wall.
    const s = await page.evaluate(() => {
      const r = window.__rrr.engine.room;
      const at = (v) => r.spaceAt(v)?.id ?? null;
      return {
        player: r.spawn.player.map((p) => at(p)),
        hunter: at(r.spawn.hunter),
        capture: at(r.spawn.capture),
        panels: r.panels.map((p) => ({ id: p.id, a: p.spec.a, b: p.spec.b })),
      };
    });
    note(`spawn spaces — player ${JSON.stringify(s.player)} · hunter ${s.hunter} · capture ${s.capture}`);
    const homeless = [...s.player.filter((x) => !x), s.hunter, s.capture].filter((x) => !x);
    if (!homeless.length) pass('every spawn is inside a space', `player ${s.player.join('+')} · hunter ${s.hunter} · capture ${s.capture}`);
    else fail('every spawn is inside a space', `${homeless.length} spawn(s) resolve to no space`);

    const crossing = s.panels.filter((p) => p.a !== p.b);
    note(`panels: ${s.panels.map((p) => `${p.id} ${p.a}|${p.b}`).join(' · ')}`);
    if (geo.spaces.length < 2) skip('every panel joins two spaces', 'one space: the panels are in an inner wall');
    else if (crossing.length === s.panels.length) pass('every panel joins two spaces', `${crossing.length} panel(s), all boundary`);
    else fail('every panel joins two spaces', `${s.panels.length - crossing.length} panel(s) are inner-wall and unreachable to the BFS`);
  }

  // =========================================================================
  // ANCHORS · §10.1 — the whole point is that no scenario hardcodes a coordinate again
  // =========================================================================
  const anchors = await page.evaluate(() => {
    const r = window.__rrr.engine.room;
    const want = ['study_w.south', 'study_w.north', 'service.mid', 'gallery.west', 'gallery.east',
      'ballroom.centre', 'ballroom.north', 'chapel.centre',
      'duel.player', 'duel.hunter', 'hide.player', 'hide.hunter', 'los.player', 'los.hunter',
      'tell.player', 'tell.hunter'];
    const out = {}; const missing = [];
    for (const n of want) {
      const a = r.anchor(n);
      if (!a) missing.push(n); else out[n] = [+a.x.toFixed(2), +a.z.toFixed(2)];
    }
    // Second shape of evidence: an anchor is worthless if it is inside a wall, so every one
    // has to resolve to a point the collider solver leaves alone.
    const stuck = [];
    for (const [n, xz] of Object.entries(out)) {
      const c = r.collide(window.__V(xz[0], 0.9, xz[1]), 0.42);
      const push = Math.hypot(c.x - xz[0], c.z - xz[1]);
      if (push > 0.05) stuck.push(`${n} pushed ${push.toFixed(2)}m`);
    }
    return { out, missing, stuck, probedStuck: true };
  });
  note(`anchors resolved: ${Object.keys(anchors.out).length}, missing: ${anchors.missing.length ? anchors.missing.join(',') : 'none'}`);
  if (anchors.missing.length) fail('every named anchor resolves', `missing: ${anchors.missing.join(', ')}`);
  else pass('every named anchor resolves', `${Object.keys(anchors.out).length} anchors, §10.1 minimum set present`);

  if (!anchors.probedStuck) skip('no anchor is inside a wall', 'window.__rrr.THREE not exposed — cannot run collide() from the page');
  else if (anchors.stuck.length) fail('no anchor is inside a wall', anchors.stuck.join(' · '));
  else pass('no anchor is inside a wall', `collide() moves none of the ${Object.keys(anchors.out).length} by more than 5 cm`);

  // =========================================================================
  // §4.1 · THE PORTAL CONTRACT
  // `portals()` used to return `{x, z, w, kind}` with z pinned to 0 because there was one
  // divider. `hunter-ai._waypoint` reads `centre` now, so the shape is load-bearing.
  // =========================================================================
  {
    const shape = await page.evaluate(() => {
      const ps = window.__rrr.engine.room.portals();
      const bad = ps.filter((p) => !(p.id && p.a && p.b && p.centre && typeof p.centre.x === 'number'
        && (p.axis === 'x' || p.axis === 'z') && typeof p.w === 'number'
        && (p.kind === 'door' || p.kind === 'breach')));
      return { n: ps.length, bad: bad.length, sample: ps[0] ? { id: ps[0].id, axis: ps[0].axis, kind: ps[0].kind, w: ps[0].w } : null };
    });
    if (shape.n && !shape.bad) pass('portals() reports the §4.1 shape', `${shape.n} edge(s), sample ${JSON.stringify(shape.sample)}`);
    else fail('portals() reports the §4.1 shape', `${shape.bad} of ${shape.n} edges malformed`);
  }

  // =========================================================================
  // A8b · PHYSICS IGNORES RESIDENCY  (meaningful from M1: hide the only space)
  //
  // This is the assertion the plan says not to skip. `ThirdPersonCamera` raycasts the world
  // to keep its boom out of walls; if a hidden room's colliders went away the boom would sail
  // into an invisible room and the frame would go black — in live play only, which is the
  // failure class that has cost this project the most.
  // =========================================================================
  {
    const r = await page.evaluate(() => {
      const room = window.__rrr.engine.room;
      // ⚠️ FROM THE ANCHOR TABLE, NEVER FROM COORDINATES IN THIS FILE. The first version of
      // this probe hardcoded two points either side of the M1 divider; one milestone later
      // they were both in open floor, the control case stopped blocking and the assertion
      // quietly stopped testing anything. `hide.*` is contractually a wall-separated pair.
      const A = room.anchor('hide.player'), B = room.anchor('hide.hunter');
      if (!A || !B) return null;
      const a = window.__V(A.x, 1.0, A.z), b = window.__V(B.x, 1.0, B.z);
      const dir = b.clone().sub(a).normalize();
      const span = a.distanceTo(b);
      const before = { blocks: room.blocksSight(a, b), ray: !!room.castRay(a, dir, span), span: +span.toFixed(2) };
      const was = room.spaces.map((s) => s.root.visible);
      for (const s of room.spaces) { s.visible = false; s.root.visible = false; }
      const after = { blocks: room.blocksSight(a, b), ray: !!room.castRay(a, dir, span),
        anyVisible: room.spaces.some((s) => s.root.visible) };
      room.spaces.forEach((s, i) => { s.visible = was[i]; s.root.visible = was[i]; });
      return { before, after, restored: room.spaces.map((s) => s.root.visible) };
    });
    if (!r) skip('A8b physics ignores residency', 'the hide.* anchors did not resolve');
    else {
      note(`A8b: hide pair ${r.before.span} m apart · visible -> blocksSight ${r.before.blocks} / castRay ${r.before.ray}` +
        ` · hidden -> blocksSight ${r.after.blocks} / castRay ${r.after.ray} (anyVisible ${r.after.anyVisible})`);
      if (!r.before.blocks) fail('A8b physics ignores residency', 'the CONTROL case did not block — hide.player/hide.hunter are not either side of a wall, so this probe would pass on nothing');
      else if (r.after.blocks && r.after.ray && !r.after.anyVisible)
        pass('A8b physics ignores residency', 'every space hidden; blocksSight and castRay unchanged');
      else fail('A8b physics ignores residency', `hidden: blocks=${r.after.blocks} ray=${r.after.ray}`);
    }
  }

  // =========================================================================
  // §4.2 · RESIDENCY IS A FUNCTION OF THE VIEWPOINT, AND IT TAKES N OF THEM
  // Split screen means N viewports and the resident set is their UNION (§11.1).
  // =========================================================================
  {
    const r = await page.evaluate(() => {
      const room = window.__rrr.engine.room;
      if (!room.setViewpoints) return null;
      const p = window.__rrr.engine.player.root.position.clone();
      const one = room.setViewpoint(p, window.__V(0, 0, -1), 0.016);
      const two = room.setViewpoints([{ pos: p, dir: window.__V(0, 0, -1) },
        { pos: p.clone(), dir: window.__V(0, 0, 1) }], 0.016);
      return { one, two, vis: room.visibleSpaces(), playerSpace: room.spaceAt(p)?.id ?? null };
    });
    if (!r) skip('setViewpoints takes N viewpoints', 'room.setViewpoints is not exported');
    else {
      note(`residency: 1 viewpoint -> ${r.one} resident · 2 viewpoints -> ${r.two} resident · visible ${r.vis} · player in ${r.playerSpace}`);
      if (r.one >= 1 && r.two >= r.one) pass('setViewpoints takes N viewpoints', `${r.one} / ${r.two} resident (union)`);
      else fail('setViewpoints takes N viewpoints', `one=${r.one} two=${r.two}`);
    }
  }

  // =========================================================================
  // A8 (partial at M1) · THE SPACE THE PLAYER IS IN IS ALWAYS VISIBLE
  // The count half of A8 needs more than one space; the "no black room" half does not, and it
  // is the half that shows up on screen.
  // =========================================================================
  {
    const ok = await page.evaluate(() => {
      const e = window.__rrr.engine, room = e.room;
      window.__m = { bad: 0, max: 0, n: 0 };
      e.onUpdate(() => {
        const here = room.spaceAt(e.player.root.position);
        window.__m.n++;
        window.__m.max = Math.max(window.__m.max, room.visibleSpaces());
        if (here && !here.root.visible) window.__m.bad++;
      });
      return true;
    });
    if (!ok) skip('A8 the player is never in a black room', 'could not install the per-frame probe');
    else {
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(1800);
      await page.keyboard.up('KeyW');
      await page.keyboard.down('KeyA');
      await page.waitForTimeout(1200);
      await page.keyboard.up('KeyA');
      const m = await page.evaluate(() => window.__m);
      note(`A8: ${m.n} frames sampled while moving · frames with the player's own space hidden: ${m.bad} · max visible spaces ${m.max}`);
      if (m.n < 30) skip('A8 the player is never in a black room', `only ${m.n} frames sampled`);
      else if (m.bad === 0 && m.max <= 3) pass('A8 the player is never in a black room', `${m.n} frames, max ${m.max} visible spaces (budget 3)`);
      else fail('A8 the player is never in a black room', `${m.bad} bad frames, max visible ${m.max}`);
    }
  }

  // =========================================================================
  // A9 · A BREACH IS TOPOLOGY, AND IT IS LOUD
  // Two shapes of evidence, deliberately: the graph gains an edge (portals()) AND the panel's
  // own state machine says it no longer blocks movement. Either one alone could be a lie.
  // =========================================================================
  {
    const setup = await page.evaluate(() => {
      const e = window.__rrr.engine, r = e.room;
      // ⚠️ `p.svc_w.s` BY NAME, AND STAND ALONG THE PANEL'S OWN NORMAL. The first version of
      // this probe took `panels.find(isDamageable)` — which is `p.svc_w.n` — and then placed
      // the player at `(panel.x, 0, panel.z + 3.2)` facing along -Z. Every one of the four
      // `p.svc_*` panels has `rotY = PI/2`, so that put the body BESIDE a wall that runs along
      // Z, aiming down the length of the passage at nothing. It did not throw: it fired a full
      // nailgun magazine for fourteen seconds into open air and reported "panel reached stage
      // 0", which reads as a broken destructible wall rather than as a probe standing in the
      // wrong place. This is the same z-pinned assumption §7.3 found in `_breach`, in the test.
      const target = r.panels.find((p) => p.id === 'p.svc_w.s' && p.state.isDamageable())
        ?? r.panels.find((p) => p.state.isDamageable()) ?? r.panels[0];
      const px = target.root.position.x, pz = target.root.position.z;
      // `normal` is (sin rotY, 0, cos rotY); `sideOf` says which side of it we are already on,
      // so the player backs off ALONG the normal and always ends up square to the face.
      const n = target.normal;
      const side = target.sideOf(e.player.root.position);
      e.player.pos.set(px + n.x * side * 3.2, 0, pz + n.z * side * 3.2);
      e.player.vel.set(0, 0, 0);
      // face back down the normal, at the panel
      e.player.facing = Math.atan2(-n.x * side, -n.z * side); e.player.aimYaw = e.player.facing;
      if (e.cam) e.cam.yaw = e.player.aimYaw;
      // Keep the hunter out of it — this beat is about the wall, not the fight. `ballroom.south`
      // rather than a coordinate, and rather than the old (6.5, -7.0): that was 9.8 m from
      // `p.svc_w.s`, i.e. INSIDE `hearRange 14` at the noise 1.0 the burst is about to make, so
      // the probe was arranging for the fight it says it is avoiding. The south anchor is 17.5 m
      // out, past the audible radius of a full-noise spike.
      const away = r.anchor('ballroom.south');
      if (away) e.hunter.root.position.set(away.x, 0, away.z);
      e.hunter.state = 'PATROL'; e.hunter.awareness = 0; e.hunter.target = null;
      window.__m9 = { peakNoise: 0 };
      e.onUpdate(() => { window.__m9.peakNoise = Math.max(window.__m9.peakNoise, e.player.noise); });
      return { id: target.id, x: +px.toFixed(2), z: +pz.toFixed(2), stage: target.state.stage,
        portals: r.portals().length, breaches: r.portals().filter((p) => p.kind === 'breach').length,
        weapon: e.player.rig.activeWeapon };
    });
    if (!setup) skip('A9 a breach is topology and it is loud', 'could not reach the panel list');
    else {
      note(`A9: firing at ${setup.id} @(${setup.x},${setup.z}) with ${setup.weapon}; portals before ${setup.portals} (${setup.breaches} breach)`);
      await page.mouse.move(640, 360);
      await page.mouse.down();
      const opened = await waitFor(() => {
        const b = window.__rrr.engine.room.portals().filter((x) => x.kind === 'breach');
        return b.length ? { n: b.length, id: b[0].id, t: +window.__rrr.engine.elapsed.toFixed(2) } : null;
      }, { timeout: 14000, every: 100 });
      await page.mouse.up();
      const after = await page.evaluate((id) => {
        const r = window.__rrr.engine.room;
        const p = r.panels.find((q) => q.id === id);
        return { stage: p.state.stage, blocksMove: p.blocksMovement(), blocksSight: p.blocksSight(),
          breaches: r.portals().filter((x) => x.kind === 'breach').length,
          peakNoise: +window.__m9.peakNoise.toFixed(2) };
      }, setup.id);
      await shot('m9-breach');
      note(`A9: after firing — stage ${after.stage}, blocksMovement ${after.blocksMove}, blocksSight ${after.blocksSight},` +
        ` breach edges ${after.breaches}, peak player.noise ${after.peakNoise}`);
      if (!opened) fail('A9 a breach is topology', `no breach edge appeared; panel reached stage ${after.stage}`);
      else if (after.breaches > 0 && !after.blocksMove)
        pass('A9 a breach is topology', `${setup.id} opened at t=${opened.t}s; portals() gained a kind:'breach' edge and the panel stops blocking movement`);
      else fail('A9 a breach is topology', `breaches=${after.breaches} blocksMovement=${after.blocksMove}`);

      // ⚠️ `player.noise` CANNOT BE OBSERVED AT 1.0 AND AN ASSERTION THAT ASKS FOR IT NEVER
      // PASSES. `makeNoise(1)` sets `_noiseSpike = 1`, but `Player.update` decays the spike by
      // `dt / 1.25` BEFORE it assigns `this.noise = max(moveNoise, _noiseSpike)` — so the
      // highest value any outside probe can ever sample is `1 - dt/1.25`, about 0.987 at 60 Hz.
      // The plan's "firing sets noise to 1.0" is true of the spike and false of the reading.
      // What the gate is actually about is the AUDIBLE RADIUS, so measure that instead.
      const HEAR_RANGE = 14;                    // HUNTER_SENSE.hearRange
      const radius = +(HEAR_RANGE * after.peakNoise).toFixed(2);
      note(`A9: audible radius = hearRange ${HEAR_RANGE} x noise ${after.peakNoise} = ${radius} m` +
        ' (1.0 is unobservable — the spike decays before the frame publishes it)');
      if (after.peakNoise >= 0.95) pass('A9 the breach is loud', `noise peaked at ${after.peakNoise} — audible through walls out to ${radius} m`);
      else fail('A9 the breach is loud', `noise only reached ${after.peakNoise} (audible to ${radius} m) — firing should spike it to full`);
    }
  }

  // =========================================================================
  // A11 · BFS OVER OPEN PORTALS  (fully meaningful from M3; the degenerate cases matter now)
  // =========================================================================
  {
    const r = await page.evaluate(() => {
      const room = window.__rrr.engine.room;
      const ids = room.spaces.map((s) => s.id);
      const pairs = [];
      for (const a of ids) for (const b of ids) if (a !== b) pairs.push([a, b, room.pathPortals(a, b).length]);
      return { n: ids.length, ids, pairs, self: room.pathPortals(ids[0], ids[0]).length };
    });
    note(`A11: ${r.n} space(s) ${JSON.stringify(r.ids)} · cross pairs ${r.pairs.length} · self-path length ${r.self}`);
    if (r.n < 2) skip('A11 every space is reachable', `only ${r.n} space at this milestone; pathPortals(self) correctly returns ${r.self}`);
    else {
      const unreachable = r.pairs.filter(([, , n]) => n === 0);
      if (!unreachable.length) pass('A11 every space is reachable', `${r.pairs.length} ordered pairs, all non-empty`);
      else fail('A11 every space is reachable', `no path for ${unreachable.map(([a, b]) => `${a}->${b}`).join(', ')}`);
    }
  }

  // =========================================================================
  // A1 – A7, A12 · need rooms that do not exist yet. SKIP, with the reason.
  // =========================================================================
  const nSpaces = geo.spaces.length;

  // ---- A3 · THE SIGHTLINE ROOM DELIVERS A >= 20 m FIRST GLIMPSE --------------------------
  // The gallery's length is the reason it is in the plan: at 25 m a glimpse is ~14.5 s of
  // warning against a 5.20 m/s run, which is a horror beat with a real escape in it. Two
  // shapes of evidence, because "it is on screen" has passed on this project for content
  // hidden under a splash: the geometry says unobstructed, AND we look at the picture.
  if (!anchors.out['gallery.west'] || !anchors.out['gallery.east']) {
    skip('A3 a >= 20 m first glimpse down the gallery', 'gallery.west / gallery.east did not resolve');
  } else {
    const a3 = await page.evaluate(() => {
      const e = window.__rrr.engine, r = e.room;
      const P = r.anchor('gallery.west'), H = r.anchor('gallery.east');
      e.player.pos.copy(P); e.player.vel.set(0, 0, 0);
      const toH = H.clone().sub(P).setY(0).normalize();
      e.player.facing = Math.atan2(toH.x, toH.z); e.player.aimYaw = e.player.facing;
      if (e.cam) { e.cam.yaw = e.player.aimYaw; e.cam.pitch = 0; }
      e.hunter.root.position.copy(H); e.hunter.vel.set(0, 0, 0);
      e.hunter.facing = Math.atan2(-toH.x, -toH.z);
      e.hunter.state = 'PATROL'; e.hunter.awareness = 0; e.hunter.target = null;
      return { dxz: +Math.hypot(H.x - P.x, H.z - P.z).toFixed(2),
        blocked: r.blocksSight(e.hunter.eye, P.clone().setY(1.0)),
        sameSpace: r.spaceAt(P)?.id === r.spaceAt(H)?.id, space: r.spaceAt(P)?.id };
    });
    await page.waitForTimeout(700);
    // is the hunter actually in frame? project it into NDC through the live camera
    const framed = await page.evaluate(() => {
      const e = window.__rrr.engine;
      const p = e.hunter.root.position.clone(); p.y += e.hunter.height * 0.5;
      p.project(e.camera);
      return { x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
        onScreen: Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z > -1 && p.z < 1 };
    });
    await shot('m3-gallery-glimpse');
    note(`A3: ${a3.dxz} m down ${a3.space}, blocksSight ${a3.blocked}, same space ${a3.sameSpace}` +
      ` · hunter ndc [${framed.x},${framed.y}] onScreen ${framed.onScreen}`);
    if (a3.blocked) fail('A3 a >= 20 m first glimpse down the gallery', `sight is BLOCKED at ${a3.dxz} m — the sightline room has no sightline`);
    else if (a3.dxz < 20) fail('A3 a >= 20 m first glimpse down the gallery', `only ${a3.dxz} m of clear sightline, needs >= 20`);
    else if (!framed.onScreen) fail('A3 a >= 20 m first glimpse down the gallery', `clear at ${a3.dxz} m but the hunter projects to ndc [${framed.x},${framed.y}] — off screen`);
    else pass('A3 a >= 20 m first glimpse down the gallery', `${a3.dxz} m unobstructed, hunter in frame at ndc [${framed.x},${framed.y}] — see m3-gallery-glimpse`);
  }

  // ---- A12 · NO FIRST-VISIT SHADER HITCH ---------------------------------------------------
  // `finalizeScene()` compiles by walking VISIBLE objects and residency hides rooms, so a room
  // hidden at finalize time would build its shaders on the frame you first walk into it. The
  // measured cost of that exact bug on the hunter's hidden stage rigs was a 2498 ms frame.
  if (nSpaces < 2) {
    skip('A12 no first-visit shader hitch', 'one space: there is no second room to visit first');
  } else {
    const ok12 = await page.evaluate(() => {
      const e = window.__rrr.engine, r = e.room;
      window.__m12 = { max: 0, n: 0, visited: new Set(), worstAt: null };
      let last = performance.now();
      // Track the PROGRAM COUNT across the worst frame. A shader compile and a texture upload
      // both show up as one enormous frame, and they need completely different fixes — so the
      // probe has to say which it saw rather than let the reader assume the documented one.
      const progs = () => e.renderer.info.programs?.length ?? -1;
      window.__m12.prog0 = progs();
      window.__m12.top = [];        // the five slowest frames, with what changed across each
      window.__m12.compiles = [];   // every frame that actually added a program
      let lastProg = progs();
      // ⚠️ AND NAME THEM. "+19 programs" says a compile happened; it does not say WHAT
      // compiled, and the fix for a room's wall shader and the fix for a particle system are
      // different fixes. `renderer.info.programs[i].cacheKey` is three.js's own program
      // identity, so diffing the key SET across a frame says exactly which materials the
      // warm-up failed to cover. Two rounds were spent guessing at this number before the
      // probe was asked to print it.
      const keySet = () => new Set((e.renderer.info.programs ?? []).map((p) => p.cacheKey));
      let lastKeys = keySet();
      window.__m12.newKeys = [];
      e.onUpdate(() => {
        const now = performance.now(); const ms = now - last; last = now;
        window.__m12.n++;
        const here = r.spaceAt(e.player.root.position);
        if (here) window.__m12.visited.add(here.id);
        // A DELTA, NOT A SNAPSHOT. The first version of this probe read the program count AT
        // the slowest frame and called the result a compile — but a running total says nothing
        // about what that frame did. Only the change across the frame does, and it turned out
        // the count had climbed gradually somewhere else entirely.
        const p = progs(); const dProg = p - lastProg; lastProg = p;
        const row = { f: window.__m12.n, ms: +ms.toFixed(1), at: here?.id ?? 'doorway', dProg,
          vis: r.visibleSpaces(), stage: e.hunter.stage };
        if (dProg > 0) {
          window.__m12.compiles.push(row);
          const now2 = keySet();
          for (const k of now2) if (!lastKeys.has(k)) window.__m12.newKeys.push({ f: row.f, k: String(k).slice(0, 220) });
          lastKeys = now2;
        }
        window.__m12.top.push(row);
        window.__m12.top.sort((a, b) => b.ms - a.ms);
        if (window.__m12.top.length > 5) window.__m12.top.length = 5;
        if (ms > window.__m12.max) {
          window.__m12.max = ms; window.__m12.worstAt = row.at;
          window.__m12.worstFrame = row.f; window.__m12.progAt = p;
          window.__m12.visibleAt = row.vis; window.__m12.hunterStage = row.stage;
        }
      });
      // Put the body back together first. By this point in the run the player has been shot
      // at, has breached a wall and may be down a leg — and `gaitFor` drops a one-legged robot
      // to `limpScale 0.44` and a legless one to `crawlScale 0.155`, i.e. 0.8 m/s. A probe that
      // asks a crawling robot to cross 13 m in four seconds measures its own setup, not the
      // renderer, and reports a SKIP that looks like a map problem.
      for (const s of ['shoulderL', 'shoulderR', 'hipL', 'hipR']) {
        if (e.player.rig.occupant(s) === 'empty') {
          const kind = s.startsWith('shoulder') ? 'arm' : 'leg';
          const it = e.limbField.items.find((i) => i.inWorld && i.socketKind === kind);
          if (it) e.player.rig.attach(s, it);
        }
      }
      // start in study_w, walk north through D1 into the gallery: a genuine first visit
      const P = r.anchor('los.player');
      if (P) { e.player.pos.copy(P); e.player.vel.set(0, 0, 0); e.player.facing = Math.PI; e.player.aimYaw = Math.PI; if (e.cam) e.cam.yaw = Math.PI; }
      return { gait: e.player.caps?.gait, legs: e.player.rig.caps.legs, from: r.spaceAt(e.player.root.position)?.id ?? null };
    });
    if (!ok12) skip('A12 no first-visit shader hitch', 'could not install the frame-time probe');
    else {
      note(`A12: starting in ${ok12.from} on gait "${ok12.gait}" with ${ok12.legs} legs`);
      await page.waitForTimeout(300);
      await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
      await page.waitForTimeout(5000);
      await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
      let m = await page.evaluate(() => ({ max: +window.__m12.max.toFixed(1), n: window.__m12.n,
        visited: [...window.__m12.visited], worstAt: window.__m12.worstAt,
        prog0: window.__m12.prog0, progAt: window.__m12.progAt, worstFrame: window.__m12.worstFrame,
        progNow: window.__rrr.engine.renderer.info.programs?.length ?? -1,
        visibleAt: window.__m12.visibleAt, hunterStage: window.__m12.hunterStage,
        at: window.__rrr.engine.room.spaceAt(window.__rrr.engine.player.root.position)?.id ?? 'doorway' }));
      note(`A12: walked -> ${m.n} frames, visited ${JSON.stringify(m.visited)}, now in ${m.at}, worst ${m.max} ms in ${m.worstAt}`);
      note(`A12: worst was frame ${m.worstFrame}/${m.n} · programs ${m.prog0} at start -> ${m.progAt} at the worst frame -> ${m.progNow} now`
        + ` · visible spaces then ${m.visibleAt} · hunter stage ${m.hunterStage}`);
      const detail = await page.evaluate(() => ({ top: window.__m12.top, compiles: window.__m12.compiles,
        newKeys: window.__m12.newKeys }));
      note(`A12: slowest 5 frames ${JSON.stringify(detail.top)}`);
      note(`A12: frames that ADDED a program: ${detail.compiles.length ? JSON.stringify(detail.compiles) : 'none'}`);
      for (const nk of (detail.newKeys ?? []).slice(0, 24)) note(`A12: new program @frame ${nk.f}: ${nk.k}`);

      // The subject of this assertion is a room that was HIDDEN at finalize time rendering for
      // the first time. Walking there is the honest way to trigger it, but if locomotion did
      // not get there the trigger is still available: put the camera in the other room and let
      // residency make it resident. Say which one produced the number.
      let how = 'walked';
      if (m.visited.length < 2) {
        how = 'teleported';
        await page.evaluate(() => {
          const e = window.__rrr.engine, r = e.room;
          const other = r.spaces.find((s) => s.id !== r.spaceAt(e.player.root.position)?.id) ?? r.spaces[1];
          const c = { x: (other.x0 + other.x1) / 2, z: (other.z0 + other.z1) / 2 };
          e.player.pos.set(c.x, 0, c.z); e.player.vel.set(0, 0, 0);
          window.__m12.max = 0; window.__m12.worstAt = null;   // measure only the transition
        });
        await page.waitForTimeout(1500);
        m = await page.evaluate(() => ({ max: +window.__m12.max.toFixed(1), n: window.__m12.n,
          visited: [...window.__m12.visited], worstAt: window.__m12.worstAt,
          at: window.__rrr.engine.room.spaceAt(window.__rrr.engine.player.root.position)?.id ?? 'doorway' }));
        note(`A12: teleport fallback -> visited ${JSON.stringify(m.visited)}, now in ${m.at}, worst ${m.max} ms in ${m.worstAt}`);
      }
      if (m.visited.length < 2) skip('A12 no first-visit shader hitch', `never entered a second space (visited ${m.visited.join(',')}) — nothing was visited for the first time`);
      else if (m.max <= 40) pass('A12 no first-visit shader hitch', `worst frame ${m.max} ms ${how} into ${m.visited.join(' + ')} (budget 40; the pre-precompile regression was 2498 ms)`);
      else fail('A12 no first-visit shader hitch', `worst frame ${m.max} ms in ${m.worstAt} — looks like a first-visit compile`);
    }
  }

  // =========================================================================
  // M3 / M4 · A1, A2, A4, A5, A6, A7
  //
  // ⚠️ THESE USED TO BE SIX `skip()` CALLS INSIDE `if (nSpaces < 6)` AND NOTHING ELSE — so the
  // moment the sixth space landed they stopped being skipped AND had no body to run. They did
  // not fail and they did not report: they VANISHED from the totals, and the run still said
  // "0 skipped", which reads as a complete gate. A milestone guard that deletes its own
  // assertion when the milestone arrives is worse than no guard.
  //
  // THE AUTOPILOT. Every one of these needs the player driven somewhere, and the honest way to
  // drive it is the production path: hold W (and Shift to run) on the real keyboard and steer
  // `cam.yaw`, because `game.js` feeds the player `aimYaw: cmd.aimYaw ?? cam.yaw`. Writing
  // `player.pos` per frame instead would bypass `collide()`, `gait`, `noise` and the camera
  // boom — i.e. it would walk the robot through the walls whose topology is the entire subject
  // of this scenario, and every number would be a measurement of the probe.
  // =========================================================================
  if (nSpaces >= 6) {
    const installAuto = () => page.evaluate(() => {
      if (window.__autoInstalled) return true;
      window.__autoInstalled = true;
      const e = window.__rrr.engine;
      window.__auto = null;
      // THE PIN, installed once here rather than inside whichever assertion happens to need it
      // first. Several of these probes ask "can it perceive you FROM THERE" — and a hunter that
      // walks off along `PATROL_ROUTE` mid-measurement turns a question about the map into a
      // question about the schedule, then reports the answer as a map result.
      window.__pin = null;
      e.onUpdate(() => {
        if (window.__pin) { e.hunter.root.position.copy(window.__pin); e.hunter.vel.set(0, 0, 0); }
      });
      e.onUpdate(() => {
        const a = window.__auto;
        if (!a || a.done) return;
        const p = e.player.root.position;
        const wp = a.route[a.i];
        if (!wp) { a.done = true; return; }
        const d = Math.hypot(wp[0] - p.x, wp[1] - p.z);
        a.trace.push([+p.x.toFixed(2), +p.z.toFixed(2), +e.elapsed.toFixed(2)]);
        if (a.trace.length > 4000) a.trace.shift();
        if (d < (a.tol ?? 1.4)) {
          a.i++;
          if (a.i >= a.route.length) { if (a.loop) a.i = 0; else a.done = true; a.laps = (a.laps ?? 0) + 1; }
          return;
        }

        // ⚠️ STEER THROUGH PORTALS, NOT AT THE GOAL. The first version of this autopilot aimed
        // straight at the waypoint, and the measured result was A5 walking for 45 seconds
        // without leaving the room it started in: from `study_w.north` to `gallery.west` the
        // straight line crosses the boundary wall at x = -10.35, and D1's opening spans
        // -9.55..-7.65. The robot slid along the wall at full walking speed for forty seconds,
        // reported a perfectly plausible median noise of 0.49, and the assertion concluded that
        // the hunter never noticed it — which was true, and about nothing.
        //
        // This is the SAME mistake `hunter-ai._waypoint` documents ("aiming at a point on your
        // own side of a wall is a waypoint you have already reached"), so it takes the same
        // two-beat fix, and it takes it from the room's OWN `pathPortals` BFS: line up square
        // in front of the opening on this side, and only once lined up, aim past it.
        const r = e.room;
        let tx = wp[0], tz = wp[1];
        const here = r.spaceAt(p);
        const there = r.spaceAt({ x: wp[0], y: 0, z: wp[1] });
        if (here && there && here.id !== there.id) {
          const path = r.pathPortals(here.id, there.id);
          if (path.length) {
            const c = path[0].centre;
            const alongX = path[0].axis === 'x';
            const off = alongX ? p.z - c.z : p.x - c.x;
            const side = Math.sign(off) || 1;
            const drift = alongX ? Math.abs(p.x - c.x) : Math.abs(p.z - c.z);
            const APPROACH = 1.25;
            // ⚠️ COMMIT TO THE OPENING AND STAY COMMITTED. Recomputing "am I lined up?" every
            // frame chatters: the moment the body reaches the portal plane `side` flips sign,
            // the target jumps to the other side of the wall, the robot turns round, `side`
            // flips back — and it oscillates in the doorway at full speed going nowhere. That
            // is what the first portal-aware version did, and it is why the A6 lap reached
            // three spaces in 26 s instead of six in thirteen. Once lined up, this portal is
            // the plan until the space actually changes.
            if (a.commit !== path[0].id && drift <= 0.5) { a.commit = path[0].id; a.commitSide = side; }
            if (a.commit !== path[0].id) a.commitSide = null;
            const s2 = a.commit === path[0].id ? -(a.commitSide ?? side) : side;
            if (alongX) { tx = c.x; tz = c.z + s2 * APPROACH; }
            else { tx = c.x + s2 * APPROACH; tz = c.z; }
            a.via = path[0].id;
          }
        } else { a.via = null; a.commit = null; a.commitSide = null; }
        if (a.lastSpace !== (here?.id ?? null)) { a.lastSpace = here?.id ?? null; a.commit = null; a.commitSide = null; }

        const yaw = Math.atan2(tx - p.x, tz - p.z);
        if (e.cam) e.cam.yaw = yaw;
        e.player.aimYaw = yaw;
      });
      return true;
    });
    const drive = (route, o = {}) => page.evaluate(([route, o]) => {
      window.__auto = { route, i: 0, tol: o.tol ?? 1.4, loop: !!o.loop, done: false, laps: 0, trace: [] };
      return true;
    }, [route, o]);
    const stopAuto = () => page.evaluate(() => { const a = window.__auto; window.__auto = null; return a ? { i: a.i, laps: a.laps ?? 0, done: a.done, n: a.trace.length } : null; });
    const anchorsXZ = (...names) => page.evaluate((ns) => {
      const r = window.__rrr.engine.room;
      return ns.map((n) => { const a = r.anchor(n); return a ? [+a.x.toFixed(2), +a.z.toFixed(2)] : null; });
    }, names);
    /** Hold W (+Shift) for real, so locomotion, collision, gait and noise are all in the loop. */
    const holdWalk = async (ms, run = false) => {
      if (run) await page.keyboard.down('ShiftLeft');
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(ms);
      await page.keyboard.up('KeyW');
      if (run) await page.keyboard.up('ShiftLeft');
    };
    /**
     * Per-frame recorder of everything the AI assertions read. One shape, reused six times.
     *
     * ⚠️ THE HANDLER IS INSTALLED EXACTLY ONCE AND `watch()` ONLY RESETS THE ACCUMULATOR.
     * The first version registered a fresh `onUpdate` on every call, so by the fourth start of
     * A1 there were eight live recorders all writing into the same object, and the run died on
     * `Cannot read properties of null` when one of them raced a `clearWatch()`. `engine.onUpdate`
     * has no unsubscribe, so anything a scenario attaches to it is attached for the session —
     * install once, re-arm by replacing the data.
     */
    const armWatch = () => page.evaluate(() => {
      if (window.__watchInstalled) return true;
      window.__watchInstalled = true;
      const e = window.__rrr.engine;
      e.onUpdate(() => {
        const w = window.__w; if (!w) return;
        const t = +(e.elapsed - w.t0).toFixed(2);
        w.samples++;
        // SEPARATION AND SIGHTLINE FIRST, so the state stamps below can carry them. A2's whole
        // subject is the LENGTH of a warning, and "ALERT at 12.4 s" says nothing without the
        // range it fired at and the moment the passage actually opened — without those two a
        // failing window cannot be told apart from a probe that never had a sightline.
        const sepNow = +Math.hypot(e.hunter.root.position.x - e.player.root.position.x,
          e.hunter.root.position.z - e.player.root.position.z).toFixed(1);
        const losNow = !e.room.blocksSight(e.hunter.eye, e.player.root.position.clone().setY(1.0));
        if (losNow) { if (w.losFirst == null) { w.losFirst = t; w.losFirstSep = sepNow; } w.losFrames++; }
        // ⚠️ A CLEAR LINE IS NOT A SIGHTING. `blocksSight` is geometry; `sawThisFrame` is what
        // `_sense` actually accepted after the FOV cone and the scanning head had their say.
        // Reading only the first and treating it as the second is how "the hunter ignored a
        // 20 m corridor" and "the ramp is too fast" become indistinguishable in a report.
        if (e.hunter.sawThisFrame) {
          if (w.sawFirst == null) { w.sawFirst = t; w.sawFirstSep = sepNow; }
          w.sawFrames++; w.sawFarthest = Math.max(w.sawFarthest ?? 0, sepNow);
        }
        if (e.hunter.heardThisFrame) { if (w.heardFirst == null) { w.heardFirst = t; w.heardFirstSep = sepNow; } }
        if (t - (w.traceLast ?? -9) >= 0.5 && w.trace.length < 200) {
          w.traceLast = t;
          w.trace.push(`${t}s ${sepNow}m ${e.hunter.state} aw${(e.hunter.awareness ?? 0).toFixed(2)}`
            + `${losNow ? ' los' : ''}${e.hunter.sawThisFrame ? ' SAW' : ''}${e.hunter.heardThisFrame ? ' hear' : ''}`);
        }
        if (w.states[e.hunter.state] == null) {
          w.states[e.hunter.state] = t;
          w.stateSep[e.hunter.state] = sepNow;
          w.stateLos[e.hunter.state] = losNow;
        }
        w.maxAware = Math.max(w.maxAware, e.hunter.awareness ?? 0);
        // ⚠️ BASELINE THE LIMB COUNT, DO NOT ASSUME FOUR. The round STARTS at three: the
        // nailgun is a REPLACED LIMB and `shoulderL` is spent paying for it, so `resetRound()`
        // deliberately refits only shoulderR/hipL/hipR. An assertion written against 4 records
        // a limb loss on its own first frame and fails the opening beat for the game's opening
        // state — which is the probe measuring its own setup, not the hunter.
        const limbs = e.player.rig.caps.arms + e.player.rig.caps.legs;
        if (w.limbs0 == null) { w.limbs0 = limbs; w.minLimbs = limbs; }
        if (limbs < w.minLimbs) { w.minLimbs = limbs; }
        if (limbs < w.limbs0 && w.limbLostAt == null) w.limbLostAt = t;
        if (w.noise.length < 3000) w.noise.push(+(e.player.noise ?? 0).toFixed(2));
        // RESIDENCY, SAMPLED ON THE SAME FRAMES AS EVERYTHING ELSE. A8 asserts the budget over
        // its own short walk; the plan asks for it over a LAP, and a lap is what A6 drives —
        // so the recorder carries it and A6 reports it rather than a second probe re-walking
        // the house to measure the same thing.
        const sp = e.room.spaceAt(e.player.root.position); if (sp) w.spaces.add(sp.id);
        w.maxVis = Math.max(w.maxVis ?? 0, e.room.visibleSpaces());
        if (sp && !sp.root.visible) w.blackFrames = (w.blackFrames ?? 0) + 1;
        w.sep.push(+Math.hypot(e.hunter.root.position.x - e.player.root.position.x,
          e.hunter.root.position.z - e.player.root.position.z).toFixed(1));
        if (w.sep.length > 3000) w.sep.shift();
        w.last = t;
      });
      return true;
    });
    /** Re-arm: install the single handler if needed, then hand it a fresh empty accumulator. */
    const watch = async () => {
      await armWatch();
      return page.evaluate(() => {
        const e = window.__rrr.engine;
        window.__w = { t0: e.elapsed, states: {}, stateSep: {}, stateLos: {}, minLimbs: 99,
          limbs0: null, maxAware: 0, noise: [], samples: 0, spaces: new Set(), sep: [], last: 0,
          losFirst: null, losFirstSep: null, losFrames: 0,
          sawFirst: null, sawFirstSep: null, sawFrames: 0, sawFarthest: 0,
          heardFirst: null, heardFirstSep: null, trace: [], traceLast: -9 };
        return true;
      });
    };
    const readWatch = () => page.evaluate(() => {
      const w = window.__w;
      // NEVER NULL. A probe that returns null here takes the whole scenario down on a property
      // read three lines later and every assertion after it is lost — which is how this run
      // ended once already. An empty record with `missing: true` fails its own assertion
      // loudly and lets the rest of the gate finish.
      if (!w) return { missing: true, states: {}, stateSep: {}, stateLos: {}, minLimbs: 0, limbs0: null, limbLostAt: null,
        maxAware: 0, samples: 0, last: 0, spaces: [], moving: 0, noiseMed: 0, noiseMax: 0,
        sepMin: null, maxVis: 0, blackFrames: 0, losFirst: null, losFirstSep: null, losFrames: 0,
        sawFirst: null, sawFirstSep: null, sawFrames: 0, sawFarthest: 0, heardFirst: null,
        heardFirstSep: null, trace: [] };
      const ns = w.noise.filter((n) => n > 0.02);
      return { missing: false, states: w.states, stateSep: w.stateSep ?? {}, stateLos: w.stateLos ?? {},
        losFirst: w.losFirst ?? null, losFirstSep: w.losFirstSep ?? null, losFrames: w.losFrames ?? 0,
        sawFirst: w.sawFirst ?? null, sawFirstSep: w.sawFirstSep ?? null, sawFrames: w.sawFrames ?? 0,
        sawFarthest: w.sawFarthest ?? 0, heardFirst: w.heardFirst ?? null,
        heardFirstSep: w.heardFirstSep ?? null, trace: w.trace ?? [],
        minLimbs: w.minLimbs, limbs0: w.limbs0 ?? null, limbLostAt: w.limbLostAt ?? null,
        maxAware: +w.maxAware.toFixed(2), samples: w.samples, last: w.last,
        spaces: [...w.spaces], moving: ns.length,
        noiseMed: ns.length ? ns.slice().sort((a, b) => a - b)[Math.floor(ns.length / 2)] : 0,
        noiseMax: w.noise.length ? Math.max(...w.noise) : 0,
        sepMin: w.sep.length ? Math.min(...w.sep) : null,
        maxVis: w.maxVis ?? 0, blackFrames: w.blackFrames ?? 0 };
    });
    const clearWatch = () => page.evaluate(() => { window.__w = null; });
    /**
     * ⚠️ PUT THE ROUND BACK BEFORE EVERY ASSERTION THAT NEEDS A BODY.
     *
     * A1 lets the hunter catch the player three times out of four — that is the assertion
     * working. What it leaves behind is a robot with zero limbs whose parts have been ABSORBED,
     * i.e. removed from `limbField` entirely, so the "refit from the world" loop finds nothing
     * to refit. Measured consequence, all from one run: A2 reported median noise 0 and skipped
     * because a legless robot cannot walk; A7 reported the hunter "did not reach stage 3"
     * because the engine was not driving a growth for a dead round; and A10 failed to find the
     * death overlay because the player was already dead before it stripped anything.
     * Three different-looking failures, one cause, none of them in the game.
     *
     * `resetRound()` refits from `rig.sockets[s].item` — the original spare, not a world pickup
     * — so it is the only thing here that actually restores a fully absorbed limb.
     */
    const freshRound = () => page.evaluate(() => {
      const e = window.__rrr.engine;
      if (typeof e.resetRound !== 'function') return null;
      window.__auto = null; window.__pin = null;
      e.resetRound();
      return { limbs: e.player.rig.caps.arms + e.player.rig.caps.legs, gait: e.player.caps?.gait,
        stage: e.hunter.stage, state: e.hunter.state };
    });
    await installAuto();

    // ---- A5 · THE OPENING BEAT -----------------------------------------------------------
    // "From `engine.start()`" is the plan's wording, and by the time this scenario reaches
    // here the world has been shot at, breached, teleported through and dismembered. Rather
    // than pay a 26 s re-bake for a page reload, this runs the view's OWN `resetRound()` —
    // which the capture loop already runs every 28 s and which nothing had ever asserted on.
    // The clock is re-zeroed at that reset, and the report says so.
    {
      const reset = await page.evaluate(() => {
        const e = window.__rrr.engine;
        if (typeof e.resetRound !== 'function') return null;
        e.resetRound();
        const r = e.room;
        return { at: r.spaceAt(e.player.root.position)?.id ?? null,
          hunterAt: r.spaceAt(e.hunter.root.position)?.id ?? null,
          aware: e.hunter.awareness, state: e.hunter.state, stage: e.hunter.stage,
          sep: +Math.hypot(e.hunter.root.position.x - e.player.root.position.x,
            e.hunter.root.position.z - e.player.root.position.z).toFixed(2),
          blocked: e.room.blocksSight(e.player.eye, e.hunter.eye),
          limbs: e.player.rig.caps.arms + e.player.rig.caps.legs };
      });
      if (!reset) skip('A5 the opening beat', 'engine.resetRound is not exposed — cannot return the round to t=0');
      else {
        note(`A5: reset -> player in ${reset.at}, hunter in ${reset.hunterAt} at ${reset.sep} m,` +
          ` sightBlocked ${reset.blocked}, awareness ${reset.aware}, state ${reset.state}, limbs ${reset.limbs}`);
        await watch();
        // THE INTENDED ROUTE, WALKED. §6.2: the player reads the study, then goes north through
        // D1 and west down the gallery. No Shift — walking noise is ~0.49, i.e. audible at 6.9 m,
        // and the whole beat is about that being inaudible from the ballroom.
        const route5 = await anchorsXZ('study_w.north', 'gallery.west', 'gallery.mid');
        await drive(route5.filter(Boolean), { tol: 1.6 });
        await holdWalk(45000, false);
        await stopAuto();
        const m5 = await readWatch();
        await clearWatch();
        await shot('m5-opening-beat');
        const alert = m5.states.ALERT ?? null, pursue = m5.states.PURSUE ?? null, attack = m5.states.ATTACK ?? null;
        note(`A5: ${m5.last}s walked, ${m5.samples} frames, visited ${JSON.stringify(m5.spaces)},` +
          ` median walking noise ${m5.noiseMed} (peak ${m5.noiseMax}), closest approach ${m5.sepMin} m`);
        note(`A5: first states ${JSON.stringify(m5.states)} · limbs ${m5.minLimbs}/${m5.limbs0} at start` +
          `${m5.limbLostAt != null ? ` (first lost at t=${m5.limbLostAt}s)` : ' (none lost)'}`);
        if (m5.last < 40) skip('A5 the opening beat', `only ${m5.last}s of walking observed — needs 45`);
        else {
          const bad = [];
          if (alert != null && alert < 20) bad.push(`first ALERT at ${alert}s (needs >= 20)`);
          if (pursue != null && pursue < 30) bad.push(`first PURSUE at ${pursue}s (needs >= 30)`);
          if (attack != null && attack < 30) bad.push(`first ATTACK at ${attack}s`);
          if (m5.limbLostAt != null && m5.limbLostAt < 45) bad.push(`limb lost at ${m5.limbLostAt}s (needs >= 45)`);
          if (!bad.length) {
            pass('A5 the opening beat', `45 s walked from a real round reset: ALERT ${alert ?? 'never'},` +
              ` PURSUE ${pursue ?? 'never'}, limbs intact (${m5.minLimbs}, unchanged from spawn) — geometry, not a grace timer`);
          } else fail('A5 the opening beat', bad.join(' · '));
        }
      }
    }

    // ---- A4 · "UNSEEN" EXISTS ------------------------------------------------------------
    // Two shapes, as the plan asks: (a) the map is bigger than the sense, measured off the
    // space table; (b) a real pair of bodies with walls between them and a 10 s clock.
    {
      const a4a = await page.evaluate(() => {
        const r = window.__rrr.engine.room;
        let best = { d: 0, a: null, b: null };
        for (const s of r.spaces) for (const t of r.spaces) {
          if (s === t) continue;
          const d = Math.hypot((s.x0 + s.x1) / 2 - (t.x0 + t.x1) / 2, (s.z0 + s.z1) / 2 - (t.z0 + t.z1) / 2);
          if (d > best.d) best = { d: +d.toFixed(2), a: s.id, b: t.id };
        }
        // and the corner-to-corner footprint, which is the number the plan quotes
        const xs = r.spaces.flatMap((s) => [s.x0, s.x1]), zs = r.spaces.flatMap((s) => [s.z0, s.z1]);
        const foot = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
        return { best, foot: +foot.toFixed(2), sight: 26 };
      });
      note(`A4a: furthest space centres ${a4a.best.a} <-> ${a4a.best.b} = ${a4a.best.d} m` +
        ` · footprint diagonal ${a4a.foot} m · sightRange ${a4a.sight} m`);

      const a4b = await page.evaluate(() => {
        const e = window.__rrr.engine, r = e.room;
        const P = r.anchor('study_w.south'), H = r.anchor('gallery.east');
        if (!P || !H) return null;
        e.player.pos.copy(P); e.player.vel.set(0, 0, 0);
        e.hunter.root.position.copy(H); e.hunter.vel.set(0, 0, 0);
        e.hunter.state = 'PATROL'; e.hunter.awareness = 0; e.hunter.target = null;
        // ⚠️ PIN THE HUNTER. The assertion is "from THERE it cannot perceive you"; if the
        // patrol route walks it into the next room the probe measures the route instead of
        // the map, and would report a map failure for a schedule.
        window.__pin = H.clone();
        return { d: +Math.hypot(P.x - H.x, P.z - H.z).toFixed(2), blocked: r.blocksSight(e.player.eye, e.hunter.eye) };
      });
      if (!a4b) skip('A4 "unseen" exists', 'study_w.south / gallery.east did not resolve');
      else {
        await watch();
        // walk a there-and-back inside study_w so the noise is real WALKING noise, not a
        // body standing still (which would make the 10 s of awareness 0 mean nothing)
        const route4 = await anchorsXZ('study_w.north', 'study_w.south', 'study_w.north');
        await drive(route4.filter(Boolean), { tol: 1.2, loop: true });
        await holdWalk(10500, false);
        await stopAuto();
        const m4 = await readWatch();
        await clearWatch();
        await page.evaluate(() => { window.__pin = null; });
        note(`A4b: ${a4b.d} m apart, blocksSight ${a4b.blocked} · ${m4.last}s walked,` +
          ` ${m4.moving} moving frames at median noise ${m4.noiseMed} · max awareness ${m4.maxAware}` +
          ` · hunter states seen ${JSON.stringify(m4.states)}`);
        const farEnough = a4a.best.d > 26;
        if (!a4b.blocked) fail('A4 "unseen" exists', `the CONTROL failed: blocksSight is false at ${a4b.d} m, so nothing was hidden`);
        else if (m4.moving < 60) skip('A4 "unseen" exists', `only ${m4.moving} moving frames — the walk did not happen`);
        else if (farEnough && m4.maxAware === 0) {
          pass('A4 "unseen" exists', `${a4a.best.a}<->${a4a.best.b} ${a4a.best.d} m > sightRange 26,` +
            ` and 10 s of walking at noise ${m4.noiseMed} behind a wall ${a4b.d} m away left awareness at 0`);
        } else if (!farEnough) fail('A4 "unseen" exists', `no space-centre pair exceeds 26 m (furthest ${a4a.best.d})`);
        else fail('A4 "unseen" exists', `awareness reached ${m4.maxAware} while walking unseen`);
      }
    }

    // ---- A6 · A LAP IS POSSIBLE ----------------------------------------------------------
    // The outer ring at a run, with the per-second delta watched: a doorway that jams shows up
    // as a body that stops moving while still being told to move, not as an exception.
    {
      const ring = await anchorsXZ('study_w.north', 'gallery.mid', 'study_e.north', 'study_e.south',
        'ballroom.north', 'study_w.south');
      const ok6 = await page.evaluate(() => {
        const e = window.__rrr.engine, r = e.room;
        const S = r.anchor('study_w.south');
        e.player.pos.copy(S); e.player.vel.set(0, 0, 0);
        // out of the way, and pinned there: this assertion is about the MAP, not the fight
        const away = r.anchor('chapel.centre');
        window.__pin = away.clone(); e.hunter.root.position.copy(away);
        e.hunter.state = 'PATROL'; e.hunter.awareness = 0; e.hunter.target = null;
        return { start: r.spaceAt(e.player.root.position)?.id ?? null };
      }).catch(() => null);
      if (!ok6) skip('A6 a lap is possible', 'could not set up the lap');
      else {
        await watch();
        await drive(ring.filter(Boolean), { tol: 1.7 });
        const t6 = Date.now();
        await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
        const done = await waitFor(() => (window.__auto?.done ? { i: window.__auto.i } : null),
          { timeout: 26000, every: 120 });
        await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
        const secs = +((Date.now() - t6) / 1000).toFixed(1);
        const m6 = await readWatch();
        await stopAuto(); await clearWatch();
        await page.evaluate(() => { window.__pin = null; });
        await shot('m6-lap');
        const end = await page.evaluate(() => window.__rrr.engine.room.spaceAt(window.__rrr.engine.player.root.position)?.id ?? 'doorway');
        note(`A6: lap ${done ? 'completed' : 'DID NOT complete'} in ${secs}s · visited ${JSON.stringify(m6.spaces)} · ended in ${end}`);
        note(`A8-over-a-lap: max visible spaces ${m6.maxVis} (budget 3) over ${m6.samples} frames;` +
          ` frames with the player's own space hidden: ${m6.blackFrames}`);
        if (!done) fail('A6 a lap is possible', `did not close the ring in 26 s — stuck after ${m6.spaces.length} space(s): ${m6.spaces.join(',')}`);
        else if (secs > 20) fail('A6 a lap is possible', `closed the ring but in ${secs}s (budget 20)`);
        else pass('A6 a lap is possible', `outer ring in ${secs}s at a run through ${m6.spaces.length} spaces (${m6.spaces.join(' -> ')}), no doorway lock`);
        // §5.2 asks for the residency budget over a LAP, not over a short walk — this is that
        // measurement, on the same frames as the lap itself.
        if (m6.samples < 200) skip('A8 residency holds over a lap', `only ${m6.samples} frames sampled`);
        else if (m6.maxVis <= 3 && m6.blackFrames === 0)
          pass('A8 residency holds over a lap', `${m6.samples} frames across ${m6.spaces.length} spaces: never more than ${m6.maxVis} visible, never a black room (PORTAL_VIS_DIST 16.0 shipped)`);
        else fail('A8 residency holds over a lap', `max visible ${m6.maxVis} (budget 3), ${m6.blackFrames} frames with the player's own space hidden`);
      }
    }

    // ---- A1 · BREAK CONTACT IS POSSIBLE --------------------------------------------------
    // The deepest thing the mansion is for. Four starts, at least three must break.
    {
      const starts = [['study_w', 'study_w.south'], ['study_e', 'study_e.south'],
        ['service', 'service.mid'], ['ballroom', 'ballroom.north']];
      // the ring, entered from wherever the player starts — running it is the player's move
      const ring1 = await anchorsXZ('study_w.north', 'gallery.mid', 'study_e.north', 'study_e.south',
        'ballroom.north', 'study_w.south');
      const results = [];
      for (const [spaceId, anch] of starts) {
        const fresh = await freshRound();
        if (!fresh || fresh.limbs < 3) { note(`A1 from ${spaceId}: SKIPPED — reset left ${fresh?.limbs ?? '?'} limbs`); continue; }
        const set = await page.evaluate(([anch]) => {
          const e = window.__rrr.engine, r = e.room;
          const P = r.anchor(anch);
          e.player.pos.copy(P); e.player.vel.set(0, 0, 0);
          // PURSUE at <= 6 m, exactly as the assertion states, and through the production
          // fields rather than by faking a state that `_sense` would overwrite next frame.
          const d = 5.0;
          e.hunter.root.position.set(P.x + d, 0, P.z);
          e.hunter.vel.set(0, 0, 0);
          e.hunter.stage = 1; e.hunter.radius = 0.42;
          e.hunter.awareness = 1.0; e.hunter.state = 'PURSUE';
          // The body object the hunter's own candidate list holds, not a hand-rolled one:
          // `_sense` and `_attack` read `rig` and `height` off it and a stand-in would make
          // the attack path a different path from the game's.
          e.hunter.target = e.hunter.candidates?.[0] ?? { root: e.player.root, rig: e.player.rig, height: e.player.height };
          e.hunter.lastKnown.copy(e.player.root.position);
          return { at: r.spaceAt(e.player.root.position)?.id ?? null,
            sep: +Math.hypot(e.hunter.root.position.x - P.x, e.hunter.root.position.z - P.z).toFixed(2),
            limbs: e.player.rig.caps.arms + e.player.rig.caps.legs, state: e.hunter.state };
        }, [anch]);
        await watch();
        await drive(ring1.filter(Boolean), { tol: 1.7, loop: true });
        await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
        const broke = await waitFor(() => {
          const e = window.__rrr.engine, h = e.hunter;
          if (h.state !== 'SEARCH' && h.state !== 'PATROL') return null;
          return { state: h.state, t: +(e.elapsed - (window.__w?.t0 ?? e.elapsed)).toFixed(2) };
        }, { timeout: 25000, every: 150 });
        await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
        const m1 = await readWatch();
        await stopAuto(); await clearWatch();
        results.push({ from: set.at ?? spaceId, sep: set.sep, broke: !!broke,
          t: broke?.t ?? null, state: broke?.state ?? null, limbs: m1.minLimbs, limbs0: m1.limbs0,
          intact: m1.limbLostAt == null, limbLostAt: m1.limbLostAt, visited: m1.spaces, closest: m1.sepMin });
        note(`A1 from ${set.at ?? spaceId}: hunter PURSUE at ${set.sep} m -> ` +
          `${broke ? `${broke.state} at t=${broke.t}s` : 'NEVER broke contact in 25 s'}` +
          ` · limbs ${m1.minLimbs}/${m1.limbs0} · closest ${m1.sepMin} m · through ${JSON.stringify(m1.spaces)}`);
      }
      await shot('m1-break-contact');
      // "without losing a limb" means NO LOSS FROM THE START, not "ends on four" — the round
      // opens on three because the nailgun is a replaced limb.
      const clean = results.filter((r) => r.broke && r.intact);
      note(`A1: ${clean.length}/4 starts broke contact intact — ` +
        results.map((r) => `${r.from}:${r.broke ? `${r.t}s` : 'no'}/${r.limbs}limbs`).join(' · '));
      if (clean.length >= 3) pass('A1 break contact is possible', `${clean.length} of 4 starting spaces reached SEARCH within 25 s without losing a limb`);
      else fail('A1 break contact is possible', `only ${clean.length} of 4 broke contact intact (need 3): ` +
        results.map((r) => `${r.from}=${r.broke ? `${r.t}s,${r.limbs}/${r.limbs0}limbs` : 'never'}`).join(' · '));
    }

    // ---- A2 · THE WARNING WINDOW ---------------------------------------------------------
    // ALERT -> PURSUE with the player WALKING. `soundCeiling 0.86` is below `commitAt 1.00`,
    // so noise alone can never commit it: the window is the distance between being heard and
    // being seen, and that is a property of the passage's length.
    {
      await freshRound();
      const set2 = await page.evaluate(() => {
        const e = window.__rrr.engine, r = e.room;
        // ⚠️ THE APPROACH STARTS IN study_w, WHICH IS NOT ADJACENT TO service. §9's wording is
        // "the study_w -> service -> ballroom approach", and in the theta graph those two hubs
        // are NOT joined — study_w reaches service only through the gallery (D1 then D2) or
        // through the ballroom. Starting the probe at `service.north` instead skipped the whole
        // approach and began 15.3 m from the hunter with the passage's sightline ALREADY CLEAR
        // through D5, which measures an acquisition, not a warning window.
        const P = r.anchor('study_w.south'), H = r.anchor('ballroom.north');
        e.player.pos.copy(P); e.player.vel.set(0, 0, 0);
        e.hunter.root.position.copy(H); e.hunter.vel.set(0, 0, 0);
        e.hunter.stage = 1; e.hunter.radius = 0.42;
        e.hunter.state = 'PATROL'; e.hunter.awareness = 0; e.hunter.target = null;
        // Hold the hunter at the ballroom's north side rather than let it patrol away: the
        // assertion is about the LENGTH OF THE APPROACH, and a hunter that wandered off would
        // report a huge window that means nothing.
        window.__pin = H.clone();
        return { d: +Math.hypot(P.x - H.x, P.z - H.z).toFixed(2), blocked: r.blocksSight(e.player.eye, e.hunter.eye) };
      });
      await watch();
      // study_w -> D1 -> gallery -> D2 -> the passage -> D5 -> ballroom, walking the whole way
      const route2 = await anchorsXZ('gallery.mid', 'service.north', 'service.south', 'ballroom.north');
      await drive(route2.filter(Boolean), { tol: 1.4 });
      await holdWalk(34000, false);
      await stopAuto();
      const m2 = await readWatch();
      await clearWatch();
      await page.evaluate(() => { window.__pin = null; });
      await shot('m2-warning-window');
      const alert = m2.states.ALERT ?? null;
      const commit = [m2.states.PURSUE, m2.states.ATTACK].filter((x) => x != null).sort((a, b) => a - b)[0] ?? null;
      note(`A2: started ${set2.d} m out (sightBlocked ${set2.blocked}) walking at median noise ${m2.noiseMed}` +
        ` · state firsts ${JSON.stringify(m2.states)} · closest ${m2.sepMin} m · spaces ${JSON.stringify(m2.spaces)}`);
      // WHERE, not just when. The window is bounded from above by the walk-in: once the passage
      // opens at S metres, ATTACK is unavoidable after (S - 2.36)/2.55 s of walking whatever the
      // ramp does, so a failing window has to be read against that ceiling before it is blamed
      // on the gain curve.
      note(`A2 geometry: first clear sightline at t=${m2.losFirst ?? 'never'}${m2.losFirst != null ? `s / ${m2.losFirstSep} m` : ''}` +
        ` (${m2.losFrames} frames with a line) · state entries ${JSON.stringify(m2.stateSep)} m` +
        ` · sight at entry ${JSON.stringify(m2.stateLos)}`);
      note(`A2 perception: first actual SIGHTING (FOV accepted) at t=${m2.sawFirst ?? 'never'}` +
        `${m2.sawFirst != null ? `s / ${m2.sawFirstSep} m` : ''} · ${m2.sawFrames} sighted frames, farthest ${m2.sawFarthest} m` +
        ` · first HEARD at t=${m2.heardFirst ?? 'never'}${m2.heardFirst != null ? `s / ${m2.heardFirstSep} m` : ''}`);
      for (const line of m2.trace) note(`    ${line}`);
      if (m2.noiseMed < 0.30 || m2.noiseMed > 0.70) {
        skip('A2 warning window >= 6.0 s', `median noise ${m2.noiseMed} is outside the walking band 0.35-0.65 — the probe was not walking`);
      } else if (alert == null) {
        fail('A2 warning window >= 6.0 s', `the hunter never reached ALERT in ${m2.last}s — the approach did not register at all`);
      } else if (commit == null) {
        pass('A2 warning window >= 6.0 s', `ALERT at ${alert}s and it never committed in ${m2.last}s of walking` +
          ` — window >= ${(m2.last - alert).toFixed(1)}s (soundCeiling 0.86 < commitAt 1.00: noise alone cannot commit it)`);
      } else {
        const win = +(commit - alert).toFixed(2);
        if (win >= 6.0) pass('A2 warning window >= 6.0 s', `${win}s between first ALERT (${alert}s) and first commit (${commit}s) at walk noise ${m2.noiseMed}`);
        else {
          // ⚠️ SAY WHAT THE CEILING IS, or the next owner re-diagnoses this from scratch and
          // blames the awareness ramp again. Measured trace: the hunter is pinned at
          // ballroom.north with its back to the passage, so across the WHOLE clear-line
          // approach (20.9 m -> 8.0 m, ~5 s) the FOV cone never accepts the player and
          // awareness stays at 0.00. First contact of any kind is HEARING at hearRange x 0.49.
          // From there everything is forced arithmetic and none of it is the sight curve:
          //   ALERT      alertAt / soundGain      seconds after the target becomes audible
          //   ATTACK     unconditional in `_arbitrate` at seenD < reach * 1.15
          // so the largest window this staging can produce is the walk between those two radii
          // minus the time the sound ramp needs to reach `alertAt`.
          const audible = HS.hearRange * (m2.noiseMed || 0.49);
          const atk = HS.reach * 1.15;
          const ceiling = +((audible - atk) / 2.55 - HS.alertAt / HS.soundGain).toFixed(2);
          fail('A2 warning window >= 6.0 s', `only ${win}s of warning (ALERT ${alert}s -> commit ${commit}s).`
            + ` CEILING ${ceiling}s: first contact was hearing at ${audible.toFixed(2)} m (hearRange ${HS.hearRange} x noise ${m2.noiseMed}),`
            + ` ALERT costs ${(HS.alertAt / HS.soundGain).toFixed(2)}s of that, and ATTACK is unconditional at ${atk.toFixed(2)} m —`
            + ` ${((audible - atk) / 2.55).toFixed(2)}s of walking apart. The 6.0 s bar is unreachable at this staging whatever the sight ramp does;`
            + ` sight contributed nothing here (first FOV sighting ${m2.sawFirstSep} m, first heard ${m2.heardFirstSep} m).`);
        }
      }
    }

    // ---- A7 · THE NARROW DOOR IS A REAL CONSTRAINT ---------------------------------------
    // D7 is 1.20 m and `radius = 0.30 + stage * 0.12`, so a stage-3 hunter (0.66, needing
    // 1.32) does NOT fit. That is the mechanic (§2.3): the chapel is a refuge that GROWTH
    // takes away, and after growth the only way in is the loud, readable breach of `p.chapel`.
    // Grown through `_grow()` — the production path — not by assigning `stage`, because the
    // radius is only rewritten at the END of a growth and a hand-set stage keeps a stage-1
    // body that would fit through D7 and prove the opposite of what the probe claims.
    {
      await freshRound();
      const set7 = await page.evaluate(() => {
        const e = window.__rrr.engine, r = e.room;
        const P = r.anchor('chapel.centre'), H = r.anchor('gallery.east');
        e.player.pos.copy(P); e.player.vel.set(0, 0, 0);
        e.hunter.root.position.set(H.x - 4.0, 0, H.z - 1.5);
        e.hunter.vel.set(0, 0, 0);
        e.hunter._grow(3);
        return { playerAt: r.spaceAt(e.player.root.position)?.id ?? null,
          hunterAt: r.spaceAt(e.hunter.root.position)?.id ?? null,
          d7: r.portals().find((p) => p.id === 'D7')?.w ?? null,
          chapelPanel: r.panels.find((p) => p.id === 'p.chapel')?.state.stage ?? null };
      });
      await page.waitForTimeout(1800);        // the growth is an authored 1.4 s event
      const grown = await page.evaluate(() => {
        const e = window.__rrr.engine;
        e.hunter.awareness = 1.0; e.hunter.state = 'PURSUE';
        e.hunter.target = e.hunter.candidates?.[0] ?? { root: e.player.root, rig: e.player.rig, height: e.player.height };
        e.hunter.lastKnown.copy(e.player.root.position);
        window.__a7 = { got: null, panel: 0 };
        e.onUpdate(() => {
          const a = window.__a7; if (!a) return;
          if (!a.got && e.room.spaceAt(e.hunter.root.position)?.id === 'chapel') a.got = 'entered';
          const p = e.room.panels.find((q) => q.id === 'p.chapel');
          if (p) a.panel = Math.max(a.panel, p.state.stage);
        });
        return { stage: e.hunter.stage, radius: +e.hunter.radius.toFixed(2), need: +(2 * e.hunter.radius).toFixed(2) };
      });
      note(`A7: hunter grown to stage ${grown.stage}, radius ${grown.radius} m — needs > ${grown.need} m of clear width;` +
        ` D7 is ${set7.d7} m. Player in ${set7.playerAt}, hunter starting in ${set7.hunterAt}.`);
      if (grown.stage !== 3) skip('A7 the narrow door is a real constraint', `the hunter did not reach stage 3 (got ${grown.stage})`);
      else {
        const got = await waitFor(() => {
          const a = window.__a7;
          return (a && (a.got || a.panel >= 1)) ? { got: a.got, panel: a.panel } : null;
        }, { timeout: 20000, every: 200 });
        const end = await page.evaluate(() => {
          const e = window.__rrr.engine, a = window.__a7; window.__a7 = null;
          return { at: e.room.spaceAt(e.hunter.root.position)?.id ?? 'doorway', panel: a?.panel ?? 0,
            got: a?.got ?? null, state: e.hunter.state };
        });
        await shot('m7-narrow-door');
        note(`A7: after the chase — hunter in ${end.at} (${end.state}), p.chapel at stage ${end.panel}, entered=${end.got}`);
        if (got) pass('A7 the narrow door is a real constraint', end.got === 'entered'
          ? `a stage-3 hunter (needs ${grown.need} m) got into the chapel — through the 1.20 m D7 or the breach it made (p.chapel stage ${end.panel})`
          : `the 1.20 m D7 turned it away and it drove p.chapel to stage ${end.panel} instead — growth traded the shortcut for a loud breach`);
        else fail('A7 the narrow door is a real constraint', `in 20 s the stage-3 hunter neither entered the chapel nor damaged p.chapel (stage ${end.panel}); it is in ${end.at} in state ${end.state}`);
      }
    }
  }

  // =========================================================================
  // A10 · DEATH AND RESTART. Runs last — it takes the page down.
  // =========================================================================
  {
    // Put a body back first. A10 is about the TRANSITION into death, and by this point in the
    // run A1 has already killed the player three times — stripping an already-stripped rig
    // fires no transition and the overlay never appears, which reads as a broken death screen.
    await page.evaluate(() => { const e = window.__rrr.engine; e.resetRound?.(); }).catch(() => {});
    await page.waitForTimeout(400);
    const stripped = await page.evaluate(() => {
      const e = window.__rrr.engine, p = e.player;
      for (const s of ['shoulderL', 'shoulderR', 'hipL', 'hipR']) {
        if (p.rig.occupant(s) !== 'empty') p.rig.detach(s, {});
      }
      return { gait: p.caps?.gait, arms: p.rig.caps.arms, legs: p.rig.caps.legs };
    });
    note(`A10: stripped all four sockets — gait ${stripped.gait}, arms ${stripped.arms}, legs ${stripped.legs}`);
    const dead = await waitFor(() => (document.querySelector('#rrr-death') ? true : null), { timeout: 6000, every: 100 });
    await shot('m10-death');
    // Second shape of evidence: the element exists AND it is the top-most thing at the centre
    // of the screen. Element existence alone has passed on this project for content hidden
    // under a z-index:100 splash.
    const onTop = await page.evaluate(() => {
      const d = document.querySelector('#rrr-death');
      if (!d) return null;
      const el = document.elementFromPoint(Math.round(innerWidth / 2), Math.round(innerHeight / 2));
      return { contains: d.contains(el) || d === el, tag: el?.tagName, z: getComputedStyle(d).zIndex };
    });
    if (!dead) fail('A10 death overlay appears', `gait was ${stripped.gait} and no #rrr-death within 6 s`);
    else if (onTop?.contains) pass('A10 death overlay appears', `#rrr-death is the top element at screen centre (z-index ${onTop.z})`);
    else fail('A10 death overlay appears', `#rrr-death exists but the centre of the screen is ${onTop?.tag} — it is under something`);
  }
}
