# The dig, judged — and five other things it could be

**`critic-dig-8`, 2026-08-10.** Against John's verdict on the finished Phase 1. Two halves:
**A** a ranked judgement of the five things he named, **B** five genuinely different directions
the mechanic could take, with the one I would take.

🚨 **WHAT I COULD NOT DO: I did not play it.** Every claim below is off shipped source, the
shipped `DebrisSystem` driven headless, or a stored frame I looked at. **Feel is John's** and
where I am reasoning about feel from arithmetic I say so. I built no code and changed nothing.

⚠️ **TWO NUMBERS IN THE BRIEF AND IN HANDOFF ARE WRONG. Both corrected below** (§0).

---

## §0 — Corrections to the record, first, because two of them are load-bearing

1. **`game.play` is PASS 71, not 76.** `node harness/status.mjs list` reads
   `game.play ██████████████ 71% r11 PASS 8 open`. **HANDOFF line 41 says "PASS 76 (r10)"** and
   is stale by a round. The brief's 71 is right; the file every new session reads first is not.

2. 🚨 **"A collapsing storey pays out 20–30 plates" IS ABOUT 2× TOO HIGH.** The canonical chained
   region — 2.40 × 2.20 m, 4.30 m², the one `views/game.js`'s own comment cites — pays out
   **14 plates**, measured by re-running that block's exact arithmetic. `MAX_PLATES` is 30 and
   `nx*ny` is 16, but `budget = round(area / (SLAB_MAX² × 0.80)) = round(4.30 / 0.3075) = 14`
   binds first. **You need ≥ 9.2 m² of collapsed area before 30 is reachable at all.** This does
   not change the verdict — 14 identical plates in a 4×4 lattice is *more* sheet-like, not less —
   but the number in the queue item is not the number in the build.

3. **A "course shed" pays out exactly ONE plate.** 1.45 × 0.19 m, 0.26 m² → `nBig` = 1. This
   matters for §A2: the whole menu of collapse sizes is *one plate* or *the storey*.

---

# A. THE VERDICT — ranked by damage

## A1 — 🥇 "Too uniform… I want it bit by bit." THE ARCH IS A BINARY, BY CONSTRUCTION, AND THE GAME GIVES THE BIT-BY-BIT TEXTURE TO THE PLAYER WHO IS PLAYING BADLY

**This is the most damaging of the five and it is the hardest to fix, so it goes first.**

The rule has two clauses and nothing between them (`src/destruction/support.js`, its own header):
under `fail` the arch holds and **only the one course over a run wider than `span` sheds**; at
`fail` **the whole connected region comes down in one event**. Measured menu of event sizes:

| event | area | plates paid out |
|---|---|---|
| lonely-rule chip | < 0.022 m² | **0** (crumb spray only) |
| one course shed | 0.26 m² | **1** |
| a single arch failure | 1.60 m² | 5 |
| the chained storey | 4.30 m² | **14** |

There is no 1 m² event and there is no way to make one. The load ladder for the rewarded play is
in `COLLAPSE.fail`'s own doc table: **2.34 · 3.18 · 4.38 m² against a 3.40 threshold — it fires
on blow 3.** So the sequence a good player experiences is: *nothing, nothing, everything.*

🚨 **AND THE PROJECT ALREADY MEASURED THE PUNCHLINE WITHOUT READING IT AS ONE.** `debris-collapse`
C5, quoted in HANDOFF: the aimed undercut gets **"9 events totalling 450 cells, biggest 408"**,
random scatter gets **"18 small course-sheds totalling 155 cells, biggest 18"**.

**408 of 450 cells — 91% of everything a skilled dig brings down arrives in a single event.**
And the eighteen-small-pieces texture John is asking for is *exactly what the game currently gives
the player who cannot aim.* Skill is rewarded with a binary; incompetence is rewarded with
granularity. That inversion is the finding.

⚠️ **This is not a tuning problem and lowering `fail` makes it worse** — a lower threshold fires
the same all-or-nothing event sooner. What is missing is a *middle-sized event that a region can
have more than once*, i.e. a rule that lets a region shed part of itself and keep standing.

## A2 — 🥈 "Falling at once, in the same direction, statically like a sheet." MEASURED. HE IS ARITHMETICALLY RIGHT, AND THE FALL — NOT THE DEBRIS — IS THE DEFECT

