/**
 * THE CAST — who is good, who is Production, and what nobody may be told.
 *
 * `docs/design/rrr-roles.md` §3 is the table; this file is the table in code, and
 * `harness/role-deal.mjs` is the argument for every number in it.
 *
 * ⚠️ THE COMPOSITION TABLE IS AUTHORITATIVE OVER THE ROLES DOC'S "which cards go in the bag"
 * PROSE, WHICH DISAGREES WITH ITSELF AT 8 PLAYERS. The bag list says "2 more informed" on top
 * of three guaranteed informed roles, which totals five against the table's four and deals a
 * ninth card into an eight-player game. `role-deal` R1 asserts the table, and the table is what
 * matches the locked evil counts (1 at 4-5, 2 at 6-8 — bible D14). Reported, not silently fixed.
 *
 * ---------------------------------------------------------------------------------------------
 * 🚨 castSeed IS NOT worldSeed, AND THAT IS THE WHOLE POINT OF THIS FILE'S EXISTENCE.
 * ---------------------------------------------------------------------------------------------
 * `src/game/run.js` L43-48 establishes the project's doctrine — *"the exit is never transmitted
 * and never negotiated"*, both ends derive it from one integer. That is exactly right for
 * geometry and it is fatal for roles: one published integer plus this file recomputes the cast.
 *
 * So the party mode carries TWO seeds. `worldSeed` stays public and is transmitted exactly as it
 * is today. `castSeed` is a DIFFERENT integer, it lives only where the deal happens, and it is
 * never on any wire in any frame in any phase. `party-isolation` I1 has no matrix row for it,
 * which means any frame that ever carries it fails a gate rather than losing a game.
 *
 * No THREE, no DOM, no engine — like `rules.js`, so bare node and the browser load one copy.
 */

import { camerasNeeded } from './win.js';

/** Alignment is binary. Outsiders are GOOD; that is the point of them. */
export const GOOD = 'good';
export const EVIL = 'evil';

/**
 * The script. `kind` decides which bag a role is drawn from, `alignment` is the truth, and
 * `informs` marks a role whose ability produces information — the ones the Glitched lies to.
 */
export const ROLES = {
  contestant:   { kind: 'contestant', alignment: GOOD, informs: false },

  cameraOp:     { kind: 'informed',   alignment: GOOD, informs: true },
  focusPuller:  { kind: 'informed',   alignment: GOOD, informs: true },
  continuity:   { kind: 'informed',   alignment: GOOD, informs: true },
  editor:       { kind: 'informed',   alignment: GOOD, informs: false },
  fanFavourite: { kind: 'informed',   alignment: GOOD, informs: false },
  stuntDouble:  { kind: 'informed',   alignment: GOOD, informs: false },

  glitched:     { kind: 'outsider',   alignment: GOOD, informs: false },
  theStatic:    { kind: 'outsider',   alignment: GOOD, informs: false },
  methodActor:  { kind: 'outsider',   alignment: GOOD, informs: false },

  fixer:        { kind: 'minion',     alignment: EVIL, informs: false },
  plant:        { kind: 'minion',     alignment: EVIL, informs: false },
  producer:     { kind: 'producer',   alignment: EVIL, informs: false },
};

/**
 * `docs/design/rrr-roles.md` §3, *"Player-count table"*.
 *
 * ⚠️ THIS CITED "§8" TWICE, AND `rrr-roles.md` HAS NO §8 — IT RUNS §1-§6. The number 8 belongs to
 * the BIBLE (`rrr-social-deception-mode.md` §8), whose table `rrr-roles.md` §3 exists to override
 * and which `COMPOSITION` below contradicts on purpose. So the citation named the superseded
 * document's section while pointing at the superseding one, which is the worst of both: a reader
 * who follows it finds no §8, and a reader who guesses finds the table this file deliberately does
 * not implement. `win.js` cites the same table as §3 and is right — two files in one package
 * disagreeing about the number of the table they both read.
 *
 * Every row sums to its count, and `minion + producer` is
 * 1 at 4-5 and 2 at 6-8 — bible D14, settled, and above the genre's 25-30% band at six on
 * purpose.
 *
 * 🚨 THERE IS NO `cameras` COLUMN HERE ANY MORE AND THAT IS THE POINT. It carried 2/2/2/3/3 while
 * `win.js`'s `WIN_TARGETS` decided matches on 3/3/4/4/4 — every count disagreed, and the number
 * this table produced was the one the television printed. The objective belongs to the win
 * machine; `dealCast` asks `camerasNeeded()` for it so there is one copy. See `win.js` for which
 * of the three design tables that number follows, and why.
 */
export const COMPOSITION = {
  4: { informed: 2, contestant: 1, outsider: 0, minion: 0, producer: 1 },
  5: { informed: 3, contestant: 0, outsider: 1, minion: 0, producer: 1 },
  6: { informed: 3, contestant: 0, outsider: 1, minion: 1, producer: 1 },
  7: { informed: 3, contestant: 1, outsider: 1, minion: 1, producer: 1 },
  8: { informed: 4, contestant: 0, outsider: 2, minion: 1, producer: 1 },
};

/** Roles the table guarantees at a count, so a script's spine is stable game to game. */
const GUARANTEED = {
  4: ['cameraOp'],
  5: ['cameraOp', 'glitched'],
  6: ['continuity', 'stuntDouble', 'glitched', 'fixer'],
  7: ['continuity'],
  8: ['continuity', 'cameraOp', 'focusPuller', 'plant'],
};

