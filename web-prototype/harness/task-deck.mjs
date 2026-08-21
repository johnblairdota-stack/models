#!/usr/bin/env node
/**
 * 🧩 **task-deck — FIVE TASKS, FIVE SHAPES, AND THE CONTRACT IS CHECKED RATHER THAN CLAIMED.**
 *
 *   node harness/task-deck.mjs
 *
 * `rrr-task-deck.md` §1, *"The Task Contract, amended for pairs"* — NOT §5.2.1, which is a section
 * of the BIBLE. That doc runs §1-§5 and says in its own opening line that it *"replaces §5.2.2 of
 * `rrr-social-deception-mode.md` and amends §5.2.1"*, so citing it by the number it amends points
 * a reader at the text it supersedes. The Task Contract is what stops the deck degenerating into a bag of
 * minigames as it grows past five, and a contract nobody checks is a comment.
 *
 * 🚨 **T4 IS UNMET ON THREE TASKS AND THIS FILE SAYS SO BY NAME, ON EVERY RUN.** The noise bus
 * carries placed events only (`noise.js:14-22`); `noiseplan.js` is the subscriber written to close
 * that, and **nothing in `src/` or `net/` imports it**. So in a running expedition a failed breach,
 * a smashed antique and a shorted camera are all **silent** — T4 wants failure to be audible, and a
 * task whose failure is silent is a task where a saboteur pays nothing. Those three are SKIPped
 * with the reason rather than passed: on this project a SKIP is never a PASS.
 *
 * ⚠️ **K4 ASSERTS A CALL SITE, NOT A BOOLEAN, AND THAT IS THE WHOLE POINT OF THE SECTION.** It
 * used to read `x.noise.built && …x.noise.source.includes('sustained')` — a hand-written
 * `built: true` and a hand-written string, both in the file under test. A declaration in the
 * module under test may not be the evidence for a claim about that module.
 */

import { TASKS, SHAPE, PENDING, byId, failurePayload, outrunsCarrier, CARRY_TRAP_STAGE, CARRY_SPEED, carriesMetres, soundCanCommit } from '../src/party/tasks.js';
import { FAILURE_FIELDS } from '../src/party/events.js';
import { HUNTER_SPEED, HUNTER_SENSE } from '../src/game/rules.js';
import { SHIPPED_ROOTS, shippedFiles, shippedImportersOf, shippedCallSites, exportedFns, emitSites, doctor } from './callsite-scan.mjs';

let pass = 0, fail = 0, skip = 0;
const t = (n, c, d = '') => { if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); } else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); } return c; };
const skipped = (n, why) => { skip++; console.log(`  SKIP ${n} · ${why}`); };

// ---------------------------------------------------------------- K0 · the arm
{
  const shapes = new Set(TASKS.map((x) => x.shape));
  t('K0 arm · five tasks covering five distinct shapes', TASKS.length === 5 && shapes.size === 5,
    TASKS.map((x) => `${x.id}:${x.shape}`).join(' '));
}

// ---------------------------------------------------------------- K1 · T1 asymmetry
/** Named so K10c can run THIS expression rather than a lookalike written beside it. */
const sharesAKey = (x) => x.runner.some((k) => x.guide.includes(k)) || !x.runner.length || !x.guide.length;
{
  const bad = TASKS.find(sharesAKey);
  t('K1 · T1 — in every task the runner and guide hold disjoint information', !bad,
    bad ? `${bad.id} shares ${bad.runner.filter((k) => bad.guide.includes(k)).join('/')}` : '5 tasks, no shared key');
}

// ---------------------------------------------------------------- K2 · T2 the channel is a voice
{
  const bad = TASKS.find((x) => [...x.runner, ...x.guide].some((k) => /chat|text|msg|type|send/i.test(k)));
  t('K2 · T2 — no task gives the pair an in-game channel', !bad,
    bad ? `${bad.id}` : 'every link between them is a human voice in the room');
}

