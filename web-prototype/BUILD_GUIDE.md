# Run Robot Run — builder guide

Read this fully before writing code. It is the contract between a dozen agents working
in the same tree.

Project root: `C:\Users\John\Documents\Run Robot Run\web-prototype`
Locked art:   `C:\Users\John\Documents\Run Robot Run\Dev Art\` — see `ART_MANIFEST.md`
References:   `refs/` — **read `refs/REFERENCE_INDEX.md` FIRST**, then open only the
              one or two images it points you at. Opening ten images to find two costs
              ~28,000 tokens for nothing.

---

## 1. The one rule

**Everything is judged from a screenshot of the real thing running in a real browser.**
Nobody grades your code. A critic with no context loads your view, screenshots it, and
compares it blind against the Dev Art and against real Battlefield 1 / Hitman 3 /
Alien: Isolation frames. If your piece does not win that comparison it goes back.

So: run the harness constantly. Look at your own screenshots with your own eyes before
you claim anything.

```bash
node harness/shoot.mjs --view mat.marble --perf --review 1280
```

Read the `.review.png`, not the full-size one — 1280 wide costs ~1,230 tokens against
~2,765, and it is ample to judge a surface. The full-res capture still exists for the
perf gate and for close inspection when you genuinely need it.

To compare several things at once, tile them into one image instead of reading each:

```bash
node harness/sheet.mjs --glob "progress/shots/wall.*.png" --out /tmp/walls.png --cols 5
```

Output lands in `progress/shots/<id>.png`. **Read that PNG with the Read tool and look at
it.** If you did not look at the image, you do not know whether it works.

---

## 2. Layout and file ownership

```
src/
  core/engine.js          SHARED — do not edit
  post/                   SHARED — do not edit
  materials/baker.js      SHARED — do not edit
  materials/glsl-noise.js SHARED — do not edit
  views/_studio.js        SHARED — do not edit
  views/_notbuilt.js      SHARED — delete a stub when you replace it

  materials/surfaces/*.js one file per surface
  characters/*.js         unit4h.js, hunter.js
  gadgets/*.js
  world/*.js
  destruction/*.js
  lighting/*.js
  views/*.js              one file per judged piece
harness/shoot.mjs         SHARED — do not edit
harness/status.mjs        SHARED — do not edit
```

You will be told exactly which files you own. **Do not edit files owned by another
agent, and do not edit anything marked SHARED.** If a shared file genuinely blocks you,
say so in your report and work around it — do not edit it.

---

## 3. Procedural textures: the baker

There are no downloaded texture assets. Every surface is a GLSL function baked once on
the GPU into an albedo + ORM + normal set. This is why the game loads instantly and why
materials can be tuned in one place.

You write one function. It is called five times per texel (centre plus four gradient
taps) so the normal map is derived from the height *function*, not from a quantised
height buffer — that is what keeps fine detail free of terracing.

```js
import * as THREE from 'three';
import { baker } from '../baker.js';

const SURFACE = /* glsl */ `
uniform float uPlankWidth;
uniform vec3  uTint;

void surface(in vec2 uv, inout Surf s){
  float grain = fbmT(uv * vec2(4.0, 90.0), 128.0, 5, 2.0, 0.5);
  s.albedo    = uTint * (0.85 + grain * 0.3);
  s.roughness = 0.45 - grain * 0.1;
  s.metalness = 0.0;
  s.ao        = 1.0;
  s.height    = grain;          // 0..1; the normal map comes from this
}
`;

export function myWood(opts = {}) {
  return baker().standard({
    key: `wood:${JSON.stringify(opts)}`,   // MUST be unique per parameter set
    size: 1024,
    surface: SURFACE,
    heightScale: 0.05,       // relief steepness: height range / uv tile size
    normalStrength: 1.0,
    repeat: [1, 1],
    anisotropy: 8,
    uniforms: { uPlankWidth: 0.2, uTint: new THREE.Vector3(0.3, 0.2, 0.12) },
  }, {
    // anything a MeshStandardMaterial/MeshPhysicalMaterial constructor takes
    envMapIntensity: 1.0,
    normalScale: new THREE.Vector2(1, 1),
  });
}
```

`Surf` fields: `albedo` (vec3, **sRGB** — author with the hex values you actually want),
`roughness`, `metalness`, `ao`, `height` (all float 0..1).

`glsl-noise.js` is injected automatically. Available:
`hash11/12/22/33`, `vnoise`, `gnoise`, `gnoiseT(p,period)`, `fbm`, `fbmT(p,period,oct,lac,gain)`,
`ridged(p,period,oct)`, `billow`, `warp(p,period,amt,oct)`, `voronoiT(p,period)->vec3(F1,F2,id)`,
`sdBox/sdRound/sdSeg/sdEllipse`, `rot(a)`, `remap`, `sat/sat3`, `srgb2lin/lin2srgb`,
`luma`, `tri`, `pmod`, `rowGrid(uv,counts,rowOffset)`, `PI`, `TAU`.

**Always use the `…T` tileable variants** with the right `period` or your textures will
show a seam. `period` is the number of noise cells across the tile: `fbmT(uv * 8.0, 8.0, …)`.

### Texture budget
`size: 2048` costs ~16 MB of VRAM with mips. Use 2048 only for a hero surface the camera
gets close to (marble floor, wallpaper). 1024 for most. 512 for small props and anything
seen at distance. Total texture memory across the whole game must stay under 350 MB.

---

## 4. Views

One view per judged piece. It gets its own URL, boots in isolation, and must end with
`markReady()` or the harness times out.

```js
import * as THREE from 'three';
import { studio, specimenRig, roundedBox, turntable, labels } from './_studio.js';

