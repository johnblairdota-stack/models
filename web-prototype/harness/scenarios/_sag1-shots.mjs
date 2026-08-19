/**
 * 🧱 **THE SAG AND THE PULL, ON SCREEN — the capture sequence, the tell's new third stage, and
 * the draw-call price.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_sag1-shots.mjs \
 *        --port 5630 --q "seed=s4&dig=1" --shots
 *
 * `_sag1-grain.mjs` proves the rule and the fall on the grid, headless. Nothing in it looks at a
 * picture, and this project's standing rule is *"if you assert something is on screen, look at a
 * picture of it."* So this is the other half:
 *
 *   **G1  THE SEQUENCE.** One face, one camera, one page, one drive — the frames a critic and John
 *         need to judge whether the wall *"could have been seen coming"*:
 *           `sag1-1-WARNED`   one blow short of the arch giving: the wall crazed and standing
 *           `sag1-2-GAVE`     the frame it lets go — the first bite coming away
 *           `sag1-3-HANGING`  ⭐ **THE NEW STATE.** The bite has landed and the rest of the region
 *                             is still standing, crazed at a flat 1.0. This picture did not exist
 *                             in the build John played: there the storey was already on the floor.
 *           `sag1-4-PULL`     the committed pull, mid-air
 *           `sag1-5-LANDED`   the heap
 *         and the ablation pair `sag1-flat-{GAVE,LANDED}` (`COLLAPSE.sag = false`), same face,
 *         same camera, same blows, so every frame above has a before to be judged against.
 *
 *   **G2  THE TELL'S THIRD STAGE IS ON SCREEN AND IT IS THE RULE.** On the HANGING frame, a
 *         paired in-place flip of `uCraze` — how much of the face moves, and by how much. ⚠️ **A
 *         MEAN OVER A RECT IS THE WRONG STATISTIC FOR A LINE FEATURE** and `collapse-1` filed that
 *         lesson: crazing is hairlines, so this counts pixels that moved and by how much.
 *
 *   **G3  WHAT IT COSTS.** Paired in-place flip at ONE station with every free face dug, because
 *         HANDOFF records the pessimal case as a **range, 541–601 of 625**, ±18 between stations.
 *         A station-to-station comparison would be noise with a sign.
 *
 * ⚠️ **EVERY A/B IN THIS FILE IS INSIDE ONE PAGE** (`still.mjs` `hold`/`release`, floor 0.00%),
 * which is the only form that is byte-comparable — `still.mjs`'s own header says it is
 * within-session only.
 */

import { hold, release } from '../still.mjs';
/**
 * 🚨 **THE ABLATION ARM NEEDS THE WHOLE SHIPPED TABLE, AND THE OBVIOUS WAY TO BUILD IT IS THE BUG
 * `_collapse2-arms` ALREADY PAID FOR ONCE.** `field.collapse` is the per-instance OVERRIDE and is
 * `undefined` on every shipped face (`_collapse()` uses `this.collapse ?? COLLAPSE`), so
 * `{ ...(f.collapse ?? {}), sag: false }` comes out as `{ sag: false }` — **which ablates the
 * entire rule, not the sag** (no `fail`, no `span`, no `gone`, no `cap`). The first run of this
 * file did exactly that and its control arm reported *"the same drive gives null"*, i.e. no
 * collapse at all, which is not the build John played. Import the module default and spread THAT.
 */
import { COLLAPSE } from '../../src/destruction/damagefield.js';

const wait = async (page, n) => {
  for (let i = 0; i < n; i++) await page.evaluate(() => new Promise(requestAnimationFrame));
};

