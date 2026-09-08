/**
 * 🏁 **THE WIN MACHINE — a reducer folded over the log, so precedence is decided by timestamps.**
 *
 * `docs/design/party-loop.md` Win / fold (locked 2026-09-08),
 * `docs/design/party-loop-win-fold-2026-09-08.md` (same lock, fragment),
 * and `docs/slices/task-win-escape-night.md`.
 * Guide/runner hall energy holds (`task-hold-guide-runner-borrow-later.md`).
 *
 * 🚨 **W1–W4 ARE DEAD PRODUCT.** Clearing saboteurs, lighting cameras, feeding the Hunter, and
 * living-evil ≥ living-good do not end the night. The night ends on **escape**:
 *
 *   · at least one good robot escapes → FINALE (the cast gets out)
 *   · the night closes with no good escape → CANCELLED (saboteurs hold the house)
 *
 * 🚨 **RESOLUTION ORDER IS LOG ORDER.** An escape at seq 512 beats a block at seq 513 because
 * it happened first. For events appended in the SAME tick the reducer order is ESCAPE then
 * BLOCK, which is the one place a table is unavoidable and so is stated in exactly one place:
 * `TICK_ORDER` below. Do not leave W1–W4 as aliases that still fire.
 *
 * Host skip / abandoned stays a non-side outcome. Do not restore W5 or end-on-camera-miss.
 * Cameras may still air as spectacle; they are not the score. `WIN_TARGETS` is the Reunion
 * ledger row, not a win rule.
 *
 * No THREE, no DOM.
 */

/** Spectacle / Reunion ledger only. Not a win rule. Do not fire FINALE or CANCELLED off these. */
export const WIN_TARGETS = {
  4: { cameraTarget: 3, feedTarget: 2 },
  5: { cameraTarget: 3, feedTarget: 2 },
  6: { cameraTarget: 4, feedTarget: 3 },
  7: { cameraTarget: 4, feedTarget: 3 },
  8: { cameraTarget: 4, feedTarget: 3 },
};

export const OUTCOME = {
  FINALE: 'SEASON FINALE',   // ≥1 good escaped
  CANCELLED: 'CANCELLED',    // saboteurs hold — no good escaped
  RENEWED: 'RENEWED',        // another expedition
  ABANDONED: 'ABANDONED',    // host skipped to the Reunion; no side wins
};

/**
 * 🗣️ **THE FOUR OUTCOMES IN WORDS — one copy, because the TV and the phone say the same thing.**
 *
 * Escape-night chrome (John 2026-09-08): the cast gets out / saboteurs hold the house.
 * Not "Production wins" from cameras or count. Not "The cast wins" from W1–W4.
 */
export function outcomeLine(status) {
  if (status === OUTCOME.RENEWED) return 'The season continues. Casting is next.';
  if (status === OUTCOME.CANCELLED) return 'Saboteurs hold the house. The Reunion is next.';
  if (status === OUTCOME.FINALE) return 'The cast gets out. The Reunion is next.';
  if (status === OUTCOME.ABANDONED) return 'The night was called. Nobody wins.';
  return 'The Showrunner is deciding.';
}

/** The only place same-tick precedence is written down. Escape beats block. */
export const TICK_ORDER = ['ESCAPE', 'BLOCK'];

/**
 * Fold the log into a verdict.
 *
 * @param {Array<{seq:number,type:string,data:object}>} log
 * @param {{count:number, alignmentOf:(id:string)=>string, aired?:number}} ctx
 * @returns {{outcome:string, rule:string|null, atSeq:number|null, camerasLit:number, fed:number, livingGood:number, livingEvil:number, episode:number, escapedGood:number}}
 */
export function foldWin(log, { count, alignmentOf, aired } = {}) {
  const targets = WIN_TARGETS[count];
  if (!targets) throw new Error(`no win targets for ${count} players`);

  const dead = new Set();
  const escapedGood = new Set();
  let camerasLit = 0, fed = 0, episode = 1;
  const ctxPlayers = [];
  for (const e of log) if (e.type === 'cast.deal') for (const s of e.data.seats) ctxPlayers.push(s.id);
  const alive = (align) => {
    let n = 0;
    for (const id of ctxPlayers) if (!dead.has(id) && alignmentOf(id) === align) n++;
    return n;
  };

  let hit = null;
  const fire = (rule, outcome, seq) => { if (!hit) hit = { rule, outcome, atSeq: seq }; };

  const events = log || [];
  let i = 0;
  while (i < events.length && !hit) {
    const seq = events[i].seq;
    const batch = [];
    while (i < events.length && events[i].seq === seq) batch.push(events[i++]);

    for (const e of batch) {
      if (e.type === 'phase.CASTING' || e.type === 'cast.ballot' || e.type === 'phase.VERDICT') {
        if (e.data?.episode != null) episode = e.data.episode;
      }
      if (e.type === 'run.camera_lit') camerasLit++;
      if (e.type === 'player.taken' || e.type === 'player.executed') dead.add(e.data.id);
      if (e.type === 'player.taken' && alignmentOf(e.data.id) === 'good') fed++;
      if (e.type === 'player.escaped' && alignmentOf(e.data.id) === 'good') escapedGood.add(e.data.id);
    }

    if (batch.some((e) => e.type === 'host.skip')) { fire('W6', OUTCOME.ABANDONED, seq); break; }

    for (const rule of TICK_ORDER) {
      if (hit) break;
      if (rule === 'ESCAPE' && batch.some((e) => e.type === 'player.escaped' && alignmentOf(e.data.id) === 'good')) {
        fire('ESCAPE', OUTCOME.FINALE, seq);
      }
      if (rule === 'BLOCK' && batch.some((e) => e.type === 'escape.blocked') && escapedGood.size === 0) {
        fire('BLOCK', OUTCOME.CANCELLED, seq);
      }
    }
  }

  return {
    outcome: hit ? hit.outcome : OUTCOME.RENEWED,
    rule: hit ? hit.rule : null,
    atSeq: hit ? hit.atSeq : null,
    camerasLit, fed, episode: Math.max(episode, aired ?? 0),
    livingGood: alive('good'), livingEvil: alive('evil'),
    escapedGood: escapedGood.size,
  };
}
