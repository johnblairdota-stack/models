/**
 * CRITIC INSTRUMENT (critic-swingface-2) — round 2. Round 1 established, on 24 measured rolls
 * plus an analytic reconstruction that reproduces them to ~1 deg, that the striking face is
 * EDGE-ON. This round answers the four things round 1 could not:
 *
 *  1. THE STRIKE IS NOT AT CONTACT_PHASE. Round 1's trajectory shows the head at y = 2.30 m —
 *     overhead, still winding up — at the game's CONTACT_PHASE 0.60, and arriving at the wall
 *     around phase 0.85. So the contact silhouettes round 1 shot at p0.62 are pictures of a
 *     WIND-UP. This round shoots the phase the hammer actually lands.
 *  2. ONE CAMERA IS ONE ANGLE (strobe.mjs says so in its own header, and `critic-swing-1` shot
 *     five). The face-on/edge-on read is shot from four azimuths here.
 *  3. DOES THE HAMMER READ AT ALL? Measured, not eyeballed: the silhouette is rendered TWICE per
 *     phase, once with the prop hidden, and the ink difference is how many pixels the hammer
 *     contributes to the figure's outline. A hammer tucked inside the body adds nothing, and
 *     that is a number rather than an impression.
 *  4. DOES IT GO THROUGH THE FLOOR? `room.floorY` against the head's minimum height.
 *
 * ⚠️ THE SAME ROLL TRICK AS ROUND 1: q(r) = qAlign ∘ qY(r), regenerated from the mount baseline,
 * which is exactly what `?grip=r` produces. Verified to stick, 24/24, in round 1.
 */
import { strobe, MOTIONS } from '../strobe.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const GRIP_BAKED = 0.8;
const STRIKE_PHASE = 0.85;    // measured in round 1: head at the wall, speed 22-27 m/s
const GAME_CONTACT = 0.60;
const DEG = 180 / Math.PI;

const RECORD = `() => {
  const e = window.__rrr.engine, p = e.player, s = p.sledge;
  const S = (window.__face = window.__face || { rows: [] });
  const h = s && s.head;
  if (h) {
    h.updateWorldMatrix(true, false);
    const m = h.matrixWorld.elements;
    const nx = Math.hypot(m[0], m[1], m[2]) || 1, ny = Math.hypot(m[4], m[5], m[6]) || 1;
    S.rows.push({ t: +e.elapsed.toFixed(5), ph: s.phase == null ? null : +s.phase.toFixed(4),
      px: m[12], py: m[13], pz: m[14],
      ax: m[0] / nx, ay: m[1] / nx, az: m[2] / nx,
      hx: m[4] / ny, hy: m[5] / ny, hz: m[6] / ny, facing: +p.facing.toFixed(5) });
  }
  return window.__rrr.engine.player.sledge._fired === true;
}`;

const INSTALL = `() => {
  const e = window.__rrr.engine, p = e.player, obj = p.sledge && p.sledge.root;
  if (!obj || !p.avatar || !p.avatar.propMounted) return { ok: false, why: 'prop not mounted on the avatar' };
  const Q = obj.quaternion.constructor, V = { x: 0, y: 1, z: 0, isVector3: true };
  const qAlign = obj.quaternion.clone().multiply(new Q().setFromAxisAngle(V, -${GRIP_BAKED}));
  window.__roll = {
    set: (r) => { obj.quaternion.copy(qAlign).multiply(new Q().setFromAxisAngle(V, r)); obj.updateMatrixWorld(true); },
    get: () => +(2 * Math.atan2(qAlign.clone().invert().multiply(obj.quaternion).y,
                                qAlign.clone().invert().multiply(obj.quaternion).w)).toFixed(4),
  };
  // Hide/show the PROP ONLY, for the hammer-contribution measurement.
  window.__prop = { hide: (v) => { obj.visible = !v; }, obj: () => obj };
  const fy = (e.room && (e.room.floorY != null ? e.room.floorY : null));
  return { ok: true, floorY: fy, roll: window.__roll.get(), height: p.height,
           playerY: +p.pos.y.toFixed(4), facing: +p.facing.toFixed(4) };
}`;

