#!/usr/bin/env node
/**
 * End-to-end netcode test. Starts the real server, connects real WebSocket clients, and
 * checks the properties the README says must hold:
 *
 *   - two clients watching the same wall converge on the same stage
 *   - a LATE JOINER lands in the correct state from the snapshot alone
 *   - a client that ignores every cosmetic `fx` message still converges
 *   - stageHealth never crosses the wire
 *   - a client cannot forge state: it asks the server to damage a wall, and a nonsense
 *     request changes nothing
 *   - losing all four limbs downs a player and feeds the hunter, which grows
 *
 *   node harness/test-net.mjs
 */

import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WallField, STAGE_DEFS, FINAL_STAGE } from '../src/destruction/wall.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5187;

let pass = 0, fail = 0;
const lines = [];
function t(name, cond, detail = '') {
  if (cond) { pass++; lines.push(`  ok   ${name}`); }
  else { fail++; lines.push(`  FAIL ${name}${detail ? '\n         ' + detail : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- a minimal client
class Client {
  constructor(name) {
    this.name = name;
    this.walls = new WallField({ authority: false });
    this.msgs = [];
    this.fxSeen = 0;
    this.hunter = null;
    this.limbEvents = [];
    this.downed = [];
    this.ignoreFx = false;
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw);
        this.msgs.push(m);
        switch (m.t) {
          case 'welcome':
            this.id = m.you;
            for (const w of m.walls) this.walls.add(w.id, { stage: w.stage });
            this.hunter = m.hunter;
            resolve(this);
            break;
          case 'wall':
            // authoritative path — never derived from fx
            this.walls.get(m.id)?.syncStage(m.stage);
            break;
          case 'fx':
            this.fxSeen++;
            break;
          case 'hunter':
            this.hunter = { ...this.hunter, stage: m.stage, absorbed: m.absorbed };
            break;
          case 'limb': this.limbEvents.push(m); break;
          case 'down': this.downed.push(m.id); break;
          case 'snapshotWalls':
            for (const w of m.walls) this.walls.get(w.id)?.syncStage(w.stage);
            break;
        }
      });
      this.ws.on('error', reject);
    });
  }
  send(t, data = {}) { this.ws.send(JSON.stringify({ t, ...data })); }
  stage(id) { return this.walls.get(id)?.stage; }
  close() { this.ws.close(); }
}

// ---------------------------------------------------------------- run
const server = spawn(process.execPath, [path.join(ROOT, 'net/server.mjs'), '--port', String(PORT)],
  { stdio: ['ignore', 'pipe', 'pipe'] });
let serverOut = '';
server.stdout.on('data', (d) => { serverOut += d; });
server.stderr.on('data', (d) => { serverOut += d; });

await sleep(700);

try {
  const a = await new Client('A').connect();
  const b = await new Client('B').connect();
  b.ignoreFx = true;
  await sleep(150);

  t('two clients connect and receive distinct ids', a.id && b.id && a.id !== b.id, `${a.id} / ${b.id}`);
  t('welcome carries the full wall snapshot', a.walls.walls.size > 0, `${a.walls.walls.size} panels`);
  t('welcome carries the five stage definitions',
    a.msgs[0].stageDefs?.length === 5 && a.msgs[0].stageDefs[4].name === 'open');

  // ---- one client damages a wall; both must agree
  const target = 'w.2.1';
  const enough = STAGE_DEFS[0].health + STAGE_DEFS[1].health;
  a.send('debug', { cmd: 'damage', wall: target, amount: enough, hit: [1, 2, 3] });
  await sleep(200);

  t('damage advances the wall on the shooter', a.stage(target) === 2, `got ${a.stage(target)}`);
  t('the other client converges on the same stage', b.stage(target) === 2, `got ${b.stage(target)}`);
  t('a client ignoring every fx message still converges',
    b.stage(target) === 2 && b.fxSeen > 0, `b saw ${b.fxSeen} fx but state came from wall msgs`);

  // ---- stageHealth must never appear on the wire
  const wallMsgs = [...a.msgs, ...b.msgs].filter((m) => m.t === 'wall' || m.t === 'welcome');
  const leaked = JSON.stringify(wallMsgs).match(/stageHealth|health/i);
  t('stageHealth never crosses the wire', !leaked, leaked ? `found: ${leaked[0]}` : '');

  // ---- a client cannot forge state
  const beforeForge = a.stage('w.0.0');
  a.send('wall', { id: 'w.0.0', stage: FINAL_STAGE });          // pretend to be the server
  a.send('shoot', { wall: 'nope.does.not.exist', weapon: 'fist' }); // nonsense target
  a.send('shoot', { wall: 'w.0.0', weapon: 'howitzer' });         // weapon that does not exist
  a.send('shoot', { wall: 'w.0.0', weapon: 'oil' });              // gadget the player has not fitted
  await sleep(200);
  t('a client cannot push a wall stage directly', a.stage('w.0.0') === beforeForge, `got ${a.stage('w.0.0')}`);
  t('a nonsense wall id is ignored without crashing the server', server.exitCode === null);

  // ---- open a wall fully, then bring in a LATE JOINER
  a.send('debug', { cmd: 'damage', wall: 'w.5.2', amount: 100000 });
  await sleep(200);
  t('a big hit opens a wall outright', a.stage('w.5.2') === FINAL_STAGE, `got ${a.stage('w.5.2')}`);

  const late = await new Client('LATE').connect();
  await sleep(150);
  t('late joiner sees the opened wall', late.stage('w.5.2') === FINAL_STAGE, `got ${late.stage('w.5.2')}`);
  t('late joiner sees the partially damaged wall', late.stage(target) === 2, `got ${late.stage(target)}`);
  t('late joiner sees untouched walls as intact', late.stage('w.1.0') === 0, `got ${late.stage('w.1.0')}`);
  t('late joiner learns about existing peers',
    (late.msgs[0].peers?.length ?? 0) >= 2, `${late.msgs[0].peers?.length} peers`);

  // ---- limbs are the HP system
  for (const limb of ['armL', 'armR', 'legL']) a.send('loseLimb', { limb });
  await sleep(200);
  t('losing three limbs does not down a player',
    a.downed.length === 0 && b.limbEvents.filter((e) => !e.attached).length === 3,
    `downed=${a.downed.length}`);

  const hunterBefore = b.hunter.stage;
  a.send('loseLimb', { limb: 'legR' });
  await sleep(250);
  t('losing the fourth limb downs the player', b.downed.includes(a.id), `downed=${JSON.stringify(b.downed)}`);
  t('a downed player feeds the hunter', b.hunter.absorbed >= 1, `absorbed=${b.hunter.absorbed}`);

  // ---- reattaching as a gadget limb
  a.send('respawn', {});
  await sleep(120);
  a.send('loseLimb', { limb: 'armL' });
  await sleep(120);
  a.send('attachLimb', { limb: 'armL', gadget: 'nailgun' });
  await sleep(200);
  const fitted = b.limbEvents.filter((e) => e.attached && e.gadget === 'nailgun');
  t('a gadget limb can be fitted where a limb was lost', fitted.length === 1, `${fitted.length} events`);

  a.send('attachLimb', { limb: 'armR', gadget: 'not-a-real-gadget' });
  await sleep(150);
  const bogus = b.limbEvents.filter((e) => e.gadget === 'not-a-real-gadget');
  t('an unknown gadget name is rejected', bogus.length === 0);

  // ---- hunter growth is authoritative and reaches everyone
  a.send('debug', { cmd: 'hunterStage', stage: 3 });
  await sleep(200);
  t('hunter stage change reaches all clients',
    b.hunter.stage === 3 && late.hunter.stage === 3, `b=${b.hunter.stage} late=${late.hunter.stage}`);

  // ---- reset
  a.send('debug', { cmd: 'resetWalls' });
  await sleep(250);
  t('resetWalls returns every panel to stage 0 on every client',
    b.walls.stats().byStage[0] === b.walls.walls.size && late.walls.stats().byStage[0] === late.walls.walls.size,
    JSON.stringify(b.walls.stats()));

  a.close(); b.close(); late.close();
  await sleep(150);
  t('server survived the whole run', server.exitCode === null);
} catch (e) {
  fail++;
  lines.push(`  FAIL harness threw\n         ${e.stack || e.message}`);
} finally {
  server.kill();
}

console.log('\nnetcode (real server, real sockets)\n' + lines.join('\n'));
if (fail && serverOut) console.log('\nserver output:\n' + serverOut.split('\n').map((l) => '  ' + l).join('\n'));
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
