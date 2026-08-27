/**
 * playcritique threat/mission probe — does the hunter threaten, does the mission pay off,
 * does the run end on what the player did?
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 5178, WS = 5181, CODE = (process.argv[2] || 'pcrb').toLowerCase();
const OUT = path.join(ROOT, 'progress', 'feel-probe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const notes = [];
const note = (k, v) => { notes.push({ k, v }); console.log(`  ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`); };

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const HMR = `const noop=()=>{}; export const createHotContext=()=>({accept:noop,acceptExports:noop,dispose:noop,prune:noop,decline:noop,invalidate:noop,on:noop,off:noop,send:noop,data:{}}); export const updateStyle=(id,c)=>{let e=document.querySelector('style[data-vite-dev-id="'+id+'"]'); if(!e){e=document.createElement('style');e.setAttribute('data-vite-dev-id',id);document.head.appendChild(e);} e.textContent=c;}; export const removeStyle=(id)=>document.querySelector('style[data-vite-dev-id="'+id+'"]')?.remove(); export const injectQuery=(u)=>u; export const ErrorOverlay=class{};`;

async function seat(name, viewport) {
  const c = await browser.newContext({ viewport });
  await c.route('**/@vite/client', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: HMR }));
  if (name) await c.addInitScript((n) => localStorage.setItem('rrr.party.name', n), name);
  return c;
}

