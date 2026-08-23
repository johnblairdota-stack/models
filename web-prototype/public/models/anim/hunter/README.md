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

Open the **viewer** with `?view=hunter.animated&clip=walking&orbit=1`.

## In the playable game (`?hunterm=1`)

Opt-in. Default `game.play` stays the procedural `buildHunter` so existing playtests
do not move. Double-click `PLAYHUNTER.bat`, or add `&hunterm=1` to a play URL.

In-game clips (only these four):

| AI intent                         | clip key        | file                       |
|-----------------------------------|-----------------|----------------------------|
| patrol / stalk / search / hunt    | walk            | `walking.glb`              |
| pursue                            | run             | `running.glb`              |
| take / slam / door bang           | attack **or**   | `attack.glb`               |
|                                   | double-combo    | `double-combo-attack.glb`  |

`createHunterMeshAvatar` in `src/characters/hunter-mesh-avatar.js` loads `walking.glb`
as the body+rig and binds the other three files' clips onto that skeleton.

Known limits of this unfinished art path:

- Extra arms were Meshy-auto-rigged as a biped. Skin weights on grafted limbs will look wrong. Silhouette still has to read in halls.
- Attack **contact phase is unmeasured**. Damage stays on HunterAI's existing windup / cadence / slam clocks. `HUNTER_SWINGS[].contact` is a labelled placeholder.
- Stage 1/2 morphs are skipped. The mesh is always the stage-3 body. Grow still changes speed / radius / reach and still pulls in an absorbed limb.
- Height matches the AI body (1.7 m). Viewer default is 3.0 m. `?hunterh=` overrides. `?hunteryaw=` is a degrees offset if the pack faces the wrong way.

`?hunterm=0` (or omitting the flag) is the procedural hunter.
