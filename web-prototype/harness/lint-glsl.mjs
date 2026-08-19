#!/usr/bin/env node
/**
 * GLSL TEMPLATE-LITERAL LINT — the one trap that keeps taking the whole build down.
 *
 * A backtick inside a `/* glsl *​/` template literal TERMINATES THE JS STRING. The file then
 * fails to parse, `vite build` goes red, and — because every agent shares one dev server and
 * one `dist/` — EVERY concurrent agent's captures break at once, usually while the author has
 * already moved on. It has happened four times in two days, in four different files, by four
 * different agents:
 *
 *   src/materials/surfaces/robot.js   `Dev Art/...` in a comment
 *   src/materials/surfaces/robot.js   `uMouthW` in a comment
 *   src/world/materials-local.js      `pat()` in a comment      (twice, ~5 min apart)
 *   src/views/game.js                 a backticked identifier in a comment
 *
 * Every instance was a backtick used as PROSE PUNCTUATION inside a comment — someone quoting
 * an identifier the way this codebase quotes identifiers everywhere else. The rule is already
 * written in HANDOFF.md, in the rrr-pipeline skill's trap list, and at the top of two of the
 * files it broke. Documentation has now failed four times, so this is the mechanical guard.
 *
 *   node harness/lint-glsl.mjs          report and exit non-zero on any hit
 *   node harness/lint-glsl.mjs --quiet  exit code only
 *
 * WHAT IT CHECKS. Any template literal opened on a line carrying a `glsl` marker, or assigned
 * to a SCREAMING_CASE *_FRAG/_VERT/_SURFACE/_SHADER name, must contain no backtick before its
 * terminator. Reported with file:line so the fix is one keystroke — swap it for a single quote.
 */

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUIET = process.argv.includes('--quiet');

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.js')) yield p;
  }
}

// A line that opens a shader template: `/* glsl */ \`` or `const FOO_FRAG = \``
const OPENS = /(\/\*\s*glsl\s*\*\/\s*`)|(\b[A-Z][A-Z0-9_]*(?:FRAG|VERT|SURFACE|SHADER|GLSL)\b\s*=\s*`)/;

/**
 * 🚨 THE SIXTH INCIDENT GOT PAST THIS GATE, AND THE GATE PRINTED "clean".
 *
 * `OPENS` recognises a shader literal only by how it is LABELLED — a `/* glsl *​/` tag or a
 * SCREAMING_FRAG name. On 2026-08-08 `breakmask.js` gained a backtick around `_bcontact` in a
 * comment inside an `onBeforeCompile` replacement, which is an ordinary untagged template
 * literal. It broke the build for everyone, and `lint-glsl.mjs` reported clean — so the tool
 * whose entire job is catching this class reported a pass on the exact bug, and the author
 * lost a gate lap and a perf lap before anyone realised the gate was blind rather than the
 * file innocent. Found and reported by `estate-1`.
 *
 * So: also open on a BARE backtick that begins a multi-line literal, if the next few lines
 * actually look like GLSL. Detection by CONTENT, not by label. The markers below are chosen
 * to be unambiguous — they do not occur in ordinary JS or in prose — because a false positive
 * here fails `npm run build` for every agent and would be worse than the bug.
 */
const BARE_OPEN = /(?:[=(,:]|=>|\breplace\()\s*`\s*$/;
const GLSL_MARKER = /gl_FragColor|gl_Position|#include\s*<|void\s+main\s*\(/;
const LOOKAHEAD = 40;

const hits = [];
for await (const file of walk(path.join(ROOT, 'src'))) {
  const src = await readFile(file, 'utf8');
  const lines = src.split('\n');
  let inShader = false;
  /**
   * ⚠️ BACKTICKS INSIDE `${…}` ARE A NESTED TEMPLATE, NOT THIS LITERAL'S TERMINATOR — AND THE
   * NESTING SPANS LINES, SO THIS COUNTER MUST PERSIST ACROSS THEM.
   *
   * `${dmg ? `…many lines of GLSL…` : ''}` is legal JavaScript and is how this project splices
   * a conditional damage arm into a shader. Both of its backticks sit inside the interpolation:
   * the opener on one line, the closer many lines later. A per-line check catches the opener
   * and misses the closer, which then looks exactly like a build-breaking stray backtick.
   *
   * Caught 2026-08-08. `breakmask.js` grew three of these, and `npm run build` — which runs this
   * lint FIRST — began failing on code `vite` compiles perfectly (confirmed via
   * `npm run build:only`). **A false positive here fails the build for every agent at once,
   * which is strictly worse than the bug this tool exists to catch**, and the next person to
   * hit it would reasonably have reported "I broke the build" and gone looking in their own diff.
   */
  let interp = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (inShader) {
      // Count interpolation depth BEFORE the terminator test below, so a line that both opens
      // and closes a `${…}` nets to zero and is judged normally.
      const opens = (line.match(/\$\{/g) ?? []).length;
      const closes = (line.match(/\}/g) ?? []).length;
      if (opens > 0) interp += opens;
      if (interp > 0) {
        interp = Math.max(0, interp - Math.min(closes, interp));
        continue;   // every backtick on this line belongs to a nested template
      }
    } else {
      interp = 0;
    }
    if (!inShader) {
      if (OPENS.test(line)) {
        inShader = true;
        // a one-line shader literal opens and closes on the same line — ignore those
        const after = line.slice(line.search(OPENS) + 1);
        if ((after.match(/`/g) ?? []).length >= 2) inShader = false;
      } else if (BARE_OPEN.test(line)) {
        // An untagged literal. Only treat it as a shader if what follows actually IS one —
        // see BARE_OPEN's note. Stop looking at the literal's own terminator so a short JS
        // string followed later by unrelated shader code cannot arm this by accident.
        for (let k = i + 1; k < Math.min(lines.length, i + 1 + LOOKAHEAD); k++) {
          if (lines[k].includes('`')) break;
          if (GLSL_MARKER.test(lines[k])) { inShader = true; break; }
        }
      }
      continue;
    }
    // inside a shader literal: the FIRST backtick is the terminator. Anything before it on
    // the same line, or any backtick on a line that is not meant to close it, is the bug.
    const tick = line.indexOf('`');
    if (tick >= 0) {
      const before = line.slice(0, tick).trim();
      // a terminator normally sits alone or is followed by `;` / `,` / `)` — prose before it
      // on the same line means this backtick was punctuation, not the close.
      // `}` belongs here: a shader almost always ends `}` immediately before its terminator,
      // which the first version of this lint flagged as prose and reported two false hits on a
      // clean tree. A linter that cries wolf on correct code gets switched off, and then the
      // real bug ships — so the allowed set is exactly the punctuation a close can carry.
      const looksLikeClose = before === '' || /^[)\]};,]*$/.test(before);
      if (!looksLikeClose) {
        hits.push({ file: path.relative(ROOT, file), line: i + 1, text: line.trim().slice(0, 96) });
      }
      inShader = false;
    }
  }
}

