# Slice: `char.turnaround` — the base robot, round 15

**Owner for this slice:** one agent, run alone. **Files you may edit — nothing else:**
- `src/characters/unit4h.js`
- `src/views/char-turnaround.js`
- `src/materials/surfaces/robot.js` *(only if a change below names it)*

Do not touch `src/characters/hunter.js`, `src/game/*`, or any gadget file. Twelve modules
import `buildUnit4H` and they are not yours this round.

This plan names the specific changes. It is not a defect list to interpret — where a number
is given, use that number; where a decision is made, do not re-open it. **If you find a
stated fact is wrong, say so in your report rather than silently diverging.** Two spec
errors on this project were caught exactly that way.

---

## Why this slice matters

`src/characters/unit4h.js` is imported by 12 modules. The hunter is this chassis corrupted,
the gadgets mount to its sockets, the limb system reparents its subtrees. **20 of the 37
pieces are built from these parts, so every defect here is inherited twenty times.** Nothing
else in the gauntlet starts until a critic files PASS on this piece.

---

## The bar

Primary, exact match required:
`C:\Users\John\Documents\Run Robot Run\Dev Art\1785277053522.png`
— CHARACTER TURNAROUND SHEET, 4 views: front, left profile, 3/4 front, back.

Supporting art, each verified to show something specific. Open only what a change needs:

| file | what it settles |
|---|---|
| `1785301780641.png` | recovering push-up — hip drive discs read large and bold |
| `1785301551166.png` | accusing point — hip discs + shoulder ball construction |
| `1785308800211.png` | side plank — hip discs AND knee rings, in profile |
| `1785300149293.png` | BASELINE row is this same robot, near-clean |

**When `ART_MANIFEST.md` and the art disagree, the art is the bar.** That file has had two
measured errors that propagated into builds. Measure with a hand-placed crop —
auto-segmentation fails on a near-white robot against a near-white cyc.

Tile render against reference before judging anything:
```bash
node harness/sheet.mjs --img progress/shots/char.turnaround.png --img "C:/Users/John/Documents/Run Robot Run/Dev Art/1785277053522.png" --out "C:/Users/John/AppData/Local/Temp/cmp.png" --cols 1
```

---

## The changes

> **PROVENANCE — corrected after the fact.** This list was written by the planning model
> from a direct comparison of `progress/shots/char.turnaround.png` against the sheet, **not
> by an independent critic**, because at the time of writing no critic had filed and the
> agent output files were empty. **That inference was wrong** — `critic-robot-15` was still
> running and went on to file WEAK 48 with its own 8-item ranked list. The output file is
> buffered until the agent exits, so an empty file means nothing about liveness.
>
> The critic's list independently confirmed five of the six changes below (head shape, absent
> ear disc, absent knee rings, undersized hip discs, the black chest/back bar). It diverged
> on two points worth carrying forward: it ranked **limb silhouette #1**, which this plan
> deferred to round 16, and it scored the **mint pauldrons as a win**, which makes change 5
> here unnecessary. See `task-robot-16.md`.
>
> The gate is unchanged: a fresh critic judges the result, and a builder may not score its
> own work.

Six changes. Work them top-down and do not add a seventh: a Sonnet builder given a longer
list on this project burned 462k tokens and deleted the character's signature element while
believing it had completed the item. Boots, limb boxiness and hand detail are deliberately
held for round 16.

### 1. The head — too small, too cubic, and the face is too small

The single worst read. The art's helmet is a **large, softly domed** form whose blue screen
covers most of the front. The render is a hard-edged **cube** with a small flat rectangle
stuck on it. Round 12 fixed "the head reads as a sphere" by dropping the corner radius to
55% of the clamp limit and overshot to the opposite failure.

In `W`:
```
headW: 0.138  ->  0.150
headH: 0.155  ->  0.158
headD: 0.116  ->  0.140
```
And the corner radius factor, currently `headHalfMin * 0.55`, becomes `headHalfMin * 0.68`.

`headD` grows most on purpose. A larger corner radius eats the flat side face, and the flat
side face is what the ear disc has to sit on — that tension is real and is why change 2
stops depending on it at all.

Faceplate, same section:
```
fpW = w(W.headW) * 0.66  ->  * 0.78
fpH = w(W.headH) * 0.58  ->  * 0.70
```

### 2. The ear disc — currently buried inside the head; rebuild it on a boss

