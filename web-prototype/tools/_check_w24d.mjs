import { readFile } from 'node:fs/promises';
const phoneSrc = await readFile(new URL('../src/views/party-phone.js', import.meta.url), 'utf8');
const checks = [
  ['if (c.runEnd) body +=', /if \(c\.runEnd\) body \+=/.test(phoneSrc)],
  ["forbids c.runEnd || 'TIME'", !/c\.runEnd \|\| 'TIME'/.test(phoneSrc)],
  ['OUTCOME WORD comment', /THE OUTCOME WORD IS THE ONE FACT/.test(phoneSrc)],
  ['same honesty as TV', /same honesty as TV/.test(phoneSrc)],
];
let fail = 0;
for (const [n, ok] of checks) {
  console.log(ok ? '  ok  ' : '  FAIL', n);
  if (!ok) fail++;
}
const warm = await readFile(new URL('../harness/party-warm.mjs', import.meta.url), 'utf8');
const w24 = /t\('W24d[^']+',\r?\n[\s\S]*?\.test\(phoneSrc\)\);/.exec(warm)?.[0] || '';
console.log('W24d forbids invent', /!\/c\\.runEnd \\|\\| 'TIME'\//.test(w24));
process.exit(fail ? 1 : 0);