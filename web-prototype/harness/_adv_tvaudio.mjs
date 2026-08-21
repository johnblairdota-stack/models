// throwaway: the SHIPPED AudioContext, inside the SHIPPED cross-origin feed frame.
import { chromium } from 'playwright';
import { startShow } from '../net/party/show.mjs';
const CHROME = process.env.RRR_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const INIT = `
  (() => {
    window.__acs = [];
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const W = function (...a) {
      const c = new AC(...a);
      const rec = { at: Date.now(), created: c.state, later: null, t0: c.currentTime };
      window.__acs.push(rec);
      setTimeout(() => { rec.later = c.state; rec.advanced = +(c.currentTime - rec.t0).toFixed(3); }, 3000);
      return c;
    };
    W.prototype = AC.prototype;
    window.AudioContext = W; window.webkitAudioContext = W;
  })();
`;
const TVINIT = `window.__feedReady = false;
  addEventListener('message', e => { if (e.data && e.data.t === 'rrr.feed') window.__feedReady = e.data; });`;

async function run(label, { gesture, policy }) {
  const PORT = 5401 + (gesture ? 1 : 0) + (policy === null ? 10 : 0);
  const show = startShow({ port: PORT, code: 'aud' + PORT, stamp: 1700000000000 });
  await sleep(150);
  const br = await chromium.launch({ executablePath: CHROME,
    args: [...(policy ? [`--autoplay-policy=${policy}`] : []), '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await br.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(INIT);
  await page.addInitScript(TVINIT);
  await page.goto(`http://127.0.0.1:${PORT}/?house=http://127.0.0.1:5178`);
  await sleep(500);
  if (gesture) await page.keyboard.press('Space');   // rolls the show AND is the parent's gesture
  else await page.evaluate(() => { const w = new WebSocket('ws://x'); }).catch(()=>{});
  // mountFeed only runs on a state frame; without a gesture we roll the show over the socket instead
  if (!gesture) {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?role=tv`);
    await new Promise(r => { ws.onopen = r; ws.onerror = r; });
    ws.send(JSON.stringify({ t: 'start' }));
    // 5 phones needed to begin
  }
  await sleep(1000);
  let f = null;
  for (let k = 0; k < 60; k++) {
    f = page.frames().find(fr => fr.url().startsWith('http://127.0.0.1:5178'));
    if (f) { const ready = await f.evaluate(() => document.body?.dataset?.rrrReady ?? null).catch(()=>null); if (ready) break; }
    await sleep(1000);
  }
  const inFrame = f ? await f.evaluate(() => ({
    acs: (window.__acs || []).map(x => ({ created: x.created, later: x.later, advanced: x.advanced })),
    hasBeenActive: navigator.userActivation?.hasBeenActive ?? 'n/a',
    ready: document.body?.dataset?.rrrReady ?? null,
  })).catch(e => ({ err: String(e).slice(0,160) })) : { err: 'no house frame' };
  const tvSide = await page.evaluate(() => ({ feedReady: window.__feedReady, feedClass: document.getElementById('feed')?.className ?? null }));
  console.log(`\n### ${label}`);
  console.log('   house frame :', JSON.stringify(inFrame));
  console.log('   tv side     :', JSON.stringify(tvSide));
  await br.close(); await show.close();
}
// 5 phones so the show can begin
async function seat(port, n = 5) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
    await new Promise(r => { ws.onopen = r; ws.onerror = r; });
    ws.onmessage = () => {};
    ws.send(JSON.stringify({ t: 'join', name: 'P' + i }));
    out.push(ws); await sleep(60);
  }
  return out;
}
// patch: seat phones right after startShow — redefine run with seating
await (async () => {
  for (const [label, opts] of [
    ['NO gesture anywhere · chrome default policy', { gesture: false, policy: 'document-user-activation-required' }],
    ['Space on the TV (the host rolls) · chrome default policy', { gesture: true, policy: 'document-user-activation-required' }],
  ]) {
    const PORT = 5401 + (opts.gesture ? 1 : 0);
    const show = startShow({ port: PORT, code: 'aud', stamp: 1700000000000 });
    await sleep(150);
    const socks = await seat(PORT);
    const br = await chromium.launch({ executablePath: CHROME,
      args: [`--autoplay-policy=${opts.policy}`, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await br.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript(INIT); await page.addInitScript(TVINIT);
    await page.goto(`http://127.0.0.1:${PORT}/?house=http://127.0.0.1:5178`);
    await sleep(600);
    if (opts.gesture) await page.keyboard.press('Space');
    else { const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?role=tv`); await new Promise(r=>{ws.onopen=r;ws.onerror=r;}); ws.onmessage=()=>{}; ws.send(JSON.stringify({t:'start'})); }
    let f = null;
    for (let k = 0; k < 70; k++) {
      f = page.frames().find(fr => fr.url().startsWith('http://127.0.0.1:5178'));
      if (f) { const r = await f.evaluate(() => document.body?.dataset?.rrrReady ?? null).catch(()=>null); if (r) break; }
      await sleep(1000);
    }
    await sleep(3500);
    const inFrame = f ? await f.evaluate(() => ({
      acs: (window.__acs || []).map(x => ({ created: x.created, later: x.later, advanced: x.advanced })),
      hasBeenActive: navigator.userActivation?.hasBeenActive ?? 'n/a',
      ready: document.body?.dataset?.rrrReady ?? null,
    })).catch(e => ({ err: String(e).slice(0,160) })) : { err: 'no house frame' };
    const tvSide = await page.evaluate(() => ({ feedReady: window.__feedReady, feedClass: document.getElementById('feed')?.className ?? null, phase: window.frame?.phase ?? null }));
    console.log(`\n### ${label}`);
    console.log('   house frame :', JSON.stringify(inFrame));
    console.log('   tv side     :', JSON.stringify(tvSide));
    await br.close(); socks.forEach(s => { try { s.close(); } catch {} }); await show.close();
  }
})();
