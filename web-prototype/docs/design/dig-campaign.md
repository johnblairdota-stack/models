# Campaign: THE DIG — sledgehammer, white, cyan

**Opened 2026-08-07. This is the current ordering. `HANDOFF.md` is still the facts.**

John, 2026-08-07, on nine new generated images:

> *"I want to build out the dig as you see with big chunks of the wall falling away. Its just white
> underneath and they are trying to find the doorway hidden behind the wall to progress through
> procedurally generated rooms and eventually one leads to outside. The hunter will be key later but
> I want the feel of sledge hammering the wall to be satisfying and familiar."*

And on how to get there:

> *"I should have built more of the game to make it a better slice… we need to develop much more of
> the gameplay and mechanic and feel before we iterate all the assets."*

**That second sentence is the campaign's thesis and its main risk control.** The board has spent
thirty-seven pieces' worth of rounds making things look right. This campaign spends its rounds on
how the game *plays*, and freezes the art everywhere the dig does not touch.

---

## 1. What this campaign is

**Done when:** `?dig=1` plus a room generator is the **default build**, a play critic has re-judged
`game.play` on that build, and **John has said the hammering feels "satisfying and familiar."**

That last clause is not decoration. **John is the taste authority for this campaign.** Critics rank
and measure; John chooses. No critic proposal enters the build queue without him picking it at a
checkpoint (§5).

### In scope
- **The sledgehammer** — the tool in the new art. Today the melee tool is a detached limb
  (`limbClub`, 34 dmg). The hammer is new construction.
- **The decay curve** (`dig.md` §5) — big chunks shallow, chips deep, bottoming out at the barrier.
  The one remaining item from `dig.md`'s own order of work that is pure feel.
- **White + cyan** — the new art's material language, replacing the brick barrier that `dig.md` §6a
  settled against the *old* reference. Per the standing rule, **the art wins.**
- **The satisfaction pass** (`dig.md` §6) — legible lip, breakthrough beat, persistent debris,
  everything instanced from the start.
- **The room generator** + the solvability gate (`procedural-map.md` §5) — "procedurally generated
  rooms and eventually one leads to outside."
- **Audio** — `src/audio/audio.js` has no melee voice at all. A sledgehammer with no sound cannot be
  satisfying, and nobody has ever heard the three voices that do exist.
- **~~The AO perf debt~~ — 🚨 THE "2× OVER BUDGET" CLAIM WAS FALSE. Corrected 2026-08-08 by
  `board-audit-2`.** Measured at pinned `quality=medium`, two runs: **1.33–1.60 ms against a
  1.39 ms budget — 0.96×–1.15×**, over in one or two of six spaces, not house-wide.
  ⚠️ **The 2× was the PRE-fix number.** `perf-ao` landed on 2026-08-04 and took the worst space
  **3.0–4.2 → 1.22–1.38 ms**; `HANDOFF.md` recorded that at the time and the campaign framing simply
  carried the stale figure forward. **Frame rate is still feel**, but this is a trim, not a debt —
  see the re-scoped `perf-ao-4` in Wave 2. *Kept visible rather than deleted, because "a number that
  was stale in the dangerous direction" is exactly the failure this project keeps having.*
- **The token diet** — see §6. `HANDOFF.md` is 365 KB and every agent is told to read it first.

### Out of scope, with the reason
- **Hunter tuning** — John: *"key later."* Deferred to the next campaign. ⚠️ **But not the hunter
  reachability assert**: the generator's solvability gate must still prove the hunter can reach
  every room, or this campaign ships maps the hunter campaign cannot use. That is a static graph
  property and costs nothing now.
- **Art polish outside the dig** — `hunter.3` 85, `char.turnaround` 61, the estate floor material,
  `mat.brass` 44: all parked. The dig slice legitimately claims dig-stage surfaces, the hammer prop,
  debris and dust. Nothing else.
- **Multiplayer / net client wiring** — unchanged from `PLAN.md`'s reasoning: dig changes what has
  to be synced. ⚠️ **Keep the purity rules anyway** — generated ids must stay pure functions of
  (seed, authored tables), and `PANELS`/`DIG_EDGES` ids are append-never-insert. Free now,
  expensive to retrofit.
- **Wind-down / bomb / detonation** — `BOMB_SECONDS = 90` is labelled UNMEASURED in source, and the
  timer must be measured against the map it ships on. **The generator changes the map.** Re-open at
  campaign close, not before.
- **`char.detail` / `char.poses`** — still correctly gated behind `char.turnaround` reaching PASS.

---

## 2. Phase 0 — John's hour. No agent can do any of it.

**Blocks Wave 2.** Wave 1 may run in parallel with it.

✅ **Verified working 2026-08-07 before this was written** — build green, `mechanics.mjs` 11/11,
`dig-link.mjs` 14/14 on `seed=s4&dig=1`. The URLs below boot. Your hour will not be spent on a
broken tree.

```bash
npm run build
npm run preview
```
→ `http://localhost:5179/?view=game.play`

⚠️ **Use a real browser** (Chrome/Firefox), not an embedded preview pane — the pane choked on the
material bake; Playwright and a normal browser handle it fine.

### 🚨 2a. The load time is a campaign problem, not an annoyance

**John reports ~5 minutes to load. Measured on the same machine, a Playwright boot is 20–40 s, and
his GPU is an RTX 3060 Ti** — so this is not weak hardware and it is not the documented "~15 s".

**The cause is known and it is deliberate.** `src/views/game.js` (~947–1131) does the expensive work
*inside the loading screen* on purpose: residency, `exterior.warmup(true)`, and priming shader
programs for **4 variants × N spaces × 4 looks** — because `perf-stall-1` proved by removal that
skipping it puts multi-second freezes into play. Its own comment: *"a draw the driver skips, so the
program is never built. Prime them here, in the loading screen."* ⚠️ **The trade is correct. Do not
fix this by deleting the prewarm and handing the freezes back.**

**Why it is campaign-blocking rather than cosmetic:** this campaign's entire risk control is John
playing at three checkpoints across several seeds each. At five minutes a load, Phase 0 alone is
**fifteen minutes of pure waiting inside a sixty-minute session**, and every checkpoint after it
pays the same tax. **A feel-first campaign whose taste authority cannot iterate is a feel-first
campaign in name only.** Hence slice `boot-1`, added to Wave 1.

### 2b. What the first diagnosis pass actually found (orchestrator, 2026-08-07)

**Hardware acceleration is NOT the problem.** `chrome://gpu` on John's machine: WebGL **Hardware
accelerated**, GPU0 **NVIDIA RTX 3060 Ti \*ACTIVE\***, Chrome 150. That hypothesis is dead — do not
spend `boot-1` re-testing it.

**The lap is 96 full pipeline renders** — `2 (gun lights) × 2 (hunter flare) × 6 spaces × 4 looks` —
each with *every object in the scene forced visible*, through a stack running a depth prepass, AO,
bloom mips and FXAA.

**🎯 THE MASS IS SHADER COMPILATION, NOT FILL RATE. Measured, both arms, `_warmup-receipt.mjs`:**

| arm | lap resolution | programs built | wall clock |
|---|---|---|---|
| new | 320 × 180 | **1054** (527 → 1581) | 108 s |
| old | 1280 × 720 (`?warmres=full`) | **1054** (527 → 1581) | 113 s |

**Identical to the digit.** That confirms the principle now implemented — **resolution is not part
of the program cache key** — and it is why the small-buffer lap is safe. But the two arms cost
almost the same at 720p, which proves **fill was never the dominant term. 1,054 program
compilations are.** At roughly a quarter-second each that is about the five minutes John sees.

⚠️ **So the resolution fix is correct, free and verified — and it is NOT the lever.** It is landed
(`?warmres=<width>`, default 320; `?warmres=full` restores the old lap) because it costs nothing
and removes fill from the variables. **`boot-1`'s real target is the 1,054 programs**: reduce the
permutation count, or get the driver's on-disk program cache to survive between loads. ⚠️ Confirm
before optimising whether John's *second* load is fast — if it is, the cache works and the fix is
about the first load only; if every load is five minutes, the cache is being invalidated and
**that** is the bug.

### 2c. What was FIXED at campaign open (orchestrator, 2026-08-07) — all four suites green after

Three defects, found because John played it and the harness could not.

1. **🚨 "Page unresponsive" — the loading screen was a HUNG TAB.** The lap ran 96 renders and
   ~1054 compiles in **one unbroken synchronous block**, so Chrome's main thread never returned to
   the event loop. **Why no instrument ever caught it: `playtest.mjs` waited a fixed 6 s and then
   clicked — and Playwright's `click()` auto-waits for the main thread, so the click simply queued
   behind the freeze and landed afterwards on a button that by then existed. The suite passed while
   the page was hung.** Fixed by yielding once per render (MessageChannel — *not* `setTimeout` or
   `rAF`, both of which are throttled or stopped in a background tab, which would strand the load
   if John alt-tabbed away), plus a real `Compiling shaders… NN%` readout. ⚠️ **`playtest.mjs` now
   waits for `window.__rrr.ready` instead of a stopwatch** — the fixed wait was hiding this.
