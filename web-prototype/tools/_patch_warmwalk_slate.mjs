import { readFileSync, writeFileSync } from 'node:fs';
const p = 'harness/_overnight_warmwalk.mjs';
let s = readFileSync(p, 'utf8');
const needle = "cameraWarmingSlot: /camera warming/i.test(body),";
const insert = `cameraWarmingSlot: /camera warming/i.test(body),
        runFrameLive: !!document.querySelector('.run-frame.live'),
        slateOpacity: (() => { const el = document.querySelector('.run-slate'); return el ? getComputedStyle(el).opacity : null; })(),
        camLayerLive: !!document.querySelector('.run-cam-layer.live'),
        camLayerWarm: !!document.querySelector('.run-cam-layer.warm'),`;
if (!s.includes('slateOpacity')) {
  if (!s.includes(needle)) { console.error('needle missing'); process.exit(1); }
  s = s.replace(needle, insert);
}
s = s.replace(/head: 'WARM[^']*'/, "head: 'WARM·WALK hunt on main a73cac7'");
s = s.replace(/note\('HEAD', '[^']*'\)/, "note('HEAD', 'a73cac7 Merge #24 WARM·WALK')");
writeFileSync(p, s);
console.log('ok', s.includes('slateOpacity'));
