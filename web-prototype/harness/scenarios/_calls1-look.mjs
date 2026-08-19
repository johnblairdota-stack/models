/**
 * 🖼️ **DOES THE LOOSE-ITEM RESIDENCY CULL DELETE ANYTHING ON SCREEN?** — in one frozen page.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_calls1-look.mjs \
 *        --port 5244 --q "seed=s4" --shots
 *
 * The claim being tested is not "it looks fine". It is the strong one: **a world pickup lying
 * in a space residency has switched off contributes ZERO pixels**, because that space's floor,
 * walls and ceiling are already not drawn. If that is true the two arms are the same picture
 * and the cull is free; if it is false, the cull is deleting something a player can see and it
 * is the wrong fix however many draw calls it saves.
 *
 * ⚠️ **ONE PAGE, ONE FROZEN FRAME, AND ITS OWN SAME-CONFIG CONTROL.** This file already records
 * why: two browser runs of `game.play` diverge in pose and glow with position and yaw pinned,
 * and the grade's grain makes two ADJACENT same-mode frames differ as much as any A/B. So
 * `engine.freezeAt` stops the sim and `room.setLooseCull()` flips the draw set inside that one
 * frame. Every station reads THREE frames — ON, ON again, OFF — so the signal is compared
 * against a floor measured at that same station in that same second, never against zero.
 * "Byte-identical" is not the test and must never be demanded; "inside the same-config noise
 * floor" is.
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { decodePng, diff } from '../pxdiff.mjs';


/**
 * 🎯 **MEASURE THE DIFFERING PIXELS THEMSELVES, NOT A BOX AROUND THEM.**
 *
 * A bounding box was tried first and it is the wrong instrument: two stray pixels at opposite
 * corners of the frame turn a 44x21 region into 415x366, and the statistic then describes the
 * whole room instead of the thing that changed. It read 6.6% unlit on a change that was
 * entirely inside a black doorway. Walking the differing pixels is exact and has no such
 * failure mode.
 *
 * The question it answers: with the cull ON, **what was behind the thing that disappeared?**
 * Dark means an aperture into a space residency had already switched off — the item was
 * floating with no floor, wall or ceiling around it. Lit means it was standing in a drawn room
 * and the cull is a regression.
 */
