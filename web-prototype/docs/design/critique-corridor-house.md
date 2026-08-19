# Critique — the corridor house, as a GAME

`critic-corridor-1`, 2026-08-09. Subject: `docs/design/house-packing.md` (`genspike-1`).
Asked for by John: *"I want a critic to review our plans for the corridor room gameplay and get some
better understanding about it."*

**Nothing is built. I cannot play this and I have not tried to.** Everything below is either
(a) geometry I measured myself on the generator, or (b) a judgement about what that geometry
implies, labelled as such. Where the two are different I say so. `genspike-1` proved the geometry
packs; that is not the same claim as *this is a good game*, and only the first has been tested.

**Instrument.** I re-ran `harness/genspike.mjs`'s own `buildPlan`/`measure` over 512 seeds rather
than re-deriving anything, so my numbers and §4's are the same measurement.
⚠️ **The file was being edited while I worked** (20:37, 991 → 1040 lines, adding `planFromRooms`,
`flatReport`, `flatness`, `boundarySegments`, `edgeKey` — `maptool-1`, at a guess). At that moment
it **did not import**: the export block names functions not yet written. I did not touch it. I took
a snapshot, patched only the export line **in my copy**, and confirmed it reproduces §6 exactly
(seed 0 = 85.0%, seed 5 = 99.5%, seed 9 = 80.7%) before trusting a single figure.

---

## The verdict, in one paragraph

**Build it — the approach is sound and John's corridor instinct is right for a reason nobody has
stated yet.** The question he was least sure about has a clean measured answer, and it is the
opposite of the worry. But **the biggest risk in this design is not in the document at all**: the
packing model never mentions the interconnect or the barrier, and that is the mechanic the
generated geometry actually threatens. Three things change before a line is built (§10).

---

## 1. 🎯 Do corridors undercut digging? **No — and the intuition is backwards.** Measured.

This was the review's reason for existing, so it gets the sharpest instrument I could build.
I compared the shipping arm against `gap 0` (rooms flush, corridors nearly eliminated) on the same
512 seeds — the closest thing the generator has to "the authored house, packed".

| | **default (corridors)** | `gap 0` (flush, no warren) |
|---|---:|---:|
| house walkable at **zero digs**, by floor area | **18.2%** | **30.1%** |
| regions walkable at zero digs | 1.92 | 2.46 |
| spawn totally sealed (no open door out at all) | **54.5%** | — |
| **digs to open the WHOLE house** | **7.35** | **4.85** |
| digs spawn → exit | 1.76 | 1.11 |
| exit reachable with **zero** digs | **6.6%** | **18.9%** |
| min-walk gate fails | **34.6%** | **62.7%** |

**Corridors give the player LESS free movement and MORE digging, on every line.** The corridor
house demands **+52% more digs to open** (7.35 vs 4.85) and hands out **40% less free floor**.

**Why, and it is one line of arithmetic.** A corridor is not a bypass — it is a second toll booth.
The corridor is itself behind a wall carrying the same seeded door lottery (22% open / 33%
breachable / 45% chained, `buildPlan`). So a `room → corridor → room` route is walkable end to end
only **0.22² = 4.8%** of the time, where the direct `room|room` door was open 22% of the time.
**Inserting a corridor between two rooms does not open a path, it doubles the lock count.**

⚠️ **The one caveat, and it is real:** 22% of diggable walls (4.22 per plan) connect two regions
you can *already* walk between for free. Those are shortcut digs, not necessary ones. I think that
is healthy — a dig you choose because it is faster is still a dig — but it is the honest other side.

**What I cannot know:** whether walking a 1.9 m unlit corridor *feels* like progress or like
padding. The graph says the corridor costs you; only play says whether it costs you pleasantly.

---

## 2. 🚨 The document never models the interconnect, and that is where the risk is

**`house-packing.md` contains zero occurrences of "interconnect" and zero of "barrier."** I grepped
for both. The model treats a diggable boundary as *a way through*. The shipped Act 1 mechanic is
that an ordinary wall bottoms out at the indestructible cyan and **only the hidden interconnect
passes** (`dig.md` §5), and HANDOFF's layout rule is explicit: *"one interconnect region per EDGE
… the knob is wall-per-edge, not wall."*

So the quantity that sets John's minute is **how much wall sits behind one interconnect**. Measured
on 512 seeds, against the authored geometry the 47–67 s band was actually measured on:

