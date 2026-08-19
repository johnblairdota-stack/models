/**
 * IS `?dig=1` A **COMPLETE** TOGGLE? — the arms must differ where they should and MATCH where
 * they should.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/dig-toggle.mjs \
 *        --port 5245 --q "seed=s4"            # the shipped arm
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/dig-toggle.mjs \
 *        --port 5245 --q "seed=s4&dig=1"      # the dig arm
 *
 * ⚠️ WHY THIS EXISTS. `docs/PLAN.md` has an open item — *"AUDIT EVERY ABLATION TOGGLE"* — and
 * HANDOFF records that `?cam=r10` was sold as *"every historic number stays checkable"* and was
 * an INCOMPLETE revert, because work done alongside it was unconditional on the parameter. Three
 * incomplete reverts have been found in two days, one of them introduced while fixing another.
 * **A new toggle silently inherits every unconditional change made beside it.** So this does not
 * check that the switch exists; it checks the STATE on both sides of it.
 *
 * ⚠️ AND IT BUILDS BOTH ARMS **IN ONE PAGE**, which is the whole method. This project's own rule,
 * paid for several times over: an A/B taken across two page loads compares two random states.
 * `buildTestRoom()` is a pure function of its arguments, so the scenario calls it a second time
 * with the opposite `dig` value, off-scene, and fingerprints both builds against each other
 * inside one process. Whichever arm the URL asked for, the report is the same table.
 *
 * WHAT IT ASSERTS:
 *   MATCH   every one of the 22 shipped panels — id, world position, aperture, thickness AND its
 *           whole stage table — is identical in both arms
 *   MATCH   the collider count of every space no dig edge touches
 *   MATCH   `canOpen()` is true for every shipped panel in BOTH arms, so the `hunter-ai.js`
 *           guard added this round is provably inert with the flag off
 *   DIFFER  36 segments, 12 brick slabs, a `kit:brick` mesh and a baked brick material appear
 *           only with the flag on — and the segments are the only panels that cannot open
 */

