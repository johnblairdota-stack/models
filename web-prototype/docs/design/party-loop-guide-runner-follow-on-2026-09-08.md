# party-loop amendment fragment — guide/runner follow-on (2026-09-08)

Docs fragment for Game to paste into `docs/design/party-loop.md` when amending (or when the implementation PR lands). Not a full rewrite of `party-loop.md`.

## Amendment (locked catalog job = the expedition)

**Was (sofa turn shape):** phones vote a **pair**; one **runner** in the halls, one **guide** with private map; they complete a hall task (smash/drill energy); TV follows the runner.

**Now (after route menu + this follow-on):** A turn's expedition is the **locked catalog job** (`selectedJob` from the route/task menu), not always "pick a guide/runner pair for halls."

- **Pair-lock** may still exist for casting chemistry / who is on the job.
- **Job play is station/group by job id:**
  - `portrait` — station controllers (pull-a / pull-b / cross+catch); TV gallery spectacle; no Guide E / Runner D auto-walk as the job model.
  - `lights` — group generators via existing private-heat; no pin map / auto-walk / runner follow.
- Legacy smash/drill guide/runner is **not** the default launch when an implemented choosable job is locked.

## Still true globally

Living-room TV+phones, assimilation fear, escape win, KEEP/EXPEL between jobs, route menu, private-heat on Lights, hunter as threat on TV for mansion jobs.

Guide E / Runner D / TV E / auto-walk / pin paintings only if a **future** job reintroduces hall-pair play — not for Portrait/Lights.

See: `docs/slices/task-guide-runner-follow-on.md`.
