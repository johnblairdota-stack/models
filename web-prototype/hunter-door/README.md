# The Hunter in the Door — design board + art path

**Open the board:** `npm run hunter-door` opens a server; go to **http://localhost:5207**.
(Port 5207 on purpose — 5199 is The Desk, 5205 is The Night.) The board is one screen:
Pitch → Build (silhouette / bind / contact) → Verify. Every claim on it names its gate.

The board file is `the-hunter-in-the-door.html` (a design canvas — pan/zoom, per-artboard
PNG/PDF export). The three `*.dc.html` files beside it are the artboard sources; edit those
and re-seed rather than editing the big file.

## Run the verify

```bash
npm run gate:hunter-door            # the gate: bind / measured contact / pack path / control
node harness/hunter-door.mjs --measure   # reprint fresh FK contact numbers from the GLBs
```

The gate also runs at the end of `npm run gates:party`, so CI carries it.

## Look at the thing

- `NEWHUNTER.bat` → `?view=hunter.animated` — the clip body stood in a doorway, procedural
  stage-3 in a second doorway beside it. Space cycles clips; red flash = measured contact.
- `PLAYHUNTER.bat` → the game with `?hunterm=1`. `PLAY.bat` stays procedural, untouched.

## The one-screen truth (2026-09-02)

- The repo holds **no generated stage-3 hunter mesh** — six arms, two heads, rider do not
  exist as geometry anywhere. The opt-in body is the Lumi Bot biped stand-in, dressed in the
  authored grime ramp. Fixing that needs a new Meshy generation + auto-rig, not JS.
- Strike contact is **measured** (FK over GLB tracks, 240 Hz): `Attack` 1.050 s / 2.800 s,
  `Heavy_Hammer_Swing` 1.504 s / 1.833 s — and the gate re-derives both on every run.
- The pack has **no double-combo clip**; the `combo` role maps to `Heavy_Hammer_Swing` and
  says so. Full clip census: `public/models/anim/hunter/README.md`.
- The look verdict against the locked spec lives in `VERDICT.md` beside this file.

Spec pointer (not restated here): the expedition/night spec is Project Lead's —
`docs/design/rrr-social-deception-mode.md`.
