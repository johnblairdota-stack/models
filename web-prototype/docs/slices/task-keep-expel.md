# Slice: KEEP/EXPEL between jobs (mid-night checkpoint)

Borrow from Last House Live. Docs-only. Spec for a thin KEEP/EXPEL social checkpoint between expeditions/jobs. Do not merge. Grok, not Max.

Fourth borrow after stickies PR 90 + route menu PR 91 + private-heat PR 92. Escape-night win/fold + assimilation fear beat are PR 89 — do not reopen or touch `win.js`. Assimilation already lives in PR 89 as `task-assimilation-removal.md`; this slice is the **social checkpoint only** — do not rebuild assimilation here.

Killed: 2g1e last-vote as season ending. KEEP/EXPEL is **mid-night**, not the finale. Allegiances reveal at ending only.

LHL ref: `C:/Users/John/Documents/Codex/2026-09-06/build-the-first-playable-prototype-of/outputs/last-house-live/`
Especially APPROVED-BRIEF.md (between-job keep/expel / nominate / private ballot) and night-loop boards under `brief-for-gpt-6-astra-api`.

HARD SPEC lock (John, 2026-09-08): Between expeditions/jobs — thin KEEP/EXPEL checkpoint — nominate a living robot, short defense, private ballot. Strict majority expels; tie keeps. Expulsion removes them from the next job without revealing allegiance. Allegiances reveal at ending only. Clearing every saboteur does NOT end the night/hunter/escape. Assimilation stays as hunter fear beat (separate — PR 89).

---

## Why

Prime Time nights string multiple jobs/expeditions. Without a mid-night social beat, suspicion has nowhere to land until the ending reveal. Last House Live puts a **thin KEEP/EXPEL checkpoint** between jobs: the table nominates one living robot, that player gets a short defense, then everyone casts a **private** KEEP or EXPEL ballot.

This is not a season-ending find-evil lynch (2g1e / last-vote finale is killed). Expelling someone only pulls them out of the **next job** — allegiance stays hidden, the hunter and escape continue, and clearing every saboteur still does not end the night. The ending reveal (and escape-night fold in PR 89) remains the only allegiance dump.

Assimilation (PR 89 `task-assimilation-removal.md`) is the hunter's fear removal beat. KEEP/EXPEL is the players' social checkpoint. Keep them separate.

---

## Decisions (numbered)

1. **When: between jobs / expeditions only.** After a job resolves (success or fail) and before the next job launches (or before the route/task menu selects the next job once PR 91 lands), enter a KEEP/EXPEL checkpoint phase. Not during a live job. Not as the season finale. Not instead of the escape ending.

2. **Nominate one living robot.** Eligible nominees are living seats still in the night (not wrecked / not assimilated / not already expelled from play). One nomination per checkpoint. Exact nominator rules (open floor vs host prompt vs round-robin) may follow existing party vote nomination chrome in `vote.js` / phone UI — but the product rule is: exactly one living nominee, then defense, then ballot.

3. **Short defense.** Nominee gets a brief defense window (chrome + timer). Defense is talk / short phone line — not a mini-game. When the defense timer ends, ballots open. Do not skip defense.

4. **Private ballot: KEEP or EXPEL.** Every living voter (including the nominee, unless an existing party rule already excludes self-votes — if so, say so in the implementation report rather than inventing silence) casts KEEP or EXPEL privately on the phone. Ballots are not shown live on TV as they arrive. Host may show "waiting on N" progress only — never per-seat choices until the tally resolves (or never show individual choices at all if that matches current private-vote chrome).

5. **Strict majority expels; tie keeps.** Count EXPEL vs living voters (or vs votes cast — pick the existing ballot majority helper in `ballot.js` / `vote.js` and use it consistently; say so if the stated rule must map to an existing helper). **Strict majority** of EXPEL → expelled. **Tie or KEEP majority → kept.** No coinflip. No host override in this slice.

6. **Expulsion = out of the next job, no allegiance reveal.** An expelled seat is removed from the upcoming job/expedition roster (cannot play that job on phone). Chrome may say they were EXPELLED / sat out — **never** Production / plant / saboteur / good. Allegiance stays hidden until the ending reveal. Do not flash role colors on expel.

7. **Expedition continues; clearing saboteurs does not end the night.** Expelling every saboteur does **not** end the hunter, the escape, or the night. Same lock as PR 89 assimilation / escape-night: removal is not a shortcut cast win. The sofa hold / hunter / escape path from PR 89 still runs.

8. **Exited / expelled players still share team result at escape ending.** When the night ends, expelled (and assimilated) seats still see the shared team result / allegiance reveal with everyone else — they are not ghosted out of the ending. Mid-night EXPEL is not a secret early reveal.

9. **Chrome lines (host + phone).** TV/host: checkpoint title (KEEP / EXPEL), nominee name/robot, defense timer, ballot waiting count, result line KEEP or EXPELLED. Phone: nominate (when applicable), defense prompt if nominee, private KEEP | EXPEL buttons, result ack. Copy stays social — no "find the plant" / 2g1e framing.

