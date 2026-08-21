# Appendix: dig

**Covers:** the interconnect mechanic and the dig-stage build behind `?dig=1` (dig-1, dig-2).
**Read when:** your slice touches `src/game/dig.js`, the interconnect/connector system, dig
stage tables, or anything in the dig campaign's Wave 2–4 scope (`docs/design/dig-campaign.md`).

---

## 🕳️ A WALL BAND IS TWO FACES, AND FOR A YEAR NEITHER OF THEM COULD SEE THE OTHER (`seethrough-1`, 2026-08-09)

The finding, the fix and the numbers are in **HANDOFF's open-defect list**. What belongs here are
the four things the next slice will otherwise re-derive.

```bash
node harness/playtest.mjs --view game.play --script harness/scenarios/_pf1-diag2.mjs  --port 5403 --q "seed=s4&dig=1"          # 7/0 — the mechanism
node harness/playtest.mjs --view game.play --script harness/scenarios/_st1-remain.mjs --port 5407 --q "seed=s4&dig=1" --shots  # 10/0 — the picture, both arms
```

### 1. 🎯 THE PAIR IS THE UNIT, AND ALMOST EVERY QUERY IN THE SYSTEM ASKS ONE HALF OF IT

`blocksMovement()`, `openChannel()`, `anySeeThrough()` and `barrierMaterial`'s discard all read
**this face's** grid. The collider walks **both** faces. So any state where the two grids disagree
is a state the game shows you and refuses you, and there was no assertion anywhere that they
cannot. **`_pf1-diag2` P4 is that assertion** — near face fully excavated, barrier dropped, twin
untouched, swept over span × seed — and it read **42 of 42 disagreeing** before this round.
**Write the pair invariant into anything new that touches a free face.**

### 2. ⚠️ `_couple()` FIRES ON `brokeThrough`, WHICH REQUIRES *NO BARRIER BEHIND THE CELL*

That is the whole bug, in both of its instances. Digging to the cyan never breaks through, so the
coupling never runs; dropping the barrier later makes every one of those cells passable on your
face in one instant and says nothing to the far one. `unblock-1` found it on `[B]`;
`room.unlockBarrier()` — the shipped mechanic — had it too.
🎯 **THE FIX BELONGS IN `WallPanel.setBarrier()`, NOT IN EITHER CALLER.** Both `[B]`
(`views/game.js`) and `unlockBarrier()` (`room.js` line ~614) funnel through it, nothing calls
`DamageField.setBarrierEverywhere` directly (audited), and **clearing this face's barrier before
coupling removes the ordering hazard entirely** — `_couple()` skips a source cell whose own
barrier is set, and at the panel level the clear has already happened one line above. That is why
one pass is enough *here* where two were needed in a caller that cleared the whole house first.

### 3. 🚨 THE FAR FACE IS INVISIBLE AND `DoubleSide` CANNOT FIX IT — MEASURED, NOT ARGUED

`_pf1-diag2` P1 reads the twin's four layer materials as `front/front/front/front` **and their
`visible` flags as `falsefalsefalsefalse`**. A pristine twin is drawn by `wallinstances.js`, so
its own meshes are switched off; flipping `mats[i].side` on a dig panel would have changed nothing
at all. **The one approach everybody reaches for first is refuted by the second half of that
line**, and it would additionally have put the far face's planes inside the near face's crater.

### 4. 🎯 ROUND 5 ALREADY BUILT THE HOOK — `uOpenAt` — AND FILLED IT WITH THE WRONG MATERIAL

`barrierMaterial` has had a *"not through yet, so draw something instead of discarding"* branch
since round 5. It painted `uCavity`, the reveal box's near-black, on the stated reasoning that
*"that is literally what is there."* **A reveal box lines an APERTURE; a dig band is 0.30 m of
solid wall.** So the one surface that proves the wall is still standing was painted to look like a
way through, and the breach photographed as a black void
(`progress/playtest/game.play.pf1-breach-from-the-gallery.png`). It is now `uRemain`, the white
the shell already is, continuing `DIG_BAND_LOOK[3]`'s 0.780 ramp with its own emissive for round
11's reason. **Zero meshes, zero draw calls, one shared program, one extra sampler.**
⚠️ **The generalisable half: when a discard branch has to choose a material, ask what is
physically in that volume, not what the nearest existing colour constant is.**

---

## 👁️ THE LAST 58% OF A DIG NOW READS (`visible-1`, 2026-08-09) — and the instruments are reusable

The finding, the fix and the trade are in **HANDOFF's open-defect list** (the `DAMAGE_BANDS` entry)
and the full argument is in `src/game/wall.js` above the table itself. What belongs here is the
**three instruments**, because they answer questions this appendix keeps asking:

```bash
# record a real drive and dump the whole smoothed-depth history (3 seeds x 2 aiming models)
node harness/playtest.mjs --view game.play --script harness/scenarios/_visible1-gap.mjs --port 5361 --q "seed=s4&dig=1"
# then price ANY candidate DAMAGE_BANDS row against that one drive, offline, in a second
node harness/evidence/_visible1-analyse.mjs
# and photograph both arms on one crater, one camera, one page, blow by blow
node harness/playtest.mjs --view game.play --script harness/scenarios/_visible1-shots.mjs --port 5363 --q "seed=s4&dig=1" --shots
```

🎯 **THE REUSABLE TRICK, AND IT IS WORTH MORE THAN THE ROUND: `DAMAGE_BANDS` IS A PURELY VISUAL
MAPPING AND EVERY ROW OF IT IS A UNIFORM.** `DamageField._add()` has no reference to it, so

- a recorded B-channel history answers *"what would band X have looked like"* for **every** X with
  no second build and no second browser — eleven candidates were swept that way in one second;
- both arms of an A/B can be photographed **in the same frozen page** on the **same crater** from
  the **same camera** (`setDamageBand`, or `mats[i].userData.breakUniforms.uDmgBand`);
- and a gate can **reintroduce its own defect live** — which is what `dig-band.mjs` **B2c** does on
  every run, so a green from it means both "the wall answers" and "this line can tell when it does
  not". HANDOFF's rule that a gate which has only ever seen working code is not evidence is cheap
  to satisfy here and nobody had used it.

⚠️ **AND THE PICTURE IS MEASURABLE WITHOUT A CAMERA.** Every layer's threshold is
`clamp((B - lo) / (hi - lo))` on `data[i*4+2]`, so reading that channel after `flush()` IS what the
shader sees — no lighting, no grade, no screenshot, and therefore nothing for either to hide. Every
figure in the round is off that channel; the pictures are corroboration, not evidence.

⚠️ **TWO CAPTURE TRAPS THIS ROUND PAID FOR TWICE.** A drive lands 40 blows inside one frame, so
`onChunk`'s debris piles into a cloud that **covers the exact surface under test** — null `onChunk`
and `onBreak` (as `dig-promoted.mjs` does). And the live loop keeps running between stations, so
the player drifts and the boom lerps: **re-plant the camera before every shot**, or an A/B ends up
comparing two different viewpoints, which is the one confound a one-page A/B exists to remove.

---

## 🏛️ THE DIG NOW REACHES ALL SIX ROOMS, AND JOHN'S MINUTE HOLDS IN EVERY ONE (`digcover-1`, 2026-08-09)

**`digband-1` (below) found that the game's only verb did not work in the rooms John ported his
art into: `gallery` 0 diggable faces, `ballroom` 0, `chapel` 0.** Two of those three are estate
rooms, and John's reason for porting them was *"I just want the game to progress from the assets we
made for the 3 rooms we had in the art."* He could walk through his art and not dig in it. **Five
edges are appended to `DIG_EDGES` and that is closed.** Same command, unchanged:

```bash
node harness/playtest.mjs --view game.play --script harness/scenarios/dig-band.mjs  --port 5343 --q "seed=s4&dig=1"
node harness/playtest.mjs --view game.play --script harness/scenarios/dig-cover.mjs --port 5352 --q "seed=s4&dig=1" --shots   # 🆕 the pictures
```

| space | storey | dig faces | dig width | edges | **median TOTAL** | spread | was |
|---|---|---|---|---|---|---|---|
| `gallery` | 5.60 m | **4** | **13.80 m** | 3 | **53.4 s** | 45.6–58.5 s | **undefined** |
| `study_w` | 4.80 m | 5 | 16.76 m | 2 | **63.0 s** | 60.2–64.6 s | 63.7 s |
| `service` | 4.80 m | 7 | 25.04 m | 3 | **64.1 s** | 53.6–64.1 s | 69.3 s |
| `study_e` | 4.80 m | 7 | 25.44 m | 3 | **63.1 s** | 62.5–69.1 s | 61.1 s |
| `ballroom` | **9.60 m** | **4** | **11.44 m** | 2 | **54.2 s** | 51.9–56.1 s | **undefined** |
| `chapel` | 4.80 m | **1** | **2.96 m** | 1 | **48.4 s** | 46.1–49.4 s | **undefined** |