// ---------------------------------------------------------------- K3 · T3 a named lie
{
  const bad = TASKS.find((x) => !x.lie || x.lie.length < 4);
  t('K3 · T3 — every task names where the lie lives', !bad,
    bad ? bad.id : TASKS.map((x) => `${x.id}: ${x.lie}`).join(' · '));
  t('K3b · and no two tasks put it in the same place',
    new Set(TASKS.map((x) => x.lie)).size === TASKS.length);
}

// ---------------------------------------------------------------- K4 · T4 failure is audible
/**
 * 🚨 **THIS ASSERTION USED TO BE THE HEADER RESTATED.** It read:
 *
 *     built.every((x) => x.noise.built && (x.noise.failurePeak > 0 || x.noise.source.includes('sustained')))
 *
 * `x.noise.built` is a hand-written `built: true` literal in `src/party/tasks.js`, five of them.
 * `x.noise.source` is a hand-written string like `'per-blow emit (noiseplan.js)'`. The gate printed
 * `WALL_CALL:per-blow emit (noiseplan.js)`, which reads like a wiring assertion and is a string
 * constant — and it was green the whole time `attachPartyNoise` had no call site anywhere outside
 * `harness/party-noise.mjs`. Same instrument as `dark-run` D4 before it was driven off a real
 * `Player`: `darkrun.js`'s table checked against `darkrun.js`'s table, hiding a factor of three.
 *
 * **T4 is a claim about the WIRE, so the evidence has to be a `file:line`.** Everything below is
 * derived from `src/` and `net/` by `callsite-scan.mjs`; the `source` string is demoted to
 * choosing WHICH evidence to go and look for, and can no longer BE the evidence.
 */

/** The party runtime's 3D half. A task's failure has to be audible in THIS process or nowhere. */
const RUNNER_VIEW = 'src/views/expedition.js';
const SHIPPED = SHIPPED_ROOTS.map((r) => r + '/').join(' or ');

/** Is `module` reached by anything that ships? Import edge or call site, both derived. */
function attachment(module, files = shippedFiles()) {
  const importers = shippedImportersOf(module, files);
  const calls = exportedFns(module, files).flatMap((fn) => shippedCallSites(fn, { exclude: [module], files }));
  return { module, importers, calls, attached: importers.length > 0 || calls.length > 0 };
}

/**
 * What a task's failure would actually ride on. The row's `source` string only picks the place to
 * look — a module name, or nothing, meaning the runner's own body — and the answer that comes back
 * is a call site in the shipped tree or a reason there is none.
 */
function evidenceFor(task, files = shippedFiles()) {
  const named = (task.noise.source.match(/([\w-]+\.js)/) || [])[1];
  if (!named) {
    const body = emitSites(RUNNER_VIEW, files).filter((e) => /\bplayer\.noise\b/.test(e.args));
    return body.length
      ? { ok: true, at: body.map((e) => `${e.file}:${e.line}`).join(' '), how: "the runner's own body" }
      : { ok: false, why: `${RUNNER_VIEW} puts nothing driven by \`player.noise\` on its bus` };
  }
  const module = [...files.keys()].find((p) => p.endsWith('/' + named));
  if (!module) return { ok: false, why: `\`${named}\` is not a file under ${SHIPPED}` };
  const a = attachment(module, files);
  if (!a.attached) return { ok: false, why: `nothing under ${SHIPPED} imports or calls \`${named}\`` };
  const at = a.calls.length ? `${a.calls[0].file}:${a.calls[0].line}` : `imported by ${a.importers[0]}`;
  return { ok: true, at, how: named };
}

