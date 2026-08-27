import { readFileSync, writeFileSync } from "node:fs";
const p = "web-prototype/harness/party-warm.mjs";
let s = readFileSync(p, "utf8");

if (s.includes("t('W22b")) { console.log("W22b already present"); process.exit(0); }

const mark = "t('W22a control";
const mi = s.indexOf(mark);
if (mi < 0) { console.error("W22a missing"); process.exit(1); }
// Find end of W22a assertion (closing );)
const end = s.indexOf(");", mi);
if (end < 0) { console.error("W22a end missing"); process.exit(1); }

const insert = `);
  t('W22b — recap does not paint the old Run / Watch-the-run affordance', (() => {
    const chunk = hostSrc.match(/\\} else if \\(show === 'recap'\\) \\{[\\s\\S]*?\\n    \\} else if \\(show === 'casting'\\)/);
    return !!(chunk && !/id="to-run"/.test(chunk[0]));
  })()`;

// Replace from W22a start's closing - actually insert after the ); of W22a
const out = s.slice(0, end) + insert + s.slice(end);
writeFileSync(p, out);
console.log("warm ok");