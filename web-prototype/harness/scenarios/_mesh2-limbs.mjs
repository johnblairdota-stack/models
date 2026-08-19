/**
 * LIMB DETACH AND RE-ATTACH, WITH THE GENERATED AVATAR ON.
 *
 *   node harness/playtest.mjs --view game.play --script harness/scenarios/_mesh2-limbs.mjs \
 *        --q "mesh=1" --shots
 *
 * Reproduces two things John hit in play:
 *
 *   1. "an original robot arm floating in front of me after I reattached the limb" — the detached
 *      limb becomes its own visible object, and `LimbRig.attach()` puts THAT OBJECT back on the
 *      body still visible. The constructor's hide pass ran before it existed separately.
 *
 *   2. the mesh not changing when the arm came off — the avatar collapses the bone, but the
 *      clips carry SCALE TRACKS, so `mixer.update()` overwrote it on the next frame.
 *
 * ⚠️ THE ASSERTION IS A COUNT OF VISIBLE PROCEDURAL MESHES, NOT A LOOK AT A PICTURE. With the
 * avatar on, the only things under the unit that may render are HELD PROPS. Anything else visible
 * there is the old body showing through, which is the entire defect class.
 */
const countVisible = () => {
  const p = window.__rrr.engine.player;
  const held = new Set();
  const mark = (o) => o?.traverse?.((c) => held.add(c));
  mark(p.sledge?.root);
  for (const s of Object.keys(p.rig?.sockets ?? {})) {
    const occ = p.rig.sockets[s];
    if (occ?.type === 'gadget') mark(occ.item?.root ?? occ.item?.group);
  }
  let stray = 0;
  const names = [];
  p.unit.root.traverse((c) => {
    if (!c.isMesh && !c.isSkinnedMesh) return;
    if (!c.visible || held.has(c)) return;
    stray++;
    if (names.length < 6) names.push(c.name || c.type);
  });
  return { stray, names };
};

export default async function meshLimbs({ page, shot, note, pass, fail }) {
  await page.mouse.move(640, 360); await page.mouse.down(); await page.mouse.up();
  await page.waitForTimeout(600);

  const ready = await page.evaluate(() => {
    const p = window.__rrr?.engine?.player;
    if (!p) return { ok: false, why: 'no player' };
    if (!p.avatar) return { ok: false, why: 'no mesh avatar — did ?mesh=1 reach it?' };
    return { ok: true };
  });
  if (!ready.ok) { fail(ready.why); return; }

  const base = await page.evaluate(countVisible);
  note(`before: ${base.stray} stray visible procedural meshes`);
  if (base.stray === 0) pass('procedural body is fully hidden at rest');
  else fail(`${base.stray} procedural meshes visible at rest: ${base.names.join(', ')}`);

  // ---- knock the right arm off
  const off = await page.evaluate(() => {
    const p = window.__rrr.engine.player;
    const item = p.rig.detach('shoulderR', { impulse: null, spin: null });
    return { detached: !!item, occupant: p.rig.occupant('shoulderR') };
  });
  await page.waitForTimeout(700);
  if (off.detached) pass('right arm detaches');
  else { fail('detach returned nothing'); return; }

  const armScale = await page.evaluate(() => +window.__rrr.engine.player.avatar.bones.RightArm.scale.x.toFixed(5));
  note(`after detach: mesh RightArm bone scale ${armScale}`);
  /*
   * The bone must STAY collapsed across frames. Checking it right after the call would pass even
   * with the original bug, because the mixer had not yet run and overwritten it.
   */
  if (armScale < 0.01) pass('the mesh arm is collapsed and stays collapsed through the clip');
  else fail(`the mesh arm is still full size (bone scale ${armScale}) — a scale track overwrote it`);

  await shot('mesh-limb-off');

  // ---- put it back
  const on = await page.evaluate(() => {
    const p = window.__rrr.engine.player;
    const item = p.rig.field?.items?.find((i) => i.socket === 'shoulderR' || i.type === 'limb');
    const okFit = item ? p.rig.attach('shoulderR', item) : false;
    return { tried: !!item, okFit, occupant: p.rig.occupant('shoulderR') };
  });
  await page.waitForTimeout(700);
  note(`re-attach: tried=${on.tried} ok=${on.okFit} occupant=${on.occupant}`);

  const afterOn = await page.evaluate(countVisible);
  note(`after re-attach: ${afterOn.stray} stray visible procedural meshes`);
  if (afterOn.stray === 0) pass('no procedural arm left floating after re-attach');
  else fail(`${afterOn.stray} procedural meshes visible after re-attach: ${afterOn.names.join(', ')}`);

  const armBack = await page.evaluate(() => +window.__rrr.engine.player.avatar.bones.RightArm.scale.x.toFixed(5));
  if (on.occupant !== 'limb' || armBack > 0.5) pass(`mesh arm restored (bone scale ${armBack})`);
  else fail(`socket refilled but the mesh arm is still collapsed (${armBack})`);

  await shot('mesh-limb-back');
}
