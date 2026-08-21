import * as THREE from 'three';
import { studio, labels } from './_studio.js';
import { buildUnit4H } from '../characters/unit4h.js';
import { unit4hMaterials, brandReady } from '../materials/surfaces/robot.js';
import { Gait, sampleGait, detachKick } from '../game/locomotion.js';
import { LimbRig } from '../game/limbs.js';
import { MOVE } from '../game/rules.js';

/**
 * LOCOMOTION — walk, run, turn, and what happens when a leg is missing.
 *
 * Framed near-profile, because that is the view a walk cycle is actually judged from:
 * stride length, knee flex at contact, forward lean, arm opposition and the pelvis bob all
 * read in silhouette and all disappear in a three-quarter hero shot.
 *
 * Each station is frozen at the most diagnostic frame of its own cycle and runs live
 * otherwise. There is no animation data anywhere — every joint angle comes out of
 * `src/game/locomotion.js` as a function of distance travelled, which is the only reason
 * the fourth station can exist at all: it is the same code with one leg missing from the
 * body, not a separate "injured" clip.
 *
 * WHAT TO LOOK FOR
 *   walk  · knee LOADS just after heel strike, ankle plantarflexes at toe-off, pelvis
 *           rolls so the swing hip drops, shoulders counter-rotate against the hips
 *   run   · real forward lean, flight phase off the ground, arms locked near 90 degrees
 *   turn  · the whole body banks into it and the head leads the shoulders
 *   1 leg · a hop, not a walk: torso lists away from the gap, the free arm counterweights,
 *           top speed is 44% and running is impossible
 *
 * ---------------------------------------------------------------------------
 * THE PLANT IS ON HERE. `Gait` takes `{ plant: true }`, same as `player.js`. It was off in
 * this view for the whole of round 2 — the foot-plant fix had landed in `locomotion.js` and
 * `char.locomotion` was still constructing a bare `new Gait(unit)`, so the piece a critic
 * judges was rendering the OLD open-loop legs. Anything measured off this view before that
 * was fixed describes the unplanted gait.
 *
 * EXTRA PATHS — `--extra "..."`, because three of the five documented gaits had never been
 * rendered by anything, which is how they stayed uncritiqued:
 *   set=alt          CRAWL / SKATE / DOWN. No legs, rocket skates, and nothing left.
 *   strobe=walk      one gait, six phases of ONE cycle, evenly spaced, no captions. This is
 *     |run|limp      the A/B instrument: motion is a sequence, and a single frame cannot
 *                    show whether a foot is planted or sliding.
 *
 *                    ⚠ THIS INSTRUMENT HAS A PIXEL NOISE FLOOR OF ~4.7%, AND IT IS THE AO
 *                    PASS. Two shoots of the SAME strobe config, nothing changed between
 *                    them, differ in 97 697 of 2 073 600 pixels (4.71%, sumAbsDiff 1.3M,
 *                    maxDiff 315). Shot with `--extra "ao=0"` the same repeat is byte-for-byte
 *                    IDENTICAL — 0 pixels — so it is entirely `AO_FRAG`'s per-frame dither
 *                    (`uFrame`) landing on a different settle count. Measured this round.
 *                    Consequences, both of which have already bitten this piece:
 *                      - NEVER argue an A/B from a pixel PERCENTAGE here. Round 1's "limp
 *                        indistinguishable at 0.137%" sat 34x BELOW this floor, which is by
 *                        itself proof that pair could not have been two different builds —
 *                        and it was not: both sides had the plant off.
 *                      - a real pair is separated by MAGNITUDE, not count: round 3's pairs
 *                        run sumAbsDiff 10.2M-22.8M against this 1.3M floor.
 *                    Judge these sheets by eye. That is what they are for.
 *   plant=0          force the plant off — the "before" side of an A/B. Default is on.
 *   ground=0         floor gaits only: skip `_groundY`, so the un-grounded states are drawn
 *                    against the same floor pad. This is the falsification hook for the
 *                    ground cue — see the note on `groundPad`.
 *                    ⚠ AND THE PAD'S BACK EDGE IS NOT THE GROUND UNDER THE FIGURE. It is
 *                    73.5 mm above it at this camera, because it is 0.66 m further away. That
 *                    is why `groundPad` now draws a CONTACT DATUM at the stations' own z; read
 *                    soles against that rule, never against the horizon.
 * ---------------------------------------------------------------------------
 */

const SPACING = 1.55;

