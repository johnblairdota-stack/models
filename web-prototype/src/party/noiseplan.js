/**
 * 🔊 **THE THREE MISSING EMISSIONS — making failure audible, which is Task Contract T4.**
 *
 * `task-deck` K4b has been SKIPping three tasks because the noise bus carries **placed events
 * only** (`noise.js:14-22`) and just two callers emit today, both in `views/game.js`. So a failed
 * breach, a smashed antique and a shorted camera were all silent — and **a task whose failure is
 * silent is a task where a saboteur pays nothing.**
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ NO OWNED FILE IS EDITED. BOTH HOOKS ALREADY EXISTED AND WERE UNASSIGNED.
 * ---------------------------------------------------------------------------------------------
 *   · `WeaponSystem.onWallHit` — declared at `weapons.js:35`, fired at `:191` on **every** blow,
 *     and set by nobody
 *   · `FurnProp.onBreak` — declared at `furnprop.js:76`, fired at `:207`/`:220`/`:243`/`:346`
 *     and from the voxel path at `furn-voxels.js:952`
 *
 * So this is a subscriber, not a patch. `views/game.js`, `wall.js`, `weapons.js` and `furnprop.js`
 * are untouched.
 *
 * 🚨 **AND IT IS NOT ATTACHED IN THE PARTY MODE EITHER. `attachPartyNoise` HAS NO CALL SITE
 * OUTSIDE `harness/party-noise.mjs`** — nothing in `src/` or `net/` imports this file. Everything
 * below is written, correct and gated; none of it runs in a game. Until something calls it, the
 * three emissions this file is named for do not happen and three of the deck's five tasks fail
 * Task Contract T4 in play.
 *
 * ⚠️ **THIS PARAGRAPH USED TO END "the survival mode is byte-identical because nothing attaches
 * this there".** Every word of that is true and the sentence is a trap: it draws a contrast with a
 * party mode that does not attach it either, so a reader arriving from `tasks.js`'s *"the three
 * that did not are built — see `noiseplan.js`"* lands on what reads as confirmation. Neither file
 * was lying; between them they described a wire that does not exist. The survival mode is
 * byte-identical because nothing attaches this ANYWHERE — which is the same shape as `taken.js`'s
 * `onKill` comment, and it went unexamined for the same reason.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 LOUDNESS IS IN GUNSHOTS AND THE CALIBRATION IS `BREACH_NOISE`, NOT A NEW SCALE.
 * ---------------------------------------------------------------------------------------------
 * `noise.js` is explicit: `hearNoise` refuses at `d > hearRange * strength`, so 1.0 carries 14 m
 * and `BREACH_NOISE.panel = 1.25` carries 17.5. The three values below sit against that ruler:
 *
 *     blow       0.6  ->  8.4 m   under a stage crossing: a blow that achieves nothing is heard,
 *                                 but only in your own half of the room
 *     prop       0.9  -> 12.6 m   above a blow, below a breach — an antique is a bigger event
 *                                 than a chip and a smaller one than a wall
 *     tallyShort 1.4  -> 19.6 m   ABOVE a panel breach, deliberately: the deck's most punishing
 *                                 failure should be its loudest, and it is the only one that
 *                                 also costs the camera for the rest of the round
 *
 * No THREE, no DOM.
 */

import { NOISE_KIND } from '../game/noise.js';

export const PARTY_NOISE = Object.freeze({ blow: 0.6, prop: 0.9, tallyShort: 1.4 });

/**
 * Should this wall blow put something on the bus, and how loud?
 *
 * 🚨 TWO REFUSALS, AND BOTH MATTER.
 *
 * **The hunter's own slam is silent to this**, exactly as `views/game.js:1431` already guards —
 * `HunterAI._breach` calls `panel.damage()` directly, and an unguarded emit would make the hunter
 * knock a wall down, hear itself, set `lastKnown` to the wall it is standing at and abandon the
 * breach mid-swing. That comment says it would *"look exactly like the D7 mechanic being broken"*.
 *
 * **A blow that crossed a stage is already emitting**, at `BREACH_NOISE.panel` from
 * `views/game.js:1432`, which is louder. Emitting again would put two events on a 24-event bus
 * for one swing and change nothing audible, since `loudest()` takes the max.
 *
 * @param {{changed:boolean}|null} res  the return of `panel.damage()`
 * @param {string} weapon
 */
export function blowNoise(res, weapon) {
  if (weapon === 'hunterSlam') return null;
  if (res?.changed) return null;
  return { loudness: PARTY_NOISE.blow, kind: NOISE_KIND.dig };
}

/** A destroyed prop. The Manifest's cost for smashing the wrong antique. */
export function propNoise() {
  return { loudness: PARTY_NOISE.prop, kind: NOISE_KIND.dig };
}

/** The Tally shorting. Its own kind, so the audio layer does not play a hammer. */
export function tallyShortNoise() {
  return { loudness: PARTY_NOISE.tallyShort, kind: NOISE_KIND.short };
}

/**
 * Attach the three emissions to a live game. Party mode only.
 *
 * @param {object} o
 * @param {{onWallHit:Function|null}} o.weapons
 * @param {{emit:Function}} o.noise
 * @param {Array<{onBreak:Function|null, root?:object}>} [o.props]
 * @returns {() => void} detach
 */
export function attachPartyNoise({ weapons, noise, props = [] }) {
  const prevWall = weapons.onWallHit;
  weapons.onWallHit = (panel, point, res, weapon) => {
    prevWall?.(panel, point, res, weapon);
    const n = blowNoise(res, weapon);
    if (n) noise.emit(point, n.loudness, n.kind);
  };

  const prevBreaks = props.map((p) => p.onBreak);
  props.forEach((prop, i) => {
    prop.onBreak = (self, info) => {
      prevBreaks[i]?.(self, info);
      const n = propNoise();
      const at = info?.point ?? self?.root?.position;
      if (at) noise.emit(at, n.loudness, n.kind);
    };
  });

  return () => {
    weapons.onWallHit = prevWall;
    props.forEach((prop, i) => { prop.onBreak = prevBreaks[i]; });
  };
}

/** The Tally has no engine yet, so its short is emitted by the party layer directly. */
export function emitTallyShort(noise, at) {
  const n = tallyShortNoise();
  return noise.emit(at, n.loudness, n.kind);
}
