# HANDOFF archive — pre-prune 2026-08-07

This is history, not fact. It is the material cut from `HANDOFF.md` during the second diet
(`handoff-diet-1`, 2026-08-07/08 — see `docs/slices/task-handoff-diet.md`). The first prune is
`docs/archive/handoff-pre-prune-2026-08-03.md`.

**Nothing here is current.** Current facts live in `HANDOFF.md`'s core; reusable lessons and
domain write-ups live in `docs/handoff/*.md`. What's collected here is: (a) round-by-round
narrative superseded by later rounds in the same file, (b) status snapshots superseded by later
status snapshots, (c) the old `## Queue` section's connective tissue and duplicate write-ups
(the same round often got written up twice — once inline as it landed, once again in the Queue
rewrite — and the fuller version moved to a `docs/handoff/*.md` appendix while the shorter
duplicate stayed here), and (d) items whose own successor block says outright that they're
stale.

⚠️ **Read `docs/handoff/*.md` first.** If you are here because a pointer sent you looking for a
specific fact, check that the fact isn't actually current — the whole reason this file exists is
that other things superseded it.

---

## 1. `## Where it stands — 2026-08-03 afternoon` (the old top-of-file status table)

Superseded by the 2026-08-07 "Where it stands" block at the top of `HANDOFF.md`, which is itself
marked `<!-- board: pending board-audit-2 -->`. This table's scores are from 2026-08-03 and the
board has moved several times since (see `docs/handoff/estate.md`, `hunter.md`, `gadgets.md` for
what actually happened after this was written).

## Where it stands — 2026-08-03 afternoon

**0/37 WOWED. Every score on the board is now critic-owned** (all builder self-scores have
been purged and re-judged this campaign). Two full agent waves were killed mid-task by API
session limits (5:30am and 12:50pm resets) — when resuming any piece, do archaeology first:
the dead agent's file edits survive, its reasoning does not, and the build was verified
green after both massacres.

Current critic scores and active loops:

