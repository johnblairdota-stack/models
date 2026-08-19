# genwalk-1 — the shortest path to a generated house John can walk out of

`genwalk-1`, 2026-08-11. **Read-only spike.** Nothing in `src/`, `harness/genspike.mjs` or
`tools/mapdesigner/` was edited. Three new instruments, all in `harness/`, all with controls that
run every run:

```
node harness/_genwalk1-rot.mjs --n 512     arm A (no rotation) priced against the shipped generator
node harness/_genwalk1-place.mjs           which placements spaces.js will actually emit — 10/0
node harness/_genwalk1-build.mjs --all     does room.js BUILD a turned room, or only place one
```

Scope set by John, 2026-08-11, via the lead: **IN** — rooms, corridors, doors, diggable walls, the
dig, a findable exit, the outside. **OUT** — the hunter, patrol route, spawn anchors. He is judging
*"does this house read as a place to escape FROM"*.

---

## 🎯 THE FIRST SLICE, IN ONE SENTENCE

> **Put the whole generated mode inside `spaces.js` at module scope, behind a NEW query parameter
> (`?plan=gen&planseed=N`), emitting `SPACES` + `PORTALS` + `PANELS` + `SPAWN` from one seed with
> rotation forbidden, corridors emitted one `SPACES` row per RECT, and every door an OPEN portal —
> because `views/game.js` and `room.js` then need ZERO lines changed, and that is the entire
> difference between a week and an afternoon.**

Everything downstream of `spaces.js` — the builder, the exit pool, the escape test, the yards, the
HUD, the win screen — is **id lookup and derivation**, verified below. `spaces.js` already does
URL-conditional module-scope table selection twice (`SLAB_ARM` :1309, `DOORS_URL` :1313,
`PASSAGE_DOORS_ON` :1317, `PANELS` :1319). The generated mode is a third instance of an idiom the
file already owns.

Only **three files in `src/`** import from `spaces.js` at all: `dig.js`, `room.js`,
`views/game.js`. That is the real blast radius.

---

## 1. The two arms, priced

### Arm A — rooms never turned. **RECOMMENDED.**

`node harness/_genwalk1-rot.mjs --n 512`. Every arm is the SHIPPED `genspike.mjs` with ONE line
textually replaced (`const rot = rng() < 0.5;`) in a scratchpad copy, so `selectRooms`,
`placeRooms`, `planFromRooms` and `measure` are the same code in every column. **It does not
re-derive the packer.**

| metric (mean, 512 seeds) | arm 0 rotation ON | **arm A no rotation** | arm T all turned |
|---|---:|---:|---:|
| rooms per plan | 6.94 | **6.94** | 6.94 |
| corridors per plan | 4.91 | **4.36** | 4.36 |
| VOIDS per plan | 0.72 | **0.61** | 0.54 |
| void area m² | 5.5 | **1.4** | 1.2 |
| shared internal wall m | 288.2 | **290.1** | 289.3 |
| diggable wall m | 266.5 | **268.0** | 269.5 |
| **`fracInternalDiggable`** | **0.9279** | **0.9298** | 0.9363 |
| envelope area m² | 1707 | **1786** | 1789 |
| longest dig run m | 26.28 | **27.70** | 27.84 |
| slivers (edges < 1.20 m) | 0.90 | **0.63** | 0.69 |
| unspannable metres | 7.09 | **5.92** | 5.79 |

| gate (% of 512 seeds) | arm 0 | arm A | arm T |
|---|---:|---:|---:|
| plan closes (allReach / exitReach / hunterAll) | 100 / 100 / 100 | **100 / 100 / 100** | 100 / 100 / 100 |
| every room on a corridor | 97.9 | **99.2** | 99.8 |
| minWalk | 65.4 | **71.1** | 72.9 |
| not degenerate · no door overhang · has an exit | 100 · 100 · 100 | **100 · 100 · 100** | 100 · 100 · 100 |

**Arm A costs nothing in packing quality. It is very slightly BETTER on every axis in the brief** —
fewer voids (74% less void AREA), more shared wall, more diggable wall, fewer slivers, fewer
unspannable metres, and a higher `minWalk` pass rate. All 512 plans are distinct. Plans still close.

### 🚨 The one thing it does cost, and no metric in `house-packing.md` reports it

