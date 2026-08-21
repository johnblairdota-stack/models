/**
 * _solo6_armless — WHAT HAPPENS TO A SOLO RUNNER WITH NO ARMS AND TWO LEGS?
 *
 * `gaitFor({legs:2, arms:0})` returns 'walk', so `caps.downed` is false and `views/game.js`'s
 * only lose condition — `if (player.caps?.gait === 'down') run.down('p1')` — never fires.
 * The hammer needs `caps.arms === 2`. So: is there any verb left, and does the run ever end?
 */
import { makeWorld, THREE, RULES } from './_solo1_boot.mjs';
const { gaitFor, SOCKETS } = RULES;

console.log('gait table, by what is attached:');
for (const [legs, arms] of [[2,2],[2,1],[2,0],[1,2],[1,0],[0,2],[0,1],[0,0]])
  console.log(`  legs ${legs} arms ${arms} -> gait ${gaitFor({legs,arms,skates:false}).padEnd(6)} speedScale ${RULES.speedScaleFor(gaitFor({legs,arms,skates:false}))}  downed=${gaitFor({legs,arms,skates:false}) === 'down'}`);

const W = await makeWorld({ seed: 's0' });
const { player, limbField, hunter } = W;
// take the hammer the way the game does
player.sledge.owned = true; player.sledge.equip();
console.log('\nstart: arms', player.caps.arms, 'hammer', player.sledge.equipped);

// the hunter takes both arms, exactly as `_attack` does (same order, same absorb)
const taken = [];
for (const s of ['shoulderL', 'shoulderR']) {
  const item = player.rig.detach(s, { impulse: new THREE.Vector3(0,1,0), spin: new THREE.Vector3() });
  hunter.absorb(item);
  taken.push(`${s}:item=${!!item} held=${!!item?.held} attached=${!!item?.attachedTo} inWorld=${!!item?.inWorld}`);
}
console.log('after two takes:', taken.join(' · '));
console.log('caps', JSON.stringify(player.caps));
console.log('hammer equipped', player.sledge.equipped, '· owned', player.sledge.owned,
  '· can redraw:', player.caps.arms >= 2);
{ const a = player.attack(100); console.log('attack() returns:', a ? (a.weapon ?? a.denied ?? JSON.stringify(Object.keys(a))) : String(a)); }
console.log('rig.activeWeapon:', player.rig.activeWeapon);
const inWorld = limbField.items.filter((i) => i.inWorld);
console.log('items still on a floor:', inWorld.map((i) => i.type + '/' + (i.socketKind ?? '-')).join(', ') || '(none)');
console.log('any ARM on a floor to refit:', inWorld.some((i) => i.socketKind === 'arm'));
{ const i2 = player.interact(limbField, 1.25); console.log('interact() with nothing in reach:', i2 ? i2.kind : String(i2)); }

// could the player walk to the one arm-shaped thing left and put it back?
const arms = limbField.items.filter((i) => i.socketKind === 'arm' && i.inWorld);
console.log('recoverable arms in the whole house:', arms.length);
console.log('\nrun state: phase', W.run.phase, '· `down` would need gait', 'down', '· actual gait', player.caps.gait);
W.run.tick(1); console.log('after 1 s of ticking, phase', W.run.phase, 't', W.run.t.toFixed(1), '· bombLeft', W.run.bombLeft);
console.log('\nis there ANY clock that ends an EXPLORE run? bombSeconds only starts on escape():',
  'bombLeft =', W.run.bombLeft);
