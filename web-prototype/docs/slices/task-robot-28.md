# Slice: `char.turnaround` — round 28

**Owner:** one agent, run alone, on Opus. **Files you may edit — nothing else:**
- `src/characters/unit4h.js`
- `src/materials/surfaces/robot.js` — for the chest/back decal and the face SDF only

Do not touch `src/views/_studio.js`, `hunter.js`, `src/game/*`, or any gadget file.

---

## How this plan is meant to be used

Items 1–6 are **direction from John, who owns the bar**, transcribed verbatim. Items 7–8 are
critic complaints and sit deliberately below them.

**Where this plan gives a number, use it. Where it does not, the design is yours** — and that
is deliberate, not an omission. On this piece, rounds where the lead specified geometry numbers
from a verbal description were roughly a coin flip and four such specs were provably wrong;
the two rounds that handed design authority to the agent produced the only real breakthroughs.
Items 4 and 5 in particular are stated as *outcomes to design toward*, because "an angle that
makes sense" is not something that can be guessed at from outside the render.

**If a stated fact here is wrong, say so in your report rather than diverging silently.** Five
builders in a row have done that and all five were right — one proved a fix I specified was
geometrically impossible using world-space bounding boxes.

**You may not score your own work.** Do not run `status.mjs set`.

---

## Orientation — what the model is NOW

Several parts were rebuilt in the last two rounds. Read this before you form a plan, because
the obvious assumptions are out of date.

| part | current construction |
|---|---|
| **Legs** | A **swept profile**, not primitives. `LEGP` is one continuous measured curve for the whole hip-to-ankle limb; `legProfile` / `legRings` / `loftShell` sweep a rounded-rect section along it. Thigh and shin are two *windows onto the same curve*. The old `roundedBoxGeometry` shells, the `blob()` kneecap and both chrome inner tubes are gone. |
| **Knee** | `kneeHub` — the knee section revolved **about the bend axis**, so it is invariant under knee rotation and the seal is a static property. Plus a side-facing, recessed `driveDisc` ring and a wrapped kneecap plate. A critic has confirmed this reads correctly; **do not disturb it.** |
| **Visor** | A **surface cap**: `headSurface()` solves the helmet's SDF by bisection, `visorCap()` sweeps a polar grid of those rays through an angular window (`azMax` ≈ 49°) and closes it with a rim skirt. The visor is a piece of the helmet's own surface. |
| **Ear disc** | `driveDisc` at 0.004 H proud, `mats.shell` hub recessed 0.0012 H, groove relief 0.42 via the `relief` argument (default 1; every other caller unchanged). |
| **Upper arm** | A chrome `segment()` starting `uaTop = w(0.048)` **below** the shoulder pivot so the mint cap can hood it. `W.upperArmR = 0.029`. |
| **Elbow** | A `ringStack` — stacked thin cylinders. **Weaker than the knee's treatment. This is item 2.** |
| **Chest decal** | `PlaneGeometry`, `mats.decal`, `userData.keepSeparate`, at `x = w(0.052)`, size `h(0.062)`. |
| **Back** | `backPlate` (bowed rounded slab, `mats.shell`) + `backSeam` + `backLouvres`. **This is item 6.** |
| **Hip discs** | `W.hipDiscR = 0.088`, canted `d.rotation.y = s * -0.62` (≈35°), plus a `boreDisc`. **This is item 4.** |
| **Materials** | `mats.gap` has `setEnvResponse(..., 0.10)` applied, which is what makes recesses read near-black. A `lightContrast` opt-in raises key 2.5→4.40, drops fill 0.85→0.20, raises rim 1.5→1.85. |

## The bar

`C:\Users\John\Documents\Run Robot Run\Dev Art\1785277053522.png` — the turnaround sheet,
exact match required. Supporting, open only what an item needs:
`1785308800211.png` (knee/hip in profile) · `1785301780641.png` (hip discs, bold) ·
`1785301551166.png` (shoulder ball construction) · `1785276058591.png` (the 4Humanity split-head
mark, clean).

**When `ART_MANIFEST.md` and the art disagree, the art wins. When John's notes and either
disagree, John wins.** The manifest has had three measured errors.

---

# Items 1–6 — LEAD NOTES, verbatim

## 1. The upper arm segment is missing

> "The arms don't have the upper arm segment that the robot has."

The code *has* an `upperArm${side}` mesh, so this is a part that fails to **read**, not one
that is absent — the project's signature failure. Two candidate causes, both plausible:
- it starts `uaTop = w(0.048)` below the shoulder pivot, so the mint cap may be swallowing the
  entire visible run between cap and elbow;
- `W.upperArmR = 0.029` is deliberately slim so the mint cap stays wider than the arm it hoods.

⚠️ **That second constraint is real.** A previous round narrowed the cap until it sat entirely
*inside* the arm and the render contained **zero mint pixels** — the character's signature
colour, gone. The cap's half-width must stay comfortably greater than `max(ballR, upperArmR)`.
If fixing the arm requires touching that relationship, keep the cap ahead of it.

