/**
 * CAN THE PLAYER SEE THE HUNTER COMMIT?
 *
 * `flee-survival.mjs` establishes that fleeing WORKS — a player who runs on the commit, or even
 * on the rear-back, keeps every limb and breaks contact. So the surviving half of play-critic-4's
 * "once caught, death is near-instant" is not balance. It is whether the game ever tells you the
 * moment has arrived, and this file measures that instead of asserting it.
 *
 * METHOD, and the control is the whole design. Both bodies are pinned in the gallery seven
 * metres apart with the camera on the hunter; `awareness` is FORCED to a value each frame and
 * the real state machine is left to decide the state from it, so nothing is faked except the
 * one number under test. Then the frame is photographed at each level and consecutive levels
 * are diffed.
 *
 * ⚠️ THE NOISE FLOOR IS MANDATORY. `views/game.js` breathes the key light on `sin(t*2.1)` and
 * `_setEyeDrive` throbs the faceplate, so two photographs of the SAME awareness are never
 * identical. Without measuring that first, any diff at the commit threshold could be the
 * lighting. The first pair captured is therefore a same-awareness control, and every reported
 * step is quoted against it.
 *
 * THE ASSERTION: crossing `commitAt` — the instant the thing decides to run you down — must
 * change the frame MORE than the approach to it does. If "it is thinking about it" and "it is
 * coming" photograph the same, the player has nothing to react to, and standing still (which is
 * what the critic did) is the reasonable move.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/commit-tell.mjs \
 *     --port 5195 --shots
 *
 * VALIDATION: run with `BREAK=blind`, which forces the commit tell OFF (`__tellOff`) so the
 * frame at PURSUE is drawn exactly as the frame at high STALK. The assertion must go red.
 */

const BREAK = process.env.BREAK ?? '';

