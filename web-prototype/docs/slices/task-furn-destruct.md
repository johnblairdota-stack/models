# Slice plan: collidable · sledge-destructible furniture

**Status:** DECIDED plan — do not reopen the model without measuring. Build in the
numbered phases below; each phase ends with a gate before the next starts.

**Bar art:** room showcases + locked mansion art
- `Dev Art/1785319916301.png` (study / chimneypiece)
- `refs/_sheets/bf1-ballroom-01..03.png`, Hitman Paris chandelier refs
- Showcase views: `room.ballroom`, `room.study`, `room.gallery`, `prop.chandelier`

If a stated fact is wrong, say so in the report rather than diverging silently.
Assume any unsourced number is wrong until re-measured.

---

## Why this exists

The estate showcases already dress ballroom / study / gallery with desks, chairs,
consoles, sheeted furniture, fireplace, pier glass, urns, and chandeliers. The
playable house deliberately **omitted loose furniture** because it had no
colliders (robots and the 2.4 m hunter walked through). John wants that dressing
**in the game**, plus new furniture (eight ornate chairs in a circle), and every
piece must **block movement**, **take sledge blows**, and **break**.

This is **not** wall dig. Walls use a 2-D `DamageField` on planar faces. Furniture
is a volume with an AABB. Reusing the wall grid would lie about both dig and props.

---

## The decided model (all phases)

### `FurnProp` — one type for every breakable piece

New module: `src/destruction/furnprop.js` (pure logic + Three wiring helpers).

| Field | Decision |
|---|---|
| `id` | stable string, e.g. `ballroom.chair.3`, `study_w.desk.0`, `ballroom.chandelier.1` |
| `spaceId` | residency space that owns it |
| `box` | XZ(+Y) AABB registered on `space.colliders` — same push-out path as walls |
| `hp` / stages | discrete stages (below), **not** a DamageField |
| `mesh` | root `Object3D` (or InstancedMesh + instance index) |
| `applyHit(point, power)` | same call shape as wall panels so sledge needs one branch |
| `onBreak` | drops collider, pays debris, hides / detaches mesh |

**Stages for solid furniture** (chair, desk, console, crate, sheeted mound):

| stage | name | blocksMove | look |
|---|---|---|---|
| 0 | intact | yes | full mesh |
| 1 | cracked | yes | darker / chipped (emissive lean or swap LOD material — no second bake required for v1) |
| 2 | shattered | **no** | mesh hidden; timber/lath debris burst; collider dropped |

Health totals (use these numbers): chair **1.2**, desk **2.4**, console **2.0**,
crate **1.6**, sheeted mound **1.8**. Sledge `SLEDGE_POWER` is already ~1.0 per blow
at digPower 1, so a chair dies in ~2 hits, a desk in ~3.

**Debris:** reuse `DEBRIS_KINDS.timber` + `lath` only. Do **not** invent a new debris
kind in phase 1. Payout: 4–8 pieces on shatter, origin at hit point, outward impulse
along the swing dir (same pattern as wall `onChunk`).

**Do not** merge destructible furniture into room `GeoBin` buckets. Merged geometry
cannot hide one chair. Showcase `GeoBin` furniture stays showcase-only; the game
builds **FurnProp instances** from the same authoring functions in `props.js`.

### Sledge routing

Today `_resolveSledgeHit` → `_swingCast()` → wall `panel.applyHit` only.

**Decision:** `_swingCast` (or a sibling used by both aim mark and hit) tests
`room.furnProps` **before** wall panels. Closest hit along the aim ray within
sledge reach wins. Furniture in front of a dig face eats the blow (correct —
you smash the chair before the wall behind it).

Aim mark: if the cast prefers furniture, draw the mark on that AABB face (flat
disc is fine in phase 1; do not invent a new brush footprint).

### Perf budget (hard)

HANDOFF: calls ≤625 · tris ≤900k · gpu ≤1.389 · **before adding any prop, count meshes**.

| Piece | Mesh strategy | Colliders |
|---|---|---|
| 8 circle chairs | **one** `InstancedMesh` + per-instance hide on shatter | 8 AABBs |
| desk / console | one merged mesh per piece (wood+gilt already mergeable into ≤2 materials → ≤2 meshes) | 1 AABB each |
| sheeted row | keep InstancedMesh; shatter hides instance | 1 AABB per instance |
| fireplace | stays in architecture bucket until phase C; then **one** group with staged child hide | 1 AABB (breast) |
| chandelier | already ≤8 draws when merged; separable arms only when hit | no floor collider; optional thin cylinder under fixture for “bump head” later — **phase D skips body collider**, hit is ray-only |

