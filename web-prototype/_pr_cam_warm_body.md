## Summary
- Post-#26 overnight residual: after `followLive` + ready + `bedMode=run`, host underlay still left **CAMERA WARMING** readable in TV body (`opacity:0` alone keeps the copy in textContent).
- Clear `.run-slot` on `m.ready`, and omit the copy when `followLive` is true in `runStage`.
- One concern only — does not reopen run-cue / WARM·WALK (those landed in #26).
- Gate W25d.

## Test plan
- [x] `node harness/party-warm.mjs` — W25d pass (W17a pre-existing)
- [ ] Drive: after live+ready+bedMode=run, TV body has no readable CAMERA WARMING
- [ ] No Watch mid-run; no CAUGHT invent; leave :5184