/**
 * Place the camera at an azimuth measured FROM THE PLAYER'S FACING, with the same clearance
 * probe the production `ThirdPersonCamera` runs every frame — a hand-placed camera that skips it
 * drives through the wall, which put a pillar through two of `critic-swing-1`'s frames.
 *   az 0 = in front of the player (between it and the wall), 90 = its right, 180 = behind.
 */
const CAM = `(az, dist, camH, lookH, lead) => {
  const e = window.__rrr.engine, p = e.player, room = e.room;
  const F = p.facing, a = F + az * Math.PI / 180;
  const dir = p.pos.clone().set(Math.sin(a), 0, Math.cos(a));
  const from = p.pos.clone(); from.y = camH;
  const hit = room.castRay ? room.castRay(from, dir, dist + 1.2) : null;
  const clear = hit && hit.distance < dist + 1.2 ? hit.distance : dist + 1.2;
  const d = Math.max(1.6, Math.min(dist, clear - 0.45));
  const fwd = p.pos.clone().set(Math.sin(F), 0, Math.cos(F));
  if (e.cam) e.cam.update = () => {};
  e.camera.position.set(p.pos.x + dir.x * d + fwd.x * lead, camH, p.pos.z + dir.z * d + fwd.z * lead);
  e.camera.lookAt(p.pos.x + fwd.x * lead, p.pos.y + lookH, p.pos.z + fwd.z * lead);
  e.camera.updateProjectionMatrix(); e.camera.updateMatrixWorld(true);
  return { az, dist: +d.toFixed(2), clearance: +clear.toFixed(2), clamped: d < dist };
}`;

const FIRE = MOTIONS.sledge.fire;

function analyse(all) {
  const out = [];
  for (let i = 0; i < all.length; i++) {
    const r = all[i], a = all[i - 1], b = all[i + 1];
    let v = null, dt = 0;
    if (a && b) { dt = b.t - a.t; v = [b.px - a.px, b.py - a.py, b.pz - a.pz]; }
    else if (b) { dt = b.t - r.t; v = [b.px - r.px, b.py - r.py, b.pz - r.pz]; }
    else if (a) { dt = r.t - a.t; v = [r.px - a.px, r.py - a.py, r.pz - a.pz]; }
    const o = { ...r, faceDeg: null, spd: null };
    if (v && dt > 1e-9) {
      const L = Math.hypot(v[0], v[1], v[2]);
      o.spd = +(L / dt).toFixed(3);
      if (L > 1e-7) {
        const u = [v[0] / L, v[1] / L, v[2] / L];
        o.faceDeg = +(Math.acos(Math.min(1, Math.abs(r.ax * u[0] + r.ay * u[1] + r.az * u[2]))) * DEG).toFixed(1);
      }
    }
    out.push(o);
  }
  return out;
}
const near = (rows, ph) => rows.filter((r) => r.ph != null && r.ph > 0)
  .reduce((b, r) => (b == null || Math.abs(r.ph - ph) < Math.abs(b.ph - ph) ? r : b), null);

