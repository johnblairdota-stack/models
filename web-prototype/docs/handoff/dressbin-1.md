# `dressbin-1` — what it costs to make the dressing part of the wall (2026-08-11)

**The instrument is `harness/scenarios/_dress1-skin.mjs` and its argument is in its own header.**
Run it:

```bash
node harness/playtest.mjs --view game.play --script harness/scenarios/_dress1-skin.mjs \
     --port 5451 --q "seed=s4" --shots                       # census + controls + the three prices
ARMS=0 ...                                                   # census + controls only (fast)
LOOK="f.gal_east.0.b" ...                                     # park, collapse the skin, photograph it
```

**Headline:** the deciding number is **not** draw calls. Every candidate mechanism fits 625, and the
one John's words describe costs **ZERO**, measured at twelve parked stations: `+0/+0` on every one.
The premise "the cost of this feature is DRAW CALLS" is only true of the mechanism nobody should
build.

| arm (flipped in place at a settled station) | delta, 12 stations | worst station | control |
|---|---|---|---|
| **shipped** | — | `ballroom.centre` **461/625** | — |
| **collapse-all** — every skin triangle written to a degenerate point *inside its merged bin* | **min 0 · max 0** | 461/625 (**+0**) | 0 at 12/12 |
| **split-proud** — proud pieces leave the bin as their own meshes | +2 … **+36** | 493/625 (+32) | 0 at 11/12 |
| **split-all** — every skin piece leaves the bin | +4 … **+49** | 510/625 (+49) | 0 at 11/12 |

Clean-control worst case: `ballroom.north` **422 → 471** (split-all) / **449** (split-proud).
⚠️ `ballroom.centre`'s control drifted +3/+5 — see *the instrument findings* below; treat that
station as ±5 and read `ballroom.north` as the trustworthy pessimal.

---

## 1. The census — who is skin on a destructible face

46 destructible faces exist on the default arm (`?estate=port`, `?dig=free`, `?walls=instanced`,
seed s4): **28 free/damage-armed** (`f.*`) and 18 scalar (`p.*`, `x.*`).
**39 of 46 carry skin; 21 of 28 free faces do.**

"Skin" = a triangle whose centroid lies inside the face's own rectangle and **0–0.20 m** off it
along the face normal (FLAT 0–0.05, PROUD 0.05–0.20). Geometry 0.20–0.60 m out is counted and
reported separately as `stand` — a gadget on the floor, a yard behind an exit site — and is never
priced as dressing.

### 🚨 The finding that decides the slice: **not one piece of dressing is its own mesh.**

Every skin row in the house is one of three things, and all three are meshes the frame draws anyway:

| what carries it | how many meshes | on how many faces |
|---|---|---|
| the room's own `GeoBin` buckets — `kit:wall`, `kit:gilt`, `kit:skirt`, `kit:mould`, `portraits`, `fixture:brass`, `fixture:glow` | **1 merged mesh per bucket per room** | all six rooms |
| `exterior.dress.{chain,boards,mortar}[.segment]` | **1 `InstancedMesh` per kind per family** (≤8 for the whole house) | 10 scalar + 8 free |
| `exterior.yard.*` (behind exit sites, and one reaching the chapel dig face) | 1 mesh per yard | 6 |

**So the dressing on a diggable face costs ZERO marginal draw calls today**, and that is measured,
not argued: the `collapse-all` arm removes *every* skin triangle in the house from *every* bin and
reads **+0 at all twelve stations**.

### The estate rooms, face by face

| room | its free-face sides | the bins standing on them | worst face |
|---|---|---|---|
| **gallery** | `f.gal_svc.0.b`, `f.gal_east.0.b`, `f.gal_east.1.b`, `f.gal_chapel.0.a` — **4 of 4 dressed** | `kit:wall` (`ws.paper`, 12 384 tris) · `kit:gilt` (9 552) · `fixture:brass` (15 060) · `fixture:glow` (122) · `portraits` (16) | `f.gal_east.0.b` (5.72 m): **834 skin tris across 5 bins** — brass 336 proud, gilt 396 proud in 9 runs, wallpaper 46 proud in 24 runs, glow 4, **portraits 4 = two whole canvases** |
| **study_w** | 5 sides — **1 dressed** | `f.svc_w.0.b` only: `kit:mould` 10 proud (5 runs) + `kit:wall` 2 proud, both `walnut` | 12 skin tris |
| **study_e** | 6 sides — **1 dressed** | `f.svc_e.0.a`: `kit:wall` 1 + `kit:skirt` 1 (corner returns) | 3 skin tris |
| **ballroom** | 4 sides — **2 dressed** | `exterior.dress.mortar.segment` only, 12 tris each. `f.bal_east.0/1.a/b`: **0 rows, nothing at all** | 12 skin tris |
| **service** | 6 sides — 5 dressed | `kit:wall`/`kit:skirt` 1–2 tris (corner returns) + `chain.segment` / `boards.segment` / `mortar.segment` | `f.svc_w.1.a`: 478, all exterior dressing |
| **chapel** | 1 side | `exterior.yard.x.gallery.boards` (58 tris, 15 runs) reaching the face | 58 |

