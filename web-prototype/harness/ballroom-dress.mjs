#!/usr/bin/env node
/**
 * ballroom-dress — the PRIME TIME ballroom's dress, asserted.
 *
 *   node harness/ballroom-dress.mjs
 *
 * The ballroom is the set for most of the night — lobby, intros, recap, debrief, reckoning and
 * vote all happen in it — so its defects are worth a regression net rather than a transcript.
 * `CLAUDE.md`: *"A playtest finding is not finished until it is a gate — five agents' findings
 * were lost in August because they lived in transcripts."*
 *
 * =============================================================================================
 * WHAT A GATE CAN AND CANNOT SEE, AND WHY EACH ASSERTION IS THE SHAPE IT IS
 * =============================================================================================
 * This runs in `gates:party`, i.e. in node, with no browser and no renderer. So it cannot
 * photograph anything, and the handoff's standing rule is *"verify delivered pixels, never
 * authored hex values."* Those two facts are in tension and the resolution is a division of
 * labour, not a compromise:
 *
 *   · **`harness/ballroom-luma.mjs` measures the delivered pixels.** It masks a surface and its
 *     neighbour in the live room and reads the graded frame. That is the instrument; it needs a
 *     browser and it is run by hand.
 *   · **This gate locks the DERIVATION the measurement settled on**, and every number the
 *     measurement produced is written into the assertion's own comment so the next agent can
 *     see what it is standing on.
 *
 * 🚨 **AND THE PROXY IS VALIDATED RATHER THAN ASSUMED, WHICH IS THE ONLY REASON D1 IS GATEABLE
 * THIS WAY.** The authored quantity — `silver x color x (1 - metalness)`, as a Rec709 luminance
 * against the wall paint's — was checked against three measured colours at three stations:
 *
 *     colour      authored ratio   delivered (arch / wide / mirror)
 *     0xc1c5cc        1.044        1.105  1.067  1.076
 *     0xb0b4bd        0.854        0.887  0.834  0.838
 *     0x6e767e        0.334        0.333    —      —
 *
 * The authored ratio tracks the delivered one to within a few points across a 3x range, and it
 * lands on 0.334 against a measured 0.333 at the far end. That is what makes it a proxy worth
 * gating. If a future round changes the LIGHTING rather than the material, this proxy goes
 * stale silently — so re-run `ballroom-luma.mjs` when the rig moves, and if the two disagree,
 * the pixels win and this gate is what gets rewritten.
 *
 * Every assertion here ships with a CONTROL that would fail. Several of the controls are
 * historical values this project actually shipped, which is the strongest kind: the gate is not
 * asked to imagine a regression, it is asked to reject one that happened.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFile(path.join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
const t = (n, c, d = '') => {
  if (c) { pass++; console.log(`  ok   ${n}${d ? ` · ${d}` : ''}`); }
  else { fail++; console.log(`  FAIL ${n}${d ? ` · ${d}` : ''}`); }
};

console.log('\nballroom-dress — the Prime Time ballroom, asserted\n');

/* ---------------------------------------------------------------------------------------------
 * Colour helpers. `THREE.Color.setHex` runs sRGB -> linear under three's colour management, so
 * an authored hex is NOT the number the shader multiplies. Getting this wrong is how a hex
 * "three times the boiserie" gets tinted down by eye and lands 3x too dark instead.
 * ------------------------------------------------------------------------------------------- */
const s2l = (u) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
const hexToLinear = (h) => [16, 8, 0].map((sh) => s2l(((h >> sh) & 255) / 255));
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const roomSrc = await read('src/game/room.js');
const localSrc = await read('src/world/materials-local.js');
const orderSrc = await read('src/world/ballroom-order.js');

