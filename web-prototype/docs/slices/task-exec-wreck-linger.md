# Slice: executed bodies stay wreckage; execution linger is a 5s spec pan

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in the report rather than diverging silently.**

Base: `main` at `aed49a5`. Spec, not the night. Do not merge. Do not start Max. Game builds after this PR.
CoS locks 2 and 5 live in this one file because they are the same execute picture.

John: executed bodies disappear. They must stay wreckage on the TV (posed un-sit, not ragdoll, not vanish).
Execution linger is ~10s dead air on the nominators rear. Camera pans up/away to the crime scene, quick pan around, refocus on the group. Total linger 5 seconds (was WRECK_SHOT 10s). Striker returns to their seat.

Do not invent a follow.js camera. This pan is a spec camera (wreckCam / sendoffCam class), not a new CUE_KIND.

---

## 0. Why this slice exists
After the sledge connects the show has to leave the wreck without losing the body. CAST 8-bot vanished the executed robots and then sat ~10s on the strikers back (screenshot EXECUTION 7s). WRECK_SHOT.dur is already 0 and WRECK_HOLD_S is 0.50; the linger is fillExecuteEye staying on the swinger. Persist wreckage and replace that rear shot with a 5s spec pan.

Verified on aed49a5:
- execute-hit.js WRECK_HOLD_S = 0.50. WRECK_SHOT dur 0. wreckPose is kinematic un-sit to floorY at u=1, not ragdoll. wreckCam already exists (THREE-free).
- accusation-stage.js EXECUTE: RISE_DUR 1.65, STRIKE 1.15, WALK_TIMEOUT 8.0, FACE 0.28.
- phases.js EXECUTION = 20s. Screenshot EXECUTION 7s is this beat clock. Do not shorten the 20s beat to 5s. Shorten the CAMERA linger after contact.
- intro-bed.js already says THE WRECK STAYS on clearExecute; H11 claims wreck survives empty execute cue. John still saw vanish: find the persist hole (rebuild without wrecked ids, heldRunner hide, intros cue drop, parkSit of victim).
- follow.js last-look is hard-cut on death. CUE_KINDS already has execute. Do not add a new CUE_KIND. H6b keeps A on fillExecuteEye — that is the rear shot.
- Pair-lock sendoff is the class to copy: numbers in a THREE-free file, bed drives them, no CUE_KIND. Name the new plan execLingerCam next to wreckCam.

---

## 1. Numbers (use these)
LINGER_TOTAL_S = 5.00 after contact.
LINGER_CRIME_S = 1.50 pan up/away onto the wreck.
LINGER_ORBIT_S = 1.50 quick pan around wreck + toppled chair.
LINGER_GROUP_S = 2.00 refocus on the seated living group.
Striker parkSit during GROUP (unmount sledge, restore their chair). Victim stays wreckPose u=1. WRECK_HOLD_S stays 0.50. WRECK_SHOT.dur stays 0. EXECUTION stays 20s. WRECK_LOOK_Y 0.42, WRECK_EYE_Y 0.78 stay the crime-scene eyeline.

---

## 2. File ownership
You may edit: docs/slices/task-exec-wreck-linger.md ; src/game/execute-hit.js (linger numbers + execLingerCam); src/game/intro-bed.js (persist wrecked, drive linger cam, parkSit swinger during GROUP, never parkSit a wrecked victim, never hide wreckage); harness/execute-hit.mjs (H7 H11 plus linger 5.00, no 10s plate, no fillExecuteEye after contact, no new CUE_KIND).
accusation-stage.js only if EXECUTE needs a linger phase key — prefer linger in execute-hit.js. follow.js only if intros.wrecked fanout drops ids. Do not add CUE_KIND. last-look hard-cut stays.
Do not edit: follow.js chase/top/crane/CUE_KINDS. Hunter art. Live 5178/5181. phases.js EXECUTION 20s. win.js. Expedition pads. pair-lock sendoff numbers.

---

## 3. The lock
1. After contact the victim is wreckage: wreckPose u=1, visor crashed, chair toppled. Not ragdoll. Not sit-idle. Not missing.
2. Wreckage persists for the rest of the night. Alignment hidden until Reunion.
3. After contact the camera does NOT linger on the nominators rear. Spec pan: crime 1.50, orbit 1.50, group 2.00. Total 5.00.
4. Striker parkSit to their own chair during GROUP. Sledge unmounts.
5. Spec camera (wreckCam class), NOT a follow.js mode. No new CUE_KIND. CoS do not invent extra cameras means no new produced-follow mode; this pan is the locked execute picture, same class as sendoffCam.
6. Do not restore WRECK_SHOT dur 10. Do not change EXECUTION from 20s to 5s.

---

## 4. Traps and verification
fillExecuteEye staying on after contact is the rear shot. applyWreck then rebuild without wrecked ids is the vanish. parkSit(victim) on empty execute cue was the ep2 Ada-in-chair-7 bug (H11). Do not hide wreckage to clean the circle. Never npx vite build.
Gate: harness/execute-hit.mjs in gates:party.
Red: wrecked id missing after empty execute cue; wreckPose u=1 not on floorY; linger total not 5; WRECK_SHOT.dur >= 10; new CUE_KIND; swinger still fillExecuteEye after contact.
If a stated fact is wrong, say so in the report rather than diverging silently.
