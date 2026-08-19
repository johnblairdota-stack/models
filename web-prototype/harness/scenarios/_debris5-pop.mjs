/**
 * 🔬 **WHICH SLABS ARE THE FLAT ONES? — the population `debris-floor.mjs`'s rest-angle gate reads.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_debris5-pop.mjs \
 *        --port 5382 --q "seed=s4"
 *
 * `harness/_debris4-angles.mjs` reads 4-11% of resting slabs within 10 deg of flat over a
 * synthetic dig at one spot; `debris-floor.mjs`'s gate reads 33% on the live build. Same
 * statistic, same pool, same formula — so the two are looking at different POPULATIONS, and
 * this says which pieces the difference is made of.
 *
 * It replays `debris-floor.mjs`'s drive verbatim (same setup, same plan, same cadence, same
 * [B] + 90 blows, same three-plate drop) and censuses the slab pool at three checkpoints,
 * breaking every resting slab down by the two terms the rest maths actually has:
 *
 *   - does it carry a wall plane at all (`wnx`/`wnz`), and how far from it did it come to rest
 *     (`dw`) — the lean is gated on `dw < 0.34` and fades to nothing at 0.34;
 *   - how much rubble was under it when it settled (`onPile`).
 *
 * ⚠️ Diagnostic. No pass/fail — it prints tables. The gate is `debris-floor.mjs`.
 */

import fs from 'node:fs';

const BLOWS = Number(process.env.DEBRIS_BLOWS ?? 63);
const CADENCE = Number(process.env.DEBRIS_CADENCE ?? 950);
const ROOMS = (process.env.DEBRIS_ROOMS ?? 'gallery.mid,gallery.west,gallery.east,service.mid').split(',');
/**
 * 🎯 **THE POSITIVE CONTROL.** `_debris4-angles.mjs`'s own ablation, live: strip the wall plane
 * off every piece still in flight so the `dw < 0.34` lean can never fire. A candidate gate
 * population is only worth anything if it still reads BADLY under this — otherwise it is a
 * population chosen to pass rather than a population that measures the heap.
 */
const NOLEAN = process.env.DEBRIS_NOLEAN === '1';
const DUMP = process.env.DEBRIS_DUMP ?? null;

/** `debris-floor.mjs`'s blow plan, copied verbatim so the population is the same one. */
function plan(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / Math.max(1, n - 1);
    const spread = 1 - 0.45 * t;
    out.push([
      Math.sin(i * 2.399) * 0.13 * spread,
      (Math.sin(i * 1.017) * 0.5 + (t - 0.5) * 0.35) * 0.30 * spread,
    ]);
  }
  return out;
}

