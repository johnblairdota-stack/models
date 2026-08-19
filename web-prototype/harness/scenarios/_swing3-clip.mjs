/**
 * CRITIC INSTRUMENT (swing-3) — SOLVE `grip` AND `contact` FOR ONE CLIP.
 *
 *   RRR_CLIP=Attack node harness/playtest.mjs --view game.play --port 5197 --seconds 1 \
 *     --script harness/scenarios/_swing3-clip.mjs --q "seed=s4&mesh=1&swingpick=0"
 *
 * Descends from `_critic-swingface1/2.mjs` and reuses their roll mechanism verbatim:
 *   q(r) = qAlign ∘ qY(r), regenerated from the mount baseline, bit-identical to `?grip=r`.
 *
 * ===========================================================================================
 * TWO THINGS ROUND 1 OF THIS INSTRUMENT GOT WRONG. Both were caught by its own controls, and
 * both are fixed here rather than worked around.
 * ===========================================================================================
 *
 * 1. THE ROLL WAS SET INTO A WINDOW THAT PLAYATTACK THEN OVERWROTE — 0/24 rolls survived.
 *    `p.attack(t)` does NOT start the clip. It starts the RIG's swing; `Player.update()` then
 *    sees `sledge.phase > 0` on the NEXT frame and calls `avatar.playAttack()`, which re-rolls
 *    the prop to the SWINGS entry's own `grip`. So a roll set between `attack()` and the first
 *    frame is destroyed a frame later. Rounds 1 and 2 of the swing critic used exactly that
 *    order and their "the roll stuck" assertion only passed because playAttack did not re-apply
 *    the grip back then. THE ROLL IS NOW SET AFTER THE FIRST PUMPED FRAME, and `__roll.get()`
 *    is recorded on EVERY row so an overwrite shows up in the data instead of being asserted
 *    away once at the end.
 *
 * 2. 60 Hz UNDERSAMPLES THIS CHOP. `Attack` is a 2.79 s clip retimed to SWING_DUR 0.70, and at
 *    1/60 the head moved 1.1 m BETWEEN TWO ADJACENT FRAMES — the whole downstroke was four
 *    samples and the central-difference velocity at the strike was garbage, which is why the
 *    face angle came out in a meaningless 10-20 deg band. Sampling is now 1/240 by default.
 *    `mixer.update(dt)` and the rig's `(t - t0) / SWING_DUR` are both linear in dt, so a
 *    quarter-size step is the same motion at four times the resolution, not a different one.
 *
 * ⚠️ THE MEASUREMENT PUMP DOES NOT DRAW. `__strobe.step` wraps each step in a rAF so the
 * compositor has a frame to show, which is required to SCREENSHOT a frame and irrelevant to
 * reading numbers off it. The numeric runs step the engine directly inside one page call — one
 * round trip per swing instead of 400. The PICTURES still go through `__strobe.step`.
 *
 * ⚠️ THE CLIP IS FORCED, NOT HOPED FOR. `?swingpick=N` (a temporary hook in mesh-avatar.js)
 * makes `playAttack` take SWINGS[N] instead of a random entry, and `avatar.swing.clip` is
 * asserted against RRR_CLIP on every single swing.
 */
import { strobe, MOTIONS } from '../strobe.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const CLIP = process.env.RRR_CLIP || 'Attack';
const BAKED = +(process.env.RRR_BAKED || 2.37);   // the SWINGS grip playAttack applies
const SUB = +(process.env.RRR_SUB || 4);          // sub-steps per 1/60 frame
const DT = 1 / (60 * SUB);
const NSTEP = Math.ceil(0.95 * 60 * SUB);         // ~0.95 s of sim, the 0.70 s swing + recovery
const DEG = 180 / Math.PI;
const SWING_DUR = 0.70;
const GAME_CONTACT = 0.60;

