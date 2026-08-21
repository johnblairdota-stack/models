# Appendix: walls & perf

**Covers:** the draw-call instancing gate, the `game.play` GPU perf fix (AO prepass removal),
and the `perf-ao` / draw-call round write-ups pulled from the old Queue.
**Read when:** your slice touches `src/post/**`, draw-call budgets, `wall.sheet`/wall stage
materials, or anything GPU-timing related (`eo2-calls.mjs`, `perf-*.mjs`).

---

## ✅ THE PRISTINE FACE WEARS ITS ROOM NOW (`pristine-1`, 2026-08-11) — **+5 CALLS, NOT +38 MESHES**

**`wallinstances.js`'s group key gained the room coat, and it cost five draw calls at the worst
parked station.** The campaign carried *"~+38 instanced meshes is the risk"*; the real figure is
**+8 constructed meshes** and **+5 calls**, and seven of twelve stations pay **+0**.

`coatbake-1` measured that **0 of 28 free faces drew their own layer 0** — every pristine dig face
in the house came out of ONE shared `wall.pristine.face`, the damask wallpaper stage — so
`coat-1`'s per-room coat was invisible until a blow landed, and `wall.js`'s own stated defect
(*"a band of damask in a boiserie room gave away the dig band before a blow landed"*) was still
live on the shipped build. **Now 28/28 pristine faces draw their own room's bake on `?coat=1|2`,
and 28/28 still draw the damask on arm 0.**

| `eo2-calls`, seed s4, twelve parked stations | worst station | calls | tris |
|---|---|---|---|
| `?coat=0` (shipped) | `ballroom.centre` | **423** | 605k |
| `?coat=1` | `ballroom.centre` | **428** | 605k |
| `?coat=2` | `ballroom.centre` | **428** | 605k |

Per station the delta is **+3 · +3 · 0 · +3 · +3 · 0 · 0 · 0 · +5 · +5 · 0 · 0** and it is EXACT,
because `_pris1-groups.mjs` computes "face meshes drawing now" and "face meshes that would be
drawing now with the coat in the key" **from one snapshot in one frame** — `dressbin-1`'s
423/461/479 makes a walked TOTAL incomparable but leaves a same-frame DELTA untouched. K2 asserts
the prediction equals what the scene actually draws, at all twelve.

### The three decisions worth arguing with
1. **THE REVEAL IS NOT SPLIT — that is half the saving.** A group is one geometry, one reveal, N
   faces. The reveal box is `room.js`'s shared `mats.reveal` with no coat in it. Splitting the whole
   group would have been **+10** at the worst station instead of +5, and +16 meshes instead of +8.
