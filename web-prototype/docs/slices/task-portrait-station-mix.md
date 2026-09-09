# Slice: Portrait station mix (force pull-a + pull-b + cross)

rrr-slice. Docs-only. Spec for required station occupancy on Portrait so lean living=3 cannot lock all-cross. Do not merge. Grok, not Max.

Base tip: `b24aa4efe73fdb8ab9d77fdf13dcf648c9ba3c66` (main at open). No playable-night code in this PR.

---

## Why

Critic defect (room **ubxr**, Portrait re-PT on `b24aa4e`):

> route→Portrait PASS; gallery chrome up; no smash — all 3 living assigned CROSS — no pull-a / pull-b → Lift stuck 0%, PULL rhythm never runs, crawl/catch can't prove

Route pick and gallery chrome worked. Station volunteering did not enforce a mix: capacity limits alone allowed every living robot onto `cross`, so alternating pull rhythm never started and lift stayed at 0%. Crawl/catch could not be proven either.

### Current code facts (cite)

- `web-prototype/src/party/tasks.js` — `ROUTE_CAPS.portrait = { 'pull-a': 1, 'pull-b': 1, cross: Infinity }` — **capacity limits only**; does **not** force mix / required occupancy.
- `web-prototype/src/party/portrait.js` — needs **alternating** `pull-a` ↔ `pull-b` for lift; `cross` for crawl/catch.
- Jobs catalog stations for Portrait: `pull-a`, `pull-b`, `cross`; minimum living **3**.

Capacities stay 1 / 1 / ∞. This slice adds **required occupancy**, not new caps.

---

## Decisions (numbered — write as decided)

1. **Force station mix on Portrait** before crew lock / play. Lean living=3 must end with **≥1 pull-a + ≥1 pull-b + ≥1 cross** (any remaining seats may be cross).
2. **Prefer refuse `crewLock`** while `pull-a` or `pull-b` is empty when living ≥ 3; phone chrome highlights empty required stations. **Optional auto-fill:** if vote/timeout and required seats are empty, assign unclaimed living into empty `pull-a` then `pull-b` then `cross` (deterministic seat order).
3. **Capacities stay 1 / 1 / ∞** — this slice adds **required occupancy**, not new caps. Do not change `ROUTE_CAPS` numbers.
4. **Lift rhythm** (alternating pulls) and **crawl/catch** must be reachable on a lean 3-phone sit-down after this lands.
5. **Optional secondary note only** (not blocking this slice): CASTING/WARMING dead-air after route pick looks like a hang — track separately; do **not** expand this PR into that fix unless one short trap line.
6. **Out of scope:** `win.js`, stickies, Lights/heat, KEEP, route auto-open reopen, smash.

---

## File ownership

Concrete paths under `web-prototype/`. This docs PR only adds the slice file; ownership below is for the future implementation PR.

| Area | Path |
| --- | --- |
| This slice doc | `web-prototype/docs/slices/task-portrait-station-mix.md` |
| Route caps / station capacity helpers | `web-prototype/src/party/tasks.js` |
| Crew lock / room gate for required mix | `web-prototype/src/party/room.js` (`crewLock`) |
| Phone station volunteer + empty-required chrome | `web-prototype/src/views/party-phone.js` |
| Portrait consume / lift rhythm / crawl-catch | `web-prototype/src/party/portrait.js` |
| Expedition jobs harness | `web-prototype/harness/expedition-jobs.mjs` |
| Job catalog (stations list, minimum) | `web-prototype/src/party/jobs.js` (read; only if mix validation needs catalog ids) |

**Do not edit in the implementation that follows this slice (and not in this docs PR):**

| Keep untouched | Why |
| --- | --- |
| `web-prototype/src/party/win.js` | Escape-night / win fold out of scope |
| Sticky / notesPresented paths | Stickies out of scope |
| Lights / private-heat | Heat out of scope |
| KEEP / EXPEL | Out of scope |
| Route menu auto-open reopen | Out of scope |
| Smash / furn-smash paths | Out of scope |

---

## Traps

- Capacities are already 1/1/∞ — do **not** "fix" by changing caps; enforce **required occupancy** at volunteer / `crewLock`.
- Do **not** allow lean living=3 to `crewLock` with all-cross (or missing pull-a / pull-b).
- Do **not** expand into CASTING/WARMING dead-air after route pick (track separately; one trap line max if mentioned).
- Do **not** touch `win.js`, stickies, Lights/heat, KEEP, route auto-open, smash.
- Do **not** merge this docs PR. Grok, not Max.
- **Path:** file MUST live at `web-prototype/docs/slices/task-portrait-station-mix.md` under `docs/slices/` — never at prototype root.
- Optional auto-fill must be deterministic: empty required seats fill `pull-a` then `pull-b` then `cross` from unclaimed living in stable seat order.
- Phone chrome must highlight empty **required** stations when living ≥ 3 so players see why lock is refused.

---

## Verification

Named gate: **`gates:party`**.

Describe (red/green rules for the future implementation harness — not run by this docs PR):

1. **3 living cannot `crewLock` all-cross** — refuse lock while `pull-a` or `pull-b` empty when living ≥ 3.
2. **After lock, roster has `pull-a` and `pull-b` occupied** (and ≥1 `cross` on lean 3).
3. **Lift can rise when pulls alternate** — with pull-a and pull-b assigned, alternating pull rhythm is reachable so lift % can leave 0; crawl/catch reachable via cross.

Harness touchpoint: `harness/expedition-jobs.mjs` under `gates:party`.

---

## Out of scope

- `win.js` / escape-night fold
- Yellow stickies
- Lights / private-heat / generator heat
- KEEP / EXPEL
- Route menu auto-open reopen
- Smash / furn-smash
- CASTING/WARMING dead-air after route pick (separate track; not blocking)
- Changing `ROUTE_CAPS` capacity numbers
- Merging this PR
- Any playable-night code in this docs PR
