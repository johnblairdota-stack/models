# task-procedural-mansion-layout — corner ballroom, no piers, deferred chairs, catalog furn

Decided plan. The numbers here are the numbers to use. If a stated fact turns out to be
wrong, **say so in the report rather than diverging silently.**

John, 2026-08-23, locked the procedural mansion rules against his local inventory:

`C:\Users\John\Documents\models\web-prototype`

This file owns the layout slice. **Cyan map-edge redesign is a follow-up (PR B)** — see
§4. Corner, pillars, chairs, and catalog furniture land here.

`docs/design/party-loop.md` still wins on any disagreement about the party game.

Anchors (read, do not rewrite):

- `docs/slices/task-prime-time-lobby-warm-night.md` — the night warms in the lobby; chairs
  are not a property of the bake
- `docs/design/house-packing.md` — genspike packing, 512-seed corpus, `sp.columns` / §9.4b
- `docs/design/dig.md` — sealed rooms, interconnect, robot barrier. The cyan follow-up
  must not break that act break.

---

## 0. Why this slice exists

Party night warms a generated house in the lobby (`task-prime-time-lobby-warm-night`) and
then starts the cast in the ballroom. Four layout facts were still wrong against John's
lock, and a fifth (cyan) is a dig/barrier redesign that must not ride along.

1. Authored `HOUSE_PLAN` parks the ballroom as the **south hub** (`at: [0.00, 0, -0.65]`),
   not a corner. The packer placed the biggest room first at the origin — perimeter, often
   a corner, never a locked corner dial.
2. Six centre piers (`ROOMS.ballroom.columns`) were copied onto every generated ballroom
   and emitted by `room.js` as mould solids.
3. `views/game.js` Phase A baked **eight** smashable chairs before anyone knew how many
   players had joined. `intro-bed.js` already uses `cast.length` after warm.
4. Catalog smashables (knight / lounges / piano / chandeliers) were not on the live
   placer. The hook is `dressLooseFurniture` in `furn-dress.js`.
5. Map-designer "cyan" ≠ the live dig barrier. See §4. **Not this PR.**

---

## 1. Exact file ownership

This slice may edit these. Anything else is another owner's.

| file | what you do to it |
|---|---|
| `docs/slices/task-procedural-mansion-layout.md` | this file |
| `harness/genspike.mjs` | optional `homeCorner` packing + `roomAtEnvCorner` |
| `src/world/genplan.js` | play spawn is the ballroom when one exists |
| `src/game/spaces.js` | pass `homeCorner`; never attach ballroom columns; **do not move** authored `HOUSE_PLAN` |
| `src/party/mansion.js` | `PLAN_OPTS.homeCorner`; `planPasses` requires a corner |
| `src/game/follow-bed.js` | catalog/loose dress through `dressLooseFurniture`; no chairs in the warm |
| `src/game/intro-bed.js` | **read / keep.** `cast.length` is already the lock. Do not rewrite. |
| `src/game/dig.js` | **owned for the cyan follow-up, not this PR.** Do not retune interconnect / G-channel. |
| `src/game/room.js` | colonnade **reader** only (comment + consume `sp.columns` as it already does). No barrier policy. |
| `src/views/game.js` | Phase A chairs after seating lock, not `count: 8`. Phase B calls `dressLooseFurniture` once. |
| `src/game/furn-dress.js` | **the placer hook.** Catalog always; GeoBin kit only if `?kitdress=1`. |
| `src/game/furn-catalog.js` | **read.** `FURN_SMASH_ASSETS` is the id list. Do not invent rows. |
| `src/game/furn-layout.js` | placement table + GLB loader that the hook calls; full 24 |
| `src/game/furn-fit.js` | shared Meshy scale (`fitCatalogProp`); smash lab imports it |
| `src/game/portal-clearance.js` | **the one doorway keep-out helper.** Pure. Reuse, do not fork. |
| `src/game/chair-seats.js` | locked seat count (pure) |
| `harness/party-warm.mjs` | W14 layout assertions |
| `harness/scenarios/furn-sledge.mjs` | F1 reads the seating lock, not "always 8" |

### Owned by other systems — do not edit

- `src/destruction/damagefield.js`, `src/destruction/support.js` — smash bed. Cyan is PR B.
- `harness/genspike.mjs` **default** packing (no `homeCorner`) — the 512-seed corpus and
  `house-packing.md` figures stay on the old arm.

