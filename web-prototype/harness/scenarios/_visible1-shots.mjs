/**
 * 📷 **DOES THE LAST 58% READ? THE SAME DIG, PHOTOGRAPHED BLOW BY BLOW, BOTH ARMS IN ONE PAGE.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_visible1-shots.mjs \
 *        --port 5363 --q "seed=s4&dig=1" --shots
 *
 * `visible-1`'s change is one table (`wall.js` `DAMAGE_BANDS[3]`) and the table is a UNIFORM at
 * runtime (`breakmask.js` `setDamageBand`), so the shipped arm and the round-10 arm can be
 * photographed **on the same crater, from the same camera, in the same frozen page** — which is
 * this project's own standard for an A/B and the only way to be sure the two frames differ in the
 * one thing under test.
 *
 * ⚠️ **PHOTOGRAPHED DURING THE DIG, NOT AFTER IT.** The defect is not a property of a finished
 * breach — it is that the middle of the work stops answering. So the strip is taken at a ladder
 * of blow counts from first contact to the moment a body fits.
 *
 * ⚠️ **THE CAMERA STANDS TO ONE SIDE AND AT PLAY DISTANCE** for `dig-shots.mjs`'s measured
 * reason: head-on, the player's own body covers the centre third of the aperture.
 */

const SITE = { id: 'f.svc_w.0.a', tag: 'svc', back: 3.4, side: 1.5, pitch: 0.02 };
/**
 * 🧱 **THE SAME CRATER AT A STEEP GRAZE, BECAUSE THE SECTION IS WHAT ROUNDS 9 AND 10 BOUGHT.**
 * Round 6 made the three shell layers' silhouettes bit-identical so that head-on they are one
 * edge and at a graze their 43 mm z spacing separates them by parallax — *that* is the section.
 * Round 11 gives the innermost layer a different silhouette, so the section has to be looked at
 * rather than argued about. ~20 degrees off the wall.
 *
 * 🚨 **AND THESE TWO FRAMES DO NOT WORK — SAID HERE SO THE NEXT ROUND DOES NOT RE-DISCOVER IT.**
 * `ThirdPersonCamera` puts the boom BEHIND the player along the look direction, and the look
 * direction is "at the face centre", so the robot sits on the line between the camera and the
 * hole — at a graze it covers the whole of it, and the boom's own wall raycast then shoves the
 * camera into the corridor. `dig-shots.mjs` records the same problem from the head-on side and
 * `dig-low-two-kinds-of-hole.png` is the same failure again. **Framing a graze needs a camera
 * that is not derived from the player**, i.e. `shoot.mjs --cam`, which cannot dig. The section
 * at a graze is therefore NOT JUDGED by this round.
 */
const GRAZE = { id: 'f.svc_w.0.a', tag: 'svc-graze', back: 1.25, side: 3.3, pitch: 0.02 };
const IC_W = 1.55, IC_H = 2.60, DIG_H = 2.80;
/**
 * Blow counts to photograph. 0 is pristine; the rest walk the whole THROUGH clock.
 * ⚠️ **30 AND 31 ARE A PAIR AND THEY ARE THE POINT** — two frames one swing apart, two thirds of
 * the way through the work, which is the exact moment `digparity-1`'s gap says the wall has
 * stopped answering. Everything else is context for them.
 */
const LADDER = (process.env.VIS1_LADDER ?? '0,6,12,20,30,31,38,44').split(',').map(Number);
/**
 * The two arms. Round 10's row is restored IN FULL — the band AND the three look values round 11
 * moved with it — so the pair differs in exactly the change under test and nothing else.
 */
const ARMS = [
  {
    tag: 'r10',
    band: [0.050, 0.420], lit: [0.050, 0.420],
    bandColor: [0.280, 0.276, 0.268], bandEmissive: [0.020, 0.019, 0.018], lipColor: [0.290, 0.286, 0.278],
    why: 'shipped before round 11 — the shell is one band and the crater floor is frozen from depth 0.42',
  },
  {
    tag: 'r11',
    band: [0.420, 1.000], lit: [0.050, 0.420],
    bandColor: [0.780, 0.772, 0.752], bandEmissive: [0.062, 0.061, 0.058], lipColor: [0.800, 0.792, 0.772],
    why: 'the innermost layer owns the deep half of the axis and joins the shell in value',
  },
];

