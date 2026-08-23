# task-procedural-mansion-layout — PR A: corner ballroom, no piers, deferred chairs

Decided plan. The numbers here are the numbers to use. If a stated fact turns out to be
wrong, **say so in the report rather than diverging silently.**

John, 2026-08-23, locked the procedural mansion rules. **This file is the PR A slice.**
Cyan map-edge redesign is **PR B** and is not implemented here.

`docs/design/party-loop.md` still wins on any disagreement about the party game.

---

## 0. Why this slice exists

Party night warms a generated house in the lobby (`task-prime-time-lobby-warm-night`) and
then starts the cast in the ballroom. Three layout facts were still wrong against John's
lock:

1. The packer placed the ballroom first because it is biggest, then grew the house on
   every side — so the starting room was often mid-edge, not a corner.
2. `dressGenerated` copied `ROOMS.ballroom.columns` onto every generated ballroom, so the
   centre colonnade landed in the chair circle.
3. `views/game.js` Phase A baked **eight** smashable chairs into the house dress, before
   anyone knew how many players had joined.

PR A closes those three. Furniture placement from the smash catalog is in-scope if it is
cheap. **Cyan barriers stay as they are** — that is PR B.

---

## 1. Exact file ownership

### PR A may edit these

| file | what you do to it |
|---|---|
| `docs/slices/task-procedural-mansion-layout.md` | this file |
| `harness/genspike.mjs` | optional `homeCorner` packing + `roomAtEnvCorner` |
| `src/world/genplan.js` | spawn is the ballroom when one exists |
| `src/game/spaces.js` | pass `homeCorner`; never attach ballroom columns |
| `src/party/mansion.js` | `PLAN_OPTS.homeCorner`; `planPasses` requires a corner |
| `src/game/chair-seats.js` | **new.** locked seat count (pure) |
| `src/game/furn-layout.js` | **new.** catalog placements (pure + optional GLB dress) |
| `src/views/game.js` | Phase A chairs after seating lock, not `count: 8` |
| `src/game/follow-bed.js` | dress catalog furniture at warm; chairs stay on intro-bed |
| `harness/party-warm.mjs` | W14 layout assertions |
| `harness/scenarios/furn-sledge.mjs` | F1 reads the seating lock, not "always 8" |

### Owned by other systems — do not edit

- `src/game/dig.js`, `src/destruction/damagefield.js`, `src/destruction/support.js` —
  smash bed. **PR B owns cyan.** Do not retune interconnect / G-channel / collapse.
- `src/game/room.js` — builder. Consume `spaces` / `columns` as it already does. Do not
  add a barrier policy here.
- `src/game/intro-bed.js` — already uses `cast.length`. Keep that path. Do not rewrite it.
- `harness/genspike.mjs` default packing (no `homeCorner`) — the 512-seed corpus stays
  on the old arm.

---

## 2. Inventory (measured on `0349ef6`, 2026-08-23)

### Ballroom placement

| fact | where | what it actually does |
|---|---|---|
| Packer places biggest room first | `harness/genspike.mjs` `selectRooms` / `placeRooms` | Ballroom is first at `(0,0)…(w,d)`, then later rooms grow the bbox on **any** face. Corner is **emergent luck**, not a rule. |
| Spawn is a random room | `genspike.mjs` `measure().spawn` → `genplan.js` L448–468 | Seeded pick of any room except the exit. **Not** the ballroom. |
| Party start is already the ballroom | `src/game/follow-bed.js` L470–477, `intro-bed.js` `ballroomOf` | Camera / runner / intros stand in the ballroom **regardless** of `GEN.spawn`. |
| Party plan picker | `src/party/mansion.js` `planPasses` | Gallery exists, ballroom exists, door-connected. **No corner test.** |

### Pillars