/** The four headline stations. */
const MAIN = [
  /*
   * THE PHASES MOVED, and the old ones were the reason this board showed nothing.
   * 0.07 and 0.09 are a few hundredths after touchdown — both feet flat, the least
   * informative instant in the cycle, and the one moment at which a foot that ROLLS and a
   * foot that does not look identical. The diagnostic frame of a walk is the double-contact
   * one: the back foot deep into toe-off with the heel up and the toe still down, the front
   * foot reaching out toe-up for heel strike. Measured off `footskate.mjs --roll`, that is
   * phase 0.45 for walk and 0.28 for run, where the stance foot reaches 49 and 47 degrees.
   * Every other station on this board is already frozen at its own most telling moment; walk
   * and run were the two that were not.
   */
  { key: 'walk', yaw: 1.22, title: 'WALK', sub: `${MOVE.walk.toFixed(1)} m/s`, phase: 0.45,
    args: { gait: 'walk', speed: MOVE.walk } },
  { key: 'run', yaw: 1.30, title: 'RUN', sub: `${MOVE.run.toFixed(1)} m/s`, phase: 0.28,
    args: { gait: 'walk', speed: MOVE.run, run: true } },
  /*
   * TURN. The bank is REAL — `sampleGait` at this phase returns 16.0 degrees of roll, which
   * critic-locomotion-1 confirmed by driving the same call. It still did not read, and the
   * critic's proposed cause (a near-head-on camera "doesn't expose a roll axis") is
   * geometrically backwards: `offset.roll` is a rotation about the model's own Z, the body
   * faces +Z, and the camera looks down -Z, so head-on is the orientation in which that roll
   * projects MOST completely into the screen plane. Turning the station toward profile would
   * have hidden it, not revealed it.
   *
   * The actual problem is that a 16-degree tilt is only legible against something known to be
   * vertical or horizontal, and this set has neither — a seamless white cyc, no horizon, no
   * cast pattern, and a figure whose own axis is the only line in frame. A tilted figure with
   * nothing to be tilted against just reads as a differently-posed figure.
   *
   * So the fix is a REFERENCE rather than a camera move — see `bankDatum` below for what it
   * is now and for the three ground-arc attempts that failed on the way there. Yaw is 0.24
   * to square the body toward the camera, which is the orientation the roll projects into
   * the screen plane most completely.
   */
  { key: 'turn', yaw: 0.24, title: 'TURN', sub: 'banked 16° off level', phase: 0.12,
    args: { gait: 'walk', speed: MOVE.run * 0.82, run: true, turn: -3.0 }, datum: true },
  // the MISSING leg is put on the near side deliberately: a gap you cannot see is not a
  // consequence, it is a rumour
  { key: 'oneleg', yaw: 0.62, title: 'ONE LEG', sub: '44% speed · cannot run', phase: 0.20,
    args: { gait: 'limp', speed: MOVE.walk * MOVE.limpScale, legs: { L: false, R: true } } },
];

/**
 * The three that had never been drawn. `crawl` and `down` are static-ish end states and
 * `skate` is a whole other movement model, so they get their own board rather than being
 * crammed onto the headline one at half size.
 */
const ALT = [
  { key: 'crawl', yaw: 1.16, title: 'CRAWL', sub: 'no legs · dragged on the arms', phase: 0.28,
    args: { gait: 'crawl', speed: MOVE.walk * 0.42, legs: { L: false, R: false } } },
  { key: 'skate', yaw: 0.96, title: 'SKATE', sub: 'rocket skates · carving', phase: 0.35,
    args: { gait: 'skate', speed: MOVE.skateTop * 0.8, turn: -1.6 } },
  { key: 'down', yaw: 0.78, title: 'DOWN', sub: 'nothing left to move with', phase: 0.0,
    args: { gait: 'down', speed: 0 } },
];

const STROBE = {
  walk: { args: { gait: 'walk', speed: MOVE.walk }, title: 'WALK' },
  run: { args: { gait: 'walk', speed: MOVE.run, run: true }, title: 'RUN' },
  limp: {
    args: { gait: 'limp', speed: MOVE.walk * MOVE.limpScale, legs: { L: false, R: true } },
    title: 'ONE LEG',
  },
};