export default async function visibleShots({ page, shot, note, pass, fail, skip }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 12) => {
    const f0 = await frames();
    for (let i = 0; i < 200; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const head = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    const c = e?.room?.digCensus?.();
    return c ? { on: c.on, mode: c.mode, faces: c.freeFaces } : null;
  });
  if (!head?.on || head.mode !== 'free') {
    skip('the last 58% can be photographed', `arm is dig=${head?.mode ?? 'off'} — re-run with --q "seed=s4&dig=1"`);
    return;
  }
  note(`arm: dig=${head.mode} · ${head.faces} free faces`);

  /** Force the interconnect onto SITE, reset it, set band 3, and stand the player beside it. */
  const setup = (site, arm, icw, ich, digh) => page.evaluate(([s, a, ICW, ICH, DH]) => {
    const e = window.__rrr.engine, room = e.room;
    const p = room.panelOf(s.id);
    if (!p) return { err: `no panel "${s.id}"` };
    const aId = s.id.endsWith('.a') ? s.id : s.id.replace(/\.b$/, '.a');
    const aP = room.panelOf(aId);
    const free = new Map([[p.spec.edge, {
      panel: aId, u: 0.5, v: 0.5, ru: (ICW / 2) / aP.width, rv: (ICH / 2) / DH, salt: 3.7,
    }]]);
    room.setDigPlan({ free });
    /**
     * 🚨 **THE FX HAVE TO GO OR THE PICTURE IS OF THE DUST.** A real dig lands one blow every
     * 0.95 s and the debris has settled long before the next; a drive lands twenty inside one
     * frame, so `onChunk`'s chunks and dust pile up into a cloud that covers the exact surface
     * under test. `dig-promoted.mjs` suppresses the same two hooks for the same reason.
     */
    for (const q of room.panels) { q.onChunk = null; q.onBreak = null; }
    // the arm: band 3's slice of the depth axis, and the band its LIGHTING is gated on
    const set2 = (m, n, b) => { const u = m.userData.breakUniforms; if (u?.[n]) u[n].value.set(b[0], b[1]); };
    const set3 = (m, n, c) => { const u = m.userData.breakUniforms; if (u?.[n]) u[n].value.set(c[0], c[1], c[2]); };
    for (const q of [p, p.twin].filter(Boolean)) {
      set2(q.mats[3], 'uDmgBand', a.band);
      set2(q.mats[3], 'uLitBand', a.lit);
      set3(q.mats[3], 'uBandColor', a.bandColor);
      set3(q.mats[3], 'uBandEmissive', a.bandEmissive);
      set3(q.mats[3], 'uLipColor', a.lipColor);
    }

    const n = p.normal, c = p.root.position;
    const ax = -n.z, az = n.x;
    e.player.pos.set(c.x + n.x * s.back + ax * s.side, e.room.floorY, c.z + n.z * s.back + az * s.side);
    e.player.vel.set(0, 0, 0);
    const yaw = Math.atan2(c.x - e.player.pos.x, c.z - e.player.pos.z);
    e.player.aimYaw = yaw; e.player.aimPitch = 0; e.player.facing = yaw;
    e.cam.yaw = yaw; e.cam.pitch = s.pitch ?? 0; e.cam._first = true;
    return {
      id: p.id, space: p.spec.a, band: [...a.band],
      uDmgBand: [p.mats[3].userData.breakUniforms.uDmgBand.value.x, p.mats[3].userData.breakUniforms.uDmgBand.value.y],
      uLitBand: [p.mats[3].userData.breakUniforms.uLitBand.value.x, p.mats[3].userData.breakUniforms.uLitBand.value.y],
      from: [+e.player.pos.x.toFixed(2), +e.player.pos.z.toFixed(2)],
      dist: +Math.hypot(c.x - e.player.pos.x, c.z - e.player.pos.z).toFixed(2),
    };
  }, [site, arm, icw, ich, digh]);

  /**
   * ⚠️ **RE-PLANT THE CAMERA BEFORE EVERY SHOT.** The live loop is running between stations, so
   * the player drifts and the boom lerps; the first run of this file photographed the two arms
   * from two different places, which is exactly the confound an in-one-page A/B exists to remove.
   */
  const replant = (site) => page.evaluate(([s]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(s.id);
    const n = p.normal, c = p.root.position;
    const ax = -n.z, az = n.x;
    e.player.pos.set(c.x + n.x * s.back + ax * s.side, e.room.floorY, c.z + n.z * s.back + az * s.side);
    e.player.vel.set(0, 0, 0);
    const yaw = Math.atan2(c.x - e.player.pos.x, c.z - e.player.pos.z);
    e.player.aimYaw = yaw; e.player.aimPitch = 0; e.player.facing = yaw;
    e.cam.yaw = yaw; e.cam.pitch = s.pitch ?? 0; e.cam._first = true;
    return [+e.player.pos.x.toFixed(3), +e.player.pos.z.toFixed(3)];
  }, [site]);

  /** Swing `n` more blows with `dig-band.mjs`'s phase-2 aim. Returns where it got to. */
  const swing = (id, n) => page.evaluate(([sid, count]) => {
    const room = window.__rrr.engine.room;
    const p = room.panelOf(sid);
    const g = p.field;
    let hit = 0, opened = p.openChannel().open;
    for (let k = 0; k < count && !opened; k++) {
      const by0 = Math.floor(0.30 / g.cellH), by1 = Math.min(g.rows - 1, Math.ceil(1.80 / g.cellH));
      let bestA = -1, bestN = 0, runA = -1, run = 0;
      for (let cx = 0; cx <= g.cols; cx++) {
        let clear = cx < g.cols;
        for (let cy = by0; cy <= by1 && clear; cy++) if (g.barrier[g.idx(cx, cy)]) clear = false;
        if (clear) { if (run === 0) runA = cx; run++; if (run > bestN) { bestN = run; bestA = runA; } }
        else run = 0;
      }
      if (bestN === 0) break;
      const cy0 = 0, cy1 = Math.min(g.rows - 1, Math.ceil(1.95 / g.cellH));
      const needed = Math.ceil(0.80 / g.cellW);
      const mid = bestA + bestN / 2;
      const cx0 = Math.max(bestA, Math.round(mid - needed / 2));
      const cx1 = Math.min(bestA + bestN - 1, cx0 + needed - 1);
      let bx = cx0, by = cy0, bd = 2;
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const d = g.depth[g.idx(cx, cy)];
          if (d < bd) { bd = d; bx = cx; by = cy; }
        }
      }
      p.applyHit(p.pointAt((bx + 0.5) / g.cols, (by + 0.5) / g.rows), 1);
      hit++;
      opened = p.openChannel().open;
    }
    g.flush();
    const ch = p.openChannel();
    return { hit, opened, maxDepth: +g.maxDepth.toFixed(3), chW: +ch.width.toFixed(2) };
  }, [id, n]);

  for (const arm of ARMS) {
    const s = await setup(SITE, arm, IC_W, IC_H, DIG_H);
    if (s.err) { fail('the last 58% can be photographed', s.err); return; }
    note('');
    note(`ARM "${arm.tag}" — band 3 = [${s.uDmgBand.map((x) => x.toFixed(3)).join(', ')}], `
      + `lit band [${s.uLitBand.map((x) => x.toFixed(3)).join(', ')}] · ${arm.why}`);
    note(`   ${s.id} in ${s.space}, camera ${s.dist} m back at ${s.from.join(', ')}`);
    let at = 0;
    for (const target of LADDER) {
      const r = await swing(SITE.id, target - at);
      at += r.hit;
      const from = await replant(SITE);
      await step(20);
      await shot(`vis1-${arm.tag}-${String(at).padStart(2, '0')}blows`);
      note(`   ${String(at).padStart(3)} blows · maxDepth ${r.maxDepth} · channel ${r.chW} m`
        + `${r.opened ? ' · OPEN' : ''} · camera ${from.join(', ')}`);
      // 🧱 the section, at the one station deep enough for the deep band to be doing its work
      if (at === 30) {
        await replant(GRAZE);
        await step(20);
        await shot(`vis1-${arm.tag}-30blows-graze`);
        note('       + the same crater at a ~20 degree graze — the parallax section');
        await replant(SITE);
        await step(12);
      }
      if (r.opened) break;
    }
  }
  pass('the last 58% is photographed on both arms',
    `${ARMS.length} arms x ${LADDER.length} stations on one crater, one camera, one page`);
}
