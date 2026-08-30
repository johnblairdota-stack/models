# Runner intel — locked until John picks `/design` boards

Job + local senses. This is the lock. Do **not** rewrite `RunnerRoute` until John
picks Claude `/design` boards. The prompt for that pass is
`PROMPT-claude-runner-intel.md`.

## What the runner is doing today

`RunnerRoute` in `src/game/follow-bed.js` is **sightseeing**. It picks a random
room big enough to walk into, then walks `room.pathPortals` to a point inside
it. That is a fallback for a standalone follow, `?still=1`, and a phone that
has not picked up yet. It is not the expedition job.

Smash is already the job, and it is not a route:

- Episode 1 — gallery **painting**, sledge ray (`swingHitObject` on the hung plane).
- Episode 2+ — chapel **round table**, same ray / `applyHit` on `table-round`.

Home is the ballroom. `mission.phase` is `seek` → `return` (smash landed) →
`done` (runner inside the ballroom). The server ends the run on `done`.

## Legal

- Live `room.pathPortals` toward the **current guide bearing pin**. The house
  graph is the authority. Doorways that are open *now* are the only waypoints.
- Local senses: what the runner can see and hear from here, what the guide
  just pinned, which doorway is in front of the stick.
- Smash target from `mission.js` (`missionFor(episode)`). Not a second list.

## Illegal

- Authored waypoint lists. A night that always walks the same corridor is a
  script, not a house.
- `PATROL_ROUTE` copies. That is the hunter token's beat, not the runner's.
- Always-go-gallery-then-chapel as a hardcoded path. The rooms move. The
  smash target is a room *type* plus a live portal walk, not a tour.
- Drawing a path on the TV or the runner pad. D13: the phone is a controller,
  never a viewport. The TV is not the map. The guide's flyover stays private.

## What waits

Replacing `RunnerRoute` so a driven runner walks portals toward the guide pin
(and the smash room) instead of sightseeing. That is a `/design` pick, then
code. This file does not author that route.
