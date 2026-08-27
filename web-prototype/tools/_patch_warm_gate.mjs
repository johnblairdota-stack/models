import { readFileSync, writeFileSync } from 'node:fs';

const p = process.argv[2] || 'harness/party-warm.mjs';
let s = readFileSync(p, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';

const anchor = "t('W22a control";
const i = s.indexOf(anchor);
if (i < 0) { console.error('W22a anchor missing'); process.exit(1); }
// find end of W22a assertion line(s) — next blank line before closing }
const after = s.indexOf(nl + nl, i);
if (after < 0) { console.error('blank after W22a missing'); process.exit(1); }

const insert = nl + [
  "  t('W25 — run cue is only marked cued after a successful postMessage',",
  "    /function cueRun\\(/.test(hostSrc)",
  "    && /if \\(ok\\) ui\\.cuedRunner = runnerId/.test(hostSrc)",
  "    && !/ui\\.cuedRunner = runnerId;\\s*\\n\\s*const look = seatLook/.test(hostSrc));",
  "  t('W25a — follow ready retries the run cue for the locked pair',",
  "    /if \\(m\\.ready\\)/.test(hostSrc)",
  "    && /if \\(runnerId\\) cueRun\\(runnerId/.test(hostSrc));",
].join(nl) + nl;

if (s.includes("t('W25 —")) { console.log('W25 already present'); process.exit(0); }
s = s.slice(0, after) + insert + s.slice(after);
writeFileSync(p, s);
console.log('warm gate W25 inserted');
