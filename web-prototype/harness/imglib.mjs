/**
 * Shared image loading for the measurement tools — probe.mjs, diff.mjs, crop.mjs, measure.mjs.
 *
 * WHY THIS EXISTS. Six separate throwaway measurement scripts accumulated in this directory,
 * each written by an agent that needed to measure something, could not find a tool, wrote one,
 * and abandoned it. They all reimplemented the same browser-canvas image load, and they did not
 * all get it right.
 *
 * THE TRAP THIS SOLVES, and it is the project's dominant failure mode showing up in the
 * VERIFICATION tooling rather than in the code: Chromium caches `file://` images by URL, and
 * every render in this project writes back to the SAME path. So measuring a re-rendered file
 * silently returns the PREVIOUS measurement. It does not error. It returns a stale, plausible
 * number — three consecutive comparisons once came back identical to the last digit, and a
 * false `wall.sheet` regression was nearly reported on it.
 *
 * The obvious fix, appending `?t=<now>` to the file:// URL, is NOT reliable: query strings are
 * not part of a file path, so depending on how the page was navigated the browser either treats
 * it as a distinct cache key (works) or looks for a file that does not exist and throws an
 * opaque `EncodingError: The source image cannot be decoded` (fails). One scratch tool here
 * used that approach and its correctness was never established either way.
 *
 * So: read the bytes in node and hand the browser a `data:` URL. No cache, no origin rules, no
 * ambiguity. Slightly more memory, completely deterministic.
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Relative paths resolve against the project root; absolute paths are honoured verbatim. */
export const resolveImg = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));

/** Read an image off disk as a cache-proof data: URL. */
export async function toDataURL(file) {
  const buf = await readFile(resolveImg(file));
  const ext = path.extname(file).toLowerCase() === '.jpg' ? 'jpeg' : 'png';
  return `data:image/${ext};base64,${buf.toString('base64')}`;
}

/** Open a headless page for canvas work. Caller must close the returned browser. */
export async function openCanvasPage() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  return { browser, page };
}
