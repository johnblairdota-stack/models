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

/* =============================================================================================
 * D2 · THE CHANDELIERS REACH THE FRAME AS HOT GEOMETRY
 * =============================================================================================
 * 🚨 **THE HANDOFF'S D2 IS NOT REPRODUCIBLE, AND THE THING JOHN IS LOOKING AT IS D4's OBJECT.**
 * `docs/handoff/ballroom-next.md` D2 says *"not one chandelier in the room is lit ... something
 * between the merge/harvest path and the frame is eating them"*, citing the `wide`, `mirror` and
 * `up` stations. Measured in the live room instead of read:
 *
 *   · Every merged bucket is DRAWN. `onAfterRender` counters on `fixture:brass/wax/crystal/
 *     emissive/flame/glow` all tick once per frame. Nothing is culled, nothing is eaten.
 *   · The hot geometry is HOT. Masked and read off the delivered frame 4.2 m from the middle
 *     fixture: `fixture:flame` mean **225.5**, `fixture:emissive` mean **224.4**, against a whole
 *     frame mean of **57.5**. The candles are the brightest thing in the room by a factor of four.
 *   · Photographed: `progress/luma/d2.rig-chandelier.png` — lit candles, warm halos, gilt corona.
 *
 * What IS unlit is the OTHER chandelier. The ballroom carries two independent sources and only
 * one is the rig's: `furn-layout.js` also hangs the catalog GLB `rrr_prop_chandelier_v1.glb` at
 * `liftY 2.85`. That prop is a static mesh with modelled candles and NO flames, and at 2.85 m in
 * a 9.6 m room it is the one at eye level — the huge foreground fixture at `wide`, and both of
 * the low ones at `mirror`. The rig's hang with their coronas at ~7.3 m. So the fixture the
 * defect describes is the fixture handoff D4 asks to delete, and D4 is D2's fix.
 *
 * The two claims D2 rests on are both true and both harmless: `intensity: 0` is the POINT LIGHT
 * count, which `ballroom-rig.js` defends at length as a deliberate zero; and `setLit` has no
 * call site because `chandelier.js` defaults `state.lit = 1`, so nothing needs to call it.
 *
 * Nothing here is therefore a fix. It is a NET, because the failure the handoff imagined is one
 * frame-cull away from being real — see the NaN control below.
 * ============================================================================================= */
{
  const { ballroomPlan } = await import('../src/world/ballroom-order.js');
  const { ballroomFixtures } = await import('../src/lighting/ballroom-rig.js');
  const { FixtureBin } = await import('../src/lighting/fixture-merge.js');
  const THREE = await import('three');

  const plan = ballroomPlan({ x0: 0.15, x1: 27.35, z0: 38.6, z1: 53.9, h: 9.6 });
  const fx = ballroomFixtures({ plan, points: 3, rng: () => 0.5 });
  const byName = new Map(fx.meshes.map((m) => [m.name, m]));
  const tris = (m) => (m ? Math.round((m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3) : 0);
  const finite = (m) => {
    const b = m?.geometry?.boundingSphere;
    return !!b && Number.isFinite(b.radius) && Number.isFinite(b.center.x) && Number.isFinite(b.center.y) && Number.isFinite(b.center.z);
  };

  /* The three buckets that carry every hot thing in the room. `emissive` is the candle cores,
   * `flame` the additive envelopes, `glow` the halos and washes. Lose any one and the room stops
   * being a lit venue. */
  for (const name of ['fixture:emissive', 'fixture:flame', 'fixture:glow']) {
    t(`B10 · ${name} is built and carries geometry`, tris(byName.get(name)) > 0,
      `${tris(byName.get(name))} tris`);
    t(`B11 · ${name} has a FINITE bounding sphere, so three can never cull it away`,
      finite(byName.get(name)),
      byName.get(name)?.geometry?.boundingSphere ? `r=${byName.get(name).geometry.boundingSphere.radius.toFixed(1)}` : 'no sphere');
  }
  t('B12 · the candles emit — the emissive bucket carries HDR vertex colours above 1.0',
    (() => {
      const c = byName.get('fixture:emissive')?.geometry?.attributes?.color;
      if (!c) return false;
      let mx = 0;
      for (let i = 0; i < c.count; i++) mx = Math.max(mx, c.getX(i), c.getY(i), c.getZ(i));
      return mx > 1.0;
    })(), 'delivered mean 225.5 against a frame mean of 57.5');

  /* --- CONTROLS ------------------------------------------------------------------------ */
  /*
   * 🚨 **THE NaN CONTROL IS A REAL FAILURE, HIT WHILE WRITING THIS GATE, NOT AN IMAGINED ONE.**
   * `ballroomFixtures` reads `P.deckLen` for the musicians' gallery wash. A plan without it makes
   * two glow patches NaN; `mergeGeometries` accepts them, `computeBoundingSphere` returns NaN,
   * and three's frustum test against a NaN sphere is FALSE — so the ENTIRE glow bucket is culled
   * every frame with no error and nothing missing from the scene graph. That is exactly the
   * "something between the merge and the frame is eating them" the handoff feared, and it is one
   * missing plan field away at all times. `fixture-merge.js` now warns and disables culling; this
   * asserts the detector still detects.
   */
  /* three dumps the whole offending BufferGeometry to console.error for a NaN radius, and
   * `fixture-merge` then warns. Both are the POINT of this control, and both would bury the
   * gate's own output in CI, so they are captured rather than printed. */
  const realErr = console.error, realWarn = console.warn;
  let noise = 0;
  console.error = () => { noise++; }; console.warn = () => { noise++; };
  const lame = ballroomFixtures({ plan: { ...plan, deckLen: undefined }, points: 0, rng: () => 0.5 });
  console.error = realErr; console.warn = realWarn;
  const lameGlow = lame.meshes.find((m) => m.name === 'fixture:glow');
  t('B11c0 · CONTROL ...and it is NOISY about it rather than silent', noise >= 2,
    `${noise} console messages raised`);
  t('B11c · CONTROL a plan missing deckLen really does produce a non-finite glow bucket',
    !!lameGlow && !finite(lameGlow), 'the silent room-wide cull B11 exists to catch');
  t('B11c2 · CONTROL ...and fixture-merge turns that from silent into loud + still drawn',
    !!lameGlow && lameGlow.frustumCulled === false,
    'frustumCulled off, console warning raised');

  /*
   * The routing control. `FixtureBin` decides "flame" from ADDITIVE blending alone, so if that
   * discriminator ever inverts, every candle envelope silently becomes opaque geometry.
   */
  const mk = (blending) => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, blending }));
    const grp = new THREE.Group(); grp.add(m); return grp;
  };
  const addBin = new FixtureBin().harvest(mk(THREE.AdditiveBlending));
  const normBin = new FixtureBin().harvest(mk(THREE.NormalBlending));
  t('B13 · an additive basic material is bucketed as flame', addBin.flame.length === 1 && addBin.emissive.length === 0);
  t('B13c · CONTROL a normally-blended one is NOT — the discriminator is blending, not name',
    normBin.flame.length === 0 && normBin.emissive.length === 1);
}

