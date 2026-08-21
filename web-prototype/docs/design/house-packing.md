# House packing — can free-form rooms plus corridor decomposition give us all-diggable walls?

`genspike-1`, 2026-08-09. Harness: **`harness/genspike.mjs`**. No engine import, no browser, no
render. Pure geometry and graph work; `node harness/genspike.mjs --sweep 512` runs in **1.8 s**.

> John, 2026-08-08: *"if its procedural and we have many different shaped rooms **how can they fit
> together tightly with maximum surface area contact. We want all the shared wall to have the
> digging mechanic** and we also want it to look like my art."*
>
> John, deciding the shape of the answer: *"we free form placement and **make dark corridors that
> house the hunter later**. the hunter will hear you and can come through the wall."*

---

## 1. The verdict

**IT WORKS, and the headline is 92.8%.**

Over 512 seeds at the shipping settings: **92.79% of every internal boundary metre in the house is
diggable** (p05 79.9%, median 94.8%, p95 100.0%) — **266.5 diggable metres out of 288.2 metres of
internal wall**.

> ⚠️ **CORRECTED 2026-08-10 (`diet-2`), on a correction first filed by `critic-corridor-1`
> (`critique-corridor-house.md` §4) on the day this document was written.** This paragraph used to
> end *"against a shipped house that has 24.2 m of dig face on 5 authored edges."* **That baseline
> was already stale when it was typed, and §9.2 of this same document already used the correct
> 14 spans.** `DIG_EDGES` in `src/game/dig.js`, re-counted off disk today: **7 edges, 14 spans,
> 47.72 m of dig face** (`svc_w` 11.24 + `svc_e` 11.24 + `gal_svc` 2.56 + `gal_east` 8.28 +
> `gal_chapel` 2.96 + `bal_west` 5.52 + `bal_east` 5.92). `digcover-1` appended the last five edges
> on 2026-08-09 — the same day.
>
> The authored house has **90.8 m** of internal shared wall available, so the honest comparison is:
>
> | | diggable | of available internal wall |
> |---|---:|---:|
> | shipped house, today | **47.72 m** | **52.6%** |
> | generated, 512 seeds | 266.5 m | **92.8%** |
>
> (`critique-corridor-house.md` quotes 52.5% from a rounded 47.7; the ratio is 52.55%.)
>
> 🎯 **Still a real win, but notice WHAT KIND.** The authored house's missing 43 m is not wall that
> *cannot* be dug — it is wall nobody has authored yet, i.e. somebody's afternoon. **The generator's
> un-substitutable value is that it makes the diggable fraction a property of the ALGORITHM instead
> of a property of authoring effort**, across 512 seeds with no author in the loop. "92.8% vs five
> authored edges" oversells it, and this project has been burned by unsourced headline numbers.

Counting the exterior envelope too, **58.17% of ALL boundary is diggable**. That fraction has a
hard ceiling the algorithm cannot move: the envelope perimeter averages 168.8 m against 288.2 m of
internal wall, i.e. **37% of all boundary in this house is by definition the outside**, and by
John's own rule exactly one room may breach it. `58.17 / (288.21 / (288.21 + 168.75)) = 92.3%` —
the two numbers are the same measurement.

The three solvability gates and the hunter gate pass on **512/512 seeds**. Zero seeds are
degenerate. No seed produces an unwalkable corridor. The `--selftest` arm proves, on 64 seeds, that
the plan is a pure function of the seed, that the cells tile the envelope exactly with no overlap,
and that every room keeps its authored `spaces.js` footprint to the centimetre.

**But there is a three-way tension the brief did not anticipate, and it is the real result of this
spike.** Maximum contact, the hunter's warren, and the draw-call ceiling pull against each other,
and you cannot have all three at their best. §5.

### Re-run it

```
node harness/genspike.mjs --selftest            invariants + determinism, 64 seeds
node harness/genspike.mjs --sweep 512           the table in §4
node harness/genspike.mjs --plans 10            the plans in §6
node harness/genspike.mjs --seed 7              one plan: ASCII + the JSON adjacency graph
node harness/genspike.mjs --sweep 512 --gap 0   the "maximum contact, no warren" arm
node harness/genspike.mjs --sweep 512 --cut Infinity   the "residency be damned" arm, 98.4%
```

---

## 2. Three things in the brief were wrong, and one of them changes the library

1. 🚨 **"study ×2 sizes" is wrong.** `spaces.js` has `study_w` at x −13.60..−2.00, z −24.00..−8.60
   and `study_e` at x 2.00..13.60, z −24.00..−8.60. **Identical: 11.60 × 15.40, storey 4.80 both.**
   The house has six spaces but **five distinct footprints**. I did not invent a second study size;
   `study` is one type that the duplicate rule emits twice, which is what the shipped plan is. If a
   second study size is wanted it is a new authored footprint and a decision for John, not for a
   spike.
2. **"Walls only — no floor/ceiling digging" and "one storey now" are consistent, but the region
   model still carries `[y0, y1]` per cell** and intersects it with the dig band before calling a
   boundary diggable. On one storey that term is constant. On two it is not, and the ballroom's
   9.60 m storey is exactly why: a first-floor neighbour would overlap it for 4.80 m of real
   diggable face. The generalisation cost nothing and is in `measure()` already.
3. **The two "minimum dig face" numbers in `dig.js` disagree with each other**, and the brief
   inherited the looser one. See §7.3.

---

## 3. The algorithm

Everything is in **structural coordinates**: a room's rect is its `spaces.js` clear rect inflated by
`WALL_T/2` = 0.15 m on all four sides. Two flush structural rects then share a 0.30 m band centred
on the line, which is precisely `spaces.js`'s *"each emits a 0.15 skin and the two meet in the
middle of the band"*. A partition drawn in **clear** coordinates would have zero-thickness walls and
would be wrong. Every reported contact length subtracts 0.30 m for the two 0.15 m corner returns.

**1 — Select.** Six mandatory rooms (gallery, ballroom, study ×2, service, chapel) plus 0–2 seeded
duplicates → **6–8 rooms, mean 6.94**. Each is independently rotated 90° or not. Placed largest
first, because a packer that places the ballroom last has nowhere to put it.

**2 — Place, free-form.** Each room after the first is placed **flush against a face of an
already-placed room**, sliding along that face by a continuous seeded offset. Flush is what buys the
contact; the continuous slide is what stops the plan reading as a spreadsheet. Candidates are scored
`contact − λ·wasted_bbox_area + align_bonus + seeded_jitter` and the best wins. Three dials:

| dial | what it does | default |
|---|---|---|
| `--align` | weight on offsets that make an edge coincide with an existing coordinate | 0.35 |
| `--gap` | weight on **set-back** placements: a corridor's width of stand-off instead of flush | 2.2 |
| `--waste` | λ, the compactness penalty per m² of bounding-box growth | 0.04 |

