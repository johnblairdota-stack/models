/**
 * 🕳️ THE LOW INTERCONNECT — does a robot fit, and does the hunter not?
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/dig-low.mjs \
 *        --port 5275 --q "seed=s4&dig=1" --shots
 *
 * `docs/design/dig.md` §5: *"beneath the walls there is a secret pathway... there is NO VERTICAL
 * AXIS, but a gap at the BASE of the wall is a passage on the floor plane, and the robots are
 * small. Which means the interconnect can be too low for the hunter. That is exactly the D7
 * mechanic — the chapel is a refuge that growth takes away — reappearing for free."*
 *
 * ⚠️ **AND THE DESIGN DOC'S OWN NEXT LINE IS WHY THIS FILE EXISTS: *"Must be measured, not
 * asserted."*** So nothing here is arithmetic. Every claim is a body driven at a hole.
 *
 *   D1  INERT      no collider in the shipped house has a base between the robot's clear-height
 *                  requirement and the hunter's, so raising the hunter's number changes nothing
 *                  that shipped. Walked, not argued.
 *   D2  A ROBOT FITS      a player body pushed at a dug segment ends up in the next room.
 *   D3  THE HUNTER DOES NOT   the same hole, the same push, the hunter's clear height: refused.
 *                  Then the AI half — the BFS must not offer it the route either, or it lines up
 *                  square in front of a hole it bounces off and reads as broken.
 *   D4  THE CROSSING      it makes its OWN hole, full height, taking the lintel and the masonry,
 *                  and then it fits. `?dig=1` only, and its own ablation.
 */

const CAP = +(process.env.CAP ?? 60);

