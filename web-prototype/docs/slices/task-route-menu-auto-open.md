# Slice: route-menu auto-open between casting and send-in

Docs-only. Spec for auto-opening the Portrait/Lights route vote so lean sit-downs reach private-heat without host archaeology. Do not merge. Grok, not Max. No playable-night code in this PR.

Base tip: `0818eee28ac4d76a1992022199dd48154e0e5fe3` (yellow stickies / Prime Time first-use). Follow-on to `task-route-task-menu.md` (menu catalog + ROUTE_VOTE_MS / station volunteer / crew lock). Implementation is a later playable-night PR; this slice locks the product decisions only.

---

## Why

Critic defect (room **f2th**, short-PT on tip `0818eee`):

> routeOpen is host-gated → never opened on lean sit-down
> silent smash fallback when menu never used (room.js `launchSelectedPlay`: no `selectedJob` && !`menuWasUsed` → `smash:true`)
> blocks Portrait/Lights + private-heat
> Host #lock / Send them in never appeared (~70s dead-air then auto expedition)

On a lean 3-phone sit-down the living crew never saw the route vote. Opening was a hidden host verb. When the menu was never used, `launchSelectedPlay` silently fell back to legacy smash/drill. Portrait/Lights never became choosable, private-heat never became reachable, and the table sat through ~70s of dead air before an auto expedition that was not the job they could have picked.

This slice kills that path: **auto-open** the route vote when casting resolves and routes exist; **never** silent-smash when the menu catalog has choosable routes and no `selectedJob` is locked.

---

## Decisions (numbered — build against these, do not relitigate)

1. **Auto-open** the Portrait/Lights route vote between casting complete and pair send-in / expedition launch. Do not require a hidden host verb. Prefer automatic `openRouteVote()` when casting resolves and ≥1 choosable route exists for the living count.

2. Optional **one obvious TV plate** only as a visible backup (big "Pick a route" / auto-open countdown) — not a buried control. Primary path is auto-open.

3. **Kill silent smash fallback when the menu exists.** If `availableRoutes(living).length > 0`, expedition must not launch smash/drill without a locked `selectedJob`. Missing menu / missing `selectedJob` after casting = open or re-open vote (or hard stop with chrome), never silent legacy smash.

4. Keep existing `ROUTE_VOTE_MS` (~30s), tie→Lights, station volunteer + crew lock, then launch by `selectedJob` (portrait stations / lights heat) from follow-on #99. Do not reopen the catalog or tally rules from `task-route-task-menu.md`.

5. Lean 3-phone must be able to pick Lights and feel private-heat without host archaeology.

6. Clarify host gate vs auto: host may still close early / re-open if needed, but **opening is not host-secret**. Auto-open is the primary path; host controls are for recovery and early close, not discovery.

7. Stickies / `win.js` / KEEP / heat mechanics out of scope except that Lights becomes reachable (so later private-heat work can land on a real route pick).

---

## Ownership

| Area | Owner / touch |
| --- | --- |
| Route-vote open timing after casting | `room.js` — call `openRouteVote()` when casting resolves and `availableRoutes(living).length >= 1` |
| Host / TV chrome (backup plate, early close / re-open) | `party-host.js` — one obvious "Pick a route" / countdown plate; no buried `#lock`-only open |
| Phase / show beat between casting and send-in | `phases` / show beat — insert route-vote window before pair send-in / expedition launch |
| Kill silent smash | `room.js` `launchSelectedPlay` — if routes available and no `selectedJob`, open/re-open vote or hard-stop chrome; never `{ smash: true }` from `!menuWasUsed` |
| Harness | `harness/expedition-jobs` / party-night — assert auto-open after casting; assert no smash launch when routes exist without `selectedJob`; Lights reachable on 3 living |

**Not owned this slice (docs only):** playable-night code, stickies presentation, `win.js`, KEEP/EXPEL, private-heat heat meters / floodlights, catalog contents beyond reachability.

---

## Traps

- **Host-secret open returns.** If auto-open is skipped unless a host verb ran first, lean sit-downs regress to f2th dead-air. Opening must not depend on discovering `#lock` / Send them in.
- **Silent smash with menu present.** The Critic MISS: `launchSelectedPlay` with `!selectedJob && !menuWasUsed → smash:true` must die when `availableRoutes(living).length > 0`. Leaving the fallback "just in case" recreates the block on Portrait/Lights + private-heat.
- **Treating backup TV plate as primary.** One obvious plate is fine; a buried control that still requires host archaeology is not. Primary path remains automatic `openRouteVote()`.
- **Re-litigating tally / ROUTE_VOTE_MS / tie→Lights.** Already locked in `task-route-task-menu.md` and follow-on #99 station/crew launch. This slice only changes *when* the vote opens and *forbids* silent smash.
- **Skipping living-count gating.** Auto-open only when ≥1 choosable route exists for current living count (portrait needs enough living; Lights may be available sooner). Do not offer impossible assignments.
- **Coupling heat mechanics.** Making Lights reachable is in scope; implementing private-heat meters / forced trips is not.

---

## Verification (`gates:party`)

Implementing PR must keep / add `gates:party` coverage that reddens on:

1. **Auto-open after casting** — when casting resolves and `availableRoutes(living).length >= 1`, route vote is open without a prior host open verb.
2. **No smash when routes available without `selectedJob`** — `launchSelectedPlay` (or equivalent) must not emit smash/drill launch if routes exist and no locked `selectedJob`; must open/re-open vote or hard-stop with chrome.
3. **Lights reachable on 3 living** — lean 3-phone sit-down can select Lights (and thus become eligible for private-heat follow-on) without host archaeology.

Suggested harness homes: `harness/expedition-jobs`, party-night / party-host route-vote cases. Negative control: restore silent-smash branch and expect red.

---

## Out of scope

- Playable-night code in this PR (docs-only; do not merge from this branch as night)
- Yellow stickies presentation / peel
- `win.js` / escape-night / KEEP / EXPEL
- Private-heat heat meters, forced trips, floodlight sim (except: Lights must be reachable so heat can attach later)
- Guide/runner replacement
- Catalog redesign, new routes, ROUTE_VOTE_MS / tie→Lights / station volunteer / crew-lock rule changes (owned by `task-route-task-menu.md` + follow-on #99)
- Merging this PR into a playable night without a separate implementation PR

---

## Done when

- This slice is merged as docs under `web-prototype/docs/slices/task-route-menu-auto-open.md`.
- A follow-on implementation PR cites these seven decisions and turns the three verification bullets green under `gates:party`.
- Lean 3-phone Critic path (f2th-class) can auto-open Portrait/Lights and cannot silent-smash past a missing `selectedJob` when routes exist.
