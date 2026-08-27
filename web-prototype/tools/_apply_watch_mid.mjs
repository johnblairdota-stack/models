import { readFileSync, writeFileSync } from "node:fs";

const hp = "web-prototype/src/views/party-host.js";
let h = readFileSync(hp, "utf8");

const old = `      /*
       * 🗑️ **THE RECAP BUTTON IS GONE, AND IT IS THE AFFORDANCE RATHER THAN THE BEAT THAT WENT.**
       * John: *"Drop Recap for now (host and phones). It doesn't make sense before a round and
       * isn't useful yet."* It sat next to "Watch the run" all through the expedition, so the one
       * button on the TV that could cut the show short was a card of three facts about an episode
       * that had not finished. \`show.js\`'s clock still walks to \`recap\` on its own and
       * \`recapBoard\` still draws it, so nothing was deleted from the wire — but nobody can reach
       * it by hand, which is what John was asking for.
       */
      body += \`<div class="actions run-actions">
        <button class="btn ghost" id="to-run">Watch the run</button>
      </div>\`;
    } else if (show === 'recap') {
      body += recapBoard(recap, names, ui.runEnd);
      body += \`<div class="actions"><button class="btn ghost" id="to-cast">Ballots</button>
        <button class="btn ghost" id="to-run">Run</button></div>\`;`;

const neu = `      /*
       * 🗑️ **THE RECAP BUTTON IS GONE, AND IT IS THE AFFORDANCE RATHER THAN THE BEAT THAT WENT.**
       * John: *"Drop Recap for now (host and phones). It doesn't make sense before a round and
       * isn't useful yet."* It sat next to "Watch the run" all through the expedition, so the one
       * button on the TV that could cut the show short was a card of three facts about an episode
       * that had not finished. \`show.js\`'s clock still walks to \`recap\` on its own and
       * \`recapBoard\` still draws it, so nothing was deleted from the wire — but nobody can reach
       * it by hand, which is what John was asking for.
       *
       * Overnight post-#23: "Watch the run" itself is gone once the run owns the beat. Mid-run it
       * only re-setBeat('expedition') — a no-op that still looked like the host should press it
       * (playcritique residual). Same on recap: the old "Run" button was that same affordance.
       * Casting keeps Watch the run when a pair is already locked so a refreshed TV can jump back
       * onto the run.
       */
    } else if (show === 'recap') {
      body += recapBoard(recap, names, ui.runEnd);
      body += \`<div class="actions"><button class="btn ghost" id="to-cast">Ballots</button></div>\`;`;

// Normalize line endings for match
const hLF = h.replace(/\r\n/g, "\n");
const oldLF = old.replace(/\r\n/g, "\n");
if (!hLF.includes(oldLF)) {
  console.error("exact block not found");
  // debug: find run-actions vicinity
  const i = hLF.indexOf("run-actions");
  console.error("run-actions at", i, i >= 0 ? JSON.stringify(hLF.slice(i - 80, i + 200)) : "");
  process.exit(1);
}
const outLF = hLF.replace(oldLF, neu);
writeFileSync(hp, outLF.includes("\r\n") ? outLF : outLF); // keep LF; git will CRLF on checkout as needed
console.log("host ok", { before: hLF.length, after: outLF.length });

// Sanity
const onRun = outLF.match(/if \(onRun\) \{[\s\S]*?\n    \} else if \(show === 'recap'\)/);
if (!onRun || /id="to-run"/.test(onRun[0])) { console.error("onRun fail"); process.exit(1); }
const recap = outLF.match(/\} else if \(show === 'recap'\) \{[\s\S]*?\n    \} else if \(show === 'casting'\)/);
if (!recap || /id="to-run"/.test(recap[0])) { console.error("recap fail"); process.exit(1); }
if (!/if \(hasPair\) body \+= `[\s\S]*?Watch the run/.test(outLF)) { console.error("casting fail"); process.exit(1); }

const wp = "web-prototype/harness/party-warm.mjs";
let w = readFileSync(wp, "utf8").replace(/\r\n/g, "\n");
const close = w.indexOf("\n}", w.indexOf("t('W21h"));
if (close < 0) { console.error("warm close missing"); process.exit(1); }
if (w.includes("t('W22")) { console.log("warm already"); }
else {
  const insert = `

  t('W22 — live expedition does not paint a Watch the run button', (() => {
    const chunk = hostSrc.match(/if \\(onRun\\) \\{[\\s\\S]*?\\n    \\} else if \\(show === 'recap'\\)/);
    return !!(chunk && !/<button[^>]*>Watch the run<\\/button>/.test(chunk[0])
      && !/id="to-run">Watch the run/.test(chunk[0]));
  })());
  t('W22a control — casting with a locked pair still offers Watch the run',
    /if \\(hasPair\\) body \\+= \`[\\s\\S]*?Watch the run/.test(hostSrc));
  t('W22b — recap does not paint the old Run / Watch-the-run affordance', (() => {
    const chunk = hostSrc.match(/\\} else if \\(show === 'recap'\\) \\{[\\s\\S]*?\\n    \\} else if \\(show === 'casting'\\)/);
    return !!(chunk && !/id="to-run"/.test(chunk[0]));
  })());
`;
  w = w.slice(0, close) + insert + w.slice(close);
  writeFileSync(wp, w);
  console.log("warm ok");
}