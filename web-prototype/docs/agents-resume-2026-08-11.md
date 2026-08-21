
# RESTART — 2026-08-11, end of a long session

## 🚫 2026-08-12 — THE HUNTER IN A GENERATED HOUSE: LEAVE HIM. JOHN'S CALL.

> *"leave him for now. we will develop a proper plan for him later."*

**Do not fix the patrol. Do not remove him. He stays as he is until John scopes him.**

⚠️ **AND HE IS IN THERE — I TOLD AN AGENT HE WAS NOT AND JOHN CORRECTED ME BY PLAYING:** *"I can
tell you the hunter is in the house lol."* `GEN.spawn.hunter` is a real position
(`[11.15, 19.82]`, inside `r1.service` on seed 0). **What was deferred is only `PATROL_ROUTE` /
`ANCHORS`.** I read "deferred with the hunter" in a design doc as "the hunter is deferred"; it is
not, and the running game said so in one line.

🚨 **HIS ROUTE IS NOT ABSENT, IT IS FOREIGN — and that is worse.** `_patrol` reads
`wp.x`/`wp.z`/`wp.dwell` and **never `wp.space`**, so a generated house inherits the AUTHORED
mansion's waypoint coordinates (`flyover-1`, measured over 240 frames — a 60-frame window would
have reported the 3.0 s dwell as a stall):

| house | stops inside the envelope | travel in 4 s |
|---|---|---|
| authored `seed=s4` | **12/12** | 3.14 m |
| gen `planrooms=6` | **1/12** | 3.14 m |
| gen `planrooms=3` | **1/12** | **0.01 m — stationary** |

⚠️ **Foreign waypoints alone do NOT explain the stall** — `planrooms=6` has the same 1/12 and walks
normally. Cause unattributed. **This is the first thing a hunter slice should measure, not assume.**

## 🔗 2026-08-12 — THE CHAIN X AND THE PERIMETER WALL (`dressfix-1`)

**Chain X — FIXED, +0 draw calls.** `exterior.dress.chain.segment` is authored **1.165 m** and was
drawn **6.95 m**; boards 1.194 → **12.15 m**; on a 27.20 m face the chain drew **26.15 m → 2.00 m**
after. 🎯 **The mechanism is one line further back than filed:** `SEG_FAMILY` exists so
`makeScale(w/W, h/H, 1)` is **1.00** for the 1.14 m dig bays — and `?dig=free` then put a SECOND
population into it (one face per wall, up to 27.20 m). **The family whose whole purpose was "no
stretch" acquired members at 23.9×.** A free dig face is now drawn at the standard door,
`CONNECTOR_W × CONNECTOR_H` **2.08 × 2.68**, at scale exactly 1. `?dressscale=1` reproduces the
defect (not the pre-fix build byte-for-byte — stated in its header). `?dig=bays` byte-identical;
**`mortar-1`'s fix verified surviving** (X5: 0 free faces wear mortar, 19 with `?segmortar=1`).
🚨 **THE AUTHORED HOUSE HAD IT TOO AND THE FIX LANDS ON BOTH.** `f.svc_w.1.a`, a 5.72 m wall, drew
a **5.98 m chain — 105% of its own panel** — now 2.17 m. **This changes the look of the scored
build. John's call.**
⚠️ **`px>16` IS BLIND IN A GENERATED HOUSE AND IT COST A ROUND.** Mean frame luma is **6.65 of
255**, so a 26 m chain measured **8 pixels**. At `px>2` on a 0 floor the same mesh is **5629 px
(0.611% of frame)**. **Any pixel threshold tuned on the authored house is wrong here.**

**Perimeter wall — NOT a collider gap, and that is measured.** A multi-source flood driving the
real `room.collide(pos, 0.34, 1.70)` over ~10–15k body marches, seeds 3/7/12 × both door arms:
**0 cells outside the envelope, 0 walkable void inside it, every run.** Ghost control (same grid,
body removed) reaches **17 960–21 556** outside cells, so the zero is the collider and not the
search. **What IS wrong:** `YARDS` is keyed by AUTHORED site id and a generated site is `x.g0…`, so
every generated yard is `DEFAULT_YARD`, a fixed **±6.0 m** box — its facade covered **12.0 m of a
27.2 m wall, leaving 15.2 m of house with nothing drawn in front of it**: a two-storey slab with
windows ending in mid-air, black either side. Fallback yard now matches the room's exterior wall
run (seed 3 **44.1% → 100%**, seed 7 **78.4% → 100%**), draw calls unchanged, `?yardwide=0` reverts.
⚠️ **IT IS NOT PROVEN TO BE WHAT JOHN WALKED BEHIND** — he described movement and no body can get
behind anything on 3 seeds × 2 arms. **The one path not covered by the flood is a wall AFTER A
DIG.** Still open.
🐞 **Found, not touched: the yard's side and boundary walls carry colliders 0.70 m TALLER than
their geometry** (`sideH+0.7` vs `sideH`) — an invisible barrier, the inverse of his complaint.
**Owner: unassigned.**
⚠️ **`mechanics` read 16 → 19 → 20 checks across its three runs** because `refit-1` was editing it
underneath; nothing was investigated or changed. **My brief listed `mechanics` in a dressing
agent's keep-green set and that was my error** — it cost most of the run's tail.

## 🚪 2026-08-12 — THE DOORWAY HALO, AND IT WAS NEVER A DOORWAY BUG

John: *"the doorways immediately look damaged everywhere when they damage at any point."*
**Fixed in `src/destruction/damagefield.js` `_smooth()`. `_genfix1-diag.mjs` D6: 0 of 80 wall cells
touching a doorway still ramp (worst 0.000), 0 of 638 doorway cells under hard 1, and 28
partly-eaten cells around a real crater on the same face — the control that proves the channel is
still alive.** Whole file 11/0.

**Mechanism.** The **B channel is the renderer's BLURRED copy of depth** and is what the break
shader's march samples. `_applyApertures()` writes R, G and the sag channel for a doorway cell —
**it has never written B** — so the 11 cm blur ran straight over the doorway's hard rectangular
edge and ramped 1 → 0 across the wall beside it. Those texels read as PARTLY eaten, missed the
shader's `_f < 0.999` discard, and rendered as a **cut face**: arris, lip, white and cyan, in a
halo around every authored opening. ⚠️ **It only appears "when they damage at any point" because
until the first blow the face is drawn by `wallinstances.js`'s pristine path and this shader never
runs** — the halo was in the field from the moment the house was built.
🎯 **The fix is the technique `_smooth()` already used**: it refuses to blur across a PLATE
boundary, and an aperture edge is a real edge too, so it gets the same refusal — plus a hard write
of B = 255 on the doorway's own cells, because a blurred 1 is still not 1 and a 0.98 keeps an inner
fringe. **No new uniform, no new channel, no extra memory.**
⚠️ **THE PLANNED FIX WAS WORSE AND THE CODE OFFERED A CHEAPER ONE.** John approved passing the
aperture rects to the shader as uniforms; reading `_smooth()` first made that unnecessary.
🚨 **AND `damagefield.js`'s channel comment is STALE — alpha is NOT free**, the sag work took it
for strain. That comment nearly cost a corrupted channel; corrected in **instruments.md**.

