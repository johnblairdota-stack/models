import { readFileSync, writeFileSync } from 'node:fs';
const p = 'harness/party-warm.mjs';
let s = readFileSync(p, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';

if (!s.includes("const followSrc = await readFile")) {
  s = s.replace(
    "const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');",
    "const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');" + nl +
    "  const followSrc = await readFile(new URL('../src/party/follow.js', import.meta.url), 'utf8');",
  );
  console.log('followSrc decl added');
}

const oldW25a = `  t('W25a — follow ready retries the run cue for the locked pair',
    /if \\(m\\.ready\\)/.test(hostSrc)
    && /if \\(runnerId\\) cueRun\\(runnerId/.test(hostSrc));`;

const newBlock = `  t('W25a — follow ready retries the run cue for the locked pair',
    /if \\(m\\.ready\\)/.test(hostSrc)
    && /cueRun\\(runnerId/.test(hostSrc));
  t('W25b — follow ready clears cuedRunner so a premature postMessage cannot stick WARM · WALK',
    /if \\(m\\.ready\\)/.test(hostSrc)
    && /ui\\.cuedRunner = null/.test(hostSrc)
    && /cueRun\\(runnerId/.test(hostSrc));
  t('W25c — warm/intros hide the follow slug (no dim WARM · WALK on air)',
    /#fl\\.pre \\.slug \\{ opacity:0; \\}/.test(followSrc)
    && !/#fl\\.pre \\.slug \\{ opacity:\\.35; \\}/.test(followSrc));`;

// try both dash variants
let replaced = false;
for (const dash of ['—', '-', '–']) {
  const old = oldW25a.replace(/—/g, dash);
  if (s.includes(old)) {
    s = s.replace(old, newBlock);
    replaced = true;
    console.log('replaced with dash', dash);
    break;
  }
}
if (!replaced) {
  // fallback: find W25a line and replace through semicolon after
  const start = s.indexOf("t('W25a");
  if (start < 0) { console.error('W25a not found at all'); process.exit(1); }
  const end = s.indexOf(';', start);
  const end2 = s.indexOf(nl, end);
  console.log('fallback slice', JSON.stringify(s.slice(start, end2 + 1)));
  s = s.slice(0, start) + newBlock.trimStart() + s.slice(end2);
  console.log('fallback replaced');
}
writeFileSync(p, s);
console.log('ok', s.includes("t('W25b"), s.includes("t('W25c"), s.includes('followSrc'));
