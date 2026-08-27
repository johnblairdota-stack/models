## Summary
After #19, party-phone could invent TIME when runEnd was missing. Match TV recapBoard: paint outcome only when present.

## Test plan
- W24d forbids invent fallback
- SMASHED/TIME still shows when server posts it
- Missing end: Phones-down only

Does not touch #21 scaffold invent.