if (hits.length) {
  if (!QUIET) {
    console.error(`\n  ${hits.length} BACKTICK(S) INSIDE A GLSL TEMPLATE LITERAL — this breaks the build for every agent:\n`);
    for (const h of hits) console.error(`   ${h.file}:${h.line}\n     ${h.text}`);
    console.error('\n  Fix: use a single quote. A backtick cannot appear inside these literals at all.\n');
  }
  process.exit(1);
}
if (!QUIET) console.log('  glsl literals clean');

/* ===========================================================================================
 * PASS 2 — PARSE EVERY FILE. Added 2026-08-09, after incidents SEVEN and EIGHT.
 *
 * The heuristics above are pattern-matching, and pattern-matching can only ever catch the
 * shapes someone anticipated. Two more outages proved the gap, both in `harness/strobe.mjs`:
 * backticks quoting an identifier in a comment inside SETUP_SLEDGE — an ordinary JS template
 * literal holding browser code, containing no GLSL whatsoever. Pass 1 reported "clean" on both,
 * correctly by its own rules and uselessly in practice. It also never looked at the file at
 * all: `walk()` yields only `.js`, so the entire `harness/` tree of `.mjs` was unscanned.
 *
 * 🎯 THE PARSER IS THE ORACLE. `node --check` answers the actual question — "does this file
 * parse" — for every literal type, every file type, and every trap nobody has thought of yet.
 * It cannot false-positive on valid code, which matters here: the last attempt to widen pass 1
 * broke the build TWICE with false hits on legal nested templates, and a gate that cries wolf
 * gets bypassed, after which the real bug ships. This pass has no such failure mode.
 *
 * ⚠️ HOW IT PARSES MATTERS, because the obvious way is too slow to keep. `node --check` spawns
 * one process per file: correct, but **6.5 s for 367 files against a 2.5 s build**, and a gate
 * that costs more than the thing it guards gets skipped. esbuild is already here as a vite
 * dependency, parses the same grammar in-process, and does the whole repo in well under a
 * second. It is a transitive dependency though, so if it is ever missing this falls back to
 * `node --check` rather than silently checking nothing — a gate that quietly stops running is
 * the failure mode this whole file exists to prevent.
 * =========================================================================================== */

async function* walkAll(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkAll(p);
    else if (e.name.endsWith('.js') || e.name.endsWith('.mjs')) yield p;
  }
}

const all = [];
for await (const f of walkAll(ROOT)) all.push(f);

const broken = [];
let parser = 'esbuild';
let esbuild = null;
try { esbuild = await import('esbuild'); } catch { parser = 'node --check'; }

if (esbuild) {
  await Promise.all(all.map(async (f) => {
    try {
      // `transform` only needs to PARSE — no bundling, no resolution, no output written.
      await esbuild.transform(await readFile(f, 'utf8'), { loader: 'js', format: 'esm', sourcefile: f });
    } catch (err) {
      const e = err?.errors?.[0];
      const detail = e
        ? `${e.text}  (line ${e.location?.line ?? '?'}${e.location?.lineText ? `)\n     ${e.location.lineText.trim()}` : ')'}`
        : String(err.message).split('\n')[0];
      broken.push({ file: path.relative(ROOT, f), detail });
    }
  }));
} else {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  await Promise.all(all.map(async (f) => {
    try {
      await run(process.execPath, ['--check', f]);
    } catch (err) {
      // `node --check` puts the offending line, a caret and the SyntaxError on stderr. Keep the
      // first four lines — that is the location and the message, which is the whole fix.
      const detail = String(err.stderr || err.message).split('\n').slice(0, 4).join('\n     ').trim();
      broken.push({ file: path.relative(ROOT, f), detail });
    }
  }));
}

if (broken.length) {
  if (!QUIET) {
    console.error(`\n  ${broken.length} FILE(S) DO NOT PARSE — the build is down for every agent right now:\n`);
    for (const b of broken) console.error(`   ${b.file}\n     ${b.detail}\n`);
    console.error('  If this is a backtick inside a template literal, swap it for a single quote.\n');
  }
  process.exit(1);
}
if (!QUIET) console.log(`  ${all.length} files parse clean (${parser})`);
