# HANDOFF.md as it stood before the 2026-08-10 prune — VERBATIM

History, not fact. `diet-2`, 2026-08-10. This is the complete 95,398-byte / 1,095-line file as it
stood immediately before the third prune, kept so that **nothing this campaign learned is lost**.

⚠️ **Do not read this to find out what is true today** — read `HANDOFF.md`, then the one appendix
your slice names. Every substantive paragraph below was ALSO routed to a named appendix or an
instrument header; the routing table is in `HANDOFF.md`'s report for this prune and in
`docs/handoff/`'s own section headers, which say where each block came from.

Why the prune: `critic-process-1` (`docs/design/critique-process.md` §4.2, §6 rec 2) fitted
`tokens ≈ 190k + 0.75k × tool_calls` (r² 0.62, n=18) over the campaign's 18 completed agents and
found **~180k of every agent's cost is fixed** — paid before any useful action — of which the
largest identified line is this file, which line 1 instructs every session to read in full.

---

# HANDOFF — read this first, then stop reading

**This is the only document a new session must read in full.** Everything else is reference,
opened on demand — including `docs/handoff/*.md`: read the pointer table below, then **only**
the one appendix your slice names. When this file no longer matches reality, fix it in place;
move history to `docs/archive/` (`docs/archive/handoff-pre-prune-2026-08-03.md` is the first
prune, `docs/archive/handoff-pre-prune-2026-08-07.md` is the second — this file was 365 KB and
every agent was told to read it first, so it was diaeted into this core plus the appendices).

Project: `C:\Users\John\Documents\Run Robot Run\web-prototype` — a Three.js browser
prototype for a multiplayer survival-horror game. Small robots explore a destructible
mansion; a much larger corrupted robot hunts them and grows by absorbing their parts.

```
npm run build && node harness/serve.mjs    ->  localhost:5192/?view=game.play
node harness/status.mjs list               ->  the scoreboard (37 pieces)
node harness/audit.mjs --render            ->  boots all 37 views, flags stale verdicts
```

The locked concept art in `Dev Art/` is the bar. When any doc and the art disagree, the art
wins. `ART_MANIFEST.md` has had multiple measured errors — treat it as hints, not spec.

⚠️ **USE `npm run build`, NEVER `npx vite build`.** It runs `harness/lint-glsl.mjs` first. A
backtick inside a `/* glsl */` template literal terminates the JS string and takes the WHOLE build
down — and every agent shares one dev server and one `dist/`, so it breaks everyone at once, usually
after the author has moved on. **Five times in three days, five files, five agents**, every time as
prose punctuation quoting an identifier inside a comment.

🚨 **The fifth proved a build-time gate fires too late** — the author had not built for 20+ minutes,
and in that window `sledge-2` finished a whole slice unable to run one scenario or screenshot, and
`boot-1` could measure nothing (`breakmask.js` is load-bearing for `game.play`, so it kills the dev
server too). **RULE: editing a file containing `/* glsl */`? Run `node harness/lint-glsl.mjs` after
EACH edit, not at the end.** It takes a second. ⚠️ **Build broken by a file you do not own? Do NOT
fix it** — the owner may have it open and a collision costs more than the outage. Message them the
line. `npm run build:only` skips the lint.

---

## Where it stands — 2026-08-09

**Board:** 0/37 WOWED, round 38. `game.play` is **PASS 76** (r10) — the dig's own score, earned
over ten builder rounds and seven critics. `wall.sheet` **PASS 78** is the only material PASS
lineage. `room.ballroom` **PASS 90** is the project's best result. `board-audit-2` refreshed
every figure on 2026-08-08; `node harness/status.mjs list` is the live board.

**Tree:** `npm run build` green · `mechanics.mjs` **12/12** (the 12th is a ROUND RESET — `unblock-1`,
2026-08-09; validated by reintroducing five separate bugs) · `escape.mjs` **20/20** on `seed=s4` ·
`dig-free.mjs` **15/15** · `sledge-check.mjs` **13/13** · `dig-toggle` **13/0/1 skip** on `?dig=bays` ·
`_progkey1-independence` **12/12 on BOTH arms** (`jitter-1`, 2026-08-09) · `dig-cover` **6/0** ·
`dig-band` **14/1** (re-run 2026-08-09 by `pace-2` at the ×8 base — the clock is now REPORTED and
not gated, so the old 21-check count is gone with the per-space band assertions; the 1 failure is
still the chapel's named floor-plan line) · **`debris-collapse.mjs` 17/0** (`collapse-1`,
2026-08-10 — the support rule, the strain tell and the cyan). ✅ **RE-RUN IN FULL ON THE
`collapse-2` TREE, 2026-08-10, all green:** `mechanics` **12/12**, `escape` **20/20**
(`--q "seed=s4"`), `dig-free` **15/15**, `sledge-check` **13/13**, `dig-cover` **6/0**,
`eo2-calls` **6/0** (worst `ballroom.centre` **426/625**, 618812 tris — unmoved),
`_progkey1-independence` **12/12 on BOTH arms**, `_st1-remain` **11/0**, `_th1-section` **10/0**,
`debris-collapse` **17/0**, and the new `_collapse2-arms` **5/5**.
⚠️ **The `mechanics` 11/12 this paragraph used to warn about is GONE** — it read 12/12 on
2026-08-10, so `inputfix-1`'s `slowframes` failure has been resolved or was transient.
⚠️ **`_progkey1-independence`'s "both arms" needs `--q "seed=s4&dig=0"` for the SCALAR one — the
header now says so** (it said plain `seed=s4`, which silently ran the damage arm twice).
Its header still says plain `seed=s4`, but the dig is on by default, so free faces exist and its
picker scores them first (`a.dig ? 0 : 1000`) — `seed=s4` and `seed=s4&dig=1` both choose the same
damage pair and the scalar path never runs. Found 2026-08-09 by `aperture-1`.
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

**🔨 THE DIG IS THE GAME NOW, AND IT IS ON BY DEFAULT.** `?dig=free` is the default arm:
**free-form positional destruction — you break the wall wherever you swing it**, driven by a CPU
damage grid (`src/destruction/damagefield.js`) that is the single source of truth for the shader
AND every gameplay query, so what you see and what you can walk through cannot disagree. The old
36-bay arm survives as `?dig=bays` (John rejected it: *"I don't really want to use the dud bay"*).
Ornate coat tears off → **white underneath** → **cyan structure that is indestructible and must
stay that way**. Finding the interconnect unlocks the barrier for everyone at once. **B toggles
the cyan walls and resets the interconnect** (John asked for it, for testing).

**🏛️ THE ESTATE ROOMS ARE IN THE PLAYABLE SLICE** — `?estate=port` is the default. Gallery,
both studies and the ballroom **at its full 9.6 m storey** now build from the same modules the
showcase does, so the lighting rigs, practicals and materials come with them. This was the
campaign's biggest single change: before it, *every art score on the board was for something that
was not the game*, and feel findings gathered in the slice were findings about a placeholder room.
See `docs/handoff/estate.md`.

**The current campaign is `docs/design/dig-campaign.md`.** It is the live ordering; this file
remains the facts. ⚠️ **Do not look for the plan in this file's old `## Queue` section — it does
not exist anymore** (retired in the 2026-08-07 diet, `docs/archive/handoff-pre-prune-2026-08-07.md` §5).

**✅ Load time FIXED 2026-08-09 (`progkey-1`) — the biggest single win on the board.** `wall.js`
pinned `customProgramCacheKey` **per panel per layer**, multiplying one shader into 22–36 identical
compiles. Measured on this tree, `quality=high`, seed s4, 1280x720, RTX 3060 Ti:

| | programs | distinct GLSL | redundancy | cold boot | warm boot (driver cache) |
|---|---|---|---|---|---|
| before | **1077** | 264 | 4.08× | **199.7 s** | 39.0 s |
| after | **213** | 180 | **1.18×** | **98.9 / 121.5 s** | **4.5 / 13.1 s** |

The key was defending a real three.js trap and it was **obsolete**: `acquireProgram` discards the
second material's `onBeforeCompile` output, but `getProgram` keys its program map **per material**,
so uniform VALUES are never shared — and the only discriminator that changes emitted GLSL (damage
vs scalar arm) already lives in `defines`, which three hashes AHEAD of the custom key.
🚨 **Panels still break independently and it is verified in PIXELS on both arms**, dug panel 96.8%
of its own rect moved vs neighbour 0.23% against a 0.44% same-config floor —
`harness/scenarios/_progkey1-independence.mjs`. Write-up in `docs/handoff/walls-perf.md`.
⚠️ **`mechanics.mjs`'s 420 s ready-wait can now come down**, but lower it on a measurement, not on
this paragraph. ⚠️ **The next multiplier, `numPointLights`, is NOT free**: the rendered count still
takes four values (12/13/14/15), each a genuinely different shader because `NUM_POINT_LIGHTS` is
substituted into the GLSL, and `views/game.js` warms all four **on purpose** — that is the fix for
John's five-second freezes. Collapsing it means keeping the gadget/flare lights permanently
resident (`harness/scenarios/_price-pointlight.mjs`), not another cache-key edit.