---

## 2. Inventory (measured on this remote vs John's local tree)

Cited local tree: `C:\Users\John\Documents\models\web-prototype`.

**Correction (project lead, 2026-08-23):** `public/models/furn/` is **not empty**. Main
and this branch both carry the 24 `rrr_prop_*.glb` files as normal git blobs (multi-MB,
`glTF` magic, not LFS pointers). An earlier agent note that the folder was empty was
wrong — the inventory glob missed binaries. `bed.glb` and `tato.glb` are local-only
untracked on John's machine and are **not** required.

The rest of the inventory matched the remote tree.

### 2.1 Ballroom placement

| fact | where | what it actually does |
|---|---|---|
| Authored house: south hub, **not a corner** | `spaces.js` `HOUSE_PLAN` `{ id: 'ballroom', at: [0.00, 0, -0.65], turns: 0 }` (~L997) | Spans the full south edge (both SW and SE). **Not rewritten.** Moving it would break authored portals, panels, and patrol. |
| Packer places biggest first | `harness/genspike.mjs` `selectRooms` / `placeRooms` | First room at `(0,0)…(w,d)`, then later rooms grow the bbox on **any** face. Corner is **emergent luck**, not a rule. |
| Spawn is a random room | `genspike.mjs` `measure().spawn` → `genplan.js` | Seeded pick of any room except the exit. **Not** the ballroom. |
| Party start is already the ballroom | `follow-bed.js`, `intro-bed.js` `ballroomOf` | Camera / runner / intros stand in the ballroom **regardless** of `GEN.spawn`. |
| Party plan picker | `src/party/mansion.js` `planPasses` | Gallery exists, ballroom exists, door-connected. Corner is now required (this slice). |

### 2.2 Centre pillars

| fact | where |
|---|---|
| Six piers on the centre line | **was** `ROOMS.ballroom.columns` `{ z: 0, xs: [-11,-6.6,-2.2,2.2,6.6,11], w: 0.95 }` |
| Generated rooms inherit them | `dressGenerated` → `placeColumns(f, def.columns)` |
| Authored house inherits them | `placeRoom` → same `placeColumns` |
| Builder emits mould + colliders | `src/game/room.js` `if (sp.columns)` (~L2355) |
| Warm / intro cameras dodged them | `follow-bed.js` / `intro-bed.js` comments about the colonnade |

### 2.3 Deferred chairs

| fact | where |
|---|---|
| Party intros already use joined count | `intro-bed.js` `n = max(1, seats.length)` from `cast` (after warm) |
| Party chairs are **not** in the warm bake | intros cue fires after Start (`party-host.js` `maybeSendIntros`) |
| Intro teardown removes the chair mesh | `intro-bed.js` `dispose()` drops the intro group |
| game.play used to bake eight chairs at dress | `src/views/game.js` Phase A `count: 8` |
| smash gate assumed eight | `harness/scenarios/furn-sledge.mjs` F1 |

### 2.4 Cyan — live vs map designer (follow-up, not this PR)

John's map-designer "cyan" and the live dig barrier are **not the same layer**.

| fact | where | meaning |
|---|---|---|
| Live cyan is the DamageField **G channel** | `damagefield.js` starts `barrier.fill(1)` | Coat → white → cyan is the smash stage on a **dig face**. |
| Dig faces are **interior shared runs** | `dig.js` `generatedDigEdges` / authored `DIG_EDGES` | Room–room (and room–corridor) contacts. That is where the cyan barrier actually stands. |
| Map designer "cyan" | genspike `L_DIG` / `freePanels` skip | Short **nodig** runs under 1.20 m. A label, not the G-channel barrier. |
| Exterior / map envelope | `house-packing.md` envelope metres; `exterior.js` | Solid architecture / non-dig exits. You cannot leave the map because there is **no dig face**, not because of cyan. |
| Party warm forbids `?plan=gen` | `follow.js` `FOLLOW_FORBIDDEN` | `GEN` is null in the warm iframe. `freePanels()` uses **authored** `DIG_EDGES` ids against generated space ids. A stated "generated house has generated dig edges" is wrong for that iframe. |

Implementing "cyan only on the map envelope, none between rooms" is therefore:

