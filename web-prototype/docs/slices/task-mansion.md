# Slice: the mansion — turn `game.play`'s one room into a house you can be hunted through

**Owner: ONE agent, sequential.** This slice touches the room, the AI's navigation, the game
wiring and the capture director at once. Those four are one coupled concern. Splitting them is
how this project produced a flat monochrome amber frame and a `setPose` that wrote into limbs
another agent had detached.

> **If a stated fact turns out to be wrong, say so in your report rather than diverging
> silently.** Assume any unsourced number in these docs is wrong until you re-measure it. Every
> number in *this* file that is marked **[measured today]** was taken on 2026-08-03 by reading
> the code or by driving the running game; anything else is a decision, and decisions are the
> numbers to use.

---

## 0. Why this slice exists

`play-critic-1` and `play-critic-2` both landed on the same thing and it is the deepest open
defect in the build: **the "destructible mansion" is one room.** The sharp statement of it is
not "the room is small" — it is that **the hunter's senses are larger than the level**, so
"unseen" is not a state the map can express, and therefore fleeing, hiding and stalking are
structurally impossible rather than under-tuned.

Re-measured today, from the code and from a driven session:

| fact | value | source |
|---|---|---|
| room interior | **15.6 × 16.8 × 4.80 m** | `room.js` `HALL_W/HALL_D/STOREY` **[measured today]** |
| room diagonal | **22.93 m** (playable bounds diagonal 21.80) | computed / probe **[measured today]** |
| `HUNTER_SENSE.sightRange` | **26 m** — larger than the whole map | `rules.js` **[measured today]** |
| player run speed | `MOVE.run` **5.20 m/s** → the diagonal in **4.4 s** | `rules.js` **[measured today]** |
| spawn separation | **13.04 m**, and the sightline is clear for **20.7% of the first 30 s of patrol, first clear at t = 1.4 s** | probe **[measured today]** |

That last row is the one to read twice. The critic's "scripted death in ~20 s" is right in
substance: line of sight is *blocked* at the spawn instant, but the hunter's patrol curve opens
it 1.4 seconds later and holds it open a fifth of the time. There is no decision in that.

The perception ladder that landed today (`PATROL → ALERT → STALK → PURSUE`, hearing through
walls scaled by player noise, a scanning head) is built for a house. It has nowhere to run.

**This slice builds the house.** It does not add mechanics. Everything it needs — destructible
panels as topology, `portals()` as the AI's routing input, `blocksSight`, the awareness ramp —
already exists and works.

---

## 1. File ownership — exact

### You may edit these, and only these

| file | what you do to it |
|---|---|
| `src/game/room.js` | becomes the mansion graph. Keeps its exported contract (§4). |
| **NEW** `src/game/spaces.js` | the floor-plan data table: spaces, portals, panels, lights, patrol route. Pure data + tiny helpers, no three.js scene work. |
| `src/game/hunter-ai.js` | patrol route, graph waypointing, breach normal, search clamp. §7. |
| `src/game/wall.js` | merge the four reveal boxes into one mesh; expose `panel.normal`. §6.3. |
| `src/views/game.js` | wiring, the light rig, the grade, spawns, residency call, capture director. |
| `src/ui/hud.js` | one addition: `setPlace(name)`. §8. |
| `harness/scenarios/feel-b.mjs`, `feel-c.mjs`, `look-tells.mjs` | de-hardcode the coordinates. §10.1. |
| **NEW** `harness/scenarios/mansion.mjs` | the assertions in §9. |

### You may NOT touch these

- `src/views/room-study.js`, `room-ballroom.js`, `room-gallery.js`, `prop-chandelier.js`,
  `light-dark.js`, `light-shaft.js` — **the estate owner is editing these right now.** File
  timestamps 2026-08-03 01:28–01:45.
- `src/world/materials-local.js`, `kit.js`, `props.js`, `chandelier.js`,
  `src/lighting/*` — same owner. **You consume them read-only. Import and call; never edit.**
- `src/characters/*`, `src/game/limbs.js`, `player.js`, `locomotion.js`, `weapons.js`.
- `src/game/rules.js` — see §7.4. There is exactly one sanctioned change and it is conditional.
- `net/*`, `src/net/*` — see §11.
- `harness/shoot.mjs`, `playtest.mjs`, `grade.mjs`, `audit.mjs`.

⚠️ **`src/views/game.js` was modified at 02:18 today and `src/game/hunter-ai.js` at 01:28.**
Before you write a line, re-read `HANDOFF.md` and confirm no other agent currently owns
`src/game/*` or `src/views/game.js`. If one does, **wait**. Two agents on this pair will break
each other.

---

## 2. The floor plan — decided

Six spaces. Two hubs (**gallery** north, **ballroom** south) joined by **three parallel routes**
(study-west, service passage, study-east), plus one **dead-end spur** (the chapel) hanging off
the far end of the gallery.