| fact | where |
|---|---|
| Six piers on the centre line | `src/game/spaces.js` `ROOMS.ballroom.columns` `{ z: 0, xs: [-11,-6.6,-2.2,2.2,6.6,11], w: 0.95 }` |
| Generated rooms inherit them | `dressGenerated` → `placeColumns(f, def.columns)` |
| Authored house inherits them | `placeRoom` → same `placeColumns` |
| Builder emits mould + colliders | `src/game/room.js` `if (sp.columns)` (~L2355) |
| Warm / intro cameras dodge them | `follow-bed.js` / `intro-bed.js` comments about the colonnade |

### Cyan barriers (PR B — do not change)

| fact | where | brief vs code |
|---|---|---|
| Free-mode barrier is DamageField G | `src/destruction/damagefield.js` starts `barrier.fill(1)` | Every dig face is cyan until `setInterconnect` punches a hole. |
| Generated dig edges are **inter-room only** | `src/game/dig.js` `generatedDigEdges` | Pairwise space contacts. **No envelope / outside edges.** |
| Exterior walls are solid architecture | not in `digEdges()` | You cannot leave the map because there is no dig face, not because of cyan. |
| Party night does not set `?plan=gen` | `follow.js` `FOLLOW_FORBIDDEN` | `GEN` is null; `freePanels()` uses **authored** `DIG_EDGES` ids (`study_w`, …) against generated space ids. **A stated "generated house has generated dig edges" is wrong for the warm iframe.** Report, do not silently "fix" in PR A. |

### Chairs

| fact | where |
|---|---|
| Party intros already use joined count | `src/game/intro-bed.js` `n = max(1, seats.length)` from `cast` |
| Party chairs are **not** in the warm bake | intros cue fires after Start (`party-host.js` `maybeSendIntros`) |
| Intro teardown removes the chair mesh | `intro-bed.js` `dispose()` drops the intro group, which holds `chairCircle` |
| game.play bakes eight chairs at dress | `src/views/game.js` Phase A `count: 8` (~L3493) |
| smash gate assumes eight | `harness/scenarios/furn-sledge.mjs` F1 |

### Smashable furniture on disk

`public/models/furn/` is **empty in this checkout** (not in git). Catalog and smash lab
still name the files:

| id | file | kind | intended room (John) |
|---|---|---|---|
| `armor` | `rrr_prop_armor_v1.glb` | urn | corridors (knight) |
| `chaise` | `rrr_prop_chaise_v1.glb` | chair | study (lounge) |
| `settee` | `rrr_prop_settee_v1.glb` | chair | study (lounge) |
| `wingback` | `rrr_prop_wingback_v1.glb` | chair | study (lounge) |
| `grand-piano` | `rrr_prop_grand-piano_v1.glb` | desk | ballroom |
| `chandelier` | `rrr_prop_chandelier_v1.glb` | giltbox | ballroom |

Sources: `src/game/furn-catalog.js`, `src/game/furn-smash-lab.js` (`/models/furn/${file}`),
`src/game/furn-meshy-lineup.js`.

Procedural stand-ins that **are** in repo (not catalog GLBs): `world/chandelier.js`
`buildChandelier`, `world/props.js` chairs / desks / urns, `furn-dress.js` Phase B.
PR A places **catalog ids only** and skips a GLB that 404s. No invented files.

---

## 3. The changes (PR A)

### Change 1 — ballroom in a plan corner, by construction

`buildPlan(seed, { homeCorner: true })` is **explicit**, not a retry loop hoping the
unconstrained packer lands a corner.

1. If a ballroom is in the selection, **pin it first** (do not rely on biggest-first).
2. Pick a seeded pair of growth signs `(growX, growZ)` each `±1`.
3. Reject any later rect that crosses the ballroom's far face on those axes.
4. The ballroom therefore shares a corner with the room-bbox; corridors fill inside that
   bbox, so `plan.env` keeps the same corner.

Default `homeCorner` is **false**. `genspike.mjs --sweep` and the map designer stay on
the measured arm.

