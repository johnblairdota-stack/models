/**
 * CRITIC INSTRUMENT (critic-swingface-1) — DOES THE STRIKING FACE LEAD AT CONTACT?
 *
 *   node harness/playtest.mjs --view game.play --port 5196 --seconds 1 \
 *        --script harness/scenarios/_critic-swingface1.mjs --q "seed=s4&mesh=1"
 *
 * THE QUESTION. `SledgeRig._fitProp()` used to set the prop's +X — its STRIKING AXIS, because
 * `buildSledgeProp` puts the two striking faces at x = ±HEAD_LEN/2 — to the direction the head
 * was TRAVELLING, so the hammer always arrived face-on. The generated character does not run
 * that solve: `ownsProp` is false and the prop hangs off the `RightHand` bone at a fixed roll
 * (`GRIP_ROLL_DEFAULT = 0.8` rad). Nothing constrains the face to lead any more. So:
 *
 *      faceDeg = angle( prop local +X , head velocity ),  folded to 0..90 because a hammer has
 *                TWO faces and either one leading is face-on.
 *      0 deg  = face-on, reads as a hammer.   90 deg = edge-on, reads as a stick.
 *
 * WHY THE ROLL CAN BE SWEPT IN ONE SESSION. `?grip=` is applied in `mesh-avatar.mountProp` as
 *      obj.quaternion = qAlign ∘ quatAxisAngle(+Y, grip)
 * and +Y is the haft. Rotations about a common axis compose additively, so from the mounted
 * quaternion q0 (which is qAlign ∘ qY(0.8)) any other roll r is exactly
 *      q(r) = q0 ∘ qY(r - 0.8)
 * — the SAME transform `?grip=r` would produce, with no page reload. Nothing rewrites the prop's
 * transform afterwards (`_fitProp` returns early when `ownsProp` is false), and that is ASSERTED
 * below rather than assumed: the roll is re-read after the swing has run.
 *
 * ⚠️ VELOCITY IS DIFFERENCED IN NODE, NOT IN THE PAGE, and by CENTRAL difference. A backward
 * difference pairs a velocity centred half a frame in the past with an axis read now, which at
 * contact — where the head is turning hardest — is worth several degrees. Positions and axes are
 * recorded raw per frame and the calculus happens once, here, where it can be re-run.
 *
 * ⚠️ THE CONTROL THAT MUST FAIL. A sweep whose output does not move with its input is measuring
 * nothing. `faceDeg` at contact MUST vary sinusoidally with roll, with a span near 90 deg between
 * best and worst. If the spread is small the instrument is reading a stale or overwritten
 * transform and every number below is void — that is checked and reported as a FAIL, not a note.
 *
 * ⚠️ SIMULATION CLOCK, NOT `performance.now()`. `p.attack(e.elapsed)` — see `_mesh1-hammer.mjs`:
 * `sledge.swing(performance.now()/1000)` sets t0 ~100 s in the future and the swing silently
 * never fires.
 *
 * Sampling, staging, the clearance-probed side-on camera and the silhouette all come from
 * `harness/strobe.mjs` rather than being rewritten — that tool exists because six throwaway
 * strobes accumulated before it did.
 */
import { strobe, composeSheets, verify, MOTIONS } from '../strobe.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const GRIP_BAKED = 0.8;          // GRIP_ROLL_DEFAULT in src/characters/mesh-avatar.js
const CONTACT_PHASE = 0.60;      // src/game/sledge.js
const SWING_DUR = 0.70;          // src/game/sledge.js
const DEG = 180 / Math.PI;

/**
 * Per-frame recorder. Installed as the strobe's `anchor` hook (a string evaluated once per
 * pumped frame) so the numbers come off THE SAME FRAMES the sheet is made of, and separately
 * driven by hand during the roll sweep.
 *
 * Records raw state only. No differencing, no angles — that is Node's job.
 */
