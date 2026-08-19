# Run Robot Run — Style Contract

**One page. Never changes. Everything is measured against it.**
Authority for new assets: [ASSET_PIPELINE_PLAN.md](ASSET_PIPELINE_PLAN.md).

Two kinds of line below, and the difference matters:
**[D] DERIVED** — read out of the shipped code, already true today.
**[?] PROPOSED** — a new decision. Nothing has been built against it. **John signs these off.**

---

## 1. Unit scale and origin

| | |
|---|---|
| **[D]** 1 unit | 1 metre |
| **[D]** Player height | **1.7 m** (`PLAYER_H`, `hunter.js:36`) |
| **[D]** Hunter stage scales | ×1.35 / ×1.90 / ×2.60 of player height |
| **[?]** Character origin | **Between the feet, on the ground plane**, +Z forward, +Y up |
| **[?]** Prop origin | Base centre, on the ground plane |

## 2. Palette — 9 colours, no more

**[D]** All nine already exist as `C` in `src/materials/surfaces/robot.js`. This is the whole palette; a new asset that needs a tenth colour is a conversation, not a commit.

| Name | Hex | Used for |
|---|---|---|
| `shell` | `#EDEFF0` | white body panels — the character's ground colour |
| `chrome` | `#B9BEC2` | limbs, joints, hands, exposed mechanism |
| `mint` | `#8FC9BD` | shoulder caps — the signature accent |
| `mintLit` | `#66CCB4` | tonemap-compensated mint; author with this, not `mint` |
| `glass` | `#2659A0` | face plate |
| `faceLight` | `#7EBDF0` | face emissive |
| `ink` | `#054E84` | printed marks and decals |
| `gap` | `#2A2E31` | panel gaps, knuckle gaps, vents |
| `sole` | `#212426` | boot soles, rubber |

⚠️ **[D]** `mint` vs `mintLit` is not redundancy. The composite tonemap compresses mint chroma ~3×, so the authored value must be pre-compensated. Author against `mintLit`; keep `mint` as the reference the art sheet actually shows.

## 3. Material slots — 7, and a new asset uses only these

**[D]** From `unit4hMaterials()`:

`shell` · `chrome` · `mint` · `face` · `decal` · `gap` · `sole`

A generated mesh arrives with its own baked materials. **The conditioning script renames every one of them into this list** (plan Step 5) and Step 6 re-materials from the shared set. An asset carrying an eighth material name has not been conditioned.

## 4. Triangle and draw-call budgets

**[D]** measured today: `hunter.2` 176 calls / 229k tris · `hunter.3` 250 / 338k · `hunter.sheet` 410 / 567k (four characters).
**[D]** GPU budget **≤1.39 ms at 1080p, `quality=medium`** — 16.67 ms ÷ 12, this box being ~12× the integrated target. Enforced by `shoot.mjs --gate`.
**[D]** CPU budget **≤2.00 ms**. ⚠️ `hunter.sheet` currently **fails this at 2.38 ms**; GPU is fine.

| Class | **[?]** tri budget | **[?]** draw calls |
|---|---|---|
| Hero character (player, hunter) | **60k** [D-signed 2026-08-15] | 40 |
| Enemy / secondary character | 25k | 20 |
| Hero prop (story object) | 15k | 8 |
| Background prop | 4k | 2 |
| Modular architecture piece | 2k | 1 |

**[?]** Whole-room ceiling stays **≤300 calls / ≤900k tris** — unchanged from the existing gate.

## 5. Naming

**[?]** Files: `rrr_<class>_<name>_v<n>.glb` — e.g. `rrr_char_hunter-s2_v3.glb`, `rrr_prop_chair_v1.glb`.
Classes: `char` · `enemy` · `prop` · `arch`.
**[?]** Lowercase, hyphens inside a name, underscores between fields. No spaces, ever — this project lives under a path with a space in it and that has already broken tooling twice.

---

## 6. ⚠️ THE SEAM — what a generated shell must satisfy to mount on the rig

