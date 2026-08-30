/**
 * RECAP CARD — three facts from the vis log, nothing produced.
 *
 * Playcritique #1: a 20 s card of camera / taken / alarms is what six people can argue about.
 * Query the log the sockets already received. Do not wait for the Broadcast Director.
 *
 * No THREE, no DOM.
 */

/** @param {Array<{type:string, data?:object}>} events  entitled events one socket actually got */
export function recapFromEvents(events) {
  const evs = (events || []).filter((e) => e && e.type);
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
  };
}
