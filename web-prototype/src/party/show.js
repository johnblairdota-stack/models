/**
 * Durable room show. The beat lives on the server, not in a host tab.
 *
 * Phones can already be in the run (pad + phase events) while a refreshed TV
 * sits on lobby/casting if `room.show` is only host-tab RAM. Welcome pushes
 * this beat; playEpisode pins expedition; the stub clock then pins recap.
 * "Watch the run" is a host workaround, not the clock.
 */

export const SHOW_BEATS = ['lobby', 'casting', 'expedition', 'recap'];

/** Server-owned. Expedition is immediate so the TV is never waiting on a click. */
export const STUB_SHOW_PLAN = [
  { beat: 'expedition', ms: 0 },
  { beat: 'recap', ms: 4800 },
];

export function isShowBeat(beat) {
  return SHOW_BEATS.includes(String(beat || ''));
}

export function recapAfterMs(plan = STUB_SHOW_PLAN) {
  const step = (plan || []).find((s) => s.beat === 'recap');
  return Number.isFinite(step?.ms) ? step.ms : 4800;
}