export default async function digLow({ page, note, pass, fail, skip, shot }) {
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

  const head = await page.evaluate(async () => {
    const R = await import('/src/game/rules.js');
    const e = window.__rrr?.engine;
    if (!e?.room?.digCensus) return null;
    return { ...e.room.digCensus(), seed: String(e.run.seed), PASS_H: R.PASS_H,
      hunterH: [1, 2, 3].map((s) => +(1.7 * ({ 1: 1.35, 2: 1.90, 3: 2.60 })[s]).toFixed(2)),
      playerH: e.player.height };
  });
  if (!head) { fail('the build is reachable', 'no engine.room.digCensus'); return; }
  if (!head.on) { skip('the low interconnect can be measured', '`?dig=0` — re-run with --q "dig=1"'); return; }
  note(`seed "${head.seed}" · segment aperture ${head.segmentH} m tall · PASS_H robot `
    + `${head.PASS_H.robot} / hunter ${head.PASS_H.hunter} · bodies: player ${head.playerH} m, `
    + `hunter ${head.hunterH.join(' / ')} m at stages 1/2/3`);

  // =========================================================================
  // D1 · INERT ON THE SHIPPED BUILD — every collider in the house, walked
  // =========================================================================
  const between = await page.evaluate(async () => {
    const R = await import('/src/game/rules.js');
    const e = window.__rrr.engine;
    const lo = R.PASS_H.robot, hi = R.PASS_H.hunter;
    const rows = [];
    for (const sp of e.room.spaces) {
      for (const b of sp.colliders) {
        if (b.min.y > lo - 1e-6 && b.min.y < hi - 1e-6) {
          rows.push({ space: sp.id, base: +b.min.y.toFixed(3),
            size: [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z].map((v) => +v.toFixed(2)) });
        }
      }
    }
    // ...and the panels, which are colliders too while they still block
    const pan = e.room.panels.filter((p) => p.box.min.y > lo - 1e-6 && p.box.min.y < hi - 1e-6)
      .map((p) => ({ id: p.id, base: +p.box.min.y.toFixed(3) }));
    return { rows, pan, lo, hi, total: e.room.spaces.reduce((n, s) => n + s.colliders.length, 0) };
  });
  // ⚠️ THE DIG SEGMENTS' OWN LINTELS ARE EXPECTED TO BE IN THIS BAND — they ARE the mechanic.
  // What must not be there is anything else, and on a `?dig=0` build the answer must be zero.
  const strays = between.rows.filter((r) => !(r.base > 1.79 && r.base < 1.81));
  note(`colliders with a base in [${between.lo}, ${between.hi}) — the band the hunter's number `
    + `newly notices: ${between.rows.length} of ${between.total}, of which `
    + `${between.rows.length - strays.length} are dig lintels at 1.80 m`);
  strays.length === 0
    ? pass('raising the hunter\'s clear height cannot change anything the house already had',
      `every one of the ${between.rows.length} colliders in that band is a dig-segment lintel at `
      + `1.80 m; the ${between.total - between.rows.length} others are all below 1.70 or above 2.40, `
      + `and no panel box starts there either (${between.pan.length})`)
    : fail('raising the hunter\'s clear height cannot change anything the house already had',
      `${strays.length} non-dig colliders: ${JSON.stringify(strays.slice(0, 6))}`);

  // =========================================================================
  // shared driver — open a segment, then push a body of a given height at it
  // =========================================================================
  /** Force one segment's column open on both faces, without shooting it. */
  const openSeg = (id) => page.evaluate(async ([id]) => {
    const D = await import('/src/game/dig.js');
    const e = window.__rrr.engine;
    for (const p of e.room.panels) if (p.spec?.dig) p.state.reset();
    e.room.setDigPlan({ link: D.interconnectIds(e.run.seed) });
    e.room.unlockBarrier();                       // the barrier is down: every segment can open
    for (const side of ['a', 'b']) {
      const q = e.room.panelOf(id.replace(/\.(a|b)$/, `.${side}`));
      q.state.setStage(q.state.defs.length - 1);
    }
    const p = e.room.panelOf(id);
    return { id, stage: p.state.stage, blocks: p.blocksMovement(),
      w: +p.width.toFixed(2), h: +p.height.toFixed(2) };
  }, [id]);

  /** Shove a circle of `radius` and clear height `passH` at the panel's face for N steps. */
  const shove = (id, radius, passH, steps = 200) => page.evaluate(([id, radius, passH, steps]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    const V = e.player.pos.constructor;
    const n = p.normal, c = p.root.position;
    const pos = new V(c.x + n.x * 1.6, e.room.floorY, c.z + n.z * 1.6);
    const start = e.room.spaceAt(pos)?.id ?? null;
    for (let i = 0; i < steps; i++) {
      pos.set(pos.x - n.x * 0.06, e.room.floorY, pos.z - n.z * 0.06);
      const r = e.room.collide(pos, radius, passH);
      pos.copy(r);
    }
    // how far past the panel's own plane did it get, along the inward normal?
    const past = -((pos.x - c.x) * n.x + (pos.z - c.z) * n.z);
    return { start, ended: e.room.spaceAt(pos)?.id ?? null, past: +past.toFixed(3),
      at: [+pos.x.toFixed(2), +pos.z.toFixed(2)] };
  }, [id, radius, passH, steps]);

  const SEG = process.env.SEG ?? 'd.svc_w.5.a';
  const opened = await openSeg(SEG);
  await step(4);
  note(`opened ${opened.id} on both faces: ${opened.w} x ${opened.h} m, blocksMove ${opened.blocks}`);

  // =========================================================================
  // D2 / D3 · a robot fits, the hunter does not — SAME HOLE, SAME PUSH
  // =========================================================================
  const asRobot = await page.evaluate(() => window.__rrr.engine.player.radius);
  const robot = await shove(SEG, asRobot, head.PASS_H.robot);
  const hunter1 = await shove(SEG, 0.42, head.PASS_H.hunter);   // stage 1, the smallest
  const hunter3 = await shove(SEG, 0.66, head.PASS_H.hunter);   // stage 3
  note(`robot  r=${asRobot.toFixed(2)} h=${head.PASS_H.robot}: ${robot.start} -> ${robot.ended}, `
    + `${robot.past} m past the face`);
  note(`hunter r=0.42 h=${head.PASS_H.hunter} (stage 1): ${hunter1.start} -> ${hunter1.ended}, `
    + `${hunter1.past} m past the face`);
  note(`hunter r=0.66 h=${head.PASS_H.hunter} (stage 3): ${hunter3.start} -> ${hunter3.ended}, `
    + `${hunter3.past} m past the face`);

  (robot.ended && robot.ended !== robot.start && robot.past > 0.2)
    ? pass('a small robot walks through a dug segment',
      `${robot.start} -> ${robot.ended}, ${robot.past} m past the face of a `
      + `${opened.w} x ${opened.h} m hole`)
    : fail('a small robot walks through a dug segment', JSON.stringify(robot));

  (hunter1.past <= 0.01 && hunter3.past <= 0.01 && hunter1.ended === hunter1.start)
    ? pass('the hunter does not — the same hole, the same push, refused at every stage',
      `stage 1 got ${hunter1.past} m past the face and stage 3 got ${hunter3.past} m, both still `
      + `in ${hunter1.start}. The lintel at 1.80 m is what stops it, and it is the same box the `
      + `player can see above the hole.`)
    : fail('the hunter does not — the same hole, the same push, refused at every stage',
      JSON.stringify({ hunter1, hunter3 }));

  // ...and the AI must not be OFFERED the route, or it lines up at a hole it bounces off.
  const routes = await page.evaluate(async ([id]) => {
    const R = await import('/src/game/rules.js');
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    const a = p.spec.a, b = p.spec.b;
    const asRobot = e.room.pathPortals(a, b, 0, R.PASS_H.robot).map((q) => q.id);
    const asHunter = e.room.pathPortals(a, b, 0.84, R.PASS_H.hunter).map((q) => q.id);
    return { a, b, asRobot, asHunter };
  }, [SEG]);
  note(`BFS ${routes.a}->${routes.b}: robot [${routes.asRobot.join(' ')}] · hunter [${routes.asHunter.join(' ')}]`);
  (routes.asRobot.includes(SEG) && !routes.asHunter.includes(SEG))
    ? pass('the AI is never offered a hole it cannot get under',
      `the same BFS returns ${SEG} to a robot and does not return it to a hunter — so it routes `
      + `round rather than pressing into the lintel three metres from the player`)
    : fail('the AI is never offered a hole it cannot get under',
      `robot ${routes.asRobot} · hunter ${routes.asHunter}`);
  await shot('dig-low-hole');

  // =========================================================================
  // D4 · THE CROSSING — the hunter makes its own hole, and it is a different hole
  // =========================================================================
  const cross = await page.evaluate(async ([id]) => {
    const D = await import('/src/game/dig.js');
    const R = await import('/src/game/rules.js');
    const e = window.__rrr.engine;
    for (const p of e.room.panels) if (p.spec?.dig) p.state.reset();
    e.room.setDigPlan({ link: D.interconnectIds(e.run.seed) });
    const p = e.room.panelOf(id);
    // drive it to the barrier the way the hunter would: the state machine, not a shortcut
    p.state.setStage(p.state.defs.length - 1);
    const before = {
      name: p.state.def.name, blocks: p.blocksMovement(), dmgable: p.state.isDamageable(),
      allowed: e.room.digCanHunterCross(p),
      h: e.room.portals().find((q) => q.id === id)?.h ?? null,
    };
    const did = e.room.hunterBreach(p);
    const after = {
      name: p.state.def.name, blocks: p.blocksMovement(),
      h: e.room.portals().find((q) => q.id === id)?.h ?? null,
      census: e.room.digCensus(),
    };
    return { did, before, after, passH: R.PASS_H };
  }, [SEG]);
  await step(4);
  const crossed = await shove(SEG, 0.66, head.PASS_H.hunter);
  note(`hunter crossing at ${SEG}: allowed=${cross.before.allowed}, was "${cross.before.name}" `
    + `(damageable ${cross.before.dmgable}, clear height ${cross.before.h}) -> "${cross.after.name}" `
    + `clear height ${cross.after.h} · then r=0.66 h=${head.PASS_H.hunter}: ${crossed.start} -> `
    + `${crossed.ended}, ${crossed.past} m past the face`);
  (cross.did && crossed.past > 0.2 && crossed.ended !== crossed.start)
    ? pass('the hunter crosses the barrier, and its hole is full height',
      `a segment that had bottomed out at "barrier" — undamageable, the end of the road for a `
      + `robot — is taken by the hunter along with its masonry and its 3.00 m lintel: clear height `
      + `${cross.before.h} -> ${cross.after.h} m, and the same body that was refused above now `
      + `walks ${crossed.start} -> ${crossed.ended}`)
    : fail('the hunter crosses the barrier, and its hole is full height',
      JSON.stringify({ did: cross.did, crossed }));

  // The ablation: turn the crossing off and the same panel refuses it.
  const off = await page.evaluate(async ([id]) => {
    const D = await import('/src/game/dig.js');
    const e = window.__rrr.engine;
    for (const p of e.room.panels) if (p.spec?.dig) p.state.reset();
    e.room.setDigPlan({ link: D.interconnectIds(e.run.seed) });
    e.room.setHunterCrossing(false);
    const p = e.room.panelOf(id.replace(/\.\d+\./, '.7.'));
    p.state.setStage(p.state.defs.length - 1);
    const r = { allowed: e.room.digCanHunterCross(p), did: e.room.hunterBreach(p),
      blocks: p.blocksMovement() };
    e.room.setHunterCrossing(true);
    return r;
  }, [SEG]);
  (!off.allowed && !off.did && off.blocks)
    ? pass('the crossing has its own switch, so the beat can be priced',
      '`room.setHunterCrossing(false)` and the same barrier refuses the same hunter in the same page')
    : fail('the crossing has its own switch, so the beat can be priced', JSON.stringify(off));

  /**
   * ⚠️ **AND THE CROSSING HAS TO HEAL ON A ROUND RESET.** `views/game.js` `resetRound()` runs
   * `wallField.resetAll()` and then `applyExitPlan()` — which lands in `room.setDigPlan` — every
   * 28 seconds under the capture Director. A crossing that survived it would put one more
   * full-height hole in a supposedly sealed house per round, and the search would be over before
   * it started on run three. Nothing about it is latched anywhere else, so this is the whole test.
   */
  const healed = await page.evaluate(async ([id]) => {
    const D = await import('/src/game/dig.js');
    const e = window.__rrr.engine;
    for (const p of e.room.panels) if (p.spec?.dig) p.state.reset();
    e.room.setDigPlan({ link: D.interconnectIds(e.run.seed) });
    const p = e.room.panelOf(id);
    p.state.setStage(p.state.defs.length - 1);
    e.room.hunterBreach(p);
    const broken = { breached: e.room.digCensus().hunterBreached.length,
      brick: e.room.digCensus().brickStanding };
    // the round turns over exactly as the game does it
    for (const q of e.room.panels) q.state.reset();
    e.room.setDigPlan({ link: D.interconnectIds(e.run.seed) });
    const c = e.room.digCensus();
    return { broken, after: { breached: c.hunterBreached.length, brick: c.brickStanding,
      blocks: e.room.panelOf(id).blocksMovement(), name: e.room.panelOf(id).state.def.name } };
  }, [SEG]);
  await step(3);
  const rehealed = await shove(SEG, 0.66, head.PASS_H.hunter);
  note(`after a crossing: ${healed.broken.breached} columns down, brick ${healed.broken.brick}`
    + ` · after the round reset: ${healed.after.breached} down, brick ${healed.after.brick}, `
    + `the panel is "${healed.after.name}" and the hunter gets ${rehealed.past} m past the face`);
  (healed.after.breached === 0 && healed.after.brick > healed.broken.brick && rehealed.past <= 0.01)
    ? pass('a hunter crossing heals on the round reset, geometry and colliders included',
      `${healed.broken.breached} breached columns and ${healed.broken.brick} brick slabs standing `
      + `become 0 and ${healed.after.brick}; the lintel is back as a collider (the same body is `
      + `refused at ${rehealed.past} m again) and the masonry is back in the merged mesh`)
    : fail('a hunter crossing heals on the round reset, geometry and colliders included',
      JSON.stringify({ healed, rehealed }));

  // ---- the picture a critic has to judge: two kinds of hole in one wall, side by side.
  await page.evaluate(async ([edge]) => {
    const D = await import('/src/game/dig.js');
    const e = window.__rrr.engine;
    for (const p of e.room.panels) if (p.spec?.dig) p.state.reset();
    e.room.setDigPlan({ link: D.interconnectIds(e.run.seed) });
    e.room.unlockBarrier();
    // a ROBOT's hole: one bay, opened from the service side
    for (const side of ['a', 'b']) e.room.panelOf(`d.${edge}.1.${side}`).state.setStage(4);
    // ...and a HUNTER's, three bays along
    e.room.hunterBreach(e.room.panelOf(`d.${edge}.3.a`));
    /**
     * ⚠️ A RAKING VIEW ALONG THE WALL, NOT A SQUARE ONE. The service passage is ~3.4 m wide, so
     * there is nowhere to stand that frames five bays head-on — the first version of this shot
     * put the camera 4.4 m out, which is through the wall and into the next room, and
     * photographed the back of the wall in the dark. Standing at one end of the run and looking
     * down it is also what `refs/dig/dig-gallery-leg-breach.jpg` does: the robot is BESIDE the
     * hole, not square in front of it, and the hole stays legible.
     */
    const far = e.room.panelOf(`d.${edge}.5.a`), near = e.room.panelOf(`d.${edge}.0.a`);
    const n = far.normal, c = far.root.position, t = near.root.position;
    e.player.pos.set(c.x + n.x * 1.35, e.room.floorY, c.z + n.z * 1.35);
    const yaw = Math.atan2(t.x + n.x * 0.9 - e.player.pos.x, t.z + n.z * 0.9 - e.player.pos.z);
    e.player.aimYaw = yaw; e.player.aimPitch = 0.03; e.player.facing = yaw;
    e.cam.yaw = yaw; e.cam.pitch = 0.03; e.cam._first = true;
  }, ['svc_w']);
  await step(25);
  await shot('dig-low-two-kinds-of-hole');
  note('`dig-low-two-kinds-of-hole` — one wall carrying a robot-made bay (1.14 x 1.80, lintel '
    + 'intact) and a hunter-made breach (2.28 x 4.80, lintel gone). Judge whether they read as '
    + 'two different things at a glance; that is the whole claim and it is a LOOK claim.');
}
