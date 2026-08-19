# Slice: the estate — `room.study`, `room.ballroom`, `room.gallery`, `prop.chandelier`, `light.dark`, `light.shaft`

**Owner: ONE agent, Opus, run alone.** Rooms, materials-as-used-in-rooms, lighting and the
per-room grade are **one coupled concern**. Splitting them is what produced a game frame in
flat monochrome amber. You own the look; nobody else may touch it while you hold it.

---

## 0. READ THIS FIRST — two documents are wrong about what exists

`HANDOFF.md` says *"Never built: … all six room/lighting pieces."* The scoreboard says
`room.ballroom / room.gallery / prop.chandelier / light.dark / light.shaft` are **BUILDING 12%
r1** and `room.study` is **WEAK 58 r2**. **Both are wrong, in different directions.** Verified
by reading every file and by re-shooting all four buildable views on 2026-08-03:

| piece | what is actually on disk | what really happened |
|---|---|---|
| `room.study` | `src/views/room-study.js`, **437 lines**, renders | built, never seen by a critic |
| `room.ballroom` | `src/views/room-ballroom.js`, **395 lines**, renders | built, never scored at all |
| `room.gallery` | `src/views/room-gallery.js`, **285 lines**, renders **near-black** | built, never scored |
| `prop.chandelier` | `src/views/prop-chandelier.js`, **148 lines**, renders | built, never scored |
| `light.dark` | `src/views/light-dark.js`, **6 lines**, `notBuilt()` stub | genuinely never written |
| `light.shaft` | `src/views/light-shaft.js`, **6 lines**, `notBuilt()` stub | genuinely never written |

So `HANDOFF.md` is right about **two** of six and wrong about four. The scoreboard is wrong
about all six: the three `BUILDING` rooms are finished-enough-to-shoot, and the two `BUILDING`
lights are `notBuilt()` placeholders that have never had a line of real code.

`status.json` explains it. An agent called `estate-agent` marked all six `BUILDING` at
**2026-07-30T11:59Z**, filed exactly one verdict — `room.study WEAK 58`, **by itself** — and
then died. Nothing has moved since.

**That 58 is not a real score.** A builder may never grade its own work; every one of the eight
times that happened on this project, a critic later overturned it. **No critic has ever looked
at any estate piece.** Treat the whole group as unscored.

**The supporting infrastructure is complete and good, and that is the real state of play.**
`src/world/kit.js` (1111 lines), `materials-local.js` (1099), `props.js` (496),
`chandelier.js` (575), `src/lighting/rig.js` (350), `practicals.js` (346), `volumetric.js`
(423). `GRADES` in `rig.js` **already contains `dark` and `shaft` entries** and `darkEnv()`
already exists — the two light views were designed for and simply never written. You are not
starting from nothing. You are finishing something that stopped mid-sentence.

---

## 1. File ownership — exact

### You may edit these, and only these

```
src/views/room-study.js          src/world/kit.js            src/lighting/rig.js
src/views/room-ballroom.js       src/world/props.js          src/lighting/practicals.js
src/views/room-gallery.js        src/world/chandelier.js     src/lighting/volumetric.js
src/views/prop-chandelier.js     src/world/materials-local.js  ⚠ see below
src/views/light-dark.js          (replace the stub entirely)
src/views/light-shaft.js         (replace the stub entirely)
harness/grade.mjs                (NEW — you create it; see §5)
```

### You may NOT touch these. Other agents are editing them right now.

| file | owner | why it matters to you |
|---|---|---|
| `src/characters/unit4h.js`, `hunter.js` | robot owner | every room puts a UNIT-4H in frame for scale. **Call `buildUnit4H()`, never edit it.** |
| `src/game/*` — `room.js`, `player.js`, `limbs.js`, `weapons.js`, `hunter-ai.js`, `wall.js`, `rules.js`, `locomotion.js` | game owner | `game/room.js` *consumes* your materials. Read it; do not edit it. |
| `src/views/game.js` | game owner | it sets its own grade and its own lights inline. See §9. |
| `net/*`, `src/net/*` | net owner | nothing you do touches these. |
| `src/materials/surfaces/*.js` | material owners | **`plaster.js` is in flight this round.** See §8. |
| `src/views/_studio.js`, `src/core/engine.js`, `src/post/*` | shared | you call `estate()` and `setEnvResponse()` from `_studio.js` and `pipeline.setGrade()`. If you think you need a *change* in one of them, **report it, do not make it.** |
| `src/ui/hud.js`, all other `src/views/*.js` | others | — |

### ⚠ The one shared file you own: `src/world/materials-local.js`

`src/game/room.js` runtime-imports it and uses exactly five functions —
**`parquetMat`, `boiserieMat`, `ceilingMat`, `giltMat`, `stoneMat`** — for `game.play`'s floor,
walls, ceiling, mouldings and skirting. It also runtime-imports `GeoBin` from `kit.js`.

