/**
 * Durable room show. The beat lives on the server, not in a host tab.
 *
 * Phones can already be in the run (pad + phase events) while a refreshed TV
 * sits on lobby/casting if `room.show` is only host-tab RAM. Welcome pushes
 * this beat; playEpisode pins expedition; the stub clock then pins recap.
 * "Watch the run" is a host workaround, not the clock.
 *
 * After a finished run the clock keeps walking: recap (10 s) → debrief (75 s)
 * → reckoning → vote → execution → casting. Those holds are `phases.js`
 * `SECONDS`, not a second table. The Recap *button* is gone; the beat is not.
 */

import { PHASE, SECONDS, reckoningSeconds, EPISODE_ORDER } from './phases.js';

export const SHOW_BEATS = [
  'lobby', 'casting', 'expedition', 'recap', 'debrief',
  'reckoning', 'vote', 'execution', 'verdict',
  /*
   * 🎬 Session-end, not an episode beat. It is in SHOW_BEATS because `setShow` refuses anything
   * that is not — but deliberately NOT in `RUNDOWN_BEATS`, which is derived from `EPISODE_ORDER`
   * and describes one episode's shape. A rail that advertised the Reunion would be promising it
   * every episode, when it happens once and only if the fold says the season is over.
   */
  'reunion',
];

/**
 * The TV rundown — Lobby plus `phases.js` `EPISODE_ORDER`. Live SHOW beats light up.
 *
 * ✅ Verdict has grown its wire beat, so the rail's last chip is no longer a `stub`: nothing
 * here changed to light it. `rundownRailHtml` reads `SHOW_BEATS.includes(id)`, so adding the
 * beat above is what promoted the chip, which is exactly why the rail was built that way.
 * Reunion is session-end, not an episode beat; it stays off this list and gets its own.
 */
export const RUNDOWN_BEATS = ['lobby', ...EPISODE_ORDER.map((p) => String(p).toLowerCase())];

/** Ribbon when the chase picture is up; expanded on lobby and the talk beats. */
export function rundownRibbon(beat) {
  return String(beat || '') === 'expedition';
}

/**
 * How full the current rail segment still is. `null` when there is no `until` — the bar
 * stays lit, and the mast prints no fake 0s clock. 100 = just opened; 0 = drained.
 */
export function railDrainPct(until, holdMs, now = Date.now()) {
  const left = remainingMs(until, now);
  if (left == null || !Number.isFinite(holdMs) || holdMs <= 0) return null;
  return Math.max(0, Math.min(100, (left / holdMs) * 100));
}

/** Recap card, then seated talk, then the designed lynching. Same numbers as `phases.js`. */
export const RECAP_HOLD_MS = SECONDS[PHASE.RECAP] * 1000;
export const DEBRIEF_HOLD_MS = SECONDS[PHASE.DEBRIEF] * 1000;
export const RECKONING_HOLD_MS = SECONDS[PHASE.RECKONING] * 1000;
export const VOTE_HOLD_MS = SECONDS[PHASE.VOTE] * 1000;
export const EXECUTION_HOLD_MS = SECONDS[PHASE.EXECUTION] * 1000;
/**
 * ⚠️ **THE BEAT DOES NOT WORK WITHOUT THIS CONSTANT, AND IT FAILS LOOKING FINE.**
 *
 * `holdMsFor` returns `null` for a beat it does not know. A verdict with no hold gets a
 * non-finite wait, so `scheduleShowProgress` returns before arming its timer and the show stops
 * there forever; `railDrainPct` also returns `null` on a non-finite `holdMs`, which renders a
 * segment that is permanently full. The night would show a lit Verdict chip with a full bar and
 * simply never advance — a stall that reads as a design choice.
 */
export const VERDICT_HOLD_MS = SECONDS[PHASE.VERDICT] * 1000;

/**
 * Last slice of Debrief — phones wake and may name someone before Reckoning proper.
 * John, after #32: a 75s "phones down" then a 45s window they never saw.
 */
export const LATE_DEBRIEF_MS = 20000;

/* =============================================================================================
 * ✋ READY — the table ends a talk beat when a MAJORITY says it is done.
 *
 * Debrief is now a five-minute CAP, not a five-minute wait. John wanted Blood on the Clocktower's
 * long day; five minutes of dead air when everyone has finished talking is the version of that
 * nobody wants. So the clock is the ceiling and the room is the clock.
 *
 * 🚨 **MAJORITY, NOT UNANIMITY. John's call.** Unanimity hands one quiet or distracted player a
 * veto over everybody's evening, and at eight players that is a near certainty rather than an
 * edge case.
 *
 * ⚠️ **THIS IS NOT THE CASTING RULE AND MUST NOT BE MERGED WITH IT.** The locked casting rule is
 * *"the 3·2·1 arms on ALL living ballots in, or a ~20s backstop — never on the first ballot"*
 * (`CAST_BACKSTOP_MS`, gate `cast-ballot` B12b-e). That one is unanimity-or-timeout because an
 * early cast lock silently robs a big table of its vote. Ending a conversation early costs a
 * table nothing it cannot get back by not tapping. Same shape, different answer, on purpose.
 *
 * Majority cannot fire on a first tap at any table of two or more, which is what the casting rule
 * was protecting — at 2 living it needs 2, at 8 it needs 5. No separate first-tap guard is
 * required, and `readyNeeded` is asserted against that in `party-night`.
 *
 * A majority that then breaks — someone un-taps because they thought of something — cancels the
 * countdown. Ready is a toggle, not a commitment.
 * ============================================================================================= */

