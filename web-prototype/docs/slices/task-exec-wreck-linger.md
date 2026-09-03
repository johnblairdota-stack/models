# Slice: keep wreckPose after HIT (CAST10 redelivery)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `381ae40` (PR 78 merge). Spec, not the night. **Grok, not Max. Do not merge.**
Game waits on this docs PR. Treat PR 78 as **failed delivery of linger**, not a new look.

CAST10 sat on `381ae40` after 78 shipped linger-on-HIT. Still Fox / Eli `wreck=true
sit=false`; `EXECUTION 11s` / `9s`. Keep `wreckPose` after HIT. Wire the HIT clock.
Do not retune the 5s numbers. Not a CUE_KIND.

Do not reslice emote chrome. Vote-HIT stays mixed, not this build.

Quote CAST10: `CANCELLED` / `Production wins`. Evils Cy+Dee still living. 3g2e. No W5.

CAST10 lock `lingerWreck` = FAIL:

- quote: `Eli wreck=true sit=false` tv=`PRIME TIME ON AIR EPISODE 5 · EXECUTION`
  `EXECUTION 9s` `PRIME TIME EXECUTION Eli 5 Cy ELI`
- CoS: Fox and Eli both `wreck=true sit=false`; EXECUTION 11s / 9s.
- `sit=false` with wreck flag is the vanish class (body not holding `wreckPose` on the
  floor). Keep `wreckPose` after HIT.

Numbers already on tip — do not retune: `LINGER_CRIME_S 1.50` / `LINGER_ORBIT_S 1.50` /
`LINGER_GROUP_S 2.00` / `LINGER_TOTAL_S 5.00`. `WRECK_HOLD_S` 0.50. `WRECK_SHOT.dur` 0.
`EXECUTION` stays 20s (beat clock ≠ linger).

---

## 0. Why this slice exists

After the sledge connects the show has to leave the wreck without losing the body. CAST10
overran the 5s pan (11s / 9s) and Fox / Eli were wreck=true sit=false. 78 shipped the
HIT-clock claim; CAST10 failed the picture.

---

## 1. Numbers (already on tip; do not retune)

`LINGER_TOTAL_S = 5.00` after contact.
`LINGER_CRIME_S = 1.50` pan up/away onto the wreck.
`LINGER_ORBIT_S = 1.50` quick pan around wreck + toppled chair.
`LINGER_GROUP_S = 2.00` refocus on the seated living group.
Striker `parkSit` during GROUP. Victim stays `wreckPose` u=1.

---

## 2. File ownership

You may edit: `docs/slices/task-exec-wreck-linger.md` ; `src/game/execute-hit.js` (drive
`execLingerCam` on the HIT clock, do not retune numbers); `src/game/intro-bed.js`
(persist wrecked, `parkSit` swinger during GROUP, never `parkSit` a wrecked victim,
never hide wreckage, `sit=false` vanish is red); `harness/execute-hit.mjs` (linger 5.00
on the HIT clock, CAST10-class 11s / 9s and Fox/Eli `wreck=true sit=false` are red, no
new CUE_KIND).

Do not edit: `follow.js` chase/top/crane/CUE_KINDS. Hunter art. Live 5178/5181.
`phases.js` EXECUTION 20s. `win.js`. Expedition auto-walk (other slice). Emote chrome
(PASS). Vote-HIT (mixed). Do not restore W5. Do not restage Shot B.

---

## 3. The lock

1. After contact the victim is wreckage: `wreckPose` u=1, visor crashed, chair toppled.
   Not ragdoll. Not sit-idle. Not missing. `wreck=true sit=false` is a defect.
2. Wreckage persists for the rest of the night. Alignment hidden until Reunion.
3. Spec pan on the HIT clock: crime 1.50, orbit 1.50, group 2.00. Total 5.00. CAST10
   11s / 9s is red.
4. Striker `parkSit` to their own chair during GROUP. Sledge unmounts.
5. Spec camera (`wreckCam` class), NOT a follow.js mode. No new CUE_KIND.
6. Do not retune 1.50 / 1.50 / 2.00. Do not change EXECUTION from 20s to 5s.

---

## 4. Traps and verification

`parkSit(victim)` or rebuild without wrecked ids is the vanish. 78's linger-on-HIT
claim is not a pass if CAST10 still photographs `sit=false` at 9s / 11s.
Gate: `harness/execute-hit.mjs` in `gates:party`.
Red: `wreckPose` u=1 not on floorY; `wreck=true sit=false`; linger on HIT clock not
5.00; CAST10-class 11s / 9s; new CUE_KIND.
If a stated fact is wrong, say so in the report rather than diverging silently.
