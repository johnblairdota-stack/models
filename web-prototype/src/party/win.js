/**
 * 🏁 **THE WIN MACHINE — a reducer folded over the log, so precedence is decided by timestamps.**
 *
 * `docs/design/rrr-social-round.md` §6.
 *
 * 🚨 **RESOLUTION ORDER IS LOG ORDER, AND THAT IS THE WHOLE DESIGN.** A camera lit at seq 512
 * beats a take at seq 513 because it happened first, not because a table says cameras outrank
 * takes. The alternative — a precedence table — is a document that drifts from the code and an
 * argument nobody can settle. Folding over an append-only log settles it with a sequence number.
 *
 * For events appended in the SAME tick the reducer order is W1, W3, W2, W4, W5, which is the one
 * place a table is unavoidable and so is stated in exactly one place: `TICK_ORDER` below.
 *
 * ⚠️ W1 AND W3 CANNOT COLLIDE. Only the runner is exposed, so a single take is either a good
 * player or an evil one, never both.
 *
 * ⚠️ **H278 STAYS THE DEFAULT: a cap miss is Production, never RENEWED.** CAST7 / John
 * 2026-09-03: the one exception is 2 good vs 1 evil. That count is the last vote, not a W5.
 * Both W5 sites (`phase.VERDICT` and the H278 tail) must skip it, or the live wire
 * Reunion-from-cap's them again. Do not restore "never RENEWED at the cap" without the skip.
 * Do not invent 3v1. W4 `>=` is unchanged.
 *
 * No THREE, no DOM.
 */

import { EPISODE_CAP } from './phases.js';

/** §6. `cameraTarget` is the objective; `feedTarget` is how many goods evil must feed the Hunter. */
export const WIN_TARGETS = {
  4: { cameraTarget: 3, feedTarget: 2 },
  5: { cameraTarget: 3, feedTarget: 2 },
  6: { cameraTarget: 4, feedTarget: 3 },
  7: { cameraTarget: 4, feedTarget: 3 },
  8: { cameraTarget: 4, feedTarget: 3 },
};

export const OUTCOME = {
  FINALE: 'SEASON FINALE',   // good
  CANCELLED: 'CANCELLED',    // evil
  RENEWED: 'RENEWED',        // play on
  ABANDONED: 'ABANDONED',    // host skipped to the Reunion; no side wins
};

/**
 * 🗣️ **THE FOUR OUTCOMES IN WORDS — one copy, because the TV and the phone say the same thing.**
 *
 * The Verdict plate and the phone's Verdict sheet both have to tell the room what the status
 * MEANS, and they were written with a private copy each. Two tables that must agree and can
 * drift is the exact shape `harness/episode-order.mjs` exists to punish one layer up, so this
 * lives beside the machine that produces the statuses. No THREE, no DOM — the phone imports it.
 *
 * RENEWED is the interesting line and the reason the Verdict is a feedback loop at all: it tells
 * the good side evil is still alive, and tells them nothing whatsoever about the person the room
 * has just destroyed.
 */
export function outcomeLine(status) {
  if (status === OUTCOME.RENEWED) return 'The season continues. Casting is next.';
  if (status === OUTCOME.CANCELLED) return 'Production wins. The Reunion is next.';
  if (status === OUTCOME.FINALE) return 'The cast wins. The Reunion is next.';
  if (status === OUTCOME.ABANDONED) return 'The night was called. Nobody wins.';
  return 'The Showrunner is deciding.';
}

/** The only place same-tick precedence is written down. */
export const TICK_ORDER = ['W1', 'W3', 'W2', 'W4', 'W5'];

/**
 * Fold the log into a verdict.
 *
 * @param {Array<{seq:number,type:string,data:object}>} log
 * @param {{count:number, alignmentOf:(id:string)=>string, aired?:number}} ctx
 * @returns {{outcome:string, rule:string|null, atSeq:number|null, camerasLit:number, fed:number, livingGood:number, livingEvil:number, episode:number}}
 */