export default async function view(args = {}) {
  const engine = await studio({
    cameraPos: [0, 1.2, 3.2],
    target: [0, 0.9, 0],
    fov: 36,
  });

  // ... build your scene into engine.scene ...

  engine.finalizeScene();   // wires screen-space AO into every material — REQUIRED
  engine.markReady();       // tells the harness a frame is safe to capture — REQUIRED
  engine.start();
  return engine;
}
```

`_studio.js` gives you:

| helper | what it does |
|---|---|
| `studio(opts)` | near-white cyc, soft key/fill/rim, neutral grade, IBL, orbit. **Use this to compare against the Dev Art sheets** — it reproduces their lighting. |
| `estate(opts)` | the game's real lighting: near-black, motivated sources, estate grade. |
| `specimenRig(engine, material)` | sphere + slab + floor + chrome ball in one material |
| `roundedBox(w,h,d,r,seg)` | rounded-box geometry with box-projected uvs |
| `turntable(engine, group, speed)` | rotates in live view, frozen in capture |
| `labels([{text,x,y}])` | DOM text overlay for sheet views, costs nothing |
| `buildStudioEnv/buildEstateEnv(renderer)` | PMREM environments |

`studio()` opts: `cameraPos`, `target`, `fov`, `bg`, `envIntensity`, `grade`,
`shadowExtent`, `cyc:false`, `orbit:false`, `seed`.

Animated views: in capture mode the clock is a fixed 1/60 step and the seed is fixed, so
the same view screenshots identically every time. Keep it that way — no `Math.random()`,
no `Date.now()`. Use `engine.rng()` (seeded) if you need randomness.

For a specific animation frame, use `--seconds N` on the harness.

---

## 4b. Specimen view composition — the rules that keep getting missed

A material can be right and the picture still fail. This happened: a walnut slice landed
all six specified shader changes and still scored WEAK 48, because the panel wall floated
above the floor with a cast shadow under it, was cropped off at the top of frame, and the
floor's specular clipped to pure white. **Everything the plan specified came out right;
everything it left unsaid came out wrong.** So these are now defaults for every view.

1. **Nothing floats.** Every specimen rests on the floor plane, or is visibly mounted to
   something that does. A wall panel meets the floor at a skirting; a slab leans or sits.
   If an object has a cast shadow with daylight between it and the shadow, it is floating.
2. **Nothing is cropped** unless you cropped it deliberately. Shoot, look at the PNG, and
   confirm every specimen is fully inside the frame with margin.
3. **Frame for the subject.** A 1.7 m subject at fov 33 needs the camera about 3.5 m back:
   `(height / 0.8) / 2 / tan(fov/2)`. Guessing this wrong is the single most common view bug
   on this project.
4. **Check your exposure.** No large area may clip to pure white — a blown specular
   highlight destroys the material underneath it and reads as a bug. Look at the render,
   not at the grade values.
5. **Judge dark materials on a mid-grey ground, not the near-white cyc.** Polished stone
   and dark wood are mostly specular; against white they reflect the cyc and the albedo
   becomes invisible. `studio({ bg: 0x4e535a, envIntensity: 0.62 })` is the working default
   — see `src/views/mat-marble.js` for the reasoning.
6. **Specimens are the shapes the material is actually used on.** A floor at floor angle,
   a wall as a wall, a moulding as a moulding. A sphere tells you about the BRDF and
   nothing about whether the surface belongs in a mansion.
7. **Always include a chrome ball**, to prove the environment is doing real work.

---

## 5. The quality bar — what "AAA" actually means here

These are the things that separate the reference frames from a hobby WebGL demo. Every
one of them is something a critic will notice:

1. **No untextured surface.** Every surface has albedo variation, roughness variation and
   a normal map. A flat-coloured plane is an instant reject.
2. **No tiling you can see.** Large-scale breakup (per-slab/per-plank variation, dirt
   gradients, wear patterns) laid over the small-scale detail. If you can spot the repeat,
   it fails.
3. **Roughness does more work than albedo.** Real surfaces differ mostly in how they
   scatter, not in colour. Dust, grease, polish wear, water staining — all roughness.
4. **Dirt obeys gravity and geometry.** Grime collects in corners, at the bottom of
   walls, in mouldings, under sills. Wear appears on edges, corners, and where hands and
   feet touch. Uniform noise dirt is worse than no dirt.
5. **Edges are never perfectly sharp.** Bevels, chamfers, rounded corners. Sharp 90°
   edges read as untextured geometry because they catch no highlight.
6. **Contact.** Objects need an AO gradient and a contact shadow where they meet.
   Anything floating kills the shot.
7. **Bounce light.** In a dark room the un-lit side of an object must still be readable
   from IBL and bounce, or it reads as a silhouette cut-out.
8. **Highlights need something to reflect.** Metal and polished stone are 90%
   environment. If the env map is wrong, the material is wrong.
9. **Scale cues.** Detail at three frequencies: what you see at 10 m, at 2 m, and at
   20 cm. Missing the 20 cm layer is the most common failure.
10. **Silhouette first.** A piece that reads wrong as a black shape will never read right
    lit.

### Wall stages, specifically
The gate is: **a critic given a cropped screenshot with no context must name the stage.**
Wallpaper, plaster, lath, beam, open air must be five unmistakably different things —
different colour, different relief, different frequency, different silhouette at the break
edge. If two stages can be confused, both fail.

---

## 6. Performance — the hard gate

**Target: 60 fps at 1920×1080 on integrated graphics, including while a wall collapses.**

The harness runs on an RTX 3060 Ti. That is roughly **12× faster** than the Intel
Iris Xe class of integrated GPU we are targeting. So the budget on this machine is:

| metric | budget on this machine | why |
|---|---|---|
| GPU ms @1080p | **≤ 1.35 ms** | 16.67 ms / 12 |
| GPU ms @3840×2160 | ≤ 5.4 ms | 4× the pixels — catches fill-rate cliffs |
| draw calls | ≤ 300 for a full room | integrated GPUs are call-bound |
| triangles | ≤ 900 k for a full room | |
| texture VRAM | ≤ 350 MB total | integrated shares system memory |

`--perf` reports `gpuMs` from a real GPU timer query, `frameMs` from the real rAF
interval, and `worstFps` from the p95. **`worstFps` is the number that matters** — an
average of 60 with a p95 of 30 is a stutter, not a pass.

Cheap wins, in order: instancing (`InstancedMesh`), fewer shadow-casting lights (one
cascade, 1024²), half-res transparency, LOD, and baking detail into textures instead of
geometry. Never add a second full-res post pass.

---

## 7. Reporting to the scoreboard

When you finish a round on a piece:

```bash
node harness/shoot.mjs --view <id> --perf
node harness/status.mjs set <id> --round 2 --verdict PASS --score 80 \
  --owner materials-agent \
  --summary "one line on what this piece now is" \
  --wins "specific thing that is now good" \
  --perf progress/shots/<id>.perf.json
```

Verdicts: `NOT_BUILT` `BUILDING` `REJECT` `WEAK` `PASS` `WOWED`.
**You may not set `WOWED` on your own work — only a critic can.** Your ceiling is `PASS`.
Be honest with `score`; an inflated score wastes a critic's round.

---

## 8. Non-negotiables

- **Match the locked art exactly.** Proportions, colours, and every named detail in
  `ART_MANIFEST.md`. "Close enough" on the shoulder caps or the pelvis discs is a reject.
- **Read the actual reference images** from `refs/` and the Dev Art PNGs with the Read
  tool. Do not work from memory of what a mansion looks like.
- **`three` is v0.180.** `THREE.SRGBColorSpace`, `outputColorSpace`,
  `scene.environmentIntensity`, `WebGLRenderTarget({count})` for MRT. No `sRGBEncoding`,
  no `outputEncoding`.
- The renderer tonemaps in the composite pass — leave `renderer.toneMapping` alone and
  do not add your own tonemapping.
- No new npm dependencies without asking.
- No `Math.random()` in anything that renders.
