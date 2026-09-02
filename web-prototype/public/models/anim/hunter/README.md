# The hunter clip pack — Meshy stage-3

**There are no GLBs in this folder on purpose.** They are large (~30 MB) and stay
gitignored. The code loads them from here; copy them in from John's Documents pack
before `?hunterm=1` / `hunter.animated` will show the real body.

## Copy the pack

From:

```
C:\Users\John\Documents\Run Robot Run\web-prototype\public\models\anim\hunter\
```

into:

```
web-prototype/public/models/anim/hunter\
```

Need at least these four (each file is a full character + one clip):

| file | role |
|---|---|
| `walking.glb` | **body + walk** — skinned carrier `createHunterMeshAvatar` loads |
| `running.glb` | run clip, bound onto walking.glb by bone name |
| `attack.glb` | attack clip (real strike) |
| `double-combo-attack.glb` | combo clip — **real Double Combo Attack, not Heavy_Hammer_Swing** |

Viewer-only extras if present (`frankenstein-walk.glb`, `slow-orc-walk.glb`,
`jump-attack.glb`, `left-slash.glb`) stay off the in-game path.

Do **not** `git add` the `.glb` files.

## How the load works

`walking.glb` is the skinned body. The other three files donate `AnimationClip`s
that `bindClipToRig` rewrites onto that skeleton by bone name (prefix remap —
Meshy writes `Armature.Hips` in one file and `walking_rig.Hips` in another). A
TRS track that binds to no bone **throws**. Baked Meshy textures stay; they are
not overwritten with `shellWhite` or the hunter grime ramp.

`stripRootXZ` pins hip X/Z to frame 0 at load (game owns root XZ; Y keeps the bob).

## Measured strike contact (do not hand-edit — the gate re-derives these)

Written 2026-09-02 from the on-disk Meshy GLBs (`node harness/hunter-door.mjs --write`):

| file | duration | contact (leading fist arrives) | hand |
|---|---|---|---|
| `attack.glb` | 2.833 s | **1.100 s** | RightHand |
| `double-combo-attack.glb` | 2.867 s | **0.679 s** | RightHand |

Lumi stand-in numbers 1.050 / 1.504 are invalid for this pack. Method: FK over the
raw GLB tracks at 240 Hz. If the files are missing, the gate **skips** D1/D2/D4
(bind, contact, control) and still checks wiring. Re-run `--write` if the pack
files change. Do not commit the `.glb` files.

## What is still a FINDING

Extra arms were Meshy-auto-rigged as a biped. Skin weights on grafted limbs may
look wrong against the locked six-arm art (Dev Art `1785288883855` /
`1785300149293`). That is not a JS paint job. See `hunter-door/README.md`.
