# Appendix: hunter

**Covers:** the door mechanic and the noise channel (`bang-1`, below), the hunter's scoring
history (with the stale-scores warning), critic-hunter-2's round-2 worklist, and the
sense/detection tuning (NOTICE vs CONFIRM ramp).
**Read when:** your slice touches `src/game/hunter*.js`, `src/game/noise.js`, hunter
AI/detection, or the hunter group's board (`hunter.1/.2/.3/.sheet/.absorb`). ⚠️ **L2215's title
is literally "THE SCORES BELOW ARE STALE" — the block that follows it (round 2) is what
superseded them; when the two disagree, the later one (round 2) wins.**

---

## 🚪 SOMETHING IS AT THE DOOR — the hunter hears you, walks to ONE door and forces it (`bang-1`, 2026-08-11)

```bash
node harness/playtest.mjs --view game.play --script harness/scenarios/bang-door.mjs --port 5413 --q "seed=s4&dig=1" --shots
node harness/audio-render.mjs --only 15        # THE TIMER — six blows, John clicks refs/audio/LISTEN.bat
```

John's design, and the sentence that makes it not a countdown: *"the hunter is much stronger and
bangs away at the doors to scare the players and eventually break its way in. If the players don't
move out of the room this can be the timer."* It is a creature with a position: it hears work,
walks the corridor graph, stops at a specific door, and the door's own health is the clock.

### 🚨 THE THING TO CARRY: "THE CHAINED DOORS" ARE **NOT** THE CONNECTORS WHOSE STATE IS `CHAINED`

That reading is wrong three times over and it would have broken a protected gate. The thirteen
`CHAINED` connectors are the **decoy EXIT SITES** — `b: 'outside'`, `CHAINED_DEFS`:

1. **`damageable: false`.** Nothing can force one. `escape.md` §2's first lesson.
2. **Forcing one is a second way out of the house**, which is exactly what `escape.mjs` **20/20 on
   `seed=s4`** exists to forbid.
3. **They are on the EXTERIOR wall**, so a hunter walking the corridors cannot reach the far side
   of one — nothing in this build puts a body outdoors.

What John SEES wearing a chain and a padlock is a different set: `?tells=blind` is the default and
makes the dressing a seeded property of the connector and **never of its state**
(`connectors.js` `connectorDressing`), so chains hang on ordinary **BREACHABLE interior panels**
too. Those are the doors the mechanic runs on — and the filter is three flags, not an id:
`blocksMovement() && isDamageable() && canOpen()`, minus `spec.free`/`spec.dig` (a dig band is not
a door). `room.chainedDoorsOf(spaceId)` is the one query. **`bang-door.mjs` A5 asserts the exit
sites are not merely un-picked but NOT ON OFFER**, over five spaces that carry 14 of them.

### The numbers

| | |
|---|---|
| the door chosen, `seed=s4`, hunter in the gallery, dig in `study_w` | **`p.gal_w` — "THE WEST GALLERY DOOR"**, announced ONCE |
| how far it walked to get there | **23.07 m → 2.37 m**, the full length of the gallery, on the portal graph |
| blows to break in | **6** at `BANG_CADENCE` 2.4 s = **~14 s of banging**, plus the walk |
| the escalation, off the door's OWN remaining health | **0.271 → 0.436 → 0.627 → 0.803 → 0.931 → 1.000** |
| gate | `bang-door.mjs` **16/1**, the 1 being the peek (below), red on its own named line |

**The clock is emergent, not counted.** `WEAPON_DAMAGE.hunterSlam` (46) against `STAGE_DEFS`
(40/70/55/90 with carry-over) is six blows, whatever the cadence is; `BANG_CADENCE` is the only
pacing knob and it is deliberately ~3× `_breach`'s 0.85 s — `_breach` is removing an obstacle
mid-chase and wants to be over, this is the thing the player sits and listens to.

### 🔊 THE NOISE CHANNEL, AND THE DETERMINISM RULING: **LOCAL, NOT AUTHORITATIVE**

