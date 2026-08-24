# Refs loop redesign — artboard notes

**Locked direction: B — Rundown Rail.** Claude Code `/design` chose B. This file is what shipped against the three artboards (expedition chrome, lobby, debrief).

## The idea

The shooting schedule sits across the **top of the TV all night**. `phases.js` / live SHOW beats **are** the schedule — the rail draws that file, it does not invent a second table.

- Current beat is lit.
- Its bar **drains** with `show.until` when the server published a deadline.
- **Expedition / chase** (`party-follow` run stage) shrinks the rail to a **~22px ribbon** so the picture stays king.
- **Lobby + talk** (Debrief / Reckoning / Vote / Execution) open the labels.

## What the artboards asked for

| Surface | Artboard | Rail |
|---|---|---|
| Lobby | PRE-SHOW · LOBBY, dim schedule under the mast, join code + seats | Expanded. Lobby is the first item (the lobby artboard omitted it; the brief put it first). |
| Expedition | Compact ribbon over the chase, PRIME TIME · ON AIR, clock, lower-thirds | Ribbon. Host mast + 22px rail; follow overlay still owns REC / nameplate / CAM 01. |
| Debrief | Expanded labels, DEBRIEF boxed in orange, drain on the current segment | Expanded. Same builder as lobby / reckoning / vote / execution. |

Palette stays night-skin tokens (`--night-accent` amber is show dressing). Guide map never on the TV.

## What shipped

Shared chrome, next to the PR #35 plates:

- `show.js` — `RUNDOWN_BEATS` = `lobby` + `EPISODE_ORDER` (casting → verdict). `rundownRibbon()`, `railDrainPct()`.
- `look.js` — `rundownRailHtml()` + rail rules inside `SHOW_CHROME_CSS`.
- `party-host.js` — mast (PRIME TIME · ON AIR · episode · clock) + rail on **every** TV beat: lobby, casting, expedition, recap, debrief, reckoning, vote, execution.
- Clock tick patches `[data-rail-drain]` the same way it patches `[data-show-clock]`.
- `remainingMs(null)` still prints **no** fake 0s clock; no until → current segment stays full.

Verdict is on the rail as a **stub** (not a live `SHOW_BEATS` value yet). Reunion is session-end and stays off the episode rail until that product exists.

## Before / after

**Before:** the TV mast said the current SHOW beat in a corner strap (`EXPEDITION · episode 2`). Talk beats had a countdown plate. Nothing showed where the night was going.

**After:** the same strap sits on a schedule the sofa can read. Expedition gives the picture back (ribbon). Talk beats open the labels. Drain is the server deadline, not a second clock.

## Out of scope (still true)

Phone redesign. `playEpisode` double-clock. CAUGHT. Casting depth. Confessionals. `win.js`. PREMIERE / REUNION as full product. Mansion / Meshy. Guide map on the TV.
