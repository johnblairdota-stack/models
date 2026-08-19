/**
 * CONN-1 — the connector interface, and whether a closed connector gives anything away.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/conn-1.mjs \
 *        --port 5243 --q "seed=s4"
 *   ...--q "seed=s4&tells=marked"      the shipped rule, which this file must FAIL C6 on
 *   ...--q "seed=s4&tells=off"         no dressing at all
 *
 * `docs/design/procedural-map.md` §6 step 1 and step 2. Two questions, and the second one only
 * means anything if the first is true:
 *
 *   C1-C5  is there ONE interface, does every connector go through it, and did retrofitting the
 *          existing plan onto it change anything?
 *   C6-C8  from the closed side, are breachable / chained / exit indistinguishable?
 *
 * ⚠️ EVERY ASSERTION THAT COULD PASS ON BROKEN CODE IS BROKEN ONCE HERE FIRST. C3 re-resolves
 * every exit site under BOTH states and requires the aperture to be identical — a test that
 * would pass trivially if `resolveConnector` returned constants, so C3b changes the state and
 * requires the STAGE TABLE to move. C6 runs the seeded dressing against a deliberately wrong
 * state argument and requires the answer not to change, and C6b asks the same question in
 * `marked` and requires it to change, so the probe is shown to be able to see the difference it
 * claims is absent.
 */

