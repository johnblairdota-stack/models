# Slice: private-heat sabotage (honest-struggle cover)

Borrow from Last House Live. Docs-only. Spec for private-cost / private-heat on a group job so sabotage looks like honest struggle. Do not merge. Grok, not Max.

Third borrow after stickies PR 90 + route menu PR 91. Escape-night win/fold is PR 89 — do not reopen or touch `win.js`. Guide/runner stays held; private-heat attaches to a group job shape once the route menu exists. KEEP/EXPEL is a later separate slice.

LHL ref: `C:/Users/John/Documents/Codex/2026-09-06/build-the-first-playable-prototype-of/outputs/last-house-live/`
Especially APPROVED-BRIEF.md (Keep the Lights On), README.md generator section, `campaign.mjs` heat/trip/reserve tick, and boards under `brief-for-gpt-6-astra-api` (main-hall charging / two people let go).

HARD SPEC lock (John, 2026-09-08 borrow list): private-heat (or equivalent private-cost) sabotage that looks like honest struggle. **NOT** a win rewrite. Stickies = PR 90, route menu = PR 91 — out of scope here.

---

## Why

Goods need a group job where everyone contributes public output, but each seat carries a **private** cost (heat). Without private heat, a saboteur who drops output is obviously idle. With private heat, releasing looks like cooling — the cover is "mine was about to overheat."

Last House Live Keep the Lights On is the reference shape:

- Every participating robot runs a **generator**.
- **HOLD TO CHARGE / GENERATE** produces power and accumulates private heat; **RELEASE TO COOL** drops heat.
- Private heat at 100% forces a multi-second trip (station offline while cooling).
- TV shows combined **output** bars and shared **reserve / gate / floodlights** — not per-seat heat.
- Phone shows the private heat dial + hold control.
- Sabotage: wait for a teammate's announced cooling break, release too, claim urgent heat; resume first and appear to lead recovery. Receipts players notice later: two outputs dropped together; heat stayed private.

Prime Time borrows that deniable fumble for a group job once the choosable route/task menu (PR 91) can select a Lights-shaped (or equivalent private-cost) job. This slice does **not** replace guide/runner and does **not** implement the menu.

---

## Decisions (numbered)

1. **Heat is private per seat.** Authoritative `heat` (0..1) lives on the seat / actor. Only that seat's phone snapshot includes `heat` and `tripLeft`. Host / peer / TV public snapshots never include another player's heat. Allegiance stays hidden; heat is not a role tell.

2. **Public sees output / progress, not heat.** TV chrome shows per-station **output** (generating or not), combined power vs needed, shared **reserve**, **gateOpen**, **floodlit**, hunter pressure. Progress bars and who is holding are public. The private heat dial is phone-only.

3. **Controls: HOLD TO CHARGE / RELEASE TO COOL.** While holding generate (and not tripped), heat rises and the seat contributes to public power. On release, heat falls and that seat's output drops. Mirror LHL labels in chrome (`GENERATE` / cool on release); Prime Time may say CHARGE if copy already uses that word — same mechanic.

4. **Forced trip on overheat.** When `heat >= 1`, set a forced trip window (~4.5s in LHL: `tripUntil = gameMs + 4500`), clear generating, and show private feedback ("Generator tripped — cooling…"). During trip the seat cannot contribute output. Trip is caused by the same heat meter honest players manage — saboteurs can ride it as cover, goods must manage it as cost.

5. **Saboteur can drop output under cover of cooling.** Deliberate release (or riding a trip) uses the **same controls** as honest play. Cover line: "mine was about to overheat." No special saboteur input, no public "sabotage" flag, no heat broadcast that would prove the lie. Social read comes from timing (who released with whom) and later receipts — not from a UI tell.

6. **Goods must coordinate breaks.** Cooling is required; uncoordinated releases collapse combined output, fade floodlights, and let the hunter advance. Coordinated staggered breaks keep power above the sufficiency threshold while individuals cool. Implementation should make staggered cool-downs viable and simultaneous multi-drops costly (shared reserve drain / hunter advance) so the social puzzle is real.

7. **Shared reserve / gate / floodlights (group job outcomes).** Enough combined generating seats charge a shared reserve and hold floodlights (hunter stalls where it stands — does not retreat). Full reserve opens the gate so seats can leave generators and cross. A player may keep generating to buy slower teammates time. No permanent volunteer sacrifice. Exact rates are tuneable; the public/private split and trip cover are not.

8. **Attaches to group job shape after route menu.** This mechanic binds to a Lights / hall / generator-shaped catalog job (see PR 91 `jobs.js` / station `generator`). Do **not** delete or replace guide/runner / follow / pin in this slice. Until the menu + Lights implementation lands, heat fields may exist behind a job id / feature flag / harness-only path, but live night still launches held guide/runner.

9. **Receipts (playtest / social, not chrome spoilers).** After a suspicious multi-drop, players may remember: two outputs fell together; nobody else's heat was visible. Do not add a public "heat history" panel that spoils private cost. Optional private self-log is fine; public blame UI is out.

