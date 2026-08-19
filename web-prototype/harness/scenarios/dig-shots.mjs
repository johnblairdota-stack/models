/**
 * WHAT A DIG LOOKS LIKE — framed pictures, from both rooms, of one segment at the barrier.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/dig-shots.mjs \
 *        --port 5254 --q "seed=s4&dig=1" --shots
 *
 * ⚠️ THE CAMERA STANDS TO ONE SIDE ON PURPOSE. `play-critic-8` measured that the player's body
 * covers the centre third of the aperture at the only station you can shoot from, and
 * `dig.md` §6a reads the same thing off John's own reference: *"the robot stands BESIDE the
 * hole, not square in front of it, and the hole is fully legible."* A frame taken square-on is a
 * picture of the back of a robot.
 *
 * ⚠️ AND THE PAIR IS THE POINT. `d.svc_w.4.a` is driven to the barrier and `d.svc_w.4.b`, its
 * twin on the other face of the same shared edge, is left INTACT — so the two frames together
 * are the two-sidedness: from the service passage the wall is gone back to masonry, and from the
 * west study the same segment is untouched wallpaper with nothing to see through.
 */

const SEG = process.env.SEG ?? 'd.svc_w.4.a';

export default async function digShots({ page, note, pass, fail, skip, shot }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 150; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  if (!await page.evaluate(() => window.__rrr.engine.room.dig)) {
    skip('a dig can be photographed', 'this build is `?dig=0` — re-run with --q "dig=1"');
    return;
  }

  /** Stand `d` back and `side` metres along the wall from the panel's centre, looking at it. */
  const frame = (id, d, side, stage) => page.evaluate(([id, d, side, stage]) => {
    const e = window.__rrr.engine, p = e.room.panelOf(id);
    if (!p) return null;
    if (stage != null) {
      const saved = p.onBreak; p.onBreak = null;
      for (let i = 0; i < 8; i++) p.damage(1e5, { weapon: 'nailgun' });
      p.onBreak = saved;
    }
    const n = p.normal, c = p.root.position;
    // along the wall run = the normal turned 90 degrees in XZ
    const ax = -n.z, az = n.x;
    e.player.pos.set(c.x + n.x * d + ax * side, e.room.floorY, c.z + n.z * d + az * side);
    e.player.vel.set(0, 0, 0);
    // aim at the panel centre from wherever we ended up, so the hole is framed rather than
    // wherever a fixed yaw happened to point
    const yaw = Math.atan2(c.x - e.player.pos.x, c.z - e.player.pos.z);
    e.player.aimYaw = yaw; e.player.aimPitch = 0; e.player.facing = yaw;
    e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true;
    e.gameHud?.setHidden?.(false);
    return { id, stage: p.state.stage, name: p.state.def.name,
      from: [+e.player.pos.x.toFixed(2), +e.player.pos.z.toFixed(2)] };
  }, [id, d, side, stage]);

  const twin = SEG.replace(/\.a$/, '.b');

  const a = await frame(SEG, 3.0, 1.5, 'terminal');
  if (!a) { fail('a dig can be photographed', `no panel "${SEG}"`); return; }
  await step(24);
  await shot('dig-barrier-from-the-passage');
  note(`${a.id} at stage ${a.stage} "${a.name}", camera offset 1.5 m along the wall: `
    + `the segment is dug to the masonry`);

  const b = await page.evaluate((id) => {
    const e = window.__rrr.engine, p = e.room.panelOf(id);
    return { stage: p.state.stage, name: p.state.def.name, pristine: p.pristine };
  }, twin);
  await frame(twin, 3.0, 1.5, null);
  await step(24);
  await shot('dig-same-segment-from-the-other-room');
  note(`${twin} at stage ${b.stage} "${b.name}" (pristine ${b.pristine}) — the SAME shared edge, `
    + `seen from the room on the other side of the brick`);

  // ...and once both faces are gone, both rooms see the same wall.
  await frame(twin, 3.0, 1.5, 'terminal');
  await step(24);
  await shot('dig-both-faces-gone-from-the-other-room');
  const end = await page.evaluate(([x, y]) => {
    const e = window.__rrr.engine;
    const pa = e.room.panelOf(x), pb = e.room.panelOf(y);
    return { a: pa.state.def.name, b: pb.state.def.name,
      blocked: pa.blocksMovement() && pb.blocksMovement() };
  }, [SEG, twin]);
  note(`both faces now "${end.a}" / "${end.b}" and both still block movement: ${end.blocked}`);

  /**
   * ⚠️ AND THE ROUND HAS TO BE ABLE TO START AGAIN. The capture Director calls `resetRound()`
   * every 28 seconds, and `wall.js` says `pristine` is *computed* from the state machine rather
   * than latched precisely so `WallField.resetAll()` demotes for free. `spent` is written the
   * same way and this is the check that it actually is: two barrier panels, reset, must come
   * back pristine, be drawn by the PRISTINE instance again, and own no visible meshes.
   */
  const reset = await page.evaluate(() => {
    const e = window.__rrr.engine;
    e.resetRound();
    const c = e.room.panelCensus();
    const stray = e.room.panels.filter((p) => p.instanced
      && (p.layers.some((l) => l.visible) || p.reveal.visible)).length;
    return { ...c, dig: e.room.digCensus(), stray };
  });
  await step(8);
  note(`after resetRound(): ${reset.pristine}/${reset.panels} pristine, ${reset.spent} spent, `
    + `segments by stage [${reset.dig.byStage.join(', ')}], `
    + `${reset.instanced.live} live pristine instances / ${reset.instanced.liveSpent} spent, `
    + `${reset.stray} instanced panels with a stray visible mesh`);
  /**
   * ⚠️ NOT `pristine === panels`, AND THE FIRST VERSION OF THIS ASSERTION SAID SO AND WAS WRONG.
   * `resetRound()` re-runs `applyExitPlan()`, which starts the live exit at its LOCK's stage —
   * `beams` on seed s4 is stage 3 — so exactly one panel is legitimately not pristine after a
   * reset and always has been. `instancing-1` records the same fact from the other end ("0 or 1
   * non-pristine panels at round start"). The dig-specific claim is the one below.
   */
  const segsBack = reset.dig.byStage[0] === reset.dig.segments;
  (segsBack && reset.spent === 0 && reset.stray === 0 && reset.panels - reset.pristine <= 1)
    ? pass('a round can start again with segments at the barrier',
      `resetRound() put all ${reset.dig.segments} segments back to stage 0, left 0 spent instances `
      + `and 0 stray meshes; the single non-pristine panel is the live exit at its lock's start `
      + `stage, which is the shipped behaviour — so the capture loop's 28 s reset is safe here`)
    : fail('a round can start again with segments at the barrier', JSON.stringify(reset));

  (a.name === 'barrier' && b.pristine && end.blocked)
    ? pass('one shared edge, two independent faces, one barrier between them',
      `${SEG} was at the barrier while its twin ${twin} was still pristine — so digging one side `
      + `changes nothing the other side can see, and neither side ever gets through`)
    : fail('one shared edge, two independent faces, one barrier between them', JSON.stringify({ a, b, end }));
}
