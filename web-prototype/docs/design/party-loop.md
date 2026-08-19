# Party loop — locked 2026-08-16

John's direction for the Jackbox pivot. This file is the spec. `docs/design/session-model.md` is the old couch / split-screen / human-hunter note and is **not** this game.

If a line here disagrees with HANDOFF or gameplay-plan, this file wins for the party game. The aimed-dig survival slice in `game.play` stays as the art/physics bed.

## The night

TV/host (computer or tablet on a TV) shows QR codes. Up to 8 phones join via Cloudflare PartyKit. Still Three.js.

Players are robots seated on ornate chairs in a destructible mansion, looking at each other. Some are secretly **evil** (corrupted). The hunter is an **AI** with red eyes, not a human role.

Evil count scales: **1 at 4–5 players, 2 at 6–8**.

Assumed win (change if John says so): goods unlock cameras and catch evil; evil feeds enough goods to the hunter.

## A turn

1. Seated circle on the TV. Phones vote to pick a **pair**.
2. One is the **runner** (first-person, dark corridors, quiet). One is the **guide** (private phone flyover, adapted from `[F]`). The TV is **not** the map.
3. They go complete a **task**: breach a wall or barricaded door (hammer is **automated**; picker aims for `DamageField.channel(0.34, 1.70, 0.30).open` — a walkable doorway, measured at 3 blows. `COLLAPSE.fail` is a different test and must not be the goal; collapse is an allowed side effect), reach a terminal, unlock more **RRR reality-TV cameras**.
4. Those cameras feed **everyone** on the TV. The TV plays the run like a reality show following the runner (will the hunter take them?).
5. If the hunter takes the runner: they are **out for the rest of the game**. They can still **speak in real life** about what they know. No ghost phone UI. The guide cannot be taken (they are not in the halls). Task fails, that terminal's cameras stay dark.

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
- Phone first-person + touch. Private guide flyover.
- TV reality-TV follow camera (limited, produced), not god-view.

## Drop as the verb

Player-aimed sledge. Look stays for running halls.

## Do not

- Put the guide map or hunter path on the TV.
- Treat `session-model.md` as the spec.
- Give evil red eyes (that is the hunter's silhouette). Evil looks like goods unless John changes this.
- Write a ghost UI for taken players.