| | arm 0 | **arm A** | arm T |
|---|---:|---:|---:|
| envelope aspect L:S | 1.571 | **2.220** | 2.212 |
| envelope LONG axis m | 51.2 | **61.6** | 61.5 |
| long axis runs along X | 47.9% | **94.1%** | 6.1% |
| graph `depth` | 2.58 | **2.35** | 2.34 |
| NOT flat (`depth ≥ 3`) | 57.6% | **34.2%** | 33.8% |

Forbid rotation and **the house is a shoebox pointing the same way on 19 of every 20 seeds**, 41%
longer relative to its width, and the flat-plan rate goes **42.4% → 65.8%**. `genspike.mjs`
`selectRooms` says so in its own header — rotation *"is the only reason a 27.20 m gallery can ever
be a north-south spine"* — and this is that sentence with a number on it.

⚠️ **Do NOT read the flat-plan row as a taste regression.** `maplabel-1` tested `depth ≥ 3` against
John's own 40 labels and it **rejects his taste**: AUC 0.383 pointing the wrong way, flagging 6 of
his 16 GOOD plans against 2 of his 12 BAD. The aspect row is the honest half of this cost, and it
is a thing he can see and we cannot score.

### Arm B — turned rooms supported. **Much smaller than §9.4b says, and mostly already done.**

`node harness/_genwalk1-place.mjs` — **10 pass, 0 fail**, asking the shipped `placeRoom`:

```
           turns:   0     1     2     3
  gallery              .     .     .     .
  study                .     .     .     .
  service              .     .     .     .
  ballroom             .     X     .     X
  chapel               .     .     .     .
```

**Four of the five room types already take a quarter turn today.** The only throw is the ballroom,
and it is one field — `sp.columns` — in one library entry:

> `[spaces] a rotated room cannot emit \`columns\` — room.js reads { z, xs }; give it the general
> form before rotating a room that has a colonnade`

And `node harness/_genwalk1-build.mjs --all` takes it one step further: it patches `HOUSE_PLAN` in
memory at load (`node:module` `registerHooks`, nothing written to disk) and BUILDS the mansion
headless.

```
  control    exit 0  6 spaces · 46 panels · 313 meshes · 149,390 tris · study_e span [11.6, 15.4]
  turn1      exit 0  study_e QUARTER-TURNED · span [15.4, 11.6] · order 'study' · orderPlan true
                     · 315 meshes · 156,536 tris
  turn2      exit 0  study_e HALF-TURNED · census IDENTICAL to control
  ballturn   exit 1  throws in spaces.js at import, before room.js is reached
```

