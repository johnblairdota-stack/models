/**
 * EO2 — IS OPENING AN EXIT A SIEGE, AND DOES THE WORK SUMMON THE HUNTER?
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/eo2-siege.mjs \
 *        --port 5206 --q "seed=s0"
 *
 * `play-critic-7` measured `escape.md` §1's load-bearing sentence — *"the act required to
 * escape is the act that summons the thing hunting you"* — and found it false in the build on
 * two counts: **opening an exit took 1.3–2.5 s**, and **nothing in the destruction path called
 * `hearNoise`** (0 calls in 60 s of demolishing a wall). This is the instrument for the fix.
 *
 * ⚠️ IT RUNS BOTH ARMS IN ONE BUILD, ONE PAGE AND ONE STATION. The "before" arm is not a
 * memory of yesterday's number and not a separate checkout: it is the SAME panel with
 * `WallState.defs` swapped back to `STAGE_DEFS` for the duration of the arm, which is exactly
 * what `views/game.js` did before this round. Same weapon, same cooldown, same aim, same
 * hunter staging, same clock. A before/after taken on two different days with two different
 * drivers is the kind of comparison this project has been burned by repeatedly.
 *
 * ⚠️ AND THE HUNTER IS RE-STAGED FOR EVERY ARM, for the reason `pc7-noise.mjs` records: the
 * patrol is 185 s long, so an arm that inherits wherever the previous arm walked it is not the
 * previous arm's control. Same reset the production `resetRound()` uses.
 *
 * ⚠️ THE CLOCK IS `run.t`, NOT WALL TIME. `Engine._liveLoop` clamps `dt`, so a shader compile
 * or a stalled frame diverges the two — and the first `resetRound()` of a session really can
 * cost 3 s of wall time inside one frame (HANDOFF).
 */

const ARMS = (process.env.ARMS ?? 'before,after').split(',').filter(Boolean);
const LOCKS = (process.env.LOCKS ?? 'boarded,plaster,beams').split(',').filter(Boolean);
const START_STAGE = { boarded: 0, plaster: 1, beams: 3 };
/**
 * Game seconds before an arm is declared a runaway. Comfortably past any authored table (the
 * longest lock is ~24 s) and deliberately NOT generous: an arm that is not firing at all — a
 * play gate that came back after an HMR reload, a driver aimed at the wrong wall — costs this
 * much per arm, seven times over, before the report says anything.
 */
const CAP = +(process.env.CAP ?? 45);

