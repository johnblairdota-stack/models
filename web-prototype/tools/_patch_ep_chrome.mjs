import { readFileSync, writeFileSync } from 'fs';
const p = 'src/views/party-host.js';
let s = readFileSync(p, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';
const old = [
  "    const phase = frame?.phase || client.lobby?.phase || 'LOBBY';",
  "    const episode = frame?.episode || client.lobby?.episode || 1;",
  "    const recap = recapFromEvents(client.events);",
  "    const names = players();",
  "    const votes = client.ballots;",
  "    const pair = frame?.pair || {};",
  "    const show = ui.beat;",
].join(nl);
const neu = [
  "    const phase = frame?.phase || client.lobby?.phase || 'LOBBY';",
  "    const machineEp = Number(frame?.episode || client.lobby?.episode || 1) || 1;",
  "    const recap = recapFromEvents(client.events);",
  "    const names = players();",
  "    const votes = client.ballots;",
  "    const pair = frame?.pair || {};",
  "    const show = ui.beat;",
  "    /*",
  "     * ?? THE CHROME PRINTS THE EPISODE THE AUDIENCE IS WATCHING.",
  "     *",
  "     * `playEpisode` ends with `state.episode += 1` before the live expedition of that episode",
  "     * starts (same family as the phase/VERDICT lie #18 fixed). Lobby and casting correctly want",
  "     * the machine number — the next ballot. Expedition and recap must print the episode that",
  "     * `cast.ballot` / recap already named, not the one that has not begun.",
  "     */",
  "    const aired = Number(recap?.episode);",
  "    const episode = (show === 'expedition' || show === 'recap')",
  "      ? (Number.isFinite(aired) && aired > 0 ? aired : Math.max(1, machineEp - 1))",
  "      : machineEp;",
].join(nl);
if (!s.includes(old)) { console.error('missing'); process.exit(1); }
writeFileSync(p, s.replace(old, neu));
console.log('ok');