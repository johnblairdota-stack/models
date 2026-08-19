/**
 * 🪜 **THE STEP-UP — a low remnant is not a wall, and nothing else in the house moved.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/aim-step.mjs \
 *        --port 5282 --q "seed=s4" --shots
 *
 * John, after playtesting (2026-08-10): *"if the wall has just the bottom intact because we
 * attacked in the middle the wall can't be passed."* `rules.js` `STEP_H` is the rule and carries
 * the whole decision; this is the instrument.
 *
 * 🚨 **EVERY CHECK HERE THAT COULD BE WRITTEN AS "IT STILL WORKS" IS INSTEAD WRITTEN AS A PAIR.**
 * HANDOFF: *"Five probes on this project have passed against broken builds; the most recent was
 * green because its setup never dressed the body it was asking about."* So:
 *
 *   S1  THE SHIPPED PATH IS UNTOUCHED   3-arg `collide` and 4-arg at 0.30 agree, on a real sill
 *   S2  A SILL YOU COULD NOT PASS, YOU NOW CAN   the same body, the same sill, the two step
 *       heights — the 0.30 arm IS the reintroduction of the defect and must be REFUSED
 *   S3  NOTHING ELSE BECAME WALKABLE   the census, re-taken live, not quoted from a comment
 *   S4  THE CYAN IS STILL NOT STEPPABLE   both arms of `room.setStepGuard()`; the check FAILS
 *       ITSELF if turning the guard off does not let a body through the barrier
 *   S5  IT IS NOT A REFUGE MECHANIC   the hunter's own graph still joins every space to every
 *       other with no dig in it
 *   S6  THE HUNTER DID NOT GET THE STEP   the same sill, the hunter's body and clear height
 */

const SEG_EDGE = process.env.EDGE ?? 'svc_w';

