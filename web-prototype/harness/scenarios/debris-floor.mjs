/**
 * 🧱 **THE FLOOR AFTER A REAL DIG — how much material is lying there, and in what shape.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/debris-floor.mjs \
 *        --port 5381 --q "seed=s4&dig=1" --shots
 *
 * `critic-slice-3` ranked this #1 of everything between the build and John's art:
 *
 *   > **The floor stays clean** — John's art is knee-deep in white slabs; the game leaves
 *   > 6–10 hand-sized chips at the skirting.
 *
 * Every previous dig instrument on this project measured the WALL. `dig-band` counts blows,
 * `_visible1-*` reads the depth channel, `dig-free` reads passability. **Nothing has ever
 * measured what ended up on the floor**, which is why a defect this loud survived eleven
 * rounds — it was nobody's number.
 *
 * ⚠️ **THE MEASUREMENT IS A VOLUME RATIO, NOT A PIECE COUNT, AND THAT IS THE POINT.** A count
 * can be raised by throwing more confetti; the honest question is *"the dig removed X m³ of
 * wall — how much of it is on the floor?"* Both terms are read off the shipped objects: the
 * numerator from `DebrisSystem`'s resting instances and their own geometry bounds, the
 * denominator from `DamageField.stats().meanDepth × cells × cellW × cellH × thickness`. So the
 * bar cannot be gamed by making pieces smaller and more numerous, or larger and fewer.
 *
 * ⚠️ **THE DRIVE IS BLOW-COUNT × `WEAPON_COOLDOWN.sledge`, AT REAL WALL-CLOCK CADENCE.**
 * `dig-band`'s clock trick (blows, never a stopwatch) is right for the wall and WRONG here:
 * debris needs real frames between blows or every piece is still in the air when the census
 * runs. So this one costs a real minute and says so. The blow POSITIONS are a fixed plan, so
 * what the wall does is still bit-identical run to run.
 */

/** ~63 blows is one dig in John's minute. A short plan for smoke runs: DEBRIS_BLOWS=12. */
const BLOWS = Number(process.env.DEBRIS_BLOWS ?? 63);
const CADENCE = Number(process.env.DEBRIS_CADENCE ?? 950);
const ROOMS = (process.env.DEBRIS_ROOMS ?? 'gallery.mid,gallery.west,gallery.east,service.mid').split(',');

/**
 * Where the blows land, in face uv offsets from the aim centre. A player working a channel
 * does not hold the crosshair still — `dig-band` phase 2 drives the least-dug cell and
 * `_c3-dig` holds dead centre; the truth is between them, so this walks a body-wide channel
 * with the density weighted to the middle, which is what the shape of a finished dig shows.
 */
function plan(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    // a slow vertical sweep with a horizontal wobble, tightening toward the centre as it deepens
    const spread = 1 - 0.45 * t;
    out.push([
      Math.sin(i * 2.399) * 0.13 * spread,
      (Math.sin(i * 1.017) * 0.5 + (t - 0.5) * 0.35) * 0.30 * spread,
    ]);
  }
  return out;
}