| group | state |
|---|---|
| mat.plaster | **WEAK 52** r3. Round 4 in flight: the art's "3D lath cage" has failed 3 rounds / 2 techniques (wall-anchored protrusion, then 29.5° obliquity — refuted by its own `flat=1` A/B, near pixel-identical). R4 has design authority for free-board construction / staging / raking light. Acceptance test: the flat=1 A/B pixel delta. |
| char.turnaround | **WEAK 60** r33 landed, awaiting critic-robot-34. IoU 86.5% card (`--refband 0.12,0.96` mandatory). Daylight coverage fig4 55% = sheet; fig1 43% vs 75%; hip band +24% at 0.545 H; chrome range 135 vs 181; GPU **1.8 ms vs 1.39 budget** (open). Draw calls 608/625. |
| mat.robot | **WEAK 42** r33 landed (boot specimen rebuilt from real buildUnit4HBoot; sole arch + ankle collar bugs fixed — the collar had drawn inside the boot forever). Awaiting critic-robot-34. |
| estate (6 pieces) | `critic-estate-10`: ballroom **PASS 85** (r10, highest score in project history) · gallery **75** · shaft **74** · chandelier **72** · study **65** · dark **65**. 🎥 **`estate-owner-13` HAS SINCE REFRAMED THE BALLROOM (r13) — BUILDING/UNSCORED, needs `critic-estate-11`.** The critic's #1 was a CAMERA hate and it is worked: new permanent **`?cam=overlook|r10`**, default `overlook`, and `?cam=r10` reproduces the filed gate to two decimals so the revert is one parameter and every historic number stays checkable. Frame composition, measured by ray-casting every pixel at the room box: floor **30.5 → 40.3%**, ceiling **20.7 → 3.7%**, room corners in frame 3 → 4 — **so the flat-ceiling item is now worth nothing, and the room still reads its scale (the 1.7 m robot subtends ~144 px vs ~145 px before).** The paper litter is **legible and proven by ablation** rather than by projection count. ⚠️ **The near wall (z +8) was HALF A WALL — one storey with 4.8 m of void above it — and only the old camera hid it.** ⚠️ **NOT DONE and it is the next round's first item: the FLOOR MATERIAL half of the composition ruling (the bar is mostly wood parquet; ours is checker edge to edge).** See the `estate-owner-13` section. Previously: **`estate-owner-12` rebuilt the ballroom (r10) — BUILDING/UNSCORED (the board reads 12% because a builder may not score itself; the r9 PASS 82 is preserved in `history`), needs `critic-estate-10`.** It worked all three of `critic-estate-9`'s items and **the macro-variation gap is now measured, attributed and mostly closed: ~95% of the light on that floor was a STRUCTURELESS FIVE-BOX IBL SHELL, which is what "evenly lit" actually meant** — see the `estate-owner-12` section. Lit-floor 32-px macro **0.589 → 0.819 against the art's 0.817**; whole frame **0.662 → 0.794 vs 0.780**. ⚠️ **19 point lights cost 47% of that frame and contribute UNDER 1% OF ITS LIGHT — measured by turning all of them off (78.3 → 77.7 mean on the lit floor).** Also: the plate-parity hate was a 7:1 point-sampling bug and the near third of the floor was a mirror of a structureless IBL — see the `estate-owner-11` section, which also carries the measured answer to "identifiable as a render" (grain, micro-contrast and edge width are AT PARITY with the art; macro variation and the empty room are not). ⚠️ **The ballroom's 2.24 ms is ATTRIBUTED and it is NOT the mirror — it is 19 point lights (−1.10 ms of a 2.33 ms frame). `room.gallery` is WORSE at 3.32 with 33 lights. The SHIPPING game does not share it (fixed five-light rig), so this is a showcase-rig property, priced but not unilaterally cut.** `light.dark`'s remaining gap is an **accepted honest limit** (the corridor floor subtends ~8% of the aperture and the doorcase covers it — not solvable without moving the camera; do not chase it). The chandelier's print ambiguity is **resolved** — 0.139 clears both the strict 0.14 and the ruled 0.20 candlelit ceiling. Candlelit chroma ceiling **0.20** (daylit 0.14). |
| game.play | **BUILDING r12, UNSCORED — THE EXIT IS A SIEGE AND IT IS AUDIBLE** (escape-owner-2, 2026-08-04; see "THE EXIT IS A SIEGE NOW" at the top). Opening one runs **15.5–25.1 s** where it was 0.5–1.3 s, every stage transition is heard across the whole house, the victory modal no longer goes up over a live WINDDOWN, and the exit pool is **14** rather than 4. Previously **WEAK 64** r11 (play-critic-7) — its three findings are the three things this round worked, so that score is stale. Needs a PLAY critic. Before that: **BUILDING r10** (escape-owner-1; see "THE WIN CONDITION IS BUILT" below). Escape, one seeded live exit per run, three chained decoys, a time-to-escape score and a win screen. `play-critic-5` finally has a loop with a shape; the doc's own §3.1/§3.3 sites were refuted by measurement. Previously **WEAK 58** r9 (play-critic-4) — **stale as of 2026-08-04**: its #2 "once caught, death is near-instant" was answered (fleeing works; the defect was that the commit was invisible — see "FLEEING WORKS" below) and its #5 boot ghost is fixed. Needs play-critic-5. Mansion: | **M1–M4 geometry, AI and assertions LANDED** — all six spaces, D1–D7, 8 panels, full patrol route, chapel spur, `hud.setPlace`, capture Director rewritten. `mansion.mjs` now implements A1–A12 (A1–A7 previously *vanished* rather than skipped once the sixth space landed). **Two things are NOT done: the §12.3 grade gate cannot be measured (see below) and the perf gate FAILS.** Ready for play-critic-3 on feel; not on grade. |
| gadgets (6) | **`critic-gadget-5`'s board: sheet 75 (highest in the project) · nailgun 72 · grapple 68 · oil 64 · ball PASS 60 · skates 60.** `gadget-owner-7` then rebuilt **skates, grapple, nailgun and the sheet — all four BUILDING/unscored and needing `critic-gadget-6`**; see the gadget-owner-7 section below. The skates' missing ground trail is BUILT, the "tame lean" was a wrong-axis bug, and the grapple's rest-cable hate looks refuted by measurement. Core idea: a gadget is a REPLACED LIMB, not a held prop. |
| hunter (5) | **critic-hunter-2's list worked 2026-08-04 (hunter-owner-2); all five re-rendered and UNJUDGED — the scores below are stale and the audit flags them.** Last critic round: hunter.2 **27 → 63**, .3 43 → 58, .1 42 → 56, .absorb new 50. This round: stage 1's posture ruled NOT ACCEPTABLE and fixed (it is now a midpoint in **stature loss**, 48% of stage 2's, measured in metres — see below); stage 2 widened to the sheet (**IoU 73.7 → 76.7%**, shoulder −5.5% → +3.6%, hips −10.1% → +1.0%) and its port roughed and stained; stage 3's rider rebuilt as a visible absorbed-player torso and the six arms cranked out and down (**IoU 79.1 → 81.5%**, 486 calls held); `hunter.absorb`'s pink wash killed (belly r−b **+9.3 → −1.6**), motion trail and a real wound added; **`hunter.sheet` BUILT** — the group's last NOT_BUILT is gone. Needs `critic-hunter-3` on all five. |
| walls (7) | wall.sheet PASS 78 (stale) · stages WEAK 52–66 · transition WEAK 65 (stale — its silently-black floor was fixed today). All need re-critique. |
| materials | marble 55 · walnut 48 · wallpaper 52 · brass 44 — all stale; walnut's figure contrast was rebuilt today (+64% structure). mat.lath NOT_BUILT. |
| char.detail / char.poses | NOT_BUILT. Finished plans exist: `docs/slices/task-char-detail.md`, `task-char-poses.md`. |


---

## 2. `## Landed today (verified, keep)` (2026-08-05 narrative)

Camera-tool landing narrative, mansion M1-M4 build notes, materials notes, and a net-wiring
status note ("`src/net/client.js` is still NOT wired into `game.js`" — this fact may still be
true; check `src/net/client.js` directly rather than trusting this archived copy). Superseded as
current status by everything that landed after it; kept for the trail.

## Landed today (verified, keep)

**Camera tool (camtool-1, 2026-08-05) — `?orbit=1`, the readout, `?campose=`/`--cam`. TOOL, no
board entry.** `src/views/_studio.js`'s `studio()`/`estate()` (shared by every `mat.*`, `room.*`,
`prop.*`, `light.*`, `wall.*` and `char.*`/`hunter.*`/`gadget.*`/`limb.*` view) already had
`OrbitControls` wired in from some earlier, undocumented pass — this round finished the job
against the brief: gated it behind an explicit **`?orbit=1`** (was: on by default in any live,
non-capture page load — nobody had asked for that and it is now off by default, matching every
prior session's behaviour), added the **paste-ready `cameraPos`/`target`/`fov` readout with a
copy button**, ported `harness/_eo13_cam.mjs`'s per-pixel room-box ray-cast into a **live
floor/ceiling/wall composition readout** (wired into `room.ballroom`/`room.study`/`room.gallery`
via a `roomBox` opt — verified against the live camera to reproduce `critic-estate-11`'s filed
overlook numbers, floor 40.3% / ceiling 3.6–3.7%, to grid-resolution rounding), and added
**`?campose=x,y,z,tx,ty,tz,fov`** (deliberately not `?cam=` — that name is `room-ballroom.js`'s
own named-preset selector coupled to a grade choice, and reusing it would have been exactly the
"toggle that doesn't revert every piece of state it implies" bug class `critic-estate-11` already
filed once) plus **`--cam` on `harness/shoot.mjs`** to write it.

⚠️ **PROOF THE CAPTURE PATH IS UNCHANGED, AND WHY IT ISN'T "BYTE-IDENTICAL" IN THE NAIVE SENSE.**
Two `shoot.mjs` captures of the same view with IDENTICAL flags are already not byte-identical —
`mat.lath` default-vs-default differs on 10.1% of bytes (mean delta 1.5/255); `room.ballroom`
default-vs-default differs on 83% (mean delta 2.7/255, max 165) — a **pre-existing noise floor**,
reproduced with zero code touched, most likely breathing-light/grain phase drift from async-bake
timing shifting the sim-time at which `settle()` resolves. Forcing `?orbit=1` onto a *capture*
URL (`--extra "orbit=1"`) landed **within that same noise floor** (10.3% / mean 1.5) — i.e.
statistically indistinguishable from two vanilla runs of each other — which is the correct proof
given true byte-identity isn't a property this pipeline has even without the orbit tool. Absent
`--cam`, `?campose=` is never written and `applyCamOverride` no-ops. **Someone should look at the
pre-existing noise floor separately — it is a real, if small, hit to "two screenshots of the same
view are the same image."**

✅ `--cam` verified correct, not just inert: `room.ballroom --cam "7.4,1.62,6.1,-5.2,4.1,-6.4,66"`
(the `r10` numbers) reproduces the old full-ceiling framing pixel-for-pixel different from the
default overlook camera (98.2% of bytes differ, mean delta 50) and visually matches `r10` exactly.
`harness/mechanics.mjs` still **11/11** (fresh port, not the banned 5193/5310); `npm run build`
clean.

⚠️ **`game.js` already passed `orbit: false` to `estate()` before this round touched anything** —
confirmed by source read, not assumed — so `game.play`'s `ThirdPersonCamera` was never at risk of
being fought over, and this round didn't need to add that guard, only verify it was there.
`hunter-stage.js`'s `fitCamera()` (not in the `mat.*`/`room.*`/`prop.*`/`light.*` list this brief
named) runs its own auto-fit AFTER `studio()` returns and overwrites whatever `?campose=` set —
known, stated rather than silently broken; `--cam` only reaches views that leave the camera where
`estate()`/`studio()` put it. `room.gallery`'s `roomBox` is a padded approximation (no single box
constant exists for that corridor+apse+stair room) — good for eyeballing live, not a source of
record the way the ballroom's (lifted verbatim from `_eo13_cam.mjs`) or the study's are.

