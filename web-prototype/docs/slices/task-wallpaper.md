# Slice: `mat.wallpaper` — silk damask, three colourways

**Files you may edit — nothing else:**
- `src/materials/surfaces/wallpaper.js` (create it)
- `src/views/mat-wallpaper.js` (replace the `notBuilt()` stub entirely)

Decisions in this plan are already made. Use the numbers given. If a stated fact turns
out to be wrong, say so in your report rather than silently diverging.

**Read `BUILD_GUIDE.md` §4b (specimen view composition) before you build the view.** A
previous slice landed every shader change correctly and still scored WEAK 48 because the
wall floated and the frame was cropped. Those rules are not optional.

---

## Why this slice

`mat.wallpaper` is NOT_BUILT. Silk damask is the estate's second wall surface after
walnut, and three of six architectural materials being missing is what blocks every room
piece. Bar: `refs/_sheets/hitman.png` — the Paris salons are the reference for silk on a
wall. Read `refs/REFERENCE_INDEX.md` first, then open one or two individual files.

## Start from what already works

`src/materials/surfaces/wallstages.js` contains `WALLPAPER_SURFACE`, a working damask
built for destruction stage 0, and it already gets the hardest part right: **the motif is
a sheen difference, not a colour difference.** Real silk damask is one cloth woven with the
pattern threads running the other way, so the motif catches light differently rather than
being painted a different colour. It reads as silk because `s.roughness` inverts on the
motif while albedo barely changes.

**Read that shader and carry the technique across.** Do not import from it — that file is
owned by the destruction system and must not gain new dependants. Copy the approach into
your own file and diverge where architectural wallpaper differs from a wall about to be
destroyed.

## The five changes

### 1. A better damask repeat
The existing motif is a single ogee cartouche. Architectural damask has **two interlocking
motif scales**: a large ogee frame (roughly 60 cm on a real wall) with a smaller
pomegranate or palmette filling the interstices. Build both, on a half-drop match so
alternate columns shift by half a tile — that is how paper is actually hung and it breaks
the grid read.

### 2. Three colourways
Export `damask(opts)` with a `colourway` parameter, and three named presets:
- `'sanguine'` — deep red ground, gold-sheen motif. The Hitman salon reading.
- `'sage'` — muted green-grey ground, silver-sheen motif. Quieter rooms.
- `'oyster'` — pale warm grey, tone-on-tone. Corridors and the study.
Each is a ground colour plus a sheen delta, not two unrelated colours.

### 3. Real silk structure at the 20 cm scale
Fine vertical warp threads and a slightly coarser weft, both visible in roughness and in
the normal at grazing angles. This is what stops it reading as printed paper. Keep the
amplitude very low — silk is smooth; the structure is a sheen texture, not a relief.

### 4. Age, obeying gravity and geometry
- **Sun fade** strongest high on the wall and on whichever side the windows are: desaturate
  and lift toward the ground colour, do not just brighten.
- **Water staining rising from the skirting**, with a visible tide line — a hard edge where
  the damp stopped, which is the detail that sells it.
- **Lifted seams** at the paper edges, one per repeat width, curling very slightly.
- Grime where furniture and hands have touched, at about chair-rail height.

### 5. Watch the noise gate
`fbmT` sums octaves, so its output is a narrow bell around 0.5 and essentially never
reaches 0.9. **Four files on this project have shipped authored detail that never drew
because of a `smoothstep(0.9, 0.99, fbmT(...))` gate.** Use:
```glsl
float pat(float v, float k){ return clamp((v - 0.5) * k + 0.5, 0.0, 1.0); }
```
and gate `pat(fbm, 2.5)`. Then **verify the detail actually renders** — crop in close and
look, or read the baked albedo texels back with `readRenderTargetPixels`. Do not assume.

## The view

Per `BUILD_GUIDE.md` §4b. Specifically:
- A **papered wall running the full frame height**, meeting a floor at a skirting board —
  it must not float, and it must not be cropped.
- A second, smaller panel at a **grazing angle** so the sheen inversion is visible — this
  is the whole point of the material and a flat-on shot hides it.
- A patch showing the **water staining and tide line** at the skirting.
- A chrome ball.
- `studio({ bg: 0x4e535a, envIntensity: 0.62 })`, raking key.

Texture budget: 1024. This is a hero surface but a 2048 damask is not worth the VRAM when
the motif is low-contrast.

## Verify

```bash
node harness/shoot.mjs --view mat.wallpaper --review 1280
node harness/audit.mjs --render
```
Read the PNG. Confirm: nothing floats, nothing is cropped, no area clips to white, the
sheen inversion is visible at the grazing angle, and the weave renders at a close crop.
Build a comparison sheet against `refs/_sheets/hitman.png`.

Do **not** pass `--perf` — other agents may be rendering.

## Rules that have cost this project real time
- **Never put backticks inside a GLSL template literal** — it terminates the JS string and
  breaks the module. A slice hit this yesterday.
- **Never name a GLSL variable with a reserved word**: `cast`, `sample`, `filter`, `input`,
  `output`, `matrix`, `texture`, `buffer`.
- **Prefer `Edit` over scripted string replacement** — `Edit` fails loudly on a bad anchor.

## Record
```bash
node harness/status.mjs set mat.wallpaper --round 1 --verdict PASS --score <honest> \
  --owner wallpaper-slice --summary "..." --wins "..."
```
**Ceiling is PASS — only a critic sets `WOWED`.**

## Report back
Which changes landed, whether the weave and sheen inversion are visibly rendering (name
the crop you checked), and confirmation the view passes all seven §4b composition rules.
