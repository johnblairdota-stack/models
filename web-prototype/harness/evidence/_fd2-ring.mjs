#!/usr/bin/env node
/**
 * THE JOINT-CREASE RESOLVER'S CONTROL.
 *
 *   node harness/evidence/_fd2-ring.mjs
 *
 * WHY THIS EXISTS AS A TEST AND NOT AS A LOOK — the same argument `_two3_bones.mjs` makes for the
 * family assignment, and it is stronger here. `rrwBoneDetail` decides WHICH END OF WHICH BONE
 * carries a dark crease, and every way it can be wrong still renders a plausible robot with dark
 * lines on it. Put the shoulder's crease on the wrist and you get a robot with a cuff. Ring the
 * toe joint as well as the ankle and you get a boot in two parts. Neither looks broken in a
 * thumbnail, and both make the dark-fraction columns go UP — so the scoreboard endorses them.
 *
 * ⚠️ THIS FILE CANNOT SEE THE OTHER HALF, AND SAYS SO. It checks the RULE — which bone, which
 * end, how dark. It cannot check the FRAME, i.e. whether "the proximal end of LeftForeArm" is
 * actually at the elbow rather than 100x away or reversed; that is `aBoneEnd`, it is geometry,
 * and its control is `?dlringctl=1` in the browser, which moves every crease to the middle of its
 * own bone. A ring at a wrong distance is still a ring. Both controls are needed and neither
 * subsumes the other.
 */
import { rrwBoneDetail, RRW_DET, rrwBonePanels, RRW_PAN } from '../../src/materials/surfaces/robot.js';

/** Build bone-like objects with real `.parent` chains from a [name, parentName] list. */
function rig(pairs) {
  const byName = new Map();
  for (const [n] of pairs) byName.set(n, { name: n, parent: null });
  for (const [n, p] of pairs) if (p) byName.get(n).parent = byName.get(p);
  return pairs.map(([n]) => byName.get(n));
}

// The real rig, the same hierarchy `_two3_bones.mjs` read out of the GLB's glTF JSON chunk.
const MESHY = rig([
  ['Armature', null], ['Hips', 'Armature'],
  ['Spine02', 'Hips'], ['Spine01', 'Spine02'], ['Spine', 'Spine01'],
  ['neck', 'Spine'], ['Head', 'neck'], ['head_end', 'Head'], ['headfront', 'Head'],
  ['LeftShoulder', 'Spine'], ['LeftArm', 'LeftShoulder'], ['LeftForeArm', 'LeftArm'], ['LeftHand', 'LeftForeArm'],
  ['RightShoulder', 'Spine'], ['RightArm', 'RightShoulder'], ['RightForeArm', 'RightArm'], ['RightHand', 'RightForeArm'],
  ['LeftUpLeg', 'Hips'], ['LeftLeg', 'LeftUpLeg'], ['LeftFoot', 'LeftLeg'], ['LeftToeBase', 'LeftFoot'],
  ['RightUpLeg', 'Hips'], ['RightLeg', 'RightUpLeg'], ['RightFoot', 'RightLeg'], ['RightToeBase', 'RightFoot'],
]);

let failures = 0;
const check = (label, got, want) => {
  const g = [...got].sort().join(', '), w = [...want].sort().join(', ');
  const ok = g === w;
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) { console.log(`          got:  ${g || '(none)'}`); console.log(`          want: ${w || '(none)'}`); }
};
const checkNum = (label, got, want) => {
  const ok = Math.abs(got - want) < 1e-6;
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  (got ${got}, want ${want})`}`);
};

/** Bones carrying a non-zero crease at one end, by name. */
const endNames = (bones, ch, opts) => {
  const w = rrwBoneDetail(bones, opts);
  return bones.filter((b, i) => w[i * 4 + ch] !== 0).map((b) => b.name);
};
const strength = (bones, name, ch, opts) => {
  const w = rrwBoneDetail(bones, opts);
  return w[bones.findIndex((b) => b.name === name) * 4 + ch];
};

