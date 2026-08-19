/**
 * 📷 **WHAT THE NEW DIG SITES LOOK LIKE — one picture per appended edge, breached.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/dig-cover.mjs \
 *        --port 5342 --q "seed=s4&dig=1" --shots
 *
 * `digcover-1` appended five edges to `DIG_EDGES` (2026-08-09) so the gallery, the ballroom and
 * the chapel can be dug at all. `dig-band.mjs` measures the CLOCK off the damage grid and takes
 * no picture — its own report says so as a refusal — so this is the other half: it forces this
 * run's interconnect onto a named face, drives a body-sized channel through it with real
 * positional blows, stands a player beside the hole and photographs it.
 *
 * ⚠️ **THE CAMERA STANDS TO ONE SIDE**, for `dig-shots.mjs`'s measured reason: the player's body
 * covers the centre third of the aperture from the only station you can shoot square-on from, so
 * a frame taken head-on is a picture of the back of a robot.
 *
 * ⚠️ **THE INTERCONNECT IS FORCED, NOT SEARCHED.** `setDigPlan({ free })` takes a region map
 * directly — the same shape `chooseFreeInterconnect()` returns — so each site can be photographed
 * with the answer in a known place. That makes these pictures of the MECHANIC, not of a seed; the
 * seed's own placement is `dig-band.mjs`'s business.
 *
 * 🚨 **THE BALLROOM SHOT IS THE ONE WITH A QUESTION ATTACHED.** It is a 9.60 m storey and every
 * space that could be dug before this round was 4.80, so `DIG_H` 2.80 is 29% of the wall height
 * instead of 58%. `B_TALL` is a deliberately wide, high frame of that wall — the picture that
 * answers "does a 2.80 m band read as a way through, or as a mousehole in a cathedral".
 */

/** face id -> how to frame it. `back`/`side` in metres from the face centre; `pitch` in radians. */
const SITES = [
  { id: 'f.gal_svc.0.b', tag: 'gallery-to-service', back: 4.2, side: 1.6, pitch: 0.02,
    why: 'the gallery has NO other connection to the service passage — D2 was removed and this dig is the route' },
  { id: 'f.gal_east.0.b', tag: 'gallery-to-study-e', back: 4.6, side: 2.2, pitch: 0.02,
    why: 'the gallery\'s one long run of shared wall, 5.72 m, and the face that keeps its band in John\'s minute' },
  /**
   * ⚠️ `side` IS SIGNED AND THE SIGN IS "WHICH WAY ALONG THE WALL", NOT "LEFT". It steps along
   * `(-n.z, n.x)`, so on a +z-facing face positive `side` runs toward −x. The first run of this
   * file put the chapel camera 0.68 m from the chapel's east wall and the `bal_west` camera 0.22 m
   * from the ballroom's west wall; `ThirdPersonCamera` raycasts the world to keep its boom out of
   * masonry, so both frames became a close-up of the wall behind the player and the hole they were
   * taken to photograph was off to one side. **Both signs are now toward the room's centre.**
   */
  { id: 'f.gal_chapel.0.b', tag: 'chapel-to-gallery', back: 3.6, side: -1.6, pitch: 0.02,
    why: 'the chapel\'s only shared wall with anything in the house' },
  { id: 'f.bal_west.0.a', tag: 'ballroom-to-study-w', back: 5.0, side: -1.8, pitch: 0.06,
    why: 'the ballroom end wall, west of D4' },
  { id: 'f.bal_east.0.a', tag: 'ballroom-to-study-e', back: 5.0, side: 1.8, pitch: 0.06,
    why: 'the ballroom end wall, west of D6' },
];

/**
 * The same face again, framed for the STOREY rather than for the hole.
 * ⚠️ **NOT FURTHER BACK THAN THE COLONNADE.** The ballroom's six piers stand at z −0.65; the
 * first version stood at z +3.7 and photographed a pier. 6.5 m back is z −1.80, north of them.
 */
const TALL = { id: 'f.bal_east.0.a', tag: 'ballroom-9m6-storey-against-a-2m8-band', back: 6.5, side: 2.6, pitch: 0.22 };

const IC_W = 1.55, IC_H = 2.60, DIG_H = 2.80;