⚠️ **THE PER-ROOM INTERCONNECT BROKE THREE HARNESS GATES AND I DID NOT NOTICE FOR HOURS.** Changing
`chooseFreeInterconnect`'s map key from EDGE to ROOM left `_ap2-rule.mjs` and `_slab1-cost.mjs`
throwing on `.get('svc_w')` — **I checked `src/` consumers at the time and not `harness/`.** Both
repaired (43/0 and 7/0); `_ap3-geom` 38/0 throughout. ⚠️ **And the first repair of `_slab1-cost`
CHANGED WHAT IT MEASURED** — collecting every room's region instead of one wall's made the slab arm
report 10 distinct faces where the check needs exactly 1, which reads as a finding and was an
artefact of the edit. Scoped back to the single wall it was always about.

## 🧠 2026-08-12 — "IS IT A VRAM LEAK?" NO, AND THE ARTICLE NAMED THE OTHER CAUSE

John hit a memory/perf worry and found the standard three.js *"you forgot `.dispose()`"* advice.
**Measured with `harness/scenarios/_mem1-climb.mjs` (new, 9/0) — nothing climbs, and the round
reset RELEASES:**

| | geometries | textures | programs |
|---|---|---|---|
| 12 s idle play | **+0** | +0 | +0 |
| **6 round resets** | **−275** | +0 | **−32** |
| 480 blows over 8 faces | **+0** | +0 | +0 |

Totals over the run: geo **1194 → 919**, tex **323 → 323**, programs **211 → 179**.
🚨 **C1 IS THE CONTROL AND IT IS WHY THE ZEROS MEAN ANYTHING** — it allocates 40 real geometries,
uploads them, requires the counter to RISE, disposes them and requires it to FALL (**+40 / −40**).
Without it a frozen counter reads as a clean bill, which is exactly how `usedJSHeapSize` lied here
for nine sessions (**that column is dead — do not use it**).

⚠️ **`src/` already makes 144 `.dispose()` calls**, so the article's headline case does not apply.
🎯 **Its own text names two causes — *"a memory leak OR over-allocation"* — and this is the second
one.** The fixed cost is the bake: **75 bakes, ~672 MB, ≈40% of cold boot** (`coatbake-1`), and
**323 textures / 211 programs, flat**. **The lever is bake RESOLUTION, not disposal** (~16 MB per
bake). Not taken — John: *"I wasn't going to optimize yet."*
⚠️ **His 5.2 GB Task Manager row is `Firefox (35)`** — 35 processes with a dozen other tabs. **It
is not the game's number and must not be quoted as one.** At the time of the reading the frame was
**280k tris against a 900k budget and 135 calls against 625**, GPU 22% — so *"performance isn't
good"* is a SEPARATE question from memory and is not obviously a budget problem either; suspect
shader compilation during play (there is a warm-up for it) until a stutter-vs-framerate answer
arrives.

## 🎨 2026-08-12 — THE PER-ROOM COAT IS THE DEFAULT (`?coat=0` restores the old look)

John: *"The asset for the skin just looks like the ornate wallpaper and it disappears from the
whole slab when I shoot it with the nail gun."* **Both halves are arm 0 and one change closes
both.** The wallpaper is `wall.pristine.face`, the single damask stage every untouched dig face
was drawn from (**0 of 28** faces wore their room's skin on arm 0, **28 of 28** on arm 1); the
disappearing is the first hit demoting the face out of the instanced set and swapping damask for
`estateSkinMat()` in one frame — `mortar-1` measured that swap at **44 222 px>16 on `?coat=0`
against 29 on `?coat=1`**, because pristine and damaged are now the SAME material. **Price: +0
programs, +5 draw calls.** ⚠️ **Node keeps arm 0** so the 15740-leaf headless goldens stay
comparable.

## ✅ 2026-08-12 — JOHN'S PLAYTEST OF THE GENERATED HOUSE, AND SLICE 1 OF THE ANSWER

Plan: `C:\Users\John\.claude\plans\i-didn-t-like-the-reactive-feather.md`. He filed eleven notes;
**three collapsed into one root cause and one reversed his own earlier design call.**

**LANDED — the core loop.** All gates green: `escape` **20/20** · `dig-free` **16/16** ·
`sledge-check` **13/13** (authored) · `mechanics` **13/13** · build + `lint-glsl` clean.

- 🕳️ **`?unlock=room` IS NOW THE DEFAULT** (`room.js`). Finding a room's interconnect drops the
  barrier on **every wall bounding that room and nothing else**. Measured on the authored house:
  **3 of 7 edges opened, 4 shut, 14 faces still barriered.** ⚠️ **This reverses John's own
  2026-08-08 sentence** (*"the whole robot barrier turns off"*); `global`/`edge`/`off` all still
  ship. 🎯 **You unlock the room you are STANDING IN** — the blob is mirrored to both faces and
  `unlockBarrier` reads `ownerSpace` off whichever face was broken. **The fallback shrinks the
  unlock, never grows it.**
- 🕳️ **ONE INTERCONNECT PER ROOM, not per edge** (`dig.js` `chooseFreeInterconnect`). **This
  retires `dig.md`'s "adding an edge makes a room FASTER to dig out of"** — that was the per-edge
  rule's own consequence, invisible until a generator made 36 edges. ⚠️ **Every seed's soft spot
  has MOVED**; the salt is keyed on the room. Recorded "seed sN opens at …" is void.
- 🚪 **GENERATED DOORS START SHUT** (`genplan.js`, `?gendoors=open` restores slice 1). Walk-only
  reachability **18/18 → 1 of 18** on every seed. ⚠️ **Corridor-internal joints stay OPEN on
  purpose** — one corridor is several `SPACES` rects, and shutting those saws it into a row of
  boxes. **Breachable, not a chained mix**: a chained leaf cannot be forced and nothing gates yet
  whether a seeded mix strands a region.
- 🔨 **THE SLEDGEHAMMER EXISTS IN A GENERATED HOUSE** (`views/game.js`). It was placed at the
  authored anchor `study_w.north`, which `?plan=gen` does not have, so it warned and **returned
  without spawning** — John: *"I didn't start with a sledge hammer."* Falls back to
  `room.spawn.player[0]`. 🚨 **Shutting the doors made this FATAL rather than annoying** — no
  hammer in a sealed room is an unfinishable run. The two changes are independent; their
  combination was not.

**🚨 TWO GATES WERE MEASURING SOMETHING OTHER THAN WHAT THEY SAID.**

- **`dig-free` F6 read *"one discovery drops every barrier in the house"* and stayed GREEN through
  the reversal**, because it only ever counted the two faces it had just dug. **It asserted the
  house and measured a wall.** Rewritten: two numbers from one query that must disagree, and it
  asserts the shape of whichever mode is live rather than skipping. Both arms run green and
  opposite — `room` 3/7 edges with 14 faces barriered, `global` 7/7 with 0.
- 🚨 **`_plangen1-boot` B4 CANNOT SEE A CLOSED DOOR.** `room.pathPortals()` filters on **width and
  height only**, and `portals()` is every emitted doorway, open or shut. Shutting **19 of 25**
  doors moved B4 by **exactly zero** on all 16 seeds. B4 is kept (it is the *stranding* gate,
  11/16 — the known sliver seeds) and **B7 walk-only reachability is new**. ⚠️ **This corrects
  `house-packing.md` §9.4's *"BFSs over whatever is open right now"*** — corrected in place.

**Still open from his eleven** — slices 2-4 of the plan: the aperture rendering as damage and the
skin restyling the whole slab at one hit (**one root cause: an aperture cell is `depth = 1`, and
`_syncStageFromField` is a monotone per-FACE latch**) · per-room coat as the default arm ·
generated rooms have no lights · the chain X scaled to a slab · limb refit choosing an occupied
socket · the perimeter wall he can walk behind. **Working as designed, his call with its price:
`DIG_H` 2.80 m, which is why the ballroom's high walls take no damage.**

**Read `HANDOFF.md` first (~35 KB). This file is only what it does not yet say: what just landed,
what is in flight, and what to do next.** Nothing is half-done; no agent is running.

## State

Tree green. `mechanics` **13/13** · `escape` **20/20** `seed=s4` · `dig-free` **15/15** ·
`sledge-check` **13/13** · `dig-cover` **6/0** · `eo2-calls` **6/0**. `game.play` **PASS 71**.

⚠️ **Known-red and NOT regressions** — do not adopt them: `_pf1-diag.mjs`'s 2 (written to confirm a
defect that is now fixed) · `dig-band`'s 1 (the chapel's named floor-plan shortfall) ·
`_th1-section`'s 1 (a screen-pixel statistic against a `renderScale` that moved) · `bang-door`'s 1
(the unbuilt peek gap) · **`two-sided` 15/2** (the `_couple()` SHOW defect, live because the ×1
rescale exposed it — see below) · `mechanics`'s refit-animation line **flakes ~1 run in 5**,
load-dependent; re-run before believing it.

