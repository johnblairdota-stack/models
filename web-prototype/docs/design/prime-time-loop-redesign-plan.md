# Prime Time — rest-of-loop design plan (2026-08-24)

Living plan for everything after the playable smash → debrief → lynch path.
Canonical rules stay in `rrr-social-round.md` + `party-loop.md`. This file is the **visual + product build plan** for the remaining loop and features.

## North star

TV feels like a live reality show. Phones feel like a Jackbox pad. Robots stay on-model (`STYLE_CONTRACT.md` palette). The shooting schedule is the game.

## Already shipping (do not redesign away)

- Lobby QR join, role deal, Casting runner/guide ballot
- Expedition: dual-stick runner, guide map, TV chase, smash mission, home to ballroom
- Recap (short) → Debrief (ballroom + timer) → Reckoning → Vote → Execution chrome → Casting
- No self-nomination; no self-vote on lynch; empty Reckoning re-arms

## Gaps to design + build

### P0 — loop honesty
1. Kill double clock (`playEpisode` on lock vs live SHOW)
2. Live VERDICT beat before next Casting
3. CAUGHT when hunter takes the runner

### P1 — social round complete
4. Casting: announce mission/wing first; rotation lockout; REFUSE THE CHAIR; air ballots
5. Confessional-cam pitches on nominate
6. Execution as TV spectacle (nominator swing / face-down plate)
7. Live win machine (`win.js`) ending the night

### P2 — session shell
8. PREMIERE (rules + seated circle)
9. REUNION special
10. Debrief tip chat
11. Honest 4–8 player tables

### P3 — feel
Doorway bleed, hunter threat, good-guide camera-blind, clearance/smash polish

## Visual redesign goals (for `/design`)

TV artboards for: Lobby, Casting, Expedition lower-thirds, Recap, Debrief, Reckoning, Vote, Execution, Verdict, Reunion.
Phone artboards for: Join, Role card, Casting ballot, Runner, Guide, Spectator react, Nominate, Lynch vote.

Constraints:
- Jackbox-scale type on phones; 10-foot UI on TV
- Reality-TV chrome (REC, cam label, countdown, nameplates) without cluttering the 3D
- Palette from STYLE_CONTRACT; orange accent already in host chrome is OK as show dressing
- Keep asymmetric info: guide map never on TV; evil never leaked on nameplates

## How to run the redesign

See `PROMPT-claude-loop-redesign.md` in this folder. Use Claude Code `/design` with the refs in `refs-loop-redesign/`.

---

## Chosen direction (2026-08-24 `/design` pass 1 — TV)

Artboards: `docs/design/refs-loop-redesign/artboards/` (rebuild with `node docs/design/refs-loop-redesign/artboards/_build.mjs`).
Canvas: **Prime Time TV Chrome** — page 1 is the three directions, page 2 is the whole night in the leading one.

### The three directions

| | Idea | Why | Cost |
|---|---|---|---|
| **A — Camera Bug** | Chrome shrinks to a corner bug; picture is the whole screen | The run is the only thing worth looking at | Nobody walking in can read the beat or the clock. Problem 2 unsolved |
| **B — Rundown Rail** ⭐ | The shooting schedule sits across the top all night; current beat lit, its bar draining | Fixes phase literacy **and** continuity in one move — same rail Lobby → Reunion | 22 px of picture during the run; eight chips is real furniture |
| **C — Studio Card** | Built set: amber spine, beat name and clock huge, picture inset as a plate | Loudest, most obviously a show across a room | Picture loses ~⅓ of the frame; hard to sit through 90 s of chase |

**Recommendation: B.** `phases.js` already *is* the game — the rundown rail is that file drawn on the
television. It collapses to a 22 px ribbon over the live picture (Expedition) and opens to a full
50 px strip on the talk beats, so one component carries every beat and nothing else has to teach the
room where it is. A and C both stay live options: A is B with the rail deleted, C is B's furniture
turned up, so picking later costs a CSS swap, not a rebuild.

### Token table

Names match `src/party/palette.js` 1:1. **Two are proposed and not in `palette.js` yet.**

