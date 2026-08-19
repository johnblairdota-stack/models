# HANDOFF — read this first, then stop reading

**This is the only document a new session must read in full.** Everything else is reference, opened
on demand — including `docs/handoff/*.md`: read the pointer table below, then **only** the one
appendix your slice names.

🎯 **THE RULE FOR ADDING TO THIS FILE, AND IT IS A MEASURED COST, NOT TIDINESS.** `critic-process-1`
fitted `tokens ≈ 190k + 0.75k × tool_calls` (r² 0.62, n = 18): **~180k of every agent's cost is
fixed**, ≈4.1M of 6.2M, paid before any agent acts — and this file is the largest identified line in
it. Cut to ~20 KB on 2026-08-07, it was back to **95 KB / ~40.4k tokens** three days later.

> **A finding enters here as (a) ONE LINE of what changed, (b) THE NUMBER, (c) THE INSTRUMENT that
> proves it. The argument goes in that instrument's header, or in the appendix named beside it.**

That is where the next person to run the tool reads it, and where it survives your death: of the
five agents killed on 2026-08-09, `passfail-1`'s answer was in `_pf1-diag2.mjs`'s header and came
back **intact**, `debris-1`'s was only in its transcript and came back **partly**, `dark-1`'s was
nowhere and was **lost**. **Budget: 30 KB, `wc -c HANDOFF.md` — adding a row means finding one to
cut.** Fix this file in place; history goes to `docs/archive/handoff-pre-prune-*.md`, and nothing was
deleted in the 2026-08-10 prune.

Project: `C:\Users\John\Documents\Run Robot Run\web-prototype` — a Three.js browser prototype for a
multiplayer survival-horror game. Small robots explore a destructible mansion; a much larger
corrupted robot hunts them and grows by absorbing their parts.

```
npm run build && node harness/serve.mjs    ->  localhost:5192/?view=game.play
node harness/status.mjs list               ->  the scoreboard (37 pieces)
node harness/audit.mjs --render            ->  boots all 37 views, flags stale verdicts
```

The locked concept art in `Dev Art/` is the bar; when a doc and the art disagree, the art wins.
`ART_MANIFEST.md` has had multiple measured errors — treat it as hints, not spec.

⚠️ **USE `npm run build`, NEVER `npx vite build`.** It runs `harness/lint-glsl.mjs` first. A
backtick inside a `/* glsl */` template literal terminates the JS string and takes the WHOLE build
down — and every agent shares one dev server and one `dist/`, so it breaks everyone at once, usually
after the author has moved on. **Five times in three days, five files, five agents**, every time as
prose punctuation quoting an identifier inside a comment.

🚨 **A build-time gate fires too late** — one author went 20+ minutes without building and in that
window `sledge-2` lost a whole slice and `boot-1` could measure nothing. **RULE: editing a file
containing `/* glsl */`? Run `node harness/lint-glsl.mjs` after EACH edit, not at the end.** It takes
a second. ⚠️ **Build broken by a file you do not own? Do NOT fix it** — the owner may have it open
and a collision costs more than the outage. Message them the line. `build:only` skips the lint.

---

## Where it stands — 2026-08-10

**Board:** 0/37 WOWED, round 38. `game.play` **PASS 71** (r11 — `critic-dig-8` corrected this line,
which read 76/r10) · `wall.sheet` **PASS 78**, the only material PASS lineage · `room.ballroom`
**PASS 90**, the best. `status.mjs list` is live.

**Gates — re-run IN FULL on the `limbs-1` tree, 2026-08-10.** `npm run build` green ·
`_limb1-rule` **9/0** · `limb-collapse` **11/0** ·
`mechanics` **13/13** (⚠️ **the line read 12/12 and it is THIRTEEN checks — `limbs-1` added none**;
the last is a ROUND RESET, validated by reintroducing five bugs) · `escape`
**20/20** (`--q "seed=s4"`) · `dig-free` **15/15** · `sledge-check` **13/13** · `dig-cover` **6/0** ·
`eo2-calls` **6/0** · `_progkey1-independence`
**12/12 on BOTH arms** · `_st1-remain` **11/0** · `debris-collapse`
**17/0** · `_collapse2-arms` **11/0** · `_collapse1-shots` **8/0** (236 → 236 calls) ·
`_sag1-grain` **14/0** · `_sag1-shots` **9/0** (243 → 243 calls) · `aim-mark` **12/0** ·
`aim-step` **12/0** · `aim-reach` **13/0** · `dig-band`
**14/1**, the 1 being the chapel's named floor-plan shortfall (below), with the **clock REPORTED and
no longer gated** — John suspended the set time and `DIG_BAND="lo,hi"` re-arms it.
⚠️ **`_th1-section` reads 9/1 and it is the STATISTIC, not the build — diagnosed in the defects
below. Do not "repair" `uSecFloor`.**
⚠️ **Pass `--q`, never `--extra`, to a scenario** (hazard list) · **`_progkey1-independence`'s scalar
arm needs `--q "seed=s4&dig=0"`**, because the dig is on by default and its picker scores free faces
first, so plain `seed=s4` runs the damage arm twice · **`_pf1-diag.mjs` REPORTS 2 FAILURES ON A GOOD
TREE**, since its assertions were written to CONFIRM a defect and invert once it is gone. Its header
says so. **Do not "repair" what it points at.**