- **not** "move a colour to a different wall"
- a `dig.js` / `room.js` / DamageField change: inter-room dig would open through (no cyan
  stage); envelope walls would become (or stay) impassable cyan
- a survival / interconnect change. `docs/design/dig.md` Act 1 is "sealed rooms, one
  hidden interconnect." Removing inter-room cyan deletes that search unless a new rule
  replaces it.

**This PR does not implement that.** Soft spots, `setInterconnect`, and `game.play`
survival stay as shipped. See §4.

### 2.5 Smashable furniture

Catalog: `src/game/furn-catalog.js` `FURN_SMASH_ASSETS`. Assets under
`public/models/furn/` — 24 `rrr_prop_*.glb` blobs in git. Vite serves them at
`/models/furn/<file>`, the same prefix `furn-smash-lab.js` already loads.

| id | file | kind | room |
|---|---|---|---|
| `armor` | `rrr_prop_armor_v1.glb` | urn | corridors / service (John: knight) |
| `hall-stand` | `rrr_prop_hall-stand_v1.glb` | desk | corridors / service |
| `crate` | `rrr_prop_crate_v1.glb` | crate | corridors / service |
| `chaise` | `rrr_prop_chaise_v1.glb` | chair | study (John: lounge) |
| `settee` | `rrr_prop_settee_v1.glb` | chair | study (John: lounge) |
| `wingback` | `rrr_prop_wingback_v1.glb` | chair | study (John: lounge) |
| `ottoman` | `rrr_prop_ottoman_v1.glb` | chair | study (lounge group) |
| `desk` | `rrr_prop_desk_v1.glb` | desk | study |
| `bookcase` | `rrr_prop_bookcase_v1.glb` | desk | study |
| `chair` | `rrr_prop_chair_v1.glb` | chair | study |
| `fireplace` | `rrr_prop_fireplace_v1.glb` | fireplace | study (wall, never a doorway) |
| `gramophone` | `rrr_prop_gramophone_v1.glb` | giltbox | study |
| `grand-piano` | `rrr_prop_grand-piano_v1.glb` | desk | ballroom (John) |
| `chandelier` | `rrr_prop_chandelier_v1.glb` | giltbox | ballroom (John; two, hanging) |
| `rug-circle` | `rrr_prop_rug-circle_v1.glb` | rug | ballroom centre (thin) |
| `torchiere` | `rrr_prop_torchiere_v1.glb` | giltbox | ballroom (gallery fallback) |
| `card-table` | `rrr_prop_card-table_v1.glb` | console | ballroom, clear of chair ring |
| `cam-tripod` | `rrr_prop_cam-tripod_v1.glb` | camera | ballroom (Meshy smash cam) |
| `console` | `rrr_prop_console_v1.glb` | console | gallery (ballroom fallback) |
| `vitrine` | `rrr_prop_vitrine_v1.glb` | desk | gallery |
| `sideboard` | `rrr_prop_sideboard_v1.glb` | desk | gallery |
| `pedestal-bust` | `rrr_prop_pedestal-bust_v1.glb` | urn | gallery (chapel fallback) |
| `cam-wall` | `rrr_prop_cam-wall_v1.glb` | camera | gallery (Meshy smash cam) |
| `table-round` | `rrr_prop_table-round_v1.glb` | console | chapel (study fallback) |

`bed.glb` / `tato.glb` stay local-only and are **not** in the catalog.

Placer hook: `src/game/furn-dress.js` `dressLooseFurniture`. The table lives in
`furn-layout.js` (`catalogPlacements` / `dressCatalogFurniture` / `CATALOG_ROOM_ASSIGN`)
so `party-warm` can assert ids without importing THREE. Doorway keep-out is
`src/game/portal-clearance.js` — the one shared helper.

Procedural stand-ins that **are** in repo (not catalog GLBs): `world/chandelier.js`
`buildChandelier`, `world/props.js` chairs / desks / urns, `furn-dress.js` Phase B
desks/consoles. This slice places **catalog ids only** for the new set and skips a GLB
that 404s. No invented filenames.

---

## 3. The changes (this PR)

### Change 1 — ballroom in a plan corner, by construction

Authored `HOUSE_PLAN` stays the south hub. The lock is on the **generated** house.

