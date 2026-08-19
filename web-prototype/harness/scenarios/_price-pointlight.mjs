/**
 * PRICE ONE POINT LIGHT — what does keeping a gadget light permanently in the render list cost?
 *
 * WHY THIS IS THE THIRD ATTEMPT, and both earlier ones were wrong in instructive ways.
 *
 *  1. `perf-flare.mjs` toggles the hunter's eye light by setting `awareness`, one sample per
 *     arm, and on 2026-08-04 returned **-1.8 ms for ADDING a light**. A negative cost is
 *     self-refuting.
 *  2. The first version of this file alternated OFF/ON eight times and got **8 of 8 negative**,
 *     mean -0.90 ms, sd 0.385. Eight of eight in one direction is not noise, so there is a
 *     CONFOUND, and there were two:
 *       · **Order.** Every pair measured OFF then ON, so any downward drift — and both series
 *         drifted down, 5.25 -> 4.56 and 4.13 -> 3.02 — is charged to the light as a saving.
 *       · **The proxy is not the variable.** `awareness = 1` does not just add a light, it
 *         changes the hunter's AI STATE. Whatever else that changes rides along in the number.
 *
 * So this measures THE VARIABLE ITSELF: a bare `THREE.PointLight` at zero intensity, added to
 * and removed from the scene, nothing else touched. That is exactly the proposal on the table —
 * keep the gadget lights permanently resident at zero intensity so `numPointLights` never moves
 * — and it isolates it from AI, animation and gameplay entirely.
 *
 * DESIGN: **ABBA**. Each block measures A,B,B,A and takes ((B1-A1) + (B2-A2))/2. A linear drift
 * over the block cancels exactly, which is the flaw that produced the 8-of-8 result above.
 *
 * ⚠️ BOTH COUNTS ARE WARMED BEFORE MEASURING. `numPointLights` is part of three.js's program
 * cache key — the whole reason this question exists — so the FIRST toggle recompiles every
 * visible material and would be timed as the cost of the light. Toggle twice, discard, then
 * measure.
 */
export default async function pricePointLight({ page, note, pass, fail, skip }) {
  const BLOCKS = 6;
  const SETTLE = 2600;   // the GPU series is a 120-sample ring; let it refill fully

  const ready = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e) return null;
    // Dynamic resolution chases a frame budget by changing render scale — it would absorb
    // exactly the cost being measured and report no difference.
    e.opts.dynamicRes = false;
    e.pipeline.renderScale = 1.0;
    e.pipeline.setSize(e.pipeline.canvasWidth, e.pipeline.canvasHeight);
    // Freeze the world. Anything that moves changes fill and overdraw between samples, and the
    // effect being measured is smaller than that variation.
    const p = e.player, h = e.hunter;
    p.vel.set(0, 0, 0);
    if (h) { h.candidates = []; h.vel.set(0, 0, 0); h.state = 'PATROL'; h.awareness = 0; h.__pin = 0; e.onUpdate(() => { h.awareness = h.__pin; }); }

    // THE VARIABLE. A zero-intensity point light, parked where the gadget lights live — on the
    // player, near the camera — so it occupies the same position in the light list and the same
    // relationship to the walls that fill the screen.
    const THREE = window.__rrr.THREE ?? e.scene.constructor.prototype.constructor.__three ?? null;
    const probe = new (e.scene.children.find((c) => c.isPointLight)?.constructor)(0xffffff, 0, 6, 2);
    probe.name = '__priceProbe';
    probe.intensity = 0;
    probe.position.copy(e.camera.position);
    e.__probeLight = probe;
    let n = 0; e.scene.traverse((o) => { if (o.isPointLight) n++; });
    return { baseCount: n, ok: !!probe.isPointLight };
  });
  if (!ready?.ok) { skip('point-light price', 'could not construct a probe PointLight'); return; }
  note(`point lights in the scene before the probe: ${ready.baseCount}`);

  const setProbe = (on) => page.evaluate((v) => {
    const e = window.__rrr.engine;
    if (v) e.scene.add(e.__probeLight); else e.__probeLight.removeFromParent();
    let n = 0; e.scene.traverse((o) => { if (o.isPointLight) n++; });
    return n;
  }, on);

  // Warm BOTH counts so the first real sample is not timing a shader compile.
  for (let i = 0; i < 2; i++) { await setProbe(true); await page.waitForTimeout(900); await setProbe(false); await page.waitForTimeout(900); }
  const nOn = await setProbe(true); const nOff = await (async () => { await page.waitForTimeout(200); return setProbe(false); })();
  note(`probe present -> ${nOn} point lights · probe absent -> ${nOff}`);
  if (nOn !== nOff + 1) { skip('point-light price', `the probe does not move the count (${nOff} -> ${nOn})`); return; }

  const gpu = async () => {
    await page.waitForTimeout(SETTLE);
    return page.evaluate(() => window.__rrr.perf().gpuMs);
  };
  const sample = async (on) => { await setProbe(on); return gpu(); };

  const deltas = [], allOff = [], allOn = [];
  for (let b = 0; b < BLOCKS; b++) {
    // ABBA: OFF, ON, ON, OFF
    const a1 = await sample(false);
    const b1 = await sample(true);
    const b2 = await sample(true);
    const a2 = await sample(false);
    allOff.push(a1, a2); allOn.push(b1, b2);
    deltas.push(((b1 - a1) + (b2 - a2)) / 2);
  }
  await setProbe(false);

  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

  note(`OFF gpu: ${allOff.map((x) => x.toFixed(2)).join(' ')}  (mean ${mean(allOff).toFixed(2)} ms)`);
  note(`ON  gpu: ${allOn.map((x) => x.toFixed(2)).join(' ')}  (mean ${mean(allOn).toFixed(2)} ms)`);
  note(`ABBA block deltas: ${deltas.map((x) => (x >= 0 ? '+' : '') + x.toFixed(3)).join(' ')}`);

  const m = mean(deltas), s = sd(deltas), se = s / Math.sqrt(BLOCKS);
  note(`ONE EXTRA POINT LIGHT: ${m >= 0 ? '+' : ''}${m.toFixed(3)} ms GPU · sd ${s.toFixed(3)} · SE ${se.toFixed(3)} · n=${BLOCKS} blocks`);

  // ⚠️ THE POINT OF THIS PROBE IS TO BE ABLE TO SAY "I CANNOT TELL". A mean inside the noise is
  // NOT a measurement of zero cost, it is a failure to resolve, and this project's rule is that
  // an unresolved A/B is reported as unresolved rather than as a null result.
  if (Math.abs(m) > 2 * se) {
    if (m < 0) fail('the point-light A/B resolves', `mean ${m.toFixed(3)} ms says a light makes it FASTER — a confound remains, do not use this number`);
    else pass('the point-light A/B resolves', `one extra point light costs +${m.toFixed(3)} ms GPU (2·SE = ${(2 * se).toFixed(3)})`);
  } else {
    fail('the point-light A/B resolves', `mean ${m.toFixed(3)} ms is inside the noise (2·SE = ${(2 * se).toFixed(3)}) — UNRESOLVED, not zero`);
  }
}
