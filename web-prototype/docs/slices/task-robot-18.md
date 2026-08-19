# Slice: `char.turnaround` — the base robot, round 18

**Owner for this slice:** one agent, run alone. **Files you may edit — nothing else:**
- `src/characters/unit4h.js`

Do not touch `src/views/_studio.js`, `src/materials/surfaces/robot.js`,
`src/characters/hunter.js`, `src/game/*`, or any gadget file. Twelve modules import
`buildUnit4H`.

Where a number is given, use that number. **If you find a stated fact is wrong, say so in
your report rather than silently diverging.** The last two builders each did that and each
was right — one caught two dead constants, the other correctly predicted a fix would fail.

Ranked from `critic-robot-17` (WEAK 58; the piece has gone 48 → 54 → 58). **Four changes. Do
not add a fifth.** The drive-disc spiral that was #4 on that list is already fixed and is not
your job. Material/specular is the critic's #6 and is held for round 19 because it lives in
shared files with a wide blast radius.

---

## 1. Limb panel breaks — the critic's #1 for three rounds running

> "Thighs/shins/forearms have a slight taper now and a faint wrist cuff, but **zero panel
> breaks or plating anywhere** in any of the 4 views, vs. the art's clearly segmented,
> contoured limbs. Still the single biggest silhouette hit, unchanged in kind since round 2."

Round 16 added taper and that helped, but taper is not segmentation. The art's limbs are
built from **separate plates with visible gaps between them**, and the chrome inner structure
shows through those gaps. That is the read we are missing.

**Split each limb shell into two stacked plates instead of one.** The chrome inner cylinder
already runs the full length of both the thigh (`thighInner`) and the shin (`shinInner`), so
a gap between plates exposes real chrome — no new geometry needed behind it.

Thigh — replace the single shell with two, both tapered, same total coverage:
```js
// upper plate: hip down to just above mid-thigh
const thighUpper = mesh(
  taperY(roundedBoxGeometry(w(W.thighR * 1.62), thighLen * 0.40, w(W.thighR * 1.72), w(0.038), 5), 0.90, 1.06),
  mats.shell, `thighUpper${side}`);
thighUpper.position.y = -thighLen * 0.26;

// lower plate: below the gap, down toward the knee
const thighLower = mesh(
  taperY(roundedBoxGeometry(w(W.thighR * 1.52), thighLen * 0.30, w(W.thighR * 1.62), w(0.036), 5), 0.78, 0.94),
  mats.shell, `thighLower${side}`);
thighLower.position.y = -thighLen * 0.64;
```
That leaves a gap of roughly `thighLen * 0.03` between them at `y ≈ -thighLen * 0.47`.

Shin — same treatment:
```js
const shinUpper = mesh(
  taperY(roundedBoxGeometry(w(W.shinR * 1.90), shinLen * 0.44, w(W.shinR * 1.95), w(0.032), 4), 0.88, 1.04),
  mats.shell, `shinUpper${side}`);
shinUpper.position.y = -shinLen * 0.26;

const shinLower = mesh(
  taperY(roundedBoxGeometry(w(W.shinR * 1.76), shinLen * 0.40, w(W.shinR * 1.82), w(0.030), 4), 0.72, 0.90),
  mats.shell, `shinLower${side}`);
shinLower.position.y = -shinLen * 0.72;
```

**Keep `parts.thigh{side}` and `parts.shin{side}` as valid keys** — point them at the upper
plate of each. `parts` is part of the exported shape and other systems read those names.
Grep `src/` for `parts.thigh` and `parts.shin` before you finish and report what reads them.

**Verify by looking:** shoot the front and 3/4 views and confirm you can see a dark chrome
band between the plates on each leg. If the gap does not read, widen it before moving on —
a panel break that is invisible is the same as not having done this change.

---

## 2. The faceplate is what facets the head — not the shell

> "The lens sits on a **flat chamfered face-plate** that splits the dome into two surfaces
> (rounded crown + flat front), where the art is one continuous spherical curve. Confirmed
> with a tight profile crop."

**This check has now failed three rounds in a row, and the previous two attempts aimed at the
wrong part.** Round 16 raised the shell's corner radius to 0.90 of clamp and the shell *is*
now round — the flat that remains is the faceplate itself, a flat slab set proud of a sphere.

**Do not change `W.headW/headH/headD` or the corner-radius factor. The shell is correct.**

Bow the faceplate so it follows the head's curvature. `bendOutZ(geo, amount)` already exists
in this file and does exactly this — it bows a plate outward along Z, most at its centreline,
tapering to zero at its left/right edges:
```js
const faceGeo = bendOutZ(roundedBoxGeometry(fpW, fpH, fpDepth, w(0.014), 5), w(0.013));
```
Note the corner radius rises `0.011 -> 0.014` and segments `4 -> 5` so the bowed plate reads
smooth rather than faceted in its own right.

Then seat it closer to the shell so the bow blends instead of floating:
`parts.faceplate.position.z` from `w(W.headD) * 0.5 - fpDepth * 0.30` to
`w(W.headD) * 0.5 - fpDepth * 0.55`.

