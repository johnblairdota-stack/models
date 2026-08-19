/** Fitting a limb must be a physical event, not a silent teleport onto the body. */
export default async function fitSettleTest({ page, note, pass, fail, shot }) {
  const travel = async (label, act, ms = 900) => {
    const seen = {};
    await act();
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const o = await page.evaluate(() => {
        const g = window.__rrr.engine.player.gait.offset;
        return { x: o1(g.x), y: o1(g.y), yaw: o1(g.yaw), pitch: o1(g.pitch), roll: o1(g.roll) };
        function o1(v) { return +(v ?? 0).toFixed(4); }
      });
      for (const [k, v] of Object.entries(o)) {
        seen[k] ??= { min: v, max: v };
        seen[k].min = Math.min(seen[k].min, v); seen[k].max = Math.max(seen[k].max, v);
      }
      await page.waitForTimeout(45);
    }
    const span = Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, +(v.max - v.min).toFixed(4)]));
    const total = +Object.values(span).reduce((a, b) => a + b, 0).toFixed(4);
    note(`${label}: ${JSON.stringify(span)}  total ${total}`);
    return total;
  };

  // Baseline: standing still, nothing happening.
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player, room = e.room;
    p.pos.copy(room.anchor('gallery.mid')); p.vel.set(0, 0, 0);
  });
  await page.waitForTimeout(900);
  const idle = await travel('standing still', async () => {});

  // Detach, so there is a socket to fill and a loose limb underfoot.
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    if (p.rig.occupant('shoulderR') === 'limb') p.rig.detach('shoulderR');
  });
  await page.waitForTimeout(1400);           // let the detach kick fully settle
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    const it = e.limbField.items.find((i) => i.inWorld && i.socketKind === 'arm');
    if (it) it.root.position.set(p.pos.x, e.room.floorY + 0.1, p.pos.z);
    p.vel.set(0, 0, 0);
  });
  await page.waitForTimeout(700);
  await shot('fs0-before-fit');

  const fitted = await travel('fitting a limb', async () => {
    await page.evaluate(() => {
      const e = window.__rrr.engine, p = e.player;
      p.interact(e.limbField, 1.25, 'shoulderR');
    });
  });
  await shot('fs1-after-fit');

  const on = await page.evaluate(() => window.__rrr.engine.player.rig.occupant('shoulderR'));
  on === 'limb' ? pass('the limb went on', on) : fail('the limb went on', on);

  fitted > idle + 0.01
    ? pass('fitting a limb moves the body', `${idle} idle -> ${fitted} fitting`)
    : fail('fitting a limb moves the body', `${idle} idle vs ${fitted} fitting — silent`);
}
