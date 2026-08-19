# Appendix: game feel

**Covers:** John's four playthrough bugs, the fairness pass (play-critic-3's WEAK 52 list
worked), the fleeing/pursuit-visibility fix, and play-critic-7/8's `game.play` verdicts
(WEAK 64, then WEAK 68 — no sound at all).
**Read when:** your slice touches core loop feel, `game.play` scoring, fairness/pursuit
mechanics, or anything a play critic (`rrr-playcritique`) would judge.

---

## 🎮 FOUR BUGS FROM JOHN'S OWN PLAYTHROUGH — every one invisible to the screenshot tools

`game.play`'s WEAK 52 (`play-critic-3`) now describes a game that no longer exists. **It needs
a re-critique before any number about it is quoted.** All four were found by a human playing;
none could have been caught by a capture, and two of them had been shipping for the whole
project. This is the strongest evidence yet for the play-critique loop over the visual one.

1. **E and Q did nothing** ("seem to crash the game"). `keyup` deleted the key from the held
   set, and `consume()` could only see a key still held at the instant a frame ran — so a press
   registered only if a frame happened to land between keydown and keyup. WASD was immune
   because it is POLLED while held. Fixed with a `once` latch cleared only by `consume()`.
   ⚠️ **The reported "very long load time" is the same bug's accomplice:** during the 30–60 s
   shader compile the frame rate is on the floor, so an 80 ms keypress falls entirely between
   two frames. Any future one-shot input must use the latch, never the held set.
2. **Rooms vanished while walking; "walls only visible on one side".** Residency was driven by
   `engine.camera.position` ALONE. In third person the camera sits metres behind the player —
   routinely inside a wall or in the room just left — so `spaceAt(camera)` resolved to the wrong
   space and **the room the player was standing in was not resident, and got hidden.** The
   characters are not children of a space root, so they kept drawing: two lit robots in a void.
   The one-sided walls are the same fault from the other end, because each space builds only
   its OWN half of a shared wall. Fixed by passing BOTH viewpoints to `setViewpoints` (it always
   took an array — it was written for split screen); the player is the authority on which room
   must exist, the camera only ADDS what the boom can see.
3. **Refitted limbs never animated again.** `LimbRig.attach()` calls `unit.attach()` (which
   rebuilds the pose-skip set) BEFORE `rebindLimbJoints()` repoints `joints.shoulderR` at the
   returning limb — so those names were still pointing at the old parentless groups when the
   set was built, stayed on the skip list, and `setPose` skipped them forever. The limb was
   attached, visible and welded in its rest pose. Fixed by exposing `unit.refreshPoseSkip()`
   (additive to the exported shape) and calling it at the end of `rebindLimbJoints`. Measured:
   refitted leg travels hipR 0.55 / kneeR 1.01 rad walking, against an original's 0.51 / 1.25.
4. **No attack animation with plain limbs.** `poseOverrides()` only ever posed a HELD club, so
   `fist` — a real 14-damage entry with its own 0.55 s cooldown — had no move at all and the
   primary button changed nothing on screen. Added `rig.punch()`: alternating hands, fast-out
   slow-back jab, shoulders rotating in, hips bracing, free arm as counterweight. 1.37 rad of
   shoulder travel measured.

**Also landed, from John's direction:** the club now has WEIGHT — `swingKick()` in
`locomotion.js` fires the reaction springs twice per swing (coil on wind-up, haul-through at
contact, head lagging), and the carry pose lists the body away from the load. Measured body
travel through a swing: 0.49 total (yaw 0.167 / pitch 0.136 / roll 0.113 / lateral 0.076),
against ~0 before — it was pure arm-and-spine rotation. The strike impulse fires off the swing
PHASE, not off `swingHit()`, so a miss hauls you round too; a club with weight only when it
connects telegraphs its own hit detection.

**Design plan written and DECIDED by John: `docs/design/attachments.md`.** Model C — the HUD
rosette is the inventory, no menus — and a displaced arm is EJECTED and recoverable, never
consumed. It also records that **the five attachments have no distinct behaviour today**:
`weapons.js` branches on weapon name exactly once, to pick a tracer colour. Build order and
per-gadget function/animation specs are in that file.

### 🏆 `critic-estate-12` — **`room.ballroom` r14 → PASS 88, a new project high.** Still 0/37 WOWED.
✅ **THE CHEQUER-EDGE-TO-EDGE TELL IS CLOSED.** Blind, it reads as a convincing high-overlook depot
ballroom — parquet field with a chequer marble border, legible litter, crates, dust sheets, one very
hard blown sun patch. The composition now genuinely matches the bar.

### 🔬 RULING: **WHOLE-FRAME MACRO VARIATION IS RETIRED FOR THIS PIECE** — and it was settled by a counter-test
The critic reproduced the numbers on its **own** instrument (art 0.7796 · shipped parquet 0.9411 ·
a fresh `?floor=chequer` break-test at **0.8817** against the claimed r13 baseline of **0.8815**),
so the methodology is sound. **Then it ran the test that actually answers the question:** macro on
the **litpool region alone** shows **the render's sun patch (0.7793) is LESS extreme than the art's
own litpool (0.9089).** **The overshoot comes entirely from the flat dark parquet field beside the
hotspot — exactly the documented mechanism.**
**Its words: "I judge the render better while the number is worse."** ⚠️ **Do not tune this piece to
satisfy whole-frame macro again.** Three critics in a row have now found the metric measures the
floor pattern; this one disproved it with a region test rather than an opinion.

### 🆕 THE NEW FASTEST TELL, and it explains an abstract hate that had no mechanism
**The art's hotspot still shows its WINDOW-MULLION GRID projected on the floor. Ours bloom-floods to
a near-featureless white blob.** That is the concrete cause of the standing *"top-decile chroma
undershoot"* — **0.041 against the art's 0.089, both reproduced exactly.** A metric complaint nobody
could act on is now a visual one anybody can: **the pattern is being blown out, not missing.**

**Independently verified rather than trusted:** the grade gate (PASS 0.055/34.0/7.9, exact) ·
**`?cam=r10` now reproduces exactly on a fresh capture (0.122/39.0/4.5 vs recorded 0.123/39.1/4.5)
and is visually the old low camera — the incomplete-revert saga is closed** · paper legibility
(median |dL| 7.7, share ≥10 43%) · the r9 reflection on **both** materials by running the probe
itself rather than reading the log (`planarPatched=true` on both; `?floor=chequer` breaks clean) ·
**the floor is NOT too dark** — 2.0× was the right conservative stop, darkest decile 7.9 of a 2–8
band.
🆕 **Two new findings:** the floor split has a **real, resolved GPU cost of +0.31 ms (2.46 → 2.77,
interleaved `perf-ab`)** that nobody had logged; and **the bar's red velvet drapery at every window
is entirely absent from ours.**
**What is left, in order: the blown highlight's mullion-pattern loss · the vestibule void (still
flat black at 4× brightness, confirmed fresh) · the missing drapery.**

### `estate-owner-14` — THE FLOOR IS PARQUET NOW, AND **THE MACRO METRIC IS ANTI-CORRELATED WITH THE GOAL**
`room.ballroom` **r14 BUILDING / unscored**, needs `critic-estate-12`. Standing verdict **PASS 87**.

**Built:** a wood-parquet field with the chequer marble left as a **border at the room's edges**,
matching what `refs/bf1/bf1-ballroom-01.png` actually shows. Two coplanar meshes (the unchanged
chequer plane + a parquet plane 4 mm above), behind **`?floor=mixed|chequer`**.

🚨 **THE LEAD'S PREDICTION WAS WRONG AND THE NUMBER WENT THE OTHER WAY.** The brief said fixing the
floor material would move whole-frame macro **toward** the art. Measured: **0.8815 → 0.9968 /
0.9632 / 0.9411 / 0.9199** across four parquet brightnesses — **every one further from the art's
0.7796 than the chequer was.** Reflection ruled out as the cause (`?floorreflect=0` moves it
0.9632 → 0.9596, inside noise).
**The mechanism, documented in the file:** *an edge-to-edge chequer averages toward its own block
mean at 32 px, where a uniform dark field beside one blown sun patch does not — so replacing "busy
but self-cancelling" with "flat plus one hard extreme" widens std/mean regardless of tone.*
⚠️ **So on this piece the metric now moves AWAY from the art as the render moves TOWARD it. Two
critics had already found it partly measures the FLOOR PATTERN rather than the lighting; this is the
end of that line. `critic-estate-12` must rule on whether whole-frame macro is retired here.
Do not "fix" the render to satisfy it.**

✅ **What DID land as predicted: paper legibility, with zero paper-side edits** — median |dL|
**6.6 → 7.7**, share ≥10 **36% → 43%**. Parquet gives the sheets something to sit against.
⚠️ Grade shifted with the darker floor: **PASS 0.041 / 42.9 / 5.2 → PASS 0.055 / 34.0 / 7.9** —
still PASS, but **the darkest decile is now close to the 8 WARN edge.** Pushing brightness to 2.4×
to chase the art's shadow tone **crossed** it, so it stopped at 2.0× (shadow-floor meanL 32.6 vs the
art's matched patch 36.2).
✅ **The r9 planar reflection survived and is applied TWICE, probed rather than assumed** (because
`onBeforeCompile` fails silently here): `planarPatched = true` on both, base gate `[0.06, 0.42]`
untouched, parquet gate `[0.32, 0.68]` tuned to `PARQUET_SURFACE`'s own roughness formula.

