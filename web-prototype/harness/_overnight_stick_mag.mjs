#!/usr/bin/env node
/**
 * Overnight stick-mag × bed-speed co-log (~30s drive).
 * Morning item: mushy low-end (~0.41 while You walk) = curve/deadzone or wall?
 * Report-only — NO curve PR tonight (steering). Leave :5184. Teardown chrome.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { appendFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 5178, WS = 5181;
const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE = Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
const OUT = path.join(ROOT, 'progress', 'overnight-stick-mag');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WALK = 2.55;
const DZ = 0.15;

function stickMag(x, y) {
  const m = Math.hypot(+x || 0, +y || 0);
  if (m <= DZ) return 0;
  const t = Math.min(1, (m - DZ) / (1 - DZ));
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
  const RUNLOG = path.join(ROOT, 'harness', '_warm_out_stick_mag_run.txt');
  try { writeFileSync(RUNLOG, ''); } catch (_) {}
  const note = (k, v) => {
    log.push({ k, v, at: Date.now() });
    const line = k + ' ' + (typeof v === 'string' ? v.slice(0, 1400) : JSON.stringify(v).slice(0, 1400));
    console.log(line);
    try { appendFileSync(RUNLOG, line + '\n'); } catch (_) {}
  };

  let browser;
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: true,
      args: ['--use-gl=desktop', '--disable-gpu-driver-bug-workarounds'],
    });
    note('browser', 'chrome GPU');
  } catch (e) {
    browser = await chromium.launch({ headless: true });
    note('browser', 'fallback ' + e.message);
  }
  note('CODE', CODE);
  note('HEAD', '027a078 stick-mag x speed co-log');
  process.on('SIGINT', () => { try { browser?.close(); } catch (_) {} });
  try {
  const base = `http://127.0.0.1:${WEB}`;

  async function seat(name, viewport) {
    const c = await browser.newContext({ viewport });
    await c.route('**/@vite/client', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: HMR_STUB }));
    if (name) await c.addInitScript((n) => localStorage.setItem('rrr.party.name', n), name);
    return c;
  }

  const tvCtx = await seat(null, { width: 1280, height: 800 });
  const host = await tvCtx.newPage();
  await host.goto(`${base}/?view=party.host&room=${CODE}&wsPort=${WS}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await host.waitForSelector('.night-code', { timeout: 25000 });

  const phones = [];
  for (const who of ['Ada', 'Ben']) {
    const c = await seat(who, { width: 390, height: 844 });
    const p = await c.newPage();
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
      await page.waitForSelector('[data-pick]:not([disabled])', { timeout: 20000 });
      const picks = await page.$$('[data-pick]:not([disabled])');
      if (!picks.length) throw new Error(`${name}: no picks step ${step}`);
      const idx = step === 0 ? 0 : Math.min(1, picks.length - 1);
      await picks[idx].click({ timeout: 20000 });
      await page.waitForSelector('#lock-pick', { state: 'visible', timeout: 15000 });
      await page.locator('#lock-pick').click({ timeout: 20000, force: true });
      await sleep(400);
    }
    note('CAST', name);
  }
  await sleep(1200);

  let locked = false;
  for (let i = 0; i < 80; i++) {
    const info = await host.evaluate(() => ({
      hasLock: !!document.querySelector('#lock'),
      beat: window.__rrrHost?.beat,
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
  if (!locked) {
    const dump = await host.evaluate(() => ({
      beat: window.__rrrHost?.beat,
      warm: window.__rrrHost?.warm,
      body: (document.body?.innerText || '').slice(0, 800).replace(/\n/g, ' | '),
      lock: !!document.querySelector('#lock'),
      buttons: [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim()).slice(0, 20),
    }));
    note('LOCK_FAIL', dump);
    throw new Error('Send them in never appeared');
  }
  note('LOCK', 'sent');
  await host.waitForSelector('.run-frame', { timeout: 20000 }).catch(() => {});

  let liveAt = null;
  for (let i = 0; i < 90; i++) {
    const s = await host.evaluate(() => {
      const h = window.__rrrHost || {};
      return { beat: h.beat, warm: h.warm, followLive: h.followLive, followMode: h.followMode };
    });
    if (s.beat === 'expedition' && s.warm === 'ready' && s.followLive) {
      liveAt = { i, ...s };
      break;
    }
    await sleep(400);
  }
  note('LIVE_READY', liveAt || 'timeout');
  if (!liveAt) throw new Error('never reached expedition+ready+followLive');

  let runner = null;
  for (const ph of phones) {
    const r = await ph.page.evaluate((n) => {
      const ph = window.__rrrPhone || {};
      return {
        name: n,
        iAmRunner: !!ph.iAmRunner,
        iAmGuide: !!ph.iAmGuide,
        hasStick: !!document.querySelector('#stick'),
        h1: document.querySelector('h1')?.textContent?.trim() || '',
      };
    }, ph.name);
    note('ROLE', r);
    if (r.iAmRunner && r.hasStick) runner = ph;
  }
  if (!runner) throw new Error('no runner with stick');

  const parsePad = async () => runner.page.evaluate(() => {
    const nub = document.querySelector('[data-nub]');
    const stick = document.querySelector('#stick');
    const t = nub?.style?.transform || '';
    // translate(calc(-50% + X%), calc(-50% + Y%))  X=pad.x*78, Y=-pad.y*78
    const m = t.match(/translate\(\s*calc\(\s*-50%\s*\+\s*([-\d.]+)%\s*\)\s*,\s*calc\(\s*-50%\s*\+\s*([-\d.]+)%\s*\)\s*\)/);
    let px = 0, py = 0;
    if (m) {
      px = +m[1] / 78;
      py = -(+m[2] / 78);
    }
    return {
      rawX: +px.toFixed(4),
      rawY: +py.toFixed(4),
      rawHyp: +Math.hypot(px, py).toFixed(4),
      stickOn: !!stick?.classList.contains('on'),
      nub: t,
      h1: document.querySelector('h1')?.textContent?.trim() || '',
    };
  });

  const bedSnap = async () => host.evaluate(() => {
    const h = window.__rrrHost || {};
    let bed = null;
    let shot = null;
    let thr = null;
    try {
      for (const f of document.querySelectorAll('iframe')) {
        const api = f.contentWindow?.__rrrFollow;
        if (!api) continue;
        const readout = typeof api.readout === 'function' ? api.readout() : null;
        const world = typeof api.world === 'function' ? api.world() : null;
        const runner = api.runner;
        bed = {
          mode: typeof api.mode === 'function' ? api.mode() : api.mode,
          speed: readout?.speed ?? null,
          throttle: readout?.throttle ?? null,
          shot: readout?.shot ?? null,
          room: world?.runner?.room ?? null,
          rx: runner?.pos?.x != null ? +Number(runner.pos.x).toFixed(3) : (world?.runner?.x ?? null),
          rz: runner?.pos?.z != null ? +Number(runner.pos.z).toFixed(3) : (world?.runner?.z ?? null),
        };
        const slug = f.contentDocument?.querySelector('#fl .slug');
        if (slug) {
          shot = slug.querySelector('[data-shot]')?.textContent?.trim() || null;
          thr = slug.querySelector('[data-thr]')?.textContent?.trim() || null;
        }
        break;
      }
    } catch (_) {}
    return { warm: h.warm, followLive: h.followLive, bed, slugShot: shot, slugThr: thr };
  });

  const stickBox = await runner.page.locator('#stick').boundingBox();
  if (!stickBox) throw new Error('#stick has no box');
  const cx = stickBox.x + stickBox.width / 2;
  const cy = stickBox.y + stickBox.height / 2;

  // Settle: release any prior, wait for AI-ish motion to settle briefly
  await runner.page.mouse.up().catch(() => {});
  await sleep(400);

  const samples = [];
  const shotChanges = [];
  let lastShotKey = null;

  // Sweep commanded throw fractions (of stick radius). Stick-only (walk), no RUN.
  // 0.35 ≈ near deadzone edge mush; 0.55 mid; 0.85 strong; 0.98 full throw.
  const phases = [
    { name: 'hold_0.35', frac: 0.35, ms: 4500 },
    { name: 'hold_0.55', frac: 0.55, ms: 4500 },
    { name: 'hold_0.85', frac: 0.85, ms: 5500 },
    { name: 'hold_0.98', frac: 0.98, ms: 7000 },
    { name: 'arc_0.90', frac: 0.90, ms: 6000, arc: true },
  ];

  const t0 = Date.now();
  for (const ph of phases) {
    await runner.page.mouse.move(cx, cy);
    await runner.page.mouse.down();
    const pushY = cy - stickBox.height * 0.5 * ph.frac;
    await runner.page.mouse.move(cx, pushY, { steps: 8 });
    const until = Date.now() + ph.ms;
    let i = 0;
    while (Date.now() < until) {
      if (ph.arc) {
        const ang = ((Date.now() - (until - ph.ms)) / ph.ms) * Math.PI * 0.7 - 0.35;
        await runner.page.mouse.move(
          cx + Math.sin(ang) * stickBox.width * 0.5 * ph.frac,
          cy - Math.cos(ang) * stickBox.height * 0.5 * ph.frac,
          { steps: 1 },
        );
      }
      await sleep(280);
      const pad = await parsePad();
      const bed = await bedSnap();
      const sm = stickMag(pad.rawX, pad.rawY);
      const expectWalk = +(sm * WALK).toFixed(3);
      const speed = bed.bed?.speed == null ? null : +Number(bed.bed.speed);
      const ratio = (speed != null && expectWalk > 0.08) ? +(speed / expectWalk).toFixed(3) : null;
      const shotKey = `${bed.slugShot || bed.bed?.shot || '?'}·${bed.slugThr || bed.bed?.throttle || '?'}`;
      if (lastShotKey != null && shotKey !== lastShotKey) {
        shotChanges.push({ at: Date.now() - t0, from: lastShotKey, to: shotKey, phase: ph.name, speed, sm: +sm.toFixed(3) });
      }
      lastShotKey = shotKey;
      const row = {
        t: Date.now() - t0,
        phase: ph.name,
        cmdFrac: ph.frac,
        rawHyp: pad.rawHyp,
        rawX: pad.rawX,
        rawY: pad.rawY,
        stickMag: +sm.toFixed(4),
        expectWalk,
        speed,
        ratio,
        throttle: bed.bed?.throttle,
        shot: bed.bed?.shot,
        slug: shotKey,
        room: bed.bed?.room,
        rx: bed.bed?.rx,
        rz: bed.bed?.rz,
        stickOn: pad.stickOn,
        h1: pad.h1,
        i,
      };
      samples.push(row);
      i++;
    }
    await runner.page.mouse.up();
    await sleep(350);
  }

  // Summaries per phase
  const byPhase = {};
  for (const s of samples) {
    (byPhase[s.phase] ||= []).push(s);
  }
  const phaseStats = {};
  for (const [name, rows] of Object.entries(byPhase)) {
    const speeds = rows.map((r) => r.speed).filter((v) => v != null);
    const mags = rows.map((r) => r.stickMag);
    const raws = rows.map((r) => r.rawHyp);
    const ratios = rows.map((r) => r.ratio).filter((v) => v != null);
    const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    const first = rows[0], last = rows[rows.length - 1];
    const move = (first && last && first.rx != null && last.rx != null)
      ? Math.hypot(last.rx - first.rx, last.rz - first.rz)
      : null;
    phaseStats[name] = {
      n: rows.length,
      meanRawHyp: mean(raws) != null ? +mean(raws).toFixed(3) : null,
      meanStickMag: mean(mags) != null ? +mean(mags).toFixed(3) : null,
      meanSpeed: mean(speeds) != null ? +mean(speeds).toFixed(3) : null,
      meanExpectWalk: mean(rows.map((r) => r.expectWalk)) != null ? +mean(rows.map((r) => r.expectWalk)).toFixed(3) : null,
      meanRatio: mean(ratios) != null ? +mean(ratios).toFixed(3) : null,
      minSpeed: speeds.length ? Math.min(...speeds) : null,
      maxSpeed: speeds.length ? Math.max(...speeds) : null,
      moveM: move != null ? +move.toFixed(3) : null,
      rooms: [...new Set(rows.map((r) => r.room).filter(Boolean))],
      throttles: [...new Set(rows.map((r) => r.throttle).filter(Boolean))],
      near041: rows.filter((r) => r.speed != null && r.speed >= 0.30 && r.speed <= 0.55).length,
    };
  }

  // Classification heuristics (report-only)
  const full = phaseStats['hold_0.98'] || phaseStats['hold_0.85'];
  const low = phaseStats['hold_0.35'];
  let verdict = 'ambiguous';
  let reason = '';
  if (full && full.meanStickMag >= 0.85 && full.meanRatio != null && full.meanRatio < 0.45 && full.moveM < 0.6) {
    verdict = 'wall_or_blocked';
    reason = 'full throw stickMag high but speed/ratio low and little displacement — contact likely';
  } else if (full && full.meanStickMag >= 0.85 && full.meanRatio != null && full.meanRatio >= 0.75) {
    verdict = 'curve_on_design';
    reason = 'full throw tracks expectWalk (stickMag×2.55); low-end mush is smootherstep+deadzone';
  } else if (low && low.meanStickMag > 0 && low.meanStickMag < 0.25 && low.meanRatio != null && low.meanRatio >= 0.6 && low.meanRatio <= 1.4) {
    verdict = 'curve_on_design_low_end';
    reason = 'at ~0.35 throw, stickMag is small (smootherstep) and speed matches expect — not a wall bug';
  } else if (full && full.meanRawHyp < 0.55) {
    verdict = 'ambiguous_harness_throw';
    reason = 'commanded full throw but pad rawHyp stayed low — mouse/UI under-throw, not product curve proof';
  } else {
    verdict = 'ambiguous';
    reason = 'mixed ratio/mag; morning eyes — no blind curve PR';
  }

  // walk/run line shot changes
  const walkRunShots = shotChanges.filter((c) =>
    /walk|run|still/i.test(c.from) || /walk|run|still/i.test(c.to));

  const finding = {
    head: '027a078',
    code: CODE,
    liveAt,
    runner: runner.name,
    walkConst: WALK,
    deadzone: DZ,
    sampleCount: samples.length,
    durationMs: Date.now() - t0,
    phaseStats,
    shotChangeCount: shotChanges.length,
    walkRunShotChanges: walkRunShots.length,
    shotChanges: shotChanges.slice(0, 24),
    near041rows: samples.filter((r) => r.speed != null && r.speed >= 0.30 && r.speed <= 0.55).slice(0, 12),
    verdict,
    reason,
    openPr: false,
    openPrReason: 'steering: report-only; no blind curve PR tonight',
  };

  note('PHASE_STATS', phaseStats);
  note('SHOT_CHANGES', { total: shotChanges.length, walkRun: walkRunShots.length, sample: shotChanges.slice(0, 12) });
  note('NEAR_041', finding.near041rows);
  note('VERDICT', { verdict, reason, openPr: false });
  await writeFile(path.join(OUT, 'samples.json'), JSON.stringify(samples, null, 2));
  await writeFile(path.join(OUT, 'summary.json'), JSON.stringify(finding, null, 2));
  await writeFile(path.join(ROOT, 'harness', '_warm_out_stick_mag.txt'), log.map((e) => `${e.k} ${typeof e.v === 'string' ? e.v : JSON.stringify(e.v)}`).join('\n'));
  note('DONE', finding);
  } catch (err) {
    note('FATAL', String(err && err.stack || err));
    throw err;
  } finally {
    try { if (browser) await browser.close(); } catch (_) {}
    note('TEARDOWN', 'browser closed');
  }
}

main().catch(async (e) => {
  console.error(e);
  try { appendFileSync(path.join(ROOT, 'harness', '_warm_out_stick_mag_run.txt'), 'FATAL ' + String(e && e.stack || e) + '\n'); } catch (_) {}
  process.exit(1);
});