Driven headless on the shipped `DebrisSystem` at a fixed 60 Hz, reproducing `onChunk`'s collapse
tiling exactly. The metric is **relative** scatter: subtract the group's own centroid motion and
ask how far the plates move with respect to *each other*.

**Chained storey, 14 plates, each 0.56 × 0.52 m:**

| t | centroid has fallen | RMS relative scatter | scatter ÷ plate width | landed |
|---|---|---|---|---|
| 0.20 s | 0.257 m | **0.034 m** | **0.06** | 0/14 |
| 0.40 s | 0.774 m | **0.147 m** | **0.26** | 4/14 |
| 0.60 s | 1.282 m | 0.533 m | 0.94 | 8/14 |
| 0.80 s | 1.357 m | 0.634 m | 1.12 | **14/14, all at rest** |

🎯 **For the whole airborne phase the group translates 5–8× further than it deforms.** A rigid
sheet scores ∞ on that ratio; a real shatter scores ~1. At 0.40 s the formation has dropped a
plate-and-a-half and scattered by a quarter of a plate. **The dispersion in the table arrives at
0.55 s and it is produced by the LANDING, not by the fall.**

**All 14 pieces land inside 0.35 s. The entire event — the biggest thing that happens in this
game — is over in 0.80 seconds.** A single arch failure is over in 0.60 s with a 0.13 s landing
spread. That is John's *"one moment"*, in seconds.

**The cause is four lines of `debris.js` `chunk()` and it is not taste:** every plate in one
collapse gets the same `cw`/`ch` (computed once), therefore the same size-derived `slow` spin
scale; `vy = -(0.10 + r*0.45)`, `out = 0.30 + r*0.55` — **always outward, never inward, never
upward** — and the same gravity, all on the same frame. The only per-plate variation is under
half a metre per second on a flight that lasts two thirds of a second.

🚨 **AND THE SECOND HALF IS WORSE THAN THE FIRST: THE COLLAPSE OCCLUDES ITS OWN REVEAL.** The
plates are spawned *flush against the face*, tiling the exact aperture they created, and then move
**toward the camera**. Compare the two stored frames:
`game.play.collapse1-undermined-FALLING.png` — the breach is a mosaic, the cyan is visible only in
the gaps — against `…-LANDED.png`, where the cyan is a clean full-height field. **For the entire
0.8 s of the payoff the player cannot see what they just achieved,** and
`docs/design/teardown-reference.md` names "breaking fully through shows daylight and the space
beyond" as *"plainly the payoff moment in the footage."*

✅ **THE LANDING IS RIGHT AND SHOULD NOT BE TOUCHED.** `…LANDED.png` is a genuine drift of angular
slabs lying at every angle and leaning on each other — it is the reference frame, achieved.
`collapse-2`'s 6.2 m/s arrival and the heavy stop are working. **Do not fix the debris. Fix the
0.8 seconds between letting go and resting.**

## A3 — 🥉 "Almost too easy — 3–4 hits if done well." IT IS NOT THE ×8 BASE, IT IS THAT THE ONLY DECISION IN THE MECHANIC RESOLVES IN THREE INPUTS AND COSTS NOTHING

⚠️ **Do not revert ×8, and do not read his sentence as being about ×8.** His words are *"to take
out a single section"* and *"if done well"* — that is the arch chaining, not the channel. The
numbers separate cleanly:

- **channel through one face: 7 blows** with the collapse rule live, 11 with it ablated (HANDOFF,
  both trees). That is Teardown's 1–3 order of magnitude and it is the number John himself asked
  for.
- **the storey: 3 blows.** `COLLAPSE.fail`'s table, shipped grid: 2.34 → 3.18 → 4.38.

So the fastest route through a wall is not the 7-blow channel; it is a **3-blow undercut that
delivers far more than a channel.** `collapse-2` landed the same day he played and it is what
turned "a wall" into "3–4 hits", not `pace-1`.

🎯 **BUT THE REAL ANSWER TO "WHAT IS TOO EASY" IS NEITHER NUMBER.** Work out what a player is
actually deciding. There is **one verb** (swing), **one input** (where), **one resource** (blows),
and **no cost term anywhere in the system**: blows are free and infinite, the cooldown is the only
clock, the wall cannot hurt you, the pile is explicitly not a collider, and the hunter is
deferred. A decision with no price is not a decision — it is a formality. **Three blows feels
cheap because it *is* free, and it would feel cheap at twelve.**