/* =============================================================================================
 * D4 · THE CATALOG CHANDELIER IS NOT PART OF THE BALLROOM'S DRESS
 * =============================================================================================
 * John: *"there are two placed chandeliers that are lower seen in wide. Delete them from the
 * ballroom spawn. the other two are part of the asset."* Confirmed in the live room: the catalog
 * prop `r0.ballroom.chandelier.*` sits at world y **2.85** on the room centre line, +/- 4.28 m in
 * z, i.e. at eye level under a 9.6 m ceiling, while the rig's fixtures hang at ~7.3 m.
 *
 * ⚠️ **THE ROW STAYS IN THE LAYOUT WITH AN EMPTY `rooms`, IT IS NOT DELETED.** `pickSpaces`
 * reads `assign.rooms` for every recipe in `FURN_LINE`; removing the key would throw on a
 * missing binding rather than place nothing. An empty list places nothing, keeps the prop
 * available to other rooms as the handoff asks, and keeps the reason next to the decision.
 * ============================================================================================= */
{
  const layout = await read('src/game/furn-layout.js');
  const m = layout.match(/\n\s*chandelier:\s*\{ rooms: \[([^\]]*)\], avoid: \[([^\]]*)\]/);
  t('B14 · the catalog chandelier binding is still readable', !!m,
    m ? `rooms: [${m[1]}] avoid: [${m[2]}]` : 'PATTERN NOT FOUND');
  t('B15 · the ballroom is not among its rooms', !!m && !/ballroom/.test(m[1]), m ? `rooms: [${m[1]}]` : '');
  t('B15b · ...and the ballroom is explicitly AVOIDED, which the leftover pass also reads',
    !!m && /'ballroom'/.test(m[2]), m ? `avoid: [${m[2]}]` : '');
  t('B15d · it is rehomed rather than orphaned — party-warm W14n needs all 24 smash ids placed',
    !!m && m[1].trim().length > 0, m ? `rooms: [${m[1]}]` : '');
  t('B15c · CONTROL the check can see a ballroom binding when there is one — the piano still has one',
    /'grand-piano':\s*\{ rooms: \[[^\]]*'ballroom'/.test(layout),
    'so B15 is not passing because the regex matches nothing');
  t('B16 · the prop stays in the catalog for other rooms to use',
    /id: 'chandelier', file: 'rrr_prop_chandelier_v1\.glb'/.test(await read('src/game/furn-catalog.js')));

  /* =========================================================================================
   * 🚨 **B17 IS BEHAVIOURAL, AND IT IS HERE BECAUSE B15 ALONE WAS NOT ENOUGH.** Unbinding the
   * chandelier from the ballroom made B15 pass while a chandelier was STILL hanging at 2.85 m in
   * the live room, under the id `r0.ballroom.chandelier.fb`. `catalogPlacements` has a leftover
   * pass for props whose preferred room is missing from a generated house, and it deliberately
   * ignores `assign.rooms` — so unbinding the prop simply routed it down there and it was
   * re-placed in the very room it had been removed from. A source-grep gate would have shipped
   * that. This one runs the planner.
   * ========================================================================================= */
  const { catalogPlacements } = await import('../src/game/furn-layout.js');
  const spaces = [
    { id: 'r0.ballroom', roomType: 'ballroom', x0: 0.15, x1: 27.35, z0: 38.6, z1: 53.9 },
    { id: 'r0.study', roomType: 'study', x0: 0, x1: 9, z0: 0, z1: 9 },
    { id: 'r0.gallery', roomType: 'gallery', x0: 0, x1: 18, z0: 12, z1: 21 },
  ];
  const placed = catalogPlacements(spaces, []);
  const chand = placed.filter((q) => q.catalogId === 'chandelier');
  t('B17 · the planner puts no catalog chandelier in the ballroom',
    chand.every((q) => q.spaceId !== 'r0.ballroom'),
    chand.length ? chand.map((q) => `${q.id}@${q.spaceId}`).join(', ') : 'none placed at all');
  t('B17b · ...and it still places one somewhere, so the smashable is reachable',
    chand.length >= 1, `${chand.length} placed`);

  /*
   * 🚨 **B17d IS THE ONE THAT CAUGHT THE REAL BUG.** A house with NO gallery sends the prop to
   * the leftover pass, which ignores `rooms` by design. Without `avoid` it landed straight back
   * in the ballroom while every binding-shaped assertion above stayed green.
   */
  const noGallery = catalogPlacements(spaces.filter((q) => q.roomType !== 'gallery'), []);
  const chand2 = noGallery.filter((q) => q.catalogId === 'chandelier');
  t('B17d · a house with no gallery still keeps it out of the ballroom (the leftover pass)',
    chand2.every((q) => q.spaceId !== 'r0.ballroom'),
    chand2.length ? chand2.map((q) => `${q.id}@${q.spaceId}`).join(', ') : 'none placed');
  t('B17c · CONTROL the planner is doing real work — it places other props in the ballroom',
    placed.some((q) => q.spaceId === 'r0.ballroom' && q.catalogId !== 'chandelier'),
    `${placed.length} placements total, ${placed.filter((q) => q.spaceId === 'r0.ballroom').length} in the ballroom`);
  t('B17c2 · CONTROL both passes read `avoid`, not just the preference pass',
    /if \(seen\.has\(s\.id\) \|\| avoid\.has\(spaceKind\(s\)\)\) continue;/.test(layout)
    && /!avoid\.has\(spaceKind\(s\)\)\)/.test(layout),
    'pickSpaces and the leftover pass');
}

