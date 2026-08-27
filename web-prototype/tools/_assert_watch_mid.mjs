import { readFileSync } from 'node:fs';
const host = readFileSync('src/views/party-host.js', 'utf8');
const warm = readFileSync('harness/party-warm.mjs', 'utf8');
const onRun = host.match(/if \(onRun\) \{[\s\S]*?\n    \} else if \(show === 'recap'\)/);
const out = {
  noWatchMidExpedition: !!(onRun && !/<button[^>]*>Watch the run<\/button>/.test(onRun[0]) && !/id="to-run">Watch the run/.test(onRun[0])),
  castingKeepsWatch: /if \(hasPair\) body \+= `[\s\S]*?Watch the run/.test(host),
  introsGuard23: /ui\.beat === 'expedition' \|\| ui\.beat === 'recap'/.test(host) && /function maybeIntros/.test(host),
  w21h: /W21h/.test(warm),
  w22: /t\('W22/.test(warm) && /t\('W22a/.test(warm),
  recapStillHasRun: /show === 'recap'[\s\S]*?id="to-run">Run/.test(host),
};
console.log(JSON.stringify(out, null, 2));
if (!out.noWatchMidExpedition || !out.castingKeepsWatch || !out.introsGuard23 || !out.w21h || !out.w22) process.exit(2);
