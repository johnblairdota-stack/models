#!/usr/bin/env node
/** _room-probe7 — CRITIC PROBE. The evening's wire budget, from measured frame sizes. */
import { sessionSeconds, SECONDS, PHASE, orderFor, EPISODE_CAP } from '../../src/party/phases.js';
import { TICK_MS } from '../../net/party/show.mjs';

const S = sessionSeconds(EPISODE_CAP);              // seconds, premiere + 5 episodes + reunion
const PING_HZ = 1000 / TICK_MS;
const PING_B = 31, PONG_B = 30, STATE_B = 1411, GUIDE_B = 1779, ROSTER_B = 769;
// A 31-byte JSON payload costs ~4 B of WS framing, 52 B of TCP/IP and ~36 B of 802.11 → ~120 B of air.
const AIR = (payload) => payload + 4 + 52 + 36;

console.log(`AN EVENING: ${(S/60).toFixed(1)} min, 8 phones + 1 television, one access point\n`);
const pings = PING_HZ * S;
console.log('HEARTBEAT (net/party/show.mjs `beat`, every TICK_MS = ' + TICK_MS + ' ms)');
console.log(`  per phone : ${pings} pings down + ${pings} pongs up = ${(2*pings/S).toFixed(0)} msg/s, ${((pings*PING_B+pings*PONG_B)/1024).toFixed(0)} KB of payload`);
console.log(`  the room  : ${(9*PING_HZ + 8*PING_HZ).toFixed(0)} frames/s on the channel, ${(((9*pings*AIR(PING_B))+(8*pings*AIR(PONG_B)))/1048576).toFixed(1)} MB of air over the evening`);

// phase-change frames
let phaseChanges = 1;
for (let ep=1; ep<=EPISODE_CAP; ep++) phaseChanges += orderFor(ep).length;
phaseChanges += 1;   // the reunion
console.log('\nGAME TRAFFIC (a frame is pushed on a phase change and on every tap by anybody)');
console.log(`  phase changes in a full show      : ${phaseChanges} → ${phaseChanges} frames per phone (${(phaseChanges*STATE_B/1024).toFixed(0)} KB)`);
// input-driven: casting 8 confirms, reckoning up to 8 noms, vote 8 (+ changes)
const eps = EPISODE_CAP;
const taps = eps*8 /*cast*/ + (eps-1)*8 /*nominate*/ + (eps-1)*8 /*vote*/ + eps*2 /*calls, moves*/;
console.log(`  taps in a show, one each, no changes of mind: ${taps} → each one broadcasts to all 9 sockets`);
console.log(`  = ${taps*9} frames, ${(taps*9*STATE_B/1048576).toFixed(2)} MB for the room; ${(taps*STATE_B/1024).toFixed(0)} KB arriving on each phone`);
console.log('\nTHE GUIDE, DURING ONE 90 s EXPEDITION (measured: 450 frames of ' + GUIDE_B + ' B)');
console.log(`  ${(450*GUIDE_B/1024).toFixed(0)} KB to ONE phone in 90 s = ${(450*GUIDE_B/90/1024).toFixed(1)} KB/s, 5 msg/s`);
console.log(`  of which the static floor plan, resent unchanged 450 times: ${(450*425/1024).toFixed(0)} KB (${(425/GUIDE_B*100).toFixed(0)}% of every frame)`);
console.log(`  over ${EPISODE_CAP} episodes: ${(EPISODE_CAP*450*GUIDE_B/1048576).toFixed(1)} MB, and each frame rebuilds the guide's controls with innerHTML`);

console.log('\nSHARE OF MESSAGES A PHONE RECEIVES THAT ARE THE HEARTBEAT');
const gameMsgs = phaseChanges + taps + 20;
console.log(`  ${pings} pings vs ~${gameMsgs} game messages → ${(100*pings/(pings+gameMsgs)).toFixed(1)}% of the wire is liveness`);
console.log(`  ...and nothing reads the pong except a median for /report. There is no lastPong, no`);
console.log('     setKeepAlive, and no path by which a phone that stops answering is marked not live.');
