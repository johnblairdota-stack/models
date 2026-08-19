# Appendix: escape

**Covers:** the win condition (decided + built), the siege exit mechanic, and the exterior/outside
wiring (escape-owner-1, escape-owner-2, exterior-owner-2).
**Read when:** your slice touches `src/game/run.js`, `src/game/exterior.js`, exit/panel logic,
the win-condition phases (EXPLORE → WINDDOWN → DETONATION → RESULTS), or escape-related scenarios
(`escape.mjs`, `eo2-*.mjs`).

---

## 🔒 THE EXIT IS A SIEGE NOW, AND IT IS AUDIBLE (escape-owner-2, 2026-08-04). `game.play` BUILDING, UNSCORED.

`play-critic-7`'s three findings are worked. **`escape.md` §1's load-bearing sentence — *"the act
required to escape is the act that summons the thing hunting you"* — is true in the build and
measurable.** Full write-up in `docs/design/escape.md` **§6b**. A builder may not score itself.

```bash
node harness/playtest.mjs --view game.play --script harness/scenarios/eo2-siege.mjs    --port 5206 --q "seed=s4"
node harness/playtest.mjs --view game.play --script harness/scenarios/eo2-winddown.mjs --port 5207 --q "seed=s4"
node harness/playtest.mjs --view game.play --script harness/scenarios/eo2-competent.mjs --port 5208 --q "seed=s0"
node harness/playtest.mjs --view game.play --script harness/scenarios/eo2-calls.mjs    --port 5209 --q "seed=s4[&exits=4]"
```

### 1 · OPENING AN EXIT: 0.5–1.3 s → 15.5–25.1 s, measured both arms in ONE build