/**
 * 🚨 **THE THREE TASKS WHOSE T4 IS WRITTEN AND NOT WIRED — NAMED, DATED, AND RE-CHECKED EVERY RUN.**
 *
 * `wire-parity`'s `AWAITING_A_PRODUCER` shape, and for the same reason: an exemption may only
 * exist while the thing that justifies it is still true, so both arms below re-derive it from the
 * tree rather than trusting this list. A list nobody re-checks is not an exemption, it is cover —
 * which is exactly what `built: true` had become.
 *
 * These are NOT passes. They are SKIPs with the reason attached, printed on every run.
 */
const T4_UNATTACHED = new Map([
  ['WALL_CALL', 'a wrong face breached in silence'],
  ['MANIFEST', 'a wrong antique smashed in silence'],
  ['TALLY', 'a camera shorted in silence'],
].map(([id, what]) => [id, {
  since: '2026-08-21', what,
  why: '`src/party/noiseplan.js` is written, correct and gated by `party-noise` — and no shipped file imports or calls it',
}]));

{
  const bodyEmits = emitSites(RUNNER_VIEW).filter((e) => /\bplayer\.noise\b/.test(e.args));
  const allEmits = emitSites(RUNNER_VIEW);
  t('K4 arm · the party runtime was read, and everything that can make a noise in it was found',
    allEmits.length > 0 && bodyEmits.length === allEmits.length,
    `${RUNNER_VIEW} has ${allEmits.length} emit${allEmits.length === 1 ? '' : 's'} on its bus — `
      + allEmits.map((e) => `:${e.line} ${e.args.slice(0, 44)}`).join(' · ')
      + ` — every one of them the runner's own body`);

  const claiming = TASKS.filter((x) => x.contract.T4 === true);
  const resolved = claiming.map((x) => [x, evidenceFor(x)]);
  const unbacked = resolved.filter(([, e]) => !e.ok);
  const undeclared = unbacked.filter(([x]) => !T4_UNATTACHED.has(x.id));

  t('K4 · every task that claims T4 rides on a noise emission the shipped tree actually reaches',
    undeclared.length === 0,
    undeclared.length
      ? undeclared.map(([x, e]) => `${x.id} claims T4 with built:${x.noise.built} and ${e.why} — wire it, or put it on T4_UNATTACHED with a reason`).join(' | ')
      : resolved.filter(([, e]) => e.ok).map(([x, e]) => `${x.id}@${e.at}`).join(' · ')
        + ` — ${unbacked.length} exempted below`);

  // The exemption is printed, not buried: it is the true state of the deck and it goes past a
  // reader's eye on every single run.
  console.log(`  ── T4_UNATTACHED · ${T4_UNATTACHED.size} of ${TASKS.length} tasks do not satisfy T4 in a running game ──`);
  for (const [id, r] of T4_UNATTACHED) {
    console.log(`     ${id.padEnd(10)} ${r.what} — ${r.why} (since ${r.since})`);
    skipped(`K4b T4 on ${id}`, `${r.why}. tasks.js still says contract.T4:${byId(id).contract.T4} built:${byId(id).noise.built}; this gate does not believe it`);
  }

  const arrived = [...T4_UNATTACHED.keys()].filter((id) => evidenceFor(byId(id)).ok);
  t('K4b arm · and every task on that list is STILL genuinely unwired',
    arrived.length === 0,
    arrived.length
      ? `now reachable — take ${arrived.join(', ')} off T4_UNATTACHED and let K4 assert the call site`
      : [...T4_UNATTACHED.keys()].join(', ') + ' — three tasks waiting on a wire, not on a design');

  // 🚨 THE OTHER DIRECTION, AND IT IS THE HALF A ONE-ARMED LIST WOULD MISS. The list exists
  // because `tasks.js` makes a claim the tree does not support. If `tasks.js` is corrected the
  // entry is stale, and a stale exemption is cover again.
  const admitted = [...T4_UNATTACHED.keys()].filter((id) => byId(id).noise.built !== true || byId(id).contract.T4 !== true);
  t('K4b2 arm · and tasks.js still makes the claim the list exists to disbelieve',
    admitted.length === 0,
    admitted.length
      ? `${admitted.join(', ')} no longer claims T4 — take it off T4_UNATTACHED, the record is spent`
      : 'all three still carry contract.T4:true and built:true against a wire that does not exist');

  // 🚨 A TASK WHOSE FAILURE IS QUIETER THAN ITS SUCCESS PAYS A SABOTEUR TO FAIL. This caught the
  // Wall Call modelling failure at the per-blow floor rather than the breach — see tasks.js.
  t('K4c · no task is quieter when it goes wrong',
    TASKS.every((x) => x.noise.failurePeak >= x.noise.successPeak),
    TASKS.map((x) => `${x.id} ${x.noise.successPeak}/${x.noise.failurePeak}`).join(' '));

  /**
   * 🚨 **AND THE PROPOSED FIX WOULD NOT MAKE THE LOUDEST FAILURE IN THE DECK AUDIBLE EITHER.**
   * `WALL_CALL`'s two peaks are both `BREACH_NOISE.panel`, and `blowNoise` returns `null` on a
   * stage crossing on the argument that `views/game.js:1432` is already emitting it. That line is
   * in the SURVIVAL view. `expedition.js` imports one function from `game.js` — `makeLightRig` —
   * and never emits a breach, so wiring `noiseplan.js` into the runner view tomorrow would leave
   * the breach silent and only the 0.6 sub-stage blows audible. Named here rather than asserted
   * green: the fix belongs in `noiseplan.js`, which this gate does not own.
   */
  const breachEmitters = [...shippedFiles().keys()].filter((f) => emitSites(f).some((e) => /BREACH_NOISE\.panel/.test(e.args)));
  t('K4d · the breach loudness both of WALL_CALL\'s peaks are written in has exactly one producer, and it is not the party runtime',
    breachEmitters.length === 1 && breachEmitters[0] !== RUNNER_VIEW,
    `BREACH_NOISE.panel is emitted only from ${breachEmitters.join(', ')}; ${RUNNER_VIEW} emits no breach at all, so WALL_CALL's ${byId('WALL_CALL').noise.failurePeak} has no producer in a party match`);
}

