# SEALED — blind A/B key for progress/shots/loco-ab4/

⛔ **CRITICS MUST NOT OPEN THIS FILE.** It exists so the session lead can decode a blind
judgement AFTER it has been filed. Opening it before judging destroys the only independent
signal the project has. If you are a critic and you are reading this line, stop, and say so
in your report.

Round 4 sheets (`progress/shots/loco-ab4/`). The assignment is deliberately different from
round 3's on **all three** gaits, so a critic who has seen a decode cannot carry a pattern
across:

| gait | variant A | variant B |
|---|---|---|
| walk | plant **ON** | plant OFF |
| run  | plant OFF | plant **ON** |
| limp | plant **ON** | plant OFF |

Verified genuinely different before sealing (`harness/evidence/_tmp_critic_diff.mjs`), because round 1's
limp pair was two copies of the same build:

| gait | differing pixels | sumAbsDiff | × the noise floor |
|---|---|---|---|
| walk | 7.48% | 18.77 M | 14.4× |
| run | 8.45% | 22.74 M | 17.5× |
| limp | 3.36% | 9.92 M | 7.6× |

The instrument's own noise floor is unchanged and still larger than anyone assumed: two shoots
of the SAME strobe config differ in **4.71% of pixels / sumAbsDiff 1.3 M**, all of it `AO_FRAG`'s
per-frame dither. **Percentages below that are meaningless — read sumAbsDiff.** Limp's 3.36% is
below the floor by COUNT while being 7.6× above it by MAGNITUDE, exactly as in round 3.

---

## ⚠ ROUND 3'S DECODE WAS PARTLY WRONG, AND THE LEAD SHOULD READ THIS BEFORE DECODING ROUND 4

