# Slice: keep wreckPose after HIT (CAST12 redelivery)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `5c9e57c` (PR 82 merge). Spec, not the night. **Grok, not Max. Do not merge.**
Treat PR 82 as **failed delivery of wreck mesh**, not a new look.

CAST12: `wreck=true sit=false wreckPose=false`. EXECUTION 10s (H488 Fox; same class
Ben / Eli / Gus / Hal / Dee). Lock quote also has Dee EXECUTION 8s. **Keep wreckPose
after HIT.** Do not retune the 5s numbers. Not a CUE_KIND.

2g1e last vote PASS. No W5. Emote chrome PASS — do not touch. Vote-HIT mixed, not this
build. Do not undo pinPad=true (other slice).

Quote CAST12: `REUNION` / `THE SEASON IS OVER THE AWARDS THE ROLL CALL`. W1 both evils
dead (Dee+Eli). Living Ada, Cy.

CAST12 lock `lingerWreck` = FAIL:

- quote: `Dee wreck=true sit=false wreckPose=false` tv=`EPISODE 6 · EXECUTION`
  `EXECUTION 8s` `PRIME TIME EXECUTION Dee 2 Ada DEE`
- CoS: Fox H488 EXECUTION 10s, same Ben/Eli/Gus/Hal/Dee.
- State may say `wreck=true`; mesh `wreckPose=false` and `sit=false` is the vanish.

Numbers already on tip — do not retune: 1.50 / 1.50 / 2.00 / 5.00. `WRECK_HOLD_S` 0.50.
`WRECK_SHOT.dur` 0. `EXECUTION` stays 20s (beat clock ≠ linger).

---

## 0. Why this slice exists

82 claimed `wreckSnap` always defines wreck/sit/wreckPose. CAST12 still photographed
`wreckPose=false` at 8s / 10s. Keep the mesh as wreckage after the hit. Do not restage
Shot B.

---

## 1. File ownership

You may edit: `docs/slices/task-exec-wreck-linger.md` ; `src/game/execute-hit.js` (drive
linger on the HIT clock, do not retune numbers); `src/game/intro-bed.js` (persist the
wreck **mesh** `wreckPose` u=1, never `parkSit` a wrecked victim, never hide wreckage);
`harness/execute-hit.mjs` (CAST12-class `sit=false wreckPose=false` after HIT and
8s / 10s overrun are red).

Do not edit: `follow.js` CUE_KINDS. Hunter art. Live 5178/5181. `phases.js` EXECUTION
20s. `win.js`. Expedition pin[] (other slice). Emote chrome (PASS). Vote-HIT (mixed).
Do not restore W5. Do not restage Shot B. Do not undo pinPad paint.

---

## 2. The lock

1. After contact the victim is wreckage: `wreckPose` u=1, visor crashed, chair toppled.
   The **mesh stays**. `sit=false` and `wreckPose=false` are defects even if
   `wreck=true` in state.
2. Wreckage persists for the rest of the night. Alignment hidden until Reunion.
3. Spec pan on the HIT clock: crime 1.50, orbit 1.50, group 2.00. Total 5.00. CAST12
   8s / 10s is red.
4. Striker `parkSit` to their own chair during GROUP. Sledge unmounts.
5. Spec camera (`wreckCam` class). No new CUE_KIND.
6. Do not retune 1.50 / 1.50 / 2.00. Do not change EXECUTION from 20s to 5s.

---

## 3. Traps and verification

82's `wreckSnap` keys existing in node is not a pass if CAST12 photographs
`wreckPose=false`. H488 is the bar. Never npx vite build.
Gate: `harness/execute-hit.mjs` in `gates:party`.
Red: `wreckPose=false` after HIT; `sit=false` vanish; linger on HIT clock not 5.00;
CAST12-class 8s / 10s; new CUE_KIND.
If a stated fact is wrong, say so in the report rather than diverging silently.