/** Row builder, shared by the numeric pump and the screenshot pump. */
const ROWSRC = `(e, p, s) => {
  const h = s && s.head;
  if (!h) return null;
  h.updateWorldMatrix(true, false);
  const m = h.matrixWorld.elements;
  const nx = Math.hypot(m[0], m[1], m[2]) || 1, ny = Math.hypot(m[4], m[5], m[6]) || 1;
  const row = {
    t: +e.elapsed.toFixed(6),
    ph: s.phase == null ? null : +s.phase.toFixed(5),
    px: m[12], py: m[13], pz: m[14],
    ax: m[0] / nx, ay: m[1] / nx, az: m[2] / nx,
    hx: m[4] / ny, hy: m[5] / ny, hz: m[6] / ny,
    ppx: p.pos.x, ppy: p.pos.y, ppz: p.pos.z, facing: +p.facing.toFixed(5),
    roll: window.__roll ? window.__roll.get() : null,
  };
  const mx = p.avatar && p.avatar.mixer, acts = mx && mx._actions;
  if (acts) for (const a of acts) {
    const c = a.getClip && a.getClip();
    if (!c || c.name !== ${JSON.stringify(CLIP)}) continue;
    row.clipPh = c.duration > 0 ? +(a.time / c.duration).toFixed(5) : null;
    row.clipRun = !!a.isRunning();
  }
  return row;
}`;

/**
 * ONE WHOLE SWING, IN THE PAGE, AT ONE ROLL.
 *   fire -> ONE step (this is the frame Player.update calls playAttack on) -> set the roll
 *        -> step to the end, recording every sub-frame.
 */
const RUNSWING = `(roll, dt, n) => {
  const e = window.__rrr.engine, p = e.player;
  const mkRow = ${ROWSRC};
  p._fireCd = 0;
  const fired = p.attack(e.elapsed);
  if (!fired) return { ok: false, why: 'attack denied' };
  let now = performance.now();
  const rows = [];
  now += dt * 1000; e._step(dt, now);          // <- playAttack runs inside THIS step
  const clip = (p.avatar.swing || {}).clip || null;
  const applied = window.__roll.set(roll);      // <- and only now is it safe to roll the prop
  rows.push(mkRow(e, p, p.sledge));
  for (let k = 1; k < n; k++) { now += dt * 1000; e._step(dt, now); rows.push(mkRow(e, p, p.sledge)); }
  return { ok: true, rows: rows.filter(Boolean), clip, applied, rollAfter: window.__roll.get() };
}`;

const INSTALL = `() => {
  const e = window.__rrr.engine, p = e.player, obj = p.sledge && p.sledge.root;
  if (!obj) return { ok: false, why: 'no sledge root' };
  if (!p.avatar) return { ok: false, why: 'no mesh avatar — did ?mesh=1 reach the view?' };
  if (!p.avatar.propMounted) return { ok: false, why: 'prop not mounted on the hand bone' };
  if (obj.parent && obj.parent.name !== 'RightHand') return { ok: false, why: 'prop parent is ' + (obj.parent && obj.parent.name) };
  const sw = p.avatar.swing;
  if (!sw || sw.clip !== ${JSON.stringify(CLIP)}) return { ok: false, why: 'avatar.swing.clip is ' + (sw && sw.clip) + ' not ${CLIP} — ?swingpick= did not force it' };
  const Q = obj.quaternion.constructor, Y = { x: 0, y: 1, z: 0, isVector3: true };
  const qAlign = obj.quaternion.clone().multiply(new Q().setFromAxisAngle(Y, -${BAKED}));
  window.__roll = {
    set: (r) => { obj.quaternion.copy(qAlign).multiply(new Q().setFromAxisAngle(Y, r)); obj.updateMatrixWorld(true); return r; },
    get: () => { const d = qAlign.clone().invert().multiply(obj.quaternion); return +(2 * Math.atan2(d.y, d.w)).toFixed(4); },
  };
  window.__prop = { hide: (v) => { obj.visible = !v; } };
  window.__swingClip = () => (p.avatar.swing || {}).clip || null;
  window.__mkRow = ${ROWSRC};
  window.__snapRow = () => window.__mkRow(e, p, p.sledge);

  let wall = null;
  try {
    const eye = p.pos.clone(); eye.y += p.eyeHeight;
    const fwd = p.pos.clone().set(Math.sin(p.facing), 0, Math.cos(p.facing));
    const hit = e.room.castRay && e.room.castRay(eye, fwd, 4.0, { forDamage: true });
    if (hit) wall = { dist: +hit.distance.toFixed(4), stage: hit.panel ? (hit.panel.stage ?? null) : null };
  } catch (err) { wall = { err: String(err) }; }

  return { ok: true, roll: window.__roll.get(), clip: sw.clip, swingContact: sw.contact,
           swingGrip: sw.grip, floorY: (e.room && e.room.floorY != null) ? e.room.floorY : null,
           wall, playerY: +p.pos.y.toFixed(4), facing: +p.facing.toFixed(4),
           height: p.height, eyeHeight: p.eyeHeight };
}`;

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

