# Claude Code prompt — Prime Time loop visual redesign

Run this from `web-prototype/` with Claude Code **Max**, after `claude update` so `/design` is available (needs ≥ 2.1.234; machine has 2.1.240+).

## How to start

1. `cd C:\Users\John\Documents\models\web-prototype`
2. `claude`
3. Paste everything below the line (or: `claude "$(Get-Content -Raw docs\design\PROMPT-claude-loop-redesign.md)"` if you prefer print mode — interactive is better for `/design`).

---

You are redesigning the **Prime Time** Jackbox-style party UI for Run Robot Run.

## Mandatory first move

Run the slash command **`/design`** (Claude Code research preview artboards). Do **not** jump straight to implementing CSS/JS. Generate editable artboards first, pick directions with me, then implement.

Suggested first `/design` calls (run as separate `/design` turns, several options each):

1. `/design` a few options for the **TV host** reality-show chrome across the night: Lobby (QR + seated circle), Casting ballot board, Expedition lower-thirds (name / LIVE / cam / countdown), Recap card (minimized over ballroom), Debrief (timer + seated robots), Reckoning (standing noms), Vote tally, Execution (face-down plate), Verdict (RENEWED/CANCELLED), Reunion roll call. 16:9 TV, 10-foot readable.
2. `/design` a few options for the **phone pad** sheets (≈390×844): Join, Role card hold-to-peek, Casting two-tap ballot, Runner dual-stick, Guide private map, Spectator react, Nominate list, Lynch vote (no self), Debrief/Reckoning clocks.
3. `/design` a few options for a **single cohesive show identity** system: type, color tokens, REC/cam badges, countdown, nameplates — that unifies TV + phone without making phones look like a shrunk TV.

After artboards: save chosen boards into `docs/design/refs-loop-redesign/artboards/` (or Claude Design export), then implement into `src/party/night-skin.js` + `party-host.js` / `party-phone.js` chrome only. Do not invent CAUGHT logic or rewrite chase math in this pass unless I ask.

## Read first (rules & current state)

- `docs/design/prime-time-loop-redesign-plan.md` — build plan / gaps
- `docs/design/party-loop.md` — expedition rules
- Repo root / `docs/design/rrr-social-round.md` if present — social round §1–§4
- `STYLE_CONTRACT.md` — robot palette (9 colours)
- `src/party/phases.js` + `src/party/show.js` — shooting schedule / SHOW beats
- `src/party/night-skin.js` — current chrome CSS

## Reference screenshots (current product — study these)

Open and look at every PNG in `docs/design/refs-loop-redesign/` (see that folder's README). Especially the **live RECAP trio** (15-tv-recap-live.png, 16-phone-recap-john.png, 17-phone-recap-ellie.png) — that is today's post-smash UI — then:

- `11-tv-run-chrome.png` — current TV lower-thirds / RRR CAM
- `06-tv-chase.png`, `05-tv-late-run.png` — expedition TV
- `10-tv-recap.png` — intros/recap chrome
- `01-tv-lobby.png` — lobby
- `12-phone-runner-pad.png`, `07-phone-runner-chase.png` — runner
- `13-phone-guide-map.png`, `08-phone-guide-chase.png` — guide
- `14-phone-role-card.png` — role card
- `09-phone-join.png` — join

External lookrefs (mood only, do not clone IP): Jackbox host/phone split, Traitors / Big Brother lower-thirds, Among Us meeting panel density.

## Design problems to solve

Current UI reads as **dev chrome on a 3D view**, not a broadcast. Fix:

1. Hierarchy — one clear focal (3D or ballot), chrome supports it
2. Phase literacy — anyone walking in knows beat + time left in 1 glance
3. Phone thumb zone — primary actions in lower half; no tiny links
4. Asymmetry — guide map never appears on TV; evil never leaks on plates
5. Continuity — same type/badge language from Lobby → Reunion
6. Missing beats need artboards even if code is thin: Verdict, Reunion, CAUGHT slate, Confessional pitch, Refuse-the-chair

## Locked product decisions (do not flip)

- TV = produced reality follow; phones = pads
- Guide flyover private; TV is not the map
- Deaths do not reveal alignment until Reunion
- Lynch: living-majority, no self-nom, no self-vote, nominator swings
- Live SHOW includes lynching after debrief (including ep1 for playtests)
- Smash → home to ballroom ends expedition (not a silent short timer)

## Deliverables

1. `/design` artboards (several options) for TV + phone systems above
2. Short written pick rationale (which board, why)
3. Token table (type sizes, colours mapped to STYLE_CONTRACT + show orange)
4. Implementation PR touching night-skin + host/phone chrome to match the chosen boards for **Lobby, Expedition lower-thirds, Debrief/Reckoning/Vote** first (highest playtest leverage)
5. Update `docs/design/prime-time-loop-redesign-plan.md` with “chosen direction” notes

## Out of scope this pass

Rewriting PartyKit protocol, dual-stick chase math, mansion generation, Meshy pipelines, inventing win rules that contradict `rrr-social-round.md`.

Start now with `/design` for the TV host chrome system, using the reference PNGs as the “before”.

