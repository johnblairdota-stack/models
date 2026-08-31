/**
 * RECAP CARD — three facts from the vis log, nothing produced.
 *
 * Playcritique #1: a 20 s card of camera / taken / alarms is what six people can argue about.
 * Query the log the sockets already received. Do not wait for the Broadcast Director.
 *
 * Couch Plan Rung 2: the card is THIS episode. A log that still holds last night's
 * camera_lit / take / alarms used to reprint them on a Recap that never ran — chrome
 * that reads as "Run is in the book" on a night with no run. Slice from the last
 * `cast.pair` / `cast.ballot`. No THREE, no DOM.
 */

/**
 * Banned ghost line. Recap chrome must never print this when `episodeHadRun` is false.
 * The phrase is the critic's example; the rule is broader: no run-claiming copy without a run.
 */
export const GHOST_RUN_LINE = 'Run is in the book';

function sliceThisEpisode(evs) {
  // Prefer the last `cast.ballot` — playEpisode writes ballot then pair, and episode lives on
  // the ballot. Starting at pair dropped the ballot and made `recap.episode` null (N9).
  // A log with only `cast.pair` (N0) still slices from the pair.
  let start = -1;
  for (let i = evs.length - 1; i >= 0; i--) {
    if (evs[i].type === 'cast.ballot') { start = i; break; }
  }
  if (start < 0) {
    for (let i = evs.length - 1; i >= 0; i--) {
      if (evs[i].type === 'cast.pair') { start = i; break; }
    }
  }
  return start < 0 ? evs : evs.slice(start);
}

/** @param {Array<{type:string, data?:object}>} events  entitled events one socket actually got */
export function recapFromEvents(events) {
  const all = (events || []).filter((e) => e && e.type);
  const evs = sliceThisEpisode(all);
  const cameras = evs.filter((e) => e.type === 'run.camera_lit');
  const taken = evs.filter((e) => e.type === 'player.taken');
  const alarms = evs.filter((e) => e.type === 'panel.alarm');
  const misses = evs.filter((e) => e.type === 'task.miss');
  const still = evs.filter((e) => e.type === 'run.wall_still').at(-1);
  const tool = evs.filter((e) => e.type === 'run.cam_tool').at(-1);
  const fail = evs.filter((e) => e.type === 'run.fail_chrome').at(-1);
  const pair = evs.filter((e) => e.type === 'cast.pair').at(-1);
  const ballot = evs.filter((e) => e.type === 'cast.ballot').at(-1);
  const lastLit = cameras.at(-1);
  const job = lastLit?.data?.job ?? still?.data?.job ?? null;
  const hadMission = evs.some((e) => String(e.type || '').startsWith('mission.'));
  const hadRun = hadMission
    || cameras.length > 0
    || taken.length > 0
    || alarms.length > 0
    || misses.length > 0
    || !!still
    || !!tool
    || !!fail;
  return {
    cameraLit: cameras.length > 0,
    camera: lastLit?.data?.camera ?? null,
    /**
     * Drill recap says seated for BOTH a hall shot and a floor shot. Looks like
     * a win tonight either way. The tool picture is next night's look.
     */
    seated: job === 'drill' && cameras.length > 0,
    job,
    emptyNail: still?.data?.emptyNail ?? null,
    tool: tool?.data?.shot ?? null,
    failLine: fail?.data?.line ?? null,
    taken: taken.map((e) => ({ id: e.data?.id, seat: e.data?.seat })),
    alarmCount: alarms.length,
    missCount: misses.length,
    runner: pair?.data?.runner ?? ballot?.data?.runner ?? null,
    guide: pair?.data?.guide ?? ballot?.data?.guide ?? null,
    episode: ballot?.data?.episode ?? cameras[0]?.data?.episode ?? null,
    tiebreaks: Array.isArray(ballot?.data?.tiebreaks) ? ballot.data.tiebreaks : [],
    hadRun,
  };
}

/**
 * Did THIS episode actually run? `runEnd` is the server's word (SMASHED / TIME / CAUGHT).
 * The vis-log half is `recap.hadRun`. Either one is enough; neither is "the run is in the book".
 */
export function episodeHadRun(recap, runEnd) {
  if (runEnd === 'SMASHED' || runEnd === 'TIME' || runEnd === 'CAUGHT') return true;
  if (!recap) return false;
  if (recap.hadRun) return true;
  if (recap.cameraLit || recap.failLine || recap.emptyNail || recap.tool) return true;
  if ((recap.taken?.length ?? 0) > 0) return true;
  if ((recap.alarmCount ?? 0) > 0) return true;
  return false;
}