**🔨 THE DIG IS THE GAME NOW, ON BY DEFAULT.** `?dig=free`: **free-form positional destruction — you
break the wall wherever you swing it**, driven by a CPU damage grid (`damagefield.js`) that is the
single source of truth for the shader AND every gameplay query, so what you see and what you can
walk through cannot disagree. Ornate coat tears off → **white underneath** → **cyan structure that
is indestructible and must stay that way**; finding the interconnect unlocks the barrier for
everyone, and **B toggles the cyan and resets it**. The 36-bay arm survives as `?dig=bays` (John:
*"I don't really want to use the dud bay"*). **`?estate=port` is also default** — the real gallery,
studies and 9.6 m ballroom; before it, *every art score was for something that was not the game*.
**Live ordering is `dig-campaign.md`**; this file is the facts.

⚠️ **Four agents died mid-slice to a usage limit on 2026-08-09 with six files written to mid-edit;
`docs/agents-resume-2026-08-09.md` is the restart pack and carries one confirmed diagnosis that must
not be re-derived.** All six have since been re-entered and re-gated (`collapse-1/-2`, `aim-1`,
`sag-1`), so read it for the diagnosis, not as a warning about the tree.

---

## What landed — the line, the number, the instrument

**The argument for every row is in the appendix or header in its last column.** Do not re-derive
these; re-measure any you depend on.

| landed | the number | argument |
|---|---|---|
| Boot — one shader compiled 22–36 times | **199.7 → 98.9 s** cold, 39.0 → 4.5 warm; programs **1077 → 213** (⚠️ **213 is `progkey-1`'s reading, not the tree's — re-measured 2026-08-11 it is 231**, matching `_slab1-boot.mjs`; quote 231 for headroom) | `progkey-1` · `_progkey1-independence.mjs` · `_coat1-programs.mjs` · **walls-perf** |
| Draw calls — 🚨 **never the ballroom** (20 calls); six gadget pickups on floors in unseen rooms | 841/722/682 → **599/480/426** of 625; fully dug **567**, pre-fix ~857; `?loose=0` reverts | `calls-1` · `_calls1-who.mjs`, `-dug.mjs` · **walls-perf** |
| Exit-site black apertures — one-sided fill for a two-sided hole; `rotY` is an AXIS, not a facing, and **not** instancing | **14 panels un-holed, ZERO draw calls** | `aperture-1` · **walls-perf** |
| Softlock — a fully dug wall that still was not a passage | **16 of 1750 pairs → 0** (`MACRO` 2 → 1) | `digparity-1` · `dig-band.mjs` · **destruction §3** |
| The last 58% of a dig now reads | dead blows **62.5% → 4.1%** | `visible-1` · `dig-band` **B2c** · **destruction §4** |
| The see-through defect, both halves — a body-sized hole you could not walk through, and the wall stopping you was invisible | `_pf1-diag2` **5/2 → 7/0**; disagreeing face pairs **42/42 → 0/42** | `unblock-1`, `seethrough-1` · **destruction §1** |
| Unsupported wall comes down — **THE ARCH, John's own model**; 🚨 `disconnection.md` §2 refuted with a number. A skill, and the wall warns you first | **7 cells ever severed** in 220 blows × 3 seeds; `COLLAPSE.fail` **3.40 m²**; scatter costs **8.04×** an undercut for 6 m² | `collapse-1`/`-2` · `debris-collapse` 17/0 · `_collapse2-arms` 11/0 · **destruction §6–7** |
| Chunks stopped floating — `drag` on `vy` is a terminal velocity, not air resistance | slab **1.41 → 6.22 m/s**, **97% of free fall** | `_collapse2-fall.mjs` · **destruction §8** |
| 🚨 **The collapse stopped being one moment, and the granularity was INVERTED before it** — the arch now SAGS, sheds `bite` 1.40 m², and hangs until a committed pull | aimed dig's biggest event **408 → 176 cells** for **more** wall (450 → 528), scatter unmoved at 18/155/18; fall travels **7.75× → 1.36×** further than it deforms; breach hidden **47.2% → 20.9%**; **236 → 236 calls** | `sag-1` · `_sag1-grain` 14/0 · `_sag1-shots` · `debris-collapse` C2 · **destruction §11** |
| 🦾 **THE DIG HAS A COST TERM — a collapse that lands on you takes a LIMB, not health, and it is AVOIDABLE.** Losing an arm stows the two-handed hammer, so the dig stops until you fetch and refit | fires only on a **full bite** — the measured hole is **0.402 → 1.404 m²**, threshold **0.75**, same answer at every value 0.45–1.35 · **8/8** bites take a limb at 0.60 m standoff, **0/8** at 1.30, inside the hammer's 1.55 m reach · arm/leg off your own eyeline **4/4** · **never the second part**, so `down` is unreachable (1 limb in 65 events vs **8** unguarded) · **+0 calls** | `limbs-1` · `_limb1-rule` 9/0 · `limb-collapse` 11/0 · **destruction §12** |
| The blow lands where you see it; a 0.55 m sill is no longer a wall | the mark is the brush's **real 1.04 m** footprint; **nothing else becomes climbable** | `aim-1` · `aim-mark`/`aim-step` 12/0 · **destruction §9** |
| 🚨 **Aiming — impact height was standoff × pitch, and the standoff term is gone.** Pitch alone now picks the height; standoff only buys reach | coupling **0.812 → 0.000 m** over a 0.7–1.3 m sweep; the skirting reachable from **1 of 4 standoffs → 4 of 4**, at a flat **50% of the down clamp** instead of 11–26%; body over the working m² **33.1 → 18.9%**; `dig-band`/`dig-free`/`sledge-check` **unmoved — they drive `applyHit` directly**. And the mark reads on white: **0.191% @ 29.2 → 0.249% @ 35.1 luma with the ring's 1.112 m span BYTE-IDENTICAL** — 🚨 the fix was the EDGE (outer fade 11 → 3 mm), never the area, and **"ink only, no core" was tried and made it worse** | `reach-1` · **`aim-reach.mjs` 13/0**, `aim-mark` A5 (headers carry the argument) |
| Capture floor — **`_liveLoop`'s dynamic resolution**, not the grain (0.74%) | **43–49% → 0.00%**, no source change | `jitter-1` · `still.mjs` · `capture-determinism.md` §7 |
| Every room portable — `SPACES = roomsFromPlan(HOUSE_PLAN)` | **1170 leaves `Object.is`-identical**, programs 213 → 213 | `localise-1` · `spaces.js` only |
| ×8 is the base; every gate re-baselined on it | `DIG_BASE` 8 on the field's only writer; ladder `[0.125 … 4]` inside `!engine.capture` | `pace-2` · **dig.md** |
| All six spaces dig and hold John's minute (*"about a minute to dig into another room"*) | 48.4 / 53.4 / 54.2 / 63.0 / 63.1 / 64.1 s, 5 seeds, **nothing retuned**; at ×8 medians **2.4–6.4 s** | `digband-1`, `digcover-1` · `dig-band.mjs` · **dig.md** |
| Audio made listenable — it was hiding four real bugs | the **barrier was 18 dB LOUDER than a fresh wall**, i.e. the reward was inverted; the clank fired on **10 of 63** good blows | `audio-render.mjs` · **game-feel** |