| | generated | authored (`DIG_EDGES` on disk) |
|---|---:|---:|
| diggable edge clear length, mean | **13.82 m** | `svc_w` = 15.4 m wall / 11.24 m dig face |
| p95 / **max** | **34.80 m / 85.90 m** | — |
| edges over 20 m | **21.8%** | none |
| authored spans per edge (mean / p95 / **max**) | 2.39 / 6 / **14** | **3** |
| spans facing one room (its whole search space) | **7.06** mean, p95 **12** | 3–6 |
| diggable edges per room | 2.85 | 2.33 (7 edges / 6 rooms) |

**John's minute is not a property the generated house inherits.** The direction is genuinely
uncertain and I will not pretend otherwise: HANDOFF's rule says *more edges per room makes a room
faster* (2.85 vs 2.33 → faster), while more spans per edge makes it slower (7.06 vs 3–6 → slower).
Both grow here. **That is precisely why it has to be measured on a generated plan and cannot be
argued from any table, mine included.**

🎯 **The tail is the case to fear, and it is nameable:** a room whose diggable boundary is
concentrated in **one very long edge** — up to **14 candidate spans behind a single interconnect
region**, against `svc_w`'s 3. That is a ~4.7× search on one wall, and `dig-band`'s six spaces
currently span 48.4–64.1 s. Nothing in the generator caps it.

**Recommendation:** the generator's constraint should be **spans-per-edge**, not just the 1.20/2.96
length threshold — split a long boundary into multiple edges (each with its own interconnect) or
cap its length. This is a generator change of the same size as the aspect term, and it protects
the game's only verb.

---

## 3. The flat-plan failure has a number after all — and it fires on **42.4%**, not 20%

§7.1 says the flat plans *"score well on every metric"* and that **no summary number catches them**.
That is the doc's own worst-failure flag, and it is the one thing here I can straightforwardly
overturn.

**The number is plan DEPTH:** `min(rooms crossed by the best horizontal line, rooms crossed by the
best vertical line)`. It is the "is there anything above or below anything" question, asked
arithmetically.

| seed | depth | row × col | cyclomatic | doc's own label |
|---:|---:|---|---:|---|
| 0 | 3 | 3 × 3 | 11 | |
| 1 | 3 | 4 × 3 | 14 | |
| 2 | 3 | 3 × 4 | 5 | good — cross-corridor |
| 3 | 3 | 3 × 4 | 5 | good — stack off a passage |
| **4** | **2** | 2 × 4 | 6 | *"reads worst"* |
| **5** | **2** | 4 × 2 | 4 | **FLAT** |
| **6** | **2** | 2 × 4 | 8 | — |
| 7 | 3 | 3 × 4 | 16 | **BEST** |
| 8 | 3 | 3 × 3 | 12 | good — perimeter loop |
| **9** | **2** | 4 × 2 | 7 | **FLAT** |

**Both hand-labelled flat plans score 2. All four praised plans score 3.** It also catches seeds 4
and 6, which the doc did not label flat but which are two-room-deep strips (24.6 × 63.2 m and
30.0 × 61.9 m) — I think that is the detector being right, not noisy.

🎯 **And here is the control the doc never took: the authored mansion scores depth 3.**
(gallery / study_w / service / study_e / ballroom / chapel from `spaces.js`: row 3 × col 4,
envelope 27.5 × 45.1 m, aspect 1.64, fill 84.8%.) **So 42.4% of 512 generated seeds are shallower
than the house everybody agrees reads as a place.** That is the rate; "2 of 10" was low.

**§7.1's diagnosis is confirmed exactly.** Shallow plans do not score worse on anything anyone was
looking at — dig/internal **92.1%** shallow vs **93.3%** deep, corridor share 0.228 vs 0.226,
digs-to-open 7.26 vs 7.42. No existing metric would ever have flagged them.

⚠️ **Someone is adding a `flatness` export to `genspike.mjs` right now.** Whatever definition it
uses, **test it against the authored mansion and require it to return "fine"** — a detector that
condemns the shipped house is measuring the wrong thing.

---

## 4. The headline's baseline is stale by 2×, and the doc contradicts itself

§1: *"against a shipped house that has **24.2 m of dig face on 5 authored edges**."*
`DIG_EDGES` in `src/game/dig.js`, read today: **7 edges, 14 spans, 47.7 m of dig face.**
`digcover-1` appended five edges (`gal_svc`, `gal_east`, `gal_chapel`, `bal_west`, `bal_east`) on
2026-08-09 — the same day. §9.2 of the same document already uses the correct **14 spans**, so the
doc disagrees with itself; §1 is the stale half.

The authored house has **90.8 m** of internal shared wall available (computed from the `spaces.js`
footprints), so the honest comparison is:

