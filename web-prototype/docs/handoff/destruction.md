# Destruction — the dig grid, support/collapse, debris, the aim mark

**Appendix.** Read this when you touch `src/destruction/**` (`damagefield.js`, `support.js`,
`wall.js`, `breakmask.js`, `debris.js`), `src/game/aimmark.js`, or `views/game.js`'s `onChunk`.
`HANDOFF.md` carries one line and a number for each of these; the ARGUMENT lives here and in the
named scenario headers.

Assembled 2026-08-10 by `diet-2` from `HANDOFF.md`, verbatim — every block below was written by the
agent that measured it (`unblock-1`, `seethrough-1`, `digparity-1`, `visible-1`, `pace-2`,
`collapse-1`, `collapse-2`, `aim-1`). Where a block says "this file" it meant `HANDOFF.md`.
⚠️ Provenance, not scripture: these are agents' accounts of their own work. Re-measure before you
quote a number, per the standing rule.

## Contents

1. The see-through defect — a body-sized hole you cannot walk through (`unblock-1`, `seethrough-1`)
2. The "not here" clank firing on success
3. The softlock — `MACRO` 2 → 1, and the invariant that generalises
4. The last 58% of a dig was invisible (`visible-1`)
5. Section thickness — `SEC_FLOOR` (`thickness-1` / `pace-2`)
6. Support: connectivity refuted with a number (`collapse-1`)
7. The arch, and what John rejected first (`collapse-2`)
8. Debris: the chunks used to float (`collapse-2`)
9. The aim mark and the step-up (`aim-1`)
10. **Open LOOK questions — the slice critic's deliverable** (added 2026-08-10; `HANDOFF.md` points
    here rather than carrying them)
11. **The sag — the arch gives in stages, and the fall stopped being a sheet** (`sag-1`)
12. **The collapse cost — a wall that lands on you takes a LIMB, and it is avoidable** (`limbs-1`)

---

## 1. The see-through defect — a body-sized hole you cannot walk through

