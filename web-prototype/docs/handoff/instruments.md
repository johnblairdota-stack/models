# Appendix: instrument hazards (full case studies)

**Covers:** every lying-instrument case study this project has hit — capture non-determinism,
quality-tier grade incomparability, `renderer.info` accumulation, `onBeforeCompile` silent
match failures, EPERM status-file writes, promise-rejection crash screens, and more. The core's
"Instrument hazards" section holds only the one-line rule extracted from each of these; this
file is the story, the measurement, and the fix.
**Read when:** you are about to trust ANY measurement (capture, grade, perf, A/B) and want to
know exactly how the last dozen of these were wrong, or you are debugging why a harness tool
is reporting something that doesn't match what you see on screen.

---

## Instrument hazards (all bit someone this week)

- 🚨 **A NUMBER MEASURED ON A SYNTHETIC FIELD DOES NOT DESCRIBE THE REAL ONE, AND ONE ALMOST SHIPPED
  A CHANGE THAT WOULD HAVE BROKEN THE DIG.** `audio.js` carried the recorded fact *"`blocked` true
  ZERO times in 63 dig blows"*, which made a proposed reorder look measured-inert. It was taken on
  a **synthetic all-barrier field**. On a real face at the shipped ×8 base the dig **bottoms out and
  refuses**, and the same reorder would have put the "NOT HERE" clank on **40 of 63 real dig blows**
  — the feel this project has tuned hardest. `genexit-1`'s own control caught it inside one run and
  the reorder was reverted; `audio.js`'s ladder is byte-identical and only its comment changed.
  🎯 **The fix went where the lie was, not where the symptom was:** `wall.js`'s scalar arm returned
  a hard `barrier: false`, and `audio.js` never asks *"is there cyan"* — it asks
  `typeof opts.barrier === 'boolean'`, i.e. **"do you know?"**. The key is now ABSENT rather than
  false. **When a stored number and a live one disagree, re-take it on the shipped arm before
  building on it.**

- 🚨 **AN APERTURE CELL HAS `barrier === 0`, SO "NO BARRIER HERE" IS NOT "INTERCONNECT HERE".**
  `_applyApertures()` sets `depth = 1, barrier = 0` on every doorway cell — that is the whole
  definition of a doorway. A probe scanning a face's barrier grid for the gap therefore finds the
  DOORWAY on any face that has one, digs into a hole that is **already open**, changes no stage,
  fires no unlock, and reports `unlocked=false` — **indistinguishable from the mechanic being
  broken.** Measured 2026-08-12: the same tree read FAIL on `f.g16.0.a` (a face with an aperture)
  and PASS on `f.g17.0.a` (one without), decided purely by which panel `dig.link[0]` happened to
  be. **Exclude `field.aperture` cells when hunting for the interconnect**, and prefer testing
  EVERY link panel over `link[0]` — the pick varies run to run.
- 🚨 **THE `_genfix1-diag` D6 CONTROL CAUGHT THE SAME AUTHOR FOUR TIMES AND PRINTED THE IDENTICAL
  `0 ramped` EVERY TIME.** In order: `applyHit` called on the FIELD with the PANEL's argument list
  (the field has its own `applyHit` with a different signature, so it neither threw nor dug); no
  `flush()`, so the B channel had not been recomputed and the bytes were stale; a dig at
  `pointAt(0.5, 0.5)` on a face that is **638 cells of doorway**, i.e. into the hole; and a
  destructive dig that ran before a later check and broke ITS premise instead. **Four causes, one
  symptom, and a zero that reads as a clean pass.** The measurement it guarded was correct and
  stable throughout — only the control was broken, which is the arrangement that stops a lucky
  pass from being mistaken for a measurement.
- ⚠️ **`damagefield.js`'s own channel-layout comment said "only two channels carry anything" and
  listed R, G, B — IT IS STALE: the sag work took A for strain** (`support.js` writes it,
  `aimmark.js:292` reads it as `strain`). All four channels are spoken for. Anyone planning to
  park a flag in alpha on the strength of that comment will corrupt the sag.

- Captures lie: `ok` on empty/boot-splash/all-black frames, stale review PNGs. **Check file
  size, content, and timestamp on every capture.** "Execution context was destroyed" =
  another agent rebuilt — retry, don't diagnose.
- ✅ **CAPTURES WERE NOT REPRODUCIBLE AT ALL UNTIL 2026-08-05 — FIXED. Full write-up:
  `docs/capture-determinism.md`. Gate: `node harness/determinism.mjs --all`.** Two `shoot.mjs`
  runs of one view with IDENTICAL flags differed in **10.1% of PNG bytes on `mat.lath` and
  83.1% on `room.ballroom`** — so every A/B and every grade-gate delta smaller than that was
  partly or wholly noise, and nothing in the harness said so. Two causes, both fixed: (1) the
  capture loop free-ran on an uncapped rAF, and **790 frames — 13.2 s of simulation — elapsed
  inside a single `page.screenshot()` call**, so the captured moment was a wall-clock lottery
  (`views/gadget.js` reasons about "settle(12), i.e. t ≈ 0.20 s"; the real capture was at
  ~13 s); (2) the AO sample rotation (`frame % 64`) and the film-grain phase are deliberately
  per-frame dithers, and a still frame integrates nothing. Capture mode now parks between
  settles and pins both dithers; live mode is unchanged. **Consequences you must know:**
  `settle(n)` really is `n/60` s now (default capture is **t = 0.2000 s, frame 13**);
  `--seconds N` is N SIMULATED seconds, not a wall-clock wait; `--view X` and `--view X --perf`
  finally produce the same PNG; and **any reference shot of an ANIMATED view taken before
  2026-08-05 is at an arbitrary, unreproducible moment and should be re-taken**
  (`char.locomotion`, `gadget.*`, `game.play`, `limb.detach`, `prop.chandelier`,
  `room.ballroom`, `wall.transition`). Static views moved only by the dither reseed.
  ⚠️ The mechanism first suspected — the async-bake gate in `settle()` — was NOT the cause:
  `_pendingWork` was 0 at ready in every run probed and the settle countdown was exact every
  time. `baker.js` is fully synchronous. It was hardened anyway.
- ⚠️ **`grade.mjs` NUMBERS ARE NOT COMPARABLE ACROSS QUALITY TIERS, AND EVERY GATE FIGURE ON THE
  BOARD WAS MEASURED AT `auto`/`high`.** Perf must be run at `--extra "quality=medium"`, so it is
  natural to capture the grade the same way — and on `light.shaft` that moves **median luminance
  33.8 → 45.1** while top-decile chroma and the toe barely budge (0.132 → 0.131, 3.7 → 3.1).
  Caught 2026-08-04 one step short of filing a false regression against a bit-identical change:
  re-captured at the default tier the same build reads **0.132 / 33.9 / 3.7**, i.e. the recorded
  numbers exactly. The tier changes dust counts, bloom mips and AO scale, so a volumetric view
  moves most. **Grade at the tier the recorded number was taken at, or state the tier beside it.**
- `measure.mjs`/`overlay.mjs`: clean-cyc figures only, `--refband 0.12,0.96` on the sheet or
  every reference H-fraction is wrong. They fail on room scenes — use `grade.mjs` there.
- 🆕 **For any A/B, use `harness/perf-ab.mjs`** — interleaved configs in ONE browser after a
  whole discarded round, and it prints the within-config spread beside every delta so a
  difference the instrument cannot resolve is reported as **NOT RESOLVED** instead of being
  attributed. ⚠️ **A change that ships without a permanent ablation toggle cannot be judged
  later**: `?aodepth=prepass` is why the AO win was provable, and the ABSENCE of one is why
  `room.ballroom`'s 2.24 ms sat unattributed for a round. Live toggles now on the board:
  `?aodepth=prepass`, `?mirror=planar|cube|off`, `?planarclip=flat`.
- Perf at `--extra "quality=medium"` only; discard the cold run; two consistent runs or it
  does not count; never while another agent measures.
- ⚠️ **"Discard the cold RUN" was too weak, and `perf-spaces.mjs`'s warm-up lap did not do what
  its comment claimed.** Every invocation launches a fresh Chromium and pays a ~33–36 s cold
  shader compile — far longer than a parking lap — so the compile landed inside the first one or
  two **timed** windows. Same build, across runs, `study_w`: cpu 60.6 / 26.4 / 6.8 / 26.3 / 28.8,
  and `--gate` called it the worst space in **4 of 6 runs purely for being first in `PLACES`**.
  Caught because it contaminated BOTH configs of the AO ablation. **Fixed 2026-08-04: the tool
  now runs and DISCARDS a full timed lap** (order-independent, unlike skipping N rows) and warns
  if the two laps disagree by >8 ms cpu. Any perf number in this file from before that date
  inherits the bias.
