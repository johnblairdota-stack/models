#!/usr/bin/env node
/**
 * Verifies the destruction state machine against the rules in RunRobotRun/README.md.
 * Logic, not looks — so this is worth trusting on its own, unlike a screenshot.
 *
 *   node harness/test-wall.mjs
 */

import { WallState, WallField, STAGE_DEFS, FINAL_STAGE, STAGE } from '../src/destruction/wall.js';

let pass = 0, fail = 0;
const results = [];

function t(name, fn) {
  try { fn(); pass++; results.push(`  ok   ${name}`); }
  catch (e) { fail++; results.push(`  FAIL ${name}\n         ${e.message}`); }
}
function eq(a, b, msg = '') {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg} expected ${B}, got ${A}`);
}
function ok(v, msg = 'expected truthy') { if (!v) throw new Error(msg); }
function server(o = {}) { return new WallState({ authority: true, ...o }); }

// ---------------------------------------------------------------- the two core rules
t('rule 1 — layer i is visible when i >= currentStage', () => {
  const w = server();
  for (let stage = 0; stage <= FINAL_STAGE; stage++) {
    w.setStage(stage);
    for (let i = 0; i < FINAL_STAGE; i++) eq(w.isLayerVisible(i), i >= stage, `stage ${stage} layer ${i}:`);
  }
});

t('rule 2 — layer i owns collision only when i == currentStage', () => {
  const w = server();
  for (let stage = 0; stage <= FINAL_STAGE; stage++) {
    w.setStage(stage);
    let owners = 0;
    for (let i = 0; i < FINAL_STAGE; i++) if (w.layerOwnsCollision(i)) owners++;
    // exactly one owner at every standing stage, and none once open
    eq(owners, stage < FINAL_STAGE ? 1 : 0, `stage ${stage} collision owners:`);
  }
});

t('at the final stage no layer is visible and the wall stops blocking', () => {
  const w = server();
  w.setStage(FINAL_STAGE);
  for (let i = 0; i < FINAL_STAGE; i++) eq(w.isLayerVisible(i), false, `layer ${i}:`);
  eq(w.blocksMovement(), false);
  eq(w.isOpen, true);
});

// ---------------------------------------------------------------- five distinct stages
t('there are exactly five stages, named per the spec', () => {
  eq(STAGE_DEFS.length, 5);
  eq(STAGE_DEFS.map((d) => d.name), ['wallpaper', 'plaster', 'lath', 'beam', 'open']);
  eq(STAGE.OPEN, 4);
});

t('shots pass through the beam stage but the beams remain damageable', () => {
  const w = server({ stage: STAGE.BEAM });
  eq(w.blocksProjectile(), false, 'beams should not stop shots:');
  eq(w.blocksLineOfSight(), false, 'beams should not block sight:');
  eq(w.isDamageable(), true, 'beams must still be a valid target:');
  eq(w.blocksMovement(), true, 'beams still stop a body:');
});

t('lath is the first climbable stage', () => {
  eq(server({ stage: STAGE.WALLPAPER }).isClimbable(), false);
  eq(server({ stage: STAGE.PLASTER }).isClimbable(), false);
  eq(server({ stage: STAGE.LATH }).isClimbable(), true);
  eq(server({ stage: STAGE.BEAM }).isClimbable(), true);
});

// ---------------------------------------------------------------- damage behaviour
t('damage below the stage health does not change stage', () => {
  const w = server();
  const r = w.applyDamage(STAGE_DEFS[0].health - 1);
  eq(r.changed, false);
  eq(w.stage, 0);
  eq(w.stageHealth, 1);
});

t('damage equal to the stage health advances exactly one stage', () => {
  const w = server();
  const r = w.applyDamage(STAGE_DEFS[0].health);
  eq(r.changed, true);
  eq(r.to, 1);
  eq(r.stagesCrossed, [0]);
  eq(w.stageHealth, STAGE_DEFS[1].health);
});

t('overkill carries through into later stages instead of being discarded', () => {
  const w = server();
  const total = STAGE_DEFS[0].health + STAGE_DEFS[1].health + 10;
  const r = w.applyDamage(total);
  eq(r.to, 2, 'should have crossed two stages:');
  eq(r.stagesCrossed, [0, 1]);
  eq(w.stageHealth, STAGE_DEFS[2].health - 10, 'remainder should bite into stage 2:');
});

t('one enormous hit opens the wall and reports the leftover', () => {
  const w = server();
  const r = w.applyDamage(100000);
  eq(w.stage, FINAL_STAGE);
  eq(r.stagesCrossed, [0, 1, 2, 3]);
  ok(r.overkill > 0, 'leftover damage should be reported');
});

t('incremental damage and one big hit reach the same stage — repeatable', () => {
  const a = server(), b = server();
  const total = STAGE_DEFS.slice(0, 3).reduce((s, d) => s + d.health, 0);
  b.applyDamage(total);
  for (let i = 0; i < total; i++) a.applyDamage(1);
  eq(a.stage, b.stage, 'stage should not depend on how the damage arrived:');
});

t('damaging an already-open wall is a no-op, not an error', () => {
  const w = server({ stage: FINAL_STAGE });
  const r = w.applyDamage(500);
  eq(r.changed, false);
  eq(w.stage, FINAL_STAGE);
});

t('zero, negative and NaN damage are ignored', () => {
  const w = server();
  for (const bad of [0, -50, NaN, Infinity, undefined]) {
    eq(w.applyDamage(bad).changed, false, `damage ${bad}:`);
  }
  eq(w.stageHealth, STAGE_DEFS[0].health);
});

// ---------------------------------------------------------------- authority
t('a client cannot mutate its own wall', () => {
  const c = new WallState({ authority: false });
  eq(c.applyDamage(99999).changed, false, 'applyDamage:');
  eq(c.setStage(3), false, 'setStage:');
  eq(c.advanceStage(), false, 'advanceStage:');
  eq(c.reset(), false, 'reset:');
  eq(c.stage, 0, 'client stage must be untouched:');
});

t('a client CAN be driven by an authoritative sync, including skipped stages', () => {
  const c = new WallState({ authority: false });
  let seen = null;
  c.onStageChange((stage, info) => { seen = { stage, info }; });
  eq(c.syncStage(3), true);
  eq(c.stage, 3);
  eq(seen.info.authoritative, false, 'sync must be flagged non-authoritative:');
  eq(seen.info.crossed, [0, 1, 2], 'a skipped sync still reports what it crossed:');
});

t('a late joiner lands in the right state from a snapshot alone', () => {
  const s = new WallField({ authority: true });
  for (const id of ['a', 'b', 'c']) s.add(id);
  s.damage('a', 100000);
  s.damage('b', STAGE_DEFS[0].health);

  const joiner = new WallField({ authority: false });
  for (const id of ['a', 'b', 'c']) joiner.add(id);
  joiner.applySnapshot(s.snapshot());

  eq(joiner.get('a').stage, FINAL_STAGE);
  eq(joiner.get('b').stage, 1);
  eq(joiner.get('c').stage, 0);
});

t('the wire form carries stage only — never stageHealth', () => {
  const w = server();
  w.applyDamage(10);
  eq(Object.keys(w.serialize()).sort(), ['id', 'stage']);
});

// ---------------------------------------------------------------- notifications
t('stage change fires once per change, with the from-stage', () => {
  const w = server();
  const events = [];
  w.onStageChange((stage, info) => events.push([info.from, stage]));
  w.applyDamage(STAGE_DEFS[0].health);
  w.applyDamage(STAGE_DEFS[1].health);
  eq(events, [[0, 1], [1, 2]]);
});

t('a multi-stage hit fires ONE event, not one per stage', () => {
  const w = server();
  let n = 0;
  w.onStageChange(() => n++);
  w.applyDamage(STAGE_DEFS[0].health + STAGE_DEFS[1].health);
  eq(n, 1, 'one authoritative change = one notification:');
});

t('no event when nothing changed', () => {
  const w = server();
  let n = 0;
  w.onStageChange(() => n++);
  w.applyDamage(1);
  w.setStage(0);
  eq(n, 0);
});

t('reset returns to stage 0 and restores full health', () => {
  const w = server();
  w.applyDamage(100000);
  w.reset();
  eq(w.stage, 0);
  eq(w.stageHealth, STAGE_DEFS[0].health);
});

// ---------------------------------------------------------------- field
t('field reports a stage histogram', () => {
  const f = new WallField({ authority: true });
  for (let i = 0; i < 5; i++) f.add('w' + i);
  f.damage('w0', 100000);
  f.damage('w1', 100000);
  const s = f.stats();
  eq(s.total, 5);
  eq(s.byStage[FINAL_STAGE], 2);
  eq(s.byStage[0], 3);
});

t('field forwards every panel change to one listener', () => {
  const f = new WallField({ authority: true });
  f.add('x'); f.add('y');
  const hits = [];
  f.onAnyStageChange((w, stage) => hits.push([w.id, stage]));
  f.damage('x', 100000);
  f.damage('y', STAGE_DEFS[0].health);
  eq(hits, [['x', FINAL_STAGE], ['y', 1]]);
});

// ----------------------------------------------------------------
console.log('\nwall destruction state machine\n' + results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