`eo2-siege.mjs` is the instrument and its whole value is that the "before" arm is **the same
panel with `WallState.defs` swapped back to `STAGE_DEFS`** — same station, same weapon, same
hunter staging, same page. A before/after taken on two days with two drivers is the comparison
this project has been burned by. Seed `s4` (chapel vestry, 37.3 m from the hunter spawn — the
critic's own staging), trigger held:

| lock | before | after | | hunter while working | silent control, same window |
|---|---|---|---|---|---|
| boarded | **1.23 s** | **25.08 s** | ×20.4 | SEARCH at 2.9 s, closes **37.3 → 25.7 m** | 36.4 m |
| plaster | **1.08 s** | **22.15 s** | ×20.5 | SEARCH at 3.9 s, closes to **26.8 m** | 36.4 m |
| beams | **0.48 s** | **15.52 s** | ×32.3 | one transition, and it is the LAST thing | 36.4 m |

**8 of 8 stage transitions were heard, from 37 m. Before the change: 0 `hearNoise` calls in 60 s
of demolishing a wall.** New table `EXIT_DEFS` in `spaces.js` (560/760/580/3000) — the LIVE exit
only. ⚠️ **The eight interior panels keep `STAGE_DEFS` and must**: breaching a wall between two
rooms is a traversal verb and has to stay cheap.

⚠️ **THREE NUMBERS IN THE BRIEF WERE WRONG AND MEASUREMENT SAYS SO:**
1. **"~5–8× the healths so opening runs 15–30 s" cannot be both.** The panel takes a measured
   **196 damage/second** (nail gun 26 / 0.13 s); 5–8× of the `boarded` lock's 255 hp is
   6.4–10.4 s. The outcome is the spec, so that is what the table is solved for — ~19× on the
   total and **33× on the beam stage**, which the design calls its best beat and which was
   **0.48 seconds**.
2. **`hearNoise(point, 1)` would have been a NO-OP — and so was 1.9.** The strength argument is
   "how far this carries, in gunshots": `hearNoise` refuses at `d > hearRange(14) * strength`.
   At the vestry door the patrol never comes inside 15.5 m, and at **1.9 (26.6 m) the hunter sat
   at 37.1–37.3 m for the whole 25 s siege and never moved** — every transition refused, and the
   A/B came back "never left PATROL" a second time. `BREACH_NOISE.exit` is **3.4 = 47.6 m, the
   whole house** (longest interior separation ≈45 m); ordinary panels are 1.25 = 17.5 m.
   It can afford to be that loud because **`soundCeiling` 0.86 < `commitAt` 1.00** — sound sends
   it to LOOK, four times over a 25 s job, and can never commit it.
3. **"oil burns through plaster fast" does not hold as a wall-speed claim.** Oil is 52 / 1.05 s =
   **49.5 dps** against the nail gun's **200**. The nail gun is the wall tool by 4×. Not fixed —
   it is a `rules.js` change and this round did not own that file.

⚠️ **AND THE HUNTER MUST NOT HEAR ITSELF.** `HunterAI._breach` calls `panel.damage()` directly
while in the `BREACH` state, which `hearNoise` does **not** refuse — so an unguarded call makes
the hunter knock a wall down, hear the bang, set `lastKnown` to the wall it is standing at, drop
to SEARCH and abandon its own breach. It reads exactly like the D7 mechanic being broken. The
call is gated on `info.authoritative && !info.reset && info.hit?.weapon !== 'hunterSlam'`.

⚠️ **`pc7-noise.mjs` CANNOT PASS ITS OWN ASSERTION, BY DESIGN, AND ITS METRIC IS DOMINATED BY THE
PATROL.** It requires PURSUE/ATTACK, which `hearNoise` is explicitly forbidden from producing
(`soundCeiling`). And its "closest approach over 60 s" is a 60-second window on a 185-second
patrol lap: re-run on `seed=s4` it reports **shooting 28.7 m vs silent 15.5 m** — the silent arm
closer — because the lap arrives on its own schedule either way. The valid form is
`eo2-siege.mjs`'s: same station, a silent control of **the same length as the job**, and the
approach measured against it.

### 2 · YOU CAN NO LONGER BE KILLED BEHIND A SCREEN THAT SAYS YOU WON

Measured (`eo2-winddown.mjs`, 3 players, **12 passed / 0 failed / 0 skipped**): stepping out puts
the run in **WINDDOWN with the bomb at 89.9 s** and **no modal, pointer lock still held, HUD at
full opacity**. The HUD carries `2 STILL INSIDE — YOU STARTED THE CLOCK` at alarm rank. The modal
now waits for phase RESULTS, and when it arrives it reads *"…2 still inside. You started the
clock."*

⚠️ **`RunState.escape()` NOW SETS THE PHASE BEFORE IT EMITS `_onEscape`.** It was the other way
round, so every listener ran while `phase` was still EXPLORE and `buildEscapeWatch`'s stranded
line — `escape.md` §5's best line — **could never print**. The consequence was computed one
statement after it was announced. ⚠️ **The stranded COUNT is captured at the escape, not read at
the modal**: by RESULTS, `stillInside()` is 0 by definition, so reading it late fails the same
way from the other end.

### 3 · THE POOL IS FOURTEEN, WHICH IS WHAT §6.1 ASKED FOR

Ten sites appended to `PANELS` (never inserted — the ids are a protocol surface), each with its
own yard in `game/exterior.js`. **512 seeds: all 14 appear, worst share 7.8%** (was 26.2% with
four); 200 repeats of one seed still give one outcome; two independent `RunState`s still agree.
Counting padlocks now means walking thirteen of them.

⚠️ **APPENDING RE-ROLLS EVERY SEED.** The choice is a pure function of (seed, pool ORDER), which
`run.js` says in as many words. **`seed=s0` is no longer the chapel** — it is the ballroom
orangery. The chapel vestry is `s4` (beams) / `s82` (boarded); `escape.mjs`'s "in no space" guard
needs `s4`. Placement rules that are easy to get silently wrong are written at the table:
the coordinate on the wall's own axis must land in the 0.30 m band (`x0-0.15`, `x1+0.15`, …) or
`cutsOnWall` never cuts the hole — the panel opens and **the wall is still there** — and the
other coordinate is threaded 1.60 m off the 3.2 m pilaster pitch so both neighbours survive,
which is what makes "a bay that does not match its neighbours" mean anything.

⚠️ **`?exits=N` IS THE ABLATION AND IT DROPS THE PANELS FROM THE BUILD, NOT JUST THE RUN PLAN.**
`room.js` now takes `o.panels` (read in all THREE places — the build loop and both `cutsOn*`
functions, or you get a panel inside a solid wall or a hole with nothing in it), and `game.js`
narrows `run.sites` with it — leave the pool at 14 while only 4 panels exist and the seed will
eventually name a site with no panel, nothing is ever live, and every wall in the house is
padlocked without throwing.

### 4 · CAN A COMPETENT PLAYER STILL ESCAPE? At the remote sites, YES, with everything intact.

`eo2-competent.mjs` plays `escape.md` §4's loop with real keys and real mouse-look — go to the
exit, work, break contact when it commits, come back, finish, run — and refuses to start unless
its own aim self-test passes (`aimDir` dot 1.000 in four directions; `pc7-play`'s pattern, and
the reason that pattern exists is that two earlier drivers walked the house convincingly while
aiming 180° out). **Seed `s4`, chapel vestry, `beams`: ESCAPED at t = 27.88 s with 4/4 limbs and
zero retreats** — walk 7.6 s, siege 15.4 s, out 2.5 s. The previous build's time at the same site
was 14.83 s, so the siege costs about 13 seconds and nothing else.

⚠️ **The exposed case is NOT ANSWERED and the failure is my instrument's, not the game's.** On
seed `s0` (ballroom orangery, `boarded`, hunter spawn 9 m away) the driver was driven off the
wall **0.4 s after arriving, at 6.3 m, by a PURSUING hunter**, broke contact successfully (30.1 m,
SEARCH, all four limbs) — and then **could not navigate back**: three `travel()` attempts from
`chapel.centre` through D7 all stalled. The first version of that run reported "still shut after
260 s" with the panel at **full health**, which reads exactly like a design failure and was a
driver that was standing somewhere else. Fixed by verifying arrival and logging the station, but
the refuge picker still chooses the farthest anchor, which is the dead-end spur behind a 1.20 m
door. **Somebody should answer this properly for the exposed sites.**

**And the critic's own driver agrees, unmodified.** `pc7-play.mjs` on `seed=s4`: **ESCAPED at
t = 29.06 s** — walk 7.6 s, **open 16.3 s**, out 2.2 s, **10 passed / 0 failed / 0 skipped**, win
screen reading the clock. The same driver's four runs before this round were 8.78–14.83 s with
opens of 1.3–2.5 s.

⚠️ **`pc7-play.mjs`'s 340-burst ceiling is now marginal.** It fires roughly one round per two
iterations (`step(4)` ≈ 66 ms against a 130 ms cooldown), so ~170 rounds — and the `boarded` lock
needs **189**. On a `boarded` seed it can report "the exit cannot be opened by playing" for a
reason that is entirely about the driver.

### 5 · WHAT FOURTEEN SITES COST: +18 draw calls at the worst station, against 27 of headroom

`eo2-calls.mjs`, parked at twelve named stations, residency settled (40 frames — the HOLD
hysteresis is 0.25 s and a shorter settle measures the last row), `?exits=4` as the ablation.
Deterministic, no GPU timer queries opened, so it is exempt from the perf lock.

| station | 14 sites | 4 sites | Δ |
|---|---|---|---|
| **service.mid** | **616** | **598** | **+18** |
| ballroom.centre | 573 | 555 | +18 |
| ballroom.north | 561 | 555 | +6 |
| ballroom.south | 555 | 540 | +15 |
| study_e.south | 525 | 495 | +30 |
| gallery.east | 439 | 427 | +12 |
| study_e.north | 414 | 408 | +6 |
| chapel.centre | 387 | 381 | +6 |
| gallery.mid | 361 | 355 | +6 |
| gallery.west | 252 | 240 | +12 |
| study_w.north | 247 | 235 | +12 |
| study_w.south | 224 | 200 | +24 |

Triangles move 246k → 248k against a 900k budget: irrelevant.

⚠️ **BUT READ THE BASELINE COLUMN. THE HOUSE WAS ALREADY AT 598/625 BEFORE THIS ROUND** — 96% of
the draw-call budget at `service.mid`, with 27 calls of headroom, and this change spends 18 of
them. That is **not** a number this file has anywhere else: the figures on record are
`perf-spaces`' 413–423, which is a **single-frame snapshot of a moving Director** that HANDOFF
already warns swung 91–1356 on one build, and which never parks in the service passage — the one
room that can see into both studies through `p.svc_*` at once. **Whoever owns perf next should
re-measure from parked stations and decide whether the budget or the residency rule is wrong,
because at 616/625 the next feature to add geometry has nowhere to put it.**
✅ **DONE 2026-08-05 (`instancing-1`).** It re-measured first and the number had already moved:
**625 / 627, i.e. over the line**, not 616. `service.mid` is now **580–586**, and the +18 this
table charges to fourteen exit sites is now ~0 — see the instancing section at the top.

### Open, stated rather than glossed
- **The `beams` lock has exactly ONE stage transition and it is the last thing that happens**, so
  that 15.5 s job is inaudible past the gun's own 12.9 m until it is already over. It pairs with
  `beams` being the lock whose yard is visible from frame one — loud to find, quiet to open — but
  it is a consequence rather than a decision.
- **§10.4's countdown HUD is still not built**, so a player in the yard during WINDDOWN is told
  once and then has no clock. `BOMB_SECONDS = 90` is still unmeasured.
- **`x.gallery.boards`' yard spans world x 13.2 → −21.3, straight over the chapel wing's
  footprint.** Pre-existing, photographed and measured by two agents in that state; narrowing it
  is a look change on someone else's judged frame. The ten new yards are all bounded to their own
  facade.

## THE OUTSIDE IS WIRED IN, AND THE BLACK RECTANGLE WAS OUR OWN GEOMETRY (exterior-owner-2, 2026-08-04)

`game.play` is **BUILDING, unscored** (a builder may not score itself). It needs a look critic.

⚠️ **TWO DOCUMENTED FACTS WERE FALSE.**

1. **`src/game/exterior.js` was NOT "imported by `spaces.js`"** — `docs/agents-resume-2026-08-04b.md`
   §1 says so twice and it was never true. Nothing in the repo imported it, so vite tree-shook the
   whole 33 KB out of the bundle and **not one line of it had ever executed.** It is now imported
   and driven by `src/views/game.js` (build, `setPlan` inside `applyExitPlan`, `update` on the same
   two viewpoints as `room.setViewpoints`, `warmup` around `finalizeScene`, `?exterior=0` ablates).
   Its `room.setExteriorSolids()` call had no implementation either; `room.js` has one now and
   `boxesNear` tests those boxes unconditionally, because outside the house there are no spaces and
   therefore nothing else would ever collide.
2. **"`castRay` found nothing within 200 m" never meant the frame was empty.** `room.castRay`
   walks `spaces`, and outside is not a space — it will answer "nothing within 200 m" with a whole
   garden on screen. The original black-rectangle diagnosis rests on it. It is a true statement
   about the HOUSE and says nothing about the picture.

### ⚠️ THE THING BLOCKING THE WAY OUT WAS `exterior.js`'S OWN LOCK DRESSING

Once wired, the opened exit was *still* a flat rectangle. Cause: `setPlan()` turns the lock's
dressing on and **nothing ever turned it off**, so the `plaster` lock's mortar patch — a solid slab
across 92% x 88% of the aperture — was still standing in the hole after the wall around it was
gone. Fixed with one physical rule in `update()`: anything fixed to the wall's face goes when the
face does (`!panel.blocksSight()`, i.e. from the beam stage on), and it runs for chained sites too
because §8's detonation opens every panel in the house.

**Measured, same frame, `exterior.setVisible()` toggled between two 2-frame steps** (seed
`rrr-test-1`, live site `x.gallery.boards`, station 2.2 m inside, body hidden):

| region | ablated | exterior on |
|---|---|---|
| the hole, median pixel | **11/7/4** | **112/82/59** |
| the hole, mean luma | 37.6 | **87.9** (+134%) |
| aperture centre, pre-tonemap HDR | 0.0015/0.002/0.0031 | **0.705/0.601/0.518** |
| interior wall (dark end) | 10.3 | **10.3** |
| interior wall (lit) | 131.9 | 135.5 (+2.7%, bloom off the now-bright hole) |

Pictures: `progress/playtest/game.play.ext-through-the-hole-{ABLATED,EXTERIOR}.png` (one frame,
one toggle), `ext-in-the-yard.png`, `ext-looking-back.png`, `ext-yard-only.png`.

### The tell is measurable, and the measurement is a same-site seed flip

Run `exterior-look` on two seeds so one site is LIVE in one and CHAINED in the other: identical
geometry, identical lighting, and the only difference is the dressing. On `x.gallery.boards`, a
20 x 220 px strip on the jamb:

| | luma | r−b |
|---|---|---|
| LIVE (leaking) | 29.1 | **+0.3** |
| chained | 8.8 | +6.6 |
| LIVE, 20 frames later | 38.6 | +8.5 |
| chained, 20 frames later | 18.3 | +15.9 |

**+20.3 luma in BOTH phases** — the room's breathing lights move the whole frame ±8 and cancel out
of the difference — and the leak is COLD (r−b +0.3) against a deliberately warm-shadowed room, a
second independent channel. Plain wall away from the aperture is 130.5 vs 130.3, so the delta is
local. ⚠️ **Whole-frame diffs are useless here**: the idle robot and the animated grain give a
noise floor of `mean|d|` 12.2, larger than the signal. Measure the strip, not the frame.

### Cost, deterministic, two identical runs per arm (`renderer.info.render`, no GPU timing)

| station | exterior ON | ablated | delta |
|---|---|---|---|
| square on the open exit | **298 calls / 156 926 tris / 461 meshes** | 295 / 156 202 / 457 | **+3 calls, +724 tris** |
| parked in the ballroom | **483 calls** | 482 | **+1 call, 0 exterior meshes** |

Both runs of both arms agreed to the digit. Residency works: one merged mesh per yard, resident
only while an exit actually exposes it. Budget is 625.

### ⚠️ THREE INSTRUMENT FAULTS FOUND HERE, ALL OF WHICH PRODUCE CONFIDENT WRONG ANSWERS

- **`esc1b-the-way-out` was photographing the inside of a wall.** `ThirdPersonCamera` LERPS its
  position at `k = 1 - exp(-11*dt)` and interpolates straight THROUGH geometry (only the boom
  LENGTH is raycast), so `escape.mjs`'s teleport-then-`step(12)` opened the shutter mid-flight.
  On `seed=rrr-test-1` **both arms of the ablation were a full-frame close-up of plaster.** It
  only ever looked right when the live site happened to be near the study the player spawns in.
  Fixed: `escape.mjs` now sets `cam._first = true` and settles to a standstill first. **Any
  scenario that teleports the player and then shoots is subject to this.**
- **`readRenderTargetPixels` into the wrong array type returns zeros, not an error.** A
  Float32Array against `sceneRT`'s HalfFloat target reported `[0,0,0]` at the aperture AND "no
  mesh changes it", which reads exactly like "nothing is drawn there". Check `rt.texture.type`
  and validate against a control pixel that must be non-zero.
- **`exterior.root.visible = false` is NOT the ablation.** The tell, the chain and the lock
  dressing are parented to the PANEL so they hide with it — a probe that toggles `root` leaves
  this module's own geometry in the aperture and reports "the exterior changes nothing". That is
  how the mortar patch survived three A/B pairs. Use `exterior.setVisible()`.

### Left open, stated rather than hidden

- **The player's body is in front of the hole at every station square on an exit** (boom 3.1 m
  back, 0.44 m shoulder), so what is left of the aperture is seen obliquely and is mostly the
  0.30 m jamb. That is a composition problem for whoever owns the camera, not a render one.