10. **Out of this PR's product surface:** sticky UI (PR 90), route-menu chrome beyond acknowledging dependency (PR 91), win.js / escape-night fold (PR 89), KEEP/EXPEL checkpoint ballot, assimilation chrome, guide/runner replacement, Portrait rhythm sabotage (separate if ever sliced).

---

## File ownership

Concrete paths under `web-prototype/`. This docs PR only adds the slice file; ownership below is for the future implementation PR.

| Area | Path |
| --- | --- |
| This slice doc | `web-prototype/docs/slices/task-private-heat.md` |
| Job / route catalog (Lights / hall generator job) | `web-prototype/src/party/jobs.js` |
| Task / station definitions (generator station) | `web-prototype/src/party/tasks.js` |
| Mission / expedition bind + reserve/gate state | `web-prototype/src/party/mission.js` |
| Phase order (practice → play heat tick) | `web-prototype/src/party/phases.js` |
| Room / seat heat + tripUntil + generating | `web-prototype/src/party/room.js` |
| TV public output / reserve / floodlight chrome | `web-prototype/src/views/party-host.js` |
| Phone HOLD/RELEASE + private heat dial | `web-prototype/src/views/party-phone.js` |
| Expedition job harness | `web-prototype/harness/expedition-jobs.mjs` |
| Expedition spec harness | `web-prototype/harness/expedition-spec.mjs` |
| Party night harness | `web-prototype/harness/party-night.mjs` |
| Design refs (read-only LHL boards / notes) | `web-prototype/docs/design/` (as present); LHL sandbox boards stay outside the tree |

**Do not edit in the implementation that follows this slice (and not in this docs PR):**

| Keep untouched | Why |
| --- | --- |
| `web-prototype/src/party/win.js` | Escape-night win/fold owned by PR 89 |
| `web-prototype/src/party/follow.js` | Guide/runner HOLD |
| `web-prototype/src/party/guidemap.js` | Guide map HOLD |
| Guide / runner pad + chase paths | Replacement is a later slice after menu |
| Sticky / `notesPresented` paths | PR 90 |
| Route-vote menu chrome as its own product | PR 91 (consume selected job id only) |
| KEEP / EXPEL checkpoint ballot | Later slice |

---

## Traps

- **Do not publish heat on TV or peer snapshots.** Output/progress only. Leaking heat kills the honest-struggle cover.
- **Do not add a saboteur-only control.** Same HOLD/RELEASE as goods; deniability is the point.
- **Do not skip forced trip.** Overheat must trip the station or private cost is fake and saboteurs have no credible cover story.
- **Do not replace guide/runner here.** Heat attaches to a group job once route menu selects it; live path stays held until that replacement slice.
- **Do not touch `win.js`** or reopen W1–W6 / escape-night fold (PR 89).
- **Do not include sticky work** (PR 90) or rebuild the route menu (PR 91).
- **Do not implement KEEP/EXPEL** in this slice.
- **Do not merge** this docs PR. Grok, not Max.
- **Path:** file MUST live at `web-prototype/docs/slices/task-private-heat.md` — never `web-prototype/task-private-heat.md` at the prototype root (PR 90 had that class of mistake and was fixed).
- Do not require a permanent volunteer sacrifice on the gate cross.
- Do not push the hunter backward when floodlights restore — stall in place (LHL).
- Do not treat connection delay / reconnect grace as evidence of deliberate release (LHL: freeze heat/holds during grace; fresh press after).

---

## Verification

Named gate: **`gates:party`**.

Describe (red/green rules for the future implementation harness — not run by this docs PR):

- While holding generate and not tripped: heat rises; seat counts toward public power.
- On release: heat falls; that seat's public output drops; heat value absent from host/peer snapshots.
- `heat >= 1` → forced trip (~4.5s); generating cleared; no output until trip ends.
- Phone snapshot includes own `heat` / `tripLeft`; TV shows output bars + reserve/gate/floodlit only.
- Saboteur (or any seat) can release without a special action; simultaneous multi-release can drop power below sufficiency (floodlights fade / hunter may advance).
- Reserve charges when combined output sufficient; at full reserve gate opens; seats may leave generators and cross; no mandatory sacrifice.
- Negative: no writes to `win.js`; no sticky note protocol; no KEEP/EXPEL ballot; follow.js / guidemap unchanged; heat never appears on public snapshots.

Harness touchpoints: `harness/expedition-jobs.mjs`, `harness/expedition-spec.mjs`, `harness/party-night.mjs` under `gates:party`. Mirror LHL VERIFICATION private-heat / trip / floodlight stall cases where practical.

---

## Out of scope

- Guide/runner replacement (HOLD; menu PR 91 first, then replacement slice)
- Route/task menu product work (PR 91 — dependency only)
- Yellow stickies (PR 90)
- Escape-night win/fold / `win.js` (PR 89)
- KEEP / EXPEL checkpoint vote
- Portrait rhythm / puller sabotage (different private-cost if ever sliced)
- Implementing Switchboard / Salvage Bench / Carry the Heart
- Merging this PR
- Shipping Max / cloud-agent Max for this docs land — Grok only
