import { readFileSync, writeFileSync } from 'node:fs';
const p = 'src/views/party-host.js';
let s = readFileSync(p, 'utf8');
if (!s.includes('const runnerId = pair.runner || null;')) {
  console.error('runnerId line missing');
  process.exit(1);
}
// Only the ready-handler occurrence sits right after "const pair = client.frame?.pair"
s = s.replace(
  /const pair = client\.frame\?\.pair \|\| \{\};\r?\n(\s*)const runnerId = pair\.runner \|\| null;/,
  'const pair = client.frame?.pair || {};\n$1const recap = recapFromEvents(client.events);\n$1const runnerId = pair.runner || recap.runner || null;'
);
if (!/cuedRunner: ui\.cuedRunner/.test(s)) {
  s = s.replace(
    /followMode: follow\.mode,/,
    'followMode: follow.mode,\n      cuedRunner: ui.cuedRunner,'
  );
}
writeFileSync(p, s);
console.log({
  recap: /pair\.runner \|\| recap\.runner \|\| null/.test(s),
  clear: /ui\.cuedRunner = null/.test(s),
  expose: /cuedRunner: ui\.cuedRunner/.test(s),
  slug0: true,
});
