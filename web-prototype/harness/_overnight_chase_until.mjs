#!/usr/bin/env node
/** Chase-shot until probe. Report-only. NO PR. Leave :5184. Playwright chromium (not chrome channel). */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
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
    console.log(k, typeof v === 'string' ? v.slice(0, 1200) : JSON.stringify(v).slice(0, 1200));
  };
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--disable-dev-shm-usage', '--use-gl=swiftshader'] });
    note('browser', 'playwright-chromium');
  } catch (e) {
    browser = await chromium.launch({ headless: true });
    note('browser', 'fallback ' + e.message);
  }
  browser.on('disconnected', () => console.error('BROWSER_DISCONNECTED'));
  note('CODE', CODE);
  note('HEAD', '027a078 chase until probe');
  const base = 'http://127.0.0.1:' + WEB;

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
          body = body.replace(/cut\(runner,\s*lastPortal\)\s*\{/, 'cut(runner, lastPortal) { this._cutGen = (this._cutGen || 0) + 1;');
        }
        await route.fulfill({ status: 200, contentType: 'application/javascript', body });
      } catch (_) { await route.continue(); }
    });
    if (name) await c.addInitScript((n) => localStorage.setItem('rrr.party.name', n), name);
    return c;
  }

  try {
    const tvCtx = await seat(null, { width: 1280, height: 800 });
    const host = await tvCtx.newPage();
    host.setDefaultTimeout(30000);
    await host.goto(base + '/?view=party.host&room=' + CODE + '&wsPort=' + WS, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await host.waitForSelector('.night-code', { timeout: 25000 });
    const phones = [];
    for (const who of ['Ada', 'Ben']) {
      const c = await seat(who, { width: 390, height: 844 });
      const p = await c.newPage();
      p.setDefaultTimeout(30000);
      await p.goto(base + '/?view=party.phone&room=' + CODE + '&wsPort=' + WS, { waitUntil: 'domcontentloaded' });
      await p.waitForSelector('#lock-look', { timeout: 25000 });
      await p.click('#lock-look');
      phones.push({ page: p, name: who });
      note('JOIN', who);
    }
    await sleep(1000);
    for (let i = 0; i < 40; i++) {
      if (await host.evaluate(() => { const b = document.querySelector('#go'); return b && !b.disabled; })) break;
      await sleep(400);
    }
    await host.locator('#go').click({ timeout: 20000, force: true });
    note('START', 'ok');
    for (const { page, name } of phones) {
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
          await page.mouse.down(); await sleep(300); await page.mouse.up(); await sleep(400);
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
        await picks[step === 0 ? 0 : Math.min(1, picks.length - 1)].click({ timeout: 20000 });
        await page.waitForSelector('#lock-pick', { state: 'visible', timeout: 15000 });
        await page.locator('#lock-pick').click({ timeout: 20000, force: true });
        await sleep(400);
      }
      note('CAST', name);
    }
    await sleep(1000);
    let locked = false;
    for (let i = 0; i < 80; i++) {
      if (await host.evaluate(() => !!document.querySelector('#lock'))) {
        await host.locator('#lock').click({ timeout: 5000, force: true }); locked = true; break;
      }
      const btn = host.locator('button:has-text("Send them in")');
      if (await btn.count()) { await btn.first().click({ timeout: 5000, force: true }); locked = true; break; }
      await sleep(400);
    }
    if (!locked) throw new Error('no lock');
    note('LOCK', 'sent');

    async function sampleOp() {
      return host.evaluate(() => {
        const h = window.__rrrHost || {};
        let bed = null;
        for (const f of document.querySelectorAll('iframe')) {
          try {
            const api = f.contentWindow && f.contentWindow.__rrrFollow;
            if (!api) continue;
            const r = typeof api.readout === 'function' ? api.readout() : null;
            const slug = f.contentDocument && f.contentDocument.querySelector('[data-shot]');
            bed = {
              mode: typeof api.mode === 'function' ? api.mode() : api.mode,
              shot: r && r.shot, until: r && r.until, cutGen: r && r.cutGen,
              throttle: r && r.throttle, speed: r && r.speed,
              slugShot: slug ? slug.textContent.trim() : null,
              keys: r ? Object.keys(r) : [],
            };
          } catch (_) {}
        }
        return { beat: h.beat, warm: h.warm, followLive: h.followLive, bed };
      });
    }

    let liveAt = null;
    for (let i = 0; i < 120; i++) {
      const s = await sampleOp();
      if (s.beat === 'expedition' && s.warm === 'ready' && s.followLive) { liveAt = s; break; }
      if (i % 10 === 0) note('LIVE_POLL_' + i, { beat: s.beat, warm: s.warm, live: s.followLive, shot: s.bed && s.bed.shot, until: s.bed && s.bed.until });
      await sleep(1000);
    }
    note('LIVE_READY', liveAt ? { shot: liveAt.bed && liveAt.bed.shot, until: liveAt.bed && liveAt.bed.until, keys: liveAt.bed && liveAt.bed.keys } : 'timeout');
    if (!liveAt) throw new Error('not live');

    const roles = [];
    for (const { page, name } of phones) {
      roles.push(await page.evaluate((n) => {
        const ph = window.__rrrPhone || {};
        return { name: n, iAmRunner: !!ph.iAmRunner, iAmGuide: !!ph.iAmGuide, hasStick: !!document.querySelector('#stick') };
      }, name));
    }
    note('ROLES', roles);
    const runner = phones.find((p, i) => roles[i] && roles[i].iAmRunner) || phones[0];
    const stick = await runner.page.$('#stick');
    const box = await stick.boundingBox();
    if (!box) throw new Error('no stick');
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2, R = Math.min(box.width, box.height) * 0.42;
    const dirs = [[0,-1],[1,0],[0,1],[-1,0],[0.7,-0.7],[-0.7,0.7],[0.7,0.7],[-0.7,-0.7]];
    const samples = [];
    const t0 = Date.now();
    await runner.page.mouse.move(cx, cy); await runner.page.mouse.down();
    for (let d = 0; d < dirs.length; d++) {
      const [dx, dy] = dirs[d];
      await runner.page.mouse.move(cx + dx * R, cy + dy * R, { steps: 4 });
      const end = Date.now() + 3500;
      while (Date.now() < end) {
        const s = await sampleOp();
        const row = { t: Date.now() - t0, d, shot: s.bed && s.bed.shot, slugShot: s.bed && s.bed.slugShot, until: s.bed && s.bed.until, cutGen: s.bed && s.bed.cutGen, throttle: s.bed && s.bed.throttle, speed: s.bed && s.bed.speed, keys: s.bed && s.bed.keys };
        samples.push(row);
        if (samples.length === 1 || samples.length % 10 === 0) note('SAMP_' + samples.length, row);
        await sleep(400);
      }
    }
    await runner.page.mouse.up().catch(() => {});

    const uniqueShots = [...new Set(samples.map((s) => s.shot).filter(Boolean))];
    const untilVals = samples.map((s) => s.until).filter((u) => u != null && Number.isFinite(+u)).map(Number);
    const cutGens = samples.map((s) => s.cutGen).filter((u) => u != null && Number.isFinite(+u)).map(Number);
    let shotChanges = 0;
    for (let i = 1; i < samples.length; i++) if (samples[i].shot && samples[i-1].shot && samples[i].shot !== samples[i-1].shot) shotChanges++;
    const instrumentOk = samples.some((s) => s.keys && s.keys.includes('until'));
    const cutsObserved = cutGens.length ? cutGens[cutGens.length - 1] - cutGens[0] : null;
    const untilDecreased = untilVals.some((u, i) => i > 0 && u < untilVals[i - 1] - 0.05);
    const untilReset = untilVals.some((u, i) => i > 0 && u > untilVals[i - 1] + 1.5);
    let diagnosis = 'unclear';
    if (!instrumentOk) diagnosis = 'instrument_miss';
    else if (cutsObserved != null && cutsObserved >= 2 && uniqueShots.length === 1 && uniqueShots[0] === 'chase') diagnosis = 'cuts_fire_but_always_fallback_chase';
    else if (uniqueShots.length === 1 && uniqueShots[0] === 'chase' && untilDecreased && untilReset) diagnosis = 'until_ticks_resets_shot_stays_chase';
    else if (uniqueShots.length > 1) diagnosis = 'shots_changing_ok';
    else if (uniqueShots.length === 1 && uniqueShots[0] === 'chase') diagnosis = 'chase_stuck';

    const verdict = {
      head: '027a078', code: CODE, durationMs: Date.now() - t0, sampleCount: samples.length,
      instrumentOk, uniqueShots, shotChanges,
      until: { min: untilVals.length ? Math.min(...untilVals) : null, max: untilVals.length ? Math.max(...untilVals) : null, decreased: untilDecreased, reset: untilReset, n: untilVals.length },
      cutGen: { start: cutGens[0] ?? null, end: cutGens.length ? cutGens[cutGens.length - 1] : null, cutsObserved },
      diagnosis, prTonight: false,
      sampleHead: samples.slice(0, 2), sampleTail: samples.slice(-2),
    };
    note('VERDICT', verdict);
    await writeFile(path.join(OUT, 'summary.md'), [
      '# Chase-shot operator.shot / until probe',
      'HEAD: 027a078',
      'code: ' + CODE,
      'durationMs: ' + verdict.durationMs,
      'instrumentOk: ' + instrumentOk,
      'uniqueShots: ' + JSON.stringify(uniqueShots),
      'shotChanges: ' + shotChanges,
      'until: ' + JSON.stringify(verdict.until),
      'cutGen: ' + JSON.stringify(verdict.cutGen),
      'diagnosis: ' + diagnosis,
      'PR: NO',
    ].join('\n'));
    await writeFile(path.join(OUT, 'probe.json'), JSON.stringify({ verdict, samples, log }, null, 2));
    console.log('DONE', path.join(OUT, 'summary.md'));
  } finally {
    await browser.close().catch(() => {});
    note('TEARDOWN', 'browser closed');
  }
}
main().catch((e) => { console.error('FAIL', e); process.exitCode = 1; });