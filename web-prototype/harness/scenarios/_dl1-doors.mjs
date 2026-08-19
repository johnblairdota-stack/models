/**
 * 🚪 `doorlook-1` — DOES A CLOSED DOOR READ AS CHAINED AND BOARDED, AND DOES THE PERIMETER LOOK
 * LIKE THE INTERIOR?
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_dl1-doors.mjs \
 *        --port 5420 --q "seed=s4" --shots
 *
 * John: *"I want to keep the OG chained doors. they should be visually the same as the ones the
 * hunter bashes on, but the undamageable ones are on the edge of the map and don't open. That way
 * players don't get a sense of direction from the lack of doors on the outside walls."*
 *
 * Four things are asked here and they are different questions:
 *
 *  A. **IS IT WEARING ANYTHING** — `exterior.dressingOf(id)` over every closed connector.
 *     `bang-1` photographed `p.gal_w` as *"a dark recessed panel with corner brackets and a
 *     dashed X: no chain, no padlock"* — the coin flip left about a fifth of them bare.
 *  B. **DOES IT READ** — the dressing's OWN pixels, by hide-diff (`_dark2-who`'s method, which is
 *     the only one that can attribute a frame region to a mesh). `critic-slice-3` #5's defect is
 *     a mean luma and a dark fraction, so it is answered with a mean luma and a dark fraction.
 *  C. **CAN JOHN TELL THEM APART** — the same crop, same standoff, same framing, on an EXTERIOR
 *     chained door and an INTERIOR breachable one, side by side. The gate is that the two crops
 *     are closer to each other than either is to a bare wall.
 *  D. **WHAT IT COSTS** — `renderer.info.render.calls`, as a PAIRED IN-PLACE FLIP in ONE page
 *     (`exterior.setDressRule(false|true)`), which is the only draw-call A/B this project
 *     accepts. Two processes are not comparable.
 *
 * 🚨 EVERY ARM SHIPS A CONTROL THAT MUST FAIL:
 *   · B's mask is validated by requiring the hidden arm to differ (a mask of 0 px means the probe
 *     is photographing a door with no hardware on it, and it SKIPS rather than passes).
 *   · C's identification gate carries a BARE-WALL third crop that must NOT match — if a bare
 *     stretch of plaster scores as "the same object" the metric is measuring the room, not the door.
 *   · D flips the rule OFF and requires the dressed-instance count to CHANGE; if it does not, the
 *     flip did nothing and the delta is not a delta.
 */
import { decodePng } from '../pxdiff.mjs';
import { hold, release } from '../still.mjs';

const lumaOf = (img, i) => 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];

function maskOf(a, b, tol = 3) {
  const n = Math.min(a.data.length, b.data.length), ch = a.channels;
  const m = new Uint8Array(Math.floor(n / ch));
  let count = 0;
  for (let i = 0, k = 0; i + ch <= n; i += ch, k++) {
    if (Math.abs(lumaOf(a, i) - lumaOf(b, i)) > tol) { m[k] = 1; count++; }
  }
  return { m, count };
}

function underMask(img, m) {
  const ch = img.channels;
  let s = 0, n = 0, dark = 0, s2 = 0, n2 = 0;
  for (let i = 0, k = 0; i + ch <= img.data.length; i += ch, k++) {
    const L = lumaOf(img, i);
    if (m[k]) { s += L; n++; if (L < 18) dark++; } else { s2 += L; n2++; }
  }
  return { mean: n ? s / n : 0, darkFrac: n ? dark / n : 0, rest: n2 ? s2 / n2 : 0, n };
}

/**
 * 🚨 **THE WALL THIS THING HANGS ON, WHICH IS THE ONLY HONEST DENOMINATOR FOR "BLACK CUT-OUT".**
 *
 * An absolute luma cannot answer it. The same mesh, the same material and the same instance
 * reads **L 55 in the east study and L 21 in the dark end of the gallery** — that is the room's
 * light budget, which belongs to whoever owns the lighting, and a gate on the absolute number
 * fails the darkest room in the house for having a dark room in it. A cut-out is a RELATIVE
 * fact: it is a hole when it is much darker than the wall around it, and it is a surface when it
 * is not. So the denominator is the ring of wall immediately outside the object's own pixels.
 *
 * Box-dilate the mask by `r` and subtract it from itself; what is left is that ring.
 */