### ⚠️ The traps inside those wins — one line each, argument in the named appendix

- 🎯 **One interconnect region per EDGE, so ADDING AN EDGE MAKES A ROOM FASTER.** The knob is
  wall-per-edge; **`IC_W` is the only band knob in `dig.js`**, and `DIG_HEALTH`/decay are
  `?dig=bays`-only. **dig.md**
- 🎯 **Passability gate: `margin ≥ quantum`** — the quantum passability is measured in must be
  SMALLER than the passage's margin over a body, and at the broken setting it was **0.185 m against
  a margin of 0.051**. 🚨 The obvious gate, *"a fully excavated span must be passable"*, **passes on
  all 70 pairs at that broken setting**. **destruction §3**
- ⚠️ **`DAMAGE_BANDS` 0–2 are untouched and that is what protects every scored result**; band 3's
  stated trade is cyan fill **96% → 88%** of the breach. **destruction §4**
- ⚠️ **`DIG_H` stays 2.80 as a looked-at decision** — the ballroom works only because
  `ballroom-order.js` splits the storey at 4.80 m. A tall SINGLE-storey room would not. **dig.md**
- 🚨 **×0.125 is NOT "the pre-2026-08-09 game bit-for-bit"** — `8 × 0.125 === 1` holds for the DEPOSIT
  and not the BRUSH; the hole is **0.63 m wide against 1.04**. Reported, not changed. **dig.md**
- ⚠️ **`numPointLights` is not another cache-key edit** — four genuinely different shaders, warmed on
  purpose to kill John's 5 s freezes (`_price-pointlight.mjs`). **walls-perf**
- ⚠️ **The collapse threshold is an AREA in m², measured not chosen** — as a fraction of face, one
  bottom blow would drop a small wall. **destruction §7**
- 🚨 **A draw call's unit is the MESH, not the material key.** Detail inside a merged bin is free
  (the yard: 0.9k → 11.6k tris, **zero** extra calls), but `pickup.ball` is 4 material names and
  **134 calls** because it is 133 meshes, every ROOM is 10–21, and one gadget prop costs **39–205**
  (44–161 sub-meshes, `src/gadgets/index.js`) — two in a room is ~471 of 625, legitimately.
  **Before adding any prop, ask how many MESHES it is**; the skate trail cost **+82 calls for 76
  sprites**. Budget: gpu ≤1.389 · cpu ≤2.00 · calls ≤625 · tris ≤900k. **walls-perf**

