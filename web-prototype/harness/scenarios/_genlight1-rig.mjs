#!/usr/bin/env node
/**
 * _genlight1-rig.mjs — DOES A GENERATED ROOM HAVE A LIGHT IN IT?
 *
 * `genlight-1`, 2026-08-15. The gate for `src/world/genplan.js`'s light rig.
 *
 *   node harness/scenarios/_genlight1-rig.mjs --derive
 *       Pure node, no browser. Re-fits the rig's constants from `spaces.js`'s six AUTHORED
 *       entries and checks `genplan.js`'s emitted rig against them. This is the arm that says
 *       whether the numbers in `genplan.js` are still a fit to John's own rigs or have drifted
 *       into being a taste call somebody made up.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_genlight1-rig.mjs \
 *        --port 5510 --q "plan=gen&planseed=0"
 *       The browser arm: park in every generated space, read the LIVE lights out of the built
 *       scene, and require them to be in the room the player is standing in.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 WHAT IT REFUSES TO DO, AND WHY THAT IS THE WHOLE POINT
 * ---------------------------------------------------------------------------------------------
 * HANDOFF: *"an instrument that re-derives the thing it measures will agree with it."* This file
 * never recomputes a rig. Every browser assertion below reads `THREE.SpotLight.position` and
 * `PointLight.position` off `engine.scene` **after** `makeLightRig` has driven them — the light
 * the GPU is about to use — and compares it against `engine.room.spaces`' own rectangle. If
 * `genplan.js` and `views/game.js` ever disagree about the shape of a `lights` entry, the numbers
 * here go red; a probe that read `genplan.js`'s output instead would happily agree with itself.
 *
 * 🚨 EVERY ASSERTION SHIPS A CONTROL THAT MUST FAIL, ON EVERY RUN.
 *   C1  REINTRODUCTION, IN PLACE. Every space's `lights` is replaced with an ORIGIN RIG — key,
 *       both points and the cool at (0,0,0) with the constructor intensities — which is exactly
 *       the state the pre-2026-08-15 build produced, for the reason in `genplan.js`'s header
 *       (`makeLightRig.read()` early-returns on a space with no `lights`, and its targets are
 *       bare `new THREE.Vector3()`). A1/A2 must go RED, then GREEN again on restore.
 *   C2  UNRESOLVABLE STATION. The player is parked 500 m outside the envelope. `spaceAt` returns
 *       null, and the run must report UNRESOLVED — never a lit/unlit verdict. "This room is lit"
 *       and "I could not resolve this room" have to be distinguishable, which is the failure
 *       class that has cost this project sixteen instruments.
 *   C3  THE PERF CLAIM IS A DIFFERENCE, NOT A LEVEL. Draw calls and `renderer.info.programs`
 *       are read at ONE parked station and the rig is flipped IN PLACE (never across a walk —
 *       `ballroom.centre` read 423/461/479 on one build). If C1's flip moved neither counter,
 *       the zero is only worth anything because C1 proves the flip really changed the scene.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

// =================================================================================================
// --derive : pure node. Re-fit the constants and check the emitted rig against the authored ones.
// =================================================================================================

const fit = {
  KEY_E: 11.0, KEY_DECAY: 1.40, KEY_Y_FRAC: 0.86, KEY_RUN_MAX: 12.0, KEY_AT_Y: 1.75,
};

async function derive() {
  const s = (p) => pathToFileURL(path.join(ROOT, 'src', p)).href;
  const SP = await import(s('game/spaces.js'));
  const d3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  // Every authored rig, room-library and plan-slot alike. `study` carries none on the type; both
  // study SLOTS supply their own, which is `spaces.js`'s own "a rig is not a room-type fact".
  const authored = [];
  for (const [type, def] of Object.entries(SP.ROOMS)) {
    if (def.lights?.key) authored.push({ name: type, def, L: def.lights });
  }
  for (const slot of SP.HOUSE_PLAN) {
    if (slot.lights?.key) authored.push({ name: slot.id, def: SP.ROOMS[slot.room], L: slot.lights });
  }

  console.log(`\n_genlight1-rig --derive — ${authored.length} authored key rigs in spaces.js\n`);
  console.log('  room        w      d   storey | keyY/st |  run   throw  decay  int |    E    | angle');
  const Es = [], yf = [], decs = [], runs = [];
  for (const { name, def, L } of authored) {
    const k = L.key;
    const thr = d3(k.pos, k.at);
    const run = Math.hypot(k.pos[0] - k.at[0], k.pos[2] - k.at[2]);
    const dec = k.decay ?? 2;
    const E = k.intensity / Math.pow(thr, dec);
    const long = Math.max(def.w, def.d);
    Es.push(E); yf.push(k.pos[1] / def.storey); decs.push(dec); runs.push(run / long);
    console.log(`  ${name.padEnd(9)} ${def.w.toFixed(2).padStart(6)} ${def.d.toFixed(2).padStart(6)}`
      + ` ${def.storey.toFixed(2).padStart(6)} |  ${(k.pos[1] / def.storey).toFixed(3)} |`
      + ` ${run.toFixed(2).padStart(5)} ${thr.toFixed(2).padStart(6)} ${dec.toFixed(2)} ${String(k.intensity).padStart(4)} |`
      + ` ${E.toFixed(2).padStart(6)}  | ${k.angle.toFixed(2)}   run/long ${(run / long).toFixed(2)}`);
  }
  const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
  const span = (a) => [Math.min(...a), Math.max(...a)];
  console.log(`\n  fitted:  E median ${med(Es).toFixed(2)} (spread ${span(Es)[0].toFixed(2)}–${span(Es)[1].toFixed(2)})`
    + ` · keyY/storey median ${med(yf).toFixed(3)} · decay median ${med(decs).toFixed(2)}`
    + ` (spread ${span(decs)[0].toFixed(2)}–${span(decs)[1].toFixed(2)})`);

  const D = [];
  const near = (a, b, tol) => Math.abs(a - b) <= tol;
  const within = (v, [lo, hi]) => v >= lo && v <= hi;
  D.push(['D1 KEY_E is the authored median irradiance', near(fit.KEY_E, med(Es), 0.6),
    `file ${fit.KEY_E}  authored median ${med(Es).toFixed(2)}  tol 0.6`]);
  D.push(['D2 KEY_Y_FRAC is the authored median height fraction', near(fit.KEY_Y_FRAC, med(yf), 0.02),
    `file ${fit.KEY_Y_FRAC}  authored median ${med(yf).toFixed(3)}  tol 0.02`]);
  /**
   * ⚠️ **THIS CHECK USED TO ASSERT "KEY_DECAY IS THE AUTHORED MEDIAN" AND IT WENT RED ON ITS
   * FIRST RUN — CORRECTLY.** The median over the SIX rigs is 1.50 (both study slots carry 1.50,
   * so they outvote), not the 1.35 in the file. The claim was wrong, not the constant: with `E`
   * fixed the two are not independent, and the thing that actually matters is how close the rule
   * lands to the six authored INTENSITIES. So this is now a sweep with an argmin, which is a
   * falsifiable statement about the shipped value rather than a coincidence.
   */
  // ⚠️ Built by importing `genplan.js` and asking it for a plan whose rooms are the authored
  // shapes — the generator's library IS the authored library (`genspike.mjs` lines 162-166), so
  // every generated room is one of these five footprints and the comparison is like for like.
  // ⚠️ `genplan.js` is already loaded (spaces.js imports it) with no `location`, i.e. on the
  // SHIPPED defaults — `gendoors` shut, `genlight` on. Calling `generatedTables` directly is the
  // default arm, which is the arm this fit is about.
  const GP = await import(s('world/genplan.js'));
  const gen = GP.generatedTables(0, {});
  const byType = new Map();
  for (const row of gen.spaces) {
    const m = /^r\d+\.(\w+)$/.exec(row.id);
    if (m && !byType.has(m[1])) byType.set(m[1], row);
  }
  console.log('\n  the RULE against the authored rigs, on the SAME footprint:');
  console.log('  room        authored int   rule int    ratio | authored angle  rule angle   rule throw');
  const ratios = [];
  const pairs = [];                       // { throw, authored intensity } for the decay sweep
  for (const { name, def, L } of authored) {
    const type = SP.ROOMS[name] ? name : (name.startsWith('study') ? 'study' : name);
    const row = byType.get(type);
    if (!row?.lights?.key) { console.log(`  ${name.padEnd(9)} (no generated room of this type on seed 0)`); continue; }
    const g = row.lights.key, a = L.key;
    const ratio = g.intensity / a.intensity;
    ratios.push(ratio);
    pairs.push({ thr: row.lights.genlight.throw, i: a.intensity });
    console.log(`  ${name.padEnd(9)} ${String(a.intensity).padStart(11)} ${String(g.intensity).padStart(10)}`
      + ` ${ratio.toFixed(2).padStart(8)} | ${a.angle.toFixed(2).padStart(14)} ${g.angle.toFixed(2).padStart(11)}`
      + ` ${row.lights.genlight.throw.toFixed(2).padStart(11)}`);
  }
  const worst = ratios.length ? Math.max(...ratios.map((r) => Math.max(r, 1 / r))) : Infinity;
  D.push(['D4 the rule lands within 2x of every authored key intensity', worst <= 2.0,
    `worst ratio ${worst.toFixed(2)} over ${ratios.length} rooms`]);

  /**
   * D3 — the decay sweep. `throw` is read off the rule's OWN emitted diagnostic, so this asks
   * "what would the shipped rule have produced at a different decay", not "what do I think it
   * does". Nothing here re-implements the rule; only the one scalar `E · throw^decay` is varied.
   */
  console.log('\n  decay sweep (E fixed at the file value, rule throws held):');
  const sweep = [];
  for (let d = 1.20; d <= 1.651; d += 0.05) {
    const dd = Math.round(d * 100) / 100;
    const w = Math.max(...pairs.map(({ thr, i }) => {
      const r = Math.round(fit.KEY_E * Math.pow(thr, dd)) / i;
      return Math.max(r, 1 / r);
    }));
    sweep.push({ d: dd, w });
    console.log(`    decay ${dd.toFixed(2)}  worst intensity ratio ${w.toFixed(2)}`
      + (dd === fit.KEY_DECAY ? '   <- shipped' : ''));
  }
  const argmin = sweep.reduce((a, b) => (b.w < a.w ? b : a));
  D.push(['D3 KEY_DECAY is the argmin of the fit sweep', Math.abs(argmin.d - fit.KEY_DECAY) < 1e-9,
    `shipped ${fit.KEY_DECAY} (worst ${sweep.find((x) => x.d === fit.KEY_DECAY)?.w.toFixed(2)})`
    + `  argmin ${argmin.d} (worst ${argmin.w.toFixed(2)})`
    + `  · authored decays span ${span(decs)[0].toFixed(2)}–${span(decs)[1].toFixed(2)}`]);
  D.push(['D3b KEY_DECAY and KEY_E are inside the authored spread',
    within(fit.KEY_DECAY, span(decs)) && within(fit.KEY_E, span(Es)),
    `decay ${fit.KEY_DECAY} in [${span(decs)[0].toFixed(2)}, ${span(decs)[1].toFixed(2)}]`
    + ` · E ${fit.KEY_E} in [${span(Es)[0].toFixed(2)}, ${span(Es)[1].toFixed(2)}]`]);

  // D5 — THE CONTROL THAT MUST FAIL. Feed the rule a room 100x too big and require the fit test
  // above to REJECT it. Without this, D4 is satisfied by any rule that returns the right order of
  // magnitude for anything, including a constant.
  const fake = { id: 'fake', x0: 0, x1: 2720, z0: 0, z1: 670, storey: 560 };
  const fakeRig = GP.__genlightRigFor?.(fake, null) ?? null;
  const ctlOk = fakeRig ? (fakeRig.key.intensity / 265 > 2.0) : null;
  D.push(['D5 CONTROL — a 100x room must NOT pass the 2x fit', ctlOk === true,
    fakeRig ? `100x gallery -> intensity ${fakeRig.key.intensity} vs authored 265, ratio ${(fakeRig.key.intensity / 265).toFixed(1)}`
      : 'genplan.js does not export __genlightRigFor — CONTROL COULD NOT RUN']);

  /**
   * D6 — 16 seeds of geometry, and D7 the refusal. `--derive` is the cheap arm (no browser), so
   * it is the right place to ask the question the browser arm can only ask 18 rows of: does EVERY
   * emitted rig stand inside its own room, on every seed?
   */
  let nrows = 0, nbad = 0, coolCentre = 0, noRig = 0;
  let iLo = Infinity, iHi = -Infinity, aLo = Infinity, aHi = -Infinity, pLo = Infinity, pHi = -Infinity;
  const probs = [];
  for (let seed = 0; seed < 16; seed++) {
    for (const r of GP.generatedTables(seed, {}).spaces) {
      nrows++;
      const Lg = r.lights;
      if (!Lg) { noRig++; probs.push(`seed ${seed} ${r.id}: no rig emitted`); continue; }
      const k = Lg.key;
      const okPos = k.pos[0] >= r.x0 - 1e-6 && k.pos[0] <= r.x1 + 1e-6
        && k.pos[2] >= r.z0 - 1e-6 && k.pos[2] <= r.z1 + 1e-6
        && k.pos[1] > 0 && k.pos[1] < r.storey
        && k.at[0] >= r.x0 - 1e-6 && k.at[0] <= r.x1 + 1e-6
        && k.at[2] >= r.z0 - 1e-6 && k.at[2] <= r.z1 + 1e-6
        && Number.isFinite(k.intensity) && k.intensity > 0;
      if (!okPos) { nbad++; probs.push(`seed ${seed} ${r.id}: pos ${k.pos} at ${k.at} i ${k.intensity}`); }
      if (Lg.genlight.coolAt === 'centre') coolCentre++;
      iLo = Math.min(iLo, k.intensity); iHi = Math.max(iHi, k.intensity);
      aLo = Math.min(aLo, k.angle); aHi = Math.max(aHi, k.angle);
      for (const w of Lg.warm) { pLo = Math.min(pLo, w.intensity); pHi = Math.max(pHi, w.intensity); }
    }
  }
  console.log(`\n  16 seeds · ${nrows} rows · ${nbad} outside their own room · ${noRig} with no rig`
    + ` · ${coolCentre} whose cool fell back to the room centre (no door resolved)`);
  console.log(`  key intensity ${iLo}–${iHi} (authored 165–560) · cone ${aLo}–${aHi} (authored 0.30–0.86)`
    + ` · point intensity ${pLo}–${pHi} (authored 11–46)`);
  for (const p of probs.slice(0, 8)) console.log('    ' + p);
  D.push(['D6 every emitted key stands inside its own room, 16 seeds', nbad === 0 && noRig === 0,
    `${nrows - nbad - noRig}/${nrows} rows`]);
  D.push(['D6b every point intensity is inside the authored 11–46', pLo >= 11 && pHi <= 46,
    `${pLo}–${pHi}`]);
  /**
   * 🚨 **D7 IS THE CONTROL THAT FOUND A REAL BUG IN THE RULE ON ITS FIRST RUN.** Handed a
   * zero-extent zero-storey rect, `lightRigFor` used to return `intensity 13, keyY −0.40` — a
   * plausible rig with its key below the floor, i.e. a result-shaped output instead of an error.
   * It now returns `null` and the row carries no `lights`, which D6 counts.
   */
  const refused = GP.__genlightRigFor?.({ id: 'x', x0: 0, x1: 0, z0: 0, z1: 0, storey: 0 }, null);
  D.push(['D7 CONTROL a room that cannot exist is REFUSED', refused === null,
    refused === null ? 'zero-extent zero-storey rect -> null'
      : `returned a rig: intensity ${refused?.key?.intensity}, keyY ${refused?.key?.pos?.[1]}`]);

  console.log('');
  let bad = 0;
  for (const [n, ok, why] of D) {
    if (!ok) bad++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n.padEnd(52)} ${why}`);
  }
  console.log(`\n  ${D.length - bad}/${D.length}\n`);
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  if (process.argv.includes('--derive')) await derive();
  else { console.error('usage: --derive, or run through playtest.mjs --script'); process.exit(2); }
}

// =================================================================================================
// the browser arm
// =================================================================================================

/** The origin rig — the pre-2026-08-15 state, reproduced exactly, in place. See C1. */
const ORIGIN_RIG = {
  key: { pos: [0, 0, 0], at: [0, 0, 0], color: 0xffdcb4, intensity: 150, angle: 0.88, penumbra: 0.62, dist: 34, decay: 1.6 },
  warm: [
    { pos: [0, 0, 0], color: 0xffb271, intensity: 18, dist: 13, decay: 2 },
    { pos: [0, 0, 0], color: 0x6f8fbe, intensity: 42, dist: 24, decay: 2 },
  ],
  cool: { pos: [0, 0, 0], color: 0xa8ccf4, intensity: 46, dist: 10 },
  up: 0x3a2a1c,
};

export default async function rigScenario({ page, snap, pass, fail, skip, note, SHOTDIR }) {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const { hold, release } = await import('../still.mjs');

  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 200; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  // ---- the house we are standing in -----------------------------------------------------------
  const head = await page.evaluate(() => {
    const e = window.__rrr.engine;
    return {
      spaces: e.room.spaces.map((s) => ({
        id: s.id, name: s.name, x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1,
        storey: s.storey, hasLights: !!s.lights,
        coolAt: s.lights?.genlight?.coolAt ?? null,
      })),
      gen: !!window.__rrr.engine.room.spaces.some((s) => /^(r\d+\.|c\d+\.)/.test(s.id)),
    };
  });
  if (!head.gen) {
    skip('a GENERATED house is under test', 'the space ids are not generated — pass --q "plan=gen&planseed=N"');
    return;
  }
  const withRig = head.spaces.filter((s) => s.hasLights).length;
  note(`${head.spaces.length} generated spaces · ${withRig} carry a \`lights\` entry`
    + ` · cool placed past a door in ${head.spaces.filter((s) => s.coolAt === 'door').length}`
    + `, at the room centre in ${head.spaces.filter((s) => s.coolAt === 'centre').length}`);

  /**
   * Read the LIVE lights out of the built scene — never out of `genplan.js`.
   * `makeLightRig` names nothing, so the lights are identified by type and construction order:
   * one SpotLight (the key, the only shadow caster), three PointLights, one HemisphereLight.
   */
  const readLights = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    const out = { spot: null, points: [], hemi: null, pointLightCount: 0 };
    e.scene.traverse((o) => {
      if (!o.isLight) return;
      const p = o.position;
      if (o.isSpotLight) {
        out.spot = { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3),
          i: +o.intensity.toFixed(1), angle: +o.angle.toFixed(3), dist: o.distance,
          decay: o.decay, hex: o.color.getHexString(),
          at: { x: +o.target.position.x.toFixed(3), y: +o.target.position.y.toFixed(3), z: +o.target.position.z.toFixed(3) } };
      } else if (o.isPointLight) {
        out.pointLightCount++;
        out.points.push({ x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3),
          i: +o.intensity.toFixed(1), dist: o.distance, decay: o.decay, hex: o.color.getHexString() });
      } else if (o.isHemisphereLight) {
        out.hemi = { ground: o.groundColor.getHexString(), sky: o.color.getHexString(), i: o.intensity };
      }
    });
    return out;
  });

  /** Park the PLAYER (residency's authority), then let the camera arrive with the sim running. */
  const park = async (x, z) => {
    const ok = await page.evaluate(([px, pz]) => {
      const e = window.__rrr.engine;
      e.player.pos.set(px, e.room.floorY, pz);
      e.player.vel.set(0, 0, 0);
      e.cam._first = true;
      return true;
    }, [x, z]);
    await step(40);
    return ok;
  };

  const resolved = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    const s = e.room.spaceAt(e.camera.position) ?? e.room.spaceAt(e.player.pos);
    return s ? s.id : null;
  });

  const inside = (p, s, pad = 0.8) => p && s
    && p.x >= s.x0 - pad && p.x <= s.x1 + pad && p.z >= s.z0 - pad && p.z <= s.z1 + pad;

  // =============================================================================================
  // A1/A2 — walk every space: does the key land in the room the player is standing in?
  // =============================================================================================
  const rows = [];
  for (const s of head.spaces) {
    const cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
    await park(cx, cz);
    const id = await resolved();
    if (id !== s.id) { rows.push({ s, id, status: 'UNRESOLVED' }); continue; }
    const L = await readLights();
    const dOrigin = Math.hypot(L.spot.x, L.spot.y, L.spot.z);
    const c = await page.evaluate(() => {
      const e = window.__rrr.engine;
      return { calls: e.renderer.info.render.calls, tris: e.renderer.info.render.triangles };
    });
    rows.push({ s, id, status: 'ok', L, calls: c.calls, tris: c.tris,
      keyIn: inside(L.spot, s), dOrigin,
      pointsIn: L.points.filter((p) => inside(p, s, 3.0)).length });
  }

  const seen = rows.filter((r) => r.status === 'ok');
  const unresolved = rows.filter((r) => r.status !== 'ok');
  for (const r of rows) {
    if (r.status !== 'ok') { note(`${r.s.id.padEnd(12)} UNRESOLVED (spaceAt gave ${r.id ?? 'null'}) — not counted either way`); continue; }
    note(`${r.s.id.padEnd(12)} key ${String(r.L.spot.x).padStart(7)},${String(r.L.spot.y).padStart(6)},${String(r.L.spot.z).padStart(7)}`
      + ` i ${String(r.L.spot.i).padStart(4)} ang ${r.L.spot.angle} #${r.L.spot.hex}`
      + ` · inside ${r.keyIn ? 'YES' : 'NO '} · |origin| ${r.dOrigin.toFixed(1)} m`
      + ` · point lights within 3 m of the room ${r.pointsIn}/${r.L.points.length}`
      + ` · hemi #${r.L.hemi.ground} · calls ${String(r.calls).padStart(3)}`);
  }

  if (!seen.length) { fail('a generated space could be parked in', 'every station was UNRESOLVED'); return; }
  const keyIn = seen.filter((r) => r.keyIn).length;
  const offOrigin = seen.filter((r) => r.dOrigin > 1).length;
  keyIn === seen.length
    ? pass('A1 the key stands in the room the player is in', `${keyIn}/${seen.length} spaces`)
    : fail('A1 the key stands in the room the player is in', `${keyIn}/${seen.length} spaces`);
  offOrigin === seen.length
    ? pass('A2 no light is parked at the world origin', `${offOrigin}/${seen.length} spaces, nearest ${Math.min(...seen.map((r) => r.dOrigin)).toFixed(1)} m`)
    : fail('A2 no light is parked at the world origin',
      `${seen.length - offOrigin}/${seen.length} spaces have the key within 1 m of (0,0,0)`);
  if (unresolved.length) note(`⚠️ ${unresolved.length} of ${rows.length} stations were UNRESOLVED and are excluded from both tallies`);

  // =============================================================================================
  // C2 — the unresolvable station. It must report UNRESOLVED, never a verdict.
  // =============================================================================================
  await park(500, 500);
  const outsideId = await resolved();
  outsideId === null
    ? pass('C2 CONTROL an unresolvable station reports UNRESOLVED',
      'parked 500 m out: spaceAt() -> null, so no lit/unlit verdict is available')
    : fail('C2 CONTROL an unresolvable station reports UNRESOLVED',
      `parked 500 m out and spaceAt() still returned "${outsideId}" — the probe cannot tell "lit" from "could not observe"`);

  // =============================================================================================
  // C1 + C3 — the in-place flip. ONE station, never a walk.
  // =============================================================================================
  const st = seen[Math.floor(seen.length / 2)].s;
  await park((st.x0 + st.x1) / 2, (st.z0 + st.z1) / 2);
  note(`\n  flip station: ${st.id} (${st.name}) — every counter below is read HERE and only here`);

  const census = () => page.evaluate(() => {
    const e = window.__rrr.engine;
    const info = e.renderer.info;
    let pointLights = 0, visMeshes = 0;
    e.scene.traverse((o) => {
      if (o.isPointLight && o.visible) pointLights++;
      if (o.isMesh && o.visible) visMeshes++;
    });
    return { calls: info.render.calls, tris: info.render.triangles,
      programs: (info.programs ?? []).length, pointLights, visMeshes };
  });

  await step(40);
  const on1 = await census();
  const lOn1 = await readLights();
  note(`  rig ON   calls ${on1.calls} · programs ${on1.programs} · point lights ${on1.pointLights}`
    + ` · key at ${lOn1.spot.x},${lOn1.spot.y},${lOn1.spot.z}`);

  const flipped = await page.evaluate((rig) => {
    const e = window.__rrr.engine;
    window.__genlightSaved = e.room.spaces.map((s) => s.lights);
    for (const s of e.room.spaces) s.lights = JSON.parse(JSON.stringify(rig));
    return e.room.spaces.length;
  }, ORIGIN_RIG);
  await step(60);
  const off = await census();
  const lOff = await readLights();
  const offD = Math.hypot(lOff.spot.x, lOff.spot.y, lOff.spot.z);
  note(`  rig OFF  calls ${off.calls} · programs ${off.programs} · point lights ${off.pointLights}`
    + ` · key at ${lOff.spot.x},${lOff.spot.y},${lOff.spot.z} (|origin| ${offD.toFixed(2)} m, ${flipped} spaces overwritten)`);

  await page.evaluate(() => {
    const e = window.__rrr.engine;
    const saved = window.__genlightSaved;
    e.room.spaces.forEach((s, i) => { s.lights = saved[i]; });
    return true;
  });
  await step(60);
  const on2 = await census();
  const lOn2 = await readLights();
  const on2D = Math.hypot(lOn2.spot.x, lOn2.spot.y, lOn2.spot.z);
  note(`  rig ON   calls ${on2.calls} · programs ${on2.programs} · point lights ${on2.pointLights}`
    + ` · key back at ${lOn2.spot.x},${lOn2.spot.y},${lOn2.spot.z}`);

  const wentRed = offD < 1 && !inside(lOff.spot, st);
  const cameBack = on2D > 1 && inside(lOn2.spot, st);
  /**
   * ⚠️ **ON `?genlight=0` THERE IS NOTHING TO RESTORE TO, AND THAT IS THE ARM'S CORRECT SHAPE —
   * NOT A BROKEN CONTROL.** The OFF arm's spaces carry no `lights` at all, so the flip writes the
   * origin rig over `undefined` and the restore puts `undefined` back: the key never leaves
   * (0,0,0) and `cameBack` is false because the tree really is in the defective state. Reported as
   * SKIP-with-a-reason there, and gated only on the arm that has a rig to break.
   */
  if (withRig === 0) {
    skip('C1 CONTROL the defect reintroduced in place goes RED, and restoring goes GREEN',
      `no space carries a rig on this arm (?genlight=0), so there is nothing to restore —`
      + ` the flip half still reads red as required (key |origin| ${offD.toFixed(2)} m)`);
  } else if (wentRed && cameBack) {
    pass('C1 CONTROL the defect reintroduced in place goes RED, and restoring goes GREEN',
      `origin rig: key |origin| ${offD.toFixed(2)} m and outside ${st.id}; restored: ${on2D.toFixed(1)} m and inside it`);
  } else {
    fail('C1 CONTROL the defect reintroduced in place goes RED, and restoring goes GREEN',
      `red=${wentRed} (key |origin| ${offD.toFixed(2)} m) restored=${cameBack} (|origin| ${on2D.toFixed(1)} m)`
      + ' — A1/A2 above are not observing what they claim');
  }

  const dCalls = off.calls - on1.calls, dProg = off.programs - on1.programs;
  const dPts = off.pointLights - on1.pointLights;
  dProg === 0 && dPts === 0
    ? pass('C3 the rig costs no program and no light',
      `programs ${on1.programs} -> ${off.programs} -> ${on2.programs}, point lights ${on1.pointLights} on both arms`)
    : fail('C3 the rig costs no program and no light',
      `programs ${on1.programs} -> ${off.programs} (Δ${dProg}), point lights Δ${dPts}`);
  /**
   * 🚨 **C3b USED TO ASSERT "THE RIG COSTS NO DRAW CALL" AND THAT CLAIM WAS WRONG — IT WENT RED ON
   * ITS FIRST RUN, IN THE CHEAP DIRECTION.** `renderer.info.render.calls` includes the SHADOW MAP
   * pass, the key is the game's only shadow caster, and the rig writes the key's `angle` and
   * `distance` (and therefore `shadow.camera.far`). So the rig moves the shadow frustum, which
   * moves the number: at `c0.1` the lit arm read **126** and the origin-rig arm **250**, i.e. the
   * rig is 124 calls CHEAPER because a 0.30 rad cone with `far` 31 contains far less of the house
   * than the constructor's 0.88 rad at 36 parked in the void. ⚠️ Do not read 250 as a baseline:
   * it is a degenerate state (position ≈ target), not a build anyone ships.
   *
   * So the gate is the BUDGET, on the arm we ship, at every parked station — the same protocol
   * `eo2-calls.mjs` uses — and the flip delta is REPORTED with its cause rather than asserted to
   * be zero.
   */
  const worst = seen.reduce((a, b) => (b.calls > a.calls ? b : a));
  note(`  flip delta ${dCalls >= 0 ? '+' : ''}${dCalls} calls — the key is the only shadow caster and the rig`
    + ` sets its cone and range, so this term is REAL and it is negative (the rig is cheaper)`);
  worst.calls <= 625 && worst.tris <= 900000
    ? pass('C3b the lit house fits the draw-call budget',
      `worst parked station ${worst.s.id} ${worst.calls}/625 calls, ${worst.tris}/900k tris over ${seen.length} stations`)
    : fail('C3b the lit house fits the draw-call budget',
      `worst ${worst.s.id} ${worst.calls} calls / ${worst.tris} tris`);

  // =============================================================================================
  // The frames John judges. Three stations, parked and settled with the sim RUNNING before hold().
  // =============================================================================================
  /**
   * 🚨 **A SPACE NARROWER THAN THE THIRD-PERSON BOOM IS NOT A GRADING STATION, AND THE FIRST
   * VERSION OF THIS PHOTOGRAPHED ONE.** `c0.0` on seed 0 is 28.70 x **1.81 m**; parked at its
   * centre the camera sits inside the side wall, and `grade.mjs` on that frame reported median L
   * 47.0 / top-decile 0.493 / darkest-decile 26.6 — numbers for a wall texture at 30 cm, not for
   * a passage. HANDOFF's first hazard: *captures lie*. So a station is photographed only if its
   * SHORT clear extent clears the boom, and the ones that do not are named as excluded rather
   * than quietly dropped. ⚠️ They are still walked and still counted by A1/A2 — the exclusion is
   * about what a PIXEL statistic can honestly be taken from, not about whether the space is lit.
   */
  const MIN_PHOTO_W = 4.0;
  const wideEnough = (r) => Math.min(r.s.x1 - r.s.x0, r.s.z1 - r.s.z0) >= MIN_PHOTO_W;
  await mkdir(SHOTDIR, { recursive: true });
  const narrow = seen.filter((r) => !wideEnough(r));
  if (narrow.length) {
    note(`not photographed — short extent under ${MIN_PHOTO_W} m, the camera would be inside a wall: `
      + narrow.map((r) => `${r.s.id} (${Math.min(r.s.x1 - r.s.x0, r.s.z1 - r.s.z0).toFixed(2)} m)`).join(', '));
  }
  const shotOf = seen.filter((r) => wideEnough(r) && /^r\d+\./.test(r.s.id)).slice(0, 2)
    .concat(seen.filter((r) => wideEnough(r) && /^c\d+\./.test(r.s.id)).slice(0, 1));
  const written = [];
  for (const r of shotOf) {
    const s = r.s;
    await park((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2);
    await hold(page);
    await page.waitForTimeout(200);
    const buf = await snap(`genlight-${s.id}`);
    await release(page);
    if (!buf) { note(`(no frame for ${s.id})`); continue; }
    const p = path.join(SHOTDIR, `genlight1.${process.env.GENLIGHT_TAG ?? 'on'}.${s.id}.png`);
    await writeFile(p, buf);
    written.push(p);
    note(`frame ${p} (${(buf.length / 1024).toFixed(0)} KB)`);
  }
  written.length
    ? pass('frames written for grading', `${written.length} stations — grade with harness/grade.mjs`)
    : fail('frames written for grading', 'no capture came back');
}