// ------------------------------------------------------------------ node-side maths

function analyse(rows, wallDist) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], a = rows[i - 1], b = rows[i + 1];
    let v = null, dt = 0;
    if (a && b) { dt = b.t - a.t; v = [b.px - a.px, b.py - a.py, b.pz - a.pz]; }
    else if (b) { dt = b.t - r.t; v = [b.px - r.px, b.py - r.py, b.pz - r.pz]; }
    else if (a) { dt = r.t - a.t; v = [r.px - a.px, r.py - a.py, r.pz - a.pz]; }
    const o = { ...r, faceDeg: null, haftDeg: null, spd: null, vy: null, ux: 0, uy: 0, uz: 0 };
    const fx = Math.sin(r.facing), fz = Math.cos(r.facing);
    o.reach = +((r.px - r.ppx) * fx + (r.pz - r.ppz) * fz).toFixed(4);
    if (wallDist != null) o.wallGap = +(wallDist - o.reach).toFixed(4);
    if (v && dt > 1e-9) {
      const L = Math.hypot(v[0], v[1], v[2]);
      o.spd = +(L / dt).toFixed(3);
      o.vy = +(v[1] / dt).toFixed(3);
      if (L > 1e-7) {
        o.ux = v[0] / L; o.uy = v[1] / L; o.uz = v[2] / L;
        o.faceDeg = +(Math.acos(Math.min(1, Math.abs(r.ax * o.ux + r.ay * o.uy + r.az * o.uz))) * DEG).toFixed(1);
        o.haftDeg = +(Math.acos(Math.min(1, Math.abs(r.hx * o.ux + r.hy * o.uy + r.hz * o.uz))) * DEG).toFixed(1);
      }
    }
    out.push(o);
  }
  return out;
}
const live = (rows) => rows.filter((r) => r.ph != null && r.ph > 0 && r.ph <= 1.001);
const at = (rows, ph) => live(rows).reduce((b, r) => (b == null || Math.abs(r.ph - ph) < Math.abs(b.ph - ph) ? r : b), null);
const argmin = (rows, f) => live(rows).reduce((b, r) => (b == null || f(r) < f(b) ? r : b), null);
const argmax = (rows, f) => live(rows).reduce((b, r) => (b == null || f(r) > f(b) ? r : b), null);

/**
 * WHERE THE HEAD ARRIVES. Four independent candidates off the same trajectory, all reported,
 * because "the head arrives" is a judgement and the honest thing is to show the spread.
 *
 *   peak      phase of maximum head speed — the middle of the power stroke
 *   decel     the first phase after `peak` where the speed has fallen to 20% of it. This is
 *             the END of the power stroke: a free swing decelerates exactly where a swing
 *             into a target would be stopped by it. THE PRIMARY.
 *   bottom    phase of minimum head height (the ground-chop landing)
 *   reach     phase of maximum forward reach in the player's facing frame
 */
