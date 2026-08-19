# Slice: `mat.brass` — gilt bronze, lead crystal, mirror

**Files you may edit — nothing else:**
- `src/materials/surfaces/brass.js` (create it)
- `src/views/mat-brass.js` (replace the `notBuilt()` stub entirely)

Decisions here are already made. Use the numbers given. If a stated fact is wrong, say so
in your report rather than diverging silently.

**Read `BUILD_GUIDE.md` §4b (specimen view composition) before building the view.** A
previous slice landed every shader change and still scored WEAK 48 because its specimen
floated and the frame was cropped.

---

## Why this slice

`mat.brass` is NOT_BUILT, and it is what the chandelier, the wall sconces, the door
furniture, the lamps and the mirror frames are all made of — so it blocks
`prop.chandelier` and every room piece. Bar: `refs/_sheets/hitman.png` for the Paris
chandeliers and gilt mirror frames. Read `refs/REFERENCE_INDEX.md` first.

## Start from what already works, then diverge

`src/gadgets/gadgetmat.js` has a working `brass()` — cast surface, lathe-turned bands,
polish on the high points, grime in the hollows. **Read it and carry the technique across.
Do not import from it** — that file belongs to the gadget system and must not gain new
dependants.

The brief is genuinely different, though, and this is the point of the slice: the gadget
brass is a *worn tool*. Architectural gilt bronze is *cast, chased and gilded ornament*.
It is finer, more ornate, and its wear is from dusting and polishing rather than from use.
Note also that `gadgetmat.js` carries a hard-won comment: a variable named `cast` (a GLSL
reserved word) silently failed to compile and baked an all-zero texture set, rendering
every brass part as a black blob. **Do not name anything `cast`.**

## What to build

### 1. `giltBronze(opts)` — the main export
Cast bronze, chased, then **water-gilded**:
- fine sand-cast pitting in the recesses, **chased** (hand-tooled) detail on the raised
  ornament: short parallel chisel marks catching light, not noise
- gold `#B98B3C`, `metalness 1.0`, roughness `0.22` on burnished high points rising to
  `0.55` in the hollows
- **red bole `#7A3B22` showing through on worn edges.** This is the one detail that
  separates gilding from gold paint — leaf wears thinnest where a duster passes, so drive
  it off an edge/curvature term, patchy rather than a clean outline
- leaf joints at roughly 85 mm — a faint grid of slightly mismatched tone with occasional
  overlap lines
- **dust on every upward-facing surface**, grime in the hollows. Gilt bronze in a
  neglected house is dull on top and bright on the touched edges — the inverse of what
  people usually author

### 2. `leadCrystal(opts)` — chandelier drops
`MeshPhysicalMaterial` with `transmission`, high `ior` (1.55–1.7 for lead crystal, higher
than window glass), thin `thickness`, `clearcoat`. Slight internal colour — real lead
crystal is faintly warm, not neutral. Add a small `iridescence` term for the fire that
makes crystal read as crystal. Keep `roughness` very low but not zero.

### 3. `foxedMirror(opts)` — the gilt-framed mirrors
An old mirror is not a clean reflector. Silvering has degraded: **foxing** (dark speckled
patches where the backing has failed), a warm tint, and edge darkening. Build it as a
metal with high reflectivity, modulated by a foxing mask that eats into the reflection.
This is cheap and it is one of the strongest "this is an old house" cues available.

### 4. `patinatedBronze(opts)`
Ungilded bronze that has gone green-black in the recesses — for hardware, hinges,
door furniture. Verdigris collects where water sits and where hands never reach.

## Watch the noise gate
`fbmT` sums octaves, so it is a narrow bell around 0.5 and never reaches 0.9. **Four files
here have shipped detail that never drew** because of a `smoothstep(0.9, 0.99, fbmT(...))`
gate. Use `float pat(float v, float k){ return clamp((v-0.5)*k+0.5, 0.0, 1.0); }` and gate
`pat(fbm, 2.5)`. Then verify the detail renders — crop in, or read the baked texels back
with `readRenderTargetPixels`.

## The view

Per `BUILD_GUIDE.md` §4b. Metal is almost entirely environment reflection, so the
specimens must be curved and the environment must be doing work:
- a **turned baluster or candle arm** in gilt bronze, standing on the floor
- a **cluster of lead crystal drops** hanging from it, catching light
- a small **foxed mirror panel**, mounted, showing the foxing
- a patinated bronze door handle or hinge
- a chrome ball
- `studio({ bg: 0x4e535a, envIntensity: 0.62 })`. Metal against a white cyc reads as white.

Watch exposure especially here — polished gold blows out easily and a clipped highlight
destroys the material under it.

Texture budget: 512 each. These are small props seen at moderate distance.

## Verify
```bash
node harness/shoot.mjs --view mat.brass --review 1280
node harness/audit.mjs --render
```
Read the PNG. Confirm: nothing floats, nothing cropped, no clipping to white, the bole
shows on worn edges, the crystal refracts rather than looking like grey plastic, and the
foxing reads. Comparison sheet against `refs/_sheets/hitman.png`.

Do **not** pass `--perf`.

## Rules that have cost this project real time
- **Never put backticks inside a GLSL template literal.**
- **Never name a GLSL variable with a reserved word**: `cast`, `sample`, `filter`, `input`,
  `output`, `matrix`, `texture`, `buffer`. The `cast` one cost a whole critic round here.
- **Prefer `Edit` over scripted string replacement.**

## Record
```bash
node harness/status.mjs set mat.brass --round 1 --verdict PASS --score <honest> \
  --owner brass-slice --summary "..." --wins "..."
```
**Ceiling is PASS — only a critic sets `WOWED`.**

## Report back
Which of the four materials landed, whether bole/foxing/refraction are visibly rendering
(name the crops), and confirmation the view passes all seven §4b composition rules.
