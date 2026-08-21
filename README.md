# models

GLB assets plus the **Run Robot Run** browser prototype.

**New here? Read [`CLAUDE.md`](CLAUDE.md) first** — the conventions this codebase is built on
(gates, controls, arms, probes, the party/solo split) in one page.

```
models/           existing GLBs (bed, tato)
docs/design/      the rrr-*.md design corpus (party mode: roles, round, task deck, gates…)
web-prototype/    Run Robot Run — Three.js web prototype
web-prototype/docs/design/   the older engine corpus (dig, escape, procedural-map, party-loop…)
```

## ⚠️ There are TWO `docs/design/` directories, and source comments cite both as `docs/design/…`

Nothing is missing. The paths in source comments are **relative to this repo root**, not to
`web-prototype/`:

| A comment saying | means | resolves from `web-prototype/`? |
|---|---|---|
| `docs/design/rrr-*.md` | `<repo root>/docs/design/rrr-*.md` | **no** |
| `docs/design/party-loop.md`, `escape.md`, `dig.md` … | `web-prototype/docs/design/…` | yes |

Because `web-prototype/docs/design/` exists and is full of unrelated files, running
`ls docs/design/` after the `cd` above shows a real directory with no `rrr-*` in it — which reads
as *"the design corpus is missing"*. It has been filed as a process failure twice. It is not
missing; you are one level too deep. `cd ..` first, or read `web-prototype/docs/design/README.md`.

## Clone on another machine

```bash
git clone https://github.com/johnblairdota-stack/models.git
cd models/web-prototype
npm install
npm run build && node harness/serve.mjs
```

Then open `http://localhost:5192/?view=game.play`.