export default async function debrisFloor({ page, note, pass, fail, skip, shot }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  const setup = await page.evaluate((rooms) => {
    const e = window.__rrr.engine, p = e.player, room = e.room;
    if (!e.debris) return { ok: false, why: 'engine.debris is not exposed on this build' };
    // the hunter must not wander in and take an arm mid-dig — critic-slice-3 lost the hammer
    if (e.hunter) {
      e.hunter.update = () => {};
      if (room.spawn?.hunter) e.hunter.root.position.copy(room.spawn.hunter);
      e.hunter.state = 'PATROL'; e.hunter.target = null; e.hunter.awareness = 0;
    }
    const NEAR = 1.15, FAR = 2.8, IDEAL = 1.7;
    let best = null;
    for (const name of rooms) {
      const v = room.anchor?.(name);
      if (!v) continue;
      const from = v.clone(); from.y += p.eyeHeight;
      for (let i = 0; i < 64; i++) {
        const yaw = (i / 64) * Math.PI * 2;
        const dir = v.clone().set(Math.sin(yaw), 0, Math.cos(yaw));
        const hit = room.castRay?.(from, dir, FAR, { forDamage: true });
        if (!hit?.panel || !hit.panel.spec?.dig) continue;
        if ((hit.panel.field?.maxDepth ?? 0) > 0.01) continue;
        if (hit.distance < NEAR) continue;
        const score = Math.abs(hit.distance - IDEAL);
        if (!best || score < best.score) best = { name, v, yaw, d: hit.distance, score, id: hit.panel.id };
      }
      if (best) break;
    }
    if (!best) return { ok: false, why: 'no fresh dig face at a workable standoff in ' + rooms.join('/') };
    p.pos.copy(best.v); p.vel.set(0, 0, 0);
    p.aimYaw = best.yaw; p.facing = best.yaw;
    if (e.cam) { e.cam.yaw = best.yaw; e.cam.pitch = 0.02; e.cam._first = true; }
    const panel = room.panelOf(best.id);
    const f = panel.field;
    return {
      ok: true, anchor: best.name, panel: best.id, standoff: +best.d.toFixed(2),
      space: panel.spec?.space ?? null,
      wall: { w: panel.width, h: panel.height, t: panel.thickness, rotY: panel.rotY },
      grid: f ? { cols: f.cols, rows: f.rows, cellW: +f.cellW.toFixed(4), cellH: +f.cellH.toFixed(4) } : null,
      floorY: room.floorY,
      centre: panel.pointAt(0.5, 0.5),
      normal: panel.normal,
      perKind: Object.fromEntries(Object.entries(e.debris.pools).map(([k, v]) => [k, v.per])),
    };
  }, ROOMS);

  if (!setup.ok) { fail('a fresh dig face can be reached', setup.why); return; }
  note(`station ${setup.anchor} · panel ${setup.panel} · standoff ${setup.standoff} m`
    + ` · face ${setup.wall.w}x${setup.wall.h}x${setup.wall.t} m · grid ${setup.grid?.cols}x${setup.grid?.rows}`);
  note(`debris pools: ${JSON.stringify(setup.perKind)}`);

  // ---- instrument the spawn path so the census can be checked against what was asked for ----
  await page.evaluate(() => {
    const d = window.__rrr.engine.debris;
    window.__dbg = { asked: {}, made: {}, calls: 0 };
    const orig = d.burst.bind(d);
    d.burst = (kind, at, count, o) => {
      window.__dbg.calls++;
      window.__dbg.asked[kind] = (window.__dbg.asked[kind] ?? 0) + count;
      const n = orig(kind, at, count, o);
      window.__dbg.made[kind] = (window.__dbg.made[kind] ?? 0) + n;
      return n;
    };
    // 🧱 round 13: the collapse pays out ONE BIG CHUNK per region, not a spray — count them
    // and record their measurements, because "big chunks coming off the wall" is the whole ask.
    window.__dbg.chunks = [];
    if (typeof d.chunk === 'function') {
      const oc = d.chunk.bind(d);
      d.chunk = (kind, at, o) => {
        window.__dbg.chunks.push([kind, +(o?.w ?? 0).toFixed(3), +(o?.h ?? 0).toFixed(3), +(o?.t ?? 0).toFixed(3)]);
        return oc(kind, at, o);
      };
    }
  });

  await page.waitForTimeout(500);
  await shot('debris-00-pristine');

  // ---- the dig ------------------------------------------------------------------------------
  const PLAN = plan(BLOWS);
  const t0 = Date.now();
  let landed = 0, through = null;
  for (let i = 0; i < PLAN.length; i++) {
    const r = await page.evaluate(([id, du, dv]) => {
      const e = window.__rrr.engine;
      const q = e.room.panelOf(id);
      const pt = q.pointAt(0.5 + du, 0.5 + dv);
      const res = q.applyHit(pt, 1);
      return { removed: +(res.removed ?? 0).toFixed(4), depth: +(res.depthAt ?? 0).toFixed(3),
        broke: !!res.brokeThrough, passable: !!q.passable?.() };
    }, [setup.panel, PLAN[i][0], PLAN[i][1]]);
    landed++;
    if (r.passable && !through) through = { blow: landed };
    await page.waitForTimeout(CADENCE);
  }
  const wall = ((Date.now() - t0) / 1000).toFixed(1);
  note(`${landed} blows over ${wall} s of wall clock${through ? ` · passable at blow ${through.blow}` : ' · never passable'}`);

  // let the last pieces land
  await page.waitForTimeout(2500);

  // ---- THE CENSUS ---------------------------------------------------------------------------
  const cen = await page.evaluate((s) => {
    const e = window.__rrr.engine, d = e.debris;
    const panel = e.room.panelOf(s.panel);
    const f = panel.field;
    const st = f.stats();
    // material that left the wall, in m³: mean depth over every cell x the cell's own volume
    const removedVol = st.meanDepth * st.cells * f.cellW * f.cellH * panel.thickness;

    const n = { x: panel.normal.x, y: 0, z: panel.normal.z };
    const c = panel.pointAt(0.5, 0.5);
    const tx = n.z, tz = -n.x;                       // along the face, floor plane

    const kinds = {};
    let vol = 0, rest = 0, alive = 0, top = s.floorY;
    // a coarse height field over the floor in front of the face: 0.15 m cells,
    // 4 m along the wall x 3 m out from it
    const CELL = 0.15, NA = 28, NO = 20;
    const hi = new Float32Array(NA * NO);
    const cnt = new Int32Array(NA * NO);

    for (const k in d.pools) {
      const p = d.pools[k];
      const g = p.mesh.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox;
      const bx = bb.max.x - bb.min.x, by = bb.max.y - bb.min.y, bz = bb.max.z - bb.min.z;
      // 0.55 is a solid-fraction estimate for a fractured convex-ish shard inside its own box
      const unit = bx * by * bz * 0.55;
      let kv = 0, kr = 0, ka = 0, kmax = 0;
      for (let i = 0; i < p.per; i++) {
        if (!p.alive[i]) continue;
        ka++;
        if (!p.rest[i]) continue;
        kr++;
        const sc = p.sc[i];
        kv += unit * sc * sc * sc;
        kmax = Math.max(kmax, Math.max(bx, by) * sc);
        top = Math.max(top, p.py[i]);
        const dx = p.px[i] - c.x, dz = p.pz[i] - c.z;
        const along = dx * tx + dz * tz;
        const out = dx * n.x + dz * n.z;
        const ia = Math.round(along / CELL) + (NA >> 1), io = Math.round(out / CELL);
        if (ia >= 0 && ia < NA && io >= 0 && io < NO) {
          const j = io * NA + ia;
          cnt[j]++;
          hi[j] = Math.max(hi[j], p.py[i] - s.floorY + Math.max(bb.max.y, bb.max.z) * sc);
        }
      }
      kinds[k] = { per: p.per, alive: ka, rest: kr, vol: +kv.toFixed(5),
        biggest: +kmax.toFixed(3), unit: +unit.toFixed(6) };
      vol += kv; rest += kr; alive += ka;
    }

    // the drift: cells that carry any resting piece
    let covered = 0, hsum = 0, hmax = 0, deepest = null;
    for (let io = 0; io < NO; io++) {
      for (let ia = 0; ia < NA; ia++) {
        const j = io * NA + ia;
        if (!cnt[j]) continue;
        covered++; hsum += hi[j];
        if (hi[j] > hmax) { hmax = hi[j]; deepest = { along: (ia - (NA >> 1)) * CELL, out: io * CELL }; }
      }
    }
    // a profile out from the wall: how many pieces at each 0.15 m band
    const profile = [];
    for (let io = 0; io < 12; io++) {
      let c2 = 0, h2 = 0;
      for (let ia = 0; ia < NA; ia++) { const j = io * NA + ia; c2 += cnt[j]; h2 = Math.max(h2, hi[j]); }
      profile.push([+(io * CELL).toFixed(2), c2, +h2.toFixed(2)]);
    }

    return {
      kinds, rest, alive, vol: +vol.toFixed(5), removedVol: +removedVol.toFixed(5),
      ratio: +(vol / Math.max(1e-9, removedVol)).toFixed(3),
      maxDepth: +st.maxDepth.toFixed(3), meanDepth: +st.meanDepth.toFixed(4),
      openCells: st.openCells, cells: st.cells,
      coveredCells: covered, coveredArea: +(covered * CELL * CELL).toFixed(2),
      meanHeight: +(hsum / Math.max(1, covered)).toFixed(3), maxHeight: +hmax.toFixed(3),
      deepest, profile, topY: +(top - s.floorY).toFixed(3),
      dbg: window.__dbg,
      calls: e.renderer.info.render.calls, tris: e.renderer.info.render.triangles,
      poolsVisible: Object.entries(d.pools).filter(([, p]) => p.mesh.visible).map(([k]) => k),
    };
  }, setup);

  note(`WALL: maxDepth ${cen.maxDepth} · meanDepth ${cen.meanDepth} · ${cen.openCells}/${cen.cells} cells open`
    + ` · material removed ${(cen.removedVol * 1000).toFixed(1)} litres`);
  note(`SPAWNED: ${JSON.stringify(cen.dbg.made)} over ${cen.dbg.calls} burst calls`);
  {
    const ch = cen.dbg.chunks ?? [];
    note(`BIG CHUNKS: ${ch.length}`
      + (ch.length ? ` · w x h x t (m): ${ch.slice(0, 8).map((c) => `${c[1]}x${c[2]}x${c[3]}`).join(' · ')}`
        + (ch.length > 8 ? ` (+${ch.length - 8} more)` : '') : ' — no collapse fired in this drive'));
  }
  note(`RESTING: ${cen.rest} pieces of ${cen.alive} alive · `
    + Object.entries(cen.kinds).map(([k, v]) => `${k} ${v.rest}/${v.per}`).join(' · '));
  note(`ON THE FLOOR: ${(cen.vol * 1000).toFixed(1)} litres = ${(cen.ratio * 100).toFixed(0)}% of what left the wall`);
  note(`THE PILE: ${cen.coveredArea} m² covered · mean ${cen.meanHeight} m · PEAK ${cen.maxHeight} m`
    + ` at ${JSON.stringify(cen.deepest)}`);
  note(`PROFILE out from the face [m, pieces, peak]: ${JSON.stringify(cen.profile)}`);
  note(`biggest piece per kind: ${Object.entries(cen.kinds).map(([k, v]) => `${k} ${v.biggest} m`).join(' · ')}`);
  note(`pools drawing: ${cen.poolsVisible.join(',') || 'none'} · ${cen.calls} calls / ${cen.tris} tris at the dig station`);

  // ---- the pictures --------------------------------------------------------------------------
  await page.evaluate(() => { const e = window.__rrr.engine; if (e.cam) e.cam.pitch = -0.55; });
  await page.waitForTimeout(600);
  await shot('debris-10-floor-under-the-breach');
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const back = e.cam ? e.cam.yaw : p.aimYaw;
    p.pos.x -= Math.sin(back) * 2.4; p.pos.z -= Math.cos(back) * 2.4;
    if (e.cam) { e.cam.pitch = -0.22; e.cam._first = true; }
  });
  await page.waitForTimeout(700);
  await shot('debris-11-breach-and-pile');
  // a side-on look along the wall, which is the view the art's drift is drawn from
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const yaw = (e.cam ? e.cam.yaw : p.aimYaw);
    const sx = Math.cos(yaw), sz = -Math.sin(yaw);
    p.pos.x += sx * 2.6 + Math.sin(yaw) * 1.4;
    p.pos.z += sz * 2.6 + Math.cos(yaw) * 1.4;
    const ny = yaw - Math.PI / 2;
    p.aimYaw = ny; p.facing = ny;
    if (e.cam) { e.cam.yaw = ny; e.cam.pitch = -0.30; e.cam._first = true; }
  });
  await page.waitForTimeout(700);
  await shot('debris-12-drift-along-the-wall');

  // ---------------------------------------------------------------------------------------
  // 🚨 **FINISH THE DIG AND WALK THROUGH IT WITH THE DRIFT IN THE WAY.**
  //
  // The census above photographs a dug face; it does not answer the question that actually
  // gates this feature, which is whether the rubble we just dropped is standing in the hole.
  // `debris.js` is a look system and `pathPortals`/`room.collide` derive from `damagefield.js`,
  // so it CANNOT block by construction — but this project has already shipped one softlock
  // where the picture and the rule disagreed, and "it cannot by construction" is exactly the
  // sentence that shipped it. So: drop the barriers the way the game does, open the face, and
  // shove a body at it. ⚠️ The body test is `dig-free.mjs` F5's, deliberately — one instrument.
  // ---------------------------------------------------------------------------------------
  await page.keyboard.press('KeyB');
  await page.waitForTimeout(250);
  let opened = null;
  for (let i = 0; i < 90 && !opened; i++) {
    const r = await page.evaluate((id) => {
      const q = window.__rrr.engine.room.panelOf(id);
      const g = q.field;
      // aim at the shallowest cell in a body-wide window over the body's own height
      const cy1 = Math.min(g.rows - 1, Math.ceil(1.95 / g.cellH));
      const cx0 = Math.max(0, Math.round(g.cols * 0.5) - Math.ceil(0.45 / g.cellW));
      const cx1 = Math.min(g.cols - 1, Math.round(g.cols * 0.5) + Math.ceil(0.45 / g.cellW));
      let bx = cx0, by = 0, bd = 2;
      for (let cy = 0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const dd = g.depth[g.idx(cx, cy)];
          if (dd < bd) { bd = dd; bx = cx; by = cy; }
        }
      }
      q.applyHit(q.pointAt((bx + 0.5) / g.cols, (by + 0.5) / g.rows), 1);
      return { passable: !!q.passable?.() };
    }, setup.panel);
    if (r.passable) opened = i + 1;
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(2200);
  note(opened ? `[B] then ${opened} more blows -> the face is passable` : '[B] + 90 blows and the face never opened');

  // ---- does the pile block anything? ----------------------------------------------------------
  const block = await page.evaluate((s) => {
    const e = window.__rrr.engine, room = e.room;
    const panel = e.room.panelOf(s.panel);
    let colliders = 0;
    // debris is particle-only: nothing it spawns may appear in the collision or sight sets
    const boxes = room.colliderCensus ? room.colliderCensus() : null;
    const names = [];
    e.scene.traverse((o) => { if (o.isInstancedMesh && /debris/i.test(o.name || '')) colliders++; });
    const pair = panel.spec?.pair ?? null;
    let route = null;
    if (pair && room.pathPortals) {
      try { route = room.pathPortals(pair[0], pair[1], 0.68, 1.70)?.map?.((x) => x.id ?? x) ?? null; } catch (err) { route = 'threw: ' + err.message; }
    }
    // 🚨 the body test: shove a robot at the hole with the drift lying in front of it
    let past = null;
    if (panel.passable?.() && panel.openChannel) {
      const nn = panel.normal;
      const ch = panel.openChannel();
      const c0 = panel.pointAt(ch.centreU, 0.3);
      const V = e.room.anchor(s.anchor).constructor;
      const start = new V(c0.x + nn.x * 1.8, 0, c0.z + nn.z * 1.8);
      const pos = start.clone();
      for (let i = 0; i < 240; i++) {
        pos.x -= nn.x * 0.03; pos.z -= nn.z * 0.03;
        pos.copy(e.room.collide(pos, 0.34, 1.70));
      }
      past = +(((start.x - pos.x) * nn.x + (start.z - pos.z) * nn.z) - 1.8).toFixed(2);
    }
    return {
      colliders, boxes, names, pair, route, past,
      passable: !!panel.passable?.(),
      pileDepth: +(e.debris.pileDepth ?? 0).toFixed(3),
      pileCells: e.debris.pile?.size ?? 0,
      restCount: e.debris.restCount,
      calls: e.renderer.info.render.calls,
    };
  }, setup);
  note(`pathPortals for the dug pair ${JSON.stringify(block.pair)}: ${JSON.stringify(block.route)}`
    + ` · panel passable ${block.passable}`
    + (block.past === null ? '' : ` · a body shoved at the hole ended ${block.past} m past the face`));
  note(`pile after the breakthrough: ${block.restCount} pieces · ${block.pileCells} cells · peak ${block.pileDepth} m`
    + ` · ${block.calls} calls`);
  await page.waitForTimeout(300);
  await shot('debris-20-walk-through-the-rubble');

  // ---------------------------------------------------------------------------------------
  // 🧱 **THE BIG CHUNK, FRAME BY FRAME.** John: *"it falls off as one big chunk and has its own
  // physics bouncing off the wall and into the pile on the ground… I would like it to be
  // PASSABLE as that."* A canned tumble is judged by its TRAJECTORY, so a single still cannot
  // rule on it: this drops three plates off a known face and photographs the same fall at four
  // instants, which is the only way a critic can say whether it reads as simulated.
  // ---------------------------------------------------------------------------------------
  const drop = await page.evaluate((s) => {
    const e = window.__rrr.engine, p = e.player;
    const panel = e.room.panelOf(s.panel);
    const n = panel.normal;
    // stand back and to one side so the fall is seen in profile, which is where a tumble reads
    const c = panel.pointAt(0.5, 0.5);
    const tx = n.z, tz = -n.x;
    p.pos.set(c.x + n.x * 3.0 + tx * 1.5, p.pos.y, c.z + n.z * 3.0 + tz * 1.5);
    p.vel.set(0, 0, 0);
    const yaw = Math.atan2(c.x - p.pos.x, c.z - p.pos.z);
    p.aimYaw = yaw; p.facing = yaw;
    if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = -0.12; e.cam._first = true; }
    if (typeof e.debris.chunk !== 'function') return { ok: false };
    const made = [];
    for (let k = 0; k < 3; k++) {
      const at = panel.pointAt(0.34 + k * 0.16, 0.74 - k * 0.06);
      made.push(e.debris.chunk('slab', at, { w: 0.58, h: 0.44, t: 0.12, normal: n }));
    }
    return { ok: true, made, y: +panel.pointAt(0.5, 0.74).y.toFixed(2) };
  }, setup);
  if (!drop.ok) {
    skip('a big chunk falls as one piece', 'this build has no debris.chunk()');
  } else {
    for (const [ms, name] of [[130, 'a'], [200, 'b'], [260, 'c'], [420, 'd']]) {
      await page.waitForTimeout(ms);
      await shot(`debris-3${name}-chunk-falling`);
    }
    await page.waitForTimeout(2200);
    await shot('debris-3e-chunk-landed');
    const land = await page.evaluate((ids) => {
      const p = window.__rrr.engine.debris.pools.slab;
      return ids.map((i) => ({
        rest: !!p.rest[i], wallHits: p.whit[i], floorHits: p.hits[i],
        y: +p.py[i].toFixed(3),
        tilt: +Math.abs(p.rx[i] + Math.PI / 2).toFixed(2),
      }));
    }, drop.made);
    note(`BIG CHUNK FALL from y=${drop.y}: ${JSON.stringify(land)}`);
    const settled = land.filter((x) => x.rest).length;
    const bounced = land.filter((x) => x.wallHits > 0).length;
    settled === land.length
      ? pass('a big chunk falls as one piece and comes to rest', `${land.length}/${land.length} settled`)
      : fail('a big chunk falls as one piece and comes to rest', `${settled}/${land.length} settled`);
    bounced > 0
      ? pass('🧱 it catches the wall on the way down', `${bounced}/${land.length} chunks hit the face`)
      : fail('🧱 it catches the wall on the way down',
        'no chunk touched the wall — the sag never brought it back, so it dropped like a lift');

    /**
     * 🚨 **THIS CHECK USED TO READ THE THREE DROPPED PLATES AND IT PRODUCED A FALSE FAIL ON A
     * GOOD TREE — measured 2026-08-09 (`debris-4`), and fixing it is this project's own rule.**
     *
     * It was `max(tilt) - min(tilt) > 0.12` over the **three** chunks the block above drops. On
     * one run that read **0.69 rad and passed**; on the next, same build, same seed, same three
     * plates, it read **0.11 rad and FAILED** — the only difference being how much rubble was
     * already under them. HANDOFF's own case study is `_macro`'s *"n = 3 was a small sample and I
     * called it a strong signal"*, and this is the same error with the same sample size.
     *
     * 🎯 **THE POPULATION SAYS THE OPPOSITE AND IT IS NOT CLOSE** (`harness/_debris4-angles.mjs`,
     * the real system, five dig lengths): the share of resting slabs lying within 10 degrees of
     * flat is **18% at 4 blows, 11% at 16 and 4% at 63**, with p90 tilt 0.83 → 1.32 rad. The heap
     * has angular structure at every dig length, including a four-blow one. **A false positive in
     * a gate is worse than the bug it was written for**, so the assertion now reads a population
     * instead of three plates.
     *
     * ---------------------------------------------------------------------------------------
     * 🚨 **AND THE FIRST POPULATION IT READ WAS THE WRONG ONE — "every resting slab in the room"
     * IS NOT "the heap", AND THE GAP BETWEEN THEM IS THE WHOLE 33% THIS GATE USED TO FAIL ON.**
     * Diagnosed 2026-08-10 with `harness/scenarios/_debris5-pop.mjs`, which replays this drive
     * and breaks the census down by the two terms `debris.js`'s rest maths actually has.
     * ---------------------------------------------------------------------------------------
     * A slab's tilt is `restRot ± (0.32 + 1.75·onPile)`, plus a lean that fades linearly to
     * **exactly zero at `dw = 0.34` m** from the face. So the code deliberately lies a piece flat
     * when it came to rest alone on bare open floor — which is correct, and is what a chip that
     * skittered two metres away does. Live at `f.svc_e.1.b`, 63 blows + `[B]` + 90, **on the
     * build as it stood when this gate was failing** (i.e. before the `onBreak` fix below):
     *
     * | sub-population                     |   n | within 10° of flat |
     * |------------------------------------|-----|--------------------|
     * | every resting slab (the old gate)  | 338 |        32%         |
     * | `dw < 0.34` — the lean fires       | 189 |         6%         |
     * | `dw >= 0.34` — the lean is zero    | 149 |        61%         |
     * | landed on ≥ 0.10 m of rubble       | 255 |        16%         |
     * | landed on bare floor               |  83 |        68%         |
     *
     * With `onBreak` fixed the same drive reads **the heap 269 slabs at 16% flat** (sd 0.383,
     * p90 1.073) and **the scatter 70 slabs at 71% flat** — the fix moves about fourteen pieces
     * out of the scatter and into the drift, and moves the gated number not at all. That is the
     * point: the 33% was a population error, and the `onBreak` bug was a separate defect the
     * same census turned up. Neither one alone explains the other.
     *
     * `_debris4-angles.mjs` reads 4-11% because its synthetic dig fires **every blow at one point**
     * — its whole pile lands inside the lean's 0.34 m reach and on top of itself, and it never
     * models the scatter a moving crosshair throws across the floor. Neither number was wrong;
     * they were answers to different questions, and the gate was asking the one whose answer does
     * not mean what the check is named for.
     *
     * 🎯 **SO THE POPULATION IS THE HEAP: a slab with at least 0.10 m of rubble under it** — a
     * piece that is leaning on something, which is the reference's own sentence (*"pieces at every
     * angle leaning on each other"*). Pieces resting alone on the floor are counted and REPORTED
     * as the scatter, never gated: there is nothing for them to lean on.
     *
     * ⚠️ **THE CUT IS NOT A KNIFE EDGE, WHICH IS THE ONLY THING THAT SEPARATES A POPULATION FROM
     * A NUMBER CHOSEN TO PASS.** `_debris5-pop.mjs` was run with `DEBRIS_NOLEAN=1` —
     * `_debris4-angles.mjs`'s own arm, live, stripping the wall plane off every piece in flight so
     * the lean can never fire. Shipped vs that control, same drive, flat share over the heap:
     *
     * | rubble cut | shipped | NO-LEAN (pre-fix) | NO-LEAN (post-fix) |
     * |------------|---------|-------------------|--------------------|
     * |  ≥ 0.05 m  |   19%   |        30%        |         25%        |
     * |  ≥ 0.10 m  |   16%   |        28%        |         23%        |
     * |  ≥ 0.15 m  |   14%   |        27%        |         23%        |
     * |  ≥ 0.20 m  |   11%   |        24%        |         21%        |
     *
     * The shipped column moves 19 → 11 across the range and stays far under the bar throughout,
     * so **0.10 is a choice about wording and not about the answer** — which is what the cut had
     * to earn. ⚠️ **Do not narrow it to `dw < 0.34` as well**: that would select the population by
     * the very term under test. (It would also be a near no-op — almost every piece at the foot
     * of this face is on rubble anyway.)
     *
     * 🚨 **BUT READ THE THIRD COLUMN HONESTLY: THE 0.25 BAR DOES NOT CATCH THIS ABLATION.** It did
     * before the `onBreak` fix, by three points, and that was luck rather than design. **Killing
     * the lean outright is a single-term regression, not a collapse** — `onPile` alone still cocks
     * a piece on a 0.5 m drift — so it lands at 23% and slips under. What this gate reliably
     * catches is the rest maths going flat, not one of its two terms weakening; the statistic that
     * does separate the arms cleanly is the **mean tilt of the heap, 0.62 shipped against 0.46 in
     * both control runs**, and it is in the note below so a future round has the lever in hand.
     * ⚠️ **Do not tighten the bar to 0.20 to make the control fail.** The same drive reads 23% over
     * the heap after phase 1 alone (a 0.39 m drift has less to lean on than a 0.85 m one), so a
     * 0.20 bar buys a false FAIL on a good tree — which is the exact error this whole block exists
     * to record. If you want the lean itself gated, gate the mean, and validate it at BOTH phases.
     *
     * 🎯 **`sd` IS NOW ASSERTED, BECAUSE THE CHECK'S OWN NAME CLAIMS SOMETHING NOTHING TESTED.**
     * "Rests at every angle, NOT ONE" is a claim about a distribution, and a pile of slabs all
     * cocked at a constant 0.8 rad passes both `flat` and `p90` while being exactly the canned
     * tumble this exists to catch. It is a floor against a degenerate constant, not a sensitive
     * term: shipped reads 0.41 and even the no-lean control reads 0.31.
     *
     * ⚠️ The three-plate drop above STAYS: its job is the four trajectory FRAMES a critic needs
     * to rule on the tumble, and a still cannot show a trajectory. It just no longer gates.
     */
    const spread = await page.evaluate(() => {
      const d = window.__rrr.engine.debris;
      const p = d.pools.slab;
      const rest0 = p.def.restRot[0], rest1 = p.def.restRot[1];
      /** Metres of rubble a piece must have under it to count as part of the heap. */
      const ON_RUBBLE = 0.10;
      const heap = [], scatter = [];
      let behind = 0, planeless = 0;
      for (let i = 0; i < p.per; i++) {
        if (!p.alive[i] || !p.rest[i]) continue;
        const tilt = Math.hypot(p.rx[i] - rest0, p.rz[i] - rest1);
        // what it landed ON: the cell's height less the bulk this piece banked there itself.
        // ⚠️ `_pileAt` is read HERE and nowhere in the game — see `debris.js` above PILE_CELL:
        // the pile may never reach collision, sight or pathing. An instrument is not the game.
        const under = d._pileAt(p.px[i], p.pz[i]) - p.pdh[i];
        (under >= ON_RUBBLE ? heap : scatter).push(tilt);
        // 🚨 the regression guard for the `onBreak` defect: a piece that came off a wall may
        // never come to rest inside it. `wnx`/`wnz` is the plane; `dw < 0` is behind the face.
        if (p.wnx[i] === 0 && p.wnz[i] === 0) planeless++;
        else if (p.wnx[i] * p.px[i] + p.wnz[i] * p.pz[i] - p.wd[i] < -0.02) behind++;
      }
      const st = (t) => {
        if (!t.length) return null;
        t.sort((a, b) => a - b);
        const mean = t.reduce((a, b) => a + b, 0) / t.length;
        return {
          n: t.length,
          mean: +mean.toFixed(3),
          sd: +Math.sqrt(t.reduce((a, b) => a + (b - mean) ** 2, 0) / t.length).toFixed(3),
          p90: +t[Math.floor(0.9 * t.length)].toFixed(3),
          flat: +(t.filter((x) => x < 0.175).length / t.length).toFixed(3),
        };
      };
      return { heap: st(heap), scatter: st(scatter), behind, planeless };
    });
    if (!spread.heap) {
      skip('the heap rests at every angle, not one',
        `no slab came to rest on rubble (${spread.scatter?.n ?? 0} resting on bare floor)`);
    } else {
      const h = spread.heap, s = spread.scatter;
      // ⚠️ `mean` is the term that separates the shipped build from the no-lean control (0.62 vs
      // 0.46) where `flat` does not. It is reported and not gated — see the note above.
      note(`REST ANGLES · THE HEAP (${h.n} slabs on 0.10 m+ of rubble): mean ${h.mean} rad`
        + ` · sd ${h.sd} · p90 ${h.p90} · ${(h.flat * 100).toFixed(0)}% within 10 deg of flat`);
      note(`REST ANGLES · the scatter (${s ? s.n : 0} slabs resting alone on bare floor, NOT gated):`
        + (s ? ` mean ${s.mean} rad · sd ${s.sd} · ${(s.flat * 100).toFixed(0)}% flat` : ' none')
        + ' — a piece with nothing under it lies down, and that is the rest pose it should have');
      h.flat <= 0.25 && h.p90 >= 0.45 && h.sd >= 0.20
        ? pass('the heap rests at every angle, not one',
          `${(h.flat * 100).toFixed(0)}% flat, sd ${h.sd}, p90 ${h.p90} rad over ${h.n} pieces in the drift`)
        : fail('the heap rests at every angle, not one',
          `${(h.flat * 100).toFixed(0)}% of ${h.n} slabs in the drift lie within 10 deg of flat`
          + ` (sd ${h.sd}, p90 ${h.p90} rad)`
          + ' — a pile at one angle is the tell that gives a canned tumble away');
    }

    /**
     * 🚨 **NO SLAB MAY COME TO REST INSIDE THE WALL IT CAME OUT OF.** `debris.js` carries a wall
     * plane per piece for exactly this, and rounds 5 and 13 closed it on every spawn path but
     * one: `views/game.js` `onBreak` passed neither `normal` nor `wall`, and on 2026-08-10 this
     * drive found **20 of its 36 slabs resting up to 0.90 m behind the face**, drawn over by the
     * masonry. Fixed in `onBreak`; this is the guard, because "it cannot by construction" is the
     * sentence that shipped the last one.
     */
    spread.behind === 0 && spread.planeless === 0
      ? pass('🧱 nothing came off the wall and ended up inside it',
        `0 of ${spread.heap ? spread.heap.n + (spread.scatter?.n ?? 0) : 0} resting slabs are behind their own face`
        + ', and every one of them carries the face it came off')
      : fail('🧱 nothing came off the wall and ended up inside it',
        `${spread.behind} resting slabs are behind their own face and ${spread.planeless} carry no`
        + ' wall plane at all — a spawn path is not passing `wall: true` with its `normal`');
  }

  // ---- verdicts --------------------------------------------------------------------------------
  cen.rest >= 120
    ? pass('the floor carries a real pile', `${cen.rest} pieces resting`)
    : fail('the floor carries a real pile', `${cen.rest} pieces resting — the art is knee-deep`);

  cen.ratio >= 0.45
    ? pass('most of what left the wall is on the floor', `${(cen.ratio * 100).toFixed(0)}%`)
    : fail('most of what left the wall is on the floor',
      `${(cen.ratio * 100).toFixed(0)}% — ${(cen.removedVol * 1000).toFixed(0)} litres left the wall, `
      + `${(cen.vol * 1000).toFixed(0)} are lying there`);

  cen.maxHeight >= 0.30
    ? pass('the drift is knee-deep somewhere', `peak ${cen.maxHeight} m`)
    : fail('the drift is knee-deep somewhere', `peak ${cen.maxHeight} m — a robot's knee is ~0.45 m`);

  cen.coveredArea >= 1.6
    ? pass('the drift has a footprint, not a line', `${cen.coveredArea} m²`)
    : fail('the drift has a footprint, not a line', `${cen.coveredArea} m²`);

  if (!block.passable) {
    skip('the dug face is still passable with the pile in front of it', 'the drive never opened it');
  } else if (block.past === null) {
    skip('the dug face is still passable with the pile in front of it', 'no openChannel on this panel');
  } else if (block.past > 0.5) {
    pass('🚨 the rubble does not block the hole it came out of',
      `a body ended ${block.past} m past the face with ${block.restCount} pieces and a ${block.pileDepth} m drift`
      + ` in front of it · route ${JSON.stringify(block.route)}`);
  } else {
    fail('🚨 the rubble does not block the hole it came out of',
      `the face reports passable but a body only reached ${block.past} m past it`);
  }
}
