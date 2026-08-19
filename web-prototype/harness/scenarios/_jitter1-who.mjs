/**
 * 🚨 **WHO MOVES A FROZEN PICTURE?** — the attribution half of `jitter-1`, by REINTRODUCTION.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_jitter1-who.mjs \
 *        --port 5423 --q "seed=s4&dig=1"
 *
 * `_jitter1-floor.mjs` establishes that `pipeline.deterministic = true` + every scene updater
 * removed is PIXEL-IDENTICAL across a 12-frame burst at both stations. A floor of exactly zero
 * is the only base worth reintroducing onto: a suspect armed on top of it owns 100% of whatever
 * moves, with no subtraction and no noise term.
 *
 * ⚠️ **TWO WAYS THE FIRST BUILD OF THIS PROBE LIED, BOTH FIXED HERE AND BOTH WORTH KNOWING:**
 *
 *  1. **The camera is driven BY an updater** (`liveInput` inside updater 0), so teleporting the
 *     player while the updaters are removed leaves the camera where it was. The second station
 *     was never visited: its panel rect projected to `-2556,-210` — off screen — and every row
 *     under it read a confident 0.00%. **Park and settle with the sim RUNNING, then freeze.**
 *  2. **Bumping `pipeline.frame` to test the AO dither does nothing while `deterministic` is
 *     true**, because that flag is what zeroes `uFrame`. The AO arm has to unpin the pipeline
 *     and zero the GRAIN instead, which is the only other term the flag controls.
 *
 * Suspects, each armed alone, BETWEEN the two captures (arming one and then settling just makes
 * a different still picture, which photographs identically twice and reports "innocent"):
 *   grain-phase   the grain phase advances for one live window
 *   ao-dither     the AO sample rotation advances, grain amplitude held at 0
 *   dynres-1step  one `_liveLoop` dynamic-resolution step (renderScale -0.02)
 *   upd:<i>       one scene updater re-armed on its own
 */
import { decodePng } from '../pxdiff.mjs';

function rectDiff(a, b, r) {
  const w = a.width;
  let sum = 0, n = 0, moved = 0, mx = 0;
  const x0 = Math.max(0, r.x0 | 0), x1 = Math.min(a.width, r.x1 | 0);
  const y0 = Math.max(0, r.y0 | 0), y1 = Math.min(a.height, r.y1 | 0);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * a.channels;
      const d = Math.max(
        Math.abs(a.data[i] - b.data[i]),
        Math.abs(a.data[i + 1] - b.data[i + 1]),
        Math.abs(a.data[i + 2] - b.data[i + 2]));
      sum += d; n++;
      if (d > mx) mx = d;
      if (d > 8) moved++;
    }
  }
  return { mean: n ? sum / n : 0, movedPct: n ? (moved / n) * 100 : 0, max: mx, px: n };
}