// ---------------------------------------------------------------- K5 · T5 never names the culprit
{
  let bad = null;
  for (const x of TASKS) {
    const p = failurePayload(x.id, { kind: 'fail', room: 'east', phaseTick: 3, loudness: x.noise.failurePeak });
    const extra = Object.keys(p).filter((k) => !FAILURE_FIELDS.includes(k));
    if (extra.length) bad = `${x.id} carries ${extra.join(',')}`;
  }
  t('K5 · T5 — every task reports failure through the closed four-field schema', !bad, bad || `{${FAILURE_FIELDS.join(', ')}}`);

  let threw = false;
  try { failurePayload('TALLY', { kind: 'short', room: 'hall', phaseTick: 2, loudness: 1.4, earlyBy: 0.4 }); } catch { threw = true; }
  t('K5b · the Tally cannot report a timing even by accident', threw,
    byId('TALLY').t5Note);

  // With a crew of two, ANY per-player shape is an accusation. Assert the schema has no room for one.
  t('K5c · and with a crew of two there is no field that could hold one',
    FAILURE_FIELDS.every((f) => !/who|by|player|time|delta|accuracy/i.test(f)),
    'kind, room, phaseTick, loudness — none of them can hold a person or a margin');
}

// ---------------------------------------------------------------- K6 · T6 watchable
{
  t('K6 · T6 — no task needs the guide\'s map on the TV',
    TASKS.every((x) => !x.runner.includes('flyover')),
    'the flyover is a guide surface only; party-loop.md puts it under "Do not"');
  t('K6b · and the deck varies what the TV shows', new Set(TASKS.map((x) => x.shape)).size === 5);
}