| | diggable | of available internal wall |
|---|---:|---:|
| shipped house, today | 47.7 m | **52.5%** |
| generated, 512 seeds | 266.5 m | **92.8%** |

Still a real win. But notice **what kind** of win: the authored house's missing 43 m is not wall
that *cannot* be dug, it is wall nobody has authored yet — somebody's afternoon. **The
generator's un-substitutable value is that it makes the diggable fraction a property of the
algorithm instead of a property of authoring effort**, across 512 seeds with no author in the loop.
That is worth saying plainly, because "92.8% vs five authored edges" oversells it and this project
has been burned by unsourced headline numbers before.

---

## 5. The ten plans, by eye

**What makes a plan good, stated first so the list is falsifiable:** (1) you can get *behind*
something — depth ≥ 3; (2) at least one loop you can run a hunter around, not just a tree of
rooms; (3) corridors that read as circulation — long, narrow, connecting — rather than as a
leftover paddock; (4) one or two dead ends, because a dead end is a decision, and zero is bland;
(5) the big room off-centre, so the house has a somewhere.

**Good:**
- **Seed 7 — the best, and the doc is right.** Depth 3, **cyclomatic 16** (the highest in the ten,
  i.e. the most alternate routes), 9 corridors, two parallel service spines `ee`/`ff` running the
  full depth between four rooms. 407 m of shared wall. This is a house with a back way round.
- **Seed 8** — depth 3, cyclomatic 12, a wrapping perimeter corridor with a second ballroom as a
  terminus. 100% diggable. The perimeter loop is the thing seed 5 lacks entirely.
- **Seed 1** — depth 3, cyclomatic 14, 6 corridors, 341 m shared. Busiest graph in the set;
  the `ee`/`ff`/`bb` verticals give it real circulation.
- **Seed 0** — depth 3, cyclomatic 11. The `a` hall across the north is doing corridor work and the
  chapel cluster top-left gives it a warren. The `#` column down the west edge is 2 voids — the
  only ugly part.

**Bad:**
- **Seeds 5 and 9 — the flat ones, and I agree.** Depth 2, cyclomatic 4 and 7. Seed 5 is
  51.6 × 27.6 m with **99.5% diggable** and it is the least interesting house in the set: rooms in
  a row, one corridor rank, nothing behind anything. **This is the proof that the headline metric
  is not a quality score.**
- **Seed 4 — worse than the doc says.** Depth 2, and its `a` region is a 24.6 m-wide western
  paddock, not a corridor. Its **100.0% diggable** is the highest score in the ten. Two of the
  three best-scoring plans in the set (4 at 100.0%, 5 at 99.5%) are two of the worst houses.
- **Seed 6** — unlabelled in the doc, depth 2, a 30.0 × 61.9 m strip. Same failure as 5 and 9,
  caught by the detector and missed by the eye that wrote §6. Worth noting the eye can miss it too.

**Middling:** seeds 2 and 3 — depth 3 but cyclomatic 5 each, i.e. correct shape, few alternate
routes. Seed 2's cross-corridor at `bbbb` is the good part; seed 3 is a corridor with rooms on one
side, which is a spine, not a warren.

---

## 6. Does "which room is behind this wall?" survive? Thinly — and 3 times in 4 the answer is *a corridor*

Over every diggable edge in 512 seeds, the distribution of what is on the other side, given the
room you are standing in:

| you are in | ballroom | gallery | study | service | chapel | **corridor** | entropy |
|---|---:|---:|---:|---:|---:|---:|---:|
| ballroom | 0.0% | 1.5% | 18.9% | 0.4% | 2.8% | **76.3%** | 1.02 bits |
| gallery | 1.8% | 2.1% | 4.6% | 1.8% | 8.9% | **80.7%** | 1.09 bits |
| study | 10.8% | 2.1% | 15.2% | 3.3% | 5.1% | **63.5%** | 1.68 bits |
| service | 0.7% | 2.2% | 8.8% | 1.0% | 9.7% | **77.5%** | 1.16 bits |
| chapel | 3.6% | 9.3% | 11.6% | 8.4% | 4.9% | **62.2%** | 1.79 bits |

**H(behind | where you are) = 1.40 bits, against a 2.58-bit maximum.** So the question is real —
it is not cosmetic — but it is worth about *"one of 2.6 equally likely answers"*, and the modal
answer is always the same one.

