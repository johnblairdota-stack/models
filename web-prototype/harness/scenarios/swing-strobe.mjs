/**
 * CRITIC INSTRUMENT (critic-swing-1) — an unlabelled side-on strobe of the sledgehammer swing,
 * dense enough to judge MOTION rather than a handful of posed beats.
 *
 * REWRITTEN after round 1's two failures, both worth recording:
 *
 *   1. FIXED-INTERVAL SAMPLING DOES NOT WORK UNDER THIS PROJECT'S GPU CONTENTION. A 30-sample
 *      loop at a 38 ms requested gap actually landed at ~440-500ms real gaps (screenshot
 *      latency dominates, not the wait), so 27 of 30 frames landed AFTER the 0.70 s swing had
 *      already finished and reset to idle. Fix: trigger ONE swing per checkpoint and POLL for
 *      `player.sledge.phase >= target` before shooting — real time no longer matters, only
 *      simulation phase does. The swing is deterministic/time-driven (`sledge.js` has no
 *      `Math.random` in the drive), so stitching frames from ~20 separate swing instances into
 *      one strobe is equivalent to sampling one continuous swing at high density.
 *   2. `ballroom.centre` PUTS A LOAD-BEARING COLUMN DIRECTLY IN THE HAND-PLACED CAMERA'S LINE
 *      OF SIGHT — both captured frames were a dark pillar filling half the frame, player fully
 *      occluded. The production `ThirdPersonCamera` never hits this because it clamps its own
 *      distance off a `castRay` every frame (`clearAt()` in player.js); a hand-placed camera
 *      that skips that check just drives through the wall. Fix: probe clearance on los World
 *      axes with `room.castRay` (same call `sledge-check.mjs` uses to find a wall) BEFORE
 *      choosing a facing/camera-side/distance, exactly the thing the production camera does
 *      for itself every frame.
 *
 * Also pins the hunter far off-map for the whole capture: an early run's tail frames (10-17 s
 * of real idle time standing in the open) showed unexplained hip/spine roll spikes consistent
 * with a hunter reaction contaminating what was meant to be a clean swing-only trace.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/swing-strobe.mjs \
 *        --port 5197 --shots
 *
 * Then tile (unlabelled, per the char.locomotion strobe convention):
 *   node harness/sheet.mjs --glob "progress/playtest/game.play.strobe-*.png" \
 *        --out progress/playtest/swing-strobe-sheet.png --cols 6 --width 2400 --labels 0
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

// Dense across the whole swing, denser through COCK->HIT->FOLLOW (0.42-0.80, per sledge.js's
// own ease-table boundaries) where the acceleration into and out of contact actually happens.
const TARGETS = [0.04, 0.10, 0.16, 0.22, 0.28, 0.34, 0.40,
  0.44, 0.48, 0.52, 0.56, 0.58, 0.60, 0.62, 0.64, 0.68, 0.72, 0.76, 0.80, 0.86, 0.92, 0.98];
const CAM_DIST_WANT = 4.0;
const CAM_H = 1.15;
const STANDOFF = 0.45;
const MIN_DIST = 1.9;

export default async function swingStrobe({ page, note, pass, fail, shot, SHOTDIR }) {
  const ok = await page.evaluate(() => !!window.__rrr?.engine?.player);
  if (!ok) { fail('engine reachable', 'window.__rrr.engine.player not exposed'); return; }

  // ---- 0. arms sane -----------------------------------------------------------------------
  await page.evaluate(() => {
    const p = window.__rrr.engine.player;
    for (const s of ['shoulderL', 'shoulderR']) if (p.rig.occupant(s) === 'gadget') p.rig.detach(s);
    for (const s of ['shoulderL', 'shoulderR']) if (p.rig.occupant(s) === 'empty') p.rig.refit?.(s);
  });

  // ---- 1. the REAL pickup -------------------------------------------------------------------
  const pick = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    if (p.sledge.owned) { if (!p.sledge.equipped) p._toggleSledge(); return { already: true, equipped: p.sledge.equipped }; }
    const it = e.limbField.items.find((i) => i.type === 'sledge');
    if (!it) return { found: false };
    p.pos.copy(it.root.position);
    p.vel.set(0, 0, 0);
    p.interact(e.limbField, 1.5, null);
    return { found: true, equipped: p.sledge.equipped, owned: p.sledge.owned };
  });
  note(`pickup: ${JSON.stringify(pick)}`);
  if (!pick.equipped) { fail('sledgehammer equipped', JSON.stringify(pick)); return; }
  pass('sledgehammer equipped', JSON.stringify(pick));

  // ---- 2. pin the hunter far away for the whole session ------------------------------------
  await page.evaluate(() => {
    const e = window.__rrr.engine;
    if (!e.hunter) return;
    const park = () => { e.hunter.root.position.set(9999, 0, 9999); e.hunter.vel?.set?.(0, 0, 0); };
    park();
    e.onUpdate(park);
  });

  // ---- 3. stand on the open floor, THEN PROBE FOR CLEARANCE before trusting any distance ----
  const probe = await page.evaluate(([camH, want]) => {
    const e = window.__rrr.engine, p = e.player, room = e.room;
    const anchors = ['ballroom.centre', 'ballroom.south', 'ballroom.north', 'gallery.mid'];
    const axes = [
      { x: 1, z: 0, F: 0 }, { x: -1, z: 0, F: Math.PI },
      { x: 0, z: 1, F: -Math.PI / 2 }, { x: 0, z: -1, F: Math.PI / 2 },
    ];
    let best = null;
    for (const name of anchors) {
      const a = room.anchor?.(name);
      if (!a) continue;
      const from = a.clone(); from.y = camH;
      for (const ax of axes) {
        const dir = a.clone().set(ax.x, 0, ax.z);
        const hit = room.castRay ? room.castRay(from, dir, want + 1.0) : null;
        const clear = hit && hit.distance < want + 1.0 ? hit.distance : want + 1.0;
        if (!best || clear > best.clear) best = { anchor: name, F: ax.F, clear: +clear.toFixed(2), pos: { x: +a.x.toFixed(2), z: +a.z.toFixed(2) } };
      }
      // Good enough — stop hunting once one anchor clears the whole desired distance.
      if (best && best.clear >= want) break;
    }
    return best;
  }, [CAM_H, CAM_DIST_WANT]);
  note(`clearance probe: ${JSON.stringify(probe)}`);
  if (!probe) { fail('found an open anchor with camera clearance', 'no anchors resolved'); return; }

  const camDist = Math.max(MIN_DIST, Math.min(CAM_DIST_WANT, probe.clear - STANDOFF));
  note(`camera distance chosen: ${camDist.toFixed(2)} m (clearance ${probe.clear} m on the ${probe.anchor} axis)`);

  const staged = await page.evaluate(([anchorName, facing]) => {
    const e = window.__rrr.engine, p = e.player, room = e.room;
    const c = room.anchor(anchorName);
    p.pos.copy(c);
    p.vel.set(0, 0, 0);
    p.facing = facing; p.aimYaw = facing;
    if (e.cam) e.cam.yaw = facing;
    window.__rrr.setGrade({ exposure: 2.6, vignette: 0.04, haze: 0.0, toeCrush: 0.0, contrast: 1.0, ca: 0.0 });
    if (e.cam) e.cam.update = () => {};   // freeze the production rig; we place the camera by hand below
    return { pos: { x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2) } };
  }, [probe.anchor, probe.F]);
  note(`staged: ${JSON.stringify(staged)}`);
  pass('staged with a clear camera line', `${probe.anchor}, axis F=${probe.F.toFixed(2)}, dist ${camDist.toFixed(2)}m`);

  await page.waitForTimeout(500);   // let player.facing lerp to F before locking the camera

  const camSet = await page.evaluate(([facing, dist, camH]) => {
    const e = window.__rrr.engine, p = e.player;
    const right = { x: Math.cos(facing), z: -Math.sin(facing) };
    const px = p.pos.x + right.x * dist, pz = p.pos.z + right.z * dist;
    e.camera.position.set(px, camH, pz);
    e.camera.lookAt(p.pos.x, camH, p.pos.z);
    e.camera.updateMatrixWorld(true);
    return { camPos: { x: +px.toFixed(2), y: camH, z: +pz.toFixed(2) } };
  }, [probe.F, camDist, CAM_H]);
  note(`camera locked profile: ${JSON.stringify(camSet)}`);

  // ---- state reader --------------------------------------------------------------------
  const sample = () => page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player, u = p.unit;
    const j3 = (o) => (o ? [+o.rotation.x.toFixed(4), +o.rotation.y.toFixed(4), +o.rotation.z.toFixed(4)] : null);
    let head = null;
    if (p.sledge?.head) {
      p.sledge.head.updateWorldMatrix(true, false);
      const m = p.sledge.head.matrixWorld.elements;
      head = [+m[12].toFixed(4), +m[13].toFixed(4), +m[14].toFixed(4)];
    }
    const o = p.gait.offset;
    return {
      t: +e.elapsed.toFixed(4), phase: +(p.sledge?.phase ?? -1).toFixed(3), head,
      hips: j3(u.joints.hips), spine: j3(u.joints.spine), chest: j3(u.joints.chest),
      shoulderR: j3(u.joints.shoulderR), elbowR: j3(u.joints.elbowR),
      body: { yaw: +(o.yaw ?? 0).toFixed(4), pitch: +(o.pitch ?? 0).toFixed(4), roll: +(o.roll ?? 0).toFixed(4), x: +(o.x ?? 0).toFixed(4) },
    };
  });
  const phaseNow = () => page.evaluate(() => window.__rrr.engine.player.sledge?.phase ?? -1);

  /** Poll until phase >= target (or the swing already ended faster than we could react). */
  const waitPhase = async (target, timeoutMs = 1500) => {
    const t0 = Date.now();
    let last = -1;
    for (;;) {
      const v = await phaseNow();
      if (v >= target) return v;
      if (last > 0.5 && v === 0) return 'ended-early';   // swing reset before we hit target
      last = v;
      if (Date.now() - t0 > timeoutMs) return null;
    }
  };

  const trace = [];
  trace.push({ tag: 'strobe-00-rest', ...(await sample()) });
  await shot('strobe-00-rest');

  let missed = 0;
  for (let i = 0; i < TARGETS.length; i++) {
    const target = TARGETS[i];
    await page.mouse.down(); await page.waitForTimeout(20); await page.mouse.up();
    const got = await waitPhase(target);
    if (got === null || got === 'ended-early') { missed++; note(`checkpoint ${target} — ${got ?? 'timeout'}`); }
    const tag = `strobe-${String(i + 1).padStart(2, '0')}-p${Math.round(target * 100)}`;
    trace.push({ tag, target, gotPhase: got, ...(await sample()) });
    await shot(tag);
    // let the swing finish and the 0.95s cooldown clear before the next trigger
    await page.waitForTimeout(1150);
  }
  note(`checkpoints missed: ${missed}/${TARGETS.length}`);

  // ---- settle/recovery, fixed real-time delays after the LAST triggered swing finishes ----
  // Named with the strobe-NN prefix so they sort into the same glob/sheet as the checkpoints.
  let si = TARGETS.length + 1;
  for (const [label, ms] of [['settle-a-100ms', 100], ['settle-b-350ms', 250], ['settle-c-700ms', 350]]) {
    await page.waitForTimeout(ms);
    const tag = `strobe-${String(si++).padStart(2, '0')}-${label}`;
    trace.push({ tag, ...(await sample()) });
    await shot(tag);
  }

  pass('strobe captured', `${trace.length} frames, ${TARGETS.length - missed}/${TARGETS.length} checkpoints hit`);

  const outPath = path.join(SHOTDIR, 'swing-strobe-trace.json');
  await writeFile(outPath, JSON.stringify({ at: new Date().toISOString(), anchor: probe.anchor, facing: probe.F, camDist, camH: CAM_H, trace }, null, 2));
  note(`trace written: ${outPath}`);
}
