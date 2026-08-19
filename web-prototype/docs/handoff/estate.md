# Appendix: estate

**Covers:** the mansion/estate room round write-ups pulled from the old Queue — `estate-owner-9`
through `-13`, `critic-estate-5` through `-11`, plus the `light.shaft` closure. This is the bulk
of the project's material/lighting history for the six estate pieces (ballroom, gallery, shaft,
chandelier, study, dark).
**Read when:** your slice touches `src/materials/**` for estate rooms, `room.ballroom` or
sibling pieces, or estate lighting/camera work. ⚠️ **`critic-estate-5`'s verdicts are superseded
by `critic-estate-6` immediately after them in this file — kept only for the overturned-claim
trail, not as current fact.**

---

### 🏛️ `estate-2` (2026-08-09) — **THE STUDY IS PORTED TOO. `?estate=port` NOW BUILDS TWO OF JOHN'S THREE ROOMS, `room.study` IS BYTE-IDENTICAL, AND IT COSTS +8/+9 DRAW CALLS AT THE STUDY STATIONS.**

Repeats `estate-1`'s method rather than re-deriving it. Two new files, one new rig, five edited:
`src/world/study-order.js` (the shared order) · `src/lighting/study-rig.js` (the practicals) ·
`src/game/room.js`, `src/game/spaces.js`, `src/game/estate-spike.js`, `src/views/game.js`,
`src/views/room-study.js`. Measured with `harness/_estate2_probe.mjs` (a copy of
`_estate1_probe.mjs` with `--space`), both arms in ONE browser, parked, 8 yaws, hunter banished.

**1. ✅ ONE SOURCE OF TRUTH, PROVEN BY A PIXEL DIFF — TWICE.**
`views/room-study.js` and the playable `study_w` / `study_e` now build the panelled storey, the
stone frieze, the chimneypiece and its breast, the window bays, the panelling cornice, the
pilasters, the beamed ceiling and the tapestries from `studyOrder()`. **`shoot.mjs --view
room.study` before and after is BYTE-IDENTICAL — `pxdiff` reports 0 / 2,073,600 differing
pixels, max delta 0** — checked once when the showcase was ported and AGAIN after every game-side
edit had landed, because two dead-code removals (an unused import, an unused key table) happened
between the two and "that cannot change a pixel" is an assertion, not a photograph. Same three
properties that made the gallery work: every dimension is a PARAMETER the showcase passes as the
literal it already had, a `FramedBin` proxy (imported from `gallery-order.js` — one proxy, not
two) renames buckets so `wallRun`/`doorCase`/`windowBay`/`pilaster`/`fireplace`/`ceilingSlab`/
`tapestryHang` are untouched, and emission order is preserved PHASE FOR PHASE. The game's extra
phases — a FRONT wall and windows on a return — are empty for the showcase and emit nothing.