🚨 **The consequence nobody has drawn: the breakthrough is the game's payoff moment, and it
delivers the player into the least-authored space in the house roughly three times in four.** In
the shipped mansion, breaking a wall puts you in the gallery. Here it usually puts you in
procedurally-shaped leftover space. That is *on* John's design — he asked for dark corridors and
the hunter lives in them — but it means **the quality of the payoff now rests entirely on generic
corridor dressing**, which does not exist yet.

§8 already ranks corridor dressing third, for a *variety* reason. **This is a stronger reason and
it should move it up:** it is not that corridors are the only novel geometry, it is that corridors
are where the reward lands.

⚠️ On the `~10 runs` exhaustion figure: I did not re-derive it and I think it is roughly right, but
note it is a claim about *perception*, and nobody has watched a player do ten runs. Treat it as a
well-reasoned estimate, not a measurement.

---

## 7. The 30 m cut (§5) — right call, and for a better reason than the one given

The doc justifies `--cut 30` on residency and books it as costing 6 points of diggable boundary.
Measured on the same 512 seeds, the cut also buys something the doc does not count:

| | `cut ∞` | `cut 30` (default) |
|---|---:|---:|
| dig / internal | 98.42% | 92.79% |
| **cyclomatic number (loops)** | **4.49** | **8.43** |
| largest corridor | 288 m², 43.8 m span, 6 rooms on it | 147 m², 25.2 m, 3.81 rooms |

**Cutting the warren nearly doubles the number of loops in the house (+88%).** One 288 m² hall
touching six rooms is a hub, and a hub means every route is the same route — it is the
hub-and-spoke shape HANDOFF already calls out as the residency problem, arriving as a *gameplay*
problem too. **So the 30 m cap is not the renderer taxing the game 6 points; it is the one dial
that serves both.** That is the answer to the question as asked: right call for the game,
independently of the draw-call ceiling.

⚠️ Unchanged from the doc, and it is the honest limit: **nobody has rendered a generated plan.**
25.2 m and 3.81 rooms are geometry proxies. `residency-3` still has to run `eo2-calls.mjs`.

---

## 8. The min-walk gate — split it in two, because the two halves are not the same bug

John has not ruled. My argument: **the 34.6% is two different things and only one of them is
broken.**

- **6.6% of seeds put the exit within ZERO digs of spawn.** You walk out through open doors. **That
  is not a lucky break, it is a run with no game in it** — the player never touches the only verb.
  This one is a bug and should be gated absolutely, with a hard assert, exactly as §7.4 says.
- **The rest (to 34.6%) are ONE dig.** One dig is ~48–64 s of the thing the game is about, plus the
  search. **That is a short run, not a broken one**, and a search that *sometimes* pays off
  immediately is what makes the search feel like a search rather than a corridor of fixed length.
  Remove it and every run is the same length, which is the defect `play-critic-7` named in a
  different costume.

**Recommendation: assert `digs ≥ 1` absolutely; make the `≥ 2` threshold a dial John sets by feel,
alongside the dig speed he is already tuning.** Note the corridors are already doing most of this
work for free — the flush arm fails the gate 62.7% of the time and the corridor arm 34.6%.

---

## 9. What it costs the horror — specifics, as asked

1. 🚨 **The D7 refuge is now lost twice, and nothing here gives it back.** `procedural-map.md` §4:
   *"D7 is 1.20 m ON PURPOSE — a stage-3 hunter cannot fit … The generator must be able to place
   such a room deliberately, or the mechanic is lost."* `dig.md` §3 already surrendered the "too
   low for the hunter" version when free-form digging landed ("logged as a deliberate trade").
   And genspike's `W_MIN` is **1.60 m, set deliberately above 1.20** so no corridor becomes one by
   accident (§3, thresholds table) — correct, but it means the generator now *cannot* emit the
   refuge either. **The one mechanic both design docs single out as precious is absent from the
   design that replaces the floor plan it lived in.** It is cheap to give back: mark one corridor
   per plan as a 1.20 m crawl.
2. **Adjacency as storytelling.** The service passage running *between the two studies* means
   something — it is where the servants moved unseen, and it is why it is narrow. Landed against
   the chapel by a seeded offset, it is a corridor with panelling. The rooms keep their dressing
   and lose their reason. Horror lives on wrongness, and a house nobody chose has no rooms that are
   *wrong* to be next to each other.
3. **The payoff lands in leftover space three times in four** (§6).
4. **The exit stops being a place.** §9.3 is honest that `EXIT_SITES` re-rolls per seed and every
   recorded "seed s4 exits at…" becomes meaningless. Worth naming the play consequence: the
   orangery, the scullery, the crypt are currently *places with names*. Generated, the way out is a
   frontage.