Verified by reading the geometry, and it explains "no concentric rings, just a smooth dome"
exactly. `earDisc()` builds a dish whose rings run to `y = -0.038`, then rotates
`rotateZ(-PI/2)` — the opposite sign from `driveDisc`'s documented convention. Mounted at
`x = ±0.079H` against a head surface at `0.069H`, the hub sits ~0.010H proud while the
entire ringed face lands **inside** the shell. Its profile depths are also raw world numbers
that never scale with `H`, so the part silently deforms at any other height.

**Delete `earDisc()` entirely and carry the hip technique instead**, which is already
validated in this file:
- a short chrome boss: `CylinderGeometry(w(0.046), w(0.046), w(0.014))`, rotated to face
  along X, at `x = s * (w(W.headW) * 0.5 + w(0.007))`
- on its outer face, `driveDisc(w(0.046), w(0.016), 2)` in `mats.chrome`
- a `boreDisc(w(0.046) * 0.30, w(0.020))` in `mats.gap` at the hub

Mounting the rings on a boss decouples ear size from head flatness completely, which is the
actual reason this feature has failed three rounds running.

### 3. Exposure and background — the render sits below the sheet's key

`src/views/char-turnaround.js`. The sheet is high-key studio on a near-white cyc `#F2F2F2`;
the current shot is mid-grey and murky on a grey gradient. **This flattens every material
distinction at once**, so it is worth more than any albedo change and it must land before
anyone concludes anything about the materials.

Read the view's current `studio({...})` call and report its present values. Take
`char-locomotion.js`'s `envIntensity: 0.98` as the starting point, raise the background
toward `#F2F2F2`, and tune until the cyc reads near-white **with the shell highlights still
unclipped**. Verify by tiling against the sheet, not by eye on the render alone.

### 4. The back plate and the sternum — both read as black slabs

Back view: a large dark rectangle where the art has a clean white back with subtle panel
breaks. It is `mats.chrome` on a big flat-ish plate, which is the same "flat card reads as a
missing texture" failure the file's own comments describe fixing — it moved rather than
resolved.

- `parts.backPlate`: `mats.chrome` -> `mats.shell`. Keep `bendOutZ`.
- `backW`: `w(W.chestW * 0.56)` -> `w(W.chestW * 0.50)`
- `parts.sternum`: width `w(0.012)` -> `w(0.006)`, depth `w(0.008)` -> `w(0.004)`.
  It currently reads as a bold black bar down the chest; the art has a hairline.

### 5. Mint caps — pointed fins where the art has rounded pauldrons

The signature read. The art's cap is a soft rounded pauldron sitting **on top of** the
shoulder; the render's is a narrow pointed fin angled off the side. The taper/shear pair is
over-driven.

```
blob(w(0.043), w(0.053), w(0.054), 28)  ->  blob(w(0.046), w(0.050), w(0.058), 28)
taperY(capGeo, 1.04, 0.50)              ->  taperY(capGeo, 1.00, 0.74)
shearXByY(capGeo, -s * 0.32)            ->  shearXByY(capGeo, -s * 0.18)
```
Do **not** shrink the cap's half-width below `max(ballR, W.upperArmR)`. A shell that hoods a
thing is bigger than the thing, and violating that is what once rendered zero mint pixels.

### 6. The drive discs — hips too small, knees not on the surface at all

Hips: `hipDiscR: 0.058 -> 0.078`. The manifest says "big, ~0.09 of height"; the current
value carries a comment rationalising it down, and the art's discs are bold camera-lens
rings. Leave the bore at `R * 0.32` so it scales with the disc.

Knees, an **undiagnosed** miss until round 14: `kneeDiscR: 0.034 -> 0.046`, and the disc has
**no lateral offset at all** — it sits at the joint origin with radius `0.0578` world inside
a thigh cylinder of radius `0.0571`, i.e. exactly coincident, so it has no relief to show.
Give it the same treatment the hips get:
```js
kd.position.set(s * (w(W.shinR * 1.9 * 0.5) + w(0.006)), 0, 0);
kd.rotation.y = s * -0.45;
```
and the matching offset on `kBore`.

**This cant deliberately contradicts `ART_MANIFEST.md`**, which says the knee ring is not
canted because a white kneecap plate covers it from the front. The front view of the sheet
shows visible ring outlines at both knees, so the art wins — that is the standing rule here,
and this file has already had two measured errors. If you find the cant fights the kneecap
plate, say so in your report.

---

## Presentation requirements — read this before you touch geometry

A previous slice on this project landed six specified shader changes perfectly and still
scored WEAK 48, because its specimen floated, its frame was cropped and its speculars
clipped. **Everything a plan leaves unsaid comes out badly.** These are not optional:

