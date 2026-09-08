/**
 * Night expedition jobs — episode → room / target / copy.
 *
 * Episode 1 is the twin-painting smash (WALL_CALL). Every later expedition is
 * the same noisy wall-camera install (DRILL / TALLY) until a camera actually
 * mounts. A failed mount stays dark; the next pair drills again. Do not add
 * TILT. Chapel table-round stays furniture, not a job.
 *
 * No THREE, no DOM. Phones, the guide map, and the follow bed all read this so
 * the copy and the smash cannot disagree.
 */

import { JOB, routeById, ROUTE_STATUS } from './jobs.js';
import { HEAT_STEP, LIGHTS_JOB, isLightsJob, projectLights } from './heat.js';
import { PORTRAIT_JOB, PORTRAIT_STEP, isPortraitJob } from './portrait.js';

export const MISSION_PAINTING = {
  id: 'gallery-twin',
  job: JOB.SMASH,
  task: 'WALL_CALL',
  room: 'gallery',
  target: 'twin-painting',
  catalogId: null,
  seek: 'Find the gallery. Hit one painting.',
  /** Once she is standing in it. See `seekLine` — the room name has done its job by then. */
  arrived: 'You are in it. Two faces. Hit one.',
  home: 'One is down. Get back to the ballroom.',
};

/** @deprecated chapel smash is retired; kept so a stale import fails loudly on `.job`. */
export const MISSION_TABLE = {
  id: 'chapel-table',
  job: JOB.SMASH,
  task: 'WALL_CALL',
  room: 'chapel',
  target: 'table-round',
  catalogId: 'table-round',
  seek: 'Find the chapel. Smash the round table.',
  home: 'The table is down. Get back to the ballroom.',
};

export const MISSION_DRILL = {
  id: 'gallery-drill',
  job: JOB.DRILL,
  task: 'TALLY',
  room: 'gallery',
  target: 'wall-cam',
  catalogId: null,
  seek: 'Find the gallery. Mount the wall camera.',
  arrived: 'You are in it. Hold DRILL until it mounts.',
  home: 'The mount is in. Get back to the ballroom.',
};

/** Station gallery. Not smash. Catch locked + ≥1 cross is the escape contribution. */
export const MISSION_PORTRAIT = {
  id: 'gallery-portrait',
  job: PORTRAIT_JOB,
  task: 'PORTRAIT',
  room: 'gallery',
  target: 'ancestral-portrait',
  catalogId: PORTRAIT_JOB,
  selectedJob: PORTRAIT_JOB,
  seek: 'Raise the portrait. Crawl through.',
  arrived: 'Lift is up. Crawl under. Catch on the far side.',
  home: 'The catch is locked.',
};

/** Group generators via private-heat. Not smash/drill, not pin/auto-walk. */
export const MISSION_LIGHTS = {
  id: 'hall-lights',
  job: LIGHTS_JOB,
  task: 'LIGHTS',
  room: 'foyer',
  target: 'reserve-gate',
  catalogId: LIGHTS_JOB,
  selectedJob: LIGHTS_JOB,
  seek: 'Hold the generators. Charge the reserve.',
  arrived: 'HOLD TO GENERATE. Release to cool.',
  home: 'Gate is open. Cross.',
};

/** Fault shape when the menu closed without a job. Never smash. */
export const MISSION_MISSING = {
  id: 'missing-job',
  job: null,
  task: null,
  room: null,
  target: null,
  catalogId: null,
  selectedJob: null,
  missing: true,
  why: 'no selectedJob',
  seek: 'No route locked.',
  arrived: 'No route locked.',
  home: 'No route locked.',
};

/** Episode 1 is the twin smash. Every later expedition is DRILL. */
export function missionFor(episode) {
  const ep = Number(episode);
  // Missing / NaN / 0 / 1 stay on the premiere smash. Only 2+ is the drill.
  return Number.isFinite(ep) && ep >= 2 ? MISSION_DRILL : MISSION_PAINTING;
}

/** True when smash/drill must not launch — a choosable implemented job is locked. */
export function catalogPlayJob(selectedJob) {
  if (isPortraitJob(selectedJob) || isLightsJob(selectedJob)) return selectedJob;
  return null;
}

export function isLegacyHallJob(selectedJob) {
  return !catalogPlayJob(selectedJob);
}

/**
 * Stamp the locked catalog job onto a smash/drill spec. Identity of `missionFor()`
 * is unchanged — J0 still compares the premiere object. The stamp is a copy.
 * Portrait / Lights do not use this — `missionForSelected` owns those.
 */
export function stampSelectedJob(spec, selectedJob) {
  if (!selectedJob) return spec;
  return { ...spec, catalogId: selectedJob, selectedJob };
}

/**
 * Job-dispatched play. Portrait / Lights are their own specs. A missing job after
 * the menu returns `MISSION_MISSING` — never smash. No menu (idle route) keeps
 * smash/drill for existing gates.
 *
 * @param {string|null} selectedJob
 * @param {number} episode
 * @param {{ menuUsed?: boolean }} [opts]
 */
export function missionForSelected(selectedJob, episode, { menuUsed = false } = {}) {
  if (isPortraitJob(selectedJob)) return { ...MISSION_PORTRAIT };
  if (isLightsJob(selectedJob)) return { ...MISSION_LIGHTS };
  const row = selectedJob ? routeById(selectedJob) : null;
  if (row?.status === ROUTE_STATUS.STUB) {
    return { ...MISSION_MISSING, selectedJob, catalogId: selectedJob, why: 'stub' };
  }
  if (!selectedJob && menuUsed) return { ...MISSION_MISSING };
  return stampSelectedJob(missionFor(episode), selectedJob);
}

/**
 * Lights heat binds to the catalog job id.
 */
export function lightsArmedFor(selectedJob) {
  return isLightsJob(selectedJob);
}

export function portraitArmedFor(selectedJob) {
  return isPortraitJob(selectedJob);
}

export function freshLightsBind(selectedJob, step = HEAT_STEP.PRACTICE) {
  if (!isLightsJob(selectedJob)) return null;
  return { job: LIGHTS_JOB, station: 'generator', step };
}

export function freshPortraitBind(selectedJob, step = PORTRAIT_STEP.PRACTICE) {
  if (!isPortraitJob(selectedJob)) return null;
  return { job: PORTRAIT_JOB, step };
}

export { HEAT_STEP, LIGHTS_JOB, isLightsJob, projectLights, PORTRAIT_JOB, PORTRAIT_STEP, isPortraitJob };

/**
 * Next-job roster. Expulsion pulls a living seat out of the upcoming job
 * without killing them. Wrecked / assimilated are already absent from
 * `living` (`alive: false`).
 */
export function jobRoster(living, expelled = []) {
  const out = new Set(expelled || []);
  return (living || []).filter((id) => id && !out.has(id));
}

/**
 * 🧭 **THE SEEK LINE ADVANCES ONCE SHE IS STANDING IN IT.**
 * Compares two room ids and nothing else, so it leaks nothing.
 */
export function seekLine(spec, { here = null, missionRoom = null, phase = 'seek' } = {}) {
  const s = spec ?? MISSION_PAINTING;
  if (phase === 'done') return 'Home. That is the run.';
  if (phase === 'return') return s.home;
  const inRoom = !!here && !!missionRoom && String(here) === String(missionRoom);
  return inRoom ? (s.arrived ?? s.seek) : s.seek;
}
