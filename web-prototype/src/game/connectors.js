import { STAGE_DEFS } from '../destruction/wall.js';
import { seedRand } from './run.js';

/**
 * THE CONNECTOR — the one thing a room boundary can be.
 *
 * `docs/design/procedural-map.md` §3 and §6.1, John 2026-08-04: *"the interconnect between the
 * rooms should be like the escape door so each time you open one of these doors you don't know
 * if it will lead outside or to another room."*
 *
 * A connector is a hole in a wall between two places. It has ONE aperture and ONE dressing and
 * exactly FOUR states:
 *
 *   open        walk through. The routes the level gives you.
 *   breachable  a normal panel, `STAGE_DEFS`, cheap. Ordinary breaching is a TRAVERSAL VERB
 *               and it must stay cheap or the map loses its third dimension of choice.
 *   chained     `damageable: false`. Force alone never works — `escape.md` §2, and the
 *               storytelling that a padlock is human-made.
 *   exit        `EXIT_DEFS`, a 15-25 s siege, and a yard behind it.
 *
 * ⚠️ WHY THIS FILE EXISTS AND WHY IT IS NOT THE GENERATOR. The generator's whole output is a
 * list of connectors. Building it on top of an unproven interface is two unknowns at once, so
 * this round builds the interface, retrofits the EXISTING six-space plan onto it, and proves
 * the game plays identically. Step 3 in `procedural-map.md` §6 is the generator, and its only
 * new obligation is to emit `CONNECTORS` rows that satisfy §5's four solvability properties.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ "ONE CLEAR WIDTH" IS A DEFAULT, NOT A LAW, AND D7 IS THE REASON.
 *
 * `HunterAI.radius` is `0.30 + stage * 0.12` = 0.42 / 0.54 / 0.66, and `room.collide()` is a
 * circle push-out, so a body needs MORE than twice its radius of clear width to pass an
 * opening: 0.84 / 1.08 / **1.32** at stages 1/2/3. D7 is **1.20 m**, so stages 1 and 2 fit and
 * stage 3 does not — the chapel is a refuge that growth takes away, and after growth the only
 * way in is the loud, readable breach of `p.chapel`. **That mechanic is a NUMBER in a table**,
 * and an interface that normalised every connector to one width would delete it silently: the
 * hunter would simply walk into the chapel one day and nobody would ever see a stack trace.
 *
 * So the contract is: `clearWidth()` is the single accessor, it reads the connector's OWN `w`
 * when it has one, and `room.pathPortals(a, b, minW)` filters on exactly that number. Nothing
 * between the table and the BFS is allowed to round it, default it or forget it.
 * `harness/scenarios/conn-1.mjs` asserts D7 is 1.20 and that a stage-3 body is refused it.
 *
 * ---------------------------------------------------------------------------
 * ⚠️ AND THE THREE **CLOSED** STATES SHARE ONE APERTURE, BY CONSTRUCTION.
 *
 * `procedural-map.md` §2: *"a closed connector must give NOTHING away. Same jamb, same
 * architrave, same dressing, same sound. The moment a live exit is distinguishable while
 * closed, the whole idea collapses back into elimination."* An OPEN doorway is exempt because
 * it is not a thing you gamble on — you can see through it.
 *
 * The aperture is a property of the SITE, never of the state: `resolveConnector()` returns the
 * same `w/h/cy` for a site whether the run made it an exit or left it chained, so flipping the
 * seed can never change one pixel of the hole. That is asserted, not asserted-to.
 */

// ---------------------------------------------------------------------------
// The four states
// ---------------------------------------------------------------------------

export const CONNECTOR = {
  OPEN: 'open',
  BREACHABLE: 'breachable',
  CHAINED: 'chained',
  EXIT: 'exit',
};

export const CONNECTOR_STATES = [CONNECTOR.OPEN, CONNECTOR.BREACHABLE, CONNECTOR.CHAINED, CONNECTOR.EXIT];

/**
 * The AUTHORED state a table row may declare. `exit` is a CANDIDACY, not a promise: a run
 * promotes exactly one exit-class connector to `EXIT` and demotes every other to `CHAINED`
 * (`escape.md` §6.2 — "the decoys ARE the chained exits", so the shuffle and the storytelling
 * are the same feature). Everything else authors its final state directly.
 */
export const AUTHORED = { ...CONNECTOR };

// ---------------------------------------------------------------------------
// The aperture
// ---------------------------------------------------------------------------

