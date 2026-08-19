/**
 * 🚪 **THE PICTURE OF THE CHAIN X — `dressfix-1`, 2026-08-15.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_dressfix1-look.mjs \
 *        --port 5511 --q "plan=gen&planseed=3&seed=s4"
 *
 *   env  FACE=f.g24.0.a   force the face; default is chosen (see below)
 *        STANDOFF=9       metres back from the face
 *
 * ⚠️ `--q`, NEVER `--extra`.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 WHY THIS EXISTS SEPARATELY FROM `_dressfix1-dress.mjs`, AND IT IS A CORRECTION
 * ---------------------------------------------------------------------------------------------
 * `_dressfix1-dress.mjs` measures the chain's WORLD EXTENT and gets 26.152 m → 2.000 m. Its
 * screenshots showed **almost nothing**: A-vs-B came back **420 px>16** on a 1280x720 frame, and
 * both frames looked like the same boarded door. **A 26 m chain that does not move 420 pixels is
 * a claim about geometry, not about the screen** — exactly the class HANDOFF calls *"it exists,
 * something is in front of it"*, and `--pick` cannot see an `InstancedMesh` to tell you otherwise.
 *
 * So this file asks the only question that settles it: **hide the mesh and see what disappears**
 * (`_ap1-who.mjs`'s technique). Every number below is a diff against the same held frame with
 * `exterior.dress.chain.segment.visible = false`, so "the chain owns N pixels" is a measurement
 * of the draw set and not of a bounding box.
 *
 * It also picks a face DELIBERATELY AWAY FROM A CONNECTOR. On the ballroom's 27.20 m wall the
 * free face's centre and a generated door's centre are the same point, so the fixed 2.08 m chain
 * lands exactly on a door that is already chained and boarded — the two arms then differ by
 * almost nothing at that station, which is true and useless.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ THE ARMS ARE FLIPPED WHILE THE PAGE IS HELD, AND THAT IS LEGAL HERE — SEE THE RULE IT LOOKS
 * LIKE IT BREAKS
 * ---------------------------------------------------------------------------------------------
 * `still.mjs`'s `hold()` empties `engine._updaters`, so any A/B whose effect has to travel through
 * an updater measures nothing (one agent reported Δ0 at four stations that way). `setDressFixed()`
 * does not go through `exterior.update()`: it recomputes `dressM` and writes
 * `setMatrixAt` + `needsUpdate` for every instance that is CURRENTLY SHOWN, itself. `shown` cannot
 * change while held, so the write is exact. **F0 is the control for precisely this**: the same
 * frame taken twice with no flip must be inside the floor, and the flip must be outside it.
 */

import { decodePng } from '../pxdiff.mjs';
import { hold, release } from '../still.mjs';

const STANDOFF = +(process.env.STANDOFF ?? 9);
const FORCE = process.env.FACE ?? '';

/**
 * 🚨 **THRESHOLD 16 IS BLIND IN THIS HOUSE AND THAT IS A FINDING, NOT A SETTING.** The first run
 * of this file used the project's usual `px>16` and reported the 26 m chain as **8 pixels** — while
 * the screenshot shows it plainly. A generated room carries **no light rig** (`genplan.js`; John's
 * own note, *"sometimes the lighting in the other room is off and everything kind of looks dark
 * grey"*), so the whole frame lives at mean luma ~5 of 255 and a 16-level threshold is above
 * everything in it. Counts are therefore reported at **four** thresholds and the gate runs at the
 * lowest one whose same-config FLOOR is still zero.
 */
const TH = [2, 4, 8, 16];
function pxdiff(a, b) {
  const ch = a.channels;
  const n = [0, 0, 0, 0];
  let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * ch;
      let m = 0;
      for (let k = 0; k < 3; k++) { const d = Math.abs(a.data[i + k] - b.data[i + k]); if (d > m) m = d; }
      for (let t = 0; t < TH.length; t++) if (m > TH[t]) n[t]++;
      if (m > TH[0]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
  }
  return { n, box: n[0] ? `${x0},${y0}..${x1},${y1}` : '-' };
}

/** Mean luma of a frame, 0..255 — the reason the thresholds above are what they are. */
function luma(img) {
  const ch = img.channels;
  let s = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    s += 0.2126 * img.data[i * ch] + 0.7152 * img.data[i * ch + 1] + 0.0722 * img.data[i * ch + 2];
  }
  return s / (img.width * img.height);
}

