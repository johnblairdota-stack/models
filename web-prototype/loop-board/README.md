# THE LOOP — pair-lock sendoff board

Isolated visual design board. Playability critic, not a night slice. **Does not implement.**
John decides. Lead writes the slice if anything here ships.

## Open it

```bash
cd web-prototype
npm run loop:board        # -> http://localhost:5209
npm run loop:check        # board honesty + the cheat list
```

Plain static DOM — no build, no canvas, no night code. Port **5209** on purpose:

| port | whose |
|---|---|
| 5199 | The Desk (own worktree) |
| 5205 | The Night board (`night:board`) |
| 5207 | Hunter board |
| 5178 / 5181 | live product |
| **5209** | **this board** |

`_audio1-mechcheck.mjs` also defaults to 5209 as a one-shot harness. It is not a standing
server. Do not move this board onto Desk / Night / Hunter / live.

## What this is

After PR 67 the pair locks, two chairs stand, then the mansion. John asked how the sendoff
can be better, which camera dramatizes the pick, and which animation to use. This board is
that argument, with four plates and the numbers verified off `pair-lock-stage.js` on `main`.

A lynch-vote people-scene is **Shot C, a separate suggestion.** Do not sneak it into pair-lock.

## Do nots (this folder, this PR)

Do not edit `follow.js`, `accusation-stage.js`, `pair-lock-stage.js`, `intro-bed.js`,
`party-host.js`, `party-phone.js`, or any live night code. Do not add a SHOW beat. Do not
invent a camera into the night. Do not merge.

## If a later slice cheats

The night already has instruments. This board's `loop:check` re-states them so a reader
does not have to hunt. These go **red** if the locked sendoff is broken:

| cheat | gate that reddens |
|---|---|
| `sitLock` dropped on the sendoff stands | `pair-lock-stage` **P3d** (`sitLock stays on` in the stage + intro-bed; no `sitLock = false` in the stage) |
| new `SHOW_BEATS` entry (`sendoff` or a ninth beat with no door) | `pair-lock-stage` **P3a**; `show-beat` **SB2** (partition must cover every `SHOW_BEATS` name) |
| `follow.js` grown a sendoff / pairlock cue or a second follow beat | `pair-lock-stage` **P3e**; `party-follow` **F0c** (`FOLLOW_BEATS.length === 1`) |
| reactors gasp on sendoff | `pair-lock-stage` **P0d** |
| `t:'episode'` pins expedition before SETTLE+FADE | `pair-lock-stage` **P2 / P4** |
| this board's NOW stamp no longer matches the tree | `loop:check` **L0** (this folder) |

`loop:check` is **not** in `gates:party`. The night gates already hold the product. This
file holds the critic copy honest.