**⏱️ ALL SIX SPACES DIG, AND ALL SIX HOLD JOHN'S MINUTE** (*"lets go about a minute to dig into
another room"*). `digband-1` measured the three that existed; `digcover-1` appended five edges —
`gal_svc`, `gal_east`, `gal_chapel`, `bal_west`, `bal_east` — and the house now reads **chapel 48.4 ·
gallery 53.4 · ballroom 54.2 · study_w 63.0 · study_e 63.1 · service 64.1 s**, five seeds each.
**Nothing was retuned, in either round.**
🎯 **THE RULE THAT DECIDES A LAYOUT, AND IT IS COUNTERINTUITIVE: one interconnect region per EDGE,
so an extra edge adds ~1.3 to K and only ~2 to N — ADDING AN EDGE MAKES A ROOM FASTER, NOT SLOWER.
The knob is wall-per-edge, not wall.** Hubs land fast, dens slow, for a legible reason.
⚠️ **The ballroom's 2.80 m band reads in a 9.6 m room only because the room is not a 9.6 m wall** —
`ballroom-order.js` splits it at 4.80 m with a gilt frieze and the musicians' gallery above, so the
band sits at 58% of a lower storey, the same proportion that already ships in a study, and the eye
compares the breach to the D6 arch 3 m along rather than to the ceiling. **`DIG_H` stays 2.80 as a
looked-at decision.** A tall SINGLE-storey room would not be rescued this way.
✅ **MEASURED 2026-08-09 (`calls-1`) — the worst case with faces actually DUG, which no round had
taken.** A damaged face de-instances, so `digcover-1`'s honest "+6 for five PRISTINE edges" is not
the answer. One blow per face, one page, twelve stations, `?walls=instanced`
(`harness/scenarios/_calls1-dug.mjs`): pristine **426** → all 8 ballroom faces dug **517 (+91)** →
**all 28 free faces in the house dug 601 (+175)**, 692k of 900k triangles. **Both inside 625.**
🚨 **On the pre-`calls-1` build that same fully-dug state would have been ~857** — the dig had a
loaded gun pointed at the budget and nobody had fired it. Panel own-meshes drawn at
`ballroom.centre` go 0 → 115.
🎯 **Its clock is the reusable part: blow-count × `WEAPON_COOLDOWN` imported from `rules.js`,
never a stopwatch.** `DamageField._add()` has no time term, so four runs agreed to the digit while
other agents were saving and rendering — that is how you measure anything here under load.
⚠️ **Two premises it overturned:** `DIG_HEALTH` and the decay curve **do not drive the default
arm** (`DIG_FREE_DEFS` flattens the healths — those are `?dig=bays` knobs; **`IC_W` is the only
band knob in `dig.js`**, and span length is the other), and the point-less `damage()` trap is
**already closed**. `harness/scenarios/dig-band.mjs` is the instrument — extend it, don't rival it.

**🎧 The audio is finally listenable, and it was hiding four real bugs.** Until 2026-08-09 nobody
had ever heard the sledgehammer: `audio-3` gated it on offline spectra, the harness runs muted, and
John last listened before the hammer was equippable. **`harness/audio-render.mjs` renders the
shipped `audio.js` to WAV** (serves the module's bytes to a blank Chromium page and drives the real
exports through `OfflineAudioContext` — no `game.play` boot, so no 168 s wait and no HMR
contamination), and **`refs/audio/LISTEN.html` is 12 labelled clips John double-clicks.**
What the ladder actually was: **the indestructible barrier was the LOUDEST, punchiest hit in the
game** — 18 dB over a fresh wall, so the reward signal was inverted; **`d=0.00` was inaudible**
(RMS −51 dB) and `wall.js`'s no-field arm hard-codes `depthAt: 0`, making that every blow on every
ordinary wall in the house; the hunter **clipped 3,850 samples** at 21 dB over the melee bus; and
consecutive gun shots differed by less than the JND.
⚠️ **STILL UNHEARD BY A HUMAN.** Every figure above is waveform forensics. **Clip `08` needs an
ear** — a real 63-blow dig, good timbre spread (7.57 dB blow to blow) but only ~200 Hz of centroid
drift over 60 s, so it may read as varied-but-not-going-anywhere.

🚨 **FOUR AGENTS WERE KILLED MID-SLICE BY A USAGE LIMIT AT 18:05–18:19 ON 2026-08-09. READ
`docs/agents-resume-2026-08-09.md` BEFORE TOUCHING `player.js`, `sledge.js`, `views/game.js`,
`wall.js`, `damagefield.js` OR `debris.js`** — all six were written to mid-edit. The tree parses,
builds, and passes `mechanics` **11/11**, so nothing is *broken*; but a change can be
syntactically fine and semantically half-done, and none of the four filed a report. **The restart
pack carries what each was holding, including one confirmed diagnosis that must not be
re-derived.**

### Open defects worth knowing before you file a duplicate