console.log('\nCASE 1 — every joint the spec names is creased FROM BOTH SIDES. The surface at the');
console.log('elbow is skinned to two bones, so a crease written on one of them stops dead at the');
console.log('weight handover and reads as a half-ring drawn on one part.');
check('proximal creases (the bone STARTS at a joint the spec names)',
  endNames(MESHY, RRW_DET.PROX),
  ['LeftForeArm', 'RightForeArm',      // the elbow, from below
    'LeftArm', 'RightArm',              // the shoulder detach
    'LeftUpLeg', 'RightUpLeg',          // the hip detach
    'LeftLeg', 'RightLeg',              // the knee, from below
    'LeftFoot', 'RightFoot']);          // the ankle, from below
check('distal creases (the bone ENDS at a joint the spec names)',
  endNames(MESHY, RRW_DET.DIST),
  ['LeftArm', 'RightArm',               // the elbow, from above
    'LeftUpLeg', 'RightUpLeg',          // the knee, from above
    'LeftLeg', 'RightLeg']);            // the ankle, from above

console.log('\nCASE 2 — the four bones that must carry NO crease at all, each for its own reason.');
{
  const w = rrwBoneDetail(MESHY);
  const none = (name) => {
    const i = MESHY.findIndex((b) => b.name === name);
    return w[i * 4] === 0 && w[i * 4 + 1] === 0;
  };
  const label = (name, why) => {
    const ok = none(name);
    if (!ok) failures++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name} is uncreased — ${why}`);
  };
  label('LeftHand', 'the spec puts TWO CHROME RINGS at the wrist, not a dark crease');
  label('LeftToeBase', 'its proximal joint is the BALL of the foot, and the spec creases only the '
    + 'ankle; RRW_REGION.foot matches toe/ball too and reusing it would split the boot');
  label('Spine', 'this rig chains Hips -> Spine02 -> Spine01 -> Spine, so bare Spine is the CHEST '
    + 'and a crease here would cross the 4Humanity wordmark');
  label('Head', 'the spec puts VENTILATION on the back of the head, not a ring round the neck');
}

console.log('\nCASE 3 — "much darker" appears in the spec on the hip and shoulder lines and on no');
console.log('others, so the detach creases must be STRICTLY darker than the actuator rings. It is');
console.log('a ratio between two features on one figure, so no exposure argument can move it.');
{
  const hip = strength(MESHY, 'LeftUpLeg', RRW_DET.PROX);
  const knee = strength(MESHY, 'LeftUpLeg', RRW_DET.DIST);
  const shoulder = strength(MESHY, 'LeftArm', RRW_DET.PROX);
  const elbow = strength(MESHY, 'LeftArm', RRW_DET.DIST);
  const ok = hip > knee && shoulder > elbow;
  if (!ok) failures++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  hip ${hip} > knee ${knee}; shoulder ${shoulder} > elbow ${elbow}`);
}

console.log('\nCASE 4 — the SAME BONE carries both, and the darker sentence wins where they meet.');
console.log('LeftUpLeg starts at the hip ("much darker") and ends at the knee (an actuator ring),');
console.log('so an assignment that overwrote rather than max()d would lose one of the two.');
checkNum('LeftUpLeg proximal is the detach value', strength(MESHY, 'LeftUpLeg', RRW_DET.PROX), 1.0);
checkNum('LeftUpLeg distal is the joint value', strength(MESHY, 'LeftUpLeg', RRW_DET.DIST), 0.75);

console.log('\nCASE 4b — THE CHROME JOINT CAPS ride the same array. "Elbow / Knee: above, below,');
console.log('back, front and side are chrome" — five directions is the spec saying ALL of them, so');
console.log('these are the one item on the fine-detail list that is NOT a facing test.');
check('chrome caps, proximal end',
  endNames(MESHY, RRW_DET.CAPP),
  ['LeftForeArm', 'RightForeArm',      // the elbow, carrying chrome DOWN onto the white forearm
    'LeftLeg', 'RightLeg']);            // the knee, from below
check('chrome caps, distal end',
  endNames(MESHY, RRW_DET.CAPD),
  ['LeftUpLeg', 'RightUpLeg']);         // the knee, from above

