import { readFileSync, writeFileSync } from 'node:fs';

// --- party-host.js ---
{
  const p = 'src/views/party-host.js';
  let s = readFileSync(p, 'utf8');
  const re = /if \(m\.ready\) \{[\s\S]*?return;\n    \}/;
  const m = s.match(re);
  if (!m) { console.error('ready block missing'); process.exit(1); }
  const neu = `if (m.ready) {
      follow.live = true;
      root.querySelector('.run-frame')?.classList.add('live');
      /*
       * Overnight post-#25: sendCue can "succeed" (contentWindow exists) before the
       * iframe has installed its message listener — cuedRunner latches and the bed
       * stays in warm, stamping WARM · WALK over a live ready expedition. Clear and
       * retry once the follow view is actually listening (this ready message).
       * Resolve runner the same way paint() does (pair || recap).
       */
      const pair = client.frame?.pair || {};
      const recap = recapFromEvents(client.events);
      const runnerId = pair.runner || recap.runner || null;
      if (runnerId) {
        ui.cuedRunner = null;
        cueRun(runnerId, players());
      }
      return;
    }`;
  s = s.replace(re, neu);
  if (!/cuedRunner: ui\.cuedRunner/.test(s)) {
    s = s.replace(/followMode: follow\.mode,/, 'followMode: follow.mode,\n      cuedRunner: ui.cuedRunner,');
  }
  writeFileSync(p, s);
  console.log('host', /ui\.cuedRunner = null/.test(s), /recap\.runner \|\| null/.test(s));
}

// --- follow.js slug hide ---
{
  const p = 'src/party/follow.js';
  let s = readFileSync(p, 'utf8');
  if (!s.includes('#fl.pre .slug { opacity:.35; }')) {
    console.error('slug rule missing'); process.exit(1);
  }
  s = s.replace(
    '#fl.pre .slug { opacity:.35; }',
    '/* No production graphic during warm/intros — a dim WARM · WALK lied on air. */\n    #fl.pre .slug { opacity:0; }'
  );
  writeFileSync(p, s);
  console.log('follow', s.includes('#fl.pre .slug { opacity:0; }'));
}

// --- party-warm gates ---
{
  const p = 'harness/party-warm.mjs';
  let s = readFileSync(p, 'utf8');
  if (s.includes("W25b — follow ready clears cuedRunner")) {
    console.log('warm gates already present');
  } else {
    if (!s.includes("const followSrc = await readFile")) {
      s = s.replace(
        "const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');",
        "const hostSrc = await readFile(new URL('../src/views/party-host.js', import.meta.url), 'utf8');\n  const followSrc = await readFile(new URL('../src/party/follow.js', import.meta.url), 'utf8');"
      );
    }
    s = s.replace(
      /t\('W25a — follow ready retries the run cue for the locked pair',\r?\n\s*\/if \(m\.ready\)\/\.test\(hostSrc\)\r?\n\s*&& \/if \(runnerId\) cueRun\(runnerId\/\.test\(hostSrc\)\);/,
      `t('W25a — follow ready retries the run cue for the locked pair',
    /if (m.ready)/.test(hostSrc)
    && /cueRun(runnerId/.test(hostSrc));
  t('W25b — follow ready clears cuedRunner so a premature postMessage cannot stick WARM · WALK',
    /if (m.ready)/.test(hostSrc)
    && /ui.cuedRunner = null/.test(hostSrc)
    && /cueRun(runnerId/.test(hostSrc));
  t('W25c — warm/intros hide the follow slug (no dim WARM · WALK on air)',
    /#fl\\.pre \\.slug \\{ opacity:0; \\}/.test(followSrc)
    && !/#fl\\.pre \\.slug \\{ opacity:\\.35; \\}/.test(followSrc));`
    );
    writeFileSync(p, s);
    console.log('warm', s.includes('W25b'), s.includes('W25c'));
  }
}
