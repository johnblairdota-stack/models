/**
 * 🧩 **THE TASK DECK — five tasks, five shapes, one contract.**
 *
 * `docs/design/rrr-task-deck.md`. What keeps a deck from degenerating into a bag of minigames is
 * that every entry passes the same six rules, so this file declares conformance as DATA and
 * `harness/task-deck.mjs` checks it rather than trusting a prose table.
 *
 * ---------------------------------------------------------------------------------------------
 * ✅ ALL FIVE NOW SATISFY T4. The three that did not are built — see `src/party/noiseplan.js`.
 * ---------------------------------------------------------------------------------------------
 * T4 says failure must be audible, and until 2026-08-19 the bus carried **placed events only**
 * (`noise.js:14-22`) with just two callers emitting, so a failed breach, a smashed antique and a
 * shorted camera were all silent. `noiseplan.js` closes it by subscribing to two hooks that
 * already existed and were unassigned — `WeaponSystem.onWallHit` and `FurnProp.onBreak` — so no
 * owned file was edited and the survival mode is byte-identical.
 *
 * No THREE, no DOM.
 */

import { MOVE, HUNTER_SPEED, HUNTER_SENSE, WEAPON_COOLDOWN } from '../game/rules.js';
import { BREACH_NOISE } from '../game/connectors.js';
import { FAILURE_FIELDS } from './events.js';

/**
 * A rule a task does not yet satisfy because the ENGINE work is missing, as distinct from one it
 * satisfies or one it fails. `task-deck` SKIPs these by name with the reason, because on this
 * project a SKIP is never a PASS — and a task that quietly claimed T4 while its failure was
 * silent would be worse than one that admits it.
 */
export const PENDING = 'pending-emit';

/** The shapes. A new task picks one rather than inventing one. */
export const SHAPE = {
  RELAY: 'relay', SYNC: 'sync', SENSOR: 'sensor', RECALL: 'recall', TRANSIT: 'transit',
};

/**
 * Every task. `contract` is asserted, not assumed. `numbers` carries the three §5.2.3 requires
 * of any task before it joins the deck — `measured: false` means it is a proposal, not a fact.
 */
export const TASKS = [
  {
    id: 'DARK_RUN', shape: SHAPE.SENSOR, episode: 'any',
    runner: ['firstPerson', 'terminalPrompt', 'throttle'],
    guide: ['flyover', 'hunterMark', 'tilt'],
    lie: 'the word "clear"',
    contract: { T1: true, T2: true, T3: true, T4: true, T5: true, T6: true },
    noise: { successPeak: 0, failurePeak: 1.0, source: 'player.noise, continuous', built: true },
    numbers: { honestError: [0.18, 0.27], medianSeconds: null, measured: false },
  },
  {
    id: 'WALL_CALL', shape: SHAPE.RELAY, episode: 'any',
    runner: ['firstPerson', 'faceChoice', 'automatedSledge'],
    guide: ['flyover', 'whatIsBehindEachFace'],
    lie: 'which of two identical dark faces',
    /**
     * Night-one smash. Two identical paintings, same loudness, no mark on either.
     * Guide knows REAL and says left wall / far wall out loud. Pad buttons do not
     * send the call. TV follow does not say which she hit; the empty-nail still is
     * the delayed check.
     */
    contract: { T1: true, T2: true, T3: true, T4: true, T5: true, T6: true },
    // 3 blows at the shipped sledge cadence.
    /**
     * 🚨 A WRONG FACE IS EXACTLY AS LOUD AS A RIGHT ONE, AND THAT IS THE POINT. The first model
     * put failure at 0.6 — the proposed per-blow floor — and `task-deck` K4c caught it as a task
     * whose failure was QUIETER than its success. It is not: a misled runner still swings three
     * times and still crosses a stage, on the wrong wall. `perBlow` is the floor for blows that
     * do not cross; the peak is the breach either way. Identical noise is what makes the guide's
     * lie deniable — if a mistake were quieter, the room could hear the difference.
     */
    noise: { successPeak: BREACH_NOISE.panel, failurePeak: BREACH_NOISE.panel, perBlow: 0.6, source: 'per-blow emit (noiseplan.js)', built: true },
    numbers: { honestError: null, medianSeconds: 3 * WEAPON_COOLDOWN.sledge, measured: false },
  },
  {
    id: 'MANIFEST', shape: SHAPE.RECALL, episode: 'any',
    runner: ['firstPerson', 'furnitureSmashing'],
    guide: ['threeObjectNames', 'flyoverPositions'],
    lie: 'which object name was said',
    contract: { T1: true, T2: true, T3: true, T4: true, T5: true, T6: true },
    noise: { successPeak: 0.9, failurePeak: 0.9, perBlow: 0.9, source: 'per-prop emit (noiseplan.js)', built: true },
    numbers: { honestError: null, medianSeconds: null, measured: false },
  },
  {
    id: 'TALLY', shape: SHAPE.SYNC, episode: 'any',
    runner: ['interactHold', 'footstepsCue'],
    guide: ['armControl', 'aimTruth'],
    lie: 'the seated aim — hall versus a floor shot',
    /**
     * Later-night DRILL. Recap says CAM LIT / seated for both a useful hall shot
     * and a floor shot. Next night the public tool picture is HALL or FLOOR.
     * Unique lie is the spoken aim ("she's seated"). Runner says CLOSE / LATE /
     * GOING out loud from a local footsteps cue; those buttons send nothing.
     */
    contract: { T1: true, T2: true, T3: true, T4: true, T5: true, T6: true },
    noise: { successPeak: 0.3, failurePeak: 1.4, source: 'emit on short (noiseplan.js)', built: true },
    numbers: { honestError: null, medianSeconds: null, measured: false },
    /**
     * 🚨 T5 IS AT ITS MOST FRAGILE HERE AND THE CREW SIZE IS WHY. With a pair, ANY per-player
     * signal names a person: an array of two, a boolean "the runner was early", even a sign on a
     * delta. The only reportable fact is *"the camera shorted"*.
     */
    t5Note: 'crew of 2 — any positional or per-player field is an accusation',
  },
  {
    id: 'EXTRACTION', shape: SHAPE.TRANSIT, episode: 'late',
    runner: ['carryReel', 'noRun'],
    guide: ['wholeHouse', 'route', 'hunterInCoverage'],
    lie: 'route length',
    contract: { T1: true, T2: true, T3: true, T4: true, T5: true, T6: true },
    noise: { successPeak: 0, failurePeak: 0, source: 'sustained walking body, ~7 m', built: true },
    numbers: { honestError: null, medianSeconds: null, measured: false },
  },
];

