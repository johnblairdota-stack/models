## Summary
- Post-#25 overnight: Send-them-in during bake could `postMessage` a run cue before the follow iframe installed its listener. `cuedRunner` latched, ready's retry no-op'd, bed stayed `warm` — slug **WARM · WALK** over live EXPEDITION.
- Clear `cuedRunner` on `m.ready` and resend once the follow view is listening.
- Hide `#fl.pre .slug` (opacity 0) so a dim WARM · WALK never airs during warm/intros.
- Gates W25b / W25c.

## Test plan
- [x] `node harness/party-warm.mjs` — W25/W25a/W25b/W25c pass (W17a pre-existing)
- [x] Drive: lobby → cast → Send-them-in mid-bake → on ready, slug is chase/shoulder/… not WARM · WALK; `bedMode` run
- [ ] No Watch mid-run; no CAUGHT invent; leave :5184