**`space.gallery/portraits` is 16 triangles for eight canvases, and 10 of those 16 — five canvases —
sit inside a dig face's own rectangle, on four different faces.** That is `dig.md`'s "no span of any
authored length fits between two portraits", confirmed off the built scene rather than off the
authoring pitch.

🎯 **And the mechanism behind it is one line of dispatch, not a coincidence.** `studyOrderFor` and
`ballroomOrderFor` (`room.js`) resolve their bays from `cutsOnWall()`, and `cutsOnWall` **includes
every dig panel** (`dig: d.dig ? …`). `galleryOrderFor` does not: its `cutsFor()` returns `[]` and
its portrait/pilaster pitch is fixed. **That is exactly why the census reads 4/4 dressed in the
gallery and 1/5, 1/6, 2/4 in the studies and ballroom.** Fixing the gallery order to be cut-aware
would move more than any of the three mechanisms below.

### The pieces are CONTIGUOUS in the merged index, and that is the enabling measurement

The census reports the number of contiguous index runs each (mesh, face) group occupies. `portraits`
on `f.gal_east.0.b` is **4 triangles in 1 run**; `fixture:brass` **336 in 2 runs**; `kit:gilt` **396
in 9 runs**. `GeoBin` merges its bucket in insertion order, so an authored piece owns a known
contiguous vertex range — which is precisely the property `room.js`'s own `tracked().hide()` already
exploits to remove the interconnect brick from a merged bin **by writing degenerate vertices, with
no geometry rebuild and no new mesh**. That path is shipped, and it generalises.

---

## 2. The three mechanisms, priced

All three flipped **in place at a settled station**, each against its own shipped reading taken
seconds earlier and re-read after the revert (that third read is the control). Draw calls read
through a `renderBufferDirect` wrapper asserted equal to `renderer.info.render.calls` at every
reading — `_calls1-who.mjs`'s construction, C4, exact at 12 stations × 4 arms.

### (a) the dressing is drawn into the wall's coat texture — **+0 calls**

Draw-call shape measured by `collapse-all`: **min 0, max 0, at all twelve stations**, control 0/12.
Removing the geometry from a merged bin cannot remove the mesh, because the bin is the whole room.

⚠️ **But the coat is not ready for it, and this is a fact the brief does not carry.**
`wallstages.js` `estateSkinMat()` hardcodes `boiserieMat({paint:[0.300,0.258,0.212], grime:0.9})`,
and `room.js` never passes `materialOpts` to a panel. Read off the built bins, that is
**`space.service`'s and `space.chapel`'s wall material exactly** — while the gallery's wall bin is
`ws.paper`, the ballroom's is `est-bois paint [0.330,0.302,0.262]` and both studies' are `walnut`.
So `wall.js`'s comment *"a dig face's outer skin IS the room's own wall"* is true in **2 of 6 rooms**
and false in the four estate-ported ones. Any version of (a) has to make the coat per-room first;
that is the real first edit, and it is free in calls (one more `boiserieMat` cache key per room).

⚠️ And (a) alone cannot carry a portrait: the canvases and their frames stand **0.05–0.20 m proud**
and the picture lights further. Painting them into a flat coat flattens the gallery.

### (b) the dressing stays geometry and is cut per cell — **+0 if it stays in its bin, +49 if it does not**

Two sub-arms, because "cut per cell" does not imply "own mesh":

- **b1, the naive form (`split-all`)** — each piece becomes its own `Mesh`: **+4 … +49**, worst
  station `ballroom.centre` 461 → **510/625**, clean-control `ballroom.north` 422 → **471/625**.
  Nothing is bought for it.
- **b2, in-bin (`collapse-all`)** — the piece's contiguous vertex range is collapsed to a point:
  **+0 at 12/12**. Per-CELL granularity needs the piece authored pre-subdivided at `CELL = 0.094 m`
  (a 1.33 × 1.10 m canvas becomes 336 triangles instead of 2), and *triangles inside an existing
  merged bin are free in calls* — `exterior-1` took the yard 0.9k → 11.6k tris at **zero** extra
  calls, and the house sits at 598–670k of a 900k budget.

