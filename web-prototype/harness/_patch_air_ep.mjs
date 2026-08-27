import fs from 'fs';

function once(hay, needle, repl, label) {
  if (!hay.includes(needle)) throw new Error('missing needle: ' + label);
  if (hay.includes(repl.slice(0, Math.min(40, repl.length))) && label.includes('skipif')) return hay;
  return hay.replace(needle, repl);
}

// --- room.js ---
let room = fs.readFileSync('src/party/room.js', 'utf8');
if (room.includes('airingEpisode')) {
  console.log('room.js already patched');
} else {
  room = room.replace(
    "phase: 'LOBBY', tick: 0, episode: 1, worldSeed,",
    "phase: 'LOBBY', tick: 0, episode: 1, airingEpisode: 1, worldSeed,"
  );
  room = room.replace(
    'phase: state.phase, tick: state.tick, episode: state.episode, worldSeed: state.worldSeed,',
    'phase: state.phase, tick: state.tick, episode: state.episode, airingEpisode: state.airingEpisode, worldSeed: state.worldSeed,'
  );
  const emptyGuard = "if (Array.isArray(ballots) && ballots.length === 0) return;\n    setPhase('CASTING');";
  const emptyGuardNew = `if (Array.isArray(ballots) && ballots.length === 0) return;
    /*
     * 📺 THE NUMBER ON THE TV IS THE EPISODE BEING AIRED, NOT THE COUNTER playEpisode LEAVES BEHIND.
     *
     * playEpisode resolves a whole episode synchronously and then does state.episode += 1, so by the
     * time the live mansion run starts the frame already says 2. Chrome that printed frame.episode
     * read "EXPEDITION · episode 2" while Ellie was still on the first walk — sibling of the VERDICT
     * lie #18 removed. airingEpisode holds the cast that just locked; episode keeps advancing for
     * the next ballot and the headless gates.
     */
    state.airingEpisode = state.episode;
    setPhase('CASTING');`;
  if (!room.includes(emptyGuard)) throw new Error('empty ballot guard not found');
  room = room.replace(emptyGuard, emptyGuardNew);
  room = room.replace(
    "beginCasting() { setPhase('CASTING'); },",
    `beginCasting() {
      // Next ballot is for state.episode (already bumped after the last playEpisode).
      state.airingEpisode = state.episode;
      setPhase('CASTING');
    },`
  );
  fs.writeFileSync('src/party/room.js', room);
  console.log('room.js patched');
}

// --- party-host.js ---
let host = fs.readFileSync('src/views/party-host.js', 'utf8');
if (host.includes('airingEpisode')) {
  console.log('party-host.js already patched');
} else {
  const oldEp = 'const episode = frame?.episode || client.lobby?.episode || 1;';
  const newEp = `/*
     * airingEpisode is the episode on the air right now. frame.episode has already been bumped by
     * playEpisode before the live expedition starts — printing that made the chrome say episode 2
     * on the first walk (sibling of the VERDICT lie #18 removed).
     */
    const episode = frame?.airingEpisode ?? client.lobby?.airingEpisode ?? frame?.episode ?? client.lobby?.episode ?? 1;`;
  if (!host.includes(oldEp)) throw new Error('host episode line not found');
  host = host.replace(oldEp, newEp);
  fs.writeFileSync('src/views/party-host.js', host);
  console.log('party-host.js patched');
}

// --- local.mjs ---
let local = fs.readFileSync('net/party/local.mjs', 'utf8');
if (local.includes('airingEpisode')) {
  console.log('local.mjs already patched');
} else {
  local = local.replace(
    "lobby: ['t', 'code', 'phase', 'episode', 'seats'],",
    "lobby: ['t', 'code', 'phase', 'episode', 'airingEpisode', 'seats'],"
  );
  local = local.replace(
    'episode: room.game.state.episode,',
    'episode: room.game.state.episode,\n    airingEpisode: room.game.state.airingEpisode,'
  );
  fs.writeFileSync('net/party/local.mjs', local);
  console.log('local.mjs patched');
}