### ✅ `?cam=r10` IS FIXED — and the same bug reproduced ITSELF inside the round that fixed it
Vestibule colour and paper count/curl are now gated on `CAM` (pre-r13 values recovered from the
file's own retained comments: count 130, curl 0). ⚠️ **And a THIRD instance was found — introduced
by this very round: `?floor=` defaulted to `mixed` regardless of `CAM`, so `?cam=r10` was silently
getting the new floor too.** Fresh capture after all three fixes: **PASS 0.122 / 39.0 / 4.5 against
the recorded 0.123 / 39.1 / 4.5 — reproduces to within rounding.**
**The lesson is now three-for-three: a new toggle silently inherits every unconditional change made
alongside it. Gate the state, not just the switch.**

### 🏆 `critic-estate-13` — **`room.ballroom` r15 → PASS 90**, a new project high. Still 0/37 WOWED.
✅ **The mullion fix is CONFIRMED and the critic checked its COST rather than just its benefit** — a
legible grid of bright panes divided by mullion-shadow lines in correct perspective, structurally
matching the art's own hotspot, **and all four windows still carry crisp mullion grids: the high
bloom threshold did not turn the window wall to milk.** Canonical gate reproduced **digit-for-digit:
PASS 0.087 / 31.9 / 7.5**. Re-shot twice, **byte-identical at 3 108 945 bytes.**
✅ **Drapery present and colour-correct** at all four windows, sitting in the shadow range as claimed.
🆕 New low-priority hate: **a 3× crop shows a flat, foldless plane with only a rim-lit edge**, where
the art has visible fold banding.
⚠️ **The vestibule still reads as a void — exactly as its own builder said.** At 8× the interior is
**uniform grain with zero legible geometry**, sitting precisely where the art shows a **bright,
detailed columned gallery**. **It is now the single clearest blind-comparison tell in the frame.**

🚨 **AFTER FIFTEEN ROUNDS, A CANDID NOTE NOBODY HAD EVER FLAGGED: THE ROOM SHELL ITSELF DOES NOT
MATCH THE REFERENCE.** *The art is a taller, arched-window, barrel-vaulted double-height hall; ours
is a lower coffered rectangular room.* **That is a real "which one is fake" cue at a glance** — and
it predates every one of the fifteen rounds scored on this piece, including the PASS 88 before this
one. Logged as a candid note rather than a score-reducer, because it is room-shell geometry and out
of one round's scope.
⚠️ **THIS IS A QUESTION FOR JOHN, NOT AN AGENT.** Three options and none is obviously right:
**(a)** accept it and score against the reference's *qualities* — light, materials, dressing —
rather than its architecture; **(b)** rebuild the shell to match, which is expensive and would
invalidate a lot of tuning; **(c)** re-point the bar at a reference whose architecture matches ours.
⚠️ **(c) is goalpost-moving and was already ruled out once** when `bf1-ballroom-03` was rejected as a
substitute bar. **Do not let it happen by drift.**

⚠️ **`?cam=r10` IS STILL A CORRECT REVERT VISUALLY, BUT ITS GRADE NUMBERS HAVE DRIFTED SINCE THE
CAPTURE-DETERMINISM FIX** — fresh **0.120 / 44.0 / 3.9** against the recorded 0.122–0.123 /
39.0–39.1 / 4.5 (**median L +5, ~13%**). Still comfortably PASS. **Not a regression — a
REBASELINE:** `room.ballroom` is an animated view, so its pre-fix captures are unreproducible by
construction. **Any historic figure for an ANIMATED view needs re-taking before it is compared to.**

**What is left for WOWED:** the vestibule needs a real depth reveal (not merely "no longer literal
zero"), and — longer term, out of reach in one round — the room-shell architecture gap.

### 🛑 `critic-estate-14` — **`room.ballroom` HELD at PASS 90, AND IT HAS A CONFIRMED CEILING. STOP POLISHING IT.**

⚠️ **THE VESTIBULE FIX IS REAL IN THE PIXELS AND INVISIBLE TO A VIEWER — and that distinction is the
finding.** At **8×** the stepped gradient is genuine and unambiguous (warm near-band cooling through
two intermediate bands to the unchanged far tone; **no overclaim**). At **native 1× exposure, which
is what a viewer actually sees, there is NO discernible gradient by eye** — uniform dark with just
the arch's lit rim. *"A stranger shown the unlabeled frame would not read this region any differently
than r15's flat void."* **Score held, deliberately — "not rewarding candour, not punishing it, just
judging the pixels a normal viewer would see."**
🚨 **GENERAL LESSON: 8× BRIGHTENING IS A TEST FOR DETECTING A VOID, NOT A TEST FOR WHETHER A FIX
READS.** A change measurable only under brightening is not a fix. **Judge at native exposure.**

✅ **TOE-DECILE EXHAUSTION IS CONFIRMED, by the AO ablation rather than by agreement.** `?ao=0` on
the current build moves darkest-decile L **7.7 → 11.6 (a WARN)**, median **32.0 → 46.5**, top-decile
chroma **0.087 → 0.075**. **The toe moves dramatically with AO and not with visible geometric
depth** — so the ~0.3 headroom is real and is spent by **AO-catching geometry generally**, not just
by the reverted drape pleat.
✅ Gate verified digit-for-digit (**0.087 / 32.0 / 7.7**), `?cam=r10` likewise (**0.120 / 44.0 /
3.9**). ⚠️ **The placement claim (10.6% / 0.000%) was NOT independently re-derived** — no pre-change
baseline capture survived to diff against — **and it was filed as unverified rather than repeated as
fact.**

### 🚨 THE RULING, STATED PLAINLY BY THE CRITIC: **WOWED IS NOT REACHABLE ON THIS PIECE WITHOUT CLOSING THE ROOM-SHELL GAP**
*The art is a taller, arched-window, barrel-vaulted double-height hall with a bright columned,
balustraded gallery through the far arch; ours is a lower coffered rectangular room with square sash
windows.* **That is a structural silhouette-and-proportion tell, not a lighting or material one — no
amount of surface polish fixes it.** And it can only be closed with **geometry**, which is exactly
what the toe-decile budget **can no longer absorb**. *"That is a real ceiling, not just a tight one."*

**LEAD DECISION: `room.ballroom` is DONE at PASS 90 until John rules on the shell.** It is the best
piece on the board, it has had sixteen rounds, and the marginal value of a seventeenth is now near
zero. **Do not spawn another round on it.** The three honest options — **accept the ceiling** ·
**retune the grade to buy toe headroom and then rebuild the shell** · **re-point the bar** (⚠️
**goalpost-moving, already ruled out once when `bf1-ballroom-03` was rejected — do not let it happen
by drift**) — are **John's call, not an agent's.**

**Board after today: 0 WOWED · 5 PASS of 37.** Weakest: `char.detail`/`char.poses` NOT_BUILT ·
`mat.brass` **44** · `mat.walnut` **48** · `mat.lath` **50** · `mat.wallpaper` **52** ·
`wall.1.plaster` **52**. **⚠️ The floor of this board is now entirely MATERIALS — and `mat.*` scores
are the honest ones, so that floor is the shell quality of everything else.**

### `estate-owner-16` — vestibule: **an honest partial**, and a constraint that may CAP this piece
`room.ballroom` **r16 BUILDING / unscored**, needs `critic-estate-14`. Standing verdict **PASS 90**.

**Built the thing r15 named and did not build:** the single flat vestibule material became **five
z-banded materials** interpolating from a brighter near tone (`0xdfd7c2`, at the arch) down to
r15's **exact unchanged** far tone (`0x9a9486`). No new bake (all five clone the same baked
`mats.stone`), same footprint, **+4 draw calls**.
✅ **Placement proven properly: 10.6% of pixels differ INSIDE a box bounding the vestibule, 0.000%
outside, max delta 0.** Gate at default tier **PASS 0.087 / 32.0 / 7.7** (recorded 0.087/31.9/7.5),
**byte-identical across two independent captures.** `?cam=r10` still a complete revert,
**0.120/44.0/3.9 digit-for-digit** against the post-drift-fix figure.

⚠️ **AND IT SAID WHICH, WHICH IS WHAT WAS ASKED.** *"It reads as a gradient / a receding surface,
not as a detailed columned gallery."* At 8× there is a real stepped gradient — near band catching
bounce light, two intermediate bands, flat far tone — so this is **more than "not literal zero" and
genuinely a depth cue.** But **there is no legible geometry there: no columns, no capitals**, only
banded tone on flat box walls. **The blind-comparison tell is REDUCED, NOT ELIMINATED**, and closing
it fully needs geometry — which **brushes directly against the room-shell gap that is John's call.**

### 🚨 THE TOE-DECILE BUDGET IS EXHAUSTED, AND NOT ONLY BY BRIGHTNESS — BY ANY GEOMETRY
**ITEM 2 (drape folds) was built and REVERTED, and the reason is the important part.** A real
pleated panel (sine-displaced plane, ~5 folds, **geometry only, no colour change**) **WARNed the
gate at a bare 12 mm amplitude** — toe **8.05** against an 8.0 ceiling; amp 0.03 → 8.1, amp 0.055 →
8.2. **Halving the amplitude barely moved it, so this is not an amplitude-tuning problem.** Most
likely **the AO pass firing at full occlusion in any crevice regardless of visible depth**, and/or
the loss of the old flat box's thin edge faces which carried more rim highlight than expected.
**Reverted cleanly — the rebuild after revert is byte-identical.**

⚠️ **THE GENERAL CONSTRAINT, NEW AND LOAD-BEARING: only ~0.3 of toe-decile headroom remains
(7.7 vs a 8.0 ceiling), and that budget is now spent by ANY GEOMETRIC RELIEF THAT FEEDS SCREEN-SPACE
AO — not merely by brightness, as the r15 history assumed.** Item 2 demonstrated it **at a scale far
too small to be visually meaningful.** **Treat toe-decile as EXHAUSTED, not tight.**
🚨 **THIS COMPOUNDS THE ROOM-SHELL QUESTION FOR JOHN:** the shell gap can only be closed with
geometry, and **geometry now costs toe budget this piece does not have.** So the honest options
narrow to: **retune the grade to buy headroom**, **find a relief technique that does not feed AO**,
or **accept the piece is near its ceiling under the current gate.**

### `critic-weather-1` — **TWO NEW PASSES.** `hunter.sheet` 82 → **PASS 87** · `hunter.3` 80 → **PASS 85**
**The board is now 5 PASS of 37.** `room.ballroom` 90 · `hunter.sheet` 87 · `hunter.3` 85 ·
`wall.sheet` 78 · `gadget.ball` 60. **Still 0 WOWED.**

✅ **The last open hate on both pieces — uniform, gravity-blind grime — is genuinely CLOSED**, with
all four claims checked **separately** on fresh crops:
- **Armpit:** dark pooling in the crease **while the top-facing curve of the same horizontal tube
  stays lighter** — *that is the proof the term is world-space now and no longer tube-local.*
- **Knee crease: measured, not eyeballed** — crease meanLum **50.0** (91.4% of pixels dark) against
  the adjacent kneecap's **106.7**, roughly half the brightness.
- **Boot-top:** vertical run-off terminating in a **hard-edged pool at the ankle collar seam**, boot
  proper lighter below it.
- **Proud faces** (head dome, pauldron crown): visibly scoured relative to adjacent crevices.

✅ Verified on its **own** captures, not the builder's numbers: greyscale survives (**clearer than in
colour**); placement exact (**two background crops read 0/0 differing bytes**, a torso crop 68.4% at
maxDelta 95 — *matching the builder's maxDelta figure exactly*); `?weather=0` byte-identical twice.
✅ **AND IT RECORDED ITS OWN DEAD END.** It suspected the render reads "more uniformly grimy" than
the reference, **measured it, and found it FALSE** (render 54.5% clean / 35.6% dirty vs the
reference's own 41.6% / 42.8% on an equivalent crop) — then **filed the disproof so nobody reopens
it.** *Recording a killed hunch is as valuable as recording a finding.*

✅ **Both no-change claims independently confirmed**, exactly as the builder asked: `mat.robot`
**0.394%** of bytes (claimed 0.39) — **the razor-straight full-width black diagonal boot bar is
untouched** — and `char.turnaround` **1.355%** (claimed 1.36), contact shading only at grime 0.
**Neither round gets credit it did not earn.**

🆕 ⚠️ **AN INSTRUMENT NOTE THAT EXPLAINS A LONG-RUNNING MYSTERY: `overlay.mjs` PRODUCES GARBAGE ON
`hunter.3`** — scanline noise, no clean silhouette — **almost certainly because hunter.3's frame
carries TWO figures against the reference's ONE.** *That is very likely why this piece's IoU came
back 68.8%, 81.2% and 71.8% across three honest re-derivations.* **Do not trust `overlay.mjs` on a
two-figure frame without looking at its output image.**

### 🌧️ `robot-owner-1` — **THE GRAVITY TERM WAS A TEXTURE COORDINATE, NOT A DIRECTION**
`hunter.3` r16 · `hunter.sheet` r5 · `mat.robot` r37 · `char.turnaround` r37 — **all BUILDING /
unscored**, need a critic.

**The cause.** `SHELL_SURFACE` and `CHROME_SURFACE` both carried
`float gravity = 1.0 - smoothstep(0.0, 0.95, uv.y)` — **but these surfaces are BAKED.**
`baker().standard()` evaluates them **once** into a 512² tile that is then **repeated over every
mesh**. So "down" pointed down a vertical thigh, **along a horizontal outstretched arm**, and
radially on a sphere, and the same tile landed on the armpit, the knee crease and the boot top at
identical orientation and strength. **That is precisely the reported defect, and nothing tunable
inside those shaders could ever have fixed it.**
✅ **`plaster.js` uses the same idiom and is CORRECT — because a wall's v axis really is world up.**
The idiom is right for walls and wrong for characters.
✅ **It explicitly tested the "already present but overridden" trap and reports it was NOT that** —
nothing overrides the shell's weathering; there was simply no world-space term anywhere.

**Built** as a render-time `onBeforeCompile` layer installed **only when the toggle is on**, so the
revert is complete *by construction*: pooling in pockets and seams, vertical run-off (noise held
constant along world Y with a sawtooth giving each streak a hard top edge and downward fade),
scoured proud/upward faces, sheltered undersides keeping theirs.
✅ **Greyscale and 35%-dark passes: the reads SURVIVE and are arguably CLEARER than in colour**
(`harness/desat.mjs`). Corroborated numerically — **median and topChroma unchanged on all four
pieces**; only `toeL` moves (hunter.3 61.3→55.2, sheet 66.1→59.6).
✅ **`?weather=0` is a BYTE-IDENTICAL revert: 0 of 6 220 800 RGB bytes differing.**
✅ **And the difference is PLACED, not global** — empty cyc **0/200 000** differing, empty floor
**1/68 000** at max delta 1, hunter torso **70 362/90 000** at max delta 95. Perf **NOT RESOLVED**
(0.86 on vs 0.82 off against a 0.10 ms spread); all seven other robot-consuming views still render.

🚨 **A LATENT HAZARD AFFECTING EVERY `onBeforeCompile` IN THE REPO — AND IT IS LIVE TODAY.**
`src/post/pipeline.js`'s `patchForScreenAO()` **ASSIGNS** `material.customProgramCacheKey` rather
than composing it, **so any key a material sets for itself is silently discarded at scene finalize.**
Three's program key is built from booleans like *"has a normalMap"*, **not texture identity**, so
**two patched materials with matching map slots can be handed each other's program** — a robot shell
plus a baked `marble.js` material in one room is enough. ⚠️ **`brandDecal`'s key is clobbered this
way RIGHT NOW.** Durable fix used here: **put the discriminator in `material.defines`**, which
`WebGLPrograms.getProgramCacheKey` also hashes and nothing rewrites. **Fixing `patchForScreenAO` to
compose rather than assign is queued and should be done before the next capture-heavy round.**

⚠️ **TWO CORRECTIONS TO THE LEAD'S BRIEF:**
1. **"This also reaches `mat.robot` (51)" DID NOT HOLD.** It moved **0.39% of bytes** and its grade
   is flat (mean 95.623 → 95.624) — its specimens run at grime 0 and are large smooth forms with
   almost no pockets, **and its open hate (the straight black diagonal bar across the boot) is
   untouched. Record it as NO CHANGE, not a win.**
2. **This is NOT the same bug class as the rider's shared material instance.** `SHELL_SURFACE` is
   shared *code*, but **each `shellWhite()` call makes a NEW material instance** — the baker caches
   the bake, not the material. The lead conflated the two.

✅ **THE METHOD IS THE MOST VALUABLE PART, AND IT OVERTURNED ITS OWN DESIGN.** The first cut was
tuned by guessing and landed almost invisible — *indistinguishable from a mask reading nothing*. So
it built `?weather=debug|debug2|debug3` (kept). That showed **screen-space curvature fires
beautifully on every panel line and rim but finds essentially NOTHING in the armpit**, because
**curvature only sees concavity WITHIN one continuous surface** and this character's pockets are
gaps between separate interpenetrating meshes. The signal that does see them is **the pipeline's own
AO buffer**, now exported and reused as a cavity mask. **Its threshold could not be guessed either:**
`debug3` bands the raw buffer and shows it sits almost entirely in **0.50–0.85** (general occlusion)
with real pockets in the sparse **0.30–0.50** band — *the first window of 0.34–0.92 called the entire
character a crevice.*

### `estate-owner-15` — **THE MULLIONS WERE NEVER MISSING. NOR WAS THE DRAPERY.** (`room.ballroom` r15 BUILDING/unscored)

🚨 **THE DOMINANT DEFECT CLASS OF THIS ENTIRE CAMPAIGN, NOW NAMED: THE THING YOU THINK IS MISSING IS
USUALLY PRESENT AND SUPPRESSED.** Four instances in two days, three of them today:
| reported as | actually |
|---|---|
| the rider reads as a twin | it was wearing **the host's red FACE material instance** |
| the rider has no torso | it was wearing **the host's cracked SHELL material instance** |
| the hotspot has no mullion pattern | **the shadow map already resolved it — BLOOM was smearing it back** |
| the room has no drapery | **the geometry existed; its material rasterised to RGB (4,3,3)** |
**Before authoring anything to fix a read: break-test whether it is already there and being erased.**

✅ **ITEM 1 — the blown highlight is FIXED, and the mechanism was proven by break-test.** Setting
`bloomStrength:0` showed **the mullion-grid shadow was ALREADY fully resolved by the shadow map**
(local contrast hsStd/mean **0.668 → 0.931**) — *so the shadow map, the mullion geometry and the
spot's 19400 intensity were never the cause.* **Bloom's upsample chain was smearing light back onto
the shadowed grid lines.** Fix: `bloomThreshold` **1.25 → 15** (excludes the extreme hotspot from
the accumulator) plus `exposure` **1.28 → 1.55** (restores the median bloom had been propping up).
**Top-decile chroma 0.055 → 0.088 against the art's 0.089.** `bloomStrength`/`bloomRadius`
untouched, and the window wall does not turn to milk.

⚠️ **AND IT REFUTED THE LEAD'S SPECULATION ABOUT WHY.** HANDOFF proposed the drapery as "the route
to the missing warm top-decile chroma." **It is not** — chroma sits at ~0.087–0.088 with the drape
old *or* new, because **the drape lives in the shadow range and never reaches the brightest decile.**
**Item 1's bloom fix is what moved that number.**

✅ **ITEM 3 — the drapery: geometry ALREADY PRESENT, material invisible.** `0x3a0d10` rasterised to
raw RGB **~(4,3,3)** under this room's light. Forcing it pure white capped at only **~(75,60,52)**,
proving the drape is genuinely indirect-lit and **the fix is a saturated albedo, not more light.**
Landed at `0xc02030`, matched against the art's own sampled shaded-drapery pixels. ⚠️ *"Ours has
none at all" was wrong — it was present and invisible, which is a different bug.*

⚠️ **ITEM 2 — the vestibule: PARTIAL, and flagged as unresolved rather than claimed.** Proved by
ablation that it is **lighting, not geometry or culling** (emissive-white lit it fully; diffuse-white
still only reached 50–63 raw, so almost no ambient reaches it). 🆕 **The shipped colour rasterised
to LITERAL (0,0,0) via the grade's `contrast` PIVOT — any sufficiently dark value goes negative and
clamps to zero BEFORE the material colour matters at all.** Brightened `0x6d685e → 0x9a9486`: now
10–17 with a faint real gradient at 4×, **but still a subtle read, not a depth reveal.**
🆕 **A shared budget nobody had noticed:** brightening the drape *or* the vestibule promotes
near-zero screen area into the frame's **darkest decile**, so they compete for the same gate.
Solved jointly with `toeCrush` 0 → 0.018 plus the exposure bump. **Final canonical `grade.mjs` on
the shipped build: PASS 0.087 / 31.9 / 7.5** — verified with the canonical tool, not only its own
sweep instrument.
**Left:** the vestibule likely wants an authored **near/far gradient** (a different material per
surface) rather than one flat colour — cheaper per unit of visible improvement in toe-decile budget.

### ⛏️ `dig-1` — **JOHN'S DIG MECHANIC IS BUILT AND MEASURED**, behind `?dig=1`, default off
`src/game/dig.js` (new): `DIG_EDGES`, `digPanels()`, `barrierSlabs()`, `DIG_DEFS`.
**Contracts green after every change:** build ✓ · `mechanics.mjs` **11/11** · `escape.mjs` **20/20**.

**What a dig feels like** (seed s4, trigger held):

| | wallpaper | plaster | lath | beam | **to the barrier** |
|---|---|---|---|---|---|
| hp | 50 | 140 | 330 | 850 | 1370 |
| **seconds** | **0.18** | **0.78** | **1.62** | **4.44** | **7.02** |
| one round removes | **52%** | 18.6% | 7.9% | **3.1%** | |

✅ **THE FALLOFF IS MONOTONE BY CONSTRUCTION, NOT BY TUNING.** `_apply()` drives the break mask from
`1 - stageHealth/def.health`, so **rising health IS a smaller chunk per hit** — *the feedback and the
search heuristic are the same channel, exactly as John designed, with no HUD number.*
**Control: an ordinary `BREACHABLE` panel in the same wall, same driver, same page = 1.26 s. A dud
dig is ×5.6 a traversal breach.**

✅ **YOU CANNOT MEET IN THE MIDDLE — PROVEN.** One shared edge = two panels (one per room) + **ONE
brick barrier with NO STATE AT ALL. Zero barrier state cannot desync** — the cleanest possible answer
to the two-sided requirement. Both faces driven to the end: both terminal at `barrier`, **no breach
portal, not in the BFS route, sight blocked, a body shoved at it for 120 steps got 0.000 m past the
face**, 40 further hits moved 0 stages. ⚠️ **The terminal state is REQUIRED, not cosmetic** —
`breachPortals()` would otherwise hand the AI a route through masonry.

✅ **PROMOTION REGRESSED AND DEMOTION WAS BUILT.** Exactly the risk flagged: pristine **586** → 19
promoted **591** → **37 promoted with no demotion: 754, OVER the 625 gate.** Demotion (`spent`
getter: last stage · undamageable · `!canOpen()`, plus a shared `InstancedMesh` set per aperture)
takes the same station from **754 → 622, −132**. ⚠️ **Inert on the shipped build by construction** —
every shipped stage table ends at `open`, so no panel is ever `spent`.
**Cost of dig itself: 36 extra panels for ~0–6 calls** (`?dig=1` pristine 584–590). `inst-census`:
`service.mid` **29 panels for 4 calls, 0 own meshes**; ballroom **49 panels for 6–7**.

🚨 **AND IT FOUND A LIVE BUG IN THE DEFAULT SHIPPED BUILD, BY MEASUREMENT.** `setInstanced(true)`
early-outs forever, but `_apply()` assigned `layers[i].visible` **unconditionally** and `update(dt)`
calls it every frame for 0.55 s after any stage change — **so instanced panels turned their own
layers back on and `sync()` could not undo it.** `applyExitPlan()` calls `_apply()` on all 14 exit
sites at boot and 13 chained ones are pristine, **so this was live in the shipping game**. Priced at
`service.mid`: **+10 calls / +11 meshes.** One-line fix; `?dig=0` now measures **578** against the
586 baseline.

⚠️ **A FACT THE LEAD PROPAGATED THAT DOES NOT HOLD.** *"The ±2 spread is `service.mid` alone — every
other station reproduces to the digit."* **False in these runs:** `service.mid` was the *stablest*
station, and **`ballroom.north` read 579 and 622 for what should be the same state, minutes apart in
one page.** Cause not isolated. **Do not gate on a ballroom station reproducing to the digit.**

### ⚠️ What `dig-1` left, and the reasons — this is the next round's brief
1. **The interconnect, the house-wide unlock and the hunter crossing** — deliberate. ⚠️ **Until the
   interconnect exists EVERY dig is a dud, so the falloff is validated as a FEEL but not yet as a
   SEARCH HEURISTIC.** That is the honest limit of this slice.
2. 🚨 **THE SEGMENTS WEAR NO DRESSING AND THE SHIPPED PANELS DO — a tell `procedural-map.md` §2
   forbids.** Visible in `game.play.dig-wall-pristine.png`: *the one bay wearing boards and a chain
   is the one that actually goes somewhere.* The dressing geometry is authored at 2.08 × 2.68 and
   scales per instance, **so a padlock on a 1.14 m segment stretches 0.55×. Must be fixed AT SEGMENT
   SCALE when the interconnect lands.**
3. **The brick is a first pass and has never been near `refs/lath/*`** — in the west study it does
   not read at all. **`mat.brick` belongs on the board beside `mat.lath`.**
4. **A segment is a full-height 1.14 × 2.68 slot — a narrow bay, not the reference's "big chunk".**
   ⚠️ **Sub-dividing the HEIGHT would give `dig.md`'s low interconnect AND the D7 mechanic for
   free**, at the cost of one more aperture group.
5. **GPU time not measured — a refusal, not an omission** (port 5178 listening all session), the
   same call `instancing-1` made.
6. 🆕 **FX cost of a real dig is unmeasured, and there is a latent problem: DEBRIS AND DUST ARE
   PARENTED TO THE SCENE, so residency NEVER hides them.** 144 bursts on one frame moved
   `chapel.centre` — *which can see no segment* — by **+10 calls**.
7. ⚠️ **One `mechanics.mjs` run reported 10/1 while a second Chromium ran on another port; alone it
   is 11/11 twice. Do not run two playtests at once and trust an input probe.** Also:
   **`mechanics.mjs` DEFAULTS to port 5193 — always pass `--port`.**

### `critic-hunter-5` — **`hunter.3` 73 → 80 · `hunter.sheet` 75 → 82.** The strongest pair on the board outside the estate.
Board: **hunter.sheet 82 · hunter.3 80 · absorb 68 · hunter.1 66 · hunter.2 57.**

✅ **THE ABSORBED TORSO READS, and the critic closed its OWN hate.** Four independent crops across
both pieces (including the sheet's far-end figure, not inferred from the solo shot) all show, cold:
**a smooth pale off-white/cyan chest panel with a legible logo and mint shoulder caps**, textured
and coloured distinctly from the host's dark mottled cracked shell. **A genuine second body, not an
implication.**

🆕 **AND `ART_MANIFEST.md` SETTLES THE REFERENCE ARGUMENT WE HAD BEEN HAVING FOR DAYS.** Its own
weathering-ramp table (*"Hunter weathering ramp, read off sheet 06"*), Heads row, stage 3, reads
literally: **"2 side by side + rider torso."** **So two heads AND a visible torso was always the
spec** — the turnaround sheet's twin heads were never wrong, the hero pose was the outlier, and the
torso was never a critic invention. ⚠️ **Nobody had read the manifest's own table. Check it before
adjudicating between two references again.**

✅ **The twins read survived** — verified at all four crops and zooms; the fix was materials-only, so
the size/position delta carrying the read is untouched.
✅ **AND IT SURVIVES WITHOUT COLOUR — tested, not assumed.** No desaturation tool existed, so the
critic **built one** and ran both a pure greyscale and a 35%-luminance dark pass: **both heads stay
separable by size and position** (eyes reduce to plain dots of different size and spacing), and
**the torso stays visible as a lighter-VALUE smooth surface against darker mottled host texture — a
value/texture cue, not a hue cue.** The fix adds colour information without depending on it.
*(Tool rehomed by the lead to `harness/desat.mjs` — colour-independence checks will recur.)*
✅ **Perf clean at pinned `quality=medium`**, and it **discarded a 1202 ms first-run frame as
textbook cold-shader-compile contamination** rather than reporting it: `hunter.3` 250 calls /
338 632 tris / GPU 0.78 ms; `hunter.sheet` 410 / 568 364 / 0.94–1.0 ms, CPU 1.68–1.94 ms. **The
inherited CPU-budget-miss note did not reproduce on either warm run.**

### 🚨 ONE HATE REMAINS ON BOTH, IT IS THE ONLY THING HOLDING THEM AT WEAK, AND IT IS NOT IN THE HUNTER FILES
**Inherited uniform grime with no gravity or geometry logic** — checked fresh: **armpit, knee crevice
and boot-top all read as the same flat mottled speckle, with no pooling at seams.** *"Uniform dirt
that ignores gravity and geometry"* is an explicitly listed standard failure mode.
**It lives in `src/materials/surfaces/robot.js`'s `SHELL_SURFACE` (line 25), which is SHARED** — so
one fix lifts `hunter.3` (80), `hunter.sheet` (82), `mat.robot` (51), `char.turnaround` (61) and
every robot piece at once. **This is now the highest-leverage single material job on the board.**

### `hunter-owner-4` — **A SHARED MATERIAL INSTANCE HID THE RIDER'S TORSO. SECOND TIME THIS BUG CLASS HAS BEEN THE ANSWER.**
`hunter.3` **r15** · `hunter.sheet` **r4** — both BUILDING / unscored, need `critic-hunter-5`.

**The rider's shell and mint-cap materials were the LITERAL SAME INSTANCES as the host's** —
`materials: { ...mats, face: riderFace }` only ever overrode `face`. So the one torso fragment that
clears the collar was textured identically to the host's **fully-corrupted, fully-cracked stage-3
shell, and disappeared into "more hunter."** Fixed with its own `shellWhite`/`mintCap` override —
clean, cool-toned, uncracked: **a captured player body rather than a corroded one** — with **zero
geometry, position or size change.** A distinct white/blue torso fragment is now visible under the
small head on both pieces, and **the twins read did not regress.**

🚨 **THE GENERAL LESSON, NOW TWICE PROVEN: A SHARED MATERIAL INSTANCE SILENTLY COUPLES TWO THINGS
THAT ARE SUPPOSED TO READ DIFFERENTLY, AND IT LOOKS LIKE A GEOMETRY PROBLEM.** Round one: the rider
shared the host's **red face material**, which is why shrinking it alone never killed the twins read.
Round two: it shared the host's **shell**, which is why the torso "was not there" when it was.
**Before modelling anything new to fix a read, check whether the thing already exists and is wearing
the wrong material.**

### 🔎 `hunter.2` — the "too narrow" hate REFUTED A THIRD TIME, and the real defect found
Two independent crop sets: figure IoU **71.8%** and **70.8%** (card 70.7%); shoulder/chest band
**render wider by +11% to +58%**; waist/hip bands **roughly flat (−3% to +8%)** — nothing like the
dramatic narrowing claimed. ⚠️ The leg/crotch detector was **confirmed unreliable on this pose**
(legL joints undetected in both crops, crotch off by up to 0.24H) and those rows were discounted.

🆕 **THE REAL DEFECT: `POSTURE[2].armOut = 0.37` swings the arm away from the ribs starting at the
SHOULDER.** The render's arm/torso daylight gap begins at **0.86H against the sheet's 0.61H** — the
sheet's arm hugs the ribs and only flares at the elbow. **It contradicts the manifest's own stage-2
spec ("arms hang past knees", `ART_MANIFEST.md` #06)** and reads as a flung reach.

⚠️ **AND IT IS PROBABLY WHY THE WIDTH MEASUREMENTS HAVE BEEN UNSTABLE FOR ROUNDS: an earlier,
now-refuted "narrower" claim already drove `armOut`/`shoulderOut`/`chestWide`/`hipWide` UP once.**
A false hate caused a real geometry change, which then destabilised every measurement taken
afterwards. The stale code comment recording that has been corrected in place.
✅ **Correctly left UNFIXED** rather than risk a second untested geometry swing — a scoped
recommendation (`armOut` ≈ **0.20–0.24**) is in `hunter.js` and the status log for the next owner.
✅ Also: **"the shoulder port reads too tidy" appears already resolved** on inspection (irregular
staining, visible bore shadow) — treated as not open.
✅ A CPU-budget miss on `hunter.sheet` (~2.0–2.3 ms vs a 2.0 ms budget) **reproduced identically
with the change fully disabled** — pre-existing machine contention, not a regression. **That is the
right way to clear yourself.**

### `critic-hunter-4` — **`hunter.3` 56 → 73** (was the group's lowest) · **`hunter.sheet` 64 → 75** (now its highest)
Board: **hunter.sheet 75 · hunter.3 73 · hunter.absorb 68 · hunter.1 66 · hunter.2 57.**

✅ **THE BLIND CROP PASSES, AT FOUR CROPS AND THREE ZOOMS.** Cold read of a context-free head/collar:
*"one large forward-facing head, black visor, two bright red eyes, dominant and centred — and tucked
lower and to its right, a visibly smaller head with a small dark visor and two dim cool-blue eyes,
partially behind the main head's shoulder line."* **Unambiguously big-head-plus-passenger, not
twins** — including on the sheet, where the complaint was originally scored. Filed as
`status.mjs blind` CORRECT on both pieces.
✅ **Cross-checked GEOMETRICALLY, independent of visual judgement:** `--pick` at the hand-shaped
detail near the collar resolved to **`j.wristL.merged`** — corroborating the rider's grip without
relying on size or colour perception at all. **Copy this: a visual claim confirmed by a
non-visual instrument.**

✅ **RULING — colour is NOT carrying the read.** The second head's dome and silhouette are
*geometrically* smaller and sit partly behind the host's shoulder mass, **a shape/occlusion cue that
survives a monochrome or dark frame.** The dim blue eyes are reinforcement, not the load-bearing
signal. The three-lever approach is not overweighted on colour.

⚠️ **THE TWO STAGE-3 REFERENCES DISAGREE MORE SHARPLY THAN RECORDED, and the render matches
NEITHER:** the **hero pose** shows **only ONE head at all** — the rider is almost entirely absorbed,
just a gripping hand at the collar — while the **sheet's stage-3 front column** shows genuine
near-equal-size red-eyed twins. **Our render shows a visible-but-smaller second head, which neither
source depicts.** Per the standing ruling that is fine: **the target is the blind reader, and it
clears that bar.**
⚠️ **The torso ask STANDS on both pieces** — nothing below the small head is visible, so *"an
absorbed body"* is told entirely through head size, occlusion and one gripping hand.

✅ **The "too narrow" refutation re-derived a THIRD time, independently:** figure IoU **81.2%**, card
**77.5%**, landmarks shoulder **+11.7%**, waist **+11.7%**, hips **+3.7%** — **same direction
(wider), different magnitude**, which is expected because IoU is crop-sensitive. **Leaving the
geometry alone was correct.**
✅ **The 250-vs-486 draw-call mystery is CLOSED and it was never the rider.** Two independent tools
both read **250 calls / ~338–339k tris**, and the **mesh count is identical (124)** to the historic
486/124 — *same geometry, different calls-per-mesh ratio (3.9 → 2.0)*, i.e. a **quality-tier or
dist-staleness artifact, not a like-for-like comparison.** ⚠️ It also contradicted an inherited
**over-budget** figure on the sheet, likewise a different-tier reading. **Pin `quality=medium`
before comparing any call count to a recorded one.**

### `hunter-owner-3` — **THE TWINS READ IS FIXED**, and the "too narrow" hate is REFUTED on BOTH pieces
`hunter.3` **BUILDING r14** · `hunter.sheet` **BUILDING r3** — both unscored, need `critic-hunter-4`.

**The blind crop no longer says twins.** Before: two black-visored heads at near-equal size, both
bright red eyes, side by side — reproduced verbatim on the pre-fix render. After: **one large
dominant red-eyed head plus a visibly smaller, dim cool-blue-eyed head tucked lower and behind**,
with the rider's own gripping hands at the collar (confirmed by `--pick` as `j.wristL`/`j.wristR`).
Checked at three zoom levels and in the `hunter.sheet` four-up.

⚠️ **THREE LEVERS WERE NEEDED — ANY ONE ALONE STILL READ AS A SMALL TWIN:**
1. **Size** 0.66H → 0.50H.
2. **Registration** — moved from outboard+forward (0.150H / 0.088H, *the most visible spot on the
   model, facing the 26° camera*) to inboard+low+barely-forward (0.072H / −0.086H / 0.020H) so the
   host's own head and shoulder mass partially occlude it. **"Peeking", not "posing beside".**
3. 🆕 **THE RIDER WAS SHARING THE HOST'S OWN BRIGHT-RED FACE *MATERIAL INSTANCE*.** It now gets a
   dim, small, cool-blue `faceOverride` — *a fading echo of the player's blue rather than the
   hunter's red* — **so even a visible sliver breaks the both-red-eyed signature independently of
   geometry.** *The twins read was never purely a geometry problem, and that is why size alone had
   failed before.*

🚨 **"ARM SPLAY TOO NARROW" IS REFUTED — THE DIRECTION IS THE OPPOSITE, AND IT AFFECTS TWO PIECES.**
The hate cited 71.3% "freshly re-measured" (below a pre-round 75.9%, below an inherited 79.1→81.5),
all describing the render as **too narrow**. Re-derived three independent ways on isolated
single-figure crops: `overlay.mjs` figure mode **IoU 68.8%**, card mode **67.1%**, and `measure.mjs`
landmarks **shoulder +19.8%, waist +21.7%, hips +20.3%, fingertip band +21.2% — every band POSITIVE,
i.e. the render is WIDER than the sheet**, with render-only mass on both flanks in the card overlay.
**Widening would have made it worse, so the geometry was correctly left alone.**
⚠️ **`hunter.2` carries the same wrong direction** — re-derived at IoU 68.3% (close to the inherited
66.3–66.5) but again **wider, not narrower: shoulder +19%, waist +20%, hips +40%.** Left untouched;
**whoever owns `hunter.2` next must not act on the inherited claim.**
⚠️ Honest caveat from the same agent: **the tool's crotch/leg detection was unreliable on this pose**
(crotch fraction off by 0.2H vs reference), so treat exact percentages as approximate — **but the
direction was consistent and reproducible across three methods.**

⚠️ **UNEXPLAINED AND REPORTED AS MEASURED RATHER THAN RATIONALISED:** `hunter.3` now measures **250
calls / 339k tris** against a previously recorded **486 / 677k**. Shrinking a rider should not
roughly halve draw calls. **Do not assume this round caused it — find out what did.**
**Left open, stated:** the rider's torso plate is still mostly occluded, so *"a distinct absorbed
torso"* is **implied** (smaller head, different shoulder cap, gripping hands) rather than shown —
a critic may fairly still want more of it visible.


## game.play FAIRNESS — play-critic-3's WEAK 52 list, worked (2026-08-03 ~19:30)

Instrument: `harness/scenarios/diag-fair.mjs`, three parts, one at a time —
`DIAG=route|melee|hud node harness/playtest.mjs --view game.play --script
harness/scenarios/diag-fair.mjs --port 5193 --shots`.

**1. Route-fragile opening — FIXED, measured on both routes.** The old `PATROL_ROUTE[0..2]`
put three consecutive stops on x ≈ 8.6–11.5, the D6 axis, so a player following the gallery
east into study_e met the hunter head-on in a 6.7 m corridor. Leg 0→1 now sweeps **west** along
the ballroom's south wall (D6's jamb blocks any sightline into study_e from west of x ≈ 2.85).

| route | before | after |
|---|---|---|
| stop-short (3 anchors) | ALERT 41.8 s · closest 11.6 m | **never alerts in 45 s** · closest 23.4 m |
| natural-east (into study_e) | **ALERT 17.6 s** · PURSUE 18.3 · ATTACK 21.2 · closest 0.3 m | **ALERT 21.8 s** · PURSUE 22.7 · ATTACK 28.2 · first limb 32.8 s |

The encounter also changed shape: first clear sightline 11.3 m through a corridor door → **16 m
across the open ballroom**, and warning-to-contact went 3.6 s → 6.4 s. Cost, stated plainly:
one lap is now ~185 s (was ~160), and a player who stops in the middle of the gallery gets a
completely quiet 45 s. **That trade is forced by geometry** — at 0.78 m/s patrol speed the only
route reaching the gallery inside 45 s is the one up study_e that caused the ambush.

**2. Inconsistent close-quarters lethality — ROOT-CAUSED and FIXED.** Two causes, both invisible:
- **`_swing` was one field shared by `_attack` (2.35 s), `_breach` (0.85 s) and `stagger` (1.6 s),
  reset by nothing.** `_attack` opened with `this._swing = (this._swing ?? 0) - dt; if (> 0)
  return;` — so on a fresh round it was `undefined → -dt` and **the limb came off on the frame
  ATTACK was entered**, zero windup. Inherit 2.35 s from an earlier encounter instead and the
  player gets 2.35 free seconds. That is the whole 300 ms-kill / clean-escape spread.
- **the round-reset limb bug above**, which made "identical" trials not identical.

Fixed: ATTACK owns `_wind`, set on ENTRY (`ATTACK_WINDUP` 0.85 s), with `ATTACK_REGRIP` 0.45 s so
boundary stutter-stepping cannot farm free resets; `_swing` is BREACH's alone; `resetCombat()`
clears both plus the stagger economy. `_animate` now draws the windup against the timer that
actually gates the strike (it was drawing anticipation *after* the hit).

Verification, 6 identical staged 5 m PURSUE trials: **6/6 agree**, first limb 2.34–2.37 s
(spread 0.03 s), windup entry→strike **0.83–0.85 s (spread 0.02 s)**, follow-up cadence 2.36 s.
Before: 3/7 lost a limb and 4 did not, from the same staging. And it is a real reaction window,
not a delay — **4/4 escape intact by backing off on the tell**, holding at a padded 350 ms
human reaction (`REACT_MS`); the rig's own lag is only 0.05–0.09 s, which is why that padding
exists. Same staging, standing still, costs a limb every time.

**3. HUD priority — verified, and one bug found and fixed.** Wound > deny > place is real
(`hud-*.png` in `progress/playtest/`). But rank-as-absolute swallowed live input: strip both
arms, wait 2.6 s, press the trigger, and the HUD answered `LEFT ARM TORN OFF` — a caption for a
3 s-old event — while the button went unacknowledged. `feel-a` caught it. A DENY may now take
the slot from a higher rank that has had its `MIN_HOLD`, and never queues (a stale "NO WEAPON"
is a lie); a queued backlog drains at `MIN_HOLD + 0.28` so four limbs read as four events
without 7.6 s of text. `feel-a`'s LMB probe went FAIL → ok.

**4. Gate card** now carries two lines of world above the controls: limbs are health *and*
weapons; it grows from what it takes. No objectives, no map, nothing about the chapel.

### ⚠️ OPEN, and NOT mine to fix: the awareness ramp gives ~0.8 s of warning at any range

`mansion` A2 (`warning window ≥ 6.0 s`) **FAILS at 0.6 s**, and `feel-b`'s ≥ 2.0 s phase fails at
1.91 s, reproducibly. This is **not** a regression from the work above — A2 *skipped* in the
before-gate ("the probe was not walking"), so it was never measured, and reverting the route
change reproduces 1.91 s exactly. It is arithmetic in `HUNTER_SENSE` (`src/game/rules.js`, not
in this slice's ownership): `gain = sightGainFar + (sightGainNear − sightGainFar)·(1 − d/26)`
is 0.90/s at 15 m, and `alertAt` is 0.22, so ALERT lands 0.24 s after first sight and PURSUE
0.9 s after that — **at 20 m as at 10 m**. Distance buys almost nothing, which is why a long
sightline cannot be a "you see it before it sees you" beat today. Whoever owns `rules.js`:
lowering `sightGainFar` (0.40 → ~0.12) and raising `alertAt` are the two knobs; both change
every feel-* number, so it needs its own before/after and a critic.

## FLEEING WORKS. The defect was that nobody could tell. (game-feel-3, 2026-08-04)

play-critic-4's #2 — *"once caught, death is near-instant"*, notice to zero limbs in under ten
played seconds — is **half right, and the wrong half was fixed.** It caveated that it never
tried to FLEE. It should have: running away works at every point in the encounter.

⚠️ **The measurement it was handed with it was WRONG, and here is the mechanism.** The old
`harness/scenarios/flee-survival.mjs` staged both bodies at `gallery.mid` with the hunter 7 m
along **−X**, then held **W** — which drives along `cam.yaw`, left at PI by `resetRound()`, i.e.
**−Z**. The gallery is 27.2 m on X and **6.7 m on Z**. So the "fleeing" player ran 3.4 m into the
south wall and stood there. Its reported 2.36 m final separation was not a coincidence:
`_arbitrate` enters ATTACK at `reach × (stage×0.35 + 0.8)` = **2.3575 m**. The instrument
measured a player pinned exactly on the attack boundary. Reproduced deliberately with
`BREAK=wall` — the old staging, byte for byte, still loses 3 limbs and ends 2.02 m away, and
three assertions go red.

**Re-measured with room to run** (gallery long axis and ballroom, hunter staged 7 m behind in
PURSUE, free-run ratio 0.98 of a clear sprint so nothing is pinning the body):

| | first limb | limbs | ended |
|---|---|---|---|
| STAND (no keys) | 3.32 s, then 5.68 and 8.05 | **1 / 4** | 2.0 m |
| FLEE on the commit | never | 4 / 4 | 7.2 m clear |
| FLEE on the REAR-BACK, already at 2.0 m | never | 4 / 4 | broke reach |
| FLEE a ROUTE (gallery → D3 → study_e) | never | 4 / 4 | hunter → **SEARCH at 6.9 s, 18.6 m behind** |

So the encounter is decided by what the player does, and the critic's ten seconds is the
*correct* punishment for standing still (`ATTACK_CADENCE` 2.35 s × 4). **No balance number was
touched** — sense, windup, cadence and speeds are all unchanged, and the STAND row is an
assertion in the suite precisely so nobody softens them by accident.

**The real defect, measured** (`harness/scenarios/commit-tell.mjs`, awareness forced frame by
frame with both bodies pinned, frames photographed and diffed against a same-awareness noise
floor): crossing `commitAt` changed the frame by **1.1× the noise floor of the room's own
breathing lights, over fewer pixels than that floor moves on its own.** Every channel —
faceplate emissive, eye light, HUD threat — was a *continuous* function of `awareness`, so "it
is thinking about it" and "it is coming for you" photographed the same. There was no moment,
so there was nothing to react to. Standing still was the reasonable move.

**Fixed as an EVENT, on three channels, and the third is the one that matters:**
- `HunterAI._commitStep()` — a **latch**, not a state test. Fires `onCommit` once on entering
  PURSUE/ATTACK and re-arms only below `alertAt` (1.43 s of no contact). ⚠️ This is not
  fussiness: a one-legged player sits exactly on the ATTACK reach boundary and the state
  oscillates — **136 PURSUE/ATTACK transitions in 9.4 s, measured**, against which the alarm
  fires **once**. Driven off "entered PURSUE" it would have been wallpaper in one round.
- in-world: a one-shot punch on the faceplate and the eye light, well past their ramp ceilings,
  decaying over 0.55 s. No new light, no new material, no draw call.
- HUD: `hud.alarm()` — one line, `IT HAS SEEN YOU`, at a new `RANK.alarm` of **2.5** (ordinal,
  deliberately fractional so `_msgState()`'s existing rank assertions keep pointing at the same
  things), plus a **chase mode** on the threat vignette: the slow breath becomes a fast hard
  pulse, with a punch on the frame it changes over. The uncommitted branch is arithmetically
  identical to what shipped before — presence was not what was wrong.

Result, photographed: **14.2 mean |Δ| over 53% of pixels, 4.1× that view's own noise floor**,
and larger than any step on the approach despite being the smallest change in awareness. With
the camera turned AWAY from the hunter — the posture a fleeing player is actually in —
**13.0 over 45% of pixels, 2.4×**. Reverted at runtime (`BREAK=blind`), both go red.

⚠️ **`hud.js`'s own note said a fast pulse "reads as an alarm, and an alarm is a thing you can
act on. This is a thing you cannot."** That is right about PRESENCE and wrong once it has
committed, which is the whole basis of the split. Do not merge the two modes back together.

**Honest limits, measured not assumed:**
- You cannot lose it in a straight line. With the sightline open, `awareness` stays pinned at
  1.0 and it never disengages — you outpace it and arrive at the far wall with a lead (19.6 m
  of gallery is 3.8 s of running). **Escaping requires breaking line of sight**, which the
  route trial does. That is level design working, not a bug.
- **Fleeing is an INTACT player's answer.** `_attack` takes arms first, so the first two limbs
  cost nothing but reach. The third is a leg: `gaitFor` → limp, top speed 2.29 and no sprint,
  measured at **1.08 m/s** over the first 2.5 s against a stage-2 hunter's 2.70. The same run
  that opened 7.25 m intact opens 2.63 m. Growth is a real escalation and it is an assertion.
- A one-legged player on the reach boundary makes the AI flicker PURSUE/ATTACK ~14×/s. The
  outcome is correct (it kills you) and `ATTACK_REGRIP` stops it being exploitable, but it is
  ugly if anyone ever animates off the state directly.

**Instruments (both validated by deliberately breaking them — this is not optional here):**
```bash
node harness/playtest.mjs --view game.play --script harness/scenarios/flee-survival.mjs --port 5195 --shots
node harness/playtest.mjs --view game.play --script harness/scenarios/commit-tell.mjs  --port 5195 --shots
BREAK=wall  …flee-survival.mjs    # the old staging: 3 assertions must go red
BREAK=blind …commit-tell.mjs      # stubs HunterAI._commitStep: 2 assertions must go red
```

⚠️ **Three instrument traps found writing these, all of which produce confident wrong numbers:**
1. **`page.waitForTimeout` is not a game-time wait.** `Engine._liveLoop` clamps `dt` to 0.1 s,
   so on headless ANGLE an 11 s wall-clock hold advanced the world **5.28 s** — one strike
   instead of three. The standing control would have reported the hunter taking one limb.
   `flee-survival` now waits on `window.__fs.last`.
2. **Pin `renderScale` before any A/B screenshot.** Dynamic resolution resamples the whole
   image whenever frame cost moves — e.g. when the camera turns — and that is indistinguishable
   from a real change in a mean-|Δ| diff. `e.opts.dynamicRes = false`.
3. **The noise floor is a property of the VIEW, not of the game.** Judged against the
   forward-facing floor, the away-facing punch scored 1.7× and PASSED in a build with the tell
   reverted. Each orientation now measures its own floor. And take the floor from the *worse*
   of two same-state pairs: it moved between 1.8% and 4.8% of pixels across runs.

**Also fixed: #5, the boot-splash / play-gate ghost.** `index.html`'s `#boot` is `z-index:100`
with `transition: opacity .35s`, and `main.js` only adds `.gone` when the view promise
*resolves* — ~30 s after `buildPlayOverlay()` has already put an equivalent card on screen at
`z-index:60`. Measured before: **8 frames, 283 ms, peak `#boot` opacity 0.969 over a fully
visible gate**; the composite shows "RUN ROBOT RUN" struck through "Lose them and you lose
both". Two cards that say the same thing should never both be on screen: the gate is a strict
superset, so it now kills `#boot` outright (`transition:none; display:none`) in the same
synchronous task that appends itself. **Measured after: 0 overlap frames.** The splash's
"first load builds the scene — 25–30 s" line moved onto the gate's loading card so the
expectation is not lost. (That loading card cannot be photographed — the build owns the main
thread and every `page.screenshot` timed out, which is exactly why the splash existed.)

⚠️ **`game.play` is UNJUDGED since this landed and I did not touch the board.** A builder does
not score its own work; play-critic-5 owns the verdict on whether the tell reads in play.


### 🔇 `play-critic-8` — `game.play` WEAK 68. **THE HIGHEST-LEVERAGE FACT IN THE PROJECT: THE GAME HAS NO SOUND.**
13 driven sessions, 4 seeds, all 3 locks, real WASD + pointer lock + LMB, aim self-tested to
`aimDir` dot **1.0000** before every run.

🚨 **THERE IS NO AUDIO IN THE BUILD AT ALL** — zero hits for `AudioContext`, `new Audio`,
`playSound` or `sfx` across all of `src/`. **`BREACH_NOISE` is an AI parameter and nothing else.**
So the noise model tuned over two rounds is **imperceptible to the person holding the controls**,
`escape.md` §1's load-bearing sentence is true in the simulation and invisible in play, the hunter
reads as scenery at 20 m, and the siege is a chore. **Three sounds — the gun, a wall crossing a
stage, and a hunter proximity cue — would do more than every other open item combined.**

🚨 **THE CONCEALMENT IS BROKEN BY THE TRIGGER, NOT THE EYE — 1 SECOND PER DOOR.** Standing 2.6 m off
each connector and holding fire for one second gives a **perfect three-way separation**:

| authored state | after 1.0 s of trigger |
|---|---|
| breachable | **stage 0 → 3, see-through** (wide open at 1.25 s) |
| exit (live) | stage 0, break mask **0.371** |
| chained | break mask **exactly 0.000**, first visible change **NEVER** |

And geometry halves the work before that: **all 14 exit candidates are on EXTERIOR walls, all 8
breachable panels on INTERIOR ones.** The search is ~14 taps ≈ 14 s against a 15–25 s siege — **the
search costs less than the payoff.** ⚠️ **The dressing itself is honest and could not be broken by
eye on any seed; the 300-seed statistics reproduce exactly. DO NOT re-tune `DRESS_P` believing it
will close this — the discriminator is not visual.**

⚠️ **AND JOHN'S GAMBLE CANNOT HAPPEN IN THIS BUILD, SO IT MUST NOT BE RECORDED AS JUDGED.**
*"You don't know if a door leads outside or to another room"* needs connectors that cost a lot and
lead to a room. **There are none** — `EXIT_DEFS` is used by exactly one connector per run; the other
21 are 255 hp total or `damageable:false`. **A 15–25 s siege is itself a perfect signal that you
found the exit.** *(`docs/design/dig.md` fixes this structurally: most digs bottom out at a barrier,
so an expensive dud finally exists.)*

⚠️ **`DRESS_P` is not visual mush, it is SEMANTIC mush — and in one place a physical lie.** 87.5% of
the 22 connectors wear something, so §2's wordless storytelling (*a padlock means a human did this
to you*) is spent. **And the daylight seam is drawn on INTERIOR partitions** — 4–5 of 8, including
a wall between the service passage and the west study, both interior and both dark. **The lead's
brief asked for the tells to be UNRELIABLE; this made them INCOHERENT**, and those panels open in
1.25 s, so *the game shows you daylight and delivers a study.*

⚠️ **THE LEAD'S "FIXING BEAMS INVALIDATES THE SIEGE TABLE" IS WRONG.** It invalidates **one row**,
and it need not be a `LOCKS` change at all: `exterior.update` can refuse to expose the yard until
the panel has taken damage **this run**. **One boolean; every measured number survives.** Severity
is higher than recorded — on ~1/3 of seeds `exterior.census()` reports
`{live, exposed, yardVisible, tellVisible}` **all true at t = 0 before the player moves**, which
deletes all three pillars at once: the answer is free, the BEAM reveal is pre-spent, and the 16.5 s
siege is silent.

⚠️ **"SAME SOUND" WAS THE WRONG PROBLEM** — see the audio finding. The player also cannot observe
the hunter's response: awareness peaked at **0.06**, so `hunter.threat` ≈ **0.015 — 1.5% of the HUD
channel — for an entire 26.6 s siege.** Take the cumulative-work noise proposal anyway, but justify
it as *making arrival earned* and as a tax on the 14-tap search, **not** as a leak fix.

✅ **THE BEAM REVEAL LANDS** — `blocksSight` false at **t = 17.78 s with 2976 of 3000 hp left**, dark
lath becoming slots of daylight and green yard. ⚠️ But **the player's body covers the centre third
of the aperture at the only station you can shoot from**, and **the answer is always daylight**
because nothing else can cost 15–25 s: the frame is beautiful and carries no information.

✅ **JOHN'S FREEZES ARE GONE.** Two 5-minute live sessions at `quality=medium`, 75 040 / 76 138
frames: p50 **3.8/3.7 ms**, p95 6.4/6.1, p99.9 13.1/11.6; in-play episodes **two, totalling 3.24 s
of 301 s**; RT rebuilds **51** against a pre-fix 102–306.
⚠️ **The residual is narrower than `else`: the worst genuine frames are RENDER-BOUND WITH NOTHING
ATTRIBUTED** — 507.8 ms (`rend 501.3`) and 832.3 ms (`rend 815.2`), each `dprog 0, dtex 0, dgeo 0,
dheap 0, realloc 0`, **each while a hunter BREACH was running.** Inside `pipeline.render()`. **Next
thing to chase.**
⚠️ **`perf-stall.mjs` NEARLY PRODUCED A FALSE REGRESSION:** the `--dynres 0` arm reported max
**5470.6 ms**, but all three >1 s frames sit in the **last six samples** (t = 296–306 s of a 300 s
run) with `outside` 1.4–5.5 s — **that is the tool's own end-of-session readback of 76 000 frames
blocking the main thread.** Excluding them the pinned arm is cleaner on every percentile. **Drop
samples past the deadline.** Dynres remains **NOT RESOLVED**; nothing measured supports it being a
cause.

⚠️ **THE SIEGE'S DANGER IS ENTIRELY POSITIONAL AND HAS NO MIDDLE.** `s43`: the hunter never rose
above SEARCH, closed 34.0 → 18.8 m, **dropped back to PATROL with 1338 hp left and never arrived.**
`s0`: PURSUE at **7.04 s**, GROW at 10.5, limbs 4→3→2→1→0 by **18.5 s — downed eleven seconds in,
having removed 12% of the job** — and **it found the player by SIGHT, not by breach noise.**
**The design's own loop (work → break contact → return → finish) has never been demonstrated by any
instrument.**

### 🎮 `play-critic-7` — **THE GAME CAN BE WON. `game.play` r11 → WEAK 64.** And here is why it is not a game yet.
**Four escapes, four sites, three locks, real WASD + real pointer-locked mouse-look + real LMB** —
no `weapons.fire()` calls, no teleports: **8.78 s** (study_w/plaster) · **10.73 s**
(gallery/beams) · **12.14 s** (ballroom/boarded) · **14.83 s** (chapel/boarded). Win screen fires
and reads the clock every time.

⚠️ **ITS OWN DRIVER WAS WRONG TWICE AND BOTH WRONG VERSIONS PRODUCED CONFIDENT RESULTS.**
`ThirdPersonCamera.dirAt()` is `(-sin, -cos)` and **reads like a look vector but is the BOOM
vector**; `player.aimDir` is `(+sin, +cos)`. Version two walked the house convincingly and fired
**340 bursts at a wall it was facing away from**, then reported "the exit cannot be opened by
playing". The driver now self-tests its aim (`aimDir` dot 1.000 in four directions) and **refuses
to run otherwise** — copy that pattern.

⚠️ **THE THREE FINDINGS THAT MATTER, ALL MEASURED:**
1. **THE OPERATIVE TELL IS ELIMINATION, NOT EVIDENCE.** With **four fixed sites** you find the
   exit by *counting padlocks*. *"Nobody will ever say 'I should have seen that', because there is
   nothing to see and nothing to miss."* The seam is **invisible at 17 m** (mean luma 4.02 vs
   4.01, worst per-row Δ 0.2), separable at 9 m only **by the chain and hasps**, and at 2.6 m is a
   hard-edged white ring of uniform width on all four sides — a lit rectangle, not sunlight.
   **The design specified 12–16 sites and FOUR shipped; that is the whole difference.**
2. **OPENING AN EXIT TAKES 1.3–2.5 s, AND `run.js`'s DOCSTRING IS OUT BY ~8×** — it says "about 10
   nail-gun *seconds* per stage" where the code gives ~10 *rounds* = 1.3 s at a 0.13 s cooldown.
   **The beam stage, the design's self-declared best beat, lasts 1.3 seconds.**
3. **DESTRUCTION IS SILENT — nothing in the destruction path calls `hearNoise`** (0 calls in 60 s
   of demolishing a wall). A/B with the hunter staged identically: **60 s holding the trigger →
   never left PATROL, closest 15.4 m; 60 s silent → never left PATROL, closest 15.5 m.** At 9 m it
   works (ALERT in 0.6 s), so the mechanism is fine — **it has no reach and the job ends in two
   seconds.** So escape.md §1's load-bearing claim, *"the act required to escape is the act that
   summons the thing hunting you"*, **is not true in the build.**

⚠️ **THE WORST BUG: YOU CAN BE KILLED BEHIND A SCREEN THAT SAYS YOU WON.** With a second player
registered, escaping enters WINDDOWN but the **"OUT OF THE HOUSE / AGAIN" modal still goes up,
kills pointer lock and hides the HUD.** The critic walked 17 m into the yard with the bomb at
85.9 s and **had its right arm torn off at 2.6 m, entirely behind a victory modal.** And
`RunState.escape()` emits `_onEscape` **before** `_setPhase(WINDDOWN)`, so `buildEscapeWatch`'s
stranded line — *"N still inside. You started the clock."*, the best line in the design — **can
never print.**

**Two old hates killed:** *"black void behind you in the yard"* is **REFUTED as stated** (looking
back gives lawn, terrace, three pilasters, the breached doorway glowing and the hunter silhouetted
in it — a good image); the real fault is that **the facade above the terrace is black with no
sky**, so one frame holds daylight on the lawn and midnight on the house. And the
**gadgets-in-world hate is STALE and false** — all four spawn at named anchors, photographed twice.
**CONFIRMED and quantified:** the player's body covers **45.7% of the opening's screen area at
2.6 m, 49.0% at 4.2 m, and 52.6% at 6.0 m — it gets WORSE with distance.**

**🎯 THE HIGHEST-LEVERAGE THING ON THE WHOLE BOARD, and it is a number change, not a system:**
**make opening an exit a siege and make destruction audible** — one line calling
`hunter.hearNoise(point, 1)` on every stage transition, plus ~5–8× on the live exit's stage
healths so opening runs **15–30 s instead of 2**.


---

## 🔨 `critic-slice-3` — the whole playable slice, re-judged 2026-08-09 (`game.play` PASS 76 → PASS 71)

**First verdict since the estate port, the all-room dig, the exit-site fix, the audio rebuild, the
boot fix, `calls-1` and round 11's deep band.** Judged against John's own sentence — *"the digging
the chunks the satisfying sledging and the estate slice… looking like my art when we smack it with
the sledgehammer"* — and against `refs/_sheets/dig.png`, not against the previous score.

**A lower number on a better build.** Almost everything that landed this campaign is real and
visible: the six rooms are rooms, the crater's white-rim-over-cyan genuinely resembles
`dig-ballroom-breach-early.webp`, the swing is a two-handed sledgehammer swing, the chunks persist
on the floor. The score drops because the campaign's headline question was asked properly for the
first time — *in the gallery, with the shipped camera, at the shipped cadence* — and the answer is
that **fifty-eight blows produce no change a player can see.**

### 🚨 THE FINDING: SIXTY BLOWS IN THE GALLERY, AND THE WALL LOOKS UNTOUCHED

`progress/critic3-gallery-dig.png` — one boot, `seed=s4`, panel `f.gal_svc.0.b`, 1.7 m standoff,
one real LMB per second through the live input path. `maxDepth` reads **1.00 from blow 9**. Tile 1
(pristine) and tile 7 (blow 58) are, to the eye, the same picture. The only difference in the frame
is six pale chips on the floor.

**The crater is there.** `progress/critic3-zoom-gal58.png` at 2x shows a ragged white torn edge
curling around the robot's left shoulder and down past its hip. It does not reach the player's eye,
for three reasons that stack, all visible in that one crop:

1. **The boom points at the player, so the player is on top of the work.** This appendix already
   measured it — *"the player's body covers 45.7% of the opening's screen area at 2.6 m, 49.0% at
   4.2 m, 52.6% at 6.0 m — it gets WORSE with distance."* That number was filed against an exit
   site. **The dig is a sixty-second stationary activity aimed at the crosshair, so it pays that
   cost on every single blow of every single dig.** It is now the most expensive unfixed thing in
   the game.
2. **In the gallery there is no value contrast for "white underneath" to land against.** The
   service passage's coat is a warm mid-beige and the white shell reads instantly
   (`progress/critic3-dig-ladder.png`, blows 8-26). The gallery's coat is pale cream. White shell,
   cream wall, **and a white robot in front of it** — three whites stacked.
3. **No cyan reaches the frame at all**, at `maxDepth` 1.00, because the cyan is directly behind
   the robot.

⚠️ **Do NOT write a brief that says "the gallery dig is missing".** It is not missing; it is
photographed. The instruction is *the crater does not reach the screen in the gallery — find out
which of the three causes above dominates, then fix that one.*

### The ranked list, each with a capture

1. **The floor stays clean.** Every one of John's eight images has drifts of white slabs —
   `dig-gallery-sledge-crew.webp` is knee-deep in them across a third of the frame. The game
   produces **six to ten chips the size of a hand**, in a thin line at the skirting, and they
   are the last thing you notice. `progress/critic3-vs-art.png`. This is the loudest single
   difference between this build and the art, and it is already queue item 2.
2. **The crater does not reach the screen in the gallery** — above.
3. **The breach is a mousehole.** Art: 3-4 m across, taller than a robot, with secondary cracked
   bays beside it. Game: ~1 m across, chest-high, one neat opening, nothing damaged around it.
   `progress/critic3-vs-art.png` tiles 1 vs 2.
4. **The break edge is an ink outline, not a section.** `progress/critic3-zoom-breach.png` (2x,
   service passage, blow 16): the white shell is a constant-width ribbon with a hard dark line on
   **both** sides of it, so it reads as a decal laid on the wall. The ragged silhouette is
   genuinely good; there is still no thickness at the cut. **John's Checkpoint A words —
   *"a 2d mesh taking off layers"* — still describe the zoomed crater.** The cyan behind it is a
   flat card with a hard straight aliased edge and a right-angle notch, and about a third of the
   aperture between rim and card is pure black; in the art there is no black anywhere in a breach.
5. **House-wide: the boarding over doors and windows renders as flat black cut-outs.** X-braced
   planks and shutter panels appear as pure black silhouettes with no material in **six of eight**
   room captures — `progress/critic3-rooms.png`, tiles 1, 2, 3, 5, 6, 8. Several gallery painting
   canvases do the same at a grazing angle.
6. **The service passage is a zebra.** Hard black joist shadows stripe both walls, the floor and
   the ceiling, and while they are on you cannot read the wall's damage state at all
   (`progress/critic3-rooms.png` tile 7). ⚠️ **It is NOT the black point** — proven, one page, three
   arms: the stripes are identical at SHIPPED, LIFTED and OPEN (`progress/critic3-blackpoint.png`
   tiles 1-3). It is a fill-light problem, not a grade problem.
7. **You lose the hammer mid-dig and the game whispers it.** In the service-passage run the hunter
   took an arm at ~blow 26; the two-handed gate dropped the sledge and the next thirty swings were
   punches. **The only tell is a bottom-left label changing SLEDGEHAMMER to FIST**, under a red
   screen wash. `progress/playtest/game.play.c3-blow26.png` against `…c3-blow16.png`.
8. **The chapel is a brown box.** No altar, no arch, no glass, nothing that says chapel
   (`progress/critic3-rooms.png` tile 8). `study_e` is close behind: one huge flat low-contrast
   damask wall and a pale speckled floor that does not read as a study.
9. **A red lens-flare arc is smeared across the gallery portrait** nearest the candelabra
   (`progress/critic3-zoom-gal58.png`) and reads as a render artefact laid over the art.

### Three best moments
- **Blow 8 in the service passage** — the coat tears, the white shell opens, and a saturated teal
  plane is suddenly *behind the wall*. Hue, rim and silhouette are right, and it is the first frame
  in this project that could be cropped next to `dig-ballroom-breach-early.webp`.
  `progress/critic3-dig-ladder.png` tile 2.
- **The contact window at 1x.** `progress/strobe/c3-impact/_sheets/sledge.impact.png` (`--mode
  impact`, `--prehits 3`, anchor `service.mid`, panel `f.svc_e.1.b`, standoff 1.76 m, **no DEGRADED
  ANCHOR banner**): p0.40 to p0.60 is a real two-handed kinetic chain — hips, then a long arc, then
  the arms as the last link — and the dust plume and chunk burst arrive within 19 ms of contact and
  are still settling 400 ms later. `critic-swing-2`'s choreography verdict holds, and the wall
  answers on the same frame. This is John's *"use these movement tests on the chunks and sledge as
  a whole together"*, and the answer is that they DO work together.
- **The first frame of the game.** `study_w.north`: panelling, a lit fire in a carved overmantel, a
  gilt doorway with light beyond, and the sledgehammer lying on the floor with *[E] TAKE
  SLEDGEHAMMER* under it. `progress/critic3-rooms.png` tile 1.

### The worst moment in a run
**Blow 30 of a gallery dig.** You have been swinging for half a minute at a wall that has not
changed, at the back of your own robot, in a room where you cannot see the white or the cyan, and
the sound cannot tell you either because at `depth` 1.00 with barrier behind, every blow is the
same dead clank. There is no information anywhere on the screen that says whether this is the
doorway or a dud. **That is the exact opposite of the search John described.**

### For John, gathered not answered

- **The black point.** `progress/critic3-blackpoint.png` — SHIPPED / LIFTED / OPEN, one page, no
  reload, two stations. 🎯 **The argument is not about the still, it is about the hunter:** in the
  service passage at SHIPPED the hunter standing ~8 m down the corridor is a dark smudge; at LIFTED
  and OPEN it is plainly a white robot (tiles 1 against 2/3). **My opinion, marked as opinion:
  LIFTED survives motion.** It opens the gallery's paintings and the corridor's threats without the
  milky mid-tones OPEN starts to bring. ⚠️ And it will not fix the service passage stripes — see 6.
- **The audio.** Not heard. `refs/audio/LISTEN.html`. One factual correction to carry: I checked the
  resolution and **the refusal clank is correctly gated** — `playMeleeImpact` computes
  `barrier ? smoothstep(0.97, 1.0, depth) : 0`, so `barrier: true` returned at depth 0.30 (visible
  in the strobe log) does **not** play the clank. The state machine is right; only the ear is open.

### Two questions the queue asked, answered
- **(a) Is the surviving white plate a THICKNESS cue or a second ring?** At 1x it reads as a
  thickness cue and the shell narrows convincingly as the hole grows. At 2x it is a **second ring**,
  because a hard dark contour line runs along its outer edge as well as its inner one. Round 11 was
  worth it; the outer line is what stops it landing.
- **(b) Is 88% fill worth 58 points of dead blows?** Yes, easily, and the trade is invisible next to
  the real problem — in the gallery **0%** of the cyan reaches the frame at full depth.

### The instruments, so the next round can re-run them
`harness/scenarios/_c3-dig.mjs` (service passage, real cadence, FX left alone),
`harness/scenarios/_c3-all.mjs` (six rooms + black point + a gallery dig in one boot),
`harness/strobe.mjs --motion sledge --mode impact --n 14 --prehits 3`.
⚠️ **Nothing here is a diff** — `jitter-1`'s gallery capture-determinism bug was live throughout, so
every claim above is from a single capture, looked at.

### Trailer line
> *Tear the house down until you find the door.*

### ⚠️ Correction to defect 5 before anyone briefs it: TWO THINGS WEAR THE "BLACK CUT-OUT" LOOK

The three black-point arms separate them, in one page (`progress/critic3-blackpoint.png`):

- **The service passage slabs and stripes do NOT lift** at LIFTED or OPEN (tiles 1-3). Those are
  shadow and unlit material, and a grade change will not touch them.
- **The gallery left wall's blacks DO lift** (tiles 4 vs 6) — its paintings and brickwork become
  readable. Those are the grade clamp this file already documents.

So do not write one brief for both. The room captures in `progress/critic3-rooms.png` were all taken
on the SHIPPED arm and cannot tell you which kind any given black rectangle is; the arms sheet can.


---

# 🎧 APPENDED 2026-08-10 (`diet-2`) — the audio pass, moved verbatim out of `HANDOFF.md`'s core

`audio-listen-1`, 2026-08-09. `HANDOFF.md` keeps the one line and the open question (clip `08`
still needs an ear). Where this block says "this file" it meant `HANDOFF.md`.

**🎧 The audio is finally listenable, and it was hiding four real bugs.** Until 2026-08-09 nobody
had ever heard the sledgehammer: `audio-3` gated it on offline spectra, the harness runs muted, and
John last listened before the hammer was equippable. **`harness/audio-render.mjs` renders the
shipped `audio.js` to WAV** (serves the module's bytes to a blank Chromium page and drives the real
exports through `OfflineAudioContext` — no `game.play` boot, so no 168 s wait and no HMR
contamination), and **`refs/audio/LISTEN.html` is 12 labelled clips John double-clicks.**
What the ladder actually was: **the indestructible barrier was the LOUDEST, punchiest hit in the
game** — 18 dB over a fresh wall, so the reward signal was inverted; **`d=0.00` was inaudible**
(RMS −51 dB) and `wall.js`'s no-field arm hard-codes `depthAt: 0`, making that every blow on every
ordinary wall in the house; the hunter **clipped 3,850 samples** at 21 dB over the melee bus; and
consecutive gun shots differed by less than the JND.
⚠️ **STILL UNHEARD BY A HUMAN.** Every figure above is waveform forensics. **Clip `08` needs an
ear** — a real 63-blow dig, good timbre spread (7.57 dB blow to blow) but only ~200 Hz of centroid
drift over 60 s, so it may read as varied-but-not-going-anywhere.
