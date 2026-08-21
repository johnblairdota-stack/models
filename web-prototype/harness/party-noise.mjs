#!/usr/bin/env node
/**
 * 🔊 **party-noise — THE THREE EMISSIONS ARE CORRECT, AND NOTHING IN A SHIPPING FILE CALLS THEM.**
 *
 *   node harness/party-noise.mjs
 *
 * Task Contract **T4**: failure must emit noise, so silence is not a strategy. `noiseplan.js` is
 * the subscriber written to close that for the Wall Call, the Manifest and the Tally — **a task
 * whose failure is silent is a task where a saboteur pays nothing**, and all three were exactly
 * that.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 **THIS HEADER USED TO OPEN "FAILURE IS AUDIBLE NOW" AND SAY "THIS CLOSES IT". IT DOES NOT.**
 * ---------------------------------------------------------------------------------------------
 * N0-N9 drive the real functions against the real `NoiseBus` and every one of them passes, which
 * is worth exactly what it says and no more: the emissions are correct **when something attaches
 * them**. `attachPartyNoise` has two mentions in the whole tree — its own definition, and the rig
 * in this file. **Nothing in `src/` or `net/` imports `noiseplan.js` at all.** So the only caller
 * of the code this gate proves is the gate, and a green run here was being read as a wire.
 *
 * N10 is that fact asserted rather than left to a reader, derived from the shipped tree by
 * `callsite-scan.mjs`, with the gap named and dated in `ATTACHMENT_GAP` and re-checked on every
 * run so it cannot outlive its reason. **`harness/` is the instrument and is never the evidence.**
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
import { SHIPPED_ROOTS, shippedFiles, shippedImportersOf, shippedCallSites, exportedFns, emitSites, readShipped, doctor } from './callsite-scan.mjs';

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
  // The line this defers to is looked up rather than quoted — see N10b for what it costs that
  // the one view which has it is not the one this module is for.
  const crossing = emitSites('src/views/game.js').find((e) => /BREACH_NOISE\.panel/.test(e.args));
  t('N2 · a blow that crossed a stage does not emit twice', bus.recent().length === 0,
    `${crossing ? `${crossing.file}:${crossing.line}` : 'NO SUCH LINE'} fires BREACH_NOISE.panel (${BREACH_NOISE.panel}) on the crossing in the SURVIVAL view, and loudest() takes the max`);
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
  /**
   * 🚨 **THE DEAF KIND IS READ OUT OF `hunter-ai.js`, NOT COPIED INTO THIS LINE.** This filter was
   * `!['door'].includes(e.kind)` — a gate-side duplicate of `_noiseStep`'s `ignoreKind`, which
   * would have kept passing if the Hunter had started ignoring `short` and taken the Tally's whole
   * cost with it. Same shape as the `built: true` K4 used to read: the rule asserted against a
   * copy of itself.
   */
  const deaf = (readShipped('src/game/hunter-ai.js').match(/ignoreKind:\s*'([^']+)'/) || [])[1];
  const heard = bus.recent().filter((e) => e.kind !== deaf);
  t('N7 · nothing here lands in the kind the Hunter is deaf to', Boolean(deaf) && heard.length === 2,
    `hunter-ai.js's _noiseStep ignores \`${deaf}\` and nothing else, so a blow, a prop and a short all reach it`);
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
    'nothing attaches this ANYWHERE yet (N10) — when something does, a party match must not leave it behind');

  // and it chains rather than clobbering, so an existing subscriber keeps working
  const bus = new NoiseBus();
  let chained = 0;
  const w = { onWallHit: () => { chained++; } };
  attachPartyNoise({ weapons: w, noise: bus, props: [] });
  w.onWallHit({}, P, { changed: false }, 'sledge');
  t('N8b · and it chains onto an existing handler rather than replacing it',
    chained === 1 && bus.recent().length === 1);
}

// ---------------------------------------------------------------- N10 · nobody calls any of it
/**
 * 🚨 **EVERY ASSERTION ABOVE IS ABOUT A FUNCTION THIS GATE IS THE ONLY CALLER OF.** That is not a
 * reason to delete them — the emissions are correct and the D7 guard is real — but a suite that
 * prints ten green lines about `noiseplan.js` and never says "and it is unreached" is handing a
 * reader a wire that does not exist. `tasks.js` read it that way for two days and wrote
 * `built: true` five times on the strength of it.
 *
 * So the gap is a named, dated record with two arms, the shape `wire-parity`'s
 * `AWAITING_A_PRODUCER` uses: **an exemption may only exist while the thing that justifies it is
 * still true.** The day someone attaches this to a view, N10 goes red and says take it off.
 */
