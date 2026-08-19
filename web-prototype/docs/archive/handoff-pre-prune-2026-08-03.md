# HANDOFF — read this first, then stop reading

**This is the only document a new session must read in full.** Everything else is
reference, opened on demand. If this file gets longer than about two screens, prune it —
a handoff that costs 15k tokens to read defeats its own purpose.

Project: `C:\Users\John\Documents\Run Robot Run\web-prototype` — a Three.js browser
prototype for a multiplayer survival-horror game. Small robots explore a destructible
mansion; a much larger corrupted robot hunts them and grows by absorbing their parts.

---

## Where it actually stands

37 pieces on the board. **0 WOWED.** Six independent critics have filed verdicts and
**all six overturned the builder's own score**, four of them downward by 20+ points.
Treat every score not owned by a `critic-*` as optimistic until checked.

Strongest: the wall destruction group. All five stages pass the blind identification gate,
independently verified at two crop locations. `wall.sheet` holds the project's only
critic-awarded PASS.

Weakest: the hunter and the gadget limbs (REJECT 8 – WEAK 50).

### The hunter — measured for the first time (`critic-hunter-1`)

**hunter.1 WEAK 42** (was 60) · **hunter.2 REJECT 27** · **hunter.3 WEAK 43**. Scores went DOWN
because measurement replaced impression, not because anything regressed.

- **Stage-1 eyes are still RED in code** — `HUNTER_STAGES[1].eye = 0xE8342B` in `hunter.js`,
  confirmed by pixel sampling. The reference BASELINE row is unambiguously blue. This was
  corrected in `ART_MANIFEST.md` and **never fixed in the source** — a doc fix that changed
  nothing. Stage-1 torso grime also measures *darker* (~46% luminance) than the reference's own
  STAGE 2 (~57%), so the ramp is spent before it starts.
- **hunter.2's "torn socket" reads as six rainbow rods**, not a hollow torn hole.
  `buildTornSocket()` does build real housing/collar/rim geometry — it is invisible next to the
  wire colours. Hip growth stage 1→2 is **+16.6% against the reference's +59.5%**: the art front-
  loads width at exactly that transition and the render does not. Waist landmark moved 0.1 H,
  which is the hunch failing to be structurally present.
- **hunter.3 FAILS PERF — the first hard budget failure on record.** GPU **2.45 ms vs 1.39**,
  **1018 draw calls vs 625**, warm cache. Fix this before adding anything to stage 3.
- Two of round 10's five complaints were **stale and are now genuinely fixed** — the extra arms
  do show hands and elbow hinges, and the mint caps do show a crack network.

**How much is already the base robot** (answered from source): the two main arms, both legs,
torso/chest/hips, head, and at stage 3 **the entire second head-and-torso rider** are literally
`buildUnit4H()` output — scaled, repositioned and redressed through `unit.sockets` /
`unit.joints` with corrupted materials. Genuinely bespoke: `buildTornSocket()`,
`buildSpineChannel()`, `buildChestLooms()`, `buildFaceCracks()`, and **`graftedArm()`** — a
full custom arm/hand builder for the four extra stage-3 limbs that **shares no geometry with the
player's arms**. That is the largest duplicated investment in the file and the obvious next
consolidation, especially now round 30 has given the base robot one joint family across elbow,
knee and hip.

⚠️ **Tool limitation found here:** `measure.mjs` / `overlay.mjs` apply a single `--figures` to
both `--img` and `--ref`, so they cannot directly compare a 2-figure render against a 4-figure
reference row. Workaround: crop each side to one isolated figure, then run `--figures 1`.
Reproducible bands on `1785300149293.png` (848×1264) — BASELINE `y 0.05–0.335`, STAGE2
`y 0.385–0.665`, STAGE3 `y 0.73–0.98`; front-view column `x 0–0.31/0.32/0.385`. Worth adding
`--refFigures` to both tools.

Never built: four of six architectural materials, all six room/lighting pieces,
`char.detail`, `char.poses`. Multiplayer has never been run with two clients.

### `char.turnaround` — rounds 15–23, and what they proved

Now **WEAK 58** (`critic-robot-27`). Score across the run:
48 → 54 → 58 → 53 → 46 → 51 → 60 → 58. **It oscillates; it does not climb.** No PASS in 28
rounds, matching rounds 2–14. The high-water mark is still round 12's 72.

**Round 28 is landed but UNJUDGED** — six items of direction from John (upper-arm split, elbow
rebuilt as the knee's hub, chest mark centred and enlarged, hip connector rebuilt on the leg's
flexion axis, thigh top generated from that connector's own section, back slab replaced by the
mark) plus the eyes/brows fix. A critic has not seen any of it.

What that bought, which is worth more than the score:

| finding | why it stays fixed |
|---|---|
| **Relief deeper than its ring pitch reads as a SPIRAL off-axis.** Disc relief was 1.71× pitch; at the 54° the canted hip disc is seen from, grooves migrate 2.4 pitches and chain into a volute. | `driveDisc` rebuilt to relief/pitch ≈ 0.46. Keep any stepped detail under ~0.5. |
| **`bendOutZ` has a sign convention.** It bows toward −Z for the back plate. Called on the +Z faceplate it pulls the centre *into* the shell — the face rendered as two crescents with no eyes. | Now takes `dir`; documented at the function. |
| **`W.bootH` / `W.bootW` were dead.** `buildBoot()` hardcoded its own values; every attempt to resize the boot through `W` did nothing. | Wired up. |
| ~~White shells are diffuse-bound, not IBL-bound~~ — **THIS WAS WRONG, see the row below.** The experiment behind it (raising `envMapIntensity` 1.0→1.8, no visible change) was measuring an inert knob. | Retracted. The shells take ~62% of their light from the IBL. |
| **`material.envMapIntensity` DOES NOTHING in this project.** three.js honours it only when the material sets its own `envMap`; when a material lights from `scene.environment` instead, the renderer overwrites the uniform with `scene.environmentIntensity`. No material here sets `envMap`, so `chromeSatin`'s argued 2.4, `mintCap`'s deliberate 0.55 and `shellWhite`'s 1.0 have all been inert. **There has only ever been one environment knob, and it is scene-wide.** | Use `setEnvResponse(engine, material, intensity)` in `_studio.js` — it assigns the material the texture as its own `envMap` so the value is finally honoured. Applied to `mats.gap` (1.40 → 0.10), which is what made recesses read near-black. Measured: knee recess p05 36 → 11 against the sheet's 20. |
| **`mats.chrome` is ONE shared instance** across hip discs, forearms, abdomen *and* the ear ring. | Sharpening chrome globally also polishes the ear lens. Needs a second variant. |
| **Env darks are what make chrome read.** The studio env's darkest element was 0.62 grey; metal has no diffuse term, so it reflected only bright panels and read flat. | `buildStudioEnv(renderer, {contrast})`, opt-in, default byte-identical. Only `char.turnaround` opts in. |

**The routing lesson, measured over sixteen rounds.** Every agent asked to *diagnose or design*
returned a permanent win. Every round where the lead specified geometry numbers from a verbal
defect description was roughly a coin flip — **four of those specs were provably wrong**, one
internally contradictory, and two caused score regressions. Builders caught all four, because
the brief told them to report wrong facts rather than diverge silently. **Keep that instruction
in every brief; it is the highest-yield line in the whole process** — seven agents in a row used
it and all seven were right.

**So: give outcomes and design authority, not numbers you cannot see the result of.** Say
explicitly which parts of a plan are decided and which are the agent's call.

⚠️ **ASSUME ANY UNSOURCED NUMBER IN THESE DOCS IS WRONG until you re-measure it.** Five stale
"facts" had already propagated into builds before being caught: the manifest's shoulder width
(0.245 vs a measured 0.375), its hunter stage-1 eye colour, its chest-decal placement, the claim
that the multiplayer server had never run with two clients, and the claim that `mat.plaster` was
never built. Full list and provenance in `docs/archive/session-2026-08-02.md`.

**The instruments lie too.** An image-diff helper returned frozen numbers because Chromium caches
`file://` by URL; an `envMapIntensity` ablation measured a disconnected uniform; and element-
existence *and* `isVisible()` both passed on content hidden under a `z-index:100` splash. A probe
that cannot observe must report SKIP, never PASS — and if you assert something is on screen, look
at a picture of it.

**The legs — REBUILT, awaiting a critic.** `critic-robot-23` called the three-lobe leg *"a
structural limit of the current technique (unioned separate primitive lobes along a limb
axis), not insufficient effort"* and asked for a different construction method. `leg-rebuild`
has now landed one in `src/characters/unit4h.js`:

- The limb is a **profile loft** (`legProfile` / `legRings` / `loftShell`). One continuous
  measured curve for the whole hip-to-ankle limb; the thigh and the shin are two windows onto
  it, so their shared ring at the knee is identical by construction rather than by tuning.
  The separate `roundedBoxGeometry` shells, the `blob()` kneecap and both chrome inner tubes
  are gone.
- The hinge is `kneeHub` — the knee section revolved about the BEND AXIS. A body of
  revolution about the axis it turns on is invariant under that rotation, so **the seal is a
  static property, not something animation has to survive**. Verified by posing, not assumed.
- The ringed disc is now side-facing and recessed (it was front-facing since round 20), and
  the kneecap is a wrapped plate carrying the limb's front line across the joint.
- **Dark outline geometry in the knee joint is free.** `collapseDrawCalls` merges per
  material per joint and the knee already carries `mats.gap`, so the black disc ring and the
  kneecap outline cost zero draw calls. Round 22's "seams cost 8 calls per robot" was true
  only of the HIP joint, which had no gap material.
- Landmark change: `L.knee` 0.285 → 0.263, measured off both references. Nothing outside
  `unit4h.js` reads `L`, and the ankle does not move.

