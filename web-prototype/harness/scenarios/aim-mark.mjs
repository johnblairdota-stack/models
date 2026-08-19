/**
 * 🎯 **THE DIG MARK — is it where the blow lands, and is it the SIZE of the blow?**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/aim-mark.mjs \
 *        --port 5283 --q "seed=s4" --shots
 *
 * `src/game/aimmark.js` carries the design. The one claim that has to be measured rather than
 * looked at is **honesty about size**: a mark that showed a dot where the brush takes a metre
 * would teach the player to distrust it, and it would photograph perfectly.
 *
 *   A1  IT IS ON THE WALL AND VISIBLE   a real ray at a real face; the ring's own vertices
 *   A2  ITS DIAMETER IS THE BRUSH'S     against the footprint MEASURED off a real blow, not
 *       against the formula it was drawn with — and reintroduced as a dot, which must FAIL
 *   A3  THE POWER LADDER MOVES IT, AND STOPS AT x1   `[` and `]` through all six rungs
 *   A4  IT FOLLOWS THE CRATER           the ring is not coplanar once there is a bowl to sink into
 *   A5  IT READS ON ALL THREE SURFACES  coat / white shell / cyan, measured as a paired in-place
 *       flip in ONE frozen page, plus the frames
 *   A6  IT COSTS ONE DRAW CALL          same page, same station, mark on vs off
 */

import { hold, release } from '../still.mjs';
import { decodePng } from '../pxdiff.mjs';

/**
 * ⚠️ **A MEAN OVER THE WHOLE FRAME IS THE WRONG STATISTIC FOR A LINE FEATURE** — `collapse-1`
 * filed exactly that mistake against the crazing and had to redo it. A 5 cm ring is hairlines;
 * what matters is how many pixels moved and by HOW MUCH on the ones that did, never the average
 * over pixels it never touched.
 */
function lumaDiff(a, b) {
  const A = decodePng(a), B = decodePng(b);
  let moved = 0, sum = 0, worst = 0;
  const n = Math.min(A.data.length, B.data.length);
  for (let i = 0; i < n; i += 4) {
    const la = 0.299 * A.data[i] + 0.587 * A.data[i + 1] + 0.114 * A.data[i + 2];
    const lb = 0.299 * B.data[i] + 0.587 * B.data[i + 1] + 0.114 * B.data[i + 2];
    const d = Math.abs(la - lb);
    if (d > 8) { moved++; sum += d; worst = Math.max(worst, d); }
  }
  const px = n / 4;
  return { pct: +((moved / px) * 100).toFixed(3), mean: moved ? +(sum / moved).toFixed(1) : 0,
    worst: +worst.toFixed(1), px };
}

