/**
 * PC7 — DOES THE WORK SUMMON THE HUNTER?
 *
 * `escape.md` §1: "Destruction is already risk — breaching is loud and `HunterAI._sense` scales
 * hearing by `Player.noise`, so the act that frees you is the act that summons the hunter."
 * §4 makes it beat three of the loop. Nothing has driven it.
 *
 *   SEED=s0 node harness/playtest.mjs --view game.play --script harness/scenarios/pc7-noise.mjs \
 *        --port 5197 --q "seed=s0"
 *
 * Two arms, same staging, one page: hold the trigger at the live exit for 60 game-seconds, and
 * stand there silent for 60. The control matters — the hunter patrols past on its own schedule,
 * so "it turned up while I was shooting" is not evidence that the shooting did it.
 */
export default async function noise({ page, note, pass, fail, skip }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 120; i++) {
      await page.waitForTimeout(50);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  // ---- Does anything in the destruction path make a sound the hunter can hear? -------------
  const wired = await page.evaluate(() => {
    const e = window.__rrr.engine;
    let heard = 0;
    const orig = e.hunter.hearNoise.bind(e.hunter);
    e.hunter.hearNoise = (...a) => { heard++; window.__heard = (window.__heard ?? 0) + 1; return orig(...a); };
    window.__heardReset = () => { window.__heard = 0; };
    return typeof orig === 'function';
  });
  if (!wired) { fail('hearNoise is reachable'); return; }

  const stage = () => page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run;
    const x = e.exits.find((q) => run.isLiveExit(q.site.id));
    const n = x.panel.normal, p = x.panel.root.position, inS = -x.outSign;
    e.player.pos.set(p.x + n.x * inS * 2.6, e.room.floorY, p.z + n.z * inS * 2.6);
    e.player.vel.set(0, 0, 0);
    const yaw = Math.atan2(n.x * inS * -1, n.z * inS * -1);
    e.player.aimYaw = yaw; e.player.aimPitch = 0; e.player.facing = yaw;
    e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true;
    // ⚠️ RE-STAGE THE HUNTER TOO, OR THE SECOND ARM IS NOT THE FIRST ARM'S CONTROL.
    // The first version of this left it wherever the previous arm had walked it: the noisy arm
    // started at 37.3 m and the silent arm at 14.1 m, which makes "the silent player was caught
    // and the loud one was not" unreadable. Same reset the production `resetRound` uses.
    e.hunter.root.position.copy(e.room.spawn.hunter);
    e.hunter.vel.set(0, 0, 0);
    e.hunter.state = 'PATROL'; e.hunter.target = null; e.hunter.awareness = 0;
    e.hunter.routeIdx = 0; e.hunter.dwellLeft = null; e.hunter.searchTimer = 0;
    e.hunter.breachTarget = null; e.hunter.lastKnown.copy(e.room.spawn.hunter);
    e.hunter.resetCombat?.();
    // ...and put the player back together. The first arm can end dismembered, and a body with
    // no limbs is `downed` — `_sense` skips downed candidates outright, so the SECOND arm then
    // reports "the hunter never noticed me" for a reason that has nothing to do with noise.
    // Exactly the round-reset defect HANDOFF records at `resetRound`, met from the other end.
    for (const s of ['shoulderR', 'shoulderL', 'hipR', 'hipL']) {
      if (e.player.rig.occupant(s) === 'empty') e.player.rig.refit?.(s);
    }
    window.__heard = 0;
    return {
      site: x.site.id, lock: run.lock.id,
      hunterAt: [+e.hunter.root.position.x.toFixed(1), +e.hunter.root.position.z.toFixed(1)],
      d: +Math.hypot(e.hunter.root.position.x - e.player.pos.x,
        e.hunter.root.position.z - e.player.pos.z).toFixed(1),
      hearRange: null,
    };
  });

  const read = () => page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run;
    const x = e.exits.find((q) => run.isLiveExit(q.site.id));
    return {
      t: +run.t.toFixed(2), state: e.hunter.state, aw: +(e.hunter.awareness ?? 0).toFixed(2),
      d: +Math.hypot(e.hunter.root.position.x - e.player.pos.x,
        e.hunter.root.position.z - e.player.pos.z).toFixed(1),
      noise: +(e.player.noise ?? 0).toFixed(2),
      stageN: x.panel.state.stage, blocks: x.panel.blocksMovement(),
      heard: window.__heard ?? 0,
      limbs: ['shoulderR', 'shoulderL', 'hipR', 'hipL']
        .filter((s) => e.player.rig.occupant(s) !== 'empty').length,
    };
  });

  /** Hold the trigger (or not) for `secs` of GAME time and report the hunter's approach. */
  async function arm(label, shoot, secs = 60) {
    const s = await stage();
    await step(6);
    const t0 = (await read()).t;
    note(`${label}: staged at ${s.site} (lock ${s.lock}), hunter ${s.d} m away`);
    const marks = {}; let closest = 99, samples = 0;
    if (shoot) await page.mouse.down();
    for (;;) {
      const r = await read();
      samples++;
      closest = Math.min(closest, r.d);
      if (!marks[r.state]) marks[r.state] = { t: +(r.t - t0).toFixed(1), d: r.d };
      if (r.t - t0 >= secs) break;
      if (r.limbs === 0) { note(`${label}: torn apart at ${(r.t - t0).toFixed(1)} s`); break; }
      await step(6);
    }
    if (shoot) await page.mouse.up();
    const end = await read();
    note(`${label}: ${secs}s · states ${Object.entries(marks).map(([k, v]) => `${k}@${v.t}s/${v.d}m`).join(' ')}`
      + ` · closest ${closest} m · panel stage ${end.stageN}${end.blocks ? '' : ' (OPEN)'}`
      + ` · hearNoise calls ${end.heard} · player noise ${end.noise}`);
    return { marks, closest, end };
  }

  const fired = await arm('TRIGGER HELD', true, 60);
  // Re-stage and go quiet. Same place, same length.
  const quiet = await arm('SILENT     ', false, 60);

  const gotClose = (a) => a.closest;
  note(`closest approach: shooting ${gotClose(fired)} m vs silent ${gotClose(quiet)} m`);
  if (fired.end.heard > 0) note(`something in the damage path called hearNoise ${fired.end.heard} times`);
  else note('NOTHING called hearNoise during 60 s of firing at a wall — the only channel is Player.noise');

  // ⚠️ THIS ASSERTION CANNOT PASS ON NOISE ALONE, BY DESIGN, AND ITS METRIC IS PATROL-DOMINATED.
  // Left exactly as `play-critic-7` wrote it — it is the record of what it measured — but a
  // later reader must not take a FAIL here as evidence that the noise change did not land.
  // Two reasons, both measured on 2026-08-04 with destruction now audible:
  //
  //   1. `HunterAI.hearNoise` caps awareness at `HUNTER_SENSE.soundCeiling` (0.86) against a
  //      `commitAt` of 1.00 — "sound gets it looking, only sight sends it running". So PURSUE
  //      and ATTACK are unreachable from sound however loud it is. The reachable evidence is
  //      **leaving PATROL**, which now happens: seed s82 (chapel + boarded) reads
  //      `SEARCH@2.9s` and **4 hearNoise calls**, against 0 calls and PATROL-only before.
  //   2. `closest` is a 60-SECOND window on a 185-second patrol lap, so the lap arrives on its
  //      own schedule in both arms and swamps the signal. Same seed: shooting 25.7 m vs SILENT
  //      15.5 m — the silent arm closer, because searching toward the wall pulls the hunter OFF
  //      the route that would otherwise have walked it past the player.
  //
  // The form that resolves it is `harness/scenarios/eo2-siege.mjs`: one station, and a silent
  // control **the same length as the job** rather than a fixed 60 s. There it reads
  // 37.3 -> 25.7 m while working against 36.4 m in silence over the identical window.
  const reachedPursuit = !!(fired.marks.PURSUE || fired.marks.ATTACK);
  reachedPursuit
    ? pass('the work of opening an exit brings the hunter', JSON.stringify(fired.marks))
    : fail('the work of opening an exit brings the hunter',
      `60 s of continuous fire at the live exit never got past ${Object.keys(fired.marks).join('/')}`
      + `; closest ${fired.closest} m (silent control ${quiet.closest} m)`);
}
