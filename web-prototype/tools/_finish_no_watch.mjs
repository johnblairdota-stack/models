import { readFileSync, writeFileSync } from 'node:fs';

// ---- host: rewrite onRun -> recap transition cleanly ----
{
  const p = 'src/views/party-host.js';
  let s = readFileSync(p, 'utf8');
  const startPhrase = 'if (onRun) {';
  const start = s.indexOf(startPhrase);
  const mid = s.indexOf("} else if (show === 'casting')", start);
  if (start < 0 || mid < 0) { console.error('bounds', start, mid); process.exit(1); }

  // Keep runStage call; rebuild from after runStage's closing }); through casting else-if
  const runStageEnd = s.indexOf('});', start);
  if (runStageEnd < 0) { console.error('runStage end missing'); process.exit(1); }
  const afterRunStage = runStageEnd + 3; // after });

  const replacement = `});
      /*
       * 🗑️ **THE RECAP BUTTON IS GONE, AND IT IS THE AFFORDANCE RATHER THAN THE BEAT THAT WENT.**
       * John: *"Drop Recap for now (host and phones). It doesn't make sense before a round and
       * isn't useful yet."* It sat next to "Watch the run" all through the expedition, so the one
       * button on the TV that could cut the show short was a card of three facts about an episode
       * that had not finished. \`show.js\`'s clock still walks to \`recap\` on its own and
       * \`recapBoard\` still draws it, so nothing was deleted from the wire — but nobody can reach
       * it by hand, which is what John was asking for.
       *
       * Overnight post-#23: the mid-expedition "Watch the run" button is gone too. Mid-run it only
       * re-setBeat('expedition') — a no-op that still looked like the host should press it
       * (playcritique residual). Casting keeps the button when a pair is already locked so a
       * refreshed TV can jump back onto the run; recap keeps "Run" for the same recovery.
       */
    } else if (show === 'recap') {
      body += recapBoard(recap, names, ui.runEnd);
      body += \`<div class="actions"><button class="btn ghost" id="to-cast">Ballots</button>
        <button class="btn ghost" id="to-run">Run</button></div>\`;
      if (episode === 1 || phase === 'DEBRIEF' || phase === 'VERDICT') {
        body += \`<p class="hint" style="margin-top:16px">No eviction this episode. Phones down — talk.</p>\`;
      }
    `;

  const out = s.slice(0, start) + 'if (onRun) {\n      body += runStage({\n        names,\n        lobby: client.lobby,\n        runnerId: pair.runner || recap.runner,\n        guideId: pair.guide || recap.guide,\n        cameras: frame?.cameras,\n        alarms: frame?.incident?.alarms,\n      ' + replacement + s.slice(mid);
  writeFileSync(p, out);
  console.log('host rewritten');
}

// verify host
{
  const s = readFileSync('src/views/party-host.js', 'utf8');
  const chunk = s.match(/if \(onRun\) \{[\s\S]*?\n    \} else if \(show === 'recap'\)/);
  if (!chunk) { console.error('verify: no chunk'); process.exit(1); }
  if (/<button[^>]*>Watch the run<\/button>/.test(chunk[0]) || /id="to-run">Watch the run/.test(chunk[0])) {
    console.error('verify: button still in onRun'); process.exit(1);
  }
  if (!/if \(hasPair\) body \+= `[\s\S]*?Watch the run/.test(s)) {
    console.error('verify: casting recovery lost'); process.exit(1);
  }
  if (!/id="to-run">Run/.test(s)) {
    console.error('verify: recap Run lost'); process.exit(1);
  }
  console.log('host verify ok');
}

// ---- warm: replace any W22* with clean button-only gates ----
{
  const p = 'harness/party-warm.mjs';
  let s = readFileSync(p, 'utf8');
  const mark = "t('W21h";
  const mi = s.indexOf(mark);
  if (mi < 0) { console.error('W21h missing'); process.exit(1); }
  // Find the closing } of the W21 block — first \n} after W21h that precedes W23
  const w23 = s.indexOf('// ---- W23', mi);
  if (w23 < 0) { console.error('W23 missing'); process.exit(1); }
  // Walk back to the } that closes the W21 { block
  const close = s.lastIndexOf('\n}', w23);
  if (close < 0 || close < mi) { console.error('close missing', close); process.exit(1); }

  // Keep W21h assertion; strip everything after W21h's closing ); until block close
  const w21hEnd = s.indexOf(');', mi);
  if (w21hEnd < 0) { console.error('W21h end missing'); process.exit(1); }
  const insert = `);

  t('W22 — live expedition does not paint a Watch the run button', (() => {
    const chunk = hostSrc.match(/if \\(onRun\\) \\{[\\s\\S]*?\\n    \\} else if \\(show === 'recap'\\)/);
    return !!(chunk && !/<button[^>]*>Watch the run<\\/button>/.test(chunk[0])
      && !/id="to-run">Watch the run/.test(chunk[0]));
  })());
  t('W22a control — casting with a locked pair still offers Watch the run',
    /if \\(hasPair\\) body \\+= \`[\\s\\S]*?Watch the run/.test(hostSrc));
`;
  const out = s.slice(0, w21hEnd) + insert + s.slice(close);
  writeFileSync(p, out);
  console.log('warm rewritten');
}