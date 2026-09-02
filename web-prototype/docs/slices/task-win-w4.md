# Slice: nights do not end because cameras missed — delete W5

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in the report rather than diverging silently.**

Base: main at aed49a5, docs on PR 73 (docs/cast8-locks). Spec, not the night. Do not merge. Do not start Max. Still Grok. Game is mid-build and must not ship 3v1-still-W5.

John, 2026-09-03, overrode 3v1-still-W5. New lock: get rid of end-on-camera. No W5. No Production win from cameras-short at cap. No CAMERA WARMING cancel. W4 (evils equal remaining goods) stays. W1 (goods find the evil) stays. 2g1e last vote stays. Slice the cap: nights do not end because cameras missed. Do not invent a new SHOW beat.

---

## 0. Why this slice exists
CAST7 printed Production at 2g1e because W5 fired on cameras 0/4 at cap (CAMERA WARMING). John first kept that vote. He has now killed the door: a camera miss is not a fold, at 2v1 or 3v1 or 6v2. The night ends when goods find the evil (W1) or evils reach parity (W4), or the existing W2/W3/W6 doors. Not because the scorekeeper said 0/4.

John is out (CoS 2026-09-03). Finish this on PR 73. Game may merge it with the build. Do not wait.

---

## 1. Quote the machine as it is (aed49a5)
W1 on take/execute: living evil === 0 fires W1 FINALE. Stays.
W2 on camera_lit: camerasLit >= cameraTarget fires W2 FINALE. Stays. Lighting the cameras still wins for the cast. Missing them does not win for Production.
W3 on take: fed >= feedTarget fires W3 CANCELLED. Stays.
W4 on take/execute: living evil >= living good fires W4 CANCELLED. Stays. 2g1e is not this. Last vote that kills a good becomes 1g1e and then W4.
W5 at EPISODE_CAP (VERDICT branch AND H278 tail): missedTargets (camerasLit < cameraTarget OR fed < feedTarget) fires W5 CANCELLED. DELETE both sites. TICK_ORDER drops W5.
W6 host.skip ABANDONED stays.

---

## 2. The fold change
Delete W5. Both sites: the phase.VERDICT branch and the H278 tail. A cap miss is RENEWED. CAMERA WARMING / 0 of 4 is scorekeeping, never a cancel. Do not invent a new SHOW beat. Full episode order still runs past EPISODE_CAP until W1/W2/W3/W4/W6.
2g1e last vote: execute the remaining evil -> W1 FINALE. Execute a good -> 1g1e -> W4 CANCELLED. That still holds, now for 3v1 and 6v2 too — cap will not steal the vote.
EPISODE_CAP stays a number in phases.js for session math. It is not a Production door. playMatch / while-episode-lte-cap must not Reunion-from-cap when foldWin returns RENEWED.
Do not change W1 W2 W3 W4 W6. Do not change WIN_TARGETS. cam-target-split (3 vs 4) is still Johns open hole; do not pick a number. round-loop R2e sixty-minute ceiling stays the time backstop. Do not invent a second cap-as-W5.

---

## 3. File ownership
You may edit: docs/slices/task-win-w4.md ; src/party/win.js (delete W5 both sites, drop W5 from TICK_ORDER, header comment so H278 is not restored); harness/win-machine.mjs ; harness/round-loop.mjs if R2 copy claims the cap always ends the night; src/party/room.js or playMatch while-loop if it stops at EPISODE_CAP without foldWin; party-host / verdict chrome if CAMERA WARMING or 0/4 cancels the night.
Do not edit: follow.js. execute-hit. Expedition pads. Live 5178/5181. The other three slices on PR 73 (stuck runner, wreck linger, emote chrome).

---

## 4. Gates
harness/win-machine.mjs in gates:party.
KEEP: W1 all evil dead FINALE. W2 camera target FINALE. W3 feed target CANCELLED. W4 2e1g CANCELLED. W6 skip ABANDONED. W11d before the cap 0 cameras is RENEWED.
REWRITE: old W5 / W11 / W11c / W10c (quiet 8p at cap 0 cameras CANCELLED) become executed negatives — rule is null, outcome RENEWED, chrome is The season continues, not Production wins. Same for 3g1e at cap 0 cameras, and 2g1e at cap 0 cameras.
ADD: 2g1e then execute remaining evil -> W1. 2g1e then execute a good -> W4. TICK_ORDER no longer contains W5.
REWRITE W10 inside-the-cap: a night may run past EPISODE_CAP while RENEWED. It still must end on W1/W2/W3/W4/W6, never hang. R2e sixty-minute ceiling stays.

---

## 5. Traps
H278 said a cap miss is never RENEWED. Overruled. Do not restore it. Deleting only the VERDICT branch and leaving the tail is how CAST7 happens again.
playMatch while episode <= EPISODE_CAP will Reunion-from-cap even if foldWin is RENEWED. That loop is in scope.
W2 stays. Lighting cameras still ends it for the cast. Missing cameras does not end it for Production. CAMERA WARMING is not a fold.
Do not invent a SHOW beat. Do not invent 3v1 as a special count — there is no W5 left to special-case.
Never npx vite build. If a stated fact is wrong, say so in the report rather than diverging silently.
