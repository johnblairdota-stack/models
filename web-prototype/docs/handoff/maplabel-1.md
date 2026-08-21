# maplabel-1 — the cyan defect, John's 40 labels, and whether a plan critic is worth building

**Owned:** `tools/mapdesigner/app.js`, `tools/mapdesigner/index.html`, `MAPS.bat`, and three new
instruments `harness/_maplabel1-{cyan,labels,score}.mjs`. **Nothing in `src/`, nothing in
`harness/genspike.mjs`, nothing in `HANDOFF.md`.**

```
node harness/evidence/_maplabel1-cyan.mjs     ->  5/5, the fix is on the screen (boots its own server, 5182)
node harness/evidence/_maplabel1-labels.mjs   ->  6/6, what the 40 verdicts separate on
node harness/evidence/_maplabel1-score.mjs    ->  5/5, the generator's own score against those verdicts
```

---

## 1. The cyan defect — confirmed, and it was worse than "confusing"

**John was right, the brief's diagnosis was right, and here is the defect as a number: the
interconnect's old `#7ef4ff` sat 1° in hue from the hard stop's `#3fd0e0`.** One colour, three
referents, and the tool's own legend admitted the collision out loud.

| the mark | what it meant | drawn |
|---|---|---|
| `C.nodig` `#3fd0e0` | a boundary too short to dig — **you cannot get through here at all** | `app.js` (was 368) |
| `C.ic` `#7ef4ff` | the interconnect — **the ONE place a dig gets you through** | five lines later, same loop |
| the prose | the game's indestructible barrier *behind* the orange | **not drawn on the plan at all** |

The legend then said *"Same colour as the barrier above because it is the same answer — you are not
getting through"* — true of the first, **exactly false of the second**, three sentences after
calling the interconnect the one way through. That sentence is deleted.

### What changed

- **The interconnect is now LIME `#b6ff2e` and is called THE SOFT SPOT.** The palette comment's
  reasoning survives untouched and is the reason for the choice: orange = the coat you break, cyan
  = a hard stop, and the interconnect **is neither**, so it may be neither colour.
- **Why 81°.** It is the only free band on this plan. Orange 25° · amber 40° · exit green 141° ·
  cyan 187° · slab violet 254° · route violet 275° · magenta 313° · red 0°. Measured separations
  from every mark that can appear **on a wall**: cyan 105°, open-door green 56°, breachable amber
  43° (the tightest), dig orange 52°, chained red 81°. It leans *yellow* rather than green on
  purpose, because a green open-door gap is the mark most likely to sit beside it. The existing
  silhouette cue is kept — the soft spot stands 1.5× proud of the wall band, the cyan hard-stop bar
  is flush — so the two now differ in hue **and** in outline.
- **Cyan means one thing.** Legend rewritten; `--nodig` and a new `--ic` CSS var carry the rule.
- **The undrawn barrier is now stated as undrawn**, in the orange row of the legend, in the
  explainer, and in `MAPS.bat`. That is what killed the third referent: John was told "the cyan is
  behind the orange" and then shown a cyan mark *on* the orange meaning the opposite.
- **`MAPS.bat`'s answer text is corrected** — it repeated the wrong explanation before he opened
  the page. Rendered and checked (batch `echo` is fussy; it prints clean).

### The control that must fail

`_maplabel1-cyan.mjs` counts **real canvas pixels** through `getImageData` on a real page over six
seeds — it does not read the source back.

- **A1** `#7ef4ff` is extinct: **0 pixels** over 6 seeds.
- **A2** the soft spot is drawn and is a *mark*, not a fill: 1561–3221 px, **0.157–0.324% of
  canvas**, on 15–28 diggable walls per plan.
- **A3 🚨 the control** — untick the `ic` layer through the tool's own toggle and redraw: lime goes
  **→ 0 on every seed** and the cyan hard-stop count is **unmoved** (56→56, 64→64, 138→138). If
  lime had not gone, A2 could not see the thing it asserts; if cyan had moved, the two marks would
  still be coupled.