/** The one clear width / height / centre height every CLOSED connector gets unless it says otherwise. */
export const CONNECTOR_W = 2.08;
export const CONNECTOR_H = 2.68;
/** Sill on the floor: a breach you have to vault into is a puzzle, one you run through is a route. */
export const CONNECTOR_CY = CONNECTOR_H / 2;

/** ...and the one an OPEN doorway gets. Floor to lintel, so `y0` is 0 and there is no sill. */
export const DOORWAY_W = 1.90;
export const DOORWAY_H = 2.72;

/**
 * The hole this connector cuts, in the wall's own frame.
 *
 * `u` is the coordinate along the wall run, `y0/y1` the vertical extent. `room.js`'s
 * `buildWall` consumes exactly this shape, which is why a doorway and a panel can share one
 * cut list: a doorway is a cut whose `y0` is 0 and whose lintel reaches `DOORWAY_H`.
 */
export function aperture(spec) {
  const open = (spec.state ?? CONNECTOR.BREACHABLE) === CONNECTOR.OPEN;
  const w = spec.w ?? (open ? DOORWAY_W : CONNECTOR_W);
  const h = spec.h ?? (open ? DOORWAY_H : CONNECTOR_H);
  const cy = spec.cy ?? (open ? h / 2 : CONNECTOR_CY);
  return { w, h, cy, y0: cy - h / 2, y1: cy + h / 2 };
}

/**
 * THE CLEAR WIDTH — the number D7's mechanic is made of. See the header.
 *
 * One accessor, so there is exactly one place a future generator has to respect and exactly
 * one place a bug can live. `pathPortals(from, to, minW)` compares against this and nothing
 * else.
 */
export function clearWidth(spec) { return aperture(spec).w; }

/**
 * THE CLEAR HEIGHT — the vertical twin of `clearWidth`, and the number `dig.js`'s low segment is
 * made of. One accessor, same contract: `pathPortals(from, to, minW, minH)` compares against this
 * and nothing else, and `rules.js` `PASS_H` is what it is compared against.
 *
 * ⚠️ It reads the aperture, so it is a property of the SITE and not of the run — a connector's
 * height cannot change with the seed any more than its width can, which is `procedural-map.md`
 * §2's requirement and `conn-1.mjs` C3's assertion.
 */
export function clearHeight(spec) { return aperture(spec).h; }

/** Which axis the connector's WIDTH runs along. Doorways say `axis`; panels say `rotY`. */
export function connectorAxis(spec) {
  if (spec.axis) return spec.axis;
  return Math.abs(Math.cos(spec.rotY ?? 0)) > 0.5 ? 'x' : 'z';
}

// ---------------------------------------------------------------------------
// The stage tables — what each state IS, mechanically
// ---------------------------------------------------------------------------

/**
 * A CHAINED CONNECTOR'S STAGE TABLE — the wall you cannot chew.
 *
 * `escape.md` §2: "Mechanically these are `blocksMove: true, damageable: false` — a wall you
 * cannot chew. That matters: the first thing the player learns is that force alone does not
 * work, which is what makes the concealed exits a discovery rather than a chore."
 *
 * Stage 0 is the padlock. `WallState.applyDamage` early-outs on `!this.def.damageable`, so a
 * nail gun emptied into it moves nothing — but `blocksShots` stays TRUE so the shot still STOPS
 * there and still throws chips, which is the difference between "this is solid" and "this gun
 * is broken".
 *
 * ⚠️ STAGES 1..4 ARE CARRIED OVER FROM `STAGE_DEFS` UNCHANGED AND THEY ARE NOT DEAD CODE.
 * `applyDamage` can never reach them (stage 0 refuses), but `setStage()` can, and §8's
 * detonation drives EVERY connector in the house to `open` — including the chained ones,
 * because the house going up does not care what the humans padlocked. A one-entry table would
 * make `defs[FINAL_STAGE]` undefined and take that cascade down with a TypeError.
 *
 * `health` is a large FINITE number, not Infinity: `DestructibleWall._apply()` computes
 * `1 - stageHealth / def.health` to drive the break mask, and Infinity/Infinity is NaN.
 */
export const CHAINED_DEFS = [
  { stage: 0, name: 'chained', health: 999999, blocksMove: true, blocksShots: true,
    blocksSight: true, climbable: false, damageable: false },
  ...STAGE_DEFS.slice(1),
];

