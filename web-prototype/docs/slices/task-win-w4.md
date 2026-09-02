# Slice: 2 good vs 1 evil does not end the night — the last vote does

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in the report rather than diverging silently.**

Base: main at aed49a5, docs on PR 73 (docs/cast8-locks). Spec, not the night. Do not merge. Do not start Max. Still Grok. Game is mid-build on 73 and must not ship the old quote-only / no new fold line.

John, 2026-09-03, overrode the quote-only W4/W5 line. CAST7 chrome was 2 good vs 1 evil (Ben+Hal vs Dee; Ada already fell), cameras 0/4, CANCELLED / The Reunion is next — that was W5 at cap. New lock: 2 good vs 1 evil must NOT end the night. Not W5 Production. Not Reunion-from-cap. That last vote to find the remaining evil is the ending — the tension.

Do not invent 3v1 or other counts. W4 parity stays. W1/W2/W3/W6 stay. Only W5 at 2g1e moves.

---

## 0. Why this slice exists
The last three living were two goods and one evil. Production took the night on a camera miss at the cap, so the room never got the vote that would have found Dee or killed a good and handed Production a real W4. That vote is the ending John wants. W5 stole it. Change the fold.

---

## 1. Quote the machine as it is (aed49a5)
W4 on take/execute: if living evil >= living good, fire W4 CANCELLED. 1 >= 2 is false, so CAST7 was not W4. Do not change this predicate.
W5 at EPISODE_CAP (and the H278 tail): missedTargets (camerasLit < cameraTarget OR fed < feedTarget) fires W5 CANCELLED. CAST7 cameras 0/4 is this door. This is the door that closes.
outcomeLine(CANCELLED) = Production wins. The Reunion is next. outcomeLine(RENEWED) = The season continues. Casting is next. WIN_TARGETS[8] cameraTarget 4, feedTarget 3. EPISODE_CAP 5. TICK_ORDER W1 W3 W2 W4 W5.

---

## 2. The fold change
W5 does not fire when livingGood === 2 AND livingEvil === 1. Cap miss in that count is RENEWED. They play on. The next episode still runs the full order (casting through verdict) — do not invent a vote-only SHOW beat. The last vote is the ending because W1 or W4 will fire on its execute, not because the rundown shrinks.
On that vote: execute the remaining evil -> W1 FINALE (cast wins). Execute a good -> 1 good 1 evil -> W4 CANCELLED (parity, Production). Miss / no execute -> still 2g1e, W5 still suppressed, they RENEW again. Do not invent a second cap to stop a 2v1 stall; round-loop R2e sixty-minute ceiling is the existing backstop.
Apply the same 2g1e test on both W5 sites: the phase.VERDICT branch AND the H278 tail (aired >= EPISODE_CAP && missedTargets). CAST7 died on the tail.
Do not invent 3v1. 3 good 1 evil at cap with a camera miss is still W5. 6v2 quiet night at cap is still W5. W10c / W11 (nothing happens, 0 cameras, CANCELLED) stay true for those counts.
Do not change W4 >= . Do not change W1 W2 W3 W6. Do not change WIN_TARGETS or EPISODE_CAP. cam-target-split (3 vs 4) is still Johns open hole; do not pick a number.

---

## 3. File ownership
You may edit: docs/slices/task-win-w4.md ; src/party/win.js (W5 2g1e skip on both sites; header comment so the next agent does not restore H278 blindly); harness/win-machine.mjs (see gates below); harness/round-loop.mjs only if R2/R2c/R2e copy claims the cap always ends the night; src/party/room.js or playMatch while-loop if it stops at EPISODE_CAP without asking foldWin.
Do not edit: follow.js. execute-hit. Expedition pads. Live 5178/5181. The other three slices on PR 73 (stuck runner, wreck linger, emote chrome).

---

## 4. Gates
harness/win-machine.mjs in gates:party.
KEEP: W4 2e1g on execute is CANCELLED. W5 quiet 8p at cap 0 cameras is CANCELLED (W11 / W10c / H278 for non-2v1). W11d before the cap is RENEWED.
ADD: 8p deal, kill goods and evils until livingGood is 2 and livingEvil is 1, aired/episode at EPISODE_CAP, cameras 0. Fold is RENEWED, rule null, not W5. Chrome is The season continues, not Production wins.
ADD: same 2g1e, then execute the remaining evil -> W1 FINALE. Same 2g1e, then execute a good -> W4 CANCELLED.
ADD control: 3 good 1 evil at cap 0 cameras is still W5. Do not invent a 3v1 skip.
REWRITE W10 inside-the-cap if a 2v1 seed runs EPISODE_CAP+1 — that extra episode is the last vote, not a hang. R2e sixty-minute ceiling stays.

---

## 5. Traps
H278 said a cap miss is never RENEWED. That stays the default. 2g1e is the one exception. Do not delete W5. Do not make 1e vs any goods skip W5. The H278 tail and the VERDICT branch must agree or CAST7 happens again.
playMatch while (episode <= EPISODE_CAP) will still Reunion-from-cap even if foldWin returns RENEWED. If that loop exists, it is in scope. foldWin alone is not enough.
Do not invent a new outcome word. RENEWED already says Casting is next. W1 and W4 already say the two last-vote endings.
Never npx vite build. If a stated fact is wrong, say so in the report rather than diverging silently.