- **A4** hue separation, gated at 40° for wall marks.

⚠️ **A4's first draft was itself a false-positive gate and that is worth one line**, because it is
the failure HANDOFF names. It was written as *"not the same colour as anything else"* and went red
on **spawn yellow at 36°** — a labelled 5 px pip at a room centre and a 13%-alpha area wash, which
nobody can mistake for a bar on a wall. **The fix was to make the gate's scope match its claim, not
to lower its threshold.** Spawn yellow is now reported, not gated.

### Reported, not fixed — one thing I think is still misleading

**The plan draws the *gap* in the barrier without ever drawing the barrier.** A truthful drawing
would put a thin cyan back-layer along every diggable wall with a 1.55 m break in it at the soft
spot, which is literally what the wall is. That is a redesign, it is John's call, and the brief said
not to do it unasked. The current fix removes the *contradiction*; it does not make the barrier
visible. If he asks "so where IS the brick", that is the answer to build.

---

## 2. A defect in the label writer, found by the analysis

🐞 **`pushLabel()` was dropping `storey` and `char` from every recorded room, and a hand-edited row
therefore could not be rebuilt.** `planFromRooms` does `y1: r.storey`; with it missing the y-range
went `undefined`, every dig-band overlap test went NaN, and the reconstructed plan had **zero
diggable edges** — `digsToExit −1`, all 7 rooms dead ends, while `sharedM` matched to 2 dp so the
geometry looked fine. It only ever bit hand-edited rows (a seeded row rebuilds from its seed), which
is exactly why it went unnoticed **and** why the one row the brief asked me to treat separately was
the one that could not be analysed.

Fixed in `app.js` for every future row; the round trip is verified identical on 5 seeds with a
strip-`storey` control that breaks it. Row 88889 is already on disk without them and is repaired at
read time from `LIBRARY`, not by rewriting John's data file — with `storey`/`char` restored it
reproduces its recorded feature vector **exactly**, which is what proves the diagnosis.

---

## 3. What the 40 labels actually say

`n = 40` — **16 good / 12 meh / 12 bad**, one sitting of **12 minutes**, median **18.5 s per plan**,
all on the shipping dials, no notes written. 39 generated + 1 hand-edited (held out of every
headline). **All 40 rows reproduce their recorded features from the seed**, so `genspike.mjs`
changing on the labelling day did not move the plans he judged.

⚠️ **Two corrections to the brief.** The features vector is **28 fields, not 30**. And of the 16
GOOD, one is the hand-edited row, so the generated good/bad contrast is **15 vs 12, n = 27** —
which is the number every statistic below is really standing on.

### The result: he is labelling the ROUTE, and nothing else clears the null

Statistic is AUC — P(a random GOOD ranks above a random BAD), chance 0.50 — with a **family-wise
shuffle** over all 28 features (20,000 shuffles, the MAX statistic, because one per-feature p < 0.05
out of 28 is expected by chance).

| feature | AUC | p | good | meh | bad |
|---|---:|---:|---:|---:|---:|
| **`hopsToExit`** — regions crossed, spawn → exit | **0.831** | **0.001** | 3.07 | 2.17 | 2.00 |
| `digsToExit` — walls to break on that route | 0.783 | 0.006 | 2.27 | 1.25 | 1.33 |
| `longestSightline` | 0.308 | 0.088 | 29.6 | 31.3 | 33.3 |
| *(planted null: a seeded rng draw)* | *0.650* | *0.199* | | | |
| **`depth`** — the flat-plan detector | **0.383** | 0.245 | 2.60 | 2.17 | 2.83 |
| `depthMean` | 0.469 | 0.801 | 2.06 | 1.85 | 2.03 |
| `zeroDigPocketFrac` | 0.461 | 0.756 | 0.199 | 0.267 | 0.190 |
| `sliverEdges` | 0.500 | 1.000 | 0.73 | 0.92 | 0.67 |
| `fracInternalDiggable` — **the spike's headline** | 0.486 | 0.910 | 0.920 | 0.923 | 0.900 |
| `nVoids` | 0.450 | 0.648 | 0.73 | 0.67 | 0.92 |
| `corridorNetworks` | 0.525 | 0.832 | 2.60 | 2.67 | 2.50 |

