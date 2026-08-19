---
name: rrr-pipeline
description: The Run Robot Run asset pipeline — GPU-baked procedural materials, the screenshot/perf harness, the scoreboard, and the builder/critic workflow. Use when building or fixing any piece of the Three.js prototype in Run Robot Run/web-prototype, or when setting up a similar zero-asset material pipeline elsewhere.
---

# Run Robot Run — asset pipeline

Project: `C:\Users\John\Documents\Run Robot Run\web-prototype`. Three.js, **zero downloaded
texture assets** — every surface is a GLSL function baked once on the GPU.

Start any session by reading `HANDOFF.md` (short). Read `WORK_ORDER.md` for the dependency
tiers and model routing. Everything below is the mechanics.

## The five commands

```bash
node harness/shoot.mjs --view <id> --review 1280   # capture; READ the .review.png, not the 1080p
node harness/sheet.mjs --img a.png --img b.png --out c.png --cols 2   # tile before reading
node harness/status.mjs list                       # the scoreboard
node harness/audit.mjs --render                    # boots all 37 views, fails on any that throws
node harness/snapshot.mjs                          # self-contained hosted board
```

Token economics matter here because looking is the most repeated action. A 1080p read costs
~2,765 tokens; the 1280 review variant ~1,230; tiling five images into one sheet costs ~2,800
instead of ~14,000. Always tile before reading a set.

## Two more, for anything with reference art — MEASURE, don't eyeball

```bash
node harness/measure.mjs --img progress/shots/<id>.png --ref "<the piece's bar art>"
node harness/overlay.mjs --img progress/shots/<id>.png --ref "<the piece's bar art>" \
  --out "C:/Users/John/AppData/Local/Temp/ov.png"
```

`measure.mjs` locates each landmark as a **feature** of the width profile (shoulder = peak,
waist = trough) and reports size **and position**, flagging `LANDMARK MOVED`. Never compare at a
fixed height fraction — the rig and the art do not share proportions, so the same fraction hits
shoulder on one image and neck on the other and the delta is meaningless.

`overlay.mjs` superimposes the two silhouettes at matched figure height and prints an IoU.
**Red = render-only mass, blue = art-only, grey = agreement. Red ABOVE blue = sits too high;
red BESIDE blue = too wide.**

**Use these before changing any dimension, and quote the numbers in your report.** Silhouette
has been the top complaint in nearly every round of `char.turnaround`, and before these existed
the loop mis-diagnosed it repeatedly: a shoulder assembly sat 0.05 H too high for 27 rounds
while critics argued about width that was already within 1%, and six rounds were spent widening
a visor that measurement later showed already carried 41% MORE mass in profile than the sheet.
Both were cheap to measure and expensive to guess.

**These tools exist because agents kept writing their own and abandoning them** — six throwaway
measurement scripts accumulated in `harness/` before they were consolidated. If you need
something they do not do, extend them rather than starting a seventh.

## Writing a surface

One GLSL function per material, baked into albedo + ORM + normal via multiple render targets.
The baker calls `surface()` five times per texel (centre + four gradient taps) so the normal
comes from the height *function*, not a quantised buffer.

```js
import { baker } from '../baker.js';
const SURFACE = /* glsl */ `
uniform vec3 uTint;
void surface(in vec2 uv, inout Surf s){
  float grain = fbmT(uv * vec2(4.0, 90.0), 128.0, 5, 2.0, 0.5);
  s.albedo = uTint * (0.85 + grain * 0.3);
  s.roughness = 0.45 - grain * 0.1;
  s.metalness = 0.0;
  s.ao = 1.0;
  s.height = grain;          // the normal map derives from this
}`;
export function myWood(opts = {}) {
  return baker().standard({
    key: `wood:${JSON.stringify(opts)}`,   // MUST be unique per parameter set
    size: 1024, surface: SURFACE, heightScale: 0.05, anisotropy: 8,
    uniforms: { uTint: new THREE.Vector3(0.3, 0.2, 0.12) },
  }, { envMapIntensity: 1.0 });
}
```

`Surf`: `albedo` (vec3, **sRGB** — author the hex you want), `roughness`, `metalness`, `ao`,
`height`, `breakOrder` (destructible surfaces only). Noise library is auto-injected: `fbmT`,
`ridged`, `billow`, `warp`, `voronoiT`, `hash11/12/22`, `sdBox/sdRound/sdSeg/sdEllipse`,
`rot`, `pat`. **Always use the tileable `…T` variants with the right `period`.**

Budget: 2048 only for a hero surface the camera gets close to; 1024 for most; 512 for props.
Under 350 MB total.

## The four silent failures — assume these first

Every significant bug on this project was code that looked right, reviewed fine, and
**rendered nothing**. None were findable by reading code.

