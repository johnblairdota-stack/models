# Slice: executed bodies stay wreckage; 5s spec pan (CAST9 redelivery)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `0f9f0a0` (PR 76 merge). Spec, not the night. **Grok, not Max. Do not merge.**
Game waits on this docs PR. Treat PR 76 as **failed delivery**, not a new look.

CAST9 sat on `0f9f0a0` after 76 shipped `LINGER_CRIME_S 1.50` / `LINGER_ORBIT_S 1.50` /
`LINGER_GROUP_S 2.00` (`LINGER_TOTAL_S 5.00`) in `execute-hit.js`. CAST9 still saw
Gus `wreck=true sit=false` and `EXECUTION 12s` `CAMERA WARM`. Keep `wreckPose`. Wire the
HIT clock. Do not retune the 5s numbers. Not a CUE_KIND.

Quote CAST9: `THE SEASON IS OVER` / `The Showrunner is deciding.` Evils Fox+Gus OUT.
No W5. No 2g1e.

CAST9 lock `lingerWreck` = FAIL:

- quote: `Gus wreck=true sit=false` tv=`PRIME TIME ON AIR EPISODE 5 · EXECUTION`
  `EXECUTION 12s` `PRIME TIME EXECUTION · CAMERA WARM`
- `sit=false` with wreck flag is the vanish class (body not holding `wreckPose` on the
  floor). `CAMERA WARM` on the execution TV means linger never owned the HIT camera.

Do not invent a follow.js camera. This pan is a spec camera (`wreckCam` / `sendoffCam`
class). Do not restage Shot B.

---

## 0. Why this slice exists

After the sledge connects the show has to leave the wreck without losing the body. CAST9
overran the 5s pan (12s, CAMERA WARM) and Gus was wreck=true sit=false. 76 shipped the
numbers; CAST9 failed the picture.

---

## 1. Numbers (use these — already on tip; do not retune)

`LINGER_TOTAL_S = 5.00` after contact.
`LINGER_CRIME_S = 1.50` pan up/away onto the wreck.
`LINGER_ORBIT_S = 1.50` quick pan around wreck + toppled chair.
`LINGER_GROUP_S = 2.00` refocus on the seated living group.
Striker `parkSit` during GROUP (unmount sledge, restore their chair). Victim stays
`wreckPose` u=1. `WRECK_HOLD_S` stays 0.50. `WRECK_SHOT.dur` stays 0. `EXECUTION` stays
20s. `WRECK_LOOK_Y` 0.42, `WRECK_EYE_Y` 0.78 stay the crime-scene eyeline.

---

## 2. File ownership

You may edit: `docs/slices/task-exec-wreck-linger.md` ; `src/game/execute-hit.js` (drive
`execLingerCam` on the HIT clock, do not retune numbers); `src/game/intro-bed.js`
(persist wrecked, drive linger cam, `parkSit` swinger during GROUP, never `parkSit` a
wrecked victim, never hide wreckage, `sit=false` vanish is red); `harness/execute-hit.mjs`
(H7 H11 plus linger 5.00 on the HIT clock, CAST9-class 12s `CAMERA WARM` is red, Gus
`wreck=true sit=false` is red, no 10s plate, no `fillExecuteEye` after contact, no new
CUE_KIND).
`accusation-stage.js` only if EXECUTE needs a linger phase key — prefer linger in
`execute-hit.js`. `follow.js` only if `intros.wrecked` fanout drops ids. Do not add
CUE_KIND. last-look hard-cut stays.

Do not edit: `follow.js` chase/top/crane/CUE_KINDS. Hunter art. Live 5178/5181.
`phases.js` EXECUTION 20s. `win.js`. Expedition pads. pair-lock sendoff numbers.
Do not restore W5.

---

## 3. The lock

1. After contact the victim is wreckage: `wreckPose` u=1, visor crashed, chair toppled.
   Not ragdoll. Not sit-idle. Not missing. `wreck=true sit=false` is a defect.
2. Wreckage persists for the rest of the night. Alignment hidden until Reunion.
3. After contact the camera does NOT linger on the nominator's rear and does NOT sit on
   `CAMERA WARM`. Spec pan: crime 1.50, orbit 1.50, group 2.00. Total 5.00 on the HIT
   clock, not the EXECUTION beat clock (20s) and not VOTE chrome.
4. Striker `parkSit` to their own chair during GROUP. Sledge unmounts.
5. Spec camera (`wreckCam` class), NOT a follow.js mode. No new CUE_KIND.
6. Do not restore `WRECK_SHOT` dur 10. Do not change EXECUTION from 20s to 5s. Do not
   restage Shot B. Do not retune 1.50 / 1.50 / 2.00.

---

## 4. Traps and verification

`fillExecuteEye` staying on after contact is the rear shot. `applyWreck` then rebuild
without wrecked ids is the vanish. `parkSit(victim)` on empty execute cue was H11.
CAST9 `CAMERA WARM` on EXECUTION 12s means linger never owned the HIT camera. Never
npx vite build.
Gate: `harness/execute-hit.mjs` in `gates:party`.
Red: wrecked id missing after empty execute cue; `wreckPose` u=1 not on floorY;
`wreck=true sit=false`; linger on HIT clock not 5.00; CAST9-class ~12s `CAMERA WARM`;
`WRECK_SHOT.dur` >= 10; new CUE_KIND; swinger still `fillExecuteEye` after contact.
If a stated fact is wrong, say so in the report rather than diverging silently.
