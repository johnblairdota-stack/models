/**
 * PERF A/B — the hunter's eye flare is now a PointLight that enters the scene whenever
 * awareness reaches ALERT, not only during a stagger or a growth. `hunter-ai.js` says in its
 * own comment that a PointLight at zero intensity still costs a full iteration of the lighting
 * loop on every lit fragment, and `game.play` sits at 1.28 of a 1.39 ms budget, so "one more
 * light" is not free by inspection. Measure it.
 *
 * Same scene, same camera, same frame, flare forced off then forced on. Dynamic resolution is
 * pinned first — it chases a frame budget by changing the render scale, which would silently
 * absorb exactly the cost being measured and report no difference.
 */
export default async function perfFlare({ page, note, pass, fail, skip }) {
  const ready = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.hunter) return false;
    e.opts.dynamicRes = false;
    e.pipeline.renderScale = 1.0;
    e.pipeline.setSize(e.pipeline.canvasWidth, e.pipeline.canvasHeight);
    const h = e.hunter, p = e.player;
    // a fixed, representative pose: hunter in frame at mid range, nothing else moving
    h.candidates = [];
    p.pos.set(-1.6, 0, 6.0); p.vel.set(0, 0, 0);
    h.root.position.set(-1.6, 0, 1.5); h.vel.set(0, 0, 0); h.state = 'PATROL';
    return true;
  });
  if (!ready) { skip('flare perf A/B', 'engine.hunter not reachable'); return; }

  const sample = async (label, awareness) => {
    await page.evaluate((aw) => {
      const h = window.__rrr.engine.hunter;
      h.awareness = aw;
      // hold it there: `_sense` decays awareness every frame with no candidates
      h.__pin = aw;
      if (!h.__pinned) {
        h.__pinned = true;
        window.__rrr.engine.onUpdate(() => { h.awareness = h.__pin; });
      }
    }, awareness);
    await page.waitForTimeout(4500);          // let the 120-sample series refill
    return page.evaluate(() => {
      const p = window.__rrr.perf();
      return { gpu: p.gpuMs, frame: p.frameMs, calls: p.calls, scale: p.renderScale,
        lit: window.__rrr.engine.hunter._flareOn };
    });
  };

  const off = await sample('flare off', 0);
  const on = await sample('flare on', 1);
  note(`flare OFF: gpu ${off.gpu} ms, frame ${off.frame} ms, ${off.calls} calls, scale ${off.scale}, inScene=${off.lit}`);
  note(`flare ON : gpu ${on.gpu} ms, frame ${on.frame} ms, ${on.calls} calls, scale ${on.scale}, inScene=${on.lit}`);
  const d = +(on.gpu - off.gpu).toFixed(3);
  note(`cost of the alert eye light: ${d >= 0 ? '+' : ''}${d} ms GPU, ${on.calls - off.calls} draw calls`);
  if (!on.lit) fail('the alert eye light is actually in the scene', 'awareness 1 did not add the light');
  else if (on.gpu <= 1.39) pass('alert eye light stays inside budget', `${on.gpu} ms with it lit (budget 1.39)`);
  else fail('alert eye light stays inside budget', `${on.gpu} ms with it lit against a 1.39 ms budget`);
}
