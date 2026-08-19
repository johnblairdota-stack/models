/**
 * 🦾 **A COLLAPSE TAKES A LIMB — END TO END, IN THE REAL GAME.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/limb-collapse.mjs \
 *        --port 5394 --q "seed=s4&dig=1" --shots
 *
 * John, asked whether a collapsing wall should be able to hurt the player:
 *
 *   > *"I think **generally a collapse shouldn't hurt you**. we could try it as a mechanic but
 *   > **maybe the robots limbs fall off and they just need to put it back on**."*
 *
 * `harness/_limb1-rule.mjs` is the argument for the RULE and every constant in it, headless on
 * the shipped `DamageField` event stream. **This file asks the five things only the built game
 * can answer**, on one page, in one uninterrupted session:
 *
 *   **C1  DOES IT FIRE, AND ONLY WHEN IT SHOULD?** A real dig on a real face with the player
 *         standing where a digger stands. Two controls on the IDENTICAL drive: the rule ablated,
 *         and the player one step back.
 *   **C2  DOES IT COST SOMETHING, AND IS THE PLAYER TOLD?** The sledgehammer is two-handed and
 *         `_toggleSledge` gates on `caps.arms === 2`, so losing an arm disarms you. `reset-2`
 *         found that exact gate failing SILENTLY as a bug — here it is the mechanic, so the
 *         screen has to say so.
 *   **C3  CAN YOU GET IT BACK?** Where the part lands, that it is not buried in the heap, that
 *         `[E]` refits it, and that the hammer comes back out afterwards — **which since
 *         2026-08-10 means picking it up off the FLOOR**, because a wounded disarm drops it
 *         there instead of mounting a metre of prop on a chest that cannot hold it. See the
 *         block above the check itself for why the old "E with nothing in reach" shape would
 *         have gone green on the very build John reported.
 *   **C4  DOES IT SURVIVE A RESPAWN?** `reset-2` found six loadout leaks in one night. R, the
 *         way a player presses it, from a body a collapse has just taken a limb off.
 *   **C5  WHAT DOES IT COST IN DRAW CALLS?** A paired in-place flip on one frozen page.
 *
 * 🚨 **EVERY ASSERTION SHIPS A CONTROL THAT MUST FAIL, AND EVERY CONTROL RUNS ON EVERY RUN.**
 * C1's ablated arm and its stood-back arm are not extras: a rule that fires on everything and a
 * rule that fires on nothing look identical to a check that only asks the shipped arm, and this
 * project has sixteen recorded instruments that produced a result-shaped output instead of an
 * error. Each check below also refuses to pass if its own perturbation did not land.
 *
 * ⚠️ **THE HUNTER IS UNTARGETED FOR THE WHOLE RUN**, and re-untargeted after every reset. It is
 * the OTHER thing in this game that takes limbs off you; leaving it live would make every socket
 * reading ambiguous. `setTargets([])` rather than moving it, so no world geometry changes.
 * ⚠️ **THE DRIVE IS THE PANEL'S `applyHit(worldPos)`, NOT THE FIELD'S `applyHit(u,v)`** — which
 * is what `debris-collapse` uses and deliberately nulls `onChunk` for. `onChunk` is the entire
 * subject of this file, so it has to be the panel path.
 */

const f2 = (n) => (Math.round(n * 100) / 100).toFixed(2);

