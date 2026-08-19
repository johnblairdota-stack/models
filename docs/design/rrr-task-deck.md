# PRIME TIME — the task deck, rewritten for pairs

Written 2026-08-19 against `web-prototype/` on `claude/rrr-social-deception-mode-vfl7w0`.

**Authority.** `web-prototype/docs/design/party-loop.md` (locked 2026-08-16) is the spec and wins every
disagreement. This file replaces §5.2.2 of `rrr-social-deception-mode.md` ("The five") and amends §5.2.1
(the Task Contract); the rest of the bible stands.

**What changed.** The Crew is a **pair** — one RUNNER (first person, dark corridors) and one GUIDE (private
phone flyover), chosen by phone vote (`party-loop.md:19-20`). The hammer is **automated**
(`party-loop.md:21`). The objective is **unlocking RRR reality-TV cameras**. The Hunter is AI. A taken
runner is out of the mansion for good (`party-loop.md:23`). Everyone else watches the TV. Every claim about
existing behaviour carries a `file:line`; anything absent is labelled **NOT BUILT** rather than assumed.

---

## 1. The Task Contract, amended for pairs

| | Rule (bible §5.2.1) | Still holds? | Pair amendment |
|---|---|---|---|
| **T1** | Split the crew | **Holds, restated** | With a pair the split is not *rooms*, it is **role asymmetry**: the runner has the only body, the guide has the only overview. The test is now sharper, not looser — **neither half may be able to finish the task alone inside the round clock.** A task the runner can solve by looking makes the guide decoration; a task the guide can solve by tapping makes the runner a camera dolly. Both are failures of T1. |
| **T2** | The only channel is a human voice in the room | **Holds, strengthened** | Two people, no majority. Every task is now a straight one-word-against-one-word dispute in the Debrief. No in-game comms, ever. |
| **T3** | Honest error rate, 15–25%, indistinguishable from the lie | **Holds, and is now load-bearing** | With three crew a wrong call had two alternate suspects; with a pair it has exactly one. **A task with a zero honest-error rate is a coin flip with a name on it.** New sub-rule: the error must come from a *physical property of the build* the player can point at afterwards (the flyover's blind strip, an unlit corridor, a dark camera), never from a hidden RNG — you have to be able to say *why* you were wrong, out loud, and have it be true. |
| **T4** | Fail loudly; success is not silent either | **Holds — but the emitter it assumes is missing** | Today the bus is fed by **wall stage transitions only** (`src/views/game.js:1430-1432`), at `BREACH_NOISE.panel = 1.25` / `exit = 3.4` (`src/game/connectors.js:224`), plus the hunter's own door work at 1.1 (`src/views/game.js:1546`). **Individual sledge blows emit nothing.** Every task below states its noise in *gunshots* against that one calibration (`src/game/noise.js:24-28`: 1.0 carries `HUNTER_SENSE.hearRange` = 14 m, `rules.js:265`). |
| **T5** | Never name the culprit | **Holds, and gets strictly harder** | At N=2 *any* per-half readout is an accusation with a name attached. Absolute: no per-half timing, accuracy, or call log leaves the server before the Reunion. The codebase already has this discipline — `net/server.mjs` keeps `StageHealth` server-side precisely so it cannot leak how close a wall is to opening (audit §1). Extend it; do not re-invent it. |
| **T6** | Be watchable | **Holds, and gets harder** | The pair puts **6 of 8** on the couch. Two constraints follow: split-screen is mandatory (runner face + consequence), and — because the guide's map may never go on the TV (`party-loop.md:50`) — **the guide's half must be made watchable by its consequences, not by its screen.** The TV shows the runner walking into what the guide said, and the room hears the guide say it. |

---

## 2. The five

Each task names a **shape**, and the shape decides where the lie lives. New tasks pick a shape; they do not
invent one.

| # | Task | Shape | Where the lie lives |
|---|---|---|---|
| 1 | **THE DARK RUN** | Sensor / actuator | The guide says "clear" when it is not |
| 2 | **THE WALL CALL** | Delegated aim | The guide names the wrong face to breach |
| 3 | **THE MANIFEST** | Recall | The guide names an object that is not the one on their list |
| 4 | **THE TALLY** | Sync | Someone is late on a count nobody can time |
| 5 | **THE EXTRACTION** | Transit | The route was longer than it needed to be, and only one person could see that |

---

### 1 — THE DARK RUN *(build this first, and spec it hardest)*

The whole mode in one task: a robot in unlit corridors and a voice that can see the house.

**What the runner sees.** First person, no map, no compass, lights off. The corridors are genuinely dark —
mean frame luma in a generated house is measured at **6.65 of 255** (`src/views/game.js:2069-2072`), which
is why the flyover exists at all. They see a terminal prompt when they are on it, and nothing else. Their
own speed is their own noise: `player.noise = speed / MOVE.run`
(`src/game/player.js:633-640`), so sprinting at `MOVE.run = 5.20` m/s is 1.0 — audible at 14 m — a walk at
2.55 is ~0.49 → ~7 m, and **standing still is literal silence** (`rules.js:84-86`, `rules.js:265-267`).
Stage-1 hunter walks 2.05 m/s (`rules.js:127`), so the runner can always outrun it and can never do so
quietly. That trade *is* the task.

**What the guide sees.** The existing `[F]` flyover on their phone: roof off, perspective (not ortho) so the
inner faces read, whole envelope fitted, haze and vignette off, hemisphere raised
(`src/views/game.js:2057-2135`). Named marks `flyover.you` and `flyover.hunter`
(`src/views/game.js:2451-2461`), plus the sense overlay — the runner's noise disc sized at `hearRange ×
player.noise`, up to four live noise rims off the bus, the hunter's 14 m hearing ring, its 3.6 m peripheral
ring and its ~60° sight cone (`src/views/game.js:2554-2600`, `rules.js:259-263`).

🚨 **The shipped overlay is an oracle and must be degraded before it ships as a task.** `hunterMark.visible`
is gated on `hs.inScene && !!hp` and **nothing else** (`src/views/game.js:2559`) — a live, exact,
wall-ignoring (`depthTest:false`, `src/views/game.js:2399-2404`) hunter position, updated every frame. A
guide with that has no honest error rate, so T3 fails and the task is a lie detector, not a deduction
engine. The fix is also the objective: **the guide's map is fed by the cameras.** The hunter mark renders
only while the hunter is in a space that holds a *live* camera — and `cams` already carries exactly `{ id,
spaceId, live, smashed, mount, x, y, z }` (`src/game/furn-dress.js:768-772`). Outside coverage the guide
gets a decaying last-known ghost and nothing more. **NOT BUILT** — this gating is new work, and it is the
single most important new line of code in the deck.

**Two honest error sources, both physical, both already measured.**
1. **The blind strip.** A wall of height `H` at elevation θ hides `H / tan θ` of floor behind it — at the
   shipped 4.80 m storey, 0 m at 90°, 1.75 m at 70°, **2.55 m at the 62° tilt floor**
   (`src/views/game.js:2161-2168`), published live as `blindStrip` (`:2740`). A guide tilted for a good view
   of the route is, by arithmetic, blind to a 2.55 m band behind every wall — which is exactly where a
   stationary hunter stands.
2. **Camera coverage.** Under the gating above, "clear" outside coverage is a *guess* the guide is honestly
   entitled to make.

**Out loud.** Directions plus a status word: *"through the study, left, left, stop — he's in the gallery"* /
*"clear"* / *"go now"*. The status word is the whole game; the directions are what make refusing to say it
conspicuous.

**Failure mode.** The runner is taken (hunter `ATTACK` detaches a limb and absorbs it,
`src/game/hunter-ai.js:1090-1116`; windup 0.85 s, cadence 2.35 s, `hunter-ai.js:82-84`) — the terminal stays
dark and that runner is out of the mansion for the rest of the game (`party-loop.md:23`). Secondary failure:
the clock runs out because the guide routed badly.

**Noise.** A clean run puts *nothing* on the bus — `player.noise` is read directly by `HunterAI._sense`; the
bus carries placed events only (`src/game/noise.js:14-22`). Target peak bus loudness on success **0**, which
is what makes the other four tasks expensive by comparison.

**Where the lie lives.** *"Clear."* One word, unverifiable in the moment, and after a grab the honest
version and the malicious version produce exactly the same TV.

**How it reads on TV.** The best shot in the deck and the cheapest: a dark corridor, a robot hesitating at a
junction, a voice in the actual room saying *go*. Split-screen the runner's view against their face, and
lower-third the guide's last spoken word (`[GUIDE: "CLEAR"]`) — the *word* is public, the *map* never is
(`party-loop.md:50`).

**Leans on.** `src/views/game.js:2057-2135` (flyover), `:2451-2461` (marks), `:2554-2600` (senses),
`:2161-2168`+`:2740` (blind strip), `rules.js:259-322` (`HUNTER_SENSE`), `player.js:633-644` (noise),
`src/game/hunter-ai.js`, `src/world/genplan.js` → `src/game/spaces.js` (`?plan=gen`).

⚠️ **Cost risk, measured.** Flipping `[F]` at one parked station read **374 → 644 → 373 draw calls**
(`src/views/game.js:2708`) against a **625 budget** (`src/views/game.js:826`). The flyover parks a viewpoint
in *every* space at once. That is a desktop number; the guide's view has to run on a phone, continuously,
for 90 seconds. Measure before designing anything else onto it.

---

### 2 — THE WALL CALL

- **Runner:** stands in a dead-end service corridor facing two or three identical dark faces, holding the
  sledge. The hammer is automated: `pickDoorwayHit()` takes the shallowest still-solid cell in an 0.80 m
  window, y ∈ [0, 1.95] (`src/game/doorway-pick.js:33-61`), and opens `channel(0.34, 1.70, 0.30)` — the same
  predicate `wall.js` `blocksMovement()` uses — in a **measured 3 blows** on 5.72 / 2.96 / 2.08 m faces
  (`doorway-pick.js:10-12`), gated at ≤6 (`harness/_taskrun_picker_unit.mjs:22`). At `WEAPON_COOLDOWN.sledge
  = 0.95` s (`rules.js:78`) that is ~3 seconds of committed, loud work. The runner picks *which face*; the
  picker does the rest.
- **Guide:** the flyover shows what is behind each face — the terminal room, a dead cavity, or the space the
  hunter is standing in.
- **Out loud:** *"the left one"* / *"not that one — the one behind you."*
- **Failure:** the wrong face costs 3 blows, the noise, ~4 seconds, and can open a path straight into the
  runner's room. Collapse is an allowed side effect, not the goal (`party-loop.md:21`); a collapse that
  lands on you takes a limb (audit §1).
- **Noise:** exactly `BREACH_NOISE.panel = 1.25` on the stage crossing (`connectors.js:224`,
  `src/views/game.js:1432`) — carries 17.5 m. Sound alone cannot get the hunter past `soundCeiling = 0.86`,
  under `commitAt = 1.00` (`rules.js:316-321`), so a breach brings it into your half of the house but only a
  *sighting* makes it run. Evidence, never proof — exactly right.
- **Where the lie lives:** the guide is the only one who can tell two dark faces apart, and being wrong
  about which wall a corridor is on is the most ordinary mistake in the game.
- **On TV:** three swings, an arch coming down, dust. The most physical thing in the deck.
- **NOT BUILT:** per-blow noise. Today only the stage crossing emits, so two blows that do not cross a stage
  are silent. T4 wants a small per-blow emit (~0.6) so a *failed* breach is audible too.

---

### 3 — THE MANIFEST

- **Runner:** a room of destructible furniture — voxel-carvable (`src/destruction/furn-voxels.js:519`,
  `src/game/furn-smash-lab.js`), damaged through the sledge raycast (`src/game/player.js:1242-1249`), HP
  table at `src/destruction/furnprop.js:29-44`. A camera body is inside exactly one piece.
- **Guide:** the manifest — three object *names* on their phone, one of which is the right one, and the
  flyover positions of all three.
- **Out loud:** *"the candelabra by the window"* — and then, when it is empty, the second name.
- **Failure:** wrong furniture smashed, clock burned, and every smash is bus traffic. The Escort's
  attribution problem in miniature.
- **Noise:** **NOT BUILT** — furniture destruction emits nothing on the bus today (only
  `src/views/game.js:1432` and `:1546` emit). Propose 0.9 per prop destroyed (below a wall breach, above
  silence).
- **Where the lie lives:** *"I said the candlestick." "You said the clock."* Memory under a 90 s clock is
  genuinely unreliable, so a misdirection and a mishearing are the same event.
- **On TV:** robots destroying antiques. Uses the destruction tech harder than anything else.

---

### 4 — THE TALLY

- **Runner:** stands at a dark camera and holds an interact (`src/game/player.js:1040-1042`, `_interactCd =
  0.35`). Holding it does nothing on its own.
- **Guide:** an ARM control on their phone, equally inert alone. Both must be held inside the same **1.2 s
  window** for the tally LED to go red — LED, emissive material and `live` flag already exist
  (`src/game/furn-dress.js:701-718`, `props.js:1284`).
- **Out loud:** a human countdown. *"Three, two, one."*
- **Failure:** miss the window and the camera shorts — dark for the rest of the round, and loud.
- **Noise:** propose 1.4 on a miss (above a panel breach: this is the deck's punishing failure), 0.3 on
  success.
- **Where the lie lives:** being 0.4 s late is indistinguishable from lag, from a robot mid-turn, and from a
  phone that did not register the press. 🚨 **T5 is at its most fragile here.** The game must never display
  the actual timings, ever, and with N=2 even "the runner was early" names a person. Report *"the camera
  shorted"* and nothing else.
- **On TV:** split-screen, two hands, one light. Among the most readable things possible.

---

### 5 — THE EXTRACTION *(late round only)*

- **Runner:** carries the tape reel from a live camera back to the entry hall. Carrying forbids running —
  capped at `MOVE.walk = 2.55` m/s (`rules.js:85`), against a hunter at 2.05 / 2.70 / 3.35 by stage
  (`rules.js:127`). At stage 2 the hunter is faster than you and you cannot drop the reel.
- **Guide:** the whole house, the route, and — inside camera coverage — the hunter.
- **Out loud:** a continuous route, revised live. The only task where the guide talks for the whole
  duration, which is why it belongs late: the room has had four rounds to learn what this guide sounds like.
- **Failure:** taken with the reel; the reel is lost with the runner (`party-loop.md:23`).
- **Noise:** a walking body reaches ~7 m for the whole transit (`player.js:633-640`, `rules.js:265`). Peak
  bus loudness 0, but sustained and unavoidable.
- **Where the lie lives:** route length. A guide who routes you the long way round has a perfect excuse
  (*"the short way was through his cone"*) and only they could ever have seen whether that was true.
  Distinct from the bible's original Escort, where the lie lived in unattributable smashing — with a pair
  there is only one hammer, so **the noise is attributable and the routing is not.** That inversion is the
  reason this task survives the move to pairs at all.
- **On TV:** an object moving through a collapsing mansion on a clock. The best set piece of the five.

---

## 3. The three numbers, per task

Nothing enters the deck without these measured (bible §5.2.3). Targets are proposals to be beaten by
measurement, not settled facts. "Noise on success" is **peak bus loudness in gunshots**
(`src/game/noise.js:24-28`), the same unit `BREACH_NOISE` is written in.

| Task | Honest error rate | Median completion | Noise on success |
|---|---|---|---|
| 1 THE DARK RUN | **20%** of `clear` calls wrong (band 15–25), sourced from blind strip + camera coverage | **55 s** of a 90 s round | **0.0** — the one silent task |
| 2 THE WALL CALL | **18%** wrong face (band 15–25) | **40 s** including approach | **1.25** — one panel stage crossing, exactly the shipped value |
| 3 THE MANIFEST | **25%** wrong object named or heard (top of band; recall is the noisiest channel) | **60 s** | **~1.8** cumulative (2 props at a proposed 0.9) |
| 4 THE TALLY | **20%** of attempts miss the 1.2 s window honestly | **35 s** (retries included) | **0.3** |
| 5 THE EXTRACTION | **15%** (bottom of band — routing is the least ambiguous channel, so its error must be earned by real occlusion) | **70 s**, i.e. deliberately near the clock | **0.0** peak, but sustained body noise ~0.49 |

Measured with **two known-good players**, no evil, in the harness style already in use
(`harness/_taskrun_picker_measure.mjs` is the model). Completion is timed to the *terminal*, not the exit.
All three land in a per-task harness table before a task is ever dealt.

---

## 4. How camera unlocks accumulate

Each successful expedition lights one camera; each camera carries a `spaceId` and a `live` flag that already
exists (`src/game/furn-dress.js:768-772`), and there are ~12–18 sites in the house
(`src/game/furn-dress.js:776`, capped at 16 at `:883`). Three things compound across rounds:

1. **The TV gets better when good wins.** More live cameras means more angles for the Broadcast Director,
   which is the only real answer to the Watch Party problem under a pair (6 of 8 on the couch). Losing
   rounds literally makes the show worse to watch.
2. **The guide gets less blind — so lying gets harder.** Under the gating in Task 1, the hunter mark only
   renders inside covered spaces. Early rounds: most of the house is dark, *"clear"* is cheap and mostly
   unfalsifiable, and evil's best round is round one. Late rounds: coverage is wide, *"clear"* is checkable
   against what the room watched on the TV, and a guide who says it into a covered room where the hunter
   visibly stood has been caught **by the audience, not by the game**. The honest error rate of Task 1
   should therefore *decline measurably* round over round — that decline is the deduction curve, made
   mechanical, and §1.1's information funnel narrowing at a rate the design controls rather than hopes for.
3. **Evil's counter-play is to keep the house dark.** `FURN_HP.camera = 1.0` is the softest thing in the
   table (`src/destruction/furnprop.js:41`), and breaking a camera already clears `live` and kills its tally
   (`src/game/furn-dress.js:722-728`). A camera can die to a deliberate swing or to a collapse — collapse
   being an *allowed side effect* of a legitimate breach (`party-loop.md:21`) is what makes it deniable.
   **NOT BUILT / unverified:** I could not find any path where falling debris damages a `FurnProp`; today
   all furniture damage comes through the player's sledge raycast (`src/game/player.js:1242`). If that path
   does not exist, deniable camera loss does not exist either, and *"the arch came down on it"* becomes a
   lie the game can trivially disprove.

Design consequence to hold: **camera coverage is a resource evil spends and good accrues.** Do not let a
round unlock more than one, and do not let evil dark a camera without a legitimate cover story available in
the same second.

---

## 5. What does not exist yet (stated plainly)

- **Guide-map gating on camera coverage.** The core new mechanic in this deck. `hunterMark` is currently
  ungated (`src/views/game.js:2559`).
- **Per-blow and per-prop noise.** The bus is fed only by wall stage transitions and hunter door work
  (`src/views/game.js:1432`, `:1546`).
- **"Taken = out for good."** `_attack` detaches a limb and absorbs it (`hunter-ai.js:1090-1116`); there is
  no death, no removal, no round-level TAKEN outcome.
- **The rescue window.** The bible's §6.3 remote-noise save cannot work today: `hearNoise` refuses outright
  during `PURSUE`/`ATTACK`/`GROW` (`src/game/hunter-ai.js:302`). With a pair there is no second body in the
  halls to rescue with anyway — recommend cutting it from the pair build.
- **Touch input, phone views, PartyKit, terminals, the Broadcast Director.** All 0% (audit §2).
