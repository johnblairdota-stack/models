# Orchestration — how the fan-out is wired

**Status: HALTED.** All five builder subagents were terminated mid-flight by the account
monthly spend limit. The foundation, the harness, the scoreboard and the reference set are
complete and working; 36 of 37 pieces are unbuilt. Raise the limit and relaunch from the
table below — nothing needs redoing first.

## The loop, per piece

```
builder agent                          critic agent (fresh context, hostile)
─────────────                          ─────────────────────────────────────
build / edit its own files
node harness/shoot.mjs --view <id>      node harness/shoot.mjs --view <id> --gate
Read the PNG, compare to refs           Read the PNG cold, form an impression
fix, reshoot, repeat 4-8x               open the Dev Art / refs, compare blind
                                        for wall stages: --crop, identify with no context
status.mjs set … --verdict PASS         status.mjs set … --verdict REJECT --hates "…"
     ceiling is PASS                         only a critic may set WOWED
        ▲                                              │
        └──────────── complaints fed back ─────────────┘
                    until verdict = WOWED
```

The critic never reads source. The builder never sets `WOWED`. Both guides are the
contract: `BUILD_GUIDE.md`, `CRITIC_GUIDE.md`.

## Agents, ownership, dependencies

File ownership is exclusive — this is what lets a dozen agents work the same tree without
collisions. Anything not listed is SHARED and read-only: `src/core/`, `src/post/`,
`src/materials/baker.js`, `src/materials/glsl-noise.js`, `src/views/_studio.js`, `harness/`.

| agent | pieces | owns | needs first |
|---|---|---|---|
| `refs-agent` | — | `refs/` | — **DONE**, 115 images |
| `materials-agent` | mat.marble, mat.walnut, mat.wallpaper, mat.plaster, mat.lath, mat.brass | `src/materials/surfaces/{marble,walnut,wallpaper,plaster,lath,brass}.js`, `src/views/mat-{marble,walnut,wallpaper,plaster,lath,brass}.js` | — |
| `character-agent` | mat.robot, char.turnaround, char.detail, char.poses | `src/materials/surfaces/robot.js`, `src/characters/unit4h.js`, `src/views/{mat-robot,char-turnaround,char-detail,char-poses}.js` | — |
| `wall-agent` | wall.0-4, wall.sheet, wall.transition | `src/destruction/*`, `src/materials/surfaces/wallstages.js`, `src/views/wall-*.js` | refs (done) |
| `estate-agent` | room.ballroom, room.study, room.gallery, prop.chandelier, light.dark, light.shaft | `src/world/*`, `src/lighting/*`, `src/views/{room-*,prop-chandelier,light-*}.js` | materials-agent |
| `hunter-agent` | hunter.1/2/3, hunter.sheet, hunter.absorb | `src/characters/hunter.js`, `src/views/hunter-*.js` | character-agent |
| `gadget-agent` | gadget.{nailgun,oil,skates,grapple,ball}, gadget.sheet, limb.detach | `src/gadgets/*`, `src/views/{gadget*,limb-detach}.js` | character-agent |
| `game-agent` | char.locomotion, game.play | `src/game/*`, `src/net/*`, `src/views/{game,char-locomotion}.js` | all of the above |

Launch order: `materials` + `character` + `wall` in parallel → `estate` + `hunter` +
`gadget` → `game`. Critics run one per piece, after that piece's first `PASS`.

## Still unowned by any agent

- **Multiplayer netcode.** The spec calls for browser multiplayer, server-authoritative
  (mirroring the UE5 README's model: authoritative stage state replicated, cosmetics on
  unreliable multicast). `ws` is already a dependency and `net/server.mjs` is referenced by
  `npm run server` but not yet written. Assign to `game-agent` or its own agent.
- **Audio.** Not in the 37 pieces. Should be, if it is in scope.
- **HUD / limb-inventory UI.** The limb system is the HP *and* inventory system, so it needs
  a real UI piece.

## Commands

```bash
npm run dev                                   # vite on 5178
node harness/shoot.mjs --view <id> --perf     # capture + real GPU timing
node harness/shoot.mjs --all                  # every piece
node harness/shoot.mjs --group wall --gate    # a group, with the perf gate enforced
node harness/shoot.mjs --view <id> --crop x,y,w,h --out <path>   # blind test crop
node harness/shoot.mjs --view <id> --extra "quality=low&ao=0"    # profile one pass
node harness/status.mjs list                  # the scoreboard
```

Live progress page: **http://127.0.0.1:5178/progress/index.html** (needs `npm run dev`).