Measured after: **584 draw calls (was 616), 824k tris, GPU 1.20–1.25 ms against 1.389** at
`quality=medium`; `--gate` prints BUDGET OK. All 37 views render; the six-view regression
including `char.locomotion` is clean. `char.turnaround --extra "knee=0,0.7,1.4,2.0"` is a new
opt-in probe that poses the knee through the run cycle's worst case — **use it before
touching leg geometry again.** Not re-scored: a builder may not score its own fix, so the
WEAK 51 above still stands until a critic looks.

⚠️ **RETRACTED (round 31): "the visor needs rebuilding as a curved cap that wraps the dome —
it is a flat front plate".** It has not been a flat plate since round 26; `visorCap()` already
solves it as a patch of the helmet's own surface, and measurement says the profile visor
carries MORE area than the sheet's (24% of head width against 18%), not less. This line
survived four rounds and shaped a fifth brief. **The real defect was TONE, and it is one
number:** in the left profile the visor measured luminance **42 against a 216 shell**; the
sheet's measures **153 against 159**. It read as a black crescent because it was one, not
because it was thin. Round 31 took it to 113 against 220 with a graded emissive backlight
(the sheet's screen is a lit panel — flat to 21 luminance across the plate, which a dark
albedo under a key light cannot be), roughness 0.075→0.26 and clearcoatRoughness 0.04→0.18.
The same round found the ear's bands **inverted** (ours 178/169/159 centre→rim against the
sheet's 187/125/99): the sheet spends the outer third of the ear's radius on one dark
chamfer, and ours had no dark in it at all.

Still open: the **white shells** need the direct-lighting fix above. Perf: 616 draw calls
against 625 (passes), GPU on the 1.389 ms line (about half of samples over).

## Start a session like this

```
/goal

I want you to finish Run Robot Run — a browser multiplayer survival-horror game where small
robots explore a destructible mansion while a much larger corrupted robot hunts them and
grows by absorbing their parts. It should be utterly perfect, visually beautiful, with every
single thing done at AAA quality — from textures to physics to game feel to anything you
could think of. It already runs:
  npx vite build && node harness/serve.mjs   ->  localhost:5192/?view=game.play

Read HANDOFF.md and GAUNTLET.md first. The locked concept art in Dev Art/ is the bar, and
`node harness/status.mjs list` is the scoreboard — 37 pieces, 0 WOWED.

Fan out sub-agents and have sub-agents tackle each piece individually so that the game is
utterly perfect. You should

/loop

on each item and have a separate sub-agent check it — visually AND by playing it — to make
sure it is triple A. That sub-agent should be a really harsh critic, and if it isn't triple
A it should keep going. Make it MEASURE rather than just look: harness/measure.mjs and
harness/overlay.mjs put the render against the art and hand back real numbers, and
harness/playtest.mjs drives real input at anything interactive.

Don't stop until each sub-agent is utterly wowed compared with the locked art. It should
literally compare them side by side blind and say which one looks better. Only a critic may
award WOWED — a builder may never grade its own work.

Tell every sub-agent: if a stated fact turns out to be wrong, say so rather than diverging
silently. Assume any unsourced number in these docs is wrong until you re-measure it.

/loop

until it's utterly perfect. Fan out sub-agents and ultracode.
```

**The mechanics** — the plan → build → blind-critic cycle, the regression gate, the
concurrency rules — are all below and in `GAUNTLET.md`. The prompt above is the goal; it does
not need to restate them.

`GAUNTLET.md` is the phased plan: base robot to near-perfect first (20 of 37 pieces are built
from its parts), then hunter and gadgets, then rooms, then the playable slice.

Three skills carry the mechanics so briefs can stay short — invoke `rrr-pipeline` when
building, `rrr-critique` when judging, `rrr-slice` when writing a plan or routing work.
They live in `.claude/skills/`; copy them to `~/.claude/skills/` if you start sessions from a
different directory.

Do NOT open `ART_MANIFEST.md`, `BUILD_GUIDE.md` or `CRITIC_GUIDE.md` unless the task
needs them — they are large, and they are written for the agents that get spawned, not
for the session that spawns them.

## The five commands that matter

```bash
node harness/shoot.mjs --view <id> --review 1280     # capture; read the .review.png
node harness/sheet.mjs --img a.png --img b.png --out c.png --cols 2   # tile before reading
node harness/status.mjs list                          # the scoreboard
node harness/audit.mjs --render                       # boots all 37 views, fails on any error
node harness/snapshot.mjs                             # self-contained hosted board
```

**Two instruments, added round 28. Use them before arguing about proportion.** Silhouette has
been the #1 or #2 complaint in nearly every round of `char.turnaround`, and until these existed
the only way to check one was to tile two images and compare from memory — which found the leg
lobes only after six rounds and never found the shoulder height at all.