10. **Out of this PR's product surface:** sticky UI (PR 90), route-menu chrome (PR 91), private-heat (PR 92), win.js / escape-night fold (PR 89), rebuilding assimilation (PR 89 `task-assimilation-removal.md`), restoring 2g1e last-vote finale, allegiance mid-night reveals.

---

## File ownership

Concrete paths under `web-prototype/`. This docs PR only adds the slice file; ownership below is for the future implementation PR.

| Area | Path |
| --- | --- |
| This slice doc | `web-prototype/docs/slices/task-keep-expel.md` |
| Phase order (insert between-job checkpoint) | `web-prototype/src/party/phases.js` |
| Vote / nomination flow | `web-prototype/src/party/vote.js` |
| Private ballot / majority tally | `web-prototype/src/party/ballot.js` |
| Room / seat living + expelled-from-next-job flags | `web-prototype/src/party/room.js` |
| Mission / next-job roster exclusion | `web-prototype/src/party/mission.js` |
| TV / host checkpoint chrome | `web-prototype/src/views/party-host.js` |
| Phone nominate / defense / private KEEP\|EXPEL | `web-prototype/src/views/party-phone.js` |
| Party night harness | `web-prototype/harness/party-night.mjs` |
| Related assimilation fear beat (read-only; already in PR 89) | `web-prototype/docs/slices/task-assimilation-removal.md` |

**Do not edit in the implementation that follows this slice (and not in this docs PR):**

| Keep untouched | Why |
| --- | --- |
| `web-prototype/src/party/win.js` | Escape-night win/fold owned by PR 89 — not a KEEP/EXPEL fold |
| Assimilation take / hunter fear paths | PR 89 `task-assimilation-removal.md` — do not rebuild here |
| Sticky / `notesPresented` paths | PR 90 |
| Route-vote menu product | PR 91 (checkpoint sits *between* jobs; menu may precede next job) |
| Private-heat generator fields | PR 92 |
| 2g1e / last-vote season-ending lynch | Killed — do not restore |

Ownership note: phases, vote/ballot, and host/phone chrome — **not** a `win.js` fold. Mid-night checkpoint must not become a win condition.

---

## Traps

- **Do not make KEEP/EXPEL end the season.** Mid-night only. Ending reveal + escape fold stay elsewhere (PR 89).
- **Do not restore 2g1e** or any find-evil last-vote finale framed as KEEP/EXPEL.
- **Do not reveal roles / allegiances** on nominate, defense, ballot, or expel. Ending only.
- **Do not treat "all saboteurs expelled" as night over.** Hunter and escape continue.
- **Do not rebuild assimilation** here — PR 89 already has `task-assimilation-removal.md`. KEEP/EXPEL is the social checkpoint only.
- **Do not touch `win.js`** or reopen W1–W6 / escape-night fold.
- **Do not include sticky work** (PR 90), rebuild the route menu (PR 91), or implement private-heat (PR 92).
- **Do not merge** this docs PR. Grok, not Max.
- **Path:** file MUST live at `web-prototype/docs/slices/task-keep-expel.md` under `docs/slices/` only — never `web-prototype/task-keep-expel.md` at the prototype root.
- Do not show live per-seat ballot choices on TV.
- Do not skip the short defense window.
- Tie keeps — no coinflip to expel.

---

## Verification

Named gate: **`gates:party`**.

Describe (red/green rules for the future implementation harness — not run by this docs PR):

- After a job resolves, checkpoint phase runs before the next job starts.
- Only living (non-wrecked / non-assimilated) seats are nominable; exactly one nominee per checkpoint.
- Defense timer runs; ballots open after defense.
- Phone ballots are private KEEP | EXPEL; host shows waiting count without per-seat choices.
- Strict majority EXPEL → seat flagged out of next job; tie or non-majority → KEEP.
- Expel chrome and snapshots never include allegiance / Production / plant.
- Next job roster excludes expelled seat; night / hunter / escape still running.
- Expelling all saboteurs does not trigger win/fold or end the night.
- Ending still shares team result / allegiance reveal with expelled seats.
- Negative: no writes to `win.js`; no 2g1e finale; no assimilation rebuild; no sticky / route-menu / private-heat product work in this slice's implementation PR beyond consuming between-job timing.

Harness touchpoints: `harness/party-night.mjs` under `gates:party`. Add checkpoint / majority / no-reveal assertions when implementing.

---

## Out of scope

- Assimilation fear beat (already PR 89 `task-assimilation-removal.md`)
- Escape-night win/fold / `win.js` (PR 89)
- Yellow stickies (PR 90)
- Route/task menu product work (PR 91)
- Private-heat sabotage (PR 92)
- Restoring 2g1e / last-vote season ending
- Mid-night allegiance reveals
- Guide/runner replacement
- Merging this PR
- Shipping Max / cloud-agent Max for this docs land — Grok only

If a stated fact is wrong, say so in the report rather than diverging silently.