**Six of six in John's 45–75 s band, five seeds each.** `dig-band` B1 *"every space in the house can
be dug out of"* is now GREEN — it was the round's headline failure. **Nothing was retuned:**
`DIG_HEALTH`, `IC_W`, `IC_H`, `DIG_H`, `SEG_W`, the decay curve and both original spans are exactly
as `digband-1` left them. The only edit to `src/` is five appended rows.

### 🎯 WHICH WALLS, AND THE RULE THAT DECIDED THEM

| edge | rooms | spans | why this wall |
|---|---|---|---|
| `gal_svc` | gallery ↔ service | 2.56 | **the only connection these two rooms have.** John removed D2 on 2026-08-08 and `spaces.js` records the cost — *"`service` loses its only direct link to the gallery… it IS a real loss of a route"*. It also records why no breachable PANEL was put back: a panel is one more hole to count. A continuous dig face is the opposite of a hole to count. **The route comes back as a dig.** |
| `gal_east` | gallery ↔ study_e | 5.72 + 2.56 | the gallery's ONLY long run of shared wall (8.96 m clear of `p.gal_e`), and the reason the gallery can hold a band at all |
| `gal_chapel` | gallery ↔ chapel | 2.96 | the chapel's only shared wall with anything in the house |
| `bal_west` | ballroom ↔ study_w | 2.96 + 2.56 | the ballroom's end wall, either side of D4 |
| `bal_east` | ballroom ↔ study_e | 2.96 + 2.96 | …and either side of D6. **These two are the whole of what the ballroom can EVER have** — its only interior wall is zmin, and the 3.40 m `service` stretch of it is entirely consumed by D5. |

🚨 **THE COUNTER-INTUITIVE FINDING, AND IT IS THE ONE TO CARRY: ADDING AN EDGE TO A ROOM MAKES IT
*FASTER* TO DIG OUT OF, NOT SLOWER.** `chooseFreeInterconnect` puts **exactly one region on every
edge**, and FIND is `((N − K) / (K + 1)) × ~6.2 blows`. An extra edge adds ~1.3 to K and only ~2 to
N, and the `K + 1` denominator eats the gain. **So the knob is not "how much wall" — it is "how much
wall PER EDGE".** That is why the gallery gets one 5.72 m face rather than four short ones, and why
`gallery ↔ study_w` was available and deliberately NOT taken (those two already share D1 *and*
`p.gal_w`; a third route to the same place would have cost the gallery's own search more than it
bought). It is also the honest reason the hubs sit at the fast end of the band and the dens at the
slow end: **a room with three ways out is quicker to dig out of than a den with one, and it should
be.** Predicted 48.2 / 49.7 / 42.6 s for gallery / ballroom / chapel from that model before any
browser was opened; measured 53.4 / 54.2 / 48.4.

⚠️ **EVERY SPAN LENGTH IS ONE OF THE THREE THE TABLE ALREADY AUTHORED — 2.56 / 2.96 / 5.72 — AND
THAT IS A DRAW-CALL CONSTRAINT, NOT A COINCIDENCE.** A free face's aperture group IS its span
length (`wallinstances.js` keys on `w × h × t`), and `dig-toggle.mjs` gates the free arm at **+3
groups** with its own note *"add a fourth edge with the same spans and it stays at three."* Eight
new spans, **zero new aperture groups**. Confirmed off the build: `[2.96 5.72 2.56] × 2.80 × 0.15`.

### 💸 DRAW CALLS: **+6 AT THE WORST STATION, AND THE BUDGET WAS ALREADY BREACHED BY 51 BEFORE I TOUCHED IT**

The A/B is a source revert — `DIG_EDGES.slice(0, 2)` — so the two arms differ in nothing but the
five rows. Same seed, same stations, `eo2-calls.mjs`, ports 5353 / 5354:

| station | before (2 edges) | after (7 edges) | Δ |
|---|---|---|---|
| `gallery.east` | 231 | 240 | **+9** |
| `ballroom.south` | 675 | **682** | +7 |
| `chapel.centre` | 313 | 316 | +3 |
| `gallery.west` / `.mid` · `study_w.north` · `service.mid` | 219 / 212 / 273 / 558 | 219 / 212 / 273 / 558 | **0** |
| `study_e.north` / `.south` · `ballroom.north` / `.centre` | 337 / 489 / 673 / 676 | 331 / 483 / 667 / 668 | **−6 / −6 / −6 −8** |
| **WORST** | **676** (`ballroom.centre`) | **682** (`ballroom.south`) | **+6** |

✅ **I INDEPENDENTLY REPRODUCE `progkey-1`'S OVERRUN, ON MY OWN BEFORE-ARM: 676 against 625, with my
edges absent.** The gate was red before this round and it is not mine. **My delta at the worst
station is +6 calls (+0.9%)** — and this file's own standing warning is that *"the ballroom stations
still do not reproduce"* (`ballroom.north` read 579 and 622 for the same state in one page), so +6
is inside the spread it already attributes to them. Four of the twelve stations went DOWN.
The mechanism is why it is cheap: a pristine free face is an instance in an aperture group that
already existed, so 16 new faces are 16 more slots in the same meshes. **Triangles grew where the
geometry is: `gallery.east` +54k, `ballroom.centre` +12k; worst station 658k → 598k of a 900k
budget.** The ballroom can take these edges. ⚠️ **What is NOT measured is the worst case where all
four ballroom faces have been DUG at once** — a damaged face de-instances and owns its own meshes.
Nobody has priced that on the free arm in any round.

### 🖼️ THE 9.60 m QUESTION, ANSWERED BY LOOKING — **THE 2.80 m BAND READS, AND THE "29%" IS ARITHMETICALLY TRUE AND VISUALLY IRRELEVANT**

`digband-1` called `DIG_H` 2.80 against a 9.60 m storey moot *"only because no tall room was
diggable yet"*, and this is the round that made it not moot. **I looked at it, which is the thing
that round explicitly refused to do.** `progress/playtest/game.play.digsite-ballroom-to-study-e.png`
and `…-ballroom-9m6-storey-against-a-2m8-band.png`:

