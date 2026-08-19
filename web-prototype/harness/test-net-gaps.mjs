#!/usr/bin/env node
/**
 * Supplementary net test — covers what `harness/test-net.mjs` does NOT exercise.
 *
 * `test-net.mjs` already proves (with real sockets, a real spawned server, and real
 * multi-client convergence): connect, welcome snapshot, wall damage via the `debug`
 * shortcut, fx-ignoring convergence, forged-state rejection, late joiner correctness,
 * limb loss / down / hunter absorb, gadget fitting, and resetWalls. That file is genuine
 * two-client coverage and it passes as of this run — see the accompanying report.
 *
 * This file targets the paths it leaves untouched:
 *   - `move` -> `peer` relay (position sync between two live clients) — untested upstream
 *   - real `shoot` damage (only `debug damage` was exercised upstream, which is a
 *     different code path with no weapon/attachment gate)
 *   - the weapon whitelist gap: WEAPON_DAMAGE has entries (`limbClub`, `hunterSlam`) that
 *     are neither `fist` nor in ALL_GADGETS, so the server's own gate never checks them
 *   - disconnect cleanup: does a peer actually vanish from a late joiner's snapshot, and
 *     does the other client get `leave`
 *   - an item held in a fist (`carrying`, never placed in `ground`) when its holder
 *     disconnects
 *   - a same-tick race: two clients both trying to take the same dropped limb
 *
 *   node harness/test-net-gaps.mjs
 */

import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5189;

