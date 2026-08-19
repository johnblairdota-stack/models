# Slice: `char.poses` — proof the rig articulates

**Owner for this slice:** one agent. **Files you may edit — nothing else:**
- `src/views/char-poses.js` (currently a 6-line `notBuilt()` stub — replace it entirely)

Do **not** edit `src/characters/unit4h.js`. This view consumes `setPose`; it does not change
it. If a joint cannot reach the angle a reference pose needs, that is a **finding for your
report** — it means the rig is wrong, and it is a job for the robot slice. Say so rather
than working around it by rotating parts directly.

**If you find a stated fact is wrong, say so in your report rather than silently diverging.**

**Do not start this until a critic has filed PASS on `char.turnaround`.**

---

## Why this slice matters

`char.poses` is `NOT_BUILT`. It is the only piece that proves the rig **articulates** rather
than merely stands, and articulation is what the whole rigid-parts design was chosen for:
`limbs.armL` is a subtree you can reparent, which is the game's entire inventory and HP
system. Twelve modules call into this rig. If `setPose` cannot hit the art's own poses, the
hunter, the gadget mounts and the limb-detach system are all built on a rig that does not
bend, and nobody will find out until phase 4.

---

## The bar — four poses, each matched to its own reference

| # | station | reference | the pose |
|---|---|---|---|
| 1 | `POINT` | `1785301551166.png` | accusing point / lunge — right arm straight out at shoulder height, fingers splayed, torso rotated, left leg planted, right leg lifted and trailing |
| 2 | `PUSH-UP` | `1785301780641.png` | recovering push-up — torso low and angled, arms bearing weight, **hip discs square to camera** |
| 3 | `SIDE PLANK` | `1785308800211.png` | side plank — body on a diagonal, one arm straight to the floor bearing weight, hips low, legs scissored, one foot flat |
| 4 | `STRIDE` | `1785309310525.png` | mid-stride reach, body leaning into the step |

All four live in `C:\Users\John\Documents\Run Robot Run\Dev Art\`.

**Match the silhouette, not a number.** Do not invent joint angles from this document —
there are none here on purpose. Author each pose, shoot it, put it beside its reference, and
iterate until the silhouettes agree. That loop *is* the work.

---

## How to author a pose — the decisions, made

1. **Every pose goes through `unit.setPose({ jointName: [x, y, z] })`, in radians.** Never
   rotate a mesh in `unit.parts` directly. The parts are merged at build time by
   `collapseDrawCalls`, so a rotation applied to a part is a rotation applied to whatever
   else merged into it.
2. **`setPose` resets every joint you do not name** — it copies the rest rotation for any
   missing key. So each pose object must be complete in itself. You cannot layer a pose on
   top of another, and a pose that "mostly works" is not inheriting anything from the last.
3. **`setPose` orients; the view places.** It writes joint rotations and nothing else, so it
   cannot lift, tilt or translate the body. Poses 2 and 3 are off the feet entirely — their
   root transform is yours to set on the stand group, exactly as `char-locomotion.js` sets
   `model.position` and `model.rotation` from its gait offset.
4. Share one material set across all four rigs — `unit4hMaterials()` once, passed into every
   `buildUnit4H({ height, materials })`. This keeps the bake to one pass.
5. Freeze deterministically under `engine.capture` so successive shots agree. A view that
   renders differently each shot makes every critic verdict unreproducible.

---

## Presentation requirements — a floating limb fails this piece outright

1. **CONTACT IS THE WHOLE POINT.** Poses 2 and 3 bear weight on a hand. That palm must be
   **flat on the floor with a contact shadow under it** — not near the floor, not
   intersecting it. A weight-bearing hand floating a millimetre off the ground is the single
   most damaging thing this view can show, because it says the rig cannot be trusted to
   touch the world. The same goes for the planted foot in poses 1, 3 and 4.
2. **Match the sheet's key** — high-key studio, near-white cyc `#F2F2F2`, soft falloff, no
   crushed blacks. Follow the `studio({...})` call in `char-locomotion.js`.
3. **Frame all four fully.** No cropped hands or feet. Poses 2 and 3 are wide and low —
   check they do not collide with their neighbours; widen `SPACING` rather than shrinking
   the figures.
4. **Choose the camera yaw per station** so the pose reads. The push-up's hip discs face the
   camera in the art; the side plank reads in profile. A hero three-quarter on everything
   throws away what each pose was chosen to demonstrate.
5. **Label each station** with `labels()` — pose name and what it proves.
6. **No clipped speculars**, and **no turntable** — a rotating figure cannot be
   blind-compared against a fixed reference.

---

## The traps

- **Prefer `Edit` over scripted string replacement** — `Edit` fails loudly on a bad anchor.
- **Detached limbs are deliberately not posed.** `setPose` skips any joint that can no
  longer walk up to `root` (`poseSkip`), which is why a severed arm stops snapping upright.
  If you detach anything here, expect its joints to ignore you — that is correct behaviour.
- **A mirrored transform inverts winding.** If you mirror a pose, do not mirror by negating
  a scale.
- Radians, not degrees. Every joint value in this rig is radians.

---

## Verification

```bash
node harness/shoot.mjs --view char.poses --review 1280
```
Read the `.review.png`. Then tile each station against its own reference — one comparison
per pose, because a single sheet at four-up is too small to judge contact:
```bash
node harness/sheet.mjs --img progress/shots/char.poses.png --img "C:/Users/John/Documents/Run Robot Run/Dev Art/1785301551166.png" --out "C:/Users/John/AppData/Local/Temp/pose_cmp.png" --cols 1
```

**Zoom in on every ground contact** with a crop before you call this done:
```bash
node harness/shoot.mjs --view char.poses --crop x,y,w,h --out "C:/Users/John/AppData/Local/Temp/contact.png" --quiet
```
Use forward slashes in `--out` — backslashes silently break through Git Bash.

Perf — **pin the tier**, `auto` picks `high` on this discrete GPU and that is not the
target. Four full robots is four times the geometry:
```bash
node harness/shoot.mjs --view char.poses --perf --extra "quality=medium"
```
Budget ≤1.39 ms GPU at 1080p, ≤300 draw calls, ≤900k triangles. Over budget at `high` is not
a finding. Never run this while another agent is measuring perf.

Then confirm nothing else broke:
```bash
node harness/audit.mjs --render
```

**You may not score your own work.** Ceiling is PASS; only a `critic-*` sets WOWED.