function contactCandidates(rows) {
  const L = live(rows);
  if (!L.length) return null;
  const peak = argmax(rows, (r) => r.spd ?? -1);
  let decel = null;
  for (const r of L) {
    if (r.ph <= peak.ph || r.spd == null) continue;
    if (r.spd < 0.20 * peak.spd) { decel = r; break; }
  }
  const bottom = argmin(rows, (r) => r.py);
  const reach = argmax(rows, (r) => r.reach ?? -99);
  return {
    peakPh: peak.ph, peakSpd: peak.spd, peakY: +peak.py.toFixed(3),
    decelPh: decel?.ph ?? null, decelSpd: decel?.spd ?? null, decelY: decel ? +decel.py.toFixed(3) : null,
    decelReach: decel?.reach ?? null,
    bottomPh: bottom.ph, bottomY: +bottom.py.toFixed(3),
    reachPh: reach.ph, reachMax: reach.reach,
  };
}

/**
 * The face angle against the STRIKE'S OWN travel direction rather than against the local
 * frame-to-frame velocity. At the impact instant the head is decelerating hard and the local
 * velocity direction is ill-conditioned; the direction the blow is TRAVELLING is the one at
 * peak speed, and that is what a viewer reads the face against.
 */
function faceAgainstStrikeDir(rows, ph) {
  const L = live(rows);
  if (!L.length) return null;
  const peak = argmax(rows, (r) => r.spd ?? -1);
  const r = at(rows, ph);
  if (!r || !peak) return null;
  const d = Math.abs(r.ax * peak.ux + r.ay * peak.uy + r.az * peak.uz);
  return +(Math.acos(Math.min(1, d)) * DEG).toFixed(1);
}

/** Speed-weighted mean face angle over the power stroke — the read across the blow, not at one instant. */
function arcFace(rows, lo, hi) {
  let ws = 0, s = 0, mn = null, mx = null, n = 0;
  for (const r of live(rows)) {
    if (r.ph < lo || r.ph > hi || r.faceDeg == null) continue;
    const w = Math.max(0, r.spd ?? 0);
    ws += w; s += r.faceDeg * w; n++;
    mn = mn == null ? r.faceDeg : Math.min(mn, r.faceDeg);
    mx = mx == null ? r.faceDeg : Math.max(mx, r.faceDeg);
  }
  return { mean: ws > 0 ? +(s / ws).toFixed(1) : null, min: mn, max: mx, n };
}