### (c) hybrid — flat to texture, proud stays geometry and falls — **+0 … +36 depending on how it falls**

- The flat half is (a): **+0**.
- The proud half priced at its most expensive: `split-proud`, every proud piece in the house
  permanently its own mesh — **+2 … +36**, worst station `ballroom.centre` 461 → **493/625**,
  clean-control `study_w.north` 230 → **266** and `ballroom.north` 422 → **449**.
- The proud half priced the way it should be built: keep the piece in its bin, collapse its range
  when the cell under it dies, and pay the fall out of `debris.js`'s existing `InstancedMesh` pool
  (`perKind = 220`, `mesh.count` never changes) — **+0**.

## 🎯 The recommendation: (c), with (b2) as the erosion mechanism and DEBRIS as the fall

**Flat dressing into the coat; proud dressing stays in its merged bin and is removed by a
degenerate-vertex write when its cells die, with the fall paid out of the debris pool.** Zero draw
calls, measured. The reasons, in order:

1. **Draw calls do not decide this** — all three fit 625 with 115–164 spare. Reporting a mechanism
   as expensive when the expensive part is an implementation choice inside it would be the wrong
   answer to John's question.
2. **The erosion already exists twice over.** Per-cell tearing is `breakmask.js` + `DamageField`;
   per-piece removal from a merged bin is `room.js` `tracked().hide()`, shipped, and it is written
   up as *"a degenerate-vertex write, not a geometry rebuild"* precisely to avoid a GPU upload on
   the worst frame in the run.
3. **A portrait must keep its silhouette.** It is 0.13 m proud and it throws its own shadow; the
   coat cannot hold it. It must be geometry until the cell under it dies.
4. **Splitting is the only version that costs anything and it buys nothing** — +49 at
   `ballroom.north` for a capability the in-bin write already has.

⚠️ **What I did NOT price, stated as a gap:** the coat route needs the dressing rendered into the
coat's albedo/ORM, which is a BAKE, and `progkey-1` measured boot at 213 programs / ~99 s cold. A
per-room coat is one more `boiserieMat` cache key per room (six keys, already-cached args in two of
them); painting portraits into it is a new render-to-texture per room and I have no number for it.
**That, not draw calls, is where this feature can go wrong.**

---

## 3. The three defects

- **The gallery portrait hanging over a breach — DISSOLVED, and it is the biggest single win.**
  Measured: 5 of the gallery's 8 canvases sit inside a dig face's rectangle, on 4 of 4 gallery-side
  dig faces. Photographed (`LOOK`, one held page, same-config floor **byte-identical**, revert
  control **byte-identical**): from a digging stance 3.2 m off `f.gal_east.0.b`, that face's skin
  owns **45 983 pixels past 16 levels (14.0% of the frame)** and the portrait canvases alone own
  **20 269 (4.1%)** — two framed portraits and two picture lights.
  `progress/playtest/game.play.dress1-look-f.gal_east.0.b-{A,B-portraits-only,B-all-skin}.png`.
  **What is left:** the gallery order still places by fixed pitch (`cutsFor()` returns `[]`), so the
  *pilasters* keep landing on the face too, and the canvas's frame will still need somewhere to go
  when its cell dies — the mechanism moves it, it does not decide whether it falls or fades.

- **`study_w`'s boiserie hiding a breach — LARGELY ALREADY DODGED; I could not reproduce the shape
  of this defect.** Of `study_w`'s five dig-face sides, exactly **one** (`f.svc_w.0.b`) carries study
  panelling, and it is **12 triangles in 6 contiguous runs**; the other four carry only exterior
  dressing. `study_e` is 1 of 6, the ballroom 2 of 4 (mortar only) and `f.bal_east.*` carries nothing
  at all. Cause: `studyOrderFor`/`ballroomOrderFor` consume `cutsOnWall()`, which lists dig panels.
  **What is left:** the mechanism dissolves those 12 triangles for free, but if the filed defect was
  an *occlusion-from-a-viewpoint* measurement rather than a containment one, it is measuring
  something my census does not — panelling 0.3 m to the side of a face still occludes it obliquely.
  See *what this brief got wrong*, item 3.