export default async function digCover({ page, note, pass, fail, skip, shot }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 12) => {
    const f0 = await frames();
    for (let i = 0; i < 200; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const head = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    const c = e?.room?.digCensus?.();
    return c ? { on: c.on, mode: c.mode, faces: c.freeFaces ?? c.segments } : null;
  });
  if (!head?.on || head.mode !== 'free') {
    skip('the new dig sites can be photographed',
      `this build is \`?dig=${head?.mode ?? 'off'}\` — re-run with --q "seed=s4&dig=1"`);
    return;
  }
  note(`arm: dig=${head.mode} · ${head.faces} free faces in the house`);

  /**
   * Force this run's interconnect onto ONE face, open it with real positional blows, then stand
   * the player beside it. Returns what actually happened rather than what was asked for.
   */
  const openAndFrame = (site, icw, ich, digh) => page.evaluate(([s, ICW, ICH, DH]) => {
    const e = window.__rrr.engine, room = e.room;
    const p = room.panelOf(s.id);
    if (!p) return { err: `no panel "${s.id}"` };
    // the region has to be placed on the `a` side — `setDigPlan` mirrors it onto the twin
    const aId = s.id.endsWith('.a') ? s.id : s.id.replace(/\.b$/, '.a');
    const a = room.panelOf(aId);
    const edge = p.spec.edge;
    const free = new Map([[edge, {
      panel: aId, u: 0.5, v: 0.5,
      ru: (ICW / 2) / a.width, rv: (ICH / 2) / DH, salt: 3.7,
    }]]);
    room.setDigPlan({ free });

    // ---- drive a body-sized channel, exactly as `dig-band.mjs` phase 2 does ----------------
    let blows = 0, opened = false;
    const g = p.field;
    for (let i = 0; i < 500; i++) {
      const by0 = Math.floor(0.30 / g.cellH), by1 = Math.min(g.rows - 1, Math.ceil(1.80 / g.cellH));
      let bestA = -1, bestN = 0, runA = -1, run = 0;
      for (let cx = 0; cx <= g.cols; cx++) {
        let clear = cx < g.cols;
        for (let cy = by0; cy <= by1 && clear; cy++) if (g.barrier[g.idx(cx, cy)]) clear = false;
        if (clear) { if (run === 0) runA = cx; run++; if (run > bestN) { bestN = run; bestA = runA; } }
        else run = 0;
      }
      if (bestN === 0) break;
      const cy0 = 0, cy1 = Math.min(g.rows - 1, Math.ceil(1.95 / g.cellH));
      const needed = Math.ceil(0.80 / g.cellW);
      const mid = bestA + bestN / 2;
      const cx0 = Math.max(bestA, Math.round(mid - needed / 2));
      const cx1 = Math.min(bestA + bestN - 1, cx0 + needed - 1);
      let bx = cx0, by = cy0, bd = 2;
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const d = g.depth[g.idx(cx, cy)];
          if (d < bd) { bd = d; bx = cx; by = cy; }
        }
      }
      p.applyHit(p.pointAt((bx + 0.5) / g.cols, (by + 0.5) / g.rows), 1);
      blows++;
      if (p.openChannel().open) { opened = true; break; }
    }
    const ch = p.openChannel();

    // ---- stand beside it -------------------------------------------------------------------
    const n = p.normal, c = p.root.position;
    const ax = -n.z, az = n.x;
    e.player.pos.set(c.x + n.x * s.back + ax * s.side, e.room.floorY, c.z + n.z * s.back + az * s.side);
    e.player.vel.set(0, 0, 0);
    const yaw = Math.atan2(c.x - e.player.pos.x, c.z - e.player.pos.z);
    e.player.aimYaw = yaw; e.player.aimPitch = 0; e.player.facing = yaw;
    e.cam.yaw = yaw; e.cam.pitch = s.pitch ?? 0; e.cam._first = true;
    return {
      id: p.id, space: p.spec.a, w: +p.width.toFixed(2), h: +p.height.toFixed(2),
      storey: room.spaces.find((q) => q.id === p.spec.a)?.storey ?? null,
      blows, opened, chW: +ch.width.toFixed(2), chH: +(ch.height ?? 0).toFixed(2),
      blocksMove: p.blocksMovement(),
      from: [+e.player.pos.x.toFixed(2), +e.player.pos.z.toFixed(2)],
    };
  }, [site, icw, ich, digh]);

  let ok = 0, bad = 0;
  for (const s of SITES) {
    const r = await openAndFrame(s, IC_W, IC_H, DIG_H);
    if (r.err) { fail(`${s.tag} can be photographed`, r.err); bad++; continue; }
    await step(20);
    await shot(`digsite-${s.tag}`);
    note(`${r.id.padEnd(18)} ${String(r.space).padEnd(9)} face ${r.w} x ${r.h} m in a ${r.storey} m storey `
      + `· ${r.blows} blows -> channel ${r.chW} x ${r.chH} m, blocksMove ${r.blocksMove} `
      + `· camera at ${r.from.join(', ')}`);
    note(`      ${s.why}`);
    r.opened && !r.blocksMove ? ok++ : bad++;
  }

  // the tall-room question, framed for the storey
  const t = await openAndFrame(TALL, IC_W, IC_H, DIG_H);
  if (!t.err) {
    await step(20);
    await shot(`digsite-${TALL.tag}`);
    note(`${TALL.tag}: the dig band is ${DIG_H} m of a ${t.storey} m storey `
      + `(${(100 * DIG_H / t.storey).toFixed(0)}% of the wall) — LOOK at this one before quoting the number`);
  }

  ok === SITES.length
    ? pass('every appended dig edge opens a body-sized hole and was photographed',
      `${ok}/${SITES.length} sites breached and captured`)
    : fail('every appended dig edge opens a body-sized hole and was photographed',
      `${bad} of ${SITES.length} sites did not open — a dig face that cannot be walked through is not a route`);
}
