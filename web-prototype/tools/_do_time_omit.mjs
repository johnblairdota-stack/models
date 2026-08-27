import { readFileSync, writeFileSync } from 'fs';

const phonePath = 'src/views/party-phone.js';
let phone = readFileSync(phonePath, 'utf8');
const invent = "const end = c.runEnd || 'TIME';";
if (!phone.includes(invent)) {
  console.error('phone: invent line missing');
  process.exit(1);
}

const oldCommentTail = 'Missing end falls back to TIME rather than inventing a smash.';
const newCommentTail = 'Missing end omits the word — same honesty as TV `recapBoard` — rather than\n       * inventing TIME before the room has said so.';
if (!phone.includes(oldCommentTail)) {
  console.error('phone: comment tail missing');
  process.exit(1);
}
phone = phone.replace(oldCommentTail, newCommentTail);

const oldCode = `        const end = c.runEnd || 'TIME';
        body += \`<h1>\${esc(end)}</h1>
        <p class="hint">Phones down. Talk. The next ballot comes to this screen when the room is ready.</p>\`;`;
const newCode = `        if (c.runEnd) body += \`<h1>\${esc(c.runEnd)}</h1>\`;
        body += \`<p class="hint">Phones down. Talk. The next ballot comes to this screen when the room is ready.</p>\`;`;
if (!phone.includes(oldCode)) {
  console.error('phone: code block missing', JSON.stringify(phone.slice(phone.indexOf(invent) - 20, phone.indexOf(invent) + 200)));
  process.exit(1);
}
phone = phone.replace(oldCode, newCode);
if (phone.includes(invent)) {
  console.error('phone still invents');
  process.exit(1);
}
writeFileSync(phonePath, phone);
console.log('phone patched');

const warmPath = 'harness/party-warm.mjs';
let warm = readFileSync(warmPath, 'utf8');
const oldW = `  t('W24d · the phone paints the outcome word at recap, not a bare Phones-down heading',
    /c\\.runEnd \\|\\| 'TIME'/.test(phoneSrc)
    && /THE OUTCOME WORD IS THE ONE FACT/.test(phoneSrc));`;
const newW = `  t('W24d · phone paints runEnd when present and never invents TIME when end is missing',
    /if \\(c\\.runEnd\\) body \\+=/.test(phoneSrc)
    && !/c\\.runEnd \\|\\| 'TIME'/.test(phoneSrc)
    && /THE OUTCOME WORD IS THE ONE FACT/.test(phoneSrc)
    && /same honesty as TV/.test(phoneSrc));`;
if (!warm.includes(oldW)) {
  const i = warm.indexOf('W24d');
  console.error('W24d block miss', JSON.stringify(warm.slice(i, i + 320)));
  process.exit(1);
}
warm = warm.replace(oldW, newW);
writeFileSync(warmPath, warm);
console.log('W24d patched');
console.log('phone invent gone?', !readFileSync(phonePath, 'utf8').includes(invent));
console.log('has omit?', /if \(c\.runEnd\) body \+=/.test(readFileSync(phonePath, 'utf8')));
console.log('has honesty comment?', /same honesty as TV/.test(readFileSync(phonePath, 'utf8')));
