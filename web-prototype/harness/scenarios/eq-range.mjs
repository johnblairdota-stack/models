/** Does E actually pick up when an item is provably IN RANGE? interact() uses radius 1.25. */
export default async function eqRange({ page, note, pass, fail, shot, pageErrors, consoleErrors }) {
  const snap = () => page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const items = e.limbField.items.filter((i) => i.inWorld);
    return {
      pos: [+p.pos.x.toFixed(2), +p.pos.z.toFixed(2)],
      held: p.rig.held?.label ?? null,
      arms: p.rig.caps.arms, legs: p.rig.caps.legs,
      wounds: p.rig.caps.wounds,
      nearestDist: items.length
        ? +Math.min(...items.map((i) => i.root.position.distanceTo(p.pos))).toFixed(2) : null,
      loose: items.length,
      prompt: document.querySelector('.rrr-hud')?.innerText.match(/\[E\][^\n]*/)?.[0] ?? null,
    };
  });

  // Detach a leg, then TELEPORT the loose item onto the player so range cannot be the excuse.
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    p.rig.detach('hipR');
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const it = e.limbField.items.find((i) => i.inWorld);
    if (it) { it.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z); it.vel?.set?.(0, 0, 0); }
  });
  await page.waitForTimeout(500);
  const before = await snap();
  note(`in range: ${JSON.stringify(before)}`);
  await shot('range0-item-underfoot');

  await page.keyboard.press('KeyE');
  await page.waitForTimeout(600);
  const after = await snap();
  note(`after E:  ${JSON.stringify(after)}`);
  await shot('range1-after-E');

  const changed = after.held !== before.held || after.legs !== before.legs || after.loose !== before.loose;
  if (changed) pass('E acts on an item underfoot', `legs ${before.legs}->${after.legs} loose ${before.loose}->${after.loose} held ${after.held}`);
  else fail('E acts on an item underfoot', `nothing changed at ${before.nearestDist} m (radius 1.25); prompt=${before.prompt}`);

  const errs = [...pageErrors, ...consoleErrors];
  if (errs.length) fail('no errors during E', errs.join(' | ').slice(0, 300));
  else pass('no errors during E');
}
