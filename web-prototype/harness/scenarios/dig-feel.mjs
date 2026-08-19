/**
 * DIG — WHAT DOES A DIG FEEL LIKE IN STAGES AND SECONDS, AND CAN YOU MEET IN THE MIDDLE?
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/dig-feel.mjs \
 *        --port 5244 --q "seed=s4&dig=1" --shots
 *
 * `docs/design/dig.md` §5. Three questions, and the third is the one that decides whether the
 * design survives contact with two players:
 *
 *   1. THE FALLOFF — big chunks shallow, chips deep. Measured as seconds per stage with the
 *      trigger held, against an ordinary `BREACHABLE` panel driven by the same driver at the
 *      same station in the same page, so "a dud dig is expensive" is a ratio and not an opinion.
 *   2. THE BARRIER — a segment that bottoms out is visible, impassable and undamageable, and it
 *      is not a graph edge. Proved by continuing to fire at it.
 *   3. YOU CANNOT MEET IN THE MIDDLE — both sides of ONE segment driven to the barrier, then
 *      every route the engine has (portals, BFS, collision, sight, the damage ray) asked whether
 *      anything got through.
 *
 * ⚠️ THE CLOCK IS `run.t`, NOT WALL TIME — `eo2-siege.mjs`'s reason: `Engine._liveLoop` clamps
 * `dt`, and a shader compile inside one frame diverges the two. And the FRAME cap is the one
 * that always fires, because `RunState.tick()` freezes `run.t` the moment the run ends.
 *
 * ⚠️ IT REFUSES TO RUN ON THE ARM-OFF BUILD RATHER THAN QUIETLY MEASURING NOTHING. `?dig=1` is
 * default off; without it there are no segments and every assertion below would be vacuous.
 * A vacuous green is the failure class this harness exists to prevent.
 */

const CAP = +(process.env.CAP ?? 40);
/** Mid-passage, in the long span, service side. Its twin is `.b`, in the west study. */
const SEG = process.env.SEG ?? 'd.svc_w.4.a';
const TWIN = SEG.replace(/\.a$/, '.b');
/** The shipped BREACHABLE panel in the same wall — the control the ratio is against. */
const PLAIN = process.env.PLAIN ?? 'p.svc_w.n';