`src/game/noise.js` — `emit(pos, loudness, kind)` / `loudest({ignoreKind, sinceSeq})`. Loudness is
**in gunshots** (1.0 carries `HUNTER_SENSE.hearRange` = 14 m), the same units `spaces.js`
`BREACH_NOISE` already uses. Built general because John has separately decided **ploughing through
debris costs NOISE rather than speed** — that emitter is NOT built here and must not be.

**Noise is LOCAL.** Nothing downstream of a noise event touches `DamageField`, a panel stage,
passability or the seed — a noise moves the HUNTER and nothing else — so replaying the dig's hit
list produces the same wall, the same channel and the same `pathPortals` answer whether or not a
client heard anything. Emission itself is deterministic (no rng, no wall clock; time advances only
through `update(dt)`), so two clients fed the same events see the same bus; what is not guaranteed
is that they were fed the same events. **A client that misses a noise gets the hunter somewhere
else, not a different wall.** Same ruling debris got, for the same reason.

⚠️ **TWO TRAPS THIS PAID FOR.** (a) `loudest()` must take `sinceSeq`: a polling listener that
remembers "I handled seq 5" and asks again gets seq 5 back for as long as it is the loudest, so a
quieter seq 6 is never delivered, only masked. (b) The hunter must be **deaf to its own hammer** —
`views/game.js` emits a `door` noise per blow so a player in the next room hears it, and
`hearNoise` does not refuse during BANG, so without `ignoreKind: 'door'` it re-summons itself every
2.4 s. That is `onBreak`'s `hunterSlam` guard arriving through a second door.

### ⚠️ THE SHIPPED RULE FIRES IN EXACTLY ONE ROOM TODAY, AND THAT IS THE FLOOR PLAN

`?bang=auto` (default) forces a door **only when there is no open route into the noise room that
the body fits through**. An AI hammering a door with an open doorway six metres away is this
file's own "forgot what it was doing" failure. On today's plan D1/D4/D5/D6 mean every space except
the **chapel** can be walked into — so the chapel (only `p.chapel`, since D7 went on 2026-08-08) is
the one place it fires on merit. **`bang-door.mjs` A2 and A3 are that pair, and both run every
run:** A2 requires `auto` to REFUSE `study_w`, A3 requires it to TAKE the chapel. The mechanic is
built for the sealed-room dig loop; **`?bang=always` is how it is seen and gated until that exists**
(and `?bang=off` is the ablation A9 proves with).

### 👁️ YOU CANNOT PEEK, AND IT IS GEOMETRY — NOT THE THIRD-PERSON BOOM

John: *"the chained doors are hinged and the player can even peek outside through them"*, with no
verb and no special camera — *"just walk up to it"*. The brief warned the boom might not get an eye
to the crack. **It never gets that far.** A closed connector is ONE SOLID SLAB: `STAGE_DEFS[0]` is
`blocksSight: true` and `solidBoxes()` returns the whole panel box, so there is no aperture in the
world for an eye to reach. The chain and boards are DRESSING on the face of that slab. Sight only
opens at stage **3** (`beam`, `blocksSight: false`) — 165 of 255 hp in, i.e. after the hunter has
already done two thirds of the job.