## What landed this session, in one line each

Phase 0 (six blockers) · the sag/pull collapse · the fall re-dispersed · targeting decoupled from
standoff · the aim mark · the step-up · limb loss on collapse · ×8 base and John's ladder · the
rubble pile · the hunter hearing noise and battering a door · the hallway doors removed
(`?doors=1` restores) · **slabs (`?slab=1`) with doorways in them (`?slab=1&doors=1`)** · door
dressing unified · `HANDOFF.md` 95 KB → ~35 KB · both critics.

## 🎯 Next, in the order I would take it

1. ~~**Put the actual doors in the apertures.**~~ ⚠️ **RE-DERIVED 2026-08-11 (`apnest-1`), AND
   THIS ENTRY WAS WRONG TWICE.** (a) **`aperture-2`'s report does not exist on disk** — searched
   for `3.04`, "three edits", "cut inside a cut", `ap2`: only this file hits. It died with its
   transcript, which is what the "argument lives in the instrument's header" rule exists to
   prevent. (b) **The number is 2.960 m, not 3.04** — it falls straight out of `SLAB_SPAN[0]`
   −24.00 to the doorway's left edge at −21.04, and 3.04 would need a 1.92 m door against the
   shipped `CONNECTOR_W` of 2.08. **And it understated the defect**: 2.960 m of floor-to-ceiling
   masonry *per face*, **11.840 m across the four `svc_w`/`svc_e` faces**, plus 4.16 m per face of
   DOUBLED lintel, plus **four zero-width full-storey boxes that are live on plain `?slab=1`
   today, with no doorway involved**.
   🚪 **The mechanism, stated once so nobody re-derives it:** `buildWall` **sorts `o.cuts` by
   CENTRE and tests each cut's LEFT EDGE** against a cursor that only advances to a RIGHT edge.
   For disjoint cuts those are provably the same ordering — which is why it has been correct for
   every opening in the house. Nest a 2.08 m doorway at −20.00 inside a 15.40 m slab centred at
   −16.30 and the doorway sorts first, the cursor is still at the wall's start, and the walk fills
   the 2.96 m in front of it. **Three edits, all inside the walk: `docs/slices/task-aperture-3.md`
   §4** — and `_ap3-geom.mjs --preview` **parses the plan's own edit fences and applies them in
   memory**, so the document and the number cannot drift. Instruments: **`_ap3-build.mjs`** (builds
   the whole mansion headless, no `src/` mocked), **`_ap3-geom.mjs`** (15/5 today → 20/0 previewed,
   five controls), **`_ap3-golden.mjs` + `.json`** (15740 built-geometry leaves, `Object.is`, five
   disjoint-cut arms). ⚠️ **Not reachable from any URL today** — `spaces.js` refuses the four
   `p.svc_*` rows under `?slab=1&doors=1`, so a browser probe cannot see it; headless was
   mandatory, not merely cheaper. ✅ **LANDED** (`aperture-3`): masonry inside dig faces
   **28.480 m → 0**, degenerate boxes **4 → 0** on all four arms, **0 of 15740 golden leaves
   moved**, build green.
   ⚖️ **`critic-aperture-3`: WEAK — AND NOT BECAUSE THE CODE IS WRONG.** It rebuilt the pre-fix
   tree from the plan's own fences and reproduced **28.480 m / 11.840 m to three decimals**, and
   found **no evidence the landed code is defective**. It filed WEAK because **the instruments
   certify a fix that is demonstrably wrong**: mutation **8** — drop the widest-first tiebreak,
   loosen the containment epsilon `1e-6 → 0.1`, and make the sill unconditional — **survives 20/0
   geom + 15740/0 golden + the control**. Causes, traced, do not re-derive: **no fixture has two
   cuts sharing a left edge**; **the only adversarial fixture misses containment by 0.6 m** while
   real doorway geometry lives at **0.12 m**; and **every fixture is a floor-level doorway
   (`y0 = 0`)**, so the sill half of Change 2 has **zero** coverage. ✅ Caught correctly and
   localising: dropping the y0/y1 half (18/2), unconditional lintel (19/1), revert Change 1 only
   (19/1), revert Change 3 only (17/3). **Owner: `ap3cover-1`** — the mutation table is its spec.
   ✅ **Q1 verified independently: the defect is unreachable from every shipped URL** —
   `spaces.js:1317` strips the four `p.svc_*` rows whenever `SLAB_ARM`, and `cutsOnWall` never
   reads `SLAB_DOORWAYS` (which reaches the grid by a separate path, `dig.js` 507–548).
   ✅ **Q2: the golden DOES cover colliders**, with a two-part ablation built to prove it is not
   collider-blind, and `sp.colliders` are the runtime collision boxes (`room.js` 1028/1141/1176).
   ⚠️ **But `_ap3-geom.mjs`'s A1/A2/A3 are collider-ONLY and the mesh cross-check its own header
   claims is never performed on the nesting arms.** Dormant only because `box()` emits mesh and
   collider in one call under one condition — **incidental to the implementation, asserted by
   nothing**, and the skin slice is about to change the code that draws walls.
   ✅ **CLOSED 2026-08-11 (`ap3cover-1`): `_ap3-geom.mjs` 20 → 38 checks, 38/0.** Mutations **2b**
   (epsilon `1e-6 → 0.1`) **→ 35/3**, **3** (unconditional sill) **→ 34/4**, **8** (stacked)
   **→ 31/7**; `src/` SHA-256 identical before and after. The two new fixtures are real shapes, not
   inventions: **`slabhead`**, a doorway **2.86 m in the 2.80 m band** — `dig.js` bounds `d.h`
   **nowhere** and `apertureRects` silently **clamps** `v1`, so a doorway taller than its band is
   accepted and quietly loses its head; and **`slabwin`**, a **window** (sill 1.10 m) — `sill` is a
   documented first-class field of `SLAB_DOORWAYS` and `room.js` already walks seven raised-sill
   cuts; only the two together are new, and §9's wiring is what joins them.
   🎯 **MUTATION 1 (the widest-first tiebreak) IS DELIBERATELY NOT GATED, AND THE ARGUMENT IS
   MEASURED, NOT AESTHETIC.** The fixture was built and it *does* distinguish the mutation
   (**0.000 m vs 4.160 m**, 154 → 156 colliders) — but moving the same doorway **one ULP, 4e-15 m**
   makes **the shipped tree fail identically, with the tiebreak and without**. A gate there would
   certify that an authored coordinate landed on a representable double, not that the walk orders
   containers first. Also: **no producer can emit a flush aperture** — `genspike.mjs` gates a door
   on `runMax >= L_DOOR` (2.48 m = 2.08 aperture + two 0.20 jambs) and centres it, so the minimum
   jamb any generated plan carries is **0.20 m**; measured on the built house the closest two cut
   left edges ever come is **1.140 m**. Ships as **DIAGNOSTIC, NOT GATED**. ⚠️ **A limit of the
   landed fix, now stated in both headers:** Change 1's comment claims the tiebreak means "a
   contained cut always meets its container before itself" — **it means that only on an exact tie.**
   ✅ **Mesh/collider gap closed by A6**, which asserts the two halves separately with **no recorded
   baseline** (A/Bs nesting arms against `slab`; C8 requires `overhang` to move both halves, C9
   suppresses merged geometry with colliders untouched and requires exactly the geometry half to go
   red). ⚠️ **A6 asserts moved / not moved, never a count — do not tighten it:** on `overhang` the
   study caps at `wallTop` ≈ 3.33 m, so a refused 3.40 m lintel is clipped to nothing in geometry
   and full height in colliders, exactly as `room.js` documents at the `capY` call site.
   ⚠️ **Brief correction that strengthens the case: the doorway-head margin is 0.08 m, not 0.12** —
   `DOORWAY_H` is **2.72** for an OPEN doorway (2.68 is the closed connector), i.e. *smaller* than
   the 0.1 m epsilon the mutation used.
   🐞 **DOC DEFECT IN `dig.js` LINE 321, worth someone's attention:** it claims *"EVERY SPAN CLEARS
   EVERY SHIPPED CONNECTOR ON ITS WALL BY >= 0.20 m"*, but `svc_w`'s authored spans **abut the two
   doorways at exactly zero clearance** (span 0's right edge is bit-exactly `p.svc_w.n`'s left
   edge) — **and the file's own line 411 says so.** `ap3cover-1` did not lean on it; the live 0.20 m
   rule is `genspike.mjs`'s `L_DOOR` jamb, which is independent. **Owner: unassigned.**
   ❓ **A DESIGN QUESTION SURFACED, NOT DECIDED:** `dig.js` says a window in a dig face costs
   nothing; `room.js` says *"a stained-glass lancet in a wall the player is meant to hammer through
   would be both a lie"* and puts its windows on the exterior wall for that reason. Recorded in
   `FABRICATED.win`'s header. **Either way a contained cut owes the walk no sill, so the gate is
   correct whichever way it settles.**
   🚨 **The `spaces.js` wiring is NOT in that slice and is a lead's decision** —
   `PASSAGE_DOORS_ON = DOORS_URL && !SLAB_ARM` → `DOORS_URL` is one line, but it turns the slab's
   open holes into breachable door leaves and flips `_ap2-slab.mjs` **B3** (*"a body walks through
   the doorway of a PRISTINE slab"*). No seed moves (`_doors1-pool.mjs`). Take it as its own slice,
   with B3 rewritten on purpose.
2. **THE ROOM ASSET IS THE WALL'S SKIN.** John: *"from the inside of the room the destructive wall
   IS the room asset — only when they damage it can they see its white underneath. I don't want it
   to disappear in one hit."*
   🚨 **PRICED 2026-08-11 (`dressbin-1`) AND THE PREMISE WAS WRONG: THE COST IS NOT DRAW CALLS.
   IT IS +0.** Measured at twelve parked stations — **collapse-all `+0 … +0`** (control 0 at
   12/12, worst station 461/625); split-proud `+2 … +36`; split-all `+4 … +49`. **Not one piece of
   dressing is its own mesh** — every skin row is a room `GeoBin` bucket, one of ≤8
   `exterior.dress.*` `InstancedMesh`es, or a yard — and `room.js` **already ships the zero-call
   removal path** (`tracked().hide()`, a degenerate-vertex write), with the pieces occupying
   contiguous index runs, which is what makes it free.
   **Recommendation: in-bin collapse as the erosion + `debris.js`'s existing instanced pool as the
   fall. 0 calls.** ⚠️ **The unpriced risk is a BAKE, not calls** — `dressbin-1` did not price it.
   Instrument: **`harness/scenarios/_dress1-skin.mjs`** (new; asks the BUILT scene which triangles
   lie inside a destructible face's rectangle, `InstancedMesh` copies expanded through
   `instanceMatrix`; five controls, incl. a bogus face 500 m out that must come back UNRESOLVED).
   ✅ **ANSWERED BEFORE ANYTHING WAS BUILT (`skin-1`): the partial-run case is +0 too.** A fourth
   `collapse-partial` arm collapses **every other triangle** so no contiguous run is ever fully
   emptied — the pessimal shape of per-cell erosion. **+0 at 8 of 8 stations pre-change**, C5 revert
   control 0 on all eight; **C6** proves the arm really left runs holed (1080 of 1952, then 4644 of
   5304); `split-all` reads **+4…+51** on the same runs, so the zero is a measurement and not a
   blind hook. **Nothing was split.**
   ✅ **LANDED (`skin-1`): `src/game/skin.js` (new) + `room.js` + `views/game.js` `onChunk` and one
   `?skin=` line.** Every skin triangle on a dig face is bisected on its longest edge until under
   `SKIN_CELL` **0.18 m**, in the builder. 🎯 **Erosion is THREE INDEX WRITES per fragment, NOT a
   position write, and that is deliberate** — `sp._tracked`'s handles own ranges in that same
   position buffer and **a second writer there is a bug that does not throw**. Fall paid from
   `debris.js`'s existing `slab`/`plaster` pools. Instruments: **`_skin1-geom.mjs` 18/0** (area
   conserved, worst drift 1.33e-8 against a float32 epsilon of 1.19e-7; **all 170 colliders
   `Object.is`**; +42 824 tris; 165–200 ms build; `erode()` **0.110 ms/blow** on a 13 522-fragment
   face) and **`_skin1-look.mjs` 12/0** — **6663 fragments drawn over open cells → 0**, B vs C
   **31 838 px>16** against a same-elapsed floor of **552**; `eo2-calls` **423/625 both arms**.
   🚨 **AND THE HEADLINE FINDING, WHICH REFRAMES JOHN'S OWN SENTENCE: "I don't want it to disappear
   in one hit" IS UNREACHABLE AT `DIG_BASE` 8, BECAUSE THE WALL DISAPPEARS IN ONE HIT.** Measured
   off the real field: depth **1.000 out to r = 0.45 m, 0.000 at 0.60 m on blow one** — no gradient
   at all, and `damagefield.js` says so itself (*"it takes its whole 1.04 m brush clean through in
   one hit"*). **No dressing threshold can keep a 1.33 m canvas up there; it would be standing over
   a hole.** ✅ **At John's own ×1 rung the curve he described is exactly what you get: 14.8% of a
   canvas on blow 1, 100% swept.** **This is a DIG-RATE question, not a dressing-rule question, and
   it is John's to answer in game.**
   🐞 **`wall.js` `resetDamage()` DOES NOT RESTORE THE PANEL'S OWN LOOK — found in passing, not
   `skin-1`'s.** Measured on the arm where the skin eroded nothing: **54 329 px>16 from the intact
   frame against a 552 floor**, the face rectangle a flat dark plane. (`skin-1`'s own reset is
   clean: R2 vs R1 = **328 px>16**, inside the floor.)
   ✅ **FIXED (`mortar-1`): 44 222 px>16 → 30**, floors 0/23. 🎯 **AND IT WAS NOT THE
   `if (this.instanced) return;` EARLY-OUT everyone suspected.** On a free face the stage is a
   monotone summary of the grid (`_syncStageFromField`); **`resetDamage()` zeroed the FIELD and
   never touched the STATE MACHINE**, leaving **stage 4 at depth 0** — so `get pristine()` stayed
   false, `wallinstances.js` never took the face back, and it drew its own fully-broken layer 0 for
   the rest of the round. Same latch `applyHit`'s own comment documents for the barrier, arriving
   through the other half of the object. State: `stage 4→0 · pristine false→true · instanced
   false→true · breaks [0.95,0.95,0.94,0.90]→[0,0,0,0]`.
   ⚠️ **It predates `pristine-1`, and `pristine-1`'s arms MASK it rather than widen it** — the
   pre-fix reset leaves **byte-identical state on both arms** while the pixels differ by two orders
   of magnitude (**44 222 px>16 on `?coat=0`, 29 on `?coat=1`**): on arm 0 losing the instance swaps
   the surface, on arm 1 `coat-1`+`pristine-1` made the two the same material.
   🚨 **Written as a DIRECT STATE RESTORE, not `WallState.reset()` — deliberately.** That emits, and
   `views/game.js`'s `onBreak` guards only its noise and sound on `info.reset` while
   **`debris.burst(18)` fires unconditionally**. *"Undo every blow" must be silent.*
   `_mortar1-reset.mjs` **11/0 on both arms**.
   🐞 **`dig-link.mjs` CRASHES on the shipped free arm** — `TypeError` ~line 82: its regex is
   `^d\.(.+)\.(\d+)\.(a|b)$` and free-arm ids are `f.…`. **Pre-existing and unreachable by any
   dressing change**; on `?dig=bays` it runs and reads 11/3. **Owner: unassigned.**
   ⚠️ **`_ap3-golden` reads 272 moved leaves and `skin-1` DELIBERATELY DID NOT `--write`.**
   `harness/evidence/_skin1-golden-split.mjs` (new) ablates the skin **in memory** via `AP3_PATCH` and
   re-censuses: **72 leaves / 24 mesh rows are this slice** — fields **[2][3][4] only** (vertex
   count, index count, digest); colliders 0, panelIds 0, dig-face rects 0, names 0, materials 0 —
   and **200 leaves / 40 rows are `wallinstances.js`**, every one a `wall.pristine.face`/`reveal`
   pair at swapped indices with an **identical mesh-row multiset on all five arms**, i.e. a pure
   sibling reorder with no geometry moved. **The tool refuses to advise a write while the not-mine
   column is non-zero.** 🎯 **Sequence: once `pristine-1` settles `wallinstances.js` and its owner
   has read those 200, re-run the split, confirm, THEN `_ap3-golden.mjs --write`.**
   ⚠️ **An instrument bug worth the rule it restates:** `_dress1-skin.mjs`'s first A6 aimed at the
   **mean** of the canvas fragments — which on `f.gal_east.0.b` is bare wall **between two
   paintings**. 24 full blows ate 16 wallpaper fragments and zero canvas, and the check reported
   **0.0% while the mechanism worked perfectly.** Fixed by clustering.
   **The three defects, re-measured:**
   - 🖼️ **Gallery portrait — dissolved, and the biggest win.** 5 of 8 canvases sit inside a dig
     face, on **4 of 4** gallery-side faces; that face's skin owns **14.0% of the frame**,
     portraits alone **4.1%**.
   - 🚨 **`study_w` boiserie is largely already dodged — 1 of 5 faces, TWELVE triangles**, and the
     root cause is one line: `studyOrderFor`/`ballroomOrderFor` consume `cutsOnWall()` (which lists
     dig panels) and **`galleryOrderFor` does not — `cutsFor()` returns `[]`**. That is why the
     gallery is 4/4 and the studies 1/5. ⚠️ **DO NOT "fix" it by making the gallery dodge too.**
     John asked for dressing that ERODES, not dressing moved off the wall; moving his art is a
     taste change he did not ask for.
   - **Boarding as black cut-outs — already closed** by `dark-3` (albedo, 2026-08-09) and never a
     "wall behind it is gone" problem. **Live successor: `exterior.dress.mortar.segment`** — the
     92%×88% opaque slab — is on **8 of 28 free faces**, not the 2 apertures HANDOFF files, because
     `dressingRule` exempts dig bands.
   ⚠️ **`wall.js`'s "a dig face's outer skin IS the room's own wall" is true in 2 of 6 rooms** —
   `estateSkinMat()` hardcodes service/chapel boiserie while the gallery is `ws.paper`, the
   ballroom a different `est-bois` and both studies `walnut`. ✅ **Reproduced exactly by
   `coatbake-1`: 20 of 28 faces mismatched.**
   🚨 **PRICED 2026-08-11 (`coatbake-1`) — THE BAKE IS NOT WHERE THE RISK LIVES. IT IS +0.** A
   per-room coat is **+0 programs, +0 bakes, +0 MB VRAM, +0 ms boot**, *provided every room's coat
   is ONE MATERIAL CLASS carrying that room's own baked textures*. Instrument:
   **`harness/scenarios/_coat1-programs.mjs`** (new; one settled station, flipped in place, never
   walked; seven controls incl. **C3 class-flip +1, without which A1's zero is worthless**).
   🎯 **THE BOUNDARY IS THE MATERIAL CLASS, NOT THE SHADER — and this is the reusable finding:
   surface GLSL runs at BAKE time, not draw time.** `walnutPanel` costs **nothing** despite being
   a completely different surface shader. The one offender is the gallery: `wallpaperMat` returns
   a `MeshStandardMaterial` while `boiserieMat` (clearcoat 0.25) and `walnutPanel` (0.55) return
   `MeshPhysicalMaterial`. **Clearcoat VALUE is a uniform; clearcoat PRESENCE and the class are
   program parameters.** One class + per-room textures **+0** (4/4 rooms); each room its own maker
   **+1, and only that one room**. **3 of 4 room-wall materials already create zero programs of
   their own.**
   ⚠️ **`patchForScreenAO` checked and it is a dead end for this** — all 28 free faces already
   share the key `rrr-wall|dig|rrr-ssao-v1`. Load-bearing for separating the dig arm from estate
   walls, **useless as a per-room separator AND as a merger**: C3 moves the counter +1 with the key
   held identical. **No cache key can undo a class difference.**
   **Bake: 4 distinct room bakes (not six — studies share, service/chapel share), ALL FOUR CACHE
   HITS.** Getting one room's arguments wrong by 0.001 costs 1 bake · 16.08 MB · 9–14 ms. Whole
   page is 75 bakes / 672 MB / ~40 s (≈40% of cold boot); a coat adds **0.0%** of it.
   🚨 **Build the coat in the CONSTRUCTOR — zero bakes during play, never lazily on first damage.**
   **Cheaper shapes REFUTED:** an atlas is *worse* (the one shape that pays a new bake); an
   instanced attribute is impossible (every free face already needs its own material because the
   break uniform lives there). **Ship N materials, one class, per-room textures** —
   `estateSkinMat(roomOpts)` for service/chapel/ballroom (**+0**), studies/gallery from
   `material.userData.bake`. Plumbing is one lookup: **`p.ownerSpace` is already the room the face
   looks into.**
   🎨 **ONE TASTE CALL, PRICED, AND IT SHIPS AS A LIVE KEY WITH ARM 0 UNCHANGED — DO NOT QUEUE IT
   AS A QUESTION.** The gallery coat either joins the family at a token `clearcoat: 0.02`
   (**+0 programs**, marginally glossier than its paper) or matches its paper exactly as a Standard
   material (**~+6 of 231 programs, ~0.6 s cold boot** — arithmetic from the page's histogram, not
   a timed run). ⚠️ **`coatbake-1` looked at no pictures.** 0.6% of boot is not a veto, so this is
   John's eye, in game, not a number.
   ✅ **LANDED (`coat-1`): `[C]` / `?coat=0|1|2`.** Faces wearing their room's skin **8/28 → 28/28**,
   rooms **2/6 → 6/6**, **231 programs on ALL THREE ARMS**. Arm 0 unchanged **by measurement**
   (231, 8/28, 2/6, identical to the pre-change build), and the assertion flips with the arm so
   neither outcome can be a constant. `src/game/wall.js` is the whole feature; `views/game.js` got
   four small edits nowhere near `onChunk`.
   🚫 **RETRACTED BY ITS OWN AUTHOR: arm 2 is +0, NOT ~+6 programs / ~0.6 s. DO NOT REQUOTE THE
   ARITHMETIC ABOVE.** It did not accept the +0 at face value — **A5** draws each face's *live*
   `mats[0]` once, so a merely-deferred program would read +1; it reads **+0 on 4/4**. ⚠️ **The
   mechanism is UNATTRIBUTED and was not invented** — A2's in-place +1 for a Standard coat is also
   real and reproduced five times, and the two could not be reconciled from the histogram.
   🚨 **AND THE OTHER HALF OF JOHN'S SENTENCE IS STILL BROKEN, PRE-EXISTING, ON THE SHIPPED ARM:
   THE COAT HAS NEVER BEEN VISIBLE ON AN UNTOUCHED FACE.** Measured: **28/28 free faces pristine ·
   28/28 instanced · 0/28 drawing their own layer 0.** `wallinstances.js` draws every pristine face
   from ONE shared `wall.pristine.face` — **the damask wallpaper stage**. So `wall.js`'s own stated
   defect (*"a band of damask in a boiserie room gave away the dig band before a blow landed"*)
   **still happens**, and `coat-1`'s arms are judgeable **only on a face that has already taken a
   blow**. `_coat1-programs.mjs` reports it as a named FAIL on every run rather than hiding it
   (20/1; the 1 is this). **Fix is `wallinstances.js`'s group key (authored aperture → aperture +
   room coat) — the instancing path, `eo2-calls` its gate, baseline 423/625. Owner: `pristine-1`.**
   ⚠️ **One line queued for `room.js`, sequenced behind `skin-1`:** `new DestructibleWall({…})`
   should gain **`coat: mats.wall`**, parallel to the `revealMaterial: mats.reveal` already there —
   it replaces a parent-walk `coat-1` used to avoid touching another owner's file. **Nothing breaks
   without it.**
   ⚠️ **`_progkey1-independence`'s SCALAR arm now reads 5/1-skip against the recorded 12/12, and it
   is not the coat** — its picker chose a **chained** exit site. The coat cannot reach that arm
   (everything is gated on `this.field`, and the `dig=0` run skips both coat sections with 0
   console errors); panel order is `room.js`'s. 🎯 **A picker landing on a chained site turns a leak
   gate into a SKIP** — that is the result-shaped-output class. **Owner: unassigned.**
   🚫 **RETIRED: "`study_w`'s boiserie hiding 5980 of 5980 points."** That figure is nowhere in the
   tree and its shape could not be reproduced. **Do not re-brief it without its instrument.**
3. **`_couple()`'s SHOW defect** — `two-sided` 15/2. Partial depth does not cross to the far face.
   ⚠️ **Per-side depth is DELIBERATE and correct** (`dig.md` §5); the far side *should* be pristine
   until breakthrough. **Judge it on ΔGONE, not ΔGRID** — ΔGRID measures an intended asymmetry and
   will report correct behaviour as a defect. It nearly caused a fix that would have broken the rule.
4. **Debris becomes solid, pushable, and loud** — decided; the noise system now exists.
5. **The capture Director picks a door that no longer exists** and silently frames a different wall.
   Every `game.play` capture and every stored baseline goes through it.
6. **Then Phase 2**: the generator emitting slabs → aperture groups re-measured against 625
   (~+38 instanced meshes is the risk) → the id handshake → ~~the flat-plan (depth ≥ 3) and
   min-walk (≥ 1 dig) gates~~.
   🚨 **DO NOT SHIP `depth ≥ 3` AS A GATE — TESTED AGAINST JOHN'S 40 LABELS (`maplabel-1`,
   2026-08-11) AND IT REJECTS HIS OWN TASTE.** `depth` runs **AUC 0.383, p = 0.245, pointing the
   WRONG WAY** (good 2.60, bad 2.83), and `depth ≤ 2` **flags 6 of his 16 GOOD plans against only
   2 of his 12 BAD**. This is the "validate a widened gate against what it must NOT flag" rule
   catching a gate before it shipped. ⚠️ The 42.4% flat *rate* is untouched — it is the
   *inference* that flat = bad which his labels do not support; flat plans land in **MEH, not
   BAD** (P(meh | depth 2) = 56% vs 9%), suggestive at per-feature p = 0.005 but family-wise
   **p = 0.115, so it is not claimed**.
   🚨 **AND `fracInternalDiggable` — the 92.8% headline the whole packing spike optimises — IS
   AUC 0.486, EXACTLY CHANCE against his eye.** It is not worthless (it is an affordance measure,
   not a beauty measure) but **it cannot be the objective for "does this read as a house"**. The
   sharpest single row in the file is his hand-edited one (seed 88889, GOOD): **0.696 diggable,
   worse than all 39 generated plans (min 0.732), 3 voids, and he liked it.**
   ✅ **The one feature that clears the family-wise shuffle null is `hopsToExit`** (regions crossed
   spawn→exit): **AUC 0.831, family-wise p = 0.0427**, jackknife [0.815, 0.891], not confounded
   with room count or shared wall. **12 of 16 GOOD cross 3+ regions; 1 of 12 BAD does.**
   🚨 **BUT IT IS CONFOUNDED WITH THE INSTRUMENT AND THAT IS UNRESOLVED.** `hopsToExit`/`digsToExit`
   are **the two numbers the tool prints largest**, and the route is its most conspicuous overlay;
   at **18.5 s per plan**, *"taste for routes"* and *"read the number off the drawing"* are the
   same data. **`maplabel-1` step 0 settles it: 40 fresh seeds with the route overlay hidden,
   pre-registered at `hopsToExit` AUC ≥ 0.72, bootstrap power 96%.** Nothing built on his labels
   should ship before that runs.
   ⚠️ **The generator's own placement score is ORTHOGONAL to him, not opposed** — total AUC 0.41,
   `contact` 0.38 (his BAD plans won **14% more contact metres**), none significant, and the score
   is **89% `via`**. Read out of `genspike.mjs` by patching a temp copy — C1: 40/40 byte-identical;
   C2: one extra `rng()` draw makes 40/40 differ.
   ⚠️ **Brief corrections:** the feature vector is **28 fields, not 30**; the generated-only
   contrast is **15 vs 12, n = 27**. A planted rng column still reaches **AUC 0.65** at that n,
   which is the sharpest statement of how little the sample carries.