export default async function sagShots({ page, shot, snap, pass, fail, skip, note }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const W = window;
    W.__s1 = {
      faces: () => W.__rrr.engine.room.panels.filter((p) => p.spec?.free && p.field),
      craze(x) {
        let n = 0;
        for (const p of W.__rrr.engine.room.panels) {
          for (const m of p.mats ?? []) {
            const u = m?.userData?.breakUniforms;
            if (u?.uCraze) { u.uCraze.value.x = x; n++; }
          }
        }
        return n;
      },
      /** Park the player back from a face looking at it — `_collapse1-shots`'s own helper. */
      park(p, back = 3.4, shoulder = 1.25) {
        const e = W.__rrr.engine, room = e.room;
        const c = p.pointAt(0.5, 0.46), n = p.normal;
        e.player.pos.set(c.x + n.x * back, room.floorY, c.z + n.z * back);
        e.player.vel.set(0, 0, 0);
        const yaw = Math.atan2(c.x - e.player.pos.x, c.z - e.player.pos.z);
        e.player.aimYaw = yaw; e.player.aimPitch = 0; e.player.facing = yaw;
        e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true;
        e.cam.shoulder = shoulder;
        return { x: +c.x.toFixed(2), z: +c.z.toFixed(2), back };
      },
      rect(p, halfW = 1.4, halfH = 1.1) {
        const e = W.__rrr.engine;
        const cam = e.cam?.camera ?? e.camera;
        const c = p.pointAt(0.5, 0.52), n = p.normal;
        let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
          const w = c.clone();
          w.x += -n.z * sx * halfW; w.z += n.x * sx * halfW; w.y += sy * halfH;
          const pr = w.project(cam);
          const nx = (pr.x + 1) / 2, ny = (1 - pr.y) / 2;
          x0 = Math.min(x0, nx); x1 = Math.max(x1, nx);
          y0 = Math.min(y0, ny); y1 = Math.max(y1, ny);
        }
        return [x0, y0, Math.max(0.01, x1 - x0), Math.max(0.01, y1 - y0)].map((v) => +v.toFixed(4));
      },
      /** How much of the face is hanging, and how hard it is crazing. */
      state(p) {
        const f = p.field;
        let sag = 0, craze = 0, peak = 0, gone = 0;
        for (let i = 0; i < f.cols * f.rows; i++) {
          if (f._sag?.[i]) sag++;
          const a = f.data[i * 4 + 3];
          if (a > 0) craze++;
          if (a > peak) peak = a;
          if (f.depth[i] >= 0.985) gone++;
        }
        return { sag, craze, peak: +(peak / 255).toFixed(3), gone };
      },
      /**
       * ⚠️ **STOPS ONE BLOW SHORT, AND THAT IS THE ONLY STATE THE WARNING EXISTS IN.** It marches
       * an undercut with the FX live and returns the moment the next blow would break the arch,
       * by rolling that blow back. Everything after it is driven one blow at a time so a frame can
       * be taken between each.
       */
      arm(p, maxBlows = 16) {
        const f = p.field;
        const step = (f.brush.radius * 1.3) / f.width;
        this._k = 0; this._p = p; this._step = step;
        for (let k = 0; k < maxBlows; k++) {
          const side = k % 2 ? 1 : -1;
          const u = 0.5 + side * (0.5 + Math.floor(k / 2)) * step;
          const v = 0.30 + Math.sin(k * 0.9) * 0.03;
          const before = f.depth.slice();
          const sagBefore = f._sag ? f._sag.slice() : null;
          /**
           * ⚠️ **THE R CHANNEL HAS TO GO BACK TOO, AND `flush()` DOES NOT DO IT.** `flush()` runs
           * `_shed`, `_strain` and `_smooth`; `_smooth` writes B and `_strain` writes A, but the
           * DEPTH byte is written only by `_add()` and `collapse()`'s `drop()`. Restoring `depth`
           * alone leaves the texture showing the crater of the blow that was rolled back — a
           * picture one blow ahead of the rule it is illustrating.
           */
          const rgb = new Uint8Array(f.cols * f.rows);
          for (let i = 0; i < rgb.length; i++) rgb[i] = f.data[i * 4];
          const r = f.applyHit(Math.min(0.98, Math.max(0.02, u)), v, 1);
          if (r.collapse && (r.collapse.sagRegions > 0 || r.collapse.cells > 60)) {
            f.depth.set(before);
            for (let i = 0; i < rgb.length; i++) f.data[i * 4] = rgb[i];
            if (sagBefore) f._sag.set(sagBefore);
            f._touch(); f.dirty = true; f.flush();
            this._k = k;
            return { armedAt: k, next: [u, v] };
          }
        }
        this._k = maxBlows;
        return { armedAt: -1, next: null };
      },
      /**
       * Throw the next blow of the same undercut.
       * 🚨 **THROUGH `WallPanel.applyHit`, NOT `field.applyHit`, AND THAT IS THE WHOLE POINT OF A
       * SHOTS FILE.** The field's own method skips `_apply()`, `_syncStageFromField()`, `_couple()`
       * and — the one that matters here — **the view's real `onChunk`**. A capture taken off a
       * reproduction of the payout is a picture of the probe. This drives the panel exactly as
       * `WeaponSystem.hitWall` does, so what is photographed is what a player sees.
       */
      swing(du = 0, dv = 0) {
        const p = this._p, f = p.field, k = this._k;
        const side = k % 2 ? 1 : -1;
        const u = 0.5 + side * (0.5 + Math.floor(k / 2)) * this._step + du;
        const v = 0.30 + Math.sin(k * 0.9) * 0.03 + dv;
        this._k = k + 1;
        const uu = Math.min(0.98, Math.max(0.02, u)), vv = Math.min(0.98, Math.max(0.02, v));
        this._last = null;
        const spy = p.onChunk;
        p.onChunk = (panel, info) => { this._last = info.collapse ?? null; spy?.(panel, info); };
        p.applyHit(p.pointAt(uu, vv), 1);
        p.onChunk = spy;
        f.dirty = true; f.flush();
        const c = this._last;
        return c
          ? {
            cells: c.cells, sagCells: c.sagCells, sagRegions: c.sagRegions,
            events: (c.events ?? []).map((e) => `${e.kind}:${e.cells}`),
          }
          : null;
      },
    };
  });

  const nU = await page.evaluate(() => window.__s1.craze(1));
  if (!nU) { skip('the sag reaches the screen', 'no uCraze uniform found on any dig face'); return; }

  // =======================================================================================
  // G1 — THE SEQUENCE. One face, one camera, one page.
  // =======================================================================================
  const setup = await page.evaluate((sagOn) => {
    const e = window.__rrr.engine, room = e.room, H = window.__s1;
    room.setDigPlan({ seed: String(e.run?.seed ?? 's4') });
    const p = H.faces().find((q) => q.width > 2.5) ?? H.faces()[0];
    p.resetDamage();
    if (p.twin) { p.twin.onChunk = null; p.twin.onBreak = null; p.twin.resetDamage?.(); }
    e.debris?.clear?.();
    p.field.collapse = sagOn ? null : { ...p.field.collapse ?? {}, sag: false };
    if (sagOn) delete p.field.collapse;
    const at = H.park(p);
    const armed = H.arm(p);
    return { id: p.id, w: +p.width.toFixed(2), at, armed, state: H.state(p), rect: H.rect(p) };
  }, true);
  note(`G1 face ${setup.id} (${setup.w} m), player parked ${setup.at.back} m back · armed after `
    + `${setup.armed.armedAt} blows · ${setup.state.craze} cells crazing, peak ${setup.state.peak}, `
    + `${setup.state.gone} cells already gone`);

  // let the sim settle at the parked camera BEFORE freezing — `still.mjs`'s own rule
  await wait(page, 30);
  await hold(page);
  await wait(page, 2);
  await shot('sag1-1-WARNED');
  await release(page);

  const gave = await page.evaluate(() => window.__s1.swing());
  note(`G1 the arch gives: ${JSON.stringify(gave)}`);
  await wait(page, 8);                 // ~0.13 s: the bite is peeling
  await shot('sag1-2-GAVE');
  await wait(page, 90);                // everything that let go has landed
  const hangState = await page.evaluate(() => window.__s1.state(window.__s1._p));
  note(`G1 HANGING: ${hangState.sag} cells still up and crazing at peak ${hangState.peak}, `
    + `${hangState.gone} gone`);
  await hold(page);
  await wait(page, 2);
  await shot('sag1-3-HANGING');
  // ---- G2 rides on this frame: it is the only one the new state exists in
  const rect = await page.evaluate(() => window.__s1.rect(window.__s1._p));
  const crazeOn = await snap('s1-craze-on');
  await page.evaluate(() => window.__s1.craze(0));
  await wait(page, 2);
  const crazeOff = await snap('s1-craze-off');
  await page.evaluate(() => window.__s1.craze(1));
  await wait(page, 2);
  const crazeOn2 = await snap('s1-craze-on2');
  await release(page);

  const pull = await page.evaluate(() => window.__s1.swing(0, 0.16));
  note(`G1 the pull: ${JSON.stringify(pull)}`);
  await wait(page, 10);
  await shot('sag1-4-PULL');
  await wait(page, 110);
  const after = await page.evaluate(() => window.__s1.state(window.__s1._p));
  await shot('sag1-5-LANDED');
  note(`G1 after the pull: ${after.sag} cells still hanging, ${after.gone} gone`);

  (setup.state.craze > 60 && hangState.sag > 80 && hangState.peak >= 0.99)
    ? pass('THE SEQUENCE EXISTS AND THE MIDDLE BEAT IS A REAL STATE',
      `one blow short of the arch giving the face is crazing on ${setup.state.craze} cells at peak `
      + `${setup.state.peak}; after it gives, **${hangState.sag} cells are still standing and `
      + `crazing at ${hangState.peak}** with the first bite already on the floor; the pull then `
      + `leaves ${after.sag}. Frames: game.play.sag1-{1-WARNED,2-GAVE,3-HANGING,4-PULL,5-LANDED}.png`)
    : fail('THE SEQUENCE EXISTS AND THE MIDDLE BEAT IS A REAL STATE',
      `warned ${setup.state.craze} cells / peak ${setup.state.peak}; hanging ${hangState.sag} `
      + `cells / peak ${hangState.peak}`);

  // =======================================================================================
  // G2 — the tell at its third stage, measured on the HANGING frame.
  // =======================================================================================
  if (!crazeOn || !crazeOff || !crazeOn2) {
    skip('the hanging region is drawn on the wall', 'a capture failed');
  } else {
    const px = await page.evaluate(async ([a, b, c, r]) => {
      const dec = async (b64) => {
        const img = new Image();
        await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = `data:image/png;base64,${b64}`; });
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        const ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0);
        return { d: ctx.getImageData(0, 0, cv.width, cv.height), w: cv.width, h: cv.height };
      };
      const A = await dec(a), B = await dec(b), C = await dec(c);
      const x0 = Math.floor(r[0] * A.w), y0 = Math.floor(r[1] * A.h);
      const x1 = Math.min(A.w, Math.ceil((r[0] + r[2]) * A.w));
      const y1 = Math.min(A.h, Math.ceil((r[1] + r[3]) * A.h));
      const luma = (im, i) => 0.2126 * im.d.data[i] + 0.7152 * im.d.data[i + 1] + 0.0722 * im.d.data[i + 2];
      let n = 0, moved2 = 0, moved6 = 0, worst = 0, sum = 0, floorMoved = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * A.w + x) * 4;
          n++;
          const d = Math.abs(luma(A, i) - luma(B, i));
          const f = Math.abs(luma(A, i) - luma(C, i));
          if (f > 2) floorMoved++;
          if (d > 2) { moved2++; sum += d; }
          if (d > 6) moved6++;
          if (d > worst) worst = d;
        }
      }
      return {
        n, moved2: +(100 * moved2 / n).toFixed(3), moved6: +(100 * moved6 / n).toFixed(3),
        worst: +worst.toFixed(1), mean: +(sum / Math.max(1, moved2)).toFixed(2),
        floor: +(100 * floorMoved / n).toFixed(3),
      };
    }, [crazeOn.toString('base64'), crazeOff.toString('base64'), crazeOn2.toString('base64'), rect]);
    note(`G2 on the HANGING frame, over the face rect (${px.n} px): ${px.moved2}% of pixels move by `
      + `more than 2 luma when the crazing is flipped off, ${px.moved6}% by more than 6, worst `
      + `${px.worst}, mean ${px.mean} on the pixels that moved · same-config floor ${px.floor}%`);
    /**
     * 🚨 **THE FLOOR IS THE CONTROL AND IT RUNS EVERY TIME.** ON → OFF → ON in one frozen page:
     * the third frame must come back essentially identical to the first, or the difference in the
     * middle is the renderer moving under us and not the term under test. `still.mjs`'s measured
     * floor for this form is 0.00%.
     */
    (px.floor < 0.15 && px.moved2 > 1.5 && px.worst > 15)
      ? pass('THE HANGING REGION IS DRAWN ON THE WALL, AT FULL STRENGTH',
        `${px.moved2}% of the face rect moves by more than 2 luma and ${px.moved6}% by more than 6, `
        + `worst ${px.worst}, against a same-config floor of ${px.floor}%. This is the tell's third `
        + 'stage — a piece that has LET GO, painted at a flat 1.0 across the whole region rather '
        + 'than a load fraction — and it is the state the player is being asked to decide about.')
      : fail('THE HANGING REGION IS DRAWN ON THE WALL, AT FULL STRENGTH',
        `${px.moved2}% moved past 2 luma, worst ${px.worst}, floor ${px.floor}% — either the sag `
        + 'is not reaching the shader or the page was not frozen');
  }

  // =======================================================================================
  // G3 — the price. Paired in-place flip, ONE station, every free face dug.
  // =======================================================================================
  const calls = await page.evaluate(async (FLAT) => {
    const e = window.__rrr.engine, room = e.room;
    /**
     * 🚨 **STASH THE FX HOOKS, DO NOT DESTROY THEM — AND THIS FILE PAID THE EXACT PRICE
     * `_collapse1-shots`'S HEADER WARNS ABOUT, ONE RUN AFTER READING IT.** Nulling `onChunk` here
     * and not putting it back left G1b's ablation frames showing a storey that had vanished with
     * **no debris in the air and none on the floor** — a picture of the probe, filed as a picture
     * of the build. The rule-level control still read correctly (402 cells against 173) because
     * that comes off the field; only the frames were wrong, which is the quietest way for a shots
     * file to lie.
     */
    for (const p of room.panels) {
      if (!p.spec?.free || !p.field) continue;
      if (!p.__s1saved) p.__s1saved = { c: p.onChunk, b: p.onBreak };
      p.onChunk = null; p.onBreak = null;
      p.field.applyHit(0.5, 0.35, 1);
      p.field.applyHit(0.34, 0.35, 1);
      p.field.dirty = true; p.field.flush();
    }
    e.debris?.clear?.();
    const frame = () => new Promise((ok) => requestAnimationFrame(() => ok()));
    const read = async () => {
      let c = 0, t = 0;
      for (let i = 0; i < 6; i++) { await frame(); c = e.renderer.info.render.calls; t = e.renderer.info.render.triangles; }
      return { calls: c, tris: t };
    };
    const out = [];
    // the ARM is the rule itself: `sag` on and off, on the same materials, same page, same station
    for (const arm of [1, 0, 1, 0]) {
      for (const p of room.panels) {
        if (!p.spec?.free || !p.field) continue;
        if (arm) delete p.field.collapse;
        else p.field.collapse = { ...FLAT };
      }
      out.push({ arm, ...(await read()) });
    }
    for (const p of room.panels) {
      if (!p.spec?.free || !p.field) continue;
      delete p.field.collapse;
      if (p.__s1saved) { p.onChunk = p.__s1saved.c; p.onBreak = p.__s1saved.b; }
    }
    return out;
  }, { ...COLLAPSE, sag: false });
  const on = calls.filter((r) => r.arm === 1), off = calls.filter((r) => r.arm === 0);
  const mOn = on.reduce((a, r) => a + r.calls, 0) / on.length;
  const mOff = off.reduce((a, r) => a + r.calls, 0) / off.length;
  note(`G3 every free face dug, one station, paired flip: sag ON ${on.map((r) => r.calls).join('/')} `
    + `calls · OFF ${off.map((r) => r.calls).join('/')} · triangles ${on[0].tris} vs ${off[0].tris}`);
  /**
   * ⚠️ **THE ASSERTION IS ON CALLS, AND THE TRIANGLE COUNT CARRIES A FEW UNITS OF PARTICLE JITTER
   * THAT IS NOT THE THING UNDER TEST.** A draw call's unit is the MESH, so a term that adds no
   * pool and no material key cannot move it and an exact equality is the right bar. Triangles move
   * by a handful because dust and crumb sprites are still ageing across the four paired reads —
   * `_collapse1-shots` S2 records the same 4-triangle wobble on its own flip. The first run of this
   * file demanded triangle equality and went red on **six** triangles while the calls matched to
   * the digit; the bar is 0.1% of the count, which is far below anything a mesh could cause.
   */
  const dTri = Math.abs(on[0].tris - off[0].tris) / Math.max(1, on[0].tris);
  (Math.abs(mOn - mOff) < 0.5 && dTri < 0.001)
    ? pass('THE SAG COSTS ZERO DRAW CALLS',
      `${mOn} vs ${mOff} over ${on.length} paired reads — equal to the digit — and ${on[0].tris} vs `
      + `${off[0].tris} triangles (${(dTri * 100).toFixed(3)}%, live particles ageing between the `
      + 'reads). It adds no pool, no material key, no mesh and no shader term: the state is one '
      + 'byte a cell on the CPU, it is drawn through `uCraze` — already running, on a channel that '
      + 'already existed — and the payout still uses the `slab` and `plaster` pools the wall pays '
      + 'for whatever happens.')
    : fail('THE SAG COSTS ZERO DRAW CALLS',
      `${mOn} vs ${mOff} calls, ${on[0].tris} vs ${off[0].tris} triangles (${(dTri * 100).toFixed(3)}%)`);

  // =======================================================================================
  // G1b — THE ABLATION PAIR. Same face, same camera, same blows, `sag: false`.
  // =======================================================================================
  const flat = await page.evaluate((FLAT) => {
    const e = window.__rrr.engine, room = e.room, H = window.__s1;
    const p = H._p;
    for (const q of room.panels) if (q.spec?.free && q.field) delete q.field.collapse;
    room.setDigPlan({ seed: String(e.run?.seed ?? 's4') });
    p.resetDamage();
    e.debris?.clear?.();
    p.field.collapse = { ...FLAT };     // the WHOLE shipped table with `sag` flipped — see the import
    H.park(p);
    const armed = H.arm(p);
    return { armed, state: H.state(p), fail: p.field.collapse.fail, sag: p.field.collapse.sag };
  }, { ...COLLAPSE, sag: false });
  await wait(page, 30);
  const flatGave = await page.evaluate(() => window.__s1.swing());
  note(`G1b ABLATED (sag=${flat.sag}, fail=${flat.fail} — the WHOLE table, not a bare {sag:false}), `
    + `armed after ${flat.armed.armedAt} blows — the same drive gives ${JSON.stringify(flatGave)}`);
  await wait(page, 8);
  await shot('sag1-flat-GAVE');
  await wait(page, 110);
  const flatAfter = await page.evaluate(() => ({
    ...window.__s1.state(window.__s1._p),
    // ⚠️ the frames are only comparable if the payout actually RAN on this arm — see G3's note
    resting: window.__rrr.engine.debris?.restCount ?? -1,
  }));
  await shot('sag1-flat-LANDED');
  note(`G1b ablated after: ${flatAfter.sag} hanging, ${flatAfter.gone} gone, `
    + `${flatAfter.resting} debris pieces at rest (0 would mean the FX hooks were still nulled and `
    + 'the ablation frames are a picture of the probe)');
  (flatGave && flatGave.cells > (gave?.cells ?? 0) * 1.5 && flatAfter.sag === 0
    && flatAfter.resting > 0)
    ? pass('CONTROL — the ablated arm still takes the storey in one moment',
      `same face, same camera, same blows: sag:false brings down ${flatGave.cells} cells on the `
      + `blow the arch gives and leaves NOTHING hanging, against ${gave?.cells} and `
      + `${hangState.sag} cells still up on the shipped arm — and it paid out (${flatAfter.resting} `
      + 'pieces at rest), so the frames are comparable. Frames: '
      + 'game.play.sag1-flat-{GAVE,LANDED}.png against game.play.sag1-{2-GAVE,3-HANGING}.png')
    : fail('CONTROL — the ablated arm still takes the storey in one moment',
      `ablated ${flatGave?.cells} cells / ${flatAfter.sag} hanging / ${flatAfter.resting} resting `
      + `vs shipped ${gave?.cells} / ${hangState.sag} — the control is not reproducing the build `
      + 'John played (0 resting means the FX hooks were left nulled and the frames are unusable)');
}