**2. 🚨 THE ONE THING THAT DELIBERATELY DOES NOT TRAVEL: "THE WINDOW SITS ABOVE THE PANELLING".**
`room-study.js` spends twenty lines explaining that its lancet-over-panelling scheme is a
FRAMING solve — the art wants the robot at ~79% of frame height AND the whole window in shot, and
the only free variable left was the storey, so the room was lowered to 5.85 and the panelling to
3.60. That is a property of a camera. The game's storey is **4.80**, its doorheads are **2.72**
and its cornice band eats **0.46**, so the frieze between the panelling cap and the cornice is
~0.65 m — a window that fitted in it would be a clerestory, which is the GALLERY's motif.
**So the game's window is a real study window in the panelled storey, sill 1.05 to head 3.28.**
⚠️ That also deletes a whole hazard class: with no opening in the upper band, the two height
bands' cut lists are genuinely disjoint, so `buildWall` cannot emit a floor-to-sill box across a
doorway (`estate-1`'s item 6 warning). It is the safer build as well as the better-looking one.
⚠️ The panelling top is likewise SOLVED, not scaled: 61.5% of 4.80 is 2.95, **below the game's own
2.72 doorheads plus `doorCase`'s 0.56 m entablature.** The ratio gives way because the door height
is a fixed game constant. `wallTop` lands at 3.35.

**3. ✅ NOTHING IS AUTHORED PER ROOM, AND THAT IS WHY BOTH STUDIES ARE CORRECT.**
`spaces.js` calls `study_e` *"the mirror of study_w — the same room"* and it is not: `study_w` has
D1 in its gallery wall and `study_e` has had nothing there since D3 was removed, and their exit
sites differ. **A hand mirror would have put a 3.00 m chimney breast across D1 — silently, because
a breast has no collider and from the gallery the door would simply have looked shut.** So
`room.js` `studyOrderFor` resolves the chimney bay, the window bays, the pilasters, the tapestries
and the sconce anchors from `freeSpans()` over THIS room's own cut list, and one function builds
both. The chimney prefers the room centre and is clamped into the widest free span: `study_w`
lands at x −5.85 (D1 pushes it east), `study_e` at x +7.80 (dead centre).
⚠️ **The service wall gets no panelling and that is correct rather than a gap.** In free dig mode
`DIG_EDGES` makes the whole of it destructible face or panel aperture, so `wallRun`'s `clashes()`
skips every field on it. Walnut panelling drawn over a lath face you are meant to break through
is a lie about what breaks.

**4. ✅ +8 AND +9 DRAW CALLS, AND THE GALLERY DOES NOT MOVE.**
`_estate2_probe.mjs`, `?estate=port,nostudy` against `?estate=port`, max over 8 yaws
(`renderer.info`, deterministic, GPU-exempt):

| station | nostudy | study | ceiling |
|---|---|---|---|
| `study_w.north` | **554** | **562 (+8)** | 625 |
| `study_e.south` | **462** | **471 (+9)** | 625 |
| `chapel.centre` | **583** | **593 (+10)** | 625 |
| `gallery.mid` | **548** | **550 (+2)** | 625 |

- **Three new material keys for a whole room**, and each is argued in `ORDER_KEYS_STUDY`:
  `cstone` (the chimneypiece — it cannot share the frieze stone, because `room-study.js` measured
  the art's chimneypiece 23% BRIGHTER than the walnut while the render had it 27% darker, and the
  frieze is deliberately half that value), `dark` (the firebox, which is the art's reliable black
  — routed to any stone it becomes a legible grey cave — and the ceiling beams), `clere` (the
  glazing; nothing in the shipped game is emissive). Everything else rides in a bucket the room
  already merges: panelling with `wall`, every moulding and beam with `mould`, the whole stone
  frieze / window trim / cartouche ground with `skirt`, console tops with `floor`.
- **`gilt` was refused on purpose.** The only gilt in the showcase's architecture is `doorCase`'s
  bead; the game passes `gilt: false` and takes no loose furniture, so a fourth merged mesh in two
  rooms is not paid for a 28 mm bead nobody sees at play distance.
- **The two-storey split costs ZERO.** `buildWall`'s `band` gained a `key`, so the top of the wall
  is re-emitted into `skirt` (stone) instead of `wall` (walnut). Same area, existing bucket.
  Defaulting to `wall` keeps the gallery byte-identical.
- ⚠️ **`chapel.centre` gains +10 with no study visible from it, and the mechanism is residency
  through TWO rooms** — chapel → gallery (through `p.chapel`) → `study_w` (through D1). Same thing
  `estate-1` recorded. **Both arms are UNDER 625 today.**
- 🚨 **AND THE RECORDED PER-STATION HISTORY DOES NOT REPRODUCE, AGAIN.** `estate-1` records
  `gallery.mid` 570 and `chapel.centre` 645; today the same arm reads **548** and **583**. That is
  the third round in a row to find this. **Re-baseline; never compare against the record.** The
  only trustworthy comparison is two arms in one browser session on one day, which is what the
  table above is.

**5. 🔦 THE LIGHT COUNT IS 1 PER STUDY — 2 IN THE HOUSE — AND IT IS THE HEARTH.**
`_price-pointlight.mjs` prices one point at **+0.112 ms**, and a light is paid by every fragment in
every room (`distance` culls CONTRIBUTION, never cost). The showcase study runs a shadow spot,
four points, a hemisphere, a directional and a rake spot; ported literally that is **10 more
lights** for two of six rooms. **The one that is kept is the one no decal can be**: `critic-estate-5`
filed the chimneypiece's coat-of-arms as *"very shallow and low-contrast ... grey-on-grey"*, and
the diagnosis was that the carving is real geometry lit almost entirely by a HEMISPHERE — which
has no direction, so a 30 mm step and a flat field return the same value. A glow decal is a
hemisphere with extra steps. A point light in front of the firebox at hip height rakes the
bolection, the consoles and the overmantel. Everything else — sconce candles, their wash on the
panelling, the glazing, the cool pool each window lays on the floor — is emissive geometry and
merged glow decals: one draw call, no light budget. Predicted cost **+0.224 ms** for the house.
`?estate=port,sp0` leaves the fixtures and takes only the lights away; `sp4` re-prices upward.

**6. ✅ THE FIXTURES ARE 5 MESHES PER STUDY, AND `fixture-merge.js` NEEDED NO CHANGES.**
`FixtureBin.harvest()` reports **19 objects → 5** in `study_w` and **26 → 5** in `study_e`
(1,662 and 2,952 triangles). ⚠️ **`harvestedLights` is 1 per room and that is EXPECTED here,
unlike the gallery's zero-strays assertion**: `hearthFire()` always builds its own PointLight,
`harvest()` collects it instead of baking it, and it is then simply never parented — the constant
light above replaces it. A number that is not 1 means a fixture is building a light the rig did
not account for, which is exactly what the stat is for.
⚠️ **The floor pool is a `glowPatch`, not `lightPool`** — `lightPool` builds its own
`ShaderMaterial` per call and `isGlow()` cannot bucket it, so two of them would be two programs
and two draws. The tracery arrives through the emissive glazing instead of through the pool.

**7. 🐛 TWO DEFECTS FOUND BY LOOKING AT THE PICTURE, BOTH THE SAME FAMILY AS THE GALLERY'S.**
Both were in the first build of this port and both are fixed.
- **THE FLOOR WAS A BLOWN WHITE SHEET.** Routed to the shared `marbleSlab`, the study floor
  photographed as a featureless white plane across the bottom third — `room-study.js`'s own
  three-round defect, arriving again. ⚠️ **And the showcase's fix does not travel: it uses TWO
  knobs, albedo AND `setEnvResponse(floorMat, 0.30)`, and the second is a `views/_studio.js`
  facility the game does not have at all.** The whole correction has to be in the albedo, so the
  game bakes its own `estateMarbleFloor` at ground **0.255** against the showcase's 0.395 — and
  at roughness 0.26, not 0.055, because the showcase's polish only earns its keep next to
  `mirrorOf()` and a mirror finish with nothing to reflect is just a brighter sheet.
- **THE CHIMNEYPIECE CLIPPED.** Same mechanism one material along: the showcase separates its two
  stones with env response (4.30 against 2.60) as well as albedo, and without it 0.470 made a
  near-white chimneypiece in a horror level. 0.385 puts it back near the art's measured "~23%
  brighter than the walnut beside it". ⚠️ **Stated rather than buried: the frieze/chimneypiece
  ratio in the game is ~0.50 where the showcase's is ~0.30, and it cannot be closed without a
  per-material env response. If a critic files the frieze as too light, the fix is the albedo.**
- 🚨 **AND A THIRD, WHICH IS THE MOST IMPORTANT ONE HERE BECAUSE IT WAS IN THE INSTRUMENT: THE
  ABLATION ARM REVERTED LESS THAN IT CLAIMED.** `binMaterials` keyed the study's surfaces on
  `sp.order === 'study'` — a FLOOR-PLAN fact — instead of on `sp.orderPlan`, the BUILD fact. So
  `?estate=port,nostudy` built the shipped boxes and then painted them walnut and marble, and
  **the "before" capture of this very port came back with a marble floor in it.** Every draw-call
  number in §4 survives (a different material in the same bucket is the same draw call) but the
  before/after PICTURES did not, and neither did the claim that `nostudy` is the 2026-08-08 build
  bit for bit. It is now gated on `orderPlan`, the gallery arm takes the same gate, and the
  before shot has its parquet and boiserie back. **This is HANDOFF's `?cam=r10` finding wearing a
  third hat, and the only thing that caught it was looking at the before shot instead of at the
  delta** — the numbers were right the whole time.

**8. ✅ GATES, ALL GREEN, ON THE SHIPPED DEFAULT (which now includes the study).**
`mechanics.mjs` **11/11** · `escape.mjs` **20/20** on `seed=s4` · `dig-free.mjs` **15/15** (dig band
**67 s**, inside John's 45–75) · `sledge-check.mjs` **13/13** · build green, `lint-glsl` clean
(run after every edit to a file with a template literal).
🚨 **AND A NEW INSTANCE OF THE "UNKNOWN FLAG IS SILENTLY IGNORED" TRAP, WHICH NEARLY BOUGHT A
FALSE GREEN.** `node harness/playtest.mjs --scenario escape --q "seed=s4"` runs and prints
**"9 passed · 0 failed"** — it ignores `--scenario` and runs the BASE playtest, whose nine checks
have nothing to do with the win condition. The scenario flag is **`--script harness/scenarios/
escape.mjs`**. A tail reading "9 passed, 0 failed" looks like a pass; the only tell is the count.
HANDOFF already records `--q` vs `--extra`; this is the same defect one flag along.

**9. 🚩 THE FLAG DECISION: THE STUDY IS INSIDE `port`, WITH `nostudy` AS THE ABLATION.**
`?estate=port` (the default) now builds gallery + both studies; `?estate=port,nostudy` is the
2026-08-08 gallery-only build, bit for bit. It is inside `port` because John's instruction is that
the game should progress from the art, and a room behind a flag nobody types is a room he never
sees — which is the exact failure `dig` spent seven builder rounds inside. **But `study_w` is the
player's SPAWN room and `escape`/`dig-free`/`mechanics` all run through it, so the arm that proves
"the port did this" exists before the port ships, not after something goes wrong.** The resolution
is done once, in `estateMode()`, because `room.js` and `views/game.js` both read it and a
disagreement would build the room to the order with its fixture rig left off.

**10. ⚠️ GPU IS NOT RESOLVED, AND THE TOOL SAYS SO ITSELF.** `perf-spaces.mjs --extra
"quality=medium"`, one lap each arm, this machine (RTX 3060 Ti, ANGLE D3D11):

| | nostudy | study |
|---|---|---|
| study_w | 2.26 | 2.33 |
| study_e | 2.37 | **1.99** |
| gallery | 1.60 | 2.09 |
| service | 2.31 | 2.51 |
| ballroom | 1.80 | **2.79** |
| chapel | 2.85 | 2.98 |

**`study_e` moves −0.38 in a room this slice dresses, and `ballroom` — which this slice does not
touch at all — moves +0.99.** So the single-lap noise floor here is worse than ±0.5 ms and by this
project's own rule **not one row of this table is a measurement.** What can be said: the worst
space is `chapel` at 2.98 ms in both arms against John's ~5.5 ms machine target, and the
deterministic call counts in §4 are the numbers that mean something. Attribution needs
`perf-ab.mjs`; this is a lap, not an interleaved A/B.

**LEFT OPEN, STATED RATHER THAN HIDDEN:**
- **NO LOOSE FURNITURE, AND IT IS A GAMEPLAY CALL, NOT A BUDGET ONE.** The showcase's desks,
  chairs, consoles and fender are still built in `views/room-study.js`'s own furniture bin and are
  NOT ported. A desk with no collider is something a robot and a 2.4 m hunter walk through, which
  reads worse than an empty room; giving them colliders changes pathing and is outside this
  slice. `studyOrder`'s `parts` already has the hook.
- **THE SERVICE WALL IS BARE PANELLING-WISE** (see §3). If it reads as unfinished, the answer is
  dressing that belongs on a back-of-house wall, not panelling.
- **THE PRACTICAL RIG WAS NOT COMPOSED AGAINST THE PER-SPACE LIGHTS.** `spaces.js`'s
  `study_w.lights` / `study_e.lights` still aim at the old empty box; re-pointing the existing five
  at the chimneypiece and the windows is free (zero calls, zero ms, zero recompiles) and is the
  highest-value next hour on this piece — the same item `estate-1` left open for the gallery.
- **THE BALLROOM IS STILL NOT PORTABLE** and nothing here changes it: game storey 7.20 against a
  two-storey 9.6 m showcase with a musicians' gallery. John has to decide what to cut first.
- **UNSCORED.** `room.study` (65) is unchanged by definition; the PLAYABLE studies have never been
  critiqued and should be, at a real player camera, together with the gallery.
**Before/after pairs at the real player camera, one session each:**
`progress/estate2-study_w-north-{nostudy,study}.png` · `estate2-study_e-south-{nostudy,study}.png`
· `estate2-chapel-centre-*` · `estate2-gallery-mid-*`. Showcase pair (identical):
`progress/estate2-showcase-before.png` vs `-after.png`.

---

### 🏗️ `estate-1` (2026-08-08) — **THE PORT IS BUILT. `?estate=port`, DEFAULT OFF. +11 DRAW CALLS AT `gallery.mid`, 200 FIXTURE OBJECTS MERGED INTO 5, AND `room.gallery` IS BYTE-IDENTICAL.**

Executes `estate-spike-1`'s finding rather than re-deriving it. Three new files, one flag, four
edited: `src/world/gallery-order.js` (the shared order), `src/lighting/fixture-merge.js` (the
bucket machinery), `src/lighting/gallery-rig.js` (the gallery's practicals) ·
`src/game/room.js`, `src/game/spaces.js`, `src/views/game.js`, `src/views/room-gallery.js`.

**1. ✅ ONE SOURCE OF TRUTH, AND IT IS PROVEN BY A PIXEL DIFF RATHER THAN ASSERTED.**
`views/room-gallery.js` (score 75) and the playable `gallery` space now both build the
clerestory order, string course, pilaster rhythm, transverse arch, coffered ceiling, portraits
and dressing from `galleryOrder()`. **`shoot.mjs --view room.gallery` before the change and
after it are BYTE-IDENTICAL — `pxdiff` reports 0 / 2,073,600 differing pixels, max delta 0.**
Timestamps rule out a stale capture: before 16:08:26, the edit 16:11:04, after 16:12:14.
Three things make that possible and they are the design:
- every dimension is a PARAMETER in the caller's own coordinates, and the showcase passes the
  literals it already had (`sill 4.00 / spring 4.72 / head 5.53`, `fieldTop 3.95`, `archZ −8.6`,
  `portraitScale 1`). The GAME takes the derived form instead, because its clerestory has to be
  solved against a cornice the showcase does not have.
- a `FramedBin` PROXY applies the caller's frame and renames buckets, so `windowBay`, `pilaster`,
  `cofferedCeiling`, `portraitWall`, `urnOnPedestal` and `consoleTable` were not touched. Four of
  those six are shared with `room.ballroom`, `light.shaft` and `room.study`.
- **emission ORDER is preserved term for term**, including splitting the showcase into two calls
  so its far-end arch and stair still land between them. `GeoBin` merges a bucket in insertion
  order, so this keeps the merged buffer layout as well as the picture.

**2. ✅ +12 DRAW CALLS, NOT +184 — AND THE TWO REASONS ARE SEPARABLE.**
Measured with `harness/_estate1_probe.mjs`: both arms in ONE browser, parked at `gallery.mid`,
**8 yaws**, hunter banished, `renderer.info` (deterministic, GPU-exempt).

| at `gallery.mid` | shipped default | `?estate=port` |
|---|---|---|
| max draw calls over 8 yaws | **559** | **570 (+11)** — ceiling 625 |
| max triangles | 219k | 337k (+118k) — ceiling 900k |
| point / spot / hemi lights | 10 / 1 / 1 | **12 / 1 / 1** |
| meshes under `space.gallery` | 44 | 54 |
| shader programs at ready | 261 | 273 |

- **The architecture is +3 buckets, not +8.** The kit's key names are mapped onto buckets the
  room already draws (`ORDER_KEYS` in `room.js`): reveals and sills ride in with the skirting,
  coffer pans with the ceiling, the console top with the floor. Only `gilt`, `wood` and `clere`
  are genuinely new, and each has a written reason — the first two because `room-gallery.js`
  measured a gilt cornice at 5.5:1 red-to-blue and gilt must stay on frames and bosses, the
  third because nothing in the shipped game is emissive at all. Plus 2 portrait meshes (one a
  side, twelve sitters in an eight-cell atlas) and the 5 fixture meshes below = **10 in the
  space**; the last one is the shadow pass re-drawing a new casting bucket.
- ⚠️ **AND THE FIRST VERSION OF THIS TABLE WAS MEASURED AGAINST AN OFF ARM I HAD MYSELF MOVED.**
  The `NO_CAST` set that keeps emissive glazing out of the shadow map was applied UNGATED, so
  with `?estate=port` absent every ceiling bucket in the house silently stopped casting — worth
  **−5 draw calls and 81% of the frame's pixels differing by a little** in five rooms that have
  nothing to do with this slice. Caught by re-shooting the OFF arm at the end and diffing it
  against the OFF arm shot at the start, which is the only reason it is a footnote instead of a
  regression. **"Default off changes nothing" is a claim that has to be photographed too.**
- **The practicals are 5 meshes.** `FixtureBin.harvest()` reports **200 objects in, 5 out** —
  brass · wax · emissive · flame · glow — with **0 stray lights** and 21,932 triangles. The
  spike's +184 was ~138 unmerged meshes; the biggest single line was the glow decals, because
  `volumetric.js` `glowPatch()` builds a NEW `ShaderMaterial` per call, so forty-five identical
  four-line shaders were forty-five draws. Colour, strength and falloff are now VERTEX
  ATTRIBUTES and one program draws the lot.
- ⚠️ **HONESTLY LOST: PER-FIXTURE FLICKER.** Merged, there is no per-flame mesh to scale, so
  `practicals.js`'s per-candle closures are DRAINED (`driveFlicker` with a stub engine) and
  replaced with one global curve on the shared materials. Every candle now breathes together.
  The fix if a critic files it is a per-vertex phase attribute and a sine in the vertex shader —
  one more attribute, no more draw calls.

**3. 🔦 THE LIGHT COUNT IS 2, IT IS CONSTANT, AND IT IS ON THE SCENE ROOT.**
The showcase runs 17 point + 13 spot + 3 directional. `_price-pointlight.mjs` prices one point
at **+0.112 ms**, so that rig alone is ~1.9 ms against a **1.389 ms** budget — 137%, for one
room, charged to all six, because `distance` culls a point light's CONTRIBUTION and never its
cost. **2 buys the two things a decal cannot: a falloff on the brass so a sconce reads as an
object, and a warm/cool split down the 27 m run.** Everything else the showcase buys with lights
this rig buys with emissive glazing and merged glow decals, which cost one draw call and no
light budget — the showcase's own argument, in its own file.
**The rig is SPLIT, which is the spike's item 5 taken at its word:** fixture MESHES under
`space.gallery` (residency culls them — the spike measured 537 calls against 818 scene-parented,
281 saved), LIGHTS on the scene root at a count that never moves. `?estate=port,lp0` / `lp6`
re-prices the choice; `?estate=port,norig` is the architecture-only ablation.

**4. 🚨 THE BEFORE BASELINE, BECAUSE THE SHIPPED GAME ALREADY FAILS AND THAT IS NOT THIS ROUND'S.**
`perf-spaces.mjs --extra "quality=medium"`, this machine (RTX 3060 Ti, ANGLE D3D11), **nothing
added**: study_w 2.75 · gallery **2.10** · study_e 2.92 · service 3.03 · ballroom 2.74 · chapel
**3.52** ms GPU, every CPU 3.26–4.76 against 2.00, chapel **634 calls against 625**. Two of six
over GPU by 2×, all six over CPU, chapel over the call ceiling, before this slice existed.
⚠️ **The spike's recorded `gallery.mid` 530 calls / gpu 2.78 DOES NOT REPRODUCE — I read
220 / 2.10.** That is the spike's own warning about the fixed instrument chain arriving:
recorded per-station history is not per-station. Re-baseline; do not compare against the record.

With `?estate=port`: study_w 2.89 · gallery **2.81** · study_e 2.77 · service 2.96 · ballroom
2.88 · chapel **3.75**.
⚠️ **READ THE NOISE FLOOR BEFORE THE DELTAS.** `study_e` moves **−0.15** and `service` **−0.07**
— rooms this change touches only through two constant lights, i.e. deltas that should be
uniformly *positive*. So single-lap `perf-spaces` resolves nothing below ~±0.15 ms here, and by
this project's own rule most of this table is NOT RESOLVED. **The one delta above the floor is
`gallery` +0.71 ms**, which is consistent with +117k triangles in frame, +10 meshes and 2 point
lights at 0.112. Attribution needs `perf-ab.mjs`; this is a lap, not an interleaved A/B.
⚠️ **AND `perf-spaces` PICKS ITS ROW BY GPU AND PRINTS THAT YAW'S CALLS, so its call column is
not comparable between runs** — ballroom reads 543 then 329 across the two laps for reasons
unrelated to this change. The +11 above is the number that means something.
⚠️ **The perf-after lap was taken with the ungated `NO_CAST` still in the tree** (see item 2's
footnote), so its five non-gallery rows are ~5 calls light and their ceilings are not casting.
That makes the GPU column of the after-lap a slight UNDER-estimate for those rooms; the gallery
row, where `ord` is truthy either way, is unaffected. **Re-lap before quoting the non-gallery
rows.**
🚨 **Chapel goes 634 → 645 calls.** It was already 9 over; it is now 20 over. The cause is
residency working correctly — the gallery is visible through D7, so its ten new meshes draw from
the chapel. **`gallery.mid` itself stays at 570 against 625, which is the brief's gate.**

**5. 🐛 TWO DEFECTS FOUND BY LOOKING AT THE PICTURE, BOTH THE SAME FAMILY.**
Both were in the first build of this port and both are fixed; the pair is filed because they are
HANDOFF's dominant defect class arriving twice in one afternoon.
- **THE GLAZING WAS BURIED IN THE WALL.** `windowBay` puts its glass at `−t * 0.55` and defaults
  `t` to `WALL_T` (0.30). The gallery/study boundary is a **0.15 SKIN** — each space draws its own
  half of a shared band — so the pane landed past the far face, behind the neighbour's skin.
  Arched openings with a dead black pane in them, on the one material whose job is to be the
  brightest thing in the room. Fixed by passing `wallT: 0.14`.
- **THE PORTRAITS STOOD THROUGH THE CLERESTORY SILL.** The showcase's largest frame tops out at
  3.65 under a string course at 3.95. Dropped literally into a 5.60 m storey whose string course
  lands at 3.28, the same frame is 0.37 m through it. `portraitScale = fieldTop / 3.95` — which
  is exactly 1.0 for the showcase, hence the byte-identical diff.

**6. HOW THE WALLS ARE ACTUALLY REPLACED, since the spike's arm was additive.**
`buildWall` gained `capY` and `band`. The panelled storey is CAPPED at the string course and the
clerestory storey above it is re-emitted by the same builder with the window openings cut out.
Two invariants are written into the code rather than hoped for:
- ⚠️ **`capY` CLIPS GEOMETRY ONLY; COLLIDERS STAY FULL HEIGHT.** The camera boom raycasts the
  world to stay out of walls, and a collider stopping at 3.3 m would let it sail over the room —
  in live play only, which is this project's most expensive failure class.
- ⚠️ **THE BAND'S OPENINGS ARE A SECOND, DISJOINT WALK — NOT MERGED INTO THE CUT LIST.** Sharing
  one sorted walk with the doorways would put a 1.62 m clerestory across a 1.90 m doorway in `u`
  (four of the seven do), and `buildWall` would then emit a solid "sill" box from the floor to
  the window — **SEALING THE DOORWAY**. It throws nothing and from outside the door is simply a
  wall. Two walks over two disjoint height bands cannot produce it.
- The game's own 3.2 m `mould` pilasters and `NO_CAST` are both gated on the order, so **with the
  flag off not one byte of the other five rooms moves.**

**7. ✅ GATES, ALL GREEN ON THE SHIPPED DEFAULT.** `mechanics.mjs` **11/11** (run twice) ·
`escape.mjs` **20/20** on `seed=s4` · `dig-free.mjs` **15/15** · `sledge-check.mjs` **13/13**.
Build green, `lint-glsl` clean.
⚠️ **AND AN INSTRUMENT NOTE THAT NEARLY COST A FALSE GREEN: `playtest.mjs` TAKES `--q`, NOT
`--extra`, AND AN UNKNOWN FLAG IS SILENTLY IGNORED.** Run with `--extra "seed=s4"` the escape
suite reported **19/1 skip** and `dig-free` **5/1 skip** — both because the query never reached
the page, so the seed was the default and `?dig` was off. **A skip reads as "nearly a pass" in a
tail, and both scenarios print their own hint (`try seed=s4`, `re-run with --q "dig=1"`) which is
the only thing that caught it.** With `--q` they are 20/20 and 15/15. `perf-spaces.mjs` and
`mechanics.mjs` use `--extra`; `playtest.mjs` uses `--q`; `mechanics.mjs` has no query passthrough
at all, so the `port` arm cannot be gated through it.
**Before/after pair at the real player camera, same anchor and yaw, one session:**
`progress/estate1-gallery-mid-off.png` vs `-port.png`. Showcase pair:
`progress/estate1-showcase-before.png` vs `-after.png` (identical).

**8. 🚨 A BUILD OUTAGE MID-ROUND, AND `lint-glsl.mjs` PASSED ON THE FILE THAT CAUSED IT.**
`src/materials/breakmask.js` acquired `` `_bcontact` `` as prose punctuation inside a template
literal — the sixth instance this week — and took the dev server down with it, which cost this
round one full gate lap and one perf lap. **It was NOT caught by the gate that exists for it,
because that shader is assembled in a PLAIN template literal inside `onBeforeCompile` and
`lint-glsl.mjs` only scans literals tagged `/* glsl */`.** Not fixed here (HANDOFF's rule: do not
touch a broken file you do not own); the owner fixed it within ~15 minutes. **The linter should
scan every template literal that contains `gl_FragColor`, `#include <`, or `void main`, not only
the tagged ones** — that is a one-line widening of its matcher and it would have caught this one.

**LEFT OPEN, STATED RATHER THAN HIDDEN:**
- **The room is now BRIGHT, and a critic should rule on it.** The gallery's `wall` bucket takes
  the showcase's faded damask (ground 0.412/0.386/0.374) in place of the game's boiserie
  (0.300/0.258/0.212), and the skirting takes the estate stone. That is what John asked for
  ("progress from the assets we made for the 3 rooms") and it is also a survival-horror room
  that no longer reads dark. **It is one line in `binMaterials`** if the ruling goes the other
  way.
- **The per-space light rig was NOT retuned.** `spaces.js`'s `gallery.lights` still aims at the
  old empty box; re-pointing the existing five at the new architecture is free (zero calls, zero
  ms, zero recompiles) and is the highest-value next hour on this piece.
- **The transverse arch lands at local −2.12**, which is about a metre from `gallery.mid`. The
  ratio was carried from the showcase; a composition pass should choose it deliberately.
- **`room.study` and `room.ballroom` are untouched.** The study's order is the obvious next one
  and it is a different order. ⚠️ **The BALLROOM is still NOT portable** and nothing here changes
  that — game storey 7.20 against a two-storey 9.6 m showcase.
- **Default is OFF.** Proposed, not taken: flip `?estate=port` on once a critic has scored the
  frame and the brightness question is ruled. The chapel's 634 → 645 should be answered first,
  and the cheapest answer is `PORTAL_VIS_DIST` on D7 rather than anything in this slice.

---

### 🎯 `estate-spike-1` (2026-08-08) — **CAN THE ART BAR SURVIVE BEING IN A PLAYABLE GAME? MEASURED. ARCHITECTURE YES, PRACTICALS NO.**

**John's complaint is verified in code, and more completely than he put it.** `views/game.js`
imports none of `room-gallery.js` / `room-ballroom.js` / `room-study.js` — and beyond that,
`src/game/room.js` uses **exactly one symbol from the entire estate kit: `kit.GeoBin`.** Not
`wallRun`, not `windowBay`, not `pilaster`, not `cofferedCeiling`, not one function from
`world/props.js`, not one from `lighting/practicals.js` or `lighting/volumetric.js`. Every room
in the playable house is `bin.box()` calls with five materials. The estate kit is unused by the
game. (`exterior.js` reaches for `glowPatch`/`dustMotes` and that is the only exception.)

**Room chosen: the GALLERY, and the reason is dimensional.** Game `gallery` is 27.20 × 6.70 ×
5.60; showcase `room.gallery` is 27.0 × 7.20 × 6.40 — the same room to within 0.5 m of width and
0.8 m of height, with the 27 m long axis identical (the axes are swapped, which is one `rotY`).
The BALLROOM is not close: game 27.2 × 15.3 × **7.20** against a showcase **two-storey 9.6 m**
with a musicians' gallery. The showcase ballroom's whole upper window order — the thing that
carries its PASS 85 — has nowhere to go in the game's room. Porting it is a floor-plan change,
not a port.

🆕 **`?estate=` — a reversible spike, DEFAULT OFF, `src/game/estate-spike.js` + 3 lines in
`views/game.js`.** Arms: `geo` (architecture, game materials) · `mat` (+ the showcase's own
surfaces) · `lights` / `nosun` (the practical rig, with/without its second shadow caster) ·
`pN` / `sN` (N bare point/spot lights, the cost curve) · `resident` (parent under the gallery's
space root so residency governs it) · `all`. Every arm reports through `engine.__estateSpike` so
a probe asserts the build, not the query string.

**Measured — `harness/_spike1_ab.mjs`, interleaved configs at PARKED stations, `quality=medium`,
3 timed rounds after a discarded one, spreads 0.04–0.38 ms. ⚠️ The machine was NOT quiet
(`sledge-3` was building throughout); draw calls are deterministic and exempt, GPU ms is not.**

| | gallery.mid | chapel.centre |
|---|---|---|
| **shipped default** | **530 calls · 257k tris · gpu 2.78 · cpu 3.97** | **634 calls · 234k tris · gpu 3.40 · cpu 4.62** |
| `+geo` (14 clerestory bays, 20 fluted pilasters, transverse arch, coffered ceiling, string course, 12 framed portraits, 4 urns, console) | **+14 calls · +81k tris · gpu NOT RESOLVED** | +15 calls · gpu +0.09 NOT RESOLVED |
| `+mat` (showcase surfaces on it) | +0 calls · +3 programs · +31 textures · **83–94 ms bake** · gpu NOT RESOLVED | same |
| `+p17` (17 bare point lights) | +0 calls · gpu NOT RESOLVED | +0 calls · gpu NOT RESOLVED |
| `+s12` (12 bare spot lights) | +0 calls · gpu NOT RESOLVED | +0 calls · gpu NOT RESOLVED |
| **`+nosun` (the full practical rig)** | **+184 calls · gpu +1.43 RESOLVED** | **+232 calls · gpu +1.30 RESOLVED** |
| `+all` | +245 calls · gpu +2.29 | +286 calls · gpu +2.05 |

**1. ✅ THE ARCHITECTURE IS ESSENTIALLY FREE, AND THE REASON IS `GeoBin`.** The entire showcase
gallery order costs **+14 draw calls** because draw calls are a function of the number of
MATERIAL KEYS, not of how much geometry is in them — the same merge the game already uses. The
showcase's 8 keys partly duplicate the game's 5, so the true refactor cost is lower still.
**+81k triangles against a 900k ceiling is noise.** The material set costs 83–94 ms of bake and
31 textures — not the recorded 18–24 s, because `estateMaterials()` is a table of LAZY GETTERS
and the game only bakes the keys it touches.

**2. 🚨 THE PRACTICALS ARE THE WHOLE COST, AND THEY BREAK THE DRAW-CALL BUDGET ON ONE ROOM.**
The rig is ~138 separate objects (12 picture lights × 3 meshes, 10 sconces, a candelabra, 21
clerestory glow decals, 12 picture glows, 3 haze patches, dust motes) and every one is its own
mesh. **+184 calls at gallery.mid takes the game 530 → 714, and +232 at chapel.centre takes it
634 → 866, against a 625 ceiling.** One room. ⚠️ **The fix is obvious and is the recommendation:
merge the fixtures the way the architecture already is.** Brass into one bucket, wax into one,
flames into one, glow decals into one additive mesh — ~138 objects become ~5. The showcase never
needed this because it draws one room with an orbit camera.

**3. ⚠️ "NOT RESOLVED" ON THE LIGHTS IS A FACT ABOUT MY INSTRUMENT AND I ALMOST FILED IT AS
ZERO.** `+p17` and `+s12` sit inside my noise floor at both stations, twice, including with
`renderScale` pinned to 1.0 (`--fixedres`; `rs 1` in every row, so dynamic resolution was NOT
absorbing it). **The project's own purpose-built ABBA instrument disagrees and it is the better
tool: `harness/scenarios/_price-pointlight.mjs`, run today at `quality=medium`, prices ONE point
light at `+0.112 ms GPU · sd 0.076 · SE 0.031 · n=6 blocks` — PASS.** That file exists precisely
because two naive A/Bs of this quantity returned self-refuting negative costs. **At 0.112 ms,
the gallery's 17 points alone are ~1.9 ms — 137% of the entire 1.389 ms budget — which is
consistent with the +1.43 ms the whole rig measures.** Do not quote my NOT RESOLVED as evidence
the lights are cheap; quote the ABBA number.

**4. 🚨 THE COST NOBODY HAD PRICED IS AT LOAD, AND IT IS PER LIGHT-COUNT COMBINATION.** On a
warm Chromium shader cache, `ready` times: `geo` **1.9 s**, `mat` **7.9 s** — and `p17`
**40.6 s**, `s12` **37.2 s**, the full rig **78.1 s**. `numPointLights` is in three's program
cache key, so each new count rebuilds every program. The game already warms **four** counts
because the gadgets move it (`views/game.js`); three dressed rooms would multiply that set.

**5. RESIDENCY WORKS FOR THE MESHES AND IS A TRAP FOR THE LIGHTS.** Parented under the gallery's
space root, at the one station where the gallery is hidden (`ballroom.centre`, parent chain
`space.gallery:false`) the rig costs **537 calls against 818 scene-parented — 281 calls saved.**
⚠️ **But three's `projectObject` skips a hidden subtree entirely, so the 29 lights are culled
with it, `numPointLights` changes on every room transition, and that is the mechanism behind
John's five-second freeze.** The escape is to split them: **fixture MESHES under the space root
(residency culls them), LIGHTS on the scene root at a constant count.** You then pay the
per-fragment cost everywhere and never pay a recompile.

**6. ⚠️ AND THE SHIPPED GAME IS ALREADY OVER BUDGET AT A PARKED STATION, BEFORE ANY OF THIS.**
gallery.mid **gpu 2.78 / cpu 3.97**, chapel.centre **gpu 3.40 / cpu 4.62 / 634 calls** against
**1.389 / 2.00 / 625**. Two of three stations fail GPU by 2–2.4×, all three fail CPU, and
chapel.centre is over the call ceiling with nothing added.

### 🚨 THREE INSTRUMENT DEFECTS FOUND, ALL IN THE SAME CHAIN, ALL FIXED
Every parked GPU number this project holds was taken through them.
1. **`engine.director` was never assigned anywhere in `src/`.** `perf-spaces.mjs`'s park()
   guards on it to install a no-op Director, so **the guard was silently false on every run that
   tool has ever made** and the Director walked the player out of the station inside every timed
   window. Assigned in `views/game.js`.
2. **…and fixing that immediately NaN'd the camera**, because the stub returns
   `look: { x, y }` while `game.js` reads `cmd.look.dx` — `cam.yaw -= undefined`. Every position
   in the sim follows, residency freezes on whatever set it last held, and **every station
   reports the same scene**. Now `look: null` + an explicit `aimYaw`.
3. **The boom EASES to a teleported player** (`k = _first ? 1 : 1 - exp(-11 dt)`), and
   `setViewpoints` takes the camera as a viewpoint — so a boom in transit keeps the room it came
   from resident. Measured at **22.9 m of camera travel inside a 2 s window**, with
   `ballroom.centre` reporting the camera in the gallery. Fixed by setting `cam._first = true`.
- ⚠️ **Also: in capture mode frames only run inside a `resetPerf()` window** (`_freeRun`), so
  `perf-spaces.mjs`'s warm-up lap (`park` + 260 ms, no `resetPerf`) has never warmed anything.
- ⚠️ **A hunter parked 6 m from a stationary player is not a station**: it kills the player, the
  round resets, and the player teleports. `--nohunter` for anything residency-shaped.
- **Consequence: the recorded worst-space 1.22–1.38 ms and 576–596 calls are not per-station
  figures.** Re-measure before quoting them.

**Gates green with the spike in the tree, default off:** `mechanics.mjs` **11/11**,
`escape.mjs` **20/20** on `seed=s4` (1 navigation). Before/after pair at the same camera:
`progress/spike1-gallery-mid-off.png` (348 calls) vs `-all.png` (630).
⚠️ **The `geo` arm is ADDITIVE — it does not delete the game's own wall boxes — so its +14 is an
UPPER bound, and the pictures show the expected clash (clerestory heads through the cornice,
frames proud of the wall). It prices the refactor; it is not the refactor.**

### ✅ `estate-owner-10` (r10) — THE 2.24 ms IS ATTRIBUTED, AND IT IS THE LIGHT COUNT, NOT THE MIRROR

`room.ballroom` **r8** and `room.gallery` **r7**, both **BUILDING / unscored** — both need
`critic-estate-8`. Hate lists left intact.

**1. 🆕 `harness/perf-ab.mjs` — the general form of the thing `perf-ao` did by hand.** Times
two or more configurations of ONE view, interleaved (A B C, A B C), in a single browser, after
a **whole discarded round** — because a fresh Chromium's ~33–36 s cold compile outlives any
settle and otherwise lands on whichever config is first, which is the bias `perf-spaces.mjs`
shipped for its whole life. It prints the within-config spread beside every delta and says
**NOT RESOLVED** when the difference is smaller, so a number the instrument cannot see cannot
be attributed. `--probe <js>` is evaluated in the page and recorded per sample, so a run can
ASSERT the config took effect rather than trust the query string it passed.

**2. ⚠️ THE ABLATION TOGGLE FIRST, AND IT SETTLED THE TENSION IN ONE RUN.** `?mirror=planar|
cube|off` on `room.ballroom`, permanent. Three interleaved rounds, `quality=medium`:
**planar 2.32 · cube 2.31 · off 2.30 ms**, within-config spread 0.02–0.07. **Deleting the
plates entirely is not resolvable**, so `estate-owner-9`'s "per-frame cost is zero both before
and after" is **CONFIRMED**, and `critic-estate-7`'s 2.24–2.28 ms is **also confirmed** (I read
2.30–2.38 on a warmer machine). Both were right about different things; nothing was wrong.

**⚠️ THE OVERRUN IS THE LIGHT COUNT AND NOTHING ELSE IS CLOSE.** Same session, same tool:

| ablation | Δ gpu |
|---|---|
| all **19 PointLights** removed (census: 19 point + 1 spot + 3 directional) | **−1.10 ms — 47% of the frame** |
| all 23 lights removed | −1.38 |
| `scene.environment = null` | −0.21 |
| the shadow-casting spot | −0.16 |
| AO pass off | −0.15 |
| bloom off | −0.13 |
| FXAA off · ALL volumetrics hidden | −0.02 each — **not resolvable** |
| `renderScale 0.5` | −1.55 — **fragment-bound, not geometry** |

~**0.058 ms per point light**, paid by every fragment: three unrolls `NUM_POINT_LIGHTS` into
the fragment shader, so a sconce's 6.5 m `distance` culls its CONTRIBUTION and not its COST.
Three chandeliers are two PointLights each, nine sconces and two candelabra one each, plus two
bounce cards = 19 exactly.

⚠️ **IT IS THE SHOWCASE RIG, NOT THIS VIEW, AND `room.gallery` IS WORSE AND WAS NEVER FLAGGED:
3.32 ms with 17 point + 13 SPOT + 3 directional, and killing all 33 takes it to 0.90 ms
(−2.42, i.e. 73% of its frame).** ⚠️ **AND THE SHIPPING GAME DOES NOT SHARE IT** — `views/game.js`
runs a **FIXED FIVE-LIGHT RIG** for the whole mansion (one spot, three points, one hemisphere)
because `numPointLights` is in three's program cache key, which is why `perf-spaces.mjs` reads
the worst mansion space at 1.22–1.38 ms against the same budget. **Bringing the ballroom under
1.39 ms means deleting ~16 of its 19 practicals** — a look change in the room whose whole job
is the look. **Priced in the code and NOT done unilaterally;** a critic or the lead should rule.

**3. ⚠️ THE PLATE-PARITY HATE WAS NEVER AN AIM PROBLEM — IT WAS THE NEAR PLANE, AND THE OLD
COMMENT ARGUED ITSELF INTO THE BUG.** It read: "the plate spans only ~0.3 m of depth from this
camera, so a flat near plane just short of the nearest corner clips the wall (0.49 m nearer)
and keeps the whole plate." Both halves are true and **the conclusion does not follow, because
a near plane is perpendicular to the view axis and the wall is not** — the two planes intersect
in a LINE and the wall renders on one side of it. **More than half the left plate was the back
of its own end wall**: a flat grey field with a dead-straight diagonal edge, which reads exactly
like "soft mirror" and is nothing of the kind. The right plate escaped only because its axis is
nearly normal to that wall (view-axis z 0.964 against 0.868). Fixed with the **oblique near
plane (Lengyel)** the old comment named and declined to build. **Break-tested: `?planarclip=flat`
puts the defect straight back, and is kept permanently.** Left plate now carries a stained-glass
lancet over receding sheeted furniture; the right plate's chequer + sheeted chair is untouched.
Grade gate **PASS 0.071 / median 50.7 / toe 4.8**; 219 calls / 448k tris unchanged (build-time
only).

⚠️ **A WRONG TURN, RECORDED IN THE FILE RATHER THAN QUIETLY UNDONE.** Before the near plane was
found, the plate's AIM was measured — `harness/_tmp_eo10_aim.mjs` reflects the eye ray about the
plate plane over a 15×15 grid and classifies where each ray lands, with the right plate as the
control: **right FLOOR 60% / endZ 40%, floor z-span 10.4 m · left FLOOR 29% / wall 54% / GLASS
17%, span 5.3 m.** Those numbers are correct and **the inference from them was wrong** — "54%
wall" was read as "54% blank" because the grey field was assumed to be that wall at 13×
magnification. An 8° plate yaw was built (census moves to FLOOR 55 / wall 20 / GLASS 11), then
compared against yaw 0 with the near plane already fixed and **rejected**: yaw 0 is the better
picture. **A sound measurement with an unsound interpretation is the failure mode here, not a
bad number.**

**4. `room.gallery` — the anchor motif and BOTH halves of the far-portrait complaint.**
- **Anchor split closed as `critic-estate-7` recommended:** a **cusped quatrefoil** (`uMotif`,
  new in `GLASS_SURFACE`; default 0 so every other window is bit-identical). It is the boundary
  of the UNION of four circles struck on the axes — no concentric structure, no dark central
  boss — so it cannot be read as the ring artifact deleted from the fourteen clerestories.
- ⚠️ **AND IT WAS INVISIBLE UNTIL THE GOLD WAS SOLVED THROUGH THE TONE CURVE — this file's own
  round-8 finding, sitting unfixed on this window.** `uGold` draws the border AND the ornament
  and was **0.530–0.640**; at emissive 8.4 that is 4.45–5.38 linear and ACES puts it within ~3
  output levels of an already-clipped white ground. **The drawing rendered and could not be
  seen.** Re-solved to **0.0455 / 0.0494 / 0.0550** (linework ~202 on a ~252 ground), keeping the
  cool ratio exactly so the anchor stays the neutral element the grade gate needs.
- ⚠️ **"Faces read as portraits only within about 2 m" IS TWO DIFFERENT PROBLEMS FILED AS ONE,
  and the near-field half was understated: the LARGEST portrait in frame had no readable eyes,
  nose or mouth either.** (a) **RESOLUTION** — the portrait ATLAS was 1024 at 4×2, so each of
  eight sitters owned **256 × 512 texels and a head was 33–52 texels across**; now 2048.
  (b) **CONTRAST** — every feature was `1.0 - smoothstep(0.0, R, d)`, **a cone whose peak exists
  at exactly one point**, so its mean over a 3-texel footprint is about a third of nominal.
  Inner edges are now non-zero, i.e. a **flat core** over roughly half each mark's radius.
  The near sitter now reads as a face; **the far sitter gains a dark eye band and a nose shadow
  and stays marginal at ~30 px of head — a screen limit at this camera, stated not claimed.**
- Honest cost, measured both ways: bake **222.1 → 270.3 MB VRAM (+48)** and **18.1 → 23.9 s**.
  GPU read 3.25 (1024) vs 3.53 (2048) — **separate browser sessions, which is exactly the
  cross-session comparison this project rules invalid, so NOT attributed.** Gates unmoved
  (topChroma 0.135, median 42.9, toe 5.3, all PASS). **Mood-vs-Hitman is untouched and open.**


### ✅ `estate-owner-9` (r9) — BOTH BALLROOM DEFECTS CLOSED, AND THREE FALSE FACTS CORRECTED

`room.ballroom` **r7 BUILDING/unscored** · `room.gallery` **r6 BUILDING/unscored** (a builder may
not score its own work). Both critics' hate lists were left intact for the next critic.

**1. THE BULLSEYE WAS NOT THE `worldUV` TRAP, AND THE BRIEF'S FIRST SUSPECT WAS WRONG.**
Measured, not read: the live ballroom glass mesh (`kit:glass`, 2295 verts = five windows merged)
carries **uv exactly 0..1 in both axes and `map.repeat` exactly 1,1**. `windowBay` authors
per-vertex uv over one lancet-shaped sheet and passes `uv = null` to `GeoBin.add`, which means
KEEP AUTHORED UVS — so `worldUV` never runs on glass at all. There is one texture repeat per
window and always was. The real cause: the church **roundel is authored into the shared
`GLASS_SURFACE`**, and every mix that draws it was written `0.9x + 0.1x*uInk`, so at the daylight
glazing's `uInk` of 0.55 the ornament still landed at **0.964** — essentially full strength, with
**no existing number able to switch it off** (`uInk = 0` still drew it at 0.92 *and* collapsed the
cames the gallery was hard-rejected for lacking). Fixed with a new **`uMedal` GEOMETRY gate**:
at 0 the rings, cusps, fleurs, boss and gem are not drawn, and the came grid then runs **unbroken**
instead of leaving a bare disc — a *negative* bullseye, the same artifact sign-flipped, which was
gated too. At 1.0 every term multiplies by exactly 1.0, so `light.shaft`/`room.study` are
bit-identical. **Validated by breaking it:** the identical 4× crop of window 2 from
`critic-estate-6`'s own scored frame shows the ring and its dark central dot; the new frame shows
none, with glazing bars and quarry grid untouched.

🆕 **AND THE SAME DEFECT WAS SITTING UNREPORTED IN `room.gallery`** — all **fourteen clerestory
lights** carried the identical roundel at the identical place, confirmed on a 5× crop before and
after. `medallion: 0` on the clerestory only. The **far-end anchor keeps its ornament on purpose**
(one window, the room's focal point, and `critic-estate-2` rejected it once for reading as an
unfinished placeholder pane) — **a critic should rule on whether that split is right.**

**2. ⚠️ A CUBE ENVMAP ON A NEAR-SPECULAR FLAT MIRROR CANNOT BE SHARPENED BY A BIGGER CUBE, AND
THE PREVIOUS ROUND'S 384 → 640 WAS A NO-OP.** This is the check `estate-owner-8` was killed in
the middle of ("check three's actual PMREM roughness→mip mapping rather than trust memory"), and
memory would have got it wrong. Read out of three r180 and then confirmed in the browser:

- `PMREMGenerator._setSize` does `_lodMax = floor(log2(cubeSize))`, `_cubeSize = 2^_lodMax`. Every
  cube assigned to `material.envMap` is PMREM'd, so **640 is floored to 512 and 384 was floored to
  256. The number written in the view has never been the number the shader gets.**
- `cube_uv_reflection_fragment` sets `faceSize = exp2( mipInt )` — **the mip IS log2 of the sampled
  face size** — and under roughness 0.21 the curve is `mip = -2*log2( 1.16*roughness )`.
- **Measured** (ORM readback, `_tmp_eo9_mip.mjs`): the plate's baked silvering is roughness
  **0.0616 / 0.0654 / 0.1923** at the 5th/50th/95th percentile → **mip 7.61 / 7.44 / 4.33**.
  `CUBEUV_MAX_MIP` is **9** at a 512 cube and **8** at a 256 cube, and **neither clamps 7.44** —
  so both cube sizes sample identical resolution. The extra ~30 MB bought nothing.

The plate subtends **7.04° × 12.64°**, so at mip 7.44 the whole reflection was carried by about
**10 × 20 texels stretched over 102 × 184 screen pixels**. That is the haze, exactly. Scaling
`material.roughness` to 0.18 saturates the mip at `CUBEUV_MAX_MIP` and the plate does brighten and
gain banding — **and is still not legible**, because 40 × 72 texels is the ceiling of the technique.

**A TRUE PLANAR REFLECTION SHIPPED AND IT ENDS THE DEFECT.** Camera mirrored about the plate's own
raked plane, frustum fitted to the plate's four corners, sampled by projecting the fragment's world
position through the same matrix. Both plates now carry legible, specific content: the right one a
**receding chequer floor with a dust-sheeted chair and the gilt dado rail**, the left one the
**stained-glass window wall, a sconce and a candelabra**. **So `critic-estate-6`'s unverified
"reflects the chequer floor" claim is now VERIFIED TRUE** — the rake was always aiming correctly;
the cube path was destroying the evidence.

**Cost, measured rather than asserted.** VRAM **89 MB → 14 MB** (two 640 cubes at 39 MB plus their
two PMREM atlases at 25 MB each, against two 568×1024 RGBA16F targets at 9.4 MB plus two 128 cubes
and atlases at 4.8 MB). Build-time **12 face renders at 640² → 2 scene renders + 12 at 128²**.
**Per-frame cost is zero both before and after** — it is rendered once, because the camera is
static. Draw calls **219 / 448k tris** against 625/900k. Grade gate **PASS 0.083, unchanged**.
⚠️ **It is exact ONLY for this camera.** `end-mirror.*` and `pierGlass` exist in this showcase view
only (`src/game/spaces.js` does not build them), so nothing that moves depends on it. **If the
ballroom ever becomes walkable with these plates in it, this becomes a per-frame scene render per
plate and must be re-costed.** The 128 cube is KEPT for the foxing: past roughness 0.34 the plate
mixes back to it, because a lifted amalgam patch scatters and should not carry a sharp image.


### ✅ ITEM CLOSED: `light.shaft`'s "the pane blows fully white viewed directly" IS FALSE AS STATED
`critic-estate-6`'s correction is **confirmed on a fresh capture**, and more strongly than it put
it. Whole frame: **`pixels at L>=250` is 0.0%** — nothing in the shot clips at all. On a 4× crop of
the lancet the **amber, blue and ruby quarries are all independently legible**, the cames read as
dark lines, and the roundel's fillets and cusped ring are visible. Gates all PASS (top-decile
(r-b)/L **0.132**, median L **33.8**, darkest decile **3.7**). The pale quarry *ground* does sit
high in the range, which is correct — the reference lancet is 29% at L ≥ 250 — but **the defect
should be struck, not carried.** The pool, the leadwork and the coloured quarries were not touched.


### 🎯 `estate-owner-12` (r10) — **"EVENLY LIT" WAS 95% OF THE FLOOR COMING FROM A SHELL WITH NO SHAPE**

`room.ballroom` **r10 BUILDING / UNSCORED — needs `critic-estate-10`.** Hate and win lists left
intact (they are `critic-estate-9`'s). Four permanent ablations added: **`?daylight=hard|flat`**,
**`?depot=0`**, **`?sunmap=N`**, **`?vol=0`**. Calls **230 / 487k tris** (was 219 / 448k); grade
gate **PASS 0.123 / 39.1 / 4.5** (was PASS 0.127 / 53.8 / 4.3).

**1. ⚠️ THE MACRO GAP IS ATTRIBUTED, AND IT IS ONE NUMBER.** Live ablation in one boot
(`harness/_eo12_macro.mjs`), mean luma over 300,760,896×300 of lit floor:

| ablation | lit floor mean |
|---|---|
| base | 78.3 |
| **all 19 point lights OFF** | **77.7 (−0.8%)** |
| all 19 point lights ×6 | +1% |
| the one SpotLight OFF | 75.9 (−3.1%) |
| the one SpotLight ×12 | 84.4 (+7.8%) |
| the 3 DirectionalLights OFF | 74.9 (−4.3%) |
| **`environmentIntensity` 3.2 → 0.8** | **22.9 (−71%)** |

**~95% of the light on the largest surface in the room was a structureless five-box IBL shell.**
That is the whole of "this room is evenly lit": the dominant source has no shape, casts no shadow
and arrives equally from every direction. `estate-owner-11`'s "sweeping the SpotLight 300 → 650
moves median L 49.8 → 49.8" is **CONFIRMED and generalised** — at 3.2 the shell drowns everything,
which is also why four rounds of work on the practicals were invisible.

⚠️ **AND THE 19 POINT LIGHTS COST 47% OF THE FRAME WHILE CONTRIBUTING UNDER 1% OF ITS LIGHT.**
`estate-owner-10` priced them at **−1.10 ms of a 2.33 ms frame**; turning all 19 off moves the lit
floor by **0.8%**, and ×6 by **1%**. The sconce and chandelier GLOWS are additive sprites and
survive without them. **Not cut here** — it is a look call on the hero room — but it is now priced
on both sides instead of one.

**The fix, and it is composition and lighting rather than a grade:** shell **3.2 → 1.70**, the one
daylight spot **300 → 19400**, bounce fill **×2.1**, the sun raked from **26.1° to 21.6°** (at the
old elevation every floor patch died between x −10.9 and −2.4, i.e. entirely in the left third of
a 26 m-wide frame — no intensity could put daylight in the middle of the picture), cone
**0.34 → 0.42** *solved* to cover the glazing (at 0.34 the two end windows sat in the spot's own
penumbra), shadow map 1024 → 2048. **Turning the spot off now costs the lit floor 40% where it
used to cost 3.1%** — that ratio is the claim, and it is independent of any grade.

**2. THE DEPOT (item 2), PLACED ON SOLVED SUN BANDS RATHER THAN SCATTERED.** Ten stacks of nailed
deal packing cases, two trestles, 130 loose ledger sheets, two sheeted mounds. With
dir = (0.885, −0.375, 0.265) a ray at window height y lands Δx = 2.36y, Δz = 0.743y further on, so
the four openings throw bands at **z −5.6..−2.4, −1.4..1.8, 2.8..6.0, all spanning x −10.5..−0.25**;
the cases stand on those, so **the clutter is also the shadow caster.** ⚠️ The same arithmetic
found a live bug: at the new angle **window 3's pool decal lands at z 8.6, 0.6 m OUTSIDE the room**
— the shaft/pool set moved to windows 0/1/2.

**3. THE DUST-SHEET FOLD FIELD COULD NOT PRODUCE A CREASE, AND AMPLITUDE WAS NEVER THE REASON.**
It was `sin(u·k) + sin(v·k)` **on the mesh grid's own parameters** — a lattice of bumps in a fixed
orientation, displaced on all three axes. Cloth creases run **down the fall**, spaced around the
object and pinched **radially**. Rewritten as radial pleats gated by the fall, a sag between
supports and a hem that pools; plus a **linen-tinted clone of `mats.plaster` with normalScale
×0.30** (lime plaster's trowel relief was the other half of "reads as stone"), and `variants: 2`
because five instances of one geometry is five copies of the same crease.

**4. THE MIRROR FILTER: KEPT, AND BOTH HALVES OF THE QUESTION ARE NOW ANSWERED SEPARATELY.**
- **The CODE claim is verified by direct measurement** (`harness/_eo12_mirrorcode.mjs`,
  `_tmp_eo11_plates.mjs`): `end-mirror.l` is **71 × 142 screen px against a 506 × 1024 target =
  7.13 × 7.21 RT texels per screen pixel**, and `?mirrorfilter=point` really is
  `minFilter=LinearFilter, generateMipmaps=false, anisotropy=1` with a single `texture2D` tap.
- **`critic-estate-9`'s refutation was correct for the build it measured and no longer holds.**
  Re-running **the critic's own script unmodified** on r10, twice, byte-identical output:
  **`end-mirror.l` point 0.3312 → sharp 0.3628 (+9.5%)**, `end-mirror.r` **0.1117 → 0.1154
  (+3.3%)**. The *more minified* plate gains ~3× more, which is the mechanism's own signature.
  The likely reason it was flat before: the reflection used to be of an evenly-lit room with
  nothing high-contrast in it to alias. **Still a small effect — do not cite it as a win.**

⚠️ **THREE STATED THINGS FOUND FALSE OR NOT REPRODUCIBLE.**
1. **`critic-estate-9`'s "acutance 0.0244 → 0.0743" is NOT what its own filed script produces.**
   `harness/_critic9_floorbreak.mjs` computes `mean|dL/dx| / 255`; run on the **pre-r12 build**
   via `?daylight=flat&depot=0` it reads **0.0095 → 0.0142**, not 0.0244 → 0.0743. The recorded
   pair belongs to the **tells/Sobel** metric (`mean|Sobel| / meanL`), which on the same rect and
   the same build reads **0.0255 → 0.0813 (3.19×)** — i.e. `estate-owner-11`'s number reproduces
   exactly and the critic's "independently reproduced with my own script" does not, because two
   different quantities are both called *acutance*. **The floor-reflection win is real and
   unaffected; the reproduction claim is not supported by the instrument it cites.**
2. **The floor-reflection win SURVIVES r10 and its RATIO narrows for an honest reason:** shipping
   acutance **0.0813 → 0.0796** (unchanged within 2%), while the ABLATED arm improves
   **0.0255 → 0.0482** — with the shell down, the un-reflected near floor is no longer a blown
   structureless sheet. Do not read the smaller ratio as a regression.
3. The board's **near/far mirror inversion is confirmed a third time** (`.l` 18.734 m, `.r`
   13.825 m).

**Measured, all default-tier 1920×1080, same rects before and after, art =
`refs/bf1/bf1-ballroom-01.png`:**

| 32-px macro variation | pre-r12 | r10 | art |
|---|---|---|---|
| lit-floor band (150,700,1600×380) | 0.589 | **0.819** | **0.817** |
| whole frame | 0.662 | **0.794** | 0.780 |
| near-mid chequer (300,760,896×300) | 0.438 | 0.626 | 0.727 |
| near-mid chequer (560,740,672×320) | 0.503 | 0.719 | 0.903 |
| far-right floor (1250,780,600×288) | 0.510 | 0.599 | 0.529 |

**Parity items HELD** (they were the thing not to break): grain **5.61 vs the art's 5.48**, edge
10–90 rise unchanged, band profile unchanged. **Grade gate PASS 0.123 / 39.1 / 4.5**; for scale,
`grade.mjs --img refs/bf1/bf1-ballroom-01.png` reads the **art itself at 0.089 / 49.8 / 11.3**,
with **2.4% of that frame at L ≥ 250** against our 0.35% — the reference's top decile is a *blown
neutral sun patch*, which is what made `highlightTint` the right lever (0.148 → 0.126 at **zero
cost to any macro number**; every other candidate bought the same chroma by flattening the frame).

**Cost: `perf-ab`, 5 interleaved rounds, `quality=medium`: r10 2.63 ms vs `?daylight=flat`
2.41 ms, within-config spread 0.05/0.06 — RESOLVED, +0.22 ms.** ⚠️ **No single component resolves
on its own**: depot −0.09 (spread 0.24), `sunmap=1024` −0.05 (spread 2.01), `vol=0` +0.01 (spread
2.20) — consistent with the cost being spread across them. The toggles ship so it can be re-priced
on a quieter machine.

⚠️ **A BUG I SHIPPED FOR ONE CAPTURE AND THE SHAPE OF IT IS WORTH KEEPING.**
`Math.max(256, Math.min(4096, +(qs.get('sunmap') || 0) || 0))` clamps the **absent** case to 256,
so the default build silently ran a **256 px shadow map**. It threw nothing and looked like a
slightly brighter room — it moved the lit floor's mean 80.1 → 85.9 and its p95 205 → 240, i.e. it
would have been filed as a lighting result. Caught only because two captures of "the same" build
disagreed. **A clamp is not a default.** Same family: `lift: undefined` spread over a grade
DELETES the field and `Pipeline._applyGrade` does an unguarded `fromArray` — `?daylight=flat`
failed to boot at all until that was `[0, 0, 0]`.

**Left open, stated rather than hidden:**
- The two near-mid chequer rects are still short of the art (0.626 vs 0.727, 0.719 vs 0.903).
  That floor is deliberately kept clear — it is the r9 planar-reflection win and the best surface
  in the frame — so closing those two would mean putting clutter on it.
- **The shaded floor is now WARM**: (r−b)/L **0.43 on the far-right floor against the art's
  0.032**. That is the known 19-practicals-vs-none difference the board says not to chase, but it
  got *larger* when the neutral shell came down, and a critic may fairly file it.
- The right-hand case stacks get no sun by construction (nothing past x ≈ +3.7 is in the cone).
- `?depot=0` still pays for the denser dust-sheet grids and the 2-variant split (225 calls /
  465k tris rather than the recorded 219 / 448k); only the depot itself is under the flag.


### ✅ `estate-owner-11` (r9) — THE PARITY HATE WAS A SAMPLING BUG, AND A THIRD OF THE FRAME WAS A MIRROR OF NOTHING

`room.ballroom` **r9 BUILDING / unscored** — needs `critic-estate-9`. Hate and win lists left
intact. Two permanent toggles added: **`?mirrorfilter=point|mip|sharp`** and
**`?floorreflect=0|1`**. Draw calls **219 / 448k tris unchanged**; grade gate **PASS
0.127 / 53.8 / 4.3**.

**1. ⚠️ "THE NEAR PLATE IS SOFTER" IS NOT A SHARPNESS DEFICIT — THE REFLECTION WAS BEING
POINT-SAMPLED AT 7:1 MINIFICATION.** Measured (`harness/_tmp_eo11_plates.mjs`):

| plate | screen px | reflection target | minification |
|---|---|---|---|
| `end-mirror.l` (the "soft" one) | **71 × 142** | 506 × 1024 | **7.1 : 1** |
| `end-mirror.r` (the "crisp" one) | **188 × 245** | 568 × 1024 | 3.0 : 1 |

Both targets were created `minFilter: LinearFilter` with **no mip chain**, so one screen pixel
took a single bilinear tap out of a 7 × 7 texel footprint. `harness/_tmp_eo11_rt.mjs` dumps a
target to PNG and `_tmp_eo11_ideal.mjs` box-filters it to the plate's real screen size: **the
correctly filtered version of the same data is fully legible at 71 × 142** — glazing bars,
sconce, drapes, sheeted table, chequer. The information was there and the fetch was throwing it
away. Fixed with a mip chain + max anisotropy + an explicit-LOD fetch, plus a one-octave unsharp
mask in the mip domain (a box-filtered minification is a correct low-pass and an ugly one).
⚠️ **The LOD is taken from the SMOOTH projected uv, never the wobbled one** — the wobble is a
normal-map term and its derivative is noise, which would pick a different mip per pixel.

⚠️ **AND HALF THE PARITY GAP WAS ONE NUMBER THAT IS HONEST AND STILL ASYMMETRIC.**
`uEoWobble` displaces the reflection in **UV**, so it is 3% of the plate whichever plate it is —
but what it costs is measured in the size of the features it smears. On the far plate that is
5.6 screen px against a reflected chequer square of ~40 (invisible); on the near plate 2.1 px
against a mullion of ~1 (fatal). **0.030 → 0.010**, swept in one boot at 0.030 / 0.010 / 0.
**A number applied identically to two objects is not necessarily fair to both.**

⚠️ **`uEoSharp` and the mip fix are NOT the same lever and the instrument nearly said they
were.** A half-screen-pixel jitter of `uEoMat` (`_tmp_eo11_jitter.mjs`) reads mean |ΔL| 2.40 →
2.17, i.e. **9%** — because the null hypothesis of that test is *not zero*: half a pixel of
genuine image motion dominates it. The tail is the diagnostic part (**p99 17.8 → 12.4**). Do not
quote the mean of that instrument as the aliasing.

**2. 🆕 A DEFECT NOBODY HAD NAMED, AND IT WAS A THIRD OF THE PICTURE: THE FLOOR WAS A MIRROR OF
A FIVE-BOX IBL.** The near floor was a featureless pale sheet ending in a hard diagonal where
the chequer came back — filed since round 2 as "a visible seam where the tile scale changes",
blamed twice on the light pools. Ablated in one boot (`_tmp_eo11_floor.mjs`, 400 × 240 px of
near floor):

| state | mean L | acutance | macro |
|---|---|---|---|
| base | 127.9 | 0.0215 | 0.505 |
| **`scene.environment = null`** | **14.5** | — | — |
| `environmentIntensity × 0.35` | 80.5 | 0.0497 | 0.669 |
| the three `lightPool`s hidden | 133.7 | — | — |
| `material.roughness = 1.0` | 127.9 | — | — |

**89% of that floor was the IBL.** Polished marble at grazing incidence returns the environment,
a specular term is added equally to a black tile and a white one, and this room's environment is
a structureless five-box shell — **so the chequer stopped existing exactly where the floor is
most oblique to the eye. This is the same defect the end plates had for four rounds, on the
largest surface in the room, and nobody had looked.** (`material.roughness = 1.0` is a **no-op**:
the scalar is already 1 and the baked ORM map carries the real roughness. A knob that changes
nothing is not evidence the mechanism is absent.)

Fixed the way the plates were: a **true planar reflection of the floor plane**, rendered once at
build time. The floor keeps the main camera's projection (for points *on* the mirror plane the
reflected and direct projections agree, so the target is sampled 1:1 and there is nothing to
filter), with the same Lengyel oblique near plane. Break test **`?floorreflect=0`**:

| near-floor 400 × 240 | ablated | shipping |
|---|---|---|
| mean L / median L | 120.3 / 167.6 | **72.1 / 63.2** |
| acutance | 0.0244 | **0.0742 (3.0×)** |

⚠️ **`envMapIntensity` IS NOT 1 FOR ANYTHING LIT BY `scene.environment`** — three overwrites the
uniform with `scene.environmentIntensity` (3.2 here), and `getIBLRadiance` ends in `* envMapIntensity`.
The plates set `envMap` on the material and get 1.0; the floor does not. The injected reflection
is pre-divided by a `uEoGain`, or it comes back at 3.2× the radiance of the room it reflects.

**Cost: zero per frame.** `perf-ab --config on:floorreflect=1 --config off:floorreflect=0
--probe "!!window.__rrr.engine.floorReflect"` → **2.36 vs 2.36 ms, spread 0.08 — NOT RESOLVED**;
219 calls / 448k tris identical in both arms. Build-time: one extra 1920 × 1080 RGBA16F target
(~22 MB with mips) and one scene render.

**3. ⚠️ THE GRADE GATE'S 0.083 WAS BEING CARRIED BY THE BUG.** With the pale neutral wash gone,
the top decile becomes gilt and candlelight and **the unchanged grade measures 0.193 — a WARN**.
Nothing got warmer; a defect that had been diluting the measurement was removed. What fixed it
was not exposure and not the shadows (`_tmp_eo11_grade.mjs`, one boot, top-decile (r−b)/L):
shadowTint → neutral **0.193**; exposure 1.05 / 1.18 / 1.30 → 0.188 / 0.178 / 0.170 (and 1.18
breaks the median); **`gain` → [1,1,1] → 0.138**; gain neutral + exposure 1.05 + shadowTint
1.02/0.99/0.95 → **0.127, median 53.9**. `gain: [1.02, 1.0, 0.965]` is a **5.7% warm skew in the
shared `estate` PRESET**, applied across the whole range of every estate view; it is overridden
in `GRADES.ballroom` only. **Whenever a bug is fixed, re-derive every gate figure that was
measured over it.**

**4. WHAT "IDENTIFIABLE AS A RENDER" ACTUALLY MEASURES HERE — and most of the usual suspects are
FALSE for this piece.** `harness/_tmp_eo11_tells.mjs` runs a battery (per-pixel grain, Laplacian
band energy per octave at 2/4/8/16/32 px, Sobel acutance, 10–90 edge rise, 32-px macro variation,
chroma) over any rectangle. Run over a **66-tile grid on both the render and
`refs/bf1/bf1-ballroom-01.png`**, bucketed by tile luminance so composition cannot fake it:

| bucket | grain (ours / art) | b8 | acutance | macro | chroma |
|---|---|---|---|---|---|
| L 25–60 | 4.29 / 3.88 | 9.46 / 6.05 | 0.112 / 0.079 | 0.403 / 0.336 | **0.602 / 0.441** |
| L 60–110 | 6.79 / 6.64 | 12.55 / 12.69 | 0.081 / 0.073 | **0.379 / 0.592** | **0.599 / 0.398** |
| L 110+ | 6.81 / 6.30 | 12.22 / 12.68 | 0.054 / 0.049 | **0.274 / 0.507** | 0.530 / 0.346 |

- **Grain, micro-contrast, acutance and edge width are AT PARITY with the art** (whole-frame:
  grain 5.65 vs 5.48, edge 10–90 **5 px vs 5 px**, band profile within ~10%). **"No sensor
  character", "edges too perfect", "no noise floor" are all measurably FALSE here — do not
  forward them.** The floor fix closed the L110+ band gap too (b4 8.27 → 9.61 against the art's
  9.76; b8 10.88 → 12.22 against 12.68).
- **What is real and still open is MACRO variation** — 32-px-block variation in the LIT half of
  the frame, 0.379 vs 0.592 and 0.274 vs 0.507. The art has big hard sun patches and deep shade
  on the same surfaces; this render is more evenly lit. That is a lighting/composition gap, not
  a surface-treatment one.
- ⚠️ **THE SHADOW-WARMTH GAP IS A LIGHTING DESIGN DIFFERENCE AND SHOULD NOT BE CHASED.** Our dark
  tiles read (r−b)/L **0.91 against the art's 0.157**. Killing `shadowTint` entirely moves it to
  0.94. It is not the grade: **this room has 19 lit practicals and BF1's ballroom has none.**
  A round spent neutralising it would be a round spent deleting the candlelight.
- ⚠️ **THE "ONE SPOT OUTSIDE THE WINDOW WALL" DOES ALMOST NOTHING.** The file's own header says
  the windows do the lighting; sweeping the only SpotLight **300 → 650** moves median L 49.8 →
  49.8 and top chroma 0.194 → 0.185. The daylight in this frame is the IBL shell and the
  multiply light-pool decals. Whoever wants harder daylight has to fix that, not the spot.

**Honest limit, stated rather than hidden:** the two plates cannot be brought to *equal*
legibility. One is 71 × 142 px showing a whole wall of architecture; the other is 188 × 245 px
showing one enormous chequerboard. Measured, the near plate already carries **more** local
contrast than the far one (2-px band 9.53 vs 5.81, acutance 0.212 vs 0.176) — it reads softer
because its subject is 6× finer, not because it is less sharp. A critic may still file it; the
remaining levers are the plate's SUBJECT (the yaw round 10 built and rejected) or its size.


### 🎥 `estate-owner-13` (r13) — **THE REFRAME. `room.ballroom` BUILDING / UNSCORED, needs `critic-estate-11`.**

`critic-estate-10`'s #1 was a CAMERA hate and it is worked. New permanent toggle **`?cam=overlook|r10`**
(default `overlook`). ⚠️ **`?cam=r10` restores the rounds 1-12 camera EXACTLY and reproduces the
board's own filed gate to two decimals — PASS 0.122 / 37.5 / 3.1 against the recorded
0.123 / 39.1 / 4.5** — so every historic number on this piece stays checkable and the revert is one
query parameter.

🆕 **`harness/_eo13_cam.mjs` PUTS A NUMBER ON "THE SHOT DOES NOT MATCH THE BAR", and it is a number
lighting and grade cannot confound:** cast every pixel's ray and ask which face of the room box
(x −13..13, y 0..9.6, z −8..8) it leaves through. Props stand on the floor and occupy floor rays,
which is the right accounting — a crate is floor-zone content, not ceiling.

| camera | floor | ceiling | window wall | end wall | near wall | room corners in frame |
|---|---|---|---|---|---|---|
| r10 | 30.5% | **20.7%** | 17.7% | 30.8% | 0.4% | 3 of 8 |
| **overlook** | **40.3%** | **3.7%** | 18.9% | 31.3% | 5.8% | **4 of 8** |

⚠️ **THE ROOM STILL READS ITS SCALE — the critic's distinction from the `prop.chandelier`
precedent holds.** The full two-storey window order runs floor to cornice, the coffers and all
three chandeliers are still in frame, one MORE room corner is in frame, and **the 1.7 m robot
subtends ~144 px at the overlook against ~145 px at r10** — the scale cue is the same size. The
musicians' gallery was never in the r10 frame either (`wallMIR` 0.0%), so nothing was lost there.

⚠️ **THE CEILING ITEM IS NOW WORTH NOTHING — do not spend on it.** It was 20.7% of the frame and
is 3.7%. That is `critic-estate-10` item (d) closed by composition rather than by lighting, which
is what the brief asked to re-measure before spending.


### 🆕 THREE THINGS FOUND BROKEN THAT ONLY THE OLD CAMERA HID
1. 🚨 **THE NEAR WALL (z +8) WAS HALF A WALL.** Every other wall in the room is built as two
   storeys; this one stopped at 4.8 m with **4.8 m of open void above it** and the cove ending in
   mid-air. It never showed because the r10 camera stands at z 6.1 with that wall behind it.
   `node harness/_eo13_cam.mjs --shots --cams "NEARWALL:0,5,-4,0,4.5,8,60"` photographs a black
   band across two-thirds of the frame. Built, plus the full-height pilaster order the other
   three walls carry — merged into existing buckets, **no extra draw call**.
2. **The vestibule beyond the arch is a featureless pale card.** At eye height the arch reads as
   a dark opening; from the gallery the eye goes down it and lands on 6.6 × 5.6 m of plain stone
   lit to the room's own value — the largest detail-free area in the new picture. Darkened to a
   separate key so the arch reads as depth, and given a floor **it never had** (`z −8..−12.4` is
   outside the 28 × 18 floor plane, so the vestibule stood on nothing).
3. The r12 header's solved sun-band arithmetic still quotes the **pre-r12 sun direction**
   (0.865, −0.44, 0.24). The bands in `HANDOFF` are right; the in-file comment is stale.


### 🆕 THE PAPER IS LEGIBLE, AND IT IS PROVEN BY ABLATION RATHER THAN BY COUNT
`harness/_eo13_paper.mjs` projects each instance's four corners and compares the pixels INSIDE the
quad against a ring just outside it. On r12 the median sheet differed from the floor under it by
**|dL| 6.6 of 255** — 2.6% of the range, which is what "130/130 on screen and not one legible"
was. ⚠️ **The live sweep INVERTS the obvious reading: SIZE buys nothing and VALUE is the whole
lever.**

| lever | median &#124;dL&#124; | share ≥10 |
|---|---|---|
| base (r12) | 6.6 | 36% |
| **bigger sheets ×1.45** | **6.6** | 31% |
| curled 40% out of plane | 8.7 | 42% |
| paler stock | 8.9 | 47% |
| curl + big + near-white | **13.0** | 57% |

*A bigger sheet straddles more tiles and averages them together.* Shipped: 165 sheets, near-white
rag stock, 40% curled, tighter drifts. **Proof: hide the mesh and re-shoot the SAME frame — three
floor rects move 7.2 / 5.5 / 9.7% of their pixels by ≥8 levels, max 112–147**, and the ON/OFF crop
pair shows sheets appearing on the chequer.
⚠️ **~40% of them still cannot be seen and that is a composition fact, not a defect:** half this
floor is WHITE marble at paper's own value. The bar scatters its paper on **dark parquet**.
⚠️ **A live sweep of the litter UNDERSTATES itself** — the floor's planar reflection is rendered at
build time, so a live change is not reflected in it, and the per-sheet ring metric punishes a
DRIFT (the ring outside sheet A is mostly sheet B). Use the ablation.

**Measured, default tier, 1920×1080:** grade **PASS 0.041 / 42.9 / 5.2**; grain 5.081 vs art 5.481,
edge 10–90 rise 6 px vs 5 — parity held. **Shaded-floor macro is no longer ABOVE the art**
(rightshadow **0.5400**, midshadow **0.6378** against the art's comparable shadow rect **0.6362**,
where the critic measured 0.5963 vs 0.4314 on the old frame). ⚠️ **But whole-frame macro now
OVERSHOOTS: 0.8815 against the art's 0.7796** (r10 arm 0.793) — the frame is dominated by the
chequer's own tile contrast, i.e. the critic's "inflated by the floor material, not by lighting"
arriving at the headline number.
⚠️ **The overlook's toe lift is applied to the OVERLOOK ONLY** (`lift` 0.013 → 0.030). The reframe
moves a fifth of the frame from evenly-lit ceiling to floor and the darkest decile fell to 1.7
(WARN, target 2–8). Leaving `?cam=r10` un-lifted is what keeps it a true reproduction instead of
the old lighting under a new curve.

**Cost — `perf-ab`, 3 interleaved rounds, `quality=medium`: overlook 2.45 gpu / 2.24 cpu /
237 calls / 511k tris vs r10 2.44 / 2.23 / 232 / 510k. NOT RESOLVED (0.01 ms against a 0.02 ms
spread) — the reframe is free.** Against the board's recorded 230 / 486k: +2 calls (the vestibule
bucket) and +24k tris for the near wall, its pilasters and 35 more sheets.