**Diagnose before changing.** Crop shoulder-to-elbow on front and 3/4, compare to the sheet,
and report what you find. **Verify:** a distinct chrome upper-arm segment is visible between
the mint cap and the elbow in the front view.

## 2. The elbow should be the knee's joint, minus the kneecap

> "Once the arm segment is in the elbow should have the rounded joint. It almost looks the same
> as the knee actually just without the kneecap."

The most directly actionable item here, and it reuses geometry that already works. Replace the
`ringStack` with the knee's construction: **the revolved hub plus the recessed side-facing ring
disc, and no kneecap plate.** Carry the technique, scale it to the arm.

The hub's rotational invariance about the bend axis is what makes the knee seal at any angle —
the elbow needs the same property. `char.locomotion` bends elbows, so this must survive posing.

**Verify:** a front and profile crop of the elbow showing a rounded hub with a visible ring,
readably the same family as the knee. Pose the arm and confirm no tearing.

## 3. The chest logo is off-centre and too small

> "Company logo isn't on the centre of the chest and needs to be bigger."

Move `parts.decal` to the centreline (`x = 0`) and increase its size.

⚠️ `ART_MANIFEST.md` says the mark is on the *wearer's left pec*, and the sheet appears to show
it off-centre. **John's note overrides both.** Do not correct it back toward the manifest and
do not split the difference. If you believe the sheet contradicts it, say so and implement the
note anyway.

**Verify:** front crop — mark centred on the chest, clearly larger, still legible as the
split-head glyph.

## 4. The hip connectors are too big and at the wrong angle

> "The hip connectors are way too big. And at the wrong angle. They should sit in the socket of
> the robots leg at an angle that makes sense."

`W.hipDiscR = 0.088`; cant is `d.rotation.y = s * -0.62`. **Context on that cant: it was added
purely so the discs would read from the front view** — a framing fix applied to the object
itself. It solved the symptom and is what now reads as mechanically wrong.

**This is a design item and the number is yours.** The note states its own test: the disc must
look like it **seats into the leg socket** — a drive hub the thigh actually rotates on — rather
than a plate stuck to the pelvis at an arbitrary tilt. Work out what a hip joint's axis
actually implies and build to that.

**Verify:** front, 3/4 and profile crops. The disc should read as the axis the leg turns on.
Cross-check against `1785301780641.png` and `1785308800211.png`, where the hips are clearest.

## 5. The thigh top must follow the hip connector's angle

> "After that the top of the thigh (upper leg section) should also taper off on the same angle
> as the hip connectors."

**Depends on item 4 — do it after,** and match whatever angle you landed on there.

The thigh is a swept profile now, so this is a change to the **top end of the profile curve**,
not a new primitive. Read `LEGP` / `legProfile` before touching it.

⚠️ **Re-run the knee-flex probe afterwards** — the leg rebuild is the biggest recent win and
must not regress:
```bash
node harness/shoot.mjs --view char.turnaround --extra "knee=0,0.7,1.4,2.0"
```
2.0 rad is the run cycle's worst case. No tearing at any angle.

**Verify:** front and profile crops — the thigh's top edge visibly continues the hip disc's
angle rather than meeting it arbitrarily.

## 6. The back panel should be the company logo, not a box

> "There shouldn't be anything on the back like a box it should be again the company logo."

Remove `backPlate` (and `backSeam` / `backLouvres` if they only exist to dress it) and put the
4Humanity mark on the back, as the sheet's back view shows.

The chest decal already does exactly this — **carry that technique**: a `keepSeparate` plane on
`mats.decal`. The back is curved, so it needs to sit on the shell the way the chest one does.
`bendOutZ` bows toward **−Z by default**, which is the correct direction for the back — but
pass `dir` explicitly and think about it, because the wrong sign pulls a plate's centre *into*
the shell and once split the face into two crescents.

**Grep `src/` for `backPlate`, `backSeam`, `backLouvres` before deleting** and report anything
that reads them. **Verify:** back crop — the mark reads on a clean shell, no slab.

---

# Items 7–8 — CRITIC items, explicitly below the lead notes

**Priority rule, and it is the most important instruction in this document:** land 1–6 first,
verifying each with a crop as you go. Start 7 and 8 only if 1–6 are genuinely complete.
**Six solid items and a clean stop is a success; eight half-finished ones is a failure.** Scope
creep caused two score regressions on this piece, and two agents have been killed mid-run by
session limits. If context runs low, stop cleanly and report where you got to.

## 7. Eyes too wide, too close together, no eyebrows

`critic-robot-27`, independently confirmed by the previous builder:

> "Wide pill-shaped eyes nearly touching, versus the reference's rounder, clearly separated
> eyes with thin light brow arcs."