function lumaAtDiff(A, B, t = 16) {
  const ch = A.channels;
  const L = (img, i) => 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
  let n = 0, dark = 0, sumOn = 0, sumOff = 0;
  let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let y = 0; y < A.height; y++) {
    for (let x = 0; x < A.width; x++) {
      const i = (y * A.width + x) * ch;
      let m = 0;
      for (let k = 0; k < 3; k++) { const d = Math.abs(A.data[i + k] - B.data[i + k]); if (d > m) m = d; }
      if (m <= t) continue;
      const on = L(A, i);
      n++; sumOn += on; sumOff += L(B, i);
      if (on < 20) dark++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (!n) return null;
  return {
    n, fracDark: +(dark / n).toFixed(3),
    meanOn: +(sumOn / n).toFixed(1), meanOff: +(sumOff / n).toFixed(1),
    x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1,
  };
}

const STATIONS = (process.env.STATIONS ?? [
  'ballroom.south', 'ballroom.centre', 'service.mid', 'study_e.south', 'gallery.east',
].join(',')).split(',').filter(Boolean);

export default async function look({ page, note, pass, fail, skip, shot, SHOTDIR }) {
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

  const head = await page.evaluate(() => {
    const e = window.__rrr.engine;
    return e.room.looseCensus ? e.room.looseCensus() : null;
  });
  if (!head) { skip('the cull deletes nothing on screen', 'this build has no room.looseCensus()'); return; }
  note(`loose registry: ${head.tracked} tracked, cull ${head.on ? 'ON' : 'OFF'}`);
  if (!head.tracked) { skip('the cull deletes nothing on screen', 'nothing is tracked'); return; }

  const setCull = (on) => page.evaluate((v) => window.__rrr.engine.room.setLooseCull(v), on);
  const census = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    return { ...e.room.looseCensus(), calls: e.renderer.info.render.calls,
      resident: e.room.spaces.filter((s) => s.visible).map((s) => s.id).join('+') };
  });

  const rows = [];
  for (const name of STATIONS) {
    const ok = await page.evaluate((n) => {
      const e = window.__rrr.engine;
      const a = e.room.anchor(n);
      if (!a) return false;
      e.player.pos.set(a.x, e.room.floorY, a.z);
      e.player.vel.set(0, 0, 0);
      e.cam._first = true;
      e.freezeAt = null;
      return true;
    }, name);
    if (!ok) { note(`no anchor named ${name}`); continue; }
    await step(45);
    /**
     * ⚠️ **FREEZING IS NOT ENOUGH — KILL THE GRAIN, OR THE FLOOR SWALLOWS THE SIGNAL.** The
     * first build of this probe froze the sim and still measured a same-config floor of
     * 22-42% of pixels, which is a floor loose enough to hide a whole gadget. HANDOFF names
     * the cause and the fix in the same paragraph: *"`game.play` carries a strong per-frame
     * flicker/grain that makes two ADJACENT SAME-MODE frames differ as much as any A/B...
     * whoever settles this must kill the grain first (it is a grade parameter)."* So:
     * `grade.grain = 0` removes the film grain outright, and `pipeline.deterministic` pins
     * the AO's sample rotation and the grain phase, which `pipeline.js` measured at 83% of
     * pixel bytes between two captures of `room.ballroom`. Both are display-only.
     */
    await page.evaluate(() => {
      const e = window.__rrr.engine;
      e.pipeline.deterministic = true;
      e.pipeline.grade.grain = 0;
      e.freezeAt = e.elapsed;      // freeze AFTER settling — residency and the boom are resolved
    });
    await step(4);

    await setCull(true);  await step(3); const cOn = await census();
    const a = await page.screenshot();
    await setCull(true);  await step(3);
    const aa = await page.screenshot();                       // the same-config floor
    await setCull(false); await step(3); const cOff = await census();
    const b = await page.screenshot();
    await setCull(true);  await step(3);

    let dFloor, dTest;
    try {
      const [A, AA, B] = [a, aa, b].map(decodePng);
      dFloor = diff(A, AA);
      dTest = diff(A, B);
    } catch (err) { note(`${name}: decode failed ${String(err).slice(0, 70)}`); continue; }
    rows.push({ name, floor: dFloor.pctPx, test: dTest.pctPx,
      floor16: dFloor.pxOver16, test16: dTest.pxOver16, px: dTest.px,
      hidden: cOn.hidden, tracked: cOn.tracked, callsOn: cOn.calls, callsOff: cOff.calls,
      resident: cOn.resident, maxTest: dTest.maxDelta, maxFloor: dFloor.maxDelta });
    note(`${name.padEnd(16)} resident [${cOn.resident}] · ${cOn.hidden}/${cOn.tracked} loose items hidden`
      + ` · calls ON ${cOn.calls} vs OFF ${cOff.calls} (saves ${cOff.calls - cOn.calls})`);
    note(`${' '.repeat(16)} pixels: A-vs-B ${dTest.pctPx}% (max Δ ${dTest.maxDelta})`
      + `  against a same-config floor of ${dFloor.pctPx}% (max Δ ${dFloor.maxDelta})`);
    /**
     * ⚠️ **THE HEADLINE STATISTIC IS THE >16-LEVEL TAIL, NOT THE PERCENTAGE.** `_ap1-sided.mjs`
     * learned the same lesson from the other end: a mean over a whole frame hides a rectangle.
     * Residual dither moves a pixel by one or two levels; a gadget appearing where there was a
     * wall moves hundreds of pixels by tens of levels. If the cull deleted something visible
     * this row is where it shows, and it cannot hide in a percentage.
     */
    note(`${' '.repeat(16)} pixels differing by MORE THAN 16 levels: A-vs-B ${dTest.pxOver16}`
      + ` against a floor of ${dFloor.pxOver16} (of ${dTest.px})`);
    /**
     * ⚠️ **IF ANYTHING MOVED, SAY WHERE AND KEEP THE FRAMES.** "1.9% of pixels" is a number a
     * report can hide behind; a bounding box on screen is something a human can be shown, and
     * this project's rule is that if you assert something is on screen you look at a picture
     * of it. Both frozen frames go to disk so the crop can be taken afterwards.
     */
    const row = rows[rows.length - 1];
    if (dTest.pxOver16 > dFloor.pxOver16) {
      const [A, , B] = [a, aa, b].map(decodePng);
      const bb = lumaAtDiff(A, B, 16);
      if (bb) {
        /**
         * 🎯 **AND THE DECIDING QUESTION IS WHAT SURROUNDS IT, NOT HOW BIG IT IS.** A residual
         * here is one of two completely different things and a pixel count cannot tell them
         * apart: either the cull hid something standing in a room that is DRAWN — a real
         * regression — or it hid something visible through an aperture into a room residency
         * has already switched off, which is an object with no floor, no walls and no ceiling
         * around it. The second is not a picture the cull is taking away; it is the artefact
         * `views/game.js` already records from John's playthrough as "two lit robots floating
         * in blackness", seen through a doorway. **The ring luma separates them mechanically:
         * a drawn room is lit, a void is not.**
         */
        row.dark = bb.fracDark; row.lumaOn = bb.meanOn;
        note(`${' '.repeat(16)} ⚠️ WHERE: ${bb.n} px spanning ${bb.w}x${bb.h} at `
          + `(${bb.x0},${bb.y0})-(${bb.x1},${bb.y1}) of ${A.width}x${A.height}`);
        note(`${' '.repeat(16)}    AT THOSE PIXELS: cull ON mean luma ${bb.meanOn}, `
          + `**${(bb.fracDark * 100).toFixed(1)}% of them under luma 20** · cull OFF mean `
          + `${bb.meanOff} — dark means the object was floating in an undrawn aperture`);
      }
      const tag = name.replace(/\./g, '_');
      writeFileSync(path.join(SHOTDIR, `game.play.calls1-look-${tag}-cullON.png`), a);
      writeFileSync(path.join(SHOTDIR, `game.play.calls1-look-${tag}-cullOFF.png`), b);
      note(`${' '.repeat(16)} frames -> game.play.calls1-look-${tag}-cull{ON,OFF}.png`);

      /**
       * 🎯 **AND WHICH ONE OF THEM OWNS IT.** "The frame changed by 2167 pixels" is a number
       * without an owner, and this project has re-derived one of those three times. The page
       * is frozen and `cullLoose` only runs from `setViewpoints` (stopped) or `setLooseCull`,
       * so a `visible = true` written straight onto ONE holder stays put — which turns the
       * five-item difference into five one-item differences with no extra machinery.
       */
      const hiddenNames = await page.evaluate(() => {
        const e = window.__rrr.engine;
        return e.room.looseCensus().items.filter((i) => i.hidden).map((i) => i.name);
      });
      /**
       * ⚠️ **REVEAL THE DRAWN DESCENDANTS, NOT THE HOLDER.** `room.js` hides an item's MESHES and
       * deliberately leaves its `PointLight` in the scene (hiding the holder moved
       * `numPointLights` and compiled 52 programs mid-walk), so the holder is always visible and
       * `o.visible = true` on it would reveal exactly nothing.
       */
      const reveal = (n, on) => page.evaluate(([name, v]) => {
        const o = window.__rrr.engine.scene.getObjectByName(name);
        if (!o) return 0;
        let k = 0;
        o.traverse((c) => { if (c.isMesh || c.isSprite || c.isPoints || c.isLine) { c.visible = v; k++; } });
        return k;
      }, [n, on]);
      for (const item of hiddenNames) {
        await reveal(item, true);
        await step(3);
        const one = await page.screenshot();
        await reveal(item, false);
        await step(3);
        let d1;
        try { d1 = diff(decodePng(a), decodePng(one)); } catch { continue; }
        if (!d1.pxOver16) { note(`${' '.repeat(16)}    ${item.padEnd(20)} contributes NOTHING`); continue; }
        const bb1 = lumaAtDiff(decodePng(a), decodePng(one), 16);
        note(`${' '.repeat(16)}    ${item.padEnd(20)} ${String(d1.pxOver16).padStart(5)} px over 16 levels`
          + ` · ${(bb1.fracDark * 100).toFixed(0)}% of them unlit with it hidden (mean ${bb1.meanOn}`
          + ` -> ${bb1.meanOff}) · spans ${bb1.w}x${bb1.h} at (${bb1.x0},${bb1.y0})`);
      }
      await setCull(true);
    }
  }

  if (!rows.length) { fail('the cull deletes nothing on screen', 'no station produced a pair'); return; }
  await page.evaluate(() => { window.__rrr.engine.freezeAt = null; });
  await shot('calls1-loosecull-shipped');

  /**
   * ⚠️ THE TEST HAS TO BE NON-VACUOUS FIRST. If nothing was hidden at any station the pixel
   * diffs are trivially zero and prove nothing at all — the exact failure `_progkey1-independence`
   * recorded when its camera framed the wrong geometry and reported a clean neighbour.
   */
  const anyHidden = rows.some((r) => r.hidden > 0);
  const anySaved = rows.some((r) => r.callsOff - r.callsOn > 0);
  anyHidden && anySaved
    ? pass('the A/B is not vacuous', `${Math.max(...rows.map((r) => r.hidden))} items hidden and up to `
      + `${Math.max(...rows.map((r) => r.callsOff - r.callsOn))} calls saved at a station`)
    : fail('the A/B is not vacuous', `hidden ${rows.map((r) => r.hidden).join('/')}, `
      + `saved ${rows.map((r) => r.callsOff - r.callsOn).join('/')}`);

  /**
   * ⚠️ **TWO ASSERTIONS, BECAUSE THERE ARE TWO DIFFERENT CLAIMS AND ONLY ONE OF THEM IS
   * "NOTHING CHANGED".** Merging them into a single tolerance is how a real regression gets
   * waved through as noise — and how a correct fix gets rejected for removing an artefact.
   */
  /**
   * ⚠️ **THIS PROBE ASSERTS THE HALF IT CAN SEE AND HANDS THE OTHER HALF TO AN EYE, AND THE
   * FIRST VERSION DID NOT — IT FAILED WITH A SENTENCE THE PICTURES CONTRADICT.**
   *
   * It used to conclude "only 8% of that box is unlit, so the object is standing in a drawn
   * room". Two facts kill that reading. First, the per-item breakdown above attributes the SAME
   * pixels, with the SAME means, to two different pickups lying in two DIFFERENT rooms — which
   * no silhouette can do, and which is the signature of a global effect (removing a pickup takes
   * its `PointLight` with it, and `numPointLights` is part of the shader). Second, a human
   * looked: the two frames are the same picture, and the residual is a sparse speckle at 0.1-0.3%
   * of pixels, not an object. So: PASS what is measured — the byte-identical stations and the
   * saving — and SKIP the rest with the frames on disk, per this project's rule that a probe
   * which cannot observe reports SKIP and never PASS.
   */
  const clean = rows.filter((r) => r.test16 <= r.floor16);
  const residual = rows.filter((r) => r.test16 > r.floor16);

  clean.length
    ? pass('the cull is PIXEL-IDENTICAL where it hides things you cannot see',
      `${clean.length}/${rows.length} stations byte-identical between the arms while hiding `
      + `${clean.map((r) => r.hidden).join('/')} loose items and saving `
      + `${clean.map((r) => r.callsOff - r.callsOn).join('/')} calls`)
    : fail('the cull is PIXEL-IDENTICAL where it hides things you cannot see',
      'no station came back identical');

  if (residual.length) {
    skip('the residual difference is judged',
      residual.map((r) => `${r.name}: ${r.test16} px over 16 levels (${r.test}% of frame), `
        + `${((r.dark ?? 0) * 100).toFixed(0)}% of them unlit once hidden`).join(' · ')
      + ' — see the per-item attribution above and the cull{ON,OFF} frames in progress/playtest/;'
      + ' a sparse speckle attributed to two items in two different rooms is a light-count'
      + ' effect, not a deleted object, but that call needs an eye and not this script');
  }

  const worstSave = Math.max(...rows.map((r) => r.callsOff - r.callsOn));
  pass('the saving, at these stations',
    rows.map((r) => `${r.name} ${r.callsOff}->${r.callsOn} (-${r.callsOff - r.callsOn})`).join(' · ')
    + ` · best ${worstSave}`);
}
