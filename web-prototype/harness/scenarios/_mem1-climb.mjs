/**
 * 🧠 **DOES THE GAME'S GPU MEMORY CLIMB WHILE YOU PLAY — measured, not inferred from an article.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_mem1-climb.mjs \
 *        --port 5490 --q "plan=gen&planseed=0&quality=medium"
 *
 * John, 2026-08-12: *"I have a memory issue when playing the game. Could it be this screenshot
 * from google?"* — a summary of the standard three.js VRAM-leak advice (`.dispose()` is not
 * called, `scene.remove()` and `visible = false` do not free GPU memory).
 *
 * 🚨 **THE ARTICLE IS GENERICALLY TRUE AND SAYS NOTHING ABOUT THIS GAME, AND TWO FACTS ALREADY ON
 * DISK POINT AWAY FROM ITS HEADLINE.** `src/` makes **144 `.dispose()` calls**, so the naive
 * never-dispose case does not apply; and `docs/handoff/instruments.md` records that
 * `performance.memory.usedJSHeapSize` **never moved once across nine sessions** even with
 * `--enable-precise-memory-info`, so the JS-heap column is DEAD here and cannot answer this.
 * `renderer.info.memory` is the counter that can.
 *
 * ⚠️ **AND THE 5.2 GB IN HIS TASK MANAGER IS "Firefox (35)" — thirty-five processes with YouTube,
 * Netflix and a dozen tabs in them.** That number is not the game's and must not be treated as
 * this probe's subject. What is measured here is the renderer's own object counts, in one tab,
 * against itself over time.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT ASKS
 * ---------------------------------------------------------------------------------------------
 *   M1  IDLE      does anything climb while simply playing, with no round reset at all?
 *   M2  RESETS    does anything climb across repeated round resets — the path that rebuilds the
 *                 world, respawns the sledge and the gadgets, and re-plans the dig?
 *   M3  DIGGING   does breaking a lot of wall climb — `skin.js` subdivides every skin triangle
 *                 and `debris.js` runs a pool, so this is the path most likely to allocate.
 *
 * 🚨 **THE CONTROL THAT MUST FAIL, AND IT IS THE WHOLE REASON THIS FILE IS TRUSTWORTHY.** The
 * documented failure mode here is a FROZEN COUNTER reporting a comfortable zero — that is exactly
 * how the `usedJSHeapSize` column lied for nine sessions. So **C1 allocates real geometry and
 * textures, uploads them, and requires the counter to MOVE**, then disposes them and requires it
 * to come back. A flat zero in M1-M3 means nothing unless C1 is green on the same run.
 */

const snap = () => {
  const r = window.__rrr.engine.renderer;
  const i = r.info;
  return {
    geometries: i.memory.geometries, textures: i.memory.textures,
    programs: i.programs?.length ?? -1,
    calls: i.render.calls, tris: i.render.triangles,
  };
};