export default async function debrisPop({ page, note, pass, skip }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(400);

  const setup = await page.evaluate((rooms) => {
    const e = window.__rrr.engine, p = e.player, room = e.room;
    if (!e.debris) return { ok: false, why: 'engine.debris is not exposed on this build' };
    if (e.hunter) {
      e.hunter.update = () => {};
      if (room.spawn?.hunter) e.hunter.root.position.copy(room.spawn.hunter);
      e.hunter.state = 'PATROL'; e.hunter.target = null; e.hunter.awareness = 0;
    }
    const NEAR = 1.15, FAR = 2.8, IDEAL = 1.7;
    let best = null;
    for (const name of rooms) {
      const v = room.anchor?.(name);
      if (!v) continue;
      const from = v.clone(); from.y += p.eyeHeight;
      for (let i = 0; i < 64; i++) {
        const yaw = (i / 64) * Math.PI * 2;
        const dir = v.clone().set(Math.sin(yaw), 0, Math.cos(yaw));
        const hit = room.castRay?.(from, dir, FAR, { forDamage: true });
        if (!hit?.panel || !hit.panel.spec?.dig) continue;
        if ((hit.panel.field?.maxDepth ?? 0) > 0.01) continue;
        if (hit.distance < NEAR) continue;
        const score = Math.abs(hit.distance - IDEAL);
        if (!best || score < best.score) best = { name, v, yaw, d: hit.distance, score, id: hit.panel.id };
      }
      if (best) break;
    }
    if (!best) return { ok: false, why: 'no fresh dig face at a workable standoff' };
    p.pos.copy(best.v); p.vel.set(0, 0, 0);
    p.aimYaw = best.yaw; p.facing = best.yaw;
    if (e.cam) { e.cam.yaw = best.yaw; e.cam.pitch = 0.02; e.cam._first = true; }
    const panel = room.panelOf(best.id);

    /**
     * 🔬 **THE CENSUS, INSTALLED ONCE AND CALLED AT EVERY CHECKPOINT.** Every resting slab, with
     * the two inputs the rest maths took: its distance from its own wall plane and the pile
     * height it landed on (`_pileAt` minus the piece's own banked contribution `pdh`).
     */
    window.__pop = (panelId) => {
      const eng = window.__rrr.engine, d = eng.debris;
      const q = eng.room.panelOf(panelId);
      const n = q.normal, c = q.pointAt(0.5, 0.5);
      const tx = n.z, tz = -n.x;
      const p2 = d.pools.slab;
      const rest0 = p2.def.restRot[0], rest1 = p2.def.restRot[1];
      const rows = [];
      for (let i = 0; i < p2.per; i++) {
        if (!p2.alive[i] || !p2.rest[i]) continue;
        const hasPlane = (p2.wnx[i] !== 0 || p2.wnz[i] !== 0) ? 1 : 0;
        const dw = hasPlane ? p2.wnx[i] * p2.px[i] + p2.wnz[i] * p2.pz[i] - p2.wd[i] : null;
        const hHere = d._pileAt(p2.px[i], p2.pz[i]);
        const dx = p2.px[i] - c.x, dz = p2.pz[i] - c.z;
        rows.push({
          i,
          tilt: Math.hypot(p2.rx[i] - rest0, p2.rz[i] - rest1),
          hasPlane, dw,
          hUnder: hHere - p2.pdh[i],          // what it landed ON, not counting its own bulk
          big: p2.big[i],
          out: dx * n.x + dz * n.z,           // metres out from the face
          along: dx * tx + dz * tz,           // metres along the face from its centre
          away: Math.hypot(dx, dz),           // straight-line distance from the dug face's centre
          sc: p2.sc[i],
        });
      }
      return rows;
    };
    return {
      ok: true, anchor: best.name, panel: best.id, standoff: +best.d.toFixed(2),
      per: e.debris.pools.slab.per,
      quality: e.quality?.particles ?? null,
    };
  }, ROOMS);

  if (!setup.ok) { skip('the population can be read', setup.why); return; }
  note(`station ${setup.anchor} · panel ${setup.panel} · standoff ${setup.standoff} m`
    + ` · slab pool ${setup.per} · quality.particles ${setup.quality}${NOLEAN ? ' · ⚠️ NO-LEAN ARM' : ''}`);

  if (NOLEAN) {
    await page.evaluate(() => {
      const d = window.__rrr.engine.debris;
      const upd = d.update.bind(d);
      d.update = (dt) => {
        for (const kk in d.pools) {
          const p = d.pools[kk];
          for (let i = 0; i < p.per; i++) if (!p.rest[i]) { p.wnx[i] = 0; p.wnz[i] = 0; }
        }
        upd(dt);
      };
    });
  }
  const dump = {};

  // ---- the report ---------------------------------------------------------------------------
  const report = async (label, tag) => {
    const rows = await page.evaluate((id) => window.__pop(id), setup.panel);
    if (tag) dump[tag] = rows;
    if (!rows.length) { note(`${label}: no resting slab`); return null; }
    const FLAT = 0.175;
    const f = (xs) => xs.length ? (xs.filter((r) => r.tilt < FLAT).length / xs.length) : 0;
    const pct = (x) => `${(x * 100).toFixed(0)}%`;
    const stat = (xs) => {
      if (!xs.length) return '     —          ';
      const t = xs.map((r) => r.tilt).sort((a, b) => a - b);
      const mean = t.reduce((a, b) => a + b, 0) / t.length;
      return `n=${String(t.length).padStart(4)}  mean ${mean.toFixed(3)}  p90 ${t[Math.floor(0.9 * t.length)].toFixed(3)}  flat ${pct(f(xs)).padStart(4)}`;
    };
    note(`── ${label} ──`);
    note(`   ALL                              ${stat(rows)}`);
    // 1. does the piece carry a wall plane at all?
    note(`   no wall plane (wnx=wnz=0)        ${stat(rows.filter((r) => !r.hasPlane))}`);
    note(`   has a wall plane                 ${stat(rows.filter((r) => r.hasPlane))}`);
    // 2. of those that do: inside vs outside the lean's 0.34 m reach
    const wp = rows.filter((r) => r.hasPlane);
    note(`      dw < 0.34 (lean applies)      ${stat(wp.filter((r) => r.dw < 0.34))}`);
    note(`      dw >= 0.34 (no lean)          ${stat(wp.filter((r) => r.dw >= 0.34))}`);
    // 3. the pile term
    note(`   landed on bare floor (h<0.05)    ${stat(rows.filter((r) => r.hUnder < 0.05))}`);
    note(`   landed on rubble    (h>=0.05)    ${stat(rows.filter((r) => r.hUnder >= 0.05))}`);
    // 4. is the flat population even at this face?
    note(`   within 3 m of the dug face       ${stat(rows.filter((r) => r.away < 3))}`);
    note(`   further than 3 m away            ${stat(rows.filter((r) => r.away >= 3))}`);
    // where the flat ones actually are
    const flats = rows.filter((r) => r.tilt < FLAT);
    const q = (xs, k) => {
      if (!xs.length) return '—';
      const s = xs.map((r) => r[k]).filter((v) => v !== null).sort((a, b) => a - b);
      return s.length ? `${s[0].toFixed(2)}/${s[Math.floor(s.length / 2)].toFixed(2)}/${s[s.length - 1].toFixed(2)}` : '—';
    };
    note(`   FLAT pieces (${flats.length}): dw min/med/max ${q(flats, 'dw')}`
      + ` · hUnder ${q(flats, 'hUnder')} · out ${q(flats, 'out')} · away ${q(flats, 'away')}`
      + ` · ${flats.filter((r) => !r.hasPlane).length} carry no wall plane · ${flats.filter((r) => r.big).length} big`);
    const outBand = [];
    for (let b = 0; b < 8; b++) {
      const xs = rows.filter((r) => r.out >= b * 0.25 && r.out < (b + 1) * 0.25);
      if (xs.length) outBand.push(`${(b * 0.25).toFixed(2)}m:${xs.length}/${pct(f(xs))}`);
    }
    note(`   flat share by distance out from the face: ${outBand.join(' · ')}`);
    /**
     * 🎯 **CANDIDATE GATE POPULATIONS.** "The heap rests at every angle" is a claim about the
     * HEAP — pieces leaning on each other or on the face they came out of. A chip that skittered
     * two metres onto open floor is not in the heap and lying flat is its correct rest pose.
     */
    note(`   CAND drift  (h>=0.05 or dw<0.34)   ${stat(rows.filter((r) => r.hUnder >= 0.05 || (r.hasPlane && r.dw < 0.34)))}`);
    note(`   CAND out<0.50 m from the face     ${stat(rows.filter((r) => r.out < 0.50))}`);
    note(`   CAND out<0.75 m from the face     ${stat(rows.filter((r) => r.out < 0.75))}`);
    return rows;
  };

  await page.waitForTimeout(500);
  await report('T0 · before any blow (warm-up residue, if any survived the sweep)', 't0');

  // ---- phase 1: the dig ---------------------------------------------------------------------
  const PLAN = plan(BLOWS);
  for (let i = 0; i < PLAN.length; i++) {
    await page.evaluate(([id, du, dv]) => {
      const q = window.__rrr.engine.room.panelOf(id);
      q.applyHit(q.pointAt(0.5 + du, 0.5 + dv), 1);
    }, [setup.panel, PLAN[i][0], PLAN[i][1]]);
    await page.waitForTimeout(CADENCE);
  }
  await page.waitForTimeout(2500);
  await report(`T1 · after ${BLOWS} blows at ${CADENCE} ms — this is the state _debris4-angles models`, 't1');

  // ---- phase 2: [B] and 90 fast blows at the shallowest cell --------------------------------
  await page.keyboard.press('KeyB');
  await page.waitForTimeout(250);
  let opened = null;
  for (let i = 0; i < 90 && !opened; i++) {
    const r = await page.evaluate((id) => {
      const q = window.__rrr.engine.room.panelOf(id);
      const g = q.field;
      const cy1 = Math.min(g.rows - 1, Math.ceil(1.95 / g.cellH));
      const cx0 = Math.max(0, Math.round(g.cols * 0.5) - Math.ceil(0.45 / g.cellW));
      const cx1 = Math.min(g.cols - 1, Math.round(g.cols * 0.5) + Math.ceil(0.45 / g.cellW));
      let bx = cx0, by = 0, bd = 2;
      for (let cy = 0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const dd = g.depth[g.idx(cx, cy)];
          if (dd < bd) { bd = dd; bx = cx; by = cy; }
        }
      }
      q.applyHit(q.pointAt((bx + 0.5) / g.cols, (by + 0.5) / g.rows), 1);
      return { passable: !!q.passable?.(), by, bx, bd: +bd.toFixed(3) };
    }, setup.panel);
    if (r.passable) opened = i + 1;
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(2200);
  note(opened ? `[B] then ${opened} more blows -> passable` : '[B] + 90 blows and the face never opened');
  await report('T2 · after [B] + the fast blows — the state the GATE reads', 't2');

  // ---- the three-plate drop the gate does just before it measures ---------------------------
  const drop = await page.evaluate((s) => {
    const e = window.__rrr.engine;
    const panel = e.room.panelOf(s.panel);
    if (typeof e.debris.chunk !== 'function') return { ok: false };
    const n = panel.normal;
    for (let k = 0; k < 3; k++) {
      e.debris.chunk('slab', panel.pointAt(0.34 + k * 0.16, 0.74 - k * 0.06),
        { w: 0.58, h: 0.44, t: 0.12, normal: n });
    }
    return { ok: true };
  }, setup);
  await page.waitForTimeout(3200);
  if (drop.ok) await report('T3 · plus the three dropped plates — exactly what the gate measures', 't3');

  if (DUMP) { fs.writeFileSync(DUMP, JSON.stringify(dump)); note(`raw rows written to ${DUMP}`); }
  pass('the population is on the record', 'see the tables above');
}
