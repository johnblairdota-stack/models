const fs = require('fs');
const p = 'harness/_overnight_verify28.mjs';
let s = fs.readFileSync(p, 'utf8');
const old = `  let liveAt = null;
  for (let i = 0; i < 90; i++) {
    const snap = await host.evaluate(() => {
      const f = window.__rrrFollow;
      const body = document.body?.innerText || '';
      return {
        beat: f?.beat || null,
        warm: f?.warm || null,
        followLive: !!f?.followLive,
        followMode: f?.followMode || null,
        cameraWarming: /CAMERA WARMING/i.test(body),
      };
    });
    if (snap.followLive && snap.warm === 'ready') { liveAt = { i, ...snap }; break; }
    await sleep(1000);
  }
  note('LIVE_READY', liveAt || 'TIMEOUT');
  if (!liveAt) throw new Error('no live follow');`;
const neu = `  let liveAt = null;
  for (let i = 0; i < 120; i++) {
    const snap = await host.evaluate(() => {
      const h = window.__rrrHost || {};
      const body = document.body?.innerText || '';
      return {
        beat: h.beat || null,
        warm: h.warm || null,
        followLive: !!h.followLive,
        followMode: h.followMode || null,
        cameraWarming: /CAMERA WARMING/i.test(body),
      };
    });
    if (snap.beat === 'expedition' && snap.warm === 'ready' && snap.followLive) {
      liveAt = { i, ...snap };
      break;
    }
    await sleep(400);
  }
  note('LIVE_READY', liveAt || 'TIMEOUT');
  if (!liveAt) throw new Error('no live follow');`;
if (!s.includes(old)) {
  console.log('OLD BLOCK MISSING');
  const i = s.indexOf('let liveAt');
  console.log(s.slice(i, i + 900));
  process.exit(1);
}
s = s.replace(old, neu);
// also fix bed sample to use __rrrHost / __rrrFollow if present
s = s.replace(
  `const bed = await host.evaluate(() => {
      const f = window.__rrrFollow;
      return { speed: f?.bed?.speed ?? f?.speed ?? null, pos: f?.bed?.pos || null, room: f?.bed?.room || f?.runnerRoom || null };
    });`,
  `const bed = await host.evaluate(() => {
      const h = window.__rrrHost || {};
      const f = window.__rrrFollow || {};
      return {
        speed: f?.bed?.speed ?? f?.speed ?? h.speed ?? null,
        warm: h.warm || null,
        followLive: !!h.followLive,
        room: f?.bed?.room || null,
      };
    });`
);
fs.writeFileSync(p, s);
console.log('patched live poll');
