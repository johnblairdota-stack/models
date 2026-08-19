/**
 * DOES FLEEING WORK? — play-critic-4's #2, "once caught, death is near-instant".
 *
 * ⚠️ THIS FILE REPLACES AN EARLIER VERSION WHOSE ANSWER WAS WRONG, AND THE WAY IT WAS WRONG IS
 * THE MOST USEFUL THING IN IT. The old staging put both bodies at `gallery.mid` with the hunter
 * 7 m along -X and then held W. The gallery is 27.2 m along X and **6.7 m along Z**, and W does
 * not drive along the axis the two bodies are separated on — it drives along `cam.yaw`, which
 * `resetRound()` leaves at PI (i.e. -Z). So the "fleeing" player ran 3.4 m, hit the gallery's
 * south wall, and stood there while the hunter walked up. Its reported final separation was
 * 2.36 m, which is not a coincidence: `_arbitrate` enters ATTACK at
 * `reach * (stage*0.35 + 0.8)` = 2.05 * 1.15 = **2.3575 m**. The instrument measured a player
 * pinned exactly on the attack boundary and reported it as "fleeing does not work".
 *
 * Two consequences for anything written here afterwards:
 *   1. A FLEE TEST MUST PROVE THE PLAYER WAS ACTUALLY RUNNING. `Player.update` recovers the
 *      velocity the collision ACTUALLY allowed (`vel = (posAfter - posBefore)/dt`), so
 *      `player.speed` is ground truth: a body jammed into plaster reads ~0 however hard the
 *      key is held. Every trial below reports mean speed against `MOVE.run` and the ratio of
 *      distance travelled to distance possible, and the assertions consume it.
 *   2. THE HEADING MUST BE DERIVED FROM THE STAGING, not assumed. `stage()` computes the run
 *      axis and writes `cam.yaw` (not just `player.aimYaw` — the live loop overwrites
 *      `aimYaw` with `cam.yaw` on the very next frame, so setting only `aimYaw` does nothing).
 *
 * VALIDATION: run with `BREAK=wall`. That re-stages the old geometry — the player facing the
 * 3.4 m wall — and every assertion here must FAIL. A flee test that has only been run against
 * a heading with room in it proves nothing.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/flee-survival.mjs \
 *     --port 5195 --shots
 *   BREAK=wall node harness/playtest.mjs ...   (the assertions must go red)
 */

/** Padded human reaction. The rig itself reacts in 0.05-0.09 s, which no player can. */
const REACT_MS = +(process.env.REACT_MS ?? 350);
/** `wall` re-stages the old broken geometry so the assertions can be seen to fail. */
const BREAK = process.env.BREAK ?? '';
const RUN_TOP = 5.20;   // MOVE.run, mirrored here so the harness does not import the bundle