### Open defects worth knowing before you file a duplicate

- 🚨 **`shoot.mjs` HAS NO `@vite/client` STUB** — one line, `playtest.mjs` has it; see the hazard
  list for the incident. **Owner: unassigned.**
- ✅ **`exterior.dress.mortar` — FIXED 2026-08-11 (`mortar-1`), and THIS LINE WAS STALE IN BOTH
  DIRECTIONS.** It covered **0 of 14 exit apertures** (`dressingRule` already sets `mortar: false`
  on every connector — proven live: flip `setDressRule(false)` and 6 apertures + 2 interior
  connectors come straight back), and instead covered **6–10 of 28 DIG FACES** at **81.0% of the
  face rect**, 10–26 mm proud — a per-seed `Binomial(28, 0.28)`, mean 7.84, **so "8 of 28" is the
  expectation and no house has ever had exactly it.** Now not emitted on the dig band at all;
  **−1 draw call at 6 of 6 stations** (423 → 422/625), reverts with `?segmortar=1`. ⚠️ **Inset was
  refused by construction** — `FACE_Z[SEG_FAMILY]` is one face, so an inset slab surfaces *inside
  the crater* among the white shell and cyan. `_mortar1-count.mjs` 14/0 · `_mortar1-look.mjs` 15/0.
- 🐞 **`glowPatch` delivers `strength²`** (`premultipliedAlpha: false` + additive blending multiplies
  the factor in twice). Every caller is compensating by eye.
- 🚨 **`_th1-section` READS 9/1 AND IT IS THE STATISTIC, NOT THE BUILD — do not "fix" `uSecFloor`.**
  S1 asserts a MEAN WIDTH IN SCREEN PIXELS and `still.mjs` can only pin `renderScale` *within* a
  session. At the **0.66–0.68** it now holds at, the break edge is already **4.90–4.99 px**, so a
  6 px floor barely bites and the delta collapses to ~0; the recorded 2.61 → 3.22 was taken at about
  half that scale, and the **8 px arm still bites every run** (mean 5.54, median 4). ✅ **The effect
  survives — the MEDIAN still goes 1 → 2 px on every run.** ⚠️ **Not reachable from the collapse
  rule**: both arms are a paired in-place uniform flip on ONE frozen page, so a rule change reaches
  the delta only through the crater, and the crater at S1's 44 blows is **773 → 778 cells gone,
  65 → 62 edge cells** between `sag:false` and shipped. **Fix: assert the median, or divide px by
  `renderScale`.** Owner: unassigned.
- ⚠️ **`strobe.mjs`'s anchor picker is unguarded against chained connectors.**
- ⚠️ **`mechanics`'s "a refitted limb animates like an original" is LOAD-DEPENDENT and flaked 1 run
  in 5** — its statistic is joint TRAVEL over a wall-clock-timed `W` hold, so a stalled walk reads
  as a frozen limb: **hipR 0.165 rad against 0.49–0.55 on four green runs**, same tree. **Re-run
  before believing it; the fix is to normalise travel by distance walked.** Owner: unassigned.
- 🎨 **The grade's black point clamps lit surfaces to zero, and it is arithmetic, not an opinion** —
  `contrast` around a 0.5 pivot puts everything below col 0.0238 at or under zero at 1.05. **[G]
  cycles SHIPPED / LIFTED / OPEN live (`?black=0|1|2`)** because a still frame is the wrong
  instrument: crushed blacks look *better* in a screenshot and worse to play. **Arm 0 is the shipped
  grade byte-for-byte.** **John's call.**
- ⚠️ **`docs/design/disconnection.md` IS SUPERSEDED** by the arch in `src/destruction/support.js`;
  §3–§6 survive and §6 is what `views/game.js`'s payout obeys. **Read `support.js`'s header.**
- ⚠️ **The chapel gets no dud at all on 2 of 5 seeds** — 4.36 m of usable shared wall against the
  ~11 m a search needs. Floor plan, not tuning; shipped because a fast way out of the deepest dead
  end is a mercy, and `dig-band` fails it on its own named line so it stays visible.
- ⚠️ **Residency ≤3 is unachievable with this floor plan** — `visibleSpaces()` peaks at **4**, and
  correctly: the ballroom is a hub with three doors in one wall. **Treat ≤3 as retired.**
- ✅ **John's aim complaint is closed, and 🚨 THE 0.18 TILT WAS THE WRONG LEVER** — zeroing it leaves
  the full-down slope at **−1.398 of the −1.708** it had. The coupling was the perspective projection
  itself (`impact y = eye.y + d·(tan p − 0.18 sec p)`), so **the height no longer comes from the ray
  at all**. `reach-1` · **`aim-reach.mjs` 13/0** · `player.js`'s aim block.
