/**
 * 🚨 **WHY IS A FROZEN SCENE NOT THE SAME PICTURE TWICE?** — the attribution probe behind
 * `jitter-1`. Read `docs/capture-determinism.md` first: that fix is a CAPTURE-MODE property,
 * and every `harness/scenarios/*.mjs` runs through `playtest.mjs`, which boots the LIVE loop.
 * Nothing in the 2026-08-05 work ever covered the live page — which is where every scenario
 * pixel A/B on this project is actually taken.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_jitter1-floor.mjs \
 *        --port 5421 --q "seed=s4&dig=1"
 *
 * ⚠️ **IT MEASURES A DISTRIBUTION, NOT A PAIR, AND THAT IS THE WHOLE POINT.** The first build
 * of this probe took ONE pair per config and read the gallery floor at 1.20% — against the
 * 43-49% `visible-1` reported from the same station. Both numbers are real: the dominant term
 * is INTERMITTENT (a ~1.2 s gust in the practicals' flicker curve, every ~7 s), so a single
 * pair samples a coin flip and reports whichever side it landed on. A floor quoted from one
 * pair is not a floor.
 *
 * So each config takes a BURST of N frames at the scenario's own pair spacing, diffs every
 * consecutive pair, and reports mean / worst. It logs the flicker curve's value at every snap
 * beside the diff so the correlation is visible rather than argued.
 *
 * The ladder (every arm is a runtime poke the render loop re-reads next frame — no source edit,
 * so it is reversible inside one page and `base2` is the control for `base`):
 *
 *   base      exactly as shipped, live
 *   grain0    grade.grain = 0                      (calls-1's claim)
 *   det       pipeline.deterministic = true        (pins the grain PHASE and the AO dither)
 *   sim       the scene's own updaters removed     (flicker, dust, hunter, idle poses)
 *   det+sim   both                                 -> this is the row that has to read 0
 *   base2     everything restored                  -> proves the ladder reverted
 */
import { decodePng } from '../pxdiff.mjs';

/** Mean absolute RGB difference inside a rect, and the fraction of pixels that moved at all. */
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

