# Claude Code prompt — runner intel (path toward the guide pin)

Run this from `web-prototype/` with Claude Code **Max**, after John has picked
`/design` boards. Do **not** start from this prompt until those boards exist.

Read `docs/design/runner-intel.md` first. It is the lock.

## How to start

1. `cd` into `web-prototype`
2. `claude`
3. Run **`/design`** for the runner's local senses + the guide bearing pin
   (TV must not grow a path overlay; phone must not grow a map). Several
   options. John picks. Then implement.

## Locked (do not flip)

- Job + local senses.
- Legal: live `room.pathPortals` toward the current guide bearing pin.
- Illegal: authored waypoint lists, `PATROL_ROUTE` copies,
  always-go-gallery-then-chapel, drawing a path on the TV or the runner pad.
- Smash stays gallery painting ep1 / chapel table ep2+ via sledge ray
  (`src/party/mission.js`). Do not invent a third smash.
- D13: phone is a controller, never a viewport. Guide flyover stays private.
- Do not replace `RunnerRoute` in a drive-by. Today's class still picks a
  random room (sightseeing) for standalone / still / undriven follow. The
  replacement is this pass, after boards, and it must keep those three
  fallbacks deterministic.

## Read

- `docs/design/runner-intel.md`
- `docs/design/party-loop.md`
- `src/game/follow-bed.js` — `RunnerRoute`, `missionTick`, smash ray
- `src/game/room.js` — `pathPortals`
- `src/party/mission.js`

## Out of scope this pass

- Hunter take / `HunterAI`
- Recap CAM DARK / `run.camera_lit` (separate wire)
- Last-look C language
- Party-host / party-phone chrome
- Alignment reveal
