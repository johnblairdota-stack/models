/**
 * 🕳️ **IS THE APERTURE EMPTY BECAUSE THE PANEL IS FACING THE OTHER WAY?**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_ap1-sided.mjs \
 *        --port 5452 --q "seed=s4" --shots
 *
 * `_ap1-aperture.mjs` established that the hole is there on the LEGACY arm too, so the
 * instancing path does not own it, and that an instance-aware pick DOES find a wall face at
 * those pixels — geometry is submitted and the raster says so. The remaining candidate is the
 * one a raycast cannot see, because a raycast does not cull: `wall.js` builds all four layer
 * planes `FrontSide` facing local +Z, and a connector's `rotY` encodes the WALL'S AXIS, not a
 * facing — so on the +x / +z walls of the house the panel's front points OUT of the room.
 *
 * Two things are measured, both inside ONE frozen page:
 *   1. `sideOf(room centre)` for every panel in the house — the blast radius, by arithmetic.
 *   2. flip the materials to DoubleSide live and re-shoot. If the hole fills, that is the
 *      mechanism in pixels, with the before and after sharing a page, a frame and a grain.
 */
import { decodePng } from '../pxdiff.mjs';

function meanLuma(img, r) {
  const x0 = Math.max(0, Math.round(r.x0)), x1 = Math.min(img.width, Math.round(r.x1));
  const y0 = Math.max(0, Math.round(r.y0)), y1 = Math.min(img.height, Math.round(r.y1));
  let s = 0, n = 0, dark = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * img.channels;
      const L = 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
      s += L; n++;
      // 🕳️ THE DISCRIMINATING STATISTIC. An unfilled aperture is not "a bit darker" — it is
      // near black, and a mean over a rect that also contains a lit jamb and a robot's shoulder
      // hides that completely. The FRACTION of the rect that is essentially unlit is what a
      // hole has and a wall does not.
      if (L < 20) dark++;
    }
  }
  return { mean: n ? s / n : 0, px: n, darkPct: n ? (dark / n) * 100 : 0 };
}

