# Slice: keep wreck mesh after HIT (CAST11 redelivery)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: CAST11 sat `8c14863` (PR 80). Docs PR off current `main` (`2012a61`). Spec, not
the night. **Grok, not Max. Do not merge.** Treat PR 80 as **failed delivery of linger**,
not a new look.

CAST11: `sit=false wreckPose=false` every HIT. Fox EXECUTION 10s, Ben 11s, Cy 10s.
**Keep wreck mesh after HIT.** Do not retune the 5s numbers. Not a CUE_KIND.

2g1e last vote PASS. No W5. Emote chrome PASS — do not touch. Vote-HIT mixed, not this
build.

Quote CAST11: `SEASON FINALE` / `The cast wins`. Evils Cy+Eli OUT. Living Ada, Dee.

CAST11 lock `lingerWreck` = FAIL:

- quote: `Cy wreck=true sit=false wreckPose=false` tv=`EPISODE 6 · EXECUTION`
  `EXECUTION 10s` `PRIME TIME EXECUTION Cy 2 Ada CY`
- H483: Cy wreck linger vanish? wreck=true sit=false snap.wreck=undefined
  snap.sit=undefined. Expected: dead stay wreckage on the TV (`wreckPose`).
  `sit=false` despawn / vanish is FAIL. State may say wreck; mesh may be gone.
- CoS: Fox 10s, Ben 11s, Cy 10s — same class every HIT.

Numbers already on tip — do not retune: 1.50 / 1.50 / 2.00 / 5.00. `WRECK_HOLD_S` 0.50.
`WRECK_SHOT.dur` 0. `EXECUTION` stays 20s (beat clock ≠ linger).

---

## 0. Why this slice exists

80 claimed linger-on-HIT and planted wreck. CAST11 still photographed no wreck mesh
(`wreckPose=false`) and `sit=false` at 10s / 11s. Keep the mesh as wreckage after the
hit. Do not restage Shot B.

---

## 1. File ownership

You may edit: `docs/slices/task-exec-wreck-linger.md` ; `src/game/execute-hit.js` (drive
linger on the HIT clock, do not retune numbers); `src/game/intro-bed.js` (persist the
wreck **mesh**, never `parkSit` a wrecked victim, never hide wreckage);
`harness/execute-hit.mjs` (CAST11-class `sit=false wreckPose=false` every HIT and
10s / 11s overrun are red).

Do not edit: `follow.js` CUE_KINDS. Hunter art. Live 5178/5181. `phases.js` EXECUTION
20s. `win.js`. Expedition pinPad (other slice). Emote chrome (PASS). Vote-HIT (mixed).
Do not restore W5. Do not restage Shot B.

---

## 2. The lock

1. After contact the victim is wreckage: `wreckPose` u=1, visor crashed, chair toppled.
   The **mesh stays**. `sit=false` and `wreckPose=false` are defects even if
   `wreck=true` in state.
2. Wreckage persists for the rest of the night. Alignment hidden until Reunion.
3. Spec pan on the HIT clock: crime 1.50, orbit 1.50, group 2.00. Total 5.00. CAST11
   10s / 11s is red.
4. Striker `parkSit` to their own chair during GROUP. Sledge unmounts.
5. Spec camera (`wreckCam` class). No new CUE_KIND.
6. Do not retune 1.50 / 1.50 / 2.00. Do not change EXECUTION from 20s to 5s.

---

## 3. Traps and verification

State `wreck=true` with `snap.wreck=undefined` is the CAST11 vanish. Keep the mesh.
80's H17 gates are not a pass. H483 is the bar. Never npx vite build.
Gate: `harness/execute-hit.mjs` in `gates:party`.
Red: `wreckPose=false` after HIT; `sit=false` vanish; linger on HIT clock not 5.00;
CAST11-class 10s / 11s; new CUE_KIND.
If a stated fact is wrong, say so in the report rather than diverging silently.
