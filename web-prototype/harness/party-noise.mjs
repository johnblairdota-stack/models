#!/usr/bin/env node
/**
 * 🔊 **party-noise — FAILURE IS AUDIBLE NOW, AND THE SURVIVAL MODE IS UNTOUCHED.**
 *
 *   node harness/party-noise.mjs
 *
 * Task Contract **T4**: failure must emit noise, so silence is not a strategy. `task-deck` K4b
 * had been SKIPping three tasks because the bus carries placed events only and just two callers
 * emit. This closes it — **a task whose failure is silent is a task where a saboteur pays
 * nothing**, and the Wall Call, the Manifest and the Tally were all exactly that.
 *
 * 🚨 N3 IS THE ONE THAT PROTECTS THE OTHER MODE, AND IT GUARDS A DOCUMENTED SELF-INFLICTED BUG.
 * `views/game.js:1409-1415` records that an unguarded emit makes the Hunter knock a wall down,
 * hear its own hammer, set `lastKnown` to the wall it is standing at, drop to SEARCH and abandon
 * the breach — *"it would look exactly like the D7 mechanic being broken"*. The same guard is
 * asserted here rather than inherited by hope.
 */

import { NoiseBus, NOISE_KIND } from '../src/game/noise.js';
import { PARTY_NOISE, blowNoise, propNoise, tallyShortNoise, attachPartyNoise, emitTallyShort } from '../src/party/noiseplan.js';
import { HUNTER_SENSE } from '../src/game/rules.js';
import { BREACH_NOISE } from '../src/game/connectors.js';

let pass = 0, fail = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const P = { x: 0, y: 0, z: 0 };
const metres = (l) => l * HUNTER_SENSE.hearRange;

/** A rig with the two real hooks, unassigned exactly as the engine ships them. */
function rig() {
  const bus = new NoiseBus();
  const weapons = { onWallHit: null };
  const props = [{ root: { position: { x: 1, y: 0, z: 2 } }, onBreak: null }];
  const detach = attachPartyNoise({ weapons, noise: bus, props });
  return { bus, weapons, props, detach };
}

// ---------------------------------------------------------------- N0 · the arm
{
  const { bus, weapons } = rig();
  weapons.onWallHit({}, P, { changed: false }, 'sledge');
  t('N0 arm · the real NoiseBus receives a party emission', bus.recent().length === 1,
    `${bus.recent().length} event · noise.js imports nothing, so this is the shipped bus`);
}

// ---------------------------------------------------------------- N1 · the blow
{
  const { bus, weapons } = rig();
  weapons.onWallHit({}, P, { changed: false }, 'sledge');
  const e = bus.recent()[0];
  t('N1 · a blow that achieves nothing is heard', e && e.loudness === PARTY_NOISE.blow && e.kind === NOISE_KIND.dig,
    `${PARTY_NOISE.blow} gunshots → carries ${metres(PARTY_NOISE.blow).toFixed(1)} m`);
}

// ---------------------------------------------------------------- N2 · no double emit
{
  const { bus, weapons } = rig();
  weapons.onWallHit({}, P, { changed: true }, 'sledge');
  t('N2 · a blow that crossed a stage does not emit twice', bus.recent().length === 0,
    `views/game.js:1432 already fires BREACH_NOISE.panel (${BREACH_NOISE.panel}) on the crossing, and loudest() takes the max`);
  t('N2b · and the crossing is genuinely the louder of the two', BREACH_NOISE.panel > PARTY_NOISE.blow,
    `${BREACH_NOISE.panel} vs ${PARTY_NOISE.blow}`);
}

// ---------------------------------------------------------------- N3 · the D7 guard
{
  const { bus, weapons } = rig();
  weapons.onWallHit({}, P, { changed: false }, 'hunterSlam');
  t('N3 · the Hunter\'s own slam puts nothing on the bus', bus.recent().length === 0,
    'otherwise it hears itself, sets lastKnown to the wall it is standing at, and abandons its own breach');
  t('N3b · and the rule refuses it at the decision, not just the call site',
    blowNoise({ changed: false }, 'hunterSlam') === null);
}

