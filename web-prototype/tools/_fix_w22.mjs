import { readFileSync, writeFileSync } from 'node:fs';

// Fix host comment indent
{
  const p = 'src/views/party-host.js';
  let s = readFileSync(p, 'utf8');
  s = s.replace(/\n            \/\*\n       \* 🗑️/, '\n      /*\n       * 🗑️');
  writeFileSync(p, s);
  console.log('host indent ok');
}

// Fix W22 gate + dedupe
{
  const p = 'harness/party-warm.mjs';
  let s = readFileSync(p, 'utf8');
  const start = s.indexOf("t('W22");
  if (start < 0) { console.error('W22 missing'); process.exit(1); }
  // find end of W21 block's closing } after W22 inserts — replace from first W22 through just before \n}
  const blockClose = s.indexOf('\n}', start);
  const neu = `t('W22 — live expedition does not paint a Watch the run button', (() => {
    const chunk = hostSrc.match(/if \\(onRun\\) \\{[\\s\\S]*?\\n    \\} else if \\(show === 'recap'\\)/);
    return !!(chunk && !/<button[^>]*>Watch the run<\\/button>/.test(chunk[0])
      && !/id="to-run">Watch the run/.test(chunk[0]));
  })());
  t('W22a control — casting with a locked pair still offers Watch the run',
    /if \\(hasPair\\) body \\+= \`[\\s\\S]*?Watch the run/.test(hostSrc));
`;
  const out = s.slice(0, start) + neu + s.slice(blockClose);
  writeFileSync(p, out);
  console.log('warm W22 replaced');
}
