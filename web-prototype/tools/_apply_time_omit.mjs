import { readFileSync, writeFileSync } from 'fs';

const phonePath = 'src/views/party-phone.js';
let phone = readFileSync(phonePath, 'utf8');
const invent = "const end = c.runEnd || 'TIME';";
if (!phone.includes(invent)) {
  console.error('phone: invent line missing');
  process.exit(1);
}

const re = /\/\*[\r\n]+\s+\* \?\? THE OUTCOME WORD IS THE ONE FACT THE RUNNER NEEDS AT RECAP\.[\s\S]*?const end = c\.runEnd \|\| 'TIME';\r?\n\s*body \+= `<h1>\$\{esc\(end\)\}<\/h1>\r?\n\s*<p class="hint">Phones down\. Talk\. The next ballot comes to this screen when the room is ready\.<\/p>`;\r?\n\s*\}/;

const neu = `/*
       * ?? THE OUTCOME WORD IS THE ONE FACT THE RUNNER NEEDS AT RECAP.
       * Playcritique F2: the pad said "Phones down." and never whether they smashed it, got
       * caught, or ran out of time. \`c.runEnd\` is the server's \`RUN_END\` — SMASHED or TIME
       * today; CAUGHT is reserved until the hunter actually takes (follow-bed still says next
       * slice). Missing end omits the word — same honesty as TV \`recapBoard\` — rather than
       * inventing TIME before the room has said so.
       */
      {
        if (c.runEnd) body += \`<h1>\${esc(c.runEnd)}</h1>\`;
        body += \`<p class="hint">Phones down. Talk. The next ballot comes to this screen when the room is ready.</p>\`;
      }`;

if (!re.test(phone)) {
  const i = phone.indexOf(invent);
  console.error('phone regex miss around', JSON.stringify(phone.slice(Math.max(0, i - 120), i + 220)));
  process.exit(1);
}
phone = phone.replace(re, neu);
if (phone.includes(invent)) {
  console.error('phone still invents');
  process.exit(1);
}
writeFileSync(phonePath, phone);
console.log('phone patched');

const warmPath = 'harness/party-warm.mjs';
let warm = readFileSync(warmPath, 'utf8');
const newW = `  t('W24d · phone paints runEnd when present and never invents TIME when end is missing',
    /if \\(c\\.runEnd\\) body \\+=/.test(phoneSrc)
    && !/c\\.runEnd \\|\\| 'TIME'/.test(phoneSrc)
    && /THE OUTCOME WORD IS THE ONE FACT/.test(phoneSrc)
    && /same honesty as TV/.test(phoneSrc));`;
const wRe = /t\('W24d[^']+',\r?\n[\s\S]*?\.test\(phoneSrc\)\);/;
if (!wRe.test(warm)) {
  const i = warm.indexOf('W24d');
  console.error('W24d block miss', JSON.stringify(warm.slice(i, i + 320)));
  process.exit(1);
}
warm = warm.replace(wRe, newW.trim());
if (warm.includes("/c\\.runEnd \\|\\| 'TIME'/.test(phoneSrc)") && !warm.includes("!/c\\.runEnd")) {
  console.error('W24d still requires invent');
  process.exit(1);
}
if (!/!\/c\\.runEnd \\|\\| 'TIME'\//.test(warm)) {
  console.error('W24d forbid pattern missing');
  process.exit(1);
}
writeFileSync(warmPath, warm);
console.log('W24d patched');
console.log('phone invent gone?', !readFileSync(phonePath, 'utf8').includes(invent));
