# Party loop — locked 2026-08-16

John's direction for the Jackbox pivot. This file is the spec. `docs/design/session-model.md` is the old couch / split-screen / human-hunter note and is **not** this game.

If a line here disagrees with HANDOFF or gameplay-plan, this file wins for the party game. The aimed-dig survival slice in `game.play` stays as the art/physics bed.

## The night

TV/host (computer or tablet on a TV) shows QR codes. Up to 8 phones join via Cloudflare PartyKit. Still Three.js.

Players are robots seated on ornate chairs in a destructible mansion, looking at each other. Some are secretly **evil** (corrupted). The hunter is an **AI** with red eyes, not a human role.

Evil count scales: **1 at 4–5 players, 2 at 6–8**.

## Win / fold (locked 2026-09-08)

Adopt Last House Live's ending shape into RRR. Not a full LHL port.

### Win
- Good team wins if **at least one good robot escapes** by the end of the night.
- Saboteurs / evils win if **no good robot escapes**.
- Captured or expelled players still share their team's result.
- Clearing every saboteur does **not** end the night; the hunter remains dangerous until escape resolves.
- Allegiances reveal at the **ending**, not after each death or expulsion.

### Fear / removal
- **Assimilation stays** as the hunter's fear beat: taken robots are consumed into the hunter (embedded face), permanent for that night, no ghost powers. Speaks IRL only.
- Between expeditions / jobs: thin **KEEP / EXPEL** checkpoint — nominate a living robot, short defense, private ballot. Strict majority expels; tie keeps. Expulsion removes them from the next job without revealing allegiance.

### Still steal (mechanics, not win rewrite)
- Peelable yellow stickies (one-shot per session)
- Choosable route / task menu for jobs
- Private-heat (or equivalent private-cost) sabotage that looks like honest struggle

### Dies (do not build / do not keep as win)
- **Cameras-as-info** as the season goal (unlock cameras to catch evil)
- **W1–W4** as the win ladder
- **2g1e / find-the-evil** as the primary win fold

Guide/runner hall energy and living-room TV+phones stay. Spec rewrite owns how escape maps onto the existing night loop.

~~Struck 2026-09-08:~~ cameras-as-info win / catch-evil / feed-hunter season fold. See `docs/slices/task-win-escape-night.md`.

## A turn

1. Seated circle on the TV. Phones vote to pick a **pair**.
2. One is the **runner** (the one body in the dark corridors, quiet — aired on the TV as a produced follow; **amended 2026-09-02**, the picture was never built first-person). One is the **guide** (private phone map; **amended 2026-09-01** from the `[F]` flyover to Guide E "Neighbours Only" — her runner's room plus the door-joined neighbours). The TV is **not** the map.
3. They go complete a **task**: breach a wall or barricaded door (hammer is **automated**; picker aims for `DamageField.channel(0.34, 1.70, 0.30).open` — a walkable doorway, measured at 3 blows. `COLLAPSE.fail` is a different test and must not be the goal; collapse is an allowed side effect), reach a terminal, complete the job (cameras may still air as spectacle; ~~cameras-as-score struck 2026-09-08~~).
4. The TV plays the run like a reality show following the runner (will the hunter assimilate them?). Camera feeds may still air as spectacle; they are **not** the season score.
5. If the hunter **assimilates** the runner: they are consumed into the hunter (embedded face), **out for the rest of the night**, no ghost powers. They can still **speak in real life**. No ghost phone UI. The guide cannot be taken (they are not in the halls). Task fails. ~~Cameras-as-score struck 2026-09-08~~ — escape is the night ender, not camera unlocks.

Both-partners-running is a later A/B, not the first playable.

## Keep from the prototype

- `DamageField` + `support.js` collapse. New work is a **picker** that aims the existing sledge at the shallowest cell in a 0.80 m-wide window, y in [0, 1.95], so `channel().open` goes true. Measured: 3 blows. Do not pick for `COLLAPSE.fail`. Do not reuse hunter `_bang` (that is stage HP, not the grid).
- `HunterAI` + `NoiseBus` (quiet good / loud evil).
- `?plan=gen` hallway generator (`genplan.js` / `genspike.mjs`).
- Estate art and materials.
- `rules.js` + `RunState` snapshot idea.

## Build new

- PartyKit rooms. Current `net/server.mjs` is a 6×3 demo wall, never wired into `game.play`.
- QR join, host vs phone views, lobby, 8-cap, reconnect.
- Seated circle of 8 ornate chairs (current `chairRow` is wall-lining showcase only).
- Roles, voting, partner pick, terminals, camera unlocks.
- ~~Phone first-person + touch. Private guide flyover.~~ **Overridden by D13** (ratified 2026-08-19;
  struck 2026-09-02 so the bible's quote of this line still lands): the phone is a controller, never a
  viewport — the runner's camera lives on the TV as a produced follow, and since 2026-09-01 the guide's
  map is Guide E "Neighbours Only", not a flyover.
- TV reality-TV follow camera (limited, produced), not god-view. **Amended 2026-08-28:** the
  expedition is played top-down with the roof off over the runner's OWN rooms only — "not
  god-view" now means never the whole house at once, rather than never overhead. See
  `docs/slices/task-topdown-expedition.md`.

## Drop as the verb

Player-aimed sledge. Look stays for running halls.

## Do not

- Put the guide map or hunter path on the TV. (Still absolute. The top-down the expedition is
  played in is a tight follow over the runner — it carries no marks, no route and no whole-house
  fit, so it is not the map.)
- Treat `session-model.md` as the spec.
- Give evil red eyes (that is the hunter's silhouette). Evil looks like goods unless John changes this.
- Write a ghost UI for taken players.
- Treat cameras-as-info, W1–W4, or 2g1e/find-the-evil as the win fold (killed 2026-09-08).
