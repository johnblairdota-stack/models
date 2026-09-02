# Slice: hold vote through HIT / verdict chrome (CAST8 redelivery)

Decided plan. The numbers are the numbers to use. If a stated fact is wrong, **say so in
the report rather than diverging silently.**

Base: `main` at `ec50862` (PR 74 merge). Spec, not the night. **Grok, not Max. Do not merge.**
Game waits on this docs PR. Treat PR 74 as **failed delivery**, not a new look.

CAST8 Vote → HIT desync: driver thought no eviction, chrome said OUT next beat. Hold
through execution / verdict chrome until HIT / OUT is the same on driver and TV.

Quote CAST8: "The cast wins. The Reunion is next." W5 stays gone. 2g1e last vote stays.
Do not invent a SHOW beat. Do not reopen W5. Do not invent 3v1 as a special count.

CAST8 receipts (`harness/_loop8/season-cast8.json`, `cast8-ep-report.json`,
`cast8-season-done.json`; holeIds H358-H380; CoS last H381):

- Ep 1: fell Fox, stood Fox, tally Fox 7. Chrome includes ] BEAT, CAMERA WARMING.
- Ep 2: fell nobody, stood none.
- Ep 3: fell nobody, stood Ada. Ada is dead at end (`row.alive=false`).
- Ep 4: fell nobody, stood Eli. Eli is dead at end.
- Ep 5 H379: TV printed no eviction. pile=Gus sent=4 standing=Gus thresh=5 of 5 tally=
  empty. Expected: a living pile on a standing name meets the printed threshold.
- Ep 5: `lynched: null`, `livingAtEnd` includes Gus, Reunion card for Gus prints
  "You were executed." Evils Ada+Gus. Outcome SEASON FINALE, rule The cast wins.
- Driver `fell: nobody` on eps 2-5 vs chrome OUT on later beats is the desync class.

---

## 0. Why this slice exists

The table cannot argue an eviction the driver did not see. CAST8's driver logged no
eviction while the TV / Reunion chrome later treated Ada, Eli, and (on the card) Gus
as executed. Hold the room on execution / verdict chrome until HIT / OUT matches.

---

## 1. File ownership

**You may edit these.** Anything else is another owner. Paths under `web-prototype/`.

| file | what changes |
|---|---|
| `docs/slices/task-vote-hit-hold.md` | this file |
| `src/party/phases.js` | hold vote → execution → verdict until chrome and driver share HIT / OUT; do not add a SHOW beat |
| `src/party/vote.js` or the live tally owner | honour standing names + printed threshold; empty tally with a standing pile is red |
| `src/views/party-host.js` | verdict / OUT chrome only after the held HIT; no OUT on the next beat while driver still has no eviction |
| `harness/cast-ballot.mjs` or the vote gate already in `gates:party` | CAST8-class: driver no-eviction vs chrome OUT is red; empty tally with standing pile is red |

**Do not edit:** `follow.js` cameras / CUE_KINDS. `win.js` (W5 stays deleted; TICK_ORDER
W1, W3, W2, W4; 2g1e last vote stays). execute linger (other slice). expedition
auto-walk (other slice). Live 5178/5181. Hunter art.

---

## 2. The lock

1. After ballots close, hold through execution / verdict chrome. Do not advance the
   SHOW until driver and TV agree HIT or no-HIT.
2. OUT chrome is only legal after that held HIT. A later beat printing OUT while the
   driver logged no eviction is a defect (CAST8 Ada / Eli / Gus card).
3. Honour standing names + the printed threshold. CAST8 ep 5: standing Gus, sent 4,
   thresh 5 of 5, tally empty, TV printed no eviction — that miss must not later become
   an OUT the driver never saw.
4. Do not invent a SHOW beat. Do not add a CUE_KIND. Do not licensed-skip the hold.
5. W5 stays gone. 2g1e last vote stays. CAST8 ended SEASON FINALE / The cast wins /
   The Reunion is next — do not reopen end-on-camera.

---

## 3. Traps and verification

Do not "fix" the desync by inventing a lynch the board did not print (`board: quoted
miss / no invented lynch` on CAST8 ep 5). Quote chrome. Empty `chromeTally` with a
standing pile is the H379 hole. Reunion "You were executed" on a living row is the
same class after the hold was skipped.
Gate: the vote / ballot harness already in `gates:party` (extend `harness/cast-ballot.mjs`
or the existing tally gate — do not add a new show clock).
Red: driver `fell: nobody` / `lynched: null` while TV or Reunion chrome says OUT /
executed; empty tally with a living standing pile that met or was shown as meeting
threshold; a new SHOW beat or CUE_KIND; W5 restored.
If a stated fact is wrong, say so in the report rather than diverging silently.