export default async function jitterWho({ page, note, pass, fail, skip }) {
  const settle = async (frames = 30) => { for (let i = 0; i < frames; i++) await page.waitForTimeout(40); };

  const pick = (want) => page.evaluate((wantDig) => {
    const e = window.__rrr?.engine;
    if (!e?.room?.panels) return null;
    const rows = e.room.panels.map((p) => ({
      id: p.id, rotY: p.rotY, w: p.width, dig: !!p.field,
      cx: p.root.position.x, cy: p.root.position.y, cz: p.root.position.z,
      canMove: !!p.field || (p.state?.canOpen?.() ?? true),
    }));
    let best = null;
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        if (a.dig !== b.dig) continue;
        if (Math.abs(Math.cos(a.rotY - b.rotY) - 1) > 1e-3) continue;
        if (Math.abs(a.cy - b.cy) > 0.05) continue;
        const n = { x: Math.sin(a.rotY), z: Math.cos(a.rotY) };
        if (Math.abs((b.cx - a.cx) * n.x + (b.cz - a.cz) * n.z) > 0.05) continue;
        const sep = Math.hypot(b.cx - a.cx, b.cz - a.cz);
        if (sep < (a.w + b.w) * 0.45 || sep > 9) continue;
        const score = sep + (a.dig === wantDig ? 0 : 1000)
          + (a.canMove ? 0 : 100) + (b.canMove ? 0 : 100)
          + (a.id.startsWith('x.') ? 20 : 0) + (b.id.startsWith('x.') ? 20 : 0);
        if (!best || score < best.score) best = { a, b, score };
      }
    }
    if (!best) return null;
    const t = best.a.canMove ? best.a : best.b;
    return { arm: t.dig ? 'damage' : 'scalar', id: t.id };
  }, want);

  const station = (pid, d = 3.0) => page.evaluate(([id, dist]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    if (!p) return null;
    const n = p.normal, c = p.pointAt(0.5, 0.45);
    e.player.pos.set(c.x + n.x * dist, e.room.floorY, c.z + n.z * dist);
    e.player.vel.set(0, 0, 0);
    e.player.facing = Math.atan2(-n.x, -n.z);
    if (e.cam) { e.cam.yaw = e.player.facing; e.cam.pitch = 0; e.cam._first = true; }
    return { space: e.room.spaceAt(e.player.pos)?.id ?? null };
  }, [pid, d]);

  const rectOf = (pid) => page.evaluate((id) => {
    const e = window.__rrr.engine, p = e.room.panelOf(id);
    const cvs = e.renderer.domElement;
    const sw = cvs.clientWidth, sh = cvs.clientHeight;
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const [u, v] of [[0.03, 0.03], [0.97, 0.03], [0.03, 0.97], [0.97, 0.97]]) {
      const q = p.pointAt(u, v).clone().project(e.camera);
      const x = (q.x * 0.5 + 0.5) * sw, y = (1 - (q.y * 0.5 + 0.5)) * sh;
      minx = Math.min(minx, x); maxx = Math.max(maxx, x);
      miny = Math.min(miny, y); maxy = Math.max(maxy, y);
    }
    return { rect: { x0: minx, x1: maxx, y0: miny, y1: maxy }, sw, sh,
      onScreen: maxx > 0 && minx < sw && maxy > 0 && miny < sh };
  }, pid);

  /** Camera pose right now, in the units a screenshot cares about: world m and screen px. */
  const pose = () => page.evaluate(() => {
    const e = window.__rrr.engine, c = e.camera;
    c.updateMatrixWorld();
    return { px: +c.position.x.toFixed(6), py: +c.position.y.toFixed(6), pz: +c.position.z.toFixed(6),
      qx: +c.quaternion.x.toFixed(7), qy: +c.quaternion.y.toFixed(7),
      qz: +c.quaternion.z.toFixed(7), qw: +c.quaternion.w.toFixed(7),
      plx: +e.player.pos.x.toFixed(6), ply: +e.player.pos.y.toFixed(6), plz: +e.player.pos.z.toFixed(6),
      frame: e.frame };
  });

  const freeze = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    const w = (window.__j1 ??= {});
    w.saved ??= { grain: e.pipeline.grade.grain, det: e.pipeline.deterministic,
      dyn: e.opts.dynamicRes, scale: e.pipeline.renderScale, updaters: e._updaters.slice() };
    e.pipeline.deterministic = true;
    e.pipeline.grade.grain = w.saved.grain;
    e.opts.dynamicRes = false;
    e._updaters = [];
    return w.saved.updaters.map((f, i) => `${i}:${String(f).replace(/\s+/g, ' ').slice(0, 88)}`);
  });

  const thaw = () => page.evaluate(() => {
    const e = window.__rrr.engine, s = window.__j1.saved;
    e.pipeline.grade.grain = s.grain;
    e.pipeline.deterministic = s.det;
    e.opts.dynamicRes = s.dyn;
    if (Math.abs(e.pipeline.renderScale - s.scale) > 1e-6) {
      e.pipeline.renderScale = s.scale;
      e.pipeline.setSize(e.pipeline.canvasWidth, e.pipeline.canvasHeight);
    }
    e._updaters = s.updaters.slice();
  });

  const arm = (kind, idx) => page.evaluate(([k, i]) => {
    const e = window.__rrr.engine, s = window.__j1.saved;
    if (k === 'grain') { e.pipeline.deterministic = false; return `grain phase live (grain ${e.pipeline.grade.grain})`; }
    if (k === 'ao') { e.pipeline.grade.grain = 0; e.pipeline.deterministic = false; return 'ao dither live, grain 0'; }
    if (k === 'dynres') {
      e.pipeline.renderScale = +(e.pipeline.renderScale - 0.02).toFixed(3);
      e.pipeline.setSize(e.pipeline.canvasWidth, e.pipeline.canvasHeight);
      return `scale -> ${e.pipeline.renderScale}`;
    }
    if (k === 'upd') { e._updaters = [s.updaters[i]]; return `updater ${i}`; }
    return 'nothing';
  }, [kind, idx]);

  const disarm = () => page.evaluate(() => {
    const e = window.__rrr.engine, s = window.__j1.saved;
    e.pipeline.deterministic = true;
    e.pipeline.grade.grain = s.grain;
    e._updaters = [];
    if (Math.abs(e.pipeline.renderScale - s.scale) > 1e-6) {
      e.pipeline.renderScale = s.scale;
      e.pipeline.setSize(e.pipeline.canvasWidth, e.pipeline.canvasHeight);
    }
  });

  const updNames = await freeze();
  await thaw();
  note(`updaters: ${updNames.length}`);
  for (const u of updNames) note(`   ${u}`);

  const SUSPECTS = [
    { tag: 'control', kind: 'none' },
    { tag: 'grain-phase', kind: 'grain' },
    { tag: 'ao-dither', kind: 'ao' },
    { tag: 'dynres-1step', kind: 'dynres' },
    ...updNames.map((_, i) => ({ tag: `upd:${i}`, kind: 'upd', idx: i })),
    { tag: 'control2', kind: 'none' },
  ];

  for (const want of [true, false]) {
    const p = await pick(want);
    if (!p) { skip(`a ${want ? 'damage' : 'scalar'} pair exists`, 'no pair found'); continue; }

    // ---- park and settle with the SIM RUNNING, or the camera never arrives ----------------
    await thaw();
    const st = await station(p.id);
    await settle(45);
    const g = await rectOf(p.id);
    if (!g.onScreen) { skip(`${p.arm}: the panel is on screen at its station`, JSON.stringify(g.rect)); continue; }
    note(`--- ${p.arm} · ${p.id} · space ${st?.space} · rect ${Math.round(g.rect.x0)},${Math.round(g.rect.y0)}..${Math.round(g.rect.x1)},${Math.round(g.rect.y1)}`);

    // ---- is the camera actually STILL after 1.8 s of settling? ---------------------------
    const poses = [];
    for (let i = 0; i < 12; i++) { poses.push(await pose()); await page.waitForTimeout(40); }
    const spread = (k) => Math.max(...poses.map((q) => q[k])) - Math.min(...poses.map((q) => q[k]));
    const dpos = Math.hypot(spread('px'), spread('py'), spread('pz'));
    const dqu = Math.max(spread('qx'), spread('qy'), spread('qz'), spread('qw'));
    const dpl = Math.hypot(spread('plx'), spread('ply'), spread('plz'));
    note(`      camera drift over ${poses[11].frame - poses[0].frame} live frames: pos ${(dpos * 1000).toFixed(3)} mm · quat ${dqu.toExponential(2)} · player pos ${(dpl * 1000).toFixed(3)} mm`);

    await freeze();
    for (const s of SUSPECTS) {
      await disarm();
      await settle(12);
      const a = await page.screenshot({ timeout: 60000 });
      const armed = await arm(s.kind, s.idx ?? 0);
      await settle(8);
      const b = await page.screenshot({ timeout: 60000 });
      await disarm();
      let da, db;
      try { da = decodePng(a); db = decodePng(b); } catch (e) { note(`decode fail ${s.tag}`); continue; }
      const sx = da.width / g.sw, sy = da.height / g.sh;
      const R = { x0: g.rect.x0 * sx, x1: g.rect.x1 * sx, y0: g.rect.y0 * sy, y1: g.rect.y1 * sy };
      const inR = rectDiff(da, db, R);
      const full = rectDiff(da, db, { x0: 0, y0: 0, x1: da.width, y1: da.height });
      note(`${p.arm.padEnd(6)} ${s.tag.padEnd(13)} rect ${inR.movedPct.toFixed(2).padStart(6)}% |Δ| ${inR.mean.toFixed(2).padStart(6)} max ${String(inR.max).padStart(3)}`
        + `  | full ${full.movedPct.toFixed(2).padStart(6)}% |Δ| ${full.mean.toFixed(2).padStart(6)}  (${armed})`);
      if (s.tag === 'control' || s.tag === 'control2') {
        if (inR.mean === 0 && full.mean === 0) pass(`${p.arm}/${s.tag}: the reintroduction base is a still picture`, 'pixel-identical');
        else fail(`${p.arm}/${s.tag}: the reintroduction base is a still picture`, `${full.movedPct.toFixed(3)}% / |Δ| ${full.mean.toFixed(3)} — the rows around it are contaminated`);
      }
    }
    await thaw();
  }
  await thaw();
}
