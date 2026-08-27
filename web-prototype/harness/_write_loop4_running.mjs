import { readFileSync, writeFileSync } from 'node:fs';
let prev = readFileSync('progress/overnight-vote/RUNNING.md', 'utf8');
if (prev.charCodeAt(0) === 0xFEFF) prev = prev.slice(1);
if (prev.includes('loop 4 (post-#48')) {
  const next = prev.indexOf('\n# Overnight vote', 1);
  if (next > 0) prev = prev.slice(next + 1);
}
const loop4 = [
  '# Overnight vote — loop 4 (post-#48 N=8 empty-never-invent verify)',
  '',
  'HEAD: 0aa5fc2 (main; Merge PR #48 `cursor/cast-feel-ux-cea3` — intros timeout / TV tiebreak / cast stamp + empty-ballots never invent at capacity)',
  'Time: 2026-08-25 ~00:00–00:05 Australia/Brisbane (AEST)',
  'Lead note: verify only after #48 land. **No PRs. No tally semantics changes.**',
  '',
  '## Combos tried',
  '',
  '| Combo | N | Method | Outcome | Pass |',
  '|---|---|---|---|---|',
  '| N8-unanimous | 8 | WS wire | pair p1/p2 | PASS |',
  '| N8-near-tie-4-4 | 8 | WS wire | runner:seeded → p1/p8 | PASS |',
  '| N8-plurality | 8 | WS wire | pair p1/p3 | PASS |',
  '| N8-multiway-split | 8 | WS wire | seeded both slots | PASS |',
  '| N8-self-pick-void | 8 | WS wire | → p3/p4 | PASS |',
  '| N8-late-ballot | 8 | WS wire | → p1/p2 | PASS |',
  '| N8-partial-ballots | 8 | WS wire | → p1/p2 | PASS |',
  '| N8-guide-runner-conflict | 8 | WS wire | → p1/p2 | PASS |',
  '| N8-empty-noop | 8 | WS wire | pair null/null, phase CASTING — **no invent** | **PASS** |',
  '| N8-force-spare-with-ballots | 8 | WS wire | room full; TV force → p1/p2 | PASS |',
  '| N4-empty-noop smoke | 4 | WS wire | pair null, CASTING | PASS |',
  '| N5-empty-noop smoke | 5 | WS wire | pair null, CASTING | PASS |',
  '',
  'Wire: N8 **10/10** (empty-noop fixed by #48 `if (!votes.length) return;`). Artifacts: `loop4-n8-wire.out.txt`, `loop4-n8-empty-verify.json`, harness also refreshed `loop3-n8-wire.json` on tip.',
  '',
  '## Failures / surprises',
  'None. Prior loop3 N8-empty-noop FAIL (invented p1/p7 at unused===0) is **gone** on 0aa5fc2.',
  '',
  '## Tie-break notes',
  'Unchanged. No new casting tie-break.',
  '',
  '## PRs?',
  '**None.**',
  '',
  '## Teardown',
  '5178/5181 parked. Chrome cleared. :5184 left alone. main uncommitted (harness/progress overnight junk not committed). HEAD 0aa5fc2.',
  '',
  '---',
  '',
  '',
].join('\n');
writeFileSync('progress/overnight-vote/RUNNING.md', loop4 + prev, 'utf8');
console.log(readFileSync('progress/overnight-vote/RUNNING.md', 'utf8').slice(0, 500));