/**
 * ESCAPE — does the win condition exist, is it seeded, and can it be walked through?
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/escape.mjs \
 *        --port 5194 --shots --q "seed=rrr-test-1"
 *
 * `docs/design/escape.md` §10's closing paragraph names four things that must be MEASURED and
 * not asserted. Two of them are this round's work and are measured here:
 *
 *   · whether the seeded selection is identical on two clients from the same seed   -> E3
 *   · whether the exit can actually be opened and walked out of                     -> E5, E6
 *
 * The other two (the bomb timer, and whether the wind-down is survivable from the worst
 * corner) belong to §10.4-5, which is deliberately NOT built this round. E10 proves only that
 * the STATE they hang off is reachable.
 *
 * ⚠️ EVERY ASSERTION BELOW THAT COULD PASS ON BROKEN CODE IS DELIBERATELY BROKEN ONCE FIRST.
 * `E4b` reverts a chained site to the normal stage table and requires the same loop that just
 * proved "cannot be chewed" to OPEN it; `E7` drives the escape rule with three inputs that
 * must all be refused. A suite that has only ever been run against working code is not
 * evidence of anything — this project has been burned by that five times.
 */

export default async function escapeScenario({ page, note, pass, fail, skip, shot, waitFor }) {
  // ---- frame-accurate stepping. `waitForTimeout` is wall-clock and the engine clamps dt,
  // so "wait 500 ms" is not "advance N frames" — see HANDOFF's flee-survival trap #1.
  const step = async (n = 3) => {
    const f0 = await page.evaluate(() => window.__rrr?.frames?.() ?? 0);
    for (let i = 0; i < 60; i++) {
      await page.waitForTimeout(60);
      const f = await page.evaluate(() => window.__rrr?.frames?.() ?? 0);
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };

  // Record every phase change and every escape for the whole session, so a run that ends
  // somewhere unexpected says WHERE instead of just producing a wrong number at the end.
  const reachable = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.run || !e.exits) return false;
    window.__esc = { escapes: [], phases: [], resets: [] };
    e.run.onEscape((r) => window.__esc.escapes.push({ id: r.id, at: +r.at.toFixed(3) }));
    e.run.onPhase((p, from) => window.__esc.phases.push(`${from}>${p}@${e.run.t.toFixed(2)}`));
    const orig = e.run.reset.bind(e.run);
    e.run.reset = (...a) => {
      window.__esc.resets.push({ t: +e.run.t.toFixed(2), f: window.__rrr.frames() });
      return orig(...a);
    };
    // `resetRound` does not rebuild the RunState, so one wiring lasts the session.
    return true;
  });
  if (!reachable) {
    fail('the run state machine is wired into game.js', 'engine.run / engine.exits not exposed');
    return;
  }

  // =========================================================================
  // E1 · the pool is real geometry, and "outside" really is outside
  // =========================================================================
  const geo = await page.evaluate(() => {
    const e = window.__rrr.engine, room = e.room;
    return e.exits.map((x) => {
      const n = x.panel.normal;
      const p = x.panel.root.position;
      const probe = (sign, d) => ({
        x: +(p.x + n.x * sign * d).toFixed(2), z: +(p.z + n.z * sign * d).toFixed(2),
        space: room.spaceAt({ x: p.x + n.x * sign * d, y: 0, z: p.z + n.z * sign * d }, 0)?.id ?? null,
      });
      return {
        id: x.site.id, name: x.site.name, owner: x.site.a, outSign: x.outSign,
        at: [+p.x.toFixed(2), +p.z.toFixed(2)], halfW: +x.halfW.toFixed(2),
        outside: probe(x.outSign, 1.2), inside: probe(-x.outSign, 1.2),
      };
    });
  });
  note(`exit pool (${geo.length}): ${geo.map((g) => `${g.id}@${g.at} out${g.outSign > 0 ? '+' : '-'}`).join(' · ')}`);

  const badOut = geo.filter((g) => g.outside.space !== null);
  const badIn = geo.filter((g) => g.inside.space !== g.owner);
  /**
   * ⚠️ **THE FLOOR WAS A HARD 4 AND THAT IS A STALE ABSOLUTE — CORRECTED 2026-08-15 (`genexit-1`).**
   * It was written when the authored pool WAS four; the pool has since been 14 for a year of this
   * project's days, and a GENERATED house (`?plan=gen`, `?planrooms=3`) has **2 or 3** — measured,
   * `_plangen1-boot` reports both across its 16 seeds. So the only assertion this file could not
   * satisfy on a generated house was an arithmetic constant, not a property of the game: it read
   * 18 passed / 1 failed / 1 skipped, and the 1 was this line.
   *
   * What actually has to be true is that there IS a pool and it has something to choose BETWEEN —
   * E2 below already asserts that exactly one member is live and every other one is padlocked, so
   * two is the real floor. The count is REPORTED either way, which is what a reader needs.
   */
  if (geo.length < 2) fail('there is an exit pool to choose from',
    `${geo.length} site(s) — the authored house ships 14, a generated one 2-3`);
  else if (badOut.length) fail('every exit faces genuinely outside',
    badOut.map((g) => `${g.id} -> ${g.outside.space}`).join(', '));
  else if (badIn.length) fail('every exit is in the wall of the room it claims',
    badIn.map((g) => `${g.id} inside=${g.inside.space} want=${g.owner}`).join(', '));
  else pass('every exit is a real hole in a real exterior wall',
    `${geo.length} sites; 1.2 m out of each is in no space, 1.2 m in is the owning room`);

  // =========================================================================
  // E2 · exactly ONE live exit; the other three are walls you cannot chew
  // =========================================================================
  const plan = await page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run;
    return {
      seed: String(run.seed), exitId: run.exitId, lock: run.lock.id, start: run.lock.startStage,
      phase: run.phase,
      sites: e.exits.map((x) => ({
        id: x.site.id, live: run.isLiveExit(x.site.id),
        stage: x.panel.state.stage, defs: x.panel.state.defs.length,
        damageable: x.panel.state.isDamageable(), blocks: x.panel.blocksMovement(),
        name: x.panel.state.def.name,
      })),
    };
  });
  note(`plan: seed "${plan.seed}" -> ${plan.exitId} · lock "${plan.lock}" (starts at stage ${plan.start})`);
  note(`sites: ${plan.sites.map((s) => `${s.id}=${s.live ? 'LIVE' : 'chained'}/${s.name}`).join(' · ')}`);

  const live = plan.sites.filter((s) => s.live);
  const chewable = plan.sites.filter((s) => s.damageable);
  const unblocked = plan.sites.filter((s) => !s.blocks);
  if (live.length !== 1) fail('exactly one live escape point per run', `${live.length} live`);
  else if (live[0].id !== plan.exitId) fail('the live site is the one the seed chose', live[0].id);
  else if (live[0].stage !== plan.start) fail('the live site starts at its lock stage',
    `stage ${live[0].stage}, lock wants ${plan.start}`);
  else if (chewable.length !== 1 || !chewable[0].live)
    fail('only the live site is damageable', `${chewable.length} damageable: ${chewable.map((s) => s.id).join(',')}`);
  else if (unblocked.length) fail('every site blocks movement at the start', unblocked.map((s) => s.id).join(','));
  else pass('one live exit, three chained decoys',
    `live ${plan.exitId} at "${live[0].name}"; the other 3 are damageable:false, blocksMove:true`);

  // =========================================================================
  // E3 · THE DESYNC TEST. Same seed -> same exit. Different seeds -> different exits.
  // =========================================================================
  const det = await page.evaluate(async () => {
    let m;
    try { m = await import('/src/game/run.js'); } catch (err) { return { err: String(err) }; }
    const pool = window.__rrr.engine.exits.map((x) => x.site.id);

    // (a) the same seed, called many times
    const repeats = new Set();
    for (let i = 0; i < 200; i++) {
      const p = m.chooseExit('agree-me', pool);
      repeats.add(`${p.exitId}|${p.lock.id}`);
    }

    // (b) two INDEPENDENT RunState instances — "two clients" — on the same seed
    const twoClients = [];
    for (const s of ['s-1', 's-2', 'lobby-9182', '7', 'rrr-capture']) {
      const a = new m.RunState({ seed: s, sites: pool, authority: true });
      const b = new m.RunState({ seed: s, sites: pool.slice(), authority: false });
      twoClients.push(a.exitId === b.exitId && a.lock.id === b.lock.id);
    }

    // (c) a client that JOINED LATE and only ever saw a snapshot
    const host = new m.RunState({ seed: 'late-join-77', sites: pool, authority: true });
    const joiner = new m.RunState({ seed: 'something-else', sites: pool, authority: false });
    joiner.applySnapshot(host.serialize());
    const lateAgrees = joiner.exitId === host.exitId && joiner.lock.id === host.lock.id;

    // (d) the sweep: do different seeds actually VARY it, and is the spread usable?
    const site = {}, lock = {};
    const N = 512;
    for (let i = 0; i < N; i++) {
      const p = m.chooseExit(`seed-${i}`, pool);
      site[p.exitId] = (site[p.exitId] ?? 0) + 1;
      lock[p.lock.id] = (lock[p.lock.id] ?? 0) + 1;
    }
    return { repeats: [...repeats], twoClients, lateAgrees, site, lock, N, pool };
  });

  if (det.err) {
    skip('the same seed yields the same exit', `could not import /src/game/run.js: ${det.err}`);
  } else {
    note(`site spread over ${det.N} seeds: ${JSON.stringify(det.site)}`);
    note(`lock spread over ${det.N} seeds: ${JSON.stringify(det.lock)}`);

    const agreeAll = det.twoClients.every(Boolean);
    if (det.repeats.length !== 1) fail('the same seed yields the same exit', `${det.repeats.length} outcomes`);
    else if (!agreeAll) fail('two clients on one seed derive the same exit', JSON.stringify(det.twoClients));
    else if (!det.lateAgrees) fail('a late joiner derives the same exit from a snapshot', 'disagreed');
    else pass('two clients on one seed cannot disagree',
      `200 repeats -> 1 outcome (${det.repeats[0]}); 5 seeds x 2 instances agree; late joiner agrees`);

    // Varies — and usably. A selection that is deterministic but always returns site 1 passes
    // every test above and destroys the whole design, so the spread is an assertion too.
    const counts = det.pool.map((id) => det.site[id] ?? 0);
    const missing = det.pool.filter((id) => !det.site[id]);
    const worst = Math.max(...counts) / det.N;
    /**
     * ⚠️ **AND SO WAS THE 0.45 — SAME CLASS, ONE LINE LATER, AND IT WOULD HAVE BITTEN THE NEXT
     * READER RATHER THAN THIS ONE.** A pool of n has a uniform share of 1/n, so a TWO-site
     * generated house floors at 50% and could never pass a flat 45% bar however fair the picker
     * is. The bar is now "no site takes more than 1.5x its uniform share", with the old constant
     * kept as a floor so it can only ever LOOSEN for a small pool and **the authored 14-site arm
     * is bit-for-bit the check it has always been** (1.5/14 = 10.7%, under 0.45, so 0.45 still
     * binds there — measured worst 7.8%). n=3 measured 35.0% against a 50% bar.
     */
    const spreadBar = Math.max(0.45, 1.5 / Math.max(1, det.pool.length));
    const lockMissing = ['boarded', 'plaster', 'beams'].filter((id) => !det.lock[id]);
    if (missing.length) fail('different seeds vary the exit', `never chosen: ${missing.join(', ')}`);
    else if (worst > spreadBar) fail('different seeds vary the exit',
      `one site takes ${(worst * 100).toFixed(1)}% of ${det.N}, bar ${(spreadBar * 100).toFixed(1)}% for a pool of ${det.pool.length}`);
    else if (lockMissing.length) fail('different seeds vary the lock', `never chosen: ${lockMissing.join(', ')}`);
    else pass('different seeds vary the exit and the lock',
      `all ${det.pool.length} sites appear (worst share ${(worst * 100).toFixed(1)}% of ${det.N}, `
      + `bar ${(spreadBar * 100).toFixed(1)}%); all 3 locks appear`);
  }

  // =========================================================================
  // E9 · the run clock is GAME time, not wall time
  // =========================================================================
  const clock = await page.evaluate(() => ({ t: window.__rrr.engine.run.t, f: window.__rrr.frames() }));
  await page.waitForTimeout(2000);
  const clock2 = await page.evaluate(() => {
    const e = window.__rrr.engine;
    return { t: e.run.t, f: window.__rrr.frames(), hud: document.querySelector('.rrr-hud')?.innerText ?? '' };
  });
  const dt = clock2.t - clock.t;
  const frames = clock2.f - clock.f;
  note(`run clock advanced ${dt.toFixed(2)} s over ${frames} frames of ~2.0 s wall time`);
  // A probe that cannot observe must SKIP. If the frame loop stalled through this window
  // (see the first-`resetRound` note below — this view really can lose 3 s to one frame) then
  // there is nothing here to measure and reporting FAIL would be a lie about the clock.
  if (frames < 30) skip('the run clock advances', `only ${frames} frames in 2 s of wall time — the loop stalled`);
  else if (dt <= 0) fail('the run clock advances', `t did not move (${clock.t} -> ${clock2.t})`);
  else if (dt > 2.6) fail('the run clock advances', `${dt.toFixed(2)} s in 2.0 s wall — not clamped dt`);
  else pass('the run clock advances with the world', `${dt.toFixed(2)} s over ${frames} frames`);
  await shot('esc0-explore');

  // =========================================================================
  // E4 · A CHAINED SITE CANNOT BE CHEWED — and the shot still LANDS on it
  // =========================================================================
  // Park the hunter somewhere none of the four firing lines pass, so a stray body hit cannot
  // masquerade as a wall that refused damage. The service passage is interior and clear of all
  // four; `ignore` covers the player's own rig.
  const chainedId = plan.sites.find((s) => !s.live)?.id;
  const chew = await page.evaluate((id) => {
    const e = window.__rrr.engine, x = e.exits.find((q) => q.site.id === id);
    e.hunter.root.position.set(0, 0, -16); e.hunter.vel.set(0, 0, 0);
    e.hunter.state = 'PATROL'; e.hunter.awareness = 0;
    const n = x.panel.normal, p = x.panel.root.position, inS = -x.outSign;
    const origin = { x: p.x + n.x * inS * 2.0, y: 1.35, z: p.z + n.z * inS * 2.0 };
    const dir = { x: -n.x * inS, y: 0, z: -n.z * inS };
    // The room owns the only Vector3 constructor reachable from here without a second import.
    const V = x.panel.root.position.constructor;
    const kinds = {}, panels = new Set();
    let changed = 0;
    for (let i = 0; i < 60; i++) {
      const out = e.weapons.fire('nailgun', new V(origin.x, origin.y, origin.z),
        new V(dir.x, dir.y, dir.z), performance.now() / 1000, { ignore: e.player.rig });
      kinds[out.kind] = (kinds[out.kind] ?? 0) + 1;
      if (out.panel) panels.add(out.panel.id);
      if (out.result?.changed) changed++;
    }
    return { kinds, panels: [...panels], changed, stage: x.panel.state.stage,
      blocks: x.panel.blocksMovement(), origin, dir };
  }, chainedId);
  note(`60 nail-gun rounds into ${chainedId}: ${JSON.stringify(chew.kinds)} · hit ${JSON.stringify(chew.panels)} · stage ${chew.stage}`);
  const hitIt = chew.kinds.wall === 60 && chew.panels.length === 1 && chew.panels[0] === chainedId;
  if (!hitIt) fail('a shot at a chained exit lands ON it',
    `expected 60 wall hits on ${chainedId}, got ${JSON.stringify(chew.kinds)} / ${JSON.stringify(chew.panels)}`);
  else if (chew.changed !== 0 || chew.stage !== 0 || !chew.blocks)
    fail('a chained exit cannot be chewed', `${chew.changed} stage change(s), stage ${chew.stage}`);
  else pass('a chained exit stops the shot and refuses the damage',
    `60/60 registered as wall hits on ${chainedId}; 0 stage changes; still blocking`);

  // ---- E4b · THE SAME LOOP MUST OPEN IT WHEN THE LOCK IS REMOVED.
  // Without this, E4 passes just as happily on a raycast that misses the panel entirely, which
  // is EXACTLY the bug the `forDamage` fix in room.js was for.
  const broke = await page.evaluate(async (id) => {
    const e = window.__rrr.engine, x = e.exits.find((q) => q.site.id === id);
    const m = await import('/src/destruction/wall.js');
    const was = x.panel.state.defs;
    x.panel.state.defs = m.STAGE_DEFS;
    x.panel.state.stage = 0;
    x.panel.state.stageHealth = m.STAGE_DEFS[0].health;
    x.panel._recomputeBox(); x.panel._apply();
    const n = x.panel.normal, p = x.panel.root.position, inS = -x.outSign;
    const V = x.panel.root.position.constructor;
    let changed = 0;
    for (let i = 0; i < 60; i++) {
      const out = e.weapons.fire('nailgun',
        new V(p.x + n.x * inS * 2.0, 1.35, p.z + n.z * inS * 2.0),
        new V(-n.x * inS, 0, -n.z * inS), performance.now() / 1000, { ignore: e.player.rig });
      if (out.result?.changed) changed++;
    }
    const res = { changed, stage: x.panel.state.stage, blocks: x.panel.blocksMovement() };
    // put the padlock back exactly as `applyExitPlan` would
    x.panel.state.defs = was;
    x.panel.state.stage = 0;
    x.panel.state.stageHealth = was[0].health;
    x.panel._recomputeBox(); x.panel._apply();
    return res;
  }, chainedId);
  note(`same 60 rounds with the padlock reverted: ${broke.changed} stage change(s), ended at stage ${broke.stage}`);
  (broke.changed >= 4 && broke.stage === 4 && !broke.blocks)
    ? pass('the chained check can detect the opposite', `reverted, the same loop opens it (${broke.changed} transitions)`)
    : fail('the chained check can detect the opposite',
      `reverting the lock did NOT open it (${broke.changed} changes, stage ${broke.stage}) — E4 proves nothing`);

  // =========================================================================
  // E11 · resetRound() restores the plan (the capture loop runs this every 28 s)
  // =========================================================================
  const afterReset = await page.evaluate(() => {
    const e = window.__rrr.engine;
    e.resetRound();
    const run = e.run;
    return {
      exitId: run.exitId, lock: run.lock.id, phase: run.phase, t: +run.t.toFixed(3),
      sites: e.exits.map((x) => ({ id: x.site.id, stage: x.panel.state.stage,
        damageable: x.panel.state.isDamageable() })),
    };
  });
  const resetOk = afterReset.exitId === plan.exitId && afterReset.lock === plan.lock
    && afterReset.phase === 'EXPLORE' && afterReset.t < 0.2
    && afterReset.sites.every((s) => (s.id === plan.exitId
      ? s.stage === plan.start && s.damageable
      : s.stage === 0 && !s.damageable));
  resetOk
    ? pass('resetRound restores the exit plan', `${afterReset.exitId} back at stage ${plan.start}, clock 0`)
    : fail('resetRound restores the exit plan', JSON.stringify(afterReset));

  // =========================================================================
  // E5 · THE LIVE SITE CAN BE OPENED, and opening it changes the level topology
  // =========================================================================
  const opened = await page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run;
    const x = e.exits.find((q) => run.isLiveExit(q.site.id));
    const n = x.panel.normal, p = x.panel.root.position, inS = -x.outSign;
    const V = x.panel.root.position.constructor;
    const stages = [x.panel.state.stage];
    let shots = 0;
    // ⚠️ 600, NOT 200, AND THE OLD CEILING WAS ONE TUNING PASS FROM TURNING THIS INTO A FALSE
    // FAILURE. The live exit runs on `EXIT_DEFS` now (the siege — `spaces.js`), so the
    // `boarded` lock is 4700 hp = 181 nail-gun rounds against a limit that used to be 200.
    // This bound exists to stop a runaway loop, not to assert a cost; the cost is asserted by
    // `harness/scenarios/eo2-siege.mjs`, which times it.
    for (let i = 0; i < 600 && x.panel.state.stage < 4; i++) {
      e.weapons.fire('nailgun', new V(p.x + n.x * inS * 2.0, 1.35, p.z + n.z * inS * 2.0),
        new V(-n.x * inS, 0, -n.z * inS), performance.now() / 1000, { ignore: e.player.rig });
      shots++;
      if (x.panel.state.stage !== stages[stages.length - 1]) stages.push(x.panel.state.stage);
    }
    const outEdge = e.room.portals().some((q) => q.kind === 'breach' && q.id === x.site.id
      && (q.a === 'outside' || q.b === 'outside'));
    return { id: x.site.id, shots, stages, stage: x.panel.state.stage,
      blocks: x.panel.blocksMovement(), sight: x.panel.blocksSight(), outEdge,
      msg: e.gameHud?._msgState?.() ?? null };
  });
  note(`opening ${opened.id}: ${opened.shots} nail-gun rounds, stages ${opened.stages.join(' -> ')}`);
  if (opened.stage !== 4 || opened.blocks)
    fail('the live exit can be opened', `stage ${opened.stage}, blocksMove ${opened.blocks} after ${opened.shots} rounds`);
  else if (!opened.outEdge)
    fail('an opened exit becomes a route out', 'no breach portal to "outside" appeared in room.portals()');
  else pass('the live exit opens and becomes a hole in the house',
    `${opened.shots} rounds, ${opened.stages.join('->')}, breach portal to outside now exists`);

  // The HUD must MARK the moment. Read from the slot arbiter itself rather than from a
  // screenshot: the callout is a 1.8 s message and a picture taken a round-trip later is a
  // picture of whatever won the slot next, which is how the first capture of this beat was
  // misread as the chained line still being up.
  // ⚠️ IT MAY LEGITIMATELY BE IN THE QUEUE RATHER THAN IN THE SLOT, and that is `hud.js`'s
  // arbiter working, not a miss. This scenario fires at a chained site (E4) and opens the live
  // one (E5) a few hundred ms apart — a player would be seconds or minutes apart — so the
  // chained line has not yet had its 0.62 s MIN_HOLD and the open line queues behind it. That
  // is also why the `esc1b` screenshot can show the chained caption: a test artefact, not a
  // defect. Assert on the arbiter's state, not on the pixel.
  const inSlot = /IS OPEN/.test(String(opened.msg?.text ?? ''));
  const inQueue = (opened.msg?.queue ?? []).some((q) => /IS OPEN/.test(q.text));
  (inSlot || inQueue)
    ? pass('the HUD marks the moment the way out opens',
      inSlot ? `on screen: "${opened.msg.text}"` : `queued behind "${opened.msg.text}" (see the note above)`)
    : fail('the HUD marks the moment the way out opens', `slot/queue held ${JSON.stringify(opened.msg)}`);
  await shot('esc1-opened');

  // WHAT THE WAY OUT ACTUALLY LOOKS LIKE. Stand square in front of the opening and photograph
  // it, because "the exit is open" is a claim about the screen and this project's rule is that
  // a claim about the screen needs a picture of the screen.
  await page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run;
    const x = e.exits.find((q) => run.isLiveExit(q.site.id));
    const n = x.panel.normal, p = x.panel.root.position, inS = -x.outSign;
    e.player.pos.set(p.x + n.x * inS * 4.2, e.room.floorY, p.z + n.z * inS * 4.2);
    e.player.vel.set(0, 0, 0);
    const yaw = Math.atan2(-n.x * inS, -n.z * inS);
    e.player.facing = yaw; e.player.aimYaw = yaw;
    e.cam.yaw = yaw; e.cam.pitch = 0;
    // ⚠️ SNAP THE BOOM, DO NOT LET IT FLY. `ThirdPersonCamera` LERPS its position at
    // `k = 1 - exp(-11*dt)` and interpolates straight THROUGH geometry — only the boom LENGTH
    // is raycast. Teleporting the player 25 m across the house therefore opened the shutter
    // with the lens inside a wall: on `seed=rrr-test-1` (live site `x.gallery.boards`, right
    // across the house from the spawn) this shot was a full-frame close-up of plaster, in BOTH
    // arms of an exterior ablation. It only ever looked right when the live site happened to
    // be near the study the player spawns in. `_first` is the camera's own "no history" flag
    // and makes the next update a snap.
    e.cam._first = true;
  });
  // ...and then let it actually come to rest, rather than assuming twelve frames is enough.
  {
    let last = null, still = 0;
    for (let i = 0; i < 40; i++) {
      await step(5);
      const p = await page.evaluate(() => {
        const c = window.__rrr.engine.camera.position; return [c.x, c.y, c.z];
      });
      const d = last ? Math.hypot(p[0] - last[0], p[1] - last[1], p[2] - last[2]) / 5 : 99;
      last = p;
      if (d < 0.0015) { still++; if (still >= 2) break; } else still = 0;
    }
  }
  await shot('esc1b-the-way-out');
  const beyond = await page.evaluate(() => {
    // Is there anything BEYOND the hole? Nothing builds exterior geometry, so this measures
    // what the player sees through it rather than assuming.
    const e = window.__rrr.engine, run = e.run;
    const x = e.exits.find((q) => run.isLiveExit(q.site.id));
    const n = x.panel.normal, p = x.panel.root.position, inS = -x.outSign;
    const V = p.constructor;
    const hit = e.room.castRay(new V(p.x + n.x * inS * 1.0, 1.35, p.z + n.z * inS * 1.0),
      new V(-n.x * inS, 0, -n.z * inS), 200);
    return { hit: hit ? { d: +hit.distance.toFixed(2), panel: hit.panel?.id ?? null } : null,
      bg: e.scene.background ? '#' + e.scene.background.getHexString() : 'none' };
  });
  note(`through the opening: ${beyond.hit ? `something at ${beyond.hit.d} m` : 'nothing at all within 200 m'}`
    + ` · scene background ${beyond.bg}`);

  // =========================================================================
  // E7 · BREAK THE ESCAPE RULE THREE WAYS. All three must be REFUSED.
  // =========================================================================
  const neg = await page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run, room = e.room;
    const x = e.exits.find((q) => run.isLiveExit(q.site.id));
    const n = x.panel.normal, p = x.panel.root.position;
    const V = p.constructor;
    const at = (sign, d, lat = 0) => new V(
      p.x + n.x * sign * d + n.z * lat, 0, p.z + n.z * sign * d - n.x * lat);

    const outPt = at(x.outSign, 1.2);
    const inPt = at(-x.outSign, 1.2);
    const sidePt = at(x.outSign, 1.2, x.halfW + 3.0);   // outside the plane but past the jamb

    // The one that is NOT redundant: a point on the outside side of the plane, within the
    // aperture's lateral span, that is nonetheless INSIDE another room.
    //
    // ⚠️ IT HAS TO BE A 2D SWEEP OF THE WHOLE ESCAPE BOX, NOT A WALK ALONG THE NORMAL. The
    // first version of this probe only stepped straight out from the panel centre and reported
    // "no neighbouring room" for every site — including the chapel's vestry door, where the
    // gallery's clear extent (z >= -31.00) really does poke into the corner of the box, which
    // reaches z = -30.96. The overlap is FOUR CENTIMETRES and it is entirely lateral, so a
    // centre-line probe could never find it and the check silently proved nothing.
    let roomPt = null;
    const LAT = x.halfW + 1.0;
    for (let d = 0.5; d <= 12 && !roomPt; d += 0.2) {
      for (let l = -LAT; l <= LAT + 1e-9 && !roomPt; l += 0.04) {
        const q = at(x.outSign, d, l);
        if (room.spaceAt(q, 0)) roomPt = q;
      }
    }

    // Closed-panel case: put the padlock back for one call.
    const wasStage = x.panel.state.stage, wasHealth = x.panel.state.stageHealth;
    x.panel.state.stage = 0; x.panel.state.stageHealth = x.panel.state.defs[0].health;
    x.panel._recomputeBox();
    const closedOut = e.outThrough(x, outPt);
    x.panel.state.stage = wasStage; x.panel.state.stageHealth = wasHealth;
    x.panel._recomputeBox();

    // ⚠️ AND WHAT THE RULE WOULD SAY WITHOUT THE `spaceAt` GUARD. A negative case that the
    // other three conditions already reject on their own proves nothing about the fourth, and
    // this is the cheapest way to know which condition is actually carrying it: re-run the
    // remaining three by hand on the same point. If this comes back false the guard is
    // decoration and the comment in game.js claiming otherwise is wrong.
    let inRoomNoGuard = null;
    if (roomPt) {
      const nn = x.panel.normal;
      const dx = roomPt.x - p.x, dz = roomPt.z - p.z;
      const along = Math.abs(dx * nn.x + dz * nn.z);
      const lateral = Math.abs(dx * nn.z - dz * nn.x);
      inRoomNoGuard = !x.panel.blocksMovement() && x.panel.sideOf(roomPt) === x.outSign
        && along >= 0.45 && lateral <= x.halfW + 1.0;
    }

    return {
      id: x.site.id,
      openOut: e.outThrough(x, outPt),                 // must be TRUE — the control
      closedOut,                                       // must be false
      inside: e.outThrough(x, inPt),                   // must be false
      pastJamb: e.outThrough(x, sidePt),               // must be false
      inRoom: roomPt ? e.outThrough(x, roomPt) : null, // must be false, or null if none exists
      inRoomNoGuard,
      roomPtSpace: roomPt ? room.spaceAt(roomPt, 0)?.id ?? null : null,
      roomPt: roomPt ? [+roomPt.x.toFixed(2), +roomPt.z.toFixed(2)] : null,
    };
  });
  note(`escape rule: open+outside=${neg.openOut} · closed+outside=${neg.closedOut} · `
    + `inside=${neg.inside} · past the jamb=${neg.pastJamb} · in a neighbouring room=${neg.inRoom}`);
  if (!neg.openOut) fail('the escape rule fires when it should', 'the positive control is false');
  else if (neg.closedOut) fail('an unopened exit is not an escape', 'a closed panel let it through');
  else if (neg.inside) fail('standing in the room is not an escape', 'inside the room counted');
  else if (neg.pastJamb) fail('walking past the jamb is not an escape', 'outside the aperture counted');
  else if (neg.inRoom === true) fail('being in another room is not an escape',
    `${neg.roomPtSpace} at ${JSON.stringify(neg.roomPt)} counted as outside`);
  else pass('the escape rule refuses every near miss',
    `closed / inside / past the jamb all false${neg.inRoom === null
      ? ' (no neighbouring room on this site’s outside face — that sub-case is not exercised)'
      : `; a body in ${neg.roomPtSpace} at ${JSON.stringify(neg.roomPt)} is refused`}`);

  // Which condition actually did the work on that last one.
  if (neg.inRoom === null) {
    // ⚠️ THE SEED THAT EXERCISES THIS MOVED WHEN THE POOL GREW FROM 4 TO 14, and the hint has
    // to move with it or the next reader chases a stale coordinate. `chooseExit` derives from
    // the pool ORDER, so appending sites re-rolls every seed (`run.js` says so). The chapel
    // vestry — the one site whose escape box overlaps a neighbouring room, by 4 cm — is now
    // `seed=s4`. Re-derive with `chooseExit` rather than trusting this line if it ever fails.
    skip('the "in no space" guard is load-bearing', 'this seed’s site has no neighbouring room in its escape box — try seed=s4 (the chapel vestry)');
  } else if (neg.inRoomNoGuard) {
    pass('the "in no space" guard is load-bearing',
      `without it, a body standing in ${neg.roomPtSpace} at ${JSON.stringify(neg.roomPt)} would score an escape`);
  } else {
    fail('the "in no space" guard is load-bearing',
      'the other three conditions already reject that point, so the negative above tests nothing about the guard');
  }

  // =========================================================================
  // E10 · WINDDOWN IS REACHABLE — the seam for §10.4, which is NOT built
  // =========================================================================
  const seam = await page.evaluate(async () => {
    let m;
    try { m = await import('/src/game/run.js'); } catch (err) { return { err: String(err) }; }
    const pool = window.__rrr.engine.exits.map((x) => x.site.id);
    const mk = () => {
      const r = new m.RunState({ seed: 'seam', sites: pool, authority: true });
      r.addPlayer('a'); r.addPlayer('b');
      return r;
    };
    const seen = [];
    const a = mk();
    a.tick(12.5); a.escape('a');
    seen.push(['first of two out', a.phase, a.bombLeft]);
    a.tick(3.0); a.escape('b');
    seen.push(['second out', a.phase, a.results().escaped.map((e) => `${e.rank}:${e.id}@${e.seconds.toFixed(1)}`)]);

    const b = mk();
    b.tick(9.0); b.escape('a'); b.down('b');
    seen.push(['second one taken', b.phase]);

    const c = mk();
    c.tick(4.0); c.escape('a');
    const cPhases = [];
    c.onPhase((p) => cPhases.push(p));
    c.tick(m.BOMB_SECONDS + 0.1);
    c.tick(m.DETONATION_SECONDS + 0.1);

    const solo = new m.RunState({ seed: 'seam', sites: pool, authority: true });
    solo.addPlayer('a'); solo.tick(7.0); solo.escape('a');

    // a client may not start the wind-down
    const cl = new m.RunState({ seed: 'seam', sites: pool, authority: false });
    cl.addPlayer('a');
    const refusedEscape = cl.escape('a') === null;
    cl.syncPhase('WINDDOWN');
    const acceptsSync = cl.phase === 'WINDDOWN' && cl.bombLeft === m.BOMB_SECONDS;

    return { seen, cPhases, bomb: m.BOMB_SECONDS, det: m.DETONATION_SECONDS,
      solo: solo.phase, soloScore: solo.results().escaped[0]?.seconds ?? null,
      refusedEscape, acceptsSync };
  });
  if (seam.err) skip('the wind-down state is reachable', seam.err);
  else {
    note(`seam: ${JSON.stringify(seam.seen)}`);
    note(`timer chain after the first escape: ${seam.cPhases.join(' -> ')} `
      + `(BOMB_SECONDS ${seam.bomb}, DETONATION_SECONDS ${seam.det} — both UNMEASURED)`);
    note(`solo run: one player out -> ${seam.solo} at ${seam.soloScore}s (no one left inside to strand)`);
    const first = seam.seen[0];
    const chain = seam.cPhases.join('>');
    if (first[1] !== 'WINDDOWN') fail('the first escape starts the wind-down', `phase ${first[1]}`);
    else if (first[2] !== seam.bomb) fail('the wind-down arms the bomb clock', `bombLeft ${first[2]}`);
    else if (seam.seen[1][1] !== 'RESULTS') fail('the last player out ends the run', seam.seen[1][1]);
    else if (seam.seen[2][1] !== 'RESULTS') fail('the last player taken ends the run', seam.seen[2][1]);
    else if (chain !== 'DETONATION>RESULTS') fail('the timer runs WINDDOWN -> DETONATION -> RESULTS', chain);
    else if (seam.solo !== 'RESULTS') fail('a solo escape ends the run', seam.solo);
    else if (!seam.refusedEscape || !seam.acceptsSync)
      fail('a client cannot start the wind-down itself', `refusedEscape=${seam.refusedEscape} acceptsSync=${seam.acceptsSync}`);
    else pass('WINDDOWN and DETONATION are reachable states, not comments',
      `2 players: first out -> WINDDOWN (bomb ${seam.bomb}s) -> DETONATION -> RESULTS; `
      + 'solo -> RESULTS; a non-authority client is refused and accepts sync');
  }

  // =========================================================================
  // E6 · WALK OUT. The whole point.
  // =========================================================================
  // Let the clock run first, so the score below is a number the board could actually rank and
  // not an artefact of the `resetRound` two checks ago.
  //
  // ⚠️ WAIT ON THE GAME CLOCK, NOT ON WALL TIME — and this is not a precaution, it is a bug
  // that was caught here. `await page.waitForTimeout(2500)` made this check fail about half the
  // time with a run clock of 0.02 s, because THE FIRST `resetRound()` OF A SESSION COSTS ABOUT
  // THREE SECONDS OF WALL TIME. Measured on a fresh page: sync cost 1.1 ms, but 3002 ms before
  // five frames land; the second reset in the same session costs 93 ms, i.e. nothing. So the
  // 2.5 s "wait" was spent entirely inside one stalled frame and the world never moved.
  // (That stall is NOT this round's work — the exit-plan re-apply measures 0.0 ms sync / 91 ms
  // to five frames on its own, as does re-applying all twelve panels. It is reported in the
  // round's findings as a pre-existing hitch, and it also hits the capture Director, which
  // calls `resetRound()` every 28 s.)
  const ticked = await waitFor(() => (window.__rrr?.engine?.run?.t ?? 0) >= 2.5, { timeout: 20000 });
  if (!ticked) note('WARNING: the run clock did not reach 2.5 s in 20 s of wall time');
  const outcome = await page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run;
    const x = e.exits.find((q) => run.isLiveExit(q.site.id));
    const n = x.panel.normal, p = x.panel.root.position;
    // STAND IN THE OPENING — 0.25 m out, i.e. still inside the 0.30 m wall band. In no space,
    // on the outside side of the plane, inside the aperture: everything the rule wants EXCEPT
    // the 0.45 m clearance. This is the frame before the win and it must not count.
    e.player.pos.set(p.x + n.x * x.outSign * 0.25, e.room.floorY, p.z + n.z * x.outSign * 0.25);
    e.player.vel.set(0, 0, 0);
    return { midway: e.outThrough(x, e.player.pos), phase: run.phase, t: +run.t.toFixed(2),
      f: window.__rrr.frames(), id: x.site.id };
  });
  await step(2);
  const walked = await page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run;
    const x = e.exits.find((q) => run.isLiveExit(q.site.id));
    const n = x.panel.normal, p = x.panel.root.position;
    e.player.pos.set(p.x + n.x * x.outSign * 1.1, e.room.floorY, p.z + n.z * x.outSign * 1.1);
    e.player.vel.set(0, 0, 0);
    return { pos: [+e.player.pos.x.toFixed(2), +e.player.pos.z.toFixed(2)] };
  });
  await step(3);
  const done = await page.evaluate(() => {
    const e = window.__rrr.engine, r = e.run.results();
    return { phase: e.run.phase, r, log: window.__esc, overlay: !!document.querySelector('#rrr-escape'),
      overlayTime: document.querySelector('#rrr-escape-time')?.textContent ?? null,
      death: !!document.querySelector('#rrr-death') };
  });
  note(`in the opening: escaped=${outcome.midway} at t=${outcome.t}s frame=${outcome.f} (phase ${outcome.phase}) · stepped out at ${JSON.stringify(walked.pos)}`);
  note(`session log: escapes ${JSON.stringify(done.log?.escapes)} · phases ${JSON.stringify(done.log?.phases)}`
    + ` · run.reset() calls ${JSON.stringify(done.log?.resets)}`);
  note(`result: ${JSON.stringify(done.r)}`);
  if (outcome.midway) fail('standing in the opening is not yet out', 'fired one step early');
  else if (done.phase !== 'RESULTS') fail('walking out ends the run', `phase ${done.phase}`);
  else if (!done.r.escaped.length || !(done.r.escaped[0].seconds >= 2.0))
    fail('walking out is scored', `expected a clock of at least 2 s: ${JSON.stringify(done.r)}`);
  else pass('a player who walks out of the house wins the run',
    `p1 rank 1 through ${done.r.exitId} (lock "${done.r.lock}") at ${done.r.escaped[0].seconds.toFixed(1)} s`);
  await shot('esc2-results');

  // =========================================================================
  // E8 · and the game SAYS SO, with the same weight as the death screen
  // =========================================================================
  if (done.death) fail('the win screen is not the death screen', 'both overlays are up at once');
  else if (!done.overlay) fail('escaping puts a win screen on screen', '#rrr-escape not in the DOM');
  else if (!/^\d+:\d\d\.\d$/.test(String(done.overlayTime ?? '')))
    fail('the win screen shows the time', `read "${done.overlayTime}"`);
  else pass('the win screen exists and reads the run clock', `#rrr-escape shows ${done.overlayTime}`);
}