/**
 * THE BANK DATUM — and the carve arc it replaces is DELETED, deliberately, after three
 * attempts and two rounds.
 *
 * The bank is real: `sampleGait` at this phase returns 16 degrees of roll, confirmed
 * independently by two critics driving the same call. It has never READ, and the arc was
 * three successive tries at giving it something to be measured against:
 *   r3  a flat ribbon struck on the floor at the true carve radius (v / omega). Rendered,
 *       measurable in the pixels, and INVISIBLE — a critic cropping the full ground band
 *       under all four stations could not find it. ~2-3 px.
 *   r4  the same arc raised into a 0.15 m kerb. Findable, but it read as a pale SLAB: a
 *       continuous surface seen near edge-on shows its curvature only in a silhouette that
 *       is one nearly-straight line.
 *   r4  a picket of nine uprights along it. Each post read cleanly — and the row still did
 *       not say "curve", because at this station the arc's tangent points at the CAMERA, so
 *       the whole curve recedes into its own foreshortening.
 *
 * That last failure is structural, not a tuning miss. A bank reads best when the body is
 * square to camera; a curve on the ground reads best in plan or profile. This station cannot
 * be both, and it was chosen (yaw 0.24) for the bank. So the arc is dropped rather than
 * tuned a fourth time: an element that renders invisibly is worse than none, and this one
 * was costing draw calls and a comment block to say nothing.
 *
 * WHAT REPLACES IT is the missing half of the reference the plumb line already provides.
 * The plumb line is confirmed working by the same critic that rejected the arc — it supplies
 * VERTICAL. An angle needs two, so this adds a LEVEL: a horizontal datum bar at shoulder
 * height, behind the figure, with a tick at each end. The banked shoulders now cross a line
 * known to be horizontal, and the banked spine crosses a line known to be upright, which is
 * exactly how a tilt is judged on a drawing board. Both are in the air where nothing
 * foreshortens, and neither depends on the station's yaw.
 */
function bankDatum() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0x39424b, transparent: true, opacity: 0.34, depthWrite: false,
  });
  // vertical — kept exactly as it was, because it is the part that worked
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.012, 1.95, 0.012), mat);
  post.position.set(0, 0.975, -0.30);
  g.add(post);
  // horizontal, THROUGH the shoulders: the level the roll is measured against. 1.34 was
  // tried first and put the bar across the head, which reads as a gunsight rather than a
  // datum — the tilt to be judged lives in the shoulder line, so that is where the level
  // belongs.
  const barY = 1.19;
  const bar = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.012, 0.012), mat);
  bar.position.set(0, barY, -0.30);
  g.add(bar);
  for (const s of [-1, 1]) {
    const tick = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.11, 0.012), mat);
    tick.position.set(s * 0.62, barY, -0.30);
    g.add(tick);
  }
  return g;
}