1. **`fbmT` returns a narrow bell around 0.5** and essentially never reaches 0.9. Any gate
   written `smoothstep(0.9, 0.99, fbmT(...))` **never fires**. Found in four separate files —
   plaster horsehair that had never drawn a single fibre, marble scratches, robot weathering,
   walnut pores. Stretch first:
   `float pat(float v, float k){ return clamp((v-0.5)*k+0.5, 0.0, 1.0); }` then gate `pat(fbm, 2.5)`.
   **The same trap exists JS-side**: a hand-rolled `fbm` that never divides by its amplitude
   sum returns ~0–0.875 with a narrow bell at ~0.44, so `(fbm(...) - 0.5) * A` delivers about
   a sixth of `A`, biased negative — 11 mm of authored geometric relief arrived as ~2 mm of
   wobble (found in `mat-plaster.js` round 2). Normalise AND stretch any JS noise you author.
   **Second form — the lerp that only visits the middle**: raw `fbmT` fed into
   `mix(dark, light, t)` measured p01..p99 of 0.33..0.66, so the material used 26% of its
   authored tonal range and rendered one flat mid-tone (walnut figure, found by measuring the
   bake). A gate that never fires draws nothing and is obvious; this form draws something
   plausible and hides. `pat()` the factor before any tonal `mix`.
2. **GLSL reserved words fail silently.** A variable named `cast` stopped a shader compiling;
   three logged to console, the draw was dropped, the render target kept its cleared contents,
   and the bake "succeeded" with an all-zero texture set — rendering a whole gadget as a black
   blob that read as unfinished rather than broken. Never use `cast`, `sample`, `filter`,
   `input`, `output`, `matrix`, `texture`, `buffer`. The baker now probes albedo and throws.
3. **Backticks inside a GLSL template literal** terminate the JS string and break the module.
   Never write `` `word` `` in a shader comment.
4. **Scripted string replacement fails half-way, silently.** A `node` replace applied one of
   two edits and left a shader calling an undefined function. **Prefer `Edit`** — it fails
   loudly when its anchor does not match.

**Verify detail actually renders.** Crop in close, or read baked texels back with
`readRenderTargetPixels`. Do not assume authored detail is drawing.

## Building a view

```js
export default async function view(args = {}) {
  const engine = await studio({ cameraPos: [0,1.2,3.2], target: [0,0.9,0], fov: 36 });
  // ... build into engine.scene ...
  engine.finalizeScene();   // wires screen-space AO into every material — REQUIRED
  engine.markReady();       // tells the harness a frame is safe to capture — REQUIRED
  engine.start();
  return engine;
}
```

`studio()` = near-white cyc, soft key/fill/rim, neutral grade — for comparing against art
sheets. `estate()` = the game's real near-black lighting.

**Composition rules — these are not optional.** A slice once landed every specified shader
change and still scored WEAK 48 because the specimen floated and the frame was cropped:
nothing floats; nothing is cropped; frame for the subject (`(height/0.8)/2/tan(fov/2)` — a
1.7 m subject at fov 33 needs ~3.5 m); no area clips to pure white; judge dark or specular
materials on a **mid-grey** ground (`bg: 0x4e535a, envIntensity: 0.62`), never the white cyc;
specimens shaped like their real use, not spheres; always include a chrome ball.

Capture is deterministic — fixed 1/60 timestep, seeded RNG. **No `Math.random()`** in
anything that renders; use `engine.rng()`. Pin an animated moment with `--extra "at=N"`.

## Measuring performance honestly

Three separate measurement bugs happened here, each producing a confident wrong number.

- **Time the GPU, not the CPU.** WebGL submits asynchronously; timing the JS render call
  measures bookkeeping. First attempt reported 908 fps on a scene costing 1.18 ms GPU.
- **Pin the tier**: `--extra "quality=medium"`. `auto` picks `high` on a discrete GPU, which
  is not the integrated target. Two agents misreported budget failures this way.
- **Cover a full cycle**: `--perfms 28000` on a looping view. A 4 s window on a 26 s loop
  measures a different scene every run — it once made the *lowest* tier look 10× slower than
  the highest.

Budget: **≤1.39 ms GPU at 1080p at medium**, being 16.67 ms ÷ 12 (this box is an RTX 3060 Ti;
the target is Intel Iris Xe class). ≤300 draw calls, ≤900k triangles for a room.

## The board

`node harness/status.mjs set <id> --round N --verdict WEAK --score 55 --owner <name> --clear-hates --hates "..." --wins "..."`

Verdicts: `NOT_BUILT` `BUILDING` `REJECT` `WEAK` `PASS` `WOWED`.
**A builder's ceiling is `PASS`. Only an agent named `critic-*` may set `WOWED`**, and a
builder must never re-score its own fix — every time that happened here, a critic overturned it.

`audit.mjs` mechanically catches: a piece scored above zero with a stub view; a verdict with no
screenshot; `WOWED` set by a non-critic; a view that no longer loads; and **stale verdicts** —
a critic judged a frame, a builder then changed it, and the score now describes something that
no longer exists. That last one silently understated the board by up to 33 points.
