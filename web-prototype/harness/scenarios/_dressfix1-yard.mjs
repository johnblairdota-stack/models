/**
 * 🏡 **WHAT IS OUTSIDE A GENERATED HOUSE? — `dressfix-1`, 2026-08-15.**
 *
 * John, on a generated house: *"there is like an outside perimeter wall randomly I can get behind
 * it and it has the weird grey dark room beyond thing going on."*
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_dressfix1-yard.mjs \
 *        --port 5511 --q "plan=gen&planseed=3&seed=s4"
 *
 * ⚠️ `--q`, NEVER `--extra`.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHAT `_dressfix1-behind.mjs` ALREADY SETTLED
 * ---------------------------------------------------------------------------------------------
 * `_dressfix1-behind.mjs` floods the XZ plane by DRIVING A BODY through `room.collide` from every
 * room in the house and finds, on three plan seeds and both door arms, **0 m² outside the envelope
 * and 0 m² of walkable void inside it** — with a ghost control that reaches 17 960–21 556 outside
 * cells through the same machinery. So the generated house is watertight to a WALK, and the escaped
 * player is contained in 134–138 m² of yard.
 *
 * What that leaves is the yard itself, which is `exterior.js`'s and is the brief's first candidate:
 * **`YARDS` is keyed by AUTHORED exit-site id and a generated site is `x.g0…`, so every generated
 * yard is `DEFAULT_YARD`** — one fixed ±6.0 m box, whatever the wall behind it is doing. This file
 * opens the live exit for real (600 nail-gun rounds, `escape.mjs` E5's method), stands the player
 * in the yard, and photographs it — and reports the one number that follows from the fallback:
 * how much of the house's own exterior wall the yard's facade actually covers.
 *
 * 🚨 **IT ASSERTS NOTHING ABOUT THE LOOK.** John judges. What is gated is that the exit really
 * opened, that the yard is really resident, and that the frames are of the yard and not of a
 * boot splash — a capture that cannot observe must not read as a pass.
 */

/**
 * 🚨 **EVERY STATION IS OFFSET LATERALLY, AND THAT IS NOT COMPOSITION — IT IS THE ONLY WAY TO GET
 * A PICTURE OF THE OUTSIDE AT ALL.** `views/game.js` `outThrough()` declares the run WON when a
 * body is `along >= 0.45` past the panel plane AND `lateral <= halfW + 1.0` (2.04 m here), and the
 * win screen is a full-screen modal over a blurred frame. The first run of this file parked on the
 * aperture's own axis and every one of its five frames came back as **"OUT OF THE HOUSE 0:02.5"**.
 * Standing 4.5 m to one side is outside the trigger's lateral window, in the same yard, looking at
 * the same wall — and Y3 asserts the run never ended, so a contaminated frame cannot pass.
 */
const SHOTS = [
  { tag: 'out-3m-lat-4.5-looking-back', back: 3.0, lat: -4.5, yaw: 'in' },
  { tag: 'out-9m-lat-4.5-looking-back', back: 9.0, lat: -4.5, yaw: 'in' },
  { tag: 'out-3m-lat-4.5-looking-along-the-wall', back: 3.0, lat: -4.5, yaw: 'left' },
  { tag: 'out-3m-lat+4.5-looking-along-the-wall', back: 3.0, lat: 4.5, yaw: 'right' },
  { tag: 'out-9m-lat+4.5-looking-away', back: 9.0, lat: 4.5, yaw: 'out' },
];

/** `TAG=before` keeps the `?yardwide=0` frames beside the shipped ones instead of over them. */
const TAG = process.env.TAG ? `-${process.env.TAG}` : '';

