/**
 * 🎭 **THE ROLE SCRIPT — one line each, and every one of them spendable from a chair.**
 *
 * `docs/design/rrr-roles.md`. `cast.js` deals the bag; this file is what the cards DO.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE CHAIR RULE, AND IT IS THE CONSTRAINT THAT REWROTE THE BIBLE'S ORIGINAL SCRIPT.
 * ---------------------------------------------------------------------------------------------
 * Only a PAIR acts per episode (D9). At 8 players over 4 episodes roughly a third never go into
 * the mansion at all, so **an ability that requires being on the Expedition is dead weight for
 * most of the game for most of the table.** Every ability below is therefore spent from a chair,
 * and `role-script` S1 asserts it rather than trusting the wording.
 *
 * ⚠️ ONE EXCEPTION, AND IT IS A LIABILITY RATHER THAN AN ABILITY. The Static's flyover lag fires
 * only when they guide. That is the *cost* of a card, not a power it has to find an opportunity
 * to use, and S2 asserts the distinction so nobody "fixes" it into a chair power.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 THE OUTSIDERS ARE LOAD-BEARING, AND THERE IS EXACTLY ONE PER SURFACE.
 * ---------------------------------------------------------------------------------------------
 * The bible's §2 says the game has three surfaces — the phone, the halls, the room — and each
 * Outsider poisons exactly one: the Glitched poisons private info, the Static poisons the guide
 * channel, the Method Actor poisons the public claim. Without them the Camera Op and the Focus
 * Puller are oracles and the game solves itself. S6 measures that rather than asserting it.
 *
 * No THREE, no DOM.
 */

import { GOOD, EVIL } from './cast.js';

/** How an ability is paid for. `passive` fires on a condition; nothing here needs the halls. */
export const SHAPE = { NONE: 'none', PASSIVE: 'passive', PER_EPISODE: 'perEpisode', ONCE: 'once' };

/** The three surfaces an Outsider can poison. One each; never two on the same one. */
export const SURFACE = { PHONE: 'phone', HALLS: 'halls', ROOM: 'room' };

export const SCRIPT = {
  // ---- CAST, informed
  contestant: {
    name: 'Contestant', alignment: GOOD, shape: SHAPE.NONE, informs: false,
    line: 'You have no special ability. You\'re just here to win.',
  },
  cameraOp: {
    name: 'Camera Op', alignment: GOOD, shape: SHAPE.PER_EPISODE, informs: true, answers: 'enum',
    line: 'Each episode, learn whether the Hunter noticed the runner by sight or by sound.',
  },
  focusPuller: {
    name: 'Focus Puller', alignment: GOOD, shape: SHAPE.PER_EPISODE, informs: true, answers: 'number',
    line: 'Each episode, learn how many seconds the Hunter was visible on the guide\'s flyover.',
  },
  continuity: {
    name: 'Continuity', alignment: GOOD, shape: SHAPE.ONCE, informs: true, answers: 'boolean',
    line: 'Once per game, as a pair is announced, learn whether that pair contains a member of Production.',
  },
  editor: {
    name: 'The Editor', alignment: GOOD, shape: SHAPE.ONCE, informs: false,
    line: 'Once per game, force the show to re-air ten seconds raw and uncut from any camera, at a moment you name.',
  },
  fanFavourite: {
    name: 'Fan Favourite', alignment: GOOD, shape: SHAPE.ONCE, informs: false,
    line: 'Once per game, mark one chat tip guaranteed true.',
  },
  stuntDouble: {
    name: 'Stunt Double', alignment: GOOD, shape: SHAPE.ONCE, informs: false,
    line: 'Once per game, name the runner as they leave: the first thing the Hunter takes off them is a limb, not the episode.',
  },

  // ---- CAST, but a liability
  glitched: {
    name: 'Glitched', alignment: GOOD, shape: SHAPE.PASSIVE, informs: false,
    outsider: true, poisons: SURFACE.PHONE, selfAware: false,
    line: 'You think you\'re another role. Your information is false.',
  },
  theStatic: {
    name: 'The Static', alignment: GOOD, shape: SHAPE.PASSIVE, informs: false,
    outsider: true, poisons: SURFACE.HALLS, selfAware: false, liabilityOnGuide: true,
    line: 'When you guide, your flyover is a second and a half behind.',
  },
  methodActor: {
    name: 'The Method Actor', alignment: GOOD, shape: SHAPE.PASSIVE, informs: false,
    outsider: true, poisons: SURFACE.ROOM, selfAware: true,
    line: 'The show writes a role on your nameplate at the start of every episode. You may change it — after everyone has read it.',
  },

  // ---- PRODUCTION
  producer: {
    name: 'The Producer', alignment: EVIL, shape: SHAPE.PER_EPISODE, informs: false,
    line: 'Once per episode, from your chair, spike the Hunter\'s interest in any room.',
  },
  fixer: {
    name: 'The Fixer', alignment: EVIL, shape: SHAPE.ONCE, informs: false,
    line: 'You know Production. Once per game, rig a room — the next expedition that enters it brings something down.',
  },
  plant: {
    name: 'The Plant', alignment: EVIL, shape: SHAPE.PASSIVE, informs: false, registersGood: true,
    line: 'You know Production. You register as good to every Cast information role.',
  },
};

