#!/usr/bin/env node
/**
 * Overnight stick-mag x bed-speed co-log (~30s open floor).
 * Report-only. NO curve PR. Keep main CLEAN.
 * Real Playwright mouse on #stick. Leave :5184 alone.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 5178, WS = 5181;
const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE = Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
const OUT = path.join(ROOT, 'progress', 'overnight-stickmag-speed');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STICK_DEADZONE = 0.15;

function stickMag(x, y) {
  const m = Math.hypot(Number(x) || 0, Number(y) || 0);
  if (m <= STICK_DEADZONE) return 0;
  const t = Math.min(1, (m - STICK_DEADZONE) / (1 - STICK_DEADZONE));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

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
    browser = await chromium.launch({
      headless: true,
      args: ['--disable-dev-shm-usage', '--use-gl=swiftshader'],
    });
    note('browser', 'playwright-chromium');
  } catch (e) {
    browser = await chromium.launch({ headless: true });
    note('browser', 'fallback ' + e.message);
  }
  browser.on('disconnected', () => console.error('BROWSER_DISCONNECTED'));
  note('CODE', CODE);
  note('HEAD', '027a078 stick-mag x bed-speed co-log');
  const base = `http://127.0.0.1:${WEB}`;

  async function seat(name, viewport) {
    const c = await browser.newContext({ viewport });
    await c.route('**/@vite/client', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: HMR_STUB }));
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
  for (let i = 0; i < 100; i++) {
    const info = await host.evaluate(() => {
      const lock = document.querySelector('#lock');
      const send = [...document.querySelectorAll('button')].find((b) => /Send them in/i.test(b.textContent || ''));
      return {
        hasLock: !!lock,
        lockDisabled: !!(lock && lock.disabled),
        hasSend: !!send,
        beat: (window.__rrrHost || {}).beat,
        bodyHint: (document.body?.innerText || '').slice(0, 200).replace(/\n/g, ' | '),
      };
    });
    if (i % 10 === 0) note('LOCK_POLL_' + i, info);
    if (info.hasLock && !info.lockDisabled) {
      const clicked = await host.evaluate(() => {
        const lock = document.querySelector('#lock');
        if (!lock || lock.disabled) return false;
        lock.click();
        return true;
      });
      if (clicked) { locked = true; break; }
    }
    if (info.hasSend) {
      const clicked = await host.evaluate(() => {
        const send = [...document.querySelectorAll('button')].find((b) => /Send them in/i.test(b.textContent || ''));
        if (!send || send.disabled) return false;
        send.click();
        return true;
      });
      if (clicked) { locked = true; break; }
    }
    await sleep(500);
  }
  if (!locked) throw new Error('Send them in never appeared');
  note('LOCK', 'sent');
  await host.waitForSelector('.run-frame', { timeout: 20000 }).catch(() => {});

  async function sampleFollow() {
    return host.evaluate(() => {
      const h = window.__rrrHost || {};
      let bed = null;
      for (const f of document.querySelectorAll('iframe')) {
        try {
          const api = f.contentWindow?.__rrrFollow;
          if (!api) continue;
          const r = typeof api.readout === 'function' ? api.readout() : null;
          let rx = null, rz = null;
          try { rx = api.runner?.pos?.x ?? null; rz = api.runner?.pos?.z ?? null; } catch (_) {}
          let world = null;
          try { world = typeof api.world === 'function' ? api.world() : null; } catch (_) {}
          bed = {
            mode: typeof api.mode === 'function' ? api.mode() : api.mode,
            speed: r?.speed == null ? null : +Number(r.speed).toFixed(4),
            throttle: r?.throttle ?? null,
            shot: r?.shot ?? null,
            room: world?.runner?.room ?? r?.room ?? null,
            posX: rx == null ? null : +Number(rx).toFixed(3),
            posZ: rz == null ? null : +Number(rz).toFixed(3),
          };
        } catch (_) {}
      }
      return {
        beat: h.beat, warm: h.warm, warmPct: h.warmPct, followLive: h.followLive, followMode: h.followMode,
        lastPad: h.lastPad || h.pad || null, bed,
      };
    });
  }

  async function samplePad(page) {
    return page.evaluate(() => {
      const stick = document.querySelector('#stick');
      const nub = document.querySelector('[data-nub]');
      const t = nub?.style?.transform || '';
      let px = null, py = null;
      const m = t.match(/translate\(calc\(-50%\s*\+\s*([-\d.]+)%\),\s*calc\(-50%\s*\+\s*([-\d.]+)%\)\)/);
      if (m) {
        px = Number(m[1]) / 78;
        py = -Number(m[2]) / 78;
      }
      return {
        stickOn: !!stick?.classList.contains('on'),
        runOn: !!document.querySelector('#run-btn')?.classList.contains('on'),
        padX: px == null || !Number.isFinite(px) ? null : +px.toFixed(3),
        padY: py == null || !Number.isFinite(py) ? null : +py.toFixed(3),
        rawHypot: px != null && py != null ? +Math.hypot(px, py).toFixed(3) : null,
        nubTransform: t,
      };
    });
  }

  let liveAt = null;
  for (let i = 0; i < 180; i++) {
    const s = await sampleFollow();
    if (s.beat === 'expedition' && s.warm === 'ready' && s.followLive) {
      liveAt = { i, ...s };
      break;
    }
    if (i % 10 === 0) note('LIVE_POLL_' + i, { beat: s.beat, warm: s.warm, warmPct: s.warmPct, live: s.followLive, mode: s.bed?.mode, fm: s.followMode, speed: s.bed?.speed });
    await sleep(1000);
  }
  note('LIVE_READY', liveAt ? { i: liveAt.i, room: liveAt.bed?.room, mode: liveAt.bed?.mode, warmPct: liveAt.warmPct } : 'timeout');
  if (!liveAt) throw new Error('never reached followLive+ready');

  const roles = [];
  for (const { page, name } of phones) {
    const r = await page.evaluate((n) => {
      const ph = window.__rrrPhone || {};
      return { name: n, iAmRunner: !!ph.iAmRunner, iAmGuide: !!ph.iAmGuide, hasStick: !!document.querySelector('#stick') };
    }, name);
    roles.push(r);
  }
  note('ROLES', roles);
  const runner = phones.find((p, i) => roles[i]?.iAmRunner) || phones[0];
  if (!roles.find((r) => r.iAmRunner)?.hasStick) throw new Error('runner missing #stick');

  const stickEl = await runner.page.$('#stick');
  const stickBox = await stickEl.boundingBox();
  if (!stickBox) throw new Error('no stick box');
  const cx = stickBox.x + stickBox.width / 2;
  const cy = stickBox.y + stickBox.height / 2;
  const R = Math.min(stickBox.width, stickBox.height) / 2;

  const LEVELS = [
    { label: '0.00', raw: 0.00, holdMs: 2500 },
    { label: '0.25', raw: 0.25, holdMs: 5000 },
    { label: '0.40', raw: 0.40, holdMs: 5000 },
    { label: '0.60', raw: 0.60, holdMs: 5000 },
    { label: '0.80', raw: 0.80, holdMs: 5000 },
    { label: '1.00', raw: 1.00, holdMs: 5000 },
  ];

  const samples = [];
  const shotSet = new Set();
  let shotChanges = 0;
  let lastShot = null;
  const t0 = Date.now();
  note('COLOG_START', { room: liveAt.bed?.room, levels: LEVELS.map((l) => l.label) });

  for (const lev of LEVELS) {
    const cmdMag = stickMag(0, lev.raw);
    if (lev.raw === 0) {
      await runner.page.mouse.up().catch(() => {});
      await runner.page.mouse.move(cx, cy);
    } else {
      const tx = cx;
      const ty = cy - lev.raw * R;
      await runner.page.mouse.move(cx, cy);
      await runner.page.mouse.down();
      await runner.page.mouse.move(tx, ty, { steps: 8 });
    }

    const end = Date.now() + lev.holdMs;
    let n = 0;
    while (Date.now() < end) {
      const [bedHost, pad] = await Promise.all([sampleFollow(), samplePad(runner.page)]);
      const padRaw = pad.rawHypot != null ? pad.rawHypot : lev.raw;
      const padX = pad.padX != null ? pad.padX : 0;
      const padY = pad.padY != null ? pad.padY : lev.raw;
      const magApplied = stickMag(padX, padY);
      const shot = bedHost.bed?.shot ?? null;
      if (shot != null) {
        shotSet.add(shot);
        if (lastShot != null && shot !== lastShot) shotChanges++;
        lastShot = shot;
      }
      const row = {
        t: Date.now() - t0,
        level: lev.label,
        cmdRaw: lev.raw,
        cmdStickMag: +cmdMag.toFixed(4),
        padRaw: padRaw == null ? null : +Number(padRaw).toFixed(3),
        padStickMag: +magApplied.toFixed(4),
        stickOn: pad.stickOn,
        speed: bedHost.bed?.speed,
        throttle: bedHost.bed?.throttle,
        shot,
        room: bedHost.bed?.room,
        posX: bedHost.bed?.posX,
        posZ: bedHost.bed?.posZ,
      };
      samples.push(row);
      if (n === 0 || Date.now() + 900 >= end) note('SAMP_' + lev.label + '_' + n, row);
      n++;
      await sleep(400);
    }
  }

  await runner.page.mouse.up().catch(() => {});
  await sleep(800);

  const after = [];
  for (let i = 0; i < 5; i++) {
    const s = await sampleFollow();
    after.push({ speed: s.bed?.speed, throttle: s.bed?.throttle, shot: s.bed?.shot });
    await sleep(400);
  }
  note('AFTER_RELEASE', after);

  const byLevel = {};
  for (const s of samples) {
    if (!byLevel[s.level]) byLevel[s.level] = [];
    byLevel[s.level].push(s);
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  const summary = Object.keys(byLevel).sort().map((level) => {
    const rows = byLevel[level];
    const steady = rows.length > 2 ? rows.slice(1) : rows;
    const speeds = steady.map((r) => Number(r.speed)).filter((n) => Number.isFinite(n));
    const mags = steady.map((r) => Number(r.padStickMag)).filter((n) => Number.isFinite(n));
    const cmdMags = steady.map((r) => Number(r.cmdStickMag)).filter((n) => Number.isFinite(n));
    const thrCounts = {};
    for (const r of steady) thrCounts[r.throttle || '?'] = (thrCounts[r.throttle || '?'] || 0) + 1;
    const rooms = [...new Set(steady.map((r) => r.room).filter(Boolean))];
    return {
      level,
      n: steady.length,
      cmdStickMag: cmdMags[0] ?? null,
      meanPadStickMag: mean(mags) == null ? null : +mean(mags).toFixed(4),
      meanSpeed: mean(speeds) == null ? null : +mean(speeds).toFixed(4),
      maxSpeed: speeds.length ? +Math.max(...speeds).toFixed(4) : null,
      minSpeed: speeds.length ? +Math.min(...speeds).toFixed(4) : null,
      throttles: thrCounts,
      rooms,
      ratioSpeedPerMag: (mean(mags) > 0.05 && mean(speeds) != null)
        ? +(mean(speeds) / mean(mags)).toFixed(4)
        : null,
    };
  });

  const moving = summary.filter((s) => Number(s.cmdStickMag) > 0);
  let curveMush = false;
  const curveNotes = [];
  for (let i = 1; i < moving.length; i++) {
    const a = moving[i - 1], b = moving[i];
    if (a.meanSpeed != null && b.meanSpeed != null && b.meanSpeed + 0.02 < a.meanSpeed) {
      curveMush = true;
      curveNotes.push(`non-mono ${a.level}->${b.level}: ${a.meanSpeed}->${b.meanSpeed}`);
    }
  }
  const l40 = summary.find((s) => s.level === '0.40');
  const l60 = summary.find((s) => s.level === '0.60');
  if (l40?.meanSpeed != null && l60?.meanSpeed != null) {
    const dMag = Math.abs((l60.meanPadStickMag || 0) - (l40.meanPadStickMag || 0));
    const dSpd = Math.abs(l60.meanSpeed - l40.meanSpeed);
    if (dMag > 0.15 && dSpd < 0.05) {
      curveMush = true;
      curveNotes.push(`mid-flat 0.40<->0.60 dMag=${dMag.toFixed(3)} dSpd=${dSpd.toFixed(3)}`);
    }
  }

  const roomsSeen = [...new Set(samples.map((s) => s.room).filter(Boolean))];
  const walkRunSamples = samples.filter((s) => s.throttle === 'WALK' || s.throttle === 'RUN');
  const shotsNearWalkRun = [...new Set(walkRunSamples.map((s) => s.shot).filter(Boolean))];

  const verdict = {
    head: '027a078',
    code: CODE,
    durationMs: Date.now() - t0,
    sampleCount: samples.length,
    roomsSeen,
    summary,
    curveMush,
    curveNotes,
    shotChangesTotal: shotChanges,
    uniqueShots: [...shotSet],
    shotsNearWalkRun,
    afterRelease: after,
    prTonight: false,
    prReason: 'report-only; NO blind curve PR even if mushy',
  };
  note('VERDICT', verdict);

  await writeFile(path.join(OUT, 'colog.json'), JSON.stringify({ verdict, samples, log }, null, 2));
  await writeFile(path.join(OUT, 'summary.md'), [
    '# Stick-mag x bed-speed co-log',
    'HEAD: 027a078',
    'durationMs: ' + verdict.durationMs,
    'rooms: ' + JSON.stringify(roomsSeen),
    'shotChanges: ' + shotChanges + ' unique=' + JSON.stringify([...shotSet]) + ' nearWalkRun=' + JSON.stringify(shotsNearWalkRun),
    'curveMush: ' + curveMush + ' notes=' + JSON.stringify(curveNotes),
    'PR: NO (report-only)',
    '',
    '| level | cmdMag | meanPadMag | meanSpeed | maxSpeed | ratio | throttles |',
    '|------:|-------:|-----------:|----------:|---------:|------:|-----------|',
    ...summary.map((s) => `| ${s.level} | ${s.cmdStickMag} | ${s.meanPadStickMag} | ${s.meanSpeed} | ${s.maxSpeed} | ${s.ratioSpeedPerMag} | ${JSON.stringify(s.throttles)} |`),
  ].join('\n'));
  await host.screenshot({ path: path.join(OUT, 'tv-end.png') }).catch(() => {});
  await runner.page.screenshot({ path: path.join(OUT, 'runner-end.png') }).catch(() => {});

  console.log('DONE', path.join(OUT, 'summary.md'));
  await browser.close();
}

main().catch(async (e) => {
  console.error('FAIL', e);
  process.exitCode = 1;
});
