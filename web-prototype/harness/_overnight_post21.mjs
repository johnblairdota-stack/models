import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 5178, WS = 5181;
const ABC = 'abcdefghjkmnpqrstuvwxyz';
const CODE = Array.from({ length: 4 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
const OUT = path.join(ROOT, 'progress', 'overnight-post21');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HMR = `const noop=()=>{};export const createHotContext=()=>({accept:noop,acceptExports:noop,dispose:noop,prune:noop,decline:noop,invalidate:noop,on:noop,off:noop,send:noop,data:{}});export const updateStyle=(id,c)=>{let e=document.querySelector('style[data-vite-dev-id="'+id+'"]');if(!e){e=document.createElement('style');e.setAttribute('data-vite-dev-id',id);document.head.appendChild(e);}e.textContent=c;};export const removeStyle=(id)=>{document.querySelector('style[data-vite-dev-id="'+id+'"]')?.remove();};export const injectQuery=(u)=>u;export const ErrorOverlay=class{};`;

async function main() {
  await mkdir(OUT, { recursive: true });
  const log = [];
  const note = (k, v) => { log.push({ k, v }); console.log(k, typeof v === 'string' ? v.slice(0, 500) : JSON.stringify(v).slice(0, 500)); };
  const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-gl=desktop'] });
  note('CODE', CODE);
  const base = `http://127.0.0.1:${WEB}`;
  async function seat(name, viewport) {
    const c = await browser.newContext({ viewport });
    await c.route('**/@vite/client', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: HMR }));
    if (name) await c.addInitScript((n) => localStorage.setItem('rrr.party.name', n), name);
    return c;
  }
  const host = await (await seat(null, { width: 1280, height: 800 })).newPage();
  await host.goto(`${base}/?view=party.host&room=${CODE}&wsPort=${WS}`, { waitUntil: 'domcontentloaded' });
  await host.waitForSelector('.night-code', { timeout: 25000 });
  note('HOST_LOBBY', await host.evaluate(() => document.querySelector('.night-phase')?.textContent));
  const phones = [];
  for (const who of ['Ellie', 'Hai']) {
    const p = await (await seat(who, { width: 390, height: 844 })).newPage();
    await p.goto(`${base}/?view=party.phone&room=${CODE}&wsPort=${WS}`, { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('#lock-look', { timeout: 25000 });
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
      if (!picks.length) throw new Error(name + ': no picks');
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
  await host.waitForSelector('.run-frame', { timeout: 20000 }).catch(() => note('NO_RUN_FRAME', true));
  const samples = [];
  for (let i = 0; i < 28; i++) {
    await host.evaluate(() => document.querySelector('#to-run')?.click());
    const s = await host.evaluate(() => {
      const chrome = document.querySelector('.night-phase')?.textContent || '';
      const body = document.body?.innerText || '';
      const h = window.__rrrHost || {};
      const cam = body.match(/CAMERAS?\s*(\d+)\s*\/\s*(\d+)/i);
      const alm = body.match(/ALARMS?\s*(\d+)/i);
      const m = chrome.match(/episode\s+(\d+)/i);
      return {
        chrome, ep: m ? +m[1] : null, beat: h.beat, episodeField: h.episode, airing: h.airingEpisode,
        cameras: cam ? { unlocked: +cam[1], total: +cam[2] } : null, alarms: alm ? +alm[1] : null,
        mapOnTv: !!document.querySelector('svg.guide-map') || /YOU ARE HERE/i.test(body),
        roleOnTv: /YOU ARE (GOOD|PRODUCTION|EVIL)/i.test(body),
        producerChair: /Producer chair|spike the Hunter/i.test(body),
        caught: /\bCAUGHT\b/.test(body), bodyTop: body.slice(0, 240).replace(/\n/g, ' | '),
      };
    });
    samples.push(s);
    if (i < 5 || i % 5 === 0) note('S' + i, s);
    if (s.beat === 'expedition' && i >= 2) { note('LIVE', s); break; }
    await sleep(1200);
  }
  await host.screenshot({ path: path.join(OUT, 'expedition-tv.png') }).catch(() => {});
  await phones[0].page.screenshot({ path: path.join(OUT, 'expedition-p1.png') }).catch(() => {});
  const phoneMid = await phones[0].page.evaluate(() => {
    const t = document.body?.innerText || '';
    const h1 = document.querySelector('h1')?.textContent || '';
    return { h1, hasTimeHeading: h1 === 'TIME', hasCaught: /\bCAUGHT\b/.test(t), hasGuideMap: !!document.querySelector('svg.guide-map'), top: t.slice(0, 320).replace(/\n/g, ' | ') };
  });
  note('PHONE_MID', phoneMid);
  for (let i = 0; i < 35; i++) {
    const beat = await host.evaluate(() => window.__rrrHost?.beat);
    if (beat === 'recap') break;
    const fr = host.frames().find((f) => f !== host.mainFrame());
    if (fr) {
      await fr.evaluate(() => {
        parent.postMessage({ t: 'follow', world: { runner: { room: 'ballroom', x: 0, y: 0 }, hunter: { room: 'hall', x: 1, y: 0 }, mission: { phase: 'done', room: 'gallery' } } }, '*');
      }).catch(() => {});
    }
    await sleep(600);
  }
  await sleep(1500);
  await host.screenshot({ path: path.join(OUT, 'recap-tv.png') }).catch(() => {});
  await phones[0].page.screenshot({ path: path.join(OUT, 'recap-p1.png') }).catch(() => {});
  const recapTv = await host.evaluate(() => {
    const t = document.body?.innerText || '';
    return {
      beat: window.__rrrHost?.beat, chrome: document.querySelector('.night-phase')?.textContent || '',
      smashed: /\bSMASHED\b/.test(t), time: /\bTIME\b/.test(t), caught: /\bCAUGHT\b/.test(t),
      producerChair: /Producer chair|spike the Hunter/i.test(t),
      mapOnTv: !!document.querySelector('svg.guide-map') || /YOU ARE HERE/i.test(t),
      roleOnTv: /YOU ARE (GOOD|PRODUCTION)/i.test(t), top: t.slice(0, 360).replace(/\n/g, ' | '),
    };
  });
  note('RECAP_TV', recapTv);
  const recapPhone = await phones[0].page.evaluate(() => {
    const t = document.body?.innerText || '';
    const h1 = document.querySelector('h1')?.textContent || '';
    return { h1, timeAsH1: h1 === 'TIME', smashed: h1 === 'SMASHED', caught: /\bCAUGHT\b/.test(t), phonesDown: /Phones down/i.test(t), top: t.slice(0, 360).replace(/\n/g, ' | ') };
  });
  note('RECAP_PHONE', recapPhone);
  const live = samples.filter((s) => s.beat === 'expedition' || /EXPEDITION/i.test(s.chrome || ''));
  const early = live[0] || null;
  const residuals = [];
  if (early && early.alarms != null && early.alarms >= 2) residuals.push('scaffold invent ALARMS>=2');
  if (early && early.cameras && early.cameras.unlocked >= 2) residuals.push('scaffold invent CAMERAS unlocked>=2');
  const eps = [...new Set(live.map((s) => s.ep).filter((n) => n != null))];
  if (eps.some((e) => e !== 1)) residuals.push('episode chrome: ' + JSON.stringify(eps));
  if (phoneMid.hasTimeHeading) residuals.push('phone TIME invent mid-run');
  if (recapTv.caught || recapPhone.caught || phoneMid.hasCaught) residuals.push('CAUGHT appeared');
  if (recapTv.producerChair || samples.some((s) => s.producerChair)) residuals.push('Producer chair');
  if (recapTv.mapOnTv || recapTv.roleOnTv || samples.some((s) => s.mapOnTv || s.roleOnTv)) residuals.push('map/path/roles on TV');
  const verdict = { code: CODE, early, eps, phoneMid, recapTv, recapPhone, residuals, noScaffoldInvent: !(early && ((early.alarms >= 2) || (early.cameras && early.cameras.unlocked >= 2))) };
  note('VERDICT', verdict);
  await writeFile(path.join(OUT, 'findings.json'), JSON.stringify({ verdict, log, samples }, null, 2));
  await browser.close();
  console.log('DONE', JSON.stringify(verdict));
  process.exit(residuals.length ? 3 : 0);
}
main().catch((e) => { console.error('FAIL', e); process.exit(1); });