- **The seam traces the aperture exactly**, which a critic may fairly call a hidden switch that
  lights up rather than `escape.md` §6's honest evidence. It is legible; whether it is *tasteful*
  is a look verdict I am not allowed to give myself.
- ✅ **CLOSED 2026-08-09 by `exterior-1` — both the black void and the box yard.** Kept here
  because the *diagnosis* is the reusable part and the fix turned on one structural fact.
  - The void had two causes, both design rather than bug: the sky was ONE billboard at the far
    end, so it did not exist behind you, and `toSun` has a negative z, putting the sun over the
    escaping player's shoulder — **so the facade was unlit by construction**, and its albedo was
    `A_HOUSE` **0.105**, i.e. 0.046 linear against a sky at ~1.0. A silhouette, arithmetically.
    Now: a back panel + two wings + a ceiling + a strip above the roofline, and albedo 0.455.
  - 🎯 **THE STRUCTURAL FACT THAT MADE THE REST FREE: the whole yard already went into one
    `Paint` bin → one merged mesh → one `MeshBasicMaterial`.** Draw calls scale with material
    keys, not geometry, so **0.9k → 11.6k triangles cost ZERO extra draw calls** (440 → 440
    square on the exit; 512 → 512 parked away). Geometry was free and had been left on the table.
  - Three more measured errors fixed in the same pass, each worth knowing: the house **cast no
    shadow at all**; the apron was the **brightest thing in the frame** (no sky-occlusion term,
    though a 9.6 m facade two metres away takes most of the dome); and **aerial perspective ran
    BACKWARDS** — the grade mixes toward a *dark* `hazeColor`, so distance was making things
    darker instead of hazier. Trees were three axis-aligned boxes 5–9 m tall beside a 9.6 m house.
  - ⚠️ **The before/after pair is ballroom-only** (the before run was s0, the chapel is
    after-only). All 14 yards build from the same `buildYard` and the before census had every one
    at 0.4–0.9k tris, so it is representative — but it is not a photographed control.