**A quarter-turned study BUILDS. `studyOrderFor` produces an `orderPlan` for the swapped
footprint and does not throw.** §9.4b item 1 — *"both need the gallery's treatment"* — is
**overstated**: the two orders are parametric on the footprint *and on the cut list*, so a swapped
footprint gets a valid order solved for the new box rather than a broken one. What is NOT measured
is whether that order LOOKS right (`ballroom-order.js` already says *"the pitch gives way, not the
window"*, i.e. it is built to adapt). **That is a look question for a critic, not a throw.**

⚠️ **And half turns are free but nearly worthless.** `turns: 2` places every type including the
ballroom, and it moves the light rig (`gallery.key` `[11.6, 4.05, -2.9] → [-11.6, 4.05, 2.9]`) —
but the built census is IDENTICAL to the control, because the orders solve from the world-axis
footprint and a half turn does not change it. A half turn buys a re-lit room, not a re-dressed one.

**Arm B's real bill:** give `sp.columns` a general `{ pts }` form and teach `room.js`'s reader at
`room.js:2042` (`const { z, xs, w = 0.95 } = sp.columns;`) to consume it. **One library field, one
reader, one `placeColumns`.** Plus a critic pass on the two swapped-footprint orders.

### Recommendation

**Take arm A for the first slice and arm B immediately after, as its own small slice.**

Arm A is free *today* and its only cost is variety John cannot see until he has walked one house.
Arm B is not the wall §9.4b describes — it is ~a third of a day plus a critic — but it is **not on
the critical path for "walk, dig, get out"**, and every hour spent on the colonnade is an hour he
is not walking anything. Ship arm A, get his verdict on the shoebox, then unlock rotation.

---

## 2. The five blockers — confirmed, refuted, or re-priced

### 1. `EXIT_SITES` is a module-level constant — ⚠️ **FACT CONFIRMED, COST REFUTED**

The fact is exactly as stated (line numbers have drifted 1–2 since §9.3 was written):
`spaces.js:1367` is `export const EXIT_SITES = PANELS.filter(isExitSite)`; `views/game.js:16`
imports it (**not `:15`**), `:115` slices it for `?exits=N` (**not `:113`**), `:123` builds `SITES`
(**not `:121`**), and `run.js:166` `chooseExit(seed, sites)` picks from pool order.

**§9.3's *"a small mechanical change in three places and a LARGE BLAST RADIUS"* is only true of one
design, and it is not the design to take.** It must become a function of the *plan*; it does not
have to become a function with a *plan argument*. `spaces.js` already computes URL-conditional
tables at module scope — `PANELS` itself is one — so:

```js
const GEN = /* ?plan=gen&planseed=N, read exactly as SLAB_ARM and DOORS_URL are */;
export const SPACES = roomsFromPlan(GEN ? GEN.plan : HOUSE_PLAN);
export const PANELS = GEN ? GEN.panels : (PASSAGE_DOORS_ON ? PANELS_AUTHORED : …);
export const EXIT_SITES = PANELS.filter(isExitSite);      // unchanged, still a constant
```

changes **zero lines in `views/game.js`** and zero in `run.js`. Verified downstream, by reading:

- `views/game.js:675` builds `exits` by finding `room.panels` by **id** and `room.spaces` by
  **`site.a`**; `outSign` is derived from the panel plane and the owning room's centre, never
  authored (the file says so at `:670`).
- `outThrough()` (`:1469`) — the win test — is **four derived conditions and no world constant**:
  panel not blocking, `room.spaceAt(pos, 0)` null, `panel.sideOf` matches the derived `outSign`,
  and 0.45 m clear inside the aperture's own width.
- `applyExitPlan()` (`:706`) maps over `CONNECTORS` by id and calls `resolveConnector`.

**The genuine cost was never the plumbing. It is emitting a correct `PANELS` array** — `{ id,
state, name, a, b, x, z, rotY, w?, h? }` for panels, `{ id, state, a, b, axis, x, z, w, h }` for
portals — with each door on a wall run long enough to hold it. `genspike.mjs` already computes that
run: `wallRuns(A, B)` and `edge.runMax` / `edge.doorRun` exist precisely because a door on a
too-short run was John's *"green open door clipping on the corner of the rooms"*.

⚠️ **One hard guard to respect, and it fails loudly rather than silently.** `spaces.js:1392–1404`
validates every connector at module scope: duplicate id, unknown state, unknown space `a`, unknown
space `b` (except `'outside'`), `clearWidth(c) > 0.4`. A malformed generated table **throws at
import**, which is the right failure — but it means an early generated build will fail to boot with
a `[spaces]` message rather than render badly. Expect that; do not "fix" the guard.

### 2. `YARDS` is keyed by exit-site id — ⚠️ **CONFIRMED AS A BEHAVIOUR, WRONG ABOUT WHY, AND CHEAP**

Confirmed: `exterior.js:1577` is `const spec = YARDS[e.site.id];` and `:1578` is
`if (!spec) { console.warn('[exterior] no yard authored for', e.site.id); continue; }`. A generated
pool without generated yards opens every new site onto **`scene.background`, `#05070b`** — a
near-black void, visible through the hole *before* he steps out, i.e. exactly "reads as a bug".

**But §9.4b's *"world-authored per site"* is wrong, and it is wrong in the direction that makes
this cheap.** `YARDS` is authored in the **yard's own frame**, and `exterior.js` says so above the
table: *"+z is outward through the hole, +x is the panel's own lateral axis … nothing here repeats
a coordinate that `spaces.js` already owns."* `buildYard(spec, site, panel, storey, rng)` derives
the frame from the panel; the spec is `{ kind, x0, x1, depth, sky, wallH, trees, hedges, piers }`,
and only `x0/x1` (the lateral extent) are solved against the floor plan so nothing intersects a
neighbouring wing.

**What a feel test needs: ONE default spec and a `??`.** Change `:1577` to
`const spec = YARDS[e.site.id] ?? DEFAULT_YARD;` and add a conservative row —
`{ kind: 'lawn', x0: -6.0, x1: 6.0, depth: 22, sky: 21, wallH: 1.35, trees: 8, hedges: true,
piers: 2 }`. **~5 lines.** Every generated site then gets a real yard with a real boundary wall,
real trees and the house's own shadow raked across it.

⚠️ **The one risk, named:** a fixed ±6 m lateral extent can clip a neighbouring wing on some seeds,
because that is the exact thing the per-site `x0/x1` were solved for. For a feel test, accept a
clipped hedge; the honest fix is to pass the exit wall's own free run (which the generator already
knows — `frontage[]` in `planFromRooms`) as `x0/x1`, clamped, which is ~3 more lines.

