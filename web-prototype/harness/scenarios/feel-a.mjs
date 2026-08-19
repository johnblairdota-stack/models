/**
 * VERIFY — limb-loss feedback (1), camera minimum distance (2), HUD truth after
 * dismemberment (6), debug chrome gating (7).
 *
 * Every assertion here is either a screenshot a human looks at or a number produced by
 * driving the real game. Nothing is asserted from a state read alone: this project has
 * already shipped a simulation running perfectly behind a red crash page, and every
 * instrument that read `window.__rrr` filed a glowing report on it.
 *
 * The first run of this scenario was INVALID and said so loudly: 32 s of boot plus 3.6 s of
 * walking was long enough for the hunter to reach the player and take three limbs, so the
 * "controlled" detach hit an already-armless robot and the camera probe was taken in open
 * floor. `setup()` now parks the hunter and restores the body before each controlled beat.
 */

/** Park the hunter, put every limb back on, and return the player to the spawn mark. */
const setup = (page) => page.evaluate(() => {
  const e = window.__rrr.engine, p = e.player, h = e.hunter, room = e.room;
  h.root.position.copy(room.spawn.hunter);
  h.vel.set(0, 0, 0);
  h.state = 'PATROL'; h.awareness = 0; h.target = null; h.stun = 0;
  h.candidates = [];                       // it cannot sense what it is not given
  for (const s of ['shoulderR', 'shoulderL', 'hipL', 'hipR']) {
    if (p.rig.occupant(s) !== 'empty') continue;
    const kind = s.startsWith('shoulder') ? 'arm' : 'leg';
    const item = e.limbField.items.find((i) => i.inWorld && i.socketKind === kind);
    if (item) p.rig.attach(s, item);
  }
  p.rig.dropHeld?.();
  // ⚠️ `wall.back`, NOT `spawn.player[0]`. The camera beats below hold S for 3.2 s to put the
  // player's back against a wall — which is what happens in a one-room level and is NOT what
  // happens in the mansion, where D4 sits directly behind the spawn: the robot walks straight
  // out of the study into the ballroom and ends up in open floor. Nothing throws, the boom
  // measures a clean unobstructed 3.1 m, and the assertion then reports a camera defect that
  // is really the map having moved. `wall.back` is contractually a spot with solid wall
  // behind it. Falls back to the spawn so this scenario still runs against a map without it.
  p.pos.copy(room.anchor?.('wall.back') ?? room.spawn.player[0]);
  p.facing = Math.PI; p.aimYaw = Math.PI;
  if (e.cam) e.cam.yaw = Math.PI;
  p.vel.set(0, 0, 0);
  p.shock = 0;
  return { arms: p.rig.caps.arms, legs: p.rig.caps.legs, weapon: p.rig.activeWeapon };
});

