import { readFileSync, writeFileSync } from 'node:fs';

const p = 'src/views/party-host.js';
let s = readFileSync(p, 'utf8');

const start = s.indexOf('      /*\n       * 🗑️ **THE RECAP BUTTON IS GONE');
if (start < 0) {
  // try without emoji issues — find by unique phrase
}
const phrase = 'THE RECAP BUTTON IS GONE';
const pi = s.indexOf(phrase);
if (pi < 0) { console.error('phrase missing'); process.exit(1); }
const blockStart = s.lastIndexOf('/*', pi);
const elseIf = s.indexOf('} else if (show === \'recap\')', pi);
if (blockStart < 0 || elseIf < 0) { console.error('bounds', { blockStart, elseIf }); process.exit(1); }

const replacement = `      /*
       * 🗑️ **THE RECAP BUTTON IS GONE, AND IT IS THE AFFORDANCE RATHER THAN THE BEAT THAT WENT.**
       * John: *"Drop Recap for now (host and phones). It doesn't make sense before a round and
       * isn't useful yet."* It sat next to "Watch the run" all through the expedition, so the one
       * button on the TV that could cut the show short was a card of three facts about an episode
       * that had not finished. \`show.js\`'s clock still walks to \`recap\` on its own and
       * \`recapBoard\` still draws it, so nothing was deleted from the wire — but nobody can reach
       * it by hand, which is what John was asking for.
       *
       * Overnight post-#23: "Watch the run" itself is gone from the live expedition too. Mid-run
       * it only re-setBeat('expedition') — a no-op that still looked like the host should press
       * it (playcritique residual). Casting keeps the button when a pair is already locked so a
       * refreshed TV can jump back onto the run; recap keeps "Run" for the same recovery.
       */
    `;

const out = s.slice(0, blockStart) + replacement + s.slice(elseIf);
writeFileSync(p, out);
console.log('reformatted', { blockStart, elseIf });
