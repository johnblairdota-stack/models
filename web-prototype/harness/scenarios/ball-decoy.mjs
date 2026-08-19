/**
 * attachments.md step 4 — the ball is a DECOY.
 *
 * NOTE ON AIM, learned by getting it wrong: the noise is heard from where the ball LANDS, and
 * `hearRange * strength` is ~11.9 m. A ball hurled at the far wall is inaudible and correctly
 * does nothing. A decoy is thrown NEAR the thing you want to move, on the far side of it from
 * you — that is the actual skill the verb asks for.
 */
export default async function ballDecoy({ page, note, pass, fail, shot }) {
  const read = () => page.evaluate(() => {
    const e = window.__rrr.engine, h = e.hunter, p = e.player;
    return {
      state: h.state, aware: +h.awareness.toFixed(3),
      lastKnown: [+h.lastKnown.x.toFixed(2), +h.lastKnown.z.toFixed(2)],
      hunterPos: [+h.root.position.x.toFixed(2), +h.root.position.z.toFixed(2)],
      playerPos: [+p.pos.x.toFixed(2), +p.pos.z.toFixed(2)],
      weapon: p.rig.activeWeapon,
    };
  });

  const setup = () => page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player, h = e.hunter, room = e.room;
    const a = room.anchor('ballroom.centre');
    p.pos.copy(a); p.vel.set(0, 0, 0); p.aimYaw = 0;
    h.root.position.set(a.x - 7, 0, a.z);           // 7 m to the player's left
    h.vel?.set?.(0, 0, 0);
    h.state = 'PATROL'; h.awareness = 0; h.target = null;
    for (const s of ['shoulderL', 'shoulderR']) if (p.rig.occupant(s) !== 'empty') p.rig.detach(s);
    p.rig.fitGadget?.('shoulderR', 'ball');
  });

  await setup();
  await page.waitForTimeout(900);
  const before = await read();
  note(`before: ${JSON.stringify(before)}`);
  await shot('bd0-before');
  if (before.weapon !== 'ball') { fail('the ball is fitted', `weapon=${before.weapon}`); return; }

  // Throw it PAST the hunter — 4 m beyond it, away from the player.
  const thrown = await page.evaluate(() => {
    const e = window.__rrr.engine, p = e.player, h = e.hunter;
    const target = h.root.position.clone();
    target.x -= 4;                                   // land beyond the hunter
    const d = target.clone().sub(p.eye).normalize();
    const out = e.weapons.fire('ball', p.eye.clone(), d, performance.now() / 1000, { ignore: p.rig });
    return {
      impact: out?.point ? [+out.point.x.toFixed(2), +out.point.z.toFixed(2)] : null,
      dHunterToImpact: out?.point ? +h.root.position.distanceTo(out.point).toFixed(2) : null,
    };
  });
  note(`ball landed at ${JSON.stringify(thrown.impact)}, ${thrown.dHunterToImpact} m from the hunter`);
  await page.waitForTimeout(700);
  const after = await read();
  note(`after:  ${JSON.stringify(after)}`);
  await shot('bd1-after-throw');

  after.state === 'SEARCH'
    ? pass('a thrown ball puts the hunter into SEARCH', `${before.state} -> ${after.state}`)
    : fail('a thrown ball puts the hunter into SEARCH', `state is ${after.state}`);

  const dImpact = thrown.impact ? Math.hypot(after.lastKnown[0] - thrown.impact[0], after.lastKnown[1] - thrown.impact[1]) : 999;
  const dPlayer = Math.hypot(after.lastKnown[0] - after.playerPos[0], after.lastKnown[1] - after.playerPos[1]);
  note(`lastKnown is ${dImpact.toFixed(2)} m from the impact, ${dPlayer.toFixed(2)} m from the player`);
  dImpact < dPlayer
    ? pass('it investigates the BALL, not the thrower', `${dImpact.toFixed(1)} m vs ${dPlayer.toFixed(1)} m`)
    : fail('it investigates the BALL, not the thrower', `${dImpact.toFixed(1)} m vs ${dPlayer.toFixed(1)} m`);

  const start = after.hunterPos;
  await page.waitForTimeout(2600);
  const moved = await read();
  const travelled = Math.hypot(moved.hunterPos[0] - start[0], moved.hunterPos[1] - start[1]);
  note(`hunter travelled ${travelled.toFixed(2)} m; now ${JSON.stringify(moved.hunterPos)}`);
  await shot('bd2-investigating');
  travelled > 0.6
    ? pass('the hunter commits and walks to the noise', `${travelled.toFixed(1)} m`)
    : fail('the hunter commits and walks to the noise', `moved only ${travelled.toFixed(2)} m`);

  // A decoy must NOT cancel an active chase. Keep a REAL target so PURSUE is stable —
  // emptying `candidates` makes the AI leave PURSUE by itself and proves nothing.
  const chased = await page.evaluate(() => {
    const e = window.__rrr.engine, h = e.hunter, p = e.player;
    h.state = 'PURSUE';
    h.target = h.candidates?.[0] ?? null;
    h.awareness = 1;
    h.lastKnown.copy(p.pos);
    const far = p.pos.clone(); far.x += 9;
    const heard = h.hearNoise(far, 0.85);
    return { heard, state: h.state, hasTarget: !!h.target };
  });
  note(`during PURSUE (target=${chased.hasTarget}): hearNoise returned ${chased.heard}, state ${chased.state}`);
  (chased.heard === false && chased.state === 'PURSUE')
    ? pass('a decoy cannot cancel an active chase', 'hearNoise refused while committed')
    : fail('a decoy cannot cancel an active chase', `heard=${chased.heard} state=${chased.state}`);
}