export default async function dressfix1yard({ page, note, pass, fail, skip, snap, SHOTDIR, VIEW }) {
  const png = (tag) => snap(tag, { path: `${SHOTDIR}/${VIEW}.${tag}${TAG}.png` });
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 900; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  // ---------------------------------------------------------------- the yard against the wall
  const geom = await page.evaluate(() => {
    const e = window.__rrr.engine, x = e.exterior;
    const live = [...x.sites].find(([, s]) => s.live);
    if (!live) return { err: 'no live site' };
    const [id, s] = live;
    const p = s.exit.panel;
    const home = e.room.spaces.find((q) => q.id === s.exit.site.a);
    // the run of the house's own exterior wall this panel sits in, in world metres
    const xAxis = Math.abs(p.normal.x) > 0.5;
    const wallRun = home ? (xAxis ? home.z1 - home.z0 : home.x1 - home.x0) : null;
    // …and the widest continuous stretch of envelope on that side, across every space
    let env = 0;
    if (home) {
      for (const q of e.room.spaces) {
        const on = xAxis
          ? Math.abs(q.x0 - home.x0) < 0.35 || Math.abs(q.x1 - home.x1) < 0.35
          : Math.abs(q.z0 - home.z0) < 0.35 || Math.abs(q.z1 - home.z1) < 0.35;
        if (on) env += xAxis ? q.z1 - q.z0 : q.x1 - q.x0;
      }
    }
    return {
      id, kind: s.spec.kind, x0: s.spec.x0, x1: s.spec.x1, depth: s.spec.depth,
      wallH: s.spec.wallH, isDefault: !!(s.spec.__default ?? false),
      panel: p.id, pw: +p.width.toFixed(2), room: home ? home.id : null,
      wallRun: wallRun == null ? null : +wallRun.toFixed(2), envRun: +env.toFixed(2),
      solids: e.room.exteriorSolids.length,
      px: p.root.position.x, pz: p.root.position.z,
      nx: p.normal.x, nz: p.normal.z, outSign: s.exit.outSign,
    };
  });
  if (geom.err) { fail('a live exit site exists', geom.err); return; }
  const yardW = geom.x1 - geom.x0;
  note(`live site ${geom.id} · yard spec ${geom.kind} x ${geom.x0}..${geom.x1}`
    + ` (${yardW.toFixed(1)} m wide) depth ${geom.depth} wallH ${geom.wallH}`);
  note(`its panel ${geom.panel} (${geom.pw} m) is in ${geom.room}, whose own exterior wall run is`
    + ` ${geom.wallRun} m; the whole envelope on that side is ${geom.envRun} m`);
  const bare = Math.max(0, geom.wallRun - yardW);
  note(`🎯 THE YARD'S FACADE COVERS ${yardW.toFixed(1)} m OF THIS ROOM'S ${geom.wallRun} m WALL`
    + ` RUN — ${bare.toFixed(1)} m of the house's own exterior wall has nothing drawn in front of`
    + ' it. `YARDS` is keyed by AUTHORED site id and a generated one is `x.g0…`, so every'
    + ' generated site takes the fallback; `?yardwide=0` restores the fixed ±6.0 m box.');

  /**
   * 🚨 **THE CONTROL IS THE SAME COVERAGE TEST POINTED AT THE OLD BOX.** It is arithmetic on the
   * same measured wall run rather than a second observation, and it is stated as such — but it
   * does mean a build that silently fell back to ±6.0 m cannot pass Y4, and a wall narrower than
   * the default box reports SKIP instead of a free pass.
   */
  const cover = (w) => Math.min(1, w / Math.max(1e-6, geom.wallRun));
  if (geom.wallRun <= 12.0 + 0.25) {
    skip('Y4 — the fallback yard covers the wall it stands in front of',
      `this room's exterior wall run is only ${geom.wallRun} m, inside the ±6.0 m default box —`
      + ' the widening has nothing to do on this seed and the test would pass either way');
  } else {
    cover(yardW) >= 0.99
      ? pass('Y4 — the fallback yard covers the wall it stands in front of',
        `${yardW.toFixed(1)} m of ${geom.wallRun} m (${(cover(yardW) * 100).toFixed(1)}%)`)
      : fail('Y4 — the fallback yard covers the wall it stands in front of',
        `${yardW.toFixed(1)} m of ${geom.wallRun} m (${(cover(yardW) * 100).toFixed(1)}%) —`
        + ` ${bare.toFixed(1)} m of house is drawn with nothing in front of it`);
    cover(12.0) < 0.99
      ? pass('Y5 CONTROL — the same coverage test FAILS on the ±6.0 m default box',
        `the old box would cover ${(cover(12.0) * 100).toFixed(1)}% of this ${geom.wallRun} m wall`
        + ' — so Y4 is a statement about the fix and not about the test')
      : fail('Y5 CONTROL — the same coverage test FAILS on the ±6.0 m default box',
        `the old box already covered ${(cover(12.0) * 100).toFixed(1)}% — Y4 proves nothing here`);
  }

  // ---------------------------------------------------------------- open it for real
  const opened = await page.evaluate(() => {
    const e = window.__rrr.engine, run = e.run;
    const x = e.exits.find((q) => run.isLiveExit(q.site.id));
    const n = x.panel.normal, p = x.panel.root.position, inS = -x.outSign;
    const V = x.panel.root.position.constructor;
    let shots = 0;
    for (let i = 0; i < 900 && x.panel.state.stage < 4; i++) {
      e.weapons.fire('nailgun', new V(p.x + n.x * inS * 2.0, 1.35, p.z + n.z * inS * 2.0),
        new V(-n.x * inS, 0, -n.z * inS), performance.now() / 1000, { ignore: e.player.rig });
      shots++;
    }
    return { id: x.site.id, shots, stage: x.panel.state.stage,
      blocks: x.panel.blocksMovement(), sight: x.panel.blocksSight() };
  });
  note(`opening ${opened.id}: ${opened.shots} nail-gun rounds → stage ${opened.stage},`
    + ` blocksMove ${opened.blocks}, blocksSight ${opened.sight}`);
  (opened.stage === 4 && !opened.blocks)
    ? pass('Y1 — the live exit really opened', `${opened.shots} rounds, stage ${opened.stage}`)
    : fail('Y1 — the live exit really opened',
      `stage ${opened.stage}, blocksMove ${opened.blocks} — every frame below is of a shut wall`);
  await step(20);

  const quiet = () => page.evaluate(() => {
    const e = window.__rrr.engine, h = e.hunter;
    if (!h?.root) return false;
    let x = 0, z = 0;
    for (const s of e.room.spaces) { if (s.x1 > x) x = s.x1; if (s.z1 > z) z = s.z1; }
    h.root.position.set(x + 60, 0, z + 60); h.root.visible = false;
    return true;
  });

  // ---------------------------------------------------------------- stand outside and look
  let exposedAnywhere = false;
  let phaseLeft = null;
  for (const S of SHOTS) {
    const st = await page.evaluate(([back, yaw, lat]) => {
      const e = window.__rrr.engine, x = e.exits.find((q) => e.run.isLiveExit(q.site.id));
      const n = x.panel.normal, p = x.panel.root.position, o = x.outSign;
      // out along the panel normal; the lateral axis is the normal turned a quarter
      const lx = -n.z, lz = n.x;
      e.player.pos.set(p.x + n.x * o * back + lx * lat, e.room.floorY,
        p.z + n.z * o * back + lz * lat);
      e.player.vel.set(0, 0, 0);
      let dx = -n.x * o, dz = -n.z * o;                              // 'in' — back at the house
      if (yaw === 'out') { dx = n.x * o; dz = n.z * o; }
      if (yaw === 'left') { dx = lx; dz = lz; }
      if (yaw === 'right') { dx = -lx; dz = -lz; }
      const f = Math.atan2(dx, dz);
      e.player.facing = f; e.player.aimYaw = f;
      if (e.cam) { e.cam.yaw = f; e.cam.pitch = 0; e.cam._first = true; }
      e.room.setViewpoints?.([{ pos: e.player.pos, dir: { x: Math.sin(f), z: Math.cos(f) } }]);
      return { pos: [+e.player.pos.x.toFixed(2), +e.player.pos.z.toFixed(2)],
        space: e.room.spaceAt(e.player.pos)?.id ?? null };
    }, [S.back, S.yaw, S.lat]);
    await quiet();
    await step(90);
    await quiet(); await step(4);
    const cen = await page.evaluate(() => {
      const e = window.__rrr.engine;
      const c = e.exterior.census();
      const y = c.yards.filter((r) => r.live)[0] ?? null;
      return { exposed: !!y?.exposed, yardVisible: !!y?.yardVisible, tris: y?.tris ?? 0,
        calls: e.renderer.info.render.calls, phase: e.run.phase };
    });
    if (cen.exposed) exposedAnywhere = true;
    if (cen.phase !== 'EXPLORE') phaseLeft = cen.phase;
    note(`${S.tag.padEnd(38)} at (${st.pos.join(', ')}) space=${st.space}`
      + ` · yard exposed ${cen.exposed} / drawn ${cen.yardVisible} (${cen.tris} tris)`
      + ` · ${cen.calls} calls · run phase ${cen.phase}`);
    await png(`dressfix1-yard-${S.tag}`);
  }

  exposedAnywhere
    ? pass('Y2 — the yard is actually resident in these frames',
      'exterior.census() reports the live yard exposed and drawn — so the pictures are of the '
      + 'outside and not of a closed wall')
    : fail('Y2 — the yard is actually resident in these frames',
      'the live yard never became exposed — the frames show whatever was there instead, and no '
      + 'look claim can be made from them');

  (phaseLeft === null)
    ? pass('Y3 CONTROL — the run never ended, so no frame is of the win screen',
      'run.phase stayed EXPLORE at all five stations; the escape modal blurs the whole frame and '
      + 'the first build of this file photographed it five times')
    : fail('Y3 CONTROL — the run never ended, so no frame is of the win screen',
      `run.phase reached ${phaseLeft} — those frames are of the modal, not of the yard`);
  void skip;
}
