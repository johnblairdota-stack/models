/**
 * ARC LENGTH AND SPEED OF THE SLEDGEHAMMER HEAD — the number behind `critic-swing-2`'s note.
 *
 * That critic reconstructed a 7.11 m head path peaking at 34.7 m/s by hand, from `sledge.js`'s
 * own `KEYS` table, and said so honestly. This measures the same thing from the RUNNING RIG,
 * so the reach clamps, the body drive and the gait are all in it — and it reports the
 * body-relative path separately, because those are two different claims and the human figures
 * people compare against are the body-relative one.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/sledge-arc.mjs \
 *        --port 5196 --q "seed=s4&dig=1&arc=1"
 *
 * ⚠️ IT PUMPS FRAMES, IT DOES NOT SLEEP. `Engine._liveLoop` clamps dt, so a `waitForTimeout`
 * is not "advance N frames" — `flee-survival.mjs` was measuring 5.28 s of world for an 11 s
 * hold before that was found. Here the live rAF loop is cancelled and Node steps `_step(1/60)`
 * one frame at a time, exactly as `strobe.mjs` does, so the sample interval really is 1/60 s
 * and the speeds are real.
 *
 * ⚠️ IT MEASURES THE HEAD MESH'S OWN WORLD MATRIX, not a reconstruction. `sledge.head` is the
 * group the block, collar, rims and wedges hang off, and `_fitProp` places the prop from the
 * two SOLVED wrist stations — so this reads where the hammer was actually drawn, including any
 * frame where a reach clamp moved a hand off the authored path.
 */
