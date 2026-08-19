#!/usr/bin/env node
/**
 * THE BONE RESOLVER'S CONTROL.
 *
 *   node harness/_two3_bones.mjs
 *
 * WHY THIS EXISTS AS A TEST AND NOT AS A LOOK. `rrwDarkLimbWeights` decides which parts of the
 * character wear the dark structural material, and EVERY WAY IT CAN BE WRONG STILL RENDERS A
 * PLAUSIBLE TWO-TONE ROBOT. Darken the chest instead of the waist and you get a robot in a dark
 * vest; take the shoulders with the arms and you get one in a dark shirt. Neither trips a
 * threshold, neither looks broken in a thumbnail, and the scoreboard's dark-fraction columns go
 * UP in both cases — so the numbers actively endorse the mistake.
 *
 * The specific trap this guards is real and was hit while writing the resolver. The two rigs in
 * this project number their spines in OPPOSITE directions:
 *
 *     this character   Hips -> Spine02 -> Spine01 -> Spine     `Spine` is the CHEST
 *     Mixamo           Hips -> Spine   -> Spine1  -> Spine2    `Spine` is the WAIST
 *
 * So matching /spine$/i for "the waist" darkens the chest plate on this character — the one
 * surface the round is forbidden to touch, because the 4Humanity wordmark is on it. The
 * resolver picks the SHALLOWEST spine bone instead, which is the one nearest the hips under
 * either convention. Case 3 below is the control: it asserts the naive rule and FAILS, so the
 * passing cases above it are known to be testing something.
 */
import { rrwFamilyWeights, RRW_FAM } from '../src/materials/surfaces/robot.js';

/** Build bone-like objects with real `.parent` chains from a [name, parentName] list. */
function rig(pairs) {
  const byName = new Map();
  for (const [n] of pairs) byName.set(n, { name: n, parent: null });
  for (const [n, p] of pairs) if (p) byName.get(n).parent = byName.get(p);
  return pairs.map(([n]) => byName.get(n));
}

// The real rig, hierarchy read out of the GLB's glTF JSON chunk.
const MESHY = rig([
  ['Armature', null], ['Hips', 'Armature'],
  ['Spine02', 'Hips'], ['Spine01', 'Spine02'], ['Spine', 'Spine01'],
  ['neck', 'Spine'], ['Head', 'neck'], ['head_end', 'Head'], ['headfront', 'Head'],
  ['LeftShoulder', 'Spine'], ['LeftArm', 'LeftShoulder'], ['LeftForeArm', 'LeftArm'], ['LeftHand', 'LeftForeArm'],
  ['RightShoulder', 'Spine'], ['RightArm', 'RightShoulder'], ['RightForeArm', 'RightArm'], ['RightHand', 'RightForeArm'],
  ['LeftUpLeg', 'Hips'], ['LeftLeg', 'LeftUpLeg'], ['LeftFoot', 'LeftLeg'], ['LeftToeBase', 'LeftFoot'],
  ['RightUpLeg', 'Hips'], ['RightLeg', 'RightUpLeg'], ['RightFoot', 'RightLeg'], ['RightToeBase', 'RightFoot'],
]);

const MIXAMO = rig([
  ['mixamorig:Hips', null],
  ['mixamorig:Spine', 'mixamorig:Hips'], ['mixamorig:Spine1', 'mixamorig:Spine'], ['mixamorig:Spine2', 'mixamorig:Spine1'],
  ['mixamorig:Neck', 'mixamorig:Spine2'], ['mixamorig:Head', 'mixamorig:Neck'],
  ['mixamorig:LeftShoulder', 'mixamorig:Spine2'], ['mixamorig:LeftArm', 'mixamorig:LeftShoulder'],
  ['mixamorig:LeftForeArm', 'mixamorig:LeftArm'], ['mixamorig:LeftHand', 'mixamorig:LeftForeArm'],
  ['mixamorig:LeftHandIndex1', 'mixamorig:LeftHand'],
  ['mixamorig:LeftUpLeg', 'mixamorig:Hips'], ['mixamorig:LeftLeg', 'mixamorig:LeftUpLeg'],
  ['mixamorig:LeftFoot', 'mixamorig:LeftLeg'],
]);

let failures = 0;
const check = (label, got, want) => {
  const g = [...got].sort().join(', '), w = [...want].sort().join(', ');
  const ok = g === w;
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) { console.log(`          got:  ${g || '(none)'}`); console.log(`          want: ${w || '(none)'}`); }
};