/**
 * THE EXIT'S STAGE TABLE — the siege. `escape.md` §6a/§6b, and it is the one number change the
 * whole design hangs on.
 *
 * ⚠️ SAME FIVE STAGES, SAME FLAGS, SAME ORDER, SAME `FINAL_STAGE`. **Only `health` differs.**
 * Nothing reads this table that does not also read `STAGE_DEFS`, and every flag is copied from
 * it rather than restated, so a change to the wall machine's behaviour cannot be true of an
 * ordinary connector and false of an exit. That property is now load-bearing twice over: it is
 * also what makes an exit and a breachable panel **indistinguishable while closed**, since the
 * only thing that differs at stage 0 is a health number nobody can see until they shoot it.
 *
 *     lock       stages        hp     MEASURED, held trigger      nail-gun rounds
 *     boarded    0,1,2,3     4900        24.07 s at 4700 hp              189
 *     plaster      1,2,3     4340        21.23 s at 4140 hp              167
 *     beams            3     3000        14.28 s at 2800 hp              116
 *
 * `harness/scenarios/eo2-siege.mjs` on seed `s4`, trigger held — an effective 195-196
 * damage/second against the 200 the arithmetic predicts. The BEFORE arm of that same A/B — the
 * identical panel with `defs` swapped back to `STAGE_DEFS` — reads 1.30 / 1.10 / **0.46 s**.
 *
 * The beam stage is 60% of the whole job on purpose. It is the ONE stage where `blocksSight`
 * and `blocksShots` are false while `blocksMove` is true — **so it is also the REVEAL**:
 * `procedural-map.md` §2's whole payoff is that you commit, you spend 15-25 s making the
 * loudest noise in the game, and at the last and most expensive stage you see through the studs
 * and learn what you bought. Daylight, or another room. Do not shorten it and do not let
 * anything else leak that answer earlier.
 */
const EXIT_HEALTH = [560, 760, 580, 3000, 0];
export const EXIT_DEFS = STAGE_DEFS.map((d, i) => ({ ...d, health: EXIT_HEALTH[i] ?? d.health }));

/** The stage table each state runs on. `open` has no panel at all, hence null. */
export function defsFor(state) {
  switch (state) {
    case CONNECTOR.OPEN: return null;
    case CONNECTOR.CHAINED: return CHAINED_DEFS;
    case CONNECTOR.EXIT: return EXIT_DEFS;
    default: return STAGE_DEFS;
  }
}

/**
 * HOW LOUD A CONNECTOR COMING APART IS, in `HunterAI.hearNoise`'s own units.
 *
 * ⚠️ THE UNIT IS `Player.noise`, WHERE 1.0 IS A GUNSHOT AND MEANS 14 METRES: `hearNoise`
 * refuses at `d > HUNTER_SENSE.hearRange * strength`, so the parameter is literally "how far
 * this carries, in gunshots". Measured (`eo2-siege.mjs`): at 1.0 AND at 1.9 the hunter sat at
 * 37.1-37.3 m through a whole 25 s siege and every transition was refused. 3.4 is 47.6 m, the
 * whole house — `escape.md` §1's load-bearing sentence as a number. It can afford to be that
 * loud because `soundCeiling` (0.86) is below `commitAt` (1.00): sound sends it to LOOK, four
 * times over a 25 s job, and can never commit it.
 *
 * ⚠️ AND THIS IS THE ONE PART OF THE CONNECTOR THAT IS STILL STATE-CORRELATED — see
 * `procedural-map.md` §2's "same sound". Breaching an exit brings the hunter from anywhere;
 * breaching an ordinary panel is heard 17.5 m. A player who starts work and watches the house
 * come to them has learned which state they are standing at, several seconds before the beam
 * stage would have told them. **The two requirements genuinely conflict**: `escape.md` §1 wants
 * the way out to summon the thing hunting you, and `procedural-map.md` §2 wants a closed
 * connector to give nothing away, and one of the two has to lose. It is left AS IS and reported
 * rather than quietly unified, because unifying it either makes ordinary breaching un-cheap
 * (which the brief forbids) or makes the siege silent (which undoes a measured round).
 */
export const BREACH_NOISE = { panel: 1.25, exit: 3.4 };

export function noiseFor(state) {
  return state === CONNECTOR.EXIT ? BREACH_NOISE.exit : BREACH_NOISE.panel;
}

// ---------------------------------------------------------------------------
// Resolution — an authored row plus a run plan gives one live connector
// ---------------------------------------------------------------------------

/**
 * The authored state of a row, before any run touches it. `exit` here means CANDIDATE.
 * Anything unrecognised is a breachable panel, which is the safe default: a connector that
 * cannot be opened by mistake is a soft-lock, one that can is a route.
 */
export function authoredState(spec) {
  const s = spec.state;
  if (CONNECTOR_STATES.includes(s)) return s;
  // Back-compat with the pre-connector table shape, which said `exit: true` and nothing else.
  if (spec.exit) return CONNECTOR.EXIT;
  return CONNECTOR.BREACHABLE;
}