### 3. Station anchors are connector-derived — ✅ **DEFERRED SAFELY, WITH ONE STUB THAT IS NOT OPTIONAL**

Checked rather than assumed, as asked. **Nothing on the walk/dig/escape path breaks if
`PATROL_ROUTE` / `ANCHORS` are left stale:**

- `HunterAI._patrol` (`hunter-ai.js:774`) reads only `wp.x`, `wp.z` and `wp.dwell` from a route
  entry. **`wp.space` is never read** — a stale `space: 'ballroom'` in a house with no `ballroom`
  cannot throw. Route points landing inside walls make the hunter steer at masonry; it is out of
  scope and it is not a boot failure.
- `room.anchor(name)` / `anchorVec` return `null` for an unknown name. `ANCHORS` is a **scenario**
  contract only; nothing in the play loop reads it.

🚨 **BUT `SPAWN` IS NOT IN THAT SET AND IT IS ON THE CRITICAL PATH.** `views/game.js:132` and
`:359` place the PLAYER at `room.spawn.player[0]`, and `:494` / `:1630` / `:1652` place the hunter
at `room.spawn.hunter` — both world coordinates authored for the shipped house
(`SPAWN.player = [[-8.60, -11.60], …]`). In a generated house the player spawns **outside the
envelope**, and the first thing John sees is not the house.

**Minimum stub: two coordinate pairs.** `SPAWN.player` = the centre of the generated spawn room
(`measure()` already picks one — `spawn` in its return), `SPAWN.hunter` = the centre of a different
one. `SPAWN.capture` likewise. **~4 lines, and it must be in slice 1.**

### 4. Two storeys are not needed — ✅ **CONFIRMED, MEASURED**

`_genwalk1-place.mjs` P3: `HOUSE_PLAN at[1] = [0, 0, 0, 0, 0, 0]`. `placeRoom` carries `cy` into
`placeLights` only (`toWorld` is `[cx + …, cy + y, cz + …]`), so a non-zero value would lift the rig
and leave the geometry — which is what `spaces.js:120–126` already warns. **Leaving it 0 costs
nothing and unblocks nothing. Do not touch it.**

### 5. `?estate=gen` as a new mode — ✅ **CONFIRMED SAFE, 🚨 BUT THE NAME §9.3 CHOSE IS BROKEN**

The mode can be added without disturbing the recorded gates, and the mechanism is stronger than
§9.3 claims: **`harness/scenarios/*` that import `spaces.js` in node get `typeof location ===
'undefined'`, so they take the authored plan by construction.** `escape` 20/20 on `seed=s4` and
`mechanics` 13/13 keep running on the authored house with no flag, no guard and no discipline
required.

🚨 **`?estate=gen` MUST NOT BE THE FLAG.** Measured off `estate-spike.js`: `estateMode(raw)` walks a
comma list of known tokens and ends `return any ? m : null`. `gen` is not a token, so
`?estate=gen` sets `any = false`, returns **`null`**, and `views/game.js:2321/2362/2399` all
short-circuit — **the entire estate art port turns off.** John would walk a generated house with
none of the gallery, study or ballroom art in it, which is the one thing this whole exercise exists
to let him judge. Use a **separate parameter**: `?plan=gen&planseed=N`, leaving `?estate=` at its
`port` default. (`?estate=port,gen` would also work and is worse — it couples a floor-plan switch to
an art switch.)