- ⚠️ **Draw-call counts from `perf-spaces` are a single-frame snapshot and swung 91–1356 on one
  build.** Do not conclude geometry is missing from them — take a scene-graph census at parked
  anchors instead (visible mesh + triangle counts), which is how the AO change's 0.51× call drop
  was proven to be pass count and not lost content.
- A probe that cannot observe must report SKIP, never PASS. If you assert something is on
  screen, look at a picture of it.
- ✅ **THREE LONG-RUNNING "STILL OPEN" ITEMS ARE NOW PROVEN DEAD — STOP RE-BRIEFING THEM.**
  `critic-matrobot-1` checked each structurally rather than taking a builder's word, then grepped
  **every `hates[]` array in `progress/status.json` project-wide** for "canted", "head-to-shoulder"
  and "warm cast": **zero matches anywhere on the board.**
  · **Warm cast** — `mat-robot.js` imports only `_studio.js`, `robot.js`, `unit4h.js`, **never
  `hunter-stage.js`** where this file's own text places the fix. *It cannot structurally reach the
  piece it was filed against.*
  · **Canted eyes** — `FACE_SURFACE`'s eye SDF is `sdRound(vec2(abs(p.x)-uEyeGap, p.y-uEyeY), …)`
  with **no rotation uniform anywhere in the shader**. *It is structurally incapable of producing a
  canted eye for any character.*
  · **Head-to-shoulder proportion** — `mat.robot`'s specimens are **five discrete objects on separate
  plinths**; there is no assembled body for the ratio to apply to.
- 🚨 **THIS FILE'S PROSE OUTLIVES THE BOARD. `progress/status.json` IS THE LIVE COMPLAINT LIST; THE
  NARRATIVE HERE IS NOT.** `matrobot-owner-1` was briefed from a "STILL OPEN" section and found:
  **the "studio's warm cast" item names a fix in `hunter-stage.js`** — a hunter file — *and
  `mat.robot`'s view uses its own independent `studio()` rig that never touches it, so the issue
  cannot structurally reach the piece it was filed against*. **And the "canted eye shape" and
  "head-to-shoulder proportion" items were both measured against the HUNTER's reference sheet — a
  corrupted, scowling design — not the PLAYER's**, while `mat.robot`'s own specimen shows a
  friendly round-eyed face matching the player's sheet. **None of the three is a live complaint in
  `status.mjs`.** It refused to make blind changes on stale narrative alone — the right call.
  **Before briefing from a prose section, check the piece's actual `status.mjs` entry.**
- ✅ **CAPTURE DETERMINISM — RESOLVED, THE HAZARD WAS AN ARTIFACT. Two independent agents now report
  byte-identical control pairs** after `camtool-1` gated the `OrbitControls` that had been
  constructed on **every live non-capture page load**: `mat.lath` default-vs-`?orbit=1` **0 bytes
  differing**, and `estate-owner-14`'s own two-identical-config `room.ballroom` control pair
  **byte-identical** — the same view originally cited at *83% of bytes differing*. **The original
  measurement was real but was measuring the ungated controls, not the renderer.** ⚠️ **Keep taking
  a same-config control pair anyway** — it costs one capture and it is what caught this.
- ⚠️ **(SUPERSEDED, kept for the trail) THE HAZARD AS ORIGINALLY FILED:** It was measured while `OrbitControls` was being **constructed on every live
  non-capture page load** (an ungated pass `camtool-1` then found and fixed). After that fix, the
  same `mat.lath` default-vs-`?orbit=1` pair came back **pixel-identical, 0 bytes differing** —
  *tighter than the "noise floor" the original measurement claimed existed.* **So the floor may be
  much smaller than recorded, or may have been an artifact of the ungated controls. Re-measure two
  vanilla captures per view before citing any of the numbers below.**
- 🚨 **(UNDER REVIEW, see above) TWO CAPTURES OF THE SAME UNMODIFIED VIEW MAY NOT BE THE SAME
  IMAGE.** Originally measured with **zero code touched**: `mat.lath` **10.1% of bytes differ, mean
  delta 1.5/255**; `room.ballroom` **83% differ, mean delta 2.7/255**. Suspected cause at the time:
  **async bake timing shifting the sim-time grain / breathing-light phase at `settle()`**.
  **The safe practice stands regardless of the number: take a same-config control pair.**
  **Consequences:**
  - **"Byte-identical" is an IMPOSSIBLE test and must never be demanded as proof** — the lead
    demanded exactly that of `camtool-1` and it was right to redefine it. The correct proof is
    *"the change lands inside the same-config noise floor"*: forcing `?orbit=1` onto a capture read
    **10.3% / mean 1.5** against vanilla's **10.1% / mean 1.5** — statistically indistinguishable.
  - **EVERY A/B NEEDS A SAME-CONFIG CONTROL PAIR.** The good rounds already did this —
    `critic-ao-look-1` killed a builder's "25 differing pixels" claim precisely because two renders
    of the *same* config differed by the same magnitude (absMean 0.321 vs 0.322). **Any round that
    reported a 1–3 level difference WITHOUT a control pair was possibly reporting noise.**
  - For contrast, `--cam` proving it is *not* inert: reproducing the r10 camera changes **98.2% of
    bytes, mean delta 50**. That is what a real difference looks like.
  **Making the grain phase deterministic at capture is an open job (see `docs/PLAN.md`).**

### ✅ TOGGLE AUDIT COMPLETE (`toggle-audit-1`) — **the measurement history is SOUND, with one exception**
**28 query parameters across 11 files**, cross-checked against the scenarios that pass them.
**Only ONE confirmed incomplete revert exists in the whole codebase.**

🚨 **`?cam=r10` (`room-ballroom.js`) — STILL INCOMPLETE.** `vestMat.color` (~line 565) and
`paperScatter({count: 165, curl: 0.40})` (~lines 1011–1012) are gated **only by `DEPOT`, never by
`CAM`**, so the "historic reproduction" still ships r13's vestibule material and paper overhaul.
That is the measured 0.122/37.6/3.1 vs recorded 0.123/39.1/4.5. **Fix relayed to
`estate-owner-14`**, which holds the file; the auditor correctly refused to patch blind under a
live diff.

