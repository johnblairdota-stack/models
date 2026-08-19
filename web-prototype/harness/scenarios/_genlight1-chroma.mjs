#!/usr/bin/env node
/**
 * _genlight1-chroma.mjs — WHICH LIGHT IS MAKING THE TOP DECILE WARM?
 *
 * `genlight-1`, 2026-08-15.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_genlight1-chroma.mjs \
 *        --port 5510 --q "plan=gen&planseed=0"          # the generated house
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_genlight1-chroma.mjs \
 *        --port 5510 --q "seed=s4"                      # the authored house, for reference
 *
 * `docs/slices/task-estate.md`'s gate is numeric and `genplan.js`'s first measured rig FAILED half
 * of it: median L went 2.7 -> 22.2 in a generated ballroom (the whole point) while top-decile
 * `(r−b)/L` went to **0.253 there and 0.575 in a generated gallery**, against a target of 0.14.
 * The obvious story — "the key is warm" — is refuted before this file runs: the key is `0xdfe6f4`,
 * i.e. slightly COOL. So this asks the frame instead of arguing about it.
 *
 * WHAT IT DOES. Parks at a station, freezes the picture with `still.mjs` (which also parks the
 * updaters, so the rig's per-frame intensity breathing stops writing over the ablation), then
 * takes one frame per light with that light's intensity set to ZERO and everything else untouched.
 * Grade the frames afterwards with `harness/grade.mjs`; the light whose removal collapses the top
 * decile's `(r−b)/L` is the one that owns it.
 *
 * 🚨 CONTROLS, EVERY RUN.
 *   N1  the SAME-CONFIG FLOOR. Two frames with nothing ablated between them. Any per-light delta
 *       smaller than the difference between these two is noise, not a finding. ⚠️ HANDOFF:
 *       "byte-identical" is an impossible test and must never be demanded as proof.
 *   N2  a light that DOES NOT EXIST is asked for. It must come back UNRESOLVED and write no
 *       frame — otherwise "this light does not matter" and "I never turned it off" look the same.
 *   N3  every ablation is asserted to have actually landed: the intensity is read back from the
 *       scene AFTER the write and must be 0, and back at its old value after the restore.
 */

import path from 'node:path';

/** The five lights `makeLightRig` drives, identified off the scene by type + construction order. */
const LIGHTS = ['key', 'warmA', 'warmB', 'cool', 'fill'];