export const STATIC_LAG_SECONDS = 1.5;

/**
 * 🚨 EVERY INFORMATION ANSWER PASSES THROUGH TWO FILTERS, AND THAT IS WHY AN INFO ROLE IS
 * EVIDENCE RATHER THAN A VERDICT.
 *
 *   1. **The Plant** registers as good, so anything that counts or names Production undercounts.
 *   2. **The Glitched** is handed a false answer, and is not told.
 *
 * Neither filter is visible to the holder, so a Camera Op cannot tell a true reading from a
 * poisoned one — which is exactly the property that stops the room treating a readout as proof.
 *
 * @param {object} q
 * @param {string} q.role            the role asking
 * @param {*}      q.truth           the honest answer
 * @param {boolean} q.holderGlitched is the holder the Glitched?
 * @returns {{value:*, poisoned:boolean}}
 */
export function resolveInformation({ role, truth, holderGlitched }) {
  const spec = SCRIPT[role];
  if (!spec || !spec.informs) return { value: truth, poisoned: false };
  if (!holderGlitched) return { value: truth, poisoned: false };
  return { value: falsify(spec.answers, truth), poisoned: true };
}

/** A false answer that is still a PLAUSIBLE one — a nonsense value would announce the poison. */
export function falsify(kind, truth) {
  if (kind === 'boolean') return !truth;
  if (kind === 'enum') return truth === 'sight' ? 'sound' : 'sight';
  if (kind === 'number') return truth === 0 ? 1 : Math.max(0, truth + (truth % 2 === 0 ? 1 : -1));
  return truth;
}

/**
 * What Continuity is told about a pair. The Plant is the reason this can be honestly wrong.
 *
 * @param {string[]} pair            the two player ids
 * @param {Record<string,string>} alignmentOf
 * @param {string[]} plantIds        Production members who register as good
 */
export function pairContainsProduction(pair, alignmentOf, plantIds = []) {
  return pair.some((id) => alignmentOf[id] === EVIL && !plantIds.includes(id));
}

/** Is this ability spendable without being on the Expedition? The Chair Rule. */
export const spendableFromChair = (roleId) => {
  const s = SCRIPT[roleId];
  if (!s) return false;
  return s.shape === SHAPE.NONE || !s.liabilityOnGuide;
};

export const outsiders = () => Object.keys(SCRIPT).filter((k) => SCRIPT[k].outsider);
export const informers = () => Object.keys(SCRIPT).filter((k) => SCRIPT[k].informs);