🚨 **NOT DONE, AND IT IS THE BIGGEST SINGLE THING LEFT: THE FLOOR MATERIAL HALF OF THE
COMPOSITION RULING.** The bar is **mostly wood parquet with checker only at the room's edges**;
ours is checker edge to edge. A parquet field would move the whole-frame macro overshoot, the
shaded-floor macro and the paper's invisible 40% **at once**. I did not take it because it is
coupled to the r9 planar-reflection win — that patch's roughness gate (`lo: 0.06, hi: 0.42`) is
authored for polished marble and a rough parquet field would simply stop reflecting, and a
two-material floor needs the planar patch applied twice. **It is the next round's first item and
it should be built behind `?floor=` so it can be A/B'd like everything else on this piece.**


### 🏆 `critic-estate-10` — **`room.ballroom` PASS 82 → PASS 85, a new project high. Still 0/37 WOWED.**
⚠️ **BLIND AND POST-ART DIFFERED, AND THE DIFFERENCE IS THE WHOLE FINDING.** Blind, the room reads
as a genuine improvement — *a hard, blown-out sun patch with real falloff into shadow*, replacing
the old "evenly lit". Opening the reference added a cue blind judging could not surface:

🚨 **THE SHOT DOES NOT MATCH THE BAR, AND THAT IS THE FASTEST TELL IN AN UNLABELLED SIDE-BY-SIDE —
FASTER THAN ANY SURFACE DEFECT.** Our frame is a close three-quarter, checkerboard-marble-dominated
view that is **~45% ceiling**; `refs/bf1/bf1-ballroom-01.png` is a **high overlook, mostly wood
parquet, checker only at the edges.** *We have been polishing surfaces inside a frame that is
composed differently from the thing it is judged against.*
⚠️ **`bf1-ballroom-03.png` shares THIS piece's chandelier+checkerboard framing at a similar height.**
**LEAD RULING: reframe toward `-01`; do NOT re-point the bar at `-03`.** Swapping the reference so
the score rises is goalpost-moving and would corrupt every number this board holds. The critic
distinguished this from the `prop.chandelier` reframing precedent with a reason — **this room reads
its scale fine at a lower angle, so pulling toward the overlook sacrifices nothing.**