/** The talk beats a table may end early. Not casting, not the expedition, not the vote. */
export const READY_BEATS = ['debrief', 'reckoning'];

export function isReadyBeat(beat) {
  return READY_BEATS.includes(String(beat || ''));
}

/** Strict majority of the LIVING seated players. 2->2, 3->2, 5->3, 8->5. */
export function readyNeeded(living) {
  const n = Math.max(0, Math.floor(living) || 0);
  if (n <= 1) return n;
  return Math.floor(n / 2) + 1;
}

export function readyMet(readyCount, living) {
  const need = readyNeeded(living);
  return need > 0 && readyCount >= need;
}

/**
 * The pause between "the room agreed" and the beat actually ending. Short, but not zero: cutting
 * a talk beat the instant the fifth thumb lands chops whoever is mid-sentence, and the TV has an
 * established 3·2·1 language for exactly this moment.
 */
export const READY_COUNTDOWN_MS = 3000;

/**
 * Empty Reckoning may re-arm this many times. Then the clock walks (nobody nominated)
 * so a broken table cannot softlock forever.
 */
export const EMPTY_RECKONING_EXTEND_CAP = 3;

/**
 * 🪑 **THE BEATS THE ROOM SPENDS IN ITS CHAIRS — ballroom is the picture, chase is off.**
 * Recap is deliberately not one: it is the expedition's own board, and it keeps `recapFacts`.
 *
 * ⚠️ **THE NAME IS OLDER THAN THE LIST AND IT IS THE LIST THAT IS RIGHT.** This says nothing
 * about whether the room may nominate, vote or tap READY — every one of those is gated by its own
 * predicate (`isReadyBeat`, `applyNominate`, the ballot). `verdict` and `reunion` joined on
 * 2026-08-28 because all three call sites are asking the same question and the answer is the same
 * for both: is the seated circle the picture on the television (`onStage` in `party-host.js`), do
 * the merged pair names still belong on the plates (`cuePairs`), and does the phone draw a
 * seated sheet rather than a pad (`party-phone.js`). Nobody presses anything on either beat.
 */
export const TALK_BEATS = ['debrief', 'reckoning', 'vote', 'execution', 'verdict', 'reunion'];
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
 * ⏱️ **CASTING'S SAFETY NET — leaving casting must not require a live TV tab.**
 *
 * Every other beat has a server clock. Casting did not: `setShow` clears `showUntil` for it, and
 * the only thing that ever ended the beat was the TV deciding its 3·2·1 had run and sending
 * `t:'episode'`. Close the TV tab mid-casting — or hit the `!votes.length` early return with a
 * ballot the server rejects — and eight phones wait on a room that will never move again.
 *
 * ⚠️ **THIS IS A NET, NOT THE CLOCK.** The TV still arms at `CAST_BACKSTOP_MS` (20s, `ballot.js`)
 * and should always win; this fires a full casting beat later so it cannot race the television.
 * `episode-order`-style divergence is avoided by both paths running the SAME resolver in
 * `local.mjs` — the net does not get its own copy of "how casting resolves".
 *
 * 🚨 **AN EMPTY TABLE IS NOT A HUNG ROOM AND THE NET MUST NOT "RESCUE" IT.** With zero valid
 * ballots this re-arms and waits, because inventing a pair from an empty ballot box is the N=8
 * bug John found on the overnight loop (`party-night` N7f2). Waiting on people is correct
 * behaviour; only waiting on a dead television is the defect.
 */
export const CASTING_BACKSTOP_MS = SECONDS[PHASE.CASTING] * 1000;

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
 *
 * Runs on every episode, premiere included — and since 2026-08-25 `playEpisode` does too.
 * This chain was the shipped behaviour all along; `phases.js` `orderFor` was the half that
 * disagreed, and it was changed to match this one rather than the other way round.
 */
export const AFTER_RUN_BEATS = ['recap', 'debrief', 'reckoning', 'vote', 'execution', 'verdict', 'casting'];

const AFTER_RUN_NEXT = {
  recap: 'debrief',
  debrief: 'reckoning',
  reckoning: 'vote',
  vote: 'execution',
  execution: 'verdict',
  /*
   * Verdict walks to Casting, which is what `episode-order`'s E2 walk already expects (it stops
   * on `casting`). It is only the DEFAULT: `progressShow` overrides it when the fold says the
   * season is over, and that override is the first conditional edge in the whole wire.
   */
  verdict: 'casting',
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
  if (beat === 'verdict') return VERDICT_HOLD_MS;
  return null;
}

/** What the clock walks to next after a finished run. Expedition is not in this chain. */
export function nextShowBeat(beat) {
  return AFTER_RUN_NEXT[beat] ?? null;
}

/** Server-authoritative remaining time. Clients tick from `until` (epoch ms). */
export function remainingMs(until, now = Date.now()) {
  if (until == null || until === '') return null;
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
