# Handoff — the generated hunter (2026-08-21)

**The one-line state:** the hunter now runs through the same pipeline as the player — generated
body, Meshy auto-rig, baked clips — end to end and in the game behind `?meshhunter=1`, but **the
three stage bodies have not been generated yet**, so all three currently run on the player's body
with the stage's grime on it and say so out loud in every frame and every log line.

Nothing here has been judged by John. Nothing here is on by default.

---

## Why this exists

On 2026-08-19 the player became the generated robot: `?mesh=0` is the revert, `friendly_all38.glb`
is the body, and `game.play` renders 15,864 triangles of Meshy character with 38 clips on it.

The hunter did not come with it, and that broke the design's central claim. The hunter is *the
player's own chassis, corrupted* — `hunter.js` is built out of `buildUnit4H` for exactly that
reason, and every horror beat in `docs/design/` rests on it. Since that ship date the two have
been different characters made different ways, and no capture in the project shows them together.

`hunter.mesh` is that capture, and this is the code behind it.

---

## What was built

| file | what it is |
|---|---|
| `src/characters/mesh-hunter.js` | the adapter — the hunter's half of `mesh-avatar.js` |
| `src/views/hunter-mesh.js` | `hunter.mesh`: player + three stages, one ground line, one rig |
| `tools/meshy-hunter-batch.mjs` | text→3D + auto-rig for the three bodies, resumable |
| `harness/meshhunter-probe.mjs` | the gate — `npm run gate:mesh-hunter` |
| `HUNTERMESH.bat` / `MESHYHUNT.bat` | look at it / generate it |
| `src/game/hunter-ai.js` | takes `o.rigs`; `_animate` branches on a clip-driven body |
| `src/views/game.js` | `?meshhunter=1`, awaited before the AI is constructed |

### The rig is borrowed, and that is the whole trick