console.log('\nCASE 4c — the UPPER ARM carries no cap, and its absence is the correct answer rather');
console.log('than an omission: rrwFamilyWeights already makes the whole upper arm chrome, so a cap');
console.log('there is a second mask over an identical region. The FOOT carries none either — the');
console.log('spec wants a proud chrome actuator in the ankle crease, which is kit geometry, and a');
console.log('band would chrome the top of the boot, measured as the brightest region on the figure.');
{
  const w = rrwBoneDetail(MESHY);
  const noCap = (name) => {
    const i = MESHY.findIndex((b) => b.name === name);
    return w[i * 4 + RRW_DET.CAPP] === 0 && w[i * 4 + RRW_DET.CAPD] === 0;
  };
  for (const n of ['LeftArm', 'RightArm', 'LeftFoot', 'RightFoot']) {
    const ok = noCap(n);
    if (!ok) failures++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${n} carries no chrome cap`);
  }
}

console.log('\nCASE 4d — cap:0 must empty BOTH cap channels and touch neither crease channel, so a');
console.log('rig on which the caps resolve badly can drop them without losing the creases.');
check('cap:0 empties the proximal caps', endNames(MESHY, RRW_DET.CAPP, { cap: 0 }), []);
check('cap:0 empties the distal caps', endNames(MESHY, RRW_DET.CAPD, { cap: 0 }), []);
check('cap:0 leaves the distal creases',
  endNames(MESHY, RRW_DET.DIST, { cap: 0 }),
  ['LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg']);

console.log('\nCASE 5 — an unskinned / boneless caller resolves to an all-zero array, which is an');
console.log('exact revert. This is what the procedural robot and the three hunter stages get.');
check('empty rig proximal', endNames([], RRW_DET.PROX), []);
check('empty rig distal', endNames([], RRW_DET.DIST), []);

console.log('\nCASE 6 — each feature has its own master, so one that resolves badly on some other');
console.log('rig can be switched off without losing the other. joint:0 must not touch the detach');
console.log('creases, and it must EMPTY the distal channel, which carries nothing else.');
check('joint:0 empties the distal channel', endNames(MESHY, RRW_DET.DIST, { joint: 0 }), []);
check('joint:0 leaves the two detach pairs proximal',
  endNames(MESHY, RRW_DET.PROX, { joint: 0 }),
  ['LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg']);

console.log('\nCASE 9 — THE PANEL FEATURES, which sit in the BELLY of a bone rather than at a joint:');
console.log('the chrome calf panel and the waist flexion ridges. Separate array, because a joint');
console.log('feature is continuous across the two bones that meet there and these are not.');
{
  const panNames = (bones, ch, opts) => {
    const w = rrwBonePanels(bones, opts);
    return bones.filter((b, i) => w[i * 4 + ch] !== 0).map((b) => b.name);
  };
  const panAt = (name, ch, opts) => {
    const w = rrwBonePanels(MESHY, opts);
    return w[MESHY.findIndex((b) => b.name === name) * 4 + ch];
  };
  console.log('  ⚠️ THE PANEL CHANNEL IS SHARED BY TWO FEATURES AND THE SIGN IS WHAT SEPARATES');
  console.log('  THEM: positive = the calf window (far half of the bone), negative = the head');
  console.log('  ventilation window (near end, "where it meets the neck").');
  check('chrome panel is the SHIN bones and the HEAD, and nothing else',
    panNames(MESHY, RRW_PAN.PANEL), ['LeftLeg', 'RightLeg', 'Head']);
  {
    const ok = panAt('LeftLeg', RRW_PAN.PANEL) > 0 && panAt('Head', RRW_PAN.PANEL) < 0;
    if (!ok) failures++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  calf is POSITIVE (${panAt('LeftLeg', RRW_PAN.PANEL)}) `
      + `and head vent NEGATIVE (${panAt('Head', RRW_PAN.PANEL)})`);
  }
  console.log('  ⚠️ AND THE HEAD IS FOUND BY DEPTH TOO — this rig carries `head_end` and');
  console.log('  `headfront` as well, so a naive /head/ match takes whichever comes first.');
  console.log('\n  ⚠️ THE RIDGE BONE IS THE ONE THIS RIG CAN CONFUSE. Hips -> Spine02 -> Spine01 ->');
  console.log('  Spine, so bare `Spine` is the CHEST; a /spine$/i rule would rib the wordmark plate.');
  check('stripes are on Spine02 (the waist) and the head, and nothing else',
    panNames(MESHY, RRW_PAN.STRIPE), ['Spine02', 'Head']);
  {
    const rp = panAt('Spine02', RRW_PAN.PITCH), vp = panAt('Head', RRW_PAN.PITCH);
    const ok = rp > 0 && vp > 0 && rp !== vp;
    if (!ok) failures++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  each striped bone carries its OWN pitch — waist ${rp} m, `
      + `head ${vp} m. One varying, two pitches; that is why the pitch is per bone.`);
  }
  console.log('\n  ⚠️ THE WRIST SIGN SAYS WHICH END OF THE BONE THE WRIST IS, and getting it wrong');
  console.log('  is not cosmetic: with abs() the first build drew FOUR rings for two spec lines,');
  console.log('  mirrored either side of the joint. Fingers carry the hand sign so their sentinel');
  console.log('  cannot interpolate UP through the ring positions across the knuckles.');
  check('wrist rings name the forearm and the whole hand chain',
    panNames(MESHY, RRW_PAN.WRIST),
    ['LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand']);
  {
    const ok = panAt('LeftForeArm', RRW_PAN.WRIST) > 0 && panAt('LeftHand', RRW_PAN.WRIST) < 0;
    if (!ok) failures++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  forearm is DISTAL (+) and hand PROXIMAL (-)`);
  }
  check('calf:0 leaves the head vent panel', panNames(MESHY, RRW_PAN.PANEL, { calf: 0 }), ['Head']);
  check('vent:0 leaves the calf panel',
    panNames(MESHY, RRW_PAN.PANEL, { vent: 0 }), ['LeftLeg', 'RightLeg']);
  check('wrist:0 empties the wrist channel', panNames(MESHY, RRW_PAN.WRIST, { wrist: 0 }), []);
  check('empty rig has no panels', panNames([], RRW_PAN.PANEL), []);
}

