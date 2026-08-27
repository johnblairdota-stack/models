import { readFileSync, writeFileSync } from 'node:fs';
const p = 'harness/party-warm.mjs';
let s = readFileSync(p, 'utf8');
const i = s.indexOf("t('W25c");
console.log('idx', i);
console.log(JSON.stringify(s.slice(i, i + 420)));