**Verified COMPLETE and safe to keep trusting:** `?exits=N` (end-to-end — `panelDefs` reaches all
three consumers, and `room.panels` flows to `buildExterior` and the run-plan filter) · `?tells=`
(recomputes fresh every call, nothing cached to leak) · `?exterior=0` (returns a fully stubbed
no-op *before* building anything) · `?aodepth=prepass` (absent/garbage falls to the new default) ·
`?mirror=`, `?planarclip=`, `?mirrorfilter=`, `?floorreflect=0` · `?dbg=no*` (checked specifically
against the exterior's parenting bug — these lights ARE genuine descendants of `gadget.root`, so
`visible=false` really does kill them) · `?flat=1` on `mat-plaster` (round 4's own acceptance test)
· the quality knobs.
✅ **And the lesson propagated on its own:** `estate-owner-14`'s brand-new `?floor=mixed|chequer`
traced **COMPLETE**, with a comment saying it exists *because* `?cam=r10`'s revert turned out not
to be one.
⚠️ **Two low-risk notes, no verdict rests on either:** `CAM_GRADE`'s toe lift only applies when
`daylight !== 'flat'`, so `?cam=overlook&daylight=flat` gets none despite the comment framing it as
overlook-only; and `mat-plaster`'s per-lath depth jitter is not gated by `flatLath` — but it
predates the protrusion story and was present when round 3's own `flat=1` A/B came back near
pixel-identical.

### 🎥 THE CAMERA TOOL LANDED (`camtool-1`) — John asked for it; iteration was blocked without it
`?orbit=1` on any `mat.*` / `room.*` / `prop.*` / `light.*` / `wall.*` / `char.*` / `hunter.*` /
`gadget.*` / `limb.detach` view. ⚠️ **`OrbitControls` wiring ALREADY EXISTED in `_studio.js` from an
earlier undocumented pass and was ON BY DEFAULT for every live non-capture page load** — it is now
gated so a view with no flag constructs no controls at all.
- **Paste-ready readout + copy button** — prints `cameraPos:[…], target:[…], fov:N`, literally the
  shape `studio()`/`estate()` accept, so a shot can go straight into source or an agent brief.
- **LIVE COMPOSITION READOUT** — `harness/evidence/_eo13_cam.mjs`'s per-pixel room-box ray-cast ported into
  the overlay, so floor/ceiling/wall fractions update **as you orbit**. **This is the instrument
  that would have caught the ballroom framing before twelve rounds of surface polish went into it.**
  ⚠️ **THE LEAD REPORTED IT BROKEN IN A PRODUCTION BUILD (`floor 0.0% … out 100.0%`) AND THE FAULT
  WAS THE LEAD'S OWN BROWSER PANE.** Root cause: `compositionReadout()`'s ray math is
  `ndcx * th * aspect`, so whenever **`camera.aspect` is non-finite or ≤ 0** — a canvas never sized,
  or resized without a `resize` event reaching the page — every ray's horizontal component collapses
  and the classifier returns **a plausible-looking 100% `out` instead of an error.** Reproduced
  exactly by forcing `aspect = NaN`. **Dev/prod divergence was RULED OUT**: the same production
  bundle served statically and driven by an isolated Playwright session read **floor 42.7% / ceil
  3.8% / wall 53.5%** across five samples.
  ✅ **Two assertions added, and this is the pattern to copy:** one on the *input* (non-finite or
  non-positive `aspect`/`fov`) and one on the *geometric invariant* — **a ray from inside a closed
  box must exit somewhere**, which catches this class regardless of mechanism. Either flips the
  panel to **`⚠ COMPOSITION READOUT INVALID — NOT A MEASUREMENT`** in red, **never beside a number.**
  `camera.updateMatrixWorld()` is now called by the readout rather than trusting a matrix the
  renderer may not have refreshed.
  ⚠️ **A VERIFYING TOOL IS AN INSTRUMENT TOO.** The pane that produced the false reading resizes its
  viewport after load without firing `resize`. **When a measurement disagrees with its author's,
  suspect the thing doing the checking as readily as the thing being checked.**
- **`?campose=x,y,z,tx,ty,tz,fov`** and **`--cam` on `shoot.mjs`**. ⚠️ **Deliberately NOT `?cam=`** —
  that name is already `room-ballroom.js`'s named-preset selector **coupled to a grade choice**, and
  reusing it would have silently fought that view's state.
- **Disabled on `game.play`** (it already passed `orbit:false`), so `ThirdPersonCamera` was never at
  risk. ⚠️ Left open: `hunter-stage.js`'s own post-`studio()` `fitCamera()` **overwrites
  `?campose=`**; `room.gallery`'s `roomBox` is a padded approximation, not a source of record.
- ⚠️ **`renderer.info` DOES NOT RESET UNLESS THE ENGINE LOOP RUNS IT.** `engine.js:67` sets
  `info.autoReset = false` and calls `info.reset()` only at `engine.js:247` and `:265` — **inside
  the engine's own loops.** Any probe that calls `pipeline.render()` **directly** bypasses that, so
  `calls` and `triangles` **accumulate across frames**. `perf-breach2.mjs` reported a perfectly
  linear **+256 calls and +125 466 triangles per frame, climbing to 7370 calls against a 625
  budget** — which reads exactly like a catastrophic per-frame leak and **is an un-reset counter.**
  The probe flips visibility ONCE and renders 20 times with no state change, so perfect linearity
  was the tell. **Call `renderer.info.reset()` yourself in any manual render loop, or read nothing
  from `info.render`.**

### 🏆 `critic-estate-11` — **`room.ballroom` r13 → PASS 87, a new project high.** Still 0/37 WOWED.
**The reframe was the right call and it verified cleanly:** face fractions reproduced exactly on the
critic's own run (overlook **40.3 / 3.7** floor/ceiling vs r10's 30.5 / 20.7), grade **PASS 0.041 /
42.9 / 5.2** exactly, grain **5.081 vs art 5.481** and edge rise **6 px vs 5** exactly, and the
whole-frame macro **overshoot 0.8815 vs 0.7796** exactly — attributable, as claimed, to the chequer
floor's own tile contrast.
**Blind and post-art differed usefully:** cold, it read as a genuine depot overlook and the critic
independently flagged the dark arch as *"a hole/void"* before reading any claim about it.

🎯 **THE FASTEST REMAINING TELL IS THE FLOOR MATERIAL — and it is the SAME CLASS OF GAP AS THE
CAMERA, ONE LEVEL DOWN.** The bar's floor is **wood parquet with checker only at the edges**; ours
is **checker edge to edge.** Fixing it moves the macro overshoot, the shaded-floor macro, **and the
paper litter's admitted ~40% invisibility** (half this floor is white marble at paper's own value)
**at once.** ⚠️ It is coupled to the r9 planar-reflection win — that patch's roughness gate
(`lo: 0.06, hi: 0.42`) is authored for polished marble, so a two-material floor needs it applied
twice. **Build it behind `?floor=`. This is the piece's top item.**

🚨 **A TOGGLE THAT REVERTS THE CAMERA BUT NOT THE SCENE IS NOT A REVERT — AND THIS ONE WAS SOLD AS
"every historic number stays checkable".** The lead flagged the claim as overstated; the critic
found the cause. **`?cam=r10` does NOT reproduce the historic gate** — fresh capture **0.122 /
37.6 / 3.1** against the recorded **0.123 / 39.1 / 4.5** — because the vestibule's new darker
material and the paper-litter overhaul (130 → 165 sheets, curled, paler) are **UNCONDITIONAL on the
`cam` parameter**, so they leak into the "r10 reproduction" though neither existed when the historic
figure was filed. **Not stale figures — an INCOMPLETE REVERT.**
⚠️ **This project has settled its biggest questions with ablation toggles — `?aodepth`, `?mirror`,
`?planarclip`, `?floorreflect`, `?exits`, `?tells`, `?cam`. A toggle that does not revert every
piece of state it implies contaminates every comparison made with it.** Audit the others.
⚠️ **Second claim refuted: "one more room corner in frame" (3 → 4) does NOT reproduce** — the
critic ran **the builder's own instrument** with the exact shipped camera, twice, and got **3, the
same as r10.**
⚠️ The vestibule fix **trades a pale blank card for a black blank void** — a 4× brightened crop
shows no legible geometry. It closes the grade WARN but has not earned *"reads as depth"*.
✅ The near-wall rebuild (one storey where every other wall had two, **4.8 m of open void above it**)
is confirmed visually clean.

### 🧱 `mat.lath` r1 → **WEAK 50** (`critic-lath-1`). Built today; the board is down to TWO NOT_BUILT.
✅ **THE GROUP'S HARDEST GATE PASSES.** *"A critic must name the stage from a cropped screenshot
with no context"* — it guessed **"lath" without hesitation** at three separate crop locations,
including a deliberately hard transition zone, and **on a positive cue (visible wood grain) rather
than by elimination.** Recorded via `status.mjs blind`. Real per-plank colour and grain variation
matching `lath-kent.jpg`.

⚠️ **BUT THE COMPOSITION PREMISE DOES NOT HOLD, AND THE CAUSE IS A FIX THAT IMPORTED A DEFECT.**
The break silhouette fills essentially the **entire frame** — **lath ≈95%, plaster ≈5% in two corner
scraps, wallpaper ≈0%** — so it reads as a **full-bleed texture crop, not a specimen staged inside a
broken opening**, which is exactly the flat-swatch framing the piece existed to avoid. Root cause
**verified in code**: the builder fixed a real "floating over a void" bug by **adopting
`wall-stage.js`'s camera exactly** — and that camera carried `wall-stage.js`'s *in-situ framing
philosophy* with it. **Copying a camera copies a composition. A fix can import the defect of the
thing you copied it from.** Compare `mat.plaster`'s specimen (full wall face + crown moulding around
a modest opening) and `refs/lath/lath-mcminnville-oregon.jpg` (a hole at ~15% of an intact wall).

🚨 **THE CROSS-CUTTING FINDING: THE BREAK EDGE IS CG-SOFT, AND IT AFFECTS THE WHOLE WALL GROUP AND
THE DIG DESIGN.** Against `refs/lath/lath-clay-plaster-ceiling.jpg` — *"the best break edge in the
set: ragged, crumbling, separated chunks, fibre wisps"* — our edges are **smooth, soft, rounded
"cloud/scallop" lobes.** `breakmask.js`'s own docstring says the lip *"is why this looks broken
instead of looking like a stencil"* — **under bright studio light it does not deliver that.**
⚠️ **And this is why the score sits BELOW `wall.2.lath`'s 66 on the same shader: the studio grade
exposes what the dark game grade was hiding.** **The material catalog is a harsher gate than the
in-situ pieces, which means it is doing its job — treat `mat.*` scores as the honest ones.**
⚠️ **`docs/design/dig.md` makes destruction the game's central verb and asks for it to be "utterly
satisfying". The torn edge is the hero of that effect. Fix it in `breakmask.js` and every wall piece
plus the dig benefits at once.**

