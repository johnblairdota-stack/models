# Slice: executed bodies stay wreckage; 5s spec pan (CAST8 redelivery)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `ec50862` (PR 74 merge). Spec, not the night. **Grok, not Max. Do not merge.**
Game waits on this docs PR. Treat PR 74 as **failed delivery**, not a new look.

CAST8 sat on `ec50862` after 74 shipped `LINGER_CRIME_S 1.50` / `LINGER_ORBIT_S 1.50` /
`LINGER_GROUP_S 2.00` (`LINGER_TOTAL_S 5.00`) in `execute-hit.js`. CAST8 still saw ~18s
linger, not the 5s spec pan. Wreck `sit=false` (bodies vanish). Striker `parkSit`.
Not a CUE_KIND.

CAST8 receipt (ep 5 H380):

- saw: Execution camera overran 5s. chrome still on VOTE 2s / CAMERA WARMING / BALLOTS IN
  rather than the linger pan. durationMs in the hole is a host clock, not the linger.
- expected: 5s pan up/away, around, refocus the group. Striker sits back down. Not 10s+
  on the nominator rear.
- so: HIT camera overran the locked 5s.
- next: 5s pan, sit back down. Do not restage Shot B.

Quote CAST8: "The cast wins. The Reunion is next." W5 stays gone. 2g1e last vote stays.

Do not invent a follow.js camera. This pan is a spec camera (`wreckCam` / `sendoffCam`
class), not a new CUE_KIND. Do not retune the 1.50 / 1.50 / 2.00 numbers — they already
live on `ec50862`. Wire linger to the actual HIT camera clock.

Verified on `ec50862`:

- `execute-hit.js` already exports `LINGER_CRIME_S = 1.50`, `LINGER_ORBIT_S = 1.50`,
  `LINGER_GROUP_S = 2.00`, `LINGER_TOTAL_S = 5.00`, `WRECK_HOLD_S = 0.50`,
  `WRECK_SHOT.dur = 0`. CAST8 still overran. The defect is drive/persist, not the
  constants.
- `phases.js` `EXECUTION = 20s`. Beat clock is not linger. Do not shorten the 20s beat
  to 5s.
- Pair-lock sendoff is the class to copy: numbers in a THREE-free file, bed drives them,
  no CUE_KIND. `execLingerCam` already named next to `wreckCam`.
- Vanish class: rebuild without wrecked ids, `heldRunner` hide, intros cue drop,
  `parkSit` of victim (`sit=false`). Striker `parkSit` during GROUP. Victim stays
  `wreckPose` u=1.

---

## 0. Why this slice exists

After the sledge connects the show has to leave the wreck without losing the body. CAST8
overran the 5s pan (~18s) and vanished executed robots (`sit=false`). 74 shipped the
numbers; CAST8 failed the picture.

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
wrecked victim, never hide wreckage); `harness/execute-hit.mjs` (H7 H11 plus linger 5.00
on the HIT clock, CAST8-class 18s overrun is red, no 10s plate, no `fillExecuteEye` after
contact, no new CUE_KIND, wreck `sit=false` is red).
`accusation-stage.js` only if EXECUTE needs a linger phase key — prefer linger in
`execute-hit.js`. `follow.js` only if `intros.wrecked` fanout drops ids. Do not add
CUE_KIND. last-look hard-cut stays.

Do not edit: `follow.js` chase/top/crane/CUE_KINDS. Hunter art. Live 5178/5181.
`phases.js` EXECUTION 20s. `win.js`. Expedition pads. pair-lock sendoff numbers.
Do not restore W5.

---

## 3. The lock

1. After contact the victim is wreckage: `wreckPose` u=1, visor crashed, chair toppled.
   Not ragdoll. Not sit-idle. Not missing. `sit=false` vanish is a defect.
2. Wreckage persists for the rest of the night. Alignment hidden until Reunion.
3. After contact the camera does NOT linger on the nominator's rear. Spec pan: crime
   1.50, orbit 1.50, group 2.00. Total 5.00 on the HIT clock, not the VOTE chrome clock.
4. Striker `parkSit` to their own chair during GROUP. Sledge unmounts.
5. Spec camera (`wreckCam` class), NOT a follow.js mode. No new CUE_KIND.
6. Do not restore `WRECK_SHOT` dur 10. Do not change EXECUTION from 20s to 5s. Do not
   restage Shot B.

---

## 4. Traps and verification

`fillExecuteEye` staying on after contact is the rear shot. `applyWreck` then rebuild
without wrecked ids is the vanish. `parkSit(victim)` on empty execute cue was the ep2
Ada-in-chair-7 bug (H11). Do not hide wreckage to clean the circle. H380 chrome still
on VOTE / CAMERA WARMING means linger never owned the HIT camera. Never npx vite build.
Gate: `harness/execute-hit.mjs` in `gates:party`.
Red: wrecked id missing after empty execute cue; `wreckPose` u=1 not on floorY;
`sit=false` vanish; linger on HIT clock not 5.00; CAST8-class ~18s overrun; `WRECK_SHOT.dur`
>= 10; new CUE_KIND; swinger still `fillExecuteEye` after contact.
If a stated fact is wrong, say so in the report rather than diverging silently.