export default async function digFeel({ page, note, pass, fail, skip, shot }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 200; i++) {
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
    return { ...e.room.digCensus(), panels: e.room.panels.length, seed: String(e.run.seed) };
  });
  if (!head) { fail('the build is reachable', 'no engine.room.digCensus'); return; }
  if (!head.on) {
    skip('a dig can be measured', 'this build is `?dig=0` — re-run with --q "dig=1"');
    return;
  }
  note(`seed "${head.seed}" · ${head.panels} panels (${head.segments} dig segments on `
    + `${head.edges.join('+')}, ${head.others} shipped) · ${head.barriers} brick slabs`);

  // -------------------------------------------------------------------------- staging
  //
  // Park the player square in front of a panel's face at `d` metres, hunter parked at spawn so
  // it cannot wander into the measurement, limbs on so the body can hold a gun.
  const stageAt = (id, d) => page.evaluate(([id, d]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    if (!p) return null;
    // Which side is the player on? The panel's own normal points into the room that owns its
    // layer stack, and that is the only side its face can be read or dug from.
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
    e.hunter.routeIdx = 0; e.hunter.dwellLeft = null; e.hunter.searchTimer = 0;
    e.hunter.breachTarget = null; e.hunter.lastKnown.copy(e.room.spawn.hunter);
    e.hunter.resetCombat?.();
    e.run.reset();
    for (const q of ['rrr-death', 'rrr-escape']) document.getElementById(q)?.remove();
    e.gameHud?.setHidden?.(false);
    return {
      id, stage: p.state.stage, name: p.state.def.name,
      healths: p.state.defs.map((x) => x.health),
      total: p.state.defs.slice(0, 4).reduce((a, x) => a + x.health, 0),
      w: +p.width.toFixed(2), h: +p.height.toFixed(2), t: +p.thickness.toFixed(3),
      at: [+c.x.toFixed(2), +c.z.toFixed(2)],
      from: [+e.player.pos.x.toFixed(2), +e.player.pos.z.toFixed(2)],
    };
  }, [id, d]);

  const read = (id) => page.evaluate((id) => {
    const e = window.__rrr.engine, p = e.room.panelOf(id);
    return {
      t: +e.run.t.toFixed(2), stage: p.state.stage, name: p.state.def.name,
      hp: +(p.state.stageHealth ?? 0).toFixed(0),
      blocks: p.blocksMovement(), shots: p.blocksProjectile(), sight: p.blocksSight(),
      dmgable: p.state.isDamageable(), canOpen: p.state.canOpen(),
      limbs: ['shoulderR', 'shoulderL', 'hipR', 'hipL']
        .filter((s) => e.player.rig.occupant(s) !== 'empty').length,
    };
  }, id);

  /** Hold the trigger until the panel stops advancing. Returns a stage->seconds map. */
  async function dig(id, d = 2.2) {
    const s0 = await stageAt(id, d);
    if (!s0) return null;
    await step(4);
    const t0 = (await read(id)).t;
    await page.mouse.down();
    const f0 = await frames();
    const FRAME_CAP = Math.ceil(CAP * 62) + 600;
    const at = {}; let last = null, why = 'terminal';
    for (;;) {
      const r = await read(id);
      if (last !== r.stage) { at[r.stage] = +(r.t - t0).toFixed(2); last = r.stage; }
      // ⚠️ `!blocks` IS TESTED FIRST AND THE ORDER IS THE WHOLE DIFFERENCE. `damageable` is false
      // at BOTH terminals — `open` and `barrier` — so testing it first reports an ordinary panel
      // that fell over as "terminal" and the control ratio silently never fires.
      if (!r.blocks) { why = 'opened'; break; }
      if (!r.dmgable) break;                  // barrier: nothing more can be done to it
      if (r.limbs === 0) { why = 'torn apart'; break; }
      if (r.t - t0 >= CAP) { why = `${CAP}s cap`; break; }
      if ((await frames()) - f0 > FRAME_CAP) { why = 'frame cap (the run clock stopped)'; break; }
      await step(3);
    }
    await page.mouse.up();
    const end = await read(id);
    return { ...s0, at, why, secs: +(end.t - t0).toFixed(2), end };
  }

  // ======================================================================= 0 · THE WALL
  // ⚠️ THE "BEFORE" PICTURE HAS TO BE TAKEN BEFORE, and it is the one that shows the actual
  // design question: a continuous run of identical bays with the answer somewhere inside it.
  await page.evaluate(() => {
    const e = window.__rrr.engine;
    e.player.pos.set(0.9, e.room.floorY, -12.6);
    e.player.vel.set(0, 0, 0);
    const yaw = Math.atan2(-1, -0.55);
    e.player.aimYaw = yaw; e.player.aimPitch = 0; e.player.facing = yaw;
    e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true;
  });
  await step(20);
  await shot('dig-wall-pristine');

  // ======================================================================= 1 · THE FALLOFF
  const seg = await dig(SEG);
  if (!seg) { fail('a dig can be measured', `no panel "${SEG}" in this build`); return; }
  const perStage = [];
  for (let s = 1; s <= 4; s++) {
    if (seg.at[s] == null) continue;
    perStage.push(`${['wallpaper', 'plaster', 'lath', 'beam'][s - 1]} ${(seg.at[s] - (seg.at[s - 1] ?? 0)).toFixed(2)}s`);
  }
  note(`SEGMENT ${seg.id} (${seg.w} x ${seg.h} x ${seg.t} m, ${seg.total} hp) at ${seg.at[4] != null
    ? `BARRIER in ${seg.at[4].toFixed(2)} s` : `${seg.end.name} after ${seg.secs} s (${seg.why})`}`);
  note(`  per stage: ${perStage.join(' · ')}   [stage marks ${Object.entries(seg.at)
    .map(([k, v]) => `${k}@${v}s`).join(' ')}]`);
  await shot('dig-segment-barrier');

  const plain = await dig(PLAIN, 2.6);
  if (plain) {
    note(`CONTROL ${plain.id} — a shipped BREACHABLE panel, same driver, same wall `
      + `(${plain.total} hp): ${plain.why === 'opened' ? `OPEN in ${plain.secs} s` : `${plain.end.name} after ${plain.secs} s (${plain.why})`}`);
  }

  if (seg.at[4] == null) {
    fail('a dig bottoms out at the barrier', `${seg.id} reached "${seg.end.name}" after ${seg.secs} s (${seg.why})`);
  } else if (plain && plain.why === 'opened' && plain.secs > 0.05) {
    const ratio = seg.at[4] / plain.secs;
    pass('a dud dig costs real time — an expensive dud finally exists',
      `${seg.at[4].toFixed(2)} s to the barrier against ${plain.secs} s to breach an ordinary `
      + `panel on the same wall: x${ratio.toFixed(1)}`);
  } else {
    pass('a dig bottoms out at the barrier', `${seg.at[4].toFixed(2)} s of held trigger`);
  }

  // The falloff itself: each stage must cost MORE than the one in front of it.
  const durs = [1, 2, 3, 4].map((s) => (seg.at[s] != null && seg.at[s - 1] != null)
    ? seg.at[s] - seg.at[s - 1] : null).filter((v) => v != null);
  const monotone = durs.every((v, i) => i === 0 || v > durs[i - 1]);
  durs.length >= 4 && monotone
    ? pass('the falloff is spatial: every layer costs more than the one in front of it',
      durs.map((v) => `${v.toFixed(2)}s`).join(' < '))
    : fail('the falloff is spatial: every layer costs more than the one in front of it',
      durs.map((v) => v.toFixed(2)).join(' / ') + (durs.length < 4 ? ' (not every stage was crossed)' : ''));

  // ======================================================================= 2 · THE BARRIER
  const held = await page.evaluate(async ([id]) => {
    const e = window.__rrr.engine, p = e.room.panelOf(id);
    const before = { stage: p.state.stage, hp: p.state.stageHealth };
    // Fire the real weapon path 40 times — not `applyDamage`, because the question is whether
    // the SHOT is refused, and `castRay(forDamage)` / `hitWall` is what a player actually runs.
    let hits = 0, changes = 0;
    for (let i = 0; i < 40; i++) {
      const hit = p.hitPoint(e.player.pos, Math.random);
      const dir = p.normal.clone().multiplyScalar(-p.sideOf(e.player.pos));
      const r = e.weapons.hitWall(p, hit, dir, 'nailgun');
      hits++;
      if (r?.result?.changed) changes++;
    }
    return { before, hits, changes, after: { stage: p.state.stage, hp: p.state.stageHealth },
      blocks: p.blocksMovement(), shots: p.blocksProjectile(), dmgable: p.state.isDamageable(),
      name: p.state.def.name, canOpen: p.state.canOpen() };
  }, [SEG]);
  note(`BARRIER under fire: ${held.hits} registered wall hits, ${held.changes} stage changes, `
    + `stage ${held.before.stage}->${held.after.stage}, name "${held.name}", `
    + `blocksMove ${held.blocks} · blocksShots ${held.shots} · damageable ${held.dmgable} · canOpen ${held.canOpen}`);
  (held.name === 'barrier' && held.changes === 0 && held.blocks && held.shots
    && !held.dmgable && !held.canOpen && held.after.stage === held.before.stage)
    ? pass('the barrier is visible, impassable and undamageable',
      `40 more hits moved nothing; it still stops a shot, so it reads as solid rather than as a broken gun`)
    : fail('the barrier is visible, impassable and undamageable', JSON.stringify(held));

  // ======================================================================= 3 · THE MIDDLE
  //
  // ⚠️ THE ONLY VERSION OF THIS TEST THAT IS WORTH ANYTHING DRIVES **BOTH** SIDES TO THE END.
  // A design that merely makes one side stop is not a design that stops two coordinated players.
  const middle = await page.evaluate(async ([a, b]) => {
    const e = window.__rrr.engine, room = e.room;
    const pa = room.panelOf(a), pb = room.panelOf(b);
    if (!pa || !pb) return { err: `missing panel ${a} / ${b}` };
    // Server-authoritative damage, the same entry point the weapon uses, with enough overkill
    // that nothing is left. Overkill carries through stages by design.
    for (const p of [pa, pb]) for (let i = 0; i < 8; i++) p.damage(1e5, { weapon: 'nailgun' });

    const spaceA = room.spaces.find((s) => s.id === pa.spec.a);
    const spaceB = room.spaces.find((s) => s.id === pb.spec.a);
    const c = pa.root.position;                       // the segment, on room A's face
    const n = pa.normal;                              // points into room A

    // A body standing in room A, 0.6 m off the face, walked HARD at the wall for 120 steps.
    const V = e.player.pos.constructor;               // THREE.Vector3, without importing three
    const body = new V(c.x + n.x * 0.6, room.floorY, c.z + n.z * 0.6);
    let deepest = 0;                                  // how far past the face it ever got, metres
    for (let i = 0; i < 120; i++) {
      body.x -= n.x * 0.05; body.z -= n.z * 0.05;     // shove straight into the wall
      const out = room.collide(body, 0.34);
      body.copy(out);
      const along = (body.x - c.x) * n.x + (body.z - c.z) * n.z;   // <0 == inside the wall
      deepest = Math.min(deepest, along);
    }
    const crossedInto = room.spaceAt(body)?.id ?? null;

    // Every other way the engine could hand somebody through.
    const portalIds = room.portals().map((p) => p.id);
    const eyeA = new V(c.x + n.x * 1.2, 1.2, c.z + n.z * 1.2);
    const eyeB = new V(c.x - n.x * 1.2, 1.2, c.z - n.z * 1.2);
    const dir = new V(-n.x, 0, -n.z);
    const ray = room.castRay(eyeA, dir, 6, { forDamage: true });

    return {
      a, b,
      stageA: pa.state.stage, stageB: pb.state.stage,
      nameA: pa.state.def.name, nameB: pb.state.def.name,
      blocksA: pa.blocksMovement(), blocksB: pb.blocksMovement(),
      canOpenA: pa.state.canOpen(), canOpenB: pb.state.canOpen(),
      portalA: portalIds.includes(a), portalB: portalIds.includes(b),
      // the BFS: what is the shortest route between the two rooms now?
      route: room.pathPortals(spaceA.id, spaceB.id).map((p) => p.id),
      deepest: +deepest.toFixed(3),
      ended: crossedInto,
      startRoom: spaceA.id, otherRoom: spaceB.id,
      sightBlocked: room.blocksSight(eyeA, eyeB),
      rayHit: ray ? { d: +ray.distance.toFixed(3), panel: ray.panel?.id ?? '(collider)' } : null,
      barriers: room.barriers.filter((x) => x.edge === pa.spec.edge).length,
    };
  }, [SEG, TWIN]);

  note(`MEET IN THE MIDDLE — both faces of segment ${middle.a.replace(/\.a$/, '')} driven to the end:`);
  note(`  ${middle.a} stage ${middle.stageA} "${middle.nameA}" blocksMove ${middle.blocksA} canOpen ${middle.canOpenA}`);
  note(`  ${middle.b} stage ${middle.stageB} "${middle.nameB}" blocksMove ${middle.blocksB} canOpen ${middle.canOpenB}`);
  note(`  breach portal for either: ${middle.portalA || middle.portalB}`
    + ` · ${middle.startRoom}->${middle.otherRoom} BFS route: ${middle.route.join('>') || '(none)'}`);
  note(`  a body shoved at it for 120 steps got ${(-middle.deepest).toFixed(3)} m past the face`
    + ` (the wall band is 0.30 m) and ended in "${middle.ended}"`);
  note(`  line of sight across it blocked: ${middle.sightBlocked}`
    + ` · a damage ray from ${middle.startRoom} stops at ${middle.rayHit ? `${middle.rayHit.d} m on ${middle.rayHit.panel}` : 'NOTHING'}`);
  await shot('dig-both-sides-barrier');

  // ⚠️ THE PICTURE FROM THE **OTHER ROOM**, and it is the one that would expose the failure the
  // one-panel-per-edge shortcut would have had: with a single shared stack facing one way, the
  // far room looks straight through an intact segment (the layer materials are `FrontSide`).
  // Two stacks with the brick between them means each room sees its own wall, and once both are
  // dug each room sees the same masonry.
  await stageAt(TWIN, 2.4);
  await step(20);
  await shot('dig-from-the-other-room');

  const sealed = middle.stageA === 4 && middle.stageB === 4
    && middle.nameA === 'barrier' && middle.nameB === 'barrier'
    && middle.blocksA && middle.blocksB
    && !middle.canOpenA && !middle.canOpenB
    && !middle.portalA && !middle.portalB
    && !middle.route.includes(middle.a) && !middle.route.includes(middle.b)
    && middle.ended === middle.startRoom
    && -middle.deepest < 0.15
    && middle.sightBlocked;
  sealed
    ? pass('two players digging the same segment from opposite rooms can never meet',
      `both faces terminal at "barrier"; no breach portal, no BFS edge, sight blocked, and a body `
      + `driven at it for 120 steps stayed in ${middle.startRoom}`)
    : fail('two players digging the same segment from opposite rooms can never meet', JSON.stringify(middle));

  // ======================================================================= 4 · WHAT IT COST
  const cen = await page.evaluate(() => {
    const e = window.__rrr.engine;
    return { ...e.room.panelCensus(), dig: e.room.digCensus() };
  });
  note(`AFTER THE SESSION: ${cen.panels} panels, ${cen.pristine} pristine, `
    + `${cen.panels - cen.pristine} PROMOTED (own layered stack for the rest of the round)`);
  note(`  dig segments by stage [${cen.dig.byStage.join(', ')}] · at barrier ${cen.dig.atBarrier}`
    + ` · instanced groups ${cen.instanced ? cen.instanced.groups : 0}`
    + ` (${cen.instanced ? cen.instanced.keys.join(', ') : 'none'})`
    + ` · ${cen.instanced ? cen.instanced.meshes : 0} meshes for ${cen.instanced ? cen.instanced.slots : 0} slots`);
  pass('the promoted-panel count is on the record',
    `${cen.panels - cen.pristine} promoted of ${cen.panels} after a full dig plus a control breach`);
}