**Verify with a tight profile crop specifically.** That is where this has been judged and
failed three times, and it is the only view that settles it:
```bash
node harness/shoot.mjs --view char.turnaround --crop 690,190,180,150 --out "C:/Users/John/AppData/Local/Temp/head_prof.png" --quiet
```
Adjust the crop box if the head has moved. Report the crop you actually used.

---

## 3. Knee — the ring exists but is too shallow to see

> "Confirmed via close crop — completely featureless sphere. Genuine partial fix: it's now
> centered on the leg column rather than offset laterally, but the claimed geometry doesn't
> exist."

The ring is there. Round 17 set `kneeDiscR` to `0.052` against a shin-shell half-width of
`0.0475` — a margin of `0.0045 H`, about `0.008` world units. That is far too thin to read at
turnaround distance, which is why it looks like a blank ball.

```
kneeDiscR: 0.052 -> 0.062
```
That triples the proud margin to `0.0145 H`. Also shrink the kneecap so it stops swallowing
the ring it is supposed to sit over:
```js
const cap = mesh(blob(w(0.024), w(0.028), w(0.014), 16), mats.shell, `kneeCap${side}`);
```
Leave `kd.position` at the origin and `kd.rotation.y` at `0` — round 17 correctly reverted an
offset and cant that I had wrongly added, and the manifest is right that this ring is not
canted.

---

## 4. Boots — two of the three size constants are dead

The round-16 builder found this and it is confirmed: **`W.bootH` and `W.bootW` are never
read.** `buildBoot()` hardcodes `hgt = w(0.055)` and an upper width of `w(0.056)`, so every
past attempt to enlarge the boot through `W` has done nothing. Only `W.bootLen` is wired up.

Wire them up — `buildBoot(w, W, mats, mesh, side)` already receives `W`:
```js
const len = w(W.bootLen);
const hgt = w(W.bootH);      // was hardcoded w(0.055)
// and the upper's width: w(W.bootW) in place of the hardcoded w(0.056)
```
With `bootH` at `0.095` and `bootW` at `0.088` (already set in `W`), the boot finally grows.

**Then fix the sole, which is currently nested inside the upper.** With the old numbers the
sole spanned roughly `-0.069 .. -0.045` while the upper spanned `-0.061 .. -0.006`, so about
two thirds of the sole was buried inside the boot and only a sliver showed. Reposition it so
its top face meets the upper's bottom face rather than overlapping it, and re-check after the
height change above — the two interact.

A critic has reported the sole, toe cap and ankle collar as entirely absent. **That report is
wrong** — I cropped the foot myself and all three are present. They are simply too small to
read. This change is about size and seating, not about adding them again. Do not re-add them.

---

## Presentation requirements

Identical to `docs/slices/task-robot-15.md` — read its "Presentation requirements" section
and follow it. **Do not change `envIntensity` in `char-turnaround.js`;** a critic has verified
exposure now matches the sheet with no clipping, and that file is not yours this round.

---

## The traps

- **Prefer `Edit` over scripted string replacement** — `Edit` fails loudly on a bad anchor.
- **`taperY` smoothsteps across the whole height** — a hard end value thins the middle too.
- **Relief deeper than its own pitch reads as a spiral when seen off-axis.** This is what the
  drive discs just got fixed for. If you author any new stepped detail, keep total relief
  below about half the step spacing.
- **A mirrored transform inverts winding** — `scale.x = -1` needs `flipWinding`.
- The dominant failure here is **code that looks right and renders nothing.** Shoot after
  every change; do not batch all four and hope.

---

## Verification

```bash
node harness/shoot.mjs --view char.turnaround --review 1280
node harness/sheet.mjs --img progress/shots/char.turnaround.png --img "C:/Users/John/Documents/Run Robot Run/Dev Art/1785277053522.png" --out "C:/Users/John/AppData/Local/Temp/cmp18.png" --cols 1
```
Crops that actually settle each change: **profile** for change 2, **front + 3/4** for the leg
panel gaps in change 1, **a foot crop** for change 4, **a knee crop** for change 3.

Perf — pin the tier. GPU time oscillates right on the line (1.37–1.45 ms against 1.389 ms), so
take more than one sample and report raw numbers plus the budget the harness prints:
```bash
node harness/shoot.mjs --view char.turnaround --perf --extra "quality=medium"
```
Change 1 adds two meshes per leg before merging; report the triangle delta.

## Regression gate — mandatory

Keep `buildUnit4H`'s exported shape stable: `root`, `joints`, `parts`, `limbs`, `sockets`,
`setPose`, `detach`, `attach`, `isAttached`, `height`, `materials`. You may add; you may not
rename or remove. Change 1 restructures `parts.thigh*` / `parts.shin*` — keep those keys valid.

```bash
node harness/shoot.mjs --view char.turnaround --view hunter.3 --view gadget.nailgun --view limb.detach --view game.play
node harness/audit.mjs --render
```

**You may not score your own work.** Do not run `status.mjs set`. Ceiling is PASS; only a
`critic-*` sets WOWED.
