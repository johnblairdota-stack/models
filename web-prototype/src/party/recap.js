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
  const pair = evs.filter((e) => e.type === 'cast.pair').at(-1);
  const ballot = evs.filter((e) => e.type === 'cast.ballot').at(-1);
  return {
    cameraLit: cameras.length > 0,
    camera: cameras.at(-1)?.data?.camera ?? null,
    taken: taken.map((e) => ({ id: e.data?.id, seat: e.data?.seat })),
    alarmCount: alarms.length,
    missCount: misses.length,
    runner: pair?.data?.runner ?? ballot?.data?.runner ?? null,
    guide: pair?.data?.guide ?? ballot?.data?.guide ?? null,
    episode: ballot?.data?.episode ?? cameras[0]?.data?.episode ?? null,
  };
}