const RECORD = `() => {
  const e = window.__rrr.engine, p = e.player, s = p.sledge;
  const S = (window.__face = window.__face || { rows: [], tag: 'x' });
  const h = s && s.head;
  if (h) {
    h.updateWorldMatrix(true, false);
    const m = h.matrixWorld.elements;
    const nx = Math.hypot(m[0], m[1], m[2]) || 1;
    const ny = Math.hypot(m[4], m[5], m[6]) || 1;
    const row = {
      t: +e.elapsed.toFixed(5),
      ph: s.phase == null ? null : +s.phase.toFixed(4),
      // world position of the head, and the head's own basis. +X is the striking-face normal
      // (the faces sit at x = +-HEAD_LEN/2); +Y is the haft.
      px: m[12], py: m[13], pz: m[14],
      ax: m[0] / nx, ay: m[1] / nx, az: m[2] / nx,
      hx: m[4] / ny, hy: m[5] / ny, hz: m[6] / ny,
      facing: +p.facing.toFixed(5),
    };
    // The clip's OWN clock, read off the mixer, so "clip phase and rig phase agree" is a
    // measurement rather than an inference from playAttack's retime call.
    const mx = p.avatar && p.avatar.mixer;
    const acts = mx && mx._actions;
    if (acts) {
      for (const a of acts) {
        const c = a.getClip && a.getClip();
        if (!c || c.name !== 'Heavy_Hammer_Swing') continue;
        row.clipT = +a.time.toFixed(5);
        row.clipDur = +c.duration.toFixed(5);
        row.clipPh = c.duration > 0 ? +(a.time / c.duration).toFixed(4) : null;
        row.clipW = +a.getEffectiveWeight().toFixed(3);
        row.clipTs = +a.getEffectiveTimeScale().toFixed(4);
        row.clipRun = !!a.isRunning();
      }
    }
    S.rows.push(row);
  }
  return window.__rrr.engine.player.sledge._fired === true;
}`;

/** Capture the mount baseline and expose a roll setter. Called once, after the prop is mounted. */
const INSTALL_ROLL = `() => {
  const e = window.__rrr.engine, p = e.player;
  const obj = p.sledge && p.sledge.root;
  if (!obj) return { ok: false, why: 'no sledge root' };
  if (!p.avatar) return { ok: false, why: 'player has no mesh avatar — did ?mesh=1 reach the view?' };
  if (!p.avatar.propMounted) return { ok: false, why: 'the prop is not mounted on the hand bone' };
  if (obj.parent && obj.parent.name !== 'RightHand') return { ok: false, why: 'prop parent is ' + (obj.parent && obj.parent.name) };
  const THREE_Q = obj.quaternion.constructor;
  const q0 = obj.quaternion.clone();
  // qAlign = q0 ∘ qY(-baked). Stored, so every roll is generated from the same baseline and a
  // sweep cannot accumulate drift by multiplying deltas onto the live quaternion.
  const inv = new THREE_Q().setFromAxisAngle({ x: 0, y: 1, z: 0, isVector3: true }, -${GRIP_BAKED});
  const qAlign = q0.clone().multiply(inv);
  window.__roll = {
    baked: ${GRIP_BAKED},
    set: (r) => {
      const q = new THREE_Q().setFromAxisAngle({ x: 0, y: 1, z: 0, isVector3: true }, r);
      obj.quaternion.copy(qAlign).multiply(q);
      obj.updateMatrixWorld(true);
      return r;
    },
    // Read the roll BACK out of the live transform: qAlign^-1 ∘ q, decomposed about +Y. This is
    // what proves nothing downstream overwrote it.
    get: () => {
      const d = qAlign.clone().invert().multiply(obj.quaternion);
      // angle about +Y from the quaternion's y component and w
      return +(2 * Math.atan2(d.y, d.w)).toFixed(4);
    },
  };
  return { ok: true, roll: window.__roll.get(), ownsProp: !!p.sledge.ownsProp,
           parent: obj.parent && obj.parent.name, clip: p.avatar.clip };
}`;

const FIRE = MOTIONS.sledge.fire;

// ---------------------------------------------------------------------------- node-side maths

