#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 5178, WS = 5181;
const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE = Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
const OUT = path.join(ROOT, 'progress', 'overnight-post20');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (page, fn, { timeout = 30000, every = 300 } = {}) => {
  const t0 = Date.now();
  for (;;) {
    try { const v = await page.evaluate(fn); if (v) return v; } catch {}
    if (Date.now() - t0 > timeout) return null;
    await sleep(every);
  }
};

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
  const note = (k, v) => { log.push({ k, v }); console.log(k, typeof v === 'string' ? v.slice(0, 500) : JSON.stringify(v).slice(0, 500)); };

  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-gl=desktop'] });
    note('browser', 'chrome GPU');
  } catch (e) {
    browser = await chromium.launch({ headless: true });
    note('browser', 'fallback ' + e.message);
  }
  note('CODE', CODE);
  const base = `http://127.0.0.1:${WEB}`;

  async function seat(name, viewport) {
    const c = await browser.newContext({ viewport });
    await c.route('**/@vite/client', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: HMR_STUB }));
    if (name) await c.addInitScript((n) => localStorage.setItem('rrr.party.name', n), name);
    return c;
  }

  const tvCtx = await seat(null, { width: 1280, height: 800 });
  const host = await tvCtx.newPage();
  await host.goto(`${base}/?view=party.host&room=${CODE}&wsPort=${WS}`, { waitUntil: 'domcontentloaded' });
  await host.waitForSelector('.night-code', { timeout: 20000 });
  note('HOST_LOBBY', await host.evaluate(() => document.querySelector('.night-phase')?.textContent));

  const phones = [];
  for (const who of ['Ellie', 'Hai', 'Ozz']) {
    const c = await seat(who, { width: 390, height: 844 });
    const p = await c.newPage();
    await p.goto(`${base}/?view=party.phone&room=${CODE}&wsPort=${WS}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#lock-look', { timeout: 20000 });
    await p.click('#lock-look');
    phones.push({ page: p, name: who });
    note('JOIN', who);
  }
  await sleep(900);
  await host.locator('#go').click({ timeout: 20000, force: true });
  note('START', 'ok');
  note('HOST_CASTING', await host.evaluate(() => document.querySelector('.night-phase')?.textContent));

  for (const { page, name } of phones) {
    await page.waitForSelector('#card-done', { state: 'visible', timeout: 30000 });
    await page.click('#card-done', { timeout: 15000 });
    note('CARD_DOWN', name);
  }

  for (const { page, name } of phones) {
    await page.waitForSelector('[data-pick]', { timeout: 20000 });
    for (const step of [0, 1]) {
      const picks = await page.$$('[data-pick]:not([disabled])');
      if (!picks.length) throw new Error(`${name}: no picks`);
      await picks[step === 0 ? 0 : Math.min(1, picks.length - 1)].click({ timeout: 20000 });
      await page.waitForSelector('#lock-pick', { state: 'visible', timeout: 15000 });
      await page.click('#lock-pick', { timeout: 20000 });
      await sleep(250);
    }
    note('CAST', name);
  }
  await sleep(600);
  await host.waitForSelector('#lock:not([disabled])', { timeout: 20000 });
  await host.locator('#lock').click({ timeout: 20000, force: true });
  note('LOCK', 'sent');
  await host.waitForSelector('.run-frame', { timeout: 15000 }).catch(() => {});

  // sample chrome through expedition
  const samples = [];
  for (let i = 0; i < 25; i++) {
    await host.evaluate(() => document.querySelector('#to-run')?.click());
    const s = await host.evaluate(() => {
      const chrome = document.querySelector('.night-phase')?.textContent || '';
      const h = window.__rrrHost || {};
      const m = chrome.match(/episode\s+(\d+)/i);
      return { chrome, ep: m ? +m[1] : null, beat: h.beat, episodeField: h.episode, warmPct: h.warmPct, followMode: h.followMode };
    });
    samples.push(s);
    if (i < 4 || i % 5 === 0) note('S' + i, s);
    if (s.beat === 'expedition' && s.ep != null && i >= 2) { note('LIVE', s); break; }
    await sleep(1500);
  }
  await host.screenshot({ path: path.join(OUT, 'expedition.png') }).catch(() => {});
  const phoneMid = await phones[0].page.evaluate(() => {
    const t = document.body?.innerText || '';
    return { hasTimeHeading: /\bTIME\b/.test(t), hasCaught: /\bCAUGHT\b/.test(t), top: t.slice(0, 280).replace(/\n/g, ' | ') };
  });
  note('PHONE_MID', phoneMid);

  for (let i = 0; i < 30; i++) {
    const beat = await host.evaluate(() => window.__rrrHost?.beat);
    if (beat === 'recap') break;
    const fr = host.frames().find((f) => f !== host.mainFrame());
    if (fr) {
      await fr.evaluate(() => {
        parent.postMessage({
          t: 'follow',
          world: {
            runner: { room: 'ballroom', x: 0, y: 0 },
            hunter: { room: 'hall', x: 1, y: 0 },
            mission: { phase: 'done', room: 'gallery' },
          },
        }, '*');
      }).catch(() => {});
    }
    await sleep(700);
  }
  await sleep(1200);
  await host.screenshot({ path: path.join(OUT, 'recap-tv.png') }).catch(() => {});
  await phones[0].page.screenshot({ path: path.join(OUT, 'recap-p1.png') }).catch(() => {});
  const recapTv = await host.evaluate(() => {
    const t = document.body?.innerText || '';
    const chrome = document.querySelector('.night-phase')?.textContent || '';
    return {
      beat: window.__rrrHost?.beat, episode: window.__rrrHost?.episode, chrome,
      smashed: /\bSMASHED\b/.test(t), time: /\bTIME\b/.test(t), caught: /\bCAUGHT\b/.test(t),
      producerChair: /Producer chair|spike the Hunter/i.test(t),
      mapOnTv: !!document.querySelector('svg.guide-map') || /YOU ARE HERE/i.test(t),
      roleOnTv: /YOU ARE (GOOD|PRODUCTION)/i.test(t),
    };
  });
  note('RECAP_TV', recapTv);
  const recapPhone = await phones[0].page.evaluate(() => {
    const t = document.body?.innerText || '';
    return {
      h1: document.querySelector('h1')?.textContent || '',
      smashed: /\bSMASHED\b/.test(t), time: /\bTIME\b/.test(t), caught: /\bCAUGHT\b/.test(t),
      phonesDown: /Phones down/i.test(t), top: t.slice(0, 360).replace(/\n/g, ' | '),
    };
  });
  note('RECAP_PHONE', recapPhone);

  const live = samples.filter((s) => s.beat === 'expedition' || /EXPEDITION/i.test(s.chrome || ''));
  const eps = [...new Set(live.map((s) => s.ep).filter((n) => n != null))];
  const phoneMidV = log.find((x) => x.k === 'PHONE_MID')?.v;
  const recapTvV = log.find((x) => x.k === 'RECAP_TV')?.v;
  const recapPhoneV = log.find((x) => x.k === 'RECAP_PHONE')?.v;
  const verdict = {
    code: CODE,
    lobby: log.find((x) => x.k === 'HOST_LOBBY')?.v,
    casting: log.find((x) => x.k === 'HOST_CASTING')?.v,
    liveEps: eps,
    fixed: eps.length === 1 && eps[0] === 1,
    stillBroken: eps.includes(2),
    last: samples.at(-1),
    phoneMidNoTimeInvent: phoneMidV && phoneMidV.hasTimeHeading === false,
    recapTv: recapTvV,
    recapPhone: recapPhoneV,
    phoneShowsServerEnd: !!(recapPhoneV && (recapPhoneV.smashed || recapPhoneV.h1 === 'SMASHED' || recapPhoneV.h1 === 'TIME')),
    noCaught: !(recapTvV?.caught || recapPhoneV?.caught),
  };
  note('VERDICT', verdict);
  await writeFile(path.join(OUT, 'findings.json'), JSON.stringify({ verdict, log, samples }, null, 2));
  await browser.close();
  console.log('DONE', JSON.stringify(verdict));
  const ok = verdict.fixed && verdict.noCaught && !verdict.stillBroken;
  process.exit(ok ? 0 : 3);
}
main().catch((e) => { console.error('FAIL', e); process.exit(1); });
