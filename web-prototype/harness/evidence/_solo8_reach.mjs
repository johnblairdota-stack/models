/**
 * _solo8_reach — WHICH OF THE ENGINE'S AUTHORED STATES CAN A SOLO RUN ACTUALLY REACH?
 * Pure arithmetic and the shipped state machines. No renderer, no assumptions.
 */
import { makeWorld, RUN, RULES } from './_solo1_boot.mjs';
import { readFileSync } from 'node:fs';
const { PHASE, PHASE_ORDER, RunState, BOMB_SECONDS, DETONATION_SECONDS } = RUN;
const { HUNTER_GROWTH, HUNTER_SPEED, hunterStageFor, SOCKETS } = RULES;
const say = (k, v) => console.log('  ' + k.padEnd(58) + v);

console.log('\n1 · THE RUN PHASE MACHINE, driven exactly as views/game.js drives it');
{
  // views/game.js registers ONE player and never a second.
  const gameSrc = readFileSync(new URL('../../src/views/game.js', import.meta.url), 'utf8');
  const adds = [...gameSrc.matchAll(/run\.addPlayer\(([^)]*)\)/g)].map((m) => m[1]);
  say('run.addPlayer() call sites in views/game.js', `${adds.length} — ${adds.join(', ')}`);
  const r = new RunState({ seed: 's0', authority: true, sites: ['a', 'b'] });
  r.addPlayer('p1');
  const seen = new Set([r.phase]);
  r.onPhase((p) => seen.add(p));
  for (let i = 0; i < 600; i++) r.tick(1 / 60);          // ten seconds of EXPLORE
  r.escape('p1');
  for (let i = 0; i < 60 * (BOMB_SECONDS + DETONATION_SECONDS + 5); i++) r.tick(1 / 60);
  say('phases a ONE-PLAYER run can reach', [...seen].join(' -> '));
  say('phases the module declares', PHASE_ORDER.join(' -> '));
  say('unreachable in solo', PHASE_ORDER.filter((p) => !seen.has(p)).join(', ') || '(none)');
  say('BOMB_SECONDS / DETONATION_SECONDS', `${BOMB_SECONDS} / ${DETONATION_SECONDS} — never counted down`);
  // and the control: the SAME machine with a second player registered
  const r2 = new RunState({ seed: 's0', authority: true, sites: ['a', 'b'] });
  r2.addPlayer('p1'); r2.addPlayer('p2');
  const seen2 = new Set([r2.phase]); r2.onPhase((p) => seen2.add(p));
  r2.escape('p1');
  for (let i = 0; i < 60 * (BOMB_SECONDS + DETONATION_SECONDS + 5); i++) r2.tick(1 / 60);
  say('control · the same machine with TWO players registered', [...seen2].join(' -> '));
}

console.log('\n2 · THE HUNTER GROWTH CURVE, from the shipped seeding');
{
  const gameSrc = readFileSync(new URL('../../src/views/game.js', import.meta.url), 'utf8');
  const seeds = [...gameSrc.matchAll(/hunter\.absorbed = (\d+)/g)].map((m) => +m[1]);
  say('`hunter.absorbed = N` in views/game.js (boot + resetRound)', seeds.join(', '));
  const start = seeds[0] ?? 0;
  say('HUNTER_GROWTH', JSON.stringify(HUNTER_GROWTH));
  say('sockets a single body can lose', SOCKETS.length);
  say('absorbs reachable in one life without a refit', `${start} + ${SOCKETS.length} = ${start + SOCKETS.length}`);
  say('absorbs needed for stage 3', HUNTER_GROWTH.toStage3);
  say('stage after the 4th (and final) take', hunterStageFor(start + SOCKETS.length));
  say('HUNTER_SPEED table', JSON.stringify(HUNTER_SPEED));
  say('stage 3 reachable in a solo life?',
    (start + SOCKETS.length >= HUNTER_GROWTH.toStage3) ? 'YES' : 'NO — the run ends at the 4th take (gait "down")');
  say('and resetRound() puts absorbed back to', String(seeds[1] ?? seeds[0]));
}

console.log('\n3 · THE LOSE CONDITION');
{
  const gameSrc = readFileSync(new URL('../../src/views/game.js', import.meta.url), 'utf8');
  const downCalls = [...gameSrc.matchAll(/run\.down\([^)]*\)/g)].map((m) => m[0]);
  say('run.down() call sites in views/game.js', downCalls.join(', ') || '(none)');
  say('its guard', (gameSrc.match(/if \(player\.caps\?\.gait === '[a-z]+'\) run\.down/) || [])[0] ?? '?');
  for (const [legs, arms] of [[2,0],[1,0],[0,1],[0,0]])
    say(`  gait for legs ${legs} arms ${arms}`, RULES.gaitFor({ legs, arms, skates: false }) + (RULES.gaitFor({legs,arms,skates:false}) === 'down' ? '  <- the only one that loses' : ''));
  say('so a runner with 0 arms and 2 legs is', 'alive, full speed, and cannot lose');
}

console.log('\n4 · WHAT A ZERO-ARM RUNNER CAN STILL DO');
{
  const W = await makeWorld({ seed: 's0' });
  const { player, hunter, limbField } = W;
  player.sledge.owned = true; player.sledge.equip();
  for (const s of ['shoulderL', 'shoulderR']) hunter.absorb(player.rig.detach(s, {}));
  say('caps.arms', player.caps.arms);
  say('_toggleSledge gate is caps.arms === 2, so the hammer is', player.caps.arms >= 2 ? 'redrawable' : 'GONE FOR THE REST OF THE RUN');
  say('limbs the hunter absorbed (unrecoverable)', limbField.items.filter((i) => i.attachedTo).length);
  say('LIMBS left on any floor to refit', limbField.items.filter((i) => i.inWorld && i.type === 'limb').length);
  say('GADGET arms left on a floor (restore a weapon, never caps.arms)',
    limbField.items.filter((i) => i.inWorld && i.socketKind === 'arm').length);
}