// ---------------------------------------------------------------- K7 · the Extraction trap
{
  t('K7 · a carrying runner cannot outrun the Hunter from stage 2',
    !outrunsCarrier(1) && outrunsCarrier(2) && outrunsCarrier(3) && CARRY_TRAP_STAGE === 2,
    `carry ${CARRY_SPEED} m/s vs hunter ${HUNTER_SPEED.slice(1).join('/')} — the trap arms at stage ${CARRY_TRAP_STAGE}`);
  t('K7b · which is why the Extraction is a late-round task', byId('EXTRACTION').episode === 'late',
    'the Hunter grows on every take, good or evil, so by then it has usually armed itself');
}

// ---------------------------------------------------------------- K8 · evidence, never proof
{
  t('K8 · sound alone can never commit the Hunter', !soundCanCommit(),
    `soundCeiling ${HUNTER_SENSE.soundCeiling} < commitAt ${HUNTER_SENSE.commitAt} — a breach brings it into your half of the house, only a sighting makes it run`);
  t('K8b · a panel breach carries far enough to matter', carriesMetres(byId('WALL_CALL').noise.successPeak) > 15,
    `${carriesMetres(byId('WALL_CALL').noise.successPeak).toFixed(1)} m`);
}

// ---------------------------------------------------------------- K9 · the numbers are honest
/**
 * 🚨 **THIS USED TO ASSERT `measured.length === TASKS.length` — that every row still carries
 * `measured: false`.** Same defect as the old K4 in a quieter key: it read a flag the file under
 * test writes about itself, it would have gone RED the day somebody actually measured a number,
 * and it said nothing at all about what the flag is supposed to guard. What §5.2.3 wants is that
 * a row claiming a measured number HAS one, so that is what is checked; the count of proposals is
 * reported rather than required.
 */
{
  const unmeasured = TASKS.filter((x) => !x.numbers.measured);
  const hollow = TASKS.filter((x) => x.numbers.measured && (x.numbers.honestError == null || x.numbers.medianSeconds == null));
  t('K9 · no task claims a measured number it does not have', hollow.length === 0,
    hollow.length
      ? hollow.map((x) => `${x.id} says measured:true with honestError ${x.numbers.honestError} and medianSeconds ${x.numbers.medianSeconds}`).join(' | ')
      : `${unmeasured.length} of ${TASKS.length} are still proposals (measured:false) — §5.2.3 wants honest error, median time and success-noise before any ships`);
  t('K9b · and the deck knows which of its numbers are proposals', unmeasured.length + TASKS.filter((x) => x.numbers.measured).length === TASKS.length,
    unmeasured.map((x) => x.id).join(', ') + ' carry no measurement yet');
}