export const byId = (id) => TASKS.find((t) => t.id === id);

/** Carrying the reel caps you at a walk. `rules.js:85` against `rules.js:127`. */
export const CARRY_SPEED = MOVE.walk;
export const outrunsCarrier = (stage) => HUNTER_SPEED[stage] > CARRY_SPEED;

/**
 * 🚨 THE STAGE-2 TRAP, AND IT IS THE BEST REASON THE EXTRACTION IS A LATE-ROUND TASK.
 * A carrying runner is capped at 2.55 m/s. The Hunter is 2.05 at stage 1 — outrunnable — and
 * **2.70 at stage 2**, which is faster, and you cannot drop the reel. The Hunter grows on every
 * take, good or evil, so by the time this task appears the trap has usually armed itself.
 */
export const CARRY_TRAP_STAGE = HUNTER_SPEED.findIndex((s, i) => i > 0 && s > CARRY_SPEED);

/** How far a breach carries: `loudness x hearRange`. */
export const carriesMetres = (loudness) => loudness * HUNTER_SENSE.hearRange;

/**
 * A breach is EVIDENCE, NEVER PROOF, and that is arithmetic rather than intent: sound alone
 * cannot fill awareness past `soundCeiling` (0.86), which is under `commitAt` (1.00). It brings
 * the Hunter into your half of the house; only a sighting makes it run.
 */
export const soundCanCommit = () => HUNTER_SENSE.soundCeiling >= HUNTER_SENSE.commitAt;

/**
 * 🗺️ Station capacities for the choosable route menu. Portrait: one pull-a, one pull-b,
 * remaining cross. Lights: every living robot on a generator. Stubs have none.
 * Private-heat lives in `heat.js` (tick + trip + reserve). This table is
 * capacity only — Lights still means every living robot on a generator.
 * Portrait required occupancy (pull-a + pull-b + cross when living ≥ 3) is
 * `emptyRequiredStations` / `mixReady` — do not change these cap numbers.
 */
export const ROUTE_CAPS = Object.freeze({
  portrait: Object.freeze({ 'pull-a': 1, 'pull-b': 1, cross: Infinity }),
  lights: Object.freeze({ generator: Infinity }),
});