export default async function fleeSurvival({ page, note, pass, fail, skip, shot, waitFor }) {
  if (!await page.evaluate(() => !!window.__rrr?.engine?.room)) {
    skip('flee', 'engine.room not exposed'); return;
  }

  // ---------------------------------------------------------------- recorder
  await page.evaluate(() => {
    if (window.__fsInstalled) return true;
    window.__fsInstalled = true;
    const e = window.__rrr.engine;
    const limbsOf = (p) => ['shoulderL', 'shoulderR', 'hipL', 'hipR']
      .filter((s) => p.rig.occupant(s) !== 'empty').length;
    let prevState = null, prevLimbs = null, prevPos = null;

    // ⚠️ COUNT THE COMMIT ALARM, because the thing it is most likely to become is wallpaper.
    // The wounded trial below records the hunter crossing the ATTACK reach boundary 130 times
    // in seven seconds — a one-legged player sits exactly on `reach * 1.15` and the state
    // oscillates almost every frame. If the alarm were driven off "entered PURSUE" it would
    // fire 130 times and be worth less than nothing. `HunterAI._commitStep` latches instead
    // and only re-arms below `alertAt`; this is the probe that proves the latch holds under
    // the worst input the game can produce, rather than the tidy staged case.
    const orig = e.hunter.onCommit;
    e.hunter.onCommit = (from, h) => {
      const w = window.__fs;
      if (w) { w.commits++; w.commitAt.push(+(e.elapsed - w.t0).toFixed(2)); }
      orig?.(from, h);
    };

    e.onUpdate((dt) => {
      const w = window.__fs; if (!w) return;
      const p = e.player, h = e.hunter;
      const t = +(e.elapsed - w.t0).toFixed(3);
      const sep = Math.hypot(h.root.position.x - p.pos.x, h.root.position.z - p.pos.z);
      const sp = Math.hypot(p.vel.x, p.vel.z);

      const step = prevPos ? Math.hypot(p.pos.x - prevPos.x, p.pos.z - prevPos.z) : 0;
      w.path += step;
      prevPos = { x: p.pos.x, z: p.pos.z };

      const limbs = limbsOf(p);
      if (w.limbs0 == null) { w.limbs0 = limbs; prevLimbs = limbs; }
      if (prevLimbs != null && limbs < prevLimbs) w.losses.push({ t, sep: +sep.toFixed(2), limbs });
      prevLimbs = limbs;

      if (prevState !== h.state) {
        if (w.firsts[h.state] == null) w.firsts[h.state] = t;
        w.path_.push(`${t}:${prevState}->${h.state}`);
        prevState = h.state;
      }
      // ---- WAS THE BODY FREE TO RUN? Scored over an EARLY WINDOW ONLY, and the window is the
      // point. The first version of this check scored the whole 9 s hold and reported a
      // free-run ratio of 0.41 — because the player crosses the gallery's 19.6 m of clear
      // floor in 3.8 s and then legitimately stands at the far wall with W still held. That
      // is the run-up running out, which is a fact about the ROOM; the question here is
      // whether anything was pinning the body during the ESCAPE. Two different measurements
      // that a single mean silently merges. `wallAt` reports the other one separately.
      if (w.moving) {
        w.moveT += dt;
        if (w.moveT <= 2.5) {
          w.spSum += sp * dt; w.spTime += dt;
          w.spMin = Math.min(w.spMin, sp);
          w.earlyPath += step;
        }
        if (w.wallAt == null && w.moveT > 0.5 && sp < 0.8) w.wallAt = +w.moveT.toFixed(2);
      }
      w.sepMin = Math.min(w.sepMin, sep);
      w.sepEnd = +sep.toFixed(2);
      w.limbsEnd = limbs;
      w.last = t;
      w.downed = !!p.rig.caps.downed;
      if (t - w.lastRow >= 0.25) {
        w.lastRow = t;
        w.rows.push({ t, sep: +sep.toFixed(2), st: h.state, aw: +h.awareness.toFixed(2),
          sp: +sp.toFixed(2), limbs,
          p: [+p.pos.x.toFixed(1), +p.pos.z.toFixed(1)], h: [+h.root.position.x.toFixed(1), +h.root.position.z.toFixed(1)] });
      }
    });
    return true;
  });

  /**
   * Put both bodies on a run axis with real distance behind it.
   *
   * `axis` is +1/-1 along X or Z; the player is placed at `from`, the hunter `sep` metres
   * BEHIND along the same axis, and `cam.yaw` is set so that W drives the player FORWARD along
   * it. Returns the clear run-up the player actually has, measured against the space's own
   * extents — so a staging with no room in it says so instead of being discovered later.
   */
  const stage = (o) => page.evaluate((o) => {
    const e = window.__rrr.engine, r = e.room;
    window.__auto = null; window.__fs = null;
    e.resetRound();
    const sp = r.spaces.find((s) => s.id === o.space);
    const P = { x: o.from[0], z: o.from[1] };
    // forward unit vector
    const fx = o.alongX ? o.dir : 0, fz = o.alongX ? 0 : o.dir;
    e.player.pos.set(P.x, 0, P.z);
    e.player.vel.set(0, 0, 0);
    e.player.shock = 0;
    // ⚠️ `cam.yaw` IS THE ONE THAT MATTERS. `views/game.js` passes
    // `aimYaw: cmd.aimYaw ?? cam.yaw` every live frame and `liveInput` returns no aimYaw, so
    // writing `player.aimYaw` alone is overwritten before the first key is read.
    const yaw = Math.atan2(fx, fz);
    e.player.aimYaw = yaw; e.player.facing = yaw;
    if (e.cam) { e.cam.yaw = yaw; e.cam.pitch = 0; }
    // The hunter directly behind, on the same line — unless `hAt` overrides it, which is what
    // `BREAK=wall` uses to reproduce the old scenario exactly: separated along X, running
    // along Z.
    const H = o.hAt ? { x: o.hAt[0], z: o.hAt[1] } : { x: P.x - fx * o.sep, z: P.z - fz * o.sep };
    e.hunter.root.position.set(H.x, 0, H.z);
    e.hunter.vel.set(0, 0, 0);
    e.hunter.stage = o.hStage ?? 1;
    e.hunter.radius = 0.30 + e.hunter.stage * 0.12;
    for (const s of [1, 2, 3]) e.hunter.rigs[s].root.visible = s === e.hunter.stage;
    // A WOUNDED PLAYER IS A DIFFERENT GAME AND HAS TO BE MEASURED SEPARATELY. `gaitFor` drops
    // to 'limp' at one leg, `speedScaleFor` is 0.44 and `canRun` is false, so the top speed
    // falls from 5.20 to 2.29 — and `HUNTER_SPEED` is 2.05 / 2.70 / 3.35 by stage. Taken as a
    // voluntary detach so the trial does not open with the wound camera shake in it; what is
    // under test is the locomotion, not the feedback.
    for (const s of (o.wound ?? [])) e.player.rig.detach(s, { voluntary: true });
    // resetRound leaves `absorbed` at 2 so the capture loop always shows a growth; here that
    // turns the first strike into a 1.4 s GROW and hides the strike cadence.
    e.hunter.absorbed = e.hunter.stage === 3 ? 7 : e.hunter.stage === 2 ? 3 : 0;
    e.hunter.facing = Math.atan2(P.x - H.x, P.z - H.z);
    e.hunter.scan = 0;
    e.hunter.awareness = 1.0;
    e.hunter.state = 'PURSUE';
    e.hunter.target = e.hunter.candidates?.[0]
      ?? { root: e.player.root, rig: e.player.rig, height: e.player.height };
    e.hunter.lastKnown.copy(e.player.root.position);
    e.hunter.resetCombat();

    // how much clear floor is actually in front of the player, from the space table
    const runUp = o.alongX
      ? (o.dir > 0 ? sp.x1 - P.x : P.x - sp.x0)
      : (o.dir > 0 ? sp.z1 - P.z : P.z - sp.z0);

    window.__fs = { t0: e.elapsed, rows: [], losses: [], firsts: {}, path_: [], path: 0,
      limbs0: null, limbsEnd: null, sepMin: 1e9, sepEnd: null, spSum: 0, spTime: 0,
      spMin: 1e9, earlyPath: 0, moveT: 0, wallAt: null, keyAt: null, until: null,
      commits: 0, commitAt: [],
      moving: false, lastRow: -9, last: 0, downed: false };
    return {
      runUp: +runUp.toFixed(2),
      sep: +Math.hypot(H.x - P.x, H.z - P.z).toFixed(2),
      pSpace: r.spaceAt(e.player.pos)?.id ?? null,
      hSpace: r.spaceAt(e.hunter.root.position)?.id ?? null,
      blocked: r.blocksSight(e.hunter.eye, e.player.root.position.clone().setY(1.0)),
      sockets: ['shoulderL', 'shoulderR', 'hipL', 'hipR'].map((s) => e.player.rig.occupant(s)).join('/'),
    };
  }, o);

  const setMoving = (v) => page.evaluate((v) => {
    const w = window.__fs; if (!w) return;
    w.moving = v;
    if (v && w.keyAt == null) w.keyAt = w.last;   // game time the keys actually went down
  }, v);
  const read = () => page.evaluate(() => { const w = window.__fs; window.__fs = null; return w; });

  /**
   * One trial. `mode`:
   *   stand   the player never touches a key — the control, and the lethality guard
   *   commit  react REACT_MS after the hunter is already committed (staged in PURSUE)
   *   caught  react REACT_MS after the hunter REARS BACK (ATTACK) — the critic's case
   */
  const trial = async (mode, st, seconds = 9) => {
    let held = false;
    if (mode === 'caught') {
      // wait for the rear-back, exactly as diag-fair's reaction phase does
      await waitFor(() => (window.__rrr.engine.hunter.state === 'ATTACK' ? 1 : null),
        { timeout: 12000, every: 60 });
    }
    if (mode !== 'stand') {
      await gameWait(REACT_MS / 1000, 'since');
      await page.keyboard.down('ShiftLeft');
      await page.keyboard.down('KeyW');
      held = true;
      await setMoving(true);
    }
    await gameWait(seconds, 'since');
    if (held) { await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft'); await setMoving(false); }
    return finish(mode);
  };

  /**
   * WAIT IN GAME TIME, NOT WALL TIME — and this correction changed an answer.
   *
   * `Engine._liveLoop` clamps `dt` to 0.1 s, so any frame slower than 100 ms advances the
   * world by less than the wall clock. Headless ANGLE/SwiftShader is exactly that: the first
   * measured pass here asked for an 11 s standing control with `page.waitForTimeout(11000)`
   * and got **5.28 s of game time** — one strike instead of three, because `ATTACK_CADENCE`
   * is 2.35 s and the second strike lands at 5.67. Read as a game number, "the hunter only
   * takes one limb" would have been a fabrication of the test rig's frame rate.
   *
   * The same applies to the reaction delay: `REACT_MS` is a claim about what a PLAYER
   * perceives, and what a player perceives is game time. Waiting for it in wall time on a
   * slow frame gives the player a shorter window than the number says.
   */
  async function gameWait(secs, mode = 'since') {
    await page.evaluate(([s, m]) => {
      const w = window.__fs; if (!w) return;
      w.until = (m === 'since' ? w.last : 0) + s;
    }, [secs, mode]);
    const got = await waitFor(() => {
      const w = window.__fs;
      if (!w || w.until == null) return 1;          // recorder gone: nothing left to wait for
      return w.last >= w.until ? 1 : null;
    }, { timeout: Math.max(8000, secs * 1000 * 8), every: 80 });
    if (!got) note(`⚠ gameWait(${secs}s) timed out in wall time — the page is running far below real time`);
  }

  /** Read the recorder and derive the numbers the report and the assertions both use. */
  const finish = async (mode = 'flee') => {
    const m = await read();
    const meanSp = m.spTime > 0 ? +(m.spSum / m.spTime).toFixed(2) : null;
    const possible = m.spTime > 0 ? m.spTime * RUN_TOP : 0;
    return {
      mode, ...m, meanSp,
      freeRatio: possible > 0 ? +(m.earlyPath / possible).toFixed(2) : null,
      firstLoss: m.losses[0]?.t ?? null,
      sepMin: +m.sepMin.toFixed(2),
      path: +m.path.toFixed(1),
      earlyPath: +m.earlyPath.toFixed(1),
    };
  };

  const report = (tag, st, r) => {
    note(`--- ${tag}  (staged ${st.sep} m apart in ${st.pSpace}, ${st.runUp} m of clear floor ahead,`
      + ` LOS ${st.blocked ? 'BLOCKED' : 'clear'}, sockets ${st.sockets})`);
    note(`    first limb ${r.firstLoss == null ? 'NEVER' : `${r.firstLoss}s`}`
      + ` · limbs ${r.limbsEnd}/${r.limbs0} · losses ${JSON.stringify(r.losses.map((l) => [l.t, l.sep]))}`
      + `${r.downed ? ' · DOWNED' : ''}`);
    note(`    separation: min ${r.sepMin} m -> end ${r.sepEnd} m`
      + ` · player travelled ${r.path} m total`
      + (r.meanSp == null ? ' (never asked to move)'
        : `; first 2.5 s of running covered ${r.earlyPath} m at mean ${r.meanSp} m/s`
          + ` (top ${RUN_TOP}) · free-run ratio ${r.freeRatio} · slowest frame ${(+r.spMin).toFixed(2)} m/s`
          + (r.wallAt == null ? ' · never ran out of floor'
            : ` · ⚠ ran out of floor after ${r.wallAt}s of running`)));
    note(`    states ${r.path_.join(' ')}`
      + (r.keyAt == null ? '' : ` · keys down at game t=${r.keyAt}s`
        + (r.firsts.ATTACK != null ? ` (${(r.keyAt - r.firsts.ATTACK).toFixed(2)}s after the rear-back)` : '')));
    for (const row of r.rows) {
      note(`      t=${String(row.t).padStart(6)} sep ${String(row.sep).padStart(5)} ${row.st.padEnd(6)}`
        + ` aw ${row.aw.toFixed(2)} spd ${String(row.sp).padStart(5)} limbs${row.limbs}`
        + ` P${JSON.stringify(row.p)} H${JSON.stringify(row.h)}`);
    }
  };

  // ------------------------------------------------------------------ arenas
  //
  // Two, on purpose: the gallery's LONG axis (27.2 m of X, a straight sightline the whole way)
  // and the ballroom (27.2 x 15.3, the level's designated chase arena). A single arena cannot
  // tell "fleeing works" apart from "that one room is generous".
  //
  // `BREAK=wall` swaps in the old scenario's geometry — same room, same separation, heading
  // turned 90 degrees into the 6.7 m short axis — so every assertion below can be watched to
  // fail against code that is otherwise unchanged.
  const ARENAS = BREAK === 'wall'
    // The old scenario's exact staging: both at gallery.mid, hunter 7 m along -X, and W
    // driving along -Z because `resetRound()` leaves `cam.yaw` at PI. 3.4 m of floor.
    ? [{ tag: 'OLD STAGING (deliberately broken)', space: 'gallery',
      from: [0.0, -27.6], hAt: [-7.0, -27.6], alongX: false, dir: -1, sep: 7 }]
    : [
      { tag: 'gallery long axis', space: 'gallery', from: [-6.0, -27.6], alongX: true, dir: 1, sep: 7 },
      { tag: 'ballroom long axis', space: 'ballroom', from: [-6.0, -3.0], alongX: true, dir: 1, sep: 7 },
    ];

  const all = [];
  for (const A of ARENAS) {
    const out = { tag: A.tag };
    for (const mode of ['stand', 'commit', 'caught']) {
      const st = await stage(A);
      const r = await trial(mode, st, mode === 'stand' ? 11 : 9);
      out[mode] = { st, r };
      report(`${A.tag} · ${mode.toUpperCase()}`, st, r);
      await shot(`flee-${A.space}-${mode}`);
    }
    all.push(out);
  }

  // -------------------------------------------- part 1b: after the first wound
  //
  // "FLEEING WORKS" IS A CLAIM ABOUT AN INTACT PLAYER, and stated without this it would be
  // an overclaim. `HunterAI._attack` takes sockets in the order shoulderL, shoulderR, hipL,
  // hipR — arms first — so the first two limbs cost nothing but reach, and the player still
  // runs at 5.20. The THIRD is a leg, and `gaitFor` drops to 'limp': `speedScaleFor` 0.44,
  // `canRun` false, top speed 2.29 m/s. By then the hunter has absorbed three parts and is at
  // stage 2, `HUNTER_SPEED[2]` = 2.70. So the same escape run should measurably stop working,
  // and if it does not then growth is not an escalation and the round has no arc.
  {
    const A = { space: 'gallery', from: [-6.0, -27.6], alongX: true, dir: 1, sep: 7 };
    const st = await stage({ ...A, hStage: 2, wound: ['hipR'] });
    const r = await trial('commit', st, 9);
    report('gallery long axis · WOUNDED (one leg, stage-2 hunter) · COMMIT', st, r);
    await shot('flee-wounded');
    // The commit alarm under the worst input the game produces — see the counter's note.
    const flips = (r.path_.length);
    note(`    COMMIT ALARM: fired ${r.commits} time(s) at ${JSON.stringify(r.commitAt)}`
      + ` while the hunter crossed the ATTACK boundary ${flips} times`);
    if (r.commits <= 2) {
      pass('the commit alarm does not become wallpaper',
        `${r.commits} alarm(s) across ${flips} PURSUE/ATTACK transitions in ${r.last}s — the latch holds`);
    } else {
      fail('the commit alarm does not become wallpaper',
        `${r.commits} alarms across ${flips} transitions — it is firing on state changes, not on commitment`);
    }

    const whole = all[0]?.commit?.r;
    note(`    intact-player comparison: mean speed ${whole?.meanSp} m/s and ${whole?.sepEnd} m of final`
      + ` separation, against ${r.meanSp} m/s and ${r.sepEnd} m here`);
    if (!whole) {
      skip('losing a leg is a real escalation', 'no intact-player run to compare against');
    } else if (r.meanSp < whole.meanSp * 0.6 && r.sepEnd < whole.sepEnd) {
      pass('losing a leg is a real escalation',
        `the limp caps the player at ${r.meanSp} m/s against a stage-2 hunter's 2.70, so the same run that opened`
        + ` ${whole.sepEnd} m intact opens ${r.sepEnd} m — running stops being a free answer exactly when growth arrives`);
    } else {
      fail('losing a leg is a real escalation',
        `a one-legged player still made ${r.meanSp} m/s and ended ${r.sepEnd} m clear (intact: ${whole.meanSp} m/s,`
        + ` ${whole.sepEnd} m) — the wound and the growth cost the player nothing`);
    }
  }

  // ---------------------------------------------------- part 2: the real escape
  //
  // OUTPACING IS NOT ESCAPING, AND A STRAIGHT LINE CANNOT BE THE ANSWER. In the trials above
  // the player is faster and gains ground for as long as the floor lasts — but `_sense` keeps
  // `awareness` pinned at 1.0 while the sightline is open, so nothing is ever shaken off; the
  // player simply arrives at the far wall with a lead. The gallery is a 27 m sightline BY
  // DESIGN. So the question this part asks is the one that decides whether the chase has an
  // out at all: run through a DOOR, break line of sight, and does the hunter lose you?
  //
  // Route: gallery.mid -> east through D3 (x = 8.60) -> south down study_e. Two corners, and
  // study_e's east wall is solid from the gallery, so the sightline genuinely closes.
  // Steering uses the portal-aware autopilot from `diag-fair.mjs` — the production input path
  // (real held keys, `cam.yaw` steering), so this measures the game and not a teleport.
  //
  // Skipped under BREAK=wall: that mode exists to make the STRAIGHT-LINE assertions go red,
  // and a route that still works would make the validation run look half-green.
  if (BREAK !== 'wall') {
    await page.evaluate(() => {
      if (window.__fsAutoInstalled) return;
      window.__fsAutoInstalled = true;
      const e = window.__rrr.engine;
      window.__auto = null;
      e.onUpdate(() => {
        const a = window.__auto; if (!a || a.done) return;
        const p = e.player.root.position;
        const wp = a.route[a.i];
        if (!wp) { a.done = true; return; }
        if (Math.hypot(wp[0] - p.x, wp[1] - p.z) < (a.tol ?? 1.4)) {
          a.i++; if (a.i >= a.route.length) a.done = true;
          return;
        }
        const r = e.room;
        let tx = wp[0], tz = wp[1];
        const here = r.spaceAt(p);
        const there = r.spaceAt({ x: wp[0], y: 0, z: wp[1] });
        if (here && there && here.id !== there.id) {
          const path = r.pathPortals(here.id, there.id);
          if (path.length) {
            const c = path[0].centre;
            const alongX = path[0].axis === 'x';
            const off = alongX ? p.z - c.z : p.x - c.x;
            const side = Math.sign(off) || 1;
            const drift = alongX ? Math.abs(p.x - c.x) : Math.abs(p.z - c.z);
            if (a.commit !== path[0].id && drift <= 0.5) { a.commit = path[0].id; a.commitSide = side; }
            if (a.commit !== path[0].id) a.commitSide = null;
            const s2 = a.commit === path[0].id ? -(a.commitSide ?? side) : side;
            if (alongX) { tx = c.x; tz = c.z + s2 * 1.25; } else { tx = c.x + s2 * 1.25; tz = c.z; }
          }
        } else { a.commit = null; a.commitSide = null; }
        if (a.lastSpace !== (here?.id ?? null)) { a.lastSpace = here?.id ?? null; a.commit = null; a.commitSide = null; }
        const yaw = Math.atan2(tx - p.x, tz - p.z);
        if (e.cam) e.cam.yaw = yaw;
        e.player.aimYaw = yaw;
      });
    });

    const st = await stage({ space: 'gallery', from: [0.0, -27.6], alongX: true, dir: 1, sep: 7 });
    await page.evaluate(() => {
      window.__auto = { route: [[8.6, -27.6], [8.6, -18.0], [8.6, -11.0], [12.5, -11.0]],
        i: 0, tol: 1.4, done: false };
    });
    await gameWait(REACT_MS / 1000, 'since');
    await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW');
    await setMoving(true);
    // Long enough for the hunter's own escape clock: `loseAfter` 2.2 s of no contact drops it
    // to SEARCH, and `searchFor` is 9.0 s more before it gives up entirely.
    const lost = await waitFor(() => {
      const s = window.__rrr.engine.hunter.state;
      return (s === 'SEARCH' || s === 'PATROL') ? s : null;
    }, { timeout: 14000, every: 100 });
    const lostAt = await page.evaluate(() => (window.__fs ? window.__fs.last : null));
    await gameWait(1.2, 'since');
    await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
    await setMoving(false);
    await page.evaluate(() => { window.__auto = null; });
    const r = await finish('route');
    report('ESCAPE ROUTE gallery -> D3 -> study_e', st, r);
    await shot('flee-route');
    note(`    contact broken: ${lost ? `hunter dropped to ${lost} at t=${lostAt}s` : 'NEVER — it held contact for the whole run'}`);

    if (r.losses.length === 0 && lost) {
      pass('a chase can be escaped by running a route', `no limb lost; the hunter dropped to ${lost} at t=${lostAt}s, ${r.sepEnd} m behind`);
    } else if (!lost) {
      fail('a chase can be escaped by running a route', `it never lost contact in ${r.last}s of sprinting through two doorways (limbs ${r.limbsEnd}/${r.limbs0})`);
    } else {
      fail('a chase can be escaped by running a route', `contact broke at t=${lostAt}s but ${r.losses.length} limb(s) came off on the way (first at ${r.firstLoss}s)`);
    }
  }

  // ------------------------------------------------------------- assertions
  for (const a of all) {
    const S = a.stand.r, C = a.commit.r, K = a.caught.r;

    // 0. THE MEASUREMENT IS ONLY WORTH ANYTHING IF THE PLAYER WAS ACTUALLY RUNNING.
    // This is the check the old scenario did not have and the reason its answer was wrong.
    const ratios = [C.freeRatio, K.freeRatio];
    if (ratios.some((x) => x == null)) {
      fail(`${a.tag}: the fleeing player was free to run`, 'no movement window was recorded');
    } else if (Math.min(...ratios) >= 0.80) {
      pass(`${a.tag}: the fleeing player was free to run`,
        `first 2.5 s covered ${C.earlyPath}/${K.earlyPath} m at ${C.meanSp}/${K.meanSp} m/s — ${Math.min(...ratios)} of a clear sprint, so nothing was pinning it`);
    } else {
      fail(`${a.tag}: the fleeing player was free to run`,
        `free-run ratio ${ratios.join(' / ')} over the first 2.5 s (slowest frame ${(+C.spMin).toFixed(2)} m/s) — the body was obstructed, so any escape number from this trial is about geometry, not about the chase`);
    }

    // 1. THE HEADLINE. Does reacting to the commitment change the outcome?
    const standLost = (S.limbs0 - S.limbsEnd);
    if (standLost <= 0) {
      fail(`${a.tag}: standing still is punished`,
        `a player who did nothing for ${S.last}s kept all ${S.limbs0} limbs — the encounter is not lethal and nothing below means anything`);
    } else {
      pass(`${a.tag}: standing still is punished`,
        `${standLost} limb(s) gone, first at ${S.firstLoss}s, and it reached ${S.sepMin} m`);
    }
    if (C.losses.length === 0 && C.sepEnd > S.sepEnd + 3) {
      pass(`${a.tag}: fleeing on the commit breaks contact`,
        `intact after ${C.last}s and ${C.sepEnd} m away, against ${S.limbsEnd}/${S.limbs0} limbs at ${S.sepEnd} m standing`);
    } else {
      fail(`${a.tag}: fleeing on the commit breaks contact`,
        `lost ${C.losses.length} limb(s), ended ${C.sepEnd} m away (standing ended ${S.sepEnd} m)`);
    }

    // 2. THE CRITIC'S ACTUAL CASE — already in reach, reacting to the rear-back.
    if (K.losses.length === 0) {
      pass(`${a.tag}: reacting to the rear-back escapes intact`,
        `no limb lost; separation ${K.sepMin} m -> ${K.sepEnd} m over ${K.last}s`);
    } else if (K.losses.length < standLost) {
      fail(`${a.tag}: reacting to the rear-back escapes intact`,
        `lost ${K.losses.length} (standing loses ${standLost}) — running helps but does not save the first limb (first loss ${K.firstLoss}s at ${K.losses[0].sep} m)`);
    } else {
      fail(`${a.tag}: reacting to the rear-back escapes intact`,
        `lost ${K.losses.length} limb(s), same as standing — being caught is unsurvivable by reaction`);
    }
  }
}