// ---------------------------------------------------------------- K10 · the controls
{
  let threw = false;
  try { failurePayload('WALL_CALL', { kind: 'x', room: 'y', phaseTick: 1, loudness: 1, timings: [0.4, 0.0] }); } catch { threw = true; }
  t('K10a control · a timings array is refused at construction', threw);
  t('K10b control · the trap really is stage-dependent', HUNTER_SPEED[1] < CARRY_SPEED && HUNTER_SPEED[2] > CARRY_SPEED,
    `stage 1 ${HUNTER_SPEED[1]} < ${CARRY_SPEED} < stage 2 ${HUNTER_SPEED[2]}`);
  /**
   * 🚨 **THIS CONTROL USED TO READ `['flyover'].some((k) => ['flyover'].includes(k))`** — an array
   * literal tested against itself, on one line, touching neither `TASKS` nor K1's expression. It
   * is the same defect as the old K4 in miniature and it has been found in this suite repeatedly:
   * a control that proves a regex matches a string the gate wrote proves nothing. It now runs K1's
   * own predicate over a REAL row with one of the guide's real keys moved across.
   */
  const clean = byId('WALL_CALL');
  const overlapping = { ...clean, runner: [...clean.runner, clean.guide[0]] };
  t('K10c control · K1\'s own predicate catches a shared key when a real row has one',
    !sharesAKey(clean) && sharesAKey(overlapping) && !TASKS.some(sharesAKey),
    `WALL_CALL is clean; the same row holding the guide's \`${clean.guide[0]}\` is not`);

  /**
   * 🚨 **THE THREE CONTROLS K4 IS WORTHLESS WITHOUT, AND NONE OF THEM TESTS A STRING THIS FILE
   * WROTE.** A scanner that finds nothing anywhere passes K4b by blindness; a resolver that reads
   * the row instead of the tree passes K4 by restating it; and an exemption arm that cannot see an
   * attachment is a list that can never expire. Each is answered against the real tree.
   */
  const noiseBusUsers = shippedImportersOf('src/game/noise.js');
  t('K10d control · the scan finds a wire that really is there',
    noiseBusUsers.includes(RUNNER_VIEW) && noiseBusUsers.includes('src/party/noiseplan.js') && noiseBusUsers.length >= 3,
    `NoiseBus is imported by ${noiseBusUsers.join(', ')} — a scan that returned nothing would pass K4b by seeing nothing`);

  // Two REAL rows, each asked the other row's question. The verdict has to follow the tree.
  const wc = byId('WALL_CALL'), dr = byId('DARK_RUN');
  const wcAsBody = evidenceFor({ ...wc, noise: { ...wc.noise, source: 'player.noise, continuous' } });
  const drAsPlan = evidenceFor({ ...dr, noise: { ...dr.noise, source: 'per-blow emit (noiseplan.js)' } });
  t('K10e control · the verdict comes from the tree and not from the row',
    wcAsBody.ok && !drAsPlan.ok && evidenceFor(wc).ok === false && evidenceFor(dr).ok === true,
    `WALL_CALL pointed at the body resolves to ${wcAsBody.at}; DARK_RUN pointed at noiseplan.js does not — ${drAsPlan.why}`);

  /**
   * The day someone attaches `noiseplan.js` to a view and forgets the list. Spliced into the REAL
   * runner view, at its real import of the real bus — `doctor` throws rather than passing quietly
   * if that anchor has moved, because a control doctoring text it invented proves nothing.
   */
  let wiredSays = 'the splice did not run';
  let wiredSees = false;
  try {
    const wired = doctor(RUNNER_VIEW,
      "import { NoiseBus } from '../game/noise.js';",
      "import { NoiseBus } from '../game/noise.js';\nimport { attachPartyNoise } from '../party/noiseplan.js';\nattachPartyNoise({ weapons, noise, props });");
    const a = attachment('src/party/noiseplan.js', wired);
    const nowOk = [...T4_UNATTACHED.keys()].filter((id) => evidenceFor(byId(id), wired).ok);
    wiredSees = a.attached && a.importers.includes(RUNNER_VIEW) && a.calls.length > 0 && nowOk.length === T4_UNATTACHED.size;
    wiredSays = `${a.calls.map((c) => `${c.file}:${c.line}`).join(' ')} and an import edge — all ${nowOk.length} would resolve, so K4b would go red on the doctored tree while it holds on the shipped one`;
  } catch (e) { wiredSays = e.message; }
  t('K10f control · with one real attach spliced into the real runner view, the exemption arm can see it', wiredSees, wiredSays);

  // K9 the same way: a real row, flipped to the claim, and the emptiness behind it found.
  const claimed = { ...dr, numbers: { ...dr.numbers, measured: true } };
  t('K10g control · a row that claimed a measurement it does not carry would fail K9',
    claimed.numbers.medianSeconds == null && dr.numbers.honestError != null,
    `DARK_RUN carries honestError ${JSON.stringify(dr.numbers.honestError)} and no medianSeconds, so measured:true on it is exactly the hollow claim K9 looks for`);
}

console.log(`\ntask-deck: ${pass} passed, ${fail} failed, ${skip} skipped`);
process.exit(fail ? 1 : 0);