export default async function dressfix1look({ page, note, pass, fail, skip, snap, SHOTDIR, VIEW }) {
  const png = (tag) => snap(tag, { path: `${SHOTDIR}/${VIEW}.${tag}.png` });
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 600; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  const has = await page.evaluate(() => typeof window.__rrr?.engine?.exterior?.setDressFixed === 'function');
  if (!has) { fail('the build carries the fix', 'exterior.setDressFixed is missing'); return; }

  // ---- pick a chained free face that is NOT sitting on top of a connector -------------------
  const pick = await page.evaluate((force) => {
    const e = window.__rrr.engine;
    const cen = e.exterior.census();
    const byId = new Map(cen.plan.map((r) => [r.id, r]));
    const conns = e.room.panels.filter((p) => !(p.spec && p.spec.dig));
    const rows = [];
    for (const p of e.room.panels) {
      if (!(p.spec && p.spec.free) || !(byId.get(p.id) || {}).chain || !p.ownerSpace) continue;
      const c = p.pointAt(0.5, 0.5);
      let near = 1e9;
      for (const q of conns) {
        const d = Math.hypot(q.root.position.x - c.x, q.root.position.z - c.z);
        if (d < near) near = d;
      }
      rows.push({ id: p.id, w: +p.width.toFixed(2), room: p.ownerSpace.id, near: +near.toFixed(2) });
    }
    rows.sort((a, b) => (b.near > 3 ? b.w : 0) - (a.near > 3 ? a.w : 0) || b.near - a.near);
    const chosen = force ? rows.find((r) => r.id === force) : rows.find((r) => r.near > 3) || rows[0];
    return { chosen, n: rows.length, top: rows.slice(0, 5) };
  }, FORCE);
  if (!pick.chosen) { fail('a chained free dig face exists', `${pick.n} candidates`); return; }
  note(`candidates: ${pick.top.map((r) => `${r.id} ${r.w}m nearest-door ${r.near}m`).join(' · ')}`);
  const FACE = pick.chosen.id;
  note(`chosen ${FACE} — a ${pick.chosen.w} m wall in ${pick.chosen.room}, nearest connector `
    + `${pick.chosen.near} m away`);

  const parked = await page.evaluate(([id, back]) => {
    const e = window.__rrr.engine;
    const p = e.room.panels.find((q) => q.id === id);
    const home = p.ownerSpace;
    const inSign = p.sideOf({ x: home.cx, y: 0, z: home.cz });
    const n = p.normal, c = p.pointAt(0.5, 0.5);
    e.player.pos.set(c.x + n.x * back * inSign, e.room.floorY, c.z + n.z * back * inSign);
    e.player.vel.set(0, 0, 0);
    const f = Math.atan2(-n.x * inSign, -n.z * inSign);
    e.player.facing = f; e.player.aimYaw = f;
    if (e.cam) { e.cam.yaw = f; e.cam.pitch = 0; e.cam._first = true; }
    e.room.setViewpoints?.([{ pos: e.player.pos, dir: { x: Math.sin(f), z: Math.cos(f) } }]);
    window.__df1 = { p };
    return { space: e.room.spaceAt(e.player.pos)?.id ?? null, w: +p.width.toFixed(2) };
  }, [FACE, STANDOFF]);
  const quiet = () => page.evaluate(() => {
    const e = window.__rrr.engine, h = e.hunter;
    if (!h?.root) return false;
    let x = 0, z = 0;
    for (const s of e.room.spaces) { if (s.x1 > x) x = s.x1; if (s.z1 > z) z = s.z1; }
    h.root.position.set(x + 40, 0, z + 40); h.root.visible = false;
    return true;
  });
  await quiet();
  note(`parked in ${parked.space}, ${STANDOFF} m off the face`);
  await step(400);            // settle with the sim RUNNING before the hold
  await quiet(); await step(4);

  const arm = (on) => page.evaluate((v) => window.__rrr.engine.exterior.setDressFixed(v), on);
  const chainVis = (v) => page.evaluate((show) => {
    let n = 0;
    window.__rrr.engine.scene.traverse((o) => {
      if (o.isInstancedMesh && /^exterior\.dress\.chain\.segment/.test(o.name || '')) { o.visible = show; n++; }
    });
    return n;
  }, v);
  const state = () => page.evaluate(() => {
    const cen = window.__rrr.engine.exterior.census();
    return { fixed: cen.dressFixed, dressCalls: cen.dressCalls, shownChain: cen.dressedNow.chain };
  });

  // ---------------------------------------------------------------- ONE held page, four frames
  await arm(false); await step(6);
  await quiet(); await step(3);
  await hold(page); await step(4);

  const stA = await state();
  const A = decodePng(await png(`dressfix1-look-${FACE}-A-SCALED-the-defect`));
  const A2 = decodePng(await png(`dressfix1-look-${FACE}-A2-floor`));
  const nHidden = await chainVis(false);
  const Ah = decodePng(await png(`dressfix1-look-${FACE}-A-chain-hidden`));
  await chainVis(true);

  await arm(true);
  const stB = await state();
  const B = decodePng(await png(`dressfix1-look-${FACE}-B-FIXED-door-size`));
  await chainVis(false);
  const Bh = decodePng(await png(`dressfix1-look-${FACE}-B-chain-hidden`));
  await chainVis(true);

  await release(page); await step(4);

  const floor = pxdiff(A, A2);
  const dAB = pxdiff(A, B);
  const ownA = pxdiff(A, Ah);
  const ownB = pxdiff(B, Bh);
  const total = A.width * A.height;
  const pc = (n) => `${((n / total) * 100).toFixed(3)}%`;
  const row = (d) => TH.map((t, i) => `px>${t}: ${d.n[i]}`).join('  ');
  /** the lowest threshold at which the same-config floor is still zero */
  let ti = floor.n.findIndex((v) => v === 0);
  if (ti < 0) ti = TH.length - 1;
  note('');
  note(`state A (scaled) ${JSON.stringify(stA)} · state B (fixed) ${JSON.stringify(stB)}`
    + ` · ${nHidden} chain.segment mesh(es) toggled`);
  note(`⚠️ MEAN FRAME LUMA ${luma(A).toFixed(2)} of 255 — a generated room carries no light rig,`
    + ` which is John's own separate note and is why the gate runs at px>${TH[ti]}, not px>16`);
  note(`F0 FLOOR      same frame twice, no flip:                     ${row(floor)}`);
  note(`F1 THE CHAIN  SCALED arm minus the chain mesh HIDDEN:        ${row(ownA)}  box ${ownA.box}`);
  note(`F2 THE CHAIN  FIXED  arm minus the chain mesh HIDDEN:        ${row(ownB)}  box ${ownB.box}`);
  note(`F3 THE FIX    SCALED minus FIXED:                            ${row(dAB)}  box ${dAB.box}`);
  note(`   (F1 is ${pc(ownA.n[ti])} of the frame, F2 ${pc(ownB.n[ti])}, at px>${TH[ti]})`);

  const F = floor.n[ti], A1 = ownA.n[ti], B1 = ownB.n[ti], AB = dAB.n[ti];
  (F < 500)
    ? pass('F0 CONTROL — the same-config floor is small',
      `${F} px>${TH[ti]} on a held page, nothing flipped`)
    : fail('F0 CONTROL — the same-config floor is small',
      `${F} px>${TH[ti]} with nothing flipped — every number below is inside the noise`);

  (A1 > Math.max(1000, F * 4))
    ? pass('F1 CONTROL — the stretched chain REACHES THE SCREEN',
      `hiding one InstancedMesh removes ${A1} px>${TH[ti]} (${pc(A1)} of the frame) against a `
      + `floor of ${F} — so the 26 m extent is DRAWN, not merely present`)
    : fail('F1 CONTROL — the stretched chain REACHES THE SCREEN',
      `hiding it removes only ${A1} px>${TH[ti]} against a floor of ${F} — something is in `
      + 'front of it, or it is not in the draw set, and the extent measurement stands alone');

  (B1 > F && B1 < A1)
    ? pass('F2 — the door-sized chain is still drawn, and owns less of the frame',
      `${B1} px>${TH[ti]} against the stretched arm's ${A1} — a factor of `
      + `${(A1 / Math.max(1, B1)).toFixed(1)}`)
    : fail('F2 — the door-sized chain is still drawn, and owns less of the frame',
      `fixed ${B1} px>${TH[ti]}, scaled ${A1}, floor ${F}`);

  (AB > Math.max(200, F * 4))
    ? pass('F3 — the fix changes the picture', `${AB} px>${TH[ti]} (${pc(AB)}) against a floor of ${F}`)
    : fail('F3 — the fix changes the picture', `${AB} px>${TH[ti]} against a floor of ${F}`);
  void skip;
}
