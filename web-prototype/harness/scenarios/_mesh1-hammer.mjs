/**
 * DOES THE GENERATED AVATAR HOLD — AND SWING — THE SLEDGEHAMMER?
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_mesh1-hammer.mjs \
 *        --q "mesh=1" --shots
 *
 * The generated character's swing IS the Meshy `attack` clip, and the hammer is parented to its
 * hand bone rather than fitted to two IK-solved hands. Two things have to be true for that to be
 * a swap rather than a regression, and neither is visible in a still of the bind pose:
 *
 *   1. the hammer is IN THE HAND and visible
 *   2. the swing actually plays, and the head MOVES while it does
 *
 * ⚠️ EQUIP AND MEASURE IN SEPARATE EVALUATES, WITH FRAMES IN BETWEEN. The mount happens in
 * `Player.update()` on the frame it notices the hammer is equipped, so measuring inside the same
 * evaluate that calls `equip()` reads the prop before anything has moved it. The first run of
 * this scenario did exactly that and reported the hands 22.7 m from the hammer — a real-looking
 * number for a test that had simply not let the game tick.
 */
export default async function meshHammer({ page, shot, note, pass, fail }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(600);

  const setup = await page.evaluate(() => {
    const e = window.__rrr?.engine;
    if (!e?.player) return { ok: false, why: 'no engine.player' };
    const p = e.player;
    if (!p.avatar) return { ok: false, why: 'player has no mesh avatar — did ?mesh=1 reach it?' };
    if (!p.sledge.owned) {
      const it = e.limbField?.items?.find((i) => i.type === 'sledge');
      if (!it) return { ok: false, why: 'no sledge in limbField' };
      p.pos.copy(it.root.position); p.vel.set(0, 0, 0);
      p.interact(e.limbField, 1.5, null);
    }
    if (!p.sledge.equipped) p.sledge.equip();
    if (!p.sledge.equipped) return { ok: false, why: `hammer would not equip, arms=${p.caps.arms}` };
    return { ok: true };
  });
  if (!setup.ok) { fail(`setup: ${setup.why}`); return; }

  await page.waitForTimeout(900);          // let the mount happen and the pose settle

  /*
   * World position WITHOUT importing three — the harness page exposes the engine, not the
   * library, and `window.__rrr.THREE` throws. A matrix's translation is elements 12..14.
   */
  const held = await page.evaluate(() => {
    const p = window.__rrr.engine.player;
    const w = (o) => { o.updateWorldMatrix(true, false); const m = o.matrixWorld.elements; return [m[12], m[13], m[14]]; };
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const hand = p.avatar.bones.RightHand;
    const haft = p.sledge.root;
    if (!hand || !haft) return { ok: false, why: 'missing hand bone or hammer root' };
    let vis = false;
    haft.traverse((c) => { if (c.isMesh && c.visible) vis = true; });
    /*
     * ⚠️ SIZE, NOT JUST PRESENCE. Parented + `visible === true` + near the hand was all TRUE of a
     * hammer rendering at 1/100 scale inside the fist, because the hand bone carries the GLB's own
     * 0.01 scale. The capture showed a robot holding nothing while every assertion passed.
     */
    const bb = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    haft.updateWorldMatrix(true, true);
    haft.traverse((c) => {
      if (!c.isMesh || !c.geometry) return;
      if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
      const g = c.geometry.boundingBox;
      for (const cx of [g.min.x, g.max.x]) for (const cy of [g.min.y, g.max.y]) for (const cz of [g.min.z, g.max.z]) {
        const v = { x: cx, y: cy, z: cz };
        const m = c.matrixWorld.elements;
        const p = [
          m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12],
          m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13],
          m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14],
        ];
        for (let i = 0; i < 3; i++) { bb.min[i] = Math.min(bb.min[i], p[i]); bb.max[i] = Math.max(bb.max[i], p[i]); }
      }
    });
    const span = Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]);
    return {
      ok: true,
      span: +span.toFixed(3),
      mounted: p.avatar.propMounted,
      parent: haft.parent?.name ?? '(none)',
      clip: p.avatar.clip,
      visible: vis,
      d: +dist(w(hand), w(haft)).toFixed(3),
      height: p.height,
    };
  });
  if (!held.ok) { fail(held.why); return; }

  note(`clip="${held.clip}"  parent="${held.parent}"  hand->hammer ${held.d} m  world span ${held.span} m`);

  // A sledgehammer on a 1.7 m character is roughly a metre corner to corner. Anything under a
  // third of the character's height is a scale bug, not a hammer.
  if (held.span > held.height * 0.33) pass(`the hammer is full size in the world (${held.span} m)`);
  else fail(`the hammer measures ${held.span} m — the hand bone's 0.01 scale was not divided out`);
  if (held.visible) pass('the sledgehammer is visible with the mesh avatar on');
  else fail('the sledgehammer is INVISIBLE — _hideProceduralBody swept it up with the shell');

  if (held.mounted && held.parent === 'RightHand') pass('hammer is parented to the hand bone');
  else fail(`hammer is not on the hand bone — parent "${held.parent}", mounted=${held.mounted}`);

  // Offset down the haft is `(GRIP_LO + GRIP_SEP) * height` = 0.349 m at 1.7 m, so half the
  // character's height is a generous bound that a dropped or unmounted prop cannot pass.
  const bound = held.height * 0.5;
  if (held.d < bound) pass(`hammer within ${bound.toFixed(2)} m of the hand`);
  else fail(`hammer is ${held.d} m from the hand, bound ${bound.toFixed(2)}`);

  await shot('mesh-hammer-idle');

  /*
   * THE SWING. Sampling the head's world position across the swing is what separates "the clip
   * is playing" from "the clip is assigned" — a mis-wired one-shot action sits on frame 0 and
   * every pose assertion still passes.
   */
  const swing = await page.evaluate(async () => {
    const p = window.__rrr.engine.player;
    const w = (o) => { o.updateWorldMatrix(true, false); const m = o.matrixWorld.elements; return [m[12], m[13], m[14]]; };
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    /*
     * ⚠️ SWING ON THE ENGINE'S CLOCK. `SledgeRig` measures phase as `(t - t0) / SWING_DUR` against
     * whatever `t` `Player.update` hands it, and that is the simulation's accumulated time — not
     * `performance.now()`. Calling `swing(performance.now()/1000)` sets `t0` ~100 s in the future,
     * the phase never becomes positive, and the swing silently never happens: the first run of
     * this scenario reported "the attack clip never played" for exactly that reason, with nothing
     * wrong in the game code at all.
     *
     * So borrow the clock the player is actually being driven with, then go through `attack()` —
     * the same door the mouse button uses — rather than poking the rig directly.
     */
    const orig = p.update.bind(p);
    let lastT = 0;
    p.update = (dt, t, ...rest) => { lastT = t; return orig(dt, t, ...rest); };
    await new Promise((r) => requestAnimationFrame(r));
    const before = w(p.sledge.head);
    p._fireCd = 0;
    p.attack(lastT);
    const seen = new Set();
    let travel = 0;
    let prev = before;
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      seen.add(p.avatar.clip);
      if (p.avatar.swing) window.__swingPicked = p.avatar.swing.clip;
      const now = w(p.sledge.head);
      travel += dist(prev, now);
      prev = now;
    }
    return { travel: +travel.toFixed(3), clips: [...seen], picked: window.__swingPicked ?? null };
  });

  note(`during the swing: clips ${swing.clips.join(',')}  head travelled ${swing.travel} m`);
  /*
   * ⚠️ THE SWING SET IS VARIED, so this cannot assert one clip NAME. `playAttack()` picks from
   * `SWINGS` at random and each entry carries its own grip and contact phase; the assertion is
   * that the clip that played is the one the avatar says it picked.
   */
  if (swing.picked && swing.clips.includes(swing.picked)) {
    pass(`a swing clip drives the swing (picked "${swing.picked}")`);
  } else {
    fail(`the picked swing "${swing.picked}" never played — saw ${swing.clips.join(',')}`);
  }
  if (swing.travel > 0.5) pass(`the hammer head actually moves (${swing.travel} m)`);
  else fail(`the hammer head barely moved (${swing.travel} m) — the clip is assigned, not playing`);

  await shot('mesh-hammer-swing');
}