export default async function ap1sided({ page, note, pass, fail, skip, snap, shot }) {
  const settle = async (frames = 35) => { for (let i = 0; i < frames; i++) await page.waitForTimeout(40); };

  // ------------------------------------------------------------------ 1. the blast radius
  const survey = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.room?.panels) return null;
    const rows = [];
    for (const p of e.room.panels) {
      const a = e.room.spaces.find((s) => s.id === p.spec?.a);
      const b = e.room.spaces.find((s) => s.id === p.spec?.b);
      const sideOfSpace = (s) => (s ? p.sideOf({ x: s.cx, y: 0, z: s.cz }) : null);
      rows.push({
        id: p.id,
        free: !!p.field,
        rotY: +p.rotY.toFixed(3),
        normal: [+p.normal.x.toFixed(2), +p.normal.z.toFixed(2)],
        a: p.spec?.a ?? null, b: p.spec?.b ?? null,
        sideA: sideOfSpace(a), sideB: sideOfSpace(b),
        matSide: p.mats.slice(0, 4).map((m) => (m ? m.side : 'null')).join(','),
      });
    }
    return {
      rows,
      instFaceSide: e.room.panelInstances?.faceMaterial?.side ?? null,
      revealSide: e.room.panels[0]?.revealMaterial?.side ?? null,
    };
  });
  if (!survey) { skip('the room exposes its panels', 'engine.room missing'); return; }

  // A panel is UNVIEWABLE from a room when that room sits on the -normal side of it and the
  // planes are FrontSide: every layer is backface-culled and the aperture renders as nothing.
  const blind = [];
  for (const r of survey.rows) {
    const fs = r.matSide.split(',').every((s) => s === '0');   // 0 === THREE.FrontSide
    const rooms = [];
    if (r.a && r.sideA === -1) rooms.push(r.a);
    if (r.b && r.b !== r.a && r.sideB === -1) rooms.push(r.b);
    if (fs && rooms.length) blind.push({ id: r.id, free: r.free, rooms, normal: r.normal });
  }
  note(`instanced pristine face material side = ${survey.instFaceSide} (0=FrontSide, 2=DoubleSide)`);
  note(`${survey.rows.length} panels · ${blind.length} have at least one room on their BACK side`);
  for (const b of blind) note(`  BLIND FROM ${b.rooms.join('+')} : ${b.id}${b.free ? ' (free face)' : ''} normal ${b.normal}`);
  const blindScalar = blind.filter((b) => !b.free);
  note(`of those, ${blindScalar.length} are SCALAR panels (exit sites and breachables): `
    + blindScalar.map((b) => b.id).join(', '));

  // ------------------------------------------------------------------ 2. park, off-axis
  const target = blindScalar.find((b) => b.id === 'x.ballroom.terrace_e')?.id
    ?? blindScalar[0]?.id;
  if (!target) { skip('a back-facing exit site exists', 'nothing to look at'); return; }

  /**
   * ⚠️ **THE STATION IS `_ap1-aperture.mjs`'S, WHICH IS THE ONE THAT LANDED IN THE RIGHT ROOM.**
   * The first version of this scenario slid 2.6 m along the wall to get the aperture out from
   * behind the third-person robot and ended up in `study_e` with the aperture off screen — the
   * exact failure `_progkey1-independence.mjs` records for its own first build. So: stand
   * head-on where the room is known to contain you, and swing the YAW instead. The boom orbits
   * the player, so a yaw offset moves the background across the frame and leaves the robot in
   * the middle of it — which is precisely what is wanted here.
   */
  const park = (pid, dyaw) => page.evaluate(([id, yawOff]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    const home = e.room.spaces.find((s) => s.id === p.ownerSpace?.id);
    const inSign = home ? p.sideOf({ x: home.cx, y: 0, z: home.cz }) : 1;
    const n = p.normal;
    const d = 4.0 * inSign;
    const c = p.pointAt(0.5, 0.5);
    e.player.pos.set(c.x + n.x * d, e.room.floorY, c.z + n.z * d);
    e.player.vel.set(0, 0, 0);
    e.player.facing = Math.atan2(-n.x * inSign, -n.z * inSign) + yawOff;
    if (e.cam) { e.cam.yaw = e.player.facing; e.cam.pitch = 0; e.cam._first = true; }
    return { space: e.room.spaceAt(e.player.pos)?.id ?? null, inSign, home: home?.id ?? null };
  }, [pid, dyaw]);

  const rects = (pid) => page.evaluate((id) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    const cvs = e.renderer.domElement;
    const sw = cvs.clientWidth, sh = cvs.clientHeight;
    const box = (uv) => {
      let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
      for (const [u, v] of uv) {
        const q = p.pointAt(u, v).project(e.camera);
        const x = (q.x * 0.5 + 0.5) * sw, y = (1 - (q.y * 0.5 + 0.5)) * sh;
        minx = Math.min(minx, x); maxx = Math.max(maxx, x);
        miny = Math.min(miny, y); maxy = Math.max(maxy, y);
      }
      return { x0: minx, x1: maxx, y0: miny, y1: maxy };
    };
    return {
      ap: box([[0.18, 0.22], [0.82, 0.22], [0.18, 0.78], [0.82, 0.78]]),
      wall: box([[1.25, 0.22], [1.85, 0.22], [1.25, 0.78], [1.85, 0.78]]),
      screen: { w: sw, h: sh },
    };
  }, pid);

  // Sweep a few yaw offsets and keep the one that puts the whole aperture on screen with the
  // fewest of its pixels behind the robot. A probe that cannot observe must not report.
  let st = null, r = null, best = -1;
  for (const dy of [0.42, -0.42, 0.60, -0.60, 0]) {
    const s = await park(target, dy);
    if (s?.space !== s?.home) { note(`yaw ${dy}: parked in ${s?.space}, wanted ${s?.home} — rejected`); continue; }
    await settle(12);
    const rr = await rects(target);
    const on = rr.ap.x0 > 4 && rr.ap.x1 < rr.screen.w - 4 && rr.ap.y0 > 4 && rr.ap.y1 < rr.screen.h - 4;
    const clear = Math.min(Math.abs(rr.ap.x0 - rr.screen.w / 2), Math.abs(rr.ap.x1 - rr.screen.w / 2));
    note(`yaw ${dy}: space ${s.space} · aperture ${Math.round(rr.ap.x0)}..${Math.round(rr.ap.x1)} · onScreen ${on} · clearance ${Math.round(clear)}`);
    if (on && clear > best) { best = clear; st = s; r = rr; st.dyaw = dy; }
  }
  if (!st || !r) { skip('a station that can see the aperture', 'no yaw offset framed it inside its own room'); return; }
  await park(target, st.dyaw);
  note(`parked for ${target} in space ${st.space} (inSign ${st.inSign}, yaw offset ${st.dyaw})`);
  await settle(35);
  r = await rects(target);
  note(`aperture rect ${Math.round(r.ap.x0)},${Math.round(r.ap.y0)}..${Math.round(r.ap.x1)},${Math.round(r.ap.y1)} `
    + `· wall rect ${Math.round(r.wall.x0)},${Math.round(r.wall.y0)}..${Math.round(r.wall.x1)},${Math.round(r.wall.y1)}`);

  const read = async (tag) => {
    await settle(20);
    const b1 = await snap(`${tag}-1`);
    await settle(6);
    const b2 = await snap(`${tag}-2`);
    await shot(tag);
    if (!b1 || !b2) return null;
    try {
      const i1 = decodePng(b1), i2 = decodePng(b2);
      const sx = i1.width / r.screen.w, sy = i1.height / r.screen.h;
      const sc = (q) => ({ x0: q.x0 * sx, x1: q.x1 * sx, y0: q.y0 * sy, y1: q.y1 * sy });
      return {
        ap: meanLuma(i1, sc(r.ap)), wall: meanLuma(i1, sc(r.wall)),
        apFloor: meanLuma(i2, sc(r.ap)), wallFloor: meanLuma(i2, sc(r.wall)),
      };
    } catch (err) { note(`decode failed: ${String(err).slice(0, 80)}`); return null; }
  };

  const say = (tag, m) => note(`${tag}  aperture luma ${m.ap.mean.toFixed(1)} dark ${m.ap.darkPct.toFixed(1)}% `
    + `(same-config repeat ${m.apFloor.mean.toFixed(1)} / ${m.apFloor.darkPct.toFixed(1)}%) · `
    + `wall luma ${m.wall.mean.toFixed(1)} dark ${m.wall.darkPct.toFixed(1)}% `
    + `(repeat ${m.wallFloor.mean.toFixed(1)} / ${m.wallFloor.darkPct.toFixed(1)}%)`);

  const before = await read('ap1-sided-before-frontside');
  if (before) say('BEFORE', before);

  // ------------------------------------------------------------------ 3. flip to DoubleSide
  const flipped = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const DOUBLE = 2;
    let n = 0;
    for (const p of e.room.panels) {
      if (p.field) continue;                       // scalar arm only — leave the dig faces alone
      for (const m of p.mats.slice(0, 4)) { if (!m) continue; m.side = DOUBLE; m.needsUpdate = true; n++; }
    }
    const fm = e.room.panelInstances?.faceMaterial;
    if (fm) { fm.side = DOUBLE; fm.needsUpdate = true; n++; }
    return n;
  });
  note(`flipped ${flipped} scalar-arm materials to DoubleSide`);
  const after = await read('ap1-sided-after-doubleside');
  if (after) say('AFTER ', after);

  if (before && after) {
    const floor = Math.abs(before.ap.darkPct - before.apFloor.darkPct);
    const drop = before.ap.darkPct - after.ap.darkPct;
    const ctrl = Math.abs(before.wall.darkPct - after.wall.darkPct);
    note(`aperture dark fraction ${before.ap.darkPct.toFixed(1)}% -> ${after.ap.darkPct.toFixed(1)}% `
      + `(same-config floor ${floor.toFixed(2)}pp; the WALL control moved ${ctrl.toFixed(2)}pp)`);
    if (drop > Math.max(10, floor * 4 + 2)) {
      pass('🕳️ DoubleSide FILLS the aperture',
        `unlit fraction ${before.ap.darkPct.toFixed(1)}% -> ${after.ap.darkPct.toFixed(1)}% against a `
        + `${floor.toFixed(2)}pp same-config floor; the wall control moved ${ctrl.toFixed(2)}pp`);
    } else {
      fail('🕳️ DoubleSide FILLS the aperture',
        `unlit fraction ${before.ap.darkPct.toFixed(1)}% -> ${after.ap.darkPct.toFixed(1)}% — `
        + 'backface culling is NOT the mechanism');
    }
  } else skip('the DoubleSide A/B', 'a capture did not come back');
}