**3 — Decompose.** The envelope is the bounding box of the rooms. Room edges induce a non-uniform
grid; free cells are covered by maximal rectangles (two passes, row-major and column-major, keep the
better); sub-minimum rectangles are merged with the neighbour that most improves the worst
dimension; the survivors are grouped into **corridor regions**, which are rectilinear polygons, not
boxes — because a corridor in a real house is an L.

**4 — Cut the warren into corridor rooms (`--cut`, default 30 m).** A merge is refused when the
merged region's bounding box would exceed 30 m on either axis. This is the residency constraint and
it is the most important line in the algorithm. §5.

**5 — Classify.** A corridor region containing at least one 1.60 m-clear rect is a corridor. A
sub-1.60 m rect inside one is an **alcove** — dressed as a recess, still floor, still diggable on
both sides. A connected group with no walkable rect at all is **void**: solid masonry infill, not a
room, faces NOT diggable. Void is the honest failure unit and it is counted.

**6 — Graph.** Every cell pair sharing more than one wall thickness of boundary gets an edge with a
clear length, a y-overlap, a diggable flag (`clear ≥ 1.20` and the band covers the dig height), a
door state (22% open / 33% breachable / 45% chained, seeded per edge), and the list of authored dig
spans the run would be cut into.

**7 — Exit.** Exactly one **room** with ≥ 2.48 m of envelope frontage is chosen, seeded. Guaranteed
to exist, because the envelope is the rooms' own bounding box.

### Thresholds, and where each came from

| | value | source |
|---|---|---|
| `WALL_T` | 0.30 m | `spaces.js` |
| `L_DIG` — shortest diggable boundary | 1.20 m | `dig.js` `freePanels()`: `if (w >= 1.2)` |
| `L_DOOR` | 2.48 m | `connectors.js` `CONNECTOR_W` 2.08 + 0.20 jamb each side |
| `DIG_H` | 2.80 m | `dig.js` |
| authored span lengths | 2.56 / 2.96 / 5.72 | `DIG_EDGES` + `wallinstances.js` grouping |
| **`W_MIN` — walkable corridor** | **1.60 m** | ⚠️ **mine, stated not sourced.** Player collision radius is `height * 0.20` = 0.34 m and the sledge shoulder is 0.42 m (`player.js`). 1.60 is body + swing + pass. It sits deliberately **above** D7's 1.20 m, which is 1.20 **on purpose** so a stage-3 hunter cannot fit (`procedural-map.md` §4) — a generator that emitted 1.20 m corridors by accident would be giving that mechanic away. |
| `--cut` — corridor sightline cap | 30 m | the gallery's own 27.20 m long axis, which is the sightline the 580–586/625 draw-call figure was measured on |

---

## 4. The measurements — 512 seeds

`node harness/genspike.mjs --sweep 512` · align 0.35 · gap 2.2 · waste 0.04 · cut 30

```
                                   mean      p05      p50      p95
rooms per plan                     6.94     6.00     7.00     8.00
corridors per plan                 4.91     3.00     5.00     7.00
void cells per plan                0.72     0.00     1.00     2.00
envelope area  m2               1706.91  1368.60  1653.55  2324.16
room floor     m2               1219.85  1052.24  1148.80  1647.04
corridor floor m2                365.18   208.89   343.62   566.60
corridor share of floor %         22.72    16.20    22.76    29.21
envelope fill  %                  92.83    90.74    93.09    93.94

shared wall (internal)  m        288.21   215.51   283.83   369.86
  of which diggable     m        266.48   204.65   261.93   356.98
exterior perimeter      m        168.75   147.81   165.14   200.65
DIGGABLE / INTERNAL   %           92.79    79.91    94.83   100.00
DIGGABLE / ALL BOUND. %           58.17    49.25    58.51    64.81

sliver boundaries (<1.20 m)        0.90     0.00     1.00     3.00
alcoves (<1.60 m corridor cell)    1.66     0.00     2.00     4.00
void groups                        0.72     0.00     1.00     2.00
void floor lost m2                 5.46     0.00     0.00    30.05
boundary onto void  m             21.30     0.00    15.40    65.18
diggable but no authored span      3.43     1.00     3.00     6.00
  metres lost to that      m       7.09     2.29     6.54    13.47
dig spans emitted per plan        46.02    35.00    45.00    61.00
max diggable degree                6.06     4.00     6.00     8.00
rooms fronting a corridor %       99.68   100.00   100.00   100.00
spawn->exit: regions crossed       2.58     1.00     2.00     5.00
spawn->exit: walls to dig          1.76     0.00     2.00     4.00

degree distribution (diggable edges per region)   ROOMS | CORRIDORS:
   deg  1  room  10.8% #####                     corr   0.1%
   deg  2  room  32.0% ################          corr  12.1% ######
   deg  3  room  34.7% #################         corr  42.5% #####################
   deg  4  room  11.5% ######                    corr  17.7% #########
   deg  5  room   7.9% ####                      corr  13.8% #######
   deg  6  room   2.2% #                         corr   7.6% ####
   deg  7  room   0.8%                           corr   4.7% ##
   deg  8  room   0.2%                           corr   1.2% #
   deg  9+ room   0.1%                           corr   0.3%
dead-end rooms (deg <= 1)          0.75     0.00     1.00     2.00

RESIDENCY (procedural-map.md §4 — a generation constraint, not a runtime hope):
largest corridor region   m2     146.74    74.77   136.40   253.42
  its longest span        m       25.15    17.71    26.36    31.10
  rooms opening onto it            3.81     2.00     4.00     5.00

GATE (percent of seeds passing):
   every region reachable from spawn (open|breach|dig)  100.0%
   the one exit reachable                               100.0%
   hunter reaches every region (through walls)          100.0%
   every room touches a corridor (>= 1.20 m)             97.9%
   plans with a single corridor warren                   16.0%
   min-walk to exit (>=2 digs or >=3 regions)            65.4%
   DEGENERATE: a ROOM touches every other region          0.0%

VARIETY: 478/512 distinct (type-multiset x degree-sequence x corridor-count) signatures
         385/512 distinct degree sequences alone
```

**Reading the degree distribution.** Rooms cluster at degree **2–3 (67%)**: a room has two or three
diggable neighbours, which is the shape that makes "which wall do I break" a decision. Corridors
cluster at **3 (42.5%)** and reach 8 — they do the connective work, which is what a corridor is for.
Only **0.75 rooms per plan** are dead ends (degree ≤ 1), i.e. one chapel-like spur per house, which
is the shipped house's own shape.

