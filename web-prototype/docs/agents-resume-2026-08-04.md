# Agent resume pack — session limit 2026-08-04 (resets 4am Brisbane)

## ✅ VERIFIED AFTER THE KILLS — three of the four had ALREADY LANDED their work

Checked on disk by the lead. **Do not redo these; verify and continue.**

- **game-feel-4's camera fix is COMPLETE and passing 11/11.** Its last message said it had not
  yet reproduced the defect; that was stale. `harness/scenarios/camera-wedge.mjs` runs a
  488-solve survey over every jamb, corner, pier and passage wall, and ablates each clamp:
  pre-fix **56/488 blind, 56 in-geometry** → shipped **2/488 blind, 0 in-geometry**. It also
  self-validates by reverting all three clamps in-session. Only fix the lead applied: `waitFor`
  was missing from the scenario's destructured API (one word).
  ⚠️ **It disproved `play-critic-5`'s own suggested knob.** Capping `MAX_LIFT` would have bought
  almost nothing (measured: 0.175 m of lift, ~5° of tilt). The real cause was `HARD_MIN`, whose
  comment was exactly backwards — `clearAt` has ALREADY subtracted the standoff, so clamping up
  to 0.42 pushed the camera **0.30 m past the surface**. The floor that existed to prevent
  penetration WAS the penetration.
- **hunter-owner-2 built `hunter.sheet`** — the group's last NOT_BUILT piece. 128 lines, no
  stub, 1.7 MB capture, and it reads: clean player → amber-eyed stage 1 → hunched sooted stage 2
  with the shoulder port → six-armed two-headed stage 3. Both overturned facts render correctly
  (stage 2 keeps both arms; stage 3 is an upright biped). Marked BUILDING, correctly unscored.
- **motion-4-build left sealed A/B sheets** at `progress/shots/loco-ab4/` with
  `docs/sealed/loco-ab4-key.md`. Its work was essentially done — it died writing HANDOFF.
  A blind critic can judge these as-is.

Still genuinely NOT_BUILT across all 37: **`mat.lath`, `char.detail`, `char.poses`** (the last
two have finished plans in `docs/slices/`).


**Four agents were killed mid-task.** Tree verified AFTER the kills: `npm run build` green
(GLSL lint passes), `harness/mechanics.mjs` **11/11**. Their file edits survive; their
reasoning does not. **Do archaeology first** on every one: inspect the owned files for fresh
edits, capture current renders, and continue from what is actually on disk.

Preamble to give each respawned agent, verbatim:
> Your predecessor was killed mid-task by a usage limit. Its edits survive; its reasoning does
> not. Inspect the files it owned, capture current renders, verify `npm run build` compiles,
> and continue from what is on disk. If a stated fact turns out wrong, say so rather than
> diverging silently.

---

## KILLED MID-TASK — respawn these

### 1. motion-4-build (Opus) — **THE CONTRADICTION, highest value**
Owns `src/game/locomotion.js`, `src/views/char-locomotion.js`, `harness/footskate.mjs`.
Died at: "Now updating HANDOFF in place, replacing the stale char.locomotion section" — so its
work was essentially COMPLETE and only the writeup was lost. **Read what it changed before
redoing anything.**

Its job was a genuine contradiction in `critic-locomotion-4`'s report (piece now WEAK 61):
- The critic **verified the limp fix numerically to 3 decimals** (foot pitch 33.43° → 11.69°
  at 1.69 mm sole contact, phase 4/6) and **still judged the planted limp sheet as showing the
  ballet toe-point**, high confidence.
- It also reported plant-ON's foot "visibly floating" at phase 5/6 while plant-OFF "stays
  connected" — **backwards**: plant-OFF is the gait that penetrates the floor (−65 to −90 mm).
Candidates: (a) sheets captured from a stale build; (b) the strobe's phase index does not map
to the measured gait phase; (c) the floor pad's horizon sits wrong for the limp station;
(d) a residual limp defect at an unmeasured phase.
Decoded round-3 A/B (lead only, do NOT put in a critic brief): walk plant-ON **won**, run
plant-ON **won** (up from indistinguishable — the new floor pad exposed plant-OFF's feet
leaving the ground), limp plant-OFF won. Key: `docs/sealed/loco-ab3-key.md` (builders may read).

