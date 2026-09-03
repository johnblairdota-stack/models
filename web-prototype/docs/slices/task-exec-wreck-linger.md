# Slice: keep wreckPose true after HIT (CAST13 redelivery)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `87d45d5` (PR 84 merge). Spec, not the night. **Grok, not Max. Do not merge.**
Treat PR 84 as **failed delivery of wreckPose**, not a new look.

CAST13: `wreck=true sit=false wreckPose=false`. EXECUTION 10s H518 Fox (same Eli / Ben /
Gus / Hal). Lock quote also has Hal EXECUTION 20s (beat clock — do not treat 20s as
linger fail). **Keep wreckPose true after HIT.** Do not retune the 5s numbers. Not a
CUE_KIND.

2g1e last vote PASS. No W5. Vote-HIT mixed, not this build. Do not undo pinPad=true.

Quote CAST13: `SEASON FINALE` / `The cast wins`. Evils Ben+Cy. Past ep5 to ep11.

CAST13 lock `lingerWreck` = FAIL:

- quote: `Hal wreck=true sit=false wreckPose=false` tv=`EPISODE 7 · EXECUTION`
  `EXECUTION 20s` `PRIME TIME EXECUTION Hal 3 Ada HAL`
- CoS: Fox H518 EXECUTION 10s, same Eli/Ben/Gus/Hal.
- State may say `wreck=true`; mesh `wreckPose=false` and `sit=false` is the vanish.

Numbers already on tip — do not retune: 1.50 / 1.50 / 2.00 / 5.00. `WRECK_HOLD_S` 0.50.
`WRECK_SHOT.dur` 0. `EXECUTION` stays 20s (beat clock ≠ linger).

---

## 0. Why this slice exists

84 claimed planted seated wreckage at u=1. CAST13 still photographed `wreckPose=false`
at 10s / 20s beat. Keep the mesh as wreckage after the hit. Do not restage Shot B.

---

## 1. File ownership

You may edit: `docs/slices/task-exec-wreck-linger.md` ; `src/game/execute-hit.js` (drive
linger on the HIT clock, do not retune numbers); `src/game/intro-bed.js` (persist the
wreck **mesh** `wreckPose` u=1, never `parkSit` a wrecked victim, never hide wreckage);
`harness/execute-hit.mjs` (CAST13-class `sit=false wreckPose=false` after HIT and 10s
overrun are red; EXECUTION 20s beat alone is not red).

Do not edit: `follow.js` CUE_KINDS. Hunter art. Live 5178/5181. `phases.js` EXECUTION
20s. `win.js`. Expedition pin[] (other slice). Emote chrome (other slice). Vote-HIT
(mixed). Do not restore W5. Do not restage Shot B. Do not undo pinPad paint.

---

## 2. The lock

1. After contact the victim is wreckage: `wreckPose` u=1, visor crashed, chair toppled.
   The **mesh stays**. `sit=false` and `wreckPose=false` are defects even if
   `wreck=true` in state.
2. Wreckage persists for the rest of the night. Alignment hidden until Reunion.
3. Spec pan on the HIT clock: crime 1.50, orbit 1.50, group 2.00. Total 5.00. CAST13
   10s is red. EXECUTION 20s beat is not linger fail.
4. Striker `parkSit` to their own chair during GROUP. Sledge unmounts.
5. Spec camera (`wreckCam` class). No new CUE_KIND.
6. Do not retune 1.50 / 1.50 / 2.00. Do not change EXECUTION from 20s to 5s.

---

## 3. Traps and verification

84 planting wreckPose in node is not a pass if CAST13 photographs `wreckPose=false`.
H518 is the bar. Never npx vite build.
Gate: `harness/execute-hit.mjs` in `gates:party`.
Red: `wreckPose=false` after HIT; `sit=false` vanish; linger on HIT clock not 5.00;
CAST13-class 10s; new CUE_KIND.
If a stated fact is wrong, say so in the report rather than diverging silently.