**`hopsToExit` is the only feature that clears the family-wise null: family-wise p = 0.0427,
against a shuffled MAX of median 0.233 / p95 0.325 in |AUC − 0.5|.** It clears by 0.006. Jackknife:
dropping any one of the 39 rows moves it to **[0.815, 0.891]**, so it is not one row. It is not
envelope size in disguise — Spearman against `nRooms` 0.005, `nCorridors` 0.010, `sharedM` −0.011,
`depth` −0.030.

The raw table is the clearest statement of it:

```
hopsToExit    1    2    3    4    5          digsToExit   0   1   2   3   4
good          0    4    8    3    1          good         0   3   6   6   1
meh           3    7    0    1    1          meh          1   7   4   0   0
bad           2    9    0    1    0          bad          1   6   5   0   0
```

**Every plan he called GOOD that crosses 3+ regions: 12 of 16. Plans he called BAD that do: 1 of
12.** And `digsToExit ≥ 3` is **6 GOOD, 0 MEH, 0 BAD** — perfect precision, low recall.

🎯 **The three planted nulls all behaved.** A seeded rng draw p = 0.199, the seed number p = 0.613,
and **his position in the session p = 0.613 — so his standard did not drift over the twelve
minutes**, which is a real fact about the labels and not just a control.

### 🚨 The 42.4%-flat claim: tested, and his labels do not support it

`house-packing.md` §7.1 and `critique-corridor-house.md` §3 say flat plans are **the worst failure
mode**. That was asserted before any labels existed. Now there are labels.

- **`depth` AUC 0.383, p = 0.245 — non-significant, and pointing the wrong way.** His GOOD plans
  average depth **2.60**; his BAD plans **2.83**. `depthMean` is dead-on chance at 0.469.
- **The gate `depth ≤ 2` flags 6 of his 16 GOOD plans and only 2 of his 12 BAD ones.** By this
  project's own rule — *a false positive in a gate is worse than the bug it was written for* — that
  disqualifies it as a gate, and as a ranking term it points backwards on this sample.

⚠️ **This does not mean depth is measuring nothing.** The `depth` table is plainly non-monotonic:

```
depth    2    3
good     6   10
meh     10    2
bad      2   10
```

**Flat plans land in MEH, not BAD.** P(meh | depth 2) = 10/18 = 56% against P(meh | depth 3) =
2/22 = 9%. On the MEH-vs-rest contrast `depth` is the top feature at AUC 0.231, per-feature
p = 0.005 — **but family-wise p = 0.115, so it does NOT clear its null and I am not claiming it.**
It is the most promising hypothesis in this data set and it needs its own labels.

If that holds up, the flat-plan story is **wrong about the failure, right about the phenomenon**:
flat is not "the worst house", it is "the forgettable house", and the fix is a different scoring
term with a different justification.

**Nothing here refutes the 42.4% rate itself** — that is a geometry count and I did not re-measure
it. What is refuted is the *inference* that a flat plan is the worst plan **to John**.

### The hand-edited row — and it is the most interesting single row in the file

Seed 88889, `handEdited: true`, verdict **GOOD**. Including it moves `hopsToExit` 0.831 → 0.836 and
`digsToExit` 0.783 → 0.797. **It changes no conclusion.**

But look at what he built:

- `hopsToExit` **3**, `digsToExit` **3** — the top of his own range. Consistent with everything above.
- `fracInternalDiggable` **0.696**. The 39 generated plans run **0.732 – 1.000**, median 0.937.
  **His own house is worse than every single generated plan on the metric the entire spike exists to
  maximise, and he called it good.**
- `nVoids` **3**, tying the worst in the set. Voids are "a failure, and it is counted".

⚠️ **There is no placement score for it** and there cannot be — `placeRooms()` never ran on his
rectangles. `_maplabel1-score.mjs` scores its *seed* and says so rather than inventing one.