**What would break if it were a replacement, rather than a new mode** — named, so nobody argues it
later: every recorded seed in every document (`escape --q "seed=s4"` names a specific site id),
`_loc1_golden.json` (1170 leaves, `Object.is`), `_ap3-golden.json` (15,740 built-geometry leaves),
`dig-band`'s six-space table and its named chapel shortfall, `eo2-calls`' 426/625, `dig-cover` 6/0,
every entry in `ANCHORS`, and the `PATROL_ROUTE` tuning that buys the opening beat.

---

## 3. What comes free — verified, not assumed

| §9.4 claim | verdict | evidence |
|---|---|---|
| `pathPortals()` is free | ✅ **FREE** | `room.js:787–821`. A BFS over `portals()` — live state — keyed on **space id strings**, filtered on `p.w >= minW` and `p.h >= minH`. Not one authored coordinate. It is genuinely the one thing that needs no work. |
| `?tells=blind` generalises | ✅ **FREE** | `connectors.js:381` `connectorDressing(spec, seed, mode, state, outside)` keys on the **id string** and on `spec.b === 'outside'`. Any generated connector id gets seeded dressing with no code change. |
| the connector interface (`conn-1`, `conn-2`) generalises | ⚠️ **FREE TO RUN, NOT FREE TO BELIEVE** | Both read live `e.room` / `e.exits` / `e.run` and derive their crops by projecting the panel's own corners (conn-2's header: a hardcoded pixel rectangle *"produced a confident, quantitative, entirely wrong finding"*). **They will run under the generated plan with no edit — but every number they have recorded is for the authored house and must be re-baselined before it means anything.** Do not carry conn-2's luma figures across. |

**A "free" item that is not free is the most expensive line in an estimate**, so the third row is
the one that matters: budget a re-baseline, not a code change.

---

## 4. Three costs §9 does not name

### 🚨 (a) A corridor region is a POLYGON; a `SPACES` row is a RECTANGLE. This is the biggest one.

`genspike.mjs` regions carry `rects: []` — plural. Measured over 512 seeds:

| | arm 0 | **arm A** |
|---|---:|---:|
| corridor REGIONS per plan | 4.91 | **4.36** |
| corridor RECTS per plan | 10.03 | **9.62** |
| rects per region (mean / max) | 2.04 / 10 | **2.21 / 9** |
| regions with more than one rect | 52.2% | **54.8%** |
| sub-1.60 m alcove rects per plan | 1.66 | **1.04** |
| **`SPACES` rows at one row per rect** | | **16.6, against 6 today** |

