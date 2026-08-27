import { readFileSync, writeFileSync } from 'node:fs';
const p = 'harness/party-warm.mjs';
let s = readFileSync(p, 'utf8');
const marker = "t('W21g control";
const idx = s.indexOf(marker);
if (idx < 0) { console.error('marker missing'); process.exit(1); }
const insertAt = s.indexOf('\n}', idx);
if (insertAt < 0) { console.error('block end missing'); process.exit(1); }
const add = `
  t('W21h — late bake must not fire cast intros once the expedition owns the TV',
    /ui\\.beat === 'expedition' \\|\\| ui\\.beat === 'recap'/.test(hostSrc)
    && /maybeIntros/.test(hostSrc));
`;
if (s.includes("W21h")) { console.log('already present'); process.exit(0); }
s = s.slice(0, insertAt) + add + s.slice(insertAt);
writeFileSync(p, s);
console.log('gate added at', insertAt);