const base = `http://127.0.0.1:${WEB}`;
try {
  const tvCtx = await seat(null, { width: 1600, height: 900 });
  const tv = await tvCtx.newPage();
  await tv.goto(`${base}/?view=party.host&room=${CODE}&wsPort=${WS}`, { waitUntil: 'domcontentloaded' });
  await tv.waitForSelector('.night-code', { timeout: 20000 });

  const phones = [];
  for (const who of ['Ada', 'Bo', 'Cy']) {
    const c = await seat(who, { width: 430, height: 900 });
    const p = await c.newPage();
    p.on('pageerror', (e) => console.log(`  pageerror ${who}: ${e.message}`));
    await p.goto(`${base}/?view=party.phone&room=${CODE}&wsPort=${WS}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#lock-look', { timeout: 25000 });
    await p.click('#lock-look');
    phones.push({ page: p, name: who });
  }
  await sleep(800);
  await tv.evaluate(() => document.querySelector('#go')?.click());
  await sleep(800);

  for (const { page } of phones) {
    await page.waitForSelector('#card-done', { state: 'visible', timeout: 30000 });
    const box = await (await page.$('#card-hold')).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down(); await sleep(300); await page.mouse.up();
    await sleep(400); await page.click('#card-done');
  }
  for (const { page } of phones) {
    await page.waitForSelector('[data-pick]', { timeout: 20000 });
    for (const step of [0, 1]) {
      const picks = await page.$$('[data-pick]:not([disabled])');
      await picks[step === 0 ? 0 : Math.min(1, picks.length - 1)].click();
      await page.waitForSelector('#lock-pick', { state: 'visible', timeout: 15000 });
      await page.click('#lock-pick'); await sleep(200);
    }
  }
  await sleep(500);
  await tv.waitForSelector('#lock:not([disabled])', { timeout: 20000 });
  const tLock = Date.now();
  await tv.evaluate(() => document.querySelector('#lock')?.click());
  await tv.waitForSelector('.run-frame', { timeout: 15000 });
  const hold = async () => { await tv.evaluate(() => document.querySelector('#to-run')?.click()); await sleep(400); };
  await hold();

  let bakeMs = null;
  const bakeLog = [];
  for (let i = 0; i < 150; i++) {
    const st = await tv.evaluate(() => {
      const ifr = document.querySelector('iframe.run-cam');
      const w = ifr?.contentWindow;
      if (!document.querySelector('.run-cam-layer')?.classList.contains('live')) document.querySelector('#to-run')?.click();
      let mode = null; try { mode = w?.__rrrFollow?.mode?.() ?? null; } catch { mode = 'xorigin'; }
      return {
        iframe: !!ifr, src: (ifr?.getAttribute('src') || '').slice(0, 90),
        hasFollow: !!w?.__rrrFollow, mode,
        ds: w?.document?.body?.dataset?.rrrFollow ?? null,
        layerLive: !!document.querySelector('.run-cam-layer')?.classList.contains('live'),
        beat: window.__rrrHost?.beat ?? null,
      };
    });
    if (i % 5 === 0) bakeLog.push({ s: i, ...st });
    if (st.mode === 'run' && st.ds === 'live') { bakeMs = Date.now() - tLock; break; }
    await sleep(1000);
  }
  note('bake.log', bakeLog);
  note('bake.toRunMs', bakeMs);
  if (bakeMs == null) throw new Error('bake never reached run');

  const seats = [];
  for (const { page, name } of phones) {
    const s = await page.evaluate(() => ({ runner: !!window.__rrrPhone?.iAmRunner, guide: !!window.__rrrPhone?.iAmGuide }));
    seats.push({ page, name, ...s });
  }
  const runner = seats.find((s) => s.runner);
  const guide = seats.find((s) => s.guide);
  note('roles', { runner: runner?.name, guide: guide?.name });
  if (!runner) throw new Error('no runner seat');

  const world = () => tv.evaluate(() => {
    const f = document.querySelector('iframe.run-cam')?.contentWindow?.__rrrFollow;
    if (!f) return null;
    let w = {}; let ht = {}; let r = {};
    try { w = f.world?.() ?? {}; } catch (e) { w = { err: String(e) }; }
    try { ht = f.hunterTelemetry?.() ?? {}; } catch (e) { ht = {}; }
    try { r = f.readout?.() ?? {}; } catch (e) { r = {}; }
    return {
      rx: +f.runner.pos.x.toFixed(2), rz: +f.runner.pos.z.toFixed(2),
      hx: w.hunter?.x ?? null, hz: w.hunter?.z ?? null,
      hroom: w.hunter?.room ?? null, rroom: w.runner?.room ?? null,
      mission: w.mission ?? null, throttle: r.throttle ?? null, speed: r.speed ?? null,
      htel: ht, shot: r.shot ?? null,
    };
  });

  note('world.keys.sample', await world());

  const box = await runner.page.locator('#stick').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

  // hold RUN down for the whole sweep — loudest possible runner
  const runBtn = await runner.page.$('#run-btn');
  if (runBtn) {
    const rb = await runBtn.boundingBox();
    await runner.page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
    await runner.page.mouse.down();
    await runner.page.mouse.up();
  }

  // ---- A. Drive for 40 s. Does the hunter EVER notice? ----
  const samples = [];
  const t0 = Date.now();
  await runner.page.mouse.move(cx, cy);
  await runner.page.mouse.down();
  let flipped = null;
  for (let i = 0; i < 40; i++) {
    const ang = (i / 40) * Math.PI * 2;
    await runner.page.mouse.move(cx + Math.sin(ang) * box.width * 0.45, cy - Math.cos(ang) * box.height * 0.45, { steps: 2 });
    await sleep(1000);
    const w = await world();
    if (w) {
      const d = (w.hx != null) ? +Math.hypot(w.rx - w.hx, w.rz - w.hz).toFixed(2) : null;
      samples.push({
        t: Math.round((Date.now() - t0) / 1000), d, hroom: w.hroom, rroom: w.rroom,
        htel: w.htel, mission: w.mission?.phase, throttle: w.throttle,
        speed: w.speed == null ? null : +Number(w.speed).toFixed(2), shot: w.shot,
      });
    }
    const beat = await tv.evaluate(() => window.__rrrHost?.beat ?? null);
    if (beat && beat !== 'expedition' && beat !== 'run') { flipped = { s: Math.round((Date.now() - t0) / 1000), beat }; break; }
  }
  await runner.page.mouse.up().catch(() => {});
  note('beat.flipped', flipped);

  const ds = samples.map((s) => s.d).filter((x) => x != null);
  note('threat.samples', samples.length);
  note('threat.minDistM', ds.length ? Math.min(...ds) : null);
  note('threat.maxDistM', ds.length ? Math.max(...ds) : null);
  note('threat.hunterTelKeys', Object.keys(samples[0]?.htel ?? {}));
  note('threat.hunterTelDistinct', [...new Set(samples.map((s) => JSON.stringify(s.htel)))].slice(0, 6));
  note('threat.missionPhases', [...new Set(samples.map((s) => s.mission))]);
  note('threat.throttles', [...new Set(samples.map((s) => s.throttle))]);
  note('threat.speedMax', Math.max(...samples.map((s) => Number(s.speed) || 0)));
  note('threat.hunterRooms', [...new Set(samples.map((s) => s.hroom))]);
  note('threat.runnerRooms', [...new Set(samples.map((s) => s.rroom))]);
  note('threat.shots', [...new Set(samples.map((s) => s.shot))]);

  const runnerText = await runner.page.evaluate(() => document.body.innerText.replace(/\s*\n+\s*/g, ' | ').slice(0, 600));
  note('runner.phoneText', runnerText);
  const tvText = await tv.evaluate(() => document.body.innerText.replace(/\s*\n+\s*/g, ' | ').slice(0, 400));
  note('tv.text', tvText);
  if (guide) {
    const gText = await guide.page.evaluate(() => document.body.innerText.replace(/\s*\n+\s*/g, ' | ').slice(0, 600));
    note('guide.phoneText', gText);
  }
  note('beat.now', await tv.evaluate(() => window.__rrrHost?.beat ?? null));
  note('ms.sinceLock', Date.now() - tLock);
  await runner.page.screenshot({ path: path.join(OUT, 'pc-runner.png') });
  await tv.screenshot({ path: path.join(OUT, 'pc-tv.png') });
  if (guide) await guide.page.screenshot({ path: path.join(OUT, 'pc-guide.png') });

  await writeFile(path.join(OUT, 'pc-threat.json'), JSON.stringify({ notes, samples }, null, 2));
  console.log('\npc threat probe done');
  await browser.close(); process.exit(0);
} catch (e) {
  console.log('PC PROBE FAIL:', e?.message || e);
  await writeFile(path.join(OUT, 'pc-threat.json'), JSON.stringify({ notes, error: String(e?.message || e) }, null, 2)).catch(() => {});
  await browser.close().catch(() => {});
  process.exit(1);
}