- Changing any of those five, or `GeoBin`'s API, **changes `game.play`**. Baseline it first (§10).
- `game.js` does **not** read `GRADES` — it passes its own inline grade object. So edits to
  `GRADES`, to `studyEnv`/`ballroomEnv`/`galleryEnv`/`darkEnv`, to `estateMaterials()`'s
  definitions, to `props.js`, `chandelier.js` or any `room-*.js` **cannot** regress `game.play`.
  That is your safe zone; work in it by preference.

---

## 2. Order of work — `room.study` FIRST, and do not parallelise inside this slice

1. **`room.study`** — the only room with locked art, and the vertical slice most worth seeing.
2. **`light.shaft`** — it is the study's shaft, isolated. Build it out of what §6 lands.
3. **`light.dark`** — the darkness rule, isolated. `GRADES.dark` and `darkEnv()` are waiting.
4. **`prop.chandelier`** — one decided bug fix carries most of it (§6.4).
5. **`room.ballroom`**, 6. **`room.gallery`** — both need the same exposure surgery (§6.5).

Get the study right and the other five inherit the answer. Get the study wrong and you will
tune five rooms against a wrong reference.

---

## 3. The bar — what the locked art actually shows, measured

Two locked images show **the same room**, and both are the bar:

- `C:\Users\John\Documents\Run Robot Run\Dev Art\1785319916301.png` — the study, robot swinging
  its own detached leg. 1376 × 768.
- `C:\Users\John\Documents\Run Robot Run\Dev Art\1785320177684.png` — the same study from the
  other end, robot clinging to a broken lath wall. 1376 × 768.

**Look at both yourself before you change anything.** What follows is measured off the pixels,
not remembered:

**Architecture, `1785319916301`:**
- Dark **walnut** panelling floor-to-cornice on the left and back walls — big **fielded** panels
  with a bolection moulding, a projecting entablature about two-thirds up, a dado below. A
  **single-leaf door with four fielded panels and a brass escutcheon**, left of centre. The
  relief is legible: field lighter than stile, every moulding catching an edge.
- A **carved stone chimneypiece** on the right, occupying roughly the right 30% of frame from
  floor to top of frame: mantel shelf on consoles, a moulded frieze, a dark firebox opening, and
  above it an **overmantel panel inside a bolection frame carrying a coat-of-arms cartouche** —
  shield, helm, mantling — under a broken cornice. Its stone is **warm grey-brown**, mean
  RGB **44/38/30** over the whole chimney crop. It is not pale, and it is emphatically not blue.
- **Tapestries** at both frame edges — deep blue-green and red-gold, the only saturated colour
  in the room, hanging in real folds.
- A period **writing desk** with a **brass desk lamp** (dark green shade, warm glow), a chair, a
  red book. Console tables along the left wall.
- **Floor: polished grey-white veined Carrara.** Large slabs; the joints are barely findable.
  **No cabochons, no diamond lattice, no visible grid.** The read is the veining and the sheen.
  The robot's legs and the background furniture both throw **clear soft reflections**. A
  hard-edged wedge of daylight crosses it with a crisp boundary, plus a hard cast foot shadow.
- **The window is high on the back wall, above the panelling storey.** In `1785320177684` it is
  fully visible and it is **not a plain lancet**: a pointed arch with **cusped tracery in the
  head, a central roundel carrying a blue-and-gold rosette, pale diamond-quarry leaded glazing
  and a coloured border**. It is large — its tracery pattern is legible, and that pattern is
  what the floor pool has to carry.
- **Camera: low, eye about knee-to-hip height on the robot, pitched slightly UP.** The robot's
  crown reaches about 82% of frame height. The floor takes the bottom quarter; the ceiling is
  out of frame.

**The shaft.** In both images the beam itself is *subtle* — a soft, broad, low-contrast volume
with visible dust motes drifting in it. **The read is the hard-edged pool and the motes, not a
milky cone.** Current renders have this exactly backwards.

### The grade, as numbers you can re-measure

Ten-decile luminance ladder and the normalised warm bias `(r−b)/L` of each decile:

| image | median pixel L | brightest decile RGB | **top-decile (r−b)/L** | coolest cell `r−b` (of 144) |
|---|---|---|---|---|
| **ART `1785319916301`** | **≈ 38** | (198, 191, 180) | **0.093** | **+0.4 — never negative** |
| **ART `1785320177684`** | **≈ 52** | (229, 221, 205) | **0.109** | **+4.5 — never negative** |
| render `room.study` today | ≈ 9 | (190, 167, 138) | **0.308** | −15.2 |
| render `prop.chandelier` today | ≈ 4 | (181, 127, 76) | **0.779** | −14.1 |
| render `room.gallery` today | ≈ 1 | (38, 13, 4) | **1.94** | −4.9 |

