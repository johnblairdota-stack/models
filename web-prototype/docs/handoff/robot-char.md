# Appendix: robot & character

**Covers:** the robot's grime-obeys-gravity fix (robot-owner-1), `char.locomotion` r4's plant
fix plus three lying instruments (motion-2), and two failed claims closed by finding the class
of error (robot r36 — the boot's black diagonal bar, the hip-band/arm mixup).
**Read when:** your slice touches `src/game/char-locomotion.js`, robot/character materials
(`mat.robot`), `char.turnaround`, `char.detail`, or `char.poses`.

---

## 💧 THE ROBOT'S GRIME NOW OBEYS GRAVITY AND GEOMETRY (robot-owner-1, 2026-08-05). `hunter.3` r16 · `hunter.sheet` r5 · `mat.robot` r37 · `char.turnaround` r37 — ALL BUILDING, UNSCORED.

Closes the **only** open hate on `hunter.3` (80) and `hunter.sheet` (82) — *"uniform dirt that
ignores gravity and geometry"*. Toggle: **`?weather=0`**. Masks: `?weather=debug|debug2|debug3`.

### 🚨 THE CAUSE: `SHELL_SURFACE`'S "GRAVITY" WAS A TEXTURE COORDINATE, NOT A DIRECTION
`SHELL_SURFACE` and `CHROME_SURFACE` each carried `float gravity = 1.0 - smoothstep(0.0, 0.95,
uv.y);`. **These surfaces are BAKED** — `baker().standard()` evaluates them once into a 512²
tile that is then repeated over every mesh — so `uv.y` is a coordinate *in that tile*, not a
height in the world. "Down" therefore pointed down a vertical thigh, **ALONG a horizontal
outstretched arm**, and radially on a sphere; the same tile landed on the armpit, the knee
crease and the boot top at the same orientation and strength. That is precisely the reported
defect, and **no amount of tuning inside those shaders could ever have fixed it.**
⚠️ `plaster.js` uses the identical idiom and is FINE — a wall's v axis really is world up. **A
character is the case where it breaks, and it broke silently.** Check any other baked surface
that claims a gravity term and is applied to something other than a wall.

### The fix is a RENDER-TIME layer, and it touched nothing that already existed
One `onBeforeCompile` on `shellWhite` / `chromeSatin` / `mintCap`, installed **only when the
toggle is on**. Nothing above it in `robot.js` changed, so the revert is complete *by
construction*. Four reads, all VALUE and PLACEMENT: **pooling** in pockets and seams,
**vertical run-off** (noise sampled in world XZ, held constant along world Y, so it is vertical
on every surface whatever that surface's uv does, with a world-Y sawtooth giving each streak a
hard top edge and a downward fade), **scouring** of upward-facing and convex-proud surfaces, and
**sheltered undersides** keeping theirs.

### ✅ `?weather=0` IS A BYTE-IDENTICAL REVERT ON ALL FOUR PIECES
`0/6220800 rgb bytes differing, file bytes identical` against the pre-change captures — and a
same-config control pair on this harness now reads **exactly 0**, so that is the real floor and
not a rounding claim. Against `?weather=1`: `hunter.3` **11.3%** of bytes / max delta 121,
`hunter.sheet` **12.2%** / 120, `char.turnaround` 1.36% / 85, `mat.robot` 0.39% / 44.
**And the difference is PLACED, not global** (`harness/_tmp_weather_rect.mjs`): empty cyc
**0/200000** differing pixels, empty floor **1/68000 at max delta 1**, hunter torso
**70362/90000 at max delta 95**.
**Grade at the default tier: median and topChroma UNCHANGED on all four; only `toeL` moves
(hunter.3 61.3 → 55.2, sheet 66.1 → 59.6) — the signature of a value-and-placement change
rather than a hue or exposure one.** `mat.robot` and `char.turnaround` are numerically flat
(mean 95.623 → 95.624 and 191.388 → 191.376).

### 🚨 A LATENT SHARED-BUILD HAZARD, FOUND HERE, AFFECTS EVERY `onBeforeCompile` IN THE REPO
**`post/pipeline.js`'s `patchForScreenAO()` ASSIGNS `material.customProgramCacheKey` rather
than composing it**, so any key a material set for itself is silently discarded at scene
finalize. (It composes `onBeforeCompile` correctly — it keeps and calls the previous one — so
only the *key* is lost, which is the half that fails invisibly.) Three's own program key is
built from booleans like *"has a normalMap"*, **not from texture identity**, so two patched
materials with the same map slots can be handed each other's program — a robot shell and a
baked `marble.js`/`walnut.js` material in one room is enough. `brandDecal`'s
`'rrr-brand-decal-v2'` is clobbered the same way today and survives only on unrelated defines.
**The durable fix used here: put the discriminator in `material.defines`, which
`WebGLPrograms.getProgramCacheKey` hashes too and which nothing in the project rewrites.**

### The instrument that found the real design error — build one before tuning by eye
The first cut was tuned by guessing and landed almost invisible, which is **indistinguishable
from a mask that is reading nothing at all**. `?weather=debug` paints the masks and settled it
in one capture: the screen-space curvature estimator fires beautifully on every panel line, rim
and rolled edge, and finds **essentially nothing in the armpit** — because curvature can only
see concavity *within one continuous surface*, and this character's deep pockets are gaps
between separate, individually convex, interpenetrating meshes. **There is no concave surface in
an armpit for a derivative to find.** The signal that does see them is the **pipeline's own
screen-space AO buffer**, now exported (`AO_UNIFORMS`) and reused as a cavity mask.
⚠️ **And its threshold could not be guessed either.** `?weather=debug3` bands the raw buffer:
on `hunter.3` it sits almost entirely in **0.50–0.85** (general half-space occlusion, not
pockets), and the genuinely enclosed points are the sparse **0.30–0.50** band. The first
window, 0.34–0.92, called the **entire character** a crevice — it would have replaced one
uniform field with another and looked plausible doing it.

### Checked, not assumed
✅ **Reads in greyscale AND at 35% luminance** (`harness/desat.mjs`, both modes): the scoured
kneecap, the pooled band at the boot-top/ankle junction and the run-off down the shin are the
clearest structure on the leg in *both* passes — arguably clearer than in colour.
✅ **The assertion was validated by breaking it**: pointing `rrwPatch` at a non-existent include
fails the capture loudly instead of merely rendering darker.
✅ **Perf `NOT RESOLVED`** (`perf-ab.mjs`, pinned `quality=medium`, interleaved, discarded
round): gpu 0.86 on vs 0.82 off against a within-config spread of up to 0.10 ms. **250 calls /
338k tris identical in both arms**, budget 1.39 ms.
✅ `hunter-owner-4`'s rider-torso fix **did not regress** — the clean white/cyan torso still
reads on both pieces. `hunter.js` was not touched.

### ⚠️ What I did NOT do, stated rather than glossed
- **`mat.robot` (51) is essentially unchanged (0.39% of bytes) and this does not help it.** Its
  specimens run at grime 0 and are large smooth forms with almost no pockets or tight edges.
  **Its open hate — the straight black diagonal bar across the boot — is untouched.** The brief's
  expectation that one fix "reaches" `mat.robot` did not hold; report it as no-change, not a win.
- The player pieces gain only a small crevice contact-shade (an ungated 0.10 floor). Shells stay
  showroom white — verified by eye and by a flat grade.
- Left behind: `harness/_tmp_weather_ab.mjs` (before/after crop, one image per comparison).


## char.locomotion r4 — and three instruments that were lying (motion-2)

**Unjudged.** Fresh blind A/B sheets are at `progress/shots/loco-ab2/`; the key is SEALED at
`docs/sealed/loco-ab2-key.md` — **critics must not open it**, the lead decodes after filing.

- **The visual complaint was one line.** `_footPath`'s toe-off spike was centred just *past*
  toe-off, so stance only ever saw its leading tail: the planted foot swung up as a block
  where the unplanted one rolled. In-contact heel-lift now **27° → 48°** (unplanted 33°), toe
  pinned at 0–12 mm while the heel climbs to 178 mm. Contact speed improved at the same time
  (0.01–0.16 m/s mean, 0.31 worst).
- ⚠️ **`measureLegs()` demanded TWO complete legs, so ONE LEG has never had the plant on** —
  `char-locomotion.js` and `limb-detach.js` replace the lost leg's joints with empty Groups
  *before* constructing the Gait, so it returned null and `plantAmt` fell to 0. Its foot sat
  **151 mm through the floor**, and **round 1's blind limp A/B compared plant-off against
  plant-off** — the "0.137% indistinguishable" was the PNG encoder. Fixed. `player.js` was
  never affected (it builds from a whole rig).
- ⚠️ **The converge tool was lying, and its author found it.** `artifacts()` warmed up a fixed
  240 frames while `--converge` sweeps 60→3840 Hz — 4 s at 60 Hz but **62 ms at 3840**, so
  fine traces began inside the spring start-up transient. The critic's "limp 29 → 482 crosses
  POPS" was a true reading of a broken instrument. Warm-up is now a duration and the table
  prints a real fine-convergence ratio. **The critic's DIRECTION still holds and is confirmed:
  planting is worse in absolute acceleration in every case (hip 2.6–8.2× at 60 Hz), including
  run and turn — round 1's "acceleration is now lower with planting on" is false everywhere.**
  The driver was NOT found (sweeping `reachAim` moved it non-monotonically and left foot
  acceleration bit-identical, so it is not IK conditioning near extension). It is smooth,
  bounded, and does not move the foot; that is the honest claim.
- **Two of the three alt gaits were BURIED, not floating** — skate **−229 mm**, down
  **−336 mm**, crawl +178 mm. "SKATE shows no legs" had the same cause: they were below the
  ground plane. All three now land at **0.0 mm** via `_groundY()` (apply pose, ask the rig for
  its lowest vertex under the pending transform, drop by that — `_pivotAt` corrected for root
  pitch only and skate has 53° of roll). Costs 0.10–0.13 ms/frame, floor gaits only. The
  skate HARDWARE is genuinely `src/gadgets` geometry that `char.locomotion` never builds.
- **TURN's carve arc is dropped**, after a kerb and a nine-post picket also failed: at this
  station the arc's tangent points at the camera and the curve recedes into its own
  foreshortening. **A bank reads best square-on; a ground curve reads best in plan; this
  station is chosen for the bank.** Replaced with a shoulder-height level bar beside the
  working plumb line, so the banked shoulder line crosses a known horizontal.


## Two failed claims, closed by finding the CLASS of error (robot r36)

- **The boot's black diagonal bar**: `roundedRectShape` returned a **filled** `Shape`, so
  `ExtrudeGeometry` produced a solid **card** — there was never a ring in the file. And even as
  a true ring it stays straight: the rim is a **planar** closed loop and a plane meets the
  boot's flat flank in a straight line at *every* tilt, which is why round 34's re-tilt could
  only change which way it leaned. Straightness was a property of the geometry **class**.
  Rebuilt as an arc ribbon in `limbScribe`'s idiom; `UNIT4H_ENV.sole` 0.22 → 1.60 (round 33's
  "the sheet's boot has a genuinely black band" is measurably false — the references floor at
  0.15–0.33 of shell, ours at 0.025–0.07). Seam now 0.266 of shell vs the sheet's 0.28.
- **The hip band was never the hip — it is the ARM.** Round 34 changed *lateral* (X) width and
  reported it against the critic's *profile-depth* (Z) baseline: two correct measurements on
  two axes, presented as one before/after pair. The real cause is the profile arm hanging in
  front of the torso's own front line (the sheet's hangs at the back). `armFwd` 0.020 → 0.004,
  `armLean` 0.26 → 0.10 (both were corrections for deficits that closed long ago and kept
  going). **+19.2% → +4.3%, IoU 83.6 → 84.5.** Closing it EXPOSED a pre-existing −21% deficit
  at 0.44–0.52 H (upper thigh/buttock depth) that the forward arm had been masking — now the
  largest profile error, left honest rather than papered over.
- ⚠️ **The 86.4% IoU baseline does not reproduce** — measured **83.6%** on a clean tree before
  any change. Treat 86.4 as unsourced; use 84.5 going forward.
- `measure.mjs` gained `--prof` (full width curve + signed front/back edges) and
  `_tmp_geoprobe.mjs` gained `--pick` (camera→pixel raycast returning which mesh owns a pixel,
  plus an ASCII ownership raster). `--pick` is what identified both defects; reach for it
  before theorising about which part you are looking at.

