# THE LOOP — the board

One screen that pitches and tracks the playtest-critic loop: drive a live night, photograph
every screen, hand the photographs to a hostile critic, file HOLES into `holes.json`, turn each
hole into a fix and each fix into a gate — then run the loop again.

## Open it

```bash
cd web-prototype
npm run the-loop        # -> http://localhost:5211
```

Plain static DOM — no build step. Port **5211** on purpose: **5199 is The Desk's**, **5205 is
the night board's**, 5207 and 5209 belong to other boards, and **5178 / 5181 are live product
ports** — this board goes on none of them.

## The backend

`holes.json` is the whole backend. The board fetches it and renders the loop records and the
holes; nothing else stores state. Every hole carries eight fields — `id · episode · beat · tag ·
saw · expected · so · next` — and a loop record may only claim `done` when it **quotes chrome**
(verbatim text photographed off a screen) and records both live ports **parked** (5178, 5181).

The records `dusk6 · barn5 · heat7 · barn6` are protected playtest history. A loop appends;
it never wipes.

## Verify

```bash
npm run gate:the-loop    # LP1–LP7: schema, done-quotes-chrome, parked ports, this board
npm run gates:party      # the full chain CI runs, the-loop included
```

`harness/the-loop.mjs` LP2b/LP3c are the controls: the checker is fed a hole missing each field
in turn and a loop claiming done with no chrome, and must refuse every one — a checker that
cannot fail proves nothing.

## The canvas

`canvas/` holds the design-canvas working files (`*.dc.html` + `canvas.json`) behind the pitch
artboards — same convention as `docs/design/refs-expedition-locked/canvas/`.
