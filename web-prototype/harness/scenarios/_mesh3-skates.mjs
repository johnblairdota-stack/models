/**
 * THE OLD ROBOT'S BOOTS COMING BACK — John's respawn bug, reproduced.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_mesh3-skates.mjs \
 *        --q "mesh=1" --shots
 *
 * Reported from play: *"after respawning from an escape there are the old robot feet showing. I
 * had skates on at the time I finished."*
 *
 * THE MECHANISM, which is why this needs its own scenario rather than a line in the limb one:
 *
 *   - the skates are NOT a socket occupant. `buildGadget('skates')` reports `shinBoth` and mounts
 *     on the robot's own legs, so `LimbRig` fires `{ kind: 'skates', on }` with **no `socket`**.
 *   - `fitSkates()` hides the procedural ankle meshes — the skates ARE the feet while worn.
 *   - `removeSkates()` puts them BACK, with `hideJointMeshes(..., true)`.
 *   - a respawn strips the loadout, which takes the skates off, which un-hides the boots
 *     underneath the generated body.
 *
 * `Player`'s re-hide was gated on `what.socket`, so it never ran for this event at all.
 *
 * ⚠️ THE ASSERTION IS A COUNT OF VISIBLE PROCEDURAL MESHES, not a look at a picture. With the
 * avatar on, the only things under the unit that may render are HELD PROPS and the skates
 * themselves — anything else visible there is the old body showing through.
 */
const countStray = () => {
  const p = window.__rrr.engine.player;
  const allowed = new Set();
  const mark = (o) => o?.traverse?.((c) => allowed.add(c));
  mark(p.sledge?.root);
  mark(p.rig?.skates?.root);
  for (const s of Object.keys(p.rig?.sockets ?? {})) {
    const occ = p.rig.sockets[s];
    if (occ?.type === 'gadget') mark(occ.item?.root ?? occ.item?.group);
  }
  let stray = 0;
  const names = [];
  p.unit.root.traverse((c) => {
    if (!c.isMesh && !c.isSkinnedMesh) return;
    if (!c.visible || allowed.has(c)) return;
    stray++;
    if (names.length < 8) names.push(c.name || c.type);
  });
  return { stray, names, skatesOn: !!p.rig.skates };
};

export default async function meshSkates({ page, shot, note, pass, fail }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(600);

  const ready = await page.evaluate(() => {
    const p = window.__rrr?.engine?.player;
    if (!p) return { ok: false, why: 'no player' };
    if (!p.avatar) return { ok: false, why: 'no mesh avatar — did ?mesh=1 reach it?' };
    if (typeof p.rig.fitSkates !== 'function') return { ok: false, why: 'LimbRig has no fitSkates' };
    return { ok: true };
  });
  if (!ready.ok) { fail(ready.why); return; }

  const base = await page.evaluate(countStray);
  note(`at rest: ${base.stray} stray procedural meshes`);
  if (base.stray === 0) pass('procedural body hidden at rest');
  else fail(`${base.stray} visible at rest: ${base.names.join(', ')}`);

  // ---- put the skates ON
  const on = await page.evaluate(() => {
    const p = window.__rrr.engine.player;
    return { fitted: p.rig.fitSkates(), legs: p.rig.countLimbs('leg') };
  });
  await page.waitForTimeout(500);
  if (!on.fitted) { fail(`skates would not fit (legs=${on.legs})`); return; }
  pass('skates fit');

  const withSkates = await page.evaluate(countStray);
  note(`skates on: ${withSkates.stray} stray`);
  if (withSkates.stray === 0) pass('no procedural body showing with skates on');
  else fail(`${withSkates.stray} visible with skates on: ${withSkates.names.join(', ')}`);

  await shot('mesh-skates-on');

  /*
   * ---- and TAKE THEM OFF, which is what a respawn does via `stripToLoadout()`. This is the
   * step that regressed: it deliberately un-hides the boots, and with the avatar on nothing
   * put them back.
   */
  const off = await page.evaluate(() => {
    const p = window.__rrr.engine.player;
    return { removed: p.rig.removeSkates() };
  });
  await page.waitForTimeout(500);
  if (!off.removed) { fail('removeSkates() returned false'); return; }
  pass('skates come off');

  const after = await page.evaluate(countStray);
  note(`skates off: ${after.stray} stray  ${after.names.join(', ')}`);
  if (after.stray === 0) pass('no old robot feet after the skates come off');
  else fail(`the old boots are back: ${after.stray} visible — ${after.names.join(', ')}`);

  await shot('mesh-skates-off');
}
