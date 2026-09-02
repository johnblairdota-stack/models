# Slice: casting votes fade like emotes; emotes show the player name and color

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in the report rather than diverging silently.**

Base: `main` at `aed49a5`. Spec, not the night. Do not merge. Do not start Max. Game builds after this PR.
CoS locks 3 and 4 (same TV chrome).

John: casting votes-by-player hog the TV. Small popup text that fades like emotes. Not a full-screen plate.
Emotes: player name under the emote, not Someone. Emote color matches that players name color.

Do not invent a camera. Do not put votes on the mansion follow.

---

## 0. Why this slice exists
Casting slips sit in a 26 percent column and eat the ballroom. Emote chips already have a name slot but it prints Someone, and the name is night-soft instead of the player accent.

Verified on aed49a5:
- party-host.js castOverlay is aside.cast-overlay, one slip per ballot. look.js .cast-overlay is a full-height 26 percent column. Kill that hog. Keep lamps / castBoard if they are not the hog.
- paintReactStrip writes react-who with joinedName(..., Someone). names = mergePublicNames(client.lobby, client.links.pairs). Other paints use mergePublicNames(client.frame.players, client.lobby). That mismatch is the Someone hole.
- night-skin.js .react-who color is --night-soft. seatLook.accent is already on the lobby and seatChip. Name color = that accent. look.js currently fixes badge colour per reaction; John overrules that for the NAME and chip tint. Four reaction pictures stay distinct (R50/R60).
- react.js: reactions are PUBLIC and ATTRIBUTED. REACT_HOLD_MS = 10000. Vote popups use the same hold/fade class, not a second plate.

---

## 1. File ownership
You may edit: docs/slices/task-cast-emote-chrome.md ; src/views/party-host.js (real player name, never Someone when seated; color from seatLook.accent; replace slips column with fading popups patched in place like R42c); src/party/night-skin.js (react-who uses accent; vote-popup reuses react-float; kill the full-height cast-overlay column); src/party/look.js (update the colours-are-FIXED comment so it does not fight this lock); harness/react-pad.mjs and harness/cast-ballot.mjs (and talk-frames if it measures overlay width).
cast-ui.js only if mergePublicNames is why Someone wins.
Do not edit: follow.js cameras. win.js. execute-hit. Phone Watch pad CLAP/BOO/SUS/SHOCK buttons. Live 5178/5181. Execution BEN SWINGS plate is not this slice.

---

## 2. The lock
1. Casting votes appear as small popup text that fades like emotes. Not a full-screen plate. Not a 26 percent column of slips.
2. A vote popup names the voter and the two picks, then fades (REACT_HOLD_MS). Spam stacks like emotes (cap recency).
3. Emote chips show the players joined name under the face, never Someone when that player is seated.
4. Emote name (and chip tint) matches that players name color (lobby accent / nameplate). Four reaction pictures stay distinct.
5. Do not invent a camera. Do not put votes on the mansion follow.

---

## 3. Traps and verification
paint() innerHTML restarts react-float (R42c). mergePublicNames argument order is the Someone bug. look.js R60+ locks badge color per reaction — change the NAME color even if the badge stays. Execution BEN SWINGS plate is not this slice.
Gate: harness/react-pad.mjs plus harness/cast-ballot.mjs in gates:party.
Red: chip HTML contains Someone for a named seated id; react-who is night-soft with no accent; cast-overlay still a 26 percent full-height plate; paint() rewrites the run frame on a ballot.
If a stated fact is wrong, say so in the report rather than diverging silently.
