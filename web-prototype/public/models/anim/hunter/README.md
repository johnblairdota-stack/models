# The hunter clip pack — what is actually here

**There are no GLBs in this folder on purpose.** The hunter's clip pack is the tracked
Lumi Bot biped set one level up, in `public/models/anim/`. This README exists so the next
agent looking for "the hunter pack" finds the truth instead of a guess.

## The files (all in `../`)

| file | role |
|---|---|
| `Meshy_AI_Lumi_Bot_biped_Animation_Walking_withSkin.glb` | the BODY the avatar loads (`char1`, 8,346 verts, 1.70 m, 24-joint Meshy auto-rig, **no material/textures**) |
| `Meshy_AI_Lumi_Bot_biped_Meshy_AI_Meshy_Merged_Animations.glb` | the 15-clip LIBRARY bound onto that skeleton |
| the other `Meshy_AI_*` per-clip files | same clips as single-file exports; kept because `mesh-avatar.js` (the player path) reads them |

## The 15 clips in the merged library

Alert · Arise · Attack · Axe_Breathe_and_Look_Around · Axe_Stance · Charged_Axe_Chop ·
Crawl_and_Look_Back · Dead · Face_Punch_Reaction · Heavy_Hammer_Swing ·
Lower_Weapon_Look_Raise · Running · Walk_Turn_Left_with_Weapon · Walking · You_Groove

**There is NO double-combo-attack clip.** The follow-up strike role (`combo` in
`src/characters/hunter-mesh-avatar.js` `HUNTER_PACK.roles`) maps to `Heavy_Hammer_Swing`,
which is the pack's only other committed swing. If a real Double Combo Attack export lands,
drop it in `../`, point the role at it, and re-run `node harness/hunter-door.mjs --measure`.

## Measured strike contact (do not hand-edit — the gate re-derives these)

| clip | duration | contact (leading fist arrives) | hand |
|---|---|---|---|
| `Attack` | 2.800 s | **1.050 s** (0.375 of clip) | RightHand |
| `Heavy_Hammer_Swing` | 1.833 s | **1.504 s** (0.820 of clip) | LeftHand |

Method: forward kinematics over the raw GLB tracks at 240 Hz — peak leading-hand speed,
then maximum horizontal reach from the hips. `harness/hunter-door.mjs` recomputes this on
every run and goes RED if `HUNTER_SWINGS` in `hunter-mesh-avatar.js` drifts from the GLB.

## Root motion

Every clip keys `Hips.translation`. **Game owns root XZ** — the avatar flattens hip X/Z to
frame 0 at load (`stripRootXZ`) and keeps Y for the bob. Do not re-add root XZ in a clip.

## What is missing for the locked art (the finding, not a bug)

The locked stage-3 hunter (Dev Art `1785288883855` hero, `1785300149293` turnaround) has
six arms, two heads and a rider torso. **No such mesh exists in this repo** — this pack's
body is the plain biped. Extra arms cannot be conjured by weight painting in JS; that body
needs a fresh Meshy generation + auto-rig. Until then `?hunterm=1` is an honest stand-in
for judging motion and contact timing only. See `hunter-door/README.md`.