### 2. estate-owner-6 (Opus)
Owns the six estate views + rig.js GRADES entries, props.js, chandelier.js, materials-local.js.
Died at: "Now the charges, crown and mantling" — i.e. mid-cartouche.
Scores after `critic-estate-4`: study **57** · shaft **61** · dark **62** · chandelier **66** ·
ballroom **65** · gallery **64**. Its brief: (1) study BACK WALL only — bays 6→10 over-corrected
into a grid of small squares; (2) shaft floor rosette over-scaled, reads as cracked ice;
(3) `light.dark`'s "lit corridor" is one uniform `glow` mesh (luminance std 5.4) — model it or
stop claiming it; (4) study cartouche needs crown + mantling + legible charges (the art has
them, the render has a plain shield and two scratch lines); (5) chandelier flames unverifiable
at shipped camera distance — resolve, reframe, or state the limit honestly; (6) ballroom mirrors
are in frame but reflect an unidentifiable dark blob; (7) gallery chroma 0.143 (WARN, low
priority). **Do not regress:** chandelier centrepiece facets, shaft lancet glass, study floor
veining + tapestries, dark's chroma geometry fix, gallery's distinct sitters, and the `dist/`
material fix.

### 3. hunter-owner-2 (Opus)
Owns `src/characters/hunter.js` + the five hunter views.
Died at: "All restored. Now the final captures and the verification measurements." — work
likely landed, verification lost. **Re-capture and re-measure before trusting it.**
Scores after `critic-hunter-2`: hunter.1 **56** · hunter.2 **63** (was REJECT 27, worst on the
board) · hunter.3 **58** · hunter.absorb **50** · hunter.sheet NOT_BUILT.
Its brief: (1) stage-1 posture does not READ as a midpoint though it measures as one — a 28°
lean toward the lens foreshortens away; add cues immune to that (head-drop, rolled shoulders,
knee bend) or overshoot for this camera; (2) hunter.2 is measurably narrower than the art
(IoU 75.2%, deficit almost all art-only mass) and the port reads "too tidy"; (3) hunter.3's
rider is a fused second head, not the hero art's distinct absorbed TORSO with gripping arms;
arm splay too narrow; (4) hunter.absorb's port glow washes the whole body pink — the critic's
highest-value note; flying arm has no motion cue; stump under-sold; (5) hunter.sheet still
NOT_BUILT. **Do NOT re-open the arm question** — both arms confirmed correct against the art.

### 4. game-feel-4 (Opus)
Owns `src/game/player.js` (`ThirdPersonCamera`), `src/ui/hud.js`, `harness/scenarios/*`.
Died at: "The staged teleport isn't reproducing the critic's frame faithfully. Let me capture
the A/B from a real driven walk instead" — i.e. it had NOT yet reproduced the defect. Expect
little landed; respawn nearly fresh.
`play-critic-5` filed `game.play` **WEAK 68** (up from 58) and confirmed every prior item
fixed. Remaining: (1) the camera collapses to an unreadable macro close-up when you brush
geometry — hit twice by two navigation styles, and re-aiming at your goal does NOT free you;
⚠️ a hard-minimum boom was already tried and rejected ("the frame becomes a black slab"), so
cap `MAX_LIFT` and/or give a one-time cue instead; (2) wayfinding in a dark mapless mansion —
no minimap (deliberate); (3) minor: one confusing readout at a 90 ms E/Q tap.

---

## THE BIGGEST OPEN ITEM IS A DESIGN DECISION FOR JOHN

`play-critic-5`: the game now has a real horror beat and a fair chance to run, but **no
objective and no win condition** — "no shape as a game". That is the largest thing between a
good scare and a game, and it is John's call, not an agent's. Ask before building it.

## Queue after the four above
`critic-estate-5`, `critic-hunter-3`, `play-critic-6`, a blind `critic-locomotion-5` on
whatever A/B sheets motion-4 leaves (key sealed, never in a critic brief) · `char.detail` +
`char.poses` (plans exist, Sonnet, cheap) · `mat.lath` · the walls/materials re-critiques ·
the AO depth-prepass perf fix (game.play is ~2× over budget in EVERY space for a
resolution-independent reason; landmine documented in HANDOFF) · plaster round 5.

## Standing rules
`npm run build`, never `npx vite build` (the npm script lints GLSL literals first — that trap
took the build down four times in two days). Only critics award WOWED; builders never score
their own work. One owner per coupled concern. One GPU perf measurer at a time. Every brief
carries "if a stated fact is wrong, say so rather than diverging silently" and "validate an
assertion by breaking it once" — between them they have overturned a dozen false facts and
five lying instruments, including three of the lead's own.