```bash
node harness/measure.mjs --img progress/shots/char.turnaround.png \
  --ref "C:/Users/John/Documents/Run Robot Run/Dev Art/1785277053522.png"
node harness/overlay.mjs --img progress/shots/char.turnaround.png \
  --ref "C:/Users/John/Documents/Run Robot Run/Dev Art/1785277053522.png" \
  --out "C:/Users/John/AppData/Local/Temp/ov.png"
```

`measure.mjs` reports each landmark as a **feature of the width profile** — shoulder as a peak,
waist as a trough — and prints both how wide it is and **where it is**, flagging `LANDMARK
MOVED`. Sampling both images at a fixed H-fraction is a trap: our shoulder sits at 0.790 and the
sheet's at ~0.728, so that reading compares shoulder against neck and reports nonsense (+127%).

`overlay.mjs` superimposes the two silhouettes normalised to the same figure height. **Red =
render-only mass, blue = art-only, grey = agreement.** Red *above* blue on a feature means it
sits too high; red *beside* blue means too wide — and that distinction is exactly what nine
rounds of arguing about shoulder width missed, because the width was within 1% and the height
was out by 0.05 H. It prints a silhouette **IoU** — use it as a regression number: a round that
claims to have improved the shape should raise it.

Baseline at round 28: **IoU 80.7%** on the front view.

Both extract the silhouette by horizontal **derivative**, not by level. A near-white robot on a
near-white vignetted cyc has no usable absolute threshold — that is what the manifest means when
it says auto-segmentation fails here. It does not fail on the derivative.

Perf must be measured at `--extra "quality=medium"` — `auto` picks `high` on this
discrete GPU and that is not the target tier. Two agents have already misreported budget
failures this way.

## Driving the game, not reading it — `playtest.mjs --script`

`playtest.mjs` now takes `--script harness/scenarios/<x>.mjs` and `--q "debug=1"`. A scenario
gets `{ page, shot, snap, pass, fail, skip, note, waitFor }`, drives whatever play it likes, and
reports through the same PASS/FAIL/SKIP table — so "a SKIP is not a PASS" still holds. The three
fixed probes that matter (does it boot, is the live loop running, did anything throw) run for
every session regardless. Scenarios on disk:

```
feel-a.mjs     limb-loss feedback · camera at a wall · HUD truth · debug chrome   12 pass
feel-b.mjs     the awareness ladder: silent / walk / stop / sprint / fire         12 pass
feel-c.mjs     stagger economy A/B and per-weapon fire rate                        7 pass
look-tells.mjs the two "something is coming" tells, as pictures                     6 pass
perf-flare.mjs A/B for a single added PointLight                          (see below)
```

**Three instrument failures happened writing these; all three are the project's usual class.**
A canvas `luma()` probe returned **0 for every case** because `preserveDrawingBuffer` is only
set in capture mode — it did not error, it returned a confident, plausible zero, and the whole
comparison would have been junk if the same run had not also reported a geometric fact that
contradicted it. A threat-overlay probe measured **opacity 0 on a layer that paints perfectly
well**, because `game.js` sets and paints inside the same updater and the probe's updater ran
after the paint. And two scenario beats measured a *stationary* robot and reported "walking is
not heard", because the player runs out of hall in 2 s. **Cross-check every probe against a
second, differently-shaped observation.**

`perf-flare.mjs` runs under headless software GL, so its absolute milliseconds are meaningless
against the 1.39 ms budget — **only the ratio is usable.** It is still worth having: it is what
showed one extra PointLight costing a third of the frame.

**`game.play` perf, re-measured at `quality=medium` over a full 28 s loop:**
**GPU 1.25 / 1.39 ms · 296 / 300 draw calls · CPU 1.69 / 2.00 · 285k tris · BUDGET OK.**
Worst frame **4.0 ms**, down from **2498 ms** — stages 2 and 3 of the hunter are built hidden, so
`renderer.compile()` skipped them and their shaders were built on the frame the hunter GROWS.
`HunterAI.precompileStages()` now pays that inside the loading screen, twice, once with the eye
light in the scene and once without, because the point-light count is part of three.js's program
cache key. Adding or removing a light is a **full-scene shader recompile**; driving one off an AI
state and letting it toggle freely killed the renderer outright on a 28 s run.

## Model routing — measured, not assumed

- **Critics: Sonnet.** Six runs, 77k–142k tokens each, every one found real defects.
- **Builders that must DECIDE what to change: Opus.** A Sonnet builder given a 9-item
  defect list used 462k tokens (more than an Opus builder used for a 7-piece rebuild) and
  deleted the character's signature element while believing it had completed the item.
- **Builders applying an already-decided plan: Sonnet is fine.** The failure above was
  Sonnet *deciding*, not Sonnet *executing*. If you write the specific edits, Sonnet
  applies them cheaply.

## The failure mode that dominates this project

Code that looks right, reviews fine, and **renders nothing**. Every significant bug here
has been of this class, and none were findable by reading code — only by rendering,
measuring, or having someone else look:

| what failed silently | guard now in place |
|---|---|
| perf timed on CPU against an async API (reported 908 fps) | real GPU timer queries |
| quality tiers defined but never forwarded to the pipeline | tiers passed through |
| 4 s perf window sampling a 26 s gameplay loop | `--perfms` |
| GLSL reserved word (`cast`) → shader fails → all-zero texture bake | baker probes albedo, throws |
| a piece scored PASS 68 with a stub view | `audit.mjs` |
| agent dies mid-edit, view no longer loads | `audit.mjs --render` |
| `fbmT` gates at 0.9 that never fire (authored detail never drew, 3 files) | `pat()` helper |

**Assume this class first when something looks unfinished rather than broken.**

## Rules an agent must not break

- Never put backticks inside a GLSL template literal — it terminates the JS string.
- Never name a GLSL variable with a reserved word (`cast`, `sample`, `filter`, `input`,
  `output`, `matrix`, `texture`, `buffer`).
- Prefer `Edit` over scripted string replacement — `Edit` fails loudly on a bad anchor;
  a `node` replace silently applies half its changes.
- A builder may never award `WOWED`, and must not re-score its own fix.
- One owner per coupled concern, run sequentially. Parallel agents on a coupled system
  break each other's assumptions — this produced a game frame in flat monochrome amber
  and a `setPose` that wrote into limbs another agent had detached.

## Known-bad information

`ART_MANIFEST.md`'s shoulder-to-shoulder figure of 0.245 is **unverified and probably
wrong**. Three measurement attempts off the source PNG returned 0.212, 0.35 and 0.095.
Judge that dimension by eye against the sheet. Flagged in the manifest itself.

## The game itself — first play-critique (`play-critic-1`)

**"No, it is not fun yet — and not because it is unfinished. Because there is no decision in
it."** Movement is genuinely tight (16.5 ms keydown→motion, no inversions). The pitch is on
screen and works: a white robot holding its own severed arm as a club, the hunter in the
doorway. What is missing is play.

**Fixed already this session:** `Q` called `player.dropHeld()` — a method on `LimbRig`, not
`Player` — so an **advertised control on the game's own instruction card** threw and swapped in
the red FAILED page with no recovery. Now `player.rig.dropHeld()`, and `liveInput()` is wrapped
so no input handler can take the view down again. **Read this part twice:** behind that crash
page the simulation kept running perfectly, and the critic went on collecting flawless state —
hunter PATROL→PURSUE→GROW→ATTACK, limbs coming off. **Any instrument reading `window.__rrr`
would have filed a glowing report on a game showing a crash screen.**

**Seven of its eight items are now addressed (`game-feel-owner`, wave 1) and NOT critic-verified
— `game.play` still carries `critic-play-2`'s WEAK 58, which the audit now flags as stale. A
play-critic must re-judge before that number means anything.** What changed, and what the driven
playtest measured:

| item | what landed | measured by driving the game |
|---|---|---|
| **limb loss invisible** | five layers: a screen-edge rim that punches then throbs 3× over 2.2 s, biased toward the socket that emptied; a `RIGHT ARM TORN OFF` callout; the rosette punched to 1.18× with a hot halo for 2.4 s; a camera shock; and the widget grown 104→148 px | frames at +55 ms / +400 ms / +1.2 s / +2.2 s, looked at |
| **camera collapse** | the boom now respects geometry and the BODY moves out of the way — shoulder swings out, arm lifts, look leads forward, and the model stops drawing below 0.95 m | back to a wall and in a corner: camera stays inside the room, hunter at 2.6 m stays in frame |
| **no approach phase** | `awareness` ladder PATROL→ALERT→STALK→PURSUE; head scan; real hearing | **12.5 s of warning** from first ALERT to reaching the player |
| **chain-stun** | diminishing returns: `stunResist` +0.34/break, a 3.4 s+ break lock, `stun` capped | **7.8 s while holding LMB vs 2.0 s not shooting** (was 27 vs 9) |
| **flat 0.14 s cooldown** | `attack()` reads `WEAPON_COOLDOWN` | nailgun 7.0/s · ball 3.75/s · oil 0.75/s · grapple 0.75/s — an 11:1 spread a flat value cannot produce |
| **HUD lies** | `detach()` drops what the lost hand was holding; `weapons()` requires an arm; the readout prints the ACTIVE WEAPON and `UNARMED`; LMB with nothing returns a reason and the HUD answers | `limbClub → nailgun` on losing the hand; `NO WEAPON` on screen |
| **debug chrome** | `src/core/debug.js` — off for `game.*`, on for asset views, `?debug=1`/`?debug=0` override | `#views` and the perf block both absent from the frame |

**Still open from the critique, untouched:**