- 🚨 **NEGATIVE PITCH IS DOWN, so `look`'s clamp `[-0.95, 0.62]` is 54.4° DOWN against 35.5° up** —
  already the right way round for a game rewarded at the skirting. `critic-dig-8` §A4 reads it
  backwards and asks for it to be flipped. **Do not flip it**; nothing was moved.
- 🖼️ **EIGHT LOOK QUESTIONS ARE OPEN AND A BUILDER MUST NOT ANSWER ANY OF THEM FOR ITSELF** — the
  white filled crater, the crazing, the collapsing storey, slab weight, the cyan at 88% of the
  breach, the gallery paintings, `uCore` at 2–3 px, and the ungrabbable graze section. **They are
  the slice critic's deliverable (queue 1), they are listed with their frames and their numbers in
  `docs/handoff/destruction.md` §10, and the frames are already on disk.**

### 🔴 Who owns what — check before you take a file

**Live now:** `reach-1` (`player.js`, `aimmark.js`, camera/input in `views/game.js`).
Everything below LANDED 2026-08-09/10 and released its files. **The
`owns` column is load-bearing** — what was touched, and as usefully what deliberately was not.

| agent | owns — all ✅ DONE |
|---|---|
| `visible-1` | `wall.js` (`DAMAGE_BANDS[3]`, `DIG_BAND_LOOK[3]`), `breakmask.js` (`uLitBand`); **`damagefield.js` untouched** |
| `calls-1` | `room.js` + 2 lines in `views/game.js`; **`wallinstances.js`, `spaces.js`, `src/world/**`, `src/lighting/**` NOT touched — nothing was wrong in them** |
| `localise-1` | `spaces.js` only; `src/world/**` and `src/lighting/**` hold **zero** world-absolute coordinates, measured |
| `jitter-1` | **NOTHING IN `src/`.** New `harness/still.mjs`; `_progkey1-independence.mjs` repaired; `_jitter1-{floor,who}.mjs` |
| `unblock-1` | finished `cam-1`'s slice: `views/game.js` (**not** `onChunk`), `mechanics.mjs`, `_unblock1-focus.mjs`, `_pf1-diag.mjs` header; `player.js`/`sledge.js`/`weapons.js` needed no edit |
| `seethrough-1` | `wall.js` `setBarrier`, `breakmask.js` (`barrierMaterial`, `tTwin`) |
| `collapse-1` | new `support.js`, `damagefield.js`, `breakmask.js` (`uCraze`), `wall.js` (one `craze:` line); **`debris.js` + `views/game.js` untouched — `debris-1..4`'s payout was already right** |
| `collapse-2` | `support.js` (rewritten: the ARCH), `damagefield.js`, `debris.js`, `views/game.js` **`onChunk` only**; **`breakmask.js` and `wall.js` NOT touched — no shader change** |
| `aim-1` | new `aimmark.js`, `rules.js` (`STEP_H`), `room.js`, `player.js`, `views/game.js` (**not** `onChunk`); new gates `aim-mark.mjs`, `aim-step.mjs` |
| `pace-2` | `wall.js` (**one stale COMMENT corrected, no behaviour**), `_th1-section.mjs`, `dig-band.mjs` header |
| `limbs-1` | `limbs.js` (`COLLAPSE_LIMB` + `collapseLimbHit`, both NEW and pure), `player.js` (`hitByCollapse`, the table, `limbsLost`), `views/game.js` **`onChunk` only** + one `?limbs=` line beside it; new `_limb1-rule.mjs` + `limb-collapse.mjs`. **`src/destruction/**`, `hud.js`, `sledge.js`, `rules.js`, `locomotion.js` and `resetRound` NOT touched — the whole consequence chain already existed and the rule adds NO round state** |
| `sag-1` | `support.js` (the SAG), `damagefield.js` (`COLLAPSE.sag/bite/pullReach/pullFree`, the hit into `_collapse`, `_sag` in `reset`), `debris.js` (`hold`/`spread`, **both default 0**), `views/game.js` **`onChunk` only**; new `_sag1-grain.mjs` + `_sag1-shots.mjs`; **`breakmask.js`, `wall.js`, `dust.js` NOT touched — no shader change and no new dust term** |

⚠️ **`toggleBarriers`' second pass is redundant but harmless** now `setBarrier` does the coupling —
`unblock-1` owns whether it goes. ⚠️ **A `wall.js` comment was lying in the exact way this file warns
about, and is corrected:** the barrier material paints **nothing** on any cyan texel, both mixes
being gated on the G channel. The cyan's only thickness cue is drawn by the SHELL (`uCore`) — widen
or darken *that*, never add occlusion in the barrier shader.

### Queued, in the order I would take them