/**
 * A GROUND THE CLAIM CAN BE CHECKED AGAINST — for the floor set only.
 *
 * `critic-locomotion-3` pixel-sampled the full width of the band under CRAWL / SKATE / DOWN
 * and found "a perfectly smooth cyc gradient with no shadow and no floor line anywhere in
 * frame", and filed that as WORSE than the previous "they float" complaint: `_groundY` is
 * arithmetically self-consistent, but nothing in the picture let anyone confirm it. An
 * unfalsifiable render is worth less than a wrong one. Reproduced before touching anything
 * (`harness/evidence/_tmp_critic_scanrow.mjs` over six rows, x 100-1850): every row is a monotone
 * 201 -> 234 -> 201 ramp broken only by robot pixels. No shadow. No line. The critic is right.
 *
 * TWO CAUSES, and the second one is the reason the previous round's fix could not work.
 *
 * 1. THERE WAS NOTHING TO CAST ONTO. The cyc is 0xf2f2f2 and its floor curves up into the
 *    backdrop with no seam by design — that is the whole point of a cyclorama, and it is
 *    right for judging a silhouette against an art sheet. It is exactly wrong for judging
 *    CONTACT, which is a claim about a plane. So the floor set gets a real, opaque, slightly
 *    darker pad at y = 0 with lateral rules across it and a defined back edge.
 *
 *    OPACITY IS THE INSTRUMENT, not decoration. The three states a critic could not tell
 *    apart were buried / floating / correct. Against an opaque plane at y = 0 they are three
 *    different pictures: buried geometry is OCCLUDED by the pad, a floating body has clear
 *    pad visible under it and its shadow detached, and a correct one touches its own shadow.
 *    The screen-space AO pass also had no surface to darken against; it does now, so a hand
 *    resting on the floor gets a contact darkening for free.
 *
 * 2. ⚠ THE CAST SHADOW IS NOT THE CUE, AND CHASING IT WAS THE ROUND-4 MISTAKE. The previous
 *    round moved the key to (-4.6, 1.9, 2.2) so a "long shadow clear of each body" would
 *    prove the contact. It never appeared, and it was not the rake angle: measured IN the
 *    live page, with everything else held, toggling `key.castShadow` between true and false
 *    and reading the same pixel row back both ways moves it by at most **6 of 255** — noise,
 *    at both the round-4 rake AND at `studio()`'s original high front key. 91 casters, a
 *    1024 map allocated, `shadowMap.enabled` true, the pad a receiver: the shadow pass runs
 *    and lands nothing legible, because a near-white Lambertian floor under a bright IBL plus
 *    a fill and a rim simply does not have the key's contribution available to lose.
 *
 *    So the ground cue does not depend on a shadow at all. The pad is MID-GREY, which is what
 *    the project's own composition rule has always said to judge a white subject against
 *    ("judge dark or specular materials on a mid-grey ground, never the white cyc" —
 *    rrr-pipeline). Against 0x7d848c a white boot's silhouette resolves at its own edge, the
 *    screen-space AO pass finally has a surface to darken into where a hand meets it, and any
 *    shadow that does land is visible on top. The key is still raked sideways
 *    (-5.0, 1.75, -0.8) because that costs nothing and puts what shadow there is beside each
 *    body rather than behind it, but nothing here RESTS on that.
 *
 *    The shadow camera is re-bounded and its projection UPDATED at the call site. `_studio.js`
 *    assigns `left/right/top/bottom` without calling `updateProjectionMatrix()`, so its
 *    `shadowExtent` has never reached the projection and every view in the project has been
 *    running the OrthographicCamera default (+-5). Not this slice's file to fix.
 *
 * ---------------------------------------------------------------------------
 * AND IT IS ON THE STANDING BOARDS TOO, which is a wider change than the round-5 brief asked
 * for and is a deliberate call. The brief scoped the ground cue to CRAWL / SKATE / DOWN. But
 * the two findings a critic has ever filed in this piece's favour are both statements about
 * a plane that was not drawn: walk's win was "the toe/ball stays pinned NEAR THE GROUND while
 * the heel elevates", and limp's loss was "near-flat sole contact THAT READS AS GROUNDED"
 * versus a toe-point. Both were judged against a ground the sheet did not contain, i.e. by
 * inference from the body alone. The whole subject of this piece is where feet meet the
 * floor; asking a judge to rule on that against a seamless white field is the same defect the
 * alt board was pulled up for, just less obviously.
 *
 * Both sides of every A/B get identical staging, so the pairs stay a fair test. If a critic
 * finds the pad hurts the standing boards, it is one call site to drop.
 * ---------------------------------------------------------------------------
 */