⚠️ **The corollary matters for whoever takes the next slice: adding blows is the one change
guaranteed not to work.** It converts a formality into a longer formality, and it re-breaks the
minute `dig-band` gates in six rooms.

## A4 — "Standing closer or further away to hit lower or higher." THE MECHANIC'S OPTIMUM SITS AT THE CORNER OF THE CONTROL ENVELOPE WHERE THE CAMERA IS WORST

The arithmetic, off shipped constants (`player.js` `_swingRay`, `rules.js`, `player.js`
`ThirdPersonCamera`):

- swing ray is `aimDir` with **`y -= 0.18`, then normalized** — a fixed ~10.2° down bias, applied
  *after* the player's own pitch;
- origin is `eye − 0.2·dir`, cast **1.55 m** (`WEAPON_RANGE.sledge`), eye ≈ 1.54 m;
- so **impact height is a function of TWO coupled inputs — standoff and pitch — that both write to
  one output.** That coupling *is* John's "odd feeling"; it is not a framing problem.

Worked: at level aim the maximum standoff is 1.33 m and the impact centre lands at **~1.30 m**
(recorded lowest ring edge 0.898 m). **Standing closer raises the blow** (at 0.5 m the centre is
1.45 m). To get the centre below ~1.30 m you cannot use distance at all — you must spend pitch.

🚨 **AND THE PITCH CLAMP IS ASYMMETRIC IN THE WRONG DIRECTION FOR THIS GAME.**
`ThirdPersonCamera.look` clamps to **`[-0.95, 0.62]`** — 54.4° up, **35.5° down.** At full down
pitch the impact centre reaches y 0.62 m at a 0.99 m standoff, i.e. **reaching the skirting spends
the entire down half of the clamp.** And that is precisely where `MAX_LIFT` (0.30 rad) swings the
boom up and over the player, putting the robot's own body across the impact point — the recorded
45.7–52.6% occlusion, and visible in `game.play.aimmark-shell-ON.png`, where the body and the dust
cover essentially the whole breach.

🎯 **So the loop is: `support.js` pays you to cut at the floor → the floor is the one place the
control scheme makes expensive → and arriving there is what makes the camera unreadable.** The
0.18 tilt is the smallest term in that and I would not touch it first. **The fix is to decouple
impact height from standoff** — see §B6.

## A5 — "Powerful, risky and necessary." TWO OF THREE, AND THE MISSING ONE IS NOT A TUNING GAP

- **NECESSARY — TRUE, and it is the best-evidenced thing on this list.** All six spaces dig, all
  six hold John's minute, `dig-band` B1 green, `dig-free` 15/15. Nothing to do here.
- **POWERFUL — PARTLY TRUE, and what spends it is §A2.** The landed heap is powerful. The 6.2 m/s
  arrival and the dead stop are powerful. What is not powerful is the 0.8 s in between, during
  which a rigid mosaic hides the hole it just made. **Most of the available power is already built
  and is being thrown away in under a second.**
- **RISKY — FALSE, and say it plainly: this is not something a number can fix.** There is no
  resource to spend, no threat to be interrupted by, no way for the wall to hurt you, no cost to
  noise, and no consequence to bringing down more than you needed. **Risk is a missing axis, not a
  low setting.**

🚨 **WHAT IS LOAD-BEARING ON A HUNTER THAT DOES NOT EXIST — stated so nobody plans around a ghost:**
**"risky" entirely, and a large share of "powerful"**, because power is only ever felt against a
price. **"Too easy" is roughly half hunter** — a cost term would do most of what more blows cannot.
⚠️ **But "too uniform", "like a sheet" and the targeting are NOT hunter-blocked at all.** Three of
the five can be closed now, and §A1/§A2 are the two biggest. **Do not wait.**

---

# B. TWO OPEN LOOK CALLS, RULED

## B-i — Is the crazing a crack or a smudge? **A CRACK. But it is warning you about a decision you do not have.**

**Looked at, at 3×, both the filed pair (`game.play.collapse2-craze-3x-{ON,OFF}.png`) and a fresh
3× crop of the upper face in `…collapse1-undermined-BEFORE.png`.**

