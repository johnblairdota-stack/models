/**
 * 🕳️ THE INTERCONNECT — IS FINDING IT A SEARCH, OR A CHORE?
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/dig-link.mjs \
 *        --port 5271 --q "seed=s4&dig=1" --shots
 *
 * `docs/design/dig.md` §1 and §5. `dig-1` built the falloff and proved it monotone, and then
 * wrote down the honest limit of its own slice: **until the interconnect exists every dig is a
 * dud, so the falloff is validated as a FEEL and not as a SEARCH HEURISTIC.** This is the file
 * that closes that, and the question it has to answer is not "does the code work" — it is
 * *"how many bays and how many seconds does it cost to find the way through, and is that a
 * gamble or a grind?"*
 *
 * Six sections, in the order a player meets them:
 *
 *   L0  THE PLAN       one interconnect per shared edge, seeded, and INDISTINGUISHABLE while
 *                      closed — same aperture, same first four stages, same dressing draw.
 *   L1  THE SEARCH     dig bay after bay along one wall until one goes through. Bays and
 *                      seconds, on more than one seed, against the cost of one dud.
 *   L2  THE REVEAL     at the beam stage an ordinary segment has masonry behind it and the
 *                      interconnect has a room. That is the moment you learn what you bought.
 *   L3  BREAKTHROUGH   opening it opens the far side too, and the BFS gets a real route.
 *   L4  THE UNLOCK     one discovery drops every barrier in the house — and `?unlock=off`
 *                      proves the difference is the unlock and not the digging.
 *   L5  THE SEED       a different seed puts it somewhere else.
 *
 * ⚠️ THE CLOCK IS `run.t`, `dig-feel.mjs`'s reason: `Engine._liveLoop` clamps `dt` and a shader
 * compile inside one frame diverges wall time from world time.
 * ⚠️ IT REFUSES TO RUN ON THE ARM-OFF BUILD rather than reporting a vacuous green.
 */

const CAP = +(process.env.CAP ?? 45);
/** The wall face the search runs along: the service side of the west edge, nine bays. */
const FACE = process.env.FACE ?? 'svc_w|a';