**Macro variation confirmed — and CONFINED to where the sun lands**, on rects the critic chose
itself: whole frame **0.7943 vs art 0.7796** ✅ · litpool **0.7936 vs 0.9166** (short) ·
rightshadow **0.5963 vs 0.4314** and a third rect **0.5224 vs 0.2112** — **ours is MORE varied than
the art outside the cone.** ⚠️ **And the metric is partly measuring the FLOOR PATTERN, not the
lighting:** a pure-shadow checker patch with no clutter measures **0.35 on its own.** *Macro
variation conflates material contrast with lighting shape — do not read it as a lighting number
where the sun does not reach.*

🆕 **THE 130 PAPER SHEETS PROJECT 130/130 ON SCREEN AND NOT ONE IS LEGIBLE** — tight crops at their
own reported coordinates show only floor-reflection noise. **"A raycast landing on screen is not the
same as a viewer seeing it."** Another member of the "it exists, you cannot see it" family, and the
set dressing added to answer *compositional emptiness* therefore did not answer it.

**Reproduced exactly:** grade **PASS 0.123 / 39.1 / 4.5**, grain 5.612 vs art 5.481, cost 230 calls
/ 486k tris. **Dust sheets confirmed a genuine craft win** (radial pleats, sag, pooling hem).
**Rulings:** keep the planar-reflection floor clear (the chequer gap there is mostly the composition
mismatch, not a deficiency) · **do not chase the warm shaded floor** (chroma 0.4556 vs art −0.0833,
but it is candlelight from 19 practicals BF1's room does not have — a legitimate design difference)
· the right third's daylight gap and the flat ceiling are both real and unchanged.


### `critic-estate-9` — **`room.ballroom` WEAK 76 → PASS 82.** Highest score in the project; still 0/37 WOWED.
Blind and post-art did not materially differ — the cold look already flagged **even, shadowless
lighting** and **stone-like dust sheets**, and the reference confirmed both.

**Independently reproduced almost to the decimal**, with its own scripts and the project's Sobel
tool: floor break test mean L **120.27 → 72.07**, median **167.6 → 63.1**, acutance **0.0244 →
0.0743 (3.05×)**; grade **PASS 0.127 / 53.8 / 4.3** on a fresh default-tier capture; cost **NOT
RESOLVED** (2.73 vs 2.74 ms). **A genuine third-of-frame defect, filed as "a seam" since round 2,
is closed.**
**Near/far inversion CONFIRMED by direct measurement:** `end-mirror.l` is the **farther, smaller**
plate (**18.734 m, 71 × 142 px**); `end-mirror.r` is the **nearer, bigger** one (**13.825 m,
188 × 245 px**). **The board had it backwards and several past critiques reasoned from the reversed
label.**

⚠️ **THE MIRROR-FILTER FIX DOES NOT HOLD UP — a builder claim refuted.** Point vs sharp on fresh
captures: acutance **0.1984 vs 0.1969 — flat, and marginally REVERSED** — and visually
indistinguishable at 6× nearest-neighbour. Content is legible in **both** modes. **Breaking it back
to `point` barely moves the picture.** The critic was careful about scope: it did **not** check the
underlying code claim (7.1 : 1 minification, no mip chain) — *"the pixels just don't show the
payoff."* So the **diagnosis may still be right while the fix buys nothing**; the plate's legibility
comes from the honest subject-scale limit the builder itself conceded. **Decide whether to keep or
revert; do not cite the mip lever as a win.**


### 🎯 WHAT WOWED ACTUALLY REQUIRES — NOW MEASURED TWICE, BY TWO AGENTS, INDEPENDENTLY
The critic corroborated `estate-owner-11` on different regions with the same tool: **edge 10–90
rise 5 px vs 5 px EXACT**, band-2 **6.69 vs 6.70**. So *"edges too perfect / no sensor character /
no noise floor"* is **dead as an explanation.**

**The remaining distance is three things, and none of them is surface treatment:**
1. **MACRO LIGHT/SHADOW VARIATION — and it is WORSE isolated than whole-frame.** On the lit floor
   alone: **0.658 against the art's 0.915** (whole-frame was 0.379 vs 0.592). *This room is evenly
   lit; the reference has big hard sun patches and deep shade.* **This is the single finding that
   should steer every piece on the board.**
2. **COMPOSITIONAL EMPTINESS** — the reference is stuffed with crates, a statue, scattered paper;
   this room has a robot, a candelabra and a few sheeted shapes.
3. 🆕 **The dust sheets read as smooth STONE, not draped cloth** — no creases, no gravity pooling.

⚠️ **Do not chase shadow warmth** (ours 0.91 vs art 0.157): killing `shadowTint` entirely moves it
to 0.94. **This room has 19 lit practicals; BF1's has none.**


### 🔬 `estate-owner-11` — **WHAT "STILL IDENTIFIABLE AS A RENDER" ACTUALLY MEANS, MEASURED**
Every critic for weeks has closed with that sentence and nobody had tested it. A new instrument
(`_tmp_eo11_tells.mjs` — grain, Laplacian band energy per octave, Sobel acutance, 10–90 edge rise,
32-px macro, chroma) ran a **66-tile grid over both the render and `refs/bf1/bf1-ballroom-01.png`**,
bucketed by tile luminance. **Most of the usual suspects are FALSE for this piece:**

- **Grain, micro-contrast, acutance and edge width are AT PARITY with the art** — whole-frame grain
  **5.65 vs 5.48**, edge 10–90 rise **5 px vs 5 px**, band profile within ~10%. *"Edges too
  perfect", "no sensor character", "no noise floor" — measurably untrue here.* **The lead listed
  all three as likely suspects in the brief; none survived.**
- ✅ **WHAT IS REAL: MACRO VARIATION IN THE LIT HALF.** 32-px block variation **0.379 vs 0.592**
  (L60–110) and **0.274 vs 0.507** (L110+). The art has **big hard sun patches and deep shade**;
  this render is evenly lit. **That is COMPOSITION AND LIGHTING, not surface treatment** — and it
  is the answer the whole project has been missing about where the remaining distance lives.
- Second real gap: **the room is compositionally EMPTY** against a reference stuffed with crates,
  papers and wreckage.
- ⚠️ **Do not chase shadow warmth** (ours 0.91 vs art 0.157): killing `shadowTint` entirely moves
  it to 0.94. **This room has 19 lit practicals; BF1's has none.**

**🆕 A DEFECT COVERING A THIRD OF THE FRAME, FOUND AND CLOSED: the floor was a mirror of a
structureless five-box IBL.** Ablated over 400 × 240 px of near floor, base mean L **127.9 →
`scene.environment = null` → 14.5** — **89% of that floor was IBL specular at grazing incidence,
added equally to black and white tiles, which is why the chequer stopped existing.** The *"seam
where the tile scale changes"*, filed since round 2 and **blamed twice on the light pools** (hiding
them changed it by 133.7 → nothing), was this. Replaced with a real planar floor reflection.
Break test **`?floorreflect=0`**: mean L 120.3 → 72.1, median 167.6 → 63.2, **acutance 0.0244 →
0.0742 (3.0×)**. **Cost NOT RESOLVED** (2.36 vs 2.36 ms, spread 0.08); build-time only.

