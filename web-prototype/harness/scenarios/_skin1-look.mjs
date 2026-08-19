/**
 * 🖼️ **THE GALLERY PORTRAIT OVER A BREACH — THE DEFECT, AND THE FIX, PHOTOGRAPHED.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_skin1-look.mjs \
 *        --port 5473 --q "seed=s4" --shots
 *
 *   env  FACE=f.gal_east.0.b   which destructible face to stand in front of
 *        BLOWS=14              how many hammer blows to sweep across the canvas
 *        POWER=1               blow power (1 is the shipped x8 base; 0.125 is John's x1 rung)
 *
 * ---------------------------------------------------------------------------------------------
 * WHY A PICTURE AND NOT A NUMBER
 * ---------------------------------------------------------------------------------------------
 * `_skin1-geom.mjs` proves the rule headless — nothing is left standing over an open cell, the
 * surface is conserved, the colliders do not move. It cannot answer the only question John asked,
 * which is what the room LOOKS like when you hammer the wall a painting is hanging on. HANDOFF:
 * *"if you assert something is on screen, look at a picture of it."*
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE THREE FRAMES, AND THE MIDDLE ONE IS THE CONTROL THAT MUST FAIL
 * ---------------------------------------------------------------------------------------------
 *   A   INTACT      standing where a player digs from, the portrait on the wall
 *   B   SKIN OFF    the identical dig with `room.skin.on = false` — **the painting hanging in
 *                   front of a hole.** This is the build John reported, reproduced on purpose. If
 *                   B does not differ from C, the fix changed nothing and every claim here is
 *                   void; if B does not differ from A, the dig did not happen.
 *   C   SKIN ON     the identical dig, shipped rule — the dressing gone with the wall
 *
 * Every pair is measured against a **same-config floor** taken seconds earlier through
 * `still.mjs`, and the run reverts the field between arms and re-shoots A as a REVERT CONTROL, so
 * "the erosion is reversible" is a picture too and not only `skin.reset()`'s return value.
 *
 * ⚠️ **THE DIG IS NEVER RUN INSIDE `hold()`.** `still.mjs`'s `hold()` empties `engine._updaters`,
 * and the damage texture is uploaded by `flush()` once per frame from an updater — so a dig driven
 * while held would change the CPU field and photograph the old wall. Park and settle with the sim
 * running, dig with the sim running, and hold only around each shot.
 */
import { decodePng, diff, summarise } from '../pxdiff.mjs';
import { hold, release } from '../still.mjs';

const FACE = process.env.FACE ?? 'f.gal_east.0.b';
const BLOWS = +(process.env.BLOWS ?? 14);
const POWER = +(process.env.POWER ?? 1);

