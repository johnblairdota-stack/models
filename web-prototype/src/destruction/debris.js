import * as THREE from 'three';

/**
 * Debris burst for a stage transition.
 *
 * The README's model is explicit that the authored stage change is the hero state and
 * Chaos is used only for the transient burst. Same split here: the wall's look comes from
 * the baked layers, and this adds the short-lived shower of material at the hit point.
 *
 * WHAT ROUND 3 GOT WRONG. The critic's words were "flat-shaded quads and triangles with a
 * hard straight edge and zero thickness — tan and dark-brown cardboard cut-outs". Three
 * causes, all fixed here:
 *
 *  1. NO THICKNESS. Wallpaper was a PlaneGeometry and plaster was a regular dodecahedron.
 *     A regular solid reads as a die and a plane reads as card. Every chunk is now a
 *     BROKEN solid: the base primitive is jittered on shared vertices so it stays closed
 *     but no two faces are parallel and no edge is straight, and the wallpaper scrap is
 *     two skinned layers with a torn outline and a curl.
 *  2. ONE COLOUR PER CHUNK. Real plaster and lath have a dirty weathered face and a
 *     clean pale BROKEN CORE — that contrast is the single loudest cue that a piece has
 *     just been torn out of a wall. Each geometry now carries vertex colours that paint
 *     the fracture faces pale and the original surface dirty, and each instance gets its
 *     own tint on top, so no two chunks are the same value.
 *  3. EVERYTHING WAS THE SAME TAN. The four materials were 0xd6cfc0 / 0xb8a184 /
 *     0xbda487 / 0xa08560 — one hue family, which is why the burst read as a single
 *     cardboard material. They are now separated the way the reference photographs
 *     separate them: chalky near-white plaster, warm mid-brown lath, grey-brown framing.
 *
 * PERFORMANCE IS STILL THE WHOLE DESIGN. The spec is 60 fps at 1080p on integrated
 * graphics *while a wall is collapsing*, so:
 *   - one InstancedMesh per material, allocated once at construction, never grown
 *   - a ring buffer, so a burst costs zero allocation and zero GC
 *   - integration is a dozen lines of float maths per particle, no physics engine
 *   - dead particles are scaled to zero rather than removed
 *   - the extra silhouette and colour detail is all baked into geometry that is uploaded
 *     once; per-frame cost is unchanged
 *
 * ---------------------------------------------------------------------------------------
 * 🧱 **ROUND 12 (`debris-1`, 2026-08-09): THE MATERIAL WAS ALREADY THERE AND IT WAS LYING IN
 * ONE PLANE.**
 * ---------------------------------------------------------------------------------------
 * `critic-slice-3` ranked *"the floor stays clean"* #1 of everything between the build and
 * John's art: *"the game produces six to ten chips the size of a hand, in a thin line at the
 * skirting."* The obvious brief — throw more, throw bigger — was **refuted by the first
 * measurement** (`harness/scenarios/debris-floor.mjs`, 8 blows in the service passage):
 *
 *   · **201 pieces were already resting on the floor**, not six to ten;
 *   · their bulk was **377 litres against 202 litres of wall removed** — 187%, i.e. there was
 *     already MORE material down there than had left the wall;
 *   · and the pile's peak height was **0.224 m**, which is one piece thick. Every one of those
 *     201 pieces was resting at `floorY + sc * 0.016`, so they were all interpenetrating in a
 *     single plane, hidden inside each other, indistinguishable from a dozen chips.
 *
 * 🎯 **A PILE IS NOT A NUMBER OF PIECES, IT IS A HEIGHT.** So the fix is not volume, it is
 * three properties this system did not have:
 *
 *  1. **DEBRIS LANDS ON DEBRIS** (`_pileAt` / `_pileDrop`). A coarse height field over the
 *     floor, 0.19 m cells, updated only on rest events. A falling piece collides with the
 *     pile's surface instead of the floor, and a piece that comes to rest raises the cell it
 *     landed in by its own bulk. Cells shed to their lowest neighbour, which is what turns a
 *     column into a cone of repose and spreads the drift along the skirting the way the art
 *     has it. **It is a look system and nothing else reads it** — never collision, never
 *     `pathPortals`, never sight (see `room.js`: rubble the AI cannot see would be a softlock,
 *     and this project has already shipped one).
 *  2. **THE PILE IS NOT RECYCLED WHILE THERE IS ANYTHING ELSE TO RECYCLE** (`_alloc`). The old
 *     plain ring buffer overwrote whatever slot came next, and the slab pool **filled at blow
 *     8 of a 63-blow dig** — so for seven eighths of every dig each new blow deleted an older
 *     piece of the pile. Order is now: a dead slot, then the oldest piece still in the air,
 *     and only then the oldest piece of the pile.
 *  3. **ONE GEOMETRY IS A FAMILY OF SHAPES** (`ax`/`ay`/`az`). An `InstancedMesh` can only ever
 *     draw one mesh, and a hundred copies of one plate at one aspect ratio reads as a hundred
 *     copies of one plate. A per-instance non-uniform scale turns `wallSlab` into plates,
 *     blocks and wedges for three floats and no draw call.
 *
 * ⚠️ **NO NEW MATERIAL KEY AND NO NEW POOL.** `calls-1` measured the pessimal station at
 * 601/625 with every diggable face in the house smashed, so the whole of this round had ~24
 * calls of headroom. Everything above is arithmetic inside pools that already exist.
 * ⚠️ **AND THE POOLS GOT CHEAPER WHILE GETTING BIGGER** — `mesh.count` now tracks the
 * high-water slot instead of sitting at `per`, and a pool whose pieces have all settled stops
 * re-uploading its instance matrix every frame. A pile that is permanent had to stop costing
 * anything to be permanent.
 *
 * ---------------------------------------------------------------------------------------
 * 🎯 **ROUND 13 (`debris-2`, 2026-08-09): THE THREE EXPLANATIONS, ABLATED — AND THE ONE THE
 * RESTART PACK CARRIED AS "THE REAL CAUSE" IS WORTH ALMOST NOTHING.**
 * ---------------------------------------------------------------------------------------
 * `debris-1` died before it could settle its own diagnosis, and the note it left said the floor
 * was clean because *"resting pieces fill the pool and get recycled"*. Each of round 12's three
 * terms has now been ablated back to its round-11 behaviour on the same seeded 63-blow drive,
 * against the shipped object, headless (`harness/_debris2-cause.mjs`, ~2 s, no browser):
 *
 * | arm                              | resting | litres | peak  | p90 y | footprint |
 * |----------------------------------|---------|--------|-------|-------|-----------|
 * | SHIPPED (round 13)               |   437   |  1450  | 1.051 | 0.784 |  1.51 m²  |
 * | recycling order off              |   437   |  1521  | 1.064 | 0.785 |  1.44 m²  |
 * | pool weighting off               |   172   |   592  | 0.686 | 0.425 |  0.99 m²  |
 * | height field off (flat rest)     |   436   |  1422  | 0.367 | 0.082 |  0.97 m²  |
 * | round 11 (all three off)         |   170   |   723  | 0.382 | 0.092 |  0.79 m²  |
 * | SHIPPED at quality=low           |   232   |   935  | 0.832 | 0.586 |  0.92 m²  |
 *
 * 🎯 **THE FLOOR WAS NEVER EMPTY. IT WAS FLAT.** Round 11 already put 170 pieces and 723 litres
 * on the floor — more material than the wall lost — and every one of them rested inside 9 cm of
 * the floor plane (p90 y **0.092 m**), interpenetrating, in 0.79 m². That is exactly what
 * `critic-slice-3` photographed and counted as *"six to ten hand-sized chips at the skirting"*.
 * **The height field is the term that fixed the picture** (p90 y 0.082 → 0.784 with the piece
 * count unchanged and the litres unchanged); the pool budget is the term that supplied the
 * material (2.5x the pieces); and **the recycling order changed nothing at all.**
 *
 * ⚠️ **THE RECYCLING ORDER IS STILL RIGHT AND IT IS STILL WORTH KEEPING — but for a case
 * nobody had named.** It is worth nothing on a single dig because a single dig refills the same
 * spot it emptied, and worth nothing on a huge one-frame dump because the pool turns over
 * completely either way. The case it decides is **two digs in two rooms**: dig 40 m away and the
 * first room's drift goes **305 → 304 resting** with the order, and **305 → 63** with a plain
 * ring buffer. *That* is what makes the pile a property of the HOUSE rather than of the wall you
 * are standing at.
 *
 * 🚨 **AND ABLATING IT EXPOSED A REAL BUG IT WAS HIDING — see `_alloc`.** Step 2 could recycle a
 * piece written one iteration earlier in the same `burst()` call, so on a saturated pool a
 * ten-crumb spray left one crumb: the second dig in the two-room test produced **64** resting
 * pieces where the first produced 305. Fixed in round 13, and the guard is `age > 0`.
 *
 * ⚠️ **AND `quality.particles` IS A REAL TERM, WHICH WAS THE THIRD HYPOTHESIS ON THE LIST.**
 * `views/game.js` passes `perKind = 110 x quality.particles`. At `low` (0.45) the shipped build
 * reads **232 resting / peak 0.832** against 437 / 1.051 at `high` — about half the drift. The
 * pile is quality-dependent and always was; it is not a bug, but **a look verdict taken at one
 * tier does not transfer to another**, and every board figure on this project was taken at
 * `auto`/`high`.
 *
 * ⚠️ **THE THIRD HYPOTHESIS FROM THE RESTART PACK — "pieces falling through or behind the wall"
 * — WAS REAL BUT SMALL, AND IT IS NOW CLOSED.** Round 5 made the SPAWN one-sided; nothing
 * stopped a piece drifting back through the face afterwards, and `_pileDrop`'s sandpile roll
 * actively pushed the edge of every drift into the masonry, because the cell behind the face is
 * always the lowest one available. Both are fixed by the per-piece wall plane — see `wnx` in the
 * constructor and the clamp after `_pileDrop`.
 *
 * ---------------------------------------------------------------------------------------
 * ✅ **ROUND 14 (`debris-4`, 2026-08-09): THE FLOOR SURVIVES THE x8, AND THE TWO THINGS THIS
 * HEADER SAYS THAT NO LONGER REPRODUCE.**
 * ---------------------------------------------------------------------------------------
 * 🎯 **`DIG_BASE = 8` LANDED WHILE THIS SLICE WAS OPEN, AND THE FEAR IT RAISED IS REFUTED.** The
 * brief's warning was that a payout tuned to dribble chips over sixty blows would look starved
 * once a wall takes eight. It does not, and the reason is that **the payout and the material
 * saturate together**: `_add` writes `nd = min(1, d + inc)`, so at the shipped base one blow
 * takes its whole brush clean through and further blows have nothing left to remove. Measured
 * live, same face, same seed, same cadence (`debris-floor.mjs`, service passage, `f.svc_e.1.b`):
 *
 * | blows | removed | resting | on the floor | peak  | footprint |
 * |-------|---------|---------|--------------|-------|-----------|
 * | 63    | 904.9 L |   303   | 637 L = 70%  | 0.393 |  2.92 m²  |
 * | 16    | 802.5 L |   233   | 481 L = 60%  | 0.418 |  2.56 m²  |
 *
 * **A quarter of the blows removes 89% of the material and leaves 77% of the pile, DEEPER.** The
 * only term that degrades is the volume ratio, 70% → 60%. ⚠️ **Do not read this as "the payout
 * scales correctly"** — it does not; `onChunk`'s slab branch caps at 2 and its crumb branch at 13,
 * and at the shipped base both are pinned on every blow. It happens to be right because the wall
 * is capped in the same place. **If anyone ever grows `BRUSH_R`** — which `damagefield.js` names
 * as the only way past the deposit plateau — **the wall's cap moves and this one does not, and
 * the floor WILL starve.** That is the tripwire to watch, not the blow count.
 *
 * 🎯 **THE REST ANGLES ARE HEALTHY AND IT IS THE WALL LEAN THAT SUPPLIES THEM, NOT `onPile`.**
 * `debris-floor.mjs` produced a **false FAIL** on this — it measured the spread of the THREE
 * plates it drops and read 0.69 rad on one run and 0.11 on the next, which is HANDOFF's own
 * `_macro` error (*"n = 3 was a small sample and I called it a strong signal"*) repeated exactly.
 * Over the whole population (`harness/_debris4-angles.mjs`, five dig lengths), the share of
 * resting slabs lying within 10° of flat is **18% at 4 blows, 11% at 16, 4% at 63**, p90 tilt
 * 0.83 → 1.32 rad. Ablated at 16 blows: **removing the wall lean takes the flat share 11% → 34%**,
 * while pinning the pile-height slop to bare floor moves it 11% → 14%. So the `dw < 0.34` lean is
 * the term doing the work the reference asks for, and `onPile` is a refinement on top of it. The
 * gate now reads a population; the three-plate drop stays, because its job is the trajectory
 * FRAMES a critic needs and a still cannot show a trajectory.
 *
 * ⚠️ **THE FIGURES ABOVE ARE THIS PARAGRAPH'S SECOND SET AND THE FIRST SET WAS NOT REPRODUCIBLE
 * AS QUOTED** (re-run 2026-08-10 against the shipped object). It read *"9% at 4 blows, 9% at 16,
 * 5% at 63"* and claimed pinning the pile slop *raises* the mean spread 0.506 → 0.558; today the
 * same probe reads the table above and pinning LOWERS it, 0.582 → 0.509. The verdict the
 * paragraph draws is unchanged and the lean ablation still carries it by a factor of three —
 * **but do not quote a digit from here without re-running `_debris4-angles.mjs`**, which costs
 * two seconds and no GL.
 *
 * ---------------------------------------------------------------------------------------
 * 🚨 **ROUND 15 (2026-08-10): "EVERY RESTING SLAB IN THE ROOM" IS NOT "THE HEAP", AND READING
 * THE FIRST AS THE SECOND IS WHAT MADE THIS FILE AND ITS GATE DISAGREE BY 20 POINTS.**
 * ---------------------------------------------------------------------------------------
 * `debris-floor.mjs`'s rest-angle gate failed at **33% flat** while the paragraph above recorded
 * 4-11% for the same statistic on the same object. Both were right. `_debris4-angles.mjs` fires
 * **every blow at one point**, so its entire pile lands inside the lean's 0.34 m reach and on top
 * of itself; a live dig walks the crosshair and throws a scatter across the floor that the probe
 * has never modelled. `harness/scenarios/_debris5-pop.mjs` is the instrument that separates them —
 * live at `f.svc_e.1.b`, 63 blows + `[B]` + 90, of 338 resting slabs, measured **before** the
 * `onBreak` fix below (i.e. on the build the gate was failing on):
 *
 * | sub-population                       |   n | within 10° of flat |
 * |--------------------------------------|-----|--------------------|
 * | `dw < 0.34` — the lean fires         | 189 |         6%         |
 * | `dw >= 0.34` — the lean is exactly 0 | 149 |        61%         |
 * | landed on ≥ 0.10 m of rubble         | 255 |        16%         |
 * | landed on bare floor                 |  83 |        68%         |
 *
 * 🎯 **NOTHING HERE IS A DEFECT AND THE MATHS IS NOT CHANGED.** `lean` is scaled by
 * `1 - max(0, dw)/0.34` and `onPile` by `h / 0.30`, so a piece that came to rest alone on bare
 * open floor is MEANT to lie down — that is what a chip that skittered two metres away does. The
 * gate now reads the heap (rubble under the piece) and reports the scatter beside it without
 * gating on it, and it passes at **16% flat, sd 0.383, p90 1.073 over 269 pieces in the drift**,
 * with the scatter reported alongside at 70 pieces / 71% flat. ⚠️ **The T1/T3 asymmetry is real
 * and worth knowing**: the same drive reads 29% flat over the heap after the 63-blow dig alone
 * and 19% after the fast second phase, because a 0.39 m drift has less to lean on than a 0.85 m
 * one. **A shallow pile IS flatter** — so quote the state a rest-angle figure was taken in.
 *
 * ⚠️ **AND THE GATE'S BLIND SPOT IS NAMED RATHER THAN PAPERED OVER.** Run live with the wall
 * plane stripped in flight (`_debris5-pop.mjs DEBRIS_NOLEAN=1`), the heap reads **23% flat** —
 * under the 0.25 bar. Killing the lean is a single-term regression, not a collapse: `onPile`
 * alone still cocks a piece on a 0.5 m drift. The statistic that separates the arms is the
 * **mean tilt of the heap, 0.62 shipped against 0.46 ablated in both control runs**; it is
 * reported by the gate and deliberately not asserted, because a bar tight enough to catch the
 * ablation also fails the same build after phase 1 alone. Gate the mean if you want the lean
 * itself covered, and validate it at both phases first.
 *
 * 🚨 **AND ONE REAL DEFECT FELL OUT OF THE SAME CENSUS, IN `views/game.js` `onBreak`.** 36 of the
 * 338 carried NO wall plane, sat at a mean tilt of 0.129 rad with an sd of **0.048** — eighteen
 * plates at one angle, twice — and **20 of them came to rest BEHIND the face, up to 0.90 m inside
 * the wall**. Cause: `onBreak` passed `dir:` to `burst()`, which has never had an `o.dir`, so its
 * spray left along the default `(0,0,1)` on every wall in the house, and it passed neither
 * `normal` nor `wall: true`, so the plane this file added in round 5 was never written. Fixed
 * there; `debris-floor.mjs` now gates on zero pieces behind their own face. ⚠️ **`weapons.js`
 * passes `dir` to `burst` in two more places and is getting world +z for the same reason** — not
 * touched here, because nothing in this slice measures combat FX.
 *
 * ⚠️ **AND THE TWO-ROOM JUSTIFICATION FOR THE RECYCLING ORDER NO LONGER REPRODUCES.** The
 * round-13 note above says the order decides the two-dig case — *"305 → 304 with the order, and
 * 305 → 63 with a plain ring buffer"*. Re-run today on the shipped pool sizes
 * (`_debris2-cause.mjs`), **both arms read 378 → 378**, and the collapse case reads 506 in both.
 * That is not a regression, it is round 13's own capacity raise (3.0/2.2 → 4.6/3.4) working: the
 * note itself predicts *"the recycling order stops mattering because nothing has to be forgotten
 * yet"*. **The order is currently worth nothing at any measured station** — keep it, because it
 * is what holds when the pools do saturate, but do not cite the 305 → 63 figure as live evidence.
 *
 * 📉 **AND THE PILE'S PRICE IS FINALLY ON THE BOARD, AT THE STATION THAT MATTERS**
 * (`harness/scenarios/_debris4-calls.mjs`). `calls-1`'s 601/625 was measured with `onBreak`
 * suppressed, so it is a **debris-free** 601 and nobody had added this on top of it. With every
 * one of the 28 free faces in the house dug AND all five pools saturated at **1038 resting
 * pieces** — half again what a whole dig produces — a paired in-place flip at `ballroom.centre`
 * reads **+8 to +10 draw calls and +76k to +84k triangles**. That is exactly five pools × two
 * passes (beauty + shadow), i.e. the design's own claim, confirmed rather than assumed.
 * **So the pile spends a third to a half of the ~24 calls of headroom, and nothing more.**
 * ⚠️ **THE 601 IS NOT A CONSTANT AND THIS RUN READ 555 FOR THE SAME STATE.** Same twelve
 * stations, same `?walls=instanced`, same 28 faces dug: worst `ballroom.centre` **555 / 589k**.
 * The 46-call gap is the loose-gadget residency `calls-1` itself found — one pickup is 39-205
 * calls and which rooms are resident depends on where the hunter, the Director and the dropped
 * props happen to be. **Quote the worst case as a range, not a digit**, and take the delta as a
 * paired flip; a station-to-station comparison here has a ±18-call noise floor and the first
 * version of that probe read the pile as SAVING 18 calls before it was rewritten.
 */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