Read that table twice. It contains the entire diagnosis:

1. **The renders are 4× to 40× too dark in the mid-tones.** The art's median pixel is L 38–52
   with a full ladder from ~3 to ~220. `room.study` today puts 40% of its pixels at L ≤ 2.6 —
   pure black — and `room.gallery` puts *90%* of them there. The art's "near-black corners" are
   *local*; the renders have made near-black *global*, and there is nothing left in between.
2. **The renders' highlights are 3× to 8× more warm-saturated than the art's.** That is the
   flat-monochrome-amber failure expressed as a single number, and it is now a gate (§5).

---

## 4. The look rules — decided, and one of them is a correction

**Rooms and lighting are one concern.** The amber game frame happened because one agent set a
saturated key, another tuned material roughness against a different grade, a third owned the
post stack, and nobody owned the look. You own all three. Never hand any of them out.

**The rule that stands: never carry separation by saturating the lights.** Colour separation
lives between key and fill and in the grade's shadow/highlight tint — never inside the key.

**The correction, and it matters.** The brief for this slice — and `rig.js`'s own header — says
*"warm key against a cool fill"*. **That is not what the locked art does.** Measured above:
neither locked image contains a single cool region. Both are warm throughout, and the
separation is carried by **chroma against value**, not by hue opposition:

> **The key is near-neutral white** — `(r−b)/L ≈ 0.09` at the top of the range, essentially
> colourless. **The fill is a saturated warm brown** — `(r−b)/L ≈ 1.4` at the bottom. A dark
> walnut room lit through glass looks like this because the direct light is daylight-neutral and
> every bounce it makes is off brown wood. **The cool that reads in frame is the robot's white
> shell and blue visor sitting against a warm room — not a blue light.**

So: keep `hemiFill`, keep the grade's cool `shadowTint`. They are what stop the *unlit* half of
an object collapsing into the lit half's amber, and `rig.js` is right about that. But **stop
letting them show as blue patches**, and **stop letting the key carry chroma**. The failure mode
you are correcting is not "not enough blue"; it is **too much orange at the top end and no
mid-tones at all**.

Concretely, for every estate view:

- **Desaturate the key.** If a light's colour is more than a few percent off neutral at the top
  of its range, it is wrong. `spotKey` at `0xffdcae` in `room-study.js` is too warm for a
  daylight source; the art's daylight is near-white. Neutral daylight through *coloured glass*
  gets its colour from the glass, which is where it belongs.
- **Lift the mid-tones, not the blacks.** The art keeps its darkest decile at L ≈ 3. Do not
  raise `lift`; raise the ambient and the *quantity* of motivated bounce so surfaces out of the
  beam land in L 30–90 instead of L 0–5.
- **The vignette is doing damage.** `GRADES.study.vignette 0.60` plus `GRADES.gallery 0.70` plus
  `GRADES.dark 0.86` is a large part of why 40–90% of these frames are literally zero. The art's
  corners are dark because *the room is dark there*, not because a post effect crushed them.

---

## 5. `harness/grade.mjs` — build this first, it is your gate

You may create one new harness tool. It turns the look rule into a number, so a critic and a
future round can check the same thing you did rather than argue about "amber".

**What it does.** Load a PNG (via `harness/imglib.mjs`'s `toDataURL` — *read its header, it
exists because `file://` caching silently returned frozen numbers and nearly caused a false
regression report*). Sample every other pixel. Then print:

1. Ten luminance deciles: mean L, mean RGB, `r−b`, and `(r−b)/L`.
2. A 16 × 9 grid of cell means, and the six coolest and six warmest cells by `r−b`.
3. `--ref <path>` to print the same table for the reference alongside.

**The gate, for every estate view:**

| metric | target | fail |
|---|---|---|
| **top-decile `(r−b)/L`** | **≤ 0.14** | > 0.20 is monochrome amber, no argument |
| **median pixel luminance** | **30 – 60** | < 20 is a black frame, > 80 is washed out |
| darkest-decile mean L | 2 – 8 | 0 means the toe is crushing real detail |

Those numbers come from the two locked images, not from taste. Run it on every shot you take.
**Report the before and after numbers for all six pieces in your final report.**

---

## 6. The changes — decided

### 6.1 The dead code that explains three of the six failures

**`material.envMapIntensity` does nothing in this project.** three.js honours it only when a
material sets its own `envMap`; when a material lights from `scene.environment` instead — which
every material here does — the renderer overwrites the uniform with `scene.environmentIntensity`.
The full mechanism is documented at `setEnvResponse()` in `src/views/_studio.js`.