/* =============================================================================================
 * D3 · THE MARBLE BORDER DOES NOT OUT-SHOUT THE FLOOR IT RINGS
 * =============================================================================================
 * Handoff D3, and it is OUR defect rather than the asset's: the port carried the shared
 * `marbleChequer` across unchanged, and under the night grade *"the white tiles run near-clipping
 * while the parquet sits mid-tone, so a hard black-and-white band rings the entire room at the
 * wall base and drags the eye straight off the players in the middle."*
 *
 * 🚨 **THE MEAN CANNOT SEE THIS DEFECT AND NEARLY BURIED IT.** Half the surface is Nero
 * Marquina at 0.070 albedo, so the band's MEAN measured 0.72 / 0.63 / 0.80 against the parquet —
 * comfortably darker, apparently fine — while its white tiles were the brightest thing in the
 * frame. `ballroom-luma.mjs` compares the p90 for this probe instead, and that is where the
 * defect is:
 *
 *     station   white tile p90   parquet p90   before  ->  after
 *     floor          167.0          159.6       1.05       0.79
 *     mirror         127.1          144.6       0.88       0.64
 *     arch           150.3          120.8       1.24       0.88
 *     corner           —              —         1.01*      0.96     (* measured mid-fix)
 *
 * ⚠️ **`corner` WAS ADDED TO THE PROBE MID-FIX AND IT EARNED ITS PLACE IMMEDIATELY.** Three
 * stations had cleared 1.00 when it was first measured, and it read 1.01 — a window throws a
 * hard pool onto the border there. Deriving a value at some stations and never checking it at
 * the rest is exactly how D1 shipped twice, so a fourth station is now in the list.
 *
 * ⚠️ **AND UNLIKE D1, THERE IS NO AUTHORED PROXY FOR THIS ONE — DO NOT INVENT ONE.** D1's
 * plate/wall ratio could be gated on `silver x colour x (1 - metalness)` because that quantity
 * was checked against the delivered pixels at three stations and tracked them. It does NOT work
 * here: the border's authored luminance is 0.581 against the parquet oak's 0.424, i.e. still
 * *brighter on paper*, while delivering 0.83-0.94 — because the parquet is a large lit field and
 * the border sits in shadow at the wall base. Any gate on authored albedo alone would be
 * asserting a relationship that is false. So this gate locks the INPUTS the measurement settled
 * on, and `ballroom-luma.mjs --probe chequer` stays the authority on the outcome.
 * ============================================================================================= */
{
  /* The shared defaults, read from source rather than copied, so the controls below are the
   * values this project actually ships and cannot drift from them. */
  const base = localSrc.match(/const MARBLE_BASE = \{[\s\S]*?groundA: \[([\d.]+), ([\d.]+), ([\d.]+)\], veinA: \[([\d.]+), ([\d.]+), ([\d.]+)\],\r?\n\s*groundB: \[[\d., ]+\], veinB: \[([\d.]+), ([\d.]+), ([\d.]+)\]/);
  t('B18 · MARBLE_BASE still states the shared Carrara, which is the control', !!base,
    base ? `groundA ${base.slice(1, 4).join('/')} veinB ${base.slice(7, 10).join('/')}` : 'PATTERN NOT FOUND');

  const ball = roomSrc.match(/chequer: L\.estateMarbleChequer \? L\.estateMarbleChequer\(\{\r?\n\s*groundA: \[([\d.]+), ([\d.]+), ([\d.]+)\], veinA: \[[\d., ]+\],\r?\n\s*veinB: \[([\d.]+), ([\d.]+), ([\d.]+)\],\r?\n\s*wear: ([\d.]+), dust: ([\d.]+), size: (\d+),/);
  t('B19 · the ballroom bakes its OWN chequer rather than taking the shared singleton', !!ball,
    ball ? `groundA ${ball.slice(1, 4).join('/')} veinB ${ball.slice(4, 7).join('/')} wear ${ball[7]} dust ${ball[8]}` : 'PATTERN NOT FOUND');

  /*
   * 🚨 **A SEPARATE BAKE IS NOT COSMETIC — `views/room-ballroom.js` IS PINNED.** `marbleChequer`
   * is a module-level singleton in `materials-local.js` and the showcase draws its floor with it,
   * under a pixel-diff gate and a darkest-decile grade gate running 7.7 against a ceiling of 8.0.
   * Mutating the shared entry to fix the game would have moved the showcase's floor.
   */
  t('B19b · ...and the shared singleton is left alone, because the showcase view is pinned',
    /marbleChequer: \(\) => estateMarbleChequer\(\),/.test(localSrc)
    && /\}\) : mats\.marbleChequer,/.test(roomSrc)
    && !/chequer: mats\.marbleChequer,/.test(roomSrc),
    'materials-local keeps its default; room.js reaches it only as a fallback');

  if (base && ball) {
    const lumOf = (a) => 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    const baseGround = lumOf(base.slice(1, 4).map(Number));
    const ballGround = lumOf(ball.slice(1, 4).map(Number));
    const baseVeinB = lumOf(base.slice(7, 10).map(Number));
    const ballVeinB = lumOf(ball.slice(4, 7).map(Number));

    t('B20 · the white tile is darkened well below the showcase Carrara',
      ballGround <= baseGround * 0.75,
      `${ballGround.toFixed(3)} against ${baseGround.toFixed(3)} (${(ballGround / baseGround).toFixed(2)}x) · delivered p90 0.79 / 0.64 / 0.88 / 0.96`);
    t('B20c · CONTROL the shared Carrara fails B20 — it is the value that shipped the band',
      !(baseGround <= baseGround * 0.75), `${baseGround.toFixed(3)}`);

    /*
     * 🚨 **`veinB` IS THE SMEARED DIRT, AND THE HANDOFF NAMES THE WRONG KNOB.** D3 blames
     * `wear: 0.45` for the splotchy mottle on the black tiles. Read the shader: `uWear` drives
     * `traffic`, which is spent on ROUGHNESS (`rough += traffic * 0.115`) and on 2.8% of albedo.
     * It cannot make a blotch. `veinB` can — near-WHITE veining at 0.880 over a 0.070 ground is
     * a 12:1 contrast that stops resolving as veins at TV distance and averages into grey smears.
     */
    t('B21 · the dark tile\'s veining is brought down out of smear territory',
      ballVeinB <= baseVeinB * 0.55,
      `veinB luma ${ballVeinB.toFixed(3)} against ${baseVeinB.toFixed(3)}`);
    t('B21c · CONTROL the shipped veinB fails B21', !(baseVeinB <= baseVeinB * 0.55));
    t('B21n · the shader still spends uWear on roughness, so blaming it for a blotch stays wrong',
      /rough\s*\+=\s*traffic \* 0\.115/.test(localSrc) && /col\s*\*=\s*1\.0 - traffic \* 0\.028/.test(localSrc),
      'the note in room.js depends on this');

    t('B22 · wear and dust are both cut, as the handoff asks',
      Number(ball[7]) < 0.45 && Number(ball[8]) < 0.6,
      `wear ${ball[7]} (was 0.45) · dust ${ball[8]} (was 0.6)`);
  }
}

/* =============================================================================================
 * D5 · THE CENTRE OF THE CEILING IS COFFERED LIKE THE REST OF IT
 * =============================================================================================
 * John: *"there is also a big blank square on the roof in the center of the room."* Confirmed at
 * the `up` station — a large flat cream panel with no beams crossing it, while every surrounding
 * bay has the grid.
 *
 * 🚨 **IT WAS NEVER MISSING GEOMETRY, SO THE HANDOFF'S FIX WOULD HAVE FOUND NOTHING.** D5 guesses
 * *"find why the centre bay has no beams (a rose/boss exclusion is the likely cause) and turn the
 * boss on"*. `cofferedCeiling` is gated on `o.boss !== false` and the ballroom never passes it —
 * so the bosses were already on. Recorded headless, the builder emits X-beams at cx +/- 1.78,
 * 5.34, 8.89, 12.45, Z-beams at cz and cz +/- 3.25, 6.50, and 28 bosses. Projected into the `up`
 * frame those land at screen x 57/319/581/843 and screen y 61/300/539, and the mask shows nothing
 * at 319, 581 or the middle of 300.
 *
 * What was there instead was found by ablation, one merged bucket at a time. Hiding
 * `fixture:wax` alone took the centre band from luma 225.0 to 138.5; every other bucket moved it
 * by two or less. The chandelier's **ceiling caustic** is an additive `ShaderMaterial` whose
 * uniforms are `uColor/uStrength/uTime/uArms` — no `uPow` — so `FixtureBin.isGlow` rejected it,
 * it is not a `MeshBasicMaterial` either, and it fell through to `bucketFor`, whose rule is
 * "not the brass or crystal the caller named, therefore WAX". A 7.15 m additive quad became an
 * opaque cream slab of candle wax at y 9.03, directly under the coffer soffit at 9.24, one per
 * chandelier. `ballroomFixtures` had asked for `caustic: 0` — but `uStrength` lives in the
 * material the merge path discards.
 * ============================================================================================= */
{
  const THREE = await import('three');
  const { buildChandelier } = await import('../src/world/chandelier.js');
  const { FixtureBin } = await import('../src/lighting/fixture-merge.js');
  const { ballroomPlan } = await import('../src/world/ballroom-order.js');
  const { ballroomFixtures } = await import('../src/lighting/ballroom-rig.js');
  const chandSrc = await read('src/world/chandelier.js');

  const hangs = (r) => { let f = false; r.traverse((o) => { if (o.name === 'caustic') f = true; }); return f; };
  const off = buildChandelier({ merge: true, arms: 8, tiers: 2, radius: 1.10, chain: 1.5, caustic: 0, rng: () => 0.5 });
  const on = buildChandelier({ merge: true, arms: 8, tiers: 2, radius: 1.10, chain: 1.5, caustic: 0.5, rng: () => 0.5 });
  t('B23 · a chandelier asked for caustic 0 hangs no decal at all', !hangs(off.root));
  t('B23c · CONTROL one asked for caustic 0.5 still hangs it', hangs(on.root),
    'the showcases pass 0.22 / 0.85 / 0.35 and must be untouched');
  t('B23c2 · CONTROL the PINNED showcase really does pass a non-zero caustic',
    /caustic: 0\.22, causticSize/.test(await read('src/views/room-ballroom.js')),
    'views/room-ballroom.js is pixel-diff gated');

  /*
   * The mechanism, asserted so the explanation above cannot quietly go stale: the caustic is
   * NOT recognisable as a glow decal, and `glowPatch` is. If someone gives the caustic a `uPow`
   * one day, B24 is the one that should be revisited.
   */
  const causticBlock = chandSrc.match(/function causticDecal[\s\S]*?\n\}/);
  t('B24 · causticDecal still declares no uPow, which is why isGlow rejects it',
    !!causticBlock && /uStrength:/.test(causticBlock[0]) && !/uPow/.test(causticBlock[0]));
  t('B24c · CONTROL glowPatch DOES declare one, so the discriminator is real',
    /uPow: \{ value: o\.pow \?\? 2\.4 \}/.test(await read('src/lighting/volumetric.js')));

  /*
   * 🚨 **THE CLASS, NOT JUST THE INSTANCE.** `bucketFor` is a catch-all, so ANY future
   * transparent decal that is not recognised as a glow would be baked into the opaque bucket and
   * hide whatever stands behind it. The harvest now drops it loudly instead.
   */
  const mk = (mat) => { const g = new THREE.BoxGeometry(1, 1, 1); const m = new THREE.Mesh(g, mat); const gr = new THREE.Group(); gr.add(m); return gr; };
  const addShader = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uStrength: { value: 0.5 } },
    transparent: true, blending: THREE.AdditiveBlending,
  });
  const realErr2 = console.warn; let warned = 0; console.warn = () => { warned++; };
  const dropped = new FixtureBin().harvest(mk(addShader));
  console.warn = realErr2;
  t('B25 · an additive decal with no uPow lands in NO opaque bucket',
    dropped.wax.length === 0 && dropped.brass.length === 0 && dropped.emissive.length === 0
    && dropped.flame.length === 0 && dropped.glow.length === 0,
    `wax ${dropped.wax.length} · glow ${dropped.glow.length}`);
  t('B25b · ...and it says so rather than vanishing quietly', warned >= 1, `${warned} warning(s)`);
  const kept = new FixtureBin().harvest(mk(new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0 })));
  t('B25c · CONTROL an ordinary opaque standard material still lands in wax',
    kept.wax.length === 1, 'the guard rejects transparency, not everything');

  /*
   * And the outcome, on the real room: the merged wax bucket must not reach the ceiling. The
   * caustic slab sat at y 9.03 under a soffit at 9.24; the topmost real wax is a candle on a
   * chandelier corona at ~7.3.
   */
  const plan = ballroomPlan({ x0: 0.15, x1: 27.35, z0: 38.6, z1: 53.9, h: 9.6 });
  const fx = ballroomFixtures({ plan, points: 3, rng: () => 0.5 });
  const wax = fx.meshes.find((m) => m.name === 'fixture:wax');
  wax?.geometry.computeBoundingBox();
  const waxTop = wax ? wax.geometry.boundingBox.max.y : Infinity;
  t('B26 · nothing in the merged wax bucket reaches the coffered ceiling',
    waxTop < 8.0, `wax tops out at ${waxTop.toFixed(2)} m, soffit is at 9.24 (was 9.03)`);

  /* The bosses were never off. Asserted so nobody spends a round turning them on. */
  const kit = await read('src/world/kit.js');
  const order = orderSrc;
  t('B27 · every coffer still gets a boss — it was never the cause',
    /if \(o\.boss !== false\) \{/.test(kit) && !/boss: false/.test(order),
    'cofferedCeiling emits 28 of them in this room');
}

