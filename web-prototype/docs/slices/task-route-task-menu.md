# Slice: route / task menu (Portrait / Lights choosable jobs)

Borrow from Last House Live. Docs-only. Spec for the choosable expedition / job menu. Do not merge. Grok, not Max.

Second borrow after stickies PR 90. Escape-night win/fold is PR 89 — do not reopen. Guide/runner stays until this menu lands, then a separate replacement slice.

LHL ref: `C:/Users/John/Documents/Codex/2026-09-06/build-the-first-playable-prototype-of/outputs/last-house-live/`
Especially APPROVED-BRIEF.md, README.md, campaign.mjs / engine.mjs route choice, and boards under brief-for-gpt-6-astra-api.

HARD SPEC lock (John, 2026-09-08 borrow list): choosable route / task menu for jobs (Portrait / Lights pattern). Guide/runner HOLD until this lands. Private-heat and KEEP/EXPEL are later separate slices.

---

## Why

Night currently forces a fixed guide/runner expedition. Last House Live lets the living crew choose among routes / tasks (pair + group) before each expedition. Prime Time needs the same choosable job menu so jobs are selected, locked, and launched — without deleting guide/runner yet.

LHL flow that we borrow the *shape* of:

1. Host opens expedition vote.
2. Living players privately pick a route.
3. Host closes (all voted or 30s); tally locks the route (ties → hall / Lights).
4. Players volunteer for stations on that route and confirm.
5. Host locks crew → practice → start expedition.

Both implemented LHL routes stay independently selectable; a route may repeat in early tests. Choosing one does not silently require the other afterward.

---

## Implemented LHL tasks to reference (menu catalog)

### Behind the Portrait (pair / small crew)

- Escape purpose: ancestral portrait + steel backing conceal a maintenance passage.
- Roles: two **pullers** (alternating downward rhythm swipes → shared lifting drum) + **crossers** who crawl under the raised panel + someone on the **far-side catch** to lock the portrait open.
- Ordinary version needs at least three living robots (two pullers + someone to cross). Do not offer an impossible assignment.
- TV shows combined lift / strain / noise / hunter; individual timing stays private.
- Brief poor timing recoverable; sustained miss → slip / metallic knock → hunter closer.
- Sabotage uses the same controls as honest play.

### Keep the Lights On (group)

- Escape purpose: charge the reserve that powers the foyer gate and safety floodlights.
- Every participating robot operates a **generator** (hold to generate, release to cool).
- **Private heat is OUT OF SCOPE in this slice** — borrow only the menu / choice / station-assignment shape, not heat mechanics, forced trips, or floodlight sim.
- Hall route available with one living robot in LHL; portrait needs three. Menu must respect living crew count.

### Future board-only (menu must allow adding later)

Do not implement these now. Catalog entries / stubs only so the menu is extensible:

| id | Name | Notes |
| --- | --- | --- |
| `switchboard` | Switchboard | Future board-only |
| `salvage-bench` | Salvage Bench | Future board-only |
| `carry-the-heart` | Carry the Heart | Future board-only |

LHL supersedes older Hold the Door / independently tilting portrait concepts — do not revive those.

---

## Decisions (numbered)

1. **When the menu appears:** Between jobs / before each expedition — after roles (first expedition) and again after checkpoint result before expedition 2 (LHL shape). In Prime Time night loop: before the current locked expedition launches, between jobs when more than one catalog entry is available.
2. **Who votes / picks:** Living players privately vote a route on phone chrome. Host opens and closes the vote. Missing votes abstain. More votes wins; on a tie prefer the group / Lights-shaped default (mirror LHL: ties choose hall). Host may close after everyone living has voted, or after a short window (~30s).
3. **Lock choice:** Closing the vote locks `selectedRoute` / `selectedJob` for that expedition. Invalid routes for current living-crew count cannot be selected (`availableRoutes` filter by `minimum`). Locked choice is public on TV after close; ballots stay private until close.
4. **TV vs phone chrome:**
   - **TV (`party-host.js`):** route map / job cards, living-crew counts, tally after close, then station roster once volunteers confirm.
   - **Phone (`party-phone.js`):** private route buttons for available routes only; then self-volunteer + confirm for stations on the locked route.