0. 🪑 **Smash lab is a live parallel track HANDOFF never named.** `FURNSMASH.bat` → `?view=furn.smash`. Bar = Teardown **play** (plates on the floor), not 148s colour. **r38 REVERTED** (brown disc). **r39** carve solid only, no AABB air plug. Last colour critic **r37 PASS**. Not on the 37-piece board.
1. `critic-dig-8` (`docs/design/dig-what-it-could-be.md`) ranked six directions. **C5 (the sag) is
   built — destruction §11; C6's aim half is `reach-1`. C3 (the frame survives the cladding) is the
   next it ranked and is not started.** Six of the eight look questions in destruction §10 are open
   and still a critic's deliverable — **plus the dropped limb's readability, destruction §12.**
2. **Put `playtest.mjs`'s `@vite/client` stub into `shoot.mjs`.** One line; see defects.
3. 🚨 **RUN `_pf1-diag2.mjs` AGAINST A DUD FACE OPENED BY A HOUSE-WIDE UNLOCK** — the case John was
   actually in, and the one `dig-free` F5/F6 cannot see: they exercise the interconnect segment,
   which has no barrier in front of it and so couples naturally while being dug. If it repeats, the
   fix is the same two-pass shape, in `room.js` (unowned).

**Two things wait on John and nobody should guess them:** which black point he wants (**[G]** in
game), and whether clip `08` in `refs/audio/LISTEN.html` is *going somewhere* — good timbre spread
(7.57 dB blow to blow) but only ~200 Hz of centroid drift over 60 s. ⚠️ **Every audio figure here is
waveform forensics; nothing has been heard by an ear yet.**

---

## Reading this file

Read this core, then **only** the one appendix your slice names. You should not need a second one,
and you should never need the archive.

| if you are touching… | read `docs/handoff/…` |
|---|---|
| `src/destruction/**`, `wall.js`, `breakmask.js`, `aimmark.js`, `onChunk` | **`destruction.md` — NEW.** See-through defect, softlock invariant, deep band, `SEC_FLOOR`, support/collapse and **the arch**, debris physics, mark and step-up |
| `src/game/dig.js`, connectors, dig tables, the band, the clock | **`dig.md`** — dig-stage and interconnect mechanics, the six-space band, the per-edge rule, ×8, the search measurement |
| `src/post/**`, draw-call budgets, wall stage materials, **any new prop** | **`walls-perf.md`** — instancing gate, AO round, boot fix, `calls-1`'s attribution, the exit sites, the budget |
| any measurement you did not take, an A/B brief, a harness tool that disagrees with your eyes | **`instruments.md`** — the case studies, **and the hazard list below verbatim** |
| core loop feel, `game.play` scoring, audio | **`game-feel.md`** — John's 4 playthrough bugs, fairness, fleeing, play-critic verdicts, the audio pass |
| estate materials, lighting, camera, `gallery-order.js` | **`estate.md`** — room write-ups, `critic-estate-5..11`, the `?estate=port` port |
| `run.js`, `exterior.js`, exit/panel logic | **`escape.md`** — win condition, the siege exit, exterior wiring |
| hunter AI/detection or its board | **`hunter.md`** — scoring history (stale-scores warning), sense tuning |
| `src/gadgets/**` | **`gadgets.md`** — the glow bug, five attachments, `heatWash` |
| locomotion or character materials | **`robot-char.md`** — grime/gravity, `char.locomotion` r4, r36's two failed claims |

**Archive** (history, not fact): `docs/archive/handoff-pre-prune-*.md`. **Design docs:**
`dig-campaign.md` is the live ordering · `dig-what-it-could-be.md` is `critic-dig-8`'s verdict and
the six directions · `critique-process.md` is why this file has a 30 KB budget ·
**`disconnection.md` is superseded** (see defects).

---

## The rules (proven again today)

- Builder/critic loop per piece. Only a `critic-*` may award WOWED; a builder never scores its own
  work; re-critique after every build (verdicts go stale — `audit.mjs` flags them).
- One owner per coupled concern. 5 concurrent agents OK (John approved); **one GPU perf measurer at
  a time** — draw-call counts are deterministic and exempt. 🚨 **CORRECTED 2026-08-11: EXEMPT
  ACROSS AGENTS, NOT ACROSS A WALK.** `ballroom.centre` read **423 / 461 / 479 calls** on the same
  build, seed and station, and an arm that can only REMOVE geometry read **+49**, because state
  accumulates along a multi-station walk. **Flip the arm in place at ONE station; never compare two
  walks.** Per-station flips reproduce at ±0. `dressbin-1` · **instruments.md**
- Opus decides/diagnoses/designs; Sonnet applies written plans and critiques. Give agents outcomes
  and design authority, not numbers you cannot see the result of.
- 🎯 **Every brief carries two lines, and they are the highest-return sentences in this process:**
  *"if a stated fact is wrong, say so rather than diverging silently"* and *"assume any unsourced
  number is wrong until you re-measure it."* A dozen doc errors were overturned this campaign, and
  **six briefed hypotheses were refuted by the agent that received them, with none confirmed.**
- ⚠️ **Do not start a slice in the last hour before a limit reset** — five agents died in one
  14-minute window, ~700k tokens. That is the clock, not concurrency.
