# THE DESK — Prime Time production office

An intake board for the Chief of Staff. **Chat is not intake**: work enters as a
card, gets routed to an owner, and is Done only when a backend check against the
real repo passes. Isolated feature — nothing here imports from or edits any game
surface (`src/party/`, `net/party/`, views, harnesses).

```bash
cd web-prototype
npm run desk        # → http://localhost:5199/   (DESK_PORT to change)
npm run desk:test   # node --test — the Done-rule suite
```

## The board

`PITCH → ROUTE (spec · game · art · critic · skills) → VERIFY → ✓ DONE`

- **Done is not a lane.** `POST /api/cards/:id/move {lane:"done"}` returns 400.
  The only path is `POST /api/cards/:id/verify`, which requires an owner, a
  valid route, a registered backend check, and that check **passing**.
- Checks read the repo, not the board: a grep of `docs/design/party-loop.md`,
  a live `import()` of `src/party/show.js`, a spawned harness that must exit 0
  (`checks.mjs`).
- Re-verifying a Done card whose check regressed demotes it back to Verify.
- Card state (lane / route / owner / last verify) persists in `.state.json`
  (gitignored). `cards.json` is the seed; delete `.state.json` to reset.

## Seeded cards (audited 2026-09-02, this worktree)

| Card | Confidence | Routed to | Done means |
|---|---|---|---|
| Camera spec lag — `party-loop.md:41` still sells "Phone first-person + touch" against locked D13 | verified | **spec / Project Lead** | doc drops the line AND cites D13 |
| Verdict on the rail, never airs — `RUNDOWN_BEATS` vs `SHOW_BEATS` (`show.js:16/:26`) | verified | spec / Project Lead | live import: verdict on the wire, or off the rail |
| Smash-target visibility has no gate (CLAUDE.md "Known unguarded") | verified | critic / Play Critic | a smash/target harness gate chained in `gates:party`, on disk, exiting 0 |
| Optimistic host beat strands the TV (`party-host.js:534`, PRIME-TIME-STATE §4) | **hunch** — never reproduced live | unrouted | no check registered yet, so it *cannot* reach Done — by design |

The spec-lag card is a routing, not a fix: spec ownership is Project Lead.
The Desk does not edit `party-loop.md`.