export default async function skin1look({ page, note, pass, fail, skip, snap, SHOTDIR, VIEW }) {
  const png = (tag) => snap(tag, { path: `${SHOTDIR}/${VIEW}.${tag}.png` });
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 300; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  // ------------------------------------------------------------------ the subject
  const head = await page.evaluate(([faceId]) => {
    const e = window.__rrr.engine;
    const skin = e.room.skin;
    if (!skin) return { ok: false, why: 'room.skin is null — this build is ?skin=0' };
    const rec = skin.faces.get(faceId);
    if (!rec) return { ok: false, why: `no skin on ${faceId}` };
    const panel = e.room.panels.find((p) => p.id === faceId);
    if (!panel) return { ok: false, why: `no panel ${faceId}` };
    // the biggest single cluster of portrait canvases along the face, i.e. ONE painting
    const port = rec.frags.filter((f) => f.nm === 'portraits').sort((a, b) => a.u - b.u);
    const cl = [[]];
    for (const f of port) {
      const cur = cl[cl.length - 1];
      if (cur.length && f.u - cur[cur.length - 1].u > 0.05) cl.push([f]); else cur.push(f);
    }
    const best = cl.sort((a, b) => b.length - a.length)[0] ?? [];
    const cu = best.length ? best.reduce((n, f) => n + f.u, 0) / best.length : 0.5;
    const cv = best.length ? best.reduce((n, f) => n + f.v, 0) / best.length : 0.5;
    let u0 = 2, u1 = -1, v0 = 2, v1 = -1;
    for (const f of best) { u0 = Math.min(u0, f.u); u1 = Math.max(u1, f.u); v0 = Math.min(v0, f.v); v1 = Math.max(v1, f.v); }
    window.__skin1 = { faceId, panel, rec, cu, cv, u0, u1, v0, v1, skin };
    return {
      ok: true, frags: rec.frags.length, portraits: port.length, canvas: best.length,
      cu: +cu.toFixed(3), cv: +cv.toFixed(3),
      by: Object.fromEntries(Object.entries(skin.faceStat(faceId).by).map(([k, v]) => [k, v.total])),
      stats: skin.stats(),
    };
  }, [FACE]);

  if (!head.ok) { fail(`the subject face ${FACE} carries dressing`, head.why); return; }
  note(`${FACE}: ${head.frags} skin fragments — ${JSON.stringify(head.by)}`);
  note(`  the painting: ${head.canvas} canvas fragments of ${head.portraits} on this face,`
    + ` centred at uv (${head.cu}, ${head.cv})`);
  note(`  skin: ${JSON.stringify(head.stats)}`);

  // ------------------------------------------------------------------ park + settle
  const parked = await page.evaluate(() => {
    const e = window.__rrr.engine, S = window.__skin1;
    const p = S.panel, home = p.ownerSpace;
    const inSign = home ? p.sideOf({ x: home.cx, y: 0, z: home.cz }) : 1;
    const n = p.normal, c = p.pointAt(S.cu, 0.5);
    e.player.pos.set(c.x + n.x * 3.0 * inSign, e.room.floorY, c.z + n.z * 3.0 * inSign);
    e.player.vel.set(0, 0, 0);
    const f = Math.atan2(-n.x * inSign, -n.z * inSign);
    e.player.facing = f; e.player.aimYaw = f;
    if (e.cam) { e.cam.yaw = f; e.cam.pitch = 0; e.cam._first = true; }
    e.room.setViewpoints?.([{ pos: e.player.pos, dir: { x: Math.sin(f), z: Math.cos(f) } }]);
    return { space: e.room.spaceAt(e.player.pos)?.id ?? null };
  });
  note(`parked in ${parked.space}, 3.0 m off ${FACE}`);
  /**
   * 🚨 **400 FRAMES OF SETTLE, AND THE 60 IT REPLACES PUT A 44 705 px>16 DRIFT UNDER EVERY CLAIM
   * IN THIS FILE.** Looked at, not reasoned about: the revert frame came back with the wall and
   * the painting exactly as they were — every state number identical, `alive 13522/13522`,
   * `open 0` — and still differed from A across 85% of the frame at mean 4.7. Two causes, both
   * this harness's and neither the dressing's: **the "THE LONG GALLERY" room title is a TIMED HUD
   * element** that had faded by the third shot, and **the exposure was still adapting off the boot
   * transient** when A was taken, so A is simply a warmer frame than everything after it.
   * HANDOFF's own line: *"check for effects primed on a timer that fires after the capture."*
   */
  await step(400);

  /** Sweep the canvas with real blows, sim RUNNING — `onChunk` is what drives the erosion. */
  const dig = async () => {
    await page.evaluate(([n, power]) => {
      const S = window.__skin1;
      const N = Math.max(2, Math.round(Math.sqrt(n)));
      let k = 0;
      for (let i = 0; i < N && k < n; i++) {
        for (let j = 0; j < N && k < n; j++, k++) {
          const u = S.u0 + (S.u1 - S.u0) * (i + 0.5) / N;
          const v = S.v0 + (S.v1 - S.v0) * (j + 0.5) / N;
          S.panel.applyHit(S.panel.pointAt(u, v), power);
        }
      }
    }, [BLOWS, POWER]);
    await step(20);
  };
  /**
   * ⚠️ **THE SETTLE IS 240 FRAMES AND THAT IS MEASURED, NOT CAUTIOUS.** The first build of this
   * file stepped 20 frames after the revert and the control read **53 820 px>16 against a floor of
   * 0** — nothing to do with the dressing. `DEBRIS_KINDS` gives `plaster` a `life` of up to 3.2 s
   * and `dust.burst` up to 2.4 s, and neither has a `clear()`; 14 blows at the shipped x8 base
   * throw both. 20 frames is a third of a second. The wall was back and the room was full of
   * falling grit.
   */
  const undo = async () => {
    await page.evaluate(() => {
      const S = window.__skin1;
      S.panel.resetDamage();
      S.skin.reset();
      window.__rrr.engine.debris?.clear?.();
    });
    await step(240);
    await page.evaluate(() => window.__rrr.engine.debris?.clear?.());
    await step(30);
  };
  const state = () => page.evaluate(() => {
    const S = window.__skin1, e = window.__rrr.engine;
    const st = S.skin.faceStat(S.faceId);
    let floatingOverHole = 0;
    for (const f of S.rec.frags) {
      if (!f.dead && S.panel.field.depthAt(f.u, f.v) >= 0.999) floatingOverHole++;
    }
    return {
      alive: st.alive, total: st.total, by: st.by,
      open: S.panel.field.openCells, maxDepth: S.panel.field.maxDepth,
      floatingOverHole, calls: e.renderer.info.render.calls, tris: e.renderer.info.render.triangles,
    };
  });

  // ================================================================== A — intact
  const held = await hold(page);
  note(`held: ${JSON.stringify(held)}`);
  await step(4);
  const A = decodePng(await png('skin1-A-intact'));
  await step(4);
  const A2 = decodePng(await png('skin1-A-intact-floor'));
  const floor = diff(A, A2);
  note(`same-config FLOOR: ${summarise(floor)}`);
  const sA = await state();
  note(`A intact: ${JSON.stringify(sA)}`);
  await release(page);

  /**
   * 🚨 **THE FLOOR THAT EVERY CLAIM BELOW IS MEASURED AGAINST — SAME CONFIG, SAME ELAPSED SIM
   * TIME.** A pair taken 4 frames apart inside one `hold()` is a floor for *no time passing*, and
   * every arm here costs ~300 frames of live loop (the dig, the debris settling, the revert). The
   * honest floor is a pair separated by that same amount of nothing happening: no dig, no arm
   * flip, just the world continuing. It is what tells a 33 000-pixel result from a 45 000-pixel
   * one that means nothing.
   */
  await step(330);
  await hold(page); await step(4);
  const AL = decodePng(await png('skin1-A-intact-late'));
  await release(page); await step(4);
  const floorLong = diff(A, AL);
  note(`LONG FLOOR (A vs A after ${330} idle frames, no dig): ${summarise(floorLong)}`);

  // ================================================================== B — the defect
  await page.evaluate(() => { window.__skin1.skin.on = false; });
  await dig();
  await hold(page); await step(4);
  const B = decodePng(await png('skin1-B-skin-OFF-the-defect'));
  const sB = await state();
  note(`B skin OFF: ${JSON.stringify(sB)}`);
  await release(page);
  await step(4);
  await undo();
  await page.evaluate(() => { window.__skin1.skin.on = true; });

  /**
   * 🚨 **R1 — THE REVERT AFTER A DIG THAT ERODED NOTHING, AND IT IS THE BASELINE FOR R2, NOT A
   * GATE. IT ALSO FOUND A DEFECT THAT IS NOT THIS SLICE'S.**
   *
   * Arm B ran with `skin.on = false`, so **`skin.reset()` put back zero fragments here** — the only
   * thing this revert undoes is `panel.resetDamage()`. It still comes back **~55 000 px>16 from A
   * against a same-elapsed-time floor of ~550**, and the frame shows the face rectangle as a flat
   * dark plane where its wallpaper should be. That is `wall.js`'s reset not restoring the panel's
   * own look — the same class as the barrier-invisible-after-`resetDamage` bug `wall.js` documents
   * in `applyHit`. **It is pre-existing, it is in a file this slice does not own, and it is
   * reported rather than worked around.**
   *
   * So the skin's OWN revert is asserted against R1 and not against A: R1 and R2 carry the
   * identical `resetDamage` residue, and the only thing that differs between them is whether 6663
   * eroded fragments came back.
   */
  await hold(page); await step(4);
  const R1 = decodePng(await png('skin1-R1-reverted-after-skinOFF-dig'));
  const sR1 = await state();
  await release(page); await step(4);
  const revBase = diff(A, R1);
  note(`R1 reverted (nothing had eroded): ${JSON.stringify(sR1)}`);
  note(`  R1 vs A — this is `
    + `wall.js resetDamage's own residue, NOT the skin's: ${summarise(revBase)}`);

  // ================================================================== C — the fix
  await dig();
  await hold(page); await step(4);
  const C = decodePng(await png('skin1-C-skin-ON-the-fix'));
  const sC = await state();
  note(`C skin ON: ${JSON.stringify(sC)}`);
  await release(page);
  await step(4);

  // ---- R2: the same revert, after a dig that DID erode --------------------
  await undo();
  await hold(page); await step(4);
  const R2 = decodePng(await png('skin1-R2-reverted-after-skinON-dig'));
  const sR2 = await state();
  await release(page); await step(4);
  const rev = diff(R1, R2);
  note(`R2 reverted (6663 fragments had eroded): ${JSON.stringify(sR2)}`);
  note(`  R2 vs R1 — THE SKIN'S OWN REVERT, with the resetDamage residue in both: ${summarise(rev)}`);

  // ================================================================== the claims
  const dAB = diff(A, B), dAC = diff(A, C), dBC = diff(B, C);
  note('');
  note(`A(intact) vs B(dug, skin OFF): ${summarise(dAB)}`);
  note(`A(intact) vs C(dug, skin ON):  ${summarise(dAC)}`);
  note(`B vs C — WHAT THIS SLICE CHANGED ON SCREEN: ${summarise(dBC)}`);

  // ⚠️ The comparison floor is the LONG one — same config, same elapsed sim time. See its note.
  const fl = Math.max(60, floorLong.pxOver16);
  (rev.pxOver16 <= fl * 2 && sR2.alive === sR2.total)
    ? pass('the SKIN reverts — a face that eroded comes back identical to one that never did',
      `R2 vs R1 px>16 ${rev.pxOver16}, inside the ${floorLong.pxOver16} same-elapsed-time floor;`
      + ` ${sR2.alive}/${sR2.total} fragments standing`)
    : fail('the SKIN reverts — a face that eroded comes back identical to one that never did',
      `R2 vs R1 px>16 ${rev.pxOver16} against a long floor of ${floorLong.pxOver16},`
      + ` ${sR2.alive}/${sR2.total} standing — look at the frames`);
  note('');
  note(`⚠️ REPORTED, NOT OWNED: R1 vs A is ${revBase.pxOver16} px>16 against a ${floorLong.pxOver16}`
    + ' floor, with NOTHING eroded in that arm — `wall.js` `resetDamage()` does not restore the'
    + " panel's own look. Pre-existing; `wall.js` is not this slice's file.");

  dAB.pxOver16 > fl * 3
    ? pass('CONTROL — the dig itself is visible; B is not a copy of A',
      `A vs B px>16 ${dAB.pxOver16} against a ${floorLong.pxOver16} floor,`
      + ` ${sB.open} cells open, maxDepth ${sB.maxDepth}`)
    : fail('CONTROL — the dig itself is visible; B is not a copy of A',
      `A vs B px>16 ${dAB.pxOver16} — the dig did not happen, so nothing below means anything`);

  /**
   * 🚨 **THE DEFECT, REPRODUCED — and it is what makes the fix's frame worth looking at.** With
   * the rule off, the identical dig leaves canvas fragments drawn over cells that are open to the
   * next room. That number is the painting hanging in front of the hole.
   */
  sB.floatingOverHole > 0
    ? pass('CONTROL — with the rule OFF the dressing IS left hanging over the breach',
      `${sB.floatingOverHole} fragments drawn over open cells (${sB.alive}/${sB.total} standing)`)
    : fail('CONTROL — with the rule OFF the dressing IS left hanging over the breach',
      'the pre-fix arm has nothing floating — this comparison proves nothing');

  sC.floatingOverHole === 0 && sC.alive < sB.alive
    ? pass('the dressing erodes with the wall — nothing is left over the breach',
      `${sB.alive - sC.alive} fragments removed, ${sC.alive}/${sC.total} standing, 0 over open cells`)
    : fail('the dressing erodes with the wall — nothing is left over the breach',
      `floating ${sC.floatingOverHole}, alive ${sC.alive} vs ${sB.alive}`);

  /**
   * 🚨 **THE DELIVERABLE. B and C are the SAME dig, one frame apart in code**, so this number is
   * the eroding dressing and nothing else — the picture John asked for, against a floor taken over
   * the same elapsed sim time with no dig in it at all.
   */
  dBC.pxOver16 > fl * 3
    ? pass('and it is VISIBLE — B and C differ by well over the same-elapsed-time floor',
      `B vs C px>16 ${dBC.pxOver16} against a floor of ${floorLong.pxOver16}`)
    : fail('and it is VISIBLE — B and C differ by well over the same-elapsed-time floor',
      `B vs C px>16 ${dBC.pxOver16} against a floor of ${floorLong.pxOver16} — the fix does not read`);

  note('');
  note(`draw calls A ${sA.calls} · B ${sB.calls} · C ${sC.calls}  (budget 625)`);
  note(`triangles  A ${sA.tris} · B ${sB.tris} · C ${sC.tris}  (budget 900k)`);
  Math.max(sA.calls, sB.calls, sC.calls) <= 625
    ? pass('every arm fits the 625 draw-call budget at this station',
      `${sA.calls}/${sB.calls}/${sC.calls}`)
    : fail('every arm fits the 625 draw-call budget at this station',
      `${sA.calls}/${sB.calls}/${sC.calls}`);
  Math.max(sA.tris, sB.tris, sC.tris) <= 900000
    ? pass('and the 900k triangle budget', `worst ${Math.max(sA.tris, sB.tris, sC.tris)}`)
    : fail('and the 900k triangle budget', `worst ${Math.max(sA.tris, sB.tris, sC.tris)}`);
  void skip;
}