- 🚨 **YOU CAN DIG A BODY-SIZED HOLE AND NOT BE ABLE TO WALK THROUGH IT, AND THE WALL STOPPING YOU
  IS INVISIBLE.** John hit this in play and diagnosed the second half himself. **Confirmed by
  measurement** (`_pf1-diag.mjs`): after `[B]`, the near face is open with a **1.46 m channel**,
  the **twin is untouched and solid**, and a body is refused. Two causes stack:
  1. **Depth is per side.** The twin panel has its own `WallState` and its own depth, still 0.
     `[B]`'s `setBarrier(false)` clears the barrier *cells* on every dig panel but **digs nothing**.
  2. **The remaining wall cannot be seen.** `aperture-1` flipped only the **scalar** arm to
     `DoubleSide`; dig panels stayed `FrontSide` deliberately (a free face already has a twin
     facing the other way, and double-siding would put the far face's planes inside the near
     face's crater). **Consequence nobody drew: once you dig through your own side, the twin's
     planes are backface-culled from your eye — you see into the next room, cannot walk there, and
     nothing on screen explains why.** John: *"you can't see the back side of the other wall and
     thats why im unable to see the bits I can't get through."*
  ✅ **HALF OF THIS IS FIXED — `[B]` KEEPS ITS PROMISE NOW (`unblock-1`, 2026-08-09).** It printed
  *"BARRIERS OFF — DIG ANYWHERE"*, a claim about getting through, and it was false.
  🎯 **THE CAUSE WAS AN ORDERING BUG, NOT A MISSING MECHANIC, AND NOTHING NEW HAD TO BE BUILT.**
  `WallPanel._couple()` already mirrors through-cells onto the twin, and `applyHit` fires it on
  `res.brokeThrough` — but `brokeThrough` requires a cell to reach `OPEN_AT` **with no barrier
  behind it**, so while the cyan is up a player digging to the barrier NEVER breaks through and
  the coupling never runs. Clearing the barrier afterwards did not retroactively fire it.
  `toggleBarriers` now runs a second pass replaying the coupling the barrier suppressed — it digs
  nothing and removes no material the player did not already remove. Two passes, and the order is
  load-bearing (`_couple()` skips a source cell whose own barrier is still set).
  **Re-measured with the instrument that found the lie** (`_pf1-diag.mjs`, same face, same seed):
  twin `f.gal_east.1.a` **0 cells through / channel 0 m / body −0.34 m REFUSED** → **548 cells
  through / channel 1.463 m / body 8.6 m THROUGH**, `freePassable` 0 → 2.
  🚨 **`_pf1-diag.mjs` THEREFORE REPORTS 2 FAILURES ON A GOOD TREE — its assertions were written
  to CONFIRM the defect, so they invert once it is gone. Its header now says so in full. Do not
  "repair" the code it points at.**
  ✅ **AND THE OTHER HALF IS FIXED TOO — BOTH OF IT (`seethrough-1`, 2026-08-09). `_pf1-diag2.mjs`
  HAS NOW RUN, AND IT WENT 5/2-FAILED → 7/0.**
  🎯 **THE SHIPPED UNLOCK HAD THE SAME BUG AND IT IS ONE MISSED CALL IN A FILE `unblock-1` DOES
  NOT OWN.** `room.unlockBarrier()` reaches `WallPanel.setBarrier(false)` (`wall.js`), not
  `views/game.js`'s `toggleBarriers`, so it never got that second pass. Measured before the fix:
  an abandoned 60-blow dig, then a **legitimate** interconnect breakthrough elsewhere in the house
  — near face reports a **1.737 m channel**, twin **0 hits**, body **−0.19 m REFUSED**; and swept,
  **the two faces of one band disagreed about passability on 42 of 42 span×seed pairs.** The fix
  is `setBarrier(false)` replaying the coupling the barrier suppressed, i.e. `unblock-1`'s own
  ordering insight moved down into the panel where **both** callers reach it. After: body
  **8.6 m past**, **0 of 42 disagree**. ⚠️ **`toggleBarriers`' own second pass is now redundant
  but harmless** (`_couple()` early-outs when nothing changed) — `unblock-1` owns whether it goes.
  🎯 **AND THE RENDERER HALF IS FIXED WITHOUT `DoubleSide`, WITHOUT A MESH AND WITHOUT A DRAW
  CALL, BECAUSE ROUND 5 ALREADY BUILT THE HOOK AND PAINTED IT THE WRONG MATERIAL.**
  `breakmask.js` `barrierMaterial` has had a *"this face is not through yet, so draw the wall
  band instead of discarding"* branch since round 5 (`uOpenAt`) — it filled it with `uCavity`,
  *"the same near-black the reveal box is painted, because that is literally what is there."*
  **It is not what is there:** a reveal box lines an aperture, a dig band is 0.30 m of solid wall,
  and painting it near-black is what made the breach photograph as a black void you would walk
  into. It is now the **white the shell already is** (`uRemain`, continuing `DIG_BAND_LOOK[3]`'s
  0.780 ramp, with its own emissive for the same reason round 11 gave). The branch also now asks
  the **BAND** rather than this face — a second sampler, `tTwin`, on the twin's grid with `u`
  mirrored — so *the renderer can no longer show a hole the far side still fills.*
  📉 **Measured, one crater, one camera, one frozen page, both arms as UNIFORMS**
  (`harness/scenarios/_st1-remain.mjs`, 10/0, same-config floor **0.00**): John's exact state
  reproduced — a dug dud, barrier dropped, body refused at −0.19 m — goes **luma 35.6 → 109.9,
  48.4% of the breach under luma 20 → 6.0%**. The everyday interconnect mid-dig, no unlock
  anywhere, goes **9.7% under luma 20 → 0%**. **The cyan is |Δ| 0.000** — both new terms are gated
  on the G channel, so every texel with structure behind it takes the byte-identical path — and
  **`wall.sheet` PASS 78 is byte-identical against a baseline taken this round** (sha1).
  ⚠️ **NOT JUDGED, AND IT IS A LOOK CALL A BUILDER MUST NOT MAKE FOR ITSELF:** whether 0.720
  albedo / 0.055 emissive is the right white, and whether the filled crater reads as *recessed
  wall* or as *a flat white card*. Frames:
  `progress/playtest/game.play.st1-{uncoupled-twin-ON,uncoupled-twin-OFF,unlocked-dud-NOW,
  unlocked-dud-WAS,interconnect-middig-NOW,interconnect-middig-WAS}.png`.

---

## 2. The "not here" clank was firing on SUCCESS

- ✅ **FIXED, both halves — the "not here" clank was firing on SUCCESS.** `depthAt` reads 1.00 at an
  indestructible barrier **and** at every cell you punch clean through, so depth alone could not
  tell "you cannot get through" from "you just did": driven against a real 63-blow dig, **10 blows
  on breakable material played the refusal sound.** `applyHit` now returns
  `barrier: !!this.field.barrierAt(u, v)` (and an honest `false` on the scalar arm — a stage panel
  has no cyan behind it), `player.js` passes the whole result, and `playMeleeImpact` resolves
  `barrier > brokeThrough > blocked > depth`, falling back to depth when the field is absent.
  ⚠️ **`res.blocked` is NOT a substitute and this was measured, not assumed** — driven against an
  all-barrier field it was true **zero times in 63 blows**, because the 0.52 m brush always finds a
  neighbouring cell it can still remove. That wrong answer was authored, tested and discarded.

---

## 3. The softlock — `MACRO` 2 → 1, and the invariant that generalises

- ✅ **FIXED — the softlock where a fully-dug wall was still not a passage. `_macro`'s `MACRO` 2 → 1.**
  **16 of 1750 face×seed pairs were unopenable; now 0.** ⚠️ **And both filed diagnoses were wrong,
  including the one I forwarded as strong evidence** — worth reading, because the error is the
  reusable part. The story was "`mirrorBarrierFrom` flips the lattice phase in the mirror", backed
  by n=3 stalls all on mirrored `.b` faces. **The phase does flip on odd-length runs, and it buys
  nothing**: the full-macro-column count is identical on every row, and `channel()` reads 0.740 m
  on *both* twins at depth 1.0. Over the full 1750 pairs the split is **6 on `.a`, 10 on `.b`,
  both axes** — and the originally filed instance is itself an `.a` face, which the mirror never
  touches. **n=3 was a small sample and I called it a strong signal.**
  🎯 **The real invariant, and it generalises: the quantum passability is measured in must be
  smaller than the passage's margin over a body.** It was three times larger — margin **0.051 m**
  against a quantum of **0.185 m** — so losing any single one of the 36 macro cells a passage is
  made of cost it 0.740 → 0.555 m permanently.
  ✅ **The cyan got STRICTER, not looser:** `OPEN_FRAC` 0.7 over a 2×2 block meant 3-of-4, so a body
  could structurally be let through a 9.4 cm strip of barrier. At `MACRO` 1, `gone` ⟺ `passable`,
  and that is false under a barrier cell.
  ⚠️ **Band moved the safe way: 46 → 48 blows (+1.9 s), still in band in all six rooms.** Cost is
  collider boxes on a *damaged* face 11 → 39; **pristine stays at 1**. `IC_H` never touched.
  🚨 **AND THE OBVIOUS REGRESSION GATE DOES NOT CATCH THIS — measured, not argued.** "A fully
  excavated span must be passable" **passes on all 70 pairs at the broken setting** while three
  rows are unopenable. The gate that works is **margin ≥ quantum**, both read off the live grid;
  validated by reintroduction (FAILS at `MACRO` 2, PASSES at 1).

---

## 4. The last 58% of a dig was invisible (`visible-1`)

- ✅ **FIXED 2026-08-09 (`visible-1`) — 58% of every cell's life was invisible, AND THE REAL
  FIGURE IN PLAY WAS WORSE THAN THE ARITHMETIC ONE.** `DAMAGE_BANDS`' deepest layer saturated at a
  **smoothed** depth of **0.420** while `passable()` needs **raw 0.999**, so raw 0.42 → 1.0
  rendered identically. `digparity-1` filed that as a worst-case aiming model. **It is not a worst
  case.** Driven on three seeds with the most flattering plausible aim there is (`dig-band` phase
  2 — every blow at the LEAST-DUG cell, so the player never swings at a hole they already made),
  over 144 blows of real THROUGH work: **62.5% of blows moved nothing within 25 cm of where the
  hammer landed**, 57.6% delivered under a tenth of a fresh blow's visible work anywhere in the
  52 cm brush, and **72.9% landed on a texel already fully torn.** A probe reads 66.7%.
  🚨 **THE FIX HAD TO BE MATERIAL SURVIVING LONGER, AND THE ARGUMENT IS SHORT ENOUGH TO CARRY.**
  Past smoothed 0.42 all four layer planes have discarded at that texel, so the ONLY surface left
  on screen is `barrierMaterial`'s plane — the cyan, which John has settled twice must never
  appear to take damage. **There was no surface in the last 58% that was allowed to change**, so
  no shading, glow, decal or per-blow evidence could ever have worked; progress can only read if
  there is still destructible material at the point of impact. **`DAMAGE_BANDS[3]` is now
  `[0.420, 1.000]`** — the back of the shell picks the depth axis up exactly where the front leaves
  off, so the cyan is revealed progressively and every blow past the front's tear still takes
  material away where it lands. **4.1% dead, down from 61.4%.**
  ✅ **AND THE GATE IS VALIDATED BY REINTRODUCTION IN THE SAME PAGE, ON EVERY RUN** — `dig-band.mjs`
  **B2c** drives both arms and FAILS ITSELF if putting the old table back does not go blind. The
  bands are uniforms, so the defect is one `uDmgBand.set()` away.
  ⚠️ **BANDS 0-2 ARE UNTOUCHED AND THAT IS WHAT PROTECTS EVERY SCORED RESULT** — the crater's
  outline, round 6's one ragged tear and the raggedness `critic-dig-5` closed are all functions of
  bands 0-2. `wall.sheet` **PASS 78** and `game.play` **PASS 76** are **byte-identical captures**
  against baselines taken this round (`progress/visible1/`), and the scalar arm's emitted GLSL is
  unreachable from the change (`uLitBand` lives in `DAMAGE_PARS`).
  ⚠️ **THE TRADE, STATED: the cyan's diameter at the END of a dig goes 96% → 88% of the breach**
  (`critic-dig-4`'s *"it should fill nearly the whole breach"*). Eleven candidate bands were priced
  against one recorded drive (`harness/evidence/_visible1-analyse.mjs`); this one pays **8 points of fill
  for 58 points of dead blows** and is the cheapest point on the curve.
  ⚠️ **Band 3's COLOUR moved with it and had to**: round 6 chose 0.280 on the stated premise that
  layer 3 *"is NEVER seen head-on"*, and it is now the crater FLOOR for most of a dig — at 0.280 it
  photographed as a flat mid-grey ring, i.e. the contour map round 6 deleted. At 0.780 the two
  white faces read as one material and **the width of the surviving white IS the remaining
  thickness of the wall.** The cut face and the dark contact line before the cyan are unchanged.
  ⚠️ **THE BAND DID NOT MOVE**: both arms drove **bit-identically** in one page (same blow counts,
  same channel widths, opened at 44 on both) — `_add()` never reads this table — and `dig-band`
  reads 6/6 in John's minute.
  ⚠️ **NOT JUDGED: the section at a GRAZE.** `ThirdPersonCamera` puts the boom behind the player
  along the look direction, so at a graze the robot covers the whole hole and the boom's wall
  raycast shoves the camera into the corridor. Framing it needs a camera not derived from the
  player (`shoot.mjs --cam`), which cannot dig. `_visible1-shots.mjs` records the failure.
  Pictures: `progress/playtest/game.play.vis1-r10-*.png` (the old arm) against `…-r11-*.png`, one
  crater, one camera, one page, at 0/6/12/20/30/31/38/44 blows.

---

## 5. Section thickness — `SEC_FLOOR`, and a gate that failed a correct build

⚠️ **The dig-site DEPTH work is `thickness-1`'s `SEC_FLOOR` and it is real but SUB-PIXEL AT PLAYER
RANGE.** `breakmask.js` `uSecFloor` (a minimum section width in PIXELS, band 3 only, `[6, 10]`)
takes the break edge from **median 1 px / mean 2.61 → median 2 / mean 3.22**, |Δfill| **−0.03 pp**
against a **0.000** same-config floor, and it is what finally puts round 10's `uCore` cyan-in-
section on screen (core 1.31% → 1.60% of the breach rect). **At 6× the cyan plainly reads as a
slab with a bright front face and a darker return; at 1:1 it is still 2–3 px and John's *"I can't
tell at a glance"* is NOT closed.** `[8, 20]` measures better and is correctly rejected — looked at
twice now — because it throws detached dark-teal specks into the flat fill, i.e. the cyan reading
as damaged. Frames: `progress/playtest/game.play.th1-{player-eye,section}-*.png`.
🚨 **`_th1-section.mjs` WAS FAILING A CORRECT BUILD AND THE CAUSE IS THE REUSABLE PART:** it swept
five arms and then asserted on **`read['5px-cap6']`** while `wall.js` shipped `[6, 10]` — a typed
arm name that drifted from the constant, reading 2.61 → 2.67 px against its own bar. **The arm
list is now BUILT from an imported `SEC_FLOOR`**, so it re-points itself; **10/0**.
⚠️ **AND ONE COMMENT IN `wall.js` WAS LYING IN THE EXACT WAY THIS FILE WARNS ABOUT.** It said the
barrier material *"paints a contact shadow where the broken rim tucks over it"* — round 5 deleted
`_bcontact` by name for being a 2× brightness ramp keyed to how far you had dug. **The barrier
shader paints NOTHING on any cyan texel**: its two mixes are both gated on the G channel. The
cyan's only thickness cue is drawn by the SHELL (`uCore`), and a future round must widen or darken
that band rather than add occlusion here.

---

## 6. Support: connectivity refuted with a number (`collapse-1`)

- ✅ **BUILT 2026-08-10 (`collapse-1`) AS A SUPPORT TEST, AND `docs/design/disconnection.md`'s
  CENTRAL PROPOSAL IS REFUTED WITH A NUMBER RATHER THAN AN ARGUMENT.** That doc specifies a
  connected-components flood fill dropping material fully SEVERED from the face. Measured on the
  shipped grid over 220 blows × 3 seeds (`debris-collapse.mjs` C1): **7 cells ever severed,
  largest component 4 cells** — 0.06 m² of single chips across a whole dig, against a 26-cell
  floor below which `views/game.js` will not even spawn a slab. A radial dig excavates a **bowl**;
  the border ring stays intact, so everything is still joined through the rim and a flood fill can
  never call anything free.
  🎯 **A cell with a hole under it is UNSUPPORTED long before it is DISCONNECTED**, so the rule is
  an ARCH and not a graph of what is left, and it lives in **`src/destruction/support.js`**.
  ⚠️ **The flood fill is still there — it just fills the right set: HANGING material, not
  SURVIVING material.** That one word is the difference between a test that fires on 7 cells in a
  whole dig and the rule the mechanic is built on. `disconnection.md` §6 — *the piece that falls is
  the piece that left, at the size it left* — survives intact and is what `views/game.js`'s payout
  obeys.
  🚨 **AND THE FIRST SHIPPED VERSION OF THE TRIGGER WAS REJECTED IN PLAY — SEE THE `collapse-2`
  ENTRY BELOW.** A bottom-up span sweep with the cascade always live took the whole storey off the
  first through-blow low on a face; John: *"it should not collapse the entire wall from just
  hitting the bottom once in 1x dig mode."*

🧱 **UNSUPPORTED WALL COMES DOWN, AND IT IS A SKILL RATHER THAN AN EFFECT — `collapse-1`,
2026-08-10.** John: *"extra pieces to break off if much of the wall has already been cleared around
it… **this could create an efficiency for the player to utilize as a skill to differentiate
themselves — how effectively they can break down large segments with the least hits**."*
🚨 **THE DESIGN DOC NAMED THE WRONG TEST AND IT IS NOW REFUTED WITH A NUMBER, NOT AN ARGUMENT.**
`disconnection.md` §2 specifies a connected-components flood fill dropping material fully SEVERED
from the face. On the shipped grid, 220 blows × 3 seeds: **7 cells ever severed, largest component
4** — a radial dig excavates a bowl, the border ring stays intact, nothing is ever an island.


---

## 7. The arch, and what John rejected first (`collapse-2`)

⚠️ **SUPERSEDED IN ONE CLAUSE BY §11, AND IT IS THE CLAUSE THE WHOLE SECTION TURNS ON.** *"Once one
region's load reaches `fail`, that whole region comes down in one event"* was **also rejected in
play** — John found it *"too uniform… I want the collapse to also feel more bit by bit"* — and the
arch now gives in stages with the region hanging between them. **Everything else below still holds
exactly** (the threshold, the course rule, the ×1/×0.125 symmetry, the tell, the cyan), and
`COLLAPSE.sag = false` restores what this section describes bit-for-bit. ⚠️ **The C5 figures quoted
below (9 events / 450 cells / biggest 408) are the ROUND-13 numbers; the shipped ones are in §11.**

🧱 **AND THE RULE THAT REPLACED IT WAS REJECTED IN PLAY TOO, SO READ THIS PARAGRAPH BEFORE THE
REST — `collapse-2`, 2026-08-10.** John, after playing `collapse-1`: *"It does collapse everything
unsupported but I think it **should not collapse the entire wall from just hitting the bottom once
in 1x dig mode**. I think instead when we blow through and the below feels unsupported it should
**also consider structural integrity of the other connected parts of the wall**, and when **that
falls below a certain threshold** that's when **the collapse chains**."*
🎯 **THE MODEL NOW SHIPPED IS HIS, AND IT IS TWO SENTENCES: THE ARCH.** A wall arches over its
holes — material with a hole anywhere beneath it in its own column is *hanging*, carried to the
piers rather than standing on the ground. Every **connected region of hanging material** is
weighed (`COLLAPSE.fail` = **3.40 m² of original wall**, `Σ (1 − depth) × cellArea` over the
region); while a region is under the threshold the arch holds and only the ONE COURSE directly
over a run wider than `span` sheds; once a region reaches it, **that whole region comes down in
one event**, in waves, until the wall stops moving.
📐 **MEASURED ON THE SHIPPED GRID AT ×1** — one bottom blow hangs **2.34 m², 69% of the threshold**
(2 cells fall, 260 crazing); **hammering ONE SPOT plateaus at 1.82–2.24 m² and NEVER fires, at
either arm**; a minimum body channel dug upward *peaks on its first blow at 2.26 m² and falls*,
because digging upward removes the very material that would hang. Widening a low cut goes
**2.34 → 3.18 → 4.38 m²** and takes the storey on the third blow.
⚠️ **THE THRESHOLD IS AN AREA IN m², NOT A FRACTION OF THE FACE, AND THAT WAS MEASURED, NOT
CHOSEN.** One bottom blow hangs **14.7% of a 5.72 m face and 35.1% of a 2.56 m one** — a
fraction-of-face threshold would take a small wall down on a single hit. In m² the same blow hangs
**2.34 and 2.52**: the mass over a 1.04 m hole is the mass over a 1.04 m hole.
🎯 **AND IT IS WHAT CLOSED THE ×1 / ×0.125 ASYMMETRY THIS FILE ASKED SOMEONE TO REDUCE.** The old
1.45 m SPAN rule is 15 cells and a ×0.125 blow is 6.6 cells across, so a run only reaches it if the
player deliberately merges craters — **it never fired at ×0.125 on any drive measured** (widest run
9 cells over 240 blows), i.e. the mechanic was effectively dead on that arm. A load threshold is in
metres of wall rather than in blows, so both arms have the same optimal strategy — cut low, cut
wide — and differ only in what it costs: **the arch chains at blow 2 at ×1 and blow 64 at ×0.125,
and the event is the same shape (4.83 m² against 6.23 m²)**. `harness/scenarios/_collapse2-arms.mjs`
is the instrument, **11/0**.
🎯 **THE SKILL IS MEASURED IN BLOWS AND IT IS REAL, AND THE ARCH WIDENED IT.** Both arms digging at
the SAME spot, random scatter costs the following multiple of a marching undercut's blows
(`debris-collapse` C5, five seeds, same face, same target):

| | 1.16 m² | 3 m² | 6 m² |
|---|---|---|---|
| the span sweep (`collapse-1`) | 1.10× | 2.00× | **2.81×** |
| the arch (`collapse-2`) | 1.10× | 1.40× | **12.50×** |

🚨 **AND THE REASON IS THE PART A DESIGNER SHOULD READ.** Under the span rule a scatter accidentally
satisfied a row-length test and got a free storey; under the arch it builds several small hanging
regions that never merge into one heavy enough, so it gets **18 small course-sheds totalling 155
cells, biggest 18**, against the undercut's **9 events totalling 450 cells, biggest 408**. Scatter
gets chips; aim gets the wall. At a fixed 60-blow budget the undercut still opens **343 cells
against 123** for hammering one spot (2.79×, unmoved).
🕸️ **AND THE WALL WARNS YOU FIRST, WHICH IS THE HALF THAT MAKES IT LEARNABLE.** *If collapses look
random there is no skill, only luck*, so `support.js` `strain()` runs the SAME sweep at
`nearFrac` × the threshold and writes the damage texture's **A channel** — the one byte in it
nothing had ever used. `breakmask.js` `uCraze` opens hairline cracks along the plate lattice's own
fracture walls in proportion to it: **up to 219 cells crazing at once, peak 0.667, on every blow of
a dig, one blow of lead at ×8 and 57 at ×0.125.** It is diegetic (a multiply on albedo, no icon,
nothing in screen space) and **it is the rule and not a lookalike** — ablate `span` and the crazing
goes with it, 219 → 0, checked on every run.
📉 **ON THE SCREEN AND FREE, both as a paired in-place UNIFORM flip in one frozen page**
(`_collapse1-shots.mjs`, floor 0.00%): **7.24% of the face rect darkens by more than 2 luma, 3.33%
by more than 6, worst 73.7, mean 7.13 on the pixels that moved** — and **236 → 236 draw calls with
the triangle count identical to the digit** (359820 both arms), because it is a term inside a
shader that was already running, on a texture channel that already existed. ⚠️ **Re-measured on the
`collapse-2` arch, 2026-08-10: the coverage is the same and the CONTRAST nearly doubled** (worst
38.3 → 73.7, peak strain 0.667 → 1.00, 219 → 313 cells), because the arch paints the whole hanging
region at its own load rather than a relaxed span sweep's fading cascade. `wall.sheet` **PASS 78 is byte-identical**
against a baseline taken this round (sha1 `9bbe3234…`): `uCraze` lives in `DAMAGE_PARS`, so the
scalar arm never sees it.
⚠️ **A MEAN OVER A RECT IS THE WRONG STATISTIC FOR A LINE FEATURE and the first version of that
check used one** — the same crazing reads as **0.7% of the rect's mean luma** and would have been
filed as "technically present, probably invisible". Crazing is hairlines; measure how many pixels
moved and by how much, not the average.
🖼️ **Frames**: `progress/playtest/game.play.collapse1-{strain-ON,strain-OFF}.png` (the tell, same
frozen frame, uniform flipped) and `…collapse1-undermined-{BEFORE,FALLING,LANDED}.png` — one blow
removing 0.66 m²·depth low down, and a **full-storey column coming away as four large angular
slabs** with the cyan behind it, then **68 pieces resting** in a drift at the skirting.
⚠️ **`span` MOVED 1.05 → 1.45 m AND THE REASON IS THE ×8 PACING; IT IS STILL 1.45 AND IT IS NOW
THE *COURSE* RULE, NOT THE STOREY RULE.** At the shipped base one blow takes its whole **1.04 m**
brush clean through, so an 11-cell rule fired on the first through-blow anywhere: hammering one
spot sixty times produced *one* collapse, on blow 1, with a mean warning of **zero blows**. A rule
that resolves inside one blow cannot be watched. 1.45 m is 15–16 cells against the brush's 11, so
one blow crazes the wall and a second beside it sheds a course — and it stays comfortably clear of
the *"a minimum body channel must not trigger it"* margin (0.83 m opened vs 1.45 m needed). **The
storey is now the arch's job and it has `fail` in front of it.**
🚨 **AND `[ ]` AT ×0.125 IS NOT "THE PRE-2026-08-09 GAME BIT-FOR-BIT" — MEASURED, AND THIS FILE
SAYS IT TWICE.** The claim `8 × 0.125 === 1` is true of the DEPOSIT and false of the BRUSH:
`_add()` sizes the radius off the CLAMPED power, `R = radius × (0.55 + 0.45 × pw)`, and below ×1
that shrinks too — **0.315 m against 0.520, a footprint of 0.31 m² against 0.85.** Per-blow volume
lands at 0.114 of ×1 (≈8.8×, near the nominal 8), but the hole one blow makes is **0.63 m wide
against 1.04**, so any strategy made of WIDTH costs more stations as well as more blows per
station: the arch chains at blow 2 at ×1 and blow 64 at ×0.125, a **32×** gap against a nominal 8.
**Reported, not changed** — it is a pacing decision and `_add`'s split clamp was authored for the
other end of the ladder.
🚨 **THE CYAN IS UNTOUCHED AND IT IS CHECKED TWO WAYS.** Re-measured on the arch, 2026-08-10: 90
blows along one low line brought down **551 cells, all 551 of them dug clean through TO the
barrier, 0 passable through it**, barrier count unchanged at 596; and `dig-band`'s own independent
line reads *"140 channels at the ceiling, not one contains a barrier cell."* Neither `collapse()`
nor `strain()` reads `barrier` at all — which is also what stops the tell leaking the answer:
**move the interconnect under an unchanged dig and all 210 crazing bytes are byte-identical**, and
`_collapse2-arms` reports every arm agreeing to the digit across three seeds for the same reason.
✅ **AND THE GRAPH STILL AGREES WITH THE PICTURE**: `debris-collapse` C4 drove a face open in 19
blows, 88 cells collapsed, 0.74 m of channel, and `pathPortals` routes it — the IFF, both
directions, on a drive that actually opens the face.
📉 **DRAW CALLS DID NOT MOVE AND IT IS MEASURED THREE WAYS** (`collapse-2`, 2026-08-10). The arch
adds no material, no mesh and no shader term, and the payout still uses the `slab` and `plaster`
pools the wall already pays for — one `InstancedMesh` each, however many plates go in it. Paired
in-place uniform flip in one frozen page: **236 → 236 calls, 359820 triangles both arms**
(`_collapse1-shots` S2). Pristine house, twelve stations: worst `ballroom.centre` **426/625**,
618812 tris — **identical to the recorded baseline**. Worst-with-everything-dug (`_calls1-dug`, one
blow on all 28 free faces, `?walls=instanced`): **567/625, 655470/900k tris**, inside the 541–601
range this file records.
✅ **AND `wall.sheet` PASS 78 IS BYTE-IDENTICAL, sha1 `9bbe323465529c1b`, SHOT TWICE.** Not by
luck: `src/views/wall-sheet.js` imports `_studio.js`, `wallstages.js`, `src/destruction/wall.js`
and `breakmask.js`, and **`collapse-2` touched none of them and wrote no GLSL at all** — the arch
lives entirely in `support.js`/`damagefield.js`, which the sheet never imports. Shot twice because
`shoot.mjs` still has no `@vite/client` stub and a single frame is not a measurement.
⏱️ **What it does to the clock, REPORTED not defended** (John suspended the band): blows-to-through
on one face **7.0 vs 11.0** with the rule ablated, −36% — **unchanged by the arch**, measured on
both trees; house-wide `dig-band` TOTAL medians at
2.0 m spacing are **chapel 2.8 · ballroom 3.5 · gallery 3.6 · study_w 4.4 · service 5.7 ·
study_e 5.7 s**, i.e. inside the spread this file already records and not a new regime.

---

## 8. Debris: the chunks used to float (`collapse-2`)

🪨 **THE CHUNKS USED TO FLOAT, AND IT WAS ARITHMETIC RATHER THAN TASTE — `collapse-2`, 2026-08-10.**
John: *"the falling chunks kinda seem to **float down to the ground**."* `debris.js` `update()`
applied the horizontal `drag` to `vy`, and a per-frame multiplier on the vertical axis is not air
resistance — **it is a terminal velocity, `g·dt·drag/(1−drag)`**, reached in about a third of a
second and then held for the whole flight:

| kind | drag | terminal it imposed | free fall from 2.4 m |
|---|---|---|---|
| slab | 0.90 | **1.41 m/s** | 6.72 m/s |
| plaster | 0.87 | **1.05 m/s** | 6.72 m/s |
| timber | 0.93 | 2.08 m/s | 6.72 m/s |

🚨 **AND THERE WAS A SECOND CAUSE THAT ONLY APPEARED ONCE THE FIRST WAS FIXED.** `chunk()`'s wall
pendulum (`sag`) was decayed only on an IMPACT, so a plate resting against the face at grazing
speed was held there by an undiminished inward acceleration and re-contacted **every frame — 68
wall contacts in one 2.2 m fall**, each taking 10% off `vy`. 0.9 per frame is a terminal velocity
of 1.4 m/s, i.e. the same drift rebuilt in a different part of the loop. `sag` is now spent by any
touch, and only a contact above 0.25 m/s costs energy.
📉 **Measured headless on the shipped `DebrisSystem` at a fixed 60 Hz** (`harness/evidence/_collapse2-fall.mjs`,
which carries its own reintroduction and FAILS if putting the old terminals back reads the same):
a collapsed slab falling 2.2 m goes **1.61 s / arrives at 1.41 m/s → 0.67 s / 6.22 m/s**, an
ordinary blow's slab **1.17 s / 1.41 → 0.56 s / 5.29**, the crumb spray **1.49 s / 1.05 → 0.56 s /
5.19**. All three land at **97% of free fall**.
⚠️ **`spin` IS UNTOUCHED — the readable tumble is the thing John wants kept**, and paper keeps a
1.5 m/s terminal on purpose: it is the control, because if wallpaper and a plate of plaster fall at
the same rate neither reads as a material. The `sag` range doubled (1.7–3.8 → 3.4–7.6 m/s²) to
match the shorter flight, so the pendulum still catches the face a third of a metre down. And a big
plate arriving above 2.4 m/s now **stops dead** instead of skating — the brake scales with the
impact, which is the other half of "heavy".

⚠️ **AND THE PROBE THAT MEASURES THE SKILL LIED FIRST, IN A WAY WORTH CARRYING.** Its "competent"
policy widened by `k / totalBlows`, so at a 220-blow budget it hammered one spot for fifty blows
and C5 reported that **scattering blows at random cleared wall 12× FASTER than aiming**. A
policy parameterised by the budget measures the budget. A player's stride is set by the HAMMER, so
it is a fixed 1.3 brush radii per blow now, and the same policy at any budget.

---

## 9. The aim mark and the step-up (`aim-1`)

🎯 **YOU CAN SEE WHERE THE HAMMER WILL LAND, AND A LOW SILL IS NO LONGER A WALL — `aim-1`,
2026-08-10.** John after playtesting: *"it only makes sense to attack the base of the wall near the
ground but this is actually hard to target… if the wall has just the bottom intact because we
attacked in the middle the wall can't be passed."* The trap is a loop — `support.js` rewards an
UNDERCUT, the third-person boom fights looking down, and a crater at chest height leaves a sill you
cannot step. Two fixes, and **neither changes the skill**.
🎯 **THE MARK IS HONEST ABOUT ITS OWN SIZE, WHICH IS THE ONLY REASON IT IS WORTH HAVING.**
`src/game/aimmark.js` draws the brush's real footprint — `BRUSH_R * (0.55 + 0.45 * min(1, power))`
read off the FACE's own brush — as a ring **on the wall**, sunk into the crater by each sample's own
dig depth. **1.04 m across at the base**, 0.63 / 0.69 / 0.81 at `[` x0.125 / x0.25 / x0.5, and
**flat at 1.04 for x2 and x4 because `_add()`'s clamp is split** and more power deepens the deposit
without widening the brush. Measured against ONE REAL BLOW rather than against its own formula
(`aim-mark.mjs` A2): the half-power contour of a real crater is **1.256 m**, so the ring is the disc
that always goes with an irregular grain/lobe fringe outside it — **never over-promising**.
Validated by reintroduction: forcing the footprint to a 0.12 m dot takes A2 red on every run.
🎨 **IT IS A DARK-BRIGHT-DARK SANDWICH BECAUSE NO ONE COLOUR SURVIVES ALL THREE SURFACES**, and
that is measured, not asserted (A5, paired in-place flip in one frozen page, floor **0.00%**):
coat **0.36% of the frame at mean 57.4 luma** · white shell **0.191% at 29.2** · cyan **0.166% at
28.8**. ⚠️ **The shell is the weak one and it stays the weak one** — on white the bright core
contributes nothing and the whole read is the ink; the casing was widened 10 → 16 mm on that
measurement (shell 0.13% → 0.191%) and it is still half the coat's contrast. **`?mark=0|1|2`** —
off / plain / fused with `support.js`'s strain byte (the default in live play). ⚠️ **DEFAULT OFF IN
CAPTURE** so no stored baseline can move. **+2 draw calls when visible** (188 → 190 at the dig
station; the pipeline submits the scene twice, so one mesh is two calls) and `eo2-calls` is
**426/625, unchanged to the digit**.
🪜 **THE STEP-UP IS `rules.js` `STEP_H = { robot: 0.55, hunter: 0.30 }` AND THE HUNTER DELIBERATELY
DOES NOT SHARE IT.** `PASS_H`'s own note already settles it: the dig network is robot-scale and the
hunter's way through a wall is its own full-height hole. `pathPortals` has no caller outside
`hunter-ai.js` and sizes a breach with `openChannel()`, which measures from **0.30** — the hunter's
own step — so the graph and `collide(..., STEP_H.hunter)` are computed at the same number and cannot
disagree. Measured: same body, same 0.46 m sill, **step 0.30 → refused at −0.34 m; step 0.55 → 9.4 m
past, service → study_w**. The failing arm IS the shipped build, in the same page.
🚨 **WHAT BECOMES CLIMBABLE: NOTHING. THE BAND (0.30, 1.00] m IS EMPTY IN THIS HOUSE.** Censused
live over 223 boxes: the lowest static collider in the estate is **1.05 m** (study/ballroom
plinths), a 0.50 m margin; the lowest exterior solid on `seed=s4` is 3.80 m and the lowest the
exterior can ever register is `exterior.js`'s **garden basin at 0.70 m**, 0.15 m clear. **And there
is no vertical axis at all** — `Player.update` pins `pos.y` to `floorY`, so nothing can be climbed
ONTO: no ledge, no roof, no way out of the level. `Player.stepLift` raises the MODEL over a sill so
the pass reads as a step and moves no collision.
🚨 **AND THE DEBRIS PILE DOES NOT BECOME STEPPABLE, BECAUSE IT WAS NEVER A COLLIDER.** The stated
trade John accepted is not a trade: `debris.js`'s pile is a height field whose own header says
*"NOTHING OUTSIDE THIS FILE MAY EVER READ IT"*, and `room.collide` / `pathPortals` / the sight tests
all derive from `damagefield.js`. **You already walk straight through the pile and this changes
nothing about it.**
🚨 **THE CYAN IS GUARDED AT THE BOX, NOT BY MARGIN.** `boxesNear` never steps over a panel box whose
own rect holds a barrier cell — checked against `field.barrier` over the rect the box was built
from, index-parallel to `solidRects`. `room.setStepGuard(false)` is the ablation and `aim-step.mjs`
S4 **fails itself** if turning it off does not produce barrier boxes above 0.30 m being dropped
(it produces 4). ⚠️ **FINDING, PRE-EXISTING, NOT THIS SLICE:** ten barrier boxes with tops at
0.093–0.280 m ARE stepped over and always were — the shipped literal `0.3` never asked what was in
the box, and `channel()` measures from the same 0.30 so nothing disagrees about it.
⚠️ **THE CAMERA HALF OF JOHN'S COMPLAINT IS STILL OPEN AND THE MARK ONLY MADE IT LEGIBLE.** With the
aim level the ring's lowest vertex sits at **y 0.898 m** — that is the sill a "normal-feeling" swing
leaves, and it is above any sane step. Reaching the floor still needs the steep look
(`game.play.aimmark-aim-{level,base}.png` are the two frames side by side). The cheap lever nobody
has pulled is `Player._swingRay`'s **0.18 of downward tilt**: raising it moves where every blow
lands, so it moves `sledge-check` and `dig-band` and is a decision, not a tweak.
🖼️ **Frames**: `progress/playtest/game.play.aimmark-{coat,shell,cyan}-{ON,OFF}.png` (the three
surfaces), `…aimmark-footprint-{BEFORE,AFTER}.png` (the ring, then the crater one blow later — the
claim and the receipt), `…aimmark-aim-{level,base}.png`, and
`…aimstep-sill-{BEFORE,THROUGH}.png` (the remnant, then the body standing where the shipped build
refuses it).

---

## 10. Open LOOK questions — the slice critic's deliverable, 2026-08-10

🚨 **A builder must not answer any of these for itself.** Every frame is already on disk, both arms,
one crater, one camera (`progress/playtest/game.play.*`). Listed here rather than in `HANDOFF.md`
because the agent who can answer them is the one reading this appendix.

- **(a) Is the surviving white plate a THICKNESS cue or a second ring** — and does the filled crater
  read as *recessed wall* or as *a flat white card*? `seethrough-1` chose 0.720 albedo / 0.055
  emissive and explicitly did not judge it. Frames: `…st1-{unlocked-dud,interconnect-middig}-{NOW,WAS}.png`.
- **(b) Is the crazing a crack or a smudge?** `wall.js` `craze` is `[1.0, 0.16, 0.55]`, a multiply on
  albedo along the plate lattice's fracture lines. ⚠️ **It covers far more of the wall than when it
  was last measured**: the arch paints the WHOLE hanging region, so a face one blow from letting go
  reads **260–306 cells at peak 1.00** where the old span sweep read 219 at 0.667. At 1:1 from 3 m it
  is measurable (7.244% of the face rect past 2 luma, worst 73.7) and still subtle. Frames:
  `…collapse1-strain-{ON,OFF}.png` and **`…collapse2-craze-3x-{ON,OFF}.png`** (the same paired flip
  cropped to the face at 3×, where it reads as a network of angular hairlines rather than a darkening).
- **(c) Does a collapsing storey read as ONE piece coming away?** `views/game.js` now tiles the
  region in BOTH axes into up to **30** plates (was 5, along the long axis only). Frames:
  `…collapse1-undermined-{BEFORE,FALLING,LANDED}.png`.
- **(d) Does a slab read as HEAVY?** It arrives at 6.2 m/s instead of 1.41 and stops dead.
- **(e) Is 88% of the breach enough cyan**, where `critic-dig-4` asked for *"it should fill nearly
  the whole breach"* and round 6 delivered 96%? Eleven candidate bands were priced against one
  recorded drive; the shipped one pays 8 points of fill for 58 points of dead blows and is the
  cheapest point on the curve. Frames: `…vis1-r10-*` against `…vis1-r11-*`, at 0/6/12/20/30/31/38/44
  blows.
- **(f) The gallery paintings.** `gallery-order.js` dresses both long walls end to end; portrait
  pitch minus width leaves 1.7–1.9 m gaps and no authored span (2.56 / 2.96 / 5.72) fits between two
  portraits. Pre-existing in kind — a shipped pilaster already clips D1's jamb — and the alternative
  was no gallery dig at all. `gal_svc` is pier-clean by construction. **Smashing through a portrait
  may well be *on* concept rather than off it.** Frame: `…digsite-gallery-to-study-e.png`.
- ⚠️ **`uCore`'s cyan-in-section is 2–3 px at 1:1** and John's *"I can't tell at a glance"* is NOT
  closed. `[8, 20]` measures better and is correctly rejected, twice, because it throws detached
  dark-teal specks into the flat fill — i.e. the cyan reading as damaged. See §5.
- ⚠️ **The section at a GRAZE cannot be framed from the player camera at all.** `ThirdPersonCamera`
  puts the boom behind the player along the look direction, so at a graze the robot covers the whole
  hole and the boom's wall raycast shoves the camera into the corridor. Framing it needs a camera not
  derived from the player (`shoot.mjs --cam`), which cannot dig. `_visible1-shots.mjs` **records that
  failure rather than hiding it** — which is the correct behaviour and should not be "fixed" by
  loosening the shot.

---

## 11. The sag — the arch gives in stages, and the fall stopped being a sheet (`sag-1`, 2026-08-10)

🧱 **JOHN'S TWO COMPLAINTS AFTER PLAYING THE ARCH, AND `critic-dig-8` MEASURED BOTH BEFORE THIS
SLICE TOUCHED ANYTHING.** *"sometimes the whole structure above collapses in one moment and that can
be satisfying but it also **feels too uniform**. **I want the collapse to also feel more bit by
bit.** the sections all **falling down at once and in the same direction statically like a sheet**
isn't immersive either."* This is direction **C5** of `docs/design/dig-what-it-could-be.md`.

🚨 **THE GRANULARITY WAS INVERTED, AND THAT IS THE FINDING, NOT THE COARSENESS.** `debris-collapse`
C5 on the shipped arch: the aimed undercut got *"9 events totalling 450 cells, biggest 408"* — **91%
of a skilled dig's material in ONE event** — while random scatter got **18 small course-sheds,
biggest 18**. *The bit-by-bit texture John asked for was what the game gave the player who could not
aim.* It was structural rather than tunable: the event menu was **0 plates → 1 (a course shed) → 5 →
14**, and the arch was a binary by construction — under `fail` it held everything, at `fail` it
dropped everything. ⚠️ **Lowering `fail` makes it worse**, firing the same all-or-nothing event
sooner. What was missing is *a middle-sized event a region can have more than once*.

🎯 **THE RULE NOW HAS THREE BEATS AND THE MIDDLE ONE IS A STATE THE PLAYER OWNS.** `support.js`:

1. **THE CUT** — unchanged, crazing ramps `nearFrac` → 1.
2. **IT SAGS** — the region's load reaches `fail`, and instead of coming down it is marked
   **sagging** (a persistent per-cell byte, `f._sag`), sheds its FIRST BITE of `COLLAPSE.bite`
   = **1.40 m²** taken from around the blow that broke it, and **the rest stays standing** —
   still solid, still on `pathPortals`, painted by `strain()` at a flat **1.0** so the whole piece
   that has let go is outlined. ⚠️ *Sagging material is still solid until it falls*: that is the
   answer picked to the passability question and it is what makes beat 3 necessary.
3. **THE PULL** — a later blow whose brush REACHES it (`pullReach` 1.35 × the 0.52 m brush = 0.70 m)
   takes another bite. `pullFree` 1.75 × `fail` = **5.95 m²** is the escape valve, because
   `critic-dig-8`'s stated risk on C5 was *"a wall that has been about to fall for ten minutes…
   it needs a decay"* — and a decay would need a time term this file has none of by contract.

📐 **MEASURED, `harness/evidence/_sag1-grain.mjs`, 14/0, headless on the shipped `DamageField` and the
shipped `DebrisSystem` at a fixed 60 Hz. Both arms in one process; `COLLAPSE.sag = false` is the
round-13 code unmoved, not an approximation of it, and every assertion runs it as a control that
must fail.**

| aimed undercut, one face | round 13 (`sag:false`) | shipped |
|---|---|---|
| payout events | 10 | **25** |
| biggest single event | **453 cells** | **159** (= the 1.40 m² bite, 157 cells) |
| biggest ÷ median event | **26.6×** | **10.6×** |
| cells opened | 1789 | 1787 |

🎯 **AND THE CROSS-POLICY CLAIM, WHICH IS THE ONE THAT DECIDES WHETHER THE PROBLEM MOVED OR WENT.**
Aim pays out **25 pieces of median 15 cells** against scatter's **32 of median 2** — 7.5× the
typical piece, 2.14× the material — and **the biggest thing either policy can now produce is one
bite** (159 vs 160). ⚠️ **The bar is NOT "aim beats scatter on event count" and that would be
unpassable by construction**: scatter's events are chips (the lonely rule at a crater rim), so
asking a storey to arrive as gravel is not what John asked for. ⚠️ **And one honest rig difference:
in the headless drive the scatter policy eventually breaks the arch too (ablated biggest 467),
where `debris-collapse` C5 in the real house reports scatter getting only course-sheds — the rig
has no interconnect and no barrier, so scatter clears more of one face than it can in play. That
makes the comparison stricter than the browser's, not weaker.**

🪨 **THE FALL — A2, AND THE PAYOUT A/B HOLDS THE COLLAPSE CONSTANT.** `critic-dig-8` measured, with
the group's centroid subtracted, **0.034 m of relative scatter at 0.20 s against a 0.56 m plate,
0.257 m of travel — the group translates 5–8× further than it deforms** — with four named causes in
`debris.js` `chunk()`: identical `cw`/`ch` (so identical spin scale), `vy` in [−0.10, −0.55], `out`
always outward, and **one spawn frame**. Two new options, **both zero by default so every existing
caller is bit-for-bit unchanged**:

- **`hold`** — seconds a plate stays part of the wall. It is drawn flush in the face where its
  material stood and integrates nothing, so the region **peels** rather than teleports; ≤ 0.26 s
  total, bottom row first. **This is the dominant term**: a plate held 0.2 s is a fifth of a second
  behind its neighbour on a two-thirds-of-a-second flight, larger than every velocity difference in
  the function put together.
- **`spread`** — widens `out`, `slide` and `vy` **around the same means**, with the same number of
  `r()` draws in both arms.

| same collapse, same 11 plates, same region | round-13 payout | new payout |
|---|---|---|
| RMS relative scatter @ 0.20 s | 0.038 m | **0.142 m** (3.76×) |
| travel ÷ deform @ 0.20 s (A2's own ratio) | **7.75×** | **1.36×** |

🚨 **`out` WAS PUSHED FIRST AND THAT WAS A REGRESSION, MEASURED AND REVERTED — IT IS THE REUSABLE
PART.** The obvious shaping of `spread` raises the outward push. **A plate coming toward the camera
MAGNIFIES ITS OWN SHADOW ON THE BREACH**, so throwing the payout at the player throws it over the
hole the player is trying to see: mean `out` 0.575 → 0.84 took mean occlusion of the breach
**47.2% → 50.0%**. Mean `out` is now held at the round-13 value to two decimals and only its RANGE
moves; the deformation comes from `slide` and above all from `vy`, because **downward is the only
direction that takes a plate out of the aperture.**

🚨 **AND THE PEEL AND THE BREACH ARE IN DIRECT TENSION. `_sag1-grain` S5 asserts BOTH SIDES of it.**
A held plate is by definition more time with plate in front of the hole — **+3.3 points of mean
occlusion for the payout change on its own**, and the file goes red if that ever exceeds +6. **The
RULE is what pays it back**: a 1.40 m² bite is a smaller hole with fewer plates in front of it than
a 4.3 m² storey. End to end, breach occlusion over the first 0.8 s of the payoff:

| | 0.20 s | 0.40 s | 0.60 s | 0.80 s | mean |
|---|---|---|---|---|---|
| round 13 | 55% | 50% | 36% | 25% | **47.2%** |
| shipped | 37% | 21% | 3% | **0%** | **20.9%** |

The metric is each live plate's shadow cast onto the face plane **from the player's eye**, clipped
to the breach rect — *"can the player see what they just did"*, asked arithmetically. It is the
answer to `teardown-reference.md`'s *"breaking fully through shows daylight and the space beyond…
plainly the payoff moment in the footage."*

✅ **THE LANDED HEAP IS UNTOUCHED AND IT IS CHECKED RATHER THAN ASSERTED.** `critic-dig-8`: *"THE
LANDING IS RIGHT AND SHOULD NOT BE TOUCHED… fix the 0.8 seconds between letting go and resting."*
Same collapse, same plates: mean arrival **4.40 → 4.56 m/s (4%)**, and **11 of 11 plates at rest
inside 1.6 s on both arms**. `hold` and `spread` both act before the first contact and neither is
read after it; no contact, brake, lean or pile term was touched.

🎯 **`collapse()` NOW RETURNS `events[]`, AND THAT IS THE HOOK THE NEXT MECHANIC SHOULD USE.** One
entry per thing that happened, each with **a position and a magnitude** —
`{kind, cells, area, load, u, v, dx, dy, w, h}`, `kind` is `arch` / `sag` / `course` / `lonely`,
`dx`/`dy` in metres from the point `wall.js` reports as `collapseAt`. The old single bounding rect
around everything a blow did could be **5.72 × 2.43 m for 3.7 m² of wall, 27% dense**; these are
tight. John's *"maybe the robots limbs fall off and they just need to put it back on"* reads this
array and needs nothing else — a `sag` event carries `cells: 0` and the region's extent, an `arch`
event carries what actually landed.

⏱️ **WHAT IT COSTS THE CLOCK, REPORTED NOT DEFENDED** (John suspended the band). A full storey is
**3 blows → 5**: the arch gives on the same blow it always did and takes 1.40 m² with it, and the
remaining ~2.9 m² comes down over two committed pulls. Hammering one spot still **never** sags, a
body channel dug upward still never sags (peak load 1.97 m²), and one bottom blow still does not do
it — the three properties `COLLAPSE.fail` is set against are re-measured in `_sag1-grain`.

**Getting THROUGH costs +0.44 blows, measured as a controlled A/B and not inferred.**
`debris-collapse` C3 reads **7.0 blows shipped against 11.0 ablated, −36%, unchanged to the digit
from what `collapse-2` recorded**; and `dig-band`'s own drive (competent aim, least-dug cell in the
body box, aimed at the interconnect) reproduced headless on 3 spans × 3 seeds goes **+0.44 blows =
+0.42 s** at the 0.95 s swing. 🚨 **`dig-band`'s 2.0 m spacing ladder moved by more than that and I
could not attribute the rest** — gallery 3.6 → 6.4 s, ballroom 3.5 → 6.3, chapel 2.8 → 6.7, service
5.7 → 10.5, study_e 5.7 → 9.5, study_w 4.4 → 4.4 — but **each of those rows is a single sample**
(one seed, one spacing, one winning spot), and the same run's 5-seed table shows a spread of
2.8–7.1 s *within* chapel alone. **Reported as an open number, not as a finding**: if the clock
matters again, re-run `dig-band` on both arms rather than against these.

📉 **DRAW CALLS DID NOT MOVE AND IT IS MEASURED THREE WAYS.** The sag adds **no pool, no material
key, no mesh and no shader term**: the state is one byte a cell on the CPU, it is drawn through
`uCraze` (already running, on a channel that already existed), and the payout still uses the `slab`
and `plaster` pools the wall pays for whatever happens. Paired in-place flips in ONE frozen page,
every free face dug: `_sag1-shots` G3 **243 → 243 calls** flipping `COLLAPSE.sag`, triangles 0.001%
apart (live particles ageing between reads — `_collapse1-shots` S2 records the same wobble);
`_collapse1-shots` S2 **236 → 236**; `eo2-calls` **6/0**. ⚠️ **The G3 arm has to be
`{ ...COLLAPSE, sag: false }` and not `{ ...(field.collapse ?? {}), sag: false }`** — `field.collapse`
is the per-instance OVERRIDE and is `undefined` on every shipped face, so the bare object ablates
the WHOLE rule. That is `_collapse2-arms`' *"against a 0 m² threshold"* bug, and this file walked
into it once.

✅ **`wall.sheet` PASS 78 IS BYTE-IDENTICAL, sha1 `9bbe323465529c1b`, SHOT TWICE.** Not by luck and
not only by shooting: `src/views/wall-sheet.js`'s import graph is **13 modules and none of them is
`support.js`, `damagefield.js`, `debris.js`, `dust.js` or `views/game.js`** — `src/destruction/wall.js`
has no imports at all, so the sheet cannot reach this slice. Shot twice because `shoot.mjs` still
has no `@vite/client` stub and a single frame is not a measurement; both frames identical.

✅ **DETERMINISM, THE CYAN, AND THE SEARCH.** The sag is written only from `collapse()`, which runs
only in `_add()`, so it is a pure function of the hit list: **24 blows replayed — every depth cell
and every sag byte identical.** Nothing reads `barrier`, so `debris-collapse` C6's invariance (move
the interconnect, every crazing byte must be unchanged) is untouched — it read **0 of 210 crazing
bytes moved** on this tree — and 90 blows along one low line still leave the barrier count unmoved
at 596 with 0 cells passable through it. `debris-collapse` C4 drove the face open in 19 blows and
`pathPortals` routes it, so the graph still agrees with the picture.

🖼️ **Frames** (`harness/scenarios/_sag1-shots.mjs`, one face, one camera, one page, `--shots`):
`game.play.sag1-{1-WARNED,2-GAVE,3-HANGING,4-PULL,5-LANDED}.png`, against the ablation pair
`game.play.sag1-flat-{GAVE,LANDED}.png` on the same face, the same camera and the same blows.
⭐ **`3-HANGING` is the picture that did not exist before this slice** — a fully-crazed piece of
wall still standing with its first bite already on the floor.

## 12. The collapse cost — a wall that lands on you takes a LIMB, and it is avoidable (`limbs-1`, 2026-08-10)

🦾 **JOHN'S OWN ANSWER, ASKED BY A CRITIC WHETHER A COLLAPSING WALL SHOULD BE ABLE TO HURT THE
PLAYER.** *"I think **generally a collapse shouldn't hurt you**. we could try it as a mechanic but
**maybe the robots limbs fall off and they just need to put it back on**."* No health, no damage
number, no invulnerability window: **the cost is time and capability.**

🎯 **AND IT IS THE DIG'S MISSING COST TERM, WHICH IS WHY IT MATTERS MORE THAN IT LOOKS.**
`critic-dig-8` on why digging is too easy: *"**one verb, one decision, one resource, and no cost
term anywhere.** Three blows feels cheap because it **is** free, and would at twelve. **Adding
blows is the one change guaranteed not to work.**"* This is a cost paid in the currency the skill
is already spent in — position.

🚨 **THE WHOLE CONSEQUENCE CHAIN WAS ALREADY BUILT AND NONE OF IT WAS REBUILT.** The slice is
`collapse().events[]` → one rule → `LimbRig.detach()`. The sledgehammer is two-handed and
`_toggleSledge` gates on `caps.arms === 2`, so **losing an arm disarms you** — `reset-2` found that
exact gate failing *silently* as a bug; here it is the mechanic, so the game says so. Locomotion
already degrades (walk → limp → crawl), `[E]` already refits at `E_REACH` 1.25 m, `mechanics.mjs`
already asserts a refitted limb animates like an original, and `resetRound()` already strips,
sweeps and refits. **Nothing in `src/destruction/` was touched.**

### The rule, and every number in it is measured off the shipped event stream

`harness/evidence/_limb1-rule.mjs` **9/0** — the shipped `DamageField`, 220 blows × both of
`debris-collapse` C5's play policies, every event placed in a synthetic world and handed to the
shipped `collapseLimbHit`. Headless, no time term, two runs byte-identical.

**1. ONLY A FULL BITE, AND THE THRESHOLD SITS IN A MEASURED HOLE.** `sag-1` made collapses smaller
and more frequent (biggest event 408 → 176 cells, 25 payout pieces not 10), so a rule tuned to
*"a collapse happened"* would fire constantly and be tedious inside a minute. It is scaled to the
event's own `area`, and over 440 blows the distribution has **a hole 3.49× wide**:

| kind | what it is | measured |
|---|---|---|
| `lonely` | a chip off the crater rim | max **0.036 m²** |
| `course` | a course shedding at the skirting | max **0.152 m²** |
| `arch` | a bite that ran out of material | **0.402 m²**, exactly one in 440 blows |
| *(the hole — nothing at all)* | | |
| `arch` | a **full** bite off a region that has let go | **1.404–1.440 m²** |

`COLLAPSE_LIMB.area = 0.75` is that hole's geometric centre (√(0.402 × 1.404) = 0.751), and **the
admitted set is identical at every threshold from 0.45 to 1.35** — there is no sensitivity left to
argue about. 🚨 **The first draft of this had the low edge at 0.26 and called it a `course`; L2's
own control caught it.** A `sag` event carries `cells: 0` and is refused outright — nothing has
fallen yet, which is the point of beat 2.

**2. THE FOOTPRINT IS THE EVENT'S DENSITY, NOT ITS BOUNDING BOX** — §11's lesson, one layer up.
Measured arch densities run **24%–93%**, so a bare `w` would take an arm off a body standing under
the empty quarter of a 3.16 m box. The effective width is `min(w, area / h)`, a consistent
**0.68–1.37 m** across every measured bite. L6 runs the naive bounding-box rule as the control and
requires it to fire where the shipped one does not.

**3. ARM IF IT CAME DOWN HIGH, LEG IF IT CAME DOWN LOW — the divider is your own eyeline**
(1.539 m = `MOVE.eyeHeight` × 1.7), and the side is the event's offset in the body's own frame.
Not a coin flip: measured bite centres land at **1.17–2.29 m**, giving **4 arms and 4 legs out of
8** — a split that splits. It adapts for free: crawling drops the eyeline to 0.51 m and
reclassifies **4 of 4** legs to arms. ⚠️ A piece coming down dead centre is a genuine tie and is
broken explicitly to the RIGHT — with `facing = π` the residue in `sin(π)` (1.22e-16) was deciding
it, i.e. the answer was a floating-point artefact that could differ on another platform's libm.
🎯 **In the built game this is the mechanic's own sentence, measured:** a skirting undercut brings
its bite down at knee height and takes a **leg**; the arm case needed the undercut based at
**v = 0.32** of the face.

**4. IT IS AVOIDABLE, AND THAT IS WHAT FINALLY PUTS SOMETHING IN THE CRAZING WINDOW.**
`critic-dig-8`: the warning is *"a promise, not a warning… 1.9 s with nothing the player can do in
it."* Beat 2 outlines the piece that has let go and hangs it until you commit to the pull, so the
window now has an answer: **undermine, then back off.** The danger zone is the box under the
hanging piece — `depth` **1.05 m** out from the face, `effW/2 + radius + 0.10` along it.

| | measured |
|---|---|
| standing under a bite at **0.60 m** | **8 of 8** take a limb (headless) · **1 of 1** in the built game |
| the same bites from **1.30/1.35 m** | **0 of 8** headless · **0** in the built game, on the identical 90-blow drive |
| one step **1.20 m** along the wall | **0 of 8**, in both directions, while centred loses 8 |
| is the pull still reachable from there | **yes** — `WEAPON_RANGE.sledge` is **1.55 m** |

⚠️ **The control for "0 at 1.30 m" is `depth: 3.0` on the same bodies, which takes 8 of 8** — the
escape is the rule's doing and not an accident of where these events happen to fall.

**5. 🚨 IT CANNOT SOFT-LOCK, AND THAT IS A PROOF.** `wounds > 0` refuses outright: **a collapse
will not touch a body that is already missing something.** So the worst state it can produce from
any sequence of blows is four sockets minus one — *one arm gone* (gait **walk**, full speed, hammer
stowed until refitted) or *one leg gone* (gait **limp**, 0.44× speed, dig unaffected). **`down`
(arms 0 + legs 0, `speedScaleFor` 0) is unreachable by construction**, because the rule needs all
four sockets full to fire and then empties exactly one. And retrieval needs **no hand at all** —
`Player.interact`'s refit path is `rig.attach(socket, item)` and never consults `_freeHandSide()`.
📐 L7: **1 limb across 65 events** from a body that never moved, against **8** with the guard
defeated — that 8 is what the clause is for.

**6. WHERE THE PART LANDS.** ⚠️ The debris heap is **not a collider** — the player walks through it
— so a limb in the rubble is retrievable but easily *lost* in it, which turns the cost from "time"
into "a search". The impulse is thrown outward along the face normal and slightly to the side the
material did NOT come from: measured, it settles **2.1–2.6 m out from the face** (the fall strip is
1.05 m) and **1.8–2.1 m from the body**, flat on open floor. ⚠️ **It lands BEHIND a camera aimed at
the wall**, which is exactly why the callout names the recovery.

**7. WHAT THE PLAYER IS TOLD — three lines, one causal chain, none of them new machinery.** The
rig's own `hud.js` subscriber already fires the whole trauma response off `kind: 'detach'`; what
was missing is **the cause**, because this game has one other thing that takes limbs off you and
without a cause line a falling wall reads as the hunter arriving behind you. Captured verbatim:

> **"RIGHT ARM TORN OFF"** *(hud.js, wound rank)* → **"THE WALL TOOK YOUR ARM — [E] TO REFIT"**
> *(new, wound rank, queues behind it)* → **"SLEDGEHAMMER DROPPED — BOTH ARMS NEEDED"**
> *(`player.onDisarm`)*, with **"SLEDGEHAMMER NEEDS BOTH ARMS — [E] FIT ONE"** standing in the
> prompt slot until it is fixed, and **"[E] FIT ARM"** the moment you are over the part.

⚠️ The new line is at WOUND rank on purpose: `hud.js`'s rule is that **a deny never queues**, so at
DENY rank it would have been dropped rather than deferred.

### Determinism, reset, and the draw calls

⚠️ **NO TIME TERM, NO RANDOM DRAW, NO ROUND STATE.** The rule is a pure function of (the event, the
body's pose, the rig's state) — no cooldown, no `rng()`, nothing keyed on `t`. `hitByCollapse`
passes **both** `impulse` and `spin`, so `LimbField.drop()` never touches the seeded stream and the
view's rng is unshifted (the same decision, for the same reason, as `onChunk`'s per-plate `jit()`).
**There is nothing for a respawn to clear**, which is a better answer to `reset-2`'s six leaks than
adding state and remembering to clear it: `resetRound()` already strips to `LOADOUT`, sweeps the
field and refits. Measured on a body a collapse had just disarmed — R pressed with no keyup, the
way a player presses it: **sockets, wound count, gait and the 6-item floor all back to the spawn
state, 0 loose limbs.** `player.limbsLost` is a LIFETIME counter, like `disarms` beside it.

