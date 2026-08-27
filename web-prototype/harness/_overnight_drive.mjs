#!/usr/bin/env node
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 5178;
const OUT = path.join(ROOT, 'progress', 'overnight-post14');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  await mkdir(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false, timeout: 10000 }).catch(async (e) => { console.log('shot fail', name, e.message); await writeFile(path.join(OUT, name + '.txt'), await page.evaluate(() => document.body?.innerText?.slice(0,3000) || 'empty')); });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const host = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const p1 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const p2 = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await host.goto(`http://127.0.0.1:${WEB}/?view=party.host`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p1.goto(`http://127.0.0.1:${WEB}/?view=party.phone`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p2.goto(`http://127.0.0.1:${WEB}/?view=party.phone`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(2500);
  console.log('H0', await host.evaluate(() => document.body?.innerText?.slice(0,800) || 'empty'));
  console.log('P10', await p1.evaluate(() => document.body?.innerText?.slice(0,800) || 'empty'));
  await shot(host, '01-host');
  await shot(p1, '01-p1');
  await shot(p2, '01-p2');

  let hostText = await host.evaluate(() => document.body?.innerText || '');
  console.log('HOST:\n' + hostText.slice(0, 1200));
  for (const label of ['New room', 'Open room', 'Start night', 'Start', 'Begin', 'Create', 'Open']) {
    const b = host.locator(`button:has-text("${label}")`);
    if (await b.count()) {
      console.log('click host', label);
      await b.first().click().catch(() => {});
      await sleep(1000);
    }
  }
  hostText = await host.evaluate(() => document.body?.innerText || '');
  let code = null;
  const m2 = hostText.match(/\b([abcdefghjkmnpqrstuvwxyz]{4})\b/i);
  if (m2) code = m2[1].toLowerCase();
  console.log('code', code, 'HOST2:\n' + hostText.slice(0, 800));

  async function join(page, name, tag) {
    await sleep(400);
    const body0 = await page.evaluate(() => document.body?.innerText || '');
    console.log(tag + ' PRE:\n' + body0.slice(0, 500));
    const inputs = page.locator('input:visible');
    const n = await inputs.count();
    console.log(tag, 'inputs', n);
    if (n >= 1 && code) await inputs.nth(0).fill(code).catch(() => {});
    if (n >= 2) await inputs.nth(1).fill(name).catch(() => {});
    for (let i = 0; i < n; i++) {
      const el = inputs.nth(i);
      const ph = `${await el.getAttribute('placeholder') || ''} ${await el.getAttribute('name') || ''}`;
      if (/name/i.test(ph)) await el.fill(name);
      else if (/code|room/i.test(ph) && code) await el.fill(code);
    }
    const btns = page.locator('button');
    const bc = await btns.count();
    for (let i = 0; i < bc; i++) {
      const t = (await btns.nth(i).innerText().catch(() => '')) || '';
      if (/join|enter|sit|go|play/i.test(t)) {
        console.log(tag, 'click', t);
        await btns.nth(i).click().catch(() => {});
        break;
      }
    }
    await sleep(1500);
    await shot(page, `${tag}-joined`);
    const body = await page.evaluate(() => document.body?.innerText || '');
    console.log(tag + ' POST:\n' + body.slice(0, 700));
  }

  if (code) {
    await join(p1, 'Ada', '02-p1');
    await join(p2, 'Ben', '02-p2');
  } else {
    console.log('NO CODE html', await p1.evaluate(() => document.body?.innerHTML?.slice(0, 1500)));
  }

  await sleep(2000);
  await shot(host, '03-host-seated');
  const leak = await host.evaluate(() => {
    const t = document.body?.innerText || '';
    return {
      hasGuideMap: !!document.querySelector('svg.guide-map, .guide-map'),
      hunterPath: /hunter path|HUNTER HEARS|blindStrip/i.test(t),
      roleCard: /Hold to read|Your card/i.test(t),
      recapBtn: /\bRecap\b/i.test(t),
      text: t.slice(0, 1800),
    };
  });
  console.log('LEAK', JSON.stringify(leak, null, 2));

  for (const [page, tag] of [[p1, 'p1'], [p2, 'p2']]) {
    const btns = page.locator('button');
    const bc = await btns.count();
    const labels = [];
    for (let i = 0; i < bc; i++) labels.push(await btns.nth(i).innerText().catch(() => ''));
    console.log(tag, 'buttons', labels);
    for (let i = 0; i < bc; i++) {
      const t = labels[i] || '';
      if (/Ada|Ben|Runner|Guide|Nominate|Lock/i.test(t)) {
        await btns.nth(i).click().catch(() => {});
        await sleep(400);
      }
    }
    await shot(page, `04-${tag}-cast`);
  }

  await sleep(1500);
  for (const label of ['Watch the run', 'Start', 'Lock in', 'Begin night', 'Go']) {
    const b = host.locator(`button:has-text("${label}")`);
    if (await b.count()) {
      console.log('host', label);
      await b.first().click().catch(() => {});
      await sleep(2000);
    }
  }
  await shot(host, '05-host');
  await shot(p1, '05-p1');
  await shot(p2, '05-p2');
  await sleep(10000);
  await shot(host, '06-host-run');
  await shot(p1, '06-p1-run');
  await shot(p2, '06-p2-run');

  const summary = {
    host: await host.evaluate(() => document.body?.innerText?.slice(0, 2500)),
    p1: await p1.evaluate(() => document.body?.innerText?.slice(0, 2500)),
    p2: await p2.evaluate(() => document.body?.innerText?.slice(0, 2500)),
    p1win: await p1.evaluate(() => window.__rrrPhone || null),
    p2win: await p2.evaluate(() => window.__rrrPhone || null),
    leak,
  };
  await writeFile(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log('DONE', OUT);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