⚠️ **Half-held fix:** the camera pullback stopped the panel floating, but a **right-edge crop is
uniform dead black with zero gradient, stud face or side reveal**, despite code comments describing
a lit cavity and two stud boxes — *the comment describes something the frame does not show.* The
chrome ball is cropped to a rim and does not work as the reflection demonstrator `mat.walnut`'s
does. ✅ The 0.83 → 0.89 island fix holds. Perf clean at 1.15/1.39 ms.

### 🔎 THE RESIDUAL RENDER-BOUND STALL — mechanism traced, magnitude NOT yet explained
`play-critic-8` measured in-play frames of **507.8 ms (`rend 501.3`)** and **832.3 ms
(`rend 815.2`)** with **dprog / dtex / dgeo / dheap / realloc ALL 0**, each **while a hunter BREACH
was running**. `perf-stall-2` traced the chain by source:
`STAGE_DEFS.blocksMove` only flips false at **stage 4 (OPEN)** → `room.js:166 breachPortals()`
adds a portal the instant it does → `setViewpoints()` makes a space resident → **a space that has
never been resident has never been DRAWN**, and three.js uploads a mesh's GPU buffers **lazily on
first draw, inside `r.render()`** — which touches none of those counters, because
`info.memory.geometries` counts distinct geometry objects registered at scene-build time, not
uploads. **Breach completion is the only event that creates a portal into a previously-sealed
space**, which is why the correlation is exact.

**Measured by the lead on `perf-breach2.mjs`:** baseline (target hidden) max **14.6 ms**; on the
first frame after the flip **33.0 ms with `dtex 1`**, then 20 ms, then settling to 7–9 ms.
✅ **The mechanism is real and reproducible.** ⚠️ **But 33 ms is not 500–830 ms — the magnitude is
unexplained.** Likely scaling factors to test next: a much larger space than `service`, several
spaces becoming resident at once, or **the exterior's 14 yards** (the "+3 draw calls" figure that
made the exterior look free was measured when there were FOUR).
**If confirmed, the fix is the pattern already proven for the shader freezes: draw every space once
during the loading screen** — extending the warm-up from "every material variant" to "every space's
geometry."

**Two suspects KILLED by source reading, strike them from the list:**
- **"The wall's layered mesh stack is rebuilt as it crosses a stage" — REFUTED.** `_apply()` /
  `applyStageBreaks()` only call `setBreak()`, a **shader uniform write**. The four layer planes and
  the merged reveal box are built **once, at construction.**
- **"The debris/dust burst" — REFUTED as the `rend`-attributed cost.** Both write into
  pre-allocated fixed-size typed arrays and `InstancedMesh` pools (`perKind = 220`, `mesh.count`
  never changes) — CPU-only, and they run in the **update** phase, not inside `pipeline.render()`.
- 🚨 **PORT :5193 IS OCCUPIED BY A FROZEN SNAPSHOT BUILD AND IT CONTAMINATED A PERF ROUND. THIS ONE
  IS THE LEAD'S FAULT.** The lead started `harness/serve.mjs --port 5193 --dir <scratchpad>` to host
  a **frozen** build for John's tablet. `harness/perf-stall.mjs` **reuses whatever is already on
  :5193** and mocks the HMR socket — so it measured the frozen snapshot, not the tree. From
  *identical source*: reusing :5193 reported programs-at-play-start **447/449** and +98/+120 built
  in play; **a fresh server on a new port reported 674 and +19/+16.** *"Reusing the server already
  on :5193 is a warning, not a convenience."* **Any harness tool that reuses a port must print what
  it connected to and when that build was written.**
- ⚠️ **"THE WORST PARKED STATION IS 616/625" IS NOT A FIXED NUMBER** — measured 614 pre-change and
  615/617/617 post. **The ±2 is the patrolling hunter moving between runs.** Never quote a single
  value. 🆕 **AND THE 614–617 RANGE ITSELF IS SUPERSEDED: re-measured 2026-08-05 it read 625 and
  627, i.e. the gate was already FAILING on one run in two.** `instancing-1` took it to **580–586**
  — see the instancing section at the top. Note which station: `service.mid` is the only one of the
  twelve that moves between runs; every other reproduces to the digit, so a range quoted for the
  whole table is really a range for one room.
  🚨 **AND THAT LAST CLAUSE IS NOW REFUTED — "every other reproduces to the digit" IS FALSE, AND
  SO IS HANDOFF'S "draw-call counts are deterministic and exempt" IF YOU WALK STATIONS.**
  `dressbin-1` (2026-08-11) read `ballroom.centre` at **423 / 461 / 479 calls and 600 596 →
  667 314 triangles on the SAME build, SAME seed, SAME station**, and its `collapse-all` arm —
  which can only ever REMOVE geometry — came back at **+49**. The mechanism is the WALK, not the
  hunter: each arm visited twelve stations in sequence, and state accumulated along the way
  (pools compiled, instances promoted, frusta warmed) landed in the next reading.
  🎯 **THE RULE: FLIP THE ARM IN PLACE AT ONE STATION AND READ IT THERE. NEVER COMPARE TWO WALKS.**
  A per-station flip made the same measurement reproduce at `+0 … +0` with a control of 0 at 12/12.
  ⚠️ **This was caught by the instrument's own must-fail control (C5, "every flip must revert"),
  which went RED on its first run and was right** — the pricing it invalidated would otherwise have
  reported a free feature as costing +49 of a 625 budget.
- ⚠️ **FOUR CORNER LOOKS DO NOT COVER A RECTANGULAR ROOM — false by arithmetic.** At 62° fov the
  four diagonals leave four ~50° wedges down the axes; the skates at `ballroom.south` sit **60.6°
  off the nearest corner look**, i.e. outside all four frustums, which is why gadget materials were
  still compiling mid-play *after* the light-count fix. The warm-up lap now widens fov to 120°
  (**not part of the program cache key, so it costs nothing**).
- ⚠️ **A POOL THAT DRAWS NOTHING HAS NEVER COMPILED.** `DebrisSystem` and `DustSystem` sit at
  `instanceCount = 0` — a draw the driver skips — so their programs were built the first time
  something actually broke. Primed in the loading screen now.
- ⚠️ **`x.visible === true` IS NOT EVIDENCE ANYTHING IS DRAWN** — the *parent* is what gets
  switched, and a `uStrength`-style uniform keeps whatever the last visible frame left in it. Walk
  the parent chain. (Same class as *"`root.visible = false` is not an ablation"*, from the other end.)
- ⚠️ **A CLAMP IS NOT A DEFAULT.** `Math.max(256, Math.min(4096, +(qs.get('sunmap')||0)||0))` clamps
  an **absent** parameter to 256 — a silent 256 px shadow map that read as "a brighter room". Also:
  spreading `lift: undefined` over a grade **deletes the field** and crashes `_applyGrade`.
- 🚨 **JOHN'S 5-SECOND FREEZES ARE A SHADER COMPILE, AND THE WARM-UP MISSES IT BECAUSE THERE ARE
  FOUR POINT-LIGHT COUNTS, NOT TWO.** `views/game.js:855` loops `for (const flareOn of [true,
  false])`, believing only the hunter's eye moves the count. Measured in live play the RENDERED
  count takes **8, 9, 10, 11** — because **THE GADGETS BRING THEIR OWN POINT LIGHTS**
  (`gadgets/index.js:447,450,814,817,1123,1962`). So `views/game.js:169`'s
  *"THE LIGHT COUNT IS FIXED FOR THE WHOLE MANSION AND MUST NEVER CHANGE"* is **true of the room
  rig and FALSE of the game** — a stale comment that is why nobody looked. `numPointLights` is in
  three's program cache key, so **one frame at an uncompiled count recompiles every visible
  material**: in one run count 8 was live for a SINGLE frame and cost **+132 programs**.
  Episodes reproduced on demand: **4.97 / 5.29 / 5.41 / 5.90 / 10.26 s**, each a burst of **+30 to
  +52 programs**, with textures FLAT, bakes FLAT and ~100% of the interval inside
  `pipeline.render()`. **Proof by removal:** a four-variant prewarm collapses in-play builds
  **+152/+107/+177 → +10/+8/+7/+2**, four times, with no compile burst in any episode.
- ⚠️ **A MAX THAT REMEMBERS TWO SECONDS IS WORSE THAN NO MAX — IT LOOKS LIKE COVERAGE.**
  `Engine.perf()` has reported `frameMaxMs`/`frameP95Ms` all along, over a **120-sample ring = 2 s
  at 60 fps**, so a five-second freeze is overwritten before anything can read it (and every
  consumer reads a mean anyway). The lead's brief said "nothing reports a maximum"; **the truth was
  worse than the complaint.** `harness/perf-stall.mjs` keeps EVERY frame of a session and reports
  **freeze episodes** — a maximal run under 40 fps containing a >120 ms frame — because *a 400 ms
  frame plus forty 90 ms frames is a five-second freeze that a per-frame max calls 400 ms.*