✅ **It is unambiguously a line network, not a darkening.** Thin dark strokes with visible L- and
T-junctions and one long continuous diagonal run, over a wall whose base tone is unchanged. It
passes the test its own shader header sets — *"the wall went grey"* — and it passes it at 1:1 in
the BEFORE frame, not only at 3×. **The builder's 73.7-worst-pixel / 313-cell measurement is
describing something that really is on screen. Keep it.**

**Two real defects, both worth a cheap round:**

1. ⚠️ **It reads as SCRIBING, not as plaster.** The strokes are overwhelmingly axis-aligned short
   dashes, because `_craze` is `fwidth(_bgPlate)` on an axis-aligned plate lattice
   (`breakmask.js` ~l.996). Real crazing is curvilinear, branches at acute angles, and runs to
   free edges. At 3× it reads closer to an etched circuit board than to a wall about to fall. It
   inherits its rectilinearity from exactly the same lattice that makes §A2's plates a grid —
   **one root cause, two symptoms.**
2. 🚨 **THE REGION'S BOUNDARY IS NOT DRAWN, AND THAT IS THE ONE PIECE OF INFORMATION A PLAYER
   NEEDS.** `strain()` paints each region **uniformly** at its own load fraction — its header says
   so on purpose. So *where the piece that will fall ends* exists only as "where the crazing
   stops", at whatever contrast that fraction happens to give. The player is shown a texture, not
   a silhouette. 🎯 **Draw the region's edge harder than its interior** — the label array is
   already computed, so the boundary is free — and the tell stops being decoration.

🚨 **AND THE HONEST STRUCTURAL PROBLEM IS THE WINDOW, NOT THE LOOK.** `nearFrac` 0.45 puts the
foot at 1.53 m². Blow 1 hangs 2.34 → **0.44 strength.** Blow 2 hangs 3.18 → **0.88.** Blow 3 the
wall is gone. **The tell's entire life is two blows, ~1.9 s** — and there is nothing a player can
*do* with it, because nothing bad happens when the wall falls and the only response to "it is
about to go" is the swing you were going to throw anyway. **It is not a warning; it is a promise.**
That is fine, and it is arguably better, but then it is being drawn wrong: it is currently a
*multiply on albedo* — it makes the wall look dirtier as the payoff approaches. An anticipation
cue should build, not soil. §B1 and §B5 both give it a job.

## B-ii — Does the aim mark read on white? **NO. It is present and it is non-functional — and contrast is not the main reason.**

**A/B'd `game.play.aimmark-shell-{ON,OFF}.png` at 3× on the same crop.** The ring is genuinely
there: a soft pale arc sweeping around the robot, and with both frames side by side I can point at
it. **Shown the ON frame alone I would have called it a lighting gradient.** That is the exact
failure mode a targeting affordance may not have, and it corroborates the measurement rather than
softening it — **0.191% of frame at 29.2 luma against the coat's 0.36% at 57.4.**

**Why the sandwich fails here specifically:** on a bright surface the bright core contributes
nothing, so the whole read falls to the ink — and the ink is a *soft* grey with no hard edge. On
the coat the same ink has a dark surround to bite against; on the white shell it has none.
**Widening the casing again (10 → 16 mm already happened) buys area, not contrast, and area is not
the deficit.** What is missing is a **hard, thin, dark outer contour** on the bright-surface arm —
ink only, one to two pixels, no core.

🚨 **BUT THE FRAME SHOWS A BIGGER PROBLEM THAN CONTRAST AND IT WOULD SURVIVE A PERFECT MARK: THE
MARK'S CENTRE IS BEHIND THE PLAYER'S OWN ROBOT.** In `aimmark-shell-ON.png` the body sits dead in
the middle of the ring, and the dust plume covers most of what is left. **An affordance whose
centre is occluded by the character is not fixed by making its rim brighter.** Either the ring
needs to survive occlusion, or the camera needs to stop putting the body there during `workHot`.
The second is the honest fix and it is `ThirdPersonCamera`'s shoulder offset, which HANDOFF
already records as *"the thing that made it unreadable"*. ⚠️ Risk on the first: anything drawn
through the body is screen-space UI in all but name, and John has twice refused UI on this
mechanic.

---

# C. FIVE GENUINELY DIFFERENT DIRECTIONS