export default async function aimStep({ page, note, pass, fail, skip, shot }) {
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
    if (!e?.room) return null;
    return { STEP_H: R.STEP_H, PASS_H: R.PASS_H, seed: String(e.run.seed),
      free: !!e.room.panels.find((p) => p.spec?.free), radius: e.player.radius,
      floorY: e.room.floorY };
  });
  if (!head) { fail('the build is reachable', 'no engine.room'); return; }
  if (!head.free) { skip('the step-up can be measured', 'no free dig faces — re-run with --q "dig=free"'); return; }
  note(`seed "${head.seed}" · STEP_H robot ${head.STEP_H.robot} / hunter ${head.STEP_H.hunter} `
    + `· PASS_H robot ${head.PASS_H.robot} / hunter ${head.PASS_H.hunter} · body r ${head.radius}`);

  // =========================================================================
  // shared driver — build a REAL sill, then push bodies at it
  // =========================================================================
  /**
   * 🚨 **THE SILL IS DUG, NOT ASSEMBLED.** The defect John reported is what the BRUSH leaves
   * behind when you aim at chest height, so the fixture has to be the brush: real blows, at real
   * world points, through the shipped `applyHit`. A hand-built collider box would be a fixture
   * for a bug we do not have. `sillH` names the height of the top of the remnant.
   */
  const makeSill = (sillH) => page.evaluate(async ([edge, sillH]) => {
    const e = window.__rrr.engine;
    // a fresh house, then the house-wide unlock: this is the post-unlock game — see STEP_H
    e.room.setDigPlan({ seed: e.run.seed });
    e.room.unlockBarrier();
    const face = e.room.panels.find((p) => p.spec?.free && p.spec.edge === edge && p.spec.side === 'a');
    if (!face) return null;
    const c = face.root.position, base = c.y - face.height / 2;
    const V = e.player.pos.constructor;
    // march a horizontal line of blows whose brush BOTTOM sits exactly on `sillH`
    const R = face.field.brush.radius;
    const hits = [];
    for (const both of [face, face.twin]) {
      if (!both) continue;
      for (let k = -3; k <= 3; k++) {
        const u = 0.5 + (k * R * 1.3) / both.width;
        for (let row = 0; row < 5; row++) {
          const y = base + sillH + R + row * R * 1.1;
          if (y > base + both.height - R * 0.5) break;
          const p = both.pointAt(u, (y - base) / both.height, new V());
          for (let n = 0; n < 3; n++) both.applyHit(p, 1);
          hits.push(1);
        }
      }
    }
    const ch = face.openChannel();
    return { id: face.id, base: +base.toFixed(3), blows: hits.length,
      width: +(ch.width ?? 0).toFixed(3), h: +(ch.height ?? 0).toFixed(3),
      boxes: face.solidBoxes().map((b) => +(b.max.y - base).toFixed(3)).sort((a, b) => a - b) };
  }, [SEG_EDGE, sillH]);

  /** Shove a circle at the face and report how far past its plane it got. */
  const shove = (id, radius, passH, stepH, steps = 220) =>
    page.evaluate(([id, radius, passH, stepH, steps]) => {
      const e = window.__rrr.engine;
      const p = e.room.panelOf(id);
      const V = e.player.pos.constructor;
      const n = p.normal, c = p.root.position;
      const pos = new V(c.x + n.x * 1.6, e.room.floorY, c.z + n.z * 1.6);
      const start = e.room.spaceAt(pos)?.id ?? null;
      let sill = 0;
      for (let i = 0; i < steps; i++) {
        pos.set(pos.x - n.x * 0.05, e.room.floorY, pos.z - n.z * 0.05);
        pos.copy(e.room.collide(pos, radius, passH, stepH));
        sill = Math.max(sill, e.room.sillTop());
      }
      const past = -((pos.x - c.x) * n.x + (pos.z - c.z) * n.z);
      return { start, ended: e.room.spaceAt(pos)?.id ?? null, past: +past.toFixed(3),
        sill: +sill.toFixed(3) };
    }, [id, radius, passH, stepH, steps]);

  // a sill that is squarely inside the new band and squarely outside the old one
  const SILL = 0.46;
  const built = await makeSill(SILL);
  if (!built) { fail('a sill can be dug', `no free face on edge ${SEG_EDGE}`); return; }
  await step(4);
  note(`dug ${built.blows} blow-groups into ${built.id} leaving a ~${SILL} m sill: `
    + `channel ${built.width} m wide / ${built.h} m tall, remaining box tops above the panel base `
    + `${JSON.stringify(built.boxes.slice(0, 8))}`);

  // =========================================================================
  // S1 · THE SHIPPED PATH IS BYTE-FOR-BYTE UNTOUCHED
  // =========================================================================
  const legacy = await shove(built.id, head.radius, head.PASS_H.robot, undefined);
  const explicit = await shove(built.id, head.radius, head.PASS_H.robot, 0.30);
  (legacy.past === explicit.past && legacy.ended === explicit.ended)
    ? pass('the shipped collision path did not move',
      `\`collide(p, r, 1.70)\` and \`collide(p, r, 1.70, 0.30)\` end at the identical ${legacy.past} m `
      + `past the same face — the fourth argument defaults to the literal that used to be written `
      + `inside \`boxesNear\`, so the hunter, every scenario and \`?dig=0\` are unchanged`)
    : fail('the shipped collision path did not move', JSON.stringify({ legacy, explicit }));

  // =========================================================================
  // S2 · THE SILL — refused at 0.30, passed at 0.55. The 0.30 arm IS the reintroduction.
  // =========================================================================
  const before = legacy;
  const after = await shove(built.id, head.radius, head.PASS_H.robot, head.STEP_H.robot);
  note(`the same body at the same sill: step 0.30 -> ${before.past} m past (${before.start} -> `
    + `${before.ended}) · step ${head.STEP_H.robot} -> ${after.past} m past (${after.start} -> `
    + `${after.ended}), stepping a sill measured at ${after.sill} m`);
  (before.past <= 0.05 && after.past > 0.25 && after.ended && after.ended !== after.start)
    ? pass('a low remnant is no longer a wall — and the old build still refuses it',
      `a dug channel with a ${SILL} m sill under it refuses the body at the shipped step `
      + `(${before.past} m past, still in ${before.start}) and passes it at ${head.STEP_H.robot} `
      + `(${after.past} m past, ${after.start} -> ${after.ended}). The failing arm is the shipped `
      + `build, driven in the same page on the same geometry, so this cannot be green against a `
      + `build where the step does nothing.`)
    : fail('a low remnant is no longer a wall — and the old build still refuses it',
      JSON.stringify({ before, after, built }));

  // ...and the picture, taken HERE while the sill is the only thing in the frame. (Shot at the
  // end of the run instead, it photographed the S4 fixture — every face in the house dug flat,
  // a cloud of debris in flight — which is a picture of the instrument and not of the mechanic.)
  await page.evaluate(([id]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    const n = p.normal, c = p.root.position;
    e.player.pos.set(c.x + n.x * 1.55, e.room.floorY, c.z + n.z * 1.55);
    const yaw = Math.atan2(-n.x, -n.z);
    e.player.aimYaw = yaw; e.player.facing = yaw; e.player.aimPitch = -0.16;
    e.cam.yaw = yaw; e.cam.pitch = -0.16; e.cam._first = true;
  }, [built.id]);
  await step(60);            // let the debris land before the picture
  await shot('aimstep-sill-BEFORE');
  await page.evaluate(async ([id]) => {
    const R = await import('/src/game/rules.js');
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    const n = p.normal, c = p.root.position;
    // walk the body through the sill the way `shove` did, so the frame is the real end state
    const pos = e.player.pos;
    for (let i = 0; i < 40; i++) {
      pos.set(pos.x - n.x * 0.05, e.room.floorY, pos.z - n.z * 0.05);
      pos.copy(e.room.collide(pos, e.player.radius, R.PASS_H.robot, R.STEP_H.robot));
    }
  }, [built.id]);
  await step(20);
  await shot('aimstep-sill-THROUGH');
  note('`aimstep-sill-{BEFORE,THROUGH}` — the remnant, then the body standing where the shipped '
    + 'build refuses it. Judge whether the pass reads as a STEP rather than as clipping; '
    + '`Player.stepLift` is the model offset that is supposed to sell it and it is a LOOK claim.');

  // =========================================================================
  // S3 · NOTHING ELSE IN THE HOUSE BECAME WALKABLE — the census, re-taken live
  // =========================================================================
  const census = await page.evaluate(async () => {
    const R = await import('/src/game/rules.js');
    const e = window.__rrr.engine;
    const fy = e.room.floorY ?? 0, lo = 0.30, hi = R.STEP_H.robot;
    const inBand = (b) => (b.max.y - fy) > lo + 1e-6 && (b.max.y - fy) <= hi + 1e-6;
    const statics = [];
    for (const sp of e.room.spaces) {
      for (const b of sp.colliders) if (inBand(b)) statics.push({ space: sp.id, top: +(b.max.y - fy).toFixed(3) });
    }
    const ext = (e.room.exteriorSolids ?? []).filter(inBand)
      .map((b) => ({ top: +(b.max.y - fy).toFixed(3) }));
    // the lowest static anywhere, so the margin is reported rather than assumed
    let lowest = Infinity, who = null;
    for (const sp of e.room.spaces) {
      for (const b of sp.colliders) if (b.max.y - fy < lowest) { lowest = b.max.y - fy; who = sp.id; }
    }
    let extLow = Infinity;
    for (const b of (e.room.exteriorSolids ?? [])) extLow = Math.min(extLow, b.max.y - fy);
    return { statics, ext, lowest: +lowest.toFixed(3), who, hi,
      extLow: Number.isFinite(extLow) ? +extLow.toFixed(3) : null,
      total: e.room.spaces.reduce((n, s) => n + s.colliders.length, 0) };
  });
  note(`census: lowest static collider in the house ${census.lowest} m (${census.who}) of `
    + `${census.total} · lowest exterior solid ${census.extLow} m · in the band (0.30, ${census.hi}]: `
    + `${census.statics.length} statics, ${census.ext.length} exterior`);
  (census.statics.length === 0 && census.ext.length === 0)
    ? pass('the step-up makes nothing in the house walkable except dug wall',
      `no static collider and no exterior solid has a top in (0.30, ${census.hi}] m. The lowest `
      + `static anywhere is ${census.lowest} m (${census.who}) — a margin of `
      + `${(census.lowest - census.hi).toFixed(2)} m — and the lowest exterior solid is `
      + `${census.extLow} m. The only boxes the step can newly drop are wall remnants, which is `
      + `the mechanic.`)
    : fail('the step-up makes nothing in the house walkable except dug wall',
      JSON.stringify({ statics: census.statics.slice(0, 8), ext: census.ext.slice(0, 8) }));

  // =========================================================================
  // S4 · THE CYAN — and the check fails itself if the guard is not what stops it
  // =========================================================================
  /**
   * 🚨 **THE DANGEROUS SHAPE IS A BARRIER RECT WITH A TOP UNDER THE STEP** — drop the box and the
   * cyan in it goes with it. So the fixture is the state that produces the most of them: EVERY
   * free face in the house dug flat to depth 1, at which point `passable(i)` is exactly
   * `!barrier[i]` and `solidRects` IS the barrier map. Then two questions, in that order:
   *
   *   a) the physical one — a body driven at a fully-dug DUD (barrier over its whole face) is
   *      still refused. That is John's settled rule and it must hold at any step height.
   *   b) the structural one — `room.stepCensus()` walks every panel box through the SAME
   *      `steppableBoxes` the collider uses and reports which were dropped and which hold
   *      barrier. **No dropped box may hold barrier.** And the ablation must reproduce the
   *      defect: `setStepGuard(false)` has to make dropped-and-barriered boxes appear, or the
   *      green arm above is measuring nothing and this check fails ITSELF.
   *
   * ⚠️ (b) is the load-bearing one and (a) alone would not have been enough — measured while
   * writing this: at the interconnect's own flanks the barrier's lower boundary crosses 0.30 m
   * inside HALF a body width, so a body gets through that spot at the shipped step too. A pass/
   * fail flip on one drive would have read green on a broken guard. The invariant does not.
   */
  /**
   * 🚨 **AND THE FIRST FIXTURE FOR THIS ONE SILENTLY DISARMED ITSELF, WHICH IS THE HAZARD THIS
   * PROJECT KEEPS RE-LEARNING.** It dug EVERY free face in the house flat — which digs this
   * run's interconnect, which fires `room.js`'s `onPromote` unlock hook, which drops every
   * barrier in the house. It then reported `barrier 0/960` on every face and "no
   * dropped-and-barriered boxes" **with the guard off**, i.e. a green-looking setup measuring an
   * unbarriered wall. Only faces in `dig.link` fire that hook, so the fixture works on a DUD, and
   * the shipped interconnect shape is placed on it by hand.
   */
  const cyanSetup = await page.evaluate(async () => {
    const D = await import('/src/game/dig.js');
    const e = window.__rrr.engine;
    e.room.setDigPlan({ seed: e.run.seed });          // locked house, barriers up, damage cleared
    const V = e.player.pos.constructor;
    const faces = e.room.panels.filter((p) => p.spec?.free);
    const isDud = (f) => f.field.stats().barrierCells === f.field.stats().cells;
    const duds = faces.filter((f) => isDud(f) && f.twin && isDud(f.twin));
    if (duds.length < 2) return { faces: faces.length, duds: duds.length, dud: null, ic: null };
    // one dud left ALONE, for the physical check: dug flat with its barrier fully up
    const solid = duds.find((f) => f.id !== duds[0].id && f.spec.edge !== duds[0].spec.edge) ?? duds[1];
    // ...and one dud given the SHIPPED interconnect shape, so the barrier has a low boundary
    const ic = duds[0];
    ic.setInterconnect(0.5, 0.5, (D.IC_W / 2) / ic.width, (D.IC_H / 2) / ic.height, 0);
    if (ic.twin?.field) { ic.twin.field.mirrorBarrierFrom(ic.field); ic.twin._solidBoxes = null; }

    const digFlat = (f) => {
      const R = f.field.brush.radius;
      const base = f.root.position.y - f.height / 2;
      for (let u = 0.05; u <= 0.95; u += (R * 0.8) / f.width) {
        for (let y = base + R * 0.4; y < base + f.height; y += R * 0.8) {
          const p = f.pointAt(u, (y - base) / f.height, new V());
          for (let n = 0; n < 4; n++) f.applyHit(p, 1);
        }
      }
      f.field.flush();
    };
    for (const f of [ic, ic.twin, solid, solid.twin]) if (f) digFlat(f);
    const say = (f) => {
      const st = f.field.stats();
      return `${f.id} barrier ${st.barrierCells}/${st.cells} maxDepth ${st.maxDepth.toFixed(2)} `
        + `rects ${f.field.solidRects(false).length}`;
    };
    return { faces: faces.length, duds: duds.length, dud: solid.id, ic: ic.id,
      unlocked: e.room.digCensus().opened ?? null, table: [say(ic), say(solid)] };
  });
  await step(4);
  note(`two DUD pairs dug flat — ${cyanSetup.duds} dud faces available. One (${cyanSetup.dud}) `
    + `keeps its barrier whole; the other (${cyanSetup.ic}) is given the shipped interconnect `
    + `shape first, so its barrier has a lower boundary that crosses the step band. Neither is `
    + `in \`dig.link\`, so the house-wide unlock never fires. ${(cyanSetup.table ?? []).join(' | ')}`);

  if (cyanSetup.dud) {
    const dudPush = await shove(cyanSetup.dud, head.radius, head.PASS_H.robot, head.STEP_H.robot);
    (dudPush.past <= 0.05)
      ? pass('a wall dug clean to the cyan is still not a passage, at the raised step',
        `${cyanSetup.dud} is dug over its whole face and the body gets ${dudPush.past} m `
        + `past it — still in ${dudPush.start}. John has settled the cyan twice.`)
      : fail('a wall dug clean to the cyan is still not a passage, at the raised step',
        JSON.stringify(dudPush));
  } else {
    skip('a wall dug clean to the cyan is still not a passage, at the raised step',
      `fewer than two fully-barriered dud pairs after the plan was applied `
      + `(${cyanSetup.duds} dud faces) — the fixture cannot be built on this seed`);
  }

  /**
   * 🚨 **THE INVARIANT IS "THE RAISED STEP DROPS NO BARRIER BOX THE SHIPPED 0.30 WOULD NOT HAVE",
   * AND THE STRONGER ONE IS FALSE ON THE SHIPPED BUILD — MEASURED, NOT ASSUMED.** The first
   * version asserted *no* dropped box may hold barrier and found ten, all with tops at 0.093 /
   * 0.187 / 0.280 m, i.e. all of them already stepped over by the literal `0.3` this project has
   * shipped since `boxesNear` was written. That is a pre-existing property of the game and not
   * something this slice may quietly change: `channel()` measures from 0.30 too, so the collider
   * and `blocksMovement` agree about it. **Reported as a finding; the bar here is the delta.**
   */
  const inv = await page.evaluate(async () => {
    const R = await import('/src/game/rules.js');
    const e = window.__rrr.engine;
    const BASE = 0.30, fy = e.room.floorY;
    const read = () => {
      const c = e.room.stepCensus(fy, R.STEP_H.robot);
      const dropped = c.boxes.filter((b) => b.dropped);
      const bar = dropped.filter((b) => b.barrier);
      return { guard: c.guard, boxes: c.boxes.length, dropped: dropped.length,
        // the ones the SHIPPED step would already have dropped, and the ones it would not
        old: bar.filter((b) => b.top <= fy + BASE + 1e-6).map((b) => `${b.panel}@${b.top}`),
        leak: bar.filter((b) => b.top > fy + BASE + 1e-6).map((b) => `${b.panel}@${b.top}`) };
    };
    const on = read();
    e.room.setStepGuard(false);
    const off = read();
    e.room.setStepGuard(true);
    return { on, off, BASE };
  });
  note(`stepCensus at STEP_H.robot over ${inv.on.boxes} panel boxes: guard ON — ${inv.on.dropped} `
    + `dropped, ${inv.on.old.length} of them barrier boxes the SHIPPED 0.30 step already dropped, `
    + `${inv.on.leak.length} NEWLY dropped barrier boxes · guard OFF — ${inv.off.dropped} dropped, `
    + `${inv.off.leak.length} newly dropped barrier boxes `
    + `(${inv.off.leak.slice(0, 4).join(', ') || 'none'})`);
  if (inv.off.leak.length === 0) {
    fail('the raised step never drops a barrier box the shipped step would have kept — AND THE '
      + 'GUARD IS WHAT STOPS IT',
      `the ablation did not reproduce the defect: with \`setStepGuard(false)\` there are still `
      + `zero barrier boxes dropped above ${inv.BASE} m, so this fixture never dressed the body it `
      + `is asking about and a green guard-ON arm would prove nothing. Fix the fixture, not the code.`);
  } else if (inv.on.leak.length === 0) {
    pass('the raised step never drops a barrier box the shipped step would have kept — AND THE '
      + 'GUARD IS WHAT STOPS IT',
      `zero barrier boxes above ${inv.BASE} m are dropped with the guard on, against `
      + `${inv.off.leak.length} with it off — same page, same geometry. The census walks the `
      + `collider's OWN \`steppableBoxes\` and re-reads \`field.barrier\` independently rather than `
      + `trusting the flag it is checking. ⚠️ FINDING, PRE-EXISTING AND NOT THIS SLICE'S: `
      + `${inv.on.old.length} barrier boxes with tops at or under ${inv.BASE} m ARE stepped over, `
      + `and always were — the shipped literal 0.3 in \`boxesNear\` has never asked what is in the `
      + `box, and \`channel()\` measures from the same 0.30 so nothing disagrees about it.`);
  } else {
    fail('the raised step never drops a barrier box the shipped step would have kept — AND THE '
      + 'GUARD IS WHAT STOPS IT',
      `${inv.on.leak.length} newly dropped with the guard ON: ${inv.on.leak.slice(0, 6).join(', ')}`);
  }

  // =========================================================================
  // S5 · IT IS NOT A REFUGE MECHANIC
  // =========================================================================
  /**
   * A refuge needs a space the player can reach and the hunter cannot — so the question is not
   * *"is there one"* but *"did this slice ADD one"*.
   *
   * 🚨 **AND THE HOUSE ALREADY HAS EXACTLY ONE, ON PURPOSE.** `dig.md` D7 and `rules.js` `PASS_H`
   * both name it: *"the chapel is a refuge that growth takes away"*. Measured here rather than
   * quoted: of 30 ordered space pairs, the 10 that are not joined by doors alone at a stage-3
   * hunter's clearance are **every pair involving the chapel**, and no others. The first version
   * of this check asserted "all 30 joined" and failed the shipped build, which would have been
   * filed as a regression this slice caused.
   *
   * So the assertion is *"the door graph's unreachable set is exactly the chapel"*. The step-up
   * cannot move it — it is not an input to any hunter query — and this fails the day either a
   * second refuge appears or the chapel stops being one.
   */
  /**
   * ⚠️ **THE DOOR GRAPH IS BUILT HERE RATHER THAN ASKED FOR, AND THE FIRST VERSION OF THIS CHECK
   * WAS WRONG BECAUSE IT ASKED.** `pathPortals` returns A shortest route, not the door-only one,
   * so "did the route it happened to pick contain a breach" answers a different question — it
   * read 11 of 30 on a house whose walls this scenario had already dug flat, which is a fact
   * about the shortcut and not about connectivity. Filtering `room.portals()` to `kind: 'door'`
   * and running the BFS over that is the question actually being asked.
   */
  const graph = await page.evaluate(async () => {
    const R = await import('/src/game/rules.js');
    const e = window.__rrr.engine;
    const ids = e.room.spaces.map((s) => s.id);
    const doors = e.room.portals().filter((p) => p.kind === 'door' && p.a !== p.b
      && p.w >= 1.32 && (p.h ?? 99) >= R.PASS_H.hunter);
    const adj = new Map(ids.map((i) => [i, []]));
    for (const d of doors) { adj.get(d.a)?.push(d.b); adj.get(d.b)?.push(d.a); }
    const bad = [];
    for (const a of ids) {
      const seen = new Set([a]); const q = [a];
      while (q.length) { const c = q.shift(); for (const n of adj.get(c) ?? []) if (!seen.has(n)) { seen.add(n); q.push(n); } }
      for (const b of ids) if (b !== a && !seen.has(b)) bad.push(`${a}>${b}`);
    }
    return { n: ids.length, doors: doors.length, pairs: ids.length * (ids.length - 1), bad };
  });
  const strays = graph.bad.filter((p) => !p.split('>').includes('chapel'));
  note(`door-only graph for a stage-3 hunter (${graph.doors} OPEN connectors at >= 1.32 m clear `
    + `and >= 2.40 m high): ${graph.pairs - graph.bad.length} of ${graph.pairs} space pairs joined; `
    + `the ${graph.bad.length} that are not are ${strays.length ? 'NOT all' : 'all'} chapel pairs`);
  (strays.length === 0 && graph.bad.length > 0)
    ? pass('the step-up adds no refuge — the only one is the chapel, and it was already authored',
      `every one of the ${graph.bad.length} space pairs a full-grown hunter cannot walk door-to-door `
      + `involves the chapel, which \`dig.md\` D7 and \`rules.js\` \`PASS_H\` both name as the `
      + `intended refuge. The other ${graph.pairs - graph.bad.length} pairs are joined by OPEN `
      + `connectors alone — no breach, no dig segment — so a sill the player steps and the hunter `
      + `does not is a shortcut, never a room it cannot follow you into. And the step-up is not an `
      + `input to any hunter query, so it cannot move this set at all.`)
    : fail('the step-up adds no refuge — the only one is the chapel, and it was already authored',
      graph.bad.length === 0
        ? 'the chapel is no longer a refuge — D7 has been lost, which is a design change'
        : `${strays.length} non-chapel pairs are unreachable by door alone: ${strays.slice(0, 6).join(', ')}`);

  // =========================================================================
  // S6 · THE HUNTER DID NOT GET THE STEP, AND ITS GRAPH AGREES WITH ITS BODY
  // =========================================================================
  await makeSill(SILL);
  await step(3);
  const h1 = await shove(built.id, 0.42, head.PASS_H.hunter, head.STEP_H.hunter);
  const h3 = await shove(built.id, 0.66, head.PASS_H.hunter, head.STEP_H.hunter);
  const portalH = await page.evaluate(([id]) => {
    const e = window.__rrr.engine;
    const p = e.room.portals().find((q) => q.id === id);
    const panel = e.room.panelOf(id);
    return { portal: p ? { w: +p.w.toFixed(3), h: +(p.h ?? -1).toFixed(3), kind: p.kind } : null,
      channel: panel.openChannel() };
  }, [built.id]);
  note(`hunter at the same sill: stage 1 ${h1.past} m past · stage 3 ${h3.past} m past · the graph `
    + `sizes this face at ${JSON.stringify(portalH.portal)} from a channel measured at step 0.30`);
  (h1.past <= 0.05 && h3.past <= 0.05)
    ? pass('the hunter did not get the step, and its BFS is computed at its own step height',
      `both hunter bodies are refused at the sill the player just walked over (${h1.past} / `
      + `${h3.past} m past). \`openChannel()\` — the number \`breachPortals\` sizes the graph with `
      + `— measures from 0.30 m, which IS \`STEP_H.hunter\`, so the pathfinder and `
      + `\`collide(..., STEP_H.hunter)\` are computed at the same number and cannot disagree. `
      + `\`pathPortals\` has no caller outside \`hunter-ai.js\`, so no second graph exists.`)
    : fail('the hunter did not get the step, and its BFS is computed at its own step height',
      JSON.stringify({ h1, h3, portalH }));

}
