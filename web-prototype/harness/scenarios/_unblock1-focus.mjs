/**
 * 🖱️ **ALT-TAB: DOES THE GAME LET GO OF THE MOUSE, AND DOES IT STOP?** — verification for John's
 * two live blockers, driven the way he hit them rather than from a menu.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_unblock1-focus.mjs \
 *        --port 5377 --q "seed=s4"
 *
 * John, 2026-08-09: *"I am having problems with the point lock for the game when I alt tab. can
 * we pause it when the game it tabbed. Also sometimes I think the point or something else is
 * limiting my mouse movement on my computer."* and *"movement input continue permanently after
 * an escape."*
 *
 * 🚨 **THE SECOND SENTENCE IS THE SERIOUS ONE AND IT IS WHAT F1 EXISTS FOR: THE GAME WAS
 * CONFINING HIS CURSOR OUTSIDE THE GAME.** Pointer lock was taken on a canvas click and nothing
 * ever released it, so the OS cursor stayed captured by a page that was no longer in front.
 *
 * ===========================================================================================
 * WHY IT IS SHAPED LIKE THIS
 * ===========================================================================================
 *
 * ⚠️ **A TEST THAT ONLY ALT-TABS FROM A MENU PROVES NOTHING**, so every check here runs from a
 * live, playing session with a key physically held down — that is the state in which the bug
 * bites, because the `keyup` for a held key lands nowhere once focus is gone.
 *
 * ⚠️ **BLUR AND VISIBILITYCHANGE ARE DRIVEN SEPARATELY, BECAUSE THEY ARE NOT THE SAME EVENT.**
 * Alt-tab and clicking another monitor fire `blur` only — the tab is still "visible" to the Page
 * Visibility API and rAF keeps running. Minimising or switching browser tab fires
 * `visibilitychange`. A fix wired to either one alone leaves a real case of John's unhandled, so
 * asserting on one of them would pass a half-built fix.
 *
 * ⚠️ **F1 SKIPS RATHER THAN PASSES WHEN THE LOCK IS REFUSED.** Headless Chromium is routinely
 * denied Pointer Lock, and this project's standing rule is that a probe which cannot observe
 * must report SKIP and never PASS — a green "the cursor was released" from a page that never
 * held the cursor is exactly the lying instrument the handbook keeps warning about. Run with
 * `--headed` to exercise the real path.
 *
 * ⚠️ **`autoPause` IS OFF UNDER AUTOMATION AND HAS TO BE TURNED ON.** `navigator.webdriver` is
 * true in every harness browser, and a scenario that silently froze would report a world in
 * which nothing ever happened rather than failing. `window.__rrr.autoPause(true)` is the
 * deliberate opt-in the view exposes for exactly this.
 */
