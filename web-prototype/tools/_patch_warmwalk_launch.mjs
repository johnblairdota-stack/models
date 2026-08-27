import { readFileSync, writeFileSync } from 'node:fs';
const p = 'harness/_overnight_warmwalk.mjs';
let s = readFileSync(p, 'utf8');
s = s.replace(
  /args: \['--use-gl=desktop', '--disable-gpu-driver-bug-workarounds'\],\r?\n\s*/,
  ''
);
s = s.replace(/HEAD', 'b45f2f9[^']*'/, "HEAD', 'a73cac7 main verify WARM·WALK post-#24'");
writeFileSync(p, s);
console.log('ok', s.includes('a73cac7'), !s.includes('--use-gl=desktop'));
