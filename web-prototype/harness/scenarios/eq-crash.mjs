/**
 * REPRODUCE John's playtest report: "E and Q seem to crash the game".
 *
 * Both are advertised on the game's own control card, so if either takes the view down it is
 * the worst class of bug this project ships. `Q` has done it before — it called
 * `player.dropHeld()`, a method on `LimbRig` and not on `Player`, and threw on every press
 * while the simulation kept running perfectly behind the red crash page. That is why this
 * asserts on PAGE ERRORS and on a still-advancing frame counter, not on state alone.
 *
 * Pressed in several states, because the earlier fix only covered "holding something":
 * empty-handed, holding a limb, after a detach, and spammed.
 */

const err = (pageErrors, consoleErrors) => [...pageErrors, ...consoleErrors];

export default async function eqCrash({ page, note, pass, fail, shot, pageErrors, consoleErrors }) {
  const frames = () => page.evaluate(() => window.__rrr?.frames?.() ?? null);
  const state = () => page.evaluate(() => {
    const e = window.__rrr?.engine, p = e?.player;
    if (!p) return null;
    return {
      arms: p.rig.caps.arms, legs: p.rig.caps.legs,
      held: p.rig.held?.label ?? null, weapon: p.rig.activeWeapon,
      loose: e.limbField.items.filter((i) => i.inWorld).length,
    };
  });

  const press = async (key, label) => {
    const before = await frames();
    const nErr = err(pageErrors, consoleErrors).length;
    await page.keyboard.press(key);
    await page.waitForTimeout(450);
    const after = await frames();
    const newErrs = err(pageErrors, consoleErrors).slice(nErr);
    const advanced = before != null && after != null && after > before;
    note(`${label}: frames ${before} -> ${after}  state=${JSON.stringify(await state())}`);
    if (newErrs.length) {
      fail(`${label} does not throw`, newErrs.join(' | ').slice(0, 300));
    } else if (!advanced) {
      fail(`${label} keeps the loop alive`, `frame counter stuck at ${after}`);
    } else {
      pass(`${label} is safe`);
    }
    return newErrs;
  };

  note(`start: ${JSON.stringify(await state())}`);
  await shot('eq0-start');

  // 1. empty-handed — nothing under foot, nothing held
  await press('KeyQ', 'Q with nothing held');
  await press('KeyE', 'E with nothing in reach');

  // 2. make a loose limb, walk onto it, then E to take it
  await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    p.rig.detach('hipR');                       // drops a leg at the feet
  });
  await page.waitForTimeout(700);
  await shot('eq1-after-detach');
  await press('KeyE', 'E over a dropped limb');
  await press('KeyQ', 'Q while holding it');
  await shot('eq2-after-drop');

  // 3. spam both — the cooldown path is where a null slips through
  const nErr = err(pageErrors, consoleErrors).length;
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press(i % 2 ? 'KeyE' : 'KeyQ');
    await page.waitForTimeout(90);
  }
  await page.waitForTimeout(500);
  const spamErrs = err(pageErrors, consoleErrors).slice(nErr);
  const f = await frames();
  note(`after spam: frames=${f} state=${JSON.stringify(await state())}`);
  if (spamErrs.length) fail('E/Q spam does not throw', spamErrs.join(' | ').slice(0, 300));
  else pass('E/Q spam is safe');
  await shot('eq3-after-spam');

  // 4. and with every limb gone, which is where `caps` goes to zero
  await page.evaluate(() => {
    const p = window.__rrr.engine.player;
    for (const s of ['shoulderL', 'shoulderR', 'hipL', 'hipR']) {
      if (p.rig.occupant(s) !== 'empty') p.rig.detach(s);
    }
  });
  await page.waitForTimeout(600);
  await press('KeyE', 'E with no limbs left');
  await press('KeyQ', 'Q with no limbs left');
  await shot('eq4-limbless');
}
