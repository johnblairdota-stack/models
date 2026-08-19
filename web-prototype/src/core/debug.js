/**
 * DEBUG CHROME — the 37-entry view list down the right edge and the perf readout top-left.
 *
 * These are development instruments and they were shipping to players: a shared build of
 * `game.play` handed a stranger a nav menu of every asset view in the project and a four-line
 * frame-timing block over the top-left of the frame. Neither belongs in a horror game.
 *
 * The rule, in one place because `main.js` and `core/engine.js` both need it and must agree:
 *   · `?debug=1`  forces them ON  — how the harness and a developer get them back
 *   · `?debug=0`  forces them OFF
 *   · otherwise   ON for every asset view (they ARE the dev board) and OFF for `game.*`,
 *                 which is the only kind of view a player is ever pointed at
 *
 * Capture mode suppresses both regardless, as it always has — `index.html` hides `#views` on
 * `body[data-capture]` and `Engine` never builds the perf HUD in capture.
 *
 * NOTHING IN `harness/` READS EITHER FROM THE DOM, so this cannot break the tooling:
 * `shoot.mjs` takes its numbers from `window.__rrr.perf()` and `audit.mjs` from the view
 * modules. `playtest.mjs --q "debug=1"` puts them back when a session wants to see them.
 *
 * This lives in its own file rather than in `engine.js` on purpose: `main.js` is the entry
 * chunk and `engine.js` pulls in three.js, the post pipeline and the baker (584 kB). Importing
 * the predicate from there would move that whole chunk onto the critical path of a cold load
 * that already costs 23–28 s.
 */
export function debugChrome(viewId) {
  const qs = new URLSearchParams(location.search);
  if (qs.has('debug')) {
    const v = qs.get('debug');
    return v !== '0' && v !== 'false';
  }
  const id = viewId ?? qs.get('view') ?? '';
  if (String(id) === 'furn.smash') return false;
  return !String(id).startsWith('game.');
}