**There are 20 authored `envMapIntensity` values across the files you own and every one of them
is inert** — 11 in `materials-local.js`, 3 in `room-study.js`, 2 in `chandelier.js`, and one each
in `room-ballroom.js`, `room-gallery.js`, `props.js`, `practicals.js`. Only `char-turnaround.js`
has ever used the working path. This is decided work:

- **`prop-chandelier.js` — this is the piece's main defect.** `crystalMat()` authors
  `envMapIntensity: 3.2`; `brassLocalMat()` authors `1.6`; `boiserieMat()` authors `1.0`. The
  view sets `scene.environmentIntensity = 1.5`, so **all three run at 1.5**: the crystal at less
  than half its intent, the wall at 1.5× its. That is precisely why the crystal reads as opaque
  putty and the panelling reads as glowing amber. Fix with
  `setEnvResponse(engine, mats.crystal, 3.2)` and the same for brass and the mirror materials.
- **`room-study.js` lines 88–90** set `mats.walnut.envMapIntensity = 2.55` under a comment
  claiming it is "the cheapest light in the room". **It is three lines of dead code.** Either
  route them through `setEnvResponse` or delete them and the comment — but do not leave a
  confident false claim in the file.
- The ballroom and gallery **mirrors** (`roughness` 0.035 / 0.055, pure metal) and the
  `pierGlass` material have the same problem. A mirror is 100% environment; its env response is
  the only thing it has.

### 6.2 The ambient arithmetic that explains the black gallery

Effective ambient irradiance is `roomEnv`'s `ambient` × the view's `scene.environmentIntensity`:

| view | ambient × intensity | relative to the study | grade exposure |
|---|---|---|---|
| `room.study` | `[0.104,0.113,0.135]` × 3.0 = **0.31 / 0.34 / 0.41** | 1.0× | 1.42 |
| `room.ballroom` | `[0.048,0.056,0.074]` × 3.2 = **0.15 / 0.18 / 0.24** | 0.5× | 1.06 |
| `prop.chandelier` | `ballroomEnv` × 1.5 = **0.07 / 0.08 / 0.11** | 0.23× | 1.04 |
| `room.gallery` | `[0.011,0.013,0.019]` × 2.6 = **0.03 / 0.03 / 0.05** | **0.09×** | 1.04 |

`rig.js`'s header documents a "round 3 rebalance" that raised the study's shell 4× because the
panelling had fallen below the noise floor. **That rebalance was never applied to the other
three rooms.** The gallery has one-eleventh the study's ambient *and* a lower exposure, which is
the whole reason it renders as a black corridor with amber dots.

**Decided:** bring `galleryEnv`, `ballroomEnv` and `prop.chandelier`'s environment intensity up
until each view's **median pixel luminance lands in 30–60** on the §5 gate. Whether you do that
in the `ambient` array, in `scene.environmentIntensity`, or in the grade's `exposure` is your
call — but change the *ambient* before you change the *exposure*, because exposure lifts the
amber highlights too and that is the metric you are trying to bring down.

### 6.3 `room.study` — the ranked list

Measured against `1785319916301`, in damage order:

1. **The chimneypiece is a flat blue-grey slab with a cartoon shield on it.** In the art it is
   the second-strongest read in the frame after the floor: a real carved chimneypiece in warm
   grey-brown stone, with a mantel shelf on consoles, a moulded frieze, a dark firebox, and a
   cartouche with actual heraldic relief inside a bolection frame. `props.js`'s `fireplace()`
   and `cartouche()` already exist — this is a matter of proportion, depth of relief, and
   getting the stone off blue. **Its stone must not be cooler than the walnut.**
2. **The panelling has no relief and, as of today's shoot, has developed a brick-like horizontal
   tiling artifact.** (This is a *regression* since 2026-07-31 and it is not in your code —
   `walnutPanel` in `src/materials/surfaces/walnut.js` moved. See §8; report it, and if it is
   still broken, drive it from `estateMaterials()`'s own parameters rather than editing
   `walnut.js`.) The art's panels read at L ≈ 60 with the field lighter than the stile.
3. **The floor is a flat white plane.** The art's floor is the brightest surface in the frame,
   polished, with **legible reflections of the robot and the furniture** and delicate veining.
   `estateMarbleFloor()` already takes `clearcoat`, `aniso` and `veinW`. A polished marble floor
   with no reflection is the single largest missing element.
4. **The shaft is a milky cone with visible horizontal banding artifacts; the pool is soft.**
   Invert it: soft broad low-contrast volume, hard-edged pool carrying the tracery.
5. **The window is small, cropped at the top of frame, and its glass reads as grey.** Rebuild it
   to the art's traceried arch (§3), large enough that its pattern is legible on the floor.