2. **⚡ Retry reloaded the whole page.** John: *"every time I retry after dying or finishing the
   game loads from the start."* Both `buildDeathWatch` and `buildEscapeWatch` called
   `location.reload()`, each documenting the same reasoning — *"a hand-rolled reset would have to
   unwind the player, the limb field, wall damage, hunter growth, debris, dust and the director…
   a reload is provably total. It costs the texture bake again, which is the honest price of being
   certain."* **The reasoning was right and the price was wrong, because nobody had measured it** —
   the honest price is 83 s of shader compilation, on every death and every win. **And the
   hand-rolled reset it feared already exists: it is `resetRound()`**, which runs every 28 s in
   capture and whose own comments record the partial-reset bugs already found and fixed. Retry now
   reuses it. `?retry=reload` restores the old behaviour.
3. **The warm lap ran at full window resolution** — now 320 px wide, since resolution is not part
   of the program cache key. Verified identical: **1054 programs either way.**

⚠️ **The one risk to watch, and it is the reason the reload existed:** a partial reset. If after a
retry the hunter already knows where you are, limbs are missing at the start, wall damage persists,
or a second escape produces no win screen, **that is this change** — say so and it reverts with
`?retry=reload`. `out` and `shown` are both cleared in the win watch precisely because leaving
`out` set would swallow the next escape silently.

**What is still open:** the load is **~112 s to ready in the harness at 1280×720** (83 s of it the
lap), and John saw ~5 min in Chrome at 1080p. **`boot-1`'s remaining target is the 1054 programs
themselves** — reduce the permutation count, or make the driver's on-disk program cache survive
between loads. The three fixes above make it *tolerable and honest*, not fast.

**Workarounds available immediately, no code change and no terminal:**
- **`&quality=medium`** — fewer shader permutations to compile, so a shorter prewarm. This is also
  the setting every perf measurement in this project is pinned to.
- **Never hard-reload (Ctrl+Shift+R)** — the GPU driver's compiled-shader cache is what makes the
  *second* load fast. A hard reload throws it away and pays full price again. F5 is fine.
- **`chrome://gpu`** in the address bar — "Graphics Feature Status" must show WebGL as **Hardware
  accelerated**. If it says software or SwiftShader, that alone explains the whole gap.
- **`PLAY.bat`** in the project root — double-click to build if needed, serve, and open the game.
  Written 2026-08-07 because John does not use a terminal; **every future instruction to him should
  assume that.**

### 1. Play the dig build (~20 min)
- `?view=game.play&seed=s4&dig=1`
- then `?view=game.play&seed=s7&dig=1`
- then one run with `&unlock=edge` appended

**Capture:** (a) was finding the interconnect *fun* or a *chore*? Measured cost today is **4–7 dud
bays and 28–49 s** — does that feel long or short in the hand? (b) **global vs edge unlock** —
`dig-2` built both specifically so this could be answered by playing rather than argued
(`dig.md` §1). (c) best single moment, worst single moment.

⚠️ **(a) sets a BAND, not a direction.** The play-critic brief will carry it as a band, because a
critic told "lower is better" would optimise the search out of existence — and the search is the
game.

### 2. Listen (~10 min)
Same build, sound on. **Nobody has ever heard `src/audio/audio.js`.** Three voices exist: gunshot,
wall-crossing-a-stage, hunter proximity. There is **no melee impact voice at all**.

**Capture:** timbre verdict per voice; mix balance; and the fatigue question — *is the wall sound
bearable for the 100+ hits a dig session takes?* This gates all Wave 2 audio work.

### 3. Confirm five decisions, one sentence each

| # | decision | recommendation |
|---|---|---|
| 1 | **White/cyan supersedes brick** — and does it apply to dig bays only, or the whole destructible language? | **Dig bays only this campaign.** The timber stages (wallpaper→plaster→lath→beam) carry `wall.sheet` PASS 78, the board's only material PASS lineage; doors and exits keep them. |
| 2 | **Sledgehammer vs limb club** — replace, or coexist? | **Coexist.** Hammer = the found dig tool; limb = the desperation weapon. Limb-loss-as-health is the game's identity and `limbClub` is already measured. |
| 3 | **The destruction meter in the art** | **Do not build it.** `dig.md` §6a.2: a numeric readout replaces the physical tell with a number, and reading how fast the wall gives way *is* the search heuristic. Spend the legibility budget on the wall. |
| 4 | **The 4-stage barrier diagram** (micro-fracturing → pitting → structural failure → deep collapse) | Maps cleanly onto the existing dig stages + barrier. The barrier itself stays **undamageable** — it is the answer, not a fifth thing to break. |
| 5 | **Bomb stays deferred** | Confirm. |

### 4. Put the nine images on disk
They exist only in the chat. **No agent can reach them.** Drop them anywhere — suggested
`refs/dig/incoming/` — and `refs-dig-2` renames, indexes and sheets them.

### Where the answers go
Straight into §8 of this file. Everything downstream cites §8, not the chat.

---

## 3. The waves

**Conventions** (all existing process — `rrr-slice`, `rrr-pipeline`; nothing new invented here):

- Every slice gets `docs/slices/task-<name>.md` with the nine required parts.
- **Opus writes slice docs and does diagnosis. Sonnet executes decided slices and critiques.** The
  line is decided-vs-undecided, not builder-vs-critic.
- Builders cap at `PASS`. Only an agent named `critic-*` may set `WOWED`.
- **▮ marks the single GPU-measurer lane.** Never two at once.
- Each wave spawns **on John's go**. Every brief carries a deadline and *"file partial work honestly
  rather than die undocumented."*

### Wave 1 — Hygiene and the token diet
*3 Sonnet, parallel, cheap. `handoff-diet-1` blocks Wave 2.*