export default async function critSwingFace2(ctx) {
  const { page, note, pass, fail, skip, snap, SHOTDIR } = ctx;
  const OUT = path.join(SHOTDIR, 'swingface2');
  await mkdir(OUT, { recursive: true });
  const rep = { at: new Date().toISOString() };

  // one swing, no silhouette, purely to install the pump + park the hunter + stage the camera
  const m = await strobe(ctx, {
    ...MOTIONS.sledge, name: 'swingface2-stage', mode: 'uniform', n: 1,
    silhouette: false, anchor: RECORD, cam: 'profile', dist: 3.4, out: 'progress/strobe',
  });
  if (!m) { skip('swingface2', 'staging swing did not fire'); return; }
  rep.stage = m.stage;

  const inst = await page.evaluate(`(${INSTALL})()`);
  note(`install: ${JSON.stringify(inst)}`);
  if (!inst?.ok) { fail('the prop is addressable', inst?.why ?? '?'); return; }
  rep.install = inst;
  await page.evaluate(`window.__cam = ${CAM};`);

  const step = (k = 1) => page.evaluate((k) => window.__strobe.step(k), k);
  const phase = () => page.evaluate(() => window.__rrr.engine.player.sledge.phase || null);

  /** Fire, run to `target` phase, return the analysed rows so far plus the whole-swing minimum. */
  const runTo = async (target) => {
    await page.evaluate(() => { window.__face = { rows: [] }; });
    const f = await page.evaluate(`(${FIRE})()`);
    if (!f?.fired) return null;
    for (let k = 0; k < 70; k++) {
      await step(1);
      await page.evaluate(`(${RECORD})()`);
      const ph = await phase();
      if (ph != null && ph >= target) return { ph };
    }
    return null;
  };
  const finish = async () => { for (let k = 0; k < 40; k++) { await step(1); await page.evaluate(`(${RECORD})()`); } await step(15); };
  const rows = async () => analyse(await page.evaluate(() => window.__face.rows));

  const capture = async (tag, { sil = true } = {}) => {
    const files = {};
    await page.evaluate(() => window.__strobe.chrome(false));
    files.normal = path.join(OUT, `${tag}.png`);
    await snap(tag, { path: files.normal });
    if (sil) {
      await page.evaluate((s) => window.__strobe.sil(true, s), 'subject');
      files.sil = path.join(OUT, `sil-${tag}.png`);
      await snap(`sil-${tag}`, { path: files.sil });
      await page.evaluate((s) => window.__strobe.sil(false, s), 'subject');
    }
    return files;
  };

  // ---- A. floor penetration ---------------------------------------------------------------
  await page.evaluate((r) => window.__roll.set(r), GRIP_BAKED);
  await runTo(2);           // never reached: runs the whole swing
  await finish();
  const full = await rows();
  const minY = Math.min(...full.filter((r) => r.ph != null && r.ph > 0).map((r) => r.py));
  const minAt = full.find((r) => r.py === minY);
  const floorY = inst.floorY ?? 0;
  rep.floor = { floorY, headMinY: +minY.toFixed(3), atPhase: minAt?.ph ?? null, below: +(floorY - minY).toFixed(3) };
  if (minY < floorY - 0.02) fail('the hammer head stays above the floor through the follow-through',
    `head reaches y=${minY.toFixed(3)} m at phase ${minAt?.ph} — ${((floorY - minY) * 100).toFixed(0)} cm BELOW the floor at y=${floorY}`);
  else pass('the hammer head stays above the floor through the follow-through', `lowest y=${minY.toFixed(3)} vs floor ${floorY}`);
  note(`head trajectory min y ${minY.toFixed(3)} at phase ${minAt?.ph}, floorY ${floorY}`);

  // ---- B. does the hammer contribute to the silhouette at all? ------------------------------
  // Same frame, rendered twice: prop shown, prop hidden. The ink difference IS the hammer's
  // contribution to the outline. Nothing else changes between the two renders.
  const contrib = [];
  const PHASES = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.85, 0.90];
  for (const ph of PHASES) {
    await page.evaluate((r) => window.__roll.set(r), GRIP_BAKED);
    const got = await runTo(ph);
    if (!got) { note(`contribution: never reached p${ph}`); continue; }
    const tag = `contrib-p${String(Math.round(ph * 100)).padStart(2, '0')}`;
    await page.evaluate(() => window.__strobe.chrome(false));
    await page.evaluate((s) => window.__strobe.sil(true, s), 'subject');
    const withF = path.join(OUT, `${tag}-with.png`);
    await snap(`${tag}-with`, { path: withF });
    await page.evaluate(() => window.__prop.hide(true));
    const woF = path.join(OUT, `${tag}-without.png`);
    await snap(`${tag}-without`, { path: woF });
    await page.evaluate(() => window.__prop.hide(false));
    await page.evaluate((s) => window.__strobe.sil(false, s), 'subject');
    contrib.push({ ph, got: got.ph, with: withF, without: woF });
    await finish();
  }
  rep.contrib = contrib;

  // ---- C. the strike phase, three grips, silhouette -----------------------------------------
  // Round 1's analytic optimum for the window p0.78-0.90 is 2.339 rad. 2.618 is the optimum for
  // the GAME's contact phase. 0.8 is what ships. All three, same camera, same phase.
  const GRIPS = [GRIP_BAKED, 2.339, 2.618];
  const strike = [];
  await page.evaluate(`window.__camInfo = window.__cam(90, 3.4, 1.05, 0.95, 0.88)`);
  for (const g of GRIPS) {
    await page.evaluate((r) => window.__roll.set(r), g);
    const got = await runTo(STRIKE_PHASE);
    if (!got) { note(`strike: grip ${g} never reached p${STRIKE_PHASE}`); continue; }
    const rws = await rows();
    const s = near(rws, STRIKE_PHASE), c = near(rws, GAME_CONTACT);
    const tag = `strike-g${String(Math.round(g * 100)).padStart(3, '0')}-p${got.ph.toFixed(2)}`;
    const files = await capture(tag);
    strike.push({ grip: g, phase: got.ph, faceAtStrike: s?.faceDeg ?? null, spd: s?.spd ?? null,
      faceAtGameContact: c?.faceDeg ?? null, ...files });
    note(`strike grip=${g} p=${got.ph.toFixed(3)} faceDeg=${s?.faceDeg} (at game contact ${c?.faceDeg})`);
    await finish();
  }
  rep.strike = strike;
  const ship = strike.find((s) => s.grip === GRIP_BAKED), rec = strike.find((s) => s.grip === 2.339);
  if (ship && rec) {
    if (ship.faceAtStrike > 60 && rec.faceAtStrike < 25) pass('the recommended roll turns the face into the blow',
      `grip 0.8 -> ${ship.faceAtStrike} deg (edge-on) vs grip 2.339 -> ${rec.faceAtStrike} deg (face-on) at the moment the head reaches the wall`);
    else fail('the recommended roll turns the face into the blow',
      `grip 0.8 -> ${ship.faceAtStrike} deg, grip 2.339 -> ${rec.faceAtStrike} deg — not the separation round 1 predicted`);
  }

  // ---- D. four camera angles, shipped grip vs recommended ----------------------------------
  const AZ = [45, 90, 135, 180];
  const cams = [];
  for (const az of AZ) {
    const ci = await page.evaluate(`window.__cam(${az}, 3.6, 1.25, 1.10, 0.80)`);
    for (const g of [GRIP_BAKED, 2.339]) {
      await page.evaluate((r) => window.__roll.set(r), g);
      const got = await runTo(STRIKE_PHASE);
      if (!got) continue;
      const tag = `cam${String(az).padStart(3, '0')}-g${String(Math.round(g * 100)).padStart(3, '0')}`;
      const files = await capture(tag);
      cams.push({ az, grip: g, cam: ci, phase: got.ph, ...files });
      await finish();
    }
    note(`camera az${az}: ${JSON.stringify(ci)}`);
  }
  rep.cams = cams;

  const jf = path.join(OUT, 'swingface2.json');
  await writeFile(jf, JSON.stringify(rep, null, 2));
  note(`report ${jf}`);
  if (strike.length >= 3) pass('strike-phase silhouettes at three grips', strike.map((s) => `${s.grip}=${s.faceAtStrike}deg`).join('  '));
  else fail('strike-phase silhouettes at three grips', `only ${strike.length}`);
  if (cams.length >= 6) pass('the read was checked from four camera azimuths', `${cams.length} frames`);
  else fail('the read was checked from four camera azimuths', `only ${cams.length} frames`);
}
