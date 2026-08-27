#!/usr/bin/env node
/**
 * Overnight stick29 — STICK→WORLD proof on main e8f60d4+.
 * Instrument __rrrFollow speed/pos/throttle while driving stick+RUN.
 * Do NOT paper over stuck runner with chrome. Leave :5184 alone.
 * Honesty PR only if chrome invents running/chase while bed STILL/speed≈0 AFTER stick proven.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 5178, WS = 5181;
const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE = Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
const OUT = path.join(ROOT, 'progress', 'overnight-stick29');
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
    console.log(k, typeof v === 'string' ? v.slice(0, 1100) : JSON.stringify(v).slice(0, 1100));
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
  note('HEAD', 'e8f60d4 stick29 stick→world');
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

  // Ballot: both pick Ada runner then Ben guide
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

  // Wait live+ready+bedMode run
  let liveAt = null;
  for (let i = 0; i < 90; i++) {
    const s = await sampleFollow(host);
    if (s.beat === 'expedition' && s.warm === 'ready' && s.followLive && s.bedMode === 'run') {
      liveAt = { i, ...s, ms: Date.now() };
      break;
    }
    if (i % 10 === 0) note('LIVE_POLL_' + i, s);
    await sleep(500);
  }
  note('LIVE_READY', liveAt || 'timeout');
  if (!liveAt) throw new Error('never reached followLive+ready+bedMode=run');

  // Roles
  const roles = [];
  for (const { page, name } of phones) {
    const r = await page.evaluate((n) => {
      const ph = window.__rrrPhone || {};
      return {
        name: n,
        iAmRunner: !!ph.iAmRunner,
        iAmGuide: !!ph.iAmGuide,
        hasRunBtn: !!document.querySelector('#run-btn'),
        hasStick: !!document.querySelector('#stick'),
        h1: document.querySelector('h1')?.textContent?.trim() || '',
      };
    }, name);
    roles.push(r);
  }
  note('ROLES', roles);
  const runner = phones.find((p, i) => roles[i]?.iAmRunner) || phones[0];

  // ---- BASELINE (may still be scripted schedule — driven=false until first stick)
  const baseline = [];
  for (let i = 0; i < 4; i++) {
    baseline.push(await sampleFollow(host));
    await sleep(400);
  }
  note('BASELINE', baseline.map(compactBed));
  await host.screenshot({ path: path.join(OUT, 'tv-baseline.png') }).catch(() => {});
  await runner.page.screenshot({ path: path.join(OUT, 'runner-baseline.png') }).catch(() => {});

  // ---- STICK+RUN hold (real mouse — setPointerCapture needs genuine pointer stream)
  const stickEl = await runner.page.$('#stick');
  const runBtn = await runner.page.$('#run-btn');
  if (!stickEl || !runBtn) throw new Error('runner missing #stick or #run-btn');

  const stickBox = await stickEl.boundingBox();
  const runBox = await runBtn.boundingBox();
  if (!stickBox || !runBox) throw new Error('no bounding boxes for stick/run');

  const scx = stickBox.x + stickBox.width / 2;
  const scy = stickBox.y + stickBox.height / 2;
  const before = await sampleFollow(host);
  note('BEFORE_STICK', compactBed(before));

  // Hold RUN first
  await runner.page.mouse.move(runBox.x + runBox.width / 2, runBox.y + runBox.height / 2);
  await runner.page.mouse.down();
  await sleep(120);

  // Drag stick forward (screen up = +y forward in fromEvent)
  await runner.page.mouse.move(scx, scy);
  // release run briefly? No — need both. Playwright has one mouse.
  // Use pointer events on stick WHILE keeping run via evaluate state OR
  // alternate: hold stick with mouse, set run via page evaluate + sendPad.
  // Better: use locator dispatch with pointerId for run AND mouse for stick.
  await runner.page.mouse.up(); // release run mouse so we can drag stick

  // Hold RUN via pointerdown dispatch (button stays "held" until pointerup)
  await runBtn.dispatchEvent('pointerdown');
  await sleep(80);

  await runner.page.mouse.move(scx, scy);
  await runner.page.mouse.down();
  // Forward = screen up = smaller clientY
  await runner.page.mouse.move(scx, scy - stickBox.height * 0.42, { steps: 6 });

  const during = [];
  let maxSpeed = 0;
  let maxMove = 0;
  let sawRunThr = false;
  let sawWalkThr = false;
  for (let i = 0; i < 24; i++) {
    // Keep nudging stick + re-assert run in case capture dropped
    if (i % 6 === 5) {
      await runner.page.mouse.move(scx + (i % 2 ? 8 : -8), scy - stickBox.height * 0.42, { steps: 2 });
      await runBtn.dispatchEvent('pointerdown');
    }
    const s = await sampleFollow(host);
    during.push(s);
    const move = Math.hypot((s.posX ?? 0) - (before.posX ?? 0), (s.posZ ?? 0) - (before.posZ ?? 0));
    if ((s.speed ?? 0) > maxSpeed) maxSpeed = s.speed;
    if (move > maxMove) maxMove = move;
    if (s.throttle === 'RUN') sawRunThr = true;
    if (s.throttle === 'WALK') sawWalkThr = true;
    if (i === 0 || i === 8 || i === 16 || i === 23) note('DURING_' + i, compactBed(s));
    if (move > 1.2 && (s.speed ?? 0) > 0.3) {
      // proven early — keep a few more samples
      if (i >= 10) break;
    }
    await sleep(450);
  }
  await host.screenshot({ path: path.join(OUT, 'tv-during-stick.png') }).catch(() => {});
  await runner.page.screenshot({ path: path.join(OUT, 'runner-during-stick.png') }).catch(() => {});

  // Phone pad confirm mid-hold
  const padMid = await runner.page.evaluate(() => {
    const ph = window.__rrrPhone || {};
    return {
      pad: ph.pad || null,
      stickOn: !!document.querySelector('#stick')?.classList.contains('on'),
      runOn: !!document.querySelector('#run-btn')?.classList.contains('on'),
      nub: document.querySelector('[data-nub]')?.style?.transform || '',
    };
  });
  note('PAD_MID', padMid);

  await runner.page.mouse.up();
  await runBtn.dispatchEvent('pointerup');
  await sleep(900);

  // ---- AFTER RELEASE: expect STILL / speed≈0 once driven
  const after = [];
  for (let i = 0; i < 8; i++) {
    after.push(await sampleFollow(host));
    await sleep(400);
  }
  note('AFTER_RELEASE', after.map(compactBed));
  await host.screenshot({ path: path.join(OUT, 'tv-after-release.png') }).catch(() => {});

  // ---- RUN-only hold (no stick) — if driven, should stay STILL
  await runBtn.dispatchEvent('pointerdown');
  await sleep(1000);
  const runOnly = await sampleFollow(host);
  await runBtn.dispatchEvent('pointerup');
  note('RUN_ONLY', compactBed(runOnly));

  // Verdict
  const stickWorld =
    maxMove > 1.0 && maxSpeed > 0.4 && (sawRunThr || sawWalkThr);
  const harnessOnlyFail =
    !stickWorld && (!padMid.stickOn && !(padMid.pad && (Math.abs(padMid.pad.x) > 0.1 || Math.abs(padMid.pad.y) > 0.1)));

  const stillTicks = after.filter((s) => s.throttle === 'STILL' || (s.speed ?? 0) < 0.15);
  const speed0After = after.filter((s) => (s.speed ?? 0) < 0.15);
  const chromeLieCandidates = [];
  for (const s of [...during, ...after]) {
    const inventRunWhileStill =
      (s.throttle === 'STILL' || (s.speed ?? 0) < 0.12) &&
      !!(s.slugText && /chase/i.test(s.slugText) && /run/i.test(s.slugText) && s.slugOpacity !== '0');
    const inventRunningWord =
      (s.throttle === 'STILL' || (s.speed ?? 0) < 0.12) &&
      /is running/i.test(s.bodyTop || '') &&
      /chase\s*[·.]\s*run/i.test(s.slugText || '');
    // Note: host "Ada is running" alone is cast copy (Ada = runner), not motion chrome.
    if (inventRunWhileStill || inventRunningWord) {
      chromeLieCandidates.push({
        inventRunWhileStill,
        inventRunningWord,
        throttle: s.throttle,
        speed: s.speed,
        slugText: s.slugText,
        slugOpacity: s.slugOpacity,
        bodyTop: (s.bodyTop || '').slice(0, 200),
      });
    }
  }

  // Stricter honesty: after release, STILL+speed0 but slug shows chase·run (not walk)
  const afterStill = after.filter((s) => s.throttle === 'STILL' || (s.speed ?? 0) < 0.12);
  const lieAfterRelease = afterStill.filter((s) =>
    s.slugText && /chase/i.test(s.slugText) && /\brun\b/i.test(s.slugText) && s.slugOpacity !== '0');

  const honestyPR = stickWorld && lieAfterRelease.length > 0;

  const verdict = {
    head: 'stick29 stick→world on e8f60d4',
    code: CODE,
    liveAt: liveAt ? { i: liveAt.i, warm: liveAt.warm, bedMode: liveAt.bedMode, followLive: liveAt.followLive } : null,
    roles,
    stickWorldProven: stickWorld,
    harnessOnlyFail,
    maxMoveM: +maxMove.toFixed(3),
    maxSpeed: +maxSpeed.toFixed(3),
    sawRunThr,
    sawWalkThr,
    padMid,
    before: compactBed(before),
    duringSample: during.filter((_, i) => i % 4 === 0).map(compactBed),
    afterSample: after.map(compactBed),
    runOnly: compactBed(runOnly),
    stillTicksAfter: stillTicks.length,
    speed0After: speed0After.length,
    chromeLieCandidates: chromeLieCandidates.slice(0, 8),
    lieAfterRelease: lieAfterRelease.map(compactBed),
    honestyPRRecommended: honestyPR,
    noteHonesty:
      'Host "Ada is running" alone is cast lower-third (Ada=runner), not motion. Honesty PR only if slug invents chase·run while STILL/speed0 after stick proven.',
    pushbacks: ['smash→recap #3', 'CAUGHT', 'Producer'],
  };
  note('VERDICT', verdict);
  await writeFile(path.join(OUT, 'findings.json'), JSON.stringify({ verdict, log, during: during.map(compactBed), after: after.map(compactBed), baseline: baseline.map(compactBed) }, null, 2));
  await writeFile(path.join(OUT, 'stick29.txt'), log.map((l) => `${l.k} ${typeof l.v === 'string' ? l.v : JSON.stringify(l.v)}`).join('\n'));
  await browser.close();
  console.log('DONE', JSON.stringify({
    stickWorldProven: stickWorld,
    harnessOnlyFail,
    maxMoveM: verdict.maxMoveM,
    maxSpeed: verdict.maxSpeed,
    honestyPRRecommended: honestyPR,
    lieAfterRelease: lieAfterRelease.length,
  }));
}

function compactBed(s) {
  if (!s) return null;
  return {
    beat: s.beat, warm: s.warm, followLive: s.followLive, bedMode: s.bedMode,
    throttle: s.throttle, speed: s.speed, posX: s.posX, posZ: s.posZ, facing: s.facing,
    slugText: s.slugText, slugOpacity: s.slugOpacity, flShot: s.flShot, flThr: s.flThr,
    cameraWarming: s.cameraWarming, bodyTop: (s.bodyTop || '').slice(0, 220),
  };
}

async function sampleFollow(host) {
  return host.evaluate(() => {
    const h = window.__rrrHost || {};
    const body = document.body?.innerText || '';
    const chrome = document.querySelector('.night-phase')?.textContent || '';
    let slugText = null, flShot = null, flThr = null, bedMode = null;
    let throttle = null, speed = null, posX = null, posZ = null, facing = null, slugOpacity = null;
    for (const f of document.querySelectorAll('iframe')) {
      try {
        const doc = f.contentDocument;
        const slug = doc?.querySelector('#fl .slug');
        if (slug) {
          slugText = (slug.textContent || '').replace(/\s+/g, ' ').trim();
          slugOpacity = getComputedStyle(slug).opacity;
          flShot = doc.querySelector('[data-shot]')?.textContent?.trim() || null;
          flThr = doc.querySelector('[data-thr]')?.textContent?.trim() || null;
        }
        const api = f.contentWindow?.__rrrFollow;
        if (api) {
          bedMode = typeof api.mode === 'function' ? api.mode() : api.mode;
          const r = typeof api.readout === 'function' ? api.readout() : null;
          if (r) { throttle = r.throttle; speed = r.speed; }
          if (api.runner?.pos) {
            posX = +api.runner.pos.x;
            posZ = +api.runner.pos.z;
            facing = api.runner.facing;
          }
        }
      } catch (_) {}
    }
    return {
      chrome, beat: h.beat, warm: h.warm, followLive: h.followLive, followMode: h.followMode,
      bedMode, throttle, speed, posX, posZ, facing, slugText, slugOpacity, flShot, flThr,
      cameraWarming: /camera warming/i.test(body),
      bodyTop: body.slice(0, 420).replace(/\n/g, ' | '),
    };
  });
}

main().catch(async (e) => {
  console.error('FAIL', e);
  try {
    const { writeFile, mkdir } = await import('node:fs/promises');
    await mkdir(OUT, { recursive: true });
    await writeFile(path.join(OUT, 'fail.txt'), String(e?.stack || e));
  } catch (_) {}
  process.exit(1);
});
