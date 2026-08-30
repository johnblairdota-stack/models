#!/usr/bin/env node
// I1  matrix starts near 0 for every living pair
// I2  scores move only via applyObserved / on* helpers
// I3  paired + recap + nom + vote + taken leave a trail in moves[]
// I4  whisper / link are public:false — goods who were not on the pad do not move
// I5  pickNom returns null when nobody is under NOM_REASON (skip is not a hole)
// I5b a real nom tap without a reason logs nom-no-influence-reason
// I6  pickNom returns the lowest when that seat is under NOM_REASON
// I7  pickVote prefers the least-trusted nominee
// I8  dropDead removes the row and every column
// I9  a whisper helper with no target logs a hole (talk.json-only is banned)

import {
  emptyMatrix, applyObserved, onPaired, onRecap, onNominated, onVoted,
  onWhisperSent, onLinked, pickNom, pickVote, assertNomReason, dropDead, score, NOM_REASON, START,
} from './influence.mjs';

let fails = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ok  ${name}`);
  else { fails++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

const seats = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, alive: true }));

{
  console.log('I1 start near 0');
  const s = emptyMatrix(seats(3));
  check('3 living', s.living.length === 3);
  check('no self cell', s.scores.p0.p0 == null);
  check('near 0', Math.abs(s.scores.p0.p1 - START) < 1e-9);
  check('no moves yet', s.moves.length === 0);
}

{
  console.log('I2 applyObserved is the only writer');
  const s = emptyMatrix(seats(2));
  applyObserved(s, { from: 'p0', to: 'p1', delta: 0.2, action: 'test' });
  check('moved', s.scores.p0.p1 === START + 0.2);
  check('trail', s.moves[0].action === 'test' && s.moves[0].from === 'p0');
  check('stranger ignored', applyObserved(s, { from: 'ghost', to: 'p1', delta: 1, action: 'x' }) === false);
}

{
  console.log('I3 public night actions');
  const s = emptyMatrix(seats(4));
  onPaired(s, 'p0', 'p1');
  onRecap(s, 'p0', 'p1', false);
  onNominated(s, 'p2', 'p3');
  onVoted(s, 'p0', 'p3');
  check('pair both ways', s.scores.p0.p1 > START && s.scores.p1.p0 > START);
  check('recap public', s.scores.p2.p0 !== START);
  check('nom trail', s.moves.some((m) => m.action === 'nominated' && m.from === 'p2'));
  check('vote trail', s.moves.some((m) => m.action === 'voted'));
}

{
  console.log('I4 whisper / link stay pad-private');
  const s = emptyMatrix(seats(4));
  onWhisperSent(s, 'p0', 'p1', 'p2', { accuse: true });
  check('sender moved on about', s.scores.p0.p2 < START);
  check('recipient moved on about', s.scores.p1.p2 < START);
  check('bystander untouched', s.scores.p3.p2 === START);
  check('moves marked private', s.moves.every((m) => m.public === false));
  const s2 = emptyMatrix(seats(3));
  onLinked(s2, 'p0', 'p1');
  check('link both ways', s2.scores.p0.p1 > 0.4 && s2.scores.p1.p0 > 0.4);
  check('third seat still START', s2.scores.p2.p0 === START);
}

{
  console.log('I5 / I6 pickNom needs an influence reason');
  const cold = emptyMatrix(seats(3));
  const none = pickNom(cold, 'p0', ['p0', 'p1', 'p2']);
  check('no nom at START', none === null);
  check('skip is not a hole', cold.holes.length === 0);
  check('a tap without reason is the hole', assertNomReason(cold, 'p0', 'p1') === false
    && cold.holes.some((h) => h.kind === 'nom-no-influence-reason'));
  const hot = emptyMatrix(seats(3));
  applyObserved(hot, { from: 'p0', to: 'p1', delta: NOM_REASON - START - 0.05, action: 'accuse' });
  check('noms the low seat', pickNom(hot, 'p0', ['p0', 'p1', 'p2']) === 'p1');
  check('explained tap is clean', assertNomReason(hot, 'p0', 'p1') === true && hot.holes.length === 0);
}

{
  console.log('I7 pickVote');
  const s = emptyMatrix(seats(4));
  applyObserved(s, { from: 'p0', to: 'p2', delta: -0.5, action: 'accuse' });
  applyObserved(s, { from: 'p0', to: 'p1', delta: 0.2, action: 'vouch' });
  check('votes the least trusted nominee', pickVote(s, 'p0', ['p1', 'p2']) === 'p2');
}

{
  console.log('I8 dropDead');
  const s = emptyMatrix(seats(3));
  dropDead(s, 'p1');
  check('row gone', s.scores.p1 == null);
  check('column gone', s.scores.p0.p1 == null);
  check('living', s.living.join() === 'p0,p2');
}

{
  console.log('I9 whisper without a pad target is a hole');
  const s = emptyMatrix(seats(2));
  const ok = onWhisperSent(s, 'p0', null, 'p1');
  check('rejected', ok === false);
  check('hole', s.holes.some((h) => h.kind === 'whisper-no-target'));
}

if (fails) {
  console.error(`\ninfluence-gate: ${fails} failed`);
  process.exit(1);
}
console.log('\ninfluence-gate: ok');