**And the plate-parity hate was a SAMPLING BUG, not a sharpness deficit.** The "soft" plate is
**71 × 142 screen px reflecting a 506 × 1024 target — 7.1 : 1 minification** — built
`LinearFilter` with **no mip chain**, so one screen pixel took a single bilinear tap out of a
7 × 7 texel footprint. Box-filtering the *same data* to its real screen size is **fully legible**.
Fixed via `?mirrorfilter=point|mip|sharp` (default `sharp`, `point` = the old path as break test):
mip chain, max anisotropy, explicit-LOD fetch taken from the **unwobbled** uv (the wobble's
derivative is noise and would pick a different mip per pixel), plus a one-octave unsharp mask.
⚠️ **But equal legibility is IMPOSSIBLE and that is now measured:** the near plate already carries
**more** local contrast (2-px band 9.53 vs 5.81, acutance 0.212 vs 0.176) — **it reads softer
because its subject is 6× finer, not because it is less sharp.**

⚠️ **THE GRADE GATE'S 0.083 WAS CARRIED BY THE BUG.** With the pale neutral wash gone the
*unchanged* grade reads **0.193 (WARN)**. Cause found by sweep: **`gain: [1.02, 1.0, 0.965]` is a
5.7% warm skew in the shared `estate` preset**; overridden in `GRADES.ballroom` only. Final
**PASS 0.127 / 53.8 / 4.3**.

