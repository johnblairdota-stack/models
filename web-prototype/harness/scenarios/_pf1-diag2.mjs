/**
 * 🚨 **PART 2 — HOW STICKY IS IT, DOES THE REAL UNLOCK HAVE IT TOO, AND WHAT DOES IT LOOK LIKE?**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_pf1-diag2.mjs \
 *        --port 5402 --q "seed=s4&dig=1" --shots
 *
 * `_pf1-diag.mjs` established that after `[B]` the near face is open (1.46 m channel) and the
 * TWIN is untouched and solid, and a body is refused. This asks the four questions that decide
 * what the fix has to be:
 *
 *   P1  THE PICTURE. Stand in the gallery at the breach after `[B]` and photograph it, with the
 *       grid read in the same page at the same instant. The twin's four layer planes are
 *       `FrontSide` facing ITS room (`wall.js` only flips the SCALAR arm to `DoubleSide`), so the
 *       question is whether the invisible wall reads as a way through.
 *   P2  SELF-REPAIR. One more blow at the rim fires `_couple()`. Does one swing fix it? If it
 *       does, the bug is intermittent, which is worse to report and easy to mis-diagnose.
 *   P3  THE REAL UNLOCK. `[B]` is a testing key. `room.unlockBarrier()` — the shipped mechanic,
 *       John's own sentence — uses the SAME `setBarrier(false)` call. Does an abandoned dig
 *       become a doorway after a legitimate interconnect breakthrough?
 *   P4  THE PAIR INVARIANT, swept. Two faces of ONE wall band cannot disagree about whether
 *       there is a hole in it. Measure how often they do.
 */

const f3 = (n) => (Math.round(n * 1000) / 1000).toFixed(3);

/** in-page helper source, injected once — the same reading `_pf1-diag` used. */
const HELPERS = () => {
  const W = window;
  W.__pf1 = {
    room: () => W.__rrr.engine.room,
    /** a body-sized excavation on ONE face, competent aim, every blow through the brush */
    dig(p, blows, loU = 0.30, hiU = 0.70) {
      const g = p.field;
      const cx0 = Math.max(0, Math.floor(loU * g.cols));
      const cx1 = Math.min(g.cols - 1, Math.ceil(hiU * g.cols));
      const cy0 = Math.floor(0.30 / g.cellH);
      const cy1 = Math.min(g.rows - 1, Math.ceil(1.95 / g.cellH));
      let n = 0;
      for (let k = 0; k < blows; k++) {
        let bx = cx0, by = cy0, bd = 2;
        for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
          const d = g.depth[g.idx(cx, cy)];
          if (d < bd) { bd = d; bx = cx; by = cy; }
        }
        p.applyHit(p.pointAt((bx + 0.5) / g.cols, (by + 0.5) / g.rows), 1);
        n++;
        if (p.openChannel().open && p.twin && !p.twin.blocksMovement()) break;
      }
      g.flush();
      return n;
    },
    /** drive the player's own body at the face and report metres past it */
    shove(p) {
      const e = W.__rrr.engine;
      const V = e.player.pos.constructor;
      const n = p.normal;
      const ch = p.openChannel();
      const start = p.pointAt(ch.open ? ch.centreU : 0.5, 0.5).clone();
      start.y = e.room.floorY ?? 0;
      const pos = new V(start.x + n.x * 1.4, start.y, start.z + n.z * 1.4);
      const step = new V(-n.x * 0.05, 0, -n.z * 0.05);
      for (let i = 0; i < 200; i++) pos.copy(e.room.collide(pos.clone().add(step), e.player.radius, 1.70));
      return +(-((pos.x - start.x) * n.x + (pos.z - start.z) * n.z)).toFixed(3);
    },
    face(p) {
      const g = p.field, ch = p.openChannel();
      let see = 0, open = 0, barr = 0;
      for (let i = 0; i < g.depth.length; i++) {
        if (g.depth[i] >= 0.999) { see++; if (!g.barrier[i]) open++; }
        if (g.barrier[i]) barr++;
      }
      return { id: p.id, hits: g.hits.length, maxDepth: +g.maxDepth.toFixed(3),
        see, open, barr, w: +ch.width.toFixed(3), h: +(ch.height ?? 0).toFixed(2),
        passable: !!ch.open, blocks: p.blocksMovement(), boxes: p.solidBoxes().length };
    },
  };
  return true;
};