// ---------------------------------------------------------------------------
// Geometry: broken solids
// ---------------------------------------------------------------------------

function hash3(x, y, z) {
  const n = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Jitter a geometry's vertices, moving coincident vertices together so the solid stays
 * closed. `fn(x,y,z) -> [dx,dy,dz]` is called once per unique position.
 */
function fracture(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = `${Math.round(x * 2000)}|${Math.round(y * 2000)}|${Math.round(z * 2000)}`;
    let off = seen.get(k);
    if (!off) { off = fn(x, y, z); seen.set(k, off); }
    pos.setXYZ(i, x + off[0], y + off[1], z + off[2]);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();     // non-indexed => flat facets, which is what a shard is
  g.deleteAttribute('uv');      // no maps on debris; the uvs are dead weight
  return g;
}

/**
 * Paint vertex colours. `pick(nx,ny,nz,x,y,z) -> 0..1` chooses between the broken core
 * colour (0) and the original weathered surface colour (1). A little positional mottle
 * goes on top so a face is never one flat value — the thing the critic called cardboard.
 */
function paint(geo, core, face, pick, mottle = 0.13) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const cCore = new THREE.Color(core), cFace = new THREE.Color(face);
  const arr = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = Math.max(0, Math.min(1, pick(nor.getX(i), nor.getY(i), nor.getZ(i), x, y, z)));
    const m = 1 - mottle * 0.5 + hash3(x * 61, y * 61, z * 61) * mottle;
    arr[i * 3] = (cCore.r + (cFace.r - cCore.r) * t) * m;
    arr[i * 3 + 1] = (cCore.g + (cFace.g - cCore.g) * t) * m;
    arr[i * 3 + 2] = (cCore.b + (cFace.b - cCore.b) * t) * m;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

const step = (a, b, x) => Math.max(0, Math.min(1, (x - a) / (b - a)));

/** A lump of plaster: irregular, chalky fracture faces, one dirty original face. */
function plasterChunk() {
  let n = 0;
  const g = fracture(new THREE.IcosahedronGeometry(0.075, 0), (x, y, z) => {
    const r = hash3(x * 97 + 3, y * 97, z * 97), r2 = hash3(x * 53, y * 53 + 7, z * 53);
    n++;
    // squash it as well as dent it — a broken lump of plaster is a slab-ish flake, not a ball
    return [(r - 0.5) * 0.055, (r2 - 0.5) * 0.055 - y * 0.30, (hash3(x, y, z + n) - 0.5) * 0.05];
  });
  // The face that was the wall surface is dirtier and warmer; every other facet is the
  // freshly exposed lime core, which in the photographs is startlingly pale.
  return paint(g, 0xece7dc, 0x9c9184, (nx, ny, nz) => step(0.05, 0.75, nz), 0.16);
}

/** A snapped lath: long, thin, splintered ends, weathered brown faces, raw pale breaks. */
function lathChunk() {
  const g = fracture(new THREE.BoxGeometry(0.30, 0.020, 0.045, 1, 1, 1), (x, y, z) => {
    const end = Math.abs(x) > 0.10;
    const r = hash3(x * 131, y * 131, z * 131), r2 = hash3(x * 71 + 5, y * 71, z * 71);
    // splinters run ALONG the grain, so the ends move a long way in x and barely in y/z
    return end
      ? [(r - 0.5) * 0.085, (r2 - 0.5) * 0.010, (hash3(z, x, y) - 0.5) * 0.022]
      : [(r - 0.5) * 0.012, (r2 - 0.5) * 0.006, (hash3(z, x, y) - 0.5) * 0.010];
  });
  // ends (normal along x) are the raw snapped timber; the wide faces are weathered and
  // still carry plaster key residue
  return paint(g, 0xc9a978, 0x7d5f3c, (nx) => 1 - step(0.35, 0.85, Math.abs(nx)), 0.15);
}

/**
 * 🧱 **THE PIECE THAT CAME OFF THE WALL — a SLAB, not a crumb.**
 *
 * John, 2026-08-08, on the free-form dig: *"the destruction didn't feel like chunks coming off
 * the wall. It felt like a 2d mesh taking off layers where I was clicking… thick chunks falling
 * off the wall."*
 *
 * ⚠️ **THE CRUMBS WERE NEVER THE BUG.** `plasterChunk` above is already a fractured solid with
 * real volume, and it has been since round 3. What was missing is that **nothing that flew was
 * the same object as the material that left** — a blow removed a patch of wall a third of a
 * metre across and paid out fifteen 7 cm lumps, so it read as a particle effect playing near a
 * fading texture rather than as a piece coming off.
 *
 * So this geometry is a PLATE with the proportions of a piece of wall: wide and tall in x/y,
 * a real thickness in z, and — the part that does the work — **one face that is the room-side
 * surface and five that are fresh break**. `paint()` puts the dirty weathered value on +z alone
 * and the startlingly pale lime core on everything else, so as the plate tumbles it alternates
 * between "this was the wall" and "this is the inside of the wall", which is the single loudest
 * cue in every demolition photograph in `refs/lath/`.
 *
 * ⚠️ **THE EDGES ARE FRACTURED, NOT BEVELLED.** A box with jittered corners is a box; the
 * jitter here is applied hard in x/y (the break runs through the sheet) and barely at all in z
 * (the sheet's thickness is set by the wall, not by how it broke), so the silhouette is ragged
 * in plan and constant in section — which is what a broken slab of plaster actually is.
 *
 * ⚠️ **ROUND 12: 0.042 → 0.058 THICK, AND THE WEATHERED FACE IS MUCH PALER.** Two readings off
 * `refs/_sheets/dig.png` tile 5, which is the frame John's *"knee-deep"* comes from:
 *
 *   · **the pieces in the drift are BLOCKS, not sheets.** At 0.042 against a 0.22 plan the plate
 *     was 5:1, and five of those stacked still read as a stack of paper. The wall it comes out
 *     of is 0.15 m thick, so 0.058 is inside what the material can supply and it is what makes
 *     a piece read as mass once it is one of two hundred.
 *   · **every face of every piece in that frame is WHITE.** `0x8f8578` is a mid grey-brown, and
 *     against a near-black service-passage floor a mid grey-brown chip is a dark chip — which
 *     is exactly how the pile photographed. It is now `0xb9b1a4`: still clearly the dirtier,
 *     warmer, room-side face against the pale lime core, still the loudest cue that a piece has
 *     just been torn out, but no longer the value of the floor it is lying on.
 */
function wallSlab() {
  // 3x3 in plane so the outline can be genuinely ragged rather than a jittered quadrilateral.
  const g = fracture(new THREE.BoxGeometry(0.22, 0.19, 0.058, 3, 3, 1), (x, y, z) => {
    const edge = Math.abs(x) > 0.10 || Math.abs(y) > 0.085;
    const r = hash3(x * 89 + 2, y * 89, z * 89), r2 = hash3(x * 47, y * 47 + 3, z * 47);
    const r3 = hash3(z * 29, x * 29, y * 29);
    return edge
      // the break runs THROUGH the sheet: a lot of movement in plan, almost none in section
      ? [(r - 0.5) * 0.070, (r2 - 0.5) * 0.062, (r3 - 0.5) * 0.012]
      : [(r - 0.5) * 0.018, (r2 - 0.5) * 0.018, (r3 - 0.5) * 0.008];
  });
  // +z was the room-side face — dirtier, warmer, and the only face that ever saw a paintbrush.
  return paint(g, 0xeae4d6, 0xb9b1a4, (nx, ny, nz) => step(0.30, 0.85, nz), 0.14);
}

/**
 * 🔷 **THERE IS NO `coreChunk` ANY MORE, AND THAT IS CANON RATHER THAN TASTE.**
 *
 * Round 3 added a teal chip so a blow past the shell paid out the material it had reached.
 * `critic-dig-3` then named those chips as the fastest tell in the piece — pale and dark blobs
 * lying on the flat teal *"exactly like partially-submerged rocks or islets"* — and round 4
 * stopped calling for the kind but kept it alive "in case a hunter breach ever wants to shed
 * structure". **It may not.** `refs/dig/dig-iso-annotated.webp` labels the cyan
 * *"INDESTRUCTIBLE CYAN STRUCTURE"* three times in one image, and a chip of it on the floor is
 * a claim that the player broke the one thing the whole mechanic exists because they cannot.
 * Deleted, so the claim is not one line of code away from being made again.
 */

/** Framing timber: chunkier, greyer, coarser than lath. */
function timberChunk() {
  const g = fracture(new THREE.BoxGeometry(0.20, 0.085, 0.085, 1, 1, 1), (x, y, z) => {
    const end = Math.abs(x) > 0.07;
    const r = hash3(x * 41, y * 41, z * 41), r2 = hash3(x * 23 + 9, y * 23, z * 23);
    return end
      ? [(r - 0.5) * 0.10, (r2 - 0.5) * 0.030, (hash3(z * 3, x, y) - 0.5) * 0.030]
      : [(r - 0.5) * 0.016, (r2 - 0.5) * 0.016, (hash3(z * 3, x, y) - 0.5) * 0.016];
  });
  return paint(g, 0xb59a72, 0x5d5140, (nx) => 1 - step(0.35, 0.85, Math.abs(nx)), 0.17);
}

/** Smash-lab furniture chips. Stepped 6-connected cluster, AABB 0.16×0.12×0.10. */
function furnChip() {
  const parts = [
    { p: [0.00, 0.00, 0.00], s: [0.10, 0.08, 0.07] },
    { p: [0.055, 0.018, 0.018], s: [0.07, 0.06, 0.055] },
    { p: [-0.045, -0.012, 0.02], s: [0.065, 0.07, 0.05] },
    { p: [0.02, 0.038, -0.022], s: [0.06, 0.05, 0.075] },
    { p: [-0.02, -0.032, -0.028], s: [0.05, 0.042, 0.055] },
    { p: [0.068, -0.02, -0.008], s: [0.042, 0.085, 0.04] },
    { p: [-0.055, 0.03, -0.015], s: [0.045, 0.04, 0.06] },
  ];
  const pos = [];
  const idx = [];
  let base = 0;
  for (const part of parts) {
    const g = new THREE.BoxGeometry(part.s[0], part.s[1], part.s[2]);
    const pr = g.attributes.position;
    for (let i = 0; i < pr.count; i++) {
      pos.push(pr.getX(i) + part.p[0], pr.getY(i) + part.p[1], pr.getZ(i) + part.p[2]);
    }
    const id = g.index;
    for (let i = 0; i < id.count; i++) idx.push(id.getX(i) + base);
    base += pr.count;
    g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const col = new Float32Array((pos.length / 3) * 3);
  col.fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * A torn scrap of wallpaper. Two skinned layers a millimetre apart with opposite winding,
 * so it has a printed face and a pale paper back and real edge thickness — a single
 * DoubleSide plane is exactly the cardboard cut-out the critic rejected.
 */
function paperChunk() {
  const W = 0.26, H = 0.19, NX = 4, NY = 3;
  const pos = [], col = [], idx = [];
  const cFront = new THREE.Color(0xa98d68);   // the wallpaper's damask ground
  const cBack = new THREE.Color(0xd8cdb8);    // paper backing, much paler
  const grid = [];
  for (let j = 0; j <= NY; j++) {
    for (let i = 0; i <= NX; i++) {
      const u = i / NX, v = j / NY;
      // tear the outline in: border vertices pull inward by a random amount
      const edge = (i === 0 || i === NX || j === 0 || j === NY) ? 1 : 0;
      const t = hash3(i * 7.3, j * 3.1, 1.7);
      const iu = edge ? (u - 0.5) * (1 - t * 0.34) + 0.5 : u;
      const iv = edge ? (v - 0.5) * (1 - hash3(j * 5.1, i * 2.7, 4.3) * 0.34) + 0.5 : v;
      // curl: a torn scrap never lies flat, it bows and lifts at one corner
      const curl = Math.sin(iu * Math.PI) * 0.022 + (iv - 0.5) * (iu - 0.2) * 0.10;
      grid.push([(iu - 0.5) * W, (iv - 0.5) * H, curl]);
    }
  }
  const at = (i, j) => j * (NX + 1) + i;
  for (let layer = 0; layer < 2; layer++) {
    const base = pos.length / 3;
    const off = layer === 0 ? 0.0009 : -0.0009;
    const c = layer === 0 ? cFront : cBack;
    for (const p of grid) {
      pos.push(p[0], p[1], p[2] + off);
      const m = 0.9 + hash3(p[0] * 400, p[1] * 400, layer) * 0.22;
      col.push(c.r * m, c.g * m, c.b * m);
    }
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const a = base + at(i, j), b = base + at(i + 1, j), d = base + at(i, j + 1), e = base + at(i + 1, j + 1);
        if (layer === 0) idx.push(a, b, d, b, e, d);
        else idx.push(a, d, b, b, d, e);   // reversed winding: this layer faces away
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * 🚨 **`vTerm` — HOW FAST A PIECE MAY FALL, AND ITS ABSENCE IS THE DEFECT JOHN REPORTED.**
 *
 * John, 2026-08-10, after playing: *"the falling chunks kinda seem to **float down to the
 * ground**."* He is right and it is arithmetic, not taste. `update()` applied `drag` to all three
 * velocity components, and a per-frame multiplier on the vertical axis is not air resistance —
 * **it is a terminal velocity**, at `g·dt·drag/(1-drag)`:
 *
 *   | kind | drag | terminal fall speed it imposed | free fall from 2.4 m of wall |
 *   |---|---|---|---|
 *   | slab | 0.90 | **1.41 m/s** | 6.72 m/s |
 *   | plaster | 0.87 | **1.05 m/s** | 6.72 m/s |
 *   | timber | 0.93 | **2.08 m/s** | 6.72 m/s |
 *   | paper | 0.62 | 0.26 m/s | 6.72 m/s |
 *
 * — and it is reached in about a third of a second, so **every piece of debris in the game spent
 * almost all of its fall descending at a constant 1–2 m/s.** A constant descent is the signature
 * of a scripted effect; John's own Teardown frames show slabs that tumble slowly enough to follow
 * and *fall*, which is what "heavy" means. ⚠️ **The fix is NOT to make everything faster** — the
 * readable tumble is wanted and `spin` is untouched. The fix is that the fall ACCELERATES.
 *
 * So `drag` now damps the HORIZONTAL only — which is what it was doing usefully, turning a thrown
 * crumb into a dropped one — and the vertical axis gets a real terminal velocity that nothing in
 * a 2.8 m room will ever reach, except paper, which genuinely should float.
 */
export const DEBRIS_KINDS = {
  /**
   * 🧱 **slab: the piece that just left the wall.** Heavier than a crumb and slower to spin, so
   * it reads as mass rather than as spray; low bounce, because a plate of plaster does not
   * bounce, it lands and stays. `restRot` lies it flat on its face, which is how a slab ends up
   * on a floor and is what makes the pile read as rubble instead of as scattered dice.
   *
   * ⚠️ The scale range is the reference's, not a guess: `refs/_sheets/dig.png` puts the largest
   * fragment at about 25 cm, and the base plate is 0.22 m, so 1.35 is the top of the range.
   */
  slab: {
    geo: wallSlab,
    roughness: 0.95, metalness: 0, emissive: 0xcac4b8, emissiveIntensity: 0.30,
    // 18 m/s is a fall of 17 m: a slab in this house is in free fall for its whole flight.
    scale: [0.42, 1.35], drag: 0.90, vTerm: 18, bounce: 0.12, spin: 2.6, life: [2.4, 4.2],
    /**
     * ⚠️ **ROUND 13: 3.0 → 4.6, AND IT IS A CAPACITY FIX, NOT A TUNING PREFERENCE.** One real
     * 63-blow dig ends with **291 of 330** slab slots and **141 of 242** plaster slots holding
     * resting pieces (`debris-floor.mjs`, service passage, seed s4). A SECOND dig therefore
     * starts on a saturated pool — and on a saturated pool every new piece has to delete an old
     * one, which is `critic-slice-3`'s clean floor coming back for room two. **A priority order
     * cannot fix a capacity problem**; only slots can. Measured headless on the payout the game
     * actually makes (`_debris2-cause.mjs`, two digs 40 m apart): at 3.0/2.2 the second room got
     * **79 resting** against the first room's 437; at 4.6/3.4 **both rooms end with 377**, and
     * the recycling order stops mattering because nothing has to be forgotten yet.
     * ⚠️ **It costs ZERO draw calls** — a pool is one `InstancedMesh` whatever its size — and it
     * costs no triangles until the slots are used, because round 12 made `mesh.count` follow the
     * high-water slot. At full occupancy the two raises are ~+14k triangles against a 900k
     * budget whose pessimal station reads 660k.
     * ⚠️ **AND IT IS STILL BOUNDED, WHICH MUST BE SAID PLAINLY.** ~880 pieces across the two
     * kinds is about one and a half digs. The pile survives the house, not the whole run.
     */
    restRot: [-Math.PI / 2, 0], pool: 4.6, aspect: [0.78, 0.58, 0.62, 1.05],
  },
  // plaster: chalky lumps, the loudest material in the collapse
  plaster: {
    geo: plasterChunk,
    roughness: 0.96, metalness: 0, emissive: 0xcfc9bd, emissiveIntensity: 0.30,
    // a fist of plaster has a little more air about it than a plate, but only a little
    scale: [0.45, 2.1], drag: 0.87, vTerm: 13, bounce: 0.20, spin: 5.0, life: [1.6, 3.2],
    // ⚠️ ROUND 13: 2.2 → 3.4, same capacity argument as `slab` above.
    restRot: [0, 0], pool: 3.4, aspect: [0.76, 0.60, 0.76, 0.60],
  },
  // paper: torn wallpaper, light, flutters, high drag
  paper: {
    geo: paperChunk,
    roughness: 0.82, metalness: 0, emissive: 0xbfab8b, emissiveIntensity: 0.26,
    // ⚠️ **PAPER IS THE ONE KIND THAT IS SUPPOSED TO FLOAT** and it keeps a slow terminal on
    // purpose. It is the control: if wallpaper and a plate of plaster fall at the same rate,
    // neither reads as a material.
    scale: [0.6, 1.5], drag: 0.62, vTerm: 1.5, bounce: 0.04, spin: 8.0, life: [2.0, 3.6], flutter: 1,
    restRot: [-Math.PI / 2, 0], pool: 0.45, aspect: [0.85, 0.40, 0.85, 0.40],
  },
  // lath: long thin splinters
  lath: {
    geo: lathChunk,
    roughness: 0.89, metalness: 0, emissive: 0x8a6b45, emissiveIntensity: 0.16,
    scale: [0.55, 1.7], drag: 0.90, vTerm: 11, bounce: 0.28, spin: 7.0, life: [1.8, 3.4],
    restRot: [0, 0], pool: 0.6, aspect: [0.70, 0.80, 0.80, 0.50],
  },
  // ⚠️ ROUND 5: there is no `core` kind. See the note where `coreChunk` used to be — the cyan
  // structure is indestructible, so nothing may ever pay out a chip of it.
  // timber: heavier, chunkier shards
  timber: {
    geo: timberChunk,
    roughness: 0.88, metalness: 0, emissive: 0x6d5f4b, emissiveIntensity: 0.14,
    scale: [0.55, 2.0], drag: 0.93, vTerm: 16, bounce: 0.24, spin: 4.0, life: [1.9, 3.6],
    restRot: [0, 0], pool: 0.55, aspect: [0.75, 0.70, 0.80, 0.55],
  },
  // Smash-lab Meshy chips. White geo; instanceColor is the sampled texel.
  // pool 2.0 so a 24-prop lineup does not steal from timber/slab wall piles.
  furnchip: {
    geo: furnChip,
    roughness: 0.92, metalness: 0, emissive: 0x1a1a1a, emissiveIntensity: 0.03,
    envMapIntensity: 0.50,
    scale: [0.55, 2.0], drag: 0.93, vTerm: 16, bounce: 0.24, spin: 4.0, life: [1.9, 3.6],
    restRot: [0, 0], pool: 2.0, aspect: [0.75, 0.70, 0.80, 0.55],
  },
};

/**
 * 🧱 **THE PILE, AND WHY IT IS A HEIGHT FIELD AND NOT A SOLVER.**
 *
 * `disconnection.md` §5's hardest constraint is determinism — *"the field replays exactly from
 * its hit list and the mask never goes on the wire"* — and HANDOFF's is the draw-call budget.
 * A rigid-body pile fails both. A height field fails neither: it is a `Map<int, float>` touched
 * once per REST EVENT (about a thousand times in a whole dig, never per frame, never per
 * particle in flight), it owns no geometry, and it is read by exactly one line of `update()`.
 *
 * ⚠️ **NOTHING OUTSIDE THIS FILE MAY EVER READ IT.** `room.collide`, `pathPortals` and the
 * sight tests all derive from `damagefield.js`, which is the single source of truth the whole
 * dig is built on. A pile that blocked a passage the player had just dug would be a softlock,
 * and `dig.md` records that this project has already shipped one.
 */
/** Metres. Coarse enough that a slab fills one cell, fine enough to have a slope. */
const PILE_CELL = 0.19;
/** Metres. Nothing towers: a robot is 1.70 m and the art's deepest drift is about thigh height. */
const PILE_MAX = 0.85;
/** Broken plaster stacks with voids in it — bulk volume over solid volume. */
const PILE_LOOSE = 1.55;
/** Metres a single piece may raise one cell. Above this it is spreading, not stacking. */
const PILE_STEP = 0.085;

export class DebrisSystem {
  /**
   * @param {THREE.Scene} scene
   * @param {object} [o]
   * @param {number} [o.perKind=220]  pool size per material
   * @param {number} [o.floorY=0]
   * @param {Function} [o.rng]
   */
  constructor(scene, o = {}) {
    this.scene = scene;
    this.floorY = o.floorY ?? 0;
    this.rng = o.rng ?? Math.random;
    this.gravity = o.gravity ?? -9.4;
    this.keepRest = !!o.keepRest;
    this.pools = {};
    /**
     * The pile. Key is a packed floor cell, value is metres of rubble standing on it.
     * A `Map` with an integer key allocates nothing per lookup and is touched only when a
     * piece comes to rest or is recycled — see `_pileDrop`.
     */
    this.pile = new Map();

    const base = o.perKind ?? 220;
    for (const [name, def] of Object.entries(DEBRIS_KINDS)) {
      /**
       * 🧱 **THE POOL BUDGET IS PER KIND, BECAUSE THE PILE IS MADE OF TWO OF THEM.**
       *
       * The caller passes ONE number and round 11 spent it evenly: 110 slots each, five kinds.
       * Measured on a real dig (`debris-floor.mjs`), **the slab pool was full at blow 8 of 63**
       * while `paper` held nothing at all on a free face and `lath`/`timber` held the 18 pieces
       * the boot warm-up put there. So four fifths of a dig's rubble was being thrown away to
       * keep 285 slots idle. Weighting the same number the other way costs no draw call — a
       * pool is one mesh whatever its size, and `mesh.count` now follows the high-water slot —
       * and it is what lets the pile survive a whole dig.
       */
      const per = Math.max(8, Math.round(base * (def.pool ?? 1)));
      // Small fast-tumbling objects in a near-black interior read as black cut-outs on
      // every face pointing away from the key, which is the classic "dead blacks" failure.
      // A little self-illumination floors the unlit side so a chunk always reads as its
      // own material. Cheaper and steadier than a fill light, and it cannot be shadowed.
      const mat = new THREE.MeshStandardMaterial({
        color: 0xffffff,          // albedo lives in the vertex colours
        vertexColors: true,
        roughness: def.roughness, metalness: def.metalness,
        side: THREE.FrontSide,    // both faces of the paper scrap are real geometry now
        emissive: def.emissive,
        emissiveIntensity: def.emissiveIntensity,
        envMapIntensity: def.envMapIntensity ?? 2.0,
      });
      const geo = def.geo();
      const mesh = new THREE.InstancedMesh(geo, mat, per);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // A shadow under a chunk is what gives it weight — without one, a piece resting on
      // the floor reads as pasted onto it, which is half of what "nothing has landed"
      // meant. 4 extra draws into a 1024 map for the whole system.
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;       // it spans the burst volume; culling it flickers
      /**
       * ⚠️ **ROUND 12: `count` FOLLOWS THE HIGH-WATER SLOT, NOT `per`.** With the slab pool at
       * 330 slots, a `count` pinned at `per` submits 330 × 60 zero-scaled triangles in the
       * beauty pass AND the shadow pass from the first chip onward. It costs no draw CALL — the
       * pool is one mesh either way — but it is 20k of dead triangles against a 900k budget for
       * nothing, and a bigger pool must not be paid for until it is used. `_alloc` raises it.
       */
      mesh.count = 0;
      /**
       * 🚨 **AN EMPTY POOL MUST NOT PAY A DRAW CALL, AND UNTIL THIS LINE EVERY ONE OF THEM DID.**
       *
       * `frustumCulled = false` plus `count = per` means three submits this `InstancedMesh` on
       * every frame of the whole run — beauty pass AND shadow pass, because `castShadow` is on —
       * whether or not a single particle is alive. Measured at a parked station with the house
       * untouched: the four pools were costing **8 calls of a 625 budget for 880 zero-scaled
       * instances**. This round adds a fifth kind (`slab`), and `docs/slices/task-chunks-thickness.md`
       * records the budget at 605/625 with twenty of headroom, so paying for a fifth idle pool
       * was not available — and the honest fix is not to skip the fifth pool, it is to stop
       * paying for the four that were already there.
       *
       * `update()` clears it again when the last piece of a kind dies. A piece that has come to
       * REST still counts as live (see `rest`), so a pile on the floor keeps its pool visible,
       * which is the behaviour the pile depends on.
       */
      mesh.visible = false;
      scene.add(mesh);

      // everything starts scaled to zero and therefore invisible
      for (let i = 0; i < per; i++) {
        _m.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, _c.setRGB(1, 1, 1));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;

      // the piece's own bulk, in m³, at scale 1 — the pile's currency. 0.55 is the solid
      // fraction of a fractured shard inside its own bounding box.
      geo.computeBoundingBox();
      const bb = geo.boundingBox;
      const bx = bb.max.x - bb.min.x, by = bb.max.y - bb.min.y, bz = bb.max.z - bb.min.z;
      // how tall the piece is once it has lain down in its rest pose: `restRot[0]` of -PI/2
      // stands the z axis up, anything else leaves y up.
      const lyingZ = Math.abs(Math.abs(def.restRot[0]) - Math.PI / 2) < 0.1;

      this.pools[name] = {
        def, mesh, per,
        unitVol: bx * by * bz * 0.55,
        lying: lyingZ ? bz : by, lyingZ,
        // half the plate's own thickness at scale 1 — how close its CENTRE may come to the
        // face before it is touching the wall. See the wall contact in `update()`.
        halfZ: bz * 0.5,
        // the extent that becomes VERTICAL when a piece is stood on edge rather than lying in
        // its rest pose — used by the lean, so a propped plate is raised by its own height and
        // not by the height of some other kind's plate.
        standY: lyingZ ? by : bz,
        px: new Float32Array(per), py: new Float32Array(per), pz: new Float32Array(per),
        vx: new Float32Array(per), vy: new Float32Array(per), vz: new Float32Array(per),
        rx: new Float32Array(per), ry: new Float32Array(per), rz: new Float32Array(per),
        wx: new Float32Array(per), wy: new Float32Array(per), wz: new Float32Array(per),
        sc: new Float32Array(per), age: new Float32Array(per), life: new Float32Array(per),
        /**
         * 🧱 **ONE GEOMETRY, A FAMILY OF SHAPES.** An `InstancedMesh` draws one mesh, so every
         * slab in the pile is the same plate — and a hundred copies of one plate reads as a
         * hundred copies of one plate however they are tinted or turned. A per-axis scale is
         * three floats and no draw call, and it turns `wallSlab` into plates, blocks and
         * wedges. `def.aspect` is `[xMin, xRange, zMin, zRange]`; y is derived so the piece
         * keeps roughly its bulk and the size the caller asked for stays honest.
         */
        ax: new Float32Array(per), ay: new Float32Array(per), az: new Float32Array(per),
        /**
         * 🧱 **THE WALL THE PIECE CAME OFF, AS A PLANE, PER PIECE** — `(wnx, wnz)` is the face
         * normal in the floor plane and `wd` is its offset, so `wnx*x + wnz*z >= wd` is "in
         * front of the wall".
         *
         * ⚠️ **THE PLANE IS CARRIED BY `burst()` PIECES TOO, AND IT IS NOT A NO-OP FOR THEM.**
         * A crumb can no longer end up on the far side of the face it came out of — round 5
         * made the SPAWN one-sided, but nothing stopped a piece drifting back through the wall
         * afterwards, and the ones that did were drawn over by the masonry, i.e. deleted from
         * the picture. Measured headless on one spot: the drift's footprint tightens 54 → 42
         * cells and the same 305 pieces stand correspondingly deeper, because the material that
         * used to disappear into the wall now stays in the room. **This is a change to the
         * spray, not a free addition** — `_debris2-cause.mjs` is the instrument.
         *
         * `sag` is the inward acceleration that brings a big chunk BACK against the face on its
         * way down. See `chunk()`: it is the canned pendulum that makes a slab clip the wall
         * below it instead of dropping like a lift, and it IS zero for everything `burst()`
         * spawns — a crumb spray does not swing back.
         */
        wnx: new Float32Array(per), wnz: new Float32Array(per), wd: new Float32Array(per),
        sag: new Float32Array(per), whit: new Uint8Array(per),
        /**
         * 🚨 **A BIG CHUNK IS NOT A CRUMB AND MUST NOT BE RECYCLED LIKE ONE.** It is the largest
         * and most memorable object the destruction ever produces — the whole point of John's
         * *"falls off as one big chunk"* — and under a plain age ordering it is also the piece
         * that has been in the air longest, i.e. the FIRST thing the next crumb spray would
         * delete. `_alloc` steps over it.
         */
        big: new Uint8Array(per),
        /**
         * 🧱 **HOW LONG THIS PIECE IS STILL PART OF THE WALL, IN SECONDS.** See `chunk()`'s `hold`.
         * A held piece is spawned, coloured, posed and DRAWN — flush against the face, exactly
         * where the material it represents was standing — and integrates nothing until its moment.
         * ⚠️ **It is the only time term `chunk()` has ever had, and it is a LOOK term only.** The
         * field is written on the blow, so passability, sight and the AI's graph all open at once;
         * this staggers the pieces in front of the hole, not the hole.
         */
        hold: new Float32Array(per),
        alive: new Uint8Array(per),
        // A piece that has come to rest is no longer a particle, it is scenery. It stops
        // ageing and never shrinks away, so a collapse leaves a pile behind instead of
        // shedding debris that quietly evaporates a second and a half later.
        rest: new Uint8Array(per),
        hits: new Uint8Array(per),
        // which pile cell this piece is standing on, and how much of that cell's height is
        // its own — so recycling it can hand the height back and the pile cannot drift up
        // without bound as the ring turns over. -1 is "not in the pile".
        pcell: new Float64Array(per).fill(-1), pdh: new Float32Array(per),
        next: 0, rnext: 0, high: 0, liveCount: 0, moving: 0, dirtyColor: false, dirtyMatrix: false,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // The pile. Nothing outside this file reads it — see the note above PILE_CELL.
  // ---------------------------------------------------------------------------

  /** Pack a floor position into one integer-valued key. ±3200 m of floor, which is the house. */
  _key(x, z) {
    return (Math.round(x / PILE_CELL) + 16384) * 32768 + (Math.round(z / PILE_CELL) + 16384);
  }

  /** Metres of rubble standing on the floor at this position. */
  _pileAt(x, z) {
    return this.pile.get(this._key(x, z)) ?? 0;
  }

  /**
   * A piece has stopped moving. Find which cell it settles into, tell the caller how high that
   * is, and bank the piece's own bulk there.
   *
   * 🎯 **THE ONE RULE THAT MAKES IT A PILE RATHER THAN A COLUMN: it settles into the LOWEST of
   * the nine cells it could reach, not the one it happened to land on.** That is the sandpile
   * rule, and it is why a dig at one spot ends up as a drift along the skirting instead of a
   * tower at the aim point — each piece rolls one cell down the slope it lands on, and the
   * slope is made of the pieces before it. It is also exactly refundable, which a relaxation
   * pass would not be: the whole of a piece's contribution lives in one cell.
   */
  _pileDrop(p, i) {
    const x = p.px[i], z = p.pz[i];
    let bestK = this._key(x, z), bestH = this.pile.get(bestK) ?? 0, bx = x, bz = z;
    if (bestH > 0.02) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (!dx && !dz) continue;
          const nx = x + dx * PILE_CELL, nz = z + dz * PILE_CELL;
          const k = this._key(nx, nz), h = this.pile.get(k) ?? 0;
          if (h < bestH - 0.012) { bestH = h; bestK = k; bx = nx; bz = nz; }
        }
      }
    }
    // it rolled: slide it most of the way into the cell it fell into
    if (bx !== x || bz !== z) {
      p.px[i] = x + (bx - x) * 0.78;
      p.pz[i] = z + (bz - z) * 0.78;
    }
    const bulk = p.unitVol * p.sc[i] * p.sc[i] * p.sc[i] * p.ax[i] * p.ay[i] * p.az[i] * PILE_LOOSE;
    const rise = Math.min(PILE_STEP, bulk / (PILE_CELL * PILE_CELL));
    const next = Math.min(PILE_MAX, bestH + rise);
    this.pile.set(bestK, next);
    p.pcell[i] = bestK;
    p.pdh[i] = next - bestH;
    return bestH;
  }

  /** A resting piece is being recycled or cleared: give its height back to the pile. */
  _pileRefund(p, i) {
    const k = p.pcell[i];
    if (k < 0) return;
    const h = (this.pile.get(k) ?? 0) - p.pdh[i];
    if (h > 1e-4) this.pile.set(k, h); else this.pile.delete(k);
    p.pcell[i] = -1; p.pdh[i] = 0;
  }

  /**
   * 🚨 **THE PILE IS THE LAST THING RECYCLED, AND UNTIL ROUND 12 IT WAS THE FIRST.**
   *
   * The old plain ring buffer took whatever slot came next, which on a full pool is the OLDEST
   * allocation — i.e. a piece of the pile — while pieces still tumbling through the air, and
   * dead slots elsewhere in the pool, were both left alone. Measured: the slab pool filled at
   * blow 8 of a 63-blow dig, so seven eighths of every dig was a new chip deleting an old one
   * and the floor could never accumulate. Order now:
   *
   *   1. a DEAD slot — free, and there is always one until the pool is genuinely full;
   *   2. the oldest piece still IN THE AIR — it has not landed, so nobody has seen it land;
   *   3. only then the oldest piece of the PILE, whose height is handed back first.
   *
   * ⚠️ Step 1 walks from a cursor and cannot loop forever: it runs only when `liveCount < per`,
   * so a dead slot provably exists. Step 3 walks its own cursor, so it is O(1) amortised.
   *
   * ---------------------------------------------------------------------------------------
   * 🚨 **ROUND 13 (`debris-2`): STEP 2 WAS EATING THE BURST IT WAS IN THE MIDDLE OF, AND ON A
   * SATURATED POOL THAT TURNED A TEN-PIECE SPRAY INTO ONE PIECE.**
   * ---------------------------------------------------------------------------------------
   * "The oldest piece still in the air" was any live piece with `rest = 0`, and a piece written
   * one iteration ago in THIS SAME `burst()` call qualifies — it is alive, it has not rested,
   * and with nothing else airborne (crumbs land in about 0.4 s, blows are 0.95 s apart) it is
   * the only candidate. So on a full pool the loop allocated a slot, filled it, and then handed
   * the same slot back nine times: **`burst(kind, at, 10)` returned 10 and left 1 piece.**
   *
   * 🎯 **MEASURED, AND IT IS THE CLEAN FLOOR COMING BACK FOR THE SECOND DIG**
   * (`harness/_debris2-cause.mjs`, two digs 40 m apart, same seed): the first dig left **305**
   * pieces resting, and the second dig — on pools its own first dig had filled — left **64**,
   * of which 63 were slabs from the one pool that had not saturated. Every plaster crumb of a
   * whole second dig was deleted by the crumb spawned after it.
   *
   * The guard is `age > 0`: `update()` adds `dt` before anything else, so a piece that has
   * survived one frame has a positive age and a piece born this frame has exactly zero. Nothing
   * spawned in the current frame can be recycled — not by a later piece in the same burst, and
   * not by the plaster burst that follows the slab burst out of one `onChunk`. When every
   * airborne piece is that young, step 2 declines and step 3 takes the oldest of the PILE, which
   * is the right thing to forget: a bounded pool must forget something, and the drift you are
   * standing in front of should outlive the drift two rooms away.
   */
  _alloc(p) {
    if (p.liveCount < p.per) {
      for (let k = 0; k < p.per; k++) {
        const i = (p.next + k) % p.per;
        if (!p.alive[i]) { p.next = (i + 1) % p.per; p.liveCount++; return i; }
      }
    }
    // `oldestAge` starts at 0, not -1: a piece born this frame has age exactly 0 and must not
    // qualify. See the header — this one comparison is the whole fix.
    let oldest = -1, oldestAge = 0;
    for (let i = 0; i < p.per; i++) {
      if (p.alive[i] && !p.rest[i] && !p.big[i] && p.age[i] > oldestAge) { oldestAge = p.age[i]; oldest = i; }
    }
    // the pile, oldest first — and a big chunk is the last thing in it to go, for the reason
    // given on `big` in the constructor. Two passes over one cursor, still O(1) amortised.
    // Smash lab (`keepRest`): never steal a landed plate. Drop the spawn instead.
    if (oldest < 0 && this.keepRest) return -1;
    if (oldest < 0) {
      for (let k = 0; k < p.per; k++) {
        const i = (p.rnext + k) % p.per;
        if (p.alive[i] && !p.big[i]) { p.rnext = (i + 1) % p.per; oldest = i; break; }
      }
    }
    if (oldest < 0) {
      for (let k = 0; k < p.per; k++) {
        const i = (p.rnext + k) % p.per;
        if (p.alive[i]) { p.rnext = (i + 1) % p.per; oldest = i; break; }
      }
    }
    if (oldest < 0) { oldest = p.next; p.next = (p.next + 1) % p.per; }
    this._pileRefund(p, oldest);
    return oldest;
  }

  /**
   * @param {string} kind      key of DEBRIS_KINDS
   * @param {THREE.Vector3} at world position of the hit
   * @param {number} count
   * @param {object} [o] {spread, speed, normal, area, eject}
   *   `area` spawns across a box (the break edge) instead of a point, which is what stops
   *   a collapse reading as a firework. `eject` is the fraction thrown hard outward; the
   *   rest is SHED — it drops off the edge under its own weight, which is what most of a
   *   failing wall actually does and what puts material on the floor quickly.
   *
   * ---------------------------------------------------------------------------
   * 🚨 **ROUND 5: `area` AND THE SHED VELOCITY WERE IN WORLD AXES, AND THIS IS WHY A HAMMER
   * THAT PROVABLY LANDS CAN PRODUCE NOTHING YOU CAN SEE.**
   * ---------------------------------------------------------------------------
   * `critic-swing-2` filed WEAK on one blocking defect: on an ordinary breachable wall the hook
   * fires, `removed` is a real 0.28, `blocked` is false, `chunkSize` computes to 0.30, both of
   * `views/game.js`'s VFX thresholds are cleared — **and three frames across contact show no
   * chip, no dust and no flash.** Round 3 fixed the hook; the break was here, one layer further
   * down, and it is silent by construction because every count and every threshold is correct.
   *
   * Both of these lines were written against a wall whose normal is +z, and then read as if they
   * were general:
   *
   *   · **the spawn box** — `px += (rand-0.5) * area.x`, `py += … * area.y`, `pz += … * area.z`.
   *     `area` is handed in by the caller as *(along the face, up the face, a little proud of
   *     it)*: `views/game.js` spawns a slab with `{x: size*0.5, y: size*0.5, z: 0.06}`. On a wall
   *     facing **±x** — which is half the walls in this house, including every panel in the
   *     service passage — `area.x` is `size/2` of spread **straight through the masonry** and
   *     `area.z` is spread ALONG the face. So the piece the blow is supposed to have knocked off
   *     spawns up to 7.5 cm INSIDE a 0.30 m wall, where the wall draws over it.
   *   · **the shed velocity** — `vz = (0.25 + rand*0.9) * sp`, i.e. hardcoded world +z, for the
   *     70% of pieces that are shed rather than ejected. On a wall facing **−z** that vector
   *     points INTO the wall, so the pieces that are meant to drop off the face are driven
   *     backwards through it on the frame they are born.
   *
   * ⚠️ **AND IT IS INVISIBLE TO EVERY EXISTING TEST**, which is why it survived three rounds of
   * work on exactly this feeling. `spawned` is right, `liveCount` is right, `mesh.visible` is
   * right, the pool is in the scene, the draw call is paid. Nothing is missing — the material is
   * on the wrong side of the wall. A probe that counts particles cannot see it; only a picture
   * of the contact point can, which is what the critic took.
   *
   * The fix is to build the face's own frame from the normal it is already given and express
   * both in it. **It is exactly identity for `n = (0,0,1)`** — `t` comes out `(1,0,0)`, `up` is
   * `(0,1,0)`, `n` is `(0,0,1)`, so every term reduces to the line it replaces and the +z walls
   * everything was tuned against are unchanged to the digit.
   */
  burst(kind, at, count, o = {}) {
    const p = this.pools[kind];
    if (!p) return 0;
    const r = this.rng;
    const speed = o.speed ?? 3.2;
    const spread = o.spread ?? 0.55;
    const area = o.area;
    const eject = o.eject ?? 0.42;
    /**
     * ⚠️ **`o.normal` IS THE ONLY DIRECTION THIS FUNCTION HAS, AND ITS DEFAULT IS A REAL TRAP.**
     * There is no `o.dir` and there never has been. A caller that omits `normal` gets world +z —
     * which is invisible in the half of the mansion whose walls face +z and wrong in the other
     * half — and three callers were passing a `dir` that read as intent while doing nothing:
     * `views/game.js` `onBreak` (fixed 2026-08-10, see the round-15 note in the header) and
     * `game/weapons.js` twice. **If you are spawning off a surface, pass its `normal`.**
     */
    const n = o.normal ?? { x: 0, y: 0, z: 1 };
    /**
     * The face's own frame: `t` runs along the wall in the floor plane, `up` is up, `n` is out
     * into the room. Every wall in this house is vertical, so `up` is exact and `t` is the
     * horizontal perpendicular to the normal. Degenerate only for a FLOOR normal (0,±1,0), which
     * no caller passes and which falls back to world x rather than to NaN.
     */
    const tl = Math.hypot(n.z, n.x);
    const tx = tl > 1e-4 ? n.z / tl : 1, tz = tl > 1e-4 ? -n.x / tl : 0;
    /**
     * 🧱 **`align` IS WHAT MAKES A SLAB READ AS A PIECE OF THIS WALL RATHER THAN AS A ROCK.**
     * A plate spawned at a random orientation is a plate that was never attached to anything.
     * With `align` set to the face normal the piece starts flush — its wall face still pointing
     * back into the room, exactly as it was a frame ago — and only then begins to tumble. Every
     * wall in this house is axis-aligned, so a yaw of `atan2(n.x, n.z)` is exact; on a skew wall
     * it is off by the wall's own tilt, which is smaller than the spawn jitter.
     */
    const align = o.align ?? null;
    const alignYaw = align ? Math.atan2(align.x, align.z) : 0;
    const spinScale = o.spinScale ?? 1;
    /** Metres. Overrides the kind's own scale range — used to size a chunk to the patch removed. */
    const size = o.size ?? 0;
    let spawned = 0;

    for (let k = 0; k < count; k++) {
      // A slot: a dead one, then the oldest thing still in the air, then the pile's oldest
      // member. Never an allocation and never a dropped frame — see `_alloc`.
      const i = this._alloc(p);
      if (i < 0) break;
      if (i + 1 > p.high) { p.high = i + 1; p.mesh.count = p.high; }

      if (area) {
        // along the face, up the face, a little proud of it — see the header.
        // ⚠️ THE DEPTH TERM IS ONE-SIDED AND THE OTHER TWO ARE NOT. `area.z` is how far a piece
        // may sit off the face; CENTRED, half of every burst spawns BEHIND the face, i.e. inside
        // the masonry, where the wall draws over it — measured on the fix run for this defect:
        // 5 of 14 pieces from one blow, up to 5 cm in. A chunk that came off a wall is in front
        // of that wall. Room side only, and the same 6 cm of variation.
        const a1 = (r() - 0.5) * area.x;
        const a2 = (r() - 0.5) * area.y;
        const a3 = r() * (area.z ?? 0.10);
        p.px[i] = at.x + tx * a1 + n.x * a3;
        p.py[i] = at.y + a2 + n.y * a3;
        p.pz[i] = at.z + tz * a1 + n.z * a3;
      } else {
        p.px[i] = at.x + (r() - 0.5) * spread;
        p.py[i] = at.y + (r() - 0.5) * spread;
        p.pz[i] = at.z + (r() - 0.5) * spread * 0.4;
      }

      if (r() < eject) {
        // ejected: a cone about the surface normal, fast
        const sp = speed * (0.55 + r() * 1.0);
        p.vx[i] = (n.x + (r() - 0.5) * 1.35) * sp;
        p.vy[i] = (n.y + (r() - 0.5) * 0.9 + 0.42) * sp;
        p.vz[i] = (n.z + (r() - 0.5) * 1.2) * sp;
      } else {
        // shed: barely leaves the wall, falls almost straight down — but OFF THE FACE, which
        // means along this wall's normal and not along world +z. See the header.
        const sp = speed * (0.10 + r() * 0.42);
        const slide = (r() - 0.5) * sp * 1.1;
        const off = (0.25 + r() * 0.9) * sp;
        p.vx[i] = tx * slide + n.x * off;
        p.vy[i] = -(0.1 + r() * 0.7) * sp + n.y * off;
        p.vz[i] = tz * slide + n.z * off;
      }

      if (align) {
        // flush against the face, then a few degrees of slop so two pieces are never twins
        p.rx[i] = (r() - 0.5) * 0.34;
        p.ry[i] = alignYaw + (r() - 0.5) * 0.34;
        p.rz[i] = (r() - 0.5) * 0.50;
      } else {
        p.rx[i] = r() * 6.283; p.ry[i] = r() * 6.283; p.rz[i] = r() * 6.283;
      }
      const spin = p.def.spin * spinScale;
      p.wx[i] = (r() - 0.5) * spin; p.wy[i] = (r() - 0.5) * spin; p.wz[i] = (r() - 0.5) * spin;

      // A collapse throws a few big slabs among a lot of crumbs, and the size spread is
      // most of what reads as "structural failure" rather than "confetti".
      const u = r();
      p.sc[i] = size > 0
        // sized to the patch that was removed — see `wallSlab`. The base plate is 0.22 m wide,
        // so a metre size divides by that; the spread is kept but narrowed, because a chunk
        // whose size is the MEASUREMENT of a blow must not then be randomised past recognition.
        ? (size / 0.22) * (0.82 + r() * 0.36)
        : p.def.scale[0] + u * u * (p.def.scale[1] - p.def.scale[0]) * (r() < 0.12 ? 1.6 : 1.0);
      /**
       * 🧱 **THE SHAPE FAMILY.** One geometry, three per-instance axis factors — see the note
       * on `ax` in the constructor. The y factor is derived from the other two so the piece
       * keeps roughly the bulk its scale asked for: a piece that is wide and thin in plan is
       * tall in section, which is what a broken slab of a 0.15 m wall actually looks like when
       * it lands on its edge.
       */
      const asp = p.def.aspect ?? [0.85, 0.30, 0.85, 0.30];
      const fx = asp[0] + r() * asp[1];
      const fz = asp[2] + r() * asp[3];
      p.ax[i] = fx;
      p.az[i] = fz;
      p.ay[i] = Math.min(1.9, Math.max(0.55, 1 / Math.sqrt(Math.max(0.2, fx * fz))));
      p.life[i] = p.def.life[0] + r() * (p.def.life[1] - p.def.life[0]);
      p.age[i] = 0;
      p.alive[i] = 1;
      p.rest[i] = 0;
      p.hits[i] = 0;
      p.pcell[i] = -1;
      p.pdh[i] = 0;
      /**
       * ⚠️ **A RECYCLED SLOT INHERITS EVERYTHING THE LAST PIECE HAD, so the wall plane and the
       * sag have to be written on EVERY spawn and not only where they are used.** A crumb that
       * came back holding the previous occupant's pendulum would swim into a wall thirty metres
       * away. `burst` never sags — the spray is unchanged — but it does carry the plane when the
       * caller gave a normal, so a piece that slides along the face cannot slide into it.
       */
      // ⚠️ **OPT-IN (`o.wall`), NOT AUTOMATIC ON ANY CALLER THAT HAPPENS TO PASS A NORMAL.**
      // `views/wall-transition.js` passes one too, and it is a SCORED view this slice does not
      // own — turning the clamp on there would move its pixels for a benefit nobody asked for.
      if (o.wall && o.normal) {
        p.wnx[i] = n.x; p.wnz[i] = n.z;
        p.wd[i] = n.x * at.x + n.z * at.z;
      } else { p.wnx[i] = 0; p.wnz[i] = 0; p.wd[i] = 0; }
      p.sag[i] = 0;
      p.whit[i] = 0;
      p.big[i] = 0;
      p.hold[i] = 0;      // same rule as `sag`: a recycled slot must not inherit a hold

      /**
       * per-instance tint: dirtier or cleaner, so two chunks side by side are never the
       * same value even before the lighting gets to them.
       *
       * ⚠️ **ROUND 12: THE FLOOR OF THE RANGE CAME UP, 0.62 → 0.84.** At 0.62 a quarter of
       * every burst was a piece at 60% of the material's own value, and in a service passage or
       * an unlit gallery those are the pieces that photograph as dark chips on a dark floor —
       * `critic-slice-3`'s *"six to ten chips"* was in part a count of the pale ones. The art
       * has variation in the pile and none of it is dark: `refs/_sheets/dig.png` tile 5 is
       * white slabs on a near-black parquet, and every piece in it reads as the same material.
       */
      const d = 0.84 + r() * 0.34;
      p.mesh.setColorAt(i, _c.setRGB(d, d * (0.97 + r() * 0.07), d * (0.93 + r() * 0.11)));
      p.dirtyColor = true;
      spawned++;
    }
    // see the constructor: an empty pool draws nothing, so a live one has to say so.
    // ⚠️ `moving` has to move here too, or `update()`'s settled-pool early-out skips the pool
    // that just gained a particle and the burst never integrates. The next full pass replaces
    // this estimate with the exact count.
    if (spawned) { p.mesh.visible = true; p.dirtyMatrix = true; p.moving += spawned; }
    return spawned;
  }

  /**
   * ---------------------------------------------------------------------------------------
   * 🧱 **ONE BIG CHUNK — the region that came away, as a SINGLE OBJECT.**
   * ---------------------------------------------------------------------------------------
   * John, 2026-08-09, on the Teardown mechanic he wants:
   *
   *   > *"when a piece becomes unsupported it **falls off as one big chunk** and **has its own
   *   > physics bouncing off the wall and into the pile on the ground**. I don't need it to
   *   > have its own physics like that but I would like it to be **passable as that**."*
   *
   * ⚠️ **`burst()` IS THE WRONG SHAPE FOR THIS AND NO AMOUNT OF TUNING FIXES THAT.** A region
   * the size of a dinner plate paid out as fourteen chips is a lie about what just happened —
   * the same lie round 12 fixed for the ordinary blow by sizing ONE slab to the patch removed.
   * A collapse is that argument at ten times the scale, so it gets its own entry point: the
   * caller says *"this region, now"* and gets back one plate with the region's own width,
   * height and thickness.
   *
   * 🎯 **"PASSABLE AS PHYSICS" IS A CANNED, SEEDED TUMBLE, AND THAT IS NOT A COMPROMISE — IT IS
   * WHAT THE DETERMINISM RULE ALREADY REQUIRES.** `disconnection.md` §5: the field replays
   * exactly from its hit list and nothing may go on the wire. A live solver would break replay.
   * John's *"I don't need it to have its own physics"* and that constraint agree exactly, so
   * there is no solver here and there is nothing to apologise for. What there IS:
   *
   *  1. **IT TIPS BEFORE IT FALLS.** A slab losing its key hinges outward at the top; the piece
   *     leaves flush with the face and is given most of its spin about the wall's own tangent,
   *     so it topples out of the wall rather than spawning at a random attitude like a rock.
   *  2. **IT COMES BACK AND CLIPS THE WALL — `sag`.** This is the part that sells it. A chunk
   *     that drops straight down reads as a lift; one that swings out, sags back against the
   *     face below it, catches, and kicks off reads as demolition. `sag` is a constant inward
   *     acceleration applied while the piece is airborne, so the trajectory is a pendulum
   *     against a plane: three floats, no bodies, no broadphase, and it is a pure function of
   *     the seed.
   *  3. **IT LOSES ENERGY ON CONTACT.** The wall hit keeps 0.26 of the inward speed and scrubs a
   *     quarter of the tangential, and every contact adds spin. It never bounces elastically,
   *     because a plate of plaster does not.
   *  4. **IT LANDS LEANING.** See `update()`: a piece that settles within a third of a metre of
   *     its own wall plane rests propped against it rather than lying flat, at a seeded angle.
   *     **A pile of slabs all at the same angle is the tell**, so the lean is drawn per piece
   *     and widens with the rubble already under it.
   *
   * ⚠️ **NO NEW POOL AND NO NEW MATERIAL KEY.** This is the `slab` pool the ordinary blow
   * already pays for. `calls-1` priced the pessimal station and a sixth `InstancedMesh` would
   * have spent the headroom on the rarest event in the game.
   *
   * ⚠️ **WHICH material comes away is NOT decided here** — that is `damagefield.js` `_collapse()`
   * and the slice that owns it. This is the receiving end.
   *
   * @param {string} kind        pool key; `slab` unless you have a reason
   * @param {THREE.Vector3} at   centre of the region, ON the face
   * @param {object} o
   *   @param {number} o.w         region width in metres (along the face)
   *   @param {number} o.h         region height in metres
   *   @param {number} [o.t=0.075] plate thickness in metres
   *   @param {{x,y,z}} o.normal   the face normal
   *   @param {number} [o.sag]     inward acceleration, m/s² — 0 disables the wall contact
   *   @param {number} [o.hold=0]  seconds this plate stays part of the wall before it lets go
   *   @param {number} [o.spread=0] 0..1, how much wider than the round-13 launch this plate goes
   *   @returns {number} slot index, or -1
   *
   * ---------------------------------------------------------------------------------------
   * 🧱 **`hold` AND `spread` — THE TWO TERMS THAT STOP A COLLAPSE BEING A SHEET, AND BOTH ARE
   * ZERO BY DEFAULT SO EVERY EXISTING CALLER IS BIT-FOR-BIT UNCHANGED.**
   *
   * John, 2026-08-10: *"the sections all **falling down at once and in the same direction
   * statically like a sheet** isn't immersive either."* `critic-dig-8` measured it on this exact
   * function, driven headless at 60 Hz: with the group's own centroid subtracted, the RMS
   * *relative* scatter of a 14-plate storey is **0.034 m at 0.20 s and 0.147 m at 0.40 s against a
   * 0.56 m plate** — for the whole airborne phase **the group translates 5–8× further than it
   * deforms**, and what dispersion there is arrives from the LANDING, not the fall. Four causes,
   * all here: every plate got the same `cw`/`ch` and therefore the same size-derived spin scale,
   * `vy ∈ [−0.10, −0.55]`, `out` **always outward**, and **one spawn frame.**
   *
   *   · **`hold` is the big one, because "one spawn frame" is the term that dominates.** A plate
   *     held 0.2 s is a fifth of a second behind its neighbour on a flight that lasts two thirds
   *     of one — larger than every velocity difference in this function put together. It is also
   *     the only version of the fix that is not a lie: a held plate sits flush in the face, drawn
   *     exactly where its material stood, so the region peels instead of teleporting.
   *   · **`spread` widens `out`, `slide` and `vy` around the same means.** ⚠️ **It consumes the
   *     SAME NUMBER OF `r()` CALLS in both arms**, so an A/B moves the plates and nothing else in
   *     the rng stream — the trap `_debris2-cause.mjs` was written after.
   *
   * ✅ **THE LANDED HEAP IS NOT TOUCHED BY EITHER.** `critic-dig-8`: *"`…LANDED.png` is a genuine
   * drift of angular slabs lying at every angle and leaning on each other — it is the reference
   * frame, achieved. Do not fix the debris. Fix the 0.8 seconds between letting go and resting."*
   * Nothing below changes the contact, the brake, the lean or the pile.
   */
  chunk(kind, at, o = {}) {
    const p = this.pools[kind];
    if (!p) return -1;
    const r = this.rng;
    const n = o.normal ?? { x: 0, y: 0, z: 1 };
    const tl = Math.hypot(n.z, n.x);
    const tx = tl > 1e-4 ? n.z / tl : 1, tz = tl > 1e-4 ? -n.x / tl : 0;

    // the plate's own dimensions, from the region. `wallSlab` is 0.22 x 0.19 x 0.058 at
    // scale 1, so the axis factors ARE the region's measurements — see `ax` in the constructor.
    const w = Math.max(0.12, o.w ?? 0.4);
    const h = Math.max(0.12, o.h ?? 0.4);
    const t = Math.max(0.030, o.t ?? 0.075);

    const i = this._alloc(p);
    if (i < 0) return -1;
    if (i + 1 > p.high) { p.high = i + 1; p.mesh.count = p.high; }

    p.sc[i] = 1;
    p.ax[i] = w / 0.22;
    p.ay[i] = h / 0.19;
    p.az[i] = t / 0.058;

    // It leaves flush with the face, a little proud of it, with a few degrees of slop.
    // ⚠️ **PROUD ENOUGH TO CLEAR ITS OWN HALF-THICKNESS**, or `update()`'s wall contact fires on
    // the frame it is born and the plate loses its push-off before it has left the wall. The
    // clearance term is the same one the contact uses, so the two cannot drift apart.
    const proud = p.halfZ * (t / 0.058) + 0.023;
    p.px[i] = at.x + n.x * proud + tx * (r() - 0.5) * w * 0.10;
    p.py[i] = at.y + (r() - 0.5) * h * 0.10;
    p.pz[i] = at.z + n.z * proud + tz * (r() - 0.5) * w * 0.10;

    // barely thrown. It is not ejected, it LETS GO: a nudge out, a slide, and gravity.
    // ⚠️ `sv = 0` reduces every line below to the round-13 expression exactly, same rng draws.
    const sv = Math.max(0, Math.min(1, o.spread ?? 0));
    /**
     * 🚨 **`out` IS WIDENED AROUND ITS OWN MEAN AND NOT PUSHED, AND THAT WAS MEASURED THE WRONG
     * WAY ROUND FIRST.** The obvious version of "spread" raises the outward push, and it makes the
     * one thing this slice must not do WORSE: a plate that comes toward the camera **magnifies its
     * own shadow on the breach**, so throwing the payout at the player is throwing it over the hole
     * the player is trying to see. `_sag1-grain` S5 caught it — the first shaping took mean `out`
     * 0.575 → 0.84 and mean occlusion of the breach went **47.2% → 50.0%**, i.e. the payout change
     * alone was a regression on `critic-dig-8`'s second finding. **The deformation has to come from
     * the SPREAD of `out`, from `slide`, and above all from `vy`** — downward is the only direction
     * that takes a plate out of the aperture. Mean `out` is therefore held at the round-13 value to
     * two decimal places and only its range moves.
     */
    const out = (0.30 - sv * 0.25) + r() * (0.55 + sv * 0.53);
    const slide = (r() - 0.5) * (0.55 + sv * 1.05);
    p.vx[i] = n.x * out + tx * slide;
    p.vy[i] = -(0.10 + r() * (0.45 + sv * 1.75));
    p.vz[i] = n.z * out + tz * slide;

    // flush against the face to start, exactly as it was a frame ago
    p.rx[i] = (r() - 0.5) * 0.10;
    p.ry[i] = Math.atan2(n.x, n.z) + (r() - 0.5) * 0.10;
    p.rz[i] = (r() - 0.5) * 0.14;
    /**
     * 🧱 **THE TOPPLE AXIS IS THE WALL'S TANGENT, AND ON AN AXIS-ALIGNED HOUSE THAT IS A WORLD
     * AXIS.** Every wall here is axis-aligned (`burst`'s frame already relies on it), so a face
     * pointing along ±z topples about world X and a face pointing along ±x topples about world
     * Z. Putting the spin on the right axis is the difference between a slab peeling off a wall
     * and a dice roll. A big plate turns SLOWLY — the spin is scaled down by its own size,
     * because a 0.6 m slab spinning at a crumb's rate reads as a leaf.
     */
    const slow = Math.max(0.28, Math.min(1, 0.34 / Math.max(w, h)));
    const spin = p.def.spin * slow * (o.spinScale ?? 1);
    const zAxis = Math.abs(n.z) >= Math.abs(n.x);
    const topple = (0.55 + r() * 0.85) * spin * (r() < 0.5 ? -1 : 1);
    p.wx[i] = zAxis ? topple : (r() - 0.5) * spin * 0.30;
    p.wy[i] = (r() - 0.5) * spin * 0.35;
    p.wz[i] = zAxis ? (r() - 0.5) * spin * 0.30 : topple;

    // the pendulum: it swings out, sags back, and catches the face below it
    p.wnx[i] = n.x; p.wnz[i] = n.z;
    p.wd[i] = n.x * at.x + n.z * at.z;
    /**
     * ⚠️ **DOUBLED WITH THE FALL — 1.7–3.8 → 3.4–7.6 m/s², AND IT IS A PERIOD MATCH, NOT A TASTE
     * CHANGE.** The pendulum is what makes John's *"bouncing off the wall and into the pile on the
     * ground"* read, and it only sells it if the piece comes back to the face while it is still
     * high enough to be seen doing it. At the old 1.4 m/s terminal a chunk had a full second of
     * fall to swing back through; now it reaches the floor in about 0.7 s, so at the old
     * acceleration the slower half of the distribution would have landed before ever touching the
     * wall. The contact now lands at 0.25–0.40 s in every case, a third of a metre down the face.
     */
    p.sag[i] = o.sag ?? (3.4 + r() * 4.2);
    p.whit[i] = 0;

    p.life[i] = 60;             // a chunk this size never times out; it lands and it stays
    p.age[i] = 0;
    p.hold[i] = Math.max(0, o.hold ?? 0);
    p.alive[i] = 1;
    p.rest[i] = 0;
    p.hits[i] = 0;
    p.big[i] = 1;
    p.pcell[i] = -1;
    p.pdh[i] = 0;

    if (o.color && Number.isFinite(o.color.r)) {
      p.mesh.setColorAt(i, _c.setRGB(o.color.r, o.color.g, o.color.b));
    } else {
      const d = 0.86 + r() * 0.30;
      p.mesh.setColorAt(i, _c.setRGB(d, d * (0.97 + r() * 0.07), d * (0.93 + r() * 0.11)));
    }
    p.dirtyColor = true;
    p.mesh.visible = true;
    p.dirtyMatrix = true;
    p.moving += 1;
    return i;
  }

  update(dt) {
    if (dt <= 0) return;
    const g = this.gravity;
    const r = this.rng;
    for (const name in this.pools) {
      const p = this.pools[name];
      if (p.dirtyColor) { p.mesh.instanceColor.needsUpdate = true; p.dirtyColor = false; }
      if (!p.liveCount) { p.mesh.visible = false; p.high = 0; p.mesh.count = 0; continue; }
      /**
       * 🚨 **A PILE THAT NEVER MOVES MUST NOT COST A RE-UPLOAD EVERY FRAME, AND THIS IS WHAT
       * MAKES A PERMANENT PILE AFFORDABLE.** Before round 12 the loop below ran, and
       * `instanceMatrix.needsUpdate` was set, on every frame for any pool with a single live
       * piece — including a pool holding 300 settled pieces that will never move again for the
       * rest of the run. That is a 20 KB buffer re-upload per pool per frame to write exactly
       * the bytes already there. `moving` counts the pieces that are still integrating; at zero
       * the whole pool is skipped and the pile costs precisely its draw call.
       */
      if (!p.moving) { if (p.dirtyMatrix) { p.mesh.instanceMatrix.needsUpdate = true; p.dirtyMatrix = false; } continue; }
      const def = p.def;
      const drag = Math.pow(def.drag, dt * 60);
      /** see `vTerm` in `DEBRIS_KINDS`: how fast this material may fall, m/s. */
      const vTerm = def.vTerm ?? 14;
      const mesh = p.mesh;
      let live = 0, moving = 0;

      for (let i = 0; i < p.high; i++) {
        if (!p.alive[i]) continue;
        if (p.rest[i]) { live++; continue; }      // settled: already in its final matrix
        /**
         * 🧱 **STILL PART OF THE WALL — see `chunk()`'s `hold`.** It is drawn, flush in the face,
         * at the pose it was spawned with, and it integrates nothing. This is how a region PEELS:
         * the plates over the crack go first and the ones above follow, instead of the whole
         * lattice leaving on one frame in one direction. It ages nothing while it waits, so its
         * flight is the same flight whenever it starts.
         */
        if (p.hold[i] > 0) {
          p.hold[i] -= dt;
          live++; moving++;
          _e.set(p.rx[i], p.ry[i], p.rz[i]);
          _q.setFromEuler(_e);
          _v.set(p.px[i], p.py[i], p.pz[i]);
          _s.set(p.sc[i] * p.ax[i], p.sc[i] * p.ay[i], p.sc[i] * p.az[i]);
          _m.compose(_v, _q, _s);
          mesh.setMatrixAt(i, _m);
          continue;
        }
        p.age[i] += dt;
        // Only pieces still in the air can time out. Anything that has reached the floor
        // is scenery and stays — a collapse that tidies up after itself is the reason the
        // critic found nothing resting anywhere in the frame.
        if (p.age[i] >= p.life[i] && !p.hits[i]) {
          p.alive[i] = 0;
          p.liveCount--;
          _m.makeScale(0, 0, 0);
          mesh.setMatrixAt(i, _m);
          continue;
        }
        live++; moving++;

        /**
         * 🚨 **THE FALL ACCELERATES. IT DID NOT BEFORE, AND THAT WAS THE "FLOAT".** See `vTerm`
         * in `DEBRIS_KINDS` for the arithmetic: `drag` applied to `vy` is not air resistance, it
         * is a terminal velocity of 1.0–2.1 m/s, hit in a third of a second and held for the rest
         * of the flight. So `drag` now damps the HORIZONTAL only — that is the part it was doing
         * usefully, turning a thrown crumb into a dropped one — and the vertical axis carries a
         * real terminal speed that nothing in a 2.8 m room reaches. A slab now leaves the wall at
         * ~0.3 m/s and arrives at the floor at ~6 m/s.
         *
         * ⚠️ **RISING IS STILL DAMPED, AND THAT IS NOT AN INCONSISTENCY.** An ejected crumb's
         * upward arc is a THROW being spent, which is exactly what `drag` models; the defect was
         * only ever on the way down. Keeping it means the crumb spray's height is unchanged and
         * only its descent is fixed, so nothing that was tuned by eye had to be re-tuned.
         */
        p.vy[i] += g * dt;
        p.vx[i] *= drag; p.vz[i] *= drag;
        if (p.vy[i] > 0) p.vy[i] *= drag;
        else if (p.vy[i] < -vTerm) p.vy[i] = -vTerm;

        if (def.flutter && !p.hits[i]) {
          // paper: sideways drift that reverses, so it tumbles instead of falling
          p.vx[i] += Math.sin(p.age[i] * 6.0 + i) * 1.4 * dt;
          p.vz[i] += Math.cos(p.age[i] * 5.1 + i) * 1.4 * dt;
        }

        /**
         * 🧱 **THE PENDULUM — `sag` pulls a big chunk BACK against the face it left.** See
         * `chunk()`. It is zero for everything `burst()` spawns, so the crumb spray integrates
         * exactly as it did; and it is cut on each contact, so a chunk walks DOWN the wall
         * catching it two or three times instead of grinding along it.
         */
        if (p.sag[i] && !p.hits[i]) {
          p.vx[i] -= p.wnx[i] * p.sag[i] * dt;
          p.vz[i] -= p.wnz[i] * p.sag[i] * dt;
        }

        p.px[i] += p.vx[i] * dt;
        p.py[i] += p.vy[i] * dt;
        p.pz[i] += p.vz[i] * dt;

        /**
         * 🧱 **IT BOUNCES OFF THE WALL ON THE WAY DOWN, AND THAT IS THE READ.** John's sentence
         * is *"bouncing off the wall and into the pile on the ground"* — the wall contact is not
         * decoration, it is the thing that separates demolition from a scripted effect. The wall
         * is one plane per piece (`wnx, wnz, wd`), so this is four multiplies and a compare, it
         * needs no broadphase, and it is a pure function of the seed.
         *
         * ⚠️ **INELASTIC ON PURPOSE.** A plate of plaster keeps about a quarter of the speed it
         * arrives with and loses a quarter of its tangential; anything springier reads as rubber.
         * Every contact also re-rolls most of the tumble, which is what stops a chunk that
         * grazes the face twice from doing the same thing twice.
         */
        const wnx = p.wnx[i], wnz = p.wnz[i];
        if ((wnx !== 0 || wnz !== 0) && !p.hits[i]) {
          const clr = p.halfZ * p.sc[i] * p.az[i] + 0.015;
          const dw = wnx * p.px[i] + wnz * p.pz[i] - p.wd[i];
          if (dw < clr) {
            p.px[i] += wnx * (clr - dw);
            p.pz[i] += wnz * (clr - dw);
            const vn = p.vx[i] * wnx + p.vz[i] * wnz;
            /**
             * 🚨 **THE PENDULUM IS SPENT BY ANY TOUCH, AND UNTIL THIS LINE IT WAS NOT — WHICH IS
             * THE SECOND CAUSE OF JOHN'S FLOAT, AND THE ONE THAT ONLY SHOWED UP ONCE THE FIRST
             * WAS FIXED.** `sag` was decayed only on an IMPACT, so a plate that came to rest
             * against the face at a grazing speed was held there by an undiminished inward
             * acceleration and re-contacted on **every single frame** — measured at **68 wall
             * contacts in one 2.2 m fall**, each one taking 10% off `vy`. 0.9 per frame is a
             * terminal velocity of 1.4 m/s, i.e. exactly the drift `vTerm` had just removed,
             * rebuilt from a different part of the loop. A swing is spent by touching; it is not
             * a magnet.
             */
            p.sag[i] *= 0.45;
            /**
             * ⚠️ **ONLY A PIECE MOVING INTO THE WALL WITH REAL SPEED PAYS FOR THE CONTACT.** A
             * piece already heading out is simply put back in front of the face — it has not hit
             * anything. The first draft charged both, which taxed every crumb on the frame it was
             * born (`burst` spawns up to 10 cm proud, and a big scaled-up plate's own
             * half-thickness is more than that), so a spray lost a quarter of its tangential
             * speed at spawn for nothing. The 0.25 m/s floor is the rest of that argument: a
             * graze is a graze, and charging it turns the contact into the grind above.
             */
            if (vn < -0.25) {
              p.whit[i] = Math.min(255, p.whit[i] + 1);
              const tvx = (p.vx[i] - vn * wnx) * 0.74;
              const tvz = (p.vz[i] - vn * wnz) * 0.74;
              // a floor on the push-off, so the plate visibly LEAVES the face instead of
              // scraping down it — the difference between "bounces off the wall" and "slides"
              const outv = Math.max(0.42, -vn * 0.26);
              p.vx[i] = tvx + wnx * outv;
              p.vz[i] = tvz + wnz * outv;
              p.vy[i] *= 0.90;
              p.wx[i] = p.wx[i] * 0.70 + (r() - 0.5) * 2.4;
              p.wy[i] = p.wy[i] * 0.70 + (r() - 0.5) * 2.4;
              p.wz[i] = p.wz[i] * 0.70 + (r() - 0.5) * 2.4;
            } else if (vn < 0) {
              // a graze: cancel the inward component and nothing else. No energy leaves.
              p.vx[i] -= vn * wnx;
              p.vz[i] -= vn * wnz;
            }
          }
        }

        /**
         * 🧱 **THE SURFACE A PIECE LANDS ON IS THE PILE, NOT THE FLOOR.** One `Map` lookup,
         * and it is the whole difference between two hundred pieces stacked into a drift and
         * two hundred pieces interpenetrating in a single plane 2 cm thick — which is what
         * `critic-slice-3` photographed and counted as "six to ten chips".
         */
        const fy = this.floorY + this._pileAt(p.px[i], p.pz[i]);
        if (p.py[i] < fy) {
          p.py[i] = fy;
          p.hits[i] = Math.min(255, p.hits[i] + 1);
          /**
           * 🧱 **A SLAB ACCELERATES, HITS, AND STOPS — AND THE STOP IS HALF OF "HEAVY".**
           * John's defect was *"they float down to the ground"*, and a piece that drifts down and
           * then settles gently is floating at both ends of the flight. Now that the fall is real
           * (see `vTerm`) a plate arrives at 5–7 m/s instead of 1.4, and the ARRIVAL has to read
           * as mass too: the faster it lands the more of its run it loses, so it does not skate
           * away from its own impact. A crumb is unchanged — light things do skitter.
           */
          const impact = Math.abs(p.vy[i]);
          const dead = p.big[i] && impact > 2.4;
          if (!dead && impact > 0.30 && p.hits[i] < 4) {
            p.vy[i] = -p.vy[i] * def.bounce;
            p.vx[i] *= 0.62; p.vz[i] *= 0.62;
            p.wx[i] *= 0.45; p.wy[i] *= 0.45; p.wz[i] *= 0.45;
          } else {
            const brake = dead ? Math.max(0.16, 0.74 - 0.10 * impact) : 0.74;
            p.vy[i] = 0; p.vx[i] *= brake; p.vz[i] *= brake;
            const spinKill = dead ? 0.22 : 0.6;
            p.wx[i] *= spinKill; p.wy[i] *= spinKill; p.wz[i] *= spinKill;
            // stopped moving: it is now part of the pile and stays there
            if (p.vx[i] * p.vx[i] + p.vz[i] * p.vz[i] < 0.035 || p.hits[i] > 8) {
              p.rest[i] = 1;
              p.vx[i] = 0; p.vz[i] = 0;
              p.wx[i] = 0; p.wy[i] = 0; p.wz[i] = 0;
              // it rolls into the lowest cell it can reach and banks its own bulk there
              const h = this._pileDrop(p, i);
              // ⚠️ **AND THE ROLL MUST NOT ROLL IT INTO THE WALL.** `_pileDrop` picks the lowest
              // of nine cells and slides the piece most of the way into it, and the cell behind
              // the face is always empty — so without this the sandpile rule quietly buries the
              // edge of every drift inside the masonry, where it is drawn over and gone.
              if (p.wnx[i] !== 0 || p.wnz[i] !== 0) {
                const cl = p.halfZ * p.sc[i] * p.az[i] + 0.015;
                const dd = p.wnx[i] * p.px[i] + p.wnz[i] * p.pz[i] - p.wd[i];
                if (dd < cl) { p.px[i] += p.wnx[i] * (cl - dd); p.pz[i] += p.wnz[i] * (cl - dd); }
              }
              /**
               * 🧱 **A PIECE ON BARE FLOOR LIES DOWN; A PIECE ON OTHER RUBBLE DOES NOT.**
               * `restRot` was written for a floor and it is right for one — a plate of plaster
               * lands on its face. On top of a pile there is no flat to land on, and
               * `refs/_sheets/dig.png` tile 5 is mostly pieces cocked at every angle against
               * each other. So the slop opens up with the height under the piece, which is
               * also what stops a deep drift reading as a neat deck of cards.
               */
              const onPile = Math.min(1, h / 0.30);
              // Furniture big plates on open floor: wider rest attitude (Teardown lean heap).
              // Dig crumbs keep the tight floor deck; only `big` chunks open the slop.
              let restSlop = 0.32 + 1.75 * onPile;
              if (p.big[i]) restSlop = Math.max(restSlop, 1.35 + 1.0 * onPile);
              p.rx[i] = def.restRot[0] + (r() - 0.5) * restSlop;
              p.rz[i] = def.restRot[1] + (r() - 0.5) * restSlop;
              // sit it ON the surface rather than through it, but let it settle in a little:
              // pieces that interlock read as a pile, pieces that float read as a spreadsheet
              const vfac = p.lyingZ ? p.az[i] : p.ay[i];
              p.py[i] = this.floorY + h + p.lying * p.sc[i] * vfac * 0.36;
              // Furniture big plates: prop some on edge even on open floor (Teardown lean heap).
              if (p.big[i]) {
                const prop = 0.75 + r() * 0.95;
                if (r() < 0.5) p.rx[i] += prop * (r() < 0.5 ? 1 : -1);
                else p.rz[i] += prop * (r() < 0.5 ? 1 : -1);
                const tall = p.standY * (p.lyingZ ? p.ay[i] : p.az[i]) * p.sc[i];
                p.py[i] += tall * 0.42 * Math.sin(Math.min(1.45, prop));
              }
              /**
               * 🧱 **A PIECE THAT LANDS AT THE FOOT OF THE WALL RESTS PROPPED AGAINST IT.**
               * John: *"come to rest at a plausible angle leaning on what is already there
               * rather than lying flat."* Every demolition photograph in `refs/lath/` has the
               * biggest plates stood on edge against the wall they came out of, and it is the
               * silhouette that makes a heap read as a heap rather than as a deck of cards.
               *
               * ⚠️ **THE ANGLE IS DRAWN PER PIECE AND THE SPREAD IS THE POINT.** A row of slabs
               * all at one angle is the tell that gives a canned tumble away — it is the same
               * failure as one plate at one aspect ratio, which is why `ax`/`ay`/`az` exist.
               * The lean also fades with distance from the face, so the drift goes from stood-up
               * at the skirting to lying flat a third of a metre out, which is the shape a real
               * drift has.
               */
              const lwx = p.wnx[i], lwz = p.wnz[i];
              if (lwx !== 0 || lwz !== 0) {
                const dw = lwx * p.px[i] + lwz * p.pz[i] - p.wd[i];
                if (dw < 0.34) {
                  const lean = (0.26 + r() * 0.92) * (1 - Math.max(0, dw) / 0.34);
                  if (Math.abs(lwz) >= Math.abs(lwx)) p.rx[i] += lean * (lwz > 0 ? 1 : -1);
                  else p.rz[i] += lean * (lwx > 0 ? -1 : 1);
                  // a plate stood up puts its own centre higher than a plate lying down
                  const tall = p.standY * (p.lyingZ ? p.ay[i] : p.az[i]) * p.sc[i];
                  p.py[i] += tall * 0.5 * Math.sin(Math.min(1.35, lean)) * 0.72;
                }
              }
              _e.set(p.rx[i], p.ry[i], p.rz[i]);
              _q.setFromEuler(_e);
              _v.set(p.px[i], p.py[i], p.pz[i]);
              _s.set(p.sc[i] * p.ax[i], p.sc[i] * p.ay[i], p.sc[i] * p.az[i]);
              _m.compose(_v, _q, _s);
              mesh.setMatrixAt(i, _m);
              p.dirtyMatrix = true;
              moving--;                             // settled: still live, no longer integrating
              continue;
            }
          }
        }

        p.rx[i] += p.wx[i] * dt; p.ry[i] += p.wy[i] * dt; p.rz[i] += p.wz[i] * dt;

        // fade out by shrinking over the last fifth of life — cheaper than per-instance
        // alpha, which would need a custom shader and a transparent sort
        const t = p.age[i] / p.life[i];
        const shrink = t > 0.80 ? 1.0 - (t - 0.80) / 0.20 : 1.0;
        const sc = p.sc[i] * Math.max(0, shrink);

        _e.set(p.rx[i], p.ry[i], p.rz[i]);
        _q.setFromEuler(_e);
        _v.set(p.px[i], p.py[i], p.pz[i]);
        _s.set(sc * p.ax[i], sc * p.ay[i], sc * p.az[i]);
        _m.compose(_v, _q, _s);
        mesh.setMatrixAt(i, _m);
      }

      p.liveCount = live;
      p.moving = moving;
      p.dirtyMatrix = false;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  get liveCount() {
    let n = 0;
    for (const k in this.pools) n += this.pools[k].liveCount;
    return n;
  }

  /** How many pieces have come to rest — the pile. Used by the view's HUD and by tests. */
  get restCount() {
    let n = 0;
    for (const k in this.pools) {
      const p = this.pools[k];
      for (let i = 0; i < p.per; i++) if (p.alive[i] && p.rest[i]) n++;
    }
    return n;
  }

  /** The deepest the rubble stands anywhere, in metres. The pile's own headline number. */
  get pileDepth() {
    let h = 0;
    for (const v of this.pile.values()) if (v > h) h = v;
    return h;
  }

  /**
   * Sweep the floor clean. Nothing in the game calls this — a collapse is meant to stay
   * collapsed — but a harness driving twenty digs in one page needs a way back to a bare
   * floor, and a pile the pieces have been recycled out from under is worse than no pile.
   */
  clear() {
    for (const k in this.pools) {
      const p = this.pools[k];
      for (let i = 0; i < p.per; i++) {
        p.alive[i] = 0; p.rest[i] = 0; p.pcell[i] = -1; p.pdh[i] = 0;
        p.big[i] = 0; p.sag[i] = 0; p.wnx[i] = 0; p.wnz[i] = 0; p.whit[i] = 0; p.hold[i] = 0;
        _m.makeScale(0, 0, 0);
        p.mesh.setMatrixAt(i, _m);
      }
      p.liveCount = 0; p.moving = 0; p.high = 0; p.next = 0; p.rnext = 0;
      p.mesh.count = 0; p.mesh.visible = false;
      p.mesh.instanceMatrix.needsUpdate = true;
    }
    this.pile.clear();
  }

  dispose() {
    this.pile.clear();
    for (const k in this.pools) {
      const p = this.pools[k];
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      p.mesh.dispose();
    }
    this.pools = {};
  }
}

/** Which debris a transition INTO this stage throws — you shed the layer you just lost. */
export const STAGE_DEBRIS = ['paper', 'paper', 'plaster', 'lath', 'timber'];
