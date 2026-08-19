/**
 * 🔎 **DIAGNOSTIC — A LANDED BLOW ON AN ORDINARY BREACHABLE WALL PRODUCES NOTHING ON SCREEN.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_chunks6-blowfx.mjs \
 *        --port 5405 --q "seed=s4&dig=1"
 *
 * `critic-swing-2` measured `removed: 0.28, blocked: false` on a breachable wall and three
 * zoomed frames across contact with zero chip, dust or spark. So the hook fires and the numbers
 * are right; the break is downstream. This walks the chain one link at a time and reports which
 * link is broken, rather than inferring it:
 *
 *   panel.onChunk is a function  ->  it is CALLED  ->  debris.burst is called with a real kind,
 *   a real count and a real point  ->  burst SPAWNS (the pool exists)  ->  the pool's mesh is
 *   visible and its instances are near the impact.
 *
 * Every one of those fails in a different place and four of them are silent.
 */
export default async function blowfx({ page, note, pass, fail, skip, shot }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const census = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.room) return null;
    return {
      total: e.room.panels.length,
      hasDebris: !!e.debris,
      pools: Object.keys(e.debris?.pools ?? {}),
      rows: e.room.panels.map((p) => ({
        id: p.id,
        field: !!p.field,
        canOpen: !!p.canOpen?.(),
        stage: p.stage,
        onChunk: typeof p.onChunk,
        onBreak: typeof p.onBreak,
        damageable: !!p.state?.def?.damageable,
        health: p.state?.def?.health ?? -1,
      })),
    };
  });
  if (!census) { fail('the build is reachable', 'no engine.room'); return; }

  const wired = census.rows.filter((r) => r.onChunk === 'function');
  const scalar = census.rows.filter((r) => !r.field);
  const scalarWired = scalar.filter((r) => r.onChunk === 'function');
  note(`${census.total} panels · ${scalar.length} scalar (no damage field) · `
    + `${wired.length} with onChunk wired · ${scalarWired.length} of those are scalar`);
  note(`debris pools: ${census.pools.join(', ') || 'NONE'}`);
  for (const r of census.rows.slice(0, 8)) {
    note(`   ${r.id}: field=${r.field} canOpen=${r.canOpen} stage=${r.stage} `
      + `onChunk=${r.onChunk} damageable=${r.damageable} health=${r.health}`);
  }

  wired.length === census.total
    ? pass('every panel has the per-blow FX hook wired',
      `${wired.length}/${census.total}`)
    : fail('every panel has the per-blow FX hook wired',
      `${census.total - wired.length} of ${census.total} panels have onChunk = null — a blow on `
      + 'one of those returns correct numbers and spawns nothing');

  /**
   * The target: a damageable scalar panel — the critic's case exactly.
   *
   * ⚠️ **`canOpen()` IS FALSE ON ALL 22 OF THEM AND THAT IS NOT THE FILTER TO USE.** Measured on
   * the first run of this probe: every scalar panel in the house reports `canOpen=false` while
   * carrying `damageable=true, health=40`, i.e. `STAGE_DEFS`. "Breachable" in the critic's sense
   * is "the hammer takes health off it", which is `damageable` and a health short of a chained
   * connector's 999999 — not "it can reach a passable stage".
   */
  const target = scalar.find((r) => r.damageable && r.health < 9999);
  if (!target) {
    skip('a landed blow spawns debris at the impact', 'no breachable scalar panel in this house');
    return;
  }
  note(`target: ${target.id} (scalar, breachable, health ${target.health})`);

  const res = await page.evaluate((pid) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(pid);
    const calls = [];
    const d = e.debris, du = e.dust;
    const rb = d.burst.bind(d), rd = du?.burst?.bind(du);
    d.burst = (kind, at, n, o) => {
      const spawned = rb(kind, at, n, o);
      calls.push({ what: 'debris', kind, n, spawned, at: [+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2)] });
      return spawned;
    };
    if (rd) du.burst = (at, n, o) => { calls.push({ what: 'dust', n, at: [+at.x.toFixed(2), +at.y.toFixed(2), +at.z.toFixed(2)] }); return rd(at, n, o); };
    let info = null;
    const prev = p.onChunk;
    p.onChunk = (panel, i) => { info = { ...i, point: [+i.point.x.toFixed(2), +i.point.y.toFixed(2), +i.point.z.toFixed(2)], normal: [+i.normal.x.toFixed(2), +i.normal.y.toFixed(2), +i.normal.z.toFixed(2)] }; prev?.(panel, i); };

    const face = p.pointAt ? p.pointAt(0.5, 0.5) : p.root.position;
    const r = p.applyHit(face, 1);

    p.onChunk = prev; d.burst = rb; if (rd) du.burst = rd;
    const pools = Object.fromEntries(Object.entries(d.pools).map(([k, v]) =>
      [k, { live: v.liveCount, visible: v.mesh.visible }]));
    return {
      hookWasWired: typeof prev === 'function',
      applyHit: { removed: +r.removed.toFixed(4), blocked: r.blocked, brokeThrough: r.brokeThrough },
      info: info && { removed: +info.removed.toFixed(4), kind: info.kind, chunkSize: +info.chunkSize.toFixed(3), blocked: info.blocked, point: info.point, normal: info.normal },
      face: [+face.x.toFixed(2), +face.y.toFixed(2), +face.z.toFixed(2)],
      calls, pools,
      panelPos: [+p.root.position.x.toFixed(2), +p.root.position.y.toFixed(2), +p.root.position.z.toFixed(2)],
    };
  }, target.id);

  note(`applyHit -> ${JSON.stringify(res.applyHit)}`);
  note(`onChunk was wired by the view: ${res.hookWasWired}`);
  note(`onChunk info -> ${JSON.stringify(res.info)}`);
  note(`face point ${JSON.stringify(res.face)} · panel root ${JSON.stringify(res.panelPos)}`);
  note(`bursts (${res.calls.length}): ${JSON.stringify(res.calls)}`);
  note(`pools after: ${JSON.stringify(res.pools)}`);

  res.info
    ? pass('the hook fires on a landed blow', `kind ${res.info.kind}, chunkSize ${res.info.chunkSize}`)
    : fail('the hook fires on a landed blow', 'onChunk never ran');

  const spawnedTotal = res.calls.filter((c) => c.what === 'debris')
    .reduce((a, c) => a + (c.spawned ?? 0), 0);
  spawnedTotal > 0
    ? pass('the blow spawns debris instances', `${spawnedTotal} pieces across ${res.calls.length} bursts`)
    : fail('the blow spawns debris instances',
      `${res.calls.length} burst calls, 0 instances spawned — `
      + res.calls.map((c) => `${c.kind}:${c.spawned}`).join(' '));

  // and did anything reach the screen
  await page.waitForTimeout(200);
  const live = await page.evaluate(() => {
    const d = window.__rrr.engine.debris;
    const out = {};
    for (const [k, v] of Object.entries(d.pools)) {
      // where the live instances actually ARE — a burst that spawns at the wrong place is
      // indistinguishable in every other reading from a burst that never happened
      let at = null;
      for (let i = 0; i < v.per; i++) {
        if (v.alive[i]) { at = [+v.px[i].toFixed(2), +v.py[i].toFixed(2), +v.pz[i].toFixed(2), +v.sc[i].toFixed(2)]; break; }
      }
      out[k] = { live: v.liveCount, visible: v.mesh.visible, inScene: !!v.mesh.parent, at };
    }
    return out;
  });
  note(`pools 200 ms later: ${JSON.stringify(live)}`);
  const anyVisible = Object.values(live).some((v) => v.visible && v.live > 0 && v.inScene);
  anyVisible
    ? pass('a debris pool is live and in the scene after the blow', JSON.stringify(live))
    : fail('a debris pool is live and in the scene after the blow', JSON.stringify(live));

  /**
   * 🚨 **THE ONE THAT MATTERS: WHICH SIDE OF THE WALL DID THE PIECES SPAWN ON.**
   *
   * Every reading above was already correct while the critic photographed nothing, because a
   * burst that puts its pieces INSIDE the masonry counts, lives, draws and is invisible. So the
   * assertion is geometric: for each piece spawned by this blow, the signed distance from the
   * face along the wall's own normal, and the component of its velocity along that normal. Both
   * must be on the room's side. On a wall facing +z the old code passed this by accident, which
   * is exactly why it survived; on the ±x walls that are half this house it could not.
   */
  const frame = await page.evaluate((pid) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(pid);
    const d = e.debris;
    const at = p.pointAt(0.5, 0.5), n = p.normal;
    // snapshot the ring-buffer cursors, land a blow, read exactly the slots it wrote
    const before = Object.fromEntries(Object.entries(d.pools).map(([k, v]) => [k, v.next]));
    p.applyHit(at, 1);
    const out = [];
    for (const [k, v] of Object.entries(d.pools)) {
      let i = before[k];
      while (i !== v.next) {
        const dx = v.px[i] - at.x, dy = v.py[i] - at.y, dz = v.pz[i] - at.z;
        out.push({
          kind: k,
          alongN: +(dx * n.x + dy * n.y + dz * n.z).toFixed(3),
          velN: +(v.vx[i] * n.x + v.vy[i] * n.y + v.vz[i] * n.z).toFixed(3),
        });
        i = (i + 1) % v.per;
      }
    }
    return { n: [n.x, n.y, n.z], pieces: out };
  }, target.id);

  if (!frame || !frame.pieces.length) {
    skip('the pieces spawn on the room side of the wall', 'no pieces to inspect');
  } else {
    const minAlong = Math.min(...frame.pieces.map((q) => q.alongN));
    const inWall = frame.pieces.filter((q) => q.alongN < -0.02).length;
    const intoWall = frame.pieces.filter((q) => q.velN < 0).length;
    note(`wall normal ${JSON.stringify(frame.n)} · ${frame.pieces.length} pieces from one blow`);
    note(`   deepest piece ${minAlong} m along the normal · ${inWall} spawned inside the wall `
      + `· ${intoWall} moving into it`);
    inWall === 0 && intoWall === 0
      ? pass('the pieces spawn on the room side of the wall and move off it',
        `${frame.pieces.length} pieces, deepest ${minAlong} m along the face normal, none `
        + 'with a velocity into the masonry')
      : fail('the pieces spawn on the room side of the wall and move off it',
        `${inWall} of ${frame.pieces.length} spawned inside the wall, ${intoWall} moving into it`);
  }

  // and a picture of the contact point, which is the only thing that could have caught this
  await page.evaluate((pid) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(pid);
    const c = p.pointAt(0.5, 0.5), n = p.normal;
    e.player.pos.set(c.x + n.x * 1.9, e.room.floorY, c.z + n.z * 1.9);
    e.player.vel.set(0, 0, 0);
    e.player.facing = Math.atan2(-n.x, -n.z);
    if (e.cam) {
      e.cam.yaw = e.player.facing; e.cam.pitch = 0; e.cam.distance = 0.05;
      e.cam.hardMin = 0.02; e.cam.pinchMin = 0.02; e.cam._first = true;
    }
  }, target.id);
  await page.waitForTimeout(140);
  for (let k = 0; k < 4; k++) {
    await page.evaluate((pid) => {
      const p = window.__rrr.engine.room.panelOf(pid);
      p.applyHit(p.pointAt(0.5, 0.48), 1);
    }, target.id);
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(120);
  await shot('blowfx-contact');
  await page.waitForTimeout(900);
  await shot('blowfx-settled');
}