export default async function digToggle({ page, note, pass, fail, skip }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const r = await page.evaluate(async () => {
    const e = window.__rrr.engine;
    const roomMod = await import('/src/game/room.js');
    const wallMod = await import('/src/destruction/wall.js');

    const fp = (room) => {
      let meshes = 0, tris = 0;
      const byName = {};
      room.root.traverse((o) => {
        if (!o.isMesh) return;
        meshes++;
        const g = o.geometry;
        tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
        const k = String(o.name || '?').replace(/\d+/g, '#');
        byName[k] = (byName[k] ?? 0) + 1;
      });
      const shipped = room.panels.filter((p) => !p.spec?.dig);
      const seg = room.panels.filter((p) => p.spec?.dig);
      return {
        dig: !!room.dig,
        panels: room.panels.length,
        segments: seg.length,
        barriers: room.barriers.length,
        brickMaterial: !!room.materials.brick,
        brickMesh: byName['kit:brick'] ?? 0,
        meshes, tris: Math.round(tris),
        colliders: room.spaces.map((s) => `${s.id}:${s.colliders.length}`),
        /**
         * ⚠️ **WHICH SPACES THE DIG TABLE TOUCHES, READ OFF THE BUILD.** This used to be a
         * hardcoded `['service','study_w','study_e']` beside the assertion below and it went
         * stale the moment `DIG_EDGES` grew (`digcover-1`, 2026-08-09 — five appended edges, and
         * the probe reported the gallery, the ballroom and the chapel as regressions for having
         * exactly the dig geometry they were given on purpose). `DIG_EDGES` is authored data and
         * a probe that keeps its own copy of authored data is a second source of truth.
         */
        digSpaces: [...new Set(seg.flatMap((p) => [p.spec.a, p.spec.b]))],
        portals: room.portals().length,
        shippedCanOpen: shipped.filter((p) => p.state.canOpen()).length,
        segCanOpen: seg.filter((p) => p.state.canOpen()).length,
        /** how many dig faces carry a damage grid — the free arm's defining property. */
        fields: seg.filter((p) => !!p.field).length,
        instanced: room.panelInstances ? room.panelInstances.census() : null,
        /**
         * THE ROW THE WHOLE TEST HANGS ON. Everything a shipped panel IS: where it stands, how
         * big its hole is, how thick it is, and the entire stage table it runs on. A toggle that
         * changed a health, a thickness or a coordinate on one of these would move a measured
         * number somewhere else in the project and nothing would throw.
         */
        shipped: shipped.map((p) => `${p.id}|${p.root.position.x.toFixed(3)},`
          + `${p.root.position.y.toFixed(3)},${p.root.position.z.toFixed(3)}`
          + `|${p.rotY.toFixed(4)}|${p.width.toFixed(3)}x${p.height.toFixed(3)}x${p.thickness.toFixed(3)}`
          + `|${p.state.defs.map((d) => `${d.name}:${d.health}`).join('/')}`),
      };
    };

    /**
     * ⚠️ **BOTH ARMS ARE BUILT OFF-SCENE, AND THE LIVE ROOM IS NOT ONE OF THEM.** The first
     * version of this probe compared the live room against an off-scene opposite arm and
     * reported fourteen differences — every exit site's stage table. That was the INSTRUMENT:
     * `views/game.js` `applyExitPlan()` mutates `WallState.defs` on the exit sites AFTER the
     * build, because which site is live is a per-run fact and the builder runs before a run
     * exists. Comparing a post-plan room with a virgin one measures the run plan, not the flag.
     *
     * So both arms come out of the same builder in the same state, and the live room is checked
     * separately against its own arm on the fields the plan cannot touch — which is also what
     * proves the off-scene build is a faithful stand-in rather than a parallel universe.
     */
    const mk = async (dig) => {
      const room = await roomMod.buildTestRoom(e, {
        dig, wallField: new wallMod.WallField({ authority: true }),
      });
      const f = fp(room);
      room.panels.forEach((p) => p.dispose?.());
      room.panelInstances?.dispose?.();
      return f;
    };
    /**
     * ⚠️ **THE "ON" ARM IS BUILT IN WHATEVER MODE THE PAGE IS IN, NOT IN A HARDCODED ONE.**
     * `?dig=` became three-valued on 2026-08-08 (`off | free | bays`, `dig.js` `digMode`) and
     * `dig: true` now means FREE. A scenario that builds a free arm and compares it against a
     * `?dig=bays` page reports four differences and every one of them is the instrument — which
     * is exactly the failure the first version of THIS file already made once, comparing a
     * post-plan room against a virgin one. The page's own `room.dig` / `digCensus().mode` is the
     * authority; nothing here parses a query string.
     */
    const mode = e.room.digCensus?.().mode ?? (e.room.dig ? 'free' : 'off');
    const off = await mk(false);
    const on = await mk(mode === 'off' ? 'free' : mode);

    // The live room, on the fields `applyExitPlan` cannot move.
    const live = fp(e.room);
    const shape = (x) => x.shipped.map((s) => s.split('|').slice(0, 4).join('|')).sort();
    const mine = live.dig ? on : off;
    const liveMatches = JSON.stringify(shape(live)) === JSON.stringify(shape(mine))
      && live.panels === mine.panels && live.barriers === mine.barriers
      && live.brickMesh === mine.brickMesh;
    return { on, off, mode, liveArm: `dig=${mode}`, liveMatches };
  });

  const line = (k, a, b) => note(`  ${String(k).padEnd(18)} off ${String(a).padStart(8)}`
    + ` | on ${String(b).padStart(8)}${String(a) === String(b) ? '   (match)' : ''}`);
  note(`?dig= arms, both built off-scene in this page (the page itself is ${r.liveArm}):`);
  line('panels', r.off.panels, r.on.panels);
  line('dig segments', r.off.segments, r.on.segments);
  line('brick slabs', r.off.barriers, r.on.barriers);
  line('kit:brick meshes', r.off.brickMesh, r.on.brickMesh);
  line('brick material', r.off.brickMaterial, r.on.brickMaterial);
  line('room meshes', r.off.meshes, r.on.meshes);
  line('room triangles', r.off.tris, r.on.tris);
  line('portals (open)', r.off.portals, r.on.portals);
  line('shipped canOpen', r.off.shippedCanOpen, r.on.shippedCanOpen);
  line('segment canOpen', r.off.segCanOpen, r.on.segCanOpen);
  line('instanced groups', r.off.instanced?.groups ?? 0, r.on.instanced?.groups ?? 0);
  line('instanced meshes', r.off.instanced?.meshes ?? 0, r.on.instanced?.meshes ?? 0);
  note(`  aperture groups off [${(r.off.instanced?.keys ?? []).join(' ')}]`);
  note(`  aperture groups on  [${(r.on.instanced?.keys ?? []).join(' ')}]`);
  note(`  colliders off ${r.off.colliders.join(' ')}`);
  note(`  colliders on  ${r.on.colliders.join(' ')}`);

  // ---- MATCH ------------------------------------------------------------------------------
  r.liveMatches
    ? pass('the off-scene arms are what the page actually built',
      `the live ${r.liveArm} room has the same panel count, panel geometry, brick slabs and brick `
      + `meshes as its off-scene arm — so the comparison below is of this build, not of a model of it`)
    : fail('the off-scene arms are what the page actually built',
      `the live ${r.liveArm} room does not match its own arm`);

  const diffs = [];
  const A = new Map(r.off.shipped.map((s) => [s.split('|')[0], s]));
  const B = new Map(r.on.shipped.map((s) => [s.split('|')[0], s]));
  for (const [id, s] of A) { if (B.get(id) !== s) diffs.push(`${id}\n    off ${s}\n    on  ${B.get(id)}`); }
  for (const id of B.keys()) if (!A.has(id)) diffs.push(`${id} exists only with dig=1`);
  (r.off.shipped.length === r.on.shipped.length && diffs.length === 0)
    ? pass('every shipped panel is byte-identical in both arms',
      `${r.off.shipped.length} panels: id, position, rotY, aperture, thickness and full stage table`)
    : fail('every shipped panel is byte-identical in both arms', diffs.join(' · '));

  // Spaces the dig edges do not touch must be the same building in both arms.
  const touched = new Set(r.on.digSpaces ?? []);
  const offC = new Map(r.off.colliders.map((s) => s.split(':')));
  const onC = new Map(r.on.colliders.map((s) => s.split(':')));
  const untouched = [...offC.keys()].filter((k) => !touched.has(k));
  const badC = untouched.filter((k) => offC.get(k) !== onC.get(k));
  note(`  dig table touches [${[...touched].join(' ')}]; `
    + `deltas ${[...touched].map((k) => `${k} ${offC.get(k)}->${onC.get(k)}`).join(', ')}`);
  /**
   * ⚠️ **AN EMPTY SUBJECT IS A SKIP, NOT A PASS.** Since `digcover-1` appended five edges every
   * space in the house has a dig edge, so there is no untouched room left to compare and the
   * green this used to print would be green for having nothing to check. HANDOFF's rule: *"a
   * probe that cannot observe must report SKIP, never PASS."* It comes back the moment a floor
   * plan has a room the dig table does not reach.
   */
  if (!untouched.length) {
    skip('a room with no dig edge is the same building in both arms',
      `every space in this build (${[...touched].join(', ')}) carries a dig edge, so there is no `
      + 'untouched room to compare — the assertion has no subject rather than passing');
  } else if (badC.length === 0) {
    pass('a room with no dig edge is the same building in both arms',
      `${untouched.join(', ')} — collider counts identical`);
  } else {
    fail('a room with no dig edge is the same building in both arms',
      badC.map((k) => `${k} ${offC.get(k)} -> ${onC.get(k)}`).join(', '));
  }

  (r.off.portals === r.on.portals)
    ? pass('the level graph the house came with is untouched', `${r.off.portals} open portals in both arms`)
    : fail('the level graph the house came with is untouched', `${r.off.portals} -> ${r.on.portals}`);

  // ⚠️ THE INERTNESS PROOF for `hunter-ai.js`'s new `canOpen()` guard.
  (r.off.shippedCanOpen === r.off.panels && r.on.shippedCanOpen === r.off.panels)
    ? pass("the hunter's new canOpen guard is inert on every shipped panel",
      `all ${r.off.panels} shipped panels can still reach a passable stage in BOTH arms`)
    : fail("the hunter's new canOpen guard is inert on every shipped panel",
      `off ${r.off.shippedCanOpen}/${r.off.panels}, on ${r.on.shippedCanOpen}/${r.off.panels}`);

  // ---- DIFFER -----------------------------------------------------------------------------
  const offClean = r.off.segments === 0 && r.off.barriers === 0
    && r.off.brickMesh === 0 && !r.off.brickMaterial;
  offClean
    ? pass('with the flag off nothing of dig exists',
      'no segments, no brick slabs, no brick mesh, and the brick texture is never baked')
    : fail('with the flag off nothing of dig exists', JSON.stringify({
      segments: r.off.segments, barriers: r.off.barriers,
      brickMesh: r.off.brickMesh, brickMaterial: r.off.brickMaterial }));

  /**
   * ⚠️ **TWO ARMS, TWO CLAIMS, AND THE `bays` CLAIM IS UNCHANGED TO THE CHARACTER.** `?dig=bays`
   * is kept alive precisely so `dig-1`/`dig-2`'s measurements stay re-runnable, so its assertion
   * must keep asserting exactly what it asserted before free-form existed. The free arm is a
   * different building and gets its own.
   */
  if (r.mode === 'bays') {
    const onBuilt = r.on.segments > 0 && r.on.barriers > 0 && r.on.brickMesh > 0
      && r.on.brickMaterial && r.on.segCanOpen === 0;
    onBuilt
      ? pass('with the flag on the wall is segmented and the barrier is behind it',
        `${r.on.segments} segments, ${r.on.barriers} brick slabs in ${r.on.brickMesh} merged meshes, `
        + `and NOT ONE segment can ever reach a passable stage`)
      : fail('with the flag on the wall is segmented and the barrier is behind it', JSON.stringify({
        segments: r.on.segments, barriers: r.on.barriers, brickMesh: r.on.brickMesh,
        brickMaterial: r.on.brickMaterial, segCanOpen: r.on.segCanOpen }));
  } else {
    // 🕳️ FREE: the wall is CONTINUOUS and there is no masonry anywhere. The barrier is the G
    // channel of each face's damage texture, which is why there is nothing to bake, nothing to
    // merge and nothing for two clients to disagree about.
    const onBuilt = r.on.segments > 0 && r.on.barriers === 0 && r.on.brickMesh === 0
      && !r.on.brickMaterial && r.on.fields === r.on.segments;
    onBuilt
      ? pass('with the flag on the wall is continuous and the barrier is a texture channel',
        `${r.on.segments} free faces, every one carrying its own damage grid, ZERO brick slabs, `
        + 'zero merged brick meshes and no brick bake')
      : fail('with the flag on the wall is continuous and the barrier is a texture channel',
        JSON.stringify({ segments: r.on.segments, fields: r.on.fields, barriers: r.on.barriers,
          brickMesh: r.on.brickMesh, brickMaterial: r.on.brickMaterial }));
  }

  /**
   * The instancing gate: segmentation must not multiply the shared meshes.
   *
   * ⚠️ **THIS ASSERTION WAS MEASURING TWO THINGS AND BLAMING ONE OF THEM.** It compared
   * `census().meshes`, which is `groups x (7 if demotion is built else 2)` — so the arm-off
   * number was 2 groups x 2 and the arm-on number was 3 groups x 7, and the +17 it reported was
   * mostly the five SPENT meshes per group that `dig-1` added in the same round. Segmentation
   * costs ONE APERTURE GROUP; demotion costs five meshes per group and pays for itself at −132
   * calls. Those are separate claims and they are now separately asserted, because a test that
   * fails for a reason other than the one printed on it is worse than no test.
   */
  const groupsGrew = (r.on.instanced?.groups ?? 0) - (r.off.instanced?.groups ?? 0);
  const perGroupOff = (r.off.instanced?.meshes ?? 0) / Math.max(1, r.off.instanced?.groups ?? 1);
  /**
   * ⚠️ **THE FREE ARM COSTS ONE GROUP PER DISTINCT SPAN WIDTH, AND THAT IS A REAL COST, STATED.**
   * `bays` authored every segment at ONE aperture (`SEG_W` x `SEG_H`) so forty of them cost one
   * group. A continuous face is as wide as its span, and `DIG_EDGES` has three span lengths
   * (2.96 / 5.72 / 2.56), so the free arm carries three. It is bounded by the number of DISTINCT
   * SPAN LENGTHS in the authored table and not by the number of faces or the number of holes —
   * add a fourth edge with the same spans and it stays at three.
   */
  const groupBudget = r.mode === 'bays' ? 1 : 3;
  groupsGrew <= groupBudget
    ? pass('the dig band costs a bounded number of aperture groups',
      `${r.off.instanced?.groups ?? 0} -> ${r.on.instanced?.groups ?? 0} groups for `
      + `${r.off.panels} -> ${r.on.panels} panels (+${r.on.segments} dig faces): +${groupsGrew}, `
      + `budget +${groupBudget} (${r.mode === 'bays' ? 'one authored aperture' : 'one per distinct span length'})`)
    : fail('the dig band costs a bounded number of aperture groups',
      `+${groupsGrew} aperture groups for ${r.on.segments} dig faces, budget +${groupBudget}`);

  // ...and the rest of the delta is demotion, which only `bays` constructs at all — a free face
  // is never `spent` (`wall.js`), so `room.js` does not build the spent meshes for it.
  const meshDelta = (r.on.instanced?.meshes ?? 0) - (r.off.instanced?.meshes ?? 0);
  const demoteCost = (r.on.instanced?.demote ? 5 : 0) * (r.on.instanced?.groups ?? 0);
  const segCost = meshDelta - demoteCost;
  segCost <= 2 * groupBudget
    ? pass('the shared-mesh growth is the new groups plus demotion, and nothing else',
      `+${meshDelta} meshes = ${demoteCost} for demotion (5 x ${r.on.instanced?.groups} groups, `
      + `${r.mode} only) + ${segCost} for ${groupsGrew} extra aperture group(s) at ${perGroupOff}/group`)
    : fail('the shared-mesh growth is the new groups plus demotion, and nothing else',
      `+${meshDelta} meshes, of which ${demoteCost} is demotion — ${segCost} unaccounted for`);
}
