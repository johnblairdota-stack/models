## Summary
Fixes the Send-them-in path that stamped `cuedRunner` before the follow iframe heard postMessage, so the bed stayed WARM / no runner while chrome already said EXPEDITION (WARM·STILL / CAMERA WARMING underlay lie).

Only mark cued after a successful send; retry the run cue when follow becomes ready.

## Test plan
- [ ] party-warm harness / gates
- [ ] Live: Send-them-in → warm→ready→followLive; no CAMERA WARMING slate while ready+live
- [ ] No regress of #23/#24 honesty (no intros mid-run, no Watch mid-expedition)

