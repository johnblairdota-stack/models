# Slice: hold vote through HIT / verdict chrome (CAST9 mixed — do not call green)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `0f9f0a0` (PR 76 merge). Spec, not the night. **Grok, not Max. Do not merge.**
**Do not call this green. Do not make this the next build.** Next is pin clocks recap
(`task-stuck-runner.md`).

CAST9 HIT nights recorded chrome OUT (Fox / Ben / Eli / Gus). CAST8 `fell: nobody` then
Reunion `You were executed` did not recur. Season lock `holdThroughHit` still FAIL on
reunion chrome.

Quote CAST9: `THE SEASON IS OVER` / `The Showrunner is deciding.` Evils Fox+Gus OUT.
No W5. No 2g1e. W1 both evils dead.

CAST9 lock `holdThroughHit` = FAIL:

- quote: `PRIME TIME ON AIR EPISODE 5 · REUNION` `THE SEASON IS OVER` `THE AWARDS`
  `THE ROLL CALL` Standing by Every nameplate is about to be turned over. Waiting on
  the reveal `The Showrunner is deciding.`
- H403: HOLD timeout without shared HIT/OUT. TV already reunion / THE SEASON IS OVER.
  Expected: driver and TV share HIT/OUT via `hitHoldReady` before recording fell. Do
  not smash-verdict on VOTE timeout.

76 shipped `hitHoldReady` in `phases.js`. CAST9 still failed the season lock row on
reunion chrome. Do not invent a SHOW beat. Do not restore W5.

---

## 0. Why this slice exists

Keep the CAST8 hold (driver and TV agree HIT / OUT before the SHOW advances). CAST9
improved the HIT nights (chrome OUT on Fox/Ben/Eli/Gus) but the season lock row still
FAIL on reunion chrome. Mixed. Not the next hole.

---

## 1. File ownership

Do not start this as the CAST9 build. If you touch it after the three reds:

| file | what changes |
|---|---|
| `docs/slices/task-vote-hit-hold.md` | this file |
| `src/party/phases.js` | `hitHoldReady` must actually hold until chrome and driver share HIT / OUT; reunion chrome is not a skip |
| `src/party/vote.js` | honour standing names + printed threshold |
| `src/views/party-host.js` | verdict / OUT chrome only after the held HIT |
| vote / ballot harness in `gates:party` | CAST9 H403 HOLD timeout on reunion chrome is red; do not call green off HIT-night OUT alone |

**Do not edit:** `follow.js` cameras / CUE_KINDS. `win.js` (W5 stays deleted; TICK_ORDER
W1, W3, W2, W4; 2g1e last vote stays). execute linger. expedition auto-walk. Live
5178/5181. Hunter art.

---

## 2. The lock (unchanged; mixed on CAST9)

1. After ballots close, hold through execution / verdict chrome. Do not advance the
   SHOW until driver and TV agree HIT or no-HIT.
2. OUT chrome is only legal after that held HIT.
3. Honour standing names + the printed threshold.
4. Do not invent a SHOW beat. Do not add a CUE_KIND. Do not smash-verdict on VOTE
   timeout. Do not licensed-skip the hold.
5. W5 stays gone. 2g1e last vote stays. CAST9 ended W1 both evils dead — do not reopen
   end-on-camera.

---

## 3. Traps and verification

Do not grade this PASS because HIT nights printed OUT. The season lock row is still
FAIL (H403). Quote chrome. Gate stays the vote / ballot harness in `gates:party`.
Red: CAST8-class driver no-eviction vs chrome OUT; CAST9 H403 HOLD timeout without
shared HIT/OUT on reunion chrome; a new SHOW beat or CUE_KIND; W5 restored.
If a stated fact is wrong, say so in the report rather than diverging silently.