export default async function conn1({ page, note, pass, fail, skip }) {
  const step = async (n = 3) => {
    const f0 = await page.evaluate(() => window.__rrr?.frames?.() ?? 0);
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(40);
      const f = await page.evaluate(() => window.__rrr?.frames?.() ?? 0);
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };

  const head = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.room || !e.run) return null;
    return {
      connectors: e.room.connectors?.length ?? null,
      panels: e.room.panels.length,
      pool: e.exits.length,
      seed: String(e.run.seed), live: e.run.exitId, lock: e.run.lock.id,
      tells: e.exterior?.tells ?? null,
    };
  });
  if (!head?.connectors) {
    fail('the room exposes its connectors', 'room.connectors is not there — the retrofit is not wired');
    return;
  }
  note(`seed "${head.seed}" · ${head.connectors} connectors · ${head.panels} panels`
    + ` · ${head.pool} exit sites · live ${head.live} (${head.lock}) · tells=${head.tells}`);

  // =========================================================================
  // C1 · every hole in every wall is a connector, and the four states are all present
  // =========================================================================
  const census = await page.evaluate(async () => {
    const C = await import('/src/game/connectors.js');
    const e = window.__rrr.engine;
    const plan = { exitId: e.run.exitId, lock: e.run.lock };
    const rows = e.room.connectors.map((c) => {
      const r = C.resolveConnector(c, plan);
      return { id: r.id, state: r.state, w: r.w, h: r.h, cy: r.cy, noise: r.noise,
        startStage: r.startStage, defsLen: r.defs ? r.defs.length : 0,
        hp0: r.defs ? r.defs[0].health : null, passable: r.passable };
    });
    const byState = {};
    for (const r of rows) byState[r.state] = (byState[r.state] ?? 0) + 1;
    return { rows, byState };
  });
  const need = ['open', 'breachable', 'chained', 'exit'];
  const missing = need.filter((s) => !census.byState[s]);
  note(`states this run: ${JSON.stringify(census.byState)}`);
  missing.length
    ? fail('all four connector states exist in the built house', `missing ${missing.join(', ')}`)
    : pass('all four connector states exist in the built house', JSON.stringify(census.byState));

  // =========================================================================
  // C2 · every DestructibleWall in the house came from a connector, and its stage table is the
  //      one its state says it should be. This is the "does anything read the flag" check —
  //      HANDOFF's own rule that a flag in a data table is not a feature until something does.
  // =========================================================================
  const wired = await page.evaluate(async () => {
    const C = await import('/src/game/connectors.js');
    const w = await import('/src/destruction/wall.js');
    const D = await import('/src/game/dig.js');
    const e = window.__rrr.engine;
    const plan = { exitId: e.run.exitId, lock: e.run.lock };
    const bad = [];
    for (const p of e.room.panels) {
      const spec = e.room.connector(p.id);
      if (!spec) { bad.push(`${p.id}: no connector`); continue; }
      const r = C.resolveConnector(spec, plan);
      const table = p.state.defs === w.STAGE_DEFS ? 'STAGE_DEFS'
        : p.state.defs === C.CHAINED_DEFS ? 'CHAINED_DEFS'
          : p.state.defs === C.EXIT_DEFS ? 'EXIT_DEFS'
            : p.state.defs === D.DIG_DEFS ? 'DIG_DEFS'
              : p.state.defs === D.DIG_OPEN_DEFS ? 'DIG_OPEN_DEFS' : 'other';
      /**
       * ⚠️ **A DIG SEGMENT IS AUTHORED `breachable` AND DOES NOT RUN `STAGE_DEFS`, AND THAT IS
       * THE DESIGN RATHER THAN A HOLE IN IT.** `dig.md` §5's whole mechanic is a wall whose
       * layers cost more the deeper you go and which bottoms out at masonry, so its table is
       * `DIG_DEFS` — or `DIG_OPEN_DEFS` for the one segment per edge the run made the way
       * through, and for every segment once the house-wide unlock has fired. `?dig=0` builds no
       * segments at all, so this branch is unreachable on the shipping build.
       */
      const want = spec.dig ? (p.state.canOpen() ? 'DIG_OPEN_DEFS' : 'DIG_DEFS')
        : r.state === 'exit' ? 'EXIT_DEFS' : r.state === 'chained' ? 'CHAINED_DEFS' : 'STAGE_DEFS';
      if (table !== want) bad.push(`${p.id}: ${r.state} runs on ${table}, wanted ${want}`);
      if (p.state.stage !== r.startStage) bad.push(`${p.id}: stage ${p.state.stage} wanted ${r.startStage}`);
      if (Math.abs(p.width - r.w) > 1e-9 || Math.abs(p.height - r.h) > 1e-9) {
        bad.push(`${p.id}: built ${p.width}x${p.height}, interface says ${r.w}x${r.h}`);
      }
    }
    return { bad, n: e.room.panels.length };
  });
  wired.bad.length
    ? fail('every built panel matches its resolved connector', wired.bad.slice(0, 4).join(' | '))
    : pass('every built panel matches its resolved connector',
      `${wired.n} panels: stage table, start stage and aperture all from resolveConnector()`);

  // =========================================================================
  // C3 · THE APERTURE IS NOT A FUNCTION OF THE STATE. Flip every exit site live and back and
  //      require the hole not to move — this is what makes "same jamb, same architrave" a
  //      property of the code rather than a promise.
  // =========================================================================
  const flip = await page.evaluate(async () => {
    const C = await import('/src/game/connectors.js');
    const e = window.__rrr.engine;
    const sites = e.exits.map((x) => x.site.id);
    const moved = [], frozen = [];
    for (const id of sites) {
      const spec = e.room.connector(id);
      const live = C.resolveConnector(spec, { exitId: id, lock: e.run.lock });
      const dead = C.resolveConnector(spec, { exitId: '__nothing__', lock: e.run.lock });
      if (live.w !== dead.w || live.h !== dead.h || live.cy !== dead.cy) moved.push(id);
      // ...and the state DID change, or the test above proves nothing
      if (live.state !== 'exit' || dead.state !== 'chained') frozen.push(`${id}:${live.state}/${dead.state}`);
      if (live.defs === dead.defs) frozen.push(`${id}: same stage table both ways`);
    }
    return { moved, frozen, n: sites.length };
  });
  if (flip.frozen.length) {
    fail('the aperture is not a function of the state (probe can see a difference)',
      `the flip did not change what it should: ${flip.frozen.slice(0, 3).join(', ')}`);
  } else if (flip.moved.length) {
    fail('the aperture is not a function of the state', `${flip.moved.length} sites move: ${flip.moved.slice(0, 3)}`);
  } else {
    pass('the aperture is not a function of the state',
      `${flip.n} sites: w/h/cy identical live vs chained, while the stage table changes on every one`);
  }

  // =========================================================================
  // C4 · ⚠️ D7 IS 1.20 AND IT IS STILL A MECHANIC. The interface's whole risk is that "one
  //      clear width" quietly normalises it — which would not throw, would not show up in a
  //      capture, and would simply mean the chapel stops being a refuge.
  // =========================================================================
  const d7 = await page.evaluate(async () => {
    const C = await import('/src/game/connectors.js');
    const e = window.__rrr.engine;
    const spec = e.room.connector('D7');
    if (!spec) return null;
    const w = C.clearWidth(spec);
    const edge = e.room.portals().find((p) => p.id === 'D7');
    // The BFS is the thing that has to respect it. A stage-3 body needs 2 x 0.66 = 1.32 m.
    const need = (s) => 2 * (0.30 + s * 0.12);
    const route = (s) => e.room.pathPortals('gallery', 'chapel', need(s)).map((p) => p.id);
    return { w, edgeW: edge?.w ?? null, r1: route(1), r2: route(2), r3: route(3) };
  });
  if (!d7) {
    /**
     * 🪦 **D7 WAS DELETED ON 2026-08-08 AND THIS PROBE IS ITS HEADSTONE.**
     *
     * John, after a dig playthrough: *"Can you remove all the 'door' structures in the gallery
     * except the one that leads into the spawn point."* `gallery-doors-1` removed D2, D3 and D7,
     * keeping only D1 into the spawn room, and verified solvability over 512 seeds.
     *
     * ⚠️ **What went with D7 is bigger than one doorway, and it should not be quietly forgotten.**
     * D7's 1.20 m was the **only** sub-1.32 m connector in the entire house — 1.32 m being what a
     * stage-3 `HunterAI` body needs. So its removal did not relocate *"the chapel is a refuge that
     * growth takes away"*; **it deleted the whole mechanic class.** No connector anywhere now
     * distinguishes a small hunter from a grown one. The chapel is still costly to enter (only
     * `p.chapel`, a loud ~4.7 s breach) but it no longer cares how big the thing chasing you is.
     *
     * This is recorded as a SKIP rather than a PASS or a FAIL because neither is honest: the
     * mechanic is not working (so not a pass) and nothing is broken (so not a fail). **If the
     * refuge idea is ever re-earned by another means, rewrite this probe against that instead of
     * deleting it** — the assertion it makes is still the right one, it just has no subject.
     */
    skip('D7 is still 1.20 m and still refuses a stage-3 hunter',
      'D7 deleted 2026-08-08 (John: remove the gallery doors) — with it, the only sub-1.32 m connector in the house, i.e. the entire hunter-refuge mechanic. See the note here before re-adding.');
  } else {
    note(`D7 clear width ${d7.w} (BFS edge ${d7.edgeW}) · stage1 route ${JSON.stringify(d7.r1)}`
      + ` · stage2 ${JSON.stringify(d7.r2)} · stage3 ${JSON.stringify(d7.r3)}`);
    const ok = d7.w === 1.20 && d7.edgeW === 1.20
      && d7.r1.includes('D7') && d7.r2.includes('D7') && !d7.r3.includes('D7');
    ok ? pass('D7 is still 1.20 m and still refuses a stage-3 hunter',
      'stages 1 and 2 route through it (0.84 / 1.08 m), stage 3 (1.32 m) does not')
      : fail('D7 is still 1.20 m and still refuses a stage-3 hunter', JSON.stringify(d7));
  }

  // =========================================================================
  // C5 · the noise strength comes off the STATE, not off pool membership. Before the retrofit
  //      all fourteen sites were the loud value, which was harmless only because thirteen of
  //      them can never emit a transition — until §8's detonation opens them all at once.
  // =========================================================================
  {
    const loud = census.rows.filter((r) => r.noise > 2);
    loud.length === 1 && loud[0].state === 'exit'
      ? pass('only the live exit is heard across the whole house',
        `${loud[0].id} at ${loud[0].noise} (47.6 m); the other ${census.rows.length - 1} at 1.25 (17.5 m)`)
      : fail('only the live exit is heard across the whole house',
        `${loud.length} loud connectors: ${loud.map((r) => `${r.id}/${r.state}`).join(', ')}`);
  }

  // =========================================================================
  // C6 · ⚠️ THE STEP-2 ASSERTION. From the closed side, breachable / chained / exit must be
  //      indistinguishable. Measured two ways: the dressing must not READ the state, and the
  //      house must actually contain connectors of every state wearing every combination.
  // =========================================================================
  const dressing = await page.evaluate(async () => {
    const C = await import('/src/game/connectors.js');
    const e = window.__rrr.engine;
    const mode = e.exterior.tells;
    const plan = { exitId: e.run.exitId, lock: e.run.lock };
    const rows = [];
    let reads = 0;
    for (const p of e.room.panels) {
      const spec = e.room.connector(p.id);
      const r = C.resolveConnector(spec, plan);
      const outside = r.b === 'outside';
      const asIs = e.exterior.dressingOf(p.id);
      // the same question with a deliberately WRONG state — `outside` is a physical fact about
      // the connector, not a state, so it is passed straight through rather than lied about.
      const lied = C.connectorDressing(p.id, e.run.seed, mode, r.state === 'exit' ? 'breachable' : 'exit', outside);
      const key = (d) => `${d.chain ? 'C' : '-'}${d.seam ? 'S' : '-'}${d.boards ? 'B' : '-'}${d.mortar ? 'M' : '-'}`;
      if (mode === 'blind' && key(asIs) !== key(lied)) reads++;
      rows.push({ id: p.id, state: r.state, outside, dress: key(asIs) });
    }
    // how many DIFFERENT states wear each dressing combination
    const combos = {};
    for (const r of rows) {
      combos[r.dress] ??= new Set();
      combos[r.dress].add(r.state);
    }
    return { mode, rows, reads, combos: Object.fromEntries(Object.entries(combos).map(([k, v]) => [k, [...v]])) };
  });
  note(`dressing by connector (${dressing.mode}): `
    + dressing.rows.map((r) => `${r.id}=${r.dress}`).join(' '));
  note(`combination -> states wearing it: ${JSON.stringify(dressing.combos)}`);

  if (dressing.mode !== 'blind') {
    skip('a closed connector does not report its own state', `tells=${dressing.mode} — that mode marks it on purpose`);
  } else {
    const live = dressing.rows.find((r) => r.state === 'exit');
    const twins = dressing.rows.filter((r) => r.state !== 'exit' && r.dress === live?.dress);
    // ⚠️ "THE LIVE EXIT WEARS A COMBINATION NOTHING ELSE WEARS" IS NOT, BY ITSELF, A TELL, AND
    // AN ASSERTION THAT TREATS IT AS ONE IS WRONG. In a house of N connectors some combinations
    // are always going to be worn once; what would make it a tell is the live exit being MORE
    // LIKELY to be the unique one than anything else. Measured over 512 seeds on the shipping
    // pool: any connector is unique in its run **15.7%** of the time and the live exit is
    // unique **15.4%** of the time — the same number. So uniqueness is reported, and the
    // pass/fail is the property that actually matters: the dressing never reads the state.
    const uniques = dressing.rows.filter((r) => dressing.rows.filter((q) => q.dress === r.dress).length === 1);
    note(`connectors wearing a combination nothing else wears: ${uniques.length}/${dressing.rows.length}`
      + ` (${uniques.map((u) => `${u.id}/${u.state}`).join(' ')})`);
    if (dressing.reads) {
      fail('a closed connector does not report its own state',
        `${dressing.reads} connectors change dressing with state`);
    } else if (!live) {
      fail('a closed connector does not report its own state', 'no live exit in this build');
    } else {
      pass('a closed connector does not report its own state',
        `dressing never reads state (${dressing.rows.length}/${dressing.rows.length}); the live exit wears `
        + `"${live.dress}", shared with ${twins.length} other connector(s)`
        + `${twins.length ? ` (${[...new Set(twins.map((t) => t.state))].join(', ')})` : ''}`
        + `; ${uniques.length} of ${dressing.rows.length} connectors wear a combination nothing else does`);
    }

    // C6c · ⚠️ THE SEAM IS PHYSICAL, NOT DECORATIVE. `play-critic-8` measured 4-5 of the 8
    // interior breachable panels wearing the daylight seam, including a wall between the
    // service passage and the west study — both interior, both dark, and it opened onto a room
    // in 1.25 s. `connectorDressing`'s `outside` argument gates it to connectors whose far side
    // is `outside` (the 14-site exit-candidate pool); this asserts the gate actually holds in
    // the built house, this run. (The 512-seed "does it correlate with liveness" measurement —
    // `procedural-map.md` §2's real question — is `harness/_tmp_seam_correlation.mjs`, which
    // reuses these exact functions without paying for 512 page loads: interior 0/4096, live
    // exit 45.7% against the exterior pool's own 46.4%.)
    const wrongSeam = dressing.rows.filter((r) => !r.outside && /S/.test(r.dress));
    wrongSeam.length
      ? fail('the daylight seam only appears on a connector whose far side is outside',
        `${wrongSeam.length} interior panel(s) wear it: ${wrongSeam.map((r) => r.id).join(', ')}`)
      : pass('the daylight seam only appears on a connector whose far side is outside',
        `0 of ${dressing.rows.filter((r) => !r.outside).length} interior panels wear it this run`);
  }

  // C6b · the probe can see a difference when there is one. Same call, `marked` rule.
  const canSee = await page.evaluate(async () => {
    const C = await import('/src/game/connectors.js');
    const e = window.__rrr.engine;
    let differs = 0;
    for (const p of e.room.panels) {
      const a = C.connectorDressing(p.id, e.run.seed, 'marked', 'exit');
      const b = C.connectorDressing(p.id, e.run.seed, 'marked', 'breachable');
      if (a.chain !== b.chain || a.seam !== b.seam) differs++;
    }
    return differs;
  });
  canSee > 0
    ? pass('the indistinguishability probe can detect a tell when there is one',
      `under the shipped "marked" rule the same call differs on ${canSee}/${wired.n} connectors`)
    : fail('the indistinguishability probe can detect a tell when there is one',
      'marked and blind gave the same answer — the probe is blind, not the connectors');

  // =========================================================================
  // C7 · the two DAYLIGHT cues are off while the live exit still blocks sight. That is the
  //      half of step 2 that protects the payoff: the reveal is bought at the beam stage.
  // =========================================================================
  await step(6);
  const cues = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const s = e.exterior.sites?.get?.(e.run.exitId);
    if (!s) return null;
    const p = s.exit.panel;
    // ⚠️ ASK WHETHER IT IS DRAWN, NOT WHETHER ITS OWN FLAG IS SET. `s.draught.visible` is true
    // whenever the object has not been individually hidden — and it never is, because its
    // PARENT is what gets switched. HANDOFF's own rule, from the other end: `root.visible =
    // false` is not an ablation, and by the same token `child.visible === true` is not evidence
    // that anything is on screen. The first version of this check read the raw flag and failed
    // on a correct build.
    const drawn = (o) => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
    return {
      mode: e.exterior.tells, stage: p.state.stage, blocksSight: p.blocksSight(),
      lightVisible: s.light.visible, spill: +s.spill.material.uniforms.uStrength.value.toFixed(3),
      draught: drawn(s.draught), spillDrawn: drawn(s.spill),
    };
  });
  if (!cues) skip('the daylight cues wait for the reveal', 'no live yard in this build');
  else if (cues.mode !== 'blind') skip('the daylight cues wait for the reveal', `tells=${cues.mode}`);
  else if (!cues.blocksSight) {
    // a `beams` lock starts at stage 3, where the wall is already see-through — see the note in
    // exterior.js. Reported honestly rather than passed.
    skip('the daylight cues wait for the reveal',
      `this run's lock starts at stage ${cues.stage}, which does not block sight — the reveal is free here`);
  } else {
    cues.draught === false && cues.spillDrawn === false
      ? pass('the daylight cues wait for the reveal',
        `stage ${cues.stage} blocks sight: neither the spill nor the draught reaches the screen`
        + ' until the beam stage, which is where the 15-25 s of work buys the answer')
      : fail('the daylight cues wait for the reveal', JSON.stringify(cues));
  }

  // =========================================================================
  // C8 · what the dressing costs. Instanced, so it is a constant and not a function of the
  //      seed — which is the whole reason it is instanced: a per-panel version would blow a
  //      625-call budget on some seeds and not others, and no single capture would find it.
  // =========================================================================
  const cost = await page.evaluate(() => {
    const e = window.__rrr.engine;
    let dress = 0, dressTris = 0;
    e.scene.traverse((o) => {
      if (!o.isInstancedMesh || !/^exterior\.dress\./.test(o.name)) return;
      dress++;
      dressTris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
    });
    return { dress, dressTris: Math.round(dressTris), census: e.exterior.census() };
  });
  note(`dressing: ${cost.dress} instanced meshes (${cost.dressTris} tris of geometry, shared)`
    + ` in ${cost.census.dressFamilies?.length ?? 1} authored famil${(cost.census.dressFamilies?.length ?? 1) === 1 ? 'y' : 'ies'}`
    + ` [${(cost.census.dressFamilies ?? []).join(' ')}] · drawing ${cost.census.dressCalls}`
    + ` (${JSON.stringify(cost.census.dressCallsBy ?? {})}) · shown now ${JSON.stringify(cost.census.dressedNow)}`);
  /**
   * ⚠️ **THIS ASSERTION USED TO BE `=== 4` AND IT HAD TO CHANGE, SO HERE IS EXACTLY WHAT CHANGED
   * AND WHAT DID NOT.** The claim was never "four" — it was *"a CONSTANT, not a function of the
   * seed"*, and the reason is stated a few lines up: a per-panel version would blow the 625-call
   * budget on some seeds and not others, which no single capture would ever find.
   *
   * `?dig=1` adds a second authored FAMILY at segment scale (`exterior.js` `SEG_FAMILY`), because
   * hardware authored at 2.08 x 2.68 and scaled onto a 1.14 x 1.80 bay came out 0.55 x 0.67 —
   * a shrunken padlock, which is a worse tell than none. So the constant is **four per family**,
   * the family count is a property of the BUILD FLAG and not of the seed, and a family with
   * nothing shown drops to `visible = false` and costs zero. All three of those are asserted.
   */
  const fams = cost.census.dressFamilies?.length ?? 1;
  const perFam = cost.dress / Math.max(1, fams);
  (perFam === 4 && cost.census.dressCalls <= cost.dress && fams === (head.panels > 22 ? 2 : 1))
    ? pass('the dressing costs a constant four draw calls per authored family, whatever the seed',
      `${fams} famil${fams === 1 ? 'y' : 'ies'} x 4 InstancedMeshes over every connector in the `
      + `house; ${cost.census.dressCalls} of the ${cost.dress} are actually submitted at this `
      + `station, because a family with nothing shown is not drawn. The family count comes from `
      + `\`?dig=\`, not from the seed.`)
    : fail('the dressing costs a constant four draw calls per authored family, whatever the seed',
      `${cost.dress} meshes in ${fams} families (${perFam}/family), ${cost.census.dressCalls} drawn`);
}