- ⚠️ **The side walls had always been colliders with NO GEOMETRY** — a body walking sideways in the
  court stopped against nothing visible. Given real geometry 2026-08-09.
- 🔓 **STILL OPEN: yard colliders are movement-only.** `castRay` and `blocksSight` do not test
  them, so you can shoot through a garden wall. Cheap to add if the endgame needs it.
- `harness/scenarios/exterior-look.mjs` is the instrument for all of the above.
- 🚨 **`eo2-competent.mjs` FAILS on s4 and it is the DRIVER, not the game — do not chase it as a
  defect.** `still shut at stage 3 after 16.1 s`. `exterior-1` settled it the right way, with an
  ablation rather than an argument: it re-ran the same driver with the whole exterior module
  removed (`?exterior=0`) **in the same session** and got an **identical failure at an identical
  16.1 s**. It is the driver's round budget against the `beams` lock — precisely the marginality
  this file already flags for `pc7-play`. **The driver needs re-baselining**; until it is, treat a
  red here as an instrument reading.
- ⚠️ **Two documented seed-dependent SKIPs that read like near-passes:** `escape` on s0 is
  19/1-skip (*"this seed's site has no neighbouring room in its escape box — try seed=s4"*) and
  `exterior-look` on s4 is 10/1-skip (*"this seed opened at the beam stage"*). Both name
  themselves in their own hint strings. **s4 for `escape`, s0 for `exterior-look`.**