🚨 **I HAVE BUILT NONE OF THESE AND THE BRIEF FORBIDS IT.** Each is described so a slice could be
written against it, with what it costs and what it might break.

**The frame I am designing against, from §A3:** the dig has **one verb, one decision, one
resource, and no cost.** Every one of John's five complaints is a symptom of that. So each
direction below is judged on the same question: **does it add a second axis, or is it a slider?**

---

## C1 — THE WALL FIGHTS BACK: the collapse becomes a hazard and the rubble becomes real

**The idea.** Undermining a storey drops it *on you*. A collapsing region staggers or damages a
player standing under it, and the settled slabs become a small number of **real colliders** — a
mound you must climb (`STEP_H.robot` 0.55 already exists), walk round, or clear. Cutting low and
wide stops being a free optimum and becomes a bet: the bigger the thing you bring down, the bigger
the thing that lands between you and the hole you just made.

**What it fixes.** *Risky* — directly, and without the hunter. *Too easy* — a price appears where
there is currently none. It also gives the crazing a real job overnight: it becomes *get clear*.

**What it costs.** A damage/stagger path from `DebrisSystem` to `Player`; and — the expensive half
— a handful of collider boxes derived from settled slabs. 🚨 **`debris.js`'s pile is a height field
whose own header says "NOTHING OUTSIDE THIS FILE MAY EVER READ IT", and `room.collide` /
`pathPortals` / the sight tests all derive from `damagefield.js`.** That wall was built on purpose.

**Risk, stated.** **Softlock.** You can bury the passage you just dug, and the whole architecture
was arranged to make that impossible. Any slice must ship the guard with the feature — e.g. rubble
colliders capped at `STEP_H` so they are always steppable, which keeps the promise while still
costing you the moment.

---

## C2 — TWO WAYS TO TAKE A WALL APART: the swing and the pry

**The idea.** Split the single verb. **LMB** stays the sledge: fast, loud, imprecise, makes the
hole, triggers collapses. **Hold E on crazed material** and the robot *levers a hanging plate off
by hand* — slow, quiet, one plate at a time, removes exactly one connected hanging region's worth
of cells at the point you choose, and **never triggers the arch**. Bit-by-bit stops being
something the simulation owes the player and becomes **something the player does.**

**What it fixes.** *Bit by bit* — literally, and under player control rather than under a
threshold. *Too easy* — there is now a second strategy with a different cost curve. It gives the
crazing a mechanical meaning (**crazed = pryable**), which is the cheapest way to make the tell
matter. And it pre-builds the hunter's whole design space — loud-and-fast versus quiet-and-slow —
before the hunter exists, so the hunter arrives into a mechanic that already has a shape for it.

**What it costs.** A hold-interaction on `player.js`; a "remove one hanging region at point"
entry on `DamageField` (the region labelling in `support.js` `arch()` already computes exactly
this set — it is the `lab` array); one animation; one `debris.chunk` call per pry.

**Risk.** Two ways to do one thing where one is strictly better. The pry must be genuinely worse
per m² and genuinely better on some other axis — and until the hunter exists, *that axis does not
exist yet*, so a slice built now can only be judged on feel. ⚠️ Also: prying is a button-hold
during which nothing is at stake, which is the definition of a chore. It needs the plate to come
away with weight.

---

## C3 — THE FRAME SURVIVES THE CLADDING: the wall has parts, and they are not all the same

**The idea.** Today every cell of a face is identical, so *where* you swing matters only through
the arch's area arithmetic — which is why targeting feels arbitrary. Give the face the structure
the shader stack already implies: **studs/piers at intervals, a lintel over openings, a plinth
course at the floor.** Cladding comes off fast — a bay a hit, Teardown's own number. **The frame
does not**: a pier takes several dedicated blows and, while it stands, it *carries* — it is a
support in `arch()`'s sense, so hanging regions terminate at piers instead of merging. Cut a pier
and the bay either side comes down.

**What it fixes.** This is the only direction that touches four of the five. *Too easy* — the
frame resists after the cladding does not. *Too uniform* — three materials failing at three rates
and three sizes, so the payout is heterogeneous by construction rather than by jitter. *Bit by
bit* — cladding sheds bay by bay while the skeleton stands, which is a middle-sized repeatable
event, the exact thing §A1 says the rule cannot currently produce. *Targeting* — aiming becomes
"hit that pier", a named object at a place, instead of "be at the right height", which is the
coupled-control problem restated as a solvable one.

