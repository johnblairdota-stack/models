import { shouldArmCastSend, CAST_BACKSTOP_MS } from '../src/party/ballot.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const results = [];
function assert(id, pass, note, extra = {}) {
  results.push({ id, pass: !!pass, note, ...extra });
  console.log(JSON.stringify({ id, pass: !!pass, note, ...extra }));
}

const living = ['p1', 'p2', 'p3', 'p4', 'p5'];
const t0 = 1_000_000;

// 1. Empty never arms
assert('arm-empty-never', shouldArmCastSend({ livingIds: living, votes: [], firstBallotAt: t0, now: t0 + 60_000 }) === false, 'empty votes never arm');

// 2. First ballot alone must NOT arm immediately
assert(
  'arm-first-alone-no',
  shouldArmCastSend({
    livingIds: living,
    votes: [{ voter: 'p1', runner: 'p2', guide: 'p3' }],
    firstBallotAt: t0,
    now: t0 + 1000,
  }) === false,
  'first ballot alone within 1s must not arm',
);

// 3. First ballot alone still no arm at 19.9s
assert(
  'arm-first-alone-19s',
  shouldArmCastSend({
    livingIds: living,
    votes: [{ voter: 'p1', runner: 'p2', guide: 'p3' }],
    firstBallotAt: t0,
    now: t0 + CAST_BACKSTOP_MS - 100,
  }) === false,
  'first alone just under 20s backstop must not arm',
);

// 4. ~20s backstop arms even if not all-in
assert(
  'arm-backstop-20s',
  shouldArmCastSend({
    livingIds: living,
    votes: [{ voter: 'p1', runner: 'p2', guide: 'p3' }],
    firstBallotAt: t0,
    now: t0 + CAST_BACKSTOP_MS,
  }) === true,
  `backstop arms at CAST_BACKSTOP_MS=${CAST_BACKSTOP_MS}`,
  { CAST_BACKSTOP_MS },
);

// 5. All-in arms immediately (N=5)
const allIn5 = living.map((v, i) => ({
  voter: v,
  runner: living[0],
  guide: living[1],
}));
assert(
  'arm-all-in-n5',
  shouldArmCastSend({ livingIds: living, votes: allIn5, firstBallotAt: t0, now: t0 + 50 }) === true,
  'all living ballots → arm immediately',
);

// 6. All-in N=8
const living8 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const allIn8 = living8.map((v) => ({ voter: v, runner: 'a', guide: 'b' }));
assert(
  'arm-all-in-n8',
  shouldArmCastSend({ livingIds: living8, votes: allIn8, firstBallotAt: t0, now: t0 + 50 }) === true,
  'N=8 all-in arms immediately',
);

// 7. Partial (4 of 5) no arm before backstop
assert(
  'arm-partial-4of5',
  shouldArmCastSend({
    livingIds: living,
    votes: allIn5.slice(0, 4),
    firstBallotAt: t0,
    now: t0 + 5000,
  }) === false,
  '4/5 before backstop must not arm',
);

// 8. No firstBallotAt + partial → no arm
assert(
  'arm-no-firstAt',
  shouldArmCastSend({
    livingIds: living,
    votes: [{ voter: 'p1', runner: 'p2', guide: 'p3' }],
    firstBallotAt: null,
    now: t0 + 60_000,
  }) === false,
  'missing firstBallotAt never backstop-arms',
);

let head = 'unknown';
try { head = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(); } catch {}
await mkdir('progress/overnight-vote', { recursive: true });
const fails = results.filter((r) => !r.pass).length;
const summary = { at: new Date().toISOString(), head, CAST_BACKSTOP_MS, results, pass: results.length - fails, fail: fails };
await writeFile('progress/overnight-vote/loop5-arming.json', JSON.stringify(summary, null, 2));
console.log('ARMING_SUMMARY', { pass: summary.pass, fail: summary.fail, head, CAST_BACKSTOP_MS });
process.exit(fails ? 1 : 0);