/** Bones carrying a non-zero weight in one family channel, by name. */
const famNames = (bones, ch) => {
  const w = rrwFamilyWeights(bones);
  return bones.filter((b, i) => w[i * 4 + ch] !== 0).map((b) => b.name);
};
/** ...and the SIGNED inner-face channel, rendered as `name:+1` / `name:-1`. */
const innerSigned = (bones) => {
  const w = rrwFamilyWeights(bones);
  return bones.filter((b, i) => w[i * 4 + RRW_FAM.INNER] !== 0)
    .map((b) => `${b.name}:${w[bones.indexOf(b) * 4 + RRW_FAM.INNER] > 0 ? '+1' : '-1'}`);
};

console.log('\nCASE 1 — the shipped rig, per `docs/design/player-material-spec.md`.');
check('meshy CHROME set = upper arms + the waist (Spine02)', famNames(MESHY, RRW_FAM.CHROME), [
  'LeftArm', 'RightArm', 'Spine02',
]);
check('meshy DARK set = the neck alone', famNames(MESHY, RRW_FAM.DARK), ['neck']);
check('meshy RUBBER set = feet and toes', famNames(MESHY, RRW_FAM.RUBBER), [
  'LeftFoot', 'LeftToeBase', 'RightFoot', 'RightToeBase',
]);
check('meshy INNER set = the thighs, signed left +1 / right -1', innerSigned(MESHY), [
  'LeftUpLeg:+1', 'RightUpLeg:-1',
]);

console.log('\nCASE 1b — THE REGRESSION THIS ROUND EXISTS TO FIX. The forearms and hands are the');
console.log('spec\'s "most visible error"; they must now carry NO family at all, i.e. white plate.');
const meshyAny = MESHY.filter((b, i) => {
  const w = rrwFamilyWeights(MESHY);
  return w[i * 4] || w[i * 4 + 1] || w[i * 4 + 2] || w[i * 4 + 3];
}).map((b) => b.name);
check('forearms and hands wear nothing', meshyAny.filter((n) => /ForeArm|Hand/.test(n)), []);
console.log('\nCASE 1c — and the SHINS stay white: `LeftLeg` tokenises to " left leg " and would');
console.log('match a loose / leg / rule, which would chrome the brightest region on the figure.');
check('shins wear nothing', meshyAny.filter((n) => /^(Left|Right)Leg$/.test(n)), []);

console.log('\nCASE 2 — Mixamo, whose spine numbering is the REVERSE. The waist is bare `Spine`.');
check('mixamo CHROME set', famNames(MIXAMO, RRW_FAM.CHROME), [
  'mixamorig:LeftArm', 'mixamorig:Spine',
]);
check('mixamo RUBBER set', famNames(MIXAMO, RRW_FAM.RUBBER), ['mixamorig:LeftFoot']);

console.log('\nCASE 3 — THE CONTROL. This asserts what the NAIVE /spine$/i rule would have produced');
console.log('on the shipped rig, i.e. CHROME ON THE CHEST and the waist left white. It MUST fail;');
console.log('a run in which it passes means the resolver has regressed to matching by name.');
check('naive rule chromes the chest (EXPECTED TO FAIL)', famNames(MESHY, RRW_FAM.CHROME), [
  'LeftArm', 'RightArm', 'Spine',
]);

console.log('\nCASE 3b — THE SECOND CONTROL, and it guards an ORDERING rather than a name.');
console.log('" left fore arm " matches / arm / as well as / fore arm /, so testing the upper arm');
console.log('BEFORE the forearm paints the forearms chrome — the round-1 defect, reintroduced.');
console.log('This asserts that wrong result and MUST fail.');
check('upper-arm-first ordering chromes the forearms (EXPECTED TO FAIL)',
  famNames(MESHY, RRW_FAM.CHROME),
  ['LeftArm', 'LeftForeArm', 'RightArm', 'RightForeArm', 'Spine02']);

console.log('\nCASE 4 — an unskinned / boneless caller resolves to an all-zero mask, which is an');
console.log('exact revert. This is what the procedural robot and the three hunter stages get.');
check('empty rig chrome', famNames([], RRW_FAM.CHROME), []);
check('empty rig rubber', famNames([], RRW_FAM.RUBBER), []);

console.log('\nCASE 5 — each family has its own master, so a rig that resolves oddly can lose one');
console.log('family without losing the rest. Zeroing the feet must not touch the upper arms.');
{
  const w = rrwFamilyWeights(MESHY, { feet: 0 });
  const rubber = MESHY.filter((b, i) => w[i * 4 + RRW_FAM.RUBBER] !== 0).map((b) => b.name);
  const chrome = MESHY.filter((b, i) => w[i * 4 + RRW_FAM.CHROME] !== 0).map((b) => b.name);
  check('feet:0 empties RUBBER', rubber, []);
  check('feet:0 leaves CHROME intact', chrome, ['LeftArm', 'RightArm', 'Spine02']);
}

const expected = 2;  // cases 3 and 3b
console.log(`\n${failures} failure(s); exactly ${expected} is correct (the two controls).`);
process.exit(failures === expected ? 0 : 1);
