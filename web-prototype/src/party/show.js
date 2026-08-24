/**
 * Durable room show. The beat lives on the server, not in a host tab.
 *
 * Phones can already be in the run (pad + phase events) while a refreshed TV
 * sits on lobby/casting if `room.show` is only host-tab RAM. Welcome pushes
 * this beat; playEpisode pins expedition; the stub clock then pins recap.
 * "Watch the run" is a host workaround, not the clock.
 *
 * After a finished run the clock keeps walking: recap (20 s) → debrief (75 s)
 * → reckoning → vote → execution → casting. Those holds are `phases.js`
 * `SECONDS`, not a second table. The Recap *button* is gone; the beat is not.
 */

import { PHASE, SECONDS, reckoningSeconds } from './phases.js';

export const SHOW_BEATS = [
  'lobby', 'casting', 'expedition', 'recap', 'debrief',
  'reckoning', 'vote', 'execution',
];

/** Recap card, then seated talk, then the designed lynching. Same numbers as `phases.js`. */
export const RECAP_HOLD_MS = SECONDS[PHASE.RECAP] * 1000;
export const DEBRIEF_HOLD_MS = SECONDS[PHASE.DEBRIEF] * 1000;
export const RECKONING_HOLD_MS = SECONDS[PHASE.RECKONING] * 1000;
export const VOTE_HOLD_MS = SECONDS[PHASE.VOTE] * 1000;
export const EXECUTION_HOLD_MS = SECONDS[PHASE.EXECUTION] * 1000;

/** Debrief and the lynching beats — ballroom is the picture, chase is off. Recap is not this. */
export const TALK_BEATS = ['debrief', 'reckoning', 'vote', 'execution'];
export const isTalkBeat = (beat) => TALK_BEATS.includes(String(beat || ''));

/**
 * Server-owned. Expedition is immediate so the TV is never waiting on a click.
 *
 * 🎬 **THE RUN NOW ENDS WHEN THE MISSION ENDS, AND THE CLOCK IS A BACKSTOP RATHER THAN THE BEAT.**
 *
 * John, playtesting `7838abb`: *"it randomly goes to the recap screen. I didn't go anywhere or do
 * much. I just hit a box."* He had not done anything — the number below was **26 000**, and 26 s
 * after the pair locked this clock yanked the whole room onto the recap card whatever the runner
 * was in the middle of. On a television that bakes the mansion for twenty-odd seconds, a good
 * fraction of every episode was spent watching a slate and then a card.
 *
 * The header this replaces already said the mechanism was wrong: *"the run should end when the
 * runner reaches the terminal or the hunter reaches the runner, not when a timer fires."* It is
 * now wired that way. `net/party/local.mjs`'s world handler flips the beat when the TV reports
 * `mission.phase === 'done'` — the armed smash target broken AND the runner home in the ballroom,
 * which is the only end condition the night currently has.
 *
 * ⚠️ **THE TIMER SURVIVES AND IS DELIBERATELY LONG.** A room whose runner wedges in a corner, or
 * whose TV tab dies mid-report, must not sit on the expedition beat forever with no way back to a
 * ballot — and PR #12 removed the Recap button, so nobody in the room can hand-crank it either.
 * Eight minutes is far past any expedition anyone has played and far short of an evening.
 *
 * ⚠️ It is a FLOOR ON THE SURPRISE, not a target length. If the number ever wants to come down,
 * the thing to add first is a visible clock on the television; a beat that ends without warning
 * is the defect John reported, and a shorter silent timer is that defect again.
 */
export const RECAP_BACKSTOP_MS = 480000;

/**
 * Product order after a finished run. The recap step's `ms` is the expedition BACKSTOP
 * (how long the room may sit on expedition before TIME). debrief/casting `ms` are the
 * holds after the previous beat, not offsets from Send-them-in.
 */
export const STUB_SHOW_PLAN = [
  { beat: 'expedition', ms: 0 },
  { beat: 'recap', ms: RECAP_BACKSTOP_MS },
  { beat: 'debrief', ms: RECAP_HOLD_MS },
  { beat: 'reckoning', ms: DEBRIEF_HOLD_MS },
  { beat: 'vote', ms: RECKONING_HOLD_MS },
  { beat: 'execution', ms: VOTE_HOLD_MS },
  { beat: 'casting', ms: EXECUTION_HOLD_MS },
];

/**
 * Recap → Debrief → Reckoning → Vote → Execution → Casting.
 * The live SHOW clock runs this on every episode, including the premiere.
 * `playEpisode` still skips Reckoning+ on episode 1.
 */
export const AFTER_RUN_BEATS = ['recap', 'debrief', 'reckoning', 'vote', 'execution', 'casting'];

const AFTER_RUN_NEXT = {
  recap: 'debrief',
  debrief: 'reckoning',
  reckoning: 'vote',
  vote: 'execution',
  execution: 'casting',
};

export function isShowBeat(beat) {
  return SHOW_BEATS.includes(String(beat || ''));
}

export function recapAfterMs(plan = STUB_SHOW_PLAN) {
  const step = (plan || []).find((s) => s.beat === 'recap');
  return Number.isFinite(step?.ms) ? step.ms : RECAP_BACKSTOP_MS;
}

export function holdMsFor(beat, noms = 0) {
  if (beat === 'recap') return RECAP_HOLD_MS;
  if (beat === 'debrief') return DEBRIEF_HOLD_MS;
  if (beat === 'reckoning') return reckoningSeconds(noms) * 1000;
  if (beat === 'vote') return VOTE_HOLD_MS;
  if (beat === 'execution') return EXECUTION_HOLD_MS;
  return null;
}

/** What the clock walks to next after a finished run. Expedition is not in this chain. */
export function nextShowBeat(beat) {
  return AFTER_RUN_NEXT[beat] ?? null;
}

/** Server-authoritative remaining time. Clients tick from `until` (epoch ms). */
export function remainingMs(until, now = Date.now()) {
  const n = Number(until);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, n - now);
}

/** `1:05` or `12s` — the TV chrome and the phone pad share this. */
export function formatRemain(ms) {
  if (!Number.isFinite(ms)) return '';
  const s = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${s}s`;
}

/**
 * The mission phases that END the expedition beat, as a set the server can test a report against.
 *
 * Exactly one entry, and the narrowness is the point: `return` means the smash is down and the
 * runner still has to walk home, which is the most tense half of the run and precisely the moment
 * a beat change would be worst. `src/party/follow.js` `MISSION_PHASES` is the full list.
 */
export const RUN_ENDING_MISSION_PHASES = ['done'];

export function missionEndsRun(phase) {
  return RUN_ENDING_MISSION_PHASES.includes(String(phase || ''));
}

/**
 * The recap outcome word — a fact about how the LIVE RUN ended, separate from `SHOW_BEATS`.
 *
 * CAUGHT is reserved and not yet set anywhere: nothing in this codebase ends a live run when the
 * hunter catches the runner (`src/game/follow-bed.js` still calls `HunterAI` — the body, the
 * chase, the take — "the next slice"). Wiring CAUGHT in before that exists would be a chrome word
 * with no path to it, which is the same kind of lie this slice exists to remove.
 */
export const RUN_END = { SMASHED: 'SMASHED', CAUGHT: 'CAUGHT', TIME: 'TIME' };
