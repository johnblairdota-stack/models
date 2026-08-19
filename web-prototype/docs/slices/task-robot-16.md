# Slice: `char.turnaround` — the base robot, round 16

**Owner for this slice:** one agent, run alone. **Files you may edit — nothing else:**
- `src/characters/unit4h.js`

Do not touch `src/characters/hunter.js`, `src/game/*`, `src/materials/surfaces/robot.js`, or
any gadget file. Twelve modules import `buildUnit4H` and they are not yours this round.

This plan names the specific changes. Where a number is given, use that number; where a
decision is made, do not re-open it. **If you find a stated fact is wrong, say so in your
report rather than silently diverging.** The round-15 builder did exactly that twice and was
right both times.

Ranked from `critic-robot-16` (WEAK 54, up from 48). Six changes — **do not add a seventh.**
Material/specular story is the critic's #5 and is deliberately held for round 17: it lives in
a different file and is a different kind of work.

---

## 1. Limb silhouette — still the critic's #1, two rounds running

> "thighs/calves/forearms are smooth, near-uniform capsules with almost no taper or
> segmentation, vs. the art's contoured, tapered, panel-broken limbs."

`thigh` and `shin` are `roundedBoxGeometry` with small radii and **no taper at all**. A
rounded box with a small radius is a box.

**Carry the technique already in this file** — `taperY(geo, bottom, top)` is used on the
chest for exactly this reason; its docstring says an untapered chest reads as a slab. Same
for a limb.

```js
// thigh: broad at the hip, narrowing into the knee
taperY(roundedBoxGeometry(w(W.thighR * 1.62), thighLen * 0.74, w(W.thighR * 1.72), w(0.038), 5), 0.78, 1.06)

// shin: broad at the knee, narrowing into the ankle
taperY(roundedBoxGeometry(w(W.shinR * 1.9), shinLen * 0.97, w(W.shinR * 1.95), w(0.032), 4), 0.72, 1.04)
```

Corner radius rises `0.026 -> 0.038` and `0.020 -> 0.032`, segments with it. **`taperY`
smoothsteps across the whole height**, so do not push the end values past these without
checking the midpoint keeps its mass — an over-driven taper once cost the mint cap its bulk.

Arms, same defect milder — near-straight tubes:
```js
segment(w(W.upperArmR * 1.15), w(W.upperArmR * 0.82), upperArmLen - uaTop, 20)
segment(w(W.forearmR * 1.18), w(W.forearmR * 0.72), foreArmLen, 20)
```
**Do not change `upperArmLen`, `foreArmLen`, `uaTop`, or any joint position.** The elbow is
where gadget limbs mount and the wrist is where the hand attaches. Radii only.

### 1b. The zigzag notch at the top of each thigh

> "a jagged zigzag notch cut into the top of each thigh where it meets the hip — reads as a
> geometry error, not a panel line."

The round-15 builder confirmed this predates its changes. It is the thigh shell's top
intersecting the pelvis block — and note the taper above makes the thigh **wider** at the
top, which will worsen it if left alone. Drop the shell so its top clears the pelvis:
`thigh.position.y` from `-thighLen * 0.44` to `-thighLen * 0.50`, with the height already
reduced to `thighLen * 0.74` above.

**Shoot a crop of the hip/thigh junction and confirm the notch is gone before moving on.**
This is a geometry-intersection artifact, so it is only verifiable by looking.

---

## 2. Head — make it a true sphere; the flat facet is no longer paying for anything

> "a rounded-box with a flat side panel (confirmed in profile), not the art's true sphere.
> Front view alone looks close; profile exposes a hard flat facet where the art curves
> smoothly all the way around."

Round 12 dropped the corner radius to 55% of clamp because a near-sphere left nowhere for
the faceplate and ear discs to sit. **That constraint is gone:** round 15 rebuilt the ear on
its own boss, so it no longer needs a flat side face at all, and the faceplate is set proud
of the shell rather than inset into it.

So reverse it deliberately:
```
corner radius factor:  headHalfMin * 0.68  ->  headHalfMin * 0.90
headW: 0.150 -> 0.152
headH: 0.158 -> 0.156
headD: 0.140 -> 0.150
```
Near-equal extents plus a 0.90 radius gives a genuine dome that reads round from every
angle. **Check the profile view specifically** — that is where the flat facet shows and
where the previous two attempts were judged.

After this, confirm the ear boss still seats cleanly on the now-curved side. If the boss
undercuts or floats off the surface, raise its `x` offset until it sits flush and say so in
your report.

---

## 3. Knee — put the ring back on the joint, centred

> "the 'disc' is a small ball bump stuck to the outside/back edge of the leg, not a ring
> bezel centred symmetrically on an oval kneecap."

Round 15 gave the knee disc a lateral offset and a `-0.45` cant, copying the hip treatment.
That was **my error** — `ART_MANIFEST.md` says the knee ring is not canted, I overrode it
reading the art's front view, and the manifest was describing a real constraint. The
round-15 builder flagged this doubt in its own report and was correct.

Revert the offset and the cant, and get relief from radius instead:
```js
kd.position.set(0, 0, 0);
kd.rotation.y = 0;
// same for kBore
```
```
kneeDiscR: 0.046 -> 0.052
```
At `0.052H` the disc is proud of the shin shell's `0.0475H` half-width, so it reads as a
bezel standing off the joint without leaving the leg's silhouette.