6. **The framing is wrong** — see §7.
7. **Tapestries read as flat dark decals.** `tapestryHang()` already does folds; it needs to be
   where the light is and it needs to carry the room's only saturated colour.

### 6.4 `light.shaft` and `light.dark` — write these two files

Both are `notBuilt()` stubs. `GRADES.shaft`, `GRADES.dark` and `darkEnv()` already exist in
`rig.js`; `lightShaft`, `dustMotes`, `lightPool`, `glowPatch` already exist in `volumetric.js`.

- **`light.shaft`** — the bar is the shaft in `1785319916301` / `1785320177684`. Its subject is
  the *volume of air*, so the beam must be seen **broadside**; pointed along the view axis a
  volumetric shaft collapses to a smudge, which `room-study.js`'s own comments record as a
  two-round mistake. Show the beam **and** its floor pool **and** the motes, and show that the
  window's own tracery is in the pool. A UNIT-4H standing half in and half out of the beam is
  the clearest proof the volume is real.
- **`light.dark`** — the bar is Alien: Isolation, and the piece's title is *"dark you cannot see
  into"*. That is not "dim": a small part of the frame is genuinely bright, the rest falls to a
  few percent of it, and **shape is still readable in the dark**. Your §5 gate applies: median
  L 30–60 across the frame will be wrong here and you should say so in your report and justify
  the number you use instead — this is the one view where a lower median is the point. What is
  **not** negotiable is that the dark half must still resolve form. A black cut-out silhouette
  is the failure this piece exists to prove you have solved.

### 6.5 `room.ballroom` and `room.gallery` — after the study

Beyond §6.2's exposure surgery:

- **Ballroom:** the mirror wall reads as one flat grey plane — the pilasters, gallery deck and
  pier glasses in the code are not reading at all; find out whether they are unlit or not
  drawing (**assume "renders nothing" before "renders badly"** — it is this project's dominant
  failure class). The chequer floor has a visible seam where the tile scale changes. The windows
  are blown white rectangles with no shape.
- **Gallery:** it is 90% pure black. Fix the exposure first, *then* judge it; almost every other
  complaint about it is currently unmeasurable.

---

## 7. Presentation requirements — half the score, and always the half that gets skipped

A slice on this project landed six specified shader changes perfectly and still scored WEAK 48,
because its specimen floated, its frame was cropped and its speculars clipped. **Everything a
plan leaves unsaid comes out badly.** `BUILD_GUIDE.md` §4b is the general rule; these are the
estate-specific ones and they are not optional.

1. **Frame `room.study` like the art.** Low camera — eye between the robot's knee and hip,
   pitched slightly **up**. The robot's crown at **~80% of frame height** (it is ~28% today).
   Floor in the bottom quarter, ceiling out of frame, chimneypiece a full-height presence in the
   right third. Today's framing puts a small robot in the middle distance of a wide empty box;
   that alone costs the shot more than any material does.
2. **Every room shows a UNIT-4H at 1.70 m, standing on the floor, with a visible contact
   shadow.** No exceptions — it is the only scale cue a critic has. Anything floating is a hard
   reject.
3. **Nothing cropped.** Shoot it, open the PNG, confirm the chimneypiece, the window and the
   figure are all fully inside the frame with margin.
4. **No large area clipped to pure white.** The art's brightest decile means (198,191,180) and
   (229,221,205) — it holds detail everywhere. Check your window and your shaft core.
5. **The unlit half of every object must still resolve form** (`BUILD_GUIDE.md` §5.7). This is
   what the IBL is for, and it is the test the gallery currently fails completely.
6. **No visible tiling.** A hard reject cue (`BUILD_GUIDE.md` §5.2), and both the study's
   panelling and the ballroom's floor are failing it today.
7. **Detail at three distances** — 10 m, 2 m, 20 cm. A room is where the 20 cm layer usually
   goes missing.

---

## 8. Dependency: `mat.plaster` is being built right now

Another agent is executing `docs/slices/task-plaster.md` against
`src/materials/surfaces/plaster.js` and `src/views/mat-plaster.js` as you read this.

**Check before you assume.** `node harness/status.mjs get mat.plaster`, and look at
`progress/shots/mat.plaster.review.png`.

- **If it has landed:** use it. Wire it into `estateMaterials()` the way `walnut` and
  `marble` are wired — a `tryMod('plaster.js')` entry with a `call(...)` fallback to the local
  material, so a half-landed module degrades instead of throwing. The exported surfaces are
  `plasterWall`, `plasterCeiling`, `plasterBreak`, `plasterKeyBack`, `plasterOrnament`,
  `plasterCorniceBand`, `plasterRose`, `corniceSection`.