export default async function aimMark({ page, note, pass, fail, skip, shot, snap }) {
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

  /**
   * Park the player square in front of a free dig face with the hammer out, at the distance the
   * swing ray actually reaches, and point the aim at a named height on the wall.
   */
  const park = (edge, aimY) => page.evaluate(([edge, aimY]) => {
    const e = window.__rrr.engine;
    const face = e.room.panels.find((p) => p.spec?.free && p.spec.edge === edge && p.spec.side === 'a')
      ?? e.room.panels.find((p) => p.spec?.free);
    if (!face) return null;
    e.room.setDigPlan({ seed: e.run.seed });
    e.room.unlockBarrier();
    const n = face.normal, c = face.root.position;
    const stand = 0.95;
    e.player.pos.set(c.x + n.x * stand, e.room.floorY, c.z + n.z * stand);
    e.player.sledge.owned = true; e.player.sledge.equip();
    const yaw = Math.atan2(-n.x, -n.z);
    const eye = e.room.floorY + e.player.height * 0.905;
    e.player.aimYaw = yaw; e.player.facing = yaw;
    /**
     * 🚨 **AIM BY ASKING THE GAME, NOT BY INVERTING ITS MODEL.**
     *
     * This was `atan2(aimY - eye, stand) + 0.178` — a closed-form inverse of the swing ray's
     * fixed 0.18 down-tilt, i.e. a SECOND COPY of `Player._swingRay`'s arithmetic living in the
     * instrument. `reach-1` decoupled the impact height from the standoff (the height now comes
     * from pitch alone), and that copy immediately began parking the mark 0.26 m away from the
     * height it names — silently, because no assertion here reads the height back.
     *
     * A setup that re-derives the thing under test goes stale the moment the thing under test
     * moves. So sweep the pitch range, cast the game's OWN ray at each sample, and keep the pitch
     * whose real impact is nearest `aimY`. It costs 40 raycasts once, it needs no knowledge of
     * how the aim is modelled, and it cannot drift again.
     */
    let pitch = 0, bestErr = Infinity;
    for (let i = 0; i < 40; i++) {
      const q = -0.95 + (0.95 + 0.62) * (i / 39);
      e.player.aimPitch = q;
      const r = e.player._swingRay();
      const h = e.room.castRay(r.origin, r.dir, 2.45, { forDamage: true });
      if (!h) continue;
      const err = Math.abs(h.point.y - aimY);
      if (err < bestErr) { bestErr = err; pitch = q; }
    }
    e.player.aimPitch = pitch;
    e.cam.yaw = yaw; e.cam.pitch = pitch; e.cam._first = true;
    return { face: face.id, stand, pitch: +pitch.toFixed(3), eye: +eye.toFixed(3) };
  }, [edge, aimY]);

  const readMark = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    const m = window.__rrr.mark();
    const g = e.scene.getObjectByName('aim.mark');
    if (!g) return { ...m, verts: null };
    const a = g.geometry.attributes.position.array;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < a.length; i += 3) {
      x0 = Math.min(x0, a[i]); x1 = Math.max(x1, a[i]);
      y0 = Math.min(y0, a[i + 1]); y1 = Math.max(y1, a[i + 1]);
      z0 = Math.min(z0, a[i + 2]); z1 = Math.max(z1, a[i + 2]);
    }
    // the ring lies in the wall plane, so its footprint is the wider of the two horizontal spans
    return { ...m, span: +Math.max(x1 - x0, z1 - z0).toFixed(4), rise: +(y1 - y0).toFixed(4),
      lowY: +y0.toFixed(3), depthSpread: +Math.min(x1 - x0, z1 - z0).toFixed(4),
      aim: e.player.workAim ? { panel: e.player.workAim.panel.id,
        y: +e.player.workAim.point.y.toFixed(3) } : null,
      power: +e.player.nextBlowPower().toFixed(4) };
  });

  const parked = await park(process.env.EDGE ?? 'svc_w', 1.25);
  if (!parked) { skip('the mark can be measured', 'no free dig face — re-run with --q "dig=free"'); return; }
  await step(6);
  const m0 = await readMark();
  note(`parked ${parked.stand} m off ${parked.face}, eye ${parked.eye} m, pitch ${parked.pitch} rad `
    + `· mark ${JSON.stringify({ mode: m0.mode, visible: m0.visible, panel: m0.panel,
      diameter: m0.diameter, span: m0.span, rise: m0.rise, power: m0.power })}`);

  // =========================================================================
  // A1 · IT IS ON THE WALL, ON THE PANEL THE BLOW WILL LAND ON
  // =========================================================================
  (m0.visible && m0.panel && m0.aim && m0.panel === m0.aim.panel && m0.rise > 0.5)
    ? pass('the mark is a world object on the panel the next blow damages',
      `visible on ${m0.panel}, which is the same panel \`workAim\` names — and \`workAim\` is `
      + `\`_swingRay\`, the ray \`_resolveSledgeHit\` damages with. Its vertices span ${m0.span} m `
      + `across and ${m0.rise} m up IN THE WORLD, so it is not a screen-space reticle: a crosshair `
      + `has no metres.`)
    : fail('the mark is a world object on the panel the next blow damages', JSON.stringify(m0));

  // =========================================================================
  // A2 · THE SIZE IS THE BRUSH'S — measured off a real blow, then reintroduced as a dot
  // =========================================================================
  /**
   * 🚨 **NOT COMPARED TO THE FORMULA IT WAS DRAWN WITH.** That would be one number read twice.
   * The reference is the footprint of an ACTUAL blow: swing once at the mark's own centre on a
   * pristine face and measure how far from the impact the field's depth actually moved.
   */
  const real = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const p = e.player.workAim.panel;
    const f = p.field;
    p.resetDamage();
    const before = Float32Array.from(f.depth);
    const q = p.uvAt(e.player.workAim.point);
    p.applyHit(e.player.workAim.point, e.player.nextBlowPower());
    /**
     * ⚠️ **TWO RADII, AND THE BAR IS SET AGAINST THE SECOND.** `reach` is the furthest cell that
     * moved AT ALL — and `GRAIN_FLOOR` deliberately lets a hard plate outside the brush take a
     * scratch, so `reach` includes texels that moved by a millionth. `bite` is the furthest cell
     * that took at least HALF this blow's largest increment — the half-power contour, i.e. the
     * disc a player would describe as "where it hit". A mark sized to `reach` would over-promise;
     * one sized to a dot would under-promise by an order of magnitude.
     *
     * ⚠️ **A FIFTH WAS TRIED FIRST AND DID NOT DISCRIMINATE**, which is worth writing down: the
     * brush's shape floor is `B.rim` (0.62 of peak) just inside `R` and `B.rim * GRAIN_FLOOR`
     * (~0.22) outside it, so a 20% bar swept up the whole grain skirt and reported
     * `bite === reach` to four decimal places. Half sits in the gap between those two plateaus,
     * which is exactly where the brush edge is.
     */
    let far = 0, bite = 0, n = 0, peak = 0;
    const d = new Float32Array(f.depth.length);
    for (let i = 0; i < f.depth.length; i++) { d[i] = f.depth[i] - before[i]; if (d[i] > peak) peak = d[i]; }
    for (let cy = 0; cy < f.rows; cy++) {
      for (let cx = 0; cx < f.cols; cx++) {
        const i = f.idx(cx, cy);
        if (d[i] <= 1e-6) continue;
        n++;
        const du = ((cx + 0.5) / f.cols - q.u) * p.width;
        const dv = ((cy + 0.5) / f.rows - q.v) * p.height;
        const r = Math.hypot(du, dv);
        far = Math.max(far, r);
        if (d[i] >= peak * 0.5) bite = Math.max(bite, r);
      }
    }
    p.resetDamage();
    return { cells: n, reach: +far.toFixed(4), reachD: +(far * 2).toFixed(4),
      diameter: +(bite * 2).toFixed(4), peak: +peak.toFixed(4),
      brush: +f.brush.radius.toFixed(4) };
  });
  const drawn = m0.diameter;
  const err = Math.abs(drawn - real.diameter) / real.diameter;
  note(`ONE REAL BLOW at the mark's centre moved ${real.cells} cells; the furthest to move at all `
    + `was ${real.reach} m out (${real.reachD} m across, the grain floor scratching plate outside `
    + `the brush) and the furthest to take HALF the peak increment was `
    + `${(real.diameter / 2).toFixed(4)} m out — a measured bite of ${real.diameter} m across. `
    + `The ring is drawn at ${drawn} m. Error ${(err * 100).toFixed(1)}%.`);
  /**
   * ⚠️ **TWO-SIDED, AND NOT A SYMMETRIC PERCENTAGE — the two directions are not the same mistake.**
   * Claiming MORE than the blow takes is the lie that gets a player killed on a sill; claiming
   * much LESS is the dot this design exists to refuse. So: never over-promise, and never fall
   * under three quarters. Measured, the ring is the NOMINAL brush and a real blow reaches ~1.2x
   * that in places, because `GRAIN` and `LOBE` displace the rim outward per texel — so the ring
   * is the disc that is guaranteed to go, with an irregular fringe outside it that sometimes does.
   */
  (drawn <= real.diameter * 1.02 && drawn >= real.diameter * 0.75)
    ? pass('the mark is the size of the blow, against a MEASURED footprint',
      `${drawn} m drawn against ${real.diameter} m taken by one real blow — inside the blow at `
      + `${(100 - err * 100).toFixed(0)}% of it, so it never promises ground the hammer does not `
      + `reach, and nowhere near a dot. The measured bite is ${(real.diameter / drawn).toFixed(2)}x `
      + `the nominal brush because \`GRAIN\` and \`LOBE\` push the rim outward per texel; the ring `
      + `is the part that always goes.`)
    : fail('the mark is the size of the blow, against a MEASURED footprint',
      `${drawn} m drawn against ${real.diameter} m measured (reach ${real.reachD} m) — `
      + (drawn > real.diameter ? 'it OVER-promises' : 'it is under three quarters of the blow'));


  // ...and the reintroduction. Put the lie back and the check above must go red.
  const lied = await page.evaluate(async ([ref]) => {
    const M = await import('/src/game/aimmark.js');
    const keep = M.AimMark.footprint;
    M.AimMark.footprint = () => 0.06;          // the dot this design exists to refuse
    const e = window.__rrr.engine;
    e.room.update(0); window.__rrr.engine;      // nothing needed; the view updates the mark itself
    return { keep: !!keep, ref };
  }, [real.diameter]);
  await step(4);
  const dot = await readMark();
  await page.evaluate(async () => {
    const M = await import('/src/game/aimmark.js');
    M.AimMark.footprint = (field, power) => (field?.brush?.radius ?? 0.52)
      * (0.55 + 0.45 * Math.min(1, Math.max(0, power)));
  });
  await step(3);
  const restored = await readMark();
  const dotErr = Math.abs(dot.diameter - real.diameter) / real.diameter;
  note(`reintroduction: footprint forced to a 0.12 m dot -> the ring measures `
    + `${dot.diameter} m (${(dotErr * 100).toFixed(0)}% off the measured blow); restored -> `
    + `${restored.diameter} m`);
  (lied.keep && dot.diameter < real.diameter * 0.75 && Math.abs(restored.diameter - drawn) < 1e-3)
    ? pass('and the size check FAILS when the mark is made to lie',
      `forcing \`AimMark.footprint\` to a dot in the same page takes the ring to ${dot.diameter} m — `
      + `${(dotErr * 100).toFixed(0)}% off the measured blow and far under A2's three-quarters `
      + `floor, so A2 goes red — and restoring it returns the identical ${restored.diameter} m. `
      + `A2 can detect the defect it was written for.`)
    : fail('and the size check FAILS when the mark is made to lie',
      JSON.stringify({ dot: dot.diameter, restored: restored.diameter, drawn }));

  // =========================================================================
  // A3 · THE POWER LADDER — the ring shrinks with `[` and stops growing at x1
  // =========================================================================
  const ladder = await page.evaluate(async () => {
    const M = await import('/src/game/aimmark.js');
    const e = window.__rrr.engine;
    const f = e.player.workAim.panel.field;
    const out = [];
    for (const p of [0.125, 0.25, 0.5, 1, 2, 4]) {
      e.player.digPower = p;
      out.push([p, +(M.AimMark.footprint(f, e.player.nextBlowPower()) * 2).toFixed(4)]);
    }
    e.player.digPower = 1;
    return out;
  });
  note(`dig power -> mark diameter: ${ladder.map(([p, d]) => `x${p} ${d} m`).join(' · ')}`);
  const rising = ladder.slice(0, 4).every(([, d], i) => i === 0 || d > ladder[i - 1][1]);
  const plateau = ladder[3][1] === ladder[4][1] && ladder[4][1] === ladder[5][1];
  (rising && plateau)
    ? pass('the mark moves with `[` and honestly stops at x1',
      `${ladder[0][1]} -> ${ladder[3][1]} m across the four rungs below and at the base, then `
      + `flat at ${ladder[5][1]} m for x2 and x4. That is \`_add()\`'s SPLIT clamp told truthfully: `
      + `above 1 the power deepens the deposit and does not widen the brush, so a mark that grew `
      + `there would be the lie in the other direction.`)
    : fail('the mark moves with `[` and honestly stops at x1', JSON.stringify(ladder));

  // =========================================================================
  // A4 · IT FOLLOWS THE CRATER
  // =========================================================================
  /**
   * ⚠️ **THE CRATER HAS TO BE OFF-CENTRE OR THE TEST CANNOT SEE ANYTHING, AND THE FIRST VERSION
   * OF THIS CHECK DID NOT AND READ 0 -> 0.** The ring is a circle of constant radius and a blow
   * makes a rotationally symmetric bowl, so digging AT the aim point sinks every sample by the
   * same amount and the spread stays zero however deep the hole is. Worse, past a couple of blows
   * the near face is through at the aim point, the ray goes on to the twin, and the ring correctly
   * stops sinking at all (see `aimmark.js` on which surface recedes). So: one blow placed just
   * outside the brush from the aim point, which leaves the aim point standing and puts half the
   * ring in a crater.
   */
  await park(process.env.EDGE ?? 'svc_w', 1.25);
  await step(5);
  const flat = await readMark();
  const off = await page.evaluate(() => {
    const e = window.__rrr.engine;
    if (!e.player.workAim) return { stillThere: false, u: null, du: null };
    const p = e.player.workAim.panel;
    p.resetDamage();
    const q = p.uvAt(e.player.workAim.point);
    const R = p.field.brush.radius;
    const at = p.pointAt(q.u + (R * 1.55) / p.width, q.v, new (e.player.pos.constructor)());
    for (let n = 0; n < 3; n++) p.applyHit(at, 1);
    return { u: +q.u.toFixed(3), du: +((R * 1.55) / p.width).toFixed(3),
      stillThere: p.field.depthAt(q.u, q.v) < 0.999 };
  });
  await step(4);
  const bowl = await readMark();
  note(`one crater placed ${off.du} of the face's width beside the aim point (the aim point itself `
    + `is still standing: ${off.stillThere}) · ring depth spread through the wall: pristine `
    + `${flat.depthSpread} m -> ${bowl.depthSpread} m`);
  (off.stillThere && bowl.depthSpread > flat.depthSpread + 0.03)
    ? pass('the ring sinks into the crater instead of floating on the wall plane',
      `the spread of the ring's vertices along the axis through the wall goes ${flat.depthSpread} `
      + `-> ${bowl.depthSpread} m once half of it is over a bowl. A screen-space reticle and a `
      + `flat decal both stay at ${flat.depthSpread}.`)
    : fail('the ring sinks into the crater instead of floating on the wall plane',
      JSON.stringify({ flat: flat.depthSpread, bowl: bowl.depthSpread, off }));

  // =========================================================================
  // A5 · THREE SURFACES — paired in-place flip in one frozen page
  // =========================================================================
  /**
   * ⚠️ `still.mjs`, and PARK AND SETTLE WITH THE SIM RUNNING BEFORE THE HOLD. HANDOFF: the
   * dominant term in the same-config floor is `_liveLoop`'s dynamic resolution, and the camera is
   * driven by an updater, so freezing first leaves it behind.
   */
  /**
   * 🚨 **THE RING HAS TO BE STANDING ON THE SURFACE IT IS BEING JUDGED AGAINST, AND THE FIRST
   * VERSION OF THIS BLOCK WAS NOT — IT MEASURED THE COAT THREE TIMES.** It dug the crater to one
   * SIDE of the aim point (which A4 needs, and which keeps `workAim` alive) and then claimed the
   * ring was over shell and cyan. Looked at, all three frames showed a white ring on ornate
   * panelling beside a hole. **The claim was wrong even though every number in it was right.**
   *
   * The state that actually puts the ring on the white and on the cyan is a WIDE patch dug to a
   * depth that has torn those layers but has NOT reached `OPEN_AT` — the cell is then still
   * solid, `traceBoxes` still stops on it, `workAim` survives, and the ring sits on exposed
   * shell or exposed structure. `DAMAGE_BANDS` gives the depths: the coat is gone past 0.155, the
   * front of the shell past 0.420, and band 3 runs 0.420 -> 1.000 so the cyan is only properly
   * out near the top of the range. Hence 0.00 / 0.30 / 0.96, capped under 0.985 so the collider
   * never disappears from under the ray.
   */
  const SURFACES = [
    ['coat', 0.00],     // the ornate coat: pristine
    ['shell', 0.30],    // coat torn off, white shell standing
    ['cyan', 0.96],     // both shell layers nearly gone, structure showing
  ];
  const contrast = [];
  for (const [name, target] of SURFACES) {
    // ⚠️ RE-PARKED EVERY TIME — the previous surface left the wall dug.
    await park(process.env.EDGE ?? 'svc_w', 1.25);
    await step(4);
    const staged = await page.evaluate(([target]) => {
      const e = window.__rrr.engine;
      if (!e.player.workAim) return null;
      const p = e.player.workAim.panel;
      p.resetDamage();
      const q = p.uvAt(e.player.workAim.point);
      const R = p.field.brush.radius;
      // depth under the RING itself — eight samples on the ring, plus its centre
      const probe = () => {
        let mn = 1, mx = 0;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          const d = p.field.depthAt(q.u + (R * Math.cos(a)) / p.width,
            q.v + (R * Math.sin(a)) / p.height);
          mn = Math.min(mn, d); mx = Math.max(mx, d);
        }
        // ⚠️ THE RING'S OWN SAMPLES ONLY. Folding the CENTRE into `mn` pinned it at 0 (the blows
        // go round an annulus, so the centre stays shallow on purpose) and the loop then ran to
        // its `mx` cap on both arms — staging "shell" and "cyan" to the identical wall and
        // reporting two readings of one surface as two surfaces.
        return { mn, mx, centre: p.field.depthAt(q.u, q.v) };
      };
      /**
       * ⚠️ **THE BLOWS GO ROUND THE RING, NOT THROUGH ITS CENTRE, AND THAT IS WHY.** A grid over
       * the whole disc deepens the CENTRE fastest (most overlap), and the centre is where the
       * swing ray lands — take it past `OPEN_AT` and the collider box goes, the ray flies through,
       * `workAim` is null and the mark hides. The first version of this staging did exactly that:
       * two passes at power 0.12 and it reported `0.371..1`, then measured a hidden mark against
       * a hidden mark and called it 0% moved. Digging an annulus at the ring's own radius puts
       * the depth exactly where the ring sits and leaves the aim point standing.
       *
       * ⚠️ And the probe runs between EVERY blow, not between passes: `resist` slows the deposit
       * as depth grows but the first blows are coarse, and one pass of 16 was enough to overshoot.
       */
      /**
       * 🚨 **AND THE BLOWS GO STRAIGHT INTO THE FIELD, NOT THROUGH `wall.applyHit`.** The previous
       * version staged with real blows and photographed a crater packed edge to edge with FROZEN
       * chunks: `hold()` stops the page, so mid-flight debris occludes the ring identically in
       * both arms and the diff reads 0% — a hidden mark measured against a hidden mark. Going in
       * at `field.applyHit(u, v, power)` skips `onChunk` and spawns no debris and no dust, while
       * writing the *same* array the shader samples and the collider decomposes, so the wall the
       * frame shows is a real dig state and not a mock-up.
       */
      let hits = 0;
      if (target > 0) {
        outer:
        for (let pass = 0; pass < 400; pass++) {
          for (let k = 0; k < 16; k++) {
            const r = probe();
            if (r.mn >= target || r.mx > 0.985
              || p.field.depthAt(q.u, q.v) > 0.90) break outer;
            const a = (k / 16) * Math.PI * 2;
            p.field.applyHit(q.u + (R * Math.cos(a)) / p.width,
              q.v + (R * Math.sin(a)) / p.height, 0.05);
            hits++;
          }
        }
        p._solidBoxes = null; p._sightBoxes = null;
        p._syncStageFromField?.();
        p._apply?.();
      }
      p.field.flush();
      const r = probe();
      return { passes: hits, min: +r.mn.toFixed(3), max: +r.mx.toFixed(3),
        centre: +p.field.depthAt(q.u, q.v).toFixed(3),
        aim: !!e.player.workAim, panel: p.id };
    }, [target]);
    if (!staged || !staged.aim) {
      skip(`the mark reads on ${name}`, 'workAim went null while staging the surface');
      continue;
    }
    note(`  staging ${name}: ${staged.passes} low-power passes -> depth under the ring `
      + `${staged.min}..${staged.max} (target ${target}; the cell must stay under 0.999 or the `
      + `collider goes and with it the ray)`);
    await step(8);
    await hold(page);
    await page.evaluate(() => window.__rrr.mark(2));
    await step(2);
    const on = await snap(`${name}-on`);
    await step(2);
    const on2 = await snap(`${name}-on2`);          // the same-config FLOOR, in the same page
    await shot(`aimmark-${name}-ON`);
    await page.evaluate(() => window.__rrr.mark(0));
    await step(2);
    const off = await snap(`${name}-off`);
    await shot(`aimmark-${name}-OFF`);
    await page.evaluate(() => window.__rrr.mark(2));
    await release(page);
    const d = lumaDiff(on, off);
    const floor = lumaDiff(on, on2);
    d.floor = floor.pct;
    contrast.push([name, d]);
    note(`  ${name.padEnd(6)} mark ON vs OFF, same frozen frame: ${d.pct}% of the frame moved by `
      + `more than 8 luma, mean ${d.mean} on the pixels that moved, worst ${d.worst} `
      + `(same-config floor ${floor.pct}%)`);
  }
  const weakest = contrast.reduce((a, b) => (a[1].mean < b[1].mean ? a : b));
  (contrast.every(([, d]) => d.pct > 0.02 && d.mean > 20 && d.pct > d.floor * 4))
    ? pass('the mark reads on all three surfaces the dig tears through',
      `coat / white shell / cyan, each as a paired in-place uniform-style flip in ONE frozen page: `
      + contrast.map(([n, d]) => `${n} ${d.pct}% at mean ${d.mean} against a ${d.floor}% floor`).join(' · ')
      + `. The weakest is ${weakest[0]} and it is still ${weakest[1].mean} luma on the pixels that `
      + `moved, which is why the ring is a dark-bright-dark sandwich rather than one colour.`)
    : fail('the mark reads on all three surfaces the dig tears through', JSON.stringify(contrast));

  // =========================================================================
  // A6 · WHAT IT COSTS — one page, one station, in-place flip
  // =========================================================================
  // ⚠️ RE-PARK FIRST. The previous block left the wall dug and `workAim` possibly null, which
  // hides the mark — and an ON/OFF flip with the mark hidden in BOTH arms reads +0 and passes.
  // That is exactly what the first run of this scenario reported, at a station where A5 had just
  // proved the same mark moves 0.3% of the frame. A perf A/B on an object that is not drawn is
  // the "green because its setup never dressed the body" failure HANDOFF names.
  await park(process.env.EDGE ?? 'svc_w', 1.25);
  await step(6);
  const callsVisible = await readMark();
  const calls = await page.evaluate(async () => {
    const e = window.__rrr.engine;
    const read = () => ({ calls: e.renderer.info.render.calls, tris: e.renderer.info.render.triangles });
    const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    window.__rrr.mark(2); await settle(); await settle();
    const on = read();
    window.__rrr.mark(0); await settle(); await settle();
    const off = read();
    window.__rrr.mark(2); await settle(); await settle();
    const on2 = read();
    return { on, off, on2 };
  });
  const dCalls = calls.on.calls - calls.off.calls;
  note(`draw calls at this station (mark visible: ${callsVisible.visible}): mark ON `
    + `${calls.on.calls} · OFF ${calls.off.calls} · ON again ${calls.on2.calls} · triangles `
    + `${calls.on.tris} / ${calls.off.tris}`);
  const dTris = calls.on.tris - calls.off.tris;
  (callsVisible.visible && dCalls >= 0 && dCalls <= 2)
    ? pass('the mark costs a fixed handful of draw calls and no material key per panel',
      `${calls.off.calls} -> ${calls.on.calls} (+${dCalls}) flipped in place at one station with `
      + `the mark confirmed VISIBLE in the ON arm, and back to ${calls.on2.calls}. It is ONE `
      + `indexed \`BufferGeometry\` with ONE \`MeshBasicMaterial\` whose vertices are rewritten `
      + `rather than rebuilt — HANDOFF's rule is that the unit is the MESH. ⚠️ The delta is 2 and `
      + `not 1, and +${dTris} triangles against the ring's 640 says why: the pipeline submits the `
      + `scene TWICE per frame, so one mesh is two calls. That is a property of the pipeline, not `
      + `of this object, and it is flat — it does not scale with panels, faces or dig state.`)
    : fail('the mark costs a fixed handful of draw calls and no material key per panel',
      JSON.stringify({ ...calls, visible: callsVisible.visible }));

  // =========================================================================
  // THE FRAME THE WHOLE SLICE IS FOR — the mark walked down onto the floor line
  // =========================================================================
  /**
   * John's sentence is *"I need to look far down and target the bottom of the wall but that's not
   * intuitive"*. The mark's answer is that the bottom of the ring IS the bottom of the blow, so
   * lining it up with the skirting is a thing you can SEE rather than a thing you estimate. Two
   * frames at the same station: the aim that feels level (and secretly leaves a sill), and the
   * aim that actually reaches the floor.
   */
  // ...the size claim as a PICTURE, which is the form John can check in two seconds: the ring on
  // pristine wall, then the crater one blow later, same eye, same frame.
  await park(process.env.EDGE ?? 'svc_w', 1.25);
  await step(14);
  await shot('aimmark-footprint-BEFORE');
  const fired = await page.evaluate(() => {
    const e = window.__rrr.engine;
    if (!e.player.workAim) return false;
    e.player.workAim.panel.applyHit(e.player.workAim.point, e.player.nextBlowPower());
    return true;
  });
  await step(40);            // let the chips land, so the crater is what the frame is of
  await shot('aimmark-footprint-AFTER');
  note(`\`aimmark-footprint-{BEFORE,AFTER}\` (blow landed: ${fired}) — the ring, then the crater `
    + `one blow later from the same eye. The ring is the claim and the hole is the receipt.`);

  for (const [tag, aimY] of [['level', 1.45], ['base', 0.52]]) {
    await park(process.env.EDGE ?? 'svc_w', aimY);
    await step(14);
    const m = await readMark();
    note(`  ${tag}: the ring's lowest vertex is at y ${m.lowY} m — the bottom of the crater this `
      + `blow would leave. A sill of that height is what the swing leaves behind.`);
    await shot(`aimmark-aim-${tag}`);
  }

  note('LOOK CALL, NOT MINE: `aimmark-{coat,shell,cyan}-{ON,OFF}` are the three surfaces, '
    + '`aimmark-footprint-{BEFORE,AFTER}` is the size claim and its receipt, and '
    + '`aimmark-aim-{level,base}` is the thing the slice is for. `?mark=1` is the same ring '
    + 'without the strain fusion — judge whether carrying "this spot is nearly gone" on the '
    + 'targeting affordance is one idea or two.');
}