🎯 **AND IT IS THE DIRECTION THIS PROJECT'S OWN REFERENCE ENDORSES IN CAPITALS.**
`teardown-reference.md`: *"THE FRAME SURVIVES THE CLADDING… the studs remain standing as a
skeleton. That is an exceptionally strong read for surface vs structure — and it is exactly this
game's coat → white → cyan stack, which means the stack is right and only its legibility is
wrong."*

**What it costs.** A per-cell structure/health multiplier on the damage field (a static mask per
face, authored from the span length so it costs no authored data per wall), a `support.js` change
so piers anchor, and geometry for the surviving skeleton. **Real work — the largest of the five —
but it adds no new pool, no new material key, and it lands inside a shader stack built for it.**

🚨 **RISK, AND IT IS THE ONE THAT KILLED `?dig=bays`.** *"With a handful of fixed candidates you
find the way through by counting padlocks."* Nine visible piers is nine candidates, and John
rejected exactly this once already. **The frame must be a continuous thing the eye reads, not an
enumeration** — irregular pitch, no framing of the interconnect, and the structure must be
uncorrelated with the answer, verifiable by the same seed-sweep `_tmp_dig_dress_correlation.mjs`
already runs. **A slice that cannot demonstrate that correlation is zero should not ship.**

---

## C4 — THE BLOW IS A COMMITMENT: hold to wind, release to strike

**The idea.** Replace the 0.95 s auto-repeat with **hold-to-wind, release-to-strike.** Longer hold
= more power = a bigger brush and a deeper deposit. Crucially, **the wind-up plants your feet and
hands the aim to the mark**: while winding, the impact point slides along the wall with your look
direction across the wall's *full height*, independent of your standoff. Release and the robot
steps into it.

**What it fixes.** *Targeting* — this is the cleanest solution to §A4, because it removes the
standoff term from the impact height entirely, and it does so diegetically rather than by
retuning a clamp. *Too easy* — fewer, heavier, chosen blows; three deliberate acts read very
differently from three ticks of a held button. And it gives the future hunter something precise to
interrupt.

**What it costs.** Input model in `player.js`, and a retime of `sledge.js`'s swing.

🚨 **RISK, AND IT IS THE HIGHEST OF THE FIVE.** The swing choreography is a **passed** piece
(`critic-swing-2`) and `sledge-check` **13/13** gates it; `WEAPON_COOLDOWN.sledge` is the clock
`dig-band` measures John's minute against in six rooms, so every recorded blow-count and every
second in this project moves. **This is the one direction that invalidates the instruments.** I
would not take it as a first move — but the *aim-decoupling* half of it can be taken on its own,
and should be (§C6).

---

## C5 — THE WALL GROANS BEFORE IT GOES: undercut → hangs → committed pull

**The idea.** Make bringing down a storey **three beats instead of one.** Beat 1: cut the base —
what you do now. Beat 2: the region does not fall. It **sags** — leans out a few degrees, dust
runs from the crack, the plate lattice visibly opens — and it *stays there*, a state you can walk
away from, stand under, and look at. Beat 3: you commit — one more blow, a shove, a grapple pull
from across the room — and it goes.

**What it fixes.** *"One moment"* — the anticipation phase goes from §B-i's 1.9 s to as long as
the player leaves it. *Too easy* — three blows becomes three *acts*, and the last one has a
position requirement, so it is the first place in the mechanic where *where you are standing* is a
real decision. *Bit by bit* — a face can hold several sagging regions at once, which is a middle
state the binary currently forbids. It gives the crazing its job (crazing → sag → gone is a
three-stage tell a player can actually learn), and it composes with C1 perfectly: beat 3 is where
the hazard lives.

**What it costs.** A persistent `hanging` state per region across blows in `support.js` (the
`lab`/`load` arrays already exist), a vertex offset in `breakmask.js` driven by **the A channel
that is already written and already read**, and a trigger. **Cheapest of the five relative to what
it buys**, and no new pool, no new mesh, no new draw call.

⚠️ **Risk.** A wall that is leaning-but-standing is a **passability question**: does it block? does
`pathPortals` know? does the collider follow the lean? Pick one answer and gate it — *"sagging
material is still solid until it falls"* is the safe one, and it makes beat 3 necessary rather
than optional, which is the point. ⚠️ Second risk: a player who walks away from a sagging wall and
comes back has a wall that has been about to fall for ten minutes. It needs a decay or it becomes
scenery.