⚠️ **FIVE MORE STATED FACTS FALSE, including the board's own labels:**
1. **THE NEAR/FAR LABELS ON THE BOARD ARE INVERTED.** `end-mirror.l` — the one every round has
   called "near" — is the **farther** plate (18.7 m vs 13.8 m) and the smaller on screen.
2. The r10 gate figures (0.071/50.7/4.8) **do not reproduce**; the pre-change build measures
   0.083/53.8/4.1. It re-measured its own baseline rather than compare to the record.
3. The ballroom file header's *"ONE spot outside the window wall does the lighting"* is false —
   sweeping the only SpotLight **300 → 650** moves median L **49.8 → 49.8**.
4. **`material.roughness = 1.0` on a baked material is a NO-OP** (the scalar is already 1; the ORM
   map carries it). **A knob that changes nothing is not evidence the mechanism is absent.**
5. The lead's ref path was wrong: `refs/bf1/…`, not `progress/refs/…`.

⚠️ **Its own jitter instrument nearly lied:** the null hypothesis is not zero (half a pixel of
genuine image motion dominates), so mean |ΔL| 2.40 → 2.17 understates it — **the tail (p99 17.8 →
12.4) is the diagnostic part.**

`room.ballroom` is **r9 BUILDING/unscored — needs `critic-estate-9`.** Left: dust sheets have no
contact grounding and read as stone rather than cloth; the gallery's per-feature-contrast lever is
untried; `room.study` and `light.dark` untouched.


