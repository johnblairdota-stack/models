/**
 * WHERE DO THE CALLS AT THE WORST PARKED STATION ACTUALLY GO, AND WHAT DID INSTANCING MOVE?
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/inst-census.mjs \
 *        --port 5224 --q "seed=s4&walls=legacy"
 *   ...  --q "seed=s4&walls=occlude"     ...  --q "seed=s4&walls=instanced"
 *
 * `eo2-calls.mjs` answers "how many". This answers "whose", by ABLATION rather than by counting
 * meshes and assuming a call each: park, settle, read `renderer.info.render.calls`, then hide
 * every wall panel — its own meshes AND its instanced copies — settle again, read again. The
 * difference is what the wall panels cost at that station, including whatever the shadow map
 * and the post chain multiply them by, which a mesh census cannot see.
 *
 * ⚠️ THE ABLATION MUST SURVIVE `setViewpoints`. Residency rewrites `panel.root.visible` EVERY
 * FRAME, so setting it once and stepping frames measures nothing at all — it is put back before
 * the next draw. The hide is therefore wrapped around `room.setViewpoints` itself, and it hides
 * the instanced group meshes too, or the instanced arm would report its own cost as zero.
 *
 * ⚠️ `renderer.info` is only reset by the engine's own loop (`engine.js` sets
 * `info.autoReset = false`). This probe never calls `pipeline.render()` directly — it steps the
 * live loop and reads the last frame — so the counter is per-frame and honest.
 */

const STATIONS = (process.env.STATIONS ?? [
  'gallery.west', 'gallery.mid', 'gallery.east',
  'study_w.north', 'study_w.south', 'service.mid',
  'study_e.north', 'study_e.south',
  'ballroom.north', 'ballroom.centre', 'ballroom.south',
  'chapel.centre',
].join(',')).split(',').filter(Boolean);

export default async function census({ page, note, pass, fail }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? 0);
  const step = async (n = 3) => {
    const f0 = await frames();
    for (let i = 0; i < 150; i++) {
      await page.waitForTimeout(40);
      const f = await frames();
      if (f - f0 >= n) return f - f0;
    }
    return -1;
  };
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(300);

  const head = await page.evaluate(() => {
    const e = window.__rrr.engine;
    const c = e.room.panelCensus();
    if (e.room.__abl) return c;
    const room = e.room;
    const orig = room.setViewpoints;
    room.__abl = { off: false };
    room.setViewpoints = function (...a) {
      const r = orig.apply(this, a);
      if (room.__abl.off) {
        for (const p of room.panels) p.root.visible = false;
        for (const g of room.panelInstances?.groups ?? []) { g.face.visible = false; g.reveal.visible = false; }
      }
      return r;
    };
    return c;
  });
  note(`mode "${head.mode}" · ${head.panels} panels, ${head.pristine} pristine`
    + ` · instanced groups ${head.instanced ? head.instanced.groups : 0}`
    + ` (${head.instanced ? head.instanced.keys.join(', ') : 'none'})`);

  const read = async (off) => {
    // ⚠️ `sync()` early-outs when the (visible, pristine) signature is unchanged, so it will NOT
    // undo a visibility flag some other code set behind its back. Without the forced re-sync the
    // instanced groups stayed hidden after the first ablation and every station after the first
    // reported "instanced draws 0" — a probe silently measuring a build it had broken itself.
    await page.evaluate((v) => {
      const room = window.__rrr.engine.room;
      room.__abl.off = v;
      if (!v) room.panelInstances?.sync(true);
    }, off);
    await step(8);
    return page.evaluate(() => {
      const e = window.__rrr.engine;
      return { calls: e.renderer.info.render.calls, ...e.room.panelCensus() };
    });
  };

  const rows = [];
  for (const name of STATIONS) {
    const ok = await page.evaluate((n) => {
      const e = window.__rrr.engine;
      const a = e.room.anchor(n);
      if (!a) return false;
      e.player.pos.set(a.x, e.room.floorY, a.z);
      e.player.vel.set(0, 0, 0);
      e.cam._first = true;
      return true;
    }, name);
    if (!ok) { note(`no anchor named ${name}`); continue; }
    await step(40);
    const base = await read(false);
    const abl = await read(true);
    await read(false);
    const inst = base.instanced;
    rows.push({ name, calls: base.calls, ablated: abl.calls, cost: base.calls - abl.calls });
    note(`${name.padEnd(16)} calls ${String(base.calls).padStart(4)}`
      + ` · panels on screen ${String(base.visiblePanels).padStart(2)}`
      + ` · own meshes ${String(base.ownMeshes).padStart(3)}`
      + ` · instanced draws ${String(inst ? inst.drawing : 0).padStart(2)} (${inst ? inst.live : 0} live)`
      + ` · PANEL COST ${String(base.calls - abl.calls).padStart(3)} calls`);
  }

  if (!rows.length) { fail('a census was taken', 'no station could be parked'); return; }
  const worst = rows.reduce((a, b) => (b.calls > a.calls ? b : a));
  const dearest = rows.reduce((a, b) => (b.cost > a.cost ? b : a));
  note(`WORST STATION ${worst.name}: ${worst.calls} calls, panels ${worst.cost} of them`);
  note(`DEAREST PANELS ${dearest.name}: ${dearest.cost} calls`);
  pass('a census was taken', `${rows.length} stations, mode ${head.mode}`);
}
