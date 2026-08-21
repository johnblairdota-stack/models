/** THROWAWAY PROBE — play a whole show; expose real projections + real per-socket log filter. */
import { createSession, CALL, MOVE_CHOICE } from '../../src/party/session.js';
import { PHASE } from '../../src/party/phases.js';
import { project } from '../../net/party/entitle.js';

export function play({ count = 8, castSeed = 1, worldSeed = 2, taps, stepMs = 1000, maxSteps = 6000, onPhase = null } = {}) {
  const frames = new Map(); const events = new Map();
  const push = (m, id, v) => { if (!m.has(id)) m.set(id, []); m.get(id).push(v); };
  const s = createSession({
    count, castSeed, worldSeed,
    send: (id, f) => push(frames, id, f),
    emit: (id, e) => push(events, id, e),
  });
  let now = 0; s.start(now);
  let seen = -1;
  const beats = [];
  const capture = () => {
    const b = { phase: s.state.phase, ep: s.state.episode, tick: s.state.tick, seconds: s.state.clock.seconds, view: {} };
    for (const sock of s.sockets) {
      const full = s.unprojected(sock.id);
      const ctx = { playerId: sock.playerId, alignment: sock.alignment, isTV: sock.isTV, seatRole: sock.seatRole };
      b.view[sock.id] = project(full, ctx).frame;
    }
    beats.push(b); if (onPhase) onPhase(s, b);
  };
  for (let i = 0; i < maxSteps; i++) {
    if (s.state.tick !== seen) { seen = s.state.tick; capture(); }
    if (taps) taps(s, (p, m) => s.input(p, m), now);
    now += stepMs;
    s.tick(now);
    if (s.state.phase === PHASE.REUNION) break;
  }
  if (s.state.tick !== seen) capture();
  return { s, frames, events, beats, now };
}
export { CALL, MOVE_CHOICE, PHASE };
