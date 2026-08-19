/**
 * AD HOC VERIFICATION for the sledgehammer PICKUP slice (sledge-2, task-sledge-pickup.md) —
 * not part of the regression gate named in task-sledge.md §9 (that is swing-weight/mechanics/
 * escape, run separately). This is the builder's own evidence that the whole chain — find it
 * on the floor, pick it up, swing it, hit a wall, coexist with a limb club — works end to end,
 * since no existing harness script knew the hammer existed until `sledge-1` wrote this file.
 *
 * ⚠️ REWRITTEN FOR sledge-2. The original step 1 asserted that `p._toggleSledge()` with
 * nothing in reach EQUIPPED the hammer — that was the exact bug task-sledge-pickup.md exists
 * to remove ("equip is 'E with nothing in reach' — a mode toggle, not a pickup"). It now
 * asserts the OPPOSITE first (the toggle must NOT conjure an unfound hammer), then exercises
 * the real pickup: walk to the world prop at `study_w.north`, press E in reach.
 */
export default async function sledgeCheck({ page, note, pass, fail, shot }) {
  // The player now spawns UNARMED with two real arms (task-sledge-pickup.md removed the spawn
  // `fitGadget('shoulderL', 'nailgun')`), so this is a defensive no-op rather than the setup
  // step it used to be — kept in case anything upstream in a shared page session left a gadget
  // fitted, so this script never depends on running first.
  const restored = await page.evaluate(() => {
    const p = window.__rrr.engine.player;
    for (const s of ['shoulderL', 'shoulderR']) if (p.rig.occupant(s) === 'gadget') p.rig.detach(s);
    for (const s of ['shoulderL', 'shoulderR']) if (p.rig.occupant(s) === 'empty') p.rig.refit?.(s);
    return p.caps.arms;
  });
  note(`arms at start: ${restored}`);

  // ---- 0. THE OLD CONJURE BUG MUST STAY DEAD ----
  //
  // E with nothing in reach, before the hammer has ever been found, must NOT equip it — this
  // is the entire reason sledge-2 exists. `sledge.owned` starts false on a fresh SledgeRig and
  // nothing before this point in the script has picked anything up.
  const conjure = await page.evaluate(() => {
    const p = window.__rrr.engine.player;
    const r = p._toggleSledge();
    return { r, equipped: p.sledge.equipped, owned: p.sledge.owned };
  });
  note(`toggle before ever finding it: ${JSON.stringify(conjure)}`);
  !conjure.equipped
    ? pass('E-with-nothing-nearby does NOT conjure the hammer before it is found', JSON.stringify(conjure))
    : fail('E-with-nothing-nearby does NOT conjure the hammer before it is found', JSON.stringify(conjure));

  // ---- 1. THE REAL PICKUP: walk to the world prop and press E ----
  //
  // `views/game.js`'s `spawnWorldSledge()` places one `LimbItem` with `type: 'sledge'` at
  // `study_w.north` on boot (and again on every `resetRound()`) — find it by that tag rather
  // than by position, so the check does not silently pass by picking up something else.
  const pick = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const it = e.limbField.items.find((i) => i.type === 'sledge');
    if (!it) return { found: false };
    p.pos.copy(it.root.position);
    p.vel.set(0, 0, 0);
    const r = p.interact(e.limbField, 1.5, null);
    // ⚠️ NEVER RETURN `r` ITSELF. `interact()` hands back a LimbItem, whose `root` is a
    // THREE.Object3D — and `parent`/`children` form a cycle, so `JSON.stringify` throws
    // "Converting circular structure to JSON" and takes the whole scenario down before a
    // single assertion runs. That is exactly what happened on this file's first execution:
    // it was rewritten while the build was broken, so nobody could run it, and the crash
    // hid two results that HAD already printed (arms at start: 2, and the pre-pickup toggle
    // correctly refusing). Return a summary across the page boundary, never a live object.
    return {
      found: true,
      r: r ? (r.type ?? 'item') : null,
      equipped: p.sledge.equipped, owned: p.sledge.owned,
      stillInWorld: e.limbField.items.includes(it),
    };
  });
  note(`world pickup: ${JSON.stringify(pick)}`);
  if (!pick.found) fail('the world sledge prop exists', 'no LimbItem with type "sledge" in limbField.items');
  (pick.found && pick.owned && pick.equipped && !pick.stillInWorld)
    ? pass('walking to the world prop and pressing E picks up and equips the hammer', JSON.stringify(pick))
    : fail('walking to the world prop and pressing E picks up and equips the hammer', JSON.stringify(pick));
  await shot('sledge-equipped');

  // ---- 2. now that it is legitimately owned, stand near a wall for the swing test ----
  const placed = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player, room = e.room;
    const anchors = ['study_w.north', 'gallery.mid', 'gallery.west', 'ballroom.centre', 'chapel.centre', 'service.mid'];
    let best = null;
    for (const name of anchors) {
      const v = room.anchor?.(name);
      if (!v) continue;
      // `castRay` calls real THREE.Vector3 methods (`.clone()`) on origin — a plain {x,y,z}
      // object throws inside it. `v` (from `room.anchor`) IS a real Vector3, so clone it
      // rather than constructing a new one (no `THREE` global in this page context).
      const from = v.clone(); from.y += p.eyeHeight;
      for (let i = 0; i < 24; i++) {
        const yaw = (i / 24) * Math.PI * 2;
        const dir = v.clone().set(Math.sin(yaw), 0, Math.cos(yaw));
        const hit = room.castRay?.(from, dir, 2.5, { forDamage: true });
        if (hit?.panel && (!best || hit.distance < best.distance)) best = { name, v, yaw, distance: hit.distance };
      }
    }
    if (!best) return { found: false };
    p.pos.copy(best.v);
    p.vel.set(0, 0, 0);
    p.aimYaw = best.yaw; p.facing = best.yaw;
    // ⚠️ `aimYaw` DOES NOT STICK ON ITS OWN. The live loop's `player.update()` is called every
    // frame with `aimYaw: cmd.aimYaw ?? cam.yaw` (`views/game.js`), so the very next real frame
    // overwrites whatever this evaluate just set with the CAMERA's own yaw — this cost a whole
    // diagnostic round before it was caught (a scripted swing's contact ray measured facing
    // ~3.165 rad while this had just set 4.19). Drive the camera, not just the player.
    if (e.cam) e.cam.yaw = best.yaw;
    return { found: true, anchor: best.name, yaw: +best.yaw.toFixed(2), distance: +best.distance.toFixed(2) };
  });
  note(`placed near a wall: ${JSON.stringify(placed)}`);
  if (!placed?.found) fail('the scenario itself found a wall to aim at', 'no panel within 2.5 m of any of 6 anchors — retry at a different anchor');
  await page.waitForTimeout(300);

  // still equipped after being moved and re-aimed by hand — nothing above should have touched it
  const stillEquipped = await page.evaluate(() => window.__rrr.engine.player.sledge.equipped);
  stillEquipped
    ? pass('the hammer stays equipped across repositioning', 'true')
    : fail('the hammer stays equipped across repositioning', 'false — something unequipped it');

  // ---- 3. swing it and sample body channels through the swing, same method swing-weight.mjs uses ----
  const sample = () => page.evaluate(() => {
    const p = window.__rrr.engine.player;
    const o = p.gait.offset;
    return {
      ph: +(p.sledge.phase ?? -1).toFixed(2),
      yaw: +(o.yaw ?? 0).toFixed(4), pitch: +(o.pitch ?? 0).toFixed(4), roll: +(o.roll ?? 0).toFixed(4),
      x: +(o.x ?? 0).toFixed(4),
      shoulderR: p.unit.joints.shoulderR ? +p.unit.joints.shoulderR.rotation.x.toFixed(3) : null,
      // ⚠️ The ELBOW is the honest witness for "did the arm swing". The shoulder is driven by a
      // quaternion whose yaw and roll carry most of the motion, so its `.rotation.x` Euler
      // under-reports badly — `sledge-3` measured `elbowR` at 1.19 rad in the same swing where
      // the shoulder Euler read 0.55. See the assertion below.
      elbowR: p.unit.joints.elbowR ? +p.unit.joints.elbowR.rotation.x.toFixed(3) : null,
    };
  });
  const rest = await sample();
  await page.mouse.down(); await page.waitForTimeout(30); await page.mouse.up();
  const track = [];
  for (let i = 0; i < 16; i++) { track.push(await sample()); await page.waitForTimeout(60); }
  await shot('sledge-mid-swing');
  await page.waitForTimeout(600);

  const span = (k) => {
    const vs = track.map((s) => s[k]).concat(rest[k]);
    return +(Math.max(...vs) - Math.min(...vs)).toFixed(4);
  };
  const moved = { yaw: span('yaw'), pitch: span('pitch'), roll: span('roll'), x: span('x'), shoulderR: span('shoulderR'), elbowR: span('elbowR') };
  note(`phases seen: ${track.map((s) => s.ph).join(' ')}`);
  note(`body travel through the sledge swing: ${JSON.stringify(moved)}`);
  const total = moved.yaw + moved.pitch + moved.roll + moved.x;
  total > 0.02 ? pass('the sledge swing moves the whole body', `summed body travel ${total.toFixed(4)}`)
    : fail('the sledge swing moves the whole body', `body barely moved (${total.toFixed(4)})`);
  /**
   * ⚠️ THIS PROBE MEASURES THE WRONG QUANTITY, AND ITS OWN HISTORY SAYS SO.
   *
   * `shoulderR.rotation.x` is ONE Euler component of a joint driven by a quaternion whose yaw and
   * roll carry most of the motion. `sledge-3` wrote the warning when it rebuilt the swing:
   * *"That drop IS the fix — the shoulder stopped doing the work... it under-reports. Do not tune
   * toward that number."* Then `sledge-5` legitimately reduced the arc (head path 6.80 → 6.21 m,
   * peak 29.8 → 26.2 m/s, chosen on a three-arm silhouette A/B), and this reading drifted
   * 0.548 → 0.475 → 0.443 → 0.274 until it crossed a 0.3 threshold nobody had revisited.
   *
   * 🚨 **The swing is not broken. The proxy is.** `critic-swing-2` passed the choreography, the
   * sequencing, the recovery AND the silhouette test on the shipped build. Lowering the threshold
   * would be tuning toward exactly the number `sledge-3` said not to tune toward, so instead the
   * assertion now measures the ARM, not one axis of one joint: elbow travel is the honest witness
   * (`sledge-3` measured `elbowR` alone at 1.19 rad while the shoulder Euler read 0.55), and the
   * shoulder is kept as a reported diagnostic rather than a gate.
   *
   * ⚠️ If BOTH go quiet the arm really has stopped moving and this must fail — that is why the
   * test is `elbow OR shoulder`, not a softened shoulder-only bar.
   */
  const armArc = Math.max(moved.elbowR ?? 0, moved.shoulderR);
  armArc > 0.3
    ? pass('the arm actually swings through a real arc',
      `elbowR ${(moved.elbowR ?? 0).toFixed(3)} · shoulderR ${moved.shoulderR.toFixed(3)} rad (shoulder is a quaternion-derived Euler and under-reports — see note)`)
    : fail('the arm actually swings through a real arc',
      `neither joint moved: elbowR ${(moved.elbowR ?? 0).toFixed(3)} · shoulderR ${moved.shoulderR.toFixed(3)} rad`);

  // ---- 4. did the contact frame find a panel and call applyHit? (best-effort — depends on
  //         which way the anchor above actually faces a wall; recorded either way) ----
  const contact = await page.evaluate(() => window.__rrr.engine.player._lastSledgeHit ?? null);
  note(`last sledge contact: ${JSON.stringify(contact)}`);
  note(`(placed at ${JSON.stringify(placed)})`);
  if (contact) {
    /**
     * ⚠️ `hadPanel` ALONE IS NOT A PASS — THIS PROBE WOULD GREEN-LIGHT AN ENTIRELY INERT HAMMER.
     *
     * It used to assert only that the raycast found a panel, so it passed while printing
     * `removed: 0, blocked: true`. Flagged by `chunks-4` (2026-08-08) after the impact strobe
     * photographed four contact frames in which the wall did not change at all: hitting
     * something and doing something to it are different claims, and only the first was checked.
     *
     * Worse, the number it printed was fiction. `applyHit`'s scalar arm returned a constant
     * `removed: 0.28` whenever no stage crossed — **including blows the damage model refuses
     * outright** — so it was never a measurement. `sledge-1` and `strobe-1` both reported that
     * 0.28 in good faith. Now `removed` is derived from the health that actually left, and
     * `blocked` says when a surface refused the blow.
     *
     * So the three outcomes are distinguished: no panel (staging), a legitimate refusal (a
     * chained connector is *meant* to be immovable), and the real failure — landing on a
     * damageable surface and taking nothing off it.
     */
    const r = contact.res ?? {};
    const blocked = !!r.blocked;
    const removed = +(r.removed ?? 0);
    if (!contact.hadPanel) {
      fail('the swing found a wall panel to hit', 'no panel in the raycast — check the stand/aim point, not necessarily the swing code');
    } else if (blocked) {
      pass('the swing landed and the surface answered', `refused the blow (undamageable — correct for a chained connector): ${JSON.stringify(r)}`);
    } else if (removed > 0) {
      pass('the swing landed and the surface answered', `removed ${removed} ${JSON.stringify(r)}`);
    } else {
      fail('the swing landed and the surface answered', `hit a damageable panel and removed NOTHING: ${JSON.stringify(r)}`);
    }
  } else {
    fail('a contact frame ran at all', 'sledge.swingHit() never fired — CONTACT_PHASE may not have been reached');
  }

  // ---- 5. coexistence: stow the (legitimately owned) hammer, then a detached limb can still
  //         be picked up and swung ----
  //
  // ⚠️ FIXED FROM THE INHERITED VERSION: it found "the loose item" with
  // `limbField.items.find((i) => i.inWorld)` — the FIRST inWorld item in array order, which by
  // this point in the round is one of the world GADGETS (`ball`, spawned before anything is
  // ever detached), not the leg this step means to test. Reproduced: that reads `held.label`
  // as `'ball'`, not `'arm'`, so the original assertion below could not have been passing
  // against what it actually picked up. Fixed by keeping `detach()`'s own return value — the
  // exact item that came off — rather than re-deriving it by a search that can find something
  // else entirely.
  //
  // ⚠️ SAME BUG, ONE SITE OVER (this round). `dropped` correctly names the exact item that came
  // off `hipR`, but the pickup step still went back to searching the field —
  // `e.limbField.nearest(p.pos, 1.3)` followed by `p.interact(e.limbField, 1.25, null)`, which
  // runs its OWN independent nearest-item search rather than trusting `dropped`. `sledge-2`
  // moved a nailgun into the world at `gallery.west`, one of the six anchors the wall-finding
  // step above can land the player at — when it does, the nailgun sits inside `interact()`'s
  // reach and wins that search, so the probe recorded `held: "nailgun"`: a real pickup, just not
  // the one this step exists to prove. Fixed the same way as the first bug — skip the search
  // and hand `dropped` straight to `LimbRig.pickUp()` by identity, so nothing else the field
  // happens to contain (nailgun, ball, skates) can be grabbed instead.
  const co = await page.evaluate(async () => {
    const e = window.__rrr.engine, p = e.player;
    p._toggleSledge();               // stow — allowed any time, and this hammer IS owned
    let dropped = null;
    if (p.rig.occupant('hipR') === 'limb') dropped = p.rig.detach('hipR');
    await new Promise((r) => setTimeout(r, 500));
    if (dropped) dropped.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
    await new Promise((r) => setTimeout(r, 300));
    const picked = dropped ? p.rig.pickUp(dropped) : false;
    return {
      sledgeEquipped: p.sledge.equipped, sledgeOwned: p.sledge.owned,
      held: p.rig.held?.label ?? null, picked, hadDropped: !!dropped,
    };
  });
  note(`coexistence check: ${JSON.stringify(co)}`);
  // `hipR` is a LEG socket (`SOCKET_KIND.hipR === 'leg'`, src/game/rules.js) — `LimbItem.label`
  // reports 'leg' for any real item detached from it, never 'arm'. That stale expectation was
  // the other half of what let this look green for the wrong reason before the field-search bug
  // masked it entirely: fix the selection AND the label it is actually correct to expect.
  // `hadDropped`/`picked` are asserted too, so a false "held" can never read as a pass by
  // accident — the property under test is the whole chain (detach, reposition, re-pick-up),
  // not just the label on whatever ended up in the fist.
  (!co.sledgeEquipped && co.sledgeOwned && co.hadDropped && co.picked && co.held === 'leg')
    ? pass('stowing the hammer (without losing it) and picking up a limb both work', JSON.stringify(co))
    : fail('stowing the hammer (without losing it) and picking up a limb both work', JSON.stringify(co));

  // and it can be drawn again — ownership survived the stow
  const redraw = await page.evaluate(() => {
    const p = window.__rrr.engine.player;
    if (p.rig.held) p.rig.dropHeld();
    const r = p._toggleSledge();
    return { r, equipped: p.sledge.equipped };
  });
  note(`redraw after coexistence: ${JSON.stringify(redraw)}`);
  redraw.equipped
    ? pass('an owned hammer can be drawn again after being stowed', JSON.stringify(redraw))
    : fail('an owned hammer can be drawn again after being stowed', JSON.stringify(redraw));
  // leave it stowed before the club test below, so the hammer cannot shadow the club's own weapon
  await page.evaluate(() => { window.__rrr.engine.player._toggleSledge(); });

  // club swing still fires normally with the hammer stowed
  await page.evaluate(() => {
    const p = window.__rrr.engine.player;
    if (p.rig.occupant('hipR') === 'empty') p.rig.refit?.('hipR');
  });
  await page.waitForTimeout(200);
  await page.mouse.down(); await page.waitForTimeout(30); await page.mouse.up();
  await page.waitForTimeout(500);
  const clubOk = await page.evaluate(() => {
    const p = window.__rrr.engine.player;
    return { weapon: p.rig.activeWeapon, swung: p.rig._swingFired === true || p.rig.swinging };
  });
  note(`club after coexistence: ${JSON.stringify(clubOk)}`);
}
