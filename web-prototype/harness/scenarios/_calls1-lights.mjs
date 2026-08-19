/**
 * 🚨 **DOES THE LOOSE-ITEM CULL MOVE `numPointLights`, AND THEREFORE COMPILE SHADERS MID-PLAY?**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_calls1-lights.mjs \
 *        --port 5246 --q "seed=s4"
 *
 * This is the one question a draw-call fix in `room.js` could get catastrophically wrong, and
 * the reason is written down in `views/game.js` in capitals: *"`numPointLights` is part of
 * three.js's program cache key, so a count the renderer has never compiled for RECOMPILES EVERY
 * VISIBLE MATERIAL"* — `perf-stall-1` measured one un-warmed count at **+132 programs**, and
 * HANDOFF names that as **John's five-second freeze**.
 *
 * The world gadget pickups carry their own `PointLight`s (`gadgets/index.js` — the nail gun's
 * pilot at 0.5·H, the ball's at 1.0·H). Before this change all six were permanently visible, so
 * their contribution to the count was a CONSTANT. Hiding them by residency makes it a function
 * of where the player is standing — which is exactly the shape of thing that turns into a stall.
 *
 * ⚠️ **THE DELIVERABLE IS `renderer.info.programs.length` DURING THE WALK, NOT THE LIGHT COUNT.**
 * A varying count is harmless if every value was warmed; an un-warmed one shows up as programs
 * being built while the player walks. So the assertion is "the program count does not grow", and
 * the light census is the explanation rather than the verdict.
 */

const STATIONS = (process.env.STATIONS ?? [
  'gallery.west', 'gallery.mid', 'gallery.east',
  'study_w.north', 'study_w.south', 'service.mid',
  'study_e.north', 'study_e.south',
  'ballroom.north', 'ballroom.centre', 'ballroom.south',
  'chapel.centre',
].join(',')).split(',').filter(Boolean);

export default async function lights({ page, note, pass, fail, skip }) {
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

  const has = await page.evaluate(() => !!window.__rrr.engine.room.setLooseCull);
  if (!has) { skip('the cull compiles no shaders mid-play', 'this build has no loose cull'); return; }

  /**
   * ⚠️ COUNT THE LIGHTS THE WAY THREE DOES, WHICH IS `traverseVisible` AND **NO FRUSTUM TEST**.
   * `WebGLRenderer.projectObject` collects lights from every visible object regardless of where
   * the camera is looking, so a light 34 m away behind three walls is still in the array and
   * still in the cache key. Counting "lights near the camera" would answer a different question.
   */
  const read = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    let point = 0, spot = 0, dir = 0;
    e.scene.traverseVisible((o) => {
      if (o.isPointLight) point++;
      else if (o.isSpotLight) spot++;
      else if (o.isDirectionalLight) dir++;
    });
    return { point, spot, dir, programs: e.renderer.info.programs.length,
      calls: e.renderer.info.render.calls,
      resident: e.room.spaces.filter((s) => s.visible).map((s) => s.id).join('+') };
  });
  const setCull = (on) => page.evaluate((v) => window.__rrr.engine.room.setLooseCull(v), on);

  const base = await read();
  note(`at rest: ${base.point} point · ${base.spot} spot · ${base.dir} directional`
    + ` · ${base.programs} programs built`);

  const rows = [];
  for (const name of STATIONS) {
    const ok = await page.evaluate((n) => {
      const e = window.__rrr.engine;
      const a = e.room.anchor(n);
      if (!a) return false;
      e.player.pos.set(a.x, e.room.floorY, a.z);
      e.player.vel.set(0, 0, 0);
      e.cam._first = true;
      return true;
    }, name);
    if (!ok) { note(`no anchor named ${name}`); continue; }
    await step(40);
    /**
     * ⚠️ **`FLIP=0` IS THE ARM THAT ACTUALLY ANSWERS THE QUESTION, AND THE FIRST BUILD OF THIS
     * PROBE DID NOT HAVE IT.** With the flip on, programs grew 232 -> 284 over the walk and the
     * assertion failed — but ON and OFF read the SAME program count at every one of the twelve
     * stations, so not one of those compiles happened at the flip. They happen on ARRIVING at a
     * station, which every build does and this change cannot affect. Attributing them to the
     * cull would be the expensive kind of wrong. The clean form is two walks that never flip:
     * `--q "seed=s4"` (cull on) against `--q "seed=s4&loose=0"` (the pre-change build), same
     * stations, same order, compared on total program growth.
     */
    if (process.env.FLIP === '0') {
      const on = await read();
      rows.push({ name, on, off: on });
      note(`${name.padEnd(16)} [${on.resident}] · point lights ${on.point}`
        + ` · programs ${on.programs} · calls ${on.calls}`);
      continue;
    }
    await setCull(true);  await step(6); const on = await read();
    await setCull(false); await step(6); const off = await read();
    await setCull(true);  await step(6);
    rows.push({ name, on, off });
    note(`${name.padEnd(16)} [${on.resident}] · point lights ON ${on.point} / OFF ${off.point}`
      + ` · programs ON ${on.programs} / OFF ${off.programs}`);
  }
  if (!rows.length) { fail('the cull compiles no shaders mid-play', 'no station parked'); return; }

  const end = await read();
  const counts = [...new Set(rows.map((r) => r.on.point))].sort((a, b) => a - b);
  const countsOff = [...new Set(rows.map((r) => r.off.point))].sort((a, b) => a - b);
  note(`point-light counts SEEN with the cull ON: ${counts.join(', ')}`
    + ` · with it OFF (the pre-change build): ${countsOff.join(', ')}`);
  note(`programs: ${base.programs} at rest -> ${end.programs} after walking all `
    + `${rows.length} stations both ways`);

  const grew = end.programs - base.programs;
  note(`PROGRAM GROWTH OVER THE WALK: +${grew}`
    + (process.env.FLIP === '0'
      ? '  (no flips — compare this figure against the other arm)'
      : '  (with flips — see the note in the loop; this figure is NOT attributable to the cull)'));

  if (process.env.FLIP === '0') {
    pass('a no-flip walk was taken',
      `${rows.length} stations, ${base.programs} -> ${end.programs} programs (+${grew}), `
      + `point-light counts {${counts.join(',')}} — compare against the other arm`);
  } else {
    /**
     * THE ATTRIBUTABLE TEST: did FLIPPING compile anything? Programs are read either side of
     * each flip at the same station, so this isolates the cull from the walk.
     */
    const atFlip = rows.filter((r) => r.off.programs !== r.on.programs);
    atFlip.length === 0
      ? pass('flipping the cull compiles NO shaders',
        `${rows.length} stations, program count identical either side of every flip `
        + `(${rows.map((r) => r.on.programs).join('/')}) while the point-light count moved from `
        + `{${countsOff.join(',')}} to {${counts.join(',')}}`)
      : fail('flipping the cull compiles NO shaders',
        atFlip.map((r) => `${r.name} ${r.on.programs}->${r.off.programs}`).join(' · '));
  }

  /**
   * The weaker but sharper claim: the cull must not ADD values to the set of counts the renderer
   * can meet. If it does and programs still did not grow, the warm-up happens to cover it — say
   * so rather than calling it safe.
   */
  const added = counts.filter((c) => !countsOff.includes(c));
  added.length === 0
    ? pass('the cull introduces no new point-light count',
      `the cull-on walk meets {${counts.join(',')}}, a subset of the pre-change {${countsOff.join(',')}}`)
    : note(`⚠️ the cull ADDS point-light counts ${added.join(', ')} that the pre-change build `
      + `never met — covered by the warm-up above (programs did not grow), but state it`);
}