- ⚠️ **SECOND CAUSE, in `src/core/engine.js`, and NO CAPTURE TOOL HAS EVER RUN ONE FRAME OF IT.**
  `_liveLoop` moves `renderScale` on a 120-frame average and calls `pipeline.setSize()`, which
  **disposes and reallocates the entire render-target chain**. One stall poisons that average for
  120 frames, so it steps down ~19 frames in a row: **102–306 full RT rebuilds per 4-minute
  session, 30–600 ms each**, landing OUTSIDE `pipeline.render()`. `_captureLoop` pins the scale.
  Ablate with `--dynres 0`. **Still open.**
- ⚠️ **`?exits=4` IS NOT THE CAUSE — the lead's top suspect, refuted.** It is a multiplier only:
  14 yards carry **+157 programs at boot** (444 vs 287), but the `exits=4` arm **still froze for
  5.41 s** on a 31-program burst.
- ⚠️ **GC IS UNMEASURED, NOT RULED OUT.** `performance.memory.usedJSHeapSize` **never moved once**
  across nine sessions, even with `--enable-precise-memory-info`. **That column is dead** — the
  tool now says so out loud rather than reporting "0 GC events" from a frozen counter, which is the
  exact shape of every lying instrument in this file.
- ⚠️ **`grade.mjs` NUMBERS ARE NOT COMPARABLE ACROSS QUALITY TIERS, AND EVERY GATE FIGURE ON THE
  BOARD WAS TAKEN AT `auto`/`high`.** At `quality=medium`, `light.shaft`'s median reads 33.8 →
  **45.1** while chroma and toe barely move. Caught one step short of filing a false regression.
  **Re-capture at the default tier before comparing to anything recorded here.**
- ⚠️ **`gadget-sheet.js` RE-TYPES RIG VALUES INSTEAD OF IMPORTING THEM, SO THE COMPOSITE BREAKS
  BOTH WAYS.** It carried the nailgun's and grapple's **stale hates** verbatim after both were
  refuted — *and* it holds its own grapple arm at **−0.39 rad, MORE outward than the −0.35 in
  `gadget.js`**, so fixing the standalone piece alone would have left the defect on the sheet
  **while the report claimed it closed.** **When you change a part, open the sheet and check the
  number there too — in both directions.**
- ⚠️ **THREE MORE LYING INSTRUMENTS, all from one round (2026-08-04), all in ABLATION rigs:**
  1. **`esc1b-the-way-out` was photographing the INSIDE OF A WALL.** The boom LERPs its *position*
     through geometry (only its *length* is raycast), so teleport-then-`step(12)` fires mid-flight.
     On `seed=rrr-test-1` **both arms of an A/B were a full-frame close-up of plaster** — and an
     A/B where both arms are wrong still produces a confident "no difference". Fixed in
     `harness/scenarios/escape.mjs`.
  2. **`readRenderTargetPixels` with the wrong array type returns ZEROS, not an error** — so a
     picker reported "nothing is drawn there" when nothing had been *read*. **Validate against a
     control pixel you know is non-zero.**
  3. **`root.visible = false` IS NOT THE ABLATION** when children are parented elsewhere — the
     exterior's tell, chain and dressing hang off the *panel*, so the A/B left them on screen.
     **That is how a slab covering 92% of the aperture survived three A/B pairs.** Ablate by the
     system's own switch (`exterior.setVisible()`), not by hiding a root you assume owns everything.
- ⚠️ **`onBeforeCompile` HANDS YOU THE SHADER WITH ITS `#include`s STILL UNRESOLVED, AND A PATCH
  THAT MATCHES NOTHING FAILS SILENTLY.** A patch aimed at text *inside*
  `envmap_physical_pars_fragment` matched nothing, returned the string unchanged, **threw no
  error**, and the result merely looked *darker* — indistinguishable from "the effect works and
  the target is dark". Cost an hour. **Every other `onBeforeCompile` in this repo replaces an
  `#include` LINE: that is not house style, it is the only thing that works.** Two riders:
  `patchForScreenAO` **overwrites** `customProgramCacheKey`, so use a `defines` entry instead; and
  a mirrored camera stands **behind** the wall its mirror hangs on. **`String.replace` returning
  the input unchanged is the silent failure mode — assert the match happened.**
- ⚠️ **THE BOARD SILENTLY STOPPED ACCEPTING WRITES FOR FOUR HOURS. FIXED 2026-08-04 — and the
  shape of this bug will recur.** `status.mjs save()` wrote a temp then replace-renamed onto
  `progress/status.json`, retrying **40 times before throwing**. On Windows a replace-rename
  fails **EPERM** whenever any process holds the target open without `FILE_SHARE_DELETE` (an
  editor, an indexer, an antivirus scan, another agent mid-read) — and that is **PERMANENT until
  the handle closes, not a race that clears in 2 seconds.** So 40 retries failed exactly as fast
  as one, and agents filed verdicts that were never written: `status.json` went unwritten from
  **10:21 to 14:38** and one round's grapple entry was lost outright. Diagnosis that pins it:
  renaming the temp to **any other name** succeeds and `openSync(r+)` on the target succeeds —
  **only the replace-rename fails.** Now falls back to an in-place write, which is safe *here
  only* because `load()` already retries a failed parse 40× at 60 ms. **If a tool retries a
  filesystem op in a loop and then throws, ask whether the failure is transient at all.**
- ⚠️ **CHECK `--at` BEYOND THE DEFAULT BEFORE JUDGING ANY MOVING PART.** Captures fire at
  t ≈ 0.20 s. The grapple's cable solve had `atan2(-dz, dy)` where it needed `atan2(dz, dy)` — a
  **mirror about Y** that is exactly correct at rest (`dz = 0`) and wrong the moment it moves.
  The launch window opens at 0.35 s, so **every capture ever taken of that piece agreed with the
  bug.** Pinning `--at 0.85` showed a foreshortened cable stub with the anchor floating free of
  it. Same family as `gadget.oil` being scored for six rounds on a picture of an empty floor.
- ⚠️ **`harness/status.mjs --wins` REPLACES, it does not append** — and pieces are routinely
  BUILDING under another agent while you write. `critic-ao-look-1` caught this live: `room.study`
  read `WEAK 60` when it started and was `BUILDING` with a fresh summary by the time it wrote, so
  a naive `--wins` call would have destroyed another round's critique data. **Re-read a piece
  immediately before writing to it, and never write verdict/score/hates on a piece you are not
  the owning critic of.**
- ⚠️ **A REJECTED PROMISE ANYWHERE PAINTS "VIEW ... FAILED" OVER THE WHOLE GAME.** `main.js:26`
  is `addEventListener('unhandledrejection', (e) => fail(e.reason))`. Found the hard way:
  `requestPointerLock()` RETURNS A PROMISE, so any browser that merely **refuses** the lock got a
  black screen with a stack trace instead of a playable game — reproduced as *"The root document
  of this element is not valid for pointer lock."* Two ordinary cases hit it: an embedded frame,
  and **iPadOS Safari, which has no Pointer Lock at all**. Fixed 2026-08-04 in `player.js` and
  `views/game.js` (both call sites now swallow it), plus a **drag-to-look fallback** in `Input`
  for when the lock is unavailable — tap under 6 px of travel is an attack, anything further is a
  look gesture and deliberately does NOT fire the weapon. Desktop behaviour is untouched: with a
  working lock that branch never runs. **If you add a promise-returning browser API to a view,
  catch it, or you have shipped a crash screen.**
- ⚠️ **A VIEW CAN PRIME AN EFFECT AFTER THE CAMERA HAS ALREADY FIRED.** `views/gadget.js` primed
  the oil trigger at **t = 0.5 s** while `shoot.mjs` captures after `settle(12)` ≈ **t = 0.20 s**,
  so `burn` was 0 in every capture ever taken. **`gadget.oil` has never photographed its arc or
  its burning splash, and its score of 50 was awarded on a picture of a robot holding a drum over
  bare floor.** Fixed 2026-08-04. **If a view schedules anything on a timer, check that timer
  against the capture instant before trusting any verdict on it.**


### ⚠️ `onBeforeCompile` HANDS YOU THE SHADER WITH ITS `#include`s STILL UNRESOLVED — AND A REPLACE THAT MISSES FAILS COMPLETELY SILENTLY

This cost an hour and it will cost the next person the same. `resolveIncludes()` runs **later**,
inside `WebGLProgram`. So a string replace aimed at text that lives INSIDE a chunk — here
`vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );`, which lives
in `envmap_physical_pars_fragment` — **matches nothing, returns the string unchanged, and throws
no error.** The plate went on rendering the cube path and merely looked a bit darker, which is
**indistinguishable from "the planar reflection is working and the target is dark"**. Every other
`onBeforeCompile` in this project (`pipeline.js`, `materials-local.js`, `robot.js`, `gadgetmat.js`)
replaces an `#include <...>` line or `void main() {` — **that is not a house style, it is the only
thing that works.** The fix is to pull the chunk out of `THREE.ShaderChunk`, edit it, inject it in
place of its own include, and **assert the edit landed** rather than hope.