2. **Arm 0 contributes the EMPTY STRING to the key**, so the shipped arm's mesh set is
   character-for-character what it was, by construction rather than by a lucky coincidence of which
   rooms share a geometry group. Arm 0 reproduces every station to the digit (the one ±2 is
   `service.mid`'s patrolling hunter, which this file already records).
3. **`coatbake-1`'s "an instanced attribute is impossible" does NOT transfer to this population** —
   its argument is that a DAMAGED face needs its own material for the break uniform, and a pristine
   face has no per-face state. But an attribute still needs every room's albedo/normal/ORM in one
   sampler, i.e. its shape (iii): a new bake, +16 MB, and the coat decoupled from the room's wall
   bake. **Against +5 calls, there is nothing for it to win.**

**Cost that is NOT free and must not be lost: programs 231 → 237 on arms 1 and 2** (+6, arm 0
unchanged at 231). That is one new program family × the six light/shadow variants `views/game.js`
warms — the instanced pristine face is now `MeshPhysicalMaterial` (clearcoat) where the damask is
`MeshStandardMaterial`, and `parameters.instancing` is three-owned so it can never share with the
panel's own coat. At `progkey-1`'s ~106 ms/program that is **~0.6 s of cold boot, ARITHMETIC, not
timed.** `?coat=2` costs the same +6 as `?coat=1`.

### Instruments
| file | asks |
|---|---|
| `harness/scenarios/_pris1-groups.mjs` | **what draws each pristine face, by WORLD-MATRIX MATCH**, plus the per-station group delta. K1-K5, W1-W3; **W2 displaces every matrix 1.234 m in Y and must find nothing**, which is what makes "resolved" falsifiable; **K5 presses the real `[C]` key on a live page** and requires 0→1→2→0 to return exactly |
| `harness/scenarios/_pris1-look.mjs` | the frames, both arms, ONE frozen page. Face rect moved **72.8%** (study_w) and **76.2%** (study_e) on a **0%** same-config floor, revert **0%** |
| `harness/scenarios/_pris1-who.mjs` | every hit along the ray in depth order, instances expanded — the occlusion attribution below |

⚠️ **AND IT FOUND A WIDER BLAST RADIUS FOR THE UNOWNED `exterior.dress.mortar` DEFECT.** HANDOFF
records it covering two APERTURES. It also covers **DIG FACES**: `f.gal_svc.0.b` sits behind
`portraits` (d 5.196) and `exterior.dress.mortar.segment#31` (5.292) at its own centre, and
`f.bal_west.0.a` behind `exterior.dress.mortar.segment#38`. **So the coat is correct and invisible
in the gallery and the ballroom** — `_pris1-look.mjs` SKIPs there with the occluders named rather
than ruling on a picture it cannot see. Both studies and the service passage are clean: the
pristine face is the first thing drawn. ~~**Still unowned.**~~

✅ **CLOSED 2026-08-11 (`mortar-1`) — AND `pristine-1`'S OCCLUDER IDENTIFICATION WAS EXACT.**
`harness/scenarios/_mortar1-count.mjs` reproduces **`segment#31` in front of `f.gal_svc.0.b` and
`segment#38` in front of `f.bal_west.0.a`** by instance index, in one page, and inverts them with
the arm. **The count: 10 of 28 dig faces on s4/s1, 6 of 28 on s2/s7/s9** — `Binomial(28,
DRESS_P.mortar = 0.28)`, mean 7.84, each slab across **81.0% of the face rectangle**, 10–26 mm
proud. 🚨 **HANDOFF's TWO-APERTURE LINE IS STALE: 0 of 14 apertures on all five seeds**, because
`dressingRule` (the chained-and-boarded rule) already sets `mortar: false` on every connector —
and that zero is a fact about the BUILD, not the probe: `setDressRule(false)` brings **6 apertures
+ 2 interior connectors** straight back in the same page. **Fix: the mortar patch is off the dig
band** (`exterior.js`, `?segmortar=1` reverts, `setSegmentMortar()` flips in place) — **−1 draw
call at 6 of 6 stations**, three paired flips each, medians, agreeing with the module's own
deterministic `dressCalls`. `eo2-calls` worst station **423 → 422**. Frames:
`_mortar1-look.mjs` 15/0, the face rect moving **3 794 px>16 (gallery)** and **6 853 (ballroom)**
against **0** same-config floors, revert 99/22.
⚠️ **A CONTRADICTION THAT DISSOLVED ON TIMESTAMPS, RECORDED SO IT IS NOT RE-OPENED:**
`critic-pristine-1` re-ran `_pris1-who.mjs` and found **no mortar anywhere in the hit list** and
`_pris1-look.mjs` at **17/0/0** with the gallery face moving 33.515% instead of SKIPping. Its
frames are timestamped **21:48:45**; `src/game/exterior.js` was written at **21:33:39**. **It
measured the fixed tree, and its clean result is this fix.**

---

## ✅ THE DRAW-CALL GATE IS OPEN ON ALL THREE ARMS (`calls-1`, 2026-08-09) — AND IT WAS NEVER THE BALLROOM

**841 / 722 / 682 → 599 / 480 / 426 against 625.** `eo2-calls.mjs` passes on `legacy`, `occlude`
and `instanced` for the first time since the estate port.

### 🚨 THE ATTRIBUTION, AND IT OVERTURNS THIS FILE'S OWN STATED CAUSE

This appendix, HANDOFF and two agents' notes all named the **ported 9.6 m ballroom** as the
overrun. It is not, and it never was. **The ballroom prices out at 20 draw calls.**

The whole of it is **the six world gadget pickups**, which are parented to the SCENE and were
therefore outside residency entirely — the only thing removing them was the view frustum, and
from the middle of a 36 m house that removes almost nothing.

Measured per draw call at `ballroom.south`, seed s4, `?walls=instanced`, 689 calls total:

| owner | main | shadow | **total** | distinct material names | where it is lying |
|---|---|---|---|---|---|
| `pickup.oil` | 148 | 57 | **205** | 15 | the SERVICE PASSAGE, 21 m and two rooms away |
| `pickup.ball` | 68 | 66 | **134** | 4 | the GALLERY, 34 m away |
| `pickup.skates` | 90 | 0 | **90** | 16 | the ballroom — genuinely present |
| `pickup.nailgun` | 39 | 30 | **69** | 11 | the GALLERY |
| `hunter` | 7 | 35 | 42 | 5 | — |
| `player.p1` | 39 | 0 | 39 | 7 | — |
| `pickup.grapple` | 39 | 0 | **39** | 3 | the CHAPEL |
| **`ballroom` — the whole ported estate room** | **14** | **6** | **20** | 8 | — |
| `pickup.sledgehammer` | 9 | 9 | **18** | 5 | STUDY_W |
| the post chain | 16 | 0 | 16 | 1 | — |
| `exterior` | 8 | 0 | 8 | 4 | — |
| `room` (the wall instances) | 8 | 0 | 8 | 2 | — |

**Six pickups = 555 of 689 calls (81%).** Every ROOM in the house, estate order and all, is
**10–21 calls**: gallery 21 · ballroom 20 · study_w 18 · chapel 15 · study_e 12 · service 10.
`GeoBin` is doing exactly what `room.js`'s key tables claim.

🎯 **AND THAT IS THIS FILE'S OWN RULE READ THE RIGHT WAY ROUND — THE UNIT IS THE MESH, AND
"MATERIAL KEYS" IS SHORTHAND FOR "GeoBin MERGES A BUCKET INTO ONE MESH".** Read the two columns
together: `pickup.ball` has **4** material names and still costs **134 calls**, because it is
**133 separate (object, material) draws**. A gadget is merged into nothing — the four dumped in
full are **44 to 161 separate sub-meshes** (oil 161, ball 133, nailgun 67, skates 44) — because
they are built for the `gadget.*` studio cyc where one prop fills the frame. HANDOFF's standing
warning, *"the skate drift trail cost +82 calls for 76 sprites"*, is this defect at a sixth of
the size. **Few material names does not mean cheap. Few MESHES does.**

### THE INSTRUMENT: `harness/scenarios/_calls1-who.mjs`, and it needs no ablation
It wraps `WebGLRenderer.renderBufferDirect`, which **IS** the draw call — every
`info.render.calls++` goes through it, shadow passes included, and the object, material and
camera are all in the argument list. So the table sums to `renderer.info.render.calls` by
construction rather than by hiding a subsystem and subtracting. Shadow draws are told apart by
`scene === null` (three r180 passes null there and nothing else does), and the tally is
snapshotted on the engine's own `info.reset()` — which is HANDOFF's un-reset-counter hazard
answered rather than dodged, and makes each reading exactly one frame.
⚠️ **It asks the counter instead of predicting it, and it had to.** Three code paths reach
`renderBufferDirect` and issue nothing — notably `renderInstances` returning on `primcount === 0`
**before** `info.update()`. Predicting them read the hook exactly ONE high at nine of twelve
stations. Reading `info.render.calls` either side of the real call is exact and cannot drift.

### THE FIX: LOOSE OBJECTS JOIN RESIDENCY (`room.js`, two wiring lines in `views/game.js`)
Residency switches off every room you cannot see. It governed the house and **not one thing
standing in it**. `room.trackLoose(obj, isLoose)` registers anything scene-parented that belongs
to a ROOM rather than to the frame, and `setViewpoints` gates it in the same instant it gates
the panels. `views/game.js` wires it off `LimbField`'s existing `onDrop`/`onTake`, which are the
only ways an item enters and leaves the loose pool.

- **Not the player and not the hunter.** They are scene-parented for the same reason and are
  exactly what `views/game.js`'s residency note says must keep drawing.
- **The test is "ANY space that could contain it is resident"**, the same conservatism a panel
  gets (`a.visible || b.visible`), so an item in a doorway is never popped. An item in NO space
  is outside the house and is left alone.
- 🚨 **An entry carries a liveness predicate and without it this is a bug waiting for a kill.**
  `hunter-ai.js` `absorb()` reparents a limb onto the hunter and sets `held`/`attachedTo` **but
  never calls `field.take()`** — so the item stays registered while `root.position` quietly
  becomes hunter-LOCAL. An unguarded cull would test a torso-relative offset against the floor
  plan and could blank the limb during the pull-in the hunter's own header says the audience has
  to see. `() => it.inWorld` is the predicate; found by reading, not by a failing test.
- **`?loose=0` is a complete revert** and `room.setLooseCull()` flips it inside one frozen page,
  so the look A/B never compares two page loads.

| `eo2-calls.mjs`, seed s4, twelve parked stations | before (worst) | after (worst) |
|---|---|---|
| `?walls=legacy` | **841** `ballroom.centre` | **599** `ballroom.centre` |
| `?walls=occlude` | **722** `ballroom.centre` | **480** `ballroom.centre` |
| `?walls=instanced` (shipped) | **682** `ballroom.south` | **426** `ballroom.centre` |

Every station fell: `service.mid` 554 → 339 · `study_e.south` 483 → 84 · `ballroom.south`
682 → 217 · `ballroom.centre` 668 → 426. Triangles are untouched (598–670k of 900k) — this
removes draw calls, not geometry.
⚠️ The legacy and occlude BEFORE figures reproduce this appendix's recorded 841 and 722 **to the
digit**, so the arms were trustworthy instruments for the comparison.
⚠️ **The legacy and occlude AFTER figures were taken on the first (holder-hiding) build**, which
this round then replaced with the meshes-only one for the light-count reason below. They stand
because the two builds hide **the same draw set** — the instanced arm was re-measured on both and
came back at **426 either way**, station for station.

### THE LOOK A/B — 4 of 5 STATIONS BYTE-IDENTICAL, and the residual is the bug, not the fix
`harness/scenarios/_calls1-look.mjs`, one frozen page, three frames per station (ON, ON, OFF).
⚠️ **Freezing is not enough — you must kill the grain**, exactly as HANDOFF says. The first build
froze the sim and still measured a same-config floor of **22–42% of pixels**, loose enough to
hide a whole gadget. With `grade.grain = 0` and `pipeline.deterministic = true` the floor is
**0% — byte-identical** at every station, and then:

| station | items hidden | calls OFF → ON | pixels differing >16 levels |
|---|---|---|---|
| `ballroom.centre` | 3/6 | 634 → 392 (**−242**) | **0** |
| `service.mid` | 5/6 | 559 → 340 (**−219**) | **0** |
| `study_e.south` | 6/6 | 483 → 84 (**−399**) | **0** |
| `gallery.east` | 4/6 | 239 → 191 (**−48**) | **0** |
| `ballroom.south` | 5/6 | 648 → 183 (**−465**) | 126 (0.014% of the frame) |

**Four of five stations are byte-identical while hiding up to six items and saving up to 465
calls.** The residual at `ballroom.south` is attributed by revealing ONE item at a time inside
the same frozen frame: **`pickup.oil` owns it and grapple, nailgun and sledgehammer contribute
literally nothing**, and **84% of those pixels are unlit once it is hidden**. It is the oil can's
pilot flame in the **black D5 doorway** — `service` is 13.65 m away, past `PORTAL_VIS_DIST`, so
its floor, walls and ceiling are not drawn at all. Cropped and looked at: a small orange smudge
inside a black arch with no room behind it. The probe PASSES the identical stations and **SKIPs**
that one rather than ruling on a picture, with both frames on disk
(`progress/playtest/game.play.calls1-look-ballroom_south-cull{ON,OFF}.png`).

🚨 **AND THIS IS THE MEASUREMENT THAT CAUGHT THE LIGHT BUG BEFORE THE LIGHT PROBE DID.** On the
first (holder-hiding) build the same station read **2166 px, attributed to `pickup.oil` AND
`pickup.nailgun` — overlapping, same origin, same means** — and `gallery.east` read **identical**
figures for `pickup.oil` and `pickup.skates`. **No silhouette can do that**: the nail gun is 34 m
away behind three rooms. Two objects in two different rooms producing the same pixels is the
fingerprint of a GLOBAL effect, and it was the point-light count. On the meshes-only build both
collapse to zero. **Read a per-item attribution table for impossible rows, not just for big ones.**

🎯 **A BOUNDING BOX IS THE WRONG INSTRUMENT AND COST A ROUND HERE.** Two stray pixels at opposite
corners turn a 44x21 region into 415x366, and the statistic then describes the room instead of
the change — it read "6.6% unlit" on a change entirely inside a black doorway. **Walk the
differing pixels themselves.**

### ✅ AND THE HOLE HANDOFF NAMED AS UNMEASURED IS CLOSED: THE HOUSE WITH ITS FACES DUG
`digcover-1`'s "+6 calls for five new dig edges" was honest and is not the answer to this
question: a **pristine** face joins an instance group that already exists, and `wall.js`
`pristine` goes false the moment `field.hits.length` is non-zero, so **one blow de-instances a
face** and it draws its own five meshes for the rest of the round.

⚠️ **ONE BLOW PER FACE IS THE WHOLE DRIVE, DELIBERATELY.** De-instancing is a boolean; 63 blows
would take twenty minutes and measure the same number, and would fire `onBreak` two thousand
times — and `dig-promoted.mjs` already records that debris and dust are SCENE-parented, so they
add calls at stations that cannot see a segment. `onBreak` is suppressed for that reason.

| `harness/scenarios/_calls1-dug.mjs`, one page, `?walls=instanced`, seed s4 | worst station | calls | tris |
|---|---|---|---|
| pristine | `ballroom.centre` | **426** | 619k |
| all 8 BALLROOM faces (`bal_west` + `bal_east`) dug | `ballroom.centre` | **517** (+91) | 693k |
| **all 28 free faces in the house dug** | `ballroom.centre` | **601** (+175) | 692k |

**Both inside 625.** Panel own-meshes drawn at `ballroom.centre` go **0 → 115**.
🚨 **On the pre-`calls-1` build the fully-dug state would have been ~857** — 682 + 175, which is
ARITHMETIC and not a measurement, stated as such: the dug sweep was only ever run on the fixed
build. The point stands either way — **the dig had a loaded gun pointed at the budget and no
round had fired it**, and the honest form of `digcover-1`'s "+6" is "+6 pristine, +175 dug".
⚠️ Like the legacy/occlude figures, this sweep was taken on the first (holder-hiding) build; the
two builds hide the same draw set and the instanced arm re-measured at 426 on both.

### 🚨 IT HIDES THE MESHES AND LEAVES THE LIGHTS, AND THE FIRST BUILD DID NOT — 52 SHADER COMPILES
**The world pickups carry their own `PointLight`s** (`gadgets/index.js`: the nail gun's pilot at
0.5·H, the ball's at 1.0·H). Before this change all six were permanently visible, so their
contribution to `numPointLights` was a **constant**. The obvious one-line fix — `holder.visible =
false` — takes the light out with the meshes, because three collects lights with
`traverseVisible`. `views/game.js` says in capitals what that costs: *"a count the renderer has
never compiled for RECOMPILES EVERY VISIBLE MATERIAL"*, priced by `perf-stall-1` at **+132
programs** and named in HANDOFF as **John's five-second freeze**.

`harness/scenarios/_calls1-lights.mjs`, twelve stations, no flips, `info.programs.length` end to end:

| build | point-light counts met | programs over the walk |
|---|---|---|
| `?loose=0` (pre-change) | 13, 14 | 213 → 213, **+0** |
| **hiding the HOLDER (first build)** | 6, 8, 9, 10 | 232 → 284, **+52** |
| **hiding only the MESHES (shipped)** | **13, 14** | **213 → 213, +0** |

The shipped cull sets `visible` on an item's drawn descendants only — every draw call and every
shadow draw goes (`projectObject` skips an invisible object for both lists) and the light array
is bit-for-bit what it was. The descendant list is built once in `trackLoose`, and written only
on a state CHANGE. **It matches the pre-change build's program behaviour exactly and keeps the
whole saving**: same walk, `ballroom.centre` 426 · `ballroom.north` 423 · `service.mid` 339 ·
`study_e.south` 84.

🚨 **AND THE OBVIOUS PROBE SAID IT WAS FINE — THIS IS A NEW INSTRUMENT HAZARD, NOT A NEAR MISS.**
The first version flipped the cull at each settled station and read the counter either side. It
reported **"identical at all twelve"** (248/248 · 251/251 · … ) and PASSED, while the build it was
testing was compiling 52 programs. The reason is structural: residency had already paid the
arrival compile before the probe's first read, and flipping back only ever revisited counts that
were already built. **A flip A/B at a settled station is blind by construction to a cost paid on
ARRIVAL.** The form that sees it is two no-flip walks — the change and its own `?loose=0` revert —
compared on total program growth. ⚠️ Generalise it: *if the thing you changed is triggered by
motion, an A/B taken standing still cannot measure it.*

### Contracts
`npm run build` ✓ · `lint-glsl` ✓ after each edit (382 files) · `mechanics` **11/11** — including
*"the player's own room is always rendered"* (6 positions) and *"the world never empties while
walking"*, which are the two assertions this change could most plausibly have broken ·
`escape` **20/20** (`seed=s4`) · `dig-free` **15/15** (`seed=s4&dig=1`) · `sledge-check` **13/13**
— it walks to the world sledgehammer, presses E, equips, stows and redraws, i.e. it is the live
test that `untrackLoose` puts `visible` back · `dig-cover` **6/0** (`seed=s4&dig=1`, 5/5 sites
breached and photographed).
⚠️ **`_progkey1-independence` was NOT re-run and that is a gap, not a claim.** It tests per-panel
break independence through `wall.js`'s cache keys, which this change cannot reach — but "cannot
reach" is an argument, and this file's own rule is that an argument is not a measurement.
⚠️ **`dig-band`'s 4 failures are untouched and not adopted** (3 `digparity-1`'s open bug, 1 the
chapel's named floor-plan shortfall).

### The instruments this round left behind
| file | asks |
|---|---|
| `harness/scenarios/_calls1-who.mjs` | **who owns every draw call**, per object / material / pass, exact by construction |
| `harness/scenarios/_calls1-dug.mjs` | the worst case with the dig faces actually DUG |
| `harness/scenarios/_calls1-look.mjs` | does the cull delete anything on screen, one frozen page, per-item attribution |
| `harness/scenarios/_calls1-lights.mjs` | does it move `numPointLights` and compile shaders mid-play (`FLIP=0` for the sound form) |

### ⚠️ WHAT IS STILL LOADED, AND IT IS THE NEXT SLICE
**A single gadget is 39–205 draw calls, more than the entire six-room mansion.** Residency now
hides five of the six, but nothing stops a player carrying two into one room: `oil` (185) +
`ball` (134) + player (74) + hunter (42) + a room (20) + post (16) is already ~471 of 625 in one
space, legitimately. The cause is that `src/gadgets/index.js` builds each prop as dozens of
individually-materialled sub-meshes for a studio view where one prop fills the frame; a
`GeoBin`-style merge per material would take each gadget to a handful. **It is a real slice with
a real risk** — `gadget.*` are scored showcase pieces and the animated sub-parts (`oilJet`,
`pilotFlameGroup`, `jetFlame`) cannot merge — so it was reported rather than attempted here.

---

## ✅ THE EXIT-SITE BLACK APERTURES (`aperture-1`, 2026-08-09) — A ONE-SIDED FILL FOR A TWO-SIDED HOLE

**Attribution: NOT the instancing path.** `?walls=legacy` was the one-run test and the hole is
identical on it — `x.ballroom.terrace_e` read aperture luma **71.2 instanced vs 70.5 legacy** at
the first station, and the two frames are the same picture with the same black rectangle in it
(`progress/playtest/game.play.ap1-x_ballroom_terrace_e-{instanced,legacy}.png`).

**Mechanism, in one sentence: `wall.js` built all four layer planes `FrontSide` facing local +Z,
and a connector's `rotY` encodes THE WALL'S AXIS rather than a facing — so on the house's +x and
+z walls every plane was backface-culled from the only room that can look at it, and the aperture
drew nothing at all.** `x.study_w.servants` and `x.ballroom.terrace_e` are both authored
`rotY: PI/2` in `spaces.js`; one faces into its room and the other faces out of the house.

**Fix:** the scalar arm's four layer materials (`wall.js`, gated `if (!this.field)`), the shared
instanced pristine face and the shared spent set (`wallinstances.js`) are `THREE.DoubleSide`.
🚨 **Both files were required and neither is sufficient.** Every exit site is CHAINED or
untouched, i.e. `pristine`, so its own five meshes are off and `wallinstances.js`'s single
`wall.pristine.face` is the only thing standing in the opening — fixing `wall.js` alone would
have filled the hole on `?walls=legacy` and left it empty on the shipped arm.
⚠️ **The dig is deliberately NOT double-sided.** A free face is half of a wall band by
construction (`dig.js` builds one face per side, each already turned to face its own room), so it
has no blind side; double-siding it would put the far face's layer planes inside the near face's
crater, which is the break edge and `game.play` PASS 76.

| `x.ballroom.terrace_e`, seed s4, from the ballroom | aperture mean luma | **fraction of the rect under luma 20** | lit wall beside it |
|---|---|---|---|
| before (`FrontSide`) | **4.3** | **99.7%** | 166.1 / 0.4% |
| after (`DoubleSide`) | **25.1** | **39.2%** | 166.8 / 0.3% |

Both arms in **one frozen page** (`harness/scenarios/_ap1-sided.mjs`, live `material.side` flip):
same-config floor **0.19 pp**, and the WALL control moved **0.08 pp**. Captures:
`progress/playtest/game.play.ap1-sided-{before-frontside,after-doubleside}.png`, and the shipped
build at `game.play.ap1-fixed-x_ballroom_terrace_e.png`.

🎯 **THE STATISTIC IS THE UNLIT FRACTION, NOT THE MEAN, AND THAT IS WHY THIS WAS FILED TWICE UNDER
WRONG NAMES.** An unfilled aperture is not "a bit darker" — it is 99.7% black. The first station
tried here put the third-person robot in front of the hole and the rect mean read **71.2**, i.e.
"fine". Look at a picture, and gate on the fraction.

**Blast radius, by arithmetic rather than by eye** (`_ap1-sided.mjs` walks every panel and asks
`sideOf(room centre)`): **fourteen scalar panels had a room on their back side** — six exit sites
(`x.ballroom.{orangery,terrace_e,south_w}`, `x.gallery.east`, `x.study_e.{icehouse,stair}`) and
**eight interior breachables** (`p.svc_w.n/s`, `p.svc_e.n/s`, `p.gal_w/e`, `p.bal_w`, `p.chapel`),
which from their blind room read as an OPEN DOORWAY into the next room rather than as a wall.
The other 36 are the free faces, and each of those is covered by its twin. All fourteen are fixed.

⚠️ **TWO SITES ARE STILL DARK AND IT IS A DIFFERENT OBJECT — `exterior.dress.mortar`, NOT THIS.**
`x.ballroom.orangery` (luma 6.3) and `x.gallery.east` (11.6) have their wall face in the draw set
at 3/3 sample points; what covers it is `exterior.js`'s mortar patch — a deliberate opaque slab
across 92% x 88% of the aperture, 8 mm proud, drawn on BOTH faces, 0.18 m in front of the panel.
It is the `plaster`-lock tell and it is doing its job, but at luma 6.3 against a wall at 35.4 it
reads as the same black rectangle. **Isolated, owned by `exterior.js`, filed separately.**

### 🚨 THE INSTRUMENT THAT SAID "MISS", AND WHY IT SAID IT
`harness/evidence/_tmp_geoprobe.mjs --pick` is what HANDOFF names as the tool that settles occlusion, and
it is **blind to this whole defect in two independent ways**:
1. It intersects `geometry.attributes.position` through `m.matrixWorld` — and an `InstancedMesh`'s
   `matrixWorld` is its PARENT's, with every copy it draws living in `instanceMatrix`. So every
   pristine wall face in the house is invisible to it **by construction**. That is the MISS.
2. **A raycast does not cull.** On `?walls=legacy` it happily returns
   `x.ballroom.terrace_e.layer3` at those pixels — a mesh the GPU threw away — so the probe reads
   "present" for the exact geometry that is not reaching the screen.
**`harness/scenarios/_ap1-who.mjs` is the version that answers the question**: it expands
instances, tags each hit FRONT/BACK against the material's own `side`, marks it DRAWN or dropped,
and prints **every** hit in depth order rather than the nearest one — which is what named the
mortar slab. A single nearest-hit answer cannot tell "nothing draws here" from "something black
draws here".

### Contracts
`npm run build` ✓ · `lint-glsl` ✓ after each edit · `mechanics` **11/11** · `escape` **20/20**
(`seed=s4`) · `dig-free` **15/15** (`seed=s4&dig=1`) · `sledge-check` **13/13** ·
`_progkey1-independence` **9/9 on all three of `dig=1`, default and `dig=0`**.
⚠️ **`--q "seed=s4"` NO LONGER SELECTS THE SCALAR ARM in that scenario** — the dig is on by
default, free faces exist, and its picker scores dig pairs first (`a.dig ? 0 : 1000`), so both
"arms" chose `f.gal_east.0.a`. **Pass `--q "seed=s4&dig=0"` to actually reach the scalar arm**,
which is the arm this change touches: 9/9, dug `p.svc_w.n` **88.94%** of its rect against a
neighbour at **0.64%** on a **2.09%** floor.

**DRAW-CALL DELTA: ZERO, MEASURED** (`harness/scenarios/_ap1-calls.mjs`). Culling is a per-PRIMITIVE
test, so the same meshes are submitted either way — but re-measured rather than argued, by flipping
`side` back to `FrontSide` in ONE page at five stations (which is a complete revert of this change
and of nothing else): **ballroom.south 380/380, ballroom.centre 455/455, ballroom.north 432/432,
service.mid 575/575, study_e.south 308/308**, worst |delta| **0** on a **0**-call same-arm repeat
spread. Triangles move by 2 at one station and 0 at the rest.
⚠️ **The pre-existing overrun is untouched and NOT adopted:** `eo2-calls` worst station reads
**682 (ballroom.south) on `instanced`** and **841 (ballroom.centre) on `legacy`** — the legacy
figure reproduces this appendix's recorded 841 **to the digit**. `dig-toggle` not re-run; both were
already red.
All three arms still boot from the query string and still separate — at one fixed station, own
layer meshes drawn **legacy 40 > occlude 19 > instanced 5**, and all three fill the aperture.


## ✅ THE PROGRAM-KEY COLLAPSE (`progkey-1`, 2026-08-09) — 1077 PROGRAMS → 213, COLD BOOT 199.7 s → ~99 s

**`wall.js` pinned `customProgramCacheKey` PER PANEL PER LAYER, and that one field was 4.08× of
every shader compile in the loading screen.** All three pins are now per-ARM constants:
`rrr-wall|dig`, `rrr-wall|stage`, `rrr-wall|barrier` (`wall.js` ×2, `wallinstances.js` ×2).

| `quality=high`, seed s4, 1280x720, RTX 3060 Ti | programs | distinct GLSL source pairs | redundancy | redundant compiles |
|---|---|---|---|---|
| before | **1077** | 264 | **4.08×** | 813 of 1077 |
| after | **213** | 180 | **1.18×** | 33 of 213 |

| time to `ready` (`harness/evidence/_boot1-cache.mjs --fresh --loads 2`) | cold | warm (driver program cache) |
|---|---|---|
| before | **199.7 s** | 39.0 s |
| after | **98.9 s and 121.5 s** (two independent cold runs) | **4.5 s and 13.1 s** |

⚠️ **THE SPREAD IS REPORTED RATHER THAN A MEAN, DELIBERATELY.** Two other agents were live for
part of this session and `exterior-1` measured playtest timeouts caused purely by concurrency.
The before-figure is ONE cold run; the after-figure is two, 22.6 s apart. The bands do not
overlap and the three `playtest` ready times agree (before 162.3 / >180 / 199.7 s; after 90.4 /
98.9 / 111.0 / 121.5 s), but **do not quote 98.9 s as a precision figure.** The PROGRAM COUNT is
the deterministic number: 1074→1077 on both before runs, 210→213 on all four after runs.

The per-material name histogram is where the shape of it is clearest — `_boot1-census.mjs`:
`ws.plaster` **348 → 6**, `ws.paper` **132 → 6**, `ws.lath` **132 → 6**, `ws.beam` **132 → 6**,
`est-bois` **72 → 6**, the twelve barriers **72 → 6**. 348 is 58 wall materials (22 scalar panels
+ 12 dig faces × 3 shell layers) × the 6 light/shadow variants; 6 is the variants alone.

### 🚨 The key WAS defending a real three.js trap. Here is exactly why it is obsolete
`acquireProgram` hands a matching cache key the pre-existing program and **throws away the second
material's `onBeforeCompile` output** — genuinely dangerous when two materials' sources differ.
Two facts retire it:
1. **Uniform VALUES are never shared.** `WebGLRenderer.getProgram()` keys its program map on
   `properties.get(material)`, so a material that has not been drawn always runs
   `parameters.uniforms = getUniforms(material)` → its own `onBeforeCompile` →
   `materialProperties.uniforms = parameters.uniforms`, even on a global cache hit
   (`WebGLRenderer.js` ~2082-2091). Only the compiled SOURCE is shared.
2. **The one thing that changes wall GLSL is already ahead of the custom key.**
   `applyBreakMask` emits exactly two source bodies, selected by `opts.damage`; every other knob
   in `BREAK_CFG`, `DIG_BAND_LOOK`, `DAMAGE_BANDS` and the round 6-10 section work is a uniform.
   That discriminator sits in `material.defines.RRR_BREAK_DAMAGE`, and `getProgramCacheKey`
   hashes `defines` at ~line 392 and `customProgramCacheKey` **last**, at ~line 411.

⚠️ **`wall.js`'s old comment — "only the first material's break uniform is ever bound" — was
wrong, and the sheet already disproved it.** `views/wall-sheet.js` has never called
`pinProgramKey`; its five stage columns' materials therefore already shared programs, and
`wall.sheet` has rendered five distinct break states through **PASS 78**. ⚠️ `wall.sheet` is
also the reason no before/after diff of it is offered: it imports `breakmask.js` directly and
imports neither `wall.js` nor `wallinstances.js`, so this change **cannot reach it**. It was
re-shot and renders correctly.

### 🚨 THE RE-VERIFICATION `boot-1` DEMANDED: panels still break independently, in PIXELS
`harness/scenarios/_progkey1-independence.mjs`. It picks a coplanar neighbouring pair off the
scene (never by name), parks head-on at each panel's own station, takes **three frames per panel
— A, A′ and B — so every reading has its own same-config noise floor**, digs exactly ONE panel
through the real brush, and diffs each panel inside its own projected rectangle.

| arm | dug panel | its rect moved | neighbour | its rect moved | neighbour's own floor |
|---|---|---|---|---|---|
| damage (`?dig=1`) | `f.svc_w.1.a` | **96.78%** (mean Δ 89.2) | `f.svc_w.2.a` | **0.23%** | 0.44% |
| scalar (`?dig=0`) | `p.svc_w.n` | **88.80%** (mean Δ 55.3) | `p.svc_w.s` | **0.69%** | 1.08% |

**The neighbour is BELOW its own noise floor in both arms**, and its state is untouched to the
digit (breaks `[0,0,0,0,0]`, depth 0, stage 0, layers `0000`). Captures:
`progress/playtest/game.play.progkey-{target,neighbour}-{before,after}.png`.

⚠️ **THE FIRST BUILD OF THAT SCENARIO PASSED THE NEIGHBOUR CHECK AND THE PASS WAS WORTH NOTHING**
— worth recording, because it is this project's dominant instrument failure in a new costume. It
framed both faces at once by backing the camera off the midpoint, which for two 5.7 m service
faces 6.2 m apart is 8.8 m; the service passage is not 8.8 m wide, so the camera sat in a
non-resident space and the projected rectangles landed on unrelated geometry. **The DUG panel's
own rect moved 2.33% against a 2.55% floor** — the instrument could not see a body-sized breach,
so it could not have seen a leak either. "The target must move" is now an assertion, not an
assumption.

### What this does NOT fix, measured rather than assumed
⚠️ **`numPointLights` is the next multiplier and it is NOT collapsible from these files.** It
still takes four values in the render list (12/13/14/15, `_boot1-census.mjs` field[40], ×1.91
before / ×1.13 after) — but unlike the custom key it **genuinely changes the emitted GLSL**,
because `WebGLProgram` substitutes `NUM_POINT_LIGHTS` into the source. Those are real distinct
shaders, already counted in the 180 distinct source pairs. `views/game.js` warms all four **on
purpose**: `perf-stall-1` measured one un-warmed frame at a new count costing +132 programs, and
that is John's five-second freeze. Removing the multiplier means keeping the gadget and flare
lights permanently resident at zero intensity (`harness/scenarios/_price-pointlight.mjs`), which
is a lighting/gadget change, not a cache-key one. **`boot-1`'s projected 154 keys assumed this
field was free. It is not.**

The 33 redundant compiles that remain are **not** wall materials — the worst groups are
`exterior.seam`, `pilotCone0Mat` and unnamed materials differing in light-count fields whose
values happen not to reach their source. No `rrr-wall` group appears in the top ten any more.

### Contracts
`npm run build` ✓ · `lint-glsl` ✓ after each edit · `mechanics` **11/11** · `escape` **20/20**
(`seed=s4`) · `dig-free` **15/15** · `sledge-check` **13/13** · independence **9/9 on both arms**.
`?walls=legacy|occlude|instanced` all still boot and still separate as this file documents —
worst-station calls **841 / 722 / 676**, `service.mid` **596 / 567 / lower**.
⚠️ **Two PRE-EXISTING failures were found and are NOT this change** (a cache-key string cannot
move a draw call or a collider; both reproduce with `estate=off`):
- `eo2-calls.mjs` fails its budget on **every** wall arm — worst station is now `ballroom.centre`
  / `ballroom.south` at **676–841 against 625**, with ~597–669k triangles. That is the ported
  9.6 m ballroom, and the draw-call gate this appendix opened is **shut again**.
- `dig-toggle.mjs` 13/1: turning `dig=bays` on adds colliders to rooms with no dig edge
  (gallery 20→46, ballroom 26→46, chapel 10→15).


## 🧱 THE DRAW-CALL GATE IS OPEN (instancing-1, 2026-08-05). `game.play` BUILDING, UNSCORED.

**`docs/PLAN.md` Phase 1 is done.** Panel draw cost no longer scales with the number of panels,
so `dig.md`'s forty segments and `playable-estate.md`'s props have somewhere to go.

```bash
node harness/playtest.mjs --view game.play --script harness/scenarios/eo2-calls.mjs   --port 5222 --q "seed=s4[&walls=legacy|occlude|instanced]"
node harness/playtest.mjs --view game.play --script harness/scenarios/inst-census.mjs --port 5224 --q "seed=s4&walls=legacy"     # who owns the calls
node harness/playtest.mjs --view game.play --script harness/scenarios/inst-verify.mjs --port 5231 --q "seed=s4" --shots          # look A/B, promotion, seeds
node harness/playtest.mjs --view game.play --script harness/scenarios/inst-stages.mjs --port 5236 --q "seed=s4" --shots          # the occlusion rule, per stage
```

### 🚨 THE NUMBER IN THIS FILE AND IN `dig.md` WAS WRONG AND IT WAS WRONG IN THE DANGEROUS DIRECTION
**"614–617 of 625, about eight spare" is stale. Re-measured on the twelve parked stations before
touching anything: `service.mid` reads 625 and 627 on two runs — ON the line and OVER it.** The
budget was not nearly spent, it was spent, and `eo2-calls.mjs` was already FAILING its own
assertion on one run in two. (The ±2 is still the patrolling hunter; every other station
reproduced to the digit across runs, so `service.mid` is the only one that moves.)

**After: 580 and 586, two runs. Headroom 0 → 39–45 calls at the worst parked station**, and the
gate assertion passes on both arms of every run taken since.

| `service.mid`, seed s4 | legacy | occlude only | instanced |
|---|---|---|---|
| worst-station calls | **625 / 627** | 601 | **580 / 586** |
| calls owned by wall panels (ablation) | **51** | — | **6** |
| panel meshes drawn there | 55 | 22 | 4 |

Every other station moved with it: ballroom.centre 574 → 537–552, study_e.south 524 → 492,
gallery.east 438 → 421–422, study_w.south 223 → 189–191.

### It is two changes, priced separately, and the second is the one that matters for `dig`

1. **A LAYER NOTHING CAN SEE IS NOT DRAWN** (`src/game/wall.js`). The four layer planes have
   identical extents, are parallel, are all `FrontSide`, and sit 14–52 mm apart. A camera that can
   see any of them is on the front side, and under perspective a parallel plane of equal extent at
   greater depth projects **strictly inside** the nearer one's quad. So a layer whose break amount
   is exactly 0 — `discard` is unreachable, the test is `_order < uBreak` with `_order >= 0` — is an
   opaque depth-writing occluder for everything behind it. **An undamaged panel was drawing four
   planes to show one.** Layer planes drawn at `service.mid`, measured per stage: **stage 0
   11 vs 44 · stage 1 22 · stage 2 33 · stages 3 and 4 44 (nothing dropped).** ~24 calls.
2. **INSTANCING** (`src/game/wallinstances.js`). The two survivors — the stage-0 face and the
   reveal box — are drawn for every PRISTINE panel from one shared `InstancedMesh` pair. ~15 calls
   today, and **it is the half that makes the cost O(1)**: measured across twelve stations carrying
   **2 to 15 panels on screen, panel cost is a flat 4–9 calls** where it was 10–51 and tracked the
   count. Forty pristine segments in one room is the same 4 calls.

⚠️ **PROMOTION IS FIVE `visible` FLAGS AND ONE MATRIX — NO GEOMETRY IS CREATED OR DESTROYED, EVER.**
The layered stack is still built once at construction. **The "geometry never changes after
construction" invariant is intact, deliberately**: an allocating promotion would pay the first-draw
GPU upload this file measured at **33 ms with `dtex 1`** on the frame a wall is first hit, which is
the worst frame in the run to stall. It is also free because `views/game.js`'s warm-up opens with
`scene.traverse(o => o.visible = true)`, so every layer plane's program and buffers are still built
during the loading screen exactly as before.
**Measured on the promotion frame specifically** (one point of damage, no stage crossed, so nothing
else fires): **14.40 ms against a surrounding median of 16.70 and max of 19.50 — below the frames
either side — with `dtex 0 · dgeo 0 · dprog 0`.**

⚠️ **SEED-INDEPENDENT BY CONSTRUCTION, AND THE PROOF IS A RE-PLAN SWEEP, NOT A CAPTURE.** The
grouping key is the **authored aperture** (`aperture()`, which `connectors.js` states is not a
function of the run state), so the mesh count is `2 x (distinct apertures)` = **4, fixed at
construction**. 128 real re-plans (`run.reset(seed)` + `resetRound()`) produced **38 distinct (site,
lock) outcomes and ONE geometry signature: `2 groups | 22 slots | 2.0800x2.6800x0.3000,
3.2000x3.4000x0.3000`.** The only seed-dependent draw cost left is that a `plaster` or `beams` lock
starts its own site above stage 0: **0 or 1 non-pristine panels at round start, i.e. ≤5 calls, on
one panel.** This is the failure `exterior.js`'s dressing note warns cannot be found by one capture.

⚠️ **AND GROUPING BY APERTURE IS WHY THERE IS NO VISUAL TRADE TO STATE.** The obvious version
authors one geometry at the default aperture and scales per instance — that is what the connector
dressing does, and it stretches the orangery's hardware 1.54x. Here each group's plane and reveal
box are built at that group's own dimensions with the **same `revealGeometry()` `wall.js` uses**, so
an instance is the same geometry, same material, same transform.

### The look A/B, and it carries its own null control

⚠️ **IT CANNOT BE DONE ACROSS TWO PAGE LOADS** — this file already records that two browser runs
diverge in pose and glow with position and yaw pinned, and that `game.play`'s grain makes two
ADJACENT SAME-MODE frames differ as much as any A/B. So: `engine.freezeAt = engine.elapsed`
(**`_step` honours it in the LIVE loop too** — updaters stop, `uTime` stops, so the grain and the
breathing lights stop), `dynamicRes` pinned, and a new **`room.setWallMode()`** flips the draw set
inside that one frozen frame.

**The decisive control is stage 4, where `occlude` and `legacy` draw an IDENTICAL 44 planes** — any
difference there is 100% instrument. It measures **1.669% of pixels**. Stage 0, where 33 of 44
planes are dropped, measures **1.671%**. *The arm with the largest possible geometry change and the
arm with no geometry change are indistinguishable.* Whole-frame instanced-vs-legacy at four
stations: **0.240 / 0.409 / 0.542 / 0.558%** against same-mode control floors of **0.277 / 0.784 /
1.311 / 0.490%** — at or below the floor in three of four. Cropped to the band containing both
panels at `service.mid`: **0.212% against a 0.347% control.** The diff heat map has the same
unstructured speckle as the control and **the panel rectangles are empty in it**.

### `?walls=legacy` is a COMPLETE revert, verified station by station
HANDOFF's `?cam=r10` finding is that a toggle reverting less than it implies contaminates every
comparison made with it. There are exactly two pieces of state (the per-panel `occludeLayers` flag
and whether `PanelInstances` is constructed) and both hang off this one value.
**`?walls=legacy` reproduces the pre-change build to the digit at all twelve stations** — 625 calls
/ 277 692 tris / 461 visible meshes at `service.mid`, identical to the pre-change reading.

### Contracts and what is left
`npm run build` ✓ · `mechanics.mjs` **11/11** · `scenarios/escape.mjs` **20/20**.
- **No demotion, deliberately.** A damaged panel keeps its own stack for the rest of the round
  (`gameplay-plan.md` §4 sanctions "demotes **or freezes**"). It costs nothing where you cannot see
  it — residency gates it like everything else — and `WallField.resetAll()` demotes for free
  because `pristine` is computed from the state machine rather than latched. If `dig` makes deep
  digging routine, re-measure this first.
- **GPU time NOT measured, and that is a refusal rather than an omission.** `perf-ab.mjs` hardcodes
  port 5178, which `shoot.mjs` owns with `--strictPort` and `camtool-1` is live on; the perf lock
  is one-measurer-at-a-time and I could not verify I held it. The change strictly removes draws and
  overdraw and adds ≤22 matrix writes on a visibility change. Triangles at `service.mid` move
  277 692 → 278 142 (+450 of a 900k budget: the 22 zero-scaled instance slots).
- **Known degenerate case, stated:** a camera inside the 14 mm gap between layer 0 and layer 1 sees
  layer 1 today and nothing under the occlusion rule. The boom lerps through geometry so it is
  reachable in principle; it is a 14 mm sliver inside a 0.30 m wall.
- **`?walls=` is read in `room.js`, not `views/game.js`** — it changes only how panels are drawn,
  and `views/game.js` is another owner's live file this round.
- The board was **not** written to. `game.play` is BUILDING/unscored and a builder may not score
  itself; `status.mjs --wins` REPLACES, and this piece has an owning critic's data on it.


## game.play PERF — ✅ **FIXED 2026-08-04**, worst space 3.0–4.2 → 1.22–1.38 ms (budget 1.39)

**Read the FIXED block at the end of this section for what landed.** The diagnosis below is
kept because it is what made the fix findable, and because its two dead ends (`aoScale`,
`depthRT` size) are still dead. The AO look changed slightly in the estate rooms and
**has not been judged** — a builder may not score its own work.

### The diagnosis, as it stood (measured solo, and the gate itself is wrong, 2026-08-03 ~17:00)

Five runs on a QUIET machine (no agents building — the previous 42% and 69% spreads were
blamed on build contention; **that explanation is dead**). Cold run discarded (30.8 s ready,
marble compile). Warm, `quality=medium --perfms 28000`:

| run | GPU | CPU | calls | tris | gate |
|---|---|---|---|---|---|
| 1 | 1.15 | 1.94 | 287 | 143k | OK |
| 2 | 1.28 | 1.47 | **122** | 34k | OK |
| 3 | **2.09** | 2.36 | — | — | **FAIL** |
| 4 | 1.39 | 2.45 | **409** | 250k | FAIL (on the line) |
| 5 | 1.15 | 2.07 | 287 | 143k | OK |

**This is not jitter and not contamination — it is portal residency working.** The Director
drives a 28 s playthrough; draw calls swing 122 (chapel spur, one small space resident) to
409 (ballroom hub, four resident) depending on where the sample lands. GPU tracks it: 1.15
in the cheap spaces, 2.09 in the expensive one. **A single scalar cannot describe a game
whose cost is a function of position**, so the current gate passes or fails on where the
camera happened to be — 3 of 5 passed, 2 failed, same build.

**`harness/perf-spaces.mjs` now does this properly** (written and run 2026-08-03): parks the
camera in all six spaces × 4 yaws with the hunter frozen 6 m in frame, warm-up lap first,
gates on the worst. `--nohunter` prices the hunter; `--gate` for CI.

```bash
node harness/perf-spaces.mjs --gate --extra "quality=medium"
```

### The real finding: it is NOT geometry, and it is NOT where you stand

Measured warm, `quality=medium`, hunter in frame — **every space is ~2× over budget and they
are all alike**: study_w 2.47 · gallery 2.51 · study_e 2.48 · ballroom 2.84 · chapel 2.93 ·
service 3.03 ms GPU against a 1.39 budget, 498–570 calls against 625.

⚠️ **Do not trust tonight's ABSOLUTE values to better than ±30%.** Three repeats of one
identical config, back to back, gave **3.45 / 3.31 / 2.57 ms** — a 34% spread on a machine
heat-soaked by an evening of runs. The **ablations below are still sound** because each
compared two configurations back-to-back inside the same window, which is what an ablation
needs; the baseline number is not a precision figure. Re-measure absolutes on a cold machine
before quoting them, and never compare a number from one session against one from another.

Two ablations kill the obvious theories:
- **The hunter is not the problem.** Banished: worst 3.03 → 2.68. It costs ~0.35 ms (12%).
- **Geometry is not the problem.** The chapel drew **93 calls / 32k tris and still cost
  2.22 ms.** With almost nothing on screen the frame is still 1.6× over budget, so every
  draw-call and triangle optimisation done to date could not have fixed this.

**It is the AO pass, and the cost is a fixed per-frame tax:**

| config (worst space, no hunter) | GPU |
|---|---|
| `quality=medium` | 2.68 ms |
| `…&bloom=0` | 2.55 ms — bloom is not it |
| **`…&ao=0`** | **1.12 ms — inside budget** |
| `…&ao=0&bloom=0&fxaa=0` | 0.98 ms |

**What is PROVEN vs INFERRED — stated separately on purpose.**

*Proven by ablation:* AO on/off is worth ~1.5 ms, and **it is not the AO shader's resolution.**
Driving `aoScale` 0.30 → 0.10 → 0.05 (a 36× cut in AO pixels) moved the worst space
2.89 → 2.55 → 2.90 ms, i.e. nothing outside noise. So `aoDirs`/`aoSteps`/`aoScale` tuning
cannot fix this and should not be attempted first.

*NOW ISOLATED — and it kills the fix this file previously recommended.* Two further ablations:

| experiment | result | conclusion |
|---|---|---|
| `depthRT` shrunk to 25% (16× fewer pixels) | worst 2.64 → 3.01 ms — **nothing** | the prepass is **NOT fill-bound** |
| whole render at `scale=0.25`, AO on vs off | delta 1.52 → **1.12 ms** (would collapse to ~0 if fill-bound) | the cost is **resolution-independent** |

So the cost is the **duplicate scene TRAVERSAL** in `pipeline.js:359` —
`scene.overrideMaterial = MeshDepthMaterial` then a full `r.render(scene, camera)`, which takes
draw calls from **238 → 540** when AO turns on. ~1.1 ms of it is fixed per frame regardless of
resolution.

⚠️ **The previously recommended fix — "render the depth prepass at `aoScale` resolution" — is
WRONG and would have bought nothing.** It is struck. Shrinking that target is now warned
against in the source at the allocation site.

### ✅ FIXED 2026-08-04 (perf-ao) — the prepass is GONE and the worst space is inside budget

**Temporal reuse landed**, as recommended: the main pass's own depth texture is kept for one
frame and AO shades from it, so there is no second traversal. Two scene targets ping-pong; a
single prepass primes the buffer on frame 0 and after each resize (dynamic resolution
reallocates) so AO cannot pop. `aoDepth: 'prepass'` / **`?aodepth=prepass`** restores the old
path and exists **only** so this A/B can be re-run — never delete it without replacing it with
something that can.

Ablation, three A/B passes alternating in one session, `quality=medium`, worst *uncontaminated*
space (see the instrument warning below):

| pass | A prepass | B temporal |
|---|---|---|
| 1 | 3.17 ms | **1.22 ms** |
| 2 | 3.00 ms | **1.28 ms** |
| 3 | 4.24 ms | **1.38 ms** |

**Worst space 3.00–4.24 → 1.22–1.38 ms, inside the 1.39 ms budget in all three passes**, and
within 0.1–0.26 ms of the `ao=0` floor of 1.12 ms — i.e. AO now costs almost nothing and the
entire ~1.5 ms was the traversal, exactly as diagnosed. CPU fell with it (2.74–4.85 →
1.01–2.97 ms). B's spread is 0.16 ms against A's 1.24 ms, because a fixed post cost is stable
where a duplicated traversal tracks whatever is on screen.

**Draw calls fall to 0.51–0.54× and NO GEOMETRY IS LOST — verified, because the raw numbers
look alarming.** A scene-graph census at six parked anchors (3 s settle, both modes) reports
**identical visible mesh counts and identical graph triangles in all six spaces**; only the
pass count changed. Do not re-derive this from `perf-spaces` call counts — those are a
single-frame snapshot taken wherever the window closed and they swing 91–1356 on the same build.

**⚠️ THE LANDMINE DID NOT FIRE, and the reason matters if anyone touches this again.**
`AO_FRAG`'s `normalFromDepth()` takes its four taps at `e = uTexel`, `uTexel` is full-res
`1/w,1/h`, and `pxRadius` is in AO-buffer pixels via `uAOSize.y`, reconciled by a hand-tuned
`* 2.0`. That coupling breaks only if the depth source changes SIZE. It did not: the old
`depthRT` and the new `sceneRT.depthTexture` are both full-res `w × h` UnsignedInt depth, so
`uTexel` is untouched and the sampling geometry is bit-identical. **The landmine is still armed
for anyone who shrinks either one.**

**THE LOOK DID CHANGE, slightly, and it needs a critic — a builder may not score this.**
Captures at `--at 6` (sim frozen, so the one-frame latency is exactly zero and every difference
below is the depth SOURCE, not the delay):

| view | signed mean luma Δ | vs its own dither floor |
|---|---|---|
| **`game.play`** | **0.0000** (25 differing pixels of 2.07 M) | floor absMeanΔ 0.578 — the change is ~2900× *below* its own noise |
| `light.dark` | −0.023 | floor 0.143 |
| `room.study` | −0.484 on 61.2 (−0.8%) | floor's signed mean 0.003 |
| `light.shaft` | −0.533 on 60.7 (−0.9%) | floor byte-identical |
| `room.ballroom` | −1.253 on 69.8 (−1.8%) | — |

So **`game.play` itself is pixel-equivalent**; the estate room views get slightly darker.
`harness/evidence/_tmp_aodiffimg.mjs` renders the signed difference (green = more AO) and the structure
is unambiguous: the new AO gains contact darkening at **real creases** — cornice undersides,
mouldings, coffer intersections, window reveals, table-leg/floor contacts — and loses a broad
low-amplitude haze over **flat panels**. The same-config control image is unstructured dither
with no bias. That is AO becoming more localised, which is the direction the pipeline header
already argues for ("multiplying the final image by AO is what makes cheap SSAO look like dirt
smeared on the lens").

**The mechanism, and it is a bug class this codebase has already documented once.** An override
material replaces the material outright, so the prepass forced `depthWrite` ON for everything
and defeated every `depthWrite:false`, every alpha discard, and every non-FrontSide material —
light shafts, dust quads, glow billboards and keyed decal planes were all punching flat false
occluders into the AO depth, flattening AO under them and stepping it at their edges.
`mat-robot.js:396` diagnosed exactly this for the chest decal's pale rectangle. Those artifacts
are gone by construction. `harness/mechanics.mjs` 11/11; all six estate views render.

⚠️ **NOT measured and honestly open: AO under fast camera rotation.** Frozen, latency is zero;
in motion the AO buffer lags one frame, and at 60 fps a fast mouse turn can offset it by ~100 px.
A rotation-only NDC homography in the material patch would reproject it for one `mat3` multiply
and would be a no-op when static. It was not built because nothing measured it — do not treat
its absence as a verdict that it is unnecessary.

⚠️ **INSTRUMENT: `perf-spaces.mjs`'s warm-up lap is NOT sufficient, and it bit every run here.**
Each invocation launches a fresh Chromium, so every run pays the ~33–36 s cold D3D compile, and
the compile keeps landing inside the first one or two TIMED windows: `study_w` reported cpu
**60.6 / 26.4 / 6.8 / 26.3 / 28.8 ms** across runs, in both configurations, and `gallery` often
too. **Discard the first two rows of PLACES, not just the first run** — or the `--gate` verdict
names `study_w` as the worst space on nothing but its position in the list, which it did in 4 of
6 runs here. The last four spaces were stable and are what the table above uses.

`quality=low` already sets `ao:false` and `depthPrepass:false`, so the low tier is unaffected —
medium is the target tier and the one that fails.


### ✅ `perf-ao` LANDED — the biggest perf win on the board, and `game.play` is now IN BUDGET
The depth prepass is **deleted**, not shrunk: the main pass already wrote a full-res depth
texture, so two scene targets ping-pong and frame N shades AO from frame N−1's beauty depth.
Three A/B passes alternating in one session at `quality=medium`: **3.17 / 3.00 / 4.24 ms → 1.22 /
1.28 / 1.38 ms**, inside the 1.39 ms budget every time and within 0.1–0.26 ms of the `ao=0` floor
of 1.12 — so AO now costs almost nothing and the whole ~1.5 ms **was** the second traversal,
exactly as diagnosed. Spread 0.16 ms vs 1.24. `?aodepth=prepass` restores the old path
permanently so the A/B stays re-runnable.
**The documented landmine did not fire, and why matters:** it trips only if the depth source
changes SIZE, and both buffers are full-res `w × h` UnsignedInt, so `uTexel` is untouched and the
sampling geometry is bit-identical. **It is still armed for anyone who shrinks either.**
### ✅ AND THE LOOK IS JUDGED: **BETTER (rooms) / INDISTINGUISHABLE (`game.play`)** — `critic-ao-look-1`
**The perf win did not cost a visual regression.** The critic captured both sides itself in one
session via `?aodepth=prepass`, confirmed at `engine.js:83` and `pipeline.js:182` that the param
switches the real path and not a stub, judged blind (could not tell the pairs apart by eye), then
wrote **its own** signed-mean-luma script rather than reusing the builder's. **Four of five
numbers reproduced almost exactly** — study −0.496 vs −0.484, ballroom −1.257 vs −1.253, shaft
−0.539 vs −0.533, dark −0.020 vs −0.023.
**The decisive evidence is mechanistic, not statistical:** in `light.shaft` the diff hotspot is a
wedge bounded **exactly by the light shaft's own silhouette on the wall** — the false-occluder
mechanism visible directly. Tight crops on dust motes and flame glow show **no halo and no
double-edge**, which is what a bad alpha interaction would have produced.
⚠️ **One builder claim corrected, conclusion intact:** "25 differing pixels of 2.07 M, ~2900×
below the dither floor" did NOT reproduce — at a >0.5-luma threshold ~21% of pixels differ. But
the decisive control settles it: **two renders of the SAME config differ by the same magnitude**
(absMean 0.321 vs 0.322), so the A/B delta is indistinguishable from re-rendering the same build
twice. `game.play` is genuinely unaffected; only the stated figure was wrong.

⚠️ **MOTION IS STILL NOT VERIFIED, and the reason is a NEW instrument hazard worth knowing:**
three attempts failed — direct yaw injection is confounded by the Director's own aim logic; two
separate browser runs diverge in held-item glow and pose even with position and yaw pinned; and
live `aoDepth` toggling stalls `settle()` for ~800 frames. Underneath all of it, **`game.play`
carries a strong per-frame flicker/grain that makes two ADJACENT SAME-MODE frames differ as much
as any A/B**, swamping the signal. **Whoever settles this must kill the grain first** (it is a
grade parameter) and use a static view without the Director. Every whip-turn frame viewed
directly showed no smearing, and the static magnitude is ≤1.8% multiplicative on indirect light
only, so **risk judged LOW but NOT proven**. The homography reprojection is **not justified** by
anything measured.


### 🚨 THE DRAW-CALL BUDGET IS ALL BUT SPENT, AND THE NUMBER IN THIS FILE WAS ANSWERING A DIFFERENT QUESTION
*(✅ **RESOLVED 2026-08-05 by `instancing-1` — see the instancing section at the top.** The figures
below are this round's and are kept for the trail; re-measured a day later the worst station read
**625–627, not 616**, and it is now **580–586**.)*
`eo2-calls.mjs` parks at **twelve stations** and finds the worst at **598/625 BEFORE this round and
616/625 after**. **HANDOFF's 413–423 comes from `perf-spaces` following a MOVING capture Director
that never parks in the service passage** — not wrong, but never the worst case, and **nobody had
ever taken the parked reading.** At **616/625 there are ~9 calls of headroom** and the next feature
to add geometry has nowhere to put it. ⚠️ **`docs/design/playable-estate.md` was written on the
false premise that draw calls were free — corrected there.** Instancing is now a prerequisite, not
a polish step.



---

# 🗜️ APPENDED 2026-08-10 (`diet-2`) — moved verbatim out of `HANDOFF.md`'s core

`HANDOFF.md` now carries one line + one number + the instrument for each of these. The argument is
here. Written by the agent that measured it (`progkey-1`, `calls-1`, `aperture-1`, `exterior-1`);
where a block says "this file" it meant `HANDOFF.md`.

## Boot 199.7 s → 98.9 s — the per-panel program cache key (`progkey-1`, 2026-08-09)

**✅ Load time FIXED 2026-08-09 (`progkey-1`) — the biggest single win on the board.** `wall.js`
pinned `customProgramCacheKey` **per panel per layer**, multiplying one shader into 22–36 identical
compiles. Measured on this tree, `quality=high`, seed s4, 1280x720, RTX 3060 Ti:

| | programs | distinct GLSL | redundancy | cold boot | warm boot (driver cache) |
|---|---|---|---|---|---|
| before | **1077** | 264 | 4.08× | **199.7 s** | 39.0 s |
| after | **213** | 180 | **1.18×** | **98.9 / 121.5 s** | **4.5 / 13.1 s** |

The key was defending a real three.js trap and it was **obsolete**: `acquireProgram` discards the
second material's `onBeforeCompile` output, but `getProgram` keys its program map **per material**,
so uniform VALUES are never shared — and the only discriminator that changes emitted GLSL (damage
vs scalar arm) already lives in `defines`, which three hashes AHEAD of the custom key.
🚨 **Panels still break independently and it is verified in PIXELS on both arms**, dug panel 96.8%
of its own rect moved vs neighbour 0.23% against a 0.44% same-config floor —
`harness/scenarios/_progkey1-independence.mjs`. Write-up in `docs/handoff/walls-perf.md`.
⚠️ **`mechanics.mjs`'s 420 s ready-wait can now come down**, but lower it on a measurement, not on
this paragraph. ⚠️ **The next multiplier, `numPointLights`, is NOT free**: the rendered count still
takes four values (12/13/14/15), each a genuinely different shader because `NUM_POINT_LIGHTS` is
substituted into the GLSL, and `views/game.js` warms all four **on purpose** — that is the fix for
John's five-second freezes. Collapsing it means keeping the gadget/flare lights permanently
resident (`harness/scenarios/_price-pointlight.mjs`), not another cache-key edit.

## The draw-call overrun was never the ballroom — it was six gadgets on floors (`calls-1`, 2026-08-09)

- ✅ **FIXED 2026-08-09 (`calls-1`): the draw-call overrun was NEVER THE BALLROOM — it was SIX
  GADGETS LYING ON FLOORS IN ROOMS YOU CANNOT SEE.** Residency switches off every room you are
  not in; the world pickups (`limbs.js` `spawnGadget`, the sledgehammer in `views/game.js`) are
  parented to the SCENE, so residency had no opinion about them and only the view FRUSTUM removed
  them — which, from the middle of a 36 m house, removes almost nothing. Attributed per draw call
  with `harness/scenarios/_calls1-who.mjs` (it wraps `WebGLRenderer.renderBufferDirect`, so the
  table sums to `info.render.calls` by construction — no ablation, no "one mesh = one call"):
  at `ballroom.south`, **`pickup.oil` 205 · `ball` 134 · `skates` 90 · `nailgun` 69 · `grapple` 39
  · `sledgehammer` 18 = 555 of 689 calls**, five of them lying in rooms whose walls and floors
  were switched off. 🎯 **The whole ported 9.6 m ballroom was 20 of those calls**, and every room
  in the house is 10–21 — `GeoBin` works exactly as `room.js`'s key tables claim.
  **Fix: loose objects join residency** — `room.trackLoose()` + a gate in `setViewpoints`, wired
  off `LimbField`'s existing `onDrop`/`onTake`. **Never the player or the hunter.** `?loose=0`
  reverts. **841 / 722 / 682 → 599 / 480 / 426 on the three wall arms**, triangles untouched.
  Look A/B in one frozen page (⚠️ **hold the page still first or the same-config floor swallows
  the signal** — `harness/still.mjs`'s `hold()`; and note the floor was **never mainly the
  grain**, it was `_liveLoop`'s dynamic resolution — see `docs/capture-determinism.md` §7):
  **byte-identical at 4 of 5 stations** while hiding up to six items and saving up to 465 calls.
  The one residual is 126 px at `ballroom.south`, owned entirely by `pickup.oil`, **84% of them
  unlit once it is hidden** — the oil can's pilot flame in the black D5 doorway, i.e. the cull
  removes a prop on fire in a void rather than a picture. Looked at, cropped, both frames on disk.
  🚨 **IT HIDES THE MESHES AND LEAVES THE LIGHTS, AND THE ONE-LINE VERSION WAS A SHADER STALL.**
  The pickups carry their own `PointLight`s, so `holder.visible = false` moves `numPointLights` —
  the field `views/game.js` says in capitals recompiles every visible material, priced by
  `perf-stall-1` at +132 programs, i.e. John's five-second freeze. Measured over one twelve-station
  walk, no flips: `?loose=0` **213 → 213 (+0)** · hiding the holder **232 → 284 (+52)** · hiding
  only the drawn descendants **back to a constant {13,14}**.
  🚨 **AND THE OBVIOUS PROBE PASSED THE BROKEN BUILD** — flipping the cull at a settled station
  read the same program count either side at all twelve, because residency had already paid the
  arrival compile before the first read. **A flip A/B taken standing still is blind to a cost paid
  on arrival.** Two no-flip walks (the change vs its own `?loose=0` revert) is the form that sees it.
  ⚠️ **Still loaded and NOT fixed: one gadget is 39–205 calls** because `src/gadgets/index.js`
  builds each prop as 44–161 individually-materialled sub-meshes. Two gadgets dropped in one
  room is ~471 of 625 legitimately. Write-up: `docs/handoff/walls-perf.md`.

## The exit sites' black apertures — a one-sided fill for a two-sided hole (`aperture-1`, 2026-08-09)

- ✅ **FIXED 2026-08-09 (`aperture-1`): the exit sites' black apertures were A ONE-SIDED FILL FOR A
  TWO-SIDED HOLE, and it was NOT the instancing path** — `?walls=legacy` shows the identical hole.
  `wall.js` built all four layer planes `FrontSide` facing local +Z, and a connector's `rotY`
  (`spaces.js`) encodes **the wall's axis, not a facing**: `x.study_w.servants` and
  `x.ballroom.terrace_e` are both `rotY: PI/2`, so one faces into its room and the other faces out
  of the house. On the +x/+z walls every plane was backface-culled from the only room that can look
  at it. `x.ballroom.terrace_e` went **luma 4.3 / 99.7% of its rect unlit → 25.1 / 39.2%** with the
  wall control at 0.08 pp and a 0.19 pp floor, both arms in one frozen page. **Fourteen scalar
  panels were affected — six exit sites and the eight interior breachables, which from their blind
  room read as an open doorway.** Fix is `DoubleSide` on the scalar arm's layer materials
  (`wall.js`) AND on `wallinstances.js`'s shared pristine/spent faces — **both were required**,
  because a pristine exit site is drawn only by the instance. **Zero draw calls, measured.** The dig
  is deliberately untouched (a free face has a twin facing the other way). Write-up:
  `docs/handoff/walls-perf.md`.
  ⚠️ **Two sites are still dark and it is a DIFFERENT object, now isolated:** `x.ballroom.orangery`
  (luma 6.3) and `x.gallery.east` (11.6) have their wall face in the draw set, and what covers it is
  **`exterior.js`'s `exterior.dress.mortar`** — the `plaster`-lock tell, a deliberate opaque slab
  across 92% × 88% of the aperture, 8 mm proud, drawn on BOTH faces. It is doing its job and it
  reads as a black rectangle. **Owner: unassigned, `src/game/exterior.js`.**

## Mansion perf: what is measured, and the two things still open


**✅ Perf no longer FAILS on GPU — the AO depth prepass was the whole overrun and it is gone
(2026-08-04, perf-ao). Worst space 3.0–4.2 → 1.22–1.38 ms against a 1.39 ms budget, CPU with
it. Full ablation, the look A/B and the caveats are in the `game.play PERF` section.** Budget is
gpu ≤1.389 · cpu ≤2.00 · calls ≤625 · tris ≤900k.

🚨 **AND THE OTHER HALF OF THAT RULE IS WHAT BLEW THE BUDGET, TWICE NOW — THE UNIT IS THE MESH.**
"Material keys" is shorthand for "GeoBin merges a bucket into ONE mesh"; a prop that was never
merged pays one call per sub-mesh however few materials it has. `calls-1` measured `pickup.ball`
at **4 material names and 134 draw calls**, because it is 133 separate meshes — and every ROOM in
the house, estate order and all, at **10–21 calls**. **One gadget prop costs more than the entire
six-room mansion.** Before adding any prop, ask how many MESHES it is.

🎯 **DRAW CALLS SCALE WITH MATERIAL KEYS, NOT GEOMETRY — so detail inside an existing merged bin
is FREE, and this project keeps leaving it on the table.** `exterior-1` proved it on 2026-08-09:
the whole yard already went into one `Paint` bin → one merged mesh → one `MeshBasicMaterial`, so
taking it from **0.9k to 11.6k triangles cost ZERO extra draw calls** (440 → 440 at the exit,
512 → 512 parked away) — a full pilaster order, 12–16 sash windows, real trees and a wrap-around
sky, for nothing. **Before proposing that something must stay crude for perf, check how many
material keys it actually adds.** The corollary is the standing warning in the other direction:
the skate drift trail cost **+82 draw calls for 76 sprites** because each one was its own key. Note the six-space mansion costs ~370–410
calls against the one-room level's 296, i.e. residency is working.

Historic, kept because the *spread* is the lesson: at `--perfms 28000` run A read **gpu 1.59 /
cpu 2.64 / 409 calls**, run B **gpu 2.26 / cpu 3.03 / 368 calls** — 42% apart, so by this
project's own rule they never counted as a measurement. That was never contamination; it is
`shoot.mjs --perf` averaging a Director walking through six different rooms. Use
`perf-spaces.mjs`, and read its own instrument warning.

**Residency budget ≤3 is unachievable with this floor plan, and that is geometry, not a bug.**
Over a run of the outer ring, `visibleSpaces()` peaks at **4**. The ballroom is a hub with three
doors in one wall (D4/D5/D6 at x −8.6/0/+8.6); from `ballroom.north` they are 8.9 / 2.3 / 8.9 m
away and all three are in front of the camera, so four spaces resident is CORRECT. §5.2's one
sanctioned knob (16.0 → 13.0) cannot fix it — only a cap under ~8.5 m would, and that pops rooms
the player is looking through. `PORTAL_VIS_DIST` shipped at 13.0. The budget exists to protect
draw calls; draw calls are at 409/625. **Treat the ≤3 as retired, or change the floor plan.**