- **If it has not landed: proceed anyway. Nothing you need is blocked.** `HANDOFF.md` calls
  `mat.plaster` a blocker for all six room pieces; **that is wrong, and it is wrong for a
  specific reason worth knowing.** `estateMaterials()` already has a `plaster` entry and it
  comes from **`wallstages.js`'s `plasterMat`**, not from `surfaces/plaster.js`. Marble, walnut,
  wallpaper and brass all exist and are already wired. The estate has never been blocked on
  plaster for a single day.

**Do not edit `src/materials/surfaces/plaster.js` under any circumstance while that agent is
alive.** If you need a change in it, report it.

**Related, and it is live:** the study's panelling has picked up a horizontal brick-tiling
artifact between 2026-07-31 and 2026-08-03 that is not in any estate file. `walnut.js` is the
suspect. **Report it; do not fix it in `walnut.js`.**

---

## 9. `game.play`'s lighting complaint — whose is it, exactly

`GAUNTLET.md` says the open `game.play` defect *"the cool light never reaching the wall, floor or
cabinet … belongs to the estate owner, not the game owner."* Half true, and the boundary is:

- **`src/views/game.js` sets its own lights and its own grade inline** (`HemisphereLight
  0x4a6a96/0x1a1109` at 2.10; `setGrade({exposure:1.34, splitBalance:0.72, …})`). **You may not
  edit it.**