Two more traps from the same block, both verified against three r180's own source:
- ⚠️ **`patchForScreenAO` OVERWRITES `customProgramCacheKey`** with a constant shared by every
  standard material in the project, so a cache key of your own is thrown away and your material can
  be handed a program compiled for a different one. Use a **`defines` entry** instead:
  `getProgramCacheKey` walks `parameters.defines` *before* it reaches `customProgramCacheKey`.
- ⚠️ **A mirrored camera stands BEHIND the wall the mirror is hung on**, so with a default near
  plane it photographs the back of that wall and returns a flat field — which looks exactly like
  "the reflection has nothing in it" and is nothing of the kind.



---

# 🗜️ APPENDED 2026-08-10 (`diet-2`) — moved verbatim out of `HANDOFF.md`'s core

Four case studies and one write-up that had grown into full sections of the boot document. The RULE
each one produced still lives in `HANDOFF.md`'s hazard list at full strength; the STORY is here.
Where a block says "this file" it meant `HANDOFF.md`.

## The capture jitter: how the floor got to exactly zero, and what that immediately exposed

✅ **ITS DAMAGE ARM IS GREEN AGAIN AND THE FLOOR IS NOW EXACTLY ZERO — `jitter-1`, 2026-08-09.
BOTH ARMS 12/12** (`--q "seed=s4&dig=1"` and `--q "seed=s4&dig=0"`), same-config floor
**0.00% moved, |Δ| 0.000 at all four stations**, against the 43–49% / 4.18% / 23.21% lottery it
used to read. 🚨 **AND IT WAS NEVER GALLERY-LOCAL AND NEVER THE GRAIN.** `playtest.mjs` boots
the **LIVE** loop and `docs/capture-determinism.md`'s 2026-08-05 fix is a **CAPTURE-mode**
property — so *every scenario pixel A/B on this project* is taken in the one mode that document
excludes. Nothing regressed; it was never covered. Each term armed alone on a pixel-identical
base (`_jitter1-who.mjs`): **one dynamic-resolution step 7.54%** of the rect · grain phase
**0.74%** · AO rotation **0.47%** · the whole game update **0.07%** · the four practical
flickers **0.00%, pixel-identical**. 🎯 **The big term is `_liveLoop`'s dynamic resolution,
which resamples every pixel in the frame and is driven by frame time — i.e. by what OTHER
agents are doing to the GPU, which is why the same test floored at 0.7% alone and 49% under
load.** The gallery reads worse than the service passage only because its frame is
high-frequency detail and the passage is flat plaster; the camera drift is **0.000 mm over 32
frames**. **Fix is `harness/still.mjs` (`hold`/`release`) and there is NO source change** — the
grain still ships at 0.024 and still animates. Full table and the two ways the probe lied first:
`docs/capture-determinism.md` **§7**.
⚠️ **AND THE ZERO FLOOR IMMEDIATELY EXPOSED THAT THE NEIGHBOUR ASSERTION WAS THE WRONG SHAPE.**
Opening a body-sized breach relights the room — the neighbour's rect moves a smooth **+4.9 to
+5.7**, ceiling +3.3, floor +3.9, **0.03% of pixels past 40** — while the dug panel scores
**71.6% past 40**. A bound-uniform leak paints the dug panel's discards, i.e. STRUCTURE, so the
test is now `px > 40` rather than a ratio against the floor, and it carries a **positive
control that really breaks the neighbour and requires the check to fire** (51.7–57.2% vs the
1.0% bar).
✅ **`eo2-calls.mjs` is GREEN again on all three wall arms** (`calls-1`, 2026-08-09): worst
station **841 / 722 / 682 → 599 / 480 / 426** against 625. 🚨 **And the cause named in three
places in this file was WRONG — it was never the ballroom.** See the dedicated entry below.
✅ **`dig-band` is 21 passed / 1 failed and the 1 is the chapel's named floor-plan shortfall.**
`digparity-1`'s three stalls are **GONE** — the `_macro` `MACRO` 2 → 1 fix closed them, and the
"18/4" this line used to carry was written before it landed. Re-measured 2026-08-09 by
`visible-1`, five seeds, six spaces, plus one new check (B2c, below). **Do not adopt the chapel.**
⚠️ **Pass `--q "seed=s4"`, not `--extra`** — see the flag hazard below; `escape` and `dig-free`
both read as near-passes with silent SKIPs until they were re-run correctly.

## ⚠️ A FLAW IN HOW BLIND A/Bs WERE BEING RUN — fix this in every future brief

**A blind A/B shows the critic BOTH variants, so its "ranked defects" list can describe the
build we do NOT ship — and twice now the lead has forwarded one as an open problem.**

