/**
 * HOLD THE PICTURE STILL — the live-mode half of capture determinism.
 *
 *   import { hold, release, stillPair } from '../still.mjs';   // from harness/scenarios/
 *
 * ---------------------------------------------------------------------------
 * 🚨 WHY THIS EXISTS: `docs/capture-determinism.md` IS A CAPTURE-MODE DOCUMENT
 * ---------------------------------------------------------------------------
 * That fix (2026-08-05) is real and it holds — `node harness/determinism.mjs --all` still
 * reads pixel-identical on all 37 views. Nothing regressed. **It never covered the live
 * page**, and it says so out loud in its own §4: *"Live mode. Still temporally dithered,
 * deliberately."*
 *
 * The gap that opened underneath that sentence is that **every `harness/scenarios/*.mjs` runs
 * through `playtest.mjs`, and `playtest.mjs` boots the LIVE loop** — deliberately, because it
 * exists to execute the code a player executes. So every scenario pixel A/B on this project is
 * taken in the one mode determinism was explicitly not guaranteed in, and the two consumers
 * that noticed said so from opposite directions on 2026-08-09:
 *
 *   `visible-1`  `_progkey1-independence`'s damage arm floors at 43-49% of the rect moved,
 *                mean |Δ| 12-14, against the 0.44% HANDOFF records — so its `test > 3 × floor`
 *                bar is unreachable and "the dug panel's pixels changed" fails at 90% moved.
 *   `calls-1`    "kill the grain first or the same-config floor is 22-42% of pixels."
 *
 * ---------------------------------------------------------------------------
 * WHAT IT IS, AND WHAT IT DELIBERATELY IS NOT
 * ---------------------------------------------------------------------------
 * **It changes nothing a player sees, by construction: there is no source edit anywhere in
 * `src/`.** Every knob below is a field the live render loop re-reads on the next frame, so
 * the hold is armed and reverted from the page, inside one session, and the shipped bundle is
 * byte-identical to what it was before this file existed. The grain still ships at 0.024 and
 * still animates in the game.
 *
 * Four terms, and each one is here because it was measured, not because it was suspected
 * (`harness/scenarios/_jitter1-who.mjs`, each armed ALONE between two captures of a
 * pixel-identical base, 2026-08-09, `?seed=s4&dig=1`, `quality` auto):
 *
 *   | term armed alone                | gallery station rect | service station rect |
 *   |---------------------------------|----------------------|----------------------|
 *   | grain PHASE advances            | 0.74% moved, |Δ| 1.94 | 0.08% moved, |Δ| 2.12 |
 *   | AO sample rotation advances     | 0.47% moved, |Δ| 1.52 | 0.07% moved, |Δ| 1.63 |
 *   | ONE dynamic-resolution step     | 7.54% moved, |Δ| 3.63 | 0.40% moved, |Δ| 2.28 |
 *   | the whole game update, 320 ms   | 0.07% moved, |Δ| 1.79 | 0.48% moved, |Δ| 0.78 |
 *   | the four practical FLICKERS     | 0.00%, pixel-identical| 0.00%, pixel-identical|
 *
 * 🎯 **DYNAMIC RESOLUTION IS THE BIG ONE AND IT IS THE ONE NOBODY WAS LOOKING AT.** `_liveLoop`
 * nudges `renderScale` by 0.02 whenever the 120-frame average leaves a ±8-18% band around the
 * budget, and the whole chain runs at that scale with the AA pass upscaling to the canvas — so
 * a single step resamples EVERY pixel in the frame. It is driven by frame time, which is driven
 * by whatever else is on the GPU, which is why the same test floors at 0.7% on a quiet machine
 * and 43-49% while another agent is taking captures. **That is the mechanism behind a floor
 * that is a lottery rather than a number.**
 *
 * ⚠️ **AND IT IS WHY "KILL THE GRAIN" IS NOT THE FIX, MEASURED RATHER THAN ARGUED.** Grain at
 * 0.024 is ±3 of 255; it moves under 1% of pixels past a `d > 8` threshold and contributes
 * |Δ| ≈ 2. It cannot produce mean |Δ| 12-14. Removing it lowers a floor; it does not make one.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ THE ORDER MATTERS, AND GETTING IT WRONG PRODUCED A CONFIDENT WRONG ANSWER
 * ---------------------------------------------------------------------------
 * **The camera is driven BY an updater** (`liveInput` inside `views/game.js`'s update). Hold
 * first and then teleport the player and the camera never follows: the first build of
 * `_jitter1-who.mjs` did exactly that, its second station's panel projected to `-2556,-210` —
 * entirely off screen — and every row underneath reported a confident `0.00%`.
 *
 *     await station(...);            // move
 *     await settle(45);              // let the camera ARRIVE, sim running
 *     await hold(page);              // now freeze
 *     const a = await snap('a');
 *     await settle(8);
 *     const b = await snap('b');     // a and b are the same picture
 *     await release(page);
 *
 * `stillPair()` below is that block. Use it rather than re-deriving the order.
 */

/**
 * Freeze everything that makes two captures of an unchanged scene differ.
 * Returns what it pinned, for a `note()` line — an instrument should say what it did.
 */