This is the appendix's "ring, not a tree" taken one step further: three parallel routes between
two hubs give **three independent cycles**, so there is always another way round *and* the
choice of which route to take is a real decision — the passage is short and narrow, the studies
are longer and full of cover. A plain 5-ring gives you one cycle and one decision ("clockwise or
anticlockwise"); this gives you three.

```
                                        +X →
       x  -14   -10    -6    -2     0    +2    +6   +10   +14
  z=-37.8   ┌───────────────────────────────┐
            │        CHAPEL  6.8 × 6.5      │   the spur. one door, 1.20 m wide.
  z=-31.3   └────────────┬──────────────────┘
                         │ D7  1.20  @ x=+7.60      ← a stage-3 hunter does NOT fit (§2.3)
  z=-31.0   ┌────────────┴──────────────────────────────────────────┐
            │                    G A L L E R Y                       │
            │            27.20 (x) × 6.70 (z) × 5.60 h               │  ← THE long sightline
  z=-24.3   └──────┬───────────────┬───────────────┬────────────────┘
                   │ D1 1.90       │ D2 1.90       │ D3 1.90
                   │ @ x=-8.60     │ @ x=0.00      │ @ x=+8.60
  z=-24.0   ┌──────┴───────┐   ┌───┴───┐   ┌───────┴────────┐
            │              │   │ SERV  │   │                │
            │  STUDY-WEST  │   │ ICE   │   │   STUDY-EAST   │
            │ 11.60×15.40  │p  │ 3.40  │p  │  11.60×15.40   │
            │   4.80 h     │   │×15.40 │   │     4.80 h     │
            │              │p  │       │p  │                │
  z= -8.6   └──────┬───────┘   └───┬───┘   └───────┬────────┘
                   │ D4 1.90       │ D5 1.90       │ D6 1.90
  z= -8.3   ┌──────┴───────────────┴───────────────┴────────────────┐
            │                   B A L L R O O M                      │
            │           27.20 (x) × 15.30 (z) × 7.20 h               │  ← the chase arena
  z= +7.0   └────────────────────────────────────────────────────────┘

  p = destructible panel (2.08 × 2.68, sill on the floor).  All walls WALL_T = 0.30.
```

### 2.1 The numbers — interior clear extents, metres

Walls are 0.30 thick and sit **outside** these extents.

| id | x0 | x1 | z0 | z1 | w | d | storey | longest sightline |
|---|---|---|---|---|---|---|---|---|
| `gallery` | −13.60 | +13.60 | −31.00 | −24.30 | 27.20 | 6.70 | 5.60 | **28.01** |
| `study_w` | −13.60 | −2.00 | −24.00 | −8.60 | 11.60 | 15.40 | 4.80 | 19.28 |
| `service` | −1.70 | +1.70 | −24.00 | −8.60 | 3.40 | 15.40 | 4.80 | 15.77 |
| `study_e` | +2.00 | +13.60 | −24.00 | −8.60 | 11.60 | 15.40 | 4.80 | 19.28 |
| `ballroom` | −13.60 | +13.60 | −8.30 | +7.00 | 27.20 | 15.30 | 7.20 | 31.21 |
| `chapel` | +4.20 | +11.00 | −37.80 | −31.30 | 6.80 | 6.50 | 4.80 | 9.41 |

**Overall footprint 27.8 × 45.4 m; corner-to-corner 53.2 m.** That is the number that fixes the
structural problem: `sightRange 26` is now well *inside* the map, so there are positions the
hunter cannot perceive you from. That — not making rooms small — is the fix.

**Two spaces exceed 26 m and both are deliberate.** The gallery (28.0) is the one authored long
sightline, and its far end is *beyond* the hunter's sight range, which is what makes a first
glimpse down it a glimpse rather than an acquisition. The ballroom (31.2) is the chase arena and
is meant to be exposed; its diagonal is broken by a colonnade (§2.4). **"Unseen" is delivered by
the other four spaces and by the walls between all six — do not try to make the ballroom safe.**

### 2.2 Doorways

All heights `DOOR_H = 2.72`. All widths are **clear** widths.

| id | joins | position | clear width |
|---|---|---|---|
| D1 | gallery ↔ study_w | wall z ∈ [−24.30, −24.00], at **x = −8.60** | 1.90 |
| D2 | gallery ↔ service | same wall, at **x = 0.00** | 1.90 |
| D3 | gallery ↔ study_e | same wall, at **x = +8.60** | 1.90 |
| D4 | study_w ↔ ballroom | wall z ∈ [−8.60, −8.30], at **x = −8.60** | 1.90 |
| D5 | service ↔ ballroom | same wall, at **x = 0.00** | 1.90 |
| D6 | study_e ↔ ballroom | same wall, at **x = +8.60** | 1.90 |
| D7 | gallery ↔ chapel | wall z ∈ [−31.30, −31.00], at **x = +7.60** | **1.20** |

### 2.3 ⚠️ Why 1.90 and not the kit's 1.28 — a live latent bug

`HunterAI` sets `this.radius = 0.30 + this.stage * 0.12` → **0.42 / 0.54 / 0.66** at stages 1/2/3
**[measured today, `hunter-ai.js:560`]**. `room.collide()` is a circle-vs-AABB push-out, so a
doorway needs **more than 2 × radius of clear width** for the hunter's centre to pass.

`kit.js`'s `DOOR.w` and `room.js`'s `DOOR_W` are both **1.28 m**. A stage-3 hunter needs
**1.32 m**. **The stage-3 hunter cannot pass through the game's only door today.** It has never
been seen because `HUNTER_GROWTH.toStage3 = 7` absorbed parts and the 26 s capture loop never
gets there, and because the AI usually breaches a 2.08 m panel first.

So: **1.90 m for every circulation door** — 0.58 m of margin over the stage-3 diameter, which is
what stops the push-out from jamming at an angle.

**D7 is 1.20 m on purpose, and it is a mechanic, not an oversight.** Stages 1 and 2 fit (need
0.84 / 1.08). **Stage 3 does not.** The chapel is therefore safe from the hunter *until it
grows*, and after it grows the only way in is `p.chapel` — a ~4.7 s breach (§2.5) that is loud
and completely readable. Growth becomes a spatial trade-off. State this in your report as an
intended behaviour so a critic does not file it as a bug.

### 2.4 The ballroom colonnade

Six columns across the middle of the ballroom at **z = −0.65**, at
**x = −11.0, −6.6, −2.2, +2.2, +6.6, +11.0**, each **0.95 × 0.95 m** square in plan, full
storey. Emit them into the `GeoBin` under the `mould` key (one merged mesh, no extra draw call)
and register each as a collider box.

Their job is occlusion, not decoration: they break the 31 m diagonal *sometimes*, which is what
an arena wants — partial cover you have to use well, not a guarantee.

**No chandelier in this slice.** `src/world/chandelier.js` exports `cut()`, `detach()` and
`shatterDrop()` and the droppable-chandelier trap is a good idea — but that file was edited at
01:38 today by another owner and `prop.chandelier` is a whole view's worth of meshes that is not
in this budget. It is a follow-up slice. Say so in your report; do not build it.

### 2.5 Destructible panels — where the topology becomes a decision

Eight panels, all `PANEL_W 2.08 × PANEL_H 2.68` with the sill on the floor
(`PANEL_CY = 1.34`), exactly as `room.js` builds them today.

| id | in the wall | position | `rotY` | what breaching it adds |
|---|---|---|---|---|
| `p.svc_w.n` | service ↔ study_w (x = −1.85) | z = −20.00 | π/2 | a chord out of the passage into the west den |
| `p.svc_w.s` | service ↔ study_w (x = −1.85) | z = −12.20 | π/2 | the same, at the ballroom end |
| `p.svc_e.n` | service ↔ study_e (x = +1.85) | z = −20.00 | π/2 | mirrored |
| `p.svc_e.s` | service ↔ study_e (x = +1.85) | z = −12.20 | π/2 | mirrored |
| `p.gal_w` | gallery ↔ study_w (z = −24.15) | x = −12.00 | 0 | a second way out of the west den |
| `p.gal_e` | gallery ↔ study_e (z = −24.15) | x = +12.00 | 0 | mirrored |
| `p.bal_w` | study_w ↔ ballroom (z = −8.45) | x = −3.60 | 0 | short-cuts D4 by ~5 m |
| `p.chapel` | gallery ↔ chapel (z = −31.15) | x = +5.60 | 0 | the only way a stage-3 hunter enters the spur |

**Measured cost of a breach [measured today, `destruction/wall.js` `STAGE_DEFS`]:**
total health to open = 40 + 70 + 55 + 90 = **255**.

- hunter: `hunterSlam` 46 per swing at 0.85 s → **5.5 swings, ≈ 4.7 s**. Loud, visible, escapable.
- player with the nailgun: 26 at 0.13 s → **10 shots, ≈ 1.3 s**.

**A breach costs the player 1.3 s and no resource, so the decision is not the cost — it is the
consequence.** Firing sets `noise` to 1.0, which is audible at `hearRange 14 m` through walls,
and the hole is permanent and bidirectional: the hunter routes through it too. Both of those are
already implemented. **Do not add a cost. Do check, in your report, that the breach is loud** —
assertion A9.

Also worth designing around: **stage 3 (`beam`) blocks movement but blocks neither sight nor
shots** **[measured today]**. A part-broken panel is a window you can watch and shoot through
but not walk through. In a house that is a genuinely good stealth object. Do not "fix" it.

---

## 3. Reuse — decided, and one document is wrong about it

### 3.1 ⚠️ `room-*.js` are VIEWS, not builders. They cannot be instantiated at all.

`docs/slices/task-estate.md`'s appendix says the estate owner's job is "only to keep each
`room-*.js` builder parameterised enough … that it can be instantiated twice". **Checked
against the files: they are not builders.** Each of `room-study.js` (700+ lines),
`room-ballroom.js`, `room-gallery.js` exports a single `default async function view(args)` that
creates its own `estate()` engine, sets its own camera, its own `scene.environment`, its own
`environmentIntensity`, its own `pipeline.setGrade()`, its own light rig and its own volumetrics
before it draws a single wall. There is no separable geometry function in any of them.

Making them instantiable is a real refactor of three files that **another agent is editing right
now**. So:

> **DECISION: the mansion does not instantiate the showcase views, and does not refactor them.
> It builds its own geometry from `kit.js`, exactly as `src/game/room.js` already does.**

That is not a compromise — it is what `room.js` was designed for. It already does
`tryImport('../world/kit.js')`, already uses `GeoBin`, already falls back to plain boxes when the
kit is not there, and its header already says the swap-in point is `buildTestRoom`. You extend
that, you do not replace it.

**Report this discrepancy.** The estate appendix's "instantiable twice" obligation should be
retired or rewritten, because nothing in this slice depends on it.

### 3.2 What you actually consume, and the measured reason it is affordable

**[measured today]** — scene census of the running `game.play` and of `room.study`:

| | meshes | k-tris | materials | lights |
|---|---|---|---|---|
| `game.play` — the whole `room` group | **37** | **1** | 22 | — |
| … of which the 4 destructible panels | **32** | ~0 | 17 | — |
| … so the entire GeoBin-merged shell is | **5** | ~1 | 5 | — |
| `game.play` — player | 70 | 51 | 17 | — |
| `game.play` — hunter (all three stage rigs) | **322** | **209** | 45 | — |
| `game.play` whole scene, live | — | 350 | — | **7** |
| `room.study` whole scene | 144 | 138 | 48 | 7 |
| … of which the two UNIT-4H figures + floor mirror | 80 | 103 | — | — |
| … so `room.study`'s **architecture + props** | **≈ 64** | **≈ 35** | — | — |

Read that table twice too. **A fully-dressed showcase room's architecture is about 64 meshes and
35k triangles**, and **the current game room's entire shell is 5 meshes** because `GeoBin` merges
by material key. Architecture is cheap here; **the destructible panels are 86% of the room's mesh
count**, and the hunter is 60% of the scene's triangles.

So the palette is small and the geometry is merged:

| key | source | used by |
|---|---|---|
| `floor` | `parquetMat({size:1024})` — already baked today | studies, service, gallery, chapel |
| `marble` | `estateMarbleChequer()` — **1 new bake** | ballroom floor |
| `wall` | `boiserieMat({paint:[0.126,0.086,0.062], grime:0.9, size:1024})` — already baked | all wall fields |
| `paper` | `wallpaperMat({size:1024})` via `materials/surfaces/wallstages.js` — **likely a cache hit**, `wallStageMaterials` already bakes it for every panel | gallery walls |
| `ceiling` | `ceilingMat({size:512})` — already baked | all |
| `mould` | `giltMat({wear:0.55, size:512})` — already baked | cornices, pilasters, columns, door cases |
| `skirt` | `stoneMat({stone:[0.20,0.175,0.15], size:512})` — already baked | skirtings |
| `reveal` | plain `MeshStandardMaterial` | panel reveals |

**Eight keys → at most eight merged meshes per space.** Six spaces fully resident would be 48
meshes; residency (§5) keeps it to three spaces, so ~24.

**How to consume `materials-local.js`:** keep `room.js`'s existing runtime `tryImport` pattern
(`loadMaterials()`), extended with the two new entries and their plain-PBR fallbacks. **Do not
call `estateMaterials()`** — it is a lazily-getter'd, globally-cached object owned by the estate
agent, it dynamic-imports four sibling modules, and coupling the game's load path to it while it
is being edited is exactly how this project breaks.

### 3.3 Load time is the real budget risk here — gate it

**[measured today]** `game.play` reports `bake: "baked 29 sets (22 cache hits) · 225.1 MB VRAM ·
26340 ms"`. `harness/shoot.mjs` waits **60 000 ms** for `markReady()`. `materials-local.js`'s own
header records that its eleven owned surfaces cost 7.8 s while marble + walnut + wallpaper +
plaster cost 54 s — bakes here are **D3D shader compilation**, not texel throughput, so a new
surface is expensive out of all proportion to its size.

> **DECISION: at most TWO new baked surfaces (`marble`, `paper`), and the gate is
> `perf.bake ≤ 38 000 ms`.**
> If the measured bake exceeds 38 s: **drop `paper` first** (use `wall` for the gallery),
> then **drop `marble`** (use `floor` for the ballroom). Report which you dropped. Do not add a
> third surface to "balance" the palette.

### 3.4 The grade — take the study's round-4 numbers

`game.js` sets its own grade inline and **that grade is the pre-round-4, measured-wrong one**:

```js
// game.js today  [measured today]
splitBalance: 0.72, shadowTint: [0.74, 0.86, 1.14], highlightTint: [1.05, 1.0, 0.94],
exposure: 1.34, vignette: 0.34, toeCrush: 0.045, haze: 0.055, contrast: 1.04, saturation: 0.98
```

`shadowTint [0.74, 0.88, 1.18]` is the exact value `GRADES.study` carried before round 4
inverted it. `rig.js`'s own comment records why: the locked art's **dark end is the warmest part
of the image**, its coolest cell of 144 is still warm, and the amber it was meant to counter was
at the **top**, where a warm `highlightTint` was putting it.

> **DECISION: `game.js` adopts `GRADES.study`'s round-4 direction:**
> ```js
> shadowTint: [1.05, 0.96, 0.84],      // warm shadow
> highlightTint: [1.015, 1.00, 0.985], // colourless highlight
> vignette: 0.24, vignetteRound: 0.92,
> toeCrush: 0.005,
> splitBalance: 0.60,
> ```
> Keep `exposure 1.34`, `haze 0.055`, `contrast 1.04`, `saturation 0.98` as the starting point,
> then **tune exposure and haze only** until `grade.mjs` passes §12.3.

⚠️ **A stated fact in the brief for this slice is imprecise and you should know which source is
authoritative.** The brief said "the §9 recommendation: neutral highlightTint, warm shadowTint,
no vignette". `task-estate.md` §9 makes **no such recommendation** — it explicitly defers ("write
the recommendation in your report … do not make the edit"), and §4's *prose* still says the
opposite ("keep the grade's cool `shadowTint`"). The authoritative source is
**`GRADES.study` in `src/lighting/rig.js`**, which round 4 changed to warm-shadow /
colourless-highlight / vignette 0.24 and documented with before-and-after measurements. Use the
code, not the prose, and say so in your report.

---

## 4. The contract `room.js` must keep

Only `src/views/game.js` imports it **[measured today — one import site]**. But five other
systems consume the object it returns, so the shape is load-bearing:

| member | consumed by | must still |
|---|---|---|
| `root` | `game.js` | be one Object3D added to the scene |
| `floorY` | `LimbField`, `DebrisSystem`, `HunterAI._integrate` | be a number |
| `bounds` | `LimbField` | be `{minX,maxX,minZ,maxZ}` — the **union** AABB of all spaces |
| `panels` | `game.js` FX wiring, `resetRound()`, `?stages=` debug hook | be a **flat array** of every `DestructibleWall` in the mansion |
| `collide(pos, r)` | `Player.update`, `HunterAI._integrate` | return a Vector3 |
| `castRay(o, d, max, opts)` | `WeaponSystem.fire`, `ThirdPersonCamera._boom`, `HunterAI._steerTo/_blockingPanel` | return `{point,distance,normal,panel}` or null |
| `blocksSight(a, b)` | `HunterAI._sense`, three scenarios | return boolean |
| `spawn` | `game.js`, `resetRound()`, `feel-a.mjs` | keep `{player:Vector3[], hunter:Vector3, breaches:Vector3[]}` |
| `portals()` | `HunterAI._waypoint` | see §4.1 |
| `update(dt)` | `game.js` | tick every panel |

Additions (new, and only these):

```
spaces           Space[]                       — the six, in table order
spaceAt(v3)      -> Space | null               — AABB test, expanded 0.6 m
setViewpoint(pos, dir)                          — residency, §5. RENDER ONLY.
pathPortals(from, to) -> Portal[]              — BFS over OPEN portals, §7.2
anchor(name)     -> Vector3                    — named test/spawn points, §10.1
```

### 4.1 `portals()` — the one contract change

Today it returns `[{x, z, w, kind}]` with **`z` hardcoded to 0**, because there is one divider.
It becomes:

```js
{ id, a: spaceId, b: spaceId, centre: Vector3, axis: 'x'|'z', w, kind: 'door'|'breach', panel? }
```

`kind: 'breach'` entries appear only while `!panel.blocksMovement()`, exactly as today. `axis` is
the axis the portal's **width** runs along.

### 4.2 ⚠️ Residency is a RENDER concept and nothing else

`collide`, `castRay`, `blocksSight`, `portals()` and `update()` **must ignore visibility
entirely**. Every collider in the mansion is always live.

This is not a style preference. `ThirdPersonCamera` raycasts the world to keep the boom out of
walls, and the measured history here is that a 1.55 m camera floor pushed the boom through a
4.8 m wall and rendered black **[HANDOFF]**. If a hidden room's colliders went away, the boom
would sail into an invisible room and the frame would go black — and it would only happen in
live play, which is the exact failure class that cost this project thirty rounds.

**Assertion A8b exists to catch this. Do not skip it.**

### 4.3 Keep `castRay`/`blocksSight` from getting 6× slower

Bucket colliders **per space**. A segment test walks only the spaces whose AABB the segment
crosses:

```js
function spacesOnSegment(a, b) { /* AABB-vs-segment, 6 tests */ }
```

Then iterate those spaces' collider arrays plus the panels on their shared walls. This keeps
`blocksSight` at roughly today's cost even though the world is six times bigger — and it matters
because `_sense` calls it once per candidate per frame, and the session model puts **eight
players** in that loop eventually.

---

## 5. Residency, visibility and perf — decided

### 5.1 The budget, measured today

```
node harness/shoot.mjs --view game.play --perf --gate --extra "quality=medium" --perfms 28000
```

**[measured today, `progress/shots/game.play.perf.json`, 2026-08-03 01:30]**

| | measured | budget | headroom |
|---|---|---|---|
| GPU | **1.25 ms** | 1.389 | 0.14 |
| CPU | **1.69 ms** | 2.00 | 0.31 |
| draw calls | **296** | **625** | **329** |
| triangles | **285 502** | 900 000 | 614 498 |
| worst frame | 4.0 ms | — | — |
| bake | 26 340 ms | (60 s ready timeout) | ~34 s |

**The draw-call budget is 625, not 300.** `shoot.mjs` computes
`calls = round(6.5 / (0.0026 × CPU_RATIO)) = 625`. `GAUNTLET.md`'s "≤300 draw calls" is wrong;
`task-estate.md` §11 already corrects it. Gate against 625.

**And say this plainly in your report, because it changes what the split-screen note means:**
`game.play` already measures 296 calls — i.e. **the 300-call "direction of travel" quoted in
`unit4h.js` is already spent, and it is spent on the characters, not the rooms** (the hunter
alone is 322 meshes / 209k triangles). Four-way split screen is foreclosed today by the robots.
The mansion's job is to not make that worse. Residency is how.

**Conversion, measured:** at live/high the scene ran **410 calls** over ≈226 visible meshes
(≈1.8 calls/mesh); the recorded medium run was 296 calls. **Budget ≤ 180 additional visible
meshes and verify by measuring, not by arithmetic.**

### 5.2 The residency rule — decided

```js
room.setViewpoint(camera.position, camera.getWorldDirection())   // once per frame, from game.js
```

- `cur` = `spaceAt(camPos)`. If null (a doorway), **keep the previous** — never flicker.
- A neighbour space `n` is resident iff it is joined to `cur` by a portal `p` that is **open**
  and:
  - `dist(camPos, p.centre) ≤ PORTAL_VIS_DIST = 16.0`, **and**
  - `(p.centre − camPos) · camDir ≥ −0.35` (roughly: the portal is not behind you).
- `space.root.visible = resident.has(space)`.
- A panel is visible iff **either** of the two spaces it joins is resident.
- **Hysteresis: a space that leaves the set stays visible for 0.25 s.** Same lesson as the
  awareness ladder's `DROP = 0.62` — a threshold crossed going up is not the same threshold
  going down, and a room that blinks reads as broken.

There is **no hard cap of 3**; a cap can hide a room you are looking into, which is a worse
artefact than a draw call. Instead, **A8 asserts that the visible-space count never exceeds 3
over a scripted lap.** If it does, lower `PORTAL_VIS_DIST` to 13.0 and re-measure. That is the
only knob; report the value you shipped.

### 5.3 ⚠️ The light rig must NOT change light COUNT — ever

`hunter-ai.js` `_setFlare()` documents the measured failure: adding or removing a light changes
`numPointLights`, which is part of three.js's program cache key, so **every toggle recompiles
every material in the scene**. Driving one light off an AI state took a clean 1.28 ms capture to
"execution context destroyed", with a 2.5 s worst frame on the way.

> **DECISION: one fixed light rig for the whole mansion — same count as today (6 + the
> hunter's flare). Lights are REPOSITIONED per space, never added or removed, and never dropped
> to intensity 0** (a zero-intensity light still costs a full fragment-loop iteration over walls
> that fill the screen — `task-estate.md` §12).

| light | type | behaviour |
|---|---|---|
| `key` | SpotLight, `castShadow` | position + target lerp to `space.key` over **0.35 s** |
| `warmA`, `warmB` | PointLight | lerp to `space.warm[0..1]` |
| `cool` | PointLight | lerps to `space.cool` — placed **on the far side of the space's principal doorway**, so anything standing in a portal is rimmed. That is `game.js`'s existing `rim` idea, generalised. |
| `fill` | HemisphereLight | scene-wide, never moves |
| (`flare`) | PointLight | owned by `hunter-ai.js`, unchanged |

Colours and intensities live in `spaces.js` per space. **Exactly one shadow caster** — as today.

### 5.4 Precompile must cover every space's materials

`finalizeScene()` compiles by walking **visible** objects, and `precompileStages()` exists
because stages 2 and 3 were hidden and their shaders were built on the frame the hunter grows —
a measured **2498 ms** frame. Hidden rooms are the same trap.

> **DECISION, and it is one ordering:**
> ```js
> for (const s of room.spaces) s.root.visible = true;   // everything visible
> engine.finalizeScene();                                // patches + compile pass sees it all
> hunter.precompileStages(engine);                       // compiles both light-count variants
> room.setViewpoint(engine.camera.position, dir);        // NOW apply residency
> engine.markReady();
> ```
> `finalizeScene()` also runs `patchForScreenAO` over every standard material in the scene, so
> it must see all six spaces or a hidden room's materials get a different program later anyway.

**Verify it worked:** A12 asserts `frameMaxMs ≤ 40` over a scripted lap that enters all six
spaces. A first-visit shader hitch shows up as a single frame in the hundreds of milliseconds.

### 5.5 Panel mesh cost — one cheap win, take it

Each `DestructibleWall` builds **8 meshes**: 4 layer planes (unique materials, cannot merge) and
**4 reveal boxes that all share one material** **[measured today]**. Merge the four reveals into
one `BufferGeometry` in the constructor → **5 meshes per panel**, saving 3 meshes × 8 panels =
24 meshes ≈ 43 draw calls. This is in `src/game/wall.js`, which you own.

Nothing else about `wall.js` changes except §6.3.

---

## 6. Spawns and the opening beat — decided

### 6.1 Spawns

```
spawn.player[0]  = (-8.60, 0, -11.60)   STUDY-WEST, south end, facing north (facing = 0)
spawn.player[1]  = (-6.20, 0, -11.60)   second player, same room
spawn.hunter     = ( +9.00, 0,  +4.20)  BALLROOM, south-east corner
spawn.capture    = (-12.00, 0, -27.60)  GALLERY west end — the capture director only (§8.3)
```

Straight-line player↔hunter distance **23.7 m**; shortest walk **≈ 25 m** through D4; and
`blocksSight` is **true** for every point in study_w against every point in the ballroom, because
two walls are between them.

`player.facing = Math.PI` and `player.aimYaw = Math.PI` — **`facing` is `atan2(dx, dz)`, so 0
points toward +Z and π points toward −Z (north)**. `game.js` uses π today for the same reason;
getting this backwards spawns the player staring at a wall.

### 6.2 The first 60 seconds — delivered by geometry, not by a script

The requirement is that the player gets an unthreatened read of the space before first contact
pressure. **Do not implement a grace timer.** A scripted immunity is cheap, exploitable and
invisible to the player. The map already does it, and here is the arithmetic:

- Walking noise is **≈ 0.49** **[measured, `feel-b.mjs`]**; `hearRange × noise = 14 × 0.49 =
  6.9 m`. Sprinting is 1.0 → **14 m**.
- The hunter starts **24 m** away with two walls between. **Even sprinting, the player is
  inaudible at spawn.** `awareness` stays at 0.
- `PATROL_ROUTE`'s first three waypoints (§7.1) walk the hunter **east and north through the
  ballroom, away from D4/D5**, so it is ≥ 20 m from study_w for the first ~14 s.

That gives, without a single special case:

| t | what happens |
|---|---|
| 0 – ~14 s | **awareness 0.** The player reads the study: the severed arm on the floor (the nailgun already costs `shoulderL`), the `[E] TAKE` prompt, three ways out. |
| ~14 – 25 s | The hunter reaches the ballroom's north side. A player who **sprints** is now inside 14 m and gets the **ALERT tell**: it stops dead, turns, the eye lights. A player who **walks** is still silent. **The first real choice in the game.** |
| ~25 – 45 s | The route takes the hunter up the service passage and into the gallery. If the player went north, the **first glimpse** is down the gallery at ≥ 20 m (§6.3). |
| 45 s+ | Contact on the player's terms or the hunter's. |

**Assertion A5 measures exactly this**: driving the intended route at walk speed, first `ALERT`
at **t ≥ 20 s**, first `PURSUE` at **t ≥ 30 s**, no limb lost before **t = 45 s**.

### 6.3 The first glimpse — what the gallery is for

`sightGain` is linear in `k = 1 − d/26`, from `sightGainFar 0.40` to `sightGainNear 1.55`
**[measured today, `rules.js`]**. At **25 m** that is 0.444/s, so:

| beat | seconds after the hunter first sees you at 25 m |
|---|---|
| ALERT (`alertAt 0.22`) | 0.50 |
| STALK (`stalkAt 0.55`) | 1.24 |
| PURSUE (`commitAt 1.00`) | 2.25 |
| …then 25 m at `HUNTER_SPEED[1] = 2.05 m/s` | +12.2 |

**≈ 14.5 s of warning from a 25 m glimpse**, against a player who runs at 5.20 m/s. That is a
horror beat with a real escape in it, and it is the beat the current map cannot stage at all.
The gallery's 28.0 m length exists to buy that. **A3 asserts ≥ 20 m and takes a picture.**

Note the asymmetry the ladder already gives you and do not break it: **`soundCeiling 0.86` is
below `commitAt 1.00`, so noise alone can never make it run.** Sound brings it into your half of
the house; only sight commits it.

---

## 7. Hunter navigation across the graph

### 7.1 `_patrol` — a route, not a figure-of-eight

Today: `sin(t·0.21)` around `room.spawn.hunter`. Replace with a route walked in order.

`spaces.js` exports `PATROL_ROUTE` — an ordered loop touching **all six spaces**:

```
 0  ballroom  (+9.0,  +4.2)  dwell 2.0     ← spawn; leg 0→1 walks AWAY from study_w
 1  ballroom  (+11.5, -5.5)  dwell 1.5
 2  study_e   (+8.6, -12.0)  dwell 2.5
 3  study_e   (+4.0, -21.0)  dwell 2.0
 4  gallery   (+11.0, -27.6) dwell 3.0     ← faces west, down the full 27 m
 5  chapel    (+7.6, -34.5)  dwell 2.5     ← the spur is patrolled, so hiding there is a gamble
 6  gallery   (0.0, -27.6)   dwell 2.0
 7  gallery   (-11.0, -27.6) dwell 3.0     ← faces east, down the full 27 m
 8  study_w   (-8.6, -21.0)  dwell 2.0
 9  study_w   (-4.0, -12.0)  dwell 2.5
10  service   (0.0, -16.0)   dwell 2.0
11  ballroom  (0.0, -4.0)    dwell 1.5     → back to 0
```

- Steer at `HUNTER_SPEED[stage] * 0.38` (unchanged).
- Within **1.2 m** of the waypoint, stop and **dwell** — velocity damped, `_scanStep` running at
  full amplitude. A hunter that stops and looks is the cheapest horror in the game and the route
  should be mostly made of it.
- Route legs between non-adjacent spaces go through `pathPortals` (§7.2), not in a straight line.
- Leaving SEARCH resumes at the **nearest** route index, not index 0.

**Expect a slow lap and do not "fix" it.** Patrol speed is `HUNTER_SPEED[1] × 0.38 = 0.78 m/s`
**[measured today, unchanged]**; the route is ≈ 106 m plus ≈ 25 s of dwell, so **one patrol lap
is ≈ 160 s**. That is correct for a stalker and it is what makes the opening beat work. Budget
scenario run-times around it — several assertions will need to teleport the hunter to an anchor
rather than wait for it, and that is fine as long as they say so.

### 7.2 `_waypoint` — BFS over open portals

`room.pathPortals(from, to)`:
- BFS on the space graph. An edge exists for every door, and for every panel with
  `!panel.blocksMovement()`. **A player-made breach is a door to the AI**, which is the whole
  point and is already true today.
- Returns the ordered list of portals. Cache per `(fromSpace, toSpace)`; **invalidate whenever
  any panel changes stage** (hook `panel.state.onStageChange`) and recompute at most every
  **0.4 s**.

`_waypoint(goal)` becomes: take the first portal on the path and **keep the existing two-beat
approach**, generalised to the portal's axis —

> line up square in front of the opening on **this** side (offset **1.15 m** along the portal's
> normal toward the hunter), and only once within **0.55 m** of the portal's axis, aim at a point
> **1.15 m past it** on the far side.

**Carry that technique exactly; do not reinvent it.** Its comment records why: aiming at a point
on your own side of a wall is a waypoint you have already reached, and an AI that does that
slides along the wall forever looking like a thing that cannot find the door.

### 7.3 `_breach` — the hardcoded axis is a bug in waiting

```js
// hunter-ai.js today  [measured today]
this.weapons.hitWall(p, hit, new THREE.Vector3(0, 0, this.root.position.z > 0 ? -1 : 1), 'hunterSlam');
const hit = _v2.set(p.root.position.x + jitter, p.root.position.y + jitter, 0);   // z pinned to 0
```

Both lines assume every panel lies on the `z = 0` plane. Four of the eight new panels have
`rotY = π/2`.

- Add `get normal()` to `DestructibleWall`: `(sin(rotY), 0, cos(rotY))`. Feed the slam direction
  from `-sign((hunterPos − panelPos) · normal) * normal`.
- Build the jittered hit point in the **panel's local frame** and transform it, instead of pinning
  z to 0.

### 7.4 Sense ranges — change NOTHING in `rules.js` yet

`HUNTER_SENSE` was re-measured and rewritten **today**, and the map is what changed, not the
senses. With a 53 m map and a 26 m sight range, **out-of-range positions now exist**, which was
the entire structural complaint.

> **DECISION: `HUNTER_SENSE` is untouched through M1–M3.** At M4, run the assertions. If A2
> (warning window) or A5 (opening beat) fail, the **only** sanctioned edits are
> `HUNTER_SENSE.loseAfter` and `HUNTER_SENSE.searchFor`, and only **after** you report the
> measurement that justifies it. If anything else looks wrong, report it; do not tune it.

Two behavioural fixes that are **not** tuning and should land:

1. **Clamp the SEARCH spiral to the hunter's current space.** `_search` sweeps a spiral that
   reaches `1.2 + 9.0 × 0.55 = 6.15 m` **[measured today]**, which in a house will steer it into
   a wall for most of nine seconds. Clamp the spiral target to the current space's bounds inset
   by 1.0 m.
2. **Resume patrol at the nearest waypoint** (§7.1), not at the start.

---

## 8. Systems touched — exact work per file

### 8.1 `src/game/spaces.js` (new) — data only

Exports `SPACES` (§2.1 + lights + props), `PORTALS` (§2.2), `PANELS` (§2.5), `PATROL_ROUTE`
(§7.1), `ANCHORS` (§10.1). **No three.js scene work, no imports beyond `three` for Vector3.**
Keeping the floor plan as a table is what lets a later agent change the house without reading
the builder.

### 8.2 `src/game/room.js`

`buildTestRoom(engine, o)` keeps its name and signature (it is the only import site) and gains
`buildMansion` as an alias export. For each space in `SPACES`:

- one `GeoBin`; floor slab, ceiling slab, four walls with `wallRun`-style openings cut for its
  portals (carry `room.js`'s existing cut-and-infill loop — it already does exactly this for the
  divider), skirtings, a cornice band, pilasters, and for the ballroom the colonnade.
- `bin.build(...)` into `space.root`; register a collider `Box3` for every solid piece.
- panels from `PANELS`, added to `space.root` of the **lower-id** space of the pair, and pushed
  into the flat `room.panels` array.
- `space.bounds`, `space.aabb`, `space.lights`.

Then the graph: `spaceAt`, `spacesOnSegment`, `pathPortals`, `setViewpoint`, `anchor`,
`portals()`, plus `collide` / `castRay` / `blocksSight` rewritten to iterate per-space buckets.

⚠️ **`collide()` currently clamps to a single rectangle:**
```js
_out.x = Math.min(bounds.maxX, Math.max(bounds.minX, _out.x));
```
With a union bounds that clamp is at best useless and at worst traps an actor in the
bounding rectangle of an L-shaped house. **Replace it with a clamp to the actor's CURRENT
space's bounds, applied only when `spaceAt(pos)` is non-null** — so a body in a doorway is
governed by the collider boxes alone, which is correct.

### 8.3 `src/views/game.js`

- Light rig → the fixed pool of §5.3, driven from `space.lights`.
- Grade → §3.4.
- `player.pos.copy(room.spawn.player[0])`, `player.facing = Math.PI`, `aimYaw = Math.PI` (§6.1).
- `hunter` at `room.spawn.hunter`.
- `LimbField` gets the **union** bounds (unchanged behaviour; limbs already do not collide with
  interior walls, so this is not a regression — note it, do not fix it here).
- Per frame: `room.setViewpoint(engine.camera.position, camDir)` **before** rendering, and
  `hud.setPlace(room.spaceAt(player.pos)?.name)` when it changes.
- `resetRound()` — unchanged in shape; it already iterates `room.panels` and `room.spawn`.
- **The capture Director must be rewritten.** It currently hardcodes `this.room.panels[1]` at
  x = −2.6 and drives a straight z-axis advance. **Leave it as-is and every screenshot, every
  `audit.mjs --render` and every critic verdict on `game.play` becomes a robot walking into a
  wall.** New 28 s loop, starting at `spawn.capture`:

| T | beat |
|---|---|
| 0.0 – 2.2 | hold at the gallery's west end looking east: the full 27 m recession, the chapel door at the far end. **This is the "read of the space" frame — shoot it at `--at 1.2`.** |
| 2.2 – 8.0 | walk east to x ≈ −4.0 |
| 8.0 – 13.0 | turn south into the service passage, advance to z ≈ −14.0, face west at `p.svc_w.s` and open fire |
| 13.0 – 17.5 | the panel breaks; the hunter — pulled by the gunfire, which is `noise = 1.0` at 14 m — arrives at the passage's south mouth. **Hero frame at `--at 15.5`.** Retreat north, still firing |
| 17.5 – 23.0 | back into the gallery, run west |
| 23.0 – 28.0 | pick a limb up off the floor |

  Set `const LOOP = 28.0`. **The director must not set `hunter.state`, `hunter.awareness` or any
  wall stage directly** — it walks, aims and pulls the trigger, and the systems do the rest. That
  discipline is why the capture is a real playthrough and it is written into the class's own
  header. The hunter arrives because `PATROL_ROUTE[11]` puts it in the ballroom within 14 m of D5
  at t ≈ 9 s and the gunfire is audible through the wall. **If it does not arrive reliably, adjust
  the route's dwell times — not the AI.**

### 8.4 `src/ui/hud.js`

One addition: `setPlace(name)` — a caption at top centre for **2.2 s** when the space changes,
same style as the existing `say()`. **No minimap.** A minimap would hand the player the hunter's
position or the map's shape for free and would delete most of what this slice is building; and
it is UI work that is not in this budget. Say so in your report if a critic asks for one.

### 8.5 `src/game/wall.js`

Only two changes: merge the four reveal boxes (§5.5), and add `get normal()` (§7.3). **Do not
touch the break-mask code or `pinProgramKey`** — the comment there records a measured trap
(identical program cache keys made panels 1–3 refuse to break) and `wall.sheet` holds this
project's only critic-awarded PASS.

---

## 9. What "done" looks like — the assertions

All in `harness/scenarios/mansion.mjs`, run through
`node harness/playtest.mjs --view game.play --script harness/scenarios/mansion.mjs --shots`.
**A probe that cannot observe reports SKIP, never PASS.** Cross-check every measurement against
a second, differently-shaped observation — a canvas `luma()` probe on this project returned a
confident **0 for every case** and a threat-overlay probe measured **opacity 0 on a layer that
paints perfectly well**.

| # | assertion | measurable |
|---|---|---|
| **A1** | **Break contact is possible.** From `PURSUE` at ≤ 6 m, a player running the ring reaches `state === 'SEARCH'` **within 25 s** without losing a limb — from **at least 3 of the 4** starting spaces `study_w / study_e / service / ballroom`. | state transition + `rig.caps` |
| **A2** | **Warning window ≥ 6.0 s.** First frame `state === 'ALERT'` → first frame `PURSUE` or `ATTACK`, with the player walking (`noise` 0.35–0.65), on the study_w → service → ballroom approach. (`feel-b` measured **12.5 s** in the one-room map; this must not fall below 6.) | timestamps |
| **A3** | **The sightline room delivers a ≥ 20 m first glimpse.** Player at the gallery's west end, hunter at its east end: `blocksSight === false`, `dxz ≥ 20`, and the hunter is **in frame** — take the shot and look at it. | `blocksSight` + a picture |
| **A4** | **"Unseen" exists.** (a) sampling all six space centres, at least one pair is **> 26 m** apart; (b) player in study_w, hunter at the gallery's east end: `blocksSight === true` and `awareness` stays **0 for 10 s** at walk noise. | two shapes of evidence |
| **A5** | **The opening beat.** From `engine.start()`, driving the intended route at walk speed: first `ALERT` at **t ≥ 20 s**, first `PURSUE` at **t ≥ 30 s**, no limb lost before **t = 45 s**. | event log |
| **A6** | **A lap is possible.** Scripted route around the outer ring returns to the start space in **≤ 20 s** at run, with per-second position delta **> 1.5 m** throughout (no collision lock in a doorway). | positions |
| **A7** | **The narrow door is a real constraint.** Force `hunter.stage = 3`, target in the chapel: within 20 s the hunter is either **in** the chapel or has driven `p.chapel` to **stage ≥ 1**. | stage + position |
| **A8** | **Residency holds.** Over the A6 lap, `visibleSpaceCount ≤ 3` on every sampled frame, **and the space the player is in is visible on every frame** (no black room). | count per frame |
| **A8b** | **Physics ignores residency.** With `study_e` hidden, `room.blocksSight` between two points either side of its wall is still `true`, and `castRay` from the ballroom into it still returns a hit. | direct calls |
| **A9** | **Breach still works, and it is loud.** Player opens `p.svc_w.s` with the nailgun in **≤ 3 s**; `portals()` gains a `kind:'breach'` edge; `player.noise` reaches 1.0 during the burst; the hunter subsequently routes through the hole. | portal count + path |
| **A10** | **Death and restart.** Strip all four sockets → the death overlay appears; `R` reloads. | DOM + reload |
| **A11** | **Every space is reachable and none traps you.** From each space centre, `pathPortals` to every other returns a non-empty path; and A6's lap visits all six. | BFS |
| **A12** | **No first-visit shader hitch.** Over a lap entering all six spaces, `frameMaxMs ≤ 40`. (The measured pre-`precompileStages` regression was **2498 ms**.) | frame timing |

Plus the **grade gate** (§12.3) and the **perf gate** (§12.2).

---

## 10. Regression gate — mandatory at every milestone

### 10.1 ⚠️ Three scenarios hardcode coordinates and will silently break

**[measured today]**

| file | hardcoded | risk |
|---|---|---|
| `feel-a.mjs` | uses `room.spawn.player[0]` | **safe** |
| `feel-b.mjs` | `PLAYER_AT = [-6.5, 6.0]`, hunter at `(-6.5, -6.0)` | both land **outside the new map** |
| `feel-c.mjs` | `(-1.6, 0, 7.0)` and `(-1.6, 0, 7.0 - g)` | lands in the ballroom, gaps wrong |
| `look-tells.mjs` | `(-1.6, 0, 4.6)`, hunter `(-1.6, 0, 2.3)` | same |

These will not throw. They will place bodies in walls, produce plausible numbers, and report
**PASS on a measurement of nothing** — which is the exact instrument-failure class this project
keeps hitting.

> **DECISION: add `room.anchor(name)` and replace every hardcoded pair with an anchor.**
> Minimum anchor set: `study_w.south`, `study_w.north`, `service.mid`, `gallery.west`,
> `gallery.east`, `ballroom.centre`, `ballroom.north`, `chapel.centre`, plus
> `duel.player` / `duel.hunter` — a clear, walled, 12 m-apart pair inside `study_w` for the
> A/B beats in `feel-c` and `look-tells`.
> In M1 the anchors resolve to the **current** room's coordinates, so the three scenarios are
> updated and still green *before* the map changes.

### 10.2 The gate, run at the end of every milestone

```bash
node harness/audit.mjs --render
node harness/shoot.mjs --view game.play --review 1280        # then LOOK at the .review.png
node harness/test-wall.mjs
node harness/playtest.mjs --view game.play --script harness/scenarios/feel-a.mjs
node harness/playtest.mjs --view game.play --script harness/scenarios/feel-b.mjs
node harness/playtest.mjs --view game.play --script harness/scenarios/feel-c.mjs
node harness/playtest.mjs --view game.play --script harness/scenarios/look-tells.mjs
node harness/playtest.mjs --view game.play --script harness/scenarios/mansion.mjs --shots
```

`feel-a 12 · feel-b 12 · feel-c 7 · look-tells 6` passes today. **Any drop is a regression until
proven otherwise.** `audit --render` sometimes reports a transient failure — re-shoot the view
alone before reporting it as real.

---

## 11. Multiplayer — what the graph implies, and what you must NOT do

`net/server.mjs` and `net/rules.js` are **room-scoped today**: one room, one wall field, one
player list. `src/net/client.js` is still not wired into `game.js` — `game.play` runs
single-authority offline. **None of that is in this slice.** Do not touch `net/` or `src/net/`.

Three things to keep true so you do not paint that future into a corner (`docs/design/session-model.md`):

1. **`setViewpoint` takes a viewpoint, not "the player".** Split screen means N viewports; the
   residency set for N viewpoints is the **union**. Write it as
   `setViewpoints([{pos, dir}, …])` with a one-viewpoint convenience wrapper, and make the union
   the natural implementation. This costs nothing now and is otherwise a rewrite later.
2. **Space membership is per-body, not global.** Store `body.spaceId` rather than a module-level
   "current room". Eight players will be in five different rooms.
3. **The panel id is already the network key.** `WallField.add(id)` and
   `DestructibleWall.syncStage()` are the sync path; the new ids (`p.svc_w.n` …) are stable
   strings, so a server that grows a room graph later can address them unchanged. **Do not
   renumber panels by index.**

Write in your report: *the server's single implicit room becomes a space id on every player and
every wall event; `rules.js` needs no change because it holds no geometry.*

---

## 12. Milestones — and each one leaves a bootable, playable game

**This is the most important section in the file.** Agents die mid-task here; their edits survive
and their reasoning does not. Land each milestone complete, run its gate, and **note in
`HANDOFF.md` which milestone landed** before starting the next.

### M1 — the graph engine, one space, zero visible change

`spaces.js` holds **exactly one** space that reproduces today's hall: 15.6 × 16.8 × 4.80, the
internal divider with its 1.28 m door and four panels at x = −5.4 / −2.6 / +2.6 / +5.4, the same
spawns. `room.js` builds from the table. `anchor()` added and the three scenarios de-hardcoded
(§10.1). Nothing else changes.

**Gate:** §10.2 in full, and `game.play.review.png` must be visually indistinguishable from the
pre-change baseline. This is a pure refactor: if anything *looks* different, something is wrong.

### M2 — two spaces, residency, graph navigation

Replace the single hall with **gallery + study_w**, joined by D1 and `p.gal_w`. Residency (§5.2),
the fixed light rig (§5.3), the precompile ordering (§5.4), `portals()` per-edge (§4.1),
`pathPortals` + the new `_waypoint` (§7.2), the breach-normal fix (§7.3), reveal merge (§5.5).
Spawns: player in study_w, hunter in the gallery.

**Gate:** §10.2 + **A3, A8, A8b, A9, A12** + the perf gate.

### M3 — the theta graph

Add `service`, `study_e`, `ballroom`, doors D2–D6, the colonnade, and panels `p.svc_*`, `p.gal_e`,
`p.bal_w`. `PATROL_ROUTE` in full. Search clamp (§7.4).

**Gate:** §10.2 + **A1, A2, A4, A6, A11** + the perf gate.

### M4 — the spur, the look, the beat

`chapel` + D7 + `p.chapel`. The grade (§3.4). `hud.setPlace` (§8.4). The capture director
rewrite (§8.3). Opening-beat tuning via dwell times only.

**Gate:** §10.2 + **the full A1–A12** + §12.2 + §12.3, and a `--review 1280` capture at
`--at 1.2` and `--at 15.5` that you **look at**.

### 12.2 The perf gate

```bash
node harness/shoot.mjs --view game.play --perf --gate --extra "quality=medium" --perfms 28000
```

**Budget: GPU ≤ 1.389 ms · CPU ≤ 2.00 ms · draw calls ≤ 625 · triangles ≤ 900 000.**
Baseline to beat-or-hold: **1.25 / 1.69 / 296 / 285 502** **[measured today]**.
Also record `perf.bake` — gate **≤ 38 000 ms** (§3.3).

- **Pin the tier.** `auto` picks `high` on this GPU and that is not the target. Two agents have
  already misreported budget failures this way.
- **Discard the first, cold-shader-cache run.**
- **Never measure perf while another agent is measuring** — GPU timings contaminate each other.
  Do perf **last**, and confirm nothing else is running.

### 12.3 The grade gate

```bash
node harness/grade.mjs --img progress/shots/game.play.png
```

| metric | target | fail |
|---|---|---|
| top-decile `(r−b)/L` | ≤ **0.14** | > 0.20 is monochrome amber |
| median pixel luminance | **30 – 60** | < 20 is a black frame |
| darkest-decile mean L | **2 – 8** | 0 means the toe is crushing real detail |

Report before and after.

---

## 13. The traps — every one has cost real time on this project

- **Never put a backtick inside a GLSL template literal.** It terminates the JS string.
- **Never name a GLSL variable with a reserved word**: `cast`, `sample`, `filter`, `input`,
  `output`, `matrix`, `texture`, `buffer`.
- **Prefer `Edit` over scripted string replacement.** `Edit` fails loudly on a bad anchor; a
  `node` replace silently applies half its changes and leaves the file broken.
- **A light at intensity 0 is not free**, and adding or removing one recompiles the whole scene
  (§5.3). Reposition; never toggle.
- **`material.envMapIntensity` does nothing here.** Use `setEnvResponse(engine, mat, i)` from
  `views/_studio.js` if you need it at all.
- **`engine.gameHud`, not `engine.hud`.** `Engine` calls `this.hud(this)` every live frame;
  assigning an object there threw on every frame for thirty rounds and capture mode could not see
  it. The same shape of bug is waiting for anything you attach to `engine`.
- **Capture and live are different loops.** `_captureLoop` never runs input, never runs the HUD
  function and never sees the play gate. **Everything you change must be checked with
  `playtest.mjs`, not only with `shoot.mjs`.**
- **Cache-bust any `file://` image you load more than once.** Chromium caches by URL and this has
  already produced three identical "measurements" of three different images.
- **A 0-byte agent output file means nothing** — output is buffered until exit.
- **If you assert something is on screen, look at a picture of it.** Element existence *and*
  `isVisible()` both passed on content hidden under a `z-index:100` splash.

---

## 14. Routing — who does what

| stage | model | why |
|---|---|---|
| **This plan** | Opus | done. The floor plan, the residency rule, the light-count rule and the milestone staging are the decisions. |
| **M1 – M4 execution** | **Sonnet** | every number is decided here. A written plan measured 235–265k tokens with no regressions; a defect list to Sonnet measured 462k and deleted a signature element. |
| **`mansion.mjs` scenario** | **Sonnet** | the assertions and their thresholds are specified in §9. |
| **Any decision this plan does not make** | **STOP and report** | Sonnet given a plan executes faithfully; Sonnet given a gap decides badly. If you need a number that is not here, say so rather than inventing one. |
| **Diagnosis, if an assertion fails for a reason the plan does not explain** | **Opus** | measured over sixteen rounds: every agent asked to *diagnose or design* returned a permanent win; every round where a lead specified geometry from a verbal defect description was a coin flip. |
| **Judging the result** | **Sonnet critic**, `rrr-playcritique`, blind | a builder may never grade its own fix — eight for eight overturned. Tell the critic what was *claimed*, never that it is fixed. |

---

## 15. If a stated fact turns out to be wrong

**Say so in your report rather than diverging silently.** This instruction has caught genuine
spec errors seven times in a row on this project and is the highest-yield line in the process.
Two are already flagged above and both are in documents, not code:

- `task-estate.md`'s appendix treats `room-*.js` as parameterisable **builders**. They are
  monolithic **views** (§3.1).
- The "§9 recommendation" for the grade does not exist in §9; the authoritative source is
  `GRADES.study` in `src/lighting/rig.js` after round 4 (§3.4).

And one in code, latent and shipped:

- **`DOOR_W = 1.28` cannot pass a stage-3 hunter** (radius 0.66 → needs 1.32) (§2.3).