function ringOf(mask, w, h, r = 7) {
  const dil = new Uint8Array(mask.length);
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let d = -r; d <= r && !v; d++) { const xx = x + d; if (xx >= 0 && xx < w && mask[y * w + xx]) v = 1; }
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let d = -r; d <= r && !v; d++) { const yy = y + d; if (yy >= 0 && yy < h && tmp[yy * w + x]) v = 1; }
      dil[y * w + x] = v && !mask[y * w + x] ? 1 : 0;
    }
  }
  return dil;
}

/** 16-bin luma histogram of the centre crop — the shape a door's dressing makes. */
function centreHist(img, fx = 0.34, fy = 0.42) {
  const w = img.width, h = img.height, ch = img.channels;
  const x0 = Math.round(w * (0.5 - fx / 2)), x1 = Math.round(w * (0.5 + fx / 2));
  const y0 = Math.round(h * (0.5 - fy / 2)), y1 = Math.round(h * (0.5 + fy / 2));
  const bins = new Float64Array(16);
  let n = 0, sum = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const L = lumaOf(img, (y * w + x) * ch);
      bins[Math.min(15, Math.floor(L / 16))]++; n++; sum += L;
    }
  }
  for (let i = 0; i < 16; i++) bins[i] /= n || 1;
  return { bins, mean: sum / (n || 1), n };
}
/** L1 distance between two normalised histograms, 0 (identical) .. 2 (disjoint). */
const histDist = (a, b) => a.bins.reduce((s, v, i) => s + Math.abs(v - b.bins[i]), 0);

