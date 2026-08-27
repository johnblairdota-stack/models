import { readFileSync, writeFileSync } from 'node:fs';
const p = 'harness/_overnight_warmwalk.mjs';
let s = readFileSync(p, 'utf8');
s = s.replace(
  /browser = await chromium\.launch\(\{\s*channel: 'chrome',\s*headless: false\s*\}\);/,
  "browser = await chromium.launch({ channel: 'chrome', headless: true });"
);
s = s.replace(/note\('browser', 'chrome GPU'\);/, "note('browser', 'chrome headless verify');");
writeFileSync(p, s);
console.log('headless', /headless: true/.test(s));
