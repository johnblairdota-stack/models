import { readFileSync, writeFileSync } from 'node:fs';

const p = 'harness/party-warm.mjs';
let s = readFileSync(p, 'utf8');
const anchor = `  t('W21h — late bake must not fire cast intros once the expedition owns the TV',
    /ui\\.beat === 'expedition' \\|\\| ui\\.beat === 'recap'/.test(hostSrc)
    && /maybeIntros/.test(hostSrc));

}`;
// The file may have a special dash character — find by simpler marker
const mark = "t('W21h";
const mi = s.indexOf(mark);
if (mi < 0) { console.error('W21h missing'); process.exit(1); }
const closeBlock = s.indexOf('\n}', mi);
if (closeBlock < 0) { console.error('block close missing'); process.exit(1); }
const insert = `

  t('W22 — live expedition does not paint Watch the run (no-op host click)', (() => {
    const chunk = hostSrc.match(/if \\(onRun\\) \\{[\\s\\S]*?\\n    \\} else if \\(show === 'recap'\\)/);
    return !!(chunk && !/Watch the run/.test(chunk[0]));
  })());
  t('W22a control — casting with a locked pair still offers Watch the run',
    /if \\(hasPair\\) body \\+= \`[\\s\\S]*?Watch the run/.test(hostSrc));
`;
if (s.includes("t('W22 —")) { console.log('already patched'); process.exit(0); }
const out = s.slice(0, closeBlock) + insert + s.slice(closeBlock);
writeFileSync(p, out);
console.log('ok warm gate at', closeBlock);