Then make the kneecap the oval plate that sits **over** it on the front, rather than a
second competing lump beside it:
```js
const cap = mesh(blob(w(0.028), w(0.034), w(0.018), 16), mats.shell, `kneeCap${side}`);
cap.position.set(0, w(0.004), w(W.thighR * 0.80));
```

---

## 4. Boots — blobs with a sole sliver

> "plain smooth teardrop blobs, no ankle strap/collar band, no two-tone toe cap. Nothing
> marks them as footwear vs. rounded stubs."

In `W`:
```
bootLen: 0.120 -> 0.132
bootH:   0.085 -> 0.095
bootW:   0.078 -> 0.088
```
In `buildBoot()`:
- **Thicken the sole.** `soleGeo` height `w(0.016) -> w(0.024)`. A thin dark sliver reads as
  a seam; the art has a rubber sole with real thickness.
- **Add a toe cap** — a `mats.shell` piece over the front third of the upper, set very
  slightly proud so it catches its own highlight and reads as a separate moulded part.
- The ankle collar already exists one level up (`ankleCollar` + `astack` in the ankle joint).
  The critic reports it as absent, so it is too small or too low-contrast to read, not
  missing. Widen `collarR` from `w(W.shinR * 0.58)` to `w(W.shinR * 0.72)` and check it in
  the profile view — it must read as a deliberate band bridging shin and boot.

---

## 5. `driveDisc` — the rings descend, so they revolve into a spiral shell

> "a continuous spiral/shell groove, not the art's stepped concentric-ring lens — a pattern
> mismatch, not just scale/contrast."

The mechanism, and it is a one-line fix. In `driveDisc()`:
```js
const z = thickness * (0.64 - i * 0.10);   // each ring SHALLOWER than the last
```
A profile whose ring depths descend monotonically revolves into a cone/shell, not into flat
concentric rings. Make every ring the same depth:
```js
const z = thickness * 0.60;
```

**This one edit fixes the hips, the knees and the new ear discs simultaneously**, because
all three now use `driveDisc`. Look at all three after changing it.

Hips are also still under-scale against the art: `hipDiscR: 0.078 -> 0.088`.

---

## 6. Delete the chest and back hairlines — the art has no line there

> "improved from a solid slab to a hairline, but the art has no line there at all."

Remove `parts.sternum` and `parts.backSeam` entirely — construction, `chest.add(...)` and
the `parts.` assignments. They are decorative and nothing reads them.

Leave `parts.backLouvres` and `parts.backPlate` alone. The art's back also carries a second
decal and a horizontal ridge plate; **do not add those this round** — that is round 17.

---

## Presentation requirements

Identical to `docs/slices/task-robot-15.md` — **read its "Presentation requirements" section
and follow it.** Exposure now matches the sheet (the critic verified it, with no clipping),
so do not change `envIntensity` in `char-turnaround.js`. It is not yours this round.

---

## The traps

- **Prefer `Edit` over scripted string replacement** — `Edit` fails loudly on a bad anchor; a
  `node` replace silently applies half its changes.
- **`taperY` smoothsteps across the whole height** — a hard end value thins the middle too.
- **A mirrored transform inverts winding.** `scale.x = -1` without `flipWinding` renders the
  part inside-out.
- **`LatheGeometry` revolves a 2D profile.** It cannot produce a helix — but it *can* produce
  a cone or shell if the profile's depths trend in one direction, which is exactly change 5.
- The most common failure here is **code that looks right and renders nothing.** Shoot after
  every change or two; do not batch all six and hope.

---

## Verification

```bash
node harness/shoot.mjs --view char.turnaround --review 1280
node harness/sheet.mjs --img progress/shots/char.turnaround.png --img "C:/Users/John/Documents/Run Robot Run/Dev Art/1785277053522.png" --out "C:/Users/John/AppData/Local/Temp/cmp16.png" --cols 1
```
Look at the **profile view** for changes 2 and 4, and at a **hip/thigh crop** for 1b.

Perf — pin the tier; `auto` picks `high` and that is not the target:
```bash
node harness/shoot.mjs --view char.turnaround --perf --extra "quality=medium"
```
The harness prints its own budget — **report the raw numbers and the budget it printed**,
do not compare against a remembered figure. GPU time is currently sitting right on the line
(1.39–1.45 ms against a 1.389 ms budget), so if your geometry changes push it up, say so.
Never run this while another agent is measuring perf.

## Regression gate — mandatory

Keep `buildUnit4H`'s exported shape stable: `root`, `joints`, `parts`, `limbs`, `sockets`,
`setPose`, `detach`, `attach`, `isAttached`, `height`, `materials`. You may add; you may not
rename or remove.

**Note:** change 6 removes `parts.sternum` and `parts.backSeam`. `parts` is part of the
exported shape, so grep for both names across `src/` first and report anything that reads
them before you delete.

```bash
node harness/shoot.mjs --view char.turnaround --view hunter.3 --view gadget.nailgun --view limb.detach --view game.play
node harness/audit.mjs --render
```

**You may not score your own work.** Do not run `status.mjs set`. Ceiling is PASS; only a
`critic-*` sets WOWED.