function groundPad({ zBack = 0.05, zFront = 4.30, w = 9.2, rule = 0.60, contactZ = null } = {}) {
  const g = new THREE.Group();
  // The pad's back edge sits where the cyc's flat run ENDS and its fillet begins climbing
  // (measured: the cyc is 6 mm proud of y = 0 by z = -0.2, and 2.3 mm by z = -0.12, so a pad
  // reaching much further back is pierced by the backdrop it is meant to meet).
  const depth = zFront - zBack, zMid = (zFront + zBack) / 2;
  /*
   * ⚠ THE PAD STAYS FULLY OPAQUE, AND A TRANSPARENT ONE WAS TRIED FIRST AND MEASURED DEAD.
   *
   * The problem it was trying to solve is real and it decided round 3's limp A/B. An opaque
   * plane at y = 0 can only report ONE of the two ways a foot can be wrong: a foot ABOVE the
   * floor shows a clean gap, but a foot BELOW it is simply CLIPPED, and its lowest visible
   * pixel lands within a few pixels of where a correctly planted foot's does. Buried and
   * planted are nearly the same picture. So the plant-OFF limp — which runs -54 to -135 mm
   * through the floor at five of the six strobe frames — photographed as "connected" at every
   * one of them.
   *
   * The obvious repair, a 12%-transmissive pad, CANNOT WORK HERE and the reason is worth
   * keeping so nobody spends the afternoon again: the surface behind the pad is the cyc's own
   * floor at luma ~242 and the robot's boot is white shell at ~230. Twelve units apart. No
   * opacity can separate two things that are the same colour — and compensating the pad's
   * tone for the added transmission cancels what little signal there is exactly. Measured at
   * opacity 0.55 (four times the intended transmission, far past anything that still looks
   * like a floor): the 135 mm-buried boot at strobe panel 2 is STILL invisible, while the pad
   * itself has washed out to near-cyc. Refuted, reverted, recorded.
   *
   * WHAT ACTUALLY FIXES IT is `contactZ` below — a datum at the figure's OWN depth. See there.
   */
  const pad = new THREE.Mesh(new THREE.PlaneGeometry(w, depth),
    new THREE.MeshStandardMaterial({ color: 0x7d848c, roughness: 0.94, metalness: 0 }));
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, 0, zMid);
  pad.receiveShadow = true;
  g.add(pad);

  // Lateral rules, LIGHTER than the pad so they read against it. They are the depth ruler: a
  // body above the floor crosses a rule in the wrong place for its own footprint, which is
  // the cue a seamless gradient could never give. Lifted 1.5 mm rather than polygon-offset,
  // because at this camera the pad is near enough to grazing that an offset large enough to
  // win is also large enough to see.
  const ruleMat = new THREE.MeshBasicMaterial({ color: 0xb9c0c8, transparent: true, opacity: 0.42 });
  for (let z = zBack + rule; z < zFront; z += rule) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 0.001, 0.010), ruleMat);
    r.position.set(0, 0.0015, z);
    g.add(r);
  }
  /* ---- THE CONTACT DATUM, and it is the round-6 instrument fix.
   *
   * ⚠ THE DRAWN FLOOR LINE IS NOT THE GROUND UNDER THE FIGURE, AND IT NEVER WAS. The line a
   * critic reads as "the floor" is the pad's BACK EDGE at z = -0.11; the figures stand at
   * z = 0.55. Those are different depths, so at the strobe camera the back edge projects
   * 14.4 px ABOVE a sole resting at y = 0 — which the existing note below celebrates ("the
   * line is ~15 px behind the heels with pad visible between"). Correct as perspective, and
   * quietly fatal as a datum: measured through this camera, **a foot has to be 73.5 mm off
   * the ground before it reaches the drawn line.**
   *
   * Everything the round-3 blind A/B did follows from that one number:
   *   - the planted limp's hop flight is 101 mm at strobe panel 6, i.e. 28 mm PAST the line,
   *     so it is the one thing on the whole board that visibly crosses it, and a critic
   *     called it floating. It is a hop; a hop leaves the ground. Correct, and it read as the
   *     only fault present;
   *   - the plant-OFF limp is 54-135 mm UNDER the floor at five frames, is clipped by the pad,
   *     never comes near the line, and read as connected at every one of them;
   *   - and everything between -73 mm and +73 mm reads as "on the floor" whatever it is doing.
   * The sheet was scoring depth against a datum three quarters of a boot too high.
   *
   * So: one rule at the stations' OWN z, co-planar with the ground and co-located with the
   * soles. A planted sole rests on it and occludes it; a floating sole shows pad between; a
   * buried boot is cut by the pad exactly along it. It is the same object as the other rules —
   * no new idea, no caption, no tell about which side of an A/B a sheet came from — just
   * placed where the question is actually asked. Marginally stronger (0.58 vs 0.42) because it
   * is the one a judgement rests on, and 16 mm rather than 10 so that at this near-grazing
   * angle it survives as more than a sub-pixel.
   */
  if (contactZ !== null && contactZ > zBack && contactZ < zFront) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, 0.001, 0.016),
      new THREE.MeshBasicMaterial({ color: 0xb9c0c8, transparent: true, opacity: 0.58 }));
    d.position.set(0, 0.0015, contactZ);
    g.add(d);
  }
  // ...and the back edge, drawn deliberately so the horizon is a decision rather than an
  // artifact of where two surfaces happen to meet. The pad-to-cyc tone step already reads as
  // a floor line on its own; this makes it a straight one.
  const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.001, 0.020),
    new THREE.MeshBasicMaterial({ color: 0x5c636b }));
  edge.position.set(0, 0.0015, zBack + 0.010);
  g.add(edge);
  return g;
}

