/**
 * 🩸 **TAKEN — the terminal state the survival mode deliberately does not have.**
 *
 * Showstopper **S2** (`docs/design/rrr-build-brief.md` §1). The whole party loop rests on a
 * runner being taken by the Hunter and removed from the game — `party-loop.md`: *"If the hunter
 * takes the runner: they are out for the rest of the game."*
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 IT IS NOT MERELY ABSENT. IT IS STRUCTURALLY UNREACHABLE, AND THAT IS WORSE.
 * ---------------------------------------------------------------------------------------------
 * `hunter-ai.js` `_attack` (L1108-1134) finds the first occupied socket and detaches it:
 *
 *     const socket = [...].find((s) => c.rig.occupant(s) !== 'empty');
 *     if (!socket) return;                     // <- L1127
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
 * `this.onKill?.(c, socket, item)` at L1132. **`src/views/expedition.js:432` is what subscribes** —
 * `hunter.onKill = () => finish('taken', simT)` — and the survival mode does not subscribe, so it
 * keeps its limb economy byte-for-byte. One engine, two rulesets, no branch inside the AI.
 * `engine-take` K5 drives the real `HunterAI` in the real house and asserts the take lands when
 * the arm does; K5's wiring half reads the subscription off `expedition.js`'s source.
 *
 * 🚨 **THIS PARAGRAPH SAID "THE PARTY ROOM SUBSCRIBES THERE" FROM THE DAY IT WAS WRITTEN
 * UNTIL `9147803`, THIS SESSION, AND NOTHING SUBSCRIBED TO `onKill` AT ALL FOR THAT WHOLE TIME.**
 * It is left on the record because the sentence is the bug. `grep -rn onKill src/views/ src/party/`
 * returned this comment and nothing else; the mode's only death test was `if (contact < 1.35)
 * finish('taken')`, which the Hunter cannot satisfy — it stops at arm's length and swings, so
 * measured minimum contact was 2.11-2.15 m and a runner who stood still while all four limbs came
 * off finished the segment `'held'`. A present-tense claim about a NEIGHBOURING module's behaviour
 * reads as a description and is actually a wish, and this one kept a whole class of bug from being
 * looked at for months: every reader who wanted to know what happened on a take found this line,
 * believed it, and stopped.
 *
 * ⚠️ AND "THE PARTY ROOM SUBSCRIBES THERE AND APPLIES THE RULE BELOW" IS WRONG TWICE OVER, SO SAY
 * WHAT THE PATH ACTUALLY IS. `src/party/room.js` never mentions `onKill` — the subscriber is the
 * expedition VIEW, because that is what owns the `HunterAI` instance. And the subscriber does not
 * apply the rule below; it calls `finish('taken', simT)` and nothing else. The rule is reached a
 * hop later, off the outcome that travels the wire:
 *
 *     hunter-ai.js `_attack` L1132 `onKill`
 *       -> views/expedition.js:429  `finish('taken', simT)`
 *       -> the expedition report on the wire
 *       -> session.js:622 / room.js:263  `resolveContact({ mode: PARTY, occupiedSockets: 0 })`
 *       -> session.js:624 / room.js:265  `applyTake(victim)`  <- the rule below
 *
 * Two modules, one wire and one hop stood between the sentence and the truth, and it read as one
 * call. A reader grepping `room.js` for `onKill` finds nothing and cannot tell whether the take is
 * broken or whether they are looking in the wrong file.
 *
 * ⚠️ THE MODE IS AN ARGUMENT, NEVER A GLOBAL. A rule that reads a module-level flag is a rule
 * that behaves differently depending on which view booted last.
 *
 * No THREE, no DOM.
 */

export const MODE = { SURVIVAL: 'survival', PARTY: 'party' };

/** A taken player's seat is face-down. `docs/design/rrr-roles.md` §4, the nameplate table. */
export const PLATE = { UNDECLARED: 'undeclared', DRAFTING: 'drafting', PUBLISHED: 'published', FACE_DOWN: 'face-down' };

/**
 * What contact with the Hunter means.
 *
 * @param {{mode:string, occupiedSockets:number}} ctx
 * @returns {{outcome:'limb'|'taken'|'none', reason:string}}
 *
 * 🚨 IN PARTY MODE THE LIMB COUNT IS NOT CONSULTED. That is the entire fix: the survival rule
 * is a function of what is left to take, and the party rule is a function of nothing at all.
 * Contact ends you. `party-taken` T3 asserts a four-limbs-gone player is still takeable, which
 * is the exact case `hunter-ai.js` L1127 returns early on.
 */
export function resolveContact({ mode, occupiedSockets }) {
  if (mode === MODE.PARTY) return { outcome: 'taken', reason: 'party mode: contact is terminal' };
  if (occupiedSockets > 0) return { outcome: 'limb', reason: 'survival mode: a limb, not the episode' };
  return { outcome: 'none', reason: 'survival mode: nothing left to take (hunter-ai.js L1127)' };
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
 * 🚨 **AN EXECUTION IS NOT A TAKE, AND THE ROW HAS TO SAY SO OR THE TELEVISION CANNOT.**
 *
 * Both callers used to reach for `applyTake` and filter the `player.taken` EVENT back out of the
 * log — which is correct about the log and wrong about the row, because `Object.assign(victim,
 * player)` copies `taken: true` straight onto the public frame. So an executed player read
 * `{alive: false, taken: true}`, `show-tv.html` rendered `✖ taken` (now L255) and `captions.js`
 * put a `✕` on the nameplate (now L192), and the `⚒ evicted` branch beside them was unreachable and had
 * never once rendered. Combined with the room lottery that could not put the Hunter in the wing,
 * that made 100% of deaths executions and 100% of them labelled as Hunter kills — the two visible
 * causes round §4 calls *"both witnessed live on TV"* collapsed into one.
 *
 * ⚠️ IT IS A SEPARATE FUNCTION RATHER THAN A FLAG ON `applyTake`, because the two verbs differ in
 * what they announce as well as in what they set: a take is a PUBLIC `player.taken`, an eviction
 * is a PUBLIC `player.executed` that only the caller can build (it carries the executioner). What
 * they share is the sealed half, and that is what is here.
 *
 * ⚠️ `taken` IS SET FALSE RATHER THAN LEFT ALONE. It is `false` on every row from frame one — see
 * `session.js`'s note on I7 — so writing it here changes nothing about the SHAPE of the frame and
 * everything about whether a future caller can pass in a row that already had it set.
 */
export function applyEviction(player) {
  return {
    player: { ...player, alive: false, taken: false, plate: PLATE.FACE_DOWN },
    // The public half is `player.executed`, and only the caller knows who swung. What is
    // universal about leaving the mansion is that WHY is sealed until the Reunion.
    events: [{ type: 'player.sealed', vis: 'SEALED', data: { id: player.id } }],
  };
}

/**
 * A taken player's afterlife. C1: chat only, no ghost vote in v1, and **no mansion UI at all** —
 * `party-loop.md` puts *"Do not write a ghost UI for taken players"* under its Do-not list, and
 * the bible's D4 keeps the chat because the chat is the show's audience, not a ghost interface.
 */
export function afterlife() {
  return { canChat: true, canVote: false, canDriveRobot: false, seesMansion: false };
}
