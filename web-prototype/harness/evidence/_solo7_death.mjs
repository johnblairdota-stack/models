/**
 * _solo7_death — the two ends of the solo limb economy.
 *  A) can a runner the hunter has disarmed get a working verb back?
 *  B) does the solo LOSE condition — `run.down('p1')` — actually fire, and what ends the run?
 */
import { makeWorld, THREE, RULES } from './_solo1_boot.mjs';
const DT = 1 / 60;

// ---- A. refit after a disarm
{
  const W = await makeWorld({ seed: 's0' });
  const { player, limbField, hunter, room } = W;
  player.sledge.owned = true; player.sledge.equip();
  for (const s of ['shoulderL', 'shoulderR']) hunter.absorb(player.rig.detach(s, {}));
  console.log('A · after the hunter takes both arms');
  console.log('   caps.arms', player.caps.arms, '· gait', player.caps.gait, '· hammer redrawable', player.caps.arms >= 2);
  const absorbed = limbField.items.filter((i) => i.attachedTo);
  console.log('   limbs the hunter is wearing:', absorbed.length, '· limbs left on a floor:',
    limbField.items.filter((i) => i.inWorld && i.type === 'limb').length);
  // walk to the nail gun and press E
  const gun = limbField.items.find((i) => i.gadget === 'nailgun');
  player.pos.set(gun.root.position.x, 0, gun.root.position.z + 0.5);
  player._interactCd = 0;
  const got = player.interact(limbField, 1.25);
  console.log('   E on the nail gun with no arms ->', got ? got.kind + ' into ' + got.socket : String(got));
  console.log('   caps now:', JSON.stringify(player.caps));
  console.log('   activeWeapon', player.rig.activeWeapon, '· hammer redrawable', player.caps.arms >= 2);
}

// ---- B. stand still in front of it and count
{
  const W = await makeWorld({ seed: 's0' });
  const { player, hunter, run, room, noise, limbField } = W;
  const c = room.anchor('ballroom.centre');
  player.pos.set(c.x, 0, c.z);
  hunter.root.position.set(c.x + 4, 0, c.z);
  hunter.awareness = 1; hunter.state = 'PURSUE'; hunter.target = hunter.targets?.[0] ?? null;
  hunter.setTargets([W.playerBody]); hunter.target = W.playerBody;
  const marks = [];
  hunter.onKill = (t2, socket) => marks.push(`${socket}@${(T).toFixed(1)}s gait=${player.caps.gait}`);
  let T = 0;
  for (let i = 0; i < 60 * 120; i++) {
    T = i * DT;
    player.update(DT, T, { move: { x: 0, y: 0 }, run: false, aimYaw: player.aimYaw, aimPitch: 0 });
    noise.update(DT); hunter.update(DT, T); limbField.update(DT, T); room.update(DT);
    run.tick(DT);
    if (run.running && player.caps?.gait === 'down') run.down('p1');
    if (run.over) break;
  }
  console.log('\nB · standing still in the ballroom, hunter staged 4 m away');
  console.log('   takes:', marks.join(' · ') || '(none)');
  console.log('   ended at', T.toFixed(1), 's · phase', run.phase, '· gait', player.caps.gait,
    '· limbs', RULES.SOCKETS.filter((s) => player.rig.occupant(s) !== 'empty').length);
  console.log('   results:', JSON.stringify(run.results()));
  console.log('   hunter stage', hunter.stage, 'absorbed', hunter.absorbed, '· speed', RULES.HUNTER_SPEED[hunter.stage]);
}