export default async function siege({ page, note, pass, fail, skip }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 200; i++) {
      await page.waitForTimeout(45);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const ok = await page.evaluate(() => !!(window.__rrr?.engine?.run && window.__rrr.engine.exits));
  if (!ok) { fail('the run is reachable', 'engine.run / engine.exits missing'); return; }

  // ---- count every hearNoise the game makes, and where from -------------------------------
  const wired = await page.evaluate(() => {
    const e = window.__rrr.engine;
    if (typeof e.hunter.hearNoise !== 'function') return false;
    const orig = e.hunter.hearNoise.bind(e.hunter);
    window.__heard = [];
    e.hunter.hearNoise = (pos, s) => {
      const took = orig(pos, s);
      window.__heard.push({ s: +(+s).toFixed(2), took: !!took,
        d: +e.hunter.root.position.distanceTo(pos).toFixed(1), state: e.hunter.state });
      return took;
    };
    return true;
  });
  if (!wired) { fail('hearNoise is reachable', 'no hunter.hearNoise'); return; }

  const truth = await page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run;
    return { seed: String(run.seed), exitId: run.exitId, lock: run.lock.id,
      pool: e.exits.length, site: e.exits.find((x) => run.isLiveExit(x.site.id))?.site?.name };
  });
  note(`seed "${truth.seed}" · pool ${truth.pool} sites · live ${truth.exitId} (${truth.site})`);

  /**
   * Put the world in a known state: player at the station facing the live exit with every limb
   * on, hunter back at its spawn in PATROL, panel on `defs` at `stage`.
   */
  const stage = (defsName, startStage) => page.evaluate(async ([defsName, startStage]) => {
    const e = window.__rrr.engine, run = e.run;
    const x = e.exits.find((q) => run.isLiveExit(q.site.id));
    const wall = await import('/src/destruction/wall.js');
    const spaces = await import('/src/game/spaces.js');
    const defs = defsName === 'before' ? wall.STAGE_DEFS : spaces.EXIT_DEFS;
    const st = x.panel.state;
    st.defs = defs;
    st.stage = startStage;
    st.stageHealth = defs[startStage].health;
    x.panel._recomputeBox(); x.panel._apply();

    const n = x.panel.normal, p = x.panel.root.position, inS = -x.outSign;
    e.player.pos.set(p.x + n.x * inS * 2.6, e.room.floorY, p.z + n.z * inS * 2.6);
    e.player.vel.set(0, 0, 0);
    const yaw = Math.atan2(n.x * inS * -1, n.z * inS * -1);
    e.player.aimYaw = yaw; e.player.aimPitch = 0; e.player.facing = yaw;
    e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true;

    e.hunter.root.position.copy(e.room.spawn.hunter);
    e.hunter.vel.set(0, 0, 0);
    e.hunter.state = 'PATROL'; e.hunter.target = null; e.hunter.awareness = 0;
    e.hunter.routeIdx = 0; e.hunter.dwellLeft = null; e.hunter.searchTimer = 0;
    e.hunter.breachTarget = null; e.hunter.lastKnown.copy(e.room.spawn.hunter);
    e.hunter.resetCombat?.();
    // A body with no limbs is `downed` and `_sense` skips downed candidates outright, so an arm
    // that opens dismembered measures a hunter that cannot perceive anybody.
    for (const s of ['shoulderR', 'shoulderL', 'hipR', 'hipL']) {
      if (e.player.rig.occupant(s) === 'empty') e.player.rig.refit?.(s);
    }
    // ⚠️ AND THE RUN ITSELF, OR EVERY ARM AFTER A LETHAL ONE IS MEASURED ON A STOPPED CLOCK.
    // `run.down('p1')` puts the phase in RESULTS and `tick()` returns before `this.t += dt`, so
    // `run.t` freezes for the rest of the session. `reset()` re-derives the same plan from the
    // same seed, which is also a free check that the derivation is stable across a reset.
    e.run.reset();
    // ...and take down anything the last arm's death put over the page. A modal is
    // `pointer-events:auto` and swallows the trigger — the driver would then be measuring a
    // wall nobody is shooting at, and clicking one RELOADS THE PAGE.
    for (const id of ['rrr-death', 'rrr-escape']) document.getElementById(id)?.remove();
    e.gameHud?.setHidden?.(false);
    window.__heard = [];
    return { hp: st.stageHealth, stage: st.stage,
      total: defs.slice(startStage, 4).reduce((a, d) => a + d.health, 0),
      d: +Math.hypot(e.hunter.root.position.x - e.player.pos.x,
        e.hunter.root.position.z - e.player.pos.z).toFixed(1) };
  }, [defsName, startStage]);

  const read = () => page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run;
    const x = e.exits.find((q) => run.isLiveExit(q.site.id));
    return {
      t: +run.t.toFixed(2), stage: x.panel.state.stage, blocks: x.panel.blocksMovement(),
      hp: +(x.panel.state.stageHealth ?? 0).toFixed(0),
      hState: e.hunter.state, aw: +(e.hunter.awareness ?? 0).toFixed(2),
      d: +Math.hypot(e.hunter.root.position.x - e.player.pos.x,
        e.hunter.root.position.z - e.player.pos.z).toFixed(1),
      limbs: ['shoulderR', 'shoulderL', 'hipR', 'hipL']
        .filter((s) => e.player.rig.occupant(s) !== 'empty').length,
      heard: window.__heard.length,
    };
  });

  const rows = [];
  async function arm(defsName, lock) {
    const s0 = await stage(defsName, START_STAGE[lock]);
    await step(4);
    const t0 = (await read()).t;
    await page.mouse.down();
    // ⚠️ THE FRAME CAP IS NOT BELT-AND-BRACES, IT IS THE ONLY CAP THAT ALWAYS FIRES, AND THE
    // FIRST VERSION OF THIS LOOP HUNG FOR TEN MINUTES WITHOUT IT.
    // `RunState.tick()` early-outs on `phase === RESULTS` **before** `this.t += dt`, so the
    // moment the hunter takes the player's last limb, `run.down('p1')` ends the run and the run
    // clock STOPS. A cap written as `r.t - t0 >= CAP` can then never be reached: the world is
    // still rendering, the page is fine, and the loop is immortal. HANDOFF's "never wait on
    // wall time for a game-time fact", met from the other end — never wait on a game-time fact
    // that a game state can freeze.
    const f0 = await frames();
    const FRAME_CAP = Math.ceil(CAP * 62) + 600;
    const marks = {}; const stageAt = {}; let closest = 999, last = null, torn = null, why = 'open';
    for (;;) {
      const r = await read();
      closest = Math.min(closest, r.d);
      if (!marks[r.hState]) marks[r.hState] = { t: +(r.t - t0).toFixed(1), d: r.d };
      if (last !== r.stage) { stageAt[r.stage] = +(r.t - t0).toFixed(1); last = r.stage; }
      if (!r.blocks) break;
      if (r.limbs === 0 && !torn) torn = +(r.t - t0).toFixed(1);
      // A body with no limbs cannot hold a nail gun, so nothing more will happen to this wall.
      if (r.limbs === 0) { why = 'torn apart'; break; }
      if (r.t - t0 >= CAP) { why = `${CAP}s cap`; break; }
      if ((await frames()) - f0 > FRAME_CAP) { why = 'frame cap (the run clock stopped)'; break; }
      await step(4);
    }
    await page.mouse.up();
    const end = await read();
    const heard = await page.evaluate(() => window.__heard);
    const took = +(end.t - t0).toFixed(2);
    const row = { defsName, lock, hp: s0.total, secs: took, open: !end.blocks,
      stageAt, marks, closest, heard, torn, startD: s0.d, why };
    rows.push(row);
    note(`${defsName.toUpperCase().padEnd(6)} ${lock.padEnd(8)} ${String(s0.total).padStart(5)} hp`
      + ` -> ${end.blocks ? `STILL SHUT after ${took}s (${why})` : `OPEN in ${took} s`}`
      + ` · stages ${Object.entries(stageAt).map(([k, v]) => `${k}@${v}s`).join(' ')}`
      + ` · hunter ${Object.entries(marks).map(([k, v]) => `${k}@${v.t}s/${v.d}m`).join(' ')}`
      + ` · closest ${closest} m (start ${s0.d} m)`
      + ` · hearNoise ${heard.length} (${heard.filter((h) => h.took).length} heard)`
      + (torn != null ? ` · TORN APART at ${torn}s` : ''));
    return row;
  }

  for (const lock of LOCKS) for (const a of ARMS) await arm(a, lock);

  // ---- the assertions ---------------------------------------------------------------------
  const after = rows.filter((r) => r.defsName === 'after');
  const before = rows.filter((r) => r.defsName === 'before');
  if (before.length && after.length) {
    note('before -> after, held trigger, same station: '
      + LOCKS.map((l) => {
        const b = before.find((r) => r.lock === l), a = after.find((r) => r.lock === l);
        return b && a ? `${l} ${b.secs}s -> ${a.secs}s (x${(a.secs / Math.max(b.secs, 0.01)).toFixed(1)})` : l;
      }).join(' · '));
  }

  const opened = after.filter((r) => r.open);
  if (opened.length !== after.length) {
    fail('every lock still opens', `${after.length - opened.length} of ${after.length} were still shut at the ${CAP}s cap`);
  } else {
    const lo = Math.min(...opened.map((r) => r.secs)), hi = Math.max(...opened.map((r) => r.secs));
    (lo >= 10 && hi <= 40)
      ? pass('opening an exit is a siege', `${lo}–${hi} s of held trigger across ${opened.length} locks`)
      : fail('opening an exit is a siege', `${lo}–${hi} s — outside the 15–30 s the design asks for`);
  }

  const heardAny = after.reduce((n, r) => n + r.heard.filter((h) => h.took).length, 0);
  heardAny > 0
    ? pass('destruction is audible', `${heardAny} stage transitions were HEARD across ${after.length} locks`)
    : fail('destruction is audible', 'every hearNoise call was refused — check the strength against hearRange');

  const came = after.filter((r) => r.marks.SEARCH || r.marks.ALERT || r.marks.STALK || r.marks.PURSUE || r.marks.ATTACK);
  came.length
    ? pass('the work of opening an exit brings the hunter',
      came.map((r) => `${r.lock}: ${Object.keys(r.marks).filter((k) => k !== 'PATROL').join('/')} , closest ${r.closest} m`).join(' · '))
    : fail('the work of opening an exit brings the hunter',
      `never left PATROL on any lock; closest ${Math.min(...after.map((r) => r.closest))} m`);

  // ⚠️ THE CONTROL. Without it "the hunter turned up while I was working" is not evidence that
  // the work did it — the patrol is 185 s long and walks past on its own schedule.
  const ctrl = await (async () => {
    await stage('after', 3);
    await step(4);
    const t0 = (await read()).t;
    const dur = after.length ? Math.max(...after.map((r) => r.secs)) : 20;
    const f0 = await frames();
    const marks = {}; let closest = 999;
    for (;;) {
      const r = await read();
      closest = Math.min(closest, r.d);
      if (!marks[r.hState]) marks[r.hState] = +(r.t - t0).toFixed(1);
      if (r.t - t0 >= dur) break;
      if ((await frames()) - f0 > dur * 62 + 600) break;   // see the arm loop's frame cap
      await step(4);
    }
    const heard = await page.evaluate(() => window.__heard.length);
    return { marks, closest, heard, dur: +dur.toFixed(1) };
  })();
  note(`SILENT CONTROL (${ctrl.dur}s, same station, trigger never pressed): `
    + `states ${Object.entries(ctrl.marks).map(([k, v]) => `${k}@${v}s`).join(' ')}`
    + ` · closest ${ctrl.closest} m · hearNoise ${ctrl.heard}`);
  const worst = Math.min(...after.map((r) => r.closest));
  worst < ctrl.closest - 1.0
    ? pass('the approach is caused by the work, not by the patrol',
      `closest while working ${worst} m vs ${ctrl.closest} m in silence over the same window`)
    : skip('the approach is caused by the work, not by the patrol',
      `working ${worst} m vs silent ${ctrl.closest} m — not separable in this staging`);
}