### What the sample can and cannot support

**Can:** one pre-registered, one-dimensional claim — *plans whose spawn→exit route crosses more
regions are the ones he likes*. It clears a family-wise shuffle at n = 27, and it survives a
jackknife.

**Cannot:** anything else in the table. Twenty-six of 28 features are indistinguishable from a
planted rng column. It cannot support a multi-term scoring function, a threshold, a gate, or any
claim about `meh`. **The multiplicity cost is the whole story: at n = 27, ONE pre-registered
feature needs AUC > 0.719; letting a critic pick the best of 28 raises the bar to 0.825. The
observed 0.831 clears it by 0.006.**

🚨 **And the strongest caveat is not statistical.** `hopsToExit` and `digsToExit` are **the two
numbers the tool prints in the largest type on the right-hand panel** ("walls to break, spawn →
exit" / "regions crossed"), and the route is **the most conspicuous overlay on the plan** — a violet
dashed line with a box round every wall it breaks. At 18.5 s per plan, "he has taste for routes" and
"he read the route off the drawing" are **the same data**. He said it himself: *"I can't be sure of
my results… I don't know what a good one looks like."* The experiment that separates them is in §5.

---

## 4. Does the generator's own placement score agree with him? **No — and it leans the wrong way**

`genspike.mjs` `placeRooms()` picks each room by `score = contact + via − λ·waste + snapped·6·align
+ rng()·1.5` and takes the argmax. Nothing exports it, so `_maplabel1-score.mjs` **reads it out of
the generator** rather than recomputing it: it patches two lines into a temp copy of the real file
to record `best.score` and its terms, changing no arithmetic.

- **C1** the patched copy produces `toJSON(buildPlan(seed))` **byte-identical on 40/40 plans**.
- **C2 🚨 the control that must fail** — the same file plus **one extra `rng()` draw** makes
  **40/40 plans differ**. C1 can see a behaviour change, so its green means something.

| term | AUC(good > bad) | p | good | meh | bad |
|---|---:|---:|---:|---:|---:|
| **total score** | **0.41** | 0.46 | 189.3 | 195.1 | **196.2** |
| score per placement | 0.53 | 0.81 | 32.6 | 33.3 | 32.7 |
| `contact` (clear shared metres won) | **0.38** | 0.32 | 23.9 | 23.4 | **27.4** |
| `via` (the set-back/corridor term) | 0.47 | 0.78 | 168.8 | 177.0 | 174.4 |
| waste penalty | 0.35 | 0.20 | 21.8 | 23.8 | 24.5 |
| align bonus | 0.53 | 0.78 | 12.2 | 12.1 | 12.1 |
| **`rng()·1.5` — the built-in null** | 0.33 | 0.16 | 6.19 | 6.45 | 6.92 |

**The answer to the brief's question is: it does not agree with him, it very slightly ranks his BAD
plans above his GOOD ones, and none of it is significant.** Total score AUC 0.41, contact 0.38 —
his BAD plans won **14% more contact metres** than his GOOD ones (27.4 vs 23.9).

🎯 **The honest reading is the built-in null.** The score's own `rng()` term — a seeded draw that
*cannot* know anything about taste — scores **AUC 0.33, the largest deviation of any term in the
table.** That is what "no signal" looks like at n = 27, and it is why I am reporting the inversion
as *not agreeing* rather than as *disagreeing*. The score is **orthogonal to his eye**, not opposed
to it.

Two facts that fall out and are worth keeping:

- **The score is 89% `via`** (168.8 of 189.3). The greedy packer is overwhelmingly buying corridor
  set-back, not room-to-room contact. `house-packing.md` §5a is right that corridors are the
  cheapest way to buy shared wall; this shows the *scoring function* has already gone all-in on it.
- **`fracInternalDiggable` — the headline the whole spike optimises — is AUC 0.486 against his
  verdicts, i.e. exactly chance.** Together with the hand-edited row scoring 0.696 and being called
  good, that is the same finding from two directions: **the number the generator maximises is not
  the number he is judging.**

---

## 5. Should we run a critic to get better generations?

**Yes, but not the one that was proposed, and not yet.** A critic that ranks 512 houses so his eye
does not have to see them all is the right shape. The thing that makes it trustworthy is that it
agrees with the 40 plans he has already judged — and **at n = 27 in the good/bad contrast, that
validation supports exactly one degree of freedom.** A learned ranker over 28 features cannot be
validated here; it would be fitted to a sample where a planted rng column reaches AUC 0.65.

### What I would build, in order

**Step 0 — first, and it is cheap: settle whether he is judging the house or the overlay.**
40 fresh seeds with the route hidden. **✅ BUILT — see §6, and the pre-registration is §7.** If
`hopsToExit` collapses to chance with the line gone, the finding in §3 is *"he reads the number the
tool prints"* and every line of critic built on it would be fitting the instrument. **It is worth
more than the critic.** Nothing else should be built first.

**Step 1 — a one-term critic, pre-registered, not searched.** `rank = hopsToExit` (ties broken by
`digsToExit`). One parameter, chosen *before* seeing the next batch, which is what makes it
testable. Ship it as a **re-roll**, not a gate: generate 3 candidate plans per seed and keep the
one with the longest route. This needs no change to `placeRooms` and does not disturb any measured
figure in `house-packing.md`.

**Step 2 — only if step 1 validates: an aspect/anchor term for the flat plans**, targeting the MEH
pile rather than the BAD pile, per §3.

### 🚨 The control that must fail — this is the design, not an add-on

**A critic that scores well against John's labels must score at CHANCE against those same labels
SHUFFLED, and that arm runs on every run, not once.**

Concretely, and it is already implemented in `_maplabel1-labels.mjs` §N2 so it does not have to be
invented: the critic's ranking statistic is recomputed against **20,000 shuffles of the verdict
column**, preserving the good/meh/bad counts. Three things must all hold:

1. **The real statistic clears the shuffled null**, family-wise if the critic was allowed to choose
   its feature, per-feature if it was pre-registered. Report **which**, because the bar moves from
   AUC 0.719 to 0.825 between them.
2. **The shuffled distribution is centred on chance.** A shuffled mean that is not ≈ 0.50 means the
   pipeline is leaking labels — the exact failure the sixteen instrument incidents share.
3. **A planted null column is carried through the whole critic**, scored alongside the real
   features every run. If a seeded rng draw ever ranks in the critic's top features, the critic is
   fitting noise and its output is void. Right now that null reaches **AUC 0.65**, which is the
   sharpest available statement of how little n = 27 can carry.

**If a critic scores well on the real labels and also well on the shuffled ones, it has measured
nothing** — and because it would still emit a ranked list of houses, it would be exactly the
result-shaped-output-instead-of-an-error failure this project has hit sixteen times.

### What it would cost — measured, not guessed

Bootstrap power on `hopsToExit` at the observed effect, one pre-registered feature, one-tailed
α = 0.05, at his own 15:12:12 mix:

| fresh labels | good/bad | critical AUC | power |
|---:|---:|---:|---:|
| 27 | 10/8 | 0.719 | 89% |
| **40** | 15/12 | 0.681 | **96%** |
| 60 | 23/18 | 0.638 | 100% |
| 120 | 46/37 | 0.595 | 100% |

**Forty more labels — twelve more minutes of his time — takes the pre-registered claim to 96%
power.** That is the whole cost of the confirmation, and it is the same forty that would run the
route-hidden arm in step 0. Do both in one sitting: **40 seeds with the route overlay off.** It
answers the confound and the confirmation with one batch.

⚠️ It bootstraps the observed distribution, so it inherits every bias in these 40 rows. It says how
fast a real effect of this size would be confirmed; it does not say the effect is taste.

---

## 6. The route-hidden arm — built, and it is one key

**`H`, or the `route: shown / HIDDEN` button in the header, or `?arm=blind`.** The toggle **reloads**
with the parameter (carrying the seed) rather than redrawing, so the arm is always exactly what the
URL says and cannot drift mid-session into a state the label rows do not record.

**On screen he cannot miss it:** a violet `ROUTE HIDDEN` bar across the top of the plan the whole
time, the header button highlighted and reading `route: HIDDEN`, the hint line changed to `H show
the route again`, and — where his eye actually is when he decides — **a violet chip directly under
the GOOD/MEH/BAD buttons reading `arm: ROUTE HIDDEN — N rows recorded in this arm`.**

**What it hides** — everything that *states* the walk, found by auditing the whole page, not just
the two things §5 named:

| hidden | why it is the same number |
|---|---|
| `drawRoute()` — the dashed line and the box on every wall it breaks | it is the answer, drawn |
| the whole **ROUTE block** of DIFFICULTY | `routeDigs`/`routeRegions` **are** `digsToExit`/`hopsToExit`; `farthest*` and `meanDigsFromSpawn` are the same walk from the same spawn |
| that block's `a run cannot be won in 8 s` verdict | it is literally `digs ≥ 2 \|\| hops ≥ 3` rendered as a word |
| the gap-0 table's `digs, spawn → exit` row | prints `digsToExit` twice over |
| the pocket panel's `can you walk to the way out?` | it is `digsToExit === 0` as a yes/no |
| the legend's route row | a legend entry for an undrawn mark still says the mark exists |
| **the `route` checkbox itself — removed, not unticked** | an unticked box he can click is not an arm |

The SLAB arm was checked and leaks nothing (it prints walls, faces, seams, longest wall). The
ROUTE block is replaced by a line saying it is hidden rather than silently vanishing — a panel that
quietly loses rows is how someone later concludes the tool is broken.

⚠️ **What deliberately stays, because removing it would test a different question:** the SPAWN and
EXIT pips, the yellow zero-dig pocket, and the plan itself. **If his eye still counts the rooms
between the two pips, that is the taste hypothesis and it is what we want to measure** — the
confound is reading a printed number, not seeing the house. The SHAPE block's `rank depth` also
stays; it is the FLAT hypothesis, a different question, and stripping it would confound the two arms.

### Tagging: `arm: 'route-shown' | 'route-hidden'`, and the existing 40 are not migrated

Every row from now on carries `arm`. **The original 40 carry no `arm` field at all — tagged by
absence, deliberately, so John's data file is never rewritten.** Read it as
`row.arm ?? 'route-shown'`, which is what they were.

### The control that must fail — `node harness/evidence/_maplabel1-arm.mjs`, 7/7

**Every check has an arm that must fail, because "the route is hidden" and "the page is broken"
would otherwise look the same.**

- **B1** route pixels `#c98cff`: **684 / 650 / 533 / 523 / 436 / 435 → 0 on all six seeds.** The
  non-zero half *is* the control — a shown arm reading zero would mean B1 cannot see the thing it
  asserts.
- **B2** ⚠️ **this assertion was wrong on its first run and the arm was right.** It first demanded
  *identical* mark counts and went red — dig orange 14953 → 15055, lime 2146 → 2174. **The route is
  stroked over the walls, so hiding it uncovers pixels.** Rewritten to the stronger and correct
  claim: no mark may lose a single pixel, and total gained must not exceed the route's own
  footprint. **+130 / +80 / +67 / +41 / +36 / +9 px uncovered against 684 / 650 / 533 / 523 / 436 /
  435 px of route. Nothing lost, across 6 colours × 6 seeds.**
- **B3** all **8** leak phrases present in the shown arm (the must-fail half — a phrase that never
  appears cannot prove it was hidden) and absent in the hidden one, on every seed.
- **B4** the route toggle is present when shown and **removed** when hidden; banner on; button text
  flips.
- **B5** a row POSTed in each arm reads back `arm: "route-shown"` / `"route-hidden"`.
- **B5b** ⚠️ B5 writes to the **real** `labels.jsonl`, because a round trip through a mock proves
  nothing. It snapshots, appends two probe rows, reads back, restores the original bytes and
  **asserts the restore by SHA-256: unchanged, 40 rows, 40 still untagged.** Verified externally
  too — the file's md5 is identical before and after the run.

---

## 7. 🚨 PRE-REGISTRATION — written 2026-08-11, before any route-hidden label exists

**This is fixed now and must not be edited after data arrives.** At the moment of writing,
`labels.jsonl` holds **40 rows, all of them untagged, i.e. all route-shown** — asserted by
`_maplabel1-arm.mjs` B5b on this tree. **Zero route-hidden rows exist.**

**Primary hypothesis (confirmatory, one only).** In the route-hidden arm, John's GOOD plans have a
longer spawn→exit walk than his BAD plans.

| | |
|---|---|
| **feature** | `features.hopsToExit`, exactly as the label row records it — **not re-derived** |
| **population** | fresh seeds, none of `27932`–`27970` or `88889`; shipping dials; `handEdited: false`; `arm: 'route-hidden'` |
| **target n** | **40 rows.** Analyse at 40; do not peek and stop early |
| **contrast** | GOOD vs BAD only. MEH is excluded from the primary |
| **statistic** | AUC = P(a random GOOD ranks above a random BAD), ties 0.5 |
| **test** | **one-tailed**, direction pre-specified as GOOD > BAD; permutation null, 20,000 shuffles of the verdict column at the realised good/bad counts; α = 0.05 |
| **critical value** | the permutation critical AUC at the realised counts. **At 15/12 that is 0.681; at 10/8 it is 0.719.** Use the realised one, computed by the same code |
| **bar** | **the per-feature bar (0.719 at n = 27), because this feature is pre-registered.** Any *other* feature reported off this batch must clear the **best-of-28 family bar, 0.825** |
| **reference** | route-shown arm, n = 27: **AUC 0.831**, family-wise p = 0.0427 |

**What each outcome means, decided now:**

- **AUC ≥ critical.** Confirmed. The route preference survives with the line gone, so it is his eye
  and not the drawing. **Build Step 1** — the one-term re-roll ranker on `hopsToExit`.
- **AUC < critical but ≥ 0.60.** Inconclusive. The effect may be real and smaller. **Do not build
  the critic**; the power table says another 20–40 labels decides it, and that is the cheap move.
- **AUC ≈ 0.50 (below critical, and the shown-vs-hidden difference is itself significant on a
  two-sample permutation test).** **The §3 finding is an artefact of the instrument.** John was
  reading the number the tool printed. `hopsToExit` is struck as a scoring term, §3's headline is
  retracted in this file, and the critic is not built on it.
- **AUC significantly BELOW 0.50.** Not predicted. Treat as a defect in the arm or the tagging and
  re-run `_maplabel1-arm.mjs` before interpreting anything.

**Everything else is exploratory and must be labelled as such**, including the `depth`/MEH
hypothesis from §3 — which is *not* pre-registered here, because it did not clear its own
family-wise null (p = 0.115) and pre-registering it would be dressing a hunch as a prediction.
Report exploratory results against the family bar, with the planted nulls printed beside them.

**Controls that run on the batch, not optionally:** the three planted null columns (a seeded rng
draw, position in the session, the seed number) and the family-wise shuffle, all already in
`_maplabel1-labels.mjs`; plus a tag-integrity check that every new row carries
`arm: 'route-hidden'` and no old row was rewritten. **A critic that scores well on the real labels
and also well on the shuffled ones has measured nothing.**

---

## 8. Corrections to what I was told

- **The features vector is 28 fields, not 30.**
- **The generated good/bad contrast is 15 vs 12, not 16 vs 12** — one of the 16 GOOD rows is the
  hand-edited one.
- **The brief's diagnosis of the cyan defect was correct in every particular**, including which
  line each colour was drawn on and which legend sentence was false. Verified rather than trusted.
- **`house-packing.md` §7.1's *rate* (42.4% flat) is not challenged here** — I did not re-measure
  it. Its *inference*, that flat is the worst failure, is not supported by these labels and the
  gate built from it would flag 6 of his 16 GOOD plans.
