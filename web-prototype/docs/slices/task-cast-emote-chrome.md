# Slice: casting votes fade like emotes (CAST8 redelivery)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `ec50862` (PR 74 merge). Spec, not the night. **Grok, not Max. Do not merge.**
Game waits on this docs PR. Treat PR 74 as **failed delivery**, not a new look.

CAST8 sat on `ec50862` after 74 claimed the casting plate was gone. The casting plate
still hogs the TV. Small fading popups like emotes. Not a 26 percent column.

Quote CAST8: "The cast wins. The Reunion is next." W5 stays gone. 2g1e last vote stays.

Do not invent a camera. Do not put votes on the mansion follow.

Verified on `ec50862`:

- `party-host.js` still calls `castOverlay()`; `look.js` `.cast-overlay` is still the
  full-height 26 percent column. Kill that hog. Keep lamps / castBoard if they are not
  the hog.
- `paintReactStrip` writes `react-who` with `joinedName(..., Someone)`. `names =
  mergePublicNames(client.lobby, client.links.pairs)`. Other paints use
  `mergePublicNames(client.frame.players, client.lobby)`. That mismatch is the Someone
  hole.
- `night-skin.js` `.react-who` color is `--night-soft`. `seatLook.accent` is already
  on the lobby and seatChip. Name color = that accent. Four reaction pictures stay
  distinct (R50/R60).
- `react.js`: reactions are PUBLIC and ATTRIBUTED. `REACT_HOLD_MS = 10000`. Vote
  popups use the same hold/fade class, not a second plate.

---

## 0. Why this slice exists

Casting slips still sit as a plate and eat the ballroom on CAST8. 74 shipped an emote
claim; CAST8 still saw the hog. Emote chips already have a name slot but it prints
Someone, and the name is night-soft instead of the player accent.

---

## 1. File ownership

You may edit: `docs/slices/task-cast-emote-chrome.md` ; `src/views/party-host.js` (real
player name, never Someone when seated; color from `seatLook.accent`; replace slips
column with fading popups patched in place like R42c); `src/party/night-skin.js`
(`react-who` uses accent; vote-popup reuses `react-float`; kill the full-height
cast-overlay column); `src/party/look.js` (update the colours-are-FIXED comment so it
does not fight this lock); `harness/react-pad.mjs` and `harness/cast-ballot.mjs` (and
talk-frames if it measures overlay width).
`cast-ui.js` only if `mergePublicNames` is why Someone wins.

Do not edit: `follow.js` cameras. `win.js`. execute-hit. Phone Watch pad CLAP/BOO/SUS/SHOCK
buttons. Live 5178/5181. Execution BEN SWINGS plate is not this slice. Do not restore W5.

---

## 2. The lock

1. Casting votes appear as small popup text that fades like emotes. Not a full-screen
   plate. Not a 26 percent column of slips.
2. A vote popup names the voter and the two picks, then fades (`REACT_HOLD_MS`). Spam
   stacks like emotes (cap recency).
3. Emote chips show the player's joined name under the face, never Someone when that
   player is seated.
4. Emote name (and chip tint) matches that player's name color (lobby accent / nameplate).
   Four reaction pictures stay distinct.
5. Do not invent a camera. Do not put votes on the mansion follow.

---

## 3. Traps and verification

`paint()` innerHTML restarts `react-float` (R42c). `mergePublicNames` argument order is
the Someone bug. `look.js` R60+ locks badge color per reaction — change the NAME color
even if the badge stays. Execution BEN SWINGS plate is not this slice.
Gate: `harness/react-pad.mjs` plus `harness/cast-ballot.mjs` in `gates:party`.
Red: chip HTML contains Someone for a named seated id; `react-who` is night-soft with no
accent; `.cast-overlay` still a 26 percent full-height plate on a CAST8-class casting
beat; `paint()` rewrites the run frame on a ballot.
If a stated fact is wrong, say so in the report rather than diverging silently.
