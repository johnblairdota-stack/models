#!/usr/bin/env node
/**
 * loop-board check — the critic copy stays honest, and the cheat list is executed.
 *
 *   node loop-board/check.mjs
 *   npm run loop:check
 *
 * Isolated. Not in gates:party. The night already holds sitLock / SHOW_BEATS / follow.js;
 * this file is the board's own memory so a later slice that cheats is named here too.
 *
 * Must go RED if: the HTML NOW stamp disagrees with pair-lock-stage.js; sitLock was dropped
 * in the stage; SHOW_BEATS grew a sendoff; follow.js grew a sendoff/pairlock cue or a second
 * follow beat; a shot plate is missing; loop:board left port 5209.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAIR, PAIR_CLIPS, PAIR_LOCK_MS } from '../src/game/pair-lock-stage.js';
import { accusationSpan, ACCUSE } from '../src/game/accusation-stage.js';
import { SHOW_BEATS } from '../src/party/show.js';
import { CUE_KINDS, FOLLOW_BEATS } from '../src/party/follow.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const WEB = join(ROOT, '..');
const lf = (rel) => readFileSync(join(WEB, rel), 'utf8').replace(/\r\n/g, '\n');
const codeOf = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ' · ' + d : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ' · ' + d : ''}`); }
  return c;
};

console.log('\nloop-board · pair-lock sendoff critic\n');

const html = lf('loop-board/index.html');
const readme = lf('loop-board/README.md');
const pkg = JSON.parse(lf('package.json'));
const stageSrc = lf('src/game/pair-lock-stage.js');
const introSrc = lf('src/game/intro-bed.js');
const followSrc = lf('src/party/follow.js');
const showSrc = lf('src/party/show.js');
const attr = (k) => {
  const m = html.match(new RegExp(`data-now-${k}="([^"]+)"`));
  return m ? m[1] : null;
};

/* ── L0 · NOW stamp matches the tree ───────────────────────────────────────────────────────── */
{
  t('L0a · STAND_RUNNER on the board is PAIR.STAND_RUNNER',
    Number(attr('stand-runner')) === PAIR.STAND_RUNNER,
    `html=${attr('stand-runner')} tree=${PAIR.STAND_RUNNER}`);
  t('L0b · STAND_GUIDE on the board is PAIR.STAND_GUIDE (0.40 shipped)',
    Number(attr('stand-guide')) === PAIR.STAND_GUIDE && PAIR.STAND_GUIDE === 0.40,
    `html=${attr('stand-guide')} tree=${PAIR.STAND_GUIDE}`);
  t('L0c · SETTLE / FADE / ms match PAIR and PAIR_LOCK_MS 2250',
    Number(attr('settle')) === PAIR.SETTLE && PAIR.SETTLE === 2.00
    && Number(attr('fade')) === PAIR.FADE && PAIR.FADE === 0.25
    && Number(attr('ms')) === PAIR_LOCK_MS && PAIR_LOCK_MS === 2250,
    `SETTLE=${PAIR.SETTLE} FADE=${PAIR.FADE} ms=${PAIR_LOCK_MS}`);
  t('L0d · clip on the board is Sit_to_Stand_Transition_M',
    attr('clip') === PAIR_CLIPS.stand && PAIR_CLIPS.stand === 'Sit_to_Stand_Transition_M',
    attr('clip'));
  t('L0e · accusationSpan is also 2.25s — the board must not invent a 4s machine',
    accusationSpan() === ACCUSE.SETTLE + ACCUSE.FADE
    && accusationSpan() === 2.25
    && html.includes('accusationSpan()')
    && html.includes('2.25'),
    `span=${accusationSpan()}`);
}