**And the argument against the whole approach, stated as fairly as I can make it, because I was
told a negative result is a good result:**

**Procedural placement is not required by the defect it is nominally solving.** `play-critic-7`'s
finding was elimination — *counting padlocks*. The fix is indistinguishable closed connectors
(`?tells=blind`, built) plus the dig (built). **Both work on the authored plan.** What generation
adds is (a) diggable wall and (b) unfamiliarity. (a) is real but is 52.5% → 92.8%, not zero → 92.8%,
and more authored edges would also buy it. (b) is the contested one, and it is bought by giving up
everything in this section.

**I do not recommend against it** — 92.8% across 512 seeds with no author in the loop, plus §1's
result that corridors make the game *more* about digging, is a strong enough case. But if John
wants the cheapest thing that fixes the original defect, **it is not this**, and he should know
that before the campaign starts, not during it.

---

## 10. The three things I would change before a line of it is built

1. 🚨 **Model the interconnect, and cap spans-per-edge** (§2). The generator emits boundaries up to
   85.9 m and 14 spans behind a single interconnect region, against the authored 3. This is the
   only finding here that can break the game's core verb, and it is invisible in the current
   document because neither word appears in it. **Ahead of §9.5's item 1.**
2. **Gate on plan depth ≥ 3** (§3), using the authored mansion (depth 3) as the control the
   detector must not condemn. 42.4% of seeds are currently shallower than the shipped house.
3. **Assert the exit is ≥ 1 dig from spawn, absolutely; leave ≥ 2 as a dial** (§8).

**Then** §9.5's order stands as written. One re-ordering: **move corridor dressing up** — §6 makes
it the payoff surface, not a variety nicety.

---

## 11. What `maptool-1` must show, for John to judge a plan properly

Ranked by what actually decided things in this critique. The ASCII failed him because one character
is 1.35 × 2.70 m and every plan reads as a spreadsheet; but the deeper problem is that **the
things that decide whether a plan is good are not in the picture at all.**

1. **A true-scale top-down plan** with room names in the rooms. Non-negotiable baseline.
2. 🎯 **Door states on every boundary, colour-coded** (open / breachable / chained / no-door). This
   is the single biggest omission — the door lottery is what decides whether a plan is a walk or a
   dig, and it is completely invisible in §6's plans. Two identical-looking plans play totally
   differently.
3. 🎯 **The zero-dig pocket, shaded** — everything reachable from spawn through open doors alone.
   It is 18.2% of the floor on average and it is the answer to John's own question. He should be
   able to *see* that the corridors did not give the house away.
4. **Spawn and exit marked, with the dig-distance between them printed.** The min-walk gate fails
   34.6% and 6.6% are walk-outs; John cannot rule on §8 without seeing what a 0-dig plan looks like.
5. 🚨 **Per-edge span layout drawn on the wall** — `planSpanLayout` already returns the offsets, so
   this is nearly free — **plus the spans-per-edge count labelled on each boundary.** This is what
   makes §2 visible: a 35 m wall with 6 spans and one interconnect behind it should look alarming.
6. **Corridor widths labelled, and alcoves distinguished from corridors.** A 1.9 m passage and a
   24 m paddock are both lowercase letters today (seed 4's `a`), and they are not the same space.
7. **Depth and loop count printed per plan** (§3), not just the diggable percentage — because the
   diggable percentage is exactly the number that ranks the two worst houses highest.
8. **A contact sheet — 20–30 plans at once.** The flat-plan failure is only visible across a
   sample; one plan at a time is how it got missed.
9. 🎯 **A good / bad button per seed, writing to a labels file.** The fix for flat plans is a
   scoring term, and **nobody has John's labels.** A tuning term fitted to a critic's taste is a
   guess; fitted to his, it is the thing he asked for. This is the highest-value feature in the
   list and it is the cheapest.

---

## What I could not know, restated

- **Nothing is rendered and nothing is played.** Every "this will feel" above is flagged as such.
- **Whether an unlit 1.9 m corridor is frightening or tedious.** The graph says crossing one costs
  the player; only play says how it costs them.
- **Whether the dig band survives** (§2) — direction is genuinely ambiguous from geometry.
- **Draw calls on a generated plan.** Untouched since `genspike-1` said the same.
- **Whether five footprints exhaust in ten runs.** A reasoned estimate, not a measurement.
- **Seeds 0–9 are the sample I looked at by eye**, plus 512 measured mechanically. My "good plan"
  criteria in §5 are my taste, stated so John can reject them.
