/** John: refitted limbs don't move; no punch animation with plain limbs. Measure both. */
export default async function refitAnim({ page, note, pass, fail, shot }) {
  const jointAngles = () => page.evaluate(() => {
    const u = window.__rrr.engine.player.unit;
    const g = (n) => { const j = u.joints[n]; return j ? +j.rotation.x.toFixed(4) : null; };
    return { hipR: g('hipR'), kneeR: g('kneeR'), hipL: g('hipL'), kneeL: g('kneeL'),
             shoulderR: g('shoulderR'), elbowR: g('elbowR') };
  });

  const travel = async (label, ms = 1400) => {
    const seen = {};
    const t0 = Date.now();
    await page.keyboard.down('KeyW');
    while (Date.now() - t0 < ms) {
      const a = await jointAngles();
      for (const [k, v] of Object.entries(a)) {
        if (v == null) continue;
        seen[k] ??= { min: v, max: v };
        seen[k].min = Math.min(seen[k].min, v); seen[k].max = Math.max(seen[k].max, v);
      }
      await page.waitForTimeout(70);
    }
    await page.keyboard.up('KeyW');
    const span = Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, +(v.max - v.min).toFixed(4)]));
    note(`${label}: joint travel ${JSON.stringify(span)}`);
    return span;
  };

  const before = await travel('ORIGINAL limbs walking');

  // detach a leg, pick it up, refit it
  await page.evaluate(() => window.__rrr.engine.player.rig.detach('hipR'));
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const it = e.limbField.items.find((i) => i.inWorld && i.socketKind === 'leg');
    if (it) it.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
  });
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(700);
  const refit = await page.evaluate(() => window.__rrr.engine.player.rig.occupant('hipR'));
  note(`hipR after E: ${refit}`);
  await shot('refit0');
  if (refit !== 'limb') { fail('refitted the leg', `hipR is ${refit}`); return; }

  const after = await travel('REFITTED limb walking');
  const ok = after.hipR > 0.02 && after.kneeR > 0.02;
  if (ok) pass('a refitted limb animates like an original', `hipR ${after.hipR} kneeR ${after.kneeR} (orig ${before.hipR}/${before.kneeR})`);
  else fail('a refitted limb animates like an original', `refitted hipR ${after.hipR} kneeR ${after.kneeR} vs original ${before.hipR}/${before.kneeR} — frozen`);

  // punch: strip to plain limbs (drop the gadget arm) and hit LMB
  const w = await page.evaluate(() => {
    const p = window.__rrr.engine.player;
    for (const s of ['shoulderL', 'shoulderR']) {
      if (p.rig.occupant(s) === 'gadget') p.rig.detach(s);
    }
    return p.rig.activeWeapon;
  });
  await page.waitForTimeout(600);
  note(`weapon with plain limbs: ${w}`);
  const p0 = await jointAngles();
  await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up();
  let moved = 0;
  for (let i = 0; i < 8; i++) {
    const a = await jointAngles();
    if (a.shoulderR != null && p0.shoulderR != null) moved = Math.max(moved, Math.abs(a.shoulderR - p0.shoulderR));
    await page.waitForTimeout(55);
  }
  await shot('punch0');
  note(`shoulder travel during punch: ${moved.toFixed(4)}`);
  if (moved > 0.05) pass('punching animates with plain limbs', `shoulder moved ${moved.toFixed(3)} rad`);
  else fail('punching animates with plain limbs', `shoulder moved only ${moved.toFixed(4)} rad`);
}
