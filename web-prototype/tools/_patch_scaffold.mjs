import { readFileSync, writeFileSync } from 'fs';

let room = readFileSync('src/party/room.js', 'utf8');
const oldSig = "function playEpisode({ takeRunner = false, hunterRoom = null, ballots = null, votes = null, nominations = null, living: livingOpt = null } = {}) {";
const newSig = "function playEpisode({ takeRunner = false, hunterRoom = null, ballots = null, votes = null, nominations = null, living: livingOpt = null, scaffold = true } = {}) {";
if (!room.includes(oldSig)) throw new Error('sig missing');
room = room.replace(oldSig, newSig);

const start = room.indexOf("    setPhase('EXPEDITION');\r\n    // One miss and one alarm");
if (start < 0) throw new Error('start missing');
const endMarker = "\r\n    broadcast();";
const end = room.indexOf(endMarker, start);
if (end < 0) throw new Error('broadcast missing');
const after = end + endMarker.length;

const nl = '\r\n';
const replacement = [
  "    setPhase('EXPEDITION');",
  "    /*",
  "     * LIVE NIGHT PASSES scaffold: false. The miss/alarm/camera-lit stubs exist so",
  "     * party-anon gates and party-sim have a failure of each kind and a win path — they are",
  "     * not events that happened in the house. On a live Send-them-in the TV was printing",
  "     * CAMERAS 2/1 · ALARMS 2 before anyone swung (playcritique overnight post-#19). The",
  "     * mansion reports real cameras and alarms; inventing them here is a lie on the shared",
  "     * screen. Gates omit the flag and keep the scaffold (default true).",
  "     */",
  "    if (scaffold) {",
  "      // One miss and one alarm, so party-anon A0's arm has a failure of each kind to look at.",
  "      record(makeEvent('task.miss', VIS.PUBLIC, { kind: 'call', room: 'east', phaseTick: state.tick, loudness: 0.62 }));",
  "      record(makeEvent('panel.alarm', VIS.PUBLIC, { kind: 'panel', room: 'east', phaseTick: state.tick, loudness: 1.25 }));",
  "      // ATTRIBUTION EXISTS FROM THE FIRST EPISODE AND IS SEALED UNTIL THE REUNION.",
  "      record(makeEvent('noise.emitted', VIS.SEALED, { causedBy: runner.id, loud: 1.25, room: 'east' }));",
  "      record(makeEvent('noise.emitted', VIS.SEALED, { causedBy: guide.id, loud: 0.62, room: 'east' }));",
  "      state.incident.alarms += 2;",
  "",
  "      // Camera lights when the expedition SURVIVES — gate/sim path only.",
  "      if (!takeRunnerThisEpisode) {",
  "        state.cameras.unlocked += 1;",
  "        record(makeEvent('run.camera_lit', VIS.PUBLIC, { camera: state.cameras.unlocked, episode: state.episode }));",
  "      }",
  "    }",
  "    broadcast();",
].join(nl);

room = room.slice(0, start) + replacement + room.slice(after);
writeFileSync('src/party/room.js', room);
console.log('room.js ok');

let local = readFileSync('net/party/local.mjs', 'utf8');
const needle = [
  "    room.game.playEpisode({",
  "      ...(msg.opts || {}),",
  "      ...(votes.length ? { ballots: votes } : {}),",
  "      ...(seated.length ? { living: seated } : {}),",
  "    });",
].join(local.includes("playEpisode({\r\n") ? '\r\n' : '\n');
const insert = [
  "    room.game.playEpisode({",
  "      ...(msg.opts || {}),",
  "      ...(votes.length ? { ballots: votes } : {}),",
  "      ...(seated.length ? { living: seated } : {}),",
  "      // Live night: mansion reports cameras/alarms — do not invent gate scaffold on the TV.",
  "      scaffold: false,",
  "    });",
].join(local.includes("playEpisode({\r\n") ? '\r\n' : '\n');
if (!local.includes(needle)) {
  console.log('needle missing, sniff:');
  const i = local.indexOf('room.game.playEpisode');
  console.log(JSON.stringify(local.slice(i, i + 220)));
  throw new Error('call missing');
}
local = local.replace(needle, insert);
writeFileSync('net/party/local.mjs', local);
console.log('local.mjs ok');
