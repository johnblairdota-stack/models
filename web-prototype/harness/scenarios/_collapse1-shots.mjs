/**
 * 🕸️ **DOES THE STRAIN TELL REACH THE SCREEN, WHAT DOES IT COST, AND WHAT DOES A COLLAPSE LOOK
 * LIKE?**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_collapse1-shots.mjs \
 *        --port 5405 --q "seed=s4&dig=1" --shots
 *
 * `debris-collapse.mjs` proves the RULE on the grid. Nothing in it looks at a picture, and this
 * project's own standing rule is *"if you assert something is on screen, look at a picture of
 * it."* Three questions, in one page:
 *
 *   **S1  IS THE CRAZING VISIBLE?** A paired in-place flip of `uCraze.x` on one frozen frame, on
 *         the wall the collapse is about to take, against a same-config floor. Both arms are
 *         UNIFORMS, so the geometry, the camera, the crater and the debris are the same objects
 *         — the only thing that moves is the term under test.
 *   **S2  WHAT DOES IT COST IN DRAW CALLS?** ⚠️ A paired in-place flip at ONE station, because
 *         HANDOFF records the worst-with-everything-dug case as a **range, 541–601 against 625**,
 *         with a ±18-call noise floor between stations. A station-to-station comparison here
 *         would be noise with a sign.
 *   **S3  THE PICTURE JOHN ASKED FOR** — a big slab coming away because it was undermined. Three
 *         frames on one drive: the wall crazing, the frame the storey lets go, and the pile.
 */

import { hold, release } from '../still.mjs';

const wait = async (page, n) => { for (let i = 0; i < n; i++) await page.evaluate(() => new Promise(requestAnimationFrame)); };