export default async function commitTell({ page, note, pass, fail, skip, shot, snap }) {
  if (!await page.evaluate(() => !!window.__rrr?.engine?.room)) {
    skip('commit tell', 'engine.room not exposed'); return;
  }

  // ------------------------------------------------------------------ rig
  await page.evaluate(() => {
    if (window.__ctInstalled) return;
    window.__ctInstalled = true;
    const e = window.__rrr.engine;
    window.__ct = null;
    // AFTER the game's own updater, so what this writes is what the next frame's `_sense`,
    // `_arbitrate` and `_setEyeDrive` read. Only `awareness` and the two bodies' transforms
    // are forced; the state ladder is left to derive the state itself.
    e.onUpdate(() => {
      const c = window.__ct; if (!c) return;
      const h = e.hunter, p = e.player;
      h.root.position.set(c.h[0], 0, c.h[1]);
      h.vel.set(0, 0, 0);
      h.facing = Math.atan2(p.pos.x - h.root.position.x, p.pos.z - h.root.position.z);
      h.scan = 0;
      h.awareness = c.aw;
      c.state = h.state;
      c.eye = h._eyeMat?.[h.stage]?.emissiveIntensity ?? null;
      c.flare = +(h.flare?.intensity ?? 0).toFixed(2);
      c.threat = +h.threat.toFixed(3);
    });

    // In-page image diff. Two screenshots go in as data URLs and come back as one number set,
    // so nothing has to be written to disk or decoded in node.
    window.__imgDiff = async (a, b) => {
      const load = (d) => new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = d;
      });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = Math.min(ia.width, ib.width), hh = Math.min(ia.height, ib.height);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = hh;
      const x = cv.getContext('2d', { willReadFrequently: true });
      x.drawImage(ia, 0, 0); const A = x.getImageData(0, 0, w, hh).data;
      x.clearRect(0, 0, w, hh);
      x.drawImage(ib, 0, 0); const B = x.getImageData(0, 0, w, hh).data;
      let sum = 0, n = 0, changed = 0, max = 0;
      for (let i = 0; i < A.length; i += 4) {
        const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
        sum += d; n++;
        if (d > 10) changed++;
        if (d > max) max = d;
      }
      return { mean: +(sum / n).toFixed(3), pct: +(100 * changed / n).toFixed(2), max };
    };
  });

  // Player at gallery x = -4 facing WEST down the long axis; hunter 7 m away at x = -11, in
  // frame and unobstructed. `gallery` runs x -13.60..13.60 at z -31.00..-24.30.
  const P = [-4.0, -27.6], H = [-11.0, -27.6];
  await page.evaluate(([P, H]) => {
    const e = window.__rrr.engine;
    e.resetRound();
    e.player.pos.set(P[0], 0, P[1]);
    e.player.vel.set(0, 0, 0);
    const yaw = Math.atan2(H[0] - P[0], H[1] - P[1]);
    e.player.aimYaw = yaw; e.player.facing = yaw;
    if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = -0.02; }
    e.hunter.stage = 1; e.hunter.radius = 0.42; e.hunter.absorbed = 0;
    e.hunter.resetCombat();
    // ⚠️ PIN THE RENDER SCALE. `Engine._liveLoop` nudges `pipeline.renderScale` by 2% a frame
    // toward the frame budget, so the whole image is resampled whenever the frame cost moves —
    // which it does the moment the camera turns and a different part of the room is on screen.
    // That resamples EVERY pixel by a small amount and is indistinguishable from a real change
    // in a mean-|Δ| diff. Any A/B screenshot instrument on this engine has to turn it off.
    e.opts.dynamicRes = false;
    e.pipeline.renderScale = 1.0;
    window.__ct = { h: H, aw: 0, state: null, eye: null, flare: 0, threat: 0 };
  }, [P, H]);

  // ⚠️ SETTLE BEFORE THE CONTROL, AND THIS COST A WHOLE PASS. The first version photographed
  // the control pair 1.4 s after staging and measured a noise floor of **81.3 mean |Δ| over
  // 99.3% of pixels** — a number that would have swallowed any real tell. Looking at the two
  // pictures explained it in one glance: `ThirdPersonCamera` springs its boom and its look
  // target (`_pos.lerp` / `_look.lerp`), and `resetRound()` also fires a place caption, so the
  // first photograph was of a wall while the second was of the room. The noise floor was the
  // camera arriving, not the lighting.
  await page.waitForTimeout(3000);

  // ⚠️ THE VALIDATION RUN, AND IT REVERTS THE FIX FROM OUTSIDE ON PURPOSE. There is no test
  // hook in the shipped code: shadowing `_commitStep` with a no-op on the instance is a
  // complete revert of all three delivery channels at once, because all three hang off the
  // latch it maintains — `onCommit` never fires (no callout, no vignette punch), `committed`
  // stays false (no chase mode), and `_commitFlash` stays 0 (no eye or eye-light punch, since
  // `_integrate` multiplies both by it). With it stubbed this file must report the same FAIL
  // it reported before the fix existed.
  //
  // ⚠️ AND THE FIRST VERSION OF THIS REVERT DID NOT REVERT. It zeroed `_commitFlash` from an
  // updater added AFTER the game's own — but `_integrate` has already consumed the flash by
  // then, and `flare.intensity` decays at only 26/s, so a single unzeroed frame at
  // `COMMIT_FLARE` left a 0.65 s tail. The "broken" build still measured an eye light of 8.87
  // and the facing assertion still passed. A revert has to be checked as carefully as a fix.
  if (BREAK === 'blind') {
    await page.evaluate(() => {
      const h = window.__rrr.engine.hunter;
      h._commitStep = () => {};
      h._committed = false; h._commitFlash = 0;
    });
    note('BREAK=blind — the commit latch is stubbed out at runtime; the assertions below MUST fail.');
  }

  /** Hold an awareness for `settle` frames, then photograph the frame. */
  const at = async (aw, tag, settle = 1400) => {
    await page.evaluate((aw) => { window.__ct.aw = aw; }, aw);
    await page.waitForTimeout(settle);
    const png = await snap(tag);
    const st = await page.evaluate(() => {
      const c = window.__ct;
      return { state: c.state, eye: c.eye == null ? null : +c.eye.toFixed(2), flare: c.flare, threat: c.threat };
    });
    if (png) {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const path = await import('node:path');
      const dir = path.join(process.cwd(), 'progress/playtest');
      await mkdir(dir, { recursive: true }).catch(() => {});
      await writeFile(path.join(dir, `game.play.tell-${tag}.png`), png);
    }
    return { aw, tag, png, ...st };
  };

  const diff = async (a, b) => page.evaluate(([x, y]) => window.__imgDiff(x, y),
    [`data:image/png;base64,${a.png.toString('base64')}`, `data:image/png;base64,${b.png.toString('base64')}`]);

  // ---------------------------------------------------------------- capture
  // 0.00 twice = the NOISE FLOOR (breathing lights, faceplate throb, gait idle).
  // 0.30 ALERT · 0.60 STALK · 0.97 high STALK · 1.00 PURSUE — the last pair is the one that
  // matters, and it is deliberately the SMALLEST step in awareness of the four.
  //
  // ⚠️ THREE CONTROLS, NOT TWO, AND THE FLOOR IS THE WORSE OF THE TWO PAIRS. The key light
  // breathes on `sin(t*2.1)` and the faceplate throbs on its own clock, so a single same-state
  // pair can land on a quiet phase and understate the floor. Measured across runs it moved
  // between 1.8% and 4.8% of pixels; taking the worse pair is the honest bound.
  const LEVELS = [
    ['ctl-a', 0.00], ['ctl-b', 0.00], ['ctl-c', 0.00],
    ['alert', 0.30], ['stalk', 0.60], ['brink', 0.97], ['commit', 1.00],
  ];
  const shots = [];
  for (const [tag, aw] of LEVELS) shots.push(await at(aw, tag));

  for (const s of shots) {
    note(`aw ${s.aw.toFixed(2)} -> ${String(s.state).padEnd(6)} · faceplate emissive ${s.eye ?? 'n/a'}`
      + ` · eye light ${s.flare} · hud threat ${s.threat}`);
  }
  if (shots.some((s) => !s.png)) { skip('the commit is visible', 'a screenshot failed'); return; }

  const n1 = await diff(shots[0], shots[1]);
  const n2 = await diff(shots[1], shots[2]);
  const noise = n1.mean >= n2.mean ? n1 : n2;
  note(`NOISE FLOOR (worse of two same-awareness pairs): mean |Δ| ${noise.mean}, ${noise.pct}% of pixels,`
    + ` max ${noise.max}  [pairs: ${n1.mean} / ${n2.mean}]`);

  const steps = [];
  for (let i = 3; i < shots.length; i++) {
    const d = await diff(shots[i - 1], shots[i]);
    steps.push({ from: shots[i - 1], to: shots[i], d });
    note(`STEP ${shots[i - 1].tag} (aw ${shots[i - 1].aw.toFixed(2)}, ${shots[i - 1].state})`
      + ` -> ${shots[i].tag} (aw ${shots[i].aw.toFixed(2)}, ${shots[i].state}):`
      + ` mean |Δ| ${d.mean} (${(d.mean / Math.max(noise.mean, 0.001)).toFixed(1)}x noise),`
      + ` ${d.pct}% of pixels, max ${d.max}`);
  }
  const brink = shots[shots.length - 2];
  const approach = steps.slice(0, -1);
  const biggestApproach = approach.reduce((a, b) => (b.d.mean > a.d.mean ? b : a));

  /**
   * PHOTOGRAPH THE MOMENT, NOT WHAT IT SETTLES INTO — and this correction changed the verdict.
   *
   * The settled pairs above are taken 1.4 s after each crossing. A tell that IS an instant has
   * decayed by then, so those frames only show whatever steady state the commit leaves behind
   * — and that steady state is a fast pulse, so a single settled photograph lands on a random
   * phase of it. Measured back to back, the same settled step reported 9.2 and then 5.0 mean
   * |Δ| purely on phase. Judging a one-shot flash by a frame taken after it is over is the
   * same class of error as `_animate` drawing the attack anticipation after the strike.
   *
   * So: re-arm the latch (awareness below `alertAt` — see `HunterAI._commitStep`), cross again,
   * and photograph 220 ms in. Twice, and the second one is the case that decides whether the
   * fix is worth anything: WITH THE CAMERA TURNED AWAY. A player who is fleeing has their back
   * to the hunter, so the eye flash and the posture are off screen and only the screen-space
   * channels survive. A commit tell that only works while you are looking at it cannot be the
   * thing that tells you to stop looking at it.
   */
  const punchAt = async (tag, yaw) => {
    await page.evaluate((y) => {
      const e = window.__rrr.engine;
      window.__ct.aw = 0.0;
      if (y != null && e.cam) { e.cam.yaw = y; e.player.aimYaw = y; e.player.facing = y; }
    }, yaw);
    await page.waitForTimeout(2800);                 // re-arm, and let the boom swing round
    // ⚠️ A NOISE FLOOR PER ORIENTATION, because the floor is not a property of the game — it is
    // a property of what is on screen. Judged against the facing-forward floor, the away-facing
    // punch scored 1.7x and PASSED in a build with the tell reverted: a different view of the
    // room breathes differently. Two same-awareness photographs are taken in THIS orientation
    // and the comparison is made against them.
    const b1 = await at(0.97, `${tag}-b1`, 1200);
    const b2 = await at(0.97, `${tag}-b2`, 1200);
    await page.evaluate(() => { window.__ct.aw = 1.0; });
    await page.waitForTimeout(220);
    const png = await snap(tag);
    const st = await page.evaluate(() => {
      const c = window.__ct;
      return { eye: c.eye == null ? null : +c.eye.toFixed(2), flare: c.flare };
    });
    if (!png || !b1.png || !b2.png) return null;
    const { mkdir, writeFile } = await import('node:fs/promises');
    const pathMod = await import('node:path');
    await mkdir(pathMod.join(process.cwd(), 'progress/playtest'), { recursive: true }).catch(() => {});
    await writeFile(pathMod.join(process.cwd(), 'progress/playtest', `game.play.tell-${tag}.png`), png);
    const local = await diff(b1, b2);
    const d = await diff(b2, { png });
    note(`PUNCH ${tag} (220 ms after the crossing, from the brink): mean |Δ| ${d.mean}`
      + ` (${(d.mean / Math.max(local.mean, 0.001)).toFixed(1)}x this view's own floor of ${local.mean}),`
      + ` ${d.pct}% of pixels vs the floor's ${local.pct}%, max ${d.max}`
      + ` · faceplate emissive ${st.eye} (ramp ceiling ${shots[shots.length - 1].eye}) · eye light ${st.flare}`);
    return { ...d, floor: local };
  };

  const facingYaw = Math.atan2(H[0] - P[0], H[1] - P[1]);
  const dFacing = await punchAt('punch-facing', facingYaw);
  const dAway = await punchAt('punch-away', facingYaw + Math.PI);

  // ------------------------------------------------------------- assertion
  note(`The commit step moves awareness by ${(1.00 - brink.aw).toFixed(2)};`
    + ` the largest approach step moves it by ${(biggestApproach.to.aw - biggestApproach.from.aw).toFixed(2)}.`
    + ' A discrete tell should invert that.');

  if (!dFacing) {
    skip('the commit is visible on screen', 'the punch frames could not be captured');
  } else if (dFacing.mean <= dFacing.floor.mean * 1.6) {
    fail('the commit is visible on screen',
      `crossing commitAt changed the frame by ${dFacing.mean} mean |Δ| against this view's own ${dFacing.floor.mean} noise floor`
      + ' — indistinguishable from the lights breathing, so nothing on screen says "it has committed"');
  } else if (dFacing.mean <= biggestApproach.d.mean) {
    fail('the commit is visible on screen',
      `crossing commitAt (${dFacing.mean}) is a SMALLER visual event than`
      + ` ${biggestApproach.from.tag}->${biggestApproach.to.tag} (${biggestApproach.d.mean}), even though it is a`
      + ' smaller change in awareness — every channel is a continuous ramp, so there is no moment to react to');
  } else {
    pass('the commit is visible on screen',
      `${dFacing.mean} mean |Δ| over ${dFacing.pct}% of pixels — ${(dFacing.mean / Math.max(dFacing.floor.mean, 0.001)).toFixed(1)}x this view's`
      + ` own noise floor and larger than any step on the approach (${biggestApproach.d.mean}), despite being the smallest change in awareness`);
  }

  if (!dAway) {
    skip('the commit reaches a player who is facing away', 'the punch frame could not be captured');
  } else if (dAway.mean > dAway.floor.mean * 1.6) {
    pass('the commit reaches a player who is facing away',
      `${dAway.mean} mean |Δ| over ${dAway.pct}% of pixels with the hunter entirely off screen`
      + ` (${(dAway.mean / Math.max(dAway.floor.mean, 0.001)).toFixed(1)}x this view's own floor) — the tell survives the one posture a fleeing player is in`);
  } else {
    fail('the commit reaches a player who is facing away',
      `only ${dAway.mean} mean |Δ| against this view's own ${dAway.floor.mean} noise floor with the hunter off screen`
      + ' — the tell only works while you are looking at the thing it is telling you to run from');
  }
}