- The skills carry the mechanics: `rrr-pipeline` (build + the GLSL trap list), `rrr-critique`,
  `rrr-slice`, `rrr-playcritique`.

## Direction from John (2026-08-03, overrides the sheet where they conflict)

**The robot's chest mark is the 4Humanity WORDMARK** (`Dev Art/1785276265860.png` — navy,
hollow-triangle `4` sharing its stem with the `H`, geometric humanist sans, tight tracking),
replacing the split-head emblem on the left pec and the back. The turnaround sheet still shows the
split-head mark; **on this one feature John's direction, not the sheet, is the bar.** Critics judge
the wordmark against `1785276265860.png` and **do not file the swap itself as a defect**.

---

## Instrument hazards — the confession log

**Every one bit someone, and each line cost a round.** This is the RULE only. 🚨 **The incident
behind every bullet — which agent, which round, what it cost — is in `docs/handoff/instruments.md`,
where this list is also kept VERBATIM and unabridged.** Read it before trusting a measurement you
did not take yourself.

- **Captures lie.** `ok` on empty / boot-splash / all-black frames, and on stale review PNGs. Check
  **file size, content and timestamp** on every capture, not just that a screenshot exists.
- **A probe that cannot observe must report SKIP, never PASS.** If you assert something is on
  screen, look at a picture of it.
- **Every A/B needs a same-config control pair.** ⚠️ **"Byte-identical" is an impossible test and
  must never be demanded as proof** — the correct proof is *"inside the same-config noise floor."*
- ✅ **Capture determinism was fixed 2026-08-05** (`docs/capture-determinism.md`); any reference shot
  of an **animated** view from before then is at an arbitrary moment — re-take it.
- 🚨 **BUT THAT FIX IS CAPTURE-MODE ONLY AND `playtest.mjs` BOOTS THE LIVE LOOP, so every scenario
  pixel A/B is taken in the one mode it excludes.** Use `still.mjs` — `hold()`/`release()` around the
  pair — and **park + settle with the sim RUNNING before you hold**, or the updater-driven camera is
  left behind. Floor **0.00%**. The dominant term was never the grain; it was `_liveLoop`'s **dynamic
  resolution**, driven by what other agents do to the GPU.
- 🚨 **`still.mjs` IS WITHIN-SESSION ONLY** — a live-loop A/B across two processes is not
  byte-comparable (same build, **0 of 15 parked frames identical**, calls 142 → 145), because
  `hold()` cannot pin how much sim time had elapsed on arrival. **`still.mjs` for an A/B *inside* one
  page; CAPTURE mode (`shoot.mjs`, `?capture=1`) for an A/B *across an edit*.**
- ✅ **`shoot.mjs`'s exposure to another agent's save is FIXED (2026-08-10)** — the frame that came
  back **99.1% different**, timestamped to a save 0.9 s into the shot, can no longer pass as a
  capture. It now serves the `@vite/client` stub (the socket mock alone was **not** enough: Vite's
  client also reloads on socket *close*, via `waitForSuccessfulPing`), counts navigations from
  before `goto`, and plants a token in the page — **a capture whose document changed FAILS, and a
  frame taken across the reload is DELETED rather than left on disk.** Re-verified by
  reintroduction: with **4 `full-reload` broadcasts observed on the wire** mid-capture,
  `wall.1.plaster` and `game.play --seconds 7` both stayed byte-identical to their quiet baselines.
  ⚠️ **The stub is in `shoot.mjs` and `playtest.mjs` ONLY** — `determinism.mjs`, `perf-ab.mjs`,
  `perf-spaces.mjs`, `perf-stall.mjs`, `measure.mjs` and `snapshot.mjs` still have none.
- 🚨 **PARALLEL AGENTS CORRUPT EACH OTHER'S PLAYTESTS THROUGH HMR, AND A PRIVATE PORT DOES NOT SAVE
  YOU** — vite watches the **whole project**. **Inject the `@vite/client` stub and confirm "one
  uninterrupted session · 1 navigation"**; that assertion is what catches it. ⚠️ The documented
  75–115 s load is a **quiet-machine** figure — raise the wait, don't declare a hang.
- 🚨 **TWO NAMES FOR "EXTRA QUERY STRING", AND AN UNKNOWN FLAG IS SILENTLY IGNORED.** `playtest.mjs`
  and every `harness/scenarios/*.mjs` take **`--q`**; `shoot.mjs`, `perf-spaces.mjs`, `perf-ab.mjs`
  take **`--extra`**; `mechanics.mjs` takes neither. The wrong one does not error — the run happens
  on the default arm and the checks **SKIP**, which in a tail reads as "nearly a pass". **The
  scenarios' own hint strings are the only thing that catches it — read them, don't skim them.**
- 🚨 **AN OFFLINE RENDER RUN INSIDE THE LIVE GAME IS OVERWRITTEN BY IT, EVERY FRAME** — an **11.7×
  under-read** a gate had passed on for days. **Any probe that drives state the running view also
  drives is measuring the view, not the probe.** Prefer a blank page, or lock the state.
