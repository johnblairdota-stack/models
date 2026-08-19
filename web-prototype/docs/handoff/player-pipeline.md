# Handoff — the generated player, state of play

**This is the light one.** `docs/handoff/mesh-pipeline.md` has the full archaeology; read it only
when something here surprises you.

---

## What the player is now

A generated, Meshy auto-rigged, skinned character. **10,378 tris** of a 60k budget, 24-joint
humanoid rig, one file with **15 clips**: `public/models/anim/player_unwrapped.glb`.

It has been re-unwrapped (`tools/unwrap_player.py`, world-axis cube projection) so uv density is
uniform — 2.06 m per uv unit at a p75/p25 spread of 1.094.

- **In the game:** `?mesh=1` on `game.play`, or double-click **`PLAYMESH.bat`**. Without the flag
  the old procedural robot is bit-identical.
- **For judging:** `mesh.animated` — `?solo=1&clip=merged&anim=<name>&azim=<deg>`

## The two documents that govern the look

| file | what it is |
|---|---|
| `docs/design/player-material-spec.md` | **John's art direction. The authority.** Where a measurement disagrees with it, it wins. Three entries carry ⚠️ corrections — read those, they record what was misread. |
| `docs/design/player-fine-detail-plan.md` | The agreed mechanism for detail finer than a bone, and what each remaining item costs. |

## Knobs that matter

    ?azim=0 / 90 / -90 / 180     front / left / right / back — turns the SUBJECT under fixed lights
    ?clip=merged&anim=<name>     picks one of the 15 clips by name
    ?solo=1                      drops the procedural robot beside it (ESSENTIAL — see traps)
    ?bg=ff00ff                   flat chroma, for exact masking
    ?meshseams=0/1               the baked panel grid — OFF by default, John's call
    ?darklimb=0                  full revert of the material families
    ?meshlight=0                 full revert of the relight
    ?dlring=0                    full revert of the JOINT CREASES
    ?dlringctl=1                 THE FRAME CONTROL — every joint feature moves to mid-bone
    ?dlringw0= ?dlringw1=        crease half-width in metres, solid / gone
    ?dljoint=0                   full revert of the CHROME CAPS at elbow and knee
    ?dlcalf=0                    full revert of the chrome CALF PANEL
    ?dlcalf=-1                   THE FORWARD-AXIS CONTROL — panels the SHIN instead
    ?dlridge=0  ?dlridgep=       the waist FLEXION RIDGES, and their pitch in metres
    ?dlvent=0                    the head's ventilation panel and slots
    ?dlwrist=0                   the two chrome wrist rings
    ?fixmax=0.01                 THE KIT CONTROL — every fixture ray is rejected and the view THROWS
    ?grip= ?griplen=             hammer roll and grip position

**Every feature above reverts on its own, and `harness/_fd2-ring.mjs` is the bone rule's gate:
32 pass, exactly 3 controls that must fail.**

## Where the surface got to

Measured against the art, front elevation, full-res:

| | now | art |
|---|---|---|
| chrome value spread | 166.6 | 163.9 |
| chrome warmth R−B | 9 | 9 |
| white forearm | 189.3 | — |
| head dark fraction | 6.5–11.9% | 7.1–10.9% |
| dark speckle per 1k | 5.7–9.2 | 3.4 |
| foot / shin | 1.151 | 1.027 |

Materials are a **per-bone family vector** in `src/materials/surfaces/robot.js` — white / chrome /
dark / rubber, resolved by bone name per draw. The skeleton is the only frame that knows what a
forearm is: this GLB is one mesh, one primitive, **zero material slots**.

`aBoneLocal` / `aBoneId` now ship on all 14,218 skinned vertices (`attachBoneLocal` in
`mesh-avatar.js`, called from both the avatar and `mesh.animated`). That is what every remaining
fine-detail item is indexed by — "3 cm below the elbow" is `dot(aBoneLocal, axis) in [0.02, 0.04]`.

## The 60k rebuild — high-poly reduced, detail baked (2026-08-18)

**John's call, and it redirects the previous session's plan:** the budget is **60k**, so the 15k
Smart Topology asset is not the answer. The route is **our own reduction of the 1.96M High Detail
generation down to 60k**, with the detail the reduction throws away put back as a normal map baked
from that same 1.96M. Geometry carries the silhouette; the map carries the panel lines.

**The two Meshy downloads are on disk and verified in Blender, not trusted from the web UI:**

| file | verts | tris | uvs | rig | md5 |
|---|---|---|---|---|---|
| `assets/highpoly/hp_source.glb` | 979,674 | **1,960,264** | none | none | `03ee9cfc99284348d685ee5f7c6d47b9` |
| `assets/highpoly/smarttopo15k.glb` | 8,348 | 15,864 | none | none | `9439f283cff628b2188d7664227c9fe1` |

Both are **bare geometry** — no uvs, no materials, no textures, no skeleton. Rigging is still ahead.

⚠️ **Which high-poly, and why.** Three ~1.9M generations existed and the previous session's phrase
"the High Detail winner" was never actually adjudicated anywhere. All three were rendered and
compared; `hp_source.glb` is the **1,960,264** one (third `Friendly Robot` group in the Meshy
panel), chosen because it has the deepest panel gaps, a real chest plate, plated thighs and shins
and a defined visor edge. The other two: 1,976,372 (`Friendly Futurist`, best hands but a smooth
torso and a plain helmet) and 1,948,852 (softest, least detail). A normal map only carries what the
high-poly actually has, so the crispest one wins.

**`tools/bake_normals.py` does the whole reduction and bake.** One run, 41 s:

    blender -b --factory-startup --python tools/bake_normals.py -- \
        --high assets/highpoly/hp_source.glb --out assets/highpoly/player60k \
        --target 60000 --size 2048

Output: `player60k.glb` (**exactly 60,000 tris**, 29,542 verts, smart-projected uvs spanning
0.991 x 0.984) and `player60k_normal.png` (2048², tangent space). `tools/_bake_look.py` renders the
three-way comparison into `assets/highpoly/look/`.

🚨 **THE GATE IS `written%`, AND THE TWO OBVIOUS GATES WERE BOTH MEASURED WRONG FIRST.** Both arms
were run at both resolutions before any threshold was chosen:

| arm | size | mean(all) | mean(written) | written% |
|---|---|---|---|---|
| real | 256 | 0.1351 | 0.1784 | **75.5** |
| flat control | 256 | 0.0896 | 0.5544 | 15.9 |
| real | 2048 | 0.0848 | 0.1992 | **42.0** |
| flat control | 2048 | 0.0520 | 0.5963 | 8.4 |

- **An area fraction over a fixed epsilon fails.** The real bake reads 18.31% over eps 0.20 at
  256 px but **11.03% at 2048 px** — detail lives on edges and edges are a shrinking share of area
  as resolution rises, so the same asset passes or fails on `--size` alone. This was watched
  happening: the first 2048 run of a known-good bake **failed its own gate**.
- **`mean(all)` fails less obviously.** real@2048 is 0.0848 while flat@256 is 0.0896, so the
  control **outscores** the real bake across resolutions and no single threshold labels both right.
- **`written%` separates ~5x in the same direction at both resolutions.** Gate 30%. Proven at 256
  and 2048, **not proven above 2048**.
- `mean(written)` is reported, not gated: it is the seam-garbage tell. The control's written pixels
  are almost all UV-island border garbage averaging 0.55–0.60; a real bake averages 0.18–0.20. A
  future run showing high `written%` **with** `mean(written)` near 0.55 would be seams, not detail,
  and the gate would not catch it. A second assertion fires above 0.45.

**Controls, each watched failing at 2048:** `--control-notarget` skips the reduction (exit 2);
`--control-nouv` skips the unwrap (exit 3); `--control-flatbake` bakes a co-located COPY of the low
onto the low (exit 4, written 8.4%).

⚠️ **`--control-flatbake` found a trap worth more than the control: Blender exits 0 after an
uncaught Python exception.** The first version pointed the bake source at `low` itself, which
selected-to-active rejects with "No valid selected objects" — and the run reported **EXIT=0**, i.e.
a crashed bake looked like a successful one to any caller. Both scripts now wrap `main()` and exit 9
on any traceback. **Any Blender tool added here needs that wrapper.**

⚠️ **`_bake_look.py` wrote three EMPTY frames and reported three successful renders**, because
hand-rolled `rotation_euler` aiming was wrong. Aiming is now a `TRACK_TO` constraint and every shot
asserts the subject fills ≥5% of frame. **That assertion was then also wrong in the more dangerous
way — it passed for the wrong reason**, comparing pixels against the background *colour* and reading
100.0% on all three frames, because the view transform lifts a 0.05 background to mid grey before it
reaches the file. It now counts **alpha** with `film_transparent`, reads 15.8%, and a control that
pulls the camera to 400x distance fails at 0.00% (exit 9).