**This section exists because of John's 2026-08-15 ruling: keep the rig, generate the shells.**
`buildUnit4H` stays — the skeleton, the posing, the stage scaling, `setPose`, the collapse/draw-call machinery. What gets replaced is the hand-built shell geometry hanging off it. So a generated part is not a character; it is a **panel that clips to a named joint**.

**[D] The rig's joint vocabulary** — a shell part declares exactly one parent from this list:

`hips` · `spine` · `chest` · `neck` · `head`
· `shoulderL/R` · `elbowL/R` · `wristL/R` · `hipL/R` · `kneeL/R` · `ankleL/R`

**[?] A conditioned shell part must:**

1. **Be a single mesh**, one material slot from §3, origin **at its parent joint** — not at its own centre of mass. The rig rotates the joint; a part whose origin is elsewhere swings.
2. **Be authored at player scale (1.7 m character)**. The stage system multiplies; parts must not arrive pre-scaled to a stage.
3. **Carry no baked lighting and no baked ambient occlusion.** The pipeline lights everything from one shared setup, and baked shadows are what make separately-generated assets look separately generated.
4. **Face +Z**, arms along −Y in bind pose, matching the existing rig.
5. **Be symmetric-safe**: an L part must mirror to R without hand-fixing. Anything with handedness (the shoulder port) is authored per side and named `_l` / `_r`.
6. **Stay inside its class's tri budget from §4** — checked by the conditioning script, not by eye.

**[?] What the rig owns and a generated part must NOT contain:** joints, pivots, the face plate, the brand decal, the crack/grime shader layers, and anything driven by `HUNTER_STAGES`. Those are parameters, not geometry, and they are the reason a stage-2 and a stage-3 hunter can share one mesh set.

---

## Signed off by John, 2026-08-15
1. **Hero character tri budget: 60k.** Confirmed as drafted. The other class budgets remain [?].
2. **Re-origining is AUTOMATED.** The conditioning script re-origins each part from a per-part
   manifest giving its parent joint and that joint's bind position. No hand-placing. This makes
   the manifest a required input alongside the raw mesh - see PART_MANIFEST below.
3. **The player robot goes first.** It is the closest existing asset to the bar but still needs
   work, so it is the end-to-end test case: generate the mesh version, then compare and decide
   whether to adopt. ⚠️ Until that decision, the CURRENT procedural player stays the scale
   reference and the weathering control in every capture - do not regenerate it in place.

## PART_MANIFEST — the input the automated re-origin needs

One JSON per asset, sitting beside the raw mesh. Minimum viable shape:

```json
{
  "asset": "rrr_char_player_v1",
  "authoredHeight": 1.7,
  "parts": [
    { "mesh": "torso",      "joint": "chest",     "material": "shell" },
    { "mesh": "pauldron_l", "joint": "shoulderL", "material": "mint",   "mirrorTo": "pauldron_r" },
    { "mesh": "forearm_l",  "joint": "elbowL",    "material": "chrome", "mirrorTo": "forearm_r" },
    { "mesh": "boot_l",     "joint": "ankleL",    "material": "shell",  "mirrorTo": "boot_r" }
  ]
}
```

The script reads the joint's bind-pose position from the rig, moves the part's origin there, and
renames its material into the §3 list. Everything in it is checkable; nothing in it is taste.

## Toolchain prerequisites (checked on this PC, 2026-08-15)

| | |
|---|---|
| Node / npm | ✅ v24.18.0 / 11.16.0 |
| Playwright + Chromium | ✅ installed |
| GPU | ✅ RTX 3060 Ti (perf gate is calibrated against it) |
| **Blender** | ❌ **NOT INSTALLED** — required for the conditioning script. `winget` is available and offers `BlenderFoundation.Blender.LTS.4.5`. Double-click `BLENDER.bat` in the project root. |
| **Python** | ❌ only the Windows Store stub resolves on PATH. Not needed if conditioning runs through Blender's own bundled Python (`blender --background --python`), which is the plan. |
| Rented GPU box (TRELLIS / Hunyuan3D) | ❌ not set up — this is plan setup item 3, and it is what blocks Step 4. |
