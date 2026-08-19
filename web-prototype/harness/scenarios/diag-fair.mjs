/**
 * DIAGNOSTIC — play-critic-3's two findings, reproduced and instrumented.
 *
 * Not an acceptance gate: this is the microscope. The gate lives in `mansion.mjs` (A5 for the
 * opening, A13 for close quarters). Run one part at a time so a measurement is never sharing
 * a page with the thing it is measuring:
 *
 *   DIAG=route  node harness/playtest.mjs --view game.play --script harness/scenarios/diag-fair.mjs --port 5193 --shots
 *   DIAG=melee  node harness/playtest.mjs --view game.play --script harness/scenarios/diag-fair.mjs --port 5193
 *   DIAG=sweep  node harness/playtest.mjs --view game.play --script harness/scenarios/diag-fair.mjs --port 5193
 *
 * `route` walks the two candidate openings — the builder's measured 3-anchor route and the
 * natural eastward continuation into study_e — with a 10 Hz recorder on BOTH bodies, so the
 * question "why did it converge" is answered by a trace rather than by arithmetic.
 *
 * `melee` stages the same 5 m PURSUE start N times and records the ATTACK pipeline's state ON
 * THE FRAME IT ENTERS: what the swing timer already held, the stun economy, the sight gate and
 * the separation. The critic measured the OUTCOMES diverging; this measures the inputs.
 *
 * `sweep` prices DISTANCE. It stands both bodies in the gallery — the one space long enough to
 * hold a 24 m sightline — at 8/12/16/20/24 m with the hunter pinned, its head locked on the
 * player and the player silent, then reports time-to-ALERT and time-to-PURSUE and the MEASURED
 * awareness slope at each range. Everything else in the game is held still on purpose: the
 * question "does distance buy the player anything" is a question about one number's shape, and
 * a patrolling hunter whose nose swings on its own schedule answers it with luck instead.
 */

const PART = process.env.DIAG ?? 'route';
/** Padding added to the rig's own ~0.06 s so a "reaction" is a human one. See `meleePart`. */
const REACT_MS = +(process.env.REACT_MS ?? 250);

