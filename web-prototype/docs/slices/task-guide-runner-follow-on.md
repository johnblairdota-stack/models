# Slice: guide/runner follow-on (lift hold; Portrait / Lights play)

Docs-only. Spec that **lifts** the guide/runner hold now that the route/task menu has shipped (PR 95). Do not merge. Grok, not Max. Do **not** implement playable-night code in this PR.

John / CoS GO (2026-09-08): Route/task menu shipped. Guide/runner was held until the menu landed — that hold **lifts via this slice**. Escape win + assimilation, private-heat, KEEP/EXPEL already on tip (`446ad7e`). Stickies still unbuilt — **OUT OF SCOPE**. Game stays idle until this slice is up **and** John greenlights the build.

Supersedes: `docs/slices/task-hold-guide-runner-borrow-later.md` (banner that file; keep body for history).

Related shipped:
- Escape-night win / assimilation — PR 89 family (`task-win-escape-night.md`, `task-assimilation-removal.md`)
- Route/task menu — PR 95 (`task-route-task-menu.md`)
- Private-heat — PR 96 (`task-private-heat.md`, `src/party/heat.js`)
- KEEP/EXPEL — PR 97 (`task-keep-expel.md`)

Optional design fragment (same PR): `docs/design/party-loop-guide-runner-follow-on-2026-09-08.md` — short amendment note for `party-loop.md` (Game may paste later).

---

## Why

The route menu stamps `selectedJob` and still launches **held** guide/runner smash/drill with `HELD_BRIEF` chrome (`jobs.js` status `held` for `portrait` / `lights`). That was correct while the menu was the next borrow. Menu is live. Continuing to fall through to smash/drill when Portrait or Lights is locked is wrong product.

This slice decides the **job-dispatched play** models:

- **Behind the Portrait** — station controllers (pull / crawl / catch) + TV gallery spectacle; hall/mansion threat energy without Guide E + Runner D auto-walk as the job model.
- **Keep the Lights On** — consume existing private-heat (`heat.js`); no pin map / auto-walk / runner follow.

Legacy smash/drill may remain in the tree as unused until a cleanup slice, but must **not** launch for Portrait or Lights.

---

## Decisions (numbered)

1. **Lift the hold.** Catalog status for `portrait` and `lights` becomes `implemented` (not `held`). Remove `HELD_BRIEF` chrome for those ids (TV route brief + phone station pad held lines). Stubs (`switchboard`, `salvage-bench`, `carry-the-heart`) stay `stub` / not offered. `ROUTE_STATUS.HELD` may remain in the enum for future use, but Portrait/Lights must not use it.

2. **Job-dispatched play (not one sofa for every expedition).** After route lock + crew lock, launch play by `selectedJob` id. **Never** fall through to smash/drill when `portrait` or `lights` is selected. If somehow `selectedJob` is missing after the menu (should not happen), **say so in the implementation report** rather than silently launching smash.

3. **Behind the Portrait (`portrait`) — station gallery play.** Keep hall / mansion threat energy. Drop Guide E pin + Runner D auto-walk as the job model for this job.
   - Stations already catalogued: `pull-a`, `pull-b`, `cross` (+ far-side catch as part of cross/catch flow).
   - Phones are **station controllers** (rhythm pull / crawl / catch), not guide-map + runner-stick.
   - TV: shared gallery spectacle — portrait lift, noise, hunter approach. TV is **NOT** a god-map.
   - Escape contribution for this job: catch locked and at least one successful cross under the portrait (match LHL shape).
   - Sabotage uses the **same controls** as honest play (timing fumbles).
   - Sofa pad locks Guide E / Runner D / auto-walk-to-pin / stick dodge **do not apply** to this job's phones.

4. **Keep the Lights On (`lights`) — group job; guide/runner does not apply.**
   - Wire into existing private-heat implementation (PR 96 / `heat.js`): HOLD generate / RELEASE cool, private heat, public output, trip, reserve / gate / floodlights.
   - No pin map, no auto-walk, no runner follow for Lights.
   - Escape contribution: existing Lights success path (reserve/gate) from the private-heat slice — **do not reinvent heat**.

5. **Legacy smash/drill guide/runner.** Retire as the **default** expedition play when a choosable `implemented` job is locked. May remain in codebase as unused legacy until a cleanup slice; **must not** launch for `portrait` / `lights`. Do not delete smash/drill modules in this follow-on build unless a later cleanup slice says so — just stop dispatching to them for those jobs.

6. **What stays from the sofa lock globally.** Living-room TV+phones, assimilation fear, escape win, KEEP/EXPEL between jobs, route menu, private-heat on Lights, hunter as threat on TV for mansion jobs. Guide E / Runner D / TV E / auto-walk / pin paintings only matter if a **future** job reintroduces hall-pair play — **not** for Portrait / Lights.

7. **Supersede** `task-hold-guide-runner-borrow-later.md`. Mark SUPERSEDED by this slice at the top of that file; keep the body for history. Do not delete the hold file.

8. **`party-loop.md` amendment (Game may edit later).** A turn's expedition is the **locked catalog job**, not always "pick a guide/runner pair for halls." Pair-lock may still exist for casting chemistry, but job play is station/group by job id. This docs PR includes a short amendment fragment under `docs/design/`; implementation may paste into `party-loop.md` when building, or Game amends when greenlit.