| slice | scope | owns (exclusive) | gate |
|---|---|---|---|
| **handoff-diet-1** | Split `HANDOFF.md` 365 KB → core **≤20 KB** + `docs/handoff/*.md` appendices + archive. Measured: three sections are 54% of the file (Queue 111 KB, John's-playthrough-bugs 47 KB, instrument hazards 36 KB). | `HANDOFF.md`, `docs/handoff/**` (new), `docs/archive/**` | `wc -c HANDOFF.md` ≤ 20480; every archived block reachable from a pointer; **no `src/` or `harness/` file touched**; `npm run build` green |
| **refs-dig-2** | Ingest the nine images → `refs/dig/`, index them in `refs/REFERENCE_INDEX.md` + `refs/_index.tsv` with the generated-art caveat, build `refs/_sheets/dig.png`. **Until this lands, no slice may cite the new art as a bar.** | `refs/**` | index entry says what each image is FOR; sheet exists and is readable in one open |
| **board-audit-2** ▮ | Refresh the board and the tree; correct `docs/PLAN.md`'s stale numbers with *measured* ones; **propose** (do not execute) the root-litter cleanup — **55 stray PNGs / 32 MB + 17 debug `.mjs`** in the repo root. No git, so archive-move on John's approval only. | `docs/PLAN.md`, `progress/**` | `mechanics.mjs` 11/11, `escape.mjs` 20/20, `eo2-calls.mjs` baseline recorded, `audit.mjs --render` clean |
| 🚨 **boot-1** *(Opus-owned, diagnosis — ADDED 2026-08-07, partly done at campaign open, see §2a)* | **John's load takes ~5 minutes.** Orchestrator did the first pass and **found the mass: the lap compiles 1,054 shader programs.** Remaining work is reducing or persisting that, not re-diagnosing it. ⚠️ `perf-stall-1` proved the freezes by removal — **the trade is right and must not be fixed by deleting the prewarm.** | `src/views/game.js` prewarm block only | **a cold load under 60 s on John's machine at `quality=high`**, with `perf-stall.mjs` still showing zero programs built during play |

### Wave 2 — The hammer *(the feel core)*

| slice | scope | owns | gate |
|---|---|---|---|
| **sledge-1** *(Opus plans / Sonnet executes)* | The sledgehammer: prop, wind-up → contact → follow-through on the existing rig swing, damage and cooldown decided in the slice doc, body and camera reaction on contact. Coexists with `limbClub`. Calls `playMeleeImpact(stage)` — **this slice defines that interface, `audio-3` implements it.** | `src/game/player.js`, `src/game/locomotion.js`, `src/game/weapons.js`, new sledge file | `swing-weight.mjs` (the *body* moves, not just the arm); `dig-feel.mjs` seconds-per-stage within ±10% or deliberately retuned; `mechanics.mjs` 11/11 |
| **audio-3** *(Sonnet)* | John's Phase 0 verdicts, **plus the melee impact voice that does not exist**: per-stage timbre — paper tear → plaster crunch → deep thud → **dead clank on the barrier**, which is *"not here"* delivered as sound. Fatigue-safe variation. | `src/audio/audio.js` | offline render non-silent **and spectrally distinct per stage**. ⚠️ Verify the *output*, not that a function ran — the lying-instrument pattern has bitten this project six times |
| 🚩 **chunks-1** *(**Opus-owned** — the campaign's core slice, `docs/slices/task-chunks.md`)* | **Free-form positional destruction: white chunks fall off where the hammer lands.** Replaces the segmented bay system per John's 2026-08-07 rejection. A CPU damage grid becomes gameplay truth; `breakmask.js`'s scalar threshold becomes a texture sample; the depth falloff, cyan barrier, seeded interconnect and global unlock all carry over at continuous granularity. | `src/materials/breakmask.js`, new `src/destruction/damagefield.js`, `src/game/wall.js`, `src/game/dig.js` | `wall.sheet` **pixel-identical** with the new path inactive (protects PASS 78); `mechanics.mjs` 11/11; `escape.mjs` 20; a stranger reads the hole as smashed, not faded; walk through the hole you made |
| ~~**decay-3**~~ | ⛔ **SUPERSEDED by `chunks-1`.** It was going to tune per-bay healths; the depth falloff is now intrinsic to the damage field, so tuning it inside `chunks-1` is the only coherent place. The honest metric survives unchanged: **time to FIND the way through, including wasted digging.** | — | — |
| **perf-ao-4** ▮ *(**RE-SCOPED and DOWNGRADED** 2026-08-08 — Sonnet, not Opus)* | 🚨 **The premise was wrong: it is not 2× over, it is 0.96×–1.15×.** So this is no longer a diagnosis slice. What remains: **`gallery` at 1.52–1.60 ms and `service` at 1.46–1.54 ms are the only two spaces over**, and `chunks-1` is about to add per-hit texture uploads and far more debris — so the job is to **hold the line while the dig lands**, and re-measure after `chunks-1`, not to hunt a phantom overrun. ⚠️ Landmine if anyone does touch AO: `uTexel`, `uAOSize` and a hand-tuned `*2.0` are coupled — shrinking `depthRT` changes how AO *looks*, so every candidate ships with a pxdiff at three stations. ⚠️ `perf-spaces.mjs` reported CPU settling drift on `gallery`/`study_e` in its discarded warm-up lap both runs — **verify that is warm-up only before trusting a small delta.** | `src/post/**` | no space above **1.39 ms** after `chunks-1` lands, or a written finding naming what pushed it over |

No file collisions: player/locomotion/weapons ∥ audio ∥ dig ∥ post. `perf-ao-4` holds ▮; `decay-3`'s
timings are playtest-side and may run, but must not invoke `eo2-calls` or `perf-*` concurrently.

**→ FEEL CHECKPOINT A** (§5)

### Wave 3 — The look *(sequenced — both slices want `dig.js`)*

| slice | scope | owns | gate |
|---|---|---|---|
| **whitecyan-1** *(Opus plans / Sonnet executes; **after `chunks-1`**)* | New `src/materials/surfaces/digstages.js`: ornate top coat → **white paneling** body → **cyan structure** barrier, now applied to a *continuous* surface rather than staged panels. ⚠️ Scope shrank — `chunks-1` owns `breakmask.js` and the barrier's *behaviour*; this slice owns how the three materials **look**. | new `digstages.js` | blind `rrr-critique` read against `refs/_sheets/dig.png` (primary bar: `dig-gallery-sledge-crew.webp`, 2000×1125). ⚠️ `wall.sheet` still pxdiff-identical |
| **satisfy-1** *(Opus plans / Sonnet executes)* | ⚠️ **Scope shrank — the chunks themselves moved into `chunks-1`, where they belong** (chunk size must track depth removed, which only the damage field knows). What remains: **the breakthrough beat** (light through the gap, dust pushed at you, sound), persistent floor rubble, and 🆕 **the house-wide unlock moment — the act break nothing currently announces** (§8). **Every particle instanced from the start.** | `src/destruction/debris.js`, `src/destruction/dust.js` | `dig-fx.mjs`; ▮ `eo2-calls.mjs` delta **≤ +6** at the worst station. ⚠️ Skate trail precedent: **+82 draw calls for 76 sprites** |

**→ FEEL CHECKPOINT B**, plus one batched Sonnet critic (art-vs-refs *and* playcritique in one agent).

### Wave 4 — The rooms
*Starts only after `chunks-1` has settled the destruction representation — the ids and the replay
format are a network protocol surface.*

⚠️ **Correction to `procedural-map.md`: items 1 and 2 are already BUILT.** The connector interface
has `conn-1.mjs`/`conn-2.mjs`, and `exterior.js` implements `?tells=blind|marked|off` with `blind`
(seeded, indistinguishable) as the default. This wave is items **3 and 5 only**.

| slice | scope | owns | gate |
|---|---|---|---|
| **gen-1** *(Opus plans / Sonnet executes; split if it exceeds one sitting)* | The seeded room generator on the built connector interface. Emits layout + `DIG_EDGES` + exits as **pure functions of (seed, authored tables)**. One room placed deliberately hunter-too-small — the D7 1.20 m refuge mechanic is a mechanic expressed as a number and must survive generation. | new `src/game/generator.js`, `src/game/run.js`, `src/game/room.js` (consume layout) | new `harness/scenarios/gen-gate.mjs`: **512+ seeds × 4 asserts** — an exit is reachable; nobody can be sealed in; the hunter can reach everyone; a minimum walk exists. Modelled on `escape.mjs`'s 512-seed determinism proof |
| **conn-4** *(Sonnet, small)* | Re-verify the connector interface and the blind tells against **generated** layouts. Fix drift only — do not redesign. | `src/game/connectors.js`, `src/game/spaces.js` | `conn-1.mjs` + `conn-2.mjs` green on ≥3 generated seeds |
| **residency-3** ▮ *(Sonnet)* | Residency as a **generation constraint** — reject or repair layouts whose sightlines blow the draw-call ceiling. `procedural-map.md` §4's warning: a generator that lines rooms up into a long sightline blows the budget instantly. | generator constraint module | worst generated station ≤586 across 12 sampled seeds |

### Wave 5 — One leads outside
- **outside-2** *(Sonnet)* — exterior and yard wiring for generated exits; the full loop dig → rooms
  → daylight. Owns `src/game/exterior.js`. Gate: the `escape.mjs` pattern extended over generated
  seeds; `eo2-siege.mjs` still in window.
- **play-int-1** *(batched critic, Sonnet, read-only)* — full `rrr-playcritique` on the candidate
  default build: ranked felt-defects plus 3–5 small proposals ranked by felt-improvement-per-work.
- **feel-fix-\*** *(small Sonnet slices)* — **only** the items John picks at Checkpoint C.

**→ FEEL CHECKPOINT C**

### Wave 6 — Ship
- **default-on-1** *(Sonnet)* — dig + generator become the default; `?dig=0` stays as the escape
  hatch and the historical-comparison arm. Gate: `mechanics.mjs` 11/11, `escape.mjs` contract green.
- A critic re-judges `game.play` (WEAK 68 today). Only `critic-*` may move it.
- Orchestrator closes the campaign: HANDOFF core updated, restart pack written, `docs/PLAN.md`
  rewritten for the next campaign — **which is the hunter.**

---

## 4. Dependency edges (the short version)

```
handoff-diet-1 ─────────────┐
refs-dig-2 ─────────────────┤
board-audit-2 ──────────────┴──► Wave 2 spawn

Phase 0 (John) ─────────────────► Wave 2 spawn   [audio-3 and decisions 1-3 both need it]

sledge-1 ──┐
audio-3 ───┼──► CHECKPOINT A ──► whitecyan-1 ──► satisfy-1 ──► CHECKPOINT B
decay-3 ───┤                                                         │
perf-ao-4 ─┘                                                         │
                                                                     ▼
decay-3 (tables frozen) ──────────────────────► gen-1 ──► conn-4 ──► residency-3
                                                                     │
                                                                     ▼
                                                   outside-2 ──► play-int-1 ──► CHECKPOINT C
                                                                     │
                                                                     ▼
                                                              default-on-1 ──► critic re-judge
```

---

## 5. The feel loop

The campaign's thesis is feel-first. The standing risk is a critic loop optimising a number John
does not care about — the Ketone-IQ failure mode: a beautiful build, off brief.

**Two instruments, one authority.**

- **Instrument 1 — `rrr-playcritique`** after every feel-touching wave (2, 3, 5), batched into ONE
  Sonnet agent per wave. Output: ranked felt-defects, then 3–5 proposals ranked by felt-improvement
  per unit of work. ⚠️ It does **not** set `game.play`'s board score and does **not** fix anything.
- **Instrument 2 — the honest metric table** (§7), re-measured after every wave that moves a damage
  number. Time to *find* the interconnect, including duds.
- **Authority — John.** Critic proposals never enter the queue until he picks them at a checkpoint.

**Three checkpoints, each with a fixed script so answers are comparable across waves.**

| | after | ~time | the question |
|---|---|---|---|
| **A** | Wave 2 | 10 min | **The swing.** Does one hit feel heavy? Does the hundredth? |
| **B** | Wave 3 | 15 min | **The wall.** Is a *dud* dig still fun? Did you read the chunk-rate, or ignore it? Does the cyan read as an **answer** or as a **bug**? |
| **C** | Wave 5 | 25 min | **The run.** Three generated seeds end to end. Which room do you remember? |

Every checkpoint captures the same three things: **3 best moments · 3 worst moments · one sentence
you would put in the trailer.**

**A checkpoint can FAIL a wave.** The wave re-opens with John's words as the new bar. That is
cheaper than shipping past it and discovering it at Checkpoint C.

---

## 6. Token playbook

John asked for this explicitly. The mechanics, then the project-specific rules.

**Cache mechanics.** The subscription prompt cache holds ~1 hour of inactivity and refreshes on
every message; a cache-cold reread costs roughly **20× a cache read**. It is reset by switching
model, connecting or disconnecting an MCP server, compaction, and plugin or config changes.

1. **The HANDOFF diet is Wave 1, slice 1, and it blocks Wave 2.** 365 KB is ~90 k tokens, and
   *every agent in this project is told to read it first*. It is the single largest recurring cost
   in the campaign. After the diet the standing brief line becomes: **"read `HANDOFF.md` (core,
   small), then ONLY the appendix your slice names."**
2. **One model per session, for the session's whole life.** Switching mid-session throws the cache.
3. **Never let compaction happen to a working orchestrator session.** Write the restart pack
   **before** the window ends (`docs/agents-resume-<date>.md` — the pattern already exists and has
   been proven three times), then `/clear` and start cold-but-cheap. A fresh session reading a 15 KB
   restart pack is far cheaper than resuming a 400 k-token stale conversation.
4. **Spawn discipline.** Briefs ≤2 KB, pointing at the slice doc — never restating it. **Use
   `SendMessage` to continue a live agent** (warm cache) instead of respawning it. Respawn only on
   death, with the archaeology preamble. **Never trust a death-notification quote** — task
   notifications have shown an agent's *first* message, not its last, and one "idle" agent had
   written a 33 KB file.
5. **Routing is a token rule, not just a quality rule.** A *decided* slice to Sonnet: 235–265 k
   tokens, changes land, no regression. An *undecided* defect list to Sonnet: **462 k and a
   regression that deleted the character's signature element.** Batch critics — one Sonnet per
   critique wave, not one per piece.
6. **Images: sheets before singles.** A 1080p read is ~2,800 tokens; a five-up sheet conveying the
   same comparison is also ~2,800 instead of ~14,000. Read `refs/REFERENCE_INDEX.md` before opening
   anything. The Wave-1 dig sheet exists precisely so no later critic ever opens nine originals.
7. **Concurrency.** 3–4 normal; 5–6 when the concerns are genuinely independent and the window is
   fresh; **one GPU measurer at a time, always.**

---

## 7. The honest metric table

Re-measured whenever a damage number moves. Filled in as the campaign runs.

| when | time to find interconnect (3 seeds) | dud bays | siege (`eo2-siege`) | worst station calls | worst space GPU ms |
|---|---|---|---|---|---|
| baseline **re-measured 2026-08-07/08** | **27.9 · 50.2 · 48.9 s** | **4 · 7 · 7** | not re-run | **576** (`service.mid`, both runs) | **1.33–1.60** (budget 1.39) |
| after `decay-3` | | | | | |
| after `satisfy-1` | | | | | |
| after `gen-1` | | | | | |
| at ship | | | | | |

**Baseline detail, measured at campaign open** (`dig-link.mjs` on `seed=s4&dig=1`, 14/14 passed):

- 36 segments, 1.8 m tall, on `svc_w` + `svc_e`; 32 brick slabs standing; `unlock=global`.
- The answer moves with the seed — s4 → bay 3 of 9, `search-b` → bay 6, `search-c` → bay 6. **The
  wall cannot be memorised.**
- **≈7.0 s per bay.** That figure is the one `decay-3` is tuning, and the one John's Phase 0 answer
  puts a band around.
- Current dig stage table: `wallpaper 50 · plaster 140 · lath 330 · beam 850`. ⚠️ **The falloff is
  already monotone and already built** — `dig-1` set it and it has not been retuned since. `decay-3`
  tunes; it does not invent.
- The tree at campaign open: `npm run build` ✓ · `mechanics.mjs` **11/11** ✓ · escape **19 passed ·
  1 skipped** on `seed=rrr-test-1` (the skip is seed-dependent; use `seed=s4` for the recorded 20).

### 🚨 A harness trap that would have corrupted this table

**`harness/scenarios/*.mjs` are NOT standalone scripts.** They export a default function that
`playtest.mjs` drives. Verified 2026-08-07: `node harness/scenarios/escape.mjs` **prints nothing and
exits 0** — indistinguishable from a clean pass. Every scenario in this campaign runs as:

```bash
node harness/playtest.mjs --view game.play --script harness/scenarios/<name>.mjs --port <p> --q "seed=s4&dig=1"
```

**And a SKIP is not a PASS** — the harness prints that reminder itself, because a skip means the
probe could not observe what it needed.

---

## 8. John's Phase 0 answers — ANSWERED 2026-08-07, waves are GO

Verbatim, because paraphrasing a direction is how a campaign drifts:

> *"Okay, I played, there are a few sounds. they are pretty meh"*
>
> *"white under the asset as a destructable wall, the cyan barrier forces the player to find the
> interconnect to the other room. the cyan wall maybe see through but still a clear barrier in the
> future. the barrier disapears when a robot uses the interconnect to travel into the other room
> allowing other player to walk through the other areas they destroyed the white wall through to
> the other room. sledge and limbs coexist. no numeric destruction meter, ready for the waves"*

**What that settles:**

| | answer |
|---|---|
| **Audio** | ⚠️ **"a few sounds… pretty meh."** The graph is audible and not silent — so it works and it is weak. `audio-3`'s brief is **raise the quality of what exists**, not debug it, and the new sledgehammer impact voice is the headline. This is the verdict that unblocks the item `play-critic-8` ranked above everything else combined. |
| **Decision 1 — white/cyan scope** | ✅ **"white under the asset as a destructable wall."** The ornate surface stays on top; **white is the destructible layer beneath it**, cyan is the barrier under that. Confirms the recommendation: dig bays, not the whole destructible language. |
| **Decision 2 — hammer vs limb** | ✅ **"sledge and limbs coexist."** As recommended. Limb-loss-as-health survives intact. |
| **Decision 3 — meter** | ✅ **"no numeric destruction meter."** `dig.md` §6a.2 upheld; the art's meter is furniture. **Legibility spend goes on the wall.** |
| **Global vs edge unlock** | ✅ **GLOBAL, confirmed by description rather than by picking a flag** — *"the barrier disapears when a robot uses the interconnect… allowing other player to walk through the other areas they destroyed the white wall through to the other room."* `dig.md` §1's flagged reading is now John's own words, and `?unlock=global` is the shipping default. |

**🆕 And it adds a design beat that was not in any document — the one the campaign should protect:**

**THE DUDS BECOME THE ROUTES.** Every dud bay you dug to the barrier and abandoned turns into a
doorway the moment somebody finds the interconnect. So the wasted work is not wasted — **it is the
map you were unknowingly building all along**, and it opens for everyone at once. ✅ Already built
(`dig-link.mjs`: *"a dud you had already dug to the bottom becomes a door when the barrier lifts…
barrier → open on the same frame, with no further damage"*), so this is a **presentation** problem,
not a mechanics one: `satisfy-1` must make that moment **legible and loud** house-wide. It is the
campaign's act break and nothing currently announces it.

**🆕 Direction for later, recorded so it is not lost:** *"the cyan wall maybe see through but still
a clear barrier in the future."* A translucent-but-impassable barrier would let you **see the room
you cannot reach** — which rhymes exactly with the existing BEAM stage (`blocksSight:false` at the
last and most expensive stage: *you see through before you can walk through*). ⚠️ **Not this
campaign** unless `whitecyan-1` gets it nearly free; log it and move on.

### ✅ THE SEARCH BAND — answered 2026-08-08

> *"lets go about a minute to dig into another room"*

**Target: ~60 s from the first swing to standing in the next room.** Read as a band of roughly
**45–75 s**, median near 60.

Today's segmented build measures **27.9 / 50.2 / 48.9 s** across three seeds — so the target is
*slightly longer* than today, at the top of the current spread. **The dig should feel like a
commitment, not an errand.**

🚨 **THIS IS A BAND, NOT A DIRECTION, AND EVERY BRIEF MUST SAY SO.** A builder or critic told
"faster is better" will optimise the searching away, and **the searching is the game** — the whole
point of `dig.md` §5 is that reading *how fast the wall is giving way* is how you find the route.
**Coming in at 25 s is as much a miss as coming in at 120 s.**

⚠️ **And the unit changed with the pivot.** There are no bays to count any more, so the honest
metric is now: **elapsed time from the first hammer blow to passing through into another room,
including every abandoned dig.** Not time to open one hole.

### ⏳ Still open — low stakes

Best / worst moment, the four-stage mapping and the bomb-deferral confirmation. Fold into Feel
Checkpoint A.

---

## 8a. 🚩 THE PIVOT — free-form destruction replaces the bay system (2026-08-07, after John played)

> *"I don't really want to use the dud bay. I wanted a whole new system where white chucks fall off
> when hit with the hammer."*

**He is right, and `dig.md` §1 predicted it.** That section justified the entire design on the
grounds that *"with a handful of fixed candidates you find the way through by counting padlocks.
Here there is nothing to count — the wall is continuous and the answer is inside it."* **Nine bays
per wall is nine candidates.** The segmented build — chosen explicitly as the cheap proof, with
positional destruction labelled *"the real thing, later"* — reintroduced the exact defect the design
existed to remove. The proof did its job; the answer it returned is *do the real one*.

**Why it is smaller than "a whole new system" sounds:** `breakmask.js` already grows the ragged hole,
the crumbling lip and the dark undercut by comparing a baked field against **one scalar**. Making it
positional changes *where the threshold comes from* — a texture sample instead of a uniform — and the
whole look survives untouched. ⚠️ **The genuinely new work is PASSABILITY**, not rendering: a
continuous wall has no stages to hang collision, pathfinding and line-of-sight off, so one CPU damage
grid must be both the gameplay truth and the shader's input, or the two drift apart.

**Decided with it:** holes open **wherever the hammer lands, at any height**, as in the art.
⚠️ **This knowingly gives up the "too low for the hunter" refuge** (the 1.80 m low bay and the D7
mechanic it echoed). A deliberate trade, logged so nobody restores it by accident — if the refuge is
wanted back it must be re-earned another way.

**What survives:** the interconnect, the two-sided barrier, the global unlock, the depth falloff, and
the duds-become-routes payoff. Only the granularity changes.

Slice: `docs/slices/task-chunks.md` — **Opus-owned, the campaign's core.**

## 8b. Campaign log

**Wave 1 — landed 2026-08-07/08.**
- ✅ **`handoff-diet-1`** — `HANDOFF.md` **365,089 → 19,794 B** (287 lines), 9 appendices in
  `docs/handoff/`, archive at `docs/archive/handoff-pre-prune-2026-08-07.md`, 13 pointers. Verified
  independently. Every original line accounted for exactly once. ⚠️ It reported honestly that the
  hazard *examples* named in its brief (the `fbmT` bell, GLSL reserved words) **never existed as
  prose in HANDOFF** — they live in the `rrr-pipeline` skill, and the core keeps the pointer to it.
  It also declined to run `status.mjs note` because `progress/**` belonged to another agent that
  wave. Both are the behaviour the briefs ask for.
- ✅ **`refs-dig-2`** — **7 images** (not 9) ingested to `refs/dig/`, indexed, contact sheet at
  `refs/_sheets/dig.png`. **Primary bar: `dig-gallery-sledge-crew.webp` (2000×1125).** Missing and
  not blocking: the UNIT-4H turnaround, the 4Humanity wordmark and the hunter growth sheet — all
  character/logo art, frozen this campaign. It also found and fixed a **pre-existing** miscount in
  the index preamble (115 claimed, 116 actual). ⚠️ Useful reading it recorded: the four-panel
  barrier diagram's "STRUCTURAL FAILURE / DEEP COLLAPSE" labels describe the **white paneling**
  rubbling away — **the cyan slab stays intact in all four panels**, consistent with an
  undamageable barrier.
- ✅ **`board-audit-2`** — tree green (build ✓, `mechanics.mjs` 11/11, `escape.mjs` **20/20** on
  `seed=s4`). Board round 38: **0 WOWED · 5 PASS · 30 WEAK · 2 NOT_BUILT**, `room.ballroom` 90.
  `docs/PLAN.md` rewritten as a one-screen pointer; old one archived.
  - 🚨 **Its headline is a correction to this document: the "2× over GPU budget" premise was
    false** — measured **1.33–1.60 ms against 1.39 ms**. It went further than measuring and found
    *why* the wrong number was in circulation: `HANDOFF.md` had already recorded the fix
    (**3.0–4.2 → 1.22–1.38 ms**, `perf-ao`, 2026-08-04) and the campaign framing carried the
    pre-fix figure forward. **`perf-ao-4` re-scoped from an Opus diagnosis to a Sonnet hold-the-line
    job.**
  - **Draw calls: 576 at `service.mid`**, both runs identical — *below* the recorded 580–586 band.
    Not a regression; flagged in case it recurs.
  - **17 `stale-verdict` flags**, 0 stub/dead-view. Not fixed — art is frozen and re-scoring is a
    critic's job.
  - ⚠️ **35 of 37 pieces have captures predating the 2026-08-05 determinism fix** (only `mat.marble`
    and `mat.brass` postdate it). **Not re-taken wholesale** — but any Wave 2+ slice that diffs
    against a reference shot must re-take that piece first, or it is diffing against noise.
  - **Root-litter move list prepared and NOT executed** — 55 PNGs (32 MB) + 17 debug scripts →
    `progress/_root-litter-2026-08-08/`. **Awaiting John's approval.**
  - It also flagged an internal inconsistency in its own slice doc (the file-ownership line vs §2e's
    archive instruction) rather than silently picking one. Correct behaviour.

**Wave 1 complete.**

**Wave 2 — spawned 2026-08-08 on John's go**, with his band set: *"about a minute to dig into
another room."*

- ✅ **`audio-3`** — `playMeleeImpact(depth01)` built and published; `sledge-1` wired it defensively
  at `player.js:527`. Two layers cross-fade by depth, and at d=1.0 the wood layer's gain is
  **structurally** zero, so the barrier's "no debris tail" is architecture rather than a tuned
  number. Measured, not asserted: centroids **1015 / 480 / 553 / 321 Hz** across the four depths,
  barrier decay **25 ms** against the full crunch's **100 ms**, closest pair separated 0.432 against
  a 0.12 threshold. A 90-blow, 61 s offline render came back clean with no clipping.
  - 🐞 **It caught a real determinism bug with its own instrument**: the shared noise buffer still
    used raw `Math.random()`, so re-seeding did **not** reproduce identical output (max|Δ| 0.14).
    Now seeded — re-render is bit-identical (max|Δ| 3.7e-9). **Capture reproducibility depended on
    this and nobody had checked it.**
  - ⚠️ It corrected two of my stated facts: `_audio1-wiring.mjs` is standalone (no `export default`)
    and is the exception to the scenario rule; and the 75–115 s load figure is **not** a ceiling
    under concurrent agent load — one run exceeded 180 s.
  - 🚨 **And it found the concurrency hazard now recorded in `HANDOFF.md`: a vite dev server watches
    the whole project, so one agent's saves reload another agent's page mid-compile even on a
    private port.** Fix is the `@vite/client` stub; the tell is "1 navigation" in the output.
  - ⏳ **Unjudged: all of it.** No reference audio exists and no agent has ears. **The barrier clank
    at d=1.0 is the single sound the campaign depends on** — it must read as *"NOT HERE"* instantly.
    Least confident: whether the hunter's new beating/shimmer reads as dread or as noise-floor
    annoyance. **Both are Checkpoint A questions.**
- ✅ **`sledge-1`** — the two-handed hammer exists (`src/game/sledge.js`, new). **Cooldown 0.95 s**
  against the club's 0.72; **contact at phase 0.60 of a 0.70 s swing**, so **58% of the animation is
  wind-up** — deliberately much longer than the club's 0.42, because the wind-up is what makes the
  hit feel earned. Damage 30 / reach 1.55 m recorded in `rules.js`. Reaction gain 0.55–1.10 (1.35 on
  breakthrough), scaled from `applyHit`'s returned `removed`. ⚠️ **That scaling is normalised
  against a GUESSED reference** — it never observed the real typical magnitude, so it needs
  recalibration once `chunks-1` settles. **This is the coupling most likely to need a second pass.**
  - **Club unchanged and proven so:** `swing-weight.mjs` 0.4917 → 0.4961, matching the historical
    ~0.49. The game's identity weapon is untouched.
  - **One-armed rig handled:** equip requires `caps.arms === 2` (which also excludes a fitted
    gadget), checked every frame — losing an arm mid-carry auto-stows the hammer, so a two-handed
    pose is never attempted on a one-armed body.
  - 🐞 **Two real bugs found by its own supplementary scenario, both invisible to every existing
    instrument** (none of which knows the hammer exists): a **missing `sledge.update(dt,t)` that
    left the swing phase frozen at 0 forever**, and a direction bug where the hit ray derived from
    the swing's own FK chain pointed roughly *opposite* the body's facing at contact. It switched to
    `aimDir`/`eye`, the path every other weapon already uses. **It wrote `sledge-check.mjs` (10/10)
    rather than trusting suites that could not see its feature** — the correct instinct.
  - ⚠️ **Deviations it flagged rather than hid:** it edited `rules.js` (absent from its file list,
    but §2 of the same doc instructs weapon numbers to live there — it judged the list incomplete
    and made a 3-key additive edit); the hammer **does not damage bodies** (`Player` has never held
    a `WeaponSystem` reference); there is **no HUD label or equip prompt**; and equip is
    *E-with-nothing-in-reach* rather than a dedicated key. The last three are all blocked on files
    owned by others.
  - Gate: `mechanics.mjs` 11/11 · `escape.mjs` 20/20 · `sledge-check.mjs` 10/10.

  💸 **Process lesson — it cost 560k tokens against the routing rule's predicted 235–265k for a
  decided slice.** The overrun is explained by the corners the slice did *not* decide: the equip
  control, the HUD affordance and whether the hammer hurts bodies were all left implicit, so the
  agent had to make and justify calls (and then found two bugs and built an instrument). **This
  sharpens `rrr-slice`'s "plans buy compliance, not quality": an under-decided corner costs TOKENS
  as well as quality.** Specify the control scheme and the HUD affordance in future feel slices,
  or accept roughly double the budget.
- ✅ **`chunks-1`** — **free-form positional destruction is built.** `damagefield.js` (new): a CPU
  depth grid at **~9.4 cm cells**, mirrored into a `DataTexture`, and **the CPU array is the single
  source of truth for both the shader and every gameplay query.** `breakmask.js`'s threshold now
  comes from a `tDamage` sample; the cyan barrier samples **the same texture**, so it cannot
  disagree with the hole in front of it.
  - 🎯 **JOHN'S BAND IS MET: 67 s · 67 s · 61 s across three seeds** (target 45–75, ~60 median).
    A probe is ~6 blows; the breakthrough is 43–50; the expected search is 3.5 duds plus the way
    through. ⚠️ Seconds assume `sledge-1`'s 0.95 s swing — the band holds for 0.70–1.10 s.
  - **The old build is intact behind `?dig=bays`** (`dig-toggle.mjs` 14/14 on it), so every
    `dig-1`/`dig-2` figure stays re-runnable. `?dig=1` is now free-form.
  - 🔬 **The finding that made the band reachable: brush radius 0.35 m (my number in the slice) was
    wrong** — it deepens fast and widens slowly, so a breakthrough cost 88 blows. Shipped at
    **0.52 m with a rim floor of 0.62**, because *a brush depositing nothing at its rim can only
    widen through a sliver*. **That one change took a breakthrough from 255 blows to 43.**
  - Other corrections it filed: chunks must be measured in a **physical unit** (m²×depth) or the
    debris silently retunes when cell size changes; and **the collider and the passability query
    must be the same quantised grid** — on different grids, `blocksMovement()` said open while a
    body stopped 0.34 m short.
  - ⚠️ **It edited `room.js` and three lines of `views/game.js`, outside its file list — correctly.**
    §3.4 required feeding `room.collide()`/`castRay`/`blocksSight`/`pathPortals()`, which live in
    `room.js`; the may-edit list and §3.4 contradicted each other and it said so instead of
    silently picking one.
  - `pathPortals()` needed no change, as `dig.md` §7 predicted — only `breachPortals()` now reports
    the **dug channel's** width rather than the authored aperture, which is required: a span is
    5.72 m wide, so the BFS would otherwise read a hammer hole as a five-metre doorway.
  - Contracts: build ✓ · `mechanics.mjs` 11/11 · `escape.mjs` **20/20 on both arms** · `dig-toggle`
    14/14 on both · new `dig-free.mjs` 15/15.

  ### ⚠️ Open risks it named rather than buried
  - 🚨 **DRAW CALLS: `?dig=0` 596 → `?dig=1` 605 of 625 — 20 calls of headroom, and it is the top
    open risk.** A damaged face draws up to 6 own meshes, so **four heavily-dug faces on screen
    could hit the gate**. Unmeasured; `dig-promoted.mjs` is the tool. ⚠️ **And the recorded 576
    does not reproduce — `?dig=0` reads 596 today on the same scenario.** Two disagreeing figures
    in two days: treat the draw-call number as unstable until someone isolates why.
  - **GPU time is UNMEASURED** — `perf-ab.mjs` hardcodes port 5178, which `shoot.mjs` held; it
    failed three times. A fully dug face adds 3 coplanar 5.72 × 2.80 m alpha-tested planes. **This
    is fill rate against a 1.39 ms budget and it is unpriced.** → `perf-ao-4`.
  - **`wall.sheet` pixel-identity is argued, not measured** — no "before" capture existed. The
    argument is strong (the scalar arm's emitted GLSL is character-identical bar one unused
    `#define`) and it is arguably better evidence than a diff, ⚠️ **but the stored `wall.sheet`
    reference predates the 2026-08-05 determinism fix, so a pixel diff against it would be
    comparing against noise.** A critic must re-take the reference first.
  - **Multiplayer is built-for but untested**: the field replays exactly from its hit list and the
    mask never goes on the wire, but `test-net.mjs` has never seen a free face.

  ### 🎨 The look is NOT at the bar yet — and the dominant defect is pre-existing
  Orchestrator read of `progress/playtest/game.play.dig-free-*.png`: the mechanic reads — two holes
  in one frame with genuinely different silhouettes, cyan behind, rubble persisting, a robot
  standing *beside* a hole you can walk through. **But the hole outline is scalloped and lobed
  rather than torn**, and 🚨 **that is exactly the defect `breakmask.js`'s own header and
  `PLAN.md` Phase 3 already document** (*"ours reads as smooth rounded cloud/scallop lobes"*).
  **`chunks-1` did not cause it — free-form digging promoted a known background defect into the
  most-looked-at surface in the game.** Also: the cyan reads bright and screen-like rather than
  structural, and the lip is a thick uniform band. **All three are `whitecyan-1`'s job in Wave 3**,
  and the break edge is now the single highest-leverage art fix in the project.

**Wave 2 complete.**

## ✅ FEEL CHECKPOINT A — John played, 2026-08-08 (on a tablet, via Cloudflare tunnel)

> *"the game launched and ran rather well. I loaded faster then on my PC did last night. the
> destruction didn't feel like chunks coming off the wall. It felt like a 2d mesh taking off layers
> where I was clicking… lets just get the loop running on the dig and chunk until it is much closer
> to my art I created. thick chunks falling off the wall."*

**Verdict: the mechanic passes, the material read FAILS.** He did not complain about the swing, the
pacing, the minute, or the audio — he complained about what destruction *looks like*. That narrows
the next round to one thing.

### 🎯 His diagnosis is mechanically exact and it is the thing to fix
A destructible surface is a stack of **flat nested planes** cut by an alpha discard. So the cut edge
has **zero thickness** — `breakmask.js`'s lip is *shading painted on a plane*, with no silhouette and
no side face — and removing material simply exposes the next flat layer. **"A 2D mesh taking off
layers" is a literally correct description of the implementation.**
⚠️ **The chunks are NOT the bug.** `debris.js` already spawns fractured solids with real volume, and
its header records "NO THICKNESS" as a bug fixed long ago. What is missing is thickness **at the
wall**, and any visible relationship between the piece that flies and the material that left.
→ Loop opened: `docs/slices/task-chunks-thickness.md`, builder `chunks-2` (Opus) ↔ `critic-dig-*`,
**running until the critic says it is close to John's art.**

### 🆕 An unexpected and valuable performance finding
**The tablet loaded FASTER than his RTX 3060 Ti did the night before.** The tablet ran
`?quality=low`, which disables **AO and the depth prepass** — and a depth prepass draws every mesh
again with a depth-only material, i.e. **a second shader program per material**. That is a direct
lever on the ~1054 compiles that cause the load.
🚨 **This reframes `boot-1`: the load cost is dominated by QUALITY-TIER-DRIVEN PROGRAM COUNT, not by
the hardware.** Cutting permutations at the tier the player actually uses is likely worth more than
any other boot optimisation, and it is now the first thing `boot-1` should test.
**Practical note meanwhile: `&quality=low` is the fast-iteration setting for John.**

## 🚨 THE DEFECT THAT INVALIDATED CHECKPOINT A — found 2026-08-08, after John's verdict

**The sledgehammer was unequippable in the default game, and always had been.**
`views/game.js:268` fitted a nailgun to `shoulderL` at spawn; a fitted gadget **replaces that arm**
(the game's central idea); so `caps.arms === 1`, and `Player._toggleSledge` gates the two-handed
hammer on `caps.arms === 2`.

🎯 **John's own words gave it away and nobody noticed at the time: *"a 2d mesh taking off layers
where I was CLICKING."* He was clicking — firing the nailgun. He has never swung the hammer.**
An entire feel checkpoint was spent judging a weapon nobody could hold, and Wave 2's headline
feature shipped unreachable.

⚠️ **This project had already filed this exact defect once.** `play-critic-4` found gadgets had zero
world placement and `views/game.js` records the lesson: *"Everything else about them can be perfect
and it does not matter until they exist somewhere a person can walk to."* **The rule to carry
forward: a feature is not built until a player can REACH it. Every future feel slice must state how
the player acquires the thing being judged.**

**Fixed by `sledge-2`** (John's direction: *"yes start unarmed. put the sledge in the first room for
the player to find imediatly"*): spawn as the baseline two-armed UNIT-4H, hammer lying on the floor
at `study_w.north` — **dead ahead on the first frame**, since the player spawns at that room's south
end facing north — nailgun moved to `gallery.west`, plus a HUD held-tool readout and a pickup
prompt. ⚠️ **Code landed; NOT verified** — the build was broken throughout its verification window
(below), so the first-frame screenshot, the scenarios, and *whether the unarmed opening is
survivable* are all still open.
- 🐞 **It found a real pre-existing bug on the way:** `resetRound()` cleared every loose world item
  and never re-spawned any — harmless while retry was a page reload, but **retry is now in-place**,
  so a second life had nothing on any floor. Now fixed.

## 🚨 BUILD OUTAGE — 2026-08-08, and the gate was in the wrong place

A backtick inside a `/* glsl */` **comment** at `breakmask.js:240` terminated the JS template
literal. `npm run build`, `build:only` and the dev server all failed together, because
`breakmask.js` is load-bearing for `game.play`.

**Cost: `sledge-2` completed an entire slice unable to run one scenario or take one screenshot, and
`boot-1` (Opus) lost measurement time.** ⚠️ **This is the FIFTH occurrence in three days, in five
files, by five different agents** — and it proved a *build-time* gate fires too late: the author had
not built for 20+ minutes. **New standing rule in `HANDOFF.md`: run `node harness/lint-glsl.mjs`
after EACH edit to a file containing `/* glsl */`, not at the end of the round.** It costs a second.
**And: if a file you do not own breaks the build, message the owner — do not fix it yourself**,
because they may have it open and a collision costs more than the outage.

🐞 **Found while fixing the docs:** `HANDOFF.md`'s own quick-reference block told agents to run
`npx vite build` — **the exact command the very next paragraph forbids**, and the one that skips the
lint. Corrected.

## ✅ `boot-1` — THE LOAD IS DIAGNOSED, MY HYPOTHESIS WAS WRONG, AND THE LEVER IS ONE FIELD

### 🚩 The tablet lead is REFUTED. Do not act on it.
Three arms on one frozen tree:

| tier | programs | lap | to ready |
|---|---|---|---|
| `low` | **457** | 47.4 s | 77.7 s |
| `medium` | **462** | 47.9 s | 79.5 s |
| `high` | **462** | 49.0 s | 79.4 s |

**Five programs and 1.6 s separate cheapest from dearest.** The mechanism I proposed does not exist:
**`depthPrepass` is a DEAD FLAG** — forwarded at `engine.js:129`, never read by `pipeline.js`,
because `perf-ao` deleted that prepass on 2026-08-04. `low` and `high` differ in a switch that does
nothing. ⚠️ **§2a's "quality-tier-driven program count" reasoning was wrong** — kept visible because
a plausible mechanism that survives one round of reasoning and dies on measurement is exactly what
this project's rules exist to catch. **The likelier explanation for John's tablet beating his PC:
his PC load ran while several agents were saturating the same machine.**

### The real shape: 97% of the cold load is shader compilation, and the SECOND load is already fast
Nobody had ever measured a warm load, because every harness tool launches a fresh Chrome profile and
therefore only ever measures a cold one. `harness/evidence/_boot1-cache.mjs` (new) reuses one profile:

| load (same profile) | ready | lap | programs |
|---|---|---|---|
| 1 (cold) | **82.4 s** | 50.4 s | 462 |
| 2 | **15.3 s** | 12.7 s | 462 |
| 3 | **14.8 s** | 12.3 s | 462 |

**82% faster, program count identical to the digit.** Everything that is not compilation totals
~2.6 s. **Practical answer for John today: one Chrome profile, F5 — never Ctrl+Shift+R.** ⚠️ Caveat:
any shader-source change re-costs it, which during a live campaign is most days.
⚠️ **The documented "1054 programs / 83 s" is stale** — the current tree is 231 → 693.

### 🔑 THE LEVER: 534 of 696 programs are the same GLSL compiled again
`_boot1-srcid.mjs` (new) pulls compiled source back out of the GL context via `gl.getShaderSource()`
and hashes it: **696 programs · 696 distinct cache keys · 162 distinct source pairs. Redundancy
4.30×.**

The differing field is always `customProgramCacheKey`, in groups of 22 — `rrr-wall|p.gal_w|0|…` vs
`rrr-wall|p.gal_e|0|…`. **Source: `src/game/wall.js:262`** (and `:313`). Its own comment claims the
sources are identical *"which the driver dedupes anyway"* — **the first half is now proven
byte-for-byte; the second is refuted by the clock. At 106 ms/program those 534 duplicates are ~57 s
of the 82 s cold load.** Collapsing that field plus the `numPointLights` multiplier takes 696 keys →
**154**, projected **~25 s cold**.
⚠️ **The per-panel key defended a real three.js trap** (`acquireProgram` hands the shared program to
every matching material and discards the second's `onBeforeCompile` output) — obsolete now that the
discriminators live in `defines`, which hash *ahead* of the cache key. **Whoever changes it must
re-verify panels still break INDEPENDENTLY.** `boot-1` correctly did not touch it: `wall.js` is
`chunks-2`'s file.

### Also found
- **`?warmlap=compile`** added (opt-in, default unchanged): `compileAsync` is **14% cheaper per
  program** but reaches **169 programs the drawn lap never does**, so it costs 8.5 s more today.
  Flip it once the count comes down.
- **`perf-stall.mjs`: +25 programs built DURING PLAY, not zero.** p50 3.50 / p95 6.10 / p99 7.70 ms,
  99.95% of frames under 16.7 ms. What still compiles is named: **gadget FX materials**
  (`oilArc`, `jetPlume0/1Mat`, `pilotCone0/1Mat`, `splashFlame2Mat`) at all four light counts —
  `src/gadgets/**`. ⚠️ **`?warmlap=compile` does NOT fix them**, so the gap is not frustum coverage
  and no lap over the scene will close it.
- ⚠️ **An 8.3 s freeze at RESULTS with `dprog 0`** — 19 render-target rebuilds, 17 textures released.
  **Not a compile; it sits on the retry/reset path**, which is new code (retry became in-place this
  session). Flagged, not diagnosed. **Suspect first when John reports a hang after dying.**
- 👏 **Process worth copying: it froze a snapshot of the whole tree (own vite, junctioned
  `node_modules`) BEFORE the build outage**, so `chunks-2`'s backtick cost it nothing. Every arm
  reports "1 navigation".

## ✅ THE HAMMER IS REACHABLE AND WORKS — verified by the orchestrator, 2026-08-08

`sledge-2` filed its code unverified because the build was broken throughout its window. Verified
since, by running the tests rather than trusting the report (`sledge-check.mjs`, `seed=s4`):

| | |
|---|---|
| spawns with **2 arms** | ✅ the unarmed spawn landed |
| `E` with nothing nearby does **not** conjure the hammer | ✅ the old fake toggle is gone |
| walking to the world prop and pressing `E` **picks it up and equips it** | ✅ |
| the swing **moves the whole body** | ✅ 0.2349 summed travel |
| the arm swings a **real arc** | ✅ 2.839 rad |
| the swing **finds a wall and removes material** | ✅ `removed 0.28` |
| **the game is still winnable unarmed** | ✅ `escape.mjs` **20/20** on `seed=s4` |

**That closes the one real risk from John's "start unarmed" direction**, and it means the campaign's
headline feature is finally reachable by playing.

🐞 **The test had never run once.** `sledge-2` rewrote `sledge-check.mjs` while the build was broken,
and it crashed on its first execution — `JSON.stringify` on the return of `interact()`, whose `root`
is a `THREE.Object3D` with a `parent`/`children` cycle. **The crash discarded two results that had
already printed.** Fixed: never return a live object across the page boundary, only a summary.

### ⚠️ Open concerns from that verification
- 🎨 **The hammer may read as a stick.** In `game.play.sledge-equipped.png` the robot is clearly
  carrying something, but no heavy head reads and the HUD showed `FIST`. ⚠️ **The shots are dark and
  mid-test, so this is a concern rather than a verdict** — it needs a deliberate, lit portrait
  before anyone acts. **A sledgehammer that reads as a broom handle would undercut the campaign.**
- **`sledge-check` 12 pass / 1 FAIL** — the coexistence probe picks up the *nailgun* instead of a
  limb, because `sledge-2` moved the nailgun into the world. **Test bug, not game bug.** → `harness-fix-1`.
- **`mechanics.mjs` 10 pass / 1 skip** — "Q drops what is held" has skipped since the unarmed spawn:
  with an empty socket, `E` now REFITS the limb instead of leaving it held, so `Q` has nothing to
  drop. `E acts on a limb in reach` still passes, which is why it went unnoticed. **A skip is not a
  pass; the drop mechanic is unverified.** ⚠️ The orchestrator guessed the cause wrong once, shipped
  a comment asserting it, and reverted — **the diagnosis above is the corrected one.** → `harness-fix-1`.

## 🔧 `harness-fix-1` — repairing three instruments that were hiding information
1. **`perf-ab.mjs` hardcodes port 5178**, which `shoot.mjs` occupies — so GPU time has gone
   unmeasured for **four consecutive builder rounds**, each reporting the same blocker and moving
   on. **Nobody had ever fixed the tool.** The oldest unpaid debt in the campaign.
2. The `sledge-check` coexistence probe (above).
3. The `mechanics.mjs` Q-drop skip (above).

## ✅ `harness-fix-1` — the four-round GPU blocker was a bug in the TOOL, and a deeper one than reported

**All three instruments repaired. `mechanics.mjs` 11/11 · `sledge-check.mjs` 13/13, both with zero
skips.** Verified independently.

- 🔑 **`perf-ab.mjs` had TWO defects, and the second would have made the fix a lie.** Adding
  `--port` was the obvious half. But the tool spawned vite via `npm run dev`, and **`package.json`'s
  `dev` script is itself hardcoded to `--port 5178 --strictPort`** — so the new flag would have
  parsed cleanly and silently rebound to 5178 anyway. **A fix that appears to work and does nothing
  is the lying-instrument pattern in its purest form**, and the agent caught it, fixed it by
  spawning `vite.js` directly, and confirmed with `netstat` that there was no fallback.
  ⚠️ **Four consecutive builder rounds reported "GPU not measured, perf-ab hardcodes 5178" and
  moved on. Nobody had looked at the tool.** The lesson is not about ports: **when the same blocker
  appears in three or more reports, the blocker is the task.**
- **`perf-spaces.mjs` shared the identical defect** — the agent flagged it rather than exceeding its
  file grant, which is correct. ✅ **Fixed by the orchestrator afterwards** using the same verified
  pattern, and confirmed running on `--port 5281`.
- **`sledge-check` had two bugs, one predating this campaign**: the coexistence probe re-searched
  the field (grabbing `sledge-2`'s relocated nailgun) *and* asserted `held === 'arm'` when the
  socket under test (`hipR`) is a **leg** socket — so the expectation had always been wrong and was
  merely masked by the search bug.
- **The Q-drop skip was solved by reading the model, not guessing.** It proved by conservation of
  `detach()`/`attach()` that no sequence confined to the player's four sockets can leave zero empty
  while a matching item is loose — so "fill every socket then detach" is *structurally impossible*.
  `fitGadget()` is the one mutator that breaks that conservation. ⚠️ It also caught that `refit()`
  builds a **new** `LimbItem` around the same root, which would have left a ghost entry in
  `limbField.items`. **This is the standard the orchestrator failed to meet earlier on the same
  bug** (guessed, shipped a wrong comment, reverted).

### ⚠️ First real `perf-spaces` run — and why its numbers are NOT usable
The tool now runs, but it was run **while two agents were saturating the machine**, and it said so
itself: *"discarded lap cpu 3.48 vs 1403.93 — machine may not be settled"* on four of six spaces.
Reported figures (gpu 38.08 ms, cpu 1403.93 ms, **770 calls > 625 in gallery**) are **measurement
noise and must not be quoted.** ⚠️ **HANDOFF's rule applies and was knowingly broken to prove the
port fix: never measure while another agent is working.**
🚩 **BUT the 770-call figure must be re-checked on a quiet machine the moment `chunks-3` lands** —
draw calls are a scene property rather than a load artefact, so unlike the timings it *could* be
real, and it would be a serious regression against a 625 ceiling.

## 🔬 `legibility-1` — TWO DEFECTS WERE WEARING ONE NAME, and exposure is the wrong tool

Measured at `quality=high` (confirmed live, the tier every board figure was taken at), using the
**real unmodified third-person camera** at real play stations — not the collapsed-boom studio trick
the dig scenarios use.

### ✅ The cyan IS landing. `critic-dig-1`'s round-1 verdict is superseded.
*"Cyan appears in NONE of 12 captures"* is **no longer true.**

| | teal % of frame | white % |
|---|---|---|
| reference `dig-gallery-sledge-crew.webp` | 19.3% | 33.4% |
| **game, real station, shipped grade** | **12.7%** | 22.4% |

**≈⅔ of the reference's teal density is on screen.** `chunks-3`'s per-band albedo is real and
measurable. **The remaining defect is hue PURITY, not absence** — a muted tint inside a warm
gradient, where the reference has a hard white-rim-against-flat-teal break.

### The split, and it changes what to fix
1. **Some stations are genuinely near-black in real play** — the sledgehammer pickup and mid-swing
   frames measure median L **7–13**, with 23% of one frame pure black. Not a staging artefact: those
   were real in-engine positions. **That is a lighting problem.**
2. **At a well-lit station the layering STILL fails** — median 65 (on the *bright* side of target)
   and top-decile chroma 0.238 against a 0.14 gate. **That is a colour-separation problem, and
   brightness cannot buy it.**

### 🚨 Exposure is not the lever — it makes the cyan WORSE
Tested properly, 1.85 → 4.0: chroma moved only 0.238 → 0.147 (still failing), the frame blew out to
median 124, **and teal DROPPED 12.7% → 8.5%.** ACES compresses saturated colour toward white near
the highlight rolloff, so more exposure actively washes the cyan out.
⚠️ **`game.play` is already the most exposure-boosted view on the board — 1.85, against
`room.ballroom`'s 1.05.**

### 🐞 And it caught a lying instrument inside the RUNNING agent's own evidence
`chunk-thick.mjs`'s "exposure-lifted" capture is **byte-near-identical** to the shipped one, because
`game.play` already ships at 1.85 — so the A/B **compared shipped against shipped and could not have
detected an exposure problem in either direction.** Confirmed by reading the source *and* reading
`engine.pipeline.grade.exposure` live. Relayed to `chunks-3`, whose file it is.

### ✅ The `room.ballroom` risk is ZERO — established by reading the code, not assumed
`game.play` is **fully code-isolated** from the showcase rooms: its own `Engine`/`Pipeline`, its own
hardcoded 5-light rig in `makeLightRig()`, its own inline `setGrade()`. It never imports
`src/lighting/rig.js`'s `GRADES` table and never touches `room-ballroom.js`'s own values. **No
lighting option below can regress PASS 90 under any code path that exists today.** That was the
campaign's stated fear and it is now retired.

### Ranked options — for John, none taken
1. **Fix the capture A/B bug.** Free, zero risk, changes nothing in-game. → `chunks-3`.
2. **A dig-station practical light** — one small light at a barrier-stage panel, not a global
   change. ~0.058 ms per point light by the estate's own measured cost model. **No ballroom risk.**
3. **Give the dig bands their own emissive**, so they carry value separation themselves rather than
   waiting to be lit — and it sidesteps the ACES desaturation trap entirely. → `chunks-3`'s surface.
4. **More exposure alone — NOT recommended.** Measured above; diminishing and counterproductive.
5. **`environmentIntensity`** — flagged only: the comment at `game.js:86-92` argues for **1.30**
   ("this is a horror level and it is supposed to be darker than a showcase render") and the shipped
   value two lines later is **3.20**. A stale comment/code disagreement worth five minutes, not a
   round.
6. **"Just fix the capture staging" — the evidence does NOT support this** as the primary fix.

## 🚨 THE STRUCTURAL FINDING: THE GAME AND THE SHOWCASE ARE DIFFERENT ROOMS

John, 2026-08-08, after playing: *"this is still the same asset map for the original playable slice.
none of the room assets are in the playable slice… I was thinking if it looks like the actual assets
we created maybe there will be findings relevant as we go testing on that."*

**He is right, and it reframes the whole board.** Verified by reading the imports:

| | `room-ballroom.js` — **PASS 90** | `room.js` `buildTestRoom()` — **what you play** |
|---|---|---|
| built for | a screenshot | the game |
| imports | chandeliers, sconces, candelabra, light shafts, dust motes, light pools, glow patches, volumetrics, `lighting/rig.js`'s `GRADES`, foxed mirror, parquet, ceiling plaster | walls, connectors, panel instances, rules |
| materials | the full estate set | a runtime dynamic-import of *"deliberately a SMALL set"* |

**`src/views/game.js` never imports `room-ballroom.js`, `room-gallery.js` or `room-study.js` at
all.** They are separate view modules that exist to be photographed.

### What follows from that, and it is uncomfortable
- **Every art score on the board is for something that is not the game.** The project's best result —
  `room.ballroom` PASS 90 — has never been in front of a player.
- **It explains the darkness `legibility-1` measured.** The game runs a hardcoded 5-light rig; the
  ballroom runs chandeliers, sconces, candelabra, shafts and volumetrics. The game is not "too dark"
  by grading — **it is unlit by comparison, because the lights are in the other file.**
- **It explains the murk in every capture** and why nothing looks like John's art.
- ⚠️ **And it means feel findings gathered in the playable slice are findings about a placeholder
  room.** John's instinct is exactly right: judging the dig against a test room tells you about the
  test room.

### Consequence for the campaign
**A new candidate for the highest-leverage work in the project: get the estate rooms INTO the
playable slice** — or, more precisely, make the game build from the same modules the showcase does.
That single change would carry the lighting, the practicals and the materials with it, and would
retire the exposure/legibility argument entirely rather than papering over it.
⚠️ **Not started, not costed, and a real decision for John** — it is a large refactor, it touches
`room.js` which everything depends on, and the draw-call ceiling (625, currently ~605 with dig) is
the obvious hazard: the ballroom's chandeliers and volumetrics were never priced against a house
with six spaces resident.

## 🔨 `sledge-3` — the swing is wrong, and it is the game's verb
John: *"the sledge hammer is only held in on hand (left) and it sits behind the robot then the robot
just extends at the shoulder for the wind up and flexs for the swing. none of that feels like
swinging a sledge hammer."* **Two screenshots confirm every word** — the haft runs diagonally from a
single left hand, the right arm hangs unrelated, and at rest the head sits behind the shoulder.

Decided for round 1 of the fix: **both hands on the haft** (the `caps.arms === 2` gate already
exists and the pose never honoured it), **the swing starts at the hips** as a kinetic chain with the
arms as the last link, **a long arc rather than an extension**, and a rest pose the player can see.
⚠️ **The TIMING is not to change** — contact at 0.60 of a 0.70 s swing and a 0.95 s cooldown were
chosen deliberately and John has not complained about the rhythm.
⚠️ `swing-weight.mjs` (~0.235 today) is the gate but **cannot see whether both hands are on the
haft** — three-phase side-on captures, staged somewhere lit, are required.

### ✅ And the destruction is working — John's own read
*"the wall destruction mechanic seems to be progressing. I can see the cyan wall is actually the
lath, beam and brick structure. the hits seem to damage those as well."* His screenshots show a
white torn rim over a legible cyan structural lattice. **Combined with `legibility-1`'s measured
12.7% teal, round 2's material work has landed.** The remaining gap is hue purity and the swing.

### Still unjudged from Checkpoint A
The audio (he heard it launch but did not comment on the barrier clank or the hunter texture) and
the swing weight, both of which need a keyboard and mouse rather than a tablet. **Carry both to
Checkpoint B.**

**Fixed at campaign open, before Wave 1** (see §2c): the hung-tab loading screen, retry-by-reload,
and the full-resolution warm lap. All four suites green after.

## 9. Campaign hygiene

- **The board** is refreshed by `board-audit-2` at the start. Stale pre-2026-08-05 captures are
  non-deterministic and are re-taken **lazily** — only when a slice is about to diff against one.
- **New art** enters only through `refs-dig-2`: files, index entries, caveats, contact sheet.
- **Docs.** This file is the campaign's home. `docs/PLAN.md` points here. Each slice gets
  `docs/slices/task-<name>.md` as its wave approaches. `dig.md` §6a carries the dated white/cyan
  supersession note; `procedural-map.md` items 1–2 are marked BUILT.
- **Restart packs** are written before the window ends, not after it is gone.
- **Root litter** — 55 PNGs / 32 MB and 17 debug `.mjs` in the repo root. There is no git here, so
  nothing is deleted: `board-audit-2` proposes an archive-move and John approves it.