export default async function collapseShots({ page, shot, snap, pass, fail, skip, note }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const W = window;
    W.__c1 = {
      faces() {
        return W.__rrr.engine.room.panels.filter((p) => p.spec?.free && p.field);
      },
      /**
       * Every layer material of every dig face, so a uniform flip is one call.
       * ⚠️ `applyBreakMask` parks its uniform bag on `material.userData.breakUniforms` — the same
       * handle `getBreak`/`setBreak` use — so this is an ARM and not a rebuild, and both sides of
       * the A/B are the identical material object with the identical program.
       */
      craze(x) {
        let n = 0;
        for (const p of W.__rrr.engine.room.panels) {
          // ⚠️ `mats` is a fixed-length array with HOLES — an undamaged layer's slot is null
          for (const m of p.mats ?? []) {
            const u = m?.userData?.breakUniforms;
            if (u?.uCraze) { u.uCraze.value.x = x; n++; }
          }
        }
        return n;
      },
      /** Park the player back from a face looking at it — `_st1-remain.mjs`'s own helper. */
      park(p, back = 3.0, shoulder = 1.25) {
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
      /** The face's own screen rect, projected through the LIVE camera — never typed in. */
      rect(p, halfW = 1.1, halfH = 0.75) {
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
      /**
       * ⚠️ **ONE BLOW SHORT OF THE COLLAPSE, WHICH IS THE ONLY STATE THE TELL EXISTS IN.** Strain
       * is SPENT when it fires — the cascade takes the strained material with it — so a drive
       * that runs to completion photographs a clean crater and no cracks. This marches an
       * undercut and stops the blow BEFORE the one that brings the storey down.
       */
      undercut(p, blows, stopEarly = true) {
        const f = p.field;
        const step = (f.brush.radius * 1.3) / f.width;
        let fired = -1, last = null;
        for (let k = 0; k < blows; k++) {
          const side = k % 2 ? 1 : -1;
          const u = 0.5 + side * (0.5 + Math.floor(k / 2)) * step;
          const v = 0.30 + Math.sin(k * 0.9) * 0.03;
          const before = f.depth.slice();
          const r = f.applyHit(Math.min(0.98, Math.max(0.02, u)), v, 1);
          if (r.collapse && r.collapse.cells > 40) {
            fired = k + 1; last = r.collapse;
            if (stopEarly) { f.depth.set(before); f._touch(); f.dirty = true; f.flush(); return { blows: k, fired, last, rolledBack: true }; }
          }
        }
        f.dirty = true; f.flush();
        return { blows, fired, last, rolledBack: false };
      },
      strainCells(p) {
        const f = p.field; let n = 0, peak = 0;
        for (let i = 0; i < f.cols * f.rows; i++) {
          const a = f.data[i * 4 + 3]; if (a > 0) n++; if (a > peak) peak = a;
        }
        return { cells: n, peak: +(peak / 255).toFixed(3) };
      },
    };
  });

  const nU = await page.evaluate(() => window.__c1.craze(1));
  if (!nU) { skip('the crazing reaches the screen', 'no uCraze uniform found on any dig face'); return; }
  note(`uCraze is live on ${nU} layer materials`);

  // =======================================================================================
  // S1 — is the crazing visible? Paired in-place flip, one frozen page, projected rect.
  // =======================================================================================
  const s1 = await page.evaluate(() => {
    const e = window.__rrr.engine, room = e.room, H = window.__c1;
    room.setDigPlan({ seed: String(e.run?.seed ?? 's4') });
    const p = H.faces().find((q) => q.width > 2.5) ?? H.faces()[0];
    /**
     * ⚠️ **STASH THE FX HOOKS, DO NOT DESTROY THEM.** S3 needs the real payout, and the first
     * version of this file nulled `onChunk` here and in S2 and never put it back — so S3's
     * collapse spawned nothing and the gate correctly reported an empty floor for a reason that
     * was entirely the probe's.
     */
    for (const q of room.panels) {
      if (q.__c1saved) continue;
      q.__c1saved = { c: q.onChunk, b: q.onBreak };
    }
    p.onChunk = null; p.onBreak = null;
    if (p.twin) { p.twin.onChunk = null; p.twin.onBreak = null; }
    p.resetDamage();
    const d = H.undercut(p, 12, true);
    return { id: p.id, ...d, strain: H.strainCells(p), park: H.park(p, 3.0) };
  });
  note(`S1 ${s1.id}: ${s1.blows} blows of undercut, stopped one short of the collapse `
    + `(it would have fired at blow ${s1.fired}) · ${s1.strain.cells} cells crazing, peak ${s1.strain.peak}`);

  await wait(page, 45);
  const pinned = await hold(page);
  note(`   held: ${JSON.stringify(pinned.pinned ?? pinned)}`);
  await wait(page, 4);
  const BOX = await page.evaluate((id) => {
    const p = window.__rrr.engine.room.panels.find((q) => q.id === id);
    return window.__c1.rect(p);
  }, s1.id);
  note(`   face rect on screen (projected, not typed): ${JSON.stringify(BOX)}`);

  const onA = await snap('c1-craze-on');
  await shot('collapse1-strain-ON');
  await page.evaluate(() => window.__c1.craze(0));
  await wait(page, 2);
  const offA = await snap('c1-craze-off');
  await shot('collapse1-strain-OFF');
  await page.evaluate(() => window.__c1.craze(1));
  await wait(page, 2);
  const onB = await snap('c1-craze-on2');
  await release(page);

  /**
   * 🚨 **A MEAN OVER THE WHOLE RECT IS THE WRONG STATISTIC FOR A LINE FEATURE, AND THE FIRST
   * VERSION OF THIS CHECK USED ONE.** Crazing is a network of hairlines across a face: it read
   * as **0.7% of the rect's mean luma** and technically passed, which understates it in exactly
   * the way an average understates any thin high-contrast structure. What a player sees is *how
   * many pixels went dark and by how much*, so the read is a per-pixel diff between the two arms.
   */
  const diff = async (pngA, pngB) => {
    const a = pngA.toString('base64'), b = pngB.toString('base64');
    return page.evaluate(async ([da, db, r]) => {
      const load = async (s) => {
        const img = new Image();
        await new Promise((ok, no) => { img.onload = ok; img.onerror = no; img.src = `data:image/png;base64,${s}`; });
        const cv = document.createElement('canvas');
        cv.width = img.width; cv.height = img.height;
        cv.getContext('2d').drawImage(img, 0, 0);
        const x0 = Math.max(0, Math.round(r[0] * img.width)), y0 = Math.max(0, Math.round(r[1] * img.height));
        const w = Math.min(img.width - x0, Math.round(r[2] * img.width));
        const h = Math.min(img.height - y0, Math.round(r[3] * img.height));
        return cv.getContext('2d').getImageData(x0, y0, w, h).data;
      };
      const A = await load(da), B = await load(db);
      let n = 0, moved2 = 0, moved6 = 0, sum = 0, worst = 0, movedSum = 0;
      for (let i = 0; i < A.length; i += 4) {
        const la = 0.2126 * A[i] + 0.7152 * A[i + 1] + 0.0722 * A[i + 2];
        const lb = 0.2126 * B[i] + 0.7152 * B[i + 1] + 0.0722 * B[i + 2];
        const d = Math.abs(la - lb);
        n++; sum += la - lb;
        if (d > worst) worst = d;
        if (d > 2) { moved2++; movedSum += d; }
        if (d > 6) moved6++;
      }
      return {
        n, pct2: +(100 * moved2 / n).toFixed(3), pct6: +(100 * moved6 / n).toFixed(3),
        meanSigned: +(sum / n).toFixed(3), worst: +worst.toFixed(1),
        meanOnMoved: moved2 ? +(movedSum / moved2).toFixed(2) : 0,
      };
    }, [a, b, BOX]);
  };
  if (!onA || !offA || !onB) {
    skip('the crazing reaches the screen', 'a capture came back empty');
  } else {
    const sig = await diff(offA, onA);       // crazing DARKENS, so OFF minus ON is positive
    const flr = await diff(onB, onA);        // same config, twice
    note(`S1 face rect, per pixel — OFF vs ON: ${sig.pct2}% moved by >2 luma, ${sig.pct6}% by >6, `
      + `worst ${sig.worst}, mean over the moved pixels ${sig.meanOnMoved}, mean over the whole `
      + `rect ${sig.meanSigned}`);
    note(`S1 same-config floor (ON vs ON): ${flr.pct2}% moved by >2, worst ${flr.worst}`);
    sig.pct2 > 4 * Math.max(0.05, flr.pct2) && sig.pct2 > 1
      ? pass('the crazing reaches the screen',
        `${sig.pct2}% of the face darkens by more than 2 luma (${sig.pct6}% by more than 6, worst `
        + `${sig.worst}, mean ${sig.meanOnMoved} on the pixels that moved) against a same-config `
        + `floor of ${flr.pct2}%`)
      : fail('the crazing reaches the screen',
        `${sig.pct2}% moved against a floor of ${flr.pct2}% — it is computed and not drawn`);
  }

  // =======================================================================================
  // S2 — the draw-call price. ⚠️ PAIRED IN-PLACE FLIP AT ONE STATION. See the header.
  // =======================================================================================
  const s2 = await page.evaluate(async () => {
    const e = window.__rrr.engine, room = e.room, H = window.__c1;
    // the pessimal state: every free face in the house dug, which is what `calls-1` measured at
    for (const p of room.panels) {
      if (!p.spec?.free || !p.field) continue;
      if (!p.__c1saved) p.__c1saved = { c: p.onChunk, b: p.onBreak };
      p.onChunk = null; p.onBreak = null;
      p.field.applyHit(0.5, 0.35, 1);
      p.field.applyHit(0.34, 0.35, 1);
      p.field.dirty = true; p.field.flush();
    }
    const frame = () => new Promise((ok) => requestAnimationFrame(() => ok()));
    const readCalls = async () => {
      let c = 0, t = 0;
      for (let i = 0; i < 6; i++) { await frame(); c = e.renderer.info.render.calls; t = e.renderer.info.render.triangles; }
      return { calls: c, tris: t };
    };
    const out = [];
    for (const arm of [1, 0, 1, 0]) { H.craze(arm); out.push({ arm, ...(await readCalls()) }); }
    H.craze(1);
    return out;
  });
  const on = s2.filter((r) => r.arm === 1), off = s2.filter((r) => r.arm === 0);
  const mOn = on.reduce((a, r) => a + r.calls, 0) / on.length;
  const mOff = off.reduce((a, r) => a + r.calls, 0) / off.length;
  note(`S2 every free face dug, one station, paired flip: craze ON ${on.map((r) => r.calls).join('/')} `
    + `calls · OFF ${off.map((r) => r.calls).join('/')} · triangles ${on[0].tris} vs ${off[0].tris}`);
  Math.abs(mOn - mOff) < 0.5
    ? pass('the strain tell costs ZERO draw calls',
      `${mOn} vs ${mOff} over ${on.length} paired reads, ${on[0].tris} triangles both arms — it is `
      + 'a term inside a shader that was already being run, on a texture channel that already existed')
    : fail('the strain tell costs ZERO draw calls', `${mOn} vs ${mOff}`);

  // =======================================================================================
  // S3 — the picture: one big slab coming away because it was undermined.
  // =======================================================================================
  const s3 = await page.evaluate(() => {
    const e = window.__rrr.engine, room = e.room, H = window.__c1;
    room.setDigPlan({ seed: String(e.run?.seed ?? 's4') });
    // 🎯 THE FX GO BACK ON — this station is the only one that is about what it LOOKS like.
    let restored = 0;
    for (const q of room.panels) {
      if (!q.__c1saved) continue;
      q.onChunk = q.__c1saved.c; q.onBreak = q.__c1saved.b; restored++;
    }
    e.debris?.clear?.();
    const p = H.faces().find((q) => q.width > 2.5) ?? H.faces()[0];
    p.resetDamage();
    // the approach blows go through the FIELD so the wall is undermined without a cloud of FX
    // sitting over it; the blow that TAKES it goes through the panel, below, with everything live
    const d = H.undercut(p, 12, true);
    window.__c1.pending = p.id;
    return { id: p.id, restored, ...d, strain: H.strainCells(p), park: H.park(p, 3.4) };
  });
  note(`S3 ${s3.id}: ${s3.blows} blows, crazing on ${s3.strain.cells} cells, peak ${s3.strain.peak}`);
  await wait(page, 40);
  await shot('collapse1-undermined-BEFORE');
  // ...and now the blow that takes it
  const fired = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const p = e.room.panels.find((q) => q.id === window.__c1.pending);
    const f = p.field;
    const step = (f.brush.radius * 1.3) / f.width;
    const k = f.hits.length;
    const side = k % 2 ? 1 : -1;
    const u = 0.5 + side * (0.5 + Math.floor(k / 2)) * step;
    // ⚠️ through the PANEL, not the field, so `onChunk` fires and the slab is actually spawned
    const r = p.applyHit(p.pointAt(Math.min(0.98, Math.max(0.02, u)), 0.30), 1);
    f.dirty = true; f.flush();
    return { removed: +r.removed.toFixed(4), strain: window.__c1.strainCells(p) };
  });
  note(`S3 the blow that took it: removed ${fired.removed} m²·depth · crazing after: `
    + `${fired.strain.cells} cells (spent — the material it was on has left)`);
  await wait(page, 6);
  await shot('collapse1-undermined-FALLING');
  await wait(page, 150);
  await shot('collapse1-undermined-LANDED');
  const pile = await page.evaluate(() => {
    const e = window.__rrr.engine;
    let resting = 0;
    for (const k of Object.keys(e.debris?.pools ?? {})) {
      const p = e.debris.pools[k];
      for (let i = 0; i < p.per; i++) if (p.alive[i] && p.rest[i]) resting++;
    }
    return { resting, pileCells: e.debris?.pile?.size ?? -1 };
  });
  note(`S3 after landing: ${pile.resting} pieces resting, ${pile.pileCells} pile cells`);
  pile.resting > 0
    ? pass('the collapse leaves material on the floor', `${pile.resting} pieces resting`)
    : fail('the collapse leaves material on the floor', 'nothing came to rest');
}
