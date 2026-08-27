#!/usr/bin/env node
/**
 * Overnight chase-shot probe — instrument-only.
 * Sample iframe operator.shot + operator.until during real RUN (~30s).
 * Report-only. NO cut PR. Leave :5184. Teardown browser; caller kills 5178/5181.
 * HEAD 027a078. Non-chrome Playwright chromium.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 5178, WS = 5181;
const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE = Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
const OUT = path.join(ROOT, 'progress', 'overnight-chase-shot');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HMR_STUB = `const noop = () => {};
export const createHotContext = () => ({ accept: noop, acceptExports: noop, dispose: noop,
  prune: noop, call: noop, invalidate: noop, on: noop, off: noop, send: noop, data: {} });
export const updateStyle = (id, c) => { let e = document.querySelector('style[data-vite-dev-id="'+id+'"]');
  if (!e) { e = document.createElement('style'); e.setAttribute('data-vite-dev-id', id); document.head.appendChild(e); }
  e.textContent = c; };
export const removeStyle = (id) => { document.querySelector('style[data-vite-dev-id="'+id+'"]')?.remove(); };
export const injectQuery = (u) => u;
export const ErrorOverlay = class {};`;

async function main() {
  await mkdir(OUT, { recursive: true });
  const log = [];
  const note = (k, v) => {
    log.push({ k, v, at: Date.now() });
    const line = k + ' ' + (typeof v === 'string' ? v.slice(0, 1400) : JSON.stringify(v).slice(0, 1400));
    console.log(line);
    try { appendFileSync(path.join(ROOT, 'harness', '_warm_out_chase_shot_run.txt'), line + '\n'); } catch (_) {}
  };

  let browser;
  try {
    try {
      browser = await chromium.launch({
        channel: 'chrome',
        headless: true,
        args: ['--disable-dev-shm-usage', '--use-gl=desktop', '--disable-gpu-driver-bug-workarounds'],
      });
      note('browser', 'chrome headless');
    } catch (eChrome) {
      browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] });
      note('browser', 'playwright-chromium fallback ' + eChrome.message);
    }
    /* keep note below as no-op marker */ note('browser_ready', !!browser);
  } catch (e) {
    browser = await chromium.launch({ headless: true });
    note('browser', 'fallback ' + e.message);
  }
  browser.on('disconnected', () => console.error('BROWSER_DISCONNECTED'));
  process.on('SIGTERM', () => console.error('SIGTERM'));
  process.on('SIGINT', () => console.error('SIGINT'));
  note('CODE', CODE);
  note('HEAD', '027a078 chase-shot operator.shot/until probe');
  const base = `http://127.0.0.1:${WEB}`;

  async function seat(name, viewport) {
    const c = await browser.newContext({ viewport });
    await c.route('**/@vite/client', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: HMR_STUB }));
    await c.route('**/follow-bed.js*', async (route) => {
      try {
        const resp = await route.fetch();
        let body = await resp.text();
        if (!body.includes('until: mode ===') && body.includes('operator.shot')) {
          body = body.replace(
            /shot:\s*mode\s*===\s*['"]run['"]\s*\?\s*operator\.shot\s*:\s*mode\s*,/,
            "shot: mode === 'run' ? operator.shot : mode,\n      until: mode === 'run' ? +Number(operator.until).toFixed(3) : null,\n      cutGen: mode === 'run' ? (operator._cutGen || 0) : null,"
          );
          body = body.replace(
            /cut\(runner,\s*lastPortal\)\s*\{/,
            'cut(runner, lastPortal) { this._cutGen = (this._cutGen || 0) + 1;'
          );
        }
        await route.fulfill({ status: 200, contentType: 'application/javascript', body });
      } catch (_) { await route.continue(); }
    });
    if (name) await c.addInitScript((n) => localStorage.setItem('rrr.party.name', n), name);
    return c;
  }

  const tvCtx = await seat(null, { width: 1280, height: 800 });
  const host = await tvCtx.newPage();
  host.setDefaultTimeout(30000);
  await host.goto(`${base}/?view=party.host&room=${CODE}&wsPort=${WS}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await host.waitForSelector('.night-code', { timeout: 25000 });

  const phones = [];
  for (const who of ['Ada', 'Ben']) {
    const c = await seat(who, { width: 390, height: 844 });
    const p = await c.newPage();
    p.setDefaultTimeout(30000);
    await p.goto(`${base}/?view=party.phone&room=${CODE}&wsPort=${WS}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#lock-look', { timeout: 25000 });
    await p.click('#lock-look');
    phones.push({ page: p, name: who });
    note('JOIN', who);
  }
  await sleep(1000);

  for (let i = 0; i < 40; i++) {
    const en = await host.evaluate(() => {
      const b = document.querySelector('#go');
      return b && !b.disabled;
    });
    if (en) break;
    await sleep(400);
  }
  await host.locator('#go').click({ timeout: 20000, force: true });
  note('START', 'ok');

  for (const { page, name } of phones) {
    await page.waitForSelector('.card-view', { state: 'visible', timeout: 45000 }).catch(() => {});
    await page.waitForFunction(() => {
      const b = document.querySelector('#card-done');
      const v = document.querySelector('.card-view');
      return !!b && !!v && !v.classList.contains('hide');
    }, { timeout: 45000 });
    const bar = await page.$('#card-hold');
    if (bar) {
      const box = await bar.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await sleep(300);
        await page.mouse.up();
        await sleep(500);
      }
    }
    await page.locator('#card-done').click({ timeout: 15000, force: true });
    note('CARD_DOWN', name);
  }

  for (const { page, name } of phones) {
    await page.waitForSelector('[data-pick]', { timeout: 45000 });
    for (const step of [0, 1]) {
      await page.waitForSelector('[data-pick]:not([disabled])', { timeout: 25000 });
      const picks = await page.$$('[data-pick]:not([disabled])');
      if (!picks.length) throw new Error(`${name}: no picks step ${step}`);
      const idx = step === 0 ? 0 : Math.min(1, picks.length - 1);
      await picks[idx].click({ timeout: 20000 });
      await page.waitForSelector('#lock-pick', { state: 'visible', timeout: 15000 });
      await page.locator('#lock-pick').click({ timeout: 20000, force: true });
      await sleep(500);
    }
    note('CAST', name);
  }
  await sleep(1200);

  let locked = false;
  for (let i = 0; i < 80; i++) {
    const info = await host.evaluate(() => ({
      hasLock: !!document.querySelector('#lock'),
      beat: (window.__rrrHost || {}).beat,
    }));
    if (info.hasLock) {
      await host.locator('#lock').click({ timeout: 5000, force: true });
      locked = true;
      break;
    }
    const btn = host.locator('button:has-text("Send them in")');
    if (await btn.count()) {
      await btn.first().click({ timeout: 5000, force: true });
      locked = true;
      break;
    }
    await sleep(500);
  }
  if (!locked) throw new Error('Send them in never appeared');
  note('LOCK', 'sent');
  await host.waitForSelector('.run-frame', { timeout: 20000 }).catch(() => {});

  async function sampleOp() {
    return host.evaluate(() => {
      const h = window.__rrrHost || {};
      let bed = null;
      let slug = null;
      for (const f of document.querySelectorAll('iframe')) {
        try {
          const api = f.contentWindow?.__rrrFollow;
          if (!api) continue;
          const r = typeof api.readout === 'function' ? api.readout() : null;
          let rx = null, rz = null;
          try { rx = api.runner?.pos?.x ?? null; rz = api.runner?.pos?.z ?? null; } catch (_) {}
          const doc = f.contentDocument;
          slug = doc?.querySelector?.('[data-shot]')?.textContent?.trim() || null;
          bed = {
            mode: typeof api.mode === 'function' ? api.mode() : api.mode,
            shot: r?.shot ?? null,
            until: r?.until ?? null,
            cutGen: r?.cutGen ?? null,
            throttle: r?.throttle ?? null,
            speed: r?.speed == null ? null : +Number(r.speed).toFixed(4),
            slugShot: slug,
            posX: rx == null ? null : +Number(rx).toFixed(3),
            posZ: rz == null ? null : +Number(rz).toFixed(3),
            readoutKeys: r ? Object.keys(r) : [],
          };
        } catch (_) {}
      }
      return { beat: h.beat, warm: h.warm, followLive: h.followLive, bed };
    });
  }

  let liveAt = null;
  for (let i = 0; i < 180; i++) {
    const s = await sampleOp();
    if (s.beat === 'expedition' && s.warm === 'ready' && s.followLive) {
      liveAt = { i, ...s };
      break;
    }
    if (i % 10 === 0) note('LIVE_POLL_' + i, { beat: s.beat, warm: s.warm, live: s.followLive, shot: s.bed?.shot, until: s.bed?.until });
    await sleep(1000);
  }
  note('LIVE_READY', liveAt ? { i: liveAt.i, shot: liveAt.bed?.shot, until: liveAt.bed?.until, keys: liveAt.bed?.readoutKeys } : 'timeout');
  if (!liveAt) throw new Error('never reached followLive+ready');

  const roles = [];
  for (const { page, name } of phones) {
    roles.push(await page.evaluate((n) => {
      const ph = window.__rrrPhone || {};
      return { name: n, iAmRunner: !!ph.iAmRunner, iAmGuide: !!ph.iAmGuide, hasStick: !!document.querySelector('#stick') };
    }, name));
  }
  note('ROLES', roles);
  const runner = phones.find((p, i) => roles[i]?.iAmRunner) || phones[0];
  if (!roles.find((r) => r.iAmRunner)?.hasStick) throw new Error('runner missing #stick');

  const stickEl = await runner.page.$('#stick');
  const stickBox = await stickEl.boundingBox();
  if (!stickBox) throw new Error('no stick box');
  const cx = stickBox.x + stickBox.width / 2;
  const cy = stickBox.y + stickBox.height / 2;
  const R = Math.min(stickBox.width, stickBox.height) / 2 * 0.85;

  // Drive ~30s real stick+RUN so doorway/lead have a chance
  const dirs = [
    [0, -1], [0.7, -0.7], [1, 0], [0.7, 0.7], [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.8],
  ];
  const samples = [];
  const t0 = Date.now();
  note('PROBE_START', { shot: liveAt.bed?.shot, until: liveAt.bed?.until, cutGen: liveAt.bed?.cutGen });

  // Hold RUN (pointer) then stick (mouse) — hunt29 pattern
  await runner.page.evaluate(() => {
    const btn = document.querySelector('#run-btn');
    if (!btn) return;
    btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, isPrimary: true, buttons: 1 }));
  });
  await sleep(80);
  await runner.page.mouse.move(cx, cy);
  await runner.page.mouse.down();
  note('RUN_HELD', await runner.page.evaluate(() => ({
    hasRun: !!document.querySelector('#run-btn'),
    runOn: !!document.querySelector('#run-btn')?.classList.contains('on'),
  })));

  const probeMs = 30000;
  const legMs = Math.floor(probeMs / dirs.length);
  for (let d = 0; d < dirs.length; d++) {
    const [dx, dy] = dirs[d];
    await runner.page.mouse.move(cx + dx * R, cy + dy * R, { steps: 6 });
    // re-assert RUN each leg (some UIs drop on blur)
    await runner.page.evaluate(() => {
      const btn = document.querySelector('#run-btn');
      if (!btn) return;
      if (!btn.classList.contains('on')) {
        btn.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, isPrimary: true, buttons: 1 }));
      }
    });
    const end = Date.now() + legMs;
    while (Date.now() < end) {
      const s = await sampleOp();
      const runOn = await runner.page.evaluate(() => !!document.querySelector('#run-btn')?.classList.contains('on'));
      const row = {
        t: Date.now() - t0,
        dir: d,
        shot: s.bed?.shot ?? null,
        slugShot: s.bed?.slugShot ?? null,
        until: s.bed?.until ?? null,
        cutGen: s.bed?.cutGen ?? null,
        throttle: s.bed?.throttle ?? null,
        speed: s.bed?.speed ?? null,
        runOn,
        posX: s.bed?.posX,
        posZ: s.bed?.posZ,
        keys: s.bed?.readoutKeys,
      };
      samples.push(row);
      if (samples.length === 1 || samples.length % 8 === 0) note('SAMP_' + samples.length, row);
      await sleep(350);
    }
  }
  await runner.page.evaluate(() => {
    document.querySelector('#run-btn')?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7 }));
  }).catch(() => {});
  await runner.page.mouse.up().catch(() => {});

  const shots = samples.map((s) => s.shot).filter(Boolean);
  const uniqueShots = [...new Set(shots)];
  const slugShots = [...new Set(samples.map((s) => s.slugShot).filter(Boolean))];
  let shotChanges = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].shot && samples[i - 1].shot && samples[i].shot !== samples[i - 1].shot) shotChanges++;
  }
  const untilVals = samples.map((s) => s.until).filter((u) => u != null && Number.isFinite(Number(u))).map(Number);
  const cutGens = samples.map((s) => s.cutGen).filter((u) => u != null && Number.isFinite(Number(u))).map(Number);
  const untilMin = untilVals.length ? Math.min(...untilVals) : null;
  const untilMax = untilVals.length ? Math.max(...untilVals) : null;
  const untilDecreased = untilVals.some((u, i) => i > 0 && u < untilVals[i - 1] - 0.05);
  const untilReset = untilVals.some((u, i) => i > 0 && u > untilVals[i - 1] + 1.5);
  const cutGenStart = cutGens[0] ?? null;
  const cutGenEnd = cutGens.length ? cutGens[cutGens.length - 1] : null;
  const cutsObserved = (cutGenStart != null && cutGenEnd != null) ? cutGenEnd - cutGenStart : null;
  const instrumentOk = samples.some((s) => s.keys && s.keys.includes('until'));

  let diagnosis;
  if (!instrumentOk) {
    diagnosis = 'instrument_miss_until_not_in_readout';
  } else if (cutsObserved != null && cutsObserved >= 2 && uniqueShots.length === 1 && uniqueShots[0] === 'chase') {
    diagnosis = 'cuts_fire_but_always_fallback_chase';
  } else if (cutsObserved != null && cutsObserved <= 1 && !untilDecreased) {
    diagnosis = 'until_stuck_or_not_ticking';
  } else if (uniqueShots.length === 1 && uniqueShots[0] === 'chase' && untilDecreased && untilReset) {
    diagnosis = 'until_ticks_resets_shot_stays_chase';
  } else if (uniqueShots.length > 1) {
    diagnosis = 'shots_changing_ok';
  } else {
    diagnosis = 'chase_stuck_unclear';
  }

  const verdict = {
    head: '027a078',
    code: CODE,
    durationMs: Date.now() - t0,
    sampleCount: samples.length,
    instrumentOk,
    uniqueShots,
    slugShots,
    shotChanges,
    until: { min: untilMin, max: untilMax, decreased: untilDecreased, reset: untilReset, n: untilVals.length },
    cutGen: { start: cutGenStart, end: cutGenEnd, cutsObserved },
    diagnosis,
    prTonight: false,
    prReason: 'report-only; NO cut PR — morning brief',
    sampleHead: samples.slice(0, 3),
    sampleMid: samples[Math.floor(samples.length / 2)] || null,
    sampleTail: samples.slice(-3),
  };
  note('VERDICT', verdict);

  await writeFile(path.join(OUT, 'probe.json'), JSON.stringify({ verdict, samples, log }, null, 2));
  await writeFile(path.join(OUT, 'summary.md'), [
    '# Chase-shot operator.shot / until probe',
    'HEAD: 027a078',
    'code: ' + CODE,
    'durationMs: ' + verdict.durationMs,
    'instrumentOk: ' + instrumentOk,
    'uniqueShots: ' + JSON.stringify(uniqueShots),
    'slugShots: ' + JSON.stringify(slugShots),
    'shotChanges: ' + shotChanges,
    'until: ' + JSON.stringify(verdict.until),
    'cutGen: ' + JSON.stringify(verdict.cutGen),
    'diagnosis: ' + diagnosis,
    'PR: NO (report-only)',
  ].join('\n'));
  await host.screenshot({ path: path.join(OUT, 'tv-end.png') }).catch(() => {});
  console.log('DONE', path.join(OUT, 'summary.md'));
  await browser.close();
}

process.on('uncaughtException', (e) => {
  console.error('UNCAUGHT', e && (e.stack || e));
  try { appendFileSync(path.join(ROOT, 'harness', '_warm_out_chase_shot.err.txt'), 'UNCAUGHT ' + String(e && e.stack || e) + '\n'); } catch (_) {}
  process.exit(1);
});
process.on('unhandledRejection', (e) => {
  console.error('UNHANDLED', e && (e.stack || e));
  try { appendFileSync(path.join(ROOT, 'harness', '_warm_out_chase_shot.err.txt'), 'UNHANDLED ' + String(e && e.stack || e) + '\n'); } catch (_) {}
  process.exit(1);
});
main().catch(async (e) => {
  console.error('FAIL', e && (e.stack || e));
  try { appendFileSync(path.join(ROOT, 'harness', '_warm_out_chase_shot.err.txt'), 'FAIL ' + String(e && e.stack || e) + '\n'); } catch (_) {}
  process.exitCode = 1;
  process.exit(1);
});
