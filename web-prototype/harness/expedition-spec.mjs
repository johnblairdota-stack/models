#!/usr/bin/env node
/**
 * 📄 **expedition-spec — THE WRITTEN SPEC AGREES WITH THE WIRE ABOUT THE EXPEDITION.**
 *
 *   node harness/expedition-spec.mjs
 *
 * The Desk's card (CoS PR #61) routed one lag to the Project Lead: *"camera spec still says
 * first-person."* It did — the wire moved on 2026-09-01/02 (auto-walk, pins, produced follow,
 * Guide E / Runner D / TV E) and four design docs kept describing a game that never shipped.
 * A doc is the spec an agent READS before touching `src/party/`; a stale sentence there re-teaches
 * the wrong game with a straight face. The docs were amended 2026-09-02; this file is the net
 * that keeps them amended. Board: `docs/design/refs-expedition-locked/canvas/` (committed).
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 EXACT SENTENCES, NOT WORDS — history must survive
 * ---------------------------------------------------------------------------------------------
 * CLAUDE.md's standing lesson: a whole-file ban is right for *"this does not exist"* and wrong
 * for *"this must not be REACHED."* The words "first person" legitimately remain in these docs —
 * D13's overturn condition (*"phone-rendered first person returns as a v2 A/B"*), the
 * motion-sickness note, and `party-loop.md`'s deliberately struck build-list line, kept struck
 * because the bible QUOTES it. So ES1 bans the exact stale CLAIM sentences, byte for byte, and
 * nothing else. If you are here because ES1 went red: somebody re-wrote a stale claim into a
 * spec doc — fix the DOC, not this list. If John re-decides the camera, change the docs and this
 * file in the same commit, the way `phases.js` and `episode-order` move together.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT EACH CHECK IS FOR
 * ---------------------------------------------------------------------------------------------
 *   ES1   the stale claims are GONE — per doc, exact sentences (first-person runner, throttle
 *         verb, unstruck "Phone first-person + touch")
 *   ES2   the locked claims are PRESENT — produced follow, auto-walk, lateral dodge, the three
 *         picked boards, per doc
 *   ES3   the objective-pin rule is WRITTEN spec, not just code — bible §5.7.1 and the task deck
 *         both carry it
 *   ES4   the paper still describes the CODE — pin rows in `entitle.js`, `dodgeLateral` and
 *         `SABOTAGE` in `runner-intel.js`, `objectiveGoal` in `objectives.js`. The lag this file
 *         exists for runs both ways: rip the pin off the wire and the fresh paper is stale again,
 *         and THIS line is the one that says so.
 *   ES5   🚨 the controls — every banned sentence, planted into a synthetic doc, is CAUGHT by the
 *         same predicate that cleared the real ones. A needle that cannot fire is a hand-kept
 *         list, which is the failure `episode-order` is named after.
 *
 * Pure node. No browser, no port, no `npm install`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/* ⚠️ NORMALISE NEWLINES. `host-desync` H8 was RED on Windows and GREEN in CI against
 * byte-identical content because a pattern met CRLF — CLAUDE.md's standing note for any
 * source-reading gate. Every needle below depends on this line. */
const src = (rel) => readFileSync(join(here, rel), 'utf8').replace(/\r\n/g, '\n');

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return c;
};
const note = (s) => console.log(`  reading · ${s}`);

/* The five spec docs. Two trees: the bible set lives at the repo root, the party set beside src. */
const DOCS = {
  bible: src('../../docs/design/rrr-social-deception-mode.md'),
  phone: src('../../docs/design/rrr-phone-ux.md'),
  deck: src('../../docs/design/rrr-task-deck.md'),
  loop: src('../docs/design/party-loop.md'),
  intel: src('../docs/design/runner-intel.md'),
};

console.log('\n📄 expedition-spec — the paper says what the wire does\n');

/* =================================================================================================
 * ES1 · THE STALE CLAIMS ARE GONE — exact sentences, one per red line
 * ============================================================================================== */

/** [docKey, banned exact substring, why it was the wrong game] */
const BANNED = [
  ['bible', 'Runner is first-person in dark corridors',
    'D9 pre-amendment — the runner was never rendered first-person'],
  ['bible', "The runner's first-person view lives on the TV",
    'D13 pre-amendment — the TV airs a produced follow, not a first-person picture'],
  ['bible', 'P3 survives D13 through the throttle',
    'the throttle stopped existing when the stick stopped being "move" (2026-09-01)'],
  ['phone', 'The first-person view lives on the TV.',
    'D-P1 pre-amendment — same claim, phone spec copy'],
  ['deck', 'one RUNNER (first person, dark corridors)',
    'deck header pre-amendment'],
  ['deck', '**What the runner sees.** First person',
    'Dark Run pre-amendment — what she sees is the TV, and a bezel bearing'],
  ['loop', 'the **runner** (first-person, dark corridors, quiet)',
    'party-loop §A-turn pre-amendment'],
];

/** The predicate ES5's controls re-run. Returns the banned rows found in `text` for `docKey`. */
const staleHits = (docKey, text) =>
  BANNED.filter(([k, needle]) => k === docKey && text.includes(needle));

for (const [key, needle, why] of BANNED) {
  t(`ES1:${key}`, !DOCS[key].includes(needle), `gone: "${needle.slice(0, 52)}…" (${why})`);
}