🚨 **THE BALLROOM IS NOT A 9.60 m WALL. `ballroom-order.js` SPLITS IT AT 4.80 m** — a gilt frieze
and cornice band at the storey break, with the upper window order and the musicians' gallery
balustrade above it. So the dig band sits in a **4.80 m lower storey, at 58% of it — exactly the
proportion that already ships in every study.** The 9.60 m number never presents itself to the eye
as one uninterrupted surface, and the thing a player compares the breach to is **the arched D6
doorway 3 m along the same wall** (2.72 m head against the breach's 2.05 m channel), not the
ceiling. It reads as a breach, not as a mousehole.

**So `DIG_H` is NOT changed, and that is now a looked-at decision rather than an inherited one.**
Raising it would buy nothing visible and cost fill on the one room already worst for calls and
triangles. ⚠️ **If a future room is ever tall AND single-storey — no order, no string course, no
break — this answer does not transfer.** It is the *order* that rescues the number, not the number.

### ⚠️ WHAT I COULD NOT DODGE: THE PORTED ORDER AND THE DIG BAND OCCUPY THE SAME 0–2.80 m OF WALL

`gallery-order.js` dresses **both** long walls end to end: fluted pilasters (0.50 wide, 0.13 proud)
at a 3.022 m pitch on world x ±1.511, ±4.533, ±7.556, ±10.578, ±13.60, and portraits at a 2.9 m
pitch on world x 11.0, 8.1, 5.2, 2.3, −0.6, −3.5, each 0.98–1.33 m wide and centred ~2.0 m up.
**Portrait pitch minus portrait width leaves 1.7–1.9 m gaps, so NO span of any authored length fits
between two portraits.** A gallery dig face therefore always has a painting hanging over part of it,
and once it is dug the painting is left floating in the breach. This was chosen, not missed:

- It is **pre-existing in kind** — the shipped pilaster at x −7.556 already clips D1's jamb.
- Dodging it is not available at any span length, so the alternative was not "a cleaner gallery
  dig", it was **no gallery dig**.
- ✅ `gal_svc` at least is pier-clean by construction: 2.56 m centred on x 0 puts its two ends
  **19 mm behind** the pilasters at ±1.511, so the piers cover the cut's edges and the bay between
  two pilasters IS the dig face. That is the shape to reach for if the order ever gets a say.

**A look critic should judge `game.play.digsite-gallery-to-study-e.png` on exactly this.** My own
read: the white rubble contrasts hard enough against the walnut field that the breach is legible
anyway, and the frames beside it make it read as damage to a decorated room rather than as a
programmer hole — but a portrait *floating in* a hole is a different thing from a portrait *beside*
one, and I have not photographed a seed where the region lands directly under one.

⚠️ Both `gal_svc` and `gal_chapel` frames also show a **dashed rectangle outline around the dig
face**. It is on the shipped `svc_*` faces too and is not something this round added; nobody has
said whether it is a deliberate affordance or a debug helper left on. Worth one person's minute.

### 🚨 THE CHAPEL CANNOT HOLD JOHN'S MINUTE ON MERIT, AND IT IS THE FLOOR PLAN

It lands at **48.4 s** — inside the band — but on **two of five seeds it has NO dud probe at all**,
which means its search is a coin flip rather than a search. The arithmetic, and it is not tunable:
the chapel is a 6.80 m spur with exactly one shared wall, `p.chapel` eats 2.08 m of it, **4.36 m
remains against the ~11 m a study needs**, and 2.96 m is the largest authored span that fits. At a
1.5 m probe step that is **2 probe spots**, and a 1.55 m `IC_W` region covers both of them often.

**I shipped it anyway and I think that is right.** The chapel is the deepest dead end in the house —
two exit sites, one entrance, nowhere to run since D7 was removed — and the existing way in
(`p.chapel`, a 255 hp BREACHABLE) already costs ~1.3 s, so the dig was never going to be the way
*in*. **A fast way OUT of the trap room is a mercy, not a defect.** The alternative was leaving the
chapel barren, which is the failure this round exists to close. `dig-band` fails it on its own named
line so nobody can mistake it for a tuning question.

### 🐞 `digparity-1`'S BUG REPRODUCES ON A BRAND-NEW EDGE, AND THE NEW DATA POINT INCRIMINATES THE MIRROR

Not chased, per the brief. But it now fires **twice more**, on `f.gal_chapel.0.b` at seeds
`search-b` and `s7`, with the signature bit-identical to the `f.svc_w.0.a` case already filed:
**channel stalls at 0.56 m, 182–183/183 cells in the aim window at depth 1.0, band 0.925–1.018 m.**

🎯 **THE USEFUL PART FOR `digparity-1`: `gal_chapel` is a `normal: 'z'` edge — the first one in the
project — and it still fails on the `.b` side, the MIRRORED one.** So the parity flip is not an
artefact of the x-axis edges it was found on; it travels with `mirrorBarrierFrom`, exactly as their
hypothesis says. Three of the three stalls now recorded are on a mirrored face, none on an `a` face.

### 🔧 TWO PROBES WERE FIXED, AND BOTH WERE FAILING FOR A REASON OTHER THAN THE ONE PRINTED ON THEM

Widening the dig to six rooms broke two assertions **that were correct for a three-room dig**. Both
fixes are strictly more information at the same strictness, and neither is a gate being loosened:

1. **`dig-band.mjs` — "every hole is a hole the graph agrees you can walk through" went red on a
   correct build.** `pathPortals` returns the SHORTEST route. Before this round every diggable pair
   was joined ONLY by its dig wall, so "the graph carries the hole" and "the BFS picks the hole"
   were indistinguishable and 14/14 held. `bal_west` / `bal_east` sit either side of **D4 and D6 —
   OPEN doorways between the same two rooms** — so the BFS goes through the door in one hop and
   never names the hole. Measured: **exactly the 5 ballroom rows and nothing else.** It now asserts
   what the defect actually is (the hole is carried by `breachPortals()` and the pair is routable)
   and REPORTS which of two equal hops the BFS took. **27/27 in graph, 22/27 preferred.**
2. **`dig-band.mjs` — `hitRate < 0.5` and `anyDuds` were one assertion**, so one two-probe-spot room
   made a house-wide line read *"the search is collapsing"* at a **29%** hit rate. Split: the
   house-wide claim passes at 29%, and the per-space claim fails **naming the chapel**.
3. **`dig-toggle.mjs` kept its own hardcoded copy of authored data** — `touched = ['service',
   'study_w', 'study_e']` — and reported the gallery, ballroom and chapel as regressions for having
   exactly the dig geometry they were given on purpose. It now derives the set from the build. ⚠️
   **And with every space carrying an edge the assertion has no subject left, so it SKIPs rather
   than passing vacuously** (HANDOFF: *"a probe that cannot observe must report SKIP, never PASS"*).
   The bays-arm collider deltas it prints are correct and expected: `gallery 20→46`,
   `chapel 10→15`, `ballroom 42→62`, `service 14→59`, `study_w 28→58`, `study_e 24→70`.

### Contracts, and what I could NOT stand behind

`npm run build` ✓ · `node harness/lint-glsl.mjs` ✓ (371 files) · **`mechanics.mjs` 11/11** ·
**`escape.mjs` 20/20 on `seed=s4`** (the determinism gate — `PANELS` is untouched, no row here is an
exit site, so `chooseExit()` cannot see the new table and **no seed in any document moved**) ·
**`dig-free.mjs` 15/15** · **`sledge-check.mjs` 13/13** · **`dig-toggle.mjs` on `?dig=bays` 13/0/1
skip** · `dig-cover.mjs` **6/0** · `dig-band.mjs` **18 passed / 4 failed** — 3 of the 4 are
`digparity-1`'s stall and the 4th is the chapel's floor-plan limit, both meant to stay red until
someone owns them. Every gate run **serially**, `one uninterrupted session · 1 navigation` on all of
them. Ports 5341–5356. Cold boot 84–100 s (`progkey-1`'s program collapse; the 168 s figure is gone).

- **NOT MEASURED, and it is a refusal: GPU time.** `perf-ab.mjs` was not run — fourth round in a row
  to make that call. `eo2-calls` is a scene census and contends with nothing.
- **NOT MEASURED: the free arm's DAMAGED worst case.** Every draw-call figure above is a house whose
  dig faces are pristine and therefore instanced. Four dug ballroom faces de-instance and own their
  own meshes; nobody has priced that in any round, on any arm, and the ballroom is the station that
  is already over.
- **The `?dig=bays` arm grows and its recorded figures do NOT survive.** 36 segments → **74**, 12
  brick slabs → **74**. `dig-toggle` still passes on structure (it asserts `> 0`, not counts) and
  every shipped panel is still byte-identical — but *"add `&dig=bays` and every figure in this
  appendix is re-runnable"* is **no longer true for the counts**. Stated rather than hidden; the arm
  is retired and John rejected it, and keeping the free arm's edges out of the bays table would have
  meant two tables of authored data, which is the failure mode this file exists to prevent.
- **I did not judge the ART.** Whether a breach in a room carrying `room.ballroom` PASS 90 damages
  the score is a critic's call, not mine, and the pictures are filed for exactly that.
- **The five pictures**, all in `progress/playtest/`: `game.play.digsite-gallery-to-service.png`,
  `…-gallery-to-study-e.png`, `…-chapel-to-gallery.png`, `…-ballroom-to-study-w.png`,
  `…-ballroom-to-study-e.png`, plus `…-ballroom-9m6-storey-against-a-2m8-band.png`.
  ⚠️ The ballroom-storey frame still has a colonnade pier across a third of it — `side` steps along
  `(−n.z, n.x)` and the sign put the camera on the pier at x 2.2. The storey break, D6 and the
  breach are all legible in it anyway, but it is not the frame I wanted and `dig-cover.mjs` records
  the fix. Its first run also put two cameras inside walls; both are corrected and re-shot.

---

## ⏱️ JOHN'S MINUTE, RE-MEASURED IN THE PORTED HOUSE — IT HOLDS, AND NOTHING WAS RETUNED (`digband-1`, 2026-08-09)

John, 2026-08-08: ***"lets go about a minute to dig into another room."*** Every figure behind the
recorded 45–75 s band was taken before the estate rooms were ported into the playable slice, so
the number John personally set was unverified in the only place it matters. It has now been
measured on the shipped build (`?estate=port`, `?dig=free`), **two clocks × every space that can
be dug × five seeds**, by `harness/scenarios/dig-band.mjs`:

```bash
node harness/playtest.mjs --view game.play --script harness/scenarios/dig-band.mjs --port 5325 --q "seed=s4&dig=1"
#   SEEDS=s4,search-b,search-c,s1,s7   PROBE_STEP=1.5   SWING=<rules.js WEAPON_COOLDOWN.sledge>
```

**✅ THE BAND HOLDS AND I CHANGED NOTHING.** `DIG_HEALTH`, `IC_W`, `IC_H`, `DIG_H` and the decay
curve are all exactly as I found them. Medians over five seeds, against 45–75 s:

| space | median TOTAL | spread | **FIND** (the search) | **THROUGH** (first blow → passable) |
|---|---|---|---|---|
| `study_w` | **63.7 s** | 60.8–65.6 s (7%) | 20.4–20.9 s | 39.9–44.7 s |
| `service` | **69.3 s** | 64.6–69.7 s (7%) | 27.5–27.9 s | 37.1–41.8 s |
| `study_e` | **61.1 s** | 60.8–67.5 s (11%) | 11.7–20.9 s | 39.9–49.4 s |

**`service` is the slow room and it is slow for a legible reason: it has twice the wall** (6 faces
/ 22.5 m against a study's 3 / 11.2 m), so its search is 16 probe spots against 8 and its FIND
clock is ~7 s longer. It sits 5.7 s under the ceiling. Nothing else is close to an edge.

### 🚨 BUT ONLY THREE OF THE SIX SPACES CAN BE DUG IN AT ALL, AND THE BALLROOM IS NOT ONE OF THEM

> ✅ **CLOSED THE SAME DAY BY `digcover-1` — see the section above.** All six spaces carry dig faces
> and all six land in the band. The table below is the state that round found, kept because the
> reasoning is why the next round did what it did; **do not act on its zeroes.**

This is the finding, and it is not a tuning question. `DIG_EDGES` still holds the two edges
`dig-1` authored — `svc_w` and `svc_e`, both flanking the service passage — so read off the built
world:

| space | storey | dig faces | dig width | estate order |
|---|---|---|---|---|
| `gallery` | 5.60 m | **0** | 0 m | yes |
| `study_w` | 4.80 m | 3 | 11.24 m | yes |
| `service` | 4.80 m | 6 | 22.48 m | no |
| `study_e` | 4.80 m | 3 | 11.24 m | yes |
| `ballroom` | **9.60 m** | **0** | 0 m | yes |
| `chapel` | 4.80 m | **0** | 0 m | no |

**In the gallery, the ballroom and the chapel John's minute is not slow or fast — it is undefined.
There is no wall to swing at.** Two of the three are ported estate rooms, i.e. exactly the rooms
the campaign added because *"every art score on the board was for something that was not the
game"*. The dig is the game now, and it is absent from half the house.

⚠️ **This is item 5 of `dig-2`'s own "what a third round should pick up" list** — *"Only two edges
are segmented"* — still open, and now much more expensive than when it was written, because the
house it under-covers is three rooms bigger. **Appending to `DIG_EDGES` is the sanctioned safe
edit** (the ids renumber only on reorder), but choosing spans that dodge the shipped connectors in
the ballroom and gallery is a design decision with a draw-call bill, not a number to nudge, so I
did not make it.

✅ **AND THE `DIG_H` 2.80 m QUESTION AGAINST A 9.6 m STOREY IS MOOT TODAY, WHICH IS WORTH SAYING
BECAUSE IT LOOKS ALARMING AND IS NOT.** Every space that carries a dig face is a 4.80 m storey.
The 9.60 m room has no dig face for the 2.80 m band to look wrong in. If an edge is ever appended
to the ballroom, 2.80 becomes 29% of the wall height and the question becomes real.

### ⏱️ TWO CLOCKS, AND WHY THEY ARE REPORTED APART

- **FIND** — expected duds × measured dud probe cost. A probe costs **6–7 blows** (mean 6.14–6.29)
  everywhere, on every seed: that figure is remarkably stable. 🚨 **THIS CLOCK HAS A BAND, NOT A
  DIRECTION** (`dig.md` §5: the search IS the game). It must never be optimised downward.
- **THROUGH** — first blow at the answer to a body-passable hole: probe in, then work the channel.
  **39–52 blows, 37–49 s.** Passability is `openChannel()` + `pathPortals()`, never the picture.

`dig-free.mjs` F4 reports these fused as one number and reads **57 s** on seed s4. `dig-band` reads
61.8 s for the same seed at `study_w`; the gap is entirely that F4 assumes a 6-blow probe where the
measured mean is 6.29, and drove a 39-blow open where this drove 43. **The two instruments agree.**

### ⚠️ `PROBE_STEP` WAS THE LAST UNSOURCED NUMBER IN THE BAND, SO IT WAS SWEPT

FIND scales directly with how far apart a player probes, and 1.5 m was inherited from
`dig-free.mjs` with nobody ever having measured a player doing it. Seed s4, all three spaces:

| probe step | `study_w` | `service` | `study_e` |
|---|---|---|---|
| 1.0 m | 62.4 s | 70.7 s | 66.8 s |
| 1.5 m | 61.8 s | 64.6 s | 60.8 s |
| 2.0 m | 62.7 s | 71.3 s | **never finds it** |

**The band is robust to the assumption — every cell inside 45–75 s.** The interesting corner is the
last one: at a 2.0 m stride a player striding a study's 11.2 m of wall **steps clean over the
1.55 m region and gets K = 0**. That is arguably correct (thoroughness is the mechanic) but it is
the one player behaviour that turns a minute into forever, and it is undocumented.

### 🐞 FILED: THE SAME PASSAGE IS BODY-SIZED FROM ONE ROOM AND 0.12 m TOO NARROW FROM THE OTHER

**1 row in 15 (`service` @ `s7`) never opened at all**, and the stall sample says exactly why:

```
406 blows · channel stalled at 0.56 m · barrier-free band 0.925 m over 0.30–1.80 m
stall: 182/182 cells in the aim window are dug through (depth 1–1, mean 1); band 10 cells @ 0.0925 m
```

**Every cell is at depth 1.0. The material is GONE and `channel()` still refuses it**, so this is
passability quantisation and **not** a health, `DIG_HEALTH` or decay-curve defect — tuning the
falloff could not touch it.

⚠️ **AND IT IS ASYMMETRIC ACROSS THE TWIN, WHICH IS WHAT MAKES IT A BUG RATHER THAN A THIN
MARGIN.** `f.svc_w.0.a` (service side) and `f.svc_w.0.b` (study_w side) are the two faces of ONE
span with a cell-for-cell mirrored barrier and the same 0.925 m band — and on the same seed the
study side opened in **46 blows to a 0.74 m channel** while the service side stalled at **0.56 m
after 406**. `mirrorBarrierFrom` preserves the barrier cells exactly but **not their alignment on
`_macro`'s 2-cell lattice**, and the parity flips in the mirror. Suspected owner: `channel()` /
`_macro` in `src/destruction/damagefield.js`. Reproduces bit-identically on every run.

**Why the margin is thin in the first place, as arithmetic:** the ellipse must be clear at *every*
row a body occupies, so the usable band is its width at the **floor** (0.30 m), not at its waist.
`IC_H` 2.60 centred on a 2.80 m band puts that at **0.826 m** against a 0.68 m requirement — a
0.15 m margin against a quantisation loss measured as high as 0.37 m. `IC_H`'s own note quotes the
waist figure (1.51 m at 1.70 m), which is true and is not the binding one.
⚠️ **`IC_H` is the knob that would fix it without touching the search** — it moves the pinch and
not the horizontal footprint, so FIND is unaffected — but papering over a quantisation bug by
growing the region is a decision, and it changes the passage's silhouette. **Not taken.**

### Contracts, instrument notes, and what I could NOT stand behind

`npm run build` ✓ · `node harness/lint-glsl.mjs` ✓ · `dig-free.mjs` **15/15** (re-run after, seed
s4). **No file in `src/` was modified this round**, so `mechanics`, `escape`, `sledge-check` and
`dig-toggle` cannot have moved and were not re-run — stated as a deduction, not as a measurement.
Ports 5321–5326. `dig-band.mjs` is **14 passed / 2 failed**; both failures are the two findings
above and both are meant to stay red until someone owns them.

- ✅ **THE CLOCK IS BLOW-COUNT × `rules.js` `WEAPON_COOLDOWN.sledge`, IMPORTED NOT TYPED, AND THAT
  IS WHAT MAKES IT SURVIVE A BUSY BOARD.** `DamageField._add()` has no time term, so a blow count
  is bit-identical under any GPU load — **three consecutive runs agreed to the digit on all 15
  rows** while two other agents were saving files and running browsers. Wall time is reported and
  is explicitly not the measurement. `one uninterrupted session · 1 navigation` on every run.
- 🚨 **`DIG_HEALTH` AND THE DECAY CURVE DO NOT DRIVE THE DEFAULT ARM AT ALL, AND A BRIEF THAT NAMES
  THEM AS THE BAND'S KNOBS IS NAMING `?dig=bays`' knobs.** On a free face `DIG_FREE_DEFS` flattens
  the healths and `dig.js` says so in as many words — *"nothing consumes them on a free face"*.
  The free band is set by the brush constants in `damagefield.js` (`STRENGTH`/`RESIST`/`RIM`/
  `GRAIN`/`GRAIN_FLOOR`) for THROUGH, and by `IC_W` for FIND. **`IC_W` is the only band knob that
  lives in `dig.js`**, exactly as its own note claims.
- ✅ **THE `damage()` POINT-LESS TRAP IS CLOSED** — `wall.js` `damage()` was fixed earlier the same
  day to route a pointless hit into the brush at the face centre instead of falling to the scalar
  stage machine. A centre hit is still not a positional measurement, so every blow here goes
  through `applyHit(pointAt(u,v), 1)`; `dig-band` B2 asserts it (3 blows → 3 recorded field hits,
  and the wall a metre away reads depth **0**).
- 🚨 **THREE OF MY OWN PROBES LIED BEFORE THEY WERE RIGHT, AND ALL THREE ARE WRITTEN INTO THE
  SCENARIO SO THE NEXT ONE DOES NOT REPEAT THEM:**
  1. **The house-wide unlock leaks between spaces.** Resetting once per seed instead of once per
     *space* meant the first space's breakthrough dropped every barrier in the house, so the next
     space read **every probe spot a winner** (16/16, 8/8), FIND 0 s, and a THROUGH constant across
     five seeds. **A 0% spread was the tell** — there was nothing seeded left to vary.
  2. **`pathPortals` is memoised on `` `${a}>${b}|${minW.toFixed(2)}|${minH.toFixed(2)}` `` and is
     invalidated only by a stage change**, which on a free face is monotone and stops firing. A
     1e-4 jitter is rounded away by `toFixed(2)`, so the key never changed and later seeds got the
     first seed's route. The buster has to move a whole centimetre.
  3. **Demanding the route name the face I swung at read 9/15 on a correct build.** `_couple()`
     opens both sides of a span; the BFS names whichever it reaches first in panel-table order.
     Accepting the twin — the same physical passage — reads **14/14**. `dig-free.mjs` records
     fixing the identical mistake in its own link-face count; it is worth expecting a third time.
- **NOT MEASURED, and it is a refusal:** I never looked at a picture of any of this. Every claim
  here is off the damage grid and the portal graph, which is what the brief asked for and is the
  right instrument for a clock — but *"does a 0.74 m channel read to a player as a way through"*
  is a look question and is untouched by this round.
- **The `s7`/`service` row is excluded from `service`'s median** (4 seeds, not 5). Averaging a
  "never opened" into a seconds figure would turn a passability bug into "the band is a bit slow"
  and invite a retune that fixes nothing.

---

## 🚨 EVERYTHING BELOW DESCRIBES `?dig=bays`, WHICH IS NO LONGER THE DEFAULT (chunks-1, 2026-08-08)

**John played the segmented build and rejected it: *"I don't really want to use the dud bay. I
wanted a whole new system where white chucks fall off when hit with the hammer."*** `?dig=1` is
now **free-form positional destruction** — one continuous destructible face per span per room,
with a CPU damage grid that is both the shader's threshold source and the gameplay truth for
collision, tracing, sight and routing. `docs/design/dig.md` §3 always called this approach A,
*"the real thing, later"*.

⚠️ **`dig.md` §1 PREDICTED THE FAILURE IN ADVANCE** and the sections below quote the prediction
without noticing it applied to them: the mechanic was justified because *"with a handful of fixed
candidates you find the way through by counting padlocks. Here there is nothing to count."*
**Nine bays per wall is nine candidates.** Segmentation moved the counting from padlocks to
panels.

**The whole segmented build is preserved, unchanged, behind `?dig=bays`** — `dig-toggle.mjs`
**14/14** on that arm re-measures 36 segments, 36 brick slabs, 3 merged brick meshes and not one
segment that can reach a passable stage, exactly as recorded below. **So every figure in the rest
of this appendix is still re-runnable; add `&dig=bays` to the command line.** `dig-link.mjs`,
`dig-feel.mjs`, `dig-low.mjs`, `dig-fx.mjs` and `dig-promoted.mjs` are all written in the bay
vocabulary and belong to that arm.

**The free-form arm's own scenario is `harness/scenarios/dig-free.mjs`** (15/15):

```bash
node harness/playtest.mjs --view game.play --script harness/scenarios/dig-free.mjs   --port 5301 --q "seed=s4&dig=1"    --shots
node harness/playtest.mjs --view game.play --script harness/scenarios/dig-toggle.mjs --port 5302 --q "seed=s4&dig=bays"  # the old build, intact
```

| | `?dig=0` | `?dig=bays` | `?dig=1` (free) |
|---|---|---|---|
| dig panels | 0 | 36 segments | **12 continuous faces** (one per span per room) |
| the barrier | — | 36 brick slabs, merged, collapsible | **a channel of the damage texture, zero geometry** |
| `service.mid` calls (seed s4) | **596** | 583–590 | **605** / 625 |
| aperture groups | 2 | +1 | +3 (one per distinct span length) |
| the answer is | — | one bay of nine | a seeded **region** on a continuous wall |

🎯 **Measured against John's band** (`dig-free.mjs`, seed s4): a probe costs **6 blows**, opening
the interconnect to a body-sized channel costs **49**, and with 8 probe spots on one edge the
expected search is **70 blows = 67 s at a 0.95 s swing** — inside the 45–75 s band. ⚠️ The
seconds depend on a swing cadence `sledge-1` owns; the band holds for 0.70–1.10 s per swing.

⚠️ **THE LOW-BAY REFUGE IS GONE AND IT IS A RECORDED TRADE.** `SEG_H` 1.80 bought D7's
"too low for the hunter" mechanic for free; the free band is **2.80 m**, over `PASS_H.hunter`, so
a hole you dig is a hole the hunter can follow you through (John, 2026-08-07: holes open wherever
the hammer lands, at any height). §"A SEGMENT IS NOW A LOW BAY" below is `?dig=bays` only.

---

## 🕳️ THE INTERCONNECT EXISTS, SO A DIG IS A GAMBLE (dig-2, 2026-08-05). Still `?dig=1`, default off. BUILDING, UNSCORED.

**`docs/design/dig.md` §8 items 2 and 3 are built, and the falloff is now validated as a SEARCH
HEURISTIC and not only as a feel.** `dig-1`'s honest limit — *"until the interconnect exists EVERY
DIG IS A DUD"* — is closed. Driven, in seconds, on three seeds:

| seed | the way through | bays dug before it opened | held-trigger seconds |
|---|---|---|---|
| `s4` | bay **3** of 9 | 4 | **27.9 s** |
| `search-b` | bay **6** of 9 | 7 | **48.9 s** |
| `search-c` | bay **6** of 9 | 7 | **48.9 s** |

**About 7.0 s a bay, so finding it costs 4–7 duds and 28–49 s of the loudest noise in the game.**
That is the shape `dig.md` §1 asks for: a gamble with a real price, not a chore — and the answer
moves with the seed, so the wall cannot be memorised.

```bash
node harness/playtest.mjs --view game.play --script harness/scenarios/dig-link.mjs     --port 5271 --q "seed=s4&dig=1" --shots   # the search, the reveal, the unlock
node harness/playtest.mjs --view game.play --script harness/scenarios/dig-low.mjs      --port 5275 --q "seed=s4&dig=1" --shots   # who fits through a dug bay
node harness/playtest.mjs --view game.play --script harness/scenarios/dig-fx.mjs       --port 5281 --q "seed=s4&dig=1"           # what a real dig's FX costs
node harness/playtest.mjs --view game.play --script harness/scenarios/dig-promoted.mjs --port 5280 --q "seed=s4&dig=1"           # + the post-UNLOCK worst case
node harness/evidence/_tmp_dig_dress_correlation.mjs 2048                                                                                 # dressing vs the answer, 2048 seeds
```

### 🚨 THE DRESSING TELL IS CLOSED, AND IT WAS THE ONE THAT BROKE THE DESIGN'S CORE PROMISE
`views/game.js` filtered every segment out of `exterior.js`'s dressing, so **the only bays in the
wall wearing boards and a chain were the shipped connectors** — visible in the old
`game.play.dig-wall-pristine.png`. `procedural-map.md` §2 forbids it: *"a closed connector must
give NOTHING away."* The filter is gone (`panels: room.panels`).

⚠️ **AND IT WAS NOT A COPY.** The hardware is authored at one aperture and SCALED per instance, so
a padlock hung on a 1.14 × 1.80 bay came out **0.55 × 0.67**. There is now a second authored
**family** at segment scale (`exterior.js` `SEG_FAMILY`) — same link box, same board thickness,
same hasp, spread across a smaller opening, **one face instead of two** (a segment's back face is
inside masonry), and its own z offsets (**a connector's origin is the centre of the 0.30 m band and
a segment's is the room-side face**, so copying 0.17 across would have floated every chain 17 cm
off the wall).

✅ **AND THE POPULATION DOES NOT LEAK FROM THE OTHER END EITHER — 2048 seeds, 73 728 segment draws**
(`harness/evidence/_tmp_dig_dress_correlation.mjs`, the pure-node sweep `_tmp_seam_correlation.mjs`
pioneered):

| cue | the segment population | the live interconnect | stderr |
|---|---|---|---|
| chain | 50.1% | **50.0%** | ±0.6 pp |
| boards | 28.0% | **28.0%** | ±0.5 pp |
| mortar | 28.0% | **28.4%** | ±0.5 pp |

…and *"wears a combination nothing else on its own wall face wears"*: **any segment 22.8%, the
interconnect 22.2%.** `conn-1.mjs` C6 passes with the segments included (58 connectors, dressing
never reads state); the seam correctly never appears on one (`outside` is false for a segment).

### 🕳️ A SEGMENT IS NOW A **LOW BAY**, AND THAT ONE NUMBER IS THE D7 MECHANIC BACK
`SEG_H` **2.68 → 1.80**, sill on the floor. John's sentence is not "through the walls", it is
*"**beneath** the walls there is a secret pathway"*, and `dig-1`'s own note called the full-height
version *"a narrow bay, not the reference's big chunk"*. `buildWall` already emits a lintel box
**and a collider** above every cut, so the 3.00 m of wall above each bay is real geometry — **the
thing that excludes the hunter is the thing the player can see above the hole.**

⚠️ **`rules.js` `PASS_H = { robot: 1.70, hunter: 2.40 }`** is the new table, the vertical twin of
`clearWidth`. `room.collide(pos, r, passH)` and `room.pathPortals(a, b, minW, minH)` are the only
consumers. Measured (`dig-low.mjs`), bodies shoved at one opened bay:

- a robot (r 0.34, h 1.70): service → **study_w, 10.4 m past the face**
- a stage-1 hunter (r 0.42, h 2.40): **−0.42 m**, still in service · stage 3 (r 0.66): **−0.66 m**
- and the BFS refuses it the route too, so it never lines up at a hole it bounces off

✅ **INERT ON THE SHIPPED BUILD, WALKED RATHER THAN ARGUED: of 194 colliders, the only ones with a
base between 1.70 and 2.40 are the 36 dig lintels themselves.** Every authored opening in the house
is ≥ 2.68 m, so with `?dig=0` neither the collide nor the BFS change can fire.

⚠️ **I DID NOT SUB-DIVIDE INTO A LOW ROW PLUS A HIGH ROW**, which is what `dig-1`'s note priced at
"one more aperture group". It is worse: the interconnect must be low (John's sentence), so after one
run every player knows the high row is a dud and 36 extra panels buy nothing but duds nobody digs.
**The whole dig band being low says the same thing in half the panels** — the dig network is
robot-scale everywhere, and the hunter has to make its own hole.

### 👹 THE HUNTER CROSSES, AND ITS HOLE IS NOT YOUR HOLE
`dig.md` §2: *"the barrier is a ROBOT barrier and the hunter is not a robot in that sense."*
`_tooNarrowPanel` / `_blockingPanel` now ask `_canBreak()` (`canOpen()` **or** `room.digCanHunterCross`),
and a slam that lands on a segment already at `barrier` fires `room.hunterBreach()`, which takes
**the masonry, the 3.00 m lintel in BOTH rooms' skins, and the bay next door.**

⚠️ **THE BAY NEXT DOOR IS NOT DECORATION — IT IS THE ONLY WAY THE THING FITS, AND IT WAS FOUND BY
MEASUREMENT.** One column full height is 1.14 m wide and `collide()` is a circle push-out, so a
stage-3 body was refused at **exactly 0.660 m short of the face — its own radius**. Two contiguous
bays are 2.28 m and clear every stage: **clear height 1.80 → 4.80, and the same body that was
refused walks service → study_w.** Ablation: `room.setHunterCrossing(false)` and the same barrier
refuses the same hunter in the same page.

### ⚠️ THE HOUSE-WIDE UNLOCK IS GLOBAL, AND I LOOKED FOR A REASON IT IS WRONG
`?unlock=global | edge | off`, default **global**. `dig.md` §1 flags the reading as unconfirmed; I
did not find a reason it is wrong. The strongest argument against it is that global throws away
four fifths of the content the barrier pays for — **but the content is the SEARCH, and the search
still happens, once, with the whole house's worth of wall to do it in.** `edge` and `off` are both
built so the question stays answerable. `off` is also exactly the pre-interconnect build, so
`dig-1`'s figures stay re-runnable.

**The unlock is one assignment per panel**, because `dig.js` deliberately makes "the interconnect"
and "an unlocked segment" *the same table* (`DIG_OPEN_DEFS`): John's sentence is literally *every
segment becomes an interconnect*. Measured: **2 of 36 segments can open before, 36 of 36 after, and
all 36 brick slabs gone.** A dud you had already dug to the bottom becomes a door on the same
frame — *"players can continue digging"*, and the work you already paid for turns into a route.

⚠️ **AND THAT NEARLY RE-BROKE THE DRAW-CALL GATE.** `wall.js` `spent` requires `!canOpen()`, which
is what made demotion inert on the shipped build — and the unlock removes that clause from every
segment at once, so `dig-promoted.mjs`'s measured **792-against-625** would have come back with no
switch. `demoteOpen` (set by `room.js`, `?dig=1` segments only) is the fix; it is sound because
`applyStageBreaks` is driven by the stage INDEX and both tables terminate at index 4, so a finished
segment's four break amounts are the same constant whether the last row is `barrier` or `open`.

### 📐 THE NUMBERS, RE-MEASURED THIS ROUND
| | `?dig=0` | `?dig=1` |
|---|---|---|
| worst parked station (`eo2-calls`, seed s4) | **576** | **583** / 625 |
| dressing draw calls at that station | 4 (1 family) | **7 of 8** (2 families; a family with nothing shown is not drawn) |

- **`dig-promoted.mjs`, twelve stations, one page:** pristine 589 · all 36 at the barrier **616** ·
  **after the house-wide unlock, all 36 open: 613** — so the unlocked house is *not* a worse worst
  case. Demotion A/B in the same page: **798 → 616, −182.**
- 🆕 **THE FX COST OF A REAL DIG, which `dig-1` flagged as unmeasured: +5 draw calls.**
  Four transitions over ~7 s at `service.mid` (the stable station) peak **586 → 591**, +2110 tris.
  ⚠️ **`chapel.centre` — which can see no segment — pays +0.** `dig-1`'s +10 was **144 bursts on
  one frame**, a probe artefact, not a dig: both systems are one `InstancedMesh` per KIND, so the
  cost is the number of kinds on screen and not the number of particles. **`dig.md` §6's "instance
  every particle from the start" was already done before this design existed.**
- ⚠️ **The ballroom stations still do not reproduce**: `ballroom.centre` read baseline 557, peak
  560, **settled 583** — a settled value above the peak, in one page. Reported, not claimed;
  `service.mid` is the gate. This is the second round to see it.

### Contracts, and what I could NOT stand behind
`npm run build` ✓ · `mechanics.mjs` **11/11** · `escape.mjs` **20/20 on BOTH arms** (`?dig=0` and
`?dig=1`) · `dig-toggle.mjs` **14/0** · `conn-1.mjs` **14/0 on both arms** · `dig-link.mjs` 14/0 ·
`dig-low.mjs` 11/0 · `dig-fx.mjs` 7/0 · `dig-promoted.mjs` 9/0 · `dig-feel.mjs` 10/0 ·
`eo2-siege.mjs` **15.4–25.1 s against the recorded 15.5–25.1** — the siege did not move.
**Ports 5261–5293. Never 5178 (held all session), 5193 or 5310.**
- **GPU time NOT measured, and it is a refusal** — `perf-ab.mjs` hardcodes port **5178, which was
  LISTENING throughout**. Third round running to make the same call for the same reason.
- **`mansion.mjs` fails 3 of 27** (A8 residency max-visible 5 vs 3, A1 break-contact, A2 warning
  window). ⚠️ **I did not take a before baseline, so I cannot call them pre-existing on evidence** —
  but HANDOFF already records the mansion perf gate as failing, A2's own message says its bar is
  unreachable at that staging, and the default build's collide and BFS are *provably* unchanged
  (every collider walked, every opening ≥ 2.68 m). Someone should re-run it against `git`-clean.
- **The brick still does not read** — confirmed by looking, not inherited: in
  `game.play.dig-link-beam-dud.png` the masonry behind a bottomed-out bay is nearly black. `dig-1`
  said it and it is still true; `mat.brick` still belongs on the board beside `mat.lath`.
- **The beam-stage reveal is a LOOK claim and it is not judged.** What is *measured* is what is
  physically there: **static masonry 0.065 m behind the studs of a dud, the far room's own finish
  0.252 m behind the studs of the answer.** The render does see through the interconnect for free
  (the twin's layer planes are `FrontSide` facing its own room, so the aperture is empty from this
  side) — but whether a player reads "brick, or a way on" at a glance needs a critic.
- **`dig-low-two-kinds-of-hole.png` is badly framed.** The service passage is ~3.4 m wide and there
  is nowhere to stand that frames both kinds of hole cleanly; the boom clips the wall. The claim it
  is meant to support — a robot's 1.14 × 1.80 bay against the hunter's 2.28 × 4.80 breach — is
  measured, but not yet photographed well.

### What a third round should pick up
1. **`?unlock=edge` is built but never played.** Someone should decide global vs edge by feel
   rather than by argument; both arms are one query string apart.
2. **The dig band is visually DENSE now.** `DRESS_P` puts a chain on 50% of connectors and boards
   or mortar on 56%, which was fine for 22 connectors and is a lot across 58.
   ⚠️ **DO NOT RE-TUNE IT FOR CONCEALMENT** — `connectors.js` says why, and the population is
   honest. But a look critic should say whether the wall now reads as a wall.
3. **Only two edges are segmented**, so "one interconnect per shared edge" is proven on two edges.
   `DIG_EDGES` is still the table and appending is still the only safe edit.
4. **Multiplayer:** the interconnect and the unlock are both derived from the seed with no message
   (`seedRand`), but `hunterBreach` and the twin coupling mutate stage state and are authority-only
   by construction rather than by test. `test-net.mjs` has never seen a dig segment.

## ⛏️ DIGGING IS BUILT BEHIND `?dig=1`, DEFAULT OFF (dig-1, 2026-08-05). BUILDING, UNSCORED.

**`docs/PLAN.md` Phase 2 items 1, 2 and 3.** A shared wall is segmented, the depth falloff is
`STAGE_DEFS` tuned, and an ordinary segment bottoms out at a **brick barrier** it can never get
through — from either side. **The interconnect, the house-wide unlock and the hunter crossing are
NOT built and were deliberately left** (`dig.md` §8 items 2 and 3).

```bash
node harness/playtest.mjs --view game.play --script harness/scenarios/dig-toggle.mjs   --port 5245 --q "seed=s4&dig=1"   # is the toggle complete
node harness/playtest.mjs --view game.play --script harness/scenarios/dig-feel.mjs     --port 5246 --q "seed=s4&dig=1" --shots
node harness/playtest.mjs --view game.play --script harness/scenarios/dig-promoted.mjs --port 5248 --q "seed=s4&dig=1"   # the no-demotion worst case
node harness/playtest.mjs --view game.play --script harness/scenarios/dig-shots.mjs    --port 5254 --q "seed=s4&dig=1" --shots
node harness/playtest.mjs --view game.play --script harness/scenarios/wall-applyrace.mjs --port 5251 --q "seed=s4"      # a DEFAULT-BUILD bug, priced
```

### What a dig feels like, measured (`dig-feel.mjs`, seed s4, trigger held)

| | wallpaper | plaster | lath | beam | **to the barrier** |
|---|---|---|---|---|---|
| health | 50 | 140 | 330 | 850 | 1370 |
| **seconds** | **0.18** | **0.78** | **1.62** | **4.44** | **7.02** |
| one nail-gun round removes | 52% of it | 18.6% | 7.9% | 3.1% | |

**Every layer costs more than the one in front of it** — that is the whole mechanic, because
`_apply()` drives the break mask from `1 - stageHealth / def.health`, so a rising health IS a
smaller chunk per hit. **The feedback and the search heuristic are the same channel** (`dig.md`
§5), and there is no HUD number (§6a.2 forbids it). An ordinary `BREACHABLE` panel in the same
wall, same driver, same page: **1.26 s. A dud dig is ×5.6 a traversal breach** — `docs/PLAN.md`
Phase 2's *"an expensive dud finally exists"*, as a ratio.

### You cannot meet in the middle, and it is mechanical rather than level design

**One shared edge = two panels (one per room) + ONE brick barrier with NO STATE AT ALL.** That is
the strong form of `dig.md` §5's *"model it once per shared edge, never twice"*: two barriers kept
in agreement is a desync, and **zero barrier state cannot desync**. The brick is a static collider
and a merged mesh emitted in `buildSpace`, and no code path anywhere removes it.

Both faces of one segment driven to the end (`dig-feel.mjs`): both terminal at **`barrier`**
(`blocksMove: true, damageable: false`), **no breach portal for either**, **not in the BFS route**,
**sight blocked**, a body shoved at it for 120 steps got **0.000 m past the face**, and a damage ray
stops on the panel. 40 further nail-gun hits moved **0 stages** — and `blocksShots` stays true, so
it reads as *solid* rather than as a broken gun (`CHAINED_DEFS`' own reasoning).

⚠️ **AND THE TERMINAL STATE IS REQUIRED, NOT DECORATIVE.** `room.js` `breachPortals()` adds a graph
edge for any panel with `!blocksMovement()`. A segment terminating at `open` would hand the AI a
route through a wall that still has masonry in it.

### 🚨 NO DEMOTION WAS THE BINDING CONSTRAINT. IT IS NOW BUILT.

`instancing-1` named the condition for revisiting it and **the condition was met on the first
segmented build** (`dig-promoted.mjs`, twelve parked stations, seed s4):

| | worst parked station | promoted panels |
|---|---|---|
| pristine | **586** | 1 |
| 18 faces at the barrier | 591 | 19 |
| **all 36 faces, NO demotion** | **754 — OVER THE 625 GATE** | 37 |
| **all 36 faces, demotion on** | **622** | 37 |

**The A/B is one page, one station, the same 37 spent panels: `room.setDemote(false)` 754 →
`true` 622, −132 calls.** The mechanism is `wall.js`'s new **`spent`** getter — last stage of its
own table, undamageable, and **`!canOpen()`** — plus a shared `InstancedMesh` set per aperture in
`wallinstances.js`, exactly mirroring the pristine face. A spent panel's four break amounts are a
constant, derived by calling **the same `applyStageBreaks`** `_apply()` calls rather than by
copying numbers out of it.

⚠️ **IT IS INERT ON THE SHIPPED BUILD BY CONSTRUCTION, NOT BY A FLAG.** `spent` needs
`!canOpen()`, and `STAGE_DEFS` / `EXIT_DEFS` / `CHAINED_DEFS` all end at `open`. **An `open` panel's
look is constant too and could be demoted the same way — that is a real separate win and it needs
a round that owns `wallinstances.js` and can re-run the twelve-station A/B on the default build.**

### 🚨 A BUG IN THE **DEFAULT** BUILD, FOUND BY MEASUREMENT AND PRICED (`wall-applyrace.mjs`)

`setInstanced(true)` hides a panel's five meshes and early-outs forever after; `_apply()` assigned
`layers[i].visible` **unconditionally**, and `update(dt)` calls `_apply()` every frame for 0.55 s
after any stage change. So an instanced panel turned its own four layer planes back on and
**`PanelInstances.sync()` could not undo it** — the signature is unchanged and `setInstanced(true)`
is a no-op on a panel that already believes it is instanced. `views/game.js` `applyExitPlan()`
calls `_apply()` on all fourteen exit sites at boot, and the thirteen CHAINED ones are `pristine`
by the state machine's definition, so **this was live, not theoretical.**

Measured at `service.mid` on `?dig=0`: reproducing the old `_apply()` costs **+10 calls / +11
meshes**, a forced `sync(true)` clears **none** of it, and an explicit re-instance clears all of it.
**Fix is one line in `wall.js` `_apply()`. The shipped build's worst parked station therefore moves
586 → 578** — an improvement, and the one unconditional behaviour change this round makes.

### `?dig=1` is a complete toggle, and the arms were compared IN ONE PAGE

`dig-toggle.mjs` builds **both** arms off-scene from `buildTestRoom()` and fingerprints them
against each other — **13 passed / 0 failed**. It MATCHES where it must: all **22 shipped panels
byte-identical** (id, position, rotY, aperture, thickness and the whole stage table), collider
counts identical in every room no dig edge touches, 7 open portals both arms, `canOpen()` true for
all 22 in both arms. It DIFFERS where it must: 36 segments, 12 brick slabs in 3 merged meshes, a
baked brick material, and **not one segment that can ever reach a passable stage** — none of which
exists with the flag off.

⚠️ Its first version reported fourteen differences and **every one was the instrument**: it compared
the live room (post-`applyExitPlan`) against a virgin builder output. Both arms are now virgin and
the live room is checked separately against its own arm.

### Segmentation is FREE while pristine — `instancing-1`'s claim, re-measured at 3× the panels

`inst-census.mjs` with `?dig=1`, seed s4: **`service.mid` carries 29 panels on screen for 4 calls
and 0 own meshes** (it was 11 panels / 6 calls); `ballroom.north|centre` carry **49 panels for 6–7
calls**. `eo2-calls.mjs` worst parked station: **`?dig=0` 578 · `?dig=1` 584–590** — 36 extra
panels for ~0–6 calls, inside the ±spread this file already attributes to `service.mid`.
⚠️ `ballroom.south` reports a 45-call "panel cost" in that census for 4 panels; that is the
ablation catching something other than panels and I did not chase it. Not a claim.

### Contracts, and what I could NOT stand behind
`npm run build` ✓ · `mechanics.mjs` **11/11** · `escape.mjs` (seed s4) **20/20**, both re-run after
every change. ⚠️ One mechanics run reported 10/1 **while a second Chromium was running on another
port**; alone it is 11/11. Do not run two playtests at once and trust an input probe.
- **GPU time NOT measured, and it is a refusal** — `perf-ab.mjs` hardcodes port 5178, which was
  LISTENING throughout this session. Same call `instancing-1` made, same reason.
- **The pixel A/B of demotion was not taken.** `room.setDemote()` exists precisely so it can be
  done in one frozen frame; I priced the draw calls and did not photograph the two arms.
- **The FX cost of a real dig is unmeasured.** `dig-promoted.mjs` suppresses `onBreak` while it
  forces damage, because 144 bursts on one frame moved `chapel.centre` — which can see no segment
  at all — by +10 calls. Debris and dust are parented to the SCENE, so residency never hides them.
  `dig.md` §6's *"every particle in this design must be instanced from the start"* is unaddressed.

### ⚠️ ONE STANDING FIGURE IN THIS FILE DID NOT REPRODUCE

*"The ±2 spread is `service.mid` alone — every other station reproduces to the digit."* **Not in my
runs.** `service.mid` was the *stablest* station I had (578 / 580 / 584 / 586 / 589–591 tracking
real state changes). The **ballroom** stations moved without a state change: `ballroom.north` read
**579** and **622** for what should be the same 37-spent-panel state in one page, minutes apart,
with `panelCensus().ownMeshes` differing by 4. I did not isolate it and I am not claiming a cause —
**but do not gate anything on a ballroom station reproducing to the digit until somebody does.**
`service.mid` remains the right worst-case station.

Confirmed true and used as stated: `climbable` really is dead code (`isClimbable()`'s only caller is
`harness/test-wall.mjs`); there really is no vertical axis, which is why a segment is full height;
`breakmask` really is authored in the bake, so digging here is at PANEL granularity and nothing in
this round touches the impact point. **Ports used: 5241–5254. Never 5193 or 5310** — note that
`harness/mechanics.mjs` DEFAULTS to 5193, so always pass `--port`.

### What a second round should pick up, in order
**⚠️ ITEMS 1, 2 AND 4 ARE DONE — see the `dig-2` section above. Item 3 (the brick) and item 5 (only
two edges) are still open; item 6 still holds. The list is kept because the reasoning is why the
second round did what it did.**

1. ✅ **DONE (`dig-2`).** **The interconnect** — one segment per edge reaching `open` instead of `barrier`, seeded. The
   hook is already the only thing that separates them: `defsFor`-style table selection in
   `dig.js`. **Until it exists every dig is a dud, so the falloff cannot yet be validated as a
   SEARCH HEURISTIC — only as a feel.** That is the honest limit of this slice.
2. ✅ **DONE (`dig-2`), at segment scale and with the population swept over 2048 seeds.** ⚠️ **THE SEGMENTS WEAR NO DRESSING AND THE SHIPPED PANELS DO, WHICH IS A TELL.** `views/game.js`
   filters dig panels out of `exterior.js`'s dressing (the geometry is authored at 2.08 × 2.68 and
   SCALES per instance, so a padlock on a 1.14 m segment stretches 0.55×). Look at
   `progress/playtest/game.play.dig-wall-pristine.png`: the one bay in the run wearing boards and a
   chain is the one that actually goes somewhere. **`procedural-map.md` §2 forbids exactly that.**
   When the interconnect lands, the dressing must cover segments too — at segment scale.
3. **The brick is a first pass by a builder and has never been near `refs/lath/*`.** It is
   `stoneMat` with `course: 10`, chosen because `uCourse` is already a running bond and `dig.md`
   §6a.2 wants the legibility spent on the wall. In the west study it does not read at all
   (`game.play.dig-same-segment-from-the-other-room.png` is nearly black). **`mat.lath` is still
   NOT_BUILT and a `mat.brick` piece belongs on the board beside it.**
4. ✅ **DONE (`dig-2`) — but as a LOW BAND rather than as two rows; see above for why.** **A segment is a full-height 1.14 × 2.68 slot**, which reads as a narrow bay rather than as the
   "big chunk" of `refs/dig/dig-gallery-leg-breach.jpg`. Sub-dividing the height is what would let
   `dig.md`'s interconnect be *"a gap at the BASE of the wall"* and too low for the hunter — the
   D7 mechanic for free. It costs one more aperture group (2 more instanced meshes) and nothing else.
5. **Only two edges are segmented and the spans dodge the existing panels.** `DIG_EDGES` in
   `src/game/dig.js` is the table; the spans deliberately avoid `p.svc_w.*` / `p.svc_e.*` so a brick
   slab never lands behind a shipped BREACHABLE route and silently deletes it.
6. ✅ **NO SEED WENT STALE.** `PANELS` is not touched at all — the segments live in their own table
   and `EXIT_SITES` is `PANELS.filter(isExitSite)`, so `chooseExit()` cannot see them. Every seed
   quoted in every document still means what it said.



---

# 🗜️ APPENDED 2026-08-10 (`diet-2`) — moved verbatim out of `HANDOFF.md`'s core

`HANDOFF.md` now carries one line + one number + the instrument. The argument is here. Written by
`digband-1`, `digcover-1`, `calls-1`, `pace-1`/`pace-2`; where a block says "this file" it meant
`HANDOFF.md`.

## All six spaces dig, all six hold John's minute — and the rule that decides a layout

**⏱️ ALL SIX SPACES DIG, AND ALL SIX HOLD JOHN'S MINUTE** (*"lets go about a minute to dig into
another room"*). `digband-1` measured the three that existed; `digcover-1` appended five edges —
`gal_svc`, `gal_east`, `gal_chapel`, `bal_west`, `bal_east` — and the house now reads **chapel 48.4 ·
gallery 53.4 · ballroom 54.2 · study_w 63.0 · study_e 63.1 · service 64.1 s**, five seeds each.
**Nothing was retuned, in either round.**
🎯 **THE RULE THAT DECIDES A LAYOUT, AND IT IS COUNTERINTUITIVE: one interconnect region per EDGE,
so an extra edge adds ~1.3 to K and only ~2 to N — ADDING AN EDGE MAKES A ROOM FASTER, NOT SLOWER.
The knob is wall-per-edge, not wall.** Hubs land fast, dens slow, for a legible reason.
⚠️ **The ballroom's 2.80 m band reads in a 9.6 m room only because the room is not a 9.6 m wall** —
`ballroom-order.js` splits it at 4.80 m with a gilt frieze and the musicians' gallery above, so the
band sits at 58% of a lower storey, the same proportion that already ships in a study, and the eye
compares the breach to the D6 arch 3 m along rather than to the ceiling. **`DIG_H` stays 2.80 as a
looked-at decision.** A tall SINGLE-storey room would not be rescued this way.
✅ **MEASURED 2026-08-09 (`calls-1`) — the worst case with faces actually DUG, which no round had
taken.** A damaged face de-instances, so `digcover-1`'s honest "+6 for five PRISTINE edges" is not
the answer. One blow per face, one page, twelve stations, `?walls=instanced`
(`harness/scenarios/_calls1-dug.mjs`): pristine **426** → all 8 ballroom faces dug **517 (+91)** →
**all 28 free faces in the house dug 601 (+175)**, 692k of 900k triangles. **Both inside 625.**
🚨 **On the pre-`calls-1` build that same fully-dug state would have been ~857** — the dig had a
loaded gun pointed at the budget and nobody had fired it. Panel own-meshes drawn at
`ballroom.centre` go 0 → 115.
🎯 **Its clock is the reusable part: blow-count × `WEAPON_COOLDOWN` imported from `rules.js`,
never a stopwatch.** `DamageField._add()` has no time term, so four runs agreed to the digit while
other agents were saving and rendering — that is how you measure anything here under load.
⚠️ **Two premises it overturned:** `DIG_HEALTH` and the decay curve **do not drive the default
arm** (`DIG_FREE_DEFS` flattens the healths — those are `?dig=bays` knobs; **`IC_W` is the only
band knob in `dig.js`**, and span length is the other), and the point-less `damage()` trap is
**already closed**. `harness/scenarios/dig-band.mjs` is the instrument — extend it, don't rival it.

## ×8 is the base, and the search survives as a SHAPE, not as a cost

🚨 **×8 IS THE BASE, IT WAS ALREADY LANDED BY `pace-1` BEFORE IT DIED, AND `pace-2` VERIFIED IT
END TO END (2026-08-09).** `damagefield.js` **`DIG_BASE` = 8**, on the field's only writer so every
instrument sees it; `_add()`'s clamp is **split** (clamped copy sizes the brush RADIUS, unclamped
`power` scales the DEPOSIT) which is why `[ ]` was a no-op above ×1 before; `views/game.js`'s
ladder is re-centred to **`[0.125, 0.25, 0.5, 1, 2, 4]`** with **×0.125 the pre-2026-08-09 game
bit-for-bit** (`8 * 0.125 === 1`) and the keys read inside `!engine.capture`, so no scenario can
reach them. `WEAPON_COOLDOWN` did not move. **`BRUSH_R` did not move**, so `debris.js`'s recorded
`onChunk` tripwire is not armed.
✅ **RE-BASELINED, NOT DEFEATED, AND RE-RUN THIS ROUND:** `dig-band` **14/1** (the 1 is the
chapel's named floor-plan line) with the **clock REPORTED and no longer gated** — John suspended
the set time, and `DIG_BAND="lo,hi"` re-arms it in one env var the day he names a new one; its
**B2c drives at `brush.base = 1`** so the reintroduction check keeps the depth resolution it needs
(2.6% dead against 54.1% with the defect put back). `dig-free` **15/15** · `sledge-check` **13/13**
· `escape` **20/20** · `dig-cover` **6/0** · `eo2-calls` **426/625** · `_progkey1-independence`
**12/12 on both arms** · `_st1-remain` **11/0** · `mechanics` **11/12** (the `slowframes` failure
is `inputfix-1`'s).
🚨 **AND THE SEARCH SURVIVES ONLY AS A SHAPE, NOT AS A COST — MEASURED, five seeds × six spaces,
and the argument is written into `dig-band.mjs`'s header.** **A probe now costs exactly 1 blow in
every room on every seed** (it was a very stable 6.14–6.29). The geometry is untouched — the
interconnect still covers **32%** of probe spots and the seeds still give **30 distinct
winning-spot sets in 30 rows** — but FIND is now **0.0–3.6 s** house-wide and TOTAL medians are
**chapel 2.4 · gallery 3.6 · ballroom 3.8 · service 5.5 · study_w 6.0 · study_e 6.4 s**, 9.4×–25.3×
under the retired 60 s target. `dig-free` puts dud : answer at **1 : 3.0**, from 6 : 49.
🎯 **AND THE PROBE-SPACING TRADE HAS INVERTED, which is the part a designer should see:** the old
pacing charged you for probing finer (1.0 m read 62.4 / 70.7 / 66.8 s against 1.5 m's 61.8 / 64.6 /
60.8); at ×8, 1.0 m is **equal or faster in four of six rooms**. **Over-probing is no longer
punished.** The knob if John wants the search back is `dig.js` `IC_W`, never the base speed.