| Token | Value | Role in the chrome |
|---|---|---|
| `--night-bg` | `#0c0a08` | the room |
| `--night-deep` | `#080604` | Verdict slate, one step darker |
| `--night-panel` | `#161310` | any card, ballot row, tally column |
| `--night-well` | `#12100c` | inside a card — voter rows, face-down plate |
| `--night-accent` | `#f5a14a` | **the show**: brand, current beat, chrome furniture, hot clock |
| `--night-ink` | `#f3ece3` | names, clock, hero words |
| `--night-soft` | `#a89884` | body copy |
| `--night-dim` | `#8a7d70` | uppercase label strips |
| `--night-live` | `#9ff2c8` | **true / alive / on-air-good** — SMASHED, RENEWED, CAST, SEATED |
| `--night-bad` | `#ff8a7a` | **false / dark / gone** — STAYED DARK, CANCELLED, PRODUCTION, REFUSED |
| `--night-rec` | `#e8452f` | **[PROPOSED]** the on-air dot. `--night-bad` is a text salmon and reads pink at 9 px |
| `--night-scrim` | `rgba(8,6,4,.78)` | **[PROPOSED]** safe-area bed under lower-thirds over live picture |

Three colours carry all meaning: **amber = the show · mint = true/alive · salmon = false/dark/gone.**
Robot faces stay `STYLE_CONTRACT` §2 shell/glass/mint for *everyone* — nine colours means no per-player
colour, so identity is carried by the nameplate, never by a hue.

### Type ramp

One family: **Archivo** (400–900), fallback `ui-sans-serif, system-ui`. Tabular numerals everywhere so
the clock does not jitter. Sizes below are artboard px at 1280×720 — multiply by 1.5 for 1080p.

| Class | px @1280 | px @1080p | Used for |
|---|---|---|---|
| `.hero` | 132 (up to 196) | 198–294 | SMASHED · RENEWED · the debrief clock · the evicted name |
| `.name` / lower-third | 44–46 | 66–69 | nameplates, tally names |
| `.clock` | 34 | 51 | top-bar countdown |
| `.beat` | 30 | 45 | board title (NAME SOMEONE, THE VOTE) |
| `.strip .line` | 26 | 39 | the strapline under the picture |
| `.body` | 19–20 | 29–30 | rule text, quotes |
| `.lab` | 13 | 19.5 | every uppercase label strip — **hard floor, nothing smaller** |

### Anatomy, top to bottom

1. **Top bar, 46 px** — `PRIME TIME` + red ON AIR dot, then `EPISODE n · BEAT` + clock.
2. **Rundown rail** — 8 chips; `.thin` (22 px, current label only) over live picture, full (50 px) on
   talk beats. Lobby and Reunion sit outside the episode and show the rail all-future.
3. **Stage** — full-bleed picture (Expedition, Recap, Debrief) or a board (everything else).
4. **Lower third** — chevron badge + name + `ROLE · STATE`. Same component on every beat.
5. **Bottom strip, 76 px** — one sentence of what is happening + one uppercase fact line.

### What the boards fix from the live capture

- `15-tv-recap-live.png` needed **scrolling** to see three facts. Recap is now a 3×2 fact grid over the
  dimmed ballroom, no scroll, readable across a room.
- Beat + time left were a 13 px grey string top-right. Now: rail + a 34 px clock.
- Casting announced nothing. Now: mission and wing first, then the pair, then all five ballots in the air
  (P1 gap 4), with REFUSE THE CHAIR shown as a real ballot state.
- Vote showed a count. Now it names who voted for whom, and states the nominator swing and the no-self rule.

### Asymmetry held on every board

The guide map appears on no TV artboard. No plate reveals an alignment before Reunion — Execution is
explicitly a face-down card, and Recap's footer says so out loud.

### Not yet designed (needs `/design` pass 2 and 3)

Phone pads (Join, role card, ballot, dual-stick, guide map, react, nominate, lynch vote) and the
CAUGHT slate, Confessional pitch and PREMIERE boards.
