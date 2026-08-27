import { readFileSync, writeFileSync } from 'node:fs';

const hostPath = 'src/views/party-host.js';
let host = readFileSync(hostPath, 'utf8');
const re = /if \(m\.ready\) \{\r?\n[\s\S]*?return;\r?\n    \}/;
const m = host.match(re);
if (!m) { console.error('no match'); process.exit(1); }
const nl = host.includes('\r\n') ? '\r\n' : '\n';
const newReady = [
  'if (m.ready) {',
  '      follow.live = true;',
  "      root.querySelector('.run-frame')?.classList.add('live');",
  '      /*',
  '       * Overnight post-#25: sendCue can "succeed" (contentWindow exists) before the',
  '       * iframe has installed its message listener — cuedRunner latches and the bed',
  '       * stays in warm, stamping WARM · WALK over a live ready expedition. Clear and',
  '       * retry once the follow view is actually listening (this ready message).',
  '       */',
  '      const pair = client.frame?.pair || {};',
  '      const runnerId = pair.runner || null;',
  '      if (runnerId) {',
  '        ui.cuedRunner = null;',
  '        cueRun(runnerId, players());',
  '      }',
  '      return;',
  '    }',
].join(nl);
host = host.replace(re, newReady);
writeFileSync(hostPath, host);
console.log('host patched', host.includes('ui.cuedRunner = null;'));

const followPath = 'src/party/follow.js';
let fl = readFileSync(followPath, 'utf8');
if (!fl.includes('#fl.pre .slug { opacity:.35; }')) {
  console.error('CSS_MISSING', /#fl\.pre \.slug \{[^}]+\}/.exec(fl)?.[0]);
  process.exit(1);
}
fl = fl.replace(
  '#fl.pre .slug { opacity:.35; }',
  '/* No production graphic during warm/intros — a dim WARM · WALK lied on air. */' + nl +
  '    #fl.pre .slug { opacity:0; }',
);
writeFileSync(followPath, fl);
console.log('follow css patched', fl.includes('#fl.pre .slug { opacity:0; }'));