export default async function digLink({ page, note, pass, fail, skip, shot }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 240; i++) {
      await page.waitForTimeout(45);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const head = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.room?.digCensus) return null;
    return { ...e.room.digCensus(), seed: String(e.run.seed), panels: e.room.panels.length };
  });
  if (!head) { fail('the build is reachable', 'no engine.room.digCensus'); return; }
  if (!head.on) { skip('the interconnect can be measured', 'this build is `?dig=0` — re-run with --q "dig=1"'); return; }
  note(`seed "${head.seed}" · ${head.segments} segments (${head.segmentH} m tall) on `
    + `${head.edges.join('+')} · ${head.brickStanding} brick slabs standing · unlock=${head.unlockMode}`);

  // =========================================================================
  // L0 · THE PLAN — one per edge, and nothing about it is visible while closed
  // =========================================================================
  const plan = await page.evaluate(async () => {
    const D = await import('/src/game/dig.js');
    const C = await import('/src/game/connectors.js');
    const e = window.__rrr.engine;
    const link = new Set(e.room.digCensus().link);
    const seg = e.room.panels.filter((p) => p.spec?.dig);
    const key = (d) => d ? `${d.chain ? 'C' : '-'}${d.seam ? 'S' : '-'}${d.boards ? 'B' : '-'}${d.mortar ? 'M' : '-'}` : '?';
    const row = (p) => ({
      id: p.id, edge: p.spec.edge, seg: p.spec.seg, side: p.spec.side,
      link: link.has(p.id),
      ap: `${p.width.toFixed(3)}x${p.height.toFixed(3)}x${p.thickness.toFixed(3)}`,
      // the first four rows of the table — everything the player can experience before the end
      tbl: p.state.defs.slice(0, 4).map((d) => `${d.name}:${d.health}:${d.blocksSight ? 1 : 0}`).join(','),
      last: p.state.defs[p.state.defs.length - 1].name,
      canOpen: p.state.canOpen(),
      dress: key(e.exterior?.dressingOf?.(p.id)),
      brick: !!e.room.digCensus().brickStanding,
    });
    // is the interconnect a pure function of the seed, and one per edge?
    const perEdge = {};
    for (const id of link) { const m = /^d\.(.+)\.(\d+)\.(a|b)$/.exec(id); perEdge[m[1]] ??= new Set(); perEdge[m[1]].add(m[2]); }
    return {
      rows: seg.map(row),
      perEdge: Object.fromEntries(Object.entries(perEdge).map(([k, v]) => [k, [...v]])),
      byId: D.interconnectIds(e.run.seed),
      declared: [...link],
      dressed: seg.map((p) => key(e.exterior?.dressingOf?.(p.id))),
      hasDressing: !!e.exterior?.dressingOf,
      connW: C.CONNECTOR_W,
    };
  });

  const perEdgeOK = Object.values(plan.perEdge).every((v) => v.length === 1)
    && Object.keys(plan.perEdge).length === head.edges.length;
  perEdgeOK
    ? pass('one hidden interconnect per shared edge, seeded',
      Object.entries(plan.perEdge).map(([e2, v]) => `${e2}#${v[0]}`).join(' · ')
      + ` — derived from the run seed alone (${plan.byId.join(' ')})`)
    : fail('one hidden interconnect per shared edge, seeded', JSON.stringify(plan.perEdge));

  const links = plan.rows.filter((r) => r.link);
  const duds = plan.rows.filter((r) => !r.link);
  const apSame = new Set(plan.rows.map((r) => r.ap)).size === 1;
  const tblSame = new Set(plan.rows.map((r) => r.tbl)).size === 1;
  const onlyEnd = new Set(links.map((r) => r.last)).size === 1 && links[0]?.last === 'open'
    && new Set(duds.map((r) => r.last)).size === 1 && duds[0]?.last === 'barrier';
  (apSame && tblSame && onlyEnd)
    ? pass('the interconnect is indistinguishable from a dud until the last row of the table',
      `all ${plan.rows.length} segments share one aperture (${plan.rows[0].ap}) and one four-stage `
      + `table (${plan.rows[0].tbl}); the ONLY difference is the terminal row — `
      + `${links.length} "open" against ${duds.length} "barrier"`)
    : fail('the interconnect is indistinguishable from a dud until the last row of the table',
      `apertures ${new Set(plan.rows.map((r) => r.ap)).size}, tables ${new Set(plan.rows.map((r) => r.tbl)).size}, `
      + `terminals link=${[...new Set(links.map((r) => r.last))]} dud=${[...new Set(duds.map((r) => r.last))]}`);

  // 🚨 THE DRESSING TELL — the one `procedural-map.md` §2 forbids outright.
  if (!plan.hasDressing) {
    fail('a segment wears the same hardware as every other segment', 'no exterior dressing in this build');
  } else {
    const dressedSeg = plan.dressed.filter((d) => d !== '----').length;
    const linkDress = links.map((r) => r.dress);
    const twins = links.map((r) => duds.filter((q) => q.dress === r.dress).length);
    dressedSeg > 0 && twins.every((n) => n > 0)
      ? pass('a segment wears the same hardware as every other segment',
        `${dressedSeg}/${plan.rows.length} segments are dressed this seed; the interconnect wears `
        + linkDress.map((d, i) => `"${d}" (shared with ${twins[i]} duds)`).join(' and '))
      : fail('a segment wears the same hardware as every other segment',
        `${dressedSeg} dressed of ${plan.rows.length}; interconnect ${linkDress} shared with ${twins}`);
  }

  // =========================================================================
  // staging + the driver
  // =========================================================================
  const stageAt = (id, d) => page.evaluate(([id, d]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    if (!p) return null;
    const n = p.normal, c = p.root.position;
    e.player.pos.set(c.x + n.x * d, e.room.floorY, c.z + n.z * d);
    e.player.vel.set(0, 0, 0);
    const yaw = Math.atan2(-n.x, -n.z);
    e.player.aimYaw = yaw; e.player.aimPitch = 0; e.player.facing = yaw;
    e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true;
    for (const s of ['shoulderR', 'shoulderL', 'hipR', 'hipL']) {
      if (e.player.rig.occupant(s) === 'empty') e.player.rig.refit?.(s);
    }
    e.hunter.root.position.copy(e.room.spawn.hunter);
    e.hunter.vel.set(0, 0, 0);
    e.hunter.state = 'PATROL'; e.hunter.target = null; e.hunter.awareness = 0;
    e.hunter.breachTarget = null; e.hunter.lastKnown.copy(e.room.spawn.hunter);
    e.hunter.resetCombat?.();
    return { id, stage: p.state.stage };
  }, [id, d]);

  const read = (id) => page.evaluate((id) => {
    const e = window.__rrr.engine, p = e.room.panelOf(id);
    return {
      t: +e.run.t.toFixed(2), stage: p.state.stage, name: p.state.def.name,
      blocks: p.blocksMovement(), sight: p.blocksSight(), dmgable: p.state.isDamageable(),
      limbs: ['shoulderR', 'shoulderL', 'hipR', 'hipL']
        .filter((s) => e.player.rig.occupant(s) !== 'empty').length,
    };
  }, id);

  /** Hold the trigger on one bay until it stops advancing. Seconds on `run.t`. */
  async function digBay(id, d = 2.2) {
    if (!(await stageAt(id, d))) return null;
    await step(4);
    const t0 = (await read(id)).t;
    await page.mouse.down();
    const f0 = await frames();
    const FRAME_CAP = Math.ceil(CAP * 62) + 600;
    let why = 'terminal', r = null;
    for (;;) {
      r = await read(id);
      if (!r.blocks) { why = 'opened'; break; }
      if (!r.dmgable) break;
      if (r.limbs === 0) { why = 'torn apart'; break; }
      if (r.t - t0 >= CAP) { why = `${CAP}s cap`; break; }
      if ((await frames()) - f0 > FRAME_CAP) { why = 'frame cap'; break; }
      await step(3);
    }
    await page.mouse.up();
    const end = await read(id);
    return { id, why, secs: +(end.t - t0).toFixed(2), end };
  }

  /** Put the house back to pristine and re-plan it as if `seed` had been rolled. */
  const replan = (seed) => page.evaluate(async (seed) => {
    const D = await import('/src/game/dig.js');
    const e = window.__rrr.engine;
    for (const p of e.room.panels) if (p.spec?.dig) p.state.reset();
    const link = D.interconnectIds(seed);
    e.room.setDigPlan({ link });
    return { link, census: e.room.digCensus() };
  }, seed);

  const faceOf = (edge, side) => plan.rows
    .filter((r) => r.edge === edge && r.side === side)
    .sort((a, b) => a.seg - b.seg);

  // =========================================================================
  // L1 · THE SEARCH — bay after bay along one wall until one goes through
  // =========================================================================
  const [edgeId, sideId] = FACE.split('|');
  const results = [];
  for (const seed of ['s4', 'search-b', 'search-c']) {
    const rp = await replan(seed);
    const want = rp.link.find((id) => id.startsWith(`d.${edgeId}.`) && id.endsWith(`.${sideId}`));
    const face = faceOf(edgeId, sideId);
    const target = want ? +/\.(\d+)\.[ab]$/.exec(want)[1] : -1;
    let secs = 0, bays = 0, found = null;
    for (const bay of face) {
      const r = await digBay(bay.id);
      if (!r) continue;
      bays++; secs += r.secs;
      if (r.why === 'opened') { found = bay.seg; break; }
    }
    results.push({ seed, target, found, bays, secs: +secs.toFixed(2), face: face.length });
    note(`seed "${seed}" · the way through is bay ${target} of ${face.length} on ${edgeId}/${sideId}`
      + ` · dug ${bays} bays, ${secs.toFixed(2)} s of held trigger`
      + (found === target ? ` — through at bay ${found}` : ` — NOT FOUND (${found})`));
    if (seed === 's4') await shot('dig-link-found');
  }

  const allFound = results.every((r) => r.found === r.target && r.target >= 0);
  const perDud = results.map((r) => (r.bays > 1 ? (r.secs - 0) / r.bays : r.secs));
  allFound
    ? pass('the interconnect is reachable and it is the ONLY thing on the wall that is',
      results.map((r) => `${r.seed}: bay ${r.found}/${r.face} after ${r.bays} bays, ${r.secs} s`).join(' · '))
    : fail('the interconnect is reachable and it is the ONLY thing on the wall that is',
      JSON.stringify(results));

  const spread = results.map((r) => r.secs);
  const same = new Set(results.map((r) => r.target)).size;
  same > 1
    ? pass('the answer moves with the seed, so the wall cannot be memorised',
      `${results.map((r) => `${r.seed}->bay ${r.target}`).join(', ')} — `
      + `${Math.min(...spread).toFixed(1)}-${Math.max(...spread).toFixed(1)} s of digging to find it, `
      + `about ${(perDud.reduce((a, b) => a + b, 0) / perDud.length).toFixed(1)} s a bay`)
    : note(`⚠️ all ${results.length} sampled seeds chose bay ${results[0].target} on this face — `
      + `not necessarily wrong (see the 512-seed sweep) but this run cannot claim variety`);

  // =========================================================================
  // L2 · THE REVEAL — brick behind a dud, a room behind the answer
  // =========================================================================
  await replan('s4');
  const face = faceOf(edgeId, sideId);
  const linkSeg = +/\.(\d+)\.[ab]$/.exec(
    (await page.evaluate(() => window.__rrr.engine.room.digCensus().link))
      .find((id) => id.startsWith(`d.${edgeId}.`) && id.endsWith(`.${sideId}`)))[1];
  const dudSeg = face.find((r) => r.seg !== linkSeg)?.seg;

  /**
   * ⚠️ **THE FIRST VERSION OF THIS ASKED THE WRONG SYSTEM AND FAILED HONESTLY.** It tested
   * `room.blocksSight()` across the wall and got `false` on BOTH — because behind the
   * interconnect stands the far side's own pristine panel, which is a collider like any other.
   * The reveal is not a SIGHTLINE, it is what is physically there, and the two are different
   * channels: what is 7.5 cm behind the studs of a dud is masonry that nothing in the game can
   * ever remove, and what is 15 cm behind the studs of the interconnect is the other room's
   * finish — a wall, but a wall with a table that ends at `open`.
   *
   * (The RENDER does see through, for free and by construction: the twin's layer planes are
   * `FrontSide` facing into ITS own room, so from this side the aperture is empty and you are
   * looking into `study_w`. That is a look claim, so it is left to the screenshots below and to
   * a critic, not asserted from a raycast.)
   */
  const beamProbe = async (segIdx, tag) => {
    const id = `d.${edgeId}.${segIdx}.${sideId}`;
    await page.evaluate(([id]) => {
      const e = window.__rrr.engine, p = e.room.panelOf(id);
      p.state.setStage(3);                       // the beam stage: blocksSight false
      const n = p.normal, c = p.root.position;
      e.player.pos.set(c.x + n.x * 2.0, e.room.floorY, c.z + n.z * 2.0);
      const yaw = Math.atan2(-n.x, -n.z);
      e.player.aimYaw = yaw; e.player.aimPitch = 0; e.player.facing = yaw;
      e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true;
    }, [id]);
    await step(12);
    await shot(tag);
    return page.evaluate(([id]) => {
      const e = window.__rrr.engine, p = e.room.panelOf(id);
      const V = e.player.pos.constructor;
      const n = p.normal, c = p.root.position;
      // start just PAST this panel's own plane and look on into the wall
      const from = new V(c.x - n.x * 0.01, 0.9, c.z - n.z * 0.01);
      const dir = new V(-n.x, 0, -n.z);
      const hit = e.room.castRay(from, dir, 1.2);
      return {
        id, stage: p.state.stage, blocksSight: p.blocksSight(),
        behind: hit ? (hit.panel ? `panel ${hit.panel.id}` : 'static masonry') : 'nothing',
        dist: hit ? +hit.distance.toFixed(3) : null,
        removable: hit ? (hit.panel ? hit.panel.state.canOpen() : false) : true,
      };
    }, [id]);
  };
  const dudBeam = await beamProbe(dudSeg, 'dig-link-beam-dud');
  const linkBeam = await beamProbe(linkSeg, 'dig-link-beam-answer');
  note(`at the beam stage — dud ${dudBeam.id}: ${dudBeam.behind} at ${dudBeam.dist} m `
    + `(removable ${dudBeam.removable}) · answer ${linkBeam.id}: ${linkBeam.behind} at `
    + `${linkBeam.dist} m (removable ${linkBeam.removable})`);
  (!dudBeam.removable && linkBeam.removable && dudBeam.behind === 'static masonry')
    ? pass('the BEAM stage is where you learn what you bought',
      `the last and most expensive stage puts masonry ${dudBeam.dist} m behind the studs of a dud `
      + `— static, undamageable, no id, nothing in the game removes it — and the far room's own `
      + `finish ${linkBeam.dist} m behind the studs of the answer. Brick, or a way on.`)
    : fail('the BEAM stage is where you learn what you bought',
      `dud ${dudBeam.behind}/${dudBeam.removable} · link ${linkBeam.behind}/${linkBeam.removable}`);

  // =========================================================================
  // L3 · BREAKTHROUGH — one hole, not two, and the graph agrees with the world
  // =========================================================================
  await replan('s4');
  const linkId = `d.${edgeId}.${linkSeg}.${sideId}`;
  const twinId = linkId.replace(/\.(a|b)$/, (m, s) => `.${s === 'a' ? 'b' : 'a'}`);
  const before = await page.evaluate(([a, b]) => {
    const e = window.__rrr.engine;
    const A = e.room.panelOf(a), B = e.room.panelOf(b);
    return {
      route: e.room.pathPortals(A.spec.a, A.spec.b).map((p) => p.id),
      twinStage: B.state.stage, twinBlocks: B.blocksMovement(),
      unlocked: e.room.digCensus().unlocked,
    };
  }, [linkId, twinId]);
  const dug = await digBay(linkId);
  const after = await page.evaluate(([a, b]) => {
    const e = window.__rrr.engine;
    const A = e.room.panelOf(a), B = e.room.panelOf(b);
    // walk a body at it, from A's room, and see whether it ends up in B's
    const n = A.normal, c = A.root.position;
    e.player.pos.set(c.x + n.x * 1.6, e.room.floorY, c.z + n.z * 1.6);
    let last = null;
    for (let i = 0; i < 200; i++) {
      const p = e.player.pos;
      const q = { x: p.x - n.x * 0.06, y: p.y, z: p.z - n.z * 0.06 };
      const v = new (e.player.pos.constructor)(q.x, q.y, q.z);
      const r = e.room.collide(v, e.player.radius, 1.70);
      e.player.pos.copy(r);
      last = e.room.spaceAt(e.player.pos)?.id ?? last;
    }
    return {
      aStage: A.state.stage, aBlocks: A.blocksMovement(),
      twinStage: B.state.stage, twinBlocks: B.blocksMovement(),
      route: e.room.pathPortals(A.spec.a, A.spec.b).map((p) => p.id),
      from: A.spec.a, to: A.spec.b, endedIn: last,
      walkedTo: [+e.player.pos.x.toFixed(2), +e.player.pos.z.toFixed(2)],
      census: e.room.digCensus(),
    };
  }, [linkId, twinId]);
  note(`breakthrough at ${linkId} in ${dug?.secs} s (${dug?.why}) — route ${before.route.length}`
    + ` -> ${after.route.length} portals, twin ${before.twinStage}->${after.twinStage}`);
  (!after.aBlocks && !after.twinBlocks && after.route.includes(linkId) && after.endedIn === after.to)
    ? pass('breaking through makes ONE hole, and it is a route a body can use',
      `both faces of ${linkId.replace(/\.(a|b)$/, '')} open together (the twin went `
      + `${before.twinStage}->${after.twinStage} without being shot), the BFS gains the edge, and a body `
      + `pushed at it walked from ${after.from} into ${after.to}`)
    : fail('breaking through makes ONE hole, and it is a route a body can use',
      JSON.stringify({ aBlocks: after.aBlocks, twinBlocks: after.twinBlocks,
        route: after.route, endedIn: after.endedIn, want: after.to }));

  // =========================================================================
  // L4 · THE UNLOCK — one discovery, every barrier
  // =========================================================================
  const un = after.census;
  note(`after the breakthrough: unlocked=${un.unlocked} (${un.unlockMode}) by ${un.unlockedBy}`
    + ` · segments that can now open ${un.linkCount}/${un.segments}`
    + ` · brick standing ${un.brickStanding}/${un.segments}`);
  /**
   * ⚠️ **THE EXPECTED COUNTS ARE DERIVED, NOT WRITTEN DOWN, BECAUSE THE FIRST VERSION GOT BOTH
   * NON-DEFAULT ARMS WRONG AND FAILED WORKING CODE.** `?unlock=edge` came back with 20 openable
   * segments against a hand-written 18 — the 18 on the opened edge PLUS the OTHER edge's own
   * interconnect, which was already on the open table and never stopped being. And `?unlock=off`
   * came back with 4 against a hand-written 2: there is one interconnect per edge and each has
   * two faces. Both were the probe, not the build.
   */
  const mode = un.unlockMode;
  const linkOff = un.link.filter((id) => !un.openedEdges.some((e2) => id.startsWith(`d.${e2}.`))).length;
  const onOpened = mode === 'global' ? un.segments
    : (un.segments / head.edges.length) * un.openedEdges.length;
  const want = onOpened + linkOff;
  if (mode === 'off') {
    (un.linkCount === un.link.length && !un.unlocked && un.brickStanding === un.segments - un.link.length)
      ? pass('`?unlock=off` is the control arm and the barrier never lifts',
        `${un.linkCount} of ${un.segments} segments can open — the two faces of each edge's own `
        + `interconnect and nothing else — and ${un.brickStanding} brick slabs are still standing. `
        + `This is the pre-interconnect build, so dig-1's figures still re-run.`)
      : fail('`?unlock=off` is the control arm and the barrier never lifts', JSON.stringify(un));
  } else {
    const wantBrick = un.segments - want;
    (un.unlocked && un.linkCount === want && un.brickStanding === wantBrick)
      ? pass(`the house-wide unlock fires on discovery (${mode})`,
        `${un.linkCount}/${un.segments} segments can now reach a passable stage where `
        + `${un.link.length} could before, and ${un.segments - un.brickStanding} of the `
        + `${un.segments} brick slabs are gone. Opened edges: ${un.openedEdges.join('+')}`)
      : fail(`the house-wide unlock fires on discovery (${mode})`,
        JSON.stringify({ unlocked: un.unlocked, canOpen: un.linkCount, want,
          brick: un.brickStanding, wantBrick }));
  }

  // A segment that was ALREADY at the barrier when the unlock fired must become a hole — that is
  // John's "players can continue digging", and the work you already paid for turning into a door.
  const carried = await page.evaluate(async ([edgeId, sideId, dudSeg]) => {
    const D = await import('/src/game/dig.js');
    const e = window.__rrr.engine;
    for (const p of e.room.panels) if (p.spec?.dig) p.state.reset();
    e.room.setDigPlan({ link: D.interconnectIds('s4') });
    const dud = e.room.panelOf(`d.${edgeId}.${dudSeg}.${sideId}`);
    dud.state.setStage(4);                                  // dug all the way: BARRIER
    const wasBlocking = dud.blocksMovement();
    const wasName = dud.state.def.name;
    e.room.unlockBarrier();
    return { wasBlocking, wasName, nowBlocking: dud.blocksMovement(), nowName: dud.state.def.name,
      spent: dud.spent, census: e.room.digCensus() };
  }, [edgeId, sideId, dudSeg]);
  if (mode === 'off') {
    // ⚠️ NOT A SKIP DRESSED AS A PASS: in this arm the correct answer is that it stays a wall,
    // and that is what the control arm exists to show. Asserted the other way round.
    carried.wasBlocking && carried.nowBlocking
      ? pass('`?unlock=off`: a dud you dug to the bottom stays a wall, which is the control',
        `${carried.wasName} -> ${carried.nowName}; \`unlockBarrier()\` was called and refused`)
      : fail('`?unlock=off`: a dud you dug to the bottom stays a wall, which is the control',
        JSON.stringify(carried));
  } else {
    (carried.wasBlocking && !carried.nowBlocking)
      ? pass('a dud you had already dug to the bottom becomes a door when the barrier lifts',
        `${carried.wasName} -> ${carried.nowName} on the same frame, with no further damage — and it `
        + `stays demoted (spent=${carried.spent}), so 36 finished segments cannot cost 36 stacks`)
      : fail('a dud you had already dug to the bottom becomes a door when the barrier lifts',
        JSON.stringify(carried));
  }
}