export default async function diag({ page, note, pass, fail, skip, shot, waitFor }) {
  const ok = await page.evaluate(() => !!window.__rrr?.engine?.room);
  if (!ok) { skip('diag', 'engine.room not exposed'); return; }

  // ---------------------------------------------------------------------- shared rig
  // The autopilot is `mansion.mjs`'s, copied deliberately: it is the production input path
  // (real keys, `cam.yaw` steering, portal-aware) and a diagnostic that steered differently
  // would be measuring a different game from the one the gate measures.
  await page.evaluate(() => {
    if (window.__autoInstalled) return true;
    window.__autoInstalled = true;
    const e = window.__rrr.engine;
    window.__auto = null; window.__pin = null;
    e.onUpdate(() => { if (window.__pin) { e.hunter.root.position.copy(window.__pin); e.hunter.vel.set(0, 0, 0); } });
    e.onUpdate(() => {
      const a = window.__auto; if (!a || a.done) return;
      const p = e.player.root.position;
      const wp = a.route[a.i];
      if (!wp) { a.done = true; return; }
      const d = Math.hypot(wp[0] - p.x, wp[1] - p.z);
      if (d < (a.tol ?? 1.4)) {
        a.i++;
        if (a.i >= a.route.length) { if (a.loop) a.i = 0; else a.done = true; }
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
    return true;
  });

  const anchorsXZ = (...names) => page.evaluate((ns) => {
    const r = window.__rrr.engine.room;
    return ns.map((n) => { const a = r.anchor(n); return a ? [+a.x.toFixed(2), +a.z.toFixed(2)] : null; });
  }, names);
  const drive = (route, o = {}) => page.evaluate(([route, o]) =>
    (window.__auto = { route, i: 0, tol: o.tol ?? 1.5, loop: !!o.loop, done: false }, true), [route, o]);
  const holdWalk = async (ms, run = false) => {
    if (run) await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(ms);
    await page.keyboard.up('KeyW');
    if (run) await page.keyboard.up('ShiftLeft');
  };

  // =========================================================================
  if (PART === 'route') await routePart();
  else if (PART === 'hud') await hudPart();
  else if (PART === 'sweep') await sweepPart();
  else await meleePart();

  // -------------------------------------------------------------------------
  /**
   * THE DISTANCE SWEEP — what a metre of separation is worth, in seconds.
   *
   * Staging, and every part of it is deliberate:
   *  · THE GALLERY, along its long axis at z = -27.6. It is the only space with 24 m of clear
   *    floor, and it is the space the level's whole "you see it first" beat is built on (A3).
   *  · THE HUNTER IS PINNED and its head is LOCKED on the player (`facing` at the target,
   *    `scan` zeroed) every frame AFTER the AI has run. Left alone, `_scanStep` sweeps the
   *    sight cone +-1.26 rad on its own clock, so the same distance measured twice returns two
   *    different answers depending on where the sweep happened to be — that is exactly the
   *    "wake distance was luck, not range" defect `rules.js` documents. Locking it turns the
   *    measurement into a property of the gain curve, which is the thing under test.
   *  · THE PLAYER STANDS STILL, so `noise` is 0 and the hearing path contributes nothing. This
   *    isolates SIGHT. Hearing is measured by feel-b beats 1-5 and is not re-litigated here.
   *  · `blocksSight` and the FOV dot are recorded per range, so a row that did not actually
   *    have a sightline says so instead of quietly reporting a slow ramp.
   *
   * Reported per range: t(ALERT), t(STALK), t(PURSUE), and the measured dAwareness/dt. The
   * slope is the honest number — the thresholds are just where it crosses.
   */
  async function sweepPart() {
    const DISTS = (process.env.DISTS ?? '4,8,12,16,20,24').split(',').map(Number);
    const TIMEOUT = +(process.env.SWEEPMS ?? 40000);

    const ready = await page.evaluate(() => {
      const e = window.__rrr.engine;
      if (window.__swInstalled) return true;
      window.__swInstalled = true;
      // Runs AFTER the game updater (and after `__pin`), so what it writes is what `_scanStep`
      // and `_sense` read on the NEXT frame. `_scanStep` eases `scan` toward its sweep at
      // 3.2/s, so one frame of drift from 0 is ~5% of 1.26 rad — the dot against the target
      // stays above 0.998 where the cone needs 0.4976.
      e.onUpdate(() => {
        const s = window.__sw; if (!s) return;
        const h = e.hunter, p = e.player;
        h.facing = Math.atan2(p.root.position.x - h.root.position.x, p.root.position.z - h.root.position.z);
        h.scan = 0;
        const t = e.elapsed - s.t0;
        if (s.states[h.state] == null) s.states[h.state] = +t.toFixed(3);
        s.sepMin = Math.min(s.sepMin ?? 1e9,
          Math.hypot(h.root.position.x - p.root.position.x, h.root.position.z - p.root.position.z));
        if (t - s.lastRow >= 0.1) {
          s.lastRow = t;
          s.rows.push({ t: +t.toFixed(2), aw: +h.awareness.toFixed(4), st: h.state });
        }
        s.last = +t.toFixed(2);
      });
      return true;
    });
    if (!ready) { skip('sweep', 'could not install the sweep recorder'); return; }

    // TWO PASSES, because they answer two different questions and only reporting one of them
    // would overstate the fix. PINNED holds the hunter still and reads the CURVE. FREE lets it
    // behave — and STALK closes at half speed, so the confirm rate rises under the hunter's own
    // feet and a player gets meaningfully less warning than the curve alone promises. The
    // second number is the one a critic should judge.
    const PASSES = [{ tag: 'pinned', pin: true, dists: DISTS },
      { tag: 'free', pin: false, dists: DISTS.filter((d, i) => i % 2 === 1) }];
    const table = [];
    for (const passSpec of PASSES) {
    for (const d of passSpec.dists) {
      const set = await page.evaluate(([dd, pin]) => {
        const e = window.__rrr.engine, r = e.room;
        window.__auto = null; window.__pin = null; window.__sw = null;
        e.resetRound();
        // West end of the gallery for the player, the hunter dd metres east along the same
        // line. gallery spans x -13.60..13.60 at z -31.00..-24.30, so 24 m fits with room.
        // Built from the gallery.west anchor rather than from bare literals, so a floor-plan
        // change moves the probe with the room instead of standing it inside a wall.
        const P = r.anchor('gallery.west');
        P.x = -12.60;
        const px = P.x, pz = P.z;
        e.player.pos.copy(P);
        e.player.vel.set(0, 0, 0);
        e.player.facing = Math.PI / 2; e.player.aimYaw = Math.PI / 2;
        if (e.cam) { e.cam.yaw = Math.PI / 2; e.cam.pitch = 0; }
        const H = { x: px + dd, z: pz };
        e.hunter.root.position.set(H.x, 0, H.z);
        e.hunter.vel.set(0, 0, 0);
        e.hunter.stage = 1; e.hunter.radius = 0.42; e.hunter.absorbed = 0;
        e.hunter.state = 'PATROL'; e.hunter.awareness = 0; e.hunter.target = null;
        e.hunter.contact = 99; e.hunter.scan = 0;
        e.hunter.facing = Math.atan2(px - H.x, pz - H.z);
        if (pin) window.__pin = e.hunter.root.position.clone();
        window.__sw = { t0: e.elapsed, rows: [], states: {}, lastRow: -9, last: 0, sepMin: 1e9 };
        const to = { x: px - H.x, z: pz - H.z };
        const len = Math.hypot(to.x, to.z);
        const dot = (Math.sin(e.hunter.facing) * to.x + Math.cos(e.hunter.facing) * to.z) / len;
        return {
          sep: +len.toFixed(2),
          blocked: r.blocksSight(e.hunter.eye, e.player.root.position.clone().setY(1.0)),
          dot: +dot.toFixed(3),
          pSpace: r.spaceAt(e.player.root.position)?.id ?? null,
          hSpace: r.spaceAt(e.hunter.root.position)?.id ?? null,
          limbs: e.player.rig.caps.arms + e.player.rig.caps.legs,
        };
      }, [d, passSpec.pin]);

      // Wait for PURSUE, or give up. The player never touches a key: `noise` decays to 0 and
      // stays there, so anything that happens here happened because the hunter SAW it.
      await waitFor(() => (window.__rrr.engine.hunter.state === 'PURSUE'
        || window.__rrr.engine.hunter.state === 'ATTACK') ? 1 : null,
      { timeout: TIMEOUT, every: 100 });
      const m = await page.evaluate(() => {
        const s = window.__sw; window.__sw = null; window.__pin = null;
        return s;
      });
      // MEASURED SLOPE, not the one the table says. Fitted between the first sample at or after
      // 0.30 s (past the frame the staging wrote) and the last one still below 0.90 awareness
      // (past that the clamp at 1.0 flattens it and the fit reads low).
      const a = m.rows.find((r) => r.t >= 0.30 && r.aw > 0);
      const bRows = m.rows.filter((r) => r.aw < 0.90 && r.t > (a?.t ?? 0));
      const b = bRows[bRows.length - 1];
      const slope = (a && b && b.t > a.t) ? +((b.aw - a.aw) / (b.t - a.t)).toFixed(3) : null;
      const row = { pass: passSpec.tag, d, sep: set.sep, blocked: set.blocked, dot: set.dot,
        alert: m.states.ALERT ?? null, stalk: m.states.STALK ?? null,
        pursue: m.states.PURSUE ?? null, attack: m.states.ATTACK ?? null,
        closed: +(set.sep - Math.min(set.sep, m.sepMin)).toFixed(1),
        slope, last: m.last, awEnd: m.rows.length ? m.rows[m.rows.length - 1].aw : 0 };
      table.push(row);
      note(`[${passSpec.tag}] d=${String(d).padStart(2)} m (sep ${set.sep}, ${set.pSpace}<-${set.hSpace}, blocked=${set.blocked}, fov dot ${set.dot}, limbs ${set.limbs})`
        + ` -> ALERT ${row.alert ?? 'never'}s · STALK ${row.stalk ?? 'never'}s · PURSUE ${row.pursue ?? 'never'}s`
        + ` · measured gain ${slope ?? 'n/a'}/s · aw ended ${row.awEnd} after ${m.last}s`
        + (passSpec.pin ? '' : ` · it closed ${row.closed} m while deciding`));
      if (passSpec.pin && d === DISTS[DISTS.length - 1]) await shot('sweep-far');
      if (passSpec.pin && d === DISTS[0]) await shot('sweep-near');
    }
    }

    note('SWEEP TABLE  pass | d(m) | t ALERT | t PURSUE | ALERT->PURSUE | measured gain/s');
    for (const r of table) {
      const win = (r.alert != null && r.pursue != null) ? +(r.pursue - r.alert).toFixed(2) : null;
      note(`   ${r.pass.padEnd(6)} | ${String(r.d).padStart(4)} | ${String(r.alert ?? '-').padStart(7)} | ${String(r.pursue ?? '-').padStart(8)}`
        + ` | ${String(win ?? '-').padStart(13)} | ${String(r.slope ?? '-').padStart(15)}`);
    }

    // ---- the assertion the whole slice exists for ----------------------------------------
    // Not "slower everywhere" — a RATIO. The near end must stay fast and the far end must cost
    // the hunter multiples of it, measured on the same instrument in the same run. Judged on
    // the PINNED pass: it is the controlled one, and mixing a closing hunter into the ratio
    // would price the curve and the stalk together and attribute both to the curve.
    const usable = table.filter((r) => r.pass === 'pinned' && !r.blocked && r.alert != null && r.pursue != null);
    if (usable.length < 2) {
      skip('distance buys warning', `only ${usable.length} usable range(s) — the rest never committed or had no sightline`);
    } else {
      const near = usable[0], far = usable[usable.length - 1];
      const wn = +(near.pursue - near.alert).toFixed(2), wf = +(far.pursue - far.alert).toFixed(2);
      const ratio = wn > 0 ? +(wf / wn).toFixed(2) : null;
      note(`RATIO: ALERT->PURSUE is ${wf}s at ${far.d} m against ${wn}s at ${near.d} m — ${ratio}x`);
      if (ratio != null && ratio >= 3.0) pass('distance buys warning', `${ratio}x more warning at ${far.d} m than at ${near.d} m (${wf}s vs ${wn}s)`);
      else fail('distance buys warning', `only ${ratio}x (${wf}s at ${far.d} m vs ${wn}s at ${near.d} m) — distance is not paying`);
      if (wn <= 1.6) pass('knife range is still lethal', `ALERT->PURSUE at ${near.d} m is ${wn}s`);
      else fail('knife range is still lethal', `ALERT->PURSUE at ${near.d} m has grown to ${wn}s — the near encounter went mushy`);
    }
    const blind = table.filter((r) => r.pursue == null && !r.blocked);
    if (blind.length) note(`NOTE: it never committed at ${blind.map((r) => `${r.d} m`).join(', ')} inside ${TIMEOUT / 1000}s of unbroken sight`);
  }

  // -------------------------------------------------------------------------
  /**
   * THE CALLOUT SLOT UNDER CONTENTION — play-critic-3's third finding.
   *
   * Three things write one line of text and the critic caught two collisions in live play: a
   * room caption cut "RIGHT ARM TORN OFF" to 1.0 s of its designed 1.9 s, and a multi-hit kill
   * smeared four limb losses into one flicker. This drives both on purpose and reads the slot
   * AND the queue at each beat, with a screenshot of every one — an assertion about what is on
   * screen has to be checkable by looking at a picture of the screen.
   */
  async function hudPart() {
    const state = () => page.evaluate(() => window.__rrr.engine.gameHud._msgState());
    const hud = (fn, ...a) => page.evaluate(([f, args]) => {
      const h = window.__rrr.engine.gameHud;
      h[f](...args);
      return true;
    }, [fn, a]);
    if (!await page.evaluate(() => !!window.__rrr.engine.gameHud?._msgState)) {
      skip('hud priority', 'engine.gameHud._msgState is not exposed'); return;
    }

    // ---- 1. a caption must not cut a wound short ----------------------------------------
    await hud('setPlace', 'THE BALLROOM');
    await page.waitForTimeout(300);
    const before = await state();
    await hud('flash', 'shoulderR');            // the wound arrives mid-caption
    await page.waitForTimeout(120);
    const during = await state();
    await shot('hud-1-wound-over-caption');
    note(`1. caption then wound: caption was "${before.text}" (rank ${before.rank}) -> slot now "${during.text}" (rank ${during.rank}); queue ${JSON.stringify(during.queue)}`);
    if (during.rank === 3 && /TORN OFF/.test(during.text ?? '')) {
      pass('a wound takes the slot from a place caption', `"${before.text}" -> "${during.text}", caption ${during.queue.length ? 'deferred, not dropped' : 'dropped'}`);
    } else fail('a wound takes the slot from a place caption', `slot holds "${during.text}" rank ${during.rank}`);

    // ---- 2. the reverse must NOT happen --------------------------------------------------
    await hud('setPlace', 'THE CHAPEL');        // a caption arriving mid-wound
    await page.waitForTimeout(120);
    const stomp = await state();
    await shot('hud-2-caption-cannot-stomp');
    note(`2. caption during wound: slot "${stomp.text}" (rank ${stomp.rank}, t=${stomp.t}s of ${stomp.dur}s); queue ${JSON.stringify(stomp.queue)}`);
    if (stomp.rank === 3) pass('a place caption cannot cut a wound short', `wound still on screen at t=${stomp.t}s of ${stomp.dur}s; caption waits in the queue`);
    else fail('a place caption cannot cut a wound short', `slot holds "${stomp.text}" rank ${stomp.rank} — this is the bug the critic measured`);

    // ---- 3. the multi-hit kill -----------------------------------------------------------
    // Four limbs in under a second is the case that used to smear. Each has to get its turn.
    await page.evaluate(() => { const h = window.__rrr.engine.gameHud; h.say('', '#000', 0.01, 3); });
    await page.waitForTimeout(60);
    for (const s of ['shoulderL', 'shoulderR', 'hipL', 'hipR']) { await hud('flash', s); await page.waitForTimeout(90); }
    const multi = [];
    for (let i = 0; i < 5; i++) {
      const st = await state();
      multi.push(`t+${(i * 0.45).toFixed(2)}s "${st.text}" (+${st.queue.length} waiting)`);
      await shot(`hud-3-multihit-${i}`);
      await page.waitForTimeout(450);
    }
    note(`3. four limbs in 0.36 s, then sampled every 0.45 s:`);
    for (const l of multi) note(`     ${l}`);
    const distinct = new Set(multi.map((l) => l.split('"')[1]).filter((t) => /TORN OFF/.test(t)));
    if (distinct.size >= 3) pass('a multi-hit reads as several events', `${distinct.size} distinct wound lines held the slot in turn: ${[...distinct].join(' / ')}`);
    else fail('a multi-hit reads as several events', `only ${distinct.size} distinct wound line(s) ever reached the slot — the rest were stomped`);
  }

  // -------------------------------------------------------------------------
  async function routePart() {
    // 10 Hz on BOTH bodies. The critic reported an outcome (ALERT at 19 s); what is missing is
    // WHERE the two of them were when it happened, which is the only thing that says whether
    // the fix belongs in the route table or in the perception numbers.
    await page.evaluate(() => {
      if (window.__trInstalled) return;
      window.__trInstalled = true;
      const e = window.__rrr.engine;
      e.onUpdate(() => {
        const w = window.__tr; if (!w) return;
        const t = e.elapsed - w.t0;
        const h = e.hunter, p = e.player;
        const sep = Math.hypot(h.root.position.x - p.root.position.x, h.root.position.z - p.root.position.z);
        if (w.states[h.state] == null) w.states[h.state] = +t.toFixed(2);
        w.minSep = Math.min(w.minSep, sep);
        // THE SIGHTLINE BEAT, AS A NUMBER. "A small, distant silhouette at the far end of a lit
        // corridor" is the one thing about this level a critic has called genuinely good, and
        // it is the thing a fix to the patrol route is most likely to delete by accident. It is
        // geometry only — `blocksSight`, not the player's field of view — so it measures the
        // OPPORTUNITY the level offered, not whether the autopilot happened to be looking.
        if (!e.room.blocksSight(h.eye, p.root.position.clone().setY(1.0))) {
          if (sep > (w.losMax?.sep ?? 0)) w.losMax = { sep: +sep.toFixed(1), t: +t.toFixed(1),
            where: `${e.room.spaceAt(p.root.position)?.id ?? '-'}<-${e.room.spaceAt(h.root.position)?.id ?? '-'}` };
          if (w.losFirst == null) w.losFirst = +t.toFixed(1);
        }
        const limbs = p.rig.caps.arms + p.rig.caps.legs;
        if (w.limbs0 == null) w.limbs0 = limbs;
        if (limbs < w.limbs0 && w.lostAt == null) { w.lostAt = +t.toFixed(2); }
        w.minLimbs = Math.min(w.minLimbs, limbs);
        if (t - w.lastRow >= 0.5) {
          w.lastRow = t;
          w.rows.push({
            t: +t.toFixed(1),
            p: [+p.root.position.x.toFixed(1), +p.root.position.z.toFixed(1)],
            ps: e.room.spaceAt(p.root.position)?.id ?? '-',
            h: [+h.root.position.x.toFixed(1), +h.root.position.z.toFixed(1)],
            hs: e.room.spaceAt(h.root.position)?.id ?? '-',
            st: h.state, aw: +h.awareness.toFixed(2), sep: +sep.toFixed(1),
            los: !e.room.blocksSight(h.eye, p.root.position.clone().setY(1.0)),
            ri: h.routeIdx ?? -1, limbs,
          });
        }
        w.last = +t.toFixed(2);
      });
    });
    const arm = () => page.evaluate(() => {
      const e = window.__rrr.engine;
      window.__tr = { t0: e.elapsed, rows: [], states: {}, lastRow: -9, minSep: 1e9,
        limbs0: null, minLimbs: 99, lostAt: null, last: 0, losMax: null, losFirst: null };
    });
    const read = () => page.evaluate(() => {
      const w = window.__tr; window.__tr = null;
      return w ? { rows: w.rows, states: w.states, minSep: +w.minSep.toFixed(1), limbs0: w.limbs0,
        minLimbs: w.minLimbs, lostAt: w.lostAt, last: w.last, losMax: w.losMax, losFirst: w.losFirst } : null;
    });

    const RUNS = [
      { tag: 'stop-short', anchors: ['study_w.north', 'gallery.west', 'gallery.mid'] },
      { tag: 'natural-east', anchors: ['study_w.north', 'gallery.west', 'gallery.mid', 'study_e.north'] },
    ];
    for (const run of RUNS) {
      const reset = await page.evaluate(() => {
        const e = window.__rrr.engine;
        window.__auto = null; window.__pin = null;
        e.resetRound();
        return { sep: +Math.hypot(e.hunter.root.position.x - e.player.root.position.x,
          e.hunter.root.position.z - e.player.root.position.z).toFixed(2),
        hunterAt: e.room.spaceAt(e.hunter.root.position)?.id, ri: e.hunter.routeIdx };
      });
      await arm();
      const route = (await anchorsXZ(...run.anchors)).filter(Boolean);
      await drive(route, { tol: 1.6 });
      await holdWalk(46000, false);
      await page.evaluate(() => { window.__auto = null; });
      const m = await read();
      await shot(`diag-${run.tag}`);
      note(`--- ROUTE "${run.tag}" (${run.anchors.join(' -> ')}) · reset sep ${reset.sep} m, hunter routeIdx ${reset.ri}`);
      note(`    firsts ${JSON.stringify(m.states)} · closest ${m.minSep} m · limbs ${m.minLimbs}/${m.limbs0}` +
        `${m.lostAt != null ? ` FIRST LIMB LOST AT t=${m.lostAt}s` : ' (intact)'}`);
      note(`    SIGHTLINE: first clear line at t=${m.losFirst ?? 'never'}${m.losFirst != null ? 's' : ''}` +
        ` · longest ${m.losMax ? `${m.losMax.sep} m at t=${m.losMax.t}s (${m.losMax.where})` : 'none — they were never in view of one another'}`);
      for (const r of m.rows) {
        note(`    t=${String(r.t).padStart(5)} P${JSON.stringify(r.p)}@${r.ps.padEnd(8)} H${JSON.stringify(r.h)}@${r.hs.padEnd(8)}` +
          ` ${r.st.padEnd(6)} aw ${r.aw.toFixed(2)} sep ${String(r.sep).padStart(5)} ${r.los ? 'LOS' : '   '} wp${r.ri} limbs${r.limbs}`);
      }
      const alert = m.states.ALERT ?? null;
      if (alert == null) pass(`route ${run.tag}: first ALERT >= 20s`, `never alerted in ${m.last}s`);
      else if (alert >= 20) pass(`route ${run.tag}: first ALERT >= 20s`, `${alert}s, closest ${m.minSep} m`);
      else fail(`route ${run.tag}: first ALERT >= 20s`, `ALERT at ${alert}s (closest ${m.minSep} m)`);
      if (m.lostAt == null) pass(`route ${run.tag}: intact through 45 s`, `limbs ${m.minLimbs}/${m.limbs0}`);
      else fail(`route ${run.tag}: intact through 45 s`, `first limb lost at t=${m.lostAt}s`);
    }
  }

  // -------------------------------------------------------------------------
  async function meleePart() {
    // THE ATTACK PIPELINE, SAMPLED ON THE ENTRY FRAME. Everything below is read one frame
    // BEFORE the state changes, because `_attack()` consumes `_swing` on the frame it runs and
    // a probe reading it afterwards sees the value the strike wrote, not the value it found.
    await page.evaluate(() => {
      if (window.__mlInstalled) return;
      window.__mlInstalled = true;
      const e = window.__rrr.engine;
      let prev = null;
      e.onUpdate((dt) => {
        const h = e.hunter, p = e.player;
        const sep = Math.hypot(h.root.position.x - p.root.position.x, h.root.position.z - p.root.position.z);
        const now = { state: h.state, swing: h._wind ?? h._swing, atk: h._atk ? { t: +h._atk.t.toFixed(3), struck: h._atk.struck } : null,
          stun: +(h.stun ?? 0).toFixed(1), resist: +(h.stunResist ?? 0).toFixed(2), lock: +(h._breakLock ?? 0).toFixed(2),
          chain: h._breakChain ?? 0, aware: +h.awareness.toFixed(2), sep: +sep.toFixed(2), saw: h.sawThisFrame,
          // ⚠️ COUNT OCCUPIED SOCKETS, NOT `caps`. `caps.arms + caps.legs` does not count the
          // GADGET arm, and `shoulderL` — the nail-gun socket — is the FIRST thing
          // `HunterAI._attack` takes. So the first strike of every encounter took a limb, drove
          // the hunter into GROW, and left this counter reading an untouched 3/3.
          limbs: ['shoulderL', 'shoulderR', 'hipL', 'hipR'].filter((s) => p.rig.occupant(s) !== 'empty').length,
          dt: +dt.toFixed(4), t: +e.elapsed.toFixed(2) };
        const w = window.__ml;
        if (w && prev && prev.state !== 'ATTACK' && now.state === 'ATTACK') {
          w.entries.push({ at: +(now.t - w.t0).toFixed(2), from: prev.state,
            swingOnEntry: prev.swing === undefined ? 'undefined' : +Number(prev.swing).toFixed(3),
            sep: prev.sep, aware: prev.aware, saw: prev.saw, stun: prev.stun, resist: prev.resist,
            lock: prev.lock, chain: prev.chain, dt: prev.dt, limbs: prev.limbs });
        }
        if (w && prev && prev.limbs > now.limbs) {
          w.strikes.push({ at: +(now.t - w.t0).toFixed(2), limbs: `${prev.limbs}->${now.limbs}`, sep: now.sep });
        }
        // Every frame the hunter spends in a state that is not PURSUE-approaching, so a trial
        // that entered ATTACK and then did nothing says WHY rather than just leaving a gap.
        if (w && prev && (now.state !== prev.state)) {
          w.path.push(`${+(now.t - w.t0).toFixed(2)}:${prev.state}->${now.state}`);
        }
        // WHEN THE BODY ACTUALLY STARTED MOVING. A reaction trial that "pressed S" measures
        // the harness's own latency (a CDP poll round-trip plus two key events) on top of the
        // player's acceleration, and sizing a telegraph to a test rig's lag would be sizing it
        // to the wrong thing. Recording it separates the two.
        if (w && w.moveAt == null && p.vel && Math.hypot(p.vel.x, p.vel.z) > 0.6) w.moveAt = +(now.t - w.t0).toFixed(2);
        if (w) { w.minSep = Math.min(w.minSep, sep); w.last = +(now.t - w.t0).toFixed(2);
          if (w.limbs0 == null) w.limbs0 = now.limbs; w.minLimbs = Math.min(w.minLimbs, now.limbs); }
        prev = now;
      });
    });

    const TRIALS = +(process.env.TRIALS ?? 7);
    const rows = [];
    for (let i = 0; i < TRIALS; i++) {
      const set = await page.evaluate(() => {
        const e = window.__rrr.engine, r = e.room;
        window.__auto = null; window.__pin = null; window.__ml = null;
        e.resetRound();
        const P = r.anchor('duel.player');
        e.player.pos.copy(P); e.player.vel.set(0, 0, 0);
        e.player.facing = 0; e.player.aimYaw = 0; if (e.cam) { e.cam.yaw = 0; e.cam.pitch = 0; }
        // 5 m due north, in the same room, clear between them — the critic's staged start.
        e.hunter.root.position.set(P.x, 0, P.z - 5.0);
        e.hunter.vel.set(0, 0, 0);
        e.hunter.stage = 1; e.hunter.radius = 0.42;
        // `resetRound` leaves `absorbed` at 2 so the capture loop always shows a growth. Here
        // that turns the FIRST strike into a 1.4 s GROW and hides the strike cadence, which is
        // half of what this trial is measuring. Zero it: the subject is the swing, not growth.
        e.hunter.absorbed = 0;
        e.hunter.facing = 0;
        e.hunter.awareness = 1.0; e.hunter.state = 'PURSUE';
        e.hunter.target = e.hunter.candidates?.[0] ?? { root: e.player.root, rig: e.player.rig, height: e.player.height };
        e.hunter.lastKnown.copy(e.player.root.position);
        // WHAT THE TRIAL INHERITS. If two "identical" setups differ here, they are not identical.
        const inherited = { swing: e.hunter._swing === undefined ? 'undefined' : +Number(e.hunter._swing).toFixed(3),
          atk: e.hunter._atk ? { t: +e.hunter._atk.t.toFixed(3), struck: e.hunter._atk.struck } : null,
          stun: +(e.hunter.stun ?? 0).toFixed(1), resist: +(e.hunter.stunResist ?? 0).toFixed(2),
          lock: +(e.hunter._breakLock ?? 0).toFixed(2), chain: e.hunter._breakChain ?? 0,
          limbs: e.player.rig.caps.arms + e.player.rig.caps.legs };
        window.__ml = { t0: e.elapsed, entries: [], strikes: [], path: [], minSep: 1e9, limbs0: null, minLimbs: 99, last: 0 };
        // WHAT THE ROUND ACTUALLY HANDED BACK. `resetRound` refits from `rig.sockets[s].item`,
        // and a trial that opens with a socket still empty is not the same trial as the last
        // one however identical the staging code looks.
        const sockets = {};
        for (const s of ['shoulderL', 'shoulderR', 'hipL', 'hipR']) {
          sockets[s] = `${e.player.rig.occupant(s)}${e.player.rig.sockets[s]?.item ? '' : '/nospare'}`;
        }
        return { inherited, sep: 5.0, sockets, downed: !!e.player.rig.caps.downed };
      });
      // THE PLAYER DOES NOTHING. The critic's trials that died did so with zero displacement,
      // so the control is a body that never moves: whatever varies, it is not the player.
      // Long enough for the approach, the windup and at least one follow-up at full cadence.
      await page.waitForTimeout(6000);
      const m = await page.evaluate(() => { const w = window.__ml; window.__ml = null; return w; });
      rows.push({ i, inherited: set.inherited, entries: m.entries, strikes: m.strikes,
        minSep: +m.minSep.toFixed(2), limbs: `${m.minLimbs}/${m.limbs0}` });
      note(`trial ${i}: inherited wind/swing=${set.inherited.swing} stun=${set.inherited.stun}` +
        ` resist=${set.inherited.resist} lock=${set.inherited.lock} chain=${set.inherited.chain}` +
        ` · sockets ${JSON.stringify(set.sockets)}${set.downed ? ' DOWNED' : ''}`);
      note(`         ATTACK entries ${JSON.stringify(m.entries)}`);
      note(`         states ${m.path.join(' ')}`);
      note(`         limb losses ${JSON.stringify(m.strikes)} · closest ${(+m.minSep).toFixed(2)} m · limbs ${m.minLimbs}/${m.limbs0}`);
      // The windup is the fix; measure it directly rather than inferring it from two timestamps.
      const wind = (m.entries[0] && m.strikes[0]) ? +(m.strikes[0].at - m.entries[0].at).toFixed(2) : null;
      if (wind != null) note(`         WINDUP entry->strike ${wind}s`);
      rows[rows.length - 1].wind = wind;
    }

    // ---- REACTION PHASE ------------------------------------------------------------------
    //
    // A CONSTANT DELAY IS NOT A REACTION WINDOW UNTIL SOMEBODY REACTS IN IT. The trials above
    // prove the strike lands 0.84 s after ATTACK on a body that never moves; they cannot tell
    // that apart from a 0.84 s cutscene. So run the same staging again and, the moment the
    // hunter rears, hold S — real key, real locomotion, real collision. The poll costs ~60 ms
    // of "seeing" it plus travel time, which is not a superhuman reaction.
    const react = [];
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => {
        const e = window.__rrr.engine, r = e.room;
        window.__auto = null; window.__pin = null; window.__ml = null;
        e.resetRound();
        const P = r.anchor('duel.player');
        e.player.pos.copy(P); e.player.vel.set(0, 0, 0);
        // ⚠️ FACE THE HUNTER, WHICH THE PASSIVE TRIALS DO NOT. They stage `aimYaw = 0` with the
        // hunter 5 m along -Z, i.e. BEHIND the player — fine when the control is a body that
        // never moves, and wrong the moment the body is asked to retreat: `Player` resolves
        // movement about `aimYaw`, so at yaw 0 the "back away" key walks STRAIGHT INTO the
        // thing. Measured that way the player covered 7.6 m, ended 2.0 m from the hunter and
        // lost the limb anyway, which reads exactly like an unreactable attack and is really a
        // probe facing the wrong way. At `aimYaw = PI` forward is -Z, the hunter is in front
        // where the tell can be seen, and S is away from it.
        e.player.facing = Math.PI; e.player.aimYaw = Math.PI;
        if (e.cam) { e.cam.yaw = Math.PI; e.cam.pitch = 0; }
        e.hunter.root.position.set(P.x, 0, P.z - 5.0);
        e.hunter.vel.set(0, 0, 0);
        e.hunter.stage = 1; e.hunter.radius = 0.42; e.hunter.absorbed = 0; e.hunter.facing = 0;
        e.hunter.awareness = 1.0; e.hunter.state = 'PURSUE';
        e.hunter.target = e.hunter.candidates?.[0] ?? { root: e.player.root, rig: e.player.rig, height: e.player.height };
        e.hunter.lastKnown.copy(e.player.root.position);
        window.__ml = { t0: e.elapsed, entries: [], strikes: [], path: [], minSep: 1e9, limbs0: null, minLimbs: 99, last: 0, moveAt: null };
      });
      const saw = await waitFor(() => (window.__rrr.engine.hunter.state === 'ATTACK' ? 1 : 0), { timeout: 4000, every: 60 });
      let moved = 0;
      if (saw) {
        // ⚠️ REACT AT HUMAN SPEED, NOT AT CDP SPEED. Measured, the rig gets from "the hunter
        // reared" to "the body is moving" in 0.05-0.09 s. A person needs about 0.25 s to see a
        // change and start pressing, so a window this rig can beat is not evidence that a
        // player can. `REACT_MS` pads it out to that; raise it to find where the tell stops
        // being answerable.
        await page.waitForTimeout(REACT_MS);
        const p0 = await page.evaluate(() => window.__rrr.engine.player.root.position.z);
        await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyS');
        await page.waitForTimeout(1500);
        await page.keyboard.up('KeyS'); await page.keyboard.up('ShiftLeft');
        moved = await page.evaluate((z0) => +Math.abs(window.__rrr.engine.player.root.position.z - z0).toFixed(2), p0);
      }
      const m = await page.evaluate(() => { const w = window.__ml; window.__ml = null; return w; });
      const lag = (m.moveAt != null && m.entries[0]) ? +(m.moveAt - m.entries[0].at).toFixed(2) : null;
      react.push({ saw: !!saw, moved, lost: m.strikes.length, limbs: `${m.minLimbs}/${m.limbs0}`, lag });
      note(`react ${i}: rear seen=${!!saw} · retreated ${moved} m · limbs lost ${m.strikes.length} (${m.minLimbs}/${m.limbs0})` +
        ` · rig lag rear->moving ${lag == null ? 'n/a' : `${lag}s`}` +
        ` · strikes ${JSON.stringify(m.strikes)} · entries ${JSON.stringify(m.entries.map((e) => [e.at, e.sep]))}`);
    }
    const escaped = react.filter((r) => r.saw && r.lost === 0).length;
    note(`SUMMARY reacting to the rear-back: ${escaped}/${react.length} escaped the first strike intact`);
    if (react.every((r) => !r.saw)) skip('the windup can be reacted to', 'the hunter never entered ATTACK in the reaction trials');
    else if (escaped === react.filter((r) => r.saw).length) {
      pass('the windup can be reacted to', `${escaped}/${react.length} escaped by backing off on the tell — the same staging that costs a limb when you stand still`);
    } else fail('the windup can be reacted to', `only ${escaped}/${react.length} escaped — the tell is not long enough to answer`);

    // The finding IS the variance. Report it as a number.
    const firstLoss = rows.map((r) => (r.strikes[0]?.at ?? null));
    const lost = firstLoss.filter((x) => x != null);
    note(`SUMMARY first-limb-loss times over ${TRIALS} identical trials: ` +
      firstLoss.map((x) => (x == null ? 'none' : `${x}s`)).join(' · '));
    const spread = lost.length >= 2 ? +(Math.max(...lost) - Math.min(...lost)).toFixed(2) : 0;
    note(`SUMMARY ${lost.length}/${TRIALS} trials lost a limb; spread of first loss ${spread}s;` +
      ` entry-frame timer values: ${rows.map((r) => r.entries[0]?.swingOnEntry ?? '-').join(' · ')}`);
    const winds = rows.map((r) => r.wind).filter((x) => x != null);
    const wSpread = winds.length >= 2 ? +(Math.max(...winds) - Math.min(...winds)).toFixed(3) : 0;
    note(`SUMMARY windups (ATTACK entry -> limb off): ${winds.map((w) => `${w}s`).join(' · ') || 'none'}` +
      ` — spread ${wSpread}s over ${winds.length} strike(s)`);
    if (winds.length >= 4) {
      if (wSpread <= 0.12) pass('the strike is telegraphed by a constant windup', `${winds.length} strikes, spread ${wSpread}s, mean ${(winds.reduce((a, b) => a + b, 0) / winds.length).toFixed(2)}s`);
      else fail('the strike is telegraphed by a constant windup', `windup varies by ${wSpread}s across ${winds.length} strikes`);
    } else skip('the strike is telegraphed by a constant windup', `only ${winds.length} strike(s) observed — need 4`);
    if (lost.length === 0 || lost.length === TRIALS) {
      if (spread <= 0.35) pass('close quarters is consistent', `${lost.length}/${TRIALS} identical trials agree; first-loss spread ${spread}s`);
      else fail('close quarters is consistent', `all trials agree on outcome but first loss spans ${spread}s`);
    } else {
      fail('close quarters is consistent', `${lost.length}/${TRIALS} trials lost a limb and ${TRIALS - lost.length} did not, from identical setups`);
    }
  }
}