`buildPlan(seed, { homeCorner: true })` is **explicit**, not a retry loop hoping the
unconstrained packer lands a corner.

1. If a ballroom is in the selection, **pin it first** (do not rely on biggest-first).
2. Pick a seeded pair of growth signs `(growX, growZ)` each `±1`.
3. Reject any later rect that crosses the ballroom's far face on those axes.
4. The ballroom therefore shares a corner with the room-bbox; corridors fill inside that
   bbox, so `plan.env` keeps the same corner.

Default `homeCorner` is **false**. `genspike.mjs --sweep` and the map designer stay on
the measured arm (`house-packing.md`).

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
- `room.js` still reads `if (sp.columns)` (~L2355). No `sp.columns` means no piers. The
  reader is not deleted — other rooms / a future field still work.

Authored `game.play` ballroom loses the colonnade. That is the lock, not a regression
to hide.

### Change 4 — deferred chairs

- **Party:** keep `intro-bed.js` `cast.length`. Do not bake chairs in follow-bed warm.
- **game.play:** Phase A no longer uses `count: 8`. Seat count is
  `lockedSeatCount({ players: run.players.size, chairsQuery })` from `chair-seats.js`.
  `?chairs=N` is the instrument for smash / capture. Offline play is one player → one
  chair until a seating lock says otherwise.
- `engine.__chairCircle` records `{ deferred: true, count, baked: false }`.

### Change 5 — catalog furniture through `dressLooseFurniture`

`furn-layout.js` emits placements from the catalog ids above. `dressCatalogFurniture`
loads `/models/furn/…` and registers a `FurnProp`; a missing file is a skip, not a
throw.

**The live hook is `dressLooseFurniture`.** `game.js` Phase B and `follow-bed.js` warm
call that function once. They do not import `furn-layout.js`. Early-return paths of the
hook (no wood / no materials) still attempt the catalog if `registerFurn` exists.

The loader URL is `catalogUrl(id)` → `/models/furn/<file>`. A 404 is a skip
(`missing`), not a fake prop — but with the blobs in git that now means a bad path,
not an empty checkout. Authored `HOUSE_PLAN` rows carry `order` (not `roomType`);
`spaceKind` reads both so `game.play` still gets piano / lounges / knights.

### Change 6 — full 24 catalog, kit gated, doorway clearance (follow-up)

John playtested the merged PR #10 house and said none of the furniture matched the
24 smash props. Diagnosis (this follow-up, 2026-08-23):

1. All 24 `public/models/furn/rrr_prop_*.glb` exist in git and match the concept sheet.
2. PR A only placed 6 via `LAYOUT_CATALOG_IDS` (armor, chaise, settee, wingback,
   grand-piano, chandelier).
3. The visual majority was still GeoBin kit inside `dressLooseFurniture`
   (`dressStudy` / `dressBallroomExtras` / `dressGallery` / service / chapel).
4. The full 24 lineup was only on `?furnline=1`.
5. A table sat in a gallery opening.

**Dress rules (this PR):**

- `LAYOUT_CATALOG_IDS` is the full `FURN_SMASH_ASSETS` list (24). Room map is
  `CATALOG_ROOM_ASSIGN` in `furn-layout.js` and the table in §2.5.
- **GeoBin kit is off by default** on party / gen / estate nights. Gate:
  `kitDressEnabled()` in `furn-dress.js` — `?kitdress=1` restores urns, candelabra,
  procedural desks, depot crates, kit cameras. Documented here so a later agent
  does not "fix" an empty kit census.
- Catalog GLBs are the default smash dress on `game.play` estate **and** follow-bed
  warm, still through `dressLooseFurniture`.
- **Scale:** `dressCatalogFurniture` wraps the GLB and runs `fitCatalogProp`
  (`furn-fit.js`) — the same `targetH` / `maxSpan` / 1.55 boost as the smash lab.
  Do not park a raw `gltf.scene` and hope the AABB is the size.
- **Cameras:** kit `rrrCamera` GeoBins are off with the rest of kit. The smash
  cams on the default night are catalog `cam-wall` (gallery) and `cam-tripod`
  (ballroom).