/** Is this connector a candidate for the run's one live exit? */
export function isExitSite(spec) { return authoredState(spec) === CONNECTOR.EXIT; }

/**
 * THE STATE THIS CONNECTOR IS IN, THIS RUN.
 *
 * The only place the promotion rule lives: exactly one exit-class connector is `EXIT` and every
 * other one is `CHAINED`. `plan.exitId` comes from `RunState`, which derives it from the seed
 * with no `Math.random`, no `Date` and no iteration order — see `run.js` `chooseExit`.
 */
export function resolveState(spec, plan = {}) {
  const authored = authoredState(spec);
  if (authored !== CONNECTOR.EXIT) return authored;
  return spec.id === plan.exitId ? CONNECTOR.EXIT : CONNECTOR.CHAINED;
}

/**
 * Everything the world needs to build and run one connector, in one object.
 *
 * ⚠️ THE APERTURE DOES NOT DEPEND ON THE PLAN AND THAT IS THE POINT. `w/h/cy` are read off the
 * spec alone, so the hole an exit site cuts is the same hole whether the seed made it live or
 * chained. `conn-1.mjs` proves it by resolving every site under both states and comparing.
 */
export function resolveConnector(spec, plan = {}) {
  const state = resolveState(spec, plan);
  const ap = aperture(spec);
  const defs = defsFor(state);
  const lock = typeof plan.lock === 'string' ? { id: plan.lock } : (plan.lock ?? null);
  return {
    id: spec.id, a: spec.a, b: spec.b, spec,
    state,
    authored: authoredState(spec),
    axis: connectorAxis(spec),
    ...ap,
    passable: state === CONNECTOR.OPEN,
    defs,
    startStage: state === CONNECTOR.EXIT ? (lock?.startStage ?? 0) : 0,
    noise: noiseFor(state),
  };
}

/** id -> resolved connector, for the whole house. */
export function resolveAll(specs, plan = {}) {
  const out = new Map();
  for (const s of specs) out.set(s.id, resolveConnector(s, plan));
  return out;
}

// ---------------------------------------------------------------------------
// The dressing — step 2, and the part that contradicts work that shipped
// ---------------------------------------------------------------------------

/**
 * ⚠️ **A CLOSED CONNECTOR MUST GIVE NOTHING AWAY, AND THE SHIPPING BUILD GAVE EVERYTHING AWAY.**
 *
 * `exterior-owner-2` built concealment cues that MARK the live exit — a daylight seam, a
 * draught and a cold floor patch, measured at **+20.3 luma on the jamb strip in both breathing
 * phases**, against chained sites that instead wear a chain and a padlock. Both halves are a
 * tell, and together they are exactly `play-critic-7`'s defect: *"the operative tell is
 * ELIMINATION, not EVIDENCE... nobody will ever say 'I should have seen that', because there is
 * nothing to see and nothing to miss."* You find the way out by counting padlocks, and the
 * concealment cues are what makes the last one identifiable once you have.
 *
 * `procedural-map.md` §2 forbids it outright. `MODES` is how the two coexist:
 *
 *   marked  the shipped behaviour, EXACTLY: chain on the chained, seam/draught/spill on the
 *           live one. Kept so `exterior-look.mjs`'s +20.3 luma A/B stays re-runnable and so
 *           nothing measured is deleted on my say-so.
 *   blind   the default. Dressing is a seeded property of the CONNECTOR and is never read off
 *           its state, so chains and seams appear on ordinary breachable panels too and a
 *           padlock stops meaning anything. The tells are not removed — they are made
 *           UNRELIABLE, which is the option `procedural-map.md` §2 names first and the one that
 *           keeps a measured, working, judged piece of work in the build.
 *   off     no dressing anywhere. The control arm, so "the dressing is what moved this number"
 *           can be answered rather than argued.
 *
 * ⚠️ AND THE REVEAL IS PROTECTED. In `blind` the seam, the draught and the floor spill do not
 * fire at all while the panel still blocks sight. They arrive at the BEAM stage — the last and
 * most expensive one, `blocksSight: false` — which is `procedural-map.md` §2's payoff beat:
 * you commit, you spend 15-25 s, and at the final stage you see through the studs and learn
 * what you bought. Turning them on earlier is what made the answer free.
 */
export const TELL_MODES = ['blind', 'marked', 'off'];

