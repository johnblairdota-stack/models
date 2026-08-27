import { readFileSync, writeFileSync } from 'node:fs';

const p = 'src/views/party-host.js';
let s = readFileSync(p, 'utf8');

const marker = 'body += `<div class="actions run-actions">';
const i = s.indexOf(marker);
if (i < 0) { console.error('marker missing'); process.exit(1); }
const end = s.indexOf('`;', i);
if (end < 0) { console.error('end missing'); process.exit(1); }

const before = s.slice(0, i);
const after = s.slice(end + 2); // after `;

const insertLines =
`       * Overnight post-#23: "Watch the run" itself is gone from the live expedition too. Mid-run
       * it only re-setBeat('expedition') — a no-op that still looked like the host should press
       * it (playcritique residual). Casting keeps the button when a pair is already locked so a
       * refreshed TV can jump back onto the run; recap keeps "Run" for the same recovery.
`;

const commentClose = before.lastIndexOf('*/');
if (commentClose < 0) { console.error('comment close missing'); process.exit(1); }
const b2 = before.slice(0, commentClose) + insertLines + before.slice(commentClose);

// Drop the button block; keep a single blank line before else-if
let rest = after.replace(/^\r?\n/, '');
const out = b2 + rest;
writeFileSync(p, out);
console.log('ok host', { removedChars: end + 2 - i, at: i });