- **Boarding as black cut-outs in 6 of 8 rooms — ALREADY CLOSED, and the coat mechanism would not
  have been the fix.** `dark-3` (2026-08-09) attributed it to ALBEDO, not to a missing wall:
  `exterior.board` 0x3b3025 → **0x94836a** and `exterior.iron` 0x2a2b2e → **0x51565e** are the values
  in `exterior.js` today, and `_dark3-ab.mjs`'s `deal` arm is the one that shipped (L 4–10 → L 41 in
  the passage). `dressingRule` then turned **mortar off on doors** on 2026-08-11. Boards hang on
  *intact* connectors, so "it does not know the wall behind it is gone" was never the mechanism.
  **What is left, and it is live:** `dressingRule` deliberately exempts dig bands (*"a dig band is not
  a door"*), so `exterior.dress.mortar.segment` — the opaque slab across 92% × 88% of its aperture —
  is on **8 of the 28 free faces** (12 tris each, census). That slab *will* hang in front of a breach,
  and `exterior.dress.chain.segment` (340 flat + 68 proud tris) sits on 5 more. **The dressing that
  needs to learn about the damage grid is the EXTERIOR's, on the free faces, not the boards on doors.**

---

## 4. What this brief got wrong, and one instrument finding

1. 🚨 **"The cost of this feature is DRAW CALLS, not damage."** Half true, and the false half is the
   load-bearing half. Measured: the mechanism John describes costs **+0 calls at 12/12 stations**.
   Only the naive split costs anything (+49), and a merged bin can already be edited in place. The
   real cost is a **bake** and a per-room coat material, neither of which I priced.
2. ⚠️ **"parked stations currently run 599/480/426."** `426` on `?walls=instanced` does not
   reproduce as a fixed number: I read `ballroom.centre` at **423** on one run and **461** on the
   next, same build, same seed, same station — and **479** later in the same session as the 423.
3. ⚠️ **"`study_w`'s boiserie hiding 5980 of 5980 points."** I could not find that figure anywhere in
   the tree (`grep -rn 5980 docs/`), and my containment census does not reproduce a study blanketed
   by its own panelling — 1 of 5 faces, 12 triangles. Either the number is an occlusion measurement
   (a different question, and both can be true) or it is wrong. **Do not brief it again without the
   instrument that produced it.**
4. ⚠️ **"boarding reading as black cut-outs in 6 of 8 rooms"** is a closed defect (item 3 above),
   fixed by albedo on 2026-08-09 — but there is a live successor on the free faces.
5. 🆕 **A parked draw-call reading is NOT stable within a live session, and this contradicts the
   working assumption that draw calls are deterministic and exempt.** My first build of the price
   sweep walked the twelve stations once per arm; **C5 caught it on its first run**. Re-reading the
   *shipped* build at the end gave `ballroom.centre` **423 → 479 calls and 600 596 → 667 314
   triangles**, and `collapse-all` — an arm that can only ever remove geometry — read **+49**. The
   triangles moving with the calls says real geometry entered the draw set; the cause is
   unattributed (hunter position, loose-item residency and debris are all candidates).
   **The rule: draw calls are deterministic across PROCESSES at the same sim time, not across four
   minutes of one. Flip in place at a settled station; never compare two walks.**
   ⚠️ `walls-perf.md`'s *"a flip A/B at a settled station is blind to a cost paid on ARRIVAL"* is
   about shader PROGRAMS, which residency pays once when a room appears. Draw calls are a property
   of the frame you read, so a flip is correct here and a walk is not.

### Contracts

`node harness/lint-glsl.mjs` ✓ after every edit (455 files). **Nothing in `src/` was touched** — the
whole slice is one new file, `harness/scenarios/_dress1-skin.mjs`, plus this report.
`_dress1-skin.mjs`: **12 passed / 1 failed** on the price run (the 1 is C5 at `ballroom.centre`,
which is the live drift above, correctly reported rather than absorbed) and **10–12 passed / 0
failed** on the `ARMS=0` and `LOOK` runs. One uninterrupted session · 1 navigation on all three.

### The controls, and they run on every run

- **C1** a bogus face planted 500 m out must come back **UNRESOLVED** (0 self-geometry, 0 rows), so
  *"this face carries no dressing"* and *"I could not resolve this face"* can never print the same.
- **C2** every real face must resolve — its own wall stack must be in its SELF volume. **46/46.**
- **C3** a 0.40 m plate planted 0.10 m proud of a named face **must be found, on that face and no
  other**. The reintroduction arm: without it, an empty row proves nothing.
- **C4** the draw-call hook is asserted equal to `renderer.info.render.calls` at every reading.
- **C5** every flip must revert; the station must read identically afterwards. **This one has already
  gone red once and it was right both times.**
- **LOOK** carries its own same-config pair (byte-identical floor) and a byte-identical revert
  control before any pixel claim is made.
