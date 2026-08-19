# Slice: `mat.walnut` — walnut panelling, gilt mouldings, and a real floor

**Owner for this slice:** one agent. **Files you may edit — nothing else:**
- `src/materials/surfaces/walnut.js`
- `src/views/mat-walnut.js` (currently the `notBuilt()` stub — replace it entirely)

This plan names the specific changes. It is not a defect list to interpret — where a
number is given, use that number; where a decision is already made, do not re-open it.
If you find a stated fact is wrong, say so in your report rather than silently diverging.

---

## Why this slice matters

Walnut panelling is the estate's dominant wall surface. `mat.walnut` reads NOT_BUILT
because the view is a stub, and `walnut.js` itself is thin (5.5 KB against marble's
17 KB). Four of six architectural materials are unbuilt and **they block every room
piece**, so this is the front of the queue.

Bar: `C:\Users\John\Documents\Run Robot Run\Dev Art\1785319916301.png` — the one piece of
in-world mansion art. Dark walnut panelled walls, deep polish, gilt catching the light
shaft. Also `refs/_sheets/hitman.png` and `refs/_sheets/bf1.png` for how gilded panelling
reads at room distance. Read `refs/REFERENCE_INDEX.md` before opening individual refs.

---

## The six changes, in order

### 1. Fix the pore gate — it has never drawn

`board()` gates pores with `smoothstep(0.72, 0.95, fbmT(...))`. **`fbmT` sums octaves, so
its output is a narrow bell around 0.5 and essentially never reaches 0.72.** The open-pore
texture that makes walnut read as walnut has therefore been almost entirely absent. This
is the fourth file on this project with this exact bug.

Add the helper and use it:
```glsl
float pat(float v, float k){ return clamp((v - 0.5) * k + 0.5, 0.0, 1.0); }
```
Gate as `smoothstep(0.72, 0.95, pat(fbmT(...), 2.8))`. Then look at a close crop and tune
`k` until pores read as fine dark dashes elongated along the grain — present but not a
rash. Walnut is semi-ring-porous: pores cluster toward the earlywood side of each growth
arc rather than spreading evenly, so multiply the pore mask by the figure field.

### 2. Add gilt mouldings — the estate's signature, currently absent

There is no gold anywhere in this shader, and the locked art has gilded mouldings framing
the panels. Add a `uGilt` uniform (0 = plain walnut, 1 = fully gilded moulding).

Water-gilded gold leaf, not yellow metal:
- base `#B98B3C`-ish, `metalness 1.0`, `roughness 0.28` on the burnished high points
  rising to `0.55` in the hollows
- **red bole showing through on the wear edges** — where the gilder's burnisher and later
  hands have worn the leaf thin, a warm red-brown `#7A3B22` shows beneath. Drive this off
  the same `arris` term the code already computes. This is the single detail that
  separates real gilding from gold paint.
- **leaf joints**: gold leaf comes in ~85 mm squares, so a faint grid of slightly
  mismatched tone at that scale, with occasional overlap lines. At panel scale this is a
  low-contrast large grid — subtle, but it is what stops gilt reading as a flat gold fill.
- grime in the moulding hollows stays; gilt does not clean itself.

Apply gilt only to the bevel/moulding band (`onBevel` already exists), never to the panel
field or the stiles.

### 3. Book-match the veneer panels

Currently each panel gets an independent random rotation (`ang = (hash11(seed) - 0.5) * 0.5`),
which reads as random offcuts rather than joinery. Real panelling is book-matched: adjacent
panels are **mirror images** of each other, because consecutive veneer leaves are opened
like a book.

Mirror the field uv horizontally on alternate columns — `if (mod(cid.x, 2.0) > 0.5) fuv.x = 1.0 - fuv.x;`
— and give the *pair* one shared seed rather than each panel its own, so the mirrored halves
genuinely match. Keep a small per-pair drift so the wall does not become one repeated motif.

### 4. Add medullary rays

Quarter-sawn walnut shows fine ray flecks running **across** the grain — short, bright,
slightly iridescent slivers. Absent entirely. Add a sparse high-frequency term
perpendicular to the grain direction, gated through `pat()` so it actually fires, at low
density (a few percent coverage) and low contrast. Rays should appear mainly in the frame
stiles where the timber is quarter-sawn, and rarely in the flat-sawn field.

### 5. `walnutBoards()` is not a floor — rebuild it

It currently calls `walnutPanel({panelsX: 7, panelsY: 1, stile: 0.012})`, which is a
7-across panel grid with a hairline frame. That is not a floor. **`wall-transition.js`
already imports and uses this for its floor**, so this affects a live view — do not change
the export name or signature.

Rebuild it as real boards: long planks running one direction, **staggered end joints**
(running bond, offset each row by a hashed fraction), per-board tone drift, a visible but
tight joint line, and heavier wear along the walking lanes. Use the existing `rowGrid()`
helper in `glsl-noise.js` for the staggered layout.

Add a **separate** `walnutParquet()` export for the ballroom: Versailles panels or
herringbone. Do not try to make one function do both.

### 6. Build the view — `src/views/mat-walnut.js`

Delete the stub. Follow `src/views/mat-marble.js` as the pattern. Specimens must be the
shapes the material is actually used on, not spheres:
- a **panelled wall section** filling most of the frame, lit at a raking angle so the
  moulding relief and the gilt both read
- a **floor plane** in `walnutBoards()` at a real viewing angle
- a small **parquet** patch
- a chrome ball to prove the environment is doing real work

Use `studio()` with a mid-grey background, not the near-white cyc — dark polished wood
against white blows out. `mat-marble.js` has the reasoning in a comment; follow it.

---

## Verification — do all of these

```bash
node harness/shoot.mjs --view mat.walnut --review 1280
node harness/shoot.mjs --view wall.transition --review 1280 --extra "at=1.78"   # you changed its floor
node harness/audit.mjs --render
```

1. **Read both PNGs and look at them.** Compare against the Dev Art with
   `harness/sheet.mjs --img <render> --img "<devart>" --out cmp.png --cols 1 --width 1150`.
2. Crop in close (`--crop x,y,w,h`) and confirm the pores and rays actually render — this
   is the bug in change 1 and the whole point of it.
3. Confirm gilt reads as worn gold leaf with bole showing, not as a yellow band.
4. Confirm `wall.transition` still renders and its floor still looks right.
5. `audit.mjs --render` must pass — it boots all 37 views and fails on any that throws.

Do **not** pass `--perf`; other agents may be rendering and GPU timings would be
contaminated.

---

## Rules that have already cost this project real time

- **Never put backticks inside a GLSL template literal** — it terminates the JS string and
  breaks the module.
- **Never name a GLSL variable with a reserved word**: `cast`, `sample`, `filter`, `input`,
  `output`, `matrix`, `texture`, `buffer`. One named `cast` silently baked an all-zero
  texture set and rendered a whole gadget as a black blob.
- **Prefer `Edit` over scripted string replacement** — `Edit` fails loudly when its anchor
  does not match; a `node` replace silently applies half its changes.
- Texture budget: 1024 for this surface. 2048 only for a hero the camera gets close to.

## Record

```bash
node harness/status.mjs set mat.walnut --round 1 --verdict PASS --score <honest> \
  --owner walnut-slice --summary "..." --wins "..."
```
**Your ceiling is PASS — only a critic may set `WOWED`.** A critic will re-judge this.

## Report back

Which of the six changes landed, which did not and why, whether the pores and rays are
visibly rendering (name the crop you checked), and confirmation that `wall.transition`
still renders. Be honest — several builders on this project have reported fixes that a
critic then proved had not worked.