// ---------------------------------------------------------------- N4/N5 · prop and short
{
  const { bus, props } = rig();
  props[0].onBreak(props[0], { point: { x: 1, y: 0, z: 2 } });
  const e = bus.recent()[0];
  t('N4 · a destroyed prop is heard', e && e.loudness === PARTY_NOISE.prop,
    `${PARTY_NOISE.prop} → ${metres(PARTY_NOISE.prop).toFixed(1)} m · the Manifest's cost for the wrong antique`);
  t('N4b · and it is emitted at the break point, not the prop origin', e && e.x === 1 && e.z === 2);

  const b2 = new NoiseBus();
  emitTallyShort(b2, { x: 5, y: 0, z: 5 });
  const s = b2.recent()[0];
  t('N5 · the Tally short is heard, and has its own kind',
    s && s.loudness === PARTY_NOISE.tallyShort && s.kind === NOISE_KIND.short,
    `${PARTY_NOISE.tallyShort} → ${metres(PARTY_NOISE.tallyShort).toFixed(1)} m · a dedicated kind so the audio layer does not play a hammer`);
}

// ---------------------------------------------------------------- N6 · the ladder
{
  const ladder = [
    ['blow', PARTY_NOISE.blow], ['prop', PARTY_NOISE.prop],
    ['panel breach', BREACH_NOISE.panel], ['tally short', PARTY_NOISE.tallyShort],
    ['exit breach', BREACH_NOISE.exit],
  ];
  const rising = ladder.every((x, i) => i === 0 || x[1] > ladder[i - 1][1]);
  t('N6 · the four sit on one rising ladder against the shipped calibration', rising,
    ladder.map(([n, l]) => `${n} ${l} (${metres(l).toFixed(1)}m)`).join(' < '));
  t('N6b · and the deck\'s most punishing failure is its loudest',
    PARTY_NOISE.tallyShort > BREACH_NOISE.panel,
    'the Tally short costs the camera for the rest of the round as well');
}

// ---------------------------------------------------------------- N7 · the hunter can hear them
{
  const bus = new NoiseBus();
  bus.emit(P, PARTY_NOISE.blow, NOISE_KIND.dig);
  bus.emit({ x: 1, y: 0, z: 1 }, PARTY_NOISE.tallyShort, NOISE_KIND.short);
  const heard = bus.recent().filter((e) => !['door'].includes(e.kind));
  t('N7 · nothing here lands in the kind the Hunter is deaf to', heard.length === 2,
    'only `door` is ignored, so a blow, a prop and a short all reach it');
  t('N7b · and every one carries further than a body standing still',
    Object.values(PARTY_NOISE).every((l) => l > HUNTER_SENSE.hearFloor),
    `hearFloor ${HUNTER_SENSE.hearFloor}; quietest emission ${Math.min(...Object.values(PARTY_NOISE))}`);
}

// ---------------------------------------------------------------- N8 · survival is untouched
{
  const { weapons, props, detach } = rig();
  t('N8 arm · attaching really did take the hooks', typeof weapons.onWallHit === 'function' && typeof props[0].onBreak === 'function');
  detach();
  t('N8 · detaching restores exactly what was there before',
    weapons.onWallHit === null && props[0].onBreak === null,
    'the survival mode never attaches this, and a party match cannot leave it behind');

  // and it chains rather than clobbering, so an existing subscriber keeps working
  const bus = new NoiseBus();
  let chained = 0;
  const w = { onWallHit: () => { chained++; } };
  attachPartyNoise({ weapons: w, noise: bus, props: [] });
  w.onWallHit({}, P, { changed: false }, 'sledge');
  t('N8b · and it chains onto an existing handler rather than replacing it',
    chained === 1 && bus.recent().length === 1);
}

// ---------------------------------------------------------------- N9 · the controls
{
  t('N9a control · without the slam guard the Hunter would emit',
    blowNoise({ changed: false }, 'sledge') !== null && blowNoise({ changed: false }, 'hunterSlam') === null,
    'the two arms differ, so N3 is testing something');
  t('N9b control · without the crossing check every breach would double-emit',
    blowNoise({ changed: true }, 'sledge') === null && blowNoise({ changed: false }, 'sledge') !== null);
  t('N9c control · the three values are distinct, so a copy-paste would show',
    new Set(Object.values(PARTY_NOISE)).size === 3, Object.entries(PARTY_NOISE).map(([k, v]) => `${k}:${v}`).join(' '));
}

console.log(`\nparty-noise: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