/* `party-loop.md`'s build-list line is special: the bible QUOTES it, so it stays present but
 * STRUCK. An unstruck copy at a bullet start is the regression; the struck copy is required. */
t('ES1:loop-struck', !/^- Phone first-person \+ touch\./m.test(DOCS.loop)
  && /~~Phone first-person \+ touch\. Private guide flyover\.~~/.test(DOCS.loop),
  'the build-list line exists only struck through, so D13\'s quote of it still lands');

/* =================================================================================================
 * ES2 · THE LOCKED CLAIMS ARE PRESENT — the docs sell what shipped, by name
 * ============================================================================================== */

/** [docKey, required pattern, what the doc must now say] */
const REQUIRED = [
  ['bible', /produced follow/, 'the TV picture is a produced follow'],
  ['bible', /AUTO-WALKS? the guide/, 'auto-walk is the move model'],
  ['bible', /lateral dodge/, 'the stick is a lateral dodge'],
  ['bible', /SABOTAGE/, 'the evil runner\'s lever is misuse, not a throttle'],
  ['bible', /5\.7\.1/, 'the locked-build section exists'],
  ['phone', /produced follow/, 'D-P1 names the follow'],
  ['phone', /lateral dodge only/, '§3 banner carries the locked stick'],
  ['phone', /auto-walks the guide/, '§3 banner carries auto-walk'],
  ['deck', /Neighbours Only/, 'Guide E is named'],
  ['deck', /Frame Bezel/, 'Runner D is named'],
  ['deck', /Camera Stinger/, 'TV E is named'],
  ['deck', /produced follow/, 'the deck\'s runner watches the TV'],
  ['loop', /produced follow/, 'party-loop names the follow'],
  ['loop', /Neighbours Only/, 'party-loop names Guide E'],
  ['intel', /DISCHARGED 2026-09-01/, 'the runner-intel lock is marked discharged'],
  ['intel', /auto-walks the current guide pin/, 'and says what replaced it'],
];

for (const [key, re, why] of REQUIRED) {
  t(`ES2:${key}:${re.source.slice(0, 24)}`, re.test(DOCS[key]), why);
}

/* =================================================================================================
 * ES3 · PIN-OBJECTIVES ARE WRITTEN SPEC — the guide pins the job, the thumb may not pick it
 * ============================================================================================== */

t('ES3a', /pins? the job's own objectives/.test(DOCS.bible),
  'bible §5.7.1 carries the objective-pin rule');
t('ES3b', /thumb\s+may not pick them/.test(DOCS.bible),
  'and the removal half — the thumb may not pick');
t('ES3c', /pins? the job's own objectives/.test(DOCS.deck),
  'the task deck carries the same rule in its amendment');
t('ES3d', /objectives\.js/.test(DOCS.bible),
  'the bible names the one owner of the kinds');

/* =================================================================================================
 * ES4 · THE PAPER STILL DESCRIBES THE CODE — the lag detector points both ways
 * ============================================================================================== */
/* Loose anchors on purpose: behaviour is `runner-intel`'s 104 checks, `intel-pads`, `tv-stinger`.
 * These lines only assert the named things EXIST where the fresh paper says they live, so a
 * refactor that removes one reddens the SPEC gate too — the paper is stale again, other way round. */

const entitle = src('../net/party/entitle.js');
const runnerIntel = src('../src/game/runner-intel.js');
const objectives = src('../src/party/objectives.js');

t('ES4a', /you\.pin\./.test(entitle), 'entitle.js still carries the you.pin.* rows the bible cites');
t('ES4b', /dodgeLateral/.test(runnerIntel), 'runner-intel.js still owns the lateral dodge');
t('ES4c', /SABOTAGE/.test(runnerIntel), 'and the four-misuse SABOTAGE list the bible cites');
t('ES4d', /objectiveGoal/.test(objectives), 'objectives.js still owns objectiveGoal');

/* =================================================================================================
 * ES5 · 🚨 THE CONTROLS — every needle, planted, is caught by the same predicate
 * ============================================================================================== */

let caught = 0;
for (const [key, needle] of BANNED) {
  const planted = `${DOCS[key]}\n\n${needle}\n`;
  if (staleHits(key, planted).some(([, n]) => n === needle)) caught++;
}
t('ES5a', caught === BANNED.length,
  `planted each banned sentence back into its own doc · ${caught}/${BANNED.length} caught`);
t('ES5b', Object.entries(DOCS).every(([k, text]) => staleHits(k, text).length === 0),
  'and the shipped docs read clean through the same predicate');
t('ES5c', !/^- Phone first-person \+ touch\./m.test(DOCS.loop)
  && /^- Phone first-person \+ touch\./m.test('- Phone first-person + touch. x\n'),
  'the unstruck-bullet pattern fires on an unstruck bullet');

/* =================================================================================================
 * READINGS
 * ============================================================================================== */

note(`${BANNED.length} banned sentences · ${REQUIRED.length} required claims · 5 docs, 3 code anchors`);
note('history kept on purpose: D13\'s overturn line, the motion-sickness v2 note, the struck build-list line');

console.log(`\n  ${pass} ok · ${fail} fail\n`);
process.exit(fail ? 1 : 0);
