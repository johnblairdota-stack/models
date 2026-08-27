import { createRoom } from '../src/party/room.js';

const game = createRoom({
  count: 3,
  castSeed: 1,
  worldSeed: 1,
  send: () => {},
  emit: () => {},
});
game.start();
const living = game.state.players.map((p) => p.id);
game.dealRoles(living);
console.log('before', { episode: game.state.episode, airingEpisode: game.state.airingEpisode, phase: game.state.phase });
game.beginCasting();
game.playEpisode({
  living,
  ballots: living.map(() => ({ runner: living[0], guide: living[1] })),
});
console.log('after_playEpisode', { episode: game.state.episode, airingEpisode: game.state.airingEpisode, phase: game.state.phase });
const tv = { isTV: true, playerId: null };
const frame = game.fullFor ? null : null;
// fullFor is internal; use state + simulate chrome
const chromeEp = game.state.airingEpisode ?? game.state.episode;
console.log('WIRE_OFF_BY_ONE', game.state.episode === 2);
console.log('AIR_HONEST', chromeEp === 1);
console.log('chrome_today', `EXPEDITION · episode ${chromeEp}`);
game.beginCasting();
console.log('next_casting_air', game.state.airingEpisode === 2, game.state);