1. **Match the sheet's key.** The art is high-key studio on a near-white cyc `#F2F2F2`,
   with soft falloff and no crushed blacks. The current render sits noticeably darker and
   greyer than the art, on a mid-grey gradient background. That single difference flattens
   every material distinction at once — the shell/chrome/mint separation cannot read out of
   a murky mid-grey. Fix the view's background and exposure to sit against the sheet before
   concluding anything about the materials themselves.
2. **All four views in frame, same scale, feet not cropped, even spacing.** The sheet's
   figures are cleanly separated and fully visible including boot soles.
3. **Ground the figure.** A visible contact shadow under each boot. A robot floating a
   millimetre off the cyc is a hard reject cue and it is the most common failure here.
4. **No clipped speculars.** White shells under a bright key blow out easily; the art holds
   detail in its highlights. Check the brightest shell pixels are not pinned at 255.
5. **The darks carry the read.** The art's crispness comes from near-black panel gaps, the
   dark disc bores, the dark sole edge and the recess inside the ear ring — not from the
   mid-tones, which really are all pale. If the darks are absent the render reads uniformly
   pale-grey even with correct albedos.

---

## The traps — each of these has cost real time here

- **Never put a backtick inside a GLSL template literal** — it terminates the JS string.
- **Never name a GLSL variable with a reserved word**: `cast`, `sample`, `filter`, `input`,
  `output`, `matrix`, `texture`, `buffer`.
- **`fbmT` sums octaves**, so its output is a narrow bell around 0.5 and a gate at 0.9 never
  fires. Four files here have had authored detail that never drew for this reason. Use the
  `pat()` helper if you gate anything.
- **Prefer `Edit` over scripted string replacement.** `Edit` fails loudly on a bad anchor; a
  `node` replace silently applies half its changes and leaves the file broken.
- **`taperY` smoothsteps across the whole height**, so a hard top taper thins the middle too
  and costs a part its mass. This already cost the mint cap its bulk once.
- **Mirrored transforms invert winding.** `scale.x = -1` without `flipWinding` renders the
  part inside-out.
- **A ring's radius is its extent in Z as well as Y.** A collar ring wider than the cap's Z
  half-extent punches through the front face and paints a dark arc across the mint. This has
  happened twice.
- **`LatheGeometry` revolves a 2D profile** — it produces a surface of revolution and cannot
  produce a helix. If a disc reads as a swirl, that is size, contrast or radial-segment
  aliasing, not the profile winding.

---

## Verification — the exact commands, and what to look at

```bash
node harness/shoot.mjs --view char.turnaround --review 1280
```
Read the `.review.png`, not the 1080p — half the tokens and ample to judge. Then tile it
against the sheet with the `sheet.mjs` command above and look at the two side by side.

Perf, if you touch geometry counts — **pin the tier**, `auto` picks `high` on this discrete
GPU and that is not the target:
```bash
node harness/shoot.mjs --view char.turnaround --perf --extra "quality=medium"
```
Budget: ≤1.39 ms GPU at 1080p, ≤300 draw calls, ≤900k triangles. Over budget at `high` is
not a finding. Do not run this while another agent is measuring perf — GPU timings
contaminate each other.

**You may not score your own work.** Ceiling is PASS and only a `critic-*` sets WOWED. Every
one of the eight times a builder graded its own fix here, a critic overturned it. Report
what you changed and what you observed; leave the verdict alone.

---

## Regression gate — mandatory, not optional

`buildUnit4H`'s exported shape must stay stable: `root`, `joints`, `parts`, `limbs`,
`sockets`, `setPose`, `detach`, `attach`, `isAttached`, `height`, `materials`. Everything
downstream depends on it. You may add to it; you may not rename or remove.

Baselines for this round are already captured at
`C:/Users/John/AppData/Local/Temp/claude/C--Users-John-Documents-snuggle-oclock-pwa/ce09486f-a23e-447d-9c3c-fd165017224f/scratchpad/baseline-r15/`.

After your changes, re-shoot all five and confirm every one still renders:
```bash
node harness/shoot.mjs --view char.turnaround --view hunter.3 --view gadget.nailgun --view limb.detach --view game.play
```
Then:
```bash
node harness/audit.mjs --render
```
A view that no longer loads is the single most common way an agent has broken this project —
code that looks right, reviews fine, and renders nothing. Assume that class of failure first
if something looks unfinished rather than broken.
