/**
 * 🩸 **TAKEN — the terminal state the survival mode deliberately does not have.**
 *
 * Showstopper **S2** (`docs/design/rrr-build-brief.md` §1). The whole party loop rests on a
 * runner being taken by the Hunter and removed from the game — `party-loop.md` (locked
 * 2026-09-08): *"If the hunter assimilates the runner: they are consumed into the hunter
 * (embedded face), out for the rest of the night."*
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 IT IS NOT MERELY ABSENT. IT IS STRUCTURALLY UNREACHABLE, AND THAT IS WORSE.
 * ---------------------------------------------------------------------------------------------
 * `hunter-ai.js` `_attack` (L1100-1117) finds the first occupied socket and detaches it:
 *
 *     const socket = [...].find((s) => c.rig.occupant(s) !== 'empty');
 *     if (!socket) return;                     // <- L1109
 *
 * So a player with four limbs gone is **invulnerable**: there is no socket to take, the method
 * early-outs, and the Hunter stands there forever. That is correct for the survival mode and
 * `limbs-1` says so in as many words — *"never the second part, so `down` is unreachable"* — the
 * limb economy is a setback economy, on purpose, and a collapse costing a limb is avoidable.
 *
 * The party mode needs an ENDING, and an ending is a different verb from a setback.
 *
 * ---------------------------------------------------------------------------------------------
 * ⚠️ THIS FILE CHANGES NOTHING IN `hunter-ai.js`, AND THAT IS DELIBERATE.
 * ---------------------------------------------------------------------------------------------
 * That file is tuned, gated and owned. It already exposes the seam this needs: `_attack` calls
 * `this.onKill?.(c, socket, item)` at L1116. The party room subscribes there and applies the
 * rule below; the survival mode does not subscribe and keeps its limb economy byte-for-byte.
 * One engine, two rulesets, no branch inside the AI.
 *
 * ⚠️ THE MODE IS AN ARGUMENT, NEVER A GLOBAL. A rule that reads a module-level flag is a rule
 * that behaves differently depending on which view booted last.
 *
 * No THREE, no DOM.
 */

export const MODE = { SURVIVAL: 'survival', PARTY: 'party' };

/** A taken player's seat is face-down. `docs/design/rrr-roles.md` §claims. */
export const PLATE = { UNDECLARED: 'undeclared', DRAFTING: 'drafting', PUBLISHED: 'published', FACE_DOWN: 'face-down' };

/**
 * What contact with the Hunter means.
 *
 * @param {{mode:string, occupiedSockets:number}} ctx
 * @returns {{outcome:'limb'|'taken'|'assimilated'|'none', reason:string}}
 *
 * 🚨 IN PARTY MODE THE LIMB COUNT IS NOT CONSULTED. That is the entire fix: the survival rule
 * is a function of what is left to take, and the party rule is a function of nothing at all.
 * Contact is hunter assimilation — a fear removal, not a season-ending find-evil lynch.
 * `party-taken` T3 asserts a four-limbs-gone player is still takeable, which is the exact
 * case `hunter-ai.js` L1109 returns early on.
 */
export function resolveContact({ mode, occupiedSockets }) {
  if (mode === MODE.PARTY) return { outcome: 'assimilated', reason: 'party mode: hunter assimilation is terminal' };
  if (occupiedSockets > 0) return { outcome: 'limb', reason: 'survival mode: a limb, not the episode' };
  return { outcome: 'none', reason: 'survival mode: nothing left to take (hunter-ai.js L1109)' };
}

/**
 * Apply a take to party state. Pure: returns the new player row and the events to append.
 *
 * 🚨 THE ALIGNMENT IS NOT IN THE RETURN, AT ANY VISIBILITY. Bible **P6**: deaths never reveal
 * alignment, and the strongest way to keep a promise like that is to never put the value in the
 * function that would have to withhold it. `party-isolation` I7 asserts no socket's frames
 * carry it after a take; this makes I7 hard to fail by construction.
 */
export function applyTake(player) {
  return {
    player: { ...player, alive: false, taken: true, plate: PLATE.FACE_DOWN },
    events: [
      // Who was taken is PUBLIC — the show cuts to it, and party-loop.md says they are out.
      { type: 'player.taken', vis: 'PUBLIC', data: { id: player.id, seat: player.seat } },
      // WHY, and what they were, is sealed until the Reunion.
      { type: 'player.sealed', vis: 'SEALED', data: { id: player.id } },
    ],
  };
}

/**
 * Hunter assimilation — the fear removal beat (`task-assimilation-removal.md`).
 *
 * Consumed into the hunter (embedded face). Permanent that night. Out of phone play;
 * speaks IRL only. Chrome must not flash Production / plant / evil. Does not end the
 * escape. Vote HITs stay on `applyTake` + wreckPose — do not use this for an execute.
 */
export function applyAssimilate(player) {
  return {
    player: { ...player, alive: false, taken: true, assimilated: true, plate: PLATE.FACE_DOWN },
    events: [
      { type: 'player.taken', vis: 'PUBLIC', data: { id: player.id, seat: player.seat, kind: 'assimilated' } },
      { type: 'player.sealed', vis: 'SEALED', data: { id: player.id } },
    ],
  };
}

/**
 * Public removal word. Allegiance stays off — ASSIMILATED is a visible cause, not a side.
 * Execute HITs stay "executed"; hunter fear is "assimilated".
 */
export function removalWord(death) {
  if (!death) return 'survived';
  if (death.by === 'EXECUTED') return 'executed';
  if (death.by === 'ASSIMILATED' || death.kind === 'assimilated') return 'assimilated';
  return 'taken';
}

/**
 * A taken player's afterlife. C1: chat only, no ghost vote in v1, and **no mansion UI at all** —
 * `party-loop.md` puts *"Do not write a ghost UI for taken players"* under its Do-not list, and
 * the bible's D4 keeps the chat because the chat is the show's audience, not a ghost interface.
 */
export function afterlife() {
  return { canChat: true, canVote: false, canDriveRobot: false, seesMansion: false };
}