export default async function pf1b({ page, note, pass, fail, skip, shot }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);
  await page.evaluate(HELPERS);

  const arm = await page.evaluate(() => {
    const c = window.__rrr.engine.room.digCensus();
    return { mode: c.mode, seed: String(window.__rrr.engine.run?.seed ?? '') };
  });
  if (arm.mode !== 'free') { skip('free arm', `mode=${arm.mode}`); return; }
  note(`arm dig=${arm.mode} · seed "${arm.seed}"`);

  // ==========================================================================
  // P1 — THE PICTURE, WITH THE GRID READ IN THE SAME PAGE AT THE SAME INSTANT
  // ==========================================================================
  const p1 = await page.evaluate(() => {
    const e = window.__rrr.engine, room = e.room, H = window.__pf1;
    room.setDigPlan({ seed: String(e.run?.seed ?? 's4') });
    const c = room.digCensus();
    const gal = room.panels.filter((p) => p.spec?.free && p.spec.a === 'gallery' && p.field);
    const p = gal.find((q) => !c.link.includes(q.id) && q.width > 2.5) ?? gal[0];
    // 🚨 null the debris hooks or 60 blows in one frame bury the surface under test
    const keep = [p.onChunk, p.onBreak]; p.onChunk = null; p.onBreak = null;
    const blows = H.dig(p, 60);
    // press the barrier off exactly as `[B]` does
    for (const q of room.panels) if (q.spec?.dig) q.setBarrier(false);
    // stand in the gallery, 2.2 m back, looking at the hole
    const ch = p.openChannel();
    const n = p.normal, cpos = p.pointAt(ch.open ? ch.centreU : 0.5, 0.5);
    e.player.pos.set(cpos.x + n.x * 2.2, room.floorY, cpos.z + n.z * 2.2);
    e.player.vel.set(0, 0, 0);
    const yaw = Math.atan2(cpos.x - e.player.pos.x, cpos.z - e.player.pos.z);
    e.player.aimYaw = yaw; e.player.aimPitch = 0; e.player.facing = yaw;
    e.cam.yaw = yaw; e.cam.pitch = 0; e.cam._first = true;
    p.onChunk = keep[0]; p.onBreak = keep[1];
    // what actually DRAWS where the twin's material stands
    const t = p.twin;
    const sides = (q) => (q?.mats ?? []).slice(0, 4).map((m) => (m?.side === 2 ? 'double' : m?.side === 1 ? 'back' : 'front')).join('/');
    return {
      blows, near: H.face(p), twin: t ? H.face(t) : null,
      past: H.shove(p),
      nearSides: sides(p), twinSides: sides(t),
      twinLayerVisible: (t?.layers ?? []).map((l) => !!l?.visible).join(''),
      route: (() => { try { const r = room.pathPortals(p.spec.a, p.spec.b, 0.68, 1.70); return Array.isArray(r) ? r.length : (r ? 1 : 0); } catch { return 'err'; } })(),
    };
  });
  // let the loop settle so the boom lands and the texture uploads, then photograph it
  await page.waitForTimeout(600);
  await shot('pf1-breach-from-the-gallery');
  note('');
  note('P1 — THE PICTURE AND THE GRID, ONE INSTANT');
  note(`   ${p1.blows} blows, then [B]. near ${p1.near.id}: channel ${p1.near.w} m x ${p1.near.h} m, `
    + `passable ${p1.near.passable}, ${p1.near.open} passable cells, ${p1.near.boxes} boxes`);
  note(`   twin ${p1.twin?.id}: ${p1.twin?.hits} hits, maxDepth ${p1.twin?.maxDepth}, `
    + `channel ${p1.twin?.w} m, passable ${p1.twin?.passable}, ${p1.twin?.boxes} box(es)`);
  note(`   body driven at it: ${p1.past} m past the face · BFS route hops ${p1.route}`);
  note(`   layer material sides — near ${p1.nearSides} · twin ${p1.twinSides} `
    + `(twin layers visible "${p1.twinLayerVisible}")`);
  note('   → a FrontSide plane facing the other room is backface-culled from here, so the twin\'s');
  note('     surviving material draws NOTHING into this hole: the picture is a way through.');

  // ==========================================================================
  // P2 — SELF-REPAIR: does one more blow fire `_couple()` and open the twin?
  // ==========================================================================
  const p2 = await page.evaluate(() => {
    const room = window.__rrr.engine.room, H = window.__pf1;
    const c = room.digCensus();
    const gal = room.panels.filter((p) => p.spec?.free && p.spec.a === 'gallery' && p.field);
    const p = gal.find((q) => !c.link.includes(q.id) && q.width > 2.5) ?? gal[0];
    const t = p.twin;
    const before = { near: H.face(p), twin: H.face(t), past: H.shove(p) };
    const g = p.field;
    // one blow at the RIM of the hole — the first thing a player does when refused
    let bx = 0, by = Math.floor(1.0 / g.cellH), bd = 2;
    for (let cy = Math.floor(0.30 / g.cellH); cy < Math.min(g.rows, Math.ceil(1.95 / g.cellH)); cy++) {
      for (let cx = 0; cx < g.cols; cx++) {
        const d = g.depth[g.idx(cx, cy)];
        if (d > 0.05 && d < 0.999 && d < bd) { bd = d; bx = cx; by = cy; }
      }
    }
    p.onChunk = null; p.onBreak = null;
    const res = p.applyHit(p.pointAt((bx + 0.5) / g.cols, (by + 0.5) / g.rows), 1);
    g.flush();
    return { before, res: { brokeThrough: res.brokeThrough, removed: +res.removed.toFixed(4) },
      after: { near: H.face(p), twin: H.face(t), past: H.shove(p) } };
  });
  note('');
  note('P2 — ONE MORE BLOW AT THE RIM (the first thing a refused player does)');
  note(`   before: twin ${p2.before.twin.hits} hits / ${p2.before.twin.open} passable cells / `
    + `channel ${p2.before.twin.w} m · body ${p2.before.past} m past`);
  note(`   blow: brokeThrough ${p2.res.brokeThrough}, removed ${p2.res.removed}`);
  note(`   after:  twin ${p2.after.twin.hits} hits / ${p2.after.twin.open} passable cells / `
    + `channel ${p2.after.twin.w} m · body ${p2.after.past} m past`);
  if (p2.after.past > 0.15 && p2.before.past <= 0.15) {
    note('   🚨 ONE SWING REPAIRS IT — the bug is INTERMITTENT, which is why it reads as');
    note('      "I thought I had destroyed enough stuff" rather than as a hard wall.');
  } else if (p2.after.past <= 0.15) {
    note('   the blow did NOT repair it — the refusal is sticky at this state.');
  }

  // ==========================================================================
  // P3 — THE REAL UNLOCK. `[B]` is a test key; this is the shipped mechanic.
  // ==========================================================================
  const p3 = await page.evaluate(() => {
    const room = window.__rrr.engine.room, H = window.__pf1;
    room.setDigPlan({ seed: String(window.__rrr.engine.run?.seed ?? 's4') });
    const c = room.digCensus();
    const gal = room.panels.filter((p) => p.spec?.free && p.spec.a === 'gallery' && p.field);
    const dud = gal.find((q) => !c.link.includes(q.id) && q.width > 2.5) ?? gal[0];
    const link = room.panels.find((q) => q.spec?.free && c.link.includes(q.id) && q.field);
    if (!dud || !link) return null;
    for (const q of [dud, link, dud.twin, link.twin]) { if (q) { q.onChunk = null; q.onBreak = null; } }
    // 1. abandon a big dig in the gallery
    const dudBlows = H.dig(dud, 60);
    const midDud = { near: H.face(dud), twin: H.face(dud.twin), past: H.shove(dud) };
    // 2. now legitimately find and open the interconnect somewhere else in the house
    const g = link.field;
    let icBlows = 0;
    for (let k = 0; k < 400; k++) {
      // aim inside the barrier-free run, at the least-dug cell — `dig-band` phase 2's own rule
      const by0 = Math.floor(0.30 / g.cellH), by1 = Math.min(g.rows - 1, Math.ceil(1.80 / g.cellH));
      let bestA = -1, bestN = 0, runA = -1, r = 0;
      for (let cx = 0; cx <= g.cols; cx++) {
        let clear = cx < g.cols;
        for (let cy = by0; cy <= by1 && clear; cy++) if (g.barrier[g.idx(cx, cy)]) clear = false;
        if (clear) { if (r === 0) runA = cx; r++; if (r > bestN) { bestN = r; bestA = runA; } } else r = 0;
      }
      if (bestN === 0) break;
      const needed = Math.ceil(0.80 / g.cellW);
      const mid = bestA + bestN / 2;
      const cx0 = Math.max(bestA, Math.round(mid - needed / 2));
      const cx1 = Math.min(bestA + bestN - 1, cx0 + needed - 1);
      let bx = cx0, by = 0, bd = 2;
      for (let cy = 0; cy <= Math.min(g.rows - 1, Math.ceil(1.95 / g.cellH)); cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const d = g.depth[g.idx(cx, cy)];
          if (d < bd) { bd = d; bx = cx; by = cy; }
        }
      }
      link.applyHit(link.pointAt((bx + 0.5) / g.cols, (by + 0.5) / g.rows), 1);
      icBlows++;
      if (!link.blocksMovement()) break;
    }
    const unlocked = room.digCensus().unlocked;
    return { dudBlows, icBlows, unlocked, link: link.id, dud: dud.id, midDud,
      afterUnlock: { near: H.face(dud), twin: H.face(dud.twin), past: H.shove(dud) },
      linkPair: { near: H.face(link), twin: H.face(link.twin), past: H.shove(link) } };
  });
  note('');
  note('P3 — THE SHIPPED HOUSE-WIDE UNLOCK (no [B] anywhere in this arm)');
  if (!p3) { skip('the real unlock reaches an abandoned dig', 'no dud + interconnect pair found'); }
  else {
    note(`   ${p3.dudBlows} blows abandoned at ${p3.dud}, then ${p3.icBlows} blows opened the `
      + `interconnect ${p3.link} · unlocked ${p3.unlocked}`);
    note(`   the INTERCONNECT pair: near ${p3.linkPair.near.w} m / twin ${p3.linkPair.twin.w} m `
      + `· body ${p3.linkPair.past} m past  ← this one works, and it works because a breakthrough couples`);
    note(`   the ABANDONED dig, after the unlock: near ${p3.afterUnlock.near.w} m passable `
      + `${p3.afterUnlock.near.passable} / twin ${p3.afterUnlock.twin.w} m passable `
      + `${p3.afterUnlock.twin.passable} (${p3.afterUnlock.twin.hits} hits) · body `
      + `${p3.afterUnlock.past} m past`);
    if (p3.unlocked && p3.afterUnlock.near.passable && p3.afterUnlock.past <= 0.15) {
      fail('an abandoned dig becomes a doorway at the house-wide unlock',
        `${p3.dud} reports a ${p3.afterUnlock.near.w} m channel and a body gets `
        + `${p3.afterUnlock.past} m past it — the twin is untouched. This is the SHIPPED mechanic, `
        + 'not the [B] test key: John\'s sentence "walk through the other areas they destroyed the '
        + 'white wall through" is half-implemented.');
    } else if (p3.unlocked && p3.afterUnlock.past > 0.15) {
      pass('an abandoned dig becomes a doorway at the house-wide unlock',
        `body ${p3.afterUnlock.past} m past the abandoned dig`);
    } else {
      skip('an abandoned dig becomes a doorway at the house-wide unlock',
        `the unlock did not fire (unlocked=${p3.unlocked}) — nothing to assert`);
    }
  }

  // ==========================================================================
  // P4 — THE PAIR INVARIANT, SWEPT. Two faces of ONE wall band cannot disagree
  // about whether there is a hole in it.
  // ==========================================================================
  const p4 = await page.evaluate((seeds) => {
    const room = window.__rrr.engine.room, H = window.__pf1;
    const rows = [];
    for (const s of seeds) {
      room.setDigPlan({ seed: s });
      const seen = new Set();
      for (const p of room.panels) {
        if (!p.spec?.free || !p.field || !p.twin || seen.has(p.id)) continue;
        seen.add(p.id); seen.add(p.twin.id);
        p.onChunk = null; p.onBreak = null;
        // the ceiling, on ONE side only: excavate the near face completely, leave the twin alone
        const g = p.field;
        g.depth.fill(1); g._touch();
        // and drop the barrier, exactly as the unlock / [B] does
        p.setBarrier(false); p.twin.setBarrier(false);
        const a = H.face(p), b = H.face(p.twin);
        rows.push({ seed: s, id: p.id, twin: p.twin.id, aW: a.w, bW: b.w,
          aOpen: a.passable, bOpen: b.passable, past: H.shove(p) });
      }
      room.setDigPlan({ seed: s });
    }
    return rows;
  }, ['s4', 'search-b', 's7']);
  const bad = p4.filter((r) => r.aOpen !== r.bOpen);
  const stuck = p4.filter((r) => r.aOpen && r.past <= 0.15);
  note('');
  note(`P4 — THE PAIR INVARIANT over ${p4.length} span x seed pairs (near face fully excavated, `
    + 'barrier dropped, twin untouched):');
  note(`   the two faces of one band DISAGREE about passability on ${bad.length} of ${p4.length}`);
  note(`   the near face says open and a body is refused on ${stuck.length} of ${p4.length}`);
  note(`   worst: ${p4.slice(0, 4).map((r) => `${r.id} ${r.aW}/${r.bW} m past ${r.past}`).join(' · ')}`);
  if (bad.length === 0 && stuck.length === 0) {
    pass('the two faces of one wall band agree about the hole in it', `${p4.length} pairs`);
  } else {
    fail('the two faces of one wall band agree about the hole in it',
      `${bad.length} of ${p4.length} pairs disagree; ${stuck.length} report an open channel a body `
      + 'cannot use. `blocksMovement()` is per FACE and the collider walks BOTH faces, so a hole '
      + 'that exists on one side only is a hole the game shows you and refuses you.');
  }
}