export default async function swing3(ctx) {
  const { page, note, pass, fail, skip, snap, SHOTDIR } = ctx;
  const OUT = path.join(SHOTDIR, `swing3-${CLIP}`);
  await mkdir(OUT, { recursive: true });
  const rep = { at: new Date().toISOString(), clip: CLIP, baked: BAKED, dt: DT, subSteps: SUB };

  const m = await strobe(ctx, {
    ...MOTIONS.sledge, name: `swing3-${CLIP}-stage`, mode: 'uniform', n: 1,
    silhouette: false, cam: 'profile', dist: 3.4, out: 'progress/strobe',
  });
  if (!m) { skip(`swing3 ${CLIP}`, 'staging swing did not fire'); return; }
  rep.stage = m.stage;

  const inst = await page.evaluate(`(${INSTALL})()`);
  note(`install: ${JSON.stringify(inst)}`);
  if (!inst?.ok) { fail(`the clip under test is ${CLIP} and its prop is addressable`, inst?.why ?? '?'); return; }
  pass(`the clip under test is ${CLIP} and its prop is addressable`,
    `avatar.swing = ${JSON.stringify({ clip: inst.clip, grip: inst.swingGrip, contact: inst.swingContact })}, wall at ${inst.wall?.dist} m, floorY ${inst.floorY}`);
  rep.install = inst;
  const WALL = inst.wall?.dist ?? null;
  await page.evaluate(`window.__cam = ${CAM};`);

  const step = (k = 1) => page.evaluate((k) => window.__strobe.step(k), k);

  /** One numeric swing at one roll — a single page round trip. */
  const swing = async (roll) => {
    const r = await page.evaluate(`(${RUNSWING})(${roll}, ${DT}, ${NSTEP})`);
    if (!r?.ok) return { ok: false, why: r?.why ?? 'no result' };
    return { ok: true, rows: analyse(r.rows, WALL), clip: r.clip, rollAfter: r.rollAfter, applied: r.applied };
  };

  // ================= A. TRAJECTORY, three identical runs ====================================
  const traj = [];
  for (let i = 0; i < 3; i++) {
    const s = await swing(BAKED);
    if (!s.ok) { note(`traj run ${i}: ${s.why}`); continue; }
    const L = live(s.rows);
    if (!L.length) { note(`traj run ${i}: no live frames`); continue; }
    const c = contactCandidates(s.rows);
    const rollsHeld = L.filter((r) => Math.abs(r.roll - BAKED) < 0.01).length;
    traj.push({ run: i, n: L.length, clip: s.clip, rollAfter: s.rollAfter, rollsHeld, cand: c,
      minY: +Math.min(...L.map((r) => r.py)).toFixed(4),
      table: L.filter((_, k) => k % SUB === 0).map((r) => ({ ph: +r.ph.toFixed(3), y: +r.py.toFixed(3), reach: r.reach, spd: r.spd, vy: r.vy, face: r.faceDeg })) });
  }
  rep.traj = traj;
  if (!traj.length) { fail(`${CLIP}: the swing ran and the head was recorded`, 'no run produced live frames'); return; }

  const okClip = traj.every((t) => t.clip === CLIP);
  if (okClip) pass(`every swing measured was ${CLIP}`, `${traj.length} runs, avatar.swing.clip === "${CLIP}"`);
  else fail(`every swing measured was ${CLIP}`, `clips seen: ${traj.map((t) => t.clip).join(' ')}`);

  const heldAll = traj.every((t) => t.rollsHeld === t.n);
  if (heldAll) pass('the roll holds on EVERY recorded frame, not just at the end',
    `${traj.map((t) => t.rollsHeld + '/' + t.n).join(' ')} frames at the set roll`);
  else fail('the roll holds on EVERY recorded frame, not just at the end',
    `${traj.map((t) => t.rollsHeld + '/' + t.n).join(' ')} — something rewrites the prop mid-swing`);

  for (const t of traj) note(`traj run${t.run}: peak ${t.cand.peakSpd} m/s @p${t.cand.peakPh} (y ${t.cand.peakY}) | decel@20% p${t.cand.decelPh} (y ${t.cand.decelY}, reach ${t.cand.decelReach}) | bottom y ${t.cand.bottomY} @p${t.cand.bottomPh} | maxReach ${t.cand.reachMax} @p${t.cand.reachPh}`);

  const mean = (f) => +(traj.reduce((s, t) => s + (f(t) ?? 0), 0) / traj.length).toFixed(4);
  const spread = (f) => +(Math.max(...traj.map(f)) - Math.min(...traj.map(f))).toFixed(4);
  const CONTACT = traj[0].cand.decelPh != null ? mean((t) => t.cand.decelPh) : mean((t) => t.cand.bottomPh);
  rep.contact = {
    recommended: CONTACT,
    basis: traj[0].cand.decelPh != null ? 'end of the power stroke (speed falls to 20% of peak)' : 'bottom of the arc (no decel crossing found)',
    spreadAcrossRuns: traj[0].cand.decelPh != null ? spread((t) => t.cand.decelPh) : spread((t) => t.cand.bottomPh),
    peakPh: mean((t) => t.cand.peakPh), peakSpd: mean((t) => t.cand.peakSpd),
    bottomPh: mean((t) => t.cand.bottomPh), reachPh: mean((t) => t.cand.reachPh),
  };
  note(`CONTACT candidates ${CLIP}: peak p${rep.contact.peakPh} | decel p${CONTACT} | bottom p${rep.contact.bottomPh} | maxReach p${rep.contact.reachPh}`);

  // FLOOR
  const minY = Math.min(...traj.map((t) => t.minY));
  const floorY = inst.floorY ?? 0;
  rep.floor = { floorY, headMinY: +minY.toFixed(3), below: +(floorY - minY).toFixed(3), atPhase: traj[0].cand.bottomPh };
  if (minY < floorY - 0.02) fail(`${CLIP}: the head stays above the floor`,
    `head reaches y=${minY.toFixed(3)} m at p${traj[0].cand.bottomPh} — ${((floorY - minY) * 100).toFixed(0)} cm BELOW the floor at y=${floorY}`);
  else pass(`${CLIP}: the head stays above the floor`, `lowest head y=${minY.toFixed(3)} vs floor ${floorY}`);

  // ================= B. THE GRIP SWEEP =====================================================
  const rolls = [];
  for (let i = 0; i < 24; i++) rolls.push(+((i / 24) * Math.PI * 2).toFixed(4));
  const LO = Math.max(0.02, CONTACT - 0.10), HI = Math.min(1, CONTACT + 0.02);
  const sweep = [];
  for (const r of rolls) {
    const s = await swing(r);
    if (!s.ok) { note(`sweep roll ${r}: ${s.why}`); continue; }
    const c = at(s.rows, CONTACT);
    const arc = arcFace(s.rows, LO, HI);
    const L = live(s.rows);
    sweep.push({ roll: r, rollAfter: s.rollAfter,
      held: L.filter((x) => Math.abs(x.roll - r) < 0.01).length === L.length,
      faceAtContact: c?.faceDeg ?? null,
      faceVsStrikeDir: faceAgainstStrikeDir(s.rows, CONTACT),
      haftAtContact: c?.haftDeg ?? null, spd: c?.spd ?? null,
      faceAtGameContact: at(s.rows, GAME_CONTACT)?.faceDeg ?? null,
      arcMean: arc.mean, arcMin: arc.min, arcMax: arc.max });
  }
  rep.sweep = sweep;
  note(`sweep: ${sweep.length}/${rolls.length} rolls, window p${LO.toFixed(3)}-p${HI.toFixed(3)}`);

  const stuck = sweep.filter((s) => s.held).length;
  if (stuck === sweep.length) pass('the roll survives every frame of every swept swing',
    `${stuck}/${sweep.length} swings held their roll on all frames`);
  else fail('the roll survives every frame of every swept swing',
    `only ${stuck}/${sweep.length} — the sweep is void`);

  // THE CONTROL THAT MUST FAIL.
  const faces = sweep.map((s) => s.faceVsStrikeDir).filter((x) => x != null);
  const span = faces.length ? Math.max(...faces) - Math.min(...faces) : 0;
  if (span > 60) pass('CONTROL: the face angle responds to the roll',
    `face-vs-strike-direction spans ${Math.min(...faces).toFixed(1)}-${Math.max(...faces).toFixed(1)} deg (${span.toFixed(1)}) across a full turn`);
  else fail('CONTROL: the face angle responds to the roll',
    `spans only ${span.toFixed(1)} deg across a full turn — DISCARD every number in this run`);

  const ranked = [...sweep].filter((s) => s.faceVsStrikeDir != null).sort((a, b) => a.faceVsStrikeDir - b.faceVsStrikeDir);
  rep.best = ranked.slice(0, 5); rep.worst = ranked.slice(-3);
  note(`best rolls: ${ranked.slice(0, 5).map((s) => `${s.roll}->${s.faceVsStrikeDir}deg`).join('  ')}`);
  note(`worst: ${ranked.slice(-3).map((s) => `${s.roll}->${s.faceVsStrikeDir}deg`).join('  ')}`);

  // ---- refine around the coarse best ------------------------------------------------------
  const coarse = ranked[0]?.roll ?? BAKED;
  const fine = [];
  for (let i = -5; i <= 5; i++) {
    const r = +(coarse + i * 0.05).toFixed(4);
    const s = await swing(r);
    if (!s.ok) continue;
    const arc = arcFace(s.rows, LO, HI);
    fine.push({ roll: r, faceVsStrikeDir: faceAgainstStrikeDir(s.rows, CONTACT),
      faceAtContact: at(s.rows, CONTACT)?.faceDeg ?? null, arcMean: arc.mean });
  }
  rep.fine = fine;
  note(`fine: ${fine.map((f) => `${f.roll}:${f.faceVsStrikeDir}`).join('  ')}`);
  const fineRanked = [...fine].filter((f) => f.faceVsStrikeDir != null).sort((a, b) => a.faceVsStrikeDir - b.faceVsStrikeDir);
  const BEST = fineRanked[0]?.roll ?? coarse;

  // ================= C. RUN-TO-RUN NOISE ===================================================
  const noise = [];
  for (let i = 0; i < 5; i++) {
    const s = await swing(BEST);
    if (!s.ok) continue;
    const c = contactCandidates(s.rows);
    noise.push({ i, face: faceAgainstStrikeDir(s.rows, CONTACT), faceLocal: at(s.rows, CONTACT)?.faceDeg ?? null,
      decelPh: c.decelPh, peakPh: c.peakPh, minY: +Math.min(...live(s.rows).map((r) => r.py)).toFixed(4) });
  }
  const nf = noise.map((n) => n.face).filter((x) => x != null);
  const np = noise.map((n) => n.decelPh).filter((x) => x != null);
  rep.noise = { roll: BEST, runs: noise,
    faceSpread: nf.length ? +(Math.max(...nf) - Math.min(...nf)).toFixed(1) : null,
    contactSpread: np.length ? +(Math.max(...np) - Math.min(...np)).toFixed(4) : null };
  note(`NOISE roll ${BEST}: faces ${nf.join(', ')} (spread ${rep.noise.faceSpread} deg); contact p ${np.join(', ')} (spread ${rep.noise.contactSpread})`);
  if (nf.length >= 3) pass('run-to-run noise measured on identical rolls', `${nf.length} runs, face spread ${rep.noise.faceSpread} deg, contact spread ${rep.noise.contactSpread}`);
  else fail('run-to-run noise measured on identical rolls', `only ${nf.length} runs`);

  // ---- tolerance band --------------------------------------------------------------------
  const band = [...sweep, ...fine].filter((s) => s.faceVsStrikeDir != null && s.faceVsStrikeDir < 20)
    .map((s) => s.roll).sort((a, b) => a - b);
  // contiguous run containing BEST
  let lo = BEST, hi = BEST;
  const all = [...new Set(band)].sort((a, b) => a - b);
  for (const r of all) { if (r <= BEST && (lo === BEST || r < lo)) { /* noop */ } }
  const near = all.filter((r) => Math.abs(r - BEST) < 1.2);
  rep.band20 = { all, contiguousNearBest: near.length ? [Math.min(...near), Math.max(...near)] : null };
  note(`rolls under 20 deg: ${all.join(' ')}`);

  // ================= D. PICTURES ===========================================================
  const swingTo = async (roll, target) => {
    await page.evaluate(() => { window.__rows = []; });
    const f = await page.evaluate(`(() => { const e = window.__rrr.engine, p = e.player; p._fireCd = 0; const r = p.attack(e.elapsed); return { fired: !!r }; })()`);
    if (!f?.fired) return null;
    await step(1);                                   // playAttack lands here
    await page.evaluate((r) => window.__roll.set(r), roll);
    for (let k = 0; k < 60; k++) {
      await step(1);
      await page.evaluate(() => { const r = window.__snapRow(); if (r) window.__rows.push(r); });
      const ph = await page.evaluate(() => window.__rrr.engine.player.sledge.phase || null);
      if (ph != null && ph >= target) {
        const rows = analyse(await page.evaluate(() => window.__rows), WALL);
        return { ph, rows, roll: await page.evaluate(() => window.__roll.get()) };
      }
    }
    return null;
  };
  const finish = async () => { await step(50); };
  const capture = async (tag) => {
    const files = {};
    await page.evaluate(() => window.__strobe.chrome(false));
    files.normal = path.join(OUT, `${tag}.png`);
    await snap(tag, { path: files.normal });
    await page.evaluate((s) => window.__strobe.sil(true, s), 'subject');
    files.sil = path.join(OUT, `sil-${tag}.png`);
    await snap(`sil-${tag}`, { path: files.sil });
    await page.evaluate((s) => window.__strobe.sil(false, s), 'subject');
    return files;
  };

  const SHOW = [BEST, 2.37, +(BEST + Math.PI / 2).toFixed(3)];
  const shots = [];
  for (const az of [45, 90, 135, 180]) {
    const ci = await page.evaluate(`window.__cam(${az}, 3.6, 1.25, 1.10, 0.80)`);
    note(`camera az${az}: ${JSON.stringify(ci)}`);
    for (const g of SHOW) {
      const got = await swingTo(g, CONTACT);
      if (!got) { note(`shot az${az} grip ${g}: never reached p${CONTACT}`); continue; }
      const tag = `az${String(az).padStart(3, '0')}-g${String(Math.round(g * 100)).padStart(3, '0')}-p${got.ph.toFixed(2)}`;
      const files = await capture(tag);
      shots.push({ az, grip: g, rollBack: got.roll, phase: +got.ph.toFixed(3), ...files });
      note(`shot az${az} grip=${g} (prop reads ${got.roll}) p=${got.ph.toFixed(3)}`);
      await finish();
    }
  }
  rep.shots = shots;

  const strip = [];
  await page.evaluate(`window.__cam(90, 3.6, 1.25, 1.10, 0.80)`);
  for (const ph of [0.20, 0.35, CONTACT, Math.min(0.99, CONTACT + 0.12), 0.90]) {
    const got = await swingTo(BEST, ph);
    if (!got) { note(`strip p${ph}: not reached`); continue; }
    const c = at(got.rows, ph);
    const tag = `strip-p${String(Math.round(ph * 100)).padStart(2, '0')}-g${String(Math.round(BEST * 100)).padStart(3, '0')}`;
    const files = await capture(tag);
    strip.push({ ph, got: +got.ph.toFixed(3), y: c ? +c.py.toFixed(3) : null, spd: c?.spd ?? null, ...files });
    await finish();
  }
  rep.strip = strip;

  rep.answer = {
    clip: CLIP, grip: BEST,
    faceDegAtContact: fineRanked[0]?.faceVsStrikeDir ?? null,
    arcMeanAtBest: fineRanked[0]?.arcMean ?? null,
    contact: CONTACT, contactBasis: rep.contact.basis,
    peakSpdPhase: rep.contact.peakPh, peakSpd: rep.contact.peakSpd,
    band20: rep.band20.contiguousNearBest,
    headMinY: +minY.toFixed(3), floorY, belowFloor: +(floorY - minY).toFixed(3),
    noiseDeg: rep.noise.faceSpread, noiseContact: rep.noise.contactSpread,
    wallDist: WALL, reachAtContact: traj[0].cand.decelReach,
  };
  const jf = path.join(OUT, `swing3-${CLIP}.json`);
  await writeFile(jf, JSON.stringify(rep, null, 2));
  note(`ANSWER ${CLIP}: ${JSON.stringify(rep.answer)}`);
  note(`report ${jf}`);
  if (shots.length >= 6) pass('silhouettes at three grips from four azimuths', `${shots.length} frames`);
  else fail('silhouettes at three grips from four azimuths', `only ${shots.length}`);
}
