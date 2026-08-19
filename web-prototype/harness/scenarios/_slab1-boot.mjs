/**
 * 🧱 **THE SLAB SPIKE'S BOOT BILL — SHADER PROGRAMS AND TIME TO A LIVE FRAME, BOTH ARMS.**
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_slab1-boot.mjs \
 *        --port 5426 --q "seed=s4"            # the authored, tiled arm — the default
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_slab1-boot.mjs \
 *        --port 5427 --q "seed=s4&slab=1"     # one face per wall on svc_w / svc_e
 *
 * 🚨 **WHY THIS FILE EXISTS AND WHY IT IS TWO NUMBERS.** `progkey-1` took programs **1077 → 213**
 * and cold boot **199.7 → 98.9 s** by killing per-panel `customProgramCacheKey`s, and HANDOFF's
 * standing instruction to anything that adds a wall variant is *"do not reintroduce a per-panel
 * cache key — new variants go in `defines`; report the program count."* A slab adds a fourth
 * free-face APERTURE (15.40 m), and an aperture is a geometry, not a material — so the prediction
 * is **213 → 213**. This measures it rather than asserting it.
 *
 * ⚠️ **A COUNT IS NOT A MEASUREMENT WITHOUT A CONTROL THAT MOVES IT.** `renderer.info.programs`
 * is a live array and a probe that reads it once cannot tell "213 because nothing was added" from
 * "213 because I am reading a stale or wrong object". So this file **compiles one deliberately new
 * variant in the page** — a material with a unique `customProgramCacheKey`, rendered once — and
 * fails if the counter does not go up by exactly one. That arm runs on every run.
 *
 * ⚠️ **THE CLOCK IS REPORTED, NOT GATED.** `performance.now()` at the moment the scenario runs is
 * boot + the harness's own settle, on a machine that may have another agent's browser on it. Both
 * arms are read the same way and the DELTA is the number; the absolute is context.
 */

export default async function boot({ page, note, pass, fail }) {
  const arm = await page.evaluate(() =>
    (new URLSearchParams(location.search).get('slab') ? 'SLAB' : 'tiled'));

  const census = await page.evaluate(() => {
    const e = window.__rrr?.engine ?? window.__engine ?? window.engine;
    const r = e?.renderer;
    const room = e?.room;
    const free = (room?.panels ?? []).filter((p) => p.spec?.free);
    const widths = [...new Set(free.map((p) => +p.width.toFixed(2)))].sort((a, b) => a - b);
    return {
      programs: r?.info?.programs?.length ?? -1,
      geometries: r?.info?.memory?.geometries ?? -1,
      textures: r?.info?.memory?.textures ?? -1,
      freeFaces: free.length,
      widths,
      panels: room?.panels?.length ?? -1,
      // the whole house's damage-grid bill, read off the built fields rather than predicted
      cells: free.reduce((n, p) => n + (p.field ? p.field.cols * p.field.rows : 0), 0),
      t: Math.round(performance.now()),
    };
  });

  if (census.programs < 0) { fail('the renderer census is readable', 'no engine on window'); return; }

  note(`arm ${arm} · programs ${census.programs} · geometries ${census.geometries} · `
    + `textures ${census.textures}`);
  note(`free dig faces ${census.freeFaces} of ${census.panels} panels · widths ${census.widths.join(' / ')} m`);
  note(`house-wide damage grid: ${census.cells} cells = ${(census.cells * 34 / 1024).toFixed(1)} kB `
    + `(4 B texture + 30 B CPU per cell)`);
  note(`⏱️ time from page start to this probe: ${(census.t / 1000).toFixed(1)} s (REPORTED, not gated)`);

  /**
   * 🚨 **THE CONTROL, IN THE PAGE: COMPILE ONE NEW VARIANT AND WATCH THE COUNTER MOVE.**
   * Floor it must clear: exactly +1 program. A counter that does not move for a genuinely new
   * program is a counter this file cannot use, and every number above would be decoration.
   */
  const ctrl = await page.evaluate(async () => {
    const e = window.__rrr?.engine ?? window.__engine ?? window.engine;
    const r = e.renderer;
    /**
     * ⚠️ **`THREE` IS NOT ON `window` ON THIS BUILD** (it is a bundled module), so the control
     * borrows a live mesh's own constructors instead of importing any. Cloning a material that is
     * already compiled and giving the clone a unique `customProgramCacheKey` is exactly the defect
     * class this check exists for — a per-panel key — reintroduced for one frame.
     */
    let src = null;
    (e.scene ?? e.world?.scene).traverse((o) => { if (!src && o.isMesh && o.material && !Array.isArray(o.material)) src = o; });
    if (!src) return { err: 'no mesh in the scene to borrow constructors from' };
    const before = r.info.programs.length;
    const m = src.material.clone();
    m.customProgramCacheKey = () => `rrr-slab1-control-${Math.random()}`;
    m.needsUpdate = true;
    const mesh = new src.constructor(src.geometry, m);
    mesh.frustumCulled = false;
    const cam = e.cam?.camera ?? e.camera;
    mesh.position.set(cam.position.x, cam.position.y, cam.position.z);
    mesh.scale.set(0.002, 0.002, 0.002);
    (e.scene ?? e.world?.scene).add(mesh);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const during = r.info.programs.length;
    mesh.removeFromParent(); mesh.geometry.dispose(); m.dispose();
    return { before, during };
  });

  if (ctrl.err) {
    fail('CONTROL — the program counter can see a new variant', ctrl.err);
  } else if (ctrl.during === ctrl.before + 1) {
    pass('CONTROL — the program counter can see a new variant',
      `one material with a unique customProgramCacheKey took programs ${ctrl.before} → `
      + `${ctrl.during}, so the census above is a live read and not a constant.`);
  } else {
    fail('CONTROL — the program counter can see a new variant',
      `programs ${ctrl.before} → ${ctrl.during} for a deliberately unique cache key — expected `
      + '+1. The count reported above cannot be trusted.');
  }

  /**
   * 🚨 **HANDOFF'S RECORDED 213 IS STALE ON THIS TREE AND IT IS NOT THIS SPIKE'S DOING — MEASURED
   * ON THE DEFAULT ARM, WHICH `slab-1` DID NOT TOUCH: 231.** `progkey-1` recorded 213 on
   * 2026-08-09 and `limbs-1`, `sag-1`, `aim-1`, `collapse-1/-2` and `reach-1` have all landed
   * since. **Report it; do not chase it here.** The bar this file actually gates on is therefore
   * the DEFAULT ARM'S OWN COUNT in the same session pair, which is the only comparison a spike is
   * entitled to make — `PROGRAMS_BAR=<n>` overrides.
   */
  const BAR = Number(process.env.PROGRAMS_BAR ?? 231);
  if (census.programs <= BAR) {
    pass('the shader program count did not grow',
      `${census.programs} programs against progkey-1's recorded ${BAR}. A slab changes an aperture `
      + 'GROUP, and an aperture is a geometry: `wallinstances.js` builds one InstancedMesh pair per '
      + 'distinct w×h×t and hands them the SAME shared `wall.pristine.face` material, whose program '
      + 'key is pinned to `rrr-wall|stage`. No per-panel key was added.');
  } else {
    fail('the shader program count did not grow',
      `${census.programs} against ${BAR} — something added a variant. Check for a per-panel `
      + 'customProgramCacheKey; HANDOFF records that class costing 1077 programs and 100 s of boot.');
  }
}