export default async function unblock1Focus({ page, note, pass, fail, skip, shot }) {
  const st = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    return {
      pos: [+e.player.pos.x.toFixed(3), +e.player.pos.z.toFixed(3)],
      yaw: +(e.cam?.yaw ?? 0).toFixed(4),
      keys: e.input?.keys?.size ?? -1,
      focused: e.input?.focused !== false,
      locked: document.pointerLockElement === e.canvas,
      hadLock: !!e.input?.hadLock,
      prompt: e.input?.lockPrompt ?? '',
      frame: e.frame,
      /**
       * ⚠️ **`run.t`, NOT `engine.elapsed`, AND THE FIRST VERSION OF THIS PROBE GOT IT WRONG.**
       * The pause is an early return from the VIEW's updater, deliberately (see its comment in
       * `views/game.js`): the player, the hunter, the room, the FX and `run.tick` all freeze
       * together while RENDERING carries on, which is why the window does not go black when you
       * alt-tab back. `engine.elapsed` is the render clock and is SUPPOSED to keep advancing, so
       * reading it here reported a working pause as a failure. `run.t` is the clock John
       * actually complained about — the one that *"charged you for it"* while you were away.
       */
      runT: +(e.run?.t ?? 0).toFixed(2),
      paused: window.__rrr.pausedFrames?.() ?? 0,
      failed: !!document.querySelector('#rrr-view-error, .rrr-error')
        || /VIEW .* FAILED/i.test(document.body.innerText || ''),
    };
  });

  await page.evaluate(() => window.__rrr.autoPause(true));

  // ---- get into a real session: click the canvas (a genuine user gesture, which is the only
  // thing that can take pointer lock) and start swinging.
  await page.mouse.move(640, 360);
  await page.mouse.click(640, 360);
  await page.waitForTimeout(400);
  const armed = await st();
  note(`armed: locked=${armed.locked} hadLock=${armed.hadLock} focused=${armed.focused}`);

  // ---- HOLD KEYS AND SWING. Nothing below is tested from an idle standstill.
  await page.keyboard.down('KeyW');
  await page.keyboard.down('Space');
  await page.waitForTimeout(700);
  const playing = await st();
  note(`mid-swing: keys=${playing.keys} pos=${playing.pos} frame=${playing.frame}`);
  if (playing.keys < 2) {
    fail('the session is really playing before the blur', `only ${playing.keys} keys held`);
    return;
  }

  // =========================================================================================
  // F1 — THE CURSOR GOES BACK TO THE DESKTOP
  // =========================================================================================
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForTimeout(250);
  const blurred = await st();

  if (!armed.locked && !armed.hadLock) {
    skip('pointer lock is released on alt-tab',
      'this browser refused Pointer Lock (headless) — cannot observe a release that never had a capture');
  } else {
    !blurred.locked
      ? pass('pointer lock is released on alt-tab', 'document.pointerLockElement is null while away')
      : fail('pointer lock is released on alt-tab', 'the page still owns the OS cursor with focus gone');
  }

  // =========================================================================================
  // F2 — HELD KEYS ARE DROPPED  (*"movement input continue permanently after an escape"*)
  // =========================================================================================
  blurred.keys === 0
    ? pass('held keys are dropped when focus leaves', 'W + Space released, keys set empty')
    : fail('held keys are dropped when focus leaves', `${blurred.keys} still held — the robot walks into a wall`);

  // =========================================================================================
  // F3 — THE WORLD STOPS
  // =========================================================================================
  const p0 = await st();
  await page.waitForTimeout(1600);
  const p1 = await st();
  const advanced = +(p1.runT - p0.runT).toFixed(2);
  const rendered = p1.frame - p0.frame;
  const movedWhileAway = Math.hypot(p1.pos[0] - p0.pos[0], p1.pos[1] - p0.pos[1]);
  // Both halves matter and they are opposite claims: the RUN clock must stop, and the RENDERER
  // must not — a "pause" that also stopped drawing would be a frozen black window on the way
  // back, which is a worse bug than the one being fixed.
  (advanced < 0.25 && p1.paused > p0.paused && rendered > 0)
    ? pass('the simulation pauses while the game is tabbed away', `run clock +${advanced}s over 1.6s wall clock, ${p1.paused - p0.paused} updates skipped, ${rendered} frames still drawn`)
    : fail('the simulation pauses while the game is tabbed away', `run clock +${advanced}s, pausedFrames ${p0.paused}->${p1.paused}, frames drawn ${rendered}`);

  // =========================================================================================
  // F4 — AND NOTHING TELEPORTS ON THE WAY BACK
  // =========================================================================================
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(300);
  const back = await st();
  const jump = Math.hypot(back.pos[0] - p1.pos[0], back.pos[1] - p1.pos[1]);
  // `Engine._liveLoop` clamps `dt` to 0.1 s (engine.js, read not assumed), so the first frame
  // back cannot deliver the whole absent minute. A robot that has been standing still for the
  // pause has nothing to integrate anyway — which is the belt to the clamp's braces.
  (jump < 0.25 && movedWhileAway < 0.05)
    ? pass('coming back does not teleport the robot', `moved ${movedWhileAway.toFixed(3)} m while away, ${jump.toFixed(3)} m on the resume frame`)
    : fail('coming back does not teleport the robot', `away ${movedWhileAway.toFixed(3)} m, resume jump ${jump.toFixed(3)} m`);

  // =========================================================================================
  // F5 — MOUSELOOK STILL WORKS AFTERWARDS
  // =========================================================================================
  // ⚠️ Through `Input`'s own drag path when there is no lock, which is the branch a player
  // without pointer lock is actually on — not a synthetic write to `cam.yaw`.
  const y0 = (await st()).yaw;
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.mouse.move(900, 360, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(350);
  const y1 = (await st()).yaw;
  Math.abs(y1 - y0) > 0.01
    ? pass('mouselook still works after coming back', `yaw ${y0.toFixed(3)} -> ${y1.toFixed(3)}`)
    : fail('mouselook still works after coming back', 'the camera is dead after a focus round trip');

  // =========================================================================================
  // F6 — THE OTHER EVENT. Minimise / tab switch fires `visibilitychange`, never `blur`.
  // =========================================================================================
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(300);
  const heldAgain = (await st()).keys;
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(250);
  const hidden = await st();
  (heldAgain > 0 && hidden.keys === 0 && hidden.focused === false)
    ? pass('visibilitychange is handled as well as blur', `${heldAgain} keys dropped on minimise, loop paused`)
    : fail('visibilitychange is handled as well as blur', `keys ${heldAgain}->${hidden.keys}, focused=${hidden.focused}`);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.keyboard.up('KeyD').catch(() => {});
  await page.keyboard.up('KeyW').catch(() => {});
  await page.keyboard.up('Space').catch(() => {});

  // =========================================================================================
  // F7 — AND THE WHOLE THING NEVER PAINTED "VIEW … FAILED"
  // =========================================================================================
  // 🚨 `requestPointerLock()` returns a PROMISE and `main.js`'s `unhandledrejection` handler
  // turns a refused lock into a full-screen stack trace over the game. It has happened twice
  // (an embedded frame; iPadOS Safari, which has no Pointer Lock at all), so every lock and
  // exit call added for this slice is `.catch()`-defended and this is the assertion that the
  // defence holds across a whole focus round trip.
  const end = await st();
  !end.failed
    ? pass('no rejected pointer-lock promise took the view down', 'no VIEW FAILED across the round trip')
    : fail('no rejected pointer-lock promise took the view down', 'the error page is up');

  note(`lock prompt now: "${end.prompt || '(none)'}"`);
  await shot('unblock1-focus');
}