/** Fill empty Portrait required seats in this order. Capacities stay 1 / 1 / ∞. */
export const PORTRAIT_FILL_ORDER = Object.freeze(['pull-a', 'pull-b', 'cross']);

export function stationCapacity(jobId, station) {
  const cap = ROUTE_CAPS[jobId]?.[station];
  return cap == null ? 0 : cap;
}

/**
 * @param {string} jobId
 * @param {string} station
 * @param {Record<string,{station?:string}>} claims
 * @param {string} [playerId]  a re-claim of the same seat does not count against the cap
 */
export function canClaimStation(jobId, station, claims = {}, playerId = null) {
  const cap = stationCapacity(jobId, station);
  if (!cap) return { ok: false, why: 'no station' };
  const taken = Object.entries(claims).filter(([id, c]) => (
    c?.station === station && id !== playerId
  )).length;
  if (taken >= cap) return { ok: false, why: 'full' };
  return { ok: true };
}

export function applyStationClaim(claims, playerId, station) {
  const next = { ...(claims || {}) };
  const prev = next[playerId] || {};
  next[playerId] = { station, confirmed: false, was: prev.station };
  return next;
}

export function confirmStationClaim(claims, playerId) {
  const row = claims?.[playerId];
  if (!row?.station) return { ok: false, why: 'no station' };
  const next = { ...claims, [playerId]: { ...row, confirmed: true } };
  return { ok: true, claims: next };
}

/** Host may lock when every living robot has volunteered and confirmed. */
export function crewReady(living, claims = {}) {
  return (living || []).every((id) => !!(claims[id]?.station && claims[id]?.confirmed));
}

/**
 * Portrait mix: living ≥ 3 must occupy pull-a, pull-b, and cross.
 * Empty list is the chrome highlight and the lock refusal. Other jobs: none.
 */
export function emptyRequiredStations(jobId, claims = {}, living = []) {
  if (jobId !== 'portrait') return [];
  const ids = (living || []).filter(Boolean);
  if (ids.length < 3) return [];
  const occ = new Set();
  for (const id of ids) {
    const s = claims[id]?.station;
    if (s) occ.add(s);
  }
  return PORTRAIT_FILL_ORDER.filter((station) => !occ.has(station));
}

export function mixReady(jobId, claims = {}, living = []) {
  return emptyRequiredStations(jobId, claims, living).length === 0;
}

/**
 * Timeout / lock fill: unclaimed living, stable seat order, into empty
 * pull-a then pull-b then cross. Does not reassign a claimed seat.
 */
export function autoFillStations(jobId, claims = {}, living = []) {
  let next = { ...(claims || {}) };
  if (jobId !== 'portrait') return next;
  const ids = (living || []).filter(Boolean);
  const unclaimed = ids.filter((id) => !next[id]?.station);
  for (const station of PORTRAIT_FILL_ORDER) {
    while (unclaimed.length) {
      const id = unclaimed[0];
      if (!canClaimStation(jobId, station, next, id).ok) break;
      next = applyStationClaim(next, id, station);
      const confirmed = confirmStationClaim(next, id);
      if (confirmed.ok) next = confirmed.claims;
      unclaimed.shift();
    }
  }
  return next;
}

/** Phone chrome: why lock is refused while a required station is empty. */
export function stationNeedHtml(empty = []) {
  const list = [];
  for (const s of empty || []) {
    if (s && !list.includes(s)) list.push(s);
  }
  if (!list.length) return '';
  const labels = list.map((s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  )));
  return `<p class="hint station-need" data-station-need>Need ${labels.join(' · ')} before lock.</p>`;
}


/** Every task reports failure through the same closed schema. `party-anon` A1 is the enforcer. */
export function failurePayload(taskId, input) {
  const t = byId(taskId);
  if (!t) throw new Error(`no task ${taskId}`);
  // 🚨 REFUSE UNKNOWN FIELDS, DO NOT SILENTLY DROP THEM. The first version destructured the four
  // it wanted, so a caller adding `earlyBy: 0.4` got a clean payload and no signal — and then
  // put the timing somewhere else. `makeEvent` already makes this choice; so does this.
  const extra = Object.keys(input).filter((k) => !FAILURE_FIELDS.includes(k));
  if (extra.length) throw new Error(`T5: failure payload for ${taskId} carries ${extra.join(', ')}`);
  const { kind, room, phaseTick, loudness } = input;
  return { kind, room, phaseTick, loudness };
}