- 🚨 **`renderer.info` does not reset unless the engine loop runs it** — calling `pipeline.render()`
  directly makes counters accumulate, which reads as a catastrophic linear leak.
- ⚠️ **`onBeforeCompile` hands you the shader with `#include`s unresolved** — a replace aimed *inside*
  a chunk matches nothing, fails silently, and just looks a bit darker. Only line-level `#include`
  (or `void main() {`) works; **assert the match landed.**
- 🚨 **A rejected promise anywhere paints "VIEW … FAILED" over the whole game**
  (`unhandledrejection` in `main.js`). Catch any promise-returning browser API you add to a view.
- ⚠️ **`grade.mjs` numbers are not comparable across quality tiers** — every board figure was taken
  at `auto`/`high`. Grade at that tier, or state the tier.
- ⚠️ **Perf:** `--extra "quality=medium"` only, discard the cold run, two consistent runs, never
  while another agent measures. **`perf-spaces` draw calls are a single-frame snapshot and swing
  widely** — take a scene-graph census instead.
- ⚠️ **`status.mjs --wins` REPLACES, it does not append**, and pieces are routinely BUILDING under
  another agent while you write. Re-read a piece immediately before writing to it.
- ⚠️ **Check `--at` beyond the default capture instant (t ≈ 0.20 s) before judging any moving part**,
  and check for effects primed on a **timer that fires after the capture**.
- 🎯 **A false positive in a build gate is worse than the bug it was written for** — it blocks
  everyone and teaches people to bypass the gate. **Validate a widened gate against the code it must
  NOT flag.** `lint-glsl` pass 1 printed "clean" on the file that had taken the build down and its
  widened matcher then broke the build twice itself; **pass 2 is a PARSER over every `.js`/`.mjs`**
  (esbuild, ~2 s), cannot false-positive on valid code, and subsumes all eight incidents.
- 🚨 **A BLIND A/B SHOWS THE CRITIC BOTH VARIANTS, so its ranked defects can describe the build we do
  NOT ship** — two rounds and one **61 → 57** score regression ran on a defect that existed only in
  plant-OFF. **Every defect must be attributed to a NAMED VARIANT, not to "the piece", and the
  per-pair preference is the deliverable.** Also: the strobe's panel mapping is **0-based**, and an
  opaque pad **under-reports penetration and reports float at full strength** — prefer
  `footskate.mjs --gate` G6 for a grounding claim.
- 🚨 **THE DOMINANT DEFECT CLASS: "IT EXISTS, SOMETHING IS IN FRONT OF IT"** — six times in two days
  a feature reported MISSING already existed with something occluding it. **Check occlusion before
  you author anything.** ⚠️ **`--pick` gets two further classes wrong:** UNREACHABLE geometry returns
  the *same* mesh at a flat distance (*a flat spread is not proof of a flat object; it is equally the
  signature of never having sampled the aperture*), and CULLED geometry reads as absent — `--pick`
  cannot see an `InstancedMesh` at all (**every pristine wall face in the house**), and a raycast
  does not cull, so it also reports meshes the GPU threw away. **A MISS is not evidence that nothing
  draws there;** use `_ap1-who.mjs`. 🎯 **Corollary for briefs, including the lead's: "X is missing,
  build X" is the most expensive instruction in this project. Write "X does not reach the screen —
  find out why, then fix that."**
- ⚠️ **`TextureLoader().load()` is async and nothing awaited it** — an undecoded map samples opaque
  black, which the decal's luminance keying turns into **full ink**, so the unloaded state was the
  *maximally-inked* one and read as a design choice, not a failure. **If your view shows the brand
  mark, await `brandReady()`, and byte-compare two shoots when a claim depends on the decal.**
- 🔧 **`harness/mechanics.mjs` (12 checks) asks what the other two cannot** — `shoot.mjs` asks "does
  it look right", `playtest.mjs` "does it respond once", and **neither asks "does this mechanic still
  DO what it claims, over time, under real input"**, where all four of John's playtest bugs lived.

🎯 **AND THE HABIT UNDER ALL OF THEM IS THE ONE THING HERE THAT HAS NEVER FAILED. Every new
assertion ships with a control that must fail, and that arm runs on EVERY run, not once.** Of the
~16 instruments in `instruments.md` that lied, **a reintroduction arm would have caught at least
twelve on their first run.** Eleven now carry one — `mechanics` slow-frame and round-reset,
`dig-band` **B2c**, `_progkey1-independence`, `aim-mark` **A2**, `aim-step` **S4**,
`_collapse2-fall`, the crazing tell, the `MACRO` passability gate, `_st1-remain`, `lint-glsl` pass 2
— **and none has lied yet.** ⚠️ **All eleven are only days old, so that is survivorship**; the claim
to act on is the counterfactual, not "they are true". It is one clause in a brief.
