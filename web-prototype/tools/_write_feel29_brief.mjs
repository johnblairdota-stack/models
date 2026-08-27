import { writeFileSync } from 'node:fs';
const brief = `# feel29 Claude Max critique brief

HEAD: 027a078 (PR #28 merged). Stick-to-world proven. Chrome #18-#27 closed.
Do NOT propose chrome honesty, hunter wire slice, smash/CAUGHT invent, or art passes.

## Pass A — evil (Production) guide, room 4f23
- Real mouse on #stick + CDP multi-touch RUN. maxSpeed 5.27. Stick works.
- Guide NEVER jammed (correct for evil). Production feed continuous with hunter+runner marks.
- Room transition: Ballroom -> a passage at t~29s. Label updates. Passage name is intentional on-design.
- TV readout shot stayed ['chase'] for entire ~29s despite operator claiming chase/shoulder/lead/doorway hard cuts. Throttle did change WALK/RUN/STILL.
- Pad SWING receipt: label 'Swing' on within 40ms, cleared by 640ms. x3. OK.
- Go-live: followLive true; no warming miss reproduced.

## Pass B — good guide, room qgdq
- Ben good guide, Ada evil runner. Map note entire run: "No camera has the hunter. You are calling this one blind."
- jam class NEVER true across 13 samples (~18s+). hasHunter always false. hasRunner appears after ~6s.
- mapfeed.js unit-checks fine (jam at seconds>=6). DOM did not show jam. Possible worldTick/wire/DOM gap — not clear enough to ship a dial PR overnight.
- Designed starve (6 peek / 14 jam) NOT observed; camera-blind starve WAS observed (no hunter mark, no spooky jam FX).
- TV shots again only ['chase'].
- Runner here flash: "You are in —" before first here id, then Ballroom.

## Ask
1) Ranked play-feel findings (what happened / expected) — NON-chrome only
2) Guide: is camera-blind-without-jam the real starve, or should peek/jam always animate even when uncovered?
3) Doorway: is You-are-in enough?
4) TV produce: chase-only for 29s — bug or refusal fallback?
5) Pad confirm: any gap?
6) Fun /10; is ONE tiny PR justified tonight? If yes, exact one-line change.

Hunter = position-only / report-only. Smash->recap #3 untouched.
`;
writeFileSync('progress/overnight-feel29/CRITIQUE-BRIEF.md', brief);
console.log('ok', brief.length);