- 🚨 **YOU CAN DIG A BODY-SIZED HOLE AND NOT BE ABLE TO WALK THROUGH IT, AND THE WALL STOPPING YOU
  IS INVISIBLE.** John hit this in play and diagnosed the second half himself. **Confirmed by
  measurement** (`_pf1-diag.mjs`): after `[B]`, the near face is open with a **1.46 m channel**,
  the **twin is untouched and solid**, and a body is refused. Two causes stack:
  1. **Depth is per side.** The twin panel has its own `WallState` and its own depth, still 0.
     `[B]`'s `setBarrier(false)` clears the barrier *cells* on every dig panel but **digs nothing**.
  2. **The remaining wall cannot be seen.** `aperture-1` flipped only the **scalar** arm to
     `DoubleSide`; dig panels stayed `FrontSide` deliberately (a free face already has a twin
     facing the other way, and double-siding would put the far face's planes inside the near
     face's crater). **Consequence nobody drew: once you dig through your own side, the twin's
     planes are backface-culled from your eye — you see into the next room, cannot walk there, and
     nothing on screen explains why.** John: *"you can't see the back side of the other wall and
     thats why im unable to see the bits I can't get through."*
  ✅ **HALF OF THIS IS FIXED — `[B]` KEEPS ITS PROMISE NOW (`unblock-1`, 2026-08-09).** It printed
  *"BARRIERS OFF — DIG ANYWHERE"*, a claim about getting through, and it was false.
  🎯 **THE CAUSE WAS AN ORDERING BUG, NOT A MISSING MECHANIC, AND NOTHING NEW HAD TO BE BUILT.**
  `WallPanel._couple()` already mirrors through-cells onto the twin, and `applyHit` fires it on
  `res.brokeThrough` — but `brokeThrough` requires a cell to reach `OPEN_AT` **with no barrier
  behind it**, so while the cyan is up a player digging to the barrier NEVER breaks through and
  the coupling never runs. Clearing the barrier afterwards did not retroactively fire it.
  `toggleBarriers` now runs a second pass replaying the coupling the barrier suppressed — it digs
  nothing and removes no material the player did not already remove. Two passes, and the order is
  load-bearing (`_couple()` skips a source cell whose own barrier is still set).
  **Re-measured with the instrument that found the lie** (`_pf1-diag.mjs`, same face, same seed):
  twin `f.gal_east.1.a` **0 cells through / channel 0 m / body −0.34 m REFUSED** → **548 cells
  through / channel 1.463 m / body 8.6 m THROUGH**, `freePassable` 0 → 2.
  🚨 **`_pf1-diag.mjs` THEREFORE REPORTS 2 FAILURES ON A GOOD TREE — its assertions were written
  to CONFIRM the defect, so they invert once it is gone. Its header now says so in full. Do not
  "repair" the code it points at.**
  ✅ **AND THE OTHER HALF IS FIXED TOO — BOTH OF IT (`seethrough-1`, 2026-08-09). `_pf1-diag2.mjs`
  HAS NOW RUN, AND IT WENT 5/2-FAILED → 7/0.**
  🎯 **THE SHIPPED UNLOCK HAD THE SAME BUG AND IT IS ONE MISSED CALL IN A FILE `unblock-1` DOES
  NOT OWN.** `room.unlockBarrier()` reaches `WallPanel.setBarrier(false)` (`wall.js`), not
  `views/game.js`'s `toggleBarriers`, so it never got that second pass. Measured before the fix:
  an abandoned 60-blow dig, then a **legitimate** interconnect breakthrough elsewhere in the house
  — near face reports a **1.737 m channel**, twin **0 hits**, body **−0.19 m REFUSED**; and swept,
  **the two faces of one band disagreed about passability on 42 of 42 span×seed pairs.** The fix
  is `setBarrier(false)` replaying the coupling the barrier suppressed, i.e. `unblock-1`'s own
  ordering insight moved down into the panel where **both** callers reach it. After: body
  **8.6 m past**, **0 of 42 disagree**. ⚠️ **`toggleBarriers`' own second pass is now redundant
  but harmless** (`_couple()` early-outs when nothing changed) — `unblock-1` owns whether it goes.
  🎯 **AND THE RENDERER HALF IS FIXED WITHOUT `DoubleSide`, WITHOUT A MESH AND WITHOUT A DRAW
  CALL, BECAUSE ROUND 5 ALREADY BUILT THE HOOK AND PAINTED IT THE WRONG MATERIAL.**
  `breakmask.js` `barrierMaterial` has had a *"this face is not through yet, so draw the wall
  band instead of discarding"* branch since round 5 (`uOpenAt`) — it filled it with `uCavity`,
  *"the same near-black the reveal box is painted, because that is literally what is there."*
  **It is not what is there:** a reveal box lines an aperture, a dig band is 0.30 m of solid wall,
  and painting it near-black is what made the breach photograph as a black void you would walk
  into. It is now the **white the shell already is** (`uRemain`, continuing `DIG_BAND_LOOK[3]`'s
  0.780 ramp, with its own emissive for the same reason round 11 gave). The branch also now asks
  the **BAND** rather than this face — a second sampler, `tTwin`, on the twin's grid with `u`
  mirrored — so *the renderer can no longer show a hole the far side still fills.*
  📉 **Measured, one crater, one camera, one frozen page, both arms as UNIFORMS**
  (`harness/scenarios/_st1-remain.mjs`, 10/0, same-config floor **0.00**): John's exact state
  reproduced — a dug dud, barrier dropped, body refused at −0.19 m — goes **luma 35.6 → 109.9,
  48.4% of the breach under luma 20 → 6.0%**. The everyday interconnect mid-dig, no unlock
  anywhere, goes **9.7% under luma 20 → 0%**. **The cyan is |Δ| 0.000** — both new terms are gated
  on the G channel, so every texel with structure behind it takes the byte-identical path — and
  **`wall.sheet` PASS 78 is byte-identical against a baseline taken this round** (sha1).
  ⚠️ **NOT JUDGED, AND IT IS A LOOK CALL A BUILDER MUST NOT MAKE FOR ITSELF:** whether 0.720
  albedo / 0.055 emissive is the right white, and whether the filled crater reads as *recessed
  wall* or as *a flat white card*. Frames:
  `progress/playtest/game.play.st1-{uncoupled-twin-ON,uncoupled-twin-OFF,unlocked-dud-NOW,
  unlocked-dud-WAS,interconnect-middig-NOW,interconnect-middig-WAS}.png`.

- ✅ **FIXED 2026-08-09 (`calls-1`): the draw-call overrun was NEVER THE BALLROOM — it was SIX
  GADGETS LYING ON FLOORS IN ROOMS YOU CANNOT SEE.** Residency switches off every room you are
  not in; the world pickups (`limbs.js` `spawnGadget`, the sledgehammer in `views/game.js`) are
  parented to the SCENE, so residency had no opinion about them and only the view FRUSTUM removed
  them — which, from the middle of a 36 m house, removes almost nothing. Attributed per draw call
  with `harness/scenarios/_calls1-who.mjs` (it wraps `WebGLRenderer.renderBufferDirect`, so the
  table sums to `info.render.calls` by construction — no ablation, no "one mesh = one call"):
  at `ballroom.south`, **`pickup.oil` 205 · `ball` 134 · `skates` 90 · `nailgun` 69 · `grapple` 39
  · `sledgehammer` 18 = 555 of 689 calls**, five of them lying in rooms whose walls and floors
  were switched off. 🎯 **The whole ported 9.6 m ballroom was 20 of those calls**, and every room
  in the house is 10–21 — `GeoBin` works exactly as `room.js`'s key tables claim.
  **Fix: loose objects join residency** — `room.trackLoose()` + a gate in `setViewpoints`, wired
  off `LimbField`'s existing `onDrop`/`onTake`. **Never the player or the hunter.** `?loose=0`
  reverts. **841 / 722 / 682 → 599 / 480 / 426 on the three wall arms**, triangles untouched.
  Look A/B in one frozen page (⚠️ **hold the page still first or the same-config floor swallows
  the signal** — `harness/still.mjs`'s `hold()`; and note the floor was **never mainly the
  grain**, it was `_liveLoop`'s dynamic resolution — see `docs/capture-determinism.md` §7):
  **byte-identical at 4 of 5 stations** while hiding up to six items and saving up to 465 calls.
  The one residual is 126 px at `ballroom.south`, owned entirely by `pickup.oil`, **84% of them
  unlit once it is hidden** — the oil can's pilot flame in the black D5 doorway, i.e. the cull
  removes a prop on fire in a void rather than a picture. Looked at, cropped, both frames on disk.
  🚨 **IT HIDES THE MESHES AND LEAVES THE LIGHTS, AND THE ONE-LINE VERSION WAS A SHADER STALL.**
  The pickups carry their own `PointLight`s, so `holder.visible = false` moves `numPointLights` —
  the field `views/game.js` says in capitals recompiles every visible material, priced by
  `perf-stall-1` at +132 programs, i.e. John's five-second freeze. Measured over one twelve-station
  walk, no flips: `?loose=0` **213 → 213 (+0)** · hiding the holder **232 → 284 (+52)** · hiding
  only the drawn descendants **back to a constant {13,14}**.
  🚨 **AND THE OBVIOUS PROBE PASSED THE BROKEN BUILD** — flipping the cull at a settled station
  read the same program count either side at all twelve, because residency had already paid the
  arrival compile before the first read. **A flip A/B taken standing still is blind to a cost paid
  on arrival.** Two no-flip walks (the change vs its own `?loose=0` revert) is the form that sees it.
  ⚠️ **Still loaded and NOT fixed: one gadget is 39–205 calls** because `src/gadgets/index.js`
  builds each prop as 44–161 individually-materialled sub-meshes. Two gadgets dropped in one
  room is ~471 of 625 legitimately. Write-up: `docs/handoff/walls-perf.md`.
- ✅ **FIXED 2026-08-09 (`aperture-1`): the exit sites' black apertures were A ONE-SIDED FILL FOR A
  TWO-SIDED HOLE, and it was NOT the instancing path** — `?walls=legacy` shows the identical hole.
  `wall.js` built all four layer planes `FrontSide` facing local +Z, and a connector's `rotY`
  (`spaces.js`) encodes **the wall's axis, not a facing**: `x.study_w.servants` and
  `x.ballroom.terrace_e` are both `rotY: PI/2`, so one faces into its room and the other faces out
  of the house. On the +x/+z walls every plane was backface-culled from the only room that can look
  at it. `x.ballroom.terrace_e` went **luma 4.3 / 99.7% of its rect unlit → 25.1 / 39.2%** with the
  wall control at 0.08 pp and a 0.19 pp floor, both arms in one frozen page. **Fourteen scalar
  panels were affected — six exit sites and the eight interior breachables, which from their blind
  room read as an open doorway.** Fix is `DoubleSide` on the scalar arm's layer materials
  (`wall.js`) AND on `wallinstances.js`'s shared pristine/spent faces — **both were required**,
  because a pristine exit site is drawn only by the instance. **Zero draw calls, measured.** The dig
  is deliberately untouched (a free face has a twin facing the other way). Write-up:
  `docs/handoff/walls-perf.md`.
  ⚠️ **Two sites are still dark and it is a DIFFERENT object, now isolated:** `x.ballroom.orangery`
  (luma 6.3) and `x.gallery.east` (11.6) have their wall face in the draw set, and what covers it is
  **`exterior.js`'s `exterior.dress.mortar`** — the `plaster`-lock tell, a deliberate opaque slab
  across 92% × 88% of the aperture, 8 mm proud, drawn on BOTH faces. It is doing its job and it
  reads as a black rectangle. **Owner: unassigned, `src/game/exterior.js`.**
- ✅ **FIXED — the softlock where a fully-dug wall was still not a passage. `_macro`'s `MACRO` 2 → 1.**
  **16 of 1750 face×seed pairs were unopenable; now 0.** ⚠️ **And both filed diagnoses were wrong,
  including the one I forwarded as strong evidence** — worth reading, because the error is the
  reusable part. The story was "`mirrorBarrierFrom` flips the lattice phase in the mirror", backed
  by n=3 stalls all on mirrored `.b` faces. **The phase does flip on odd-length runs, and it buys
  nothing**: the full-macro-column count is identical on every row, and `channel()` reads 0.740 m
  on *both* twins at depth 1.0. Over the full 1750 pairs the split is **6 on `.a`, 10 on `.b`,
  both axes** — and the originally filed instance is itself an `.a` face, which the mirror never
  touches. **n=3 was a small sample and I called it a strong signal.**
  🎯 **The real invariant, and it generalises: the quantum passability is measured in must be
  smaller than the passage's margin over a body.** It was three times larger — margin **0.051 m**
  against a quantum of **0.185 m** — so losing any single one of the 36 macro cells a passage is
  made of cost it 0.740 → 0.555 m permanently.
  ✅ **The cyan got STRICTER, not looser:** `OPEN_FRAC` 0.7 over a 2×2 block meant 3-of-4, so a body
  could structurally be let through a 9.4 cm strip of barrier. At `MACRO` 1, `gone` ⟺ `passable`,
  and that is false under a barrier cell.
  ⚠️ **Band moved the safe way: 46 → 48 blows (+1.9 s), still in band in all six rooms.** Cost is
  collider boxes on a *damaged* face 11 → 39; **pristine stays at 1**. `IC_H` never touched.
  🚨 **AND THE OBVIOUS REGRESSION GATE DOES NOT CATCH THIS — measured, not argued.** "A fully
  excavated span must be passable" **passes on all 70 pairs at the broken setting** while three
  rows are unopenable. The gate that works is **margin ≥ quantum**, both read off the live grid;
  validated by reintroduction (FAILS at `MACRO` 2, PASSES at 1).
- 🎨 **Every gallery dig face has a painting over part of it, and it cannot be designed around.**
  `gallery-order.js` dresses both long walls end to end; portrait pitch minus width leaves 1.7–1.9 m
  gaps, and no authored span (2.56 / 2.96 / 5.72) fits between two portraits. Pre-existing in kind —
  a shipped pilaster already clips D1's jamb — and the alternative was no gallery dig at all.
  `gal_svc` is pier-clean by construction. **A look critic should rule on it**
  (`progress/playtest/game.play.digsite-gallery-to-study-e.png`); smashing through a portrait may
  well be *on* concept rather than off it.
- ⚠️ **The chapel gets no dud at all on 2 of 5 seeds.** 4.36 m of usable shared wall against the
  ~11 m a search needs. Floor plan, not tuning; shipped because a fast way out of the deepest dead
  end is a mercy, and `dig-band` fails it on its own named line so it stays visible.
- ✅ **FIXED, both halves — the "not here" clank was firing on SUCCESS.** `depthAt` reads 1.00 at an
  indestructible barrier **and** at every cell you punch clean through, so depth alone could not
  tell "you cannot get through" from "you just did": driven against a real 63-blow dig, **10 blows
  on breakable material played the refusal sound.** `applyHit` now returns
  `barrier: !!this.field.barrierAt(u, v)` (and an honest `false` on the scalar arm — a stage panel
  has no cyan behind it), `player.js` passes the whole result, and `playMeleeImpact` resolves
  `barrier > brokeThrough > blocked > depth`, falling back to depth when the field is absent.
  ⚠️ **`res.blocked` is NOT a substitute and this was measured, not assumed** — driven against an
  all-barrier field it was true **zero times in 63 blows**, because the 0.52 m brush always finds a
  neighbouring cell it can still remove. That wrong answer was authored, tested and discarded.
- ✅ **FIXED 2026-08-09 (`visible-1`) — 58% of every cell's life was invisible, AND THE REAL
  FIGURE IN PLAY WAS WORSE THAN THE ARITHMETIC ONE.** `DAMAGE_BANDS`' deepest layer saturated at a
  **smoothed** depth of **0.420** while `passable()` needs **raw 0.999**, so raw 0.42 → 1.0
  rendered identically. `digparity-1` filed that as a worst-case aiming model. **It is not a worst
  case.** Driven on three seeds with the most flattering plausible aim there is (`dig-band` phase
  2 — every blow at the LEAST-DUG cell, so the player never swings at a hole they already made),
  over 144 blows of real THROUGH work: **62.5% of blows moved nothing within 25 cm of where the
  hammer landed**, 57.6% delivered under a tenth of a fresh blow's visible work anywhere in the
  52 cm brush, and **72.9% landed on a texel already fully torn.** A probe reads 66.7%.
  🚨 **THE FIX HAD TO BE MATERIAL SURVIVING LONGER, AND THE ARGUMENT IS SHORT ENOUGH TO CARRY.**
  Past smoothed 0.42 all four layer planes have discarded at that texel, so the ONLY surface left
  on screen is `barrierMaterial`'s plane — the cyan, which John has settled twice must never
  appear to take damage. **There was no surface in the last 58% that was allowed to change**, so
  no shading, glow, decal or per-blow evidence could ever have worked; progress can only read if
  there is still destructible material at the point of impact. **`DAMAGE_BANDS[3]` is now
  `[0.420, 1.000]`** — the back of the shell picks the depth axis up exactly where the front leaves
  off, so the cyan is revealed progressively and every blow past the front's tear still takes
  material away where it lands. **4.1% dead, down from 61.4%.**
  ✅ **AND THE GATE IS VALIDATED BY REINTRODUCTION IN THE SAME PAGE, ON EVERY RUN** — `dig-band.mjs`
  **B2c** drives both arms and FAILS ITSELF if putting the old table back does not go blind. The
  bands are uniforms, so the defect is one `uDmgBand.set()` away.
  ⚠️ **BANDS 0-2 ARE UNTOUCHED AND THAT IS WHAT PROTECTS EVERY SCORED RESULT** — the crater's
  outline, round 6's one ragged tear and the raggedness `critic-dig-5` closed are all functions of
  bands 0-2. `wall.sheet` **PASS 78** and `game.play` **PASS 76** are **byte-identical captures**
  against baselines taken this round (`progress/visible1/`), and the scalar arm's emitted GLSL is
  unreachable from the change (`uLitBand` lives in `DAMAGE_PARS`).
  ⚠️ **THE TRADE, STATED: the cyan's diameter at the END of a dig goes 96% → 88% of the breach**
  (`critic-dig-4`'s *"it should fill nearly the whole breach"*). Eleven candidate bands were priced
  against one recorded drive (`harness/evidence/_visible1-analyse.mjs`); this one pays **8 points of fill
  for 58 points of dead blows** and is the cheapest point on the curve.
  ⚠️ **Band 3's COLOUR moved with it and had to**: round 6 chose 0.280 on the stated premise that
  layer 3 *"is NEVER seen head-on"*, and it is now the crater FLOOR for most of a dig — at 0.280 it
  photographed as a flat mid-grey ring, i.e. the contour map round 6 deleted. At 0.780 the two
  white faces read as one material and **the width of the surviving white IS the remaining
  thickness of the wall.** The cut face and the dark contact line before the cyan are unchanged.
  ⚠️ **THE BAND DID NOT MOVE**: both arms drove **bit-identically** in one page (same blow counts,
  same channel widths, opened at 44 on both) — `_add()` never reads this table — and `dig-band`
  reads 6/6 in John's minute.
  ⚠️ **NOT JUDGED: the section at a GRAZE.** `ThirdPersonCamera` puts the boom behind the player
  along the look direction, so at a graze the robot covers the whole hole and the boom's wall
  raycast shoves the camera into the corridor. Framing it needs a camera not derived from the
  player (`shoot.mjs --cam`), which cannot dig. `_visible1-shots.mjs` records the failure.
  Pictures: `progress/playtest/game.play.vis1-r10-*.png` (the old arm) against `…-r11-*.png`, one
  crater, one camera, one page, at 0/6/12/20/30/31/38/44 blows.
- 🐞 **`glowPatch` delivers `strength²`.** `premultipliedAlpha: false` plus additive blending
  multiplies the factor in twice. Every caller is compensating by eye.
- 🎨 **The grade's black point clamps lit surfaces to zero, and it is arithmetic, not an opinion.**
  `contrast` is applied around a 0.5 pivot, so at 1.05 the output is `1.05*col - 0.025` and
  **everything below col 0.0238 lands at or under zero**; `toeCrush` then takes a little more, and
  `lift` 0.011 does not clear the clamp. A band roughly 0–2.9% wide is deleted before display.
  ✅ **Now on a key rather than in a decision queue: [G] cycles SHIPPED / LIFTED / OPEN live**
  (`?black=0|1|2`), because a still frame is the wrong instrument — crushed blacks look *better*
  in a screenshot and worse to play. **Arm 0 is the shipped grade byte-for-byte**, so every stored
  capture and `grade.mjs` number stays comparable until John picks something else.
- ⚠️ **`strobe.mjs`'s anchor picker is unguarded against chained connectors.**
- ✅ **BUILT 2026-08-10 (`collapse-1`) AS A SUPPORT TEST, AND `docs/design/disconnection.md`'s
  CENTRAL PROPOSAL IS REFUTED WITH A NUMBER RATHER THAN AN ARGUMENT.** That doc specifies a
  connected-components flood fill dropping material fully SEVERED from the face. Measured on the
  shipped grid over 220 blows × 3 seeds (`debris-collapse.mjs` C1): **7 cells ever severed,
  largest component 4 cells** — 0.06 m² of single chips across a whole dig, against a 26-cell
  floor below which `views/game.js` will not even spawn a slab. A radial dig excavates a **bowl**;
  the border ring stays intact, so everything is still joined through the rim and a flood fill can
  never call anything free.
  🎯 **A cell with a hole under it is UNSUPPORTED long before it is DISCONNECTED**, so the rule is
  an ARCH and not a graph of what is left, and it lives in **`src/destruction/support.js`**.
  ⚠️ **The flood fill is still there — it just fills the right set: HANGING material, not
  SURVIVING material.** That one word is the difference between a test that fires on 7 cells in a
  whole dig and the rule the mechanic is built on. `disconnection.md` §6 — *the piece that falls is
  the piece that left, at the size it left* — survives intact and is what `views/game.js`'s payout
  obeys.
  🚨 **AND THE FIRST SHIPPED VERSION OF THE TRIGGER WAS REJECTED IN PLAY — SEE THE `collapse-2`
  ENTRY BELOW.** A bottom-up span sweep with the cascade always live took the whole storey off the
  first through-blow low on a face; John: *"it should not collapse the entire wall from just
  hitting the bottom once in 1x dig mode."*
- ⚠️ **`docs/design/disconnection.md` IS NOW WRONG IN ITS §2 AND NOBODY HAS REWRITTEN IT.** §3–§6
  are still good. Read `src/destruction/support.js`'s header instead; it carries the measurement.

### 🔴 Live right now — 2026-08-09, and check before you take a file

| agent | owns | doing |
|---|---|---|
| `visible-1` | ✅ **DONE** — `src/game/wall.js` (`DAMAGE_BANDS[3]`, `DIG_BAND_LOOK[3]`) + `breakmask.js` (`uLitBand`) | the last 58% of a dig reads: **62.5% of blows dead at the impact → 4.1%**. `damagefield.js` untouched |
| `calls-1` | ✅ **DONE** — landed in `src/game/room.js` + 2 lines in `src/views/game.js`; `wallinstances.js`, `spaces.js`, `src/world/**` and `src/lighting/**` were **not touched** (nothing was wrong in them) | the 682–841 vs 625 overrun: **599 / 480 / 426**, and it was the gadget pickups, not the ballroom |
| `localise-1` | ✅ **DONE** — `src/game/spaces.js` only. `src/world/**` and `src/lighting/**` were **not touched** (measured: they contain **zero** world-absolute coordinates and never import `SPACES` — they already take a plan plus an optional `base` matrix, so the whole cost really was in `spaces.js`, as `house-packing.md` §9.1 said) | **every room is now a footprint + content in its OWN frame + a placement**: `SPACES = roomsFromPlan(HOUSE_PLAN)`, `ROOMS` is the library, `study_w`/`study_e` are ONE footprint used twice. **1170 exported leaves `Object.is`-identical**, 7/7 capture-mode frames byte-identical, programs **213 → 213**, `eo2-calls` **426/625** unchanged |
| `jitter-1` | ✅ **DONE** — **NOTHING IN `src/` WAS TOUCHED AT ALL.** New `harness/still.mjs`; `harness/scenarios/_progkey1-independence.mjs` repaired; `_jitter1-floor.mjs` / `_jitter1-who.mjs` are the attribution probes; `docs/capture-determinism.md` §7 | two captures of a frozen scene were not the same picture: same-config floor **43–49% → 0.00%**, both arms **12/12**. It was `_liveLoop`'s **dynamic resolution**, not the grain and not the gallery |
| `unblock-1` | ✅ **DONE** — finished `cam-1`'s slice. `src/views/game.js` (**not** `onChunk`), `harness/mechanics.mjs` (**12/12**), new `harness/scenarios/_unblock1-focus.mjs`, `_pf1-diag.mjs` header. `player.js` / `sledge.js` / `weapons.js` needed **no further edit** | John's six playtest blockers. **Pointer lock no longer eats the desktop cursor**, the loop pauses tabbed-away, held keys drop, the ghost sledge is gone, the reset audit is complete, `[B]` keeps its promise, and **`mechanics` finally exercises a round reset** |
| `collapse-1` | ✅ **DONE** — new `src/destruction/support.js` (the rule AND its tell, one sweep), `damagefield.js` (`COLLAPSE.span` 1.05 → **1.45**, new `nearFrac`, `_strain()` in `flush()`, A cleared on reset), `breakmask.js` (`uCraze`, inert at 0), `wall.js` (one `craze:` line). `debris.js` and `views/game.js` **untouched** — the payout `debris-1..4` built was already right | **UNSUPPORTED WALL COMES DOWN AND THE WALL WARNS YOU FIRST.** Connectivity refuted with a number (7 cells in 220 blows); support brings down 142–409 in sixty. Random aim costs **2.81×** the blows of an undercut to clear 6 m². `debris-collapse` **17/0** |
| `collapse-2` | ✅ **DONE** — `src/destruction/support.js` (rewritten: the ARCH), `damagefield.js` (`COLLAPSE.fail`/`waves`/`cap` + the header), `debris.js` (`vTerm` per kind, the wall-contact grind, the heavy landing), `src/views/game.js` **`onChunk` only**. **`breakmask.js` and `wall.js` were NOT touched** — no shader change at all, and `wall.sheet` does not import a single file in the diff | John's two playtest defects. **The chunks floated** — `drag` on `vy` is a terminal velocity of 1.41 m/s against a 6.7 m/s free fall, plus a 68-contact wall grind; now 97% of free fall. **The collapse was too eager** — one bottom hit took the storey; it is now an arch with a 3.40 m² threshold that chains. `debris-collapse` **17/0**, `_collapse2-arms` **5/5** |
| `aim-1` | ✅ **DONE** — new `src/game/aimmark.js`, `src/game/rules.js` (`STEP_H`), `room.js` (`boxesNear`/`collide` take a step height + the barrier guard, `sillTop`, `stepCensus`, `setStepGuard`), `player.js` (`nextBlowPower`, `stepLift`), `views/game.js` (**not** `onChunk`). New gates `aim-mark.mjs` **12/0** and `aim-step.mjs` **12/0** | **YOU CAN SEE WHERE THE BLOW LANDS, AND A LOW SILL IS NO LONGER A WALL.** The mark is the brush's real 1.04 m footprint on the wall, sinking into the crater; the step-up is 0.55 m and makes **nothing** else in the house walkable |
| `pace-2` | ✅ **DONE** — audited and finished two dead predecessors. `src/game/wall.js` (one stale COMMENT corrected, no behaviour), `harness/scenarios/_th1-section.mjs` (wrong-arm gate), `dig-band.mjs` header. **No `src/` behaviour was changed at all** — `pace-1`'s and `thickness-1`'s code was already complete | **×8 IS LANDED AND EVERY GATE IS RE-BASELINED AND GREEN.** Plus the search measurement nobody had, and the one defect that made a good build read red |

🚨 **×8 IS THE BASE, IT WAS ALREADY LANDED BY `pace-1` BEFORE IT DIED, AND `pace-2` VERIFIED IT
END TO END (2026-08-09).** `damagefield.js` **`DIG_BASE` = 8**, on the field's only writer so every
instrument sees it; `_add()`'s clamp is **split** (clamped copy sizes the brush RADIUS, unclamped
`power` scales the DEPOSIT) which is why `[ ]` was a no-op above ×1 before; `views/game.js`'s
ladder is re-centred to **`[0.125, 0.25, 0.5, 1, 2, 4]`** with **×0.125 the pre-2026-08-09 game
bit-for-bit** (`8 * 0.125 === 1`) and the keys read inside `!engine.capture`, so no scenario can
reach them. `WEAPON_COOLDOWN` did not move. **`BRUSH_R` did not move**, so `debris.js`'s recorded
`onChunk` tripwire is not armed.
✅ **RE-BASELINED, NOT DEFEATED, AND RE-RUN THIS ROUND:** `dig-band` **14/1** (the 1 is the
chapel's named floor-plan line) with the **clock REPORTED and no longer gated** — John suspended
the set time, and `DIG_BAND="lo,hi"` re-arms it in one env var the day he names a new one; its
**B2c drives at `brush.base = 1`** so the reintroduction check keeps the depth resolution it needs
(2.6% dead against 54.1% with the defect put back). `dig-free` **15/15** · `sledge-check` **13/13**
· `escape` **20/20** · `dig-cover` **6/0** · `eo2-calls` **426/625** · `_progkey1-independence`
**12/12 on both arms** · `_st1-remain` **11/0** · `mechanics` **11/12** (the `slowframes` failure
is `inputfix-1`'s).
🚨 **AND THE SEARCH SURVIVES ONLY AS A SHAPE, NOT AS A COST — MEASURED, five seeds × six spaces,
and the argument is written into `dig-band.mjs`'s header.** **A probe now costs exactly 1 blow in
every room on every seed** (it was a very stable 6.14–6.29). The geometry is untouched — the
interconnect still covers **32%** of probe spots and the seeds still give **30 distinct
winning-spot sets in 30 rows** — but FIND is now **0.0–3.6 s** house-wide and TOTAL medians are
**chapel 2.4 · gallery 3.6 · ballroom 3.8 · service 5.5 · study_w 6.0 · study_e 6.4 s**, 9.4×–25.3×
under the retired 60 s target. `dig-free` puts dud : answer at **1 : 3.0**, from 6 : 49.
🎯 **AND THE PROBE-SPACING TRADE HAS INVERTED, which is the part a designer should see:** the old
pacing charged you for probing finer (1.0 m read 62.4 / 70.7 / 66.8 s against 1.5 m's 61.8 / 64.6 /
60.8); at ×8, 1.0 m is **equal or faster in four of six rooms**. **Over-probing is no longer
punished.** The knob if John wants the search back is `dig.js` `IC_W`, never the base speed.
⚠️ **The dig-site DEPTH work is `thickness-1`'s `SEC_FLOOR` and it is real but SUB-PIXEL AT PLAYER
RANGE.** `breakmask.js` `uSecFloor` (a minimum section width in PIXELS, band 3 only, `[6, 10]`)
takes the break edge from **median 1 px / mean 2.61 → median 2 / mean 3.22**, |Δfill| **−0.03 pp**
against a **0.000** same-config floor, and it is what finally puts round 10's `uCore` cyan-in-
section on screen (core 1.31% → 1.60% of the breach rect). **At 6× the cyan plainly reads as a
slab with a bright front face and a darker return; at 1:1 it is still 2–3 px and John's *"I can't
tell at a glance"* is NOT closed.** `[8, 20]` measures better and is correctly rejected — looked at
twice now — because it throws detached dark-teal specks into the flat fill, i.e. the cyan reading
as damaged. Frames: `progress/playtest/game.play.th1-{player-eye,section}-*.png`.
🚨 **`_th1-section.mjs` WAS FAILING A CORRECT BUILD AND THE CAUSE IS THE REUSABLE PART:** it swept
five arms and then asserted on **`read['5px-cap6']`** while `wall.js` shipped `[6, 10]` — a typed
arm name that drifted from the constant, reading 2.61 → 2.67 px against its own bar. **The arm
list is now BUILT from an imported `SEC_FLOOR`**, so it re-points itself; **10/0**.
⚠️ **AND ONE COMMENT IN `wall.js` WAS LYING IN THE EXACT WAY THIS FILE WARNS ABOUT.** It said the
barrier material *"paints a contact shadow where the broken rim tucks over it"* — round 5 deleted
`_bcontact` by name for being a 2× brightness ramp keyed to how far you had dug. **The barrier
shader paints NOTHING on any cyan texel**: its two mixes are both gated on the G channel. The
cyan's only thickness cue is drawn by the SHELL (`uCore`), and a future round must widen or darken
that band rather than add occlusion here.

🧱 **UNSUPPORTED WALL COMES DOWN, AND IT IS A SKILL RATHER THAN AN EFFECT — `collapse-1`,
2026-08-10.** John: *"extra pieces to break off if much of the wall has already been cleared around
it… **this could create an efficiency for the player to utilize as a skill to differentiate
themselves — how effectively they can break down large segments with the least hits**."*
🚨 **THE DESIGN DOC NAMED THE WRONG TEST AND IT IS NOW REFUTED WITH A NUMBER, NOT AN ARGUMENT.**
`disconnection.md` §2 specifies a connected-components flood fill dropping material fully SEVERED
from the face. On the shipped grid, 220 blows × 3 seeds: **7 cells ever severed, largest component
4** — a radial dig excavates a bowl, the border ring stays intact, nothing is ever an island.

🧱 **AND THE RULE THAT REPLACED IT WAS REJECTED IN PLAY TOO, SO READ THIS PARAGRAPH BEFORE THE
REST — `collapse-2`, 2026-08-10.** John, after playing `collapse-1`: *"It does collapse everything
unsupported but I think it **should not collapse the entire wall from just hitting the bottom once
in 1x dig mode**. I think instead when we blow through and the below feels unsupported it should
**also consider structural integrity of the other connected parts of the wall**, and when **that
falls below a certain threshold** that's when **the collapse chains**."*
🎯 **THE MODEL NOW SHIPPED IS HIS, AND IT IS TWO SENTENCES: THE ARCH.** A wall arches over its
holes — material with a hole anywhere beneath it in its own column is *hanging*, carried to the
piers rather than standing on the ground. Every **connected region of hanging material** is
weighed (`COLLAPSE.fail` = **3.40 m² of original wall**, `Σ (1 − depth) × cellArea` over the
region); while a region is under the threshold the arch holds and only the ONE COURSE directly
over a run wider than `span` sheds; once a region reaches it, **that whole region comes down in
one event**, in waves, until the wall stops moving.
📐 **MEASURED ON THE SHIPPED GRID AT ×1** — one bottom blow hangs **2.34 m², 69% of the threshold**
(2 cells fall, 260 crazing); **hammering ONE SPOT plateaus at 1.82–2.24 m² and NEVER fires, at
either arm**; a minimum body channel dug upward *peaks on its first blow at 2.26 m² and falls*,
because digging upward removes the very material that would hang. Widening a low cut goes
**2.34 → 3.18 → 4.38 m²** and takes the storey on the third blow.
⚠️ **THE THRESHOLD IS AN AREA IN m², NOT A FRACTION OF THE FACE, AND THAT WAS MEASURED, NOT
CHOSEN.** One bottom blow hangs **14.7% of a 5.72 m face and 35.1% of a 2.56 m one** — a
fraction-of-face threshold would take a small wall down on a single hit. In m² the same blow hangs
**2.34 and 2.52**: the mass over a 1.04 m hole is the mass over a 1.04 m hole.
🎯 **AND IT IS WHAT CLOSED THE ×1 / ×0.125 ASYMMETRY THIS FILE ASKED SOMEONE TO REDUCE.** The old
1.45 m SPAN rule is 15 cells and a ×0.125 blow is 6.6 cells across, so a run only reaches it if the
player deliberately merges craters — **it never fired at ×0.125 on any drive measured** (widest run
9 cells over 240 blows), i.e. the mechanic was effectively dead on that arm. A load threshold is in
metres of wall rather than in blows, so both arms have the same optimal strategy — cut low, cut
wide — and differ only in what it costs: **the arch chains at blow 2 at ×1 and blow 64 at ×0.125,
and the event is the same shape (4.83 m² against 6.23 m²)**. `harness/scenarios/_collapse2-arms.mjs`
is the instrument, **11/0**.
🎯 **THE SKILL IS MEASURED IN BLOWS AND IT IS REAL, AND THE ARCH WIDENED IT.** Both arms digging at
the SAME spot, random scatter costs the following multiple of a marching undercut's blows
(`debris-collapse` C5, five seeds, same face, same target):

| | 1.16 m² | 3 m² | 6 m² |
|---|---|---|---|
| the span sweep (`collapse-1`) | 1.10× | 2.00× | **2.81×** |
| the arch (`collapse-2`) | 1.10× | 1.40× | **12.50×** |

🚨 **AND THE REASON IS THE PART A DESIGNER SHOULD READ.** Under the span rule a scatter accidentally
satisfied a row-length test and got a free storey; under the arch it builds several small hanging
regions that never merge into one heavy enough, so it gets **18 small course-sheds totalling 155
cells, biggest 18**, against the undercut's **9 events totalling 450 cells, biggest 408**. Scatter
gets chips; aim gets the wall. At a fixed 60-blow budget the undercut still opens **343 cells
against 123** for hammering one spot (2.79×, unmoved).
🕸️ **AND THE WALL WARNS YOU FIRST, WHICH IS THE HALF THAT MAKES IT LEARNABLE.** *If collapses look
random there is no skill, only luck*, so `support.js` `strain()` runs the SAME sweep at
`nearFrac` × the threshold and writes the damage texture's **A channel** — the one byte in it
nothing had ever used. `breakmask.js` `uCraze` opens hairline cracks along the plate lattice's own
fracture walls in proportion to it: **up to 219 cells crazing at once, peak 0.667, on every blow of
a dig, one blow of lead at ×8 and 57 at ×0.125.** It is diegetic (a multiply on albedo, no icon,
nothing in screen space) and **it is the rule and not a lookalike** — ablate `span` and the crazing
goes with it, 219 → 0, checked on every run.
📉 **ON THE SCREEN AND FREE, both as a paired in-place UNIFORM flip in one frozen page**
(`_collapse1-shots.mjs`, floor 0.00%): **7.24% of the face rect darkens by more than 2 luma, 3.33%
by more than 6, worst 73.7, mean 7.13 on the pixels that moved** — and **236 → 236 draw calls with
the triangle count identical to the digit** (359820 both arms), because it is a term inside a
shader that was already running, on a texture channel that already existed. ⚠️ **Re-measured on the
`collapse-2` arch, 2026-08-10: the coverage is the same and the CONTRAST nearly doubled** (worst
38.3 → 73.7, peak strain 0.667 → 1.00, 219 → 313 cells), because the arch paints the whole hanging
region at its own load rather than a relaxed span sweep's fading cascade. `wall.sheet` **PASS 78 is byte-identical**
against a baseline taken this round (sha1 `9bbe3234…`): `uCraze` lives in `DAMAGE_PARS`, so the
scalar arm never sees it.
⚠️ **A MEAN OVER A RECT IS THE WRONG STATISTIC FOR A LINE FEATURE and the first version of that
check used one** — the same crazing reads as **0.7% of the rect's mean luma** and would have been
filed as "technically present, probably invisible". Crazing is hairlines; measure how many pixels
moved and by how much, not the average.
🖼️ **Frames**: `progress/playtest/game.play.collapse1-{strain-ON,strain-OFF}.png` (the tell, same
frozen frame, uniform flipped) and `…collapse1-undermined-{BEFORE,FALLING,LANDED}.png` — one blow
removing 0.66 m²·depth low down, and a **full-storey column coming away as four large angular
slabs** with the cyan behind it, then **68 pieces resting** in a drift at the skirting.
⚠️ **`span` MOVED 1.05 → 1.45 m AND THE REASON IS THE ×8 PACING; IT IS STILL 1.45 AND IT IS NOW
THE *COURSE* RULE, NOT THE STOREY RULE.** At the shipped base one blow takes its whole **1.04 m**
brush clean through, so an 11-cell rule fired on the first through-blow anywhere: hammering one
spot sixty times produced *one* collapse, on blow 1, with a mean warning of **zero blows**. A rule
that resolves inside one blow cannot be watched. 1.45 m is 15–16 cells against the brush's 11, so
one blow crazes the wall and a second beside it sheds a course — and it stays comfortably clear of
the *"a minimum body channel must not trigger it"* margin (0.83 m opened vs 1.45 m needed). **The
storey is now the arch's job and it has `fail` in front of it.**
🚨 **AND `[ ]` AT ×0.125 IS NOT "THE PRE-2026-08-09 GAME BIT-FOR-BIT" — MEASURED, AND THIS FILE
SAYS IT TWICE.** The claim `8 × 0.125 === 1` is true of the DEPOSIT and false of the BRUSH:
`_add()` sizes the radius off the CLAMPED power, `R = radius × (0.55 + 0.45 × pw)`, and below ×1
that shrinks too — **0.315 m against 0.520, a footprint of 0.31 m² against 0.85.** Per-blow volume
lands at 0.114 of ×1 (≈8.8×, near the nominal 8), but the hole one blow makes is **0.63 m wide
against 1.04**, so any strategy made of WIDTH costs more stations as well as more blows per
station: the arch chains at blow 2 at ×1 and blow 64 at ×0.125, a **32×** gap against a nominal 8.
**Reported, not changed** — it is a pacing decision and `_add`'s split clamp was authored for the
other end of the ladder.
🚨 **THE CYAN IS UNTOUCHED AND IT IS CHECKED TWO WAYS.** Re-measured on the arch, 2026-08-10: 90
blows along one low line brought down **551 cells, all 551 of them dug clean through TO the
barrier, 0 passable through it**, barrier count unchanged at 596; and `dig-band`'s own independent
line reads *"140 channels at the ceiling, not one contains a barrier cell."* Neither `collapse()`
nor `strain()` reads `barrier` at all — which is also what stops the tell leaking the answer:
**move the interconnect under an unchanged dig and all 210 crazing bytes are byte-identical**, and
`_collapse2-arms` reports every arm agreeing to the digit across three seeds for the same reason.
✅ **AND THE GRAPH STILL AGREES WITH THE PICTURE**: `debris-collapse` C4 drove a face open in 19
blows, 88 cells collapsed, 0.74 m of channel, and `pathPortals` routes it — the IFF, both
directions, on a drive that actually opens the face.
📉 **DRAW CALLS DID NOT MOVE AND IT IS MEASURED THREE WAYS** (`collapse-2`, 2026-08-10). The arch
adds no material, no mesh and no shader term, and the payout still uses the `slab` and `plaster`
pools the wall already pays for — one `InstancedMesh` each, however many plates go in it. Paired
in-place uniform flip in one frozen page: **236 → 236 calls, 359820 triangles both arms**
(`_collapse1-shots` S2). Pristine house, twelve stations: worst `ballroom.centre` **426/625**,
618812 tris — **identical to the recorded baseline**. Worst-with-everything-dug (`_calls1-dug`, one
blow on all 28 free faces, `?walls=instanced`): **567/625, 655470/900k tris**, inside the 541–601
range this file records.
✅ **AND `wall.sheet` PASS 78 IS BYTE-IDENTICAL, sha1 `9bbe323465529c1b`, SHOT TWICE.** Not by
luck: `src/views/wall-sheet.js` imports `_studio.js`, `wallstages.js`, `src/destruction/wall.js`
and `breakmask.js`, and **`collapse-2` touched none of them and wrote no GLSL at all** — the arch
lives entirely in `support.js`/`damagefield.js`, which the sheet never imports. Shot twice because
`shoot.mjs` still has no `@vite/client` stub and a single frame is not a measurement.
⏱️ **What it does to the clock, REPORTED not defended** (John suspended the band): blows-to-through
on one face **7.0 vs 11.0** with the rule ablated, −36% — **unchanged by the arch**, measured on
both trees; house-wide `dig-band` TOTAL medians at
2.0 m spacing are **chapel 2.8 · ballroom 3.5 · gallery 3.6 · study_w 4.4 · service 5.7 ·
study_e 5.7 s**, i.e. inside the spread this file already records and not a new regime.
🪨 **THE CHUNKS USED TO FLOAT, AND IT WAS ARITHMETIC RATHER THAN TASTE — `collapse-2`, 2026-08-10.**
John: *"the falling chunks kinda seem to **float down to the ground**."* `debris.js` `update()`
applied the horizontal `drag` to `vy`, and a per-frame multiplier on the vertical axis is not air
resistance — **it is a terminal velocity, `g·dt·drag/(1−drag)`**, reached in about a third of a
second and then held for the whole flight:

| kind | drag | terminal it imposed | free fall from 2.4 m |
|---|---|---|---|
| slab | 0.90 | **1.41 m/s** | 6.72 m/s |
| plaster | 0.87 | **1.05 m/s** | 6.72 m/s |
| timber | 0.93 | 2.08 m/s | 6.72 m/s |

🚨 **AND THERE WAS A SECOND CAUSE THAT ONLY APPEARED ONCE THE FIRST WAS FIXED.** `chunk()`'s wall
pendulum (`sag`) was decayed only on an IMPACT, so a plate resting against the face at grazing
speed was held there by an undiminished inward acceleration and re-contacted **every frame — 68
wall contacts in one 2.2 m fall**, each taking 10% off `vy`. 0.9 per frame is a terminal velocity
of 1.4 m/s, i.e. the same drift rebuilt in a different part of the loop. `sag` is now spent by any
touch, and only a contact above 0.25 m/s costs energy.
📉 **Measured headless on the shipped `DebrisSystem` at a fixed 60 Hz** (`harness/evidence/_collapse2-fall.mjs`,
which carries its own reintroduction and FAILS if putting the old terminals back reads the same):
a collapsed slab falling 2.2 m goes **1.61 s / arrives at 1.41 m/s → 0.67 s / 6.22 m/s**, an
ordinary blow's slab **1.17 s / 1.41 → 0.56 s / 5.29**, the crumb spray **1.49 s / 1.05 → 0.56 s /
5.19**. All three land at **97% of free fall**.
⚠️ **`spin` IS UNTOUCHED — the readable tumble is the thing John wants kept**, and paper keeps a
1.5 m/s terminal on purpose: it is the control, because if wallpaper and a plate of plaster fall at
the same rate neither reads as a material. The `sag` range doubled (1.7–3.8 → 3.4–7.6 m/s²) to
match the shorter flight, so the pendulum still catches the face a third of a metre down. And a big
plate arriving above 2.4 m/s now **stops dead** instead of skating — the brake scales with the
impact, which is the other half of "heavy".

⚠️ **AND THE PROBE THAT MEASURES THE SKILL LIED FIRST, IN A WAY WORTH CARRYING.** Its "competent"
policy widened by `k / totalBlows`, so at a 220-blow budget it hammered one spot for fifty blows
and C5 reported that **scattering blows at random cleared wall 12× FASTER than aiming**. A
policy parameterised by the budget measures the budget. A player's stride is set by the HAMMER, so
it is a fixed 1.3 brush radii per blow now, and the same policy at any budget.

🎯 **YOU CAN SEE WHERE THE HAMMER WILL LAND, AND A LOW SILL IS NO LONGER A WALL — `aim-1`,
2026-08-10.** John after playtesting: *"it only makes sense to attack the base of the wall near the
ground but this is actually hard to target… if the wall has just the bottom intact because we
attacked in the middle the wall can't be passed."* The trap is a loop — `support.js` rewards an
UNDERCUT, the third-person boom fights looking down, and a crater at chest height leaves a sill you
cannot step. Two fixes, and **neither changes the skill**.
🎯 **THE MARK IS HONEST ABOUT ITS OWN SIZE, WHICH IS THE ONLY REASON IT IS WORTH HAVING.**
`src/game/aimmark.js` draws the brush's real footprint — `BRUSH_R * (0.55 + 0.45 * min(1, power))`
read off the FACE's own brush — as a ring **on the wall**, sunk into the crater by each sample's own
dig depth. **1.04 m across at the base**, 0.63 / 0.69 / 0.81 at `[` x0.125 / x0.25 / x0.5, and
**flat at 1.04 for x2 and x4 because `_add()`'s clamp is split** and more power deepens the deposit
without widening the brush. Measured against ONE REAL BLOW rather than against its own formula
(`aim-mark.mjs` A2): the half-power contour of a real crater is **1.256 m**, so the ring is the disc
that always goes with an irregular grain/lobe fringe outside it — **never over-promising**.
Validated by reintroduction: forcing the footprint to a 0.12 m dot takes A2 red on every run.
🎨 **IT IS A DARK-BRIGHT-DARK SANDWICH BECAUSE NO ONE COLOUR SURVIVES ALL THREE SURFACES**, and
that is measured, not asserted (A5, paired in-place flip in one frozen page, floor **0.00%**):
coat **0.36% of the frame at mean 57.4 luma** · white shell **0.191% at 29.2** · cyan **0.166% at
28.8**. ⚠️ **The shell is the weak one and it stays the weak one** — on white the bright core
contributes nothing and the whole read is the ink; the casing was widened 10 → 16 mm on that
measurement (shell 0.13% → 0.191%) and it is still half the coat's contrast. **`?mark=0|1|2`** —
off / plain / fused with `support.js`'s strain byte (the default in live play). ⚠️ **DEFAULT OFF IN
CAPTURE** so no stored baseline can move. **+2 draw calls when visible** (188 → 190 at the dig
station; the pipeline submits the scene twice, so one mesh is two calls) and `eo2-calls` is
**426/625, unchanged to the digit**.
🪜 **THE STEP-UP IS `rules.js` `STEP_H = { robot: 0.55, hunter: 0.30 }` AND THE HUNTER DELIBERATELY
DOES NOT SHARE IT.** `PASS_H`'s own note already settles it: the dig network is robot-scale and the
hunter's way through a wall is its own full-height hole. `pathPortals` has no caller outside
`hunter-ai.js` and sizes a breach with `openChannel()`, which measures from **0.30** — the hunter's
own step — so the graph and `collide(..., STEP_H.hunter)` are computed at the same number and cannot
disagree. Measured: same body, same 0.46 m sill, **step 0.30 → refused at −0.34 m; step 0.55 → 9.4 m
past, service → study_w**. The failing arm IS the shipped build, in the same page.
🚨 **WHAT BECOMES CLIMBABLE: NOTHING. THE BAND (0.30, 1.00] m IS EMPTY IN THIS HOUSE.** Censused
live over 223 boxes: the lowest static collider in the estate is **1.05 m** (study/ballroom
plinths), a 0.50 m margin; the lowest exterior solid on `seed=s4` is 3.80 m and the lowest the
exterior can ever register is `exterior.js`'s **garden basin at 0.70 m**, 0.15 m clear. **And there
is no vertical axis at all** — `Player.update` pins `pos.y` to `floorY`, so nothing can be climbed
ONTO: no ledge, no roof, no way out of the level. `Player.stepLift` raises the MODEL over a sill so
the pass reads as a step and moves no collision.
🚨 **AND THE DEBRIS PILE DOES NOT BECOME STEPPABLE, BECAUSE IT WAS NEVER A COLLIDER.** The stated
trade John accepted is not a trade: `debris.js`'s pile is a height field whose own header says
*"NOTHING OUTSIDE THIS FILE MAY EVER READ IT"*, and `room.collide` / `pathPortals` / the sight tests
all derive from `damagefield.js`. **You already walk straight through the pile and this changes
nothing about it.**
🚨 **THE CYAN IS GUARDED AT THE BOX, NOT BY MARGIN.** `boxesNear` never steps over a panel box whose
own rect holds a barrier cell — checked against `field.barrier` over the rect the box was built
from, index-parallel to `solidRects`. `room.setStepGuard(false)` is the ablation and `aim-step.mjs`
S4 **fails itself** if turning it off does not produce barrier boxes above 0.30 m being dropped
(it produces 4). ⚠️ **FINDING, PRE-EXISTING, NOT THIS SLICE:** ten barrier boxes with tops at
0.093–0.280 m ARE stepped over and always were — the shipped literal `0.3` never asked what was in
the box, and `channel()` measures from the same 0.30 so nothing disagrees about it.
⚠️ **THE CAMERA HALF OF JOHN'S COMPLAINT IS STILL OPEN AND THE MARK ONLY MADE IT LEGIBLE.** With the
aim level the ring's lowest vertex sits at **y 0.898 m** — that is the sill a "normal-feeling" swing
leaves, and it is above any sane step. Reaching the floor still needs the steep look
(`game.play.aimmark-aim-{level,base}.png` are the two frames side by side). The cheap lever nobody
has pulled is `Player._swingRay`'s **0.18 of downward tilt**: raising it moves where every blow
lands, so it moves `sledge-check` and `dig-band` and is a decision, not a tweak.
🖼️ **Frames**: `progress/playtest/game.play.aimmark-{coat,shell,cyan}-{ON,OFF}.png` (the three
surfaces), `…aimmark-footprint-{BEFORE,AFTER}.png` (the ring, then the crater one blow later — the
claim and the receipt), `…aimmark-aim-{level,base}.png`, and
`…aimstep-sill-{BEFORE,THROUGH}.png` (the remnant, then the body standing where the shipped build
refuses it).

**Queued, in the order I would take them:**
1. **A critic on the whole playable slice — `visible-1` HAS LANDED, so this is unblocked and it
   is the next thing.** **The slice has not been judged since the estate port, the all-room dig,
   the exit-site fix, the audio, the boot fix, `calls-1`'s draw-call fix or round 11's deep band** —
   the last verdict is stale by most of a campaign. 🎯 **Two questions that are specifically new
   and that a builder must not answer for itself:** (a) the crater now reads white-shell-then-fill
   rather than fill-immediately — is the surviving white plate a THICKNESS cue or a second ring?
   (b) the cyan's diameter at the end of a dig is 88% of the breach where `critic-dig-4` asked for
   "nearly the whole breach" and round 6 delivered 96% — is 8 points of fill worth what it bought?
   The frames are already taken, both arms, one crater, one camera:
   `progress/playtest/game.play.vis1-{r10,r11}-{00,06,12,20,30,31,38,44}blows.png`.
2. ✅ **DONE — the persistent pile (`debris-1..4`), the collapse (`collapse-1`) and John's two
   verdicts on it (`collapse-2`).** What is left is a LOOK verdict a builder must not take for
   itself, and after `collapse-2` it is three questions:
   (a) **is the crazing a crack or a smudge?** `wall.js` `craze` is `[1.0, 0.16, 0.55]` — a
   multiply on albedo along the plate lattice's fracture lines. ⚠️ **It now covers far more of the
   wall than when it was last measured**: the arch paints the WHOLE hanging region, so a face one
   blow from letting go reads 260–306 crazing cells at peak 1.00 where the old span sweep read 219
   at 0.667. Nobody has judged whether that is a warning or a texture change.
   (b) **does a collapsing storey read as ONE piece coming away?** `views/game.js` now tiles the
   region in BOTH axes into up to **30** plates (was 5, along the long axis only).
   (c) **does a slab now read as HEAVY?** It arrives at 6.2 m/s instead of 1.41 and stops dead.
   Frames: `progress/playtest/game.play.collapse1-undermined-{BEFORE,FALLING,LANDED}.png` and
   `…collapse1-strain-{ON,OFF}.png`, all re-taken on the `collapse-2` tree — plus
   **`…collapse2-craze-3x-{ON,OFF}.png`**, the same paired flip cropped to the face at 3×, which
   is where the crazing is legible as a network of angular hairlines rather than as a darkening.
   ⚠️ **At 1:1 from 3 m it is measurable (7.244% of the face rect past 2 luma, worst 73.7) and
   still subtle. That is the open question, and a builder must not answer it.**
3. **`exterior.dress.mortar` covering two apertures** (the residual above).
4. 🚨 **RUN `_pf1-diag2.mjs` — THE SHIPPED UNLOCK MAY HAVE THE BUG `[B]` JUST HAD, AND IT IS ONE
   FUNCTION AWAY.** `unblock-1` fixed `[B]` by replaying `WallPanel._couple()` after the barrier
   comes down, because a cell dug to the barrier never fires `brokeThrough` and so never couples
   its twin. **`room.unlockBarrier()` uses the same `setBarrier(false)` call and did NOT get that
   second pass.** `dig-free` F5/F6 are green, but they exercise the INTERCONNECT segment, which
   has no barrier in front of it and therefore couples naturally while being dug — so they cannot
   see this. **The unmeasured case is a DUD face dug down to the cyan and then opened by a
   legitimate house-wide unlock: is it passable from the side the player dug?** That is the case
   John was in. If it repeats, the fix is the same two-pass shape, in `room.js` (unowned).

**Two things are waiting on John and nobody should guess them:** which black point he wants
(**[G]** in game), and whether clip `08` in `refs/audio/LISTEN.html` is *going somewhere*.

---

## Reading this file

After the 2026-08-07 diet: read this core, then **only** the appendix your slice names below.
You should not need a second appendix, and you should never need the archive.

| appendix | covers | read when |
|---|---|---|
| `docs/handoff/dig.md` | interconnect + dig-stage mechanics behind `?dig=1` (dig-1, dig-2) | touching `src/game/dig.js`, connectors, dig tables |
| `docs/handoff/escape.md` | win condition (decided + built), the siege exit, exterior wiring | touching `src/game/run.js`, `exterior.js`, exit/panel logic |
| `docs/handoff/walls-perf.md` | draw-call instancing gate, `game.play` GPU perf fix, AO round write-ups | touching `src/post/**`, draw-call budgets, wall stage materials |
| `docs/handoff/hunter.md` | hunter scoring history (stale-scores warning + round 2) and sense/detection tuning | touching hunter AI/detection or the hunter group's board |
| `docs/handoff/game-feel.md` | John's 4 playthrough bugs, the fairness pass, fleeing, play-critic-7/8's verdicts | touching core loop feel or `game.play` scoring |
| `docs/handoff/estate.md` | mansion room round write-ups: `estate-owner-9..13`, `critic-estate-5..11`, **the `?estate=port` gallery port (`estate-spike-1`, `estate-1`)** | touching estate materials, lighting or camera, **or `src/world/gallery-order.js`** |
| `docs/handoff/gadgets.md` | the glow bug, five attachments, `gadget-owner-7`, `heatWash` resolution | touching `src/gadgets/**` |
| `docs/handoff/instruments.md` | full lying-instrument case studies (the core below has only the rule) | before trusting ANY measurement, or debugging a harness tool that disagrees with what you see |
| `docs/handoff/robot-char.md` | grime/gravity fix, `char.locomotion` r4, robot r36's two failed claims | touching locomotion or robot/character materials |

**Archive** (history, not fact — you should never need it): `docs/archive/handoff-pre-prune-*.md`.

---

## The rules (proven again today)

- Builder/critic loop per piece. Only a `critic-*` may award WOWED; a builder never scores
  its own work; re-critique after every build (verdicts go stale — audit flags them).
- One owner per coupled concern. 5 concurrent agents OK (John approved); **one GPU perf
  measurer at a time** — draw-call counts are deterministic and exempt.
- Opus decides/diagnoses/designs; Sonnet applies written plans and critiques. Give agents
  outcomes and design authority, not numbers you cannot see the result of.
- Every brief carries: "if a stated fact is wrong, say so rather than diverging silently"
  and "assume any unsourced number is wrong until you re-measure it". Both keep paying —
  a dozen doc errors were overturned by measurement this campaign, including two critic
  premises refuted by builders cropping the sheet.
- The skills carry the mechanics: `rrr-pipeline` (build + the trap list: GLSL backticks —
  three bundle breaks this week — reserved words, fbm normalisation both forms, Edit over
  scripted replacement), `rrr-critique`, `rrr-slice`, `rrr-playcritique`.


## Direction from John (2026-08-03, overrides the sheet where they conflict)

**The robot's chest mark is now the 4Humanity WORDMARK** (`Dev Art/1785276265860.png` — navy,
hollow-triangle `4` sharing its stem with the `H`, geometric humanist sans, tight tracking),
replacing the split-head emblem on the left pec and the back. The turnaround sheet still shows
the split-head mark; on this one feature John's direction, not the sheet, is the bar. Critics:
judge the wordmark's fidelity against `1785276265860.png` (letterforms, the 4/H ligature,
navy, print quality on the shell) — do not file the emblem→wordmark swap itself as a defect.


---

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
  got the same stub, and every critic capture in this project goes through `shoot.mjs`.** Until
  it does: shoot each arm twice, and treat a single differing frame as un-measured rather than as
  a finding.
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

---

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


## Mansion: what is measured, and the two things still open

**✅ Perf no longer FAILS on GPU — the AO depth prepass was the whole overrun and it is gone
(2026-08-04, perf-ao). Worst space 3.0–4.2 → 1.22–1.38 ms against a 1.39 ms budget, CPU with
it. Full ablation, the look A/B and the caveats are in the `game.play PERF` section.** Budget is
gpu ≤1.389 · cpu ≤2.00 · calls ≤625 · tris ≤900k.

🚨 **AND THE OTHER HALF OF THAT RULE IS WHAT BLEW THE BUDGET, TWICE NOW — THE UNIT IS THE MESH.**
"Material keys" is shorthand for "GeoBin merges a bucket into ONE mesh"; a prop that was never
merged pays one call per sub-mesh however few materials it has. `calls-1` measured `pickup.ball`
at **4 material names and 134 draw calls**, because it is 133 separate meshes — and every ROOM in
the house, estate order and all, at **10–21 calls**. **One gadget prop costs more than the entire
six-room mansion.** Before adding any prop, ask how many MESHES it is.

🎯 **DRAW CALLS SCALE WITH MATERIAL KEYS, NOT GEOMETRY — so detail inside an existing merged bin
is FREE, and this project keeps leaving it on the table.** `exterior-1` proved it on 2026-08-09:
the whole yard already went into one `Paint` bin → one merged mesh → one `MeshBasicMaterial`, so
taking it from **0.9k to 11.6k triangles cost ZERO extra draw calls** (440 → 440 at the exit,
512 → 512 parked away) — a full pilaster order, 12–16 sash windows, real trees and a wrap-around
sky, for nothing. **Before proposing that something must stay crude for perf, check how many
material keys it actually adds.** The corollary is the standing warning in the other direction:
the skate drift trail cost **+82 draw calls for 76 sprites** because each one was its own key. Note the six-space mansion costs ~370–410
calls against the one-room level's 296, i.e. residency is working.

Historic, kept because the *spread* is the lesson: at `--perfms 28000` run A read **gpu 1.59 /
cpu 2.64 / 409 calls**, run B **gpu 2.26 / cpu 3.03 / 368 calls** — 42% apart, so by this
project's own rule they never counted as a measurement. That was never contamination; it is
`shoot.mjs --perf` averaging a Director walking through six different rooms. Use
`perf-spaces.mjs`, and read its own instrument warning.

**Residency budget ≤3 is unachievable with this floor plan, and that is geometry, not a bug.**
Over a run of the outer ring, `visibleSpaces()` peaks at **4**. The ballroom is a hub with three
doors in one wall (D4/D5/D6 at x −8.6/0/+8.6); from `ballroom.north` they are 8.9 / 2.3 / 8.9 m
away and all three are in front of the camera, so four spaces resident is CORRECT. §5.2's one
sanctioned knob (16.0 → 13.0) cannot fix it — only a cap under ~8.5 m would, and that pops rooms
the player is looking through. `PORTAL_VIS_DIST` shipped at 13.0. The budget exists to protect
draw calls; draw calls are at 409/625. **Treat the ≤3 as retired, or change the floor plan.**

