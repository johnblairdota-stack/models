import { readFileSync, writeFileSync } from 'node:fs';

const p = 'src/views/party-host.js';
let s = readFileSync(p, 'utf8');

function mustReplace(label, old, neu) {
  if (!s.includes(old)) {
    console.error(label + '_MISS');
    process.exit(1);
  }
  s = s.replace(old, neu);
}

mustReplace(
  'CALL',
  'alarms: frame?.incident?.alarms,\r\n      });',
  'alarms: frame?.incident?.alarms,\r\n        followLive: follow.live,\r\n      });',
);

if (s.includes('warmSlot.textContent')) {
  console.error('ALREADY');
  process.exit(1);
}
mustReplace(
  'READY',
  "root.querySelector('.run-frame')?.classList.add('live');",
  "root.querySelector('.run-frame')?.classList.add('live');\r\n" +
    '      /* Once the bed is live/run, CAMERA WARMING must not stay readable in the host underlay. */\r\n' +
    "      const warmSlot = root.querySelector('.run-slot');\r\n" +
    "      if (warmSlot) warmSlot.textContent = '';",
);

mustReplace(
  'SIG',
  'function runStage({ names, lobby, runnerId, guideId, cameras, alarms }) {',
  'function runStage({ names, lobby, runnerId, guideId, cameras, alarms, followLive }) {',
);

mustReplace(
  'SLOT',
  '<div class="run-slot">camera warming</div>',
  "<div class=\"run-slot\">${followLive ? '' : 'camera warming'}</div>",
);

writeFileSync(p, s);
console.log('ok', {
  followLiveArg: s.includes('followLive: follow.live'),
  clearSlot: s.includes("warmSlot.textContent = ''"),
  sig: /alarms, followLive/.test(s),
  slotCond: s.includes("followLive ? '' : 'camera warming'"),
});