**The hunter check.** `procedural-map.md` §6 defers the hunter but keeps §5.3's reachability assert
in the gate, *"because it is a static graph property, it costs nothing now, and without it this
campaign ships maps the hunter campaign cannot use."* It is here, it costs 0.4 ms per seed, and it
passes 512/512: the hunter's graph — every non-void boundary long enough to hold a dig face, since
he comes through walls — reaches every live region from anywhere. **97.9% of seeds also put every
room directly on a corridor**, so the dark spaces he is meant to live in are adjacent to the rooms
he is meant to hear you in.

---

## 5. 🚨 The real finding: max contact, the warren, and residency are a three-way trade

The brief's approach is right, but it hides a conflict, and the conflict is worth more than the
headline number. All three arms below are the SAME algorithm on the same 512 seeds; only the dials
move.

### 5a. The `gap` dial — contact against the hunter's warren

`gap` weights **set-back** placements (a corridor's width between two rooms) against **flush** ones.

| `gap` | dig/int % | shared wall | corridor % of floor | slivers | voids | **every room on a corridor** | digs spawn→exit |
|---:|---:|---:|---:|---:|---:|---:|---:|
| **0** (pure flush) | 91.35 | 179.0 m | 10.7 | 0.91 | 0.76 | **9.2%** | 1.08 |
| 0.8 | 91.37 | 179.4 m | 10.8 | 0.80 | 0.77 | 7.0% | 1.07 |
| 1.6 | 97.96 | 272.4 m | 21.5 | 0.21 | 0.32 | 98.2% | 1.51 |
| **2.2** (default) | 98.42 | 275.7 m | 22.8 | 0.19 | 0.24 | **100.0%** | 1.51 |
| 3.0 | 98.82 | 276.7 m | 24.2 | 0.17 | 0.19 | 100.0% | 1.54 |

*(this table is with `--cut Infinity`, to isolate the `gap` term)*

**The counter-intuitive result: inserting corridors between rooms does not cost shared wall, it
adds 54% more of it** (179 → 276 m), because `room|room` becomes `room|corridor|room` — two
boundaries where there was one. It also nearly eliminates slivers and voids, because a deliberate
1.90 m stand-off is never an accidental 0.40 m gap.

**What it costs is the route.** Two walls instead of one means two digs to get from A to B. The
shortest spawn→exit route goes from 1.08 digs to 1.51. That is a mild cost and it is arguably a
feature: the corridor is a place you can be seen in, so crossing it is a real decision.

**What "maximum surface area contact" actually means, then, is not "make every room touch every
other room".** It is *"leave no boundary that is not shared"*, and corridors are the cheapest way to
buy that. The pure-flush arm at `gap 0` maximises **room-to-room** contact and loses on every other
axis, including the headline.

### 5b. The `cut` dial — the warren against the draw-call ceiling

`procedural-map.md` §4: *"A generator that lines rooms up into a long sightline will blow that
instantly. **Residency limits must be a generation constraint, not a runtime hope.**"*

That warning is exactly right and the naive version of this algorithm walks straight into it. Merge
every leftover rectangle into one corridor polygon and you get a **288 m² mean (p95 519 m²)
rectilinear hall, 43.8 m long (p95 62.8 m), with 6 rooms opening onto it (p95 8)**. That is bigger
than the ballroom, twice as long as the gallery, and it means the whole house is resident at once.

Refusing merges past a bounding-box span cap turns the warren into a **chain of dark corridor rooms
with diggable walls between them**, which is what the brief said in the first place —
*"decompose everything left over into corridor **rooms**"*.

| `--cut` | corridors | dig/int % | shared wall | slivers | voids | largest corridor | its span | **rooms onto it** |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| ∞ | 2.21 | **98.42** | 275.7 m | 0.19 | 0.24 | 288.0 m² | 43.8 m | **6.00** |
| 30 (default) | 4.91 | **92.79** | 288.2 m | 1.46 | 0.72 | 146.7 m² | 25.2 m | **3.81** |
| 20 | 6.55 | 87.54 | 298.1 m | 2.01 | 1.35 | 108.2 m² | 20.8 m | 2.80 |
| 14 | 8.00 | 82.99 | 303.1 m | 2.25 | 2.11 | 95.1 m² | 21.2 m | 2.28 |

**Cutting the warren buys residency and MORE shared wall (288 → 303 m) but costs the headline**
(98.4% → 83.0%), because every cut lands somewhere and some of those somewheres are slivers and
voids. **30 m is the operating point**: 92.8% diggable, 3.81 rooms visible from the biggest
corridor, and a 25.2 m sightline — under the gallery's own 27.20 m, which is the room the current
draw-call figure was measured in.

⚠️ **These are geometry proxies, not draw calls.** Nobody has rendered a generated plan. The
25.2 m / 3.81-rooms figures are the constraint a residency pass would have to be given; whether they
are the RIGHT numbers is `residency-3`'s job and needs `eo2-calls.mjs` on a generated house.

### 5c. `align` — free-form barely matters, and that is good news

John asked for free-form. The dial that snaps room edges to existing coordinates changes almost
nothing on the headline (91.14% at `align 0` vs 91.35% at `align 1`, `gap 0` arm) and **free-form is
actually BETTER for the warren** (22.5% of plans put every room on a corridor, against 9.2% aligned),
because misalignment is what creates leftover space in the first place. Slivers are slightly worse
free-form (1.02 vs 0.91 per plan) and that is the whole price. **Free-form placement is free. Take
it.**

---

## 6. Ten plans

Default settings. Uppercase = a typed room (legend under each), lowercase = a corridor region,
`#` = void (solid masonry infill), `*` marks the one room with a wall to the outside. One character
is 1.35 m across and 2.70 m down, so the aspect is roughly true.

```
+---------------------------+          +-----------------------------------+
|HHHHHaaaaaaaaaaaaaaaaaaaaaa|          |EEEEEEEEEbbDDDDDDDDDdddddddddddddd |
|HHHHHGGGGGaaaaaaaaaaaaaaaaa|          |EEEEEEEEEbbDDDDDDDDDddBBBBBffCCCCC |
|HHHHHGGGGGaaaDDDDDDDDDDDaaa|          |EEEEEEEEEbbDDDDDDDDDddBBBBBffCCCCC |
|#AAAAAAAAAAAADDDDDDDDDDDaaa|          |EEEEEEEEEbbDDDDDDDDDddBBBBBffCCCCC |
|#AAAAAAAAAAAADDDDDDDDDDDaaa|          |EEEEEEEEEbbDDDDDDDDDddBBBBBffCCCCC |
|#AAAAAAAAAAAADDDDDDDDDDDaaa|          |EEEEEEEEEbbDDDDDDDDDddBBBBBffCCCCC |
|#AAAAAAAAAAAADDDDDDDDDDDaaa|          |AAAAAAAAAAAAAAAAAAAAeeBBBBBffCCCCC |
|#AAAAAAAAAAAAaaaaaaaaaaaaaa|          |AAAAAAAAAAAAAAAAAAAAeeBBBBBffCCCCC |
|#AAAAAAAAAAAACCCCCCCCcccEEc|          |AAAAAAAAAAAAAAAAAAAAeeBBBBBffCCCCC |
|#AAAAAAAAAAAACCCCCCCCcccEEc|          |AAAAAAAAAAAAAAAAAAAAeeBBBBBffCCCCC |
|#AAAAAAAAAAAACCCCCCCCcccEEc|          |AAAAAAAAAAAAAAAAAAAAeeBBBBBffCCCCC |
|#AAAAAAAAAAAACCCCCCCCcccEEc|          |AAAAAAAAAAAAAAAAAAAAeeBBBBBffCCCCC |
|#AAAAAAAAAAAACCCCCCCCcccEEc|          |FFFFFFFFFFFFaaGGGccHHHHHcccccccccc |
|#AAAAAAAAAAAAcccccccccccccc|          |FFFFFFFFFFFFaaGGGccHHHHHcccccccccc |
|#ddddddddddddcccccccccccccc|          |FFFFFFFFFFFFaaGGGccccccccccccccccc |
|#BBBBBBBBBBBBBBBBBBBBFFFFFF|          |FFFFFFFFFFFFaaGGGccccccccccccccccc |
|#BBBBBBBBBBBBBBBBBBBBFFFFFF|          |FFFFFFFFFFFFaaGGGccccccccccccccccc |
+---------------------------+          +-----------------------------------+
seed 0  A=ballroom° B=gallery C=study     seed 1  A=ballroom B=gallery° C=gallery°
D=study° E=service F=chapel* G=chapel°    D=study* E=study F=study° G=service
H=chapel · 4 corridors                    H=chapel° · 6 corridors
36.1 x 46.3 m · shared 298 m              46.5 x 47.0 m · shared 341 m
diggable 85.0% int / 54.9% all            diggable 95.5% int / 61.8% all
corridor 24% · slivers 1e/1a/2v           corridor 31% · slivers 0e/1a/1v
```

```
+--------------------------+           +----------------------+
|aaaaaBBBBBBBBBBBBBBBBBBBBB|           |FFFaEEEEEEEEEbbbbbbbbb|
|aaaaaBBBBBBBBBBBBBBBBBBBBB|           |FFFaEEEEEEEEEGGGGGbbbb|
|aaaaaBBBBBBBBBBBBBBBBBBBBB|           |FFFaEEEEEEEEEGGGGGbbbb|
|aaaaaAAAAAAAAAAAAAAAAAAAAA|           |FFFaEEEEEEEEEGGGGGbbbb|
|aaaaaAAAAAAAAAAAAAAAAAAAAA|           |FFFaEEEEEEEEEbbbbbbbbb|
|aaaaaAAAAAAAAAAAAAAAAAAAAA|           |FFFaEEEEEEEEEDDDDDDDDD|
|aaaaaAAAAAAAAAAAAAAAAAAAAA|           |aaaaaaaaaaaaaDDDDDDDDD|
|GGGGGAAAAAAAAAAAAAAAAAAAAA|           |#CCCCCCCCCCCCDDDDDDDDD|
|GGGGGAAAAAAAAAAAAAAAAAAAAA|           |#CCCCCCCCCCCCDDDDDDDDD|
|bbbbbbbbbbbbbb############|           |#CCCCCCCCCCCCDDDDDDDDD|
|bEEEbDDDDDDDDDCCCCCCCCCCCC|           |#CCCCCCCCCCCCDDDDDDDDD|
|bEEEbDDDDDDDDDCCCCCCCCCCCC|           |#ccccccccccccccccccccc|
|bEEEbDDDDDDDDDCCCCCCCCCCCC|           |#BBBBBBBBBBBBBBBBBBBBB|
|bEEEbDDDDDDDDDCCCCCCCCCCCC|           |#BBBBBBBBBBBBBBBBBBBBB|
|bEEEbDDDDDDDDDdddddddddddd|           |#ccccccccccccccccccccc|
|bEEEbDDDDDDDDDFFFFFFFFFFFF|           |#AAAAAAAAAAAAAAAAAAAAA|
|bbbbbbbbbbbbbbFFFFFFFFFFFF|           |#AAAAAAAAAAAAAAAAAAAAA|
+--------------------------+           |#AAAAAAAAAAAAAAAAAAAAA|
seed 2  A=ballroom B=gallery            |#AAAAAAAAAAAAAAAAAAAAA|
C=study° D=study E=service               |#AAAAAAAAAAAAAAAAAAAAA|
F=service° G=chapel* · 4 corridors       |#AAAAAAAAAAAAAAAAAAAAA|
34.6 x 44.9 m · shared 272 m             +----------------------+
diggable 78.9% int / 50.0% all           seed 3  A=ballroom* B=gallery
corridor 22% · slivers 2e/2a/1v          C=study° D=study E=study
                                         F=service G=chapel · 3 corridors
                                         29.5 x 56.5 m · shared 293 m
                                         diggable 86.6% int / 54.7% all
                                         corridor 17% · slivers 0e/1a/1v
```

```
+-------------------+                  +---------------------------------------+
|aaaaaaaDDDDDDDDDDD |                  |AAAAAAAAAAAAaBBBBBaaDDDDDDDDDDDDbbbbbb |
|aaaaaaaDDDDDDDDDDD |                  |AAAAAAAAAAAAaBBBBBaaDDDDDDDDDDDDbbbbbb |
|aaaaaaaDDDDDDDDDDD |                  |AAAAAAAAAAAAaBBBBBaaDDDDDDDDDDDDbFFFFF |
|aaaaaaaDDDDDDDDDDD |                  |AAAAAAAAAAAAaBBBBBaaDDDDDDDDDDDDbFFFFF |
|aaaaaaaaaaaaaaaaaa |                  |AAAAAAAAAAAAaBBBBBaaCCCCCCCCCccEEddddd |
|aaaaaaaaaaaaaaaaaa |                  |AAAAAAAAAAAAaBBBBBaaCCCCCCCCCccEEddddd |
|aaaaaaaCCCCCCCCCCC |                  |AAAAAAAAAAAAaBBBBBaaCCCCCCCCCccEEddddd |
|aFFFFFFCCCCCCCCCCC |                  |AAAAAAAAAAAAaBBBBBaaCCCCCCCCCccEEddddd |
|aFFFFFFCCCCCCCCCCC |                  |AAAAAAAAAAAAaBBBBBaaCCCCCCCCCccEEddddd |
|aFFFFFFCCCCCCCCCCC |                  |AAAAAAAAAAAAaBBBBBaaCCCCCCCCCccEEddddd |
|aaaaaaaaaaaaaaaaaa |                  +---------------------------------------+
|BBBBBbbAAAAAAAAAAA |                  seed 5  A=ballroom°* B=gallery° C=study
|BBBBBbbAAAAAAAAAAA |                  D=study° E=service F=chapel° · 4 corridors
|BBBBBbbAAAAAAAAAAA |                  51.6 x 27.6 m · shared 226 m
|BBBBBbbAAAAAAAAAAA |                  diggable 99.5% int / 58.7% all
|BBBBBbbAAAAAAAAAAA |                  corridor 21% · slivers 2e/1a/0v
|BBBBBbbAAAAAAAAAAA |                  ⚠️ ONE OF THE TWO FLAT PLANS — see §7.1
|BBBBBbbAAAAAAAAAAA |
|BBBBBbbAAAAAAAAAAA |
|BBBBBbbAAAAAAAAAAA |
|BBBBBbbAAAAAAAAAAA |
|dddddbbccccccccccc |
|dddddbbEEEEEEEEEEE |
+-------------------+
seed 4  A=ballroom° B=gallery°* C=study°
D=study° E=service° F=chapel · 4 corridors
24.6 x 63.2 m · shared 245 m
diggable 100.0% int / 58.4% all
corridor 28% · slivers 0e/2a/0v
```

```
+-----------------------+              +--------------------------------------+
|aaaacccccccFFFFFFFFFFF |              |FFFFFFFFFFFFaaHHHHHbbbbbbbbbbbbbbbbbbb|
|aaaaccccccceeeeeeeeeee |              |FFFFFFFFFFFFaaHHHHHbbbbbbbbbbbbbbbbbbb|
|aaaaBBBBBddAAAAAAAAAAA |              |FFFFFFFFFFFFaaHHHHHbbbbbbbbbbbbbbbbbbb|
|aaaaBBBBBddAAAAAAAAAAA |              |FFFFFFFFFFFFGGGGGGGGGGGbbbbbbbbbbbbbbb|
|aaaaBBBBBddAAAAAAAAAAA |              |ddddddddddddcccccccccccbbbbbbbbbbbbbbb|
|aaaaBBBBBddAAAAAAAAAAA |              |AAAAAAAAAAAAAAAAAAAAeeCCCCCffDDDDDDDDD|
|aaaaBBBBBddAAAAAAAAAAA |              |AAAAAAAAAAAAAAAAAAAAeeCCCCCffDDDDDDDDD|
|aaaaBBBBBddAAAAAAAAAAA |              |AAAAAAAAAAAAAAAAAAAAeeCCCCCffDDDDDDDDD|
|aaaaBBBBBddAAAAAAAAAAA |              |AAAAAAAAAAAAAAAAAAAAeeCCCCCffDDDDDDDDD|
|aaaaBBBBBddAAAAAAAAAAA |              |AAAAAAAAAAAAAAAAAAAAeeCCCCCffDDDDDDDDD|
|aaaaBBBBBddAAAAAAAAAAA |              |AAAAAAAAAAAAAAAAAAAAeeCCCCCffDDDDDDDDD|
|aaaaBBBBBddAAAAAAAAAAA |              |ggggggggggggggggggggeeCCCCCffEEEEEEEEE|
|DDDDDDDDDbbbbbbbbbbbbb |              |BBBBBBBBBBBBBBBBBBBBeeCCCCCffEEEEEEEEE|
|DDDDDDDDDbbCCCCCCCCCCC |              |BBBBBBBBBBBBBBBBBBBBeeCCCCCffEEEEEEEEE|
|DDDDDDDDDbbCCCCCCCCCCC |              |BBBBBBBBBBBBBBBBBBBBeeCCCCCffEEEEEEEEE|
|DDDDDDDDDbbCCCCCCCCCCC |              |BBBBBBBBBBBBBBBBBBBBeeiiiiiffEEEEEEEEE|
|DDDDDDDDDbbCCCCCCCCCCC |              |BBBBBBBBBBBBBBBBBBBBeeiiiiiffEEEEEEEEE|
|DDDDDDDDDbbbbbbbbbbbbb |              |BBBBBBBBBBBBBBBBBBBBeeiiiiiffhhhhhhhhh|
|bbbbGGGGGbbbbbbbbbbbbb |              +--------------------------------------+
|bbbbGGGGGbbEEEEEEEEEEE |              seed 7  A=ballroom B=ballroom* C=gallery°
|bbbbGGGGGbbEEEEEEEEEEE |              D=study E=study F=study° G=service°
|bbbbbbbbbbbEEEEEEEEEEE |              H=chapel · 9 corridors
|bbbbbbbbbbbEEEEEEEEEEE |              51.1 x 47.3 m · shared 407 m
+-----------------------+              diggable 91.3% int / 61.7% all
seed 6  A=ballroom° B=gallery°         corridor 27% · slivers 1e/2a/1v
C=study° D=study* E=study°             THE BEST PLAN IN THE TEN — a real service
F=service° G=chapel · 5 corridors      spine at `ee`/`ff` between four rooms
30.0 x 61.9 m · shared 305 m
diggable 99.9% int / 62.6% all
corridor 29% · slivers 1e/1a/0v
```

```
+------------------------------+       +-----------------------------------------------+
|aaaaaaaaaaaaaaaaaaAAAAAAAAAAA |       |aaaaaaaaaaaBBBBBBBBBBBBBBBBBBBBccccccccccccccc |
|DDDDDDDDDaaCCCCCaaAAAAAAAAAAA |       |aaaGGGGGaaaBBBBBBBBBBBBBBBBBBBBccFFFFFcccccccc |
|DDDDDDDDDaaCCCCCaaAAAAAAAAAAA |       |aaaGGGGGaaaBBBBBBBBBBBBBBBBBBBBccFFFFFcccccccc |
|DDDDDDDDDaaCCCCCaaAAAAAAAAAAA |       |DDDDDDDDDaaAAAAAAAAAAAAAAAAAAAAddCCCCCCCCCcEEE |
|DDDDDDDDDaaCCCCCaaAAAAAAAAAAA |       |DDDDDDDDDaaAAAAAAAAAAAAAAAAAAAAddCCCCCCCCCcEEE |
|DDDDDDDDDaaCCCCCaaAAAAAAAAAAA |       |DDDDDDDDDaaAAAAAAAAAAAAAAAAAAAAddCCCCCCCCCcEEE |
|DDDDDDDDDaaCCCCCaaAAAAAAAAAAA |       |DDDDDDDDDaaAAAAAAAAAAAAAAAAAAAAddCCCCCCCCCcEEE |
|EEEEEEEEEccCCCCCaaAAAAAAAAAAA |       |DDDDDDDDDaaAAAAAAAAAAAAAAAAAAAAddCCCCCCCCCcEEE |
|EEEEEEEEEccCCCCCaaAAAAAAAAAAA |       |DDDDDDDDDaaAAAAAAAAAAAAAAAAAAAAddCCCCCCCCCcEEE |
|EEEEEEEEEccCCCCCaaAAAAAAAAAAA |       +-----------------------------------------------+
|EEEEEEEEEccCCCCCaaeeeeeeeeeee |       seed 9  A=ballroom B=gallery C=study D=study
|EEEEEEEEEBBBBBBBBBBBBBBBBBBBB |       E=service* F=chapel G=chapel · 4 corridors
|EEEEEEEEEBBBBBBBBBBBBBBBBBBBB |       62.1 x 25.0 m · shared 293 m
|bbbGGGGGcBBBBBBBBBBBBBBBBBBBB |       diggable 80.7% int / 50.7% all
|bbbGGGGGcBBBBBBBBBBBBBBBBBBBB |       corridor 24% · slivers 0e/2a/1v
|bbbbbbbbbBBBBBBBBBBBBBBBBBBBB |       ⚠️ THE OTHER FLAT PLAN — see §7.1
|bbbbbbbbbBBBBBBBBBBBBBBBBBBBB |
|bbbbbbbbbdddddddddddddddddddd |
|bbbbbbbbbFFFFFFFFFFFFdddddddd |
+------------------------------+
seed 8  A=ballroom° B=ballroom* C=gallery°
D=study E=study F=service° G=chapel° · 5 corridors
39.8 x 51.6 m · shared 305 m
diggable 100.0% int / 62.7% all · corridor 24% · slivers 2e/3a/0v
```

**These read as houses.** Seed 7 has a genuine service spine (`ee` and `ff`, two parallel 1.9 m
corridors running the full depth between four rooms). Seed 8 has a wrapping perimeter corridor with
the second ballroom as a terminus. Seed 3 is a stack of great rooms off one western passage. Seed 2
has a proper cross-corridor at `bbbb` with the studies hung off it. Seed 4's `a` is the one that
reads worst — a big irregular western hall rather than a corridor — and it is the plan that would
most benefit from a tighter `--cut`.

---

## 7. The failure modes, all of them

### 7.1 ⚠️ FLAT PLANS — the worst failure and it is not in any of the summary numbers

**Two of the ten (seeds 5 and 9) are one row of rooms.** 51.6 × 27.6 m and 62.1 × 25.0 m, every
room on the same z band, nothing above or below anything. They score *well* — 99.5% and 80.7%
diggable, no voids — and they are the least interesting houses in the set. There is no "upstairs",
no "round the back", no loop.

The cause is the scoring function: a room placed against the east face of the last-placed room
usually wins, because the bounding box grows least on the long axis of an already-long plan. It is a
greedy packer running downhill.

**This is not measured by any metric in §4 and it should be.** The fix is an aspect-ratio term in
the score, or seeding the placement with two "anchor" rooms on different axes. Cost: a few hours.
**Ten plans is a small sample and the true rate is unknown — measuring it is the first thing the
next agent should do.**

### 7.2 Slivers — largely solved, honestly reported

- **Sliver boundaries** (a room-to-room contact under the 1.20 m dig minimum): **0.90 per plan**,
  p95 = 3. These are boundaries that exist and cannot be dug. They are the single largest
  contributor to the 7.2% of internal wall that is not diggable.
- **Alcoves** (a corridor cell under 1.60 m clear): **1.66 per plan**. These are NOT a failure — they
  are recesses off a walkable corridor, still floor, still diggable on both sides. They are counted
  separately precisely so they are not confused with the real thing.
- **Voids** (a leftover group with no walkable cell at all — solid masonry): **0.72 groups per plan,
  5.46 m² of floor**, but **21.3 m of boundary faces one**. A void face is not diggable, so voids
  are the second contributor to the missing 7.2%.
- **Narrow corridors that are not walkable:** zero. By construction — a group with no 1.60 m cell is
  reclassified as void rather than shipped as a passage nobody can walk down.

The set-back placement (`gap`) is what fixed this: pure flush packing produced 0.91 slivers and 0.76
voids per plan out of 179 m of wall; set-back produces 0.19 and 0.24 out of 276 m. **A deliberate
1.90 m stand-off is never an accidental 0.40 m gap.**

### 7.3 🚨 `dig.js` contains two "minimum dig face" numbers and they disagree by 2.5×

`freePanels()` accepts any span `w >= 1.2`. But `DIG_EDGES` only ever authors **2.56 / 2.96 / 5.72**,
and the reason is in `dig.js`'s own comment: *"`wallinstances.js` groups by `width x height x
thickness`, so a free face's aperture group IS its span length; a fourth length would be a fourth
group (two more `InstancedMesh`es) and `dig-toggle.mjs` gates the free arm at +3 aperture groups."*
With the ≥ 0.20 m end margins the shipped table also obeys, **the shortest boundary that can carry
an authored span is 2.96 m** — 2.5× the guard.

Measured: **3.43 boundaries per plan, 7.09 m, are diggable by `dig.js`'s rule and unbuildable by
`wallinstances.js`'s.** That is only 2.7% of the diggable metres, so it is small — but it is a real
inconsistency in shipped code, it is not this generator's fault, and a generator that trusts the
1.20 guard will emit dig faces that cannot be instanced. **The generator must use 2.96, not 1.20,
as its dig threshold — or `wallinstances.js` needs a fourth group and someone needs to re-measure
`dig-toggle`.**

### 7.4 The min-walk gate fails 34.6% of the time

`procedural-map.md` §5.4 requires *"a minimum walk from spawn to the nearest exit, so a run cannot
be won in eight seconds."* At present spawn and exit are picked independently and **34.6% of seeds
put them within one dig of each other** (p05 = 0 digs — adjacent, with an open door). This is a
generator bug with a two-line fix (pick the exit from the far half of the graph-distance ordering
from spawn) that I deliberately did NOT apply, because it changes what "hidden" means and that is
John's call, not a spike's. **It must be a gate assert before this ships.**

### 7.5 Corridor fragmentation — reported, probably not a defect

Only **16.0% of plans have a single connected corridor warren**; the mean is 4.91 corridor regions
and typically 2 disconnected networks. For the hunter that means his dark spaces are separate
pockets he has to breach between. Whether that is bad depends on the hunter design: it is worse for
`PATROL_ROUTE`-style dwelling (`procedural-map.md` §4: *"the dwelling is what makes it scary"*) and
better for "he is behind a wall you did not expect". **Flagged for the hunter campaign, not fixed.**

### 7.6 Degenerate plans — did not occur

**0.0% of 512 seeds** have a typed room touching every other region. Max room degree is 6.06 mean,
8 at p95, against 9.15 regions. The failure mode the brief warned about does not happen; what DOES
happen is a **corridor** touching everything, which is a spine and is wanted. The two are measured
separately for exactly this reason.

---

## 8. The combination count, and why it is the wrong question

**Discrete arrangements**, honestly bounded:

| factor | count |
|---|---|
| room multiset (6 mandatory + 0/1/2 of 5 types) | 1 + 5 + 15 = **21** |
| independent 90° rotations, 6–8 rooms | ≤ 2⁸ = **256** |
| placement: room *k* picks host (*k* choices) × face (4) × stand-off (3), for k = 1..7 | ∏ 12k = 12⁷ · 7! ≈ **1.8 × 10¹¹** |
| **total discrete** | **≈ 10¹⁵** |

Plus a continuous slide offset per placement, which makes the true count uncountable. **The maths is
not the limit and never will be.**

**Measured structural variety over 512 seeds: 478/512 (93%) distinct signatures** (type-multiset ×
degree-sequence × corridor count), **385/512 (75%) distinct degree sequences alone.** So one seed in
fourteen repeats a graph shape it has already produced. That is not the limit either.

🚨 **The limit is perceptual, and it is the room library.** There are **five distinct footprints**.
Every run, the player walks into the same gallery, the same ballroom, two of the same study, the
same service passage and the same chapel — same dimensions, same order, same dressing, same
lighting rig. Only the topology moves. **A player will exhaust the perceptual variety of this
generator in ten runs and the arithmetic will be nowhere near exhausted.**

What actually buys perceived variety, in order of leverage:

1. **More footprints.** Six more room types multiplies perceived novelty far harder than 10¹⁵ ever
   will; the library is the bottleneck and everything else is downstream of it.
2. **Per-instance dressing on duplicates.** Two studies in the same plan are currently the same room
   twice. John's own note — *"Duplicates allowed, dressed differently"* — is the cheapest big win
   here, and it is an art-side change, not a generator one.
3. **The corridors**, which are the only genuinely novel geometry the generator produces, because
   they are the only cells whose SHAPE changes per seed. That is an argument for spending art on
   corridor dressing rather than on a seventh room type.
4. **Fixing flat plans (§7.1)**, because a house that is one row reads as the same house every time
   no matter what the graph says.

---

## 9. What wiring this into `spaces.js` / `dig.js` would actually cost

Nothing in `src/` was touched by this spike. Here is the honest bill, largest item first.

### 9.1 🚨 `SPACES` rows are 90% hand-authored dressing in WORLD coordinates — this is the big one

> ✅ **DONE 2026-08-09 (`localise-1`), and this section's diagnosis was right.** `SPACES` is now
> `roomsFromPlan(HOUSE_PLAN)`: `ROOMS` is a library keyed by room TYPE with every coordinate in
> the room's own frame (origin at its centre, floor level), and `HOUSE_PLAN` is six lines of
> `at` + `turns`. `study_w` and `study_e` are ONE `ROOMS.study` entry placed twice. Every emitted
> row is **byte-identical** to the row that was authored — 1170 exported leaves, `Object.is`,
> gated by `node harness/evidence/_loc1_golden.mjs --check harness/fixtures/_loc1_golden.json` — and 7 of 7
> capture-mode frames (4 `game.play` moments + `room.gallery`/`room.study`/`room.ballroom`) came
> back byte-identical, with programs 213 → 213 and `eo2-calls` 426/625 unchanged.
> ⚠️ **Two corrections to the estimate.** (a) `src/world/**` and `src/lighting/**` needed **no
> change at all** — measured: they hold zero world-absolute coordinates and never import `SPACES`,
> because they already take a plan plus an optional `base` matrix. The whole cost was in
> `spaces.js`. (b) *"Rotation is one `rotY` per room"* is true of the gallery and **not** of the
> other two orders: `room.js` `studyOrderFor` and `ballroomOrderFor` both carry `base: null` and
> read `sp.x0/z0` directly, so they follow a room that MOVES and not one that TURNS. That, plus
> `sp.columns`'s `{ z, xs }` shape, is what a rotated placement still needs — see §9.4b.

The `gallery` row in `spaces.js` is ~150 lines, and the footprint is one of them. The rest is
`lights` (key/warm/cool/up), `order`, `pilasters`, and long comments justifying each. **And the
light positions are written in WORLD coordinates**: the gallery's key is at `[11.6, 4.05, -30.55]`
aimed at `[1.2, 0.0, -26.2]`, its sconces at x ∈ {9.6, −7.8} on z −25.30 / −30.05. Every one of
those numbers is only valid where the gallery currently sits.

**Required:** a dressing table keyed by room TYPE, with every position expressed room-locally and
transformed by the plan's placement and rotation. `SPACES` becomes `roomsFromPlan(plan)`. This is
the single biggest cost of the whole campaign and **it is not in `dig.js` at all** — a slice plan
that budgets for the dig tables and not for this will be wrong by a large factor.

`gallery-order.js`'s arithmetic survives untouched, because the footprints are unchanged. Rotation
is one `rotY` per room, which `views/game.js` already reasons about (`outSign`).

### 9.2 ⚠️ `DIG_EDGES` ids are a network protocol surface — stable per seed is necessary, not sufficient

`d.<edge>.<index>.<side>` and `f.<edge>.<span>.<side>` are keyed on by `WallField.add(id)` and
`DestructibleWall.syncStage()`, and `dig.js` says the generation *"is safe only while the generation
is a pure function of an AUTHORED table"*. Generated, it becomes a pure function of the SEED, which
`--selftest` proves: same seed, byte-identical JSON.

**Per-seed stability is not the whole hazard.** Two clients on the same seed and DIFFERENT BUILDS
will derive different ids the moment anything changes in `selectRooms`, the candidate scoring, the
rectangle cover, or a dial default — and the ids will still look plausible, so the failure is a
silent desync rather than a crash. **The generator version must be part of the session handshake**,
and `harness/scenarios/` needs an assert that the generator's output hash for a fixed seed matches a
recorded golden value, so a scoring tweak cannot ship unnoticed.

A softer mitigation worth taking: derive edge ids from a **content hash of the boundary** — sorted
room-type pair plus rounded world coordinates — rather than from array index. Then a change to
candidate ORDER does not renumber a boundary that did not move.

Volume: a generated plan emits **46.0 dig spans (p95 61) → 92 free-face panels**, against the
shipped table's 14 spans / 28 panels. That is **3.3×**. `planSpans()` in the harness only ever emits
2.56 / 2.96 / 5.72, so the aperture-GROUP count stays at 3 and `dig-toggle.mjs`'s +3 gate holds —
but the INSTANCE count triples and `instancing-1`'s "panel cost no longer scales with panel count"
needs re-measuring at 3.3× before anyone relies on it.

### 9.3 🚨 `PANELS` / `EXIT_SITES` — this re-rolls every seed in every document, unavoidably

`spaces.js:1027` is `export const EXIT_SITES = PANELS.filter(isExitSite)` — a module-level constant
computed at import. `views/game.js:15` imports it, `:113` slices it for `?exits=N`, `:121` builds
`SITES` from it, and `run.js`'s `chooseExit(seed, sites)` derives the live exit from the POOL ORDER.

In a generated house `PANELS` is itself generated, so **the exit pool changes for every seed by
construction**. There is no version of this that preserves recorded seeds. Consequences:

- **Every "seed s4 exits at …" in every doc becomes meaningless under the generated mode.** That is
  not a bug to avoid, it is the price of the feature.
- Therefore the generated house must ship as **a new mode alongside `?estate=port`, not as a
  replacement** — same shape as `?dig=free` vs `?dig=bays`. `escape.mjs`'s 20/20 on `seed=s4` and
  `mechanics.mjs` 11/11 keep running on the authored plan, which is the only way the contract
  survives the campaign.
- `EXIT_SITES` must stop being a module constant and become **a function of the plan**, threaded
  through `views/game.js`. That is a small mechanical change in three places and a large blast
  radius, because the constant is imported directly.

### 9.4 What comes free, and what is deferred

**Free:** `pathPortals()` — `procedural-map.md` §4 already says it *"BFSs over whatever is open right
now… Built for exactly this. It is the one thing that needs no work."* Confirmed: the generator's
adjacency graph is the same shape.

> 🚨 **CORRECTED 2026-08-12 — "WHATEVER IS OPEN RIGHT NOW" IS WRONG, AND ANYTHING THAT READ THIS
> LINE AS A WALK-ONLY REACHABILITY NUMBER HAS THE WRONG NUMBER.** `room.js` `pathPortals()` filters
> its edge set on **width and height only** — `portals().filter((p) => p.a !== p.b && p.w >= minW
> && (p.h ?? 99) >= minH)` — and `portals()` is `[...portalDefs, ...breachPortals()]`, i.e. **every
> doorway the plan emitted, open or shut.** It answers *"is anything permanently stranded"*, never
> *"how far can a robot walk"*. Measured: shutting **19 of 25** doors on generated seed 0 moved
> `_plangen1-boot` B4 by **exactly zero**, on all 16 seeds. B4 is still worth having — it is the
> stranding gate — but the walk-only number is its own BFS over `state === 'open'`, added as B7,
> and it reads **1 of 18** now that John has closed the doors. The connector interface (`conn-1.mjs`, `conn-2.mjs`) and
`?tells=blind` are both built and both generalise.

**Deferred with the hunter:** `PATROL_ROUTE`, `SPAWN`, `ANCHORS`. The hunter REACHABILITY assert is
in this generator's gate now (100% of 512), as §6 of `procedural-map.md` requires.

**Needs a real measurement, not a proxy:** residency. §5b's 25.2 m / 3.81-rooms figures are geometry
and nothing has been rendered. `residency-3` has to run `eo2-calls.mjs` on a generated plan.

### 9.4b What a GENERATED placement still needs on top of `localise-1` (measured, 2026-08-09)

The rooms are portable now. Placing one somewhere new, or turned, still needs these — none of
them is in `spaces.js`, which is why the localisation slice stopped where it did:

1. **`room.js` must be able to build a TURNED room.** `galleryOrderFor` already composes a `base`
   matrix (`makeRotationY(PI/2)` then a translate to `sp.cx/cz`) and is fine. `studyOrderFor` and
   `ballroomOrderFor` carry `base: null` and read `sp.x0/sp.z0` directly — parametric on the
   footprint, blind to rotation. Both need the gallery's treatment.
2. **`sp.columns` is axis-locked.** `room.js` reads `{ z, xs, w }` — a pier row at one world z. A
   90-degree ballroom needs a row at one world X, which that shape cannot say. `placeRoom` throws
   rather than emitting a colonnade on the wrong axis; the colonnade is that room's gameplay.
3. **Two storeys need `room.js` to place the space root.** `HOUSE_PLAN`'s `at[1]` is carried
   through the transform and is 0 in all six slots. Setting it today would lift the LIGHTS and
   leave the geometry on the ground, because every space is built from y = 0 up and `spaceAtXZ`
   / `abuts` are 2D. ⚠️ `abuts()` and `spaceAtXZ()` are otherwise fine for any placement, because
   a quarter-turned rectangle is still axis-aligned.
4. **Station anchors cannot come from the room library, and this is the surprise.** `study_w` and
   `study_e` are one footprint used twice, so a per-type station table ought to give them equal
   local points. It does not: `study_w.south` and `study_e.south` are local x **−0.80 and +0.80**
   — mirrored — because they stand on the D1/D4 and D6 axes respectively. **The place anchors are
   CONNECTOR-derived, not room-derived**, so a generator has to derive them from the plan's
   connectors the way `studyOrderFor` already derives the chimney bay. §9.4 defers this set with
   the hunter; this is the reason it cannot simply be lifted into `ROOMS`.
5. **`PANELS` / `EXIT_SITES` / `exterior.js`'s `YARDS`** — §9.3, untouched on purpose. Note the
   third one: `YARDS` is keyed by exit-site id, so a generated pool without generated yards opens
   every new site onto nothing (`exterior.js` warns and skips).

### 9.5 A rough order for the slice that follows

1. Measure the flat-plan rate over 512 seeds and add an aspect term to the placement score (§7.1).
2. Raise the generator's dig threshold to 2.96 m, or fix `wallinstances.js` (§7.3).
3. Add the min-walk gate and constrain the exit pick (§7.4).
4. Room-local dressing tables — the big one (§9.1).
5. `EXIT_SITES` as a function of the plan; new `?estate=gen` mode (§9.3).
6. Generator-version handshake + a golden-hash scenario (§9.2).
7. Only then: `residency-3` on a generated house.

---

## 10. What John should take from this

- **His idea works.** Free-form placement plus corridor decomposition gives **92.8% of internal wall
  diggable**, up from the **52.6%** the 7 authored edges give today (see §1's 2026-08-10 correction —
  this line used to say "5 authored edges"), on a complete partition where the remaining 7.2% is
  slivers and solid infill and is measured rather than hand-waved.
- **The corridors are not a consolation prize, they are the mechanism.** They are what raises shared
  wall by 54%, what removes the slivers, and what puts every room next to a dark space. They cost
  half a dig on the average route.
- **"Maximum surface area contact" is the wrong objective by a hair.** Packing rooms flush against
  each other scores WORSE on the thing he actually asked for. The right objective is *leave no
  boundary unshared*, and corridors are how you buy it.
- **He will notice the repetition before the generator runs out of arrangements.** 10¹⁵ plans, five
  room shapes. The next thing worth his art time is dressing duplicates differently and dressing
  corridors — not a seventh room.