5. **How the selected task launches into current night without deleting guide/runner yet:** Menu + lock + station assignment land first. The selected job id is recorded on the night / mission state. **Guide/runner expedition remains the only playable implementation in this slice** — if Portrait / Lights (or a future stub) is chosen, either (a) still launch the existing guide/runner path with the job id stamped for chrome / logging, or (b) show a "held — guide/runner until replacement slice" brief and continue into current night. Do **not** replace, delete, or gut guide/runner / follow / pin flow here. A later replacement slice swaps the locked job into real Portrait / Lights (and heat) implementations.
6. **Station assignment (menu-adjacent, in scope for shape):** After route lock, players claim their own station only (Portrait: pull-a, pull-b, cross; Lights: generator). Host locks crew when every living robot has volunteered and confirmed. Exact Portrait station capacities mirror LHL (one pull-a, one pull-b, remaining cross).
7. **Extensibility:** Job catalog is data-driven (`id`, `name`, `minimum`, `stations`, `status: implemented | stub | held`). Adding Switchboard / Salvage / Heart later is a catalog row + board, not a menu rewrite.
8. **Out of this PR's product surface:** sticky UI (PR 90), win.js / escape-night fold (PR 89), private-heat, KEEP/EXPEL checkpoint ballot, assimilation chrome, live sit-down.

---

## File ownership

Concrete paths under `web-prototype/`. This docs PR only adds the slice file; ownership below is for the future implementation PR.

| Area | Path |
| --- | --- |
| This slice doc | `web-prototype/docs/slices/task-route-task-menu.md` |
| Job / route catalog + availability | `web-prototype/src/party/jobs.js` |
| Task definitions / station shapes | `web-prototype/src/party/tasks.js` |
| Mission / expedition bind of selected job | `web-prototype/src/party/mission.js` |
| Phase order (route-vote → nominations → practice → play) | `web-prototype/src/party/phases.js` |
| Room / night state for votes + lock | `web-prototype/src/party/room.js` |
| Vote plumbing (if shared with accusation) | `web-prototype/src/party/vote.js` |
| TV route menu + roster chrome | `web-prototype/src/views/party-host.js` |
| Phone route pick + station volunteer | `web-prototype/src/views/party-phone.js` |
| Expedition job harness | `web-prototype/harness/expedition-jobs.mjs` |
| Expedition spec harness | `web-prototype/harness/expedition-spec.mjs` |
| Party night harness | `web-prototype/harness/party-night.mjs` |
| Design refs (read-only) | `web-prototype/docs/design/loop-ui/Expedition.dc.html` |

**Do not edit in the implementation that follows this slice (and not in this docs PR):**

| Keep untouched | Why |
| --- | --- |
| `web-prototype/src/party/win.js` | Escape-night win/fold owned by PR 89 |
| `web-prototype/src/party/follow.js` | Guide/runner HOLD |
| `web-prototype/src/party/guidemap.js` | Guide map HOLD |
| Guide / runner pad + chase paths | Replacement is a later slice |
| Sticky / notesPresented paths | PR 90 |
| Private-heat / generator heat sim | Later slice |
| KEEP / EXPEL checkpoint ballot | Later slice |

---

## Traps

- **Do not kill guide/runner in this PR** (or in the first menu implementation). Menu + choice only; replacement is a follow-up slice after this lands.
- **Do not build private-heat** (forced trips, heat UI, floodlight hunter stall). Lights is catalog + station shape only.
- **Do not change `win.js`** or reopen W1–W6 / escape-night fold.
- **Do not include sticky work** (PR 90).
- **Do not merge** this docs PR. Grok, not Max.
- **Path:** file MUST live at `web-prototype/docs/slices/task-route-task-menu.md` — never `web-prototype/task-route-task-menu.md` at repo root of the prototype (PR 90 had that class of mistake and was fixed).
- Do not offer Portrait when living crew < minimum (3 in LHL). Do not leave the game in an unplayable assignment.
- Do not make choosing Portrait silently require Lights next (or vice versa).
- Do not put KEEP/EXPEL or role spoilers on the route menu chrome.

---

## Verification

Named gate: **`gates:party`**.

Describe (red/green rules for the future implementation harness — not run by this docs PR):

- Menu appears before expedition when ≥1 available job; respects living-crew `minimum` filters.
- Private route votes stay private until host close; tally locks `selectedJob`; tie → Lights/hall-shaped default.
- Invalid route for crew size rejected.
- Station volunteer + confirm required before lock crew; Portrait station capacities enforced.
- Selected job id stamped on night/mission state; guide/runner still launches (held) — follow.js / guidemap unchanged.
- Catalog accepts stub entries (Switchboard, Salvage Bench, Carry the Heart) without enabling play.
- Negative: no writes to `win.js`; no private-heat fields; no sticky note protocol; no KEEP/EXPEL ballot on this menu.

Harness touchpoints: `harness/expedition-jobs.mjs`, `harness/expedition-spec.mjs`, `harness/party-night.mjs` under `gates:party`.

---

## Out of scope

- Guide/runner replacement (HOLD until this menu lands, then separate slice)
- Private-heat / generator heat / floodlight sim
- KEEP / EXPEL checkpoint vote
- Yellow stickies (PR 90)
- Escape-night win/fold (PR 89)
- Assimilation / hunter capture chrome beyond existing night
- Implementing Switchboard / Salvage Bench / Carry the Heart boards
- Merging this PR