export default async function jitterFloor({ page, note, pass, fail, skip }) {
  const settle = async (frames = 45) => { for (let i = 0; i < frames; i++) await page.waitForTimeout(40); };
  const BURST = +(process.env.J1_BURST || 12);

  // ---------------------------------------------------------------- pick both stations
  const pick = (wantDig) => page.evaluate((want) => {
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
        const score = sep + (a.dig === want ? 0 : 1000)
          + (a.canMove ? 0 : 100) + (b.canMove ? 0 : 100)
          + (a.id.startsWith('x.') ? 20 : 0) + (b.id.startsWith('x.') ? 20 : 0);
        if (!best || score < best.score) best = { a, b, score };
      }
    }
    if (!best) return null;
    const target = best.a.canMove ? best.a : best.b;
    return { arm: target.dig ? 'damage' : 'scalar', id: target.id };
  }, wantDig);

  const station = (pid, d = 3.0) => page.evaluate(([id, dist]) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    if (!p) return null;
    const n = p.normal;
    const c = p.pointAt(0.5, 0.45);
    e.player.pos.set(c.x + n.x * dist, e.room.floorY, c.z + n.z * dist);
    e.player.vel.set(0, 0, 0);
    e.player.facing = Math.atan2(-n.x, -n.z);
    if (e.cam) { e.cam.yaw = e.player.facing; e.cam.pitch = 0; e.cam._first = true; }
    return { space: e.room.spaceAt(e.player.pos)?.id ?? null };
  }, [pid, d]);

  const rectOf = (pid) => page.evaluate((id) => {
    const e = window.__rrr.engine;
    const p = e.room.panelOf(id);
    const cvs = e.renderer.domElement;
    const sw = cvs.clientWidth, sh = cvs.clientHeight;
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const [u, v] of [[0.03, 0.03], [0.97, 0.03], [0.03, 0.97], [0.97, 0.97]]) {
      const q = p.pointAt(u, v).clone().project(e.camera);
      const x = (q.x * 0.5 + 0.5) * sw, y = (1 - (q.y * 0.5 + 0.5)) * sh;
      minx = Math.min(minx, x); maxx = Math.max(maxx, x);
      miny = Math.min(miny, y); maxy = Math.max(maxy, y);
    }
    return { rect: { x0: minx, x1: maxx, y0: miny, y1: maxy }, sw, sh };
  }, pid);

  const apply = (cfg) => page.evaluate((c) => {
    const e = window.__rrr.engine;
    const w = (window.__j1 ??= {});
    if (!w.saved) {
      w.saved = {
        grain: e.pipeline.grade.grain, det: e.pipeline.deterministic,
        dyn: e.opts.dynamicRes, updaters: e._updaters.slice(),
      };
    }
    const s = w.saved;
    e.pipeline.grade.grain = c.grain0 ? 0 : s.grain;
    e.pipeline.deterministic = c.det ? true : s.det;
    e.opts.dynamicRes = c.dynres ? false : s.dyn;
    e._updaters = c.sim ? [] : s.updaters.slice();
    return { grain: e.pipeline.grade.grain, det: e.pipeline.deterministic,
      updaters: e._updaters.length, scale: +e.pipeline.renderScale.toFixed(3) };
  }, cfg);

  /**
   * The state a snap is a picture OF. `flick` recomputes `fixture-merge.js`'s global flicker
   * curve from the engine clock — the same closed form, so no handle on the rig is needed and
   * the correlation between a big diff and a GUST is readable straight off the log.
   */
  const simState = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    const t = e.elapsed;
    const a = Math.sin(t * 5.3) * 0.5 + Math.sin(t * 11.7 + 2.1) * 0.28 + Math.sin(t * 23.1 + 3.7) * 0.14;
    const gust = Math.max(0, Math.sin(t * 0.9 + 1.3) - 0.86) * 6.0;
    return { frame: e.frame, t: +t.toFixed(3), scale: +e.pipeline.renderScale.toFixed(3),
      flick: +(1 + a * 0.085 - gust * 0.22).toFixed(4), gust: +gust.toFixed(4) };
  });

  const CFGS = [
    { tag: 'base', cfg: {} },
    { tag: 'grain0', cfg: { grain0: 1 } },
    { tag: 'det', cfg: { det: 1 } },
    { tag: 'sim', cfg: { sim: 1 } },
    { tag: 'det+sim', cfg: { det: 1, sim: 1 } },
    { tag: 'base2', cfg: {} },
  ];

  const table = {};
  const upd = await page.evaluate(() => window.__rrr.engine._updaters.length);
  note(`${upd} scene updaters registered`);

  for (const want of [true, false]) {
    const p = await pick(want);
    if (!p) { skip(`a ${want ? 'damage' : 'scalar'} pair exists`, 'no pair found'); continue; }
    const st = await station(p.id);
    await settle(45);
    const g = await rectOf(p.id);
    note(`--- ${p.arm} arm · ${p.id} · space ${st?.space} · rect ${Math.round(g.rect.x0)},${Math.round(g.rect.y0)}..${Math.round(g.rect.x1)},${Math.round(g.rect.y1)}`);

    for (const { tag, cfg } of CFGS) {
      await apply(cfg);
      await settle(20);
      const shots = [], states = [];
      for (let i = 0; i < BURST; i++) {
        states.push(await simState());
        shots.push(await page.screenshot({ timeout: 60000 }));
        if (i < BURST - 1) await settle(8);
      }
      let dec;
      try { dec = shots.map(decodePng); } catch (err) {
        note(`${p.arm}/${tag}: decode failed ${String(err).slice(0, 60)}`); continue;
      }
      const sx = dec[0].width / g.sw, sy = dec[0].height / g.sh;
      const R = { x0: g.rect.x0 * sx, x1: g.rect.x1 * sx, y0: g.rect.y0 * sy, y1: g.rect.y1 * sy };
      const pairs = [];
      for (let i = 1; i < dec.length; i++) {
        const d = rectDiff(dec[i - 1], dec[i], R);
        pairs.push({ ...d, dflick: +(states[i].flick - states[i - 1].flick).toFixed(4),
          gust: Math.max(states[i - 1].gust, states[i].gust) });
      }
      const mv = pairs.map((x) => x.movedPct), mn = pairs.map((x) => x.mean);
      const worst = pairs.reduce((a, b) => (b.movedPct > a.movedPct ? b : a));
      const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
      table[`${p.arm}/${tag}`] = {
        meanMoved: avg(mv), maxMoved: Math.max(...mv), meanMean: avg(mn), maxMean: Math.max(...mn),
        worst, n: pairs.length,
      };
      note(`${p.arm.padEnd(6)} ${tag.padEnd(8)} n=${pairs.length}  moved% mean ${avg(mv).toFixed(2).padStart(6)} worst ${Math.max(...mv).toFixed(2).padStart(6)}`
        + `  |Δ| mean ${avg(mn).toFixed(2).padStart(5)} worst ${Math.max(...mn).toFixed(2).padStart(5)}`
        + `  (worst pair: dflick ${worst.dflick} gust ${worst.gust.toFixed(2)} max ${worst.max})`);
      note(`         per-pair moved%: ${mv.map((x) => x.toFixed(1)).join(' ')}`);
      note(`         per-pair dflick: ${pairs.map((x) => x.dflick.toFixed(3)).join(' ')}`);
    }
  }

  // ---------------------------------------------------------------- verdicts
  for (const arm of ['damage', 'scalar']) {
    const base = table[`${arm}/base`], all = table[`${arm}/det+sim`], base2 = table[`${arm}/base2`];
    if (!base || !all) { skip(`${arm}: the ladder ran`, 'a row is missing'); continue; }
    if (all.maxMoved < 0.05 && all.maxMean < 0.5) {
      pass(`${arm}: pinning the dithers AND the clock is a still picture`,
        `worst of ${all.n} pairs ${all.maxMoved.toFixed(3)}% moved, |Δ| ${all.maxMean.toFixed(3)} — base was ${base.meanMoved.toFixed(2)}% mean / ${base.maxMoved.toFixed(2)}% worst`);
    } else {
      fail(`${arm}: pinning the dithers AND the clock is a still picture`,
        `worst of ${all.n} pairs still ${all.maxMoved.toFixed(3)}% moved, |Δ| ${all.maxMean.toFixed(3)} — something outside the ladder animates`);
    }
    if (base2) {
      note(`${arm}: base ${base.meanMoved.toFixed(2)}%/${base.maxMoved.toFixed(2)}% vs base2 ${base2.meanMoved.toFixed(2)}%/${base2.maxMoved.toFixed(2)}% — the ladder's own revert control`);
    }
  }
}