1. **The "destructible mansion" is ONE room, 15.6 × 16.8 m.** A sprint crosses it in 4.5 s.
   Now that the hunter actually hunts, this is worse than it was: there is nowhere to break
   contact to. Deepest problem in the build, and a planning decision.
   **→ IN PROGRESS: `docs/slices/task-mansion.md`, owner `mansion-owner-2`.**

   > **MANSION MILESTONE STATE — `M1 LANDED AND VERIFIED` (2026-08-03).**
   > `src/game/spaces.js` (new) is the floor-plan table; `room.js` is now a builder + graph
   > query layer over it (spaces, `spaceAt`, `spacesOnSegment`, `pathPortals`, per-edge
   > `portals()`, `setViewpoints`, `anchor()`, per-space collider buckets, residency).
   > M1 is a **pure refactor** and it is verified as one: the census reproduces the pre-change
   > world exactly — room group **37 meshes / 1 k-tris / 22 materials**, bounds diagonal
   > **21.80 m**, spawn separation **13.04 m**, LOS blocked at spawn, patrol sightline clear
   > **20.7%** of the first 30 s with first clear at **t = 1.4 s**. All of those match the
   > numbers `task-mansion.md` measured off the OLD code.
   > Gate green: `feel-a 12 · feel-b 13 · feel-c 7 · look-tells 6 · mansion 17 pass / 9 skip`
   > (the skips are A1–A7/A11/A12, which need rooms that do not exist until M2–M4).
   > `harness/scenarios/mansion.mjs` is new and grows per milestone.
   > **M2 LANDED AND VERIFIED (2026-08-03).** `gallery` (27.2 x 6.7 x 5.6) + `study_w`
   > (11.6 x 15.4 x 4.8), joined by **D1 (1.90 m)** and the destructible **`p.gal_w`**.
   > Landed: residency wired in `game.js`; the fixed 5-light rig driven from `spaces.js` (same
   > light COUNT as before — it is repositioned, never added to); `_waypoint` rewritten onto
   > `pathPortals` BFS and generalised to a portal's own axis; the `_breach` ±Z landmine fixed
   > via `DestructibleWall.normal` / `sideOf` / `hitPoint`; the four reveal boxes merged into
   > one mesh (8 -> 5 meshes per panel); `hud.setPlace()`; and the capture Director rebuilt to
   > be map-driven.
   > Gate green: `feel-a 12 · feel-b 13 · feel-c 7 · look-tells 6 · mansion 19 pass / 6 skip`.
   > A3 measures a **24 m unobstructed first glimpse** with the hunter in frame; A12 **22 ms**
   > worst frame; A8b holds; A8 max 2 visible spaces.
   >
   > ### Three defects found at M2 that the plan did not predict — all measured, all fixed
   > 1. **`collide()` sealed every doorway.** §8.2 says clamp to the actor's current space's
   >    bounds — but `bounds` is the clear extent **inset 0.4 m**, and a doorway lives in the
   >    0.30 m wall band *outside* that extent. A robot at full run for 5 s straight at the
   >    only door in the map never left the room. It does not throw and it reads as bad
   >    steering, not as a wall you cannot pass. Now clamps to the clear extent grown by
   >    `WALL_T`, so a body reaches the band, where `spaceAt` returns null and the clamp
   >    switches itself off and the colliders take over.
   > 2. **A first-visit shader compile the §5.4 ordering does not prevent: ~2400 ms, +14
   >    programs in ONE frame.** It is not the doorway crossing — it is
   >    **`HunterAI._setFlare(true)` ADDING the eye PointLight** when the hunter first notices
   >    you, which changes `numPointLights` and so recompiles every material visible at that
   >    instant. `precompileStages()` pays this for the hunter's own rigs and nothing was
   >    paying it for the ROOMS. Fixed by a boot warm-up that renders **each space, in both
   >    light-count variants, through `engine.pipeline` (not `renderer.render` — the pipeline
   >    runs a depth prepass, which is a second program per material), from four look
   >    directions** (a render only compiles what it draws, so frustum culling means one
   >    direction warms one wall). **2410 ms -> 22 ms, zero frames adding a program.**
   >    ⚠️ The warm-up is **live-only**: paying it at capture's hard 1920x1080 took `markReady`
   >    33 s -> 50 s and then lost the GPU process outright (three runs, "execution context was
   >    destroyed" *after* ready, no JS error). Capture cannot hit the stall anyway.
   > 3. **`player.noise` can never be observed at 1.0.** `Player.update` decays `_noiseSpike`
   >    by `dt/1.25` *before* assigning `noise`, so the ceiling any outside probe can sample is
   >    ~0.987. An assertion asking for 1.0 never passes. Measure the audible radius instead.
   >
   > **Open / next: M3** — `service`, `study_e`, `ballroom`, D2–D6, the colonnade, the
   > remaining panels, `PATROL_ROUTE` in full, the SEARCH clamp. Then M4: chapel + D7, the
   > grade (§3.4), the opening beat.
   > ⚠️ **The frame is too dark to judge by eye and that is the known M4 item.** `grade.mjs`
   > on the M1 frame: top-decile (r-b)/L **0.361** (target ≤0.14), median luminance **6.6**
   > (target 30–60), darkest-decile **4.9** (PASS). `game.js` still carries the pre-round-4
   > grade; §3.4 says adopt `GRADES.study`'s warm-shadow / colourless-highlight direction.
   > The gallery is 27 m lit by one raking key and two lamps and wants another pass.
2. **The swing does not read** from the play camera (occluded by the torso), and it is 200 ms of
   animation on a 720 ms cooldown — four fifths dead air.

**Three stated facts in the critique were wrong, and one number moved:**
- **"the hunter wakes at ~5.3 m" did not reproduce.** Measured by recomputing every gate per
  frame while driving: first wake was **11.0 m**, and it was not a range at all — the FOV gate
  rejected 100% of pre-wake frames (facing·target dot 0.11–0.16 against a required 0.498) and
  the hunter woke when its patrol curve happened to swing its nose down the hall. The wake
  distance was luck. Full diagnosis, with the two other defects it exposed, is in the
  `HUNTER_SENSE` block in `rules.js`.
- **`hunter-ai.js:267` `stun += dmg` was exactly right** — verified before editing.
- **The HUD flash was not "about one frame"** — it was `dt * 0.85`, i.e. ~1.2 s. It was still
  invisible, for the other reasons the critic gave (80 px widget, darkest corner, no
  screen-space component at all). The fix stands; the diagnosis of *why* was off.
- **A 1.55 m camera floor is WORSE than the 0.55 m collapse and was reverted after measurement.**
  These walls are 4.8 m of a 4.8 m storey, so a floor that size pushes the boom clean through
  them: against the divider the frame becomes a black slab with the player a sliver at the edge,
  and against the perimeter the camera leaves the room and renders black. Evidence on disk,
  cited from `player.js`.

**Load cost, measured:** cold load is **23–28 s local**, not the ~15 s previously assumed (the
in-page hint said 10–15 s and has been corrected). The tunnel adds only ~4 s; the rest is local
CPU baking 29 material sets. **`R` restarts in 0.9 s** — only the first load pays it.

## What to do next

0. **Re-critique `char.turnaround`.** The leg reconstruction the critic endorsed has landed
   (see above) and is the only untested change on the piece. Send a Sonnet critic at it blind
   before spending anything else here. If the leg defect is genuinely closed, the two named
   open items are the **visor** (rebuild as a curved cap that wraps the dome) and the **white
   shells** (direct lighting, not env). If it is not, **bank it as WEAK and move on** —
   `char.detail` and `char.poses` have finished plans waiting
   (`docs/slices/task-char-detail.md`, `task-char-poses.md`) and 20 downstream pieces are
   blocked behind a robot that may already be good enough.
1. **`mat.plaster`** — the last unbuilt material. ⚠️ CORRECTED (estate-plan, 2026-08-03): it
   does **not** block the room pieces — `estateMaterials()` sources its plaster from
   `wallstages.js`'s `plasterMat`, not `surfaces/plaster.js`. It still owns the `mat.plaster`
   view. Slice exists: `docs/slices/task-plaster.md`.
2. **Rooms and lighting, as ONE owner, on Opus.** ⚠️ CORRECTED (estate-plan, 2026-08-03): four
   of six estate views exist and render (`room-study.js` 437 lines, `room-ballroom.js` 395,
   `room-gallery.js` 285 — though gallery renders ~90% black, `prop-chandelier.js` 148);
   `light.dark`/`light.shaft` are 6-line `notBuilt()` stubs. The scoreboard's `BUILDING 12%`
   rows are stale claims from a dead `estate-agent`, and `room.study WEAK 58` was
   **builder-self-scored and is invalid** — no critic has ever judged any estate piece.
   Plan is written: `docs/slices/task-estate.md` (642 lines, with measured grade gates).
3. **Finish the gadget mounting slice** — `docs/slices/task-gadget-mount.md` exists and an
   agent died partway through it. Four of five gadgets still read as props rather than
   replaced limbs, which is the game's core idea failing in its own showcase.
4. **`game.play` cabinet and floor tiling** — visible tiling is a hard reject cue in
   `BUILD_GUIDE.md` §5 and a critic called the cabinet the first thing a stranger notices.
5. **Close the three multiplayer defects below.** ⚠️ The old note here — "multiplayer is
   completely unproven, never run with two clients" — was **false**, and `GAUNTLET.md` repeated
   it. `harness/test-net.mjs` predates that claim, drives the real server with three real `ws`
   clients, and passes 22/22. Verified by `net-smoke`. The protocol and server state machine are
   in better shape than the docs said. What is genuinely open:
   - **HIGH — the damage whitelist has a hole.** `net/server.mjs`'s `shoot` handler gates `fist`
     and the five gadgets, then calls `applyDamage` with **no else-reject**. `WEAPON_DAMAGE` has
     eight entries, so `limbClub` (34) and `hunterSlam` (46 — the *hunter NPC's* attack) pass
     ungated. Reproduced: a client holding nothing dealt 68 then 46 unearned damage. The
     existing suite's "cannot forge state" test misses it because it only tries *unknown* weapon
     names, never a real table entry that is simply not gated.
   - **MEDIUM — no rate limiting at all.** `WEAPON_COOLDOWN` exists in `rules.js` and the server
     never imports it.
   - **MEDIUM — carried items leak on disconnect.** `takeLimb` moves an item into `p.carrying`;
     `ws.on('close')` only does `players.delete(id)`, so a fist-held item is unobtainable
     forever. Dropped-but-uncarried limbs are fine.
   - **The real gap is wiring, not the protocol.** `src/net/client.js` says in its own comment
     that it is not wired into `src/views/game.js` — `game.play` still runs single-authority
     offline, so none of this has run through the actual game loop.
   **ALL THREE ARE NOW FIXED** (`net-fix`): the `shoot` gate is default-deny with `limbClub`
   conditioned on `p.carrying` and `hunterSlam` unreachable from any player socket; cooldowns are
   enforced from `WEAPON_COOLDOWN` with a 50 ms jitter allowance; carried items return to `ground`
   on disconnect via the existing `limbDropped` message. **`test-net.mjs` 22/22 ·
   `test-net-gaps.mjs` 17/17.**

   ✅ **The cooldown landmine is DEFUSED** (`game-feel-owner`). `attack()` in
   `src/game/player.js` read a flat 0.14 s for every gadget against a `WEAPON_COOLDOWN` table
   spanning 0.13 (nailgun) to 1.4 (grapple); it now reads the table. Verified by holding the real
   mouse button for 4 s per gadget and counting the shots the weapon system actually received:
   **nailgun 7.0/s · ball 3.75/s · oil 0.75/s · grapple 0.75/s**, against table rates of
   7.69 / 3.57 / 0.95 / 0.71. A flat value cannot produce an 11:1 spread, so this is now safe to
   wire the net client behind. `harness/scenarios/feel-c.mjs` re-runs the measurement.

   `harness/test-net-gaps.mjs` covers what the original suite did not (move/peer relay, the real
   `shoot` path rather than the `debug` shortcut, disconnect cleanup, a pickup race). Note its
   fist-damage test fires at the **legal 0.55 s cadence** — it originally fired 3 shots 60 ms
   apart and only passed because no rate limiting existed. The fix went in the test's cadence,
   not the limiter: loosening a security parameter to fit a synthetic burst is the same mistake
   as weakening the assertion.

### Recently landed, NOT yet critic-verified
- `limb.detach` CLUB tint — fixed after surviving three critic rounds
- `gadget.nailgun` — now mounts on the arm instead of floating beside it
- `wall.transition` — dust, 3D debris and framing all verified by a critic (65)
Re-critique these before trusting the numbers.

`char.turnaround` IS critic-verified as of round 23 (WEAK 51) — see the section above.

### Verify contested claims yourself — both sides have been wrong
Twice in this run a builder and a critic made directly opposed claims about the same feature,
and **each was right once**: the boots genuinely had a sole, collar and toe cap that a critic
reported as absent; the hip discs genuinely still spiralled after a builder reported the fix
landed. A crop costs one command and settles it:
```bash
node harness/shoot.mjs --view <id> --crop x,y,w,h --out "C:/Users/John/AppData/Local/Temp/c.png" --quiet
```
Do not plan against a disputed claim without looking. Two rounds were aimed at the wrong part
because of this.

### The verification tooling has the same failure mode as the code
An agent's image-diff helper returned **frozen** numbers — three separate comparisons identical to
the last digit — because Chromium caches `file://` images by URL and every render writes back to
the same path. It did not error; it returned a stale, plausible number, and a false `wall.sheet`
regression was nearly reported on it. Cache-bust any `file://` image you load more than once.
**Code that looks right and silently returns the wrong answer applies to how you measure, not just
to what you build.**

### An empty agent output file means nothing
A background agent's output is buffered until it exits. A 0-byte file after 20 minutes is not
evidence it died — one critic was killed and respawned on that mistaken inference, then the
original filed a full verdict. Check the scoreboard for a filed result instead.

### Two spec errors found in `ART_MANIFEST.md` — the file is not fully trustworthy
Both were mine, both propagated into builds, both were caught by critics:
- shoulder width said 0.245; the art measures **0.375** (now corrected)
- hunter stage-1 eyes said red; the art's BASELINE row shows **blue, near-clean** (corrected)
**When the manifest and the art disagree, the art is the bar.** Measure the art with a
hand-placed crop — auto-segmentation fails on a near-white robot against a near-white cyc.

---

## Housekeeping rule

When this file no longer matches reality, fix it in place. Move anything historical to
`docs/archive/` rather than letting it accumulate here. The reference docs
(`WORK_ORDER`, `BUILD_GUIDE`, `CRITIC_GUIDE`, `ART_MANIFEST`, `ORCHESTRATION`) are
already at the limit of what is worth maintaining — prefer editing one of those to
creating a seventh.