/** Central-difference velocity, then the folded angle between the face normal and travel. */
function analyse(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const a = rows[i - 1], b = rows[i + 1];
    let v = null, dt = 0;
    if (a && b) { dt = b.t - a.t; v = [b.px - a.px, b.py - a.py, b.pz - a.pz]; }
    else if (b) { dt = b.t - r.t; v = [b.px - r.px, b.py - r.py, b.pz - r.pz]; }
    else if (a) { dt = r.t - a.t; v = [r.px - a.px, r.py - a.py, r.pz - a.pz]; }
    const row = { ...r, faceDeg: null, haftDeg: null, spd: null };
    if (v && dt > 1e-9) {
      const L = Math.hypot(v[0], v[1], v[2]);
      row.spd = +(L / dt).toFixed(3);
      if (L > 1e-7) {
        const u = [v[0] / L, v[1] / L, v[2] / L];
        const dx = Math.abs(r.ax * u[0] + r.ay * u[1] + r.az * u[2]);
        const dh = Math.abs(r.hx * u[0] + r.hy * u[1] + r.hz * u[2]);
        row.faceDeg = +(Math.acos(Math.min(1, dx)) * DEG).toFixed(1);
        row.haftDeg = +(Math.acos(Math.min(1, dh)) * DEG).toFixed(1);
      }
    }
    out.push(row);
  }
  return out;
}

/** The row nearest a given rig phase, among rows where the swing is actually running. */
function atPhase(rows, ph) {
  let best = null;
  for (const r of rows) {
    if (r.ph == null || r.ph <= 0) continue;
    const d = Math.abs(r.ph - ph);
    if (!best || d < best.d) best = { d, r };
  }
  return best ? best.r : null;
}

/** Mean faceDeg over the business end of the arc, weighted by head speed (slow frames matter less). */
function arcFace(rows, lo, hi) {
  let ws = 0, s = 0, worst = null, bestv = null;
  for (const r of rows) {
    if (r.ph == null || r.ph < lo || r.ph > hi || r.faceDeg == null) continue;
    const w = Math.max(0, r.spd ?? 0);
    ws += w; s += r.faceDeg * w;
    if (worst == null || r.faceDeg > worst) worst = r.faceDeg;
    if (bestv == null || r.faceDeg < bestv) bestv = r.faceDeg;
  }
  return { mean: ws > 0 ? +(s / ws).toFixed(1) : null, min: bestv, max: worst };
}

