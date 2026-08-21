/**
 * 🔎 **CALL-SITE SCAN — the shipped tree read as a graph, so a gate can assert a WIRE instead of
 * a FLAG.**
 *
 * Two gates need the same fact and neither may take it on trust: *does anything that ships
 * actually call this?* `task-deck` K4 used to answer it by reading a `built: true` literal out of
 * `src/party/tasks.js` and a hand-written `source` string beside it, then printing
 * `WALL_CALL:per-blow emit (noiseplan.js)` — which reads like a wiring assertion and is a string
 * constant. The file under test was the only witness to its own conformance.
 *
 * That is the instrument that let `dark-run` D4 check `darkrun.js`'s table against `darkrun.js`'s
 * table for months, and it hid a factor-of-three error. **A declaration in the module under test
 * may not be the evidence for a claim about that module.**
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 **`harness/` IS THE INSTRUMENT AND CAN NEVER BE THE EVIDENCE.**
 * ---------------------------------------------------------------------------------------------
 * Shipped code is `src/` and `net/` — what a browser can reach. A gate importing a module is not
 * that module being wired into a game: `attachPartyNoise` has exactly two mentions in the whole
 * tree, its own definition and `harness/party-noise.mjs`'s rig, and a scan that counted the second
 * would report the wire as present and green. So the roots below stop short of `harness/`.
 *
 * ⚠️ **A CITATION IS NOT A CALL.** `tasks.js`'s header names `noiseplan.js` three times and
 * imports it zero times; `session.js` names it once, in a comment about a number. Every scan here
 * runs on stripped text or all four would read as wiring. Comments are blanked rather than
 * deleted, so a reported `file:line` still points at the line a reader will open.
 *
 * No THREE, no DOM.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';

const ROOT = new URL('../', import.meta.url);

/** Shipped code. `harness/` is deliberately absent and that absence is the point of this file. */
export const SHIPPED_ROOTS = ['src', 'net'];

const blank = (m) => m.replace(/[^\n]/g, ' ');
export const strip = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, blank)
  .replace(/<!--[\s\S]*?-->/g, blank)
  .replace(/(^|[^:])\/\/.*$/gm, (m, p1) => p1);

function walk(dir, out) {
  for (const name of readdirSync(new URL(dir + '/', ROOT))) {
    const rel = `${dir}/${name}`;
    if (statSync(new URL(rel, ROOT)).isDirectory()) walk(rel, out);
    else if (/\.(js|mjs|html)$/.test(name)) out.push(rel);
  }
  return out;
}

/** Every shipped file, as `Map<relPath, rawText>`. Read once, then handed around. */
let _files = null;
export function shippedFiles() {
  if (_files) return _files;
  _files = new Map();
  for (const root of SHIPPED_ROOTS) for (const rel of walk(root, [])) _files.set(rel, readFileSync(new URL(rel, ROOT), 'utf8'));
  return _files;
}

export const readShipped = (rel, files = shippedFiles()) => {
  const t = files.get(rel);
  if (t == null) throw new Error(`callsite-scan: ${rel} is not a shipped file`);
  return t;
};

/** Resolve a relative specifier seen in `from` to a repo-relative path. Bare specifiers drop. */
export function resolveSpec(from, spec) {
  if (!spec.startsWith('.')) return null;
  const abs = new URL(spec, new URL(from, ROOT)).href;
  return abs.startsWith(ROOT.href) ? abs.slice(ROOT.href.length) : null;
}

/** Every module `text` imports, resolved: static `from '…'`, `import('…')`, and `<script src>`. */
export function importsOf(text, from) {
  const b = strip(text);
  const out = new Set();
  const add = (s) => { const r = resolveSpec(from, s); if (r) out.add(r); };
  for (const m of b.matchAll(/\bfrom\s*['"]([^'"]+)['"]/g)) add(m[1]);
  for (const m of b.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) add(m[1]);
  for (const m of b.matchAll(/<script[^>]+src\s*=\s*['"]([^'"]+)['"]/g)) add(m[1]);
  return out;
}

/** Which shipped files import `module` (a repo-relative path). */
export function shippedImportersOf(module, files = shippedFiles()) {
  const out = [];
  for (const [rel, text] of files) {
    if (rel === module) continue;
    if (importsOf(text, rel).has(module)) out.push(rel);
  }
  return out;
}

/** The names a module offers a caller. Derived from the module, so no gate hardcodes a list. */
export function exportedFns(module, files = shippedFiles()) {
  return [...strip(readShipped(module, files)).matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
}

/**
 * Every shipped `name(` that is a CALL — `{file, line, text}`.
 *
 * 🚨 A DEFINITION IS NOT A CALL AND AN IMPORT IS NOT A CALL. `export function attachPartyNoise(`
 * and `import { attachPartyNoise } from …` both carry the identifier; counting either would report
 * every module as wired into itself, which is the failure mode this whole file exists to avoid.
 */
export function shippedCallSites(name, { exclude = [], files = shippedFiles() } = {}) {
  const call = new RegExp(`(^|[^\\w$.])${name}\\s*\\(`);
  const def = new RegExp(`\\bfunction\\s+${name}\\s*\\(`);
  const out = [];
  for (const [rel, raw] of files) {
    if (exclude.includes(rel)) continue;
    strip(raw).split('\n').forEach((line, i) => {
      if (!call.test(line) || def.test(line)) return;
      if (/^\s*(?:import|export)\b/.test(line) && /\bfrom\s*['"]/.test(line)) return;
      out.push({ file: rel, line: i + 1, text: line.trim() });
    });
  }
  return out;
}

/** Every `<bus>.emit(` in one shipped file, with its argument text. */
export function emitSites(rel, files = shippedFiles()) {
  const out = [];
  strip(readShipped(rel, files)).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/\b([A-Za-z_$][\w$]*)\.emit\s*\(([^;]*)/g)) {
      out.push({ file: rel, line: i + 1, bus: m[1], args: m[2].trim() });
    }
  });
  return out;
}

/**
 * A copy of the shipped tree with one real file really edited — the rig every control in these
 * gates runs on.
 *
 * 🚨 **AND IT THROWS IF THE SPLICE DID NOT LAND.** `wire-parity` P9 arm c's rule: a control that
 * doctors a file it has drifted away from is testing a string it wrote itself, and that specific
 * defect — a regex run against the gate's own literal — has been found in this suite repeatedly.
 * If the anchor text is gone, this is a hard error rather than a quiet pass.
 */
export function doctor(rel, find, replace, files = shippedFiles()) {
  const before = readShipped(rel, files);
  const after = before.replace(find, replace);
  if (after === before) throw new Error(`callsite-scan: the control's splice did not land on ${rel} — the anchor \`${find}\` is not in the shipped text any more, so the control proves nothing`);
  const out = new Map(files);
  out.set(rel, after);
  return out;
}
