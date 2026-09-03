# Slice: casting votes fade like emotes (CAST9 redelivery)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `0f9f0a0` (PR 76 merge). Spec, not the night. **Grok, not Max. Do not merge.**
Game waits on this docs PR. Treat PR 76 as **failed delivery**, not a new look.

CAST9 sat on `0f9f0a0` after 76 claimed the casting plate was gone. Still
`READ YOUR CARD` / `READING` / `BALLOT IN` owns the TV. Fading named popups, not a plate.

Quote CAST9: `THE SEASON IS OVER` / `The Showrunner is deciding.` Evils Fox+Gus OUT.
No W5. No 2g1e.

CAST9 lock `fadingPopups` = FAIL:

- quote: `PRIME TIME ON AIR EPISODE 4 · CASTING` `READ YOUR CARD` Nobody says a word yet.
  `1 Ben OUT` `2 Ada READING` `3 Cy READING` `4 Dee READING`
- Ep 2 `cameraQuote` also includes `READ YOUR CARD` on the expedition TV.

76 still calls `castOverlay()` from `party-host.js` (two sites). Kill the hog. Keep lamps
/ castBoard if they are not the hog.

Do not invent a camera. Do not put votes on the mansion follow.

---

## 0. Why this slice exists

Casting / card-read chrome still eats the ballroom on CAST9. 76 shipped an emote claim;
CAST9 still saw the plate. Small fading named popups like emotes. Not a 26 percent
column and not `READ YOUR CARD` / `READING` / `BALLOT IN` as the TV picture.

---

## 1. File ownership

You may edit: `docs/slices/task-cast-emote-chrome.md` ; `src/views/party-host.js` (stop
owning the TV with `castOverlay` / READ YOUR CARD / READING / BALLOT IN; real player
name, never Someone when seated; color from `seatLook.accent`; fading popups patched in
place like R42c); `src/party/night-skin.js` (`react-who` uses accent; vote-popup reuses
`react-float`; kill the full-height cast-overlay column); `src/party/look.js` (update the
colours-are-FIXED comment so it does not fight this lock); `harness/react-pad.mjs` and
`harness/cast-ballot.mjs` (CAST9-class READ YOUR CARD / READING / BALLOT IN plate is red).
`cast-ui.js` only if `mergePublicNames` is why Someone wins.

Do not edit: `follow.js` cameras. `win.js`. execute-hit. Phone Watch pad CLAP/BOO/SUS/SHOCK
buttons. Live 5178/5181. Execution ADA SWINGS / BEN SWINGS plate is not this slice.
Do not restore W5.

---

## 2. The lock

1. Casting votes appear as small popup text that fades like emotes. Not a full-screen
   plate. Not a 26 percent column of slips. Not `READ YOUR CARD` / `READING` / `BALLOT IN`
   owning the TV.
2. A vote popup names the voter and the two picks, then fades (`REACT_HOLD_MS`). Spam
   stacks like emotes (cap recency).
3. Emote chips show the player's joined name under the face, never Someone when that
   player is seated.
4. Emote name (and chip tint) matches that player's name color (lobby accent / nameplate).
   Four reaction pictures stay distinct.
5. Do not invent a camera. Do not put votes on the mansion follow.

---

## 3. Traps and verification

`paint()` innerHTML restarts `react-float` (R42c). 76 still concatenates `castOverlay()`
into the TV body — CAST9 `fadingPopups` FAIL is that hog, including card-read chrome.
`mergePublicNames` argument order is the Someone bug.
Gate: `harness/react-pad.mjs` plus `harness/cast-ballot.mjs` in `gates:party`.
Red: chip HTML contains Someone for a named seated id; `.cast-overlay` still a full-height
plate; CAST9-class TV body contains `READ YOUR CARD` / `READING` / `BALLOT IN` as the
picture; `paint()` rewrites the run frame on a ballot.
If a stated fact is wrong, say so in the report rather than diverging silently.