export function foldWin(log, { count, alignmentOf, aired } = {}) {
  const targets = WIN_TARGETS[count];
  if (!targets) throw new Error(`no win targets for ${count} players`);

  const dead = new Set();
  let camerasLit = 0, fed = 0, episode = 1;
  const alive = (align) => {
    let n = 0;
    for (const id of ctxPlayers) if (!dead.has(id) && alignmentOf(id) === align) n++;
    return n;
  };
  const ctxPlayers = [];
  for (const e of log) if (e.type === 'cast.deal') for (const s of e.data.seats) ctxPlayers.push(s.id);

  let hit = null;
  const fire = (rule, outcome, seq) => { if (!hit) hit = { rule, outcome, atSeq: seq }; };
  const missedTargets = () => camerasLit < targets.cameraTarget || fed < targets.feedTarget;
  /** Last vote, not Production. Only this count. 3g1e is still W5. */
  const lastVote = () => alive('good') === 2 && alive('evil') === 1;

  for (const e of log) {
    if (hit) break;
    /*
     * ⚠️ `setPhase` used to write `phase.CASTING` with `{}`. W5 then saw episode=1
     * all night and foldWin returned RENEWED at the cap. `cast.ballot` has always
     * carried the number; read it. `aired` is what the live Verdict is folding.
     */
    if (e.type === 'phase.CASTING' || e.type === 'cast.ballot' || e.type === 'phase.VERDICT') {
      if (e.data?.episode != null) episode = e.data.episode;
    }
    if (e.type === 'host.skip') { fire('W6', OUTCOME.ABANDONED, e.seq); break; }

    if (e.type === 'run.camera_lit') camerasLit++;
    if (e.type === 'player.taken' || e.type === 'player.executed') dead.add(e.data.id);
    if (e.type === 'player.taken' && alignmentOf(e.data.id) === 'good') fed++;

    // Same-tick order: W1, W3, W2, W4, W5.
    if (e.type === 'player.taken' || e.type === 'player.executed') {
      if (alive('evil') === 0) { fire('W1', OUTCOME.FINALE, e.seq); break; }
      if (fed >= targets.feedTarget) { fire('W3', OUTCOME.CANCELLED, e.seq); break; }
      if (alive('evil') >= alive('good')) { fire('W4', OUTCOME.CANCELLED, e.seq); break; }
    }
    if (e.type === 'run.camera_lit' && camerasLit >= targets.cameraTarget) {
      fire('W2', OUTCOME.FINALE, e.seq); break;
    }
    if (e.type === 'phase.VERDICT' && episode >= EPISODE_CAP && missedTargets() && !lastVote()) {
      fire('W5', OUTCOME.CANCELLED, e.seq); break;
    }
  }

  /*
   * H278 · DUSK6. Chrome printed RENEWED / "The season continues" while the
   * driver wrote CANCELLED: W5 only fired on a CASTING row that carried
   * `episode`, and live `setPhase` did not. At EPISODE_CAP a miss on cameras
   * or feed is Production — never RENEWED. `aired` is the episode on the air.
   *
   * ⚠️ **EXCEPT 2g1e.** CAST7 died on this tail: Ben+Hal vs Dee, cameras 0/4,
   * W5 stole the last vote. Skip the same count here that the VERDICT branch
   * skips. Do not restore a blanket "never RENEWED at the cap".
   */
  if (!hit) {
    const atCap = Math.max(episode, aired ?? 0) >= EPISODE_CAP;
    if (atCap && missedTargets() && !lastVote()) fire('W5', OUTCOME.CANCELLED, null);
  }

  return {
    outcome: hit ? hit.outcome : OUTCOME.RENEWED,
    rule: hit ? hit.rule : null,
    atSeq: hit ? hit.atSeq : null,
    camerasLit, fed, episode: Math.max(episode, aired ?? 0),
    livingGood: alive('good'), livingEvil: alive('evil'),
  };
}
