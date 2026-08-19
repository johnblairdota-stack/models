# The gauntlet — subagent roll-out to a playable slice

Read `HANDOFF.md` first for current state. This file is the *plan*: who runs, in what order,
and what gates each phase.

**The strategy in one line: perfect the base robot first, because 20 of the 37 pieces are
built from its parts, then build outward to something walkable.**

---

## The loop, per piece

```
Opus writes a slice plan  ->  Sonnet executes it  ->  Sonnet critic judges it blind
      docs/slices/*.md          ceiling = PASS          only critic sets WOWED
              ^                                                  |
              +------------------ complaints ---------------------+
```

Invoke `rrr-slice` when writing a plan, `rrr-pipeline` when building, `rrr-critique` when
judging. Those three skills carry the traps, the routing evidence and the procedure, so a
brief can stay short and point at them.

**Never let a builder grade its own fix.** Every time that happened here, a critic overturned
it — eight for eight.

**Re-critique after every build.** A verdict describes the frame that existed when it was
written; `audit.mjs` flags stale ones. One piece sat at REJECT 32 for fourteen hours while
the render it described had already been replaced by a working one.

---

## Phase 1 — the base robot, to near-perfect  ⟵ START HERE

**Nothing else starts until this clears.** `src/characters/unit4h.js` is imported by 12
modules; the hunter is this chassis corrupted, the gadgets mount to its sockets, the limb
system reparents its subtrees. Every defect here is inherited twenty times.

| agent | model | owns |
|---|---|---|
| `robot-plan` | Opus | writes `docs/slices/task-robot-N.md` from the critic's ranked list |
| `robot-build` | Sonnet | executes that plan |
| `critic-robot-N` | Sonnet | judges `char.turnaround` blind against the sheet |

Loop until a critic files **PASS or better**. Work the critic's ranked list top-down — it is
ordered by damage, and the top item is usually a silhouette problem, which never recovers by
fixing materials.

**Regression gate, mandatory, every round:** baseline `char.turnaround`, `hunter.3`,
`gadget.nailgun`, `limb.detach`, `game.play` before touching anything; re-shoot after; confirm
all five still render. Keep the exported shape of `buildUnit4H` stable — `root`, `joints`,
`parts`, `limbs`, `sockets`, `setPose`, `detach`, `attach`, `isAttached`, `height`,
`materials`. Everything downstream depends on it.

**Then build `char.detail` and `char.poses`** (both still `NOT_BUILT`) — they are the views
that prove the parts hold up close and articulate correctly, which is exactly what the
downstream models need.

---

## Phase 2 — the parts pay off

Only once phase 1 has a critic PASS. These all consume the base robot and get cheaper the
better it is.

| agent | model | pieces |
|---|---|---|
| `hunter-*` | Opus plan / Sonnet build | `hunter.1/2/3`, `hunter.sheet`, `hunter.absorb` |
| `gadget-*` | Opus plan / Sonnet build | finish `docs/slices/task-gadget-mount.md`; then the five gadgets |

Hunter open items: stage-1 weathering is over-tuned (reads like stage 2 and spends the ramp's
headroom); silhouettes need to escalate upright → gorilla → low quadrupedal; mint caps need
cracking at stage 3; `hunter.sheet` and `hunter.absorb` are unbuilt.

Gadget open items: four of five still read as a held prop rather than a replaced limb —
`gadget.skates` is the one that does it right and is the model; nail gun heat ramp runs
backwards; oil reservoir is unlit; grapple housing has no chrome specular.

---

## Phase 3 — the estate

Can start in parallel with phase 2 — different files, no shared rig.

| agent | model | pieces |
|---|---|---|
| `estate-owner` | **Opus, ONE agent** | `room.study`, `room.ballroom`, `room.gallery`, `prop.chandelier`, `light.dark`, `light.shaft` |

**Rooms and lighting are ONE concern with ONE owner.** Splitting them is what produced a game
frame in flat monochrome amber: one agent set a saturated key, another tuned material
roughness against a different grade, a third owned the post stack, and nobody owned the look.
⚠️ CORRECTED (estate-plan, 2026-08-03, measured off both locked art images): the art contains
**no cool cells at all** — "warm key against cool fill" was wrong. The key is near-neutral
white, the fill saturated warm brown; separation is **chroma-against-value**, not hue
opposition. The rule that stands, now numeric in `docs/slices/task-estate.md`: never saturate
the key — top-decile `(r−b)/L` ≤ 0.14, median pixel luminance 30–60.

`room.study` first: it is the only room with locked art to match
(`Dev Art/1785319916301.png`) and it is the vertical slice most worth seeing.

Materials are ready — marble, walnut, wallpaper, brass exist; plaster is in flight.

---

## Phase 4 — something you can actually play

| agent | model | scope |
|---|---|---|
| `game-owner` | Opus | `game.play` — integration, `src/game/*`, `src/ui/hud.js` |
| `net-owner` | Opus | `net/server.mjs` + `src/net/` — **two clients, one room** |

The systems exist and are unproven together: `limbs.js`, `player.js`, `weapons.js`,
`hunter-ai.js`, `wall.js`, `hud.js`, and the websocket server.

⚠️ **CORRECTED.** This section used to say the server was "277 lines that has never been run
with two clients… the single largest untested claim in the project." **That was wrong.** The
server is 348 lines and `harness/test-net.mjs` — which predates the claim — drives it with three
real `ws` clients and passes 22/22. Verified by `net-smoke`; see `HANDOFF.md` item 5 for the
three real defects it did find (an ungated damage path, no rate limiting, and carried items
leaking on disconnect). The genuine gap is that `src/net/client.js` is **not wired into
`src/views/game.js`** — `game.play` still runs single-authority offline — so the protocol works
but has never run through the actual game loop.

Open on `game.play`: cabinet and floor tiling (a hard reject cue), and the cool light never
reaching the wall, floor or cabinet — which belongs to the estate owner, not the game owner.

### Beyond phase 4 — the session model John wants

`docs/design/session-model.md` records the intended shape: a **QR-joined lobby of 8 players plus
a human hunter on its own device**, with each player choosing split screen (2–4 up), phone as
controller, or phone as the whole game. Netflix's couch co-op is the reference.

It is **direction, not a spec**, and nothing there is scheduled. But two things in it constrain
work happening now, so read it before any perf or networking decision:

- **Split screen multiplies a budget that is already at its limit.** One view currently runs 600
  draw calls against 625, and the scene already renders in four passes — four viewports multiply
  that again. Per-viewport scaling, LOD and `collapseDrawCalls` become load-bearing.
- **A human hunter is asymmetric multiplayer**, not a control swap. The AI must still exist for
  lobbies without one, so both have to stay balanced.

**The perf gate lives here.** 60 fps at 1080p on integrated graphics *while a wall collapses*:
```bash
node harness/shoot.mjs --view game.play --perf --gate --extra "quality=medium" --perfms 28000
```
≤1.39 ms GPU, ≤300 draw calls, ≤900k triangles. Measured over a full loop at the tier
integrated hardware actually selects.

---

## Standing rules

- One owner per coupled concern; run coupled work sequentially. Independent surfaces and
  props can parallelise.
- 3–4 concurrent agents maximum, and **never two measuring perf at once** — GPU timings
  contaminate each other.
- Critics on Sonnet, generously. Builders that must *decide* on Opus. Builders *applying a
  written plan* on Sonnet.
- `node harness/audit.mjs --render` before believing the board.
- When `ART_MANIFEST.md` and the locked art disagree, **the art is the bar** — two measured
  errors in that file have already propagated into builds.