/* =============================================================================================
 * THE GILT SKIRTING — AND THE CONSTRAINT JOHN NAMED IS THE WHOLE PROBLEM
 * =============================================================================================
 * John: *"there is also a golden skirting that traces the edges of the room that we need to add.
 * Its important that skirting doesn't block the arch way."*
 *
 * `wallRun` has owned a moulded gilt skirting all along, and this room turns it off
 * (`skirtLower: false`) for two reasons that both still hold: it would double-draw and z-fight
 * with `buildWall`'s own flush box, and it is ONE CONTINUOUS EXTRUSION that openings do not cut.
 * That is not hypothetical — the dado rail did exactly this, crossed three doorways at 0.92 m,
 * read as a barrier, and is why `dado: { end: false }` exists to this day.
 *
 * So placement stays with `buildWall`, whose sorted walk already emits skirting PER SEGMENT
 * between the cuts because it is the thing that knows where the openings are. The segments stop
 * being flush grey boxes and start being the kit's own moulded profile in the gilt bucket. The
 * arch gets its jambs for free: the walk never had a segment there to begin with.
 * ============================================================================================= */
{
  const kit = await read('src/world/kit.js');

  t('B28 · the ballroom order opts into a gilt skirting', /giltSkirt: true,/.test(roomSrc));
  t('B29 · ...and it is placed by buildWall, which segments per opening',
    /skirtMould: \(ord\?\.giltSkirt && kitMod\?\.extrudeProfile/.test(roomSrc)
    && /const M = o\.skirtMould;/.test(roomSrc),
    'the same walk that emits the wall between the cuts');
  t('B30 · it uses the kit\'s own moulded profile, not a box',
    /geo: \(len\) => kitMod\.extrudeProfile\(kitMod\.skirtProfile\(0\.34, 0\.055\), len\)/.test(roomSrc)
    && /export function skirtProfile/.test(kit),
    'skirtProfile at SKIRT_H 0.34, 55 mm proud');
  t('B31 · it lands in the gilt bucket, so it is +0 draw calls', /key: 'gilt',/.test(roomSrc));

  /*
   * 🚨 **THE DOUBLE-DRAW GUARD.** Turning `wallRun`'s continuous run back on IS the obvious
   * "fix", and it both z-fights the box below it and runs straight across every doorway. If
   * `skirtLower` ever goes true while `buildWall` is still emitting, the room gets both.
   */
  t('B32 · wallRun\'s continuous skirting stays OFF, or the room draws two of them',
    /skirtLower: false, skirtUpper: true,/.test(roomSrc),
    'and that one does not stop at a jamb');

  /*
   * The emitter must be the SEGMENT emitter. `skirt(w, u)` is called from exactly two places in
   * the walk -- the infill before a cut and the tail after the last one -- and never for the
   * span of a cut. That is the property that keeps the moulding out of the archway, so it is
   * the property under lock rather than the picture.
   */
  const walk = roomSrc.match(/const cuts = \[\.\.\.o\.cuts\][\s\S]*?if \(o\.u1 - cursor > 0\.01\) \{[\s\S]{0,220}?\}/);
  t('B33 · skirt() is only ever called where the walk has just emitted WALL', !!walk
    && (walk[0].match(/skirt\(w, cursor \+ w \/ 2\);/g) || []).length === 2
    && !/skirt\(c\.w/.test(walk[0]),
    'twice: the infill before a cut, and the tail after the last one — never across one');

  /* --- CONTROLS ------------------------------------------------------------------------- */
  t('B30c · CONTROL a room WITHOUT giltSkirt still gets the flush box, unchanged',
    /if \(!M\) \{\r?\n\s*if \(alongZ\) put\('skirt', w \* k, 0\.34, o\.t \+ 0\.03, u, 0\.17, o\.at, 0\.6\);/.test(roomSrc),
    'twelve other rooms are byte-identical');
  t('B30c2 · CONTROL only ONE order opts in — this is not on for the whole house',
    (roomSrc.match(/giltSkirt: true,/g) || []).length === 1);

  /*
   * The basis, not a rotation. `extrudeProfile` builds along +X with the profile's projection on
   * +Z, so each of the four walls needs a different frame; built from a basis the handedness is
   * right by construction, and a mirrored one would push the moulding INTO the wall on two walls
   * out of four — which reads as "no skirting on that side" rather than as an error.
   */
  t('B34 · the run is framed by a basis, so all four walls project into the room',
    /makeBasis\(ex, ey, ez\)/.test(roomSrc)
    && /const ex = alongZ \? new THREE\.Vector3\(inward, 0, 0\) : new THREE\.Vector3\(0, 0, -inward\)/.test(roomSrc)
    && /inward: \(side === 'zmin' \|\| side === 'xmin'\) \? 1 : -1,/.test(roomSrc));
  t('B34c · CONTROL the emitter offsets to the ROOM-side face, not the wall centre',
    /const face = o\.at \+ inward \* \(o\.t \/ 2 \+ 0\.001\);/.test(roomSrc),
    'at the centre line it would be half-buried in the wall');
}

/* =============================================================================================
 * D6 · THE COLOUR ERRORS — MEASURED, AND NEITHER ONE IS WHAT IT LOOKS LIKE
 * =============================================================================================
 * Handoff D6 reports two things, both marked *"Suspected, not diagnosed."* Both were diagnosed
 * by measuring the delivered frame, and neither survives it.
 *
 * ---------------------------------------------------------------------------------------------
 * (a) *"Green/teal cast on the ceiling beams: the left beam reads olive, the right teal."*
 * ---------------------------------------------------------------------------------------------
 * 🚨 **THERE IS NO TEAL IN THE FRAME.** Sampled off the `up` station, every gilt patch is orange
 * to yellow — teal would need blue above red and nothing comes close:
 *
 *     patch                       r     g     b     hue     sat
 *     left beam, lower          162.6 108.6  41.9   33deg   74%
 *     right beam, lower          26.0  10.3   2.2   20deg   91%
 *     left beam, upper           37.3  28.9  11.2   41deg   70%
 *     right beam, upper         140.6 136.3 103.6   53deg   26%   <- the one that reads olive
 *     ceiling pan (reference)    93.0  67.2  47.0   26deg   50%
 *
 * The beam that reads olive measures a pale KHAKI, and it reads green because it sits against a
 * strongly orange pan — simultaneous contrast, not a green pixel. It is desaturated because a
 * warm additive ceiling wash blooms over it and pushes all three channels toward white; the same
 * material two metres away is 74-91% saturated gold. So it is neither "a coloured practical
 * bleeding" nor "a wrong key": one material, one mesh, different amounts of bloom on it.
 *
 * ⚠️ **AND THE LEVER IS A SOLVED PROBLEM, SO IT IS NOT TOUCHED HERE.** The only thing that would
 * change it is the ceiling wash strength, and `beams-1` established that a patch needs
 * `strength >= 0.24` merely to clear the grade's hard black point, shipping the one that works
 * at 0.85. Trading a lit ceiling for a more saturated beam is a design decision, not a fix.
 *
 * ---------------------------------------------------------------------------------------------
 * (b) *"Two different window treatments on one wall ... looks like a material misassignment on
 * one bay."*
 * ---------------------------------------------------------------------------------------------
 * 🚨 **A PER-BAY MISASSIGNMENT IS STRUCTURALLY IMPOSSIBLE HERE.** Every bay is emitted by ONE
 * `windowBay` call inside ONE loop over `winZ`, with ONE key set. Masked live at the `corner`
 * station, both bays are covered by the same meshes and the room contains exactly one of each.
 *
 * What the report describes is BOTH treatments, present on BOTH bays, in different proportions:
 * `lead: 'gilt'` is the thin gold glazing bar and `reveal/trim/stone: 'wintrim'` is the pale
 * grey stone reveal, and which dominates depends on the angle. The centre bay additionally has
 * the curtain across it (5819 px of `kit:drape` against 0 on the left) and 45% more of the
 * additive window wash (26679 px against 18185).
 * ============================================================================================= */
{
  const kit = await read('src/world/kit.js');

  const wb = (orderSrc.match(/windowBay\(B, \{/g) || []).length;
  t('B35 · the ballroom emits its window bays from exactly ONE call', wb === 1, `${wb} call(s)`);
  t('B36 · ...inside one loop over winZ, so every bay gets the same keys',
    /for \(const wz of winZ\)[\s\S]{0,900}?windowBay\(B, \{/.test(orderSrc));
  t('B37 · and that key set names BOTH treatments the report calls two',
    /keys: \{ reveal: 'wintrim', trim: 'wintrim', stone: 'wintrim', glass: 'glass', lead: 'gilt' \}/.test(orderSrc),
    "lead -> gilt is the gold bar, wintrim -> stone is the pale grey reveal");

  /*
   * One key is one bucket is one mesh — that is `GeoBin.build`'s whole shape, and it is what
   * makes a per-bay misassignment impossible rather than merely absent today.
   */
  t('B38 · GeoBin still builds exactly one mesh per key',
    /for \(const \[key, arr\] of this\.bins\) \{[\s\S]{0,700}?const mesh = new THREE\.Mesh\(merged, mat\);/.test(kit),
    'so "the same key" and "the same mesh" cannot come apart');
  t('B39 · the ballroom routes the glazing to one bucket and the bars to another',
    /glass: 'clere'/.test(roomSrc) && /wintrim: 'skirt'/.test(roomSrc) && /gilt: 'gilt'/.test(roomSrc),
    'glass -> clere · lead -> gilt · reveal/trim/stone -> skirt');

  /* --- CONTROLS ------------------------------------------------------------------------- */
  t('B36c · CONTROL the room really does have several window bays, so "one call" means several',
    /window: Math\.max\(2, Math\.round\(sp\.d \/ 1\.95\)\)/.test(roomSrc),
    'one call, one key set, many bays');
  t('B39c · CONTROL the remap table is real — it moves keys rather than passing them through',
    /marbleTop: 'floormarble', marbleFloor: 'floormarble'/.test(roomSrc)
    && /stone: 'skirt', wintrim: 'skirt'/.test(roomSrc),
    'if it were identity, B39 would pass vacuously');
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
