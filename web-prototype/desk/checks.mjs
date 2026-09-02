/**
 * The Desk — backend verify checks.
 *
 * Every check reads the REAL repo (files, live module imports, spawned
 * harnesses). None of them read Desk UI state. That is the contract:
 * a card is Done when the repo says so, not when someone clicked so.
 *
 * A check returns { pass: boolean, detail: string }.
 */

import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';

/**
 * spec-camera-lag — Done when `docs/design/party-loop.md` stops selling
 * phone first-person and cites D13 (phone is a controller, never a viewport).
 * party-loop.md:5 claims "this file wins", so while line 41 still says
 * "Phone first-person + touch", the spec's own supremacy clause points at
 * a feature that was built (#29) and removed (#30).
 */
export async function specCameraLag(root) {
  const text = await readFile(join(root, 'docs', 'design', 'party-loop.md'), 'utf8');
  const sellsPhoneFP = /phone\s+first[- ]person/i.test(text);
  const citesD13 = /\bD13\b/.test(text);
  if (sellsPhoneFP) {
    return { pass: false, detail: 'party-loop.md still contains "Phone first-person" (line 41 build list); D13 overrides it' };
  }
  if (!citesD13) {
    return { pass: false, detail: 'party-loop.md dropped the phrase but does not cite D13 — reconcile, do not just delete' };
  }
  return { pass: true, detail: 'party-loop.md no longer sells phone first-person and cites D13' };
}

/**
 * Pure rule for the Verdict card: the rail and the wire must agree.
 * Either Verdict airs (it is a live SHOW beat) or it leaves the rail.
 */
export function verdictAgrees(showBeats, rundownBeats) {
  return showBeats.includes('verdict') || !rundownBeats.includes('verdict');
}

/**
 * verdict-on-wire — live import of `src/party/show.js` (node-safe; the
 * episode-order gate imports it the same way). Not a grep: if the arrays
 * move files or get computed, this still measures the running truth.
 */
export async function verdictOnWire(root) {
  const url = pathToFileURL(join(root, 'src', 'party', 'show.js')).href + '?t=' + Date.now();
  const show = await import(url);
  if (verdictAgrees(show.SHOW_BEATS, show.RUNDOWN_BEATS)) {
    return { pass: true, detail: 'rail and wire agree about Verdict' };
  }
  return { pass: false, detail: 'RUNDOWN_BEATS advertises verdict but SHOW_BEATS never airs it (show.js:16 vs :26)' };
}

/**
 * smash-target-gate — Done when a smash/target harness gate (1) is named in
 * the `gates:party` chain, (2) exists on disk, and (3) exits 0 when run.
 * Step 3 spawns the real harness — this is the "passing test" leg of Done.
 */
export async function smashTargetGate(root, { runner = runNode } = {}) {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const chain = (pkg.scripts && pkg.scripts['gates:party']) || '';
  const hit = chain.match(/harness\/[\w.-]*(?:smash|target)[\w.-]*\.mjs/i);
  if (!hit) {
    return { pass: false, detail: 'no smash/target gate in the gates:party chain — the bug class is still unguarded (CLAUDE.md)' };
  }
  const file = join(root, ...hit[0].split('/'));
  try { await access(file); } catch {
    return { pass: false, detail: `${hit[0]} is chained but missing on disk` };
  }
  const { code } = await runner(file, root);
  if (code !== 0) {
    return { pass: false, detail: `${hit[0]} exists but exited ${code}` };
  }
  return { pass: true, detail: `${hit[0]} is chained, exists, and passed` };
}

function runNode(file, cwd, timeoutMs = 120_000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file], { cwd, stdio: 'ignore' });
    const timer = setTimeout(() => { child.kill(); resolve({ code: -1 }); }, timeoutMs);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code }); });
    child.on('error', () => { clearTimeout(timer); resolve({ code: -1 }); });
  });
}

export const CHECKS = {
  'spec-camera-lag': specCameraLag,
  'verdict-on-wire': verdictOnWire,
  'smash-target-gate': smashTargetGate,
};