Every Meshy auto-rig of a humanoid comes out with the same 26-node skeleton. That was verified
once before (`player-pipeline.md`, playing the Lumi Bot's clips on the Friendly Robot) and it is
re-checked on every load now: `assertRigCompatible` walks the clip tracks, resolves each bone by
name, and throws with both lists if one is missing. Measured on the shipped body: **24 bones
driven, 38 clips available.**

So the hunter needs no clip set of its own. `tools/meshy-hunter-batch.mjs --animate` can attach
one, and it is off by default because it buys nothing while the rigs agree.

The clip vocabulary is deliberately small: `Alert` for idle (a hunter standing still is
listening, not resting), `Walking`, `Running`, `Attack` for the strike, `Arise` for the growth,
`Sit_on_Chair_Arms_Crossed` for the rider.

### Stage differences that are code, not geometry

- **The grime ramp** reads `HUNTER_STAGES[stage].shell` — the same authored table the procedural
  hunter reads, so the two cannot drift.
- **The stolen torso** at stage 3 is a `SkeletonUtils.clone` of the same body at 0.50, folded up
  by a seated clip and attached to the spine, with its own cleaner material. Same asset on
  purpose: sixteen rounds of `hunter.3` critique say the family resemblance is what decides that
  shot.
- **The slit eyes** are two emissive quads placed off the rig's own `Head` / `head_end` /
  `headfront` landmarks, in a material named `hunter.faceplate` so `HunterAI._setEyeDrive`
  throbs them with awareness — no change to the AI.

### What is NOT in it, and is named in the code

`mesh-hunter.js` publishes a `pending` list per stage and `hunter.mesh` prints it:

- the generated stage bodies themselves (all three are the player's body standing in)
- stage 2's torn shoulder port
- stage 3's four grafted arms and chest wire looms
- **the scan.** On the procedural body the player can watch the hunter *look* — `_scanStep`'s
  sense-cone offset goes through the neck and head. A baked clip cannot know where the hunter is
  looking, so this is lost on the mesh path. It is the first thing to fix and it needs a clip,
  not code.

---

## Measured, by `npm run gate:mesh-hunter`

```
stage 1/2/3   anim/friendly_all38.glb  [STAND-IN]
              15864 tris · 38 clips · 24 bones driven · (stage 3: + rider)
              height 1.700 m, feet at 0.0000
              hand swing 0.374 m · foot swing 0.557 m over a second of walk
game.play?meshhunter=1 — driving the GENERATED bodies at stage 1

grime ramp (mean luminance, as a ratio of the player standing beside it)
  player   x1.000      stage 1  x0.920      stage 2  x0.877      stage 3  x0.828
  art sheet, for comparison:    1.000       0.739                0.649
```

Monotonic with real gaps, and **shallower than the art**. The remaining depth is texture work —
soot mottling, rust bleed at the seams, welded scar plates — which belongs in the generated
bodies' albedo, not in a uniform multiply. The prompts ask for all three.

---

## 🚨 Five traps this slice paid for. Each printed a plausible number while being wrong.

**1. `Box3.setFromObject` is wrong on a skinned mesh, and it fails silently.** It expands by the
geometry's bind-pose bounds — a T-pose, nearly a metre wider than the character ever renders.
It spaced the row for figures that do not exist, then made the probe grade each figure inside a
box overlapping its neighbours: stage 1 came back measured on **9,991 pixels of its own outer
half** against the player's 44,319 of whole body, and the ramp read flat off bodies that were
fine. `posedBox()` in `hunter-mesh.js` expands over the BONES instead.

**2. `Material.clone()` copies `userData` and drops `onBeforeCompile`.** So a cloned body arrives
with `metalness = 1` from `chromeDarkPanels` and without the shader that pulls it back to 0 per
pixel — a fully metallic robot, with almost no diffuse for an albedo tint to act on — while
`userData.rrwChromed` still claims the treatment is installed, so re-applying it silently
no-ops. Clear the flag, then re-apply.

**3. `patchForScreenAO` sets EVERY material's `customProgramCacheKey` to one constant.** That is
right for its own purpose and fatal for a per-material shader injection: three.js resolves the
program by that key, so the first material compiled wins and every later material renders **the
first one's shader**. Here the first was the clean player's, so three tinted hunters drew through
a program with no tint in it — ramp 1.000 / 0.992 / 0.988 / 0.983 off tints of 0.867 / 0.788 /
0.700. Call `patchForScreenAO` yourself, *then* claim a distinct key.

**4. An albedo multiply barely moves a body that is mostly metal.** The textbook place for grime
is `diffuseColor`, and it moved the ramp by 2–5% because a metal has no diffuse term. The grime
now multiplies the OUTGOING RADIANCE (`<opaque_fragment>`), raised to `?grimegamma=` 2.2 because
the multiply lands in linear light and the ratio is graded on the sRGB frame.

**5. `page.waitForFunction(fn, { timeout })` puts the options in the ARGUMENT slot.** The
signature is `(fn, arg, options)`. The timeout stayed at Playwright's 30 s default — under half
of what `game.play` needs to compile shaders cold — and the failure is a bare timeout that says
nothing about the view.

And one that is not a bug but reads like one: **a missing body does not 404.** Vite's dev server
answers an unknown path under `/models/` with **200 `text/html`** under its SPA fallback, so a
resolver that trusts the status code reports all three bodies present and hands three HTML files
to the GLTF loader. Check the content type.

---

## Next, in order

1. **Run `MESHYHUNT.bat`.** Everything downstream is waiting on the three bodies, and the loader
   picks them up with no code change. Look hard at the preview thumbnails it prints — that is
   the moment the result is decided, and regenerating costs pennies.
2. **Look at `hunter.mesh` with `?proc=1`**, which puts the procedural stages in the same row.
   That is the A/B that decides whether this pipeline is an improvement, and it is a look call,
   so it is John's.
3. **The scan.** Generate a head-turn clip, or drive the neck bone additively on top of the clip
   — the second is cheaper and is the kind of one-bone override that does NOT re-open the split
   rig John rejected for the player.
4. Stage 2's socket and stage 3's arms, if the generated bodies do not carry them convincingly.
   Both are asked for in the prompts; the prompt is the cheap place to fix them.