export default async function critSwingFace(ctx) {
  const { page, note, pass, fail, skip, snap, SHOTDIR } = ctx;
  const OUT = path.join(SHOTDIR, 'swingface1');
  await mkdir(OUT, { recursive: true });
  const report = { at: new Date().toISOString() };

  // ---- 1. the sheet, at the shipped grip, on the strobe's staged side-on camera -------------
  // This also installs the frame pump, parks the hunter, lifts the exposure and places the
  // clearance-probed profile camera — everything after this reuses that staging.
  const m = await strobe(ctx, {
    ...MOTIONS.sledge,
    name: 'swingface-grip080',
    label: 'sledgehammer swing, generated avatar, grip 0.8',
    mode: 'uniform',
    n: 10,                    // i/n hits phase 0.60 EXACTLY, which is CONTACT_PHASE
    silhouette: true,
    scope: 'subject',         // the classical test: nothing but the character can explain the read
    anchor: RECORD,           // <- the recorder rides the strobe's own per-frame read
    cam: 'profile',
    dist: 3.4,
    out: 'progress/strobe',
  });
  if (!m) { skip('swingface', 'the strobe could not stage or fire the swing — nothing to measure'); return; }
  await composeSheets(m);
  const vrep = await verify(m);
  for (const v of vrep.verdicts) note(`strobe verify ${v.s}: ${v.name} — ${v.detail}`);
  report.sheets = m.sheets;
  report.stage = m.stage;

  // ---- 2. did the avatar actually drive it? ------------------------------------------------
  const raw080 = await page.evaluate(() => {
    const r = (window.__face && window.__face.rows) || [];
    window.__face = { rows: [], tag: 'x' };
    return r;
  });
  const rows080 = analyse(raw080);
  report.grip080 = rows080;
  const anyClip = rows080.some((r) => r.clipRun);
  if (!anyClip) fail('the baked Heavy_Hammer_Swing clip is what drives this swing',
    'the mixer reports no running action for that clip — this is NOT the generated-avatar swing, so every angle below describes something else');
  else pass('the baked Heavy_Hammer_Swing clip is what drives this swing',
    `clip duration ${rows080.find((r) => r.clipDur)?.clipDur}s, retimed x${rows080.find((r) => r.clipTs)?.clipTs}`);

  const roll = await page.evaluate(`(${INSTALL_ROLL})()`);
  note(`roll harness: ${JSON.stringify(roll)}`);
  if (!roll?.ok) { fail('the prop is mounted on the hand bone and its roll is addressable', roll?.why ?? '?'); return; }
  report.mount = roll;

  // ---- 3. clip phase vs rig phase ------------------------------------------------------------
  const drift = rows080
    .filter((r) => r.ph != null && r.ph > 0 && r.clipPh != null && r.clipRun)
    .map((r) => ({ ph: r.ph, clipPh: r.clipPh, d: +(r.clipPh - r.ph).toFixed(4) }));
  report.phaseDrift = drift;
  const atC = drift.length ? drift.reduce((b, x) => (Math.abs(x.ph - CONTACT_PHASE) < Math.abs(b.ph - CONTACT_PHASE) ? x : b)) : null;
  const maxD = drift.length ? Math.max(...drift.map((x) => Math.abs(x.d))) : null;
  report.phaseAtContact = atC;
  if (atC == null) skip('clip phase and rig phase agree at CONTACT_PHASE', 'no frame carried both clocks');
  else if (Math.abs(atC.d) <= 0.02) pass('clip phase and rig phase agree at CONTACT_PHASE',
    `rig ${atC.ph} vs clip ${atC.clipPh} (${(atC.d * SWING_DUR * 1000).toFixed(0)} ms), max drift over the arc ${maxD}`);
  else fail('clip phase and rig phase agree at CONTACT_PHASE',
    `rig ${atC.ph} but clip ${atC.clipPh} — ${(atC.d * SWING_DUR * 1000).toFixed(0)} ms apart. The damage fires at a different instant from the picture.`);

  // ---- 4. THE SWEEP -------------------------------------------------------------------------
  // Every free parameter, not a spot check. 24 rolls over the full turn; the face normal is
  // periodic in pi (two faces), so a full 2pi sweep also double-samples as its own repeat test.
  const step = (k = 1) => page.evaluate((k) => window.__strobe.step(k), k);
  const rolls = [];
  for (let i = 0; i < 24; i++) rolls.push(+((i / 24) * Math.PI * 2).toFixed(4));

  const sweep = [];
  for (const r of rolls) {
    await page.evaluate((r) => window.__roll.set(r), r);
    await page.evaluate(() => { window.__face = { rows: [], tag: 'sweep' }; });
    const f = await page.evaluate(`(${FIRE})()`);
    if (!f?.fired) { note(`roll ${r}: attack denied (${JSON.stringify(f)})`); continue; }
    // 50 frames covers the 0.70 s swing (42 frames) with recovery to spare.
    for (let k = 0; k < 50; k++) { await step(1); await page.evaluate(`(${RECORD})()`); }
    const back = await page.evaluate(() => ({
      rows: window.__face.rows, rollNow: window.__roll.get(),
    }));
    const rws = analyse(back.rows);
    const c = atPhase(rws, CONTACT_PHASE);
    const arc = arcFace(rws, 0.42, 0.80);      // COCK->FOLLOW, sledge.js's own segment bounds
    sweep.push({
      roll: r, rollAfter: back.rollNow,
      contactFace: c?.faceDeg ?? null, contactHaft: c?.haftDeg ?? null, contactSpd: c?.spd ?? null,
      contactPh: c?.ph ?? null, arcMean: arc.mean, arcMin: arc.min, arcMax: arc.max,
    });
    // let the swing end and the cooldown clear before the next one
    await step(20);
  }
  report.sweep = sweep;
  note(`sweep: ${sweep.length}/${rolls.length} rolls measured`);

  // THE ROLL DID NOT STICK? then nothing here is about roll at all.
  const stuck = sweep.filter((s) => {
    const d = Math.abs(((s.rollAfter - s.roll + Math.PI) % (Math.PI * 2)) - Math.PI);
    return d < 0.01;
  }).length;
  if (stuck === sweep.length) pass('the roll set before each swing is still there after it',
    `${stuck}/${sweep.length} — nothing downstream overwrites the mounted prop's transform`);
  else fail('the roll set before each swing is still there after it',
    `only ${stuck}/${sweep.length} rolls survived the swing — something rewrites the prop transform and this sweep is void`);

  // THE CONTROL THAT MUST FAIL. If contactFace does not swing across the roll sweep, the
  // instrument is not reading the thing it names.
  const faces = sweep.map((s) => s.contactFace).filter((x) => x != null);
  const span = faces.length ? Math.max(...faces) - Math.min(...faces) : 0;
  if (span > 60) pass('CONTROL: the measured face angle responds to the roll',
    `contact faceDeg spans ${Math.min(...faces).toFixed(1)}-${Math.max(...faces).toFixed(1)} deg across the sweep (${span.toFixed(1)} deg) — a face normal rolled about the haft must do exactly this`);
  else fail('CONTROL: the measured face angle responds to the roll',
    `contact faceDeg spans only ${span.toFixed(1)} deg across a full turn of roll. The metric is not tracking the prop's transform; DISCARD every number in this run.`);

  const ranked = [...sweep].filter((s) => s.contactFace != null).sort((a, b) => a.contactFace - b.contactFace);
  report.best = ranked.slice(0, 4);
  report.worst = ranked.slice(-3);
  const baked = sweep.find((s) => Math.abs(s.roll - GRIP_BAKED) < 0.14) ?? null;
  report.baked = baked;
  note(`best rolls by contact face angle: ${ranked.slice(0, 4).map((s) => `${s.roll}->${s.contactFace}deg`).join('  ')}`);
  note(`worst: ${ranked.slice(-3).map((s) => `${s.roll}->${s.contactFace}deg`).join('  ')}`);

  // ---- 5. silhouette evidence at contact, several rolls ------------------------------------
  // The sweep says which number; a picture says whether John would agree. Same staged camera,
  // same phase, only the roll differs — so the tiles are a controlled comparison.
  const showRolls = [];
  const push = (v) => { const x = +v.toFixed(3); if (!showRolls.some((y) => Math.abs(y - x) < 0.05)) showRolls.push(x); };
  push(GRIP_BAKED);
  if (ranked[0]) push(ranked[0].roll);
  if (ranked[0]) push(ranked[0].roll + Math.PI / 2);     // the deliberately-wrong control tile
  if (ranked[1]) push(ranked[1].roll);
  const shots = [];
  for (const r of showRolls) {
    await page.evaluate((r) => window.__roll.set(r), r);
    await page.evaluate(() => { window.__face = { rows: [], tag: 'shot' }; });
    const f = await page.evaluate(`(${FIRE})()`);
    if (!f?.fired) { note(`shot roll ${r}: attack denied`); continue; }
    let hit = null;
    for (let k = 0; k < 60; k++) {
      await step(1);
      const s = await page.evaluate(`(${RECORD})()`);
      const ph = await page.evaluate(() => { const e = window.__rrr.engine; return e.player.sledge.phase || null; });
      if (ph != null && ph >= CONTACT_PHASE) { hit = ph; break; }
    }
    if (hit == null) { note(`shot roll ${r}: never reached contact phase`); continue; }
    const tag = `face-r${String(Math.round(r * 100)).padStart(3, '0')}-p${hit.toFixed(2)}`;
    // normal frame
    await page.evaluate(() => window.__strobe.chrome(false));
    const nrm = path.join(OUT, `${tag}.png`);
    await snap(tag, { path: nrm });
    // silhouette of THE SAME frame — nothing steps in between
    await page.evaluate((s) => window.__strobe.sil(true, s), 'subject');
    const sil = path.join(OUT, `sil-${tag}.png`);
    await snap(`sil-${tag}`, { path: sil });
    await page.evaluate((s) => window.__strobe.sil(false, s), 'subject');
    const rws = analyse(await page.evaluate(() => window.__face.rows));
    const c = atPhase(rws, CONTACT_PHASE);
    shots.push({ roll: r, phase: hit, faceDeg: c?.faceDeg ?? null, haftDeg: c?.haftDeg ?? null, normal: nrm, sil });
    note(`contact shot roll=${r} phase=${hit.toFixed(3)} faceDeg=${c?.faceDeg}`);
    await step(40);
  }
  report.shots = shots;

  const jf = path.join(OUT, 'swingface1.json');
  await writeFile(jf, JSON.stringify(report, null, 2));
  note(`report: ${jf}`);
  if (shots.length >= 3) pass('contact silhouettes captured at three or more rolls', shots.map((s) => `${s.roll}=${s.faceDeg}deg`).join('  '));
  else fail('contact silhouettes captured at three or more rolls', `only ${shots.length}`);
}