/* =============================================================================================
 * D1 · THE PIER GLASSES ARE NOT BRIGHTER THAN THE WALL BEHIND THEM
 * =============================================================================================
 * `docs/handoff/ballroom-next.md` D1, John's *"blank pale slabs"*, and the worst thing in the
 * room. Measured as shipped: plate/wall 1.105 at `arch`, 1.067 at `wide`, 1.076 at `mirror` —
 * brighter than its own wall at EVERY station, which is one station more than the handoff
 * expected ("tuned at `ballroom.east`, does not survive the other wall"; `mirror` IS that wall).
 * ============================================================================================= */
{
  const m = roomSrc.match(/mirror:\s*\(\(\)\s*=>\s*\{\r?\n\s*const mm = L\.foxedMirrorMat\(\{ fox: ([\d.]+), size: (\d+) \}\)\.clone\(\);\r?\n\s*mm\.metalness = ([\d.]+);\r?\n\s*mm\.color = new THREE\.Color\(0x([0-9a-f]{6})\);/);
  t('B1 · the ballroom pier glass is still built the way this gate can read it', !!m,
    m ? `fox ${m[1]} size ${m[2]} metalness ${m[3]} color 0x${m[4]}` : 'PATTERN NOT FOUND in room.js');

  const silverM = localSrc.match(/const o = \{ silver: \[([\d.]+), ([\d.]+), ([\d.]+)\], fox: [\d.]+, size: \d+/);
  t('B2 · foxedMirrorMat still states its silver, which the plate multiplies', !!silverM,
    silverM ? `silver ${silverM.slice(1, 4).join('/')}` : 'PATTERN NOT FOUND in materials-local.js');

  const wallM = roomSrc.match(/wall: L\.boiserieMat\(\{ paint: \[([\d.]+), ([\d.]+), ([\d.]+)\]/g);
  // the BALLROOM's own boiserie is the second such line in the file (the study's is first)
  const ballWallM = roomSrc.match(/ball: \{[\s\S]{0,4000}?wall: L\.boiserieMat\(\{ paint: \[([\d.]+), ([\d.]+), ([\d.]+)\]/);
  t('B3 · the ballroom boiserie still states its paint, which is the reference', !!ballWallM,
    ballWallM ? `paint ${ballWallM.slice(1, 4).join('/')}` : 'PATTERN NOT FOUND');

  if (m && silverM && ballWallM) {
    const silver = silverM.slice(1, 4).map(Number);
    const paint = ballWallM.slice(1, 4).map(Number);
    const metalness = Number(m[3]);
    /** Effective diffuse of the plate: silver x colour x (1 - metalness), as a luminance. */
    const plateOf = (hex) => lum(hexToLinear(hex).map((c, i) => silver[i] * c * (1 - metalness)));
    const wallL = lum(paint);
    const ratioOf = (hex) => plateOf(hex) / wallL;

    const shipped = parseInt(m[4], 16);
    const r = ratioOf(shipped);

    /*
     * THE BAND. Above 0.97 the plate floats over the wall and reads as a blank pale slab, which
     * is the reported defect. Below 0.75 it becomes the OTHER shipped defect — 0x6e767e put four
     * rectangles 3x darker than the wall on the wall the round existed to un-blacken. A dead
     * mirror in a candlelit room is the coldest, darkest surface in it, but it is still a
     * surface and not a hole.
     */
    t('B4 · the plate is DARKER than the ballroom wall it hangs on', r <= 0.97,
      `ratio ${r.toFixed(3)} (delivered: arch 0.887 · wide 0.834 · mirror 0.838)`);
    t('B5 · ...but not a black rectangle — the other direction has shipped too', r >= 0.75,
      `ratio ${r.toFixed(3)}, floor 0.75`);

    /* --- CONTROLS. Both are values this project actually shipped. ------------------------- */
    t('B4c · CONTROL the 0xc1c5cc that shipped the pale slabs fails B4', ratioOf(0xc1c5cc) > 0.97,
      `ratio ${ratioOf(0xc1c5cc).toFixed(3)} — measured 1.105 at arch`);
    t('B5c · CONTROL the 0x6e767e that shipped the black rectangles fails B5', ratioOf(0x6e767e) < 0.75,
      `ratio ${ratioOf(0x6e767e).toFixed(3)} — measured 0.333 at arch`);
    t('B5c2 · CONTROL a pure-white plate fails B4 (the band is not vacuous)', ratioOf(0xffffff) > 0.97,
      `ratio ${ratioOf(0xffffff).toFixed(3)}`);
  }

  /*
   * The foxing is the plate's only drawing, so it is asserted rather than left to taste. It is
   * NOT asserted as "> 0.92" for its own sake: `MIRROR_SURFACE` weights both the tarnish bloom
   * and the lifted-tin pinholes by an `edge` term, so `uFox` grows the corroded margin inward
   * from the rebate — large-scale structure the delivered frame can resolve at 43-53 px/m.
   */
  const fox = m ? Number(m[1]) : 0;
  t('B6 · the foxing is driven hard enough to be the drawing', fox >= 1.0, `fox ${fox}`);
  t('B6c · CONTROL the shipped 0.92 fails B6', !(0.92 >= 1.0), 'fox 0.92');

  /*
   * 🚨 THE SIZE IS 512 ON PURPOSE AND THE HANDOFF'S SUGGESTED 1024 WOULD BUY NOTHING. Measured:
   * an end plate delivers ~11.9k px at `arch` over a 1.70 x 3.10 m plate, i.e. 43-53 px per
   * metre; a 512 bake across 1.70 m is 301 texels per metre, already ~6x finer than the pixels
   * it lands in. This asserts the reasoning stays put, so nobody spends a round re-baking.
   */
  const size = m ? Number(m[2]) : 0;
  t('B7 · the plate bake stays 512 — the screen, not the texture, is the limiter', size === 512,
    `size ${size} · 301 texels/m against 43-53 delivered px/m`);
}

/* =============================================================================================
 * THE STALE PREMISE. Two files documented a material decision on "views/game.js NEVER ASSIGNS
 * scene.environment", which is false — `estate()` sets it unconditionally at intensity 3.20.
 * The handoff calls this out by name ("Fix it while you are in there"). It is gated because a
 * false premise that survived three rounds in two files will come back if only one is fixed.
 * ============================================================================================= */
{
  /*
   * ⚠️ **ASSERTED AS "THE CORRECTION IS PRESENT", NOT AS "THE WORDS ARE ABSENT", AND THE FIRST
   * CUT OF THIS GATE GOT IT WRONG.** Both files now QUOTE the old claim in order to retract it,
   * so a bare "does this file contain the sentence" test fails on the retraction itself. The
   * assertion that carries the meaning is that the truth is stated; the negative is kept, but
   * pinned to the old sentence's ASSERTIVE form (it ended `scene.environment`.** — a quotation
   * of it does not) so a future re-introduction is still caught.
   */
  const assertive = /\*\*`views\/game\.js` NEVER (ASSIGNS|SETS) `scene\.environment`[.`]?\*\*/;
  t('B8 · room.js states the truth: estate() sets scene.environment at 3.20',
    /estate\(\)[\s\S]{0,400}?scene\.environment = buildEstateEnv/.test(roomSrc)
    && /environmentIntensity` at \*\*3\.20\*\*/.test(roomSrc),
    'the premise the pier-glass material was documented on');
  t('B8b · ...and no longer ASSERTS the opposite', !assertive.test(roomSrc));
  t('B9 · ballroom-order.js retracts the same claim rather than repeating it',
    /THIS PARAGRAPH USED TO SAY[\s\S]{0,200}NEVER SETS/.test(orderSrc)
    && !/`views\/game\.js` NEVER SETS `scene\.environment`\*\* — measured, not read/.test(orderSrc),
    'the second file that carried it');
  t('B8bc · CONTROL the retired sentence still matches the pattern that hunts it',
    assertive.test('* 🚨 **`views/game.js` NEVER ASSIGNS `scene.environment`.** Every showcase'),
    'so B8b is not permanently true');
  const studio = await read('src/views/_studio.js');
  t('B8c · CONTROL estate() really does assign it, so B8/B9 are not just deleting a comment',
    /export async function estate\([\s\S]{0,600}?engine\.scene\.environment = buildEstateEnv\(engine\.renderer\)/.test(studio)
    && /engine\.scene\.environmentIntensity = opts\.envIntensity/.test(studio),
    'views/_studio.js estate()');
  const follow = await read('src/views/party-follow.js');
  t('B8c2 · CONTROL and the PRIME TIME view is one of the views that calls it',
    /import \{ estate \} from '\.\/_studio\.js'/.test(follow) && /envIntensity: 3\.20/.test(follow),
    'party-follow.js runs envIntensity 3.20');
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