Measure `eo2-calls` / parked `ballroom.centre` **before** and **after** phase A. If the
chair circle alone costs >+12 calls at that station, stop and instance harder —
do not proceed to port desks.

### What is out of scope (until named)

- Hunter pathfinding re-bake around furniture (hunter uses existing collider push-out; if it sticks, that is a follow-up)
- Network authority / multiplayer sync of FurnProp state
- DamageField-style free-form carving of a desk top
- Making fireplace dig into an interconnect
- Sheeted linen as a separate material bake (clone plaster as showcase does)

---

## Phase A — system + eight ornate chairs in a circle

**Owns (edit only these):**
- `src/destruction/furnprop.js` (**new**)
- `src/world/props.js` — add `ornateChairGeometry()` + `chairCircle()`; do not change existing `desk`/`consoleTable` signatures
- `src/game/room.js` — register `furnProps[]`, collider add/drop helpers, residency dispose
- `src/game/player.js` — `_swingCast` / `_resolveSledgeHit` furniture branch
- `src/views/game.js` — spawn the circle in ballroom only; wire `onBreak` → debris
- `harness/scenarios/furn-sledge.mjs` (**new**) — gate

**Does not own:** `damagefield.js`, `wall.js`, `support.js`, `chandelier.js`,
`study-order.js`, `gallery-order.js`, dig tables.

### A1. `ornateChairGeometry`

Upgrade of `chairGeometry` for the circle (keep slim `chairGeometry` for wall rows):

- Seat height 0.46, overall back **1.28**, width 0.48; **collider height 1.55**
  (eye is ~1.54 m — a 1.05 m AABB let every swing clear the chair; measured `_furn-diag`)
- Balloon / cabriole front legs (lathe), sabre rear
- Pierced splat back with gilt bead (`mitredFrame` on splat edge)
- Seat: slight crown; optional thin cushion slab in darker walnut (same material key)
- Materials: room `wood` + `gilt` — **two draw calls total for all 8** via one
  InstancedMesh per material **or** single material with baked gilt in albedo if
  that already exists on the gilt mesh path. Prefer **one InstancedMesh** tinted
  with the room’s walnut/gilt merged look if a single material reads; if not,
  two InstancedMeshes sharing instance matrices.

### A2. `chairCircle({ count: 8, radius, cx, cz, y, faceIn: true })`

- Ballroom centre: use space centre from `spaces` ballroom def (measure; do not hardcode
  showcase coordinates). Default **radius 3.4 m** so a 1.7 m robot can walk the
  ring’s interior and the ring does not block the three door approaches.
- Each chair faces inward (`rotY = atan2(cx - x, cz - z)` + π).
- Seeded micro-jitter ±0.04 m / ±0.05 rad so it is not a CAD array.
- Returns `{ mesh, seats: [{ id, x, z, rotY, box }] }` for FurnProp registration.

### A3. Colliders + sledge

- Each seat → `FurnProp` stage health 1.2, box ≈ 0.50 × 0.55 × 1.05 (XZ Y).
- Shatter: `setMatrixAt` scale 0 (or hide), `_dropCollider`, timber×5 + lath×3.
- Gate `furn-sledge.mjs`: walk to ring, swing until chair 0 shatters; assert collider
  gone (body can enter former AABB); assert wall behind still intact if aimed at chair.

### A4. Presentation / verify

```
npm run build
node harness/shoot.mjs --view game.play --extra "estate=port&seed=s4" --review 1280
# park conceptually at ballroom centre — use playtest or a scenario station if one exists
node harness/scenarios/furn-sledge.mjs --q "seed=s4"
```

Bar: chairs read period and gilt at ballroom distance; ring is walkable inside;
sledge destroys one chair without opening a dig face.

**Ceiling for this phase:** PASS on the mechanic gate. Art critique of ornate chairs
is a separate `critic-*` after the mesh reads.

---

## Phase B — port existing room furniture into the playable house

**Owns:** `src/game/room.js` (or a new `src/game/furn-dress.js` imported by it),
`src/world/props.js` only if spawn helpers need return values (bbox),
`src/views/game.js` debris wiring already from A.

**Per space (residency — build when space becomes resident, dispose when it leaves):**

| Space | Pieces (v1 counts) |
|---|---|
| ballroom | keep chair circle; + 2 console tables on long walls; + 1 crate stack (depot side if present); sheeted row **optional** if calls allow |
| study_w / study_e | 1 desk + 1 side chair + desk clutter parented to desk FurnProp (clutter dies with desk) |
| gallery | 1 console or bench under a pier; **no** chair circle |

