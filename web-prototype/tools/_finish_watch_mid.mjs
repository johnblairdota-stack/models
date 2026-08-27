import { readFileSync, writeFileSync } from "node:fs";
const p = "web-prototype/src/views/party-host.js";
let s = readFileSync(p, "utf8");

const commentRe = /\* Overnight post-#23:[\s\S]*?same recovery\.\r?\n/;
if (!commentRe.test(s)) { console.error("comment missing"); process.exit(1); }
s = s.replace(commentRe, `* Overnight post-#23: "Watch the run" itself is gone once the run owns the beat.
       * Mid-run it only re-setBeat('expedition') — a no-op that still looked like the host should
       * press it (playcritique residual). Same on recap: the old "Run" button was the same
       * affordance. Casting keeps Watch the run when a pair is already locked so a refreshed TV
       * can jump back onto the run.
`);

const recapRe = /body \+= `<div class="actions"><button class="btn ghost" id="to-cast">Ballots<\/button>\r?\n\s*<button class="btn ghost" id="to-run">Run<\/button><\/div>`;/;
if (!recapRe.test(s)) { console.error("recap actions missing"); process.exit(1); }
s = s.replace(recapRe, "body += `<div class=\"actions\"><button class=\"btn ghost\" id=\"to-cast\">Ballots</button></div>`;");

const onRunChunk = s.match(/if \(onRun\) \{[\s\S]*?\n    \} else if \(show === 'recap'\)/);
if (!onRunChunk) { console.error("onRun chunk missing"); process.exit(1); }
if (/id="to-run"/.test(onRunChunk[0]) || /<button[^>]*>Watch the run<\/button>/.test(onRunChunk[0])) {
  console.error("Watch the run BUTTON still in onRun"); process.exit(1);
}
const recapChunk = s.match(/\} else if \(show === 'recap'\) \{[\s\S]*?\n    \} else if \(show === 'casting'\)/);
if (!recapChunk) { console.error("recap chunk missing"); process.exit(1); }
if (/id="to-run"/.test(recapChunk[0])) {
  console.error("to-run still in recap"); process.exit(1);
}
if (!/if \(hasPair\) body \+= `[\s\S]*?Watch the run/.test(s)) {
  console.error("casting Watch the run lost"); process.exit(1);
}

writeFileSync(p, s);
console.log("host ok");