🚨 **CAUGHT AND FIXED: THE COMPOSITION READOUT COULD LIE.** The lead reproduced `floor 0.0%
ceil 0.0% wall 0.0% out 100.0%` on `room.ballroom&orbit=1` against a real `vite build` served
statically — a plausible-looking wrong number instead of an error, exactly the "captures lie"
fault class HANDOFF keeps scarring on. Root cause: `compositionReadout()`'s ray directions go
through `ndcx * th * aspect`, and `camera.aspect` is non-finite/≤0 whenever `_resize()` hasn't
run against a real (non-zero) viewport yet — every ray's horizontal component collapses and
every ray reports "out". **I could NOT reproduce it in an isolated, fully-controlled Playwright
session against the byte-identical build the lead described** (own browser, own tab, viewport
set at page-creation time, zero mouse interaction, five samples over 3 s — floor 42.7% / ceil
3.8% every time, matching the harness's own filed numbers) — so whatever tool the lead used
most likely resizes its viewport AFTER load without dispatching a `resize` event, which is the
same failure I hit and dismissed too quickly earlier in a shared browser-automation pane (before
noticing that pane had, separately, drifted onto a stray tab pointed at the BANNED :5310 —
its tab bookkeeping is not trustworthy for anything precise; do not use it for pixel-level or
matrix-state verification, only for eyeballing).
**Fixed regardless of attribution, because the lead's ask was correct independent of root
cause: a silent lie is the bug, not just this one instance of it.** `compositionReadout()` now
returns `{ invalid: <reason> }` instead of fractions under two independent checks — (1)
`aspect`/`fov` not finite-and-positive is never a real camera state; (2) a GEOMETRIC invariant a
plausible-but-wrong number can't satisfy: a ray cast from a point INSIDE a closed box always
exits through some face, so "every ray reported out" while `camera.position` is inside `roomBox`
is proof of failed math, not an empty room. `installOrbitTools` renders that as `⚠ COMPOSITION
READOUT INVALID — NOT A MEASUREMENT` in a distinct red (`#ff6a5a`, verified via
`getComputedStyle`), never alongside a percentage on the same line. Verified both ways in one
production build: normal viewport → correct 42.7/3.8/53.5; `camera.aspect` forced to `NaN` →
the loud warning, not `0.0%/0.0%/0.0%/100.0%`. Also hardened while in there: `compositionReadout`
now calls `camera.updateMatrixWorld()` itself rather than trusting a matrix the renderer may not
have refreshed yet this frame (the readout runs in `onUpdate`, before `pipeline.render()`) — cheap,
camera has no parent, removes a staleness question regardless of whether it was ever live here.
Re-verified after this fix: `harness/mechanics.mjs` **11/11** (fresh port 5252), `mat.lath`
default-vs-`?orbit=1`-forced capture **pixel-identical, 0 bytes differing** (tighter than the
~10% noise floor measured earlier in the same session — consistent with that floor being warm-
cache/async-bake timing variance, not anything this tool touches).
⚠️ **Separately, unrelated: `src/post/shaders.js` briefly broke the shared build with a
backtick inside a GLSL comment** (the exact trap this file's header names) while this
verification was running — caught mid-edit by a concurrent agent and fixed before I needed to
act on it. Nobody's fault noted here because it was self-corrected; flagging only because it's
the fifth occurrence of the same trap this file warns about and the pattern is worth someone
actually breaking (a pre-commit grep for `` ` `` inside `/\* glsl \*/` template literals, so
`lint-glsl.mjs` runs before save rather than at build time).

Game feel: hunter perception ladder PATROL→ALERT→STALK→PURSUE with hearing-through-walls
scaled by player noise; stun-lock invulnerability dead (diminishing returns); per-weapon
cooldowns from WEAPON_COOLDOWN (the net-wiring landmine is defused); five-layer limb-loss
feedback; camera never penetrates walls (body swings aside instead); HUD truth after
dismemberment + UNARMED response; debug chrome gated behind ?debug=1; **engine.start() is
deferred to the Play-gate click** (the AI clock used to hunt while the player read the
controls). Death screen is good. R restarts in ~0.9 s.

**✅ FIXED (harness-fix, 2026-08-03 ~14:30): the white-frame fault was an HMR full-reload
race** — any agent's file save pushed a reload over the shared dev server's websocket; a
reload between markReady and the screenshot captured a fresh unpainted document (white, no
canvas). shoot.mjs now mocks the HMR socket for its own tabs and THROWS on mid-capture
navigation instead of writing a corrupt "ok" PNG. game.play verified capturing a real
Director-driven playthrough frame twice (2.8 MB, mean luma 42.1). The scrim history below
stands: every game.play grade number before today measured the overlay, not the room.
Original symptom record: **the 1080p PNG was 100% pure white**
(8 512 bytes), and `--review` writes nothing because its `getElementById('rrr-canvas')` returns
null. This is an INSTRUMENT failure, not a render failure, and it blocks the §12.3 grade gate
and every future critic verdict on this piece. Excluded by measurement, not by argument: driving
the same URL with **shoot.mjs's exact launch flags** (`--use-angle=d3d11 …`) at 1920×1080 with
`capture=1` gives a 3.1 MB screenshot, canvas mean luma 59.7, 342 draw calls, `isContextLost()`
false, zero console/page errors, and `#rrr-canvas` as the top element at screen centre. So the
view renders correctly and the fault is in shoot.mjs's own capture path — which the mansion
slice is forbidden to edit. **It became visible only now because it was previously hidden:** the
view never detected capture mode (`args.capture` is never set; `Engine` uses `qs.has('capture')`),
so a 90%-opaque near-black modal scrim sat over every screenshot. **Every grade number ever
recorded for `game.play` — 6.6, 5.9, 9.9 — measured that scrim, not the room.** Next owner: this
is a harness fix, and it must land before any grade or look verdict on `game.play` means anything.

Mansion M1/M2: `src/game/spaces.js` floor-plan table + room.js as builder/graph
(spaceAt/pathPortals/anchor(), render-only residency with hysteresis); collide() must include
the 0.30 m wall band outside inset bounds or doorways seal; room warm-up compile via
pipeline.render, both light-count variants, four look directions (2400 ms first-visit hitch
→ 22 ms); **light count is fixed forever** (program cache key); `_breach` de-hardcoded from ±Z.

Mansion M3/M4 (this session): `pathPortals(from, to, minW)` filters edges by CLEAR WIDTH and
`HunterAI._tooNarrowPanel()` makes the D7 mechanic real — a stage-3 hunter (radius 0.66, needs
1.32 m) is refused the 1.20 m chapel door, and instead of pressing into the jamb for the rest of
the round it breaches `p.chapel`. Measured (A7): panel driven to stage 1 inside 20 s.
`resetRound()` now (a) resets `awareness / routeIdx / dwellLeft / searchTimer / radius` — without
which every capture loop after the first opened with the hunter one frame from PURSUE — and
(b) ~~**reclaims ABSORBED limbs**~~ — ⚠️ **THIS CLAIM WAS FALSE UNTIL 2026-08-03 ~19:00 AND IS
NOW ACTUALLY TRUE.** The reclaim block read `rig.sockets[s].item` to find "the original spare",
but `LimbRig.detach()` ends with `c.item = null`, so the lookup returned null for exactly the
sockets needing a refit and the loop `continue`d every time. It also listed only three sockets,
omitting `shoulderL` — the first one `HunterAI._attack` takes. Measured over seven staged
encounters calling `resetRound()` between each: round-start limbs fell **3 → 2 → 1 → 0 and
stayed at 0**, after which the player is `downed`, `_sense` skips downed candidates, and the
hunter stops perceiving anyone at all. Fixed with a new `LimbRig.refit(socket)` that rebuilds
from `unit.limbs` (the one reference a detach cannot invalidate) plus a `LOADOUT` snapshot so
the nail-gun arm comes back as a gadget. **The reason nobody caught it: R-restart is a real page
reload, so the only path anyone ever tested rebuilt the rig from scratch.** `PORTAL_VIS_DIST` is now **13.0** (was 16.0) — see the residency note below.

Materials: plaster keys/warmth/contour; walnut figure lerp fixed (fbm trap, second form —
see rrr-pipeline traps); wall.transition floor (reRepeat on render targets + a 4× tint);
mat.brass timeout root-caused — **the marble surface shader costs 50–60 s of D3D program
compile per fresh GPU process** (shoot.mjs ready timeout now 180 s, readyMs logged; the
compile itself is an open optimization worth ~50 s off cold loads).

Net (from a previous session, still true): server damage gate default-deny, cooldowns
enforced, disconnect returns carried items; `src/net/client.js` is still NOT wired into
game.js — that wiring is future work, after the mansion.


---

## 3. `## Landed this evening — corrections the next owners need` (2026-08-04 narrative)

Wordmark/decal fixes, `char.locomotion` foot-plant wiring (also covered fresher in
`docs/handoff/robot-char.md`'s `char.locomotion r4` entry), and an `audit.mjs` false-stub-report
fix. Kept for the trail; the wordmark facts are not repeated elsewhere in this diet.

## Landed this evening — corrections the next owners need

**The 4Humanity wordmark is ON** (logo-build-2). Three "facts" it disproved: (1) **nothing
about the brand mark is procedural** — `brandDecal` PRINTS from `public/brand/`, and
`wordmark.png` is byte-identical to the locked art, so letterform fidelity is exact by
construction; the procedural `chestDecal()`/`DECAL_SURFACE` SDF is dead code with zero callers
and must not be resurrected. (2) **The mark is CENTRED, not on the left pec** — round 28 moved
it on John's own words and measured the sheet to confirm; `ART_MANIFEST`'s "left pec" is the
error. (3) Round 34's AO-halo fix lived in `mat-robot.js`, not `unit4h.js`. Ink measured
rgb(10.6, 78.1, 131.2) against the art's rgb(5, 78, 132); IoU holds 86.4%.

✅ **FIXED 2026-08-04 (hunter-owner) — the `keepSeparate` one-liner that buried the chest mark.**
`hunter.js`'s `scaleMeshes` did `if (c.isMesh && !c.userData.keepSeparate) c.scale.set(...)`, but
`keepSeparate` is set by `unit4h.js` to protect the decal from **draw-call merging** and that line
read it as "do not scale" — so stages 2 and 3 grew the chest shell 12%/21% deeper while the mark
stayed put and ended up *inside* it. The guard is gone (nothing in the chest wants to opt out of
scaling, and the decal is BOWED onto the shell's solved front face, so the only transform that
keeps it welded there is the same one the shell gets). Verified by navy-pixel clustering plus
crops: all three chests now carry the wordmark and the grime-derived ghost fade (stage 1 0.59 →
stage 3 0.22, `ART_MANIFEST` #05) is visible across the whole ramp for the first time. **The 0.78
slope now has a frame to be judged on and has never been judged.**

**`char.locomotion` foot plant is real and was invisible** (motion-1b-build): the fix had
landed but `char-locomotion.js` still built a bare `new Gait(unit)`, so every critic verdict
described the OLD open-loop legs. Now wired. Foot skate walk 2.29 → **0.04 m/s**, run 4.62 →
**0.24**, limp 1.68 → 0.03, measured with the new `harness/footskate.mjs` (has a `--converge`
mode that finds motion discontinuities the velocity numbers cannot see — three C1 corners were
found and fixed that way). `crawl/skate/down` rendered for the FIRST time and were broken —
torso through the floor — now fixed. ⚠️ **For the hunter owner:** `hunter-ai.js` builds gaits
plant-off and never applies `offset`, so the frame the plant is defined in does not exist
there; `_animate` must honour `offset` (now including `z`) before a quadruped gait can use any
of this. `limb.detach` renders the changed limp gait and is now STALE.

**`audit.mjs` was destroying records it exists to protect** (fixed by the lead): its stub
detector substring-matched `notBuilt(` and hit a header COMMENT in `mat-robot.js`, reporting a
critic-scored piece as an unbuilt stub — and `--fix` would have reset it to NOT_BUILT and wiped
the score. It now strips comments first; verified that all five genuine stubs
(`char-detail`, `char-poses`, `hunter-sheet`, `hunter-absorb`, `mat-lath`) still flag.


---

## 4. `## Where the board stands (2026-08-04 evening)`

Superseded status snapshot; the note it carries about the two usage-limit resume packs being
retired is itself now stale (the campaign has moved to `docs/design/dig-campaign.md`).

## Where the board stands (2026-08-04 evening)

All critic-owned, and **still 0/37 WOWED**: hunter **50–63** (was 27–43 and untouched all
campaign) · estate **56–69** · `game.play` **68** (was 46 two rounds earlier) ·
`char.locomotion` **61** (from a self-scored 72 that was false, via 41) · gadgets 42–60 ·
char.turnaround 61 · mat.robot 51. The estate critic's summary of the remaining distance is the
honest one: *"nothing survives a blind look next to its reference."*

*(The two usage-limit resume sections are retired — all four killed agents were respawned and
their work landed. The archaeology packs remain at `docs/agents-resume-2026-08-03.md` and
`-08-04.md` if a fact ever needs tracing. The "no win condition" item they both flagged as
John's decision is now DECIDED and under construction — see the escape sections above.)*


---

## 5. `## Queue (rewritten 2026-08-04 evening — the old list was stale)`

⚠️ **This section's own name is a trap — it is not a queue, it is ~35 round write-ups that
accreted under one heading over several days.** The current ordering is
`docs/design/dig-campaign.md`. Most of Queue's substance (estate rounds, gadget rounds,
perf-ao/draw-call rounds, play-critic-7/8) moved verbatim into the matching
`docs/handoff/*.md` appendix — see the pointer table in `HANDOFF.md`. What's left here is the
section's own status-tracker preamble, plus round write-ups that turned out to be shorter
duplicates of a fuller top-level section that had already been promoted out of Queue and into
this diet's core/appendix split (kept here only so the trail isn't broken; read the appendix
version, not this one).

### 5a. Queue's own preamble ("IN FLIGHT" tracker, now stale)

## Queue (rewritten 2026-08-04 evening — the old list was stale)

**IN FLIGHT (3):** ~~`escape-owner-1`~~ **DONE — see "THE WIN CONDITION IS BUILT" above.** Next
two jobs it hands over, in order: (a) **`play-critic-5`** — the piece is BUILDING/unscored and
this is the first time the game has had an objective at all; (b) **an EXTERIOR and the exit
dressing** (`escape.md` §10.6-7, estate-owner work) — *the way out is currently a black
rectangle with nothing behind it, photographed at
`progress/playtest/game.play.esc1b-the-way-out.png`*. §10.4-5 (wind-down + detonation) are the
next BUILD job and drop onto `RunState.onPhase` with no refactor. · `estate-owner-7` (the six verdicts below) · `critic-ao-look-1`
(judging the AO change's look, blind, and its UNTESTED motion case) · `critic-gadget-4` (all six
gadget pieces re-rendered; `gadget.oil` judged honestly for the first time).


### 5b. Duplicate write-ups (fuller versions live in `docs/handoff/escape.md`)

### ✅ THE ESCAPE SYSTEM IS BUILT (`escape-owner-1`) — the game has a win condition
`src/game/run.js`: `EXPLORE → WINDDOWN → DETONATION → RESULTS`, **out of `game.js` entirely** and
shaped like `destruction/wall.js` — no three.js, every mutator early-outs without `authority`,
`syncPhase`/`applySnapshot` are client paths through one listener set. **It loads and runs in bare
node**, which was the point of separating it. Four exit sites **appended** to `PANELS` (ids never
renumbered); one live per run from a **pure function of the seed**; three chained via a new
`CHAINED_DEFS` (`damageable:false`). **The LOCK varies as well as the site** (`boarded`/`plaster`/
`beams` = start stage 0/1/3), so the same geometry is a different problem each run. `escape.mjs`
**20/20**, `mechanics.mjs` **11/11**, draw calls **413 → 423 (+2.4%)** against a 625 budget.

Determinism measured properly: **512 seeds → all four sites appear** (worst share 26.2%) and all
three locks appear; **200 repeats of one seed → 1 outcome**; two independent `RunState`s agree on
five seeds; a late joiner fed only `serialize()` agrees. Chained walls: **60 rounds → 60/60 hits
on the named panel, 0 stage changes**, and **broken once to prove it** — revert the lock and the
same loop opens it in 4 transitions. The escape rule's four conditions were each broken
individually and refused; the load-bearing one is real, because **the gallery overlaps the chapel
vestry's escape box by 4 cm** and without the "in no space" guard a body standing in the gallery
scores an escape.

### ✅ `escape-owner-2` — **THE ESCAPE IS A SIEGE NOW, AND IT IS AUDIBLE** (`game.play` r12 BUILDING/unscored)
Both arms measured in **one build, one page, one station**, with the "before" arm swapping
`WallState.defs` back to `STAGE_DEFS`. Seed `s4` (chapel vestry, 37.3 m from the hunter spawn):

| lock | before | after | ratio | hunter while working | silent control |
|---|---|---|---|---|---|
| boarded | 1.23 s | **25.08 s** | ×20.4 | SEARCH at 2.9 s, closes **37.3 → 25.7 m** | 36.4 m |
| plaster | 1.08 s | **22.15 s** | ×20.5 | SEARCH at 3.9 s, closes to 26.8 m | 36.4 m |
| beams | 0.48 s | **15.52 s** | ×32.3 | one transition, and it is the last | 36.4 m |

New `EXIT_DEFS` (560/760/580/3000) applies to the **live exit only**; the eight interior panels
keep `STAGE_DEFS`, so ordinary breaching stays a cheap traversal verb. `hearNoise` now fires on
every authoritative stage transition: **8 of 8 heard from 37 m, against 0 calls in 60 s before.**
**A competent player still escapes**: `pc7-play.mjs` unmodified **29.06 s, 10/10**; a driver
playing §4's loop with real keys **27.88 s with 4/4 limbs and 0 retreats.**
**The pool is 14 sites** (ten appended, never inserted). **512 seeds: all 14 appear, worst share
7.8%** (was 26.2%); 200 repeats → 1 outcome. ⚠️ **Appending RE-ROLLS EVERY SEED — `s0` is no longer
the chapel.** `?exits=4` is a real ablation.
**No victory screen over a live run:** 12/12 twice — stepping out with two inside gives WINDDOWN,
bomb 89.8 s, **modal false, pointer lock true, HUD opacity 1**, and the HUD prints **`2 STILL
INSIDE — YOU STARTED THE CLOCK`**. `_setPhase` now runs **before** `_onEscape`, and the stranded
count is captured **at the escape** because by RESULTS `stillInside()` is 0 by construction.

⚠️ **THREE FACTS THE LEAD STATED WERE FALSE, and one of them would have made the whole round a
no-op:**
1. **`hearNoise(point, 1)` — the prescribed one-liner — DOES NOTHING, and neither did 1.9.** At
   26.6 m reach the hunter sat at 37.1–37.3 m for the entire 25 s siege and **every transition was
   refused**; the A/B came back "never left PATROL" a second time. **`BREACH_NOISE.exit` had to be
   3.4 = 47.6 m, the whole house** (ordinary panels 1.25 = 17.5 m). *Both the critic's
   recommendation and the lead's brief specified a strength that could not work.*
2. **"~5–8× so opening runs 15–30 s" cannot be both.** At a measured 196 dps, 5–8× of 255 hp is
   6.4–10.4 s. It solved for the **outcome** instead (~19× overall, 33× on beam).
3. **"oil burns through plaster fast" DOES NOT HOLD — 49.5 dps against the nail gun's 200.**
   That claim is in `rules.js` *and* in escape.md §1's gadget table. Reported, not fixed
   (`rules.js` was not its file).

⚠️ **AND THE HUNTER MUST NOT HEAR ITSELF.** `_breach` damages panels while in `BREACH`, which
`hearNoise` does **not** refuse — unguarded, the hunter abandons its own breach and it looks
exactly like the D7 mechanic being broken. Gated on `authoritative && !reset && weapon !== hunterSlam`.


### ✅ THERE IS AN OUTSIDE NOW (`exterior-owner-2`, `game.play` r11 BUILDING/unscored)
Same frame, one toggle: broken studs framing a **black rectangle** → the same studs framing
**treeline, a pale boundary wall, green grass**. The hole's **median pixel 11/7/4 → 112/82/59**,
mean luma **37.6 → 87.9 (+134%)**, pre-tonemap HDR at aperture centre **0.0015 → 0.705**.

⚠️ **TWO FACTS THE LEAD ASSERTED WERE FALSE — and the first was written down twice.**
1. **`src/game/exterior.js` was NEVER imported by `spaces.js`.** Nothing imported it; **Vite
   tree-shook all 33 KB and not one line had ever executed.** That is the whole reason the round
   looked finished while the render had not moved. *The lead inferred an import from a `grep` hit
   on the word "exterior" — a name appearing in a file is not an import. Verify the edge, not the
   string.*
2. **"`castRay` found nothing within 200 m" never meant the frame was empty.** `room.castRay`
   walks `spaces`, and **outside is not a space** — so it reports nothing within 200 m with a
   garden fully on screen. **The original black-rectangle diagnosis rested on that.**

**And after wiring, the hole was STILL flat — blocked by this module's own dressing.** `setPlan()`
turns the lock's dressing on and **nothing ever turned it off**, so the `plaster` lock's mortar
patch — a solid slab across **92% × 88% of the aperture** — was still standing in the opened hole.
Fixed with one physical rule: anything fixed to the wall's face goes when the face does
(`!panel.blocksSight()`), and it runs for chained sites too because §8's detonation opens every
panel.

**THE TELL IS VERIFIABLY READABLE**, measured the right way — flipping **one site** between live
and chained via the run seed, so geometry and lighting are identical. Jamb strip on
`x.gallery.boards`: luma **29.1 live vs 8.8 chained**, and **38.6 vs 18.3** twenty frames later —
**+20.3 luma in BOTH breathing phases** (the lights move the whole frame ±8 and cancel), plus a
consistent **cold-vs-warm** chroma channel (r−b +0.3 live vs +6.6 chained). Plain wall away from
the aperture: 130.5 vs 130.3. ⚠️ **Whole-frame diffs are useless here** — the idle robot and
animated grain give `mean|d|` 12.2, larger than the signal.

**Interior grade survived, measured:** dark end **10.3 → 10.3**; lit wall 131.9 → 135.5 (+2.7%,
bloom off the now-bright hole). `exterior.js` contains no `setGrade`.
**Cost, deterministic, two identical runs per arm, agreed to the digit:** square on the open exit
**+3 draw calls**; parked in the ballroom **+1 call and ZERO exterior meshes** — residency works.
No new lights, no new GLSL, against a 625 budget.

**Still open:** the player's body blocks the aperture at every square-on station (camera owner's);
**the seam traces the aperture EXACTLY and could read as a switch that lights up**; **turning round
in the yard is a black void** (one sky billboard at the far end, sun deliberately behind you);
yard colliders are movement-only.

⚠️ **(Historical) THE WAY OUT WAS A BLACK RECTANGLE** — `progress/playtest/game.play.esc1b-the-way-out.png`.
`castRay` through an opened exit finds nothing within 200 m; `scene.background` is `#05070b`. So
*"daylight in a seam"* and *"freedom is visibly one board away"* are **not true today**, and the
concealment tells that make the procedural exits FAIR do not exist. `exterior-owner-1` is on it —
**this is the highest-leverage job on the board**, because the win condition currently opens onto
a void.

⚠️ **Not the escape owner's, and it hits the capture Director every 28 s:** the **first
`resetRound()` of a session costs ~3 s of wall time** (1.1 ms sync, 3002 ms to five frames; the
second costs 93 ms). Ablated — the exit-plan re-apply is 0.0 ms / 91 ms. Someone should find it.
Also open, both measured with the exit sites ablated out so neither is escape's: **`mansion.mjs`
A8 measures 5 visible spaces, not the documented 4**, and **A1 fails 2/4** (24 pass / 3 fail
either way).


### 5c. Queue's closing task list ("After the in-flight three")

Superseded by `docs/design/dig-campaign.md`'s wave plan. Kept because item 3 (net client wiring,
with the `player.js` `_fireCd`/`WEAPON_COOLDOWN` landmine) and item 6 (the NOT_BUILT list) are
not repeated in full anywhere else in this diet.

### After the in-flight three

1. **`critic-escape-1`** on `escape-owner-1`'s work — and this one must be a PLAY critic, not a
   screenshot critic. **A win condition can only be judged by trying to win.**
2. **`hunter-owner-3`** on `critic-hunter-3`'s list (hunter.2 IoU regression, hunter.3 rider).
3. **Net client wiring into `game.js`** — the blocker under every social mechanic in
   `gameplay-plan.md`. ⚠️ **Fix `player.js`'s flat 0.14 s `_fireCd` to read `WEAPON_COOLDOWN`
   FIRST**, or an honest player's shots get rejected by the server as rate-limit violations.
5. Escape §10 items 4–5: the wind-down (measured timer, hunter promotion, the sweep) and the
   detonation cascade.
6. Still NOT_BUILT across all 37: **`mat.lath`**, plus `char.detail` / `char.poses` (plans exist
   in `docs/slices/`, Sonnet, cheap — correctly gated behind `char.turnaround` reaching PASS).
7. Wall + material re-critiques · marble shader compile slice · `char.turnaround` GPU (1.8 vs
   1.39) + `graftedArm` consolidation.