export function hold(page) {
  return page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e) return { ok: false, why: 'window.__rrr.engine not reachable' };
    const w = (window.__rrrStill ??= {});
    if (w.depth) { w.depth++; return { ...w.info, ok: true, nested: w.depth }; }

    w.saved = {
      det: e.pipeline.deterministic,
      dyn: e.opts.dynamicRes,
      scale: e.pipeline.renderScale,
      updaters: e._updaters,
    };
    // 1+2. The two frame-variant post terms: the grain PHASE and the AO sample rotation.
    //      `deterministic` is the pipeline's own existing switch for exactly this pair — it
    //      is normally wired to `engine.capture`, and all this does is reach it from a live
    //      page. The grain AMPLITUDE is untouched: the look does not change, only the seed.
    e.pipeline.deterministic = true;
    // 3.   Dynamic resolution. `_liveLoop` reads `opts.dynamicRes` every frame, so switching
    //      it off holds `renderScale` where it is.
    //
    //      ⚠️ **"WHERE IT IS" IS NOT ENOUGH, AND THIS WAS MEASURED THE HARD WAY.** A scenario
    //      holds several times — once per station, before and after the thing it is testing —
    //      and between two holds the live loop is free to have walked the scale somewhere else.
    //      Each PAIR is then internally consistent while the BEFORE/AFTER comparison across two
    //      pairs is a comparison of two different render resolutions, which resamples every
    //      pixel in the frame. So the FIRST hold of a session fixes the canonical scale and
    //      every later hold restores it. `setSize` reallocates the chain and clears
    //      `_depthPrimed`, so give it a few frames before capturing (`stillPair` does).
    e.opts.dynamicRes = false;
    w.canonicalScale ??= e.pipeline.renderScale;
    let rescaled = false;
    if (Math.abs(e.pipeline.renderScale - w.canonicalScale) > 1e-6) {
      e.pipeline.renderScale = w.canonicalScale;
      e.pipeline.setSize(e.pipeline.canvasWidth, e.pipeline.canvasHeight);
      rescaled = true;
    }
    // 4.   The scene's own animation. Swapped out rather than emptied so the exact closures go
    //      back in the exact order, and so anything registered WHILE held is kept rather than
    //      silently dropped on release.
    e._updaters = [];

    w.depth = 1;
    w.info = {
      ok: true,
      pinned: { deterministic: true, dynamicRes: false,
        renderScale: +e.pipeline.renderScale.toFixed(3), rescaled,
        liveScale: +w.saved.scale.toFixed(3), updatersParked: w.saved.updaters.length },
      grain: e.pipeline.grade.grain,
    };
    return w.info;
  });
}

/** Undo `hold()` exactly. Safe to call when not held. */
export function release(page) {
  return page.evaluate(() => {
    const e = window.__rrr?.engine;
    const w = window.__rrrStill;
    if (!e || !w?.depth) return { ok: true, wasHeld: false };
    if (--w.depth > 0) return { ok: true, wasHeld: true, nested: w.depth };
    const s = w.saved;
    e.pipeline.deterministic = s.det;
    e.opts.dynamicRes = s.dyn;
    if (Math.abs(e.pipeline.renderScale - s.scale) > 1e-6) {
      e.pipeline.renderScale = s.scale;
      e.pipeline.setSize(e.pipeline.canvasWidth, e.pipeline.canvasHeight);
    }
    // anything a view registered while we held it goes on the end, not in the bin
    e._updaters = s.updaters.concat(e._updaters);
    w.saved = null;
    return { ok: true, wasHeld: true };
  });
}

/**
 * Unpin ONLY the two post dithers, leaving the rest of the hold in force.
 *
 * 🚨 **THIS IS THE REINTRODUCTION HANDLE AND EVERY GATE BUILT ON `hold()` SHOULD USE IT.**
 * HANDOFF's rule: *a test that has only ever run against working code is not evidence of
 * anything.* A scenario that asserts "the floor is zero" proves nothing unless it also shows
 * the same assertion FAILING when the fix is taken away — and the grain phase is the term that
 * always moves, on any machine, under any load, so it is the reliable one to put back.
 */
export function unpinDithers(page, on = true) {
  return page.evaluate((v) => {
    const e = window.__rrr.engine;
    e.pipeline.deterministic = !v;
    return { deterministic: e.pipeline.deterministic };
  }, on);
}

/**
 * Park → settle → hold → two captures → release. The whole protocol, in the order that works.
 *
 * @param page      the Playwright page
 * @param snap      `playtest.mjs`'s `snap(tag)` — returns a Buffer or null
 * @param tag       label for the two captures
 * @param o.settle  frames of 40 ms to let the sim arrive BEFORE freezing (default 45)
 * @param o.gap     frames of 40 ms between the two captures (default 8)
 * @param o.before  optional async callback run while the sim is still live (park the camera here)
 * @returns { one, two, pinned } — `one` and `two` must be the same picture
 */
export async function stillPair(page, snap, tag, o = {}) {
  const wait = async (n) => { for (let i = 0; i < n; i++) await page.waitForTimeout(40); };
  if (o.before) await o.before();
  await wait(o.settle ?? 45);
  const pinned = await hold(page);
  await wait(4);      // a parked frame reaches the compositor, and a re-scale re-primes depth
  const one = await snap(`${tag}-1`);
  await wait(o.gap ?? 8);
  const two = await snap(`${tag}-2`);
  await release(page);
  return { one, two, pinned };
}
