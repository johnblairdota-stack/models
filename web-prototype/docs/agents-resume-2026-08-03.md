# Agent resume pack — written 2026-08-03 ~15:00 as John's usage limit approached
## Limit hit ~15:10; resets 6pm Brisbane.
- **logo-build died EARLY, still in its read/assessment phase** (last words: checking
  shellWhite/colour table/hunter redress) — expect few or no edits on disk; safe to respawn
  its brief nearly fresh.
- **motion-1-build died while capturing its "before" baselines** ("capturing the true
  before of the station view now, before I touch the view file") — expect zero or minimal
  edits to locomotion.js/player.js; respawn essentially fresh.
- **game-feel-2 died partway with REAL work landed** (from John's captured transcript):
  (a) **item 3 HUD priority model IS DONE** — hud.js edited +65/−5 then +12/−4 updating
  callers with ranks; verify, don't redo. (b) a +261-line diagnostic scenario file was
  created (find it in harness/scenarios/). (c) **playtest.mjs gained the HMR-mock fix**
  (+51 lines) that shoot.mjs got — another agent's edits were destroying its measurements;
  this is an instrument fix, keep it. (d) It died just before the item-1 "before"
  measurement of both opening routes — items 1 and 2 (route-fragile opening, inconsistent
  lethality) are NOT started beyond the diagnostic scaffolding. Its own baseline lesson:
  its first mansion gate run was corrupted by its own mid-run file edit; re-run cleanly
  with no edits in flight.

**How to use this:** when usage resets, respawn each "IN FLIGHT" agent below with its brief
plus this preamble: *"Your predecessor may have been killed mid-task by a usage limit. Its
file edits survive; its reasoning does not. Do archaeology first: check `node
harness/status.mjs get <piece>`, inspect the owned files for fresh edits, capture current
renders, and verify `npx vite build` compiles — then continue the brief from what is
actually on disk."* All standing rules live in HANDOFF.md (read it first; it is current).

Concurrency: John approved up to 5–6 when budget allows; budget mode = ~3, batch critics,
Sonnet for decided work. Only critics award WOWED. One GPU perf measurer at a time.

---

## IN FLIGHT at time of writing (may die mid-task)

### 1. motion-1-build (Opus) — foot plant + reaction layer
Owns: src/game/locomotion.js, reaction-wiring lines in src/game/player.js, char.locomotion
view. Brief: work docs/design/motion-hil-assessment.md in order — (1) Stage 1a foot plant:
stance-foot horizontal velocity at contact must drop from measured 3.0–4.75 m/s (walk) /
6.7–10.15 (run) to <0.5 m/s, verified by tracing j.ankleL/R world positions per frame
(drive engine._step() in a loop from the browser); no pops at stance/swing handoff; test
multiple speeds + limp gait. (2) Stage 1 reaction layer: per-channel Springs (hips/spine/
chest/neck + four limb roots ×3 axes), impulse(channel, vec, gain), additive pass at end of
Gait.update(); first caller = player.js rig onChange('detach') kick away from lost side;
fold the existing `_list` layer in (stacking two reads as wobble). (3) char.locomotion view
staging: TURN's real 16° bank invisible at near-head-on camera; ONE-LEG lists only −4.1°,
must sell desperation; add --extra paths for crawl/skate/down (never rendered). (4) optional
Stage 2 slice: balance scalar + STUMBLE. Verify: before/after skate numbers; UNLABELLED A/B
strobe sheets for a blind critic (private key in report); playtest game.play 8/8; CPU flat.
Prior verdict: char.locomotion WEAK 41 (critic-locomotion-1) — its report has the exact
measurement method.

### 2. logo-build (Opus) — 4Humanity wordmark chest swap (JOHN'S DIRECTION)
Owns: src/characters/unit4h.js, src/materials/surfaces/robot.js, char.turnaround +
mat.robot views. Brief: replace the split-head emblem on the wearer's left pec AND the back
mark with the 4Humanity text wordmark from `..\Dev Art\1785276265860.png` (navy; hollow
triangular 4 SHARING ITS STEM with the H — the ligature is the logo; "umanity" rounded
geometric sans, tight tracking, dotted i, y descender). robot.js ~line 826 already has a
procedural wordmark variant — assess its fidelity vs the art first (crop-measure letterform
proportions), redraw if off. Seat as a print on the curved chest (brandDecal; round 34
fixed its AO halo — vertical-scan dip must stay <1.0). Update mat.robot's shell specimen to
the wordmark. Decide + report the corrupted hunter's chest treatment. Gate: IoU holds 86.4%
card (--refband 0.12,0.96); regression char.turnaround, hunter.3, gadget.nailgun,
limb.detach, mat.robot; buildUnit4H exports stable. HANDOFF's "Direction from John" block
tells critics to judge wordmark fidelity, not file the swap as a defect.

### 3. game-feel-2 (Opus) — fairness round on play-critic-3's list
Owns: src/game/spaces.js (PATROL_ROUTE), src/game/hunter-ai.js, src/game/room.js if needed,
src/ui/hud.js, harness/scenarios/mansion.mjs. Must NOT touch locomotion.js/player.js
(motion agent) or unit4h/robot.js (logo agent). Brief, top-down: (1) route-fragile opening —
extend A5 with a 4th waypoint into study_e (the natural route), reproduce the critic's
19s-ALERT/30s-death, then fix (likely PATROL_ROUTE data) until first ALERT ≥20 s on BOTH
routes; the gallery distant-hunter sightline beat must survive. (2) DIAGNOSE inconsistent
close-quarters lethality: 4 identical 5m-PURSUE trials ranged from clean 9s escape to
unavoidable 300ms kill (post-death contamination ruled out by critic's A/B); instrument the
attack pipeline (same-frame ATTACK strike on first entry / undefined _swing is an old
suspect), fix to telegraphed+learnable, verify variance collapses over ≥6 identical trials.
(3) HUD say() priority: wound/death messages outrank place captions (observed stomping).
(4) optional: two lines of world-rules on the gate card. Gate: full scenario suite
(feel-a/b/c, look-tells, mansion) no regressions. Prior verdict: game.play WEAK 52
(play-critic-3, round 6).

---

## PAUSED BY JOHN, 2026-08-03 ~21:00 — "pause starting new agents"

No new agents until John says otherwise. At the pause: `motion-2-build` and `sense-tuning`
were left running to completion; `hunter-owner` was **killed by John during its read phase**
and **landed NOTHING** (hunter.js mtime 00:36, hunter views 09:46 — all predate it; build
verified green after). The hunter group is therefore **completely un-started** — its full
brief is in the QUEUE item below and can be respawned verbatim.

## QUEUE after the above (in order)

4. ~~Solo game.play perf measure~~ **DONE by the session lead, 5 runs on a quiet machine —
   and it found the GATE is wrong, not the game.** GPU 1.15–2.09 ms, calls 122–409, same
   build; the spread is portal residency (cheap chapel spur vs expensive ballroom hub), not
   contention. See HANDOFF's "game.play PERF" block. **New task for the perf owner: build a
   per-space worst-case measure** (park at each `room.anchor()`, gate on the ballroom) —
   `--at` is unusable (freeze skips updaters). Until then game.play's budget status is
   unproven; the ballroom likely fails.
   **UPDATE — the tool is BUILT and the cause is FOUND.** `harness/perf-spaces.mjs` exists
   and works. Every space is ~2× over budget and they are all alike (2.47–3.03 ms); the
   hunter costs only 12%; the chapel drew 93 calls / 32k tris and still cost 2.22 ms. It is
   **the AO pass**: `ao=0` drops the worst to 1.12 ms (inside budget). Further ablation PROVED
   it is **not** the AO shader's resolution — `aoScale` 0.30→0.10→0.05, a 36× pixel cut, moved
   the worst 2.89→2.55→2.90 ms, i.e. nothing. Suspicion falls on the full-res depth prepass
   (`pipeline.js:265/:359`, a duplicate scene traversal `aoScale` never touches), but that is
   **inferred from source, NOT isolated by measurement** — separate prepass-fill from
   prepass-traversal from the blurs before optimising. ⚠️ **Landmine documented in HANDOFF:
   `uTexel`, `uAOSize` and a hand-tuned `*2.0` are coupled, so shrinking `depthRT` changes how
   AO LOOKS — either normals degenerate or the radius widens ~3.3×. It needs a critic's
   before/after eyes, not just a faster number**, which is why it was left unpatched rather
   than fixed blind. Full detail in HANDOFF's "game.play PERF" block. Single most actionable
   perf item in the project; it invalidates the premise of past draw-call optimisation rounds.
5. **Batch critic B (Sonnet, ONE agent):** char.turnaround + mat.robot as critic-robot-35
   (round 34 + wordmark: hip bearing removed, seams finally drawing after the winding fix,
   chrome floor, boot welt + ankle bearing, decal AO fix — all unjudged), six gadgets as
   critic-gadget-3 (mount work + finisher landed, scores stale: 52/44/33/45/60/58), and the
   wall/material stale re-critiques (walnut figure rebuild, wall.transition floor fix,
   mat.marble/wallpaper/brass). Also blind-judge motion-1's A/B strobe sheets if its report
   left the key.
6. **Play-critic-4** after game-feel-2 lands.
7. **Hunter group, ONE Opus owner** (unit4h is stable once logo lands): stage-1 eye
   0xE8342B→blue one-liner; hunter.3 perf 1018→625 calls; stage ramp (grime spends the ramp
   before it starts); hunter.2 torn socket reads as rainbow rods; silhouettes upright→
   gorilla→low quadrupedal; graftedArm consolidation (it lives in hunter.js); then
   hunter.sheet + hunter.absorb builds. Then Stage 3 of the motion plan (real quadruped
   gait for stage 3) — see docs/design/motion-hil-assessment.md.
8. **char.detail + char.poses** (plans: docs/slices/task-char-detail.md, task-char-poses.md).
9. **mat.lath** build; **marble shader compile optimization** (~50 s off cold loads).
10. **Net client wiring** into game.js + two-client playtest (after the game loop settles).

## Known open policy/state notes
- Estate scores after critic-estate-3: study 58 · shaft 62 · dark 64 · chandelier 58 ·
  ballroom 64 · gallery 60. Next estate round: gallery chroma 0.260 vs 0.20 ceiling, study
  panelling relief + cartouche, chandelier bulbs, shaft window glass blown white up close,
  ballroom mirror reads weak. mat.plaster 62 (lath cage breakthrough verified 22.28% A/B;
  remainder: horizontal-field crops still read printed, debris band, far leaf visibility).
- light.dark median: full concession ruled; toe gate 2–8 is the guard. Candlelit chroma
  ceiling 0.20; daylit 0.14.
- game.play grade: historical numbers measured the Play-gate scrim; capture fixed today
  (HMR-reload race, shoot.mjs mocks its own HMR socket + throws on mid-capture navigation).
- Zombie vite processes on :5178 from dead waves cause injectQuery SyntaxErrors — clear them.