**By eye, against the 1.96M reference:** the map restores the chest-plate edges, waist band, knee
actuators, shin plates and head seam that the bare 60k loses to faceting. ⚠️ **It carries visible
speckle on the arms and thighs** that the reference does not have — bake noise, not yet tuned.
`--samples`, `--extrusion` (0.01 m) and `--raydist` (0.03 m) are the knobs.

🚨 **THE 15k SMART TOPOLOGY ASSET CANNOT RECEIVE THIS BAKE. IT IS A DIFFERENT ROBOT.** John asked
for it to be the low-poly; it was measured before any bake was attempted, and the measurement is
decisive. `tools/_bake_align.py` aligns centres and height and then reports the distance from a
sample of low-poly points to the nearest high-poly surface:

| low-poly | p50 | p90 | p95 | max | verdict |
|---|---|---|---|---|---|
| `smarttopo15k.glb` | 30.6 mm | 215.8 mm | **226.2 mm (11.89% of height)** | 246.2 mm | NOT A PAIR |
| `remesh_quad.glb` | 0.9 mm | 3.0 mm | **3.7 mm (0.19% of height)** | 6.6 mm | **PAIR** |

The 15k was generated from the image **independently**, so it is a different character: arms hanging
at the sides instead of out at ~45° (bbox x/z **0.448** against the high-poly's **0.687**), a larger
head, no chest plate, and almost no panel detail. Rendered at
`assets/highpoly/look/4_smarttopo15k.png`. **No cage setting reaches 226 mm** — the bake would paint
arm detail onto empty space. `smarttopo15k.glb` stays on disk but is not a low-poly for this
high-poly.

✅ **MESHY'S OWN REMESH IS THE ANSWER, AND IT IS FREE.** With the high-poly selected, the toolbar's
**Remesh** offers Fixed/Adaptive target polycount (Custom / 3K / 10K / 30K / 100K) and **Quad or
Triangle** topology, for **0 credits**, in about three minutes. It retopologises **that asset**, so
shape and pose match by construction — which is exactly what the 15k could not do.

Run at **30K Fixed / Quad** → `assets/highpoly/remesh_quad.glb`, **32,722 quads / 32,552 verts**,
which imports as **65,336 tris, 47,891 verts, and it already carries a `UVMap`**. That is clean quad
topology at the 60k budget: what John wanted from Smart Topology, on the right body.

**This beats our own Blender decimation on every measure**, same high-poly, same 2048 map:

| low-poly | tris | topology | uvs | written% | mean(written) | bake |
|---|---|---|---|---|---|---|
| `player60k.glb` (our decimate) | 60,000 | triangle soup | smart-project | 42.0 | 0.1992 | 41 s |
| **`player_quad65k.glb` (Meshy remesh)** | **65,336** | **quad** | **Meshy's own** | **73.9** | **0.1450** | **9 s** |

Higher `written%` because Meshy's UV layout packs the square far better than smart-project; lower
`mean(written)` means less of the map is seam garbage. By eye the panel lines are sharper and the
speckle is reduced, though **not gone** — the upper arms and elbows still carry it.

    blender -b --factory-startup --python tools/bake_normals.py -- \
        --high assets/highpoly/hp_source.glb --low assets/highpoly/remesh_quad.glb \
        --out assets/highpoly/player_quad65k --size 2048

⚠️ **`--low` skips the decimation and KEEPS the supplied uv layer.** Always run `_bake_align.py`
first on any new low-poly — the 15k proves a plausible-looking asset can be 226 mm away.
`--control-nouv` (exit 3) and `--control-flatbake` (exit 4, written 6.5%) were both re-watched
failing on the `--low` path; `--control-notarget` does not apply there.

✅ **JOHN TEXTURED THE 15k AND APPROVED IT BY EYE (2026-08-18). IT IS A COMPLETE ASSET AND THE BAKE
IS REDUNDANT FOR IT.** `assets/highpoly/player15k_textured.glb` — **15,864 tris, 11,671 verts**
(up from the untextured 8,348: uv seams split them), one `UVMap`, one material, and **three 2048
maps that Meshy generated: base_color, metallic_roughness AND normal**. He is the taste authority
and he has looked at it lit; that settles the choice.

⚠️ **All three maps were verified to carry data rather than merely exist** (`tools/_tex_probe.py`) —
a present-but-flat normal map looks identical to a working one in every file listing:

| map | measure | |
|---|---|---|
| base_color | 91.8% non-uniform | real |
| metallic_roughness | 60.9% non-uniform | real |
| normal | 79.5% written | real |

🚨 **BUT MESHY'S NORMAL MAP IS BROAD AND SHALLOW, AND THAT IS THE ONE NUMBER TO KNOW.** Its
`mean(written)` is **0.0191** against the high-poly bake's **0.1450** — the same statistic, **7.6x
weaker**. It is derived from the texture, not from geometry, so it carries fine surface feel and
**not panel-gap depth**. If the flatness or the FACETING complaint returns, that is the knob:
`tools/bake_normals.py` can bake real panel depth, but only from a high-poly that PAIRS — and the
1.96M does not pair with this body (226 mm, above). It would need its own Remesh-based pair.

⚠️ `_tex_probe.py` gated on `img.has_data` at first, which reads **False** for a packed GLB until
the pixel buffer is touched. It skipped every image, printed nothing, and **exited 0** — the same
success-shaped-silence class as the Blender traceback above. It now reads pixels directly and exits
2 when a file has no textures.

✅ **RIGGED, AND IN THE GAME AS `char.lineup` (2026-08-19).** John: "you rig it. and get it in game
in a slice with each robot we have built in iteration so far."

**The rig.** Meshy Animate → Rig, Humanoid, 1.7 m. **24 bones**, same count as the Lumi Bot's.
⚠️ **The auto-placed GROIN marker sat on the belly plate, well above where the legs split** — Meshy's
own reference art puts it ~16% of body height below the elbows and the auto-placement had it at
2.3%. It was dragged to the crotch before confirming. Export needs **Rigged Character toggled ON**;
it is **OFF by default** and that download is the mesh with no skeleton.

Landed in `public/models/anim/`: `friendly_rigged.glb` (24 bones, `char1` 11,691 verts / 15,864
tris), plus `friendly_walking.glb` and `friendly_running.glb`, which the rig shipped for free.

🚨 **THE RIG EXPORT DROPPED TWO OF THE THREE TEXTURE MAPS.** `player15k_textured.glb` carries
base_color + metallic_roughness + normal; `friendly_rigged.glb` carries **`texture_0` only** — the
base colour. The normal map that made the untextured-vs-textured argument above is **not in the
rigged file**. Re-attaching it means loading it beside the GLB and assigning by UV; the UV layout
survived (both have one `UVMap`) but the vertex count moved 11,671 → 11,691, so verify rather than
assume. **Not done.**

⚠️ Meshy's rig export also ships a stray **`Icosphere` (42 verts, 80 tris)** beside the body.
`char-lineup.js` strips it by name and logs how many it dropped.

**The slice: `char.lineup`** — `src/views/char-lineup.js`, registered in `views.js`, captured by
`harness/_lineup_shot.mjs`. Three robots, one ground line, one light rig, all normalised to 1.7 m:

| | tris | surface |
|---|---|---|
| UNIT-4H — hand-built | 56,308 | procedural GPU-baked shell |
| Lumi Bot — generated #1 | 10,378 | per-bone families + identity kit |
| Friendly Robot — generated #2 | 15,864 | Meshy baked texture |

`?names=1` labels them (off by default, for the identification gate). `?all=1` appends
`player_unwrapped` / `player_smooth` / `player_bf65` — deliberately NOT in the default row, because
they are the same Lumi Bot body and four near-identical figures would make the frame look thorough
while hiding the only comparison that matters.

🚨 **THE FIRST CAPTURE WAS A RIGGED COMPARISON AND IT LOOKED LIKE A RESULT.** The Lumi Bot stood
between two finished robots **blank, glossy and faceless**, and read as obviously the worst. That
was this view's bug: its ears, faceplate, wordmark, neck column and mint caps are **not in the
GLB** — they are kit geometry `mesh-identity.js` skins on at load, which `game.play` and
`mesh.animated` both do and this view did not. `attachIdentity` is now called on any untextured
body while it is still at the origin.

🚨 **AND THE HARNESS REPORTED `OK` ON A PHOTOGRAPH OF THE LOADING SCREEN.** Three failures stacked:

1. `char-lineup.js` never called **`engine.markReady()`**, so nothing could distinguish "still
   baking" from "finished". A view that does not declare itself ready makes every capture a guess.
2. The probe waited on a **6 s timer**. The app's own splash says the first load takes 25–30 s.
3. The ink test compared every pixel against a **hardcoded light grey** and read **100% subject**
   on a dark splash — the project's documented gradient-background trap, hit for the third time.

🚨 **AND THEN THE PROBE HUNG FOR TWENTY MINUTES ON A PAGE THAT WAS ALREADY READY. TWO CAUSES,
BOTH WORTH KNOWING BEFORE WRITING ANY NEW HARNESS SCRIPT:**

1. **`chromium.launch()` with no args falls back to SOFTWARE rendering**, and this project's
   surfaces are GPU-baked at load. The house probes all pass
   `['--use-angle=d3d11', '--ignore-gpu-blocklist', '--force-device-scale-factor=1']`. Without
   them the same scene never finished; with them it is ready in ~7 s.
2. **`__rrr.settle(n)` IS A CAPTURE-MODE FACILITY AND NEEDS `capture=1` IN THE URL.** The
   deterministic `_captureLoop` is what counts settle targets down; under the ordinary loop
   `settle()` never resolves. This was measured rather than guessed — with the view ready, rAF
   was ticking at **59.3/sec** and `settle(12)` still never returned, which rules out the
   throttled-rAF explanation that the symptom otherwise fits exactly.

⚠️ **A THIRD DEAD END: DO NOT COUNT FIGURES FROM PIXELS.** The probe's ink test reported **one
figure for three**, twice, for two different reasons — first a hardcoded background colour against
a gradient, then a per-row reference sampled from the frame edge while a robot was sitting on that
edge. It now reads placement from the SCENE: `char-lineup.js` projects each figure's bounding box
to NDC, publishes `window.__lineup`, and the probe asserts one entry per roster slot, all inside
[-1, 1], none overlapping. `ink.frac` survives only as a "the frame is not blank" check.
`fitCamera`'s margin went 1.16 → **1.42**, because at 1.16 the row touched the frame edge — which
cropped the third robot AND was what broke the metric.

**Controls, watched failing:** `?missing=1` (`--control-missing`) points the last roster entry at
a file that does not exist → the view errors during load, probe **exit 9**, no screenshot written.
⚠️ The probe originally recorded that error and carried on into `settle()`, which then hung
forever — a failed view never calls `engine.start()`. It now bails immediately, so the control
fails fast instead of looking like a timeout.

**Green run:** `placement: unit4h[-0.62,-0.26] lumi[-0.18,0.17] friendly[0.22,0.62]`, subject 38.1%
of frame, exit 0.

✅ **WIRED AS THE SHIP POINTER, PANELS CHROMED, WORDMARK ON (2026-08-19).** John: "wire the new
model with the rigs and fix the dark grey panels for chrome like the art and add the 4Humanity
chest logo."

**`mesh-avatar.js`'s `PLAYER_BODY` is now `friendly_merged.glb`.** `?player=player_norm30.glb` is
the full revert to the Lumi Bot, which keeps every clip.

**The clips transfer because the rigs are identical, and that was verified, not hoped.**
`tools/_rig_compare.py`: all **24 bone names shared, same parent for every one**. Meshy's biped
auto-rig is standardised. `tools/merge_clips.py` builds the merged file and **refuses to write one
if that ever stops being true** — copying actions between skeletons that merely share a bone COUNT
gives a body that animates confidently and wrongly. Controls watched failing: `--control-mismatch`
renames a bone (exit 2), `--control-noclips` drops the source actions (exit 3).

⚠️ **`mesh-avatar.js` USED TO OVERWRITE EVERY BODY'S MATERIAL WITH THE WHITE SHELL.** That was
right while the only body was the Lumi Bot — one primitive, zero material slots, nothing to
overwrite. The Friendly Robot arrives textured, and it is textured that John approved. It now keeps
its map; `?meshbaked=0` forces the old behaviour as the A/B.

**Dark panels → chrome: `chromeDarkPanels()` in `mesh-avatar.js`.** The panels are shapes WITHIN
the torso, thigh and shin, so `uRRWFamW`'s per-bone vector cannot select them — the mask is the
baked map's own luminance, read off the sampled texel after `<map_fragment>`.

- ⚠️ **A LUMINANCE-ONLY MASK ATE THE BLUE FACE.** It is dark, so it chromed, and the robot lost its
  eyes. The mask is now gated on **saturation too**: chrome is dark AND near-grey, which spares the
  face and the mint caps without knowing where either is in UV space.
- ⚠️ **RAISING METALNESS ALONE MAKES DARK PANELS WORSE.** A metal with near-black albedo reflects
  almost nothing and renders blacker than the paint it replaced. The albedo must be LIFTED. First
  pass used `chromelift 0.62` and washed the whole figure out; shipping at **0.44**.
- Live knobs: `?chromelo=` `?chromehi=` `?chromerough=` `?chromelift=` `?chromesat=`.
  **`?chrome=0` is the full revert** to Meshy's texture as shipped.

**The wordmark: `attachChestWordmark()` in `mesh-identity.js`.** 🚨 **THE OBVIOUS ROUTE WAS BUILT AND
IT DOES NOT WORK** — "run `attachIdentity`, delete the parts you did not want" throws long before it
reaches the wordmark: *"shoulder cap ray at swing 54deg hit 0.611 m from the arm joint — that is the
torso, not the shoulder."* The assertion is CORRECT: the cap is sized for the Lumi Bot's
proportions and this is a different body. Loosening it would have traded a loud failure for a wrong
shoulder cap on the old body. The new function reproduces only the measurement setup
`attachWordmark` consumes and shares the seating function rather than a copy.

⚠️ **The full kit is still the right path for the Lumi Bot** and is what it gets; only a body with
`material.map` takes the wordmark-only path (`baked ? attachWordmarkOnly : attachIdentity`).

⚠️ **`harness/lint-glsl.mjs` FAILS THE BUILD FOR A BACKTICK ON A LINE CARRYING GLSL.** The chrome
injection was written as chained `.replace('x', \`glsl\`)` and broke the build. Shader strings are
now named consts that close on their own line.

**Not done:** the 60k/65k meshes are still unrigged and now superseded; the rig export's **lost
normal and metallic-roughness maps** are still lost, so the chrome is doing its work off the base
colour alone. **John has still not PLAYED it** — `char.lineup` is a still. Rigging, the 23 sitting clips, and `unwrap_player.py` / `smooth_normals.py` all still sit
ahead. **`player_norm30.glb` is still the ship pointer** — nothing here has changed what the game
loads. ⚠️ 10 credits were spent somewhere in this session's Meshy clicking (4,025 → 4,015); Remesh
itself billed 0.

## Next up

1. ✅ **The JOINT CREASES are built (2026-08-16)** — the spec's five "dark ring ... in a crease"
   lines: elbow, knee and ankle actuator rings, plus the hip and shoulder detach creases, which are
   stronger because the spec says "much darker" on those two lines and no others.
   `harness/_fd2-ring.mjs` is the rule's gate (13 pass / 2 controls that must fail); `?dlringctl=1`
   is the FRAME's control and it is a picture, not an assertion — a ring at a wrong distance still
   renders as a ring, so the rule gate cannot see that half.

   Measured whole-figure against `baseline_front`, `harness/_kit8_shellvalue.mjs` on a `?bg=ff00ff`
   shot, neutrality cut 45 (⚠️ **the chroma shot is not optional — on the default gradient
   background the mask takes 86% of the frame and every number is meaningless**):

   | | ring off | ring on | ART |
   |---|---|---|---|
   | value spread | 145.4 | 153.4 | 158.5 |
   | dark<90 | 7.30% | 9.05% | 14.08% |
   | seam density @8 | 14.59 | 15.06 | 18.17 |
   | seam density @14 | 9.11 | 9.53 | 12.24 |
   | facet energy | 11.61 | 11.73 | 9.55 |

   Every row moves toward the art and holds its direction across all five neutrality cuts, except
   **facet energy, which moves 0.12 AWAY** and disagrees with itself at cut 12 (10.89 → 10.87). The
   seam-density gap that remains is the rest of the fine-detail list, not these creases.

2. ✅ **The CHROME JOINT CAPS, the CALF PANEL and the WAIST FLEXION RIDGES are built
   (2026-08-16)** — three more spec lines off the same attribute. Caps ride `uRRWBoneDet`'s spare
   two channels; the two panel features needed their own `uRRWBonePan`, because a joint feature is
   continuous across the two bones that meet there and a belly-of-the-bone feature is not.

   ⚠️ **The calf panel and the ridges are BACK-facing, and `_kit8_shellvalue.mjs` was hardcoded to
   `baseline_front`** — it measured both at exactly zero on every column of every cut, correctly,
   and that table reads as "the feature does nothing". It now takes the reference as argument 2.
   Measured against `baseline_back`, cut 45:

   | | panels off | panels on | ART back |
   |---|---|---|---|
   | value spread | 156.6 | 165.1 | 163.6 |
   | dark<90 | 10.48% | 12.94% | 14.11% |
   | seam density @8 | 14.25 | **16.53** | 16.42 |
   | seam density @14 | 8.88 | **10.73** | 10.85 |
   | seam density @20 | 5.72 | **7.20** | 7.10 |
   | facet energy | 11.32 | 12.42 | 8.56 |

   **Seam density lands ON the art at three of four trough depths** and value spread within 1.5.
   ⚠️ **Facet energy costs 1.10 and it is the CALF PANEL, not the ridges** — split by A/B, the
   panel is 0.94 of it and the ridges 0.16. It is chrome revealing the tessellation on a coarse
   shin, i.e. the same trade already accepted for the upper arm and the waist girdle, not a new
   defect class. ⚠️ `dark<120` was already OVER the art on the back (27.15 vs 25.26) and this
   round takes it further over, to 29.84.

   The forward axis both features need is derived from the **toes** (`rrwFwdAxis`), not from
   `cross(up, left)` whose sign is a coin flip. `?dlcalf=-1` is the control and it fires: 0.802%
   of pixels differ.

3. ✅ **The TWO WRIST RINGS and the HEAD VENTILATION are built (2026-08-16).** Both ride
   `uRRWBonePan`'s shared channels: the PANEL channel's SIGN picks the calf window or the head's,
   and the STRIPE channel carries a per-bone PITCH so the waist girdle and the head's slots use
   one varying at two different pitches. Back at cut 45, seam density @14 is **10.86 against the
   art's 10.85**; @8 is 16.74 against 16.42, now marginally over.

   ⚠️ **TWO DEFECTS IN THIS ROUND, AND BOTH ARE THE KIND ONLY A PICTURE CATCHES.**
   - `uRRWVent` was declared on the VERTEX side and used on the FRAGMENT side. The program failed
     to compile, three dropped **every draw using the shell material**, and the harness reported
     `1/1 captured` over a frame with **no body in it** — the ear rings and the visor, which are
     different materials, drew normally. Nothing in the build, the lint or the capture said a
     word. **A missing declaration is a silent whole-material delete on this pipeline.**
   - The wrist distance was `abs()`, so each of the two authored ring positions drew on BOTH
     sides of the joint: **four rings for a spec line that says two**. Signed — positive on the
     forearm, negative on the hand — is continuous through zero at the wrist and draws two.
     ⚠️ The 1000 sentinel's SIGN is load-bearing with it: every bone on the hand chain, fingers
     included, must carry the hand's sign or its sentinel interpolates UP through both ring
     positions across the knuckles.

4. ✅ **THE EAR IS BUILT AND HAS NOW BEEN SEEN** — shot at `?azim=-90`, it is a chrome ring with a
   lighter disc centre, which is what the spec asks for. `player-material-spec.md`'s "currently a
   solid chrome disc with a dark torus" was a stale STATUS note and is corrected there. This item
   is closed.

5. ✅ **The JOINT FIXTURES are built (2026-08-16), and `player-fine-detail-plan.md` is now
   COMPLETE — every item on both its lists has shipped.** Twelve parts in `mesh-identity.js`: two
   white shoulder-cap fixtures, an outer and an inner elbow actuator, a posterior knee actuator
   and an ankle-crease actuator, on each side. All seated by **raycast**, never by a bone-local
   offset — this file already records what one of those cost when someone read the arm bone's +Y
   as "up" and pushed the mint cap down the bicep.

   ⚠️ **THREE DEFECTS, EACH FOUND BY LOOKING AND NONE BY A NUMBER.**
   - **The ray fired from `reach` away crossed the whole body.** `castAt` returns the FIRST hit, so
     the inner-elbow ray started on the far side of the character and struck the OPPOSITE FLANK of
     the torso. Two chrome bosses floated in mid-air beside the chest — and nothing threw, because
     the raycast succeeded and the fixture count reached 12. Fixed with a short standoff that grows
     only if it must, plus a **maximum distance from the joint**: a surface further away than a
     limb is thick is by construction the wrong surface, and rejecting it turns a floating blob
     into a count failure someone reads.
   - **The shoulder fixtures were buried.** `shoulderCap` stands its shell `headW * 0.014` off the
     body, and the fixtures stood 6 mm off the same body — 2.4 mm proud of the cap they sit on.
     They photographed as dark round HOLES in the mint. 14 mm clears it.
   - **The actuators were flat discs and read as holes.** They are chrome, a chrome fragment is
     only what it reflects, and the knee and ankle ones face BACKWARD into the dark half of the
     room. One normal, one radiance, and that radiance was near black. They are **tori** now: every
     normal in the tube's plane, so some part always carries a highlight — and a collar round a
     shaft is what an exposed actuator IS, so the shape that fixed the lighting is the one the spec
     asked for.

   **`?fixmax=0.01` is the count guard's control** and it has been watched failing: every ray is
   rejected, `0 of 12`, and the view throws instead of quietly rendering the old character.

6. ✅ **CRITIC PASS + FIX ROUND (2026-08-17).** Four critics (front / back / side / in-game), then
   three builders. What came out of it:

   🚨 **THE BIGGEST FINDING OF THE WHOLE EFFORT, AND IT WAS INVISIBLE ON THE CYC.** Every chrome
   region drives metalness to 1.0, and **a metal has no diffuse albedo — it can only be as bright
   as what it reflects.** On the white studio cyc it mirrors white and reads bright silver; in the
   game's dark rooms it mirrors near-black and IS black. The player was reading as *a pale bust
   with no legs*: shin contrast against the floor **41.4 → 6.6**, forearm **19.3 against a 14.3
   wall BEFORE any of this work**. The limbs were already failing and five rounds of studio
   captures could not see it.

   The amplifier was found to be `uRRWChrCon`/`uRRWChrPiv` — a one-sided FOURTH-POWER curve
   pivoting at an ABSOLUTE radiance of 1.6. Below the pivot it is brutal: radiance 0.5 → 0.0153.
   Against a white cyc every fragment gathers more than the pivot, so the curve is the identity by
   construction and the defect cannot appear there. **`mesh.animated` also passes `chrCon: 1.0`,
   so the studio was doubly exempt and `game.play` was not.**

   Fixed by `?dlcfloor` (default 0.6): a floor on the chrome mask's reflected radiance at the
   chrome's own tint, `max()` not add, applied after the curve and still through the BRDF so
   grazing angle and Fresnel survive. In game, dark-side p10: shinL **7.0 → 35.4**, shinR
   **8.5 → 36.3**, forearm **1.4 → 29.5**, with all four floor/wall controls BIT-IDENTICAL. Four
   studio angles move ≤1.5% of spread and medians ≤0.1. **`?dlcfloor=5` is the aliveness control
   and it wrecks the studio (dark<120 30.5% → 19.4%) — it was watched failing.**
   ⚠️ A side effect worth knowing: the waist flexion ridges were being drawn into a black void in
   game and are now legible. The chest box moved +8.0 for that reason and it is not a leak.

   ⚠️ **THE CALF PANEL WAS KEPT.** A critic's recommendation was to ship `dlcalf=0` and delete it;
   it is a line in `player-material-spec.md`, so the cause was fixed instead.

   **Other fixes this round:** the joint actuators became closed machined hubs (bare tori read as
   an open pipe bore); the white shoulder bosses were **not** a shape bug — the render-time panel
   network clamps to a minimum of one plate, so a 40 mm boss carrying its own 0..1 unwrap was
   swallowed whole by one 14.5 mm groove, delivering (77,75,65) where the plate beside it gave
   (208,205,197). Fixed at root (`rrwSFit`, `?rseamfit=0`); the ear discs had it too. And the
   upper-arm machining was tuned from a corrugated screw thread to satin metal — anisotropy
   1.39–1.65 → 0.60–0.93 against the art's 0.39–0.80.

   ⚠️ **TWO PROCESS TRAPS THE CRITICS FOUND, BOTH LIVE:**
   - `measure.mjs` and `overlay.mjs` **segment the contact shadow as figure mass**. Their IoU and
     width numbers on a shadowed capture are junk. Re-key on hue against `?bg=ff00ff` instead.
   - `status.mjs --hates` **REPLACES, it does not append** — one critic's filing silently wiped
     another's five findings.

   ⚠️ **AND A LESSON ABOUT CRITICS.** Two of them reported the upper arm's brightness in OPPOSITE
   directions. Neither was right: **the art disagrees with itself** — its own upper-arm/thigh
   ratio is 0.593 on `side-left` and 0.938 on `side-right`, a 58% spread between two elevations of
   the same robot. Each critic had quoted ONE sheet as though it were "the art". A single-sheet
   ratio is not a target. The residual sits in the forearm/thigh pair, not the arm.

7. 🚨 **THE MESH THREAD (2026-08-17) — READ THIS BEFORE PROPOSING ANYTHING ABOUT FACETING.**

   Two critics measured low-poly FACETING as the dominant surface read, 1.5–2.0× the art. It split
   into two halves and only one of them is fixed.

   ✅ **HALF WAS A SHADING DEFECT AND IS FIXED, FREE.** The generator ships **2,328 of 5,171
   surface corners with hard normal breaks** — 60% of vertices are duplicates at a shared position,
   and 1,318 of those corners break by under 30°, which has no shape behind it and **renders
   identically to a polygon edge**. `tools/smooth_normals.py` merges them; `player_norm30.glb` is
   the result and **is the shipped body** (`PLAYER_BODY` in `mesh-avatar.js`, `?player=` overrides,
   and on `mesh.animated` the A/B is `?clip=` — that view does NOT read `?player=`). Only NORMAL
   bytes differ, byte-diff proven. The hip and thigh zooms are the evidence; it is a large visible
   win at zero polygon cost.

   ❌ **THE OTHER HALF IS REAL TESSELLATION AND THE SUBDIVISION IS BUILT BUT BLOCKED.** Dihedral
   across the 15,567 shared edges is **median 16.75°, p90 69.4°, 66.9% of edges over 10°** — a
   ~20-sided cylinder everywhere; median facet is **11 screen px**, largest 35.
   `tools/subdivide_player.py` delivers 41,512 tris (69% of the 60k budget) in both Loop and
   modified Butterfly (`--scheme`), **provably crack-free (0 boundary, 0 non-manifold), skin
   byte-identical, +0.06 ms GPU, 0 extra draw calls**, dihedral median → **6.19°**.

   **It is unshipped because a sawtooth black band opens across both hips.** Band area in the hip
   ROI, backdrop control 0 on every arm: **n30 1333 px (the bar), bf65 1647 (+23.6%)**.

   ⚠️ **TWELVE MECHANISMS PROPOSED, TWELVE ELIMINATED BY CONTROL. DO NOT RE-TEST THESE** — the
   first eight here, three more below, and the hem lip's placement rule at the end of this item:

   | hypothesis | how it died |
   |---|---|
   | Loop's shrink | per-axis bbox refit landed exactly 0.000% on all axes; band pixel-identical. Refit returns 1.1 mm against 10.9 mm of local contraction |
   | vertex displacement | modified Butterfly moves originals **0.000 mm, asserted every run**; band unchanged |
   | shading normals | 3 builds, identical geometry, normal merge swept **5 / 30 / 75°** → pixel-identical band |
   | a thin hem | `--skirt-thicken` swept 2/4/6 mm then pushed to **40 mm, 6.7× over** — band unmoved (1443 vs 1434). It **saturates**; the band rides outward WITH the rim |
   | a separate skirt shell | the body is a **single connected component**; tri-tri test found 8 intersecting pairs, **all in the hands** |
   | a coarse-bridged recess | hip edge-point displacement is ordinary (median +0.3…0.57 mm); the **torso** moves further (−8.2 mm) with no band |
   | invented skin weights under LBS | **inverted.** Within one frame of `You_Groove`, one hip at 58.6° reads −18.7% and the other at **3.7° reads +364%**. Dropping flexion 4× makes it WORSE |
   | the material's curvature response | `?rseams=0&occ=0&seams=0` on bf65 moves 1647 → **1553** against the 1333 bar — 30% of the excess, and the band is visually unchanged |

   🚨 **AND THE OBSERVATION THAT DROVE ROUNDS 9–10 IS MEASURED FALSE. The band is NOT the hem's
   downward-facing underside.** `harness/_hipx2_whatisdark.mjs` raycasts every dark pixel in the ROI
   at the captured frame (frame pinned by `__rrr.settle(12)`, so it is the same frame the bar was set
   on) and reports what it hits. Of 1333 dark pixels on n30, **11.9% sit on downward-facing surface
   (bf65: 6.0%)**; the median face normal is **n_y +0.229 (facing UP)** against +0.548 for the ROI's
   brightest; **0 of 1333 are backfaces** and median depth complexity is 2, so nothing is seen
   through a gap. Nine tenths of the band is the thigh's **up-facing shoulder** seen through a shallow
   **slot**, not a flange's underside. Its controls: 0 of 1794 empty-backdrop rays hit, and the ray
   silhouette matches the renderer's own to **0.1 points** of ROI coverage.

   ⚠️ **THREE MORE MECHANISMS ELIMINATED, AND THE BAND MOVES UP RATHER THAN GROWING:**

   | hypothesis | how it died |
   |---|---|
   | the shadow map (acne) | `_hipx3_shadow.mjs`: shadows off moves 1333 → **1316 (−17)** against a **±9 px** redraw noise floor; normalBias swept 2/10/30 mm, −9/−7/−14. ⚠️ Its REDRAW control caught the first run, where every arm was byte-identical to base because `settle()` was never awaited — arms are reported UNRUN, never as null results |
   | screen-space AO (`?ao=0` — the thread only ever ablated the *material's* `occ`) | **69% of the darkness, 0% of the excess.** n30 1333 → **418**, bf65 1647 → **726**. Excess **314 with AO, 308 without** |
   | the NORMAL RECOMPUTE (the merge sweep never tested this — all three swept builds recompute) | `_hipx4_recalc.py` puts bf65's normal recipe on n30's geometry, POSITION/UV/skin/indices byte-identical: 100% of normals move, mean 20.3°, p90 48.1° → band **1333 → 1044**, i.e. the *wrong way*. Confound bounded: re-merging without recomputing (`pass184`) is **1332**, so the merge's non-idempotency (184 normals, 1.41%) is worth **1 px** |

   **The shape barely differs between the arms**, which is why no shape edit is available to undo it:
   bind-pose sections at matched planes (`_hipx1_section.py --cmp`) put n30 and bf65 within
   **1–3 mm** everywhere across the junction.

   ❌ **THE MODEL EDIT WAS BUILT, APPLIED AS A POSITION-ONLY DELTA, AND MADE IT WORSE.**
   `tools/hip_fill.py` moves the *other* wall from `--skirt-thicken` — the cavity **floor** (the
   thigh's shoulder) up along its own normal, capped at 60% of each vertex's measured headroom, hem
   rim provably excluded so the silhouette cannot move. Byte-diff proven: only POSITION's bufferView
   changes, 114 vertices, max **6.000 mm = 3.1 screen px**, shell still 0 boundary / 0 non-manifold.
   Result: **hipfill 1354** (vs n30 1333) and **hf65 1882** (vs bf65 1647) — **+14%, the wrong
   direction**, and worse by eye. Its three controls were each watched failing: `--fill 0` runs the
   whole selection then exits 3; `--control-rim` fires the rim assertion on 75 vertices (exit 2);
   `--control-nocap` fires the interpenetration assertion, worst **45.1×** clearance (exit 2).

   🚨 **SO BOTH DIRECTIONS OF THE APERTURE EDIT ARE NOW DEAD: widening the slot mouth
   (`--skirt-thicken`, to 40 mm) SATURATES, and narrowing it (`hip_fill`) makes it WORSE.** The band
   is not controlled by the junction's aperture. Its own dry run said so in advance and should be read
   before anyone tries a third variant: the cavity-floor rule finds **48 welded positions, 20 of them
   OPEN TO SKY** (their outward normal ray never meets surface) and median clearance **38 mm** over
   the rest. There is a shallow slot here, **not a deep enclosed cavity** — there is nothing for a
   fill to grip.

   ❌ **ROUND TWELVE — THE HEM LIP'S OWN PLACEMENT RULE. ELIMINATED, AND IT IS THE TWELFTH.**

   The mechanism, and it explained every observation at once: every smooth subdivision stencil
   places an edge point OFF the chord joining its two original vertices, so on a thin lip the
   silhouette BETWEEN two originals retreats — one scallop per original edge, which is what a
   sawtooth is, and each retreat uncovers the thigh's shoulder slightly higher up. **Butterfly
   holds the original VERTICES at 0.000 mm but not the CURVE BETWEEN them**, which is why its
   identity guarantee looked like an alibi.

   🚨 **AND STEP ONE FOUND THE SIMPLER FORM OF IT WAS TRUE. THE HEM WAS NEVER BEING CREASED.**
   `tools/_hipx5_hemdih.py` reports the hem loop's OWN geometric dihedral, selection reused from
   `--skirt-thicken`'s rim finder (75 of 5,171 positions, y 0.691..0.843, one chain per leg):

   | set | edges | min | p10 | median | mean | p90 | max | ≥65° | <30° |
   |---|---|---|---|---|---|---|---|---|---|
   | **hem rim loop** | **79** | 0.30 | 3.79 | **14.80** | 31.96 | 84.79 | 151.95 | **13 (16.5%)** | 64.6% |
   | spokes off it | 331 | 0.03 | 2.35 | 11.74 | 24.89 | 69.08 | 158.05 | 39 (11.8%) | 73.1% |
   | whole mesh | 15,567 | 0.00 | 3.06 | 16.75 | 27.48 | 69.38 | 178.89 | 1,778 (11.4%) | 68.8% |

   **66 of the hem's 79 edges sit below the tool's 65° crease threshold**, so the lip took the
   smooth stencil. Its control is `--control-thighside`, the same rule on the other wall of the same
   slot (76 verts, median 11.38°, max 109.5°) — a different population, so the selection
   discriminates rather than reporting the mesh under a hem-shaped label.

   ⚠️ **AND A CREASE THRESHOLD CANNOT BE THE FIX, WHICH IS ARITHMETIC, NOT AN OPINION.** A
   threshold selects an ANGLE, not the hem. Catching 90% of the hem loop needs `--crease 3.8`,
   which creases **87.5% of the whole mesh** (today: 11.4%) — creasing preserves the facet, so that
   arm preserves the defect the subdivision exists to remove:

   | crease | hem caught | mesh creased |
   |---|---|---|
   | 65 (today) | 13 / 79 (16.5%) | 11.4% |
   | 30 | 28 (35.4%) | 31.2% |
   | 14.8 | 40 (50.6%) | 54.1% |
   | 3.8 | 71 (89.9%) | **87.5%** |

   So the test was run the way that DOMINATES that sweep: `--hem-midpoint loop|spokes|all` forces
   the hem's edges to the **pure chord midpoint**, catching **100%** of the loop at **zero**
   collateral. Applied last and unconditionally, so a creased hem edge is forced too — the 4-point
   crease curve is interpolating at its vertices but still leaves the chord between them.

   **THE RESULT, AND IT IS A CLEAN NO.** Same frame, same ROI, backdrop control 0 on every arm, and
   the base arms reproduce this thread's bar exactly:

   | arm | dark px | vs n30 | backdrop control |
   |---|---|---|---|
   | **n30 — THE BAR** | **1333** | — | 0 |
   | bf65 | 1647 | +23.6% | 0 |
   | **bfhem** (79 hem edges forced to midpoint) | **1660** | **+24.5%** | 0 |
   | **bfhemall** (+ the 331 spokes, 410 edges) | **1636** | **+22.7%** | 0 |

   **+13 px against bf65 on the loop arm — the wrong direction, and inside the ±9 px redraw noise
   floor.** Widening the force to the spokes as well gives back **11 px of a 314 px excess (3.5%)**,
   which is noise-adjacent and not a fix. By eye in the panel, which is what decides: bf65, bfhem
   and bfhemall are **indistinguishable** — the same teeth, in the same places, at the same depth,
   against n30's thin line. Holding the lip exactly on its original polygon does not close it.

   Delivery was checked rather than assumed (`_hipx5`'s own header records why): `bfhem` vs `bf65`
   moves **102 vertices, all within y 0.692..0.839, max 8.736 mm = 4.5 screen px**, with JOINTS,
   WEIGHTS, TEXCOORD and indices **byte-identical** — so the edit was large, correctly placed, and
   landed. Three controls were each watched failing, no file written: `--hem-midpoint none` runs the
   whole rim selection then trips the no-op guard (exit 3, 75 rim verts / 0 forced);
   `--control-hem-offchord` forces the right edges 1 mm off their own chord and fires the on-chord
   assertion (exit 2); `--control-hem-splitkeys` keys the same set on RAW SPLIT indices and fires
   the membership assertion (exit 1, "not an edge of the WELDED topology").

   🚨 **WHAT THIS LEAVES. Twelve mechanisms, twelve eliminations, and the band survives an edit that
   held the lip on its original polygon while every original vertex was already provably unmoved.**
   The remaining difference between the arms is not the hem's position and not its placement RULE —
   it is that the thigh's up-facing shoulder inside the slot is drawn by 4× as many triangles.

   **The honest next step remains a human in Blender on the skirt/thigh junction** — but aimed at the
   thigh's up-facing shoulder inside the slot, not at the hem's underside, and knowing that the
   aperture is not the lever. The tool is finished and correct; it runs the day that model is fixed.
   All subdivided assets stay on disk behind `?clip=` (`hipfill`/`hf65`/`recalc`/`pass184` are
   DIAGNOSTIC ONLY, documented in `mesh-animated.js`'s `CLIPS`). `player_unwrapped.glb` is byte-intact
   at md5 `6e42a7f493f31f5a6335501ed1e03c03` and `player_norm30.glb` at
   `317332d1fdd286d5d60ae8d08903ce99`; **norm30 is still the ship pointer.**

8. **Still open, ranked:** low-poly FACETING (two critics, two views, two instruments, 1.5–2.0× the
   art — this is the MESH, no shader reaches it); the eyes read dead (art has bright eyes on a dark
   screen, ours dim eyes on a pale one, 2.5× less pop); the teal cap sits ~3% of figure height too
   high and 8% too narrow, and the front carries 2.534% teal against the art's 1.197%; the head
   measures 2–3.7× too dark. **Player-vs-hunter distinguishability is UNANSWERED** — the hunter
   never entered frame in four attempts.
7. **Decide absolute vs ratio targets.** The art's chest is 162.8, ours 230.1 — a 67-level exposure
   gap. By ratio our arm/chest is 0.550 against the art's 0.739. Rounds so far chased absolutes for
   continuity; the last builder thinks ratios are the honest comparison and it is probably right.
8. **Mint cap lost 4.6% saturation** to the relight's stronger key. Only thing that went backwards.

## Animation, briefly

Clips drive everything; the procedural skeleton is still there but only its meshes are hidden — it
owns sockets, limbs and the hammer's clock. `SWINGS` in `mesh-avatar.js` is a varied set, each
entry carrying its **own** `grip` and `contact` (both are properties of the clip, never shared).

⚠️ **Neither swing clip is a wall swing.** Both are ground chops that drive the hammer head below
the floor — `Heavy_Hammer_Swing` 0.27 m, `Attack` 0.37 m, and `Attack` also contains a ~0.8 m
positional jump at phase 0.37. `Attack`'s grip is **unsolved** and carries Heavy's value as a
labelled placeholder. The real fix is a purpose-made clip from Meshy's Text-to-Motion.

Unwired from the 15: `Dead`, `Face_Punch_Reaction`, `Crawl_and_Look_Back`, `Arise`.

## Traps that have each cost a round

- **`?solo=1` or the rig sits at x=0.75.** Every measurement ray assumed the body was at the
  origin; all three `MESH.bat` tabs failed while every dev capture passed.
- **`?bg=ff00ff` for masking.** The default background is a gradient, so a naive "not background"
  test selects the whole 1920x1080 frame. Has happened twice.
- **A missing URL param is `0`, not absent.** `Number(null)` is 0 and passes `isFinite`, so an
  ordinary URL once set every light to zero and photographed a black frame while the harness
  reported success. A sweep never catches this — a sweep passes every parameter explicitly.
- **Bone axes are not a convention.** 14 of 24 point +Y; `Hips` is nearly −Z, and both hands, both
  toes, `Spine` and `Head` are off-axis. Derive parent-to-child.
- **`Spine` is the CHEST on this rig** (`Hips → Spine02 → Spine01 → Spine`). The naive
  `/spine$/i` rule for "waist" would black out the wordmark plate. There is a control asserting it.
- **A UV-space win is not an image-space win.** The re-unwrap improved uv density exactly as
  claimed and moved facet energy not at all.
- **Skinned bounds and `geometry.clone()` cache stale boxes**, and `Skeleton.update()` only runs at
  render time. Both have produced confident wrong tables.

## Animation check on the rigged Friendly Robot — NOT YET ANSWERED (2026-08-19)

John: "check the animations in game and make sure the model looks normal now its rigged."

✅ **THE NEW BODY NOW LOADS IN `mesh.animated`.** `?clip=friendly&anim=<name>` was added to that
view's `CLIPS` table. ⚠️ It threw on every clip first, with the SAME error the wordmark work hit:
*"shoulder cap ray at swing 54deg hit 0.611 m from the arm joint — that is the torso"*. That view
also ran the full identity kit unconditionally. It now takes the same branch `mesh-avatar.js` does
— a body with `material.map` gets `attachChestWordmark`, everything else gets the whole kit.
**Six clips failed to load before this and the probe reported "nothing measured".**

🚨 **`harness/_anim_check.mjs` IS BUILT BUT ITS RESULTS ARE WORTHLESS AS OF THIS WRITING. DO NOT
READ ITS "OK" AS A PASS.** It scrubs each clip to six phases, reads the SKINNED vertex positions
back and looks for explosion / collapse / ground break. Every phase of every clip returns
**0.0% travel and vol/bind exactly 1.000** — impossible for a real animation.

**The decisive test was run and it clears the model:** the same probe against `?clip=n30`, the
KNOWN-GOOD Lumi Bot that has animated in game for weeks, returns **the same 0.0%**. So the sampler
is not reading the animated pose, and this says nothing about the new rig either way.

Already tried and did NOT fix it: `mixer.update(0)` after `mixer.setTime()` (both for the phase
sample and for the zero-weight bind reference). Next suspects, in order:
1. `getVertexPosition` may be returning bind-space positions regardless of the skeleton — check it
   against a bone's own `getWorldPosition` at two phases before trusting any vertex number.
2. Capture mode parks the loop; the mixer may need the engine's own update to have run at least
   once before `setTime` takes.
3. The `vec()` helper clones `skinned.position` — if that mesh's transform is unusual the returned
   Vector3 is fine, but confirm `getVertexPosition` is actually writing into it.

⚠️ **The per-clip PNGs in `harness/out/animcheck/` are also weak evidence** — the probe's 900x1100
viewport against `?solo=1` puts the figure mostly OUT OF FRAME. What is visible (arm, hand,
shoulder, chrome forearm, wordmark edge) shows no deformation, but that is a corner of one frame,
not a check.

**So: the model is wired, textured, chromed and wearing its logo, and NOBODY HAS YET CONFIRMED IT
DEFORMS CLEANLY.** The fastest honest answer is a human looking at it:

    MESHANIM.bat  ->  ?view=mesh.animated&clip=friendly&anim=Walking&solo=1&orbit=1

## `char.lineup` is now the rig verification tool (2026-08-19)

John, after playing the clips: "they are both collapsed onto the left leg and swinging wildly
around ... lets just improve the robot comparison with a toggle for each animation that each rig
has. It should be a full verification tool for robot rigging animations."

**Every rig in the row now plays the same clip off ONE clock.** `engine.onUpdate` advances all
mixers with the same `dt`, so the bodies are always on the same frame — comparing two figures at
unknown different phases would be worse than useless. A clip bar at the bottom carries one button
per clip, `bind` returns everything to bind pose, and a button reads `name (1/2)` when only some
rigs carry that clip. A rig missing the selected clip is posed to bind rather than left frozen
mid-swing, which would read as a deformation bug.

    ?anim=<name>   preselect a clip (this is what makes it capturable)
    ?ui=0          hide the bar for a clean frame
    node harness/_lineup_shot.mjs --names --anim Attack

Published for the harness: `__lineupClips` (per rig: clip count and names) and `__lineupAnim`
(which rigs carry the selected clip).

🚨 **AND IT ANSWERED THE QUESTION ON ITS FIRST FRAME: `Attack` COLLAPSES THE LUMI BOT TOO.**
Side by side on the same frame, the OLD body — rigged for weeks, shipped, never complained about —
lurches and twists exactly like the new one. **So the fault is the CLIP, not the new auto-rig.**

That is consistent with what this file already recorded and nobody had connected: *"Neither swing
clip is a wall swing. Both are ground chops that drive the hammer head below the floor —
`Heavy_Hammer_Swing` 0.27 m, `Attack` 0.37 m, and `Attack` also contains a ~0.8 m positional jump
at phase 0.37."* `Attack`'s grip is unsolved and carries Heavy's value as a labelled placeholder.

⚠️ **This is exactly what one-robot-at-a-time viewing cannot tell you.** Watched alone, a collapsed
figure reads as "the new rig is broken" — which is what it looked like, and what the previous
message reported. The row makes it one glance.

**Still true:** `harness/_anim_check.mjs` remains broken (0.0% travel on a known-good body) and
must not be trusted. It is now also largely redundant — `char.lineup` with `?anim=` answers the
same question by eye, which is the check that actually caught this.

**Next:** the swing clips need replacing, not the rig. Meshy Text-to-Motion for a real wall swing
is the note this file has carried since the animation section was written.

## 🚨 THE MERGED CLIPS ARE INVALID — REGENERATE THEM ON THE NEW RIG (2026-08-19)

**`PLAYER_BODY` is back to `player_norm30.glb`.** `friendly_merged.glb` must not ship. The BODY is
good — geometry, baked texture, chrome panels, chest wordmark all fine. The ANIMATION is wrong.

**Why, with numbers.** `tools/merge_clips.py` copied the Lumi Bot's 15 clips onto the Friendly
Robot because `tools/_rig_compare.py` reported all 24 bone names and parents shared. **That verdict
was wrong and the tool has been fixed to stop giving it.** A rotation key is relative to the bone's
REST orientation, and these rigs rest differently:

| bone | rest direction differs | length ratio B/A |
|---|---|---|
| **Hips (the ROOT)** | **114.86°** | 0.897 |
| RightHand | 10.54° | 0.951 |
| LeftUpLeg | 4.22° | **0.657** |

Worst direction **114.86°**, worst length **38.3%**. Every clip's root rotation lands on the wrong
axis, so the figure pitches off the ground plane and its feet leave the spot. John: *"the last
model can keep its feet centered but the new one the feet are moving from the point and the
animation doesn't look like its on the same plane."*

⚠️ **TWO FIXES WERE TRIED AND NEITHER IS THE MECHANISM — DO NOT RE-TRY THEM:**
1. **Rescaling the translation tracks by the hips-height ratio** (0.8494, from 0.7195 vs 0.8471).
   `merge_clips.py` still carries this and it is harmless, but the capture after it was
   indistinguishable from the capture before.
2. **Armature scale.** Both armatures are exactly 0.01. Not a factor.

### THE FIX, AND IT IS STRAIGHTFORWARD

**Regenerate every clip ON the Friendly Robot's own rig, from Meshy's preset motion library.** The
rigged asset is already in Meshy (Animate tab). ⚠️ **Every name the game needs is in that library,
spelled with spaces instead of underscores** — it is the same library the Lumi Bot's clips came
from, which is why the names matched in the first place:

| game key (`CLIPS` in `mesh-avatar.js`) | preset motion name |
|---|---|
| `idle` | Alert |
| `walk`, `walkHold` | Walking |
| `run` | Running |
| `idleHold` | Axe Breathe and Look Around |
| swing | Heavy Hammer Swing · Attack · Charged Axe Chop · Axe Stance |
| unwired but present | Arise · Dead · Crawl and Look Back · Face Punch Reaction · Lower Weapon, Look, Raise · Walk Turn Left with Weapon · You Groove |

Steps: select the RIGGED Friendly Robot in Animate → apply each preset → download with **Rigged
Character ON** (it is OFF by default) → the export names each clip after the motion.

⚠️ **`merge_clips.py` IS THEN THE WRONG TOOL** — there is nothing to merge, because the clips will
already be on the right rig. It only needs collecting into one GLB, and its rig guard should be
kept as the thing that stops anyone copying across rigs again.

⚠️ **THE SWING CLIPS ARE BAD ON BOTH BODIES ANYWAY.** `char.lineup` with `?anim=Attack` showed the
Lumi Bot collapsing on the same frame — see the section above. `Attack` carries a ~0.8 m positional
jump and both swings drive the hammer head below the floor. Regenerating is the chance to pick
better ones, or to use Text-to-Motion for a real WALL swing, which this file has wanted since the
animation section was written.

### VALIDATION IS BUILT AND WAITING

`char.lineup` + `NEWBOT.bat` is the tool for judging the result: every rig, one ground line, one
clock, a button per clip. `node harness/_lineup_shot.mjs --names --anim <Name>` captures any one of
them. **Use it on every regenerated clip** — it is what caught that `Attack` was a clip fault and
not a rig fault, in one glance.

⚠️ `harness/_anim_check.mjs` still reports 0.0% travel on a known-good body. **Do not trust it.**

### The clip set to regenerate — LOCOMOTION **AND SEATED** (John, 2026-08-19)

"make sure to include all the seated clips as well." So the regeneration is **one pass over both
sets**, not the 15 first and the seats later. `docs/design/seated-motion-set.md` is the authority
on the seated list and why each was chosen; the names below are the Meshy preset spellings.

**Core / locomotion (15)** — table in the section above.

**Seated (23)**, from `seated-motion-set.md`:

- **Reactions:** `Sitting Answering Questions` · `Sitting Clap` · `Sit Cheer with Left Hand` ·
  `Sit Shout Hands on Mouth` · `Sit Finger Wag No` · `Sit Thumbs Up Right` ·
  `Sit Hands on Head Lean Back` · `Sit on Chair Arms Crossed` · `Sit and Doze Off` ·
  `Sit and Drink` · `Sit Dodge` · `Angry to Tantrum Sit` · `Sit Cross-legged`
- **Idles:** `Chair Sit Idle Female` · `Chair Sit Idle Male`
- **Transitions:** `Walk to Sit` · `Step to Sit Transition` · `Stand to Sit Transition Male` ·
  `Look Back and Sit` · `Sit to Stand Transition Female` · `Sit to Stand Transition Male` ·
  `Stand Wave and Sit Down` · `Stand Clap and Sit Down`
- **NOT these:** `Situps` (exercise) and `Sit Lie Bed` (a bed, not a seat).

⚠️ `seated-motion-set.md` records that **Meshy's search box is fuzzy, not substring** — a name
typed exactly may not surface first. Check the result you click, not the query you typed.

⚠️ `Stand_Cheer_and_Sit_Down` already exists on disk from an old download and has never been
wired. Do not treat its presence as meaning the seated set is partly done.

**≈38 clips total.** That number is why the tool changed shape — see below.

### The picker is a DROPDOWN now, not buttons (John's call, done 2026-08-19)

"instead of buttons the tool will need a drop down that can adapt to all the animations we add."

Right call and it is a capacity decision: the button row already wrapped to two lines at 16 clips,
and ~38 would have eaten a third of the frame and pushed the robots out of it. `char.lineup` now
carries a single `<select>` that stays one line at any clip count.

What was preserved, because it was the bar's real job rather than its clicking: an option reads
`Name (1/2)` when only some rigs carry it, and a readout beside the select names each rig and
whether it has the selected clip — `unit4h:NO CLIP  lumi:yes  friendly:yes`.

**← → step through the list, Esc returns every rig to rest.** Added because reviewing 38 clips
through a mouse would not actually get done; hold one key and watch the row.

`?anim=<name>` still preselects, so `node harness/_lineup_shot.mjs --names --anim <Name>` captures
any single clip unchanged.

## THE MESHY DOWNLOAD DIALOG DOES THE MERGING FOR US (2026-08-19, measured in the app)

Driving Meshy in John's own Chrome, with the RIGGED Friendly Robot selected in Animate:

- **Adding a preset motion is FREE.** Credits read 4,015 before and after applying `Sitting Clap`.
  The cost badge sits on the DOWNLOAD button (+50), not on the motions.
- Motions accumulate in an **Added** tab beside **Library**. `Running` and `Walking` were already
  there — they are the two `friendly_*.glb` files on disk.
- The Download dialog carries exactly the four controls this job needs:
  `Format glb` · `Rigged Character` (OFF by default — turn it ON) · `Animation: Current | ALL ADDED`
  · `Single file` (OFF by default — turn it ON).

🚨 **SO THE PLAN CHANGES SHAPE: ADD ALL ~38 MOTIONS, THEN TAKE ONE FILE.** `All Added` +
`Single file` + `Rigged Character` exports every added clip on the Friendly Robot's own rig in one
GLB. There is no 38-download grind, and `tools/merge_clips.py` is not needed at all — its rig guard
stays as the thing that stops anyone copying clips across rigs again.

### STATE IN MESHY RIGHT NOW — 38 MOTIONS ARE ADDED AND WAITING FOR ONE DOWNLOAD (2026-08-19)

The rigged Friendly Robot's **Added** tab holds all 38: the 15 locomotion clips (`Alert`, `Walking`,
`Running`, `Attack`, `Heavy Hammer Swing`, `Charged Axe Chop`, `Axe Stance`,
`Axe Breathe and Look Around`, `Arise`, `Dead`, `Crawl and Look Back`, `Face Punch Reaction`,
`Walk Turn Left with Weapon`, `You Groove`) and the 23 seated ones plus `Stand Cheer and Sit Down`.
`Lower Weapon, Look, Raise` reported applied but did NOT appear in the list — it is unwired in the
game anyway. Nothing has been downloaded yet. Credits unchanged at 4,015 through all 38 adds.

⚠️ **THE LIBRARY HAS RENAMED SOME MOTIONS, SO THE CLIP KEYS WILL MOVE.** `Axe Breathe and Look
Around` still exists, but a long exact query returns NOTHING while a short one works — search
`axe`, `hammer`, `chop`, `crawl`, `punch`, `groove`, `weapon`, `sit`, then pick the exact name out
of the pool. One `sit` search returns every seated motion on the list in one page.

⚠️ **A CARD UNDER THE MOUSE HIDES ITS OWN NAME** — it swaps the label for `Remove / Click to
Preview`. Any script that hovers to reveal `+ Add` must clear the hover before reading names, or it
will report every already-added clip as missing and every card as unnameable. That cost two rounds.

### THE REGENERATED CLIPS ARE IN, AND THE MEASUREMENT SEPARATES THREE DIFFERENT FAULTS (2026-08-19)

`public/models/anim/friendly_native20.glb` — 20 clips, downloaded in ONE file. `_rig_compare.py`
against `friendly_rigged.glb`: **0.00 deg worst rest direction, 0.0% worst bone length**. That is
the control the copied build failed at 114.86 deg. `?clip=fnative` on `mesh.animated`, and
`char.lineup` now stands this file in the row (`?bad=1` puts `friendly_merged.glb` back beside it).

**`harness/_anim_check.mjs` worst-of-six-phases, on the new file:**

| clip | ground/H | drift/H | tilt | reading |
|---|---|---|---|---|
| `Walking` | 2.3% | 5.0% | 8.9 deg | clean |
| `Running` | 3.6% | 3.6% | 12.7 deg | clean |
| `Alert` | 0.3% | 4.6% | 10.2 deg | clean |
| `Attack` | 4.9% | **29.2%** | **35.0 deg** | still bad |
| `Heavy_Hammer_Swing` | 2.8% | **36.4%** | **41.3 deg** | still bad |
| `Sitting_Clap` | -4.0% | 17.9% | 7.3 deg | **thresholds are wrong, not the clip** |

Three separate conclusions, and the point of the table is that they are separate:

1. **THE RIG WAS NEVER THE PROBLEM AND THE REGENERATION FIXED THE COPY.** Locomotion on its own
   rig sits inside every threshold. The same `Walking` copied across rigs read 4.3% ground break
   against 2.3% here, and John's eye had already called that: *"the feet are moving from the
   point"*.
2. **THE SWING CLIPS ARE STILL WRONG AND REGENERATING THEM CHANGED NOTHING**, exactly as this file
   predicted — they are ground chops with 0.8 m of root motion, bad on the Lumi Bot too.
   Text-to-Motion for a real WALL swing is now the only route left; it is a taste call and John has
   not seen one yet.
3. 🚨 **ONE THRESHOLD SET CANNOT JUDGE A WALK AND A SIT-DOWN.** `Sitting_Clap` "fails" drift and
   ground because the figure LOWERS ITSELF ONTO A CHAIR — that is the clip working. The next
   change to the probe is a clip CLASS (locomotion / swing / seated / transition) with its own
   limits, or the seated set will arrive pre-failed and the failures will stop meaning anything.

### THE 38-CLIP FILE IS BUILT AND WIRED (2026-08-19)

`public/models/anim/friendly_all38.glb` — 9.0 MB, 15,944 tris, 24 bones, **38 clips**, all on the
Friendly Robot's own rig. Two Meshy downloads (20 + 20, capped) joined by `tools/merge_clips.py`,
whose rig guard passed because both halves ARE the same rig; the duplicate `Walking.001` and
`Running.001` were stripped from the GLB's JSON chunk afterwards. `?clip=fall` on `mesh.animated`;
`char.lineup` (so `NEWBOT.bat`) now stands this file in the row, with `?bad=1` to bring the invalid
copied build back beside it.

**`_anim_check.mjs` now classes each clip and only convicts on the checks that apply** —
`locomotion` binds all five, `action` and `seated` bind explosion and collapse only, because a
sit-down is SUPPOSED to leave the spot and the floor. Sample run on the merged file: **OK**,
locomotion drift 4.7%H and tilt 8.9 deg, and the control arm still reads 0.0 on a seated clip.

**What is left on this thread:**
1. The **wall swing**. `Attack` and `Heavy_Hammer_Swing` are still ground chops — 29-36% drift,
   35-41 deg tilt — on the new rig as on the old. Text-to-Motion is the only route and John has to
   see it. Nothing else in the set is in doubt.
2. **Ship it**: `PLAYER_BODY` in `mesh-avatar.js` is still `player_norm30.glb`. The swap wants
   John's eye on `NEWBOT.bat` first, and the clip KEYS in `CLIPS` remapped — the new names are
   `Sit_to_Stand_Transition_M` rather than the Lumi Bot's spellings.
3. **The character perf probe** (frame ms with 1/4/8/16 animated robots) is designed and not built.
   `engine.js` already times frames, GPU and CPU per frame under `_freeRun`, so the work is a
   `?copies=N` on `char.lineup` plus a harness that reads those numbers — not new instrumentation.

### SHIPPED, AND THE HOUSE IS ASSEMBLED (2026-08-19)

`PLAYER_BODY = friendly_all38.glb`, and — the part that mattered more — **`?mesh=1` is now the
DEFAULT** in `views/game.js`. The generated avatar had been opt-in for as long as its clips were
wrong, so every `game.play` measurement taken without that parameter was taken on the PROCEDURAL
player. Old frame-cost and silhouette numbers for "the game" describe a different character.

🚨 **AND THAT IS HOW THE FIRST "SHIP" QUIETLY DID NOTHING.** Flipping `PLAYER_BODY` alone left the
game loading the procedural player, and the fallback in `game.js` is silent by design. The new
probe caught it on its first run — `body procedural fallback`.

**`harness/_gen1_integration.mjs` — the one boot that checks the COMBINATION.** Seeds 4, 5, 6, 9:

| | seed 4 | seed 5 | seed 6 | seed 9 |
|---|---|---|---|---|
| spaces | 5 | 6 | 6 | 6 |
| patrol stops inside the house | 10/10 | 12/12 | 12/12 | 12/12 |
| furniture, destructible | 34/34 | 54/54 | 35/35 | 11/11 |
| sledge on the floor | yes | yes | yes | yes |
| body / clips | `friendly_all38.glb` / 38 | same | same | same |

🚨 **THE HUNTER WAS PATROLLING A BUILDING THAT IS NOT THERE.** `spaces.js` now generates the route
from the generated plan — two stops per space at opposite ends of its long axis, visited
nearest-neighbour from his spawn. The control proves it: `?patrol=authored` forces the old table
back and the same probe reads **1/12 stops inside the house**. That fault had been recorded in
`game.js` beside the sense overlay ("the route is not absent, it is FOREIGN") and never fixed.

⚠️ **`furnDestructible` asserts on `isDamageable` + `applyHit`** — the exact two members
`player.js` uses to break one. The first draft looked for a `damage()` that nothing has and
reported 0 destructible out of 54, which is a probe fault that reads exactly like an asset fault.
