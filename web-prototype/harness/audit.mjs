#!/usr/bin/env node
/**
 * Scoreboard integrity audit.
 *
 * The method this project runs on — many agents, each grading its own work, a critic
 * grading theirs — has one dangerous failure mode: a piece gets recorded as done when
 * nothing was actually built. It happened: `mat.robot` sat at PASS 68% while its view
 * file was still the `notBuilt()` stub, so every judgement of it was judging a black
 * screen with the words NOT BUILT on it.
 *
 * This catches that class of lie mechanically. Run it before believing the board.
 *
 *   node harness/audit.mjs            report (fast: data only)
 *   node harness/audit.mjs --fix      reset provably-false entries to NOT_BUILT
 *   node harness/audit.mjs --render   ALSO load every view and fail on any that throws
 *
 * Exits non-zero if anything is wrong, so a loop can gate on it.
 *
 * WHY --render EXISTS
 * A subagent that dies mid-edit can leave the tree in a state that does not load. It
 * happened: an agent was killed having written `import { Baker }` when the export is
 * `MaterialBaker`, and the whole collapse view threw on load. The data audit was clean —
 * the score was honest, the screenshot existed, it was just stale — so nothing flagged
 * it. Only rendering catches that class, which makes it worth the minutes.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = process.argv.includes('--fix');

const status = JSON.parse(await readFile(path.join(ROOT, 'progress/status.json'), 'utf8'));
const viewsSrc = await readFile(path.join(ROOT, 'src/views.js'), 'utf8');

const viewFile = {};
const re = /id:\s*'([^']+)'[\s\S]{0,320}?module:\s*\(\)\s*=>\s*import\('\.\/views\/([^']+)'\)/g;
let m;
while ((m = re.exec(viewsSrc))) viewFile[m[1]] = m[2];

const problems = [];

for (const [id, p] of Object.entries(status.pieces)) {
  const f = viewFile[id];
  const score = p.score || 0;
  const claimed = p.verdict !== 'NOT_BUILT';

  if (!f) { problems.push({ id, kind: 'no-view', msg: 'no view module in the registry' }); continue; }

  const full = path.join(ROOT, 'src/views', f);
  if (!existsSync(full)) {
    problems.push({ id, kind: 'missing', msg: `view file src/views/${f} does not exist` });
    continue;
  }

  const body = await readFile(full, 'utf8');

  // A stub is a view that IMPORTS the stub helper and CALLS it, not one that mentions it.
  //
  // ⚠️ This was a substring match on `notBuilt(` and it produced a false positive on
  // `mat-robot.js`, which only names the helper in a header comment describing its own
  // history — a real, critic-scored piece was reported as an unbuilt stub. That is not
  // cosmetic: `--fix` acts on this flag and would have reset the piece to NOT_BUILT and
  // wiped a critic's score on the strength of a comment. An instrument that silently
  // destroys the record it exists to protect is the worst failure mode on this project.
  //
  // So the test is structural and needs BOTH halves, against code with comments removed:
  // the file must import `./_notbuilt.js` AND call the helper. Prose can never reach it,
  // because a comment is stripped before either half is tried; and neither half alone is
  // enough, so the bare mention that caused the bug cannot resurrect it even if the
  // comment stripper is one day defeated by a string literal. The remaining failure
  // direction is safe: over-stripping can only make a stub look built, never the reverse.
  const code = body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const isStub = /from\s*['"]\.\/_notbuilt\.js['"]/.test(code) && /\bnotBuilt\s*\(/.test(code);

  // A stub view claiming anything above BUILDING is the lie we care about. BUILDING at 0
  // is honest — it means an agent is mid-flight on it.
  if (isStub && (score > 0 || !['NOT_BUILT', 'BUILDING'].includes(p.verdict))) {
    problems.push({
      id, kind: 'stub-scored', score, verdict: p.verdict,
      msg: `recorded ${p.verdict} ${score}% but src/views/${f} is still the notBuilt() stub`,
    });
  }

  // A shot referenced but never captured
  if (claimed && p.shot && !existsSync(path.join(ROOT, 'progress', p.shot))) {
    problems.push({ id, kind: 'no-shot', msg: `claims ${p.verdict} but ${p.shot} was never captured` });
  }

  // WOWED may only be set by a critic. A builder awarding itself the top band is the
  // other way this method degrades.
  if (p.verdict === 'WOWED' && p.owner && !/^critic/i.test(p.owner)) {
    problems.push({ id, kind: 'self-wowed', msg: `WOWED was set by "${p.owner}", which is not a critic` });
  }

  // STALE VERDICT — a critic judged this, then a builder changed it.
  // `wall.transition` sat on the board at REJECT 32 while the render it described had
  // already been replaced by one with a working dust burst. The score was honest when
  // filed and misleading five minutes later, and nothing marked the difference. A verdict
  // is only about the frame that existed when it was written.
  if (/^critic/i.test(p.owner || '') && p.updatedAt && p.shot) {
    const shotPath = path.join(ROOT, 'progress', p.shot);
    if (existsSync(shotPath)) {
      const shotTime = statSync(shotPath).mtimeMs;
      const verdictTime = Date.parse(p.updatedAt);
      // a minute of slack: the critic shoots, looks, then files
      if (shotTime > verdictTime + 60_000) {
        const mins = Math.round((shotTime - verdictTime) / 60000);
        problems.push({
          id, kind: 'stale-verdict',
          msg: `${p.owner} filed ${p.verdict} ${p.score}%, but the piece was re-rendered ${mins}m later — the verdict describes a frame that no longer exists`,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// --render: boot every view in a real browser and fail on any that throws.
// This is the only check that catches a half-finished edit, a bad import, or a shader
// that stopped compiling — none of which leave any trace in status.json.
// ---------------------------------------------------------------------------
if (process.argv.includes('--render')) {
  const { spawnSync } = await import('node:child_process');
  const ids = Object.keys(status.pieces);
  console.log(`rendering ${ids.length} views…`);
  const args = ['harness/shoot.mjs', '--quiet', '--dir',
    path.join(process.env.TEMP || '/tmp', 'rrr-audit')];
  for (const id of ids) args.push('--view', id);
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const failed = [];
  for (const line of out.split('\n')) {
    const m = line.match(/FAIL\s+(\S+):\s*(.*)/);
    if (m) failed.push({ id: m[1], msg: m[2].trim() });
  }

  // RETRY, because a first-pass failure here is usually not a broken view.
  // Observed: three consecutive full runs each failed 2 of 37, but the failing SET was
  // different every time and every one rendered fine on its own. The causes are transient
  // and environmental — another agent editing a module mid-run, and contention on the
  // single dev-server port — not code that is actually broken. Re-running only the
  // failures, serially, separates "genuinely will not load" from "lost a race".
  const real = [];
  for (const f of failed) {
    const rr = spawnSync(process.execPath,
      ['harness/shoot.mjs', '--quiet', '--view', f.id,
       '--dir', path.join(process.env.TEMP || '/tmp', 'rrr-audit')],
      { cwd: ROOT, encoding: 'utf8' });
    const o = (rr.stdout || '') + (rr.stderr || '');
    const m = o.match(/FAIL\s+\S+:\s*(.*)/);
    if (m) real.push({ id: f.id, msg: m[1].trim() });
    else console.log(`  (${f.id} failed in the batch but renders alone — transient, ignoring)`);
  }
  for (const f of real) {
    problems.push({ id: f.id, kind: 'render', msg: `view fails to render: ${f.msg}` });
  }
  if (r.status !== 0 && !real.length && !failed.length) {
    problems.push({ id: '(harness)', kind: 'render', msg: `shoot.mjs exited ${r.status}` });
  }
}

if (!problems.length) {
  console.log(`audit clean — ${Object.keys(status.pieces).length} pieces, nothing overclaimed` +
    (process.argv.includes('--render') ? ', every view renders' : ''));
  process.exit(0);
}

console.log(`\n${problems.length} INTEGRITY PROBLEM${problems.length > 1 ? 'S' : ''}\n`);
for (const p of problems) console.log(`  ${p.id.padEnd(18)} [${p.kind}] ${p.msg}`);

if (FIX) {
  let fixed = 0;
  for (const p of problems) {
    if (p.kind !== 'stub-scored' && p.kind !== 'self-wowed') continue;
    const piece = status.pieces[p.id];
    if (p.kind === 'stub-scored') {
      piece.verdict = 'NOT_BUILT'; piece.score = 0;
      piece.hates = [`reset by audit: ${p.msg}`];
    } else {
      piece.verdict = 'PASS';
      piece.hates = [...(piece.hates ?? []), `reset by audit: ${p.msg}`];
    }
    piece.updatedAt = new Date().toISOString();
    fixed++;
  }
  status.log = status.log ?? [];
  status.log.unshift({ at: new Date().toISOString(), note: `audit --fix reset ${fixed} overclaimed entries` });
  await writeFile(path.join(ROOT, 'progress/status.json'), JSON.stringify(status, null, 2));
  console.log(`\nreset ${fixed} entries`);
}

console.log('');
process.exit(1);