## ✅ THE WIN CONDITION IS DECIDED (John, 2026-08-04) — `docs/design/escape.md`

**Escape the mansion to outside.** Obvious exits are visibly CHAINED and boarded by the humans
who staged this for entertainment (a padlock is human-made — it carries the whole premise
without text, and teaches that force alone does not work). The real exits are **concealed** and
each demands problem solving, destruction and risk.

This closes the largest gap on the board: both `play-critic-5` and `-6` named the missing
objective as more of the remaining distance to PASS than everything else combined.

**It costs less than it looks, because three systems already do the work and had no purpose:**
- **Destruction is already risk** — breaching is loud and `HunterAI._sense` scales hearing by
  `Player.noise`, so the act that frees you is the act that summons the hunter.
- **The `STAGE_DEFS` table already holds the best beat in the design.** At the **beam** stage
  `blocksSight:false, blocksShots:false` but `blocksMove:TRUE`, and it is the **most expensive
  stage (90 health)**. So every exit ends with the longest, loudest push in the run, made while
  the outside is visibly one board away. Nothing to build — it needs *using*, and it is now used
  as the `beams` lock.
  ⚠️ **CORRECTION: `climbable:true` on that row IS DEAD CODE.** `isClimbable()`'s only caller in
  the repo is `harness/test-wall.mjs`, so "at beam you can climb it" was **never true in play** —
  the lead asserted it twice from the table alone. **A flag in a data table is not a feature until
  something reads it.** Related and larger: **the game has NO VERTICAL AXIS AT ALL** —
  `Player.update` ends with `this.pos.y = this.world.floorY` unconditionally every frame and
  `grappleTo()` is XZ-only. Anything vertical is a feature request against the player controller,
  not a level-design choice. Cost it as one.
