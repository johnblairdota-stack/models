# Slice: READ YOUR CARD plate is a 78 popup regression (CAST13)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `87d45d5`. Spec, not the night. **Grok, not Max. Do not merge.** Treat
this as **failed delivery of PR 78 popups**, not a new look. Do not call emote chrome
still-PASS.

CAST13 H544: `READ YOUR CARD` / `Every ballot is in` plate returned on ep5. Named taps
Ada CLAP / Ben BOO held. Lock row `fadingPopups` still quoted PASS on a later casting
beat (`Nobody says a word yet`) — that lock is stale. The ep5 plate is the photograph.

Quote CAST13: `SEASON FINALE` / `The cast wins`. Evils Ben+Cy. No W5. pinPad=true stays
(other slice). Vote-HIT mixed, not this build.

Do not invent a camera. Do not put votes on the mansion follow.

---

## 0. Why this slice exists

78 killed the casting plate for CAST10/11/12 lock-PASS. CAST13 ep5 put `READ YOUR CARD`
/ `Every ballot is in` back on the TV. Named emote taps still work. Restore fading
named popups. Not a 26 percent column and not a card-read plate.

---

## 1. File ownership

You may edit: `docs/slices/task-cast-emote-chrome.md` ; `src/views/party-host.js` (stop
owning the TV with READ YOUR CARD / Every ballot is in / READING / BALLOT IN; fading
named popups like emotes); `src/party/night-skin.js` / `src/party/look.js` if the plate
CSS came back; `harness/react-pad.mjs` and `harness/cast-ballot.mjs` (CAST13-class
H544 plate is red; Ada CLAP / Ben BOO named taps must stay).

Do not edit: `follow.js` cameras. `win.js`. execute-hit. Expedition pin[]. Live
5178/5181. Do not restore W5. Do not undo pinPad=true.

---

## 2. The lock

1. Casting votes appear as small popup text that fades like emotes. Not a full-screen
   plate. Not `READ YOUR CARD` / `Every ballot is in` / `READING` / `BALLOT IN` owning
   the TV.
2. Named taps stay (Ada CLAP / Ben BOO held on CAST13). Name under the emote, never
   Someone when seated. Name color = seat accent.
3. Do not invent a camera. Do not put votes on the mansion follow.

---

## 3. Traps and verification

A later-ep `fadingPopups` PASS quote is not a pass if ep5 photographed the plate.
H544 is the bar. Gate: `harness/react-pad.mjs` plus `harness/cast-ballot.mjs` in
`gates:party`.
Red: CAST13-class TV body contains `READ YOUR CARD` / `Every ballot is in` as the
picture; named taps lost; Someone for a seated id.
If a stated fact is wrong, say so in the report rather than diverging silently.