export default async function sledgeArc({ page, note, pass, fail, skip }) {
  // ---- arm the hammer, exactly as strobe.mjs's SETUP_SLEDGE does (by identity, never "first
  // item in the field" — that has grabbed a nailgun and a ball in this project before) -------
  const armed = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    for (const s of ['shoulderL', 'shoulderR']) if (p.rig.occupant(s) === 'gadget') p.rig.detach(s);
    for (const s of ['shoulderL', 'shoulderR']) if (p.rig.occupant(s) === 'empty') p.rig.refit?.(s);
    if (p.rig.held) p.rig.dropHeld();
    if (!p.sledge.owned) {
      const it = e.limbField.items.find((i) => i.type === 'sledge');
      if (!it) return { ok: false, why: 'no LimbItem with type "sledge"' };
      p.pos.copy(it.root.position); p.vel.set(0, 0, 0);
      p.interact(e.limbField, 1.5, null);
    }
    if (!p.sledge.equipped) p.sledge.equip();
    // park the hunter — an idle hunter puts hip/spine spikes into a swing-only trace
    if (e.hunter?.root) {
      const park = () => { e.hunter.root.position.set(9999, 0, 9999); e.hunter.vel?.set?.(0, 0, 0); };
      park(); e.onUpdate(park);
    }
    return { ok: p.sledge.equipped, arc: p.sledge.constructor?.name ?? null, owned: p.sledge.owned };
  });
  note(`armed: ${JSON.stringify(armed)}`);
  if (!armed.ok) { skip('sledge arc measured', armed.why ?? 'the hammer would not equip'); return; }

  // ---- take the clock ---------------------------------------------------------------------
  await page.evaluate(() => {
    const e = window.__rrr.engine;
    if (window.__arcPump) return;
    if (e._raf) cancelAnimationFrame(e._raf);
    e._raf = 0;
    window.__arcPump = (n = 1) => new Promise((res) => {
      const go = () => requestAnimationFrame(() => {
        e._step(1 / 60, performance.now());
        if (--n > 0) go(); else res(e.frame);
      });
      go();
    });
  });
  await page.evaluate(() => window.__arcPump(20));   // let `facing` finish lerping

  // ---- one swing, sampled every pumped frame ----------------------------------------------
  //
  // Both frames are recorded per sample:
  //   world  — where the head was drawn, the path a player's eye follows
  //   local  — the head expressed in the CHEST joint's frame, i.e. the body-relative arc. The
  //            difference between the two totals is exactly what the body drive contributes.
  const trace = await page.evaluate(async () => {
    const e = window.__rrr.engine, p = e.player, s = p.sledge;
    const THREE_V = (o) => ({ x: o.x, y: o.y, z: o.z });
    const chest = p.unit.joints.chest ?? p.unit.joints.spine ?? p.unit.root;
    const samples = [];
    const grab = () => {
      s.head.updateWorldMatrix(true, false);
      chest.updateWorldMatrix(true, false);
      const w = new (s.head.position.constructor)();
      w.setFromMatrixPosition(s.head.matrixWorld);
      const inv = chest.matrixWorld.clone().invert();
      const l = w.clone().applyMatrix4(inv);
      return { ph: s.phase, sw: !!s.swinging, w: THREE_V(w), l: THREE_V(l) };
    };
    samples.push(grab());
    p._fireCd = 0;
    const fired = p.attack(e.elapsed);
    for (let i = 0; i < 60; i++) {
      await window.__arcPump(1);
      samples.push(grab());
      if (i > 4 && !samples[samples.length - 1].sw) break;
    }
    return { fired: fired ? (fired.weapon ?? 'yes') : null, samples };
  });
  note(`attack() returned: ${JSON.stringify(trace.fired)}`);

  const S = trace.samples;
  const swung = S.filter((s) => s.sw);
  if (swung.length < 20) {
    fail('the probe captured a whole swing', `only ${swung.length} swinging frames of ${S.length}`);
    return;
  }
  const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  const DT = 1 / 60;
  let world = 0, local = 0, peakW = 0, peakP = 0, peakL = 0;
  const legs = { windup: 0, down: 0, follow: 0, recover: 0 };
  for (let i = 1; i < S.length; i++) {
    if (!S[i].sw && !S[i - 1].sw) continue;
    const dw = d(S[i].w, S[i - 1].w), dl = d(S[i].l, S[i - 1].l);
    world += dw; local += dl;
    const v = dw / DT;
    if (v > peakW) { peakW = v; peakP = S[i].ph; }
    peakL = Math.max(peakL, dl / DT);
    const ph = S[i].ph || 1;
    if (ph <= 0.42) legs.windup += dw;
    else if (ph <= 0.60) legs.down += dw;
    else if (ph <= 0.80) legs.follow += dw;
    else legs.recover += dw;
  }
  const f = (x) => +x.toFixed(3);
  note(`frames in the swing: ${swung.length} (phases ${swung[0].ph.toFixed(2)} .. ${swung[swung.length - 1].ph.toFixed(2)})`);
  note(`HEAD PATH  world ${f(world)} m   body-relative ${f(local)} m   body drive contributes ${f(world - local)} m`);
  note(`PEAK SPEED world ${f(peakW)} m/s at phase ${f(peakP)}   body-relative ${f(peakL)} m/s`);
  note(`legs (world m): windup ${f(legs.windup)}  down ${f(legs.down)}  follow ${f(legs.follow)}  recover ${f(legs.recover)}`);
  note(`ARCJSON ${JSON.stringify({ world: f(world), local: f(local), peakW: f(peakW), peakP: f(peakP), legs: { windup: f(legs.windup), down: f(legs.down), follow: f(legs.follow), recover: f(legs.recover) } })}`);

  // Extremes of the head's world height — the "does it still go overhead" question the arc
  // knob is most likely to quietly destroy.
  const ys = swung.map((s) => s.w.y);
  note(`head world height: min ${f(Math.min(...ys))} m  max ${f(Math.max(...ys))} m  (floor y ${f(await page.evaluate(() => window.__rrr.engine.room.floorY))})`);

  world > 0.5
    ? pass('the head actually travelled', `${f(world)} m of world path`)
    : fail('the head actually travelled', `${f(world)} m — the prop did not move`);

  // hands still welded to the haft at the end of the swing
  const hc = await page.evaluate(() => window.__rrr.engine.player.sledge.handCheck());
  note(`handCheck after the swing: ${JSON.stringify(hc)}`);
  (hc && hc.L < 0.001 && hc.R < 0.001)
    ? pass('both hands are still on the haft', JSON.stringify(hc))
    : fail('both hands are still on the haft', JSON.stringify(hc));
}