- **Each gadget already maps to a different exit type**, which turns "make the attachments
  satisfying" from polish into structure: oil burns plaster (its own stated speciality), grapple
  reaches what you cannot walk to (26 m, the longest in the game), ball buys the seconds the
  beam stage costs, skates survive the last 30 m, nailgun chips safely from range.

Build order and four concrete exit designs are in the doc.

### ✅ AND THE ENDGAME IS DECIDED TOO (John, same day) — the game now has a full SHAPE

> *"Exits shouldn't be learnable — procedural or convincingly different, so it doesn't just
> become a speedrun away from the hunter. The hunter can follow you outside. Eventually each map
> will have an escape point. Player scores differentiate per the time it took to get to the
> escape point. The first player to escape should trigger a wind down. There should be a bomb
> threat with time ticking down where the whole mansion explodes at the end. The hunter should
> also gain advantages to catch the remaining players."*

Six consequences every owner needs:

1. **ESCAPING FIRST IS BOTH THE BEST SCORE AND THE MOST HOSTILE ACT IN THE GAME.** You start the
   clock that kills everyone still inside. The social mechanic in `gameplay-plan.md` §1 is
   promoted from a prank to the centre of the design, at zero build cost.
2. **UNLEARNABLE ≠ RANDOM. The rule is "the answer changes every run; the skill does not."**
   Author 12–16 exit sites; SELECT from the pool per run, never generate geometry. **Every site
   not chosen is present and padlocked — so the chained-exit storytelling and the shuffle are the
   same feature.** Vary the *lock* as well as the site (fire this run, beams the next) — cheapest
   variety in the design. The tells (fresh mortar, a draught, daylight in a seam) mean the same
   thing in every run and on every future map: veterans get faster by reading the house faster.
3. ⚠️ **SELECTION MUST BE SEEDED AND DETERMINISTIC** from a run seed the server owns. Two clients
   disagreeing about which exit is real is the worst desync this game could have.
4. **The hunter's advantages come from systems that already exist** — a forced `_grow()` (dust,
   flare, unfolding rig, and `HUNTER_SPEED` pays out 2.05 → 3.35 per stage), extended
   `loseAfter`/`searchFor`, and an audience "sweep" that hands it your position on a visible
   interval. ⚠️ Note the trade this hands the players back: **a stage-3 hunter cannot fit D7's
   1.20 m** and must breach.