const PLAN = 'src/party/noiseplan.js';
const RUNNER_VIEW = 'src/views/expedition.js';
const SHIPPED = SHIPPED_ROOTS.map((r) => r + '/').join(' or ');

const ATTACHMENT_GAP = new Map([
  [PLAN, {
    since: '2026-08-21',
    why: `no file under ${SHIPPED} imports it or calls any of its exports; the only rig that does is this gate`,
    costs: 'WALL_CALL, MANIFEST and TALLY do not satisfy T4 in a running game — task-deck K4b SKIPs all three',
  }],
]);

/** Reached by anything that ships? Import edge or call site, both derived from the tree. */
function attachment(module, files = shippedFiles()) {
  const importers = shippedImportersOf(module, files);
  const calls = exportedFns(module, files).flatMap((fn) => shippedCallSites(fn, { exclude: [module], files }));
  return { importers, calls, attached: importers.length > 0 || calls.length > 0 };
}

{
  const a = attachment(PLAN);
  console.log(`  ── ATTACHMENT_GAP · everything N0-N9 proves is unreached by shipping code ──`);
  for (const [m, r] of ATTACHMENT_GAP) console.log(`     ${m} — ${r.why}; ${r.costs} (since ${r.since})`);

  t('N10 · nothing that ships imports or calls this module, and this gate says so out loud',
    !a.attached,
    a.attached
      ? `now reached from ${[...a.importers, ...a.calls.map((c) => `${c.file}:${c.line}`)].join(', ')} — take ${PLAN} off ATTACHMENT_GAP and let task-deck K4 assert the call site`
      : `${exportedFns(PLAN).length} exports, 0 shipped callers — the emissions above are correct and unreached`);

  /**
   * 🚨 **AND N2's ARGUMENT DOES NOT SURVIVE THE MODE IT IS FOR.** `blowNoise` returns `null` on a
   * stage crossing because `views/game.js:1432` is already emitting `BREACH_NOISE.panel`. That
   * line is in the SURVIVAL view. `expedition.js` imports one function from `game.js` —
   * `makeLightRig` — and emits nothing on a breach, so attaching this to the runner view tomorrow
   * would leave the LOUDEST failure in the deck silent and only the 0.6 sub-stage blows audible.
   * The fix belongs in `noiseplan.js`, which this gate does not own; the fact is asserted here.
   */
  const breachEmitters = [...shippedFiles().keys()].filter((f) => emitSites(f).some((e) => /BREACH_NOISE\.panel/.test(e.args)));
  t('N10b · the crossing emit N2 defers to exists in exactly one view, and it is not the party one',
    breachEmitters.length === 1 && breachEmitters[0] === 'src/views/game.js' && !emitSites(RUNNER_VIEW).some((e) => /BREACH/.test(e.args)),
    `BREACH_NOISE.panel is emitted only from ${breachEmitters.join(', ')}; ${RUNNER_VIEW} has ${emitSites(RUNNER_VIEW).length} emit(s), none of them a breach — so N2's deferral has no producer in party mode`);
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

  /**
   * 🚨 **N10 IS AN ASSERTION THAT SOMETHING IS ABSENT, WHICH IS THE EASIEST KIND TO PASS BY
   * BLINDNESS.** A scanner that finds nothing anywhere satisfies it for ever. So the same scan is
   * pointed at a wire that really exists, and then at the REAL runner view with ONE REAL ATTACH
   * spliced into it at its real import of the real bus — `doctor` throws rather than passing
   * quietly if that anchor has moved, because a control doctoring text it wrote itself proves
   * nothing, and that specific defect has been found in this suite more than once.
   */
  const busUsers = shippedImportersOf('src/game/noise.js');
  t('N9d control · the scan finds a wire that really is there',
    busUsers.includes(RUNNER_VIEW) && busUsers.includes(PLAN) && busUsers.length >= 3,
    `NoiseBus is imported by ${busUsers.join(', ')} — an empty scan would satisfy N10 by seeing nothing`);

  let sees = false, says = 'the splice did not run';
  try {
    const wired = doctor(RUNNER_VIEW,
      "import { NoiseBus } from '../game/noise.js';",
      "import { NoiseBus } from '../game/noise.js';\nimport { attachPartyNoise } from '../party/noiseplan.js';\nattachPartyNoise({ weapons, noise, props });");
    const a = attachment(PLAN, wired);
    sees = a.attached && a.importers.includes(RUNNER_VIEW) && a.calls.some((c) => c.file === RUNNER_VIEW);
    says = `${a.calls.map((c) => `${c.file}:${c.line}`).join(' ')} plus an import edge — N10 goes red on the doctored tree and holds on the shipped one`;
  } catch (e) { says = e.message; }
  t('N9e control · with one real attach spliced into the real runner view, N10 goes red', sees, says);
}

console.log(`\nparty-noise: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