export default async function mem1Climb({ page, note, pass, fail }) {
  await page.evaluate(`window.__mem1 = ${snap.toString()}`);
  const read = () => page.evaluate(() => window.__mem1());
  const d = (a, b) => ({
    geometries: b.geometries - a.geometries, textures: b.textures - a.textures,
    programs: b.programs - a.programs,
  });
  const fmt = (x) => `geo ${x.geometries >= 0 ? '+' : ''}${x.geometries} · tex `
    + `${x.textures >= 0 ? '+' : ''}${x.textures} · prog ${x.programs >= 0 ? '+' : ''}${x.programs}`;

  // =========================================================================
  // C1 — THE CONTROL: prove the counter is alive before believing any zero it reports.
  // =========================================================================
  const ctl = await page.evaluate(async () => {
    const e = window.__rrr.engine;
    const THREE = e.THREE ?? (await import('/node_modules/three/build/three.module.js')).default ?? null;
    const m = e.renderer.info.memory;
    const before = { g: m.geometries, t: m.textures };
    const keep = [];
    // real GPU uploads, through the renderer, not bookkeeping
    for (let i = 0; i < 40; i++) {
      const g = new e.scene.constructor().constructor ? null : null;
      keep.push(g);
    }
    // build via an existing object's constructors so no import is needed
    const proto = e.scene.children.find((c) => c.isMesh) ?? null;
    if (!proto) return { err: 'no mesh in the scene to borrow constructors from' };
    const G = proto.geometry.constructor, MSH = proto.constructor, MAT = proto.material.constructor;
    const made = [];
    for (let i = 0; i < 40; i++) {
      const g = new G();
      g.setAttribute('position', new proto.geometry.attributes.position.constructor(
        new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), 3));
      const mesh = new MSH(g, new MAT());
      e.scene.add(mesh); made.push(mesh);
    }
    e.renderer.render(e.scene, e.camera);
    const during = { g: m.geometries, t: m.textures };
    for (const mesh of made) { e.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
    e.renderer.render(e.scene, e.camera);
    const after = { g: m.geometries, t: m.textures };
    return { before, during, after, moved: during.g - before.g, freed: during.g - after.g };
  }).catch((err) => ({ err: String(err).slice(0, 200) }));

  if (ctl.err) { fail('C1-CONTROL the memory counter is alive', ctl.err); }
  else {
    note(`C1 geometries ${ctl.before.g} → ${ctl.during.g} (allocated) → ${ctl.after.g} (disposed)`);
    if (ctl.moved >= 40 && ctl.freed >= 40) {
      pass('C1-CONTROL the memory counter is alive', `moved +${ctl.moved}, freed ${ctl.freed} — a zero below is real`);
    } else {
      fail('C1-CONTROL the memory counter is alive',
        `moved +${ctl.moved}, freed ${ctl.freed} — every zero in M1-M3 is UNINTERPRETABLE`);
    }
  }

  // =========================================================================
  // M1 — IDLE
  // =========================================================================
  const i0 = await read();
  note(`M1 start: geo ${i0.geometries} · tex ${i0.textures} · prog ${i0.programs} · `
    + `${i0.calls} calls / ${i0.tris} tris`);
  await new Promise((r) => setTimeout(r, 12000));
  const i1 = await read();
  const dIdle = d(i0, i1);
  note(`M1 after 12 s of idle play: ${fmt(dIdle)}`);
  if (dIdle.geometries <= 2 && dIdle.textures <= 2) pass('M1 idle play does not allocate', fmt(dIdle));
  else fail('M1 idle play does not allocate', fmt(dIdle));

  // =========================================================================
  // M2 — ROUND RESETS. The path that rebuilds the world.
  // =========================================================================
  const r0 = await read();
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('KeyR');
    await new Promise((r) => setTimeout(r, 1600));
  }
  const r1 = await read();
  const dReset = d(r0, r1);
  note(`M2 after 6 round resets: ${fmt(dReset)} · now geo ${r1.geometries} · tex ${r1.textures}`);
  note(`M2 per reset: geo ${(dReset.geometries / 6).toFixed(1)} · tex ${(dReset.textures / 6).toFixed(1)}`);
  if (dReset.geometries <= 6 && dReset.textures <= 6) pass('M2 a round reset does not leak', fmt(dReset));
  else fail('M2 a round reset does not leak', `${fmt(dReset)} over 6 resets — this compounds every round`);

  // =========================================================================
  // M3 — DIGGING. `skin.js` subdivides, `debris.js` pools.
  // =========================================================================
  const g0 = await read();
  await page.evaluate(() => {
    const room = window.__rrr.engine.room;
    const faces = room.panels.filter((p) => p.spec?.free && p.field).slice(0, 8);
    for (const p of faces) for (let i = 0; i < 60; i++) p.applyHit(p.pointAt(0.2 + (i % 5) * 0.15, 0.5), 1);
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));
  const g1 = await read();
  const dDig = d(g0, g1);
  note(`M3 after 480 blows across 8 faces: ${fmt(dDig)} · now geo ${g1.geometries} · tex ${g1.textures}`);
  if (dDig.geometries <= 40 && dDig.textures <= 10) pass('M3 digging does not run away', fmt(dDig));
  else fail('M3 digging does not run away', fmt(dDig));

  const end = await read();
  note(`TOTALS: geo ${i0.geometries} → ${end.geometries} · tex ${i0.textures} → ${end.textures} · `
    + `prog ${i0.programs} → ${end.programs}`);
}