5. ⚠️ **THE WIND-DOWN MUST BE SURVIVABLE FROM THE FAR CORNER.** If it is not, optimal play is
   "escape first, never help anyone", and every social mechanic in the design dies. That is a
   MEASURABLE claim — drive it in `harness/playtest.mjs`. **The 90 s timer in the doc is a
   hypothesis; assume it is wrong until measured.**
6. **The detonation reuses the wall system** — a wave of stage transitions to `open` with the
   debris and dust it already emits. The strongest code in the project, used as the finale.
   The hunter dies with the house *unless it followed someone out*, which is the next map's hook.

## ✅ THE WIN CONDITION IS BUILT — phases 1–3 (escape-owner-1, 2026-08-04). UNSCORED.

**`game.play` can now be WON.** `docs/design/escape.md` §10 items 1–3 have landed; items 4–5
(the wind-down and the detonation) are deliberately NOT built, and their states exist with the
transitions wired and proven reachable. `game.play` is marked **BUILDING r10** and a builder did
not score it — **`play-critic-5` now has a game with a shape to judge.**

```bash
node harness/playtest.mjs --view game.play --script harness/scenarios/escape.mjs \
     --port 5194 --shots --q "seed=s0"      # 20 checks. s0 chapel · s1 study_w · s9 ballroom · s7 gallery
```

**What is there.** A new `src/game/run.js` (`EXPLORE → WINDDOWN → DETONATION → RESULTS`), shaped
like `destruction/wall.js` because that is the piece of this project that has survived a real
server: no three.js, every mutator early-outs without `authority`, `syncPhase`/`applySnapshot`
are the client paths and emit through the same listener set. **It loads and runs in bare node**
— verified, that is the whole point of it not living in `views/game.js`. Four exit sites are
**APPENDED** to `spaces.js`'s `PANELS` (ids never renumbered — protocol surface), one live per
run, three chained. A win screen carries a time-to-escape score at the same weight as
`buildDeathWatch`.

**⚠️ FOUR STATED FACTS TURNED OUT TO BE WRONG. Two of them are in the design doc itself.**

1. **THE GAME HAS NO VERTICAL AXIS, so two of `escape.md` §3's four sites cannot be built as
   written.** `Player.update` ends with `this.pos.y = this.world.floorY` **unconditionally, every
   frame**, and `grappleTo()` measures and drives XZ only (`Math.hypot(point.x - pos.x,
   point.z - pos.z)`). There is no jump, no climb, no fall. So §3.1's chapel **window** —
   *"visible from the floor, unreachable… the grapple is already lying in the chapel"* — is not
   reachable by any input the game has, and §3.3's coal chute needs a hole in the floor and a way
   down through it. Built instead as a chapel **vestry door** at floor level in the same wall of
   the same dead-end room, and the gallery's boarded window bay. **Anyone planning traversal
   content should read this first.**
2. **`STAGE_DEFS`'s `climbable` flag is dead.** `isClimbable()` has exactly one caller in the
   whole repo and it is `harness/test-wall.mjs`. Nothing in play reads it. The beam-stage beat
   this design leans on is REAL and is used — `blocksMove: true` while `blocksSight` and
   `blocksShots` are false, at the table's most expensive 90 hp — but that is the
   see-through-and-still-stuck half. The climb half does not exist.
3. **`room.castRay(..., {forDamage:true})` could not see a solid-but-undamageable wall.** It
   tested `p.state.isDamageable()` alone, so a chained exit was skipped by the damage trace
   entirely: a shot at a padlocked door passed straight through it into the void — no chip, no
   impact, no sound, which reads as the gun being broken rather than the door being solid. Now
   `isDamageable() || blocksProjectile()`, **verified identical for every entry in `STAGE_DEFS`**
   (both true at stages 0–2, damageable-only at beam, both false at open), so it is a fix for a
   stage the old table did not contain and not a widening.
4. **`mansion.mjs`'s A8 lap now measures max 5 visible spaces, not the 4 this file documents**,
   and **A1 "break contact is possible" fails at 2 of 4**. Both were measured **with the exit
   sites ablated out of the build**, so neither is this round's doing. A2 fails at its documented
   1.02 s ceiling as before. Same three failures, same numbers, ablated or not — 24 pass, 3 fail.