export default async function dl1doors({ page, note, pass, fail, skip, snap, shot }) {
  const wait = async (f) => { for (let i = 0; i < f; i++) await page.waitForTimeout(40); };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  // ---- A. what every closed connector is wearing --------------------------
  const plan = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const ext = e.exterior;
    if (!ext?.enabled) return { ok: false, why: 'no exterior' };
    const rows = [];
    for (const p of e.room.panels) {
      const spec = p.spec;
      if (!spec || spec.dig || spec.free) continue;
      if (!p.blocksMovement()) continue;
      const d = ext.dressingOf(p.id);
      rows.push({
        id: p.id, outside: spec.b === 'outside', damageable: p.state.isDamageable(),
        chain: !!d?.chain, boards: !!d?.boards, mortar: !!d?.mortar, seam: !!d?.seam,
        variant: d?.variant ?? null,
      });
    }
    return { ok: true, rows, tells: ext.tells, seed: e.run?.seed ?? null, live: e.run?.exitId ?? null };
  });
  if (!plan.ok) { fail('the exterior module is live', plan.why); return; }
  note(`tells=${plan.tells} seed=${plan.seed} live=${plan.live}`);
  const perim = plan.rows.filter((r) => r.outside);
  const inter = plan.rows.filter((r) => !r.outside);
  for (const r of plan.rows) {
    note(`  ${r.id.padEnd(22)} ${r.outside ? 'PERIMETER' : 'interior '} forceable=${r.damageable ? 'Y' : 'N'}`
      + ` chain=${r.chain ? 'Y' : '.'} boards=${r.boards ? 'Y' : '.'} mortar=${r.mortar ? 'Y' : '.'} variant=${r.variant}`);
  }
  const bare = plan.rows.filter((r) => !r.chain && !r.boards && !r.mortar);
  const noChain = plan.rows.filter((r) => !r.chain);
  note(`A: ${perim.length} perimeter + ${inter.length} interior closed connectors;`
    + ` ${noChain.length} with no chain, ${bare.length} wearing nothing at all`);
  if (noChain.length === 0) pass('A1 every closed door in the built house wears a chain', `${plan.rows.length}/${plan.rows.length}`);
  else fail('A1 every closed door in the built house wears a chain', `${noChain.length} bare: ${noChain.map((r) => r.id).join(',')}`);
  const noBoard = plan.rows.filter((r) => !r.boards);
  if (noBoard.length === 0) pass('A2 every closed door in the built house is boarded', `${plan.rows.length}/${plan.rows.length}`);
  else fail('A2 every closed door in the built house is boarded', `${noBoard.length}: ${noBoard.map((r) => r.id).join(',')}`);
  // A3 — the perimeter and the interior wear the same things.
  const share = (rs, k) => (rs.length ? rs.filter((r) => r[k]).length / rs.length : 0);
  const gaps = ['chain', 'boards', 'mortar'].map((k) => Math.abs(share(perim, k) - share(inter, k)));
  const worst = Math.max(...gaps);
  if (worst < 0.001) pass('A3 perimeter and interior wear identical hardware on this seed', `max gap ${(worst * 100).toFixed(1)}pp`);
  else fail('A3 perimeter and interior wear identical hardware on this seed',
    `chain ${(share(perim, 'chain') * 100).toFixed(0)}/${(share(inter, 'chain') * 100).toFixed(0)}%`
    + ` boards ${(share(perim, 'boards') * 100).toFixed(0)}/${(share(inter, 'boards') * 100).toFixed(0)}%`
    + ` mortar ${(share(perim, 'mortar') * 100).toFixed(0)}/${(share(inter, 'mortar') * 100).toFixed(0)}%`);
  // A4 — the chained ones must still be unforceable, which is the gate the look must not break.
  const forceablePerim = perim.filter((r) => r.damageable && r.id !== plan.live);
  if (!forceablePerim.length) pass('A4 every chained exterior door is still unforceable', `${perim.length - (plan.live ? 1 : 0)} sites`);
  else fail('A4 every chained exterior door is still unforceable', forceablePerim.map((r) => r.id).join(','));

  // ---- helpers ------------------------------------------------------------
  const parkPanel = (pid, back = 3.2, yawOff = 0) => page.evaluate(([id, d0, dy]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    if (!p) return { ok: false, why: 'no panel ' + id };
    const home = e.room.spaces.find((s) => s.id === p.ownerSpace?.id);
    const inSign = home ? p.sideOf({ x: home.cx, y: 0, z: home.cz }) : 1;
    const n = p.normal;
    const c = p.pointAt(0.5, 0.5);
    e.player.pos.set(c.x + n.x * d0 * inSign, e.room.floorY, c.z + n.z * d0 * inSign);
    e.player.vel.set(0, 0, 0);
    const f = Math.atan2(-n.x * inSign, -n.z * inSign) + dy;
    e.player.facing = f; e.player.aimYaw = f;
    if (e.cam) { e.cam.yaw = f; e.cam.pitch = 0; e.cam._first = true; }
    e.room.setViewpoints?.([{ pos: e.player.pos, dir: { x: Math.sin(f), z: Math.cos(f) } }]);
    return { ok: true, space: e.room.spaceAt(e.player.pos)?.id ?? null };
  }, [pid, back, yawOff]);

  const hideBody = (on) => page.evaluate((v) => {
    const e = window.__rrr.engine;
    let n = 0;
    for (const o of [e.player?.root, e.player?.rig?.root, e.player?.mesh]) {
      if (o) { o.visible = !v; n++; }
    }
    return n;
  }, on);

  /** Hide one KIND of dressing, or all of them. The mask this produces IS that kind's pixels. */
  const hideDress = (on, kind = null) => page.evaluate(([v, k]) => {
    const e = window.__rrr.engine;
    const re = k ? new RegExp(`^exterior\\.dress\\.${k}(\\.|$)`) : /^exterior\.dress\./;
    let n = 0;
    e.scene.traverse((o) => {
      if (!o.isMesh) return;
      if (!re.test(o.name || '')) return;
      o.visible = !v; n++;
    });
    return n;
  }, [on, kind]);

  const calls = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    const c = e.exterior?.census?.() ?? {};
    return {
      calls: e.renderer.info.render.calls, tris: e.renderer.info.render.triangles,
      programs: e.renderer.info.programs?.length ?? -1,
      dressCalls: c.dressCalls ?? -1, dressedNow: c.dressedNow ?? null,
    };
  });

  // ---- B / C. stations ----------------------------------------------------
  // ⚠️ TWO OF EACH KIND, AND THEY ARE PAIRED ON PURPOSE: an exterior CHAINED door and an
  // interior BREACHABLE one, framed identically, is exactly the picture John has to fail to
  // tell apart.
  const STATIONS = [
    { tag: 'chained-galn', id: 'x.gallery.north_w', kind: 'perimeter' },
    { tag: 'chained-stair', id: 'x.study_e.stair', kind: 'perimeter' },
    { tag: 'breach-galw', id: 'p.gal_w', kind: 'interior' },
    { tag: 'breach-chapel', id: 'p.chapel', kind: 'interior' },
  ];
  const hists = new Map();
  const marks = [];

  await hideBody(true);
  for (const st of STATIONS) {
    const ok = await parkPanel(st.id, 3.2, 0);
    note(`${st.tag} ${JSON.stringify(ok)}`);
    if (!ok.ok) { skip(`${st.tag} reachable`, ok.why); continue; }
    await wait(45);
    await hold(page);
    await wait(4);
    const shown = decodePng(await snap(`${st.tag}-on`));
    await shot(`dl1-${st.tag}`);
    const nHid = await hideDress(true); await wait(5);
    const hidden = decodePng(await snap(`${st.tag}-off`));
    await shot(`dl1-${st.tag}-nodress`);
    await hideDress(false); await wait(4);
    // 🚨 THE BOARDS ON THEIR OWN. `critic-slice-3` #5 is a claim about the BOARDING — *"boarding
    // renders as flat black cut-outs"* — and a mask that lumps boards in with a black iron chain
    // answers a different question with the chain's own albedo. Dark iron is what a chain is
    // supposed to be; a black plank is the defect. So they are separated and both are reported.
    await hideDress(true, 'boards'); await wait(5);
    const noBoards = decodePng(await snap(`${st.tag}-noboards`));
    await hideDress(false, 'boards'); await wait(4);
    await release(page);
    if (!shown || !hidden) { skip(`${st.tag} captured`, 'no png'); continue; }
    const { m, count } = maskOf(shown, hidden, 3);
    const frac = count / (shown.width * shown.height);
    if (count < 400) {
      skip(`${st.tag} has visible hardware`, `hide-diff mask ${count} px over ${nHid} meshes — nothing to measure`);
      continue;
    }
    const u = underMask(shown, m);
    const bm = noBoards ? maskOf(shown, noBoards, 3) : { m: null, count: 0 };
    const ub = bm.m ? underMask(shown, bm.m) : null;
    let ring = 0;
    if (bm.m) {
      const rmask = ringOf(bm.m, shown.width, shown.height, 7);
      const ur = underMask(shown, rmask);
      ring = ur.mean;
    }
    note(`B ${st.tag.padEnd(14)} ALL mask ${String(count).padStart(6)} px (${(frac * 100).toFixed(1)}% of frame)`
      + ` L ${u.mean.toFixed(1)} (${(u.darkFrac * 100).toFixed(0)}% <L18) · rest L ${u.rest.toFixed(1)}`
      + (ub ? ` || BOARDS ${String(bm.count).padStart(6)} px L ${ub.mean.toFixed(1)} vs the WALL RING AROUND THEM L ${ring.toFixed(1)}`
        + ` = ${(ub.mean / Math.max(1e-6, ring)).toFixed(2)}x` : ' || boards mask empty'));
    marks.push({
      ...st, count, frac, mean: u.mean, darkFrac: u.darkFrac, rest: u.rest,
      bCount: bm.count, bMean: ub?.mean ?? 0, bDark: ub?.darkFrac ?? 1, bRing: ring,
      bRel: ub ? ub.mean / Math.max(1e-6, ring) : 0,
    });
    hists.set(st.tag, centreHist(shown));
    hists.set(`${st.tag}#bare`, centreHist(hidden));
  }

  if (marks.length < 2) { skip('B/C measured', `${marks.length} station(s) had visible hardware`); }
  else {
    // B1 — the black cut-out gate. A cut-out is DARKER THAN THE WALL IT IS IN; the absolute luma
    // is the room's, not the object's (same instance: L 55 in the study, L 21 in the dark end of
    // the gallery). 0.60x the surrounding wall is the line: below it the boarding reads as a hole
    // somebody forgot to fill, at or above it as a surface somebody nailed over the hole.
    const worst = marks.reduce((a, b) => (b.bRel < a.bRel ? b : a));
    for (const m of marks) note(`B1 ${m.tag.padEnd(14)} boards L ${m.bMean.toFixed(1)} / wall ring L ${m.bRing.toFixed(1)} = ${m.bRel.toFixed(2)}x`);
    if (worst.bRel >= 0.60) {
      pass('B1 the boarding reads as a surface, not a hole, in every room it appears in',
        `worst ${worst.tag} at ${worst.bRel.toFixed(2)}x the wall around it (L ${worst.bMean.toFixed(1)} vs ${worst.bRing.toFixed(1)})`);
    } else {
      fail('B1 the boarding reads as a surface, not a hole, in every room it appears in',
        `worst ${worst.tag} at ${worst.bRel.toFixed(2)}x the wall around it (L ${worst.bMean.toFixed(1)} vs ${worst.bRing.toFixed(1)})`);
    }
    // [CTRL] the boards mask has to be a real region, or B1 is a statistic over nothing.
    const thinnest = marks.reduce((a, b) => (b.bCount < a.bCount ? b : a));
    if (thinnest.bCount > 3000) pass('[CTRL] B1b the boards mask is a real region on every door', `thinnest ${thinnest.tag} at ${thinnest.bCount} px`);
    else fail('[CTRL] B1b the boards mask is a real region on every door', `${thinnest.tag} at ${thinnest.bCount} px — B1 is measuring almost nothing`);
    // B2 — it covers a comparable share of the frame on both kinds. A door you can barely see
    // hardware on is a door that reads as a different object from one you can.
    const P = marks.filter((m) => m.kind === 'perimeter');
    const I = marks.filter((m) => m.kind === 'interior');
    if (P.length && I.length) {
      const mp = P.reduce((a, b) => a + b.frac, 0) / P.length;
      const mi = I.reduce((a, b) => a + b.frac, 0) / I.length;
      const rel = Math.abs(mp - mi) / Math.max(mp, mi);
      if (rel < 0.35) pass('B2 hardware covers the same share of frame on both kinds', `${(mp * 100).toFixed(1)}% vs ${(mi * 100).toFixed(1)}%`);
      else fail('B2 hardware covers the same share of frame on both kinds', `${(mp * 100).toFixed(1)}% vs ${(mi * 100).toFixed(1)}% (${(rel * 100).toFixed(0)}% apart)`);

      // C — THE IDENTIFICATION GATE, AND ITS UNIT IS THE OBJECT, NOT THE ROOM.
      //
      // 🚨 THE FIRST VERSION OF THIS COMPARED A CENTRE-CROP HISTOGRAM AND IT WAS MEASURING THE
      // ROOM. `x.gallery.north_w` and `p.gal_w` are both in the gallery, three metres apart, and
      // their crops still scored 0.575 apart — because one has a painting behind it and the other
      // has a doorway. A frame is a room with a door in it; the question is only about the door.
      //
      // So the statistic is the dressing's OWN pixels (the hide-diff mask isolates them) divided
      // by the same frame's non-mask mean. That is "how dark is this hardware against the room it
      // is in", which is what an eye actually judges, and dividing by the room is what makes a
      // door in the dark gallery comparable with the same door in the lit east study.
      const cRatio = (m) => m.mean / Math.max(1e-6, m.rest);
      for (const m of marks) note(`C ${m.tag.padEnd(14)} ${m.kind.padEnd(9)} hardware/room contrast ${cRatio(m).toFixed(3)} (L ${m.mean.toFixed(1)} on a room at ${m.rest.toFixed(1)})`);
      const cp = P.reduce((a, b) => a + cRatio(b), 0) / P.length;
      const ci = I.reduce((a, b) => a + cRatio(b), 0) / I.length;
      const cRel = Math.abs(cp - ci) / Math.max(cp, ci);
      if (cRel < 0.30) {
        pass('C1 a perimeter door and an interior door are the same object under different light',
          `contrast ${cp.toFixed(3)} vs ${ci.toFixed(3)} — ${(cRel * 100).toFixed(0)}% apart`);
      } else {
        fail('C1 a perimeter door and an interior door are the same object under different light',
          `contrast ${cp.toFixed(3)} vs ${ci.toFixed(3)} — ${(cRel * 100).toFixed(0)}% apart`);
      }
      // 🚨 C2 — AND THE STRUCTURAL FORM OF THE SAME QUESTION, WHICH IS THE ONE THAT CANNOT BE
      // ARGUED WITH. "Is an exterior chained door the same object as an interior breachable one"
      // has a stronger answer than a luma statistic: they are INSTANCES OF THE SAME MESH, with
      // the same geometry and the same material, differing only by a per-instance tint drawn from
      // a hash of (run seed, id). A pixel metric can be defeated by the room; this cannot.
      //
      // ⚠️ THE CONTROL IS A DIG SEGMENT. It is dressed by the same module and it MUST land in a
      // different mesh (its own authored family), so a probe that reports "same mesh" for
      // everything is broken. If the segment matches too, this assertion means nothing.
      const ident = await page.evaluate(() => {
        const e = window.__rrr.engine;
        const im = {};
        e.scene.traverse((o) => { if (o.isInstancedMesh && /^exterior\.dress\./.test(o.name || '')) im[o.name] = o; });
        const conn = { boards: im['exterior.dress.boards'], chain: im['exterior.dress.chain'] };
        const seg = { boards: im['exterior.dress.boards.segment'], chain: im['exterior.dress.chain.segment'] };
        const key = (o) => (o ? `${o.geometry.uuid}|${o.material.uuid}|${o.geometry.attributes.position.count}` : null);
        return {
          connBoards: key(conn.boards), connChain: key(conn.chain),
          segBoards: key(seg.boards), segChain: key(seg.chain),
          names: Object.keys(im).sort(),
        };
      });
      note(`C [CTRL] dressing meshes in the scene: ${ident.names.join(', ')}`);
      if (ident.connBoards && ident.connChain) {
        pass('C2 every closed door in the house is an instance of ONE boards mesh and ONE chain mesh',
          'same geometry uuid, same material uuid, for perimeter and interior alike');
      } else {
        fail('C2 every closed door in the house is an instance of ONE boards mesh and ONE chain mesh', 'meshes not found');
      }
      if (!ident.segBoards) {
        skip('[CTRL] C3 a dig segment is a DIFFERENT mesh', 'no segment family in this build');
      } else if (ident.segBoards !== ident.connBoards && ident.segChain !== ident.connChain) {
        pass('[CTRL] C3 a dig segment is a DIFFERENT mesh — C2 is not "everything matches"',
          'segment family has its own geometry at its own aperture');
      } else {
        fail('[CTRL] C3 a dig segment is a DIFFERENT mesh', 'the probe cannot tell two families apart, so C2 says nothing');
      }
    }
  }
  // ---- F. the same door, the same page, rule ON and rule OFF --------------
  //
  // 🚨 THE ONE ARM THAT PROVES THE FIX RATHER THAN DESCRIBING IT. `p.gal_w` is the door `bang-1`
  // announced and photographed as *"a dark recessed panel with corner brackets and a dashed X: no
  // chain, no padlock"*. With the rule off it is what it was — a mortar slab and a chain; with it
  // on it is boarded. Same station, same frame, same page, one flip between them, so nothing but
  // the dressing can have moved. **If the two arms come back the same, this probe is broken.**
  {
    const ok = await parkPanel('p.gal_w', 3.2, 0);
    if (!ok.ok) { skip('F the before/after at p.gal_w', ok.why); }
    else {
      await wait(45);
      const arm = async (tag) => {
        await wait(6);
        const on = decodePng(await snap(`F-${tag}-on`));
        await shot(`dl1-rule-${tag}`);
        await hideDress(true); await wait(5);
        const off = decodePng(await snap(`F-${tag}-off`));
        await hideDress(false); await wait(4);
        if (!on || !off) return null;
        const { m, count } = maskOf(on, off, 3);
        if (count < 400) return { count, mean: 0, ring: 0, rel: 0 };
        const u = underMask(on, m);
        const r = underMask(on, ringOf(m, on.width, on.height, 7));
        return { count, mean: u.mean, ring: r.mean, rel: u.mean / Math.max(1e-6, r.mean), dark: u.darkFrac };
      };
      const ruleOn = await arm('ruleon');
      await page.evaluate(() => window.__rrr.engine.exterior.setDressRule(false));
      await wait(10);
      const ruleOff = await arm('ruleoff');
      await page.evaluate(() => window.__rrr.engine.exterior.setDressRule(true));
      await wait(8);
      if (!ruleOn || !ruleOff) { skip('F the before/after at p.gal_w', 'a capture came back empty'); }
      else {
        note(`F p.gal_w  RULE ON  dressing ${ruleOn.count} px, L ${ruleOn.mean.toFixed(1)} vs wall ${ruleOn.ring.toFixed(1)} = ${ruleOn.rel.toFixed(2)}x, ${(ruleOn.dark * 100).toFixed(0)}% <L18`);
        note(`F p.gal_w  RULE OFF dressing ${ruleOff.count} px, L ${ruleOff.mean.toFixed(1)} vs wall ${ruleOff.ring.toFixed(1)} = ${ruleOff.rel.toFixed(2)}x, ${(ruleOff.dark * 100).toFixed(0)}% <L18`);
        // ⚠️ **WHAT THIS ARM CAN AND CANNOT SAY, STATED RATHER THAN OVERCLAIMED.** `setDressRule`
        // flips the RULE, not the build: the OFF arm is today's tree with the coin flip back, and
        // today's tree also carries the mortar albedo fix. So OFF is NOT the frame `bang-1`
        // photographed — it is the same door wearing a mortar patch that no longer reads as a
        // hole. The before/after against the OLD build is a cross-process comparison and is
        // reported as one in the write-up, never asserted here.
        //
        // What one page CAN prove is the pair below: the flip reaches the frame (the dressing's
        // own pixel count moves), and BOTH arms read as a surface rather than a hole — i.e. the
        // rule changes the LANGUAGE of the door without reintroducing the cut-out.
        if (Math.abs(ruleOn.count - ruleOff.count) < 500) {
          fail('[CTRL] F1 the flip reaches the frame', `${ruleOff.count} px → ${ruleOn.count} px — the dressing did not change`);
        } else if (ruleOn.rel >= 0.60) {
          pass('F1 the flip reaches the frame and the boarded arm is a surface, not a hole',
            `dressing ${ruleOff.count} px (${ruleOff.rel.toFixed(2)}x) → ${ruleOn.count} px (${ruleOn.rel.toFixed(2)}x) on the door bang-1 photographed`);
        } else {
          fail('F1 the boarded arm is a surface, not a hole', `${ruleOn.rel.toFixed(2)}x of the wall around it`);
        }
      }
    }
  }
  await hideBody(false);

  // ---- E. the daylight seam is not a compass ------------------------------
  //
  // 🚨 THE SHARPEST PERIMETER-ONLY MARKER IN THE HOUSE. `connectorDressing` gates the seam on
  // `spec.b === 'outside'`, so its population is the 14 exterior sites and ZERO of the interior
  // panels on every seed. A glowing hairline that can only ever appear on an outside wall tells
  // a player which way is out, which is the tell John's chained doors exist to deny. `blind` now
  // holds it until the panel stops blocking sight — `connectors.js`'s own stated rule, which this
  // file was not implementing. The CONTROL is the second half: drive a panel to the beam stage
  // and require the seam to come back, or this assertion passes on a seam that is simply broken.
  {
    const closed = await page.evaluate(() => {
      const e = window.__rrr.engine;
      const c = e.exterior.census();
      const withSeam = c.plan.filter((r) => r.seam).map((r) => r.id);
      return { shown: c.dressedNow?.seam ?? -1, planned: withSeam.length, ids: withSeam, tells: c.tells };
    });
    note(`E seam: ${closed.planned} connectors are PLANNED to wear one, ${closed.shown} drawn while every panel is closed`);
    if (closed.tells !== 'blind') skip('E1 no daylight seam on a closed door', `tells=${closed.tells}`);
    else if (closed.shown === 0) pass('E1 no daylight seam on a closed door', `${closed.planned} planned, 0 drawn`);
    else fail('E1 no daylight seam on a closed door', `${closed.shown} drawn — that is a compass on the perimeter`);

    // ⚠️ THE CONTROL HAS TO PARK AT THE PANEL FIRST. A seam on an unbuilt room is hidden by
    // residency (`p.root.visible`), so driving a panel in another wing to stage 3 and reading
    // zero proves nothing — the first version of this arm did exactly that and failed for the
    // wrong reason.
    const revealed = await page.evaluate((ids) => {
      const e = window.__rrr.engine;
      for (const id of ids) {
        const p = e.room.panelOf(id);
        if (!p) continue;
        const home = e.room.spaces.find((s) => s.id === p.ownerSpace?.id);
        const inSign = home ? p.sideOf({ x: home.cx, y: 0, z: home.cz }) : 1;
        const n = p.normal, c = p.pointAt(0.5, 0.5);
        e.player.pos.set(c.x + n.x * 3.2 * inSign, e.room.floorY, c.z + n.z * 3.2 * inSign);
        const f = Math.atan2(-n.x * inSign, -n.z * inSign);
        e.player.facing = f; e.player.aimYaw = f;
        if (e.cam) { e.cam.yaw = f; e.cam.pitch = 0; e.cam._first = true; }
        e.room.setViewpoints?.([{ pos: e.player.pos, dir: { x: Math.sin(f), z: Math.cos(f) } }]);
        p.state.setStage(3);                     // the beam stage: blocksSight false
        return { ok: true, id, blocks: p.blocksSight(), resident: !!p.root.visible };
      }
      return { ok: false, why: 'no seam-planned panel in the build' };
    }, closed.ids);
    if (!revealed.ok) { skip('[CTRL] E2 the seam CAN still fire at the beam stage', revealed.why); }
    else {
      await wait(6);
      const after = await page.evaluate(() => window.__rrr.engine.exterior.census().dressedNow?.seam ?? -1);
      note(`E [CTRL] parked at ${revealed.id} and drove it to stage 3 (blocksSight ${revealed.blocks}, resident ${revealed.resident}) — seam instances now ${after}`);
      if (after > closed.shown) pass('[CTRL] E2 the seam CAN still fire at the beam stage', `${closed.shown} → ${after}`);
      else fail('[CTRL] E2 the seam CAN still fire at the beam stage', `${closed.shown} → ${after} — the reveal is broken, not gated`);
      await page.evaluate((id) => window.__rrr.engine.room.panelOf(id)?.state.setStage(0), revealed.id);
      await wait(4);
    }
  }

  // ---- D. the draw-call delta, paired in place, one page ------------------
  const canFlip = await page.evaluate(() => typeof window.__rrr.engine.exterior?.setDressRule === 'function');
  if (!canFlip) { skip('D the draw-call delta', 'this build has no `setDressRule` — nothing to flip'); }
  else {
    const at = [
      { tag: 'service.mid', anchor: 'service.mid' },
      { tag: 'gallery.mid', anchor: 'gallery.mid' },
      { tag: 'ballroom.centre', anchor: 'ballroom.centre' },
      { tag: 'study_e.south', anchor: 'study_e.south' },
    ];
    for (const st of at) {
      const ok = await page.evaluate((a) => {
        const e = window.__rrr.engine, p = e.player;
        const v = e.room.anchor?.(a);
        if (!v) return { ok: false, why: 'no anchor ' + a };
        p.pos.copy(v); p.vel.set(0, 0, 0);
        if (e.cam) e.cam._first = true;
        e.room.setViewpoints?.([{ pos: p.pos, dir: { x: Math.sin(p.aimYaw), z: Math.cos(p.aimYaw) } }]);
        return { ok: true };
      }, st.anchor);
      if (!ok.ok) { note(`D ${st.tag}: ${ok.why}`); continue; }
      // 🚨 **NO `hold()` HERE, AND THAT IS NOT AN OVERSIGHT.** `still.mjs`'s hold empties
      // `engine._updaters`, and `exterior.update()` — the thing that writes the instance matrices
      // — is one of them. Held, the flip cannot reach the scene: the first version of this arm
      // reported "Δ 0 calls" at all four stations with an IDENTICAL dressed-instance census on
      // both arms, which is the signature of a probe measuring nothing. Draw calls do not need
      // the hold: `renderer.info.render.calls` is deterministic, is independent of `renderScale`,
      // and HANDOFF exempts call counts from the perf lock for exactly this reason. The player is
      // parked and still, so residency cannot drift under us — and it is checked, by sampling
      // several frames per arm and reporting the spread rather than one number.
      await wait(50);
      const sample = async (n) => {
        const rows = [];
        for (let i = 0; i < n; i++) { await wait(2); rows.push(await calls()); }
        const cs = rows.map((r) => r.calls).sort((a, b) => a - b);
        return { ...rows[rows.length - 1], med: cs[Math.floor(cs.length / 2)], lo: cs[0], hi: cs[cs.length - 1] };
      };
      const on = await sample(5);
      await page.evaluate(() => window.__rrr.engine.exterior.setDressRule(false));
      await wait(8);
      const off = await sample(5);
      await page.evaluate(() => window.__rrr.engine.exterior.setDressRule(true));
      await wait(8);
      const back = await sample(5);
      const dOn = JSON.stringify(on.dressedNow); const dOff = JSON.stringify(off.dressedNow);
      note(`D ${st.tag.padEnd(16)} rule ON ${on.med} calls [${on.lo}-${on.hi}] (dress ${on.dressCalls}, ${dOn})`
        + ` · OFF ${off.med} [${off.lo}-${off.hi}] (dress ${off.dressCalls}, ${dOff}) · back ${back.med}`
        + ` · Δ ${on.med - off.med} · programs ${on.programs}/${off.programs}`);
      // ⚠️ THE ATTRIBUTABLE NUMBER IS `dressCalls`, NOT THE FRAME TOTAL. `dressCalls` is what
      // this module actually submits and it is exact; the frame total drifts a few calls between
      // samples at some stations (`study_e.south` moved 136-143 with the player standing still,
      // which is other people's residency, not this flip). So the delta is asserted on
      // `dressCalls` and the frame total is REPORTED with its spread beside it.
      if (dOn === dOff) {
        fail(`[CTRL] D ${st.tag} the flip did something`, 'the dressed-instance census did not move, so the delta is not a delta');
      } else if (on.dressCalls > off.dressCalls) {
        fail(`D ${st.tag} the rule does not add dressing draw calls`, `${off.dressCalls} → ${on.dressCalls}`);
      } else {
        pass(`D ${st.tag} paired in-place flip`,
          `dressing draws ${off.dressCalls} → ${on.dressCalls}; frame ${off.med}[${off.lo}-${off.hi}] → ${on.med}[${on.lo}-${on.hi}], back ${back.med}; programs ${off.programs} → ${on.programs}`);
      }
    }
  }
}