Measured eye-separation-to-size ratio is **1.39 against the art's 3.0**. The face is an SDF in
`src/materials/surfaces/robot.js`. The eyes are also reported to clip to flat white;
`emissiveIntensity` is already an accepted opt-in on `faceplate()`.

⚠️ **The mouth is a difference of two circles in UV**, so non-uniform scaling of the face map
straightens the smile into a dash. That happened last round. Change the eye geometry in the
SDF; do not rescale the map.

## 8. The visor still loses the profile — quiet the ear first, then widen the wrap

Sixth consecutive round this has failed. **John did not raise it; a critic did.** It is last
on purpose, and it has a cheap half — do that half first.

**8a, one number and one render.** The ear disc is too **loud**, not merely too large: the
art's ear is a subtle low-contrast ring, ours is a dark-grooved bullseye that dominates the
profile by contrast. Its groove relief is already a `relief` argument on `driveDisc` (0.42 for
the ear). **Reduce it further and re-shoot the profile.** This may fix the hierarchy without
touching the visor at all.

**8b, only if 8a is not enough.** The cap spans **±49° of azimuth**, which presents almost no
area to a 90° side view — hence the narrow blue crescent. Carrying mass in profile needs a wrap
past roughly **65–70°**.

⚠️ The previous builder measured ±50° off the sheet from two views that **agreed** (front
blue-width ratio 0.82; profile blue-depth ratio 0.17, via `(1−cos θ)/2`). That measurement is
not obviously wrong. **So if widening the wrap makes the FRONT view disagree with the sheet,
stop and report the conflict rather than forcing it.** Front and profile may not be
reconcilable with a single cap, and establishing that is worth more than a bad compromise.

---

## Presentation requirements

1. **Do not change exposure or the light rig.** A critic has verified the render sits at the
   sheet's high-key with no clipping. `_studio.js` is out of scope this round.
2. **All four views in frame, feet uncropped, grounded with a contact shadow.**
3. **No clipped speculars** — white shells under the raised key blow out easily; check the
   brightest shell pixels are not pinned at 255.
4. **The darks carry the read.** The sheet's crispness comes from near-black panel gaps and
   disc bores, not from the mid-tones.

## Traps — every one of these has cost real time here

- **`material.envMapIntensity` does nothing** unless the material sets its own `envMap`; the
  renderer overwrites it with `scene.environmentIntensity`. Use `setEnvResponse()` in
  `_studio.js`. This invalidated an entire round's conclusion.
- **`bendOutZ` takes a `dir` argument.** Wrong sign pulls a plate's centre into the shell.
- **Relief deeper than its own ring pitch reads as a SPIRAL off-axis.** Keep stepped detail
  under ~0.5 relief/pitch.
- **`taperY` smoothsteps across the whole height** — hard end values thin the middle too.
- **A mirrored transform inverts winding** — `flipWinding` exists.
- **Cache-bust any `file://` image you load twice.** Chromium serves a stale copy and your
  measurement silently freezes — this nearly produced a false regression report.
- **Prefer `Edit` over scripted string replacement.** `Edit` fails loudly on a bad anchor; a
  `node` replace silently applies half its changes.
- The dominant failure mode is **code that looks right, reviews fine, and renders nothing.**
  Shoot and look after every item; do not batch.

## Verification

```bash
node harness/shoot.mjs --view char.turnaround --review 1280
node harness/sheet.mjs --img progress/shots/char.turnaround.png --img "C:/Users/John/Documents/Run Robot Run/Dev Art/1785277053522.png" --out "C:/Users/John/AppData/Local/Temp/cmp28.png" --cols 1
```
Use forward slashes in `--out` — backslashes silently break through Git Bash.

## Regression gate — mandatory

```bash
node harness/shoot.mjs --view char.turnaround --view hunter.3 --view gadget.nailgun --view limb.detach --view game.play --view char.locomotion
node harness/audit.mjs --render
```
`char.locomotion` holds a PASS and bends both knees and elbows — item 2 puts it at risk.

Keep `buildUnit4H`'s exported shape stable: `root`, `joints`, `parts`, `limbs`, `sockets`,
`setPose`, `detach`, `attach`, `isAttached`, `height`, `materials`. You may add; you may not
rename or remove. Items 2 and 6 remove parts — grep first, report what reads them.

## Perf

Pin `--extra "quality=medium"` and **discard the first run** — a cold shader cache reads high
and has already produced one false BUDGET FAIL. Take several samples and report raw numbers
plus the budget the harness prints.

Current: **584 draw calls / 625 · 831k tris / 900k · GPU 1.27–1.37 ms / 1.389 ms.** GPU headroom
is thin — roughly 0.05 ms. Item 2 adds hub geometry to both elbows and item 6 removes the back
slab, so report the triangle delta.

⚠️ `collapseDrawCalls` emits **one merged mesh per material per joint**. Adding a material to a
joint that lacks it costs a draw call per robot, ×4 on this sheet. The knee already carries
`mats.gap` so dark detail there is free; the hip does not.
