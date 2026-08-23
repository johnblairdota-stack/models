# Meshy hunter clips

Stage-3 hunter, auto-rigged and skinned. Served as `/models/anim/hunter/<file>`.

These files come from the local Meshy pack:

- `assets/hunter-meshy/03-rig`
- `assets/hunter-meshy/04-anims`

Copy the GLBs into this folder. They are large; do not commit them.

| `?clip=` key   | filename                 |
|----------------|--------------------------|
| `walking`      | `walking.glb`            |
| `running`      | `running.glb`            |
| `frankenstein` | `frankenstein-walk.glb`  |
| `orc`          | `slow-orc-walk.glb`      |
| `jump-attack`  | `jump-attack.glb`        |
| `left-slash`   | `left-slash.glb`         |
| `attack`       | `attack.glb`             |
| `double-combo` | `double-combo-attack.glb`|

`NEWHUNTER.bat` refuses to start if `walking.glb` is missing.

Open with `?view=hunter.animated&clip=walking&orbit=1`.
