/**
 * The Desk — verify-gate tests. Run: npm run desk:test  (node --test)
 *
 * What is locked here:
 *  - Done is unreachable by moving a card (server rejects lane:"done").
 *  - Verify demands owner + route + a registered check + that check passing.
 *  - Checks read the real repo / run real scripts, not board state.
 *  - A Done card whose check regresses is demoted on re-verify.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { specCameraLag, verdictAgrees, verdictOnWire, smashTargetGate } from '../checks.mjs';
import { createStore, DeskError } from '../store.mjs';
import { startDesk } from '../server.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function tmpRoot() { return mkdtemp(join(tmpdir(), 'desk-')); }

/* ---------- checks: pure + fixture semantics ---------- */

test('verdictAgrees: mismatch fails, either resolution passes', () => {
  assert.equal(verdictAgrees(['vote', 'execution'], ['vote', 'execution', 'verdict']), false);
  assert.equal(verdictAgrees(['vote', 'execution', 'verdict'], ['vote', 'execution', 'verdict']), true);
  assert.equal(verdictAgrees(['vote', 'execution'], ['vote', 'execution']), true);
});

test('specCameraLag: fails while the doc sells phone first-person', async () => {
  const root = await tmpRoot();
  await mkdir(join(root, 'docs', 'design'), { recursive: true });
  const doc = join(root, 'docs', 'design', 'party-loop.md');

  await writeFile(doc, '# spec\n- Phone first-person + touch.\n');
  assert.equal((await specCameraLag(root)).pass, false);

  await writeFile(doc, '# spec\n- Phone is a controller (D13). TV holds the runner camera.\n');
  assert.equal((await specCameraLag(root)).pass, true);

  await writeFile(doc, '# spec\n- Phone is a controller. TV holds the runner camera.\n');
  const noCite = await specCameraLag(root);
  assert.equal(noCite.pass, false, 'deleting the line without citing D13 must still fail');
});

test('smashTargetGate: needs chain entry + file + exit 0', async () => {
  const root = await tmpRoot();
  await mkdir(join(root, 'harness'), { recursive: true });

  await writeFile(join(root, 'package.json'), JSON.stringify({
    scripts: { 'gates:party': 'node harness/vote-table.mjs && node harness/task-deck.mjs' },
  }));
  assert.equal((await smashTargetGate(root)).pass, false, 'no gate in chain');

  await writeFile(join(root, 'package.json'), JSON.stringify({
    scripts: { 'gates:party': 'node harness/vote-table.mjs && node harness/smash-target.mjs' },
  }));
  assert.equal((await smashTargetGate(root)).pass, false, 'chained but missing on disk');

  await writeFile(join(root, 'harness', 'smash-target.mjs'), 'process.exit(0);\n');
  assert.equal((await smashTargetGate(root)).pass, true, 'chained + exists + green');

  await writeFile(join(root, 'harness', 'smash-target.mjs'), 'process.exit(3);\n');
  const red = await smashTargetGate(root);
  assert.equal(red.pass, false, 'a red gate is not Done');
  assert.match(red.detail, /exited 3/);
});

test('checks run against the real repo and return verdicts', async () => {
  for (const check of [specCameraLag, verdictOnWire, smashTargetGate]) {
    const r = await check(REPO_ROOT);
    assert.equal(typeof r.pass, 'boolean');
    assert.equal(typeof r.detail, 'string');
    assert.ok(r.detail.length > 0);
  }
});

/* ---------- store: the Done rule ---------- */

async function storeWith(card, checks) {
  const root = await tmpRoot();
  const seed = join(root, 'cards.json');
  await writeFile(seed, JSON.stringify([card]));
  return createStore({ seedPath: seed, statePath: null, checks, repoRoot: root });
}

const BASE = {
  id: 'c1', title: 't', pitch: 'p', evidence: [], doneMeans: 'd',
  lane: 'verify', route: 'game', owner: 'Game', check: 'fake', confidence: 'verified',
};

test('move() can never reach done', async () => {
  const store = await storeWith({ ...BASE }, {});
  await assert.rejects(store.move('c1', 'done'), (e) => e instanceof DeskError && e.status === 400);
});

test('verify fails without owner / route / registered check', async () => {
  const green = { fake: async () => ({ pass: true, detail: 'ok' }) };

  let store = await storeWith({ ...BASE, owner: '' }, green);
  let r = await store.verify('c1');
  assert.equal(r.pass, false);
  assert.equal(r.requirements.find((q) => q.name === 'owner').pass, false);
  assert.equal(r.card.lane, 'verify', 'stays out of done');

  store = await storeWith({ ...BASE, route: null }, green);
  r = await store.verify('c1');
  assert.equal(r.requirements.find((q) => q.name === 'route').pass, false);

  store = await storeWith({ ...BASE, check: null }, green);
  r = await store.verify('c1');
  assert.equal(r.requirements.find((q) => q.name === 'check-registered').pass, false);
});

test('verify: passing check earns done; regression demotes it', async () => {
  let verdict = { pass: true, detail: 'green' };
  const store = await storeWith({ ...BASE }, { fake: async () => verdict });

  const first = await store.verify('c1');
  assert.equal(first.pass, true);
  assert.equal(first.card.lane, 'done');

  verdict = { pass: false, detail: 'regressed' };
  const second = await store.verify('c1');
  assert.equal(second.pass, false);
  assert.equal(second.card.lane, 'verify', 'done is continuously earned');
});

test('a crashing check is a failing check', async () => {
  const store = await storeWith({ ...BASE }, { fake: async () => { throw new Error('boom'); } });
  const r = await store.verify('c1');
  assert.equal(r.pass, false);
  assert.match(r.requirements.find((q) => q.name === 'fake').detail, /boom/);
});

/* ---------- HTTP: the rule holds at the API edge ---------- */

test('HTTP: seeds load, done is rejected, verify gates the hunch card', async () => {
  const { server, port } = await startDesk({ port: 0, statePath: null });
  const base = `http://127.0.0.1:${port}`;
  try {
    const { cards } = await (await fetch(`${base}/api/cards`)).json();
    assert.equal(cards.length, 4);
    assert.ok(cards.some((c) => c.id === 'spec-camera-lag' && c.route === 'spec'));

    const push = await fetch(`${base}/api/cards/spec-camera-lag/move`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lane: 'done' }),
    });
    assert.equal(push.status, 400, 'no Done button, not even over raw HTTP');

    const verify = await (await fetch(`${base}/api/cards/host-beat-desync/verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })).json();
    assert.equal(verify.pass, false, 'a hunch with no check cannot reach Done');
    assert.equal(verify.card.lane, 'pitch');
  } finally {
    server.close();
  }
});
