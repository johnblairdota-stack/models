/**
 * LOOK — the two "something is coming" tells are claims about pixels, so they get pictures.
 *   · the hunter's eye, unaware vs alert (a material emissive ramp, not a light)
 *   · the HUD threat vignette at 0, 0.45 and 1.0
 * `_setEyeDrive` writes `emissiveIntensity` on a material found by name. If that lookup ever
 * fails it fails SILENTLY and the tell simply does not exist — which is this project's single
 * most expensive defect class. So: look at it.
 */
export default async function lookTells({ page, note, pass, fail, shot }) {
  // ⚠️ The pair is `room.anchor('tell.player'/'tell.hunter')`, not coordinates in this file.
  // The old hardcoded `(-1.6, 4.6)` / `(-1.6, 2.3)` were points in the one-room map; carried
  // into a mansion they would place the faceplate inside a wall and this probe would go on
  // reporting a confident emissive number about a thing nobody can see.
  //
  // It is `tell.*` and not `duel.*` for one measured reason: this probe judges PICTURES, and
  // `duel.player` is chosen so a 6 m fight fits in front of it, which leaves the camera boom
  // jammed against the wall behind. `tell.player` keeps 3 m of clear floor behind the player.
  const GAP = 2.3;
  const place = (aw) => page.evaluate(([a, gap]) => {
    const e = window.__rrr.engine, p = e.player, h = e.hunter, r = e.room;
    h.candidates = [];
    const P = r.anchor('tell.player'), H = r.anchor('tell.hunter');
    const dir = H.clone().sub(P).setY(0).normalize();
    p.pos.copy(P); p.vel.set(0, 0, 0);
    p.facing = Math.atan2(dir.x, dir.z); p.aimYaw = p.facing;
    if (e.cam) e.cam.yaw = p.aimYaw;
    // close, and facing the player, so the faceplate fills enough of the frame to judge
    h.root.position.copy(P.clone().addScaledVector(dir, gap)); h.vel.set(0, 0, 0);
    h.facing = Math.atan2(-dir.x, -dir.z); h.state = 'PATROL'; h.scan = 0;
    h.awareness = a;
    h.__pin = a;
    if (!h.__pinned) { h.__pinned = true; e.onUpdate(() => { h.awareness = h.__pin; }); }
    return true;
  }, [aw, GAP]);

  const eye = () => page.evaluate(() => {
    const h = window.__rrr.engine.hunter;
    let m = null;
    h.rig.root.traverse((o) => {
      const mm = o.material; if (!mm || m) return;
      for (const x of Array.isArray(mm) ? mm : [mm]) if (x?.name === 'hunter.faceplate') { m = x; break; }
    });
    return m ? { found: true, ei: +m.emissiveIntensity.toFixed(2), hex: '#' + m.emissive.getHexString() } : { found: false };
  });

  await place(0); await page.waitForTimeout(1800);
  const dark = await eye();
  await shot('t1-eye-unaware');
  await place(0.5); await page.waitForTimeout(1800);
  await shot('t2-eye-half');
  await place(1); await page.waitForTimeout(1800);
  const lit = await eye();
  await shot('t3-eye-alert');
  note(`faceplate emissiveIntensity: unaware ${dark.ei} -> alert ${lit.ei} (${lit.hex}), found=${lit.found}`);
  if (!lit.found) fail('the eye ramp reaches a real material', 'no material named hunter.faceplate in the stage rig');
  else if (lit.ei > dark.ei * 1.5) pass('the eye ramp reaches a real material', `${dark.ei} -> ${lit.ei}`);
  else fail('the eye ramp reaches a real material', `${dark.ei} -> ${lit.ei}, barely moved`);

  // ---- the threat vignette, at three levels, same frame ---------------------------------
  await place(0);
  for (const v of [0, 0.45, 1.0]) {
    await page.evaluate((x) => {
      const e = window.__rrr.engine;
      // Override the HUNTER'S getter, not the HUD setter: game.js calls setThreat and then
      // paints inside the SAME updater, so an updater registered later overwrote the value
      // after the paint and the first run of this probe measured opacity 0 on a layer that
      // paints perfectly well in real play.
      window.__threat = x;
      Object.defineProperty(e.hunter, 'threat', { configurable: true, get: () => window.__threat });
    }, v);
    await page.waitForTimeout(2200);
    await shot(`t4-threat-${String(v).replace('.', '')}`);
  }
  const opacity = await page.evaluate(() => {
    const el = document.querySelector('.rrr-hud')?.firstElementChild;
    return el ? { opacity: el.style.opacity, bg: (el.style.background || '').slice(0, 60) } : null;
  });
  note(`threat layer at 1.0: ${JSON.stringify(opacity)}`);
  if (opacity && +opacity.opacity > 0.1) pass('threat layer paints', `opacity ${opacity.opacity}`);
  else fail('threat layer paints', `opacity ${opacity?.opacity}`);
}