- **Doorway clearance** is `src/game/portal-clearance.js`. One helper: opening
  keep-out is `w/2 + CLEARANCE_PAD` (0.45) along the width axis and
  `CLEARANCE_DEPTH` (1.35 m) into both rooms. `catalogPlacements` refuses a slot
  that overlaps. Hanging chandeliers (`liftY ≥ 2`) and thin rugs do not block a
  walk. Play-feel work (`bc-a515127a` had no helper/branch when this landed)
  should import this file, not invent a second AABB.

Cyan / dig / `bed.glb` / `tato.glb` stay out of scope.

---

## 4. Cyan follow-up (out of scope — do not implement here)

Locked rules 5–7, restated in the inventory's terms:

5. All walls are destructible.
6. Map-**envelope** walls keep an impassable cyan (cannot leave the map).
7. Inter-room dig opens through — **no cyan stage** on room–room shared runs.

That is a `dig.js` / `room.js` / DamageField G-channel change. It must not land in this
PR. Assumptions for whoever takes PR B:

- Live cyan today is on **interior dig walls**, not the envelope. The envelope is
  non-dig architecture.
- Map-designer cyan is short nodig under 1.20 m. Do not treat that colour as the barrier.
- Party warm does not set `GEN`; authored `DIG_EDGES` ids vs generated space ids is a
  real mismatch (`task-prime-time-lobby-warm-night` / `FOLLOW_FORBIDDEN`).
- `docs/design/dig.md` interconnect search is the Act 1 verb. Removing inter-room cyan
  without a replacement search **breaks** `game.play` survival as shipped.
- Soft spots / `setInterconnect` / support collapse stay owned by the smash bed.

Interior interconnect search on `game.play` stays as shipped until that follow-up.

---

## 5. Traps

- **Do not rewrite authored `HOUSE_PLAN` ballroom to a corner.** It is the south hub.
  The corner lock is `homeCorner` on the generated plan.
- **Do not flip `genspike` default packing.** `homeCorner` is an opt-in. The 512-seed
  corpus and `house-packing.md` figures are on the old arm.
- **Do not change `measure().spawn`.** Spawn-for-play is `genplan.js`; spawn-for-metrics
  stays the seeded pick.
- **Do not import `genplan.js` from `party-warm.mjs`.** It pulls THREE via
  `connectors.js`. Assert on `genspike` + `mansion.js` only. Do not import
  `furn-dress.js` from the gate either (THREE).
- **Do not rewrite `intro-bed.js` chairs.** `cast.length` is already the lock.
- **Do not touch `dig.js` / DamageField / support in this PR.** Cyan is §4.
- **Do not invent GLB filenames.** Catalog ids only; skip on 404.
- **Do not call `dressCatalogFurniture` from `game.js` or `follow-bed.js`.** The hook
  is `dressLooseFurniture`.
- **Do not invent a second doorway AABB.** Import `portal-clearance.js`.
- **Do not turn GeoBin kit back on by default.** The gate is `?kitdress=1`.
- **Do not park a raw `gltf.scene`.** `fitCatalogProp` is the size.
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
- catalog placement table names all 24 real `furn-catalog.js` ids
- `dressLooseFurniture` is the catalog placer hook; kit dress is `?kitdress=1` only
- all 24 catalog GLBs are real glTF blobs on disk; layout URLs resolve to them
- authored `order` rows (no `roomType`) still place piano/chandeliers in the ballroom,
  lounges in the study, and armor in the service passage — not the chapel
- a table centred on D1 (gallery entry) is refused; every emitted placement is
  `placementsClearOfOpenings` against the authored portals

Play:

1. Party lobby warm → house stands, **no** player chairs.
2. Start / seating lock → intros cue → chairs = joined phones, equally spaced in the
   ballroom centre.
3. `?plan=gen` → ballroom in a corner, no centre piers, spawn in the ballroom.
4. `game.play` → one chair unless `?chairs=N`.
5. Catalog GLBs: the full 24 (inventory in §2.5). Knights / hall-stand / crate in
   corridors / service, lounge group in studies, piano + two chandeliers + rug in
   the ballroom, display pieces in the gallery, round table in the chapel. No
   `rrr_prop_*` in a doorway. `__furnLayout.missing` should be empty when Vite is
   serving `public/`. Kit urns / depot crates / kit cameras stay off unless
   `?kitdress=1`.

Cyan / dig-through-inter-room is **not** a test of this PR.
