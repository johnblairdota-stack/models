# Slice: `char.detail` — the parts, at 20 cm

**Owner for this slice:** one agent. **Files you may edit — nothing else:**
- `src/views/char-detail.js` (currently a 6-line `notBuilt()` stub — replace it entirely)
- `src/views.js` — **the title line for `char.detail` only**, to add the fourth station

Do **not** edit `src/characters/unit4h.js` or `src/materials/surfaces/robot.js`. This view
exists to *show* the parts, not to fix them. If a part looks wrong through this view, that
is a finding for your report and a job for the robot slice — say so rather than reaching
into the model.

This plan names the specific changes. Where a number is given, use that number. **If you
find a stated fact is wrong, say so in your report rather than silently diverging.**

**Do not start this until a critic has filed PASS on `char.turnaround`.** This view's whole
job is to hold the parts up to close scrutiny, and pointing a macro lens at parts that are
still being reworked burns a round on a frame that is about to change.

---

## Why this slice matters

`char.detail` is `NOT_BUILT`. It is one of the two views that prove the base robot's parts
survive close inspection — and 20 of the 37 pieces reuse those parts. The project's most
persistent failure is detail authored at only one frequency: fine at 2 m, falls apart at
20 cm. This view is the instrument that catches that, and right now it does not exist.

It is also the natural home for the features that have repeatedly failed to read at
turnaround distance — the ear disc, the mint cap and its chrome ball, the hip drive discs
and the knee ring. If they are wrong, this is where it becomes undeniable.

---

## The bar

- `C:\Users\John\Documents\Run Robot Run\Dev Art\1785277053522.png` — the turnaround sheet;
  crop into it for the head, shoulder and knee.
- `1785301780641.png` — recovering push-up. **The hip drive discs read large and bold here**
  — this is the clearest look at them in the whole art set.
- `1785308800211.png` — side plank; hip discs and knee rings in profile.

---

## The four stations

Build the robot **four times**, sharing one material set (`unit4hMaterials()` created once
and passed into every `buildUnit4H({ height, materials })`) exactly as
`src/views/char-locomotion.js` does. Sharing the set is not cosmetic — it is what keeps the
texture bake to one pass and the draw calls in budget.

| # | station | what must read | framing |
|---|---|---|---|
| 1 | `HEAD` | faceplate as an inset screen with real corners, brow, **ear disc as a ring with a dark recess and a bright hub**, crown seam, rear vents | 3/4 from slightly above |
| 2 | `SHOULDER` | mint cap as an asymmetric teardrop **hooding** the chrome ball, ring collar under it, cap boss, the chrome tube emerging from beneath the hood | front-3/4, cap filling the frame |
| 3 | `PELVIS` | hip drive disc as **concentric camera-lens rings with a genuinely dark centre bore**, belt band, the saddle block | square-on to the disc |
| 4 | `KNEE / BOOT` | knee ring disc, white kneecap plate over it, ankle collar and ring stack, boot toe sweep and dark sole break | near-profile |

Station 4 is new relative to the registered title. Update that one line in `src/views.js` to
`UNIT-4H head / shoulder / pelvis / knee detail`. It is there because the knee ring was an
**undiagnosed** miss — no builder and no prior critic caught it until round 14, precisely
because no view ever looked at a knee up close.

### Layout, decided

One camera, four rigs. Give each rig its own `THREE.Group` stand at
`x = (i - 1.5) * SPACING`, and **raise or lower each rig so its focus feature sits on the
camera's horizontal centreline** — that is what puts four different body parts in one
frame at one scale. Start at `SPACING = 0.62`, `fov = 20`, camera pulled back far enough
that all four read; the rest of each body runs out of frame, which is correct and reads as
a macro crop rather than a mistake.

Rotate each stand in Y so its feature faces the camera squarely — a disc whose face normal
is along local X shows only an edge-on sliver head-on, which is exactly why the hip discs
were canted in the model.

Those three numbers are a starting point, not a result. **Shoot it, look at it, and adjust
until each feature genuinely fills its quarter of the frame.** Framing is the deliverable
here as much as the geometry is.

---

## Presentation requirements — this view lives or dies on these

A previous slice landed every specified mechanism change and still scored WEAK 48 because
its specimen floated and its frame was cropped. **Everything a plan leaves unsaid comes out
badly.**

1. **Match the sheet's key.** High-key studio on a near-white cyc `#F2F2F2`, soft falloff,
   no crushed blacks. Follow `char-locomotion.js`'s `studio({...})` call and tune
   `envIntensity` until the render sits at the sheet's brightness, not below it.
2. **At macro, chrome needs something to reflect.** Polished metal against an empty
   environment reads as flat grey plastic — this is on the standing list of usual failures.
   The studio env must give the chrome a real gradient with a visible highlight roll.
3. **No clipped speculars.** White shells under a bright key blow out fast, and at this
   scale a blown highlight erases the exact surface detail the view exists to show. Check
   the brightest shell pixels are not pinned at 255.
4. **Label every station** using `labels()` — name the part and the landmark fraction it is
   built to, so a critic can check the number without reading source.
5. **Contact shadow.** Even cropped, each rig needs to sit in the scene's shadow, not float.

---

## The traps

- **Prefer `Edit` over scripted string replacement** — `Edit` fails loudly on a bad anchor;
  a `node` replace silently applies half its changes.
- **`engine.capture` is the difference between a still and a live view.** Freeze
  deterministically for capture the way `char-locomotion.js` does, or successive shots
  disagree and every critic verdict becomes unreproducible.
- **Do not add a turntable to this view.** A rotating specimen cannot be blind-compared
  against a fixed reference crop.
- **`LatheGeometry` revolves a 2D profile** — it cannot produce a helix. If a disc reads as
  a swirl, that is size, contrast or radial-segment aliasing.

---

## Verification

```bash
node harness/shoot.mjs --view char.detail --review 1280
```
Read the `.review.png`. Then tile against the reference and compare each station to its
crop of the art:
```bash
node harness/sheet.mjs --img progress/shots/char.detail.png --img "C:/Users/John/Documents/Run Robot Run/Dev Art/1785277053522.png" --out "C:/Users/John/AppData/Local/Temp/detail_cmp.png" --cols 1
```

Perf — **pin the tier**, `auto` picks `high` on this discrete GPU and that is not the
target. Four full robots is four times the geometry, so this view can genuinely blow the
budget where the turnaround does not:
```bash
node harness/shoot.mjs --view char.detail --perf --extra "quality=medium"
```
Budget ≤1.39 ms GPU at 1080p, ≤300 draw calls, ≤900k triangles. Over budget at `high` is
not a finding. Never run this while another agent is measuring perf.

Then confirm nothing else broke:
```bash
node harness/audit.mjs --render
```

**You may not score your own work.** Ceiling is PASS; only a `critic-*` sets WOWED.
