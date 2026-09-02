# Slice: CAST7 1v2 Production is W5 (cap miss), not W4

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in the report rather than diverging silently.**

Base: `main` at `aed49a5`. Spec, not the night. Do not merge. Do not start Max. Game builds after this PR.
CoS lock 6. Do not invent a new fold. Quote win.js against CAST7 chrome.

CAST7 chrome (Chief of Staff, 2026-09-02): outcome CANCELLED, The Reunion is next. Cameras 0/4 CAMERA WARMING. Evils Ada+Dee. Living at end Ben, Dee, Hal (Ada already fell) — 1 evil vs 2 goods. Production won on camera miss at cap, not evils-equal.

Top product hole of that night is still the stuck runner (other slice). This file only locks the win machine.

---

## 0. Why this slice exists

CAST7 printed Production wins at 1v2. The living count was 1 evil (Dee) vs 2 goods (Ben, Hal). W4 is alive(evil) >= alive(good). 1 >= 2 is false, so W4 did not fire. Cameras 0/4 at cap is W5. Do not change W4. Do not add a fold that makes 1-evil-2-good a W4.

---

## 1. Quote win.js
W4 on take/execute: if living evil >= living good, fire W4 CANCELLED. CAST7 was 1 vs 2 so W4 did not fire.
W5 at EPISODE_CAP: camerasLit < cameraTarget or fed < feedTarget fires W5 CANCELLED. CAST7 cameras 0/4 is this door.
outcomeLine(CANCELLED) is: Production wins. The Reunion is next.
WIN_TARGETS[8] cameraTarget 4, feedTarget 3. EPISODE_CAP 5. TICK_ORDER W1 W3 W2 W4 W5.

---

## 2. File ownership
You may edit: docs/slices/task-win-w4.md ; src/party/win.js COMMENT only (do not change the predicate); harness/win-machine.mjs (add 1e2g-at-cap-cameras-0 is W5; 1e2g-not-at-cap is not W4; 2e1g on take is W4).
party-host / phone verdict ONLY if chrome printed Production without foldWin. Then print outcomeLine(CANCELLED) and the rule id. No private copy.
Do not edit: EPISODE_CAP, WIN_TARGETS numbers (cam-target-split 3 vs 4 stays Johns call). follow.js. execute-hit. Live 5178/5181.

---

## 3. The lock
1. Quote W4. Evils win when livingEvil >= livingGood. That is Production (CANCELLED). CAST7 was not this.
2. Quote W5. At EPISODE_CAP a cameras or feed miss is also Production. CAST7 cameras 0/4 at cap is W5.
3. Do not invent a new fold. Do not change >= to >. Do not fold only at cap. Do not make 1 evil vs 2 goods a W4.
4. Chrome uses outcomeLine. CAST7 The Reunion is next is already that copy.

---

## 4. Verification
Gate: harness/win-machine.mjs in gates:party.
Add: 1 evil 2 good at cap with cameras 0 is W5 CANCELLED. 1 evil 2 good not at cap is not W4. 2 evil 1 good on a take/execute is W4.
Red: predicate changed; 2e1g is not W4; 1e2g is W4; outcomeLine(CANCELLED) drifted.
If a stated fact is wrong, say so in the report rather than diverging silently.