`spaces.js` `GEN` and `mansion.js` `PLAN_OPTS` pass `homeCorner: true`.

`roomAtEnvCorner(plan, 'ballroom')` is the predicate. `planPasses` requires it.

### Change 2 — ballroom is the starting room

`genplan.js` `generatedTables` spawn uses the ballroom region when one exists. Hunter
stays in a different room. `measure().spawn` is **not** rewritten (sweep figures stay).

Party night already starts in `ballroomOf`. That stays.

### Change 3 — no centre pillars

- Delete `ROOMS.ballroom.columns`.
- `placeRoom` and `dressGenerated` refuse to attach columns when the room is a ballroom,
  even if a columns field is added back later.
- `placeColumns` itself stays; it is the helper, not the policy.
- `room.js` is untouched: no `sp.columns` means no piers.

Authored `game.play` ballroom loses the colonnade. That is the lock, not a regression
to hide.

### Change 4 — deferred chairs

- **Party:** keep `intro-bed.js` `cast.length`. Do not bake chairs in follow-bed warm.
- **game.play:** Phase A no longer uses `count: 8`. Seat count is
  `lockedSeatCount({ players: run.players.size, chairsQuery })` from `chair-seats.js`.
  `?chairs=N` is the instrument for smash / capture. Offline play is one player → one
  chair until a seating lock says otherwise.
- `engine.__chairCircle` records `{ deferred: true, count, baked: false }`.

### Change 5 — catalog furniture (cheap)

`furn-layout.js` emits placements from the catalog ids above. `dressCatalogFurniture`
loads `/models/furn/…` and registers a `FurnProp`; a missing file is a skip, not a
throw. Wired from follow-bed (warm dress) and game.js (after Phase B).

If the GLBs are still absent on disk, the function returns `{ placed: 0, missing: [...] }`
and the PR says so. That is not a silent invention of props.

---

## 4. PR B (out of scope — do not implement)

Locked rules 5–7:

5. All walls are destructible.
6. Map-edge walls keep the cyan barrier (cannot leave the map).
7. Inter-room walls have **no** cyan — dig wall-to-wall into any room.

That is a `dig.js` / `room.js` / DamageField G-channel change. It must not land in PR A.
Interior interconnect search on `game.play` stays as shipped.

---

## 5. Traps

- **Do not flip `genspike` default packing.** `homeCorner` is an opt-in. The 512-seed
  corpus and `house-packing.md` figures are on the old arm.
- **Do not change `measure().spawn`.** Spawn-for-play is `genplan.js`; spawn-for-metrics
  stays the seeded pick.
- **Do not import `genplan.js` from `party-warm.mjs`.** It pulls THREE via
  `connectors.js`. Assert on `genspike` + `mansion.js` only.
- **Do not rewrite `intro-bed.js` chairs.** `cast.length` is already the lock.
- **Do not touch `dig.js` / `room.js` barrier policy.** PR B.
- **Do not invent GLB filenames.** Catalog ids only; skip on 404.
- **Backticks in template literals** — this project's usual Edit trap.

---

## 6. Verification

```bash
cd web-prototype
node harness/party-warm.mjs
```

W14 must say:

- `PLAN_OPTS.homeCorner === true`
- every world seed 0..23: picked plan has the ballroom at an env corner
- `planPasses` rejects a house whose ballroom is not in a corner (control: `homeCorner: false`)
- `lockedSeatCount({ players: 4 }) === 4` and `lockedSeatCount({ players: 1, chairsQuery: '8' }) === 8`
- catalog placement table names only real `furn-catalog.js` ids

Play:

1. Party lobby warm → house stands, **no** player chairs.
2. Start / seating lock → intros cue → chairs = joined phones, equally spaced in the
   ballroom centre.
3. `?plan=gen` → ballroom in a corner, no centre piers, spawn in the ballroom.
4. `game.play` → one chair unless `?chairs=N`.

Cyan / dig-through-inter-room is **not** a PR A test.