**⚠️ AND A PRE-EXISTING HITCH WORTH KNOWING ABOUT: THE FIRST `resetRound()` OF A SESSION COSTS
~3 SECONDS OF WALL TIME.** Measured on a fresh page: **sync cost 1.1 ms, but 3002 ms before five
frames land**; the *second* reset in the same session costs 93 ms, i.e. nothing. It is a GPU-side
first-time cost, not JS. **It is not this round's work** — ablated, the exit-plan re-apply costs
0.0 ms sync / 91 ms to five frames on its own, and re-applying all twelve panels costs 0.1 ms /
94 ms. It matters because **the capture Director calls `resetRound()` every 28 s**, so capture
loop 2 opens with a ~3 s stall, and `mansion.mjs` A5 calls it too. It also made the first version
of `escape.mjs` fail half the time — `await page.waitForTimeout(2500)` was spent entirely inside
one stalled frame, so the run clock read 0.02 s. **HANDOFF's flee-survival trap #1 rediscovered
from the other end: never wait on wall time for a game-time fact.**

**Measured, with how.**

| | |
|---|---|
| seeded selection | **512 distinct seeds: all 4 sites appear, worst share 26.2%; all 3 locks appear.** 200 repeats of one seed → 1 outcome. 5 seeds × 2 independent `RunState` instances agree. A late joiner fed only `serialize()` derives the same exit. |
| the exit is never sent | it is a pure function of the seed (`chooseExit`) — `escape.md` §6's worst-desync case cannot happen by construction |
| chained sites | 60 nail-gun rounds → **60/60 register as wall hits on the named panel, 0 stage changes, still blocking.** Broken once to prove it: revert the lock and the *same loop* opens it in 4 transitions |
| opening the live exit | 10 rounds at lock `boarded` (255 hp / 26 dmg), 4 at `beams` (90 hp); `room.portals()` gains a `kind:'breach'` edge to `outside` |
| escape rule | four conditions, each **broken individually and refused**: closed panel, standing inside, past the jamb, and *standing in a neighbouring room on the outside side of the plane*. That last one is real — the gallery's clear extent overlaps the chapel vestry's escape box by **4 cm**, and without the "in no space" guard **a body standing in the gallery at (3.55, −30.96) scores an escape.** Proved by re-running the other three conditions on that point |
| draw calls (deterministic, two identical runs each, ablated A/B) | 8 → 12 panels, room meshes **70 → 90**. Worst space **413 → 423 calls (+10, +2.4%)** against a 625 budget. Per space: gallery 184→189 · study_w 367→372 · service 264→269 · study_e 371→376 · ballroom 174→174 · chapel 413→423 |
| GPU time | ⚠️ **DOES NOT COUNT.** Six `perf-spaces` runs spread **1.33 → 6.21 ms** in the same space (ballroom) in one window. By this project's own two-consistent-runs rule there is no measurement here. Re-measure on a settled machine |
| mechanics | **11/11**, twice, after the change |

**⚠️ THE BIGGEST OPEN PROBLEM IS A LOOK PROBLEM AND IT IS PHOTOGRAPHED, NOT ARGUED:
`progress/playtest/game.play.esc1b-the-way-out.png`. THE WAY OUT IS A BLACK RECTANGLE.** There is
no exterior: `castRay` straight out through an opened exit finds **nothing within 200 m**, and
`scene.background` is **#05070b**. So the reward for the longest, loudest, most dangerous push in
the run is a slightly-darker rectangle in a dark wall — no daylight, no seam, nothing beyond.
`escape.md` leans on "daylight in a seam" and "freedom is visibly one board away" and **none of
that is true today.** That is §10.6/7 (dressing and concealment cues) plus an exterior, and it is
estate-owner work, not run-state work. It is the single highest-leverage next job on this feature.

**Other honest gaps, left rather than glossed:**
- **No dressing.** A chained exit is an ordinary wall panel; nothing about it looks padlocked. The
  whole "a padlock is human-made" premise (§2) is carried today by **one line of HUD text**,
  `CHAINED FROM THE OUTSIDE`, fired once per site on the first hit. Verified on screen.
- **No concealment tells.** Fresh mortar, a draught, a mismatched bay — §7 of the doc, unbuilt. The
  live exit is currently found by shooting things until one of them gives.
- **`buildDeathWatch` has the same modal/HUD overlap the escape screen had.** The room caption
  prints through the big centred text (both live at `top: 34%`) — it is the boot-splash bug again.
  Fixed for the escape screen with a new additive `hud.setHidden()`; **deliberately NOT applied to
  the death screen**, because that frame has already been judged ("the death screen remains
  excellent") and silently restyling critic-approved work is worse than the bug. One line when
  someone wants it.
- **`BOMB_SECONDS = 90` and `DETONATION_SECONDS = 3.5` are UNMEASURED** and labelled as such in the
  source. §7 says assume 90 is wrong. Nothing has measured it and nothing renders either of them.
- The run seed is `Date.now()` in live play and the constant `'rrr-capture'` in capture mode, so
  every screenshot of this view is still of the same house. `?seed=` pins it.