### `critic-estate-8` — **ballroom 72 → 76 (BEST PIECE IN THE PROJECT)**, gallery 70 → 75
Board: **room.ballroom 76** · room.gallery 75 · gadget.sheet 75 · light.shaft 74 · chandelier 72 ·
light.dark 65 · room.study 65. **Still 0/37 WOWED.**

Blind and post-art agreed on both pieces. **It ran the break-test itself** (`?planarclip=flat`) and
reproduced the dead-straight-edged grey wedge, confirming the oblique near-plane fix is real rather
than cosmetic — **but ruled the parity claim only PARTLY true:** the near mirror's content (sconce
glow, mullion grid, dim furniture) is genuinely *identifiable* yet still visibly softer than the
far mirror's crisp chequerboard. Filed as the ballroom's single remaining hate.
**Quatrefoil accent: hate CLOSED** — cusped notches with only a faint dot at the tracery crossing,
nothing like the removed ring-and-boss, against a plain clerestory control.
**Far sitter: the ~30 px ceiling is HONEST — it measured SMALLER, ~14 × 29 px**, so the limit is
real and not evasion. ⚠️ **But it named a cheap, untried lever: per-feature CONTRAST at distance.**
Both fixes so far addressed atlas resolution and feature *shape*; **a low-contrast mark can vanish
under mip-averaging even when raw texel count would resolve it.** Filed as an open hate.
**Mood vs Hitman stays open** — dramatic case-spotlighting there against a flatter sconce wash here.

⚠️ **Two pieces of epistemic hygiene worth copying.** It stated plainly that it is `critic-estate-8`
and **not** the `critic-estate-7` whose finding its brief quoted, and **re-measured independently
rather than assuming continuity of identity** — critics are separate agents and must not inherit
"my earlier finding". And it **declined to re-run the GPU pass** per the standing lead ruling,
**saying so explicitly rather than implying it had verified it.**


