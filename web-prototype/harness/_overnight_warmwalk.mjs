#!/usr/bin/env node
/**
 * Overnight: hunt WARMÂ·WALK stamp on live ready expedition (greenlit residual).
 * Do NOT duplicate #24. No CAUGHT invent; no Producer chair; leave :5184 alone.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 5178, WS = 5181;
const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE = Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
const OUT = path.join(ROOT, 'progress', 'overnight-warmwalk-fix');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HMR_STUB = `const noop = () => {};
export const createHotContext = () => ({ accept: noop, acceptExports: noop, dispose: noop,
  prune: noop, decline: noop, invalidate: noop, on: noop, off: noop, send: noop, data: {} });
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
    console.log(k, typeof v === 'string' ? v.slice(0, 700) : JSON.stringify(v).slice(0, 700));
  };

  let browser;
  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: false,
      });
    note('browser', 'bundled chromium headless');
  } catch (e) {
    browser = await chromium.launch({ headless: true });
    note('browser', 'fallback ' + e.message);
  }
  note('CODE', CODE);
  note('HEAD', 'a73cac7 Merge #24 WARMÂ·WALK');
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
    const phoneTop = await page.evaluate(() => (document.body?.innerText || '').slice(0, 220).replace(/\n/g, ' | '));
    note('CAST', { name, phoneTop });
  }
  await sleep(1200);

  let locked = false;
  for (let i = 0; i < 80; i++) {
    const info = await host.evaluate(() => {
      const b = document.querySelector('#lock');
      const h = window.__rrrHost || {};
      return {
        hasLock: !!b,
        phase: document.querySelector('.night-phase')?.textContent || null,
        beat: h.beat,
        body: (document.body?.innerText || '').slice(0, 320).replace(/\n/g, ' | '),
      };
    });
    if (i === 0 || i % 10 === 0) note('LOCK_POLL_' + i, info);
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

  const midSnaps = [];
  for (let i = 0; i < 12; i++) {
    const s = await host.evaluate(() => {
      const chrome = document.querySelector('.night-phase')?.textContent || '';
      const body = document.body?.innerText || '';
      const h = window.__rrrHost || {};
      const layer = document.querySelector('.follow-layer, [data-follow], iframe');
      const iframes = [...document.querySelectorAll('iframe')];
      let slugText = null;
      let slugOpacity = null;
      let flPre = null;
      let flShot = null;
      let flThr = null;
      let bedMode = null;
      let readout = null;
      for (const f of iframes) {
        try {
          const doc = f.contentDocument;
          if (!doc) continue;
          const fl = doc.querySelector('#fl');
          const slug = doc.querySelector('#fl .slug');
          if (slug) {
            slugText = (slug.textContent || '').replace(/\s+/g, ' ').trim();
            const cs = f.contentWindow.getComputedStyle(slug);
            slugOpacity = cs.opacity;
            flPre = fl?.classList.contains('pre') || false;
            flShot = doc.querySelector('[data-shot]')?.textContent?.trim() || null;
            flThr = doc.querySelector('[data-thr]')?.textContent?.trim() || null;
          }
          const api = f.contentWindow.__rrrFollow || null;
          if (api) {
            bedMode = typeof api.mode === 'function' ? api.mode() : api.mode;
            readout = typeof api.readout === 'function' ? api.readout() : null;
          }
        } catch (_) { /* cross-origin or not ready */ }
      }
      const warmWalkInBody = /WARM\s*[Â·â€¢.]\s*WALK/i.test(body) || /WARM\s+WALK/i.test(body);
      const warmWalkInSlug = !!(slugText && /warm/i.test(slugText) && /walk/i.test(slugText));
      const slugVisible = slugOpacity != null && Number(slugOpacity) > 0.05;
      const warmWalkVisible = warmWalkInSlug && slugVisible;
      return {
        chrome,
        beat: h.beat,
        warm: h.warm,
        warmPct: h.warmPct,
        followLive: h.followLive,
        followMode: h.followMode,
        cameraWarmingSlot: /camera warming/i.test(body),
        runFrameLive: !!document.querySelector('.run-frame.live'),
        slateOpacity: (() => { const el = document.querySelector('.run-slate'); return el ? getComputedStyle(el).opacity : null; })(),
        camLayerLive: !!document.querySelector('.run-cam-layer.live'),
        camLayerWarm: !!document.querySelector('.run-cam-layer.warm'),
        watchTheRunInBody: /WATCH THE RUN/i.test(body),
        producerChair: /Producer chair|spike the Hunter/i.test(body),
        hasCaughtPhoneHint: /\bCAUGHT\b/.test(body),
        slugText,
        slugOpacity,
        flPre,
        flShot,
        flThr,
        bedMode,
        readout,
        warmWalkInBody,
        warmWalkInSlug,
        warmWalkVisible,
        iframeCount: iframes.length,
        bodyTop: body.slice(0, 420).replace(/\n/g, ' | '),
      };
    });
    midSnaps.push(s);
    note('MID_' + i, s);

    const phone = await phones[0].page.evaluate(() => {
      const t = document.body?.innerText || '';
      const h1 = document.querySelector('h1')?.textContent || '';
      return {
        h1,
        hasTimeHeading: h1 === 'TIME' || /^TIME$/m.test(t),
        hasCaught: /\bCAUGHT\b/.test(t),
        hasRun: !!document.querySelector('#run-btn'),
        hasSwing: !!document.querySelector('#swing-btn'),
        padSilent: !document.querySelector('#run-btn') && !document.querySelector('#swing-btn'),
        top: t.slice(0, 280).replace(/\n/g, ' | '),
      };
    });
    note('PHONE_' + i, phone);

    if (i === 1 || i === 5 || i === 11) {
      await host.screenshot({ path: path.join(OUT, `tv-${i}.png`) }).catch(() => {});
      await phones[0].page.screenshot({ path: path.join(OUT, `p1-${i}.png`) }).catch(() => {});
      await phones[1].page.screenshot({ path: path.join(OUT, `p2-${i}.png`) }).catch(() => {});
    }
    await sleep(2200);
  }

  const liveReady = midSnaps.filter((s) => s.beat === 'expedition' && s.warm === 'ready' && s.followLive);
  const warmWalkHits = midSnaps.filter((s) => s.warmWalkInSlug || (s.flShot === 'warm' && s.beat === 'expedition'));
  const residuals = [];
  for (const s of midSnaps) {
    if (s.beat === 'expedition' && s.followLive && s.warm === 'ready' && (s.bedMode === 'warm' || (s.warmWalkVisible ?? (s.warmWalkInSlug && Number(s.slugOpacity) > 0.05)))) {
      residuals.push({ id: 'R-WARM-WALK', sev: 'med', msg: 'WARMÂ·WALK (or shot=warm) on live expedition follow HUD', sample: s });
    }
    if (s.followLive && s.warm === 'ready' && s.beat === 'expedition' && s.cameraWarmingSlot) {
      residuals.push({ id: 'R-CAM-WARM-LIE', sev: 'low', msg: 'CAMERA WARMING slate still in DOM while followLive+ready expedition', sample: s });
    }
    if (s.watchTheRunInBody && s.beat === 'expedition') {
      residuals.push({ id: 'R-WATCH-MID', sev: 'known-#24', msg: 'Watch the run mid-expedition (covered by open #24)', sample: s });
    }
    if (s.producerChair) residuals.push({ id: 'R-PROD', sev: 'skip', msg: 'Producer chair â€” do not patch'});
  }

  const padSilent = [];
  // re-check phones once at end for pad silence on b45f2f9 (#17 covered unless silent)
  for (const { page, name } of phones) {
    const p = await page.evaluate(() => ({
      hasRun: !!document.querySelector('#run-btn'),
      hasSwing: !!document.querySelector('#swing-btn'),
      top: (document.body?.innerText || '').slice(0, 200),
    }));
    if (!p.hasRun && !p.hasSwing) padSilent.push({ name, ...p });
  }

  const verdict = {
    head: 'WARMÂ·WALK hunt on main a73cac7',
    code: CODE,
    liveReadyTicks: liveReady.length,
    warmWalkStampable: warmWalkHits.length > 0,
    warmWalkHits: warmWalkHits.map((s) => ({ flShot: s.flShot, flThr: s.flThr, slugText: s.slugText, flPre: s.flPre, warm: s.warm, followLive: s.followLive, beat: s.beat })),
    padSilentOnExpedition: padSilent,
    residuals: residuals.map((r) => ({ id: r.id, sev: r.sev, msg: r.msg })),
    midSnaps,
  };
  note('VERDICT', verdict);
  await writeFile(path.join(OUT, 'findings.json'), JSON.stringify({ verdict, log }, null, 2));
  await browser.close();
  console.log('DONE', JSON.stringify({
    warmWalkStampable: verdict.warmWalkStampable,
    liveReadyTicks: verdict.liveReadyTicks,
    residuals: verdict.residuals.map((r) => r.id),
    padSilent: padSilent.length,
  }));
}

main().catch(async (e) => {
  console.error('FATAL', e);
  process.exit(1);
});