Placement: resolve from `freeSpans()` / wall centres the same way chimneys resolve —
**never** hard-mirror study_e from study_w (estate-2 lesson: a breast across a door).

Each piece: FurnProp + AABB + shatter → timber debris.

**Gate:** `furn-sledge` extended — destroy study desk; body walks through; dig face
untouched. ✅ Phase B gated 2026-08-17: **16/0** on `furn-sledge.mjs` (B1 desks · B2
consoles+crate · B3 desk shatter).

---

## Phase C — fireplace (study) as staged breakable cladding

**Status (shipped):** FurnProp fireplace + urns / candelabra / gallery paintings /
boarded panel / gilt box. Four visual stages (intact → scuffed → battered → shattered),
`furn-fx.js` debris/dust, `playFurnBreak` material audio. Gate `furn-sledge` green.

**Owns:** fireplace path in `props.js` / study order emission only as needed,
`furnprop.js` stage table for `kind: 'fireplace'`.

**Decision:** the chimneypiece is **not** a dig interconnect. Breaking it must
**never** call `applyHit` on a wall panel or clear a dig barrier.

Stages:

| stage | look | collider |
|---|---|---|
| 0 | full bolection, shelf, overmantel | full breast AABB |
| 1 | shelf / consoles broken off (hide those children) | same AABB |
| 2 | overmantel cartouche gone; firebox soot niche remains | shrink AABB to firebox surround OR keep breast |
| 3 | optional: hide remaining stone surround — **still no passage** through the wall behind |

Health **4.0** (several sledge blows). Debris: stone uses `slab`/`plaster` kinds
already in `DEBRIS_KINDS` (not timber).

Showcase `room.study` fireplace geometry is the bar; game must match that silhouette
at stage 0.

---

## Phase D — chandelier takes sledge blows

**Owns:** `src/lighting/ballroom-rig.js` (keep references to `ch` instances),
`src/game/player.js` hit branch for `kind: 'chandelier'`, `src/views/game.js`.

Chandelier **already has** `detach(id)`, `cut()`, `shatterDrop` — do not rewrite it.

**Decision:**
- Aim ray hits chandelier parts by raycasting `ch.root` (or a proxy sphere per arm)
  when the aim pitch is upward enough that a wall cast would miss / be farther.
- First blows: `detach` nearest arm / corona piece → hand node to debris as a
  one-off mesh (chandelier API already returns world transform).
- A heavy blow on the chain / canopy: `cut()` — fixture falls; kill lights over
  `dieTime` (API exists).
- **No** floor collider under the chandelier in v1 (hunter/player do not walk there).

Gate: scenario swings upward at ballroom centre chandelier; at least one arm detaches;
`cut` path tested with a cheat query `?chcut=1` or a scripted second phase.

---

## Phase E — critique (separate agents)

After A–D are gated green:

1. `rrr-critique` on ballroom centre frame (chair ring + any consoles) vs BF1 / showcase.
2. `rrr-critique` on study with desk + fireplace stage 0.
3. `rrr-playcritique` — does the ring help or hurt dig routes / hunter chases?

Builder must not self-award WOWED.

---

## Trap list

- **Do not** put furniture damage into `DamageField` / dig interconnect logic.
- **Do not** merge breakable pieces into `GeoBin` wall buckets.
- **Backticks inside `/* glsl */`** break the build — lint after every GLSL edit.
- **Use `npm run build`**, never `npx vite build`.
- Sledge currently explicitly **does not** hit bodies; furniture is a third channel
  (not bodies, not walls) — keep that comment updated in `player.js`.
- InstancedMesh hide = scale instance to 0 **and** drop collider; scaling alone leaves
  a ghost blocker.
- Residency: disposing a space must dispose FurnProps and remove colliders or the
  next house seed inherits ghosts.
- Draw-call walks are not comparable across stations — A/B at **one** parked station.

---

## Suggested build order (one owner at a time)

1. Phase A (system + chair circle) ← **start here**
2. Critique chairs lightly / fix silhouette if gate passes but art is weak
3. Phase B (port desks/consoles)
4. Phase C (fireplace)
5. Phase D (chandelier sledge)
6. Full estate critique + playcritique

---

## Open only if John overrides

1. Chair circle room: **ballroom** (decided). Override: study / gallery.
2. Sheeted furniture in playable ballroom: **defer** until calls headroom measured post-A.
3. Fireplace may open a cosmetic soot niche only — **never** a dig passage (decided).