---

## C6 — THE ONE THING THAT IS NOT A DIRECTION: fix the targeting separately, and first

⚠️ **Half of John's original complaint is a defect, not a design question, and it should not wait
for any of the five above.** §A4's diagnosis is that impact height is a function of two coupled
inputs. **Decouple them:** project the look ray onto the face and clamp the result into the
reach *envelope*, rather than casting a fixed-tilt ray and taking whatever height falls out. Then
looking down slides the mark down the wall smoothly at any standoff, and standing closer changes
only *how much of the wall you can reach* — not *where you hit*. The `stepLift` machinery already
establishes the precedent of the body accommodating the geometry rather than the reverse.

**Second, smaller, and independent: the down-pitch clamp is 0.62 rad against 0.95 up**, in a game
whose rewarded target is the skirting. That asymmetry is almost certainly inherited from a
shooter, and it is backwards here.

---

## 🎯 WHICH I WOULD TAKE, AND WHY

**Take C5 (the sag) first, then C3 (the frame). Do C6 alongside both, immediately, as a defect.**

**C5 first**, because it is the cheapest thing on the list that touches the two biggest findings.
§A1 and §A2 are both symptoms of *one event, resolved instantly*: A1 says the rule has no middle,
A2 says the payout is over in 0.8 s. **A sag state is a middle, and it is 0.8 s of nothing turned
into as much anticipation as the player wants.** It reuses the A channel, the region labelling and
the plate lattice — all three already shipped, measured and green — so it adds no pool, no
material key and no draw call, and `wall.sheet` cannot see it. It is the highest felt-improvement
per unit of work by a distance.

**C3 second**, because it is the only direction that addresses four of the five, and because the
project's own Teardown reference already ruled that the surface-vs-structure stack *"is right and
only its legibility is wrong."* It is the real answer to *"different ways the mechanic can work"*
— it changes what a wall **is**, where the others change what happens to it. ⚠️ It carries the
`?dig=bays` risk and must ship with the correlation sweep.

**Not C4 first**, despite it being the cleanest targeting fix: it invalidates `sledge-check`,
`dig-band` and every blow-count in this project, and its useful half is available separately as
C6. **Not C1 first**, because its real payload is *risk*, and risk is the one thing genuinely
waiting on the hunter — build the hazard when there is something else in the room to be afraid of,
or the rubble is just an inconvenience.

⚠️ **And one thing I would ask John before any of it is built, because it decides C5 and C1 both:
should the collapsing wall be able to hurt you?** Everything about "risky" turns on that answer
and it is not mine to make.

---

## Instruments, and what I could not stand behind

- **The sheet measurement** is the shipped `DebrisSystem` driven headless at a fixed 60 Hz with
  `views/game.js` `onChunk`'s tiling arithmetic reproduced exactly. No renderer, no browser, no
  GPU contention, no time term but the fixed `dt` — the same form as `_collapse2-fall.mjs`. It is
  a *reproduction* of the payout block, not a call into it, so if that block changes this
  measurement goes stale; the figures to re-derive are the plate count (14) and the RMS column.
- **The crazing and aim-mark rulings are LOOKED-AT calls** on stored frames, at 3×, A/B'd against
  their own OFF arms. No new capture was taken; `src/` was quiet but I judged the pictures the
  builders filed rather than shooting my own, so **anything the stored frames do not show, I did
  not see** — in particular I have not seen the crazing in motion, and a tell is a temporal thing.
- **I did not run `strobe.mjs --mode impact`.** It would have re-photographed the swing and the
  first frame of the payout, both of which the stored frames and the headless drive already cover
  at better resolution, and its own header warns it cannot see timing it did not sample —
  which is exactly what §A2 is about. **Reported as a refusal, not an oversight.**
- **I did not measure GPU or draw calls.** Nothing I propose adds a pool or a material key, but
  none of it is priced, and C3's skeleton geometry certainly needs pricing before it is built.
- 🚨 **I cannot tell you whether any of this is fun.** I did not play it. Every "feels" in this
  document is an inference from arithmetic and a still frame, and where those two disagree with
  John, **John is right and I am wrong.**