console.log('\n=== CONTROLS. Everything below asserts a WRONG result and MUST fail. ===');

console.log('\nCASE 7 (EXPECTED TO FAIL) — the arm trap, reintroduced. " left fore arm " and');
console.log('" left hand " both live on the arm chain, so a naive / arm / predicate without');
console.log('RRW_REGION.upperarm\'s two exclusions hands the HAND the shoulder-detach row — and a');
console.log('hand\'s proximal joint is the WRIST. That renders as a robot wearing dark cuffs, which');
console.log('is not a defect anyone reports and which the dark-fraction columns reward.');
check('a naive / arm / rule creases the wrists (EXPECTED TO FAIL)',
  endNames(MESHY, RRW_DET.PROX),
  ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand',
    'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot']);

console.log('\nCASE 8 (EXPECTED TO FAIL) — reusing RRW_REGION.foot, which matches toe and ball as');
console.log('well as foot, would crease the toe joint too. This asserts that boot-in-two-parts');
console.log('result, so CASE 2 is known to be testing something.');
check('the toe joint is also creased (EXPECTED TO FAIL)',
  endNames(MESHY, RRW_DET.PROX),
  ['LeftForeArm', 'RightForeArm', 'LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg',
    'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase']);

console.log('\nCASE 10 (EXPECTED TO FAIL) — the spine trap, reintroduced on the feature that would');
console.log('carry it furthest. A /spine$/i rule for "the waist" picks bare `Spine`, which on THIS');
console.log('rig is the CHEST, so the flexion ridges would run across the 4Humanity wordmark. This');
console.log('asserts that wrong bone, so CASE 9 is known to be testing something.');
{
  const w = rrwBonePanels(MESHY);
  check('ridges land on the chest (EXPECTED TO FAIL)',
    MESHY.filter((b, i) => w[i * 4 + RRW_PAN.STRIPE] !== 0).map((b) => b.name), ['Spine']);
}

const expected = 3;  // cases 7, 8 and 10
console.log(`\n${failures} failure(s); exactly ${expected} is correct (the controls).`);
process.exit(failures === expected ? 0 : 1);