/* ── L1 · four plates in the DOM, files on disk ────────────────────────────────────────────── */
{
  const shots = [
    'shot-now-chorus.jpg',
    'shot-a-jobs.jpg',
    'shot-b-door-in-frame.jpg',
    'shot-c-vote-slice.jpg',
  ];
  const missing = shots.filter((s) => !existsSync(join(ROOT, 'shots', s)));
  t('L1a · four plates exist under loop-board/shots/',
    missing.length === 0, missing.join(',') || shots.join(', '));
  t('L1b · index.html embeds all four as <img src="shots/…">',
    shots.every((s) => html.includes(`src="shots/${s}"`)));
  t('L1c · the four kinds are stamped NOW / PROPOSAL / HUNCH / NEW SLICE',
    /data-kind="now"/.test(html) && /data-kind="proposal"/.test(html)
    && /data-kind="hunch"/.test(html) && /data-kind="slice"/.test(html)
    && /CHORUS-LINE/.test(html) && /SHOT A/.test(html)
    && /SHOT B/.test(html) && /SHOT C/.test(html));
}

/* ── L2 · port 5209, not Desk / Night / Hunter / live ──────────────────────────────────────── */
{
  const script = pkg.scripts?.['loop:board'] ?? '';
  t('L2a · npm run loop:board serves loop-board on 5209',
    script.includes('--dir loop-board') && script.includes('--port 5209'),
    script || 'missing');
  t('L2b · that script is not 5199 / 5205 / 5207 / 5178 / 5181',
    !/\b(5199|5205|5207|5178|5181)\b/.test(script));
  t('L2c · the HTML and README name 5209 and refuse the other boards\' ports',
    html.includes(':5209') && readme.includes('5209')
    && readme.includes('5199') && readme.includes('5205') && readme.includes('5207'));
  t('L2d · loop:check is this file, not in gates:party',
    (pkg.scripts?.['loop:check'] ?? '').includes('loop-board/check.mjs')
    && !(pkg.scripts?.['gates:party'] ?? '').includes('loop-board'));
}

/* ── L3 · cheats the night already catches — restated so the board names them ──────────────── */
{
  const stageCode = codeOf(stageSrc);
  t('L3a · sitLock was not dropped in pair-lock-stage (P3d would go red)',
    !/sitLock\s*=\s*false/.test(stageCode)
    && /sitLock stays on/.test(stageSrc)
    && /sitLock stays on/.test(introSrc),
    'gate · pair-lock-stage P3d');
  t('L3b · SHOW_BEATS has no sendoff (P3a + show-beat SB2 would go red)',
    !SHOW_BEATS.includes('sendoff')
    && !/sendoff/.test(codeOf(showSrc).split('SHOW_BEATS')[1]?.slice(0, 400) ?? '')
    && SHOW_BEATS.filter((b) => b === 'expedition').length === 1,
    `SHOW_BEATS=[${SHOW_BEATS.join(', ')}] · gate · P3a / SB2`);
  t('L3c · follow.js has no sendoff/pairlock cue and FOLLOW_BEATS is still expedition-only (P3e / F0c)',
    !/sendoff/.test(followSrc)
    && !CUE_KINDS.includes('sendoff')
    && !CUE_KINDS.includes('pairlock')
    && FOLLOW_BEATS.length === 1
    && FOLLOW_BEATS[0] === 'expedition',
    `CUE_KINDS=[${CUE_KINDS.join(', ')}] · gate · P3e / party-follow F0c`);
  t('L3d · the cheat table on the board names those three gates',
    html.includes('pair-lock-stage P3d')
    && html.includes('show-beat SB2')
    && html.includes('party-follow F0c'));
}

/* ── L4 · critic copy does not tell Lead to cheat ──────────────────────────────────────────── */
{
  t('L4a · the board does not add a SHOW beat or a follow.js mode',
    /No new SHOW beat/.test(html)
    && /not a new <code>follow\.js<\/code> mode|Not a new <code>follow\.js<\/code> mode/.test(html)
    && /Playability loop does not implement/.test(html));
  t('L4b · Shot C is a NEW SLICE and closed as chrome-only — not pair-lock',
    /Do not sneak this into pair-lock/.test(html)
    && /Closed today as chrome-only/.test(html));
  t('L4c · Shot A keeps sitLock and Sit_to_Stand_Transition_M',
    /Keep sitLock/.test(html) && /Sit_to_Stand_Transition_M/.test(html)
    && /STAND_GUIDE/.test(html) && /1\.00/.test(html));
}

console.log(`\nloop-board: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
