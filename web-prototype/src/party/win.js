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

/** The only place same-tick precedence is written down. */
export const TICK_ORDER = ['W1', 'W3', 'W2', 'W4', 'W5'];

/**
 * Fold the log into a verdict.
 *
 * @param {Array<{seq:number,type:string,data:object}>} log
 * @param {{count:number, alignmentOf:(id:string)=>string}} ctx
 * @returns {{outcome:string, rule:string|null, atSeq:number|null, camerasLit:number, fed:number, livingGood:number, livingEvil:number, episode:number}}
 */
export function foldWin(log, { count, alignmentOf }) {
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

  for (const e of log) {
    if (hit) break;
    if (e.type === 'phase.CASTING') episode = e.data?.episode ?? episode;
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
    if (e.type === 'phase.VERDICT' && episode >= EPISODE_CAP && camerasLit < targets.cameraTarget) {
      fire('W5', OUTCOME.CANCELLED, e.seq); break;
    }
  }

  return {
    outcome: hit ? hit.outcome : OUTCOME.RENEWED,
    rule: hit ? hit.rule : null,
    atSeq: hit ? hit.atSeq : null,
    camerasLit, fed, episode,
    livingGood: alive('good'), livingEvil: alive('evil'),
  };
}