Round 3 (`loco-ab3`, key `loco-ab3-key.md`): walk A=OFF/B=**ON** · run A=**ON**/B=OFF ·
limp A=OFF/B=**ON**. Its decode was handed to round 6 as "walk and run won for plant-ON, limp
was a high-confidence win for plant-OFF, and the critic's report contradicts itself". Round 6
re-measured every claim against the actual sheet pixels and against headless ground truth
(`harness/footskate.mjs`'s new `floorProfile`, and the mesh-vertex probe it is built from).
**The sheets were fine, the key was fine, and the critic saw real things. Three separate errors
were stacked on top of each other:**

**1. The critic's #1 and #2 ranked defects both describe the variant we DO NOT SHIP.**
Measured on the round-3 sheets, the lowest visible figure pixel per panel, converted to world
millimetres and cross-checked against headless truth:

| | run-variantA (**plant ON**) | run-variantB (plant OFF) |
|---|---|---|
| panel 1 (phase 0.000) | −0.7 mm, planted | **+143.8 mm, BOTH feet clear** |
| panel 4 (phase 0.500) | −0.7 mm, planted | **+143.8 mm, BOTH feet clear** |

The critic's "big ungrounded flying split ... at 2 of 6 strobe frames" is **plant-OFF's run**,
and it preferred plant-ON's "clean planted heel + recovering swing leg". Same for walk's #2
"flatter and more block-like" — plant-OFF's push-off foot has toe 134.8 mm AND heel 259.1 mm
both in the air (the foot leaving as a rigid block), against plant-ON's toe 52.2 / heel 157.2
with the sole tip still touching at 2.4 mm. **Neither #1 nor #2 is an outstanding defect in the
shipped gait.** Nothing was changed in walk or run this round, and that is why.

**2. The critic's RUN phase labels are off by one panel — the strobe's mapping is 0-based.**
`char-locomotion.js` builds `phase: i / n` for `i = 0..5` and lays station `i` at
`x = (i − 2.5) × 1.28`, so **left-to-right the six panels are phases 0, 1/6, 2/6, 3/6, 4/6, 5/6
— the FIRST panel is phase 0, not 1/6.** The run float is at panels 1 and 4, i.e. phases
**0.000 and 0.500**; the critic reported it at "~0.17, ~0.67", which is panel index 1 and 4 fed
through `k/6` as if 1-based. Its limp numbers use the mapping correctly ("frame-4 (phase 4/6)"
= the fifth panel), because those it measured numerically rather than counting panels. Worth
knowing when reading any panel-position claim on these sheets.

**3. The limp result is REAL, it is not a contradiction, and it is measurement (d): a genuine
flight-phase float at a phase nobody had ever measured.** Lowest point of the whole rig at the
six strobe phases, in mm above the floor:

| panel | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| limp plant **ON** | +4.4 | −5.0 | −0.8 | −0.6 | **+0.6** | **+101.3** |
| limp plant OFF | −58.3 | −135.3 | −119.3 | −108.2 | −53.6 | +6.5 |

So the critic was right twice over and the "backwards" reading in the round-6 brief is wrong:
at phase 5/6 the **planted** limp really is 101 mm clear of the ground while the unplanted one
sits at 6.5 mm. That is a HOP — `SCHEDULE.limp.duty` is 0.66, so 34% of the cycle is airborne,
and panel 6 lands within 1% of the swing apex. It is correct, and it is the only thing on the
whole limp board that visibly crosses the drawn floor line, so it read as the only fault
present. Meanwhile the unplanted limp is 54–135 mm INSIDE the floor at five of six frames and
photographed as "connected" at every one, because an opaque pad **clips** a buried foot and
leaves its lowest visible pixel within a couple of pixels of a correctly planted one.

Round 3's key predicted the opposite ("the floor exposes the unplanted gait's penetration ...
part of that may be the floor exposing a defect the plant already fixed"). **That is true of RUN
and false of walk and limp.** plant-OFF does not simply sink: it sinks in walk and limp and it
FLIES in run, because it has no relationship to the floor at all.

---

## What changed between round 3's sheets and these

**No gait constant moved. `PLANT` is byte-identical to round 3** — the limp's flight is correct
for a hop and tuning it away to win a still frame would be faking the gait for the instrument.
`--gate` G2/G3/G4 reproduce round 3's numbers exactly (roll 20°, ×7.7, ×1.10).

**The STAGING changed in one way, and it cuts against the pad's previous bias rather than for
either gait.** `groundPad()` now draws a **contact datum**: one more lateral rule, the same
object as the others, placed at the stations' own z (0.55). Reason, measured through this
camera: the line a critic reads as "the floor" is the pad's BACK EDGE at z = −0.11, and the
figures stand 0.66 m in front of it, so **a foot has to be 73.5 mm off the ground before it
reaches the drawn line.** Everything between −73 mm and +73 mm read as "on the floor" whatever
it was doing. The datum renders at y = 696 against a predicted true-ground y = 697.1 — within
one pixel. Residual error is now ±28 mm worst case, from the feet wandering ±0.2 m in z through
the cycle, against ±73.5 mm before.

**A transparent pad was tried first and is REFUTED, not merely rejected.** The idea was to let a
buried boot show through. It cannot work here: the surface behind the pad is the cyc's own floor
at luma ~242 and the boot is white shell at ~230 — twelve units apart, so no opacity separates
them, and compensating the pad's tone for the transmission cancels what little signal there is.
Measured at opacity 0.55, four times the intended transmission and far past anything that still
looks like a floor, the 135 mm-buried boot at limp panel 2 is **still invisible** while the pad
has washed out to near-cyc. Reverted; the pad is fully opaque exactly as in round 3.

⚠ **So this instrument still under-reports PENETRATION and reports FLOAT at full strength**, and
a decode should weigh that. It is now bounded rather than hidden: `footskate.mjs --gate` G6
measures the real mesh against the real floor headlessly, where the camera cannot hide anything.

**Also landed, and visible to a critic only as an absence:** the plant contract (`PLANT_FAULTS`
in `locomotion.js`, G5 in the gate). It has no pixels.