export default async function chroma({ page, snap, pass, fail, skip, note, SHOTDIR }) {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { hold, release } = await import('../still.mjs');
  const TAG = process.env.GENLIGHT_TAG ?? 'house';

  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
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

  /**
   * Bind the five rig lights ONCE, by walking the scene. `makeLightRig` names none of them, so
   * they are identified structurally: the single SpotLight is `key`; the three PointLights are
   * `warmA`, `warmB`, `cool` in construction order; the HemisphereLight is `fill`.
   * ⚠️ **The gadgets and the hunter's eye flare bring their own PointLights** (`perf-stall-1`
   * measured the rendered count at 8-11), so "the three PointLights" is not a safe filter on its
   * own — the rig's three are the ones parented directly to the scene and added first, which is
   * what `children` order gives. This asserts it found exactly one of each rather than assuming.
   */
  const bind = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const spots = [], points = [], hemis = [];
    for (const o of e.scene.children) {
      if (o.isSpotLight) spots.push(o);
      else if (o.isPointLight) points.push(o);
      else if (o.isHemisphereLight) hemis.push(o);
    }
    if (spots.length !== 1 || points.length < 3 || hemis.length !== 1) {
      return { ok: false, spots: spots.length, points: points.length, hemis: hemis.length };
    }
    window.__glRig = { key: spots[0], warmA: points[0], warmB: points[1], cool: points[2], fill: hemis[0] };
    const d = {};
    for (const [k, l] of Object.entries(window.__glRig)) {
      d[k] = { i: l.intensity, hex: l.color.getHexString(),
        ground: l.groundColor ? l.groundColor.getHexString() : null };
    }
    return { ok: true, d, spots: spots.length, points: points.length, hemis: hemis.length };
  });
  if (!bind.ok) {
    skip('the rig could be bound', `scene children: ${bind.spots} spot / ${bind.points} point / ${bind.hemis} hemi`
      + ' — the rig is not the shape this probe was written against');
    return;
  }
  note(`bound: ${Object.entries(bind.d).map(([k, v]) => `${k} i${v.i.toFixed(0)} #${v.hex}${v.ground ? '/g' + v.ground : ''}`).join(' · ')}`);

  // ---- pick a station -------------------------------------------------------------------------
  const st = await page.evaluate((want) => {
    const e = window.__rrr.engine;
    const byId = e.room.spaces.find((s) => s.id === want);
    const gen = e.room.spaces.filter((s) => /^r\d+\./.test(s.id));
    // biggest generated room, or (authored house) the biggest space of all
    const pool = gen.length ? gen : e.room.spaces;
    const pick = byId ?? pool.reduce((a, b) =>
      ((b.x1 - b.x0) * (b.z1 - b.z0) > (a.x1 - a.x0) * (a.z1 - a.z0) ? b : a));
    return { id: pick.id, name: pick.name, x: (pick.x0 + pick.x1) / 2, z: (pick.z0 + pick.z1) / 2 };
  }, process.env.GENLIGHT_STATION ?? null);
  note(`station ${st.id} (${st.name}) at ${st.x.toFixed(2)}, ${st.z.toFixed(2)}`);

  await page.evaluate(([x, z]) => {
    const e = window.__rrr.engine;
    e.player.pos.set(x, e.room.floorY, z);
    e.player.vel.set(0, 0, 0);
    e.cam._first = true;
  }, [st.x, st.z]);
  await step(45);                       // ARRIVE with the sim running, THEN freeze

  const pinned = await hold(page);
  note(`held: ${JSON.stringify(pinned.pinned ?? pinned)}`);
  await page.waitForTimeout(200);

  await mkdir(SHOTDIR, { recursive: true });
  const write = async (tag) => {
    const buf = await snap(tag);
    if (!buf) return null;
    const p = path.join(SHOTDIR, `chroma.${TAG}.${st.id}.${tag}.png`);
    await writeFile(p, buf);
    return p;
  };

  const out = [];
  const base1 = await write('base');
  await page.waitForTimeout(320);
  const base2 = await write('floor');          // N1: same-config floor, nothing ablated
  if (base1 && base2) { out.push(base1, base2); note(`N1 floor pair written: ${path.basename(base1)} / ${path.basename(base2)}`); }
  base1 && base2
    ? pass('N1 CONTROL a same-config floor pair exists', 'grade both; any per-light delta smaller than base-vs-floor is noise')
    : fail('N1 CONTROL a same-config floor pair exists', 'one of the two frames did not come back');

  // ---- N2: a light that does not exist --------------------------------------------------------
  const ghost = await page.evaluate(() => {
    const l = window.__glRig.noSuchLight;
    if (!l) return { resolved: false };
    l.intensity = 0; return { resolved: true };
  });
  ghost.resolved === false
    ? pass('N2 CONTROL an unknown light reports UNRESOLVED', 'asked for "noSuchLight": not bound, no frame written')
    : fail('N2 CONTROL an unknown light reports UNRESOLVED', 'a light that does not exist was reported as ablated');

  // ---- the ablations --------------------------------------------------------------------------
  let landed = 0, restored = 0;
  for (const name of LIGHTS) {
    const before = await page.evaluate((n) => {
      const l = window.__glRig[n];
      const was = l.intensity;
      l.intensity = 0;
      return { was, now: l.intensity };
    }, name);
    if (before.now === 0) landed++;
    await page.waitForTimeout(200);
    const p = await write(`no-${name}`);
    if (p) { out.push(p); note(`ablated ${name} (was i ${before.was.toFixed(1)}) -> ${path.basename(p)}`); }
    const after = await page.evaluate(([n, v]) => {
      const l = window.__glRig[n];
      l.intensity = v;
      return l.intensity;
    }, [name, before.was]);
    if (Math.abs(after - before.was) < 1e-9) restored++;
  }
  await release(page);

  /**
   * ---- THE AIM SWEEP -------------------------------------------------------------------------
   * 🎯 **THE ONE REAL TRADE IN THIS RIG, MEASURED IN ONE SESSION INSTEAD OF ARGUED.** The key's
   * target height decides which surface is the top of the frame's range, and in a generated room
   * those two surfaces have opposite chroma: the FLOOR is warm parquet and the WALL is
   * near-neutral. `spaces.js` authored both — 0.00/0.60/0.70 aim at the floor, `service`'s 1.75
   * and the studies' 2.20 aim at a wall — so this is not a made-up axis.
   *
   * ⚠️ **DONE LIVE, NOT HELD.** `still.mjs`'s `hold()` empties `engine._updaters`, and the rig's
   * `follow()` IS an updater: mutate under a hold and the lights never move, which reads as
   * "the aim does not matter". Each arm is mutated with the sim RUNNING, settled, and only then
   * frozen for its frame.
   */
  const sweepY = [0.70, 1.20, 1.75];
  const swept = [];
  for (const y of sweepY) {
    const applied = await page.evaluate((v) => {
      const e = window.__rrr.engine;
      let n = 0;
      for (const sp of e.room.spaces) { if (sp.lights?.key?.at) { sp.lights.key.at[1] = v; n++; } }
      return n;
    }, y);
    if (!applied) { note(`aim sweep: no space carries lights.key.at — sweep UNAVAILABLE on this arm`); break; }
    await step(45);                       // the rig LERPS; let it arrive with the sim running
    const landedY = await page.evaluate(() => {
      const l = window.__glRig.key;
      return +l.target.position.y.toFixed(3);
    });
    await hold(page);
    await page.waitForTimeout(200);
    const p = await write(`aim${String(y).replace('.', 'p')}`);
    await release(page);
    if (p) { swept.push({ y, landedY, p }); note(`aim y ${y.toFixed(2)} (target landed at ${landedY}) -> ${path.basename(p)}`); }
  }
  // restore the shipped aim so nothing after this measures a swept build
  await page.evaluate((v) => {
    const e = window.__rrr.engine;
    for (const sp of e.room.spaces) { if (sp.lights?.key?.at) sp.lights.key.at[1] = v; }
  }, sweepY[0]);
  /** N4 — the sweep must have MOVED the light, or the three frames are three copies of one arm. */
  const moved = swept.length >= 2 && Math.abs(swept[swept.length - 1].landedY - swept[0].landedY) > 0.5;
  if (!swept.length) {
    skip('N4 the aim sweep moved the key', 'no space on this arm carries a key target to sweep');
  } else if (moved) {
    pass('N4 the aim sweep moved the key',
      `target y ${swept.map((s) => s.landedY).join(' -> ')} over ${swept.length} arms`);
  } else {
    fail('N4 the aim sweep moved the key',
      `target y ${swept.map((s) => s.landedY).join(' -> ')} — the frames are not different arms`);
  }

  landed === LIGHTS.length && restored === LIGHTS.length
    ? pass('N3 every ablation landed and was undone', `${landed}/${LIGHTS.length} read back at 0, ${restored}/${LIGHTS.length} restored`)
    : fail('N3 every ablation landed and was undone', `${landed}/${LIGHTS.length} landed, ${restored}/${LIGHTS.length} restored`);

  out.length >= LIGHTS.length + 2
    ? pass('frames written', `${out.length} frames in ${SHOTDIR} — grade with harness/grade.mjs`)
    : fail('frames written', `only ${out.length} of ${LIGHTS.length + 2} frames came back`);
  note(`grade: for f in base floor ${LIGHTS.map((l) => 'no-' + l).join(' ')}; do node harness/grade.mjs --img progress/playtest/chroma.${TAG}.${st.id}.$f.png; done`);
}
