# The Hunter in the Door — design board + art path

**Open the board:** `npm run hunter-door` opens a server; go to **http://localhost:5207**.
(Port 5207 on purpose — 5199 is The Desk, 5205 is The Night.) `/` is the tabbed viewer
(`view.html`: Pitch / Build / Verify, hash routed, no Fable). `/canvas` is the old
Fable file and needs `support.js` / React that are not in git — do not make it `/`.

The three `*.dc.html` files are the artboard sources the tabbed viewer reuses.

## Run the verify

```bash
npm run gate:hunter-door                 # bind / measured contact / pack path / control
node harness/hunter-door.mjs --measure   # reprint fresh FK contact numbers from the GLBs
node harness/hunter-door.mjs --write     # after copying the pack: fill HUNTER_SWINGS from FK
```

The gate also runs at the end of `npm run gates:party`. The GLBs are gitignored: when they
are absent the gate **skips** D1/D2/D4 (never a silent pass of bind/contact) and still
checks wiring. Copy from
`C:\Users\John\Documents\Run Robot Run\web-prototype\public\models\anim\hunter\`
into `public/models/anim/hunter/`, then `--write` and the gate must go green. Do not commit
the `.glb` files.

## Look at the thing

- `NEWHUNTER.bat` → `?view=hunter.animated` — the Meshy stage-3 body stood in a doorway,
  procedural stage-3 in a second doorway beside it. Space cycles clips; red flash =
  measured contact. Refuses to start if `walking.glb` is missing.
- `PLAYHUNTER.bat` → the game with `?hunterm=1`. `PLAY.bat` stays procedural, untouched.

## The one-screen truth (2026-09-02, pack pointed at Meshy)

- `createHunterMeshAvatar` loads `walking.glb` as the skinned body and binds
  `running.glb` / `attack.glb` / `double-combo-attack.glb` onto that skeleton by bone
  name (`bindClipToRig`). Combo is the real double-combo clip — **not** mapped to
  `Heavy_Hammer_Swing`. The Lumi Bot stand-in is gone.
- Baked Meshy textures stay. No `shellWhite`, no hunter grime ramp.
- Game owns root XZ (`stripRootXZ`).
- Strike contact is **measured** from the Meshy GLBs (FK at 240 Hz, 2026-09-02):
  `attack.glb` **1.100 s / 2.833 s** RightHand, `double-combo-attack.glb`
  **0.679 s / 2.867 s** RightHand. Lumi 1.050 / 1.504 are invalid. Pack absent:
  D2 skips, it does not pass.
- **FINDING:** extra-arm skin weights (Meshy biped auto-rig) vs the locked six-arm art —
  do not fake-paint in JS. Judge in the doorway. Hunter stays a door; no camera was
  invented.

Spec pointer (not restated here): the expedition/night spec is Project Lead's —
`docs/design/rrr-social-deception-mode.md`.