9. **Out of this PR's product surface.** Stickies (still unbuilt), stub boards (Switchboard / Salvage / Heart), reopening `win.js` / escape fold, inventing new heat, implementing playable Portrait/Lights code in *this* docs PR, merging this PR.

---

## File ownership

Concrete paths under `web-prototype/`. This docs PR only adds/updates slice (+ optional design fragment) files; ownership below is for the **future implementation PR** after John greenlights.

| Area | Path |
| --- | --- |
| This slice doc | `web-prototype/docs/slices/task-guide-runner-follow-on.md` |
| Superseded hold note | `web-prototype/docs/slices/task-hold-guide-runner-borrow-later.md` |
| Optional party-loop amendment fragment | `web-prototype/docs/design/party-loop-guide-runner-follow-on-2026-09-08.md` |
| Job catalog status (`portrait`/`lights` → `implemented`; drop HELD_BRIEF for those) | `web-prototype/src/party/jobs.js` |
| Room / night launch dispatch by `selectedJob` | `web-prototype/src/party/room.js` |
| Mission / expedition bind | `web-prototype/src/party/mission.js` |
| Phase order (practice → job play by id) | `web-prototype/src/party/phases.js` |
| Tasks / station shapes | `web-prototype/src/party/tasks.js` |
| Private-heat consume for Lights | `web-prototype/src/party/heat.js` |
| Portrait station play modules (new or extend under party/) | `web-prototype/src/party/` (portrait / station play — name in impl report) |
| TV host chrome (gallery spectacle / Lights public bars; no god-map; no HELD_BRIEF for implemented) | `web-prototype/src/views/party-host.js` |
| Phone chrome (station controllers / heat HOLD-RELEASE; no Guide E / Runner D for these jobs) | `web-prototype/src/views/party-phone.js` |
| Expedition jobs harness | `web-prototype/harness/expedition-jobs.mjs` |
| Party night harness | `web-prototype/harness/party-night.mjs` |
| Strike hold brief assertions | harness + `jobs.js` `heldBrief` / `routeMenuHtml` / `stationPadHtml` |

**Do not edit in the implementation that follows this slice (and not in this docs PR):**

| Keep untouched | Why |
| --- | --- |
| `web-prototype/src/party/win.js` | Escape-night win/fold already shipped — do not reopen |
| Sticky / `notesPresented` paths | Stickies still unbuilt; separate slice |
| Stub board implementations | Switchboard / Salvage / Heart stay stub |
| Reinventing heat rates / trip cover | Consume PR 96 `heat.js` |
| Deleting smash/drill tree in the first build | Cleanup slice later; just stop dispatching |

---

## Traps

- **Do not fall through to smash/drill** when `selectedJob` is `portrait` or `lights`.
- **Do not keep `HELD_BRIEF`** on Portrait/Lights after status flips to `implemented`.
- **Do not put a god-map on the TV** for Portrait (or Lights). Gallery spectacle + hunter threat only.
- **Do not ship Guide E / Runner D / auto-walk / pin paintings** as Portrait or Lights phone chrome.
- **Do not reinvent heat** for Lights — wire `heat.js` / private-heat success path (reserve/gate).
- **Do not implement stickies** or stub boards in the follow-on build.
- **Do not reopen `win.js`** or change escape-night fold / assimilation fear beat ownership.
- **Do not merge** this docs PR. Grok, not Max. Game waits on John greenlight before code.
- **Path:** new file MUST live at `web-prototype/docs/slices/task-guide-runner-follow-on.md` — never `web-prototype/task-guide-runner-follow-on.md` at the prototype root.
- If `selectedJob` is somehow unset after menu, report it — do not silently launch smash.
- Pair-lock for casting chemistry ≠ hall guide/runner play for every job.

---

## Verification

Named gate: **`gates:party`**.

Describe (red/green rules for the future implementation harness — not run by this docs PR):

- Catalog: `portrait` and `lights` report `status: implemented`; stubs remain stub/not offered.
- After route + crew lock with `selectedJob === 'portrait'`, launch Portrait station play — **not** smash/drill; no Guide E / Runner D / auto-walk pads on phones for that job.
- Portrait escape contribution: catch locked + ≥1 successful cross under the portrait (LHL shape).
- After lock with `selectedJob === 'lights'`, launch Lights via existing heat path — HOLD/RELEASE, private heat phone-only, public output/reserve/gate/floodlights; no pin/auto-walk/runner follow.
- `HELD_BRIEF` absent from TV/phone chrome when selected job is implemented Portrait or Lights.
- Negative: no smash/drill launch for those jobs; no writes to `win.js`; no sticky protocol; stubs still not playable; heat not reinvented.
- Missing `selectedJob` after menu: harness/report surfaces the fault rather than defaulting to smash.

Harness touchpoints: `harness/expedition-jobs.mjs`, `harness/party-night.mjs` under `gates:party`. Strike hold-brief / held-status assertions; add dispatch-by-job assertions.

---

## Out of scope

- Playable-night implementation in **this** docs PR (docs only)
- Yellow stickies (still unbuilt)
- Switchboard / Salvage Bench / Carry the Heart boards
- Reopening `win.js` / escape-night fold
- Reinventing private-heat
- Deleting unused smash/drill modules (cleanup slice later)
- Merging this PR
- Shipping Max / cloud-agent Max for this docs land — Grok only
- Building before John greenlights

If a stated fact is wrong, say so in the report rather than diverging silently.