let pass = 0, fail = 0;
const lines = [];
function t(name, cond, detail = '') {
  if (cond) { pass++; lines.push(`  ok   ${name}`); }
  else { fail++; lines.push(`  FAIL ${name}${detail ? '\n         ' + detail : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Client {
  constructor(name) {
    this.name = name;
    this.msgs = [];
    this.peers = new Map();
    this.ground = new Map();
    this.wallStage = new Map();
    this.leaveIds = [];
    this.limbTaken = [];
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
            for (const w of m.walls) this.wallStage.set(w.id, w.stage);
            for (const g of m.ground ?? []) this.ground.set(g.id, g);
            for (const p of m.peers ?? []) this.peers.set(p.id, p);
            resolve(this);
            break;
          case 'wall': this.wallStage.set(m.id, m.stage); break;
          case 'join': this.peers.set(m.id, { id: m.id, pos: m.pos, yaw: m.yaw }); break;
          case 'leave': this.leaveIds.push(m.id); this.peers.delete(m.id); break;
          case 'peer': { const p = this.peers.get(m.id); if (p) { p.pos = m.pos; p.yaw = m.yaw; } break; }
          case 'limb': if (m.dropId) this.ground.set(m.dropId, m); break;
          case 'limbTaken': this.limbTaken.push(m); this.ground.delete(m.dropId); break;
        }
      });
      this.ws.on('error', reject);
    });
  }
  send(type, data = {}) { this.ws.send(JSON.stringify({ t: type, ...data })); }
  close() { this.ws.close(); }
}

const server = spawn(process.execPath, [path.join(ROOT, 'net/server.mjs'), '--port', String(PORT)],
  { stdio: ['ignore', 'pipe', 'pipe'] });
let serverOut = '';
server.stdout.on('data', (d) => { serverOut += d; });
server.stderr.on('data', (d) => { serverOut += d; });

await sleep(700);

try {
  // ---------------------------------------------------------------- move -> peer relay
  const a = await new Client('A').connect();
  const b = await new Client('B').connect();
  await sleep(150);

  a.send('move', { pos: [3.5, 0, -1.25], yaw: 1.2 });
  await sleep(200);
  const bSeesA = b.peers.get(a.id);
  t('B receives A\'s move as a peer update', !!bSeesA && bSeesA.pos?.[0] === 3.5 && bSeesA.pos?.[2] === -1.25,
    `peer=${JSON.stringify(bSeesA)}`);

  b.send('move', { pos: [-2, 0, 4], yaw: -0.4 });
  await sleep(200);
  const aSeesB = a.peers.get(b.id);
  t('A receives B\'s move as a peer update', !!aSeesB && aSeesB.pos?.[0] === -2 && aSeesB.pos?.[2] === 4,
    `peer=${JSON.stringify(aSeesB)}`);

  // a client does NOT get its own move echoed back (broadcast excludes the sender)
  const selfEcho = a.msgs.filter((m) => m.t === 'peer' && m.id === a.id).length;
  t('a client is not sent its own movement (broadcast excludes sender)', selfEcho === 0, `echoes=${selfEcho}`);

  // ---------------------------------------------------------------- real `shoot` (not debug)
  const target = 'w.1.1';
  t('sanity: target wall starts at stage 0', a.wallStage.get(target) === 0, `got ${a.wallStage.get(target)}`);
  // fist = 14 dmg, stage 0 health = 40 -> 3 real shots cross it.
  //
  // SPACED AT THE LEGAL CADENCE, deliberately. This originally fired 3 shots 60 ms apart, which
  // only passed because the server had no rate limiting, and it began failing the moment
  // cooldowns were enforced — the limiter correctly rejected shots 2 and 3. `attack()` in
  // `src/game/player.js` self-paces fist at 0.55 s, so a 3-shots-in-120 ms burst is something no
  // honest client can produce and a correct server must refuse.
  //
  // The test's intent is "real shots damage walls", NOT "bursts are allowed", so the fix belongs
  // in the cadence. Loosening the limiter to keep this green would have meant sizing a security
  // parameter to fit a synthetic test.
  const FIST_CD_MS = 550;
  for (let i = 0; i < 3; i++) {
    a.send('shoot', { wall: target, weapon: 'fist', hit: [0, 1, 0] });
    await sleep(FIST_CD_MS + 60);
  }
  await sleep(200);
  t('three real fist shots (not debug) advance the wall past stage 0',
    a.wallStage.get(target) >= 1, `got ${a.wallStage.get(target)}`);
  t('B converges on the real-shoot result too', b.wallStage.get(target) === a.wallStage.get(target),
    `a=${a.wallStage.get(target)} b=${b.wallStage.get(target)}`);

  // ---------------------------------------------------------------- weapon whitelist gap
  // limbClub (34 dmg) and hunterSlam (46 dmg) are in WEAPON_DAMAGE but are neither 'fist'
  // nor in ALL_GADGETS, so net/server.mjs's shoot handler has no branch that gates them.
  // A is not carrying a detached limb and is not the hunter.
  const gapWall = 'w.2.2';
  t('sanity: gap-test wall starts untouched', a.wallStage.get(gapWall) === 0, `got ${a.wallStage.get(gapWall)}`);
  // one hit (34 dmg) is BELOW stage 0's 40 health, so "stage unchanged" after one hit would
  // be ambiguous — it could mean "rejected" or "accepted but insufficient to cross a stage".
  // Send two: 68 total unambiguously crosses stage 0 if the damage is being applied at all.
  a.send('shoot', { wall: gapWall, weapon: 'limbClub', hit: null });
  a.send('shoot', { wall: gapWall, weapon: 'limbClub', hit: null });
  await sleep(200);
  const afterClub = a.wallStage.get(gapWall);
  console.log(`  [defect data] stage after two unearned "limbClub" hits, 68 total dmg vs 40 stage-0 health (0 = correctly rejected): ${afterClub}`);
  t('DEFECT: "limbClub" damage should be rejected (player holds no detached limb) but is not',
    afterClub === 0, `expected stage to stay 0, got ${afterClub}`);

  a.send('shoot', { wall: gapWall, weapon: 'hunterSlam', hit: null });
  await sleep(200);
  const afterSlam = a.wallStage.get(gapWall);
  console.log(`  [defect data] stage after unearned "hunterSlam" hit (unchanged from ${afterClub} = correctly rejected): ${afterSlam}`);
  t('DEFECT: "hunterSlam" damage should be rejected (player is not the hunter) but is not',
    afterSlam === afterClub, `expected stage to stay ${afterClub}, got ${afterSlam}`);

  // ---------------------------------------------------------------- carrying + disconnect
  a.send('loseLimb', { limb: 'legL' });
  await sleep(150);
  const dropMsg = a.msgs.slice().reverse().find((m) => m.t === 'limb' && m.dropId);
  t('setup: a limb landed on the ground for the carry test', !!dropMsg?.dropId, JSON.stringify(dropMsg));
  const dropId = dropMsg.dropId;
  a.send('takeLimb', { dropId, socket: null });   // carry in a fist, not fitted
  await sleep(150);
  const carriedOk = a.limbTaken.some((m) => m.dropId === dropId && m.carried);
  t('setup: A is now carrying the dropped limb', carriedOk, JSON.stringify(a.limbTaken));

  a.close();
  await sleep(300);
  t('B is told A left', b.leaveIds.includes(a.id), `leaveIds=${JSON.stringify(b.leaveIds)}`);

  const c = await new Client('C').connect();
  await sleep(150);
  t('a fresh joiner does not see the disconnected A as a peer',
    !c.peers.has(a.id), `peers=${JSON.stringify([...c.peers.keys()])}`);
  const itemBack = [...c.ground.values()].find((g) => g.id === dropId) || c.ground.get(dropId);
  console.log(`  [defect data] limb A was carrying at disconnect, is it in C's ground snapshot: ${itemBack ? 'yes' : 'no'} (dropId=${dropId})`);
  t('DEFECT: an item held (not fitted) by a player who disconnects should return to the world, but is lost',
    !!itemBack, `dropId=${dropId} not found in C's ground snapshot — item is gone forever`);

  // ---------------------------------------------------------------- concurrent takeLimb race
  b.send('loseLimb', { limb: 'armL' });
  await sleep(150);
  const raceDrop = b.msgs.slice().reverse().find((m) => m.t === 'limb' && m.dropId);
  const raceId = raceDrop.dropId;
  const d = await new Client('D').connect();
  await sleep(100);
  // fire both requests back-to-back with no await between them — the actual race
  b.send('takeLimb', { dropId: raceId, socket: null });
  d.send('takeLimb', { dropId: raceId, socket: null });
  await sleep(250);
  // NOTE: `limbTaken` is a broadcast, so every connected client (winner, loser, and any
  // bystander) receives each grant once. Two clients racing therefore does NOT mean
  // "two entries total" — it means "does each connected client see exactly one grant for
  // this dropId", which is what the dedup-by-content check below verifies.
  const bCount = b.limbTaken.filter((m) => m.dropId === raceId).length;
  const dCount = d.limbTaken.filter((m) => m.dropId === raceId).length;
  const distinctGrants = new Set([...b.limbTaken, ...d.limbTaken]
    .filter((m) => m.dropId === raceId).map((m) => JSON.stringify(m)));
  t('two clients racing for the same dropped limb: exactly one grant, seen once by each connected client',
    bCount === 1 && dCount === 1 && distinctGrants.size === 1,
    `b saw ${bCount}, d saw ${dCount}, distinct grant contents=${distinctGrants.size} (${[...distinctGrants]})`);

  // ---------------------------------------------------------------- malformed frames don't crash it
  b.ws.send('not json at all {{{');
  b.ws.send(JSON.stringify({ noType: true }));
  b.ws.send(JSON.stringify({ t: 123 }));
  await sleep(150);
  t('malformed / typeless frames do not crash the server', server.exitCode === null);

  b.close(); c.close(); d.close();
  await sleep(150);
  t('server survived the whole run', server.exitCode === null);
} catch (e) {
  fail++;
  lines.push(`  FAIL harness threw\n         ${e.stack || e.message}`);
} finally {
  server.kill();
}

console.log('\nnetcode gaps (real server, real sockets)\n' + lines.join('\n'));
if (serverOut.trim()) console.log('\nserver output:\n' + serverOut.split('\n').map((l) => '  ' + l).join('\n'));
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
