import { readFileSync, writeFileSync } from 'node:fs';
const p = 'harness/party-warm.mjs';
let s = readFileSync(p, 'utf8');
if (s.includes("W25d")) { console.log('gate already'); process.exit(0); }
const old = `t('W25c — warm/intros hide the follow slug (no dim WARM · WALK on air)',\r\n    /#fl\\.pre \\.slug \\{ opacity:0; \\}/.test(followSrc)\r\n    && !/#fl\\.pre \\.slug \\{ opacity:\\.35; \\}/.test(followSrc));`;
const neu = old + `\r\n  t('W25d — host clears CAMERA WARMING underlay once follow is live/run',\r\n    /followLive: follow\\.live/.test(hostSrc)\r\n    && /warmSlot\\.textContent = ''/.test(hostSrc)\r\n    && /followLive \\? '' : 'camera warming'/.test(hostSrc));`;
if (!s.includes(old)) { console.error('W25c_MISS'); process.exit(1); }
s = s.replace(old, neu);
writeFileSync(p, s);
console.log('gate ok', s.includes('W25d'));