const byKind = (kind) => Object.keys(ROLES).filter((r) => ROLES[r].kind === kind);

/**
 * mulberry32. Deterministic, no `Math.random`, no `Date` — `run.js`'s determinism discipline,
 * for the same reason: a deal that cannot be reproduced cannot be gated.
 */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates against the injected rng. Pure: same seed, same order, always. */
function shuffle(list, rand) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Draw `n` from `pool`, honouring what the count already guarantees. */
function draw(pool, already, n, rand) {
  const left = pool.filter((r) => !already.includes(r));
  return shuffle(left, rand).slice(0, n);
}

/**
 * Deal a cast.
 *
 * @param {{count:number, castSeed:number, playerIds?:string[]}} opts
 * @returns {{seats:Array<{id:string,seat:number,role:string,alignment:string}>, evil:string[], cameras:number}}
 *
 * The return is GROUND TRUTH and belongs only where the deal happened. Nothing here goes on a
 * wire. `viewFor()` below is the only thing a socket may ever be handed.
 */
export function dealCast({ count, castSeed, playerIds }) {
  const comp = COMPOSITION[count];
  if (!comp) throw new Error(`no composition for ${count} players`);
  const rand = rng(castSeed);
  const g = GUARANTEED[count] || [];

  const pick = (kind, want) => {
    const guaranteed = g.filter((r) => ROLES[r].kind === kind);
    return guaranteed.concat(draw(byKind(kind), guaranteed, want - guaranteed.length, rand));
  };

  const bag = [
    ...pick('informed', comp.informed),
    ...pick('contestant', comp.contestant),
    ...pick('outsider', comp.outsider),
    ...pick('minion', comp.minion),
    ...pick('producer', comp.producer),
  ];
  // `contestant` is one role name filling possibly several seats, unlike every other kind.
  while (bag.length < count) bag.push('contestant');

  const ids = playerIds || Array.from({ length: count }, (_, i) => `p${i + 1}`);
  const order = shuffle(bag, rand);
  const seats = ids.map((id, seat) => ({
    id, seat,
    role: order[seat],
    alignment: ROLES[order[seat]].alignment,
  }));

  /**
   * 🚨 THE GLITCHED THINKS THEY ARE ANOTHER ROLE, AND THE COVER MUST ALWAYS *INFORM*.
   *
   * The first version drew the cover from informed roles NOT DEALT, to avoid two players
   * truthfully claiming the same card. `role-script` S6b then measured the poison rate at
   * **0.0% at eight players** — because `GUARANTEED[8]` deals all three informing roles, so the
   * only covers left were Editor, Fan Favourite and Stunt Double, none of which receives any
   * information. The Outsider whose entire job is poisoning private information was poisoning
   * nothing, at the flagship player count, silently.
   *
   * So the cover is drawn from the roles that actually INFORM. An undealt one is preferred,
   * because an unfalsifiable claim is stronger — but when all of them are in play the cover
   * duplicates one, and **that clash is the classic behaviour rather than a defect**: two
   * players claim Camera Op, both believe it, and the room has to work out which reading to
   * trust. That is the Outsider doing its job out loud.
   *
   * ⚠️ `party-isolation` I3 has to know about this: a socket carrying a role name that ground
   * truth assigns to someone else is normally a leak, and here it is a deliberate deception. I3
   * exempts a holder's own cover by name, and only their own.
   */
  const dealtRoles = new Set(order);
  const informing = Object.keys(ROLES).filter((r) => ROLES[r].informs);
  for (const seat of seats) {
    if (seat.role !== 'glitched') continue;
    const undealt = informing.filter((r) => !dealtRoles.has(r));
    const pool = undealt.length ? undealt : informing;
    seat.cover = shuffle(pool, rand)[0];
  }

  return {
    seats,
    evil: seats.filter((s) => s.alignment === EVIL).map((s) => s.id),
    cameras: camerasNeeded(count),
  };
}

/**
 * The ONLY projection of a deal that may reach a player.
 *
 * 🚨 A GOOD PLAYER'S VIEW CARRIES NO FIELD THAT NAMES ANY ALIGNMENT BUT THEIR OWN, AND IT IS
 * STRUCTURAL RATHER THAN FILTERED — the key is absent, not empty. `role-deal` R4 asserts this
 * before a socket exists, because an empty `teammates: []` on a good phone is itself the answer
 * to "am I evil", and a filter that nulls a field leaves its shape behind (`party-isolation` I4).
 */
export function viewFor(deal, id) {
  const me = deal.seats.find((s) => s.id === id);
  if (!me) throw new Error(`no seat for ${id}`);
  const view = {
    // The Glitched is shown their COVER and is never told otherwise. Ground truth stays in the
    // deal; only the Reunion ever reconciles the two.
    you: { id: me.id, seat: me.seat, role: me.cover ?? me.role, alignment: me.alignment },
    players: deal.seats.map((s) => ({ id: s.id, seat: s.seat, alive: true, claim: null })),
  };
  if (me.alignment === EVIL) {
    view.you.teammates = deal.seats
      .filter((s) => s.alignment === EVIL && s.id !== id)
      .map((s) => ({ id: s.id, role: s.role, claimDraft: null }));
  }
  return view;
}