**More than half of all corridors are L-shaped or worse**, and `room.js` gives every space its own
four walls unconditionally (`room.js:1932`, and `spaces.js`'s own rule *"each space always draws its
own four walls"*). Emit an L-corridor as two `SPACES` rows and you get a **full wall across the
middle of the corridor**, cut only where a 2.08 m connector is authored.

**Two ways out, and take the cheap one:**
1. **One `SPACES` row per corridor RECT, plus an authored OPEN portal between adjacent rects of the
   same region.** An L-corridor becomes two short corridors with a doorway between them. Costs
   nothing new in `room.js`; arguably reads BETTER than an open L in a horror house. **~17 spaces
   per plan against 6 today** is the draw-call consequence, and it is a cut-list item, not a
   blocker.
2. Teach `room.js` polygon spaces. Expensive, and not for a feel test.

⚠️ The 1.04 sub-1.60 m alcove rects per plan are narrower than body-plus-swing. **Drop or merge
them for the feel test** rather than emitting spaces he cannot enter.

### (b) `genspike.mjs` lives in `harness/`, and `src/` would have to import it

`tools/mapdesigner/app.js:19` already does `from '/harness/genspike.mjs'` — an absolute dev-server
path. A `src/` module needs a relative one (`../../harness/genspike.mjs`) for `vite build` to
bundle it. §9.2's one-algorithm rule forbids a copy. **~15 minutes of risk, named so it is not a
surprise; do not let it become a rewrite.**

### 🚨 (c) The generator's closure gates are near-tautological, so "512/512 pass" is weak evidence

Found by writing a control that was supposed to fail and did not. `_genwalk1-rot.mjs` **C3** gives
the library a **272 m ballroom** — ten times too long. `fracInternalDiggable` falls
**0.9279 → 0.6861** and void area rises **5.5 → 30.0 m²**, so the quality metrics see it. But
`allReach`, `exitReach`, `hunterAll`, `not-degenerate`, `no door overhang` and `has an exit` stay at
**100.0% on all 512 seeds**.

They are connected *by construction* — every room is placed flush against an already-placed room and
every leftover cell becomes corridor. **`house-packing.md` §1's *"the three solvability gates and
the hunter gate pass on 512/512 seeds"* should not be quoted as if the generator had cleared a
bar.** `_genwalk1-rot.mjs` **C4** is the control that CAN break them (`L_DIG` 1.20 → 40.0 and the
door jamb 0.20 → 40.0: 512/512 fail to close), and it now ships in the file so the columns stay
falsifiable.

---

## 5. The slice sequence for arm A

Every slice names its instrument and whether it exists.

| # | slice | files | instrument | exists? |
|---|---|---|---|---|
| **1** | **`?plan=gen&planseed=N` — `spaces.js` emits `SPACES`/`PORTALS`/`PANELS`/`SPAWN` from one seed. Rotation forbidden. One row per corridor rect; alcoves dropped. Every door an OPEN portal. No dig, no exit, no exterior yet.** | `spaces.js` only (+ the relative import of `genspike.mjs`) | **new `_genwalk1-boot.mjs`** — build the mansion headless per seed, assert 6–8 rooms + N corridor spaces, every space reachable through `pathPortals`, zero `[spaces]` throws over 64 seeds. **Fork `_genwalk1-build.mjs`'s `registerHooks` + baker stub; do not touch `_ap3-*.mjs`.** | **NO — building it IS the slice** |
| 2 | Dig faces: `DIG_EDGES` from `boundarySegments(plan)` | `dig.js` (a `digEdges()` branch, table untouched) | `dig-free`, `dig-band`, `dig-cover` re-pointed at the gen arm; `genspike.mjs` `slabLayout()` already reports the span split | **YES**, re-baseline needed |
| 3 | The exit: `EXIT_SITES` from the generated exterior-facing panels; `SPAWN` on the generated spawn room | `spaces.js` | `escape.mjs` under `?plan=gen`; its own E7 breaks each of `outThrough`'s four conditions | **YES**, re-baseline needed |
| 4 | The outside: `DEFAULT_YARD` + `??` | `exterior.js`, ~5 lines | `exterior-look.mjs`; visual check is a `rrr-critique` pass | **YES** |
| 5 | Arm B: general `{ pts }` colonnade | `spaces.js` `placeColumns`, `room.js:2042` | `_genwalk1-place.mjs` (its `ballroom × turns 1/3` cells must flip `X → .`); `_genwalk1-build.mjs --arm ballturn` must flip `exit 1 → exit 0` | **YES — both arms already assert the failure** |
| 6 | Generator-version handshake + golden hash (§9.2) | `net/server.mjs`, a new scenario | not started | **NO** |

**Slice 1 is the whole bet.** If it lands, John is standing in a generated house. Slices 2–4 are
each an afternoon on top of it and each has a gate that already exists.

---

## 6. 🔪 THE CUT LIST — everything a full generated house needs that a walkable feel test does not

**Cut, and say so out loud when he plays it:**

1. **Room ROTATION** — arm A. Costs a shoebox envelope on 94% of seeds and nothing else (§1).
2. **The hunter, `PATROL_ROUTE`, `ANCHORS`** — John's own call. Verified not to break the boot
   (§2.3). `SPAWN` is **not** in this cut.
3. **Corridor POLYGONS** — one space per rect, a doorway at each internal joint (§4a).
4. **Sub-1.60 m alcoves** — dropped, not dressed as recesses (§4a).
5. **Per-site yards** — one default spec for every generated site (§2.2).
6. **Two storeys** — `at[1]` stays 0 (§2.4).
7. **`DIG_EDGES` id stability / the generator-version handshake (§9.2)** — a feel test is single
   player on one build. Ids may churn between builds; nothing multiplayer is being judged.
8. **The 2.96 m authored-span minimum (§7.3)** — the slab arm retires it, and 5.92 unspannable
   metres per plan is 2% of the wall. Let the short boundaries be plain wall.
9. **Room DUPLICATE dressing variety** — §10's *"he will notice the repetition"*. He has to see one
   house before repetition is a problem.
10. **Draw-call budget** — ~17 spaces against 6 will move it. **Measure it, do not gate on it**, and
    remember the correction: draw-call counts are exempt across agents but **NOT across a walk**
    (`ballroom.centre` read 423 / 461 / 479 on one build, seed and station). Flip in place at one
    station.
11. **`conn-2`'s recorded luma figures** — re-baseline or ignore; do not carry them across (§3).
12. **Every "seed sN exits at …" line in every document** — meaningless under the generated mode by
    construction, and that is the price of the feature, not a bug (§9.3, and it is right).

**NOT cuttable, in the order they bite:**
`SPAWN` (he lands outside the house) → `PANELS` with doors on runs long enough to hold them (his
own reported defect) → `EXIT_SITES` (no way out) → a default yard (the way out opens onto
`#05070b`).

---

## 7. Corrections to `house-packing.md` §9 and to the brief

Filed rather than diverged silently, per the rule.

1. **§9.3 line numbers have drifted.** `views/game.js` imports `EXIT_SITES` at **`:16`** not `:15`,
   slices at **`:115`** not `:113`, builds `SITES` at **`:123`** not `:121`.
2. **§9.3 "a large blast radius" — refuted.** Three `src/` files import `spaces.js`; the module-scope
   URL idiom the file already uses twice makes the change zero-line downstream (§2.1).
3. **§9.3's flag name is a live defect.** `?estate=gen` returns `null` from `estateMode()` and
   silently disables the whole art port (§2.5).
4. **§9.4b item 1 — overstated.** A quarter-turned study BUILDS and gets a valid `orderPlan`
   (`_genwalk1-build.mjs --arm turn1`, exit 0). Four of five types already turn. The blocker is one
   field on one room (`_genwalk1-place.mjs`).
5. **§9.4b item 5 / `YARDS` — wrong about the mechanism.** The spec is authored in the yard's own
   panel-derived frame, not in world coordinates. A default row fixes every generated site (§2.2).
6. **§1's "512/512 gates pass" is weak evidence** — the closure gates survive a 272 m ballroom
   (§4c).
7. **§9 does not name the corridor-polygon cost**, which is the largest single item I found (§4a).
8. **The brief's framing of arm A as a compromise is backwards.** Arm A is better on every packing
   metric in §4 of `house-packing.md`. Its cost is envelope variety, which is a taste axis, and
   `fracInternalDiggable` — the number the packing spike optimises — is **AUC 0.486 against John's
   eye, exactly chance** (`maplabel-1`). **Neither arm should be chosen on packing metrics at all.**

---

## 8. The instruments

| file | what it asks | controls |
|---|---|---|
| `harness/_genwalk1-rot.mjs` | what forbidding rotation costs, over 512 seeds | **C1** identity re-patch, 512/512 hashes == arm 0 · **C2** dropped rng draw, 512/512 differ · **C3** 272 m ballroom, `frac` 0.9279 → 0.6861 and void 5.5 → 30.0 m² · **C4** undiggable + doorless, 512/512 fail closure. Exit 0 iff all four behave; **the arms never set the exit code.** |
| `harness/_genwalk1-place.mjs` | which `(type, turns)` pairs `placeRoom` will emit | **K1** the shipped plan places 6 · **K2** an unknown room type throws · **K3** a half turn MOVES the rig. **10 pass, 0 fail.** |
| `harness/_genwalk1-build.mjs` | does `room.js` BUILD a turned room | `--arm control` must exit 0 (and it prints `room.js`'s sha1, because another agent has that file open) · `--arm ballturn` must exit 1 with the columns throw. A missing patch anchor throws rather than building the shipped house and calling it turned. |

All three are pure Node, no browser, no GPU. `_genwalk1-rot.mjs` patches **scratchpad copies** of
`genspike.mjs` and imports them; `_genwalk1-build.mjs` patches `spaces.js` **in memory at load**.
Nothing in `src/`, `harness/genspike.mjs` or `tools/mapdesigner/` was written to.

⚠️ `_genwalk1-build.mjs`'s turned arms make the room overlap its neighbours and leave the authored
connectors off its walls. **That is fine for "does the order builder survive a swapped footprint"
and useless for anything else — do not read a geometry census off them.** The `turn1` collider drop
(32 → 8) is that artefact, not a rotation defect.