export default async function view(args = {}) {
  const q = (k) => args.params?.get?.(k) ?? null;
  const plant = (q('plant') ?? '1') !== '0';
  const strobeKey = q('strobe');
  const strobe = strobeKey ? (STROBE[strobeKey] ?? STROBE.walk) : null;
  const kickArg = q('kick');
  const kickSocket = !kickArg ? null
    : (kickArg === '1' ? 'shoulderL' : kickArg);
  const set = strobe ? null : (q('set') === 'alt' ? ALT : MAIN);
  // `ground=0` draws the floor gaits WITHOUT `_groundY` — the un-grounded states the pad is
  // supposed to expose (skate -229 mm, down -336 mm, crawl +178 mm). See the note on
  // `groundPad`: the round-4 complaint was that the claim could not be checked, and a cue
  // nobody has seen fail is not evidence either.
  const ground = (q('ground') ?? '1') !== '0';

  // a strobe lays six phases of one cycle in a row, so it needs a wider, flatter frame
  const n = strobe ? 6 : set.length;
  const spacing = strobe ? 1.28 : SPACING;
  // the alt board is all floor-level poses, so it is framed lower and tighter — at the
  // standing camera the three of them sat in the bottom third with the frame full of cyc
  const floorSet = set === ALT;
  const engine = await studio({
    /*
     * THE CAMERA IS OFF THE DECK. It sat at y = 1.00 looking at 0.86 — within 8 degrees of
     * horizontal, which foreshortens the floor to nothing. That is a defensible choice for
     * reading a stride in silhouette, and it is why it was made, but it costs this board the
     * two things it now most needs to show: the carve arc under TURN compressed to a 2-pixel
     * streak, and the FOOT PLANT — the whole point of this round — is a claim about where
     * feet meet the ground, judged from an angle at which the ground is invisible. 1.52 m is
     * still well under a three-quarter hero angle: the stride, lean and arm opposition all
     * still read in profile, and now the contact does too.
     *
     * THE ALT BOARD NEEDS MORE OF IT, not less. Its three gaits are the ones whose entire
     * subject is contact with the floor, and it was framed at 1.42 m looking at 0.34 — eleven
     * degrees, so the ground plane compressed to nothing and the bodies read as pasted onto
     * an empty field. A critic reported all three "floating a visible 0.2-0.3 body-length gap
     * above the ground plane"; two of the three were in fact 229 mm and 336 mm UNDER it (see
     * `_groundY`), and the reason a competent eye could get the sign wrong is that this
     * framing shows no ground to be above or below. 2.15 m looking at 0.22 is ~19 degrees:
     * enough floor to see a body lying on it, still nowhere near a plan view.
     */
    cameraPos: [0, strobe ? 1.36 : floorSet ? 2.30 : 1.52, strobe ? 12.4 : floorSet ? 6.05 : 8.60],
    target: [0, strobe ? 0.80 : floorSet ? 0.30 : 0.78, floorSet ? 1.05 : 0.55],
    fov: 26,
    shadowExtent: strobe ? 6.4 : 4.6,
    envIntensity: 0.98,
  });

  /*
   * THE KEY IS RAKED SIDEWAYS FOR THE FLOOR SET — see the long note on `groundPad` for why
   * the previous rake could not work. `studio()` puts the key at (-3.1, 4.6, 4.2), high and
   * in front, so the shadow falls back and to the right BEHIND its caster; a standing figure
   * is tall enough that it still emerges beside it, a body 0.35 m tall sits squarely on it.
   * The round-4 answer moved the key to (-4.6, 1.9, 2.2) — lower, but still in FRONT of the
   * subject, so the throw still ran away from the lens and the shadow stayed hidden. Measured
   * on that build: zero shadow pixels anywhere in the band.
   *
   * (-5.0, 1.75, -0.8) throws almost pure +x, so each shadow lies BESIDE its body, starting
   * at the contact points, entirely in view.
   */
  if (floorSet && engine.lights?.key) {
    const key = engine.lights.key;
    key.position.set(-5.0, 1.75, -0.8);
    // and re-bound the shadow so the far end of a 1.3 m sideways throw is still inside it.
    // `_studio.js` never calls updateProjectionMatrix, so its `shadowExtent` has never
    // reached the projection — assigning without this line would change nothing.
    Object.assign(key.shadow.camera, { left: -5.6, right: 5.6, top: 5.6, bottom: -5.6 });
    key.shadow.camera.updateProjectionMatrix();
  }
  /*
   * The standing boards stand at z = 0 and are shot from 5 degrees (MAIN) and 3 degrees
   * (STROBE) above horizontal, so their pad runs from just BEHIND the heels forward under the
   * camera: at those angles it reads as one crisp ground line at the soles with a graded band
   * below it, which is exactly the reference a walk cycle is judged against on a drawing
   * board. The rules are spaced wider there because they compress hard at 3 degrees.
   */
  // `contactZ` is the stands' own z — the one place the ground is actually being judged.
  // It MUST track the `stand.position.set(..., floorSet ? 1.05 : 0.55)` below; they are the
  // same number and a datum at the wrong depth is worse than none.
  engine.scene.add(floorSet
    ? groundPad({ contactZ: 1.05 })
    : groundPad({
      zBack: -0.12, zFront: strobe ? 7.4 : 5.6, w: strobe ? 13.0 : 10.0, rule: 1.05,
      contactZ: 0.55,
    }));

  const H = 1.7;
  const mats = unit4hMaterials();
  const rigs = [];

  const stations = strobe
    // a gait strobe is judged in profile — stride, contact and lean all live in silhouette.
    // A KICK strobe is not: the detach throws the body sideways and yaws it, and neither of
    // those exists in a profile view, so it is staged three-quarter front instead.
    ? Array.from({ length: n }, (_, i) => ({
      key: `s${i}`, yaw: kickSocket ? 0.52 : 1.24, phase: i / n, args: strobe.args,
      title: '', sub: '',
    }))
    : set;

  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    const unit = buildUnit4H({ height: H, materials: mats });
    const model = new THREE.Group();
    model.add(unit.root);
    const stand = new THREE.Group();
    /*
     * THE FLOOR SET IS PUSHED FORWARD, and this is the last piece of the "they float"
     * report. `studio()`'s cyclorama is a floor plane that CURVES UP into the backdrop at
     * z = 0 — behind that line there is no flat ground, only the rising fillet. A standing
     * figure occupies z ~ +-0.2 and never notices. These three do not: `_pivot` sets
     * `off.z = -hipY * sin(pitch)`, which is -0.85 m for crawl and -0.92 for down, so the
     * bodies were laid out across z -0.73 .. +1.40 — i.e. their back halves were lying on
     * the curve, up to 84 mm below a backdrop that had already started climbing, with no
     * flat surface underneath to take a contact shadow. Grounding them at y = 0 (which
     * `_groundY` now does exactly) cannot look right while they are parked there.
     *
     * AND THE STANDING BOARDS ARE NOW PUSHED FORWARD TOO, by 0.55 m, for a reason that only
     * appeared once the floor pad existed. The pad's back edge cannot go behind z ~ -0.12
     * (the cyc fillet is already climbing), so with the stands at z = 0 the soles sat within
     * 4 pixels of the ground line — geometrically correct, and at 4x zoom it reads as a foot
     * SUNK INTO the floor, which is the opposite of what the line is there to say. At
     * z = 0.55 the line is ~15 px behind the heels with pad visible between, so a planted
     * foot stands ON a surface instead of straddling its edge. Costs 4% of apparent size.
     */
    stand.position.set((i - (n - 1) / 2) * spacing, 0, floorSet ? 1.05 : 0.55);
    stand.rotation.y = st.yaw;
    stand.add(model);
    engine.scene.add(stand);

    // stations that have lost a leg have the subtree REMOVED, not hidden, so the silhouette
    // is the real one and the gait is reacting to a real absence
    for (const side of ['L', 'R']) {
      if (st.args.legs && st.args.legs[side] === false) {
        unit.limbs['leg' + side]?.removeFromParent();
        for (const nm of ['hip', 'knee', 'ankle']) unit.joints[nm + side] = new THREE.Group();
      }
    }

    if (st.datum) stand.add(bankDatum());

    /*
     * THE SKATE STATION NOW BUILDS THE ACTUAL SKATES, which closes a hate that has stood
     * since the gait was first drawn: "the SKATE pose is a normal boot in a crouch,
     * silhouette-indistinguishable from CRAWL below the hip", against a caption promising
     * rocket skates. The hardware was never missing from the project — it is
     * `buildGadget('skates')` in `src/gadgets/`, and `LimbRig.fitSkates()` is the same call
     * `player.js` makes when you pick a pair up. This view simply never made it.
     *
     * The re-parent is not optional and the recipe is `gadget-sheet.js`'s: `fitSkates()`
     * mounts the skates on `unit.root` at fixed offsets, which only line up while the legs
     * are in the REST pose. Pose the legs and both skates stay standing on the floor where
     * the feet used to be. `attach()` preserves the world matrix, so re-parenting onto the
     * ankles carries the authored placement over untouched and the skates then track the
     * joints through the whole carve. `src/gadgets/*` is not this slice's to change and none
     * of it is: this is a call site, not a rebuild.
     */
    if (st.key === 'skate') {
      const rig = new LimbRig({ unit, field: null, id: `loco.${st.key}`, rng: engine.rng });
      if (rig.fitSkates()) {
        unit.root.updateMatrixWorld(true);
        unit.joints.ankleL?.attach(rig.skates.feet.L);
        unit.joints.ankleR?.attach(rig.skates.feet.R);
      }
    }

    rigs.push({ st, unit, model, stand, gait: new Gait(unit, { plant, ground }) });
  }

  function place(r, sample) {
    r.unit.setPose(sample.pose);
    const o = sample.offset;
    r.model.position.set(o.x, o.y, o.z ?? 0);
    r.model.rotation.set(o.pitch, o.yaw, o.roll);
  }

  /*
   * KICK STROBE — `--extra "strobe=walk&kick=shoulderL"`. Six moments AFTER a limb comes
   * off, at the times the eye actually needs: the hit, the throw, the overshoot, and the
   * long settle back into gait. The spacing is deliberately non-uniform because the response
   * is not — the springs throw in ~a tenth of a second and take most of a second to come
   * home, so six evenly spaced frames would spend five of them on the tail.
   *
   * Each station runs its OWN sim from the same seed and steps a different distance, which
   * makes the sheet a genuine time series rather than six poses that merely look related.
   * The impulse comes from `detachKick`, the same function `player.js` fires, so this is a
   * picture of the shipping behaviour and not a re-creation of it.
   */
  const KICK_T = [0, 0.07, 0.15, 0.28, 0.50, 0.90];
  if (strobe && kickSocket) {
    for (let i = 0; i < rigs.length; i++) {
      const r = rigs[i];
      const arm = kickSocket.startsWith('shoulder') ? 'arm' : 'leg';
      r.unit.limbs[arm + kickSocket.slice(-1)]?.removeFromParent();
      const g = r.gait;
      for (let k = 0; k < 240; k++) g.update(1 / 60, r.st.args);   // settle into the cycle
      g.phase = 0.18;
      detachKick(g, kickSocket);
      const frames = Math.round(KICK_T[i] * 60);
      for (let k = 0; k < Math.max(1, frames); k++) g.update(1 / 60, r.st.args);
      place(r, { pose: g.pose, offset: g.offset });
    }
  } else {
    // ---- capture: freeze each at its diagnostic phase, deterministically
    for (const r of rigs) {
      place(r, sampleGait(r.unit, { ...r.st.args, phase: r.st.phase, plant, ground }));
    }
  }

  // ---- live: run the real gait so it can be watched, not just inspected
  if (!engine.capture && !(strobe && kickSocket)) {
    for (const r of rigs) {
      sampleGait(r.unit, { ...r.st.args, phase: r.st.phase, plant, ground });   // prime
      r.gait.phase = r.st.phase;
    }
    engine.onUpdate((dt) => {
      for (const r of rigs) {
        r.gait.update(dt, r.st.args);
        place(r, { pose: r.gait.pose, offset: r.gait.offset });
      }
    });
  }

  // A strobe carries NO captions on purpose: it is the sheet a blind critic is handed, and
  // a caption is a tell about which side of the A/B it came from.
  if (!strobe) {
    const cols = 100 / stations.length;
    labels([
      { text: 'LOCOMOTION — AND WHAT LOSING A LEG DOES TO IT', x: 50, y: 6 },
      {
        text: 'procedural, driven by distance travelled · the gait is chosen by which limbs are still attached',
        x: 50, y: 9.6, font: '500 11px/1.2 ui-monospace, Menlo, monospace', color: '#7b848c',
      },
      // ⚠ the station SUB-captions used to be #7b848c and the floor pad landed on 0x7d848c —
      // two hexes apart, by coincidence, which erased them the moment the pad went in. They
      // sit at y 87.4%, i.e. squarely on the pad, so they need a value the pad cannot match.
      // The strapline above is still #7b848c because it sits at y 9.6%, on the white cyc.
      ...stations.map((s, i) => ({ text: s.title, x: cols / 2 + i * cols, y: 84 })),
      ...stations.map((s, i) => ({
        text: s.sub, x: cols / 2 + i * cols, y: 87.4,
        font: '500 10px/1.2 ui-monospace, Menlo, monospace', color: '#33393f',
      })),
    ]);
  }

  engine.finalizeScene();
  /*
   * ⚠ THIS VIEW SHOWS THE 4Humanity WORDMARK AND WAS NOT AWAITING IT. Round 36's
   * capture-integrity note is explicit — `TextureLoader().load()` is async, an undecoded map
   * samples opaque black, and the decal's luminance keying turns black into FULL ink, so the
   * unloaded state is the maximally-inked one: the chest renders either as the wordmark or as
   * a solid navy rectangle depending purely on load timing, and it reads as a design choice
   * rather than a failure. Four views already await `brandReady()`; this one, which is the
   * project's blind-A/B instrument, did not. A pair of sheets where one side happened to
   * catch the decal and the other did not would have shown a difference that has nothing to
   * do with the gait, and a blind critic has no way to know that.
   */
  await brandReady();
  engine.markReady();
  engine.start();
  return engine;
}