📉 **DRAW CALLS: +0, PAIRED IN FRAME ON ONE PAGE AT ONE CAMERA — 177 → 177.** A detached limb is
the **same `Object3D`** that was on the robot one frame earlier (`limbs.js`'s founding design),
reparented into the scene the room already tracks through `limbField.onDrop`; nothing is built,
pooled or keyed. ⚠️ **AND THE NAIVE READING OF THIS IS A TRAP THIS FILE WALKED INTO ONCE:** where
the arm actually lands it is *behind* a camera aimed at the wall, so the count reads **178 → 172,
−6** — cheaper because you cannot see it is not a saving. The census now reports the arm's
on-screen NDC and all 6 of its meshes' visibility alongside the count, and the asserted number is
the in-frame one. `eo2-calls` worst station unmoved at **426/625**.

### The switch, and the instruments

**`?limbs=0` ablates the whole mechanic** (`player.collapseLimbs.on`, a shared table so an
instrument flips it in-page and gets the identical arm). Both instruments run it as a control on
every run.

- **`harness/evidence/_limb1-rule.mjs` 9/0** — headless, the rule and every constant, nine assertions each
  with a control that must fail (a wide-open threshold, `depth: 3.0`, a crawling eyeline, a body
  turned round, the naive bounding-box footprint, the `wounds` guard defeated, `on: false`, and a
  1 mm perturbation for the determinism transcript).
- **`harness/scenarios/limb-collapse.mjs` 11/0** — the built game, one uninterrupted session, 1
  navigation. C1 fires with two controls on the identical 90-blow drive (ablated → 0; stood back
  → 0); C2 the disarm and all three HUD lines; C3 where it lands and `[E]` → refit → `[E]` → hammer
  back; C4 the respawn; C5 the draw calls. Frames:
  `game.play.limb-{0-before,1-taken,2-arm-taken,2-stood-back,3-arm-on-the-floor,4-standing-over-it,5-refitted,6-hammer-back,7-after-retry,8-calls-arm-on-floor}.png`.

### What I did NOT do, stated rather than glossed

- **Not the hunter.** Nothing here reaches it. It would compose cleanly if wanted: a hunter that
  reads `caps` already exists, and a limb on the floor is already something it can absorb — but
  the `wounds === 0` guard means a collapse will never pile onto a body the hunter has opened,
  which is a fairness property worth keeping if that slice is ever taken.
- **No world marker on the dropped part**, and it is a LOOK question rather than a decision:
  measured, the part is on open floor 1.8–2.1 m away and clear of the heap, but it is a small dark
  object at that range and only advertises itself inside `E_REACH` (1.25 m).
  `game.play.limb-3-arm-on-the-floor.png` is the frame to judge it on. **A marker is new geometry,
  so it is a draw-call decision as well as a look one.**
- **No re-take grace.** Refit standing in the same spot and the next bite can take it again. That
  is the honest version — the sag outline is on screen the whole time — but it is the first thing
  to revisit if it plays as nagging, and a cooldown would be the first TIME term in this rule.

---

## 12b. It came off too easily — the conditions tightened, and the hammer hits the floor (`feel-1`, 2026-08-10)

🚨 **JOHN, PLAYING THE `limbs-1` BUILD.** *"initially **the arm comes off way too easy**. I think
this mechanic needs **much tighter conditions** before limbs are lost."* And, in the same message:
*"the sledge also needs to **drop on the floor instead of just floating in front of the player**."*

🚨 **§12's TABLE ABOVE IS SUPERSEDED WHERE THIS SECTION CONTRADICTS IT.** `depth` is **0.60**, not
1.05; `margin: 0.10` is gone and replaced by `inset: 0.15`; there is a new `warned` clause. The
0.75 m² threshold, the density footprint, the eyeline split, the `wounds === 0` proof and the
draw-call finding are all unchanged and still argued above.

### The threshold was not the lever, and the round did not spend itself there

§12.1 is still true and is the reason: the event distribution is bimodal with a **3.49× hole**, and
every value from **0.45 to 1.35** admits the identical set. Three other things were wrong instead,
each measured (`harness/evidence/_limb1-rule.mjs`, now **10/0** — L3, L4 and a new L10):

1. 🚨 **THERE WAS NO LEGAL PLACE TO STAND AND UNDERCUT FROM.** `WEAPON_RANGE.sledge` is 1.55 m
   **from the eye**, so the skirting — 0.28 m up a 2.80 m face, against a 1.539 m eyeline — is
   only reachable from `√(1.55² − 1.26²)` = **0.90 m or less**. The 1.05 m danger box covered
   *every one* of those stances. The skill §12.4 claims to teach was not available on the blows
   that matter. `depth` is **0.60** now: 0.60–0.90 m undercuts safely, 0.60–1.55 m pulls safely.
   With a 0.34 m body radius the **reachable** danger band went **0.71 m → 0.26 m**.
2. **BEING BESIDE THE PIECE COUNTED AS BEING UNDER IT.** The lateral test was
   `effW/2 + radius + 0.10` — a **1.12 m** half-width on the worst bite, **1.7× the piece itself**.
   It is `effW/2 − inset` now: the body's CENTRE must be under the material. A **0.60 m** half-step
   along the wall clears all 8 measured bites; it used to take **1.20 m**.
3. 🚨 **THE BLOW THAT BROKE THE ARCH TOOK A LIMB, AND IT IS UNAVOIDABLE BY CONSTRUCTION.**
   `support.js` emits `sag` and peels the first `bite` on the **same blow** (`pull = !already || …`),
   so beat 2's warning and beat 3's payout arrived together — and that blow is an undercut blow at
   the skirting, i.e. inside the fall by (1). **`warned` refuses it.** A limb comes off only for a
   piece that had already let go on an earlier blow: one you were shown, and pulled down on
   yourself anyway. `views/game.js`'s `onChunk` computes it from the blow's own event list (a bite
   whose box overlaps a `sag` from the same blow is that blow's own break), so `collapseLimbHit`
   stays a pure function of one event and `limbs.js` still imports nothing from `src/destruction/`.

### What it now costs, at three standoffs and over a real dig

| | shipped 2026-08-09 | **now** |
|---|---|---|
| dead under a bite at **0.60 m** | 8/8 | **6/8** |
| the same bites at **0.80 m** | 8/8 | **0/8** |
| at **1.00 m** | 8/8 | **0/8** |
| at **1.30 m** | 0/8 | 0/8 |
| **a real 90-blow dig at 0.60 m** (undercut / scatter policy) | **6 / 2** | **5 / 1** |
| the same dig at **0.80 m and beyond** | **6 / 2** | **0 / 0** |
| the danger footprint outside your own radius, median bite | 1.22 m² | **0.14 m² — 8.7× smaller** |

⚠️ **THE 90-BLOW FIGURE IS A WORST CASE AND IS STATED AS ONE**: the body never moves and refits
instantly. It is the number that explains the complaint — **bites arrive in a TRAIN** (measured:
blows 1, 2, 3, 4, 5, 12 off one region), so refit-and-swing-again from the same spot was six losses
in ninety blows. **The train is broken positionally, not by a cooldown**: one step back ends it for
every bite in it, permanently.

🚨 **A RE-TAKE GRACE WAS CONSIDERED AND REFUSED**, against §12's own note naming it as the first
thing to revisit. It would have been the first `t` in this rule and the first thing a respawn had
to remember to clear — `reset-2` found six leaks of exactly that shape. **There is still no time
term, no rng draw and no round state**, so §12's "nothing for a respawn to clear" survives intact.

### The sledgehammer, on the floor

🚨 **THE PATH DID NOT EXIST — AND `sledge.js` HAS A `forget()`, WHICH IS WHY IT LOOKED AS IF IT
DID.** `Player.update`'s two-handed gate called `sledge.unequip()`, and `unequip()` does not put a
hammer anywhere: it `_mount('stow')`s it, reparenting a metre-long prop onto `unit.joints.chest`
at a transform authored for a body with **two arms**. That is the prop John is looking at.
`views/game.js`'s `dropSledge()` now `forget()`s it and spawns a real `LimbItem` at the body's
feet — the **same item** `spawnWorldSledge()` makes for the opening beat, so `[E]` takes it back
through `Player.interact`'s existing `type === 'sledge'` branch. Measured in the built game:
**0.20 m above the floor, 0.48 m from where the arm came off, settled flat, retaken with one press.**

⚠️ **ONLY A *WOUNDED* DISARM DROPS IT.** `caps.wounds > 0` means a socket is empty and nothing is
holding the tool. Fitting a **gadget** also trips the two-handed gate, and that is a deliberate
tool swap — it still slings the hammer and keeps `owned`, or fitting a nail gun would silently cost
you the hammer. `Player.update` passes `wounded` for exactly this branch.
⚠️ **`owned` IS NOW FALSE AFTER A COLLAPSE DISARM**, and two instruments had to be told:
`limb-collapse` C3 used to press "E with nothing in reach" and expect the hammer back — a shape
that would have gone **green on the very build John reported** — and `mechanics.mjs`'s reset check
guarded its perturbation on `wrecked.owned`, which is no longer reachable. Both now read the
consequence instead (a hammer on the floor / a second sledge item in the world). `mechanics` is
**13/13 on 17 properties**; the respawn sweeps the dropped hammer and re-spawns exactly one.

### Gates on this tree

`build` + `lint-glsl` green · `_limb1-rule` **10/0** (L10 is new) · `limb-collapse` **11/0** ·
`mechanics` **13/13** · `escape` **20/20** · `sledge-check` **13/13** · `dig-free` **15/15** ·
`dig-cover` **6/0** · `eo2-calls` **6/0** (worst station **426/625**, unmoved) · `aim-reach`
**13/0** · `dig-band` **14/1**, the 1 being the chapel's named floor-plan shortfall.

---

## 12c. The dig-power ladder, rescaled to John's numbers — and what it does to the two sides of a wall (`feel-1`, 2026-08-10)

> *"I want the digging speed toggle changed again — **the current .5 should be the 1x** and the
> total should **scale up to 16x**. I also want a **1.5x option**."*

`views/game.js`'s `DIG_POWERS` is now **John's labels** and `DIG_UNIT` (0.5) is what one label is
worth in `_add()`'s units. `[0.25, 0.5, 1, 1.5, 2, 4, 8, 16]` → `power` `[0.125, 0.25, 0.5, 0.75,
1, 2, 4, 8]`. **`WEAPON_COOLDOWN.sledge` does not move** and the keys are still unreachable from
`?capture=1` and every scenario.

🚨 **THE HALVING IS IN THE LADDER, NOT IN `DIG_BASE`, AND THAT IS THE OPPOSITE OF 2026-08-09's
DECISION FOR A MEASURED REASON.** `_add()`'s clamp is **split**: `pw = min(1, power)` drives the
brush RADIUS and `DIG_BASE` cannot reach it; `power` unclamped drives the DEPOSIT and `DIG_BASE`
scales only that. The rung John played and asked for is `power = 0.5` — **a 0.81 m brush that does
not punch clean through in one hit**. `DIG_BASE = 4` would have matched its depth and kept the
brush at 1.04 m: a wider, different dig he has not seen. Reproducing what he played means moving
the label. ⚠️ **THE COST OF THAT, STATED:** every instrument drives `panel.applyHit(point, 1)`, so
`dig-band` and `dig-free` still measure `power = 1`, which on this ladder is the **×2** rung. Both
already REPORT rather than gate the clock, so nothing goes red — but their seconds are ×2's.

📐 **MEASURED HEADLESS, `dig-free`'s own "swing at the least-dug cell" policy, 4.60 × 2.80 m face.**

| label | `power` | brush across | m²·depth per blow | probe | body channel | at 0.95 s |
|---|---|---|---|---|---|---|
| ×0.25 | 0.125 | **0.63 m** | 0.061 | 6 | **92** | 87 s — the pre-2026-08-09 game, bit-for-bit |
| ×0.5 | 0.25 | **0.69 m** | 0.142 | 3 | **42** | 40 s |
| **×1** | **0.5** | **0.81 m** | **0.431** | **1** | **14** | **13 s — the new base** |
| ×1.5 | 0.75 | **0.92 m** | 0.717 | 1 | **2** | 1.9 s |
| ×2 | 1.0 | 1.04 m | 0.929 | 1 | 2 | the old ×1 — what every gate measures |
| ×4 / ×8 / ×16 | 2 / 4 / 8 | 1.04 m | 0.99–1.01 | 1 | 2 | **identical to ×2 in play** |

🚨 **THE LADDER IS NOT SMOOTH AND THE STEP IS BETWEEN ×1 AND ×1.5** — a body-sized channel goes
**14 blows → 2** across one press, because that is where a single blow starts taking its whole
brush clean through. Below ×1.5 a rung narrows the HOLE as well as shallowing it; at ×2 and above
nothing changes at all, and `]` cannot grow `BRUSH_R`. **The new base is on the slow side of that
step on purpose**: it is the rung John played, and `critic-dig-8`'s complaint was *"three blows
feels cheap because it IS free."*

### 🚨 The rescale makes `twoside-1`'s latent coupling defect LIVE, at the default rung

`twoside-1`, same day: *"`PARTIAL` is empty on every face measured. At `DIG_BASE` 8 one blow goes
clean through, so both grids are binary and `_couple()`'s 'mirror only past `OPEN_AT`' costs
nothing. **At lower power it would not be.**"* Measured on `f.gal_svc.0.a/b`, 26 blows at the
barrier-free centroid, `harness/scenarios/_feel1-lowpower.mjs` (**a diagnostic that reports one
FAILURE on a correct tree, by design, like `_pf1-diag.mjs` — do not "repair" what it points at**):

| rung | `power` | **ΔGRID** | near face PARTIAL | twin PARTIAL |
|---|---|---|---|---|
| ×2 — the shipped drive, and this file's CONTROL | 1.0 | **0.119%** | 0.12% | 0% |
| ×1.5 | 0.75 | **0.119%** | 0.12% | 0% |
| **×1 — the NEW DEFAULT** | 0.5 | **4.405%** | 4.4% | 0% |
| ×0.5 | 0.25 | **33.452%** | 33.33% | 0% |
| ×0.25 | 0.125 | **44.643%** | 47.14% | **0% — and GONE 0% on both sides** |

The ×2 row reproduces `two-sided.mjs`'s recorded **0.119%** one-cell floor exactly, which is what
licenses the rest of the column. 🎯 **The twin's PARTIAL is 0% on every row — the mechanism as a
number.** The twin only ever receives cells already past `OPEN_AT`, so it can only be binary; what
changes down the ladder is how much of the near face is not. At the bottom rung the near face
carries a 47% graded crater and **the twin is untouched**.
⚠️ **NOT FIXED HERE.** The fix is `_couple()`'s mirror rule, in `wall.js` / `breakmask.js`, which
belong to `twoside-1`. ⚠️ And the reusable caution from that tool's own history: its first control
was *"dig one side further, the number must rise"* and it **failed on a good tree**, because with
coupling working ΔGRID is already at the floor. This file's control is instead *"the u-flip must
matter"*, plus a hard refusal to report anything if the ×2 row does not land on the known floor —
which fired on the first run and caught a crater dug into cyan.
