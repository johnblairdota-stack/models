import { readFileSync, writeFileSync } from 'fs';

const phonePath = 'src/views/party-phone.js';
let phone = readFileSync(phonePath, 'utf8');
const invent = "c.runEnd || 'TIME'";
if (!phone.includes(invent)) {
  console.error('phone invent missing');
  process.exit(1);
}

// Surgical: only rewrite the comment tail + the invent block, matched as literal lines.
const oldTail = "Missing end falls back to TIME rather than inventing a smash.";
const newTail = "Missing end omits the word \u2014 same honesty as TV `recapBoard` \u2014 rather than";
const newTail2 = "       * inventing TIME before the room has said so.";
if (!phone.includes(oldTail)) {
  console.error('oldTail missing');
  process.exit(1);
}
phone = phone.replace(oldTail, newTail + "\n" + newTail2);

const oldAssign = "        const end = c.runEnd || 'TIME';\n        body += `<h1>${esc(end)}</h1>\n        <p class=\"hint\">Phones down. Talk. The next ballot comes to this screen when the room is ready.</p>`;";
const oldAssignCR = oldAssign.replace(/\n/g, '\r\n');
const newAssign = "        if (c.runEnd) body += `<h1>${esc(c.runEnd)}</h1>`;\n        body += `<p class=\"hint\">Phones down. Talk. The next ballot comes to this screen when the room is ready.</p>`;";
const newAssignCR = newAssign.replace(/\n/g, '\r\n');

let replaced = false;
if (phone.includes(oldAssignCR)) {
  phone = phone.replace(oldAssignCR, newAssignCR);
  replaced = true;
} else if (phone.includes(oldAssign)) {
  phone = phone.replace(oldAssign, newAssign);
  replaced = true;
}
if (!replaced) {
  console.error('assign block missing');
  const i = phone.indexOf(invent);
  console.error(JSON.stringify(phone.slice(i - 20, i + 200)));
  process.exit(1);
}
if (phone.includes(invent)) {
  console.error('still invents after patch');
  process.exit(1);
}
const phoneLines = phone.split(/\r?\n/).length;
if (phoneLines < 1000) {
  console.error('phone too short', phoneLines);
  process.exit(1);
}
writeFileSync(phonePath, phone);
console.log('phone ok lines', phoneLines);

const warmPath = 'harness/party-warm.mjs';
let warm = readFileSync(warmPath, 'utf8');
const warmBefore = warm.length;
const wIdx = warm.indexOf("t('W24d");
if (wIdx < 0) {
  console.error('W24d title missing');
  process.exit(1);
}
const wEnd = warm.indexOf(');', wIdx);
if (wEnd < 0) {
  console.error('W24d end missing');
  process.exit(1);
}
const oldBlock = warm.slice(wIdx, wEnd + 2);
console.log('old W24d', JSON.stringify(oldBlock));
const newBlock = "t('W24d \u00b7 phone paints runEnd when present and never invents TIME when end is missing',\n    /if \\(c\\.runEnd\\) body \\+=/.test(phoneSrc)\n    && !/c\\.runEnd \\|\\| 'TIME'/.test(phoneSrc)\n    && /THE OUTCOME WORD IS THE ONE FACT/.test(phoneSrc)\n    && /same honesty as TV/.test(phoneSrc));";
// Preserve CRLF if the surrounding file uses it
const newBlockFinal = warm.includes('\r\n') ? newBlock.replace(/\n/g, '\r\n') : newBlock;
warm = warm.slice(0, wIdx) + newBlockFinal + warm.slice(wEnd + 2);
if (Math.abs(warm.length - warmBefore) > 400) {
  console.error('warm size swing too big', warmBefore, warm.length);
  process.exit(1);
}
if (!warm.includes("never invents TIME")) {
  console.error('new W24d missing');
  process.exit(1);
}
if (warm.includes("/c\\.runEnd \\|\\| 'TIME'/.test(phoneSrc)") && !warm.includes("!/c\\.runEnd \\|\\| 'TIME'/")) {
  console.error('W24d still requires invent positively');
  process.exit(1);
}
writeFileSync(warmPath, warm);
console.log('warm ok size', warm.length, 'lines', warm.split(/\r?\n/).length);