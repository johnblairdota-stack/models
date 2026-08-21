# CLAUDE.md — the conventions, in one page

Read this first. It is a **map**, not a manual: every entry points at the file that carries the
real argument. If a claim here disagrees with a gate, the gate is right and this file is stale —
fix it in the same commit.

Almost all of this codebase was written by agents. Everything below was rediscovered by osmosis
until 2026-08-21, which is the only reason it is written down.

---

## Two games in one tree

| | **party mode** — shipping | **survival mode** — retired |
|---|---|---|
| rules | `src/party/*` | `src/game/*` |
| transport | `net/party/*` | `net/server.mjs` |
| views | `src/views/expedition.js`, `premiere.js` | `src/views/game.js` |
| design corpus | `docs/design/rrr-*.md` (**repo root**) | `web-prototype/docs/` |

Two `docs/design/` directories exist and source comments cite both as `docs/design/…`, always
relative to the **repo root**. `README.md` has the disambiguation table; it has been filed as a
process failure twice.

**`src/party/*` is pure and must stay pure.** No THREE, no DOM, no engine — it runs in a worker,
in bare node and on a phone. That is why `party-sim` can play a thousand matches and
`party-isolation` can answer a question about a filter without a deploy. Seven gates now reach
THREE on disk; the list and the reason live in `.github/workflows/gates.yml`'s header.

**The entitlement matrix is DATA, not code** — one declarative table, one row per field path
(`net/party/entitle.js`). The server projects from it and the gate checks the observed wire
against it. They may share the table and must **not** share the projection, or a bug in the filter
passes its own gate.

**`harness/dead-import.mjs` is why the retired mode is not on the party mode's critical path.**
Two import lines once put 4,900 lines of survival mode into the party bundle.

---

## Gates

```
npm run gates:party              all of them, four at a time
node harness/gates.mjs <name>    one
node harness/gates.mjs --serial --slow
```

`harness/gates.mjs` is the runner and **the gate list lives in it, once**. It spawns every gate,
never short-circuits, and prints one suite total. A committed, top-level, unprefixed `harness/*.mjs`
that names itself in a summary line and is **not** in `GATES` fails the run — that is not
maintained by hand because two gates once sat unrun for want of a list entry. The runner is a
launcher and a tally; **no assertion may ever live in it.**

Conventions every gate keeps, argued in `docs/design/rrr-gates.md` §1:

- **The header carries the argument.** A gate is one `.mjs` whose header is often longer than its
  code. That is where a number survives its author's death — of five agents killed on 2026-08-09,
  the one whose answer was in a probe header came back intact and the one whose was not was lost.
- **Assertions are letter-numbered, file-local and quotable** — `R1`, `E4b`, `X15c`. They get cited
  in commits and headers by that name.
- **The arm, usually `R0`/`B0`: refuse a vacuous green.** The first assertion proves the file has
  something to measure, and SKIPs with a reason if not.
- **Every assertion ships a control that must fail, and the control runs every run.** A check that
  fires on everything and one that fires on nothing look identical to a run that only asks the
  shipped arm. A control mutates the **real artefact** — the shipped file, the shipped projection —
  never a string the control wrote itself on the same line.
- **A SKIP is never a PASS.** Twice damaged by an instrument that returned a confident wrong number
  rather than admitting it could not measure.
- **Bands, not absolutes**, where the property is a band. `escape` E1's hard `4` passed for a year
  and then failed on a generated house.
- **Seeded determinism.** One seed, one deal, byte-identical twice. Sweeps are seeds × counts ×
  policies, not one lucky run.
- Every gate ends on `name: N passed, M failed[, K skipped]` and `process.exit(fail ? 1 : 0)`.
  That line is the runner's contract.

**Do not "fix" a gate to make it green.** If a change turns one red, that is a finding.

---

## Probes

`harness/evidence/_*.mjs` — ~450 of them, `_`-prefixed, kept on purpose. A probe is the record of a
finding, cited by name from the header of the source it explains. **Do not delete one to tidy up.**
`harness/fixtures/` holds the goldens they check against; `harness/scenarios/` holds browser
scenarios driven by `harness/playtest.mjs --script`.

Several agents work this tree at once. **`git status` before you edit, and skip what someone else
has open.**

---

## Docs

- `docs/design/rrr-*.md` — the party-mode corpus. `rrr-gates.md` is the one to read.
- `web-prototype/HANDOFF.md` — the survival mode's running log. It still opens *"the only document
  a new session must read in full"*; it is not. It describes a different game, its current-state
  heading is eleven days stale, and it says nothing about party mode. Read **this** file first and
  open HANDOFF only for survival-mode work.
- `web-prototype/docs/handoff/*.md` — appendices; open only the one your slice names.

## Commits

Declarative sentences, no conventional-commit prefixes — the subject says what is now true, the
body says what the number was and which instrument proved it. Read `git log` before writing one.
