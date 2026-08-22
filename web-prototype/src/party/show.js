/**
 * Durable room show. The beat lives on the server, not in a host tab.
 *
 * Phones can already be in the run (pad + phase events) while a refreshed TV
 * sits on lobby/casting if `room.show` is only host-tab RAM. Welcome pushes
 * this beat; playEpisode pins expedition; the stub clock then pins recap.
 * "Watch the run" is a host workaround, not the clock.
 */

export const SHOW_BEATS = ['lobby', 'casting', 'expedition', 'recap'];

/**
 * Server-owned. Expedition is immediate so the TV is never waiting on a click.
 *
 * 🎥 **THE RUN IS 26 s, NOT 4.8 s, AND THAT NUMBER MOVED BECAUSE THE PICTURE DID**
 * (`docs/slices/task-d13-tv-follow.md`, D13).
 *
 * 4800 ms was the right length for a caption. It was chosen when expedition was a robot face and
 * the words "Hai is running", and 4.8 seconds is about as long as anyone will look at a still.
 * Expedition is now a live mansion camera following the runner, and 4.8 s is shorter than the
 * scene takes to bake on a cold tab — so the beat would flip to recap before the show it exists
 * to hold had a first frame, and every viewer would see the slate and conclude the follow does
 * not work.
 *
 * 26 s is one produced beat: long enough for the operator to take three or four cuts (5.5-9 s
 * each, `follow-bed.js`), and near `views/game.js`'s own 28 s capture LOOP, so a run and a
 * `game.play` capture are comparable lengths of the same house.
 *
 * ⚠️ **IT IS STILL A STUB CLOCK AND IT IS STILL THE WRONG MECHANISM.** The run should end when
 * the runner reaches the terminal or the hunter reaches the runner, not when a timer fires. This
 * number buys the show enough air to be watched; it does not make the beat mean anything. The
 * host's "Recap" button remains the override, and `local.mjs`'s `handleClient` still lets any
 * `{ t:'show' }` cut it short.
 */
export const STUB_SHOW_PLAN = [
  { beat: 'expedition', ms: 0 },
  { beat: 'recap', ms: 26000 },
];

export function isShowBeat(beat) {
  return SHOW_BEATS.includes(String(beat || ''));
}

export function recapAfterMs(plan = STUB_SHOW_PLAN) {
  const step = (plan || []).find((s) => s.beat === 'recap');
  return Number.isFinite(step?.ms) ? step.ms : 26000;
}