7. 🏚️ **THE WALKABLE GENERATED HOUSE — John's scope, in his words: "walk, dig, and get out".**
   IN: rooms · corridors · doors · diggable walls · the dig · a findable exit · the outside.
   **OUT: the hunter, patrol, spawn anchors.** ⚠️ **The map-critic programme is SUSPENDED** — he has
   said twice he cannot judge a house from a plan (*"I don't know the feel and can't understand
   from just a map"*), and that is a decision, not a caveat. **Scoped by `genwalk-1`; plan is
   `docs/slices/task-plangen-1.md`.**
   🎯 **THE FIRST SLICE IS SMALLER THAN §9 IMPLIES: the whole generated mode goes at MODULE SCOPE
   in `spaces.js` behind `?plan=gen&planseed=N`**, emitting `SPACES`/`PORTALS`/`PANELS`/`SPAWN`
   from one seed, rotation forbidden, one `SPACES` row per corridor RECT, every door an OPEN
   portal. **`views/game.js` and `room.js` need ZERO lines changed** for the mode itself — only
   three `src/` files import `spaces.js`, and that file already does URL-conditional module-scope
   table selection twice (`SLAB_ARM`, `DOORS_URL`/`PASSAGE_DOORS_ON`, `PANELS`).
   🚨 **`?estate=gen` IS A LIVE DEFECT AND `house-packing.md` §9.3 RECOMMENDS IT BY NAME** —
   verified by running `estateMode()`: it returns `null` and **turns the entire art port off**.
   **Use a separate parameter.**
   ✅ **Arm A (rotation forbidden) costs NOTHING in packing — it is slightly better on every axis**,
   512 seeds: voids/plan 0.72 → 0.61 (void area **5.5 → 1.4 m²**), shared wall 288.2 → 290.1 m,
   `fracInternalDiggable` 0.9279 → **0.9298**, slivers 0.90 → 0.63, `minWalk` 65.4% → 71.1%,
   closure 100/100/100 both. ⚠️ **Its only cost is VARIETY and no metric in §9 reports it:**
   envelope aspect 1.571 → **2.220**, long axis on X **47.9% → 94.1%** — *a shoebox pointing the
   same way on 19 of 20 seeds*. Flat rate 42.4% → 65.8%, **reported not gated** (per `maplabel-1`
   that is not a taste regression).
   ✅ **Arm B (turned rooms) is FAR smaller than §9.4b says — 4 of the 5 room types already take a
   quarter turn today**, and a quarter-turned study **builds** headless (exit 0, valid `orderPlan`,
   315 meshes / 156.5k tris). §9.4b's *"both orders need the gallery's treatment"* is **overstated**.
   The only throw is the ballroom's `sp.columns`. Bill: one library field, one reader at
   `room.js:2042`, one `placeColumns`, plus a critic pass. **Order: A now, B immediately after.**
   **The five blockers, re-measured:** ① `EXIT_SITES` confirmed but **cost refuted** — it must be a
   function of the PLAN, not take a plan argument; **zero-line downstream**, the real cost was
   always emitting a correct `PANELS`. ② `YARDS` **~5 lines** (`YARDS[id] ?? DEFAULT_YARD`); §9.4b
   is wrong about why — the spec is authored in the yard's own panel-derived frame, not world
   coordinates. ③ Station anchors safely deferred (`HunterAI._patrol` never reads `wp.space`, so
   stale ids cannot throw) — 🚨 **but `SPAWN` is NOT in that set and IS on the critical path**
   (`views/game.js` places bodies at authored world coordinates), ~4 lines, slice 1. ④ `at[1]`
   confirmed all-zero, stays 0, costs nothing. ⑤ New mode safe — node-side scenario imports have no
   `location`, so `escape` 20/20 and `mechanics` 13/13 take the authored plan **by construction**.
   🚨 **THREE COSTS §9 DOES NOT NAME:** ① **a corridor region is a POLYGON and a `SPACES` row is a
   RECTANGLE** — 54.8% of corridors are multi-rect (mean 2.21, max 9), so one row per rect gives
   **16.6 spaces/plan against 6 today**: cheap fix, real draw-call consequence, measure it.
   ② `genspike.mjs` lives in `harness/` and `src/` needs a relative import for `vite build`.
   ③ ⚠️ **`house-packing.md` §1's "512/512 gates pass" IS WEAK EVIDENCE — the closure gates are
   near-tautological.** A 272 m ballroom leaves `allReach`/`exitReach`/`hunterAll` at **100.0% on
   all 512 seeds** while `fracInternalDiggable` falls to **0.686**. `C4` (512/512 FAIL) ships to
   keep them falsifiable.
   **Instruments (all pure Node, `src/` and `genspike.mjs` byte-unchanged):**
   `harness/evidence/_genwalk1-rot.mjs` (4 controls) · `_genwalk1-place.mjs` (10/0) · `_genwalk1-build.mjs`
   (control must build, `ballturn` must throw).

## Waiting on John

✅ **ANSWERED 2026-08-11 — THE WALL PUNCHES THE APERTURE. John's call, do not re-litigate it.**
A generated wall is ONE slab per side and every doorway is a HOLE CUT THROUGH IT — no seam at a
door. From inside it reads as one unbroken plane with openings in it, and **a dig runs past a
doorway without meeting a joint**. This is what `?slab=1&doors=1` already does in the damage grid
(`_ap2-rule.mjs`); it is the GEOMETRY half that does not match yet, which is why
`buildWall`'s cut-inside-a-cut is now a blocker rather than a nuisance.

✅ **ANSWERED — the map labels exist: `tools/mapdesigner/labels.jsonl`, 40 rows,
16 good / 12 meh / 12 bad**, one of them (seed 88889) `handEdited`. ⚠️ **AND HE ATTACHED A
CONSTRAINT TO THEM THAT MATTERS MORE THAN THE COUNT:** *"because I haven't played a procedural map
yet I can't be sure of my results… I could kind of think about the room layout and the pathways for
the player and the hunter but I can't also think about all the different door functions… I also
don't know what a good one looks like."* **He is labelling a picture of a thing he has never walked
through.** Treat the 40 as a signal about PLANS, not a ground truth about houses, and read
`maplabel-1`'s analysis before weighting them. **The implication for ordering: a walkable
`?estate=gen`, however rough, is worth more than a better score, because it is the only thing that
calibrates his eye.**

🐞 **AND HE FOUND A REAL DEFECT IN THE TOOL WHILE DOING IT — his eye, not a metric, third time
this campaign.** *"I don't understand the cyan parts either because they are still on the map when
I was made to understand they were inside the orange line."* **The cyan family carries THREE
referents**: `C.ic` (`app.js:363`) the interconnect, the one place a dig gets you THROUGH;
`C.nodig` (`app.js:368`, five lines later in the same loop) a boundary too short to dig, the exact
opposite; and the prose he was given — *"the cyan is BEHIND the orange"* — which is the game's
barrier and is **neither of the things actually drawn**. The legend at `app.js:969` states the
collision out loud (*"same colour… because it is the same answer"*) three sentences after calling
the interconnect the one way through. **Owner: `maplabel-1`.** ⚠️ **His 40 labels were taken under
this drawing.**

Still open, and nobody should guess them: the chapel refuge, now that the hunter enters through
doors · the open doorways photographing as full-height dark voids.

## Rules earned this session — carry them

1. 🚨 **Every assertion ships a control that must FAIL, run every time.** Sixteen recorded
   instrument failures share one mechanism: **a result-shaped output instead of an error**, so
   *"I could not observe"* and *"there is nothing there"* were indistinguishable. **Twelve of the
   sixteen would have gone red on their first run with a control.**
2. **Name the instrument in the brief and say whether it exists.** If it does not, building it *is*
   the slice. (Replaces "sharpen the question" — that is a self-assessment you cannot check later.)
3. **A finding enters `HANDOFF.md` as a line + a number + the instrument. The argument lives in the
   instrument's header** — when five agents were killed, what survived did so by where it was
   written: header intact, transcript partial, nowhere lost.
4. ⚠️ **An instrument that re-derives the thing it measures will agree with it.** Two probes
   inverted the code they were testing in closed form. **Solve by asking the game, not by
   re-deriving.**
5. ⚠️ **`still.mjs`'s `hold()` empties `engine._updaters`.** Any A/B that flips state and expects
   the scene to follow **must not be held** — one reported Δ0 at four stations, measuring nothing.
   It is also **within-session only**; use `shoot.mjs` capture mode across an edit.
6. **Three concurrent Opus builders, and never start a slice near a reset boundary.** ~10% of all
   spend went to agents killed mid-edit — five in one 14-minute window, *one clock, not five
   decisions*.