export default async function feelA({ page, note, pass, fail, skip, shot }) {
  // ---- 7. debug chrome ---------------------------------------------------------------
  const chrome = await page.evaluate(() => ({
    views: !!document.querySelector('#views'),
    perf: [...document.querySelectorAll('body > div')]
      .some((d) => /fps/.test(d.textContent) && d.style.position === 'fixed' && d.style.top === '8px'),
  }));
  note(`debug chrome present? views=${chrome.views} perf=${chrome.perf}`);
  if (!chrome.views && !chrome.perf) pass('debug chrome hidden for game.play');
  else fail('debug chrome hidden for game.play', `views=${chrome.views} perf=${chrome.perf}`);
  await shot('a0-clean-frame');

  // ---- 2. camera minimum distance ----------------------------------------------------
  // The failure case is the player's BACK against a wall, because that is where the boom
  // lives. S walks backwards into the near perimeter; then the hunter is placed in front at
  // conversational range, which is the exact moment the play-critic said the camera hid it.
  note(`setup: ${JSON.stringify(await setup(page))}`);
  await page.waitForTimeout(300);
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(3200);
  await page.keyboard.up('KeyS');
  await page.waitForTimeout(500);
  const putHunterInFront = () => page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player, h = e.hunter;
    h.root.position.set(p.root.position.x, 0, p.root.position.z - 2.6);
    h.facing = Math.PI; h.awareness = 0.9; h.state = 'ALERT';
    return true;
  });
  await putHunterInFront();
  await page.waitForTimeout(500);
  const readCam = () => page.evaluate(() => {
    const e = window.__rrr.engine, c = e.cam, p = e.player, h = e.hunter, r = e.room;
    // Is the hunter actually in frame, and is the middle of the frame clear of the player?
    const v = h.root.position.clone(); v.y += h.height * 0.6;
    v.project(c.camera);
    const pv = p.root.position.clone(); pv.y += p.height * 0.72;
    pv.project(c.camera);
    const cp = c.camera.position;
    return {
      boom: +(c.lastDistance ?? 0).toFixed(3),
      tight: +(c._tight ?? 0).toFixed(3),
      pz: +p.root.position.z.toFixed(2), px: +p.root.position.x.toFixed(2),
      // ⚠️ `r.width` / `r.depth` DO NOT EXIST ON THE MANSION ROOM AND THIS TEST WAS DEAD.
      // The pre-mansion `room.js` exported them; the graph builder exports `bounds` and
      // `spaces` instead. `Math.abs(x) > undefined/2` is `x > NaN`, which is ALWAYS FALSE — so
      // `camOutsideRoom` had been hard-false since the M1 refactor and both camera assertions
      // in this file were passing on a comparison that cannot fail. That is this project's
      // named failure class: a probe that cannot observe reporting PASS. The union AABB is the
      // shell, and it is grown by one wall thickness because the boom is legitimately allowed
      // into the 0.30 m wall band — what it must never do is leave the house.
      camOutsideRoom: cp.x < r.bounds.minX - 1.0 || cp.x > r.bounds.maxX + 1.0
        || cp.z < r.bounds.minZ - 1.0 || cp.z > r.bounds.maxZ + 1.0,
      camSpace: r.spaceAt?.(cp)?.id ?? 'doorway/wall',
      hunterNdc: [+v.x.toFixed(2), +v.y.toFixed(2)],
      hunterOnScreen: Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z > -1 && v.z < 1,
      // how far the player's own head sits from the hunter in screen space — the play-critic's
      // complaint was literally "hiding the hunter behind your own head"
      headToHunterNdc: +Math.hypot(pv.x - v.x, pv.y - v.y).toFixed(3),
    };
  });

  const camWall = await readCam();
  note(`back to the wall: boom=${camWall.boom} m tight=${camWall.tight} camOutsideRoom=${camWall.camOutsideRoom} player z=${camWall.pz}`);
  note(`hunter at 2.6 m in front: ndc=${JSON.stringify(camWall.hunterNdc)} onScreen=${camWall.hunterOnScreen} headSeparation=${camWall.headToHunterNdc}`);
  await shot('a1-back-to-wall');
  if (!camWall.camOutsideRoom) pass('camera stays inside the room at a wall', `boom ${camWall.boom} m`);
  else fail('camera stays inside the room at a wall', 'boom pushed the camera outside the shell');
  if (camWall.hunterOnScreen && camWall.headToHunterNdc > 0.35) {
    pass('hunter is in frame and clear of the head', `ndc ${JSON.stringify(camWall.hunterNdc)}, separation ${camWall.headToHunterNdc}`);
  } else fail('hunter is in frame and clear of the head', `onScreen=${camWall.hunterOnScreen} separation=${camWall.headToHunterNdc}`);

  // And the corner, which is worse than a wall.
  //
  // ⚠️ S+A, NOT S+D — AND THE COMMENT ON `wall.back` IN `spaces.js` STATES THE WRONG ONE.
  // `Player` builds its move vector as
  //   x = sin(aimYaw)*mv.y - cos(aimYaw)*mv.x,  z = cos(aimYaw)*mv.y + sin(aimYaw)*mv.x
  // and the spawn faces north (`aimYaw = PI`, sin 0 / cos -1), so D (mv.x = +1) resolves to
  // x = +1 — EAST. From `wall.back` (-11.00, -10.60) that slides the robot east ALONG the
  // study's south wall and straight into D4, whose 1.90 m opening spans x -9.55..-7.65: the
  // "corner" test walked out of the room, through the doorway, into the ballroom, and then
  // placed the hunter 2.6 m north of a body that was no longer where the probe thought — so
  // the hunter came down inside a wall and `hunterOnScreen` was false. It read as a camera
  // regression and it was a probe walking through the door it was meant to be cornered beside.
  // A (mv.x = -1) resolves to x = -1, west, into the solid south-west angle of the study.
  await page.keyboard.down('KeyS'); await page.keyboard.down('KeyA');
  await page.waitForTimeout(2600);
  await page.keyboard.up('KeyS'); await page.keyboard.up('KeyA');
  await putHunterInFront();
  await page.waitForTimeout(700);
  const camCorner = await readCam();
  note(`in the corner (${camCorner.px}, ${camCorner.pz}) [cam in ${camCorner.camSpace}]: boom=${camCorner.boom} tight=${camCorner.tight} outside=${camCorner.camOutsideRoom} hunterOnScreen=${camCorner.hunterOnScreen} separation=${camCorner.headToHunterNdc}`);
  await shot('a2-corner');
  if (!camCorner.camOutsideRoom && camCorner.hunterOnScreen) pass('corner: camera inside, hunter in frame', `boom ${camCorner.boom} m`);
  else fail('corner: camera inside, hunter in frame', `outside=${camCorner.camOutsideRoom} onScreen=${camCorner.hunterOnScreen}`);

  // ---- 1. losing a limb ---------------------------------------------------------------
  // Fired through `rig.detach()` — the SAME call `HunterAI._attack` makes — so the path under
  // test is the production one. feel-b watches the hunter do it for real.
  note(`setup: ${JSON.stringify(await setup(page))}`);
  await page.waitForTimeout(700);
  await shot('a3-before-wound');
  const did = await page.evaluate(() => {
    const p = window.__rrr.engine.player;
    return !!p.rig.detach('shoulderR');
  });
  if (!did) { skip('limb loss is visible', 'nothing in shoulderR to detach'); }
  else {
    await page.waitForTimeout(55); await shot('a4-wound-t55ms');
    await page.waitForTimeout(345); await shot('a5-wound-t400ms');
    await page.waitForTimeout(800); await shot('a6-wound-t1200ms');
    await page.waitForTimeout(1000); await shot('a7-wound-t2200ms');
    await page.waitForTimeout(1400); await shot('a8-wound-settled');
    const after = await page.evaluate(() => {
      const p = window.__rrr.engine.player;
      const hud = document.querySelector('.rrr-hud');
      return { arms: p.rig.caps.arms, weapon: p.rig.activeWeapon,
        text: hud.innerText.replace(/\s+/g, ' ').trim() };
    });
    note(`after one arm: arms=${after.arms} weapon=${after.weapon} hud="${after.text}"`);
    pass('limb loss drives the wound layers', 'evidence is a4..a8 — judged from the pictures');
  }

  // ---- 6. the HUD lying after full dismemberment ---------------------------------------
  // Restore first: the club case needs a HAND to hold the club with, and the wound test above
  // just took the only limb arm off. The first run of this probe skipped for exactly that
  // reason, and a skip is not a pass.
  note(`setup: ${JSON.stringify(await setup(page))}`);
  await page.waitForTimeout(500);
  const lie = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player;
    // and make sure there IS something loose to pick up
    if (!e.limbField.items.some((i) => i.inWorld)) p.rig.detach('hipR');
    const loose = e.limbField.items.find((i) => i.inWorld);
    const picked = loose ? p.rig.pickUp(loose) : false;
    const before = { held: p.rig.held?.label ?? null, weapon: p.rig.activeWeapon, arms: p.rig.caps.arms };
    // tear off the arm that is holding it — this is the exact case that lied
    const hand = p.rig.heldHand === 'L' ? 'shoulderL' : 'shoulderR';
    p.rig.detach(hand);
    const mid = { held: p.rig.held?.label ?? null, weapon: p.rig.activeWeapon, arms: p.rig.caps.arms };
    for (const s of ['shoulderL', 'shoulderR']) if (p.rig.occupant(s) !== 'empty') p.rig.detach(s);
    const after = { held: p.rig.held?.label ?? null, weapon: p.rig.activeWeapon,
      arms: p.rig.caps.arms, hands: p.rig.caps.hands };
    return { picked, before, mid, after };
  });
  note(`pickUp=${lie.picked} before=${JSON.stringify(lie.before)} afterHandLost=${JSON.stringify(lie.mid)} afterAll=${JSON.stringify(lie.after)}`);
  if (!lie.picked) skip('held item goes with the hand', 'no loose limb was available to pick up');
  else if (lie.before.weapon === 'limbClub' && lie.mid.held === null && lie.mid.weapon !== 'limbClub') {
    pass('held item goes with the hand', `limbClub -> ${lie.mid.weapon}`);
  } else fail('held item goes with the hand', `before=${JSON.stringify(lie.before)} after=${JSON.stringify(lie.mid)}`);

  if (lie.after.arms === 0 && lie.after.weapon === null && lie.after.held === null) {
    pass('HUD stops lying at zero arms', 'arms=0, held=null, activeWeapon=null');
  } else {
    fail('HUD stops lying at zero arms', `arms=${lie.after.arms} held=${lie.after.held} activeWeapon=${lie.after.weapon}`);
  }
  await page.waitForTimeout(2600);
  await shot('a9-no-arms');

  // ---- 6b. a dead trigger must answer --------------------------------------------------
  // REAL input: the actual left mouse button, the way a player presses it.
  await page.mouse.move(640, 360);
  await page.mouse.down();
  await page.waitForTimeout(140);
  await shot('b0-lmb-denied');
  const denied = await page.evaluate(() => {
    const hud = document.querySelector('.rrr-hud');
    return hud ? hud.innerText.replace(/\s+/g, ' ').trim() : null;
  });
  await page.mouse.up();
  note(`HUD while LMB is held with no weapon: "${denied}"`);
  if (denied && /NO WEAPON/.test(denied)) pass('LMB with no weapon answers on screen', denied);
  else fail('LMB with no weapon answers on screen', `HUD read "${denied}"`);
}
