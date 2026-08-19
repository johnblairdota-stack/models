/**
 * Output-path handling for the harness, in one place, because getting it wrong is this
 * project's dominant failure mode: the run looks like it worked, exits 0, and the file
 * lands somewhere nobody looks — so a critic reviews a stale image and signs off on it.
 *
 * THE BUG THIS EXISTS TO PREVENT
 * ~57 PNGs accumulated in the project root with names like
 *
 *     UsersJohnAppDataLocalTempballhand.png
 *
 * which is `C:\Users\John\AppData\Local\Temp\ballhand.png` with the separators eaten:
 *
 *   1. An agent runs, through Git Bash, an UNQUOTED Windows path:
 *        node harness/shoot.mjs --view x --out C:\Users\John\AppData\Local\Temp\b.png
 *   2. sh treats `\` as an escape character, so `\U`->`U`, `\A`->`A`, `\T`->`T` … and node
 *      receives one token: `C:UsersJohnAppDataLocalTempb.png`.
 *   3. `C:foo` is NOT a malformed path on Windows. It is a legal DRIVE-RELATIVE path
 *      meaning "foo relative to the current directory on drive C:". So path.resolve()
 *      does not throw — it cheerfully joins it onto process.cwd().
 *   4. cwd is the project root, so the capture lands in the repo. Exit 0. The success line
 *      even prints a plausible-looking filename. Nobody notices for two days.
 *
 * Step 2 happens outside node and cannot be fixed from here. Step 3 is where a mangled
 * argument turns into a silent wrong-place write, and that is what these guards cut off.
 *
 * CALLERS: pass every user-supplied path through resolveOutFile / resolveOutDir /
 * resolveInPath, and do it BEFORE launching a browser or rendering anything.
 */

import path from 'node:path';

/**
 * A drive letter NOT followed by a separator: `C:foo`, or a bare `C:`. Legal Windows
 * syntax, and the exact shape an unquoted `C:\...` collapses into once a POSIX shell has
 * eaten the backslashes. Nothing in this harness ever legitimately wants one.
 */
const DRIVE_RELATIVE = /^[A-Za-z]:(?![\\/])/;
/** A rooted Windows path (`C:\x`, `C:/x`) — meaningless on a POSIX host. */
const WINDOWS_ROOTED = /^[A-Za-z]:[\\/]/;

/** Thrown for a bad path argument so callers can exit 2 rather than dump a stack trace. */
export class PathArgError extends Error {
  constructor(message) { super(message); this.name = 'PathArgError'; }
}

/** Set RRR_ALLOW_ROOT_WRITES=1 to deliberately write into the project root. */
const ALLOW_ROOT_WRITES = process.env.RRR_ALLOW_ROOT_WRITES === '1';

function check(flagName, raw) {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new PathArgError(`--${flagName} needs a path (got ${JSON.stringify(raw)})`);
  }

  if (DRIVE_RELATIVE.test(raw)) {
    throw new PathArgError(
      `--${flagName} ${JSON.stringify(raw)} is a drive-relative path, not an absolute one.\n` +
      `\n` +
      `  "C:foo" means "foo relative to the current directory on drive C:", so this would\n` +
      `  have been written into ${process.cwd()}\n` +
      `  instead of where you meant. Refusing rather than doing that quietly.\n` +
      `\n` +
      `  This is almost always an unquoted Windows path run through a POSIX shell\n` +
      `  (Git Bash, sh -c): the backslashes are read as escape characters and vanish, so\n` +
      `  C:\\Users\\John\\AppData\\Local\\Temp\\x.png arrives as C:UsersJohnAppDataLocalTempx.png.\n` +
      `\n` +
      `  Pass one of these instead:\n` +
      `    --${flagName} "C:\\Users\\John\\AppData\\Local\\Temp\\x.png"   (quoted)\n` +
      `    --${flagName} C:/Users/John/AppData/Local/Temp/x.png       (forward slashes)`);
  }

  if (process.platform !== 'win32' && WINDOWS_ROOTED.test(raw)) {
    throw new PathArgError(
      `--${flagName} ${JSON.stringify(raw)} is a Windows path but this is not Windows.\n` +
      `  It would be treated as a relative filename and written under the project.`);
  }
}

function resolveAgainst(raw, root) {
  // Absolute stays verbatim (normalised only). Relative resolves against the project
  // root, never process.cwd(), so the destination does not depend on where node was
  // invoked from — one less thing that can differ between a manual run and an agent's.
  return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(root, raw);
}

function refuseRoot(flagName, resolved, root, what) {
  if (ALLOW_ROOT_WRITES) return;
  throw new PathArgError(
    `--${flagName} would write ${what} directly into the project root:\n` +
    `    ${resolved}\n` +
    `\n` +
    `  Harness output belongs in progress/, refs/, or a path outside the repo. Loose\n` +
    `  files in the root are how ~57 stray PNGs accumulated there unnoticed, so this is\n` +
    `  refused even when the path parses.\n` +
    `\n` +
    `  Use a subdirectory (--${flagName} progress/…) or an absolute path outside the repo.\n` +
    `  Set RRR_ALLOW_ROOT_WRITES=1 if you genuinely mean the root.`);
}

/** Resolve a user-supplied output FILE path. Absolute paths are honoured verbatim. */
export function resolveOutFile(flagName, raw, root) {
  check(flagName, raw);
  const resolved = resolveAgainst(raw, root);
  if (path.dirname(resolved) === path.resolve(root)) {
    refuseRoot(flagName, resolved, root, 'a file');
  }
  return resolved;
}

/** Resolve a user-supplied output DIRECTORY path. Absolute paths are honoured verbatim. */
export function resolveOutDir(flagName, raw, root) {
  check(flagName, raw);
  const resolved = resolveAgainst(raw, root);
  if (resolved === path.resolve(root)) {
    refuseRoot(flagName, resolved, root, 'files');
  }
  return resolved;
}

/**
 * Resolve a user-supplied INPUT path. Same mangling check — a mangled input otherwise
 * reports a confusing "missing: <file>" that hides the real cause — but no root guard,
 * since reading from the root is harmless.
 */
export function resolveInPath(flagName, raw, root) {
  check(flagName, raw);
  return resolveAgainst(raw, root);
}

/**
 * How a path should be shown in a success line. Relative when it is inside the project,
 * absolute when it is not — so "wrote it to the temp dir" is visibly distinguishable
 * from "wrote it into the repo" at a glance, which it previously was not.
 */
export function displayPath(p, root) {
  const rel = path.relative(root, p);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : p;
}