### `estate-owner-10` — the 2.24 ms is ATTRIBUTED, and **the answer is "neither statement was wrong"**
The lead framed this as *"those two statements are in tension and one is wrong."* **They were about
different things and both were true.** Measured with a new toggle (`?mirror=planar|cube|off`,
permanent) and a new general instrument: **planar 2.32 · cube 2.31 · off 2.30 ms** (spread
0.02–0.07, three interleaved rounds). **Deleting both plates entirely is not resolvable.** So
`estate-owner-9`'s "per-frame cost zero" is CONFIRMED and `critic-estate-7`'s 2.24–2.28 is
CONFIRMED.

🆕 **`harness/perf-ab.mjs` — the general form of what `perf-ao` did by hand.** Interleaves configs
in ONE browser after a whole discarded round, prints the within-config spread beside every delta,
and reports **NOT RESOLVED** when a difference is below it. **Use it for every future perf claim;
it is the tool that would have prevented two of this week's arguments.**

⚠️ **THE OVERRUN IS THE LIGHT COUNT, AND THE GENERAL FACT IS WORTH MORE THAN THE FIX:
`distance` CULLS A POINT LIGHT'S CONTRIBUTION, NOT ITS COST — ~0.058 ms EACH, PAID BY EVERY
FRAGMENT.** Census: 19 point + 1 spot + 3 directional. Killing the 19 points is **−1.10 ms, 47% of
the frame**; all lights −1.38; env −0.21; spot −0.16; AO −0.15; bloom −0.13; **all volumetrics
−0.02**; `renderScale 0.5` −1.55 (so it is fragment-bound).
🆕 **`room.gallery` is WORSE — 3.32 ms, 33 lights, −2.42 when killed — and nobody had ever flagged
it.**

**LEAD RULING, so nobody spends a round on this:** `views/game.js` runs a **fixed five-light rig**,
which is why the shipping mansion clears the same budget at 1.22–1.38 ms. **The 1.39 ms budget is
the GAME's budget and does not apply to the showcase views**, whose practicals exist precisely to
make the look judgeable — reaching it in the ballroom would mean deleting ~16 of 19 of them.
**Keep measuring the showcase views so a regression stays visible; do not gate them on the game's
frame budget.** If a showcase light rig ever migrates into `game.play`, it must be re-costed.


### ✅ `estate-owner-10` — the plate parity was NEVER an aim problem
More than half the left plate was **the back of its own end wall**, leaking past a flat near plane
that is *oblique* to that wall. The old comment's reasoning ("a flat near plane just short of the
nearest corner clips the wall") is **true in its parts, and the conclusion does not follow** — a
near plane is perpendicular to the view axis and the wall is not, so they intersect in a line and
the wall renders on one side of it. Dead-straight diagonal edge in the capture, `kit:wall`
confirmed by scene-child ablation. The right plate escaped only because its axis is nearer normal
to that wall (0.964 vs 0.868). Fixed with the **oblique near plane (Lengyel)** the old comment
named and declined to build; **break-tested — `?planarclip=flat` brings the wedge straight back,
and is kept permanently.**
⚠️ **It recorded its own WRONG TURN in the file**, which is the behaviour to copy: it first
measured the plate's *aim* and built an 8° yaw on numbers that were sound but an inference that
was not — **"54% wall" was read as "54% blank"** because the grey field was assumed to be that
wall magnified. Yaw rejected after A/B against yaw 0 with the near plane fixed.

**Gallery:** anchor split closed with a **cusped quatrefoil** (`uMotif`, default 0 so every other
window is bit-identical — no concentric structure, no dark boss, so it cannot be misread as the
removed ring). It was **invisible until the gold was solved through the tone curve** — this file's
own round-8 finding sitting unfixed. **And "faces read only within 2 m" was TWO problems, with the
near half understated: the largest portrait in frame had no readable eyes, nose or mouth either.**
(a) the atlas was 1024 at 4×2, so a head was **33–52 texels** → now 2048; (b) every feature was
`1.0 - smoothstep(0, R, d)`, **a cone peaking at a single point** → inner edges now non-zero for a
flat core. Near sitter now reads as a face; **far sitter improves but stays marginal at ~30 px of
head — a screen limit at this camera, stated rather than claimed.** Bake cost 222.1 → 270.3 MB,
18.1 → 23.9 s.


### `critic-estate-7` — **ballroom 63 → 72**, gallery 67 → 70. Board: shaft 74 · ballroom 72 · chandelier 72 · gallery 70 · dark 65 · study 65
**The ballroom's four-round defect is closed.** Both its open hates (the ring, the far-mirror
haze) independently verified fixed. Blind and post-art reads **agreed** this round — the critic
named the far mirror's chequer floor and dust-sheeted chair correctly *before* opening any
reference, which is the strongest form the planar-reflection claim could be confirmed in.
`light.shaft`'s "blows fully white" independently re-measured at **L≥250 = 0.0149% ≈ 0.0%** —
**confirmed FALSE as stated; stop forwarding it.**

⚠️ **NEW AND UNATTRIBUTED: `room.ballroom` measures 2.24–2.28 ms against the 1.39 ms budget, two
consistent runs.** The critic flagged it and **could not attribute it to the mirror swap because
NO A/B TOGGLE EXISTS.** That is the exact gap `perf-ao` avoided by keeping `?aodepth=prepass`
permanently. **Build the toggle, then attribute — do not guess.** Note the builder claimed
"per-frame cost zero before and after"; that claim is now in tension with a reproducible
measurement and one of the two is wrong.

Two more open: **the NEAR plate is now softer than the FAR one** (the inversion of the original
complaint), and the gallery's **anchor-window split** is filed as an open hate — ruled
"acceptable-leaning-intentional, but marginal", because it is literally the same shader defect
removed everywhere else, on the same arch silhouette, so a viewer without context may read it as
a miss rather than an accent. **Recommendation: give it a distinct motif.**
⚠️ **The gallery's HEADLINE complaints are still untouched** — far-portrait legibility and mood vs
Hitman — re-checked on fresh crops and still standing, which is why +3 and not more.


### `estate-owner-9` (r9) — the ballroom mirror is SOLVED, and three more stated facts fell

**1. The bullseye was NOT the `worldUV` trap** (the lead's first suspect, stated twice). Measured:
the live glass mesh `kit:glass` carries **uv exactly 0..1 and `map.repeat` exactly 1,1** —
`windowBay` passes `uv = null` to `GeoBin.add`, which means *keep authored UVs*, so **`worldUV`
never runs on glass at all.** Real cause: the church **roundel is authored into the shared
`GLASS_SURFACE`**, and every mix drawing it read `0.9x + 0.1x*uInk`, so at the daylight glazing's
`uInk` of 0.55 the ornament still landed at **0.964 — no existing number could switch it off.**
The `uMedal` *geometry* gate is the right fix, **validated by break-test** against
`critic-estate-6`'s own scored frame at 4×.
🆕 **The same defect was sitting UNREPORTED in `room.gallery`** — all fourteen clerestory lights
carried the identical roundel in the identical place. Fixed; the single far-end anchor keeps its
ornament deliberately and **a critic should rule on that split.**

**2. ⚠️ THE PREVIOUS ROUND'S 384 → 640 CUBE WAS A NO-OP, and this is the check its author died
mid-way through.** `PMREMGenerator._setSize` does `_lodMax = floor(log2(cubeSize))`, so **640
floors to 512 and 384 floors to 256 — the number in the view has never been the number the shader
gets.** Baked roughness measured by ORM readback is 0.0616 / 0.0654 / 0.1923 at p5/p50/p95 → mip
**7.61 / 7.44 / 4.33**, and `CUBEUV_MAX_MIP` is 9 at 512 and 8 at 256, so **neither clamps 7.44
and both cube sizes sampled identical resolution.** At 7.04°×12.64° the whole reflection was
~**10 × 20 texels over 102 × 184 screen pixels**; saturating the mip brightens it and adds banding
and is *still* illegible. **40 × 72 texels is that technique's ceiling — the cube size was never
the lever.**

**3. A TRUE PLANAR REFLECTION SHIPPED AND ENDS THE DEFECT.** Both plates now carry specific
content — right: a receding chequer floor with a dust-sheeted chair and the gilt dado; left: the
stained-glass wall, a sconce and a candelabra. **So the "reflects the chequer floor" claim is now
VERIFIED TRUE: the rake was always aiming correctly and the cube path was destroying the
evidence.** Honest cost: **VRAM 89 MB → 14 MB**, build-time 12 faces at 640² → 2 scene renders +
12 at 128², **per-frame cost zero before and after**, 219 calls / 448k tris against 625/900k,
grade gate PASS 0.083 unchanged. ⚠️ **Exact only for this camera** — these plates exist in the
showcase view only (`spaces.js` does not build them). **If the ballroom becomes walkable with
them it becomes a per-frame render per plate and must be re-costed.**

**4. ⚠️ STRIKE `light.shaft`'s "the pane blows fully white viewed directly" — it is FALSE as
stated.** Whole-frame pixels at L≥250 measure **0.0%; nothing clips.** Amber, blue and ruby
quarries, cames and roundel all legible at 4×; gates PASS (0.132 / 33.8 / 3.7). **Do not carry it
into another brief.** (The lead forwarded it twice.)

`room.ballroom` r7 and `room.gallery` r6 are **BUILDING / unscored** — both need `critic-estate-7`.
`room.study` (65) untouched: the round went to the assignment plus the gallery defect it exposed.


### `critic-estate-6` — ALL SIX UP, and `light.shaft` 74 is the HIGHEST SCORE ON THE BOARD

| piece | prior | new | delta |
|---|---|---|---|
| light.shaft | 69 | **74** | +5 — highest score in the project |
| prop.chandelier | 68 | **72** | +4 |
| room.gallery | 62 | **67** | +5 |
| light.dark | 56 | **65** | **+9 — biggest single jump** |
| room.study | 60 | **65** | +5 |
| room.ballroom | 62 | **63** | +1 — now the group's weakest |

Judged blind-first against **its own fresh captures**, not the builder's. Still **no WOWED and no
PASS**: every piece remains identifiable as a render on close inspection. Blind and post-art reads
differed twice, both instructive — `light.dark`'s depth fix looked merely *plausible* blind and
was confirmed only by its own pick grid; the chandelier's central blob looked like a **bug** blind
and proved on zoom to be a genuine faceted crystal.

**Four of the five overturned facts reproduced independently.** Two corrections:
- ⚠️ **`light.shaft`'s "pane blows fully white viewed directly" was OVERSTATED** — colour survives
  even at the brightest part of the arch on a fresh capture. A self-reported defect that is not
  as bad as its own author claimed.
- ⚠️ **"Legible but soft" OVERSELLS the FAR ballroom mirror** — on a blind look it reads as
  illegible haze. The near one is soft-but-legible; the far one is not. The "reflects the chequer
  floor" claim is **unverified, not refuted** — both mirrors are too murky at the bottom edge to
  read floor content either way.
- The chandelier's print ambiguity is **resolved outright**: 0.139 clears both the strict 0.14 and
  the ruled 0.20 candlelit ceiling. Nothing to carry forward.

🆕 **NEW DEFECT, not previously on record:** all four **`room.ballroom`** windows carry an
**identical tiled concentric-ring / bullseye decal at the same screen position** — reads as a
repeated artifact and appears in neither bar reference. ⚠️ Smells like the documented `worldUV`
trap (**it is metres-per-repeat, not a tile count**); check that before authoring anything.


### `critic-estate-5` verdicts (superseded above — kept for the overturned-claim trail)

| piece | verdict | score | vs prior |
|---|---|---|---|
| light.shaft | WEAK | **69** | 61 → 69 — best win of the round |
| prop.chandelier | WEAK | 68 | 66 → 68 |
| room.ballroom | WEAK | 62 | 65 → **62** |
| room.gallery | WEAK | 62 | 64 → 62 (untouched, re-verified fresh) |
| room.study | WEAK | 60 | 57 → 60 |
| light.dark | WEAK | **56** | 62 → **56 — a builder claim was OVERTURNED** |

⚠️ **`light.dark` — THE SCORE WAS FAIR; THE STATED REASON WAS WRONG, TWICE. Read this before you
trust any `--pick` grid, including your own.**
`critic-estate-5` filed it as the occlusion class: a 150-sample grid returning `kit:coldPanel`
everywhere, distances spread <2% (14.57–14.86), flat luminance (L 189–201). **`estate-owner-7`
refuted both halves by measurement:**
- **Nothing was in front of it — it was OUTSIDE THE ONLY CONE THAT EXISTS.** The corridor was
  **3.4 m wide against a doorway view cone just 1.95 m wide at that depth**; rays through a
  1.62 m door diverge only **0.134 m per metre**, so no ray could ever reach a return sitting
  1.7 m off axis. **This is a SECOND defect class and the more expensive one: geometry that is
  not occluded, merely UNREACHABLE by any ray the shot contains.** Occlusion is fixed by moving
  the thing in front; this is only fixed by rebuilding to the aperture.
- **"No second doorway anywhere inside the opening" is measurably FALSE** — a pick at `925,450`
  returns `kit:dark` at **13.84 m** against the panel's 14.79. **The critic's grid
  `(930,405,110,165)` began ~5 px right of the jamb and ~10 px below the lintel**, so it sampled
  the panel and never the aperture at all. ⚠️ **A sampling window off by five pixels produced a
  confident, quantitative, entirely wrong finding — at 150 samples.** Confirm the window lands
  where you think it does before trusting any census taken inside it. Two other disputed claims were checked and CONFIRMED: the shaft's pool/leadwork
(0.121/34.5/3.8 reproduced exactly) and the chandelier's sub-pixel-flame arithmetic — though the
critic overturned "the only lever is the camera": **bloom/emissive threshold is an untried lever,
and reframing would sacrifice the room-establishing shot. Do the bloom pass instead.**
New defect: the shaft's window pane blows fully to white viewed directly, so the *stained* glass
shows no colour except through scene grading.