export default async function limbCollapse({ page, note, pass, fail, skip, shot }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 6) => {
    const f0 = await frames();
    for (let i = 0; i < 150; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };

  /**
   * Everything the HUD has said over a window, as a set of lines. The HUD is DOM but carries no
   * per-element classes, so `innerText` on its root is the honest read; and a callout is a
   * MOMENT — "TORN OFF" holds 1.9 s and the cause line queues behind it — so a single sample
   * would catch one of the two and call the other missing.
   */
  const watchHud = async (ms = 3600) => {
    const seen = new Set();
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const t = await page.evaluate(() => document.querySelector('.rrr-hud')?.innerText ?? '');
      for (const line of String(t).split('\n')) { const s = line.trim(); if (s) seen.add(s); }
      await page.waitForTimeout(110);
    }
    return [...seen];
  };

  // ---- the face this whole file works on, and the side of it a body can stand on
  const head = await page.evaluate(() => {
    const e = window.__rrr.engine;
    e.hunter?.setTargets?.([]);
    const face = e.room.panels.find((p) => p.spec?.free && p.field);
    if (!face) return null;
    const c = face.pointAt(0.5, 0.5);
    const n = face.normal;
    // ⚠️ A face's normal is an AXIS and its sign is not a promise about which side you can
    // stand on (`aperture-1`'s finding, the whole reason the exit apertures were one-sided).
    // Ask the game which side is a room.
    const probe = (s) => e.room.spaceAt({ x: c.x + n.x * s, y: e.room.floorY, z: c.z + n.z * s }, 0);
    const sign = probe(1.0) ? 1 : (probe(-1.0) ? -1 : 0);
    return {
      id: face.id, sign, cx: c.x, cy: c.y, cz: c.z, nx: n.x, nz: n.z,
      width: face.width, height: face.height, floorY: e.room.floorY,
      rule: JSON.parse(JSON.stringify(e.player.collapseLimbs)),
    };
  });
  if (!head) { skip('a collapse can take a limb', 'no free dig face on this build'); return; }
  if (!head.sign) { skip('a collapse can take a limb', `neither side of ${head.id} is inside a room`); return; }
  note(`face ${head.id} · ${f2(head.width)} × ${f2(head.height)} m · normal (${f2(head.nx)}, ${f2(head.nz)}) · standable side ${head.sign > 0 ? '+n' : '−n'}`);
  note(`rule: ${JSON.stringify(head.rule)}`);

  /** Put the body where a digger stands: `d` metres off the face, facing it, hammer drawn. */
  const park = (d) => page.evaluate(({ h, d }) => {
    const e = window.__rrr.engine, p = e.player;
    const sx = h.nx * h.sign, sz = h.nz * h.sign;
    p.pos.set(h.cx + sx * d, h.floorY, h.cz + sz * d);
    p.vel.set(0, 0, 0);
    p.facing = Math.atan2(-sx, -sz);          // `facing = atan2(dx, dz)` toward the wall
    p.aimYaw = p.facing;
    e.cam.yaw = p.facing; e.cam._first = true;
    p.sledge.owned = true;
    if (!p.sledge.equipped && p.caps.arms === 2) p.sledge.equip();
    return { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), equipped: !!p.sledge.equipped };
  }, { h: head, d });

  /**
   * 🚨 **STAND UNDER A PARTICULAR BITE, `d` METRES OFF THE FACE** — the honest version of `park`
   * for a rule whose lateral half-width is now 0.19–0.53 m. `b` is one entry of a recon drive's
   * `bitesAt`, i.e. a world point on the face that a bite came off, so this is the built game's
   * equivalent of `_limb1-rule`'s `under(ev, z)` and the two files finally stage the same body.
   */
  const parkUnder = (b, d) => page.evaluate(({ h, b, d }) => {
    const e = window.__rrr.engine, p = e.player;
    const sx = h.nx * h.sign, sz = h.nz * h.sign;
    p.pos.set(b.x + sx * d, h.floorY, b.z + sz * d);
    p.vel.set(0, 0, 0);
    p.facing = Math.atan2(-sx, -sz);
    p.aimYaw = p.facing;
    e.cam.yaw = p.facing; e.cam._first = true;
    p.sledge.owned = true;
    if (!p.sledge.equipped && p.caps.arms === 2) p.sledge.equip();
    return { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), equipped: !!p.sledge.equipped };
  }, { h: head, b, d });

  /**
   * The competent undercut, copied verbatim from `debris-collapse` C5 / `_sag1-grain` — so this
   * file, the headless rule file and the grain file all measure the same player.
   * ⚠️ A stride parameterised by the blow BUDGET measures the budget (`destruction.md` §8): the
   * stride is 1.3 brush radii, set by the HAMMER.
   */
  const drive = (blows, v0 = 0.10) => page.evaluate(({ id, blows, area, v0 }) => {
    const e = window.__rrr.engine;
    const face = e.room.panels.find((p) => p.id === id);
    const f = face.field;
    // count what the rule is being offered, by watching the SAME hook the mechanic hangs off
    const orig = face.onChunk;
    let events = 0, bites = 0, sags = 0;
    /**
     * 🚨 **WHERE EACH BITE LANDS, IN WORLD, BECAUSE STANDING AT THE FACE'S CENTRE IS NOT
     * STANDING UNDER IT — AND SINCE 2026-08-10 THAT DISTINCTION IS THE MECHANIC.** The lateral
     * test was `effW/2 + your radius + 0.10` (a 1.12 m half-width on the worst bite), so a body
     * parked at the middle of the face was under essentially anything this drive produced and
     * the staging never had to be honest. It is `effW/2 − inset` now — 0.19–0.53 m — and this
     * drive sweeps its undercut ±1.0 m along a 2.96 m face while the body stands still, so
     * "park at the centre and dig" measures a player who walks away from their own undercut.
     * The recon pass below reads these positions and the real pass stands under one of them.
     * ⚠️ `warned` is `views/game.js`'s own test, restated here for the same reason the headless
     * file restates it: this file must be able to say WHICH bite it staged.
     */
    const bitesAt = [];
    face.onChunk = (panel, info) => {
      const evs = info.collapse?.events ?? [];
      const sagBoxes = evs.filter((e) => e.kind === 'sag');
      for (const ev of evs) {
        events++;
        if (ev.kind === 'sag') { sags++; continue; }
        if (!(ev.cells > 0 && ev.area >= area)) continue;
        bites++;
        const w = panel.pointAt(ev.u, ev.v);
        bitesAt.push({
          x: +w.x.toFixed(3), y: +w.y.toFixed(3), z: +w.z.toFixed(3), area: +ev.area.toFixed(3),
          warned: !sagBoxes.some((s) =>
            Math.abs((s.dx ?? 0) - (ev.dx ?? 0)) <= (s.w + ev.w) * 0.5
            && Math.abs((s.dy ?? 0) - (ev.dy ?? 0)) <= (s.h + ev.h) * 0.5),
        });
      }
      return orig?.(panel, info);
    };
    const stepU = (f.brush.radius * 1.3) / f.width;
    const perRow = Math.max(2, Math.ceil(1 / stepU));
    try {
      for (let k = 0; k < blows; k++) {
        const row = Math.floor(k / perRow), j = k % perRow;
        const side = j % 2 ? 1 : -1;
        const off = side * (0.5 + Math.floor(j / 2)) * stepU;
        const u = Math.min(0.98, Math.max(0.02, 0.5 + off));
        const v = Math.min(0.98, Math.max(0.02, v0 + row * 0.22 + Math.sin(k * 0.9) * 0.03));
        face.applyHit(face.pointAt(u, v), 1);
      }
    } finally { face.onChunk = orig; }
    let sagCells = 0;
    if (f._sag) for (let i = 0; i < f._sag.length; i++) sagCells += f._sag[i];
    let open = 0;
    for (let i = 0; i < f.depth.length; i++) if (f.depth[i] >= 0.985) open++;
    return { events, bites, sags, sagCells, open, bitesAt };
  }, { id: head.id, blows, area: head.rule.area, v0 });

  const bodyState = () => page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const loose = e.limbField.items.filter((i) => i.inWorld);
    return {
      sockets: ['shoulderL', 'shoulderR', 'hipL', 'hipR'].map((s) => `${s}:${p.rig.occupant(s)}`).join(' '),
      arms: p.caps.arms, legs: p.caps.legs, gait: p.caps.gait, wounds: p.caps.wounds,
      lost: p.limbsLost, disarms: p.disarms,
      equipped: !!p.sledge.equipped, owned: !!p.sledge.owned,
      hud: document.querySelector('.rrr-hud')?.innerText?.replace(/\n+/g, ' | ') ?? '',
      looseN: loose.length, looseLimbs: loose.filter((i) => i.type === 'limb').length,
      px: +p.pos.x.toFixed(2), pz: +p.pos.z.toFixed(2),
    };
  });

  const reset = async () => {
    await page.evaluate(() => { window.__rrr.engine.resetRound(); });
    await page.waitForTimeout(700);
    await page.evaluate(() => window.__rrr.engine.hunter?.setTargets?.([]));
  };
  const setRule = (on) => page.evaluate((v) => { window.__rrr.engine.player.collapseLimbs.on = v; }, on);

  const BLOWS = 90;
  /**
   * ⚠️ **0.60 → 0.50 ON 2026-08-10, AND IT IS A STAGING FIX RATHER THAN A LOOSENING.**
   * `COLLAPSE_LIMB.depth` is 0.60 now and the test is `out <= depth`, so parking at exactly 0.60
   * put the body on the rule's own boundary — where the answer is decided by whether the face's
   * reported centre and the collapse's reported centre agree in the last bit of a double. A
   * scenario that sits on a knife edge reports the float, not the game. 0.50 m is 0.16 m of
   * clearance between a 0.34 m body radius and the wall: pressed against it, which is the stance
   * this mechanic exists to punish.
   */
  const DIG_STANDOFF = 0.50;
  /**
   * 🚨 **1.35 → 0.85 ON 2026-08-10, AND THE MOVE IS THE RESULT RATHER THAN A TWEAK TO THE
   * STAGING.** John: *"the arm comes off way too easy… much tighter conditions."* The old
   * `COLLAPSE_LIMB.depth` of 1.05 m meant a body had to retreat past every stance the SKIRTING
   * can be struck from — `WEAPON_RANGE.sledge` is 1.55 m from the eye and the skirting is 0.28 m
   * up the face, so `√(1.55² − 1.26²)` = **0.90 m** is the furthest an undercut can be taken
   * from. 1.35 m proved you could stand clear; it could not prove you could stand clear **and
   * keep digging**, because you could not. At `depth` 0.60 this control does, and that is the
   * whole tightening in one number.
   */
  const BACK_STANDOFF = 0.85;
  /**
   * ⚠️ **THE HEAP'S EXTENT IS NOT THE RULE'S `depth` AND MUST NOT BE READ OFF IT.** C3 asks
   * whether the detached part landed clear of the rubble; the rubble piles into the fall strip,
   * which `destruction.md` §12.6 measures at **1.05 m** out from the face. That used to be the
   * same number as `COLLAPSE_LIMB.depth` and the check read it from the table — a coincidence,
   * and tightening the rule to 0.60 m would have silently weakened the assertion by 0.45 m.
   */
  const FALL_STRIP = 1.05;

  // =========================================================================================
  // C1 — does it fire, and only when it should
  // =========================================================================================
  /**
   * 🚨 **THE RECON PASS — RUN THE DRIVE WITH THE RULE OFF, TO LEARN WHERE ITS BITES LAND.**
   * Added 2026-08-10 with the tightening: see `drive`'s `bitesAt` for why "park at the centre of
   * the face" stopped being the same experiment as "stand under the falling wall". Everything
   * here is deterministic — the same face, reset, the same 90 blows — so the real pass and both
   * controls below are offered the identical events at the identical places.
   */
  await reset();
  await setRule(false);
  await park(DIG_STANDOFF);
  const recon = await drive(BLOWS);
  note(`recon (rule off): ${recon.bites} bites at ${recon.bitesAt.map((b) => `${f2(b.y - head.floorY)} m up, ${b.area} m², warned ${b.warned}`).join(' · ') || '(none)'}`);
  // The rule can only act on a WARNED bite (`limbs.js` condition 3), so stage one of those.
  const target = recon.bitesAt.find((b) => b.warned) ?? recon.bitesAt[0];

  await reset();
  await setRule(true);
  const parked = target ? await parkUnder(target, DIG_STANDOFF) : await park(DIG_STANDOFF);
  note(`parked at ${f2(DIG_STANDOFF)} m — (${parked.x}, ${parked.z}), hammer drawn ${parked.equipped}`
    + (target ? `, under the bite ${f2(target.y - head.floorY)} m up the face` : ' (NO BITE TO STAND UNDER)'));
  const before = await bodyState();
  await shot('limb-0-before');
  const dug = await drive(BLOWS);
  const saidWhenHit = await watchHud(3600);
  const shipped = await bodyState();
  await shot('limb-1-taken');
  note(`SHIPPED, ${BLOWS} blows at ${f2(DIG_STANDOFF)} m: ${dug.open} cells open, ${dug.sagCells} hanging`
    + ` · events ${dug.events} (${dug.sags} sag, ${dug.bites} at or above ${head.rule.area} m²)`);
  note(`  ${shipped.sockets} · arms ${shipped.arms} legs ${shipped.legs} gait ${shipped.gait} · limbsLost ${shipped.lost}`);
  note(`  HUD said: ${saidWhenHit.map((s) => `"${s}"`).join(' ') || '(nothing)'}`);

  // ---- CONTROL A: the identical drive, rule ablated
  await reset();
  await setRule(false);
  if (target) await parkUnder(target, DIG_STANDOFF); else await park(DIG_STANDOFF);
  const a0 = await bodyState();
  const dugA = await drive(BLOWS);
  await step(8);
  const ablated = await bodyState();
  note(`CONTROL A (ablated, same drive, same place): ${dugA.bites} bites offered, ${ablated.lost - a0.lost} limbs taken · ${ablated.sockets}`);

  // ---- CONTROL B: the identical drive, standing one step back
  await reset();
  await setRule(true);
  if (target) await parkUnder(target, BACK_STANDOFF); else await park(BACK_STANDOFF);
  const b0 = await bodyState();
  const dugB = await drive(BLOWS);
  await step(8);
  const back = await bodyState();
  await shot('limb-2-stood-back');
  note(`CONTROL B (rule on, same drive, stood back to ${f2(BACK_STANDOFF)} m): ${dugB.bites} bites offered,`
    + ` ${back.lost - b0.lost} limbs taken · hammer still drawn ${back.equipped}`);

  const took = shipped.lost - before.lost;
  if (!dug.bites) {
    fail('a collapse takes a limb off a player standing under it',
      `${BLOWS} blows opened ${dug.open} cells but produced no event at or above ${head.rule.area} m² — the drive never offered the rule anything, so nothing below can be believed`);
  } else if (!dugA.bites || !dugB.bites) {
    fail('a collapse takes a limb off a player standing under it',
      `a control drive produced no bite (A ${dugA.bites}, B ${dugB.bites}) — the controls are not the same experiment`);
  } else if (took === 0) {
    fail('a collapse takes a limb off a player standing under it',
      `${dug.bites} bites landed on a body at ${f2(DIG_STANDOFF)} m and took nothing`);
  } else if (ablated.lost - a0.lost !== 0) {
    fail('a collapse takes a limb off a player standing under it',
      `the ABLATED control also took ${ablated.lost - a0.lost} — something other than this rule is emptying sockets`);
  } else if (back.lost - b0.lost !== 0) {
    fail('a collapse takes a limb off a player standing under it',
      `standing back to ${f2(BACK_STANDOFF)} m still cost ${back.lost - b0.lost} — it is not avoidable`);
  } else {
    pass('a collapse takes a limb off a player standing under it',
      `${took} limb (${shipped.sockets}) from ${dug.bites} bites at ${f2(DIG_STANDOFF)} m; the SAME ${BLOWS} blows offer ${dugA.bites}/${dugB.bites} bites and take 0 with the rule ablated and 0 from ${f2(BACK_STANDOFF)} m — inside the hammer's 1.55 m reach, so backing off does not stop the dig`);
  }

  // =========================================================================================
  // C2 — it costs the hammer, and the game says so
  // =========================================================================================
  /**
   * 🎯 **THE ARM CASE HAS TO BE AIMED FOR, AND THAT IS THE RULE WORKING RATHER THAN A NUISANCE.**
   * `limbs.js` splits arm from leg on the event's height against the body's own eyeline, so a
   * SKIRTING undercut — C1 above — brings its bite down at knee height and takes a LEG. To lose
   * an arm you have to be standing under a bite that came down from above your eyeline, i.e.
   * you undercut higher up the wall. So this stage sweeps the undercut's base row until the
   * wall takes an arm, and REPORTS which aim did it: that number is the mechanic's own claim
   * ("dig low, lose a leg; dig at chest height, lose an arm") measured in the built game rather
   * than asserted from the headless rule.
   */
  let armed = null, hurt = null, said = [], usedV0 = null;
  for (const v0 of [0.45, 0.60, 0.32, 0.10]) {
    // Recon this aim first, for the reason C1 gives: the body has to stand under the bite this
    // particular undercut height produces, not under the middle of the wall.
    await reset();
    await setRule(false);
    await park(DIG_STANDOFF);
    const r = await drive(BLOWS, v0);
    const tgt = r.bitesAt.find((b) => b.warned && b.y - head.floorY >= 1.55) ?? r.bitesAt.find((b) => b.warned);
    if (!tgt) { note(`undercut base v=${v0.toFixed(2)}: ${r.bites} bites, none warned — skipped`); continue; }

    await reset();
    await setRule(true);
    await parkUnder(tgt, DIG_STANDOFF);
    const a = await bodyState();
    const d = await drive(BLOWS, v0);
    const s = await watchHud(3200);
    const h = await bodyState();
    note(`undercut base v=${v0.toFixed(2)}: ${d.bites} bites, staged under one ${f2(tgt.y - head.floorY)} m up · ${h.sockets} · arms ${a.arms}→${h.arms}`);
    if (h.arms < a.arms) { armed = a; hurt = h; said = s; usedV0 = v0; break; }
    if (!armed && h.lost > a.lost) { armed = a; hurt = h; said = s; usedV0 = v0; }
  }
  const lostAnArm = !!armed && hurt.arms < armed.arms;
  const all = said.join(' | ').toUpperCase() + ' | ' + (hurt?.hud ?? '').toUpperCase();
  if (armed) {
    note(`ARM STAGE (undercut base v=${usedV0}): arms ${armed.arms} → ${hurt.arms}, hammer ${armed.equipped} → ${hurt.equipped}, disarm events +${hurt.disarms - armed.disarms}`);
    note(`HUD over the next 3.2 s: ${said.map((s) => `"${s}"`).join(' ')}`);
  }
  if (!armed) {
    fail('losing an arm to the wall disarms you, and the game says so', 'no aim in the sweep took anything — not repeatable');
  } else if (!lostAnArm) {
    fail('losing an arm to the wall disarms you, and the game says so',
      `no undercut height in the sweep produced a bite above the eyeline — every one took a LEG (${hurt.sockets}), so the arm branch is unreachable on this face`);
  } else if (hurt.equipped) {
    fail('losing an arm to the wall disarms you, and the game says so',
      `arms ${hurt.arms} and the two-handed hammer is STILL DRAWN — the caps.arms === 2 gate is not holding`);
  } else if (!/TORN OFF/.test(all)) {
    fail('losing an arm to the wall disarms you, and the game says so', `nothing said a limb came off: ${all.slice(0, 240)}`);
  } else if (!/WALL TOOK/.test(all)) {
    fail('losing an arm to the wall disarms you, and the game says so',
      `the wound was announced but not its CAUSE — the player cannot tell a falling wall from the hunter: ${all.slice(0, 240)}`);
  } else if (!/BOTH ARMS|SLEDGEHAMMER/.test(all)) {
    fail('losing an arm to the wall disarms you, and the game says so',
      `the wound and its cause were announced but nothing named the hammer leaving: ${all.slice(0, 240)}`);
  } else {
    pass('losing an arm to the wall disarms you, and the game says so',
      `an undercut based at v=${usedV0} of the face brought a bite down from above the eyeline: arms ${armed.arms} → ${hurt.arms}, hammer ${armed.equipped} → ${hurt.equipped}, +${hurt.disarms - armed.disarms} disarm; and all three lines reach the screen — the wound, its cause and the recovery`);
  }
  await shot('limb-2-arm-taken');

  // =========================================================================================
  // C3 — you can go and get it back
  // =========================================================================================
  const landed = await page.evaluate(({ h }) => {
    const e = window.__rrr.engine, p = e.player;
    const it = e.limbField.items.filter((i) => i.inWorld && i.type === 'limb')
      .sort((a, b) => a.root.position.distanceToSquared(p.pos) - b.root.position.distanceToSquared(p.pos))[0];
    if (!it) return null;
    const sx = h.nx * h.sign, sz = h.nz * h.sign;
    // metres out from the face plane. The debris heap piles up AGAINST the wall and is not a
    // collider, so a part inside the fall strip is retrievable but easily lost in it.
    const out = (it.root.position.x - h.cx) * sx + (it.root.position.z - h.cz) * sz;
    return {
      label: it.label, asleep: !!it.asleep,
      dist: +it.root.position.distanceTo(p.pos).toFixed(2),
      outFromFace: +out.toFixed(2),
      aboveFloor: +(it.root.position.y - e.room.floorY).toFixed(2),
    };
  }, { h: head });

  if (!landed) {
    fail('the part lands somewhere you can find it', 'no loose limb in the field after the collapse');
  } else {
    note(`the ${landed.label} landed ${landed.dist} m from the body, ${landed.outFromFace} m out from the face,`
      + ` ${landed.aboveFloor} m above the floor, settled ${landed.asleep}`);
    if (landed.outFromFace <= FALL_STRIP) {
      fail('the part lands somewhere you can find it',
        `it rests ${landed.outFromFace} m out — inside the ${FALL_STRIP} m fall strip, i.e. in the heap`);
    } else if (landed.dist > 4) {
      fail('the part lands somewhere you can find it', `${landed.dist} m away — that is a search, not a walk`);
    } else if (landed.aboveFloor > 0.5) {
      fail('the part lands somewhere you can find it', `${landed.aboveFloor} m above the floor — stuck in the air`);
    } else {
      pass('the part lands somewhere you can find it',
        `${landed.dist} m from the body and ${landed.outFromFace} m out from the face — clear of the ${FALL_STRIP} m strip the heap sits in, settled flat`);
    }
  }

  // TURN ROUND AND LOOK AT IT. The impulse throws the part outward from the face, i.e. back past
  // the player, so at the moment it lands a third-person camera aimed at the wall does not have
  // it in frame — which is the whole reason the callout names the recovery. This is the frame
  // that says the part is findable rather than gone.
  const lookAtIt = () => page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const it = e.limbField.items.filter((i) => i.inWorld && i.type === 'limb')
      .sort((a, b) => a.root.position.distanceToSquared(p.pos) - b.root.position.distanceToSquared(p.pos))[0];
    if (!it) return null;
    const yaw = Math.atan2(it.root.position.x - p.pos.x, it.root.position.z - p.pos.z);
    p.facing = yaw; p.aimYaw = yaw; e.cam.yaw = yaw; e.cam.pitch = -0.25; e.cam._first = true;
    return true;
  });
  await lookAtIt();
  await step(20);
  await shot('limb-3-arm-on-the-floor');
  // ...and walk to it.
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const it = e.limbField.items.filter((i) => i.inWorld && i.type === 'limb')
      .sort((a, b) => a.root.position.distanceToSquared(p.pos) - b.root.position.distanceToSquared(p.pos))[0];
    if (!it) return;
    const dx = it.root.position.x - p.pos.x, dz = it.root.position.z - p.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    p.pos.set(it.root.position.x - (dx / d) * 0.5, e.room.floorY, it.root.position.z - (dz / d) * 0.5);
    p.vel.set(0, 0, 0); e.cam._first = true;
  });
  await step(20);
  const overIt = await bodyState();
  await shot('limb-4-standing-over-it');
  note(`standing over it, HUD reads: ${overIt.hud}`);
  await page.keyboard.press('KeyE');
  await step(12);
  const refitted = await bodyState();
  await shot('limb-5-refitted');
  /**
   * 🔨 **...AND THEN GO AND PICK THE HAMMER UP OFF THE FLOOR, WHICH IS WHERE IT NOW IS.**
   *
   * John, 2026-08-10: *"the sledge also needs to **drop on the floor instead of just floating in
   * front of the player**."* `Player.update`'s two-handed gate used to call `sledge.unequip()`,
   * which does not put the tool anywhere — it `_mount('stow')`s it onto `unit.joints.chest` at a
   * transform authored for a body with two arms. `views/game.js`'s `dropSledge()` now `forget()`s
   * it and spawns a real `LimbItem` at the body's feet on a WOUNDED disarm only.
   *
   * ⚠️ **THIS CHECK USED TO PRESS `E` WITH NOTHING IN REACH AND EXPECT THE HAMMER BACK**, because
   * `owned` stayed true through a stow. It is false now, deliberately — an owned-but-not-held
   * hammer is a hammer on your back, and this one is on the floor — so `_toggleSledge` correctly
   * refuses and the recovery is the same walk-and-press every other pickup in this game uses.
   * The old shape would have gone GREEN on a build that left the prop in mid-air, which is
   * exactly the defect being fixed.
   *
   * ⚠️ **TWO WAITS HERE ARE LOAD-BEARING AND THE FIRST VERSION OF THIS FILE FAILED ON BOTH.**
   *   · `Player.interact` sets `_interactCd = 0.35` on every press, so a second E inside a third
   *     of a second is EATEN — the check then reads "the hammer did not come back" and blames
   *     the game for a cooldown that is the game working.
   *   · The part and the hammer are two different items in one `LimbField`, and `E_REACH` (1.25 m,
   *     ONE constant for prompt, picker and press) takes the NEAREST. So the limb has to be off
   *     the body's shortlist before the hammer can be asked for — which it is, because it went
   *     back on the body one press ago.
   */
  /**
   * 🚨 **NEAREST TO WHERE THE BODY WAS STANDING WHEN IT WAS DISARMED, NOT `items.find`.**
   * There are TWO sledgehammers in this world and the first draft of this check took whichever
   * came first in the array. `spawnWorldSledge()` puts one at `study_w.north` for the opening
   * beat and `resetRound()` re-spawns it every reset; this scenario's `park()` sets
   * `sledge.owned` directly rather than walking over and taking that one, so it is still lying
   * there — **9.4 m away** — when the dropped one appears at the player's feet. The check went
   * green on it, i.e. it was passing on a prop the disarm had nothing to do with. `hurt.px/pz`
   * is the body's position at the moment the arm came off, so anchoring on that is the only
   * reading that can tell the two apart, and the distance from it is now asserted.
   */
  const disarmAt = { x: hurt.px, z: hurt.pz };
  const hammerOnFloor = await page.evaluate(({ h, at }) => {
    const e = window.__rrr.engine, p = e.player;
    const all = e.limbField.items.filter((i) => i.inWorld && i.type === 'sledge');
    const d2 = (i) => (i.root.position.x - at.x) ** 2 + (i.root.position.z - at.z) ** 2;
    const it = all.slice().sort((a, b) => d2(a) - d2(b))[0];
    if (!it) return null;
    const sx = h.nx * h.sign, sz = h.nz * h.sign;
    return {
      asleep: !!it.asleep,
      dist: +it.root.position.distanceTo(p.pos).toFixed(2),
      fromDisarm: +Math.sqrt(d2(it)).toFixed(2),
      outFromFace: +((it.root.position.x - h.cx) * sx + (it.root.position.z - h.cz) * sz).toFixed(2),
      aboveFloor: +(it.root.position.y - e.room.floorY).toFixed(2),
      inScene: !!it.root.parent, inWorld: all.length,
    };
  }, { h: head, at: disarmAt });
  // walk to it
  await page.evaluate(({ at }) => {
    const e = window.__rrr.engine, p = e.player;
    const d2 = (i) => (i.root.position.x - at.x) ** 2 + (i.root.position.z - at.z) ** 2;
    const it = e.limbField.items.filter((i) => i.inWorld && i.type === 'sledge')
      .sort((a, b) => d2(a) - d2(b))[0];
    if (!it) return;
    const dx = it.root.position.x - p.pos.x, dz = it.root.position.z - p.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    p.pos.set(it.root.position.x - (dx / d) * 0.5, e.room.floorY, it.root.position.z - (dz / d) * 0.5);
    p.vel.set(0, 0, 0); e.cam._first = true;
  }, { at: disarmAt });
  await page.waitForTimeout(500);
  const overHammer = await bodyState();
  await page.keyboard.press('KeyE');
  await step(10);
  const rearmed = await bodyState();
  await shot('limb-6-hammer-back');
  note(`the hammer: ${hammerOnFloor ? `${hammerOnFloor.aboveFloor} m above the floor, ${hammerOnFloor.fromDisarm} m from where the body was disarmed`
    + ` (${hammerOnFloor.inWorld} sledge item(s) in the world — the other is the opening beat's, at study_w.north), settled ${hammerOnFloor.asleep}` : 'NOT IN THE FIELD'}`);
  note(`standing over it the HUD reads "${overHammer.hud}" · owned ${overHammer.owned} equipped ${overHammer.equipped} → after [E]: owned ${rearmed.owned} equipped ${rearmed.equipped}`);

  if (overIt.wounds === 0) {
    fail('[E] puts it back on and the hammer comes back out', 'the body was already whole before the press — vacuous');
  } else if (!/\[E\] FIT/i.test(overIt.hud)) {
    fail('[E] puts it back on and the hammer comes back out',
      `nothing advertised the refit while standing over the part: "${overIt.hud}"`);
  } else if (refitted.wounds !== 0) {
    fail('[E] puts it back on and the hammer comes back out', `still ${refitted.wounds} empty socket(s): ${refitted.sockets}`);
  } else if (!hammerOnFloor) {
    fail('[E] puts it back on and the hammer comes back out',
      'the disarm left no sledgehammer in the world — it is still parented to the body, i.e. the floating prop');
  } else if (hammerOnFloor.aboveFloor > 0.5) {
    fail('[E] puts it back on and the hammer comes back out',
      `the hammer is ${hammerOnFloor.aboveFloor} m above the floor — it is floating, not dropped`);
  } else if (hammerOnFloor.fromDisarm > 1.5) {
    fail('[E] puts it back on and the hammer comes back out',
      `the nearest hammer to the disarm is ${hammerOnFloor.fromDisarm} m away — that is the opening beat's prop at study_w.north, not a dropped one, so the disarm put nothing on the floor`);
  } else if (overHammer.equipped) {
    fail('[E] puts it back on and the hammer comes back out',
      'the hammer was already drawn before the take press — this stage did not disarm the player and the check is meaningless');
  } else if (!/TAKE SLEDGEHAMMER/i.test(overHammer.hud)) {
    fail('[E] puts it back on and the hammer comes back out',
      `nothing advertised the pickup while standing over the hammer: "${overHammer.hud}"`);
  } else if (!rearmed.equipped) {
    fail('[E] puts it back on and the hammer comes back out',
      `refit worked (arms ${rearmed.arms}) but the hammer did not come back: owned ${rearmed.owned}, equipped ${rearmed.equipped}`);
  } else {
    pass('[E] puts it back on and the hammer comes back out',
      `"${(overIt.hud.match(/\[E\] FIT [a-z]+/i) ?? [''])[0]}" → [E] → ${refitted.sockets} → walk to the hammer, lying ${hammerOnFloor.aboveFloor} m above the floor ${hammerOnFloor.fromDisarm} m from where the arm came off → [E] → drawn. `
      + 'The whole cost is two walks and two presses, and the tool is on the ground rather than on a body that cannot hold it');
  }

  // =========================================================================================
  // C4 — and none of it survives a respawn
  // =========================================================================================
  await reset();
  await setRule(true);
  // ...standing under the same bite C1 found, for the reason C1's recon block gives.
  if (target) await parkUnder(target, DIG_STANDOFF); else await park(DIG_STANDOFF);
  const spawn = await bodyState();
  await drive(BLOWS);
  await step(10);
  const wrecked = await bodyState();
  note(`wrecked for the retry: ${wrecked.sockets} · loose ${wrecked.looseN} (spawn ${spawn.looseN}) · gait ${wrecked.gait}`);
  if (wrecked.lost === spawn.lost) {
    fail('a respawn puts the limb back', 'the perturbation did not land — nothing came off, so this check cannot see anything');
  } else {
    // R, with the key never released — the reproduction `mechanics.mjs` uses, because a real
    // retry destroys the modal and moves focus while the player still has keys down.
    await page.evaluate(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', bubbles: true }));
    });
    await page.waitForTimeout(900);
    await page.evaluate(() => window.__rrr.engine.hunter?.setTargets?.([]));
    const after = await bodyState();
    await shot('limb-7-after-retry');
    note(`after R: ${after.sockets} · arms ${after.arms} legs ${after.legs} gait ${after.gait} · loose ${after.looseN} (limbs ${after.looseLimbs})`);
    const bad = [];
    if (after.sockets !== spawn.sockets) bad.push(`sockets "${after.sockets}" != "${spawn.sockets}"`);
    if (after.wounds !== 0) bad.push(`${after.wounds} empty socket(s) survived`);
    if (after.looseLimbs !== spawn.looseLimbs) bad.push(`loose LIMBS ${spawn.looseLimbs} -> ${after.looseLimbs} — the torn-off part was not swept`);
    if (after.looseN !== spawn.looseN) bad.push(`loose items ${spawn.looseN} -> ${after.looseN}`);
    if (after.gait !== spawn.gait) bad.push(`gait ${spawn.gait} -> ${after.gait}`);
    bad.length
      ? fail('a respawn puts the limb back', bad.join(' · '))
      : pass('a respawn puts the limb back',
        `R from a body a collapse had just disarmed (${wrecked.sockets}, gait ${wrecked.gait}): sockets, wound count, gait and the ${spawn.looseN}-item floor all back to the spawn state`);
  }

  // =========================================================================================
  // C5 — what it costs in draw calls
  // =========================================================================================
  // A paired in-place flip on ONE frozen page at ONE camera: the same arm on the body, then
  // lying on the floor in front of it, then back on. A detached limb is the SAME Object3D —
  // `limbs.js`'s founding design — so the honest expectation is zero, and this is where that
  // claim is checked rather than argued. Debris is cleared first so the wall is not the thing
  // moving; `eo2-calls`' 625-call budget is the ceiling either way.
  const census = () => page.evaluate(() => {
    const e = window.__rrr.engine, i = e.renderer.info.render;
    // 🚨 **AND WHETHER THE LOOSE ARM IS ACTUALLY BEING DRAWN, WHICH IS THE HALF THAT MATTERS
    // MORE THAN THE COUNT.** `room.trackLoose`/`cullLoose` hides a loose item whose position is
    // inside a space that is not resident — correct for a gadget in a room you have left, and a
    // catastrophe for the arm you are being asked to walk over and pick up. Cheaper because it
    // is invisible is not cheaper, it is broken, and a bare call count cannot tell the two
    // apart. So the census names the arm's meshes and how many of them are visible.
    const it = e.limbField.items.find((x) => x.inWorld && x.type === 'limb');
    let meshes = 0, shown = 0;
    it?.root?.traverse?.((o) => {
      if (!o.isMesh) return;
      meshes++;
      let vis = o.visible, p = o.parent;
      while (vis && p) { if (!p.visible) vis = false; p = p.parent; }
      if (vis) shown++;
    });
    // ⚠️ **AND WHETHER IT IS ON SCREEN, WHICH IS A DIFFERENT QUESTION FROM `visible`.** A limb
    // thrown clear of the wall lands BEHIND a third-person camera that is aimed at the wall, so
    // the renderer frustum-culls it and the call count falls — which reads as "a detached limb
    // is free" when what it means is "you cannot see it from here". `Vector3.project` against
    // the live camera is the cheapest honest answer.
    const ndc = it ? it.root.position.clone().project(e.camera) : null;
    const onScreen = !!ndc && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1 && ndc.z > -1 && ndc.z < 1;
    return { calls: i.calls, tris: i.triangles, armMeshes: meshes, armShown: shown, onScreen };
  });
  await reset();
  await setRule(true);
  await park(1.60);
  /**
   * 🚨 **AND THE HAMMER IS TAKEN OUT OF THE PICTURE BEFORE THE BASELINE, WHICH IT DID NOT USED
   * TO NEED TO BE.** This check is a PAIRED count of one arm on the body against the same arm on
   * the floor, so nothing else may change between the two readings. Detaching a shoulder trips
   * `Player.update`'s two-handed gate, and since 2026-08-10 a WOUNDED disarm no longer stows the
   * prop on the chest (equal calls either side) — it drops a whole new `buildSledgeProp` on the
   * floor in front of the body, i.e. it adds geometry to the frame between the two readings and
   * the number would be the arm's cost plus a hammer's. `forget()` unparents and un-owns it, so
   * the pair is the arm and only the arm; the hammer's own cost is C3's subject, not this one.
   */
  await page.evaluate(() => window.__rrr.engine.player.sledge.forget());
  await page.evaluate(() => window.__rrr.engine.debris?.clear?.());
  await step(30);
  const callsOn = await census();
  // Detached exactly the way the rule does it — through `hitByCollapse`'s own impulse shape —
  // and then left to FALL AND SETTLE rather than teleported, so this measures the state the
  // player actually walks up to.
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const fwd = { x: Math.sin(p.facing), z: Math.cos(p.facing) };
    p.rig.detach('shoulderR', {
      impulse: new (p.pos.constructor)(-fwd.x * 2.30, 2.55, -fwd.z * 2.30),
      spin: new (p.pos.constructor)(3.6, -2.1, 5.4),
    });
  });
  await step(120);        // ~2 s: fall, bounce, settle (LimbField rests inside 0.42 s of contact)
  const callsWhereItLands = await census();
  // ...and then the WORST CASE, which is the one the budget cares about: the arm in frame. Where
  // it lands it is behind a camera aimed at the wall, so its calls are frustum-culled away and
  // the count FALLS — cheaper because you cannot see it is not a draw-call saving. Turn to look
  // at it and read the count again; that number is the honest cost.
  await lookAtIt();
  await step(30);
  const callsOff = await census();
  await shot('limb-8-calls-arm-on-floor');
  const callsOnAgain = await page.evaluate(() => {
    const i = window.__rrr.engine.renderer.info.render;
    return { calls: i.calls, tris: i.triangles };
  });
  await page.evaluate(() => window.__rrr.engine.player.rig.refit('shoulderR'));
  await step(30);
  const callsBack = await census();
  note(`draw calls — arm ON BODY ${callsOn.calls} · where it LANDS (off camera) ${callsWhereItLands.calls} (on screen ${callsWhereItLands.onScreen})`
    + ` · IN FRAME ${callsOff.calls} (on screen ${callsOff.onScreen}) · REFITTED at that camera ${callsBack.calls}`);
  note(`triangles   — ${callsOn.tris} · ${callsWhereItLands.tris} · ${callsOff.tris} · ${callsBack.tris}`);
  note(`the loose arm's own meshes: ${callsOff.armShown}/${callsOff.armMeshes} visible`);
  void callsOnAgain;
  // The paired flip that isolates the arm is IN FRAME → REFITTED, both at the same camera: the
  // only thing that changes between them is which parent the arm hangs off.
  const delta = callsOff.calls - callsBack.calls;
  if (callsOn.calls <= 0) {
    fail('a detached limb costs no draw calls and is still drawn', 'the census read 0 calls — nothing was rendering');
  } else if (!callsOff.armMeshes) {
    fail('a detached limb costs no draw calls and is still drawn', 'no loose limb to census — the detach did not land');
  } else if (callsOff.armShown !== callsOff.armMeshes) {
    fail('a detached limb costs no draw calls and is still drawn',
      `${callsOff.armMeshes - callsOff.armShown} of the loose arm's ${callsOff.armMeshes} meshes are hidden — the part the player has to find is not being drawn`);
  } else if (!callsOff.onScreen) {
    fail('a detached limb costs no draw calls and is still drawn',
      'could not get the loose arm into frame, so the in-frame cost was never measured — the off-camera reading is not the answer');
  } else if (delta > 2) {
    fail('a detached limb costs no draw calls and is still drawn',
      `in frame it costs ${delta} more calls than the same arm on the body (${callsOff.calls} vs ${callsBack.calls})`);
  } else {
    pass('a detached limb costs no draw calls and is still drawn',
      `arm IN FRAME on the floor ${callsOff.calls} vs the same arm REFITTED at the same camera ${callsBack.calls} (${delta > 0 ? '+' : ''}${delta}), all ${callsOff.armMeshes} of its meshes visible; where it actually lands it is off camera (${callsWhereItLands.calls}) — it is the same Object3D, reparented, so it can never cost more than it did on the body`);
  }

  await page.evaluate(() => window.__rrr.engine.resetRound());
}
