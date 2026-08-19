# UNIT-4H player — material and crease spec

**Source: John, 2026-08-15, given as art direction after seeing the two-tone build.** This is the
authority for which material goes where on the player. It supersedes any region guessed at by a
builder or a critic from a metric.

> ⚠️ **A previous round darkened the arms, forearms, hands, neck and abdomen from measured
> statistics and John's reaction was that the split is in the wrong places.** Numbers can say
> "this region is dark in the art"; only this document says *which material* and *why*. Where a
> measurement and this file disagree, this file wins.

---

## The three materials

| name | where it reads |
|---|---|
| **white** | plates — chest, forearms, hands, thighs, shins, feet, head shell |
| **chrome** | structure — waist, upper arm, joints, actuators, spine ridges |
| **teal / mint** | shoulder caps only |

Plus **dark creases** — not a material so much as a treatment: the recessed gap between parts.

---

## Head and neck

- Back of the head, where it meets the neck: **chrome panel with ventilation**.
- **Ear is a RING, not a plate.** Chrome ring; the inner circle is a **white disc**.
  - ✅ **BUILT AND SEEN, 2026-08-16.** This entry read "currently built as a solid chrome disc
    with a dark torus — wrong shape", and that status note was stale: the kit rebuilt it and no
    one had ever shot it, because `Alert` turns the head away. Photographed at `?azim=-90` it is
    a chrome ring with a lighter disc centre, which is this line. The DIRECTION above is
    unchanged and remains the authority; only the builder's status note was wrong.

## Torso

- **Chrome accent** around where the shoulder and neck attach.
- **Waist is chrome**, and it **wraps around to the small of the back**.
- The back's waist chrome has **ridges** — they exist to allow flexion and extension of the spine.
- Chest plate stays white and carries the 4Humanity wordmark.

## Shoulders

- **Shoulder caps are COMPLETELY teal.**
  - ⚠️ **CORRECTED 2026-08-16.** This entry first read "the top and back are NOT teal", the swing
    window was narrowed to `0..105 deg` to match, and John's verdict on seeing it was: *"Both the
    shoulder cap should be completely teal but they only show as teal from the front."* The cap
    was never partly a different material — it only READ that way, because the top and back of a
    domed cap turn away from the key light and lose their colour. **The fix is lighting/response,
    not coverage.** Restore full coverage and make the teal survive at grazing angles.
  - A builder had already measured that the art's BACK elevation plainly carries a teal wedge, so
    the art and this correction agree; the original spec line was the outlier.
- A **white round fixture** on both the **back and front** of the shoulder caps.
- Where the arm detaches at the shoulder: **much darker in the crease of the parts**.

## Arms

- **Upper arm is CHROME, front and back.**
  - ⚠️ Currently dark grey. Wrong material.
- **Forearms are WHITE.**
  - ⚠️ Currently dark grey. Wrong material — this is the most visible error.
- **Hands are WHITE** — each finger, the palm, and the back of the hand.
- **Wrist: two chrome rings.**
- **Elbow: above, below, back, front and side are chrome.**
- **A dark ring around the elbow actuator, in a crease.**
- **Exposed actuator parts at the outer AND inner elbow joint.**

## Hips and legs

- **The inner and outer thigh are DIFFERENT PANELS**, and the **seam runs exactly down the middle,
  front and back**. Inner thigh is chrome.
  - ⚠️ A builder measured the art's inner and outer thigh at equal value (0.911 / 0.907) and
    flagged the spec as contradicting the art. **It does not** — John: *"inner thigh and outer
    thigh are definitely different panels, seam runs exactly down the middle at the front and
    back."* Two panels of similar VALUE separated by a SEAM is not the same thing as one panel,
    and a median-value probe cannot tell those apart. The seam is the feature.
- Where the leg detaches at the hip: **much darker in the crease**.
- **Knee: above, below, back, front and side are chrome.**
- **A dark ring around the knee actuator, in a crease.**
- **Exposed actuator parts at the posterior knee joint.**
- A **chrome panel on the back of the calf**, closer to the Achilles tendon.
- **A dark ring around the ankle actuator, in a crease.**

## Feet

- **Dark grey rubber on the PLANTA — the sole — only.** Not the whole boot.
  - ⚠️ **CORRECTED 2026-08-16.** The first build applied rubber to the entire foot because the
    spec said "the foot", and a builder separately measured the art's feet as the BRIGHTEST region
    on the figure (1.222 of the chest) and flagged the contradiction. Both are resolved by the
    same correction: the boot is bright white and only its underside is rubber.
- **Chrome actuators slightly exposed in the crease.**

---

## Process rule, and it is not optional

> *"When you compare current meshy model with the art make sure you view it from all the same
> reference angles."*

Every comparison ships **front, side and back at matched angles**, not one front elevation. The
reference already exists as four views — `assets/mv/player/baseline_front.png`,
`baseline_side-left.png`, `baseline_side-right.png`, `baseline_back.png`.

⚠️ Until 2026-08-15 the render could only be shot from the front: `mesh.animated` computes its own
camera via `fitCamera` and overwrites `?campose=`, and orbit is hard-gated off in capture mode. A
swing critic hit this and said so. `?azim=` now exists on that view for exactly this — see its own
note. **A single-angle comparison is not evidence about a three-dimensional character.**

---

## What this spec does NOT settle

- The **hue** of the chrome and of the dark crease. Measure those off the art; they are not
  described here.
- How wide a "crease" reads at figure scale. The last surface round established that anything
  under ~4 px at figure scale contributes dust rather than structure.
- Whether any of this is reachable on a single-primitive GLB with no material slots. The dark-limb
  mask is driven by **skin weights**, because the skeleton is the only frame that knows what a
  forearm is — the same mechanism has to carry these regions, and some of them (a ring around an
  actuator, a panel on the back of the calf) are **finer than a bone**. Say so rather than
  approximating them with a bone-wide band.