- **What you *do* own** is why cool light cannot register on those surfaces even when it
  arrives: the albedo and roughness of `parquetMat`, `boiserieMat`, `ceilingMat`, `giltMat` and
  `stoneMat` in `materials-local.js`. A surface at 0.012 linear albedo cannot show the colour of
  anything (`estateMaterials()`'s own comment records exactly this failure on walnut).
- If after that the fix genuinely needs a light moved in `game.js`, **write the recommendation
  in your report** with the values you would use. Do not make the edit.

---

## 10. Regression gate — mandatory, every round

`game.play` consumes five of your material functions and `GeoBin`. **Baseline before you touch
`materials-local.js` or `kit.js`:**

```bash
node harness/shoot.mjs --view game.play --view room.study --view room.ballroom \
  --view room.gallery --view prop.chandelier --review 1280
```

Re-shoot the same five after every change to a shared file and **look at `game.play.review.png`
with your own eyes**, not just at whether the command exited 0. Then:

```bash
node harness/audit.mjs --render
```

`audit --render` occasionally reports a view as failed that renders fine alone and self-labels
those "transient" — re-shoot any failure individually before reporting it as real.

---

## 11. Perf — read this before you measure, two of the stated numbers are wrong

**The target:** 60 fps at 1080p on integrated graphics. The harness holds a GPU-time budget
scaled by `REF_RATIO = 12`:

```bash
node harness/shoot.mjs --view game.play --perf --gate --extra "quality=medium" --perfms 28000
node harness/shoot.mjs --view room.study --perf --gate --extra "quality=medium"
```

**Pin the tier.** `auto` picks `high` on this discrete GPU and that is not the target. Two
agents have already misreported budget failures this way. Discard the first, cold-shader-cache
run.

**Correction 1 — the draw-call budget is 625, not 300.** The brief for this slice says ≤300.
`harness/shoot.mjs` computes `BUDGET.calls = round(6.5 / (0.0026 × CPU_RATIO))` and the recorded
value in every `perf.json` is **625**. `docs/design/session-model.md` already flags the gap: 300
is a figure in `unit4h.js`'s comments that *"the harness does not currently enforce"*. Hold 625
as the gate and treat 300 as the direction of travel — and say which one you measured against.

**Correction 2 — there is no trustworthy perf baseline for anything in this slice.** Verify this
yourself before quoting any existing number:

- `progress/shots/game.play.perf.json` (2026-07-31): `gpuMs 16.74` against a 1.389 budget, but
  `frameMaxMs 2498.5` — a 2.5-second frame. That window swallowed the material bake. It is also
  at `quality=high`. **Unusable.**
- `room.study` has **two contradictory records**. `progress/shots/room.study.perf.json` says
  60 draw calls / 53k tris / AO off / 4 s window. `progress/status.json` says 284 calls / 232k
  tris / AO on / gpu 1.71 ms. Both at `quality=high`. `HANDOFF.md` records the cause: `shoot.mjs`
  used to write `perf.json` as a side effect of `--gate`, so uncontrolled numbers attached
  themselves to board entries. **Take your own baseline; quote neither of these.**

**The split-screen multiplier.** `docs/design/session-model.md`: four-way split screen means four
render traversals, on top of the four passes the scene already runs. A room that fits
single-view does not fit four-up. **You are not required to hit a 4× budget** — but a room
showcase view that spends 500 of 625 calls has quietly decided that split screen is impossible.
Prefer `GeoBin` merging, instancing and shared materials over adding meshes, and **say in your
report how much headroom each room leaves.**

**Never measure perf while another agent is measuring.** GPU timings contaminate each other.
Do perf **last**, after everything else is finished.

---

## 12. The traps — every one has cost real time here

- **Never put a backtick inside a GLSL template literal.** It terminates the JS string.
- **Never name a GLSL variable with a reserved word**: `cast`, `sample`, `filter`, `input`,
  `output`, `matrix`, `texture`, `buffer`. One of these silently produced an all-zero bake.
- **`fbmT` sums octaves**, so its output is a narrow bell around 0.5 and a gate at 0.9 **never
  fires**. Four files here have shipped authored detail that silently never drew for this
  reason. Use `pat()`: `float pat(float v,float k){return clamp((v-0.5)*k+0.5,0.,1.);}`
- **The baker probes albedo and throws on an all-zero bake.** If it throws, you have hit one of
  the two shader traps above — read the message, do not work around it.
- **Prefer `Edit` over scripted string replacement.** `Edit` fails loudly on a bad anchor; a
  `node` replace silently applies half its changes and leaves the file broken.
- **`envMapIntensity` does nothing** — §6.1. Use `setEnvResponse(engine, material, intensity)`.
- **A light at intensity 0 is not free in three.js** — it still allocates a uniform slot and
  still runs a fragment-loop iteration over walls and a floor that fill the screen. `bounceFill`
  handles this correctly (`if (!(amt > 0)) return;` actually omits the light) — **but only if you
  pass 0.** Passing `0.001` to "turn it off" costs full price. The same applies to every point
  light you leave in a room "just in case".
- **No late `import()` inside a view.** A dynamic import issued after a view has already pulled a
  dozen modules deadlocks Vite's dep pre-bundler in dev and the view never becomes ready. This
  cost an hour and is documented in `room-study.js`.
- **Cache-bust any `file://` image you load more than once.** Chromium caches by URL and every
  render writes back to the same path; an image-diff helper returned three identical numbers and
  nearly caused a false regression report. `harness/imglib.mjs` solves this — use it.
- **The dominant failure class here is code that looks right, reviews fine, and renders
  nothing.** Assume it first when something looks unfinished rather than broken. **Shoot and
  look after every change.**

---

## 13. Verification — the commands, and what to look at

```bash
# capture, then READ the .review.png — not just check the exit code
node harness/shoot.mjs --view room.study --review 1280

# render against the locked art, side by side
node harness/sheet.mjs --img progress/shots/room.study.png \
  --img "C:/Users/John/Documents/Run Robot Run/Dev Art/1785319916301.png" \
  --out "C:/Users/John/AppData/Local/Temp/study_cmp.png" --cols 1

# the grade gate you built in §5
node harness/grade.mjs --img progress/shots/room.study.png \
  --ref "C:/Users/John/Documents/Run Robot Run/Dev Art/1785319916301.png"

# attribute GPU time instead of guessing — room-study.js already supports this
node harness/shoot.mjs --view room.study --extra "quality=medium&probe=novol"
node harness/shoot.mjs --view room.study --extra "quality=medium&probe=nounit"
# NOTE: room-study.js's own comment advertises a third probe, `noprops`. It is NOT wired —
# only `want("vol")` and `want("unit")` are tested. Wire it or correct the comment.

# settle a contested claim with a crop; it costs one command
node harness/shoot.mjs --view room.study --crop 1180,240,520,420 \
  --out "C:/Users/John/AppData/Local/Temp/c.png" --quiet
```

**What to look at, in this order:** (1) the §5 grade numbers — if the top-decile chroma is above
0.20 nothing else matters yet; (2) the tiled comparison against the art, at a glance, from
across the room — does it read as the same *place*; (3) the chimneypiece, the floor reflection
and the panel relief at a crop; (4) only then, perf.

**You may not score your own work.** Do not run `status.mjs set`. Ceiling is PASS; only a
`critic-*` may award WOWED. Do clear the stale `BUILDING` state in your report so the lead can
correct the board.

---

## 14. If a stated fact is wrong

**If a stated fact turns out to be wrong, say so in your report rather than diverging silently.**
Seven agents in a row have used this instruction and all seven were right. It has already caught
five stale "facts" that had propagated into builds. **Assume any unsourced number in these docs
is wrong until you re-measure it.** When the docs and the locked art disagree, **the art is the
bar** — two measured spec errors in `ART_MANIFEST.md` have already propagated into builds.

Note that this document has already exercised that instruction three times: on `HANDOFF.md`'s
"all six never built", on the scoreboard's `BUILDING 12%`, and on the "warm key / cool fill"
rule. Do the same to this document.

---

---

# Appendix — how the estate composes into the playable mansion

**Direction for a later game-integration plan. NOT instructions to the estate owner, and not
scheduled.** The estate owner should read it only so the room builders stay shaped for it.

## The problem, re-measured

`play-critic-1` reported the destructible mansion as *"ONE room, 15.6 × 16.8 m, `portals 0`,
crossed in a 4.5 s sprint"*, and concluded that fleeing, hiding and stalking cannot exist.
Checked against `src/game/room.js` and `src/game/rules.js`:

- **The dimensions are right.** `HALL_W 15.6`, `HALL_D 16.8`, `STOREY 4.80`.
- **The sprint is right.** `MOVE.run = 5.20 m/s`; the 22.9 m diagonal takes **4.4 s**.
- **`portals 0` is wrong as printed.** `room.portals()` returns at minimum
  `[{x:0, z:0, w:1.28, kind:'door'}]`, and the space *is* divided — one interior wall with a
  1.28 m door and **four 2.08 m destructible panels**. Whatever printed 0 was not this function.
- **The conclusion is right anyway, and there is a sharper way to state it.**
  `HUNTER_SENSE.sightRange = 26 m` **exceeds the room's 22.9 m diagonal.** The hunter's senses
  are larger than the level. There is nowhere in the map you can be that is out of range, so
  "unseen" is not a state the level can express — which is what makes stalking structurally
  impossible, not merely under-tuned.

Two halves of one box, both fully visible from each other's far corner, is one room.

## The recommendation, in one line

**Five spaces in a ring, not a tree — plus one dead-end spur — with only the current space and
its immediate neighbours resident in the scene.**

**Why a ring.** A tree or a corridor means every retreat eventually corners you, so fleeing is
just delayed dying. A cycle means there is always another way round, which is what makes a
*chase* different from a *countdown* — it is the shape Alien: Isolation, Pac-Man and every good
stalker level share. **One** dead-end spur is worth having precisely because it is the gamble
that can go wrong; more than one and the ring stops reading as a ring.

**Why five.** It is the smallest count that gives the loop three distinct beats and keeps every
sightline under the hunter's 26 m sense range for at least part of the map:

| space | reuse | length of its longest sightline | what it is for |
|---|---|---|---|
| **ballroom** — 26 × 16 | `room-ballroom.js` | ~30 m | the chase arena. Open, two exits at each end, and the **chandelier is a droppable trap** — `world/chandelier.js` already exports `cut()`, `detach()` and `shatterDrop()`. |
| **gallery** — 7 × 27 | `room-gallery.js` | 27 m | the one long sightline. This is where "something is coming" is *supposed* to happen and it is the beat the current map cannot stage at all. |
| **study A / study B** — ~14 × 13 each | `room-study.js`, mirrored | ~13 m | the dens. Short sightlines, heavy furniture, real occlusion — the only places hiding can mean anything. Two of them so the ring has two ways to break line of sight. |
| **service passage** — narrow, ~3 m wide | `kit.js` only, no new builder | < 6 m | closes the ring behind the studies and gives the spur its junction. Cheap to build and cheap to draw. |

**The destructible wall is what makes the graph a game.** Today `room.js` already models a
breach as a topology change the AI routes on. Extended to a graph, **breaching a panel adds an
edge**: the player can cut a chord across the ring to escape, and the hunter can cut the same
chord to intercept. That is a real decision — the first one this game would have — and it needs
no new mechanic, only more than one room to connect.

## The perf constraint, and why it is not a blocker

Whole-estate rendering is not on the table: `game.play` currently measures ~418 draw calls
against a 625 budget (at `quality=high`, on a stale record — §11), and split screen multiplies
that by the viewport count on top of the existing four passes.

**So the graph must be a visibility graph, not just a topology graph.** Keep exactly one space
plus its direct neighbours in the render set; toggle the rest with `.visible = false` — which
skips traversal *and* draw submission, costs nothing to implement, and is a strictly better fit
than frustum culling for a mansion of closed rooms. With the ring above, that is at most **three
spaces resident**, and each showcase room already fits single-view on its own.

**One interface change is worth planning for.** `game/room.js`'s exported contract —
`root / floorY / bounds / panels / collide / castRay / blocksSight / spawn / portals() /
update()` — is already the right shape; a graph is a set of these plus edges, and
`blocksSight()` becomes cheap rather than expensive when a room only tests its own colliders.
**Whoever writes that plan owns `game/room.js`, not the estate owner** — the estate owner's job
is only to keep each `room-*.js` builder parameterised enough (size, which walls carry
openings, where the destructible panels sit) that it can be instantiated twice with different
arguments.

## And the sequencing warning that still applies

`play-critic-1` ranked this second of eight and noted that **making the game lethal must not
land before the feedback work**. A five-room map where you can genuinely be stalked is only an
improvement if losing a limb is impossible to miss and the camera does not collapse to 0.5 m
against a wall. Build the graph after the perception fixes, not before.