Measured both ways on the same panel in one page (`bang-door.mjs` A11): closed →
`blocksLineOfSight` true, `room.blocksSight` true; the same panel driven to `open` → both false. So
the sight test works and the answer is the world. **The hinged leaf and its gap are unbuilt
geometry** (`room.js` `buildWall` / `exterior.js`'s dressing family), and that is a different
owner's slice. Picture: `progress/playtest/game.play.bang-peek-p-gal_w-closed.png`.

### 🔊 THE VOICE — `playDoorBang(escalation01, {distance, throughWall})`, `audio.js`

Five layers: SLAM (mass), BODY (the leaf), **CHAIN** (discrete grains — the only layer that says
*chained*), TIMBER (the split, absent below 0.28) and FRAME/GROAN. **The melee voices are
untouched, and that is measured, not asserted:** rendering `02-impact-mid.wav` with `buildDoorVoice`
in and out differed by **1 sample in 35,280, by exactly 1 LSB** — the harness's own documented float
noise floor. The must-fail arm: nudging one melee curve by 1.7% moved **2,520 samples by up to 138
LSB**, so the instrument can see a melee change and did not see one.

🚨 **AND THE FIRST SET OF CURVES WAS WRONG, CAUGHT BY A BAND SPLIT AND INVISIBLE TO A CENTROID.**
The escalation must be a change of MATERIAL (a player has no reference for how loud is loud), and
the first version measured **98.9% of its energy under 300 Hz on blow one** with the band shares
moving the WRONG WAY to blow six (98.9% → 99.5%): the chain and timber were scheduled, non-zero and
buried. The centroid saw 295 Hz against 270 Hz and reported nothing. ⚠️ **Raw energy share is also
the wrong instrument — A-WEIGHT IT**: clip 02, a melee blow everyone agrees has an audible 1.5 kHz
crack, reads 97.2% sub-300 Hz unweighted. A-weighted, after the retune:

| | peak | <300 Hz | 300–1.8k | >1.8k | length |
|---|---|---|---|---|---|
| blow 1 | −11.4 dBFS | 30.5% | 11.7% | **57.8%** | 148 ms |
| blow 6 | −9.2 dBFS | 38.0% | **43.1%** | 18.9% | **305 ms** |

A bright chain-led tick becomes a low timber-led wreck: mid ×3.7, high ÷3, length ×2.1, centroid
866 → 433 Hz, for 2.2 dB of level. **Gain staging: worst door peak −6.6 dBFS against the melee
bus's −4.8, so it sits ~1.8 dB under the loudest thing in the game and nothing clips** — stated
because the hunter's own voice once clipped 3,850 samples at 21 dB over that bus.
Clips **13/14/15/16** in `refs/audio/LISTEN.html`; **15 is the timer, 16 is what the sealed room
hears.** ⚠️ **No panner and there must not be one:** the whole graph is mono and `_renderOffline`
builds a 1-channel context, which is what makes the render harness able to render it at all.
Direction is carried in the world (the dust puff on the panel) and by the HUD callout.

### Contracts, and what I could NOT stand behind

`npm run build` ✓ · `lint-glsl` ✓ (444 files) · `bang-door.mjs` **16/1** · **zero new meshes,
materials or lights** — the bang's FX are existing `dust`/`debris` KINDS, and a draw call's unit is
the MESH, so the only cost is instances in `InstancedMesh`es the dig already keeps resident.
`numPointLights` is untouched.

- ⚠️ **NOT MEASURED: whether a REAL dig is loud enough to summon the hunter from a given room.**
  `bang-door.mjs` drives `engine.noise.emit` directly, which proves the hunter's half and nothing
  about the emitter's range. A stage crossing on a dig face emits `BREACH_NOISE.panel` = 1.25 →
  17.5 m; the mechanic's own threshold is `SUMMON_LOUDNESS` 0.95. **Nobody has measured how often a
  patrolling hunter is inside 17.5 m of a dig.** That is a `dig-band`-shaped measurement.
- ⚠️ **NOT MEASURED: draw calls, by instrument.** The claim above is structural (no new mesh, no
  new material, no new light) and is not an `eo2-calls` A/B.
- 🐞 **The door does not LOOK chained on this seed.** `p.gal_w` photographs as a dark recessed panel
  with corner brackets and a dashed X across it — no chain, no padlock. `connectorDressing` in
  `blind` is a seeded coin flip, so about half of them wear nothing. A mechanic named for chains
  whose door has none is a readability problem, and it is `exterior.js`'s, not this file's.
  ⚠️ The **dashed rectangle** the dig appendix flags as "nobody has said whether it is a deliberate
  affordance or a debug helper" is on this connector too. Still unowned.
- ⚠️ **A10 PASSED FOR THE WRONG REASON ON ITS FIRST RUN** and the fix is in the file: the earlier
  arms left the player parked 3 m from the door, so staging the hunter in the same room made it
  attack, take an arm and enter GROW — and `hearNoise` refuses outright in GROW/PURSUE/ATTACK. "No
  door was chosen" was true and said nothing. It now FAILS unless the hunter is in a state that can
  hear. Worth expecting a third time.

---

## ⚠️ HUNTER — THE SCORES BELOW ARE STALE. CURRENT BOARD (verified 2026-08-04 evening):
**hunter.1 WEAK 66 · hunter.2 WEAK 57 · hunter.3 WEAK 56 · hunter.absorb WEAK 68 ·
hunter.sheet WEAK 64.** Rounds 8 / 16 / 13 / 3 / 2 respectively, owner `critic-hunter-3`.

⚠️ **THE LEAD BRIEFED A SECOND `critic-hunter-3` ON THE PREMISE THAT ALL FIVE WERE UNJUDGED AND
THAT `hunter.sheet` HAD NEVER BEEN SEEN. BOTH WERE FALSE** — `progress/status.json` already held
complete current verdicts, and the judging shots (07:39–07:40) **postdate every relevant source
file** (`hunter.js` 02:29, `hunter-sheet.js` 02:35, `hunter-absorb.js` 02:24), so nothing is stale
relative to source. **The agent verified this, refused to overwrite, and spent its hour
independently re-checking with fresh crops instead of re-deriving numbers that already checked out.
Read the board before briefing a critic — HANDOFF was the stale thing, not the board.**

**Two open items RULED, both confirmed by fresh context-free crops:**
- ✅ **Stage-1 posture now READS** — forward-tilted head, dropped chin, angled shoulders and knee
  bend against a ramrod-straight player at the same camera. The stature-not-angle answer worked.
- ✅ **The absorb pink wash is dead** — thighs/legs show normal grey/white shell, zero cast. ⚠️ The
  port glow hate stands: at distance it reads as **a smooth symmetric bright orb, closer to a clean
  light source than a wound**, and the dark crescent under it is easy to miss.

🆕 ⚠️ **THE TWO STAGE-3 REFERENCES DISAGREE WITH EACH OTHER, AND NOBODY HAD CHECKED THE SECOND ONE.**
The standing #1 complaint on `hunter.3`/`hunter.sheet` — *"reads as twins, not absorption"* — has
been scored **for its entire history against the hero action pose** (`1785288883855.png`: a small
rider peeking from behind a dominant head). The **turnaround sheet's own STAGE 3 front view**
(`1785300149293.png`) shows **two similarly-sized, both red-eyed heads side by side sharing one
collar — essentially the composition the render is being marked down for.**

**LEAD RULING: the verdict stands and the target is the hero pose — but not because of the
reference.** Blind identification is this project's hardest gate and it still returns *"twins,
no separate rider torso"* from a context-free crop. **The render is failing the READER, not merely
a reference**, so the fix is real regardless of which image is the bar. ⚠️ **Record the
disagreement in the hate**, so nobody spends a round driving toward a reference the render already
matches.

⚠️ **NOT re-derived this round and inherited from the prior one:** `hunter.2`'s mass/width
(IoU 66.3–66.5%) and `hunter.3`'s arm-splay IoU. Treat both as unverified.

## HUNTER — round 2 of critic-hunter-2's list (hunter-owner-2, 2026-08-04) — ⚠️ SCORES SUPERSEDED ABOVE

**`hunter.sheet` is BUILT, so the hunter group has no unbuilt pieces left.** Every score on the
board for this group now describes a frame that no longer exists; `audit.mjs` flags all four.

### ⚠️ STAGE 1'S POSTURE: THE ARITHMETIC MIDPOINT WAS THE WRONG MIDPOINT, AND HERE IS WHY

`critic-hunter-2` ruled the previous stage-1 pose **not acceptable as filed** — "side by side
with baseline it is nearly indistinguishable in stance" — even though its trunk pitch was the
exact halfway point between the upright player and stage 2 (0.49 rad against 0 and 1.02). My
predecessor measured that gap honestly and declined to overshoot without a ruling. The ruling
existed; the cause turns out to be one line of trigonometry, and it is worth keeping because it
applies to **any** pose judged through `hunter-stage.js`'s camera.

That camera is a front three-quarter at **26 degrees of yaw**, so a forward lean is mostly along
the view axis. Of the two things a lean does to a trunk of length L:

```
head moves FORWARD by L·sin t     -> projects at sin(26°) = 0.44, and mostly into depth
head moves DOWN    by L·(1−cos t) -> projects in full, at every yaw
```

`sin` is near-linear at small angles and `1−cos` is **quadratic**. So at half the angle you get
55% of stage 2's forward travel — which this camera cannot see — and only **26% of its
head-drop**, which is the part that reads. Halving the angle does not halve a stoop; it quarters
it. **Measured in the scene, in metres** (`crown / nominal height`, camera-free; the clean
upright player measures 0.998, so 1.000 is the control):

| | crown/H | stature lost | as a fraction of stage 2's loss |
|---|---|---|---|
| clean player | 0.998 | — | — |
| stage 1 **before** | 0.9678 | 3.1% | **18%** |
| stage 1 **after** | 0.9174 | 8.1% | **48%** |
| stage 2 | 0.8292 | 16.9% | 100% |
| stage 3 | 0.8302 | 16.8% | — |

And the same probe on the channel the camera *cannot* see (head Z minus hip Z, in H): before
**0.0854**, after 0.1052, stage 2 0.1164 — i.e. the old pose was already **73%** of the way to
the monster in the invisible channel and 18% of the way in the visible one. That is the entire
complaint, quantified. `head above shoulder` moved 0.0641 → 0.0535 against stage 2's 0.0418,
another 48% midpoint.

The fix is a midpoint **in the channel that reads**: solving `1−cos t = (1−cos 58.4°)/2` gives
40.4°, which is what `spine + chest` now sums to, split in stage 2's own ratio. Three further
cues were added because pitch alone is one channel and it is the fragile one — all three immune
to axial foreshortening: **`neckSink`** (the head retracts between the shoulders — pure vertical
translation of `joints.neck`), **`shoulderFwd`** (protraction; the sockets move forward in the
chest's already-pitched frame, so the arms cross the leg line in outline), and a real knee bend.

### The rest of the list

- **`hunter.2` mass.** `measure.mjs` on isolated single-figure crops, render vs the sheet's
  STAGE 2 front view: shoulder **−5.5% → +3.6%**, hips **−10.1% → +1.0%**, thigh band −8.0% →
  +4.6%, arm daylight L 0.062 → **0.093 H** against the sheet's 0.087. Silhouette **IoU 73.7 →
  76.7%** (my own crops at `--thresh 10`; `critic-hunter-2`'s 75.2% used different crops, so
  compare the delta, not the absolute). ⚠️ **One measured error is left open and is NOT a width
  problem**: at 0.845 H the sheet is 0.557 wide and we are 0.264 (−53%). That is head-to-shoulder
  PROPORTION — the sheet's pauldrons rise to 0.845 of figure height beside a buried head, ours
  stop at ~0.755 — and closing it needs bigger mint caps, which live in `unit4h.js`.
- **The port** was "too tidy, a clean lathed boss". Rebuilt from a 7x crop of the sheet's own
  port: one broad swell, **two narrow notches** rather than a ring of equal scallops (damage is
  unevenly distributed; a uniform corrugation is a decoration and could be doubled without ever
  reading as violence), and the stain as **vertex colour on the boss itself** so nothing floats.
  The ball stub was `mats.chrome` and photographed as a white crescent in the dark — now dark
  oxide. ⚠️ **`--pick` found the arm's own chrome ball rendering INSIDE the bore** the moment
  `shoulderOut` went 1.22 → 1.30. Re-run `_tmp_geoprobe --pick --grid` over the opening after
  ANY shoulder change; both parts are correct alone and only the raycast says otherwise.
- **`hunter.3`'s rider** was registered by its HEAD, which hangs the body below that point —
  and below the host's head is the host's collar, so the torso and both arms were inside opaque
  geometry and only the skull cleared. Registered by the **chest** now, outboard and forward of
  the collar; the two-heads-side-by-side read arrives as a consequence instead of being solved
  for. Rider 0.58 → 0.66 H. ⚠️ Its arms: `-1.42` on a shoulder is *arms straight ahead*, not
  *arms up* — small shoulder, big elbow, and the elbow sign is **negative** for a hand that ends
  up in front of the face.
- **`hunter.3`'s splay.** `roll` 0.62 → 1.05 and 0.20 → 0.70. ⚠️ **`bend` stops working as soon
  as an arm is rolled out** — the elbow's flexion axis is the limb's local X, which after a roll
  swings the forearm toward and away from the camera and does nothing in the outline. The first
  capture was a straight rod with a hand on it. `crank` (elbow local Z, against the roll) is the
  missing axis; every arm in the hero shot goes out and then DOWN. **IoU 79.1 → 81.5%.**
  Draw calls **held at 486 / 677k** (verified after, `_calls_tmp.mjs`).
- **`hunter.absorb`.** The pink wash was never a colour problem, it was a radius: `distance`
  was `H*0.55` = **1.78 m** on a body 3.23 m tall whose shoulder is ~2.4 m up, so the cutoff
  reached the thighs. `H*0.19` = 0.61 m stops at the pectoral, intensity goes up, and the bore
  material now **emits** so the source is inside the opening rather than in front of it.
  Measured against a ruler both captures share (sole-to-port), mean r−b down the body:
  belly **+9.26 → −1.56**, chest +0.1 → −1.79, thigh −8.3 → −9.6; frame-wide reddened pixels
  (r−b > 24) **12 352 → 7 642 (−38%)** while peak r−b rose 241 → 246 — the port got hotter and
  everything else stopped being lit. Also: a motion trail (fading comet + speed lines + three
  tumbling chips, all faded to black under additive blending so the edges are soft without a
  texture), and a real wound — torn ball housing, scorch, five severed cables with one copper,
  one spark. ⚠️ **The wound was facing away from camera** at the old `rotation.y = +0.62`, so
  "the donor is visibly maimed" was being carried by a few pixels of mint cap. And `outboard`
  is not always +X: read the sign off `socket.position.x` or the whole dressing lands on the
  sternum, which is what the first pass did.
- **`hunter.sheet`** — a four-up progression (player, 1, 2, 3), one scene, one camera at 20°
  yaw, one ground line, **no labels** (`wall.sheet`'s precedent, and `rrr-critique`'s
  identification gate needs a frame that does not answer its own question). Deliberately not a
  re-render of the art's three-row turnaround: that is eleven figures, ~2 000 calls, and the
  four existing hunter views already ARE its per-state pages. What no other view can show is
  whether the RAMP works, which is what this group has failed on for its whole history.
  **806 calls / 1 137k tris** — over the 625/900k *room* budget, which is not this piece's gate,
  but stated rather than hidden. ⚠️ `fitCamera`'s corner solve **over-frames a wide shallow
  row** (it adds each corner's depth-along-axis to its lateral requirement, and on a row those
  are different corners): at margin 1.02 the row filled 79% of frame width. 0.94 is measured off
  the capture, not guessed.

### ⚠️ STILL OPEN, measured, and NOT this owner's files

- The sheet's rows carry a **warm cast** (sheet r−b ≈ +9, our render ≈ −4). `critic-hunter-2`
  confirmed it is the STUDIO LIGHTING, not the grime — the sheet's own clean BASELINE is warm
  (147/142/136) while our clean player control is cool. Fixing it means a warmer key in
  `hunter-stage.js`, which changes every hunter capture and needs its own before/after.
- The art's eyes are **canted** (inner ends dropped, a scowl). `sdRound` in `FACE_SURFACE` is
  axis-aligned with no rotation uniform, and `robot.js` is another owner's file.
- The head-to-shoulder proportion above (`unit4h.js`'s mint caps).
- Grime is still uniform speckle at all three stages — `critic-hunter-2`'s third complaint on
  every one of them. It ignores gravity and geometry: no extra build-up at armpits, waistband,
  seams or boot tops. That is a `SHELL_SURFACE` / `CHROME_SURFACE` question in `robot.js`, not
  a `hunter.js` one, and it was left alone for that reason.
- `hunter-ai.js` (another owner): builds gaits plant-off and never applies `offset`.

---

### Previous round (hunter-owner, 2026-08-04) — the four refuted premises still stand

`critic-hunter-2` verified all four against the art and found them TRUE. Kept for the record.

**Numbers first.** Draw calls (deterministic, `harness/evidence/_calls_tmp.mjs`, no GPU timing):

| | before | after | budget |
|---|---|---|---|
| hunter.3 | **1030 calls / 260 meshes** | **486 / 124** | 625 |
| hunter.2 | 398 / 101 | 338 / 86 | — |
| hunter.1 | 312 / 79 | 312 / 79 | — |

Triangles unchanged (677k vs 900k). **GPU frame time NOT re-measured** — another agent held the
perf window. The cause was never shading: 260 meshes at a measured **3.96 calls per mesh** (main
pass + AO depth prepass + shadow map), and 164 of those meshes were `hunter.js`'s own
sub-assemblies. `collapseStatic()` now merges each static assembly per material the way
`unit4h.js`'s private `collapseDrawCalls` does — `graftedArm` alone went 32 meshes → 3, ×4 arms.

**⚠️ FOUR DOCUMENTED PREMISES WERE FALSE. Each was settled by opening the art, not by argument.**

1. **STAGE 2 HAS BOTH ARMS.** Fourteen rounds of REJECT 24–27 were built on "stage 2 has lost an
   arm and the socket is the stump" (`unit.detach('armR')`). All four STAGE 2 views on the sheet
   show two arms with two mint caps, and the dark opening is an **empty MOUNT PORT let into the
   shoulder yoke**, above and inboard of an intact arm. That is why the socket could never be
   fixed by tuning: `buildTornSocket`'s own condition 1 is "something for it to be a hole IN",
   and with the arm detached there was no shoulder left, so it had to fake one out of thin open
   cylinders — which photograph as a cone of pale ribbons with a black disc stuck on it. The arm
   is back on and the port is a lathed boss. Nothing in the game depended on the detach
   (`HunterAI.absorb()` reparents to `this.model` and never touches `hunter.sockets`).
2. **STAGE 3 IS NOT A QUADRUPED.** The ramp table, this file, and the round brief all say "low
   quadrupedal spread" with a front arm pair planted on the floor. Both `1785300149293` STAGE 3
   and the hero shot `1785288883855` show an upright-ish heavy BIPED standing on two booted legs
   with all six hands free in the air. The plant is removed and the extra hands are now clamped
   to stop at 0.17 H, which also answers `critic-hunter-1`'s complaint that the six ground-
   reaching limbs "read as one continuous mass" — four arms and two legs ending on the same
   floor line is what caused that.
3. **THE HUNTER'S EYES WERE PINK ON A NAVY PLATE, at every stage.** Not red on black. The face
   albedo is `mix(uGlass #2659A0, uLight #7EBDF0, lit)` with neither exposed as an option, and
   `material.color` was 0.52 grey — so the field landed at #132E53 (navy) and the EYE ITSELF at
   #41607A, a *pale blue* patch. Red emissive on pale blue is pink by construction; it could
   never have been red at that plate value. Fixed by taking `color` to 0.10 so the emissive is
   the only thing colouring those texels. Eye box was also 3.4:1 letterbox against the sheet's
   measured 1.2:1.
4. **STAGE 3 WAS NOT DIRTIER THAN STAGE 2.** Method worth reusing: the scale-reference player is
   the same clean unit4h in all three captures, so figure/player luminance is comparable across
   shots *and* against the sheet, whose BASELINE row is the same control.

   | | render before | render after | sheet |
   |---|---|---|---|
   | stage 1 | 0.905 | 0.905 | 1.000 (BASELINE = the clean player) |
   | stage 2 | 0.744 | 0.744 | 0.739 |
   | stage 3 | **0.743** | **0.642** | 0.649 |

   `grime` was already saturated at 1.00 so the ramp had nowhere left to go; the fix is per-stage
   TINT, and it has to include chrome (at stage 3 the limbs are most of the figure's area).

**John's midpoint, applied.** `HUNTER_STAGES[1]`: grime 0.52 → **0.42** (his 0.38–0.45),
hunch 0.10 → **0.30**, and `POSTURE[1]` is now the exact halfway pose between the upright player
and stage 2 on every channel (trunk pitch 0.49 rad = 28°, against 0 and 1.02). Eyes are
**amber-orange 0xFF7A1E** on a half-dark plate with the smile flattened to a short dash: blue and
red have no useful interpolation (the literal midpoint is dead magenta, the perceptual one grey),
but a machine going wrong reads as HEAT — blue → amber → red. ⚠️ **The stoop measures as a true
midpoint but READS weaker than it measures**, because this view's camera is a front three-quarter
and a 28° lean toward the lens foreshortens. A critic may fairly want more; that would be
overshooting John's stated numbers, so it was left honest.

**Also fixed:** `scaleMeshes`'s `keepSeparate` bug (all three chests now carry the wordmark, and
the grime-derived ghost-impression fade is visible across the whole ramp for the first time —
`ART_MANIFEST` #05); `hunter-stage.js` now awaits `brandReady()`, which became load-bearing the
moment the decal started rendering on stages 2/3; stage 2 `crack` 0.0 → 0.45 (the sheet shows a
crack starting on the left mint cap); the stage-3 **rainbow chest looms** — the identical defect
that scored `hunter.2` a 27, eight saturated hues on 14 fat tubes, sitting unreported on
`hunter.3` — sooted; face cracks were floating off the head's silhouette (a flat plate pinned at
the cap's maximum depth) and are now placed on the cap's own ellipsoid.

**`hunter.absorb` is BUILT** (`BUILDING`, unscored — a builder may not score itself). It composes
the mechanic as a causal chain: player with a bare right shoulder → its severed arm in the air,
ball-end first → the port, lit red from inside by the same colour `HunterAI._setFlare` uses. The
arm is solved from `tornSocket`'s world transform, not hand-placed. **`hunter.sheet` is still
NOT_BUILT and is admitted rather than stubbed.**

(That round's open list has been superseded by the "STILL OPEN" block at the top of this
section — the warm cast, the canted eyes and `hunter-ai.js`'s missing `offset` are all still
open and all still belong to other owners.)


## Distance now matters — the "you see it first" beat exists (sense-tuning)

`game.play` is **unjudged since this landed**; play-critic-4 owns the verdict.

The fix was NOT to scale the whole ramp. It splits in two: **NOTICE** (up to `alertAt`) keeps
the old linear curve untouched — a lit robot in a dark room is about as noticeable at 20 m as
at 5 m, so the tell fires at the same instant it always did, at every range — while **CONFIRM**
(`alertAt`→`commitAt`) is inverse-square in distance, clamped inside 3 m and floored so a
patient hunter still commits from across the house. Slowing the whole ramp would have slid the
*tell* late along with everything else, and a warning you cannot see is not a warning.

ALERT→PURSUE, measured: 4 m 0.58→**1.01 s** · 12 m 0.77→**6.28** · 24 m 1.58→**12.65**.
Far/near ratio **2.72× → 12.52×**; time-to-ALERT unchanged at every range. Also fixed an
inversion this exposed: past ~5.7 m a **visible** loud target gained *slower* than one behind a
wall (the `seen`/`heard` branches are exclusive) — sight now takes `max(sightGain, soundGain)`,
capped at `soundCeiling`, so "sound gets it looking, only sight sends it running" stays true.

All six protected behaviours hold, several improved: natural-east first limb 32.8 → **37.5 s**.
feel-b phase 1.91 → **2.13 s** (bar 2.0). Gate **65 passed · 4 failed · 0 skipped**.

⚠️ **mansion A2 is NOT a sense-ramp bug, and the diagnosis in the last handoff was wrong.** Its
hunter is pinned at `ballroom.north` with its back to the passage, so the FOV cone never accepts
the player across the whole clear-line approach: first contact is HEARING at 6.86 m, ALERT then
costs `alertAt/soundGain` = 0.52 s, and ATTACK is unconditional at `reach × 1.15` = 2.36 m —
those radii are 1.77 s of walking apart, so **A2's ceiling is 1.24 s against a 6 s bar**.
Reaching 6 s would need `hearRange` ≈ 38 m and would destroy the stealth game. The bar was NOT
weakened; the arithmetic is now printed in the FAIL message so nobody re-diagnoses it as a ramp
regression. A2 measures hearing at a hunter's back, not the warning window it names.