Measured proof (`docs/sealed/loco-ab4-key.md`, from the round-6 builder's re-measurement of
round 3's own sheets, in world mm):

| run, lowest figure pixel | plant ON (shipped) | plant OFF |
|---|---|---|
| phase 0.000 | −0.7 mm, planted | **+143.8 mm, both feet clear** |
| phase 0.500 | −0.7 mm, planted | **+143.8 mm, both feet clear** |

`critic-locomotion-4`'s #1 ("RUN's newly-found floating-feet defect") and #2 ("WALK's flatter,
block-like push-off") **both describe plant-OFF**. Nothing in walk or run was outstanding, which
is why the following round changed neither — and `critic-locomotion-5` then scored the piece
DOWN 61 → 57 citing that same non-existent defect as untouched.

**So, in every future A/B brief:** tell the critic its per-pair preference is the deliverable,
and that any defect it lists must be attributed to a NAMED VARIANT, not to "the piece". The
lead decodes attribution before forwarding anything into a build brief.

Two more instrument facts from the same key, both worth carrying:
- **The strobe's panel mapping is 0-BASED.** `char-locomotion.js` builds `phase: i/n` for
  `i = 0..5`, so left-to-right the panels are phases 0, 1/6 … 5/6 — the FIRST panel is phase 0.
  A critic counting panels 1-based reports every phase one panel late.
- **The pad under-reports PENETRATION and reports FLOAT at full strength.** An opaque pad clips
  a buried foot, so a 135 mm-buried boot photographs within a couple of pixels of a correctly
  planted one. A transparent pad was tried and is REFUTED by measurement, not merely rejected:
  the cyc floor is luma ~242 and the boot ~230, twelve units apart, so no opacity separates
  them. Headless truth lives in `footskate.mjs --gate` G6, where the camera cannot hide
  anything — prefer it over any pixel reading for grounding claims.

## 🔎 THE DOMINANT DEFECT CLASS: "IT EXISTS, SOMETHING IS IN FRONT OF IT"

Six times in two days a piece was reported as MISSING a feature, a brief was written to BUILD
that feature, and the feature turned out to already exist with something occluding it. **Check
occlusion before you author anything.** Every one cost at least a round:

| piece | reported as | actually |
|---|---|---|
| `hunter.2` socket | "reads as rainbow rods, not a hole" — 14 rounds | the bore was **plugged by capped cylinders** (`openEnded:false`); it had never rendered in project history |
| `room.ballroom` mirror | "reads as a different wall panel" | the plate was **off-screen at x 2.37**; two rounds of probe work aimed at an invisible object |
| `light.dark` corridor | "does not exist — one flat glow mesh" | **built since round 5**, hidden behind a `doorGlow` billboard 0.22 m in front. Deleting one decal: interior luminance std **5.4 → 74.2** |
| study cartouche plate | "shallow, no depth" | the plate **had never drawn a pixel** — behind the overmantel slab |
| `mat.robot` boot bar | "a black diagonal bar" | `roundedRectShape` returned a FILLED shape, so the "ring" was a solid card |
| `char.locomotion` alt gaits | "floating above the floor" | two of three were **buried below it**; an opaque pad clips a buried foot |

⚠️ **THERE IS A SECOND CLASS, AND `--pick` DIAGNOSES IT AS THE FIRST ONE IF YOU ARE CARELESS:
geometry that is not occluded but UNREACHABLE — outside the only view cone the shot has.**
`light.dark` was filed as occlusion twice and was actually this: a 3.4 m corridor behind a
doorway whose cone is 1.95 m wide at that depth (0.134 m of divergence per metre through a
1.62 m door). **The distinguishing test is the DEPTH SPREAD.** Occlusion puts a nearer surface in
front, so picks return a *different, closer* mesh; unreachable geometry returns the *same* mesh
at a flat distance, because you are looking at the panel around the hole. **A flat spread is not
proof of a flat object — it is equally the signature of never having sampled the aperture.**

**The tool that settles it in one run is `harness/evidence/_tmp_geoprobe.mjs --pick`** — a camera→pixel
raycast returning which mesh owns a pixel, plus an ASCII ownership raster. It found the plug,
the off-screen mirror and the buried corridor. ⚠️ It only works where meshes are NAMED:
`unit4h.js` and `hunter.js` name theirs, `src/gadgets/*` does not, which makes the gadget group
diagnostically blind and is worth fixing.

🚨 **AND THERE IS A THIRD CLASS THAT `--pick` GETS EXACTLY BACKWARDS, FOUND 2026-08-09 BY
`aperture-1`: GEOMETRY THAT IS SUBMITTED AND CULLED, AND GEOMETRY THE PROBE CANNOT SEE AT ALL.**
The exit-site "black aperture" was reported as `picks MISS`, which reads as "never submitted".
It was neither: the panel was submitted and **backface-culled**. Two independent blind spots,
both structural rather than incidental:
- **`--pick` cannot see an `InstancedMesh`.** It intersects `geometry.attributes.position` through
  `m.matrixWorld`, and an `InstancedMesh`'s `matrixWorld` is its PARENT's — every copy it draws
  lives in `instanceMatrix`, which the probe never reads. `wallinstances.js` draws **every
  pristine wall face in the house** that way, so all of them are invisible to it by construction.
  A MISS from `--pick` is not evidence that nothing draws there.
- **A raycast does not cull, so it reports meshes the GPU threw away.** On `?walls=legacy` the
  same pixels returned `x.ballroom.terrace_e.layer3` — a `FrontSide` plane being viewed from
  behind. The probe said "present" for the exact geometry that was not reaching the screen.
**`harness/scenarios/_ap1-who.mjs` is the version that answers the question**: it expands
instances, tags every hit FRONT/BACK against that material's own `side`, marks it DRAWN or
dropped, and prints **every** hit in depth order instead of the nearest one — which is what
separated "nothing draws here" from "something black draws here" (it named an `exterior.js`
mortar slab sitting 0.18 m in front of the wall at two of the sites).

**Corollary for briefs, including mine:** "X is missing, build X" is the most expensive
instruction in this project. Write "X does not reach the screen — find out why, then fix that."
Twice this week the instruction to *build* something sent an agent to author a duplicate of a
thing that was already there.

## ⚠️ A capture-integrity bug that could have corrupted any verdict (fixed r36)

`TextureLoader().load()` is async and nothing awaited it. An undecoded map samples opaque
black, and the chest decal's luminance keying turns black into **full ink** — so the unloaded
state was the *maximally-inked* state, and the chest rendered either as the 4Humanity wordmark
or as **a solid navy rectangle**, depending on load timing. Two shoots of the same view
genuinely differed (0.266% of pixels). It reads as a design choice, not a failure, so it could
have been judged and scored as one. Fixed two ways: a `uReady` uniform so the unloaded state
draws **nothing**, and an exported **`brandReady()`** that must be awaited before `markReady()`
in any view showing the decal. Cache key v1→v2. **If your view shows the brand mark, await
`brandReady()`, and byte-compare two shoots when a claim depends on the decal.**

## 🔧 `harness/mechanics.mjs` — NEW, and it is the tool the other four could not be

```bash
node harness/mechanics.mjs            # 11 checks, exits non-zero on failure
node harness/mechanics.mjs --shots --only animation
```

`shoot.mjs` asks "does it look right". `playtest.mjs` asks "does it respond once". **Neither
asks "does this mechanic still DO what it claims, over time, under real input"** — and all four
of the playtest bugs below lived exactly there. Four assertion families, each derived from one
of them: `travel()` (range of motion over a window — a limb frozen in its rest pose photographs
perfectly and travels zero), `worldPresent()` (the architecture is actually rendering, from six
anchors AND while walking), the advertised-control contract (every key on the game's own card
must produce observable change), and `underLoad()` (input contracts re-run with frames starved,
because the E/Q bug only existed there).

⚠️ **VALIDATE A TEST BY REINTRODUCING THE BUG. The first version of the slow-frame check
PASSED with the fix deliberately reverted** — it could not detect the defect it was written
for, because `page.keyboard.press()` sends keydown and keyup as two separate CDP messages and
whether a frame lands in the gap is a race the fast machine usually wins. It now dispatches
both events inside ONE synchronous `page.evaluate`, so no rAF can run between them; verified
FAILING with the bug and PASSING with the fix. **A suite that has only ever been run against
working code is not evidence of anything** — that is the fifth instrument-lies incident today,
and the only one that was caught before it was trusted.


---

# 🗜️ APPENDED 2026-08-10 (`diet-2`) — `HANDOFF.md`'s INSTRUMENT-HAZARD LIST, VERBATIM

🚨 **This is the confession log, complete, exactly as it stood at 95 KB.** `HANDOFF.md` keeps every
one of these twenty hazards as a rule you can act on in one line; the incident behind each — which
agent, which round, what it cost — is here, unabridged. **Nothing in this block was dropped from the
core; only the narrative was.** If you are about to trust a measurement, read this, not the summary.

## Instrument hazards (the rule; full case studies in `docs/handoff/instruments.md`)

Every one of these bit someone this week. The story — which agent, which round, how long it
cost — is in the appendix; this is only the rule that stops the next one.

- Captures lie: `ok` on empty/boot-splash/all-black frames, stale review PNGs. Check file size,
  content and timestamp on every capture, not just that a screenshot exists.
- ✅ Capture determinism was fixed 2026-08-05 (`docs/capture-determinism.md`). Any reference shot
  of an **animated** view taken before that date is at an arbitrary moment — re-take it.
- 🚨 **BUT THAT FIX IS CAPTURE-MODE ONLY AND `playtest.mjs` BOOTS THE LIVE LOOP, SO EVERY
  SCENARIO PIXEL A/B IS TAKEN IN THE ONE MODE IT EXCLUDES.** Fixed 2026-08-09 (`jitter-1`) with
  `harness/still.mjs` — `await hold(page)` / `await release(page)` around any capture pair, and
  **park + settle with the sim RUNNING before you hold**, because the camera is driven by an
  updater and freezing first leaves it behind. Floor **0.00%, |Δ| 0.000**. The dominant term was
  never the grain, it was `_liveLoop`'s **dynamic resolution**, which resamples the whole frame
  and is driven by what other agents are doing to the GPU. `docs/capture-determinism.md` §7.
- 🚨 **AND `still.mjs` IS A WITHIN-SESSION INSTRUMENT ONLY — A LIVE-LOOP A/B ACROSS TWO PROCESSES
  IS NOT BYTE-COMPARABLE, MEASURED 2026-08-09 BY `localise-1`.** Two runs of the *same unchanged
  build*, 15 parked stations, `renderScale` pinned to 1.0 before the first `hold()`, both bodies'
  meshes hidden: **0 of 15 frames byte-identical**, and `renderer.info.render.calls` moved 142 →
  145 at one station. `hold()` pins the four frame-variant terms; it cannot pin **how much sim
  time had elapsed when the station was reached**, and every integrated pose, debris count and
  pickup state rides on that. **For a before/after byte-identity claim use CAPTURE mode**
  (`shoot.mjs`, which appends `?capture=1`): two `game.play` shots taken in two separate node
  processes came back **byte-identical**, i.e. the 2026-08-05 determinism fix working exactly as
  documented. `still.mjs` for an A/B *inside* one page; `shoot.mjs` for an A/B *across an edit*.
  🚨 **AND `shoot.mjs` HAS NO `@vite/client` STUB, SO IT IS STILL EXPOSED TO ANOTHER AGENT'S
  SAVE — CAUGHT IN THE ACT, 2026-08-09.** One frame of `localise-1`'s 7-frame after-run came back
  with **99.1% of pixels different** (mean L 44.5 against 67.2, i.e. a different point in the
  Director's loop, not a corrupt frame). Timestamps name the cause with no ambiguity: that shot
  ran **20:55:01 → 20:55:56** and `seethrough-1` saved `src/game/wall.js` at **20:55:01.9**. Two
  re-shoots at 21:00 and 21:01 — which *include* that same `wall.js` change — reproduced the
  baseline **byte-identically**, so the difference was the RELOAD, never the content.
  **`playtest.mjs` fixed this for scenarios (`page.route('**​/@vite/client')`); `shoot.mjs` never
  got the same stub, and every critic capture in this project goes through `shoot.mjs`.**
  ✅ **FIXED 2026-08-10.** `shoot.mjs` now serves the same stub, and two things about the fix are
  worth keeping. **(1) The socket mock it already had was not enough, and the comment explaining
  why it was sufficient was wrong.** Measured on a harness-shaped probe (vite 6.4.3, an imported
  `src/` file saved mid-page): **no defence** → `{"type":"full-reload"}` received, document
  replaced, 2 navigations; **`routeWebSocket` only** → no message, document survived;
  **stub only** → no socket opened at all. So the mock does stop the *broadcast* path — but it
  leaves Vite's client alive, and that client also reloads when the socket **closes**, locally, via
  `vite:ws:disconnect` → `waitForSuccessfulPing()` → `location.reload()` (client.mjs ~L968). A
  mocked socket that survives 25 s may not survive 55 s, and nothing would have noticed. The stub
  removes the client entirely — no socket, no ping loop, no reload code — and must keep the real
  five exports (`ErrorOverlay, createHotContext, injectQuery, removeStyle, updateStyle`) or it
  re-breaks `room.study`, as the first empty stub did. **(2) The assertion was tested by making it
  fire**, not just by watching it stay quiet: forcing a reload before the shot fails the run
  (`2 navigations (expected 1)`), and clearing the page token after the shot **deletes the PNG**
  rather than leaving a plausible frame of the wrong moment. ⚠️ The navigation counter alone was
  not enough either — `framenavigated` travels over CDP while `page.evaluate` takes its own
  channel, and a probe run read `1` while its evaluate had already landed in the replacement
  document, which is why the in-page token exists. Validation by reintroduction: with **4
  `full-reload` broadcasts observed on an independent socket** during the capture, `wall.1.plaster`
  and `game.play --seconds 7` both came back byte-identical to their quiet baselines,
  `navigations=1`. ⚠️ Still unstubbed: `determinism.mjs`, `perf-ab.mjs`, `perf-spaces.mjs`,
  `perf-stall.mjs`, `measure.mjs`, `snapshot.mjs`.
- ⚠️ `grade.mjs` numbers are **not comparable across quality tiers** — every board figure was
  taken at `auto`/`high`. Grade at the tier the recorded number was taken at, or state the tier.
- Perf: `--extra "quality=medium"` only, discard the cold run, two consistent runs, never while
  another agent measures. Draw-call counts from `perf-spaces` are a single-frame snapshot and can
  swing widely — take a scene-graph census (visible mesh + triangle counts) instead.
- A probe that cannot observe must report SKIP, never PASS. If you assert something is on
  screen, look at a picture of it.
- 🚨 **PARALLEL AGENTS CORRUPT EACH OTHER'S PLAYTESTS THROUGH HMR, AND A PRIVATE PORT DOES NOT
  SAVE YOU.** A vite dev server watches the **whole project**, not the directory it serves — so
  when agent A saves `wall.js`, agent B's page reloads **mid-shader-compile** even though B
  spawned its own vite on its own port. Found 2026-08-08 by `audio-3` while three agents ran
  concurrently: one run failed to reach ready inside **180 s**, and the cause was another agent's
  saves, not the load. **Fix: inject the `@vite/client` stub `playtest.mjs` already uses**, and
  confirm "one uninterrupted session · 1 navigation" in the output — that assertion is what
  catches it. ⚠️ **And treat the documented 75–115 s load as a quiet-machine figure only**;
  under concurrent GPU load it is not a ceiling. Raise the wait rather than declaring a hang.
- 🚨 `renderer.info` does **not** reset unless the engine loop runs it — a probe calling
  `pipeline.render()` directly will see `calls`/`triangles` accumulate across frames, which can
  read as a catastrophic linear "leak" that is really just an un-reset counter.
- ⚠️ `onBeforeCompile` hands you the shader with its `#include`s still unresolved — a string
  replace aimed at text **inside** a chunk matches nothing, fails completely silently, and the
  result just looks a bit darker. Only line-level `#include` (or `void main() {`) replacement
  works; assert the match landed rather than hoping.
- 🚨 **AN OFFLINE RENDER RUN INSIDE THE LIVE GAME IS BEING OVERWRITTEN BY THE LIVE GAME, EVERY
  FRAME.** `audio.js`'s `_renderOffline` swaps the module's context and awaits rendering across
  many frames — during which `views/game.js` calls `setHunterThreat` **on every one of them**,
  stamping over the test's own automation. The same call measured peak **0.0925** on a blank page
  and **0.0079** inside `game.play`: an **11.7× under-read** that `_audio1-wiring.mjs` had been
  passing on for days. Fixed with a render lock. **The general form: any probe that drives state
  the running view also drives is measuring the view, not the probe.** Prefer a blank page, or
  lock the state you are testing.
- Every A/B needs a same-config control pair. "Byte-identical" is an impossible test and must
  never be demanded as proof — the correct proof is "inside the same-config noise floor."
- 🚨 A rejected promise **anywhere** paints "VIEW ... FAILED" over the whole game
  (`unhandledrejection` in `main.js`). Catch any promise-returning browser API you add to a view.
- ⚠️ `status.mjs --wins` **replaces**, it does not append, and pieces are routinely BUILDING
  under another agent while you write. Re-read a piece immediately before writing to it.
- 🚨 **THE HARNESS HAS TWO NAMES FOR "EXTRA QUERY STRING" AND AN UNKNOWN FLAG IS SILENTLY
  IGNORED.** `playtest.mjs` (and therefore every `harness/scenarios/*.mjs`) takes **`--q`**;
  `shoot.mjs`, `perf-spaces.mjs` and `perf-ab.mjs` take **`--extra`**; `mechanics.mjs` takes
  neither and always boots the default build. Passing `--extra` to a scenario does not error —
  the run just happens on the default arm, and the checks that needed the flag report **SKIP**,
  which in a tail reads as "nearly a pass". Found 2026-08-08 by `estate-1`: `escape.mjs` read
  19/1-skip and `dig-free.mjs` 5/1-skip until they were re-run with `--q`, where they are 20/20
  and 15/15. **The scenarios' own hint strings ("try seed=s4", "re-run with --q dig=1") are the
  only thing that catches it — read them, do not skim them.**
- ✅ **`lint-glsl.mjs` used to scan ONLY literals tagged `/* glsl */`, and the sixth backtick outage
  was in one that is not** — `breakmask.js` assembles its fragment shader in a PLAIN template
  literal inside `onBeforeCompile`, a comment there quoted an identifier in backticks, the whole
  dev server went down, and the gate printed "glsl literals clean" on that exact file. **Fixed
  2026-08-08:** the matcher now also catches any template literal containing `gl_FragColor`,
  `#include <` or `void main`. ⚠️ **And the fix itself broke the build twice before it was right** —
  it false-positived on legal nested templates (`` ${dmg ? `…` : ''} ``), because a backtick inside
  `${…}` opens a NESTED template and does not terminate the outer literal. It now carries a
  persistent interpolation counter. **The lesson is the general one: a false positive in a build
  gate is worse than the bug it was written for, because it blocks everyone and it teaches people
  to bypass the gate.** Validate a widened gate against the code it must NOT flag.
- ✅ **AND THEN INCIDENTS SEVEN AND EIGHT PROVED PATTERN-MATCHING CAN NEVER FINISH THIS JOB, so
  `lint-glsl.mjs` NOW PARSES EVERY FILE.** Both were in `harness/strobe.mjs`, in an ordinary JS
  template literal holding browser code with no GLSL in it at all — and `walk()` only yielded
  `.js`, so the entire `harness/` tree of `.mjs` had never been scanned by anything. Pass 1 said
  "clean" both times, correctly by its own rules and uselessly in practice. **Pass 2 is the
  parser itself**, over every `.js`/`.mjs` in the repo: it answers the real question ("does this
  file parse"), it cannot false-positive on valid code, and it subsumes all eight incidents.
  ⚠️ It uses **esbuild** (already present via vite) rather than `node --check`, which spawns a
  process per file and cost **6.5 s against a 2.5 s build** — a gate more expensive than the
  thing it guards gets skipped. Falls back to `node --check` if esbuild ever goes missing, so it
  can never silently stop checking. Whole repo, 367 files, ~2 s.
  **Validated by reintroducing the bug**, per this file's own rule — confirmed FAILING with a
  backtick in `strobe.mjs` (exact file and line reported) and PASSING once removed.
- ⚠️ Check `--at` beyond the default capture instant (t≈0.20 s) before judging any moving part —
  a bug can be exactly wrong at every default-time capture and never once get caught by it.
- A view can prime an effect on a timer that fires **after** the capture already happened. Check
  scheduled timers against the capture instant before trusting a verdict.
- The `rrr-pipeline` skill carries the GLSL-specific trap list (backticks in template literals,
  reserved words, fbm normalisation both forms, Edit over scripted replacement) — read it before
  touching any shader.