/**
 * How often a connector wears each cue in `blind`.
 *
 * `chain` and `seam` are INDEPENDENT draws, so all four combinations occur and no combination
 * is reserved to a state. `boards` and `mortar` come off ONE draw and are mutually exclusive,
 * because they are both a treatment of the same wall face and a bay that is simultaneously
 * boarded over and freshly rendered reads as a bug rather than as a house.
 *
 * ⚠️ THESE ARE THE ONE PLACE THE DESIGN IS TUNED AND THEY ARE NOT MEASURED AGAINST A PLAYER.
 * The property that IS measured is that the distribution does not depend on the state.
 * `DO NOT RE-TUNE THESE NUMBERS BELIEVING IT WILL CLOSE A CONCEALMENT GAP` — the discriminator
 * players actually use is the damage rate, not the visuals (`play-critic-8`), and this population
 * is honest and cannot be broken by eye on any seed.
 *
 * ⚠️ **THE SEAM'S POPULATION CHANGED WHEN IT GAINED THE `outside` GATE** (see
 * `connectorDressing`): it used to be drawn on all 22 connectors and 4-5 of the 8 interior
 * panels wore daylight they had no physical right to. 512 seeds, `harness/_tmp_seam_correlation`
 * (same functions `conn-1.mjs` C6 exercises, swept without paying for 512 page loads):
 * the 8 interior panels wear it **0/4096, always** — it is gated to the 14-site exterior
 * candidate pool, chosen by `spec.b === 'outside'`, and does not identify which one — and within
 * that pool the live exit wears it **45.7%** of the time against the pool's own **46.4%**, the
 * same number within sampling noise (stderr ≈2.2 pp at n=512). Chain is unaffected: still drawn
 * on all 22, still independent of state.
 */
export const DRESS_P = { chain: 0.50, seam: 0.45, boards: 0.28, mortar: 0.28 };

/**
 * Which cues this connector wears. **In `blind`, `state` IS NOT READ** — that is the whole
 * property, and `conn-1.mjs` asserts it by asking with a deliberately wrong state and requiring
 * the same answer, then asking in `marked` and requiring a different one so the probe is shown
 * to be able to see a tell when there is one.
 *
 * ⚠️ **THE SEAM IS THE ONE CUE THAT IS PHYSICAL, NOT DECORATIONAL, AND `outside` IS WHY IT TAKES
 * A FIFTH ARGUMENT.** Chain, boards and mortar are human hardware — they can hang on ANY closed
 * connector, including a wall between two interior rooms, because a person nailed them there.
 * Daylight cannot: it does not leak through a partition whose far side is another dark room.
 * Measured before this argument existed: 4-5 of the 8 interior breachable panels wore the seam,
 * including a wall between the service passage and the west study — both interior, both dark —
 * and it opened onto a room in 1.25 s. That is not "unreliable", which is what `blind` is for;
 * it is a physical lie, and a player who learns it reads the game as buggy rather than devious.
 *
 * `outside` is true when this connector's far side is `outside` (`spec.b === 'outside'` —
 * `spaces.js`'s marker for an exterior wall, which is exactly the 14-site exit-candidate pool).
 * It narrows the population the seam can appear on from 22 to 14 without saying which of the 14
 * is live — chain and the seam are still independent draws, and the seam is still drawn from the
 * same seeded distribution regardless of state, so `state` remains unread. Defaults to `true` so
 * a caller that has not been taught about `outside` (there are none left in this build, but a
 * future one might forget) fails open to the OLD, more permissive behaviour rather than a wall
 * that can never show anything.
 */
export function connectorDressing(spec, seed, mode = 'blind', state = null, outside = true) {
  const id = typeof spec === 'string' ? spec : spec.id;
  if (mode === 'off') return { chain: false, seam: false, boards: false, mortar: false };
  if (mode === 'marked') {
    // `views/game.js` overrides boards/mortar from the LOCK in this mode — see `setPlan`.
    return {
      chain: state === CONNECTOR.CHAINED, seam: state === CONNECTOR.EXIT,
      boards: false, mortar: false,
    };
  }
  const face = seedRand(seed, `dress.face|${id}`);
  return {
    chain: seedRand(seed, `dress.chain|${id}`) < DRESS_P.chain,
    seam: !!outside && seedRand(seed, `dress.seam|${id}`) < DRESS_P.seam,
    boards: face < DRESS_P.boards,
    mortar: face >= DRESS_P.boards && face < DRESS_P.boards + DRESS_P.mortar,
  };
}

/** Sanitise a `?tells=` value. Anything unrecognised is the default rather than a throw. */
export function tellMode(v) { return TELL_MODES.includes(v) ? v : 'blind'; }
